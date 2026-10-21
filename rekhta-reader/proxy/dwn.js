#!/usr/bin/env node
/*
 * Rekhta downloader (enhanced)
 * Features:
 *  - Download one or more books (serial or parallel)
 *  - Save images, save PDF, or both
 *  - Page range support: --range 1-50 or --pages 1,3,5-10
 *  - Scale images: --scale 0.5
 *  - Concurrency: --concurrency 4 (image fetch/unscramble workers)
 *  - Parallel books: --parallel 2
 *  - Uses canvas for unscrambling; if not installed, the script prints instructions
 *
 * Usage examples:
 *  node dwn.js <bookUrl> --proxy "http://localhost:8888/?url={url}" --out book.pdf --images --range 1-50 --scale 0.8 --concurrency 6
 */

const fs = require("fs");
const path = require("path");
const os = require("os");

const DEFAULT_PROXY = "";
const IMAGE_BASE = "https://ebooksapi.rekhta.org/images/";
// Rekhta's page-key coordinates describe 50px tiles in a 66px source grid.
// Keep these in sync with src/index.js; the 16px gaps belong only to the
// scrambled source image, not to the output image.
const TILE_SIZE = 50;
const TILE_GAP = 16;

function parseArgs(argv) {
  const args = {
    proxy: DEFAULT_PROXY,
    out: path.resolve(__dirname, "..", "book.pdf"),
    urls: [],
    images: false,
    pdf: true,
    range: null,
    scale: 1,
    // Rekhta rate-limits page-key requests. A CPU-count-sized pool can send
    // dozens of API calls at once and produce empty/error payloads.
    concurrency: 1,
    parallel: 1,
    keepImages: false,
  };

  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--proxy") args.proxy = argv[++i];
    else if (a === "--out") args.out = argv[++i];
    else if (a === "--images") args.images = true;
    else if (a === "--no-pdf") args.pdf = false;
    else if (a === "--keep-images") args.keepImages = true;
    else if (a === "--range" || a === "--pages") args.range = argv[++i];
    else if (a === "--scale") args.scale = Number(argv[++i]) || 1;
    else if (a === "--concurrency")
      args.concurrency = Math.max(1, Number(argv[++i]) || args.concurrency);
    else if (a === "--parallel")
      args.parallel = Math.max(1, Number(argv[++i]) || args.parallel);
    else args.urls.push(a);
  }

  return args;
}

function applyProxy(prefix, target) {
  if (!prefix) return target;
  if (prefix.includes("{url}"))
    return prefix.replace("{url}", encodeURIComponent(target));
  return prefix.replace(/\/?$/, "") + "/?url=" + encodeURIComponent(target);
}

async function fetchText(url, proxy) {
  const full = applyProxy(proxy, url);
  const res = await fetch(full, {
    method: "GET",
    headers: requestHeaders("text/html"),
  });
  if (!res.ok) throw new Error(`Fetch failed ${res.status} ${url}`);
  return res.text();
}

async function fetchJson(url, proxy, referer) {
  const full = applyProxy(proxy, url);
  const delays = [1000, 2000, 4000, 8000, 15000, 30000];
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(full, {
      method: "GET",
      headers: requestHeaders("application/json, text/javascript, */*; q=0.01", referer),
    });
    if (res.ok) {
      const payload = await res.json();
      // GetEbookFromApi currently serializes the key JSON inside a JSON
      // string. Native fetch parses the outer layer only, leaving a string.
      if (typeof payload === "string") {
        try {
          return JSON.parse(payload);
        } catch {
          return payload;
        }
      }
      return payload;
    }
    if (attempt >= delays.length || (res.status !== 429 && res.status < 500)) {
      throw new Error(`Fetch failed ${res.status} ${url}`);
    }
    const retryAfter = Number(res.headers.get("retry-after"));
    const waitMs = retryAfter > 0 ? retryAfter * 1000 : delays[attempt];
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }
}

async function fetchBuffer(url, proxy) {
  const full = applyProxy(proxy, url);
  const res = await fetch(full, { method: "GET", headers: requestHeaders("*/*") });
  if (!res.ok) throw new Error(`Fetch failed ${res.status} ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

function requestHeaders(accept, referer = "https://www.rekhta.org/") {
  return {
    Accept: accept,
    "Accept-Language": "en-US,en;q=0.9",
    "Cache-Control": "no-cache",
    Origin: "https://www.rekhta.org",
    Pragma: "no-cache",
    Referer: referer,
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36 Edg/155.0.0.0",
    "X-Requested-With": "XMLHttpRequest",
  };
}

function readScriptValue(source, variableName) {
  const pattern = new RegExp(
    `var\\s+${variableName}\\s*=\\s*(?:\\"([^\\"]*)\\"|'([^']*)'|([^;\\n]+))`,
    "i",
  );
  const match = source.match(pattern);
  if (!match) return "";
  return (match[1] || match[2] || match[3] || "").trim();
}

