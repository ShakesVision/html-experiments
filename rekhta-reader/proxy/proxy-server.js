#!/usr/bin/env node
/**
 * Rekhta Reader — Local Reverse Proxy (v2: cookie jar + cache + throttle)
 *
 * GET  /?url=<encoded-url>   forward (with cache / throttle for Rekhta)
 * POST /bundle               import a key bundle captured by the userscript
 * GET  /bundle?bookId=…      return a saved bundle (or ?slug=…)
 * GET  /status               throttle / cache status
 *
 * Why: Rekhta enforces `X-Ebook-Throttle` per identity. Requests carrying the
 * site's session cookie get bucket "c" (150/window); cookieless requests fall
 * into bucket "i" (per IP, 20/window). This proxy keeps a cookie jar, mimics
 * same-origin browser headers, serialises API calls, honours Retry-After and
 * caches keys/images on disk so the same page is never fetched twice.
 *
 * Env: PORT, REKHTA_COOKIE ("name=value; name2=value2" copied from browser),
 *      REKHTA_MIN_INTERVAL_MS (default 1500)
 * Requires only Node.js 18+.
 */

const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");

const PORT = Number(process.env.PORT || 8888);
const MIN_INTERVAL_MS = Number(process.env.REKHTA_MIN_INTERVAL_MS || 1500);
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36";

const CACHE_DIR = path.join(__dirname, "cache");
const KEYS_DIR = path.join(CACHE_DIR, "keys");
const IMAGES_DIR = path.join(CACHE_DIR, "images");
const BUNDLES_DIR = path.join(CACHE_DIR, "bundles");
const COOKIE_FILE = path.join(CACHE_DIR, "cookies.json");
for (const d of [KEYS_DIR, IMAGES_DIR, BUNDLES_DIR]) fs.mkdirSync(d, { recursive: true });

// ── Cookie jar ────────────────────────────────────────────────────────────
const cookieJar = new Map();
try {
  for (const [k, v] of Object.entries(JSON.parse(fs.readFileSync(COOKIE_FILE, "utf8")))) cookieJar.set(k, v);
} catch {}
if (process.env.REKHTA_COOKIE) {
  for (const part of process.env.REKHTA_COOKIE.split(";")) {
    const i = part.indexOf("=");
    if (i > 0) cookieJar.set(part.slice(0, i).trim(), part.slice(i + 1).trim());
  }
}
function storeSetCookie(headers) {
  const list = headers["set-cookie"];
  if (!list) return;
  for (const c of [].concat(list)) {
    const [pair] = c.split(";");
    const i = pair.indexOf("=");
    if (i > 0) cookieJar.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim());
  }
  fs.writeFileSync(COOKIE_FILE, JSON.stringify(Object.fromEntries(cookieJar), null, 2));
}
const cookieHeader = () => [...cookieJar].map(([k, v]) => `${k}=${v}`).join("; ");

// ── Throttle state (global, shared by every client of this proxy) ────────
let queue = Promise.resolve();
let nextSlotAt = 0;
let blockedUntil = 0;
let lastThrottle = null;

function throttled(task) {
  const run = queue.then(async () => {
    const wait = Math.max(0, nextSlotAt - Date.now());
    if (wait) await new Promise((r) => setTimeout(r, wait));
    try {
      return await task();
    } finally {
      nextSlotAt = Date.now() + MIN_INTERVAL_MS;
    }
  });
  queue = run.catch(() => {});
  return run;
}

