/* Settings hub. Reads + UPDATEs the single public.autonomy_settings row
   (owner = QW_CONFIG.OWNER). RLS: authenticated SELECT + authenticated UPDATE.
   Four sections — Profile, Quoting voice, Automation & autonomy, Notifications —
   each loads current values and persists via an authenticated UPDATE with a toast.
   Degrades gracefully when the settings columns / table don't exist yet. */
(function () {
  "use strict";
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
      on: "On — exact repeats fill themselves", off: "Off — the sales team picks each first-time match" },
    autoSend: { key: "auto_send_enabled", row: "switchRow", st: "swState",
      on: "On — green-tier quotes send automatically", off: "Off — every quote waits for you" },
    followupEnabled: { key: "followup_enabled", row: "followupRow", st: "fuState",
      on: "On — a gentle nudge if the customer goes silent", off: "Off — quiet quotes are left alone" },
    digestEnabled: { key: "digest_enabled", row: "digestRow", st: "dgState",
      on: "On — a morning rollup of activity", off: "Off — no daily email" },
    alertThinMargin: { key: "alert_thin_margin", row: "thinRow", st: "tmState",
      on: "On — flag me the moment a quote dips low", off: "Off — no thin-margin pings" }
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
      node.addEventListener("click", function () { setSwitch(id, !state[SWITCHES[id].key]); markDirty(); });
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
    el(s.st).textContent = on ? s.on : s.off;
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
    Object.keys(SECTIONS).forEach(snapSection);
    Object.keys(SECTIONS).forEach(function (s) { setDirtyNote(s, false); });
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
    else { n.textContent = dirty ? "Unsaved changes" : ""; n.className = "qc-saved"; }
  }
  function markDirty() {
    Object.keys(SECTIONS).forEach(function (s) { setDirtyNote(s, sectionVal(s) !== snapshot[s]); });
  }

  // ── save one section ────────────────────────────────────────────────────
  function save(section, btn) {
    var keys = SECTIONS[section]; if (!keys) return;
    if (window.QWDemo && QWDemo.isOn()) { snapSection(section); setDirtyNote(section, false, "Demo — not saved"); toast("Demo mode — settings aren't saved."); return; }
    var label = btn.textContent;
    btn.disabled = true; btn.textContent = "Saving…";
    var patch = { updated_at: new Date().toISOString() };
    keys.forEach(function (key) {
      var v = state[key];
      if (INT_KEYS[key]) v = Math.round(Number(v) || 0);
      patch[key] = v;
    });
    sb.from("autonomy_settings").update(patch).eq("owner", owner).select().then(function (res) {
      btn.disabled = false; btn.textContent = label;
      if (res.error) {
        if (Q.isMissingTable(res.error)) { showMissing(); return; }
        if (isMissingColumn(res.error)) {
          toast("Some settings columns aren't there yet — run quotewright-settings.sql, then save again.", true);
          return;
        }
        toast("Couldn't save: " + (res.error.message || "unknown error"), true);
        return;
      }
      if (!res.data || res.data.length === 0) {
        toast("No settings row for " + owner + " — run quotewright-settings.sql (it seeds the row).", true);
        return;
      }
      snapSection(section);
      setDirtyNote(section, false, "Saved ✓");
      toast("Saved.");
    }, function () {
      btn.disabled = false; btn.textContent = label;
      toast("Network error — not saved.", true);
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
      '<h4>Settings aren’t switched on yet</h4>' +
      '<p>The <code>autonomy_settings</code> table doesn’t exist. Run <code>quotewright-intelligence.sql</code> then <code>quotewright-settings.sql</code> in the Supabase SQL editor — they create the table, add the settings columns and seed the row for <code>' + esc(owner) + '</code>.</p>';
    t.hidden = false;
  }
  function showError(msg) {
    el("settingsHub").hidden = true; el("loadingCard").hidden = true;
    var t = el("tableError");
    t.innerHTML = '<div class="ico"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#b42318" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9 2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/></svg></div><h4>Couldn’t load settings</h4><p>' + esc(msg) + '</p>' +
      '<button type="button" id="retryBtn" class="btn btn-primary btn-sm">Try again</button>';
    t.hidden = false;
    var rb = el("retryBtn"); if (rb) rb.addEventListener("click", function () { t.hidden = true; el("loadingCard").hidden = false; load(); });
  }

  function load() {
    el("tableError").hidden = true;
    // DEMO MODE (tour): show the hub with sample settings, never touch Supabase.
    if (window.QWDemo && QWDemo.isOn()) {
      state.display_name = "Mehmed Yalçın"; state.company = "Hassan Tekstil A.Ş."; state.role = "Export Sales Manager";
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
        showError(res.error.message || "Something went wrong reaching the settings store.");
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
      if (!r) toast("No saved row yet — showing defaults. Saving needs the seeded row (run quotewright-settings.sql).");
    }, function (err) {
      el("loadingCard").hidden = true;
      showError((err && err.message) || "Network error — check your connection and try again.");
    });
  }
})();
