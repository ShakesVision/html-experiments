import { createLimiter } from "../src/shared.js";
import {
  collectListingLinks,
  discoverPoetCategories,
  fetchWorkContent,
  searchPoets,
} from "./src/scraper.js";

const SAMPLE_POET_URL = "https://www.rekhta.org/poets/mirza-ghalib?lang=ur";
const PROXY_STORAGE_KEY = "rekhta_proxy_prefix"; // shared with the book downloader
const ITEM_FETCH_CONCURRENCY = 3;

const elements = {
  poetForm: document.getElementById("poet-form"),
  poetUrlInput: document.getElementById("poet-url"),
  proxyInput: document.getElementById("proxy-prefix"),
  discoverButton: document.getElementById("discover-button"),
  searchButton: document.getElementById("search-button"),
  cacheBadge: document.getElementById("cache-badge"),
  progressLabel: document.getElementById("progress-label"),
  statusText: document.getElementById("status-text"),

  categoriesPanel: document.getElementById("categories-panel"),
  categoriesPoetName: document.getElementById("categories-poet-name"),
  categoriesList: document.getElementById("categories-list"),
  categoriesStart: document.getElementById("categories-start"),

  jobsList: document.getElementById("jobs-list"),

  manualForm: document.getElementById("manual-form"),
  manualLinks: document.getElementById("manual-links"),

  uploadForm: document.getElementById("upload-form"),
  uploadFile: document.getElementById("upload-file"),

  searchModal: document.getElementById("search-modal"),
  searchClose: document.getElementById("search-close"),
  searchKeyword: document.getElementById("search-keyword"),
  searchLang: document.getElementById("search-lang"),
  searchSubmit: document.getElementById("search-submit"),
  searchStatus: document.getElementById("search-status"),
  searchResults: document.getElementById("search-results"),

  readerModal: document.getElementById("reader-modal"),
  readerStage: document.querySelector(".reader-stage"),
  readerClose: document.getElementById("reader-close"),
  readerPrev: document.getElementById("reader-prev"),
  readerNext: document.getElementById("reader-next"),
  readerPositionInput: document.getElementById("reader-position-input"),
  readerPositionTotal: document.getElementById("reader-position-total"),
  readerCopy: document.getElementById("reader-copy"),
  readerShare: document.getElementById("reader-share"),
  readerDownload: document.getElementById("reader-download"),
  readerSource: document.getElementById("reader-source"),
  readerTitle: document.getElementById("reader-title"),
  readerAuthor: document.getElementById("reader-author"),
  readerBody: document.getElementById("reader-body"),
  readerFormatBar: document.getElementById("reader-format-bar"),
  readerFormatSelect: document.getElementById("reader-format-select"),
  readerFormatCustom: document.getElementById("reader-format-custom"),
};

const state = {
  categories: [],
  poetLabel: "",
  jobs: [],
  search: { debounceTimer: null, abortController: null },
  reader: { jobId: null, index: 0, format: "auto", customPattern: "" },
};

elements.poetUrlInput.value = SAMPLE_POET_URL;
elements.proxyInput.value = localStorage.getItem(PROXY_STORAGE_KEY) || "";

elements.poetForm.addEventListener("submit", onDiscoverSubmit);
elements.searchButton.addEventListener("click", openSearch);
elements.searchClose.addEventListener("click", closeSearch);
elements.searchModal.addEventListener("click", (event) => {
  if (event.target === elements.searchModal) {
    closeSearch();
  }
});
elements.searchSubmit.addEventListener("click", () => runSearch());
elements.searchKeyword.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    runSearch();
  }
});
elements.categoriesStart.addEventListener("click", onStartCategories);
elements.manualForm.addEventListener("submit", onManualSubmit);
elements.uploadForm.addEventListener("submit", onUploadSubmit);

