/* Quotewright console — DEMO / SAMPLE DATA (client-side only).

   Purpose: so a brand-new, empty account can showcase every feature during the
   guided tour (or an explicit demo mode) WITHOUT ever writing sample rows to the
   real tenant database. When demo mode is on, each console page reads from
   window.QWDemo instead of Supabase; when it is off, the pages read the real
   (possibly empty) tenant data exactly as before.

   ── Guarantees ────────────────────────────────────────────────────────────────
   • NOTHING here ever touches Supabase. There are no writes, no network calls.
   • Demo mode is a per-tab flag in sessionStorage (`qw_demo_on`). It survives the
     page navigations the tour performs, and clears when the tab closes or the tour
     ends — it can never leak into a real session on another tab.
   • Every accessor returns a DEEP CLONE, so a page mutating its copy (approving,
     resolving, marking won/lost during the tour) can't corrupt the source or bleed
     across page loads. Each page load starts from a clean sample.

   No inline scripts (site CSP is script-src 'self'). */
(function () {
  "use strict";

  var KEY = "qw_demo_on";

  // ── relative timestamps so the data always looks fresh ──────────────────────
  var NOW = Date.now();
  function daysAgo(d, h, m) {
    var t = new Date(NOW - d * 86400000);
    if (h != null) t.setHours(h, m == null ? 12 : m, 0, 0);
    return t.toISOString();
  }
  function hoursAgo(h) { return new Date(NOW - h * 3600000).toISOString(); }

  // ── the dataset (built once, cloned on every read) ──────────────────────────
  var _cache = null;
  function clone(x) { return JSON.parse(JSON.stringify(x)); }

  function build() {
    // Candidate lists for the resolution picker (weak lines in the drawer).
    var northwindCands = [
      { sku: "MF-320-AB-40", name: "Microfibre cloth 40×40 — anthracite", unit_price: 0.132, currency: "USD",
        confidence: 82, specs: "320 gsm · 40×40 cm · laser-cut edge", colour: "Anthracite",
        reason: "Same weave & weight; colour matches the requested anthracite." },
      { sku: "MF-320-GR-40", name: "Microfibre cloth 40×40 — graphite", unit_price: 0.129, currency: "USD",
        confidence: 61, specs: "320 gsm · 40×40 cm · overlock edge", colour: "Graphite",
        reason: "Close weight; edge finish differs (overlock, not laser-cut)." }
    ];
    var coastalCands = [
      { sku: "OK0400CH1659", name: "HASKEÇE acoustic felt 400 — charcoal", unit_price: 1.24, currency: "EUR",
        confidence: 74, specs: "400 gsm · 165 cm wide", colour: "Charcoal",
        reason: "Weight & colour match; awaiting confirmation of acoustic rating." }
    ];

    var quotes = [
      // ── LIVE / needs-you drafts ──────────────────────────────────────────────
      {
        id: "demo-1", owner: "demo", customer: "Northwind Facilities BV",
        created_at: hoursAgo(20), status: "draft", currency: "USD",
        total: 152100.00, grand_total_vadeli: 158220.00,
        margin_pct: 18, match_confidence: 74, autonomy_tier: "amber",
        needs_approval: true, approval_reason: "Line margin 18% — under the 20% green floor",
        approved_by: null, approved_at: null, sent_at: null, outcome: "pending",
        unmatched_lines: [{ ref: "4", text: "Anti-static packaging surcharge" }],
        gmail_draft_id: "r-demo-1",
        output: {
          match_confidence: 74,
          quote_text: "Dear Northwind team,\n\nThank you for your continued business. Please find our quotation for your microfibre programme below. Prices are shown per pack, cash and term.\n\nLine 1 — Microfibre cloth 40×40, 320gsm, blue: 1.480 USD/pack.\nLine 2 — Microfibre cloth 40×40, 320gsm, grey: 2.250 USD/pack.\nLine 3 — Awaiting your confirmation of the anthracite shade before we price it.\nLine 4 — Anti-static packaging: this sits outside our catalogue, so our sales team will follow up directly rather than quote an invented figure.\n\nBest regards,\nSales Engineering\nHassan Tekstil A.Ş.",
          lines: [
            { ref: "1", product_name: "Microfibre cloth 40×40 — blue", spec: "320 gsm · 40×40 cm", colors: "Blue",
              sku: "MF-320-BL-40", status: "priced", confidence: 96, qty: 45000, qty_unit: "pcs",
              unit_cash: "1.480 USD/pack", unit_term: "1.540 USD/pack", total_cash: 66600, total_term: 69300,
              match_reason: "Exact catalogue match on weave, weight and colour.", candidates: [] },
            { ref: "2", product_name: "Microfibre cloth 40×40 — grey", spec: "320 gsm · 40×40 cm", colors: "Grey",
              sku: "MF-320-GY-40", status: "priced", confidence: 94, qty: 38000, qty_unit: "pcs",
              unit_cash: "2.250 USD/pack", unit_term: "2.340 USD/pack", total_cash: 85500, total_term: 88920,
              match_reason: "Exact catalogue match; repeat line from the last order.", candidates: [] },
            { ref: "3", product_name: "Microfibre cloth 40×40 — anthracite", spec: "320 gsm · 40×40 cm", colors: "Anthracite (unconfirmed)",
              sku: "", status: "pending_info", confidence: 58, qty: 20000, qty_unit: "pcs",
              unit_cash: "", unit_term: "", total_cash: null, total_term: null,
              match_reason: "Two shades could match — confirm which anthracite before pricing.",
              candidates: northwindCands },
            { ref: "4", product_name: "Anti-static packaging surcharge", spec: "Per-pack surcharge", colors: "",
              sku: "", status: "pending_hassan", confidence: null, qty: 1, qty_unit: "pcs",
              unit_cash: "", unit_term: "", total_cash: null, total_term: null,
              match_reason: "Not in the catalogue — never invent a price. Sales team will follow up.",
              candidates: [] }
          ]
        },
        thread_snapshot: [
          { from: "procurement@example.com", direction: "inbound", date: daysAgo(2, 9, 14),
            body: "Hi there,\n\nWe'd like to reorder our 40×40 microfibre programme: 45,000 blue, 38,000 grey, and 20,000 in the new anthracite shade. Please also quote anti-static packaging.\n\nThanks,\nDana" },
          { from: "sales@example.com", direction: "outbound", date: daysAgo(2, 11, 2),
            body: "Dear Dana,\n\nGreat to hear from you. Could you confirm which anthracite you'd like — the laser-cut MF-320-AB or the overlock MF-320-GR? That decides the price on line 3.\n\nBest,\nSales Engineering" },
          { from: "procurement@example.com", direction: "inbound", date: hoursAgo(21),
            body: "We'll come back on the anthracite by Friday. Please get the rest quoted in the meantime.\n\nDana" }
        ],
        last_reply_text: null
      },
      {
        id: "demo-2", owner: "demo", customer: "Möbel Schmidt GmbH",
        created_at: daysAgo(2, 8), status: "draft", currency: "EUR",
        total: 1188.00, grand_total_vadeli: null,
        margin_pct: 27, match_confidence: 94, autonomy_tier: "green",
        needs_approval: false, approved_by: null, approved_at: null, sent_at: null, outcome: "pending",
        unmatched_lines: [], gmail_draft_id: "r-demo-2",
        output: {
          match_confidence: 94,
          quote_text: "Sehr geehrte Damen und Herren,\n\nvielen Dank für Ihre Anfrage. Gerne unterbreiten wir Ihnen folgendes Angebot:\n\nHASKEÇE K 220, schwarz, 165 cm breit — 1.000 lfm (= 1.650 m²) zu 0,72 EUR/m² = 1.188,00 EUR.\n\nMit freundlichen Grüßen,\nSales Engineering",
          lines: [
            { ref: "1", product_name: "HASKEÇE K 220 — schwarz", spec: "220 gsm · 165 cm breit", colors: "Schwarz",
              sku: "OK0220SD1659H915", status: "priced", confidence: 94, qty: 1650, qty_unit: "m2",
              unit_cash: "0.72 EUR/m2", unit_term: "0.72 EUR/m2", total_cash: 1188, total_term: 1188,
              match_reason: "1.000 lfm × 1,65 m Breite = 1.650 m². Exakter Katalogtreffer.", candidates: [] }
          ]
        },
        thread_snapshot: [
          { from: "einkauf@moebel-schmidt.de", direction: "inbound", date: daysAgo(2, 7, 40),
            body: "Guten Tag,\n\nwir benötigen 1.000 Meter pro Rolle, Breite 165 cm, HASKEÇE K 220 in schwarz. Bitte um Ihr Angebot.\n\nMfG, T. Schmidt" }
        ],
        last_reply_text: null
      },
      {
        id: "demo-3", owner: "demo", customer: "Aksa Tekstil A.Ş.",
        created_at: hoursAgo(6), status: "draft", currency: "EUR",
        total: null, grand_total_vadeli: null,
        margin_pct: null, match_confidence: 52, autonomy_tier: "red",
        needs_approval: false, approved_by: null, approved_at: null, sent_at: null, outcome: "pending",
        unmatched_lines: [{ ref: "1", text: "FR-treated PET felt 220gsm" }], gmail_draft_id: "r-demo-3",
        last_reply_text: "Merhaba, yangına dayanıklı (FR) versiyonu da fiyatlandırabilir misiniz? Teşekkürler.",
        output: {
          match_confidence: 52,
          quote_text: "Sayın Aksa Tekstil,\n\nTalebiniz için teşekkür ederiz. Yangına dayanıklı (FR) PET keçe ürün yelpazemizde mevcuttur; fiyatı için satış ekibimiz sizinle en kısa sürede iletişime geçecektir.\n\nSaygılarımızla,\nHassan Tekstil A.Ş.",
          lines: [
            { ref: "1", product_name: "PET keçe 220 — FR (yangına dayanıklı)", spec: "220 gsm · FR", colors: "Doğal",
              sku: "", status: "pending_hassan", confidence: null, qty: 12000, qty_unit: "m2",
              unit_cash: "", unit_term: "", total_cash: null, total_term: null,
              match_reason: "FR varyantı katalogda fiyatlı değil — uydurma fiyat verme, satış ekibi takip edecek.",
              candidates: [] }
          ]
        },
        thread_snapshot: [
          { from: "satinalma@aksa.com.tr", direction: "inbound", date: daysAgo(1, 15),
            body: "Merhaba,\n\n12.000 m² PET keçe 220 gsm için fiyat rica ederiz." },
          { from: "satinalma@aksa.com.tr", direction: "inbound", date: hoursAgo(6),
            body: "Merhaba, yangına dayanıklı (FR) versiyonu da fiyatlandırabilir misiniz? Teşekkürler." }
        ]
      },
      {
        id: "demo-4", owner: "demo", customer: "Nordic Home Interiors",
        created_at: daysAgo(3, 10), status: "draft", currency: "EUR",
        total: 8640.00, grand_total_vadeli: null,
        margin_pct: 22, match_confidence: 68, autonomy_tier: "amber",
        needs_approval: false, approved_by: null, approved_at: null, sent_at: null, outcome: "pending",
        unmatched_lines: [], gmail_draft_id: "r-demo-4",
        output: {
          match_confidence: 68,
          quote_text: "Dear Nordic Home,\n\nThank you for your enquiry. We can offer HASKEÇE 260gsm felt provisionally against your 240gsm request; please confirm the substitution and we'll firm up the price.\n\nBest regards,\nHassan Tekstil A.Ş.",
          lines: [
            { ref: "1", product_name: "HASKEÇE felt 260 — natural", spec: "260 gsm (vs 240 requested) · 200 cm", colors: "Natural",
              sku: "OK0260ND2001", status: "provisional", confidence: 68, qty: 12000, qty_unit: "m2",
              unit_cash: "0.72 EUR/m2", unit_term: "0.72 EUR/m2", total_cash: 8640, total_term: 8640,
              match_reason: "Nearest weight is 260gsm; priced provisionally pending your OK on the substitution.",
              candidates: [] }
          ]
        },
        thread_snapshot: [
          { from: "buying@nordichome.se", direction: "inbound", date: daysAgo(3, 9, 30),
            body: "Hello,\n\nWe need 12,000 m² of 240gsm natural felt, 200cm wide. What can you offer?" }
        ],
        last_reply_text: null
      },
      {
        id: "demo-5", owner: "demo", customer: "Coastal Interiors Ltd",
        created_at: daysAgo(4, 14), status: "draft", currency: "GBP",
        total: null, grand_total_vadeli: null,
        margin_pct: null, match_confidence: 58, autonomy_tier: "red",
        needs_approval: false, approved_by: null, approved_at: null, sent_at: null, outcome: "pending",
        unmatched_lines: [], gmail_draft_id: "r-demo-5",
        output: {
          match_confidence: 58,
          quote_text: "Dear Coastal Interiors,\n\nThank you for the enquiry. We'd like to confirm the acoustic rating on the charcoal felt before pricing.\n\nBest regards,\nHassan Tekstil A.Ş.",
          lines: [
            { ref: "1", product_name: "Acoustic felt 400 — charcoal", spec: "400 gsm · 165 cm", colors: "Charcoal",
              sku: "", status: "pending_info", confidence: 58, qty: 3000, qty_unit: "m2",
              unit_cash: "", unit_term: "", total_cash: null, total_term: null,
              match_reason: "Awaiting the required acoustic (NRC) rating before matching a SKU.",
              candidates: coastalCands }
          ]
        },
        thread_snapshot: [
          { from: "orders@coastalinteriors.co.uk", direction: "inbound", date: daysAgo(4, 13, 20),
            body: "Hi,\n\nLooking for 3,000 m² of charcoal acoustic felt, 400gsm. Can you price it?" }
        ],
        last_reply_text: null
      },

      // ── SENT / decided — history for the chart, insights & activity ──────────
      qSent("demo-6", "BulgarTex OOD", 20, 72000, "EUR", "green", 92, 31, "won", 10,
        "Repeat black-felt programme; confirmed same day.", "OK0220SD1659H915", "HASKEÇE K 220 — черен"),
      qSent("demo-7", "AutoTrim OEM Supply", 35, 24500, "USD", "amber", 71, 12, "lost", 25,
        "Automotive headliner foam; competitor undercut on lead time.", "HS-CAR-200-PB", "Headliner 200 — foam-backed", "Price — competitor undercut"),
      qSent("demo-8", "Delta Filtration", 12, 15400, "EUR", "green", 91, 29, "pending", null,
        "Spunlace media, standard grade.", "SL-060-AP", "Spunlace 60 — aperture"),
      qSent("demo-9", "Northwind Facilities BV", 55, 88400, "USD", "green", 90, 26, "won", 45,
        "Prior microfibre programme.", "MF-320-BL-40", "Microfibre 40×40 — blue"),
      qSent("demo-10", "Kervan Yapı", 70, 41000, "EUR", "amber", 78, 21, "won", 60,
        "Floor felt roll goods.", "FL-300-GY", "Floor felt 300 — grey"),
      qSent("demo-11", "Meridian Textiles", 85, 12800, "USD", "red", 63, 9, "lost", 78,
        "Thin-margin one-off; no follow-up.", "MF-300-WH-30", "Microfibre 30×30 — white", "No response after quote"),
      qSent("demo-12", "Delta Filtration", 100, 21000, "EUR", "green", 93, 30, "won", 92,
        "Earlier spunlace order.", "SL-060-AP", "Spunlace 60 — aperture"),
      qSent("demo-13", "Aegean Supplies", 8, 6700, "USD", "amber", 76, 19, "pending", null,
        "Microfibre trial order.", "MF-320-GY-40", "Microfibre 40×40 — grey"),
      qSent("demo-14", "Möbel Schmidt GmbH", 130, 9400, "EUR", "green", 95, 33, "won", 120,
        "First HASKEÇE order.", "OK0220SD1659H915", "HASKEÇE K 220 — schwarz")
    ];

    var customers = [
      cust("Northwind Facilities BV", "procurement@example.com", "example.com", 3, 2, "USD", 0.5, "NW-4471",
        { colours: "Blue, grey, anthracite", edge: "Laser-cut" }),
      cust("Delta Filtration", "buyer@deltafiltration.com", "deltafiltration.com", 2, 2, "EUR", 12, "DF-2210"),
      cust("Möbel Schmidt GmbH", "einkauf@moebel-schmidt.de", "moebel-schmidt.de", 2, 1, "EUR", 2, "MS-8830"),
      cust("BulgarTex OOD", "office@bulgartex.bg", "bulgartex.bg", 2, 1, "EUR", 20, "BT-5567"),
      cust("Kervan Yapı", "satinalma@kervanyapi.com.tr", "kervanyapi.com.tr", 1, 1, "EUR", 70, "KY-3391"),
      cust("Aksa Tekstil A.Ş.", "satinalma@aksa.com.tr", "aksa.com.tr", 1, 0, "EUR", 0.25, "AK-1102"),
      cust("Nordic Home Interiors", "buying@nordichome.se", "nordichome.se", 1, 0, "EUR", 3, null),
      cust("AutoTrim OEM Supply", "rfq@autotrim-oem.com", "autotrim-oem.com", 1, 0, "USD", 35, "AT-7788"),
      cust("Coastal Interiors Ltd", "orders@coastalinteriors.co.uk", "coastalinteriors.co.uk", 1, 0, "GBP", 4, null),
      cust("Meridian Textiles", "purchasing@meridiantex.com", "meridiantex.com", 1, 0, "USD", 85, null),
      cust("Aegean Supplies", "info@aegeansupplies.gr", "aegeansupplies.gr", 1, 0, "USD", 8, null)
    ];

    var gaps = [
      gap("g1", "Acoustic felt 400gsm, charcoal, with a stated NRC rating", 7, "open", 2, "acoustic-felt-400-charcoal-nrc", "demo-5"),
      gap("g2", "Microfibre cloth 40×40, laser-cut edge, anthracite shade", 5, "open", 1, "microfibre-40-lasercut-anthracite", "demo-1"),
      gap("g3", "Automotive headliner 3mm, foam-backed", 4, "open", 6, "auto-headliner-3mm-foam", "demo-7"),
      gap("g4", "PET felt 220gsm, fire-retardant (FR) treated", 3, "open", 1, "pet-felt-220-fr", "demo-3"),
      gap("g5", "Spunlace wipe 60gsm, aperture pattern, unbleached", 3, "resolved", 14, "spunlace-60-aperture-unbleached", "demo-8"),
      gap("g6", "Antibacterial microfibre, silver-ion finish", 2, "ignored", 30, "antibacterial-microfibre-silver", null)
    ];

    var resolutions = [
      res("r1", "haskece-220-black-165", "OK0220SD1659H915", "sales@example.com", "demo-6", "console", 18),
      res("r2", "microfibre-40-blue-320", "MF-320-BL-40", "auto-pipeline", "demo-9", "auto", 44),
      res("r3", "spunlace-60-aperture", "SL-060-AP", "sales@example.com", "demo-8", "console", 11),
      res("r4", "floor-felt-300-grey", "FL-300-GY", "sales@example.com", "demo-10", "console", 60),
      res("r5", "haskece-220-black-165", "OK0220SD1659H915", "auto-pipeline", "demo-14", "auto", 119)
    ];

    return { quotes: quotes, customers: customers, gaps: gaps, resolutions: resolutions };
  }

  // Compact builder for the sent/decided history quotes.
  function qSent(id, customer, createdDays, total, currency, tier, conf, margin, outcome, decidedDays, note, sku, product, outcomeNote) {
    var sentAt = daysAgo(createdDays - 1, 16, 5); // ~1 day turnaround
    return {
      id: id, owner: "demo", customer: customer,
      created_at: daysAgo(createdDays, 10, 20), status: "sent", currency: currency,
      total: total, grand_total_vadeli: null,
      margin_pct: margin, match_confidence: conf, autonomy_tier: tier,
      needs_approval: false, approved_by: "sales@example.com", approved_at: daysAgo(createdDays, 10, 40),
      sent_at: sentAt, sent_by: "sales@example.com",
      outcome: outcome, outcome_at: (outcome === "won" || outcome === "lost") ? daysAgo(decidedDays, 12) : null,
      outcome_note: outcomeNote || null, unmatched_lines: [], gmail_draft_id: "r-" + id,
      last_reply_text: null,
      output: {
        match_confidence: conf,
        quote_text: "Quotation for " + customer + " — " + product + ".",
        lines: [
          { ref: "1", product_name: product, spec: "", colors: "", sku: sku, status: "priced",
            confidence: conf, qty: null, qty_unit: "", unit_cash: "", unit_term: "",
            total_cash: total, total_term: null, match_reason: note, candidates: [] }
        ]
      },
      thread_snapshot: [
        { from: "buyer", direction: "inbound", date: daysAgo(createdDays, 9, 55), body: note }
      ]
    };
  }

  function cust(name, email, domain, quotes, orders, cur, lastSeenDays, sap, prefs) {
    return {
      id: "c-" + name.replace(/\W+/g, "").toLowerCase(), owner: "demo", name: name, email: email, domain: domain,
      quote_count: quotes, order_count: orders, currency_pref: cur, sap_code: sap || null,
      first_seen: daysAgo(180, 9), last_seen: daysAgo(lastSeenDays, 11),
      preferences: prefs || {}, history: []
    };
  }
  function gap(id, description, count, status, lastDays, sig, exampleId) {
    return {
      id: id, owner: "demo", description: description, count: count, status: status,
      last_requested: daysAgo(lastDays, 10), request_signature: sig, example_quote_id: exampleId
    };
  }
  function res(id, sig, sku, by, quoteId, source, days) {
    return {
      id: id, owner: "demo", request_signature: sig, chosen_sku: sku, chosen_by: by,
      quote_id: quoteId, source: source, created_at: daysAgo(days, 13)
    };
  }

  function data() { if (!_cache) _cache = build(); return _cache; }

  // ── public API ──────────────────────────────────────────────────────────────
  window.QWDemo = {
    isOn: function () { try { return sessionStorage.getItem(KEY) === "1"; } catch (e) { return false; } },
    enable: function () { try { sessionStorage.setItem(KEY, "1"); } catch (e) {} },
    disable: function () { try { sessionStorage.removeItem(KEY); } catch (e) {} },
    quotes: function () { return clone(data().quotes); },
    customers: function () { return clone(data().customers); },
    gaps: function () { return clone(data().gaps); },
    resolutions: function () { return clone(data().resolutions); },
    // The quote the tour opens in the workspace drawer.
    tourQuoteId: "demo-1"
  };
})();
