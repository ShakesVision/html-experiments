/**
 * Unicode ↔ legacy InPage byte (CP1252 private-use) conversion.
 */

function truthyFlag(value) {
  const normalized = String(value ?? "").trim().toUpperCase();
  return normalized === "T" || normalized === "TRUE" || normalized === "1";
}

// Arabic-Indic (٠-٩) and Extended Arabic-Indic / Urdu (۰-۹) digits.
const ARABIC_DIGIT_RUN = /[٠-٩۰-۹]+/g;

/**
 * Legacy InPage stores Urdu digit sequences in visual (right-to-left) order, so
 * a number such as 2026 round-trips as ۶۲۰۲. Reversing each Arabic-Indic digit
 * run converts between logical and visual order — and is its own inverse, so the
 * same function serves both conversion directions.
 */
function reverseArabicDigitRuns(text) {
  return text.replace(ARABIC_DIGIT_RUN, (run) => [...run].reverse().join(""));
}

export function buildInpageToUniMap(rows = []) {
  const map = new Map();
  for (const row of rows) {
    if (truthyFlag(row.ignore)) {
      continue;
    }
    if (!Number.isFinite(row.inpageDec) || !Number.isFinite(row.unicodeDec)) {
      continue;
    }
    if (!map.has(row.inpageDec)) {
      map.set(row.inpageDec, row.unicodeDec);
    }
  }
  return map;
}

export function buildUniToInpageMap(rows = []) {
  const map = new Map();
  for (const row of rows) {
    if (truthyFlag(row.ignore)) {
      continue;
    }
    if (!Number.isFinite(row.unicodeDec) || !Number.isFinite(row.inpageDec)) {
      continue;
    }
    if (!map.has(row.unicodeDec)) {
      map.set(row.unicodeDec, row.inpageDec);
    }
  }
  return map;
}

export function createBidiConverter(mappings = {}) {
  const inpageToUni = buildInpageToUniMap(mappings.inpageToUni ?? []);
  const uniToInpage = buildUniToInpageMap(mappings.uniToInpage ?? []);

  function codePointToString(codePoint) {
    if (codePoint <= 0xffff) {
      return String.fromCharCode(codePoint);
    }
    const adjusted = codePoint - 0x10000;
    return String.fromCharCode(0xd800 + (adjusted >> 10), 0xdc00 + (adjusted & 0x3ff));
  }

  function normalizeUnicode(text) {
    return typeof text === "string" ? text.normalize("NFC") : "";
  }

  function inpageByteToUnicode(byte) {
    const mapped = inpageToUni.get(byte);
    if (mapped == null) {
      if (byte === 0x0d) return "\n";
      if (byte === 0x0a) return "\n";
      if (byte === 0x09) return "\t";
      if (byte >= 0x20 && byte <= 0x7e) return String.fromCharCode(byte);
      return "";
    }
    return codePointToString(mapped);
  }

  function inpageBytesToUnicode(bytes) {
    let out = "";
    for (let i = 0; i < bytes.length; i += 1) {
      out += inpageByteToUnicode(bytes[i]);
    }
    return normalizeUnicode(out);
  }

  function inpageLegacyTextToUnicode(text) {
    const bytes = new Uint8Array(text.length);
    for (let i = 0; i < text.length; i += 1) {
      bytes[i] = text.charCodeAt(i) & 0xff;
    }
    // Storage (visual) order → logical order for display.
    return reverseArabicDigitRuns(inpageBytesToUnicode(bytes));
  }

  function unicodeToInpageBytes(text) {
    // Logical order → storage (visual) order before mapping to bytes.
    const normalized = reverseArabicDigitRuns(normalizeUnicode(text));
    const out = [];
    for (const ch of normalized) {
      const codePoint = ch.codePointAt(0);
      const mapped = uniToInpage.get(codePoint);
      if (mapped != null) {
        out.push(mapped);
        continue;
      }
      if (codePoint === 0x0a || codePoint === 0x0d) {
        out.push(0x0d);
        continue;
      }
      if (codePoint <= 0x7e) {
        out.push(codePoint);
      }
    }
    return new Uint8Array(out);
  }

  function unicodeToInpageLegacyText(text) {
    const bytes = unicodeToInpageBytes(text);
    let out = "";
    for (let i = 0; i < bytes.length; i += 1) {
      out += String.fromCharCode(bytes[i]);
    }
    return out;
  }

  function wrapRtlPreview(text) {
    if (!text || !/[\u0600-\u06ff\ufb50-\ufdff]/.test(text)) {
      return text;
    }
    return `\u2067${text}\u2069`;
  }

  return {
    inpageToUni,
    uniToInpage,
    inpageByteToUnicode,
    inpageBytesToUnicode,
    inpageLegacyTextToUnicode,
    unicodeToInpageBytes,
    unicodeToInpageLegacyText,
    wrapRtlPreview,
  };
}

export function inpageBytesToUnicode(bytes, mappings) {
  return createBidiConverter(mappings).inpageBytesToUnicode(bytes);
}

export function inpageLegacyTextToUnicode(text, mappings) {
  return createBidiConverter(mappings).inpageLegacyTextToUnicode(text);
}

export function unicodeToInpageLegacyText(text, mappings) {
  return createBidiConverter(mappings).unicodeToInpageLegacyText(text);
}
