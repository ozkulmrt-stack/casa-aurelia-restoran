// Shared auth check for admin endpoints, backed by Supabase Auth.
//
// The client signs in against Supabase's password grant and sends the
// resulting access token as "Authorization: Bearer <token>". We verify it
// by asking Supabase's own /auth/v1/user endpoint to resolve it — this
// avoids needing the JWT signing secret locally and stays correct across
// Supabase's own token rotation/expiry rules.
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function parseBearerToken(header) {
  const match = /^Bearer\s+(.+)$/.exec(header || "");
  return match ? match[1] : null;
}

async function isAuthorized(req) {
  const token = parseBearerToken(req.headers["authorization"]);
  if (!token || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return false;

  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${token}`,
      },
    });
    return res.ok;
  } catch {
    return false;
  }
}

module.exports = { isAuthorized };
