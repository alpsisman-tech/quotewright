/* Quote console — auth + quote analytics + margin governance + explainability.
   No inline scripts (site CSP is script-src 'self'). Reads the `quotes` table.
   - Win/loss outcome tracking needs quote-analytics.sql applied.
   - Margin / approval / confidence columns need quotewright-expansion.sql applied;
     every one of those features DEGRADES GRACEFULLY when the columns don't exist yet
     (the column is simply absent on the row object → shown as "—" / hidden). */
(function () {
  "use strict";

  var el = function (id) { return document.getElementById(id); };
  var cfg = window.QW_CONFIG || {};
  var boot = el("bootError");
  var sb = null;
  var quotes = [];
  var hasLoaded = false;   // first successful load complete?
  var loading = false;
  var expanded = {};       // id -> true when the explainability detail row is open
  var approvalOnly = false;

  // Margin bands (percentage points). Below LOW = red/thin, below MID = amber, else green.
  var MARGIN_LOW = 15, MARGIN_MID = 30;
  // Confidence bands (0–100). At/above HIGH = green, at/above MID = amber, else red.
  var CONF_HIGH = 85, CONF_MID = 60;

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
  var currentEmail = "";

  el("logoutBtn").addEventListener("click", function () { sb.auth.signOut().then(showLogin); });
  el("refreshBtn").addEventListener("click", loadQuotes);
  el("search").addEventListener("input", renderTable);
  el("statusFilter").addEventListener("change", renderTable);
  el("outcomeFilter").addEventListener("change", renderTable);
  el("approvalFilter").addEventListener("click", function () {
    approvalOnly = !approvalOnly;
    this.setAttribute("aria-pressed", approvalOnly ? "true" : "false");
    this.classList.toggle("on", approvalOnly);
    renderTable();
  });

  // Event delegation (CSP-safe: no inline handlers). One listener covers:
  //  - Won / Lost / Reset outcome buttons  (data-act)
  //  - Approve button                      (data-approve)
  //  - expand caret / row click            (toggles the explainability detail)
  el("quotesBody").addEventListener("click", function (e) {
    var t = e.target;
    var actBtn = t.closest ? t.closest("button[data-act]") : null;
    if (actBtn) { setOutcome(actBtn.getAttribute("data-id"), actBtn.getAttribute("data-act"), actBtn); return; }
    var appBtn = t.closest ? t.closest("button[data-approve]") : null;
    if (appBtn) { approve(appBtn.getAttribute("data-approve"), appBtn); return; }
    var row = t.closest ? t.closest("tr[data-row]") : null;
    if (row) toggleExpand(row.getAttribute("data-row"));
  });

  sb.auth.getSession().then(function (res) {
    var s = res.data && res.data.session;
    if (s && s.user) { currentEmail = s.user.email || ""; showDash(currentEmail); loadQuotes(); }
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
        currentEmail = (res.data.user && res.data.user.email) || "";
        showDash(currentEmail); loadQuotes();
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

  // The agent's structured object lives in the `output` column. Parse defensively —
  // it may be an object OR a JSON string, and the lines[] may be nested.
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
  function overallConf(q) {
    var c = numOrNull(q.match_confidence);
    if (c != null) return c;
    var o = parseOutput(q);
    return o ? numOrNull(o.match_confidence) : null;
  }
  // Normalize one raw line into the fields the detail table shows.
  function normLine(l) {
    var status = (l.status || "").toLowerCase();
    var reason = l.match_reason || l.why || l.reason || l.match_note || l.note || "";
    if (!reason) {
      reason = status === "priced" ? "Matched to a catalogue SKU."
        : status === "pending_info" ? "Awaiting a detail from the customer."
        : status === "pending_hassan" ? "Product exists; price pending from Hassan."
        : "";
    }
    var conf = numOrNull(l.confidence);
    if (conf == null) conf = numOrNull(l.match_confidence);
    return {
      ref: l.ref != null ? String(l.ref) : "",
      product: l.product || l.name || l.description || "—",
      spec: l.spec || "",
      sku: l.sku || l.matched_sku || "",
      status: status,
      reason: reason,
      conf: conf
    };
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
    var awaiting = quotes.filter(needsApproval).length;

    var tiles = [
      { n: quotes.length, l: "Quotes logged" },
      { n: pending, l: "Pending decision", sub2: drafts + " still in draft" },
      { n: awaiting, l: "Awaiting approval", warn: awaiting > 0, sub2: awaiting > 0 ? "margin / discount flagged" : "none flagged" },
      { n: winRate == null ? "—" : winRate + "%", l: "Win rate", accent: true, sub2: won.length + " won · " + lost.length + " lost" },
      { n: curJoin(sumByCur(quotes), true), l: "Quoted value", small: true },
      { n: curJoin(sumByCur(won), true), l: "Won value", small: true, accent: true },
    ];
    el("tiles").innerHTML = tiles.map(function (t) {
      return '<div class="qc-tile' + (t.accent ? " accent" : "") + (t.warn ? " warn" : "") + '">' +
        '<div class="n' + (t.small ? " small" : "") + '">' + esc(t.n) + "</div>" +
        '<div class="l">' + esc(t.l) + "</div>" +
        (t.sub2 ? '<div class="sub2">' + esc(t.sub2) + "</div>" : "") +
      "</div>";
    }).join("");

    // approval filter chip count
    var chip = el("approvalChipN");
    if (chip) { chip.hidden = awaiting === 0; chip.textContent = awaiting; }
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

    var VBW = 1000, VBH = 250, padT = 30, padB = 42, padX = 16;
    var innerH = VBH - padT - padB;
    var n = data.length;
    var slot = (VBW - padX * 2) / n;
    var barW = Math.max(12, Math.min(88, slot * 0.5));
    var parts = [];
    data.forEach(function (x, i) {
      var cx = padX + slot * i + slot / 2;
      var bx = cx - barW / 2;
      var totH = x.total > 0 ? Math.max(4, Math.round(x.total / maxN * innerH)) : 0;
      var wonH = Math.round(x.won / maxN * innerH);
      var restH = totH - wonH;
      var yTop = padT + (innerH - totH);
      if (restH > 0) parts.push('<rect class="bar-rest" x="' + bx.toFixed(1) + '" y="' + yTop + '" width="' + barW.toFixed(1) + '" height="' + restH + '" rx="6"/>');
      if (wonH > 0) parts.push('<rect class="bar-won" x="' + bx.toFixed(1) + '" y="' + (padT + innerH - wonH) + '" width="' + barW.toFixed(1) + '" height="' + wonH + '" rx="6"/>');
      parts.push('<text class="axis-lbl cnt" x="' + cx.toFixed(1) + '" y="' + (yTop - 9) + '" text-anchor="middle" font-size="20" fill="#131313" font-weight="600">' + x.total + '</text>');
      var lbl = x.d.toLocaleDateString("en-GB", { month: "short" });
      parts.push('<text class="axis-lbl" x="' + cx.toFixed(1) + '" y="' + (VBH - 12) + '" text-anchor="middle" font-size="16">' + lbl + '</text>');
    });
    host.innerHTML = '<svg viewBox="0 0 ' + VBW + ' ' + VBH + '" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Quotes per month">' + parts.join("") + '</svg>';
  }

  // ── loading / empty / error states ──────────────────────────────────────────
  var COLSPAN = 9;
  function renderSkeleton() {
    el("tiles").innerHTML = "<div class=\"sk sk-tile\"></div>".repeat(6);
    el("chart").innerHTML = '<div class="sk sk-chart"></div>';
    var widths = [16, 70, 130, 84, 48, 46, 50, 70, 96];
    var cells = widths.map(function (w, i) {
      var cls = (i === 3 || i === 4) ? ' class="num"' : "";
      var ml = (i === 3 || i === 4) ? "margin-left:auto;" : "";
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
  function caret(id, open) {
    return '<button class="qc-caret' + (open ? " open" : "") + '" data-expand="' + esc(id) +
      '" aria-label="' + (open ? "Collapse detail" : "Expand detail") + '" aria-expanded="' + (open ? "true" : "false") + '">' +
      '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg></button>';
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
  function detailRow(q, id) {
    var lines = linesOf(q);
    var body;
    if (!lines.length) {
      body = '<p class="qc-detail-empty">No line-by-line detail was logged with this quote. ' +
        'Once the pipeline writes per-line match reasons into its output, they appear here.</p>';
    } else {
      var rows = lines.map(function (raw) {
        var l = normLine(raw);
        var st = l.status === "priced" ? '<span class="pill sent">Priced</span>'
          : l.status === "pending_info" ? '<span class="pill pending">Needs info</span>'
          : l.status === "pending_hassan" ? '<span class="pill info">Pending price</span>'
          : "—";
        return "<tr>" +
          '<td class="ln">' + esc(l.ref || "—") + "</td>" +
          "<td>" + esc(l.product) + (l.spec ? '<span class="ln-spec">' + esc(l.spec) + "</span>" : "") + "</td>" +
          '<td class="ln-sku">' + (l.sku ? esc(l.sku) : '<span class="qc-mut">unmatched</span>') + "</td>" +
          "<td>" + esc(l.reason) + "</td>" +
          '<td class="num">' + confCell(l.conf) + "</td>" +
          "<td>" + st + "</td>" +
        "</tr>";
      }).join("");
      body = '<div class="qc-lines-wrap"><table class="qc-lines">' +
        '<thead><tr><th>Line</th><th>Product</th><th>Matched SKU</th><th>Why this match</th><th class="num">Conf.</th><th>Status</th></tr></thead>' +
        "<tbody>" + rows + "</tbody></table></div>";
    }
    var meta = [];
    if (numOrNull(q.margin_pct) != null) meta.push("Overall margin " + q.margin_pct + "% (" + money(q.margin_amount, q.currency) + ")");
    if (overallConf(q) != null) meta.push("Match confidence " + Math.round(overallConf(q)) + "/100");
    if (q.approval_reason && needsApproval(q)) meta.push("Flagged: " + q.approval_reason);
    var head = '<div class="qc-detail-head"><span class="qc-detail-title">Line-by-line match</span>' +
      (meta.length ? '<span class="qc-detail-meta">' + esc(meta.join("  ·  ")) + "</span>" : "") + "</div>";
    return '<tr class="qc-detail" data-detail="' + esc(id) + '"><td colspan="' + COLSPAN + '">' + head + body + "</td></tr>";
  }

  function renderTable() {
    var q = (el("search").value || "").trim().toLowerCase();
    var sf = el("statusFilter").value;
    var of = el("outcomeFilter").value;
    var rows = quotes.filter(function (r) {
      if (q && (r.customer || "").toLowerCase().indexOf(q) === -1) return false;
      if (sf !== "all" && bucket(r) !== sf) return false;
      if (of !== "all" && outcomeOf(r) !== of) return false;
      if (approvalOnly && !needsApproval(r)) return false;
      return true;
    });
    el("rowCount").textContent = rows.length + " of " + quotes.length;
    var empty = el("emptyState");
    if (rows.length === 0) {
      empty.hidden = false;
      if (quotes.length === 0) {
        empty.innerHTML = emptyPanel(ICON_INBOX, "No quotes yet",
          "Quotes drafted by the RFQ pipeline land here automatically. Send a real request to the connected mailbox and the first draft will appear.");
      } else {
        empty.innerHTML = emptyPanel(ICON_FILTER, "No matches",
          "No quotes fit these filters. Clear the search, drop the approval filter, or switch the send state and outcome to widen it.");
      }
    } else {
      empty.hidden = true;
    }
    el("quotesBody").innerHTML = rows.map(function (r) {
      var b = bucket(r);
      var oc = outcomeOf(r);
      var id = r.id != null ? String(r.id) : "";
      var open = !!expanded[id];
      var flagged = needsApproval(r);
      var acts = '<span class="qc-acts">' +
        '<button class="qc-act win ' + (oc === "won" ? "on" : "") + '" data-id="' + esc(id) + '" data-act="won">Won</button>' +
        '<button class="qc-act lose ' + (oc === "lost" ? "on" : "") + '" data-id="' + esc(id) + '" data-act="lost">Lost</button>' +
        (oc !== "pending" ? '<button class="qc-act" data-id="' + esc(id) + '" data-act="pending">Reset</button>' : "") +
        "</span>";
      var main = '<tr data-row="' + esc(id) + '" class="qc-row' + (open ? " open" : "") + (flagged ? " needs-approval" : "") + '">' +
        '<td class="qc-col-x">' + caret(id, open) + "</td>" +
        "<td>" + esc(fmtDate(r.created_at)) + "</td>" +
        '<td class="qc-cust">' + esc(r.customer || "—") + "</td>" +
        '<td class="num">' + esc(money(r.total, r.currency)) + "</td>" +
        '<td class="num">' + marginCell(r) + "</td>" +
        "<td>" + confCell(overallConf(r)) + "</td>" +
        "<td><span class='pill " + b + "'>" + (b === "draft" ? "Draft" : "Sent") + "</span></td>" +
        "<td>" + approvalCell(r, id) + "</td>" +
        "<td><span class='pill " + oc + "'>" + oc.charAt(0).toUpperCase() + oc.slice(1) + "</span>" + acts + "</td>" +
      "</tr>";
      return main + (open ? detailRow(r, id) : "");
    }).join("");
  }

  function toggleExpand(id) {
    if (!id) return;
    if (expanded[id]) delete expanded[id]; else expanded[id] = true;
    renderTable();
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

  // ── approve (margin governance) — optimistic UI, graceful degradation ───────
  function approve(id, btn) {
    if (!id) return;
    // find the record & snapshot for rollback
    var rec = null;
    for (var i = 0; i < quotes.length; i++) if (String(quotes[i].id) === String(id)) { rec = quotes[i]; break; }
    if (!rec) return;
    var snapshot = { needs_approval: rec.needs_approval, approved_by: rec.approved_by, approved_at: rec.approved_at };
    var now = new Date().toISOString();
    var by = currentEmail || "console";

    // optimistic: clear the flag & mark approved immediately
    rec.needs_approval = false; rec.approved_by = by; rec.approved_at = now;
    render();

    var patch = { needs_approval: false, approved_by: by, approved_at: now };
    sb.from("quotes").update(patch).eq("id", id).then(function (res) {
      if (res.error) {
        // rollback
        rec.needs_approval = snapshot.needs_approval; rec.approved_by = snapshot.approved_by; rec.approved_at = snapshot.approved_at;
        render();
        var m = res.error.message || "";
        if (/column|needs_approval|approved_by/i.test(m)) toast("Run quotewright-expansion.sql in Supabase first.", true);
        else toast("Couldn't approve: " + m, true);
        return;
      }
      toast("Approved.");
    }).catch(function () {
      rec.needs_approval = snapshot.needs_approval; rec.approved_by = snapshot.approved_by; rec.approved_at = snapshot.approved_at;
      render();
      toast("Network error — not approved.", true);
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
    if (loading) return;
    hideTableError();
    if (!hasLoaded) renderSkeleton(); else el("rowCount").textContent = "Loading…";
    setRefreshing(true);
    var query = sb.from("quotes").select("*").order("created_at", { ascending: false }).limit(1000);
    if (cfg.OWNER) query = query.eq("owner", cfg.OWNER);
    query.then(function (res) {
      setRefreshing(false);
      if (res.error) { showTableError(res.error.message); return; }
      quotes = res.data || [];
      hasLoaded = true;
      render();
    }, function (err) {
      setRefreshing(false);
      showTableError((err && err.message) || "Network error — check your connection and try again.");
    });
  }
})();
