/**
 * Faithful InPage100 (.inp) text extractor.
 *
 * Reverse-engineered against KamalAbdali/InpToUni.c and raw stream analysis.
 *
 * The /InPage100 content stream is a sequence of contiguous, length-prefixed
 * records:
 *
 *     [u32 little-endian length N][N content bytes, last byte == 0x0D]
 *
 * Each record is one line/paragraph. Within a record:
 *   - bytes 0x09–0x0D, 0x20–0xFE  → emitted directly (Latin / ASCII / digits)
 *   - byte 0x04 0xXX              → an Urdu/Arabic character: 0xXX is the
 *                                   InPage code point, mapped to Unicode.
 *
 * Interleaved with the text records are binary structures (colour palettes,
 * style tables, geometry). Some of those coincidentally satisfy the record
 * framing, so each decoded record is run through a content classifier that
 * keeps genuine text and drops binary noise.
 */

// Special-case map for 0x04 0xXX escapes, taken verbatim from InpToUni.c's
// little-endian writeUnicode(). These cover punctuation and the honorific
// ligatures that the plain code→U+06xx mapping would get wrong.
const ESCAPE_SPECIAL = {
  0x09: "\t",
  0x0a: "\n",
  0x0b: "\n",
  0x0c: "\n",
  0x0d: "\n",
  0x20: " ",
  0x3a: "^", // ^
  0xcb: "ﷲ", // ﷲ  Allah
  0xda: "!", // !
  0xdb: "}", // }
  0xdc: "{", // {
  0xdd: "$", // $
  0xdf: "/", // /
  0xe0: "…", // …
  0xe1: ")", // )
  0xe2: "(", // (
  0xe3: "*", // *
  0xe4: "+", // +
  0xe9: ":", // :
  0xeb: "×", // ×
  0xec: "=", // =
  0xef: "÷", // ÷
  0xf5: "−", // −
  0xf6: "ﷺ", // ﷺ  sallallahu alayhi wasallam
  0xfa: "]", // ]
  0xfb: "[", // [
  0xfc: ".", // .
  0xfd: "‘", // ‘
  0xfe: "’", // ’
};

const MAX_RECORD_LEN = 16384; // upper bound per line; larger desyncs the scan

function readU32LE(bytes, off) {
  return (
    (bytes[off] |
      (bytes[off + 1] << 8) |
      (bytes[off + 2] << 16) |
      (bytes[off + 3] << 24)) >>>
    0
  );
}

function isArabicCp(cp) {
  return (
    (cp >= 0x0600 && cp <= 0x06ff) ||
    (cp >= 0x0750 && cp <= 0x077f) ||
    (cp >= 0xfb50 && cp <= 0xfeff)
  );
}

/**
 * Decode a single record's content bytes into a string.
 * @param {Uint8Array} bytes  full stream
 * @param {number} start      offset of first content byte
 * @param {number} len        record length (content includes trailing 0x0D)
 * @param {(byte:number)=>string} convertByte  InPage code → Unicode
 */
function decodeRecord(bytes, start, len, convertByte) {
  let out = "";
  let escapes = 0;
  let i = 0;
  while (i < len - 1) {
    const ch = bytes[start + i];
    if ((ch > 0x08 && ch < 0x0e) || (ch > 0x1f && ch < 0xff)) {
      out += ch === 0x0d || ch === 0x0a ? "\n" : String.fromCharCode(ch);
    } else if (ch === 0x04) {
      if (i >= len - 1) break;
      i += 1;
      escapes += 1;
      const code = bytes[start + i];
      const special = ESCAPE_SPECIAL[code];
      out += special !== undefined ? special : convertByte(code);
    }
    i += 1;
  }
  return { text: out, escapes };
}

/**
 * Classify a decoded record.
 * @returns {"text"|"break"|"drop"}
 */
function classifyRecord(text) {
  const trimmed = text.trim();
  if (!trimmed.length) return "break";

  let arabic = 0;
  let foreign = 0; // Latin-1 / Latin-Extended — a hallmark of binary noise
  let good = 0;
  for (const chr of trimmed) {
    const cp = chr.codePointAt(0);
    if (isArabicCp(cp)) {
      arabic += 1;
      good += 1;
    } else if (cp >= 0x80 && cp <= 0x05ff) {
      foreign += 1;
    } else if (cp >= 0x20 || cp === 0x09 || cp === 0x0a) {
      good += 1;
    }
  }

  if (foreign / trimmed.length > 0.08) return "drop";
  if (arabic > 0) return "text";
  // Pure-Latin record (an English heading, a date, etc.). These are rare in
  // Urdu books and easily confused with binary font/style tables — which
  // always carry stray Latin-1 bytes — so require a completely clean run.
  if (foreign === 0 && good / trimmed.length > 0.95 && /[A-Za-z]{2}/.test(trimmed)) {
    // Real English content (titles, publisher lines, emails) is multi-word or
    // carries digits/punctuation; short single tokens like "apKV" are binary
    // font/style remnants.
    if (trimmed.length >= 5 || /\s/.test(trimmed) || /[0-9]/.test(trimmed)) return "text";
  }
  return "drop";
}

