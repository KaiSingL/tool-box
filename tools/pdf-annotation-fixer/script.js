(function () {
  const { PDFDocument, PDFName, PDFString, PDFHexString, PDFArray, PDFDict, rgb } = PDFLib;

  const state = {
    files: [], // { name, bytes, doc, items }
    fontBytes: null,
    fontName: "",
    fkFont: null,
    fontFace: null,
    fontFamily: "",
    fontObjectUrl: null,
    exporting: false,
    selected: new Set(),
  };

  const $ = (id) => document.getElementById(id);

  function looksChinese(s) {
    return /[\u4e00-\u9fff\u3400-\u4dbf]/.test(s || "");
  }
  function looksMojibake(s) {
    return /[À-ÿŒœŸƒˆ˜–—‘’“”•…€]/.test(s || "");
  }
  function cjkCount(s) {
    return (s.match(/[\u4e00-\u9fff\u3400-\u4dbf]/g) || []).length;
  }

  function bytesToUtf8(bytes, fatal) {
    return new TextDecoder("utf-8", { fatal: !!fatal }).decode(bytes);
  }

  // CP1252 0x80-0x9F display as either C1 controls (raw SQL/PDF)
  // or Unicode punctuation when copied from a webpage/SSMS grid.
  const CP1252_REVERSE = {
    0x20AC: 0x80, 0x201A: 0x82, 0x0192: 0x83, 0x201E: 0x84,
    0x2026: 0x85, 0x2020: 0x86, 0x2021: 0x87, 0x02C6: 0x88,
    0x2030: 0x89, 0x0160: 0x8A, 0x2039: 0x8B, 0x0152: 0x8C,
    0x017D: 0x8E, 0x2018: 0x91, 0x2019: 0x92, 0x201C: 0x93,
    0x201D: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97,
    0x02DC: 0x98, 0x2122: 0x99, 0x0161: 0x9A, 0x203A: 0x9B,
    0x0153: 0x9C, 0x017E: 0x9E, 0x0178: 0x9F
  };

  function charToByte(ch) {
    const c = ch.codePointAt(0);
    if (CP1252_REVERSE[c] != null) return CP1252_REVERSE[c];
    if (c <= 0xff) return c;
    return c & 0xff;
  }

  function stringToBytes(s) {
    const out = new Uint8Array(s.length);
    let i = 0;
    for (const ch of s) out[i++] = charToByte(ch);
    return out.subarray(0, i);
  }

  function recoverText(raw) {
    if (raw == null) return { recovered: "", method: "empty" };
    const s = String(raw);
    if (!s) return { recovered: "", method: "empty" };
    if (looksChinese(s) && !looksMojibake(s)) {
      return { recovered: s, method: "already-ok" };
    }

    const candidates = [];

    // Case 1 + Case 2 unified: raw C1 bytes AND copied punctuation
    try {
      candidates.push({
        recovered: bytesToUtf8(stringToBytes(s), true),
        method: "cp1252-or-raw-utf8"
      });
    } catch (e) {}

    // Fallback: raw low bytes only (no punctuation remap)
    try {
      const low = new Uint8Array(s.length);
      for (let i = 0; i < s.length; i++) low[i] = s.charCodeAt(i) & 0xff;
      candidates.push({ recovered: bytesToUtf8(low, true), method: "utf16-low-bytes" });
    } catch (e) {}

    // Fallback: double-encoded UTF-8
    try {
      const first = new TextEncoder().encode(s);
      const asLatin = new TextDecoder("latin1").decode(first);
      candidates.push({
        recovered: bytesToUtf8(stringToBytes(asLatin), true),
        method: "double-utf8"
      });
    } catch (e) {}

    let best = { recovered: s, method: "unchanged", score: cjkCount(s) };
    for (const c of candidates) {
      const score = cjkCount(c.recovered) * 10 - (looksMojibake(c.recovered) ? 20 : 0);
      if (score > best.score) best = Object.assign({}, c, { score: score });
    }
    return { recovered: best.recovered, method: best.method };
  }

  function pdfStringToText(obj) {
    if (!obj) return "";
    try {
      if (obj instanceof PDFString) return obj.decodeText();
      if (obj instanceof PDFHexString) return obj.decodeText();
      if (typeof obj.decodeText === "function") return obj.decodeText();
      if (typeof obj.asString === "function") return obj.asString();
    } catch (e) {}
    return String(obj);
  }

  function getAnnotSubtype(dict) {
    try {
      const st = dict.get(PDFName.of("Subtype"));
      return st ? st.toString().replace("/", "") : "Unknown";
    } catch (e) {
      return "Unknown";
    }
  }

  function stripRcText(rc) {
    if (!rc) return "";
    return String(rc)
      .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
      .replace(/<[^>]+>/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/\s+/g, " ")
      .trim();
  }

  function buildRcXml(oldRc, text) {
    const escaped = String(text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\n/g, "</p><p>");
    if (oldRc && /<body[\s\S]*<\/body>/.test(oldRc)) {
      return oldRc.replace(/<body([^>]*)>[\s\S]*<\/body>/,
        "<body$1><p>" + escaped + "</p></body>");
    }
    return '<?xml version="1.0"?><body xmlns="http://www.w3.org/1999/xhtml" xmlns:xfa="http://www.xfa.org/schema/xfa-data/1.0/" xfa:APIVersion="Acrobat:26.1.0" xfa:spec="2.0.2"><p>' + escaped + "</p></body>";
  }

  function collectAnnots(page, pageIndex) {
    const items = [];
    const node = page.node;
    let annots;
    try {
      annots = node.Annots();
    } catch (e) {
      return items;
    }
    if (!annots) return items;
    const arr = annots instanceof PDFArray ? annots : null;
    if (!arr) return items;
    for (let i = 0; i < arr.size(); i++) {
      let dict;
      try {
        dict = arr.lookup(i, PDFDict);
      } catch (e) {
        continue;
      }
      if (!dict) continue;
      const subtype = getAnnotSubtype(dict);
      if (subtype === "Stamp") continue;
      const contents = pdfStringToText(dict.lookup(PDFName.of("Contents")));
      const rcRaw = pdfStringToText(dict.lookup(PDFName.of("RC")));
      const hasRc = !!(dict.lookup(PDFName.of("RC")));
      const source = contents || stripRcText(rcRaw);
      if (!source && !hasRc) continue;
      const rec = recoverText(source);
      items.push({
        pageIndex,
        annotIndex: i,
        subtype,
        field: hasRc ? "Contents+RC" : "Contents",
        original: source,
        recovered: rec.recovered,
        method: rec.method,
        changed: rec.recovered !== source,
        hasRc: hasRc,
        rcRaw: rcRaw,
        dict,
      });
    }
    return items;
  }

  async function loadPdfFile(file) {
    const buf = await file.arrayBuffer();
    const bytes = new Uint8Array(buf);
    const doc = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
    const pages = doc.getPages();
    const items = [];
    pages.forEach((page, idx) => {
      items.push(...collectAnnots(page, idx));
    });
    return { name: file.name, bytes, doc, pageCount: pages.length, items, file };
  }

  function renderTable() {
    const tbody = $("tbody");
    const all = [];
    state.files.forEach((f, fi) => {
      f.items.forEach((it, ii) => all.push({ fi, ii, f, it }));
    });
    const emptyState = $("emptyState");
    const tableWrap = $("tableWrap");
    if (!all.length) {
      tbody.innerHTML = "";
      $("stats").textContent = "";
      if (emptyState) emptyState.classList.remove("hidden");
      if (tableWrap) tableWrap.classList.add("hidden");
      syncHeaderCheck();
      return;
    }
    if (emptyState) emptyState.classList.add("hidden");
    if (tableWrap) tableWrap.classList.remove("hidden");
    tbody.innerHTML = all
      .map(({ fi, ii, f, it }) => {
        const id = fi + ":" + ii;
        const checked = it.changed ? "checked" : "";
        return `<tr class="${it.changed ? "changed" : "same"}">
          <td><input type="checkbox" data-id="${id}" ${checked}></td>
          <td>${escapeHtml(f.name)}</td>
          <td>${it.pageIndex + 1}</td>
          <td>${escapeHtml(it.subtype)} / ${escapeHtml(it.field)}</td>
          <td class="orig" title="${escapeHtml(it.original)}">${escapeHtml(it.original)}</td>
          <td class="fix" title="${escapeHtml(it.recovered)}">${escapeHtml(it.recovered)}</td>
          <td class="method">${escapeHtml(it.method)}</td>
        </tr>`;
      })
      .join("");
    const changed = all.filter((x) => x.it.changed).length;
    $("stats").textContent =
      state.files.length + " PDF(s), " +
      state.files.reduce((n, f) => n + f.pageCount, 0) + " page(s), " +
      all.length + " annotation field(s), " +
      changed + " to fix.";
    syncHeaderCheck();
  }

  function escapeHtml(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function setStatus(msg, isErr) {
    const el = $("status");
    el.textContent = msg || "";
    el.className = isErr ? "status err" : "status";
    el.hidden = !msg;
  }

  async function handlePdfFiles(fileList) {
    const files = fileList.filter(function (f) {
      return /\.pdf$/i.test(f.name) || f.type === "application/pdf";
    });
    if (!files.length) {
      setStatus("Drop PDF files only.", true);
      return;
    }
    setStatus("Reading PDFs…");
    try {
      for (const file of files) {
        const loaded = await loadPdfFile(file);
        const existing = state.files.findIndex((x) => x.name === loaded.name);
        if (existing >= 0) state.files[existing] = loaded;
        else state.files.push(loaded);
      }
      renderTable();
      $("pdfDropTitle").textContent = state.files.length + " PDF loaded";
      $("pdfDropHint").textContent = state.files.map(function (f) { return f.name; }).join(", ");
      $("pdfDrop").classList.add("hasfile");
      setStatus("Loaded. Review recovered text, then export.");
    } catch (err) {
      console.error(err);
      setStatus("Failed to read PDF: " + err.message, true);
    }
  }

  async function handleFontFiles(fileList) {
    const file = fileList[0];
    if (!file) return;
    const name = file.name || "";
    if (/\.ttc$/i.test(name)) {
      setStatus("This looks like a .ttc collection. Please import a single .ttf or .otf file.", true);
      return;
    }
    if (!/\.(ttf|otf)$/i.test(name)) {
      setStatus("Drop a .ttf or .otf font file.", true);
      return;
    }
    state.fontBytes = new Uint8Array(await file.arrayBuffer());
    state.fontName = name;
    state.fkFont = null;
    state.fontFamily = "";
    if (state.fontObjectUrl) {
      try { URL.revokeObjectURL(state.fontObjectUrl); } catch (eRev) {}
      state.fontObjectUrl = null;
    }
    try {
      if (state.fontFace) {
        try { document.fonts.delete(state.fontFace); } catch (eDel) {}
      }
      const family = "AnnFixPF-" + Date.now();
      const buf = state.fontBytes.buffer.slice(
        state.fontBytes.byteOffset,
        state.fontBytes.byteOffset + state.fontBytes.byteLength
      );
      let face;
      try {
        face = new FontFace(family, buf);
        await face.load();
      } catch (eBuf) {
        const blob = new Blob([state.fontBytes], { type: /\.otf$/i.test(name) ? "font/otf" : "font/ttf" });
        state.fontObjectUrl = URL.createObjectURL(blob);
        face = new FontFace(family, "url(" + JSON.stringify(state.fontObjectUrl) + ")");
        await face.load();
      }
      document.fonts.add(face);
      try { await document.fonts.load("16px \"" + family + "\""); } catch (eLoad) {}
      state.fontFace = face;
      state.fontFamily = family;
    } catch (eFace) {
      console.warn("FontFace load failed", eFace);
      $("exportBtn").disabled = true;
      setStatus("Could not load this font in the browser: " + (eFace && eFace.message ? eFace.message : eFace), true);
      return;
    }
    $("fontLabel").textContent = name + " (" + Math.round(state.fontBytes.length / 1024) + " KB)";
    $("fontDrop").classList.add("hasfile");
    $("exportBtn").disabled = false;
    setStatus("Font loaded: " + name + ". Export is ready.");
  }

  function wireDrop(zoneId, inputId, handler) {
    const zone = $(zoneId);
    const input = $(inputId);
    zone.addEventListener("click", function () { input.click(); });
    zone.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); input.click(); }
    });
    ["dragenter", "dragover"].forEach(function (ev) {
      zone.addEventListener(ev, function (e) {
        e.preventDefault();
        e.stopPropagation();
        zone.classList.add("drag");
      });
    });
    zone.addEventListener("dragleave", function (e) {
      e.preventDefault();
      zone.classList.remove("drag");
    });
    zone.addEventListener("drop", function (e) {
      e.preventDefault();
      zone.classList.remove("drag");
      const files = e.dataTransfer && e.dataTransfer.files ? [...e.dataTransfer.files] : [];
      if (files.length) handler(files);
    });
    input.addEventListener("change", function (e) {
      const files = [...e.target.files];
      if (files.length) handler(files);
    });
  }

  ["dragover", "drop"].forEach(function (ev) {
    document.addEventListener(ev, function (e) { e.preventDefault(); });
  });
  wireDrop("pdfDrop", "pdfInput", handlePdfFiles);
  wireDrop("fontDrop", "fontInput", handleFontFiles);

  function rowChecks() {
    return document.querySelectorAll("#tbody input[type=checkbox][data-id]");
  }

  function syncHeaderCheck() {
    const head = $("checkAll");
    if (!head) return;
    const boxes = rowChecks();
    if (!boxes.length) {
      head.checked = false;
      head.indeterminate = false;
      head.hidden = true;
      return;
    }
    head.hidden = false;
    const n = Array.prototype.filter.call(boxes, function (b) { return b.checked; }).length;
    head.checked = n === boxes.length;
    head.indeterminate = n > 0 && n < boxes.length;
  }

  document.addEventListener("change", function (e) {
    const t = e.target;
    if (!t) return;
    if (t.id === "checkAll") {
      rowChecks().forEach(function (b) { b.checked = t.checked; });
      t.indeterminate = false;
      return;
    }
    if (t.matches && t.matches("#tbody input[type=checkbox][data-id]")) syncHeaderCheck();
  });

  document.addEventListener("click", function (e) {
    const cell = e.target.closest && e.target.closest("#tbody td.orig, #tbody td.fix");
    if (cell) cell.classList.toggle("expanded");
  });

  syncHeaderCheck();

  function selectedMap() {
    const map = new Map();
    document.querySelectorAll("#tbody input[type=checkbox]").forEach((box) => {
      const [fi, ii] = box.dataset.id.split(":").map(Number);
      if (!map.has(fi)) map.set(fi, new Set());
      if (box.checked) map.get(fi).add(ii);
    });
    return map;
  }

  
  function n6(v) {
    if (!isFinite(v)) return "0";
    return (Math.round(v * 10000) / 10000).toString();
  }

  function deleteKey(dict, name) {
    try {
      if (dict && typeof dict.delete === "function") dict.delete(PDFName.of(name));
    } catch (e) {}
  }

  function setPrintFlag(dict, doc) {
    let flags = 4;
    try {
      const cur = dict.get(PDFName.of("F"));
      if (cur && typeof cur.asNumber === "function") flags = cur.asNumber() | 4;
    } catch (e) {}
    try { dict.set(PDFName.of("F"), doc.context.obj(flags)); } catch (e2) {}
  }

  function writeContents(dict, text) {
    try {
      dict.set(PDFName.of("Contents"), PDFHexString.fromText(text));
      return;
    } catch (e) {}
    try {
      dict.set(PDFName.of("Contents"), PDFString.of(text));
    } catch (e2) {}
  }

  function annotRect(dict) {
    const out = { xa: 0, ya: 0, xb: 120, yb: 16, width: 120, height: 16 };
    try {
      const rectObj = dict.lookup(PDFName.of("Rect"));
      const nums = [];
      for (let k = 0; k < 4; k++) nums.push(rectObj.get(k).asNumber());
      out.xa = Math.min(nums[0], nums[2]);
      out.ya = Math.min(nums[1], nums[3]);
      out.xb = Math.max(nums[0], nums[2]);
      out.yb = Math.max(nums[1], nums[3]);
      out.width = Math.max(1, out.xb - out.xa);
      out.height = Math.max(1, out.yb - out.ya);
    } catch (e) {}
    return out;
  }

  function parseFontSize(dict) {
    let fontsize = 8;
    try {
      const da = pdfStringToText(dict.lookup(PDFName.of("DA"))) || "";
      const ping = da.match(/PingFang[^/\s]*\s+([0-9.]+)\s+Tf/i);
      if (ping) {
        const n = parseFloat(ping[1]);
        if (isFinite(n) && n > 0) return n;
      }
      const ms = da.match(/([0-9.]+)\s+Tf/g);
      if (ms && ms.length) {
        const last = parseFloat(ms[ms.length - 1].replace(/[^0-9.]/g, ""));
        if (isFinite(last) && last > 0) fontsize = last;
      }
    } catch (e) {}
    if (fontsize > 24) fontsize = 8;
    if (fontsize < 4) fontsize = 8;
    return fontsize;
  }

  function scanDaFonts(doc) {
    const ping = { size: 8, name: "PingFangTC-Regular" };
    const times = { size: 7, name: "TimesNewRomanPS-BoldMT" };
    let foundPing = false;
    let times7 = null;
    let timesOther = null;
    try {
      const pages = doc.getPages();
      for (let pi = 0; pi < pages.length; pi++) {
        let annots;
        try { annots = pages[pi].node.Annots(); } catch (e) { continue; }
        if (!annots || typeof annots.size !== "function") continue;
        for (let i = 0; i < annots.size(); i++) {
          let dict;
          try { dict = annots.lookup(i, PDFDict); } catch (e2) { continue; }
          const da = pdfStringToText(dict.lookup(PDFName.of("DA"))) || "";
          if (!foundPing) {
            const m = da.match(/\/(PingFang[^/\s]*)\s+([0-9.]+)\s+Tf/i);
            if (m) {
              const n = parseFloat(m[2]);
              if (isFinite(n) && n > 0) ping.size = n;
              ping.name = m[1];
              foundPing = true;
            }
          }
          const m2 = da.match(/\/(TimesNewRoman[^/\s]*)\s+([0-9.]+)\s+Tf/i);
          if (m2) {
            const n2 = parseFloat(m2[2]);
            if (isFinite(n2) && n2 > 0) {
              const rec = { size: n2, name: m2[1] };
              if (n2 === 7) times7 = rec;
              else if (n2 <= 8 && !timesOther) timesOther = rec;
            }
          }
        }
      }
    } catch (e) {}
    const t = times7 || timesOther;
    if (t) {
      times.size = t.size;
      times.name = t.name;
    }
    return { ping: ping, times: times };
  }

  function isCjkChar(ch) {
    const cp = ch.codePointAt(0);
    return (
      (cp >= 0x3400 && cp <= 0x9fff) ||
      (cp >= 0xf900 && cp <= 0xfaff) ||
      (cp >= 0x3000 && cp <= 0x303f) ||
      (cp >= 0xff00 && cp <= 0xffef)
    );
  }

  function splitScriptRuns(line) {
    const runs = [];
    const chars = Array.from(line || "");
    for (let i = 0; i < chars.length; i++) {
      const kind = isCjkChar(chars[i]) ? "cjk" : "latin";
      const last = runs[runs.length - 1];
      if (last && last.kind === kind) last.text += chars[i];
      else runs.push({ kind: kind, text: chars[i] });
    }
    return runs;
  }

  function cjkCss(size, family) {
    return "400 " + size + "px \"" + family + "\"";
  }

  function latinCss(size) {
    return "700 " + size + "px \"Times New Roman\", TimesNewRomanPS-BoldMT, Times, serif";
  }

  function fontMetrics(ctx, css, sample, fallbackSize) {
    ctx.font = css;
    const m = ctx.measureText(sample);
    return {
      ascent: (m.fontBoundingBoxAscent != null) ? m.fontBoundingBoxAscent : (m.actualBoundingBoxAscent || fallbackSize * 0.8),
      descent: (m.fontBoundingBoxDescent != null) ? m.fontBoundingBoxDescent : (m.actualBoundingBoxDescent || fallbackSize * 0.2)
    };
  }

  function makeTypeStyle(family, ping, times, origSize, text) {
    const hasCjk = looksChinese(text);
    const hasLatin = /[A-Za-z]/.test(text);
    return {
      family: family,
      ping: ping,
      times: times,
      cjkSize: ping.size || 8,
      latinSize: hasCjk ? 7 : (origSize || times.size || 7),
      hasCjk: hasCjk,
      hasLatin: hasLatin
    };
  }

  function measureTextBox(text, style) {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    const cjk = cjkCss(style.cjkSize, style.family);
    const lat = latinCss(style.latinSize);
    const cjkM = fontMetrics(ctx, cjk, "漢", style.cjkSize);
    const latM = fontMetrics(ctx, lat, "Ag", style.latinSize);
    const ascent = Math.max(cjkM.ascent, latM.ascent);
    const descent = Math.max(cjkM.descent, latM.descent);
    const lineH = Math.max(style.cjkSize, style.latinSize) + 1.6;
    const lines = String(text || "").split(/\r?\n/);
    const nonempty = lines.filter(function (l) { return l.length; });
    let maxW = 0;
    nonempty.forEach(function (line) {
      let w = 0;
      splitScriptRuns(line).forEach(function (run) {
        ctx.font = run.kind === "cjk" ? cjk : lat;
        w += ctx.measureText(run.text).width;
      });
      maxW = Math.max(maxW, w);
    });
    const n = Math.max(1, nonempty.length);
    return {
      width: maxW + 4,
      height: Math.max(lineH + 2, 2 + ascent + descent + (n - 1) * lineH),
      lines: lines,
      nonempty: nonempty,
      ascent: ascent,
      descent: descent,
      lineH: lineH,
      cjkCss: cjk,
      latinCss: lat
    };
  }

  function pngFromDataUrl(dataUrl) {
    const m = String(dataUrl).match(/^data:image\/png;base64,(.+)$/);
    if (!m) throw new Error("canvas toDataURL did not return PNG");
    const bin = atob(m[1]);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  function canvasHasInk(ctx, w, h) {
    try {
      const data = ctx.getImageData(0, 0, w, h).data;
      for (let i = 3; i < data.length; i += 16) {
        if (data[i] > 8) return true;
      }
    } catch (e) {
      return true;
    }
    return false;
  }

  async function canvasToPngBytes(canvas) {
    const blob = await new Promise(function (resolve) {
      try {
        canvas.toBlob(function (b) { resolve(b || null); }, "image/png");
      } catch (e) {
        resolve(null);
      }
    });
    if (blob) return new Uint8Array(await blob.arrayBuffer());
    return pngFromDataUrl(canvas.toDataURL("image/png"));
  }

  async function renderTextPng(text, width, height, style) {
    const cjk = cjkCss(style.cjkSize, style.family);
    const lat = latinCss(style.latinSize);
    try { await document.fonts.load(cjk); } catch (e1) {}
    try { await document.fonts.load(lat); } catch (e2) {}
    try { await document.fonts.ready; } catch (eReady) {}

    const MAX = 4096;
    let scale = 6;
    if (width * scale > MAX) scale = MAX / width;
    if (height * scale > MAX) scale = Math.min(scale, MAX / height);
    scale = Math.max(1, scale);

    const w = Math.max(1, Math.ceil(width * scale));
    const h = Math.max(1, Math.ceil(height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d", { alpha: true, willReadFrequently: true });
    if (!ctx) throw new Error("2D canvas is not available");
    ctx.clearRect(0, 0, w, h);
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.fillStyle = "#000000";
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    try { ctx.textRendering = "geometricPrecision"; } catch (eTr) {}
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";

    const box = measureTextBox(text, style);
    box.lines.forEach(function (line, li) {
      if (!line) return;
      let x = 2;
      const y = 1 + box.ascent + li * box.lineH;
      splitScriptRuns(line).forEach(function (run) {
        ctx.font = run.kind === "cjk" ? box.cjkCss : box.latinCss;
        ctx.fillText(run.text, x, y);
        x += ctx.measureText(run.text).width;
      });
    });

    if (!canvasHasInk(ctx, w, h)) {
      throw new Error("painted appearance was empty (font glyphs missing)");
    }
    return canvasToPngBytes(canvas);
  }

  function makeImageAppearance(doc, image, width, height, name) {
    const imgName = name || "Im0";
    const xobjects = doc.context.obj({});
    xobjects.set(PDFName.of(imgName), image.ref);
    const res = doc.context.obj({});
    res.set(PDFName.of("XObject"), xobjects);
    const ops =
      "q\n" +
      n6(width) + " 0 0 " + n6(height) + " 0 0 cm\n" +
      "/" + imgName + " Do\nQ\n";
    return doc.context.register(doc.context.stream(ops, {
      Type: "XObject",
      Subtype: "Form",
      FormType: 1,
      BBox: [0, 0, width, height],
      Matrix: [1, 0, 0, 1, 0, 0],
      Resources: res
    }));
  }

  $("exportBtn").addEventListener("click", async () => {
    if (state.exporting) return;
    if (!state.files.length) {
      setStatus("Load at least one PDF first.", true);
      return;
    }
    if (!state.fontBytes || !state.fontFamily) {
      setStatus("Import a Chinese font first. The appearance needs it or the text stays invisible.", true);
      return;
    }
    const sel = selectedMap();
    let totalChosen = 0;
    sel.forEach(function (set) { totalChosen += set.size; });
    if (!totalChosen) {
      setStatus("Nothing selected. Use Select changed only, then export.", true);
      return;
    }

    state.exporting = true;
    $("exportBtn").disabled = true;
    setStatus("Writing PDFs with rebuilt appearance streams…");
    const warn = [];
    let exported = 0;
    try {
      const family = state.fontFamily;
      for (let fi = 0; fi < state.files.length; fi++) {
        const f = state.files[fi];
        const chosen = sel.get(fi) || new Set();
        if (!chosen.size) continue;

        const doc = await PDFDocument.load(f.bytes, { ignoreEncryption: true, updateMetadata: false });
        const pages = doc.getPages();
        const rebuilt = new Set();
        let imgSeq = 0;
        const daFonts = scanDaFonts(doc);

        for (let ii = 0; ii < f.items.length; ii++) {
          const it = f.items[ii];
          if (!chosen.has(ii)) continue;
          try {
            const page = pages[it.pageIndex];
            if (!page) throw new Error("missing page " + (it.pageIndex + 1));
            const annots = page.node.Annots();
            if (!annots) throw new Error("page has no annotations");
            const dict = annots.lookup(it.annotIndex, PDFDict);
            const text = it.recovered || "";
            writeContents(dict, text);
            deleteKey(dict, "RC");
            deleteKey(dict, "DS");
            deleteKey(dict, "RV");

            const key = it.pageIndex + ":" + it.annotIndex;
            if (rebuilt.has(key)) continue;
            rebuilt.add(key);

            const subtype = (it.subtype || "").replace(/^\//, "");
            const keepVisual = /^(Highlight|Underline|StrikeOut|Squiggly|Ink|Square|Circle|Line|Polygon|PolyLine|Stamp|Caret|Popup|Link|Widget|Screen|FileAttachment)$/i.test(subtype);
            setPrintFlag(dict, doc);
            if (keepVisual) continue;
            if (!String(text).replace(/\s+/g, "")) continue;

            const box = annotRect(dict);
            const origSize = parseFontSize(dict);
            const typeStyle = makeTypeStyle(family, daFonts.ping, daFonts.times, origSize, text);
            const needed = measureTextBox(text, typeStyle);
            const width = Math.max(box.width, needed.width);
            const height = Math.max(box.height, needed.height);
            if (width > box.width + 0.5 || height > box.height + 0.5) {
              try {
                dict.set(PDFName.of("Rect"), doc.context.obj([
                  box.xa, box.yb - height, box.xa + width, box.yb
                ]));
              } catch (eRect) {}
            }

            try {
              dict.set(PDFName.of("Subtype"), PDFName.of("FreeText"));
              dict.set(PDFName.of("IT"), PDFName.of("FreeTextTypewriter"));
              dict.set(PDFName.of("Q"), doc.context.obj(0));
              dict.set(PDFName.of("CA"), doc.context.obj(1));
              dict.set(PDFName.of("BS"), doc.context.obj({ W: 0, S: PDFName.of("S") }));
              deleteKey(dict, "C");
            } catch (eMeta) {}

            const pngBytes = await renderTextPng(text, width, height, typeStyle);
            const image = await doc.embedPng(pngBytes);
            imgSeq += 1;
            const formRef = makeImageAppearance(doc, image, width, height, "Im" + imgSeq);
            dict.set(PDFName.of("AP"), doc.context.obj({ N: formRef }));
            const daName = typeStyle.hasCjk ? typeStyle.ping.name : typeStyle.times.name;
            const daSize = typeStyle.hasCjk ? typeStyle.cjkSize : typeStyle.latinSize;
            dict.set(PDFName.of("DA"), PDFString.of("/" + daName + " " + daSize + " Tf 0 g"));
            try {
              dict.set(
                PDFName.of("DS"),
                PDFString.of(
                  "font: " + daName + ",sans-serif " + Number(daSize).toFixed(1) +
                  "pt; text-align:left; color:#000000"
                )
              );
            } catch (eDs) {}
          } catch (oneErr) {
            console.warn("annotation failed", it, oneErr);
            warn.push(
              (f.name || "PDF") + " p" + (it.pageIndex + 1) +
              " #" + it.annotIndex + ": " + (oneErr && oneErr.message ? oneErr.message : oneErr)
            );
          }
        }

        const out = await doc.save({ useObjectStreams: false });
        const blob = new Blob([out], { type: "application/pdf" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = f.name.replace(/\.pdf$/i, "") + "-fixed.pdf";
        a.click();
        setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
        exported += 1;
      }
      if (!exported) {
        setStatus("Nothing was exported.", true);
      } else if (warn.length) {
        setStatus(
          "Exported " + exported + " PDF(s) with " + warn.length + " annotation warning(s): " + warn.slice(0, 3).join(" · "),
          true
        );
      } else {
        setStatus("Done. Painted annotation text with " + (state.fontName || "the imported font") + " (visible without clicking).");
      }
    } catch (err) {
      console.error(err);
      setStatus("Export failed: " + (err && err.message ? err.message : err), true);
    } finally {
      state.exporting = false;
      $("exportBtn").disabled = !state.fontFamily;
    }
  });

})();

