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

  function check(sb, owner) {
    if (ran || !sb) return;
    ran = true;
    owner = owner || "hassannonwovens";
    sb.from("autonomy_settings").select("*").eq("owner", owner).maybeSingle().then(function (res) {
      // Fail-safe: any error, no row, or missing/true onboarded → don't block.
      if (!res || res.error || !res.data) return;
      if (res.data.onboarded !== false) return;
      open(sb, owner, res.data);
    }, function () { /* network error → fail open */ });
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
    wrap.innerHTML =
      '<div class="ob-card">' +
        '<div class="ob-head">' +
          '<div class="ob-brand">' + svg + '<span>Quotewright</span></div>' +
          '<div class="ob-dots" id="obDots"></div>' +
        '</div>' +
        '<div class="ob-body">' +

          // ── Step 1 · Profile ──
          '<div class="ob-step" data-step="0">' +
            '<div class="ob-kicker">Welcome</div>' +
            '<h2 id="obTitle" class="ob-title">Let’s set up your console</h2>' +
            '<p class="ob-sub">A few details so quotes go out under your name. Takes under a minute — you can change any of this later in Settings.</p>' +
            '<div class="ob-grid">' +
              fld("ob_display_name", "Your name", '<input id="ob_display_name" type="text" autocomplete="name" placeholder="e.g. Mehmed Yalçın">') +
              fld("ob_company", "Company", '<input id="ob_company" type="text" autocomplete="organization" placeholder="Hassan Tekstil A.Ş.">') +
              fld("ob_role", "Role", '<input id="ob_role" type="text" placeholder="Export Sales Manager">') +
              fld("ob_phone", "Phone", '<input id="ob_phone" type="tel" autocomplete="tel" placeholder="+90 …">') +
              fld("ob_country", "Country", '<input id="ob_country" type="text" autocomplete="country-name" placeholder="Türkiye">', "wide") +
            '</div>' +
          '</div>' +

          // ── Step 2 · Quoting basics ──
          '<div class="ob-step" data-step="1" hidden>' +
            '<div class="ob-kicker">Quoting basics</div>' +
            '<h2 class="ob-title">How your quotes read</h2>' +
            '<p class="ob-sub">The voice and default terms every quote carries. The pipeline still replies in the customer’s own language when you leave language on auto.</p>' +
            '<div class="ob-grid">' +
              fld("ob_reply_language", "Reply language",
                '<select id="ob_reply_language" class="ob-select">' +
                  '<option value="auto">Auto — match the customer</option>' +
                  '<option value="en">English</option><option value="tr">Türkçe</option>' +
                  '<option value="de">Deutsch</option><option value="bg">Български</option>' +
                  '<option value="fr">Français</option></select>') +
              fld("ob_default_incoterm", "Default incoterm",
                '<select id="ob_default_incoterm" class="ob-select">' +
                  ["EXW","FCA","FOB","CFR","CIF","CPT","CIP","DAP","DPU","DDP"].map(function (t) {
                    return '<option value="' + t + '">' + t + '</option>'; }).join("") + '</select>') +
              fld("ob_quote_validity_days", "Quote validity (days)",
                '<input id="ob_quote_validity_days" type="number" min="1" max="365" step="1" inputmode="numeric" placeholder="7">') +
              obRange("ob_margin_floor", "Thin-margin floor", "%", "obMfVal", 0, 50) +
              fld("ob_signature", "Sign-off / signature",
                '<textarea id="ob_signature" rows="3" placeholder="Best regards,&#10;Mehmed Yalçın · Export Sales&#10;Hassan Tekstil A.Ş."></textarea>' +
                '<p class="ob-hint">Closes every quote email. Leave blank for the standard sign-off.</p>', "wide") +
            '</div>' +
          '</div>' +

          // ── Step 3 · Automation ──
          '<div class="ob-step" data-step="2" hidden>' +
            '<div class="ob-kicker">Automation</div>' +
            '<h2 class="ob-title">How much runs on its own</h2>' +
            '<p class="ob-sub">Start conservative — nothing sends to a customer unless you switch it on here. You can loosen this any time once you trust the drafts.</p>' +
            obSwitch("ob_auto_resolve", "Auto-fill repeat lines",
              "Reuse your team’s earlier decision when a line is an exact repeat. Off = every first-time match waits for a human.") +
            obSwitch("ob_auto_send", "Send green-tier quotes automatically",
              "The one money-facing switch. On = quotes that clear both green gates send themselves; amber and red always wait. Off = the pipeline only drafts.") +
            '<div class="ob-thr" id="ob_sendThr">' +
              obRange("ob_green_conf", "Green · minimum confidence", "/100", "obGcVal", 0, 100) +
              obRange("ob_green_margin", "Green · minimum margin", "%", "obGmVal", 0, 60) +
              obRange("ob_amber_conf", "Amber · minimum confidence", "/100", "obAcVal", 0, 100) +
            '</div>' +
            obSwitch("ob_followup", "Chase quotes that go quiet",
              "A gentle nudge if the customer goes silent.") +
            '<div class="ob-inline" id="ob_fuOpts">' +
              fldSm("ob_followup_days", "Wait before nudging", "days") +
              fldSm("ob_max_followups", "Maximum nudges", "total") +
            '</div>' +
            '<div class="ob-lbl">When a spec is missing</div>' +
            '<div class="ob-seg" id="ob_clarify" role="radiogroup" aria-label="Clarification handling">' +
              '<button type="button" class="ob-seg-btn" role="radio" data-c="draft" aria-checked="true"><b>Draft it for me</b><span>Waits for your OK</span></button>' +
              '<button type="button" class="ob-seg-btn" role="radio" data-c="send" aria-checked="false"><b>Send straight away</b><span>Goes to the customer</span></button>' +
            '</div>' +
          '</div>' +

        '</div>' +
        '<div class="ob-foot">' +
          '<button type="button" class="btn btn-ghost btn-sm ob-back" id="obBack" hidden>Back</button>' +
          '<span class="ob-count" id="obCount">Step 1 of 3</span>' +
          '<button type="button" class="btn btn-primary ob-next" id="obNext">Continue</button>' +
        '</div>' +
      '</div>';

    document.body.appendChild(wrap);
    document.body.classList.add("ob-lock");

    // dots
    var dots = wrap.querySelector("#obDots");
    for (var i = 0; i < 3; i++) { var d = document.createElement("span"); d.className = "ob-dot"; dots.appendChild(d); }

    var step = 0;
    var v = function (id) { return wrap.querySelector("#" + id); };

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
      next.textContent = (n === steps.length - 1) ? "Finish setup" : "Continue";
      count.textContent = "Step " + (n + 1) + " of " + steps.length;
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
      next.disabled = true; back.disabled = true; next.textContent = "Saving…";
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

      sb.from("autonomy_settings").update(patch).eq("owner", owner).select().then(function (res) {
        if (res.error || !res.data || !res.data.length) {
          // Fail-safe: never trap the user. Close and let them into the console.
          fail(res.error && res.error.message);
          return;
        }
        close(true);
      }, function () { fail("network"); });
    }
    function setNum(patch, key, val, dflt) {
      var n = (val == null) ? dflt : val;
      patch[key] = INT_KEYS[key] ? Math.round(n) : n;
    }
    function fail(msg) {
      next.disabled = false; back.disabled = false; next.textContent = "Finish setup";
      var f = wrap.querySelector(".ob-foot");
      var warn = wrap.querySelector(".ob-warn");
      if (!warn) { warn = document.createElement("div"); warn.className = "ob-warn"; f.parentNode.insertBefore(warn, f); }
      warn.textContent = "Couldn’t save your setup (" + (msg || "run quotewright-settings.sql, then reload") + "). You can continue and set this up in Settings.";
      // Give one path out so a schema mismatch never blocks the console.
      next.textContent = "Continue anyway";
      next.onclick = function () { close(false); };
    }

    function close(saved) {
      wrap.classList.add("ob-out");
      document.body.classList.remove("ob-lock");
      setTimeout(function () { if (wrap.parentNode) wrap.parentNode.removeChild(wrap); }, 260);
      if (saved && window.QWConsole && window.QWConsole.toast) window.QWConsole.toast("You’re all set. Welcome to Quotewright.");
    }

    show(0);
    requestAnimationFrame(function () { wrap.classList.add("ob-in"); });
  }

  // ── field builders ──
  function fld(id, label, control, mod) {
    return '<div class="ob-field' + (mod ? " ob-" + mod : "") + '"><label for="' + id + '">' + e(label) + '</label>' + control + '</div>';
  }
  function fldSm(id, label, unit) {
    return '<div class="ob-field ob-sm"><label for="' + id + '">' + e(label) + '</label>' +
      '<div class="ob-inputwrap"><input id="' + id + '" type="number" min="0" max="60" step="1" inputmode="numeric"><span class="ob-unit">' + e(unit) + '</span></div></div>';
  }
  function obRange(id, label, unit, valId, min, max) {
    return '<div class="ob-field ob-wide ob-rangefield"><div class="ob-rangetop"><label for="' + id + '">' + e(label) + '</label>' +
      '<span class="ob-rangeval"><span id="' + valId + '">0</span><span class="ob-u">' + e(unit) + '</span></span></div>' +
      '<input id="' + id + '" type="range" min="' + min + '" max="' + max + '" step="1" class="ob-range"></div>';
  }
  function obSwitch(id, label, desc) {
    return '<div class="ob-switchrow"><div><div class="ob-sw-label">' + e(label) + '</div>' +
      '<div class="ob-sw-desc">' + e(desc) + '</div></div>' +
      '<button type="button" class="ob-switch" id="' + id + '" role="switch" aria-checked="false" aria-label="' + e(label) + '"></button></div>';
  }
})();
