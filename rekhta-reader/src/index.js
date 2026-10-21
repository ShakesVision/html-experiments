import {
  applyProxyPrefix,
  createLimiter,
  createSelectorStore,
  getDeviceProfile,
} from "./shared.js";

const DEFAULT_PROXY_PREFIX = "";
const DEFAULT_TILE_SIZE = 50;
const DEFAULT_TILE_GAP = 16;

// Everything the book reader reads out of Rekhta's page, in one editable
// place. If Rekhta renames a class or a script variable and loading breaks,
// a user can fix the matching value from the in-app selector settings —
// no code change needed. The `end` tokens for markers stay in code (they're
// generic terminators); only the fragile leading marker is user-editable.
const BOOK_SELECTOR_DEFS = [
  {
    key: "bookName",
    label: "Book title",
    description: "Element holding the book's title on the ebook page.",
    def: "meta[property='og:title']",
  },
  {
    key: "author",
    label: "Author",
    description: "Element holding the author's name.",
    def: "meta[property='og:description'], meta[name='description']",
  },
  {
    key: "markerBookId",
    label: "Marker · book ID",
    description: "Text just before the book ID in the page script.",
    def: 'var bookId = "',
  },
  {
    key: "markerPages",
    label: "Marker · page files",
    description: "Text just before the list of page image filenames.",
    def: "var pages = [",
  },
  {
    key: "markerPageIds",
    label: "Marker · page IDs",
    description: "Text just before the list of page IDs.",
    def: "var pageIds = [",
  },
  {
    key: "markerTotalPages",
    label: "Marker · total pages",
    description: "Text just before the total page count.",
    def: "var totalPageCount =",
  },
  {
    key: "imageBase",
    label: "Page image base URL",
    description: "Prefix for a page image; the tool appends bookId/filename.",
    def: "https://ebooksapi.rekhta.org/images/",
  },
  {
    key: "pageKeyEndpoint",
    label: "Page-key API endpoint",
    description:
      "Endpoint template for page-key JSON; {pageIndex} is Rekhta's zero-based pgIdx and the other placeholders are {bookId} and {pageId}.",
    def: "https://www.rekhta.org/EbookData/GetEbookFromApi/?bkId={bookId}&pgIdx={pageIndex}&pgid={pageId}",
  },
  {
    key: "searchCard",
    label: "Search · result card",
    description: "Each book card in search results.",
    def: ".bookContent",
  },
  {
    key: "searchTitle",
    label: "Search · book title",
    description: "Title text inside a search result card.",
    def: ".bookTagline",
  },
  {
    key: "searchAuthor",
    label: "Search · author",
    description: "Author text inside a search result card.",
    def: ".bookTitle",
  },
  {
    key: "readerLink",
    label: "Detail → reader link",
    description: "Link to the readable ebook on a detail page.",
    def: 'a[href*="/ebooks/"]',
  },
];

const bookSelectors = createSelectorStore(
  "rekhta_book_selectors_v1",
  Object.fromEntries(BOOK_SELECTOR_DEFS.map((d) => [d.key, d.def])),
);

const memoryJsonCache = new Map();
const requestInFlight = new Map(); // Deduplication: key -> Promise
const failedRequests = new Map(); // Track failures: key -> { count, timestamp }
const FAILURE_CACHE_TTL = 60000; // Cache failures for 1 minute
const MAX_RETRIES = 3;
const RETRY_DELAYS = [500, 1500, 3000]; // Exponential backoff in ms
const REKHTA_API_MIN_INTERVAL_MS = 1500;
let nextRekhtaApiRequestAt = 0;
let rekhtaApiRequestQueue = Promise.resolve();

export {
  BOOK_SELECTOR_DEFS,
  DEFAULT_PROXY_PREFIX,
  bookSelectors,
  createBookClient,
  createLimiter,
  getDeviceProfile,
  getNumericValue,
  getTilePosition,
  normalizePageKeyTiles,
};