// ── Disk cache helpers ────────────────────────────────────────────────────
const safe = (s) => String(s || "").replace(/[^a-zA-Z0-9._-]/g, "_");
const keyPath = (pageId) => path.join(KEYS_DIR, safe(pageId) + ".json");
const imagePath = (u) => {
  const m = u.pathname.match(/\/images\/([^/]+)\/(.+)$/);
  return m ? path.join(IMAGES_DIR, safe(m[1]), safe(decodeURIComponent(m[2]))) : null;
};
function readJson(p) {
  try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; }
}
function findBundle({ bookId, slug }) {
  if (bookId) return readJson(path.join(BUNDLES_DIR, safe(bookId) + ".json"));
  if (slug) {
    const index = readJson(path.join(BUNDLES_DIR, "_slugs.json")) || {};
    if (index[slug]) return readJson(path.join(BUNDLES_DIR, safe(index[slug]) + ".json"));
  }
  return null;
}
function mergeArrays(a = [], b = []) {
  const len = Math.max(a.length, b.length);
  return Array.from({ length: len }, (_, i) => b[i] || a[i] || "");
}
function saveBundle(bundle) {
  if (!bundle?.bookId) throw new Error("bundle.bookId missing");
  const existing = findBundle({ bookId: bundle.bookId }) || {};
  const merged = {
    ...existing,
    ...bundle,
    pageIds: mergeArrays(existing.pageIds, bundle.pageIds),
    pages: mergeArrays(existing.pages, bundle.pages),
    keys: { ...(existing.keys || {}), ...(bundle.keys || {}) },
  };
  for (const [pageId, key] of Object.entries(merged.keys)) {
    if (Array.isArray(key?.Sub) && key.Sub.length) fs.writeFileSync(keyPath(pageId), JSON.stringify(key));
  }
  fs.writeFileSync(path.join(BUNDLES_DIR, safe(bundle.bookId) + ".json"), JSON.stringify(merged));
  if (bundle.slug) {
    const p = path.join(BUNDLES_DIR, "_slugs.json");
    const index = readJson(p) || {};
    index[bundle.slug] = bundle.bookId;
    fs.writeFileSync(p, JSON.stringify(index, null, 2));
  }
  return merged;
}

// ── Upstream request ─────────────────────────────────────────────────────
function upstream(targetUrl, { accept, referer } = {}) {
  return new Promise((resolve, reject) => {
    const t = new URL(targetUrl);
    const isRekhta = /(^|\.)rekhta\.org$/i.test(t.hostname);
    const headers = {
      Accept: accept || "*/*",
      "Accept-Language": "en-US,en;q=0.9",
      "Accept-Encoding": "identity",
      "User-Agent": UA,
      "sec-ch-ua": '"Google Chrome";v="155", "Chromium";v="155", "Not(A:Brand";v="24"',
      "sec-ch-ua-mobile": "?0",
      "sec-ch-ua-platform": '"Windows"',
    };
    if (isRekhta) {
      // Same-origin GETs carry no Origin header — don't fake one.
      headers.Referer = referer || "https://www.rekhta.org/";
      const ck = cookieHeader();
      if (ck) headers.Cookie = ck;
      if (t.pathname.startsWith("/EbookData/")) {
        headers["X-Requested-With"] = "XMLHttpRequest";
        headers["Sec-Fetch-Dest"] = "empty";
        headers["Sec-Fetch-Mode"] = "cors";
        headers["Sec-Fetch-Site"] = "same-origin";
      } else if (t.pathname.startsWith("/images/")) {
        headers["Sec-Fetch-Dest"] = "image";
        headers["Sec-Fetch-Mode"] = "no-cors";
        headers["Sec-Fetch-Site"] = "same-site";
      } else {
        headers["Sec-Fetch-Dest"] = "document";
        headers["Sec-Fetch-Mode"] = "navigate";
        headers["Sec-Fetch-Site"] = "same-origin";
      }
    }
    const lib = t.protocol === "https:" ? https : http;
    const req = lib.request(
      { hostname: t.hostname, port: t.port || (t.protocol === "https:" ? 443 : 80), path: t.pathname + t.search, method: "GET", headers },
      (res) => {
        if (isRekhta) storeSetCookie(res.headers);
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
        res.on("error", reject);
      },
    );
    req.on("error", reject);
    req.setTimeout(45000, () => req.destroy(new Error("upstream timeout")));
    req.end();
  });
}

