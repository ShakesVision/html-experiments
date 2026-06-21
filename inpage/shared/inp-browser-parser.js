/**
 * Browser-side InPage .inp parser.
 *
 * Produces a flat, ordered list of text blocks for continuous rendering:
 *
 *   { metadata, blocks: [{ text, kind }] }
 *
 *   kind: "para"   — a paragraph / line of text
 *         "spacer" — an intentional stanza / section break
 *
 * Two on-disk formats are supported:
 *   - InPage100 (legacy): length-prefixed records, 0x04-escaped Urdu bytes.
 *     Handled by the faithful record scanner in ./inp100-extractor.js.
 *   - InPage300 (modern): UTF-16 text runs with line/paragraph break markers.
 */

import { CfbReader, resolveContentStream } from "./cfb-reader.js";
import { createBidiConverter } from "./bidi-converter.js";
import { loadBidiMappings } from "./xml-loader.js";
import {
  extractUtf16Runs,
  containsArabic,
  PARSER_THRESHOLDS,
} from "./inp-record-parser.js";
import { extractInPage100Blocks } from "./inp100-extractor.js";

let bidiPromise = null;

export function preloadBidiMappings() {
  if (!bidiPromise) {
    bidiPromise = loadBidiMappings().then((mappings) => createBidiConverter(mappings));
  }
  return bidiPromise;
}

/**
 * Build blocks from an InPage300 (modern, UTF-16) content stream.
 *
 * Mirrors the proven Python reference: scan contiguous UTF-16 runs, keep the
 * high-confidence Arabic ones, then split each on embedded newlines so every
 * line becomes its own block. This is what produced clean, fully-diacritised
 * output for the sample Quran files.
 */
function extractInPage300Blocks(bytes, thresholds) {
  const runs = extractUtf16Runs(bytes, thresholds.minUtf16Chars);
  const blocks = [];
  let dropped = 0;

  for (const run of runs) {
    if (run.confidence < thresholds.contentConfidence || !containsArabic(run.decodedText)) {
      dropped += 1;
      continue;
    }
    const parts = run.decodedText
      .split(/[\r\n]+/)
      .map((p) => p.replace(/\s+$/g, "").normalize("NFC"))
      .filter((p) => p.trim());
    for (const text of parts) blocks.push({ text, kind: "para" });
  }

  return { blocks, stats: { text_records: blocks.length, dropped_records: dropped } };
}

export async function parseInpArrayBuffer(arrayBuffer, sourceName, options = {}) {
  const cfb = new CfbReader(arrayBuffer);
  const streamMeta = cfb.manifest();
  const content = resolveContentStream(cfb);

  if (!content || !content.bytes || content.bytes.length === 0) {
    throw new Error("No InPage content stream found (/InPage100 or /InPage300)");
  }

  const thresholds = { ...PARSER_THRESHOLDS, ...(options.thresholds || {}) };

  let result;
  if (content.variant === "100") {
    const bidi = options.bidiConverter || (await preloadBidiMappings());
    const convertByte = (byte) => bidi.inpageByteToUnicode(byte);
    result = extractInPage100Blocks(content.bytes, convertByte);
  } else {
    result = extractInPage300Blocks(content.bytes, thresholds);
  }

  const wordCount = result.blocks.reduce(
    (sum, b) => sum + (b.text ? b.text.split(/\s+/).filter(Boolean).length : 0),
    0,
  );

  return {
    metadata: {
      source_file: sourceName || "uploaded.inp",
      parser: "inpage-shared-parser",
      schema_version: "1.0.0",
      content_stream: content.path,
      inpage_variant: content.variant,
      inpage_stream_size: content.bytes.length,
      stream_count: streamMeta.length,
      block_count: result.blocks.length,
      word_count: wordCount,
      text_records: result.stats.text_records,
      dropped_records: result.stats.dropped_records,
    },
    blocks: result.blocks,
  };
}

export { CfbReader, resolveContentStream, PARSER_THRESHOLDS };
