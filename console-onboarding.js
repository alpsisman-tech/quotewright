/* Quotewright console — first-run onboarding wizard.
   Self-contained overlay. Any console page includes this after its own auth script
   and calls window.QWOnboarding.check(sb, owner) once the user is signed in.

   Behaviour:
     • reads the single autonomy_settings row;
     • FAIL-SAFE: if the row / onboarded column can't be read, or onboarded is anything
       other than the literal boolean false, it does NOTHING (never traps the user);
     • only when onboarded === false does it show a can't-skip 3-step wizard
       (Profile → Quoting basics → Automation) that saves everything via an
       authenticated UPDATE and sets onboarded=true.
   No inline scripts / styles (site CSP is script-src 'self'). */
(function () {
  "use strict";
  var ran = false;

  // ── i18n dictionary for the onboarding wizard ─────────────────────────────
  if (window.QWI18n && QWI18n.add) QWI18n.add({
    en: {
      "ob.brand.sub": "",
      "ob.lang.kicker": "Language",
      "ob.lang.title": "Choose your language",
      "ob.lang.sub": "Which language should this console be in? You can change it any time in Settings — this is separate from the language your quotes are written in.",
      "ob.welcome.kicker": "Welcome",
      "ob.welcome.title": "Let’s set up your console",
      "ob.welcome.sub": "A few details so quotes go out under your name. Takes under a minute — you can change any of this later in Settings.",
      "ob.f.name": "Your name", "ob.f.company": "Company", "ob.f.role": "Role",
      "ob.f.phone": "Phone", "ob.f.country": "Country",
      "ob.ph.role": "Export Sales Manager",
      "ob.q.kicker": "Quoting basics",
      "ob.q.title": "How your quotes read",
      "ob.q.sub": "The voice and default terms every quote carries. The pipeline still replies in the customer’s own language when you leave language on auto.",
      "ob.q.replyLang": "Reply language",
      "ob.q.replyAuto": "Auto — match the customer",
      "ob.q.incoterm": "Default incoterm",
      "ob.q.validity": "Quote validity (days)",
      "ob.q.marginFloor": "Thin-margin floor",
      "ob.q.signature": "Sign-off / signature",
      "ob.q.sigHint": "Closes every quote email. Leave blank for the standard sign-off.",
      "ob.a.kicker": "Automation",
      "ob.a.title": "How much runs on its own",
      "ob.a.sub": "Start conservative — nothing sends to a customer unless you switch it on here. You can loosen this any time once you trust the drafts.",
      "ob.a.autoResolve": "Auto-fill repeat lines",
      "ob.a.autoResolveDesc": "Reuse your team’s earlier decision when a line is an exact repeat. Off = every first-time match waits for a human.",
      "ob.a.autoSend": "Send green-tier quotes automatically",
      "ob.a.autoSendDesc": "The one money-facing switch. On = quotes that clear both green gates send themselves; amber and red always wait. Off = the pipeline only drafts.",
      "ob.a.greenConf": "Green · minimum confidence",
      "ob.a.greenMargin": "Green · minimum margin",
      "ob.a.amberConf": "Amber · minimum confidence",
      "ob.a.followup": "Chase quotes that go quiet",
      "ob.a.followupDesc": "A gentle nudge if the customer goes silent.",
      "ob.a.waitNudge": "Wait before nudging", "ob.a.maxNudges": "Maximum nudges",
      "ob.unit.days": "days", "ob.unit.total": "total",
      "ob.a.specMissing": "When a spec is missing",
      "ob.a.clarifyDraftT": "Draft it for me", "ob.a.clarifyDraftD": "Waits for your OK",
      "ob.a.clarifySendT": "Send straight away", "ob.a.clarifySendD": "Goes to the customer",
      "ob.back": "Back", "ob.continue": "Continue", "ob.finish": "Finish setup",
      "ob.continueAnyway": "Continue anyway",
      "ob.count": "Step {n} of {total}",
      "ob.warn": "Couldn’t save your setup ({msg}). You can continue and set this up in Settings.",
      "ob.warnDefault": "run quotewright-settings.sql, then reload",
      "ob.done": "You’re all set. Welcome to Quotewright."
    },
    tr: {
      "ob.brand.sub": "",
      "ob.lang.kicker": "Dil",
      "ob.lang.title": "Dilinizi seçin",
      "ob.lang.sub": "Bu konsol hangi dilde olsun? Bunu istediğiniz zaman Ayarlar’dan değiştirebilirsiniz — bu, tekliflerinizin yazıldığı dilden ayrıdır.",
      "ob.welcome.kicker": "Hoş geldiniz",
      "ob.welcome.title": "Konsolunuzu kuralım",
      "ob.welcome.sub": "Tekliflerin sizin adınıza çıkması için birkaç bilgi. Bir dakikadan az sürer — bunların hepsini sonradan Ayarlar’dan değiştirebilirsiniz.",
      "ob.f.name": "Adınız", "ob.f.company": "Şirket", "ob.f.role": "Görev",
      "ob.f.phone": "Telefon", "ob.f.country": "Ülke",
      "ob.ph.role": "İhracat Satış Müdürü",
      "ob.q.kicker": "Teklif temelleri",
      "ob.q.title": "Teklifleriniz nasıl okunur",
      "ob.q.sub": "Her teklifin taşıdığı üslup ve varsayılan koşullar. Dili otomatik bıraktığınızda akış yine de müşterinin kendi dilinde yanıt verir.",
      "ob.q.replyLang": "Yanıt dili",
      "ob.q.replyAuto": "Otomatik — müşteriye uy",
      "ob.q.incoterm": "Varsayılan teslim şekli",
      "ob.q.validity": "Teklif geçerliliği (gün)",
      "ob.q.marginFloor": "İnce marj tabanı",
      "ob.q.signature": "İmza / kapanış",
      "ob.q.sigHint": "Her teklif e-postasını kapatır. Standart imza için boş bırakın.",
      "ob.a.kicker": "Otomasyon",
      "ob.a.title": "Ne kadarı kendi başına çalışır",
      "ob.a.sub": "Temkinli başlayın — burada açmadığınız sürece hiçbir şey müşteriye gönderilmez. Taslaklara güvendikçe bunu istediğiniz zaman gevşetebilirsiniz.",
      "ob.a.autoResolve": "Tekrarlayan satırları otomatik doldur",
      "ob.a.autoResolveDesc": "Bir satır birebir tekrar olduğunda ekibinizin önceki kararını yeniden kullan. Kapalı = her ilk eşleşme bir insanı bekler.",
      "ob.a.autoSend": "Yeşil kademe teklifleri otomatik gönder",
      "ob.a.autoSendDesc": "Paraya dokunan tek anahtar. Açık = her iki yeşil eşiği geçen teklifler kendiliğinden gönderilir; sarı ve kırmızı her zaman bekler. Kapalı = akış yalnızca taslak hazırlar.",
      "ob.a.greenConf": "Yeşil · en düşük güven",
      "ob.a.greenMargin": "Yeşil · en düşük kâr marjı",
      "ob.a.amberConf": "Sarı · en düşük güven",
      "ob.a.followup": "Sessizleşen teklifleri takip et",
      "ob.a.followupDesc": "Müşteri sessizleşirse nazik bir dürtme.",
      "ob.a.waitNudge": "Dürtmeden önce bekle", "ob.a.maxNudges": "En fazla dürtme",
      "ob.unit.days": "gün", "ob.unit.total": "toplam",
      "ob.a.specMissing": "Bir özellik eksik olduğunda",
      "ob.a.clarifyDraftT": "Benim için taslak hazırla", "ob.a.clarifyDraftD": "Onayınızı bekler",
      "ob.a.clarifySendT": "Hemen gönder", "ob.a.clarifySendD": "Müşteriye gider",
      "ob.back": "Geri", "ob.continue": "Devam", "ob.finish": "Kurulumu bitir",
      "ob.continueAnyway": "Yine de devam et",
      "ob.count": "{total} adımdan {n}.",
      "ob.warn": "Kurulumunuz kaydedilemedi ({msg}). Devam edip bunu Ayarlar’dan yapabilirsiniz.",
      "ob.warnDefault": "quotewright-settings.sql'i çalıştırıp yeniden yükleyin",
      "ob.done": "Her şey hazır. Quotewright’a hoş geldiniz."
    }
  });
  function tt(key, vars) { return (window.QWI18n && QWI18n.t) ? QWI18n.t(key, vars) : key; }
  function L(key) { return e(tt(key)); }

  var DEFAULTS = {
    display_name: "", company: "", role: "", phone: "", country: "",
    reply_language: "auto", signature: "", quote_validity_days: 7, default_incoterm: "EXW",
    margin_floor: 15, auto_resolve_enabled: false, auto_send_enabled: false,
    green_min_confidence: 90, green_min_margin: 20, amber_min_confidence: 60,
    followup_enabled: true, followup_days: 5, max_followups: 2, clarify_mode: "draft"
  };
  var INT_KEYS = { quote_validity_days: 1, green_min_confidence: 1, amber_min_confidence: 1,
    followup_days: 1, max_followups: 1, margin_floor: 0 };

  function e(s) {
    return (s == null ? "" : String(s)).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  window.QWOnboarding = { check: check };

  // Gate on the SIGNED-IN USER (auth user_metadata.onboarded), not the shared tenant
  // row — so every newly-activated account sees the questionnaire once, even when they
  // join a tenant that another user already configured. The wizard still prefills from
  // (and saves to) the tenant's autonomy_settings row.
  function check(sb, owner, user) {
    if (ran || !sb) return;
    ran = true;
    owner = owner || (window.QW_CONFIG && window.QW_CONFIG.OWNER) || "hassannonwovens";

    function proceed(u) {
      var md = (u && u.user_metadata) || {};
      if (md.onboarded === true) return; // this user already did it → never block
      // Load the tenant settings row for prefill (fail-safe: missing/error → blank).
      sb.from("autonomy_settings").select("*").eq("owner", owner).maybeSingle().then(function (res) {
        var row = (res && !res.error && res.data) ? res.data : {};
        open(sb, owner, row);
      }, function () { open(sb, owner, {}); });
    }

    if (user) proceed(user);
    else sb.auth.getUser().then(function (r) { proceed(r && r.data && r.data.user); },
                              function () { /* network → fail open (don't trap) */ });
  }

  function open(sb, owner, row) {
    var st = {};
    for (var k in DEFAULTS) st[k] = (row && row[k] != null) ? row[k] : DEFAULTS[k];

    var svg = '<svg width="22" height="22" viewBox="0 0 32 32" fill="none" aria-hidden="true"><rect width="32" height="32" rx="7" fill="#111"/><path d="M8 21.5L13 9l3.5 8L20 9l4 12.5" stroke="#D2FF37" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/><path d="M6 25h20" stroke="#D2FF37" stroke-width="2.4" stroke-linecap="round"/></svg>';

    var wrap = document.createElement("div");
    wrap.className = "ob-scrim";
    wrap.setAttribute("role", "dialog");
    wrap.setAttribute("aria-modal", "true");
    wrap.setAttribute("aria-labelledby", "obTitle");
    var curLang = (window.QWI18n && QWI18n.getLang) ? QWI18n.getLang() : "en";
    wrap.innerHTML =
      '<div class="ob-card">' +
        '<div class="ob-head">' +
          '<div class="ob-brand" lang="en">' + svg + '<span>Quotewright</span></div>' +
          '<div class="ob-dots" id="obDots"></div>' +
        '</div>' +
        '<div class="ob-body">' +

          // ── Step 0 · Language ──
          '<div class="ob-step" data-step="0">' +
            '<div class="ob-kicker" data-i18n="ob.lang.kicker">' + L("ob.lang.kicker") + '</div>' +
            '<h2 id="obTitle" class="ob-title" data-i18n="ob.lang.title">' + L("ob.lang.title") + '</h2>' +
            '<p class="ob-sub" data-i18n="ob.lang.sub">' + L("ob.lang.sub") + '</p>' +
            '<div class="ob-langpick" id="ob_langpick" role="radiogroup" aria-label="Language">' +
              '<button type="button" class="ob-langopt' + (curLang === "en" ? " on" : "") + '" data-lang="en" role="radio" aria-checked="' + (curLang === "en") + '" lang="en">' +
                '<span class="ob-langopt-flag" aria-hidden="true">EN</span>' +
                '<span class="ob-langopt-name">English</span>' +
                '<span class="ob-langopt-tick" aria-hidden="true"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg></span>' +
              '</button>' +
              '<button type="button" class="ob-langopt' + (curLang === "tr" ? " on" : "") + '" data-lang="tr" role="radio" aria-checked="' + (curLang === "tr") + '" lang="tr">' +
                '<span class="ob-langopt-flag" aria-hidden="true">TR</span>' +
                '<span class="ob-langopt-name">Türkçe</span>' +
                '<span class="ob-langopt-tick" aria-hidden="true"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg></span>' +
              '</button>' +
            '</div>' +
          '</div>' +

          // ── Step 1 · Profile ──
          '<div class="ob-step" data-step="1" hidden>' +
            '<div class="ob-kicker" data-i18n="ob.welcome.kicker">' + L("ob.welcome.kicker") + '</div>' +
            '<h2 class="ob-title" data-i18n="ob.welcome.title">' + L("ob.welcome.title") + '</h2>' +
            '<p class="ob-sub" data-i18n="ob.welcome.sub">' + L("ob.welcome.sub") + '</p>' +
            '<div class="ob-grid">' +
              fld("ob_display_name", "ob.f.name", '<input id="ob_display_name" type="text" autocomplete="name" placeholder="e.g. Sales Engineering">') +
              fld("ob_company", "ob.f.company", '<input id="ob_company" type="text" autocomplete="organization" placeholder="Hassan Tekstil A.Ş.">') +
              fld("ob_role", "ob.f.role", '<input id="ob_role" type="text" data-i18n-attr="placeholder:ob.ph.role" placeholder="' + L("ob.ph.role") + '">') +
              fld("ob_phone", "ob.f.phone", '<input id="ob_phone" type="tel" autocomplete="tel" placeholder="+90 …">') +
              fld("ob_country", "ob.f.country", '<input id="ob_country" type="text" autocomplete="country-name" placeholder="Türkiye">', "wide") +
            '</div>' +
          '</div>' +

          // ── Step 2 · Quoting basics ──
          '<div class="ob-step" data-step="2" hidden>' +
            '<div class="ob-kicker" data-i18n="ob.q.kicker">' + L("ob.q.kicker") + '</div>' +
            '<h2 class="ob-title" data-i18n="ob.q.title">' + L("ob.q.title") + '</h2>' +
            '<p class="ob-sub" data-i18n="ob.q.sub">' + L("ob.q.sub") + '</p>' +
            '<div class="ob-grid">' +
              fld("ob_reply_language", "ob.q.replyLang",
                '<select id="ob_reply_language" class="ob-select">' +
                  '<option value="auto" data-i18n="ob.q.replyAuto">' + L("ob.q.replyAuto") + '</option>' +
                  '<option value="en" lang="en">English</option><option value="tr" lang="tr">Türkçe</option>' +
                  '<option value="de" lang="de">Deutsch</option><option value="bg" lang="bg">Български</option>' +
                  '<option value="fr" lang="fr">Français</option></select>') +
              fld("ob_default_incoterm", "ob.q.incoterm",
                '<select id="ob_default_incoterm" class="ob-select" lang="en">' +
                  ["EXW","FCA","FOB","CFR","CIF","CPT","CIP","DAP","DPU","DDP"].map(function (t) {
                    return '<option value="' + t + '">' + t + '</option>'; }).join("") + '</select>') +
              fld("ob_quote_validity_days", "ob.q.validity",
                '<input id="ob_quote_validity_days" type="number" min="1" max="365" step="1" inputmode="numeric" placeholder="7">') +
              obRange("ob_margin_floor", "ob.q.marginFloor", "%", "obMfVal", 0, 50) +
              fld("ob_signature", "ob.q.signature",
                '<textarea id="ob_signature" rows="3" placeholder="Best regards,&#10;Sales Engineering&#10;Hassan Tekstil A.Ş."></textarea>' +
                '<p class="ob-hint" data-i18n="ob.q.sigHint">' + L("ob.q.sigHint") + '</p>', "wide") +
            '</div>' +
          '</div>' +

          // ── Step 3 · Automation ──
          '<div class="ob-step" data-step="3" hidden>' +
            '<div class="ob-kicker" data-i18n="ob.a.kicker">' + L("ob.a.kicker") + '</div>' +
            '<h2 class="ob-title" data-i18n="ob.a.title">' + L("ob.a.title") + '</h2>' +
            '<p class="ob-sub" data-i18n="ob.a.sub">' + L("ob.a.sub") + '</p>' +
            obSwitch("ob_auto_resolve", "ob.a.autoResolve", "ob.a.autoResolveDesc") +
            obSwitch("ob_auto_send", "ob.a.autoSend", "ob.a.autoSendDesc") +
            '<div class="ob-thr" id="ob_sendThr">' +
              obRange("ob_green_conf", "ob.a.greenConf", "/100", "obGcVal", 0, 100) +
              obRange("ob_green_margin", "ob.a.greenMargin", "%", "obGmVal", 0, 60) +
              obRange("ob_amber_conf", "ob.a.amberConf", "/100", "obAcVal", 0, 100) +
            '</div>' +
            obSwitch("ob_followup", "ob.a.followup", "ob.a.followupDesc") +
            '<div class="ob-inline" id="ob_fuOpts">' +
              fldSm("ob_followup_days", "ob.a.waitNudge", "ob.unit.days") +
              fldSm("ob_max_followups", "ob.a.maxNudges", "ob.unit.total") +
            '</div>' +
            '<div class="ob-lbl" data-i18n="ob.a.specMissing">' + L("ob.a.specMissing") + '</div>' +
            '<div class="ob-seg" id="ob_clarify" role="radiogroup" aria-label="Clarification handling">' +
              '<button type="button" class="ob-seg-btn" role="radio" data-c="draft" aria-checked="true"><b data-i18n="ob.a.clarifyDraftT">' + L("ob.a.clarifyDraftT") + '</b><span data-i18n="ob.a.clarifyDraftD">' + L("ob.a.clarifyDraftD") + '</span></button>' +
              '<button type="button" class="ob-seg-btn" role="radio" data-c="send" aria-checked="false"><b data-i18n="ob.a.clarifySendT">' + L("ob.a.clarifySendT") + '</b><span data-i18n="ob.a.clarifySendD">' + L("ob.a.clarifySendD") + '</span></button>' +
            '</div>' +
          '</div>' +

        '</div>' +
        '<div class="ob-foot">' +
          '<button type="button" class="btn btn-ghost btn-sm ob-back" id="obBack" data-i18n="ob.back" hidden>' + L("ob.back") + '</button>' +
          '<span class="ob-count" id="obCount"></span>' +
          '<button type="button" class="btn btn-primary ob-next" id="obNext" data-i18n="ob.continue">' + L("ob.continue") + '</button>' +
        '</div>' +
      '</div>';

    document.body.appendChild(wrap);
    document.body.classList.add("ob-lock");
    // Onboarding is now ON SCREEN — hard-gate the guided tour so it can never
    // auto-start over the wizard (console-tour.js checks this flag). Cleared in close().
    window.QWOnboardingActive = true;

    // i18n: give the engine the client (so language persists to user_metadata even on
    // pages without QWConsole, e.g. the dashboard) and translate the freshly-built DOM.
    if (window.QWI18n) { QWI18n.setClient(sb); QWI18n.apply(wrap); }

    var step = 0;
    var v = function (id) { return wrap.querySelector("#" + id); };

    // dots — one per step (built dynamically so adding the Language step Just Works)
    var dots = wrap.querySelector("#obDots");
    var nSteps = wrap.querySelectorAll(".ob-step").length;
    for (var i = 0; i < nSteps; i++) { var d = document.createElement("span"); d.className = "ob-dot"; dots.appendChild(d); }

    // ── Language step: apply the chosen language LIVE so the rest of the wizard
    //    (and the whole console) switches immediately. Persisted via QWI18n.setLang. ──
    var langPick = v("ob_langpick");
    function paintLang() {
      var cur = (window.QWI18n && QWI18n.getLang) ? QWI18n.getLang() : "en";
      Array.prototype.forEach.call(langPick.querySelectorAll("[data-lang]"), function (b) {
        var on = b.getAttribute("data-lang") === cur;
        b.setAttribute("aria-checked", on ? "true" : "false");
        b.classList.toggle("on", on);
      });
    }
    if (langPick) {
      langPick.addEventListener("click", function (ev) {
        var b = ev.target.closest ? ev.target.closest("[data-lang]") : null;
        if (!b || !window.QWI18n) return;
        QWI18n.setLang(b.getAttribute("data-lang"));  // persists + dispatches qw:langchange
      });
      paintLang();
    }
    // Re-translate the wizard + refresh dynamic labels whenever the language changes.
    function onLang() { if (window.QWI18n) QWI18n.apply(wrap); paintLang(); show(step); }
    window.addEventListener("qw:langchange", onLang);

    // ── prefill ──
    setVal("ob_display_name", st.display_name); setVal("ob_company", st.company);
    setVal("ob_role", st.role); setVal("ob_phone", st.phone); setVal("ob_country", st.country);
    setVal("ob_reply_language", st.reply_language); setVal("ob_default_incoterm", st.default_incoterm);
    setVal("ob_quote_validity_days", st.quote_validity_days); setVal("ob_signature", st.signature);
    setVal("ob_followup_days", st.followup_days); setVal("ob_max_followups", st.max_followups);
    setRange("ob_margin_floor", "obMfVal", st.margin_floor);
    setRange("ob_green_conf", "obGcVal", st.green_min_confidence);
    setRange("ob_green_margin", "obGmVal", st.green_min_margin);
    setRange("ob_amber_conf", "obAcVal", st.amber_min_confidence);
    setSwitch("ob_auto_resolve", st.auto_resolve_enabled);
    setSwitch("ob_auto_send", st.auto_send_enabled);
    setSwitch("ob_followup", st.followup_enabled);
    setClarify(st.clarify_mode === "send" ? "send" : "draft");
    syncSendThr(); syncFuOpts();

    function setVal(id, val) { var n = v(id); if (n) n.value = (val == null ? "" : val); }
    function setRange(id, valId, val) { var n = v(id); if (n) { n.value = val; v(valId).textContent = val; } }
    function setSwitch(id, on) {
      var n = v(id); if (!n) return;
      n.setAttribute("aria-checked", on ? "true" : "false");
      n.classList.toggle("on", !!on);
    }
    function getSwitch(id) { return v(id).getAttribute("aria-checked") === "true"; }
    function setClarify(mode) {
      Array.prototype.forEach.call(wrap.querySelectorAll("#ob_clarify [data-c]"), function (b) {
        var on = b.getAttribute("data-c") === mode;
        b.setAttribute("aria-checked", on ? "true" : "false");
        b.classList.toggle("on", on);
      });
    }
    function getClarify() {
      var b = wrap.querySelector('#ob_clarify [aria-checked="true"]');
      return b ? b.getAttribute("data-c") : "draft";
    }
    function syncSendThr() { v("ob_sendThr").classList.toggle("off", !getSwitch("ob_auto_send")); }
    function syncFuOpts() { v("ob_fuOpts").classList.toggle("off", !getSwitch("ob_followup")); }

    // ── wiring: switches ──
    ["ob_auto_resolve", "ob_auto_send", "ob_followup"].forEach(function (id) {
      v(id).addEventListener("click", function () {
        setSwitch(id, !getSwitch(id));
        if (id === "ob_auto_send") syncSendThr();
        if (id === "ob_followup") syncFuOpts();
      });
    });
    // ranges
    [["ob_margin_floor", "obMfVal"], ["ob_green_conf", "obGcVal"], ["ob_green_margin", "obGmVal"], ["ob_amber_conf", "obAcVal"]]
      .forEach(function (p) { v(p[0]).addEventListener("input", function () { v(p[1]).textContent = this.value; }); });
    // clarify segmented
    v("ob_clarify").addEventListener("click", function (ev) {
      var b = ev.target.closest ? ev.target.closest("[data-c]") : null;
      if (b) setClarify(b.getAttribute("data-c"));
    });

    // ── step nav ──
    var steps = wrap.querySelectorAll(".ob-step");
    var back = v("obBack"), next = v("obNext"), count = v("obCount");
    function show(n) {
      step = n;
      for (var i = 0; i < steps.length; i++) steps[i].hidden = (i !== n);
      Array.prototype.forEach.call(dots.children, function (d, i) {
        d.className = "ob-dot" + (i === n ? " on" : i < n ? " done" : "");
      });
      back.hidden = (n === 0);
      next.textContent = (n === steps.length - 1) ? tt("ob.finish") : tt("ob.continue");
      count.textContent = tt("ob.count", { n: n + 1, total: steps.length });
      var first = steps[n].querySelector("input, select, textarea, button");
      if (first) setTimeout(function () { try { first.focus(); } catch (x) {} }, 40);
    }
    back.addEventListener("click", function () { if (step > 0) show(step - 1); });
    next.addEventListener("click", advance);

    function advance() {
      if (step < steps.length - 1) { show(step + 1); return; }
      finish();
    }
    // Enter advances (except inside a textarea, and not on the Back button).
    wrap.addEventListener("keydown", function (ev) {
      if (ev.key !== "Enter") return;
      var tag = (ev.target.tagName || "").toLowerCase();
      if (tag === "textarea") return;
      if (ev.target === back) return;
      ev.preventDefault(); advance();
    });
    // Can't skip: swallow Escape.
    wrap.addEventListener("cancel", function (ev) { ev.preventDefault(); });

    function num(id) { var n = Number(v(id).value); return isNaN(n) ? null : n; }

    function finish() {
      next.disabled = true; back.disabled = true; next.textContent = tt("common.saving");
      var patch = {
        display_name: v("ob_display_name").value.trim(),
        company: v("ob_company").value.trim(),
        role: v("ob_role").value.trim(),
        phone: v("ob_phone").value.trim(),
        country: v("ob_country").value.trim(),
        reply_language: v("ob_reply_language").value,
        default_incoterm: v("ob_default_incoterm").value,
        signature: v("ob_signature").value,
        clarify_mode: getClarify(),
        auto_resolve_enabled: getSwitch("ob_auto_resolve"),
        auto_send_enabled: getSwitch("ob_auto_send"),
        followup_enabled: getSwitch("ob_followup"),
        onboarded: true,
        updated_at: new Date().toISOString()
      };
      setNum(patch, "quote_validity_days", num("ob_quote_validity_days"), DEFAULTS.quote_validity_days);
      setNum(patch, "margin_floor", num("ob_margin_floor"), DEFAULTS.margin_floor);
      setNum(patch, "green_min_confidence", num("ob_green_conf"), DEFAULTS.green_min_confidence);
      setNum(patch, "green_min_margin", num("ob_green_margin"), DEFAULTS.green_min_margin);
      setNum(patch, "amber_min_confidence", num("ob_amber_conf"), DEFAULTS.amber_min_confidence);
      setNum(patch, "followup_days", num("ob_followup_days"), DEFAULTS.followup_days);
      setNum(patch, "max_followups", num("ob_max_followups"), DEFAULTS.max_followups);

      // Mark the SIGNED-IN USER onboarded (auth user_metadata) — the real per-account
      // gate — regardless of whether the tenant-settings save succeeds, so a schema
      // mismatch never traps the user in the wizard on the next login.
      function markUser(cb) {
        if (sb.auth && typeof sb.auth.updateUser === "function") {
          sb.auth.updateUser({ data: { onboarded: true } }).then(function () { cb(); }, function () { cb(); });
        } else { cb(); }
      }
      sb.from("autonomy_settings").update(patch).eq("owner", owner).select().then(function (res) {
        markUser(function () {
          if (res.error || !res.data || !res.data.length) {
            // Tenant settings didn't save (e.g. schema not migrated) — the user is
            // still marked onboarded, so let them into the console.
            fail(res.error && res.error.message);
            return;
          }
          close(true);
        });
      }, function () { markUser(function () { fail("network"); }); });
    }
    function setNum(patch, key, val, dflt) {
      var n = (val == null) ? dflt : val;
      patch[key] = INT_KEYS[key] ? Math.round(n) : n;
    }
    function fail(msg) {
      next.disabled = false; back.disabled = false; next.textContent = tt("ob.finish");
      var f = wrap.querySelector(".ob-foot");
      var warn = wrap.querySelector(".ob-warn");
      if (!warn) { warn = document.createElement("div"); warn.className = "ob-warn"; f.parentNode.insertBefore(warn, f); }
      warn.textContent = tt("ob.warn", { msg: msg || tt("ob.warnDefault") });
      // Give one path out so a schema mismatch never blocks the console.
      next.textContent = tt("ob.continueAnyway");
      next.onclick = function () { close(false); };
    }

    function close(saved) {
      wrap.classList.add("ob-out");
      document.body.classList.remove("ob-lock");
      window.removeEventListener("qw:langchange", onLang);
      // Wizard is gone → release the tour gate BEFORE handing off, so the tour
      // that we launch next is allowed to run.
      window.QWOnboardingActive = false;
      setTimeout(function () { if (wrap.parentNode) wrap.parentNode.removeChild(wrap); }, 260);
      if (saved && window.QWConsole && window.QWConsole.toast) window.QWConsole.toast(tt("ob.done"));
      // The questionnaire is done → the user is now onboarded. NOW (and only now) offer
      // the guided tour (gated on user_metadata.tour_done inside QWTour.maybeAutoStart).
      if (window.QWTour && typeof window.QWTour.maybeAutoStart === "function") {
        setTimeout(function () { window.QWTour.maybeAutoStart(sb); }, 300);
      }
    }

    show(0);
    requestAnimationFrame(function () { wrap.classList.add("ob-in"); });
  }

  // ── field builders (labelKey/descKey are i18n keys; units like %,/100 stay literal) ──
  function fld(id, labelKey, control, mod) {
    return '<div class="ob-field' + (mod ? " ob-" + mod : "") + '"><label for="' + id + '" data-i18n="' + labelKey + '">' + L(labelKey) + '</label>' + control + '</div>';
  }
  function fldSm(id, labelKey, unitKey) {
    return '<div class="ob-field ob-sm"><label for="' + id + '" data-i18n="' + labelKey + '">' + L(labelKey) + '</label>' +
      '<div class="ob-inputwrap"><input id="' + id + '" type="number" min="0" max="60" step="1" inputmode="numeric"><span class="ob-unit" data-i18n="' + unitKey + '">' + L(unitKey) + '</span></div></div>';
  }
  function obRange(id, labelKey, unit, valId, min, max) {
    return '<div class="ob-field ob-wide ob-rangefield"><div class="ob-rangetop"><label for="' + id + '" data-i18n="' + labelKey + '">' + L(labelKey) + '</label>' +
      '<span class="ob-rangeval"><span id="' + valId + '">0</span><span class="ob-u">' + e(unit) + '</span></span></div>' +
      '<input id="' + id + '" type="range" min="' + min + '" max="' + max + '" step="1" class="ob-range"></div>';
  }
  function obSwitch(id, labelKey, descKey) {
    return '<div class="ob-switchrow"><div><div class="ob-sw-label" data-i18n="' + labelKey + '">' + L(labelKey) + '</div>' +
      '<div class="ob-sw-desc" data-i18n="' + descKey + '">' + L(descKey) + '</div></div>' +
      '<button type="button" class="ob-switch" id="' + id + '" role="switch" aria-checked="false" data-i18n-attr="aria-label:' + labelKey + '" aria-label="' + L(labelKey) + '"></button></div>';
  }
})();
