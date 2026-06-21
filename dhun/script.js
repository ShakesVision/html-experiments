/* ==========================================================
   دھن — MELODY STUDIO
   Put a tune on already-written Urdu lyrics:
   bahr → beat grid → contour → notes/sargam → playback w/ meend.
   ========================================================== */
"use strict";

/* ----------------------------------------------------------
   STATE
---------------------------------------------------------- */
const App = {
  buhoor: [],
  bahr: null,
  cells: [], // [{weight:1|2, rukn:int, accent:bool}]
  syllables: [], // text per cell (parallel to cells)
  contour: [], // arrow per cell
  melody: [], // [{idx, midi, weight, syllable, ornament, west, sarg}]
  antaraMelody: [], // octave-up repeat
  antara: false,
  bpm: 84,
  glide: 40, // meend %
  noteRate: 1, // melody pace vs beat: 0.5 | 1 | 2
  notation: "sargam", // 'sargam' | 'western'
  sa: 60, // MIDI of Sa
  scale: "bilawal",
  style: "simple",
};

const CUSTOM_KEY = "dhun:customMeters";

/* ----------------------------------------------------------
   MUSIC DATA
---------------------------------------------------------- */
// Ascending semitone offsets from Sa.
const SCALES = {
  bilawal: { label: "Bilawal / Major (happy)", steps: [0, 2, 4, 5, 7, 9, 11] },
  yaman: { label: "Yaman (serene, evening)", steps: [0, 2, 4, 6, 7, 9, 11] },
  khamaj: { label: "Khamaj (light, romantic)", steps: [0, 2, 4, 5, 7, 9, 10] },
  kafi: { label: "Kafi (gentle, folk)", steps: [0, 2, 3, 5, 7, 9, 10] },
  asawari: { label: "Asawari / Minor (sober)", steps: [0, 2, 3, 5, 7, 8, 10] },
  bhairavi: { label: "Bhairavi (devotional, sad)", steps: [0, 1, 3, 5, 7, 8, 10] },
  bhairav: { label: "Bhairav (solemn, morning)", steps: [0, 1, 4, 5, 7, 8, 11] },
  bhoopali: { label: "Bhoopali (pentatonic, peaceful)", steps: [0, 2, 4, 7, 9] },
  pahadi: { label: "Pahadi (pentatonic, sweet)", steps: [0, 2, 4, 7, 9] },
};

// pitch-class → sargam (lowercase = komal; M = tivra Ma)
const SARGAM_PC = ["S", "r", "R", "g", "G", "m", "M", "P", "d", "D", "n", "N"];
const WEST_PC = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

const SA_NOTES = [
  ["C", 60], ["C#", 61], ["D", 62], ["D#", 63], ["E", 64], ["F", 65],
  ["F#", 66], ["G", 67], ["G#", 68], ["A", 69], ["A#", 70], ["B", 71],
];

const STYLES = {
  simple: { label: "Simple (calm steps)", leap: 0.05, repeat: 0.45, orn: 0.05, range: 4 },
  jagjit: { label: "Jagjit (gentle ghazal)", leap: 0.1, repeat: 0.4, orn: 0.12, range: 4 },
  mehdi: { label: "Mehdi Hassan (expansive)", leap: 0.28, repeat: 0.25, orn: 0.2, range: 7 },
  ghulam: { label: "Ghulam Ali (ornate)", leap: 0.4, repeat: 0.2, orn: 0.32, range: 8 },
};

const MOODS = [
  { label: "Sad", bpm: 60 },
  { label: "Emotional", bpm: 72 },
  { label: "Romantic", bpm: 84 },
  { label: "Hopeful", bpm: 96 },
  { label: "Happy", bpm: 112 },
];

const ARROWS = ["→", "↑", "↓", "⇈", "⇊", "∩", "∪"];

/* ----------------------------------------------------------
   UTIL
---------------------------------------------------------- */
const $ = (id) => document.getElementById(id);
const choose = (a) => a[Math.floor(Math.random() * a.length)];
const chance = (p) => Math.random() < p;
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

function toast(msg) {
  const t = document.createElement("div");
  t.className =
    "fixed bottom-5 right-5 bg-slate-900 text-white px-5 py-3 rounded-xl shadow-xl z-50 text-sm";
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2200);
}

/* ----------------------------------------------------------
   METER → BEAT GRID
   adad digits: 2 = long/guru (held), 1 = short/laghu.
   spaces separate arkaan (feet).
---------------------------------------------------------- */
function parseAdad(adad) {
  const cells = [];
  if (!adad) return cells;
  const feet = String(adad).trim().split(/\s+/);
  feet.forEach((foot, rukn) => {
    [...foot].forEach((ch, i) => {
      const weight = ch === "2" ? 2 : 1;
      if (ch === "1" || ch === "2")
        cells.push({ weight, rukn, accent: i === 0 });
    });
  });
  return cells;
}

