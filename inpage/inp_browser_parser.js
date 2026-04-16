(function () {
  "use strict";

  const FREESECT = 0xffffffff;
  const ENDOFCHAIN = 0xfffffffe;
  const NOSTREAM = 0xffffffff;

  function readU16(bytes, off) {
    return bytes[off] | (bytes[off + 1] << 8);
  }

  function readU32(bytes, off) {
    return (
      bytes[off] |
      (bytes[off + 1] << 8) |
      (bytes[off + 2] << 16) |
      (bytes[off + 3] << 24)
    ) >>> 0;
  }

  function readU64Safe(bytes, off) {
    const low = readU32(bytes, off);
    const high = readU32(bytes, off + 4);
    return high * 4294967296 + low;
  }

  function concatChunks(chunks) {
    const total = chunks.reduce((s, c) => s + c.length, 0);
    const out = new Uint8Array(total);
    let p = 0;
    for (const c of chunks) {
      out.set(c, p);
      p += c.length;
    }
    return out;
  }

  function hexPrefix(bytes, len) {
    const n = Math.min(len, bytes.length);
    let out = "";
    for (let i = 0; i < n; i += 1) out += bytes[i].toString(16).padStart(2, "0");
    return out;
  }

  function shaLike(bytes) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < bytes.length; i += 1) {
      h ^= bytes[i];
      h = Math.imul(h, 16777619);
    }
    return (h >>> 0).toString(16).padStart(8, "0");
  }

  class CfbReader {
    constructor(arrayBuffer) {
      this.bytes = new Uint8Array(arrayBuffer);
      this.header = this.parseHeader();
      this.sectorSize = 1 << this.header.sectorShift;
      this.miniSectorSize = 1 << this.header.miniSectorShift;
      this.fat = [];
      this.minifat = [];
      this.dirEntries = [];
      this.pathsById = new Map();
      this.rootEntry = null;

      this.loadFat();
      this.loadDirectory();
      this.buildPaths();
      this.loadMiniFat();
    }

    parseHeader() {
      const b = this.bytes;
      const magic = "d0cf11e0a1b11ae1";
      if (hexPrefix(b, 8) !== magic) throw new Error("Not a valid OLE/CFB file");
      return {
        minorVersion: readU16(b, 24),
        majorVersion: readU16(b, 26),
        byteOrder: readU16(b, 28),
        sectorShift: readU16(b, 30),
        miniSectorShift: readU16(b, 32),
        numDirSectors: readU32(b, 40),
        numFatSectors: readU32(b, 44),
        firstDirSector: readU32(b, 48),
        miniStreamCutoffSize: readU32(b, 56),
        firstMiniFatSector: readU32(b, 60),
        numMiniFatSectors: readU32(b, 64),
        firstDifatSector: readU32(b, 68),
        numDifatSectors: readU32(b, 72),
      };
    }

    sectorOffset(sid) {
      return (sid + 1) * this.sectorSize;
    }

    readSector(sid) {
      const off = this.sectorOffset(sid);
      return this.bytes.slice(off, off + this.sectorSize);
    }

    readChain(startSid, table, maxSteps = 50000) {
      if (startSid === NOSTREAM || startSid === ENDOFCHAIN) return [];
      const chain = [];
      const seen = new Set();
      let sid = startSid >>> 0;
      for (let i = 0; i < maxSteps; i += 1) {
        if (sid === NOSTREAM || sid === ENDOFCHAIN) break;
        if (sid >= table.length) break;
        if (seen.has(sid)) break;
        seen.add(sid);
        chain.push(sid);
        sid = table[sid] >>> 0;
      }
      return chain;
    }

    loadFat() {
      const difat = [];
      for (let i = 0; i < 109; i += 1) {
        const sid = readU32(this.bytes, 76 + i * 4);
        if (sid !== FREESECT) difat.push(sid);
      }

      let nextDifat = this.header.firstDifatSector;
      for (let i = 0; i < this.header.numDifatSectors; i += 1) {
        if (nextDifat === ENDOFCHAIN || nextDifat === FREESECT || nextDifat === NOSTREAM) break;
        const sec = this.readSector(nextDifat);
        const count = this.sectorSize / 4 - 1;
        for (let j = 0; j < count; j += 1) {
          const sid = readU32(sec, j * 4);
          if (sid !== FREESECT) difat.push(sid);
        }
        nextDifat = readU32(sec, this.sectorSize - 4);
      }

      const fat = [];
      for (const fatSid of difat) {
        const sec = this.readSector(fatSid);
        for (let i = 0; i < this.sectorSize; i += 4) fat.push(readU32(sec, i));
      }
      this.fat = fat;
    }

    loadDirectory() {
      const chain = this.readChain(this.header.firstDirSector, this.fat);
      const chunks = chain.map((sid) => this.readSector(sid));
      const bytes = concatChunks(chunks);
      const dec = new TextDecoder("utf-16le");
      const entries = [];

      for (let off = 0; off + 128 <= bytes.length; off += 128) {
        const ent = bytes.slice(off, off + 128);
        const nameLen = readU16(ent, 64);
        const nameRaw = ent.slice(0, Math.max(0, nameLen - 2));
        const name = dec.decode(nameRaw).replace(/\u0000+$/g, "");
        const entry = {
          entryId: off / 128,
          name,
          objType: ent[66],
          color: ent[67],
          leftId: readU32(ent, 68),
          rightId: readU32(ent, 72),
          childId: readU32(ent, 76),
          startSector: readU32(ent, 116),
          streamSize: readU64Safe(ent, 120),
        };
        entries.push(entry);
      }
      this.dirEntries = entries;
      this.rootEntry = entries.length > 0 ? entries[0] : null;
    }

    walkSiblingTree(nodeId, out) {
      if (nodeId === NOSTREAM || nodeId === FREESECT || nodeId >= this.dirEntries.length) return;
      const node = this.dirEntries[nodeId];
      this.walkSiblingTree(node.leftId, out);
      out.push(nodeId);
      this.walkSiblingTree(node.rightId, out);
    }

    buildPaths() {
      if (!this.rootEntry) return;
      this.pathsById.set(this.rootEntry.entryId, "/");
      const assign = (parentId, parentPath) => {
        const parent = this.dirEntries[parentId];
        const ids = [];
        this.walkSiblingTree(parent.childId, ids);
        for (const id of ids) {
          const ent = this.dirEntries[id];
          const name = ent.name || `entry_${id}`;
          const path = parentPath === "/" ? `/${name}` : `${parentPath}/${name}`;
          this.pathsById.set(id, path);
          if (ent.objType === 1 || ent.objType === 5) assign(id, path);
        }
      };
      assign(this.rootEntry.entryId, "/");
    }

    loadMiniFat() {
      const chain = this.readChain(this.header.firstMiniFatSector, this.fat);
      const mini = [];
      for (const sid of chain) {
        const sec = this.readSector(sid);
        for (let i = 0; i < sec.length; i += 4) mini.push(readU32(sec, i));
      }
      this.minifat = mini;
    }

    readNormalStream(startSector, size) {
      const chain = this.readChain(startSector, this.fat);
      const bytes = concatChunks(chain.map((sid) => this.readSector(sid))).slice(0, size);
      return { bytes, chain, allocation: "fat" };
    }

    readMiniStream(startMiniSector, size) {
      if (!this.rootEntry) return { bytes: new Uint8Array(0), chain: [], allocation: "minifat" };
      const root = this.readNormalStream(this.rootEntry.startSector, this.rootEntry.streamSize).bytes;
      const chain = this.readChain(startMiniSector, this.minifat);
      const parts = [];
      for (const msid of chain) {
        const off = msid * this.miniSectorSize;
        parts.push(root.slice(off, off + this.miniSectorSize));
      }
      return { bytes: concatChunks(parts).slice(0, size), chain, allocation: "minifat" };
    }

    readEntryStream(entry) {
      if (entry.objType !== 2 && entry.objType !== 5) return { bytes: new Uint8Array(0), chain: [], allocation: "none" };
      if (entry.objType === 5) return this.readNormalStream(entry.startSector, entry.streamSize);
      if (entry.streamSize < this.header.miniStreamCutoffSize) return this.readMiniStream(entry.startSector, entry.streamSize);
      return this.readNormalStream(entry.startSector, entry.streamSize);
    }

    getEntryByPath(path) {
      for (const entry of this.dirEntries) {
        if (this.pathsById.get(entry.entryId) === path) return entry;
      }
      return null;
    }

    getStreamByPath(path) {
      const entry = this.getEntryByPath(path);
      if (!entry) return null;
      return this.readEntryStream(entry);
    }

    manifest() {
      return this.dirEntries.map((entry) => {
        const path = this.pathsById.get(entry.entryId) || `/entry_${entry.entryId}`;
        let bytes = new Uint8Array(0);
        let chain = [];
        let allocation = "none";
        if (entry.objType === 2 || entry.objType === 5) {
          const stream = this.readEntryStream(entry);
          bytes = stream.bytes;
          chain = stream.chain;
          allocation = stream.allocation;
        }
        return {
          entryId: entry.entryId,
          path,
          name: entry.name,
          type: entry.objType === 5 ? "root" : entry.objType === 2 ? "stream" : entry.objType === 1 ? "storage" : "unknown",
          size: entry.streamSize,
          allocation,
          chainLen: chain.length,
          sha: bytes.length ? shaLike(bytes) : "",
          sampleHex: hexPrefix(bytes, 64),
        };
      });
    }
  }

  function containsArabic(text) {
    return /[\u0600-\u06ff\ufb50-\ufeff]/.test(text);
  }

  function isAllowedCodepoint(code) {
    if (code === 0x0009 || code === 0x000a || code === 0x000c || code === 0x000d || code === 0x200c || code === 0x200d || code === 0x200e || code === 0x200f) return true;
    if (code >= 0x20 && code <= 0x7e) return true;
    if (code >= 0x0600 && code <= 0x06ff) return true;
    if (code >= 0x0750 && code <= 0x077f) return true;
    if (code >= 0x08a0 && code <= 0x08ff) return true;
    if (code >= 0xfb50 && code <= 0xfdff) return true;
    if (code >= 0xfe70 && code <= 0xfeff) return true;
    if (code >= 0x0660 && code <= 0x0669) return true;
    if (code >= 0x06f0 && code <= 0x06f9) return true;
    return false;
  }

  function confidenceForText(text) {
    if (!text) return 0;
    const length = text.length;
    let arabic = 0;
    let printable = 0;
    for (const ch of text) {
      const cp = ch.codePointAt(0);
      if ((cp >= 0x600 && cp <= 0x6ff) || (cp >= 0xfb50 && cp <= 0xfeff)) arabic += 1;
      if (ch === "\n" || ch === "\r" || ch === "\t" || /\p{Letter}|\p{Number}|\p{Punctuation}|\p{Separator}/u.test(ch)) printable += 1;
    }
    let score = 0;
    score += Math.min(length / 120, 1) * 0.25;
    score += (arabic / length) * 0.55;
    score += (printable / length) * 0.2;
    return Number(Math.min(score, 1).toFixed(4));
  }

  function extractUtf16Runs(bytes, minChars = 6) {
    const runs = [];
    let i = 0;
    while (i + 1 < bytes.length) {
      const code = bytes[i] | (bytes[i + 1] << 8);
      if (!isAllowedCodepoint(code)) {
        i += 2;
        continue;
      }
      const start = i;
      const codes = [];
      while (i + 1 < bytes.length) {
        const c = bytes[i] | (bytes[i + 1] << 8);
        if (!isAllowedCodepoint(c)) break;
        codes.push(c);
        i += 2;
      }
      if (codes.length >= minChars) {
        const text = String.fromCharCode(...codes).replace(/\u0000+/g, "");
        if (text.trim().length > 0) {
          runs.push({
            offset: start,
            lengthBytes: codes.length * 2,
            lengthChars: text.length,
            decodedText: text,
            confidence: confidenceForText(text),
          });
        }
      }
    }
    return runs;
  }

  function extractFontCandidates(bytes) {
    const td = new TextDecoder("utf-16le", { fatal: false });
    const utf16 = td.decode(bytes);
    const asciiRaw = new TextDecoder("latin1").decode(bytes);
    const asciiMatches = asciiRaw.match(/[\x20-\x7e]{4,64}/g) || [];
    const utf16Matches = utf16.match(/[A-Za-z][A-Za-z0-9 ._-]{2,48}/g) || [];
    const words = [...asciiMatches, ...utf16Matches];
    const keys = ["nast", "noori", "nafees", "jameel", "alvi", "arial", "times", "tahoma", "urdu", "arabic"];
    const out = [];
    for (const w of words) {
      const s = w.trim();
      if (!s) continue;
      const low = s.toLowerCase();
      if (keys.some((k) => low.includes(k))) out.push(s);
    }
    return [...new Set(out)].slice(0, 64);
  }

  function buildStylesAndRunMap(streamBytes, runs) {
    const ct = new Map();
    const prefixByOffset = new Map();
    for (const run of runs) {
      const start = Math.max(0, run.offset - 8);
      const prefix = hexPrefix(streamBytes.slice(start, run.offset), 8);
      prefixByOffset.set(run.offset, prefix);
      ct.set(prefix, (ct.get(prefix) || 0) + 1);
    }
    const sorted = [...ct.entries()].sort((a, b) => b[1] - a[1]).slice(0, 64);
    const styles = [];
    const sidByPrefix = new Map();
    const denom = Math.max(1, runs.length);
    for (let i = 0; i < sorted.length; i += 1) {
      const [prefix, occ] = sorted[i];
      const sid = `S${String(i + 1).padStart(3, "0")}`;
      sidByPrefix.set(prefix, sid);
      styles.push({
        style_id: sid,
        key_prefix_hex: prefix,
        occurrences: occ,
        font_id: null,
        font_size: null,
        bold: null,
        italic: null,
        underline: null,
        alignment: null,
        confidence: Number(Math.min(0.3 + (occ / denom) * 0.7, 0.95).toFixed(4)),
      });
    }
    const runStyleMap = new Map();
    for (const [off, prefix] of prefixByOffset.entries()) runStyleMap.set(off, sidByPrefix.get(prefix) || "S000");
    return { styles, runStyleMap };
  }

  function median(values) {
    if (values.length === 0) return 0;
    const s = [...values].sort((a, b) => a - b);
    const m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  }

  function derivePages(runs) {
    if (runs.length === 0) return [];
    const gaps = [];
    for (let i = 1; i < runs.length; i += 1) gaps.push(runs[i].offset - (runs[i - 1].offset + runs[i - 1].lengthBytes));
    const gapThreshold = Math.max(0x1800, Math.floor(median(gaps) * 10));

    const pages = [];
    let curr = [runs[0]];
    for (let i = 1; i < runs.length; i += 1) {
      const prev = runs[i - 1];
      const next = runs[i];
      const gap = next.offset - (prev.offset + prev.lengthBytes);
      const looksLikeHeader = /سُوْرَۃ|سورۃ|منزل|پارہ|بِسْمِ|بسم اللہ/u.test(next.decodedText);
      if (gap > gapThreshold || looksLikeHeader) {
        pages.push(curr);
        curr = [next];
      } else {
        curr.push(next);
      }
    }
    if (curr.length) pages.push(curr);
    return pages;
  }

  function toParagraphs(run, styleId) {
    const parts = run.decodedText.split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
    const lines = parts.length ? parts : [run.decodedText.trim()].filter(Boolean);
    return lines.map((text, i) => ({
      paragraph_id: `r${run.offset.toString(16)}_${i + 1}`,
      alignment: null,
      indentation: null,
      spacing: null,
      direction: "rtl",
      runs: [
        {
          text,
          source: { stream: "/InPage300", offset: run.offset, confidence: run.confidence },
          style_id: styleId,
          char_format: { font: null, size: null, bold: null, italic: null, underline: null, color: null },
        },
      ],
    }));
  }

  function mapFootnotes(runs) {
    const toAsciiDigits = (s) =>
      s.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660)).replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
    const numRe = /[٠-٩۰-۹]+/g;
    const refs = [];
    const bodies = new Map();
    for (const run of runs) {
      const matches = run.decodedText.match(numRe) || [];
      if (!matches.length) continue;
      for (const m of matches) {
        const n = toAsciiDigits(m);
        if (run.lengthChars <= 80) {
          if (!bodies.has(n)) bodies.set(n, run);
        } else {
          refs.push({ n, run });
        }
      }
    }
    const out = [];
    for (let i = 0; i < refs.length; i += 1) {
      const ref = refs[i];
      const body = bodies.get(ref.n) || null;
      out.push({
        id: `fn${i + 1}`,
        number: ref.n,
        reference_offset: ref.run.offset,
        body_offset: body ? body.offset : null,
        body_text_preview: body ? body.decodedText.slice(0, 140) : "",
        confidence: body ? 0.45 : 0.2,
      });
    }
    return out;
  }

  function parseInpArrayBuffer(arrayBuffer, sourceName) {
    const cfb = new CfbReader(arrayBuffer);
    const streamMeta = cfb.manifest();

    const inpage = cfb.getStreamByPath("/InPage300");
    if (!inpage || !inpage.bytes || inpage.bytes.length === 0) throw new Error("InPage300 stream not found");

    const allRuns = extractUtf16Runs(inpage.bytes, 6);
    const contentRuns = allRuns.filter((r) => {
      const arabicHeavy = (r.decodedText.match(/[\u0600-\u06ff\ufb50-\ufeff]/g) || []).length >= 12;
      return (r.confidence >= 0.5 || arabicHeavy) && containsArabic(r.decodedText);
    });
    contentRuns.sort((a, b) => a.offset - b.offset);

    const { styles, runStyleMap } = buildStylesAndRunMap(inpage.bytes, allRuns);
    const pageGroups = derivePages(contentRuns);
    const pages = [];
    for (let i = 0; i < pageGroups.length; i += 1) {
      const group = pageGroups[i];
      const paragraphs = [];
      for (const run of group) paragraphs.push(...toParagraphs(run, runStyleMap.get(run.offset) || "S000"));
      pages.push({
        number: i + 1,
        source_offsets: {
          start: group[0].offset,
          end: group[group.length - 1].offset + group[group.length - 1].lengthBytes,
        },
        paragraphs,
      });
    }

    const fonts = extractFontCandidates(inpage.bytes).map((name, i) => ({ font_id: `F${String(i + 1).padStart(3, "0")}`, name }));
    const footnotes = mapFootnotes(contentRuns);

    return {
      metadata: {
        source_file: sourceName || "uploaded.inp",
        source_type: "inp_direct",
        parser: "in-browser-cfb",
        schema_version: "0.2.0",
        stream_count: streamMeta.length,
        inpage_stream_size: inpage.bytes.length,
        page_count_source: "heuristic_from_inpage300_boundaries",
      },
      fonts,
      styles,
      pages,
      footnotes,
      extracted: {
        stream_manifest: streamMeta,
        run_stats: {
          total_runs: allRuns.length,
          content_runs: contentRuns.length,
        },
      },
    };
  }

  window.InpBrowserParser = { parseInpArrayBuffer };
})();
