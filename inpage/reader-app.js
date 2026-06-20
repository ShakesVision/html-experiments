import { parseInpArrayBuffer, preloadBidiMappings } from "./shared/inp-browser-parser.js";
import { loadBidiMappings } from "./shared/xml-loader.js";
import { createBidiConverter } from "./shared/bidi-converter.js";

const state = { doc: null, fontSize: 28, matches: [], matchIndex: -1 };
let converter = null;

const el = (id) => document.getElementById(id);
const reading = el("reading");
const meta = el("meta");
const docTitle = el("docTitle");
const emptyState = el("emptyState");
const progressBar = el("progressBar");
const searchInput = el("searchInput");
const searchCount = el("searchCount");

/* ----------------------------- Reader ----------------------------- */

function flattenToBlocks(doc) {
  // Native shape from the parser.
  if (Array.isArray(doc.blocks)) return doc.blocks;
  // Backward compatibility with older page-based AST JSON files.
  const blocks = [];
  for (const page of doc.pages || []) {
    for (const para of page.paragraphs || []) {
      const text = (para.runs || []).map((r) => r.text || "").join("").trim();
      if (text) blocks.push({ text, kind: "para" });
    }
    blocks.push({ text: "", kind: "spacer" });
  }
  return blocks;
}

function renderDoc(doc) {
  state.doc = doc;
  clearSearch();
  reading.innerHTML = "";

  const blocks = flattenToBlocks(doc);
  const frag = document.createDocumentFragment();

  for (const block of blocks) {
    if (block.kind === "spacer") {
      const hr = document.createElement("div");
      hr.className = "reader-spacer";
      frag.appendChild(hr);
      continue;
    }
    const p = document.createElement("p");
    p.className = "reader-line";
    p.textContent = block.text;
    frag.appendChild(p);
  }
  reading.appendChild(frag);

  const m = doc.metadata || {};
  const name = m.source_file || "document";
  docTitle.textContent = name.replace(/\.(inp|json)$/i, "");
  const variant = m.inpage_variant ? `InPage${m.inpage_variant}` : "AST";
  const words = m.word_count != null ? m.word_count.toLocaleString() : "—";
  const lines = blocks.filter((b) => b.kind === "para").length;
  meta.textContent = `${variant} · ${lines.toLocaleString()} lines · ${words} words`;

  emptyState.style.display = "none";
  reading.style.display = "block";
  window.scrollTo({ top: 0 });
  updateProgress();
}

function applyFontSize() {
  reading.style.fontSize = `${state.fontSize}px`;
}

function updateProgress() {
  const h = document.documentElement;
  const scrollable = h.scrollHeight - h.clientHeight;
  const pct = scrollable > 0 ? (h.scrollTop / scrollable) * 100 : 0;
  progressBar.style.width = `${Math.min(100, Math.max(0, pct))}%`;
}

/* ----------------------------- Search ----------------------------- */

function clearSearch() {
  for (const mark of reading.querySelectorAll("mark.search-hit")) {
    const parent = mark.parentNode;
    parent.replaceChild(document.createTextNode(mark.textContent), mark);
    parent.normalize();
  }
  state.matches = [];
  state.matchIndex = -1;
  searchCount.textContent = "";
}

function runSearch(query) {
  clearSearch();
  // Match the NFC normalization the parser applies to block text, so queries
  // with composed/decomposed Urdu diacritics still match.
  const q = query.normalize("NFC").trim();
  if (q.length < 2) return;

  const lines = reading.querySelectorAll("p.reader-line");
  for (const line of lines) {
    const text = line.textContent;
    const idx = text.indexOf(q);
    if (idx === -1) continue;
    // Rebuild the paragraph with <mark> around each occurrence.
    line.innerHTML = "";
    let cursor = 0;
    let pos;
    while ((pos = text.indexOf(q, cursor)) !== -1) {
      if (pos > cursor) line.appendChild(document.createTextNode(text.slice(cursor, pos)));
      const mark = document.createElement("mark");
      mark.className = "search-hit";
      mark.textContent = text.slice(pos, pos + q.length);
      line.appendChild(mark);
      state.matches.push(mark);
      cursor = pos + q.length;
    }
    if (cursor < text.length) line.appendChild(document.createTextNode(text.slice(cursor)));
  }

  if (state.matches.length) {
    gotoMatch(0);
  } else {
    searchCount.textContent = "0 results";
  }
}

