/* ==========================================================
   INTERLOCUTOR — جدال
   Map a live debate into a logical structure the audience can follow:
   argument → parts → Support / Counter / Split / Both → … → agree-to-disagree.
   Moderator-driven, offline, IndexedDB-persisted. (AI assist can plug in later.)
   ========================================================== */
"use strict";

/* ----------------------------------------------------------
   REFERENCE DATA
---------------------------------------------------------- */
const ARG_TYPES = [
  { id: "claim", en: "Plain claim", ur: "دعویٰ", tip: "An assertion stated without formal reasoning." },
  { id: "deductive", en: "Deductive", ur: "استخراجی", tip: "Premises, if true, guarantee the conclusion." },
  { id: "inductive", en: "Inductive", ur: "استقرائی", tip: "Generalises from cases; conclusion is probable." },
  { id: "abductive", en: "Abductive", ur: "تمثیلِ احسن", tip: "Inference to the best explanation." },
  { id: "analogical", en: "Analogical (qiyas)", ur: "قیاس", tip: "Argues from a parallel case." },
  { id: "causal", en: "Causal", ur: "سببی", tip: "Claims a cause–effect link." },
  { id: "authority", en: "Authority / Naqli", ur: "نقلی", tip: "Rests on scripture, text, or an expert — cite it." },
  { id: "empirical", en: "Empirical", ur: "تجرباتی", tip: "Rests on observation, data, or evidence." },
  { id: "fallacy", en: "Fallacy (mughalta)", ur: "مغالطہ", tip: "A flawed move: ad hominem, strawman, circular, equivocation…" },
];

// verdict → { label, ur, classes (badge) , border color hint }
const VERDICTS = {
  open: { en: "Open", ur: "زیرِ بحث", badge: "bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-200", dot: "#9ca3af" },
  support: { en: "Supported", ur: "تسلیم", badge: "bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-200", dot: "#16a34a" },
  counter: { en: "Countered", ur: "رد", badge: "bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-200", dot: "#dc2626" },
  split: { en: "Split", ur: "تقسیم", badge: "bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-200", dot: "#2563eb" },
  both: { en: "Both / partial", ur: "جزوی", badge: "bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200", dot: "#d97706" },
  resolved: { en: "Resolved", ur: "طے شدہ", badge: "bg-teal-100 text-teal-800 dark:bg-teal-900/50 dark:text-teal-200", dot: "#0d9488", sealed: true },
  "agree-to-disagree": { en: "Agree to disagree", ur: "اتفاق بر اختلاف", badge: "bg-purple-100 text-purple-800 dark:bg-purple-900/50 dark:text-purple-200", dot: "#9333ea", sealed: true },
  "no-further": { en: "No further discussion", ur: "مزید بحث بے سود", badge: "bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200", dot: "#475569", sealed: true },
};

const argTypeById = (id) => ARG_TYPES.find((t) => t.id === id) || ARG_TYPES[0];

/* ----------------------------------------------------------
   STATE
---------------------------------------------------------- */
const State = {
  db: null,
  session: null, // current session object
  composer: { mode: "root", parentId: null }, // mode: root | counter | part | edit
  editingId: null,
  spotlightId: null,
};

