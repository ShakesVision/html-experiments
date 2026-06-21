/* ==========================================================
GHAZAL MELODY GENERATOR
PART 1 - CORE ENGINE
========================================================== */

"use strict";

/* ==========================================================
APP STATE
========================================================== */

const AppState = {
  buhoor: [],
  selectedBahr: null,
  selectedScale: "C_MAJOR",
  selectedStyle: "mehdi_hassan",
  generatedVariations: [],
};

/* ==========================================================
SCALES
========================================================== */

const SCALES = {
  C_MAJOR: ["C", "D", "E", "F", "G", "A", "B"],

  D_MAJOR: ["D", "E", "F#", "G", "A", "B", "C#"],

  G_MAJOR: ["G", "A", "B", "C", "D", "E", "F#"],

  A_MINOR: ["A", "B", "C", "D", "E", "F", "G"],

  C_MINOR: ["C", "D", "D#", "F", "G", "G#", "A#"],
};

/* ==========================================================
SARGAM MAP
========================================================== */

const SARGAM = {
  0: "Sa",
  1: "Re",
  2: "Ga",
  3: "Ma",
  4: "Pa",
  5: "Dha",
  6: "Ni",
};

/* ==========================================================
STYLE PROFILES
========================================================== */

const STYLES = {
  jagjit: {
    name: "Jagjit Style",
    leapChance: 0.1,
    repeatChance: 0.7,
    range: 4,
  },

  mehdi_hassan: {
    name: "Mehdi Hassan Style",
    leapChance: 0.3,
    repeatChance: 0.3,
    range: 7,
  },

  ghulam_ali: {
    name: "Ghulam Ali Style",
    leapChance: 0.45,
    repeatChance: 0.2,
    range: 8,
  },
};

/* ==========================================================
CONTOUR TEMPLATES
========================================================== */

const CONTOURS = [
  ["→", "↑", "→", "↓"],

  ["→", "↑", "↑", "↓"],

  ["→", "→", "↑", "↓"],

  ["↑", "→", "↓", "↓"],

  ["↑", "↑", "→", "↓"],

  ["→", "↓", "→", "↑"],

  ["→", "↑", "↓", "→"],
];

/* ==========================================================
CADENCES
========================================================== */

const CADENCES = {
  soft: [-1, -1, -1],

  strong: [0, -2, -2],

  floating: [1, 1],
};

/* ==========================================================
UTILITIES
========================================================== */

