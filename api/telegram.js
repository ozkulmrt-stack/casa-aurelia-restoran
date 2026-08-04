// Telegram webhook: komutlar (/bugun, /yarin, /tarih) ve inline "İptal Et" butonu.
// Bildirimler (yeni rezervasyon / iptal) burada değil, Supabase'deki
// notify_telegram_reservation() trigger'ında gönderiliyor (bkz. supabase/schema.sql).

const DAY_NAMES_TR = ["Pazar", "Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi"];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function formatDateTr(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${d} ${m}. ay ${y} ${DAY_NAMES_TR[dow]}`;
}

function toISODate(date) {
  return date.toISOString().slice(0, 10);
}

async function telegramCall(token, method, payload) {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    console.error(`telegram ${method} failed:`, res.status, await res.text().catch(() => ""));
  }
  return res;
}

async function fetchReservationsForDate(supabaseUrl, serviceKey, dateStr) {
  const url =
    `${supabaseUrl}/rest/v1/reservations?reservation_date=eq.${dateStr}` +
    `&status=eq.confirmed&order=reservation_time.asc` +
    `&select=id,customer_name,phone,email,reservation_time,party_size`;
  const res = await fetch(url, {
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
  });
  if (!res.ok) throw new Error(`reservations fetch failed: ${res.status}`);
  return res.json();
}

function formatReservationList(dateStr, rows) {
  const header = `📅 *${formatDateTr(dateStr)}*`;
  if (rows.length === 0) return `${header}\n\nBu tarihte rezervasyon yok.`;
  const total = rows.reduce((sum, r) => sum + r.party_size, 0);
  const lines = rows.map(
    (r) =>
      `🕗 ${r.reservation_time.slice(0, 5)} — ${r.customer_name} (${r.party_size} kişi) 📞 ${r.phone} 📧 \`${r.email || "—"}\``
  );
  return `${header} — toplam ${total} kişi\n\n${lines.join("\n")}`;
}

