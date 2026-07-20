/* Quotewright console — internationalisation (i18n) engine.
   English (default) + Turkish. Hand-rolled — the site CSP is `script-src 'self'`,
   so no external i18n library. Loaded FIRST on every console page, before that
   page's own script, so window.QWI18n.t()/apply() exist for everyone.

   Design goals
   ------------
   • No flash of English: the stored language is read SYNCHRONOUSLY at the top of
     this file and stamped onto <html lang="…"> immediately, and static DOM is
     translated on DOMContentLoaded (before first meaningful paint).
   • Per-USER preference: stored in localStorage['qw_lang'] for instant load AND in
     Supabase user_metadata.ui_lang (schemaless — NO SQL migration needed) so it
     follows the user across devices. Default 'en'.
   • Live switching: setLang() persists, re-stamps <html lang>, re-applies static
     DOM, and dispatches a `qw:langchange` CustomEvent so JS-rendered views can
     re-render WITHOUT a page reload.

   Turkish-i / uppercase safety
   ----------------------------
   Any element that must stay English/ASCII (the Quotewright wordmark, "Copilot",
   acronyms like RFQ/SKU/PDF/EUR/USD/TRY, data values) is marked lang="en" in the
   markup so CSS text-transform:uppercase under a Turkish document locale does NOT
   turn its i → İ. Turkish UI labels are translated, so they receive correct
   Turkish uppercasing under <html lang="tr">.

   API — window.QWI18n
   -------------------
     t(key, vars)        → translated string; interpolates {name}-style vars;
                           returns the key itself if missing (so gaps are visible).
     getLang()           → 'en' | 'tr'
     setLang(lang, opts) → persist + re-stamp + apply(document) + dispatch event.
                           opts.skipServer avoids writing back to Supabase.
     apply(root)         → translate [data-i18n] / [data-i18n-attr] / [data-i18n-html].
     add({en:{},tr:{}})  → merge more strings into DICT (page modules register theirs).
     reconcileUser(user) → adopt user_metadata.ui_lang on login (cross-device).
     setClient(sb)       → hand the engine the Supabase client for server persistence.
     rel/date/dateTime   → locale-aware date + relative-time formatters.
     DICT                → the { en:{…}, tr:{…} } dictionary (single source of truth).
*/
(function () {
  "use strict";

  var LS_KEY = "qw_lang";
  var DEFAULT = "en";
  var SUPPORTED = ["en", "tr"];
  var LOCALE = { en: "en-GB", tr: "tr-TR" };

  function readStored() {
    try {
      var v = localStorage.getItem(LS_KEY);
      if (v && SUPPORTED.indexOf(v) >= 0) return v;
    } catch (e) {}
    return DEFAULT;
  }

  var lang = readStored();
  // Stamp the locale onto <html> as early as possible (before first paint).
  try { document.documentElement.setAttribute("lang", lang); } catch (e) {}

  // ── Dictionary (single source of truth). Page modules extend it via add(). ──
  var DICT = { en: {}, tr: {} };

  function add(frag) {
    if (!frag) return;
    ["en", "tr"].forEach(function (L) {
      var src = frag[L];
      if (!src) return;
      for (var k in src) {
        if (Object.prototype.hasOwnProperty.call(src, k)) DICT[L][k] = src[k];
      }
    });
    // Keys can register after the first paint (a page's own script loads after
    // this one). Re-apply so late strings land on already-parsed static DOM.
    if (applied) apply(document);
  }

  function interp(s, vars) {
    if (!vars) return s;
    return String(s).replace(/\{(\w+)\}/g, function (m, k) {
      return (vars[k] != null) ? vars[k] : m;
    });
  }

  function t(key, vars) {
    if (key == null) return "";
    var d = DICT[lang] || {};
    var s = (d[key] != null) ? d[key]
          : (DICT.en[key] != null ? DICT.en[key] : null);
    if (s == null) return key;           // missing → show the key so gaps are visible
    return interp(s, vars);
  }

  function getLang() { return lang; }

  // ── Supabase server persistence (user_metadata.ui_lang) ────────────────────
  var _sb = null;
  function setClient(sb) { if (sb) _sb = sb; }
  function client() {
    return _sb ||
      (window.QWConsole && window.QWConsole.sb) ||
      window.sb || null;
  }
  function persistServer(l) {
    var sb = client();
    if (sb && sb.auth && typeof sb.auth.updateUser === "function") {
      try { sb.auth.updateUser({ data: { ui_lang: l } }); } catch (e) {}
    }
  }

  function setLang(l, opts) {
    opts = opts || {};
    if (SUPPORTED.indexOf(l) < 0) l = DEFAULT;
    var changed = l !== lang;
    lang = l;
    try { localStorage.setItem(LS_KEY, l); } catch (e) {}
    try { document.documentElement.setAttribute("lang", l); } catch (e) {}
    if (!opts.skipServer) persistServer(l);
    apply(document);
    if (changed || opts.force) {
      try { window.dispatchEvent(new CustomEvent("qw:langchange", { detail: { lang: l } })); } catch (e) {}
    }
  }

  // Called from the auth flows once a session is known. Server value wins across
  // devices; if the server has none but the user set a local one, push it up.
  function reconcileUser(user) {
    var srv = user && user.user_metadata && user.user_metadata.ui_lang;
    if (srv && SUPPORTED.indexOf(srv) >= 0) {
      if (srv !== lang) setLang(srv, { skipServer: true });
    } else if (lang !== DEFAULT) {
      persistServer(lang);
    }
  }

  // ── DOM application ─────────────────────────────────────────────────────────
  var applied = false;

  function dataVars(el) {
    var raw = el.getAttribute("data-i18n-vars");
    if (!raw) return null;
    try { return JSON.parse(raw); } catch (e) { return null; }
  }

  function apply(root) {
    root = root || document;
    if (!root.querySelectorAll) return;

    var textNodes = root.querySelectorAll("[data-i18n]");
    for (var i = 0; i < textNodes.length; i++) {
      var el = textNodes[i];
      var key = el.getAttribute("data-i18n");
      if (key) el.textContent = t(key, dataVars(el));
    }

    var htmlNodes = root.querySelectorAll("[data-i18n-html]");
    for (var m = 0; m < htmlNodes.length; m++) {
      var eh = htmlNodes[m];
      var kh = eh.getAttribute("data-i18n-html");
      if (kh) eh.innerHTML = t(kh, dataVars(eh));
    }

    var attrNodes = root.querySelectorAll("[data-i18n-attr]");
    for (var j = 0; j < attrNodes.length; j++) {
      var ea = attrNodes[j];
      var spec = ea.getAttribute("data-i18n-attr");
      if (!spec) continue;
      var vars = dataVars(ea);
      var pairs = spec.split(";");
      for (var p = 0; p < pairs.length; p++) {
        var pair = pairs[p].trim();
        if (!pair) continue;
        var idx = pair.indexOf(":");
        if (idx < 0) continue;
        var attr = pair.slice(0, idx).trim();
        var k = pair.slice(idx + 1).trim();
        if (attr && k) ea.setAttribute(attr, t(k, vars));
      }
    }
    applied = true;
  }

  // ── Locale-aware date / relative-time helpers ───────────────────────────────
  function locale() { return LOCALE[lang] || "en-GB"; }

  function date(s) {
    if (!s) return "—";
    var d = new Date(s);
    return isNaN(d) ? "—"
      : d.toLocaleDateString(locale(), { day: "2-digit", month: "short", year: "numeric" });
  }
  function dateTime(s) {
    if (!s) return "—";
    var d = new Date(s);
    if (isNaN(d)) return "—";
    return d.toLocaleDateString(locale(), { day: "2-digit", month: "short", year: "numeric" }) +
      " · " + d.toLocaleTimeString(locale(), { hour: "2-digit", minute: "2-digit" });
  }
  function rel(s) {
    if (!s) return "—";
    var d = new Date(s);
    if (isNaN(d)) return "—";
    var diff = (Date.now() - d.getTime()) / 1000;
    if (diff < 60) return t("time.justNow");
    if (diff < 3600) return t("time.mAgo", { n: Math.floor(diff / 60) });
    if (diff < 86400) return t("time.hAgo", { n: Math.floor(diff / 3600) });
    if (diff < 86400 * 30) return t("time.dAgo", { n: Math.floor(diff / 86400) });
    return date(s);
  }
  // Localized month name (short) for chart axes etc.
  function monthShort(d) {
    try { return new Date(d).toLocaleDateString(locale(), { month: "short" }); }
    catch (e) { return ""; }
  }

  window.QWI18n = {
    t: t, getLang: getLang, setLang: setLang, apply: apply, add: add,
    reconcileUser: reconcileUser, setClient: setClient,
    rel: rel, date: date, dateTime: dateTime, monthShort: monthShort,
    locale: locale, DICT: DICT, SUPPORTED: SUPPORTED, DEFAULT: DEFAULT
  };

  // ── Core dictionary: shared chrome + common strings used on every page ──────
  add({
    en: {
      // Brand / nav
      "nav.aria": "Console navigation",
      "nav.sectionsAria": "Console sections",
      "nav.openAria": "Open navigation",
      "nav.brandAria": "Quotewright quote console",
      "nav.quotes": "Quotes",
      "nav.insights": "Insights",
      "nav.customers": "Customers",
      "nav.gaps": "Catalogue gaps",
      "nav.activity": "Activity",
      "nav.settings": "Settings",
      "nav.admin": "Admin",

      // Common actions / words
      "common.internalAccess": "Internal access",
      "common.signIn": "Sign in",
      "common.signingIn": "Signing in…",
      "common.signOut": "Sign out",
      "common.saving": "Saving…",
      "common.tryAgain": "Try again",
      "common.refresh": "Refresh",
      "common.refreshing": "Refreshing…",
      "common.save": "Save",
      "common.cancel": "Cancel",
      "common.confirm": "Confirm",
      "common.close": "Close",
      "common.search": "Search",
      "common.loading": "Loading…",
      "common.networkError": "Network error.",
      "common.email": "Email",
      "common.password": "Password",
      "common.emailPh": "you@company.com",
      "common.checkAgain": "Check again",
      "common.checking": "Checking…",
      "common.backToConsole": "Console",
      "common.retry": "Retry",
      "common.all": "All",
      "common.yes": "Yes",
      "common.no": "No",

      // Login card titles + subs (auxiliary pages)
      "login.title.settings": "Settings",
      "login.sub.settings": "Sign in to set your profile, quoting voice and how much the pipeline runs on its own.",
      "login.title.insights": "Insights",
      "login.sub.insights": "Sign in to see win-rate, pipeline value, margins and turnaround across your quotes.",
      "login.title.customers": "Customer memory",
      "login.sub.customers": "Sign in to review the customers the pipeline remembers.",
      "login.title.gaps": "Catalogue gaps",
      "login.sub.gaps": "Sign in to see what customers keep asking for that isn’t catalogued.",
      "login.title.activity": "Activity feed",
      "login.sub.activity": "Sign in to see a live timeline of everything the RFQ pipeline and your team have done.",

      // Relative time
      "time.justNow": "just now",
      "time.mAgo": "{n}m ago",
      "time.hAgo": "{n}h ago",
      "time.dAgo": "{n}d ago",
      "time.today": "Today",
      "time.yesterday": "Yesterday"
    },
    tr: {
      "nav.aria": "Konsol gezinmesi",
      "nav.sectionsAria": "Konsol bölümleri",
      "nav.openAria": "Gezinmeyi aç",
      "nav.brandAria": "Quotewright teklif konsolu",
      "nav.quotes": "Teklifler",
      "nav.insights": "Analizler",
      "nav.customers": "Müşteriler",
      "nav.gaps": "Katalog boşlukları",
      "nav.activity": "Etkinlik",
      "nav.settings": "Ayarlar",
      "nav.admin": "Yönetim",

      "common.internalAccess": "Dahili erişim",
      "common.signIn": "Giriş yap",
      "common.signingIn": "Giriş yapılıyor…",
      "common.signOut": "Çıkış yap",
      "common.saving": "Kaydediliyor…",
      "common.tryAgain": "Tekrar dene",
      "common.refresh": "Yenile",
      "common.refreshing": "Yenileniyor…",
      "common.save": "Kaydet",
      "common.cancel": "İptal",
      "common.confirm": "Onayla",
      "common.close": "Kapat",
      "common.search": "Ara",
      "common.loading": "Yükleniyor…",
      "common.networkError": "Ağ hatası.",
      "common.email": "E-posta",
      "common.password": "Parola",
      "common.emailPh": "siz@sirket.com",
      "common.checkAgain": "Tekrar denetle",
      "common.checking": "Denetleniyor…",
      "common.backToConsole": "Konsol",
      "common.retry": "Yeniden dene",
      "common.all": "Tümü",
      "common.yes": "Evet",
      "common.no": "Hayır",

      "login.title.settings": "Ayarlar",
      "login.sub.settings": "Profilinizi, teklif üslubunuzu ve akışın kendi başına ne kadar çalışacağını ayarlamak için giriş yapın.",
      "login.title.insights": "Analizler",
      "login.sub.insights": "Tekliflerinizdeki kazanma oranı, akış değeri, kâr marjı ve yanıt süresini görmek için giriş yapın.",
      "login.title.customers": "Müşteri belleği",
      "login.sub.customers": "Akışın hatırladığı müşterileri incelemek için giriş yapın.",
      "login.title.gaps": "Katalog boşlukları",
      "login.sub.gaps": "Müşterilerin sürekli istediği ama katalogda olmayan ürünleri görmek için giriş yapın.",
      "login.title.activity": "Etkinlik akışı",
      "login.sub.activity": "RFQ akışının ve ekibinizin yaptığı her şeyin canlı zaman çizelgesini görmek için giriş yapın.",

      "time.justNow": "az önce",
      "time.mAgo": "{n} dk önce",
      "time.hAgo": "{n} sa önce",
      "time.dAgo": "{n} gün önce",
      "time.today": "Bugün",
      "time.yesterday": "Dün"
    }
  });

  // Translate static DOM as early as possible.
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () { apply(document); });
  } else {
    apply(document);
  }
})();
