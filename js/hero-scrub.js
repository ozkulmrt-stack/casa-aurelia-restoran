// ===== Scroll-scrubbed cinematic hero =====
// Scroll position maps to video currentTime: down = forward, up = reverse,
// stop = freeze on that frame. Never autoplays, no controls/progress UI,
// no poster — the first frame comes from the video itself.
//
// Default CSS state (see .hero in style.css) is already a correct one-screen
// hero. The 500vh scrub rig is opt-in via the "hero--scrub" class, added ONLY
// after this script has a working ScrollTrigger. Any failure path (missing
// GSAP, missing video, 404, reduced-motion) leaves a normal hero behind.
(function () {
  "use strict";

  const section = document.querySelector("[data-hero-scrub]");
  const video = document.getElementById("heroVideo");
  if (!section || !video) return;

  const content = section.querySelector(".hero__content");
  const hint = document.getElementById("heroHint");

  const VARIANTS = {
    desktop: { src: "/assets/hero-scrub.v1.mp4", fps: 24 },
    mobile: { src: "/assets/hero-scrub-mobile.v1.mp4", fps: 20 },
  };
  // Created ONCE for the page lifetime — re-creating a matchMedia object per
  // init/teardown cycle would leave orphaned "change" listeners behind on
  // their own MediaQueryList instances, which keep firing independently and
  // cause reinit to run more than once per breakpoint crossing.
  const MOBILE_MQ = window.matchMedia("(max-width: 768px)");
  const REDUCED_MQ = window.matchMedia("(prefers-reduced-motion: reduce)");
  const LERP = 0.12;
  const HINT_FADE_END = 0.12; // hint fully gone by 12% progress
  const RELEASE_START = 0.85; // copy released over the last 15%

  let frameDur = 1 / 24;
  let duration = 0;
  let targetProgress = 0;
  let current = 0;
  let st = null;
  let tickerFn = null;
  let ready = false;
  let primed = false;
  let snapped = false;
  let metaHandler = null;
  let dataHandler = null;
  let reducedFrameHandler = null;

  const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
  const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

  function failSoft() {
    section.classList.remove("hero--scrub");
    section.classList.add("is-ready"); // drop the loading overlay
    video.style.display = "none"; // scrim over --verde-notte remains, copy stays readable
    if (st) {
      st.kill();
      st = null;
    }
    if (tickerFn && window.gsap) {
      gsap.ticker.remove(tickerFn);
      tickerFn = null;
    }
  }

  function prime() {
    // ===== iOS Safari priming (rule d) =====
    // A muted <video> that has never been play()ed may not decode/render
    // programmatic currentTime seeks on iOS Safari — it stays frozen with no
    // console error. One silent play/pause unlocks the decoder. Runs on BOTH
    // the scrub path and the reduced-motion static-frame path.
    if (primed) return;
    primed = true;
    const p = video.play();
    if (p && typeof p.then === "function") {
      p.then(() => video.pause()).catch(() => {});
    } else {
      video.pause();
    }
  }

  function init() {
    // No GSAP/ScrollTrigger at all: nothing to build on, bail to the plain hero.
    if (!window.gsap || !window.ScrollTrigger) {
      failSoft();
      return;
    }

    if (video.readyState >= 1) prime();
    else video.addEventListener("loadedmetadata", prime, { once: true });

    video.addEventListener("error", failSoft, { once: true });
    if (video.error) {
      failSoft();
      return;
    }

    // Pick the variant and assign src BEFORE any listener that assumes bytes
    // are flowing. This is the single-download guarantee: the <video> ships
    // with no src/<source> in HTML, so only whichever file matches the
    // current breakpoint is ever fetched.
    const variant = MOBILE_MQ.matches ? VARIANTS.mobile : VARIANTS.desktop;
    frameDur = 1 / variant.fps;
    video.src = variant.src;
    video.load();

    // ===== readyState race (known trap) =====
    // preload="auto" starts fetching the moment src is assigned, so
    // loadeddata/loadedmetadata can fire BEFORE these listeners attach on a
    // warm cache. Every handler is preceded by a synchronous readyState
    // check, or the loading overlay would stay opaque forever.
    metaHandler = () => {
      duration = isFinite(video.duration) && video.duration > 0 ? video.duration : 0;
      if (st) ScrollTrigger.refresh();
    };
    dataHandler = () => {
      ready = true;
      section.classList.add("is-ready");
    };
    if (video.readyState >= 1) metaHandler();
    else video.addEventListener("loadedmetadata", metaHandler);
    if (video.readyState >= 2) dataHandler();
    else video.addEventListener("loadeddata", dataHandler);

    // ===== Reduced motion: static frame, no scrub rig at all =====
    if (REDUCED_MQ.matches) {
      reducedFrameHandler = () => {
        try {
          video.currentTime = video.duration * 0.5;
        } catch (_) {
          /* not seekable yet */
        }
      };
      if (video.readyState >= 1) reducedFrameHandler();
      else video.addEventListener("loadedmetadata", reducedFrameHandler, { once: true });
      return; // no ScrollTrigger, no ticker — .hero--scrub is never added
    }

    // ===== The single ScrollTrigger =====
    // onUpdate ONLY records progress (+ cheap style writes in the same
    // callback). It NEVER touches video.currentTime directly — that would
    // overload the decoder on every scroll tick and cause stutter/freezes.
    st = ScrollTrigger.create({
      trigger: section,
      start: "top top",
      end: "bottom bottom",
      invalidateOnRefresh: true,
      onUpdate: (self) => {
        targetProgress = self.progress;

        const p = self.progress;
        if (hint) hint.style.opacity = String(clamp01(1 - p / HINT_FADE_END));
        if (content) {
          const rel = clamp01((p - RELEASE_START) / (1 - RELEASE_START));
          content.style.opacity = String(1 - rel);
          content.style.transform = "translate3d(0," + (-rel * 6) + "vh,0)";
        }
      },
      onRefresh: (self) => {
        targetProgress = self.progress;
      },
    });

    // ===== Seek loop — the ONLY place currentTime is written =====
    // Separate gsap.ticker loop, lerped toward the target, with two guards:
    //   1) threshold quantised to the frame duration (not a sub-frame value)
    //   2) never queue a seek before the previous one finishes
    tickerFn = function () {
      if (!ready || !duration) return;

      const target = clamp(targetProgress * duration, 0, duration - frameDur);

      if (!snapped) {
        // First frame after ready: snap, don't lerp — otherwise a reload
        // mid-page plays a visible fast-forward from frame 0.
        current = target;
        snapped = true;
      } else {
        current += (target - current) * LERP;
      }

      if (!video.paused) video.pause(); // never let it play on its own
      if (video.seeking) return; // guard 2
      if (Math.abs(video.currentTime - current) > frameDur) {
        // guard 1
        try {
          video.currentTime = current;
        } catch (_) {
          /* seek attempted before seekable */
        }
      }
    };
    gsap.ticker.add(tickerFn);

    // Last step: only now does the 500vh rig actually exist.
    section.classList.add("hero--scrub");
  }

  function teardown() {
    if (tickerFn && window.gsap) {
      gsap.ticker.remove(tickerFn);
      tickerFn = null;
    }
    if (st) {
      st.kill();
      st = null;
    }
    if (metaHandler) video.removeEventListener("loadedmetadata", metaHandler);
    if (dataHandler) video.removeEventListener("loadeddata", dataHandler);
    if (reducedFrameHandler) video.removeEventListener("loadedmetadata", reducedFrameHandler);
    metaHandler = dataHandler = reducedFrameHandler = null;

    video.pause();
    video.removeAttribute("src");
    video.load(); // cancels the in-flight fetch and frees the decoder
    section.classList.remove("hero--scrub", "is-ready");
    if (content) content.style.cssText = "";
    if (hint) hint.style.cssText = "";
    ready = primed = snapped = false;
    duration = current = targetProgress = 0;
  }

  init();

  // ===== Resize / breakpoint handling =====
  let resizeTimer = null;
  window.addEventListener(
    "resize",
    () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        if (window.ScrollTrigger) ScrollTrigger.refresh();
      }, 150);
    },
    { passive: true }
  );

  // Only a REAL breakpoint crossing swaps the file — narrowing a desktop
  // window should never trigger a second download. Single listener for the
  // page's lifetime (see the comment on MOBILE_MQ above for why).
  MOBILE_MQ.addEventListener("change", () => {
    teardown();
    init();
  });

  // Deliberately no pagehide teardown: that would break bfcache restore.
})();
