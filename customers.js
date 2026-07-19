/* Customer memory view. Reads public.customers (RLS: authenticated SELECT).
   Degrades gracefully when the intelligence SQL hasn't been run yet. */
(function () {
  "use strict";
  var Q = window.QWConsole;
  var el = Q.el, esc = Q.esc, num = Q.numOrNull, toast = Q.toast;
  var sb = null;
  var rows = [];
  var loaded = false, loading = false;

  var ICON_USERS = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13A4 4 0 0 1 16 11"/></svg>';
  var ICON_FILTER = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3 5h18l-7 8v5l-4 2v-7L3 5z"/></svg>';
  var ICON_WARN = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9 2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/></svg>';
  var ICON_CHEV = '<svg class="qc-chev" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>';

  Q.boot({ onAuth: function (client) {
    sb = client;
    el("subnav").hidden = false;
    el("refreshBtn").addEventListener("click", load);
    el("search").addEventListener("input", render);
    el("sortSel").addEventListener("change", render);
    el("custBody").addEventListener("click", function (e) {
      var tr = e.target.closest ? e.target.closest("tr[data-id]") : null;
      if (tr) openDrawer(tr.getAttribute("data-id"));
    });
    var dlg = el("drawer");
    dlg.addEventListener("click", function (e) {
      // click on backdrop (outside the inner panel) closes
      if (e.target === dlg) dlg.close();
      var c = e.target.closest ? e.target.closest("[data-close]") : null;
      if (c) dlg.close();
    });
    load();
  }});

  function displayName(c) { return c.name || c.email || c.domain || "Unnamed customer"; }

  function renderTiles() {
    var total = rows.length;
    var repeat = rows.filter(function (c) { return (num(c.quote_count) || 0) > 1; }).length;
    var orders = rows.reduce(function (s, c) { return s + (num(c.order_count) || 0); }, 0);
    var quotes = rows.reduce(function (s, c) { return s + (num(c.quote_count) || 0); }, 0);
    var tiles = [
      { n: total, l: "Customers remembered" },
      { n: repeat, l: "Repeat customers", accent: repeat > 0, sub2: total ? Math.round(repeat / total * 100) + "% of the book" : "" },
      { n: quotes, l: "Quotes on record" },
      { n: orders, l: "Orders logged" }
    ];
    el("tiles").innerHTML = tiles.map(function (t) {
      return '<div class="qc-tile' + (t.accent ? " accent" : "") + '">' +
        '<div class="n">' + esc(t.n) + '</div><div class="l">' + esc(t.l) + '</div>' +
        (t.sub2 ? '<div class="sub2">' + esc(t.sub2) + '</div>' : '') + '</div>';
    }).join("");
  }

  function sorted(list) {
    var s = el("sortSel").value;
    var a = list.slice();
    a.sort(function (x, y) {
      if (s === "quotes") return (num(y.quote_count) || 0) - (num(x.quote_count) || 0);
      if (s === "orders") return (num(y.order_count) || 0) - (num(x.order_count) || 0);
      if (s === "name") return displayName(x).localeCompare(displayName(y));
      // recent
      return new Date(y.last_seen || 0) - new Date(x.last_seen || 0);
    });
    return a;
  }

  function render() {
    if (!loaded) return;
    renderTiles();
    var q = (el("search").value || "").trim().toLowerCase();
    var list = rows.filter(function (c) {
      if (!q) return true;
      return (displayName(c) + " " + (c.email || "") + " " + (c.domain || "") + " " + (c.sap_code || ""))
        .toLowerCase().indexOf(q) !== -1;
    });
    list = sorted(list);
    el("rowCount").textContent = list.length + " of " + rows.length;

    var empty = el("emptyState");
    if (list.length === 0) {
      empty.hidden = false;
      if (rows.length === 0) {
        empty.innerHTML = panel(ICON_USERS, "No customers yet",
          "Once the pipeline quotes a request, the sender is remembered here — counts, currency and colour preferences included. This fills in as real RFQs arrive.");
      } else {
        empty.innerHTML = panel(ICON_FILTER, "No matches", "No customer matches that search. Clear it to see the whole book.");
      }
    } else { empty.hidden = true; }

    el("custBody").innerHTML = list.map(function (c) {
      var qn = num(c.quote_count) || 0, on = num(c.order_count) || 0;
      var badge = qn > 1 ? '<span class="pill repeat">Repeat</span>' : '<span class="pill new">First-time</span>';
      return '<tr data-id="' + esc(c.id) + '" tabindex="0">' +
        '<td><span class="qc-cust-name">' + esc(displayName(c)) + '</span> ' + badge +
          (c.domain ? '<span class="qc-cust-sub">' + esc(c.domain) + '</span>' : '') + '</td>' +
        '<td>' + (c.email ? esc(c.email) : '<span class="qc-mut">—</span>') + '</td>' +
        '<td class="num qc-num-strong">' + qn + '</td>' +
        '<td class="num qc-num-strong">' + on + '</td>' +
        '<td>' + (c.currency_pref ? '<span class="qc-cur">' + esc(c.currency_pref) + '</span>' : '<span class="qc-mut">—</span>') + '</td>' +
        '<td>' + esc(Q.relTime(c.last_seen)) + '</td>' +
        '<td class="num">' + ICON_CHEV + '</td>' +
      '</tr>';
    }).join("");
  }

  function openDrawer(id) {
    var c = null;
    for (var i = 0; i < rows.length; i++) if (String(rows[i].id) === String(id)) { c = rows[i]; break; }
    if (!c) return;
    var prefs = Q.parseJson(c.preferences, {}) || {};
    var hist = Q.parseJson(c.history, []) || [];
    if (!Array.isArray(hist)) hist = [];

    var facts = [
      { k: "Quotes", v: num(c.quote_count) || 0 },
      { k: "Orders", v: num(c.order_count) || 0 },
      { k: "First seen", v: Q.fmtDate(c.first_seen) },
      { k: "Last seen", v: Q.fmtDate(c.last_seen) }
    ];
    if (c.currency_pref) facts.push({ k: "Preferred currency", v: esc(c.currency_pref) });
    if (c.sap_code) facts.push({ k: "SAP code", v: esc(c.sap_code) });
    var factHtml = facts.map(function (f, i) {
      return '<div class="qc-fact' + ((facts.length % 2 && i === facts.length - 1) ? ' wide' : '') + '">' +
        '<div class="k">' + esc(f.k) + '</div><div class="v">' + f.v + '</div></div>';
    }).join("");
    if (c.email) factHtml += '<div class="qc-fact wide"><div class="k">Email</div><div class="v">' + esc(c.email) + '</div></div>';

    var prefKeys = Object.keys(prefs);
    var prefsHtml = prefKeys.length ? '<div class="qc-sec-title">Learned preferences</div><div class="qc-prefs">' +
      prefKeys.map(function (k) {
        var val = prefs[k];
        if (val && typeof val === "object") val = JSON.stringify(val);
        return '<span class="qc-chipk"><span class="k">' + esc(k) + '</span><b>' + esc(val) + '</b></span>';
      }).join("") + '</div>' : '';

    var histHtml = hist.length ? '<div class="qc-sec-title">Recent products</div><ul class="qc-hist">' +
      hist.slice(0, 12).map(function (h) {
        var p = (typeof h === "string") ? h : (h.product || h.name || h.sku || h.description || "—");
        var when = (h && h.date) ? Q.fmtDate(h.date) : (h && h.at ? Q.fmtDate(h.at) : "");
        return '<li><span class="qc-hp">' + esc(p) + '</span>' + (when ? '<span class="qc-hd">' + esc(when) + '</span>' : '') + '</li>';
      }).join("") + '</ul>' : '';

    var notesHtml = c.notes ? '<div class="qc-sec-title">Notes</div><div class="qc-notes">' + esc(c.notes) + '</div>' : '';
    if (!prefsHtml && !histHtml && !notesHtml) {
      histHtml = '<p class="qc-lede" style="font-size:13.5px">No preferences or history stored for this customer yet — they build up as the pipeline quotes them again.</p>';
    }

    el("drawer").innerHTML =
      '<div class="qc-drawer-inner">' +
        '<div class="qc-drawer-head">' +
          '<div><h2>' + esc(displayName(c)) + '</h2>' +
            (c.domain ? '<span class="qc-cust-sub">' + esc(c.domain) + '</span>' : '') +
            ((num(c.quote_count) || 0) > 1 ? ' <span class="pill repeat">Repeat customer</span>' : '') + '</div>' +
          '<button class="qc-drawer-close" data-close aria-label="Close">' +
            '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button>' +
        '</div>' +
        '<div class="qc-drawer-body">' +
          '<div class="qc-facts">' + factHtml + '</div>' +
          prefsHtml + histHtml + notesHtml +
        '</div>' +
      '</div>';
    var dlg = el("drawer");
    if (dlg.showModal) dlg.showModal(); else dlg.setAttribute("open", "");
  }

  function panel(icon, title, body) {
    return '<div class="ico">' + icon + '</div><h4>' + esc(title) + '</h4><p>' + esc(body) + '</p>';
  }
  function showTableError(msg) {
    var t = el("tableError");
    t.innerHTML = '<div class="ico">' + ICON_WARN + '</div><h4>Couldn’t load customers</h4><p>' + esc(msg) + '</p>' +
      '<button type="button" id="retryBtn" class="btn btn-primary btn-sm">Try again</button>';
    t.hidden = false;
    el("tiles").innerHTML = "";
    el("custTable").style.display = "none";
    el("emptyState").hidden = true;
    el("rowCount").textContent = "";
    var rb = el("retryBtn"); if (rb) rb.addEventListener("click", load);
  }
  function showMissing() {
    var t = el("tableError");
    t.innerHTML = '<div class="ico" style="background:var(--row)"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--grey)" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="6" rx="8" ry="3"/><path d="M4 6v6c0 1.66 3.58 3 8 3s8-1.34 8-3V6M4 12v6c0 1.66 3.58 3 8 3s8-1.34 8-3v-6"/></svg></div>' +
      '<h4>Customer memory isn’t switched on yet</h4>' +
      '<p>The <code>customers</code> table doesn’t exist. Run <code>quotewright-intelligence.sql</code> in the Supabase SQL editor and this view lights up automatically.</p>';
    t.hidden = false;
    el("tiles").innerHTML = "";
    el("custTable").style.display = "none";
    el("emptyState").hidden = true;
    el("rowCount").textContent = "";
  }
  function skeleton() {
    el("tiles").innerHTML = '<div class="sk sk-tile"></div>'.repeat(4);
    el("custBody").innerHTML = '<tr><td colspan="7" style="padding:0"><div class="sk sk-row" style="margin:12px 16px"></div><div class="sk sk-row" style="margin:0 16px 12px"></div></td></tr>';
    el("rowCount").textContent = "Loading…";
  }

  function load() {
    if (loading) return;
    // DEMO MODE (tour): sample customers, never touch Supabase.
    if (window.QWDemo && QWDemo.isOn()) {
      rows = QWDemo.customers(); loaded = true; loading = false;
      el("tableError").hidden = true; el("custTable").style.display = "";
      render(); return;
    }
    loading = true;
    el("tableError").hidden = true;
    el("custTable").style.display = "";
    if (!loaded) skeleton(); else el("rowCount").textContent = "Loading…";
    var refresh = el("refreshBtn"); if (refresh) { refresh.classList.add("is-loading"); refresh.textContent = "Refreshing…"; }
    var qy = sb.from("customers").select("*").limit(2000);
    if (Q.cfg.OWNER) qy = qy.eq("owner", Q.cfg.OWNER);
    qy.then(function (res) {
      loading = false;
      if (refresh) { refresh.classList.remove("is-loading"); refresh.textContent = "Refresh"; }
      if (res.error) {
        if (Q.isMissingTable(res.error)) { showMissing(); loaded = true; return; }
        showTableError(res.error.message || "Something went wrong reaching the customer store.");
        return;
      }
      rows = res.data || [];
      loaded = true;
      render();
    }, function (err) {
      loading = false;
      if (refresh) { refresh.classList.remove("is-loading"); refresh.textContent = "Refresh"; }
      showTableError((err && err.message) || "Network error — check your connection and try again.");
    });
  }
})();
