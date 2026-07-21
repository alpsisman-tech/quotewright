/* Quotewright console — GUIDED WALKTHROUGH (self-hosted coach-marks).

   A hand-rolled tour (no intro.js / shepherd — site CSP is script-src 'self').
   • Highlights a target element with a spotlight + a tooltip that explains it.
   • Next / Back / Skip, keyboard (→/Enter next, ← back, Esc skip), progress dots.
   • Scrolls targets into view; spans multiple pages (persists its position in
     sessionStorage and navigates); FAIL-SAFE — if a target can't be found it shows
     the explanation centred instead of trapping or breaking.
   • Runs over DEMO DATA (window.QWDemo) so a brand-new empty account still shows
     every feature; the demo flag never writes to the real tenant DB.

   Gating / launch:
   • Auto-launches once, right after the onboarding questionnaire finishes, when the
     signed-in user's user_metadata.tour_done !== true. Sets tour_done on finish/skip.
   • Re-launchable any time from the "Take the tour" button in the header.

   Reduced-motion friendly (see console-tour.css). */
(function () {
  "use strict";

  // ── i18n: register the tour's strings (EN + TR) and a safe translate helper ──
  // Steps are keyed by their index (tour.step<i>.kick/.title/.body); nav chrome is
  // tour.*. tt() falls back to the English literal if a key is somehow missing.
  if (window.QWI18n && QWI18n.add) QWI18n.add({
    en: {
      "tour.aria": "Guided tour",
      "tour.skip": "Skip tour",
      "tour.close": "Close",
      "tour.back": "Back",
      "tour.next": "Next",
      "tour.finish": "Finish",

      "tour.step0.kick": "Welcome",
      "tour.step0.title": "Your whole console, one rail",
      "tour.step0.body": "Everything lives on this glass rail — it sits as a slim icon strip and opens on hover. <b>Quotes</b> is home base, with Insights, Customers, Catalogue gaps, Activity and Settings a click away. Let's walk through what each one does.",

      "tour.step1.kick": "Daily brief",
      "tour.step1.title": "What's waiting on you today",
      "tour.step1.body": "Your copilot brief. Each chip — ready to send, need input, thin-margin approvals, new replies — jumps you straight to those quotes. It's the fastest read on your morning.",

      "tour.step2.kick": "Triage",
      "tour.step2.title": "Start with “Needs you”",
      "tour.step2.body": "The pipeline drafts quotes on its own; this queue surfaces only the ones that actually need a human — an approval, a missing spec, or a customer reply. Clear this and you're done for the day.",

      "tour.step3.kick": "Triage",
      "tour.step3.title": "Grouped by what to do",
      "tour.step3.body": "Ready-to-send drafts, thin-margin approvals, lines missing a detail, and new replies — each grouped so you can act in a batch. Every card opens the full quote.",

      "tour.step4.kick": "The ledger",
      "tour.step4.title": "Every quote, findable",
      "tour.step4.body": "Switch to <b>All quotes</b> for the full record. Combined search (customer, product or SKU), sort by attention / value / margin, and filters for send-state, tier and outcome. It paginates once you pass 25.",

      "tour.step5.kick": "The ledger",
      "tour.step5.title": "Read a quote at a glance",
      "tour.step5.body": "Each row shows the autonomy <b>tier</b> (green ready / amber review / red needs work), the <b>margin</b> and match <b>confidence</b>, plus inline <b>Sign off</b> (records your decision on a flagged margin — it emails nobody) and <b>Won / Lost</b>.",

      "tour.step6.kick": "Workspace",
      "tour.step6.title": "Open the workspace",
      "tour.step6.body": "Click any quote to open its workspace: the full email <b>thread</b>, the <b>line items</b> the pipeline matched, and the ready-to-edit <b>draft</b> — all in one panel, no tab-hopping.",

      "tour.step7.kick": "Workspace",
      "tour.step7.title": "Resolve a weak line",
      "tour.step7.body": "When a line is ambiguous, you get ranked candidates. One tap prices it, regenerates the draft, <b>and</b> teaches the pipeline your choice — so next time it's automatic. It never invents a price.",

      "tour.step8.kick": "The send gate",
      "tour.step8.title": "One Send — you're the gate",
      "tour.step8.body": "You see the branded email exactly as the customer will. One <b>Send</b> button: leave it alone and the branded quote goes as-is; choose <b>Edit the text</b> and your own words go instead, as a plain reply. Nothing leaves until you press it.",

      "tour.step9.kick": "Efficiency",
      "tour.step9.title": "Work in bulk",
      "tour.step9.body": "Tick the boxes to select several quotes at once, then send or label them all from the bar that appears. Handy when a batch of green-tier drafts is ready to go.",

      "tour.step10.kick": "Reporting",
      "tour.step10.title": "Insights that add up",
      "tour.step10.body": "Real reporting on your book: win-rate, volume over time, margin distribution, response time, top customers and gap trends — all computed from your quotes, with a time-range switch up top.",

      "tour.step11.kick": "Audit trail",
      "tour.step11.title": "One timeline of everything",
      "tour.step11.body": "Every draft, approval, send, resolution and outcome on a single reverse-chronological feed — from real timestamps, nothing fabricated. Your team's paper trail, searchable and filterable.",

      "tour.step12.kick": "Memory",
      "tour.step12.title": "The pipeline remembers customers",
      "tour.step12.body": "As RFQs arrive, senders are remembered here — quote and order counts, currency and colour preferences, when you last spoke. It's how repeat quotes get faster and more accurate. Open any client to correct their details, or to forget them.",

      "tour.step13.kick": "Demand signal",
      "tour.step13.title": "See what you don't stock — yet",
      "tour.step13.body": "Every time a customer asks for something not in the catalogue, it's logged and ranked here. A live demand signal for what to source next, straight from real requests.",

      "tour.step14.kick": "Control",
      "tour.step14.title": "Dial in your autonomy",
      "tour.step14.body": "Decide how much runs on its own: <b>auto-fill</b> repeat lines, <b>auto-send</b> green-tier quotes (off by default — you stay the gate), and automatic <b>follow-ups</b> when a customer goes quiet. Loosen it as you learn to trust the drafts.",

      "tour.step15.kick": "That's the tour",
      "tour.step15.title": "You're all set",
      "tour.step15.body": "That's the whole console. This walkthrough ran on <b>sample data</b> — your real account starts clean, and nothing here was saved. Re-run this any time with <b>Take the tour</b> in the header."
    },
    tr: {
      "tour.aria": "Rehberli tur",
      "tour.skip": "Turu atla",
      "tour.close": "Kapat",
      "tour.back": "Geri",
      "tour.next": "İleri",
      "tour.finish": "Bitir",

      "tour.step0.kick": "Hoş geldiniz",
      "tour.step0.title": "Tüm konsolunuz, tek bir çubukta",
      "tour.step0.body": "Her şey bu cam çubukta durur — ince bir simge şeridi olarak bekler ve üzerine gelince açılır. <b>Teklifler</b> ana üssünüzdür; Analizler, Müşteriler, Katalog boşlukları, Etkinlik ve Ayarlar bir tık uzağınızdadır. Hadi her birinin ne yaptığını birlikte gezelim.",

      "tour.step1.kick": "Günlük özet",
      "tour.step1.title": "Bugün sizi bekleyenler",
      "tour.step1.body": "<span lang=\"en\">Copilot</span> brifinginiz. Her etiket — gönderime hazır, girdi gerekli, düşük marjlı onaylar, yeni yanıtlar — sizi doğrudan ilgili tekliflere götürür. Sabahınızın en hızlı özetidir.",

      "tour.step2.kick": "Önceliklendirme",
      "tour.step2.title": "“Sizi bekliyor” ile başlayın",
      "tour.step2.body": "Akış teklifleri kendi başına hazırlar; bu kuyruk yalnızca gerçekten bir insana ihtiyaç duyanları öne çıkarır — bir onay, eksik bir teknik özellik ya da bir müşteri yanıtı. Bunu temizleyin, o günkü işiniz biter.",

      "tour.step3.kick": "Önceliklendirme",
      "tour.step3.title": "Yapılacak işe göre gruplanmış",
      "tour.step3.body": "Gönderime hazır taslaklar, düşük marjlı onaylar, ayrıntısı eksik satırlar ve yeni yanıtlar — toplu işlem yapabilmeniz için her biri gruplanmıştır. Her kart teklifin tamamını açar.",

      "tour.step4.kick": "Kayıt defteri",
      "tour.step4.title": "Her teklif, bulunabilir",
      "tour.step4.body": "Tüm kayıt için <b>Tüm teklifler</b>'e geçin. Birleşik arama (müşteri, ürün veya <span lang=\"en\">SKU</span>), önem / değer / marj sıralaması ve gönderim durumu, kademe ve sonuç filtreleri. 25'i geçtiğinizde sayfalara ayrılır.",

      "tour.step5.kick": "Kayıt defteri",
      "tour.step5.title": "Bir teklifi bir bakışta okuyun",
      "tour.step5.body": "Her satır özerklik <b>kademesini</b> (yeşil hazır / sarı incele / kırmızı çalışma gerekir), <b>marjı</b> ve eşleşme <b>güvenini</b> gösterir; ayrıca satır içi <b>İmzala</b> (işaretli marj için kararınızı kaydeder — kimseye e-posta göndermez) ve <b>Kazanıldı / Kaybedildi</b> bulunur.",

      "tour.step6.kick": "Çalışma alanı",
      "tour.step6.title": "Çalışma alanını açın",
      "tour.step6.body": "Çalışma alanını açmak için herhangi bir teklife tıklayın: tam e-posta <b>yazışması</b>, akışın eşleştirdiği <b>satır kalemleri</b> ve düzenlemeye hazır <b>taslak</b> — hepsi tek bir panelde, sekmeler arası gezinme olmadan.",

      "tour.step7.kick": "Çalışma alanı",
      "tour.step7.title": "Zayıf bir satırı çözün",
      "tour.step7.body": "Bir satır belirsiz olduğunda, sıralanmış adaylar alırsınız. Tek dokunuş onu fiyatlandırır, taslağı yeniden oluşturur <b>ve</b> seçiminizi akışa öğretir — böylece bir dahaki sefere otomatik olur. Asla bir fiyat uydurmaz.",

      "tour.step8.kick": "Gönderim kapısı",
      "tour.step8.title": "Tek bir Gönder — kapı sizsiniz",
      "tour.step8.body": "Markalı e-postayı müşterinin göreceği hâliyle görürsünüz. Tek bir <b>Gönder</b> düğmesi: dokunmazsanız markalı teklif olduğu gibi gider; <b>Metni düzenle</b>yi seçerseniz kendi sözleriniz düz metin yanıt olarak gider. Siz basmadan hiçbir şey gitmez.",

      "tour.step9.kick": "Verimlilik",
      "tour.step9.title": "Toplu çalışın",
      "tour.step9.body": "Aynı anda birden fazla teklif seçmek için kutuları işaretleyin, ardından beliren çubuktan hepsini gönderin veya etiketleyin. Bir grup yeşil kademe taslağı gönderime hazır olduğunda kullanışlıdır.",

      "tour.step10.kick": "Raporlama",
      "tour.step10.title": "Anlamlı analizler",
      "tour.step10.body": "İşleriniz üzerine gerçek raporlama: kazanma oranı, zaman içindeki hacim, marj dağılımı, yanıt süresi, en iyi müşteriler ve boşluk eğilimleri — hepsi tekliflerinizden hesaplanır, üstte bir zaman aralığı anahtarıyla.",

      "tour.step11.kick": "Denetim izi",
      "tour.step11.title": "Her şeyin tek zaman çizelgesi",
      "tour.step11.body": "Her taslak, onay, gönderim, çözüm ve sonuç tek bir ters kronolojik akışta — gerçek zaman damgalarından, hiçbir şey uydurulmadan. Ekibinizin aranabilir ve filtrelenebilir kayıt izi.",

      "tour.step12.kick": "Bellek",
      "tour.step12.title": "Akış müşterileri hatırlar",
      "tour.step12.body": "<span lang=\"en\">RFQ</span>'lar geldikçe, gönderenler burada hatırlanır — teklif ve sipariş sayıları, para birimi ve renk tercihleri, en son ne zaman görüştüğünüz. Tekrarlayan teklifler böyle daha hızlı ve daha doğru olur. Bilgilerini düzeltmek ya da müşteriyi unutmak için üzerine tıklayın.",

      "tour.step13.kick": "Talep sinyali",
      "tour.step13.title": "Henüz stoklamadığınızı görün",
      "tour.step13.body": "Bir müşteri katalogda olmayan bir şey istediğinde, burada kaydedilir ve sıralanır. Bir sonraki neyi tedarik edeceğinize dair canlı bir talep sinyali, doğrudan gerçek taleplerden.",

      "tour.step14.kick": "Kontrol",
      "tour.step14.title": "Özerkliğinizi ayarlayın",
      "tour.step14.body": "Ne kadarının kendi başına çalışacağına karar verin: tekrarlayan satırları <b>otomatik doldur</b>, yeşil kademe tekliflerini <b>otomatik gönder</b> (varsayılan olarak kapalı — kapı siz kalırsınız) ve bir müşteri sessizleştiğinde otomatik <b>takipler</b>. Taslaklara güvenmeyi öğrendikçe gevşetin.",

      "tour.step15.kick": "Tur bu kadar",
      "tour.step15.title": "Her şey hazır",
      "tour.step15.body": "Konsolun tamamı bu kadar. Bu tanıtım <b>örnek verilerle</b> çalıştı — gerçek hesabınız tertemiz başlar ve burada hiçbir şey kaydedilmedi. Bunu başlıktaki <b>Turu başlat</b> ile istediğiniz zaman yeniden çalıştırın."
    }
  });
  function tt(key, fallback) {
    if (window.QWI18n && QWI18n.t) { var v = QWI18n.t(key); if (v !== key) return v; }
    return fallback;
  }

  var SKEY = "qw_tour";                 // sessionStorage: { active, idx }
  var sbRef = null;
  var started = false;                  // guard against double auto-start within a page
  var spot = null, tip = null, overlayWired = false;
  var curIdx = -1, curStep = null, lastRect = null;

  // ── the walkthrough ─────────────────────────────────────────────────────────
  var STEPS = [
    { page: "dashboard.html", sel: "#sideNav", place: "right", tab: "needsyou", rail: true,
      kick: "Welcome", title: "Your whole console, one rail",
      body: "Everything lives on this glass rail — it sits as a slim icon strip and opens on hover. <b>Quotes</b> is home base, with Insights, Customers, Catalogue gaps, Activity and Settings a click away. Let's walk through what each one does." },

    { page: "dashboard.html", sel: "#digestBar", place: "bottom", tab: "needsyou",
      kick: "Daily brief", title: "What's waiting on you today",
      body: "Your copilot brief. Each chip — ready to send, need input, thin-margin approvals, new replies — jumps you straight to those quotes. It's the fastest read on your morning." },

    { page: "dashboard.html", sel: "#tabNeedsYou", place: "bottom", tab: "needsyou",
      kick: "Triage", title: "Start with “Needs you”",
      body: "The pipeline drafts quotes on its own; this queue surfaces only the ones that actually need a human — an approval, a missing spec, or a customer reply. Clear this and you're done for the day." },

    { page: "dashboard.html", sel: "#needsYouView", place: "top", tab: "needsyou",
      kick: "Triage", title: "Grouped by what to do",
      body: "Ready-to-send drafts, thin-margin approvals, lines missing a detail, and new replies — each grouped so you can act in a batch. Every card opens the full quote." },

    { page: "dashboard.html", sel: ".qc-controls", place: "bottom", tab: "all",
      kick: "The ledger", title: "Every quote, findable",
      body: "Switch to <b>All quotes</b> for the full record. Combined search (customer, product or SKU), sort by attention / value / margin, and filters for send-state, tier and outcome. It paginates once you pass 25." },

    { page: "dashboard.html", sel: "#quotesBody tr[data-row]", place: "bottom", tab: "all",
      kick: "The ledger", title: "Read a quote at a glance",
      body: "Each row shows the autonomy <b>tier</b> (green ready / amber review / red needs work), the <b>margin</b> and match <b>confidence</b>, plus inline <b>Sign off</b> (records your decision on a flagged margin — it emails nobody) and <b>Won / Lost</b>." },

    { page: "dashboard.html", sel: ".qc-drawer.show", place: "left", tab: "all", drawer: "demo-1",
      kick: "Workspace", title: "Open the workspace",
      body: "Click any quote to open its workspace: the full email <b>thread</b>, the <b>line items</b> the pipeline matched, and the ready-to-edit <b>draft</b> — all in one panel, no tab-hopping." },

    { page: "dashboard.html", sel: ".qc-resolve", place: "left", tab: "all", drawer: "demo-1",
      kick: "Workspace", title: "Resolve a weak line",
      body: "When a line is ambiguous, you get ranked candidates. One tap prices it, regenerates the draft, <b>and</b> teaches the pipeline your choice — so next time it's automatic. It never invents a price." },

    { page: "dashboard.html", sel: ".qc-draft-actions", place: "left", tab: "all", drawer: "demo-1",
      kick: "The send gate", title: "One Send — you're the gate",
      body: "You see the branded email exactly as the customer will. One <b>Send</b> button: leave it alone and the branded quote goes as-is; choose <b>Edit the text</b> and your own words go instead, as a plain reply. Nothing leaves until you press it." },

    { page: "dashboard.html", sel: "#selectAll", place: "bottom", tab: "all",
      kick: "Efficiency", title: "Work in bulk",
      body: "Tick the boxes to select several quotes at once, then send or label them all from the bar that appears. Handy when a batch of green-tier drafts is ready to go." },

    { page: "insights.html", sel: "#grid", place: "top",
      kick: "Reporting", title: "Insights that add up",
      body: "Real reporting on your book: win-rate, volume over time, margin distribution, response time, top customers and gap trends — all computed from your quotes, with a time-range switch up top." },

    { page: "activity.html", sel: "#feed", place: "top",
      kick: "Audit trail", title: "One timeline of everything",
      body: "Every draft, approval, send, resolution and outcome on a single reverse-chronological feed — from real timestamps, nothing fabricated. Your team's paper trail, searchable and filterable." },

    { page: "customers.html", sel: "#custTable", place: "top",
      kick: "Memory", title: "The pipeline remembers customers",
      body: "As RFQs arrive, senders are remembered here — quote and order counts, currency and colour preferences, when you last spoke. It's how repeat quotes get faster and more accurate. Open any client to correct their details, or to forget them." },

    { page: "gaps.html", sel: "#gaps", place: "top",
      kick: "Demand signal", title: "See what you don't stock — yet",
      body: "Every time a customer asks for something not in the catalogue, it's logged and ranked here. A live demand signal for what to source next, straight from real requests." },

    { page: "settings.html", sel: "#sec-automation", place: "top", click: "#tab-automation",
      kick: "Control", title: "Dial in your autonomy",
      body: "Decide how much runs on its own: <b>auto-fill</b> repeat lines, <b>auto-send</b> green-tier quotes (off by default — you stay the gate), and automatic <b>follow-ups</b> when a customer goes quiet. Loosen it as you learn to trust the drafts." },

    { page: "settings.html", finale: true, place: "center",
      kick: "That's the tour", title: "You're all set",
      body: "That's the whole console. This walkthrough ran on <b>sample data</b> — your real account starts clean, and nothing here was saved. Re-run this any time with <b>Take the tour</b> in the header." }
  ];

  // ── helpers ──────────────────────────────────────────────────────────────────
  function pageName() { var p = location.pathname.split("/").pop(); return p || "dashboard.html"; }
  function reduceMotion() { try { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) { return false; } }
  function demoOn() { return !!(window.QWDemo && window.QWDemo.isOn()); }

  function readState() { try { return JSON.parse(sessionStorage.getItem(SKEY) || "null"); } catch (e) { return null; } }
  function writeState(s) { try { sessionStorage.setItem(SKEY, JSON.stringify(s)); } catch (e) {} }
  function clearState() { try { sessionStorage.removeItem(SKEY); } catch (e) {} }
  function isActive() { var s = readState(); return !!(s && s.active); }

  // ── overlay ──────────────────────────────────────────────────────────────────
  function ensureOverlay() {
    if (spot && tip) return;
    spot = document.createElement("div");
    spot.className = "qw-tour-spot no-target";
    spot.setAttribute("aria-hidden", "true");
    tip = document.createElement("div");
    tip.className = "qw-tour-tip";
    tip.setAttribute("role", "dialog");
    tip.setAttribute("aria-live", "polite");
    tip.setAttribute("aria-label", tt("tour.aria", "Guided tour"));
    document.body.appendChild(spot);
    document.body.appendChild(tip);

    tip.addEventListener("click", function (e) {
      var b = e.target.closest ? e.target.closest("[data-tour]") : null;
      if (!b) return;
      var a = b.getAttribute("data-tour");
      if (a === "next") next();
      else if (a === "back") back();
      else if (a === "skip") skip();
    });

    if (!overlayWired) {
      overlayWired = true;
      document.addEventListener("keydown", onKey, true);
      window.addEventListener("resize", onReflow, true);
      window.addEventListener("scroll", onReflow, true);
    }
  }

  var reflowRaf = null;
  function onReflow() {
    if (!isActive() || curStep == null || curStep.finale) return;
    if (reflowRaf) return;
    reflowRaf = requestAnimationFrame(function () { reflowRaf = null; reposition(); });
  }
  function onKey(e) {
    if (!isActive() || curIdx < 0) return;
    var tag = (e.target && e.target.tagName || "").toLowerCase();
    if (tag === "input" || tag === "textarea" || tag === "select") { if (e.key === "Escape") { e.preventDefault(); skip(); } return; }
    if (e.key === "ArrowRight" || e.key === "Enter") { e.preventDefault(); next(); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); back(); }
    else if (e.key === "Escape") { e.preventDefault(); skip(); }
  }

  function teardown() {
    if (tip && tip.parentNode) tip.parentNode.removeChild(tip);
    if (spot && spot.parentNode) spot.parentNode.removeChild(spot);
    tip = spot = null; curIdx = -1; curStep = null; lastRect = null;
  }

  // ── step preparation (drive the page into the right state) ───────────────────
  function prepare(s) {
    if (window.QWDash) {
      if (s.drawer) { QWDash.setView("all"); QWDash.openDrawer(s.drawer); }
      else { QWDash.closeDrawer(); if (s.tab) QWDash.setView(s.tab); }
    }
    // The rail is collapsed by default — expand it while a step highlights it so the
    // labels are visible, and let it re-collapse for every other step.
    if (window.QWNav) { if (s.rail) QWNav.expand(); else QWNav.collapse(); }
    if (s.click) { var n = document.querySelector(s.click); if (n) { try { n.click(); } catch (e) {} } }
  }

  // ── show a step ──────────────────────────────────────────────────────────────
  function waitForTarget(sel, cb) {
    var tries = 0, max = 24;                 // ~3s at 125ms
    (function poll() {
      var n = sel ? document.querySelector(sel) : null;
      var visible = n && (n.offsetWidth > 0 || n.offsetHeight > 0 || n.getClientRects().length);
      if (visible) return cb(n);
      if (++tries >= max) return cb(null);
      setTimeout(poll, 125);
    })();
  }

  function showStep(i) {
    ensureOverlay();
    curIdx = i; curStep = STEPS[i];
    var s = curStep;
    prepare(s);
    renderTip(s, i);

    if (s.finale || !s.sel) { position(null); return; }
    waitForTarget(s.sel, function (elm) {
      if (curIdx !== i) return;                // navigated on while waiting
      if (!elm) { position(null); return; }    // fail-safe: explain centred
      try { elm.scrollIntoView({ block: "center", inline: "nearest", behavior: reduceMotion() ? "auto" : "smooth" }); } catch (e) {}
      setTimeout(function () { if (curIdx === i) reposition(); }, reduceMotion() ? 0 : 240);
    });
  }

  function reposition() {
    if (!curStep || !curStep.sel) { position(null); return; }
    var n = document.querySelector(curStep.sel);
    var r = n && (n.offsetWidth > 0 || n.offsetHeight > 0) ? n.getBoundingClientRect() : null;
    position(r);
  }

  function position(rect) {
    if (!spot || !tip) return;
    lastRect = rect;
    // spotlight
    if (!rect) { spot.className = "qw-tour-spot no-target"; }
    else {
      spot.className = "qw-tour-spot";
      var pad = 6;
      spot.style.left = Math.round(rect.left - pad) + "px";
      spot.style.top = Math.round(rect.top - pad) + "px";
      spot.style.width = Math.round(rect.width + pad * 2) + "px";
      spot.style.height = Math.round(rect.height + pad * 2) + "px";
    }
    placeTip(rect);
    requestAnimationFrame(function () { if (tip) tip.classList.add("in"); });
  }

  function placeTip(rect) {
    var margin = 12, gap = 14;
    var tw = tip.offsetWidth || 320, th = tip.offsetHeight || 160;
    var vw = window.innerWidth, vh = window.innerHeight;
    if (!rect) {
      tip.style.left = Math.round((vw - tw) / 2) + "px";
      tip.style.top = Math.round((vh - th) / 2) + "px";
      tip.setAttribute("data-arrow", "none");
      return;
    }
    var pref = curStep && curStep.place;
    var below = vh - rect.bottom, above = rect.top, right = vw - rect.right, left = rect.left;
    var side = (pref && pref !== "center") ? pref : null;
    if (!side) {
      if (below >= th + gap + margin) side = "bottom";
      else if (above >= th + gap + margin) side = "top";
      else if (right >= tw + gap + margin) side = "right";
      else if (left >= tw + gap + margin) side = "left";
      else side = below >= above ? "bottom" : "top";
    }
    // if preferred side has no room, fall back sensibly
    if (side === "bottom" && below < th + gap + margin && above >= th + gap + margin) side = "top";
    if (side === "top" && above < th + gap + margin && below >= th + gap + margin) side = "bottom";
    if (side === "left" && left < tw + gap + margin && right >= tw + gap + margin) side = "right";
    if (side === "right" && right < tw + gap + margin && left >= tw + gap + margin) side = "left";

    var x, y, arrow;
    if (side === "bottom" || side === "top") {
      x = rect.left + rect.width / 2 - tw / 2;
      x = Math.max(margin, Math.min(x, vw - tw - margin));
      y = side === "bottom" ? rect.bottom + gap : rect.top - th - gap;
      y = Math.max(margin, Math.min(y, vh - th - margin));
      arrow = side === "bottom" ? "top" : "bottom";
      var ax = rect.left + rect.width / 2 - x - 6;
      tip.style.setProperty("--ax", Math.max(14, Math.min(ax, tw - 26)) + "px");
    } else {
      y = rect.top + rect.height / 2 - th / 2;
      y = Math.max(margin, Math.min(y, vh - th - margin));
      x = side === "right" ? rect.right + gap : rect.left - tw - gap;
      x = Math.max(margin, Math.min(x, vw - tw - margin));
      arrow = side === "right" ? "left" : "right";
      var ay = rect.top + rect.height / 2 - y - 6;
      tip.style.setProperty("--ay", Math.max(14, Math.min(ay, th - 26)) + "px");
    }
    tip.style.left = Math.round(x) + "px";
    tip.style.top = Math.round(y) + "px";
    tip.setAttribute("data-arrow", arrow);
  }

  function renderTip(s, i) {
    tip.classList.remove("in");
    var last = i === STEPS.length - 1;
    var dots = "";
    for (var d = 0; d < STEPS.length; d++)
      dots += '<span class="qw-tour-dot' + (d === i ? " on" : d < i ? " done" : "") + '"></span>';
    var finaleIco = s.finale
      ? '<div class="qw-tour-finale-ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5L20 7"/></svg></div>'
      : "";
    tip.className = "qw-tour-tip" + (s.finale ? " finale" : "");
    var kick = tt("tour.step" + i + ".kick", s.kick);
    var title = tt("tour.step" + i + ".title", s.title);
    var body = tt("tour.step" + i + ".body", s.body);
    tip.innerHTML =
      '<button type="button" class="qw-tour-skip" data-tour="skip">' + (last ? tt("tour.close", "Close") : tt("tour.skip", "Skip tour")) + '</button>' +
      finaleIco +
      '<div class="qw-tour-kick">' + kick + "</div>" +
      "<h3>" + title + "</h3>" +
      "<p>" + body + "</p>" +
      '<div class="qw-tour-foot">' +
        '<div class="qw-tour-dots">' + dots + "</div>" +
        (i > 0 ? '<button type="button" class="qw-tour-btn back" data-tour="back">' + tt("tour.back", "Back") + '</button>' : "") +
        '<button type="button" class="qw-tour-btn next" data-tour="next">' + (last ? tt("tour.finish", "Finish") : tt("tour.next", "Next")) + "</button>" +
      "</div>";
    // focus the primary action for keyboard users
    var nextBtn = tip.querySelector(".qw-tour-btn.next");
    if (nextBtn) setTimeout(function () { try { nextBtn.focus({ preventScroll: true }); } catch (e) {} }, 30);
  }

  // ── navigation ───────────────────────────────────────────────────────────────
  function goTo(i) {
    if (i < 0 || i >= STEPS.length) return;
    var s = STEPS[i];
    writeState({ active: true, idx: i });
    if (s.page !== pageName()) { teardown(); location.href = s.page; return; }  // cross-page
    showStep(i);
  }
  function next() { if (curIdx >= STEPS.length - 1) finish(); else goTo(curIdx + 1); }
  function back() { if (curIdx > 0) goTo(curIdx - 1); }

  function end(markDone) {
    if (markDone) setTourDone();
    if (window.QWDemo) QWDemo.disable();
    if (window.QWNav) QWNav.collapse();
    clearState();
    if (window.QWDash) { try { QWDash.closeDrawer(); } catch (e) {} }
    teardown();
    // land on a clean console with the real (possibly empty) data restored
    if (pageName() === "dashboard.html") location.reload();
    else location.href = "dashboard.html";
  }
  function finish() { end(true); }
  function skip() { end(true); }

  function setTourDone() {
    if (sbRef && sbRef.auth && typeof sbRef.auth.updateUser === "function") {
      try { sbRef.auth.updateUser({ data: { tour_done: true } }); } catch (e) {}
    }
  }

  // ── start / resume / auto-start ──────────────────────────────────────────────
  function start() {
    started = true;
    if (window.QWDemo) QWDemo.enable();
    writeState({ active: true, idx: 0 });
    var s0 = STEPS[0];
    if (pageName() !== s0.page) { location.href = s0.page; return; }
    location.reload();   // reload so the page loads under demo data, then resume at step 0
  }

  function resume() {
    var st = readState(); if (!st) return;
    var idx = st.idx || 0;
    var s = STEPS[idx] || STEPS[0];
    if (s.page !== pageName()) { location.href = s.page; return; }   // wrong page → go to it
    if (!demoOn()) { if (window.QWDemo) QWDemo.enable(); location.reload(); return; } // ensure demo data
    ensureOverlay();
    setTimeout(function () { if (isActive()) showStep(idx); }, 360); // let page data render
  }

  function maybeAutoStart(sb) {
    if (started || isActive()) return;
    // STRICT SEQUENCING: the first-run onboarding wizard runs FIRST. Never auto-start
    // the tour while the wizard is on screen — console-onboarding.js calls us back on
    // finish. (Manual "Take the tour" still works; it doesn't route through here.)
    if (window.QWOnboardingActive) return;
    if (!sb || !sb.auth || typeof sb.auth.getUser !== "function") return;
    sb.auth.getUser().then(function (r) {
      // Re-check the gate: the wizard may have opened during this async read (its
      // own DB load resolves after our entry check), so this is the authoritative
      // point right before we'd start. Prevents the tour racing over the wizard.
      if (window.QWOnboardingActive || started || isActive()) return;
      var u = r && r.data && r.data.user;
      var md = (u && u.user_metadata) || {};
      if (md.tour_done === true) return;      // already toured
      if (md.onboarded !== true) return;      // onboarding runs first; it re-calls us on finish
      start();
    }, function () {});
  }

  // ── "Take the tour" control — lives on the Settings page ─────────────────────
  // The button is static markup in settings.html (#qwTourBtn); here we just wire it
  // to launch the tour. On every other console page there's no such node, so this is
  // a no-op — the tour is re-launched from Settings, not the nav.
  function mountButton() {
    var b = document.getElementById("qwTourBtn");
    if (!b || b.getAttribute("data-tour-wired") === "1") return;
    b.setAttribute("data-tour-wired", "1");
    b.addEventListener("click", function () { start(); });
  }

  // ── entry point (called from each console page once the user is active) ──────
  function onConsoleReady(sb, user) {
    sbRef = sb || sbRef;
    mountButton();
    if (isActive()) { resume(); return; }
    maybeAutoStart(sb);
  }

  // Live language switch: if the tour is open, re-render the current step (kicker,
  // title, body, nav buttons) in the new language and re-place the tip. No reload.
  window.addEventListener("qw:langchange", function () {
    if (isActive() && curIdx >= 0 && curStep && tip) {
      renderTip(curStep, curIdx);
      reposition();
    }
  });

  window.QWTour = {
    onConsoleReady: onConsoleReady,
    maybeAutoStart: maybeAutoStart,
    start: start,
    isActive: isActive
  };
})();
