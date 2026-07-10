// Web-app controller. All extraction/format/gating logic lives in engine/*;
// this file is just wiring + DOM. The same engine powers the extension.
import { extract } from "./engine/extract.js";
import { buildSelector, generalizeToList } from "./engine/selector.js";
import { crawl } from "./engine/paginate.js";
import { toCSV, toJSON, toNDJSON, download } from "./engine/export.js";
import { defaultRecipe, normalizeRecipe, createRecipeStore } from "./engine/recipe.js";
import { createEntitlement } from "./engine/entitlement.js";
import { fetchHtml, parseHtml, detectTransport, buildProxyUrl } from "./engine/fetcher.js";

const $ = (id) => document.getElementById(id);
const PROXY_KEY = "scraperProxyUrl";

const recipes = createRecipeStore();
const ent = createEntitlement();

const state = {
  doc: null,          // parsed source Document
  sourceUrl: "",      // URL the doc came from (for pagination base)
  extensionReady: false,
  lastResult: null,   // { kind, columns?, records?, values?, text }
};

/* ----------------------------- Extension bridge ----------------------------- */
// Our own extension removes the CORS dependency. We detect it over
// window.postMessage and route fetches through its background worker.
const pending = new Map();
let msgSeq = 0;

window.addEventListener("message", (e) => {
  const d = e.data;
  if (!d || typeof d !== "object") return;
  if (d.type === "SCRAPER_PONG") setExtensionReady(true);
  if (d.type === "SCRAPER_FETCH_RESULT" && pending.has(d.id)) {
    const { resolve, reject } = pending.get(d.id);
    pending.delete(d.id);
    d.error ? reject(new Error(d.error)) : resolve(d.html);
  }
});

function pingExtension() {
  window.postMessage({ type: "SCRAPER_PING" }, "*");
}

function requestViaExtension(url) {
  return new Promise((resolve, reject) => {
    const id = `f${++msgSeq}`;
    pending.set(id, { resolve, reject });
    window.postMessage({ type: "SCRAPER_FETCH", id, url }, "*");
    setTimeout(() => {
      if (pending.has(id)) { pending.delete(id); reject(new Error("extension timeout")); }
    }, 20000);
  });
}

function setExtensionReady(on) {
  state.extensionReady = on;
  const badge = $("connBadge");
  badge.textContent = on ? "Extension connected" : "No extension";
  badge.classList.toggle("on", on);
  refreshTransportLabel();
}

/* ----------------------------- Transport ----------------------------- */
function currentProxy() {
  return ($("proxyInput").value || "").trim();
}
function currentTransport() {
  return detectTransport({ proxy: currentProxy(), extension: state.extensionReady });
}
function refreshTransportLabel() {
  $("transportLabel").textContent = currentTransport();
}

async function fetchDoc(url) {
  const transport = currentTransport();
  const html = await fetchHtml(url, {
    transport,
    proxy: currentProxy(),
    requestViaExtension,
  });
  return parseHtml(html);
}

/* ----------------------------- Entitlement / gating ----------------------------- */
function refreshTier() {
  const pro = ent.isPro();
  const badge = $("tierBadge");
  badge.textContent = pro ? "Pro" : "Free";
  badge.className = "tier-badge " + (pro ? "pro" : "free");
  document.querySelectorAll(".lock-chip").forEach((chip) => {
    chip.hidden = pro; // hide the "Pro" tags once unlocked
  });
}

function gate(feature) {
  if (ent.can(feature)) return true;
  openLicense();
  return false;
}

/* ----------------------------- Source loading ----------------------------- */
function sourceMode() {
  return document.querySelector('input[name="source"]:checked').value;
}

async function loadSource() {
  setMeta("loading…");
  try {
    if (sourceMode() === "paste") {
      const html = $("pasteInput").value;
      if (!html.trim()) { setMeta("paste some HTML first", "err"); return; }
      state.doc = parseHtml(html);
      state.sourceUrl = "";
    } else {
      const url = $("urlInput").value.trim();
      if (!url) { setMeta("enter a URL first", "err"); return; }
      state.doc = await fetchDoc(url);
      state.sourceUrl = url;
    }
    renderPreview(state.doc);
    $("pickBtn").disabled = false;
    setMeta("loaded — pick an element, or type a selector");
  } catch (err) {
    const hint = state.extensionReady ? "" : " — install the extension for CORS-blocked or JavaScript sites.";
    setMeta("couldn't load: " + (err.message || err) + hint, "err");
  }
}

/* ----------------------------- Preview iframe + picker ----------------------------- */
let picking = false;

function renderPreview(doc) {
  const wrap = $("previewWrap");
  const frame = $("previewFrame");
  wrap.classList.remove("hidden");
  // Static render for structure only (no scripts run — sandbox has no allow-scripts).
  frame.srcdoc = doc.documentElement ? doc.documentElement.outerHTML : "";
  frame.onload = () => { if (picking) armPicker(); };
}

