/**
 * Private admin dashboard — requires Supabase Auth.
 * Responses are only readable by authenticated administrators (RLS).
 */

(function () {
  "use strict";

  function $(id) {
    return document.getElementById(id);
  }

  function show(el) {
    if (el) el.hidden = false;
  }

  function hide(el) {
    if (el) el.hidden = true;
  }

  function formatTime(iso) {
    if (!iso) return "—";
    try {
      const d = new Date(iso);
      return d.toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short"
      });
    } catch (e) {
      return iso;
    }
  }

  function renderResponses(rows) {
    const list = $("response-list");
    const empty = $("empty-state");
    if (!list) return;

    list.innerHTML = "";
    if (!rows || rows.length === 0) {
      show(empty);
      return;
    }
    hide(empty);

    rows.forEach(function (row) {
      const li = document.createElement("li");
      li.className = "response-item " + (row.answer === "YES" ? "yes" : "no");
      li.innerHTML =
        '<span class="response-answer">' +
        (row.answer === "YES" ? "YES ❤️" : "NO 💔") +
        "</span>" +
        '<span class="response-time">' +
        formatTime(row.created_at) +
        "</span>";
      list.appendChild(li);
    });
  }

  async function loadResponses() {
    const loading = $("responses-loading");
    const errEl = $("responses-error");
    show(loading);
    hide(errEl);

    const result = await window.ProposalDB.fetchResponses();
    hide(loading);

    if (!result.ok) {
      if (errEl) {
        errEl.textContent = result.error || "Could not load responses.";
        show(errEl);
      }
      return;
    }
    renderResponses(result.data);
  }

  // ----- Voice recordings (private bucket; admin-only via RLS + short-lived signed URLs) -----
  const REC_BUCKET = "voice-recordings";
  const REC_NAME_RE = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})-(\d{1,4})s\.(webm|ogg|m4a)$/;
  const PLAY_URL_SECONDS = 300;
  const DOWNLOAD_URL_SECONDS = 120;

  function fmtDuration(sec) {
    sec = Math.max(0, Number(sec) || 0);
    return Math.floor(sec / 60) + ":" + ("0" + (sec % 60)).slice(-2);
  }

  function fmtSize(bytes) {
    if (!bytes && bytes !== 0) return "—";
    if (bytes < 1024 * 1024) return Math.max(1, Math.round(bytes / 1024)) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  }

  function recordingsClient() {
    const sb = window.ProposalDB && window.ProposalDB.getClient();
    return sb && sb.storage ? sb : null;
  }

  async function signedUrl(name, seconds, downloadAs) {
    const sb = recordingsClient();
    if (!sb) return { error: "Not connected." };
    const opts = downloadAs ? { download: downloadAs } : undefined;
    const res = await sb.storage.from(REC_BUCKET).createSignedUrl(name, seconds, opts);
    if (res.error || !res.data || !res.data.signedUrl) {
      return { error: (res.error && res.error.message) || "Could not create a secure link." };
    }
    return { url: res.data.signedUrl };
  }

  function renderRecordings(files) {
    const list = $("recordings-list");
    if (!list) return;
    list.innerHTML = "";

    files.forEach(function (f) {
      const m = REC_NAME_RE.exec(f.name);
      if (!m) return; // ignore anything that is not one of our recordings
      const li = document.createElement("li");
      li.className = "recording-item";

      const head = document.createElement("div");
      head.className = "recording-head";
      const when = document.createElement("span");
      when.className = "recording-when";
      when.textContent = formatTime(f.created_at);
      const meta = document.createElement("span");
      meta.className = "recording-meta";
      const size = f.metadata && f.metadata.size;
      meta.textContent = fmtDuration(m[2]) + " · " + fmtSize(size) + " · " + m[3].toUpperCase();
      head.appendChild(when);
      head.appendChild(meta);

      const actions = document.createElement("div");
      actions.className = "recording-actions";
      const playBtn = document.createElement("button");
      playBtn.type = "button";
      playBtn.className = "btn btn-primary";
      playBtn.textContent = "▶ Play";
      const dlBtn = document.createElement("button");
      dlBtn.type = "button";
      dlBtn.className = "btn btn-secondary";
      dlBtn.textContent = "⬇ Download";
      actions.appendChild(playBtn);
      actions.appendChild(dlBtn);

      const audio = document.createElement("audio");
      audio.controls = true;
      audio.preload = "none";
      audio.hidden = true;
      const err = document.createElement("p");
      err.className = "recording-err";
      err.setAttribute("role", "alert");

      playBtn.addEventListener("click", async function () {
        err.textContent = "";
        playBtn.disabled = true;
        const r = await signedUrl(f.name, PLAY_URL_SECONDS);
        playBtn.disabled = false;
        if (r.error) {
          err.textContent = "Couldn’t open the recording: " + r.error;
          return;
        }
        audio.src = r.url;
        audio.hidden = false;
        audio.play().catch(function () {
          /* controls are visible; the admin can press play */
        });
      });

      dlBtn.addEventListener("click", async function () {
        err.textContent = "";
        dlBtn.disabled = true;
        const r = await signedUrl(f.name, DOWNLOAD_URL_SECONDS, f.name);
        dlBtn.disabled = false;
        if (r.error) {
          err.textContent = "Couldn’t download the recording: " + r.error;
          return;
        }
        const a = document.createElement("a");
        a.href = r.url;
        a.download = f.name;
        a.rel = "noopener";
        document.body.appendChild(a);
        a.click();
        a.remove();
      });

      li.appendChild(head);
      li.appendChild(actions);
      li.appendChild(audio);
      li.appendChild(err);
      list.appendChild(li);
    });
  }

  function clearRecordings() {
    const list = $("recordings-list");
    if (list) {
      list.querySelectorAll("audio").forEach(function (a) {
        try {
          a.pause();
        } catch (e) {
          /* ignore */
        }
        a.removeAttribute("src");
      });
      list.innerHTML = "";
    }
    hide($("recordings-empty"));
    hide($("recordings-error"));
  }

  async function loadRecordings() {
    const loading = $("recordings-loading");
    const errEl = $("recordings-error");
    const empty = $("recordings-empty");
    hide(errEl);
    hide(empty);
    const sb = recordingsClient();
    if (!sb) return;

    show(loading);
    try {
      const res = await sb.storage.from(REC_BUCKET).list("", {
        limit: 100,
        sortBy: { column: "created_at", order: "desc" }
      });
      hide(loading);
      if (res.error) {
        errEl.textContent =
          "Could not load recordings: " +
          (res.error.message || "error") +
          ". If this is a new setup, run supabase/voice_recordings.sql first.";
        show(errEl);
        return;
      }
      const files = (res.data || []).filter(function (f) {
        return REC_NAME_RE.test(f.name);
      });
      renderRecordings(files);
      if (files.length === 0) {
        // RLS hides everything from non-admins, so an empty list is ambiguous — tell them which it is.
        const chk = await sb.from("admin_users").select("user_id").limit(1);
        if (chk.error || !chk.data || chk.data.length === 0) {
          errEl.textContent =
            "This account is not on the recordings allow-list, so Storage hides every recording from it. " +
            "Run supabase/voice_recordings_admin.sql with this account’s email (see README).";
          show(errEl);
        } else {
          show(empty);
        }
      }
    } catch (e) {
      hide(loading);
      errEl.textContent = "Network error while loading recordings.";
      show(errEl);
    }
  }

  function refreshAll() {
    loadResponses();
    loadRecordings();
  }

  function showDashboard(session) {
    hide($("login-card"));
    show($("dashboard-card"));
    const emailEl = $("admin-email");
    if (emailEl && session && session.user) {
      emailEl.textContent = session.user.email || "Admin";
    }
    loadResponses();
    loadRecordings();
  }

  function showLogin() {
    show($("login-card"));
    hide($("dashboard-card"));
  }

  async function handleLogin(e) {
    e.preventDefault();
    const email = ($("admin-email-input") || {}).value;
    const password = ($("admin-password-input") || {}).value;
    const errEl = $("login-error");
    const btn = $("login-btn");

    hide(errEl);
    if (btn) btn.disabled = true;

    const result = await window.ProposalDB.signIn(email, password);
    if (btn) btn.disabled = false;

    if (!result.ok) {
      if (errEl) {
        errEl.textContent = result.error || "Sign-in failed.";
        show(errEl);
      }
      return;
    }
    showDashboard(result.data.session || (await window.ProposalDB.getSession()));
  }

  async function handleLogout() {
    await window.ProposalDB.signOut();
    showLogin();
    const list = $("response-list");
    if (list) list.innerHTML = "";
    clearRecordings(); // stop playback and drop any signed URLs from the page
  }

  document.addEventListener("DOMContentLoaded", async function () {
    if (!window.ProposalDB) {
      const err = $("config-error");
      if (err) {
        err.textContent = "ProposalDB helper missing. Check script includes.";
        show(err);
      }
      return;
    }

    if (!window.ProposalDB.isConfigured()) {
      const err = $("config-error");
      if (err) {
        err.innerHTML =
          "Supabase is not configured. Open <code>js/config.js</code> and set your project <strong>url</strong> and <strong>anonKey</strong>. See README.md for full setup.";
        show(err);
      }
      showLogin();
      return;
    }

    const form = $("login-form");
    if (form) form.addEventListener("submit", handleLogin);

    const logoutBtn = $("logout-btn");
    if (logoutBtn) logoutBtn.addEventListener("click", handleLogout);

    const refreshBtn = $("refresh-btn");
    if (refreshBtn) refreshBtn.addEventListener("click", refreshAll);

    // Check existing session
    const session = await window.ProposalDB.getSession();
    if (session) {
      showDashboard(session);
    } else {
      showLogin();
    }
  });
})();
