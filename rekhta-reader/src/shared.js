// Generic helpers shared between the book reader (src/index.js) and the
// poetry/prose downloader (poetry/src/scraper.js). Keep this file free of
// book-specific (manifest/unscramble/canvas) or poetry-specific (listing
// selectors) logic so both apps can stay separate while sharing plumbing.

export {
  applyProxyPrefix,
  createLimiter,
  createSelectorStore,
  fetchHtml,
  getDeviceProfile,
  renderSelectorForm,
};

// A localStorage-backed override layer over a set of default strings — the
// CSS selectors / markers each app pulls from Rekhta. Users can edit these
// when Rekhta changes its markup, without waiting for a code update. An
// override equal to the default (or blank) is dropped, so `defaults` stays
// the single source of truth and a "reset" is just clearing storage.
function createSelectorStore(storageKey, defaults) {
  let overrides = {};
  try {
    overrides = JSON.parse(localStorage.getItem(storageKey) || "{}") || {};
  } catch {
    overrides = {};
  }

  function persist() {
    localStorage.setItem(storageKey, JSON.stringify(overrides));
  }

  return {
    defaults,
    get(key) {
      const value = overrides[key];
      return value != null && value !== "" ? value : defaults[key];
    },
    isOverridden(key) {
      return overrides[key] != null && overrides[key] !== "" && overrides[key] !== defaults[key];
    },
    set(key, value) {
      const trimmed = (value || "").trim();
      if (!trimmed || trimmed === defaults[key]) {
        delete overrides[key];
      } else {
        overrides[key] = trimmed;
      }
      persist();
    },
    reset() {
      overrides = {};
      localStorage.removeItem(storageKey);
    },
  };
}

// Builds the editable rows for a selector settings panel. `defs` is an array
// of { key, label, description }. Field changes write straight to the store;
// the caller owns the surrounding modal, the Reset button (calls store.reset
// then re-invokes this), and when the change takes effect (next fetch).
function renderSelectorForm(container, defs, store) {
  container.innerHTML = "";
  defs.forEach((def) => {
    const row = document.createElement("div");
    row.className = "selector-row";

    const head = document.createElement("div");
    head.className = "selector-row-head";
    const label = document.createElement("label");
    label.className = "selector-label";
    label.textContent = def.label;
    label.setAttribute("for", `sel-${def.key}`);
    head.appendChild(label);
    if (store.isOverridden(def.key)) {
      const flag = document.createElement("span");
      flag.className = "selector-flag";
      flag.textContent = "edited";
      head.appendChild(flag);
    }

    const desc = document.createElement("p");
    desc.className = "selector-desc";
    desc.textContent = def.description;

    const input = document.createElement("input");
    input.type = "text";
    input.id = `sel-${def.key}`;
    input.className = "selector-input";
    input.dir = "ltr";
    input.spellcheck = false;
    input.value = store.get(def.key);
    input.placeholder = store.defaults[def.key];
    input.addEventListener("change", () => {
      store.set(def.key, input.value);
      input.value = store.get(def.key); // reflect fallback if cleared
      flagRow(row, store.isOverridden(def.key));
    });

    row.append(head, desc, input);
    container.appendChild(row);
  });
}

function flagRow(row, isOverridden) {
  const head = row.querySelector(".selector-row-head");
  const existing = head.querySelector(".selector-flag");
  if (isOverridden && !existing) {
    const flag = document.createElement("span");
    flag.className = "selector-flag";
    flag.textContent = "edited";
    head.appendChild(flag);
  } else if (!isOverridden && existing) {
    existing.remove();
  }
}

function applyProxyPrefix(url, proxyPrefix) {
  if (!proxyPrefix) {
    return url;
  }

  if (proxyPrefix.includes("{url}")) {
    return proxyPrefix.replace("{url}", encodeURIComponent(url));
  }

  return `${proxyPrefix}${encodeURIComponent(url)}`;
}

function createLimiter(concurrency) {
  const queue = [];
  let activeCount = 0;

  return async (task) => {
    if (activeCount >= concurrency) {
      await new Promise((resolve) => {
        queue.push(resolve);
      });
    }

    activeCount += 1;

    try {
      return await task();
    } finally {
      activeCount -= 1;
      const nextTask = queue.shift();
      if (nextTask) {
        nextTask();
      }
    }
  };
}

async function fetchHtml(url, options = {}) {
  const { proxyPrefix = "", fetchImpl = fetch.bind(globalThis), signal } = options;

  const response = await fetchImpl(applyProxyPrefix(url, proxyPrefix), {
    method: "GET",
    mode: "cors",
    signal,
  });

  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}`);
  }

  const html = await response.text();
  const parser = new DOMParser();
  return parser.parseFromString(html, "text/html");
}

function getDeviceProfile() {
  const hardwareConcurrency = navigator.hardwareConcurrency || 4;
  const deviceMemory = navigator.deviceMemory || 4;

  return {
    deviceMemory,
    downloadConcurrency: Math.max(
      1,
      Math.min(2, Math.floor(Math.min(hardwareConcurrency, deviceMemory) / 2)),
    ),
    hardwareConcurrency,
    previewConcurrency: Math.max(
      1,
      Math.min(4, Math.floor((hardwareConcurrency + deviceMemory) / 3)),
    ),
  };
}
