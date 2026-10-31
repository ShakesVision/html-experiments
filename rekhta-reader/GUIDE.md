# Rekhta Reader — Guide (key-bundle workflow)

Rekhta throttles its ebook API per identity (`X-Ebook-Throttle`). The real
site runs with a session cookie and gets ~150 requests per window. Cookieless
callers such as Node or our old proxy share an IP bucket of ~20, so they hit
`429 Too Many Requests` almost immediately.

So the slow part (the unscramble tile maps, aka "keys") is collected **on
rekhta.org itself** by a userscript. Everything else only needs the page
images, which aren't throttled the same way.

```
rekhta.org + userscript ──► <slug>.rekhta-keys.json ──┬─► node dwn.js  (PDF / JPGs)
                         └► Push to proxy (:8888) ────┴─► Reader UI    (read / PDF / queue)
```

A bundle is a JSON file with `bookId`, `slug`, `title`, `pages` (image file
names), `pageIds`, `totalPages` and `keys` (pageId → tile map).

---

## 1. Userscript — `rekhta-key-collector.user.js`

**Install:** Tampermonkey/Violentmonkey → *Create new script* → paste the file
→ save. Disable the older `brainstorming/userscript_v*.js` collectors.
(Pasting it into DevTools also works; *Push to proxy* then uses `fetch`
instead of `GM_xmlhttpRequest`.)

**Use:**
1. Open the book's reader page, e.g.
   `https://www.rekhta.org/ebooks/<slug>?lang=ur`.
2. A panel appears bottom-left: `N/Total keys · M ids`.
3. Click **Collect keys**. The script:
   - fetches all page IDs (resuming from the first missing one),
   - fetches each missing tile map, one request every ~1.6 s,
   - on 429 shows a countdown, waits `Retry-After` + 2 s and retries. A
     request is tried **at most 3 times**, then that page is marked failed
     and the run moves on. It never loops forever. The final status lists
     the gaps; click **Resume** later to fill only those.
   - Progress is stored in `localStorage`, so you can **Pause**, reload or
     close the tab and **Resume** later.
4. When it shows `Total/Total keys`:
   - **⬇ Download PDF** builds the whole book PDF right there. Images come
     from `ebooksapi.rekhta.org`, are unscrambled in the page and saved via
     jsPDF. No proxy, no Node. Click again to cancel. Pages without a key
     are skipped and listed.
   - **Export JSON** → downloads `<slug>.rekhta-keys.json`, or
   - **Push to proxy** → sends it to the local proxy (must be running).
     This also happens automatically when collection finishes.
5. **Clear saved** wipes this book's progress.

**One-click:** **⚡ Collect + PDF** collects any missing keys and then builds
the PDF. If the run is paused, it stops without making a PDF.

**Delay (ms):** the pause after every API request during collection
(default 1600). It is saved across sessions. Lower is faster but hits 429
sooner.

**Multi-book queue:** open *Multi-book queue* in the panel and paste
rekhta.org ebook links, one per line (`/ebooks/detail/…` links and bare slugs
also work). Click **▶ Run queue**. The script opens each book in turn, runs
Collect + PDF, then moves to the next. Books are processed one at a time,
fully unattended. Queue state lives in `localStorage`, so it continues across
page loads and resumes after a reload. **■ Stop** halts it. The info line
shows progress and any books that failed. A book's saved keys are cleared
once its PDF is saved. The first time, your browser may ask to *allow
multiple downloads* for rekhta.org; allow it.

The status line shows the throttle bucket, e.g. `throttle 12/150 (c)`. `c` is
correct. `i` means you're being counted per IP; try logging in to rekhta.org.

Pages you just read in Rekhta's own viewer are captured for free (passive
capture).

---

## 2. Node downloader — `proxy/dwn.js`

Needs Node 18+ and `canvas`:

```powershell
cd rekhta-reader\proxy
npm install canvas
```

No `--proxy` needed; Node isn't subject to CORS.

```powershell
# Whole book from a bundle → PDF named after the slug (no Rekhta API calls)
node dwn.js --keys C:\Downloads\<slug>.rekhta-keys.json

# Also keep the unscrambled JPGs, choose output, page range
node dwn.js --keys book.rekhta-keys.json --images --out out\book.pdf --range 1-50

# Old way (API calls, will be throttled) — not recommended
node dwn.js "https://www.rekhta.org/ebooks/<slug>?lang=ur"
```

| Option | Meaning |
|---|---|
| `--keys <file>` | Bundle from the userscript. Also accepts the old `userscript_v1` array export (then also pass the book URL). |
| `--out <file.pdf>` | Output path. |
| `--images` | Also write `*_page_NNN.jpg`. |
| `--no-pdf` | Images only. |
| `--range 1-10,15` | Subset of pages. |
| `--scale 0.8` | Shrink output. |
| `--concurrency N` | Parallel image downloads (default 3 with `--keys`, else 1). |
| `--allow-api` | Fetch keys missing from the bundle via the API (throttled). |
| `--proxy <prefix>` | Optional; route through the local proxy. |

Pages missing from the bundle are reported as *"Key missing from bundle —
resume the collector"* and listed in `failed.txt`. No hanging.

---

## 3. Reader UI — `index.html`

**Start the proxy** (the browser needs it for CORS):

```powershell
cd rekhta-reader\proxy
node proxy-server.js           # http://localhost:8888
```

In the app, set the proxy prefix to `http://localhost:8888/?url={url}`.

The proxy (v2) keeps a cookie jar, sends browser-like headers, queues API
calls (1.5 s apart), pauses everything after a 429, and caches keys, images
and pushed bundles in `proxy/cache/`. `http://localhost:8888/status` shows
the last throttle state.

**Getting keys into the app** (either way):
- **Push to proxy** from the userscript, then just open the book. The app
  asks the proxy for `/bundle?bookId=…` automatically.
- Or click **🔑 Keys** in the toolbar and pick one or more
  `*.rekhta-keys.json` files. The book URL is filled in for you.

**Then:**
- **Preview grid:** pages with known keys load automatically as you scroll
  (lazy, around the viewport). Pages without keys still say *Click to open*.
  They go through the throttled API.
- **Reader:** click any page. Prev/next and 1-/2-page view work as before.
- **PDF:** downloads the whole current book. Keyed pages need no API call, so
  only image downloads happen. Each request is tried at most 3 times (429
  waits are capped at 15 s). A page that still fails is **skipped**, not
  fatal. The PDF is saved and the status lists the skipped page numbers.
- **Queue (bottom section):** paste several book URLs, or use **Queue** for
  the current one. Every queued book uses the loaded/pushed bundles, so load
  or push all their bundles first. Rows show skipped pages too.

**Troubleshooting**
- Still seeing 429: a page lacked a key. Resume the collector for that book
  and push again.
- `Proxy not reachable`: start `node proxy-server.js`, or use Export plus the
  Keys button.
- Blank or garbled pages: the bundle belongs to a different book or
  language; collect again on the exact `?lang=` URL.
