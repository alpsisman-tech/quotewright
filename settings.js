/* Autonomy settings view. Reads + UPDATEs the single public.autonomy_settings row
   (owner = QW_CONFIG.OWNER). RLS: authenticated SELECT + authenticated UPDATE.
   Degrades gracefully when the intelligence SQL hasn't been run yet. */
(function () {
  "use strict";
  var Q = window.QWConsole;
  var el = Q.el, esc = Q.esc, num = Q.numOrNull, toast = Q.toast;
  var sb = null;
  var owner = Q.cfg.OWNER || "hassannonwovens";
  var state = { auto_send_enabled: false, green_min_confidence: 90, green_min_margin: 20, amber_min_confidence: 60 };
  var saved = JSON.stringify(state);

  var ICON_WARN = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9 2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/></svg>';

  Q.boot({ onAuth: function (client) {
    sb = client;
    el("subnav").hidden = false;
    el("autoSend").addEventListener("click", function () { setAuto(!state.auto_send_enabled); });
    bindRange("greenConf", "gcVal", "green_min_confidence");
    bindRange("greenMargin", "gmVal", "green_min_margin");
    bindRange("amberConf", "acVal", "amber_min_confidence");
    el("saveBtn").addEventListener("click", save);
    load();
  }});

  function bindRange(inputId, valId, key) {
    el(inputId).addEventListener("input", function () {
      state[key] = Number(this.value);
      el(valId).textContent = this.value;
      renderTiers(); markDirty();
    });
  }

  function setAuto(on) {
    state.auto_send_enabled = on;
    var sw = el("autoSend");
    sw.setAttribute("aria-checked", on ? "true" : "false");
    el("switchRow").classList.toggle("on", on);
    el("swState").textContent = on ? "On — green-tier quotes send automatically" : "Off — every quote waits for you";
    markDirty();
  }

  function paint() {
    setAuto(state.auto_send_enabled);
    el("greenConf").value = state.green_min_confidence; el("gcVal").textContent = state.green_min_confidence;
    el("greenMargin").value = state.green_min_margin; el("gmVal").textContent = state.green_min_margin;
    el("amberConf").value = state.amber_min_confidence; el("acVal").textContent = state.amber_min_confidence;
    renderTiers();
    saved = JSON.stringify(state);
    el("savedNote").textContent = "";
  }

  function markDirty() {
    el("savedNote").textContent = (JSON.stringify(state) !== saved) ? "Unsaved changes" : "";
  }

  function renderTiers() {
    var gc = state.green_min_confidence, gm = state.green_min_margin, ac = state.amber_min_confidence;
    var tiers = [
      { c: "green", name: "Green · auto-safe",
        rule: "conf ≥ " + gc + " · margin ≥ " + gm + "%",
        desc: (state.auto_send_enabled
          ? "The match is near-certain <b>and</b> the deal is healthy. These <b>send on their own</b> — no tap needed."
          : "The match is near-certain <b>and</b> the deal is healthy. Ready to send in one tap. (Auto-send is off, so they still wait.)") },
      { c: "amber", name: "Amber · worth a glance",
        rule: "conf " + ac + "–" + (gc - 1 < ac ? gc : gc - 1) + (gm > 0 ? " · or margin < " + gm + "%" : ""),
        desc: "Confident enough to draft, but short of green — or the margin dipped. <b>Always waits</b> for you to confirm before sending." },
      { c: "red", name: "Red · flagged",
        rule: "conf < " + ac,
        desc: "Low confidence or a spec the catalogue can’t price cleanly. <b>Held for a careful look</b> and highlighted in the queue." }
    ];
    el("tiers").innerHTML = tiers.map(function (t) {
      return '<div class="qc-tier ' + t.c + '"><div class="qc-tier-head">' +
        '<span class="qc-tier-dot"></span><span class="qc-tier-name">' + esc(t.name) + '</span>' +
        '<span class="qc-tier-rule">' + esc(t.rule) + '</span></div>' +
        '<p class="qc-tier-desc">' + t.desc + '</p></div>';
    }).join("");
  }

  function save() {
    var btn = el("saveBtn");
    btn.disabled = true; btn.textContent = "Saving…";
    var patch = {
      auto_send_enabled: state.auto_send_enabled,
      green_min_confidence: Math.round(state.green_min_confidence),
      green_min_margin: state.green_min_margin,
      amber_min_confidence: Math.round(state.amber_min_confidence),
      updated_at: new Date().toISOString()
    };
    sb.from("autonomy_settings").update(patch).eq("owner", owner).select().then(function (res) {
      btn.disabled = false; btn.textContent = "Save settings";
      if (res.error) {
        if (Q.isMissingTable(res.error)) { showMissing(); return; }
        toast("Couldn’t save: " + (res.error.message || "unknown error"), true);
        return;
      }
      if (!res.data || res.data.length === 0) {
        toast("No settings row for " + owner + " — run quotewright-intelligence.sql (it seeds the row).", true);
        return;
      }
      saved = JSON.stringify(state);
      el("savedNote").textContent = "Saved ✓";
      toast("Autonomy settings saved.");
    }, function () {
      btn.disabled = false; btn.textContent = "Save settings";
      toast("Network error — not saved.", true);
    });
  }

  function showMissing() {
    el("settingsGrid").hidden = true; el("loadingCard").hidden = true;
    var t = el("tableError");
    t.innerHTML = '<div class="ico" style="background:var(--row)"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--grey)" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-2.4.98 2 2 0 0 1-3.86 0 1.65 1.65 0 0 0-2.4-.98l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a2 2 0 0 1 0-3.86 1.65 1.65 0 0 0 .98-2.4l-.06-.06A2 2 0 1 1 8.35 5.85l.06.06a1.65 1.65 0 0 0 2.4-.98 2 2 0 0 1 3.86 0 1.65 1.65 0 0 0 2.4.98l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.98 2.4 2 2 0 0 1 0 3.86z"/></svg></div>' +
      '<h4>Autonomy settings aren’t switched on yet</h4>' +
      '<p>The <code>autonomy_settings</code> table doesn’t exist. Run <code>quotewright-intelligence.sql</code> in the Supabase SQL editor — it creates the table and seeds the row for <code>' + esc(owner) + '</code>.</p>';
    t.hidden = false;
  }
  function showError(msg) {
    el("settingsGrid").hidden = true; el("loadingCard").hidden = true;
    var t = el("tableError");
    t.innerHTML = '<div class="ico">' + ICON_WARN + '</div><h4>Couldn’t load settings</h4><p>' + esc(msg) + '</p>' +
      '<button type="button" id="retryBtn" class="btn btn-primary btn-sm">Try again</button>';
    t.hidden = false;
    var rb = el("retryBtn"); if (rb) rb.addEventListener("click", function () { t.hidden = true; el("loadingCard").hidden = false; load(); });
  }

  function load() {
    el("tableError").hidden = true;
    sb.from("autonomy_settings").select("*").eq("owner", owner).maybeSingle().then(function (res) {
      el("loadingCard").hidden = true;
      if (res.error) {
        if (Q.isMissingTable(res.error)) { showMissing(); return; }
        showError(res.error.message || "Something went wrong reaching the settings store.");
        return;
      }
      var r = res.data;
      if (r) {
        state.auto_send_enabled = r.auto_send_enabled === true;
        if (num(r.green_min_confidence) != null) state.green_min_confidence = num(r.green_min_confidence);
        if (num(r.green_min_margin) != null) state.green_min_margin = num(r.green_min_margin);
        if (num(r.amber_min_confidence) != null) state.amber_min_confidence = num(r.amber_min_confidence);
      }
      el("settingsGrid").hidden = false;
      paint();
      if (!r) toast("No saved row yet — showing defaults. Saving needs the seeded row (run the intelligence SQL).");
    }, function (err) {
      el("loadingCard").hidden = true;
      showError((err && err.message) || "Network error — check your connection and try again.");
    });
  }
})();
