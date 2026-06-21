const CACHE_VERSION = "tools-hub-2026-06-21.1";
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;
const ASSET_MANIFEST_URL = "/assets/data/pwa-assets.json";
const OFFLINE_URL = "/offline.html";

const DEFAULT_ASSETS = [
  "/",
  "/index.html",
  "/projects.json",
  "/assets/data/tools-manifest.json",
  "/assets/css/tailwind.css",
  "/assets/js/shared-init.js",
  "/assets/images/icon.png",
  "/assets/images/project.png",
  // Self-hosted Urdu font: guarantees at least one Nastaliq face is available
  // offline even with no network and no system-installed Urdu font.
  "/assets/fonts/MehrNastaliqWeb.woff",
  "/manifest.webmanifest",
  OFFLINE_URL,
];

// Cross-origin CDNs we are willing to cache at runtime so fonts and libraries
// keep working offline after the first successful online load. Everything
// else cross-origin is left to the network (e.g. ads, analytics).
const CACHEABLE_CROSS_ORIGIN = [
  "fonts.googleapis.com",
  "fonts.gstatic.com",
  "cdn.jsdelivr.net",
  "unpkg.com",
  "uicdn.toast.com",
];

function sameOrigin(request) {
  return new URL(request.url).origin === self.location.origin;
}

function isCacheableCrossOrigin(url) {
  return CACHEABLE_CROSS_ORIGIN.includes(url.hostname);
}

async function readAssetManifest() {
  try {
    const response = await fetch(ASSET_MANIFEST_URL, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Asset manifest failed with ${response.status}`);
    }
    const data = await response.json();
    return Array.isArray(data.assets) ? data.assets : DEFAULT_ASSETS;
  } catch {
    return DEFAULT_ASSETS;
  }
}

async function installStaticAssets() {
  const assets = await readAssetManifest();
  const cache = await caches.open(STATIC_CACHE);
  // addAll fails atomically if any asset 404s; add individually so one missing
  // file never blocks the whole precache.
  await Promise.all(
    Array.from(new Set([...DEFAULT_ASSETS, ...assets])).map((asset) =>
      cache.add(asset).catch(() => {}),
    ),
  );
}

self.addEventListener("install", (event) => {
  event.waitUntil(installStaticAssets().then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== STATIC_CACHE && key !== RUNTIME_CACHE)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

async function networkFirst(request) {
  const cache = await caches.open(RUNTIME_CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await cache.match(request);
    if (cached) {
      return cached;
    }
    if (request.mode === "navigate") {
      return caches.match(OFFLINE_URL);
    }
    throw new Error("Offline and no cached response is available.");
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) {
    return cached;
  }
  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(STATIC_CACHE);
    cache.put(request, response.clone());
  }
  return response;
}

// Serve cached copy immediately, refresh in the background. Handles CORS
// (response.ok) and opaque (no-cors, type "opaque") responses so cross-origin
// fonts/stylesheets/scripts survive offline once seen.
async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then((response) => {
      if (response && (response.ok || response.type === "opaque")) {
        cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => cached);
  return cached || network;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") {
    return;
  }

  const url = new URL(request.url);

  if (!sameOrigin(request)) {
    if (isCacheableCrossOrigin(url)) {
      event.respondWith(staleWhileRevalidate(request, RUNTIME_CACHE));
    }
    return;
  }

  if (url.pathname === "/projects.json" || url.pathname.endsWith("/tools-manifest.json")) {
    event.respondWith(networkFirst(request));
    return;
  }

  if (
    request.mode === "navigate" ||
    /\.(?:html|css|js|mjs|json|webmanifest|png|jpg|jpeg|webp|svg|woff2?|ttf|otf|txt|xml|wasm)$/i.test(url.pathname)
  ) {
    event.respondWith(cacheFirst(request));
  }
});