/* ----------------------------------------------------------
   PITCH HELPERS
---------------------------------------------------------- */
function idxToMidi(idx) {
  const steps = SCALES[App.scale].steps;
  const n = steps.length;
  const oct = Math.floor(idx / n);
  const deg = ((idx % n) + n) % n;
  return App.sa + oct * 12 + steps[deg];
}

function midiToWest(midi) {
  const pc = ((midi % 12) + 12) % 12;
  const oct = Math.floor(midi / 12) - 1; // MIDI octave
  return WEST_PC[pc] + oct;
}

function midiToSargam(midi) {
  const rel = midi - App.sa;
  const pc = ((rel % 12) + 12) % 12;
  const octRel = Math.floor(rel / 12);
  let mark = "";
  if (octRel > 0) mark = "'".repeat(octRel);
  else if (octRel < 0) mark = ".".repeat(-octRel);
  return SARGAM_PC[pc] + mark;
}

/* ----------------------------------------------------------
   CONTOUR GENERATION
---------------------------------------------------------- */
// A few baseline phrase shapes the style then varies.
const TEMPLATES = [
  ["→", "↑", "→", "↓"],
  ["→", "↑", "↑", "↓"],
  ["↑", "→", "↓", "→"],
  ["→", "→", "↑", "↓"],
  ["↑", "↑", "→", "↓"],
  ["→", "↓", "→", "↑"],
];

function generateContour(cells, styleName) {
  const st = STYLES[styleName] || STYLES.simple;
  const tmpl = choose(TEMPLATES);
  const out = [];
  let idx = 0; // track virtual position so we can lean back to centre
  for (let i = 0; i < cells.length; i++) {
    let arrow = tmpl[i % tmpl.length];
    if (chance(st.repeat)) {
      arrow = "→";
    } else if (chance(st.orn)) {
      arrow = chance(0.5) ? "∩" : "∪";
    } else if (chance(st.leap)) {
      arrow = idx > 1 ? "⇊" : idx < -1 ? "⇈" : choose(["⇈", "⇊"]);
    } else if (idx >= st.range) {
      arrow = "↓";
    } else if (idx <= -2) {
      arrow = "↑";
    }
    // track movement
    idx += arrowDelta(arrow);
    idx = clamp(idx, -2, st.range);
    out.push(arrow);
  }
  // Cadence: resolve the last 1–2 syllables back toward Sa.
  if (out.length) out[out.length - 1] = "↓";
  if (out.length > 2) out[out.length - 2] = "→";
  return out;
}

function arrowDelta(a) {
  switch (a) {
    case "↑": return 1;
    case "↓": return -1;
    case "⇈": return 2;
    case "⇊": return -2;
    default: return 0; // → ∩ ∪ are net-zero in destination
  }
}

/* ----------------------------------------------------------
   REALIZE: contour + cells → melody (pitches)
---------------------------------------------------------- */
function noteFields(idx) {
  const midi = idxToMidi(idx);
  return { idx, midi, west: midiToWest(midi), sarg: midiToSargam(midi) };
}

function realize() {
  const st = STYLES[App.style] || STYLES.simple;
  let idx = 0;
  App.melody = App.cells.map((cell, i) => {
    const arrow = App.contour[i] || "→";
    const ornament = arrow === "∩" ? "arch" : arrow === "∪" ? "dip" : null;
    idx = clamp(idx + arrowDelta(arrow), -3, st.range + 2);
    // final note pulls to Sa for resolution
    if (i === App.cells.length - 1) idx = 0;
    return {
      ...noteFields(idx),
      weight: cell.weight,
      accent: cell.accent,
      rukn: cell.rukn,
      syllable: App.syllables[i] || "",
      ornament,
    };
  });
  // antara = the same shape one octave higher (taar saptak)
  const oct = SCALES[App.scale].steps.length;
  App.antaraMelody = App.melody.map((m) => ({ ...m, ...noteFields(m.idx + oct) }));
}

/* ----------------------------------------------------------
   LOAD DATA + POPULATE CONTROLS
---------------------------------------------------------- */
async function loadBuhoor() {
  const res = await fetch("buhoor.json");
  App.buhoor = await res.json();
  App.buhoor = App.buhoor.concat(loadCustomMeters());
}

function loadCustomMeters() {
  try {
    const arr = JSON.parse(localStorage.getItem(CUSTOM_KEY) || "[]");
    return Array.isArray(arr) ? arr : [];
  } catch (_) {
    return [];
  }
}

function saveCustomMeter(meter) {
  const arr = loadCustomMeters();
  arr.push(meter);
  try {
    localStorage.setItem(CUSTOM_KEY, JSON.stringify(arr));
  } catch (_) {}
}

