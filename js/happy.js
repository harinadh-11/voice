/**
 * Page 2 — Voice-controlled character stages + golden heart bursts.
 * Stages advance ONLY when sustained LOUD microphone shouts are detected.
 * Multiple separate shouts required per stage (progressive difficulty).
 * Shout detection is processed locally in the browser (Web Audio API).
 * Voice RECORDING is optional and OFF by default: it only starts after the visitor
 * ticks the consent box and presses "Start recording", it reuses the SAME microphone
 * stream (no second getUserMedia), it stays on the device, and it is uploaded only
 * if the visitor presses "Save Recording" (see the "Optional voice recording" block).
 */

(function () {
  "use strict";

  const cfg = (window.PROPOSAL_CONFIG && window.PROPOSAL_CONFIG.happy) || {};
  const TOTAL_STAGES = 5; // visual stages 0..4

  // Hold must be long enough that a clap/click does not count
  const holdMs = cfg.shoutHoldMs != null ? cfg.shoutHoldMs : 480;
  // Rest between counted shouts (one continuous yell cannot spam counts)
  const cooldownMs = cfg.shoutCooldownMs != null ? cfg.shoutCooldownMs : 1100;
  // Fixed RMS threshold (0–1) — requires a clearly loud shout; not user-adjustable
  const FIXED_THRESHOLD = cfg.baseThreshold != null ? cfg.baseThreshold : 0.30;
  const revealMsg = cfg.revealMessage || "My heart just exploded for you ✨";
  const desiredParticles = cfg.particleCount != null ? cfg.particleCount : 220;

  /**
   * How many separate qualifying shouts are required to unlock the NEXT stage.
   * Index = current stage (0..4). Stage 4's requirement unlocks the climax.
   * Early stages easier; final stages demand more effort.
   */
  const SHOUTS_TO_ADVANCE = cfg.shoutsPerStage || [1, 1, 2, 2, 3];
  const STAGE_MESSAGES = Array.isArray(cfg.stageMessages)
    ? cfg.stageMessages
    : [
        "A little spark just lit… 💛",
        "You’re making my heart race 💗",
        "I can feel the magic growing ✨",
        "Almost there — one more push 💫",
        "My heart is yours forever ❤️"
      ];

  const COLORS = ["#d4af37", "#f0d878", "#e8a0b0", "#ffd8c2", "#f5e6c8", "#ffb6c1"];
  const HEARTS = ["♥", "❤️", "💛", "🧡"];

  // ----- DOM -----
  const startBtn = document.getElementById("start-mic-btn");
  const stopBtn = document.getElementById("stop-mic-btn");
  const micStatus = document.getElementById("mic-status");
  const micIndicator = document.getElementById("mic-indicator");
  const micStatusText = document.getElementById("mic-status-text");
  const levelWrap = document.getElementById("level-meter-wrap");
  const levelFill = document.getElementById("level-fill");
  const levelMeter = document.getElementById("level-meter");
  const levelThreshold = document.getElementById("level-threshold");
  const micError = document.getElementById("mic-error");
  const stageProgress = document.getElementById("stage-progress");
  const voiceHint = document.getElementById("voice-hint");
  const characterSvg = document.getElementById("character-svg");
  const characterWrap = document.getElementById("character-wrap");
  const glow = document.getElementById("happy-bg-glow");
  const msgEl = document.getElementById("happy-message");
  const stageMsgEl = document.getElementById("stage-message");
  const nextWrap = document.getElementById("next-wrap");
  const nextBtn = document.getElementById("next-btn");
  let container = document.getElementById("heart-explosion");
  let ambientLayer = document.getElementById("ambient-hearts");

  // ----- State -----
  let stage = 0; // 0 = calm … 4 = max expression
  let shoutsInStage = 0; // qualifying shouts counted toward current stage goal
  let climaxDone = false;
  let micStream = null;
  let audioCtx = null;
  let analyser = null;
  let dataArray = null;
  let monitorRaf = null;

  // Detection state machine
  let aboveSince = 0; // when level first crossed threshold this bout
  let mustDropBelow = false; // after a counted shout, must go quiet before next
  let lastCountAt = 0; // cooldown gate
  let currentThreshold = FIXED_THRESHOLD;

  // Particles
  let particles = [];
  let particleRaf = null;
  let particlesFinished = false;

  // ----- Helpers -----
  function random(min, max) {
    return min + Math.random() * (max - min);
  }

  function show(el) {
    if (el) el.hidden = false;
  }

  function hide(el) {
    if (el) el.hidden = true;
  }

  function setError(msg) {
    if (!micError) return;
    if (msg) {
      micError.textContent = msg;
      show(micError);
    } else {
      micError.textContent = "";
      hide(micError);
    }
  }

  function requiredForStage(s) {
    return SHOUTS_TO_ADVANCE[Math.min(s, SHOUTS_TO_ADVANCE.length - 1)] || 1;
  }

  function applyFixedThresholdMarker() {
    currentThreshold = FIXED_THRESHOLD;
    if (levelThreshold) {
      // Meter fill is scaled ~2.2x for visibility; marker matches that scale, capped at 100
      const markerPct = Math.min(100, Math.round(currentThreshold * 100 * 2.2));
      levelThreshold.style.left = markerPct + "%";
    }
  }

  function updateProgressText() {
    if (!stageProgress) return;

    if (climaxDone) {
      stageProgress.textContent = "You did it! 💛";
      return;
    }

    const need = requiredForStage(stage);
    const left = Math.max(0, need - shoutsInStage);
    const stageLabel = "Stage " + (stage + 1) + "/" + TOTAL_STAGES;

    if (stage === 0 && shoutsInStage === 0) {
      stageProgress.textContent =
        stageLabel + " — shout loudly " + need + " time" + (need > 1 ? "s" : "") + " to unlock!";
    } else if (left > 0) {
      stageProgress.textContent =
        stageLabel + " — " + left + " more loud shout" + (left > 1 ? "s" : "") + " to unlock";
    } else {
      // Should not linger here; stage advances immediately when need is met
      stageProgress.textContent = stageLabel + " — unlocked!";
    }
  }

  // ----- Character stages -----
  function showStageMessage(s) {
    if (!stageMsgEl) return;
    const text = STAGE_MESSAGES[s] || "";
    if (!text) {
      stageMsgEl.classList.remove("show");
      stageMsgEl.textContent = "";
      return;
    }
    stageMsgEl.classList.remove("show");
    stageMsgEl.textContent = text;
    // Retrigger transition
    void stageMsgEl.offsetWidth;
    stageMsgEl.classList.add("show");
  }

  function syncAmbientHearts(s) {
    if (!ambientLayer) return;
    const reduced =
      window.ProposalUtils &&
      window.ProposalUtils.prefersReduced &&
      window.ProposalUtils.prefersReduced();
    // Progressive density: stage 0 = few, stage 4 = many
    const targets = reduced ? [2, 3, 4, 5, 6] : [4, 8, 14, 22, 32];
    const want = targets[Math.min(s, targets.length - 1)];
    const existing = ambientLayer.querySelectorAll(".ambient-heart");
    // Remove extras
    for (let i = existing.length - 1; i >= want; i--) {
      existing[i].remove();
    }
    // Add until target
    const colors = ["#d4af37", "#f0d878", "#e8a0b0", "#ffd8c2", "#ffb6c1"];
    for (let i = existing.length; i < want; i++) {
      const el = document.createElement("span");
      el.className = "ambient-heart";
      el.textContent = Math.random() > 0.7 ? "✨" : "♥";
      el.style.left = Math.random() * 100 + "%";
      el.style.fontSize = (0.7 + Math.random() * 1.2) + "rem";
      el.style.color = colors[Math.floor(Math.random() * colors.length)];
      el.style.animationDuration = (7 + Math.random() * 9) + "s";
      el.style.animationDelay = (Math.random() * 6) + "s";
      ambientLayer.appendChild(el);
    }
  }

  function applyStage(s, withShake) {
    if (!characterSvg) return;
    for (let i = 0; i < TOTAL_STAGES; i++) {
      characterSvg.classList.remove("stage-" + i);
    }
    characterSvg.classList.add("stage-" + s);
    characterSvg.setAttribute(
      "aria-label",
      "Cute character, stage " + (s + 1) + " of " + TOTAL_STAGES
    );

    if (withShake && characterWrap) {
      characterWrap.classList.remove("shaking");
      void characterWrap.offsetWidth;
      characterWrap.classList.add("shaking");
      setTimeout(function () {
        if (characterWrap) characterWrap.classList.remove("shaking");
      }, 450);
    }

    // Romantic line for this stage (never advances stages by itself)
    if (withShake) {
      showStageMessage(s);
    }
    syncAmbientHearts(s);
  }

  // ----- Particles -----
  function getMouthCenter() {
    if (!characterSvg) {
      return { x: window.innerWidth / 2, y: window.innerHeight * 0.42 };
    }
    const rect = characterSvg.getBoundingClientRect();
    return {
      x: rect.left + rect.width * 0.5,
      y: rect.top + rect.height * 0.62
    };
  }

  function createParticle(x, y, phase, intensity) {
    const boost = intensity || 1;
    const size =
      phase === "burst" ? random(12, 28 + 18 * boost) : random(10, 26);
    const angle = random(0, Math.PI * 2);
    const speed =
      phase === "burst"
        ? random(140, 280 + 280 * boost)
        : random(40, 150);
    const life =
      phase === "burst"
        ? random(1.0, 1.6 + 0.8 * boost)
        : random(2.2, 5.0);
    return {
      x: x,
      y: y,
      vx: Math.cos(angle) * speed,
      vy:
        Math.sin(angle) * speed -
        (phase === "burst" ? random(60, 180) : random(20, 80)),
      size: size,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      char: HEARTS[Math.floor(Math.random() * HEARTS.length)],
      life: life,
      maxLife: life,
      rotation: random(0, 360),
      spin: random(-200, 200),
      gravity: phase === "burst" ? 110 : 35,
      opacity: 1,
      el: null
    };
  }

  function spawnBurst(count, intensity) {
    const mouth = getMouthCenter();
    for (let i = 0; i < count; i++) {
      particles.push(createParticle(mouth.x, mouth.y, "burst", intensity));
    }
    startParticleLoop();
  }

  function spawnFillWave(count) {
    const w = window.innerWidth;
    const h = window.innerHeight;
    for (let i = 0; i < count; i++) {
      const edge = Math.random();
      let x, y;
      if (edge < 0.5) {
        x = random(0, w);
        y = h + random(10, 80);
      } else if (edge < 0.75) {
        x = -20;
        y = random(h * 0.3, h);
      } else {
        x = w + 20;
        y = random(h * 0.3, h);
      }
      const p = createParticle(x, y, "fill", 1);
      p.vy = -random(50, 140);
      p.vx = random(-40, 40);
      particles.push(p);
    }
    startParticleLoop();
  }

  function ensureElement(p) {
    if (p.el || !container) return;
    const el = document.createElement("span");
    el.className = "heart-particle";
    el.textContent = p.char;
    el.setAttribute("aria-hidden", "true");
    el.style.position = "absolute";
    el.style.left = "0";
    el.style.top = "0";
    el.style.fontSize = p.size + "px";
    el.style.color = p.color;
    el.style.willChange = "transform, opacity";
    el.style.pointerEvents = "none";
    el.style.textShadow = "0 0 10px " + p.color;
    container.appendChild(el);
    p.el = el;
  }

  function updateParticles(dt) {
    const survivors = [];
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        if (p.el && p.el.parentNode) p.el.parentNode.removeChild(p.el);
        continue;
      }
      p.vy += p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rotation += p.spin * dt;
      p.opacity = Math.max(0, p.life / p.maxLife);
      ensureElement(p);
      if (p.el) {
        p.el.style.transform =
          "translate(" + p.x + "px," + p.y + "px) rotate(" + p.rotation + "deg)";
        p.el.style.opacity = String(p.opacity);
      }
      survivors.push(p);
    }
    particles = survivors;
  }

  function particleLoop(last) {
    if (particlesFinished && particles.length === 0) {
      particleRaf = null;
      return;
    }
    const now = performance.now();
    const dt = Math.min(0.05, (now - last) / 1000);
    updateParticles(dt);
    particleRaf = requestAnimationFrame(function () {
      particleLoop(now);
    });
  }

  function startParticleLoop() {
    if (particleRaf) return;
    particleRaf = requestAnimationFrame(function (t) {
      particleLoop(t);
    });
  }

  function stopParticleLoop() {
    if (particleRaf) {
      cancelAnimationFrame(particleRaf);
      particleRaf = null;
    }
  }

  function clearParticles() {
    stopParticleLoop();
    particles.forEach(function (p) {
      if (p.el && p.el.parentNode) p.el.parentNode.removeChild(p.el);
    });
    particles = [];
    if (ambientLayer) ambientLayer.innerHTML = "";
  }

  function particleBudget(desired) {
    if (window.ProposalUtils && window.ProposalUtils.getParticleBudget) {
      return window.ProposalUtils.getParticleBudget(desired);
    }
    return desired;
  }

  // ----- Shout counting & stage progression -----
  function pulseHeartsForShout(rmsLevel, isStageUnlock) {
    const intensity = Math.min(
      1.5,
      0.55 + (rmsLevel / Math.max(currentThreshold, 0.05)) * 0.4
    );
    const budget = particleBudget(desiredParticles);
    // Small burst every counted shout; larger when unlocking a stage
    // Progressive intensity: small pulses mid-stage, bigger on unlock
    const unlockFracs = [0.12, 0.18, 0.26, 0.36, 0.15];
    const frac = isStageUnlock
      ? unlockFracs[Math.min(stage, 4)]
      : 0.04 + stage * 0.02;
    const count = Math.max(10, Math.floor(budget * frac * intensity));
    spawnBurst(count, intensity);
  }

  function onQualifyingShout(rmsLevel) {
    if (climaxDone) return;

    const now = performance.now();
    if (now - lastCountAt < cooldownMs) return;
    lastCountAt = now;

    // Require level to drop before another shout can count
    mustDropBelow = true;
    aboveSince = 0;

    shoutsInStage += 1;
    const need = requiredForStage(stage);
    const unlocked = shoutsInStage >= need;

    // Feedback hearts on every counted shout
    pulseHeartsForShout(rmsLevel, unlocked);

    if (!unlocked) {
      updateProgressText();
      if (micStatusText) {
        micStatusText.textContent = "Nice! Keep shouting…";
      }
      return;
    }

    // Stage unlock
    shoutsInStage = 0;

    if (stage < TOTAL_STAGES - 1) {
      stage += 1;
      applyStage(stage, true);

      if (stage >= 2 && glow) {
        glow.classList.add("active");
        glow.style.opacity = String(0.25 + stage * 0.12);
      }

      updateProgressText();
      if (micStatusText) {
        micStatusText.textContent = "Stage unlocked! Shout louder…";
      }
      return;
    }

    // Already on final visual stage — this unlock completes the challenge
    triggerClimax(rmsLevel);
  }

  function triggerClimax(rmsLevel) {
    climaxDone = true;
    stopRecording("complete"); // Level 5 completed → recording ends (no-op if not recording)
    applyStage(TOTAL_STAGES - 1, true);

    const intensity = Math.min(
      1.5,
      0.7 + (rmsLevel / Math.max(currentThreshold, 0.05)) * 0.4
    );
    const budget = particleBudget(desiredParticles);
    const reduced =
      window.ProposalUtils &&
      window.ProposalUtils.prefersReduced &&
      window.ProposalUtils.prefersReduced();

    if (glow) {
      glow.classList.add("active");
      glow.style.opacity = "1";
    }

    // Spectacular full-screen golden heart climax
    spawnBurst(Math.floor(budget * 0.5 * (reduced ? 0.4 : 1) * intensity), intensity);
    setTimeout(function () {
      spawnBurst(Math.floor(budget * 0.28 * (reduced ? 0.4 : 1)), 1.2);
    }, 180);
    setTimeout(function () {
      spawnFillWave(Math.floor(budget * 0.3 * (reduced ? 0.5 : 1)));
    }, 450);
    setTimeout(function () {
      spawnFillWave(Math.floor(budget * 0.25 * (reduced ? 0.5 : 1)));
    }, 950);
    setTimeout(function () {
      spawnFillWave(Math.floor(budget * 0.2 * (reduced ? 0.5 : 1)));
    }, 1600);
    setTimeout(function () {
      spawnFillWave(Math.floor(budget * 0.15 * (reduced ? 0.5 : 1)));
    }, 2200);

    setTimeout(function () {
      if (msgEl) {
        msgEl.textContent = revealMsg;
        msgEl.classList.add("show");
      }
    }, 2800);

    setTimeout(function () {
      if (nextWrap) {
        nextWrap.classList.add("show");
        if (nextBtn) nextBtn.focus();
      }
      particlesFinished = true;
      stopMicrophone();
      revealRecordingReview(); // show Play / Save / Discard once the finale has played
      updateProgressText();
      if (voiceHint) {
        voiceHint.textContent = "Your voice made the magic happen.";
      }
    }, 3600);
  }

  // ----- Audio analysis (RMS) -----
  function computeRms() {
    if (!analyser || !dataArray) return 0;
    analyser.getByteTimeDomainData(dataArray);
    let sum = 0;
    for (let i = 0; i < dataArray.length; i++) {
      const v = (dataArray[i] - 128) / 128;
      sum += v * v;
    }
    return Math.sqrt(sum / dataArray.length);
  }

  function monitorLoop() {
    if (!analyser) return;

    const rms = computeRms();

    // Level meter (scaled for visibility)
    const pct = Math.min(100, Math.round(rms * 100 * 2.2));
    if (levelFill) levelFill.style.width = pct + "%";
    if (levelMeter) levelMeter.setAttribute("aria-valuenow", String(pct));

    const now = performance.now();
    const dropLine = currentThreshold * 0.72; // hysteresis

    // After a counted shout, wait until level falls clearly below threshold
    if (mustDropBelow) {
      if (rms < dropLine) {
        mustDropBelow = false;
        aboveSince = 0;
      }
      monitorRaf = requestAnimationFrame(monitorLoop);
      return;
    }

    if (rms >= currentThreshold) {
      if (!aboveSince) aboveSince = now;
      if (now - aboveSince >= holdMs) {
        // Sustained loud sound long enough → one qualifying shout
        onQualifyingShout(rms);
        // onQualifyingShout sets mustDropBelow + clears aboveSince
      }
    } else if (rms < dropLine) {
      aboveSince = 0;
    }

    monitorRaf = requestAnimationFrame(monitorLoop);
  }

  // ----- Microphone lifecycle -----
  async function startMicrophone(withRecording) {
    setError("");

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setError(
        "This browser doesn’t support microphone access. Try Chrome, Edge, or Safari on a secure (https) connection."
      );
      return;
    }

    try {
      micStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: false // avoid boosting quiet speech into "shouts"
        },
        video: false
      });
    } catch (err) {
      const name = (err && err.name) || "";
      if (name === "NotAllowedError" || name === "PermissionDeniedError") {
        setError(
          "Microphone permission was denied. You can still enjoy the page — enable the mic in your browser settings if you’d like to try the voice magic."
        );
      } else if (name === "NotFoundError" || name === "DevicesNotFoundError") {
        setError("No microphone was found. Plug one in or check your device settings.");
      } else if (name === "NotReadableError" || name === "TrackStartError") {
        setError("The microphone is busy or muted. Close other apps using it and try again.");
      } else {
        setError(
          "Could not open the microphone. (" +
            (err.message || name || "unknown error") +
            ")"
        );
      }
      return;
    }

    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      audioCtx = new Ctx();
      if (audioCtx.state === "suspended") {
        await audioCtx.resume();
      }
      const source = audioCtx.createMediaStreamSource(micStream);
      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.55;
      source.connect(analyser);
      // Never connect to destination — no feedback / no mic playback
      dataArray = new Uint8Array(analyser.fftSize);

      applyFixedThresholdMarker();
      aboveSince = 0;
      mustDropBelow = false;
      lastCountAt = 0;
      shoutsInStage = 0;

      hide(startBtn);
      show(stopBtn);
      show(micStatus);
      show(levelWrap);
      show(stageProgress);
      if (micIndicator) micIndicator.classList.add("live");
      if (micStatusText) {
        micStatusText.textContent = "Listening… shout LOUDLY to advance!";
      }
      if (voiceHint) {
        voiceHint.textContent =
          "Shout loud and hold it — soft talking won’t unlock the stages.";
      }
      updateProgressText();

      monitorRaf = requestAnimationFrame(monitorLoop);

      // Only when the visitor consented: record from the SAME stream (never throws).
      if (withRecording) beginRecording();
    } catch (err) {
      setError("Audio setup failed. (" + ((err && err.message) || "error") + ")");
      stopMicrophone();
    }
  }

  function stopMicrophone() {
    // Finish any recording BEFORE the tracks are stopped so the last audio is flushed.
    stopRecording(climaxDone ? "complete" : "user");

    if (monitorRaf) {
      cancelAnimationFrame(monitorRaf);
      monitorRaf = null;
    }

    if (micStream) {
      micStream.getTracks().forEach(function (t) {
        try {
          t.stop();
        } catch (e) {
          /* ignore */
        }
      });
      micStream = null;
    }

    if (audioCtx) {
      try {
        audioCtx.close();
      } catch (e) {
        /* ignore */
      }
      audioCtx = null;
    }
    analyser = null;
    dataArray = null;
    aboveSince = 0;
    mustDropBelow = false;

    if (micIndicator) micIndicator.classList.remove("live");
    if (micStatusText) micStatusText.textContent = "Microphone off";
    hide(stopBtn);

    if (!climaxDone) {
      show(startBtn);
      hide(levelWrap);
    } else {
      hide(startBtn);
      hide(levelWrap);
      hide(micStatus);
    }
  }

  // =====================================================================
  // Optional voice recording
  //   • Off by default. Starts ONLY after the visitor ticks the consent box and
  //     presses "Start recording" (and the browser grants the microphone).
  //   • Records from the SAME MediaStream used for shout detection — no second
  //     getUserMedia call, and the Web Audio detection above is untouched.
  //   • Stays in memory on this device. Uploaded ONLY when "Save Recording" is
  //     pressed, to the private Storage bucket "voice-recordings" (anon key + RLS;
  //     no service-role key exists anywhere in this site).
  // =====================================================================
  const recCfg = cfg.recording || {};

  function clampNum(v, min, max, dflt) {
    v = Number(v);
    return isFinite(v) ? Math.min(max, Math.max(min, v)) : dflt;
  }

  const REC_BUCKET = "voice-recordings";
  const REC_HARD_MAX_BYTES = 5 * 1024 * 1024; // equals the bucket's file_size_limit
  const REC_MAX_SECONDS = Math.round(clampNum(recCfg.maxDurationSeconds, 10, 600, 240));
  const REC_MAX_BYTES = Math.round(
    clampNum(recCfg.maxBytes, 50 * 1024, REC_HARD_MAX_BYTES - 512 * 1024, 4 * 1024 * 1024)
  );
  const REC_BITRATE = Math.round(clampNum(recCfg.audioBitsPerSecond, 16000, 128000, 32000));
  const REC_MIN_BYTES = 1500; // anything smaller is treated as "nothing recorded"
  const REC_UPLOAD_TIMEOUT_MS = 60000;
  // [recorder mimeType, bare type sent to Storage, file extension] — all on the bucket allow-list
  const REC_TYPES = [
    { mime: "audio/webm;codecs=opus", base: "audio/webm", ext: "webm" },
    { mime: "audio/webm", base: "audio/webm", ext: "webm" },
    { mime: "audio/ogg;codecs=opus", base: "audio/ogg", ext: "ogg" },
    { mime: "audio/mp4", base: "audio/mp4", ext: "m4a" }
  ];

  let recorder = null;
  let recType = null;
  let recChunks = [];
  let recBytes = 0;
  let recStartedAt = 0;
  let recEndedAt = 0;
  let recStopReason = null; // "complete" | "user" | "limit" | "error" | null (unexpected)
  let recLimitId = null;

  let recBlob = null;
  let recObjectUrl = null;
  let recDuration = 0;
  let recName = null; // generated once per recording so a retry can never create a second file
  let recReady = false;
  let recRevealAllowed = false;
  let recSaved = false;
  let recUploading = false;
  let recAudioEl = null;
  let nextWarned = false;
  let micLaunching = false;
  let leavingPage = false;
  let consentReturnFocus = null;

  function $(id) {
    return document.getElementById(id);
  }

  function fmtClock(sec) {
    sec = Math.max(0, Math.floor(sec));
    return Math.floor(sec / 60) + ":" + ("0" + (sec % 60)).slice(-2);
  }

  function fmtBytes(n) {
    if (n < 1024 * 1024) return Math.max(1, Math.round(n / 1024)) + " KB";
    return (n / (1024 * 1024)).toFixed(1) + " MB";
  }

  function recNotice(msg) {
    const el = $("rec-notice");
    if (!el) return;
    el.textContent = msg || "";
    el.hidden = !msg;
  }

  function setRecStatus(msg, isError) {
    const el = $("rec-status");
    if (!el) return;
    el.textContent = msg || "";
    el.classList.toggle("error", !!isError);
  }

  function setRecIndicator(on) {
    const el = $("rec-indicator");
    if (el) el.hidden = !on;
  }

  function pickRecorderType() {
    if (typeof window.MediaRecorder !== "function") return null;
    for (let i = 0; i < REC_TYPES.length; i++) {
      try {
        if (window.MediaRecorder.isTypeSupported(REC_TYPES[i].mime)) return REC_TYPES[i];
      } catch (e) {
        /* try next */
      }
    }
    return null;
  }

  function newUuid() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
      return window.crypto.randomUUID().toLowerCase();
    }
    const b = new Uint8Array(16);
    window.crypto.getRandomValues(b);
    b[6] = (b[6] & 0x0f) | 0x40;
    b[8] = (b[8] & 0x3f) | 0x80;
    const h = Array.prototype.map
      .call(b, function (x) {
        return ("0" + x.toString(16)).slice(-2);
      })
      .join("");
    return [h.slice(0, 8), h.slice(8, 12), h.slice(12, 16), h.slice(16, 20), h.slice(20)].join("-");
  }

  function hasUnsavedRecording() {
    return !!recBlob && !recSaved;
  }

  // ----- Consent dialog -----
  function focusables(root) {
    return Array.prototype.filter.call(
      root.querySelectorAll('button, input, [href], [tabindex]:not([tabindex="-1"])'),
      function (el) {
        return !el.disabled && !el.hidden && el.offsetParent !== null;
      }
    );
  }

  function openConsent() {
    if (micLaunching || micStream) return;
    if (recUploading) {
      recNotice("Please wait — your recording is still uploading.");
      return;
    }
    if (hasUnsavedRecording()) {
      // Never overwrite an unsaved recording: keep it on screen and let the visitor decide first.
      // (Only reachable after they stopped the microphone mid-game; not shown on a normal page open.)
      revealRecordingReview();
      recNotice("Please Save Recording or Discard your last recording first, then you can start again.");
      return;
    }
    const overlay = $("consent-overlay");
    const dialog = $("consent-dialog");
    if (!overlay || !dialog) {
      // Consent UI missing → never record; behave exactly as before.
      launchMicrophone(false);
      return;
    }
    if (!pickRecorderType()) {
      recNotice("This browser can’t record audio in a format we can save — the voice magic works as usual.");
      launchMicrophone(false);
      return;
    }

    const check = $("consent-check");
    const startRec = $("consent-start-btn");
    if (check) check.checked = false;
    if (startRec) startRec.disabled = true;

    consentReturnFocus = document.activeElement;
    overlay.hidden = false;
    const page = $("happy-page");
    if (page) {
      page.inert = true;
      page.setAttribute("aria-hidden", "true");
    }
    (check || dialog).focus();
  }

  function closeConsent(restoreFocus) {
    const overlay = $("consent-overlay");
    if (overlay) overlay.hidden = true;
    const page = $("happy-page");
    if (page) {
      page.inert = false;
      page.removeAttribute("aria-hidden");
    }
    if (restoreFocus && consentReturnFocus && typeof consentReturnFocus.focus === "function") {
      consentReturnFocus.focus();
    }
    consentReturnFocus = null;
  }

  function onConsentKeydown(e) {
    if (e.key === "Escape") {
      e.preventDefault();
      closeConsent(true); // Escape = Cancel: nothing starts
      return;
    }
    if (e.key !== "Tab") return;
    const dialog = $("consent-dialog");
    const items = dialog ? focusables(dialog) : [];
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && (document.activeElement === first || document.activeElement === dialog)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  function onConsentStartRecording() {
    const check = $("consent-check");
    if (!check || !check.checked) return; // explicit agreement is mandatory
    closeConsent(false);
    discardRecording(true);
    launchMicrophone(true);
  }

  function onConsentSkip() {
    closeConsent(false);
    discardRecording(true);
    launchMicrophone(false);
  }

  async function launchMicrophone(withRecording) {
    if (micLaunching || micStream) return;
    micLaunching = true;
    try {
      await startMicrophone(!!withRecording);
    } finally {
      micLaunching = false;
    }
    if (withRecording && !micStream) {
      recNotice("The microphone didn’t start, so nothing was recorded.");
    }
  }

  // ----- Recorder lifecycle -----
  function clearRecTimers() {
    // Only the internal duration-limit timer remains; no elapsed time is ever shown on screen.
    if (recLimitId) {
      clearTimeout(recLimitId);
      recLimitId = null;
    }
  }

  function beginRecording() {
    try {
      recNotice("");
      const type = pickRecorderType();
      if (!type) {
        recNotice("This browser can’t record audio in a format we can save — the voice magic works as usual.");
        return;
      }
      if (!micStream) return;

      recType = type;
      recChunks = [];
      recBytes = 0;
      recStopReason = null;
      recRevealAllowed = false;
      recReady = false;

      // SAME stream object that feeds the analyser — no second permission prompt.
      const r = new window.MediaRecorder(micStream, {
        mimeType: type.mime,
        audioBitsPerSecond: REC_BITRATE
      });
      r.ondataavailable = function (ev) {
        if (!ev.data || !ev.data.size) return;
        recChunks.push(ev.data);
        recBytes += ev.data.size;
        if (recBytes >= REC_MAX_BYTES && recorder === r && r.state !== "inactive") {
          recNotice("Recording size limit reached — the recording was stopped; the voice magic continues.");
          stopRecording("limit");
        }
      };
      r.onerror = function (ev) {
        const m = ev && ev.error && ev.error.message ? ev.error.message : "unknown error";
        console.warn("[recording] recorder error:", m);
        recNotice("A recording problem occurred. What was captured so far is kept; the voice magic continues.");
        stopRecording("error");
      };
      r.onstop = finalizeRecording;

      recorder = r;
      recStartedAt = performance.now();
      r.start(1000); // 1-second chunks so size can be enforced while recording
      setRecIndicator(true);
      recLimitId = setTimeout(function () {
        if (recorder === r && r.state !== "inactive") {
          recNotice(
            "Recording time limit (" + fmtClock(REC_MAX_SECONDS) + ") reached — the recording was stopped; the voice magic continues."
          );
          stopRecording("limit");
        }
      }, REC_MAX_SECONDS * 1000);
    } catch (err) {
      console.warn("[recording] could not start:", err && err.message);
      recorder = null;
      clearRecTimers();
      setRecIndicator(false);
      recNotice("Recording couldn’t start (" + ((err && err.message) || "error") + "). The voice magic works as usual.");
    }
  }

  function stopRecording(reason) {
    if (!recorder || recorder.state === "inactive") return;
    if (!recStopReason) recStopReason = reason;
    recEndedAt = performance.now();
    clearRecTimers();
    setRecIndicator(false);
    try {
      recorder.stop(); // → ondataavailable (final chunk) → onstop → finalizeRecording
    } catch (e) {
      finalizeRecording();
    }
  }

  function finalizeRecording() {
    const r = recorder;
    if (!r) return;
    recorder = null;
    clearRecTimers();
    setRecIndicator(false);

    const reason = recStopReason || "unexpected";
    const endedAt = recEndedAt || performance.now();
    recEndedAt = 0;
    const chunks = recChunks;
    recChunks = [];
    if (leavingPage) return; // page is closing — never keep or upload anything

    const blob = new Blob(chunks, { type: recType ? recType.base : "audio/webm" });
    if (blob.size < REC_MIN_BYTES) {
      recNotice("Nothing was recorded.");
      return;
    }
    if (blob.size > REC_HARD_MAX_BYTES) {
      recNotice("That recording is too large to save, so it was discarded.");
      return;
    }

    clearRecordingData();
    recBlob = blob;
    recObjectUrl = URL.createObjectURL(blob);
    recDuration = Math.max(1, Math.min(9999, Math.round((endedAt - recStartedAt) / 1000)));
    recName = null;
    recSaved = false;
    recReady = true;
    nextWarned = false;
    if (reason === "user" || reason === "error" || reason === "unexpected") recRevealAllowed = true;
    maybeShowReview();
  }

  // ----- Review panel: Play / Save Recording / Discard -----
  function clearRecordingData() {
    if (recAudioEl) {
      try {
        recAudioEl.pause();
      } catch (e) {
        /* ignore */
      }
      recAudioEl = null;
    }
    if (recObjectUrl) {
      try {
        URL.revokeObjectURL(recObjectUrl);
      } catch (e) {
        /* ignore */
      }
      recObjectUrl = null;
    }
    recBlob = null;
    recName = null;
    recReady = false;
    recSaved = false;
  }

  function discardRecording(silent) {
    if (recUploading) return;
    clearRecordingData();
    recRevealAllowed = false;
    const panel = $("rec-review");
    if (panel) panel.hidden = true;
    setRecStatus("");
    recNotice(silent ? "" : "Recording discarded. Nothing was uploaded.");
  }

  function maybeShowReview() {
    if (!recReady || !recBlob || !recRevealAllowed || leavingPage) return;
    const panel = $("rec-review");
    if (!panel) return;

    const meta = $("rec-meta");
    if (meta) meta.textContent = fmtBytes(recBlob.size); // size only — elapsed time is not displayed
    const play = $("rec-play-btn");
    const save = $("rec-save-btn");
    const disc = $("rec-discard-btn");
    const close = $("rec-close-btn");
    if (play) {
      play.hidden = false;
      play.disabled = false;
      play.textContent = "▶ Play";
    }
    if (save) {
      save.hidden = false;
      save.disabled = false;
      save.textContent = "Save Recording";
    }
    if (disc) {
      disc.hidden = false;
      disc.disabled = false;
    }
    if (close) close.hidden = true;
    setRecStatus("It’s only on this device so far. Nothing is uploaded unless you press Save Recording.");
    recNotice("");
    panel.hidden = false;
  }

  function revealRecordingReview() {
    recRevealAllowed = true;
    maybeShowReview();
  }

  function onPlayClick() {
    if (!recBlob || !recObjectUrl) return;
    const play = $("rec-play-btn");
    try {
      if (!recAudioEl) {
        recAudioEl = new Audio(recObjectUrl);
        recAudioEl.addEventListener("ended", function () {
          if (play) play.textContent = "▶ Play";
        });
        recAudioEl.addEventListener("error", function () {
          if (play) play.textContent = "▶ Play";
          setRecStatus("This browser couldn’t play the recording back.", true);
        });
      }
      if (recAudioEl.paused) {
        const p = recAudioEl.play();
        if (play) play.textContent = "⏸ Pause";
        if (p && typeof p.catch === "function") {
          p.catch(function () {
            if (play) play.textContent = "▶ Play";
            setRecStatus("Playback was blocked by the browser. Try pressing Play again.", true);
          });
        }
      } else {
        recAudioEl.pause();
        if (play) play.textContent = "▶ Play";
      }
    } catch (e) {
      setRecStatus("This browser couldn’t play the recording back.", true);
    }
  }

  function describeUploadError(err) {
    const code = String((err && (err.statusCode || err.status)) || "");
    const msg = String((err && err.message) || "");
    console.warn("[recording] upload failed:", code, msg);
    if (code === "404" || /bucket not found/i.test(msg)) {
      return "The private recording store isn’t set up yet. Please tell the site owner.";
    }
    if (code === "413" || /exceeded the maximum|too large|payload/i.test(msg)) {
      return "That recording is too large to save.";
    }
    if (code === "415" || /mime type/i.test(msg)) {
      return "This audio format isn’t accepted.";
    }
    if (code === "401" || code === "403" || /row-level security|unauthorized|forbidden/i.test(msg)) {
      return "Saving isn’t allowed right now (the recording limit may be reached, or the site owner hasn’t finished the Storage setup).";
    }
    return "Couldn’t save the recording. Check your connection and try again.";
  }

  function withTimeout(promise, ms) {
    return new Promise(function (resolve, reject) {
      const t = setTimeout(function () {
        reject(new Error("timeout"));
      }, ms);
      promise.then(
        function (v) {
          clearTimeout(t);
          resolve(v);
        },
        function (e) {
          clearTimeout(t);
          reject(e);
        }
      );
    });
  }

  async function uploadRecording() {
    const db = window.ProposalDB;
    if (!db || !db.isConfigured()) {
      return {
        ok: false,
        error: "Online saving isn’t set up yet (the site owner must add the Supabase URL and key in js/config.js)."
      };
    }
    if (navigator.onLine === false) {
      return { ok: false, error: "You seem to be offline. Reconnect, then press Retry upload." };
    }
    const sb = db.getClient();
    if (!sb || !sb.storage) {
      return { ok: false, error: "Couldn’t reach the storage service. Please try again." };
    }
    try {
      const res = await withTimeout(
        sb.storage.from(REC_BUCKET).upload(recName, recBlob, {
          contentType: recType.base,
          cacheControl: "3600",
          upsert: false
        }),
        REC_UPLOAD_TIMEOUT_MS
      );
      if (res && res.error) {
        const code = String(res.error.statusCode || res.error.status || "");
        // The file name is a random UUID chosen once per recording, so "already exists" means an
        // earlier attempt of THIS recording actually arrived (e.g. the response got lost): success.
        if (code === "409" || /already exists|duplicate/i.test(String(res.error.message || ""))) {
          return { ok: true };
        }
        return { ok: false, error: describeUploadError(res.error) };
      }
      return { ok: true };
    } catch (err) {
      if (err && err.message === "timeout") {
        return { ok: false, error: "The upload took too long. Check your connection and press Retry upload." };
      }
      console.warn("[recording] upload exception:", err && err.message);
      return { ok: false, error: "Network problem while saving. Check your connection and press Retry upload." };
    }
  }

  async function onSaveClick() {
    if (!recBlob || recUploading || recSaved) return; // upload happens ONLY from this explicit click
    const save = $("rec-save-btn");
    const disc = $("rec-discard-btn");
    if (!recName) recName = newUuid() + "-" + recDuration + "s." + recType.ext;

    recUploading = true;
    if (save) {
      save.disabled = true;
      save.textContent = "Saving…";
    }
    if (disc) disc.disabled = true;
    setRecStatus("Saving privately…");

    const result = await uploadRecording();
    recUploading = false;

    if (!recBlob) return; // page state changed while uploading
    if (result.ok) {
      recSaved = true;
      nextWarned = false;
      setRecStatus("Saved ✓ Thank you 💛 Only the site’s administrator can listen to it.");
      if (save) save.hidden = true;
      if (disc) disc.hidden = true;
      const close = $("rec-close-btn");
      if (close) close.hidden = false;
    } else {
      setRecStatus(result.error, true);
      if (save) {
        save.disabled = false;
        save.textContent = "Retry upload";
      }
      if (disc) disc.disabled = false;
    }
  }

  function onCloseReviewClick() {
    clearRecordingData();
    const panel = $("rec-review");
    if (panel) panel.hidden = true;
    setRecStatus("");
  }

  function initRecordingUi() {
    const check = $("consent-check");
    const startRec = $("consent-start-btn");
    const skip = $("consent-skip-btn");
    const cancel = $("consent-cancel-btn");
    const overlay = $("consent-overlay");

    if (check && startRec) {
      check.addEventListener("change", function () {
        startRec.disabled = !check.checked;
      });
    }
    if (startRec) startRec.addEventListener("click", onConsentStartRecording);
    if (skip) skip.addEventListener("click", onConsentSkip);
    if (cancel) {
      cancel.addEventListener("click", function () {
        closeConsent(true);
      });
    }
    if (overlay) overlay.addEventListener("keydown", onConsentKeydown);

    const play = $("rec-play-btn");
    const save = $("rec-save-btn");
    const disc = $("rec-discard-btn");
    const close = $("rec-close-btn");
    if (play) play.addEventListener("click", onPlayClick);
    if (save) save.addEventListener("click", onSaveClick);
    if (disc) {
      disc.addEventListener("click", function () {
        discardRecording(false);
      });
    }
    if (close) close.addEventListener("click", onCloseReviewClick);
  }

  // ----- Events -----
  function onStartClick() {
    // Opens the consent screen. The microphone (and any recording) starts only from its buttons.
    openConsent();
  }

  function onStopClick() {
    stopMicrophone();
    if (micStatusText) micStatusText.textContent = "Microphone stopped";
    show(micStatus);
    revealRecordingReview();
  }

  function onNextClick() {
    if (recUploading) {
      recNotice("Please wait — your recording is still uploading.");
      return;
    }
    if (hasUnsavedRecording() && !nextWarned) {
      nextWarned = true;
      revealRecordingReview();
      recNotice(
        "You have an unsaved recording. Press Save Recording or Discard — or press Next again to continue without saving."
      );
      return;
    }
    stopMicrophone();
    clearParticles();
    window.location.href = "final.html";
  }

  function onPageHide() {
    leavingPage = true; // anything unsaved is dropped; nothing is ever auto-uploaded
    stopMicrophone();
    clearParticles();
    clearRecordingData();
  }

  document.addEventListener("DOMContentLoaded", function () {
    container = document.getElementById("heart-explosion");
    ambientLayer = document.getElementById("ambient-hearts");
    applyStage(0, false);
    applyFixedThresholdMarker();
    initRecordingUi();

    if (startBtn) startBtn.addEventListener("click", onStartClick);
    if (stopBtn) stopBtn.addEventListener("click", onStopClick);
    if (nextBtn) nextBtn.addEventListener("click", onNextClick);
  });

  window.addEventListener("pagehide", onPageHide);
  window.addEventListener("beforeunload", onPageHide);
  window.addEventListener("pageshow", function (e) {
    if (e.persisted) leavingPage = false; // restored from the back/forward cache
  });
})();
