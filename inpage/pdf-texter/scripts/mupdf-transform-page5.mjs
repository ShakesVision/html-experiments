import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import mupdf from "mupdf";
import { transformLegacyRuns } from "../src/legacy-transform.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const pdfPath = path.join(repoRoot, "hp1.pdf");
const outputRawPath = path.join(repoRoot, "notes", "mupdf-page5-raw-like.txt");
const outputReportPath = path.join(repoRoot, "notes", "mupdf-page5-transform-report.json");
const outputTextPath = path.join(repoRoot, "out", "mupdf-page5-paragraph.txt");
const targetPageNumber = 5;
const pageIndex = targetPageNumber - 1;
const lineMarker = String.fromCharCode(0x06E9);

function decodeXml(str) {
  return str
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'");
}

function loadLigatureMap(xmlPath) {
  const xml = fs.readFileSync(xmlPath, "utf8");
  const ligatureMap = new Map();
  for (const block of xml.split("<Ligatures>").slice(1)) {
    const body = block.split("</Ligatures>")[0];
    const font = /<FontName>([\s\S]*?)<\/FontName>/.exec(body)?.[1]?.trim();
    const dec = Number(/<UnicodeDec>([\s\S]*?)<\/UnicodeDec>/.exec(body)?.[1]?.trim());
    const lig = decodeXml(/<Ligature>([\s\S]*?)<\/Ligature>/.exec(body)?.[1] ?? "");
    const skipSpace = /<SkipSpace>([\s\S]*?)<\/SkipSpace>/.exec(body)?.[1]?.trim() ?? "";
    if (font && !Number.isNaN(dec)) {
      ligatureMap.set(`${font}:${dec}`, { ligature: lig, skipSpace });
    }
  }
  return { ligatureMap };
}

function toFixedNumber(value) {
  return Number(value.toFixed(3));
}

function glyphsToRuns(page) {
  const pageHeight = page.getBounds()[3];
  const events = [];
  let spanMeta = null;
  const device = new mupdf.Device({
    fillText(text, ctm) {
      text.walk({
        beginSpan(font, trm, wmode, bidi, markupDirection, language) {
          spanMeta = { fontName: font?.getName?.() ?? "Unknown", ctm, wmode, bidi, markupDirection, language, spanTrm: trm };
        },
        showGlyph(font, trm, glyph, unicode, wmode, bidi) {
          const fontName = font?.getName?.() ?? spanMeta?.fontName ?? "Unknown";
          const scaleX = Math.abs(spanMeta?.ctm?.[0] ?? 1);
          const scaleY = Math.abs(spanMeta?.ctm?.[3] ?? 1);
          const x = toFixedNumber((trm[4] ?? 0) * scaleX);
          const y = toFixedNumber(pageHeight - Math.abs((trm[5] ?? 0) * scaleY));
          const fontSize = toFixedNumber(Math.abs((trm[3] ?? 0) * scaleY));
          events.push({
            fontName,
            glyph,
            unicode,
            text: unicode > 0 ? String.fromCodePoint(unicode) : "",
            x,
            y,
            bottom: y,
            fontSize,
            wmode,
            bidi,
          });
        },
        endSpan() {
          spanMeta = null;
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

  const runs = [];
  let current = null;
  let lastY = null;
  let lastFont = null;
  const yTolerance = 0.25;

  for (const event of events) {
    const newLine = lastY !== null && Math.abs(event.y - lastY) > yTolerance;
    const newRun = !current || event.fontName !== lastFont || newLine;

    if (newRun) {
      if (current) {
        current.lineBreak = newLine;
        runs.push(current);
      }
      current = {
        pageNumber: targetPageNumber,
        fontName: event.fontName,
        x: event.x,
        y: event.y,
        bottom: event.bottom,
        fontSize: event.fontSize,
        text: event.text,
        lineBreak: false,
      };
    } else {
      current.text += event.text;
    }

    lastY = event.y;
    lastFont = event.fontName;
  }

  if (current) {
    runs.push(current);
  }

  return runs;
}

function serializeRuns(runs) {
  return runs
    .map((run) => {
      const prefix = run.lineBreak ? lineMarker : "";
      return `${prefix}${run.fontName}<=;=>${run.x}|${run.y}|${run.bottom}|${run.fontSize}<=;=>${run.text}<=!=>`;
    })
    .join("\n");
}

const doc = mupdf.Document.openDocument(pdfPath);
const page = doc.loadPage(pageIndex);
const runs = glyphsToRuns(page);
const mappings = loadLigatureMap(path.join(repoRoot, "UnicodeToInpage", "NastLig.xml"));
const transformed = transformLegacyRuns(runs, mappings, {
  skipEnglishWords: true,
  lineFeed: true,
  newlineMode: "paragraph",
  swapText: true,
}).trim();

fs.writeFileSync(outputRawPath, serializeRuns(runs), "utf8");
fs.writeFileSync(outputTextPath, transformed, "utf8");
fs.writeFileSync(outputReportPath, JSON.stringify({
  pdfPath,
  targetPageNumber,
  runCount: runs.length,
  transformedLength: transformed.length,
  sampleRuns: runs.slice(0, 40),
  preview: transformed.slice(0, 1000),
}, null, 2), "utf8");

console.log(`runCount=${runs.length}`);
console.log(`transformedLength=${transformed.length}`);
console.log(`raw=${outputRawPath}`);
console.log(`text=${outputTextPath}`);
