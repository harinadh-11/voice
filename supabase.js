/**
 * Supabase client helper.
 * Uses the public anon key only. RLS and policies protect data.
 */

(function () {
  "use strict";

  const cfg = window.PROPOSAL_CONFIG && window.PROPOSAL_CONFIG.supabase;
  let client = null;

  function isConfigured() {
    return !!(cfg && cfg.url && cfg.anonKey &&
      cfg.url.indexOf("http") === 0 &&
      cfg.anonKey.length > 20);
  }

  function getClient() {
    if (!isConfigured()) return null;
    if (client) return client;
    if (typeof window.supabase === "undefined" || !window.supabase.createClient) {
      console.warn("Supabase JS library not loaded.");
      return null;
    }
    client = window.supabase.createClient(cfg.url, cfg.anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    });
    return client;
  }

  /**
   * Submit a proposal response (YES or NO).
   * Returns { ok: boolean, data?: object, error?: string }
   */
  async function submitResponse(answer) {
    const normalized = String(answer).toUpperCase() === "YES" ? "YES" : "NO";
    const sb = getClient();

    if (!sb) {
      return {
        ok: false,
        error: "Database is not configured yet. Please set your Supabase URL and anon key in js/config.js."
      };
    }

    try {
      const { data, error } = await sb
        .from("proposal_responses")
        .insert({ answer: normalized })
        .select("id, answer, created_at")
        .single();

      if (error) {
        return { ok: false, error: error.message || "Could not save your answer. Please try again." };
      }
      return { ok: true, data };
    } catch (err) {
      return {
        ok: false,
        error: (err && err.message) || "Network error. Please check your connection and try again."
      };
    }
  }

  /**
   * Admin: fetch all responses (requires authenticated admin session).
   */
  async function fetchResponses() {
    const sb = getClient();
    if (!sb) {
      return { ok: false, error: "Database is not configured." };
    }

    try {
      const { data, error } = await sb
        .from("proposal_responses")
        .select("id, answer, created_at")
        .order("created_at", { ascending: false });

      if (error) {
        return { ok: false, error: error.message || "Could not load responses." };
      }
      return { ok: true, data: data || [] };
    } catch (err) {
      return {
        ok: false,
        error: (err && err.message) || "Network error."
      };
    }
  }

  async function signIn(email, password) {
    const sb = getClient();
    if (!sb) return { ok: false, error: "Database is not configured." };
    try {
      const { data, error } = await sb.auth.signInWithPassword({ email, password });
      if (error) return { ok: false, error: error.message };
      return { ok: true, data };
    } catch (err) {
      return { ok: false, error: (err && err.message) || "Sign-in failed." };
    }
  }

  async function signOut() {
    const sb = getClient();
    if (!sb) return;
    await sb.auth.signOut();
  }

  async function getSession() {
    const sb = getClient();
    if (!sb) return null;
    const { data } = await sb.auth.getSession();
    return data && data.session ? data.session : null;
  }

  window.ProposalDB = {
    isConfigured,
    getClient,
    submitResponse,
    fetchResponses,
    signIn,
    signOut,
    getSession
  };
})();
