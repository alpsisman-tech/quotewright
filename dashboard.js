/* Quote console — auth + quote analytics. No inline scripts (site CSP is script-src 'self').
   Reads the `quotes` table; win/loss outcome tracking needs quote-analytics.sql applied. */
(function () {
  "use strict";

  var el = function (id) { return document.getElementById(id); };
  var cfg = window.QW_CONFIG || {};
  var boot = el("bootError");
  var sb = null;
  var quotes = [];

  // SECURITY: attach the submit interceptor FIRST and unconditionally, so the
  // login form can NEVER fall back to a native GET submit (email+password in URL).
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

  el("logoutBtn").addEventListener("click", function () { sb.auth.signOut().then(showLogin); });
  el("refreshBtn").addEventListener("click", loadQuotes);
  el("search").addEventListener("input", renderTable);
  el("statusFilter").addEventListener("change", renderTable);
  el("outcomeFilter").addEventListener("change", renderTable);
  // event delegation for the Won/Lost/Reset buttons (CSP-safe: no inline handlers)
  el("quotesBody").addEventListener("click", function (e) {
    var b = e.target.closest ? e.target.closest("button[data-act]") : null;
    if (!b) return;
    setOutcome(b.getAttribute("data-id"), b.getAttribute("data-act"), b);
  });

  sb.auth.getSession().then(function (res) {
    var s = res.data && res.data.session;
    if (s && s.user) { showDash(s.user.email); loadQuotes(); }
    else showLogin();
  });

  // ── auth ──────────────────────────────────────────────────────────────────
  function onLoginSubmit(e) {
    e.preventDefault();
    var err = el("loginError");
    if (err) err.textContent = "";
    if (!sb) { if (err) err.textContent = "Dashboard isn't configured yet (missing Supabase key)."; return; }
    var btn = el("loginBtn");
    btn.disabled = true; btn.textContent = "Signing in...";
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

  // ── helpers ───────────────────────────────────────────────────────────────
  function money(n, cur) {
    if (n == null || isNaN(n)) return "—";
    var sym = { EUR: "€", USD: "$", GBP: "£", TRY: "₺" }[cur] || (cur ? cur + " " : "");
    return sym + Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function moneyShort(n, cur) {
    if (n == null || isNaN(n)) return "—";
    var sym = { EUR: "€", USD: "$", GBP: "£", TRY: "₺" }[cur] || (cur ? cur + " " : "");
    return sym + Number(n).toLocaleString("en-US", { maximumFractionDigits: 0 });
  }
  function fmtDate(s) {
    if (!s) return "—";
    var d = new Date(s);
    return isNaN(d) ? "—" : d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  }
  function bucket(q) { return (q.status || "").toLowerCase() === "draft" ? "draft" : "sent"; }
  function outcomeOf(q) {
    var o = (q.outcome || "pending").toLowerCase();
    return (o === "won" || o === "lost") ? o : "pending";
  }
  function esc(s) {
    return (s == null ? "" : String(s)).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
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

  // ── tiles ─────────────────────────────────────────────────────────────────
  function renderTiles() {
    var drafts = quotes.filter(function (q) { return bucket(q) === "draft"; }).length;
    var won = quotes.filter(function (q) { return outcomeOf(q) === "won"; });
    var lost = quotes.filter(function (q) { return outcomeOf(q) === "lost"; });
    var decided = won.length + lost.length;
    var winRate = decided > 0 ? Math.round(won.length / decided * 100) : null;
    var pending = quotes.length - won.length - lost.length;

    var tiles = [
      { n: quotes.length, l: "Quotes logged" },
      { n: pending, l: "Pending decision", sub2: drafts + " still in draft" },
      { n: winRate == null ? "—" : winRate + "%", l: "Win rate", accent: true, sub2: won.length + " won · " + lost.length + " lost" },
      { n: curJoin(sumByCur(quotes), true), l: "Quoted value", small: true },
      { n: curJoin(sumByCur(won), true), l: "Won value", small: true, accent: true },
    ];
    el("tiles").innerHTML = tiles.map(function (t) {
      return '<div class="qc-tile' + (t.accent ? " accent" : "") + '">' +
        '<div class="n' + (t.small ? " small" : "") + '">' + esc(t.n) + "</div>" +
        '<div class="l">' + esc(t.l) + "</div>" +
        (t.sub2 ? '<div class="sub2">' + esc(t.sub2) + "</div>" : "") +
      "</div>";
    }).join("");
  }

  // ── over-time chart (hand-rolled SVG, no external libs) ─────────────────────
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

    var barW = 30, gap = 14, padL = 8, padB = 22, padT = 8, h = 150;
    var innerH = h - padB - padT;
    var w = padL * 2 + data.length * barW + (data.length - 1) * gap;
    var parts = [];
    data.forEach(function (x, i) {
      var bx = padL + i * (barW + gap);
      var totH = Math.round(x.total / maxN * innerH);
      var wonH = Math.round(x.won / maxN * innerH);
      var restH = totH - wonH;
      var yTop = padT + (innerH - totH);
      // rest (non-won) on top, won at the base
      if (restH > 0) parts.push('<rect class="bar-rest" x="' + bx + '" y="' + yTop + '" width="' + barW + '" height="' + restH + '" rx="4"/>');
      if (wonH > 0) parts.push('<rect class="bar-won" x="' + bx + '" y="' + (padT + innerH - wonH) + '" width="' + barW + '" height="' + wonH + '" rx="4"/>');
      // count label above bar
      parts.push('<text class="axis-lbl" x="' + (bx + barW / 2) + '" y="' + (yTop - 4) + '" text-anchor="middle">' + x.total + '</text>');
      // month label
      var lbl = x.d.toLocaleDateString("en-GB", { month: "short" });
      parts.push('<text class="axis-lbl" x="' + (bx + barW / 2) + '" y="' + (h - 6) + '" text-anchor="middle">' + lbl + '</text>');
    });
    host.innerHTML = '<svg viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Quotes per month">' + parts.join("") + '</svg>';
  }

  // ── table ─────────────────────────────────────────────────────────────────
  function renderTable() {
    var q = (el("search").value || "").trim().toLowerCase();
    var sf = el("statusFilter").value;
    var of = el("outcomeFilter").value;
    var rows = quotes.filter(function (r) {
      if (q && (r.customer || "").toLowerCase().indexOf(q) === -1) return false;
      if (sf !== "all" && bucket(r) !== sf) return false;
      if (of !== "all" && outcomeOf(r) !== of) return false;
      return true;
    });
    el("rowCount").textContent = rows.length + " of " + quotes.length;
    el("emptyState").hidden = rows.length !== 0;
    el("quotesBody").innerHTML = rows.map(function (r) {
      var b = bucket(r);
      var oc = outcomeOf(r);
      var needs = Number(r.unmatched_lines) > 0 ? '<span class="pill info">' + esc(r.unmatched_lines) + "</span>" : "—";
      var id = r.id != null ? String(r.id) : "";
      var acts = '<span class="qc-acts">' +
        '<button class="qc-act win ' + (oc === "won" ? "on" : "") + '" data-id="' + esc(id) + '" data-act="won">Won</button>' +
        '<button class="qc-act lose ' + (oc === "lost" ? "on" : "") + '" data-id="' + esc(id) + '" data-act="lost">Lost</button>' +
        (oc !== "pending" ? '<button class="qc-act" data-id="' + esc(id) + '" data-act="pending">Reset</button>' : "") +
        "</span>";
      return "<tr>" +
        "<td>" + esc(fmtDate(r.created_at)) + "</td>" +
        "<td>" + esc(r.customer || "—") + "</td>" +
        '<td class="num">' + esc(money(r.total, r.currency)) + "</td>" +
        "<td><span class='pill " + b + "'>" + (b === "draft" ? "Draft" : "Sent") + "</span></td>" +
        '<td class="num">' + needs + "</td>" +
        "<td><span class='pill " + oc + "'>" + oc.charAt(0).toUpperCase() + oc.slice(1) + "</span></td>" +
        '<td>' + acts + "</td>" +
      "</tr>";
    }).join("");
  }

  function render() { renderTiles(); renderChart(); renderTable(); }

  // ── write outcome back to Supabase ──────────────────────────────────────────
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
      // update local copy + re-render
      for (var k = 0; k < quotes.length; k++) {
        if (String(quotes[k].id) === String(id)) { quotes[k].outcome = outcome; quotes[k].outcome_at = patch.outcome_at; break; }
      }
      render();
      toast("Marked " + outcome + ".");
    }).catch(function () {
      for (var n = 0; n < acts.length; n++) acts[n].disabled = false;
      toast("Network error.", true);
    });
  }

  var toastTimer = null;
  function toast(msg, bad) {
    var t = el("toast");
    if (!t) return;
    t.textContent = msg;
    t.className = "qc-toast show" + (bad ? " bad" : "");
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.className = "qc-toast" + (bad ? " bad" : ""); }, 2600);
  }

  // ── load ────────────────────────────────────────────────────────────────────
  function loadQuotes() {
    el("rowCount").textContent = "Loading...";
    var query = sb.from("quotes").select("*").order("created_at", { ascending: false }).limit(1000);
    if (cfg.OWNER) query = query.eq("owner", cfg.OWNER);
    query.then(function (res) {
      if (res.error) { el("rowCount").textContent = "Error: " + res.error.message; return; }
      quotes = res.data || [];
      render();
    });
  }
})();
