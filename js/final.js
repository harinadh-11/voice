/**
 * Page 3 — Final proposal with YES / NO and Supabase submission.
 */

(function () {
  "use strict";

  const cfg = (window.PROPOSAL_CONFIG && window.PROPOSAL_CONFIG.final) || {};
  const question = cfg.question || "Will you be my forever person? ❤️";
  const yesMsg = cfg.yesMessage || "You just made my world brighter. ❤️";
  const noMsg = cfg.noMessage || "Thank you for being honest. ❤️";
  const noClosing = cfg.noClosing || "Whatever you decide, I still cherish every moment with you.";
  const thinkAgainLabel = cfg.thinkAgainLabel || "Think again 💗";

  let submitting = false;

  function $(id) {
    return document.getElementById(id);
  }

  function show(el) {
    if (el) el.hidden = false;
  }

  function hide(el) {
    if (el) el.hidden = true;
  }

  function setLoading(on) {
    const loader = $("submit-loading");
    if (loader) loader.hidden = !on;
    const yesBtn = $("btn-yes");
    const noBtn = $("btn-no");
    if (yesBtn) yesBtn.disabled = on;
    if (noBtn) noBtn.disabled = on;
  }

  function showError(msg) {
    const err = $("submit-error");
    if (!err) return;
    err.textContent = msg || "Something went wrong. Please try again.";
    err.hidden = false;
  }

  function clearError() {
    const err = $("submit-error");
    if (err) {
      err.textContent = "";
      err.hidden = true;
    }
  }

  function celebrateYes() {
    const result = $("result-area");
    const choices = $("choices");
    const questionEl = $("proposal-question");
    hide(choices);
    if (questionEl) questionEl.style.opacity = "0.4";

    if (result) {
      result.innerHTML = "";
      const p = document.createElement("p");
      p.className = "result-message";
      p.id = "yes-result";
      p.textContent = yesMsg;
      result.appendChild(p);
      show(result);
      requestAnimationFrame(function () {
        p.classList.add("show");
      });
    }

    // Extra celebration hearts
    spawnCelebrationHearts(60);
  }

  function showNoResult() {
    const result = $("result-area");
    const choices = $("choices");
    hide(choices);

    if (result) {
      result.innerHTML = "";
      const p = document.createElement("p");
      p.className = "result-message";
      p.textContent = noMsg;
      result.appendChild(p);

      const actions = document.createElement("div");
      actions.className = "admin-actions";
      actions.style.justifyContent = "center";
      actions.style.marginTop = "1.5rem";

      const thinkBtn = document.createElement("button");
      thinkBtn.type = "button";
      thinkBtn.className = "btn btn-primary";
      thinkBtn.textContent = thinkAgainLabel;
      thinkBtn.addEventListener("click", function () {
        result.innerHTML = "";
        hide(result);
        show(choices);
        clearError();
        submitting = false;
        setLoading(false);
      });

      const continueBtn = document.createElement("button");
      continueBtn.type = "button";
      continueBtn.className = "btn btn-secondary";
      continueBtn.textContent = "Continue";
      continueBtn.addEventListener("click", function () {
        result.innerHTML = "";
        const close = document.createElement("p");
        close.className = "result-message show";
        close.textContent = noClosing;
        result.appendChild(close);
      });

      actions.appendChild(thinkBtn);
      actions.appendChild(continueBtn);
      result.appendChild(actions);
      show(result);
      requestAnimationFrame(function () {
        p.classList.add("show");
      });
    }
  }

  function spawnCelebrationHearts(count) {
    const layer = $("celebration-hearts");
    if (!layer) return;
    const reduced = window.ProposalUtils && window.ProposalUtils.prefersReduced();
    const n = reduced ? 8 : count;
    const colors = ["#d4af37", "#f0d878", "#e8a0b0", "#ffd8c2"];

    for (let i = 0; i < n; i++) {
      const el = document.createElement("span");
      el.className = "heart-particle";
      el.textContent = "♥";
      el.setAttribute("aria-hidden", "true");
      el.style.left = Math.random() * 100 + "%";
      el.style.top = "100%";
      el.style.fontSize = (12 + Math.random() * 28) + "px";
      el.style.color = colors[Math.floor(Math.random() * colors.length)];
      el.style.opacity = "0.95";
      el.style.transition = "transform " + (2 + Math.random() * 2.5) + "s ease-out, opacity " + (2 + Math.random() * 2) + "s ease-out";
      layer.appendChild(el);

      requestAnimationFrame(function () {
        const dx = (Math.random() - 0.5) * 200;
        const dy = -(window.innerHeight * (0.5 + Math.random() * 0.5));
        el.style.transform = "translate(" + dx + "px, " + dy + "px) rotate(" + (Math.random() * 360) + "deg)";
        el.style.opacity = "0";
      });

      setTimeout(function () {
        if (el.parentNode) el.parentNode.removeChild(el);
      }, 5000);
    }
  }

  async function handleAnswer(answer) {
    if (submitting) return;
    submitting = true;
    clearError();
    setLoading(true);

    const db = window.ProposalDB;
    if (!db) {
      setLoading(false);
      showError("Database helper is missing. Please refresh the page.");
      submitting = false;
      return;
    }

    const result = await db.submitResponse(answer);
    setLoading(false);

    if (!result.ok) {
      showError(result.error);
      // Allow retry
      submitting = false;
      const retryArea = $("retry-area");
      if (retryArea) {
        retryArea.innerHTML = "";
        const retryBtn = document.createElement("button");
        retryBtn.type = "button";
        retryBtn.className = "btn btn-primary";
        retryBtn.textContent = "Try again";
        retryBtn.style.marginTop = "0.75rem";
        retryBtn.addEventListener("click", function () {
          retryArea.innerHTML = "";
          handleAnswer(answer);
        });
        retryArea.appendChild(retryBtn);
        show(retryArea);
      }
      return;
    }

    // Success — only show success UI after confirmed save
    if (answer === "YES") {
      celebrateYes();
    } else {
      showNoResult();
    }
  }

  document.addEventListener("DOMContentLoaded", function () {
    const q = $("proposal-question");
    if (q) {
      q.textContent = question;
      requestAnimationFrame(function () {
        q.classList.add("show");
      });
    }

    const yesBtn = $("btn-yes");
    const noBtn = $("btn-no");

    if (yesBtn) {
      yesBtn.addEventListener("click", function () {
        handleAnswer("YES");
      });
    }
    if (noBtn) {
      noBtn.addEventListener("click", function () {
        handleAnswer("NO");
      });
    }

    // Warn if Supabase is not configured (developer notice only)
    if (window.ProposalDB && !window.ProposalDB.isConfigured()) {
      console.info(
        "[Proposal] Supabase is not configured. Responses will not be saved online until you add your project URL and anon key in js/config.js. See README.md."
      );
    }
  });
})();
