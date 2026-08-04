// ===== Reservation form: talks directly to Supabase's create_reservation RPC =====
// The anon key below is safe to expose — RLS denies all direct table access;
// this key can only ever call the one RPC function it's been granted EXECUTE on.
const SUPABASE_URL = "https://abmvrreeirrczjxzakyb.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFibXZycmVlaXJyY3pqeHpha3liIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU0OTM2MzMsImV4cCI6MjEwMTA2OTYzM30.-SNarzPcRD5POIOCh-Vp5yF_c0qakSOlhoOfU-NxXq0";

const BOOKING_WINDOW_DAYS = 60;
const CLOSED_WEEKDAY = 1; // Date#getDay(): 0=Sun..6=Sat, 1=Monday

(function reservationForm() {
  const form = document.getElementById("reservationForm");
  if (!form) return;

  const t = window.I18N;
  const nameInput = document.getElementById("resName");
  const phoneInput = document.getElementById("resPhone");
  const emailInput = document.getElementById("resEmail");
  const dateInput = document.getElementById("resDate");
  const timeSelect = document.getElementById("resTime");
  const partySelect = document.getElementById("resParty");
  const submitBtn = document.getElementById("resSubmit");
  const formError = document.getElementById("resFormError");
  const feedback = document.getElementById("resFeedback");

  // ---- Date bounds: tomorrow through +60 days ----
  const toISODate = (d) => d.toISOString().slice(0, 10);
  const today = new Date();
  const minDate = new Date(today);
  minDate.setDate(minDate.getDate() + 1);
  const maxDate = new Date(today);
  maxDate.setDate(maxDate.getDate() + BOOKING_WINDOW_DAYS);
  dateInput.min = toISODate(minDate);
  dateInput.max = toISODate(maxDate);

  const showError = (message) => {
    formError.textContent = message;
    formError.hidden = false;
  };
  const clearError = () => {
    formError.hidden = true;
    formError.textContent = "";
  };
  const showFeedback = (message, type) => {
    feedback.textContent = message;
    feedback.classList.remove("is-success", "is-error");
    feedback.classList.add(type === "success" ? "is-success" : "is-error");
  };

  // Client-side Monday guard — mirrors the server-side check in create_reservation().
  dateInput.addEventListener("change", () => {
    if (!dateInput.value) return;
    const [y, m, d] = dateInput.value.split("-").map(Number);
    const picked = new Date(y, m - 1, d);
    if (picked.getDay() === CLOSED_WEEKDAY) {
      showError(t.reservationMondayError);
    } else {
      clearError();
    }
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearError();
    feedback.textContent = "";
    feedback.classList.remove("is-success", "is-error");

    if (!form.reportValidity()) return;

    const [y, m, d] = dateInput.value.split("-").map(Number);
    if (new Date(y, m - 1, d).getDay() === CLOSED_WEEKDAY) {
      showError(t.reservationMondayError);
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = t.reservationSending;

    try {
      const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/create_reservation`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          p_name: nameInput.value,
          p_phone: phoneInput.value,
          p_email: emailInput.value,
          p_date: dateInput.value,
          p_time: timeSelect.value,
          p_party_size: Number(partySelect.value),
        }),
      });

      const data = await response.json();

      if (data && data.success) {
        showFeedback(t.reservationSuccess, "success");
        form.reset();
      } else {
        const reason = data && data.reason;
        showFeedback(
          t.reservationErrors[reason] || t.reservationGenericError,
          "error"
        );
      }
    } catch (err) {
      showFeedback(t.reservationGenericError, "error");
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = t.reservationSubmitLabel;
    }
  });
})();
