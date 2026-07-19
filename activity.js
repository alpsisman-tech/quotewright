/* Activity feed. Synthesises ONE reverse-chronological timeline from REAL timestamps
   across the tenant's data — no fabricated events:
     quotes        → drafted (created_at), needs-approval flagged (created_at, while
                     pending), approval cleared (approved_at), sent (sent_at),
                     follow-up sent (last_followup_at), won/lost (outcome_at)
     resolutions   → catalogue line resolved (created_at)
     catalog_gaps  → catalogue gap requested (last_requested)

   Reuses the shared auth/boot + helpers from console-views.js (window.QWConsole),
   the exact pattern customers.html / gaps.html use. RLS is the real protection;
   the OWNER filter mirrors the sibling views. Degrades gracefully: any missing table
   is treated as an empty source, so the feed never crashes when the intelligence /
   analytics SQL hasn't been run yet. */
(function () {
  "use strict";
  var Q = window.QWConsole;
  var el = Q.el, esc = Q.esc, money = Q.money, num = Q.numOrNull,
      relTime = Q.relTime, fmtDateTime = Q.fmtDateTime, toast = Q.toast;

  var sb = null;
  var events = [];
  var loaded = false, loading = false;
  var srcState = { quotes: "?", resolutions: "?", gaps: "?" }; // ok | empty | missing | error

  // ── icons (inline SVG, stroke=currentColor, matched to the console's line weight) ──
  var IC = {
    draft: '<path d="M14 3v4a1 1 0 0 0 1 1h4"/><path d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2z"/><path d="M9 13h6M9 17h4"/>',
    sent: '<path d="M22 2 11 13"/><path d="M22 2 15 22l-4-9-9-4 20-7z"/>',
    won: '<path d="M8 21h8M12 17v4"/><path d="M7 4h10v5a5 5 0 0 1-10 0V4z"/><path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3"/>',
    lost: '<circle cx="12" cy="12" r="9"/><path d="M15 9l-6 6M9 9l6 6"/>',
    approval_flag: '<path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9 2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/>',
    approved: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M9 12l2 2 4-4"/>',
    followup: '<path d="M9 17l-5-5 5-5"/><path d="M4 12h11a5 5 0 0 1 5 5v2"/>',
    resolution: '<circle cx="18" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><path d="M6 21V9a9 9 0 0 0 9 9"/>',
    gap: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3M11 8v3M11 14h.01"/>'
  };
  function svg(paths) {
    return '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
      'stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + paths + '</svg>';
  }

  var ICON_CLOCK = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>';
  var ICON_FILTER = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3 5h18l-7 8v5l-4 2v-7L3 5z"/></svg>';
  var ICON_WARN = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9 2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/></svg>';

  // type → { label, tone, group } ; group drives the type filter
  var META = {
    draft:         { label: "Quote drafted",           tone: "neutral", group: "draft" },
    approval_flag: { label: "Flagged for approval",    tone: "amber",   group: "approval" },
    approved:      { label: "Approval cleared",        tone: "green",   group: "approval" },
    sent:          { label: "Quote sent",              tone: "ink",     group: "sent" },
    followup:      { label: "Follow-up sent",          tone: "blue",    group: "followup" },
    won:           { label: "Marked won",              tone: "green",   group: "outcome" },
    lost:          { label: "Marked lost",             tone: "red",     group: "outcome" },
    resolution:    { label: "Catalogue line resolved", tone: "lime",    group: "resolution" },
    gap:           { label: "Catalogue gap requested", tone: "amber",   group: "gap" }
  };

  Q.boot({ onAuth: function (client) {
    sb = client;
    el("subnav").hidden = false;
    el("refreshBtn").addEventListener("click", load);
    el("search").addEventListener("input", render);
    el("typeSel").addEventListener("change", render);
    el("rangeSel").addEventListener("change", render);
    load();
  }});

  // ── data ────────────────────────────────────────────────────────────────────
  function fetchTable(name, cols, orderCol, stateKey) {
    var qy = sb.from(name).select(cols).limit(4000);
    if (Q.cfg.OWNER) qy = qy.eq("owner", Q.cfg.OWNER);
    if (orderCol) qy = qy.order(orderCol, { ascending: false });
    return qy.then(function (res) {
      if (res.error) {
        if (Q.isMissingTable(res.error)) { srcState[stateKey] = "missing"; return []; }
        srcState[stateKey] = "error";
        return { __err: res.error };
      }
      var rows = res.data || [];
      srcState[stateKey] = rows.length ? "ok" : "empty";
      return rows;
    }, function (err) { srcState[stateKey] = "error"; return { __err: err || { message: "Network error" } }; });
  }

  function load() {
    if (loading) return;
    loading = true;
    el("tableError").hidden = true;
    if (!loaded) skeleton(); else el("rowCount").textContent = "Loading…";
    var rb = el("refreshBtn"); if (rb) { rb.classList.add("is-loading"); rb.textContent = "Refreshing…"; }
    srcState = { quotes: "?", resolutions: "?", gaps: "?" };

    var pQuotes = fetchTable("quotes",
      "id,customer,total,currency,autonomy_tier,created_at,sent_at,sent_by,outcome,outcome_at,outcome_note,needs_approval,approval_reason,approved_at,approved_by,last_followup_at,followup_count",
      "created_at", "quotes");
    var pRes = fetchTable("resolutions",
      "id,request_signature,chosen_sku,chosen_by,quote_id,source,created_at", "created_at", "resolutions");
    var pGaps = fetchTable("catalog_gaps",
      "id,request_signature,description,count,last_requested,status", "last_requested", "gaps");

    Promise.all([pQuotes, pRes, pGaps]).then(function (r) {
      loading = false;
      if (rb) { rb.classList.remove("is-loading"); rb.textContent = "Refresh"; }

      // The quotes table is the primary source — a hard (non-missing) error there is fatal.
      if (r[0] && r[0].__err) {
        showTableError((r[0].__err.message) || "Something went wrong reaching the quote store.");
        return;
      }
      var quotes = Array.isArray(r[0]) ? r[0] : [];
      var resolutions = Array.isArray(r[1]) ? r[1] : [];
      var gaps = Array.isArray(r[2]) ? r[2] : [];

      events = buildEvents(quotes, resolutions, gaps);
      loaded = true;
      render();
    }, function (err) {
      loading = false;
      if (rb) { rb.classList.remove("is-loading"); rb.textContent = "Refresh"; }
      showTableError((err && err.message) || "Network error — check your connection and try again.");
    });
  }

  function buildEvents(quotes, resolutions, gaps) {
    var ev = [];
    (quotes || []).forEach(function (q) {
      var base = { customer: q.customer, total: q.total, currency: q.currency, tier: q.autonomy_tier, quoteId: q.id };
      if (q.created_at) ev.push(mk("draft", q.created_at, base));
      // "Needs approval" carries no dedicated flag timestamp; the pipeline flags at draft
      // time, so created_at IS the real flag time. Only surfaced while still pending.
      if (q.needs_approval && !q.approved_at && q.created_at)
        ev.push(mk("approval_flag", q.created_at, ext(base, { reason: q.approval_reason })));
      if (q.approved_at) ev.push(mk("approved", q.approved_at, ext(base, { by: q.approved_by })));
      if (q.sent_at) ev.push(mk("sent", q.sent_at, ext(base, { by: q.sent_by })));
      if (q.last_followup_at) ev.push(mk("followup", q.last_followup_at, ext(base, { count: q.followup_count })));
      if (q.outcome_at && (q.outcome === "won" || q.outcome === "lost"))
        ev.push(mk(q.outcome, q.outcome_at, ext(base, { note: q.outcome_note })));
    });
    (resolutions || []).forEach(function (rr) {
      if (rr.created_at) ev.push(mk("resolution", rr.created_at,
        { sku: rr.chosen_sku, sig: rr.request_signature, by: rr.chosen_by, source: rr.source, quoteId: rr.quote_id }));
    });
    (gaps || []).forEach(function (g) {
      if (g.last_requested) ev.push(mk("gap", g.last_requested,
        { desc: g.description, sig: g.request_signature, count: g.count, status: g.status }));
    });
    ev.sort(function (a, b) {
      var d = b.t - a.t;
      if (d) return d;
      return (RANK[b.type] || 0) - (RANK[a.type] || 0); // stable-ish within one timestamp
    });
    return ev;
  }
  // within an identical timestamp (e.g. draft + approval flag share created_at), show
  // the flag just above the draft so the story reads top-down.
  var RANK = { draft: 0, approval_flag: 1, approved: 2, sent: 3, followup: 4, won: 5, lost: 5, resolution: 3, gap: 1 };

  function mk(type, ts, d) { var t = new Date(ts).getTime(); return { type: type, ts: ts, t: isNaN(t) ? 0 : t, d: d }; }
  function ext(a, b) { var o = {}; for (var k in a) o[k] = a[k]; for (var j in b) o[j] = b[j]; return o; }

  // ── filtering ────────────────────────────────────────────────────────────────
  function haystack(e) {
    var d = e.d || {};
    return ((d.customer || "") + " " + (d.sku || "") + " " + (d.desc || "") + " " + (d.sig || "") + " " + (META[e.type] ? META[e.type].label : "")).toLowerCase();
  }
  function filtered() {
    var type = el("typeSel").value;
    var range = el("rangeSel").value;
    var qtext = (el("search").value || "").trim().toLowerCase();
    var cutoff = 0;
    if (range === "today") { var s = new Date(); s.setHours(0, 0, 0, 0); cutoff = s.getTime(); }
    else if (range === "7") cutoff = Date.now() - 7 * 864e5;
    else if (range === "30") cutoff = Date.now() - 30 * 864e5;
    return events.filter(function (e) {
      if (type !== "all" && (!META[e.type] || META[e.type].group !== type)) return false;
      if (cutoff && e.t < cutoff) return false;
      if (qtext && haystack(e).indexOf(qtext) === -1) return false;
      return true;
    });
  }

  // ── render ───────────────────────────────────────────────────────────────────
  function render() {
    if (!loaded) return;
    renderTiles();
    var list = filtered();
    el("rowCount").textContent = list.length + (list.length === 1 ? " event" : " events");

    var feed = el("feed"), empty = el("emptyState");
    el("tableError").hidden = true;

    if (list.length === 0) {
      feed.innerHTML = "";
      empty.hidden = false;
      var allMissing = srcState.quotes === "missing" && srcState.resolutions === "missing" && srcState.gaps === "missing";
      if (events.length === 0 && allMissing) {
        empty.innerHTML = panel(ICON_CLOCK, "Activity tracking isn't switched on yet",
          "The console tables don't exist yet. Run <code>quote-analytics.sql</code> and <code>quotewright-intelligence.sql</code> in the Supabase SQL editor, and this timeline fills as the pipeline drafts, sends and resolves quotes.");
      } else if (events.length === 0) {
        empty.innerHTML = panel(ICON_CLOCK, "No activity yet",
          "Nothing has happened here yet. The moment the RFQ pipeline drafts its first quote — or you send, resolve or mark one — it lands at the top of this feed.");
      } else {
        empty.innerHTML = panel(ICON_FILTER, "Nothing in this view",
          "No events match those filters. Try “All activity”, widen the date range, or clear the search.");
      }
      return;
    }
    empty.hidden = true;

    // group by calendar day
    var groups = [], cur = null, seen = {};
    list.forEach(function (e) {
      var key = dayKey(e.t);
      if (key !== cur) { cur = key; groups.push({ key: key, label: dayLabel(e.t), items: [] }); }
      groups[groups.length - 1].items.push(e);
    });

    var idx = 0;
    feed.innerHTML = groups.map(function (g) {
      var rows = g.items.map(function (e) {
        var s = "--i:" + Math.min(idx++, 14);
        return '<li class="qc-ev" style="' + s + '">' +
          '<span class="qc-ev-dot tone-' + META[e.type].tone + '">' + svg(IC[e.type]) + '</span>' +
          '<div class="qc-ev-body">' +
            '<div class="qc-ev-line">' +
              '<span class="qc-ev-title">' + esc(META[e.type].label) + '</span>' +
              '<time class="qc-ev-time" title="' + esc(fmtDateTime(e.ts)) + '">' + esc(relTime(e.ts)) + '</time>' +
            '</div>' +
            '<div class="qc-ev-meta">' + describe(e) + '</div>' +
          '</div>' +
        '</li>';
      }).join("");
      return '<div class="qc-tl-day">' +
        '<div class="qc-tl-dayhead"><h3>' + esc(g.label) + '</h3><span class="qc-tl-daycount">' + g.items.length + '</span></div>' +
        '<ol class="qc-tl-list">' + rows + '</ol>' +
      '</div>';
    }).join("");
  }

  // per-event context spans
  function describe(e) {
    var d = e.d || {}, out = [];
    function chip(txt, cls) { return '<span class="' + (cls || "") + '">' + esc(txt) + '</span>'; }
    function amount() { if (d.total != null && !isNaN(d.total)) out.push('<span class="qc-ev-amt">' + esc(money(d.total, d.currency)) + '</span>'); }

    switch (e.type) {
      case "draft":
        out.push('<b>' + esc(d.customer || "Unknown customer") + '</b>'); amount();
        if (d.tier) out.push('<span class="qc-ev-tier ' + esc(d.tier) + '">' + esc(cap(d.tier)) + '</span>');
        break;
      case "approval_flag":
        out.push('<b>' + esc(d.customer || "Unknown customer") + '</b>'); amount();
        if (d.reason) out.push(chip(clip(d.reason, 60), "qc-ev-note"));
        else out.push(chip("Awaiting a human sign-off", "qc-ev-note"));
        break;
      case "approved":
        out.push('<b>' + esc(d.customer || "Unknown customer") + '</b>'); amount();
        if (d.by) out.push(chip("by " + d.by, "qc-mut"));
        break;
      case "sent":
        out.push('<b>' + esc(d.customer || "Unknown customer") + '</b>'); amount();
        if (d.by) out.push(chip("by " + d.by, "qc-mut"));
        break;
      case "followup":
        out.push('<b>' + esc(d.customer || "Unknown customer") + '</b>'); amount();
        if (num(d.count) > 1) out.push(chip(d.count + " follow-ups total", "qc-mut"));
        break;
      case "won":
        out.push('<b>' + esc(d.customer || "Unknown customer") + '</b>'); amount();
        if (d.note) out.push(chip(clip(d.note, 60), "qc-ev-note"));
        break;
      case "lost":
        out.push('<b>' + esc(d.customer || "Unknown customer") + '</b>'); amount();
        if (d.note) out.push(chip(clip(d.note, 60), "qc-ev-note"));
        break;
      case "resolution":
        if (d.sku) out.push('<b class="qc-ev-sku">' + esc(d.sku) + '</b>');
        if (d.sig) out.push(chip("for “" + clip(d.sig, 40) + "”", "qc-mut"));
        if (d.by) out.push(chip("by " + d.by, "qc-mut"));
        break;
      case "gap":
        out.push('<b>' + esc(d.desc || d.sig || "Uncatalogued request") + '</b>');
        if (num(d.count) > 0) out.push(chip(d.count + (num(d.count) === 1 ? " request" : " requests"), "qc-ev-note"));
        break;
    }
    return out.join('<span class="qc-ev-sep">·</span>');
  }

  // ── tiles ────────────────────────────────────────────────────────────────────
  function renderTiles() {
    var start = new Date(); start.setHours(0, 0, 0, 0);
    var todayC = start.getTime(), weekC = Date.now() - 7 * 864e5;
    var today = 0, week = 0, sent = 0;
    events.forEach(function (e) {
      if (e.t >= todayC) today++;
      if (e.t >= weekC) week++;
      if (e.type === "sent") sent++;
    });
    var last = events.length ? relTime(events[0].ts) : "—";
    var tiles = [
      { n: today, l: "Events today" },
      { n: week, l: "Last 7 days" },
      { n: sent, l: "Quotes sent" },
      { n: last, l: "Latest activity", accent: events.length > 0, small: true }
    ];
    el("tiles").innerHTML = tiles.map(function (t) {
      return '<div class="qc-tile' + (t.accent ? " accent" : "") + '">' +
        '<div class="l">' + esc(t.l) + '</div>' +
        '<div class="n' + (t.small ? " small" : "") + '">' + esc(t.n) + '</div></div>';
    }).join("");
  }

  // ── helpers ──────────────────────────────────────────────────────────────────
  function dayKey(t) { var d = new Date(t); return d.getFullYear() + "-" + d.getMonth() + "-" + d.getDate(); }
  function dayLabel(t) {
    var d = new Date(t); d.setHours(0, 0, 0, 0);
    var today = new Date(); today.setHours(0, 0, 0, 0);
    var diff = Math.round((today - d) / 864e5);
    if (diff === 0) return "Today";
    if (diff === 1) return "Yesterday";
    return new Date(t).toLocaleDateString("en-GB", { weekday: "long", day: "2-digit", month: "short", year: "numeric" });
  }
  function cap(s) { s = String(s || ""); return s.charAt(0).toUpperCase() + s.slice(1); }
  function clip(s, n) { s = String(s || ""); return s.length > n ? s.slice(0, n - 1) + "…" : s; }

  function panel(icon, title, body) {
    return '<div class="ico">' + icon + '</div><h4>' + esc(title) + '</h4><p>' + body + '</p>';
  }
  function skeleton() {
    el("tiles").innerHTML = '<div class="sk sk-tile"></div>'.repeat(4);
    el("feed").innerHTML = '<div class="sk sk-row"></div>'.repeat(5);
    el("rowCount").textContent = "Loading…";
    el("emptyState").hidden = true;
  }
  function showTableError(msg) {
    var t = el("tableError");
    t.innerHTML = '<div class="ico">' + ICON_WARN + '</div><h4>Couldn’t load the activity feed</h4><p>' + esc(msg) + '</p>' +
      '<button type="button" id="retryBtn" class="btn btn-primary btn-sm">Try again</button>';
    t.hidden = false;
    el("feed").innerHTML = ""; el("tiles").innerHTML = ""; el("emptyState").hidden = true; el("rowCount").textContent = "";
    var rb = el("retryBtn"); if (rb) rb.addEventListener("click", load);
  }
})();
