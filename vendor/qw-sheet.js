/* qw-sheet.js — self-hosted spreadsheet reader for the Quotewright onboarding page.
   No CDN, no dependencies, no eval → satisfies the site CSP (script-src 'self').
   Exposes window.QWSheet.read(File) -> Promise<{ header:[string], rows:[[string]] }>.
   Supports .csv / .tsv (robust RFC-4180-ish parser, delimiter auto-detect) and
   .xlsx (real ZIP + raw-DEFLATE inflate + XML via DOMParser).

   The DEFLATE inflate is a faithful port of tinf (Jorgen Ibsen, public domain). */
(function (root) {
  "use strict";

  /* ============================ raw DEFLATE (tinf) ============================ */
  function Tree() { this.table = new Uint16Array(16); this.trans = new Uint16Array(288); }
  function Data(source) {
    this.s = source; this.i = 0; this.t = 0; this.bitcount = 0;
    this.dest = []; this.ltree = new Tree(); this.dtree = new Tree();
  }
  var sltree = new Tree(), sdtree = new Tree();
  var length_bits = new Uint8Array(30), length_base = new Uint16Array(30);
  var dist_bits = new Uint8Array(30), dist_base = new Uint16Array(30);
  var clcidx = new Uint8Array([16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15]);
  var code_tree = new Tree();
  var lengths = new Uint8Array(288 + 32);

  function build_bits_base(bits, base, delta, first) {
    var i, sum;
    for (i = 0; i < delta; ++i) bits[i] = 0;
    for (i = 0; i < 30 - delta; ++i) bits[i + delta] = (i / delta) | 0;
    for (sum = first, i = 0; i < 30; ++i) { base[i] = sum; sum += 1 << bits[i]; }
  }
  function build_fixed_trees(lt, dt) {
    var i;
    for (i = 0; i < 7; ++i) lt.table[i] = 0;
    lt.table[7] = 24; lt.table[8] = 152; lt.table[9] = 112;
    for (i = 0; i < 24; ++i) lt.trans[i] = 256 + i;
    for (i = 0; i < 144; ++i) lt.trans[24 + i] = i;
    for (i = 0; i < 8; ++i) lt.trans[24 + 144 + i] = 280 + i;
    for (i = 0; i < 112; ++i) lt.trans[24 + 144 + 8 + i] = 144 + i;
    for (i = 0; i < 5; ++i) dt.table[i] = 0;
    dt.table[5] = 32;
    for (i = 0; i < 32; ++i) dt.trans[i] = i;
  }
  function build_tree(t, src, off, num) {
    var offs = new Uint16Array(16), i, sum;
    for (i = 0; i < 16; ++i) t.table[i] = 0;
    for (i = 0; i < num; ++i) t.table[src[off + i]]++;
    t.table[0] = 0;
    for (sum = 0, i = 0; i < 16; ++i) { offs[i] = sum; sum += t.table[i]; }
    for (i = 0; i < num; ++i) { if (src[off + i]) t.trans[offs[src[off + i]]++] = i; }
  }
  function getbit(d) {
    if (d.bitcount === 0) { d.t = d.s[d.i++]; d.bitcount = 8; }
    var bit = d.t & 1; d.t >>= 1; d.bitcount--; return bit;
  }
  function read_bits(d, num, base) {
    var val = 0;
    for (var i = 0; i < num; ++i) val |= getbit(d) << i;
    return val + base;
  }
  function decode_symbol(d, t) {
    var sum = 0, cur = 0, len = 0;
    do { cur = 2 * cur + getbit(d); ++len; sum += t.table[len]; cur -= t.table[len]; } while (cur >= 0);
    return t.trans[sum + cur];
  }
  function decode_trees(d, lt, dt) {
    var hlit = read_bits(d, 5, 257), hdist = read_bits(d, 5, 1), hclen = read_bits(d, 4, 4);
    var i, num, length;
    for (i = 0; i < 19; ++i) lengths[i] = 0;
    for (i = 0; i < hclen; ++i) lengths[clcidx[i]] = read_bits(d, 3, 0);
    build_tree(code_tree, lengths, 0, 19);
    for (num = 0; num < hlit + hdist;) {
      var sym = decode_symbol(d, code_tree);
      switch (sym) {
        case 16: var prev = lengths[num - 1]; for (length = read_bits(d, 2, 3); length; --length) lengths[num++] = prev; break;
        case 17: for (length = read_bits(d, 3, 3); length; --length) lengths[num++] = 0; break;
        case 18: for (length = read_bits(d, 7, 11); length; --length) lengths[num++] = 0; break;
        default: lengths[num++] = sym; break;
      }
    }
    build_tree(lt, lengths, 0, hlit);
    build_tree(dt, lengths, hlit, hdist);
  }
  function inflate_block_data(d, lt, dt) {
    while (1) {
      var sym = decode_symbol(d, lt);
      if (sym === 256) return;
      if (sym < 256) { d.dest.push(sym); }
      else {
        var length, dist, offs, i;
        sym -= 257;
        length = read_bits(d, length_bits[sym], length_base[sym]);
        dist = decode_symbol(d, dt);
        offs = d.dest.length - read_bits(d, dist_bits[dist], dist_base[dist]);
        for (i = offs; i < offs + length; ++i) d.dest.push(d.dest[i]);
      }
    }
  }
  function inflate_uncompressed_block(d) {
    d.bitcount = 0; // discard remaining bits of the current byte → align to byte boundary
    var length = d.s[d.i] | (d.s[d.i + 1] << 8);
    d.i += 4; // skip LEN + NLEN
    for (var k = 0; k < length; ++k) d.dest.push(d.s[d.i++]);
  }
  function inflateRaw(source) {
    var d = new Data(source), bfinal, btype;
    do {
      bfinal = getbit(d);
      btype = read_bits(d, 2, 0);
      if (btype === 0) inflate_uncompressed_block(d);
      else if (btype === 1) inflate_block_data(d, sltree, sdtree);
      else if (btype === 2) { decode_trees(d, d.ltree, d.dtree); inflate_block_data(d, d.ltree, d.dtree); }
      else throw new Error("Unsupported DEFLATE block");
    } while (!bfinal);
    return Uint8Array.from(d.dest);
  }
  build_fixed_trees(sltree, sdtree);
  build_bits_base(length_bits, length_base, 4, 3);
  build_bits_base(dist_bits, dist_base, 2, 1);
  length_bits[28] = 0; length_base[28] = 258;

  /* ============================ ZIP reader (xlsx) ============================ */
  function u16(dv, o) { return dv.getUint16(o, true); }
  function u32(dv, o) { return dv.getUint32(o, true); }

  function unzip(buf) {
    var bytes = new Uint8Array(buf), dv = new DataView(buf), files = {};
    // find End Of Central Directory (0x06054b50), scanning back from the end
    var eocd = -1;
    for (var p = bytes.length - 22; p >= 0; --p) {
      if (u32(dv, p) === 0x06054b50) { eocd = p; break; }
    }
    if (eocd < 0) throw new Error("Not a valid .xlsx (no ZIP directory).");
    var count = u16(dv, eocd + 10);
    var cdOff = u32(dv, eocd + 16);
    var o = cdOff;
    for (var n = 0; n < count; ++n) {
      if (u32(dv, o) !== 0x02014b50) break;
      var method = u16(dv, o + 10);
      var compSize = u32(dv, o + 20);
      var nameLen = u16(dv, o + 28);
      var extraLen = u16(dv, o + 30);
      var commLen = u16(dv, o + 32);
      var lho = u32(dv, o + 42);
      var name = utf8(bytes.subarray(o + 46, o + 46 + nameLen));
      // jump to the local header to find where the data actually starts
      var lNameLen = u16(dv, lho + 26);
      var lExtraLen = u16(dv, lho + 28);
      var dataStart = lho + 30 + lNameLen + lExtraLen;
      var comp = bytes.subarray(dataStart, dataStart + compSize);
      files[name] = (method === 0) ? comp : inflateRaw(comp);
      o += 46 + nameLen + extraLen + commLen;
    }
    return files;
  }

  function utf8(u8) {
    if (typeof TextDecoder !== "undefined") return new TextDecoder("utf-8").decode(u8);
    var s = "";
    for (var i = 0; i < u8.length; ++i) s += String.fromCharCode(u8[i]);
    try { return decodeURIComponent(escape(s)); } catch (e) { return s; }
  }

  function colToIndex(ref) { // "AB12" -> 27 (0-based column)
    var c = 0;
    for (var i = 0; i < ref.length; ++i) {
      var ch = ref.charCodeAt(i);
      if (ch >= 65 && ch <= 90) c = c * 26 + (ch - 64);
      else break;
    }
    return c - 1;
  }

  function parseXlsx(buf) {
    var files = unzip(buf);
    var parser = new DOMParser();

    // shared strings (optional)
    var shared = [];
    var ssName = Object.keys(files).find(function (k) { return /xl\/sharedStrings\.xml$/i.test(k); });
    if (ssName) {
      var ssDoc = parser.parseFromString(utf8(files[ssName]), "application/xml");
      var si = ssDoc.getElementsByTagName("si");
      for (var s = 0; s < si.length; ++s) shared.push(si[s].textContent);
    }

    // pick the first worksheet (lowest sheetN.xml)
    var sheetNames = Object.keys(files).filter(function (k) { return /xl\/worksheets\/[^/]+\.xml$/i.test(k); }).sort();
    if (!sheetNames.length) throw new Error("No worksheet found in the .xlsx.");
    var doc = parser.parseFromString(utf8(files[sheetNames[0]]), "application/xml");

    var rowsEl = doc.getElementsByTagName("row");
    var grid = [], maxCols = 0;
    for (var r = 0; r < rowsEl.length; ++r) {
      var cells = rowsEl[r].getElementsByTagName("c");
      var rowArr = [];
      for (var c = 0; c < cells.length; ++c) {
        var cell = cells[c];
        var ref = cell.getAttribute("r") || "";
        var ci = ref ? colToIndex(ref) : c;
        var t = cell.getAttribute("t");
        var val = "";
        if (t === "s") { // shared string index
          var vEl = cell.getElementsByTagName("v")[0];
          var idx = vEl ? parseInt(vEl.textContent, 10) : NaN;
          val = (!isNaN(idx) && shared[idx] != null) ? shared[idx] : "";
        } else if (t === "inlineStr") {
          val = cell.textContent;
        } else { // numeric, boolean, str
          var v2 = cell.getElementsByTagName("v")[0];
          val = v2 ? v2.textContent : cell.textContent;
        }
        if (ci < 0) ci = rowArr.length;
        rowArr[ci] = val == null ? "" : String(val);
        if (ci + 1 > maxCols) maxCols = ci + 1;
      }
      grid.push(rowArr);
    }
    // normalize width, drop fully-empty leading rows
    var out = grid.map(function (row) {
      var a = [];
      for (var i = 0; i < maxCols; ++i) a[i] = row[i] == null ? "" : row[i];
      return a;
    });
    return gridToTable(out);
  }

  /* ============================ CSV / TSV ============================ */
  function detectDelim(text) {
    // sample the first non-empty line, count separators outside quotes
    var line = "", i = 0, inQ = false;
    for (; i < text.length; ++i) {
      var ch = text[i];
      if (ch === '"') inQ = !inQ;
      if ((ch === "\n" || ch === "\r") && !inQ) { if (line.trim()) break; else { line = ""; continue; } }
      line += ch;
    }
    var counts = { ",": 0, ";": 0, "\t": 0 };
    inQ = false;
    for (i = 0; i < line.length; ++i) {
      var c = line[i];
      if (c === '"') inQ = !inQ;
      else if (!inQ && counts[c] != null) counts[c]++;
    }
    var best = ",", bestN = -1;
    Object.keys(counts).forEach(function (k) { if (counts[k] > bestN) { bestN = counts[k]; best = k; } });
    return best;
  }

  function parseCsv(text) {
    if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1); // strip BOM
    var delim = detectDelim(text);
    var rows = [], field = "", row = [], inQ = false, fieldStart = true, i = 0, n = text.length;
    while (i < n) {
      var ch = text[i];
      if (inQ) {
        if (ch === '"') {
          if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
          inQ = false; i++; continue; // closing quote; any trailing chars appended literally
        }
        field += ch; i++; continue;
      }
      if (ch === '"' && fieldStart) { inQ = true; fieldStart = false; i++; continue; }
      if (ch === delim) { row.push(field); field = ""; fieldStart = true; i++; continue; }
      if (ch === "\r") { i++; continue; }
      if (ch === "\n") { row.push(field); rows.push(row); row = []; field = ""; fieldStart = true; i++; continue; }
      field += ch; fieldStart = false; i++;
    }
    if (field !== "" || row.length) { row.push(field); rows.push(row); }
    return gridToTable(rows);
  }

  /* ============================ shared ============================ */
  function gridToTable(grid) {
    // first row that has any non-empty cell is the header
    var start = 0;
    while (start < grid.length && !grid[start].some(function (v) { return String(v).trim() !== ""; })) start++;
    var header = (grid[start] || []).map(function (h) { return String(h == null ? "" : h).trim(); });
    var rows = [];
    for (var r = start + 1; r < grid.length; ++r) {
      var row = grid[r];
      if (!row || !row.some(function (v) { return String(v).trim() !== ""; })) continue; // skip blank rows
      var a = [];
      for (var c = 0; c < header.length; ++c) a[c] = row[c] == null ? "" : String(row[c]).trim();
      rows.push(a);
    }
    return { header: header, rows: rows };
  }

  function read(file) {
    var name = (file.name || "").toLowerCase();
    var isXlsx = /\.xlsx$/.test(name) || file.type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    return new Promise(function (resolve, reject) {
      var fr = new FileReader();
      fr.onerror = function () { reject(new Error("Could not read the file.")); };
      if (isXlsx) {
        fr.onload = function () {
          try { resolve(parseXlsx(fr.result)); }
          catch (e) { reject(e); }
        };
        fr.readAsArrayBuffer(file);
      } else if (/\.xls$/.test(name)) {
        reject(new Error("Old .xls format isn’t supported — open it in Excel and Save As .xlsx or .csv."));
      } else {
        fr.onload = function () {
          try { resolve(parseCsv(fr.result)); }
          catch (e) { reject(e); }
        };
        fr.readAsText(file);
      }
    });
  }

  root.QWSheet = { read: read, parseCsv: parseCsv, inflateRaw: inflateRaw };
})(window);