// Label for a meter option: prefer "name — arkaan"; fall back to whichever exists.
function meterLabel(b) {
  if (b.name && b.arkan) return `${b.name} — ${b.arkan}`;
  return b.arkan || b.name || b.adad || "(meter)";
}

function populateControls() {
  const meter = $("meterSelect");
  const prev = meter.value;
  meter.innerHTML = "";
  App.buhoor.forEach((b, i) => {
    const o = document.createElement("option");
    o.value = i;
    o.textContent = (b.custom ? "★ " : "") + meterLabel(b);
    meter.appendChild(o);
  });
  // default to Mutaqarib Musamman Salim if present, else first commonly-used meter
  const mutaqarib = App.buhoor.findIndex((b) => /متقارب مثمن سالم$/.test(b.name || ""));
  const def =
    mutaqarib >= 0
      ? mutaqarib
      : App.buhoor.findIndex((b) => /^مستعمل/.test(b.use || ""));
  meter.value = prev !== "" && prev != null && meter.options[prev] ? prev : def >= 0 ? def : 0;

  const sa = $("saSelect");
  sa.innerHTML = "";
  SA_NOTES.forEach(([name, midi]) => {
    const o = document.createElement("option");
    o.value = midi;
    o.textContent = `${name} (Sa)`;
    sa.appendChild(o);
  });
  sa.value = App.sa;

  const scale = $("scaleSelect");
  scale.innerHTML = "";
  Object.entries(SCALES).forEach(([key, v]) => {
    const o = document.createElement("option");
    o.value = key;
    o.textContent = v.label;
    scale.appendChild(o);
  });
  scale.value = App.scale;

  const style = $("styleSelect");
  style.innerHTML = "";
  Object.entries(STYLES).forEach(([key, v]) => {
    const o = document.createElement("option");
    o.value = key;
    o.textContent = v.label;
    style.appendChild(o);
  });
  style.value = App.style;

  const moods = $("moodPresets");
  moods.innerHTML = "";
  MOODS.forEach((m) => {
    const b = document.createElement("button");
    b.className =
      "px-2 py-1 text-xs rounded-md bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-200";
    b.textContent = `${m.label} ${m.bpm}`;
    b.onclick = () => setBpm(m.bpm);
    moods.appendChild(b);
  });
}

/* ----------------------------------------------------------
   METER STRIP + SYLLABLE SPLIT (tap-to-split)
---------------------------------------------------------- */
function updateBahr() {
  const idx = parseInt($("meterSelect").value || 0, 10);
  App.bahr = App.buhoor[idx];
  if (!App.bahr) return;
  App.cells = parseAdad(App.bahr.adad);
  $("bahrArkan").textContent = App.bahr.arkan || "—";
  $("bahrAdad").textContent = App.bahr.adad || "—";
  $("bahrUse").textContent = App.bahr.use ? `(${App.bahr.use})` : "";
  $("syllCount").textContent = App.cells.length;
  $("meterCells").textContent = App.cells.length;
  renderBeads();
  rebuildSyllables();
}

function renderBeads() {
  const strip = $("beadStrip");
  strip.innerHTML = "";
  let lastRukn = -1;
  let group;
  App.cells.forEach((c) => {
    if (c.rukn !== lastRukn) {
      group = document.createElement("div");
      group.className =
        "flex items-end gap-1 px-2 py-1 rounded-lg bg-white/60 dark:bg-gray-800/60";
      strip.appendChild(group);
      lastRukn = c.rukn;
    }
    const bead = document.createElement("span");
    bead.title = c.weight === 2 ? "long (guru) — held 2 beats" : "short (laghu) — 1 beat";
    bead.className = "inline-block rounded-sm bg-indigo-500";
    if (c.weight === 2) {
      bead.style.width = "22px";
      bead.style.height = "10px";
    } else {
      bead.style.width = "10px";
      bead.style.height = "10px";
    }
    group.appendChild(bead);
  });
}

/* split state: units are graphemes; a space in the misra is a default boundary */
let units = []; // [{ch, wordEnd}]
let boundaries = new Set(); // unit indices after which we cut

function segmentGraphemes(text) {
  const t = text || "";
  if (typeof Intl !== "undefined" && Intl.Segmenter) {
    try {
      const seg = new Intl.Segmenter("ur", { granularity: "grapheme" });
      return [...seg.segment(t)].map((s) => s.segment);
    } catch (_) {
      /* fall through */
    }
  }
  return [...t];
}

function computeUnits(text) {
  const tokens = (text || "").trim().split(/\s+/).filter(Boolean);
  const u = [];
  tokens.forEach((tok) => {
    const gs = segmentGraphemes(tok);
    gs.forEach((g, i) => u.push({ ch: g, wordEnd: i === gs.length - 1 }));
  });
  return u;
}