function createBookClient(options = {}) {
  const proxyPrefix = options.proxyPrefix || DEFAULT_PROXY_PREFIX;
  const jsonCache = options.jsonCache || createJsonCache();
  const fetchImpl = options.fetchImpl || fetch.bind(globalThis);
  const tileSize = options.tileSize || DEFAULT_TILE_SIZE;
  const tileGap = options.tileGap || DEFAULT_TILE_GAP;

  return {
    buildManifestUrl: (bookUrl) => buildManifestUrl(bookUrl),
    getManifest,
    getPageKey,
    getPageIds,
    fetchImageBlob,
    proxyPrefix,
    renderPageToCanvas,
    renderPageToBlob,
    renderPageDirect,
  };

  async function getManifest(bookUrl, fetchOptions = {}) {
    const manifestUrl = buildManifestUrl(bookUrl);
    console.debug("[reader] getManifest start", {
      bookUrl,
      proxyPrefix,
      manifestUrl,
    });
    const html = await getCachedText(manifestUrl, fetchOptions);
    console.debug("[reader] getManifest received html", {
      bookUrl,
      length: html?.length ?? 0,
      hasBookId: /var\s+bookId\s*=/.test(html || ""),
      hasOgTitle: /og:title/i.test(html || ""),
      startsWith: (html || "").slice(0, 180),
    });
    return normalizeManifest(bookUrl, html);
  }

  async function getPageKey(requestOrPageId, fetchOptions = {}) {
    const request =
      typeof requestOrPageId === "string"
        ? {
            bookId: fetchOptions.bookId,
            pageId: requestOrPageId,
            pageIndex: fetchOptions.pageIndex,
          }
        : requestOrPageId || {};

    const pageId = request.pageId;
    if (!pageId) {
      throw new Error("Page ID is required to fetch the page key.");
    }

    const keyUrl = applyProxyPrefix(
      buildPageKeyUrl({
        bookId: request.bookId || fetchOptions.bookId,
        pageId,
        pageIndex: request.pageIndex ?? fetchOptions.pageIndex,
      }),
      proxyPrefix,
    );
    return getCachedJsonWithRetry(keyUrl, fetchOptions, {
      pageKey: true,
      throttled: true,
    });
  }

  async function getPageIds({ slug, lang = "1", from = 0, count = 10 } = {}, fetchOptions = {}) {
    const url = applyProxyPrefix(
      `https://www.rekhta.org/EbookData/GetEbookPageIds/?slug=${encodeURIComponent(slug)}&lang=${encodeURIComponent(lang)}&from=${from}&count=${count}`,
      proxyPrefix,
    );
    return getCachedJsonWithRetry(url, fetchOptions, { throttled: true });
  }

  async function fetchImageBlob(imageUrl, fetchOptions = {}) {
    // Images must also go through the proxy — without it canvas drawImage()
    // will throw a tainted-canvas security error on CORS-restricted servers.
    const proxiedUrl = applyProxyPrefix(imageUrl, proxyPrefix);
    const response = await fetchWithRetry(
      () => fetchImpl(proxiedUrl, { method: "GET" }),
      { signal: fetchOptions.signal },
    );

    if (!response.ok) {
      throw new Error(`Image fetch failed with status ${response.status}`);
    }

    return response.blob();
  }

  async function renderPageToCanvas(pageReference, fetchOptions = {}) {
    if (!pageReference?.pageId || !pageReference?.imgUrl) {
      throw new Error("Page reference is missing pageId or imgUrl.");
    }

    const [pageKey, imageBlob] = await Promise.all([
      getPageKey(
        {
          bookId: pageReference.bookId,
          pageId: pageReference.pageId,
          pageIndex: pageReference.pageIndex ?? pageReference.index + 1,
        },
        fetchOptions,
      ),
      fetchImageBlob(pageReference.imgUrl, fetchOptions),
    ]);

    return unscramblePage({
      imageBlob,
      pageKey,
      tileGap,
      tileSize,
    });
  }

  async function renderPageToBlob(pageReference, fetchOptions = {}) {
    const canvas = await renderPageToCanvas(pageReference, fetchOptions);
    const type = fetchOptions.type || "image/jpeg";
    const quality = fetchOptions.quality ?? 0.86;
    const blob = await canvasToBlob(canvas, type, quality);

    return {
      blob,
      canvas,
      height: canvas.height,
      pageId: pageReference.pageId,
      width: canvas.width,
    };
  }

  async function getCachedJsonWithRetry(
    url,
    fetchOptions = {},
    { pageKey = false, throttled = false } = {},
  ) {
    if (!fetchOptions.forceRefresh) {
      const cachedValue = await jsonCache.match(url);
      if (cachedValue !== null && cachedValue !== "") {
        return cachedValue;
      }
    }

    if (!throttled) return getCachedJson(url, fetchOptions, { pageKey });

    const existingRequest = requestInFlight.get(url);
    if (existingRequest) return existingRequest;

    const request = getCachedJson(url, fetchOptions, { pageKey, throttled });
    requestInFlight.set(url, request);
    try {
      return await request;
    } finally {
      if (requestInFlight.get(url) === request) requestInFlight.delete(url);
    }
  }

  async function getCachedJson(
    url,
    fetchOptions = {},
    { pageKey = false, throttled = false } = {},
  ) {
    return fetchWithRetry(
      async () => {
        const request = async () => {
          const response = await fetchImpl(url, {
            method: "GET",
            origin: "https://www.rekhta.org",
            referrer: "https://www.rekhta.org/",
            headers: {
              Accept: "application/json, text/javascript, */*; q=0.01",
              "X-Requested-With": "XMLHttpRequest",
            },
          });

          if (!response.ok) {
            const error = new Error(`Request failed with status ${response.status}`);
            error.retryAfterMs = getRetryAfterMs(response);
            throw error;
          }

          let payload = await response.json();
          if (typeof payload === "string") {
            try {
              payload = JSON.parse(payload);
            } catch {
              // Leave non-JSON strings as-is; validation below will report it.
            }
          }
          if (pageKey && (!payload || !Array.isArray(payload.Sub) || !payload.Sub.length)) {
            const error = new Error("Rekhta returned no tile map for this page key.");
            error.noRetry = true;
            throw error;
          }
          await jsonCache.put(url, payload);
          return payload;
        };

        return throttled
          ? scheduleRekhtaApiRequest(request, fetchOptions.signal)
          : request();
      },
      { signal: fetchOptions.signal },
    );
  }

  async function getCachedText(url, fetchOptions = {}) {
    if (!fetchOptions.forceRefresh) {
      const cachedValue = await jsonCache.match(url);
      if (typeof cachedValue === "string") {
        return cachedValue;
      }
    }

    return fetchWithRetry(
      async () => {
        const proxiedUrl = applyProxyPrefix(url, proxyPrefix);
        console.debug("[reader] fetch text", {
          originalUrl: url,
          proxyPrefix,
          proxiedUrl,
        });

        const response = await fetchImpl(proxiedUrl, {
          method: "GET",
          origin: "https://rekhta.org",
          referrer: "https://rekhta.org",
        });

        console.debug("[reader] fetch text response", {
          url,
          proxiedUrl,
          status: response?.status,
          contentType: response?.headers?.get?.("content-type"),
        });

        if (!response.ok) {
          throw new Error(`Request failed with status ${response.status}`);
        }

        const payload = await response.text();
        console.debug("[reader] fetch text payload preview", {
          url,
          preview: (payload || "").slice(0, 220),
        });
        await jsonCache.put(url, payload);
        return payload;
      },
      { signal: fetchOptions.signal },
    );
  }
}

