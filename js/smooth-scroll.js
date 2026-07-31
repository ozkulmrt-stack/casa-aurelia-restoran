// ===== Global smooth-scroll provider =====
// Owns three things: GSAP/ScrollTrigger plugin registration, the ONE shared
// clock (Lenis driven by gsap.ticker — never a second rAF loop), and anchor
// link routing. hero-scrub.js depends on ScrollTrigger being registered and
// on window.__lenis existing, so this file's <script> tag must come first.
(function smoothScrollProvider() {
  "use strict";

  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
  const hasGsap = !!(window.gsap && window.ScrollTrigger);

  if (hasGsap) {
    gsap.registerPlugin(ScrollTrigger);
    // iOS URL-bar show/hide fires spurious resizes; without this every one
    // of those triggers a full ScrollTrigger.refresh() mid-scrub.
    ScrollTrigger.config({ ignoreMobileResize: true });
  } else {
    console.warn("[casa-aurelia] GSAP/ScrollTrigger not available — falling back to native scroll.");
  }

  // ===== Lenis on the GSAP ticker (exactly one clock in the whole page) =====
  let lenis = null;
  if (hasGsap && window.Lenis && !reduced.matches) {
    lenis = new Lenis({ lerp: 0.075, smoothWheel: true });
    lenis.on("scroll", ScrollTrigger.update);
    gsap.ticker.add((time) => lenis.raf(time * 1000));
    gsap.ticker.lagSmoothing(0);
  }
  // Exposed so hero-scrub.js (and anyone else) can tell whether Lenis is driving
  // scroll right now; null means "native scroll, act accordingly".
  window.__lenis = lenis;

  // ===== Anchor routing =====
  // Delegated on document, bubble phase: main.js's per-link drawer-close
  // handlers are attached directly to the <a> elements, so they run first
  // during capture/target phase, then this handler runs on the way back up.
  document.addEventListener("click", (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = e.target.closest('a[href^="#"]');
    if (!a || a.hasAttribute("data-no-smooth")) return;
    const hash = a.getAttribute("href");
    if (!hash || hash === "#") return;
    const target = document.querySelector(hash);
    if (!target) return;

    e.preventDefault();
    const nav = document.getElementById("nav");
    const offset = -((nav ? nav.offsetHeight : 0) + 8);

    if (lenis) {
      lenis.scrollTo(target, { offset, duration: 1.1 });
    } else {
      target.scrollIntoView({ behavior: reduced.matches ? "auto" : "smooth", block: "start" });
    }

    history.pushState(null, "", hash);
    // a11y: move focus so keyboard/screen-reader users land where the page just went
    if (!target.hasAttribute("tabindex")) target.setAttribute("tabindex", "-1");
    target.focus({ preventScroll: true });
  });
})();
