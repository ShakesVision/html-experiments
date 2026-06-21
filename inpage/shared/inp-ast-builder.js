/** Build document AST from extracted runs and structural tokens. */

import { buildPrefixKey, PARSER_THRESHOLDS } from "./inp-record-parser.js";
import { hexPrefix } from "./cfb-reader.js";

export function decodeStyleFromPrefix(prefixBytes) {
  if (!prefixBytes || prefixBytes.length < 8) {
    return {
      font: null,
      size: null,
      bold: null,
      italic: null,
      underline: null,
      color: null,
      alignment: null,
    };
  }

  const sizeCandidate = prefixBytes[4] | (prefixBytes[5] << 8);
  const fontSize = sizeCandidate >= 8 && sizeCandidate <= 96 ? sizeCandidate : null;

  let alignment = null;
  const alignByte = prefixBytes[0];
  if (alignByte === 0x01 || alignByte === 0x40) alignment = "right";
  else if (alignByte === 0x02) alignment = "center";
  else if (alignByte === 0x03) alignment = "left";
  else if (alignByte === 0x00) alignment = "right";

  const bold = prefixBytes[1] === 0x01 ? true : null;
  const italic = prefixBytes[2] === 0x01 ? true : null;

  return {
    font: null,
    size: fontSize,
    bold,
    italic,
    underline: null,
    color: null,
    alignment,
  };
}

export function buildStylesAndRunMap(streamBytes, runs) {
  const ct = new Map();
  const prefixByOffset = new Map();
  for (const run of runs) {
    const prefixBytes = run.prefix ?? streamBytes.slice(Math.max(0, run.offset - 8), run.offset);
    const prefix = buildPrefixKey(prefixBytes);
    prefixByOffset.set(run.offset, { prefix, prefixBytes });
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
    const sampleEntry = [...prefixByOffset.entries()].find(([, info]) => info.prefix === prefix);
    const decoded = decodeStyleFromPrefix(sampleEntry?.[1]?.prefixBytes);

    styles.push({
      style_id: sid,
      key_prefix_hex: prefix,
      occurrences: occ,
      font_id: null,
      font_size: decoded.size,
      bold: decoded.bold,
      italic: decoded.italic,
      underline: decoded.underline,
      alignment: decoded.alignment,
      confidence: Number(Math.min(0.3 + (occ / denom) * 0.7, 0.95).toFixed(4)),
    });
  }

  const runStyleMap = new Map();
  const runFormatMap = new Map();
  for (const [off, info] of prefixByOffset.entries()) {
    runStyleMap.set(off, sidByPrefix.get(info.prefix) || "S000");
    runFormatMap.set(off, decodeStyleFromPrefix(info.prefixBytes));
  }

  return { styles, runStyleMap, runFormatMap };
}

export function derivePages(runs, thresholds = PARSER_THRESHOLDS) {
  if (runs.length === 0) return [];
  const pages = [];
  let curr = [runs[0]];
  for (let i = 1; i < runs.length; i += 1) {
    const prev = runs[i - 1];
    const next = runs[i];
    const gap = next.offset - (prev.offset + prev.lengthBytes);
    const looksLikeHeader = /سُوْرَۃ|سورۃ|منزل|پارہ|بِسْمِ|بسم اللہ/u.test(next.decodedText);
    if (gap > thresholds.pageGapBytes || looksLikeHeader) {
      pages.push(curr);
      curr = [next];
    } else {
      curr.push(next);
    }
  }
  if (curr.length) pages.push(curr);
  return pages;
}

function emptyCharFormat() {
  return { font: null, size: null, bold: null, italic: null, underline: null, color: null };
}

