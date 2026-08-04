const { isAuthorized } = require("./_auth");

module.exports = async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "method_not_allowed" });
  if (!(await isAuthorized(req))) return res.status(401).json({ error: "unauthorized" });

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL || !SERVICE_KEY) return res.status(500).json({ error: "server_misconfigured" });

  const dateFilter = typeof req.query.date === "string" ? req.query.date : null;
  const params = new URLSearchParams();
  params.set("select", "id,customer_name,phone,email,reservation_date,reservation_time,party_size,status,created_at");
  params.set("order", "reservation_date.asc,reservation_time.asc");
  params.set(
    "reservation_date",
    dateFilter ? `eq.${dateFilter}` : `gte.${new Date().toISOString().slice(0, 10)}`
  );

  const authHeaders = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` };

  try {
    const [reservationsRes, settingsRes] = await Promise.all([
      fetch(`${SUPABASE_URL}/rest/v1/reservations?${params.toString()}`, { headers: authHeaders }),
      fetch(`${SUPABASE_URL}/rest/v1/restaurant_settings?id=eq.1&select=max_guests_per_slot`, {
        headers: authHeaders,
      }),
    ]);

    if (!reservationsRes.ok || !settingsRes.ok) {
      console.error(
        "admin/reservations upstream error:",
        reservationsRes.status,
        await reservationsRes.text().catch(() => ""),
        settingsRes.status,
        await settingsRes.text().catch(() => "")
      );
      return res.status(502).json({ error: "upstream_error" });
    }

    const reservations = await reservationsRes.json();
    const settingsRows = await settingsRes.json();
    const maxGuestsPerSlot =
      Array.isArray(settingsRows) && settingsRows[0] ? settingsRows[0].max_guests_per_slot : null;

    res.status(200).json({ reservations, maxGuestsPerSlot });
  } catch (err) {
    console.error("admin/reservations failed:", err);
    res.status(500).json({ error: "internal_error" });
  }
};
