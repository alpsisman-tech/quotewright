/* Quotewright quote console — the COPILOT.
   The operator does everything here and never opens Gmail: review the pipeline's
   draft, resolve weak lines with one tap, then approve & send — all in-page.

   No inline scripts (site CSP is script-src 'self'). Reads `quotes` + `products`
   from Supabase (anon key + RLS); writes money-facing actions through secured
   n8n webhooks (Bearer = the Supabase access token).

   EVERYTHING degrades gracefully when the intelligence columns/tables aren't
   there yet (autonomy_tier, thread_snapshot, candidates[], digest, …) — a missing
   field is shown as "—"/an empty state, never a crash. Once the owner runs
   quotewright-intelligence.sql and publishes the staged pipeline, it all lights up. */
(function () {
  "use strict";

  // ── i18n (EN/TR) — engine is window.QWI18n (console-i18n.js, loaded first) ──
  function tt(key, vars) { return (window.QWI18n && QWI18n.t) ? QWI18n.t(key, vars) : key; }
  if (window.QWI18n && QWI18n.add) QWI18n.add({
    en: {
      // auth card
      "auth.kickerSignin": "Sign in", "auth.kickerSignup": "Create account",
      "auth.titleSignin": "Quote console", "auth.titleSignup": "Create your account",
      "auth.subSignin": "Review, resolve and send quotes drafted by the RFQ pipeline — without leaving this page.",
      "auth.subSignup": "Set up access to your team’s quote console. A manager approves new accounts before they open.",
      "auth.createAccount": "Create account", "auth.creatingAccount": "Creating account…",
      "auth.or": "or", "auth.continueGoogle": "Continue with Google",
      "auth.rule8": "At least 8 characters", "auth.ruleLetter": "A letter", "auth.ruleNumber": "A number",
      "auth.pwLen8": "at least 8 characters", "auth.pwLetter": "a letter", "auth.pwNumber": "a number",
      "auth.enterEmail": "Enter your email to create an account.",
      "auth.choosePw": "Choose a password with {req}.",
      "auth.notConfigured": "Not configured: set SUPABASE_ANON_KEY in dashboard-config.js (Supabase -> Project Settings -> API -> anon public).",
      "auth.notConfiguredShort": "Dashboard isn’t configured yet (missing Supabase key).",
      "auth.checkEmail": "Check your email",
      "auth.noticeBody1": "We’ve sent a confirmation link to", "auth.noticeBody2": ". Confirm it, then a manager activates your account before the console opens.",
      "auth.backToSignin": "Back to sign in",
      // pending
      "pending.kicker": "Almost there",
      "pending.title": "Your account is awaiting activation",
      "pending.body1": "You’re signed in as", "pending.body2": ". A manager needs to approve your account and connect it to your company before the quote console opens. You’ll get access as soon as that’s done — no need to sign up again.",
      "pending.note": "This usually takes a short while. If it’s urgent, let your Quotewright administrator know you’re waiting.",
      // chart + view tabs
      "dash.chartTitle": "Quotes over time", "dash.legendWon": "Won", "dash.legendOther": "Other",
      "dash.needsYou": "Needs you", "dash.allQuotes": "All quotes",
      "dash.chartEmptyTitle": "No dated quotes yet",
      "dash.chartEmptyBody": "Once quotes start landing, this chart tracks your monthly volume and how many were won.",
      "dash.chartAria": "Quotes per month, won portion highlighted",
      // controls
      "dash.searchPh": "Search customer, product or SKU…",
      "dash.sortAttention": "Sort: Needs attention first", "dash.sortNewest": "Sort: Newest first",
      "dash.sortOldest": "Sort: Oldest first", "dash.sortValue": "Sort: Highest value", "dash.sortMargin": "Sort: Lowest margin",
      "dash.sfAll": "All send states", "dash.sfDraft": "Draft (pending send)", "dash.sfSent": "Sent",
      "dash.tfAll": "All tiers", "dash.tfGreen": "Green — ready", "dash.tfAmber": "Amber — review", "dash.tfRed": "Red — needs work",
      "dash.ofAll": "All outcomes", "dash.ofPending": "Pending decision", "dash.ofWon": "Won", "dash.ofLost": "Lost",
      "dash.needsApproval": "Needs approval",
      "dash.ariaSort": "Sort", "dash.ariaSend": "Send state", "dash.ariaTier": "Autonomy tier", "dash.ariaOutcome": "Outcome",
      // table headers
      "dash.thDate": "Date", "dash.thCust": "Customer & products", "dash.thTotal": "Total",
      "dash.thMargin": "Margin", "dash.thConf": "Confidence", "dash.thSend": "Send",
      "dash.thApproval": "Approval", "dash.thOutcome": "Outcome", "dash.thTier": "Tier", "dash.thOpen": "Open",
      "dash.selectAll": "Select all", "dash.selectQuote": "Select quote",
      "dash.drawerAria": "Quote workspace", "dash.bulkAria": "Bulk actions",
      // digest
      "dash.digestClear": "Inbox clear — no quotes are waiting on you right now.",
      "dash.copilotBrief": "Today’s copilot brief", "dash.liveBadge": "live", "dash.liveTitle": "Computed live from the loaded quotes",
      "dash.segReady": "ready to send", "dash.segInfo": "need input", "dash.segApprove": "thin-margin approvals",
      "dash.segReply1": "new reply", "dash.segReplyN": "new replies",
      // tiles
      "dash.tileQuotes": "Quotes logged", "dash.tilePending": "Pending decision",
      "dash.stillInDraft": "{n} still in draft", "dash.tileAwaiting": "Awaiting approval",
      "dash.marginFlagged": "margin / discount flagged", "dash.noneFlagged": "none flagged",
      "dash.tileWinRate": "Win rate", "dash.wonLost": "{won} won · {lost} lost",
      "dash.tileQuoted": "Quoted value", "dash.tileWonValue": "Won value", "dash.mixed": "+{n} mixed",
      // states / rowcount
      "dash.loadErrTitle": "Couldn’t load quotes",
      "dash.loadErrBody": "Something went wrong reaching the quote store.",
      "dash.tryAgain": "Try again",
      "dash.rowOf": "{a} of {b}", "dash.showingOf": "Showing {a} of {b}",
      "dash.emptyNoneTitle": "No quotes yet",
      "dash.emptyNoneBody": "Quotes drafted by the RFQ pipeline land here automatically. Send a real request to the connected mailbox and the first draft will appear.",
      "dash.emptyNoMatchTitle": "No matches",
      "dash.emptyNoMatchBody": "No quotes fit these filters. Clear the search, drop the approval filter, or widen the tier / send state and outcome.",
      "dash.loadMore": "Load {n} more", "dash.ofShown": "{a} of {b} shown",
      "dash.netErrConn": "Network error — check your connection and try again.",
      // table cells
      "dash.tierReady": "Ready", "dash.tierReview": "Review", "dash.tierWork": "Needs work",
      "dash.tierNone": "Tier not computed yet", "dash.tierTitle": "Autonomy tier: {t}",
      "dash.marginTitle": "{v} margin",
      "dash.approve": "Approve", "dash.approved": "Approved", "dash.approvedByTitle": "Approved by {who}",
      "dash.draft": "Draft", "dash.sent": "Sent",
      "dash.ocPending": "Pending", "dash.ocWon": "Won", "dash.ocLost": "Lost",
      "dash.won": "Won", "dash.lost": "Lost", "dash.reset": "Reset",
      "dash.newReplyDot": "new reply", "dash.newReplyTitle": "New customer reply on this thread",
      "dash.plusLine": "+{n} line", "dash.plusLines": "+{n} lines",
      // needs-you
      "dash.nyReplyT": "Customer replied", "dash.nyReplyS": "They’re waiting on a response",
      "dash.nyApproveT": "Needs your approval", "dash.nyApproveS": "Margin or discount flagged — decide before it sends",
      "dash.nyInfoT": "Lines to resolve", "dash.nyInfoS": "A line is missing a spec or price",
      "dash.nyReadyT": "Ready to send", "dash.nyReadyS": "Priced, high-confidence drafts",
      "dash.send": "Send", "dash.open": "Open", "dash.viewInLedger": "View in ledger",
      "dash.moreInLedger": "+{n} more in the full ledger →",
      "dash.nyCaughtT": "You’re all caught up", "dash.nyNoneT": "Nothing needs you yet",
      "dash.nyCaughtB": "No quotes are waiting on a human right now. New drafts, approvals and customer replies surface here the moment they need you.",
      "dash.nyNoneB": "When the RFQ pipeline drafts a quote or a customer replies, anything needing your attention lands here first.",
      "dash.openCust": "Open {c}",
      // drawer
      "dash.quoteFallback": "Quote", "dash.closeWorkspace": "Close workspace",
      "dash.sentLine": "Sent {dt}", "dash.term": "term {v}",
      "dash.newReplyHead": "New customer reply",
      "dash.convo": "Conversation", "dash.msg1": "1 message", "dash.msgN": "{n} messages",
      "dash.threadEmpty": "The conversation snapshot appears once the pipeline stores <code>thread_snapshot</code>. Until then, open the customer’s thread from the draft below.",
      "dash.customer": "Customer",
      "dash.priced": "Priced", "dash.provisional": "Priced · confirm spec",
      "dash.needsInfo": "Needs info", "dash.pendingPrice": "Pending price",
      "dash.candidate": "Candidate", "dash.useThis": "Use this",
      "dash.unmatched": "unmatched",
      "dash.resolveLead": "Resolve this line — one tap prices it, regenerates the draft & teaches the pipeline.",
      "dash.noCands": "No ranked candidates were logged for this line. Search the catalogue below.",
      "dash.catSearchPh": "Search catalogue by name, SKU, colour or GSM…",
      "dash.askSpec": "Ask the customer for this spec",
      "dash.noLineDetail": "No line-by-line detail was logged with this quote.",
      "dash.line1": "1 line", "dash.lineN": "{n} lines", "dash.toResolve": "{n} to resolve", "dash.allPriced": "all priced",
      "dash.lineItems": "Line items",
      "dash.approveSend": "Approve & send", "dash.sendEdited": "Send edited reply",
      "dash.labelPh": "Label", "dash.add": "Add", "dash.remove": "Remove",
      "dash.gateNote": "Sending emails the customer from the firm mailbox. Nothing leaves until you approve it here — this is the send gate.",
      "dash.draftReply": "Draft reply", "dash.pendingSend": "pending your send", "dash.sentLc": "sent",
      "dash.lineResolved": "Line resolved — quote updated.",
      "dash.searching": "Searching…", "dash.catFail": "Catalogue search failed: {msg}",
      "dash.catNoMatch": "No catalogue products match “{term}”.", "dash.use": "Use", "dash.catFailNet": "Catalogue search failed (network).",
      // drawer — draft briefing panel ("What does this draft say?")
      "dash.brief.head": "What does this draft say?", "dash.brief.tag": "Draft briefing",
      "dash.brief.noOutput": "No structured agent output was stored for this quote, so no briefing can be built. The draft text below is in the customer’s language.",
      "dash.brief.hSummary": "Summary",
      "dash.brief.replyLang": "Reply language",
      "dash.brief.replyLangVal": "Drafted for the customer in {lang}",
      "dash.brief.replyLangUnknown": "The reply language was not stated.",
      "dash.brief.currency": "Currency", "dash.brief.incoterm": "Delivery terms", "dash.brief.unset": "Not stated",
      "dash.brief.total": "Grand total", "dash.brief.totalCash": "Grand total (cash)", "dash.brief.totalTerm": "Grand total (term)",
      "dash.brief.noTotal": "No total could be produced — no line could be priced.",
      "dash.brief.hLines": "Lines",
      "dash.brief.noLines": "The agent output contains no lines — no product could be extracted from this request.",
      "dash.brief.qty": "Quantity", "dash.brief.noQty": "no quantity stated",
      "dash.brief.unitPrice": "Unit price", "dash.brief.noUnit": "no unit price",
      "dash.brief.lineTotal": "Line total", "dash.brief.noLineTotal": "no total",
      "dash.brief.stPriced": "Priced", "dash.brief.stInfo": "Awaiting info (from the customer)",
      "dash.brief.stHassan": "Sales team will price it", "dash.brief.stUnknown": "Status not stated",
      "dash.brief.hWhy": "Why it could not be priced",
      "dash.brief.allPriced": "Every line was priced — nothing outstanding.",
      "dash.brief.whyNoLines": "There are no lines to price, so no reason can be listed.",
      "dash.brief.rNoQty": "The customer did not state a quantity — the line total cannot be calculated.",
      "dash.brief.rNoPrice": "This product has no catalogued sale price; the sales team will price it.",
      "dash.brief.rMissing": "Missing information: ",
      "dash.brief.rMissingBare": "A detail is awaited from the customer; the agent did not say which.",
      "dash.brief.rGeneric": "This line could not be priced. ",
      "dash.brief.rGenericBare": "This line could not be priced; the agent gave no reason.",
      "dash.brief.subInfo": "Still needed from the customer",
      "dash.brief.subUnmatched": "Requests with no catalogue match",
      "dash.brief.agentNote": "Agent’s note:",
      "dash.brief.intHead": "Internal note — not sent to the customer",
      "dash.brief.intLead": "The following is not part of the email going to the customer; it is for your review only.",
      "dash.brief.intNone": "This quote is flagged for review, but the agent listed no reason.",
      // language names, for rendering the draft's language in the console's language
      "lang.en": "English", "lang.tr": "Turkish", "lang.es": "Spanish", "lang.de": "German",
      "lang.fr": "French", "lang.bg": "Bulgarian", "lang.it": "Italian", "lang.ru": "Russian",
      "lang.pt": "Portuguese", "lang.nl": "Dutch", "lang.ar": "Arabic", "lang.pl": "Polish",
      "lang.ro": "Romanian", "lang.el": "Greek", "lang.zh": "Chinese",
      // toasts / actions
      "dash.ocWonLc": "won", "dash.ocLostLc": "lost",
      "dash.markedDemo": "Marked {o} · demo — not saved.", "dash.marked": "Marked {o}.",
      "dash.runAnalyticsSql": "Run quote-analytics.sql in Supabase first.",
      "dash.couldntSave": "Couldn’t save: {m}",
      "dash.approvedDemo": "Approved · demo — not saved.",
      "dash.runExpansionSql": "Run quotewright-expansion.sql in Supabase first.",
      "dash.couldntApprove": "Couldn’t approve: {m}", "dash.approvedToast": "Approved.",
      "dash.netErrNotApproved": "Network error — not approved.",
      "dash.sessionExpired": "Session expired — sign in again.",
      "dash.notAuthorised": "Not authorised — your session may have expired.",
      "dash.requestFailed": "Request failed ({status}).",
      "dash.sendQTitle": "Send this quote?",
      "dash.sendQBody": "This emails <strong>{c}</strong> the drafted quotation from the firm mailbox.",
      "dash.sendNow": "Send now", "dash.quoteSentTo": "Quote sent to {c}.",
      "dash.theCustomer": "the customer",
      "dash.writeReplyFirst": "Write a reply first.",
      "dash.sendEditedTitle": "Send edited reply?",
      "dash.sendEditedBody": "This sends your edited message to <strong>{c}</strong> on the existing thread.",
      "dash.sendReply": "Send reply", "dash.replySent": "Reply sent.",
      "dash.clarifySent": "Clarification email sent to the customer.",
      "dash.typeLabelFirst": "Type a label name first.",
      "dash.labelApplied": "Applied label “{l}”.", "dash.labelRemoved": "Removed label “{l}”.",
      "dash.noDraftsSel": "No drafts selected.",
      "dash.bulkSendTitle1": "Send 1 quote?", "dash.bulkSendTitleN": "Send {n} quotes?",
      "dash.bulkSendBody1": "This emails 1 customer their drafted quotation. This can’t be undone.",
      "dash.bulkSendBodyN": "This emails {n} customers their drafted quotation. This can’t be undone.",
      "dash.sendAll": "Send all", "dash.sending": "Sending…",
      "dash.sentN": "Sent {n}", "dash.failedN": " · {n} failed",
      "dash.typeLabelName": "Type a label name.",
      "dash.bulkLabelTitle1": "Label 1 quote?", "dash.bulkLabelTitleN": "Label {n} quotes?",
      "dash.bulkLabelBody1": "Applies the Gmail label “{l}” to 1 thread.",
      "dash.bulkLabelBodyN": "Applies the Gmail label “{l}” to {n} threads.",
      "dash.applyLabel": "Apply label", "dash.applying": "Applying…", "dash.labelledN": "Labelled {n}",
      "dash.nSelected": "{n} selected", "dash.nDraft1": "1 draft", "dash.nDraftN": "{n} drafts",
      "dash.sendNDraft1": "Send 1 draft", "dash.sendNDraftN": "Send {n} drafts",
      "dash.labelNamePh": "Label name", "dash.clear": "Clear", "dash.clearSel": "Clear selection"
    },
    tr: {
      "auth.kickerSignin": "Giriş yap", "auth.kickerSignup": "Hesap oluştur",
      "auth.titleSignin": "Teklif konsolu", "auth.titleSignup": "Hesabınızı oluşturun",
      "auth.subSignin": "RFQ akışının hazırladığı teklifleri bu sayfadan çıkmadan inceleyin, tamamlayın ve gönderin.",
      "auth.subSignup": "Ekibinizin teklif konsoluna erişim kurun. Yeni hesaplar açılmadan önce bir yönetici onaylar.",
      "auth.createAccount": "Hesap oluştur", "auth.creatingAccount": "Hesap oluşturuluyor…",
      "auth.or": "veya", "auth.continueGoogle": "Google ile devam et",
      "auth.rule8": "En az 8 karakter", "auth.ruleLetter": "Bir harf", "auth.ruleNumber": "Bir rakam",
      "auth.pwLen8": "en az 8 karakter", "auth.pwLetter": "bir harf", "auth.pwNumber": "bir rakam",
      "auth.enterEmail": "Hesap oluşturmak için e-postanızı girin.",
      "auth.choosePw": "Şu koşulları sağlayan bir parola seçin: {req}.",
      "auth.notConfigured": "Yapılandırılmadı: dashboard-config.js içinde SUPABASE_ANON_KEY değerini ayarlayın (Supabase -> Project Settings -> API -> anon public).",
      "auth.notConfiguredShort": "Konsol henüz yapılandırılmadı (Supabase anahtarı eksik).",
      "auth.checkEmail": "E-postanızı kontrol edin",
      "auth.noticeBody1": "Şu adrese bir onay bağlantısı gönderdik:", "auth.noticeBody2": " Bunu onaylayın; ardından bir yönetici, konsol açılmadan önce hesabınızı etkinleştirir.",
      "auth.backToSignin": "Girişe geri dön",
      "pending.kicker": "Neredeyse hazır",
      "pending.title": "Hesabınız etkinleştirilmeyi bekliyor",
      "pending.body1": "", "pending.body2": " olarak giriş yaptınız. Teklif konsolu açılmadan önce bir yöneticinin hesabınızı onaylayıp şirketinize bağlaması gerekir. Bu tamamlanır tamamlanmaz erişim kazanırsınız — yeniden kaydolmanıza gerek yok.",
      "pending.note": "Bu genellikle kısa sürer. Acilse, beklediğinizi Quotewright yöneticinize bildirin.",
      "dash.chartTitle": "Zaman içinde teklifler", "dash.legendWon": "Kazanıldı", "dash.legendOther": "Diğer",
      "dash.needsYou": "Sizi bekleyenler", "dash.allQuotes": "Tüm teklifler",
      "dash.chartEmptyTitle": "Henüz tarihli teklif yok",
      "dash.chartEmptyBody": "Teklifler gelmeye başladığında bu grafik aylık hacminizi ve kaçının kazanıldığını izler.",
      "dash.chartAria": "Aylık teklifler, kazanılan kısım vurgulanmış",
      "dash.searchPh": "Müşteri, ürün veya SKU ara…",
      "dash.sortAttention": "Sıralama: Önce ilgi gerekenler", "dash.sortNewest": "Sıralama: Önce en yeni",
      "dash.sortOldest": "Sıralama: Önce en eski", "dash.sortValue": "Sıralama: En yüksek değer", "dash.sortMargin": "Sıralama: En düşük marj",
      "dash.sfAll": "Tüm gönderim durumları", "dash.sfDraft": "Taslak (gönderim bekliyor)", "dash.sfSent": "Gönderildi",
      "dash.tfAll": "Tüm kademeler", "dash.tfGreen": "Yeşil — hazır", "dash.tfAmber": "Sarı — incele", "dash.tfRed": "Kırmızı — çalışma gerek",
      "dash.ofAll": "Tüm sonuçlar", "dash.ofPending": "Karar bekliyor", "dash.ofWon": "Kazanıldı", "dash.ofLost": "Kaybedildi",
      "dash.needsApproval": "Onay gerekiyor",
      "dash.ariaSort": "Sıralama", "dash.ariaSend": "Gönderim durumu", "dash.ariaTier": "Otonomi kademesi", "dash.ariaOutcome": "Sonuç",
      "dash.thDate": "Tarih", "dash.thCust": "Müşteri ve ürünler", "dash.thTotal": "Toplam",
      "dash.thMargin": "Marj", "dash.thConf": "Güven", "dash.thSend": "Gönderim",
      "dash.thApproval": "Onay", "dash.thOutcome": "Sonuç", "dash.thTier": "Kademe", "dash.thOpen": "Aç",
      "dash.selectAll": "Tümünü seç", "dash.selectQuote": "Teklifi seç",
      "dash.drawerAria": "Teklif çalışma alanı", "dash.bulkAria": "Toplu işlemler",
      "dash.digestClear": "Gelen kutusu temiz — şu anda sizi bekleyen teklif yok.",
      "dash.copilotBrief": "Günün Copilot özeti", "dash.liveBadge": "canlı", "dash.liveTitle": "Yüklenen tekliflerden canlı hesaplandı",
      "dash.segReady": "göndermeye hazır", "dash.segInfo": "bilgi gerekiyor", "dash.segApprove": "düşük marj onayları",
      "dash.segReply1": "yeni yanıt", "dash.segReplyN": "yeni yanıt",
      "dash.tileQuotes": "Kaydedilen teklif", "dash.tilePending": "Karar bekliyor",
      "dash.stillInDraft": "{n} hâlâ taslakta", "dash.tileAwaiting": "Onay bekliyor",
      "dash.marginFlagged": "marj / iskonto işaretlendi", "dash.noneFlagged": "işaretli yok",
      "dash.tileWinRate": "Kazanma oranı", "dash.wonLost": "{won} kazanıldı · {lost} kaybedildi",
      "dash.tileQuoted": "Teklif edilen değer", "dash.tileWonValue": "Kazanılan değer", "dash.mixed": "+{n} karışık",
      "dash.loadErrTitle": "Teklifler yüklenemedi",
      "dash.loadErrBody": "Teklif deposuna erişirken bir sorun oluştu.",
      "dash.tryAgain": "Tekrar dene",
      "dash.rowOf": "{a} / {b}", "dash.showingOf": "{b} içinden {a} gösteriliyor",
      "dash.emptyNoneTitle": "Henüz teklif yok",
      "dash.emptyNoneBody": "RFQ akışının hazırladığı teklifler buraya otomatik gelir. Bağlı posta kutusuna gerçek bir talep gönderin; ilk taslak görünecektir.",
      "dash.emptyNoMatchTitle": "Eşleşme yok",
      "dash.emptyNoMatchBody": "Bu filtrelere uyan teklif yok. Aramayı temizleyin, onay filtresini kaldırın ya da kademe / gönderim durumu ve sonucu genişletin.",
      "dash.loadMore": "{n} tane daha yükle", "dash.ofShown": "{b} içinden {a} gösteriliyor",
      "dash.netErrConn": "Ağ hatası — bağlantınızı kontrol edip tekrar deneyin.",
      "dash.tierReady": "Hazır", "dash.tierReview": "İncele", "dash.tierWork": "Çalışma gerek",
      "dash.tierNone": "Kademe henüz hesaplanmadı", "dash.tierTitle": "Otonomi kademesi: {t}",
      "dash.marginTitle": "{v} marj",
      "dash.approve": "Onayla", "dash.approved": "Onaylandı", "dash.approvedByTitle": "Onaylayan: {who}",
      "dash.draft": "Taslak", "dash.sent": "Gönderildi",
      "dash.ocPending": "Beklemede", "dash.ocWon": "Kazanıldı", "dash.ocLost": "Kaybedildi",
      "dash.won": "Kazanıldı", "dash.lost": "Kaybedildi", "dash.reset": "Sıfırla",
      "dash.newReplyDot": "yeni yanıt", "dash.newReplyTitle": "Bu konuda yeni müşteri yanıtı",
      "dash.plusLine": "+{n} satır", "dash.plusLines": "+{n} satır",
      "dash.nyReplyT": "Müşteri yanıtladı", "dash.nyReplyS": "Yanıt bekliyorlar",
      "dash.nyApproveT": "Onayınız gerekiyor", "dash.nyApproveS": "Marj veya iskonto işaretlendi — göndermeden önce karar verin",
      "dash.nyInfoT": "Çözülecek satırlar", "dash.nyInfoS": "Bir satırda özellik veya fiyat eksik",
      "dash.nyReadyT": "Göndermeye hazır", "dash.nyReadyS": "Fiyatlandırılmış, yüksek güvenli taslaklar",
      "dash.send": "Gönder", "dash.open": "Aç", "dash.viewInLedger": "Kayıtta görüntüle",
      "dash.moreInLedger": "tam kayıtta +{n} tane daha →",
      "dash.nyCaughtT": "Her şey güncel", "dash.nyNoneT": "Henüz sizi bekleyen bir şey yok",
      "dash.nyCaughtB": "Şu anda bir insanı bekleyen teklif yok. Yeni taslaklar, onaylar ve müşteri yanıtları sizi gerektiği an burada belirir.",
      "dash.nyNoneB": "RFQ akışı bir teklif hazırladığında ya da bir müşteri yanıt verdiğinde, ilginizi gerektiren her şey önce burada görünür.",
      "dash.openCust": "{c} teklifini aç",
      "dash.quoteFallback": "Teklif", "dash.closeWorkspace": "Çalışma alanını kapat",
      "dash.sentLine": "Gönderildi {dt}", "dash.term": "vadeli {v}",
      "dash.newReplyHead": "Yeni müşteri yanıtı",
      "dash.convo": "Yazışma", "dash.msg1": "1 mesaj", "dash.msgN": "{n} mesaj",
      "dash.threadEmpty": "Yazışma anlık görüntüsü, akış <code>thread_snapshot</code> verisini kaydettiğinde görünür. O zamana kadar aşağıdaki taslaktan müşterinin konusunu açın.",
      "dash.customer": "Müşteri",
      "dash.priced": "Fiyatlandı", "dash.provisional": "Fiyatlandı · özelliği doğrula",
      "dash.needsInfo": "Bilgi gerekiyor", "dash.pendingPrice": "Fiyat bekliyor",
      "dash.candidate": "Aday", "dash.useThis": "Bunu kullan",
      "dash.unmatched": "eşleşmedi",
      "dash.resolveLead": "Bu satırı çözün — tek dokunuş fiyatlandırır, taslağı yeniden oluşturur ve akışa öğretir.",
      "dash.noCands": "Bu satır için sıralı aday kaydedilmedi. Aşağıdaki katalogda arayın.",
      "dash.catSearchPh": "Katalogda ada, SKU'ya, renge veya GSM'e göre ara…",
      "dash.askSpec": "Bu özelliği müşteriden iste",
      "dash.noLineDetail": "Bu teklifle satır satır ayrıntı kaydedilmedi.",
      "dash.line1": "1 satır", "dash.lineN": "{n} satır", "dash.toResolve": "{n} çözülecek", "dash.allPriced": "tümü fiyatlandı",
      "dash.lineItems": "Satır kalemleri",
      "dash.approveSend": "Onayla ve gönder", "dash.sendEdited": "Düzenlenmiş yanıtı gönder",
      "dash.labelPh": "Etiket", "dash.add": "Ekle", "dash.remove": "Kaldır",
      "dash.gateNote": "Gönderim, müşteriye firma posta kutusundan e-posta atar. Siz burada onaylamadan hiçbir şey gitmez — gönderim kapısı budur.",
      "dash.draftReply": "Taslak yanıt", "dash.pendingSend": "gönderiminizi bekliyor", "dash.sentLc": "gönderildi",
      "dash.lineResolved": "Satır çözüldü — teklif güncellendi.",
      "dash.searching": "Aranıyor…", "dash.catFail": "Katalog araması başarısız: {msg}",
      "dash.catNoMatch": "“{term}” ile eşleşen katalog ürünü yok.", "dash.use": "Kullan", "dash.catFailNet": "Katalog araması başarısız (ağ).",
      // drawer — taslak brifingi ("Bu taslak ne diyor?")
      "dash.brief.head": "Bu taslak ne diyor?", "dash.brief.tag": "Taslak brifingi",
      "dash.brief.noOutput": "Bu teklif için yapılandırılmış ajan çıktısı bulunamadı, bu yüzden brifing oluşturulamıyor. Aşağıdaki taslak metni müşterinin dilindedir.",
      "dash.brief.hSummary": "Özet",
      "dash.brief.replyLang": "Yanıt dili",
      "dash.brief.replyLangVal": "Müşteriye {lang} yanıt hazırlandı",
      "dash.brief.replyLangUnknown": "Yanıtın dili belirtilmemiş.",
      "dash.brief.currency": "Para birimi", "dash.brief.incoterm": "Teslim şekli", "dash.brief.unset": "Belirtilmemiş",
      "dash.brief.total": "Genel toplam", "dash.brief.totalCash": "Genel toplam (peşin)", "dash.brief.totalTerm": "Genel toplam (vadeli)",
      "dash.brief.noTotal": "Toplam tutar oluşturulamadı — fiyatlandırılabilen satır yok.",
      "dash.brief.hLines": "Satırlar",
      "dash.brief.noLines": "Ajan çıktısında hiç satır yok — bu talepten fiyatlandırılacak ürün çıkarılamamış.",
      "dash.brief.qty": "Miktar", "dash.brief.noQty": "miktar belirtilmemiş",
      "dash.brief.unitPrice": "Birim fiyat", "dash.brief.noUnit": "birim fiyat yok",
      "dash.brief.lineTotal": "Satır toplamı", "dash.brief.noLineTotal": "toplam yok",
      "dash.brief.stPriced": "Fiyatlandırıldı", "dash.brief.stInfo": "Bilgi bekleniyor (müşteriden)",
      "dash.brief.stHassan": "Satış ekibi fiyatlandıracak", "dash.brief.stUnknown": "Durum belirtilmemiş",
      "dash.brief.hWhy": "Neden fiyatlandırılamadı",
      "dash.brief.allPriced": "Tüm satırlar fiyatlandırıldı — bekleyen bilgi yok.",
      "dash.brief.whyNoLines": "Fiyatlandırılacak satır bulunmadığı için gerekçe listelenemiyor.",
      "dash.brief.rNoQty": "Müşteri miktar belirtmemiş — satır toplamı hesaplanamıyor.",
      "dash.brief.rNoPrice": "Bu ürünün kayıtlı satış fiyatı yok; satış ekibi fiyatlandıracak.",
      "dash.brief.rMissing": "Eksik bilgi: ",
      "dash.brief.rMissingBare": "Müşteriden bir ayrıntı bekleniyor; ajan ayrıntıyı belirtmemiş.",
      "dash.brief.rGeneric": "Bu satır fiyatlandırılamadı. ",
      "dash.brief.rGenericBare": "Bu satır fiyatlandırılamadı; ajan bir gerekçe belirtmemiş.",
      "dash.brief.subInfo": "Müşteriden hâlâ beklenen bilgiler",
      "dash.brief.subUnmatched": "Katalogda eşleşmeyen talepler",
      "dash.brief.agentNote": "Ajanın notu:",
      "dash.brief.intHead": "İç not — müşteriye gitmez",
      "dash.brief.intLead": "Aşağıdakiler müşteriye gidecek e-postanın parçası değildir; yalnızca sizin kontrolünüz içindir.",
      "dash.brief.intNone": "Bu teklif kontrol gerektiriyor olarak işaretlenmiş, ancak ajan bir gerekçe listelememiş.",
      // dil adları — taslağın dili, konsolun dilinde yazılır
      "lang.en": "İngilizce", "lang.tr": "Türkçe", "lang.es": "İspanyolca", "lang.de": "Almanca",
      "lang.fr": "Fransızca", "lang.bg": "Bulgarca", "lang.it": "İtalyanca", "lang.ru": "Rusça",
      "lang.pt": "Portekizce", "lang.nl": "Felemenkçe", "lang.ar": "Arapça", "lang.pl": "Lehçe",
      "lang.ro": "Romence", "lang.el": "Yunanca", "lang.zh": "Çince",
      "dash.ocWonLc": "kazanıldı", "dash.ocLostLc": "kaybedildi",
      "dash.markedDemo": "{o} olarak işaretlendi · demo — kaydedilmedi.", "dash.marked": "{o} olarak işaretlendi.",
      "dash.runAnalyticsSql": "Önce Supabase'de quote-analytics.sql çalıştırın.",
      "dash.couldntSave": "Kaydedilemedi: {m}",
      "dash.approvedDemo": "Onaylandı · demo — kaydedilmedi.",
      "dash.runExpansionSql": "Önce Supabase'de quotewright-expansion.sql çalıştırın.",
      "dash.couldntApprove": "Onaylanamadı: {m}", "dash.approvedToast": "Onaylandı.",
      "dash.netErrNotApproved": "Ağ hatası — onaylanmadı.",
      "dash.sessionExpired": "Oturum sona erdi — yeniden giriş yapın.",
      "dash.notAuthorised": "Yetkiniz yok — oturumunuz sona ermiş olabilir.",
      "dash.requestFailed": "İstek başarısız ({status}).",
      "dash.sendQTitle": "Bu teklif gönderilsin mi?",
      "dash.sendQBody": "Bu, hazırlanan teklifi firma posta kutusundan <strong>{c}</strong> adresine e-postayla gönderir.",
      "dash.sendNow": "Şimdi gönder", "dash.quoteSentTo": "Teklif {c} adresine gönderildi.",
      "dash.theCustomer": "müşteriye",
      "dash.writeReplyFirst": "Önce bir yanıt yazın.",
      "dash.sendEditedTitle": "Düzenlenmiş yanıt gönderilsin mi?",
      "dash.sendEditedBody": "Bu, düzenlediğiniz mesajı mevcut yazışmada <strong>{c}</strong> adresine gönderir.",
      "dash.sendReply": "Yanıtı gönder", "dash.replySent": "Yanıt gönderildi.",
      "dash.clarifySent": "Açıklama e-postası müşteriye gönderildi.",
      "dash.typeLabelFirst": "Önce bir etiket adı yazın.",
      "dash.labelApplied": "“{l}” etiketi uygulandı.", "dash.labelRemoved": "“{l}” etiketi kaldırıldı.",
      "dash.noDraftsSel": "Seçili taslak yok.",
      "dash.bulkSendTitle1": "1 teklif gönderilsin mi?", "dash.bulkSendTitleN": "{n} teklif gönderilsin mi?",
      "dash.bulkSendBody1": "Bu, 1 müşteriye hazırlanan teklifini e-postayla gönderir. Bu geri alınamaz.",
      "dash.bulkSendBodyN": "Bu, {n} müşteriye hazırlanan tekliflerini e-postayla gönderir. Bu geri alınamaz.",
      "dash.sendAll": "Tümünü gönder", "dash.sending": "Gönderiliyor…",
      "dash.sentN": "{n} gönderildi", "dash.failedN": " · {n} başarısız",
      "dash.typeLabelName": "Bir etiket adı yazın.",
      "dash.bulkLabelTitle1": "1 teklif etiketlensin mi?", "dash.bulkLabelTitleN": "{n} teklif etiketlensin mi?",
      "dash.bulkLabelBody1": "“{l}” Gmail etiketini 1 konuya uygular.",
      "dash.bulkLabelBodyN": "“{l}” Gmail etiketini {n} konuya uygular.",
      "dash.applyLabel": "Etiket uygula", "dash.applying": "Uygulanıyor…", "dash.labelledN": "{n} etiketlendi",
      "dash.nSelected": "{n} seçildi", "dash.nDraft1": "1 taslak", "dash.nDraftN": "{n} taslak",
      "dash.sendNDraft1": "1 taslak gönder", "dash.sendNDraftN": "{n} taslak gönder",
      "dash.labelNamePh": "Etiket adı", "dash.clear": "Temizle", "dash.clearSel": "Seçimi temizle"
    }
  });

  var el = function (id) { return document.getElementById(id); };
  var cfg = window.QW_CONFIG || {};
  var boot = el("bootError");
  var sb = null;
  var quotes = [];
  var digest = null;         // latest digest row, or null (then computed client-side)
  var hasLoaded = false;
  var loading = false;
  var selected = {};         // id -> true (bulk selection)
  var openId = null;         // quote currently in the workspace drawer
  var lastFocus = null;      // element focused before the drawer opened

  // Tenancy (Wave A). resolvedOwner is the CALLER's tenant, resolved server-side
  // from account_profiles — never trusted from client input. Falls back to the
  // legacy config OWNER before the tenancy SQL is applied (graceful degradation).
  var resolvedOwner = cfg.OWNER || null;
  var isAdminUser = false;   // admin sees ALL tenants (RLS allows it) → skip owner filter
  var authMode = "signin";   // "signin" | "signup"
  var dashStarted = false;   // load the dashboard exactly once per session

  var WEBHOOK_BASE = "https://alpsisman.app.n8n.cloud/webhook/";

  var MARGIN_LOW = 15, MARGIN_MID = 30;
  var CONF_HIGH = 85, CONF_MID = 60;

  // The firm's own mailbox — used to tell "us" from "the customer" in a thread.
  var FIRM_HINTS = ["hassannonwovensrfq", "hassan.com.tr", "@hassan"];

  // SECURITY: intercept the login submit FIRST so email+password can never land
  // in the URL via a native GET submit.
  var loginForm = el("loginForm");
  if (loginForm) loginForm.addEventListener("submit", onLoginSubmit);

  var configured = cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY &&
                   cfg.SUPABASE_ANON_KEY.indexOf("PASTE_") !== 0;
  if (!configured) {
    if (boot) {
      boot.hidden = false;
      boot.textContent = tt("auth.notConfigured");
    }
    return;
  }

  sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
  if (window.QWI18n && QWI18n.setClient) QWI18n.setClient(sb);
  var currentEmail = "";

  el("logoutBtn").addEventListener("click", signOut);

  // ── auth surface wiring (Google, sign-in/sign-up toggle, pending screen) ──
  var googleBtn = el("googleBtn");
  if (googleBtn) googleBtn.addEventListener("click", googleSignIn);

  var tabSignin = el("tabSignin"), tabSignup = el("tabSignup");
  if (tabSignin) tabSignin.addEventListener("click", function () { setMode("signin"); });
  if (tabSignup) tabSignup.addEventListener("click", function () { setMode("signup"); });

  var pwInput = el("password");
  if (pwInput) pwInput.addEventListener("input", function () { if (authMode === "signup") renderPwRules(pwInput.value); });

  var noticeBack = el("noticeBack");
  if (noticeBack) noticeBack.addEventListener("click", function () { showNotice(null); setMode("signin"); });

  var pendingRefresh = el("pendingRefresh");
  if (pendingRefresh) pendingRefresh.addEventListener("click", function () {
    pendingRefresh.disabled = true; pendingRefresh.textContent = tt("common.checking");
    sb.auth.getSession().then(function (res) {
      var s = res.data && res.data.session;
      pendingRefresh.disabled = false; pendingRefresh.textContent = tt("common.checkAgain");
      if (s && s.user) decideRoute(s); else showLogin();
    });
  });
  var pendingLogout = el("pendingLogout");
  if (pendingLogout) pendingLogout.addEventListener("click", signOut);

  // View + sort + pagination state.
  var view = "needsyou";     // "needsyou" | "all" — operator starts on what needs a human
  var sortMode = "attention";
  var PAGE = 25, renderLimit = PAGE;

  el("refreshBtn").addEventListener("click", loadQuotes);
  el("search").addEventListener("input", function () { renderLimit = PAGE; renderTable(); });
  el("sortBy").addEventListener("change", function () { sortMode = this.value; renderLimit = PAGE; renderTable(); });
  el("statusFilter").addEventListener("change", function () { renderLimit = PAGE; renderTable(); });
  el("tierFilter").addEventListener("change", function () { renderLimit = PAGE; renderTable(); });
  el("outcomeFilter").addEventListener("change", function () { renderLimit = PAGE; renderTable(); });
  el("approvalFilter").addEventListener("click", function () {
    approvalOnly = !approvalOnly;
    this.setAttribute("aria-pressed", approvalOnly ? "true" : "false");
    this.classList.toggle("on", approvalOnly);
    renderLimit = PAGE;
    renderTable();
  });
  el("selectAll").addEventListener("change", onSelectAll);
  var approvalOnly = false;

  // View tabs.
  el("tabNeedsYou").addEventListener("click", function () { setView("needsyou"); });
  el("tabAll").addEventListener("click", function () { setView("all"); });

  function setView(v) {
    view = v === "all" ? "all" : "needsyou";
    var needs = view === "needsyou";
    el("tabNeedsYou").setAttribute("aria-selected", needs ? "true" : "false");
    el("tabAll").setAttribute("aria-selected", needs ? "false" : "true");
    el("needsYouView").hidden = !needs;
    el("allView").hidden = needs;
    var ind = el("viewInd"); if (ind) ind.classList.toggle("right", !needs);
    if (needs) renderNeedsYou(); else renderTable();
  }

  // Table interactions (event delegation — CSP-safe, no inline handlers).
  el("quotesBody").addEventListener("click", function (e) {
    var t = e.target;
    if (t.closest && t.closest(".qc-col-sel")) return; // checkbox handled on change
    var actBtn = t.closest ? t.closest("button[data-act]") : null;
    if (actBtn) { e.stopPropagation(); setOutcome(actBtn.getAttribute("data-id"), actBtn.getAttribute("data-act"), actBtn); return; }
    var appBtn = t.closest ? t.closest("button[data-approve]") : null;
    if (appBtn) { e.stopPropagation(); approve(appBtn.getAttribute("data-approve"), appBtn); return; }
    var row = t.closest ? t.closest("tr[data-row]") : null;
    if (row) openDrawer(row.getAttribute("data-row"));
  });
  el("quotesBody").addEventListener("change", function (e) {
    var cb = e.target;
    if (cb && cb.classList && cb.classList.contains("qc-rowsel")) {
      var id = cb.getAttribute("data-sel");
      if (cb.checked) selected[id] = true; else delete selected[id];
      renderBulk();
      syncSelectAll();
    }
  });

  // Needs-you queue interactions (same actions as the table, card-shaped).
  el("needsYouBody").addEventListener("click", function (e) {
    var t = e.target;
    var jump = t.closest ? t.closest("button[data-jump]") : null;
    if (jump) { e.stopPropagation(); jumpToAll(jump.getAttribute("data-jump")); return; }
    var actBtn = t.closest ? t.closest("button[data-act]") : null;
    if (actBtn) { e.stopPropagation(); setOutcome(actBtn.getAttribute("data-id"), actBtn.getAttribute("data-act"), actBtn); return; }
    var appBtn = t.closest ? t.closest("button[data-approve]") : null;
    if (appBtn) { e.stopPropagation(); approve(appBtn.getAttribute("data-approve"), appBtn); return; }
    var sendBtn = t.closest ? t.closest("button[data-send]") : null;
    if (sendBtn) { e.stopPropagation(); doSend(sendBtn.getAttribute("data-send"), sendBtn); return; }
    var card = t.closest ? t.closest("[data-row]") : null;
    if (card) openDrawer(card.getAttribute("data-row"));
  });

  // Load-more (pagination) for the full ledger.
  el("moreBar").addEventListener("click", function (e) {
    var b = e.target.closest ? e.target.closest("#loadMore") : null;
    if (b) { renderLimit += PAGE; renderTable(); }
  });

  // Jump from a needs-you group into the filtered full ledger.
  function jumpToAll(kind) {
    el("search").value = "";
    el("statusFilter").value = "all";
    el("tierFilter").value = "all";
    el("outcomeFilter").value = "all";
    approvalOnly = false; digestFocus = null;
    el("approvalFilter").setAttribute("aria-pressed", "false");
    el("approvalFilter").classList.remove("on");
    if (kind === "ready") { el("tierFilter").value = "green"; el("statusFilter").value = "draft"; }
    else if (kind === "approve") { approvalOnly = true; el("approvalFilter").setAttribute("aria-pressed", "true"); el("approvalFilter").classList.add("on"); }
    else if (kind === "info") { el("statusFilter").value = "draft"; digestFocus = "info"; }
    else if (kind === "reply") { digestFocus = "reply"; }
    renderLimit = PAGE;
    setView("all");
    var tbl = el("quotesTable"); if (tbl) tbl.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // Drawer close affordances.
  el("drawerScrim").addEventListener("click", closeDrawer);
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && openId != null) closeDrawer();
  });
  // Drawer interactions (delegated).
  el("drawerInner").addEventListener("click", onDrawerClick);
  el("drawerInner").addEventListener("input", onDrawerInput);

  // Route on every auth change — this also catches the OAuth return, where
  // supabase-js parses the session out of the URL and fires SIGNED_IN.
  sb.auth.onAuthStateChange(function (evt, session) {
    if (evt === "SIGNED_OUT") { showLogin(); return; }
    if (session && session.user) decideRoute(session);
  });
  sb.auth.getSession().then(function (res) {
    var s = res.data && res.data.session;
    if (s && s.user) decideRoute(s); else showLogin();
  });

  // ── auth ──────────────────────────────────────────────────────────────────
  function onLoginSubmit(e) {
    e.preventDefault();
    var err = el("loginError");
    if (err) err.textContent = "";
    if (!sb) { if (err) err.textContent = tt("auth.notConfiguredShort"); return; }
    var email = el("email").value.trim(), pw = el("password").value;
    if (authMode === "signup") return doSignup(email, pw, err);
    var btn = el("loginBtn");
    btn.disabled = true; btn.textContent = tt("common.signingIn");
    sb.auth.signInWithPassword({ email: email, password: pw })
      .then(function (res) {
        btn.disabled = false; setSubmitLabel();
        if (res.error) { if (err) err.textContent = res.error.message; return; }
        if (res.data && res.data.session) decideRoute(res.data.session);
      })
      .catch(function () { btn.disabled = false; setSubmitLabel(); if (err) err.textContent = tt("common.networkError"); });
  }

  function doSignup(email, pw, err) {
    var v = pwCheck(pw);
    if (!email) { if (err) err.textContent = tt("auth.enterEmail"); return; }
    if (!v.ok) { if (err) err.textContent = tt("auth.choosePw", { req: v.msg }); return; }
    var btn = el("loginBtn");
    btn.disabled = true; btn.textContent = tt("auth.creatingAccount");
    sb.auth.signUp({ email: email, password: pw })
      .then(function (res) {
        btn.disabled = false; setSubmitLabel();
        if (res.error) { if (err) err.textContent = res.error.message; return; }
        // Email-confirmation ON → no session yet → tell them to check their inbox.
        // Confirmation OFF → session present, but the account is still PENDING, so
        // decideRoute lands them on the awaiting-activation screen. Either way, a
        // fresh signup never sees another tenant's data.
        if (res.data && res.data.session) decideRoute(res.data.session);
        else showNotice(email);
      })
      .catch(function () { btn.disabled = false; setSubmitLabel(); if (err) err.textContent = tt("common.networkError"); });
  }

  function googleSignIn() {
    var err = el("loginError"); if (err) err.textContent = "";
    var btn = el("googleBtn"); if (btn) btn.disabled = true;
    // Full-page redirect to Google via Supabase; on return, onAuthStateChange /
    // getSession picks up the session from the URL. redirectTo MUST be in
    // Supabase → Auth → URL Configuration → Redirect URLs (and Google's console).
    sb.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin + window.location.pathname }
    }).then(function (res) {
      if (res && res.error) { if (btn) btn.disabled = false; if (err) err.textContent = res.error.message; }
    }).catch(function () { if (btn) btn.disabled = false; if (err) err.textContent = tt("common.networkError"); });
  }

  function signOut() { sb.auth.signOut().then(showLogin, showLogin); }

  // Password policy (client-side hint; Supabase enforces its own minimum too).
  function pwCheck(pw) {
    pw = pw || "";
    var len = pw.length >= 8, letter = /[A-Za-z]/.test(pw), num = /[0-9]/.test(pw);
    var need = [];
    if (!len) need.push(tt("auth.pwLen8"));
    if (!letter) need.push(tt("auth.pwLetter"));
    if (!num) need.push(tt("auth.pwNumber"));
    return { ok: len && letter && num, len: len, letter: letter, num: num, msg: need.join(", ") };
  }
  function renderPwRules(pw) {
    var v = pwCheck(pw), box = el("pwRules"); if (!box) return;
    var map = { len: v.len, letter: v.letter, num: v.num };
    Array.prototype.forEach.call(box.querySelectorAll("[data-rule]"), function (li) {
      li.classList.toggle("ok", !!map[li.getAttribute("data-rule")]);
    });
  }

  function setSubmitLabel() { var b = el("loginBtn"); if (b) b.textContent = authMode === "signup" ? tt("auth.createAccount") : tt("common.signIn"); }

  // Keep the three auth text nodes in sync with the current mode + language.
  function applyAuthText() {
    var signup = authMode === "signup";
    var k = el("authKicker"); if (k) k.textContent = signup ? tt("auth.kickerSignup") : tt("auth.kickerSignin");
    var ti = el("authTitle"); if (ti) ti.textContent = signup ? tt("auth.titleSignup") : tt("auth.titleSignin");
    var su = el("authSub"); if (su) su.textContent = signup ? tt("auth.subSignup") : tt("auth.subSignin");
  }

  function setMode(mode) {
    authMode = mode === "signup" ? "signup" : "signin";
    var signup = authMode === "signup";
    var ts = el("tabSignin"), tu = el("tabSignup");
    if (ts) ts.setAttribute("aria-selected", signup ? "false" : "true");
    if (tu) tu.setAttribute("aria-selected", signup ? "true" : "false");
    var card = el("loginView"); if (card) card.setAttribute("data-mode", authMode);
    setSubmitLabel();
    var pw = el("password");
    if (pw) pw.setAttribute("autocomplete", signup ? "new-password" : "current-password");
    var rules = el("pwRules"); if (rules) rules.hidden = !signup;
    if (signup && pw) renderPwRules(pw.value);
    applyAuthText();
    var err = el("loginError"); if (err) err.textContent = "";
    showNotice(null); // ensure the form (not the notice) is visible
  }

  function showNotice(email) {
    var form = el("loginForm"), notice = el("authNotice"), tabs = document.querySelector(".qc-authtabs");
    if (email) {
      el("noticeEmail").textContent = email;
      if (form) form.hidden = true;
      if (tabs) tabs.hidden = true;
      if (notice) notice.hidden = false;
    } else {
      if (form) form.hidden = false;
      if (tabs) tabs.hidden = false;
      if (notice) notice.hidden = true;
    }
  }

  // Resolve the caller's tenant/role/status, then route.
  function decideRoute(session) {
    currentEmail = (session.user && session.user.email) || "";
    if (window.QWI18n) { QWI18n.setClient(sb); QWI18n.reconcileUser(session.user); }
    if (!window.QWTenancy) { showDash(currentEmail, { isAdmin: false, owner: resolvedOwner }); startDash(session.user); return; }
    // Demo / guided tour runs on simulated data — never gate it.
    if (window.QWDemo && QWDemo.isOn()) {
      showDash(currentEmail, { isAdmin: isAdminUser, owner: resolvedOwner });
      startDash(session.user);
      return;
    }
    QWTenancy.resolve(sb).then(function (p) {
      if (p.anon) { showLogin(); return; }
      // Not provisioned → explain it instead of rendering an empty console.
      // p.error means the profile READ itself failed (network / unreadable) — that
      // is INCONCLUSIVE, so we fail OPEN and render normally rather than locking a
      // working install behind an awaiting-activation screen it can't clear.
      if (!p.active && !p.error) { showPending(p); return; }
      resolvedOwner = p.owner || cfg.OWNER || null;
      isAdminUser = !!p.isAdmin;
      showDash(currentEmail, p);
      startDash(p.user);
    }, function () {
      // Resolver blew up entirely — inconclusive, fail OPEN (RLS is the real gate).
      resolvedOwner = resolvedOwner || cfg.OWNER || null;
      showDash(currentEmail, { isAdmin: false, owner: resolvedOwner });
      startDash(session.user);
    });
  }

  // First successful dashboard entry only: load data + run per-user onboarding.
  function startDash(user) {
    if (dashStarted) return;
    dashStarted = true;
    renderGreeting(user);
    loadQuotes();
    if (window.QWOnboarding && typeof window.QWOnboarding.check === "function") {
      window.QWOnboarding.check(sb, resolvedOwner, user);
    }
    // Guided tour: mount the "Take the tour" button, resume an in-progress tour, or
    // auto-launch it for a first-time (onboarded, not-yet-toured) user.
    if (window.QWTour && typeof window.QWTour.onConsoleReady === "function") {
      window.QWTour.onConsoleReady(sb, user);
    }
  }

  // Hooks the guided tour uses to drive the dashboard (open a quote, switch tabs).
  window.QWDash = {
    setView: function (v) { try { setView(v); } catch (e) {} },
    openDrawer: function (id) { try { if (findQuote(id)) openDrawer(id); } catch (e) {} },
    closeDrawer: function () { try { if (openId != null) closeDrawer(); } catch (e) {} }
  };

  function showLogin() {
    el("loginView").hidden = false;
    el("dashView").hidden = true;
    var pv = el("pendingView"); if (pv) pv.hidden = true;
    el("logoutBtn").hidden = true; el("whoami").textContent = "";
    var nav = el("subnav"); if (nav) nav.hidden = true;
    var an = el("adminNav"); if (an) an.hidden = true;
    setMode("signin");
  }
  // profile = the QWTenancy result (or a bare { email, status }). The copy shown
  // depends on WHY the account isn't provisioned: pending approval / suspended /
  // not linked to a workspace. QWAccount.paint swaps the section's i18n keys.
  function showPending(profile) {
    profile = profile || {};
    var email = profile.email || currentEmail || "";
    var status = profile.status === "suspended" ? "suspended"
      : (profile.noProfile || (profile.status === "active" && !profile.owner)) ? "unlinked"
      : profile.status || "pending";
    el("loginView").hidden = true;
    el("dashView").hidden = true;
    var pv = el("pendingView"); if (pv) pv.hidden = false;
    if (window.QWAccount && QWAccount.paint) QWAccount.paint(pv || document, { status: status }, email);
    var pe = el("pendingEmail"); if (pe) pe.textContent = email || "";
    el("logoutBtn").hidden = false; el("whoami").textContent = email || "";
    var nav = el("subnav"); if (nav) nav.hidden = true;
    var an = el("adminNav"); if (an) an.hidden = true;
  }
  function showDash(email, profile) {
    el("loginView").hidden = true; el("dashView").hidden = false;
    var pv = el("pendingView"); if (pv) pv.hidden = true;
    el("logoutBtn").hidden = false; el("whoami").textContent = email || "";
    var nav = el("subnav"); if (nav) nav.hidden = false;
    var an = el("adminNav"); if (an) an.hidden = !(profile && profile.isAdmin);
  }

  // ── greeting hero ───────────────────────────────────────────────────────────
  // New sign-ups (user_metadata.welcomed unset) get "Welcome, {name}" once, then
  // welcomed is stamped so every later visit shows a time-of-day greeting. Hour is
  // read at runtime from the browser. Demo/tour mode keeps a sensible name and never
  // writes to the real account.
  function greetingWord(h) {
    if (h >= 5 && h <= 11) return "Good morning";
    if (h >= 12 && h <= 16) return "Good afternoon";
    if (h >= 17 && h <= 21) return "Good evening";
    return "Good night";
  }
  function personName(user) {
    var md = (user && user.user_metadata) || {};
    var dn = (md.display_name == null ? "" : String(md.display_name)).trim();
    if (dn) return dn;
    var email = (user && user.email) || currentEmail || "";
    var local = (email.split("@")[0] || "").trim();
    return local || "there";
  }
  var welcomedMarked = false;
  function markWelcomed() {
    if (welcomedMarked) return; welcomedMarked = true;
    if (sb && sb.auth && typeof sb.auth.updateUser === "function") {
      try { sb.auth.updateUser({ data: { welcomed: true } }); } catch (e) {}
    }
  }
  function renderGreeting(user) {
    var titleEl = el("greetTitle"), subEl = el("greetSub"), banner = el("greetBanner");
    if (!titleEl || !banner) return;
    var demo = !!(window.QWDemo && QWDemo.isOn());
    var md = (user && user.user_metadata) || {};
    var name = personName(user);
    if (md.welcomed !== true && !demo) {
      titleEl.textContent = "Welcome, " + name;
      if (subEl) subEl.textContent = "You're all set — here's your quote pipeline at a glance.";
      markWelcomed();
    } else {
      titleEl.textContent = greetingWord(new Date().getHours()) + ", " + name;
      if (subEl) subEl.textContent = "Here's what's moving through your pipeline today.";
    }
    banner.hidden = false;
  }

  // ── helpers ───────────────────────────────────────────────────────────────
  var SYM = { EUR: "€", USD: "$", GBP: "£", TRY: "₺" };
  function money(n, cur) {
    if (n == null || isNaN(n)) return "—";
    var sym = SYM[cur] || (cur ? cur + " " : "");
    return sym + Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function moneyShort(n, cur) {
    if (n == null || isNaN(n)) return "—";
    var sym = SYM[cur] || (cur ? cur + " " : "");
    return sym + Number(n).toLocaleString("en-US", { maximumFractionDigits: 0 });
  }
  function fmtDate(s) {
    if (!s) return "—";
    var d = new Date(s);
    return isNaN(d) ? "—" : d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  }
  function fmtDateTime(s) {
    if (!s) return "";
    var d = new Date(s);
    return isNaN(d) ? "" : d.toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  }
  function bucket(q) { return (q.status || "").toLowerCase() === "draft" ? "draft" : "sent"; }
  function isDraft(q) { return bucket(q) === "draft"; }
  function outcomeOf(q) {
    var o = (q.outcome || "pending").toLowerCase();
    return (o === "won" || o === "lost") ? o : "pending";
  }
  // Localized lowercase outcome word for inline toasts ("Marked won.").
  function outcomeWord(o) {
    return o === "won" ? tt("dash.ocWonLc") : o === "lost" ? tt("dash.ocLostLc") : tt("dash.ocPending").toLowerCase();
  }
  function tierOf(q) {
    var t = (q.autonomy_tier || "").toLowerCase();
    return (t === "green" || t === "amber" || t === "red") ? t : null;
  }
  function esc(s) {
    return (s == null ? "" : String(s)).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }
  function nl2br(s) { return esc(s).replace(/\r?\n/g, "<br>"); }
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
  function threadOf(q) {
    var arr = q.thread_snapshot;
    if (typeof arr === "string") { try { arr = JSON.parse(arr); } catch (e) { arr = null; } }
    if (Array.isArray(arr)) return arr;
    if (arr && Array.isArray(arr.messages)) return arr.messages;
    return [];
  }
  function overallConf(q) {
    var c = numOrNull(q.match_confidence);
    if (c != null) return c;
    var o = parseOutput(q);
    return o ? numOrNull(o.match_confidence) : null;
  }
  function draftText(q) {
    var o = parseOutput(q);
    return (o && (o.quote_text || (o.output && o.output.quote_text))) || q.quote_text || "";
  }

  // Human product NAME first — SKU is a secondary tag (priority #1).
  function normLine(l) {
    var status = (l.status || "").toLowerCase();
    var hasPrice = (Number(l.total_cash) > 0) || (l.unit_cash != null && String(l.unit_cash).trim() !== "");
    if (status === "pending_info" && hasPrice) status = "provisional";
    var reason = l.match_reason || l.why || l.reason || l.match_note || l.note || "";
    if (!reason) {
      reason = status === "priced" ? "Matched to a catalogue SKU."
        : status === "provisional" ? "Provisionally priced; awaiting spec confirmation."
        : status === "pending_info" ? "Awaiting a detail from the customer."
        : status === "pending_hassan" ? "Product exists; price pending from Hassan."
        : "";
    }
    var conf = numOrNull(l.confidence);
    if (conf == null) conf = numOrNull(l.match_confidence);
    var name = l.product_name || l.urun_adi || l.product || l.name || l.description || "—";
    var cands = Array.isArray(l.candidates) ? l.candidates : [];
    return {
      ref: l.ref != null ? String(l.ref) : "",
      name: name,
      spec: l.spec || l.specs || "",
      colors: l.colors || l.colour || l.color || "",
      sku: l.sku || l.matched_sku || "",
      status: status,
      reason: reason,
      conf: conf,
      qty: numOrNull(l.qty),
      qty_unit: l.qty_unit || "",
      unit_cash: l.unit_cash,
      unit_term: l.unit_term,
      total_cash: numOrNull(l.total_cash),
      total_term: numOrNull(l.total_term),
      candidates: cands,
      raw: l
    };
  }
  function lineWeak(l) {
    if (l.status === "pending_info" || l.status === "pending_hassan") return true;
    if (l.status === "provisional") return true;
    if (l.conf != null && l.conf < CONF_MID) return true;
    return false;
  }
  // A short "customer & products" secondary line for the table.
  function productSummary(q) {
    var lines = linesOf(q).map(normLine);
    if (!lines.length) return "";
    var first = lines[0].name;
    var extra = lines.length - 1;
    return first + (extra > 0 ? "  ·  " + (extra === 1 ? tt("dash.plusLine", { n: extra }) : tt("dash.plusLines", { n: extra })) : "");
  }

  function normCur(c) {
    c = (c == null ? "" : String(c)).trim();
    var up = c.toUpperCase();
    if (up === "EUR" || up === "USD" || up === "GBP" || up === "TRY") return up;
    var hasE = c.indexOf("\u20AC") >= 0, hasD = c.indexOf("$") >= 0, hasP = c.indexOf("\u00A3") >= 0, hasL = c.indexOf("\u20BA") >= 0;
    var hits = (hasE?1:0) + (hasD?1:0) + (hasP?1:0) + (hasL?1:0);
    if (hits === 1) return hasE ? "EUR" : hasD ? "USD" : hasP ? "GBP" : "TRY";
    return null; // mixed / unknown currency -> not meaningfully summable
  }
  function sumByCur(list) {
    var by = {}, mixed = 0;
    list.forEach(function (q) {
      if (q.total == null || isNaN(q.total)) return;
      var c = normCur(q.currency);
      if (c) by[c] = (by[c] || 0) + Number(q.total);
      else mixed++;
    });
    if (mixed) by.__mixed = mixed;
    return by;
  }
  function curJoin(by, shortForm) {
    var order = ["EUR", "USD", "GBP", "TRY"], parts = [];
    order.forEach(function (c) { if (by[c] != null) parts.push((shortForm ? moneyShort : money)(by[c], c)); });
    Object.keys(by).forEach(function (c) { if (c !== "__mixed" && order.indexOf(c) < 0) parts.push((shortForm ? moneyShort : money)(by[c], c)); });
    if (by.__mixed) parts.push(tt("dash.mixed", { n: by.__mixed }));
    return parts.length ? parts.join("  ·  ") : "—";
  }

  // ── client-side digest metrics (fallback when the digest table is empty) ────
  function computeDigest() {
    if (digest) {
      return {
        needsInfo: digest.open_needs_info || 0,
        approvals: digest.needs_approval || 0,
        replies: digest.recent_replies || 0,
        source: "digest"
      };
    }
    var needsInfo = quotes.filter(function (q) {
      return linesOf(q).map(normLine).some(function (l) {
        return l.status === "pending_info" || l.status === "pending_hassan";
      });
    }).length;
    var approvals = quotes.filter(needsApproval).length;
    var replies = quotes.filter(function (q) { return q.last_reply_text; }).length;
    return { needsInfo: needsInfo, approvals: approvals, replies: replies, source: "client" };
  }
  function greenReady() {
    return quotes.filter(function (q) { return tierOf(q) === "green" && isDraft(q); }).length;
  }

  // ── digest banner ───────────────────────────────────────────────────────────
  function renderDigest() {
    var bar = el("digestBar");
    if (!bar) return;
    var d = computeDigest();
    var green = greenReady();
    var total = d.needsInfo + d.approvals + d.replies + green;
    if (!hasLoaded) { bar.hidden = true; return; }
    if (total === 0) {
      bar.hidden = false;
      bar.className = "qc-digest calm";
      bar.innerHTML = '<div class="qc-digest-calm"><span class="qc-digest-tick">' +
        '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5L20 7"/></svg></span>' +
        esc(tt("dash.digestClear")) + '</div>';
      return;
    }
    bar.hidden = false;
    bar.className = "qc-digest";
    var segs = [
      { k: "green", n: green, label: tt("dash.segReady"), cls: "seg-green",
        ico: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m22 2-7 20-4-9-9-4Z"/></svg>' },
      { k: "info", n: d.needsInfo, label: tt("dash.segInfo"), cls: "seg-info",
        ico: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 8h.01M11 12h1v4h1"/></svg>' },
      { k: "approve", n: d.approvals, label: tt("dash.segApprove"), cls: "seg-approve",
        ico: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9 2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/></svg>' },
      { k: "reply", n: d.replies, label: d.replies === 1 ? tt("dash.segReply1") : tt("dash.segReplyN"), cls: "seg-reply",
        ico: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>' }
    ];
    bar.innerHTML =
      '<div class="qc-digest-lead">' + esc(tt("dash.copilotBrief")) +
        (d.source === "client" ? '<span class="qc-digest-live" title="' + esc(tt("dash.liveTitle")) + '">' + esc(tt("dash.liveBadge")) + '</span>' : "") +
      '</div>' +
      '<div class="qc-digest-segs">' +
      segs.map(function (s) {
        var dim = s.n === 0 ? " dim" : "";
        return '<button type="button" class="qc-seg ' + s.cls + dim + '" data-digest="' + s.k + '"' +
          (s.n === 0 ? " disabled" : "") + '>' +
          '<span class="qc-seg-ico">' + s.ico + "</span>" +
          '<span class="qc-seg-n">' + s.n + "</span>" +
          '<span class="qc-seg-l">' + esc(s.label) + "</span></button>";
      }).join("") +
      "</div>";
  }
  el("digestBar").addEventListener("click", function (e) {
    var b = e.target.closest ? e.target.closest("button[data-digest]") : null;
    if (!b) return;
    var k = b.getAttribute("data-digest");
    // Reset filters, then apply the segment's focus.
    el("search").value = "";
    el("statusFilter").value = "all";
    el("tierFilter").value = "all";
    el("outcomeFilter").value = "all";
    approvalOnly = false;
    el("approvalFilter").setAttribute("aria-pressed", "false");
    el("approvalFilter").classList.remove("on");
    if (k === "green") { el("tierFilter").value = "green"; el("statusFilter").value = "draft"; }
    else if (k === "approve") { approvalOnly = true; el("approvalFilter").setAttribute("aria-pressed", "true"); el("approvalFilter").classList.add("on"); }
    else if (k === "info") { el("statusFilter").value = "draft"; digestFocus = "info"; }
    else if (k === "reply") { digestFocus = "reply"; }
    if (k !== "info" && k !== "reply") digestFocus = null;
    renderTable();
    el("quotesTable").scrollIntoView({ behavior: "smooth", block: "start" });
  });
  var digestFocus = null; // 'info' | 'reply' — extra filters the segments can toggle

  // ── tiles ─────────────────────────────────────────────────────────────────
  function renderTiles() {
    var drafts = quotes.filter(isDraft).length;
    var won = quotes.filter(function (q) { return outcomeOf(q) === "won"; });
    var lost = quotes.filter(function (q) { return outcomeOf(q) === "lost"; });
    var decided = won.length + lost.length;
    var winRate = decided > 0 ? Math.round(won.length / decided * 100) : null;
    var pending = quotes.length - won.length - lost.length;
    var awaiting = quotes.filter(needsApproval).length;

    var tiles = [
      { n: quotes.length, l: tt("dash.tileQuotes") },
      { n: pending, l: tt("dash.tilePending"), sub2: tt("dash.stillInDraft", { n: drafts }) },
      { n: awaiting, l: tt("dash.tileAwaiting"), warn: awaiting > 0, sub2: awaiting > 0 ? tt("dash.marginFlagged") : tt("dash.noneFlagged") },
      { n: winRate == null ? "—" : winRate + "%", l: tt("dash.tileWinRate"), accent: true, sub2: tt("dash.wonLost", { won: won.length, lost: lost.length }) },
      { n: curJoin(sumByCur(quotes), true), l: tt("dash.tileQuoted"), small: true },
      { n: curJoin(sumByCur(won), true), l: tt("dash.tileWonValue"), small: true, dark: true },
    ];
    el("tiles").innerHTML = tiles.map(function (t) {
      return '<div class="qc-tile' + (t.accent ? " accent" : "") + (t.dark ? " dark" : "") + (t.warn ? " warn" : "") + '">' +
        '<div class="l">' + esc(t.l) + "</div>" +
        '<div class="n' + (t.small ? " small" : "") + '">' + esc(t.n) + "</div>" +
        (t.sub2 ? '<div class="sub2">' + esc(t.sub2) + "</div>" : "") +
      "</div>";
    }).join("");

    var chip = el("approvalChipN");
    if (chip) { chip.hidden = awaiting === 0; chip.textContent = awaiting; }
  }

  // ── over-time chart (hand-rolled SVG) ───────────────────────────────────────
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
    if (!keys.length) {
      host.innerHTML = '<div class="empty">' + emptyPanel(ICON_INBOX, tt("dash.chartEmptyTitle"),
        tt("dash.chartEmptyBody")) + "</div>";
      return;
    }
    keys = keys.slice(-12);
    var data = keys.map(function (k) { return months[k]; });
    var maxN = data.reduce(function (m, x) { return Math.max(m, x.total); }, 1);

    // Nice, integer y-axis so a single month reads as a real chart (not a slab).
    var yMax, tickN;
    if (maxN <= 4) { yMax = maxN; tickN = maxN; }
    else { var step = Math.ceil(maxN / 4); yMax = step * 4; tickN = 4; }
    if (yMax < 1) yMax = 1;

    var VBW = 1000, VBH = 250, padT = 20, padB = 40, padL = 46, padR = 18;
    var innerW = VBW - padL - padR;
    var innerH = VBH - padT - padB;
    var baseY = padT + innerH;
    var n = data.length;
    // Fixed column pitch so bars keep a sensible width and cluster left with room
    // to grow — one month is a single tidy bar, not a full-width block.
    var slot = Math.min(innerW / n, 88);
    var barW = Math.max(16, Math.min(44, slot * 0.5));
    var parts = [];

    // gridlines (full plot width) + integer y-axis ticks
    for (var t = 0; t <= tickN; t++) {
      var val = Math.round(yMax * t / tickN);
      var gy = (baseY - (t / tickN) * innerH);
      var cls = t === 0 ? "axis-base" : "grid";
      parts.push('<line class="' + cls + '" x1="' + padL + '" y1="' + gy.toFixed(1) + '" x2="' + (padL + innerW).toFixed(1) + '" y2="' + gy.toFixed(1) + '"/>');
      parts.push('<text class="axis-lbl y" x="' + (padL - 12) + '" y="' + (gy + 4).toFixed(1) + '" text-anchor="end" font-size="15">' + val + "</text>");
    }

    data.forEach(function (x, i) {
      var cx = padL + slot * i + slot / 2;
      var bx = cx - barW / 2;
      var totH = x.total > 0 ? Math.max(4, x.total / yMax * innerH) : 0;
      var wonH = x.won > 0 ? Math.max(4, x.won / yMax * innerH) : 0;
      var yTop = baseY - totH;
      if (totH > 0) parts.push('<rect class="bar-rest" x="' + bx.toFixed(1) + '" y="' + yTop.toFixed(1) + '" width="' + barW.toFixed(1) + '" height="' + totH.toFixed(1) + '" rx="6"/>');
      if (wonH > 0) parts.push('<rect class="bar-won" x="' + bx.toFixed(1) + '" y="' + (baseY - wonH).toFixed(1) + '" width="' + barW.toFixed(1) + '" height="' + wonH.toFixed(1) + '" rx="6"/>');
      if (x.total > 0) parts.push('<text class="axis-lbl cnt" x="' + cx.toFixed(1) + '" y="' + (yTop - 9).toFixed(1) + '" text-anchor="middle" font-size="19" font-weight="600">' + x.total + "</text>");
      var lbl = (window.QWI18n ? QWI18n.monthShort(x.d) : x.d.toLocaleDateString("en-GB", { month: "short" }));
      parts.push('<text class="axis-lbl" x="' + cx.toFixed(1) + '" y="' + (VBH - 12) + '" text-anchor="middle" font-size="15">' + esc(lbl) + "</text>");
    });
    host.innerHTML = '<svg viewBox="0 0 ' + VBW + ' ' + VBH + '" preserveAspectRatio="xMidYMid meet" role="img" aria-label="' + esc(tt("dash.chartAria")) + '">' + parts.join("") + "</svg>";
  }

  // ── loading / empty / error states ──────────────────────────────────────────
  var COLSPAN = 11;
  function renderSkeleton() {
    el("tiles").innerHTML = "<div class=\"sk sk-tile\"></div>".repeat(6);
    el("chart").innerHTML = '<div class="sk sk-chart"></div>';
    var widths = [16, 16, 70, 150, 84, 48, 46, 50, 70, 96, 16];
    var cells = widths.map(function (w, i) {
      var cls = (i === 4 || i === 5) ? ' class="num"' : "";
      var ml = (i === 4 || i === 5) ? "margin-left:auto;" : "";
      return "<td" + cls + '><span class="sk sk-line" style="' + ml + "width:" + w + 'px"></span></td>';
    }).join("");
    el("quotesBody").innerHTML = ('<tr class="qc-skrow">' + cells + "</tr>").repeat(6);
    el("emptyState").hidden = true;
    hideTableError();
    el("rowCount").textContent = tt("common.loading");
  }
  function emptyPanel(icon, title, body) {
    return '<div class="ico">' + icon + "</div><h4>" + esc(title) + "</h4><p>" + esc(body) + "</p>";
  }
  var ICON_INBOX = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12h5l2 3h4l2-3h5"/><path d="M5 5.5h14a1.5 1.5 0 0 1 1.45 1.1L22 12v5a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-5l1.55-5.4A1.5 1.5 0 0 1 5 5.5z"/></svg>';
  var ICON_FILTER = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3 5h18l-7 8v5l-4 2v-7L3 5z"/></svg>';
  var ICON_WARN = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9 2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/></svg>';
  function showTableError(msg) {
    var t = el("tableError");
    t.innerHTML = '<div class="ico">' + ICON_WARN + "</div><h4>" + esc(tt("dash.loadErrTitle")) + "</h4>" +
      "<p>" + esc(msg || tt("dash.loadErrBody")) + "</p>" +
      '<button type="button" id="retryBtn" class="btn btn-primary btn-sm">' + esc(tt("dash.tryAgain")) + '</button>';
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
    // The button holds an icon + label span; only swap the label so the icon stays.
    var lbl = b.querySelector("span") || b;
    lbl.textContent = on ? tt("common.refreshing") : tt("common.refresh");
  }

  // ── table ─────────────────────────────────────────────────────────────────
  function tierCell(q) {
    var t = tierOf(q);
    if (!t) return '<span class="qc-tier none" title="' + esc(tt("dash.tierNone")) + '">—</span>';
    var lbl = { green: tt("dash.tierReady"), amber: tt("dash.tierReview"), red: tt("dash.tierWork") }[t];
    return '<span class="qc-tier ' + t + '" title="' + esc(tt("dash.tierTitle", { t: t })) + '"><i></i>' + esc(lbl) + "</span>";
  }
  function marginCell(q) {
    var p = numOrNull(q.margin_pct);
    if (p == null) return '<span class="qc-mut">—</span>';
    var band = marginBand(p);
    return '<span class="qc-margin ' + band + '" title="' + esc(tt("dash.marginTitle", { v: money(q.margin_amount, q.currency) })) + '">' +
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
        '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5L20 7"/></svg>' + esc(tt("dash.approve")) + '</button>';
    }
    if (q.approved_by) {
      return '<span class="qc-approved" title="' + esc(tt("dash.approvedByTitle", { who: q.approved_by })) +
        (q.approved_at ? " · " + esc(fmtDate(q.approved_at)) : "") + '">' +
        '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5L20 7"/></svg>' + esc(tt("dash.approved")) + '</span>';
    }
    return '<span class="qc-mut">—</span>';
  }
  var CHEVRON = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>';

  // Combined search haystack — customer + EVERY line's product name and SKU.
  function searchHay(q) {
    var bits = [q.customer || ""];
    linesOf(q).map(normLine).forEach(function (l) { bits.push(l.name, l.sku, l.spec, l.colors); });
    return bits.join(" ").toLowerCase();
  }
  function filteredRows() {
    var q = (el("search").value || "").trim().toLowerCase();
    var sf = el("statusFilter").value;
    var tf = el("tierFilter").value;
    var of = el("outcomeFilter").value;
    return quotes.filter(function (r) {
      if (q) {
        if (searchHay(r).indexOf(q) === -1) return false;
      }
      if (sf !== "all" && bucket(r) !== sf) return false;
      if (tf !== "all" && tierOf(r) !== tf) return false;
      if (of !== "all" && outcomeOf(r) !== of) return false;
      if (approvalOnly && !needsApproval(r)) return false;
      if (digestFocus === "info" && !linesOf(r).map(normLine).some(function (l) { return l.status === "pending_info" || l.status === "pending_hassan"; })) return false;
      if (digestFocus === "reply" && !r.last_reply_text) return false;
      return true;
    });
  }

  function renderTable() {
    var rows = sortRows(filteredRows());
    var total = rows.length;
    var empty = el("emptyState");
    if (total === 0) {
      el("rowCount").textContent = tt("dash.rowOf", { a: 0, b: quotes.length });
      empty.hidden = false;
      if (quotes.length === 0) {
        empty.innerHTML = emptyPanel(ICON_INBOX, tt("dash.emptyNoneTitle"),
          tt("dash.emptyNoneBody"));
      } else {
        empty.innerHTML = emptyPanel(ICON_FILTER, tt("dash.emptyNoMatchTitle"),
          tt("dash.emptyNoMatchBody"));
      }
      el("quotesBody").innerHTML = "";
      var mb0 = el("moreBar"); if (mb0) mb0.hidden = true;
      syncSelectAll();
      return;
    }
    empty.hidden = true;
    if (renderLimit > total) renderLimit = Math.max(PAGE, Math.ceil(total / PAGE) * PAGE);
    var shown = Math.min(renderLimit, total);
    var pageRows = rows.slice(0, shown);
    el("rowCount").textContent = shown < total ? tt("dash.showingOf", { a: shown, b: total }) : tt("dash.rowOf", { a: total, b: quotes.length });
    // Load-more control (pagination for 50+ rows).
    var mb = el("moreBar");
    if (mb) {
      if (shown < total) {
        mb.hidden = false;
        mb.innerHTML = '<button type="button" id="loadMore" class="btn btn-ghost btn-sm">' +
          esc(tt("dash.loadMore", { n: Math.min(PAGE, total - shown) })) + '</button>' +
          '<span class="qc-more-count">' + esc(tt("dash.ofShown", { a: shown, b: total })) + "</span>";
      } else { mb.hidden = true; mb.innerHTML = ""; }
    }
    el("quotesBody").innerHTML = pageRows.map(function (r) {
      var b = bucket(r);
      var oc = outcomeOf(r);
      var id = r.id != null ? String(r.id) : "";
      var flagged = needsApproval(r);
      var sel = !!selected[id];
      var acts = '<span class="qc-acts">' +
        '<button class="qc-act win ' + (oc === "won" ? "on" : "") + '" data-id="' + esc(id) + '" data-act="won">' + esc(tt("dash.won")) + '</button>' +
        '<button class="qc-act lose ' + (oc === "lost" ? "on" : "") + '" data-id="' + esc(id) + '" data-act="lost">' + esc(tt("dash.lost")) + '</button>' +
        (oc !== "pending" ? '<button class="qc-act" data-id="' + esc(id) + '" data-act="pending">' + esc(tt("dash.reset")) + '</button>' : "") +
        "</span>";
      var summary = productSummary(r);
      return '<tr data-row="' + esc(id) + '" class="qc-row' + (flagged ? " needs-approval" : "") + (sel ? " is-sel" : "") + (openId === id ? " is-open" : "") + '">' +
        '<td class="qc-col-sel"><input type="checkbox" class="qc-rowsel" data-sel="' + esc(id) + '"' + (sel ? " checked" : "") + ' aria-label="' + esc(tt("dash.selectQuote")) + '"></td>' +
        '<td class="qc-col-tier">' + tierCell(r) + "</td>" +
        '<td lang="en">' + esc(fmtDate(r.created_at)) + "</td>" +
        '<td class="qc-cust"><span class="qc-cust-name" lang="en">' + esc(r.customer || "—") + "</span>" +
          (summary ? '<span class="qc-cust-prod" lang="en">' + esc(summary) + "</span>" : "") +
          (r.last_reply_text ? '<span class="qc-reply-dot" title="' + esc(tt("dash.newReplyTitle")) + '">' + esc(tt("dash.newReplyDot")) + '</span>' : "") + "</td>" +
        '<td class="num qc-total" lang="en">' + esc(money(r.total, r.currency)) + "</td>" +
        '<td class="num">' + marginCell(r) + "</td>" +
        "<td>" + confCell(overallConf(r)) + "</td>" +
        "<td><span class='pill " + b + "'>" + (b === "draft" ? esc(tt("dash.draft")) : esc(tt("dash.sent"))) + "</span></td>" +
        "<td>" + approvalCell(r, id) + "</td>" +
        "<td><div class='qc-outcome'><span class='pill " + oc + "'>" + esc(tt("dash.oc" + oc.charAt(0).toUpperCase() + oc.slice(1))) + "</span>" + acts + "</div></td>" +
        '<td class="qc-col-open"><span class="qc-open-cue" aria-hidden="true">' + CHEVRON + "</span></td>" +
      "</tr>";
    }).join("");
    syncSelectAll();
  }

  // ── "Needs you" queue ───────────────────────────────────────────────────────
  var ICON_REPLY = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';
  var ICON_INFO = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 8h.01M11 12h1v4h1"/></svg>';
  var ICON_SEND = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>';
  var ICON_CHECK = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>';

  function hasWeakLines(q) {
    return linesOf(q).map(normLine).some(function (l) {
      return l.status === "pending_info" || l.status === "pending_hassan";
    });
  }
  function needsYouSets() {
    var reply = [], approve = [], info = [], ready = [];
    quotes.forEach(function (q) {
      if (q.last_reply_text) reply.push(q);
      if (needsApproval(q)) approve.push(q);
      if (isDraft(q) && hasWeakLines(q)) info.push(q);
      if (tierOf(q) === "green" && isDraft(q) && !needsApproval(q) && !hasWeakLines(q)) ready.push(q);
    });
    return { reply: reply, approve: approve, info: info, ready: ready };
  }
  function needsYouCount() {
    var s = needsYouSets(), seen = {};
    [s.reply, s.approve, s.info, s.ready].forEach(function (a) { a.forEach(function (q) { seen[String(q.id)] = true; }); });
    return Object.keys(seen).length;
  }
  function renderViewTabs() {
    var n = needsYouCount(), badge = el("needsYouN");
    if (badge) { badge.hidden = !hasLoaded || n === 0; badge.textContent = n; }
    var allB = el("allN");
    if (allB) { allB.hidden = !hasLoaded; allB.textContent = quotes.length; }
  }
  function nyCard(q, action) {
    var id = String(q.id);
    var tier = tierOf(q);
    var tierBadge = tier ? '<span class="qc-tier ' + tier + '"><i></i>' +
      esc({ green: tt("dash.tierReady"), amber: tt("dash.tierReview"), red: tt("dash.tierWork") }[tier]) + "</span>" : "";
    var summary = productSummary(q);
    var meta = [money(q.total, q.currency), fmtDate(q.created_at)]
      .filter(function (x) { return x && x !== "—"; }).join("  ·  ");
    var actHtml;
    if (action === "approve") actHtml = '<button class="btn btn-primary btn-sm" data-approve="' + esc(id) + '">' + esc(tt("dash.approve")) + '</button>';
    else if (action === "send") actHtml = '<button class="btn btn-primary btn-sm qc-send" data-send="' + esc(id) + '">' +
      '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>' + esc(tt("dash.send")) + '</button>';
    else actHtml = '<span class="qc-ny-open" aria-hidden="true">' + esc(tt("dash.open")) + CHEVRON + "</span>";
    return '<div class="qc-ny-card" data-row="' + esc(id) + '" tabindex="0" role="button" aria-label="' + esc(tt("dash.openCust", { c: q.customer || tt("dash.quoteFallback") })) + '">' +
      '<div class="qc-ny-main">' +
        '<div class="qc-ny-top"><span class="qc-ny-cust" lang="en">' + esc(q.customer || "—") + "</span>" + tierBadge + "</div>" +
        (summary ? '<div class="qc-ny-prod" lang="en">' + esc(summary) + "</div>" : "") +
        (meta ? '<div class="qc-ny-meta" lang="en">' + esc(meta) + "</div>" : "") +
      "</div>" +
      '<div class="qc-ny-act">' + actHtml + "</div>" +
    "</div>";
  }
  function renderNeedsYou() {
    var host = el("needsYouBody");
    if (!host) return;
    if (!hasLoaded) { host.innerHTML = ""; return; }
    var s = needsYouSets();
    var groups = [
      { key: "reply", items: s.reply, title: tt("dash.nyReplyT"), sub: tt("dash.nyReplyS"), icon: ICON_REPLY, action: "open", jump: "reply" },
      { key: "approve", items: s.approve, title: tt("dash.nyApproveT"), sub: tt("dash.nyApproveS"), icon: ICON_WARN, action: "approve", jump: "approve" },
      { key: "info", items: s.info, title: tt("dash.nyInfoT"), sub: tt("dash.nyInfoS"), icon: ICON_INFO, action: "open", jump: "info" },
      { key: "ready", items: s.ready, title: tt("dash.nyReadyT"), sub: tt("dash.nyReadyS"), icon: ICON_SEND, action: "send", jump: "ready" }
    ].filter(function (g) { return g.items.length; });
    if (!groups.length) {
      host.innerHTML = '<div class="qc-empty qc-ny-empty">' + emptyPanel(ICON_CHECK,
        quotes.length ? tt("dash.nyCaughtT") : tt("dash.nyNoneT"),
        quotes.length ? tt("dash.nyCaughtB") : tt("dash.nyNoneB")) + "</div>";
      return;
    }
    var CAP = 6;
    host.innerHTML = groups.map(function (g) {
      var shown = g.items.slice(0, CAP), more = g.items.length - shown.length;
      return '<section class="qc-ny-group">' +
        '<div class="qc-ny-ghead">' +
          '<span class="qc-ny-gico ' + g.key + '">' + g.icon + "</span>" +
          '<h3>' + esc(g.title) + '<span class="qc-ny-gn">' + g.items.length + "</span></h3>" +
          '<span class="qc-ny-gsub">' + esc(g.sub) + "</span>" +
          '<button type="button" class="qc-ny-all" data-jump="' + g.jump + '">' + esc(tt("dash.viewInLedger")) + CHEVRON + "</button>" +
        "</div>" +
        '<div class="qc-ny-cards">' + shown.map(function (q) { return nyCard(q, g.action); }).join("") + "</div>" +
        (more > 0 ? '<button type="button" class="qc-ny-morelink" data-jump="' + g.jump + '">' + esc(tt("dash.moreInLedger", { n: more })) + "</button>" : "") +
      "</section>";
    }).join("");
  }

  // ── sorting (attention-first by default) ─────────────────────────────────────
  function dtOf(q) { var d = new Date(q.created_at); return isNaN(d) ? 0 : d.getTime(); }
  function attnScore(q) {
    var s = 0;
    if (needsApproval(q)) s += 1000;
    if (q.last_reply_text) s += 800;
    if (isDraft(q) && hasWeakLines(q)) s += 600;
    if (tierOf(q) === "green" && isDraft(q)) s += 400;
    if (isDraft(q)) s += 200;
    if (outcomeOf(q) !== "pending") s -= 300;
    return s;
  }
  function sortRows(rows) {
    var m = sortMode;
    return rows.slice().sort(function (a, b) {
      if (m === "newest") return dtOf(b) - dtOf(a);
      if (m === "oldest") return dtOf(a) - dtOf(b);
      if (m === "value") { var av = numOrNull(a.total), bv = numOrNull(b.total); return (bv == null ? -1 : bv) - (av == null ? -1 : av); }
      if (m === "margin") { var am = numOrNull(a.margin_pct), bm = numOrNull(b.margin_pct); return (am == null ? 1e9 : am) - (bm == null ? 1e9 : bm); }
      var d = attnScore(b) - attnScore(a);
      return d !== 0 ? d : dtOf(b) - dtOf(a);
    });
  }

  function render() { renderDigest(); renderTiles(); renderChart(); renderViewTabs(); if (view === "needsyou") renderNeedsYou(); else renderTable(); renderBulk(); }

  // ── selection / bulk ────────────────────────────────────────────────────────
  function onSelectAll() {
    var on = el("selectAll").checked;
    var rows = filteredRows();
    rows.forEach(function (r) {
      var id = r.id != null ? String(r.id) : "";
      if (on) selected[id] = true; else delete selected[id];
    });
    renderTable();
    renderBulk();
  }
  function syncSelectAll() {
    var rows = filteredRows();
    var sa = el("selectAll");
    if (!sa) return;
    var selCount = rows.filter(function (r) { return selected[String(r.id)]; }).length;
    sa.checked = rows.length > 0 && selCount === rows.length;
    sa.indeterminate = selCount > 0 && selCount < rows.length;
  }
  function selectedQuotes() {
    return quotes.filter(function (q) { return selected[String(q.id)]; });
  }
  function renderBulk() {
    var bar = el("bulkBar");
    var list = selectedQuotes();
    if (!list.length) { bar.hidden = true; bar.innerHTML = ""; document.body.classList.remove("qc-has-bulk"); return; }
    var drafts = list.filter(isDraft).length;
    bar.hidden = false;
    document.body.classList.add("qc-has-bulk");
    bar.innerHTML =
      '<span class="qc-bulk-n">' + esc(tt("dash.nSelected", { n: list.length })) + "</span>" +
      '<span class="qc-bulk-sub">' + esc(drafts === 1 ? tt("dash.nDraft1") : tt("dash.nDraftN", { n: drafts })) + "</span>" +
      '<span class="qc-bulk-sp"></span>' +
      '<button type="button" class="btn btn-primary btn-sm" id="bulkSend"' + (drafts === 0 ? " disabled" : "") + '>' + esc(drafts === 1 ? tt("dash.sendNDraft1") : tt("dash.sendNDraftN", { n: drafts })) + "</button>" +
      '<div class="qc-bulk-label"><input type="text" id="bulkLabelInput" class="qc-bulk-input" placeholder="' + esc(tt("dash.labelNamePh")) + '" maxlength="60">' +
        '<button type="button" class="btn btn-ghost btn-sm" id="bulkLabel">' + esc(tt("dash.applyLabel")) + '</button></div>' +
      '<button type="button" class="qc-bulk-clear" id="bulkClear" aria-label="' + esc(tt("dash.clearSel")) + '">' + esc(tt("dash.clear")) + '</button>';
    el("bulkSend").addEventListener("click", bulkSend);
    el("bulkLabel").addEventListener("click", bulkLabel);
    el("bulkClear").addEventListener("click", function () { selected = {}; renderTable(); renderBulk(); });
  }

  // ── secured webhook client ──────────────────────────────────────────────────
  function api(path, body) {
    // DEMO MODE: simulate a successful pipeline call — never hit the network / DB.
    if (window.QWDemo && QWDemo.isOn()) {
      var out = { ok: true, status: "sent", demo: true };
      var q = body && body.quote_id ? findQuote(body.quote_id) : null;
      if (/resolve-line/.test(path) && q) {
        // reflect the resolution locally so the drawer visibly updates during the tour
        var ls = linesOf(q);
        for (var i = 0; i < ls.length; i++) {
          if (String(ls[i].ref) === String(body.line_ref)) {
            ls[i].status = "priced"; ls[i].sku = body.chosen_sku || ls[i].sku;
            if (ls[i].candidates) ls[i].candidates = [];
            ls[i].match_reason = "Resolved from the console (demo).";
          }
        }
      }
      return Promise.resolve(out);
    }
    return sb.auth.getSession().then(function (res) {
      var s = res.data && res.data.session;
      var token = s && s.access_token;
      if (!token) { return Promise.reject({ status: 401, message: tt("dash.sessionExpired") }); }
      return fetch(WEBHOOK_BASE + path, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": "Bearer " + token },
        body: JSON.stringify(body || {})
      }).then(function (r) {
        return r.text().then(function (txt) {
          var json = null;
          try { json = txt ? JSON.parse(txt) : null; } catch (e) { json = null; }
          if (r.status === 401 || r.status === 403) {
            return Promise.reject({ status: r.status, message: (json && json.error) || tt("dash.notAuthorised") });
          }
          if (!r.ok || (json && json.ok === false)) {
            return Promise.reject({ status: r.status, message: (json && (json.error || json.message)) || tt("dash.requestFailed", { status: r.status }) });
          }
          return json || { ok: true };
        });
      });
    });
  }
  function handleApiError(err) {
    var msg = (err && err.message) || tt("common.networkError");
    if (err && (err.status === 401 || err.status === 403)) {
      toast(msg, true);
    } else {
      toast(msg, true);
    }
  }

  // ── confirm dialog (promise) ────────────────────────────────────────────────
  function confirmDialog(title, bodyHtml, okLabel, danger) {
    var dlg = el("confirmDialog");
    el("confirmTitle").textContent = title;
    el("confirmBody").innerHTML = bodyHtml;
    var ok = el("confirmOk");
    ok.textContent = okLabel || tt("common.confirm");
    ok.classList.toggle("is-danger", !!danger);
    return new Promise(function (resolve) {
      function onClose() {
        dlg.removeEventListener("close", onClose);
        resolve(dlg.returnValue === "ok");
      }
      dlg.addEventListener("close", onClose);
      if (typeof dlg.showModal === "function") dlg.showModal();
      else resolve(window.confirm(title));
    });
  }

  // ── outcome write ───────────────────────────────────────────────────────────
  function setOutcome(id, outcome, btn) {
    if (!id) return;
    if (window.QWDemo && QWDemo.isOn()) {
      patchLocal(id, { outcome: outcome, outcome_at: new Date().toISOString() });
      render(); if (openId === String(id)) renderDrawer();
      toast(tt("dash.markedDemo", { o: outcomeWord(outcome) }));
      return;
    }
    var acts = btn && btn.parentNode ? btn.parentNode.querySelectorAll("button") : [];
    for (var i = 0; i < acts.length; i++) acts[i].disabled = true;
    var patch = { outcome: outcome, outcome_at: new Date().toISOString() };
    sb.from("quotes").update(patch).eq("id", id).then(function (res) {
      for (var j = 0; j < acts.length; j++) acts[j].disabled = false;
      if (res.error) {
        var m = res.error.message || "";
        if (/column|outcome/i.test(m)) toast(tt("dash.runAnalyticsSql"), true);
        else toast(tt("dash.couldntSave", { m: m }), true);
        return;
      }
      patchLocal(id, { outcome: outcome, outcome_at: patch.outcome_at });
      render();
      toast(tt("dash.marked", { o: outcomeWord(outcome) }));
    }).catch(function () {
      for (var n = 0; n < acts.length; n++) acts[n].disabled = false;
      toast(tt("common.networkError"), true);
    });
  }

  function approve(id, btn) {
    if (!id) return;
    var rec = findQuote(id);
    if (!rec) return;
    var snapshot = { needs_approval: rec.needs_approval, approved_by: rec.approved_by, approved_at: rec.approved_at };
    var now = new Date().toISOString();
    var by = currentEmail || "console";
    rec.needs_approval = false; rec.approved_by = by; rec.approved_at = now;
    render();
    if (openId === String(id)) renderDrawer();
    if (window.QWDemo && QWDemo.isOn()) { toast(tt("dash.approvedDemo")); return; }
    var patch = { needs_approval: false, approved_by: by, approved_at: now };
    sb.from("quotes").update(patch).eq("id", id).then(function (res) {
      if (res.error) {
        rec.needs_approval = snapshot.needs_approval; rec.approved_by = snapshot.approved_by; rec.approved_at = snapshot.approved_at;
        render(); if (openId === String(id)) renderDrawer();
        var m = res.error.message || "";
        if (/column|needs_approval|approved_by/i.test(m)) toast(tt("dash.runExpansionSql"), true);
        else toast(tt("dash.couldntApprove", { m: m }), true);
        return;
      }
      toast(tt("dash.approvedToast"));
    }).catch(function () {
      rec.needs_approval = snapshot.needs_approval; rec.approved_by = snapshot.approved_by; rec.approved_at = snapshot.approved_at;
      render(); if (openId === String(id)) renderDrawer();
      toast(tt("dash.netErrNotApproved"), true);
    });
  }

  function findQuote(id) {
    for (var i = 0; i < quotes.length; i++) if (String(quotes[i].id) === String(id)) return quotes[i];
    return null;
  }
  function patchLocal(id, fields) {
    var q = findQuote(id);
    if (!q) return;
    for (var k in fields) if (fields.hasOwnProperty(k)) q[k] = fields[k];
  }

  // ════════════════════════════════════════════════════════════════════════════
  //  WORKSPACE DRAWER — thread, product-forward lines + resolution, draft + actions
  // ════════════════════════════════════════════════════════════════════════════
  function openDrawer(id) {
    if (!id) return;
    openId = String(id);
    lastFocus = document.activeElement;
    renderDrawer();
    var scrim = el("drawerScrim"), dr = el("drawer");
    scrim.hidden = false; dr.hidden = false; dr.setAttribute("aria-hidden", "false");
    document.body.classList.add("qc-drawer-open");
    // next frame → transition in
    requestAnimationFrame(function () { scrim.classList.add("show"); dr.classList.add("show"); });
    var closeBtn = el("drawer").querySelector(".qc-drawer-close");
    if (closeBtn) closeBtn.focus();
    renderTable(); // reflect is-open highlight
  }
  function closeDrawer() {
    if (openId == null) return;
    var scrim = el("drawerScrim"), dr = el("drawer");
    scrim.classList.remove("show"); dr.classList.remove("show");
    dr.setAttribute("aria-hidden", "true");
    document.body.classList.remove("qc-drawer-open");
    var was = openId; openId = null;
    var finish = function () {
      scrim.hidden = true; dr.hidden = true;
      dr.removeEventListener("transitionend", onEnd);
    };
    var onEnd = function (e) { if (e.target === dr && e.propertyName === "transform") finish(); };
    dr.addEventListener("transitionend", onEnd);
    setTimeout(finish, 420); // fallback if transitionend doesn't fire
    if (lastFocus && lastFocus.focus) lastFocus.focus();
    renderTable();
    void was;
  }

  function renderDrawer() {
    if (openId == null) return;
    var q = findQuote(openId);
    if (!q) { closeDrawer(); return; }
    el("drawerInner").innerHTML = drawerHtml(q);
  }

  function drawerHtml(q) {
    var id = String(q.id);
    var b = bucket(q);
    var tier = tierOf(q);
    var tierBadge = tier
      ? '<span class="qc-tier ' + tier + '"><i></i>' + esc({ green: tt("dash.tierReady"), amber: tt("dash.tierReview"), red: tt("dash.tierWork") }[tier]) + "</span>"
      : "";
    var sentInfo = (b === "sent" && q.sent_at)
      ? '<span class="qc-sentline">' + esc(tt("dash.sentLine", { dt: fmtDateTime(q.sent_at) })) + (q.sent_by ? " · " + esc(q.sent_by) : "") + "</span>" : "";

    // ── header
    var head =
      '<div class="qc-dh">' +
        '<button class="qc-drawer-close" aria-label="' + esc(tt("dash.closeWorkspace")) + '">' +
          '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button>' +
        '<div class="qc-dh-main">' +
          '<div class="qc-dh-row">' +
            '<h2 class="qc-dh-cust" lang="en">' + esc(q.customer || tt("dash.quoteFallback")) + "</h2>" +
            '<span class="pill ' + b + '">' + (b === "draft" ? esc(tt("dash.draft")) : esc(tt("dash.sent"))) + "</span>" +
            tierBadge +
          "</div>" +
          '<div class="qc-dh-meta"><span lang="en">' + esc(fmtDate(q.created_at)) + "</span>" +
            '  ·  <span class="qc-dh-total" lang="en">' + esc(money(q.total, q.currency)) + "</span>" +
            (numOrNull(q.grand_total_vadeli) != null ? '  ·  ' + esc(tt("dash.term", { v: money(q.grand_total_vadeli, q.currency) })) : "") +
            (sentInfo ? "  ·  " + sentInfo : "") +
          "</div>" +
        "</div>" +
      "</div>";

    var reply = q.last_reply_text
      ? '<div class="qc-dnote"><strong>' + esc(tt("dash.newReplyHead")) + '</strong><p>' + nl2br(q.last_reply_text) + "</p></div>" : "";

    return head +
      '<div class="qc-dbody">' +
        reply +
        threadPanel(q) +
        linesPanel(q, id) +
        briefPanel(q) +
        draftPanel(q, id) +
      "</div>";
  }

  // ── thread panel (reads thread_snapshot; no live Gmail call) ─────────────────
  function normMsg(m) {
    var from = m.from || m.sender || m.author || m.email || "";
    var date = m.date || m.ts || m.timestamp || m.created_at || m.time || "";
    var body = m.body || m.text || m.snippet || m.content || m.message || "";
    var dir = (m.direction || m.type || m.role || "").toLowerCase();
    var outbound;
    if (dir === "outbound" || dir === "sent" || dir === "firm" || dir === "agent" || dir === "us") outbound = true;
    else if (dir === "inbound" || dir === "received" || dir === "customer") outbound = false;
    else outbound = FIRM_HINTS.some(function (h) { return String(from).toLowerCase().indexOf(h) !== -1; });
    return { from: from, date: date, body: body, outbound: outbound };
  }
  function threadPanel(q) {
    var msgs = threadOf(q).map(normMsg);
    var inner;
    if (!msgs.length) {
      inner = '<div class="qc-empty-mini">' + tt("dash.threadEmpty") + "</div>";
    } else {
      inner = '<div class="qc-thread">' + msgs.map(function (m) {
        return '<div class="qc-msg ' + (m.outbound ? "out" : "in") + '">' +
          '<div class="qc-msg-head"><span class="qc-msg-from" lang="en">' + esc(m.from || (m.outbound ? "Hassan" : tt("dash.customer"))) + "</span>" +
            (m.date ? '<span class="qc-msg-date" lang="en">' + esc(fmtDateTime(m.date)) + "</span>" : "") + "</div>" +
          '<div class="qc-msg-body" lang="en">' + nl2br(m.body) + "</div></div>";
      }).join("") + "</div>";
    }
    return section(tt("dash.convo"), msgs.length ? (msgs.length === 1 ? tt("dash.msg1") : tt("dash.msgN", { n: msgs.length })) : "", inner);
  }

  // ── product-forward lines + resolution picker ────────────────────────────────
  function statusPill(status) {
    return status === "priced" ? '<span class="pill sent">' + esc(tt("dash.priced")) + '</span>'
      : status === "provisional" ? '<span class="pill provisional">' + esc(tt("dash.provisional")) + '</span>'
      : status === "pending_info" ? '<span class="pill pending">' + esc(tt("dash.needsInfo")) + '</span>'
      : status === "pending_hassan" ? '<span class="pill info">' + esc(tt("dash.pendingPrice")) + '</span>'
      : "";
  }
  function candChip(id, ref, c) {
    var price = (c.unit_price != null && c.unit_price !== "")
      ? '<span class="qc-cand-price">' + esc(money(c.unit_price, c.currency)) + "</span>" : "";
    var conf = numOrNull(c.confidence);
    var confTag = conf != null ? '<span class="qc-conf ' + confBand(conf) + '"><i></i>' + Math.round(conf) + "</span>" : "";
    var specs = [c.specs, c.colour || c.color].filter(Boolean).join(" · ");
    return '<button type="button" class="qc-cand" data-resolve="' + esc(id) + '" data-ref="' + esc(ref) + '" data-sku="' + esc(c.sku || "") + '">' +
      '<span class="qc-cand-top"><span class="qc-cand-name" lang="en">' + esc(c.name || c.urun_adi || c.sku || tt("dash.candidate")) + "</span>" + price + "</span>" +
      (specs ? '<span class="qc-cand-specs" lang="en">' + esc(specs) + "</span>" : "") +
      '<span class="qc-cand-foot">' + (c.sku ? '<span class="qc-cand-sku" lang="en">' + esc(c.sku) + "</span>" : "") +
        (c.reason ? '<span class="qc-cand-why">' + esc(c.reason) + "</span>" : "") + confTag + "</span>" +
      '<span class="qc-cand-pick">' + esc(tt("dash.useThis")) +
        '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg></span>' +
      "</button>";
  }
  function lineCard(q, id, raw) {
    var l = normLine(raw);
    var weak = lineWeak(l);
    var unit = l.unit_cash != null && String(l.unit_cash).trim() !== "" ? esc(String(l.unit_cash)) : "";
    var qty = l.qty != null ? esc(l.qty.toLocaleString("en-US")) + (l.qty_unit ? " " + esc(l.qty_unit) : "") : "";
    var total = l.total_cash != null ? money(l.total_cash, q.currency) : "";
    var metaBits = [];
    if (l.spec) metaBits.push(esc(l.spec));
    if (l.colors) metaBits.push(esc(l.colors));
    var head =
      '<div class="qc-line-head">' +
        '<div class="qc-line-id">' + esc(l.ref || "—") + "</div>" +
        '<div class="qc-line-main">' +
          '<div class="qc-line-name" lang="en">' + esc(l.name) + "</div>" +
          (metaBits.length ? '<div class="qc-line-spec" lang="en">' + metaBits.join(" · ") + "</div>" : "") +
          '<div class="qc-line-tags">' +
            (l.sku ? '<span class="qc-sku-tag" lang="en">' + esc(l.sku) + "</span>" : '<span class="qc-sku-tag muted">' + esc(tt("dash.unmatched")) + "</span>") +
            (l.conf != null ? confCell(l.conf) : "") +
          "</div>" +
        "</div>" +
        '<div class="qc-line-num">' +
          (unit ? '<div class="qc-line-unit">' + unit + "</div>" : "") +
          (qty ? '<div class="qc-line-qty">' + qty + "</div>" : "") +
          (total ? '<div class="qc-line-total">' + esc(total) + "</div>" : "") +
          statusPill(l.status) +
        "</div>" +
      "</div>";

    var resolver = "";
    if (weak) {
      var chips = l.candidates.length
        ? '<div class="qc-cands">' + l.candidates.map(function (c) { return candChip(id, l.ref, c); }).join("") + "</div>"
        : '<div class="qc-empty-mini">' + esc(tt("dash.noCands")) + "</div>";
      resolver =
        '<div class="qc-resolve">' +
          '<div class="qc-resolve-lead">' + esc(tt("dash.resolveLead")) + "</div>" +
          chips +
          '<div class="qc-search-cat">' +
            '<input type="text" class="qc-catsearch" data-ref="' + esc(l.ref) + '" placeholder="' + esc(tt("dash.catSearchPh")) + '">' +
            '<div class="qc-catresults" data-ref="' + esc(l.ref) + '"></div>' +
          "</div>" +
          '<div class="qc-line-actions">' +
            '<button type="button" class="qc-mini-btn" data-clarify="' + esc(id) + '" data-ref="' + esc(l.ref) + '">' + esc(tt("dash.askSpec")) + "</button>" +
          "</div>" +
        "</div>";
    }
    return '<div class="qc-line' + (weak ? " weak" : "") + '" data-line="' + esc(l.ref) + '">' + head + resolver + "</div>";
  }
  function linesPanel(q, id) {
    var lines = linesOf(q);
    var weakN = lines.map(normLine).filter(lineWeak).length;
    var inner;
    if (!lines.length) {
      inner = '<div class="qc-empty-mini">' + esc(tt("dash.noLineDetail")) + "</div>";
    } else {
      inner = '<div class="qc-lines-list">' + lines.map(function (raw) { return lineCard(q, id, raw); }).join("") + "</div>";
    }
    var lineCnt = lines.length === 1 ? tt("dash.line1") : tt("dash.lineN", { n: lines.length });
    var sub = lines.length ? (lineCnt + (weakN ? "  ·  " + tt("dash.toResolve", { n: weakN }) : "  ·  " + tt("dash.allPriced"))) : "";
    return section(tt("dash.lineItems"), sub, inner);
  }

  // ── draft + actions ──────────────────────────────────────────────────────────
  function draftPanel(q, id) {
    var txt = draftText(q);
    var body =
      '<textarea class="qc-draft" id="draftBox" spellcheck="true" aria-label="' + esc(tt("dash.draftReply")) + '" lang="en">' + esc(txt) + "</textarea>" +
      '<div class="qc-draft-actions">' +
        '<button type="button" class="btn btn-primary qc-send" data-send="' + esc(id) + '">' +
          '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>' +
          esc(tt("dash.approveSend")) + "</button>" +
        '<button type="button" class="btn btn-ghost qc-reply" data-reply="' + esc(id) + '">' + esc(tt("dash.sendEdited")) + "</button>" +
        '<div class="qc-label-inline">' +
          '<input type="text" class="qc-label-input" id="labelInput" placeholder="' + esc(tt("dash.labelPh")) + '" maxlength="60">' +
          '<button type="button" class="btn btn-ghost btn-sm qc-relabel" data-relabel="' + esc(id) + '" data-action="add">' + esc(tt("dash.add")) + "</button>" +
          '<button type="button" class="btn btn-ghost btn-sm qc-relabel" data-relabel="' + esc(id) + '" data-action="remove">' + esc(tt("dash.remove")) + "</button>" +
        "</div>" +
      "</div>" +
      '<p class="qc-gate-note">' + esc(tt("dash.gateNote")) + "</p>";
    return section(tt("dash.draftReply"), isDraft(q) ? tt("dash.pendingSend") : tt("dash.sentLc"), body);
  }

  // ── draft briefing panel ("What does this draft say?") ───────────────────────
  /* The draft email is written in the CUSTOMER's language, so the operator often
     cannot evaluate it before sending. This panel does NOT translate the draft
     prose, and makes no network call: the site CSP is `script-src 'self'` with a
     locked `connect-src`, so a translation/LLM API is both blocked and
     unnecessary. Instead it RE-RENDERS the agent's STRUCTURED `output` (the Quote
     Schema) in the CONSOLE's language, and derives — from the data alone — why
     each line could not be priced. Every label, heading, status and derived
     sentence goes through tt(); a live `qw:langchange` re-runs renderDrawer().

     Agent-authored free text (`note`, `info_needed[]`, `review_items[]`) is in the
     CUSTOMER's language. It is rendered VERBATIM as quoted source material under a
     localised label — never machine-translated, always escaped. */
  var briefOpen = true;   // panel expanded state, kept across drawer re-renders

  // Aliases → ISO code; the NAME itself is localised via tt("lang." + code).
  var LANG_CODES = {
    en: "en", tr: "tr", es: "es", de: "de", fr: "fr", bg: "bg", it: "it", ru: "ru",
    pt: "pt", nl: "nl", ar: "ar", pl: "pl", ro: "ro", el: "el", zh: "zh",
    english: "en", turkish: "tr", "türkçe": "tr", turkce: "tr",
    spanish: "es", "español": "es", espanol: "es",
    german: "de", deutsch: "de", french: "fr", "français": "fr", francais: "fr",
    bulgarian: "bg", italian: "it", italiano: "it", russian: "ru",
    portuguese: "pt", "português": "pt", dutch: "nl", nederlands: "nl",
    arabic: "ar", polish: "pl", romanian: "ro", greek: "el", chinese: "zh"
  };
  // 'es' / 'es-DO' / 'Spanish' / 'Español' → "Spanish" or "İspanyolca" per console
  // language. An unrecognised value is shown verbatim, exactly as before.
  function langName(v) {
    var k = String(v == null ? "" : v).trim().toLowerCase();
    if (!k) return "";
    var code = LANG_CODES[k] || LANG_CODES[k.split(/[-_]/)[0]];
    return code ? tt("lang." + code) : String(v).trim();
  }
  function briefStatusLabel(s) {
    return s === "priced" ? tt("dash.brief.stPriced")
      : s === "pending_info" ? tt("dash.brief.stInfo")
      : s === "pending_hassan" ? tt("dash.brief.stHassan")
      : tt("dash.brief.stUnknown");
  }
  function briefStatusClass(s) {
    return s === "priced" ? "sent" : s === "pending_hassan" ? "info" : "pending";
  }
  // Agent-authored text, quoted verbatim under a localised label (never translated).
  function agentNote(text) {
    return '<span class="qc-brief-agent"><span class="qc-brief-agentlbl">' + esc(tt("dash.brief.agentNote")) + "</span>" +
      '<q class="qc-brief-quote">' + nl2br(String(text)) + "</q></span>";
  }
  // Every reason below is DERIVED from the structured data, never from the prose.
  function briefLineReasons(l, rawStatus) {
    var out = [];
    var note = (l.raw && l.raw.note != null) ? String(l.raw.note).trim() : "";
    if (l.qty == null || l.qty === 0) out.push(esc(tt("dash.brief.rNoQty")));
    if (rawStatus === "pending_hassan") out.push(esc(tt("dash.brief.rNoPrice")));
    if (rawStatus === "pending_info") {
      out.push(note ? esc(tt("dash.brief.rMissing")) + agentNote(note)
                    : esc(tt("dash.brief.rMissingBare")));
    }
    if (!out.length) {
      out.push(note ? esc(tt("dash.brief.rGeneric")) + agentNote(note)
                    : esc(tt("dash.brief.rGenericBare")));
    }
    return out;
  }
  function briefRow(label, value) {
    return '<div class="qc-brief-row"><dt>' + esc(label) + "</dt>" +
      '<dd lang="en">' + esc(value) + "</dd></div>";
  }
  function briefCleanList(v) {
    return Array.isArray(v)
      ? v.filter(function (x) { return x != null && String(x).trim() !== ""; })
      : [];
  }
  function briefNoteList(items) {
    return '<ul class="qc-brief-info">' + items.map(function (x) {
      return "<li>" + agentNote(String(x).trim()) + "</li>";
    }).join("") + "</ul>";
  }

  function briefPanel(q) {
    var o = parseOutput(q);   // tolerates a JSON-string `output`; null when absent/unparseable
    var lines = linesOf(q).map(function (raw) {
      var l = normLine(raw);
      // normLine() re-labels a priced pending_info line as "provisional" for the
      // line panel; the briefing must state the RAW schema status instead.
      l.briefStatus = String((raw && raw.status) || "").toLowerCase();
      return l;
    });

    var head =
      '<div class="qc-brief-head">' +
        '<button type="button" class="qc-brief-toggle" data-brief="1" aria-expanded="' +
          (briefOpen ? "true" : "false") + '" aria-controls="briefBody">' +
          '<svg class="qc-brief-chev" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>' +
          "<span>" + esc(tt("dash.brief.head")) + "</span>" +
        "</button>" +
        '<span class="qc-brief-tag">' + esc(tt("dash.brief.tag")) + "</span>" +
      "</div>";
    var openBody = '<div class="qc-brief-body" id="briefBody"' + (briefOpen ? "" : " hidden") + ">";

    if (!o) {
      return '<section class="qc-dsec qc-brief">' + head + openBody +
        '<div class="qc-empty-mini">' + esc(tt("dash.brief.noOutput")) + "</div>" +
        "</div></section>";
    }

    var cur = o.currency || q.currency || "";
    var gt = numOrNull(o.grand_total);
    var gtv = numOrNull(o.grand_total_vadeli);
    var lname = langName(o.language);

    // 1 ── summary
    var sum = [];
    sum.push(briefRow(tt("dash.customer"), o.customer || q.customer || "—"));
    sum.push('<div class="qc-brief-row"><dt>' + esc(tt("dash.brief.replyLang")) + "</dt><dd>" +
      esc(lname ? tt("dash.brief.replyLangVal", { lang: lname }) : tt("dash.brief.replyLangUnknown")) + "</dd></div>");
    sum.push(briefRow(tt("dash.brief.currency"), cur || tt("dash.brief.unset")));
    sum.push(briefRow(tt("dash.brief.incoterm"), o.incoterm || tt("dash.brief.unset")));
    if (gt != null && gt > 0) {
      sum.push(briefRow(tt("dash.brief.totalCash"), money(gt, cur)));
      if (gtv != null && gtv > 0) sum.push(briefRow(tt("dash.brief.totalTerm"), money(gtv, cur)));
    } else {
      sum.push('<div class="qc-brief-row"><dt>' + esc(tt("dash.brief.total")) + "</dt>" +
        '<dd class="qc-brief-warn">' + esc(tt("dash.brief.noTotal")) + "</dd></div>");
    }
    var secSum = '<h4 class="qc-brief-h">' + esc(tt("dash.brief.hSummary")) + "</h4>" +
      '<dl class="qc-brief-dl">' + sum.join("") + "</dl>";

    // 2 ── lines
    var secLines = '<h4 class="qc-brief-h">' + esc(tt("dash.brief.hLines")) + "</h4>";
    if (!lines.length) {
      secLines += '<div class="qc-empty-mini">' + esc(tt("dash.brief.noLines")) + "</div>";
    } else {
      secLines += '<div class="qc-brief-lines">' + lines.map(function (l) {
        var qty = (l.qty != null && l.qty !== 0)
          ? l.qty.toLocaleString("en-US") + (l.qty_unit ? " " + l.qty_unit : "")
          : tt("dash.brief.noQty");
        var unit = (l.unit_cash != null && String(l.unit_cash).trim() !== "")
          ? String(l.unit_cash) : tt("dash.brief.noUnit");
        var total = l.total_cash != null ? money(l.total_cash, cur) : tt("dash.brief.noLineTotal");
        return '<div class="qc-brief-line">' +
          '<div class="qc-brief-line-top">' +
            '<span class="qc-brief-line-name" lang="en">' + esc(l.name) + "</span>" +
            '<span class="pill ' + briefStatusClass(l.briefStatus) + '">' + esc(briefStatusLabel(l.briefStatus)) + "</span>" +
          "</div>" +
          '<div class="qc-brief-line-meta">' +
            "<span>" + esc(tt("dash.brief.qty")) + ': <b lang="en">' + esc(qty) + "</b></span>" +
            "<span>" + esc(tt("dash.brief.unitPrice")) + ': <b lang="en">' + esc(unit) + "</b></span>" +
            "<span>" + esc(tt("dash.brief.lineTotal")) + ': <b lang="en">' + esc(total) + "</b></span>" +
          "</div></div>";
      }).join("") + "</div>";
    }

    // 3 ── why it could not be priced
    var unpriced = lines.filter(function (l) { return l.briefStatus !== "priced"; });
    var info = briefCleanList(o.info_needed);
    var unmatched = briefCleanList(o.unmatched_lines);
    var secWhy = '<h4 class="qc-brief-h">' + esc(tt("dash.brief.hWhy")) + "</h4>";
    if (!unpriced.length && !info.length && !unmatched.length) {
      secWhy += lines.length
        ? '<div class="qc-brief-ok">' + esc(tt("dash.brief.allPriced")) + "</div>"
        : '<div class="qc-empty-mini">' + esc(tt("dash.brief.whyNoLines")) + "</div>";
    } else {
      if (unpriced.length) {
        secWhy += '<ul class="qc-brief-why">' + unpriced.map(function (l) {
          return "<li>" + '<span class="qc-brief-why-name" lang="en">' + esc(l.name) + "</span>" +
            briefLineReasons(l, l.briefStatus).map(function (r) {
              return '<span class="qc-brief-why-reason">' + r + "</span>";
            }).join("") + "</li>";
        }).join("") + "</ul>";
      }
      if (info.length) {
        secWhy += '<div class="qc-brief-sub">' + esc(tt("dash.brief.subInfo")) + "</div>" + briefNoteList(info);
      }
      if (unmatched.length) {
        secWhy += '<div class="qc-brief-sub">' + esc(tt("dash.brief.subUnmatched")) + "</div>" + briefNoteList(unmatched);
      }
    }

    // 4 ── internal note (never sent to the customer)
    var secInternal = "";
    if (o.needs_review === true) {
      var review = briefCleanList(o.review_items);
      secInternal =
        '<div class="qc-brief-internal">' +
          '<div class="qc-brief-internal-head">' + esc(tt("dash.brief.intHead")) + "</div>" +
          '<p class="qc-brief-internal-lead">' + esc(tt("dash.brief.intLead")) + "</p>" +
          (review.length ? briefNoteList(review)
                         : '<p class="qc-brief-internal-lead">' + esc(tt("dash.brief.intNone")) + "</p>") +
        "</div>";
    }

    return '<section class="qc-dsec qc-brief">' + head + openBody +
      secSum + secLines + secWhy + secInternal +
    "</div></section>";
  }

  function section(title, sub, inner) {
    return '<section class="qc-dsec">' +
      '<div class="qc-dsec-head"><h3>' + esc(title) + "</h3>" + (sub ? '<span class="qc-dsec-sub">' + esc(sub) + "</span>" : "") + "</div>" +
      inner + "</section>";
  }

  // ── drawer event handling ────────────────────────────────────────────────────
  function onDrawerClick(e) {
    var t = e.target;
    var closeBtn = t.closest ? t.closest(".qc-drawer-close") : null;
    if (closeBtn) { closeDrawer(); return; }
    var brBtn = t.closest ? t.closest("button[data-brief]") : null;
    if (brBtn) { toggleBrief(brBtn); return; }
    var cand = t.closest ? t.closest("button[data-resolve]") : null;
    if (cand) { resolveLine(cand.getAttribute("data-resolve"), cand.getAttribute("data-ref"), cand.getAttribute("data-sku"), cand); return; }
    var use = t.closest ? t.closest("button[data-usesku]") : null;
    if (use) { resolveLine(use.getAttribute("data-usesku"), use.getAttribute("data-ref"), use.getAttribute("data-sku"), use); return; }
    var send = t.closest ? t.closest("button[data-send]") : null;
    if (send) { doSend(send.getAttribute("data-send"), send); return; }
    var rep = t.closest ? t.closest("button[data-reply]") : null;
    if (rep) { doReply(rep.getAttribute("data-reply"), rep); return; }
    var clar = t.closest ? t.closest("button[data-clarify]") : null;
    if (clar) { doClarify(clar.getAttribute("data-clarify"), clar.getAttribute("data-ref"), clar); return; }
    var rel = t.closest ? t.closest("button[data-relabel]") : null;
    if (rel) { doRelabel(rel.getAttribute("data-relabel"), rel.getAttribute("data-action"), rel); return; }
  }
  // Briefing panel — collapse/expand in place (no re-render, no data churn)
  function toggleBrief(btn) {
    briefOpen = btn.getAttribute("aria-expanded") !== "true";
    btn.setAttribute("aria-expanded", briefOpen ? "true" : "false");
    var body = el("drawerInner").querySelector(".qc-brief-body");
    if (body) body.hidden = !briefOpen;
  }

  var catTimer = null;
  function onDrawerInput(e) {
    var inp = e.target;
    if (inp && inp.classList && inp.classList.contains("qc-catsearch")) {
      var ref = inp.getAttribute("data-ref");
      var val = inp.value.trim();
      if (catTimer) clearTimeout(catTimer);
      catTimer = setTimeout(function () { catalogSearch(ref, val); }, 260);
    }
  }
  function catResultsEl(ref) {
    var list = el("drawerInner").querySelectorAll('.qc-catresults');
    for (var i = 0; i < list.length; i++) if (list[i].getAttribute("data-ref") === String(ref)) return list[i];
    return null;
  }
  function catalogSearch(ref, term) {
    var host = catResultsEl(ref);
    if (!host) return;
    if (!term) { host.innerHTML = ""; return; }
    host.innerHTML = '<div class="qc-cat-loading">' + esc(tt("dash.searching")) + "</div>";
    var like = "%" + term.replace(/[%,]/g, " ") + "%";
    var digits = term.replace(/[^0-9]/g, "");
    var orExpr = "urun_adi.ilike." + like + ",sku.ilike." + like + ",color.ilike." + like + ",product_line.ilike." + like;
    if (digits) orExpr += ",gsm.eq." + digits;
    sb.from("products")
      .select("sku,urun_adi,gsm,color,product_line,satis_eur,satis_usd,is_microfiber")
      .or(orExpr).limit(8)
      .then(function (res) {
        if (openId == null) return;
        if (res.error) { host.innerHTML = '<div class="qc-empty-mini">' + esc(tt("dash.catFail", { msg: res.error.message })) + "</div>"; return; }
        var rows = res.data || [];
        if (!rows.length) { host.innerHTML = '<div class="qc-empty-mini">' + esc(tt("dash.catNoMatch", { term: term })) + "</div>"; return; }
        host.innerHTML = rows.map(function (p) {
          var mf = String(p.is_microfiber) === "true";
          var price = mf ? (p.satis_usd != null ? money(p.satis_usd, "USD") + "/m²" : "") : (p.satis_eur != null ? money(p.satis_eur, "EUR") + "/m²" : "");
          var specs = [p.gsm ? p.gsm + " gsm" : "", p.color, p.product_line].filter(Boolean).join(" · ");
          return '<div class="qc-catrow">' +
            '<div class="qc-catrow-main"><span class="qc-catrow-name" lang="en">' + esc(p.urun_adi || p.sku) + "</span>" +
              (specs ? '<span class="qc-catrow-specs" lang="en">' + esc(specs) + "</span>" : "") +
              '<span class="qc-sku-tag" lang="en">' + esc(p.sku) + "</span></div>" +
            '<div class="qc-catrow-right">' + (price ? '<span class="qc-catrow-price" lang="en">' + esc(price) + "</span>" : "") +
              '<button type="button" class="qc-mini-btn primary" data-usesku="' + esc(openId) + '" data-ref="' + esc(ref) + '" data-sku="' + esc(p.sku) + '">' + esc(tt("dash.use")) + "</button></div>" +
          "</div>";
        }).join("");
      }, function () {
        if (host) host.innerHTML = '<div class="qc-empty-mini">' + esc(tt("dash.catFailNet")) + "</div>";
      });
  }

  function resolveLine(id, ref, sku, btn) {
    if (!id || !sku) return;
    var card = btn.closest ? btn.closest(".qc-line") : null;
    if (card) card.classList.add("is-resolving");
    if (btn) { btn.classList.add("is-busy"); btn.disabled = true; }
    api("qw/resolve-line", { quote_id: id, line_ref: ref, chosen_sku: sku }).then(function (r) {
      var q = findQuote(id);
      if (q) {
        if (r.output) q.output = r.output;
        if (r.total != null) q.total = r.total;
        if (r.draft_id) q.gmail_draft_id = r.draft_id;
      }
      render();
      if (openId === String(id)) renderDrawer();
      toast(tt("dash.lineResolved"));
    }).catch(function (err) {
      if (card) card.classList.remove("is-resolving");
      if (btn) { btn.classList.remove("is-busy"); btn.disabled = false; }
      handleApiError(err);
    });
  }

  function doSend(id, btn) {
    var q = findQuote(id);
    if (!q) return;
    confirmDialog(tt("dash.sendQTitle"),
      tt("dash.sendQBody", { c: esc(q.customer || tt("dash.theCustomer")) }),
      tt("dash.sendNow")).then(function (ok) {
      if (!ok) return;
      btn.disabled = true; btn.classList.add("is-busy");
      api("qw/send-quote", { quote_id: id }).then(function (r) {
        patchLocal(id, { status: (r && r.status) || "sent", sent_at: new Date().toISOString(), sent_by: currentEmail || "console" });
        render();
        if (openId === String(id)) renderDrawer();
        toast(tt("dash.quoteSentTo", { c: q.customer || tt("dash.customer") }));
      }).catch(function (err) {
        btn.disabled = false; btn.classList.remove("is-busy");
        handleApiError(err);
      });
    });
  }
  function doReply(id, btn) {
    var box = el("draftBox");
    var body = box ? box.value.trim() : "";
    if (!body) { toast(tt("dash.writeReplyFirst"), true); if (box) box.focus(); return; }
    var q = findQuote(id);
    confirmDialog(tt("dash.sendEditedTitle"),
      tt("dash.sendEditedBody", { c: esc((q && q.customer) || tt("dash.theCustomer")) }),
      tt("dash.sendReply")).then(function (ok) {
      if (!ok) return;
      btn.disabled = true; btn.classList.add("is-busy");
      api("qw/reply", { quote_id: id, body: body }).then(function () {
        patchLocal(id, { status: "sent", sent_at: new Date().toISOString(), sent_by: currentEmail || "console" });
        render();
        if (openId === String(id)) renderDrawer();
        toast(tt("dash.replySent"));
      }).catch(function (err) {
        btn.disabled = false; btn.classList.remove("is-busy");
        handleApiError(err);
      });
    });
  }
  function doClarify(id, ref, btn) {
    btn.disabled = true; btn.classList.add("is-busy");
    api("qw/clarify", { quote_id: id, line_ref: ref }).then(function () {
      btn.disabled = false; btn.classList.remove("is-busy");
      toast(tt("dash.clarifySent"));
    }).catch(function (err) {
      btn.disabled = false; btn.classList.remove("is-busy");
      handleApiError(err);
    });
  }
  function doRelabel(id, action, btn) {
    var inp = el("labelInput");
    var label = inp ? inp.value.trim() : "";
    if (!label) { toast(tt("dash.typeLabelFirst"), true); if (inp) inp.focus(); return; }
    btn.disabled = true; btn.classList.add("is-busy");
    api("qw/relabel", { quote_id: id, label: label, action: action }).then(function () {
      btn.disabled = false; btn.classList.remove("is-busy");
      toast(action === "remove" ? tt("dash.labelRemoved", { l: label }) : tt("dash.labelApplied", { l: label }));
    }).catch(function (err) {
      btn.disabled = false; btn.classList.remove("is-busy");
      handleApiError(err);
    });
  }

  // ── bulk actions ─────────────────────────────────────────────────────────────
  function bulkSend() {
    var drafts = selectedQuotes().filter(isDraft);
    if (!drafts.length) { toast(tt("dash.noDraftsSel"), true); return; }
    confirmDialog(drafts.length === 1 ? tt("dash.bulkSendTitle1") : tt("dash.bulkSendTitleN", { n: drafts.length }),
      drafts.length === 1 ? tt("dash.bulkSendBody1") : tt("dash.bulkSendBodyN", { n: drafts.length }),
      tt("dash.sendAll"), true).then(function (ok) {
      if (!ok) return;
      var btn = el("bulkSend");
      if (btn) { btn.disabled = true; btn.textContent = tt("dash.sending"); }
      var done = 0, failed = 0;
      var next = function (i) {
        if (i >= drafts.length) {
          render(); renderBulk();
          toast(tt("dash.sentN", { n: done }) + (failed ? tt("dash.failedN", { n: failed }) : "") + ".", failed > 0);
          return;
        }
        var qid = String(drafts[i].id);
        api("qw/send-quote", { quote_id: qid }).then(function (r) {
          done++; patchLocal(qid, { status: (r && r.status) || "sent", sent_at: new Date().toISOString(), sent_by: currentEmail || "console" });
          delete selected[qid];
          next(i + 1);
        }).catch(function () { failed++; next(i + 1); });
      };
      next(0);
    });
  }
  function bulkLabel() {
    var inp = el("bulkLabelInput");
    var label = inp ? inp.value.trim() : "";
    if (!label) { toast(tt("dash.typeLabelName"), true); if (inp) inp.focus(); return; }
    var list = selectedQuotes();
    confirmDialog(list.length === 1 ? tt("dash.bulkLabelTitle1") : tt("dash.bulkLabelTitleN", { n: list.length }),
      list.length === 1 ? tt("dash.bulkLabelBody1", { l: esc(label) }) : tt("dash.bulkLabelBodyN", { l: esc(label), n: list.length }),
      tt("dash.applyLabel")).then(function (ok) {
      if (!ok) return;
      var btn = el("bulkLabel");
      if (btn) { btn.disabled = true; btn.textContent = tt("dash.applying"); }
      var done = 0, failed = 0;
      var next = function (i) {
        if (i >= list.length) { renderBulk(); toast(tt("dash.labelledN", { n: done }) + (failed ? tt("dash.failedN", { n: failed }) : "") + ".", failed > 0); return; }
        api("qw/relabel", { quote_id: String(list[i].id), label: label, action: "add" })
          .then(function () { done++; next(i + 1); })
          .catch(function () { failed++; next(i + 1); });
      };
      next(0);
    });
  }

  // ── toast ────────────────────────────────────────────────────────────────────
  var toastTimer = null;
  function toast(msg, bad) {
    var t = el("toast");
    if (!t) return;
    t.textContent = msg;
    t.className = "qc-toast show" + (bad ? " bad" : "");
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.className = "qc-toast" + (bad ? " bad" : ""); }, 3000);
  }

  // ── load ─────────────────────────────────────────────────────────────────────
  function loadQuotes() {
    if (loading) return;
    hideTableError();
    // DEMO MODE (tour / demo): render sample data, never touch Supabase.
    if (window.QWDemo && QWDemo.isOn()) {
      quotes = QWDemo.quotes();
      hasLoaded = true; digest = null;
      setRefreshing(false);
      Object.keys(selected).forEach(function (id) { if (!findQuote(id)) delete selected[id]; });
      render(); if (openId != null) renderDrawer();
      return;
    }
    if (!hasLoaded) renderSkeleton(); else el("rowCount").textContent = tt("common.loading");
    setRefreshing(true);
    var query = sb.from("quotes").select("*").order("created_at", { ascending: false }).limit(1000);
    // Members scope to their own tenant; admins see every tenant (RLS permits it).
    if (resolvedOwner && !isAdminUser) query = query.eq("owner", resolvedOwner);
    query.then(function (res) {
      setRefreshing(false);
      if (res.error) { showTableError(res.error.message); return; }
      quotes = res.data || [];
      hasLoaded = true;
      // prune selections / open drawer that no longer exist
      Object.keys(selected).forEach(function (id) { if (!findQuote(id)) delete selected[id]; });
      loadDigest().then(function () { render(); if (openId != null) renderDrawer(); });
    }, function (err) {
      setRefreshing(false);
      showTableError((err && err.message) || tt("dash.netErrConn"));
    });
  }
  // digest table is optional — degrade to client-side metrics if it's absent.
  function loadDigest() {
    if (window.QWDemo && QWDemo.isOn()) { digest = null; return Promise.resolve(); }
    var q = sb.from("digest").select("*").order("generated_at", { ascending: false }).limit(1);
    if (resolvedOwner && !isAdminUser) q = q.eq("owner", resolvedOwner);
    return q.then(function (res) {
      digest = (!res.error && res.data && res.data.length) ? res.data[0] : null;
    }, function () { digest = null; });
  }

  // ── live language switch — re-render JS-built views from cached data (no refetch) ──
  window.addEventListener("qw:langchange", function () {
    try { applyAuthText(); setSubmitLabel(); } catch (e) {}
    try { if (loading) setRefreshing(true); } catch (e) {}
    try {
      if (el("dashView") && !el("dashView").hidden && hasLoaded) {
        render();
        if (openId != null) renderDrawer();
      }
    } catch (e) {}
  });
})();
