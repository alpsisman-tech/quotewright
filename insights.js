/* Quotewright console — Insights (reporting).
   Reads `quotes` (+ best-effort `customers`, `catalog_gaps`) from Supabase with the
   anon key; RLS scopes every row to the signed-in tenant. Reuses the shared auth
   bootstrap (QWConsole.boot from console-views.js — same email+password/RLS pattern
   as the dashboard).

   No inline scripts (site CSP is script-src 'self'); no chart library — every chart
   is hand-rolled inline SVG. EVERYTHING degrades gracefully: a missing table, a
   missing column, or an out-of-range window shows a clean empty state, never a crash. */
(function () {
  "use strict";

  // ── reveal fail-safe ──────────────────────────────────────────────────────
  // If anything below throws, cards must never be left invisible (.rv → opacity:0).
  // A blanket timeout force-reveals anything still hidden.
  try {
    setTimeout(function () {
      var n = document.querySelectorAll(".rv:not(.in)");
      for (var i = 0; i < n.length; i++) n[i].classList.add("in");
    }, 1600);
  } catch (e) { /* no-op */ }

  var Q = window.QWConsole;
  if (!Q || typeof Q.boot !== "function") {
    var b = document.getElementById("bootError");
    if (b) { b.hidden = false; b.textContent = "Could not initialise the console (console-views.js failed to load)."; }
    return;
  }

  var el = Q.el, esc = Q.esc, num = Q.numOrNull, isMissing = Q.isMissingTable;
  var cfg = Q.cfg || {};
  var sb = null;

  var quotes = [], customers = [], gaps = [];
  var customersMissing = false, gapsMissing = false;
  var loaded = false, loading = false;
  var range = "all";

  var SYM = { EUR: "€", USD: "$", GBP: "£", TRY: "₺" };
  // Chart palette — brand tokens + a validated status trio (see dataviz validator).
  var C = {
    lime: "#D2FF37", ink: "#131313", neutral: "#D6D6D6",
    green: "#16a34a", amber: "#e08a1e", red: "#dc5b4b", grey: "#c4c8cf"
  };
  var MARGIN_LOW = 15, MARGIN_MID = 30;

  var DAY = 86400000;

  // ── boot ──────────────────────────────────────────────────────────────────
  Q.boot({ onAuth: function (client) {
    sb = client;
    el("subnav").hidden = false;
    el("refreshBtn").addEventListener("click", load);
    el("rangeSel").addEventListener("change", function () { range = this.value; if (loaded) render(); });
    setupTip();
    load();
  }});

  // ── data ────────────────────────────────────────────────────────────────────
  function load() {
    if (loading) return;
    loading = true;
    showLoading();
    var cols = "created_at,total,currency,status,outcome,outcome_at,margin_pct,match_confidence,autonomy_tier,unmatched_lines,customer,sent_at";
    var qy = sb.from("quotes").select(cols).order("created_at", { ascending: false }).limit(4000);
    if (cfg.OWNER) qy = qy.eq("owner", cfg.OWNER);
    qy.then(function (res) {
      if (res.error) {
        loading = false;
        if (isMissing(res.error)) return showNoTable();
        return showError(res.error.message || "Could not load quotes.");
      }
      quotes = res.data || [];
      loadCustomers().then(loadGaps).then(function () {
        loading = false; loaded = true; render();
      });
    }, function () { loading = false; showError("Network error while loading quotes."); });
  }

  function loadCustomers() {
    var qy = sb.from("customers").select("name,email,quote_count,order_count,currency_pref,last_seen").limit(3000);
    if (cfg.OWNER) qy = qy.eq("owner", cfg.OWNER);
    return Promise.resolve(qy).then(function (res) {
      if (res.error) { customersMissing = true; customers = []; }
      else { customers = res.data || []; customersMissing = false; }
    }, function () { customersMissing = true; customers = []; });
  }
  function loadGaps() {
    var qy = sb.from("catalog_gaps").select("description,count,status,last_requested,request_signature").limit(3000);
    if (cfg.OWNER) qy = qy.eq("owner", cfg.OWNER);
    return Promise.resolve(qy).then(function (res) {
      if (res.error) { gapsMissing = true; gaps = []; }
      else { gaps = res.data || []; gapsMissing = false; }
    }, function () { gapsMissing = true; gaps = []; });
  }

  // ── small helpers ─────────────────────────────────────────────────────────
  function money(n, cur) { return Q.money(n, cur); }
  function compact(n) {
    n = Number(n) || 0;
    var a = Math.abs(n);
    if (a >= 1e6) return (n / 1e6).toFixed(a >= 1e7 ? 0 : 1).replace(/\.0$/, "") + "M";
    if (a >= 1e3) return (n / 1e3).toFixed(a >= 1e4 ? 0 : 1).replace(/\.0$/, "") + "K";
    return String(Math.round(n));
  }
  function moneyC(n, cur) { return (SYM[cur] || (cur ? cur + " " : "")) + compact(n); }
  function outcomeOf(q) { var o = (q.outcome || "pending").toLowerCase(); return (o === "won" || o === "lost") ? o : "pending"; }
  function isSent(q) { return (q.status || "").toLowerCase() === "sent" || !!q.sent_at; }
  function tierOf(q) { var t = (q.autonomy_tier || "").toLowerCase(); return (t === "green" || t === "amber" || t === "red") ? t : null; }
  function totalOf(q) { return num(q.total); }
  function curOf(q) { return (q.currency || "").toUpperCase() || "—"; }
  function unmatchedCount(q) {
    var u = q.unmatched_lines;
    if (u == null) return 0;
    if (Array.isArray(u)) return u.length;
    if (typeof u === "number") return u;
    if (typeof u === "string") { try { var p = JSON.parse(u); return Array.isArray(p) ? p.length : (u.trim() ? 1 : 0); } catch (e) { return u.trim() ? 1 : 0; } }
    return 0;
  }
  function turnaroundH(q) {
    if (!q.sent_at || !q.created_at) return null;
    var a = new Date(q.created_at), s = new Date(q.sent_at);
    if (isNaN(a) || isNaN(s)) return null;
    var h = (s - a) / 3600000;
    return h >= 0 ? h : null;
  }
  function durText(h) {
    if (h == null) return "—";
    if (h < 1) return Math.round(h * 60) + "m";
    if (h < 48) return (h < 10 ? h.toFixed(1) : Math.round(h)) + "h";
    return (h / 24 < 10 ? (h / 24).toFixed(1) : Math.round(h / 24)) + "d";
  }
  function filterRange(list) {
    if (range === "all") return list.slice();
    var days = parseInt(range, 10);
    if (!days) return list.slice();
    var cut = Date.now() - days * DAY;
    return list.filter(function (q) { var d = new Date(q.created_at); return !isNaN(d) && d.getTime() >= cut; });
  }
  function prevRange(list) {
    if (range === "all") return null;
    var days = parseInt(range, 10); if (!days) return null;
    var hi = Date.now() - days * DAY, lo = Date.now() - 2 * days * DAY;
    return list.filter(function (q) { var d = new Date(q.created_at); return !isNaN(d) && d.getTime() >= lo && d.getTime() < hi; });
  }
  function monthsOf(list, n) {
    var m = {};
    list.forEach(function (q) {
      var d = new Date(q.created_at); if (isNaN(d)) return;
      var key = d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2);
      if (!m[key]) m[key] = { key: key, d: new Date(d.getFullYear(), d.getMonth(), 1), total: 0, won: 0, lost: 0 };
      m[key].total += 1;
      var o = outcomeOf(q);
      if (o === "won") m[key].won += 1; else if (o === "lost") m[key].lost += 1;
    });
    var keys = Object.keys(m).sort();
    if (n) keys = keys.slice(-n);
    return keys.map(function (k) { var x = m[k]; x.decided = x.won + x.lost; return x; });
  }

  // ── SVG scaffolding ─────────────────────────────────────────────────────────
  function svg(vbw, vbh, inner, label) {
    return '<svg viewBox="0 0 ' + vbw + ' ' + vbh + '" preserveAspectRatio="xMidYMid meet" role="img" aria-label="' + esc(label || "chart") + '">' + inner + "</svg>";
  }
  function tipAttr(text, sw) {
    return ' data-tip="' + esc(text) + '"' + (sw ? ' data-sw="' + esc(sw) + '"' : "");
  }
  function txt(x, y, cls, size, anchor, s, extra) {
    return '<text class="' + cls + '" x="' + x + '" y="' + y + '" font-size="' + size + '" text-anchor="' + (anchor || "start") + '"' + (extra || "") + ">" + esc(s) + "</text>";
  }
  function emptyPlot(title, msg) {
    return '<div class="in-empty"><div class="ico">' + ICON_CHART + "</div><strong>" + esc(title) + "</strong>" + esc(msg) + "</div>";
  }

  var ICON_CHART = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="M7 14l3-3 3 2 4-5"/></svg>';
  var ICON_WARN = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9 2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/></svg>';
  var ICON_INBOX = '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12h5l2 3h4l2-3h5"/><path d="M5 5.5h14a1.5 1.5 0 0 1 1.45 1.1L22 12v5a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-5l1.55-5.4A1.5 1.5 0 0 1 5 5.5z"/></svg>';

  // ── render ──────────────────────────────────────────────────────────────────
  function render() {
    hideLoading();
    el("tableError").hidden = true;
    if (!quotes.length) return showPageEmpty();
    el("emptyState").hidden = true;
    el("tiles").hidden = false; el("grid").hidden = false;

    var qs = filterRange(quotes);
    renderTiles(qs);
    renderGrid(qs);
    runReveal();
  }

  function rangeLabel() {
    return range === "all" ? "all time" :
      (range === "365" ? "last 12 months" : "last " + range + " days");
  }

  function renderTiles(qs) {
    var total = qs.length;
    var decided = qs.filter(function (q) { return outcomeOf(q) !== "pending"; });
    var won = qs.filter(function (q) { return outcomeOf(q) === "won"; });
    var winRate = decided.length ? (won.length / decided.length * 100) : null;

    // value by currency
    var quotedByCur = {}, wonByCur = {};
    qs.forEach(function (q) {
      var v = totalOf(q); if (v == null) return; var c = curOf(q);
      quotedByCur[c] = (quotedByCur[c] || 0) + v;
      if (outcomeOf(q) === "won") wonByCur[c] = (wonByCur[c] || 0) + v;
    });
    var quotedTop = topCur(quotedByCur), wonTop = topCur(wonByCur);

    // margin
    var margins = qs.map(function (q) { return num(q.margin_pct); }).filter(function (x) { return x != null; });
    var avgMargin = margins.length ? margins.reduce(function (a, b) { return a + b; }, 0) / margins.length : null;

    // turnaround
    var trs = qs.map(turnaroundH).filter(function (x) { return x != null; });
    var avgTr = trs.length ? trs.reduce(function (a, b) { return a + b; }, 0) / trs.length : null;

    // deltas vs previous equal window
    var prev = prevRange(quotes);
    var dCount = null, dWin = null;
    if (prev) {
      dCount = pctDelta(total, prev.length);
      var pdec = prev.filter(function (q) { return outcomeOf(q) !== "pending"; });
      var pwon = prev.filter(function (q) { return outcomeOf(q) === "won"; });
      var pRate = pdec.length ? pwon.length / pdec.length * 100 : null;
      if (winRate != null && pRate != null) dWin = winRate - pRate; // pts
    }

    var tiles = [
      { n: compact(total), l: "Quotes", sub2: rangeLabel(), delta: dCount == null ? null : deltaTag(dCount, "%", true) },
      { n: winRate == null ? "—" : Math.round(winRate) + "%", l: "Win rate", accent: true,
        sub2: decided.length ? (won.length + " of " + decided.length + " decided") : "no decisions yet",
        delta: dWin == null ? null : deltaTag(Math.round(dWin), " pts", true) },
      { n: quotedTop ? moneyC(quotedTop.v, quotedTop.k) : "—", l: "Quoted value",
        sub2: otherCurs(quotedByCur, quotedTop) },
      { n: wonTop ? moneyC(wonTop.v, wonTop.k) : "—", l: "Won value",
        sub2: quotedTop && wonTop ? Math.round(wonTop.v / quotedTop.v * 100) + "% of quoted" : "" },
      { n: avgMargin == null ? "—" : avgMargin.toFixed(1) + "%", l: "Avg margin",
        sub2: avgMargin == null ? "not tracked yet" : (avgMargin < MARGIN_LOW ? "below target" : avgMargin < MARGIN_MID ? "healthy" : "strong") },
      { n: durText(avgTr), l: "Avg turnaround",
        sub2: trs.length ? "quote → sent (" + trs.length + " sent)" : "no sent quotes yet" }
    ];

    el("tiles").innerHTML = tiles.map(function (t) {
      return '<div class="qc-tile' + (t.accent ? " accent" : "") + '">' +
        '<div class="n">' + esc(t.n) + "</div>" +
        '<div class="l">' + esc(t.l) + "</div>" +
        (t.delta || "") +
        (t.sub2 ? '<div class="sub2">' + esc(t.sub2) + "</div>" : "") +
        "</div>";
    }).join("");
  }
  function topCur(map) {
    var best = null;
    Object.keys(map).forEach(function (k) { if (!best || map[k] > best.v) best = { k: k, v: map[k] }; });
    return best;
  }
  function otherCurs(map, top) {
    var ks = Object.keys(map).filter(function (k) { return !top || k !== top.k; });
    if (!ks.length) return top ? "" : "";
    ks.sort(function (a, b) { return map[b] - map[a]; });
    return "+ " + ks.slice(0, 2).map(function (k) { return moneyC(map[k], k); }).join(" · ");
  }
  function pctDelta(cur, prev) { if (!prev) return cur ? 100 : 0; return Math.round((cur - prev) / prev * 100); }
  function deltaTag(v, unit, upGood) {
    var dir = v > 0 ? "up" : v < 0 ? "down" : "flat";
    var good = v === 0 ? "flat" : ((v > 0) === !!upGood ? "up" : "down");
    var arrow = v > 0 ? "↑" : v < 0 ? "↓" : "→";
    return '<div class="in-delta ' + good + '">' + arrow + " " + (v > 0 ? "+" : "") + v + unit + ' <span style="opacity:.6">vs prev</span></div>';
  }

  // ── the charts ────────────────────────────────────────────────────────────
  function renderGrid(qs) {
    var cards = [
      { wide: true, title: "Win-rate over time", sub: "Share of decided quotes that were won, by month.",
        legend: [["Win rate", C.lime, "dot"]], build: function () { return chartWinrate(qs); } },
      { title: "Quote volume by month", sub: "Quotes drafted each month; won portion highlighted.",
        legend: [["Won", C.lime], ["Other", C.neutral]], build: function () { return chartVolume(qs); } },
      { title: "Margin distribution", sub: "Quotes grouped by margin band. Thin margins flagged.",
        legend: [["Below " + MARGIN_LOW + "%", C.red], ["Healthy", C.neutral], [MARGIN_MID + "%+", C.lime]], build: function () { return chartMargin(qs); } },
      { wide: true, title: "Quoted vs won value", sub: "Pipeline value by currency, and how much converted to won.",
        legend: [["Won", C.lime], ["Quoted", C.neutral]], build: function () { return chartValue(qs); } },
      { title: "Autonomy-tier mix", sub: "How the pipeline graded confidence on each draft.",
        legend: [["Green", C.green], ["Amber", C.amber], ["Red", C.red]], build: function () { return chartTiers(qs); } },
      { title: "Turnaround", sub: "Time from draft created to sent, bucketed.",
        legend: null, build: function () { return chartTurnaround(qs); } },
      { title: "Top customers", sub: customersMissing ? "By quote volume (from quotes)." : "By quotes on record.",
        legend: null, build: function () { return chartCustomers(qs); } },
      { title: "Top catalogue gaps", sub: gapSub(qs), legend: null, build: function () { return chartGaps(); } }
    ];

    el("grid").innerHTML = cards.map(function (c, i) {
      var body = "";
      try { body = c.build(); } catch (e) { body = emptyPlot("Couldn’t draw this", "There was a problem rendering this chart."); }
      var legend = c.legend ? '<div class="in-legend">' + c.legend.map(function (L) {
        return '<span><i class="' + (L[2] === "dot" ? "dot" : "") + '" style="background:' + L[1] + '"></i>' + esc(L[0]) + "</span>";
      }).join("") + "</div>" : "";
      return '<div class="in-card rv rv-d' + Math.min(i + 1, 6) + (c.wide ? " wide" : "") + '">' +
        '<div class="in-card-head"><h3>' + esc(c.title) + "</h3>" + legend + "</div>" +
        '<p class="in-sub">' + esc(c.sub) + "</p>" +
        '<div class="in-plot">' + body + "</div></div>";
    }).join("");
  }
  function gapSub(qs) {
    if (gapsMissing) return "Requested-but-uncatalogued items.";
    var um = qs.reduce(function (s, q) { return s + (unmatchedCount(q) > 0 ? 1 : 0); }, 0);
    var base = "Requested items the catalogue can’t price yet, by frequency.";
    return um ? base + " " + um + " quote" + (um === 1 ? "" : "s") + " had unmatched lines." : base;
  }

  // Win-rate line chart
  function chartWinrate(qs) {
    var ms = monthsOf(qs, 12);
    var withDec = ms.filter(function (m) { return m.decided > 0; });
    if (!withDec.length) return emptyPlot("No decided quotes yet", "Win-rate appears once quotes are marked won or lost.");
    var VBW = 1040, VBH = 300, padT = 26, padB = 40, padL = 44, padR = 24;
    var innerW = VBW - padL - padR, innerH = VBH - padT - padB;
    var n = ms.length;
    var slot = n > 1 ? innerW / (n - 1) : 0;
    var xOf = function (i) { return n > 1 ? padL + slot * i : padL + innerW / 2; };
    var yOf = function (r) { return padT + innerH - (r / 100) * innerH; };
    var parts = [];
    // gridlines 0/25/50/75/100
    [0, 25, 50, 75, 100].forEach(function (g) {
      var y = yOf(g);
      parts.push('<line class="grid" x1="' + padL + '" y1="' + y.toFixed(1) + '" x2="' + (padL + innerW) + '" y2="' + y.toFixed(1) + '"/>');
      parts.push(txt(padL - 8, y + 4, "lbl", 15, "end", g + "%"));
    });
    // build point list (only months with decisions get a point; keep x by index)
    var pts = [];
    ms.forEach(function (m, i) { if (m.decided > 0) pts.push({ i: i, x: xOf(i), y: yOf(m.won / m.decided * 100), m: m }); });
    // area + line across defined points
    if (pts.length > 1) {
      var area = "M" + pts[0].x.toFixed(1) + "," + (padT + innerH) + " ";
      pts.forEach(function (p) { area += "L" + p.x.toFixed(1) + "," + p.y.toFixed(1) + " "; });
      area += "L" + pts[pts.length - 1].x.toFixed(1) + "," + (padT + innerH) + " Z";
      parts.push('<path class="area" d="' + area + '"/>');
      var line = "M" + pts.map(function (p) { return p.x.toFixed(1) + "," + p.y.toFixed(1); }).join(" L");
      parts.push('<path class="line" d="' + line + '"/>');
    }
    // x labels (every month) + dots + hover
    ms.forEach(function (m, i) {
      parts.push(txt(xOf(i), VBH - 12, "lbl", 15, "middle", m.d.toLocaleDateString("en-GB", { month: "short" })));
    });
    pts.forEach(function (p, idx) {
      var rate = Math.round(p.m.won / p.m.decided * 100);
      var tip = p.m.d.toLocaleDateString("en-GB", { month: "long", year: "numeric" }) + "\nWin rate " + rate + "%\n" + p.m.won + " won of " + p.m.decided + " decided";
      parts.push('<circle class="hit" cx="' + p.x.toFixed(1) + '" cy="' + p.y.toFixed(1) + '" r="16"' + tipAttr(tip, C.lime) + "/>");
      parts.push('<circle class="dot" cx="' + p.x.toFixed(1) + '" cy="' + p.y.toFixed(1) + '" r="5"/>');
      if (idx === pts.length - 1) parts.push(txt(p.x + 12, p.y - 8, "val", 17, "middle", rate + "%"));
    });
    return svg(VBW, VBH, parts.join(""), "Win-rate over time");
  }

  // Column chart — volume by month
  function chartVolume(qs) {
    var ms = monthsOf(qs, 12);
    if (!ms.length) return emptyPlot("No dated quotes", "Quotes with a created date will appear here.");
    var VBW = 700, VBH = 300, padT = 30, padB = 40, padX = 14;
    var innerH = VBH - padT - padB, baseY = padT + innerH;
    var n = ms.length;
    var slot = Math.min((VBW - padX * 2) / n, 96);
    var plotW = slot * n;
    var barW = Math.max(12, Math.min(46, slot * 0.5));
    var maxN = ms.reduce(function (m, x) { return Math.max(m, x.total); }, 1);
    var parts = [];
    var ticks = Math.min(maxN, 4);
    for (var g = 1; g <= ticks; g++) {
      var gy = (baseY - g / ticks * innerH).toFixed(1);
      parts.push('<line class="grid" x1="' + padX + '" y1="' + gy + '" x2="' + (padX + plotW).toFixed(1) + '" y2="' + gy + '"/>');
    }
    parts.push('<line class="axis" x1="' + padX + '" y1="' + baseY + '" x2="' + (padX + plotW).toFixed(1) + '" y2="' + baseY + '"/>');
    ms.forEach(function (x, i) {
      var cx = padX + slot * i + slot / 2, bx = cx - barW / 2;
      var totH = x.total > 0 ? Math.max(5, Math.round(x.total / maxN * innerH)) : 0;
      var wonH = Math.round(x.won / maxN * innerH);
      var yTop = baseY - totH;
      var tip = x.d.toLocaleDateString("en-GB", { month: "long", year: "numeric" }) + "\n" + x.total + " quote" + (x.total === 1 ? "" : "s") + "\n" + x.won + " won · " + x.lost + " lost";
      if (totH > 0) parts.push('<rect class="bar-neutral" x="' + bx.toFixed(1) + '" y="' + yTop.toFixed(1) + '" width="' + barW.toFixed(1) + '" height="' + totH + '" rx="4"/>');
      if (wonH > 0) parts.push('<rect class="bar-lime" x="' + bx.toFixed(1) + '" y="' + (baseY - wonH).toFixed(1) + '" width="' + barW.toFixed(1) + '" height="' + Math.max(wonH, 4) + '" rx="4"/>');
      parts.push('<rect class="hit" x="' + (cx - slot / 2).toFixed(1) + '" y="' + padT + '" width="' + slot.toFixed(1) + '" height="' + (innerH + 6) + '"' + tipAttr(tip, C.lime) + "/>");
      parts.push(txt(cx, yTop - 8, "val", 17, "middle", String(x.total)));
      parts.push(txt(cx, VBH - 12, "lbl", 15, "middle", x.d.toLocaleDateString("en-GB", { month: "short" })));
    });
    return svg(VBW, VBH, parts.join(""), "Quote volume by month");
  }

  // Margin distribution histogram
  function chartMargin(qs) {
    var vals = qs.map(function (q) { return num(q.margin_pct); }).filter(function (x) { return x != null; });
    if (!vals.length) return emptyPlot("No margin data yet", "The pipeline writes margin_pct per quote; this fills once it does.");
    var edges = [-100, 0, 10, 20, 30, 40, 200];
    var labels = ["<0", "0–10", "10–20", "20–30", "30–40", "40%+"];
    var buckets = labels.map(function (l, i) { return { l: l, lo: edges[i], hi: edges[i + 1], c: 0 }; });
    vals.forEach(function (v) {
      for (var i = 0; i < buckets.length; i++) { if (v >= buckets[i].lo && v < buckets[i].hi) { buckets[i].c++; return; } }
      buckets[buckets.length - 1].c++;
    });
    // drop the "<0" bucket if empty to reduce noise
    if (buckets[0].c === 0) buckets.shift();
    var maxN = buckets.reduce(function (m, b) { return Math.max(m, b.c); }, 1);
    var med = median(vals);
    var VBW = 700, VBH = 300, padT = 30, padB = 42, padX = 16;
    var innerH = VBH - padT - padB, baseY = padT + innerH;
    var n = buckets.length, slot = (VBW - padX * 2) / n, barW = Math.min(56, slot * 0.62);
    var parts = [];
    parts.push('<line class="axis" x1="' + padX + '" y1="' + baseY + '" x2="' + (VBW - padX) + '" y2="' + baseY + '"/>');
    buckets.forEach(function (b, i) {
      var cx = padX + slot * i + slot / 2, bx = cx - barW / 2;
      var h = b.c > 0 ? Math.max(4, Math.round(b.c / maxN * innerH)) : 0;
      var fill = b.hi <= MARGIN_LOW ? C.red : (b.lo >= MARGIN_MID ? C.lime : C.neutral);
      var tip = "Margin " + b.l + (b.l.indexOf("%") < 0 ? "%" : "") + "\n" + b.c + " quote" + (b.c === 1 ? "" : "s");
      if (h > 0) parts.push('<rect x="' + bx.toFixed(1) + '" y="' + (baseY - h).toFixed(1) + '" width="' + barW.toFixed(1) + '" height="' + h + '" rx="4" fill="' + fill + '"/>');
      parts.push('<rect class="hit" x="' + (padX + slot * i).toFixed(1) + '" y="' + padT + '" width="' + slot.toFixed(1) + '" height="' + (innerH + 6) + '"' + tipAttr(tip, fill) + "/>");
      if (b.c > 0) parts.push(txt(cx, baseY - h - 8, "val", 16, "middle", String(b.c)));
      parts.push(txt(cx, VBH - 12, "lbl", 14, "middle", b.l));
    });
    // median marker (top-left, clear of the tallest bar's value label)
    if (med != null) parts.push(txt(padX, padT - 14, "val soft", 15, "start", "median " + med.toFixed(1) + "%"));
    return svg(VBW, VBH, parts.join(""), "Margin distribution");
  }
  function median(a) { if (!a.length) return null; var s = a.slice().sort(function (x, y) { return x - y; }); var m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; }

  // Quoted vs won value — one horizontal bar per currency (won overlaid on quoted)
  function chartValue(qs) {
    var by = {};
    qs.forEach(function (q) {
      var v = totalOf(q); if (v == null) return; var c = curOf(q);
      if (!by[c]) by[c] = { c: c, quoted: 0, won: 0, nq: 0, nw: 0 };
      by[c].quoted += v; by[c].nq += 1;
      if (outcomeOf(q) === "won") { by[c].won += v; by[c].nw += 1; }
    });
    var rows = Object.keys(by).map(function (k) { return by[k]; }).sort(function (a, b) { return b.quoted - a.quoted; }).slice(0, 6);
    if (!rows.length) return emptyPlot("No priced quotes yet", "Quotes with a total value will chart here.");
    var maxV = rows.reduce(function (m, r) { return Math.max(m, r.quoted); }, 1);
    var VBW = 1040, rowH = 46, padT = 12, padL = 58, padR = 150, gap = 16;
    var VBH = padT + rows.length * rowH + 8;
    var innerW = VBW - padL - padR;
    var parts = [];
    rows.forEach(function (r, i) {
      var y = padT + i * rowH, barY = y + 8, bh = 20;
      var qw = Math.max(3, r.quoted / maxV * innerW);
      var ww = r.quoted > 0 ? r.won / r.quoted * qw : 0;
      var conv = r.quoted > 0 ? Math.round(r.won / r.quoted * 100) : 0;
      parts.push(txt(padL - 10, barY + bh - 4, "val", 18, "end", SYM[r.c] ? r.c : r.c));
      parts.push('<rect class="track" x="' + padL + '" y="' + barY + '" width="' + innerW + '" height="' + bh + '" rx="6"/>');
      var tipQ = r.c + " · " + r.nq + " quotes\nQuoted " + money(r.quoted, r.c) + "\nWon " + money(r.won, r.c) + " (" + conv + "%)";
      parts.push('<rect x="' + padL + '" y="' + barY + '" width="' + qw.toFixed(1) + '" height="' + bh + '" rx="6" fill="' + C.neutral + '"' + tipAttr(tipQ, C.neutral) + "/>");
      if (ww > 0) parts.push('<rect x="' + padL + '" y="' + barY + '" width="' + Math.max(ww, 4).toFixed(1) + '" height="' + bh + '" rx="6" fill="' + C.lime + '"' + tipAttr(tipQ, C.lime) + "/>");
      parts.push(txt(padL + qw + 10, barY + bh - 4, "val", 17, "start", moneyC(r.quoted, r.c)));
      parts.push(txt(padL + qw + 10, barY + bh + 14, "val soft", 13, "start", moneyC(r.won, r.c) + " won · " + conv + "%"));
    });
    return svg(VBW, VBH, parts.join(""), "Quoted vs won value by currency");
  }

  // Autonomy-tier donut
  function chartTiers(qs) {
    var counts = { green: 0, amber: 0, red: 0, none: 0 };
    qs.forEach(function (q) { var t = tierOf(q); counts[t || "none"]++; });
    var graded = counts.green + counts.amber + counts.red;
    if (!graded) return emptyPlot("No tier data yet", "The pipeline grades each draft green / amber / red; this fills once it does.");
    var segs = [
      { k: "Green — ready", v: counts.green, c: C.green },
      { k: "Amber — review", v: counts.amber, c: C.amber },
      { k: "Red — needs work", v: counts.red, c: C.red }
    ].filter(function (s) { return s.v > 0; });
    var VBW = 700, VBH = 300, cx = 168, cy = 150, rO = 108, rI = 66;
    var parts = [];
    var totalSeg = graded;
    var ang = -Math.PI / 2;
    segs.forEach(function (s) {
      var frac = s.v / totalSeg;
      var a2 = ang + frac * Math.PI * 2;
      // 2px surface gap between segments
      var pad = segs.length > 1 ? 0.03 : 0;
      parts.push(donutArc(cx, cy, rO, rI, ang + pad, a2 - pad, s.c,
        s.k + "\n" + s.v + " (" + Math.round(frac * 100) + "%)"));
      ang = a2;
    });
    parts.push(txt(cx, cy - 4, "val", 40, "middle", String(graded)));
    parts.push(txt(cx, cy + 22, "lbl mid", 15, "middle", "graded"));
    // legend rows on the right
    var lx = 330, ly = 74;
    segs.forEach(function (s, i) {
      var yy = ly + i * 42;
      parts.push('<rect x="' + lx + '" y="' + (yy - 12) + '" width="14" height="14" rx="4" fill="' + s.c + '"/>');
      parts.push(txt(lx + 24, yy, "val", 17, "start", s.k));
      parts.push(txt(lx + 24, yy + 20, "lbl mid", 14, "start", s.v + " quote" + (s.v === 1 ? "" : "s") + " · " + Math.round(s.v / totalSeg * 100) + "%"));
    });
    if (counts.none > 0) parts.push(txt(lx, ly + segs.length * 42 + 8, "lbl", 13, "start", "+ " + counts.none + " ungraded"));
    return svg(VBW, VBH, parts.join(""), "Autonomy-tier mix");
  }
  function donutArc(cx, cy, rO, rI, a1, a2, fill, tip) {
    var large = (a2 - a1) > Math.PI ? 1 : 0;
    var x1 = cx + rO * Math.cos(a1), y1 = cy + rO * Math.sin(a1);
    var x2 = cx + rO * Math.cos(a2), y2 = cy + rO * Math.sin(a2);
    var x3 = cx + rI * Math.cos(a2), y3 = cy + rI * Math.sin(a2);
    var x4 = cx + rI * Math.cos(a1), y4 = cy + rI * Math.sin(a1);
    var d = "M" + x1.toFixed(1) + "," + y1.toFixed(1) +
      " A" + rO + "," + rO + " 0 " + large + " 1 " + x2.toFixed(1) + "," + y2.toFixed(1) +
      " L" + x3.toFixed(1) + "," + y3.toFixed(1) +
      " A" + rI + "," + rI + " 0 " + large + " 0 " + x4.toFixed(1) + "," + y4.toFixed(1) + " Z";
    return '<path d="' + d + '" fill="' + fill + '"' + tipAttr(tip, fill) + "/>";
  }

  // Turnaround distribution — horizontal bars
  function chartTurnaround(qs) {
    var buckets = [
      { l: "under 1h", lo: 0, hi: 1, c: 0 },
      { l: "1–4h", lo: 1, hi: 4, c: 0 },
      { l: "4–24h", lo: 4, hi: 24, c: 0 },
      { l: "1–3 days", lo: 24, hi: 72, c: 0 },
      { l: "3 days+", lo: 72, hi: Infinity, c: 0 }
    ];
    var any = 0;
    qs.forEach(function (q) { var h = turnaroundH(q); if (h == null) return; any++; for (var i = 0; i < buckets.length; i++) { if (h >= buckets[i].lo && h < buckets[i].hi) { buckets[i].c++; break; } } });
    if (!any) return emptyPlot("No sent quotes yet", "Turnaround is measured from draft created to sent.");
    return hbars(buckets.map(function (b) { return { label: b.l, v: b.c, tip: b.l + "\n" + b.c + " quote" + (b.c === 1 ? "" : "s") }; }), "quotes", C.neutral, false);
  }

  // Top customers — horizontal bars
  function chartCustomers(qs) {
    var rows;
    if (!customersMissing && customers.length) {
      rows = customers.map(function (c) { return { label: c.name || c.email || "—", v: num(c.quote_count) || 0, sub: (num(c.order_count) || 0) + " won" }; })
        .filter(function (r) { return r.v > 0; })
        .sort(function (a, b) { return b.v - a.v; }).slice(0, 8);
    } else {
      var agg = {};
      qs.forEach(function (q) { var nm = (q.customer || "").trim(); if (!nm) return; if (!agg[nm]) agg[nm] = { label: nm, v: 0, w: 0 }; agg[nm].v++; if (outcomeOf(q) === "won") agg[nm].w++; });
      rows = Object.keys(agg).map(function (k) { return { label: agg[k].label, v: agg[k].v, sub: agg[k].w + " won" }; })
        .sort(function (a, b) { return b.v - a.v; }).slice(0, 8);
    }
    if (!rows.length) return emptyPlot("No customers yet", "Recurring customers appear here as quotes accumulate.");
    return hbars(rows.map(function (r) { return { label: r.label, v: r.v, subLabel: r.sub, tip: r.label + "\n" + r.v + " quotes · " + r.sub }; }), "quotes", C.lime, true);
  }

  // Top catalogue gaps — horizontal bars
  function chartGaps() {
    if (gapsMissing) return emptyPlot("Gaps not tracked yet", "Run quotewright-intelligence.sql and this ranks what customers keep asking for.");
    var open = gaps.filter(function (g) { return (g.status || "open") === "open"; });
    var rows = open.map(function (g) { return { label: g.description || g.request_signature || "—", v: num(g.count) || 1 }; })
      .sort(function (a, b) { return b.v - a.v; }).slice(0, 8);
    if (!rows.length) return emptyPlot("No open gaps", "Nice — every recent request matched the catalogue.");
    return hbars(rows.map(function (r) { return { label: clip(r.label, 42), v: r.v, tip: r.label + "\n" + r.v + " request" + (r.v === 1 ? "" : "s") }; }), "requests", C.neutral, false);
  }

  // Generic horizontal-bar renderer
  function hbars(rows, unit, fill, accent) {
    var VBW = 700, padT = 8, padL = 8, padR = 60, rowH = 34;
    var VBH = padT + rows.length * rowH + 6;
    var maxV = rows.reduce(function (m, r) { return Math.max(m, r.v); }, 1);
    var labelW = 200, barX = labelW + 12, innerW = VBW - barX - padR;
    var parts = [];
    rows.forEach(function (r, i) {
      var y = padT + i * rowH, barY = y + 7, bh = rowH - 15;
      var w = Math.max(3, r.v / maxV * innerW);
      parts.push(txt(labelW, barY + bh - 3, "val", 15, "end", clip(r.label, 26)));
      parts.push('<rect class="track" x="' + barX + '" y="' + barY + '" width="' + innerW + '" height="' + bh + '" rx="5"/>');
      parts.push('<rect x="' + barX + '" y="' + barY + '" width="' + w.toFixed(1) + '" height="' + bh + '" rx="5" fill="' + fill + '"' + tipAttr(r.tip, fill) + "/>");
      parts.push(txt(barX + w + 8, barY + bh - 3, "val", 15, "start", String(r.v)));
      if (r.subLabel) parts.push(txt(barX + w + 8, barY + bh + 12, "val soft", 12, "start", r.subLabel));
    });
    return svg(VBW, VBH, parts.join(""), "ranked bars");
  }
  function clip(s, n) { s = String(s == null ? "" : s); return s.length > n ? s.slice(0, n - 1) + "…" : s; }

  // ── tooltip ────────────────────────────────────────────────────────────────
  function setupTip() {
    var grid = el("grid"), tip = el("inTip");
    if (!grid || !tip) return;
    grid.addEventListener("mousemove", function (e) {
      var m = e.target && e.target.closest ? e.target.closest("[data-tip]") : null;
      if (!m) { hideTip(); return; }
      showTip(m.getAttribute("data-tip"), m.getAttribute("data-sw"), e.clientX, e.clientY);
    });
    grid.addEventListener("mouseleave", hideTip);
  }
  function showTip(text, sw, x, y) {
    var tip = el("inTip");
    if (!text) { hideTip(); return; }
    var lines = String(text).split("\n");
    var html = (sw ? '<span class="sw" style="background:' + esc(sw) + '"></span>' : "") + "<b>" + esc(lines[0]) + "</b>";
    for (var i = 1; i < lines.length; i++) html += "<br>" + esc(lines[i]);
    tip.innerHTML = html;
    tip.hidden = false;
    var vw = window.innerWidth || 1000;
    var cx = Math.max(70, Math.min(vw - 70, x));
    tip.style.left = cx + "px";
    tip.style.top = y + "px";
    tip.classList.add("show");
  }
  function hideTip() { var tip = el("inTip"); if (tip) { tip.classList.remove("show"); tip.hidden = true; } }

  // ── reveal ────────────────────────────────────────────────────────────────
  function runReveal() {
    var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    var cards = document.querySelectorAll(".in-card.rv");
    if (reduce || !("IntersectionObserver" in window)) {
      for (var i = 0; i < cards.length; i++) cards[i].classList.add("in");
      return;
    }
    var io = new IntersectionObserver(function (ents) {
      ents.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add("in"); io.unobserve(en.target); } });
    }, { threshold: 0.08, rootMargin: "0px 0px -8% 0px" });
    for (var j = 0; j < cards.length; j++) io.observe(cards[j]);
    // hard fail-safe: reveal anything still hidden shortly after
    setTimeout(function () { var n = document.querySelectorAll(".in-card.rv:not(.in)"); for (var k = 0; k < n.length; k++) n[k].classList.add("in"); }, 1200);
  }

  // ── loading / empty / error states ──────────────────────────────────────────
  function showLoading() {
    el("tableError").hidden = true; el("emptyState").hidden = true;
    el("tiles").hidden = false; el("grid").hidden = false;
    el("tiles").innerHTML = repeat('<div class="qc-tile"><div class="n in-skel" style="width:60%;height:30px">&nbsp;</div><div class="l in-skel" style="width:40%;height:11px;margin-top:8px">&nbsp;</div></div>', 6);
    el("grid").innerHTML = repeat('<div class="in-card"><div class="in-skel in-skel-h">&nbsp;</div></div>', 4);
  }
  function hideLoading() { /* render() overwrites the skeleton innerHTML */ }
  function repeat(s, n) { var out = ""; for (var i = 0; i < n; i++) out += s; return out; }

  function showPageEmpty() {
    el("tiles").hidden = true; el("grid").hidden = true;
    var e = el("emptyState");
    e.hidden = false;
    e.innerHTML = '<div class="ico">' + ICON_INBOX + "</div><h4>No quotes yet</h4>" +
      "<p>Insights light up as the RFQ pipeline drafts quotes. Once the first quotes land, you’ll see win-rate, pipeline value, margins and turnaround here.</p>";
  }
  function showNoTable() {
    hideLoading();
    el("tiles").hidden = true; el("grid").hidden = true;
    var e = el("emptyState");
    e.hidden = false;
    e.innerHTML = '<div class="ico">' + ICON_WARN + "</div><h4>Reporting isn’t set up yet</h4>" +
      "<p>The <code>quotes</code> table isn’t in this project. Once the pipeline is connected and quotes exist, this page fills automatically.</p>";
  }
  function showError(msg) {
    hideLoading();
    el("tiles").hidden = true; el("grid").hidden = true;
    var t = el("tableError");
    t.hidden = false;
    t.innerHTML = '<div class="ico">' + ICON_WARN + "</div><h4>Couldn’t load insights</h4><p>" + esc(msg) + "</p>";
  }
})();
