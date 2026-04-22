import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import mupdf from "mupdf";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const pdfPath = path.join(repoRoot, "hp1.pdf");
const outputPath = path.join(repoRoot, "notes", "mupdf-page5-spike.json");
const targetPageNumber = 5;
const pageIndex = targetPageNumber - 1;

function toPlainNumber(value) {
  return typeof value === "number" && Number.isFinite(value) ? Number(value.toFixed(3)) : value;
}

function summarizeStructuredText(page) {
  const structured = page.toStructuredText();
  const chars = [];
  structured.walk({
    beginTextBlock(bbox) {
      chars.push({ type: "beginTextBlock", bbox: bbox.map(toPlainNumber) });
    },
    beginLine(bbox, wmode, direction) {
      chars.push({
        type: "beginLine",
        bbox: bbox.map(toPlainNumber),
        wmode,
        direction: direction.map(toPlainNumber),
      });
    },
    onChar(c, origin, font, size, quad, color) {
      chars.push({
        type: "char",
        c,
        codePoint: c?.codePointAt?.(0) ?? null,
        origin: origin.map(toPlainNumber),
        fontName: font?.getName?.() ?? null,
        size: toPlainNumber(size),
        quad: quad.map(toPlainNumber),
        color: color.map(toPlainNumber),
      });
    },
    endLine() {
      chars.push({ type: "endLine" });
    },
    endTextBlock() {
      chars.push({ type: "endTextBlock" });
    },
  });
  return chars;
}

function summarizeGlyphWalk(page) {
  const runs = [];
  let spanIndex = -1;
  const device = new mupdf.Device({
    fillText(text, ctm) {
      text.walk({
        beginSpan(font, trm, wmode, bidi, markupDirection, language) {
          spanIndex += 1;
          runs.push({
            kind: "span",
            spanIndex,
            fontName: font?.getName?.() ?? null,
            trm: trm.map(toPlainNumber),
            ctm: ctm.map(toPlainNumber),
            wmode,
            bidi,
            markupDirection,
            language,
          });
        },
        showGlyph(font, trm, glyph, unicode, wmode, bidi) {
          runs.push({
            kind: "glyph",
            spanIndex,
            fontName: font?.getName?.() ?? null,
            glyph,
            unicode,
            unicodeChar: unicode > 0 ? String.fromCodePoint(unicode) : null,
            trm: trm.map(toPlainNumber),
            wmode,
            bidi,
          });
        },
        endSpan() {
          runs.push({ kind: "endSpan", spanIndex });
        },
      });
    },
    strokeText(text, stroke, ctm) {
      this.fillText?.(text, ctm, stroke);
    },
    ignoreText(text, ctm) {
      this.fillText?.(text, ctm);
    },
  });

  page.run(device, mupdf.Matrix.identity);
  device.close();
  return runs;
}

const doc = mupdf.Document.openDocument(pdfPath);
const page = doc.loadPage(pageIndex);
const glyphWalk = summarizeGlyphWalk(page);
const structuredText = summarizeStructuredText(page);
const pageObject = page.isPDF() ? page.getObject() : null;
const resources = pageObject ? pageObject.get("Resources") : null;
const fontResources = resources ? resources.get("Font") : null;
const fontEntries = [];
if (fontResources && fontResources.isDictionary()) {
  fontResources.forEach((value, key) => {
    fontEntries.push({
      key: String(key),
      isIndirect: value.isIndirect?.() ?? false,
      valueType: value.toString?.(true, true) ?? null,
      baseFont: value.get?.("BaseFont")?.asName?.() ?? null,
      subtype: value.get?.("Subtype")?.asName?.() ?? null,
      encoding: value.get?.("Encoding")?.toString?.(true, true) ?? null,
      toUnicode: value.get?.("ToUnicode")?.toString?.(true, true) ?? null,
    });
  });
}

const report = {
  pdfPath,
  targetPageNumber,
  totalPages: doc.countPages(),
  glyphEventCount: glyphWalk.length,
  structuredEventCount: structuredText.length,
  sampleGlyphEvents: glyphWalk.slice(0, 80),
  sampleStructuredEvents: structuredText.slice(0, 80),
  fontEntries,
  structuredTextAsText: page.toStructuredText().asText(),
};

fs.writeFileSync(outputPath, JSON.stringify(report, null, 2), "utf8");
console.log(`Wrote ${outputPath}`);
console.log(`glyphEventCount=${report.glyphEventCount}`);
console.log(`structuredEventCount=${report.structuredEventCount}`);
console.log(`fonts=${fontEntries.map((entry) => `${entry.key}:${entry.baseFont}`).join(" | ")}`);
