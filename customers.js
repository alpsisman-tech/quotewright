/* Customer memory view. Reads public.customers (RLS: authenticated SELECT) and — once
   clients-page.sql has been applied — EDITS and DELETES them (RLS: authenticated
   UPDATE/DELETE scoped to the owner).
   Degrades gracefully when the intelligence SQL hasn't been run yet, and when
   clients-page.sql (the `deleted_at` column + write policies) hasn't been run yet: in
   that case the view stays read-only and says so.

   CSP: the site sets script-src 'self' — every handler here is attached in JS by
   delegation. Never introduce inline onclick/onchange attributes. */
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
      "cust.missing.b": "The <code lang=\"en\">customers</code> table doesn’t exist. Run <code lang=\"en\">quotewright-intelligence.sql</code> in the Supabase SQL editor and this view lights up automatically.",

      // ── editing ───────────────────────────────────────────────────────────
      "cust.edit": "Edit",
      "cust.delete": "Delete",
      "cust.f.name": "Client name",
      "cust.f.sap": "SAP code",
      "cust.f.email": "Email",
      "cust.f.domain": "Domain",
      "cust.f.currency": "Preferred currency",
      "cust.f.notes": "Notes",
      "cust.f.notesPh": "Anything the team should know about this client…",
      "cust.f.currencyNone": "Not set",
      "cust.f.required": "required",
      "cust.learned.title": "Learned by the agent",
      "cust.learned.note": "Counts, dates, preferences and product history are learned automatically from quoting activity. They can’t be edited by hand.",
      "cust.saved": "Client updated",
      "cust.err.nameRequired": "A client name is required.",
      "cust.err.email": "That doesn’t look like an email address.",
      "cust.err.dupEmail": "Another client already uses this email.",
      "cust.err.save": "Couldn’t save: {m}",
      "cust.err.denied": "You don’t have permission to change clients. Run clients-page.sql in Supabase.",
      "cust.demoNote": "Demo mode — nothing was saved.",
      "cust.readonly": "Editing is off until <code lang=\"en\">clients-page.sql</code> is run in Supabase.",

      // ── delete ────────────────────────────────────────────────────────────
      "cust.del.title": "Delete {name}?",
      "cust.del.lead": "Choose how much to remove. Only the first option can be undone.",
      "cust.del.quotesN": "{n} quotes on record are matched to this client by name.",
      "cust.del.quotes0": "No quotes on record are matched to this client by name.",
      "cust.del.quotesErr": "Couldn’t count this client’s quotes — the options below still work.",
      "cust.del.o1.t": "Forget learned data",
      "cust.del.o1.tag": "Recoverable",
      "cust.del.o1.b": "The client disappears from this list and the agent stops using their memory. Quotes and shared learning are untouched. You can restore them from Recently deleted.",
      "cust.del.o2.t": "Forget + anonymise past quotes",
      "cust.del.o2.tag": "Permanent",
      "cust.del.o2.b": "As above, and every quote matched to this client loses its identity: the customer name becomes “Deleted client” and the stored email thread is erased. Totals and line items survive, so reporting stays correct.",
      "cust.del.o3.t": "Delete everything",
      "cust.del.o3.tag": "No undo",
      "cust.del.o3.b": "The client row and all of their quotes are permanently deleted from the database.",
      "cust.del.warn3": "Dashboard and Insights revenue totals will change retroactively — these quotes will vanish from every historical chart.",
      "cust.del.keepLearning": "Shared catalogue learning (resolutions and catalogue gaps) is never deleted — it belongs to every client, not just this one.",
      "cust.del.typeName": "Type {name} to confirm",
      "cust.del.typeHint": "Case doesn’t matter.",
      "cust.del.needName": "This client has no name on record, so their quotes can’t be matched. Only the first option is available.",
      "cust.del.scopeLegend": "What to delete",
      "cust.del.btn": "Delete",
      "cust.del.working": "Deleting…",
      "cust.del.done1": "Client forgotten — restorable from Recently deleted.",
      "cust.del.done2": "Client forgotten, past quotes anonymised.",
      "cust.del.done3": "Client and their quotes deleted.",
      "cust.del.failed": "Couldn’t delete: {m}",

      // ── recently deleted ──────────────────────────────────────────────────
      "cust.showDeleted": "Recently deleted",
      "cust.showActive": "Back to clients",
      "cust.th.deleted": "Deleted",
      "cust.th.restore": "Restore",
      "cust.restore": "Restore",
      "cust.restoring": "Restoring…",
      "cust.restored": "Client restored",
      "cust.err.restore": "Couldn’t restore: {m}",
      "cust.deletedCount": "{n} deleted",
      "cust.empty.deleted.t": "Nothing in the bin",
      "cust.empty.deleted.b": "Clients you forget show up here so you can bring them back. Permanent deletions never appear — they’re gone.",
      "cust.err.loadDeleted": "Couldn’t load deleted clients"
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
      "cust.missing.b": "<code lang=\"en\">customers</code> tablosu mevcut değil. Supabase SQL düzenleyicisinde <code lang=\"en\">quotewright-intelligence.sql</code> dosyasını çalıştırın; bu görünüm otomatik olarak devreye girer.",

      // ── düzenleme ─────────────────────────────────────────────────────────
      "cust.edit": "Düzenle",
      "cust.delete": "Sil",
      "cust.f.name": "Müşteri adı",
      "cust.f.sap": "SAP kodu",
      "cust.f.email": "E-posta",
      "cust.f.domain": "Alan adı",
      "cust.f.currency": "Tercih edilen para birimi",
      "cust.f.notes": "Notlar",
      "cust.f.notesPh": "Ekibin bu müşteri hakkında bilmesi gerekenler…",
      "cust.f.currencyNone": "Belirtilmedi",
      "cust.f.required": "zorunlu",
      "cust.learned.title": "Ajanın öğrendikleri",
      "cust.learned.note": "Adetler, tarihler, tercihler ve ürün geçmişi teklif faaliyetinden otomatik olarak öğrenilir. Elle düzenlenemez.",
      "cust.saved": "Müşteri güncellendi",
      "cust.err.nameRequired": "Müşteri adı zorunludur.",
      "cust.err.email": "Bu bir e-posta adresine benzemiyor.",
      "cust.err.dupEmail": "Bu e-postayı başka bir müşteri kullanıyor.",
      "cust.err.save": "Kaydedilemedi: {m}",
      "cust.err.denied": "Müşterileri değiştirme yetkiniz yok. Supabase’de clients-page.sql dosyasını çalıştırın.",
      "cust.demoNote": "Demo modu — hiçbir şey kaydedilmedi.",
      "cust.readonly": "Supabase’de <code lang=\"en\">clients-page.sql</code> çalıştırılana kadar düzenleme kapalıdır.",

      // ── silme ─────────────────────────────────────────────────────────────
      "cust.del.title": "{name} silinsin mi?",
      "cust.del.lead": "Ne kadarının kaldırılacağını seçin. Yalnızca ilk seçenek geri alınabilir.",
      "cust.del.quotesN": "Bu müşteriyle ada göre eşleşen {n} teklif kayıtlı.",
      "cust.del.quotes0": "Bu müşteriyle ada göre eşleşen kayıtlı teklif yok.",
      "cust.del.quotesErr": "Bu müşterinin teklifleri sayılamadı — aşağıdaki seçenekler yine de çalışır.",
      "cust.del.o1.t": "Öğrenilenleri unut",
      "cust.del.o1.tag": "Geri alınabilir",
      "cust.del.o1.b": "Müşteri bu listeden kaybolur ve ajan belleğini kullanmayı bırakır. Teklifler ve ortak öğrenme etkilenmez. “Son silinenler”den geri getirebilirsiniz.",
      "cust.del.o2.t": "Unut + geçmiş teklifleri anonimleştir",
      "cust.del.o2.tag": "Kalıcı",
      "cust.del.o2.b": "Yukarıdakine ek olarak, bu müşteriyle eşleşen her teklif kimliğini kaybeder: müşteri adı “Deleted client” olur ve kayıtlı e-posta yazışması silinir. Tutarlar ve kalemler korunur, raporlama doğru kalır.",
      "cust.del.o3.t": "Her şeyi sil",
      "cust.del.o3.tag": "Geri dönüşü yok",
      "cust.del.o3.b": "Müşteri kaydı ve tüm teklifleri veritabanından kalıcı olarak silinir.",
      "cust.del.warn3": "Panel ve Analiz ciro toplamları geriye dönük olarak değişir — bu teklifler tüm geçmiş grafiklerden kaybolur.",
      "cust.del.keepLearning": "Ortak katalog öğrenmesi (çözümler ve katalog boşlukları) asla silinmez — yalnızca bu müşteriye değil, tüm müşterilere aittir.",
      "cust.del.typeName": "Onaylamak için {name} yazın",
      "cust.del.typeHint": "Büyük/küçük harf önemsizdir.",
      "cust.del.needName": "Bu müşterinin kayıtlı adı yok, bu yüzden teklifleri eşleştirilemez. Yalnızca ilk seçenek kullanılabilir.",
      "cust.del.scopeLegend": "Ne silinecek",
      "cust.del.btn": "Sil",
      "cust.del.working": "Siliniyor…",
      "cust.del.done1": "Müşteri unutuldu — “Son silinenler”den geri getirilebilir.",
      "cust.del.done2": "Müşteri unutuldu, geçmiş teklifler anonimleştirildi.",
      "cust.del.done3": "Müşteri ve teklifleri silindi.",
      "cust.del.failed": "Silinemedi: {m}",

      // ── son silinenler ────────────────────────────────────────────────────
      "cust.showDeleted": "Son silinenler",
      "cust.showActive": "Müşterilere dön",
      "cust.th.deleted": "Silindi",
      "cust.th.restore": "Geri getir",
      "cust.restore": "Geri getir",
      "cust.restoring": "Geri getiriliyor…",
      "cust.restored": "Müşteri geri getirildi",
      "cust.err.restore": "Geri getirilemedi: {m}",
      "cust.deletedCount": "{n} silinmiş",
      "cust.empty.deleted.t": "Geri dönüşüm kutusu boş",
      "cust.empty.deleted.b": "Unuttuğunuz müşteriler geri getirebilmeniz için burada görünür. Kalıcı silmeler hiç görünmez — onlar gitmiştir.",
      "cust.err.loadDeleted": "Silinmiş müşteriler yüklenemedi"
    }
  });

  var sb = null;
  var rows = [];              // ACTIVE clients (deleted_at is null)
  var delRows = [];           // soft-deleted clients (deleted_at is not null)
  var loaded = false, loading = false;
  var delLoaded = false, delLoading = false;
  var openId = null;
  var editing = false, saving = false;
  var showDeleted = false;
  // False once we learn the `deleted_at` column isn't there yet (clients-page.sql
  // not run). The page then stays READ-ONLY instead of throwing Postgres errors.
  var hasDelCol = true, colProbed = false;
  var pendingDel = null;      // { id, name, quoteCount, quoteCountErr }

  var ICON_USERS = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13A4 4 0 0 1 16 11"/></svg>';
  var ICON_FILTER = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3 5h18l-7 8v5l-4 2v-7L3 5z"/></svg>';
  var ICON_WARN = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9 2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/></svg>';
  var ICON_BIN = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/><path d="M10 11v5M14 11v5"/></svg>';
  var ICON_CHEV = '<svg class="qc-chev" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>';

  Q.boot({ onAuth: function (client) {
    sb = client;
    el("subnav").hidden = false;
    el("refreshBtn").addEventListener("click", refreshAll);
    el("search").addEventListener("input", render);
    el("sortSel").addEventListener("change", render);
    el("deletedToggle").addEventListener("click", toggleDeleted);

    // EVENT DELEGATION ONLY (CSP: script-src 'self' — no inline handlers anywhere).
    el("custBody").addEventListener("click", function (e) {
      var t2 = e.target;
      var rb = t2.closest ? t2.closest("[data-restore]") : null;
      if (rb) { restore(rb.getAttribute("data-restore"), rb); return; }
      var tr = t2.closest ? t2.closest("tr[data-id]") : null;
      if (tr) openDrawer(tr.getAttribute("data-id"));
    });
    el("custBody").addEventListener("keydown", function (e) {
      if (e.key !== "Enter" && e.key !== " ") return;
      var tr = e.target.closest ? e.target.closest("tr[data-id]") : null;
      if (tr && e.target === tr) { e.preventDefault(); openDrawer(tr.getAttribute("data-id")); }
    });

    var dlg = el("drawer");
    dlg.addEventListener("click", function (e) {
      // click on backdrop (outside the inner panel) closes
      if (e.target === dlg) { closeDrawer(); return; }
      var t2 = e.target;
      var act = t2.closest ? t2.closest("[data-act]") : null;
      if (act) { onDrawerAction(act.getAttribute("data-act")); return; }
      var c = t2.closest ? t2.closest("[data-close]") : null;
      if (c) closeDrawer();
    });
    // Enter inside the edit form saves (submit bubbles up to the dialog).
    dlg.addEventListener("submit", function (e) {
      if (e.target && e.target.id === "custEditForm") { e.preventDefault(); saveEdit(); }
    });
    dlg.addEventListener("close", function () { editing = false; });

    var dd = el("delDialog");
    dd.addEventListener("click", function (e) {
      var go = e.target.closest ? e.target.closest("#delGo") : null;
      if (go) { e.preventDefault(); runDelete(); }
    });
    dd.addEventListener("change", function (e) {
      if (e.target && e.target.name === "delScope") syncDelDialog();
    });
    dd.addEventListener("input", function (e) {
      if (e.target && e.target.id === "delConfirmInput") syncDelDialog();
    });
    dd.addEventListener("close", function () { pendingDel = null; });

    load();
  }});

  // Re-render live when the UI language changes (no refetch).
  window.addEventListener("qw:langchange", function () {
    if (loaded) render();
    var tg = el("deletedToggle");
    if (tg) tg.textContent = t(showDeleted ? "cust.showActive" : "cust.showDeleted");
    var dlg = el("drawer");
    // Don't clobber half-typed edits: only re-render the drawer in view mode.
    if (dlg && dlg.open && openId != null && !editing) openDrawer(openId);
  });

  function isDemo() { return !!(window.QWDemo && QWDemo.isOn()); }
  function ownerVal() { return Q.owner || Q.cfg.OWNER || null; }
  function canWrite() { return isDemo() || hasDelCol; }

  // Is this a "column customers.deleted_at does not exist" error? (clients-page.sql not run)
  function isMissingDeletedCol(err) {
    if (!err) return false;
    var code = err.code || "";
    var msg = (err.message || "") + " " + (err.details || "") + " " + (err.hint || "");
    return (code === "42703" || code === "PGRST204" || /does not exist|schema cache/i.test(msg)) &&
      /deleted_at/i.test(msg);
  }
  // Unique index violation on (owner, lower(email)).
  function isDupEmail(err) {
    if (!err) return false;
    var msg = (err.message || "") + " " + (err.details || "");
    return err.code === "23505" || /duplicate key|unique constraint/i.test(msg);
  }
  // RLS refused the write (no policy / not signed in): PostgREST returns 0 rows or 42501.
  function isDenied(err) {
    if (!err) return false;
    var msg = (err.message || "") + " " + (err.details || "");
    return err.code === "42501" || /row-level security|permission denied/i.test(msg);
  }

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

  function matches(c, q) {
    if (!q) return true;
    return (displayName(c) + " " + (c.email || "") + " " + (c.domain || "") + " " + (c.sap_code || ""))
      .toLowerCase().indexOf(q) !== -1;
  }

  function render() {
    if (!loaded) return;
    var tg = el("deletedToggle");
    tg.hidden = !canWrite();
    tg.textContent = t(showDeleted ? "cust.showActive" : "cust.showDeleted");
    tg.setAttribute("aria-pressed", showDeleted ? "true" : "false");
    el("thWhen").textContent = t(showDeleted ? "cust.th.deleted" : "cust.th.lastSeen");
    if (showDeleted) { renderDeleted(); return; }

    renderTiles();
    var q = (el("search").value || "").trim().toLowerCase();
    var list = rows.filter(function (c) { return matches(c, q); });
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

  // ── recently deleted ────────────────────────────────────────────────────────
  function renderDeleted() {
    el("tiles").innerHTML = "";
    var q = (el("search").value || "").trim().toLowerCase();
    var list = delRows.filter(function (c) { return matches(c, q); });
    list.sort(function (x, y) { return new Date(y.deleted_at || 0) - new Date(x.deleted_at || 0); });
    el("rowCount").textContent = delLoading ? t("common.loading") : t("cust.deletedCount", { n: list.length });

    var empty = el("emptyState");
    if (list.length === 0 && !delLoading) {
      empty.hidden = false;
      empty.innerHTML = panel(ICON_BIN, t("cust.empty.deleted.t"), t("cust.empty.deleted.b"));
    } else { empty.hidden = true; }

    if (delLoading && list.length === 0) {
      el("custBody").innerHTML = '<tr><td colspan="7" style="padding:0"><div class="sk sk-row" style="margin:12px 16px"></div></td></tr>';
      return;
    }

    el("custBody").innerHTML = list.map(function (c) {
      var qn = num(c.quote_count) || 0, on = num(c.order_count) || 0;
      // NOTE: deleted rows carry data-del-id (NOT data-id) so the row-click
      // delegation never opens the detail drawer for a deleted client.
      return '<tr data-del-id="' + esc(c.id) + '" class="qc-row-deleted">' +
        '<td><span class="qc-cust-name" lang="en">' + esc(displayName(c)) + '</span>' +
          (c.domain ? '<span class="qc-cust-sub" lang="en">' + esc(c.domain) + '</span>' : '') + '</td>' +
        '<td lang="en">' + (c.email ? esc(c.email) : '<span class="qc-mut">—</span>') + '</td>' +
        '<td class="num qc-num-strong">' + qn + '</td>' +
        '<td class="num qc-num-strong">' + on + '</td>' +
        '<td>' + (c.currency_pref ? '<span class="qc-cur" lang="en">' + esc(c.currency_pref) + '</span>' : '<span class="qc-mut">—</span>') + '</td>' +
        '<td>' + esc(rel(c.deleted_at)) + '</td>' +
        '<td class="num"><button type="button" class="btn btn-ghost btn-sm" data-restore="' + esc(c.id) + '">' +
          esc(t("cust.restore")) + '</button></td>' +
      '</tr>';
    }).join("");
  }

  function toggleDeleted() {
    showDeleted = !showDeleted;
    if (showDeleted && !delLoaded) loadDeleted();
    el("tableError").hidden = true;
    el("custTable").style.display = "";
    render();
  }

  function refreshAll() {
    load();
    if (showDeleted || delLoaded) loadDeleted();
  }

  function loadDeleted() {
    if (delLoading || !hasDelCol) return;
    if (isDemo()) { delLoaded = true; if (showDeleted) render(); return; }
    delLoading = true;
    if (showDeleted) render();
    var qy = sb.from("customers").select("*").not("deleted_at", "is", null)
      .order("deleted_at", { ascending: false }).limit(500);
    var own = ownerVal();
    if (own) qy = qy.eq("owner", own);
    qy.then(function (res) {
      delLoading = false;
      if (res.error) {
        if (isMissingDeletedCol(res.error)) { hasDelCol = false; delLoaded = true; showDeleted = false; render(); return; }
        delRows = []; delLoaded = true;
        if (showDeleted) { toast(t("cust.err.loadDeleted"), true); render(); }
        return;
      }
      delRows = res.data || [];
      delLoaded = true;
      if (showDeleted) render();
    }, function () {
      delLoading = false; delLoaded = true;
      if (showDeleted) { toast(t("cust.err.network"), true); render(); }
    });
  }

  function restore(id, btn) {
    if (btn) { btn.disabled = true; btn.textContent = t("cust.restoring"); }
    function done(row) {
      for (var i = 0; i < delRows.length; i++) {
        if (String(delRows[i].id) === String(id)) { row = row || delRows[i]; delRows.splice(i, 1); break; }
      }
      if (row) { row.deleted_at = null; rows.push(row); }
      toast(t("cust.restored"));
      render();
    }
    if (isDemo()) { done(null); toast(t("cust.demoNote")); return; }
    var qy = sb.from("customers").update({ deleted_at: null }).eq("id", id);
    var own = ownerVal();
    if (own) qy = qy.eq("owner", own);
    qy.select().then(function (res) {
      if (res.error || !(res.data && res.data.length)) {
        if (btn) { btn.disabled = false; btn.textContent = t("cust.restore"); }
        var m = (res.error && res.error.message) || t("cust.err.denied");
        toast(t("cust.err.restore", { m: m }), true);
        return;
      }
      done(res.data[0]);
    }, function (err) {
      if (btn) { btn.disabled = false; btn.textContent = t("cust.restore"); }
      toast(t("cust.err.restore", { m: (err && err.message) || t("cust.err.network") }), true);
    });
  }

  // ── drawer ──────────────────────────────────────────────────────────────────
  function findRow(id) {
    var i;
    for (i = 0; i < rows.length; i++) if (String(rows[i].id) === String(id)) return rows[i];
    for (i = 0; i < delRows.length; i++) if (String(delRows[i].id) === String(id)) return delRows[i];
    return null;
  }

  function closeDrawer() {
    editing = false;
    var dlg = el("drawer");
    if (dlg.open) dlg.close(); else dlg.removeAttribute("open");
  }

  function onDrawerAction(act) {
    if (act === "edit") { editing = true; openDrawer(openId); return; }
    if (act === "cancel") { editing = false; openDrawer(openId); return; }
    if (act === "save") { saveEdit(); return; }
    if (act === "delete") { openDeleteDialog(openId); return; }
  }

  function openDrawer(id) {
    var c = findRow(id);
    if (!c) return;
    openId = id;
    if (editing) { renderEditDrawer(c); return; }
    var prefs = Q.parseJson(c.preferences, {}) || {};
    var hist = Q.parseJson(c.history, []) || [];
    if (!Array.isArray(hist)) hist = [];

    // Identity — the hand-editable half.
    var idFacts = [];
    if (c.email) idFacts.push({ k: t("cust.fact.email"), v: '<span lang="en">' + esc(c.email) + '</span>', wide: true });
    if (c.domain) idFacts.push({ k: t("cust.f.domain"), v: '<span lang="en">' + esc(c.domain) + '</span>' });
    if (c.sap_code) idFacts.push({ k: t("cust.fact.sap"), v: '<span lang="en">' + esc(c.sap_code) + '</span>' });
    if (c.currency_pref) idFacts.push({ k: t("cust.fact.currency"), v: '<span lang="en">' + esc(c.currency_pref) + '</span>' });
    var idHtml = idFacts.length ? '<div class="qc-facts">' + idFacts.map(function (f) {
      return '<div class="qc-fact' + (f.wide ? " wide" : "") + '"><div class="k">' + esc(f.k) + '</div><div class="v">' + f.v + '</div></div>';
    }).join("") + '</div>' : "";

    // Learned — machine-written, never hand-editable.
    var facts = [
      { k: t("cust.fact.quotes"), v: num(c.quote_count) || 0 },
      { k: t("cust.fact.orders"), v: num(c.order_count) || 0 },
      { k: t("cust.fact.firstSeen"), v: fdate(c.first_seen) },
      { k: t("cust.fact.lastSeen"), v: fdate(c.last_seen) }
    ];
    var factHtml = facts.map(function (f, i) {
      return '<div class="qc-fact' + ((facts.length % 2 && i === facts.length - 1) ? ' wide' : '') + '">' +
        '<div class="k">' + esc(f.k) + '</div><div class="v">' + f.v + '</div></div>';
    }).join("");

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
    if (!prefsHtml && !histHtml) {
      histHtml = '<p class="qc-lede" style="font-size:13.5px">' + esc(t("cust.noHistory")) + '</p>';
    }

    var learned =
      '<div class="qc-learned">' +
        '<div class="qc-sec-title">' + esc(t("cust.learned.title")) + '</div>' +
        '<p class="qc-hint qc-learned-note">' + esc(t("cust.learned.note")) + '</p>' +
        '<div class="qc-facts">' + factHtml + '</div>' +
        prefsHtml + histHtml +
      '</div>';

    var acts = canWrite()
      ? '<div class="qc-drawer-acts">' +
          '<button type="button" class="btn btn-ghost btn-sm qc-btn-danger" data-act="delete">' + esc(t("cust.delete")) + '</button>' +
          '<button type="button" class="btn btn-primary btn-sm" data-act="edit">' + esc(t("cust.edit")) + '</button>' +
        '</div>'
      : '<div class="qc-drawer-acts"><p class="qc-hint">' + t("cust.readonly") + '</p></div>';

    el("drawer").innerHTML =
      '<div class="qc-drawer-inner">' +
        drawerHead(c) +
        '<div class="qc-drawer-body">' +
          idHtml + notesHtml + learned +
        '</div>' +
        acts +
      '</div>';
    showDrawer();
  }

  function drawerHead(c) {
    return '<div class="qc-drawer-head">' +
        '<div><h2 lang="en">' + esc(displayName(c)) + '</h2>' +
          (c.domain ? '<span class="qc-cust-sub" lang="en">' + esc(c.domain) + '</span>' : '') +
          ((num(c.quote_count) || 0) > 1 ? ' <span class="pill repeat">' + esc(t("cust.repeatCustomer")) + '</span>' : '') + '</div>' +
        '<button type="button" class="qc-drawer-close" data-close aria-label="' + esc(t("common.close")) + '">' +
          '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button>' +
      '</div>';
  }

  function showDrawer() {
    var dlg = el("drawer");
    if (dlg.open) return;                       // already open: innerHTML swap is enough
    if (dlg.showModal) dlg.showModal(); else dlg.setAttribute("open", "");
  }

  // ── edit ────────────────────────────────────────────────────────────────────
  var CURRENCIES = ["EUR", "USD", "TRY", "GBP"];

  function field(id, label, value, type, extra) {
    return '<div class="qc-field ' + (extra || "") + '">' +
      '<label for="' + id + '">' + esc(label) + '</label>' +
      '<input id="' + id + '" type="' + type + '" lang="en" autocomplete="off" spellcheck="false" value="' + esc(value == null ? "" : value) + '">' +
    '</div>';
  }

  // `draft` (optional) re-fills the form with the values the user just tried to save,
  // so a rejected save (e.g. duplicate email) doesn't throw their typing away.
  function renderEditDrawer(c, draft) {
    var d = draft || c;
    var curSel = '<div class="qc-field"><label for="fCur">' + esc(t("cust.f.currency")) + '</label><select id="fCur" lang="en">' +
      '<option value="">' + esc(t("cust.f.currencyNone")) + '</option>' +
      CURRENCIES.map(function (x) {
        return '<option value="' + x + '"' + (d.currency_pref === x ? " selected" : "") + '>' + x + '</option>';
      }).join("") + '</select></div>';

    el("drawer").innerHTML =
      '<div class="qc-drawer-inner">' +
        drawerHead(c) +
        '<div class="qc-drawer-body">' +
          '<form id="custEditForm" class="qc-form qc-editform" novalidate>' +
            field("fName", t("cust.f.name") + " (" + t("cust.f.required") + ")", d.name, "text", "qc-field-wide") +
            field("fSap", t("cust.f.sap"), d.sap_code, "text") +
            curSel +
            field("fEmail", t("cust.f.email"), d.email, "email", "qc-field-wide") +
            field("fDomain", t("cust.f.domain"), d.domain, "text", "qc-field-wide") +
            '<div class="qc-field qc-field-wide"><label for="fNotes">' + esc(t("cust.f.notes")) + '</label>' +
              '<textarea id="fNotes" rows="4" placeholder="' + esc(t("cust.f.notesPh")) + '">' + esc(d.notes == null ? "" : d.notes) + '</textarea></div>' +
            '<div class="qc-field qc-field-wide"><div id="editError" class="qc-error" role="alert"></div></div>' +
            // Off-screen submit so Enter in a text field saves (a form with several
            // fields and no submit button doesn't implicitly submit in Chrome).
            '<button type="submit" class="qc-hidden-submit" tabindex="-1" aria-hidden="true"></button>' +
          '</form>' +
          '<div class="qc-learned">' +
            '<div class="qc-sec-title">' + esc(t("cust.learned.title")) + '</div>' +
            '<p class="qc-hint qc-learned-note">' + esc(t("cust.learned.note")) + '</p>' +
          '</div>' +
        '</div>' +
        '<div class="qc-drawer-acts">' +
          '<button type="button" class="btn btn-ghost btn-sm" data-act="cancel">' + esc(t("common.cancel")) + '</button>' +
          '<button type="button" class="btn btn-primary btn-sm" id="saveBtn" data-act="save">' + esc(t("common.save")) + '</button>' +
        '</div>' +
      '</div>';
    showDrawer();
    var n = el("fName"); if (n) n.focus();
  }

  function looksLikeEmail(v) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v); }

  function saveEdit() {
    if (saving) return;
    var c = findRow(openId);
    if (!c) return;
    var errBox = el("editError");
    function fail(msg) { if (errBox) errBox.textContent = msg; }
    fail("");

    var name = (el("fName").value || "").trim();
    var email = (el("fEmail").value || "").trim();
    var domain = (el("fDomain").value || "").trim();
    var sap = (el("fSap").value || "").trim();
    var cur = el("fCur").value || "";
    var notes = (el("fNotes").value || "").trim();

    if (!name) { fail(t("cust.err.nameRequired")); el("fName").focus(); return; }
    if (email && !looksLikeEmail(email)) { fail(t("cust.err.email")); el("fEmail").focus(); return; }
    if (cur && CURRENCIES.indexOf(cur) === -1) cur = "";

    var patch = {
      name: name,
      email: email || null,
      domain: domain || null,
      sap_code: sap || null,
      currency_pref: cur || null,
      notes: notes || null
    };
    // Snapshot for the revert-on-failure path (optimistic UI).
    var before = {
      name: c.name, email: c.email, domain: c.domain,
      sap_code: c.sap_code, currency_pref: c.currency_pref, notes: c.notes
    };
    var k;
    for (k in patch) if (Object.prototype.hasOwnProperty.call(patch, k)) c[k] = patch[k];
    editing = false;
    openDrawer(openId);
    render();

    // Roll the row back to what the database still holds, and put the user back in
    // the form with what they typed so they can fix it.
    function revert(msg) {
      var k2;
      for (k2 in before) if (Object.prototype.hasOwnProperty.call(before, k2)) c[k2] = before[k2];
      editing = true;
      renderEditDrawer(c, patch);
      render();
      var eb = el("editError"); if (eb) eb.textContent = msg;
      toast(msg, true);
    }

    if (isDemo()) { toast(t("cust.demoNote")); return; }

    saving = true;
    var qy = sb.from("customers").update(patch).eq("id", c.id);
    var own = ownerVal();
    if (own) qy = qy.eq("owner", own);
    qy.select().then(function (res) {
      saving = false;
      if (res.error) {
        if (isDupEmail(res.error)) { revert(t("cust.err.dupEmail")); return; }
        if (isDenied(res.error)) { revert(t("cust.err.denied")); return; }
        revert(t("cust.err.save", { m: res.error.message || "" }));
        return;
      }
      if (!(res.data && res.data.length)) { revert(t("cust.err.denied")); return; }  // RLS returned nothing
      toast(t("cust.saved"));
    }, function (err) {
      saving = false;
      revert(t("cust.err.save", { m: (err && err.message) || t("cust.err.network") }));
    });
  }

  // ── delete ──────────────────────────────────────────────────────────────────
  //
  // ⚠️ CRITICAL — DO NOT ADD `resolutions` OR `catalog_gaps` DELETES BELOW. ⚠️
  // Those two tables have NO customer column: they are keyed on
  // (owner, request_signature) and hold SHARED catalogue learning used when
  // matching lines for EVERY client. Deleting a client's "share" of them is not
  // even expressible, and wiping rows that a deleted client happened to trigger
  // would degrade product matching for all the other customers. This is
  // deliberate, not an oversight — leave them alone.
  //
  // The only link from a quote back to a client is `quotes.customer` (the name
  // text). There is no customer_id/email on quotes, so scopes 2 and 3 match on
  // owner + exact customer name — which is also why they require a name.

  function scopeOpt(val, checked, disabled, tag, tagClass) {
    return '<label class="qc-scope' + (checked ? " on" : "") + (disabled ? " off" : "") + '">' +
      '<input type="radio" name="delScope" value="' + val + '"' + (checked ? " checked" : "") + (disabled ? " disabled" : "") + '>' +
      '<span class="qc-scope-b">' +
        '<span class="qc-scope-t">' + esc(t("cust.del." + val + ".t")) +
          '<em class="qc-scope-tag ' + tagClass + '">' + esc(tag) + '</em></span>' +
        '<span class="qc-scope-d">' + esc(t("cust.del." + val + ".b")) + '</span>' +
      '</span></label>';
  }

  function openDeleteDialog(id) {
    var c = findRow(id);
    if (!c || !canWrite()) return;
    var name = (c.name || "").trim();
    pendingDel = { id: c.id, name: name, quoteCount: null };

    var noName = !name;
    el("delDialog").innerHTML =
      '<form method="dialog" class="qc-confirm-card qc-delcard">' +
        '<h3 id="delTitle" lang="en">' + esc(t("cust.del.title", { name: displayName(c) })) + '</h3>' +
        '<p class="qc-del-lead">' + esc(t("cust.del.lead")) + '</p>' +
        '<p class="qc-del-count" id="delCount">' + esc(t("common.loading")) + '</p>' +
        '<fieldset class="qc-scopes">' +
          '<legend>' + esc(t("cust.del.scopeLegend")) + '</legend>' +
          scopeOpt("o1", true, false, t("cust.del.o1.tag"), "ok") +
          scopeOpt("o2", false, noName, t("cust.del.o2.tag"), "warn") +
          scopeOpt("o3", false, noName, t("cust.del.o3.tag"), "bad") +
        '</fieldset>' +
        (noName ? '<p class="qc-del-warn">' + esc(t("cust.del.needName")) + '</p>' : '') +
        '<p class="qc-del-warn" id="delWarn" hidden>' + esc(t("cust.del.warn3")) + '</p>' +
        '<div class="qc-field qc-del-confirm" id="delConfirmWrap" hidden>' +
          '<label for="delConfirmInput">' + esc(t("cust.del.typeName", { name: name })) + '</label>' +
          '<input id="delConfirmInput" type="text" lang="en" autocomplete="off" spellcheck="false">' +
          '<p class="qc-hint">' + esc(t("cust.del.typeHint")) + '</p>' +
        '</div>' +
        '<p class="qc-hint qc-del-keep">' + esc(t("cust.del.keepLearning")) + '</p>' +
        '<div id="delError" class="qc-error" role="alert"></div>' +
        '<div class="qc-confirm-acts">' +
          '<button value="cancel" class="btn btn-ghost btn-sm" formnovalidate>' + esc(t("common.cancel")) + '</button>' +
          '<button type="button" id="delGo" class="btn btn-primary btn-sm is-danger">' + esc(t("cust.del.btn")) + '</button>' +
        '</div>' +
      '</form>';

    var dd = el("delDialog");
    if (dd.showModal) dd.showModal(); else dd.setAttribute("open", "");
    syncDelDialog();
    countQuotes(name);
  }

  function countQuotes(name) {
    var cnt = el("delCount");
    function show(txt) { if (cnt && el("delDialog").open) cnt.textContent = txt; }
    if (!name) { show(t("cust.del.quotes0")); return; }
    if (isDemo()) { show(t("cust.del.quotesN", { n: 3 })); if (pendingDel) pendingDel.quoteCount = 3; return; }
    var qy = sb.from("quotes").select("id", { count: "exact", head: true }).eq("customer", name);
    var own = ownerVal();
    if (own) qy = qy.eq("owner", own);
    qy.then(function (res) {
      if (res.error) { show(t("cust.del.quotesErr")); return; }
      var n = res.count || 0;
      if (pendingDel) pendingDel.quoteCount = n;
      show(n ? t("cust.del.quotesN", { n: n }) : t("cust.del.quotes0"));
    }, function () { show(t("cust.del.quotesErr")); });
  }

  function selectedScope() {
    var r = el("delDialog").querySelector('input[name="delScope"]:checked');
    return r ? r.value : "o1";
  }

  // Re-derives the dialog's state from the chosen scope. Options 2 and 3 are
  // permanent, so they demand the client's exact name typed back (trimmed,
  // case-insensitive) before the Delete button unlocks.
  function syncDelDialog() {
    if (!pendingDel) return;
    var scope = selectedScope();
    var needsType = (scope === "o2" || scope === "o3");
    var wrap = el("delConfirmWrap"), input = el("delConfirmInput"), warn = el("delWarn"), go = el("delGo");
    if (!go) return;
    wrap.hidden = !needsType;
    warn.hidden = (scope !== "o3");
    var labels = el("delDialog").querySelectorAll(".qc-scope");
    for (var i = 0; i < labels.length; i++) {
      var radio = labels[i].querySelector('input[name="delScope"]');
      labels[i].classList.toggle("on", !!(radio && radio.checked));
    }
    var typed = (input && input.value ? input.value : "").trim().toLowerCase();
    var ok = !needsType || (typed && typed === pendingDel.name.trim().toLowerCase());
    go.disabled = !ok;
  }

  function runDelete() {
    if (!pendingDel) return;
    var scope = selectedScope();
    var id = pendingDel.id, name = pendingDel.name;
    var go = el("delGo"), errBox = el("delError");
    if (go && go.disabled) return;
    if ((scope === "o2" || scope === "o3") && !name) return;
    if (go) { go.disabled = true; go.textContent = t("cust.del.working"); }
    if (errBox) errBox.textContent = "";

    function fail(msg) {
      if (go) { go.disabled = false; go.textContent = t("cust.del.btn"); }
      if (errBox) errBox.textContent = t("cust.del.failed", { m: msg });
      syncDelDialog();
    }
    function finish(msgKey, hard) {
      var row = null;
      for (var i = 0; i < rows.length; i++) {
        if (String(rows[i].id) === String(id)) { row = rows.splice(i, 1)[0]; break; }
      }
      if (!hard && row) {
        row.deleted_at = new Date().toISOString();
        delRows.unshift(row);
        delLoaded = true;
      }
      var dd = el("delDialog"); if (dd.open) dd.close();
      closeDrawer();
      pendingDel = null;
      render();
      toast(t(msgKey));
    }

    if (isDemo()) { finish("cust.del.done" + scope.charAt(1), scope === "o3"); toast(t("cust.demoNote")); return; }

    var own = ownerVal();
    function softDelete() {
      var qy = sb.from("customers").update({ deleted_at: new Date().toISOString() }).eq("id", id);
      if (own) qy = qy.eq("owner", own);
      return qy.select();
    }
    function quotesQuery(builder) {
      var qy = builder.eq("customer", name);
      if (own) qy = qy.eq("owner", own);
      return qy;
    }
    function guard(res) {
      if (res.error) throw new Error(isDenied(res.error) ? t("cust.err.denied") : (res.error.message || ""));
      return res;
    }
    function guardRows(res) {
      guard(res);
      if (!(res.data && res.data.length)) throw new Error(t("cust.err.denied"));
      return res;
    }

    var chain;
    if (scope === "o1") {
      chain = softDelete().then(guardRows).then(function () { finish("cust.del.done1", false); });
    } else if (scope === "o2") {
      // Scrub identity from this client's quotes, keep the commercial record.
      chain = quotesQuery(sb.from("quotes").update({ customer: "Deleted client", thread_snapshot: null }))
        .then(guard)
        .then(softDelete).then(guardRows)
        .then(function () { finish("cust.del.done2", false); });
    } else {
      // Hard delete: the quotes go first so a failure can't orphan them.
      chain = quotesQuery(sb.from("quotes").delete()).then(guard).then(function () {
        var qy = sb.from("customers").delete().eq("id", id);
        if (own) qy = qy.eq("owner", own);
        return qy.select();
      }).then(guardRows).then(function () { finish("cust.del.done3", true); });
    }
    chain.catch(function (err) { fail((err && err.message) || t("cust.err.network")); });
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
    if (isDemo()) {
      rows = QWDemo.customers().filter(function (c) { return !c.deleted_at; });
      loaded = true; loading = false;
      el("tableError").hidden = true; el("custTable").style.display = "";
      render(); return;
    }
    loading = true;
    el("tableError").hidden = true;
    el("custTable").style.display = "";
    if (!loaded) skeleton(); else el("rowCount").textContent = t("common.loading");
    var refresh = el("refreshBtn"); if (refresh) { refresh.classList.add("is-loading"); refresh.textContent = t("common.refreshing"); }
    var qy = sb.from("customers").select("*").limit(2000);
    var own = ownerVal();
    if (own) qy = qy.eq("owner", own);
    // Soft-deleted clients are excluded from the main list. Before clients-page.sql
    // is run the column doesn't exist — we detect that once and drop the filter.
    if (hasDelCol) qy = qy.is("deleted_at", null);
    qy.then(function (res) {
      loading = false;
      if (refresh) { refresh.classList.remove("is-loading"); refresh.textContent = t("common.refresh"); }
      if (res.error) {
        if (hasDelCol && !colProbed && isMissingDeletedCol(res.error)) {
          // clients-page.sql hasn't been applied yet → read-only mode, retry once.
          hasDelCol = false; colProbed = true; showDeleted = false;
          load(); return;
        }
        if (Q.isMissingTable(res.error)) { showMissing(); loaded = true; return; }
        showTableError(res.error.message || t("cust.err.generic"));
        return;
      }
      colProbed = true;
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