async function cancelReservation(supabaseUrl, serviceKey, id) {
  const res = await fetch(`${supabaseUrl}/rest/v1/reservations?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify({ status: "cancelled" }),
  });
  if (!res.ok) return null;
  const data = await res.json();
  return Array.isArray(data) && data.length > 0 ? data[0] : null;
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "method_not_allowed" });

  const WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET;
  const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
  const CHAT_ID = process.env.TELEGRAM_CHAT_ID;
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!WEBHOOK_SECRET || !BOT_TOKEN || !CHAT_ID || !SUPABASE_URL || !SERVICE_KEY) {
    return res.status(500).json({ error: "server_misconfigured" });
  }

  if (req.headers["x-telegram-bot-api-secret-token"] !== WEBHOOK_SECRET) {
    return res.status(401).json({ error: "unauthorized" });
  }

  let update = req.body;
  if (typeof update === "string") {
    try {
      update = JSON.parse(update);
    } catch {
      update = {};
    }
  }
  update = update || {};

  try {
    if (update.callback_query) {
      const cb = update.callback_query;
      const chatId = cb.message && cb.message.chat && cb.message.chat.id;
      if (String(chatId) !== String(CHAT_ID)) {
        await telegramCall(BOT_TOKEN, "answerCallbackQuery", { callback_query_id: cb.id });
        return res.status(200).json({ ok: true });
      }

      const data = cb.data || "";

      if (data.startsWith("cancel:")) {
        const id = data.slice("cancel:".length);
        await telegramCall(BOT_TOKEN, "editMessageReplyMarkup", {
          chat_id: chatId,
          message_id: cb.message.message_id,
          reply_markup: {
            inline_keyboard: [
              [
                { text: "✅ Evet, iptal et", callback_data: `confirm_cancel:${id}` },
                { text: "↩️ Vazgeç", callback_data: `abort_cancel:${id}` },
              ],
            ],
          },
        });
        await telegramCall(BOT_TOKEN, "answerCallbackQuery", { callback_query_id: cb.id, text: "Emin misin?" });
      } else if (data.startsWith("confirm_cancel:")) {
        const id = data.slice("confirm_cancel:".length);
        const cancelled = await cancelReservation(SUPABASE_URL, SERVICE_KEY, id);
        if (cancelled) {
          await telegramCall(BOT_TOKEN, "editMessageReplyMarkup", {
            chat_id: chatId,
            message_id: cb.message.message_id,
            reply_markup: { inline_keyboard: [] },
          });
          await telegramCall(BOT_TOKEN, "answerCallbackQuery", {
            callback_query_id: cb.id,
            text: "Rezervasyon iptal edildi.",
          });
        } else {
          await telegramCall(BOT_TOKEN, "answerCallbackQuery", {
            callback_query_id: cb.id,
            text: "İptal edilemedi (kayıt bulunamadı).",
            show_alert: true,
          });
        }
      } else if (data.startsWith("abort_cancel:")) {
        const id = data.slice("abort_cancel:".length);
        await telegramCall(BOT_TOKEN, "editMessageReplyMarkup", {
          chat_id: chatId,
          message_id: cb.message.message_id,
          reply_markup: {
            inline_keyboard: [[{ text: "❌ İptal Et", callback_data: `cancel:${id}` }]],
          },
        });
        await telegramCall(BOT_TOKEN, "answerCallbackQuery", { callback_query_id: cb.id, text: "Vazgeçildi." });
      } else {
        await telegramCall(BOT_TOKEN, "answerCallbackQuery", { callback_query_id: cb.id });
      }

      return res.status(200).json({ ok: true });
    }

    if (update.message) {
      const msg = update.message;
      const chatId = msg.chat && msg.chat.id;
      if (String(chatId) !== String(CHAT_ID)) {
        return res.status(200).json({ ok: true });
      }

      const text = (msg.text || "").trim();

      if (text === "/start" || text === "/yardim" || text === "/help") {
        await telegramCall(BOT_TOKEN, "sendMessage", {
          chat_id: chatId,
          text:
            "🍝 *Casa Aurelia Rezervasyon Botu*\n\n" +
            "/bugun — bugünün rezervasyonları\n" +
            "/yarin — yarının rezervasyonları\n" +
            "/tarih YYYY-MM-DD — belirli bir günün rezervasyonları\n\n" +
            "Yeni rezervasyon ve iptal bildirimleri otomatik gelir.",
          parse_mode: "Markdown",
        });
      } else if (text === "/bugun") {
        const dateStr = toISODate(new Date());
        const rows = await fetchReservationsForDate(SUPABASE_URL, SERVICE_KEY, dateStr);
        await telegramCall(BOT_TOKEN, "sendMessage", {
          chat_id: chatId,
          text: formatReservationList(dateStr, rows),
          parse_mode: "Markdown",
        });
      } else if (text === "/yarin") {
        const d = new Date();
        d.setDate(d.getDate() + 1);
        const dateStr = toISODate(d);
        const rows = await fetchReservationsForDate(SUPABASE_URL, SERVICE_KEY, dateStr);
        await telegramCall(BOT_TOKEN, "sendMessage", {
          chat_id: chatId,
          text: formatReservationList(dateStr, rows),
          parse_mode: "Markdown",
        });
      } else if (text.startsWith("/tarih")) {
        const parts = text.split(/\s+/);
        const dateStr = parts[1];
        if (!dateStr || !DATE_RE.test(dateStr)) {
          await telegramCall(BOT_TOKEN, "sendMessage", {
            chat_id: chatId,
            text: "Kullanım: /tarih YYYY-MM-DD (örn. /tarih 2026-08-15)",
          });
        } else {
          const rows = await fetchReservationsForDate(SUPABASE_URL, SERVICE_KEY, dateStr);
          await telegramCall(BOT_TOKEN, "sendMessage", {
            chat_id: chatId,
            text: formatReservationList(dateStr, rows),
            parse_mode: "Markdown",
          });
        }
      }

      return res.status(200).json({ ok: true });
    }

    res.status(200).json({ ok: true });
  } catch (err) {
    console.error("telegram webhook failed:", err);
    res.status(200).json({ ok: true });
  }
};
