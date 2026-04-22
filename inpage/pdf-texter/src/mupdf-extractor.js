// import mupdf from "../node_modules/mupdf/dist/mupdf.js";
// import * as mupdf from "https://esm.sh/mupdf";
import * as mupdf from "https://cdn.jsdelivr.net/npm/mupdf/dist/mupdf.js";
function toFixedNumber(value) {
  return Number((Number.isFinite(value) ? value : 0).toFixed(3));
}

function getScale(value, fallback = 1) {
  const abs = Math.abs(value);
  return Number.isFinite(abs) && abs > 0 ? abs : fallback;
}

function normalizeGlyphChar(unicode) {
  return unicode > 0 ? String.fromCodePoint(unicode) : "";
}

function collectGlyphEvents(page) {
  const bounds = page.getBounds();
  const pageHeight = Array.isArray(bounds) ? (bounds[3] ?? 0) : 0;
  const events = [];

  const device = new mupdf.Device({
    fillText(text, ctm) {
      let spanFontName = "Unknown";
      let scaleX = 1;
      let scaleY = 1;

      text.walk({
        beginSpan(font) {
          spanFontName = font?.getName?.() ?? "Unknown";
          scaleX = getScale(ctm?.[0], 1);
          scaleY = getScale(ctm?.[3], 1);
        },
        showGlyph(font, trm, glyph, unicode, wmode, bidi) {
          const resolvedFont = font?.getName?.() ?? spanFontName;
          const x = toFixedNumber((trm?.[4] ?? 0) * scaleX);
          const y = toFixedNumber(
            pageHeight - Math.abs((trm?.[5] ?? 0) * scaleY),
          );
          const fontSize = toFixedNumber(
            Math.abs((trm?.[3] ?? 0) * scaleY) ||
              Math.abs((trm?.[0] ?? 0) * scaleX),
          );

          events.push({
            fontName: resolvedFont,
            glyph,
            unicode,
            text: normalizeGlyphChar(unicode),
            x,
            y,
            bottom: y,
            fontSize,
            wmode,
            bidi,
          });
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

  return events.filter((event) => event.text);
}

function getLineTolerance(events) {
  const fontSizes = events
    .map((event) => event.fontSize)
    .filter((value) => Number.isFinite(value) && value > 0)
    .sort((left, right) => left - right);

  const median = fontSizes.length
    ? fontSizes[Math.floor(fontSizes.length / 2)]
    : 18;
  return Math.max(3.5, Math.min(7, median * 0.28));
}

function clusterGlyphEvents(events) {
  if (!events.length) {
    return [];
  }

  const tolerance = getLineTolerance(events);
  const lines = [];
  let currentLine = null;

  for (const event of events) {
    if (!currentLine) {
      currentLine = {
        anchorY: event.y,
        events: [event],
      };
      continue;
    }

    if (Math.abs(event.y - currentLine.anchorY) <= tolerance) {
      currentLine.events.push(event);
      const total = currentLine.events.reduce((sum, item) => sum + item.y, 0);
      currentLine.anchorY = total / currentLine.events.length;
      continue;
    }

    lines.push(currentLine);
    currentLine = {
      anchorY: event.y,
      events: [event],
    };
  }

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines;
}

function buildRunsFromLines(lines, pageNumber) {
  const runs = [];

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];
    let currentRun = null;

    for (const event of line.events) {
      if (!currentRun || currentRun.fontName !== event.fontName) {
        currentRun = {
          pageNumber,
          fontName: event.fontName,
          x: event.x,
          y: toFixedNumber(line.anchorY),
          bottom: toFixedNumber(line.anchorY),
          fontSize: event.fontSize,
          text: event.text,
          lineBreak: false,
        };

        if (lineIndex > 0 && line.events[0] === event) {
          currentRun.lineBreak = true;
        }

        runs.push(currentRun);
        continue;
      }

      currentRun.text += event.text;
    }
  }

  return runs;
}

export async function openMuPdfDocument(
  arrayBuffer,
  fileName = "document.pdf",
) {
  const bytes =
    arrayBuffer instanceof Uint8Array
      ? arrayBuffer
      : new Uint8Array(arrayBuffer);
  const doc = mupdf.Document.openDocument(bytes, "application/pdf");

  return {
    doc,
    pageCount: doc.countPages(),
    fileName,
  };
}

export function extractLegacyLikeRuns(doc, pageNumber) {
  const page = doc.loadPage(pageNumber - 1);
  const glyphEvents = collectGlyphEvents(page);
  const lines = clusterGlyphEvents(glyphEvents);
  const runs = buildRunsFromLines(lines, pageNumber);
  page.destroy?.();
  return runs;
}

export { collectGlyphEvents, clusterGlyphEvents, buildRunsFromLines };
