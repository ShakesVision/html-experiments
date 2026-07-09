import {
  BOOK_SELECTOR_DEFS,
  DEFAULT_PROXY_PREFIX,
  bookSelectors,
  createBookClient,
  createLimiter,
  getDeviceProfile,
} from "./src/index.js";
import { renderSelectorForm } from "./src/shared.js";

const { jsPDF } = window.jspdf;

const SAMPLE_BOOK_URL =
  "https://www.rekhta.org/ebooks/deewan-ghalib-mirza-ghalib-ebooks";
const DEFAULT_PROXY_TEMPLATE = `${DEFAULT_PROXY_PREFIX}`;
const PROXY_STORAGE_KEY = "rekhta_proxy_prefix";

const deviceProfile = getDeviceProfile();
let bookClient = createBookClient({
  proxyPrefix: DEFAULT_PROXY_TEMPLATE,
});

const elements = {
  bookForm: document.getElementById("book-form"),
  cacheBadge: document.getElementById("cache-badge"),
  cancelButton: document.getElementById("cancel-button"),
  downloadButton: document.getElementById("download-button"),
  metaAuthor: document.getElementById("meta-author"),
  metaPages: document.getElementById("meta-pages"),
  metaTitle: document.getElementById("meta-title"),
  previewGrid: document.getElementById("preview-grid"),
  progressBar: document.getElementById("task-progress"),
  progressLabel: document.getElementById("progress-label"),
  queueAddButton: document.getElementById("queue-add-button"),
  queueAddForm: document.getElementById("queue-add-form"),
  queueUrlsInput: document.getElementById("queue-urls"),
  queueList: document.getElementById("queue-list"),
  searchButton: document.getElementById("search-button"),
  searchClose: document.getElementById("search-close"),
  searchKeyword: document.getElementById("search-keyword"),
  searchLang: document.getElementById("search-lang"),
  searchModal: document.getElementById("search-modal"),
  searchNext: document.getElementById("search-next"),
  searchPage: document.getElementById("search-page"),
  searchPrev: document.getElementById("search-prev"),
  searchResults: document.getElementById("search-results"),
  searchSelectionBar: document.getElementById("search-selection-bar"),
  searchSelectionCount: document.getElementById("search-selection-count"),
  searchSelectionCopy: document.getElementById("search-selection-copy"),
  searchSelectionQueue: document.getElementById("search-selection-queue"),
  searchSelectionClear: document.getElementById("search-selection-clear"),
  searchStatus: document.getElementById("search-status"),
  searchSubmit: document.getElementById("search-submit"),
  settingsButton: document.getElementById("settings-button"),
  settingsModal: document.getElementById("settings-modal"),
  settingsClose: document.getElementById("settings-close"),
  settingsFields: document.getElementById("settings-fields"),
  settingsReset: document.getElementById("settings-reset"),
  settingsDone: document.getElementById("settings-done"),
  readerClose: document.getElementById("reader-close"),
  readerImage1: document.getElementById("reader-image-1"),
  readerImage2: document.getElementById("reader-image-2"),
  readerStage: document.querySelector(".reader-stage"),
  readerPagesContainer: document.getElementById("reader-pages-container"),
  readerModal: document.getElementById("reader-modal"),
  readerNext: document.getElementById("reader-next"),
  readerPageInput: document.getElementById("reader-page-input"),
  readerPageTotal: document.getElementById("reader-page-total"),
  readerPrev: document.getElementById("reader-prev"),
  onePageViewButton: document.getElementById("one-page-view"),
  twoPageViewButton: document.getElementById("two-page-view"),
  readerLangIndicator: document.getElementById("reader-lang-indicator"),
  statusText: document.getElementById("status-text"),
  proxyInput: document.getElementById("proxy-prefix"),
  urlInput: document.getElementById("book-url"),
};

const state = {
  abortController: null,
  isUrduBook: false,
  manifest: null,
  modalPageIndex: 0,
  pageNodes: [],
  readerRequestToken: 0,
  previewObserver: null,
  previewRequests: new Map(),
  isTwoPageMode: false,
  // "auto" = follow viewport width (default); "one"/"two" = an explicit
  // choice (from a view button or the URL) that survives window resizes and
  // is reflected in the address bar as &view=1|2 for shareability.
  viewMode: "auto",
  currentPages: [] /* Stores the page(s) currently displayed in reader */,
  previewUrls: new Map(),
  downloadQueue: [],
  search: {
    abortController: null,
    debounceTimer: null,
    keyword: "",
    lang: "3",
    pageIndex: 1,
    results: [],
    selectedHref: null,
    checkedHrefs: new Map(),
  },
};

const previewLimiter = createLimiter(deviceProfile.previewConcurrency);
// Shared across the currently-open book's Download button AND every queued
// download below, so total concurrent canvas/unscramble work never exceeds
// what the device can safely handle, no matter how many books are "in
// flight" at once (mobile-safe: deviceProfile scales this down on low-memory
// devices).
const sharedDownloadLimiter = createLimiter(deviceProfile.downloadConcurrency);

elements.urlInput.value = SAMPLE_BOOK_URL;
elements.proxyInput.value =
  localStorage.getItem(PROXY_STORAGE_KEY) || DEFAULT_PROXY_TEMPLATE;
elements.bookForm.addEventListener("submit", onLoadBook);
elements.downloadButton.addEventListener("click", onDownloadPdf);
elements.queueAddButton.addEventListener("click", onQueueAddCurrentBook);
elements.queueAddForm.addEventListener("submit", onQueueAddSubmit);
elements.cancelButton.addEventListener("click", onCancelWork);
elements.searchButton.addEventListener("click", openSearch);
elements.searchClose.addEventListener("click", (event) => {
  event.stopPropagation();
  closeSearch();
});
elements.searchModal.addEventListener("click", onSearchBackdropClick);
elements.searchSubmit.addEventListener("click", () =>
  runSearch({ force: true }),
);
elements.searchKeyword.addEventListener("input", onSearchKeywordInput);
elements.searchKeyword.addEventListener("keydown", onSearchKeywordKeydown);
elements.searchLang.addEventListener("change", onSearchLangChange);
elements.searchPrev.addEventListener("click", () => changeSearchPage(-1));
elements.searchNext.addEventListener("click", () => changeSearchPage(1));
elements.searchSelectionCopy.addEventListener("click", onCopySelection);
elements.searchSelectionQueue.addEventListener("click", onQueueSelection);
elements.searchSelectionClear.addEventListener("click", onClearSelection);
elements.settingsButton.addEventListener("click", openSettings);
elements.settingsClose.addEventListener("click", closeSettings);
elements.settingsDone.addEventListener("click", closeSettings);
elements.settingsReset.addEventListener("click", onResetSelectors);
elements.settingsModal.addEventListener("click", (event) => {
  if (event.target === elements.settingsModal) {
    closeSettings();
  }
});
elements.readerClose.addEventListener("click", closeReader);
// Wire navigation buttons to visual-direction helpers so RTL/LTR behave the same visually
elements.readerPrev.addEventListener("click", () => stepVisualLeft());
elements.readerNext.addEventListener("click", () => stepVisualRight());
elements.readerPageInput.addEventListener("change", onReaderPageInput);
elements.readerModal.addEventListener("click", onReaderBackdropClick);
document.addEventListener("keydown", onDocumentKeydown);

