// ==UserScript==
// @name         Rekhta Reader: key collector
// @namespace    rekhta-reader
// @version      2.2.0
// @description  Collects page IDs + unscramble tile maps for the open book using Rekhta's own session, then builds a PDF directly or exports a bundle for dwn.js / the reader.
// @match        https://www.rekhta.org/ebooks/*
// @run-at       document-start
// @require      https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.2/jspdf.umd.min.js
// @grant        GM_xmlhttpRequest
// @grant        unsafeWindow
// @connect      localhost
// @connect      127.0.0.1
// @connect      ebooksapi.rekhta.org
// ==/UserScript==

(function () {
  "use strict";

  const PROXY = "http://localhost:8888";
  const SETTINGS_KEY = "rr_settings";
  const settings = Object.assign({ delayMs: 1600 }, safeParse(localStorage.getItem(SETTINGS_KEY)));
  const saveSettings = () => localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  function safeParse(s) { try { return JSON.parse(s) || {}; } catch { return {}; } }
  const MAX_ATTEMPTS = 3; // per request; then the page is reported as failed
  const TILE = 50;
  const GAP = 16;
  const W = typeof unsafeWindow !== "undefined" ? unsafeWindow : window;
  const slug = location.pathname.replace(/^\/ebooks\//i, "").split(/[/?#]/)[0];
  const lang = new URL(location.href).searchParams.get("lang") || "1";
  const STORE = `rr_bundle_${slug}`;

  const bundle = loadBundle();
  let running = false;
  let ui = null;

  // ── Passive capture: whatever Rekhta's own viewer fetches, we keep ──────
  const origOpen = W.XMLHttpRequest.prototype.open;
  W.XMLHttpRequest.prototype.open = function (method, url) {
    this.addEventListener("load", () => {
      try {
        const body = this.responseType === "" || this.responseType === "text"
          ? this.responseText : JSON.stringify(this.response);
        capture(String(url), this.status, body);
      } catch {}
    });
    return origOpen.apply(this, arguments);
  };
  const origFetch = W.fetch;
  W.fetch = async function (input) {
    const res = await origFetch.apply(this, arguments);
    const url = typeof input === "string" ? input : input?.url;
    if (/EbookData\//i.test(url || "")) res.clone().text().then((t) => capture(url, res.status, t)).catch(() => {});
    return res;
  };

  function capture(rawUrl, status, text) {
    if (status !== 200 || !/EbookData\//i.test(rawUrl)) return;
    const u = new URL(rawUrl, location.origin);
    let data = JSON.parse(text);
    if (typeof data === "string") data = JSON.parse(data);
    if (/GetEbookPageIds/i.test(u.pathname) && Array.isArray(data?.ids)) {
      const from = Number(data.from ?? u.searchParams.get("from") ?? 0);
      data.ids.forEach((id, i) => { if (id) bundle.pageIds[from + i] = id; });
    } else if (/GetEbookFromApi/i.test(u.pathname) && Array.isArray(data?.Sub) && data.Sub.length) {
      bundle.keys[u.searchParams.get("pgid") || data.PageId] = data;
    } else return;
    saveBundle();
    render();
  }

  // ── Bundle storage ─────────────────────────────────────────────────────
  function loadBundle() {
    try {
      const b = JSON.parse(localStorage.getItem(STORE));
      if (b?.keys) return b;
    } catch {}
    return { version: 2, slug, lang, bookId: "", title: "", pages: [], pageIds: [], totalPages: 0, keys: {} };
  }
  function saveBundle() {
    try { localStorage.setItem(STORE, JSON.stringify(bundle)); } catch (e) { console.warn("[rr] localStorage full", e); }
  }
  function readMeta() {
    const html = document.documentElement.innerHTML;
    const str = (n) => (html.match(new RegExp(`var\\s+${n}\\s*=\\s*(?:["']([^"']*)["']|([^;\\n]+))`, "i")) || [])
      .slice(1).find(Boolean)?.trim() || "";
    const arr = (n) => {
      const lit = html.match(new RegExp(`var\\s+${n}\\s*=\\s*\\[(.*?)\\]\\s*;`, "is"));
      if (lit) return [...lit[1].matchAll(/["']([^"']*)["']/g)].map((m) => m[1]);
      const idx = new Map();
      for (const m of html.matchAll(new RegExp(`${n}\\[(\\d+)\\]\\s*=\\s*["']([^"']*)["']`, "gi"))) idx.set(+m[1], m[2]);
      const len = idx.size ? Math.max(...idx.keys()) + 1 : 0;
      return Array.from({ length: len }, (_, i) => idx.get(i) || "");
    };
    bundle.bookId = str("bookId") || bundle.bookId;
    bundle.title = document.title.replace(/\s*\|\s*Rekhta\s*$/i, "") || bundle.title;
    const pages = arr("pages");
    if (pages.length) bundle.pages = pages;
    arr("pageIds").forEach((id, i) => { if (id) bundle.pageIds[i] = id; });
    bundle.totalPages = Number(str("totalPageCount")) || Math.max(bundle.pages.length, bundle.pageIds.length);
    saveBundle();
  }

  // ── Active collection: same-origin fetch = same treatment as the site ──
  const delay = (ms) => new Promise((r) => setTimeout(r, ms));
  async function apiGet(url) {
    for (let attempt = 0; attempt < MAX_ATTEMPTS && running; attempt++) {
      const res = await origFetch.call(W, url, {
        credentials: "include",
        headers: { Accept: "application/json, text/javascript, */*; q=0.01", "X-Requested-With": "XMLHttpRequest" },
      });
      const tk = res.headers.get("x-ebook-throttle");
      if (tk) status(`throttle ${tk} (${res.headers.get("x-ebook-throttle-key")})`);
      if (res.ok) {
        let data = await res.json();
        if (typeof data === "string") data = JSON.parse(data);
        return data;
      }
      if (res.status !== 429 && res.status < 500) throw new Error("HTTP " + res.status);
      if (attempt + 1 >= MAX_ATTEMPTS) break;
      const wait = (Number(res.headers.get("retry-after")) || 60) * 1000 + 2000;
      for (let left = wait; left > 0 && running; left -= 1000) {
        status(`429 — cooling down ${Math.ceil(left / 1000)}s (try ${attempt + 2}/${MAX_ATTEMPTS})`);
        await delay(1000);
      }
    }
    throw new Error(`gave up after ${MAX_ATTEMPTS} attempts`);
  }

  async function collect() {
    if (running) return;
    readMeta();
    if (!bundle.bookId || !bundle.totalPages) return status("Could not read book metadata.");
    running = true;
    render();
    try {
      // 1) Page IDs in big windows (few requests)
      // Server may return fewer ids than requested, so always restart from
      // the first missing index instead of stepping by a fixed window.
      for (let guard = 0; running && guard < bundle.totalPages; guard++) {
        let from = -1;
        for (let i = 0; i < bundle.totalPages; i++) if (!bundle.pageIds[i]) { from = i; break; }
        if (from < 0) break;
        status(`page ids from ${from + 1}…`);
        const data = await apiGet(`/EbookData/GetEbookPageIds/?slug=${encodeURIComponent(slug)}&lang=${encodeURIComponent(lang)}&from=${from}&count=50`);
        const ids = data?.ids || [];
        const base = Number(data?.from ?? from);
        ids.forEach((id, i) => { if (id) bundle.pageIds[base + i] = id; });
        saveBundle(); render();
        await delay(settings.delayMs);
        if (!ids.length || !bundle.pageIds[from]) { status(`No id returned for page ${from + 1}; stopping.`); break; }
      }
      // 2) Tile maps for every page not captured yet (each page tried once
      //    per run; apiGet itself caps at MAX_ATTEMPTS)
      const failed = [];
      for (let i = 0; i < bundle.totalPages && running; i++) {
        const pgid = bundle.pageIds[i];
        if (!pgid || bundle.keys[pgid]) continue;
        status(`key ${i + 1}/${bundle.totalPages}`);
        try {
          const key = await apiGet(`/EbookData/GetEbookFromApi/?bkId=${encodeURIComponent(bundle.bookId)}&pgIdx=${i}&pgid=${encodeURIComponent(pgid)}`);
          if (Array.isArray(key?.Sub) && key.Sub.length) bundle.keys[pgid] = key;
          else failed.push(i + 1);
          saveBundle(); render();
        } catch (e) {
          failed.push(i + 1);
          console.warn("[rr] page", i + 1, e);
        }
        await delay(settings.delayMs);
      }
      const missingIds = bundle.totalPages - bundle.pageIds.slice(0, bundle.totalPages).filter(Boolean).length;
      status(!running ? "Paused."
        : failed.length || missingIds ? `Finished with gaps: ${failed.length} keys failed${missingIds ? `, ${missingIds} ids missing` : ""}. Resume later.`
        : "All keys collected.");
      if (running) pushToProxy(true);
      return { completed: running, failed: failed.length, missingIds };
    } finally {
      running = false;
      render();
    }
  }

  // ── Full-book PDF straight from the userscript ─────────────────────────
  // Images come from ebooksapi.rekhta.org (no API throttle). GM_xmlhttpRequest
  // bypasses CORS; without it (console paste) we try a CORS fetch.
  function getImageBlob(url) {
    if (typeof GM_xmlhttpRequest === "function") {
      return new Promise((resolve, reject) => GM_xmlhttpRequest({
        method: "GET", url, responseType: "blob", timeout: 45000,
        onload: (r) => (r.status === 200 ? resolve(r.response) : reject(new Error("HTTP " + r.status))),
        onerror: () => reject(new Error("network error")),
        ontimeout: () => reject(new Error("timeout")),
      }));
    }
    return origFetch.call(W, url, { mode: "cors" }).then((r) => {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.blob();
    });
  }
  async function getImageWithRetry(url) {
    let last;
    for (let a = 0; a < MAX_ATTEMPTS; a++) {
      try { return await getImageBlob(url); } catch (e) { last = e; await delay(1500 * (a + 1)); }
    }
    throw last;
  }
  async function unscramble(key, blob) {
    const img = await createImageBitmap(blob);
    const width = Number(key.PageWidth || key.Width) || Number(key.X) * TILE || img.width;
    const height = Number(key.PageHeight) || Number(key.Y) * TILE || img.height;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, width, height);
    for (const t of key.Sub) {
      ctx.drawImage(img, t.X1 * (TILE + GAP), t.Y1 * (TILE + GAP), TILE, TILE, t.X2 * TILE, t.Y2 * TILE, TILE, TILE);
    }
    img.close?.();
    return canvas;
  }
  async function downloadPdf() {
    const jsPDF = (window.jspdf || W.jspdf)?.jsPDF;
    if (!jsPDF) return status("jsPDF missing — install as a userscript (needs @require).");
    if (running) return;
    readMeta();
    running = true;
    render();
    const failed = [];
    let pdf = null;
    try {
      for (let i = 0; i < bundle.totalPages && running; i++) {
        const key = bundle.keys[bundle.pageIds[i]];
        const name = bundle.pages[i];
        if (!key || !name) { failed.push(i + 1); continue; }
        status(`PDF page ${i + 1}/${bundle.totalPages}`);
        ui.querySelector("#rr-prog").value = i + 1;
        try {
          const blob = await getImageWithRetry(`https://ebooksapi.rekhta.org/images/${bundle.bookId}/${name}`);
          const canvas = await unscramble(key, blob);
          const fmt = [canvas.width, canvas.height];
          const orient = canvas.width > canvas.height ? "landscape" : "portrait";
          if (!pdf) pdf = new jsPDF({ unit: "pt", format: fmt, orientation: orient, compress: true });
          else pdf.addPage(fmt, orient);
          pdf.addImage(canvas.toDataURL("image/jpeg", 0.88), "JPEG", 0, 0, fmt[0], fmt[1], undefined, "FAST");
          canvas.width = canvas.height = 1;
        } catch (e) {
          failed.push(i + 1);
          console.warn("[rr] pdf page", i + 1, e);
        }
      }
      if (!running) { status("PDF cancelled."); return false; }
      if (!pdf) { status("No pages rendered — collect keys first."); return false; }
      pdf.save(`${(bundle.title || slug).replace(/[\\/:*?"<>|]+/g, "-")}.pdf`);
      status(failed.length ? `PDF saved · skipped ${failed.length}: ${failed.slice(0, 15).join(", ")}${failed.length > 15 ? "…" : ""}` : "PDF saved · all pages");
      return true;
    } finally {
      running = false;
      render();
    }
  }

  async function collectAndPdf() {
    const result = await collect();
    if (!result?.completed) return false;
    return downloadPdf();
  }

  // ── Multi-book queue (sequential, survives page navigation) ───────────
  // State lives in localStorage on www.rekhta.org: { urls, index, active, log }
  const QUEUE_KEY = "rr_queue";
  const loadQueue = () => Object.assign({ urls: [], index: 0, active: false, log: [] }, safeParse(localStorage.getItem(QUEUE_KEY)));
  const saveQueue = (q) => localStorage.setItem(QUEUE_KEY, JSON.stringify(q));
  const slugOf = (u) => { try { return new URL(u).pathname.replace(/^\/ebooks\//i, "").split("/")[0]; } catch { return ""; } };
  function normalizeBookUrl(line) {
    let u = line.trim();
    if (!u) return "";
    if (!/^https?:/i.test(u)) u = "https://www.rekhta.org/ebooks/" + u.replace(/^\/?(ebooks\/)?/i, "");
    try {
      const url = new URL(u);
      // detail pages → reader page
      url.pathname = url.pathname.replace(/^\/ebooks\/detail\//i, "/ebooks/");
      return url.hostname.endsWith("rekhta.org") && /^\/ebooks\/[^/]+/i.test(url.pathname) ? url.href : "";
    } catch { return ""; }
  }
  function startQueue(text) {
    const urls = [...new Set(text.split(/\s+/).map(normalizeBookUrl).filter(Boolean))];
    if (!urls.length) return status("No valid rekhta.org/ebooks/ links.");
    saveQueue({ urls, index: 0, active: true, log: [] });
    goToCurrent();
  }
  function stopQueue() {
    const q = loadQueue();
    q.active = false;
    saveQueue(q);
    running = false;
    renderQueue();
    status("Queue stopped.");
  }
  function goToCurrent() {
    const q = loadQueue();
    if (q.index >= q.urls.length) {
      q.active = false;
      saveQueue(q);
      renderQueue();
      return status(`Queue finished · ${q.log.filter((l) => l.ok).length}/${q.urls.length} books OK`);
    }
    const target = q.urls[q.index];
    if (slugOf(target) === slug) runQueueItem();
    else location.href = target;
  }
  async function runQueueItem() {
    const q = loadQueue();
    renderQueue();
    status(`Queue ${q.index + 1}/${q.urls.length}: starting…`);
    await delay(1500); // let the page settle (scripts with bookId etc.)
    let ok = false;
    try { ok = await collectAndPdf(); } catch (e) { console.warn("[rr] queue item", e); }
    const after = loadQueue();
    if (!after.active) return; // stopped by user meanwhile
    after.log.push({ url: after.urls[after.index], ok, keys: Object.keys(bundle.keys).length, total: bundle.totalPages });
    after.index++;
    saveQueue(after);
    // Free localStorage space: the PDF is saved, keys are no longer needed.
    if (ok) localStorage.removeItem(STORE);
    await delay(3000); // give the PDF download a moment before navigating
    goToCurrent();
  }
  function renderQueue() {
    if (!ui) return;
    const q = loadQueue();
    const box = ui.querySelector("#rr-q-info");
    box.textContent = q.urls.length
      ? `${q.active ? "Running" : "Idle"} · ${Math.min(q.index, q.urls.length)}/${q.urls.length} done` +
        (q.log.some((l) => !l.ok) ? ` · failed: ${q.log.filter((l) => !l.ok).map((l) => slugOf(l.url)).join(", ")}` : "")
      : "";
    ui.querySelector("#rr-q-start").disabled = q.active;
    ui.querySelector("#rr-q-stop").disabled = !q.active;
  }

  // ── Export ──────────────────────────────────────────────────────────────
  function exportFile() {
    readMeta();
    const blob = new Blob([JSON.stringify(bundle)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${slug}.rekhta-keys.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }
  function pushToProxy(silent) {
    readMeta();
    const body = JSON.stringify(bundle);
    const done = (code) => status(code === 200 ? `Pushed to proxy (${Object.keys(bundle.keys).length} keys)` : `Proxy said ${code}`);
    const fail = () => { if (!silent) status("Proxy not reachable on :8888 — use Export JSON instead"); };
    // GM_xmlhttpRequest exists only when installed in Tampermonkey/Violentmonkey
    // with @grant; when pasted into the console, fall back to fetch (localhost
    // is a secure context and the proxy sends CORS headers).
    if (typeof GM_xmlhttpRequest === "function") {
      GM_xmlhttpRequest({
        method: "POST", url: `${PROXY}/bundle`, data: body,
        headers: { "Content-Type": "application/json" },
        onload: (r) => done(r.status), onerror: fail,
      });
    } else {
      origFetch.call(W, `${PROXY}/bundle`, { method: "POST", body, headers: { "Content-Type": "text/plain" } })
        .then((r) => done(r.status), fail);
    }
  }

  // ── UI ──────────────────────────────────────────────────────────────────
  function status(text) {
    if (ui) ui.querySelector("#rr-status").textContent = text;
  }
  function render() {
    if (!ui) return;
    const have = Object.keys(bundle.keys).length;
    const total = bundle.totalPages || "?";
    ui.querySelector("#rr-count").textContent = `${have}/${total} keys · ${bundle.pageIds.filter(Boolean).length} ids`;
    ui.querySelector("#rr-prog").max = bundle.totalPages || 1;
    ui.querySelector("#rr-prog").value = have;
    ui.querySelector("#rr-go").textContent = running ? "Pause" : have ? "Resume" : "Collect keys";
  }
  function mountUi() {
    ui = document.createElement("section");
    ui.style.cssText = "position:fixed;z-index:2147483647;left:8px;bottom:8px;width:230px;padding:10px;background:#141414;color:#eee;border:1px solid #555;border-radius:8px;font:12px/1.4 system-ui,sans-serif;box-shadow:0 4px 18px #0009";
    ui.innerHTML = `<div style="color:red;display:flex;justify-content:space-between"><b>Rekhta collector</b><br><i>tools.shakeeb.in</i></div>
      <div id="rr-count" style="margin:4px 0"></div>
      <progress id="rr-prog" style="width:100%"></progress>
      <div id="rr-status" style="min-height:16px;color:#9cf;margin:4px 0"></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px">
        <button id="rr-go" style="grid-column:1/3"></button>
        <button id="rr-all" style="grid-column:1/3;font-weight:bold">⚡ Collect + PDF</button>
        <button id="rr-pdf" style="grid-column:1/3">⬇ Download PDF</button>
        <label style="grid-column:1/3;display:flex;gap:6px;align-items:center">Delay (ms)
          <input id="rr-delay" type="number" min="0" step="100" style="width:80px"></label>
        <button id="rr-exp">Export JSON</button>
        <button id="rr-push">Push to proxy</button>
        <button id="rr-clr" style="grid-column:1/3">Clear saved</button>
        <details style="grid-column:1/3"><summary>Multi-book queue</summary>
          <textarea id="rr-q-urls" rows="4" placeholder="One rekhta.org/ebooks/… link per line" style="width:100%;box-sizing:border-box;margin-top:4px;font:11px monospace"></textarea>
          <div style="display:flex;gap:4px"><button id="rr-q-start" style="flex:1">▶ Run queue</button><button id="rr-q-stop" style="flex:1">■ Stop</button></div>
          <div id="rr-q-info" style="margin-top:4px;color:#fc6;word-break:break-word"></div>
        </details>
      </div>`;
    document.body.appendChild(ui);
    const qUrls = ui.querySelector("#rr-q-urls");
    qUrls.value = settings.queueText || "";
    qUrls.oninput = () => { settings.queueText = qUrls.value; saveSettings(); };
    ui.querySelector("#rr-q-start").onclick = () => startQueue(qUrls.value);
    ui.querySelector("#rr-q-stop").onclick = stopQueue;
    if (loadQueue().urls.length) ui.querySelector("details").open = true;
    const delayInput = ui.querySelector("#rr-delay");
    delayInput.value = settings.delayMs;
    delayInput.onchange = () => {
      settings.delayMs = Math.max(0, Number(delayInput.value) || 0);
      delayInput.value = settings.delayMs;
      saveSettings();
    };
    ui.querySelector("#rr-go").onclick = () => (running ? (running = false) : collect());
    ui.querySelector("#rr-all").onclick = () => (running ? (running = false) : collectAndPdf());
    ui.querySelector("#rr-pdf").onclick = () => (running ? (running = false) : downloadPdf());
    ui.querySelector("#rr-exp").onclick = exportFile;
    ui.querySelector("#rr-push").onclick = () => pushToProxy(false);
    ui.querySelector("#rr-clr").onclick = () => {
      if (!confirm("Clear collected keys for this book?")) return;
      localStorage.removeItem(STORE);
      bundle.keys = {};
      bundle.pageIds = [];
      readMeta(); render();
    };
    readMeta();
    render();
    renderQueue();
    const q = loadQueue();
    if (q.active) {
      const target = q.urls[q.index];
      if (target && slugOf(target) === slug) runQueueItem();
      else goToCurrent(); // landed elsewhere (redirect/manual nav) → resume
    }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mountUi);
  else mountUi();
})();
