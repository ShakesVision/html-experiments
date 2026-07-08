// Generic helpers shared between the book reader (src/index.js) and the
// poetry/prose downloader (poetry/src/scraper.js). Keep this file free of
// book-specific (manifest/unscramble/canvas) or poetry-specific (listing
// selectors) logic so both apps can stay separate while sharing plumbing.

export { applyProxyPrefix, createLimiter, fetchHtml, getDeviceProfile };

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