elements.readerClose.addEventListener("click", closeReader);
elements.readerPrev.addEventListener("click", () => stepReader(-1));
elements.readerNext.addEventListener("click", () => stepReader(1));
elements.readerPositionInput.addEventListener("change", onReaderPositionInput);
elements.readerFormatSelect.addEventListener("change", onReaderFormatChange);
elements.readerFormatCustom.addEventListener("change", onReaderCustomPatternChange);
elements.readerStage.addEventListener("touchstart", onReaderTouchStart, { passive: true });
elements.readerStage.addEventListener("touchmove", onReaderTouchMove, { passive: true });
elements.readerStage.addEventListener("touchend", onReaderTouchEnd);
elements.readerCopy.addEventListener("click", onReaderCopy);
elements.readerShare.addEventListener("click", onReaderShare);
elements.readerDownload.addEventListener("click", onReaderDownload);
elements.readerModal.addEventListener("click", (event) => {
  if (event.target === elements.readerModal) {
    closeReader();
  }
});
document.addEventListener("keydown", (event) => {
  if (elements.readerModal.classList.contains("hidden")) {
    return;
  }
  if (event.key === "Escape") closeReader();
  if (event.key === "ArrowLeft") stepReader(-1);
  if (event.key === "ArrowRight") stepReader(1);
});

setStatus("Paste a poet/author profile URL, or search for one, to see what's available.");
renderJobs();

function getProxyPrefix() {
  const prefix = elements.proxyInput.value.trim();
  localStorage.setItem(PROXY_STORAGE_KEY, prefix);
  return prefix;
}

function setStatus(message, tone = "muted") {
  elements.statusText.textContent = message;
  elements.statusText.dataset.tone = tone;
}

function setProgress(label) {
  elements.progressLabel.textContent = label;
}

// ---- Discovery ----

async function onDiscoverSubmit(event) {
  event.preventDefault();
  const url = elements.poetUrlInput.value.trim();
  if (!url) {
    setStatus("Enter a poet/author profile URL first.", "error");
    return;
  }

  await discoverFromProfile(url);
}

async function discoverFromProfile(profileUrl) {
  const proxyPrefix = getProxyPrefix();
  elements.poetUrlInput.value = profileUrl;
  setProgress("Discovering...");
  setStatus(`Reading ${profileUrl}...`);
  elements.discoverButton.disabled = true;

  try {
    const categories = await discoverPoetCategories(profileUrl, { proxyPrefix });
    state.categories = categories;
    state.poetLabel = prettifyProfileUrl(profileUrl);

    if (!categories.length) {
      elements.categoriesPanel.classList.add("hidden");
      setStatus(
        "No scrapeable categories found on that page. Check the URL, or use the manual-paste fallback below.",
        "error",
      );
    } else {
      renderCategories();
      elements.categoriesPanel.classList.remove("hidden");
      setStatus(`Found ${categories.length} categories for ${state.poetLabel}.`, "success");
    }

    setProgress("Idle");
  } catch (error) {
    console.error(error);
    setStatus(`Unable to read that profile. ${error.message}`, "error");
    setProgress("Idle");
  } finally {
    elements.discoverButton.disabled = false;
  }
}

function prettifyProfileUrl(url) {
  try {
    const segments = new URL(url).pathname.split("/").filter(Boolean);
    const slug = segments[segments.length - 1] || "";
    return slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  } catch {
    return url;
  }
}

function renderCategories() {
  elements.categoriesPoetName.textContent = state.poetLabel;
  elements.categoriesList.innerHTML = "";

  state.categories.forEach((category) => {
    const row = document.createElement("label");
    row.className = "category-row";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = true;
    checkbox.dataset.slug = category.slug;

    const label = document.createElement("span");
    label.className = "category-label";
    label.dir = "auto";
    label.textContent = category.label;

    const count = document.createElement("span");
    count.className = "category-count";
    count.textContent = category.count;

    row.append(checkbox, label, count);
    elements.categoriesList.appendChild(row);
  });
}

function onStartCategories() {
  const checkedSlugs = new Set(
    Array.from(elements.categoriesList.querySelectorAll("input:checked")).map(
      (input) => input.dataset.slug,
    ),
  );

  const selected = state.categories.filter((category) => checkedSlugs.has(category.slug));
  if (!selected.length) {
    setStatus("Tick at least one category to fetch.", "error");
    return;
  }

  selected.forEach((category) => enqueueJob(category));
}