function gotoMatch(i) {
  if (!state.matches.length) return;
  if (state.matchIndex >= 0) state.matches[state.matchIndex]?.classList.remove("active");
  state.matchIndex = (i + state.matches.length) % state.matches.length;
  const mark = state.matches[state.matchIndex];
  mark.classList.add("active");
  mark.scrollIntoView({ block: "center", behavior: "smooth" });
  searchCount.textContent = `${state.matchIndex + 1} / ${state.matches.length}`;
}

/* ----------------------------- File I/O ----------------------------- */

async function loadFile(file) {
  if (file.name.toLowerCase().endsWith(".inp")) {
    const bytes = await file.arrayBuffer();
    renderDoc(await parseInpArrayBuffer(bytes, file.name));
  } else {
    const doc = JSON.parse(await file.text());
    if (!doc.metadata) doc.metadata = {};
    if (!doc.metadata.source_file) doc.metadata.source_file = file.name;
    renderDoc(doc);
  }
}

el("fileInput").addEventListener("change", async (ev) => {
  const file = ev.target.files?.[0];
  if (!file) return;
  meta.textContent = "Reading…";
  try {
    await loadFile(file);
  } catch (err) {
    meta.textContent = "";
    alert(`Failed to load file: ${err.message || err}`);
  }
});

el("zoomIn").addEventListener("click", () => {
  state.fontSize = Math.min(56, state.fontSize + 3);
  applyFontSize();
});
el("zoomOut").addEventListener("click", () => {
  state.fontSize = Math.max(16, state.fontSize - 3);
  applyFontSize();
});

searchInput.addEventListener("input", (e) => runSearch(e.target.value));
searchInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    gotoMatch(state.matchIndex + (e.shiftKey ? -1 : 1));
  }
  if (e.key === "Escape") {
    searchInput.value = "";
    clearSearch();
  }
});
el("searchPrev").addEventListener("click", () => gotoMatch(state.matchIndex - 1));
el("searchNext").addEventListener("click", () => gotoMatch(state.matchIndex + 1));

window.addEventListener("scroll", updateProgress, { passive: true });

/* ----------------------------- Tabs ----------------------------- */

function switchTab(tabId) {
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    const active = btn.dataset.tab === tabId;
    btn.classList.toggle("active", active);
    btn.setAttribute("aria-selected", active ? "true" : "false");
  });
  document.querySelectorAll(".tab-pane").forEach((pane) => {
    pane.classList.toggle("active", pane.id === `tab-${tabId}`);
  });
}
document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => switchTab(btn.dataset.tab));
});

/* ----------------------------- Converter ----------------------------- */

async function ensureConverter() {
  if (converter) return converter;
  const status = el("convStatus");
  status.textContent = "Loading mapping tables…";
  converter = createBidiConverter(await loadBidiMappings());
  status.textContent = "Mappings ready.";
  return converter;
}

function getConvDirection() {
  return document.querySelector('input[name="conv-dir"]:checked')?.value || "uni2inp";
}

el("convRunBtn").addEventListener("click", async () => {
  const input = el("convInput").value;
  const output = el("convOutput");
  try {
    const conv = await ensureConverter();
    if (getConvDirection() === "uni2inp") {
      const format = el("convFormat").value;
      const legacyText = conv.unicodeToInpageLegacyText(input);
      if (format === "prefixed") {
        let prefixed = "";
        for (let i = 0; i < legacyText.length; i++) prefixed += "" + legacyText[i];
        output.value = prefixed;
      } else {
        output.value = legacyText;
      }
      output.dir = "rtl";
    } else {
      const cleanInput = input.includes("") ? input.replace(//g, "") : input;
      output.value = conv.wrapRtlPreview(conv.inpageLegacyTextToUnicode(cleanInput));
      output.dir = "auto";
    }
  } catch (err) {
    el("convStatus").textContent = `Error: ${err.message || err}`;
  }
});

const formatSelectContainer = el("formatSelectContainer");
function updateFormatSelectorVisibility() {
  formatSelectContainer.style.display = getConvDirection() === "uni2inp" ? "inline-flex" : "none";
}
document.querySelectorAll('input[name="conv-dir"]').forEach((r) => {
  r.addEventListener("change", updateFormatSelectorVisibility);
});
updateFormatSelectorVisibility();

el("convCopyBtn").addEventListener("click", async () => {
  const text = el("convOutput").value;
  if (!text) return;
  await navigator.clipboard.writeText(text);
  el("convStatus").textContent = "Copied.";
});
el("convClearBtn").addEventListener("click", () => {
  el("convInput").value = "";
  el("convOutput").value = "";
});

/* ----------------------------- Init ----------------------------- */

applyFontSize();
preloadBidiMappings().catch(() => {});