// Re-read the misra: rebuild units and reset splits to the spaces (one cell per word).
function refreshMisra() {
  units = computeUnits($("misraInput").value);
  boundaries = new Set();
  units.forEach((u, i) => {
    if (u.wordEnd && i < units.length - 1) boundaries.add(i);
  });
  renderLetterChips();
  rebuildSyllables();
}

function renderLetterChips() {
  const box = $("letterChips");
  box.innerHTML = "";
  units.forEach((u, i) => {
    const span = document.createElement("button");
    span.className =
      "chip-letter px-1 rounded hover:bg-indigo-100 dark:hover:bg-indigo-900/40";
    if (u.wordEnd && i < units.length - 1) span.style.marginInlineEnd = "0.6rem"; // word gap
    span.textContent = u.ch;
    if (boundaries.has(i)) span.dataset.boundary = "true";
    if (i < units.length - 1) {
      span.onclick = () => {
        if (boundaries.has(i)) boundaries.delete(i);
        else boundaries.add(i);
        renderLetterChips();
        rebuildSyllables();
      };
    }
    box.appendChild(span);
  });
}

// Cut units into chunks at boundaries → syllable text per cell.
function rebuildSyllables() {
  const chunks = [];
  let cur = "";
  units.forEach((u, i) => {
    cur += u.ch;
    if (boundaries.has(i)) {
      chunks.push(cur);
      cur = "";
    }
  });
  if (cur) chunks.push(cur);
  App.syllables = chunks;
  $("splitCount").textContent = chunks.length;
  renderCellMap();
  // keep any existing melody labels in sync
  if (App.melody.length) {
    App.melody.forEach((m, i) => (m.syllable = App.syllables[i] || ""));
    renderMelodyMap();
  }
}

function renderCellMap() {
  const map = $("cellMap");
  map.innerHTML = "";
  App.cells.forEach((c, i) => {
    const cell = document.createElement("div");
    cell.className =
      "min-w-[3rem] text-center rounded-lg border px-2 py-1.5 " +
      (c.accent
        ? "border-indigo-400 bg-indigo-50 dark:bg-indigo-950/40"
        : "border-gray-200 dark:border-gray-700");
    const syl = document.createElement("div");
    syl.className = "urdu text-xl leading-tight";
    syl.textContent = App.syllables[i] || "·";
    const w = document.createElement("div");
    w.className = "text-[10px] text-gray-400 mt-0.5";
    w.textContent = c.weight === 2 ? "—" : "•";
    cell.appendChild(syl);
    cell.appendChild(w);
    map.appendChild(cell);
  });
}

/* ----------------------------------------------------------
   GENERATE + RENDER OUTPUTS
---------------------------------------------------------- */
function generate() {
  if (!App.cells.length) {
    toast("Pick a bahr first");
    return;
  }
  App.contour = generateContour(App.cells, App.style);
  realize();
  renderAll();
  toast("Melody generated");
}

function renderAll() {
  renderArrows();
  renderNotes();
  renderAntara();
  renderMelodyMap();
}

function renderAntara() {
  const card = $("antaraCard");
  if (!App.antara || !App.antaraMelody.length) {
    card.classList.add("hidden");
    return;
  }
  card.classList.remove("hidden");
  const box = $("antaraOutput");
  box.innerHTML = "";
  App.antaraMelody.forEach((m) => {
    const s = document.createElement("span");
    s.className = m.accent ? "text-indigo-600 dark:text-indigo-400 font-semibold" : "";
    s.textContent = App.notation === "western" ? m.west : m.sarg;
    box.appendChild(s);
  });
}

function renderArrows() {
  const box = $("arrowOutput");
  box.innerHTML = "";
  App.contour.forEach((arrow, i) => {
    const b = document.createElement("button");
    b.className =
      "w-10 h-10 rounded-lg bg-slate-100 dark:bg-gray-700 hover:bg-slate-200 dark:hover:bg-gray-600 flex items-center justify-center";
    b.textContent = arrow;
    b.title = "click to change shape";
    b.onclick = () => {
      const next = (ARROWS.indexOf(App.contour[i]) + 1) % ARROWS.length;
      App.contour[i] = ARROWS[next];
      realize();
      renderAll();
    };
    box.appendChild(b);
  });
}

function renderNotes() {
  $("notesHeading").textContent = App.notation === "western" ? "Western notes" : "Sargam";
  const box = $("notesOutput");
  box.innerHTML = "";
  App.melody.forEach((m) => {
    const s = document.createElement("span");
    s.className = m.accent ? "text-indigo-600 dark:text-indigo-400 font-semibold" : "";
    s.textContent = App.notation === "western" ? m.west : m.sarg;
    box.appendChild(s);
  });
}

