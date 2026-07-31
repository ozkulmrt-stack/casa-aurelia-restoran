// Shared Basic-auth check for admin endpoints (email + password).
//
// Security notes (see plan for full reasoning):
// - Single SHA-256 digest over "email\0password" (not two separate
//   timingSafeEqual calls) so a short-circuiting && can't leak which half
//   was wrong via timing.
// - Both ADMIN_EMAIL and ADMIN_PASSWORD must be non-empty, or auth is
//   unconditionally denied — otherwise an unset ADMIN_EMAIL lets an
//   attacker send "Basic base64(':' + password)" and pass the email half
//   via matching empty-string hashes.
// - Both sides run through NFC normalization: Turkish input is a real
//   trap here ('İ'.toLowerCase() → 'i' + U+0307 combining dot, and macOS
//   can hand over NFD-composed text either way).
const crypto = require("crypto");

function parseBasicAuth(header) {
  const match = /^Basic\s+(.+)$/.exec(header || "");
  if (!match) return null;
  let decoded;
  try {
    decoded = Buffer.from(match[1], "base64").toString("utf8");
  } catch {
    return null;
  }
  const sep = decoded.indexOf(":");
  if (sep === -1) return null;
  // Per RFC 7617, only the userid is colon-free; the password may contain
  // colons, so split on the FIRST colon only.
  return {
    email: decoded.slice(0, sep),
    password: decoded.slice(sep + 1),
  };
}

function isAuthorized(req) {
  const creds = parseBasicAuth(req.headers["authorization"]);
  if (!creds) return false;

  const expectedEmail = (process.env.ADMIN_EMAIL || "").trim().toLowerCase().normalize("NFC");
  const expectedPassword = (process.env.ADMIN_PASSWORD || "").normalize("NFC");
  if (!expectedEmail || !expectedPassword) return false;

  const providedEmail = creds.email.trim().toLowerCase().normalize("NFC");
  const providedPassword = creds.password.normalize("NFC");

  const provided = crypto.createHash("sha256").update(`${providedEmail}\0${providedPassword}`).digest();
  const target = crypto.createHash("sha256").update(`${expectedEmail}\0${expectedPassword}`).digest();
  return crypto.timingSafeEqual(provided, target);
}

module.exports = { isAuthorized };
