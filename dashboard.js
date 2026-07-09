/* Quote console — auth + quote rendering. No inline scripts (site CSP is script-src 'self'). */
(function () {
  "use strict";

  var el = function (id) { return document.getElementById(id); };
  var cfg = window.QW_CONFIG || {};
  var boot = el("bootError");
  var sb = null;
  var quotes = [];

  // ── SECURITY: attach the submit interceptor FIRST and unconditionally, so the
  //    login form can NEVER fall back to a native GET submit (which would put the
  //    email + password into the URL). This runs even if the app isn't configured.
  var loginForm = el("loginForm");
  if (loginForm) loginForm.addEventListener("submit", onLoginSubmit);

  var configured = cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY &&
                   cfg.SUPABASE_ANON_KEY.indexOf("PASTE_") !== 0;
  if (!configured) {
    if (boot) {
      boot.hidden = false;
      boot.textContent = "Not configured: set SUPABASE_ANON_KEY in dashboard-config.js (Supabase → Project Settings → API → anon public).";
    }
    return; // form is already safe; nothing else to wire until configured
  }

  sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);

  // events (only wired when configured)
  el("logoutBtn").addEventListener("click", function () { sb.auth.signOut().then(showLogin); });
  el("refreshBtn").addEventListener("click", loadQuotes);
  el("search").addEventListener("input", renderTable);
  el("statusFilter").addEventListener("change", renderTable);

  // boot: restore session if present
  sb.auth.getSession().then(function (res) {
    var s = res.data && res.data.session;
    if (s && s.user) { showDash(s.user.email); loadQuotes(); }
    else showLogin();
  });

  // ── functions (declarations => hoisted, safe to reference above) ─────────────
  function onLoginSubmit(e) {
    e.preventDefault(); // <- the critical line: no native navigation, ever
    var err = el("loginError");
    if (err) err.textContent = "";
    if (!sb) { if (err) err.textContent = "Dashboard isn't configured yet (missing Supabase key)."; return; }
    var btn = el("loginBtn");
    btn.disabled = true; btn.textContent = "Signing in…";
    sb.auth.signInWithPassword({ email: el("email").value.trim(), password: el("password").value })
      .then(function (res) {
        btn.disabled = false; btn.textContent = "Sign in";
        if (res.error) { if (err) err.textContent = res.error.message; return; }
        showDash(res.data.user && res.data.user.email); loadQuotes();
      })
      .catch(function () { btn.disabled = false; btn.textContent = "Sign in"; if (err) err.textContent = "Network error."; });
  }

  function showLogin() {
    el("loginView").hidden = false; el("dashView").hidden = true;
    el("logoutBtn").hidden = true; el("whoami").textContent = "";
  }
  function showDash(email) {
    el("loginView").hidden = true; el("dashView").hidden = false;
    el("logoutBtn").hidden = false; el("whoami").textContent = email || "";
  }

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
  function bucket(q) { return (q.status || "").toLowerCase() === "draft" ? "draft" : "sent"; }
  function esc(s) {
    return (s == null ? "" : String(s)).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  function renderTiles() {
    var drafts = quotes.filter(function (q) { return bucket(q) === "draft"; }).length;
    var sent = quotes.length - drafts;
    var byCur = {};
    quotes.forEach(function (q) {
      if (q.total == null || isNaN(q.total)) return;
      var c = q.currency || "";
      byCur[c] = (byCur[c] || 0) + Number(q.total);
    });
    var value = Object.keys(byCur).map(function (c) { return money(byCur[c], c); }).join("  ·  ") || "—";
    var tiles = [
      { n: quotes.length, l: "Quotes" },
      { n: drafts, l: "Draft · pending send" },
      { n: sent, l: "Sent" },
      { n: value, l: "Total value" },
    ];
    el("tiles").innerHTML = tiles.map(function (t) {
      return '<div class="qc-tile"><div class="n">' + esc(t.n) + '</div><div class="l">' + esc(t.l) + "</div></div>";
    }).join("");
  }

  function renderTable() {
    var q = (el("search").value || "").trim().toLowerCase();
    var sf = el("statusFilter").value;
    var rows = quotes.filter(function (r) {
      if (q && (r.customer || "").toLowerCase().indexOf(q) === -1) return false;
      if (sf !== "all" && bucket(r) !== sf) return false;
      return true;
    });
    el("rowCount").textContent = rows.length + " of " + quotes.length;
    el("emptyState").hidden = rows.length !== 0;
    el("quotesBody").innerHTML = rows.map(function (r) {
      var b = bucket(r);
      var needs = Number(r.unmatched_lines) > 0 ? '<span class="pill info">' + esc(r.unmatched_lines) + "</span>" : "—";
      var idShort = r.id != null ? String(r.id).slice(0, 8) : "—";
      return "<tr>" +
        "<td>" + esc(fmtDate(r.created_at)) + "</td>" +
        "<td>" + esc(r.customer || "—") + "</td>" +
        '<td class="num">' + esc(money(r.total, r.currency)) + "</td>" +
        "<td><span class='pill " + b + "'>" + (b === "draft" ? "Draft" : "Sent") + "</span></td>" +
        '<td class="num">' + needs + "</td>" +
        '<td class="qc-id">' + esc(idShort) + "</td>" +
      "</tr>";
    }).join("");
  }

  function render() { renderTiles(); renderTable(); }

  function loadQuotes() {
    el("rowCount").textContent = "Loading…";
    var query = sb.from("quotes").select("*").order("created_at", { ascending: false }).limit(1000);
    if (cfg.OWNER) query = query.eq("owner", cfg.OWNER);
    query.then(function (res) {
      if (res.error) { el("rowCount").textContent = "Error: " + res.error.message; return; }
      quotes = res.data || [];
      render();
    });
  }
})();
