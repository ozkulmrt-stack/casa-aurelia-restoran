const { isAuthorized } = require("./_auth");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "method_not_allowed" });
  if (!isAuthorized(req)) return res.status(401).json({ error: "unauthorized" });

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
  const maxGuestsPerSlot = Number(body && body.maxGuestsPerSlot);
  if (!Number.isInteger(maxGuestsPerSlot) || maxGuestsPerSlot < 1 || maxGuestsPerSlot > 500) {
    return res.status(400).json({ error: "invalid_capacity" });
  }

  try {
    const upstream = await fetch(`${SUPABASE_URL}/rest/v1/restaurant_settings?id=eq.1`, {
      method: "PATCH",
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      // updated_at has a default but no trigger — must be set explicitly
      // or it stays frozen at whatever it was seeded with.
      body: JSON.stringify({ max_guests_per_slot: maxGuestsPerSlot, updated_at: new Date().toISOString() }),
    });
    if (!upstream.ok) return res.status(502).json({ error: "upstream_error" });
    const data = await upstream.json();
    // A missed id=eq.1 (row deleted/renumbered) would otherwise be a silent 200.
    if (!Array.isArray(data) || data.length === 0) return res.status(404).json({ error: "not_found" });
    res.status(200).json({ success: true, maxGuestsPerSlot: data[0].max_guests_per_slot });
  } catch (err) {
    res.status(500).json({ error: "internal_error" });
  }
};