function buildManifestUrl(bookUrl) {
  return bookUrl;
}

function getRetryAfterMs(response) {
  const value = response.headers?.get?.("retry-after");
  if (!value) return 0;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const retryAt = Date.parse(value);
  return Number.isFinite(retryAt) ? Math.max(0, retryAt - Date.now()) : 0;
}

function scheduleRekhtaApiRequest(task, signal) {
  const scheduled = rekhtaApiRequestQueue.then(async () => {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    const waitMs = Math.max(0, nextRekhtaApiRequestAt - Date.now());
    if (waitMs) await waitForRequestSlot(waitMs, signal);
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

    try {
      return await task();
    } catch (error) {
      if (error.retryAfterMs > 0) {
        nextRekhtaApiRequestAt = Math.max(
          nextRekhtaApiRequestAt,
          Date.now() + error.retryAfterMs,
        );
      }
      throw error;
    } finally {
      nextRekhtaApiRequestAt = Math.max(
        nextRekhtaApiRequestAt,
        Date.now() + REKHTA_API_MIN_INTERVAL_MS,
      );
    }
  });
  rekhtaApiRequestQueue = scheduled.catch(() => {});
  return scheduled;
}

function waitForRequestSlot(waitMs, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }

    const timeoutId = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, waitMs);
    const onAbort = () => {
      clearTimeout(timeoutId);
      reject(new DOMException("Aborted", "AbortError"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

// Retry logic with exponential backoff and request deduplication
async function fetchWithRetry(fetchFn, options = {}) {
  const { signal } = options;
  let lastError;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (signal?.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }

    try {
      return await fetchFn();
    } catch (error) {
      lastError = error;

      // Don't retry on abort or 403 (permission denied)
      if (error.name === "AbortError") {
        throw error;
      }
      if (error.noRetry) throw error;

      // 403 Forbidden likely means the domain is blocked; don't waste retries
      const is403 =
        error.message?.includes("403") || error.message?.includes("Forbidden");
      if (is403 && attempt === 0) {
        console.warn("Request returned 403 Forbidden. Proxy may be needed.");
        throw error;
      }

      // Don't retry on 4xx client errors (except 429 rate limit)
      if (
        error.message?.match(/^Request failed with status 4\d\d/) &&
        !error.message?.includes("429")
      ) {
        throw error;
      }

      // Wait before retrying
      const maxRetries = error.retryAfterMs > 0 ? 1 : MAX_RETRIES;
      if (attempt < maxRetries) {
        const delayMs = error.retryAfterMs || RETRY_DELAYS[attempt] || 5000;
        await waitForRequestSlot(delayMs, signal);
        console.debug(
          `Request retry ${attempt + 1}/${MAX_RETRIES} after ${delayMs}ms`,
        );
      }
    }
  }

  throw lastError;
}

function normalizeManifest(bookUrl, html) {
  if (!html) {
    throw new Error("Manifest HTML is empty.");
  }

  const parser = new DOMParser();
  const documentNode = parser.parseFromString(html, "text/html");

  const bookName = normalizeManifestTitle(
    readTextNode(documentNode, [
      bookSelectors.get("bookName"),
      "meta[property='og:title']",
      ".c-book-name",
      "title",
    ]),
  );

  const author = normalizeManifestAuthor(
    readTextNode(documentNode, [
      bookSelectors.get("author"),
      "meta[property='og:description']",
      "meta[name='description']",
      "meta[name='twitter:description']",
      "span.faded",
      ".faded",
    ]),
  );

  const bookId =
    readScriptValue(html, "bookId") ||
    extractUrlSegment(bookUrl, "/ebooks/") ||
    "";
  const pages = parseScriptArray(html, "pages");
  const pageIds = parseScriptArray(html, "pageIds");
  const totalPageCount =
    readScriptValue(html, "totalPageCount") ||
    Math.max(pages.length, pageIds.length);
  const pageCount =
    Number(totalPageCount) || Math.max(pages.length, pageIds.length);
  const imageBase = bookSelectors.get("imageBase");
  const keyEndpoint = bookSelectors.get("pageKeyEndpoint");
  const fileName = `${bookName} by ${author}`
    .trim()
    .replace(/ +/g, " ")
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-");

  const resolvedPageIds = Array.from({ length: pageCount }, (_, index) => {
    if (typeof pageIds[index] === "string" && pageIds[index].trim()) {
      return pageIds[index].trim();
    }
    return "";
  });

  const scrambleMap = Array.from({ length: pageCount }, (_, index) => {
    const pageId = resolvedPageIds[index] || "";
    const imageName = pages[index] || "";

    return {
      bookId,
      imageName,
      imgUrl: imageName
        ? `${imageBase}${bookId}/${imageName}`.replace(/\/$/, "")
        : "",
      index,
      keyUrl: buildPageKeyUrl({
        bookId,
        pageId,
        pageIndex: index + 1,
        template: keyEndpoint,
      }),
      pageId,
      pageIndex: index + 1,
    };
  });

  return {
    actualUrl: bookUrl,
    author,
    bookId,
    bookName,
    bookUrl,
    fileName: fileName || "rekhta-book",
    pageCount,
    pageIds: resolvedPageIds,
    pages,
    scrambleMap,
  };
}

function getNumericValue(value, fallback = 0) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : fallback;
}

function getTilePosition(tile, fallbackIndex = 0) {
  if (!tile || typeof tile !== "object") {
    return { X1: 0, X2: 0, Y1: 0, Y2: 0, index: fallbackIndex };
  }

  return {
    index: getNumericValue(tile.index, fallbackIndex),
    X1: getNumericValue(tile.X1, 0),
    X2: getNumericValue(tile.X2, 0),
    Y1: getNumericValue(tile.Y1, 0),
    Y2: getNumericValue(tile.Y2, 0),
  };
}

function normalizePageKeyTiles(pageKey) {
  const rawTiles = Array.isArray(pageKey?.Sub) ? pageKey.Sub : [];
  if (!rawTiles.length) {
    return [];
  }

  const hasIndex = rawTiles.some(
    (tile) =>
      tile &&
      typeof tile === "object" &&
      Object.prototype.hasOwnProperty.call(tile, "index"),
  );

  return rawTiles
    .map((tile, order) => getTilePosition(tile, order))
    .sort((leftTile, rightTile) => {
      if (hasIndex) {
        const orderedByIndex = leftTile.index - rightTile.index;
        if (orderedByIndex !== 0) {
          return orderedByIndex;
        }
      }

      return (
        leftTile.Y1 - rightTile.Y1 ||
        leftTile.X1 - rightTile.X1 ||
        leftTile.Y2 - rightTile.Y2 ||
        leftTile.X2 - rightTile.X2
      );
    });
}

async function unscramblePage(options) {
  const { imageBlob, pageKey, tileGap, tileSize } = options;
  const source = await loadImageSource(imageBlob);
  const tiles = normalizePageKeyTiles(pageKey);
  if (!tiles.length) {
    releaseImageSource(source);
    throw new Error("Page-key response contains no tile mappings.");
  }
  const canvas = document.createElement("canvas");
  const pageWidth = getNumericValue(
    pageKey?.PageWidth,
    getNumericValue(pageKey?.Width, tileSize * getNumericValue(pageKey?.X, 1)),
  );
  const pageHeight = getNumericValue(
    pageKey?.PageHeight,
    getNumericValue(pageKey?.Y, 1) * tileSize,
  );

  if (pageWidth <= 0 || pageHeight <= 0) {
    releaseImageSource(source);
    throw new Error("Page-key response contains invalid page dimensions.");
  }

  canvas.width = pageWidth;
  canvas.height = pageHeight;

  const ctx = canvas.getContext("2d", { alpha: false });
  const tileStride = tileSize + tileGap;

  tiles.forEach((sub) => {
    ctx.drawImage(
      source,
      sub.X1 * tileStride,
      sub.Y1 * tileStride,
      tileSize,
      tileSize,
      sub.X2 * tileSize,
      sub.Y2 * tileSize,
      tileSize,
      tileSize,
    );
  });

  releaseImageSource(source);
  return canvas;
}

async function loadImageSource(imageBlob) {
  if (typeof createImageBitmap === "function") {
    return createImageBitmap(imageBlob);
  }

  const objectUrl = URL.createObjectURL(imageBlob);

  try {
    const image = new Image();
    image.decoding = "async";

    const loaded = new Promise((resolve, reject) => {
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("Unable to decode page image."));
    });

    image.src = objectUrl;
    return await loaded;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function releaseImageSource(source) {
  if (typeof ImageBitmap !== "undefined" && source instanceof ImageBitmap) {
    source.close();
  }
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("Unable to encode canvas output."));
          return;
        }

        resolve(blob);
      },
      type,
      quality,
    );
  });
}