function frameDoc() {
  const frame = $("previewFrame");
  try { return frame.contentDocument; } catch { return null; }
}

function togglePick() {
  picking = !picking;
  $("previewFrame").classList.toggle("picking", picking);
  $("pickStatus").textContent = picking ? "click an element to select it" : "loaded";
  $("pickBtn").textContent = picking ? "Picking… (click to cancel)" : "Pick element";
  if (picking) armPicker(); else disarmPicker();
}

function armPicker() {
  const d = frameDoc();
  if (!d) return;
  if (!d.getElementById("__scrHi")) {
    const style = d.createElement("style");
    style.id = "__scrHi";
    style.textContent = ".__scr_hover{outline:2px solid #3b5bdb !important;outline-offset:-1px;background:rgba(59,91,219,.08) !important;}";
    (d.head || d.documentElement).appendChild(style);
  }
  d.addEventListener("mouseover", onHover, true);
  d.addEventListener("click", onPick, true);
}
function disarmPicker() {
  const d = frameDoc();
  if (!d) return;
  d.removeEventListener("mouseover", onHover, true);
  d.removeEventListener("click", onPick, true);
  d.querySelectorAll(".__scr_hover").forEach((el) => el.classList.remove("__scr_hover"));
}
let hovered = null;
function onHover(e) {
  if (hovered) hovered.classList.remove("__scr_hover");
  hovered = e.target;
  if (hovered && hovered.classList) hovered.classList.add("__scr_hover");
}
function onPick(e) {
  e.preventDefault();
  e.stopPropagation();
  const d = frameDoc();
  const el = e.target;
  if (!el || !d) return;

  if (currentMode() === "records") {
    const g = generalizeToList(el, d);
    $("containerInput").value = g.container;
    renderFields(g.fields);
  } else {
    $("selectorInput").value = buildSelector(el, d);
  }
  togglePick();
  setMeta("selector captured from your click");
}

/* ----------------------------- Recipe form ----------------------------- */
function currentMode() {
  return document.querySelector('input[name="mode"]:checked').value;
}

function renderFields(fields) {
  const host = $("fields");
  host.innerHTML = "";
  (fields.length ? fields : [{ name: "", selector: "", type: "text", attr: "href" }]).forEach(addFieldRow);
}
function addFieldRow(field = { name: "", selector: "", type: "text", attr: "href" }) {
  const row = document.createElement("div");
  row.className = "field-row";
  row.innerHTML = `
    <input class="f-name" type="text" placeholder="column name" value="${escapeAttr(field.name)}" />
    <input class="f-sel" type="text" placeholder="selector (relative to row)" value="${escapeAttr(field.selector)}" />
    <select class="f-type">
      <option value="text">text</option>
      <option value="html">html</option>
      <option value="attr">attr</option>
    </select>
    <button type="button" class="rm" title="Remove column">✕</button>`;
  row.querySelector(".f-type").value = field.type || "text";
  row.querySelector(".rm").addEventListener("click", () => row.remove());
  $("fields").appendChild(row);
}

function readRecipe() {
  const r = defaultRecipe({ url: state.sourceUrl });
  if (currentMode() === "records") {
    r.container = $("containerInput").value.trim();
    r.fields = Array.from(document.querySelectorAll("#fields .field-row")).map((row) => ({
      name: row.querySelector(".f-name").value.trim(),
      selector: row.querySelector(".f-sel").value.trim(),
      type: row.querySelector(".f-type").value,
      attr: "href",
    }));
  } else {
    r.container = "";
    r.fields = [];
    r.selector = $("selectorInput").value.trim();
    r.mode = document.querySelector('input[name="smode"]:checked').value;
    r.extractType = document.querySelector('input[name="etype"]:checked').value;
    r.attr = $("attrInput").value.trim() || "href";
    r.index = parseInt($("indexInput").value, 10) || 1;
  }
  r.pagination = {
    mode: $("pagi").open && $("maxPagesInput").value > 1 ? "next" : "none",
    nextSelector: $("nextSelInput").value.trim(),
    maxPages: parseInt($("maxPagesInput").value, 10) || 1,
  };
  return normalizeRecipe(r);
}

function applyRecipe(r) {
  const isRecords = !!(r.container && r.fields.length);
  document.querySelector(`input[name="mode"][value="${isRecords ? "records" : "simple"}"]`).checked = true;
  syncModeVisibility();
  if (isRecords) {
    $("containerInput").value = r.container;
    renderFields(r.fields);
  } else {
    $("selectorInput").value = r.selector;
    document.querySelector(`input[name="smode"][value="${r.mode}"]`).checked = true;
    document.querySelector(`input[name="etype"][value="${r.extractType}"]`).checked = true;
    $("attrInput").value = r.attr;
    $("indexInput").value = r.index;
    syncAttrVisibility();
  }
  if (r.url) { $("urlInput").value = r.url; }
  $("nextSelInput").value = r.pagination.nextSelector || "";
  $("maxPagesInput").value = r.pagination.maxPages || 1;
}

