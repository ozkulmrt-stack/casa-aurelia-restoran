// ===== Chat widget: talks to /api/chat, never persists anything client-side =====
(function chatWidget() {
  const launcher = document.getElementById("chatLauncher");
  const panel = document.getElementById("chatPanel");
  const closeBtn = document.getElementById("chatClose");
  const messagesEl = document.getElementById("chatMessages");
  const form = document.getElementById("chatForm");
  const input = document.getElementById("chatInput");
  const sendBtn = document.getElementById("chatSend");
  if (!launcher || !panel || !form || !input || !messagesEl) return;

  const MAX_TURNS = 20;
  let messages = []; // in-memory only — never written to storage
  let isOpen = false;
  let isSending = false;

  function open() {
    isOpen = true;
    panel.hidden = false;
    launcher.setAttribute("aria-expanded", "true");
    requestAnimationFrame(() => panel.classList.add("is-open"));
    input.focus();
    if (messages.length === 0) {
      addBubble(
        "assistant",
        "Merhaba! Casa Aurelia hakkında menü, saatler, adres veya rezervasyon hakkında soru sorabilirsiniz."
      );
    }
  }

  function close({ restoreFocus = false } = {}) {
    isOpen = false;
    panel.classList.remove("is-open");
    launcher.setAttribute("aria-expanded", "false");
    setTimeout(() => {
      if (!isOpen) panel.hidden = true;
    }, 250);
    if (restoreFocus) launcher.focus();
  }

  launcher.addEventListener("click", () => (isOpen ? close({ restoreFocus: true }) : open()));
  closeBtn?.addEventListener("click", () => close({ restoreFocus: true }));
  panel.addEventListener("click", (e) => {
    if (e.target === panel) close();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && isOpen) close({ restoreFocus: true });
  });

  function addBubble(role, text) {
    const bubble = document.createElement("div");
    bubble.className = `chat-bubble chat-bubble--${role}`;
    bubble.textContent = text; // never innerHTML — model output is untrusted text
    messagesEl.appendChild(bubble);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    return bubble;
  }

  function addTypingIndicator() {
    const el = document.createElement("div");
    el.className = "chat-bubble chat-bubble--assistant chat-bubble--typing";
    el.setAttribute("role", "status");
    el.setAttribute("aria-live", "polite");
    el.textContent = "…";
    messagesEl.appendChild(el);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    return el;
  }

  function addReservationPrompt(reservation, bubble) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "chat-reserve-btn";
    btn.textContent = "Masa Ayırt";
    btn.addEventListener("click", () => {
      fillReservationForm(reservation);
      close();
    });
    bubble.appendChild(document.createElement("br"));
    bubble.appendChild(btn);
  }

  function fillReservationForm(reservation) {
    const section = document.getElementById("prenotazione");
    const dateInput = document.getElementById("resDate");
    const timeSelect = document.getElementById("resTime");
    const partySelect = document.getElementById("resParty");

    if (reservation.date && dateInput) dateInput.value = reservation.date;
    if (reservation.time && timeSelect) timeSelect.value = reservation.time;
    if (reservation.party && partySelect) partySelect.value = String(reservation.party);

    // Trigger the Monday guard in js/reservation.js
    dateInput?.dispatchEvent(new Event("change"));

    section?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function sendMessage(text) {
    messages.push({ role: "user", content: text });
    if (messages.length > MAX_TURNS) messages = messages.slice(-MAX_TURNS);

    addBubble("user", text);
    const typing = addTypingIndicator();
    isSending = true;
    input.disabled = true;
    sendBtn.disabled = true;

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages }),
      });
      const data = await res.json();
      typing.remove();

      if (!res.ok || !data.reply) {
        addBubble(
          "assistant",
          "Şu anda cevap veremiyorum — bize +90 212 123 45 67 numarasından ulaşabilirsiniz."
        );
        return;
      }

      messages.push({ role: "assistant", content: data.reply });
      const bubble = addBubble("assistant", data.reply);

      if (data.reservation && (data.reservation.date || data.reservation.time || data.reservation.party)) {
        addReservationPrompt(data.reservation, bubble);
      }
    } catch {
      typing.remove();
      addBubble(
        "assistant",
        "Şu anda cevap veremiyorum — bize +90 212 123 45 67 numarasından ulaşabilirsiniz."
      );
    } finally {
      isSending = false;
      input.disabled = false;
      sendBtn.disabled = false;
      input.focus();
    }
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    if (isSending) return;
    const text = input.value.trim();
    if (!text) return;
    input.value = "";
    sendMessage(text);
  });
})();
