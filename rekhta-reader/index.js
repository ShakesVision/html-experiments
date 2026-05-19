import {
  DEFAULT_PROXY_PREFIX,
  createBookClient,
  createLimiter,
  getDeviceProfile,
} from "./src/index.js";

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
  searchButton: document.getElementById("search-button"),
  searchClose: document.getElementById("search-close"),
  searchKeyword: document.getElementById("search-keyword"),
  searchLang: document.getElementById("search-lang"),
  searchModal: document.getElementById("search-modal"),
  searchNext: document.getElementById("search-next"),
  searchPage: document.getElementById("search-page"),
  searchPrev: document.getElementById("search-prev"),
  searchResults: document.getElementById("search-results"),
  searchStatus: document.getElementById("search-status"),
  searchSubmit: document.getElementById("search-submit"),
  readerClose: document.getElementById("reader-close"),
  readerPagesContainer: document.getElementById("reader-pages-container"),
  readerModal: document.getElementById("reader-modal"),
  readerNext: document.getElementById("reader-next"),
  readerPageInput: document.getElementById("reader-page-input"),
  readerPageTotal: document.getElementById("reader-page-total"),
  readerPrev: document.getElementById("reader-prev"),
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
  currentPages: [] /* Stores the page(s) currently displayed in reader */,
  previewUrls: new Map(),
  search: {
    abortController: null,
    debounceTimer: null,
    keyword: "",
    lang: "3",
    pageIndex: 1,
    results: [],
    selectedHref: null,
  },
};

const previewLimiter = createLimiter(deviceProfile.previewConcurrency);

elements.urlInput.value = SAMPLE_BOOK_URL;
elements.proxyInput.value =
  localStorage.getItem(PROXY_STORAGE_KEY) || DEFAULT_PROXY_TEMPLATE;
elements.bookForm.addEventListener("submit", onLoadBook);
elements.downloadButton.addEventListener("click", onDownloadPdf);
elements.cancelButton.addEventListener("click", onCancelWork);
elements.searchButton.addEventListener("click", openSearch);
elements.searchClose.addEventListener("click", closeSearch);
elements.searchModal.addEventListener("click", onSearchBackdropClick);
elements.searchSubmit.addEventListener("click", () =>
  runSearch({ force: true }),
);
elements.searchKeyword.addEventListener("input", onSearchKeywordInput);
elements.searchKeyword.addEventListener("keydown", onSearchKeywordKeydown);
elements.searchLang.addEventListener("change", onSearchLangChange);
elements.searchPrev.addEventListener("click", () => changeSearchPage(-1));
elements.searchNext.addEventListener("click", () => changeSearchPage(1));
elements.readerClose.addEventListener("click", closeReader);
elements.readerPrev.addEventListener("click", () => stepReader("prev"));
elements.readerNext.addEventListener("click", () => stepReader("next"));
elements.readerPageInput.addEventListener("change", onReaderPageInput);
elements.readerModal.addEventListener("click", onReaderBackdropClick);
document.addEventListener("keydown", onDocumentKeydown);

setStatus("Paste a Rekhta URL or use the sample book to load the manifest.");
setProgress(0, "Idle");
renderDeviceHint();
renderSearchState();

async function onLoadBook(event) {
  event.preventDefault();
  let bookUrl = elements.urlInput.value.trim();
  const proxyPrefix = elements.proxyInput.value.trim();

  // Internal removal of /detail/ from the URL
  bookUrl = bookUrl.replace(/\/detail\//i, "/");

  if (!bookUrl) {
    setStatus("Enter a book URL before loading.", "error");
    return;
  }

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
    renderManifest(manifest);
    setBusy(false);
    setProgress(100, "Manifest cached");
    setStatus(
      `Loaded ${manifest.bookName}. Rekhta is fetched through the configured proxy.`,
      "success",
    );
  } catch (error) {
    handleError(
      error,
      "Unable to load the book manifest. Check the proxy prefix.",
    );
  }
}

