#!/usr/bin/env node
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

const PORT = Number(process.env.PORT || 8888);

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
    const t = new URL(targetUrl);
    console.log("[proxy] incoming request", {
      raw: targetRaw,
      decoded: targetUrl,
      host: t.hostname,
      pathname: t.pathname,
    });

    // Allow arbitrary HTTP(S) targets for local debugging and normal browser
    // proxy use; we are running this on a private machine, not as a public
    // internet service. The browser app itself decides whether the response is
    // valid for Rekhta.
    if (!["http:", "https:"].includes(t.protocol)) {
      throw new Error("bad protocol");
    }
  } catch (err) {
    console.error("[proxy] bad target URL", { targetRaw, error: err.message });
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
    console.log("[proxy] upstream response", {
      targetUrl,
      statusCode: proxyRes.statusCode,
      contentType: proxyRes.headers["content-type"],
      headers: proxyRes.headers,
    });

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
