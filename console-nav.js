/* Quotewright console — LEFT-NAV mobile drawer controller.

   Desktop: the rail (#subnav) is a fixed sidebar; this script is inert (the
   burger is display:none). Narrow (<=860px): the rail collapses off-canvas and
   a top bar with a hamburger slides it in as a glass drawer over a scrim.

   No inline scripts (site CSP is script-src 'self'). Fail-safe: every lookup is
   guarded, so a page missing any of these nodes simply does nothing. */
(function () {
  "use strict";

  function el(id) { return document.getElementById(id); }

  function ready(fn) {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", fn);
    else fn();
  }

  // Mirror the signed-in email's initial into the rail avatar. #whoami is filled
  // asynchronously on auth by each page, so watch it rather than read once.
  function wireAvatar() {
    var who = el("whoami"), av = el("userAvatar");
    if (!who || !av) return;
    var sync = function () {
      var t = (who.textContent || "").trim();
      av.textContent = t ? t.charAt(0).toUpperCase() : "";
    };
    sync();
    try { new MutationObserver(sync).observe(who, { childList: true, characterData: true, subtree: true }); } catch (e) {}
  }

  // Force the desktop rail open / let it re-collapse. Used by the guided tour so
  // labels are visible while it highlights nav items. On mobile the class is inert
  // (the collapse behaviour is desktop-only); the drawer is opened separately.
  window.QWNav = {
    expand: function () { var r = el("subnav"); if (r) r.classList.add("qc-rail-open"); },
    collapse: function () { var r = el("subnav"); if (r) r.classList.remove("qc-rail-open"); }
  };

  ready(function () {
    wireAvatar();
    var rail = el("subnav");
    var burger = el("navBurger");
    var scrim = el("navScrim");
    if (!rail || !burger) return;   // not a sidebar page → nothing to wire

    function isOpen() { return rail.classList.contains("open"); }

    function open() {
      rail.classList.add("open");
      if (scrim) scrim.classList.add("show");
      burger.setAttribute("aria-expanded", "true");
      document.body.classList.add("qc-nav-open");
      // focus the first nav link for keyboard users
      var first = rail.querySelector(".qc-side-nav a");
      if (first) { try { first.focus({ preventScroll: true }); } catch (e) {} }
    }

    function close(refocus) {
      rail.classList.remove("open");
      if (scrim) scrim.classList.remove("show");
      burger.setAttribute("aria-expanded", "false");
      document.body.classList.remove("qc-nav-open");
      if (refocus) { try { burger.focus({ preventScroll: true }); } catch (e) {} }
    }

    function toggle() { if (isOpen()) close(true); else open(); }

    burger.addEventListener("click", toggle);
    if (scrim) scrim.addEventListener("click", function () { close(false); });

    // A nav link click navigates away — close so the destination page starts clean.
    var nav = rail.querySelector(".qc-side-nav");
    if (nav) nav.addEventListener("click", function (e) {
      if (e.target.closest && e.target.closest("a")) close(false);
    });

    // Esc closes the drawer (only meaningful while it's open on mobile).
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && isOpen()) { e.preventDefault(); close(true); }
    });

    // If the viewport grows back to desktop while open, reset to the docked rail.
    var mq = window.matchMedia("(min-width: 861px)");
    var onChange = function () { if (mq.matches && isOpen()) close(false); };
    if (mq.addEventListener) mq.addEventListener("change", onChange);
    else if (mq.addListener) mq.addListener(onChange);
  });
})();