// ---- Poet search ----

function openSearch() {
  elements.searchModal.classList.remove("hidden");
  document.body.style.overflow = "hidden";
  elements.searchKeyword.focus();
}

function closeSearch() {
  elements.searchModal.classList.add("hidden");
  document.body.style.overflow = "";
  clearTimeout(state.search.debounceTimer);
  state.search.abortController?.abort();
}

async function runSearch() {
  const keyword = elements.searchKeyword.value.trim();
  const lang = elements.searchLang.value;
  if (!keyword) {
    setSearchStatus("Type a name to search.", "muted");
    return;
  }

  state.search.abortController?.abort();
  const abortController = new AbortController();
  state.search.abortController = abortController;

  setSearchStatus("Searching...", "muted");
  elements.searchResults.innerHTML = "";

  try {
    const results = await searchPoets(keyword, lang, {
      proxyPrefix: getProxyPrefix(),
      signal: abortController.signal,
    });

    if (!results.length) {
      setSearchStatus("No poets/authors found for that name.", "muted");
      return;
    }

    setSearchStatus(`Showing ${results.length} results. Click one to discover their work.`, "success");
    renderSearchResults(results);
  } catch (error) {
    if (error.name === "AbortError") return;
    console.error(error);
    setSearchStatus(`Search failed. ${error.message}`, "error");
  }
}

function setSearchStatus(message, tone) {
  elements.searchStatus.textContent = message;
  elements.searchStatus.dataset.tone = tone;
}

function renderSearchResults(results) {
  elements.searchResults.innerHTML = "";

  results.forEach((result) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "search-result";

    const cover = document.createElement("div");
    cover.className = "search-cover";
    if (result.image) {
      cover.style.backgroundImage = `url("${result.image}")`;
    }

    const copy = document.createElement("div");
    copy.className = "search-copy";
    const name = document.createElement("p");
    name.className = "search-tagline";
    name.dir = "auto";
    name.textContent = result.name;
    copy.appendChild(name);

    button.append(cover, copy);
    button.addEventListener("click", () => {
      closeSearch();
      discoverFromProfile(result.href);
    });

    elements.searchResults.appendChild(button);
  });
}

// ---- Job processing (discovery-driven and manual-paste both land here) ----

function enqueueJob(category) {
  const job = {
    id: `job-${state.jobs.length}-${Math.random().toString(36).slice(2, 8)}`,
    label: category.label,
    slug: category.slug,
    isProse: category.isProse,
    href: category.href,
    manualItems: null,
    status: "listing",
    message: "Finding pages...",
    done: 0,
    total: 0,
    results: [],
    abortController: new AbortController(),
  };

  state.jobs.push(job);
  renderJobs();
  processJob(job);
  return job;
}

function enqueueManualJob(links, isProse) {
  const job = {
    id: `job-${state.jobs.length}-${Math.random().toString(36).slice(2, 8)}`,
    label: "Manual links",
    slug: "manual",
    isProse,
    href: null,
    manualItems: links.map((href) => ({ href, resolved: false })),
    status: "listing",
    message: "Fetching pasted links...",
    done: 0,
    total: 0,
    results: [],
    abortController: new AbortController(),
  };

  state.jobs.push(job);
  renderJobs();
  processJob(job);
  return job;
}