const $ = (id) => document.getElementById(id);
const uid = () =>
  crypto.randomUUID ? crypto.randomUUID() : `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
const nowIso = () => new Date().toISOString();
const escapeHtml = (v) =>
  String(v ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");

function status(msg, isErr = false) {
  const el = $("statusText");
  el.textContent = msg;
  el.classList.toggle("text-red-600", isErr);
  el.classList.toggle("text-gray-500", !isErr);
  if (msg) setTimeout(() => { if (el.textContent === msg) el.textContent = ""; }, 4000);
}

/* ----------------------------------------------------------
   INDEXEDDB (mirrors quoter's shape)
---------------------------------------------------------- */
const DB_NAME = "interlocutor-db";
const DB_VERSION = 1;
const STORE = "sessions";
const LAST_KEY = "interlocutor:lastSession";

function openDb() {
  return new Promise((resolve, reject) => {
    if (!window.indexedDB) return reject(new Error("IndexedDB unavailable"));
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error("DB open failed"));
  });
}
const tx = (mode) => State.db.transaction(STORE, mode).objectStore(STORE);
const dbGetAll = () => new Promise((res, rej) => { const r = tx("readonly").getAll(); r.onsuccess = () => res(r.result || []); r.onerror = () => rej(r.error); });
const dbPut = (s) => new Promise((res, rej) => { const r = tx("readwrite").put(s); r.onsuccess = () => res(); r.onerror = () => rej(r.error); });
const dbDelete = (id) => new Promise((res, rej) => { const r = tx("readwrite").delete(id); r.onsuccess = () => res(); r.onerror = () => rej(r.error); });

let saveTimer = null;
function scheduleSave() {
  if (!State.session) return;
  State.session.updatedAt = nowIso();
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    try { await dbPut(State.session); } catch (e) { status("Autosave failed", true); }
  }, 350);
}

/* ----------------------------------------------------------
   SESSION MODEL
---------------------------------------------------------- */
function newSession() {
  const aId = uid(), bId = uid();
  return {
    id: uid(),
    topic: "",
    moderator: "",
    sides: [
      { id: aId, name: "Side A", color: "#2563eb" },
      { id: bId, name: "Side B", color: "#dc2626" },
    ],
    nodes: {}, // id -> node
    rootOrder: [],
    log: [],
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
}

function sideById(id) {
  return State.session.sides.find((s) => s.id === id) || State.session.sides[0];
}
function childrenOf(parentId) {
  const S = State.session;
  const ids = parentId === null ? S.rootOrder : (S.nodes[parentId]?.childOrder || []);
  return ids.map((id) => S.nodes[id]).filter(Boolean);
}
function logMove(text) {
  State.session.log.unshift({ t: nowIso(), text });
  State.session.log = State.session.log.slice(0, 500);
}

function addNode({ parentId, sideId, text, lang, argType, citeText, citeRef, kind }) {
  const S = State.session;
  const node = {
    id: uid(),
    parentId,
    sideId,
    text,
    lang: lang || "en",
    kind: kind || (parentId === null ? "claim" : "part"),
    argType: argType || "claim",
    verdict: "open",
    citation: { text: citeText || "", ref: citeRef || "" },
    note: "",
    addressedBy: null,
    childOrder: [],
    collapsed: false,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  S.nodes[node.id] = node;
  if (parentId === null) S.rootOrder.push(node.id);
  else S.nodes[parentId].childOrder.push(node.id);
  const side = sideById(sideId);
  logMove(`${side.name}: “${shorten(text)}” (${argTypeById(node.argType).en})`);
  return node;
}

function deleteNode(id) {
  const S = State.session;
  const node = S.nodes[id];
  if (!node) return;
  [...(node.childOrder || [])].forEach(deleteNode);
  if (node.parentId === null) S.rootOrder = S.rootOrder.filter((x) => x !== id);
  else if (S.nodes[node.parentId]) S.nodes[node.parentId].childOrder = S.nodes[node.parentId].childOrder.filter((x) => x !== id);
  delete S.nodes[id];
}

function setVerdict(id, verdict) {
  const n = State.session.nodes[id];
  if (!n) return;
  n.verdict = verdict;
  n.updatedAt = nowIso();
  logMove(`Verdict on “${shorten(n.text)}” → ${VERDICTS[verdict].en}`);
  render();
  scheduleSave();
}

const shorten = (v, n = 60) => { const c = String(v || "").replace(/\s+/g, " ").trim(); return c.length <= n ? c : c.slice(0, n) + "…"; };

/* ----------------------------------------------------------
   COMPOSER
---------------------------------------------------------- */
function populateTypeSelect(sel) {
  sel.innerHTML = "";
  ARG_TYPES.forEach((t) => {
    const o = document.createElement("option");
    o.value = t.id;
    o.textContent = `${t.en} · ${t.ur}`;
    o.title = t.tip;
    sel.appendChild(o);
  });
}
function populateSideSelect(sel) {
  sel.innerHTML = "";
  State.session.sides.forEach((s) => {
    const o = document.createElement("option");
    o.value = s.id;
    o.textContent = s.name;
    sel.appendChild(o);
  });
}

function setComposerMode(mode, parentId = null, node = null) {
  State.composer = { mode, parentId };
  State.editingId = mode === "edit" ? node.id : null;
  const titles = { root: "Add a root argument", counter: "Add a counter", part: "Split — add a sub-part", edit: "Edit argument" };
  $("composerTitle").textContent = titles[mode] || titles.root;
  $("composerCancel").classList.toggle("hidden", mode === "root");
  populateSideSelect($("composerSide"));
  if (node) {
    $("composerText").value = node.text;
    $("composerSide").value = node.sideId;
    $("composerLang").value = node.lang;
    $("composerType").value = node.argType;
    $("composerCiteText").value = node.citation?.text || "";
    $("composerCiteRef").value = node.citation?.ref || "";
  } else if (mode === "counter" && parentId) {
    // default counter to the *other* side
    const parent = State.session.nodes[parentId];
    const other = State.session.sides.find((s) => s.id !== parent.sideId);
    $("composerSide").value = (other || State.session.sides[0]).id;
    $("composerType").value = "deductive";
  }
  applyComposerLang();
  $("composerText").focus();
}

function applyComposerLang() {
  const ur = $("composerLang").value === "ur";
  const t = $("composerText");
  t.dir = ur ? "rtl" : "ltr";
  t.classList.toggle("urdu", ur);
}

function submitComposer() {
  const text = $("composerText").value.trim();
  if (!text) { status("Type the argument first", true); return; }
  const data = {
    text,
    sideId: $("composerSide").value,
    lang: $("composerLang").value,
    argType: $("composerType").value,
    citeText: $("composerCiteText").value.trim(),
    citeRef: $("composerCiteRef").value.trim(),
  };
  const { mode, parentId } = State.composer;

  if (mode === "edit") {
    const n = State.session.nodes[State.editingId];
    Object.assign(n, { text: data.text, sideId: data.sideId, lang: data.lang, argType: data.argType, citation: { text: data.citeText, ref: data.citeRef }, updatedAt: nowIso() });
  } else if (mode === "counter") {
    addNode({ ...data, parentId, kind: "counter" });
    State.session.nodes[parentId].verdict = "counter";
  } else if (mode === "part") {
    addNode({ ...data, parentId, kind: "part" });
    State.session.nodes[parentId].verdict = "split";
  } else {
    addNode({ ...data, parentId: null, kind: "claim" });
  }

  clearComposer();
  render();
  scheduleSave();
}

function clearComposer() {
  $("composerText").value = "";
  $("composerCiteText").value = "";
  $("composerCiteRef").value = "";
  setComposerMode("root");
}

/* ----------------------------------------------------------
   RENDER
---------------------------------------------------------- */
function render() {
  renderStageHeader();
  renderTallies();
  renderTree();
  renderSpotlight();
  renderOpenThreads();
  renderLog();
}

function renderStageHeader() {
  const S = State.session;
  $("stageTopic").textContent = S.topic || "Untitled debate";
  $("stageSides").innerHTML = S.sides
    .map((s) => `<span class="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-white" style="background:${escapeHtml(s.color)}">${escapeHtml(s.name)}</span>`)
    .join("");
}

function allNodes() { return Object.values(State.session.nodes); }

function renderTallies() {
  const nodes = allNodes();
  const count = (v) => nodes.filter((n) => n.verdict === v).length;
  const sealed = nodes.filter((n) => VERDICTS[n.verdict]?.sealed).length;
  const items = [
    ["Total", nodes.length, "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-200"],
    ["Open", count("open"), VERDICTS.open.badge],
    ["Supported", count("support"), VERDICTS.support.badge],
    ["Countered", count("counter"), VERDICTS.counter.badge],
    ["Sealed", sealed, VERDICTS["agree-to-disagree"].badge],
  ];
  $("tallies").innerHTML = items
    .map(([label, n, cls]) => `<span class="rounded-full px-2.5 py-1 font-semibold ${cls}">${label}: ${n}</span>`)
    .join("");
}

function nodeCard(node, depth) {
  const side = sideById(node.sideId);
  const v = VERDICTS[node.verdict] || VERDICTS.open;
  const at = argTypeById(node.argType);
  const sealed = !!v.sealed;
  const isUr = node.lang === "ur";
  const kids = childrenOf(node.id);

  const citation = node.citation && (node.citation.text || node.citation.ref)
    ? `<div class="mt-1.5 rounded-md bg-gray-50 dark:bg-gray-800/60 border-s-2 px-2 py-1 text-[12px] ${isUr ? "urdu text-right" : ""}" style="border-color:${escapeHtml(side.color)}">
         ${node.citation.text ? `<div>${escapeHtml(node.citation.text)}</div>` : ""}
         ${node.citation.ref ? `<div class="text-[10px] text-gray-500 ${isUr ? "" : ""}">— ${escapeHtml(node.citation.ref)}</div>` : ""}
       </div>` : "";

  const kindTag = node.kind === "counter" ? `<span class="rounded px-1.5 py-0.5 text-[10px] bg-red-50 text-red-700 dark:bg-red-950/50 dark:text-red-300">counter</span>`
    : node.kind === "part" ? `<span class="rounded px-1.5 py-0.5 text-[10px] bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300">part</span>` : "";

  const collapseBtn = kids.length
    ? `<button data-act="collapse" data-id="${node.id}" class="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200" title="Collapse/expand">
         <span class="material-symbols-outlined text-base align-middle">${node.collapsed ? "chevron_right" : "expand_more"}</span></button>`
    : `<span class="inline-block w-5"></span>`;

  const actions = `
    <div class="no-print mt-2 flex flex-wrap items-center gap-1 text-[11px]">
      <button data-act="support" data-id="${node.id}" class="rounded px-1.5 py-0.5 bg-green-50 text-green-700 hover:bg-green-100 dark:bg-green-950/40 dark:text-green-300">Support</button>
      <button data-act="counter" data-id="${node.id}" class="rounded px-1.5 py-0.5 bg-red-50 text-red-700 hover:bg-red-100 dark:bg-red-950/40 dark:text-red-300">Counter</button>
      <button data-act="split" data-id="${node.id}" class="rounded px-1.5 py-0.5 bg-blue-50 text-blue-700 hover:bg-blue-100 dark:bg-blue-950/40 dark:text-blue-300">Split</button>
      <button data-act="both" data-id="${node.id}" class="rounded px-1.5 py-0.5 bg-amber-50 text-amber-700 hover:bg-amber-100 dark:bg-amber-950/40 dark:text-amber-300">Both</button>
      <select data-act="seal" data-id="${node.id}" class="rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-1 py-0.5 text-[10px]">
        <option value="">Seal…</option>
        <option value="resolved">Resolved</option>
        <option value="agree-to-disagree">Agree to disagree</option>
        <option value="no-further">No further discussion</option>
        <option value="open">Reopen</option>
      </select>
      <span class="mx-1 text-gray-300">|</span>
      <button data-act="edit" data-id="${node.id}" class="text-gray-500 hover:text-indigo-600" title="Edit"><span class="material-symbols-outlined text-sm align-middle">edit</span></button>
      <button data-act="delete" data-id="${node.id}" class="text-gray-500 hover:text-red-600" title="Delete"><span class="material-symbols-outlined text-sm align-middle">delete</span></button>
    </div>`;

  const header = `
    <div class="flex items-start gap-1.5">
      ${collapseBtn}
      <div class="min-w-0 flex-1">
        <div class="flex flex-wrap items-center gap-1.5 mb-1">
          <span class="rounded px-1.5 py-0.5 text-[10px] font-semibold text-white" style="background:${escapeHtml(side.color)}">${escapeHtml(side.name)}</span>
          <span class="rounded px-1.5 py-0.5 text-[10px] ${v.badge} font-semibold">${escapeHtml(v.en)}</span>
          <span class="rounded px-1.5 py-0.5 text-[10px] bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300" title="${escapeHtml(at.tip)}">${escapeHtml(at.en)}</span>
          ${kindTag}
          ${sealed ? `<span class="material-symbols-outlined text-sm text-gray-400" title="Sealed">lock</span>` : ""}
          ${node.addressedBy ? `<span class="text-[10px] text-gray-400">addressed by ${escapeHtml(sideById(node.addressedBy).name)}</span>` : ""}
        </div>
        <button data-act="spotlight" data-id="${node.id}" class="block w-full text-start ${isUr ? "urdu text-xl leading-relaxed" : "text-[15px]"} ${sealed ? "opacity-70" : ""}">${escapeHtml(node.text)}</button>
        ${citation}
        ${actions}
      </div>
    </div>`;

  const childHtml = (!node.collapsed && kids.length)
    ? `<div class="node-children ms-3 ps-3 mt-2 space-y-2">${kids.map((k) => nodeCard(k, depth + 1)).join("")}</div>`
    : "";

  return `<div class="node-card rounded-lg bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 p-2.5" style="border-inline-start-color:${escapeHtml(v.dot)}" data-node="${node.id}">${header}${childHtml}</div>`;
}

function renderTree() {
  const roots = childrenOf(null);
  $("tree").innerHTML = roots.length
    ? roots.map((n) => nodeCard(n, 0)).join("")
    : `<p class="text-sm text-gray-400 py-8 text-center">No arguments yet. Add the first one from the console.</p>`;
}

function renderSpotlight() {
  const box = $("spotlight");
  const n = State.spotlightId && State.session.nodes[State.spotlightId];
  if (!n) { box.classList.add("hidden"); return; }
  const side = sideById(n.sideId);
  const v = VERDICTS[n.verdict];
  const at = argTypeById(n.argType);
  const isUr = n.lang === "ur";
  box.classList.remove("hidden");
  box.innerHTML = `
    <div class="flex flex-wrap items-center gap-2 mb-2">
      <span class="rounded px-2 py-0.5 text-xs font-semibold text-white" style="background:${escapeHtml(side.color)}">${escapeHtml(side.name)}</span>
      <span class="rounded px-2 py-0.5 text-xs font-semibold ${v.badge}">${escapeHtml(v.en)} · ${escapeHtml(v.ur)}</span>
      <span class="rounded px-2 py-0.5 text-xs bg-white/70 dark:bg-gray-800 text-gray-600 dark:text-gray-300">${escapeHtml(at.en)} · ${escapeHtml(at.ur)}</span>
      <button data-act="spotlight-clear" class="no-print ms-auto text-xs text-gray-500 hover:text-gray-800 dark:hover:text-gray-200">clear ✕</button>
    </div>
    <div class="${isUr ? "urdu text-3xl leading-loose text-right" : "text-2xl leading-snug"}">${escapeHtml(n.text)}</div>
    ${n.citation && (n.citation.text || n.citation.ref) ? `<div class="mt-2 ${isUr ? "urdu text-right" : ""} text-sm text-gray-600 dark:text-gray-300">${escapeHtml(n.citation.text)} ${n.citation.ref ? `<span class="text-gray-400">— ${escapeHtml(n.citation.ref)}</span>` : ""}</div>` : ""}`;
}

function renderOpenThreads() {
  const open = allNodes().filter((n) => n.verdict === "open" || n.verdict === "both");
  $("openThreads").innerHTML = open.length
    ? open.map((n) => `<button data-act="spotlight" data-id="${n.id}" class="block w-full text-start hover:text-indigo-600 ${n.lang === "ur" ? "urdu text-right" : ""}">• ${escapeHtml(shorten(n.text, 70))}</button>`).join("")
    : `<p class="text-gray-400">Nothing open — every thread is resolved or sealed.</p>`;
}

function renderLog() {
  $("moveLog").innerHTML = (State.session.log || [])
    .slice(0, 60)
    .map((e) => `<div><span class="text-gray-400">${new Date(e.t).toLocaleTimeString()}</span> · ${escapeHtml(e.text)}</div>`)
    .join("");
}

/* ----------------------------------------------------------
   TREE EVENT DELEGATION
---------------------------------------------------------- */
function onStageClick(e) {
  const btn = e.target.closest("[data-act]");
  if (!btn) return;
  const act = btn.dataset.act;
  const id = btn.dataset.id;
  const node = id ? State.session.nodes[id] : null;

  switch (act) {
    case "spotlight": State.spotlightId = id; renderSpotlight(); renderTree(); break;
    case "spotlight-clear": State.spotlightId = null; renderSpotlight(); break;
    case "collapse": node.collapsed = !node.collapsed; renderTree(); scheduleSave(); break;
    case "support": setVerdict(id, "support"); break;
    case "both": setVerdict(id, "both"); break;
    case "counter": setComposerMode("counter", id); break;
    case "split": setComposerMode("part", id); break;
    case "edit": setComposerMode("edit", node.parentId, node); break;
    case "delete":
      if (confirm("Delete this argument and all its sub-points?")) { deleteNode(id); render(); scheduleSave(); }
      break;
  }
}

function onStageChange(e) {
  const sel = e.target.closest('select[data-act="seal"]');
  if (!sel) return;
  const v = sel.value;
  if (v) setVerdict(sel.dataset.id, v);
}

/* ----------------------------------------------------------
   SESSIONS / EXPORT / IMPORT / PRINT
---------------------------------------------------------- */
async function loadSession(s) {
  State.session = s;
  State.spotlightId = null;
  localStorage.setItem(LAST_KEY, s.id);
  syncSessionInputs();
  render();
}

function syncSessionInputs() {
  const S = State.session;
  $("topicInput").value = S.topic || "";
  $("sideAName").value = S.sides[0].name;
  $("sideAColor").value = S.sides[0].color;
  $("sideBName").value = S.sides[1].name;
  $("sideBColor").value = S.sides[1].color;
  populateSideSelect($("composerSide"));
}

async function startNewSession() {
  State.session = newSession();
  await dbPut(State.session);
  await loadSession(State.session);
  status("New session created");
}

async function openSessionsModal() {
  const all = (await dbGetAll()).sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  const list = $("sessionsList");
  list.innerHTML = all.length
    ? all.map((s) => `
      <div class="flex items-center gap-2 rounded-lg border border-gray-200 dark:border-gray-800 p-2">
        <button data-load="${s.id}" class="min-w-0 flex-1 text-start">
          <div class="text-sm font-semibold truncate">${escapeHtml(s.topic || "Untitled debate")}</div>
          <div class="text-[11px] text-gray-500">${Object.keys(s.nodes || {}).length} points · ${new Date(s.updatedAt).toLocaleString()}</div>
        </button>
        <button data-del="${s.id}" class="text-gray-400 hover:text-red-600"><span class="material-symbols-outlined text-base">delete</span></button>
      </div>`).join("")
    : `<p class="text-sm text-gray-400">No saved sessions.</p>`;
  showModal("sessionsModal", true);
}

function exportSession() {
  const blob = new Blob([JSON.stringify({ format: "interlocutor-v1", exportedAt: nowIso(), session: State.session }, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `interlocutor-${(State.session.topic || "debate").replace(/[^\w]+/g, "-").slice(0, 40)}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
  status("Exported");
}