/**
 * Extract ordered text blocks from an InPage100 content stream.
 *
 * @param {Uint8Array} bytes        the /InPage100 stream
 * @param {(byte:number)=>string} convertByte  InPage code → Unicode
 * @returns {{blocks: Array<{text:string, kind:string}>, stats: object}}
 */
export function extractInPage100Blocks(bytes, convertByte) {
  const blocks = [];
  let pos = 0;
  let textRecords = 0;
  let dropped = 0;
  let pendingBreak = 0;

  while (pos + 4 < bytes.length) {
    const len = readU32LE(bytes, pos);
    const ok =
      len >= 1 &&
      len <= MAX_RECORD_LEN &&
      pos + 4 + len <= bytes.length &&
      bytes[pos + 4 + len - 1] === 0x0d;

    if (!ok) {
      pos += 1;
      continue;
    }

    const { text } = decodeRecord(bytes, pos + 4, len, convertByte);
    pos += 4 + len;

    // A record may hold a single line or a whole section with embedded
    // newlines. Split and classify each line independently so binary prefixes
    // (font/style tables) are dropped while the surrounding prose is kept.
    const lines = text.split("\n");
    for (const line of lines) {
      const kind = classifyRecord(line);
      if (kind === "text") {
        if (pendingBreak >= 2) blocks.push({ text: "", kind: "spacer" });
        pendingBreak = 0;
        blocks.push({ text: normalizeText(line), kind: "para" });
        textRecords += 1;
      } else if (kind === "break") {
        pendingBreak += 1;
      } else {
        dropped += 1;
      }
    }
  }

  return {
    blocks,
    stats: { text_records: textRecords, dropped_records: dropped },
  };
}

// Opening punctuation that may legitimately begin a line — never stripped.
const PROTECTED_LEAD = "([{«\"'‘’“”";

/**
 * InPage stores a one-byte paragraph style/marker code at the start of many
 * lines (e.g. "²حرف:", ":۱۔", "B\t(الف)"). When that stray byte decodes to a
 * non-Arabic character sitting directly in front of Arabic text or a tab, drop
 * it. Real leading quotes / brackets / digits are preserved.
 */
function isArabicChar(ch) {
  if (ch === undefined) return false;
  const cp = ch.codePointAt(0);
  return (
    (cp >= 0x0600 && cp <= 0x06ff) ||
    (cp >= 0x0750 && cp <= 0x077f) ||
    (cp >= 0xfb50 && cp <= 0xfeff)
  );
}

function stripLeadingMarker(line) {
  if (!line) return line;
  const first = line[0];
  const cp = first.codePointAt(0);
  if (cp >= 0x0600 || cp < 0x21) return line; // Arabic, or whitespace
  if (PROTECTED_LEAD.includes(first) || /[0-9]/.test(first)) return line;
  const rest = line.slice(1);
  // The marker is followed either by indentation (a tab — list/verse items like
  // "B\t(الف)") or by spaces leading into Arabic text ("m دنیا"). In both cases
  // the leading byte is a stray style code; strip it. Tabs are kept as indent.
  const after = rest.match(/^([ \t]*)(.?)/);
  const whitespace = after ? after[1] : "";
  const nextChar = after ? after[2] : "";
  if (whitespace.includes("\t") || isArabicChar(nextChar)) {
    return rest.replace(/^ +/, "");
  }
  return line;
}

// Arabic-Indic (٠-٩) and Extended Arabic-Indic / Urdu (۰-۹) digits.
const ARABIC_DIGIT_RUN = /[٠-٩۰-۹]+/g;

/**
 * Legacy InPage (100) stores Urdu digit sequences in visual right-to-left
 * order, so a multi-digit number comes out reversed (2026 → ۶۲۰۲, 50 → ۰۵).
 * Restore logical order by reversing each run of Arabic-Indic digits. ASCII
 * digits are stored correctly and are left untouched.
 */
function fixDigitOrder(text) {
  return text.replace(ARABIC_DIGIT_RUN, (run) => [...run].reverse().join(""));
}

function normalizeText(text) {
  // Trim trailing whitespace, drop a stray paragraph marker, fix digit order.
  return fixDigitOrder(stripLeadingMarker(text.replace(/\s+$/g, "")).normalize("NFC"));
}

export { decodeRecord, classifyRecord };