export function tokensToParagraphs(tokens, context) {
  const { streamPath, runStyleMap, runFormatMap, styleById } = context;
  const paragraphs = [];
  let current = {
    alignment: "rtl",
    runs: [],
    paragraph_id: null,
  };

  const flush = () => {
    if (!current.runs.length) return;
    paragraphs.push({
      paragraph_id: current.paragraph_id || `p_${paragraphs.length + 1}`,
      alignment: current.alignment,
      indentation: null,
      spacing: null,
      direction: "rtl",
      runs: current.runs,
    });
    current = { alignment: "rtl", runs: [], paragraph_id: null };
  };

  for (const token of tokens) {
    if (token.type === "PAGE_BREAK") {
      flush();
      continue;
    }
    if (token.type === "PARAGRAPH_BREAK") {
      flush();
      continue;
    }
    if (token.type === "LINE_BREAK") {
      current.runs.push({
        text: "\n",
        source: { stream: streamPath, offset: token.offset, confidence: 1 },
        style_id: "S000",
        char_format: emptyCharFormat(),
        is_break: true,
      });
      continue;
    }
    if (token.type !== "TEXT_RUN") continue;

    const text = token.decodedText ?? token.text ?? "";
    if (!text.trim()) continue;

    const styleId = runStyleMap?.get(token.offset) || "S000";
    const charFormat = runFormatMap?.get(token.offset) || decodeStyleFromPrefix(token.prefix);
    const styleRow = styleById?.get(styleId);
    if (styleRow?.alignment) current.alignment = styleRow.alignment;
    else if (charFormat.alignment) current.alignment = charFormat.alignment;

    const parts = text.split(/\r?\n/);
    for (let i = 0; i < parts.length; i += 1) {
      if (i > 0) flush();
      const part = parts[i].trim();
      if (!part) continue;
      current.runs.push({
        text: part,
        source: {
          stream: streamPath,
          offset: token.offset,
          confidence: token.confidence ?? 0.5,
        },
        style_id: styleId,
        char_format: {
          font: charFormat.font,
          size: charFormat.size ?? styleRow?.font_size ?? null,
          bold: charFormat.bold ?? styleRow?.bold ?? null,
          italic: charFormat.italic ?? styleRow?.italic ?? null,
          underline: charFormat.underline ?? styleRow?.underline ?? null,
          color: charFormat.color ?? null,
        },
      });
    }
  }

  flush();
  return paragraphs;
}

export function runsToParagraphs(runs, context) {
  const paragraphs = [];
  for (const run of runs) {
    const styleId = context.runStyleMap.get(run.offset) || "S000";
    const charFormat = context.runFormatMap.get(run.offset) || emptyCharFormat();
    const styleRow = context.styleById?.get(styleId);
    const alignment = styleRow?.alignment || charFormat.alignment || "right";

    const parts = run.decodedText.split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
    const lines = parts.length ? parts : [run.decodedText.trim()].filter(Boolean);

    for (const text of lines) {
      paragraphs.push({
        paragraph_id: `r${run.offset.toString(16)}_${paragraphs.length + 1}`,
        alignment,
        indentation: null,
        spacing: null,
        direction: "rtl",
        runs: [
          {
            text,
            source: {
              stream: context.streamPath,
              offset: run.offset,
              confidence: run.confidence,
            },
            style_id: styleId,
            char_format: {
              font: charFormat.font,
              size: charFormat.size ?? styleRow?.font_size ?? null,
              bold: charFormat.bold ?? styleRow?.bold ?? null,
              italic: charFormat.italic ?? styleRow?.italic ?? null,
              underline: charFormat.underline ?? styleRow?.underline ?? null,
              color: charFormat.color ?? null,
            },
          },
        ],
      });
    }
  }
  return paragraphs;
}

export function mapFootnotes(runs, thresholds = PARSER_THRESHOLDS) {
  const toAsciiDigits = (s) =>
    s
      .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
      .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
  const numRe = /[٠-٩۰-۹]+/g;
  const refs = [];
  const bodies = new Map();

  for (const run of runs) {
    const matches = run.decodedText.match(numRe) || [];
    if (!matches.length) continue;
    for (const m of matches) {
      const n = toAsciiDigits(m);
      if (run.lengthChars <= thresholds.footnoteBodyMaxChars) {
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

export function buildPagesFromRuns(runs, context) {
  const pageGroups = derivePages(runs, context.thresholds);
  const pages = [];

  for (let i = 0; i < pageGroups.length; i += 1) {
    const group = pageGroups[i];
    const paragraphs = runsToParagraphs(group, context);
    pages.push({
      number: i + 1,
      source_offsets: {
        start: group[0].offset,
        end: group[group.length - 1].offset + group[group.length - 1].lengthBytes,
      },
      paragraphs,
    });
  }

  return pages;
}

export function buildPagesFromTokens(tokens, contentRuns, context) {
  const pageGroups = derivePages(contentRuns, context.thresholds);
  if (!pageGroups.length) {
    const paragraphs = tokensToParagraphs(tokens, context);
    return paragraphs.length
      ? [{ number: 1, source_offsets: { start: 0, end: context.streamBytes?.length ?? 0 }, paragraphs }]
      : [];
  }

  const pages = [];
  for (let i = 0; i < pageGroups.length; i += 1) {
    const group = pageGroups[i];
    const start = group[0].offset;
    const end = group[group.length - 1].offset + group[group.length - 1].lengthBytes;
    const sliceTokens = tokens.filter((t) => t.offset >= start && t.offset <= end);
    const paragraphs = tokensToParagraphs(sliceTokens.length ? sliceTokens : tokens, context);
    pages.push({
      number: i + 1,
      source_offsets: { start, end },
      paragraphs,
    });
  }
  return pages;
}
