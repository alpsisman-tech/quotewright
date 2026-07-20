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

  // i18n: register this module's strings; T() = safe translate with fallback.
  if (window.QWI18n && QWI18n.add) QWI18n.add({
    en: {
      "views.notConfigured": "Not configured: set SUPABASE_ANON_KEY in dashboard-config.js (Supabase → Project Settings → API → anon public).",
      "views.noClient": "Could not load the Supabase client library (vendor/supabase.js)."
    },
    tr: {
      "views.notConfigured": "Yapılandırılmadı: dashboard-config.js içinde SUPABASE_ANON_KEY değerini ayarlayın (Supabase → Project Settings → API → anon public).",
      "views.noClient": "Supabase istemci kütüphanesi yüklenemedi (vendor/supabase.js)."
    }
  });
  function T(key, fallback) {
    if (window.QWI18n && QWI18n.t) { var v = QWI18n.t(key); if (v !== key) return v; }
    return fallback;
  }

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
    // Tenancy (Wave A). owner = the CALLER's resolved tenant; isAdmin sees all.
    // Falls back to cfg.OWNER before the tenancy SQL is applied (legacy mode).
    owner: cfg.OWNER || null, isAdmin: false,
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
        boot_.textContent = T("views.notConfigured", "Not configured: set SUPABASE_ANON_KEY in dashboard-config.js (Supabase → Project Settings → API → anon public).");
      }
      return;
    }
    if (!window.supabase || !window.supabase.createClient) {
      if (boot_) { boot_.hidden = false; boot_.textContent = T("views.noClient", "Could not load the Supabase client library (vendor/supabase.js)."); }
      return;
    }

    var sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
    API.sb = sb;
    if (window.QWI18n && QWI18n.setClient) QWI18n.setClient(sb);

    // SECURITY: intercept the login submit FIRST + unconditionally so it can never
    // fall back to a native GET (email+password in the URL).
    var loginForm = el("loginForm");
    if (loginForm) loginForm.addEventListener("submit", onLoginSubmit);
    var logoutBtn = el("logoutBtn");
    if (logoutBtn) logoutBtn.addEventListener("click", function () { sb.auth.signOut().then(showLogin); });

    sb.auth.getSession().then(function (res) {
      var s = res.data && res.data.session;
      if (s && s.user) {
        if (window.QWI18n && QWI18n.reconcileUser) QWI18n.reconcileUser(s.user);
        onAuthed(s.user.email || "");
      }
      else showLogin();
    }, showLogin);

    function onLoginSubmit(e) {
      e.preventDefault();
      var err = el("loginError"); if (err) err.textContent = "";
      var btn = el("loginBtn");
      if (btn) { btn.disabled = true; btn.textContent = T("common.signingIn", "Signing in…"); }
      sb.auth.signInWithPassword({ email: el("email").value.trim(), password: el("password").value })
        .then(function (res) {
          if (btn) { btn.disabled = false; btn.textContent = T("common.signIn", "Sign in"); }
          if (res.error) { if (err) err.textContent = res.error.message; return; }
          if (window.QWI18n && QWI18n.reconcileUser) QWI18n.reconcileUser(res.data.user);
          onAuthed((res.data.user && res.data.user.email) || "");
        })
        .catch(function () {
          if (btn) { btn.disabled = false; btn.textContent = T("common.signIn", "Sign in"); }
          if (err) err.textContent = T("common.networkError", "Network error.");
        });
    }
    function showLogin() {
      var lv = el("loginView"), av = el("appView");
      if (lv) lv.hidden = false; if (av) av.hidden = true;
      if (logoutBtn) logoutBtn.hidden = true;
      var who = el("whoami"); if (who) who.textContent = "";
      // Signed-out state must NOT wear the app rail (login card stands alone).
      var nav = el("subnav"); if (nav) nav.hidden = true;
      var an = el("adminNav"); if (an) an.hidden = true;
    }
    function onAuthed(email) {
      API.email = email;
      var lv = el("loginView"), av = el("appView");
      if (lv) lv.hidden = true; if (av) av.hidden = false;
      if (logoutBtn) logoutBtn.hidden = false;
      var who = el("whoami"); if (who) who.textContent = email || "";

      // Resolve the CALLER's tenant BEFORE the page queries, so every auxiliary
      // view scopes to the signed-in user's owner (not the hardcoded Hassan one).
      // Purely additive + fail-safe: if the tenancy SQL isn't applied yet (or the
      // resolver isn't loaded), API.owner stays cfg.OWNER and nothing changes.
      var proceed = function () {
        if (typeof opts.onAuth === "function") opts.onAuth(sb, email);
        // Admin link in the rail: visible only to admins (API.isAdmin resolved above).
        var an = el("adminNav"); if (an) an.hidden = !API.isAdmin;
        if (window.QWOnboarding && typeof window.QWOnboarding.check === "function") {
          window.QWOnboarding.check(sb, API.owner || cfg.OWNER);
        }
        // Guided tour: mount the re-launch button + resume/auto-start (see console-tour.js).
        if (window.QWTour && typeof window.QWTour.onConsoleReady === "function") {
          window.QWTour.onConsoleReady(sb, null);
        }
      };
      if (window.QWTenancy && typeof window.QWTenancy.resolve === "function") {
        window.QWTenancy.resolve(sb).then(function (p) {
          // Only an ACTIVE member with an assigned tenant narrows the scope. A
          // pending/admin/degraded result keeps the legacy owner; RLS is the real
          // gate (pending users get zero rows either way — fail-closed).
          if (p && p.active && p.owner) { API.owner = p.owner; cfg.OWNER = p.owner; }
          API.isAdmin = !!(p && p.isAdmin);
          proceed();
        }, proceed);
      } else { proceed(); }
    }
  }
})();
