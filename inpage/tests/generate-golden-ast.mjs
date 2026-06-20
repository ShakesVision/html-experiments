/** Generate golden AST JSON fixtures from available .inp samples. */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createBidiConverter } from "../shared/bidi-converter.js";
import { loadBidiMappings } from "../shared/xml-loader.js";
import { parseInpArrayBuffer } from "../shared/inp-browser-parser.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const INPAGE_DIR = path.resolve(__dirname, "..");

const SAMPLES = [
  "khali hathely (1).inp",
  "Urdu Grammer Book.inp",
  "Zakiya Mashhadi.inp",
];

const mappings = await loadBidiMappings();
const bidi = createBidiConverter(mappings);

for (const name of SAMPLES) {
  const filePath = path.join(INPAGE_DIR, name);
  const buf = await readFile(filePath);
  const doc = await parseInpArrayBuffer(
    buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
    name,
    { bidiConverter: bidi },
  );
  const stem = name.replace(/\.inp$/i, "");
  const outPath = path.join(INPAGE_DIR, `${stem}.ast.json`);
  await writeFile(outPath, JSON.stringify(doc, null, 2), "utf8");
  console.log(`Wrote ${outPath} (${doc.pages.length} pages, ${doc.extracted.run_stats.content_runs} content runs)`);
}