async function processJob(job) {
  const proxyPrefix = getProxyPrefix();
  const { signal } = job.abortController;

  try {
    let items;
    if (job.manualItems) {
      items = job.manualItems;
    } else {
      items = await collectListingLinks(job.href, {
        proxyPrefix,
        signal,
        onProgress: (done, total) => {
          job.message = `Finding pages ${done}/${total}`;
          renderJobs();
        },
      });
    }

    job.total = items.length;
    job.status = "fetching";
    job.message = `Fetching 0/${items.length}`;
    renderJobs();

    const limiter = createLimiter(ITEM_FETCH_CONCURRENCY);
    job.results = await Promise.all(
      items.map((item) =>
        limiter(async () => {
          const resolved = item.resolved
            ? item
            : await fetchWorkContent(item.href, { proxyPrefix, signal });

          job.done += 1;
          job.message = `Fetching ${job.done}/${job.total}`;
          renderJobs();
          return resolved;
        }),
      ),
    );

    job.status = "done";
    job.message = `${job.results.length} fetched`;
  } catch (error) {
    if (error.name === "AbortError") {
      job.status = "cancelled";
      job.message = "Cancelled";
    } else {
      console.error(error);
      job.status = "error";
      job.message = error.message || "Failed to fetch.";
    }
  } finally {
    renderJobs();
  }
}

function onManualSubmit(event) {
  event.preventDefault();
  const links = elements.manualLinks.value
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /^https?:\/\//i.test(line));

  if (!links.length) {
    setStatus("Paste at least one valid link.", "error");
    return;
  }

  const isProse = document.querySelector('input[name="manual-format"]:checked').value === "prose";
  enqueueManualJob(links, isProse);
  elements.manualLinks.value = "";
}

// Re-opens a .txt/.json file this app downloaded earlier. There's no
// reliable way to tell poetry and prose apart from a plain .txt file alone,
// so the user says which it is via the format radio next to the picker.
async function onUploadSubmit(event) {
  event.preventDefault();
  const file = elements.uploadFile.files[0];
  if (!file) {
    setStatus("Choose a .txt or .json file first.", "error");
    return;
  }

  const isProse = document.querySelector('input[name="upload-format"]:checked').value === "prose";

  try {
    const text = await file.text();
    const items = isProse ? parseProseJson(text) : parsePoetryTxt(text);

    if (!items.length) {
      setStatus("That file didn't contain any recognizable entries.", "error");
      return;
    }

    const job = {
      id: `job-${state.jobs.length}-${Math.random().toString(36).slice(2, 8)}`,
      label: file.name,
      slug: "upload",
      isProse,
      href: null,
      manualItems: null,
      status: "done",
      message: `${items.length} loaded`,
      done: items.length,
      total: items.length,
      results: items,
      abortController: new AbortController(),
    };

    state.jobs.push(job);
    renderJobs();
    openReader(job.id);
    elements.uploadForm.reset();
    setStatus(`Opened ${file.name} (${items.length} entries).`, "success");
  } catch (error) {
    console.error(error);
    setStatus(`Couldn't open that file. ${error.message}`, "error");
  }
}

// Poetry export shape: blank-line-separated blocks, each block's own first
// line doubling as its title (same convention used for inline couplets).
function parsePoetryTxt(text) {
  return text
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => {
      const lines = block.split("\n").map((line) => line.trim()).filter(Boolean);
      return { title: lines[0] || "Untitled", author: "", text: lines.join("\n"), href: "" };
    });
}

// Prose export shape: an array of {title, text, label, description, link,
// url} (see downloadJob below) -- title and label both fold the author in,
// so pull it back out of the label's "...,مصنف:NAME" suffix.
function parseProseJson(text) {
  const payload = JSON.parse(text);
  if (!Array.isArray(payload)) {
    throw new Error("Expected a JSON array of stories.");
  }

  return payload.map((entry) => {
    const authorMatch = (entry.label || "").match(/مصنف:(.*)$/);
    const author = authorMatch ? authorMatch[1].trim() : "";
    let title = entry.title || "Untitled";
    if (author && title.endsWith(` — ${author}`)) {
      title = title.slice(0, -(author.length + 3));
    }

    return { title, author, text: entry.text || "", href: entry.url || entry.link || "" };
  });
}

