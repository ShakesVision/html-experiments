// Popup controller. Drives the active tab (inject content.js, message it to
// pick / live-extract), reuses the shared engine for formatting/gating, and
// unlocks Pro. The heavy lifting (live-DOM extract, picker) happens in the
// page via content.js; the popup orchestrates and shows results.
import { toCSV, toJSON } from "./engine/export.js";
import { createEntitlement } from "./engine/entitlement.js";
import { normalizeRecipe, defaultRecipe } from "./engine/recipe.js";

const $ = (id) => document.getElementById(id);
const ent = createEntitlement({
  get: (k) => localStorage.getItem(k),
  set: (k, v) => localStorage.setItem(k, v),
});

let tabId = null;
let lastResult = null;

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function ensureContent() {
  await chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] });
}

function mode() { return document.querySelector('input[name="mode"]:checked').value; }

function setMeta(text, kind) { const m = $("meta"); m.textContent = text; m.className = "meta" + (kind ? " " + kind : ""); }

function refreshTier() {
  const pro = ent.isPro();
  $("tierBadge").textContent = pro ? "Pro" : "Free";
  $("tierBadge").className = "tier " + (pro ? "pro" : "free");
}

function gate(feature) {
  if (ent.can(feature)) return true;
  $("licenseModal").classList.remove("hidden");
  return false;
}

/* ---- fields ---- */
function addFieldRow(field = { name: "", selector: "", type: "text" }) {
  const row = document.createElement("div");
  row.className = "field-row";
  row.innerHTML =
    `<input class="f-name" placeholder="column" value="${(field.name || "").replace(/"/g, "&quot;")}" />` +
    `<input class="f-sel" placeholder="selector" value="${(field.selector || "").replace(/"/g, "&quot;")}" />` +
    `<button class="rm" title="remove">✕</button>`;
  row.querySelector(".rm").addEventListener("click", () => row.remove());
  $("fields").appendChild(row);
}
function renderFields(fields) {
  $("fields").innerHTML = "";
  (fields && fields.length ? fields : [{ name: "", selector: "" }]).forEach(addFieldRow);
}

function readRecipe() {
  const r = defaultRecipe();
  if (mode() === "records") {
    r.container = $("containerInput").value.trim();
    r.fields = Array.from(document.querySelectorAll("#fields .field-row")).map((row) => ({
      name: row.querySelector(".f-name").value.trim(),
      selector: row.querySelector(".f-sel").value.trim(),
      type: "text",
    }));
  } else {
    r.container = "";
    r.selector = $("selectorInput").value.trim();
    r.mode = "all";
    r.extractType = "text";
  }
  return normalizeRecipe(r);
}

function applyPicked(recipe) {
  if (recipe.container) {
    document.querySelector('input[name="mode"][value="records"]').checked = true;
    syncMode();
    $("containerInput").value = recipe.container;
    renderFields(recipe.fields);
  } else if (recipe.selector) {
    document.querySelector('input[name="mode"][value="simple"]').checked = true;
    syncMode();
    $("selectorInput").value = recipe.selector;
  }
}

/* ---- actions ---- */
async function startPick() {
  if (!gate("picker")) return;
  try {
    await ensureContent();
    await chrome.tabs.sendMessage(tabId, { type: "START_PICK", mode: mode() });
    setMeta("Click an element on the page, then reopen this popup.");
    window.close(); // let the user interact with the page
  } catch (err) {
    setMeta("couldn't start picker: " + err.message, "err");
  }
}

async function scrapePage() {
  if (!gate("liveScrape")) return;
  const recipe = readRecipe();
  if (!recipe.container && !recipe.selector) { setMeta("pick an element or type a selector", "err"); return; }
  try {
    await ensureContent();
    const res = await chrome.tabs.sendMessage(tabId, { type: "LIVE_EXTRACT", recipe });
    if (!res || !res.ok) throw new Error(res && res.error ? res.error : "no response");
    showResult(res.result);
  } catch (err) {
    setMeta("scrape failed: " + err.message, "err");
  }
}

function showResult(result) {
  lastResult = result;
  $("resultWrap").classList.remove("hidden");
  if (result.kind === "records") {
    $("count").textContent = `${result.records.length} rows × ${result.columns.length} cols`;
    const cols = result.columns.length ? result.columns : ["value"];
    $("tableWrap").innerHTML =
      `<table><thead><tr>${cols.map((c) => `<th>${esc(c)}</th>`).join("")}</tr></thead><tbody>` +
      result.records.map((r) => `<tr>${cols.map((c) => `<td>${esc(String(r[c] ?? ""))}</td>`).join("")}</tr>`).join("") +
      `</tbody></table>`;
    setMeta("done", "ok");
  } else {
    $("count").textContent = `${result.count} matches`;
    $("tableWrap").innerHTML = `<table><tbody>${(result.values || []).map((v) => `<tr><td>${esc(v)}</td></tr>`).join("")}</tbody></table>`;
    setMeta("done", "ok");
  }
}

function exportRecords() {
  if (!lastResult) return { records: [], columns: [] };
  if (lastResult.kind === "records") return { records: lastResult.records, columns: lastResult.columns };
  return { records: (lastResult.values || []).map((v) => ({ value: v })), columns: ["value"] };
}
function dl(name, text, mime) {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  chrome.downloads
    ? chrome.downloads.download({ url, filename: name })
    : Object.assign(document.createElement("a"), { href: url, download: name }).click();
}

function esc(s) { return String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c])); }
function syncMode() {
  const rec = mode() === "records";
  $("recordsMode").classList.toggle("hidden", !rec);
  $("simpleMode").classList.toggle("hidden", rec);
}

async function init() {
  const tab = await activeTab();
  tabId = tab && tab.id;
  $("pageline").textContent = tab ? tab.url : "no active tab";

  // If the user just picked something on the page, load it.
  const { scrapePicked } = await chrome.storage.local.get("scrapePicked");
  if (scrapePicked) {
    applyPicked(scrapePicked);
    await chrome.storage.local.remove("scrapePicked");
    setMeta("selection loaded — press Scrape page");
  } else {
    renderFields([{ name: "", selector: "" }]);
  }

  document.querySelectorAll('input[name="mode"]').forEach((r) => r.addEventListener("change", syncMode));
  $("pickBtn").addEventListener("click", startPick);
  $("scrapeBtn").addEventListener("click", scrapePage);
  $("addFieldBtn").addEventListener("click", () => addFieldRow());
  $("copyBtn").addEventListener("click", async () => {
    const { records, columns } = exportRecords();
    await navigator.clipboard.writeText(toCSV(records, columns)).catch(() => {});
  });
  $("csvBtn").addEventListener("click", () => { const { records, columns } = exportRecords(); dl("scrape.csv", toCSV(records, columns), "text/csv"); });
  $("jsonBtn").addEventListener("click", () => { const { records } = exportRecords(); dl("scrape.json", toJSON(records), "application/json"); });

  $("tierBadge").addEventListener("click", () => $("licenseModal").classList.remove("hidden"));
  $("licenseClose").addEventListener("click", () => $("licenseModal").classList.add("hidden"));
  $("licenseApply").addEventListener("click", () => {
    const ok = ent.setLicense($("licenseInput").value);
    $("licenseMsg").textContent = ok ? "Unlocked." : "Key format is SCR-XXXX-XXXX.";
    $("licenseMsg").style.color = ok ? "var(--good)" : "var(--danger)";
    if (ok) { refreshTier(); setTimeout(() => $("licenseModal").classList.add("hidden"), 800); }
  });

  syncMode();
  refreshTier();
}

init();
