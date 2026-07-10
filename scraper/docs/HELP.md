# Help &amp; usage

A step-by-step guide to scraping with the web app and the extension, plus
troubleshooting.

- [Concepts](#concepts)
- [Web app walkthrough](#web-app-walkthrough)
- [Extension walkthrough](#extension-walkthrough)
- [Recipes](#recipes)
- [Exporting](#exporting)
- [Pro features &amp; licensing](#pro-features--licensing)
- [Troubleshooting](#troubleshooting)
- [FAQ](#faq)

---

## Concepts

- **Selector** — a CSS selector that points at element(s) on the page, e.g.
  `h1`, `.article-body`, `#DataTables_Table_0 tbody tr td:nth-child(3)`.
- **Records mode** — you give a **row selector** (the repeating element) and a
  list of **columns**, each with its own selector *relative to a row*. Output is
  a table.
- **Simple mode** — one selector, returning either the first match or all
  matches, as text, HTML, or an attribute (like `href`).
- **Recipe** — a saved scrape: source + selectors + options. Reload it anytime.

---

## Web app walkthrough

1. **Choose a source.**
   - *Fetch a URL* — paste a page URL. If the site blocks cross-origin requests
     (CORS) or renders with JavaScript, install the extension (below); the app
     will use it automatically. You can also set an optional proxy.
   - *Paste HTML* — paste a page's HTML (View Source, or copy an element's
     "outerHTML" from DevTools). Great for one-offs and for JS pages when you
     don't have the extension.
2. **Load.** A preview of the page appears.
3. **Pick what you want.**
   - Click **Pick element**, then click an item in the preview.
   - In **Records mode**, one click uses *select similar* to fill the row
     selector **and** a column for every field it detects (table columns get
     their header names).
   - In **Simple mode**, the click fills a single selector.
   - You can always edit the selectors by hand.
4. **Add/adjust columns** (Records mode): each column has a name, a selector
   relative to the row, and a type (`text`, `html`, or `attr` for e.g. links).
5. **Extract.** Records show as a table; Simple shows text.
6. **Export** — CSV, JSON, NDJSON, or Copy.

### Example — a table on a static page
- Source: *Fetch a URL* → the page URL.
- Mode: **Records**.
- Pick any cell in the table → columns auto-fill → **Extract**.

---

## Extension walkthrough

The extension is for **live pages** — especially JavaScript sites where the
data only exists after the page renders (Chartink screeners, dashboards,
infinite-scroll feeds).

1. Install it ([extension/README.md](../extension/README.md) →
   *Load unpacked*).
2. Open the target page (e.g. `https://chartink.com/screener/minervinitest`).
   Let it finish loading its data.
3. Click the **Scrape** toolbar icon.
4. **Pick on page** → the popup closes so you can click the page → click a
   result cell. A toast confirms the selection.
5. Click the icon again → the captured recipe is loaded → **Scrape page**.
6. Review the table → **CSV / JSON / Copy**.

The first cross-site fetch or broad crawl asks for host permission; everyday
single-tab scraping only uses `activeTab`.

---

## Recipes

- **Save recipe** stores the current setup under a name (web app: left sidebar;
  extension: coming with sync).
- Click a saved recipe to reload its source, selectors, and options.
- Recipes live in your browser's local storage (this device only).

---

## Exporting

| Format | Use it for |
|--------|-----------|
| **CSV** | Spreadsheets (Excel, Google Sheets). Commas/quotes/newlines are escaped. |
| **JSON** | Feeding another program; array of `{column: value}` objects. |
| **NDJSON** | Streaming / log pipelines; one JSON object per line. *(Pro)* |
| **Copy** | Quick paste — CSV for records, raw text for simple mode. |

---

## Pro features &amp; licensing

Locked features show a **Pro** chip; clicking one (or the tier badge) opens the
unlock dialog. Enter a license key of the form `SCR-XXXX-XXXX`.

Free includes a daily cap of **500 rows**; Pro is unlimited. Everything is
stored locally — no account. (Real payment is being wired; see
[PUBLISHING.md → Monetization](PUBLISHING.md#monetization).)

---

## Troubleshooting

**"couldn't load … — install the extension for CORS-blocked or JavaScript
sites."**
The site blocks cross-origin fetches or needs JavaScript. Install the
extension (the app will use it), or use **Paste HTML**, or set a proxy.

**The table is empty / only headers show.**
The data is rendered by JavaScript. A raw fetch can't see it — use the
**extension** on the live page, or paste the rendered HTML.

**"no elements matched that selector."**
Your selector doesn't match. Use **Pick element** to generate one, or check for
typos / dynamic class names. In Records mode make sure the **row selector**
matches multiple rows.

**"Invalid CSS selector."**
The selector text isn't valid CSS. Fix the syntax (or re-pick).

**Picker doesn't highlight.**
Make sure you clicked **Pick element** first (web app) or **Pick on page**
(extension). In the extension, the popup closes on purpose so you can click the
page — reopen it afterwards.

**Only 500 rows came back.**
That's the free daily cap. Unlock Pro for unlimited.

---

## FAQ

**Is my data sent anywhere?** No. Everything runs in your browser; there's no
backend. The extension fetches pages directly from your machine.

**Does the extension work on Firefox/Edge?** It's built to MV3; Edge works
as-is, Firefox needs minor manifest tweaks — see
[PUBLISHING.md](PUBLISHING.md#firefox--edge).

**Can I scrape behind a login?** With the extension on the live page, yes — it
reads what your logged-in browser already shows. Respect each site's terms.

**Will it become an Android app?** The web app is responsive and the engine
already detects a Capacitor environment; an Android wrap is planned
([ROADMAP.md](ROADMAP.md)).