function renderJobs() {
  elements.jobsList.innerHTML = "";

  if (!state.jobs.length) {
    const empty = document.createElement("li");
    empty.className = "queue-empty";
    empty.textContent = "No jobs yet. Discover a poet above, or paste links manually.";
    elements.jobsList.appendChild(empty);
    return;
  }

  state.jobs.forEach((job) => {
    const isActive = job.status === "listing" || job.status === "fetching";

    const row = document.createElement("li");
    row.className = `queue-row queue-row--${job.status}`;

    const info = document.createElement("div");
    info.className = "queue-row-info";

    const title = document.createElement("strong");
    title.dir = "auto";
    const badge = document.createElement("span");
    badge.className = "job-row-category";
    badge.textContent = job.slug;
    title.append(badge, job.label);

    const message = document.createElement("span");
    message.className = "queue-row-message";
    message.textContent = job.message;

    info.append(title, message);

    if (job.status === "done" && job.results.length) {
      const openButton = document.createElement("button");
      openButton.type = "button";
      openButton.className = "job-row-open job-row-open--reader";
      openButton.textContent = "Open reader";
      openButton.addEventListener("click", () => openReader(job.id));

      const downloadButton = document.createElement("button");
      downloadButton.type = "button";
      downloadButton.className = "job-row-open job-row-open--download";
      downloadButton.textContent = job.isProse ? "Download .json" : "Download .txt";
      downloadButton.addEventListener("click", () => downloadJob(job));

      info.append(openButton, downloadButton);
    }

    const progress = document.createElement("progress");
    progress.max = 100;
    progress.value = job.total ? Math.round((job.done / job.total) * 100) : job.status === "done" ? 100 : 0;

    const actionButton = document.createElement("button");
    actionButton.type = "button";
    actionButton.className = "queue-row-action";
    actionButton.setAttribute("aria-label", isActive ? "Cancel" : "Remove");
    actionButton.innerHTML = isActive
      ? '<i class="fa-solid fa-xmark"></i>'
      : '<i class="fa-solid fa-trash"></i>';
    actionButton.addEventListener("click", () => {
      if (isActive) {
        job.abortController.abort();
        return;
      }
      state.jobs = state.jobs.filter((entry) => entry.id !== job.id);
      renderJobs();
    });

    row.append(info, progress, actionButton);
    elements.jobsList.appendChild(row);
  });
}

// ---- Reader ----

function openReader(jobId) {
  state.reader = { jobId, index: 0, format: "auto", customPattern: "" };
  elements.readerModal.classList.remove("hidden");
  document.body.style.overflow = "hidden";
  renderReaderItem();
}

function closeReader() {
  elements.readerModal.classList.add("hidden");
  document.body.style.overflow = "";
}

function currentJob() {
  return state.jobs.find((job) => job.id === state.reader.jobId);
}

function stepReader(delta) {
  const job = currentJob();
  if (!job) return;

  const nextIndex = state.reader.index + delta;
  if (nextIndex < 0 || nextIndex >= job.results.length) return;

  state.reader.index = nextIndex;
  renderReaderItem();
}

let touchStartX = 0;
let touchEndX = 0;

function onReaderTouchStart(event) {
  touchStartX = event.touches[0].clientX;
}

function onReaderTouchMove(event) {
  touchEndX = event.touches[0].clientX;
}

function onReaderTouchEnd() {
  const swipeThreshold = 50; // pixels
  const deltaX = touchEndX - touchStartX;

  if (deltaX > swipeThreshold) {
    stepReader(-1); // swiped right -> previous
  } else if (deltaX < -swipeThreshold) {
    stepReader(1); // swiped left -> next
  }

  touchStartX = 0;
  touchEndX = 0;
}

function onReaderPositionInput() {
  const job = currentJob();
  if (!job) return;

  const rawValue = Number(elements.readerPositionInput.value);
  if (!Number.isInteger(rawValue)) {
    elements.readerPositionInput.value = `${state.reader.index + 1}`;
    return;
  }

  state.reader.index = Math.min(Math.max(rawValue, 1), job.results.length) - 1;
  renderReaderItem();
}