/* ----------------------------------------------------------
   MELODY MAP (SVG) — meend slider straightens/curves the path
---------------------------------------------------------- */
function renderMelodyMap() {
  const host = $("melodyMap");
  if (!App.melody.length) {
    host.innerHTML = '<p class="text-sm text-gray-400">Click “Generate melody” to see the shape.</p>';
    return;
  }
  const pxPerBeat = 64;
  const padX = 28;
  const padTop = 34;
  const padBottom = 46;
  const h = 260;

  const seq =
    App.antara && App.antaraMelody.length
      ? App.melody.concat(App.antaraMelody)
      : App.melody;
  const dividerAt = App.antara && App.antaraMelody.length ? App.melody.length : -1;

  // x positions: centre of each held note
  let beat = 0;
  const pts = seq.map((m) => {
    const x = padX + (beat + m.weight / 2) * pxPerBeat;
    beat += m.weight;
    return { x, idx: m.idx, m };
  });
  const totalBeats = beat;
  const w = padX * 2 + totalBeats * pxPerBeat;

  const idxs = pts.map((p) => p.idx);
  const lo = Math.min(...idxs, 0);
  const hi = Math.max(...idxs, 1);
  const yOf = (idx) => {
    const t = (idx - lo) / (hi - lo || 1);
    return h - padBottom - t * (h - padTop - padBottom);
  };
  pts.forEach((p) => (p.y = yOf(p.idx)));

  const accent = "#4f46e5";
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
  svg.setAttribute("width", w);
  svg.setAttribute("height", h);
  svg.setAttribute("class", "block");

  // beat gridlines + rukn accents
  let bx = padX;
  let r = -1;
  seq.forEach((m, i) => {
    const isRukn = m.rukn !== r;
    r = m.rukn;
    const line = document.createElementNS(ns, "line");
    line.setAttribute("x1", bx);
    line.setAttribute("x2", bx);
    line.setAttribute("y1", padTop - 10);
    line.setAttribute("y2", h - padBottom + 10);
    line.setAttribute("stroke", isRukn ? "#9ca3af" : "#e5e7eb");
    line.setAttribute("stroke-width", isRukn ? 1.4 : 1);
    line.setAttribute("stroke-dasharray", isRukn ? "" : "3 4");
    line.setAttribute("class", isRukn ? "" : "opacity-70");
    svg.appendChild(line);
    // antara divider label
    if (i === dividerAt) {
      const lbl = document.createElementNS(ns, "text");
      lbl.setAttribute("x", bx + 4);
      lbl.setAttribute("y", padTop - 16);
      lbl.setAttribute("font-size", "11");
      lbl.setAttribute("fill", "#16a34a");
      lbl.textContent = "antara ↑";
      svg.appendChild(lbl);
    }
    bx += m.weight * pxPerBeat;
  });

  // the melody path, curvature driven by meend
  const path = document.createElementNS(ns, "path");
  path.setAttribute("d", buildPath(pts, App.glide / 100));
  path.setAttribute("fill", "none");
  path.setAttribute("stroke", accent);
  path.setAttribute("stroke-width", 2.5);
  path.setAttribute("stroke-linecap", "round");
  path.setAttribute("stroke-linejoin", "round");
  svg.appendChild(path);

  // points + labels
  pts.forEach((p) => {
    const c = document.createElementNS(ns, "circle");
    c.setAttribute("cx", p.x);
    c.setAttribute("cy", p.y);
    c.setAttribute("r", p.m.accent ? 6 : 4.5);
    c.setAttribute("fill", accent);
    svg.appendChild(c);

    // ornament marker
    if (p.m.ornament) {
      const arc = document.createElementNS(ns, "path");
      const dir = p.m.ornament === "arch" ? -1 : 1;
      arc.setAttribute(
        "d",
        `M ${p.x - 9} ${p.y + dir * 6} Q ${p.x} ${p.y + dir * 18} ${p.x + 9} ${p.y + dir * 6}`
      );
      arc.setAttribute("fill", "none");
      arc.setAttribute("stroke", accent);
      arc.setAttribute("stroke-width", 1.5);
      arc.setAttribute("opacity", "0.7");
      svg.appendChild(arc);
    }

    // note label above
    const note = document.createElementNS(ns, "text");
    note.setAttribute("x", p.x);
    note.setAttribute("y", p.y - 12);
    note.setAttribute("text-anchor", "middle");
    note.setAttribute("font-size", "12");
    note.setAttribute("font-family", "ui-monospace, monospace");
    note.setAttribute("fill", "currentColor");
    note.textContent = App.notation === "western" ? p.m.west : p.m.sarg;
    svg.appendChild(note);

    // syllable below
    if (p.m.syllable) {
      const syl = document.createElementNS(ns, "text");
      syl.setAttribute("x", p.x);
      syl.setAttribute("y", h - padBottom + 30);
      syl.setAttribute("text-anchor", "middle");
      syl.setAttribute("font-size", "18");
      syl.setAttribute("fill", "currentColor");
      syl.setAttribute("class", "urdu");
      syl.textContent = p.m.syllable;
      svg.appendChild(syl);
    }
  });

  // playhead (hidden until playing)
  const head = document.createElementNS(ns, "line");
  head.setAttribute("id", "playhead");
  head.setAttribute("y1", padTop - 10);
  head.setAttribute("y2", h - padBottom + 10);
  head.setAttribute("stroke", "#16a34a");
  head.setAttribute("stroke-width", 2);
  head.setAttribute("x1", padX);
  head.setAttribute("x2", padX);
  head.setAttribute("opacity", "0");
  svg.appendChild(head);

  host.innerHTML = "";
  host.appendChild(svg);
  // stash geometry for the playhead animation
  App._map = { padX, pxPerBeat, totalBeats };
}