function createJsonCache() {
  const cacheName = "rekhta-downloader-json-v1";
  let cacheWarningShown = false;

  return {
    async match(url) {
      try {
        const cacheStorage = await getCacheStorage();
        if (!cacheStorage) return getMemoryValue(url);

        const response = await cacheStorage.match(url);
        if (!response) return getMemoryValue(url);
        return await response.json();
      } catch (error) {
        warnCacheUnavailable(error);
        return getMemoryValue(url);
      }
    },
    async put(url, payload) {
      memoryJsonCache.set(url, payload);

      try {
        const cacheStorage = await getCacheStorage();
        if (!cacheStorage) return;

        const response = new Response(JSON.stringify(payload), {
          headers: { "Content-Type": "application/json" },
        });
        await cacheStorage.put(url, response);
      } catch (error) {
        warnCacheUnavailable(error);
      }
    },
  };

  async function getCacheStorage() {
    if (!("caches" in globalThis)) {
      return null;
    }

    try {
      return await globalThis.caches.open(cacheName);
    } catch (error) {
      warnCacheUnavailable(error);
      return null;
    }
  }

  function getMemoryValue(url) {
    return memoryJsonCache.has(url) ? memoryJsonCache.get(url) : null;
  }

  function warnCacheUnavailable(error) {
    if (cacheWarningShown) return;
    cacheWarningShown = true;
    console.warn("[reader] Browser cache unavailable; using in-memory cache.", error);
  }
}

