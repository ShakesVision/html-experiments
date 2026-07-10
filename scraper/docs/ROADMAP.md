# Roadmap &amp; next steps

What's shipped, what's next, and known limitations. The MVP (engine, web app,
extension, tests) is done; everything below "Next" is deliberately deferred.

## Shipped (MVP)

- Shared extraction engine (records + simple, robust selectors, select-similar,
  pagination detection, CSV/JSON/NDJSON, recipes, entitlement, transport ladder)
- Free web app: fetch/paste, sandboxed-iframe picker, record builder, recipes,
  export, free/Pro gating, responsive layout
- MV3 extension: own CORS-bypass fetch, live-DOM scraping, on-page point-and-click
  picker, popup, web-app bridge
- 16-test Node suite incl. real Chartink-shaped extraction

## Immediate next steps

1. **Live Chrome verification** *(highest priority)* — load the extension
   unpacked, run Pick + Scrape on `chartink.com/screener/minervinitest`, and
   snapshot the real rendered table into `tests/fixtures/chartink-screener.html`
   so the automated test mirrors production exactly. (Was blocked during the
   build by a disconnected Chrome.)
2. **Real icons** — 16/32/48/128 PNGs for the extension + store assets.
3. **Wire a payment provider** — ExtensionPay (extension) / Gumroad or
   LemonSqueezy (web) into `verifyLicense()`. See
   [PUBLISHING.md → Monetization](PUBLISHING.md#monetization).

## Next features (post-MVP)

- **Scheduling &amp; change alerts** — `chrome.alarms` recurring scrapes; diff vs
  last run; notify on "new row / price dropped". *(Pro)*
- **Cloud export** — push results to Google Sheets / Airtable / Notion, or POST
  to a webhook / Zapier / Make. *(Pro)*
- **Recipe marketplace** — shareable, importable recipes for popular sites; a
  community library. *(Pro)*
- **Recipe health monitor** — detect when a saved recipe stops matching after a
  site changes, and flag it. *(Pro, partially scaffolded via the feature flag)*
- **Cloud sync** of recipes across devices.
- **Selector power-ups** — XPath, `:contains()`-style text matching, attribute
  filters, regex post-processing on extracted values.
- **Sync recipes into the extension popup** (web app already has the store).
- **Capacitor Android app** — wrap the responsive web app; native HTTP transport
  is already detected in `fetcher.js`. See
  [PUBLISHING.md → Android](PUBLISHING.md#android-capacitor).
- **Firefox build** — manifest tweaks + `browser.*` polyfill.

## Known limitations

- The **free web app cannot scrape CORS-blocked or JavaScript-rendered sites**
  by itself — that's the extension's job (and the paid boundary). The app guides
  the user to install it.
- The **extension engine is a copy** of `../engine` (MV3 packaging constraint).
  Run `npm run sync:ext-engine` after engine edits. A future build step could
  automate this.
- **Popup closes on page click**, so the on-page picker stashes its result to
  `chrome.storage` and the user reopens the popup. A side panel (Chrome Side
  Panel API) would make this seamless — a candidate improvement.
- `npm run check` currently flags a **pre-existing** `dhun/sur.html` placeholder
  URL, unrelated to the scraper.

## Design principles (keep these)

- **One engine, many shells** — never fork logic into the UI; DOM is always
  injected so the same code runs in browser, extension, and Node tests.
- **No external runtime dependency** — our own extension is the CORS bypass;
  the site ships dependency-free.
- **Gating centralized** in `entitlement.js` so monetization is a one-file swap.
- **Every engine change ships with a test.**