function stringToStringArray(input) {
  if (!input) return [];
  return input
    .split(",")
    .map((s) => s.replace(/['\"]/g, "").trim())
    .filter(Boolean);
}

function parseScriptArray(source, name) {
  const literalPattern = new RegExp(
    `var\\s+${name}\\s*=\\s*\\[(.*?)\\]\\s*;`,
    "is",
  );
  const literalMatch = source.match(literalPattern);
  if (literalMatch) return stringToStringArray(literalMatch[1]);

  const arrayCtorPattern = new RegExp(
    `var\\s+${name}\\s*=\\s*new\\s+Array\\((\\d+)\\)\\s*;`,
    "is",
  );
  const arrayCtorMatch = source.match(arrayCtorPattern);
  const declaredLength = Number(arrayCtorMatch?.[1] ?? 0);

  const sparsePattern = new RegExp(
    `${name}\\[(\\d+)\\]\\s*=\\s*(?:\\"([^\\"]*)\\"|'([^']*)'|([^,;\\s]+))`,
    "gi",
  );
  const values = new Map();
  for (const m of source.matchAll(sparsePattern)) {
    const idx = Number(m[1]);
    const value = (m[2] || m[3] || m[4] || "").trim();
    values.set(idx, value);
  }

  if (values.size || declaredLength > 0) {
    const targetLength = Math.max(
      declaredLength,
      values.size ? Math.max(...values.keys()) + 1 : 0,
    );
    return Array.from({ length: targetLength }, (_, i) => values.get(i) || "");
  }

  return [];
}

function extractUrlSegment(urlStr, prefix) {
  const normalized = urlStr || "";
  const index = normalized.indexOf(prefix);
  if (index === -1) return "";
  return normalized.slice(index + prefix.length).split(/[/?#]/)[0] || "";
}

function normalizePageKeyTiles(pageKey) {
  const rawTiles = Array.isArray(pageKey?.Sub) ? pageKey.Sub : [];
  if (!rawTiles.length) return [];
  const hasIndex = rawTiles.some(
    (tile) =>
      tile &&
      typeof tile === "object" &&
      Object.prototype.hasOwnProperty.call(tile, "index"),
  );
  function getTilePosition(tile, fallbackIndex) {
    if (!tile || typeof tile !== "object")
      return { X1: 0, X2: 0, Y1: 0, Y2: 0, index: fallbackIndex };
    return {
      index: Number.isFinite(Number(tile.index))
        ? Number(tile.index)
        : fallbackIndex,
      X1: Number.isFinite(Number(tile.X1)) ? Number(tile.X1) : 0,
      X2: Number.isFinite(Number(tile.X2)) ? Number(tile.X2) : 0,
      Y1: Number.isFinite(Number(tile.Y1)) ? Number(tile.Y1) : 0,
      Y2: Number.isFinite(Number(tile.Y2)) ? Number(tile.Y2) : 0,
    };
  }

  return rawTiles
    .map((t, i) => getTilePosition(t, i))
    .sort((a, b) => {
      if (hasIndex) {
        const d = a.index - b.index;
        if (d !== 0) return d;
      }
      return a.Y1 - b.Y1 || a.X1 - b.X1 || a.Y2 - b.Y2 || a.X2 - b.X2;
    });
}

function isUsablePageKey(pageKey) {
  // Match the browser reader's accepted contract: dimensions may be omitted;
  // X/Y and the fixed 50px tile size provide its fallback dimensions.
  return Array.isArray(pageKey?.Sub) && pageKey.Sub.length > 0;
}

async function fetchPageKey(bookId, pageNum, pageId, proxy, bookUrl) {
  // The site uses zero-based pgIdx even though CLI page numbers start at 1.
  const pageIndex = pageNum - 1;
  const keyUrl = `https://www.rekhta.org/EbookData/GetEbookFromApi/?bkId=${encodeURIComponent(bookId)}&pgIdx=${pageIndex}&pgid=${encodeURIComponent(pageId)}`;
  const key = await fetchJson(keyUrl, proxy, bookUrl);
  if (isUsablePageKey(key)) return key;

  const detail = typeof key === "string"
    ? key.slice(0, 180).replace(/\s+/g, " ") || "empty string response"
    : Object.keys(key || {}).join(",") || typeof key;
  throw new Error(`No usable page key for page ${pageNum} (pgid=${pageId}, pgIdx=${pageIndex}; ${keyUrl}): ${detail}`);
}

async function ensurePageIdWindow(
  bookUrl,
  proxy,
  manifest,
  pageIndex,
  count = 50,
) {
  const slug = extractUrlSegment(bookUrl, "/ebooks/");
  const lang = new URL(bookUrl).searchParams.get("lang") || "1";
  const normalizedIndex = Math.max(0, Number(pageIndex) || 0);
  // The page-ID endpoint reports `from: 0` for its first item.
  const from = Math.max(0, normalizedIndex - Math.floor(count / 2));
  const endpoint = `https://www.rekhta.org/EbookData/GetEbookPageIds/?slug=${encodeURIComponent(slug)}&lang=${encodeURIComponent(lang)}&from=${from}&count=${count}`;
  try {
    const payload = await fetchJson(endpoint, proxy, bookUrl);
    const ids = Array.isArray(payload?.ids) ? payload.ids : [];
    const startFrom = Number(payload?.from ?? from);
    for (let offset = 0; offset < ids.length; offset++) {
      const arrayIndex = startFrom + offset;
      if (arrayIndex < 0 || arrayIndex >= manifest.pageCount) continue;
      const pageId = ids[offset];
      manifest.pageIds[arrayIndex] = pageId;
      manifest.scrambleMap[arrayIndex] = manifest.scrambleMap[arrayIndex] || {};
      manifest.scrambleMap[arrayIndex].pageId = pageId;
      manifest.scrambleMap[arrayIndex].pageIndex = arrayIndex + 1;
      manifest.scrambleMap[arrayIndex].keyUrl =
        `https://www.rekhta.org/EbookData/GetEbookFromApi/?bkId=${manifest.bookId}&pgIdx=${arrayIndex}&pgid=${encodeURIComponent(pageId)}`;
    }
    return ids;
  } catch (e) {
    return [];
  }
}

function expandPages(rangeSpec, total) {
  if (!rangeSpec) return Array.from({ length: total }, (_, i) => i + 1);
  const parts = rangeSpec.split(",");
  const pages = new Set();
  for (const p of parts) {
    if (p.includes("-")) {
      const [a, b] = p.split("-").map((x) => Number(x));
      for (let i = Math.max(1, a); i <= Math.min(total, b); i++) pages.add(i);
    } else {
      const n = Number(p);
      if (n >= 1 && n <= total) pages.add(n);
    }
  }
  return Array.from(pages).sort((a, b) => a - b);
}

function getJpegDimensions(buf) {
  if (!buf || buf.length < 2 || buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  let offset = 2;
  while (offset < buf.length) {
    if (buf[offset] !== 0xff) return null;
    const marker = buf[offset + 1];
    const length = buf.readUInt16BE(offset + 2);
    if (marker >= 0xc0 && marker <= 0xc3) {
      const height = buf.readUInt16BE(offset + 5);
      const width = buf.readUInt16BE(offset + 7);
      return { width, height };
    }
    offset += 2 + length;
  }
  return null;
}

async function unscrambleBufferWithCanvas(pageKey, imgBuf, scale = 1) {
  // Try to require canvas. If not found, instruct the user to install.
  let createCanvas, loadImage;
  try {
    ({ createCanvas, loadImage } = require("canvas"));
  } catch (e) {
    throw new Error(
      "Missing 'canvas' package. Install with: npm install canvas --save",
    );
  }

  const img = await loadImage(imgBuf);
  const pageWidth = Number(pageKey?.PageWidth) || Number(pageKey?.Width) ||
    TILE_SIZE * (Number(pageKey?.X) || 0) || img.width;
  const pageHeight = Number(pageKey?.PageHeight) ||
    TILE_SIZE * (Number(pageKey?.Y) || 0);
  const tiles = normalizePageKeyTiles(pageKey);
  if (!Number.isFinite(pageWidth) || pageWidth <= 0 ||
      !Number.isFinite(pageHeight) || pageHeight <= 0 || tiles.length === 0) {
    throw new Error(`Invalid page key (PageWidth=${pageKey?.PageWidth}, PageHeight=${pageKey?.PageHeight}, Sub=${Array.isArray(pageKey?.Sub) ? pageKey.Sub.length : typeof pageKey?.Sub}, fields=${Object.keys(pageKey || {}).join(",")}).`);
  }

  const canvasW = Math.max(1, Math.round(pageWidth * scale));
  const canvasH = Math.max(1, Math.round(pageHeight * scale));

  const canvas = createCanvas(canvasW, canvasH);
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const tileStride = TILE_SIZE + TILE_GAP;
  for (const sub of tiles) {
    ctx.drawImage(
      img,
      sub.X1 * tileStride,
      sub.Y1 * tileStride,
      TILE_SIZE,
      TILE_SIZE,
      sub.X2 * TILE_SIZE * scale,
      sub.Y2 * TILE_SIZE * scale,
      TILE_SIZE * scale,
      TILE_SIZE * scale,
    );
  }

  return canvas.toBuffer("image/jpeg", { quality: 0.86 });
}

function makePdfFromJpegs(images) {
  // images: [{buf, width, height}]
  const parts = [];
  let offset = 0;
  const add = (s) => {
    const buf = Buffer.isBuffer(s) ? s : Buffer.from(String(s), "binary");
    parts.push(buf);
    offset += buf.length;
    return buf.length;
  };

  let objId = 1;
  const objOffsets = [];

  function writeObj(content) {
    objOffsets.push(offset);
    add(`${objId} 0 obj\n`);
    add(content);
    add("endobj\n");
    return objId++;
  }

  add("%PDF-1.4\n%âãÏÓ\n");

  const imageNames = [];
  for (let i = 0; i < images.length; i++) {
    const img = images[i];
    const imageObjId = writeObj(
      `<< /Type /XObject /Subtype /Image /Width ${img.width} /Height ${img.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${img.buf.length} >>\nstream\n`,
    );
    add(img.buf);
    add("\nendstream\n");
    imageNames.push({ id: imageObjId, name: `Im${i + 1}` });
  }

  const pageObjIds = [];
  const pagesObjId = objId;
  for (let i = 0; i < images.length; i++) {
    const w = images[i].width;
    const h = images[i].height;
    const contentStream = `q\n${w} 0 0 ${h} 0 0 cm\n/${imageNames[i].name} Do\nQ\n`;
    const contentId = writeObj(
      `<< /Length ${Buffer.byteLength(contentStream, "binary")} >>\nstream\n${contentStream}\nendstream\n`,
    );
    const resources = `<< /XObject << /${imageNames[i].name} ${imageNames[i].id} 0 R >> /ProcSet [/PDF /ImageC] >>`;
    const pageId = writeObj(
      `<< /Type /Page /Parent ${pagesObjId} 0 R /MediaBox [0 0 ${w} ${h}] /Resources ${resources} /Contents ${contentId} 0 R >>\n`,
    );
    pageObjIds.push(pageId);
  }

  const pagesId = writeObj(
    `<< /Type /Pages /Kids [ ${pageObjIds.map((id) => `${id} 0 R`).join(" ")} ] /Count ${pageObjIds.length} >>\n`,
  );
  const catalogId = writeObj(`<< /Type /Catalog /Pages ${pagesId} 0 R >>\n`);

  const xrefStart = offset;
  add("xref\n");
  add(`0 ${objId}\n`);
  add("0000000000 65535 f \n");
  for (let i = 0; i < objOffsets.length; i++)
    add(objOffsets[i].toString().padStart(10, "0") + " 00000 n \n");

  const trailer = `trailer\n<< /Size ${objId} /Root ${catalogId} 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;
  add(trailer);

  return Buffer.concat(parts);
}

async function downloadBook(url, opts) {
  const { proxy, out, images, pdf, range, scale, concurrency, keepImages } =
    opts;
  console.log("Fetching manifest...", url);
  const html = await fetchText(url, proxy);
  const bookId =
    readScriptValue(html, "bookId") || extractUrlSegment(url, "/ebooks/");
  const pages = parseScriptArray(html, "pages");
  const pageIds = parseScriptArray(html, "pageIds");
  const totalPageCount = Number(
    readScriptValue(html, "totalPageCount") || pages.length || pageIds.length,
  );
  const pageCount =
    Number.isFinite(totalPageCount) && totalPageCount > 0
      ? totalPageCount
      : Math.max(pages.length, pageIds.length);
  const manifest = {
    bookId,
    pages,
    pageIds,
    pageCount,
    scrambleMap: [],
    pageCount,
  };
  manifest.pageIds = Array.from(
    { length: pageCount },
    (_, i) => pageIds[i] || "",
  );
  manifest.scrambleMap = Array.from({ length: pageCount }, (_, i) => ({
    pageIndex: i + 1,
    pageId: manifest.pageIds[i],
    imgName: pages[i],
  }));

  const selectedPages = expandPages(range, pageCount);
  console.log(
    `Detected bookId=${bookId} pages=${pageCount}. Selected ${selectedPages.length} pages.`,
  );

  const outDir = path.dirname(out) || ".";
  if (images) fs.mkdirSync(outDir, { recursive: true });

  const results = [];
  const failures = [];
  const queue = [...selectedPages];

  async function worker() {
    while (queue.length) {
      const pageNum = queue.shift();
      const idx = pageNum - 1;
      // ensure pageId
      if (!manifest.pageIds[idx]) {
        await ensurePageIdWindow(url, proxy, manifest, idx, 50);
      }
      const pageId = manifest.pageIds[idx];
      const imageName = pages[idx];
      if (!pageId) {
        failures.push({ page: pageNum, error: "Rekhta did not provide a page ID." });
        continue;
      }
      if (!imageName) {
        failures.push({ page: pageNum, error: "Manifest did not provide an image filename." });
        continue;
      }
      const imgUrl = `${IMAGE_BASE}${bookId}/${imageName}`.replace(/\/?$/, "");

      try {
        const raw = await fetchBuffer(imgUrl, proxy);
        // fetch pageKey
        const pageKey = await fetchPageKey(bookId, pageNum, pageId, proxy, url);
        const finalBuf = await unscrambleBufferWithCanvas(pageKey, raw, scale);

        if (images) {
          const imgOut = path.join(
            outDir,
            `${path.basename(out, path.extname(out))}_page_${String(pageNum).padStart(3, "0")}.jpg`,
          );
          fs.writeFileSync(imgOut, finalBuf);
          if (!keepImages) results.push({ page: pageNum, img: imgOut });
          else results.push({ page: pageNum, img: imgOut });
        } else {
          results.push({ page: pageNum, buf: finalBuf });
        }
      } catch (err) {
        failures.push({ page: pageNum, error: err.message || String(err) });
        console.error("Failed page", pageNum, err.message || err);
      }
    }
  }

  // run workers
  const workers = [];
  for (let i = 0; i < concurrency; i++) workers.push(worker());
  await Promise.all(workers);

  results.sort((a, b) => a.page - b.page);
  if (failures.length) {
    const summary = failures.map((failure) => `page ${failure.page}: ${failure.error}`).join("\n");
    throw new Error(`${failures.length} of ${selectedPages.length} selected pages failed; refusing to save a partial PDF.\n${summary}`);
  }

  // build PDF if requested
  if (pdf) {
    const imagesForPdf = results.map((r) => {
      const buf = r.buf || fs.readFileSync(r.img);
      const dim = getJpegDimensions(buf) || { width: 595, height: 842 };
      return { buf, width: dim.width, height: dim.height };
    });
    console.log("Composing PDF...");
    const pdfBuf = makePdfFromJpegs(imagesForPdf);
    fs.writeFileSync(out, pdfBuf);
    console.log("Saved PDF:", out);
  }

  return results;
}

async function main() {
  const opts = parseArgs(process.argv);
  if (!opts.urls.length) {
    console.error(
      "Usage: node dwn.js <bookUrl> [--proxy <proxy>] [--out <out.pdf>] [--images] [--range 1-10] [--scale 0.8] [--concurrency 4] [--parallel 1] [--keep-images]",
    );
    process.exit(2);
  }

  const parallel = Math.max(1, opts.parallel || 1);
  let bookFailures = 0;
  const groups = [];
  for (let i = 0; i < opts.urls.length; i += parallel)
    groups.push(opts.urls.slice(i, i + parallel));

  for (const grp of groups) {
    await Promise.all(
      grp.map((u, idx) =>
        downloadBook(u, opts).catch((e) => {
          bookFailures += 1;
          console.error("Book failed", u, e.message || e);
        }),
      ),
    );
  }
  if (bookFailures) process.exitCode = 1;
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = {
  normalizePageKeyTiles,
  unscrambleBufferWithCanvas,
};