function buildPageKeyUrl({ bookId, pageId, pageIndex, template } = {}) {
  if (!pageId) {
    return "";
  }

  const endpointTemplate = template || bookSelectors.get("pageKeyEndpoint");
  // Reader references use one-based page numbers; Rekhta's pgIdx query value
  // is zero-based (page 1 => pgIdx=0), as confirmed by the captured requests.
  const apiPageIndex = Math.max(0, Number(pageIndex ?? 1) - 1);
  return endpointTemplate
    .replace("{bookId}", encodeURIComponent(bookId || ""))
    .replace("{pageIndex}", encodeURIComponent(String(apiPageIndex)))
    .replace("{pageId}", encodeURIComponent(pageId));
}

function readTextNode(documentNode, selectors = []) {
  for (const selector of selectors) {
    if (!selector) {
      continue;
    }

    const element = documentNode.querySelector(selector);
    if (!element) {
      continue;
    }

    const textValue =
      element.textContent?.trim() || element.getAttribute("content")?.trim();
    if (textValue) {
      return textValue;
    }
  }

  return "";
}

function readScriptValue(source, variableName) {
  const pattern = new RegExp(
    `var\\s+${variableName}\\s*=\\s*(?:\"([^\"]*)\"|'([^']*)'|([^;\n]+))`,
    "i",
  );
  const match = source.match(pattern);
  if (!match) {
    return "";
  }

  return (match[1] || match[2] || match[3] || "").trim();
}

