/* onboarding.js — Quotewright self-serve catalogue onboarding.
   Upload cost/price Excel or CSV → auto-map to the loader columns → review &
   flag → export a cleaned, loader-ready CSV. All client-side (CSP: script-src 'self').
   Parsing engine: vendor/qw-sheet.js (self-hosted, no CDN). */
(function () {
  "use strict";
  var el = function (id) { return document.getElementById(id); };

  // ── the Hassan Products Loader column order (44 columns, exact) ─────────────
  var LOADER_COLS = [
    "sku", "product_line", "is_microfiber", "data_complete", "urun_adi", "grup",
    "musteri_kod", "source_sheet", "birim", "gsm", "cloth_size", "en_cm", "boy_cm",
    "color", "edge_type", "pieces_per_pack", "packs_per_box", "palet_koli",
    "m2_per_pack", "gr_per_pack", "uretim_m2", "cost_tl", "cost_usd", "cost_eur",
    "cost_usd_kg", "converting_tl", "converting_usd", "converting_eur", "amb_isc_tl",
    "kumas_maliyet_kg", "kumas_maliyet_paket", "ambalaj_maliyet", "maliyet_pack_usd",
    "satis_eur", "satis_usd", "satis_usd_vadeli", "pesin_pack_usd", "vadeli_pack_usd",
    "vadeli_gun", "guncel_kar_orani", "hammadde_orani", "hammadde_eur", "firma", "esas_kod"
  ];
  // friendly labels for the map table
  var LABELS = {
    sku: "SKU / stock code", product_line: "Product line", is_microfiber: "Is microfiber",
    data_complete: "Data complete", urun_adi: "Product name", grup: "Group",
    musteri_kod: "Customer code", source_sheet: "Source sheet", birim: "Unit", gsm: "GSM",
    cloth_size: "Cloth size", en_cm: "Width (cm)", boy_cm: "Length (cm)", color: "Colour",
    edge_type: "Edge type", pieces_per_pack: "Pieces / pack", packs_per_box: "Packs / box",
    palet_koli: "Boxes / pallet", m2_per_pack: "m² / pack", gr_per_pack: "g / pack",
    uretim_m2: "Production m²", cost_tl: "Cost TL", cost_usd: "Cost USD", cost_eur: "Cost EUR",
    cost_usd_kg: "Cost USD/kg", converting_tl: "Converting TL", converting_usd: "Converting USD",
    converting_eur: "Converting EUR", amb_isc_tl: "Packaging labour TL", kumas_maliyet_kg: "Fabric cost/kg",
    kumas_maliyet_paket: "Fabric cost/pack", ambalaj_maliyet: "Packaging cost", maliyet_pack_usd: "Cost/pack USD",
    satis_eur: "Sale EUR/m²", satis_usd: "Sale USD (cash)", satis_usd_vadeli: "Sale USD (term)",
    pesin_pack_usd: "Cash /pack USD", vadeli_pack_usd: "Term /pack USD", vadeli_gun: "Term days",
    guncel_kar_orani: "Margin ratio", hammadde_orani: "Raw-material ratio", hammadde_eur: "Raw material EUR",
    firma: "Company", esas_kod: "Main code"
  };
  // alias vocabulary (English + Turkish) used to auto-detect the mapping
  var ALIASES = {
    sku: ["sku", "stokkodu", "stok", "stokno", "productcode", "urunkodu", "code", "kod", "material", "malzeme", "itemcode", "artikel"],
    product_line: ["productline", "urungrubu", "line", "urunhatti", "seri", "series"],
    is_microfiber: ["ismicrofiber", "microfiber", "mikrofiber", "mikro"],
    data_complete: ["datacomplete", "complete", "veritamam", "tamam"],
    urun_adi: ["urunadi", "productname", "name", "description", "aciklama", "tanim", "urun", "product", "item", "malzemeadi"],
    grup: ["grup", "group", "category", "kategori"],
    musteri_kod: ["musterikod", "customercode", "musterikodu", "custcode"],
    source_sheet: ["sourcesheet", "sheet", "kaynak", "sayfa"],
    birim: ["birim", "unit", "uom", "olcubirimi"],
    gsm: ["gsm", "gramaj", "weight", "grm2", "gramaggsm", "agirlik"],
    cloth_size: ["clothsize", "ebat", "size", "olcu", "boyut"],
    en_cm: ["encm", "width", "widthcm", "genislik", "en"],
    boy_cm: ["boycm", "length", "lengthcm", "uzunluk", "boy"],
    color: ["color", "colour", "renk"],
    edge_type: ["edgetype", "edge", "kenar", "overlok", "kenartipi"],
    pieces_per_pack: ["piecesperpack", "pcsperpack", "adet", "pcs", "piece", "adetpaket", "pieces", "adetpk"],
    packs_per_box: ["packsperbox", "paketkoli", "packs", "paketbox", "pkkoli"],
    palet_koli: ["paletkoli", "palletbox", "palet", "pallet", "koliadet"],
    m2_per_pack: ["m2perpack", "m2pack", "m2paket", "areaperpack", "m2pk"],
    gr_per_pack: ["grperpack", "grampack", "grpaket", "gpack"],
    uretim_m2: ["uretimm2", "productionm2", "prodm2"],
    cost_tl: ["costtl", "maliyettl", "tlmaliyet"],
    cost_usd: ["costusd", "maliyetusd", "usdmaliyet"],
    cost_eur: ["costeur", "maliyeteur", "eurmaliyet"],
    cost_usd_kg: ["costusdkg", "usdkgmaliyet", "maliyetusdkg"],
    converting_tl: ["convertingtl", "cevirmetl"],
    converting_usd: ["convertingusd", "cevirmeusd"],
    converting_eur: ["convertingeur", "cevirmeeur"],
    amb_isc_tl: ["ambisctl", "ambalajiscilik", "ambalajisciliktl", "isciliktl"],
    kumas_maliyet_kg: ["kumasmaliyetkg", "fabriccostkg", "kumaskg"],
    kumas_maliyet_paket: ["kumasmaliyetpaket", "fabriccostpack", "kumaspaket"],
    ambalaj_maliyet: ["ambalajmaliyet", "packagingcost", "ambalaj"],
    maliyet_pack_usd: ["maliyetpackusd", "costpackusd", "maliyetpaketusd"],
    satis_eur: ["satiseur", "saleeur", "saleseur", "priceeur", "eur", "fiyateur", "satisfiyatieur", "listeeur"],
    satis_usd: ["satisusd", "saleusd", "salesusd", "priceusd", "usd", "fiyatusd", "pesinusd", "cashusd"],
    satis_usd_vadeli: ["satisusdvadeli", "vadeliusd", "termusd", "satisusdterm"],
    pesin_pack_usd: ["pesinpackusd", "pesinpaketusd", "cashpackusd"],
    vadeli_pack_usd: ["vadelipackusd", "vadelipaketusd", "termpackusd"],
    vadeli_gun: ["vadeligun", "termdays", "vade", "vadegun"],
    guncel_kar_orani: ["guncelkarorani", "margin", "karorani", "kar", "marj", "profit"],
    hammadde_orani: ["hammaddeorani", "rawmaterialratio", "hammaddeoran"],
    hammadde_eur: ["hammaddeeur", "rawmaterialeur", "hammaddeeuro"],
    firma: ["firma", "company", "musteri", "customer"],
    esas_kod: ["esaskod", "maincode", "anakod", "parentcode", "esaskodu"]
  };

  // Turkish-fold + strip to alnum for header comparison
  function norm(s) {
    return String(s == null ? "" : s).toLowerCase()
      .replace(/ı/g, "i").replace(/İ/g, "i").replace(/ş/g, "s").replace(/ç/g, "c")
      .replace(/ğ/g, "g").replace(/ö/g, "o").replace(/ü/g, "u")
      .replace(/[^a-z0-9]/g, "");
  }

  var table = null;        // { header, rows }
  var mapping = {};        // loaderCol -> source header index (or -1)

  // ── auto-map: best source header per loader column, each source used once ──
  function autoMap(header) {
    var normed = header.map(norm);
    var used = {};
    var map = {};
    LOADER_COLS.forEach(function (col) {
      var aliases = ALIASES[col] || [];
      var candidates = [col].concat(aliases).map(norm);
      var best = -1, bestScore = 0;
      for (var i = 0; i < normed.length; i++) {
        if (used[i] || !normed[i]) continue;
        var h = normed[i], score = 0;
        for (var a = 0; a < candidates.length; a++) {
          var cand = candidates[a];
          if (!cand) continue;
          if (h === cand) score = Math.max(score, 100);
          else if (h === "satis" + cand || cand === h) score = Math.max(score, 90);
          else if (h.indexOf(cand) === 0 || cand.indexOf(h) === 0) score = Math.max(score, 70);
          else if (h.indexOf(cand) !== -1 && cand.length >= 3) score = Math.max(score, 45);
        }
        if (score > bestScore) { bestScore = score; best = i; }
      }
      if (best >= 0 && bestScore >= 45) { map[col] = best; used[best] = true; }
      else map[col] = -1;
    });
    return map;
  }

  function cell(row, col) {
    var idx = mapping[col];
    return (idx != null && idx >= 0 && row[idx] != null) ? String(row[idx]).trim() : "";
  }
  function numish(v) {
    if (v == null || v === "") return null;
    var s = String(v).replace(/[^\d.,-]/g, "");
    // handle European decimals: "1.234,56" -> 1234.56 ; "1,367" -> 1.367 when it's the only separator
    if (s.indexOf(",") !== -1 && s.indexOf(".") !== -1) s = s.replace(/\./g, "").replace(",", ".");
    else if (s.indexOf(",") !== -1) s = s.replace(",", ".");
    var n = parseFloat(s);
    return isNaN(n) ? null : n;
  }

  // ── build the cleaned records + row flags ──────────────────────────────────
  function buildRecords() {
    return table.rows.map(function (row) {
      var rec = {};
      LOADER_COLS.forEach(function (col) { rec[col] = cell(row, col); });

      // derive data_complete when the source didn't supply it: complete if a real sale price exists
      var hasPrice = numish(rec.satis_eur) != null || numish(rec.satis_usd) != null;
      if (!rec.data_complete) rec.data_complete = hasPrice ? "YES" : "NO";
      else rec.data_complete = /^(y|yes|true|1|evet|tamam)/i.test(rec.data_complete) ? "YES" : "NO";

      // normalise is_microfiber to true/false text when present
      if (rec.is_microfiber) rec.is_microfiber = /^(y|yes|true|1|evet|mikro|micro)/i.test(rec.is_microfiber) ? "true" : "false";

      var flags = [];
      if (!rec.sku) flags.push({ k: "no-sku", msg: "Missing SKU — cannot be loaded" });
      if (!rec.urun_adi) flags.push({ k: "no-name", msg: "No product name" });
      if (!hasPrice) flags.push({ k: "no-price", msg: "No sale price — data incomplete" });
      rec.__flags = flags;
      rec.__hasPrice = hasPrice;
      return rec;
    });
  }

  // ── render: map table ──────────────────────────────────────────────────────
  function esc(s) {
    return (s == null ? "" : String(s)).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }
  function optionsFor(selectedIdx) {
    var out = '<option value="-1"' + (selectedIdx < 0 ? " selected" : "") + ">— not in file —</option>";
    for (var i = 0; i < table.header.length; i++) {
      out += '<option value="' + i + '"' + (i === selectedIdx ? " selected" : "") + ">" +
        esc(table.header[i] || ("Column " + (i + 1))) + "</option>";
    }
    return out;
  }
  function renderMap() {
    el("mapBody").innerHTML = LOADER_COLS.map(function (col) {
      var idx = mapping[col];
      var sample = "";
      if (idx >= 0) { for (var r = 0; r < table.rows.length; r++) { if (table.rows[r][idx]) { sample = table.rows[r][idx]; break; } } }
      var req = col === "sku";
      var sel = '<select class="ob-msel" data-col="' + col + '">' + optionsFor(idx) + "</select>";
      return "<tr" + (req ? ' class="req"' : "") + (idx < 0 && req ? ' data-missing="1"' : "") + ">" +
        '<td class="ob-mcol">' + esc(LABELS[col] || col) + (req ? ' <span class="ob-req">required</span>' : "") +
        '<span class="ob-mkey">' + esc(col) + "</span></td>" +
        '<td class="ob-marrow" aria-hidden="true">→</td>' +
        "<td>" + sel + (idx >= 0 ? '<span class="ob-mok" title="matched">●</span>' : "") + "</td>" +
        '<td class="num ob-msample">' + esc(sample || "—") + "</td>" +
      "</tr>";
    }).join("");
  }

  // ── render: stats + preview ────────────────────────────────────────────────
  var PREVIEW_MAX = 60;
  function renderReview() {
    var recs = buildRecords();
    var total = recs.length;
    var loadable = recs.filter(function (r) { return r.sku; }).length;
    var incomplete = recs.filter(function (r) { return r.data_complete === "NO"; }).length;
    var mapped = LOADER_COLS.filter(function (c) { return mapping[c] >= 0; }).length;

    el("obStats").innerHTML = [
      { n: total, l: "Rows read" },
      { n: loadable, l: "Loadable (have SKU)", warn: loadable < total },
      { n: mapped + " / 44", l: "Columns mapped" },
      { n: incomplete, l: "Data incomplete", warn: incomplete > 0, sub: "priced by sales team" }
    ].map(function (s) {
      return '<div class="ob-stat' + (s.warn ? " warn" : "") + '"><div class="n">' + esc(s.n) + "</div><div class=\"l\">" + esc(s.l) +
        "</div>" + (s.sub ? '<div class="sub">' + esc(s.sub) + "</div>" : "") + "</div>";
    }).join("");

    var shown = recs.slice(0, PREVIEW_MAX);
    el("previewBody").innerHTML = shown.map(function (r) {
      var status, cls;
      if (!r.sku) { status = "Not loadable"; cls = "bad"; }
      else if (r.data_complete === "NO") { status = "Incomplete"; cls = "warn"; }
      else { status = "Ready"; cls = "ok"; }
      var title = r.__flags.map(function (f) { return f.msg; }).join(" · ");
      return "<tr" + (title ? ' title="' + esc(title) + '"' : "") + (cls === "bad" ? ' class="row-bad"' : "") + ">" +
        '<td class="ob-sku">' + (r.sku ? esc(r.sku) : '<span class="ob-mut">—</span>') + "</td>" +
        "<td>" + (esc(r.urun_adi) || '<span class="ob-mut">—</span>') + "</td>" +
        "<td>" + (esc(r.product_line) || '<span class="ob-mut">—</span>') + "</td>" +
        '<td class="num">' + (esc(r.gsm) || "—") + "</td>" +
        "<td>" + (esc(r.color) || "—") + "</td>" +
        '<td class="num">' + (esc(r.satis_eur) || "—") + "</td>" +
        '<td class="num">' + (esc(r.satis_usd) || "—") + "</td>" +
        "<td>" + (r.data_complete === "YES" ? '<span class="ob-badge ok">YES</span>' : '<span class="ob-badge warn">NO</span>') + "</td>" +
        '<td><span class="ob-badge ' + cls + '">' + status + "</span></td>" +
      "</tr>";
    }).join("");
    el("previewNote").textContent = total > PREVIEW_MAX
      ? "Showing first " + PREVIEW_MAX + " of " + total + " rows. The export includes every row."
      : "Showing all " + total + " rows.";

    return recs;
  }

  // ── CSV export in exact loader order ───────────────────────────────────────
  function csvField(v) {
    v = v == null ? "" : String(v);
    return /[",\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
  }
  function exportCsv() {
    var recs = buildRecords().filter(function (r) { return r.sku; }); // only loadable rows
    var lines = [LOADER_COLS.join(",")];
    recs.forEach(function (r) {
      lines.push(LOADER_COLS.map(function (c) { return csvField(r[c]); }).join(","));
    });
    var blob = new Blob([lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url; a.download = "quotewright-catalogue-loader.csv";
    document.body.appendChild(a); a.click();
    setTimeout(function () { document.body.removeChild(a); URL.revokeObjectURL(url); }, 0);
  }

  // ── flow control ───────────────────────────────────────────────────────────
  function setStep(n) {
    var items = el("obSteps").children;
    for (var i = 0; i < items.length; i++) {
      var s = Number(items[i].getAttribute("data-step"));
      items[i].classList.toggle("on", s <= n);
      items[i].classList.toggle("cur", s === n);
    }
  }
  function ingestTable(t, fileName) {
    if (!t || !t.header || !t.header.length) { showError("That file has no readable header row."); return; }
    table = t;
    mapping = autoMap(table.header);
    el("parseError").hidden = true;
    var tag = el("fileTag");
    tag.hidden = false;
    tag.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg> ' +
      esc(fileName || "spreadsheet") + ' — <b>' + table.rows.length + '</b> rows, ' + table.header.length + ' columns';
    el("mapCard").hidden = false;
    el("reviewCard").hidden = false;
    el("exportCard").hidden = false;
    el("orderCode").textContent = LOADER_COLS.join(",");
    renderMap();
    renderReview();
    setStep(4);
    el("mapCard").scrollIntoView({ behavior: "smooth", block: "start" });
  }
  function ingestFile(file) {
    if (!file) return;
    el("parseError").hidden = true;
    window.QWSheet.read(file).then(function (t) { ingestTable(t, file.name); })
      .catch(function (e) { showError((e && e.message) || "Could not read that file."); });
  }
  function ingestText(text, fileName) { // used by CSV paste / tests
    try { ingestTable(window.QWSheet.parseCsv(text), fileName || "pasted.csv"); }
    catch (e) { showError((e && e.message) || "Could not parse that text."); }
  }
  function showError(msg) {
    var e = el("parseError");
    e.hidden = false;
    e.textContent = msg;
  }
  function reset() {
    table = null; mapping = {};
    el("mapCard").hidden = true; el("reviewCard").hidden = true; el("exportCard").hidden = true;
    el("fileTag").hidden = true; el("parseError").hidden = true;
    el("file").value = "";
    setStep(1);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // ── wire up ────────────────────────────────────────────────────────────────
  function init() {
    var drop = el("drop"), input = el("file");
    if (!drop) return;
    drop.addEventListener("click", function (e) { if (e.target.closest && e.target.closest("#fileTag")) return; input.click(); });
    drop.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); input.click(); } });
    input.addEventListener("change", function () { if (input.files && input.files[0]) ingestFile(input.files[0]); });
    ["dragenter", "dragover"].forEach(function (ev) {
      drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add("over"); });
    });
    ["dragleave", "drop"].forEach(function (ev) {
      drop.addEventListener(ev, function (e) { e.preventDefault(); if (ev === "dragleave" && drop.contains(e.relatedTarget)) return; drop.classList.remove("over"); });
    });
    drop.addEventListener("drop", function (e) {
      if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]) ingestFile(e.dataTransfer.files[0]);
    });
    el("mapBody").addEventListener("change", function (e) {
      var sel = e.target.closest ? e.target.closest("select[data-col]") : null;
      if (!sel) return;
      mapping[sel.getAttribute("data-col")] = parseInt(sel.value, 10);
      renderMap(); renderReview();
    });
    el("exportBtn").addEventListener("click", exportCsv);
    el("resetBtn").addEventListener("click", reset);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();

  // test hook (used by the local verification harness; harmless in production)
  window.QWOnboard = { ingestText: ingestText, ingestTable: ingestTable, autoMap: autoMap, LOADER_COLS: LOADER_COLS };
})();
