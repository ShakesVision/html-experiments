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
    def: "span.c-book-name",
  },
  {
    key: "author",
    label: "Author",
    description: "Element holding the author's name.",
    def: "span.faded",
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
      "Endpoint that returns the unscramble key; the tool appends the page ID.",
    def: "https://ebooksapi.rekhta.org/api_getebookpagebyid_websiteapp/?wref=from-site&&pgid=",
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

export {
  BOOK_SELECTOR_DEFS,
  DEFAULT_PROXY_PREFIX,
  bookSelectors,
  createBookClient,
  createLimiter,
  getDeviceProfile,
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
    fetchImageBlob,
    proxyPrefix,
    renderPageToCanvas,
    renderPageToBlob,
  };

  async function getManifest(bookUrl, fetchOptions = {}) {
    const manifestUrl = buildManifestUrl(bookUrl);
    const html = await getCachedText(manifestUrl, fetchOptions);
    return normalizeManifest(bookUrl, html);
  }

  async function getPageKey(pageId, fetchOptions = {}) {
    const keyUrl = applyProxyPrefix(
      `${bookSelectors.get("pageKeyEndpoint")}${encodeURIComponent(pageId)}`,
      proxyPrefix,
    );
    return getCachedJsonWithRetry(keyUrl, fetchOptions);
  }

  async function fetchImageBlob(imageUrl, fetchOptions = {}) {
    // Images must also go through the proxy — without it canvas drawImage()
    // will throw a tainted-canvas security error on CORS-restricted servers.
    const proxiedUrl = applyProxyPrefix(imageUrl, proxyPrefix);
    const response = await fetchWithRetry(
      () => fetchImpl(proxiedUrl, { method: "GET" }),
      { signal: fetchOptions.signal }
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
      getPageKey(pageReference.pageId, fetchOptions),
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

  async function getCachedJsonWithRetry(url, fetchOptions = {}) {
    if (!fetchOptions.forceRefresh) {
      const cachedValue = await jsonCache.match(url);
      if (cachedValue) {
        return cachedValue;
      }
    }

    return getCachedJson(url, fetchOptions);
  }

  async function getCachedJson(url, fetchOptions = {}) {
    return fetchWithRetry(
      async () => {
        const response = await fetchImpl(url, {
          method: "GET",
          origin: "https://rekhta.org",
          referrer: "https://rekhta.org",
          headers: {
            Accept: "application/json",
          },
        });

        if (!response.ok) {
          throw new Error(`Request failed with status ${response.status}`);
        }

        const payload = await response.json();
        await jsonCache.put(url, payload);
        return payload;
      },
      { signal: fetchOptions.signal }
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
        const response = await fetchImpl(applyProxyPrefix(url, proxyPrefix), {
          method: "GET",
          origin: "https://rekhta.org",
          referrer: "https://rekhta.org",
        });

        if (!response.ok) {
          throw new Error(`Request failed with status ${response.status}`);
        }

        const payload = await response.text();
        await jsonCache.put(url, payload);
        return payload;
      },
      { signal: fetchOptions.signal }
    );
  }
}

function buildManifestUrl(bookUrl) {
  return bookUrl;
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
      if (attempt < MAX_RETRIES) {
        const delayMs = RETRY_DELAYS[attempt] || 5000;
        await new Promise((resolve) =>
          setTimeout(resolve, delayMs)
        );
        console.debug(
          `Request retry ${attempt + 1}/${MAX_RETRIES} after ${delayMs}ms`
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
  const bookName =
    documentNode
      .querySelector(bookSelectors.get("bookName"))
      ?.textContent?.trim() ||
    documentNode.querySelector("title")?.textContent?.trim() ||
    "Untitled book";
  const author =
    documentNode
      .querySelector(bookSelectors.get("author"))
      ?.textContent?.replace(/\r?\n/g, "")
      .replace(/ +/g, " ")
      .replace("by ", "")
      .trim() || "Unknown author";
  const bookId = findTextBetween(html, bookSelectors.get("markerBookId"), '";');
  const pages = stringToStringArray(
    findTextBetween(html, bookSelectors.get("markerPages"), "];"),
  );
  const pageIds = stringToStringArray(
    findTextBetween(html, bookSelectors.get("markerPageIds"), "];"),
  );
  const pageCount =
    Number(findTextBetween(html, bookSelectors.get("markerTotalPages"), ";")) ||
    Math.max(pages.length, pageIds.length);
  const imageBase = bookSelectors.get("imageBase");
  const keyEndpoint = bookSelectors.get("pageKeyEndpoint");
  const fileName = `${bookName} by ${author}`
    .trim()
    .replace(/ +/g, " ")
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-");
  const scrambleMap = pageIds.map((pageId, index) => ({
    imageName: pages[index] || "",
    imgUrl: `${imageBase}${bookId}/${pages[index]}`,
    index,
    keyUrl: `${keyEndpoint}${encodeURIComponent(pageId)}`,
    pageId,
  }));

  return {
    actualUrl: bookUrl,
    author,
    bookId,
    bookName,
    bookUrl,
    fileName: fileName || "rekhta-book",
    pageCount,
    pageIds,
    pages,
    scrambleMap,
  };
}

async function unscramblePage(options) {
  const { imageBlob, pageKey, tileGap, tileSize } = options;
  const source = await loadImageSource(imageBlob);
  const canvas = document.createElement("canvas");
  canvas.width = pageKey.PageWidth || tileSize * (pageKey.X || 1);
  canvas.height = pageKey.PageHeight || tileSize * (pageKey.Y || 1);

  const ctx = canvas.getContext("2d", { alpha: false });
  const tileStride = tileSize + tileGap;

  pageKey.Sub.forEach((sub) => {
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

  return {
    async match(url) {
      const cacheStorage = await getCacheStorage();
      if (!cacheStorage) {
        return memoryJsonCache.get(url) || null;
      }

      const response = await cacheStorage.match(url);
      if (!response) {
        return memoryJsonCache.get(url) || null;
      }

      return response.json();
    },
    async put(url, payload) {
      memoryJsonCache.set(url, payload);

      const cacheStorage = await getCacheStorage();
      if (!cacheStorage) {
        return;
      }

      const response = new Response(JSON.stringify(payload), {
        headers: {
          "Content-Type": "application/json",
        },
      });

      await cacheStorage.put(url, response);
    },
  };

  async function getCacheStorage() {
    if (!("caches" in globalThis)) {
      return null;
    }

    return caches.open(cacheName);
  }
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

  return input.split(",").map((item) => item.replace(/"/g, "").trim());
}
