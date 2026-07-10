// Injected into the target page on demand (via chrome.scripting from the
// popup). Runs the shared engine against the LIVE, already-rendered DOM — the
// path that works on JavaScript SPAs like chartink — and hosts the visual
// point-and-click picker. Loaded once; guarded against re-injection.

(() => {
  if (window.__scrapeContentLoaded) return;
  window.__scrapeContentLoaded = true;

  const engineUrl = (name) => chrome.runtime.getURL("engine/" + name);
  const loadEngine = async () => ({
    extract: (await import(engineUrl("extract.js"))),
    selector: (await import(engineUrl("selector.js"))),
  });

  // ---- picker overlay ----
  let picking = false;
  let hovered = null;
  let pickMode = "records";

  function ensureStyle() {
    if (document.getElementById("__scrape_style")) return;
    const link = document.createElement("link");
    link.id = "__scrape_style";
    link.rel = "stylesheet";
    link.href = chrome.runtime.getURL("picker.css");
    document.documentElement.appendChild(link);
  }

  function toast(text) {
    let t = document.getElementById("__scrape_toast");
    if (!t) {
      t = document.createElement("div");
      t.id = "__scrape_toast";
      t.className = "scrape-toast";
      document.documentElement.appendChild(t);
    }
    t.textContent = text;
    t.classList.add("show");
    setTimeout(() => t.classList.remove("show"), 3500);
  }

  function onHover(e) {
    if (hovered) hovered.classList.remove("scrape-hi");
    hovered = e.target;
    if (hovered && hovered.classList) hovered.classList.add("scrape-hi");
  }

  async function onPick(e) {
    e.preventDefault();
    e.stopPropagation();
    const el = e.target;
    stopPicking();
    const { selector } = await loadEngine();
    let recipe;
    if (pickMode === "records") {
      const g = selector.generalizeToList(el, document);
      recipe = { container: g.container, fields: g.fields };
    } else {
      recipe = { selector: selector.buildSelector(el, document), mode: "all", extractType: "text" };
    }
    await chrome.storage.local.set({ scrapePicked: recipe });
    toast("Selection captured ✓  Open the Scrape popup to use it.");
  }

  function startPicking(mode) {
    ensureStyle();
    pickMode = mode || "records";
    picking = true;
    document.addEventListener("mouseover", onHover, true);
    document.addEventListener("click", onPick, true);
    document.body && document.body.classList.add("scrape-picking");
    toast("Click an element to select it (Esc to cancel).");
  }

  function stopPicking() {
    picking = false;
    document.removeEventListener("mouseover", onHover, true);
    document.removeEventListener("click", onPick, true);
    if (hovered) hovered.classList.remove("scrape-hi");
    document.body && document.body.classList.remove("scrape-picking");
  }

  document.addEventListener("keydown", (e) => { if (picking && e.key === "Escape") stopPicking(); }, true);

  // ---- message API (from popup) ----
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (!msg || typeof msg !== "object") return;

    if (msg.type === "START_PICK") {
      startPicking(msg.mode);
      sendResponse({ ok: true });
      return false;
    }

    if (msg.type === "LIVE_EXTRACT") {
      loadEngine()
        .then(({ extract }) => {
          const result = extract.extract(document, msg.recipe);
          sendResponse({ ok: true, result });
        })
        .catch((err) => sendResponse({ ok: false, error: err.message || String(err) }));
      return true; // async
    }
  });
})();
