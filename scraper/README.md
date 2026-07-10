# Web Scraper &amp; Data Extractor

Point-and-click web scraping that turns any page into clean **rows &amp; columns**
— and a companion browser **extension** that scrapes live JavaScript sites
(SPAs) with its **own built-in CORS bypass**, no external proxy.

- **Live app:** [`index.html`](index.html) · https://tools.shakeeb.in/scraper/
- **Extension:** [`extension/`](extension/README.md) (load unpacked / Chrome Web Store)
- **Docs:** [Help &amp; usage](docs/HELP.md) · [Publishing](docs/PUBLISHING.md) · [Roadmap](docs/ROADMAP.md)

---

## What it does

Give it a page and a selector (or just *click* what you want), and it extracts
either a single value/list or a full table of records, then exports to CSV,
JSON, or NDJSON.

The catch every scraper hits is **CORS** (browsers block cross-site fetches)
and **JavaScript rendering** (a plain fetch of an SPA returns an empty shell).
This project solves both without depending on anyone else's server:

| Situation | Free web app | With the extension |
|-----------|:---:|:---:|
| CORS-open, static HTML site | ✅ direct fetch | ✅ |
| CORS-blocked site | ⚠️ needs a proxy | ✅ background-worker fetch |
| JavaScript / SPA (e.g. Chartink) | ❌ empty shell | ✅ reads the **live rendered DOM** |
| Point-and-click on the real page | — | ✅ |

When the extension is installed, the **web app auto-detects it** and routes its
fetches through the extension — so the "install a CORS extension" advice goes
away entirely.

---

## Features

### Free
- Fetch a URL (direct or via an optional proxy) **or paste HTML**
- **Point-and-click picker** on the loaded/pasted page (sandboxed preview)
- **"Select similar"** — one click builds the row selector *and* a column per field
- Records mode (rows &amp; columns) and Simple mode (one selector, text/HTML/attribute)
- Save/load **recipes** locally
- Export **CSV / JSON**, copy to clipboard
- Up to 500 extracted rows per day

### Pro
- **Live-page scraping** of JavaScript sites via the extension
- **Point-and-click picker on real pages** + select similar
- **Auto-pagination** &amp; multi-page crawl
- **Unlimited rows**, **NDJSON** export
- Recipe **health monitoring**
- (Planned) scheduling, Sheets/Airtable/webhook export, recipe marketplace

Pro is enforced today; payment is a drop-in (see [Publishing → Monetization](docs/PUBLISHING.md#monetization)).
A license key shaped `SCR-XXXX-XXXX` unlocks Pro locally for testing.

---

## Quick start

**Web app:** open `index.html` (or the live URL). Pick a source → **Load** →
**Pick element** or type a selector → **Extract** → export. Full walkthrough in
[docs/HELP.md](docs/HELP.md).

**Extension:** `chrome://extensions` → Developer mode → **Load unpacked** →
select [`extension/`](extension/). Details in
[extension/README.md](extension/README.md).

---

## Architecture

One framework-free ES-module **engine** is the single source of truth; three
shells consume it.

```
scraper/
  index.html · app.js · styles.css     ← free web app
  engine/                              ← the shared core (pure, DOM-injected)
    extract.js      records + simple extraction
    selector.js     robust selectors + "select similar"
    paginate.js     next-page detection + crawl driver
    export.js       CSV / JSON / NDJSON
    recipe.js       recipe schema + localStorage store
    entitlement.js  free/Pro gating + row cap + license (pluggable)
    fetcher.js      transport ladder: live → extension → capacitor → proxy → direct
    dom.js          shared helpers
  extension/                           ← paid MV3 extension (own CORS bypass)
    manifest.json · background.js · content.js · popup.* · bridge.js
    engine/         copy of ../engine (MV3 can't reach outside its root)
  tests/            Node + linkedom suite (npm test)
  docs/             this documentation
```

Every DOM-touching function takes an injected `Document`/`Element`, so the same
code runs under the browser, the extension's live page, and `linkedom` in Node.

---

## Development

```bash
npm test              # run the engine suite (16 tests, Node + linkedom)
npm run sync:ext-engine   # re-copy engine/ into extension/engine/ after edits
npm run check         # site-wide checks (from repo root)
```

The extension bundles a **copy** of the engine at `extension/engine/`. After
editing anything in `scraper/engine/`, run `npm run sync:ext-engine` to keep
the copy in sync (the two must match).

See [docs/HELP.md](docs/HELP.md) to use it, [docs/PUBLISHING.md](docs/PUBLISHING.md)
to ship it, and [docs/ROADMAP.md](docs/ROADMAP.md) for what's next.