/* ----------------------------- Extract ----------------------------- */
async function runExtract(e) {
  if (e) e.preventDefault();
  if (!state.doc) { setMeta("load a page or paste HTML first", "err"); return; }
  const recipe = readRecipe();

  // Auto-pagination is a Pro feature.
  const wantsPagination = recipe.pagination.mode !== "none" && recipe.pagination.maxPages > 1;
  if (wantsPagination && !gate("pagination")) return;

  try {
    let result;
    if (wantsPagination && recipe.container) {
      const pages = await crawl(
        (url) => fetchDoc(url),
        state.sourceUrl || location.href,
        recipe,
        { maxPages: recipe.pagination.maxPages },
      );
      const records = pages.flatMap((p) => p.records || []);
      result = { kind: "records", columns: pages[0]?.columns || [], records, count: records.length };
    } else {
      result = extract(state.doc, recipe);
    }
    showResult(result);
  } catch (err) {
    setMeta("extract failed: " + (err.message || err), "err");
  }
}

function showResult(result) {
  // Free-tier daily row cap.
  let count = result.kind === "records" ? result.records.length : result.count;
  let capped = false;
  if (!ent.isPro()) {
    const remaining = ent.rowsRemaining();
    if (count > remaining) {
      capped = true;
      if (result.kind === "records") result.records = result.records.slice(0, remaining);
      else if (result.values) { result.values = result.values.slice(0, remaining); result.text = result.values.join("\n"); }
      count = remaining;
    }
    ent.recordUsage(count);
  }
  state.lastResult = result;

  const tableWrap = $("resultTableWrap");
  const textArea = $("resultText");
  const empty = $("resultEmpty");
  empty.classList.add("hidden");

  if (result.kind === "records") {
    textArea.classList.add("hidden");
    tableWrap.classList.remove("hidden");
    tableWrap.innerHTML = renderTable(result.columns, result.records);
    setMeta(`${result.records.length} rows × ${result.columns.length} cols` + (capped ? " · free cap reached — go Pro for more" : ""), capped ? "err" : "ok");
  } else {
    tableWrap.classList.add("hidden");
    textArea.classList.remove("hidden");
    textArea.value = result.text || "";
    setMeta(`${result.count} match${result.count === 1 ? "" : "es"}` + (capped ? " · free cap reached" : ""), result.count ? "ok" : "err");
  }
}

function renderTable(columns, records) {
  const cols = columns.length ? columns : ["value"];
  const head = `<tr>${cols.map((c) => `<th>${escapeHtml(c)}</th>`).join("")}</tr>`;
  const body = records
    .map((r) => `<tr>${cols.map((c) => `<td title="${escapeAttr(String(r[c] ?? ""))}">${escapeHtml(String(r[c] ?? ""))}</td>`).join("")}</tr>`)
    .join("");
  return `<table class="data"><thead>${head}</thead><tbody>${body}</tbody></table>`;
}

/* ----------------------------- Export ----------------------------- */
function recordsForExport() {
  const r = state.lastResult;
  if (!r) return { records: [], columns: [] };
  if (r.kind === "records") return { records: r.records, columns: r.columns };
  return { records: (r.values || []).map((v) => ({ value: v })), columns: ["value"] };
}
function exportAs(kind) {
  const r = state.lastResult;
  if (!r) { setMeta("nothing to export yet", "err"); return; }
  if (kind === "ndjson" && !gate("exportNdjson")) return;
  const { records, columns } = recordsForExport();
  const base = "scrape-" + new Date().toISOString().slice(0, 10);
  if (kind === "csv") download(base + ".csv", toCSV(records, columns), "text/csv;charset=utf-8");
  if (kind === "json") download(base + ".json", toJSON(records), "application/json");
  if (kind === "ndjson") download(base + ".ndjson", toNDJSON(records), "application/x-ndjson");
}
async function copyResult() {
  const r = state.lastResult;
  if (!r) return;
  const text = r.kind === "records" ? toCSV(r.records, r.columns) : (r.text || "");
  try { await navigator.clipboard.writeText(text); } catch { /* ignore */ }
  const t = $("copyToast"); t.classList.add("show"); setTimeout(() => t.classList.remove("show"), 1400);
}

