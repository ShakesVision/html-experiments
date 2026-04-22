import assert from "node:assert/strict";
import { transformLegacyRuns } from "../src/legacy-transform.js";
import { parseLegacyRawText } from "../src/raw-run-parser.js";

const baseMappings = {
  ligatureMap: new Map([
    ["NOORIN01:65", { ligature: "ا", skipSpace: "" }],
    ["NOORIN01:66", { ligature: "ب", skipSpace: "" }],
    ["NOORIN01:49", { ligature: "1", skipSpace: "" }],
    ["NOORIN01:50", { ligature: "2", skipSpace: "" }],
    ["NOORIN14:247", { ligature: "ے", skipSpace: "" }],
    ["NOORIN02:67", { ligature: "ﷺ", skipSpace: "" }],
  ]),
};

function runTest(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    console.error(error.stack || error);
    process.exitCode = 1;
  }
}

runTest("transforms mapped ligatures into unicode output", () => {
  const output = transformLegacyRuns(
    [{ fontName: "NOORI001", text: "AB", lineBreak: false }],
    baseMappings,
    { skipEnglishWords: false, lineFeed: true, swapText: true }
  );

  assert.match(output, /ا/);
  assert.match(output, /ب/);
});

runTest("normalizes subset-prefixed noori font names", () => {
  const output = transformLegacyRuns(
    [{ fontName: "AACZAL+NOORIN01", text: "AB", lineBreak: false }],
    baseMappings,
    { skipEnglishWords: false, lineFeed: true, swapText: true }
  );

  assert.match(output, /ا/);
  assert.match(output, /ب/);
});

runTest("decodes private-use glyphs back to low-byte char codes", () => {
  const output = transformLegacyRuns(
    [{ fontName: "AACZAL+NOORIN01", text: "\uf041\uf042", lineBreak: false }],
    baseMappings,
    { skipEnglishWords: false, lineFeed: true, swapText: true }
  );

  assert.match(output, /ا/);
  assert.match(output, /ب/);
});

runTest("reverses digit clusters for urdu numbers", () => {
  const output = transformLegacyRuns(
    [{ fontName: "NOORI001", text: "12A", lineBreak: false }],
    baseMappings,
    { skipEnglishWords: false, lineFeed: true, swapText: false }
  );

  assert.match(output, /۲۱/);
});

runTest("keeps explicit line break markers", () => {
  const output = transformLegacyRuns(
    [
      { fontName: "NOORI001", text: "A", lineBreak: false },
      { fontName: "NOORI001", text: "B", lineBreak: true },
    ],
    baseMappings,
    { skipEnglishWords: false, lineFeed: true, newlineMode: "line", swapText: false }
  );

  assert.match(output, /\n/);
});

runTest("parses legacy raw runs with layout metadata", () => {
  const marker = String.fromCharCode(0x06e9);
  const raw = `NOORIN01<=;=>545.52|697.56|697.56|13.788<=;=>AB<=!=>\n${marker}NOORIN01<=;=>522.96|667.56|667.56|13.674<=;=>A`;
  const runs = parseLegacyRawText(raw, 5);

  assert.equal(runs.length, 2);
  assert.equal(runs[0].pageNumber, 5);
  assert.equal(runs[0].x, 545.52);
  assert.equal(runs[0].lineBreak, false);
  assert.equal(runs[1].lineBreak, true);
});

if (!process.exitCode) {
  console.log("All tests passed.");
}
