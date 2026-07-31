// ===== Casa Aurelia — Service Book (admin panel) =====
const ADMIN_AUTH_KEY = "casaAureliaAdminAuth";
const SLOT_TIMES = ["19:30", "20:00", "20:30", "21:00", "21:30", "22:00"];

(function adminPanel() {
  const loginSection = document.getElementById("adminLogin");
  const panelSection = document.getElementById("adminPanel");
  const loginForm = document.getElementById("adminLoginForm");
  const emailInput = document.getElementById("adminEmail");
  const passwordInput = document.getElementById("adminPassword");
  const loginError = document.getElementById("adminLoginError");
  const logoutBtn = document.getElementById("adminLogout");

  const datePrev = document.getElementById("datePrev");
  const dateNext = document.getElementById("dateNext");
  const dateToday = document.getElementById("dateToday");
  const dateInput = document.getElementById("dateInput");
  const dateLabel = document.getElementById("dateLabel");
  const summaryLine = document.getElementById("summaryLine");
  const statusLine = document.getElementById("statusLine");
  const searchInput = document.getElementById("searchInput");
  const showCancelledInput = document.getElementById("showCancelled");
  const capacityInput = document.getElementById("capacityInput");
  const csvBtn = document.getElementById("csvBtn");
  const printBtn = document.getElementById("printBtn");
  const addBtn = document.getElementById("addBtn");
  const serviceSpine = document.getElementById("serviceSpine");

  const addModal = document.getElementById("addModal");
  const addModalBackdrop = document.getElementById("addModalBackdrop");
  const addForm = document.getElementById("addForm");
  const addName = document.getElementById("addName");
  const addPhone = document.getElementById("addPhone");
  const addDate = document.getElementById("addDate");
  const addTime = document.getElementById("addTime");
  const addParty = document.getElementById("addParty");
  const addFormError = document.getElementById("addFormError");
  const addOverrideBtn = document.getElementById("addOverrideBtn");
  const addCancelBtn = document.getElementById("addCancelBtn");

  if (!loginSection || !panelSection) return;

  let reservations = [];
  let maxGuestsPerSlot = null;
  let selectedDate = todayISO();
  let pendingOverridePayload = null;

  // ---------- helpers ----------
  function todayISO() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  function shiftDate(iso, days) {
    const [y, m, d] = iso.split("-").map(Number);
    const date = new Date(y, m - 1, d);
    date.setDate(date.getDate() + days);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  }

  function formatDateLabel(iso) {
    const [y, m, d] = iso.split("-").map(Number);
    const date = new Date(y, m - 1, d);
    return date.toLocaleDateString("en-US", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  }

  const escapeHtml = (str) =>
    String(str).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    }[c]));

  function buildAuthHeader(email, password) {
    const bytes = new TextEncoder().encode(`${email}:${password}`);
    const binary = String.fromCharCode(...bytes);
    return "Basic " + btoa(binary);
  }

  const getAuthHeader = () => sessionStorage.getItem(ADMIN_AUTH_KEY);
  const setAuthHeader = (h) => sessionStorage.setItem(ADMIN_AUTH_KEY, h);
  const clearAuthHeader = () => sessionStorage.removeItem(ADMIN_AUTH_KEY);

  // ---------- view state ----------
  function showLogin(message) {
    clearAuthHeader();
    panelSection.hidden = true;
    loginSection.hidden = false;
    passwordInput.value = "";
    if (message) {
      loginError.textContent = message;
      loginError.hidden = false;
    } else {
      loginError.hidden = true;
      loginError.textContent = "";
    }
  }

  function showPanel() {
    loginSection.hidden = true;
    panelSection.hidden = false;
  }

  function updateDateUI() {
    dateInput.value = selectedDate;
    dateLabel.textContent = formatDateLabel(selectedDate);
  }

  // ---------- data loading ----------
  async function loadAndRender() {
    const auth = getAuthHeader();
    if (!auth) return showLogin();

    statusLine.textContent = "Loading…";
    try {
      const res = await fetch(`/api/admin/reservations?date=${encodeURIComponent(selectedDate)}`, {
        headers: { Authorization: auth },
      });
      if (res.status === 401) return showLogin("Incorrect email or password.");
      if (!res.ok) {
        statusLine.textContent = "Failed to load reservations. Please try again.";
        return;
      }
      const data = await res.json();
      reservations = Array.isArray(data.reservations) ? data.reservations : [];
      maxGuestsPerSlot = typeof data.maxGuestsPerSlot === "number" ? data.maxGuestsPerSlot : null;
      capacityInput.value = maxGuestsPerSlot != null ? maxGuestsPerSlot : "";
      statusLine.textContent = "";
      renderAll();
    } catch (err) {
      statusLine.textContent = "Network error — please try again.";
    }
  }

  // ---------- rendering ----------
  function matchesFilters(r) {
    if (!showCancelledInput.checked && r.status === "cancelled") return false;
    const q = searchInput.value.trim().toLowerCase();
    if (!q) return true;
    return (
      String(r.customer_name).toLowerCase().includes(q) ||
      String(r.phone).toLowerCase().includes(q)
    );
  }

  function renderAll() {
    renderSummary();
    renderSpine();
  }

  function renderSummary() {
    const confirmed = reservations.filter((r) => r.status === "confirmed");
    const totalGuests = confirmed.reduce((sum, r) => sum + Number(r.party_size || 0), 0);
    const capacityTotal = maxGuestsPerSlot != null ? maxGuestsPerSlot * SLOT_TIMES.length : null;
    const pct = capacityTotal ? Math.round((totalGuests / capacityTotal) * 100) : 0;
    const resWord = confirmed.length === 1 ? "reservation" : "reservations";
    const guestWord = totalGuests === 1 ? "guest" : "guests";
    summaryLine.textContent = `${confirmed.length} ${resWord} · ${totalGuests} ${guestWord} · ${pct}% full`;
  }

  function renderSpine() {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    serviceSpine.innerHTML = "";

    SLOT_TIMES.forEach((time, index) => {
      const slotReservations = reservations.filter((r) => r.reservation_time.slice(0, 5) === time);
      const confirmedTotal = slotReservations
        .filter((r) => r.status === "confirmed")
        .reduce((sum, r) => sum + Number(r.party_size || 0), 0);
      const visibleRows = slotReservations.filter(matchesFilters);

      const slot = document.createElement("div");
      slot.className = "slot";

      const cap = maxGuestsPerSlot || 0;
      const isFull = cap > 0 && confirmedTotal >= cap;
      const pct = cap > 0 ? Math.min(100, (confirmedTotal / cap) * 100) : 0;

      const header = document.createElement("div");
      header.className = "slot__header";
      header.innerHTML = `
        <span class="slot__time">${escapeHtml(time)}</span>
        <div class="slot__bar"><div class="slot__bar-fill${isFull ? " is-full" : ""}" style="width:0%"></div></div>
        <div class="slot__meta">
          <span class="slot__count">${confirmedTotal}/${cap || "—"}</span>
          ${isFull ? '<span class="slot__tag">Full</span>' : ""}
        </div>
      `;
      slot.appendChild(header);

      if (visibleRows.length) {
        const list = document.createElement("ul");
        list.className = "slot__guests";
        list.innerHTML = visibleRows
          .map((r) => {
            const cancelled = r.status === "cancelled";
            return `<li class="guest-row${cancelled ? " guest-row--cancelled" : ""}" data-id="${escapeHtml(r.id)}">
              <span class="guest-row__name">${escapeHtml(r.customer_name)}</span>
              <span class="guest-row__party">${escapeHtml(r.party_size)}</span>
              <span class="guest-row__phone">${escapeHtml(r.phone)}</span>
              ${
                cancelled
                  ? '<span class="guest-row__cancelled-tag">Cancelled</span>'
                  : `<button type="button" class="guest-row__cancel" data-id="${escapeHtml(r.id)}" aria-label="Cancel reservation">×</button>`
              }
            </li>`;
          })
          .join("");
        slot.appendChild(list);
      } else {
        const empty = document.createElement("p");
        empty.className = "slot__empty";
        empty.textContent = "No reservations yet.";
        slot.appendChild(empty);
      }

      serviceSpine.appendChild(slot);

      const fill = header.querySelector(".slot__bar-fill");
      if (reduceMotion) {
        fill.style.width = `${pct}%`;
      } else {
        setTimeout(() => {
          fill.style.width = `${pct}%`;
        }, index * 60);
      }
    });
  }

  // ---------- login ----------
  loginForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const email = emailInput.value.trim();
    const password = passwordInput.value;
    if (!email || !password) return;
    setAuthHeader(buildAuthHeader(email, password));
    showPanel();
    loadAndRender();
  });

  logoutBtn.addEventListener("click", () => showLogin());

  // ---------- date navigation ----------
  datePrev.addEventListener("click", () => {
    selectedDate = shiftDate(selectedDate, -1);
    updateDateUI();
    loadAndRender();
  });
  dateNext.addEventListener("click", () => {
    selectedDate = shiftDate(selectedDate, 1);
    updateDateUI();
    loadAndRender();
  });
  dateToday.addEventListener("click", () => {
    selectedDate = todayISO();
    updateDateUI();
    loadAndRender();
  });
  dateInput.addEventListener("change", () => {
    if (!dateInput.value) return;
    selectedDate = dateInput.value;
    updateDateUI();
    loadAndRender();
  });

  // ---------- filters (client-side, no refetch) ----------
  searchInput.addEventListener("input", renderSpine);
  showCancelledInput.addEventListener("change", renderSpine);

  // ---------- capacity ----------
  capacityInput.addEventListener("change", async () => {
    const value = Number(capacityInput.value);
    if (!Number.isInteger(value) || value < 1 || value > 500) {
      statusLine.textContent = "Capacity must be a whole number between 1 and 500.";
      capacityInput.value = maxGuestsPerSlot != null ? maxGuestsPerSlot : "";
      return;
    }
    const auth = getAuthHeader();
    statusLine.textContent = "Saving capacity…";
    try {
      const res = await fetch("/api/admin/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: auth },
        body: JSON.stringify({ maxGuestsPerSlot: value }),
      });
      if (res.status === 401) return showLogin("Incorrect email or password.");
      if (!res.ok) {
        statusLine.textContent = "Failed to update capacity.";
        return;
      }
      const data = await res.json();
      maxGuestsPerSlot = data.maxGuestsPerSlot;
      statusLine.textContent = "Capacity updated.";
      renderAll();
    } catch (err) {
      statusLine.textContent = "Network error — please try again.";
    }
  });

  // ---------- cancel ----------
  serviceSpine.addEventListener("click", async (e) => {
    const btn = e.target.closest(".guest-row__cancel");
    if (!btn) return;
    const id = btn.dataset.id;
    if (!id || !window.confirm("Cancel this reservation?")) return;

    const auth = getAuthHeader();
    btn.disabled = true;
    try {
      const res = await fetch("/api/admin/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: auth },
        body: JSON.stringify({ id }),
      });
      if (res.status === 401) return showLogin("Incorrect email or password.");
      if (!res.ok) {
        statusLine.textContent = "Failed to cancel — please try again.";
        btn.disabled = false;
        return;
      }
      await loadAndRender();
    } catch (err) {
      statusLine.textContent = "Network error — please try again.";
      btn.disabled = false;
    }
  });

  // ---------- add reservation modal ----------
  function openAddModal() {
    addForm.reset();
    addDate.value = selectedDate;
    addFormError.hidden = true;
    addOverrideBtn.hidden = true;
    pendingOverridePayload = null;
    addModal.hidden = false;
    addName.focus();
  }
  function closeAddModal() {
    addModal.hidden = true;
  }

  addBtn.addEventListener("click", openAddModal);
  addCancelBtn.addEventListener("click", closeAddModal);
  addModalBackdrop.addEventListener("click", closeAddModal);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !addModal.hidden) closeAddModal();
  });

  const ADD_ERROR_MESSAGES = {
    invalid_name: "Please enter a name.",
    invalid_phone: "Please enter a phone number.",
    invalid_party_size: "Guests must be between 1 and 20.",
    invalid_date: "That date is outside the booking window.",
    invalid_time: "Please choose a time.",
    closed: "The restaurant is closed on Mondays.",
    full: "That time is fully booked.",
  };
  const OVERRIDABLE_REASONS = new Set(["full", "closed", "invalid_date"]);

  async function submitReservation(payload) {
    const auth = getAuthHeader();
    const res = await fetch("/api/admin/create", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: auth },
      body: JSON.stringify(payload),
    });
    if (res.status === 401) {
      showLogin("Incorrect email or password.");
      return null;
    }
    if (!res.ok) throw new Error("http_error");
    return res.json();
  }

  addForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    addFormError.hidden = true;
    addOverrideBtn.hidden = true;
    pendingOverridePayload = null;

    const payload = {
      name: addName.value,
      phone: addPhone.value,
      date: addDate.value,
      time: addTime.value,
      partySize: Number(addParty.value),
    };

    try {
      const data = await submitReservation(payload);
      if (!data) return; // 401 already handled
      if (data.success) {
        closeAddModal();
        await loadAndRender();
        statusLine.textContent = "Reservation added.";
        return;
      }
      const reason = data.reason;
      addFormError.textContent = ADD_ERROR_MESSAGES[reason] || "Something went wrong — please try again.";
      addFormError.hidden = false;
      if (OVERRIDABLE_REASONS.has(reason)) {
        pendingOverridePayload = payload;
        addOverrideBtn.hidden = false;
      }
    } catch (err) {
      addFormError.textContent = "Something went wrong — please try again.";
      addFormError.hidden = false;
    }
  });

  addOverrideBtn.addEventListener("click", async () => {
    if (!pendingOverridePayload) return;
    addOverrideBtn.disabled = true;
    try {
      const data = await submitReservation({ ...pendingOverridePayload, override: true });
      if (!data) return;
      if (data.success) {
        closeAddModal();
        await loadAndRender();
        statusLine.textContent = "Reservation added (override).";
      } else {
        addFormError.textContent = "Something went wrong — please try again.";
        addFormError.hidden = false;
        addOverrideBtn.hidden = true;
      }
    } catch (err) {
      addFormError.textContent = "Something went wrong — please try again.";
      addFormError.hidden = false;
    } finally {
      addOverrideBtn.disabled = false;
    }
  });

  // ---------- CSV ----------
  csvBtn.addEventListener("click", () => {
    const visible = reservations.filter(matchesFilters);
    const header = ["Time", "Name", "Phone", "Guests", "Status"];
    const rows = visible.map((r) => [
      r.reservation_time.slice(0, 5),
      r.customer_name,
      r.phone,
      String(r.party_size),
      r.status,
    ]);
    const csvEscape = (val) => {
      const s = String(val);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const csv = [header, ...rows].map((row) => row.map(csvEscape).join(",")).join("\r\n");
    // UTF-8 BOM so Excel renders Turkish characters correctly.
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `reservations-${selectedDate}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  });

  // ---------- print ----------
  printBtn.addEventListener("click", () => window.print());

  // ---------- boot ----------
  updateDateUI();
  if (getAuthHeader()) {
    showPanel();
    loadAndRender();
  } else {
    showLogin();
  }
})();
