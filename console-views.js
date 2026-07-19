/* Quotewright console — shared bootstrap for the auxiliary views
   (customers.html / gaps.html / settings.html).

   No inline scripts (site CSP is script-src 'self'). Reuses the exact auth pattern
   from dashboard.js: Supabase email+password session, login gate, RLS does the real
   protection. Each page calls QWConsole.boot({ onAuth: fn(sb, email) }) and receives a
   set of shared helpers. Every page DEGRADES GRACEFULLY when the intelligence tables
   don't exist yet (the SELECT errors with a "relation does not exist" → we show a
   "run the intelligence SQL" empty state instead of crashing). */
(function () {
  "use strict";

  var cfg = window.QW_CONFIG || {};

  function el(id) { return document.getElementById(id); }
  function esc(s) {
    return (s == null ? "" : String(s)).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }
  function numOrNull(v) { return (v == null || v === "" || isNaN(Number(v))) ? null : Number(v); }
  function money(n, cur) {
    if (n == null || isNaN(n)) return "—";
    var sym = { EUR: "€", USD: "$", GBP: "£", TRY: "₺" }[cur] || (cur ? cur + " " : "");
    return sym + Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function fmtDate(s) {
    if (!s) return "—";
    var d = new Date(s);
    return isNaN(d) ? "—" : d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  }
  function fmtDateTime(s) {
    if (!s) return "—";
    var d = new Date(s);
    if (isNaN(d)) return "—";
    return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) +
      " · " + d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  }
  function relTime(s) {
    if (!s) return "—";
    var d = new Date(s); if (isNaN(d)) return "—";
    var diff = (Date.now() - d.getTime()) / 1000;
    if (diff < 60) return "just now";
    if (diff < 3600) return Math.floor(diff / 60) + "m ago";
    if (diff < 86400) return Math.floor(diff / 3600) + "h ago";
    if (diff < 86400 * 30) return Math.floor(diff / 86400) + "d ago";
    return fmtDate(s);
  }

  // Parse a jsonb column that may arrive as an object/array OR a JSON string.
  function parseJson(v, fallback) {
    if (v == null) return fallback;
    if (typeof v === "string") { try { return JSON.parse(v); } catch (e) { return fallback; } }
    return v;
  }

  // Is this Supabase error a "table not created yet" error? (undefined table / not in schema cache)
  function isMissingTable(err) {
    if (!err) return false;
    var code = err.code || "";
    var msg = (err.message || "") + " " + (err.details || "") + " " + (err.hint || "");
    return code === "42P01" || code === "PGRST205" || code === "PGRST202" ||
      /does not exist|not find the table|schema cache|relation .* does not exist/i.test(msg);
  }

  var toastTimer = null;
  function toast(msg, bad) {
    var t = el("toast");
    if (!t) return;
    t.textContent = msg;
    t.className = "qc-toast show" + (bad ? " bad" : "");
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.className = "qc-toast" + (bad ? " bad" : ""); }, 2800);
  }

  var API = {
    el: el, esc: esc, numOrNull: numOrNull, money: money,
    fmtDate: fmtDate, fmtDateTime: fmtDateTime, relTime: relTime,
    parseJson: parseJson, isMissingTable: isMissingTable, toast: toast,
    cfg: cfg, sb: null, email: "",
    boot: boot
  };
  window.QWConsole = API;

  function boot(opts) {
    opts = opts || {};
    var boot_ = el("bootError");

    var configured = cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY &&
      cfg.SUPABASE_ANON_KEY.indexOf("PASTE_") !== 0;
    if (!configured) {
      if (boot_) {
        boot_.hidden = false;
        boot_.textContent = "Not configured: set SUPABASE_ANON_KEY in dashboard-config.js (Supabase → Project Settings → API → anon public).";
      }
      return;
    }
    if (!window.supabase || !window.supabase.createClient) {
      if (boot_) { boot_.hidden = false; boot_.textContent = "Could not load the Supabase client library (vendor/supabase.js)."; }
      return;
    }

    var sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
    API.sb = sb;

    // SECURITY: intercept the login submit FIRST + unconditionally so it can never
    // fall back to a native GET (email+password in the URL).
    var loginForm = el("loginForm");
    if (loginForm) loginForm.addEventListener("submit", onLoginSubmit);
    var logoutBtn = el("logoutBtn");
    if (logoutBtn) logoutBtn.addEventListener("click", function () { sb.auth.signOut().then(showLogin); });

    sb.auth.getSession().then(function (res) {
      var s = res.data && res.data.session;
      if (s && s.user) { onAuthed(s.user.email || ""); }
      else showLogin();
    }, showLogin);

    function onLoginSubmit(e) {
      e.preventDefault();
      var err = el("loginError"); if (err) err.textContent = "";
      var btn = el("loginBtn");
      if (btn) { btn.disabled = true; btn.textContent = "Signing in…"; }
      sb.auth.signInWithPassword({ email: el("email").value.trim(), password: el("password").value })
        .then(function (res) {
          if (btn) { btn.disabled = false; btn.textContent = "Sign in"; }
          if (res.error) { if (err) err.textContent = res.error.message; return; }
          onAuthed((res.data.user && res.data.user.email) || "");
        })
        .catch(function () {
          if (btn) { btn.disabled = false; btn.textContent = "Sign in"; }
          if (err) err.textContent = "Network error.";
        });
    }
    function showLogin() {
      var lv = el("loginView"), av = el("appView");
      if (lv) lv.hidden = false; if (av) av.hidden = true;
      if (logoutBtn) logoutBtn.hidden = true;
      var who = el("whoami"); if (who) who.textContent = "";
    }
    function onAuthed(email) {
      API.email = email;
      var lv = el("loginView"), av = el("appView");
      if (lv) lv.hidden = true; if (av) av.hidden = false;
      if (logoutBtn) logoutBtn.hidden = false;
      var who = el("whoami"); if (who) who.textContent = email || "";
      if (typeof opts.onAuth === "function") opts.onAuth(sb, email);
    }
  }
})();