elements.onePageViewButton.addEventListener("click", () =>
  setTwoPageMode(false),
);
elements.twoPageViewButton.addEventListener("click", () =>
  setTwoPageMode(true),
);

setStatus("Paste a Rekhta URL or use the sample book to load the manifest.");
setProgress(0, "Idle");
renderDeviceHint();
renderSearchState();
renderReaderViewMode();
renderQueue();
window.addEventListener("popstate", onLocationPopState);
bootstrapFromLocation();

// ---- URL routing: keep the address bar in sync with the open book ----
// Books normalize down to https://www.rekhta.org/ebooks/{slug}[?lang=xx]
// by the time they're actually loaded (see the /detail/ strip below and
// resolveReaderUrl()), so links use the short `?book={slug}&lang=xx` form.
// Anything that doesn't fit that shape (proxy quirks, a future URL layout)
// is still supported by storing the full absolute URL in `book` instead.
const REKHTA_EBOOK_PATTERN = /^https?:\/\/(?:www\.)?rekhta\.org\/ebooks\/([^/?#]+)/i;

function bookUrlToParams(bookUrl) {
  const match = bookUrl.match(REKHTA_EBOOK_PATTERN);
  if (!match) {
    return { book: bookUrl, lang: "" };
  }

  const lang = new URL(bookUrl).searchParams.get("lang") || "";
  return { book: match[1], lang };
}

function paramsToBookUrl(book, lang) {
  if (!book) {
    return "";
  }

  if (book.includes("://")) {
    return book;
  }

  return `https://www.rekhta.org/ebooks/${book}${lang ? `?lang=${lang}` : ""}`;
}

function syncBookUrlToLocation(bookUrl, historyMode) {
  if (historyMode === "none") {
    return;
  }

  const { book, lang } = bookUrlToParams(bookUrl);
  const params = new URLSearchParams(location.search);
  params.set("book", book);
  if (lang) {
    params.set("lang", lang);
  } else {
    params.delete("lang");
  }
  // The open page / view are owned by the reader (syncPageToLocation); clear
  // any stale values left over from a previously-open book.
  params.delete("page");
  params.delete("view");

  const nextUrl = `${location.pathname}?${params.toString()}${location.hash}`;
  if (historyMode === "replace") {
    history.replaceState(null, "", nextUrl);
  } else {
    history.pushState(null, "", nextUrl);
  }
}

// Reflect the currently-open reader page in the address bar (1-based) so a
// link points at an exact book page. replaceState (not push) keeps Back
// exiting the book instead of walking page-by-page, and avoids flooding
// history as the reader flips.
function syncPageToLocation(pageIndex) {
  if (isReaderClosed()) {
    return;
  }
  const params = new URLSearchParams(location.search);
  if (!params.get("book")) {
    return; // only track pages for a routed book
  }
  params.set("page", `${pageIndex + 1}`);
  if (state.viewMode === "one") {
    params.set("view", "1");
  } else if (state.viewMode === "two") {
    params.set("view", "2");
  } else {
    params.delete("view");
  }
  history.replaceState(
    null,
    "",
    `${location.pathname}?${params.toString()}${location.hash}`,
  );
}

function clearPageFromLocation() {
  const params = new URLSearchParams(location.search);
  if (!params.has("page") && !params.has("view")) {
    return;
  }
  params.delete("page");
  params.delete("view");
  history.replaceState(
    null,
    "",
    `${location.pathname}?${params.toString()}${location.hash}`,
  );
}

function pageParamToIndex(rawValue) {
  const page = parseInt(rawValue, 10);
  return Number.isFinite(page) && page > 0 ? page - 1 : 0;
}

function viewParamToMode(rawValue) {
  if (rawValue === "1") return "one";
  if (rawValue === "2") return "two";
  return null;
}

function bootstrapFromLocation() {
  const params = new URLSearchParams(location.search);
  const book = params.get("book");
  if (!book) {
    return;
  }

  const bookUrl = paramsToBookUrl(book, params.get("lang") || "");
  elements.urlInput.value = bookUrl;
  loadBook(bookUrl, {
    openInReader: true,
    historyMode: "replace",
    openAtPage: pageParamToIndex(params.get("page")),
    openView: viewParamToMode(params.get("view")),
  });
}

function onLocationPopState() {
  const params = new URLSearchParams(location.search);
  const book = params.get("book");

  if (!book) {
    cancelActiveWork();
    resetPreviewState();
    setStatus("Paste a Rekhta URL or use the sample book to load the manifest.");
    setProgress(0, "Idle");
    return;
  }

  const bookUrl = paramsToBookUrl(book, params.get("lang") || "");
  elements.urlInput.value = bookUrl;
  loadBook(bookUrl, {
    openInReader: true,
    historyMode: "none",
    openAtPage: pageParamToIndex(params.get("page")),
    openView: viewParamToMode(params.get("view")),
  });
}

async function onLoadBook(event) {
  event.preventDefault();
  const bookUrl = elements.urlInput.value.trim();

  if (!bookUrl) {
    setStatus("Enter a book URL before loading.", "error");
    return;
  }

  await loadBook(bookUrl, { openInReader: false, historyMode: "push" });
}

async function loadBook(rawBookUrl, { openInReader = false, historyMode = "push", openAtPage = 0, openView = null } = {}) {
  // Internal removal of /detail/ from the URL
  const bookUrl = rawBookUrl.replace(/\/detail\//i, "/");
  const proxyPrefix = elements.proxyInput.value.trim();

  localStorage.setItem(PROXY_STORAGE_KEY, proxyPrefix);
  bookClient = createBookClient({ proxyPrefix });
  cancelActiveWork();
  resetPreviewState();

  const abortController = new AbortController();
  state.abortController = abortController;

  setBusy(true, "Loading manifest...");
  setProgress(5, "Loading manifest");

  try {
    const manifest = await bookClient.getManifest(bookUrl, {
      signal: abortController.signal,
    });

    state.manifest = manifest;
    state.isUrduBook = /\?lang=ur\b/i.test(bookUrl);
    console.log("Book URL:", bookUrl, "| isUrduBook:", state.isUrduBook);
    renderManifest(manifest);
    setBusy(false);
    setProgress(100, "Manifest cached");
    setStatus(
      `Loaded ${manifest.bookName}. Rekhta is fetched through the configured proxy.`,
      "success",
    );
    elements.urlInput.value = bookUrl;
    syncBookUrlToLocation(bookUrl, historyMode);

    if (openInReader) {
      if (openView === "one" || openView === "two") {
        state.viewMode = openView;
        state.isTwoPageMode = openView === "two";
      }
      const lastIndex = Math.max(manifest.pageCount - 1, 0);
      openReader(Math.min(Math.max(openAtPage, 0), lastIndex));
    }
  } catch (error) {
    handleError(
      error,
      "Unable to load the book manifest. Check the proxy prefix.",
    );
  }
}

function generatePdfFilename({ title, author, pageCount }) {
  // Clean up strings: remove special characters, convert to filename-safe format
  const cleanTitle = (title || "book")
    .trim()
    .replace(/[^\w\s-]/g, "") // Remove special chars
    .replace(/\s+/g, "-") // Replace spaces with hyphens
    .toLowerCase()
    .slice(0, 50); // Limit to 50 chars

  const cleanAuthor = (author || "unknown")
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .toLowerCase()
    .slice(0, 30); // Limit to 30 chars

  // Format: title-author-pagecount
  return `${cleanTitle}_${cleanAuthor}_${pageCount ?? 0}p.pdf`;
}

// Shared by the "PDF" button (current book) and every queued download below.
async function downloadBookToPdf(client, manifest, { limiter, onProgress, signal } = {}) {
  const renderJobs = manifest.scrambleMap.map((pageRef) =>
    limiter(() => client.renderPageToCanvas(pageRef, { signal })),
  );

  let pdfDocument = null;

  for (let index = 0; index < renderJobs.length; index += 1) {
    const canvas = await renderJobs[index];
    const orientation = canvas.width > canvas.height ? "landscape" : "portrait";
    const pageFormat = [canvas.width, canvas.height];

    if (!pdfDocument) {
      pdfDocument = new jsPDF({
        compress: true,
        format: pageFormat,
        orientation,
        unit: "pt",
      });
    } else {
      pdfDocument.addPage(pageFormat, orientation);
    }

    pdfDocument.addImage(
      canvas,
      "JPEG",
      0,
      0,
      canvas.width,
      canvas.height,
      undefined,
      "FAST",
    );
    canvas.width = 1;
    canvas.height = 1;

    onProgress?.(index + 1, renderJobs.length);
  }

  return pdfDocument;
}

async function onDownloadPdf() {
  if (!state.manifest) {
    setStatus("Load a book first, then download the PDF.", "error");
    return;
  }

  cancelActiveWork();
  const abortController = new AbortController();
  state.abortController = abortController;

  setBusy(true, "Preparing PDF...");
  setProgress(1, "Preparing PDF");

  try {
    const pdfDocument = await downloadBookToPdf(bookClient, state.manifest, {
      limiter: sharedDownloadLimiter,
      signal: abortController.signal,
      onProgress: (done, total) => {
        setProgress(Math.round((done / total) * 100), `Building PDF ${done}/${total}`);
      },
    });

    const filename = generatePdfFilename({
      title: state.manifest.bookName,
      author: state.manifest.author,
      pageCount: state.manifest.pageCount,
    });
    pdfDocument.save(filename);
    setBusy(false);
    setStatus("PDF export finished.", "success");
  } catch (error) {
    handleError(error, "PDF export stopped before completion.");
  }
}

// ---- Download queue: several books at once, no page previews ----

function onQueueAddCurrentBook() {
  if (!state.manifest) {
    return;
  }

  enqueueDownload(state.manifest.bookUrl, state.manifest.bookName);
}

function onQueueAddSubmit(event) {
  event.preventDefault();
  const urls = elements.queueUrlsInput.value
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /^https?:\/\//i.test(line));

  if (!urls.length) {
    setStatus("Paste at least one valid book URL to queue.", "error");
    return;
  }

  urls.forEach((url) => enqueueDownload(url));
  elements.queueUrlsInput.value = "";
}

function enqueueDownload(url, titleHint) {
  const item = {
    id: `q${state.downloadQueue.length}-${Math.random().toString(36).slice(2, 8)}`,
    url,
    title: titleHint || url,
    status: "queued",
    progress: 0,
    message: "Queued",
    abortController: null,
  };

  state.downloadQueue.push(item);
  renderQueue();
  processQueueItem(item);
  return item;
}

async function processQueueItem(item) {
  item.abortController = new AbortController();
  const { signal } = item.abortController;
  const proxyPrefix = elements.proxyInput.value.trim();
  // A queue item gets its own bookClient instance so it never fights the
  // main viewer's `bookClient` (which can be reassigned by loadBook() while
  // a queued download is still in flight).
  const client = createBookClient({ proxyPrefix });

  item.status = "fetching";
  item.message = "Loading manifest...";
  renderQueue();

  try {
    const manifest = await client.getManifest(item.url, { signal });
    item.title = manifest.bookName;
    item.status = "downloading";
    renderQueue();

    const pdfDocument = await downloadBookToPdf(client, manifest, {
      limiter: sharedDownloadLimiter,
      signal,
      onProgress: (done, total) => {
        item.progress = Math.round((done / total) * 100);
        item.message = `Rendering ${done}/${total}`;
        renderQueue();
      },
    });

    pdfDocument.save(
      generatePdfFilename({
        title: manifest.bookName,
        author: manifest.author,
        pageCount: manifest.pageCount,
      }),
    );

    item.status = "done";
    item.progress = 100;
    item.message = "Downloaded";
  } catch (error) {
    if (error.name === "AbortError") {
      item.status = "cancelled";
      item.message = "Cancelled";
    } else {
      console.error(error);
      item.status = "error";
      item.message = error.message || "Failed to download.";
    }
  } finally {
    renderQueue();
  }
}

function renderQueue() {
  elements.queueList.innerHTML = "";

  if (!state.downloadQueue.length) {
    const empty = document.createElement("li");
    empty.className = "queue-empty";
    empty.textContent = "No books queued yet.";
    elements.queueList.appendChild(empty);
    return;
  }

  state.downloadQueue.forEach((item) => {
    const isActive =
      item.status === "queued" ||
      item.status === "fetching" ||
      item.status === "downloading";

    const row = document.createElement("li");
    row.className = `queue-row queue-row--${item.status}`;

    const info = document.createElement("div");
    info.className = "queue-row-info";
    const title = document.createElement("strong");
    title.dir = "auto";
    title.textContent = item.title;
    const message = document.createElement("span");
    message.className = "queue-row-message";
    message.textContent = item.message;
    info.append(title, message);

    const progress = document.createElement("progress");
    progress.max = 100;
    progress.value = item.progress;

    const actionButton = document.createElement("button");
    actionButton.type = "button";
    actionButton.className = "queue-row-action";
    actionButton.setAttribute("aria-label", isActive ? "Cancel" : "Remove");
    actionButton.innerHTML = isActive
      ? '<i class="fa-solid fa-xmark"></i>'
      : '<i class="fa-solid fa-trash"></i>';
    actionButton.addEventListener("click", () => {
      if (isActive) {
        item.abortController?.abort();
        return;
      }

      state.downloadQueue = state.downloadQueue.filter(
        (entry) => entry.id !== item.id,
      );
      renderQueue();
    });

    row.append(info, progress, actionButton);
    elements.queueList.appendChild(row);
  });
}

function onCancelWork() {
  if (!state.abortController) {
    return;
  }

  cancelActiveWork();
  setBusy(false);
  setStatus("Cancelled the active job.", "muted");
  setProgress(0, "Cancelled");
}

function renderManifest(manifest) {
  elements.metaTitle.textContent = manifest.bookName;
  elements.metaAuthor.textContent = manifest.author;
  elements.metaPages.textContent = `${manifest.pageCount} pages`;

  if (state.isUrduBook) {
    elements.cacheBadge.textContent =
      "✓ Urdu (RTL) - Right-to-left navigation enabled";
    elements.cacheBadge.style.backgroundColor = "rgba(45, 106, 79, 0.15)";
    elements.cacheBadge.style.color = "var(--success)";
  } else {
    elements.cacheBadge.textContent = "Manifest cached";
    elements.cacheBadge.style.backgroundColor = "";
    elements.cacheBadge.style.color = "";
  }

  elements.downloadButton.disabled = false;
  elements.queueAddButton.disabled = false;
  elements.readerPageTotal.textContent = `/ ${manifest.pageCount}`;
  elements.readerPageInput.max = `${manifest.pageCount}`;

  elements.previewGrid.innerHTML = "";
  state.pageNodes = manifest.scrambleMap.map((pageRef, index) => {
    const card = document.createElement("article");
    card.className = "page-card";
    card.dataset.pageIndex = `${index}`;
    card.addEventListener("click", () => openReader(index));

    const number = document.createElement("div");
    number.className = "page-number";
    number.textContent = `Page ${index + 1}`;

    const body = document.createElement("div");
    body.className = "page-body";

    const status = document.createElement("p");
    status.className = "page-status";
    status.textContent = "Waiting to enter view";

    body.appendChild(status);
    card.append(number, body);
    elements.previewGrid.appendChild(card);
    return { body, card, status };
  });

  observePreviewCards();
}

function observePreviewCards() {
  state.previewObserver?.disconnect();
  state.previewObserver = new IntersectionObserver(onPreviewIntersection, {
    rootMargin: "300px 0px",
    threshold: 0.05,
  });

  state.pageNodes.forEach(({ card }) => {
    state.previewObserver.observe(card);
  });
}

function onPreviewIntersection(entries) {
  entries.forEach((entry) => {
    if (!entry.isIntersecting) {
      return;
    }

    const pageIndex = Number(entry.target.dataset.pageIndex);
    schedulePreview(pageIndex);
    state.previewObserver.unobserve(entry.target);
  });
}

function schedulePreview(pageIndex) {
  if (!state.manifest) {
    return Promise.resolve();
  }

  if (state.previewRequests.has(pageIndex)) {
    return state.previewRequests.get(pageIndex);
  }

  const request = previewLimiter(async () => {
    const node = state.pageNodes[pageIndex];
    node.status.textContent = "Decoding preview...";

    const { blob, canvas } = await bookClient.renderPageToBlob(
      state.manifest.scrambleMap[pageIndex],
      {
        quality: 0.78,
        signal: state.abortController?.signal,
        type: "image/jpeg",
      },
    );

    const objectUrl = URL.createObjectURL(blob);
    state.previewUrls.set(pageIndex, objectUrl);

    const image = document.createElement("img");
    image.className = "page-image";
    image.alt = `${state.manifest.bookName} page ${pageIndex + 1}`;
    image.loading = "lazy";
    image.src = objectUrl;

    node.body.innerHTML = "";
    node.body.appendChild(image);
    canvas.width = 1;
    canvas.height = 1;
  })
    .catch((error) => {
      if (error.name === "AbortError") {
        return;
      }

      const node = state.pageNodes[pageIndex];
      node.status.textContent =
        "Preview failed. Scroll away and back to retry.";
      state.previewObserver?.observe(node.card);
    })
    .finally(() => {
      state.previewRequests.delete(pageIndex);
    });

  state.previewRequests.set(pageIndex, request);
  return request;
}

function resetPreviewState() {
  closeReader();
  state.previewObserver?.disconnect();
  state.previewObserver = null;
  state.pageNodes = [];
  state.previewRequests.clear();
  state.isUrduBook = false;
  state.modalPageIndex = 0;
  state.viewMode = "auto";
  state.currentPages = [];

  state.previewUrls.forEach((objectUrl) => {
    URL.revokeObjectURL(objectUrl);
  });

  state.previewUrls.clear();
  elements.previewGrid.innerHTML = "";
  elements.downloadButton.disabled = true;
  elements.queueAddButton.disabled = true;
  elements.cacheBadge.textContent = "No manifest cached yet";
  elements.metaTitle.textContent = "No book loaded";
  elements.metaAuthor.textContent = "Waiting for manifest";
  elements.metaPages.textContent = "0 pages";
  elements.readerPageInput.value = "";
  elements.readerPageTotal.textContent = "/ 0";

  window.removeEventListener("resize", onWindowResize);
  if (elements.readerStage) {
    elements.readerStage.removeEventListener("touchstart", onTouchStart);
    elements.readerStage.removeEventListener("touchmove", onTouchMove);
    elements.readerStage.removeEventListener("touchend", onTouchEnd);
  }
}

function cancelActiveWork() {
  state.abortController?.abort();
  state.abortController = null;
}

function setBusy(isBusy, label = "") {
  elements.cancelButton.disabled = !isBusy;
  elements.bookForm.querySelector("button[type='submit']").disabled = isBusy;
  elements.downloadButton.disabled = isBusy || !state.manifest;
  if (label) {
    elements.progressLabel.textContent = label;
  }
}

function setStatus(message, tone = "muted") {
  elements.statusText.textContent = message;
  elements.statusText.dataset.tone = tone;
}

function setProgress(value, label) {
  elements.progressBar.value = value;
  elements.progressLabel.textContent = label;
}

function renderDeviceHint() {
  elements.cacheBadge.textContent = `${deviceProfile.previewConcurrency} preview workers, ${deviceProfile.downloadConcurrency} PDF workers`;
}

function handleError(error, fallbackMessage) {
  if (error.name === "AbortError") {
    return;
  }

  console.error(error);
  state.abortController = null;
  setBusy(false);
  setStatus(`${fallbackMessage} ${error.message}`, "error");
  setProgress(0, "Stopped");
}

function setTwoPageMode(enable) {
  // An explicit choice: remember it as a sticky preference so a later resize
  // won't silently override it, and so it round-trips into the shared URL.
  state.viewMode = enable ? "two" : "one";
  state.isTwoPageMode = enable;
  renderReaderViewMode();
  renderReaderPages(state.modalPageIndex);
}

function renderReaderViewMode() {
  if (state.isTwoPageMode) {
    elements.onePageViewButton.classList.remove("active");
    elements.twoPageViewButton.classList.add("active");
  } else {
    elements.onePageViewButton.classList.add("active");
    elements.twoPageViewButton.classList.remove("active");
  }
}

function getDirectionalDelta(direction) {
  let delta = 0;
  if (state.isTwoPageMode) {
    delta = 2; // Two pages at a time
  } else {
    delta = 1; // One page at a time
  }

  if (state.isUrduBook) {
    return direction === "prev" ? delta : -delta;
  }

  return direction === "prev" ? -delta : delta;
}

function onDocumentKeydown(event) {
  if (!isSettingsClosed()) {
    if (event.key === "Escape") {
      closeSettings();
    }

    return;
  }

  if (!isSearchClosed()) {
    if (event.key === "Escape") {
      closeSearch();
    }

    return;
  }

  if (isReaderClosed()) {
    return;
  }

  if (event.key === "Escape") {
    closeReader();
    return;
  }

  if (event.key === "ArrowLeft") {
    // ArrowLeft should move the visual viewport to the left
    stepVisualLeft();
  }

  if (event.key === "ArrowRight") {
    // ArrowRight should move the visual viewport to the right
    stepVisualRight();
  }
}

function isReaderClosed() {
  return elements.readerModal.classList.contains("hidden");
}

function isSearchClosed() {
  return elements.searchModal.classList.contains("hidden");
}

function openReader(pageIndex) {
  if (!state.manifest) {
    return;
  }

  state.modalPageIndex = pageIndex;
  elements.readerModal.classList.remove("hidden");
  document.body.style.overflow = "hidden";

  // Show RTL indicator if Urdu book
  if (state.isUrduBook) {
    elements.readerLangIndicator.classList.remove("hidden");
  } else {
    elements.readerLangIndicator.classList.add("hidden");
  }

  onWindowResize(); /* Call on resize to set two-page mode initially */
  window.addEventListener("resize", onWindowResize);
  renderReaderViewMode(); // reflect the (possibly URL-driven) mode on the buttons

  if (elements.readerStage) {
    elements.readerStage.addEventListener("touchstart", onTouchStart);
    elements.readerStage.addEventListener("touchmove", onTouchMove);
    elements.readerStage.addEventListener("touchend", onTouchEnd);
  }

  renderReaderPages(pageIndex);
}

function closeReader() {
  elements.readerModal.classList.add("hidden");
  clearPageFromLocation();
  elements.readerImage1.src = "";
  elements.readerImage2.src = "";
  elements.readerImage1.classList.add("hidden");
  elements.readerImage2.classList.add("hidden");
  document.body.style.overflow = "";
  state.currentPages = [];
  // state.isTwoPageMode = false; // Keep the last set mode
  window.removeEventListener("resize", onWindowResize);
  if (elements.readerStage) {
    elements.readerStage.removeEventListener("touchstart", onTouchStart);
    elements.readerStage.removeEventListener("touchmove", onTouchMove);
    elements.readerStage.removeEventListener("touchend", onTouchEnd);
  }
  renderReaderViewMode();
}

function openSearch() {
  elements.searchModal.classList.remove("hidden");
  document.body.style.overflow = "hidden";
  elements.searchKeyword.focus();
  renderSearchState();
}

function closeSearch() {
  elements.searchModal.classList.add("hidden");
  clearTimeout(state.search.debounceTimer);
  state.search.debounceTimer = null;
  cancelSearch();
  state.search.selectedHref = null;
  document.body.style.overflow = "";
  renderSearchState();
}

function onSearchBackdropClick(event) {
  if (event.target === elements.searchModal) {
    closeSearch();
  }
}

// ---- Selector settings (user-editable Rekhta markup targets) ----

function openSettings() {
  renderSelectorForm(elements.settingsFields, BOOK_SELECTOR_DEFS, bookSelectors);
  elements.settingsModal.classList.remove("hidden");
  document.body.style.overflow = "hidden";
}

function closeSettings() {
  elements.settingsModal.classList.add("hidden");
  document.body.style.overflow = "";
}

function isSettingsClosed() {
  return elements.settingsModal.classList.contains("hidden");
}

function onResetSelectors() {
  bookSelectors.reset();
  renderSelectorForm(elements.settingsFields, BOOK_SELECTOR_DEFS, bookSelectors);
  setStatus("Selectors reset to defaults. Reload the book to apply.", "muted");
}

function onSearchKeywordInput(event) {
  state.search.keyword = event.target.value;
  state.search.pageIndex = 1;
  scheduleSearch();
  renderSearchState();
}

function onSearchKeywordKeydown(event) {
  if (event.key === "Enter") {
    event.preventDefault();
    runSearch({ force: true });
  }
}

function onSearchLangChange(event) {
  state.search.lang = event.target.value;
  state.search.pageIndex = 1;
  runSearch({ force: true });
}

function scheduleSearch() {
  clearTimeout(state.search.debounceTimer);
  state.search.debounceTimer = setTimeout(() => {
    runSearch({ force: false });
  }, 350);
}

function changeSearchPage(delta) {
  const next = Math.max(1, (state.search.pageIndex || 1) + delta);
  if (next === state.search.pageIndex) {
    return;
  }

  state.search.pageIndex = next;
  runSearch({ force: true });
}

async function runSearch(options) {
  const keyword = (state.search.keyword || "").trim();
  if (!keyword) {
    state.search.results = [];
    setSearchStatus("Type a keyword to search.", "muted");
    renderSearchState();
    return;
  }

  const proxyPrefix = elements.proxyInput.value.trim();
  cancelSearch();

  const abortController = new AbortController();
  state.search.abortController = abortController;

  const pageIndex = state.search.pageIndex || 1;
  const lang = state.search.lang || "3";

  setSearchStatus("Searching...", "muted");
  renderSearchState();

  try {
    const searchUrl = buildCollectionSearchUrl({
      keyword,
      lang,
      pageIndex,
    });

    const response = await fetch(applyProxyPrefix(searchUrl, proxyPrefix), {
      method: "GET",
      mode: "cors",
      signal: abortController.signal,
    });

    if (!response.ok) {
      throw new Error(`Search failed with status ${response.status}`);
    }

    const html = await response.text();
    const results = parseSearchResults(html);
    state.search.results = results;

    if (!results.length) {
      setSearchStatus("No results found for that keyword.", "muted");
    } else {
      setSearchStatus(
        `Showing ${results.length} books. Click one to open it, or tick several to batch-download.`,
        "success",
      );
    }

    renderSearchState();
  } catch (error) {
    if (error.name === "AbortError") {
      return;
    }

    console.error(error);
    state.search.results = [];
    const extraHint = proxyPrefix
      ? ""
      : " (Tip: set a proxy prefix if Rekhta blocks CORS.)";
    setSearchStatus(`${error.message}${extraHint}`, "error");
    renderSearchState();
  } finally {
    state.search.abortController = null;

    if (options?.force) {
      elements.searchResults.scrollTop = 0;
    }
  }
}

function cancelSearch() {
  state.search.abortController?.abort();
  state.search.abortController = null;
}

function setSearchStatus(message, tone = "muted") {
  elements.searchStatus.textContent = message;
  elements.searchStatus.dataset.tone = tone;
}

function renderSearchState() {
  elements.searchKeyword.value = state.search.keyword || "";
  elements.searchLang.value = state.search.lang || "3";
  elements.searchPage.textContent = `Page ${state.search.pageIndex || 1}`;

  const hasResults = (state.search.results || []).length > 0;
  elements.searchPrev.disabled = (state.search.pageIndex || 1) <= 1;
  elements.searchNext.disabled = !hasResults;

  renderSearchResults();
}

function renderSearchResults() {
  const results = state.search.results || [];
  elements.searchResults.innerHTML = "";

  if (!results.length) {
    const empty = document.createElement("div");
    empty.className = "badge";
    empty.textContent =
      "Search results will appear here. You can keep this panel open while trying different books.";
    elements.searchResults.appendChild(empty);
    return;
  }

  results.forEach((result) => {
    if (!result.href) {
      return;
    }

    const card = document.createElement("div");
    card.className = "search-result-card";

    const selectLabel = document.createElement("label");
    selectLabel.className = "search-result-select";
    selectLabel.title = "Select for batch download";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = state.search.checkedHrefs.has(result.href);
    checkbox.setAttribute("aria-label", "Select for batch download");
    checkbox.addEventListener("click", (event) => event.stopPropagation());
    checkbox.addEventListener("change", () =>
      toggleResultSelection(result, checkbox.checked),
    );
    selectLabel.appendChild(checkbox);

    const button = document.createElement("button");
    button.type = "button";
    button.className = "search-result";
    button.dataset.href = result.href || "";
    button.setAttribute(
      "aria-selected",
      result.href && result.href === state.search.selectedHref
        ? "true"
        : "false",
    );

    const cover = document.createElement("div");
    cover.className = "search-cover";
    if (result.imageUrl) {
      cover.style.backgroundImage = `url("${result.imageUrl}")`;
    }

    const copy = document.createElement("div");
    copy.className = "search-copy";

    const title = document.createElement("p");
    title.className = "search-tagline";
    title.dir = "auto";
    title.textContent = result.title || "Untitled";

    const author = document.createElement("p");
    author.className = "search-author";
    author.dir = "auto";
    author.textContent = result.author || "";

    const hrefLine = document.createElement("p");
    hrefLine.className = "search-href";
    hrefLine.textContent = result.href || "";

    copy.appendChild(title);
    copy.appendChild(author);
    copy.appendChild(hrefLine);

    button.appendChild(cover);
    button.appendChild(copy);

    button.addEventListener("click", () => pickSearchResult(result, button));

    card.append(selectLabel, button);
    elements.searchResults.appendChild(card);
  });

  renderSelectionBar();
}

function toggleResultSelection(result, isChecked) {
  if (isChecked) {
    state.search.checkedHrefs.set(result.href, result);
  } else {
    state.search.checkedHrefs.delete(result.href);
  }

  renderSelectionBar();
}

function renderSelectionBar() {
  const count = state.search.checkedHrefs.size;
  elements.searchSelectionBar.classList.toggle("hidden", count === 0);
  elements.searchSelectionCount.textContent = `${count} selected`;
}

function onClearSelection() {
  state.search.checkedHrefs.clear();
  renderSearchResults();
}

async function onCopySelection() {
  const hrefs = Array.from(state.search.checkedHrefs.values(), (r) => r.href);
  if (!hrefs.length) {
    return;
  }

  try {
    await navigator.clipboard.writeText(hrefs.join("\n"));
    setSearchStatus(`Copied ${hrefs.length} link${hrefs.length === 1 ? "" : "s"}.`, "success");
  } catch {
    setSearchStatus(
      "Couldn't copy automatically. Select the links and copy manually.",
      "error",
    );
  }
}

async function onQueueSelection() {
  const selected = Array.from(state.search.checkedHrefs.values());
  if (!selected.length) {
    return;
  }

  const proxyPrefix = elements.proxyInput.value.trim();
  setSearchStatus(`Resolving ${selected.length} book URL${selected.length === 1 ? "" : "s"}...`, "muted");

  const resolutions = await Promise.allSettled(
    selected.map((result) => resolveReaderUrl(result.href, { proxyPrefix })),
  );

  let queued = 0;
  resolutions.forEach((outcome, index) => {
    if (outcome.status === "fulfilled") {
      enqueueDownload(outcome.value, selected[index].title);
      queued += 1;
    }
  });

  state.search.checkedHrefs.clear();
  closeSearch();
  setStatus(
    `Queued ${queued} book${queued === 1 ? "" : "s"} for download.`,
    queued ? "success" : "error",
  );
}

async function pickSearchResult(result, buttonNode) {
  if (!result?.href) {
    return;
  }

  state.search.selectedHref = result.href;
  renderSearchResults();

  const proxyPrefix = elements.proxyInput.value.trim();
  const abortController = new AbortController();
  const { signal } = abortController;

  buttonNode.disabled = true;
  setSearchStatus("Resolving reader URL...", "muted");

  try {
    const resolvedUrl = await resolveReaderUrl(result.href, {
      proxyPrefix,
      signal,
    });

    elements.urlInput.value = resolvedUrl;
    closeSearch();
    setStatus(`Opening: ${resolvedUrl}`, "success");
    await loadBook(resolvedUrl, { openInReader: true, historyMode: "push" });
  } catch (error) {
    if (error.name === "AbortError") {
      return;
    }

    console.error(error);
    setSearchStatus(
      `Unable to resolve the book URL. ${error.message}`,
      "error",
    );
  } finally {
    buttonNode.disabled = false;
  }
}

function buildCollectionSearchUrl({ keyword, lang, pageIndex }) {
  const safeKeyword = encodeURIComponent(keyword);
  const safeLang = encodeURIComponent(lang);
  const safePage = encodeURIComponent(String(pageIndex));

  return `https://www.rekhta.org/CollectionSearchLoading?lang=${safeLang}&pageType=searchallebook&keyword=${safeKeyword}&pageIndex=${safePage}&_=${Date.now()}`;
}

function parseSearchResults(html) {
  const parser = new DOMParser();
  const documentNode = parser.parseFromString(html || "", "text/html");
  const cards = Array.from(
    documentNode.querySelectorAll(bookSelectors.get("searchCard")),
  );

  return cards
    .map((card) => {
      const anchor = card.querySelector("a[href]");
      const href = anchor?.getAttribute("href")?.trim() || "";
      const style = anchor?.getAttribute("style") || "";
      const imageUrl = parseBackgroundImageUrl(style);
      const title =
        card
          .querySelector(bookSelectors.get("searchTitle"))
          ?.textContent?.trim()
          .replace(/ +/g, " ") || "";
      const author =
        card
          .querySelector(bookSelectors.get("searchAuthor"))
          ?.textContent?.trim()
          .replace(/\s+/g, " ") || "";

      if (!href) {
        return null;
      }

      return {
        author,
        href: toRekhtaAbsoluteUrl(href),
        imageUrl,
        title,
      };
    })
    .filter(Boolean);
}

function parseBackgroundImageUrl(styleValue) {
  if (!styleValue) {
    return "";
  }

  const match = styleValue.match(/background\s*:\s*url\(([^)]+)\)/i);
  if (!match) {
    return "";
  }

  return match[1].replace(/['"]/g, "").trim();
}

function toRekhtaAbsoluteUrl(href) {
  if (!href) {
    return "";
  }

  if (/^https?:\/\//i.test(href)) {
    return href;
  }

  if (href.startsWith("/")) {
    return `https://www.rekhta.org${href}`;
  }

  return `https://www.rekhta.org/${href}`;
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

async function resolveReaderUrl(href, { proxyPrefix, signal }) {
  let absolute = toRekhtaAbsoluteUrl(href);
  // Remove /detail/ from the URL if present
  absolute = absolute.replace(/\/detail\//i, "/");

  if (/\/ebooks\//i.test(absolute)) {
    return absolute;
  }

  if (!/\/ebook-detail\//i.test(absolute)) {
    return absolute;
  }

  const response = await fetch(applyProxyPrefix(absolute, proxyPrefix), {
    method: "GET",
    mode: "cors",
    signal,
  });

  if (!response.ok) {
    throw new Error(`Detail page fetch failed with status ${response.status}`);
  }

  const html = await response.text();
  const parser = new DOMParser();
  const documentNode = parser.parseFromString(html || "", "text/html");
  const directReader = documentNode.querySelector(bookSelectors.get("readerLink"));

  const readerHref = directReader?.getAttribute("href")?.trim();
  if (!readerHref) {
    return absolute;
  }

  const resolved = toRekhtaAbsoluteUrl(readerHref);
  const detailLang = new URL(absolute).searchParams.get("lang");
  if (!detailLang) {
    return resolved;
  }

  const resolvedUrl = new URL(resolved);
  if (!resolvedUrl.searchParams.get("lang")) {
    resolvedUrl.searchParams.set("lang", detailLang);
  }

  return resolvedUrl.toString();
}

function onReaderBackdropClick(event) {
  if (event.target === elements.readerModal) {
    closeReader();
  }
}

function onReaderPageInput() {
  if (!state.manifest) {
    return;
  }

  const rawValue = Number(elements.readerPageInput.value);
  if (!Number.isInteger(rawValue)) {
    elements.readerPageInput.value = `${state.modalPageIndex + 1}`;
    return;
  }

  const nextIndex =
    Math.min(Math.max(rawValue, 1), state.manifest.pageCount) - 1;
  state.modalPageIndex = nextIndex;
  renderReaderPages(nextIndex);
}

function stepReader(direction) {
  if (!state.manifest) {
    return;
  }

  const delta = getDirectionalDelta(direction);
  const nextIndex = state.modalPageIndex + delta;

  if (nextIndex < 0 || nextIndex >= state.manifest.pageCount) {
    return;
  }

  state.modalPageIndex = nextIndex;
  renderReaderPages(nextIndex);
}

// Visual navigation: move viewport left or right regardless of logical RTL/LTR
// These apply the correct delta directly, accounting for RTL/LTR and one/two-page mode
function stepVisualLeft() {
  if (!state.manifest) {
    return;
  }

  let delta = 0;
  if (state.isTwoPageMode) {
    delta = 2; // Two pages at a time
  } else {
    delta = 1; // One page at a time
  }

  // For visual left: in RTL we go forward, in LTR we go backward
  if (state.isUrduBook) {
    delta = delta; // Move forward (positive delta)
  } else {
    delta = -delta; // Move backward (negative delta)
  }

  const nextIndex = state.modalPageIndex + delta;
  console.log(
    "stepVisualLeft: isUrdu=",
    state.isUrduBook,
    "delta=",
    delta,
    "currentIndex=",
    state.modalPageIndex,
    "nextIndex=",
    nextIndex,
  );
  if (nextIndex < 0 || nextIndex >= state.manifest.pageCount) {
    return;
  }

  state.modalPageIndex = nextIndex;
  renderReaderPages(nextIndex);
}

function stepVisualRight() {
  if (!state.manifest) {
    return;
  }

  let delta = 0;
  if (state.isTwoPageMode) {
    delta = 2; // Two pages at a time
  } else {
    delta = 1; // One page at a time
  }

  // For visual right: in RTL we go backward, in LTR we go forward
  if (state.isUrduBook) {
    delta = -delta; // Move backward (negative delta)
  } else {
    delta = delta; // Move forward (positive delta)
  }

  const nextIndex = state.modalPageIndex + delta;
  console.log(
    "stepVisualRight: isUrdu=",
    state.isUrduBook,
    "delta=",
    delta,
    "currentIndex=",
    state.modalPageIndex,
    "nextIndex=",
    nextIndex,
  );
  if (nextIndex < 0 || nextIndex >= state.manifest.pageCount) {
    return;
  }

  state.modalPageIndex = nextIndex;
  renderReaderPages(nextIndex);
}

const MIN_TWO_PAGE_WIDTH = 1024; // Minimum width for two-page display

function onWindowResize() {
  // An explicit one/two-page choice wins over the viewport; only "auto"
  // follows the window width.
  if (state.viewMode !== "auto") {
    const want = state.viewMode === "two";
    if (want !== state.isTwoPageMode) {
      state.isTwoPageMode = want;
      renderReaderPages(state.modalPageIndex);
    }
    return;
  }

  const oldTwoPageMode = state.isTwoPageMode;
  state.isTwoPageMode = window.innerWidth >= MIN_TWO_PAGE_WIDTH;

  // Re-render pages if the two-page mode changed
  if (oldTwoPageMode !== state.isTwoPageMode) {
    renderReaderPages(state.modalPageIndex);
  }
}

let touchStartX = 0;
let touchEndX = 0;

function onTouchStart(event) {
  touchStartX = event.touches[0].clientX;
}

function onTouchMove(event) {
  touchEndX = event.touches[0].clientX;
}

function onTouchEnd() {
  if (!state.manifest) {
    return;
  }

  const swipeThreshold = 50; // pixels
  const deltaX = touchEndX - touchStartX;

  if (deltaX > swipeThreshold) {
    // Swiped right (previous page) -> move viewport visually left
    stepVisualLeft();
  } else if (deltaX < -swipeThreshold) {
    // Swiped left (next page) -> move viewport visually right
    stepVisualRight();
  }

  // Reset touch positions
  touchStartX = 0;
  touchEndX = 0;
}

async function renderReaderPages(pageIndex) {
  if (!state.manifest) {
    return;
  }

  // Single choke point for "the visible page changed" — keep the URL's
  // ?page= in step so the address bar always points at what's on screen.
  syncPageToLocation(pageIndex);

  const requestToken = ++state.readerRequestToken;
  const pagesToRender = [];
  let pageInputDisplayIndex = pageIndex + 1;

  if (state.isTwoPageMode) {
    let page1Index = pageIndex;
    let page2Index = pageIndex + 1;

    if (state.isUrduBook) {
      // For RTL (Urdu), show current page on right (even index) and next on left (odd index)
      if (pageIndex % 2 === 0) {
        page1Index = pageIndex + 1; // Left page
        page2Index = pageIndex; // Right page
        pageInputDisplayIndex = pageIndex + 1;
      } else {
        page1Index = pageIndex; // Left page
        page2Index = pageIndex - 1; // Right page
        pageInputDisplayIndex = pageIndex;
      }
    }

    // Ensure page indices are within bounds
    // Push pages in visual order: for LTR -> left then right; for RTL -> right then left
    const isRtl = state.isUrduBook;
    const leftIndex = page1Index;
    const rightIndex = page2Index;

    if (!isRtl) {
      if (leftIndex >= 0 && leftIndex < state.manifest.pageCount) {
        pagesToRender.push(leftIndex);
      }
      if (
        rightIndex >= 0 &&
        rightIndex < state.manifest.pageCount &&
        rightIndex !== leftIndex
      ) {
        pagesToRender.push(rightIndex);
      }
    } else {
      // RTL: visual first should be right, then left
      if (rightIndex >= 0 && rightIndex < state.manifest.pageCount) {
        pagesToRender.push(rightIndex);
      }
      if (
        leftIndex >= 0 &&
        leftIndex < state.manifest.pageCount &&
        leftIndex !== rightIndex
      ) {
        pagesToRender.push(leftIndex);
      }
    }
  } else {
    pagesToRender.push(pageIndex);
  }

  // Sort pages for predictable preloading/storage, but visual order will depend on direction
  state.currentPages = pagesToRender.slice().sort((a, b) => a - b);

  elements.readerPageInput.value = `${pageInputDisplayIndex}`;
  elements.readerPageTotal.textContent = `/ ${state.manifest.pageCount}`;

  // Calculate visual deltas for button disabled states (not logical deltas from getDirectionalDelta)
  let visualLeftDelta = 0;
  let visualRightDelta = 0;
  if (state.isTwoPageMode) {
    visualLeftDelta = state.isUrduBook ? 2 : -2;
    visualRightDelta = state.isUrduBook ? -2 : 2;
  } else {
    visualLeftDelta = state.isUrduBook ? 1 : -1;
    visualRightDelta = state.isUrduBook ? -1 : 1;
  }

  elements.readerPrev.disabled =
    pageIndex + visualLeftDelta < 0 ||
    pageIndex + visualLeftDelta >= state.manifest.pageCount;
  elements.readerNext.disabled =
    pageIndex + visualRightDelta < 0 ||
    pageIndex + visualRightDelta >= state.manifest.pageCount;

  // Reset image elements
  elements.readerImage1.src = "";
  elements.readerImage2.src = "";
  elements.readerImage1.classList.add("hidden");
  elements.readerImage2.classList.add("hidden");

  // Ensure reader pages container exists and set its direction for CSS ordering
  const pagesContainer =
    elements.readerPagesContainer ||
    document.getElementById("reader-pages-container");
  if (pagesContainer) {
    if (state.isUrduBook) {
      pagesContainer.setAttribute("dir", "rtl");
    } else {
      pagesContainer.setAttribute("dir", "ltr");
    }
  }

  for (let i = 0; i < pagesToRender.length; i++) {
    const pIndex = pagesToRender[i];
    // Determine visual slot for this page index in two-page or one-page mode
    let imageElement = elements.readerImage1;

    if (state.isTwoPageMode) {
      // For two-page mode decide which element maps to left/right visually.
      // When Urdu (RTL): first visual (left) should be the second in pagesToRender, so we map accordingly using pagesContainer dir.
      const isRtl = state.isUrduBook;
      if (isRtl) {
        // Visual order: right, left. We place the higher-order visual (right) into readerImage1 when pagesToRender was built with page1/page2 mapping.
        imageElement = i === 0 ? elements.readerImage1 : elements.readerImage2;
      } else {
        // LTR: readerImage1 is left, readerImage2 is right
        imageElement = i === 0 ? elements.readerImage1 : elements.readerImage2;
      }
    } else {
      imageElement = elements.readerImage1;
    }

    try {
      const objectUrl = await ensurePagePreview(pIndex);
      if (requestToken !== state.readerRequestToken || isReaderClosed()) {
        return;
      }

      imageElement.alt = `${state.manifest.bookName} page ${pIndex + 1}`;
      imageElement.src = objectUrl;
      imageElement.classList.remove("hidden");
    } catch (error) {
      if (error.name === "AbortError") {
        return;
      }
      console.error(`Failed to load page ${pIndex + 1}:`, error);
      imageElement.classList.remove("hidden");
      imageElement.alt = `Error loading page ${pIndex + 1}`;
    }
  }
}

async function ensurePagePreview(pageIndex) {
  const existingUrl = state.previewUrls.get(pageIndex);
  if (existingUrl) {
    return existingUrl;
  }

  const inflight = state.previewRequests.get(pageIndex);
  if (inflight) {
    await inflight;
    return state.previewUrls.get(pageIndex);
  }

  await schedulePreview(pageIndex);
  const objectUrl = state.previewUrls.get(pageIndex);
  if (!objectUrl) {
    throw new Error(`Preview for page ${pageIndex + 1} is unavailable.`);
  }

  return objectUrl;
}
