# Scrape — browser extension (MV3)

The paid companion to the [web app](../index.html). It removes the web app's
two hard limits:

- **Live-page scraping** — reads the already-rendered DOM, so JavaScript sites
  and SPAs (e.g. Chartink screeners) work, which a plain fetch never can.
- **Own CORS bypass** — the background service worker fetches cross-origin
  without any external proxy (corsproxy.io / GAS). It also lends this power to
  the web app: when the extension is installed, the web app's transport flips
  from `direct` to `extension` automatically (via `bridge.js`).

## Load it unpacked (development)

1. Chrome → `chrome://extensions` → enable **Developer mode**.
2. **Load unpacked** → select this `extension/` folder.
3. Pin “Scrape”. Open any page (try `https://chartink.com/screener/minervinitest`),
   click the icon → **Pick on page** → click a result cell → reopen the popup →
   **Scrape page** → export CSV/JSON.

The first cross-site fetch or a broad scrape will prompt for host access
(`optional_host_permissions`), so day-to-day use only touches the current tab
(`activeTab`).

## Files

| File | Role |
|------|------|
| `manifest.json` | MV3 manifest (`activeTab` + on-demand `<all_urls>`) |
| `background.js` | Service worker: CORS-bypass `fetch`, message router |
| `content.js` | Injected into the target tab: live-DOM extract + picker overlay |
| `picker.css` | Picker highlight + toast styles |
| `popup.html/.js/.css` | Popup UI (drives the tab, reuses the engine) |
| `bridge.js` | Runs on the web app's pages; relays fetches to the worker |
| `engine/` | **Copy** of `../engine/` (the shared engine) |

## Keeping the engine in sync

`extension/engine/` is a copy of the repo's single source of truth at
`scraper/engine/`. After editing the engine, re-copy:

```
npm run sync:ext-engine   # from repo root
```

## Packaging for the Chrome Web Store

Zip the `extension/` folder (with a real `icon128.png`) and upload. Wire a real
license provider by replacing `verifyLicense()` in `engine/entitlement.js`
(e.g. ExtensionPay) — the gating is already in place.
