/** Record-aware text extraction for InPage100 and InPage300 streams. */

import { hexPrefix } from "./cfb-reader.js";

export const PARSER_THRESHOLDS = {
  minUtf16Chars: 6,
  minLegacyBytes: 12,
  contentConfidence: 0.5,
  arabicCharMin: 12,
  pageGapBytes: 0x8000,
  footnoteBodyMaxChars: 100,
};

export function containsArabic(text) {
  return /[\u0600-\u06ff\ufb50-\ufeff]/.test(text);
}

export function isAllowedCodepoint(code) {
  if (code === 0x0009 || code === 0x000a || code === 0x000c || code === 0x000d || code === 0x200c || code === 0x200d || code === 0x200e || code === 0x200f) {
    return true;
  }
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

export function confidenceForText(text) {
  if (!text) return 0;
  const length = text.length;
  let arabic = 0;
  let printable = 0;
  for (const ch of text) {
    const cp = ch.codePointAt(0);
    if ((cp >= 0x600 && cp <= 0x6ff) || (cp >= 0xfb50 && cp <= 0xfeff)) arabic += 1;
    if (ch === "\n" || ch === "\r" || ch === "\t" || /\p{Letter}|\p{Number}|\p{Punctuation}|\p{Separator}/u.test(ch)) {
      printable += 1;
    }
  }
  let score = 0;
  score += Math.min(length / 120, 1) * 0.25;
  score += (arabic / length) * 0.55;
  score += (printable / length) * 0.2;
  return Number(Math.min(score, 1).toFixed(4));
}

function normalizeNfc(text) {
  return typeof text === "string" ? text.normalize("NFC") : "";
}

export function extractUtf16Runs(bytes, minChars = PARSER_THRESHOLDS.minUtf16Chars) {
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
      const text = normalizeNfc(String.fromCharCode(...codes).replace(/\u0000+/g, ""));
      if (text.trim().length > 0) {
        runs.push({
          offset: start,
          lengthBytes: codes.length * 2,
          lengthChars: text.length,
          decodedText: text,
          confidence: confidenceForText(text),
          encoding: "utf16",
        });
      }
    }
  }
  return runs;
}

function isLegacyTextByte(byte) {
  return (byte >= 129 && byte <= 250) || byte === 0x20 || byte === 0x09 || byte === 0x0d || byte === 0x0a;
}

function isLegacyUtf16Codepoint(code) {
  const low = code & 0xff;
  const high = (code >> 8) & 0xff;
  if ((low >= 129 && low <= 250) && (high === 0x00 || high === 0x04)) return true;
  if ((low >= 0x20 && low <= 0x7e) && (high === 0x00 || high === 0x04)) return true;
  if (code === 0x0009 || code === 0x000a || code === 0x000d) return true;
  return false;
}

export function extractScatteredLegacyUtf16(bytes, convertByte, options = {}) {
  const gapThreshold = options.gapThreshold ?? 4;
  const minChars = options.minChars ?? 4;
  const units = [];

  for (let i = 0; i + 1 < bytes.length; i += 2) {
    const low = bytes[i];
    const high = bytes[i + 1];
    
    const isLegacy = (low >= 129 && low <= 250) && high === 0x04;
    const isAscii = (low >= 0x20 && low <= 0x7e) && high === 0x04;
    const isBreak = (low === 0x0d || low === 0x0a) && high === 0x00;

    if (isLegacy) {
      units.push({ offset: i, code: low, kind: "legacy" });
    } else if (isBreak) {
      units.push({ offset: i, code: low, kind: "break" });
    } else if (isAscii) {
      units.push({ offset: i, code: low, kind: "ascii" });
    }
  }

  const runs = [];
  let bucket = [];

  const flush = () => {
    if (bucket.length < minChars) {
      bucket = [];
      return;
    }
    let text = "";
    for (const unit of bucket) {
      if (unit.kind === "break") text += "\n";
      else if (unit.kind === "ascii") text += String.fromCharCode(unit.code);
      else text += convertByte(unit.code);
    }
    text = normalizeNfc(text);
    if (!text.trim()) {
      bucket = [];
      return;
    }
    runs.push({
      offset: bucket[0].offset,
      lengthBytes: bucket[bucket.length - 1].offset - bucket[0].offset + 2,
      lengthChars: text.length,
      decodedText: text,
      confidence: confidenceForText(text),
      encoding: "legacy-scattered",
      prefix: readPrefix(bytes, bucket[0].offset),
    });
    bucket = [];
  };

  for (const unit of units) {
    if (bucket.length) {
      const gap = unit.offset - bucket[bucket.length - 1].offset;
      if (gap > gapThreshold) flush();
    }
    bucket.push(unit);
  }
  flush();
  return runs;
}

export function extractLegacyUtf16Runs(bytes, minChars = PARSER_THRESHOLDS.minUtf16Chars) {
  const runs = [];
  let i = 0;
  while (i + 1 < bytes.length) {
    const code = bytes[i] | (bytes[i + 1] << 8);
    if (!isLegacyUtf16Codepoint(code)) {
      i += 2;
      continue;
    }
    const start = i;
    const codes = [];
    while (i + 1 < bytes.length) {
      const c = bytes[i] | (bytes[i + 1] << 8);
      if (!isLegacyUtf16Codepoint(c)) break;
      codes.push(c);
      i += 2;
    }
    if (codes.length >= minChars) {
      runs.push({
        offset: start,
        lengthBytes: codes.length * 2,
        legacyCodes: codes,
        encoding: "legacy-utf16",
      });
    }
  }
  return runs;
}

