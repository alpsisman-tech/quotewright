/* Customer memory view. Reads public.customers (RLS: authenticated SELECT).
   Degrades gracefully when the intelligence SQL hasn't been run yet. */
(function () {
  "use strict";
  var Q = window.QWConsole;
  var el = Q.el, esc = Q.esc, num = Q.numOrNull, toast = Q.toast;

  // i18n
  function t(k, v) { return (window.QWI18n && QWI18n.t) ? QWI18n.t(k, v) : k; }
  function rel(s) { return (window.QWI18n && QWI18n.rel) ? QWI18n.rel(s) : Q.relTime(s); }
  function fdate(s) { return (window.QWI18n && QWI18n.date) ? QWI18n.date(s) : Q.fmtDate(s); }
  if (window.QWI18n && QWI18n.add) QWI18n.add({
    en: {
      "cust.kicker": "Customer memory",
      "cust.h1": "Customers we remember",
      "cust.lede": "Every customer the RFQ pipeline has quoted, with their history and learned preferences. Recurring buyers are recognised on sight — currency, colours and past products carry over.",
      "cust.searchPh": "Search name, email or domain…",
      "cust.searchAria": "Search customers",
      "cust.sortAria": "Sort customers",
      "cust.sort.recent": "Recently seen",
      "cust.sort.quotes": "Most quotes",
      "cust.sort.orders": "Most orders",
      "cust.sort.name": "Name A–Z",
      "cust.th.customer": "Customer",
      "cust.th.email": "Email",
      "cust.th.quotes": "Quotes",
      "cust.th.orders": "Orders",
      "cust.th.currency": "Currency",
      "cust.th.lastSeen": "Last seen",
      "cust.th.open": "Open",
      "cust.tile.remembered": "Customers remembered",
      "cust.tile.repeat": "Repeat customers",
      "cust.tile.bookPct": "{pct}% of the book",
      "cust.tile.quotes": "Quotes on record",
      "cust.tile.orders": "Orders logged",
      "cust.badge.repeat": "Repeat",
      "cust.badge.first": "First-time",
      "cust.unnamed": "Unnamed customer",
      "cust.countOf": "{n} of {total}",
      "cust.empty.none.t": "No customers yet",
      "cust.empty.none.b": "Once the pipeline quotes a request, the sender is remembered here — counts, currency and colour preferences included. This fills in as real RFQs arrive.",
      "cust.empty.nomatch.t": "No matches",
      "cust.empty.nomatch.b": "No customer matches that search. Clear it to see the whole book.",
      "cust.fact.quotes": "Quotes",
      "cust.fact.orders": "Orders",
      "cust.fact.firstSeen": "First seen",
      "cust.fact.lastSeen": "Last seen",
      "cust.fact.currency": "Preferred currency",
      "cust.fact.sap": "SAP code",
      "cust.fact.email": "Email",
      "cust.repeatCustomer": "Repeat customer",
      "cust.prefs.title": "Learned preferences",
      "cust.hist.title": "Recent products",
      "cust.notes.title": "Notes",
      "cust.noHistory": "No preferences or history stored for this customer yet — they build up as the pipeline quotes them again.",
      "cust.err.load": "Couldn’t load customers",
      "cust.err.tryAgain": "Try again",
      "cust.err.generic": "Something went wrong reaching the customer store.",
      "cust.err.network": "Network error — check your connection and try again.",
      "cust.missing.t": "Customer memory isn’t switched on yet",
      "cust.missing.b": "The <code lang=\"en\">customers</code> table doesn’t exist. Run <code lang=\"en\">quotewright-intelligence.sql</code> in the Supabase SQL editor and this view lights up automatically."
    },
    tr: {
      "cust.kicker": "Müşteri belleği",
      "cust.h1": "Hatırladığımız müşteriler",
      "cust.lede": "RFQ akışının teklif verdiği her müşteri; geçmişleri ve öğrenilen tercihleriyle birlikte. Tekrar eden alıcılar ilk bakışta tanınır — para birimi, renkler ve geçmiş ürünler taşınır.",
      "cust.searchPh": "İsim, e-posta veya alan adı ara…",
      "cust.searchAria": "Müşteri ara",
      "cust.sortAria": "Müşterileri sırala",
      "cust.sort.recent": "Son görülen",
      "cust.sort.quotes": "En çok teklif",
      "cust.sort.orders": "En çok sipariş",
      "cust.sort.name": "İsim A–Z",
      "cust.th.customer": "Müşteri",
      "cust.th.email": "E-posta",
      "cust.th.quotes": "Teklifler",
      "cust.th.orders": "Siparişler",
      "cust.th.currency": "Para birimi",
      "cust.th.lastSeen": "Son görülme",
      "cust.th.open": "Aç",
      "cust.tile.remembered": "Hatırlanan müşteriler",
      "cust.tile.repeat": "Tekrar eden müşteriler",
      "cust.tile.bookPct": "kayıtların %{pct}’i",
      "cust.tile.quotes": "Kayıtlı teklifler",
      "cust.tile.orders": "Kaydedilen siparişler",
      "cust.badge.repeat": "Tekrar",
      "cust.badge.first": "İlk kez",
      "cust.unnamed": "İsimsiz müşteri",
      "cust.countOf": "{total} içinden {n}",
      "cust.empty.none.t": "Henüz müşteri yok",
      "cust.empty.none.b": "Akış bir talebe teklif verdiğinde, gönderen burada hatırlanır — adetler, para birimi ve renk tercihleri dahil. Gerçek RFQ’lar geldikçe burası dolar.",
      "cust.empty.nomatch.t": "Eşleşme yok",
      "cust.empty.nomatch.b": "Bu aramayla eşleşen müşteri yok. Tümünü görmek için aramayı temizleyin.",
      "cust.fact.quotes": "Teklifler",
      "cust.fact.orders": "Siparişler",
      "cust.fact.firstSeen": "İlk görülme",
      "cust.fact.lastSeen": "Son görülme",
      "cust.fact.currency": "Tercih edilen para birimi",
      "cust.fact.sap": "SAP kodu",
      "cust.fact.email": "E-posta",
      "cust.repeatCustomer": "Tekrar eden müşteri",
      "cust.prefs.title": "Öğrenilen tercihler",
      "cust.hist.title": "Son ürünler",
      "cust.notes.title": "Notlar",
      "cust.noHistory": "Bu müşteri için henüz kayıtlı tercih veya geçmiş yok — akış onlara tekrar teklif verdikçe birikir.",
      "cust.err.load": "Müşteriler yüklenemedi",
      "cust.err.tryAgain": "Tekrar dene",
      "cust.err.generic": "Müşteri deposuna erişilirken bir sorun oluştu.",
      "cust.err.network": "Ağ hatası — bağlantınızı kontrol edip tekrar deneyin.",
      "cust.missing.t": "Müşteri belleği henüz açık değil",
      "cust.missing.b": "<code lang=\"en\">customers</code> tablosu mevcut değil. Supabase SQL düzenleyicisinde <code lang=\"en\">quotewright-intelligence.sql</code> dosyasını çalıştırın; bu görünüm otomatik olarak devreye girer."
    }
  });

  var sb = null;
  var rows = [];
  var loaded = false, loading = false;
  var openId = null;

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

  // Re-render live when the UI language changes (no refetch).
  window.addEventListener("qw:langchange", function () {
    if (loaded) render();
    var dlg = el("drawer");
    if (dlg && dlg.open && openId != null) openDrawer(openId);
  });

  function displayName(c) { return c.name || c.email || c.domain || t("cust.unnamed"); }

  function renderTiles() {
    var total = rows.length;
    var repeat = rows.filter(function (c) { return (num(c.quote_count) || 0) > 1; }).length;
    var orders = rows.reduce(function (s, c) { return s + (num(c.order_count) || 0); }, 0);
    var quotes = rows.reduce(function (s, c) { return s + (num(c.quote_count) || 0); }, 0);
    var tiles = [
      { n: total, l: t("cust.tile.remembered") },
      { n: repeat, l: t("cust.tile.repeat"), accent: repeat > 0, sub2: total ? t("cust.tile.bookPct", { pct: Math.round(repeat / total * 100) }) : "" },
      { n: quotes, l: t("cust.tile.quotes") },
      { n: orders, l: t("cust.tile.orders") }
    ];
    el("tiles").innerHTML = tiles.map(function (tl) {
      return '<div class="qc-tile' + (tl.accent ? " accent" : "") + '">' +
        '<div class="n">' + esc(tl.n) + '</div><div class="l">' + esc(tl.l) + '</div>' +
        (tl.sub2 ? '<div class="sub2">' + esc(tl.sub2) + '</div>' : '') + '</div>';
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
    el("rowCount").textContent = t("cust.countOf", { n: list.length, total: rows.length });

    var empty = el("emptyState");
    if (list.length === 0) {
      empty.hidden = false;
      if (rows.length === 0) {
        empty.innerHTML = panel(ICON_USERS, t("cust.empty.none.t"), t("cust.empty.none.b"));
      } else {
        empty.innerHTML = panel(ICON_FILTER, t("cust.empty.nomatch.t"), t("cust.empty.nomatch.b"));
      }
    } else { empty.hidden = true; }

    el("custBody").innerHTML = list.map(function (c) {
      var qn = num(c.quote_count) || 0, on = num(c.order_count) || 0;
      var badge = qn > 1 ? '<span class="pill repeat">' + esc(t("cust.badge.repeat")) + '</span>'
                         : '<span class="pill new">' + esc(t("cust.badge.first")) + '</span>';
      return '<tr data-id="' + esc(c.id) + '" tabindex="0">' +
        '<td><span class="qc-cust-name" lang="en">' + esc(displayName(c)) + '</span> ' + badge +
          (c.domain ? '<span class="qc-cust-sub" lang="en">' + esc(c.domain) + '</span>' : '') + '</td>' +
        '<td lang="en">' + (c.email ? esc(c.email) : '<span class="qc-mut">—</span>') + '</td>' +
        '<td class="num qc-num-strong">' + qn + '</td>' +
        '<td class="num qc-num-strong">' + on + '</td>' +
        '<td>' + (c.currency_pref ? '<span class="qc-cur" lang="en">' + esc(c.currency_pref) + '</span>' : '<span class="qc-mut">—</span>') + '</td>' +
        '<td>' + esc(rel(c.last_seen)) + '</td>' +
        '<td class="num">' + ICON_CHEV + '</td>' +
      '</tr>';
    }).join("");
  }

  function openDrawer(id) {
    var c = null;
    for (var i = 0; i < rows.length; i++) if (String(rows[i].id) === String(id)) { c = rows[i]; break; }
    if (!c) return;
    openId = id;
    var prefs = Q.parseJson(c.preferences, {}) || {};
    var hist = Q.parseJson(c.history, []) || [];
    if (!Array.isArray(hist)) hist = [];

    var facts = [
      { k: t("cust.fact.quotes"), v: num(c.quote_count) || 0 },
      { k: t("cust.fact.orders"), v: num(c.order_count) || 0 },
      { k: t("cust.fact.firstSeen"), v: fdate(c.first_seen) },
      { k: t("cust.fact.lastSeen"), v: fdate(c.last_seen) }
    ];
    if (c.currency_pref) facts.push({ k: t("cust.fact.currency"), v: '<span lang="en">' + esc(c.currency_pref) + '</span>' });
    if (c.sap_code) facts.push({ k: t("cust.fact.sap"), v: '<span lang="en">' + esc(c.sap_code) + '</span>' });
    var factHtml = facts.map(function (f, i) {
      return '<div class="qc-fact' + ((facts.length % 2 && i === facts.length - 1) ? ' wide' : '') + '">' +
        '<div class="k">' + esc(f.k) + '</div><div class="v">' + f.v + '</div></div>';
    }).join("");
    if (c.email) factHtml += '<div class="qc-fact wide"><div class="k">' + esc(t("cust.fact.email")) + '</div><div class="v" lang="en">' + esc(c.email) + '</div></div>';

    var prefKeys = Object.keys(prefs);
    var prefsHtml = prefKeys.length ? '<div class="qc-sec-title">' + esc(t("cust.prefs.title")) + '</div><div class="qc-prefs">' +
      prefKeys.map(function (k) {
        var val = prefs[k];
        if (val && typeof val === "object") val = JSON.stringify(val);
        return '<span class="qc-chipk"><span class="k" lang="en">' + esc(k) + '</span><b lang="en">' + esc(val) + '</b></span>';
      }).join("") + '</div>' : '';

    var histHtml = hist.length ? '<div class="qc-sec-title">' + esc(t("cust.hist.title")) + '</div><ul class="qc-hist">' +
      hist.slice(0, 12).map(function (h) {
        var p = (typeof h === "string") ? h : (h.product || h.name || h.sku || h.description || "—");
        var when = (h && h.date) ? fdate(h.date) : (h && h.at ? fdate(h.at) : "");
        return '<li><span class="qc-hp" lang="en">' + esc(p) + '</span>' + (when ? '<span class="qc-hd">' + esc(when) + '</span>' : '') + '</li>';
      }).join("") + '</ul>' : '';

    var notesHtml = c.notes ? '<div class="qc-sec-title">' + esc(t("cust.notes.title")) + '</div><div class="qc-notes">' + esc(c.notes) + '</div>' : '';
    if (!prefsHtml && !histHtml && !notesHtml) {
      histHtml = '<p class="qc-lede" style="font-size:13.5px">' + esc(t("cust.noHistory")) + '</p>';
    }

    el("drawer").innerHTML =
      '<div class="qc-drawer-inner">' +
        '<div class="qc-drawer-head">' +
          '<div><h2 lang="en">' + esc(displayName(c)) + '</h2>' +
            (c.domain ? '<span class="qc-cust-sub" lang="en">' + esc(c.domain) + '</span>' : '') +
            ((num(c.quote_count) || 0) > 1 ? ' <span class="pill repeat">' + esc(t("cust.repeatCustomer")) + '</span>' : '') + '</div>' +
          '<button class="qc-drawer-close" data-close aria-label="' + esc(t("common.close")) + '">' +
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
    var t2 = el("tableError");
    t2.innerHTML = '<div class="ico">' + ICON_WARN + '</div><h4>' + esc(t("cust.err.load")) + '</h4><p>' + esc(msg) + '</p>' +
      '<button type="button" id="retryBtn" class="btn btn-primary btn-sm">' + esc(t("cust.err.tryAgain")) + '</button>';
    t2.hidden = false;
    el("tiles").innerHTML = "";
    el("custTable").style.display = "none";
    el("emptyState").hidden = true;
    el("rowCount").textContent = "";
    var rb = el("retryBtn"); if (rb) rb.addEventListener("click", load);
  }
  function showMissing() {
    var t2 = el("tableError");
    t2.innerHTML = '<div class="ico" style="background:var(--row)"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--grey)" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="6" rx="8" ry="3"/><path d="M4 6v6c0 1.66 3.58 3 8 3s8-1.34 8-3V6M4 12v6c0 1.66 3.58 3 8 3s8-1.34 8-3v-6"/></svg></div>' +
      '<h4>' + esc(t("cust.missing.t")) + '</h4>' +
      '<p>' + t("cust.missing.b") + '</p>';
    t2.hidden = false;
    el("tiles").innerHTML = "";
    el("custTable").style.display = "none";
    el("emptyState").hidden = true;
    el("rowCount").textContent = "";
  }
  function skeleton() {
    el("tiles").innerHTML = '<div class="sk sk-tile"></div>'.repeat(4);
    el("custBody").innerHTML = '<tr><td colspan="7" style="padding:0"><div class="sk sk-row" style="margin:12px 16px"></div><div class="sk sk-row" style="margin:0 16px 12px"></div></td></tr>';
    el("rowCount").textContent = t("common.loading");
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
    if (!loaded) skeleton(); else el("rowCount").textContent = t("common.loading");
    var refresh = el("refreshBtn"); if (refresh) { refresh.classList.add("is-loading"); refresh.textContent = t("common.refreshing"); }
    var qy = sb.from("customers").select("*").limit(2000);
    if (Q.cfg.OWNER) qy = qy.eq("owner", Q.cfg.OWNER);
    qy.then(function (res) {
      loading = false;
      if (refresh) { refresh.classList.remove("is-loading"); refresh.textContent = t("common.refresh"); }
      if (res.error) {
        if (Q.isMissingTable(res.error)) { showMissing(); loaded = true; return; }
        showTableError(res.error.message || t("cust.err.generic"));
        return;
      }
      rows = res.data || [];
      loaded = true;
      render();
    }, function (err) {
      loading = false;
      if (refresh) { refresh.classList.remove("is-loading"); refresh.textContent = t("common.refresh"); }
      showTableError((err && err.message) || t("cust.err.network"));
    });
  }
})();