// Build an SVG path; smoothness 0 = straight segments, 1 = smooth curve.
function buildPath(pts, s) {
  if (!pts.length) return "";
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 1; i < pts.length; i++) {
    const p0 = pts[i - 1];
    const p1 = pts[i];
    if (s < 0.02) {
      d += ` L ${p1.x} ${p1.y}`;
    } else {
      // cubic bezier; control points slide out horizontally with smoothness
      const dx = (p1.x - p0.x) * 0.5 * s;
      d += ` C ${p0.x + dx} ${p0.y}, ${p1.x - dx} ${p1.y}, ${p1.x} ${p1.y}`;
    }
  }
  return d;
}

/* ----------------------------------------------------------
   TEMPO / MEEND / NOTATION CONTROLS
---------------------------------------------------------- */
function setBpm(v) {
  App.bpm = clamp(Math.round(v), 40, 160);
  $("bpmRange").value = App.bpm;
  $("bpmValue").textContent = App.bpm;
  if (typeof Tone !== "undefined") Tone.Transport.bpm.value = App.bpm;
}

let tapTimes = [];
function tapTempo() {
  const now = performance.now();
  tapTimes.push(now);
  tapTimes = tapTimes.filter((t) => now - t < 2500);
  if (tapTimes.length >= 2) {
    const gaps = [];
    for (let i = 1; i < tapTimes.length; i++) gaps.push(tapTimes[i] - tapTimes[i - 1]);
    const avg = gaps.reduce((a, b) => a + b, 0) / gaps.length;
    setBpm(60000 / avg);
  }
}

function setNotation(mode) {
  App.notation = mode;
  $("notSargam").classList.toggle("bg-white", mode === "sargam");
  $("notSargam").classList.toggle("dark:bg-gray-900", mode === "sargam");
  $("notSargam").classList.toggle("shadow", mode === "sargam");
  $("notWestern").classList.toggle("bg-white", mode === "western");
  $("notWestern").classList.toggle("dark:bg-gray-900", mode === "western");
  $("notWestern").classList.toggle("shadow", mode === "western");
  renderNotes();
  renderMelodyMap();
}

/* ----------------------------------------------------------
   PLAYBACK (Tone.js): metronome + "laa" voice + meend glide
---------------------------------------------------------- */
let voice = null;
let click = null;
let playing = false;
let loopTimer = null;
let rafId = null;

async function ensureAudio() {
  if (typeof Tone === "undefined") {
    toast("Audio engine (Tone.js) not loaded");
    return false;
  }
  await Tone.start();
  if (!voice) {
    voice = new Tone.Synth({
      oscillator: { type: "sine" },
      envelope: { attack: 0.04, decay: 0.1, sustain: 0.7, release: 0.25 },
    }).toDestination();
    voice.volume.value = -6;
  }
  if (!click) {
    click = new Tone.MembraneSynth({ volume: -12 }).toDestination();
  }
  Tone.Transport.bpm.value = App.bpm;
  return true;
}

async function togglePlay() {
  if (playing) {
    stopPlayback();
    return;
  }
  if (!App.melody.length) {
    toast("Generate a melody first");
    return;
  }
  if (!(await ensureAudio())) return;
  startPlayback();
}