function parseScriptArray(source, name) {
  const literalPattern = new RegExp(
    `var\\s+${name}\\s*=\\s*\\[(.*?)\\]\\s*;`,
    "is",
  );
  const literalMatch = source.match(literalPattern);
  if (literalMatch) {
    return stringToStringArray(literalMatch[1]);
  }

  const arrayCtorPattern = new RegExp(
    `var\\s+${name}\\s*=\\s*new\\s+Array\\((\\d+)\\)\\s*;`,
    "is",
  );
  const arrayCtorMatch = source.match(arrayCtorPattern);
  const declaredLength = Number(arrayCtorMatch?.[1] ?? 0);

  const sparsePattern = new RegExp(
    `${name}\\[(\\d+)\\]\\s*=\\s*(?:\"([^\"]*)\"|'([^']*)'|([^,;\\s]+))`,
    "gi",
  );

  const values = new Map();
  for (const match of source.matchAll(sparsePattern)) {
    const index = Number(match[1]);
    const value = (match[2] || match[3] || match[4] || "").trim();
    values.set(index, value);
  }

  if (values.size || declaredLength > 0) {
    const targetLength = Math.max(
      declaredLength,
      values.size ? Math.max(...values.keys()) + 1 : 0,
    );

    return Array.from({ length: targetLength }, (_, index) => {
      const value = values.get(index) || "";
      return value;
    });
  }

  return [];
}

