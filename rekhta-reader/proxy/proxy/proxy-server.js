#!/usr/bin/env node
/**
 * Rekhta Reader — Local Reverse Proxy
 *
 * Accepts two URL formats:
 *
 *   1. Path-based (Caddy-compatible, preferred):
 *      GET http://localhost:8888/{host}/{path}?{query}
 *      e.g. http://localhost:8888/ebooksapi.rekhta.org/api_getebookpagebyid_websiteapp/?wref=from-site&&pgid=abc
 *      → Use proxy prefix:  http://localhost:8888/{hostpath}
 *
 *   2. Query-string (legacy):
 *      GET http://localhost:8888/?url={percent-encoded-absolute-url}
 *      → Use proxy prefix:  http://localhost:8888/?url={url}
 *
 * Forwards with spoofed Referer/Origin. Adds CORS headers on the way back.
 * Requires only Node.js — no npm install needed.
 */

const http  = require("http");
const https = require("https");
const url   = require("url");

const PORT = 8888;
const ALLOWED_HOST_PATTERN = /^(?:[\w-]+\.)*rekhta\.org(?::\d+)?$/i;

const server = http.createServer((req, res) => {
  // ── CORS pre-flight ──────────────────────────────────────────────────────
  res.setHeader("Access-Control-Allow-Origin",  "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Accept");
  res.setHeader("Access-Control-Max-Age",       "86400");

  if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }
  if (req.method !== "GET")     { res.writeHead(405); res.end("Method Not Allowed"); return; }

  // ── Resolve target URL ────────────────────────────────────────────────────
  let targetUrl;
  const parsed = url.parse(req.url, true);

  if (parsed.query.url) {
    // Format 2: /?url={encoded}
    try {
      targetUrl = new URL(decodeURIComponent(parsed.query.url));
    } catch (e) {
      res.writeHead(400, { "Content-Type": "text/plain" });
      res.end("Bad ?url= value: " + e.message);
      return;
    }
  } else if (parsed.pathname && parsed.pathname !== "/") {
    // Format 1: /{host}/{path}?{query}
    // pathname starts with "/hostname/rest" — strip the leading slash
    const withoutLeadingSlash = parsed.pathname.replace(/^\//, "");
    const firstSlash = withoutLeadingSlash.indexOf("/");
    const host  = firstSlash === -1 ? withoutLeadingSlash : withoutLeadingSlash.slice(0, firstSlash);
    const ppath = firstSlash === -1 ? "/"                 : withoutLeadingSlash.slice(firstSlash);
    const qs    = parsed.search || "";
    try {
      targetUrl = new URL(`https://${host}${ppath}${qs}`);
    } catch (e) {
      res.writeHead(400, { "Content-Type": "text/plain" });
      res.end("Bad path-based URL: " + e.message);
      return;
    }
  } else {
    // Health check
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end(
      "Rekhta Reader local proxy is running on port " + PORT + ".\n\n" +
      "Path-based format (for Caddy-style proxy prefix):\n" +
      "  Proxy prefix : http://localhost:" + PORT + "/{hostpath}\n" +
      "  Example req  : http://localhost:" + PORT + "/ebooksapi.rekhta.org/api_getebookpagebyid_websiteapp/?pgid=abc\n\n" +
      "Query-string format (legacy):\n" +
      "  Proxy prefix : http://localhost:" + PORT + "/?url={url}\n"
    );
    return;
  }

  // ── Safety: only allow rekhta.org hosts ──────────────────────────────────
  if (!ALLOWED_HOST_PATTERN.test(targetUrl.host)) {
    res.writeHead(403, { "Content-Type": "text/plain" });
    res.end("Forbidden: only *.rekhta.org targets are allowed. Got: " + targetUrl.host);
    return;
  }

  // ── Forward ───────────────────────────────────────────────────────────────
  const lib     = targetUrl.protocol === "http:" ? http : https;
  const options = {
    hostname: targetUrl.hostname,
    port:     targetUrl.port || (targetUrl.protocol === "http:" ? 80 : 443),
    path:     targetUrl.pathname + (targetUrl.search || ""),
    method:   "GET",
    headers: {
      "Accept":          req.headers["accept"] || "*/*",
      "Accept-Encoding": "identity",
      "Host":            targetUrl.hostname,
      "Origin":          "https://www.rekhta.org",
      "Referer":         "https://www.rekhta.org/",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
        "AppleWebKit/537.36 (KHTML, like Gecko) " +
        "Chrome/125.0.0.0 Safari/537.36",
    },
  };

  console.log("[proxy]", targetUrl.href);

  const proxyReq = lib.request(options, (proxyRes) => {
    const passHeaders = {};
    for (const [k, v] of Object.entries(proxyRes.headers)) {
      const lower = k.toLowerCase();
      if ([
        "transfer-encoding", "connection", "keep-alive",
        "proxy-authenticate", "proxy-authorization",
        "te", "trailer", "upgrade",
        "access-control-allow-origin",
        "access-control-allow-headers",
        "access-control-allow-methods",
      ].includes(lower)) continue;
      passHeaders[k] = v;
    }
    passHeaders["Access-Control-Allow-Origin"]  = "*";
    passHeaders["Access-Control-Allow-Methods"] = "GET, OPTIONS";
    passHeaders["Access-Control-Allow-Headers"] = "Content-Type, Accept";

    res.writeHead(proxyRes.statusCode, passHeaders);
    proxyRes.pipe(res, { end: true });
  });

  proxyReq.on("error", (err) => {
    console.error("[proxy error]", err.message);
    if (!res.headersSent) res.writeHead(502, { "Content-Type": "text/plain" });
    res.end("Proxy error: " + err.message);
  });

  proxyReq.setTimeout(30000, () => proxyReq.destroy(new Error("upstream timeout")));
  proxyReq.end();
});