function rand(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function choose(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function chance(p) {
  return Math.random() < p;
}

/* ==========================================================
LOAD BUHOOR.JSON
========================================================== */

async function loadBuhoor(path = "buhoor.json") {
  try {
    const res = await fetch(path);

    AppState.buhoor = await res.json();

    console.log("Loaded", AppState.buhoor.length, "meters");

    return AppState.buhoor;
  } catch (err) {
    console.error(err);
    return [];
  }
}

/* ==========================================================
BAHR LOOKUP
========================================================== */

function getBahrByName(name) {
  return AppState.buhoor.find((b) => b.name === name);
}

/* ==========================================================
ARKAAN EXTRACTION
========================================================== */

function extractArkaan(bahr) {
  if (!bahr) return [];

  if (Array.isArray(bahr.arkaan)) return bahr.arkaan;

  if (typeof bahr.arkaan === "string") {
    return bahr.arkaan
      .split(/[|،,]/)
      .map((x) => x.trim())
      .filter(Boolean);
  }

  return [];
}

/* ==========================================================
PATTERN EXTRACTION
========================================================== */

function extractPattern(bahr) {
  if (!bahr) return [];

  if (Array.isArray(bahr.pattern)) return bahr.pattern;

  return [];
}

/* ==========================================================
GENERATE CONTOUR
========================================================== */

function generateContour(arkaan) {
  const contour = [];

  for (let i = 0; i < arkaan.length; i++) {
    contour.push(choose(CONTOURS));
  }

  return contour;
}

/* ==========================================================
SCALE NAVIGATION
========================================================== */

function moveInScale(scale, currentIndex, movement) {
  let next = currentIndex;

  if (movement === "↑") next++;

  if (movement === "↓") next--;

  if (movement === "⇈") next += 2;

  if (movement === "⇊") next -= 2;

  next = Math.max(0, Math.min(scale.length - 1, next));

  return next;
}

/* ==========================================================
CONTOUR -> NOTES
========================================================== */

function contourToNotes(contour, scaleName, styleName) {
  const scale = SCALES[scaleName];

  let style = STYLES[styleName];

  if (!style) {
    style = {
      range: [0, 5],
      preferredSteps: [0, 1, 2, 3, 4, 5],
    };
  }
  let current = rand(1, Math.min(style.range, scale.length - 2));

  const notes = [];

  contour.forEach((segment) => {
    segment.forEach((symbol) => {
      if (chance(style.repeatChance)) {
        notes.push(scale[current]);
        return;
      }

      if (symbol === "↑" && chance(style.leapChance)) {
        current = moveInScale(scale, current, "⇈");
      } else if (symbol === "↓" && chance(style.leapChance)) {
        current = moveInScale(scale, current, "⇊");
      } else {
        current = moveInScale(scale, current, symbol);
      }

      notes.push(scale[current]);
    });
  });

  return notes;
}

/* ==========================================================
HIGH REGISTER VERSION
========================================================== */

function generateHighVersion(notes, scaleName) {
  const scale = SCALES[scaleName];

  return notes.map((note) => {
    const idx = scale.indexOf(note);

    if (idx === -1) return note;

    const newIdx = Math.min(scale.length - 1, idx + 3);

    return scale[newIdx];
  });
}

/* ==========================================================
BRIDGE
========================================================== */

function generateBridge(highNotes, scaleName) {
  const scale = SCALES[scaleName];

  const last = highNotes[highNotes.length - 1];

  let idx = scale.indexOf(last);

  const bridge = [];

  for (let i = 0; i < 3; i++) {
    idx = Math.max(0, idx - 1);

    bridge.push(scale[idx]);
  }

  return bridge;
}

/* ==========================================================
CADENCE
========================================================== */

function applyCadence(notes, scaleName, type = "soft") {
  const scale = SCALES[scaleName];

  let idx = scale.indexOf(notes[notes.length - 1]);

  const cadence = CADENCES[type];

  cadence.forEach((step) => {
    idx += step;

    idx = Math.max(0, Math.min(scale.length - 1, idx));

    notes.push(scale[idx]);
  });

  return notes;
}

/* ==========================================================
SARGAM CONVERSION
========================================================== */

function notesToSargam(notes, scaleName) {
  const scale = SCALES[scaleName];

  return notes.map((note) => {
    const idx = scale.indexOf(note);

    return SARGAM[idx] || "?";
  });
}

/* ==========================================================
VARIATION GENERATOR
========================================================== */

function generateVariation(bahr, scaleName, styleName) {
  const arkaan = extractArkaan(bahr);

  const contour = generateContour(arkaan);

  const notes = contourToNotes(contour, scaleName, styleName);

  const high = generateHighVersion(notes, scaleName);

  const bridge = generateBridge(high, scaleName);

  applyCadence(notes, scaleName, "soft");

  return {
    contour,
    notes,
    high,
    bridge,

    sargam: notesToSargam(notes, scaleName),
  };
}

/* ==========================================================
GENERATE 5 IDEAS
========================================================== */

function generateFiveIdeas(bahr, scaleName, styleName) {
  const ideas = [];

  for (let i = 0; i < 5; i++) {
    ideas.push(generateVariation(bahr, scaleName, styleName));
  }

  AppState.generatedVariations = ideas;

  return ideas;
}

/* ==========================================================
DEBUG TEST
========================================================== */

window.GhazalEngine = {
  loadBuhoor,
  generateFiveIdeas,
  generateVariation,

  AppState,
  SCALES,
  STYLES,
};

console.log("Ghazal Engine Part 1 Loaded");
/* ==========================================================
PART 2
UI ENGINE
========================================================== */

let currentVariation = null;

/* ==========================================================
DOM HELPERS
========================================================== */

function el(id) {
  return document.getElementById(id);
}

function setText(id, value) {
  const node = el(id);

  if (node) node.textContent = value;
}

/* ==========================================================
LOAD METERS
========================================================== */

async function initializeApp() {
  await loadBuhoor();

  populateMeterDropdown();

  attachEvents();

  updateMeterInfo();
}

window.addEventListener("DOMContentLoaded", initializeApp);

/* ==========================================================
DROPDOWN
========================================================== */

function populateMeterDropdown() {
  const select = el("meterSelect");

  if (!select) return;

  select.innerHTML = "";

  AppState.buhoor.forEach((bahr, index) => {
    const option = document.createElement("option");

    option.value = index;

    option.textContent = bahr.name;

    select.appendChild(option);
  });
}

/* ==========================================================
UPDATE INFO
========================================================== */

function updateMeterInfo() {
  const idx = parseInt(el("meterSelect").value || 0);

  const bahr = AppState.buhoor[idx];

  if (!bahr) return;

  AppState.selectedBahr = bahr;

  setText("bahrName", bahr.name);

  setText("bahrArkan", bahr.arkan);

  setText("meterPattern", bahr.adad);
}

/* ==========================================================
EVENTS
========================================================== */

function attachEvents() {
  el("meterSelect")?.addEventListener("change", () => {
    updateMeterInfo();
  });

  el("generateBtn")?.addEventListener("click", generateMisraSet);

  el("playBtn")?.addEventListener("click", playCurrentVariation);

  el("copyBtn")?.addEventListener("click", copyCurrentVariation);
}

/* ==========================================================
GENERATE
========================================================== */

function generateMisraSet() {
  const meterIndex = parseInt(el("meterSelect").value);

  const scale = el("scaleSelect")?.value || "C_MAJOR";

  const style = el("styleSelect")?.value || "mehdi_hassan";

  const bahr = AppState.buhoor[meterIndex];

  currentVariation = generateVariation(bahr, scale, style);

  renderVariation(currentVariation);

  toast("Melody generated");
}

/* ==========================================================
RENDER
========================================================== */

function renderVariation(v) {
  renderContour(v.contour);

  setText("notesOutput", v.notes.join(" "));

  setText("highOutput", v.high.join(" "));

  setText("secondOutput", v.bridge.join(" "));

  setText("sargamOutput", v.sargam.join(" "));
}

/* ==========================================================
ARROW UI
========================================================== */

const ARROW_CYCLE = ["↑", "↓", "→", "⇈", "⇊"];

function renderContour(contour) {
  const box = el("arrowOutput");

  if (!box) return;

  box.innerHTML = "";

  contour.forEach((segment) => {
    const group = document.createElement("div");

    group.className = "flex gap-2 mb-2";

    segment.forEach((arrow) => {
      const btn = document.createElement("button");

      btn.className = "px-3 py-2 rounded bg-slate-200 hover:bg-slate-300";

      btn.textContent = arrow;

      btn.onclick = () => {
        cycleArrow(btn);
      };

      group.appendChild(btn);
    });

    box.appendChild(group);
  });
}

function cycleArrow(btn) {
  const current = btn.textContent;

  let index = ARROW_CYCLE.indexOf(current);

  index++;

  if (index >= ARROW_CYCLE.length) {
    index = 0;
  }

  btn.textContent = ARROW_CYCLE[index];
}

/* ==========================================================
COPY
========================================================== */

async function copyCurrentVariation() {
  if (!currentVariation) return;

  const text = `ARROWS

${JSON.stringify(currentVariation.contour)}

NOTES

${currentVariation.notes.join(" ")}

SARGAM

${currentVariation.sargam.join(" ")}

HIGH

${currentVariation.high.join(" ")}
`;

  await navigator.clipboard.writeText(text);

  toast("Copied");
}

/* ==========================================================
TOAST
========================================================== */

function toast(msg) {
  let toast = document.createElement("div");

  toast.className = `fixed
bottom-5
right-5
bg-slate-900
text-white
px-5
py-3
rounded-xl
shadow-xl
z-50`;

  toast.textContent = msg;

  document.body.appendChild(toast);

  setTimeout(() => {
    toast.remove();
  }, 2500);
}

/* ==========================================================
PLAYBACK
========================================================== */

let synth = null;

async function ensureSynth() {
  if (typeof Tone === "undefined") {
    toast("Tone.js missing");
    return null;
  }

  if (!synth) {
    await Tone.start();

    synth = new Tone.Synth().toDestination();
  }

  return synth;
}

/* ==========================================================
NOTE MAPPING
========================================================== */

const MIDI_MAP = {
  C: "C4",
  D: "D4",
  E: "E4",
  F: "F4",
  G: "G4",
  A: "A4",
  B: "B4",

  "C#": "C#4",
  "D#": "D#4",
  "F#": "F#4",
  "G#": "G#4",
  "A#": "A#4",
};

async function playCurrentVariation() {
  if (!currentVariation) {
    toast("Generate first");

    return;
  }

  const synth = await ensureSynth();

  if (!synth) return;

  let time = 0;

  currentVariation.notes.forEach((note) => {
    synth.triggerAttackRelease(MIDI_MAP[note] || "C4", "8n", Tone.now() + time);

    time += 0.35;
  });
}

/* ==========================================================
GENERATE 5 IDEAS
========================================================== */

function generateFive() {
  const meterIndex = parseInt(el("meterSelect").value);

  const bahr = AppState.buhoor[meterIndex];

  const ideas = generateFiveIdeas(
    bahr,
    el("scaleSelect").value,
    el("styleSelect").value,
  );

  console.log(ideas);

  return ideas;
}

/* ==========================================================
GLOBAL
========================================================== */

window.generateMisraSet = generateMisraSet;

window.generateFive = generateFive;

window.playCurrentVariation = playCurrentVariation;

window.copyCurrentVariation = copyCurrentVariation;

console.log("Part 2 Loaded");