function normalizeManifestTitle(titleText) {
  const cleaned = (titleText || "").replace(/\s*\|\s*Rekhta\s*$/i, "").trim();
  return cleaned || "Untitled book";
}

function normalizeManifestAuthor(authorText) {
  const content = (authorText || "")
    .replace(/\r?\n/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!content) {
    return "Unknown author";
  }

  const byMatch = content.match(/\bby\s+(.+?)(?:\s+on\s+Rekhta|$)/i);
  if (byMatch?.[1]) {
    return byMatch[1].trim();
  }

  return content.replace(/^by\s+/i, "").trim() || "Unknown author";
}

function extractUrlSegment(url, prefix) {
  const normalized = url || "";
  const index = normalized.indexOf(prefix);
  if (index === -1) {
    return "";
  }

  return normalized.slice(index + prefix.length).split(/[/?#]/)[0] || "";
}

function findTextBetween(source, start, end) {
  const startIndex = source.indexOf(start);
  if (startIndex === -1) {
    return "";
  }

  const fromIndex = startIndex + start.length;
  const endIndex = source.indexOf(end, fromIndex);
  if (endIndex === -1) {
    return "";
  }

  return source.slice(fromIndex, endIndex).trim();
}

function stringToStringArray(input) {
  if (!input) {
    return [];
  }

  return input
    .split(",")
    .map((item) => item.replace(/['"]/g, "").trim())
    .filter(Boolean);
}

async function renderPageDirect(pageReference, fetchOptions = {}) {
  console.log("[direct-page] reference:", pageReference);

  if (!pageReference?.pageId) {
    throw new Error("Direct page load: missing pageId");
  }

  if (!pageReference?.imgUrl) {
    throw new Error("Direct page load: missing imgUrl");
  }

  console.log("[direct-page] page:", pageReference.pageIndex);
  console.log("[direct-page] pageId:", pageReference.pageId);
  console.log("[direct-page] image:", pageReference.imgUrl);

  const result = await renderPageToBlob(pageReference, {
    ...fetchOptions,
    forceRefresh: true,
  });

  console.log("[direct-page] UNSCRAMBLED:", {
    page: pageReference.pageIndex,
    pageId: result.pageId,
    width: result.width,
    height: result.height,
    blobSize: result.blob.size,
  });

  return result;
}

export async function forceRenderPage({ client, manifest, pageNumber }) {
  const pageIndex = Number(pageNumber);

  if (!Number.isInteger(pageIndex) || pageIndex < 1) {
    throw new Error(`Invalid page number: ${pageNumber}`);
  }

  if (pageIndex > manifest.pageCount) {
    throw new Error(
      `Page ${pageIndex} is outside the book (${manifest.pageCount} pages).`,
    );
  }

  const page = manifest.scrambleMap[pageIndex - 1];

  if (!page) {
    throw new Error(`No manifest entry for page ${pageIndex}`);
  }

  console.log(`%c[FORCE] PAGE ${pageIndex}`, "color:#00ff00;font-weight:bold");

  console.log("[FORCE] page reference:", {
    pageIndex: page.pageIndex,
    pageId: page.pageId,
    imgUrl: page.imgUrl,
    bookId: page.bookId,
  });

  if (!page.pageId) {
    throw new Error(`Page ${pageIndex} has no pageId`);
  }

  if (!page.imgUrl) {
    throw new Error(`Page ${pageIndex} has no image URL`);
  }

  const result = await client.renderPageToBlob(page, {
    forceRefresh: true,
    type: "image/jpeg",
    quality: 0.95,
  });

  console.log(
    `%c[FORCE] ✓ UNSCRAMBLED PAGE ${pageIndex}`,
    "color:#00ff00;font-weight:bold",
  );

  console.log("[FORCE] output:", {
    width: result.width,
    height: result.height,
    bytes: result.blob.size,
    pageId: result.pageId,
  });

  return {
    page,
    ...result,
  };
}
