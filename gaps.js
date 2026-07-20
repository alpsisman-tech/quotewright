/* Catalogue gaps view. Reads public.catalog_gaps (RLS: authenticated SELECT).
   Mark-as-added / ignore attempts an authenticated UPDATE; if RLS has no write policy
   the update affects 0 rows (or errors) → we flip to display-only + explain why.
   Degrades gracefully when the intelligence SQL hasn't been run yet. */
(function () {
  "use strict";
  var Q = window.QWConsole;
  var el = Q.el, esc = Q.esc, num = Q.numOrNull, toast = Q.toast;

  // i18n
  function t(k, v) { return (window.QWI18n && QWI18n.t) ? QWI18n.t(k, v) : k; }
  function rel(s) { return (window.QWI18n && QWI18n.rel) ? QWI18n.rel(s) : Q.relTime(s); }
  if (window.QWI18n && QWI18n.add) QWI18n.add({
    en: {
      "gap.kicker": "Catalogue gaps",
      "gap.h1": "What customers keep asking for",
      "gap.lede": "Requests the catalogue can’t price yet, ranked by how often they come up. The top of this list is the prioritised brief to feed back to the factory — the products worth adding first.",
      "gap.searchPh": "Search gaps…",
      "gap.searchAria": "Search gaps",
      "gap.statusAria": "Filter by status",
      "gap.filter.open": "Open",
      "gap.filter.all": "All statuses",
      "gap.filter.resolved": "Added",
      "gap.filter.ignored": "Ignored",
      "gap.tile.open": "Open gaps",
      "gap.tile.requests": "Total requests",
      "gap.tile.requestsSub": "across open gaps",
      "gap.tile.mostRequested": "Most requested",
      "gap.tile.added": "Added to catalogue",
      "gap.count.total": "{n} total",
      "gap.word.open": "open",
      "gap.word.resolved": "added",
      "gap.word.ignored": "ignored",
      "gap.writeNote": "<b>Read-only here.</b> Gap status is written by the pipeline (service role) — there’s no authenticated write policy on <code lang=\"en\">catalog_gaps</code>, so “Mark added” / “Ignore” can’t change it from the console. The ranking below is still live.",
      "gap.empty.none.t": "No gaps recorded yet",
      "gap.empty.none.b": "Every time a request can’t be priced from the catalogue, it’s logged here and its counter ticks up. Nothing’s been flagged yet.",
      "gap.empty.nomatch.t": "Nothing in this view",
      "gap.empty.nomatch.b": "No gaps match that filter. Try “All statuses” or clear the search.",
      "gap.lastAsked": "Last asked {rel}",
      "gap.egQuote": "e.g. quote {id}",
      "gap.request": "request",
      "gap.requests": "requests",
      "gap.state.open": "Open",
      "gap.btn.markAdded": "Mark added",
      "gap.btn.ignore": "Ignore",
      "gap.pill.added": "Added",
      "gap.pill.ignored": "Ignored",
      "gap.btn.reopen": "Reopen",
      "gap.desc.unspecified": "Unspecified request",
      "gap.toast.addedDemo": "Marked as added · demo — not saved.",
      "gap.toast.ignoredDemo": "Gap ignored · demo.",
      "gap.toast.reopenedDemo": "Gap reopened · demo.",
      "gap.toast.added": "Marked as added.",
      "gap.toast.ignored": "Gap ignored.",
      "gap.toast.reopened": "Gap reopened.",
      "gap.toast.roNoWrite": "Read-only: no write access to catalog_gaps.",
      "gap.toast.roManaged": "Read-only: status is managed by the pipeline.",
      "gap.err.load": "Couldn’t load gaps",
      "gap.err.tryAgain": "Try again",
      "gap.err.generic": "Something went wrong reaching the gap store.",
      "gap.err.network": "Network error — check your connection and try again.",
      "gap.missing.t": "Catalogue-gap tracking isn’t switched on yet",
      "gap.missing.b": "The <code lang=\"en\">catalog_gaps</code> table doesn’t exist. Run <code lang=\"en\">quotewright-intelligence.sql</code> in the Supabase SQL editor and this list fills as the pipeline flags uncatalogued requests."
    },
    tr: {
      "gap.kicker": "Katalog boşlukları",
      "gap.h1": "Müşterilerin sürekli istediği ürünler",
      "gap.lede": "Kataloğun henüz fiyatlandıramadığı talepler, ne sıklıkta geldiklerine göre sıralanır. Bu listenin başı, fabrikaya geri iletilecek öncelikli özettir — önce eklenmeye değer ürünler.",
      "gap.searchPh": "Boşlukları ara…",
      "gap.searchAria": "Boşlukları ara",
      "gap.statusAria": "Duruma göre filtrele",
      "gap.filter.open": "Açık",
      "gap.filter.all": "Tüm durumlar",
      "gap.filter.resolved": "Eklendi",
      "gap.filter.ignored": "Yok sayıldı",
      "gap.tile.open": "Açık boşluklar",
      "gap.tile.requests": "Toplam talep",
      "gap.tile.requestsSub": "açık boşluklar genelinde",
      "gap.tile.mostRequested": "En çok istenen",
      "gap.tile.added": "Kataloğa eklendi",
      "gap.count.total": "{n} toplam",
      "gap.word.open": "açık",
      "gap.word.resolved": "eklendi",
      "gap.word.ignored": "yok sayıldı",
      "gap.writeNote": "<b>Burada salt okunur.</b> Boşluk durumu akış tarafından (service role) yazılır — <code lang=\"en\">catalog_gaps</code> üzerinde kimliği doğrulanmış bir yazma politikası yok, bu yüzden “Eklendi işaretle” / “Yok say” konsoldan değiştirilemez. Aşağıdaki sıralama yine de canlıdır.",
      "gap.empty.none.t": "Henüz kaydedilmiş boşluk yok",
      "gap.empty.none.b": "Bir talep katalogdan fiyatlandırılamadığında burada kaydedilir ve sayacı artar. Henüz hiçbir şey işaretlenmedi.",
      "gap.empty.nomatch.t": "Bu görünümde bir şey yok",
      "gap.empty.nomatch.b": "Bu filtreyle eşleşen boşluk yok. “Tüm durumlar”ı deneyin veya aramayı temizleyin.",
      "gap.lastAsked": "Son sorulma {rel}",
      "gap.egQuote": "örn. teklif {id}",
      "gap.request": "talep",
      "gap.requests": "talep",
      "gap.state.open": "Açık",
      "gap.btn.markAdded": "Eklendi işaretle",
      "gap.btn.ignore": "Yok say",
      "gap.pill.added": "Eklendi",
      "gap.pill.ignored": "Yok sayıldı",
      "gap.btn.reopen": "Yeniden aç",
      "gap.desc.unspecified": "Belirtilmemiş talep",
      "gap.toast.addedDemo": "Eklendi olarak işaretlendi · demo — kaydedilmedi.",
      "gap.toast.ignoredDemo": "Boşluk yok sayıldı · demo.",
      "gap.toast.reopenedDemo": "Boşluk yeniden açıldı · demo.",
      "gap.toast.added": "Eklendi olarak işaretlendi.",
      "gap.toast.ignored": "Boşluk yok sayıldı.",
      "gap.toast.reopened": "Boşluk yeniden açıldı.",
      "gap.toast.roNoWrite": "Salt okunur: catalog_gaps için yazma erişimi yok.",
      "gap.toast.roManaged": "Salt okunur: durum akış tarafından yönetilir.",
      "gap.err.load": "Boşluklar yüklenemedi",
      "gap.err.tryAgain": "Tekrar dene",
      "gap.err.generic": "Boşluk deposuna erişilirken bir sorun oluştu.",
      "gap.err.network": "Ağ hatası — bağlantınızı kontrol edip tekrar deneyin.",
      "gap.missing.t": "Katalog boşluğu takibi henüz açık değil",
      "gap.missing.b": "<code lang=\"en\">catalog_gaps</code> tablosu mevcut değil. Supabase SQL düzenleyicisinde <code lang=\"en\">quotewright-intelligence.sql</code> dosyasını çalıştırın; akış katalogda olmayan talepleri işaretledikçe bu liste dolar."
    }
  });

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

  // Re-render live when the UI language changes (no refetch).
  window.addEventListener("qw:langchange", function () { if (loaded) render(); });

  function renderTiles() {
    var open = all.filter(function (g) { return (g.status || "open") === "open"; });
    var reqs = open.reduce(function (s, g) { return s + (num(g.count) || 0); }, 0);
    var top = open.reduce(function (m, g) { return (num(g.count) || 0) > (num(m.count) || 0) ? g : m; }, { count: 0 });
    var resolved = all.filter(function (g) { return g.status === "resolved"; }).length;
    var tiles = [
      { n: open.length, l: t("gap.tile.open") },
      { n: reqs, l: t("gap.tile.requests"), sub2: t("gap.tile.requestsSub") },
      { n: num(top.count) || 0, l: t("gap.tile.mostRequested"), accent: (num(top.count) || 0) > 0, sub2: top.description ? clip(top.description, 34) : "" },
      { n: resolved, l: t("gap.tile.added") }
    ];
    el("tiles").innerHTML = tiles.map(function (tl) {
      return '<div class="qc-tile' + (tl.accent ? " accent" : "") + '">' +
        '<div class="n">' + esc(tl.n) + '</div><div class="l">' + esc(tl.l) + '</div>' +
        (tl.sub2 ? '<div class="sub2">' + esc(tl.sub2) + '</div>' : '') + '</div>';
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
    el("rowCount").textContent = status === "all"
      ? t("gap.count.total", { n: list.length })
      : list.length + " " + t("gap.word." + status);

    el("writeNote").hidden = !writeBlocked;
    if (writeBlocked) el("writeNote").innerHTML = ICON_INFO + '<span>' + t("gap.writeNote") + '</span>';

    var empty = el("emptyState"), gapsEl = el("gaps");
    if (list.length === 0) {
      gapsEl.innerHTML = "";
      empty.hidden = false;
      if (all.length === 0) {
        empty.innerHTML = panel(ICON_BOX, t("gap.empty.none.t"), t("gap.empty.none.b"));
      } else {
        empty.innerHTML = panel(ICON_FILTER, t("gap.empty.nomatch.t"), t("gap.empty.nomatch.b"));
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
      if (g.request_signature) meta.push('<span class="qc-gap-sig" lang="en">' + esc(g.request_signature) + '</span>');
      if (g.last_requested) meta.push('<span>' + t("gap.lastAsked", { rel: esc(rel(g.last_requested)) }) + '</span>');
      if (g.example_quote_id) meta.push('<span>' + t("gap.egQuote", { id: '<span lang="en">' + esc(clip(g.example_quote_id, 12)) + '</span>' }) + '</span>');
      var actions;
      if (st === "open") {
        actions = writeBlocked
          ? '<span class="qc-gap-state">' + esc(t("gap.state.open")) + '</span>'
          : '<button class="qc-gap-btn add" data-id="' + esc(g.id) + '" data-act="resolved">' +
              '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5L20 7"/></svg>' + esc(t("gap.btn.markAdded")) + '</button>' +
            '<button class="qc-gap-btn ignore" data-id="' + esc(g.id) + '" data-act="ignored">' + esc(t("gap.btn.ignore")) + '</button>';
      } else {
        actions = '<span class="pill ' + esc(st) + '">' + esc(st === "resolved" ? t("gap.pill.added") : t("gap.pill.ignored")) + '</span>' +
          (writeBlocked ? '' : '<button class="qc-gap-btn ignore" data-id="' + esc(g.id) + '" data-act="open">' + esc(t("gap.btn.reopen")) + '</button>');
      }
      return '<div class="qc-gap ' + (st === "resolved" ? "is-resolved" : st === "ignored" ? "is-ignored" : "") + '">' +
        '<div class="qc-gap-count"><div class="cn">' + n + '</div><div class="cl">' + esc(n === 1 ? t("gap.request") : t("gap.requests")) + '</div>' +
          '<div class="bar" style="transform:scaleX(' + (pct / 100).toFixed(2) + ')"></div></div>' +
        '<div class="qc-gap-main"><h3 class="qc-gap-desc" lang="en">' + esc(g.description || g.request_signature || t("gap.desc.unspecified")) + '</h3>' +
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
    if (window.QWDemo && QWDemo.isOn()) {
      rec.status = status; render();
      toast(status === "resolved" ? t("gap.toast.addedDemo") : status === "ignored" ? t("gap.toast.ignoredDemo") : t("gap.toast.reopenedDemo"));
      return;
    }
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
        toast(t("gap.toast.roNoWrite"), true);
        return;
      }
      if (!res.data || res.data.length === 0) {
        // RLS filtered the update silently (no authenticated write policy) → display-only
        writeBlocked = true; render();
        toast(t("gap.toast.roManaged"), true);
        return;
      }
      rec.status = status;
      render();
      toast(status === "resolved" ? t("gap.toast.added") : status === "ignored" ? t("gap.toast.ignored") : t("gap.toast.reopened"));
    }, function () {
      for (var k = 0; k < siblings.length; k++) siblings[k].disabled = false;
      toast(t("common.networkError"), true);
    });
  }

  function panel(icon, title, body) {
    return '<div class="ico">' + icon + '</div><h4>' + esc(title) + '</h4><p>' + esc(body) + '</p>';
  }
  function showTableError(msg) {
    var t2 = el("tableError");
    t2.innerHTML = '<div class="ico">' + ICON_WARN + '</div><h4>' + esc(t("gap.err.load")) + '</h4><p>' + esc(msg) + '</p>' +
      '<button type="button" id="retryBtn" class="btn btn-primary btn-sm">' + esc(t("gap.err.tryAgain")) + '</button>';
    t2.hidden = false; el("tiles").innerHTML = ""; el("gaps").innerHTML = ""; el("emptyState").hidden = true; el("rowCount").textContent = "";
    var rb = el("retryBtn"); if (rb) rb.addEventListener("click", load);
  }
  function showMissing() {
    var t2 = el("tableError");
    t2.innerHTML = '<div class="ico" style="background:var(--row)"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--grey)" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M21 8V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8"/><path d="M1 3h22v5H1z"/></svg></div>' +
      '<h4>' + esc(t("gap.missing.t")) + '</h4>' +
      '<p>' + t("gap.missing.b") + '</p>';
    t2.hidden = false; el("tiles").innerHTML = ""; el("gaps").innerHTML = ""; el("emptyState").hidden = true; el("rowCount").textContent = "";
  }
  function skeleton() {
    el("tiles").innerHTML = '<div class="sk sk-tile"></div>'.repeat(4);
    el("gaps").innerHTML = '<div class="sk sk-row"></div>'.repeat(4);
    el("rowCount").textContent = t("common.loading");
  }

  function load() {
    if (loading) return;
    // DEMO MODE (tour): sample catalogue gaps, never touch Supabase.
    if (window.QWDemo && QWDemo.isOn()) {
      all = QWDemo.gaps(); loaded = true; loading = false;
      el("tableError").hidden = true; render(); return;
    }
    loading = true;
    el("tableError").hidden = true;
    if (!loaded) skeleton(); else el("rowCount").textContent = t("common.loading");
    var refresh = el("refreshBtn"); if (refresh) { refresh.classList.add("is-loading"); refresh.textContent = t("common.refreshing"); }
    var qy = sb.from("catalog_gaps").select("*").limit(2000);
    if (Q.cfg.OWNER) qy = qy.eq("owner", Q.cfg.OWNER);
    qy.then(function (res) {
      loading = false;
      if (refresh) { refresh.classList.remove("is-loading"); refresh.textContent = t("common.refresh"); }
      if (res.error) {
        if (Q.isMissingTable(res.error)) { showMissing(); loaded = true; return; }
        showTableError(res.error.message || t("gap.err.generic"));
        return;
      }
      all = res.data || [];
      loaded = true;
      render();
    }, function (err) {
      loading = false;
      if (refresh) { refresh.classList.remove("is-loading"); refresh.textContent = t("common.refresh"); }
      showTableError((err && err.message) || t("gap.err.network"));
    });
  }
})();
