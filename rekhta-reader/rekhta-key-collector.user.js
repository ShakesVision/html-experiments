// ==UserScript==
// @name         Rekhta Reader: key collector
// @namespace    rekhta-reader
// @version      2.0.0
// @description  Collects page IDs + unscramble tile maps for the open book using Rekhta's own session (bucket "c"), then exports a bundle for dwn.js / the reader proxy.
// @match        https://www.rekhta.org/ebooks/*
// @run-at       document-start
// @grant        GM_xmlhttpRequest
// @grant        unsafeWindow
// @connect      localhost
// @connect      127.0.0.1
// ==/UserScript==

(function () {
  "use strict";

  const PROXY = "http://localhost:8888";
  const MIN_INTERVAL_MS = 1600;
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
    for (let attempt = 0; attempt < 6 && running; attempt++) {
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
      const wait = (Number(res.headers.get("retry-after")) || 60) * 1000 + 2000;
      for (let left = wait; left > 0 && running; left -= 1000) {
        status(`429 — cooling down ${Math.ceil(left / 1000)}s`);
        await delay(1000);
      }
    }
    throw new Error("gave up");
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
        await delay(MIN_INTERVAL_MS);
        if (!ids.length || !bundle.pageIds[from]) { status(`No id returned for page ${from + 1}; stopping.`); break; }
      }
      // 2) Tile maps for every page not captured yet
      for (let i = 0; i < bundle.totalPages && running; i++) {
        const pgid = bundle.pageIds[i];
        if (!pgid || bundle.keys[pgid]) continue;
        status(`key ${i + 1}/${bundle.totalPages}`);
        try {
          const key = await apiGet(`/EbookData/GetEbookFromApi/?bkId=${encodeURIComponent(bundle.bookId)}&pgIdx=${i}&pgid=${encodeURIComponent(pgid)}`);
          if (Array.isArray(key?.Sub) && key.Sub.length) bundle.keys[pgid] = key;
          saveBundle(); render();
        } catch (e) {
          console.warn("[rr] page", i + 1, e);
        }
        await delay(MIN_INTERVAL_MS);
      }
      status(running ? "Done. Export or push to proxy." : "Paused.");
      if (running) pushToProxy(true);
    } finally {
      running = false;
      render();
    }
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
    ui.innerHTML = `<b>Rekhta key collector</b>
      <div id="rr-count" style="margin:4px 0"></div>
      <progress id="rr-prog" style="width:100%"></progress>
      <div id="rr-status" style="min-height:16px;color:#9cf;margin:4px 0"></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px">
        <button id="rr-go" style="grid-column:1/3"></button>
        <button id="rr-exp">Export JSON</button>
        <button id="rr-push">Push to proxy</button>
        <button id="rr-clr" style="grid-column:1/3">Clear saved</button>
      </div>`;
    document.body.appendChild(ui);
    ui.querySelector("#rr-go").onclick = () => (running ? (running = false) : collect());
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
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mountUi);
  else mountUi();
})();
