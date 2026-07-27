// ===== MODIFICA QUI: numero WhatsApp e messaggio predefinito =====
const WHATSAPP_NUMBER = "390212345678"; // formato internazionale, senza + o spazi
const WHATSAPP_MESSAGE = "Buonasera, vorrei prenotare un tavolo da Casa Aurelia.";

(function setupWhatsapp() {
  const url = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(WHATSAPP_MESSAGE)}`;
  document.getElementById("whatsappBtnMain")?.setAttribute("href", url);
  document.getElementById("whatsappBtnSticky")?.setAttribute("href", url);
})();

// ===== Nav scroll state =====
(function navScrollState() {
  const nav = document.getElementById("nav");
  if (!nav) return;
  const onScroll = () => {
    nav.classList.toggle("is-scrolled", window.scrollY > 40);
  };
  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });
})();

// ===== Mobile nav toggle =====
(function mobileNav() {
  const toggle = document.getElementById("navToggle");
  const panel = document.getElementById("navLinksMobile");
  if (!toggle || !panel) return;

  const close = () => {
    panel.classList.remove("is-open");
    toggle.setAttribute("aria-expanded", "false");
  };
  const open = () => {
    panel.classList.add("is-open");
    toggle.setAttribute("aria-expanded", "true");
  };

  toggle.addEventListener("click", () => {
    panel.classList.contains("is-open") ? close() : open();
  });
  panel.querySelectorAll("a").forEach((a) => a.addEventListener("click", close));
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") close();
  });
})();

// ===== Scroll reveal =====
(function scrollReveal() {
  const items = document.querySelectorAll("[data-reveal]");
  if (!items.length) return;

  const heroItems = document.querySelectorAll(".hero [data-reveal]");
  heroItems.forEach((el, i) => el.style.setProperty("--i", i));

  if (!("IntersectionObserver" in window)) {
    items.forEach((el) => el.classList.add("is-visible"));
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.15, rootMargin: "0px 0px -80px 0px" }
  );

  items.forEach((el) => observer.observe(el));

  // Hero content reveals immediately on load, not on scroll.
  requestAnimationFrame(() => {
    heroItems.forEach((el) => {
      el.classList.add("is-visible");
      observer.unobserve(el);
    });
  });
})();

// ===== Menu course tabs (ARIA tab pattern) =====
(function menuTabs() {
  const tabs = Array.from(document.querySelectorAll(".menu-tab"));
  const panels = document.querySelectorAll(".menu-list");
  const photos = document.querySelectorAll(".ph--menu");
  if (!tabs.length) return;

  function activate(course, { focus = false } = {}) {
    tabs.forEach((t) => {
      const isActive = t.dataset.course === course;
      t.classList.toggle("is-active", isActive);
      t.setAttribute("aria-selected", String(isActive));
      t.tabIndex = isActive ? 0 : -1;
      if (isActive && focus) t.focus();
    });
    panels.forEach((p) => {
      const isActive = p.id === `panel-${course}`;
      p.hidden = !isActive;
      p.classList.toggle("is-active", isActive);
    });
    photos.forEach((ph) => {
      ph.classList.toggle("is-active", ph.dataset.coursePhoto === course);
    });
  }

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => activate(tab.dataset.course));
  });

  tabs.forEach((tab, index) => {
    tab.addEventListener("keydown", (e) => {
      let newIndex = null;
      if (e.key === "ArrowDown" || e.key === "ArrowRight") newIndex = (index + 1) % tabs.length;
      if (e.key === "ArrowUp" || e.key === "ArrowLeft") newIndex = (index - 1 + tabs.length) % tabs.length;
      if (e.key === "Home") newIndex = 0;
      if (e.key === "End") newIndex = tabs.length - 1;
      if (newIndex !== null) {
        e.preventDefault();
        activate(tabs[newIndex].dataset.course, { focus: true });
      }
    });
  });
})();

// ===== Hero subtle parallax =====
(function heroParallax() {
  const bg = document.querySelector(".hero__bg");
  const hero = document.querySelector(".hero");
  if (!bg || !hero) return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  let ticking = false;
  window.addEventListener(
    "scroll",
    () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const rect = hero.getBoundingClientRect();
        if (rect.bottom > 0 && rect.top < window.innerHeight) {
          const progress = -rect.top / rect.height;
          bg.style.transform = `translateY(${progress * 10}%)`;
        }
        ticking = false;
      });
    },
    { passive: true }
  );
})();

// ===== Footer year =====
document.getElementById("year").textContent = new Date().getFullYear();
