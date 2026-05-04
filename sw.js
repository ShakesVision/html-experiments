const CACHE_VERSION = "tools-hub-2026-05-04";
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
  "/manifest.webmanifest",
  OFFLINE_URL,
];

function sameOrigin(request) {
  return new URL(request.url).origin === self.location.origin;
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
  await cache.addAll(Array.from(new Set([...DEFAULT_ASSETS, ...assets])));
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

self.addEventListener("fetch", (event) => {
  const { request } = event;

  if (request.method !== "GET" || !sameOrigin(request)) {
    return;
  }

  const url = new URL(request.url);
  if (url.pathname === "/projects.json" || url.pathname.endsWith("/tools-manifest.json")) {
    event.respondWith(networkFirst(request));
    return;
  }

  if (
    request.mode === "navigate" ||
    /\.(?:html|css|js|json|webmanifest|png|jpg|jpeg|webp|svg|woff2?|txt|xml)$/i.test(url.pathname)
  ) {
    event.respondWith(cacheFirst(request));
  }
});