/* ----------------------------- Recipes ----------------------------- */
function renderRecipeList() {
  const host = $("recipeList");
  host.innerHTML = "";
  const items = recipes.list();
  if (!items.length) {
    host.innerHTML = `<li class="preset-empty">No recipes yet.</li>`;
    return;
  }
  items.forEach(({ name }) => {
    const li = document.createElement("li");
    li.className = "preset";
    li.innerHTML = `<span class="name" title="${escapeAttr(name)}">${escapeHtml(name)}</span><button class="del" aria-label="Delete">Delete</button>`;
    li.querySelector(".name").addEventListener("click", () => {
      const r = recipes.get(name);
      if (r) { applyRecipe(r); setMeta(`loaded recipe “${name}”`); }
    });
    li.querySelector(".del").addEventListener("click", () => { recipes.remove(name); renderRecipeList(); });
    host.appendChild(li);
  });
}
function saveRecipe() {
  const suggested = (() => { try { return new URL($("urlInput").value).hostname; } catch { return "recipe"; } })();
  const name = prompt("Name this recipe:", suggested);
  if (!name) return;
  recipes.save(name, readRecipe());
  renderRecipeList();
  setMeta(`saved recipe “${name}”`, "ok");
}

/* ----------------------------- License modal ----------------------------- */
function openLicense() { $("licenseModal").classList.remove("hidden"); $("licenseInput").focus(); }
function closeLicense() { $("licenseModal").classList.add("hidden"); }
function applyLicense() {
  const ok = ent.setLicense($("licenseInput").value);
  const msg = $("licenseMsg");
  if (ok) { msg.textContent = "Unlocked. Enjoy Pro."; msg.style.color = "var(--good)"; refreshTier(); setTimeout(closeLicense, 900); }
  else { msg.textContent = "That key doesn't look right (format SCR-XXXX-XXXX)."; msg.style.color = "var(--danger)"; }
}

/* ----------------------------- helpers + wiring ----------------------------- */
function setMeta(text, kind) {
  const el = $("resultMeta");
  el.textContent = text;
  el.className = "result-meta" + (kind ? " " + kind : "");
}
function escapeHtml(s) { return String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c])); }
function escapeAttr(s) { return String(s).replace(/"/g, "&quot;").replace(/</g, "&lt;"); }

function syncModeVisibility() {
  const records = currentMode() === "records";
  $("recordsMode").classList.toggle("hidden", !records);
  $("simpleMode").classList.toggle("hidden", records);
}
function syncSourceVisibility() {
  const url = sourceMode() === "url";
  $("urlSource").classList.toggle("hidden", !url);
  $("pasteSource").classList.toggle("hidden", url);
}
function syncAttrVisibility() {
  const isAttr = document.querySelector('input[name="etype"]:checked').value === "attr";
  $("attrInput").classList.toggle("hidden", !isAttr);
}

function init() {
  $("proxyInput").value = localStorage.getItem(PROXY_KEY) || "";
  $("proxyInput").addEventListener("change", () => { localStorage.setItem(PROXY_KEY, currentProxy()); refreshTransportLabel(); });

  $("toggleSidebarBtn").addEventListener("click", () => {
    $("shell").classList.toggle("collapsed");
    $("sidebar").classList.toggle("open");
  });

  document.querySelectorAll('input[name="source"]').forEach((r) => r.addEventListener("change", syncSourceVisibility));
  document.querySelectorAll('input[name="mode"]').forEach((r) => r.addEventListener("change", syncModeVisibility));
  document.querySelectorAll('input[name="etype"]').forEach((r) => r.addEventListener("change", syncAttrVisibility));

  $("loadBtn").addEventListener("click", loadSource);
  $("pickBtn").addEventListener("click", togglePick);
  $("addFieldBtn").addEventListener("click", () => addFieldRow());
  $("scraperForm").addEventListener("submit", runExtract);
  $("saveRecipeBtn").addEventListener("click", saveRecipe);

  $("copyBtn").addEventListener("click", copyResult);
  $("csvBtn").addEventListener("click", () => exportAs("csv"));
  $("jsonBtn").addEventListener("click", () => exportAs("json"));
  $("ndjsonBtn").addEventListener("click", () => exportAs("ndjson"));

  $("tierBadge").addEventListener("click", openLicense);
  $("licenseClose").addEventListener("click", closeLicense);
  $("licenseApply").addEventListener("click", applyLicense);
  document.querySelectorAll(".lock-chip").forEach((chip) =>
    chip.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); openLicense(); }));
  $("licenseModal").addEventListener("click", (e) => { if (e.target === $("licenseModal")) closeLicense(); });

  renderFields([{ name: "", selector: "", type: "text", attr: "href" }]);
  renderRecipeList();
  refreshTier();
  syncSourceVisibility();
  syncModeVisibility();
  syncAttrVisibility();
  refreshTransportLabel();

  // Look for our extension a few times after load.
  pingExtension();
  let tries = 0;
  const t = setInterval(() => { pingExtension(); if (++tries > 5 || state.extensionReady) clearInterval(t); }, 700);
}

init();
