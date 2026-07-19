/* Quotewright quote console — the COPILOT.
   The operator does everything here and never opens Gmail: review the pipeline's
   draft, resolve weak lines with one tap, then approve & send — all in-page.

   No inline scripts (site CSP is script-src 'self'). Reads `quotes` + `products`
   from Supabase (anon key + RLS); writes money-facing actions through secured
   n8n webhooks (Bearer = the Supabase access token).

   EVERYTHING degrades gracefully when the intelligence columns/tables aren't
   there yet (autonomy_tier, thread_snapshot, candidates[], digest, …) — a missing
   field is shown as "—"/an empty state, never a crash. Once the owner runs
   quotewright-intelligence.sql and publishes the staged pipeline, it all lights up. */
(function () {
  "use strict";

  var el = function (id) { return document.getElementById(id); };
  var cfg = window.QW_CONFIG || {};
  var boot = el("bootError");
  var sb = null;
  var quotes = [];
  var digest = null;         // latest digest row, or null (then computed client-side)
  var hasLoaded = false;
  var loading = false;
  var selected = {};         // id -> true (bulk selection)
  var openId = null;         // quote currently in the workspace drawer
  var lastFocus = null;      // element focused before the drawer opened

  // Tenancy (Wave A). resolvedOwner is the CALLER's tenant, resolved server-side
  // from account_profiles — never trusted from client input. Falls back to the
  // legacy config OWNER before the tenancy SQL is applied (graceful degradation).
  var resolvedOwner = cfg.OWNER || null;
  var authMode = "signin";   // "signin" | "signup"
  var dashStarted = false;   // load the dashboard exactly once per session

  var WEBHOOK_BASE = "https://alpsisman.app.n8n.cloud/webhook/";

  var MARGIN_LOW = 15, MARGIN_MID = 30;
  var CONF_HIGH = 85, CONF_MID = 60;

  // The firm's own mailbox — used to tell "us" from "the customer" in a thread.
  var FIRM_HINTS = ["hassannonwovensrfq", "hassan.com.tr", "@hassan"];

  // SECURITY: intercept the login submit FIRST so email+password can never land
  // in the URL via a native GET submit.
  var loginForm = el("loginForm");
  if (loginForm) loginForm.addEventListener("submit", onLoginSubmit);

  var configured = cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY &&
                   cfg.SUPABASE_ANON_KEY.indexOf("PASTE_") !== 0;
  if (!configured) {
    if (boot) {
      boot.hidden = false;
      boot.textContent = "Not configured: set SUPABASE_ANON_KEY in dashboard-config.js (Supabase -> Project Settings -> API -> anon public).";
    }
    return;
  }

  sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
  var currentEmail = "";

  el("logoutBtn").addEventListener("click", signOut);

  // ── auth surface wiring (Google, sign-in/sign-up toggle, pending screen) ──
  var googleBtn = el("googleBtn");
  if (googleBtn) googleBtn.addEventListener("click", googleSignIn);

  var tabSignin = el("tabSignin"), tabSignup = el("tabSignup");
  if (tabSignin) tabSignin.addEventListener("click", function () { setMode("signin"); });
  if (tabSignup) tabSignup.addEventListener("click", function () { setMode("signup"); });

  var pwInput = el("password");
  if (pwInput) pwInput.addEventListener("input", function () { if (authMode === "signup") renderPwRules(pwInput.value); });

  var noticeBack = el("noticeBack");
  if (noticeBack) noticeBack.addEventListener("click", function () { showNotice(null); setMode("signin"); });

  var pendingRefresh = el("pendingRefresh");
  if (pendingRefresh) pendingRefresh.addEventListener("click", function () {
    pendingRefresh.disabled = true; pendingRefresh.textContent = "Checking…";
    sb.auth.getSession().then(function (res) {
      var s = res.data && res.data.session;
      pendingRefresh.disabled = false; pendingRefresh.textContent = "Check again";
      if (s && s.user) decideRoute(s); else showLogin();
    });
  });
  var pendingLogout = el("pendingLogout");
  if (pendingLogout) pendingLogout.addEventListener("click", signOut);

  el("refreshBtn").addEventListener("click", loadQuotes);
  el("search").addEventListener("input", renderTable);
  el("statusFilter").addEventListener("change", renderTable);
  el("tierFilter").addEventListener("change", renderTable);
  el("outcomeFilter").addEventListener("change", renderTable);
  el("approvalFilter").addEventListener("click", function () {
    approvalOnly = !approvalOnly;
    this.setAttribute("aria-pressed", approvalOnly ? "true" : "false");
    this.classList.toggle("on", approvalOnly);
    renderTable();
  });
  el("selectAll").addEventListener("change", onSelectAll);
  var approvalOnly = false;

  // Table interactions (event delegation — CSP-safe, no inline handlers).
  el("quotesBody").addEventListener("click", function (e) {
    var t = e.target;
    if (t.closest && t.closest(".qc-col-sel")) return; // checkbox handled on change
    var actBtn = t.closest ? t.closest("button[data-act]") : null;
    if (actBtn) { e.stopPropagation(); setOutcome(actBtn.getAttribute("data-id"), actBtn.getAttribute("data-act"), actBtn); return; }
    var appBtn = t.closest ? t.closest("button[data-approve]") : null;
    if (appBtn) { e.stopPropagation(); approve(appBtn.getAttribute("data-approve"), appBtn); return; }
    var row = t.closest ? t.closest("tr[data-row]") : null;
    if (row) openDrawer(row.getAttribute("data-row"));
  });
  el("quotesBody").addEventListener("change", function (e) {
    var cb = e.target;
    if (cb && cb.classList && cb.classList.contains("qc-rowsel")) {
      var id = cb.getAttribute("data-sel");
      if (cb.checked) selected[id] = true; else delete selected[id];
      renderBulk();
      syncSelectAll();
    }
  });

  // Drawer close affordances.
  el("drawerScrim").addEventListener("click", closeDrawer);
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && openId != null) closeDrawer();
  });
  // Drawer interactions (delegated).
  el("drawerInner").addEventListener("click", onDrawerClick);
  el("drawerInner").addEventListener("input", onDrawerInput);

  // Route on every auth change — this also catches the OAuth return, where
  // supabase-js parses the session out of the URL and fires SIGNED_IN.
  sb.auth.onAuthStateChange(function (evt, session) {
    if (evt === "SIGNED_OUT") { showLogin(); return; }
    if (session && session.user) decideRoute(session);
  });
  sb.auth.getSession().then(function (res) {
    var s = res.data && res.data.session;
    if (s && s.user) decideRoute(s); else showLogin();
  });

  // ── auth ──────────────────────────────────────────────────────────────────
  function onLoginSubmit(e) {
    e.preventDefault();
    var err = el("loginError");
    if (err) err.textContent = "";
    if (!sb) { if (err) err.textContent = "Dashboard isn't configured yet (missing Supabase key)."; return; }
    var email = el("email").value.trim(), pw = el("password").value;
    if (authMode === "signup") return doSignup(email, pw, err);
    var btn = el("loginBtn");
    btn.disabled = true; btn.textContent = "Signing in…";
    sb.auth.signInWithPassword({ email: email, password: pw })
      .then(function (res) {
        btn.disabled = false; setSubmitLabel();
        if (res.error) { if (err) err.textContent = res.error.message; return; }
        if (res.data && res.data.session) decideRoute(res.data.session);
      })
      .catch(function () { btn.disabled = false; setSubmitLabel(); if (err) err.textContent = "Network error."; });
  }

  function doSignup(email, pw, err) {
    var v = pwCheck(pw);
    if (!email) { if (err) err.textContent = "Enter your email to create an account."; return; }
    if (!v.ok) { if (err) err.textContent = "Choose a password with " + v.msg + "."; return; }
    var btn = el("loginBtn");
    btn.disabled = true; btn.textContent = "Creating account…";
    sb.auth.signUp({ email: email, password: pw })
      .then(function (res) {
        btn.disabled = false; setSubmitLabel();
        if (res.error) { if (err) err.textContent = res.error.message; return; }
        // Email-confirmation ON → no session yet → tell them to check their inbox.
        // Confirmation OFF → session present, but the account is still PENDING, so
        // decideRoute lands them on the awaiting-activation screen. Either way, a
        // fresh signup never sees another tenant's data.
        if (res.data && res.data.session) decideRoute(res.data.session);
        else showNotice(email);
      })
      .catch(function () { btn.disabled = false; setSubmitLabel(); if (err) err.textContent = "Network error."; });
  }

  function googleSignIn() {
    var err = el("loginError"); if (err) err.textContent = "";
    var btn = el("googleBtn"); if (btn) btn.disabled = true;
    // Full-page redirect to Google via Supabase; on return, onAuthStateChange /
    // getSession picks up the session from the URL. redirectTo MUST be in
    // Supabase → Auth → URL Configuration → Redirect URLs (and Google's console).
    sb.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin + window.location.pathname }
    }).then(function (res) {
      if (res && res.error) { if (btn) btn.disabled = false; if (err) err.textContent = res.error.message; }
    }).catch(function () { if (btn) btn.disabled = false; if (err) err.textContent = "Network error."; });
  }

  function signOut() { sb.auth.signOut().then(showLogin, showLogin); }

  // Password policy (client-side hint; Supabase enforces its own minimum too).
  function pwCheck(pw) {
    pw = pw || "";
    var len = pw.length >= 8, letter = /[A-Za-z]/.test(pw), num = /[0-9]/.test(pw);
    var need = [];
    if (!len) need.push("at least 8 characters");
    if (!letter) need.push("a letter");
    if (!num) need.push("a number");
    return { ok: len && letter && num, len: len, letter: letter, num: num, msg: need.join(", ") };
  }
  function renderPwRules(pw) {
    var v = pwCheck(pw), box = el("pwRules"); if (!box) return;
    var map = { len: v.len, letter: v.letter, num: v.num };
    Array.prototype.forEach.call(box.querySelectorAll("[data-rule]"), function (li) {
      li.classList.toggle("ok", !!map[li.getAttribute("data-rule")]);
    });
  }

  function setSubmitLabel() { var b = el("loginBtn"); if (b) b.textContent = authMode === "signup" ? "Create account" : "Sign in"; }

  function setMode(mode) {
    authMode = mode === "signup" ? "signup" : "signin";
    var signup = authMode === "signup";
    var ts = el("tabSignin"), tu = el("tabSignup");
    if (ts) ts.setAttribute("aria-selected", signup ? "false" : "true");
    if (tu) tu.setAttribute("aria-selected", signup ? "true" : "false");
    var card = el("loginView"); if (card) card.setAttribute("data-mode", authMode);
    setSubmitLabel();
    var pw = el("password");
    if (pw) pw.setAttribute("autocomplete", signup ? "new-password" : "current-password");
    var rules = el("pwRules"); if (rules) rules.hidden = !signup;
    if (signup && pw) renderPwRules(pw.value);
    el("authKicker").textContent = signup ? "Create account" : "Sign in";
    el("authTitle").textContent = signup ? "Create your account" : "Quote console";
    el("authSub").textContent = signup
      ? "Set up access to your team’s quote console. A manager approves new accounts before they open."
      : "Review, resolve and send quotes drafted by the RFQ pipeline — without leaving this page.";
    var err = el("loginError"); if (err) err.textContent = "";
    showNotice(null); // ensure the form (not the notice) is visible
  }

  function showNotice(email) {
    var form = el("loginForm"), notice = el("authNotice"), tabs = document.querySelector(".qc-authtabs");
    if (email) {
      el("noticeEmail").textContent = email;
      if (form) form.hidden = true;
      if (tabs) tabs.hidden = true;
      if (notice) notice.hidden = false;
    } else {
      if (form) form.hidden = false;
      if (tabs) tabs.hidden = false;
      if (notice) notice.hidden = true;
    }
  }

  // Resolve the caller's tenant/role/status, then route.
  function decideRoute(session) {
    currentEmail = (session.user && session.user.email) || "";
    if (!window.QWTenancy) { showDash(currentEmail, { isAdmin: false, owner: resolvedOwner }); startDash(session.user); return; }
    QWTenancy.resolve(sb).then(function (p) {
      if (p.anon) { showLogin(); return; }
      if (!p.active) { showPending(p.email || currentEmail); return; }
      resolvedOwner = p.owner || cfg.OWNER || null;
      showDash(currentEmail, p);
      startDash(p.user);
    }, function () { showPending(currentEmail); });
  }

  // First successful dashboard entry only: load data + run per-user onboarding.
  function startDash(user) {
    if (dashStarted) return;
    dashStarted = true;
    loadQuotes();
    if (window.QWOnboarding && typeof window.QWOnboarding.check === "function") {
      window.QWOnboarding.check(sb, resolvedOwner, user);
    }
  }

  function showLogin() {
    el("loginView").hidden = false;
    el("dashView").hidden = true;
    var pv = el("pendingView"); if (pv) pv.hidden = true;
    el("logoutBtn").hidden = true; el("whoami").textContent = "";
    var nav = el("subnav"); if (nav) nav.hidden = true;
    var an = el("adminNav"); if (an) an.hidden = true;
    setMode("signin");
  }
  function showPending(email) {
    el("loginView").hidden = true;
    el("dashView").hidden = true;
    var pv = el("pendingView"); if (pv) pv.hidden = false;
    var pe = el("pendingEmail"); if (pe) pe.textContent = email || "";
    el("logoutBtn").hidden = false; el("whoami").textContent = email || "";
    var nav = el("subnav"); if (nav) nav.hidden = true;
    var an = el("adminNav"); if (an) an.hidden = true;
  }
  function showDash(email, profile) {
    el("loginView").hidden = true; el("dashView").hidden = false;
    var pv = el("pendingView"); if (pv) pv.hidden = true;
    el("logoutBtn").hidden = false; el("whoami").textContent = email || "";
    var nav = el("subnav"); if (nav) nav.hidden = false;
    var an = el("adminNav"); if (an) an.hidden = !(profile && profile.isAdmin);
  }

  // ── helpers ───────────────────────────────────────────────────────────────
  var SYM = { EUR: "€", USD: "$", GBP: "£", TRY: "₺" };
  function money(n, cur) {
    if (n == null || isNaN(n)) return "—";
    var sym = SYM[cur] || (cur ? cur + " " : "");
    return sym + Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function moneyShort(n, cur) {
    if (n == null || isNaN(n)) return "—";
    var sym = SYM[cur] || (cur ? cur + " " : "");
    return sym + Number(n).toLocaleString("en-US", { maximumFractionDigits: 0 });
  }
  function fmtDate(s) {
    if (!s) return "—";
    var d = new Date(s);
    return isNaN(d) ? "—" : d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  }
  function fmtDateTime(s) {
    if (!s) return "";
    var d = new Date(s);
    return isNaN(d) ? "" : d.toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  }
  function bucket(q) { return (q.status || "").toLowerCase() === "draft" ? "draft" : "sent"; }
  function isDraft(q) { return bucket(q) === "draft"; }
  function outcomeOf(q) {
    var o = (q.outcome || "pending").toLowerCase();
    return (o === "won" || o === "lost") ? o : "pending";
  }
  function tierOf(q) {
    var t = (q.autonomy_tier || "").toLowerCase();
    return (t === "green" || t === "amber" || t === "red") ? t : null;
  }
  function esc(s) {
    return (s == null ? "" : String(s)).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }
  function nl2br(s) { return esc(s).replace(/\r?\n/g, "<br>"); }
  function numOrNull(v) { return (v == null || v === "" || isNaN(Number(v))) ? null : Number(v); }
  function needsApproval(q) { return q.needs_approval === true; }

  function marginBand(pct) {
    if (pct == null) return "";
    if (pct < MARGIN_LOW) return "low";
    if (pct < MARGIN_MID) return "mid";
    return "good";
  }
  function confBand(v) {
    if (v == null) return "";
    if (v >= CONF_HIGH) return "good";
    if (v >= CONF_MID) return "mid";
    return "low";
  }

  function parseOutput(q) {
    var o = q.output;
    if (!o) return null;
    if (typeof o === "string") { try { o = JSON.parse(o); } catch (e) { return null; } }
    return (o && typeof o === "object") ? o : null;
  }
  function linesOf(q) {
    var o = parseOutput(q);
    if (!o) return [];
    var arr = o.lines || (o.output && o.output.lines) || (o.quote && o.quote.lines) || [];
    return Array.isArray(arr) ? arr : [];
  }
  function threadOf(q) {
    var arr = q.thread_snapshot;
    if (typeof arr === "string") { try { arr = JSON.parse(arr); } catch (e) { arr = null; } }
    if (Array.isArray(arr)) return arr;
    if (arr && Array.isArray(arr.messages)) return arr.messages;
    return [];
  }
  function overallConf(q) {
    var c = numOrNull(q.match_confidence);
    if (c != null) return c;
    var o = parseOutput(q);
    return o ? numOrNull(o.match_confidence) : null;
  }
  function draftText(q) {
    var o = parseOutput(q);
    return (o && (o.quote_text || (o.output && o.output.quote_text))) || q.quote_text || "";
  }

  // Human product NAME first — SKU is a secondary tag (priority #1).
  function normLine(l) {
    var status = (l.status || "").toLowerCase();
    var hasPrice = (Number(l.total_cash) > 0) || (l.unit_cash != null && String(l.unit_cash).trim() !== "");
    if (status === "pending_info" && hasPrice) status = "provisional";
    var reason = l.match_reason || l.why || l.reason || l.match_note || l.note || "";
    if (!reason) {
      reason = status === "priced" ? "Matched to a catalogue SKU."
        : status === "provisional" ? "Provisionally priced; awaiting spec confirmation."
        : status === "pending_info" ? "Awaiting a detail from the customer."
        : status === "pending_hassan" ? "Product exists; price pending from Hassan."
        : "";
    }
    var conf = numOrNull(l.confidence);
    if (conf == null) conf = numOrNull(l.match_confidence);
    var name = l.product_name || l.urun_adi || l.product || l.name || l.description || "—";
    var cands = Array.isArray(l.candidates) ? l.candidates : [];
    return {
      ref: l.ref != null ? String(l.ref) : "",
      name: name,
      spec: l.spec || l.specs || "",
      colors: l.colors || l.colour || l.color || "",
      sku: l.sku || l.matched_sku || "",
      status: status,
      reason: reason,
      conf: conf,
      qty: numOrNull(l.qty),
      qty_unit: l.qty_unit || "",
      unit_cash: l.unit_cash,
      unit_term: l.unit_term,
      total_cash: numOrNull(l.total_cash),
      total_term: numOrNull(l.total_term),
      candidates: cands,
      raw: l
    };
  }
  function lineWeak(l) {
    if (l.status === "pending_info" || l.status === "pending_hassan") return true;
    if (l.status === "provisional") return true;
    if (l.conf != null && l.conf < CONF_MID) return true;
    return false;
  }
  // A short "customer & products" secondary line for the table.
  function productSummary(q) {
    var lines = linesOf(q).map(normLine);
    if (!lines.length) return "";
    var first = lines[0].name;
    var extra = lines.length - 1;
    return first + (extra > 0 ? "  ·  +" + extra + " line" + (extra > 1 ? "s" : "") : "");
  }

  function sumByCur(list) {
    var by = {};
    list.forEach(function (q) {
      if (q.total == null || isNaN(q.total)) return;
      var c = q.currency || "";
      by[c] = (by[c] || 0) + Number(q.total);
    });
    return by;
  }
  function curJoin(by, shortForm) {
    var keys = Object.keys(by);
    if (!keys.length) return "—";
    return keys.map(function (c) { return (shortForm ? moneyShort : money)(by[c], c); }).join("  ·  ");
  }

  // ── client-side digest metrics (fallback when the digest table is empty) ────
  function computeDigest() {
    if (digest) {
      return {
        needsInfo: digest.open_needs_info || 0,
        approvals: digest.needs_approval || 0,
        replies: digest.recent_replies || 0,
        source: "digest"
      };
    }
    var needsInfo = quotes.filter(function (q) {
      return linesOf(q).map(normLine).some(function (l) {
        return l.status === "pending_info" || l.status === "pending_hassan";
      });
    }).length;
    var approvals = quotes.filter(needsApproval).length;
    var replies = quotes.filter(function (q) { return q.last_reply_text; }).length;
    return { needsInfo: needsInfo, approvals: approvals, replies: replies, source: "client" };
  }
  function greenReady() {
    return quotes.filter(function (q) { return tierOf(q) === "green" && isDraft(q); }).length;
  }

  // ── digest banner ───────────────────────────────────────────────────────────
  function renderDigest() {
    var bar = el("digestBar");
    if (!bar) return;
    var d = computeDigest();
    var green = greenReady();
    var total = d.needsInfo + d.approvals + d.replies + green;
    if (!hasLoaded) { bar.hidden = true; return; }
    if (total === 0) {
      bar.hidden = false;
      bar.className = "qc-digest calm";
      bar.innerHTML = '<div class="qc-digest-calm"><span class="qc-digest-tick">' +
        '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5L20 7"/></svg></span>' +
        'Inbox clear — no quotes are waiting on you right now.</div>';
      return;
    }
    bar.hidden = false;
    bar.className = "qc-digest";
    var segs = [
      { k: "green", n: green, label: green === 1 ? "ready to send" : "ready to send", cls: "seg-green",
        ico: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m22 2-7 20-4-9-9-4Z"/></svg>' },
      { k: "info", n: d.needsInfo, label: "need input", cls: "seg-info",
        ico: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 8h.01M11 12h1v4h1"/></svg>' },
      { k: "approve", n: d.approvals, label: "thin-margin approvals", cls: "seg-approve",
        ico: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9 2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/></svg>' },
      { k: "reply", n: d.replies, label: d.replies === 1 ? "new reply" : "new replies", cls: "seg-reply",
        ico: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>' }
    ];
    bar.innerHTML =
      '<div class="qc-digest-lead">Today&rsquo;s copilot brief' +
        (d.source === "client" ? '<span class="qc-digest-live" title="Computed live from the loaded quotes">live</span>' : "") +
      '</div>' +
      '<div class="qc-digest-segs">' +
      segs.map(function (s) {
        var dim = s.n === 0 ? " dim" : "";
        return '<button type="button" class="qc-seg ' + s.cls + dim + '" data-digest="' + s.k + '"' +
          (s.n === 0 ? " disabled" : "") + '>' +
          '<span class="qc-seg-ico">' + s.ico + "</span>" +
          '<span class="qc-seg-n">' + s.n + "</span>" +
          '<span class="qc-seg-l">' + esc(s.label) + "</span></button>";
      }).join("") +
      "</div>";
  }
  el("digestBar").addEventListener("click", function (e) {
    var b = e.target.closest ? e.target.closest("button[data-digest]") : null;
    if (!b) return;
    var k = b.getAttribute("data-digest");
    // Reset filters, then apply the segment's focus.
    el("search").value = "";
    el("statusFilter").value = "all";
    el("tierFilter").value = "all";
    el("outcomeFilter").value = "all";
    approvalOnly = false;
    el("approvalFilter").setAttribute("aria-pressed", "false");
    el("approvalFilter").classList.remove("on");
    if (k === "green") { el("tierFilter").value = "green"; el("statusFilter").value = "draft"; }
    else if (k === "approve") { approvalOnly = true; el("approvalFilter").setAttribute("aria-pressed", "true"); el("approvalFilter").classList.add("on"); }
    else if (k === "info") { el("statusFilter").value = "draft"; digestFocus = "info"; }
    else if (k === "reply") { digestFocus = "reply"; }
    if (k !== "info" && k !== "reply") digestFocus = null;
    renderTable();
    el("quotesTable").scrollIntoView({ behavior: "smooth", block: "start" });
  });
  var digestFocus = null; // 'info' | 'reply' — extra filters the segments can toggle

  // ── tiles ─────────────────────────────────────────────────────────────────
  function renderTiles() {
    var drafts = quotes.filter(isDraft).length;
    var won = quotes.filter(function (q) { return outcomeOf(q) === "won"; });
    var lost = quotes.filter(function (q) { return outcomeOf(q) === "lost"; });
    var decided = won.length + lost.length;
    var winRate = decided > 0 ? Math.round(won.length / decided * 100) : null;
    var pending = quotes.length - won.length - lost.length;
    var awaiting = quotes.filter(needsApproval).length;

    var tiles = [
      { n: quotes.length, l: "Quotes logged" },
      { n: pending, l: "Pending decision", sub2: drafts + " still in draft" },
      { n: awaiting, l: "Awaiting approval", warn: awaiting > 0, sub2: awaiting > 0 ? "margin / discount flagged" : "none flagged" },
      { n: winRate == null ? "—" : winRate + "%", l: "Win rate", accent: true, sub2: won.length + " won · " + lost.length + " lost" },
      { n: curJoin(sumByCur(quotes), true), l: "Quoted value", small: true },
      { n: curJoin(sumByCur(won), true), l: "Won value", small: true, dark: true },
    ];
    el("tiles").innerHTML = tiles.map(function (t) {
      return '<div class="qc-tile' + (t.accent ? " accent" : "") + (t.dark ? " dark" : "") + (t.warn ? " warn" : "") + '">' +
        '<div class="l">' + esc(t.l) + "</div>" +
        '<div class="n' + (t.small ? " small" : "") + '">' + esc(t.n) + "</div>" +
        (t.sub2 ? '<div class="sub2">' + esc(t.sub2) + "</div>" : "") +
      "</div>";
    }).join("");

    var chip = el("approvalChipN");
    if (chip) { chip.hidden = awaiting === 0; chip.textContent = awaiting; }
  }

  // ── over-time chart (hand-rolled SVG) ───────────────────────────────────────
  function renderChart() {
    var host = el("chart");
    var months = {};
    quotes.forEach(function (q) {
      if (!q.created_at) return;
      var d = new Date(q.created_at);
      if (isNaN(d)) return;
      var key = d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2);
      if (!months[key]) months[key] = { key: key, d: d, total: 0, won: 0 };
      months[key].total += 1;
      if (outcomeOf(q) === "won") months[key].won += 1;
    });
    var keys = Object.keys(months).sort();
    if (!keys.length) { host.innerHTML = '<div class="empty">No dated quotes yet.</div>'; return; }
    keys = keys.slice(-12);
    var data = keys.map(function (k) { return months[k]; });
    var maxN = data.reduce(function (m, x) { return Math.max(m, x.total); }, 1);

    var VBW = 1000, VBH = 250, padT = 30, padB = 42, padX = 20;
    var innerH = VBH - padT - padB;
    var baseY = padT + innerH;
    var n = data.length;
    // Cap the column pitch so a sparse chart clusters left (with room to grow)
    // rather than floating one fat bar in the middle.
    var slot = Math.min((VBW - padX * 2) / n, 132);
    var plotW = slot * n;
    var barW = Math.max(12, Math.min(64, slot * 0.46));
    var parts = [];
    // horizontal gridlines + baseline — makes even one bar read as a chart
    var ticks = Math.min(maxN, 4);
    for (var g = 1; g <= ticks; g++) {
      var gy = (padT + innerH - (g / ticks) * innerH).toFixed(1);
      parts.push('<line class="grid" x1="' + padX + '" y1="' + gy + '" x2="' + (padX + plotW).toFixed(1) + '" y2="' + gy + '"/>');
    }
    parts.push('<line class="axis-base" x1="' + padX + '" y1="' + baseY + '" x2="' + (padX + plotW).toFixed(1) + '" y2="' + baseY + '"/>');
    data.forEach(function (x, i) {
      var cx = padX + slot * i + slot / 2;
      var bx = cx - barW / 2;
      var totH = x.total > 0 ? Math.max(5, Math.round(x.total / maxN * innerH)) : 0;
      var wonH = Math.round(x.won / maxN * innerH);
      var restH = totH - wonH;
      var yTop = padT + (innerH - totH);
      // single rounded column, won portion overlaid at the base
      if (totH > 0) parts.push('<rect class="bar-rest" x="' + bx.toFixed(1) + '" y="' + yTop + '" width="' + barW.toFixed(1) + '" height="' + totH + '" rx="7"/>');
      if (wonH > 0) parts.push('<rect class="bar-won" x="' + bx.toFixed(1) + '" y="' + (baseY - wonH) + '" width="' + barW.toFixed(1) + '" height="' + Math.max(wonH, 7) + '" rx="7"/>');
      parts.push('<text class="axis-lbl cnt" x="' + cx.toFixed(1) + '" y="' + (yTop - 11) + '" text-anchor="middle" font-size="20" font-weight="600">' + x.total + '</text>');
      var lbl = x.d.toLocaleDateString("en-GB", { month: "short" });
      parts.push('<text class="axis-lbl" x="' + cx.toFixed(1) + '" y="' + (VBH - 12) + '" text-anchor="middle" font-size="16">' + lbl + '</text>');
    });
    host.innerHTML = '<svg viewBox="0 0 ' + VBW + ' ' + VBH + '" preserveAspectRatio="xMinYMid meet" role="img" aria-label="Quotes per month">' + parts.join("") + '</svg>';
  }

  // ── loading / empty / error states ──────────────────────────────────────────
  var COLSPAN = 11;
  function renderSkeleton() {
    el("tiles").innerHTML = "<div class=\"sk sk-tile\"></div>".repeat(6);
    el("chart").innerHTML = '<div class="sk sk-chart"></div>';
    var widths = [16, 16, 70, 150, 84, 48, 46, 50, 70, 96, 16];
    var cells = widths.map(function (w, i) {
      var cls = (i === 4 || i === 5) ? ' class="num"' : "";
      var ml = (i === 4 || i === 5) ? "margin-left:auto;" : "";
      return "<td" + cls + '><span class="sk sk-line" style="' + ml + "width:" + w + 'px"></span></td>';
    }).join("");
    el("quotesBody").innerHTML = ('<tr class="qc-skrow">' + cells + "</tr>").repeat(6);
    el("emptyState").hidden = true;
    hideTableError();
    el("rowCount").textContent = "Loading…";
  }
  function emptyPanel(icon, title, body) {
    return '<div class="ico">' + icon + "</div><h4>" + esc(title) + "</h4><p>" + esc(body) + "</p>";
  }
  var ICON_INBOX = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12h5l2 3h4l2-3h5"/><path d="M5 5.5h14a1.5 1.5 0 0 1 1.45 1.1L22 12v5a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-5l1.55-5.4A1.5 1.5 0 0 1 5 5.5z"/></svg>';
  var ICON_FILTER = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3 5h18l-7 8v5l-4 2v-7L3 5z"/></svg>';
  var ICON_WARN = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9 2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/></svg>';
  function showTableError(msg) {
    var t = el("tableError");
    t.innerHTML = '<div class="ico">' + ICON_WARN + "</div><h4>Couldn’t load quotes</h4>" +
      "<p>" + esc(msg || "Something went wrong reaching the quote store.") + "</p>" +
      '<button type="button" id="retryBtn" class="btn btn-primary btn-sm">Try again</button>';
    t.hidden = false;
    el("quotesTable").style.display = "none";
    el("emptyState").hidden = true;
    el("rowCount").textContent = "";
    if (!hasLoaded) { el("tiles").innerHTML = ""; el("chart").innerHTML = ""; }
    var rb = el("retryBtn");
    if (rb) rb.addEventListener("click", loadQuotes);
  }
  function hideTableError() {
    var t = el("tableError");
    if (t) t.hidden = true;
    var tbl = el("quotesTable");
    if (tbl) tbl.style.display = "";
  }
  function setRefreshing(on) {
    loading = on;
    var b = el("refreshBtn");
    if (!b) return;
    b.classList.toggle("is-loading", on);
    b.textContent = on ? "Refreshing…" : "Refresh";
  }

  // ── table ─────────────────────────────────────────────────────────────────
  function tierCell(q) {
    var t = tierOf(q);
    if (!t) return '<span class="qc-tier none" title="Tier not computed yet">—</span>';
    var lbl = { green: "Ready", amber: "Review", red: "Needs work" }[t];
    return '<span class="qc-tier ' + t + '" title="Autonomy tier: ' + t + '"><i></i>' + lbl + "</span>";
  }
  function marginCell(q) {
    var p = numOrNull(q.margin_pct);
    if (p == null) return '<span class="qc-mut">—</span>';
    var band = marginBand(p);
    return '<span class="qc-margin ' + band + '" title="' + esc(money(q.margin_amount, q.currency)) + ' margin">' +
      esc(p.toFixed(p % 1 === 0 ? 0 : 1)) + '%</span>';
  }
  function confCell(v) {
    if (v == null) return '<span class="qc-mut">—</span>';
    var band = confBand(v);
    return '<span class="qc-conf ' + band + '"><i></i>' + esc(Math.round(v)) + '</span>';
  }
  function approvalCell(q, id) {
    if (needsApproval(q)) {
      return '<button class="qc-approve" data-approve="' + esc(id) + '"' +
        (q.approval_reason ? ' title="' + esc(q.approval_reason) + '"' : "") + '>' +
        '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5L20 7"/></svg>Approve</button>';
    }
    if (q.approved_by) {
      return '<span class="qc-approved" title="Approved by ' + esc(q.approved_by) +
        (q.approved_at ? " · " + esc(fmtDate(q.approved_at)) : "") + '">' +
        '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5L20 7"/></svg>Approved</span>';
    }
    return '<span class="qc-mut">—</span>';
  }
  var CHEVRON = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>';

  function filteredRows() {
    var q = (el("search").value || "").trim().toLowerCase();
    var sf = el("statusFilter").value;
    var tf = el("tierFilter").value;
    var of = el("outcomeFilter").value;
    return quotes.filter(function (r) {
      if (q) {
        var hay = ((r.customer || "") + " " + productSummary(r)).toLowerCase();
        if (hay.indexOf(q) === -1) return false;
      }
      if (sf !== "all" && bucket(r) !== sf) return false;
      if (tf !== "all" && tierOf(r) !== tf) return false;
      if (of !== "all" && outcomeOf(r) !== of) return false;
      if (approvalOnly && !needsApproval(r)) return false;
      if (digestFocus === "info" && !linesOf(r).map(normLine).some(function (l) { return l.status === "pending_info" || l.status === "pending_hassan"; })) return false;
      if (digestFocus === "reply" && !r.last_reply_text) return false;
      return true;
    });
  }

  function renderTable() {
    var rows = filteredRows();
    el("rowCount").textContent = rows.length + " of " + quotes.length;
    var empty = el("emptyState");
    if (rows.length === 0) {
      empty.hidden = false;
      if (quotes.length === 0) {
        empty.innerHTML = emptyPanel(ICON_INBOX, "No quotes yet",
          "Quotes drafted by the RFQ pipeline land here automatically. Send a real request to the connected mailbox and the first draft will appear.");
      } else {
        empty.innerHTML = emptyPanel(ICON_FILTER, "No matches",
          "No quotes fit these filters. Clear the search, drop the approval filter, or widen the tier / send state and outcome.");
      }
    } else {
      empty.hidden = true;
    }
    el("quotesBody").innerHTML = rows.map(function (r) {
      var b = bucket(r);
      var oc = outcomeOf(r);
      var id = r.id != null ? String(r.id) : "";
      var flagged = needsApproval(r);
      var sel = !!selected[id];
      var acts = '<span class="qc-acts">' +
        '<button class="qc-act win ' + (oc === "won" ? "on" : "") + '" data-id="' + esc(id) + '" data-act="won">Won</button>' +
        '<button class="qc-act lose ' + (oc === "lost" ? "on" : "") + '" data-id="' + esc(id) + '" data-act="lost">Lost</button>' +
        (oc !== "pending" ? '<button class="qc-act" data-id="' + esc(id) + '" data-act="pending">Reset</button>' : "") +
        "</span>";
      var summary = productSummary(r);
      return '<tr data-row="' + esc(id) + '" class="qc-row' + (flagged ? " needs-approval" : "") + (sel ? " is-sel" : "") + (openId === id ? " is-open" : "") + '">' +
        '<td class="qc-col-sel"><input type="checkbox" class="qc-rowsel" data-sel="' + esc(id) + '"' + (sel ? " checked" : "") + ' aria-label="Select quote"></td>' +
        '<td class="qc-col-tier">' + tierCell(r) + "</td>" +
        "<td>" + esc(fmtDate(r.created_at)) + "</td>" +
        '<td class="qc-cust"><span class="qc-cust-name">' + esc(r.customer || "—") + "</span>" +
          (summary ? '<span class="qc-cust-prod">' + esc(summary) + "</span>" : "") +
          (r.last_reply_text ? '<span class="qc-reply-dot" title="New customer reply on this thread">new reply</span>' : "") + "</td>" +
        '<td class="num qc-total">' + esc(money(r.total, r.currency)) + "</td>" +
        '<td class="num">' + marginCell(r) + "</td>" +
        "<td>" + confCell(overallConf(r)) + "</td>" +
        "<td><span class='pill " + b + "'>" + (b === "draft" ? "Draft" : "Sent") + "</span></td>" +
        "<td>" + approvalCell(r, id) + "</td>" +
        "<td><div class='qc-outcome'><span class='pill " + oc + "'>" + oc.charAt(0).toUpperCase() + oc.slice(1) + "</span>" + acts + "</div></td>" +
        '<td class="qc-col-open"><span class="qc-open-cue" aria-hidden="true">' + CHEVRON + "</span></td>" +
      "</tr>";
    }).join("");
    syncSelectAll();
  }

  function render() { renderDigest(); renderTiles(); renderChart(); renderTable(); renderBulk(); }

  // ── selection / bulk ────────────────────────────────────────────────────────
  function onSelectAll() {
    var on = el("selectAll").checked;
    var rows = filteredRows();
    rows.forEach(function (r) {
      var id = r.id != null ? String(r.id) : "";
      if (on) selected[id] = true; else delete selected[id];
    });
    renderTable();
    renderBulk();
  }
  function syncSelectAll() {
    var rows = filteredRows();
    var sa = el("selectAll");
    if (!sa) return;
    var selCount = rows.filter(function (r) { return selected[String(r.id)]; }).length;
    sa.checked = rows.length > 0 && selCount === rows.length;
    sa.indeterminate = selCount > 0 && selCount < rows.length;
  }
  function selectedQuotes() {
    return quotes.filter(function (q) { return selected[String(q.id)]; });
  }
  function renderBulk() {
    var bar = el("bulkBar");
    var list = selectedQuotes();
    if (!list.length) { bar.hidden = true; bar.innerHTML = ""; document.body.classList.remove("qc-has-bulk"); return; }
    var drafts = list.filter(isDraft).length;
    bar.hidden = false;
    document.body.classList.add("qc-has-bulk");
    bar.innerHTML =
      '<span class="qc-bulk-n">' + list.length + " selected</span>" +
      '<span class="qc-bulk-sub">' + drafts + " draft" + (drafts === 1 ? "" : "s") + "</span>" +
      '<span class="qc-bulk-sp"></span>' +
      '<button type="button" class="btn btn-primary btn-sm" id="bulkSend"' + (drafts === 0 ? " disabled" : "") + '>Send ' + drafts + " draft" + (drafts === 1 ? "" : "s") + "</button>" +
      '<div class="qc-bulk-label"><input type="text" id="bulkLabelInput" class="qc-bulk-input" placeholder="Label name" maxlength="60">' +
        '<button type="button" class="btn btn-ghost btn-sm" id="bulkLabel">Apply label</button></div>' +
      '<button type="button" class="qc-bulk-clear" id="bulkClear" aria-label="Clear selection">Clear</button>';
    el("bulkSend").addEventListener("click", bulkSend);
    el("bulkLabel").addEventListener("click", bulkLabel);
    el("bulkClear").addEventListener("click", function () { selected = {}; renderTable(); renderBulk(); });
  }

  // ── secured webhook client ──────────────────────────────────────────────────
  function api(path, body) {
    return sb.auth.getSession().then(function (res) {
      var s = res.data && res.data.session;
      var token = s && s.access_token;
      if (!token) { return Promise.reject({ status: 401, message: "Session expired — sign in again." }); }
      return fetch(WEBHOOK_BASE + path, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": "Bearer " + token },
        body: JSON.stringify(body || {})
      }).then(function (r) {
        return r.text().then(function (txt) {
          var json = null;
          try { json = txt ? JSON.parse(txt) : null; } catch (e) { json = null; }
          if (r.status === 401 || r.status === 403) {
            return Promise.reject({ status: r.status, message: (json && json.error) || "Not authorised — your session may have expired." });
          }
          if (!r.ok || (json && json.ok === false)) {
            return Promise.reject({ status: r.status, message: (json && (json.error || json.message)) || ("Request failed (" + r.status + ").") });
          }
          return json || { ok: true };
        });
      });
    });
  }
  function handleApiError(err) {
    var msg = (err && err.message) || "Network error.";
    if (err && (err.status === 401 || err.status === 403)) {
      toast(msg, true);
    } else {
      toast(msg, true);
    }
  }

  // ── confirm dialog (promise) ────────────────────────────────────────────────
  function confirmDialog(title, bodyHtml, okLabel, danger) {
    var dlg = el("confirmDialog");
    el("confirmTitle").textContent = title;
    el("confirmBody").innerHTML = bodyHtml;
    var ok = el("confirmOk");
    ok.textContent = okLabel || "Confirm";
    ok.classList.toggle("is-danger", !!danger);
    return new Promise(function (resolve) {
      function onClose() {
        dlg.removeEventListener("close", onClose);
        resolve(dlg.returnValue === "ok");
      }
      dlg.addEventListener("close", onClose);
      if (typeof dlg.showModal === "function") dlg.showModal();
      else resolve(window.confirm(title));
    });
  }

  // ── outcome write ───────────────────────────────────────────────────────────
  function setOutcome(id, outcome, btn) {
    if (!id) return;
    var acts = btn && btn.parentNode ? btn.parentNode.querySelectorAll("button") : [];
    for (var i = 0; i < acts.length; i++) acts[i].disabled = true;
    var patch = { outcome: outcome, outcome_at: new Date().toISOString() };
    sb.from("quotes").update(patch).eq("id", id).then(function (res) {
      for (var j = 0; j < acts.length; j++) acts[j].disabled = false;
      if (res.error) {
        var m = res.error.message || "";
        if (/column|outcome/i.test(m)) toast("Run quote-analytics.sql in Supabase first.", true);
        else toast("Couldn't save: " + m, true);
        return;
      }
      patchLocal(id, { outcome: outcome, outcome_at: patch.outcome_at });
      render();
      toast("Marked " + outcome + ".");
    }).catch(function () {
      for (var n = 0; n < acts.length; n++) acts[n].disabled = false;
      toast("Network error.", true);
    });
  }

  function approve(id, btn) {
    if (!id) return;
    var rec = findQuote(id);
    if (!rec) return;
    var snapshot = { needs_approval: rec.needs_approval, approved_by: rec.approved_by, approved_at: rec.approved_at };
    var now = new Date().toISOString();
    var by = currentEmail || "console";
    rec.needs_approval = false; rec.approved_by = by; rec.approved_at = now;
    render();
    if (openId === String(id)) renderDrawer();
    var patch = { needs_approval: false, approved_by: by, approved_at: now };
    sb.from("quotes").update(patch).eq("id", id).then(function (res) {
      if (res.error) {
        rec.needs_approval = snapshot.needs_approval; rec.approved_by = snapshot.approved_by; rec.approved_at = snapshot.approved_at;
        render(); if (openId === String(id)) renderDrawer();
        var m = res.error.message || "";
        if (/column|needs_approval|approved_by/i.test(m)) toast("Run quotewright-expansion.sql in Supabase first.", true);
        else toast("Couldn't approve: " + m, true);
        return;
      }
      toast("Approved.");
    }).catch(function () {
      rec.needs_approval = snapshot.needs_approval; rec.approved_by = snapshot.approved_by; rec.approved_at = snapshot.approved_at;
      render(); if (openId === String(id)) renderDrawer();
      toast("Network error — not approved.", true);
    });
  }

  function findQuote(id) {
    for (var i = 0; i < quotes.length; i++) if (String(quotes[i].id) === String(id)) return quotes[i];
    return null;
  }
  function patchLocal(id, fields) {
    var q = findQuote(id);
    if (!q) return;
    for (var k in fields) if (fields.hasOwnProperty(k)) q[k] = fields[k];
  }

  // ════════════════════════════════════════════════════════════════════════════
  //  WORKSPACE DRAWER — thread, product-forward lines + resolution, draft + actions
  // ════════════════════════════════════════════════════════════════════════════
  function openDrawer(id) {
    if (!id) return;
    openId = String(id);
    lastFocus = document.activeElement;
    renderDrawer();
    var scrim = el("drawerScrim"), dr = el("drawer");
    scrim.hidden = false; dr.hidden = false; dr.setAttribute("aria-hidden", "false");
    document.body.classList.add("qc-drawer-open");
    // next frame → transition in
    requestAnimationFrame(function () { scrim.classList.add("show"); dr.classList.add("show"); });
    var closeBtn = el("drawer").querySelector(".qc-drawer-close");
    if (closeBtn) closeBtn.focus();
    renderTable(); // reflect is-open highlight
  }
  function closeDrawer() {
    if (openId == null) return;
    var scrim = el("drawerScrim"), dr = el("drawer");
    scrim.classList.remove("show"); dr.classList.remove("show");
    dr.setAttribute("aria-hidden", "true");
    document.body.classList.remove("qc-drawer-open");
    var was = openId; openId = null;
    var finish = function () {
      scrim.hidden = true; dr.hidden = true;
      dr.removeEventListener("transitionend", onEnd);
    };
    var onEnd = function (e) { if (e.target === dr && e.propertyName === "transform") finish(); };
    dr.addEventListener("transitionend", onEnd);
    setTimeout(finish, 420); // fallback if transitionend doesn't fire
    if (lastFocus && lastFocus.focus) lastFocus.focus();
    renderTable();
    void was;
  }

  function renderDrawer() {
    if (openId == null) return;
    var q = findQuote(openId);
    if (!q) { closeDrawer(); return; }
    el("drawerInner").innerHTML = drawerHtml(q);
  }

  function drawerHtml(q) {
    var id = String(q.id);
    var b = bucket(q);
    var tier = tierOf(q);
    var tierBadge = tier
      ? '<span class="qc-tier ' + tier + '"><i></i>' + { green: "Ready", amber: "Review", red: "Needs work" }[tier] + "</span>"
      : "";
    var sentInfo = (b === "sent" && q.sent_at)
      ? '<span class="qc-sentline">Sent ' + esc(fmtDateTime(q.sent_at)) + (q.sent_by ? " · " + esc(q.sent_by) : "") + "</span>" : "";

    // ── header
    var head =
      '<div class="qc-dh">' +
        '<button class="qc-drawer-close" aria-label="Close workspace">' +
          '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button>' +
        '<div class="qc-dh-main">' +
          '<div class="qc-dh-row">' +
            '<h2 class="qc-dh-cust">' + esc(q.customer || "Quote") + "</h2>" +
            '<span class="pill ' + b + '">' + (b === "draft" ? "Draft" : "Sent") + "</span>" +
            tierBadge +
          "</div>" +
          '<div class="qc-dh-meta">' + esc(fmtDate(q.created_at)) +
            '  ·  <span class="qc-dh-total">' + esc(money(q.total, q.currency)) + "</span>" +
            (numOrNull(q.grand_total_vadeli) != null ? '  ·  term ' + esc(money(q.grand_total_vadeli, q.currency)) : "") +
            (sentInfo ? "  ·  " + sentInfo : "") +
          "</div>" +
        "</div>" +
      "</div>";

    var reply = q.last_reply_text
      ? '<div class="qc-dnote"><strong>New customer reply</strong><p>' + nl2br(q.last_reply_text) + "</p></div>" : "";

    return head +
      '<div class="qc-dbody">' +
        reply +
        threadPanel(q) +
        linesPanel(q, id) +
        draftPanel(q, id) +
      "</div>";
  }

  // ── thread panel (reads thread_snapshot; no live Gmail call) ─────────────────
  function normMsg(m) {
    var from = m.from || m.sender || m.author || m.email || "";
    var date = m.date || m.ts || m.timestamp || m.created_at || m.time || "";
    var body = m.body || m.text || m.snippet || m.content || m.message || "";
    var dir = (m.direction || m.type || m.role || "").toLowerCase();
    var outbound;
    if (dir === "outbound" || dir === "sent" || dir === "firm" || dir === "agent" || dir === "us") outbound = true;
    else if (dir === "inbound" || dir === "received" || dir === "customer") outbound = false;
    else outbound = FIRM_HINTS.some(function (h) { return String(from).toLowerCase().indexOf(h) !== -1; });
    return { from: from, date: date, body: body, outbound: outbound };
  }
  function threadPanel(q) {
    var msgs = threadOf(q).map(normMsg);
    var inner;
    if (!msgs.length) {
      inner = '<div class="qc-empty-mini">The conversation snapshot appears once the pipeline stores <code>thread_snapshot</code>. ' +
        "Until then, open the customer's thread from the draft below.</div>";
    } else {
      inner = '<div class="qc-thread">' + msgs.map(function (m) {
        return '<div class="qc-msg ' + (m.outbound ? "out" : "in") + '">' +
          '<div class="qc-msg-head"><span class="qc-msg-from">' + esc(m.from || (m.outbound ? "Hassan" : "Customer")) + "</span>" +
            (m.date ? '<span class="qc-msg-date">' + esc(fmtDateTime(m.date)) + "</span>" : "") + "</div>" +
          '<div class="qc-msg-body">' + nl2br(m.body) + "</div></div>";
      }).join("") + "</div>";
    }
    return section("Conversation", msgs.length ? (msgs.length + " message" + (msgs.length > 1 ? "s" : "")) : "", inner);
  }

  // ── product-forward lines + resolution picker ────────────────────────────────
  function statusPill(status) {
    return status === "priced" ? '<span class="pill sent">Priced</span>'
      : status === "provisional" ? '<span class="pill provisional">Priced · confirm spec</span>'
      : status === "pending_info" ? '<span class="pill pending">Needs info</span>'
      : status === "pending_hassan" ? '<span class="pill info">Pending price</span>'
      : "";
  }
  function candChip(id, ref, c) {
    var price = (c.unit_price != null && c.unit_price !== "")
      ? '<span class="qc-cand-price">' + esc(money(c.unit_price, c.currency)) + "</span>" : "";
    var conf = numOrNull(c.confidence);
    var confTag = conf != null ? '<span class="qc-conf ' + confBand(conf) + '"><i></i>' + Math.round(conf) + "</span>" : "";
    var specs = [c.specs, c.colour || c.color].filter(Boolean).join(" · ");
    return '<button type="button" class="qc-cand" data-resolve="' + esc(id) + '" data-ref="' + esc(ref) + '" data-sku="' + esc(c.sku || "") + '">' +
      '<span class="qc-cand-top"><span class="qc-cand-name">' + esc(c.name || c.urun_adi || c.sku || "Candidate") + "</span>" + price + "</span>" +
      (specs ? '<span class="qc-cand-specs">' + esc(specs) + "</span>" : "") +
      '<span class="qc-cand-foot">' + (c.sku ? '<span class="qc-cand-sku">' + esc(c.sku) + "</span>" : "") +
        (c.reason ? '<span class="qc-cand-why">' + esc(c.reason) + "</span>" : "") + confTag + "</span>" +
      '<span class="qc-cand-pick">Use this' +
        '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg></span>' +
      "</button>";
  }
  function lineCard(q, id, raw) {
    var l = normLine(raw);
    var weak = lineWeak(l);
    var unit = l.unit_cash != null && String(l.unit_cash).trim() !== "" ? esc(String(l.unit_cash)) : "";
    var qty = l.qty != null ? esc(l.qty.toLocaleString("en-US")) + (l.qty_unit ? " " + esc(l.qty_unit) : "") : "";
    var total = l.total_cash != null ? money(l.total_cash, q.currency) : "";
    var metaBits = [];
    if (l.spec) metaBits.push(esc(l.spec));
    if (l.colors) metaBits.push(esc(l.colors));
    var head =
      '<div class="qc-line-head">' +
        '<div class="qc-line-id">' + esc(l.ref || "—") + "</div>" +
        '<div class="qc-line-main">' +
          '<div class="qc-line-name">' + esc(l.name) + "</div>" +
          (metaBits.length ? '<div class="qc-line-spec">' + metaBits.join(" · ") + "</div>" : "") +
          '<div class="qc-line-tags">' +
            (l.sku ? '<span class="qc-sku-tag">' + esc(l.sku) + "</span>" : '<span class="qc-sku-tag muted">unmatched</span>') +
            (l.conf != null ? confCell(l.conf) : "") +
          "</div>" +
        "</div>" +
        '<div class="qc-line-num">' +
          (unit ? '<div class="qc-line-unit">' + unit + "</div>" : "") +
          (qty ? '<div class="qc-line-qty">' + qty + "</div>" : "") +
          (total ? '<div class="qc-line-total">' + esc(total) + "</div>" : "") +
          statusPill(l.status) +
        "</div>" +
      "</div>";

    var resolver = "";
    if (weak) {
      var chips = l.candidates.length
        ? '<div class="qc-cands">' + l.candidates.map(function (c) { return candChip(id, l.ref, c); }).join("") + "</div>"
        : '<div class="qc-empty-mini">No ranked candidates were logged for this line. Search the catalogue below.</div>';
      resolver =
        '<div class="qc-resolve">' +
          '<div class="qc-resolve-lead">Resolve this line — one tap prices it, regenerates the draft &amp; teaches the pipeline.</div>' +
          chips +
          '<div class="qc-search-cat">' +
            '<input type="text" class="qc-catsearch" data-ref="' + esc(l.ref) + '" placeholder="Search catalogue by name, SKU, colour or GSM…">' +
            '<div class="qc-catresults" data-ref="' + esc(l.ref) + '"></div>' +
          "</div>" +
          '<div class="qc-line-actions">' +
            '<button type="button" class="qc-mini-btn" data-clarify="' + esc(id) + '" data-ref="' + esc(l.ref) + '">Ask the customer for this spec</button>' +
          "</div>" +
        "</div>";
    }
    return '<div class="qc-line' + (weak ? " weak" : "") + '" data-line="' + esc(l.ref) + '">' + head + resolver + "</div>";
  }
  function linesPanel(q, id) {
    var lines = linesOf(q);
    var weakN = lines.map(normLine).filter(lineWeak).length;
    var inner;
    if (!lines.length) {
      inner = '<div class="qc-empty-mini">No line-by-line detail was logged with this quote.</div>';
    } else {
      inner = '<div class="qc-lines-list">' + lines.map(function (raw) { return lineCard(q, id, raw); }).join("") + "</div>";
    }
    var sub = lines.length ? (lines.length + " line" + (lines.length > 1 ? "s" : "") + (weakN ? "  ·  " + weakN + " to resolve" : "  ·  all priced")) : "";
    return section("Line items", sub, inner);
  }

  // ── draft + actions ──────────────────────────────────────────────────────────
  function draftPanel(q, id) {
    var txt = draftText(q);
    var body =
      '<textarea class="qc-draft" id="draftBox" spellcheck="true" aria-label="Draft reply">' + esc(txt) + "</textarea>" +
      '<div class="qc-draft-actions">' +
        '<button type="button" class="btn btn-primary qc-send" data-send="' + esc(id) + '">' +
          '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>' +
          'Approve &amp; send</button>' +
        '<button type="button" class="btn btn-ghost qc-reply" data-reply="' + esc(id) + '">Send edited reply</button>' +
        '<div class="qc-label-inline">' +
          '<input type="text" class="qc-label-input" id="labelInput" placeholder="Label" maxlength="60">' +
          '<button type="button" class="btn btn-ghost btn-sm qc-relabel" data-relabel="' + esc(id) + '" data-action="add">Add</button>' +
          '<button type="button" class="btn btn-ghost btn-sm qc-relabel" data-relabel="' + esc(id) + '" data-action="remove">Remove</button>' +
        "</div>" +
      "</div>" +
      '<p class="qc-gate-note">Sending emails the customer from the firm mailbox. Nothing leaves until you approve it here — this is the send gate.</p>';
    return section("Draft reply", isDraft(q) ? "pending your send" : "sent", body);
  }

  function section(title, sub, inner) {
    return '<section class="qc-dsec">' +
      '<div class="qc-dsec-head"><h3>' + esc(title) + "</h3>" + (sub ? '<span class="qc-dsec-sub">' + esc(sub) + "</span>" : "") + "</div>" +
      inner + "</section>";
  }

  // ── drawer event handling ────────────────────────────────────────────────────
  function onDrawerClick(e) {
    var t = e.target;
    var closeBtn = t.closest ? t.closest(".qc-drawer-close") : null;
    if (closeBtn) { closeDrawer(); return; }
    var cand = t.closest ? t.closest("button[data-resolve]") : null;
    if (cand) { resolveLine(cand.getAttribute("data-resolve"), cand.getAttribute("data-ref"), cand.getAttribute("data-sku"), cand); return; }
    var use = t.closest ? t.closest("button[data-usesku]") : null;
    if (use) { resolveLine(use.getAttribute("data-usesku"), use.getAttribute("data-ref"), use.getAttribute("data-sku"), use); return; }
    var send = t.closest ? t.closest("button[data-send]") : null;
    if (send) { doSend(send.getAttribute("data-send"), send); return; }
    var rep = t.closest ? t.closest("button[data-reply]") : null;
    if (rep) { doReply(rep.getAttribute("data-reply"), rep); return; }
    var clar = t.closest ? t.closest("button[data-clarify]") : null;
    if (clar) { doClarify(clar.getAttribute("data-clarify"), clar.getAttribute("data-ref"), clar); return; }
    var rel = t.closest ? t.closest("button[data-relabel]") : null;
    if (rel) { doRelabel(rel.getAttribute("data-relabel"), rel.getAttribute("data-action"), rel); return; }
  }
  var catTimer = null;
  function onDrawerInput(e) {
    var inp = e.target;
    if (inp && inp.classList && inp.classList.contains("qc-catsearch")) {
      var ref = inp.getAttribute("data-ref");
      var val = inp.value.trim();
      if (catTimer) clearTimeout(catTimer);
      catTimer = setTimeout(function () { catalogSearch(ref, val); }, 260);
    }
  }
  function catResultsEl(ref) {
    var list = el("drawerInner").querySelectorAll('.qc-catresults');
    for (var i = 0; i < list.length; i++) if (list[i].getAttribute("data-ref") === String(ref)) return list[i];
    return null;
  }
  function catalogSearch(ref, term) {
    var host = catResultsEl(ref);
    if (!host) return;
    if (!term) { host.innerHTML = ""; return; }
    host.innerHTML = '<div class="qc-cat-loading">Searching…</div>';
    var like = "%" + term.replace(/[%,]/g, " ") + "%";
    var digits = term.replace(/[^0-9]/g, "");
    var orExpr = "urun_adi.ilike." + like + ",sku.ilike." + like + ",color.ilike." + like + ",product_line.ilike." + like;
    if (digits) orExpr += ",gsm.eq." + digits;
    sb.from("products")
      .select("sku,urun_adi,gsm,color,product_line,satis_eur,satis_usd,is_microfiber")
      .or(orExpr).limit(8)
      .then(function (res) {
        if (openId == null) return;
        if (res.error) { host.innerHTML = '<div class="qc-empty-mini">Catalogue search failed: ' + esc(res.error.message) + "</div>"; return; }
        var rows = res.data || [];
        if (!rows.length) { host.innerHTML = '<div class="qc-empty-mini">No catalogue products match “' + esc(term) + '”.</div>'; return; }
        host.innerHTML = rows.map(function (p) {
          var mf = String(p.is_microfiber) === "true";
          var price = mf ? (p.satis_usd != null ? money(p.satis_usd, "USD") + "/m²" : "") : (p.satis_eur != null ? money(p.satis_eur, "EUR") + "/m²" : "");
          var specs = [p.gsm ? p.gsm + " gsm" : "", p.color, p.product_line].filter(Boolean).join(" · ");
          return '<div class="qc-catrow">' +
            '<div class="qc-catrow-main"><span class="qc-catrow-name">' + esc(p.urun_adi || p.sku) + "</span>" +
              (specs ? '<span class="qc-catrow-specs">' + esc(specs) + "</span>" : "") +
              '<span class="qc-sku-tag">' + esc(p.sku) + "</span></div>" +
            '<div class="qc-catrow-right">' + (price ? '<span class="qc-catrow-price">' + esc(price) + "</span>" : "") +
              '<button type="button" class="qc-mini-btn primary" data-usesku="' + esc(openId) + '" data-ref="' + esc(ref) + '" data-sku="' + esc(p.sku) + '">Use</button></div>' +
          "</div>";
        }).join("");
      }, function () {
        if (host) host.innerHTML = '<div class="qc-empty-mini">Catalogue search failed (network).</div>';
      });
  }

  function resolveLine(id, ref, sku, btn) {
    if (!id || !sku) return;
    var card = btn.closest ? btn.closest(".qc-line") : null;
    if (card) card.classList.add("is-resolving");
    if (btn) { btn.classList.add("is-busy"); btn.disabled = true; }
    api("qw/resolve-line", { quote_id: id, line_ref: ref, chosen_sku: sku }).then(function (r) {
      var q = findQuote(id);
      if (q) {
        if (r.output) q.output = r.output;
        if (r.total != null) q.total = r.total;
        if (r.draft_id) q.gmail_draft_id = r.draft_id;
      }
      render();
      if (openId === String(id)) renderDrawer();
      toast("Line resolved — quote updated.");
    }).catch(function (err) {
      if (card) card.classList.remove("is-resolving");
      if (btn) { btn.classList.remove("is-busy"); btn.disabled = false; }
      handleApiError(err);
    });
  }

  function doSend(id, btn) {
    var q = findQuote(id);
    if (!q) return;
    confirmDialog("Send this quote?",
      "This emails <strong>" + esc(q.customer || "the customer") + "</strong> the drafted quotation from the firm mailbox.",
      "Send now").then(function (ok) {
      if (!ok) return;
      btn.disabled = true; btn.classList.add("is-busy");
      api("qw/send-quote", { quote_id: id }).then(function (r) {
        patchLocal(id, { status: (r && r.status) || "sent", sent_at: new Date().toISOString(), sent_by: currentEmail || "console" });
        render();
        if (openId === String(id)) renderDrawer();
        toast("Quote sent to " + (q.customer || "customer") + ".");
      }).catch(function (err) {
        btn.disabled = false; btn.classList.remove("is-busy");
        handleApiError(err);
      });
    });
  }
  function doReply(id, btn) {
    var box = el("draftBox");
    var body = box ? box.value.trim() : "";
    if (!body) { toast("Write a reply first.", true); if (box) box.focus(); return; }
    var q = findQuote(id);
    confirmDialog("Send edited reply?",
      "This sends your edited message to <strong>" + esc((q && q.customer) || "the customer") + "</strong> on the existing thread.",
      "Send reply").then(function (ok) {
      if (!ok) return;
      btn.disabled = true; btn.classList.add("is-busy");
      api("qw/reply", { quote_id: id, body: body }).then(function () {
        patchLocal(id, { status: "sent", sent_at: new Date().toISOString(), sent_by: currentEmail || "console" });
        render();
        if (openId === String(id)) renderDrawer();
        toast("Reply sent.");
      }).catch(function (err) {
        btn.disabled = false; btn.classList.remove("is-busy");
        handleApiError(err);
      });
    });
  }
  function doClarify(id, ref, btn) {
    btn.disabled = true; btn.classList.add("is-busy");
    api("qw/clarify", { quote_id: id, line_ref: ref }).then(function () {
      btn.disabled = false; btn.classList.remove("is-busy");
      toast("Clarification email sent to the customer.");
    }).catch(function (err) {
      btn.disabled = false; btn.classList.remove("is-busy");
      handleApiError(err);
    });
  }
  function doRelabel(id, action, btn) {
    var inp = el("labelInput");
    var label = inp ? inp.value.trim() : "";
    if (!label) { toast("Type a label name first.", true); if (inp) inp.focus(); return; }
    btn.disabled = true; btn.classList.add("is-busy");
    api("qw/relabel", { quote_id: id, label: label, action: action }).then(function () {
      btn.disabled = false; btn.classList.remove("is-busy");
      toast((action === "remove" ? "Removed" : "Applied") + " label “" + label + "”.");
    }).catch(function (err) {
      btn.disabled = false; btn.classList.remove("is-busy");
      handleApiError(err);
    });
  }

  // ── bulk actions ─────────────────────────────────────────────────────────────
  function bulkSend() {
    var drafts = selectedQuotes().filter(isDraft);
    if (!drafts.length) { toast("No drafts selected.", true); return; }
    confirmDialog("Send " + drafts.length + " quote" + (drafts.length > 1 ? "s" : "") + "?",
      "This emails " + drafts.length + " customer" + (drafts.length > 1 ? "s" : "") + " their drafted quotation. This can't be undone.",
      "Send all", true).then(function (ok) {
      if (!ok) return;
      var btn = el("bulkSend");
      if (btn) { btn.disabled = true; btn.textContent = "Sending…"; }
      var done = 0, failed = 0;
      var next = function (i) {
        if (i >= drafts.length) {
          render(); renderBulk();
          toast("Sent " + done + (failed ? " · " + failed + " failed" : "") + ".", failed > 0);
          return;
        }
        var qid = String(drafts[i].id);
        api("qw/send-quote", { quote_id: qid }).then(function (r) {
          done++; patchLocal(qid, { status: (r && r.status) || "sent", sent_at: new Date().toISOString(), sent_by: currentEmail || "console" });
          delete selected[qid];
          next(i + 1);
        }).catch(function () { failed++; next(i + 1); });
      };
      next(0);
    });
  }
  function bulkLabel() {
    var inp = el("bulkLabelInput");
    var label = inp ? inp.value.trim() : "";
    if (!label) { toast("Type a label name.", true); if (inp) inp.focus(); return; }
    var list = selectedQuotes();
    confirmDialog("Label " + list.length + " quote" + (list.length > 1 ? "s" : "") + "?",
      "Applies the Gmail label “<strong>" + esc(label) + "</strong>” to " + list.length + " thread" + (list.length > 1 ? "s" : "") + ".",
      "Apply label").then(function (ok) {
      if (!ok) return;
      var btn = el("bulkLabel");
      if (btn) { btn.disabled = true; btn.textContent = "Applying…"; }
      var done = 0, failed = 0;
      var next = function (i) {
        if (i >= list.length) { renderBulk(); toast("Labelled " + done + (failed ? " · " + failed + " failed" : "") + ".", failed > 0); return; }
        api("qw/relabel", { quote_id: String(list[i].id), label: label, action: "add" })
          .then(function () { done++; next(i + 1); })
          .catch(function () { failed++; next(i + 1); });
      };
      next(0);
    });
  }

  // ── toast ────────────────────────────────────────────────────────────────────
  var toastTimer = null;
  function toast(msg, bad) {
    var t = el("toast");
    if (!t) return;
    t.textContent = msg;
    t.className = "qc-toast show" + (bad ? " bad" : "");
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.className = "qc-toast" + (bad ? " bad" : ""); }, 3000);
  }

  // ── load ─────────────────────────────────────────────────────────────────────
  function loadQuotes() {
    if (loading) return;
    hideTableError();
    if (!hasLoaded) renderSkeleton(); else el("rowCount").textContent = "Loading…";
    setRefreshing(true);
    var query = sb.from("quotes").select("*").order("created_at", { ascending: false }).limit(1000);
    if (resolvedOwner) query = query.eq("owner", resolvedOwner);
    query.then(function (res) {
      setRefreshing(false);
      if (res.error) { showTableError(res.error.message); return; }
      quotes = res.data || [];
      hasLoaded = true;
      // prune selections / open drawer that no longer exist
      Object.keys(selected).forEach(function (id) { if (!findQuote(id)) delete selected[id]; });
      loadDigest().then(function () { render(); if (openId != null) renderDrawer(); });
    }, function (err) {
      setRefreshing(false);
      showTableError((err && err.message) || "Network error — check your connection and try again.");
    });
  }
  // digest table is optional — degrade to client-side metrics if it's absent.
  function loadDigest() {
    var q = sb.from("digest").select("*").order("generated_at", { ascending: false }).limit(1);
    if (resolvedOwner) q = q.eq("owner", resolvedOwner);
    return q.then(function (res) {
      digest = (!res.error && res.data && res.data.length) ? res.data[0] : null;
    }, function () { digest = null; });
  }
})();