server.listen(PORT, "127.0.0.1", () => {
  console.log("");
  console.log("==============================================");
  console.log("  Rekhta Reader Local Proxy — port " + PORT);
  console.log("");
  console.log("  Proxy prefix to use in the webapp:");
  console.log("  http://localhost:" + PORT + "/{hostpath}");
  console.log("==============================================");
  console.log("");
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error("Port " + PORT + " is already in use. Kill the other process or edit PORT.");
  } else {
    console.error(err);
  }
  process.exit(1);
});

/**
 * Rekhta Reader — Local Reverse Proxy
 *
 * Accepts: GET http://localhost:8888/?url=<percent-encoded-absolute-url>
 * Forwards the request to the encoded URL, spoofing Referer/Origin so
 * Rekhta's API servers accept it, then streams the response back to the
 * browser with full CORS headers so no extension is needed.
 *
 * Works for:
 *   - manifest HTML  (www.rekhta.org/ebooks/…)
 *   - page-key JSON  (ebooksapi.rekhta.org/api_getebookpagebyid_websiteapp/…)
 *   - page images    (ebooksapi.rekhta.org/images/…)
 *   - search HTML    (www.rekhta.org/CollectionSearchLoading?…)
 *
 * Requires only Node.js — no npm install needed.
 */

const http  = require("http");
const https = require("https");
const url   = require("url");

const PORT = 8888;

const server = http.createServer((req, res) => {
  // ── CORS pre-flight ──────────────────────────────────────────────────────
  res.setHeader("Access-Control-Allow-Origin",  "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Accept");
  res.setHeader("Access-Control-Max-Age",       "86400");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method !== "GET") {
    res.writeHead(405);
    res.end("Method Not Allowed");
    return;
  }

  // ── Health check ─────────────────────────────────────────────────────────
  const parsed    = url.parse(req.url, true);
  const targetRaw = parsed.query.url;

  if (!targetRaw) {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end(
      "Rekhta Reader local proxy is running.\n" +
      "Usage: http://localhost:" + PORT + "/?url=<percent-encoded-url>\n"
    );
    return;
  }

  // ── Decode target URL ─────────────────────────────────────────────────────
  let targetUrl;
  try {
    targetUrl = decodeURIComponent(targetRaw);
    // Basic safety: only allow http(s) and only rekhta domains
    const t = new URL(targetUrl);
    if (!["http:", "https:"].includes(t.protocol)) throw new Error("bad protocol");
    if (!/rekhta\.org$/i.test(t.hostname)) throw new Error("non-rekhta host: " + t.hostname);
  } catch (err) {
    res.writeHead(400, { "Content-Type": "text/plain" });
    res.end("Bad target URL: " + err.message);
    return;
  }

  // ── Forward the request ───────────────────────────────────────────────────
  const targetParsed  = new URL(targetUrl);
  const isHttps       = targetParsed.protocol === "https:";
  const lib           = isHttps ? https : http;
  const defaultPort   = isHttps ? 443 : 80;

  const options = {
    hostname: targetParsed.hostname,
    port:     targetParsed.port || defaultPort,
    path:     targetParsed.pathname + (targetParsed.search || ""),
    method:   "GET",
    headers: {
      "Accept":          req.headers["accept"] || "*/*",
      "Accept-Encoding": "identity",          // avoid compressed response complexity
      "Host":            targetParsed.hostname,
      "Origin":          "https://www.rekhta.org",
      "Referer":         "https://www.rekhta.org/",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
        "AppleWebKit/537.36 (KHTML, like Gecko) " +
        "Chrome/125.0.0.0 Safari/537.36",
    },
  };

  console.log("[proxy]", targetUrl);

  const proxyReq = lib.request(options, (proxyRes) => {
    // Strip hop-by-hop headers, inject CORS
    const passHeaders = {};
    for (const [k, v] of Object.entries(proxyRes.headers)) {
      const lower = k.toLowerCase();
      if ([
        "transfer-encoding", "connection", "keep-alive",
        "proxy-authenticate", "proxy-authorization",
        "te", "trailer", "upgrade",
        // Remove upstream CORS restrictions — we add our own
        "access-control-allow-origin",
        "access-control-allow-headers",
        "access-control-allow-methods",
      ].includes(lower)) continue;
      passHeaders[k] = v;
    }

    passHeaders["Access-Control-Allow-Origin"]  = "*";
    passHeaders["Access-Control-Allow-Methods"] = "GET, OPTIONS";
    passHeaders["Access-Control-Allow-Headers"] = "Content-Type, Accept";

    res.writeHead(proxyRes.statusCode, passHeaders);
    proxyRes.pipe(res, { end: true });
  });

  proxyReq.on("error", (err) => {
    console.error("[proxy error]", err.message);
    if (!res.headersSent) {
      res.writeHead(502, { "Content-Type": "text/plain" });
    }
    res.end("Proxy error: " + err.message);
  });

  proxyReq.setTimeout(30000, () => {
    proxyReq.destroy(new Error("upstream timeout"));
  });

  proxyReq.end();
});

server.listen(PORT, "127.0.0.1", () => {
  console.log("");
  console.log("==============================================");
  console.log("  Rekhta Reader Local Proxy running");
  console.log("  Listening on: http://localhost:" + PORT);
  console.log("");
  console.log("  In the webapp, set Proxy prefix to:");
  console.log("  http://localhost:" + PORT + "/?url={url}");
  console.log("==============================================");
  console.log("");
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error("Port " + PORT + " is already in use.");
    console.error("Kill the other process or edit PORT at the top of this file.");
  } else {
    console.error(err);
  }
  process.exit(1);
});
