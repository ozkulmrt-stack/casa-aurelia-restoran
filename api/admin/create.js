const { isAuthorized } = require("./_auth");

// Same 30-minute seating grid enforced by the public create_reservation()
// RPC (19:30–22:00). The override path skips capacity/Monday/date-window
// checks but MUST still land on one of these — otherwise the row is
// invisible to every slot's capacity SUM (which matches on exact time)
// and the room can be silently overbooked while the RPC still reports space.
const VALID_TIMES = ["19:30", "20:00", "20:30", "21:00", "21:30", "22:00"];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "method_not_allowed" });
  if (!(await isAuthorized(req))) return res.status(401).json({ error: "unauthorized" });

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL || !SERVICE_KEY) return res.status(500).json({ error: "server_misconfigured" });

  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      body = {};
    }
  }
  body = body || {};

  const name = typeof body.name === "string" ? body.name.trim() : "";
  const phone = typeof body.phone === "string" ? body.phone.trim() : "";
  const date = typeof body.date === "string" ? body.date : "";
  const time = typeof body.time === "string" ? body.time : "";
  const partySize = Number(body.partySize);
  const override = body.override === true;

  if (!name || name.length > 100) return res.status(400).json({ error: "invalid_name" });
  if (!phone || phone.length > 30) return res.status(400).json({ error: "invalid_phone" });
  if (!DATE_RE.test(date)) return res.status(400).json({ error: "invalid_date" });
  if (!VALID_TIMES.includes(time)) return res.status(400).json({ error: "invalid_time" });
  if (!Number.isInteger(partySize) || partySize < 1 || partySize > 20) {
    return res.status(400).json({ error: "invalid_party_size" });
  }

  const authHeaders = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` };

  if (!override) {
    try {
      const upstream = await fetch(`${SUPABASE_URL}/rest/v1/rpc/create_reservation`, {
        method: "POST",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({
          p_name: name,
          p_phone: phone,
          p_date: date,
          p_time: time,
          p_party_size: partySize,
        }),
      });
      if (!upstream.ok) {
        console.error("admin/create RPC upstream error:", upstream.status, await upstream.text());
        return res.status(502).json({ error: "upstream_error" });
      }
      const data = await upstream.json();
      if (data && data.success) return res.status(200).json({ success: true, id: data.id });
      // Business-rule rejection (full/closed/invalid_date/...) — not a server
      // error. The admin UI decides whether to offer "add anyway".
      return res.status(200).json({ success: false, reason: data && data.reason });
    } catch (err) {
      console.error("admin/create RPC path failed:", err);
      return res.status(500).json({ error: "internal_error" });
    }
  }

  // ---- Override: bypass capacity/Monday/date-window, but never the grid ----
  // Columns are whitelisted explicitly — req.body is never forwarded as-is,
  // so a caller can't set id/created_at/status through this endpoint.
  const insertPayload = {
    customer_name: name,
    phone,
    reservation_date: date,
    reservation_time: time,
    party_size: partySize,
    status: "confirmed",
  };

  try {
    const upstream = await fetch(`${SUPABASE_URL}/rest/v1/reservations`, {
      method: "POST",
      headers: { ...authHeaders, "Content-Type": "application/json", Prefer: "return=representation" },
      body: JSON.stringify(insertPayload),
    });
    if (!upstream.ok) {
      console.error("admin/create override upstream error:", upstream.status, await upstream.text());
      return res.status(502).json({ error: "upstream_error" });
    }
    const data = await upstream.json();
    if (!Array.isArray(data) || data.length === 0) return res.status(502).json({ error: "upstream_error" });
    res.status(200).json({ success: true, id: data[0].id, overridden: true });
  } catch (err) {
    console.error("admin/create override path failed:", err);
    res.status(500).json({ error: "internal_error" });
  }
};
