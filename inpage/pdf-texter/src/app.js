import { loadLegacyMappings } from "./xml-loader.js";
import { openMuPdfDocument, extractLegacyLikeRuns } from "./mupdf-extractor.js";
import { transformLegacyRuns } from "./legacy-transform.js";

const elements = {
  pdfFile: document.querySelector("#pdf-file"),
  pageMode: document.querySelector("#page-mode"),
  startPage: document.querySelector("#start-page"),
  endPage: document.querySelector("#end-page"),
  breakMode: document.querySelector("#break-mode"),
  skipEnglish: document.querySelector("#skip-english"),
  lineFeed: document.querySelector("#line-feed"),
  swapText: document.querySelector("#swap-text"),
  pageSeparators: document.querySelector("#page-separators"),
  processBtn: document.querySelector("#process-btn"),
  copyBtn: document.querySelector("#copy-btn"),
  output: document.querySelector("#output"),
  debug: document.querySelector("#debug"),
  results: document.querySelector("#results"),
  pageSummary: document.querySelector("#page-summary"),
  statusBadge: document.querySelector("#status-badge"),
  statusDetail: document.querySelector("#status-detail"),
};

let mappingsPromise = null;

function getQueryConfig() {
  const url = new URL(window.location.href);
  return {
    pdf: url.searchParams.get("pdf"),
    autoRun: url.searchParams.get("autorun") === "1",
  };
}

function setStatus(title, detail) {
  elements.statusBadge.textContent = title;
  elements.statusDetail.textContent = detail;
}

function getOptions() {
  return {
    skipEnglishWords: elements.skipEnglish.checked,
    lineFeed: elements.lineFeed.checked,
    newlineMode: elements.breakMode.value,
    swapText: elements.swapText.checked,
  };
}

function clampPage(page, pageCount) {
  return Math.max(1, Math.min(pageCount, page));
}

function getSelectedPages(pageCount) {
  const mode = elements.pageMode.value;
  const start = clampPage(Number(elements.startPage.value || 1), pageCount);
  const end = clampPage(Number(elements.endPage.value || start), pageCount);

  if (mode === "all") {
    return Array.from({ length: pageCount }, (_, index) => index + 1);
  }
  if (mode === "range") {
    const first = Math.min(start, end);
    const last = Math.max(start, end);
    return Array.from({ length: last - first + 1 }, (_, index) => first + index);
  }
  return [start];
}

function renderDebug(lines) {
  elements.debug.textContent = lines.join("\n");
}

function escapeHtml(text) {
  return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function renderPageResults(results) {
  elements.results.innerHTML = results
    .map(
      (result) => `
        <article class="rounded-2xl border border-stone-800 bg-stone-950/70 p-4">
          <div class="mb-2 flex items-center justify-between">
            <h3 class="text-sm font-semibold text-amber-100">Page ${result.pageNumber}</h3>
            <span class="text-xs text-stone-400">${result.runCount} runs</span>
          </div>
          <p class="text-sm leading-7 text-stone-300">${escapeHtml(result.preview)}</p>
        </article>
      `
    )
    .join("");
}

async function ensureMappings() {
  if (!mappingsPromise) {
    mappingsPromise = loadLegacyMappings();
  }
  return mappingsPromise;
}

async function getPdfFileLike() {
  const selected = elements.pdfFile.files?.[0];
  if (selected) {
    return selected;
  }

  const query = getQueryConfig();
  if (!query.pdf) {
    return null;
  }

  const response = await fetch(query.pdf);
  const bytes = await response.blob();
  return new File([bytes], query.pdf.split("/").at(-1) || "sample.pdf", {
    type: "application/pdf",
  });
}

function buildPageOutput(pageNumber, runs, mappings, options) {
  const transformed = transformLegacyRuns(runs, mappings, options).trim();
  return {
    pageNumber,
    runCount: runs.length,
    transformed,
    preview: transformed.slice(0, 220) || "[no output]",
  };
}

function renderProcessedDocument(pageResults, debugLines) {
  const documentChunks = pageResults.map((result) =>
    elements.pageSeparators.checked
      ? `===== Page ${result.pageNumber} =====\n${result.transformed}`
      : result.transformed
  );

  elements.output.value = documentChunks.join("\n\n");
  renderPageResults(pageResults);
  renderDebug(debugLines);
}

async function processDocument() {
  const file = await getPdfFileLike();
  if (!file) {
    setStatus("Missing PDF", "Choose a PDF file before processing.");
    return;
  }

  setStatus("Loading", "Reading MuPDF engine, XML mappings, and PDF bytes.");
  const [mappings, bytes] = await Promise.all([ensureMappings(), file.arrayBuffer()]);
  const pdfDocument = await openMuPdfDocument(bytes, file.name);
  const selectedPages = getSelectedPages(pdfDocument.pageCount);
  const options = getOptions();

  elements.startPage.max = String(pdfDocument.pageCount);
  elements.endPage.max = String(pdfDocument.pageCount);
  elements.pageSummary.textContent = `${selectedPages.length} page(s) selected out of ${pdfDocument.pageCount}.`;

  const pageResults = [];
  const debugLines = [
    "Engine: MuPDF (frontend-only)",
    `PDF: ${file.name}`,
    `Total pages: ${pdfDocument.pageCount}`,
    `Selected pages: ${selectedPages.join(", ")}`,
    `Break mode: ${options.newlineMode}`,
    `Skip English: ${options.skipEnglishWords}`,
    `Line feed: ${options.lineFeed}`,
    `Swap ﷺ lines: ${options.swapText}`,
  ];

  for (const pageNumber of selectedPages) {
    setStatus("Processing", `Extracting page ${pageNumber} of ${pdfDocument.pageCount} with MuPDF.`);
    const runs = extractLegacyLikeRuns(pdfDocument.doc, pageNumber, options);
    const result = buildPageOutput(pageNumber, runs, mappings, options);
    pageResults.push(result);
    const fontSummary = [...new Set(runs.map((run) => run.fontName))].slice(0, 18);
    debugLines.push(`Page ${pageNumber}: ${runs.length} runs, ${result.transformed.length} output chars`);
    debugLines.push(`Page ${pageNumber} fonts: ${fontSummary.join(", ")}`);
  }

  renderProcessedDocument(pageResults, debugLines);
  setStatus("Complete", `Processed ${selectedPages.length} page(s) fully in-browser with MuPDF.`);
}

elements.processBtn.addEventListener("click", () => {
  processDocument().catch((error) => {
    console.error(error);
    renderDebug([String(error?.stack || error)]);
    setStatus("Error", error?.message || "Unexpected processing error.");
  });
});

elements.copyBtn.addEventListener("click", async () => {
  if (!elements.output.value) {
    return;
  }
  await navigator.clipboard.writeText(elements.output.value);
  setStatus("Copied", "Processed text copied to clipboard.");
});

elements.pageMode.addEventListener("change", () => {
  const isAll = elements.pageMode.value === "all";
  elements.startPage.disabled = isAll;
  elements.endPage.disabled = isAll;
});

setStatus("Waiting for PDF", "Load a PDF to process it fully in-browser with MuPDF.");

const query = getQueryConfig();
if (query.autoRun && query.pdf) {
  processDocument().catch((error) => {
    console.error(error);
    renderDebug([String(error?.stack || error)]);
    setStatus("Error", error?.message || "Unexpected processing error.");
  });
}
