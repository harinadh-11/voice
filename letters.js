/**
 * Page 1 — Romantic letter sequence with typewriter effect.
 * Ensures messages finish before the next begins; CONTINUE only after the last.
 */

(function () {
  "use strict";

  const cfg = (window.PROPOSAL_CONFIG && window.PROPOSAL_CONFIG.letters) || {};
  const delayBetween = cfg.delayBetweenMessages != null ? cfg.delayBetweenMessages : 1500;
  const typeSpeed = cfg.typeSpeed != null ? cfg.typeSpeed : 38; // chars/sec
  const messages = Array.isArray(cfg.messages) ? cfg.messages.slice() : [];
  // An empty closing means "no extra line" (only fall back to the old default if it is missing entirely).
  const closing = typeof cfg.closing === "string" ? cfg.closing : "There is something I need to ask you…";
  const opening = cfg.opening || "For you, with all my heart…";

  let running = false;
  let timerIds = [];

  function clearTimers() {
    timerIds.forEach(function (id) { clearTimeout(id); });
    timerIds = [];
  }

  function schedule(fn, ms) {
    const id = setTimeout(fn, ms);
    timerIds.push(id);
    return id;
  }

  function typeWriter(el, text, onComplete) {
    if (window.ProposalUtils && window.ProposalUtils.prefersReduced()) {
      el.textContent = text;
      el.classList.add("visible");
      if (onComplete) onComplete();
      return;
    }

    el.innerHTML = "";
    el.classList.add("visible");
    const cursor = document.createElement("span");
    cursor.className = "cursor";
    cursor.setAttribute("aria-hidden", "true");

    let i = 0;
    const interval = 1000 / typeSpeed;

    function tick() {
      if (i < text.length) {
        // Append text node + keep cursor at end
        el.textContent = text.slice(0, i + 1);
        el.appendChild(cursor);
        i += 1;
        schedule(tick, interval);
      } else {
        // Leave cursor briefly, then remove
        schedule(function () {
          if (cursor.parentNode) cursor.remove();
          if (onComplete) onComplete();
        }, 400);
      }
    }
    tick();
  }

  function showSequence() {
    if (running) return;
    running = true;

    const openingEl = document.getElementById("opening-message");
    const letterEl = document.getElementById("letter-text");
    const continueWrap = document.getElementById("continue-wrap");

    if (!letterEl || !continueWrap) return;

    const allMessages = messages.concat(closing ? [closing] : []);
    let index = 0;

    function showNext() {
      if (index >= allMessages.length) {
        continueWrap.classList.add("show");
        const btn = document.getElementById("continue-btn");
        if (btn) btn.focus();
        return;
      }

      letterEl.classList.remove("visible");
      // Brief fade-out then type next
      schedule(function () {
        typeWriter(letterEl, allMessages[index], function () {
          index += 1;
          schedule(showNext, delayBetween);
        });
      }, index === 0 ? 200 : 350);
    }

    // Opening message first
    if (openingEl) {
      schedule(function () {
        openingEl.classList.add("show");
        schedule(showNext, 1600);
      }, 400);
    } else {
      showNext();
    }
  }

  document.addEventListener("DOMContentLoaded", function () {
    showSequence();

    const btn = document.getElementById("continue-btn");
    if (btn) {
      btn.addEventListener("click", function () {
        clearTimers();
        window.location.href = "happy.html";
      });
    }
  });

  // Cleanup on page hide
  window.addEventListener("pagehide", clearTimers);
})();
