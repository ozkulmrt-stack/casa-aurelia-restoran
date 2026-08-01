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
  const id = body && body.id;
  if (!id || typeof id !== "string") return res.status(400).json({ error: "missing_id" });

  try {
    const upstream = await fetch(`${SUPABASE_URL}/rest/v1/reservations?id=eq.${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify({ status: "cancelled" }),
    });
    if (!upstream.ok) {
      console.error("admin/cancel upstream error:", upstream.status, await upstream.text().catch(() => ""));
      return res.status(502).json({ error: "upstream_error" });
    }
    const data = await upstream.json();
    if (!Array.isArray(data) || data.length === 0) return res.status(404).json({ error: "not_found" });
    res.status(200).json({ success: true, reservation: data[0] });
  } catch (err) {
    console.error("admin/cancel failed:", err);
    res.status(500).json({ error: "internal_error" });
  }
};