function renderReaderItem() {
  const job = currentJob();
  if (!job || !job.results.length) return;

  const item = job.results[state.reader.index];
  elements.readerSource.textContent = job.label;
  elements.readerPositionInput.value = `${state.reader.index + 1}`;
  elements.readerPositionInput.max = `${job.results.length}`;
  elements.readerPositionTotal.textContent = `/ ${job.results.length}`;
  elements.readerTitle.textContent = item.title || "Untitled";
  elements.readerAuthor.textContent = item.author || "";

  elements.readerPrev.disabled = state.reader.index === 0;
  elements.readerNext.disabled = state.reader.index === job.results.length - 1;

  elements.readerBody.innerHTML = "";
  if (job.isProse) {
    elements.readerFormatBar.classList.add("hidden");
    elements.readerBody.className = "reader-body reader-body--prose";
    elements.readerBody.textContent = item.text;
  } else {
    elements.readerFormatBar.classList.remove("hidden");
    elements.readerFormatSelect.value = state.reader.format;
    elements.readerFormatCustom.classList.toggle("hidden", state.reader.format !== "custom");
    elements.readerFormatCustom.value = state.reader.customPattern;

    elements.readerBody.className = "reader-body";
    const verse = document.createElement("div");
    verse.dataset.sjCopy = "all";
    applyVerseFormat(
      verse,
      state.reader.format === "auto" ? defaultFormatForSlug(job.slug) : state.reader.format,
      state.reader.customPattern,
    );
    verse.textContent = item.text;
    elements.readerBody.appendChild(verse);
    window.ShakeebJustify?.apply();
  }
}

// shakeeb-justify exposes most layouts as a class name on the "sj" element
// (sher/sher2/mukhammas/musaddas + variants); a plain 4- or N-line grouping
// is instead a data-sj-pattern on the base "sher" class -- see the
// PoetryJustification project's README for the full set.
function defaultFormatForSlug(slug) {
  if (slug === "rubaai" || slug === "qita") return "pattern-4";
  if (slug === "mukhammas") return "mukhammas";
  return "sher";
}

function applyVerseFormat(verse, format, customPattern) {
  if (format.startsWith("pattern-")) {
    verse.className = "sj sher";
    verse.dataset.sjPattern = format.slice("pattern-".length);
    return;
  }

  if (format === "custom") {
    verse.className = "sj sher";
    if (customPattern) {
      verse.dataset.sjPattern = customPattern;
    }
    return;
  }

  verse.className = `sj ${format}`;
}

function onReaderFormatChange() {
  state.reader.format = elements.readerFormatSelect.value;
  renderReaderItem();
}

function onReaderCustomPatternChange() {
  state.reader.customPattern = elements.readerFormatCustom.value.trim();
  renderReaderItem();
}

function onReaderCopy() {
  const job = currentJob();
  if (!job) return;
  const item = job.results[state.reader.index];
  navigator.clipboard?.writeText(item.text).then(
    () => setStatus("Copied to clipboard.", "success"),
    () => setStatus("Couldn't copy automatically — select the text manually.", "error"),
  );
}

function onReaderShare() {
  const job = currentJob();
  if (!job) return;
  const item = job.results[state.reader.index];

  if (navigator.share) {
    navigator.share({ text: item.text, title: item.title, url: item.href || undefined }).catch(() => {});
    return;
  }

  onReaderCopy();
}

function onReaderDownload() {
  const job = currentJob();
  if (!job) return;
  downloadJob(job);
}

function downloadJob(job) {
  const safeLabel = `${state.poetLabel || "rekhta"}-${job.slug}`
    .toLowerCase()
    .replace(/[^\w-]+/g, "-");

  let blob;
  let filename;
  if (job.isProse) {
    const payload = job.results.map((item) => ({
      description: "",
      label: `${job.label},مصنف:${item.author}`,
      link: item.href,
      text: item.text,
      title: item.author ? `${item.title} — ${item.author}` : item.title,
      url: item.href,
    }));
    blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    filename = `${safeLabel}.json`;
  } else {
    const payload = job.results.map((item) => item.text).join("\n\n");
    blob = new Blob([payload], { type: "text/plain;charset=utf-8" });
    filename = `${safeLabel}.txt`;
  }

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