// Obtain a site session before hitting the API (moves us to bucket "c").
let warmed = cookieJar.size > 0;
async function warmUp(referer) {
  if (warmed) return;
  warmed = true;
  try {
    await upstream(referer || "https://www.rekhta.org/", { accept: "text/html" });
    console.log("[proxy] session warm-up done, cookies:", [...cookieJar.keys()].join(", ") || "(none)");
  } catch (e) {
    console.warn("[proxy] warm-up failed", e.message);
  }
}

function noteThrottle(url, r) {
  const h = r.headers;
  if (h["x-ebook-throttle"]) {
    lastThrottle = { at: new Date().toISOString(), url, status: r.status, throttle: h["x-ebook-throttle"], key: h["x-ebook-throttle-key"], coverage: h["x-ebook-coverage"] };
    console.log("[proxy] throttle", lastThrottle.status, lastThrottle.throttle, "key=" + lastThrottle.key, lastThrottle.coverage ? "coverage=" + lastThrottle.coverage : "");
  }
  if (r.status === 429) {
    const ra = Number(h["retry-after"]) || 60;
    blockedUntil = Date.now() + ra * 1000;
    console.warn(`[proxy] 429 — pausing all Rekhta calls for ${ra}s (bucket ${h["x-ebook-throttle-key"] || "?"})`);
  }
}

// ── HTTP server ───────────────────────────────────────────────────────────
function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Accept, X-Requested-With");
  res.setHeader("Access-Control-Expose-Headers", "Retry-After, X-Proxy-Cache, X-Ebook-Throttle, X-Ebook-Throttle-Key");
  res.setHeader("Access-Control-Allow-Private-Network", "true");
}
function send(res, status, body, headers = {}) {
  res.writeHead(status, headers);
  res.end(body);
}
const sendJson = (res, status, obj, extra = {}) =>
  send(res, status, JSON.stringify(obj), { "Content-Type": "application/json; charset=utf-8", ...extra });

