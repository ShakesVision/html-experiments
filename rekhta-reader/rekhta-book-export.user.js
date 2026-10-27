// ==UserScript==
// @name         Rekhta Reader: export current book PDF
// @namespace    rekhta-reader
// @version      1.0.0
// @description  Fetches this book's page keys one at a time, unscrambles the pages, and builds a PDF.
// @match        https://www.rekhta.org/ebooks/*
// @require      https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.2/jspdf.umd.min.js
// @grant        GM_xmlhttpRequest
// @connect      www.rekhta.org
// @connect      ebooksapi.rekhta.org
// ==/UserScript==

(function () {
  "use strict";

  const TILE_SIZE = 50;
  const TILE_GAP = 16;
  const MIN_KEY_INTERVAL_MS = 1500;
  const bookId = readString("bookId") || "";
  const pageNames = readArray("pages");
  const pageIds = readArray("pageIds");
  const totalPages = Number(readString("totalPageCount")) || Math.max(pageNames.length, pageIds.length);
  let nextApiRequestAt = 0;
  let apiQueue = Promise.resolve();
  let stopped = false;

  const panel = document.createElement("section");
  panel.style.cssText = "position:fixed;z-index:2147483647;left:8px;top:8px;width:200px;height:200px;box-sizing:border-box;padding:9px;background:#171717;color:#fff;border:1px solid #777;border-radius:7px;font:12px/1.35 Arial,sans-serif;box-shadow:0 2px 14px #0008;";
  panel.innerHTML = `<div style="font-weight:bold;margin-bottom:6px">Rekhta PDF</div>
    <div id="rr-info" style="height:32px;overflow:auto;margin-bottom:5px"></div>
    <button id="rr-start" style="width:100%;margin-bottom:5px">Download ${totalPages || "?"} pages</button>
    <button id="rr-stop" style="width:100%;margin-bottom:5px">Stop</button>
    <progress id="rr-progress" value="0" max="${totalPages || 1}" style="width:100%"></progress>
    <button id="rr-close" title="Close" style="position:absolute;right:5px;top:5px">×</button>`;
  document.documentElement.appendChild(panel);
  const info = panel.querySelector("#rr-info");
  const progress = panel.querySelector("#rr-progress");
  panel.querySelector("#rr-close").onclick = () => panel.remove();
  panel.querySelector("#rr-stop").onclick = () => { stopped = true; info.textContent = "Stopping after current request…"; };
  panel.querySelector("#rr-start").onclick = exportPdf;

  if (!bookId || !totalPages) {
    info.textContent = "Could not read book metadata from this page.";
    panel.querySelector("#rr-start").disabled = true;
  } else {
    info.textContent = `${totalPages} pages · sequential key requests`;
  }

  async function exportPdf() {
    if (!window.jspdf?.jsPDF) { info.textContent = "PDF library did not load; refresh the page."; return; }
    stopped = false;
    const button = panel.querySelector("#rr-start");
    button.disabled = true;
    const pdf = new window.jspdf.jsPDF({ orientation: "p", unit: "px", format: "a4", compress: true });
    const failed = [];
    let added = 0;
    for (let pageNum = 1; pageNum <= totalPages && !stopped; pageNum++) {
      info.textContent = `Page ${pageNum}/${totalPages}…`;
      try {
        const pageId = await getPageId(pageNum - 1);
        if (!pageId) throw new Error("missing page ID");
        const key = await getPageKey(pageNum, pageId);
        const scrambled = await getBlob(`https://ebooksapi.rekhta.org/images/${encodeURIComponent(bookId)}/${encodeURIComponent(pageNames[pageNum - 1] || "")}`);
        const imageData = await unscramble(key, scrambled);
        const { width, height } = await imageDimensions(imageData);
        if (added) pdf.addPage();
        const pageWidth = pdf.internal.pageSize.getWidth();
        const pageHeight = pdf.internal.pageSize.getHeight();
        const fit = Math.min(pageWidth / width, pageHeight / height);
        const drawWidth = width * fit;
        const drawHeight = height * fit;
        pdf.addImage(imageData, "JPEG", (pageWidth - drawWidth) / 2, (pageHeight - drawHeight) / 2, drawWidth, drawHeight, undefined, "FAST");
        added++;
      } catch (error) {
        failed.push(pageNum);
        console.warn(`[Rekhta PDF] page ${pageNum} failed`, error);
      }
      progress.value = pageNum;
    }
    if (stopped) info.textContent = `Stopped · ${added} pages collected`;
    else if (failed.length) info.textContent = `Finished with failures: ${failed.join(", ")}`;
    else {
      const safeName = (document.title || "rekhta-book").replace(/[\\/:*?"<>|]+/g, "-");
      pdf.save(`${safeName}.pdf`);
      info.textContent = `PDF saved · ${added} pages`;
    }
    button.disabled = false;
  }

  async function getPageId(index) {
    if (pageIds[index]) return pageIds[index];
    const slug = location.pathname.replace(/^\/ebooks\//i, "").split("/")[0];
    const lang = new URL(location.href).searchParams.get("lang") || "1";
    const from = Math.floor(index / 10) * 10;
    const payload = await getJson(`https://www.rekhta.org/EbookData/GetEbookPageIds/?slug=${encodeURIComponent(slug)}&lang=${encodeURIComponent(lang)}&from=${from}&count=10`);
    const ids = payload?.ids || [];
    ids.forEach((id, offset) => { pageIds[from + offset] = id; });
    return pageIds[index] || "";
  }

  async function getPageKey(pageNum, pageId) {
    const url = `https://www.rekhta.org/EbookData/GetEbookFromApi/?bkId=${encodeURIComponent(bookId)}&pgIdx=${pageNum - 1}&pgid=${encodeURIComponent(pageId)}`;
    return getJson(url);
  }

  function getJson(url) {
    const request = apiQueue.then(async () => {
      const waitMs = Math.max(0, nextApiRequestAt - Date.now());
      if (waitMs) await delay(waitMs);
      if (stopped) throw new Error("stopped");
      try {
        for (let attempt = 0; ; attempt++) {
          try {
            const value = await gmRequest(url, "json");
            return typeof value === "string" ? JSON.parse(value) : value;
          } catch (error) {
            if (!error.retryAfterMs || attempt >= 1) throw error;
            await delay(error.retryAfterMs);
          }
        }
      } finally {
        nextApiRequestAt = Date.now() + MIN_KEY_INTERVAL_MS;
      }
    });
    apiQueue = request.catch(() => {});
    return request;
  }

  function getBlob(url) { return gmRequest(url, "blob"); }

  function gmRequest(url, responseType) {
    return new Promise((resolve, reject) => GM_xmlhttpRequest({
      method: "GET", url, responseType, timeout: 45000,
      headers: { Accept: responseType === "json" ? "application/json, text/javascript, */*; q=0.01" : "image/*" },
      onload(response) {
        if (response.status >= 200 && response.status < 300) { resolve(response.response); return; }
        const err = new Error(`HTTP ${response.status}`);
        const header = response.responseHeaders?.match(/^retry-after:\s*(\d+)/im);
        if (header) err.retryAfterMs = Number(header[1]) * 1000;
        reject(err);
      },
      onerror: () => reject(new Error("Network request failed")),
      ontimeout: () => reject(new Error("Request timed out")),
    }));
  }

  async function unscramble(key, blob) {
    if (!Array.isArray(key?.Sub) || !key.Sub.length) throw new Error("missing tile map");
    const image = await createImageBitmap(blob);
    const width = Number(key.PageWidth || key.Width) || Number(key.X) * TILE_SIZE || image.width;
    const height = Number(key.PageHeight) || Number(key.Y) * TILE_SIZE;
    if (!width || !height) throw new Error("missing page dimensions");
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    const hasIndex = key.Sub.some((tile) => Object.prototype.hasOwnProperty.call(tile, "index"));
    const tiles = [...key.Sub].sort((a, b) => hasIndex ? Number(a.index) - Number(b.index) : Number(a.Y1) - Number(b.Y1) || Number(a.X1) - Number(b.X1));
    for (const tile of tiles) {
      ctx.drawImage(image, Number(tile.X1) * (TILE_SIZE + TILE_GAP), Number(tile.Y1) * (TILE_SIZE + TILE_GAP), TILE_SIZE, TILE_SIZE,
        Number(tile.X2) * TILE_SIZE, Number(tile.Y2) * TILE_SIZE, TILE_SIZE, TILE_SIZE);
    }
    return canvas.toDataURL("image/jpeg", 0.92);
  }

  function imageDimensions(dataUrl) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve({ width: image.width, height: image.height });
      image.onerror = reject;
      image.src = dataUrl;
    });
  }

  function readString(name) {
    const match = document.documentElement.innerHTML.match(new RegExp(`var\\s+${name}\\s*=\\s*(?:["']([^"']*)["']|([^;\\n]+))`, "i"));
    return (match?.[1] || match?.[2] || "").trim();
  }

  function readArray(name) {
    const source = document.documentElement.innerHTML;
    const literal = source.match(new RegExp(`var\\s+${name}\\s*=\\s*\\[(.*?)\\]\\s*;`, "is"));
    if (literal) return [...literal[1].matchAll(/["']([^"']*)["']/g)].map((m) => m[1]);
    const declared = source.match(new RegExp(`var\\s+${name}\\s*=\\s*new\\s+Array\\((\\d+)\\)`, "i"));
    const indexed = new Map();
    const assignment = new RegExp(`${name}\\[(\\d+)\\]\\s*=\\s*["']([^"']*)["']`, "gi");
    for (const match of source.matchAll(assignment)) indexed.set(Number(match[1]), match[2]);
    const length = Math.max(Number(declared?.[1]) || 0, indexed.size ? Math.max(...indexed.keys()) + 1 : 0);
    return Array.from({ length }, (_, index) => indexed.get(index) || "");
  }

  function delay(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
})();