function startPlayback() {
  playing = true;
  setPlayUI(true);
  const beatDur = 60 / App.bpm;
  const step = beatDur / App.noteRate; // melody pace: note time per beat-unit
  voice.portamento = (App.glide / 100) * step; // meend glide time
  const useClick = $("clickChk").checked;
  const countIn = $("countInChk").checked;
  const loop = $("loopChk").checked;
  const lead = countIn ? 4 : 0;

  const seq =
    App.antara && App.antaraMelody.length
      ? App.melody.concat(App.antaraMelody)
      : App.melody;
  const phraseBeats = seq.reduce((s, m) => s + m.weight, 0);
  const phraseSec = phraseBeats * step; // melody length (scaled by pace)
  const t0 = Tone.now() + 0.15;
  const melodyStart = t0 + lead * beatDur;

  // count-in clicks (always at the steady beat)
  if (useClick) {
    for (let i = 0; i < lead; i++) click.triggerAttackRelease("C2", "16n", t0 + i * beatDur);
  }

  const scheduleCycle = (cycleStart) => {
    // metronome stays on the steady beat across the cycle window
    if (useClick) {
      const clicks = Math.max(1, Math.round(phraseSec / beatDur));
      for (let b = 0; b < clicks; b++) {
        click.triggerAttackRelease(b === 0 ? "C3" : "C2", "16n", cycleStart + b * beatDur);
      }
    }
    // melody notes (plus antara), paced by step
    let beat = 0;
    seq.forEach((m) => {
      scheduleNote(m, cycleStart + beat * step, step);
      beat += m.weight;
    });
  };

  scheduleCycle(melodyStart);
  animatePlayhead(melodyStart, phraseSec, loop);

  if (loop) {
    let next = melodyStart + phraseSec;
    loopTimer = setInterval(() => {
      if (!playing) return;
      scheduleCycle(next);
      next += phraseSec;
    }, phraseSec * 1000);
  } else {
    loopTimer = setTimeout(() => stopPlayback(), (lead * beatDur + phraseSec + 0.4) * 1000);
  }
}

