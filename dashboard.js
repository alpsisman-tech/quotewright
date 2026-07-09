/* Quote console — auth + quote rendering. No inline scripts (site CSP is script-src 'self'). */
(function () {
  "use strict";

  var cfg = window.QW_CONFIG || {};
  var boot = document.getElementById("bootError");
  if (!cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY || cfg.SUPABASE_ANON_KEY.indexOf("PASTE_") === 0) {
    boot.hidden = false;
    boot.textContent = "Not configured: set SUPABASE_ANON_KEY in dashboard-config.js (Supabase → Project Settings → API → anon public).";
    return;
  }

  var sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);

  var el = function (id) { return document.getElementById(id); };
  var loginView = el("loginView"), dashView = el("dashView");
  var logoutBtn = el("logoutBtn"), whoami = el("whoami");
  var quotes = [];

  function showLogin() {
    loginView.hidden = false; dashView.hidden = true;
    logoutBtn.hidden = true; whoami.textContent = "";
  }
  function showDash(email) {
    loginView.hidden = true; dashView.hidden = false;
    logoutBtn.hidden = false; whoami.textContent = email || "";
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
  function esc(s) { return (s == null ? "" : String(s)).replace(/[&<>"]/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }

  function renderTiles() {
    var drafts = quotes.filter(function (q) { return bucket(q) === "draft"; }).length;
    var sent = quotes.length - drafts;
    var needsInfo = quotes.filter(function (q) { return Number(q.unmatched_lines) > 0; }).length;
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
      var needs = Number(r.unmatched_lines) > 0
        ? '<span class="pill info">' + esc(r.unmatched_lines) + "</span>" : "—";
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

  // events
  el("loginForm").addEventListener("submit", function (e) {
    e.preventDefault();
    var btn = el("loginBtn"), err = el("loginError");
    err.textContent = ""; btn.disabled = true; btn.textContent = "Signing in…";
    sb.auth.signInWithPassword({ email: el("email").value.trim(), password: el("password").value })
      .then(function (res) {
        btn.disabled = false; btn.textContent = "Sign in";
        if (res.error) { err.textContent = res.error.message; return; }
        showDash(res.data.user && res.data.user.email); loadQuotes();
      });
  });
  logoutBtn.addEventListener("click", function () { sb.auth.signOut().then(showLogin); });
  el("refreshBtn").addEventListener("click", loadQuotes);
  el("search").addEventListener("input", renderTable);
  el("statusFilter").addEventListener("change", renderTable);

  // boot: restore session if present
  sb.auth.getSession().then(function (res) {
    var s = res.data && res.data.session;
    if (s && s.user) { showDash(s.user.email); loadQuotes(); }
    else showLogin();
  });
})();
