// ===== Autoplay hero video =====
// Muted, looping, autoplaying background video. The right file (16:9 desktop
// / 9:16 mobile) is picked natively via <source media="..."> in the HTML, so
// autoplay works even if this script never runs. This file only handles the
// loading-overlay fade and the reduced-motion / error fallbacks.
(function () {
  "use strict";

  const section = document.querySelector(".hero");
  const video = document.getElementById("heroVideo");
  if (!section || !video) return;

  const hint = document.getElementById("heroHint");
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const ready = () => section.classList.add("is-ready");

  if (reduced) {
    // Respect the OS setting: no motion, just a representative still frame.
    video.removeAttribute("autoplay");
    video.pause();
    const freeze = () => {
      try {
        video.currentTime = video.duration * 0.5;
      } catch (_) {
        /* not seekable yet */
      }
      ready();
    };
    if (video.readyState >= 1) freeze();
    else video.addEventListener("loadedmetadata", freeze, { once: true });
  } else {
    if (video.readyState >= 2) ready();
    else video.addEventListener("loadeddata", ready, { once: true });
    // autoplay attribute already covers this in every normal case; the
    // explicit play() call is only a safety net for browsers that need one.
    const p = video.play();
    if (p && typeof p.then === "function") p.catch(() => ready());
  }

  video.addEventListener(
    "error",
    () => {
      section.classList.add("is-ready");
      video.style.display = "none"; // scrim + flat colour remain, copy stays readable
    },
    { once: true }
  );

  // ===== Scroll hint — fades out on first scroll, never comes back =====
  if (hint) {
    const hide = () => hint.classList.add("is-hidden");
    window.addEventListener("scroll", hide, { passive: true, once: true });
  }
})();
