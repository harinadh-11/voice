/**
 * Shared utilities: floating hearts, music toggle, reduced-motion helper.
 */

(function () {
  "use strict";

  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function createFloatingHearts(container, count) {
    if (!container || prefersReducedMotion) return;
    const n = Math.min(count || 12, 18);
    for (let i = 0; i < n; i++) {
      const el = document.createElement("span");
      el.className = "floating-heart";
      el.setAttribute("aria-hidden", "true");
      el.textContent = "♥";
      el.style.left = Math.random() * 100 + "%";
      el.style.fontSize = (0.7 + Math.random() * 1.1) + "rem";
      el.style.animationDuration = (10 + Math.random() * 10) + "s";
      el.style.animationDelay = (Math.random() * 8) + "s";
      el.style.color = Math.random() > 0.5 ? "var(--gold)" : "var(--blush-deep)";
      container.appendChild(el);
    }
  }

  /* ----- Music ----- */
  let audio = null;
  let musicEnabled = false;

  function initMusic() {
    const cfg = window.PROPOSAL_CONFIG && window.PROPOSAL_CONFIG.music;
    if (!cfg || !cfg.src) return;

    const btn = document.getElementById("music-toggle");
    if (!btn) return;

    audio = new Audio(cfg.src);
    audio.loop = true;
    audio.volume = typeof cfg.volume === "number" ? cfg.volume : 0.35;
    audio.preload = "auto";

    audio.addEventListener("error", function () {
      btn.style.display = "none";
      audio = null;
    });

    btn.style.display = "flex";
    btn.setAttribute("aria-pressed", "false");
    btn.setAttribute("aria-label", "Play background music");

    btn.addEventListener("click", function () {
      if (!audio) return;
      if (musicEnabled) {
        audio.pause();
        musicEnabled = false;
        btn.setAttribute("aria-pressed", "false");
        btn.setAttribute("aria-label", "Play background music");
        btn.textContent = "♪";
      } else {
        const p = audio.play();
        if (p && typeof p.then === "function") {
          p.then(function () {
            musicEnabled = true;
            btn.setAttribute("aria-pressed", "true");
            btn.setAttribute("aria-label", "Mute background music");
            btn.textContent = "♫";
          }).catch(function () {
            // Autoplay blocked — still allow retry on next click
          });
        } else {
          musicEnabled = true;
          btn.setAttribute("aria-pressed", "true");
          btn.textContent = "♫";
        }
      }
    });
  }

  function prefersReduced() {
    return prefersReducedMotion;
  }

  /**
   * Adaptive particle budget based on viewport / hardware hints.
   */
  function getParticleBudget(desired) {
    const w = window.innerWidth || 800;
    const cores = navigator.hardwareConcurrency || 4;
    let budget = desired || 200;
    if (w < 480 || cores <= 2) budget = Math.min(budget, 90);
    else if (w < 768 || cores <= 4) budget = Math.min(budget, 150);
    if (prefersReducedMotion) budget = Math.min(budget, 20);
    return Math.max(30, budget);
  }

  window.ProposalUtils = {
    createFloatingHearts,
    initMusic,
    prefersReduced,
    getParticleBudget
  };

  // Auto-init floating hearts and music when DOM is ready
  document.addEventListener("DOMContentLoaded", function () {
    const bg = document.querySelector(".particles-bg");
    if (bg) createFloatingHearts(bg, 14);
    initMusic();
  });
})();