async function importSession(file) {
  try {
    const parsed = JSON.parse(await file.text());
    const s = parsed.session || parsed;
    if (!s || !s.nodes || !s.sides) throw new Error("Not an Interlocutor file");
    s.id = s.id || uid();
    await dbPut(s);
    await loadSession(s);
    status("Imported");
  } catch (e) {
    status(e.message || "Import failed", true);
  }
}

/* ----------------------------------------------------------
   MODALS / PRESENT / THEME
---------------------------------------------------------- */
function showModal(id, on) {
  const m = $(id);
  m.classList.toggle("hidden", !on);
  m.classList.toggle("flex", on);
}
function setPresent(on) {
  document.body.classList.toggle("present", on);
  $("presentBtn").textContent = on ? "Exit" : "Present";
}

function initTheme() {
  const root = document.documentElement;
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  if (localStorage.theme === "dark") root.classList.add("dark");
  else if (localStorage.theme === "light") root.classList.remove("dark");
  else { localStorage.theme = prefersDark ? "dark" : "light"; root.classList.toggle("dark", prefersDark); }
  $("toggleDark").addEventListener("click", () => {
    const isDark = root.classList.toggle("dark");
    localStorage.theme = isDark ? "dark" : "light";
  });
}

function loadPayamiDeferred() {
  if (!document.fonts || !document.fonts.load) return;
  document.fonts.load('1em "Payami"').then(() => document.documentElement.classList.add("payami-ready")).catch(() => {});
}

