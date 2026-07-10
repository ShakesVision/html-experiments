// Transport layer. Picks the best available way to get a page's HTML so the
// app has NO hard external dependency: our own extension (or a Capacitor
// native bridge) removes CORS; a user proxy or direct fetch are fallbacks.
// Browser/extension-only at runtime — pure helpers (buildProxyUrl,
// detectTransport) are exported for testing.

export { buildProxyUrl, detectTransport, parseHtml, fetchHtml };

// Marker the extension's bridge content-script sets on our own pages so the
// web app knows it can route CORS-bypass fetches through the extension.
const EXTENSION_FLAG = "__scraperExtensionBridge";

function buildProxyUrl(targetUrl, proxy) {
  const p = (proxy || "").trim();
  if (!p) return targetUrl;
  if (p.includes("{url}")) return p.replace("{url}", encodeURIComponent(targetUrl));
  return p + encodeURIComponent(targetUrl);
}

// Decide the transport from the environment + user settings. `env` is
// injectable for tests: { capacitor, extension, proxy }.
function detectTransport(env = {}) {
  const capacitor = env.capacitor
    ?? (typeof window !== "undefined" && window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
  if (capacitor) return "capacitor";

  const extension = env.extension
    ?? (typeof window !== "undefined" && !!window[EXTENSION_FLAG]);
  if (extension) return "extension";

  if ((env.proxy || "").trim()) return "proxy";
  return "direct";
}

function parseHtml(html) {
  const parser = new DOMParser();
  return parser.parseFromString(html || "", "text/html");
}

// Common proxy/JSON envelopes: raw HTML, or { res | contents } JSON.
function unwrap(text) {
  try {
    const j = JSON.parse(text);
    if (j && typeof j === "object") {
      if (j.error) throw new Error(j.error);
      return j.res || j.contents || j.html || text;
    }
  } catch (e) {
    if (e.message && !e.message.startsWith("Unexpected")) throw e;
  }
  return text;
}

// Resolve to an HTML string. `opts`: { proxy, transport?, requestViaExtension? }.
// - capacitor: CapacitorHttp native GET (bypasses CORS on Android)
// - extension: ask our background service worker to fetch (bypasses CORS)
// - proxy / direct: plain fetch, optionally through the user's proxy
async function fetchHtml(targetUrl, opts = {}) {
  const transport = opts.transport || detectTransport({ proxy: opts.proxy });

  if (transport === "capacitor" && typeof window !== "undefined" && window.CapacitorHttp) {
    const res = await window.CapacitorHttp.get({ url: targetUrl });
    return typeof res.data === "string" ? res.data : String(res.data ?? "");
  }

  if (transport === "extension" && typeof opts.requestViaExtension === "function") {
    return unwrap(await opts.requestViaExtension(targetUrl));
  }

  const url = transport === "proxy" ? buildProxyUrl(targetUrl, opts.proxy) : targetUrl;
  const res = await fetch(url, { credentials: "omit" });
  if (!res.ok) throw new Error("HTTP " + res.status);
  return unwrap(await res.text());
}
