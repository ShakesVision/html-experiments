import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createBidiConverter } from "../shared/bidi-converter.js";
import { loadBidiMappings } from "../shared/xml-loader.js";
import { parseInpArrayBuffer } from "../shared/inp-browser-parser.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const INPAGE_DIR = path.resolve(__dirname, "..");

const SAMPLE_FILES = [
  "khali hathely (1).inp",
  "Urdu Grammer Book.inp",
  "Zakiya Mashhadi.inp",
  "khali hathely (1).ast.json",
  "Urdu Grammer Book.ast.json",
  "Zakiya Mashhadi.ast.json",
  "juz_29.ast.json",
  "juz_30.ast.json",
];

async function testBidiMappingsLoad() {
  const mappings = await loadBidiMappings();
  assert.ok(mappings.uniToInpage.length > 100, "uniToInpage should not be empty");
  assert.ok(mappings.inpageToUni.length > 100, "inpageToUni should not be empty (InpageUni tag)");
}

async function testBidiRoundTrip() {
  const mappings = await loadBidiMappings();
  const conv = createBidiConverter(mappings);
  const sample = "السلام";
  const legacy = conv.unicodeToInpageLegacyText(sample);
  const back = conv.inpageLegacyTextToUnicode(legacy);
  assert.ok(back.includes("ا"), "round-trip should preserve alef");
}

async function testInpSamples() {
  const mappings = await loadBidiMappings();
  const bidi = createBidiConverter(mappings);

  for (const name of SAMPLE_FILES.filter((n) => n.endsWith(".inp"))) {
    const filePath = path.join(INPAGE_DIR, name);
    let buf;
    try {
      buf = await readFile(filePath);
    } catch {
      console.warn(`skip missing sample ${name}`);
      continue;
    }

    const doc = await parseInpArrayBuffer(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), name, {
      bidiConverter: bidi,
    });

    assert.ok(doc.metadata.content_stream, `${name} should resolve content stream`);
    assert.ok(doc.blocks.length >= 1, `${name} should produce at least one block`);
    const paraBlocks = doc.blocks.filter((b) => b.kind === "para");
    assert.ok(paraBlocks.length >= 1, `${name} should extract text blocks`);

    const allText = paraBlocks.map((b) => b.text).join("");
    assert.ok(/[\u0600-\u06ff]/.test(allText), `${name} output should contain Arabic script`);
    // Guard against the historical under-extraction regression.
    assert.ok(doc.metadata.word_count >= 500, `${name} should extract substantial text (got ${doc.metadata.word_count} words)`);

    console.log(
      `OK ${name}: variant=${doc.metadata.inpage_variant} stream=${doc.metadata.content_stream} blocks=${doc.blocks.length} words=${doc.metadata.word_count}`,
    );
  }
}

async function testAstJsonLoads() {
  for (const name of SAMPLE_FILES.filter((n) => n.endsWith(".json"))) {
    const filePath = path.join(INPAGE_DIR, name);
    let raw;
    try {
      raw = await readFile(filePath, "utf8");
    } catch {
      console.warn(`skip missing ${name}`);
      continue;
    }
    const doc = JSON.parse(raw);
    assert.ok(doc.pages?.length >= 1, `${name} AST should have pages`);
    console.log(`OK ${name}: pages=${doc.pages.length}`);
  }
}

async function main() {
  await testBidiMappingsLoad();
  await testBidiRoundTrip();
  await testAstJsonLoads();
  await testInpSamples();
  console.log("All inp tests passed.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