async function onDownloadPdf() {
  if (!state.manifest) {
    setStatus("Load a book first, then download the PDF.", "error");
    return;
  }

  cancelActiveWork();
  const abortController = new AbortController();
  state.abortController = abortController;

  const pageRefs = state.manifest.scrambleMap;
  const downloadLimiter = createLimiter(deviceProfile.downloadConcurrency);
  const renderJobs = pageRefs.map((pageRef) =>
    downloadLimiter(() =>
      bookClient.renderPageToCanvas(pageRef, {
        signal: abortController.signal,
      }),
    ),
  );

  setBusy(true, "Preparing PDF...");
  setProgress(1, "Preparing PDF");

  let pdfDocument = null;

  try {
    for (let index = 0; index < renderJobs.length; index += 1) {
      const canvas = await renderJobs[index];
      const orientation =
        canvas.width > canvas.height ? "landscape" : "portrait";
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

      const completion = Math.round(((index + 1) / renderJobs.length) * 100);
      setProgress(completion, `Building PDF ${index + 1}/${renderJobs.length}`);
    }

    pdfDocument.save(`${state.manifest.fileName}.pdf`);
    setBusy(false);
    setStatus("PDF export finished.", "success");
  } catch (error) {
    handleError(error, "PDF export stopped before completion.");
  }
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
  elements.cacheBadge.textContent = state.isUrduBook
    ? "Manifest cached - Urdu navigation enabled"
    : "Manifest cached";
  elements.downloadButton.disabled = false;
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
  state.currentPages = [];

  state.previewUrls.forEach((objectUrl) => {
    URL.revokeObjectURL(objectUrl);
  });

  state.previewUrls.clear();
  elements.previewGrid.innerHTML = "";
  elements.downloadButton.disabled = true;
  elements.cacheBadge.textContent = "No manifest cached yet";
  elements.metaTitle.textContent = "No book loaded";
  elements.metaAuthor.textContent = "Waiting for manifest";
  elements.metaPages.textContent = "0 pages";
  elements.readerPageInput.value = "";
  elements.readerPageTotal.textContent = "/ 0";

  window.removeEventListener("resize", onWindowResize);
  elements.readerPagesContainer.removeEventListener("touchstart", onTouchStart);
  elements.readerPagesContainer.removeEventListener("touchmove", onTouchMove);
  elements.readerPagesContainer.removeEventListener("touchend", onTouchEnd);
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

function openReader(pageIndex) {
  if (!state.manifest) {
    return;
  }

  state.modalPageIndex = pageIndex;
  elements.readerModal.classList.remove("reader-modal--hidden");
  document.body.style.overflow = "hidden";

  onWindowResize(); /* Call on resize to set two-page mode initially */
  window.addEventListener("resize", onWindowResize);

  elements.readerPagesContainer.addEventListener("touchstart", onTouchStart);
  elements.readerPagesContainer.addEventListener("touchmove", onTouchMove);
  elements.readerPagesContainer.addEventListener("touchend", onTouchEnd);

  renderReaderPages(pageIndex);
}

function closeReader() {
  elements.readerModal.classList.add("reader-modal--hidden");
  elements.readerPagesContainer.innerHTML = "";
  document.body.style.overflow = "";
  state.currentPages = [];
  state.isTwoPageMode = false;
  window.removeEventListener("resize", onWindowResize);
  elements.readerPagesContainer.removeEventListener("touchstart", onTouchStart);
  elements.readerPagesContainer.removeEventListener("touchmove", onTouchMove);
  elements.readerPagesContainer.removeEventListener("touchend", onTouchEnd);
}

function openSearch() {
  elements.searchModal.classList.remove("search-modal--hidden");
  document.body.style.overflow = "hidden";
  elements.searchKeyword.focus();
  renderSearchState();
}

function closeSearch() {
  elements.searchModal.classList.add("search-modal--hidden");
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
        `Showing ${results.length} books. Click one to fill the URL box.`,
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
    elements.searchResults.appendChild(button);
  });
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
    elements.urlInput.focus();
    setSearchStatus(
      "Added to the URL box. You can click another result anytime.",
      "success",
    );
    setStatus(`Selected: ${resolvedUrl}`, "success");
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
  const cards = Array.from(documentNode.querySelectorAll(".bookContent"));

  return cards
    .map((card) => {
      const anchor = card.querySelector("a[href]");
      const href = anchor?.getAttribute("href")?.trim() || "";
      const style = anchor?.getAttribute("style") || "";
      const imageUrl = parseBackgroundImageUrl(style);
      const title =
        card
          .querySelector(".bookTagline")
          ?.textContent?.trim()
          .replace(/ +/g, " ") || "";
      const author =
        card
          .querySelector(".bookTitle")
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
  const directReader =
    documentNode.querySelector('a[href^="/ebooks/"]') ||
    documentNode.querySelector('a[href*="/ebooks/"]');

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

const MIN_TWO_PAGE_WIDTH = 1024; // Minimum width for two-page display

function onWindowResize() {
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
    // Swiped right (previous page)
    stepReader("prev");
  } else if (deltaX < -swipeThreshold) {
    // Swiped left (next page)
    stepReader("next");
  }

  // Reset touch positions
  touchStartX = 0;
  touchEndX = 0;
}

async function renderReaderPages(pageIndex) {
  if (!state.manifest) {
    return;
  }

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
    if (page1Index >= 0 && page1Index < state.manifest.pageCount) {
      pagesToRender.push(page1Index);
    }
    if (
      page2Index >= 0 &&
      page2Index < state.manifest.pageCount &&
      page1Index !== page2Index
    ) {
      pagesToRender.push(page2Index);
    }
  } else {
    pagesToRender.push(pageIndex);
  }

  state.currentPages = pagesToRender.sort((a, b) => a - b);

  elements.readerPageInput.value = `${pageInputDisplayIndex}`;
  elements.readerPageTotal.textContent = `/ ${state.manifest.pageCount}`;
  elements.readerPrev.disabled =
    pageIndex + getDirectionalDelta("prev") < 0 ||
    pageIndex + getDirectionalDelta("prev") >= state.manifest.pageCount;
  elements.readerNext.disabled =
    pageIndex + getDirectionalDelta("next") < 0 ||
    pageIndex + getDirectionalDelta("next") >= state.manifest.pageCount;

  elements.readerPagesContainer.innerHTML = "";
  for (const pIndex of pagesToRender) {
    try {
      const objectUrl = await ensurePagePreview(pIndex);
      if (requestToken !== state.readerRequestToken || isReaderClosed()) {
        return;
      }

      const img = document.createElement("img");
      img.className = `reader-image ${pagesToRender.length > 1 ? "" : "single-page"}`;
      img.alt = `${state.manifest.bookName} page ${pIndex + 1}`;
      img.src = objectUrl;
      elements.readerPagesContainer.appendChild(img);
    } catch (error) {
      if (error.name === "AbortError") {
        return;
      }
      console.error(`Failed to load page ${pIndex + 1}:`, error);
      const errorDiv = document.createElement("div");
      errorDiv.textContent = `Error loading page ${pIndex + 1}.`;
      errorDiv.className = "reader-image-error"; // Add a class for styling
      elements.readerPagesContainer.appendChild(errorDiv);
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
    stepReader("prev");
  }

  if (event.key === "ArrowRight") {
    stepReader("next");
  }
}

function isReaderClosed() {
  return elements.readerModal.classList.contains("reader-modal--hidden");
}

function isSearchClosed() {
  return elements.searchModal.classList.contains("search-modal--hidden");
}
