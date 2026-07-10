// Service worker (MV3). Two jobs:
//  1. CORS-bypass fetch — a background-worker fetch with host access is not
//     subject to page CORS, so THIS is our own proxy. No external service.
//  2. Route fetch requests coming from the web app (via bridge.js) and from
//     the popup (for multi-page crawl).

async function ensureHostPermission(url) {
  let origin;
  try {
    origin = new URL(url).origin + "/*";
  } catch {
    return false;
  }
  try {
    const has = await chrome.permissions.contains({ origins: [origin] });
    if (has) return true;
    // Can't prompt from the SW without a user gesture; the popup requests
    // broad access up-front, so by here we usually already have it.
    return await chrome.permissions.request({ origins: [origin] }).catch(() => false);
  } catch {
    return true; // some builds allow the fetch regardless
  }
}

async function corsBypassFetch(url) {
  await ensureHostPermission(url);
  const res = await fetch(url, { credentials: "omit", redirect: "follow" });
  if (!res.ok) throw new Error("HTTP " + res.status);
  return await res.text();
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || typeof msg !== "object") return;

  if (msg.type === "SCRAPE_FETCH") {
    corsBypassFetch(msg.url)
      .then((html) => sendResponse({ ok: true, html }))
      .catch((err) => sendResponse({ ok: false, error: err.message || String(err) }));
    return true; // async response
  }

  if (msg.type === "SCRAPE_PING") {
    sendResponse({ ok: true, version: chrome.runtime.getManifest().version });
    return false;
  }
});