/* ----------------------------------------------------------
   WIRING
---------------------------------------------------------- */
function bind() {
  // session inputs
  $("topicInput").addEventListener("input", (e) => { State.session.topic = e.target.value; renderStageHeader(); scheduleSave(); });
  const sideInput = (idx, key) => (e) => { State.session.sides[idx][key] = e.target.value; syncSessionInputs(); render(); scheduleSave(); };
  $("sideAName").addEventListener("input", sideInput(0, "name"));
  $("sideAColor").addEventListener("input", sideInput(0, "color"));
  $("sideBName").addEventListener("input", sideInput(1, "name"));
  $("sideBColor").addEventListener("input", sideInput(1, "color"));

  // composer
  $("composerLang").addEventListener("change", applyComposerLang);
  $("composerAdd").addEventListener("click", submitComposer);
  $("composerCancel").addEventListener("click", clearComposer);
  $("composerText").addEventListener("keydown", (e) => { if ((e.ctrlKey || e.metaKey) && e.key === "Enter") submitComposer(); });

  // stage delegation
  $("stagePanel").addEventListener("click", onStageClick);
  $("stagePanel").addEventListener("change", onStageChange);

  // top buttons
  $("newSessionBtn").addEventListener("click", startNewSession);
  $("sessionsBtn").addEventListener("click", openSessionsModal);
  $("presentBtn").addEventListener("click", () => setPresent(!document.body.classList.contains("present")));
  $("presentExitBtn").addEventListener("click", () => setPresent(false));
  $("exportBtn").addEventListener("click", exportSession);
  $("importBtn").addEventListener("click", () => $("importFile").click());
  $("importFile").addEventListener("change", (e) => { if (e.target.files[0]) importSession(e.target.files[0]); e.target.value = ""; });
  $("printBtn").addEventListener("click", () => window.print());

  // sessions modal
  $("closeSessions").addEventListener("click", () => showModal("sessionsModal", false));
  $("sessionsList").addEventListener("click", async (e) => {
    const load = e.target.closest("[data-load]");
    const del = e.target.closest("[data-del]");
    if (load) { const all = await dbGetAll(); const s = all.find((x) => x.id === load.dataset.load); if (s) { await loadSession(s); showModal("sessionsModal", false); } }
    if (del) { await dbDelete(del.dataset.del); openSessionsModal(); }
  });

  // help modal
  $("toggleHelp").addEventListener("click", () => showModal("helpModal", true));
  $("closeHelp").addEventListener("click", () => showModal("helpModal", false));
  [$("helpModal"), $("sessionsModal")].forEach((m) =>
    m.addEventListener("click", (e) => { if (e.target === m) showModal(m.id, false); }));

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      if (document.body.classList.contains("present")) setPresent(false);
      showModal("helpModal", false);
      showModal("sessionsModal", false);
    }
  });
}

async function init() {
  initTheme();
  loadPayamiDeferred();
  populateTypeSelect($("composerType"));
  bind();
  try {
    State.db = await openDb();
    const all = await dbGetAll();
    const lastId = localStorage.getItem(LAST_KEY);
    const last = all.find((s) => s.id === lastId) || all.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))[0];
    if (last) await loadSession(last);
    else await startNewSession();
  } catch (e) {
    // fallback: in-memory session so the tool still works without IndexedDB
    State.session = newSession();
    syncSessionInputs();
    render();
    status("Running without storage: " + (e.message || "no IndexedDB"), true);
  }
  setComposerMode("root");
  console.log("Interlocutor ready");
}

window.addEventListener("DOMContentLoaded", init);
