// Runs on the Scrape web app's own pages. Lets the web app borrow the
// extension's CORS-bypass fetch: the page talks to us over window.postMessage,
// we relay to the background worker and post the result back. This is what
// flips the web app's transport from "direct" to "extension".

window.addEventListener("message", (event) => {
  if (event.source !== window) return;
  const msg = event.data;
  if (!msg || typeof msg !== "object") return;

  if (msg.type === "SCRAPER_PING") {
    window.postMessage({ type: "SCRAPER_PONG" }, "*");
    return;
  }

  if (msg.type === "SCRAPER_FETCH" && msg.url && msg.id) {
    chrome.runtime.sendMessage({ type: "SCRAPE_FETCH", url: msg.url }, (res) => {
      const err = chrome.runtime.lastError;
      if (err || !res || !res.ok) {
        window.postMessage(
          { type: "SCRAPER_FETCH_RESULT", id: msg.id, error: (err && err.message) || (res && res.error) || "fetch failed" },
          "*",
        );
      } else {
        window.postMessage({ type: "SCRAPER_FETCH_RESULT", id: msg.id, html: res.html }, "*");
      }
    });
  }
});

// Proactively announce, in case the app loaded before us.
window.postMessage({ type: "SCRAPER_PONG" }, "*");
