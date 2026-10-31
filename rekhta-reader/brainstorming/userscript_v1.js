// ==UserScript==
// @name         Rekhta Ebook API Collector
// @namespace    local.ebook.collector
// @version      1.0.0
// @description  Save ebook API responses with bkId and pgid
// @match        https://www.rekhta.org/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

(() => {
  "use strict";

  const ENDPOINT = "/EbookData/GetEbookFromApi";
  const items = [];
  let recording = false;
  let panel;

  function getIds(url) {
    try {
      const u = new URL(url, location.href);

      if (!u.pathname.includes(ENDPOINT)) return null;

      const bkId = u.searchParams.get("bkId");
      const pgid = u.searchParams.get("pgid");

      if (!bkId || !pgid) return null;

      return { bkId, pgid };
    } catch {
      return null;
    }
  }

  function save(ids, response) {
    items.push({
      bkId: ids.bkId,
      pgid: ids.pgid,
      response,
    });

    updateCount();
  }

  // Intercept fetch responses without consuming the reader's response.
  const originalFetch = window.fetch;

  window.fetch = async function (...args) {
    const request = args[0];
    const url = request instanceof Request ? request.url : String(request);
    const ids = recording ? getIds(url) : null;

    const response = await originalFetch.apply(this, args);

    if (ids) {
      response
        .clone()
        .text()
        .then((body) => save(ids, body))
        .catch((err) => console.warn("Could not capture ebook response", err));
    }

    return response;
  };

  // Intercept XMLHttpRequest responses.
  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSend = XMLHttpRequest.prototype.send;
  const xhrInfo = new WeakMap();

  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    xhrInfo.set(this, { method, url: String(url) });
    return originalOpen.call(this, method, url, ...rest);
  };

  XMLHttpRequest.prototype.send = function (...args) {
    const xhr = this;
    const info = xhrInfo.get(xhr);
    const ids = recording && info ? getIds(info.url) : null;

    if (ids) {
      xhr.addEventListener(
        "loadend",
        () => {
          try {
            const response =
              xhr.responseType === "" || xhr.responseType === "text"
                ? xhr.responseText
                : xhr.response;

            save(ids, response);
          } catch (err) {
            console.warn("Could not capture ebook response", err);
          }
        },
        { once: true },
      );
    }

    return originalSend.apply(this, args);
  };

  function download() {
    const blob = new Blob([JSON.stringify(items, null, 2)], {
      type: "application/json",
    });

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "ebook-api-responses.json";
    a.click();

    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function updateCount() {
    const count = panel?.querySelector("#count");
    if (count) count.textContent = `Captured: ${items.length}`;
  }

  function addPanel() {
    if (panel || !document.documentElement) return;

    panel = document.createElement("div");
    panel.style.cssText =
      "position:fixed;right:12px;bottom:12px;z-index:2147483647;" +
      "background:#222;color:white;padding:12px;border-radius:8px;" +
      "font:13px sans-serif;box-shadow:0 2px 8px #0008";

    panel.innerHTML = `
       <div id="count" style="margin-bottom:8px">Captured: 0</div>
       <button id="start">Start</button>
       <button id="stop">Stop</button>
       <button id="download">Download JSON</button>
     `;

    panel.querySelector("#start").onclick = () => {
      recording = true;
      updateCount();
      const totalEl = document.querySelector("span.ebookTotalPageCount");
      const total = parseInt(totalEl?.textContent.trim(), 10);

      if (!Number.isFinite(total) || total <= 0) {
        console.error("Total page count not found.");
        recording = false;
        return;
      }

      const selector =
        "#readerFooterDiv > div.container > div > a.left.pull-left.ebookprev";

      for (let index = 0; index < total; index++) {
        document.querySelector(selector)?.click();
      }

      console.log(`Triggered ${total} page clicks.`);
    };

    panel.querySelector("#stop").onclick = () => {
      recording = false;
    };

    panel.querySelector("#download").onclick = download;

    document.documentElement.appendChild(panel);
  }

  if (document.documentElement) {
    addPanel();
  } else {
    new MutationObserver((_, observer) => {
      if (document.documentElement) {
        observer.disconnect();
        addPanel();
      }
    }).observe(document, { childList: true, subtree: true });
  }
})();
