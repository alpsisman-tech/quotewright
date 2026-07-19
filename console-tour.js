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
      body: "Each row shows the autonomy <b>tier</b> (green ready / amber review / red needs work), the <b>margin</b> and match <b>confidence</b>, plus inline <b>Approve</b> and <b>Won / Lost</b> so you can act without opening it." },

    { page: "dashboard.html", sel: ".qc-drawer.show", place: "left", tab: "all", drawer: "demo-1",
      kick: "Workspace", title: "Open the workspace",
      body: "Click any quote to open its workspace: the full email <b>thread</b>, the <b>line items</b> the pipeline matched, and the ready-to-edit <b>draft</b> — all in one panel, no tab-hopping." },

    { page: "dashboard.html", sel: ".qc-resolve", place: "left", tab: "all", drawer: "demo-1",
      kick: "Workspace", title: "Resolve a weak line",
      body: "When a line is ambiguous, you get ranked candidates. One tap prices it, regenerates the draft, <b>and</b> teaches the pipeline your choice — so next time it's automatic. It never invents a price." },

    { page: "dashboard.html", sel: ".qc-draft-actions", place: "left", tab: "all", drawer: "demo-1",
      kick: "The send gate", title: "Approve &amp; send — you're the gate",
      body: "Nothing reaches a customer until you send it here. Edit the draft, <b>Approve &amp; send</b>, ask the customer for a missing spec, or label the thread. This is the human sign-off." },

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
      body: "As RFQs arrive, senders are remembered here — quote and order counts, currency and colour preferences, when you last spoke. It's how repeat quotes get faster and more accurate." },

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
    tip.setAttribute("aria-label", "Guided tour");
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
    tip.innerHTML =
      '<button type="button" class="qw-tour-skip" data-tour="skip">' + (last ? "Close" : "Skip tour") + '</button>' +
      finaleIco +
      '<div class="qw-tour-kick">' + s.kick + "</div>" +
      "<h3>" + s.title + "</h3>" +
      "<p>" + s.body + "</p>" +
      '<div class="qw-tour-foot">' +
        '<div class="qw-tour-dots">' + dots + "</div>" +
        (i > 0 ? '<button type="button" class="qw-tour-btn back" data-tour="back">Back</button>' : "") +
        '<button type="button" class="qw-tour-btn next" data-tour="next">' + (last ? "Finish" : "Next") + "</button>" +
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

  window.QWTour = {
    onConsoleReady: onConsoleReady,
    maybeAutoStart: maybeAutoStart,
    start: start,
    isActive: isActive
  };
})();