function midiToFreq(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

// Play one note; ∩/∪ get a quick neighbor grace note first (murki-ish).
function scheduleNote(m, when, step) {
  const full = Math.max(0.1, m.weight * step * 0.92);
  if (m.ornament) {
    const neighbor = idxToMidi(m.idx + (m.ornament === "arch" ? 1 : -1));
    const gd = Math.min(0.12, m.weight * step * 0.35);
    voice.triggerAttackRelease(midiToFreq(neighbor), gd, when);
    voice.triggerAttackRelease(midiToFreq(m.midi), Math.max(0.08, full - gd), when + gd);
  } else {
    voice.triggerAttackRelease(midiToFreq(m.midi), full, when);
  }
}

function stopPlayback() {
  playing = false;
  setPlayUI(false);
  if (loopTimer) {
    clearInterval(loopTimer);
    clearTimeout(loopTimer);
    loopTimer = null;
  }
  if (rafId) cancelAnimationFrame(rafId);
  if (voice) voice.triggerRelease();
  const head = $("playhead");
  if (head) head.setAttribute("opacity", "0");
}

function setPlayUI(on) {
  $("playIcon").textContent = on ? "stop" : "play_arrow";
  $("playLabel").textContent = on ? "Stop" : "Play";
}

function animatePlayhead(startTime, phraseSec, loop) {
  const head = $("playhead");
  if (!head || !App._map) return;
  const { padX, pxPerBeat } = App._map;
  const step = 60 / App.bpm / App.noteRate;
  head.setAttribute("opacity", "1");
  const tick = () => {
    if (!playing) return;
    let elapsed = Tone.now() - startTime;
    if (elapsed < 0) elapsed = 0;
    let pos = elapsed / step;
    if (loop) pos = pos % (phraseSec / step);
    const x = padX + pos * pxPerBeat;
    head.setAttribute("x1", x);
    head.setAttribute("x2", x);
    rafId = requestAnimationFrame(tick);
  };
  rafId = requestAnimationFrame(tick);
}

/* ----------------------------------------------------------
   VARIATIONS + COPY
---------------------------------------------------------- */
function suggestVariations() {
  if (!App.cells.length) {
    toast("Pick a bahr first");
    return;
  }
  const list = $("variationsList");
  list.innerHTML = "";
  for (let v = 0; v < 4; v++) {
    const contour = generateContour(App.cells, App.style);
    const card = document.createElement("button");
    card.className =
      "text-left rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-2 hover:border-indigo-400";
    card.innerHTML = `<div class="text-xs text-gray-400 mb-1">Idea ${v + 1}</div>
      <div class="text-xl">${contour.join(" ")}</div>`;
    card.onclick = () => {
      App.contour = contour;
      realize();
      renderAll();
      toast(`Loaded idea ${v + 1}`);
    };
    list.appendChild(card);
  }
}

async function copyMelody() {
  if (!App.melody.length) {
    toast("Generate a melody first");
    return;
  }
  const line = $("misraInput").value.trim();
  const text =
    `مصرع: ${line}\n` +
    `Bahr: ${App.bahr?.name || ""}\n` +
    `Arkaan: ${App.bahr?.arkan || ""}  |  Adad: ${App.bahr?.adad || ""}\n` +
    `Key: Sa=${midiToWest(App.sa)}  |  Scale: ${SCALES[App.scale].label}\n` +
    `Tempo: ${App.bpm} BPM  |  Pace: ${App.noteRate}×  |  Meend: ${App.glide}%\n\n` +
    `Contour: ${App.contour.join(" ")}\n` +
    `Sargam:  ${App.melody.map((m) => m.sarg).join(" ")}\n` +
    `Western: ${App.melody.map((m) => m.west).join(" ")}\n` +
    `Syllables: ${App.syllables.join(" | ")}`;
  try {
    await navigator.clipboard.writeText(text);
    toast("Copied");
  } catch (_) {
    toast("Copy failed");
  }
}

/* ----------------------------------------------------------
   THEME (matches editor/index.html)
---------------------------------------------------------- */
function initTheme() {
  const root = document.documentElement;
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  if (localStorage.theme === "dark") root.classList.add("dark");
  else if (localStorage.theme === "light") root.classList.remove("dark");
  else {
    localStorage.theme = prefersDark ? "dark" : "light";
    root.classList.toggle("dark", prefersDark);
  }
  $("toggleDark").addEventListener("click", () => {
    const isDark = root.classList.toggle("dark");
    localStorage.theme = isDark ? "dark" : "light";
  });
}

/* ----------------------------------------------------------
   CUSTOM METER
---------------------------------------------------------- */
function wireCustomMeter() {
  const form = $("customForm");
  $("customToggle").addEventListener("click", () => form.classList.toggle("hidden"));
  $("customAdd").addEventListener("click", () => {
    const adad = ($("customAdad").value || "").trim();
    if (!/^[12\s]+$/.test(adad) || !/[12]/.test(adad)) {
      toast("Adad must be 1s and 2s, e.g. 122 122 122 122");
      return;
    }
    const meter = {
      name: ($("customName").value || "").trim() || "میری بحر",
      arkan: ($("customArkan").value || "").trim(),
      adad: adad.replace(/\s+/g, " "),
      use: "custom",
      custom: true,
    };
    saveCustomMeter(meter);
    App.buhoor.push(meter);
    populateControls();
    $("meterSelect").value = App.buhoor.length - 1;
    updateBahr();
    rebuildSyllables();
    form.classList.add("hidden");
    $("customAdad").value = $("customArkan").value = $("customName").value = "";
    toast("Custom meter added");
  });
}

/* ----------------------------------------------------------
   WIRING
---------------------------------------------------------- */
// Render with locally-served Mehr immediately; swap to Payami only once the
// big CDN font is fully downloaded (no mid-render flash, works offline).
function loadPayamiDeferred() {
  if (!document.fonts || !document.fonts.load) return;
  document.fonts
    .load('1em "Payami"')
    .then(() => document.documentElement.classList.add("payami-ready"))
    .catch(() => {});
}

async function init() {
  initTheme();
  loadPayamiDeferred();

  // help modal
  const help = $("helpModal");
  $("toggleHelp").addEventListener("click", () => {
    help.classList.remove("hidden");
    help.classList.add("flex");
  });
  $("closeHelp").addEventListener("click", () => {
    help.classList.add("hidden");
    help.classList.remove("flex");
  });
  help.addEventListener("click", (e) => {
    if (e.target === help) $("closeHelp").click();
  });

  await loadBuhoor();
  populateControls();
  updateBahr();
  refreshMisra();
  setNotation("sargam");
  wireCustomMeter();

  $("meterSelect").addEventListener("change", updateBahr);
  $("misraInput").addEventListener("input", refreshMisra);
  $("paceSelect").addEventListener("change", (e) => {
    App.noteRate = parseFloat(e.target.value);
  });
  $("antaraChk").addEventListener("change", (e) => {
    App.antara = e.target.checked;
    if (App.melody.length) renderAll();
  });
  $("saSelect").addEventListener("change", (e) => {
    App.sa = parseInt(e.target.value, 10);
    if (App.melody.length) { realize(); renderAll(); }
  });
  $("scaleSelect").addEventListener("change", (e) => {
    App.scale = e.target.value;
    if (App.melody.length) { realize(); renderAll(); }
  });
  $("styleSelect").addEventListener("change", (e) => (App.style = e.target.value));

  $("bpmRange").addEventListener("input", (e) => setBpm(e.target.value));
  $("meendRange").addEventListener("input", (e) => {
    App.glide = parseInt(e.target.value, 10);
    $("meendValue").textContent = App.glide;
    if (voice) voice.portamento = (App.glide / 100) * (60 / App.bpm / App.noteRate);
    renderMelodyMap();
  });
  $("tapTempo").addEventListener("click", tapTempo);
  $("notSargam").addEventListener("click", () => setNotation("sargam"));
  $("notWestern").addEventListener("click", () => setNotation("western"));

  $("generateBtn").addEventListener("click", generate);
  $("playBtn").addEventListener("click", togglePlay);
  $("variationsBtn").addEventListener("click", suggestVariations);
  $("copyBtn").addEventListener("click", copyMelody);

  console.log("دھن Melody Studio ready —", App.buhoor.length, "meters loaded");
}

window.addEventListener("DOMContentLoaded", init);