const server = http.createServer(async (req, res) => {
  cors(res);
  if (req.method === "OPTIONS") return send(res, 204, "");
  const reqUrl = new URL(req.url, `http://localhost:${PORT}`);

  try {
    if (reqUrl.pathname === "/bundle" && req.method === "POST") {
      const chunks = [];
      for await (const c of req) chunks.push(c);
      const merged = saveBundle(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      console.log(`[proxy] bundle saved ${merged.bookId}: ${Object.keys(merged.keys).length} keys`);
      return sendJson(res, 200, { ok: true, bookId: merged.bookId, keys: Object.keys(merged.keys).length });
    }
    if (reqUrl.pathname === "/bundle") {
      const b = findBundle({ bookId: reqUrl.searchParams.get("bookId"), slug: reqUrl.searchParams.get("slug") });
      return b ? sendJson(res, 200, b) : sendJson(res, 404, { error: "no bundle" });
    }
    if (reqUrl.pathname === "/status") {
      return sendJson(res, 200, { blockedForSec: Math.max(0, Math.ceil((blockedUntil - Date.now()) / 1000)), lastThrottle, cookies: [...cookieJar.keys()] });
    }
    if (req.method !== "GET") return send(res, 405, "Method Not Allowed");

    const raw = reqUrl.searchParams.get("url");
    if (!raw) return send(res, 200, `Rekhta proxy v2 running. Usage: http://localhost:${PORT}/?url=<encoded-url>\n`, { "Content-Type": "text/plain" });

    let target;
    try {
      target = new URL(raw);
      if (!["http:", "https:"].includes(target.protocol)) throw new Error("bad protocol");
    } catch (e) {
      return send(res, 400, "Bad target URL: " + e.message);
    }

    const isApi = /(^|\.)rekhta\.org$/i.test(target.hostname) && target.pathname.startsWith("/EbookData/");
    const isKey = isApi && /GetEbookFromApi/i.test(target.pathname);
    const isIds = isApi && /GetEbookPageIds/i.test(target.pathname);
    const isImage = /ebooksapi\.rekhta\.org$/i.test(target.hostname) && target.pathname.startsWith("/images/");

    // 1) Page keys from cache (keys are immutable: Rekhta sends max-age=1y)
    if (isKey) {
      const cached = readJson(keyPath(target.searchParams.get("pgid")));
      if (cached) return sendJson(res, 200, cached, { "X-Proxy-Cache": "HIT" });
    }
    // 2) Page-ID windows from a saved bundle
    if (isIds) {
      const b = findBundle({ slug: target.searchParams.get("slug") });
      const all = b?.pageIds || [];
      const from = Number(target.searchParams.get("from") || 0);
      const count = Number(target.searchParams.get("count") || 10);
      const ids = all.slice(from, from + count);
      if (ids.length && ids.every(Boolean) && (ids.length === count || from + ids.length >= all.length)) {
        return sendJson(res, 200, { from, ids }, { "X-Proxy-Cache": "HIT" });
      }
    }
    // 3) Images from cache
    const imgFile = isImage ? imagePath(target) : null;
    if (imgFile && fs.existsSync(imgFile)) {
      return send(res, 200, fs.readFileSync(imgFile), { "Content-Type": "image/jpeg", "X-Proxy-Cache": "HIT", "Cache-Control": "max-age=31536000" });
    }

    // While Rekhta has us blocked, answer locally — hammering only extends the ban.
    if (isApi && Date.now() < blockedUntil) {
      const ra = Math.ceil((blockedUntil - Date.now()) / 1000);
      return send(res, 429, `Rate-limited by Rekhta; retry in ${ra}s`, { "Retry-After": String(ra), "Content-Type": "text/plain" });
    }

    const slug = target.searchParams.get("slug");
    const referer = slug ? `https://www.rekhta.org/ebooks/${slug}?lang=ur` : "https://www.rekhta.org/";
    const doFetch = async () => {
      if (isApi) await warmUp(referer);
      return upstream(target.href, { accept: req.headers.accept, referer });
    };
    const r = isApi ? await throttled(doFetch) : await doFetch();
    if (isApi || isImage) noteThrottle(target.href, r);

    if (r.status === 200 && isKey) {
      try {
        let key = JSON.parse(r.body.toString("utf8"));
        if (typeof key === "string") key = JSON.parse(key);
        if (Array.isArray(key?.Sub) && key.Sub.length) fs.writeFileSync(keyPath(target.searchParams.get("pgid")), JSON.stringify(key));
      } catch {}
    }
    if (r.status === 200 && imgFile && r.body.length > 1000) {
      fs.mkdirSync(path.dirname(imgFile), { recursive: true });
      fs.writeFileSync(imgFile, r.body);
    }

    const pass = {};
    for (const [k, v] of Object.entries(r.headers)) {
      if (/^(transfer-encoding|connection|keep-alive|set-cookie|content-length|content-encoding|access-control-.*)$/i.test(k)) continue;
      pass[k] = v;
    }
    pass["X-Proxy-Cache"] = "MISS";
    send(res, r.status, r.body, pass);
  } catch (err) {
    console.error("[proxy error]", err.message);
    if (!res.headersSent) send(res, 502, "Proxy error: " + err.message);
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`\n  Rekhta proxy v2 on http://localhost:${PORT}  (prefix: http://localhost:${PORT}/?url={url})`);
  console.log(`  Cache: ${CACHE_DIR}`);
  console.log(`  Cookies loaded: ${cookieJar.size}${process.env.REKHTA_COOKIE ? " (incl. REKHTA_COOKIE)" : ""}\n`);
});
server.on("error", (err) => {
  console.error(err.code === "EADDRINUSE" ? `Port ${PORT} already in use.` : err);
  process.exit(1);
});