function decodeLegacyCodeUnits(codes, convertByte) {
  let text = "";
  for (const code of codes) {
    if (code >= 129 && code <= 250) {
      text += convertByte(code);
    } else if (code === 0x000d || code === 0x000a) {
      text += "\n";
    } else if (code <= 0x7e) {
      text += String.fromCharCode(code);
    }
  }
  return normalizeNfc(text);
}

export function extractLegacyByteRuns(bytes, minBytes = PARSER_THRESHOLDS.minLegacyBytes) {
  const runs = [];
  let i = 0;
  while (i < bytes.length) {
    if (!isLegacyTextByte(bytes[i])) {
      i += 1;
      continue;
    }
    const start = i;
    const buf = [];
    while (i < bytes.length && isLegacyTextByte(bytes[i])) {
      buf.push(bytes[i]);
      i += 1;
    }
    if (buf.length >= minBytes) {
      runs.push({
        offset: start,
        lengthBytes: buf.length,
        rawBytes: new Uint8Array(buf),
        encoding: "legacy",
      });
    }
  }
  return runs;
}

export function decodeLegacyRuns(runs, convertByte) {
  return runs.map((run) => {
    let text = "";
    for (let i = 0; i < run.rawBytes.length; i += 1) {
      text += convertByte(run.rawBytes[i]);
    }
    text = normalizeNfc(text);
    return {
      offset: run.offset,
      lengthBytes: run.lengthBytes,
      lengthChars: text.length,
      decodedText: text,
      confidence: confidenceForText(text),
      encoding: "legacy",
    };
  });
}

function readPrefix(bytes, offset) {
  const start = Math.max(0, offset - 8);
  return bytes.slice(start, offset);
}

/**
 * Walk content stream and emit structural tokens.
 * @returns {Array<{type:string, offset:number, text?:string, prefix?:Uint8Array, confidence?:number}>}
 */
export function walkInPageRecords(bytes, variant, options = {}) {
  const tokens = [];
  const minChars = options.minChars ?? PARSER_THRESHOLDS.minUtf16Chars;

  if (variant === "100") {
    return tokens;
  }

  let i = 0;
  while (i + 1 < bytes.length) {
    const code = bytes[i] | (bytes[i + 1] << 8);

    if (code === 0x000d || code === 0x000a) {
      tokens.push({
        type: code === 0x000d ? "LINE_BREAK" : "PARAGRAPH_BREAK",
        offset: i,
      });
      i += 2;
      continue;
    }

    if (!isAllowedCodepoint(code)) {
      i += 2;
      continue;
    }

    const start = i;
    const prefix = readPrefix(bytes, start);
    const codes = [];
    while (i + 1 < bytes.length) {
      const c = bytes[i] | (bytes[i + 1] << 8);
      if (c === 0x000d || c === 0x000a) break;
      if (!isAllowedCodepoint(c)) break;
      codes.push(c);
      i += 2;
    }

    if (codes.length >= minChars) {
      const text = normalizeNfc(String.fromCharCode(...codes).replace(/\u0000+/g, ""));
      if (text.trim()) {
        tokens.push({
          type: "TEXT_RUN",
          offset: start,
          lengthBytes: codes.length * 2,
          text,
          prefix,
          confidence: confidenceForText(text),
          encoding: "utf16",
        });
      }
    } else if (codes.length === 0) {
      i += 2;
    }
  }

  return tokens;
}

export function tokensToContentRuns(tokens, convertLegacy) {
  const runs = [];
  for (const token of tokens) {
    if (token.type !== "TEXT_RUN") continue;
    if (token.encoding === "legacy" && token.rawBytes) {
      let text = "";
      for (let i = 0; i < token.rawBytes.length; i += 1) {
        text += convertLegacy(token.rawBytes[i]);
      }
      text = normalizeNfc(text);
      if (!text.trim()) continue;
      runs.push({
        offset: token.offset,
        lengthBytes: token.lengthBytes,
        lengthChars: text.length,
        decodedText: text,
        confidence: confidenceForText(text),
        encoding: "legacy",
        prefix: token.prefix,
      });
      continue;
    }
    if (token.encoding === "legacy-utf16" && token.legacyCodes) {
      const text = decodeLegacyCodeUnits(token.legacyCodes, convertLegacy);
      if (!text.trim()) continue;
      runs.push({
        offset: token.offset,
        lengthBytes: token.lengthBytes,
        lengthChars: text.length,
        decodedText: text,
        confidence: confidenceForText(text),
        encoding: "legacy-utf16",
        prefix: token.prefix,
      });
      continue;
    }
    if (token.text) {
      runs.push({
        offset: token.offset,
        lengthBytes: token.lengthBytes,
        lengthChars: token.text.length,
        decodedText: token.text,
        confidence: token.confidence ?? confidenceForText(token.text),
        encoding: "utf16",
        prefix: token.prefix,
      });
    }
  }
  return runs;
}

export function filterContentRuns(runs, thresholds = PARSER_THRESHOLDS) {
  return runs.filter((run) => {
    const arabicCount = (run.decodedText.match(/[\u0600-\u06ff\ufb50-\ufeff]/g) || []).length;
    const arabicHeavy = arabicCount >= thresholds.arabicCharMin;
    return (run.confidence >= thresholds.contentConfidence || arabicHeavy) && containsArabic(run.decodedText);
  });
}

export function extractFontCandidates(bytes) {
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

export function buildPrefixKey(prefixBytes) {
  return hexPrefix(prefixBytes, 8);
}
