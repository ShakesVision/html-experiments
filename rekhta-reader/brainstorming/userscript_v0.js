// ==UserScript==
// @name         Rekhta Ebook API Collector
// @namespace    local.ebook.collector
// @version      1.1.0
// @description  Deduplicated, page-aware ebook capture with bounded retries for missing pages
// @match        https://www.rekhta.org/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

(() => {
  "use strict";

  const ENDPOINT = "/EbookData/GetEbookFromApi";
  const MAX_PAGE_ATTEMPTS = 3;
  const MAX_CAPTURE_SWEEPS = 3;
  const PAGE_POLL_MS = 250;
  const items = [];
  const seenKeys = new Set();
  const invalidPages = new Map();
  let recording = false;
  let panel;
  let captureState = null;

  function readText(value) {
    if (value === null || value === undefined) return "";
    if (typeof value === "string") return value;
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }

  function isBogusValue(value) {
    const text = String(value ?? "")
      .trim()
      .toLowerCase();
    return !text || ["undefined", "null", "nan"].includes(text);
  }

  function getIds(url) {
    try {
      const u = new URL(url, location.href);

      if (!u.pathname.includes(ENDPOINT)) return null;

      const bkId = u.searchParams.get("bkId");
      const pgid = u.searchParams.get("pgid");

      if (!bkId || !pgid) return null;

      return { bkId: bkId.trim(), pgid: pgid.trim() };
    } catch {
      return null;
    }
  }

  function getRecordKey(ids) {
    if (!ids) return "missing";
    return `${String(ids.bkId ?? "").trim()}::${String(ids.pgid ?? "").trim()}`;
  }

  function isValidRecord(ids, response) {
    if (!ids) return false;

    const bkId = String(ids.bkId ?? "").trim();
    const pgid = String(ids.pgid ?? "").trim();

    if (isBogusValue(bkId) || isBogusValue(pgid)) return false;

    const body = readText(response).trim();
    if (!body || body === "undefined" || body === "null") return false;

    const lower = body.toLowerCase();
    if (lower.includes("undefined") && !lower.includes('"undefined"')) {
      return false;
    }

    return true;
  }

  function updateStatus(message) {
    const status = panel?.querySelector("#status");
    if (status && message) status.textContent = message;
  }

  function updateCount() {
    const count = panel?.querySelector("#count");
    if (count) count.textContent = `Captured: ${items.length}`;
  }

  function save(ids, response) {
    if (!recording || !ids) return;

    const key = getRecordKey(ids);

    if (!isValidRecord(ids, response)) {
      const previous = invalidPages.get(key) || { attempts: 0 };
      previous.attempts += 1;
      previous.lastSeen = Date.now();
      invalidPages.set(key, previous);
      updateStatus(
        `Missing/invalid pages: ${invalidPages.size} • retries: ${previous.attempts}/${MAX_PAGE_ATTEMPTS}`,
      );
      return;
    }

    if (seenKeys.has(key)) return;

    seenKeys.add(key);
    items.push({
      bkId: ids.bkId,
      pgid: ids.pgid,
      response,
    });

    invalidPages.delete(key);
    updateCount();
    updateStatus(
      `Captured ${items.length}/${captureState?.totalPages ?? "?"} valid pages`,
    );
  }

  function readTotalPageCount() {
    const selectors = [
      "span.ebookTotalPageCount",
      ".ebookTotalPageCount",
      "#ebookTotalPageCount",
      "span.total-page-count",
      "[data-total-pages]",
    ];

    for (const selector of selectors) {
      const el = document.querySelector(selector);
      if (!el) continue;

      const text = (el.textContent || "").trim();
      const match = text.match(/(\d+)/);
      if (match) {
        const total = Number.parseInt(match[1], 10);
        if (Number.isFinite(total) && total > 0) return total;
      }
    }

    return 0;
  }

  function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function getCurrentPageNumber() {
    const selectors = [
      ".ebookCurrentPage",
      "#ebookCurrentPage",
      "span.currentPage",
      "input.currentPage",
      ".current-page",
      "[data-current-page]",
    ];

    for (const selector of selectors) {
      const el = document.querySelector(selector);
      if (!el) continue;
      const text = (el.textContent || el.value || "").trim();
      const match = text.match(/\d+/);
      if (match) return Number.parseInt(match[0], 10);
    }

    return NaN;
  }

  function findNavigation(direction) {
    const selectors = [
      `#readerFooterDiv a.${direction === "next" ? "ebooknext" : "ebookprev"}`,
      `#readerFooterDiv .${direction === "next" ? "ebooknext" : "ebookprev"}`,
      `a.${direction === "next" ? "ebooknext" : "ebookprev"}`,
      `.${direction === "next" ? "ebooknext" : "ebookprev"}`,
      `#readerFooterDiv a.${direction === "next" ? "next" : "prev"}`,
      `a.${direction === "next" ? "next" : "prev"}`,
    ];

    for (const selector of selectors) {
      const el = document.querySelector(selector);
      if (el) return el;
    }

    const all = Array.from(document.querySelectorAll("a,button"));
    const haystack =
      direction === "next"
        ? ["next", "nextpage", ">", "›", "right"]
        : ["prev", "previous", "back", "<", "‹", "left"];

    for (const el of all) {
      const label = (
        el.textContent ||
        el.getAttribute("title") ||
        ""
      ).toLowerCase();
      if (haystack.some((part) => label.includes(part))) {
        return el;
      }
    }

    return null;
  }

  async function clickNavigation(direction) {
    const nav = findNavigation(direction);
    if (!nav) return false;
    nav.click();
    await wait(PAGE_POLL_MS);
    return true;
  }

  async function goToPage(targetPage) {
    const total = captureState?.totalPages || targetPage;
    let current = getCurrentPageNumber();
    let safety = total * 4;

    while (
      recording &&
      Number.isFinite(current) &&
      current < targetPage &&
      safety-- > 0
    ) {
      await clickNavigation("next");
      current = getCurrentPageNumber();
    }

    while (
      recording &&
      Number.isFinite(current) &&
      current > targetPage &&
      safety-- > 0
    ) {
      await clickNavigation("prev");
      current = getCurrentPageNumber();
    }

    if (!Number.isFinite(current) && targetPage === 1) {
      const firstButton = findNavigation("prev");
      if (firstButton) {
        const currentUrl = location.href;
        for (let index = 0; index < total * 2; index++) {
          if (!recording) break;
          firstButton.click();
          await wait(PAGE_POLL_MS);
          if (location.href !== currentUrl && getCurrentPageNumber() === 1)
            break;
        }
      }
    }
  }

  async function sweepPages() {
    const total = captureState?.totalPages || 0;
    if (!total) return;

    for (let page = 1; page <= total; page++) {
      if (!recording) return;
      await goToPage(page);
      await wait(PAGE_POLL_MS * 2);
    }
  }

  function getUnresolvedPages() {
    const keys = Array.from(invalidPages.keys()).filter(
      (key) => key && key !== "missing",
    );
    return keys.length ? keys : ["No invalid pages recorded"];
  }

  async function runCaptureLoop() {
    if (!recording || !captureState) return;

    captureState.round += 1;
    const totalPages = captureState.totalPages;

    updateStatus(
      `Sweep ${captureState.round}/${captureState.maxSweeps} — collecting ${totalPages} pages`,
    );

    await goToPage(1);
    await sweepPages();

    const validReached = items.length >= totalPages;
    if (validReached) {
      updateStatus(
        `Capture complete: ${items.length}/${totalPages} valid pages`,
      );
      console.log(
        `Capture complete: ${items.length}/${totalPages} valid pages`,
      );
      recording = false;
      return;
    }

    const unresolved = getUnresolvedPages();
    if (captureState.round >= captureState.maxSweeps) {
      updateStatus(
        `Stopped after ${captureState.round} sweeps. Unresolved: ${unresolved.length}`,
      );
      console.warn(
        "Unresolved or invalid pages after bounded retries:",
        unresolved,
      );
      recording = false;
      return;
    }

    if (invalidPages.size > 0 || items.length < totalPages) {
      updateStatus(
        `Retrying missing pages (${captureState.round + 1}/${captureState.maxSweeps})`,
      );
      console.warn(
        `Retrying missing pages. Valid=${items.length}, total=${totalPages}, invalid=${invalidPages.size}`,
      );
      await wait(400);
      await runCaptureLoop();
    }
  }

  function download() {
    const payload = items.map((entry) => ({
      bkId: entry.bkId,
      pgid: entry.pgid,
      response: entry.response,
    }));

    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "ebook-api-responses.json";
    a.click();

    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function startCapture() {
    const total = readTotalPageCount();
    if (!Number.isFinite(total) || total <= 0) {
      console.error("Total page count not found or invalid.");
      recording = false;
      updateStatus("Page count not found");
      return;
    }

    captureState = {
      totalPages: total,
      round: 0,
      maxSweeps: MAX_CAPTURE_SWEEPS,
    };

    recording = true;
    updateStatus(`Starting capture for ${total} pages`);
    runCaptureLoop();
  }

  function stopCapture() {
    recording = false;
    updateStatus("Stopped");
  }

  function addPanel() {
    if (panel || !document.documentElement) return;

    panel = document.createElement("div");
    panel.style.cssText =
      "position:fixed;right:12px;bottom:12px;z-index:2147483647;" +
      "background:#1f1f1f;color:#fff;padding:12px;border-radius:8px;" +
      "font:13px sans-serif;box-shadow:0 2px 10px rgba(0,0,0,0.35);" +
      "max-width:260px;";

    panel.innerHTML = `
      <div id="count" style="margin-bottom:8px; font-weight:600;">Captured: 0</div>
      <div id="status" style="margin-bottom:8px; color:#cfcfcf; font-size:11px;">Idle</div>
      <button id="start" type="button" style="margin-right:6px;">Start</button>
      <button id="stop" type="button" style="margin-right:6px;">Stop</button>
      <button id="download" type="button">Download JSON</button>
    `;

    panel.querySelector("#start").onclick = startCapture;
    panel.querySelector("#stop").onclick = stopCapture;
    panel.querySelector("#download").onclick = download;

    document.documentElement.appendChild(panel);
  }

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
