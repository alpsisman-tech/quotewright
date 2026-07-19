/* Catalogue gaps view. Reads public.catalog_gaps (RLS: authenticated SELECT).
   Mark-as-added / ignore attempts an authenticated UPDATE; if RLS has no write policy
   the update affects 0 rows (or errors) → we flip to display-only + explain why.
   Degrades gracefully when the intelligence SQL hasn't been run yet. */
(function () {
  "use strict";
  var Q = window.QWConsole;
  var el = Q.el, esc = Q.esc, num = Q.numOrNull, toast = Q.toast;
  var sb = null;
  var all = [];
  var loaded = false, loading = false, writeBlocked = false;

  var ICON_BOX = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M21 8V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8"/><path d="M1 3h22v5H1zM10 12h4"/></svg>';
  var ICON_FILTER = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3 5h18l-7 8v5l-4 2v-7L3 5z"/></svg>';
  var ICON_WARN = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9 2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/></svg>';
  var ICON_INFO = '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 8h.01M11 12h1v4h1"/></svg>';

  Q.boot({ onAuth: function (client) {
    sb = client;
    el("subnav").hidden = false;
    el("refreshBtn").addEventListener("click", load);
    el("search").addEventListener("input", render);
    el("statusSel").addEventListener("change", render);
    el("gaps").addEventListener("click", function (e) {
      var b = e.target.closest ? e.target.closest("button[data-act]") : null;
      if (b) setStatus(b.getAttribute("data-id"), b.getAttribute("data-act"), b);
    });
    load();
  }});

  function renderTiles() {
    var open = all.filter(function (g) { return (g.status || "open") === "open"; });
    var reqs = open.reduce(function (s, g) { return s + (num(g.count) || 0); }, 0);
    var top = open.reduce(function (m, g) { return (num(g.count) || 0) > (num(m.count) || 0) ? g : m; }, { count: 0 });
    var resolved = all.filter(function (g) { return g.status === "resolved"; }).length;
    var tiles = [
      { n: open.length, l: "Open gaps" },
      { n: reqs, l: "Total requests", sub2: "across open gaps" },
      { n: num(top.count) || 0, l: "Most requested", accent: (num(top.count) || 0) > 0, sub2: top.description ? clip(top.description, 34) : "" },
      { n: resolved, l: "Added to catalogue" }
    ];
    el("tiles").innerHTML = tiles.map(function (t) {
      return '<div class="qc-tile' + (t.accent ? " accent" : "") + '">' +
        '<div class="n">' + esc(t.n) + '</div><div class="l">' + esc(t.l) + '</div>' +
        (t.sub2 ? '<div class="sub2">' + esc(t.sub2) + '</div>' : '') + '</div>';
    }).join("");
  }
  function clip(s, n) { s = String(s || ""); return s.length > n ? s.slice(0, n - 1) + "…" : s; }

  function render() {
    if (!loaded) return;
    renderTiles();
    var status = el("statusSel").value;
    var q = (el("search").value || "").trim().toLowerCase();
    var list = all.filter(function (g) {
      var st = g.status || "open";
      if (status !== "all" && st !== status) return false;
      if (q && ((g.description || "") + " " + (g.request_signature || "")).toLowerCase().indexOf(q) === -1) return false;
      return true;
    });
    list.sort(function (a, b) { return (num(b.count) || 0) - (num(a.count) || 0); });
    el("rowCount").textContent = list.length + (status === "all" ? " total" : " " + status);

    el("writeNote").hidden = !writeBlocked;
    if (writeBlocked) el("writeNote").innerHTML = ICON_INFO +
      '<span><b>Read-only here.</b> Gap status is written by the pipeline (service role) — there’s no authenticated write policy on <code>catalog_gaps</code>, so “Mark added” / “Ignore” can’t change it from the console. The ranking below is still live.</span>';

    var empty = el("emptyState"), gapsEl = el("gaps");
    if (list.length === 0) {
      gapsEl.innerHTML = "";
      empty.hidden = false;
      if (all.length === 0) {
        empty.innerHTML = panel(ICON_BOX, "No gaps recorded yet",
          "Every time a request can’t be priced from the catalogue, it’s logged here and its counter ticks up. Nothing’s been flagged yet.");
      } else {
        empty.innerHTML = panel(ICON_FILTER, "Nothing in this view", "No gaps match that filter. Try “All statuses” or clear the search.");
      }
      return;
    }
    empty.hidden = true;
    var maxN = list.reduce(function (m, g) { return Math.max(m, num(g.count) || 0); }, 1);
    gapsEl.innerHTML = list.map(function (g) {
      var n = num(g.count) || 0;
      var st = g.status || "open";
      var pct = Math.max(8, Math.round(n / maxN * 100));
      var meta = [];
      if (g.request_signature) meta.push('<span class="qc-gap-sig">' + esc(g.request_signature) + '</span>');
      if (g.last_requested) meta.push('<span>Last asked ' + esc(Q.relTime(g.last_requested)) + '</span>');
      if (g.example_quote_id) meta.push('<span>e.g. quote ' + esc(clip(g.example_quote_id, 12)) + '</span>');
      var actions;
      if (st === "open") {
        actions = writeBlocked
          ? '<span class="qc-gap-state">Open</span>'
          : '<button class="qc-gap-btn add" data-id="' + esc(g.id) + '" data-act="resolved">' +
              '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5L20 7"/></svg>Mark added</button>' +
            '<button class="qc-gap-btn ignore" data-id="' + esc(g.id) + '" data-act="ignored">Ignore</button>';
      } else {
        actions = '<span class="pill ' + esc(st) + '">' + (st === "resolved" ? "Added" : "Ignored") + '</span>' +
          (writeBlocked ? '' : '<button class="qc-gap-btn ignore" data-id="' + esc(g.id) + '" data-act="open">Reopen</button>');
      }
      return '<div class="qc-gap ' + (st === "resolved" ? "is-resolved" : st === "ignored" ? "is-ignored" : "") + '">' +
        '<div class="qc-gap-count"><div class="cn">' + n + '</div><div class="cl">' + (n === 1 ? "request" : "requests") + '</div>' +
          '<div class="bar" style="transform:scaleX(' + (pct / 100).toFixed(2) + ')"></div></div>' +
        '<div class="qc-gap-main"><h3 class="qc-gap-desc">' + esc(g.description || g.request_signature || "Unspecified request") + '</h3>' +
          '<div class="qc-gap-meta">' + meta.join("") + '</div></div>' +
        '<div class="qc-gap-actions">' + actions + '</div>' +
      '</div>';
    }).join("");
  }

  function setStatus(id, status, btn) {
    if (!id) return;
    var rec = null;
    for (var i = 0; i < all.length; i++) if (String(all[i].id) === String(id)) { rec = all[i]; break; }
    if (!rec) return;
    var prev = rec.status || "open";
    var siblings = btn.parentNode ? btn.parentNode.querySelectorAll("button") : [];
    for (var s = 0; s < siblings.length; s++) siblings[s].disabled = true;

    var upd = sb.from("catalog_gaps").update({ status: status }).eq("id", id);
    if (Q.cfg.OWNER) upd = upd.eq("owner", Q.cfg.OWNER);
    upd.select().then(function (res) {
      if (res.error) {
        for (var j = 0; j < siblings.length; j++) siblings[j].disabled = false;
        if (Q.isMissingTable(res.error)) { showMissing(); return; }
        // permission / policy error → display-only mode
        writeBlocked = true; render();
        toast("Read-only: no write access to catalog_gaps.", true);
        return;
      }
      if (!res.data || res.data.length === 0) {
        // RLS filtered the update silently (no authenticated write policy) → display-only
        writeBlocked = true; render();
        toast("Read-only: status is managed by the pipeline.", true);
        return;
      }
      rec.status = status;
      render();
      toast(status === "resolved" ? "Marked as added." : status === "ignored" ? "Gap ignored." : "Gap reopened.");
    }, function () {
      for (var k = 0; k < siblings.length; k++) siblings[k].disabled = false;
      toast("Network error.", true);
    });
  }

  function panel(icon, title, body) {
    return '<div class="ico">' + icon + '</div><h4>' + esc(title) + '</h4><p>' + esc(body) + '</p>';
  }
  function showTableError(msg) {
    var t = el("tableError");
    t.innerHTML = '<div class="ico">' + ICON_WARN + '</div><h4>Couldn’t load gaps</h4><p>' + esc(msg) + '</p>' +
      '<button type="button" id="retryBtn" class="btn btn-primary btn-sm">Try again</button>';
    t.hidden = false; el("tiles").innerHTML = ""; el("gaps").innerHTML = ""; el("emptyState").hidden = true; el("rowCount").textContent = "";
    var rb = el("retryBtn"); if (rb) rb.addEventListener("click", load);
  }
  function showMissing() {
    var t = el("tableError");
    t.innerHTML = '<div class="ico" style="background:var(--row)"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--grey)" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M21 8V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8"/><path d="M1 3h22v5H1z"/></svg></div>' +
      '<h4>Catalogue-gap tracking isn’t switched on yet</h4>' +
      '<p>The <code>catalog_gaps</code> table doesn’t exist. Run <code>quotewright-intelligence.sql</code> in the Supabase SQL editor and this list fills as the pipeline flags uncatalogued requests.</p>';
    t.hidden = false; el("tiles").innerHTML = ""; el("gaps").innerHTML = ""; el("emptyState").hidden = true; el("rowCount").textContent = "";
  }
  function skeleton() {
    el("tiles").innerHTML = '<div class="sk sk-tile"></div>'.repeat(4);
    el("gaps").innerHTML = '<div class="sk sk-row"></div>'.repeat(4);
    el("rowCount").textContent = "Loading…";
  }

  function load() {
    if (loading) return;
    loading = true;
    el("tableError").hidden = true;
    if (!loaded) skeleton(); else el("rowCount").textContent = "Loading…";
    var refresh = el("refreshBtn"); if (refresh) { refresh.classList.add("is-loading"); refresh.textContent = "Refreshing…"; }
    var qy = sb.from("catalog_gaps").select("*").limit(2000);
    if (Q.cfg.OWNER) qy = qy.eq("owner", Q.cfg.OWNER);
    qy.then(function (res) {
      loading = false;
      if (refresh) { refresh.classList.remove("is-loading"); refresh.textContent = "Refresh"; }
      if (res.error) {
        if (Q.isMissingTable(res.error)) { showMissing(); loaded = true; return; }
        showTableError(res.error.message || "Something went wrong reaching the gap store.");
        return;
      }
      all = res.data || [];
      loaded = true;
      render();
    }, function (err) {
      loading = false;
      if (refresh) { refresh.classList.remove("is-loading"); refresh.textContent = "Refresh"; }
      showTableError((err && err.message) || "Network error — check your connection and try again.");
    });
  }
})();
