/* Settings hub. Reads + UPSERTs the single public.autonomy_settings row
   (owner = QW_CONFIG.OWNER). RLS: authenticated SELECT + authenticated UPDATE
   + owner-scoped INSERT (settings-autoseed.sql) so a first save creates the row.
   Four sections — Profile, Quoting voice, Automation & autonomy, Notifications —
   each loads current values and persists via an authenticated UPDATE with a toast.
   Degrades gracefully when the settings columns / table don't exist yet. */
(function () {
  "use strict";

  // ── i18n dictionary for the Settings surface ──────────────────────────────
  if (window.QWI18n && QWI18n.add) QWI18n.add({
    en: {
      "set.lang.label": "Console language",
      "set.lang.hint": "The language of this console. Separate from the language your quotes go out in.",
      "set.kicker": "Settings",
      "set.h1": "How Quotewright works for you",
      "set.lede": "Your details, the voice quotes go out in, and exactly how much the pipeline does on its own. Every switch here changes real behaviour — nothing is decorative.",
      "set.tab.profile": "Profile", "set.tab.voice": "Quoting voice",
      "set.tab.automation": "Automation", "set.tab.notif": "Notifications",
      "set.profile.h3": "Your profile",
      "set.profile.sub": "Who the quotes come from. Your name and company appear on the sign-off; the rest is kept for the record.",
      "set.f.name": "Your name", "set.f.company": "Company", "set.f.role": "Role",
      "set.f.phone": "Phone", "set.f.country": "Country", "set.f.address": "Business address",
      "set.profile.save": "Save profile",
      "set.voice.h3": "Quoting voice",
      "set.voice.sub": "The language, sign-off and default terms every quote goes out with. The pipeline still replies in the customer's own language when you leave language on auto.",
      "set.voice.replyLang": "Reply language",
      "set.voice.replyAuto": "Auto — match the customer's language",
      "set.voice.replyHint": "Auto is recommended — the customer hears back in the language they wrote in. Pick a fixed language only to force every quote into one.",
      "set.voice.incoterm": "Default incoterm",
      "set.voice.incotermHint": "The shipping term quotes assume unless the customer names another.",
      "set.voice.validity": "Quote validity (days)",
      "set.voice.validityHint": "How long the prices in a quote stand before the footer says they may change.",
      "set.voice.sig": "Sign-off / signature",
      "set.voice.sigHint": "Closes every quote email. Leave blank to use the standard sign-off.",
      "set.voice.save": "Save quoting voice",
      "set.incoterm.EXW": "EXW — Ex Works", "set.incoterm.FCA": "FCA — Free Carrier",
      "set.incoterm.FOB": "FOB — Free On Board", "set.incoterm.CFR": "CFR — Cost & Freight",
      "set.incoterm.CIF": "CIF — Cost, Insurance & Freight", "set.incoterm.CPT": "CPT — Carriage Paid To",
      "set.incoterm.CIP": "CIP — Carriage & Insurance Paid", "set.incoterm.DAP": "DAP — Delivered At Place",
      "set.incoterm.DPU": "DPU — Delivered At Place Unloaded", "set.incoterm.DDP": "DDP — Delivered Duty Paid",
      "set.auto.h3": "Automation & autonomy",
      "set.auto.sub": "How much the pipeline does on its own — from filling repeat prices to sending finished quotes. Start conservative; loosen once you trust it.",
      "set.auto.autoResolve": "Auto-fill repeat lines",
      "set.auto.autoResolveHint": "When a line is an <b>exact repeat</b> of one your team already resolved before, the pipeline reuses that decision automatically instead of flagging it again. When off, every unmatched line waits for a human — exactly as today.",
      "set.auto.sendGate": "The send gate",
      "set.auto.autoSend": "Send green-tier quotes automatically",
      "set.auto.autoSendHint": "The one money-facing switch. When on, only quotes that clear <b>both</b> green gates below send on their own. Amber and red always wait. When off, nothing sends — the pipeline just drafts.",
      "set.auto.greenConf": "Green · minimum confidence",
      "set.auto.greenConfDesc": "How sure the match has to be before a quote counts as green. Higher = the system only trusts itself on near-certain matches.",
      "set.auto.greenMargin": "Green · minimum margin",
      "set.auto.greenMarginDesc": "The deal also has to be healthy. Below this margin a quote can never be green — it drops to amber for a look.",
      "set.auto.amberConf": "Amber · minimum confidence",
      "set.auto.amberConfDesc": "The floor for \"worth reviewing.\" Above this (but short of green) a quote is amber. Below it, the quote is red — flagged for a careful look.",
      "set.auto.marginFloor": "Thin-margin floor",
      "set.auto.marginFloorDesc": "Any quote landing under this margin is tagged <b>needs approval</b> — held for a human even when confidence is high. Your safety net against underpricing.",
      "set.auto.followups": "Follow-ups",
      "set.auto.chase": "Chase quotes that go quiet",
      "set.auto.waitNudge": "Wait before nudging", "set.auto.maxNudges": "Maximum nudges",
      "set.unit.days": "days", "set.unit.total": "total",
      "set.auto.clarifications": "Clarifications",
      "set.auto.clarifyHint": "When a line is missing a spec the pipeline needs a question answered. Choose whether that question goes straight to the customer, or waits as a draft for you.",
      "set.auto.clarifyDraftT": "Draft it for me", "set.auto.clarifyDraftD": "Waits in the console for your OK",
      "set.auto.clarifySendT": "Send straight away", "set.auto.clarifySendD": "The question goes to the customer at once",
      "set.auto.save": "Save automation",
      "set.notif.h3": "Notifications",
      "set.notif.sub": "What lands in your inbox. Everything is a summary — the pipeline never emails a customer without your sign-off unless you turned that on above.",
      "set.notif.digest": "Daily digest",
      "set.notif.digestHint": "One email each morning: quotes drafted, replies in, anything waiting on you, and the day's catalogue gaps.",
      "set.notif.thin": "Thin-margin alerts",
      "set.notif.thinHint": "An immediate heads-up whenever a fresh quote lands under your thin-margin floor — so nothing underpriced slips past.",
      "set.notif.save": "Save notifications",
      "set.help.h3": "Guided tour & help",
      "set.help.body": "A quick walkthrough of the whole console — the quotes queue, the send gate, insights and settings. It runs on sample data and changes nothing in your account.",
      "set.help.take": "Take the tour",
      // switch state lines
      "set.sw.autoResolve.on": "On — exact repeats fill themselves",
      "set.sw.autoResolve.off": "Off — the sales team picks each first-time match",
      "set.sw.autoSend.on": "On — green-tier quotes send automatically",
      "set.sw.autoSend.off": "Off — every quote waits for you",
      "set.sw.followup.on": "On — a gentle nudge if the customer goes silent",
      "set.sw.followup.off": "Off — quiet quotes are left alone",
      "set.sw.digest.on": "On — a morning rollup of activity",
      "set.sw.digest.off": "Off — no daily email",
      "set.sw.thin.on": "On — flag me the moment a quote dips low",
      "set.sw.thin.off": "Off — no thin-margin pings",
      // status / toasts
      "set.unsaved": "Unsaved changes", "set.saved": "Saved ✓",
      "set.demoNotSaved": "Demo — not saved",
      "set.toast.demo": "Demo mode — settings aren't saved.",
      "set.toast.saved": "Saved.",
      "set.toast.network": "Network error — not saved.",
      "set.toast.missingCols": "Some settings columns aren't there yet — run quotewright-settings.sql, then save again.",
      "set.toast.saveFail": "Couldn't save: {msg}",
      "set.toast.noRow": "No settings row for {owner} — run quotewright-settings.sql (it seeds the row).",
      "set.toast.defaults": "No saved row yet — showing defaults. Saving needs the seeded row (run quotewright-settings.sql).",
      "set.err.unknown": "unknown error",
      "set.missing.h4": "Settings aren't switched on yet",
      "set.missing.body": "The <code>autonomy_settings</code> table doesn't exist. Run <code>quotewright-intelligence.sql</code> then <code>quotewright-settings.sql</code> in the Supabase SQL editor — they create the table, add the settings columns and seed the row for <code>{owner}</code>.",
      "set.load.errH4": "Couldn't load settings",
      "set.load.errBody": "Something went wrong reaching the settings store.",
      "set.load.netErr": "Network error — check your connection and try again.",
      // ── readiness locks ──
      "set.lock.autoSend.notready": "Auto-send grades quotes by profit margin, which needs your product cost prices. Coverage is {pct}% — auto-send unlocks at 60%.",
      "set.lock.thin.notready": "Thin-margin alerts need product cost prices to measure margin. Coverage is {pct}% — unlocks at 60%.",
      "set.lock.cost.checking": "Checking whether your catalogue has enough cost data — this unlocks once that's confirmed.",
      "set.lock.cost.error": "Couldn't check your cost-data readiness, so this stays locked until it can be confirmed. Reload to try again.",
      "set.lock.notDeployed": "This isn't switched on for your account yet.",
      "set.lock.profile": "Your quote letterhead currently uses a fixed Hassan footer. These fields will apply once custom letterhead is enabled for your account.",
      "set.lock.savedInactive": "Saved earlier, but not in effect until this unlocks.",
      "set.confirm.autoSend.title": "Turn on automatic sending?",
      "set.confirm.autoSend.body": "This sends green-tier quotes to customers automatically, without a review step. Continue?",
      "set.confirm.autoSend.ok": "Turn on auto-send"
    },
    tr: {
      "set.lang.label": "Konsol dili",
      "set.lang.hint": "Bu konsolun dili. Tekliflerinizin yazıldığı dilden ayrıdır.",
      "set.kicker": "Ayarlar",
      "set.h1": "Quotewright sizin için nasıl çalışır",
      "set.lede": "Bilgileriniz, tekliflerin çıktığı üslup ve akışın kendi başına ne kadarını yaptığı. Buradaki her anahtar gerçek davranışı değiştirir — hiçbiri süs değildir.",
      "set.tab.profile": "Profil", "set.tab.voice": "Teklif üslubu",
      "set.tab.automation": "Otomasyon", "set.tab.notif": "Bildirimler",
      "set.profile.h3": "Profiliniz",
      "set.profile.sub": "Tekliflerin kimden geldiği. Adınız ve şirketiniz imzada görünür; gerisi kayıt için tutulur.",
      "set.f.name": "Adınız", "set.f.company": "Şirket", "set.f.role": "Görev",
      "set.f.phone": "Telefon", "set.f.country": "Ülke", "set.f.address": "İş adresi",
      "set.profile.save": "Profili kaydet",
      "set.voice.h3": "Teklif üslubu",
      "set.voice.sub": "Her teklifin taşıdığı dil, imza ve varsayılan koşullar. Dili otomatik bıraktığınızda akış yine de müşterinin kendi dilinde yanıt verir.",
      "set.voice.replyLang": "Yanıt dili",
      "set.voice.replyAuto": "Otomatik — müşterinin diline uy",
      "set.voice.replyHint": "Otomatik önerilir — müşteri yazdığı dilde yanıt alır. Her teklifi tek bir dile zorlamak için yalnızca sabit bir dil seçin.",
      "set.voice.incoterm": "Varsayılan teslim şekli (incoterm)",
      "set.voice.incotermHint": "Müşteri başka bir şey belirtmedikçe tekliflerin varsaydığı teslim koşulu.",
      "set.voice.validity": "Teklif geçerliliği (gün)",
      "set.voice.validityHint": "Fiyatların, alt bilgide değişebileceği yazılmadan önce kaç gün geçerli kalacağı.",
      "set.voice.sig": "İmza / kapanış",
      "set.voice.sigHint": "Her teklif e-postasını kapatır. Standart imzayı kullanmak için boş bırakın.",
      "set.voice.save": "Teklif üslubunu kaydet",
      "set.incoterm.EXW": "EXW — Ticari İşletmede Teslim", "set.incoterm.FCA": "FCA — Taşıyıcıya Teslim",
      "set.incoterm.FOB": "FOB — Gemide Teslim", "set.incoterm.CFR": "CFR — Masraf ve Navlun",
      "set.incoterm.CIF": "CIF — Masraf, Sigorta ve Navlun", "set.incoterm.CPT": "CPT — Taşıma Ödenmiş Teslim",
      "set.incoterm.CIP": "CIP — Taşıma ve Sigorta Ödenmiş Teslim", "set.incoterm.DAP": "DAP — Belirlenen Yerde Teslim",
      "set.incoterm.DPU": "DPU — Belirlenen Yerde Boşaltılmış Teslim", "set.incoterm.DDP": "DDP — Gümrük Vergileri Ödenmiş Teslim",
      "set.auto.h3": "Otomasyon ve özerklik",
      "set.auto.sub": "Akışın kendi başına ne kadarını yaptığı — tekrarlayan fiyatları doldurmaktan bitmiş teklifleri göndermeye kadar. Temkinli başlayın; güvendikçe gevşetin.",
      "set.auto.autoResolve": "Tekrarlayan satırları otomatik doldur",
      "set.auto.autoResolveHint": "Bir satır, ekibinizin daha önce çözdüğü bir satırın <b>birebir tekrarı</b> olduğunda, akış onu yeniden işaretlemek yerine o kararı otomatik olarak yeniden kullanır. Kapalıyken, eşleşmeyen her satır bir insanı bekler — tıpkı bugünkü gibi.",
      "set.auto.sendGate": "Gönderim kapısı",
      "set.auto.autoSend": "Yeşil kademe teklifleri otomatik gönder",
      "set.auto.autoSendHint": "Paraya dokunan tek anahtar. Açıkken yalnızca aşağıdaki <b>her iki</b> yeşil eşiği geçen teklifler kendiliğinden gönderilir. Sarı ve kırmızı her zaman bekler. Kapalıyken hiçbir şey gönderilmez — akış yalnızca taslak hazırlar.",
      "set.auto.greenConf": "Yeşil · en düşük güven",
      "set.auto.greenConfDesc": "Bir teklifin yeşil sayılması için eşleşmenin ne kadar kesin olması gerektiği. Yüksek = sistem yalnızca neredeyse kesin eşleşmelerde kendine güvenir.",
      "set.auto.greenMargin": "Yeşil · en düşük kâr marjı",
      "set.auto.greenMarginDesc": "Anlaşmanın da sağlıklı olması gerekir. Bu marjın altında bir teklif asla yeşil olamaz — incelenmek üzere sarıya düşer.",
      "set.auto.amberConf": "Sarı · en düşük güven",
      "set.auto.amberConfDesc": "\"İncelemeye değer\" için alt sınır. Bunun üstünde (ama yeşilin altında) bir teklif sarıdır. Altında ise kırmızıdır — dikkatli bir bakış için işaretlenir.",
      "set.auto.marginFloor": "İnce marj tabanı",
      "set.auto.marginFloorDesc": "Bu marjın altına düşen her teklif <b>onay gerekir</b> olarak etiketlenir — güven yüksek olsa bile bir insana bırakılır. Düşük fiyatlandırmaya karşı güvenlik ağınız.",
      "set.auto.followups": "Takipler",
      "set.auto.chase": "Sessizleşen teklifleri takip et",
      "set.auto.waitNudge": "Dürtmeden önce bekle", "set.auto.maxNudges": "En fazla dürtme",
      "set.unit.days": "gün", "set.unit.total": "toplam",
      "set.auto.clarifications": "Açıklamalar",
      "set.auto.clarifyHint": "Bir satırda eksik bir özellik olduğunda akışın bir sorunun yanıtlanmasına ihtiyacı olur. Bu sorunun doğrudan müşteriye mi gideceğini yoksa size taslak olarak mı bekleyeceğini seçin.",
      "set.auto.clarifyDraftT": "Benim için taslak hazırla", "set.auto.clarifyDraftD": "Onayınız için konsolda bekler",
      "set.auto.clarifySendT": "Hemen gönder", "set.auto.clarifySendD": "Soru anında müşteriye gider",
      "set.auto.save": "Otomasyonu kaydet",
      "set.notif.h3": "Bildirimler",
      "set.notif.sub": "Gelen kutunuza ne düşeceği. Her şey bir özettir — yukarıda açmadığınız sürece akış, onayınız olmadan asla bir müşteriye e-posta göndermez.",
      "set.notif.digest": "Günlük özet",
      "set.notif.digestHint": "Her sabah tek e-posta: hazırlanan teklifler, gelen yanıtlar, sizi bekleyen her şey ve günün katalog boşlukları.",
      "set.notif.thin": "İnce marj uyarıları",
      "set.notif.thinHint": "Yeni bir teklif ince marj tabanınızın altına düştüğü anda hemen haber — böylece düşük fiyatlı hiçbir şey gözden kaçmaz.",
      "set.notif.save": "Bildirimleri kaydet",
      "set.help.h3": "Rehberli tur ve yardım",
      "set.help.body": "Tüm konsolun kısa bir gezisi — teklif kuyruğu, gönderim kapısı, analizler ve ayarlar. Örnek veriyle çalışır ve hesabınızda hiçbir şeyi değiştirmez.",
      "set.help.take": "Turu başlat",
      "set.sw.autoResolve.on": "Açık — birebir tekrarlar kendiliğinden dolar",
      "set.sw.autoResolve.off": "Kapalı — her ilk eşleşmeyi satış ekibi seçer",
      "set.sw.autoSend.on": "Açık — yeşil kademe teklifler otomatik gönderilir",
      "set.sw.autoSend.off": "Kapalı — her teklif sizi bekler",
      "set.sw.followup.on": "Açık — müşteri sessizleşirse nazik bir dürtme",
      "set.sw.followup.off": "Kapalı — sessiz teklifler rahat bırakılır",
      "set.sw.digest.on": "Açık — sabah etkinlik derlemesi",
      "set.sw.digest.off": "Kapalı — günlük e-posta yok",
      "set.sw.thin.on": "Açık — bir teklif düştüğü anda beni uyar",
      "set.sw.thin.off": "Kapalı — ince marj uyarısı yok",
      "set.unsaved": "Kaydedilmemiş değişiklikler", "set.saved": "Kaydedildi ✓",
      "set.demoNotSaved": "Demo — kaydedilmedi",
      "set.toast.demo": "Demo modu — ayarlar kaydedilmez.",
      "set.toast.saved": "Kaydedildi.",
      "set.toast.network": "Ağ hatası — kaydedilmedi.",
      "set.toast.missingCols": "Bazı ayar sütunları henüz yok — quotewright-settings.sql'i çalıştırın, sonra tekrar kaydedin.",
      "set.toast.saveFail": "Kaydedilemedi: {msg}",
      "set.toast.noRow": "{owner} için ayar satırı yok — quotewright-settings.sql'i çalıştırın (satırı oluşturur).",
      "set.toast.defaults": "Henüz kayıtlı satır yok — varsayılanlar gösteriliyor. Kaydetmek için oluşturulmuş satır gerekir (quotewright-settings.sql).",
      "set.err.unknown": "bilinmeyen hata",
      "set.missing.h4": "Ayarlar henüz açık değil",
      "set.missing.body": "<code>autonomy_settings</code> tablosu yok. Supabase SQL düzenleyicisinde önce <code>quotewright-intelligence.sql</code> sonra <code>quotewright-settings.sql</code> dosyasını çalıştırın — bunlar tabloyu oluşturur, ayar sütunlarını ekler ve <code>{owner}</code> için satırı hazırlar.",
      "set.load.errH4": "Ayarlar yüklenemedi",
      "set.load.errBody": "Ayar deposuna erişirken bir şeyler ters gitti.",
      "set.load.netErr": "Ağ hatası — bağlantınızı kontrol edip yeniden deneyin.",
      // ── hazırlık kilitleri ──
      "set.lock.autoSend.notready": "Otomatik gönderim, teklifleri kâr marjına göre derecelendirir ve bunun için ürün maliyet fiyatlarınız gerekir. Kapsam %{pct} — otomatik gönderim %60'ta açılır.",
      "set.lock.thin.notready": "İnce marj uyarıları, marjı ölçmek için ürün maliyet fiyatlarına ihtiyaç duyar. Kapsam %{pct} — %60'ta açılır.",
      "set.lock.cost.checking": "Kataloğunuzda yeterli maliyet verisi olup olmadığı kontrol ediliyor — doğrulanınca açılır.",
      "set.lock.cost.error": "Maliyet verisi hazırlığınız kontrol edilemedi; doğrulanana kadar kilitli kalır. Yeniden denemek için sayfayı yenileyin.",
      "set.lock.notDeployed": "Bu özellik hesabınız için henüz açık değil.",
      "set.lock.profile": "Teklif antetiniz şu anda sabit bir Hassan alt bilgisi kullanıyor. Bu alanlar, hesabınız için özel antet etkinleştirildiğinde geçerli olacak.",
      "set.lock.savedInactive": "Daha önce kaydedildi, ancak bu açılana kadar yürürlükte değil.",
      "set.confirm.autoSend.title": "Otomatik gönderim açılsın mı?",
      "set.confirm.autoSend.body": "Bu, yeşil kademe teklifleri bir inceleme adımı olmadan müşterilere otomatik gönderir. Devam edilsin mi?",
      "set.confirm.autoSend.ok": "Otomatik gönderimi aç"
    }
  });
  function tt(key, vars) { return (window.QWI18n && QWI18n.t) ? QWI18n.t(key, vars) : key; }

  var Q = window.QWConsole;
  var el = Q.el, esc = Q.esc, num = Q.numOrNull, toast = Q.toast;
  var sb = null;
  var owner = Q.cfg.OWNER || "hassannonwovens";

  var DEFAULTS = {
    display_name: "", company: "", role: "", phone: "", country: "", address: "",
    reply_language: "auto", signature: "", quote_validity_days: 7, default_incoterm: "EXW",
    auto_resolve_enabled: false, auto_send_enabled: false,
    green_min_confidence: 90, green_min_margin: 20, amber_min_confidence: 60,
    margin_floor: 15, followup_enabled: true, followup_days: 5, max_followups: 2,
    clarify_mode: "draft", digest_enabled: true, alert_thin_margin: true
  };
  var SECTIONS = {
    profile: ["display_name", "company", "role", "phone", "country", "address"],
    voice: ["reply_language", "signature", "quote_validity_days", "default_incoterm"],
    automation: ["auto_resolve_enabled", "auto_send_enabled", "green_min_confidence",
      "green_min_margin", "amber_min_confidence", "margin_floor",
      "followup_enabled", "followup_days", "max_followups", "clarify_mode"],
    notif: ["digest_enabled", "alert_thin_margin"]
  };
  var INT_KEYS = { green_min_confidence: 1, amber_min_confidence: 1, quote_validity_days: 1,
    followup_days: 1, max_followups: 1 };

  var state = {}, snapshot = {};
  for (var k in DEFAULTS) state[k] = DEFAULTS[k];

  // ── Readiness gating ──────────────────────────────────────────────────────
  // A gated control stays LOCKED (visually disabled + a plain-language reason)
  // until its precondition is met — then it unlocks itself on the next evaluate,
  // no code change needed. Two precondition sources:
  //   1. DEPLOYED — does the backend wiring for this feature exist yet?
  //   2. costState — from sb.rpc('qw_cost_data_ready') (counts + a boolean only,
  //      never cost values). Fail CLOSED: unknown/error ⇒ locked, never open.
  // auto_send + thin_margin_alert: backend NOT shipped yet (the Margin Scorer send/alert
  // branch is staged pending review). Keep FALSE so these stay locked as "not switched on
  // yet" — flip to true only when that workflow is published, so the toggle never unlocks
  // ahead of a backend that can act on it. digest: shipped & live. letterhead_profile: not built.
  var DEPLOYED = { auto_send: false, thin_margin_alert: false, digest: true, letterhead_profile: false };
  var costState = "checking";   // "checking" | "ready" | "notready" | "error"
  var coveragePct = null;       // integer % from the RPC (for the lock reason)

  // key → text/number/select input id
  var TEXT = {
    f_display_name: "display_name", f_company: "company", f_role: "role",
    f_phone: "phone", f_country: "country", f_address: "address", f_signature: "signature",
    f_reply_language: "reply_language", f_default_incoterm: "default_incoterm",
    f_quote_validity_days: "quote_validity_days", f_followup_days: "followup_days",
    f_max_followups: "max_followups"
  };
  // switch id → { key, row, stateEl, on, off }
  var SWITCHES = {
    autoResolve: { key: "auto_resolve_enabled", row: "autoResolveRow", st: "arState",
      on: "set.sw.autoResolve.on", off: "set.sw.autoResolve.off" },
    autoSend: { key: "auto_send_enabled", row: "switchRow", st: "swState",
      on: "set.sw.autoSend.on", off: "set.sw.autoSend.off", lock: "autoSendLock", gate: "auto_send", confirm: true },
    followupEnabled: { key: "followup_enabled", row: "followupRow", st: "fuState",
      on: "set.sw.followup.on", off: "set.sw.followup.off" },
    digestEnabled: { key: "digest_enabled", row: "digestRow", st: "dgState",
      on: "set.sw.digest.on", off: "set.sw.digest.off" },
    alertThinMargin: { key: "alert_thin_margin", row: "thinRow", st: "tmState",
      on: "set.sw.thin.on", off: "set.sw.thin.off", lock: "thinLock", gate: "thin_margin_alert" }
  };
  var RANGES = {
    greenConf: { key: "green_min_confidence", val: "gcVal" },
    greenMargin: { key: "green_min_margin", val: "gmVal" },
    amberConf: { key: "amber_min_confidence", val: "acVal" },
    marginFloor: { key: "margin_floor", val: "mfVal" }
  };

  Q.boot({ onAuth: function (client) {
    sb = client;
    el("subnav").hidden = false;
    wireTabs();
    wireLangToggle();
    // text / number / select
    Object.keys(TEXT).forEach(function (id) {
      var node = el(id); if (!node) return;
      node.addEventListener("input", function () {
        var v = this.value;
        if (this.type === "number") v = (v === "" ? DEFAULTS[TEXT[id]] : Number(v));
        state[TEXT[id]] = v;
        markDirty();
      });
    });
    // switches
    Object.keys(SWITCHES).forEach(function (id) {
      var node = el(id); if (!node) return;
      node.addEventListener("click", function () {
        // Locked switches are non-interactive (disabled blocks most clicks; guard anyway).
        if (node.disabled || !evalGate(id).active) return;
        var next = !state[SWITCHES[id].key];
        if (next && SWITCHES[id].confirm) {   // first-time enable → make the consequence explicit
          confirmDialog(tt("set.confirm.autoSend.title"), tt("set.confirm.autoSend.body"),
            tt("set.confirm.autoSend.ok"), true).then(function (ok) {
              if (ok) { setSwitch(id, true); markDirty(); }
            });
          return;
        }
        setSwitch(id, next); markDirty();
      });
    });
    // ranges
    Object.keys(RANGES).forEach(function (id) {
      var node = el(id); if (!node) return;
      node.addEventListener("input", function () {
        state[RANGES[id].key] = Number(this.value);
        el(RANGES[id].val).textContent = this.value;
        markDirty();
      });
    });
    // clarify segmented
    var seg = el("clarifySeg");
    if (seg) seg.addEventListener("click", function (e) {
      var b = e.target.closest ? e.target.closest("[data-clarify]") : null;
      if (!b) return;
      setClarify(b.getAttribute("data-clarify")); markDirty();
    });
    // section save buttons (event-delegated on the hub)
    var hub = el("settingsHub");
    hub.addEventListener("click", function (e) {
      var b = e.target.closest ? e.target.closest("[data-save]") : null;
      if (b) save(b.getAttribute("data-save"), b);
    });
    load();
  }});

  // ── language toggle (per-user UI preference via QWI18n) ───────────────────
  function syncLangToggle() {
    var seg = el("langSeg"); if (!seg || !window.QWI18n) return;
    var cur = QWI18n.getLang();
    Array.prototype.forEach.call(seg.querySelectorAll("[data-lang]"), function (b) {
      b.setAttribute("aria-checked", b.getAttribute("data-lang") === cur ? "true" : "false");
    });
  }
  function wireLangToggle() {
    var seg = el("langSeg"); if (!seg || !window.QWI18n) return;
    seg.addEventListener("click", function (e) {
      var b = e.target.closest ? e.target.closest("[data-lang]") : null;
      if (!b) return;
      QWI18n.setLang(b.getAttribute("data-lang"));   // persists + applies + dispatches qw:langchange
    });
    syncLangToggle();
    // Re-label JS-rendered controls live when the language changes (from here or elsewhere).
    window.addEventListener("qw:langchange", function () {
      syncLangToggle();
      // Re-translate switch-state lines + clarify segment without disturbing dirty state.
      Object.keys(SWITCHES).forEach(function (id) { if (el(id)) setSwitch(id, state[SWITCHES[id].key] === true); });
      setClarify(state.clarify_mode === "send" ? "send" : "draft");
      applyGates();   // re-lock gated controls + re-translate their lock reasons
    });
  }

  // ── tabs ────────────────────────────────────────────────────────────────
  function wireTabs() {
    var tabs = Array.prototype.slice.call(document.querySelectorAll(".qc-hubtab"));
    tabs.forEach(function (tab, i) {
      tab.addEventListener("click", function () { selectTab(tab); });
      tab.addEventListener("keydown", function (e) {
        var idx = null;
        if (e.key === "ArrowRight" || e.key === "ArrowDown") idx = (i + 1) % tabs.length;
        else if (e.key === "ArrowLeft" || e.key === "ArrowUp") idx = (i - 1 + tabs.length) % tabs.length;
        else if (e.key === "Home") idx = 0;
        else if (e.key === "End") idx = tabs.length - 1;
        if (idx == null) return;
        e.preventDefault(); selectTab(tabs[idx]); tabs[idx].focus();
      });
    });
    function selectTab(tab) {
      tabs.forEach(function (t) {
        var on = t === tab;
        t.setAttribute("aria-selected", on ? "true" : "false");
        t.tabIndex = on ? 0 : -1;
        var panel = el(t.getAttribute("aria-controls"));
        if (panel) panel.hidden = !on;
      });
    }
  }

  // ── paint from state ────────────────────────────────────────────────────
  function setSwitch(id, on) {
    var s = SWITCHES[id]; state[s.key] = on;
    var sw = el(id);
    sw.setAttribute("aria-checked", on ? "true" : "false");
    el(s.row).classList.toggle("on", on);
    el(s.st).textContent = tt(on ? s.on : s.off);
    if (id === "followupEnabled") { var o = el("followupOpts"); if (o) o.classList.toggle("off", !on); }
  }
  function setClarify(mode) {
    state.clarify_mode = mode;
    var seg = el("clarifySeg"); if (!seg) return;
    Array.prototype.forEach.call(seg.querySelectorAll("[data-clarify]"), function (b) {
      var on = b.getAttribute("data-clarify") === mode;
      b.setAttribute("aria-checked", on ? "true" : "false");
      b.classList.toggle("on", on);
    });
  }
  function paint() {
    Object.keys(TEXT).forEach(function (id) {
      var node = el(id); if (node) node.value = state[TEXT[id]] == null ? "" : state[TEXT[id]];
    });
    Object.keys(SWITCHES).forEach(function (id) { setSwitch(id, state[SWITCHES[id].key] === true); });
    Object.keys(RANGES).forEach(function (id) {
      var r = RANGES[id], node = el(id);
      if (node) node.value = state[r.key];
      el(r.val).textContent = state[r.key];
    });
    setClarify(state.clarify_mode === "send" ? "send" : "draft");
    applyGates();   // lock/unlock gated controls over the top of the plain paint
    Object.keys(SECTIONS).forEach(snapSection);
    Object.keys(SECTIONS).forEach(function (s) { setDirtyNote(s, false); });
  }

  // ── readiness gating ──────────────────────────────────────────────────────
  // Evaluate one gated control's precondition → { active, reasonKey?, vars? }.
  // Fail CLOSED: a checking/error cost state keeps cost-dependent controls locked.
  function evalGate(id) {
    var s = SWITCHES[id];
    if (!s || !s.gate) return { active: true };            // ungated switch
    if (!DEPLOYED[s.gate]) return { active: false, reasonKey: "set.lock.notDeployed", vars: {} };
    if (costState === "ready") return { active: true };
    if (costState === "checking") return { active: false, reasonKey: "set.lock.cost.checking", vars: {} };
    if (costState === "error") return { active: false, reasonKey: "set.lock.cost.error", vars: {} };
    // notready → show live coverage in the reason
    var pfx = id === "autoSend" ? "set.lock.autoSend" : "set.lock.thin";
    return { active: false, reasonKey: pfx + ".notready", vars: { pct: (coveragePct == null ? "—" : coveragePct) } };
  }
  function profileGate() {
    return DEPLOYED.letterhead_profile ? { active: true } : { active: false, reasonKey: "set.lock.profile", vars: {} };
  }
  function setLockNote(noteId, reasonKey, vars, savedInactive) {
    var note = el(noteId); if (!note) return;
    if (!reasonKey) { note.hidden = true; return; }
    var txt = note.querySelector(".qc-locknote-txt");
    var sav = note.querySelector(".qc-locknote-saved");
    if (txt) txt.textContent = tt(reasonKey, vars || {});
    if (sav) {
      if (savedInactive) { sav.hidden = false; sav.textContent = tt("set.lock.savedInactive"); }
      else { sav.hidden = true; sav.textContent = ""; }
    }
    note.hidden = false;
  }
  function applySwitchGate(id) {
    var s = SWITCHES[id], sw = el(id); if (!sw) return;
    var row = el(s.row), g = evalGate(id);
    if (g.active) {
      sw.disabled = false;
      sw.removeAttribute("aria-disabled");
      sw.removeAttribute("aria-describedby");
      if (s.lock) setLockNote(s.lock, null);
      setSwitch(id, state[s.key] === true);   // honest, interactive render
      return;
    }
    // Locked: non-interactive + visually off. A value stored true is shown as
    // locked-and-not-in-effect (never a live green switch); state is NOT mutated.
    var storedOn = state[s.key] === true;
    sw.disabled = true;
    sw.setAttribute("aria-disabled", "true");
    sw.setAttribute("aria-checked", "false");
    if (row) row.classList.remove("on");
    if (row) row.classList.add("locked");
    if (el(s.st)) el(s.st).textContent = tt(s.off);
    if (s.lock) { setLockNote(s.lock, g.reasonKey, g.vars, storedOn); sw.setAttribute("aria-describedby", s.lock); }
  }
  function applyProfileGate() {
    var g = profileGate();
    ["f_display_name", "f_company", "f_role", "f_phone", "f_country", "f_address"].forEach(function (fid) {
      var n = el(fid); if (n) n.disabled = !g.active;
    });
    var saveBtn = document.querySelector('[data-save="profile"]');
    if (saveBtn) saveBtn.disabled = !g.active;
    setLockNote("profileLock", g.active ? null : g.reasonKey, g.vars);
  }
  function applyGates() {
    Object.keys(SWITCHES).forEach(function (id) { if (SWITCHES[id].gate) applySwitchGate(id); });
    applyProfileGate();
  }

  // Ask the DB whether the catalogue carries enough real cost data to grade
  // margins. Counts + a boolean only — never cost values. Fail CLOSED on error.
  function checkCostReady() {
    costState = "checking"; coveragePct = null;
    if (window.QWDemo && QWDemo.isOn()) { costState = "ready"; coveragePct = 100; return; }
    if (!sb || typeof sb.rpc !== "function") { costState = "error"; return; }
    sb.rpc("qw_cost_data_ready").then(function (res) {
      if (res.error) { costState = "error"; coveragePct = null; }
      else {
        var row = Array.isArray(res.data) ? res.data[0] : res.data;
        if (row && typeof row === "object") {
          coveragePct = (row.coverage_pct == null || isNaN(Number(row.coverage_pct))) ? null : Math.round(Number(row.coverage_pct));
          costState = row.ready === true ? "ready" : "notready";
        } else { costState = "error"; coveragePct = null; }
      }
      if (!el("settingsHub").hidden) applyGates();
    }, function () {
      costState = "error"; coveragePct = null;
      if (!el("settingsHub").hidden) applyGates();
    });
  }

  // Promise-based confirm — mirrors dashboard.js confirmDialog (native <dialog>
  // + method="dialog" form → button value becomes returnValue). CSP-safe.
  function confirmDialog(title, body, okLabel, danger) {
    var dlg = el("confirmDialog");
    if (!dlg || typeof dlg.showModal !== "function") return Promise.resolve(window.confirm(title + "\n\n" + body));
    el("confirmTitle").textContent = title;
    el("confirmBody").textContent = body;
    var ok = el("confirmOk");
    ok.textContent = okLabel || tt("common.confirm");
    ok.classList.toggle("is-danger", !!danger);
    return new Promise(function (resolve) {
      function onClose() { dlg.removeEventListener("close", onClose); resolve(dlg.returnValue === "ok"); }
      dlg.addEventListener("close", onClose);
      dlg.showModal();
    });
  }

  // ── dirty tracking (per section) ────────────────────────────────────────
  function sectionVal(section) {
    return SECTIONS[section].map(function (key) { return key + "=" + state[key]; }).join("|");
  }
  function snapSection(section) { snapshot[section] = sectionVal(section); }
  function setDirtyNote(section, dirty, savedTxt) {
    var n = document.querySelector('[data-dirty="' + section + '"]');
    if (!n) return;
    if (savedTxt) { n.textContent = savedTxt; n.className = "qc-saved ok"; }
    else { n.textContent = dirty ? tt("set.unsaved") : ""; n.className = "qc-saved"; }
  }
  function markDirty() {
    Object.keys(SECTIONS).forEach(function (s) { setDirtyNote(s, sectionVal(s) !== snapshot[s]); });
  }

  // ── save one section ────────────────────────────────────────────────────
  function save(section, btn) {
    var keys = SECTIONS[section]; if (!keys) return;
    if (window.QWDemo && QWDemo.isOn()) { snapSection(section); setDirtyNote(section, false, tt("set.demoNotSaved")); toast(tt("set.toast.demo")); return; }
    var label = btn.textContent;
    btn.disabled = true; btn.textContent = tt("common.saving");
    var patch = { owner: owner, updated_at: new Date().toISOString() };
    keys.forEach(function (key) {
      var v = state[key];
      if (INT_KEYS[key]) v = Math.round(Number(v) || 0);
      patch[key] = v;
    });
    // UPSERT (not UPDATE): a brand-new tenant has no autonomy_settings row yet, and an
    // UPDATE ... where owner=<new tenant> matches zero rows and silently saves nothing.
    // Upserting on `owner` creates the row on first save. (settings-autoseed.sql also
    // seeds the row at tenant-creation time and adds the owner-scoped INSERT policy this
    // upsert relies on — run that migration before deploying.)
    sb.from("autonomy_settings").upsert(patch, { onConflict: "owner" }).select().then(function (res) {
      btn.disabled = false; btn.textContent = label;
      if (res.error) {
        if (Q.isMissingTable(res.error)) { showMissing(); return; }
        if (isMissingColumn(res.error)) {
          toast(tt("set.toast.missingCols"), true);
          return;
        }
        toast(tt("set.toast.saveFail", { msg: res.error.message || tt("set.err.unknown") }), true);
        return;
      }
      if (!res.data || res.data.length === 0) {
        toast(tt("set.toast.noRow", { owner: owner }), true);
        return;
      }
      snapSection(section);
      setDirtyNote(section, false, tt("set.saved"));
      toast(tt("set.toast.saved"));
    }, function () {
      btn.disabled = false; btn.textContent = label;
      toast(tt("set.toast.network"), true);
    });
  }

  function isMissingColumn(err) {
    if (!err) return false;
    var code = err.code || "";
    var msg = (err.message || "") + " " + (err.details || "") + " " + (err.hint || "");
    return code === "42703" || code === "PGRST204" || /column .* does not exist|could not find the .* column/i.test(msg);
  }

  function showMissing() {
    el("settingsHub").hidden = true; el("loadingCard").hidden = true;
    var t = el("tableError");
    t.innerHTML = '<div class="ico" style="background:var(--row)"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--grey)" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-2.4.98 2 2 0 0 1-3.86 0 1.65 1.65 0 0 0-2.4-.98l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a2 2 0 0 1 0-3.86 1.65 1.65 0 0 0 .98-2.4l-.06-.06A2 2 0 1 1 8.35 5.85l.06.06a1.65 1.65 0 0 0 2.4-.98 2 2 0 0 1 3.86 0 1.65 1.65 0 0 0 2.4.98l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.98 2.4 2 2 0 0 1 0 3.86z"/></svg></div>' +
      '<h4>' + tt("set.missing.h4") + '</h4>' +
      '<p>' + tt("set.missing.body", { owner: esc(owner) }) + '</p>';
    t.hidden = false;
  }
  function showError(msg) {
    el("settingsHub").hidden = true; el("loadingCard").hidden = true;
    var t = el("tableError");
    t.innerHTML = '<div class="ico"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#b42318" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9 2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/></svg></div><h4>' + tt("set.load.errH4") + '</h4><p>' + esc(msg) + '</p>' +
      '<button type="button" id="retryBtn" class="btn btn-primary btn-sm">' + tt("common.tryAgain") + '</button>';
    t.hidden = false;
    var rb = el("retryBtn"); if (rb) rb.addEventListener("click", function () { t.hidden = true; el("loadingCard").hidden = false; load(); });
  }

  function load() {
    el("tableError").hidden = true;
    checkCostReady();   // fires the readiness RPC (async in real mode; sync-ready in demo)
    // DEMO MODE (tour): show the hub with sample settings, never touch Supabase.
    if (window.QWDemo && QWDemo.isOn()) {
      state.display_name = "Sales Engineering"; state.company = "Hassan Tekstil A.Ş."; state.role = "Export Sales Manager";
      state.auto_resolve_enabled = true; state.auto_send_enabled = false; state.followup_enabled = true;
      state.green_min_confidence = 90; state.green_min_margin = 20; state.amber_min_confidence = 60;
      state.margin_floor = 15; state.followup_days = 5; state.max_followups = 2;
      el("loadingCard").hidden = true; el("settingsHub").hidden = false; paint();
      return;
    }
    sb.from("autonomy_settings").select("*").eq("owner", owner).maybeSingle().then(function (res) {
      el("loadingCard").hidden = true;
      if (res.error) {
        if (Q.isMissingTable(res.error)) { showMissing(); return; }
        showError(res.error.message || tt("set.load.errBody"));
        return;
      }
      var r = res.data;
      if (r) {
        // booleans
        ["auto_resolve_enabled", "auto_send_enabled", "followup_enabled", "digest_enabled", "alert_thin_margin"]
          .forEach(function (key) { if (typeof r[key] === "boolean") state[key] = r[key]; });
        // numbers
        ["green_min_confidence", "green_min_margin", "amber_min_confidence", "margin_floor",
          "quote_validity_days", "followup_days", "max_followups"].forEach(function (key) {
          if (num(r[key]) != null) state[key] = num(r[key]);
        });
        // strings
        ["display_name", "company", "role", "phone", "country", "address", "signature",
          "reply_language", "default_incoterm", "clarify_mode"].forEach(function (key) {
          if (r[key] != null) state[key] = r[key];
        });
      }
      el("settingsHub").hidden = false;
      paint();
      if (!r) toast(tt("set.toast.defaults"));
    }, function (err) {
      el("loadingCard").hidden = true;
      showError((err && err.message) || tt("set.load.netErr"));
    });
  }
})();
