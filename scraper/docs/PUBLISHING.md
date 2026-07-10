# Publishing &amp; deployment

How to ship every part: the web app, the browser extension (Chrome / Edge /
Firefox), monetization, and a future Android build.

- [Web app](#web-app)
- [Browser extension](#browser-extension)
- [Firefox / Edge](#firefox--edge)
- [Monetization](#monetization)
- [Android (Capacitor)](#android-capacitor)
- [Pre-publish checklist](#pre-publish-checklist)

---

## Web app

The web app is static — it ships with the rest of `tools.shakeeb.in`.

1. From the repo root, regenerate site assets and verify:
   ```bash
   npm run sync:all     # heads, tailwind, manifest, site assets, README
   npm run check        # validate-site, third-party audit, generated files
   npm test             # engine suite
   ```
2. Commit &amp; push. GitHub Pages (or your host) serves `scraper/index.html` at
   `/scraper/`.
3. No build step for the app itself — it's plain ES modules + the repo's
   prebuilt Tailwind CSS.

> The app has **no external runtime dependency**. `linkedom` is dev-only (tests)
> and never shipped.

---

## Browser extension

The extension is **not** served by the website; it's packaged and published
separately.

### 1. Sync the engine
The extension bundles a copy of the engine (MV3 can't import from outside its
own folder). Always run this before packaging:
```bash
npm run sync:ext-engine
```

### 2. Add a real icon
Replace `extension/icon128.png` with a proper 128×128 PNG. For best store
presentation also add 16/32/48 sizes and reference them in `manifest.json`
under `"icons"` and `action.default_icon`.

### 3. Test locally
`chrome://extensions` → **Developer mode** → **Load unpacked** →
`scraper/extension/`. Smoke test on `https://chartink.com/screener/minervinitest`:
Pick on page → Scrape → export.

### 4. Package
Zip the **contents** of `extension/` (not the parent folder):
```bash
cd scraper/extension && zip -r ../scrape-extension.zip . -x "*.DS_Store"
```

### 5. Chrome Web Store
1. Create a developer account (one-time fee) at the Chrome Web Store Developer
   Dashboard.
2. Upload the zip. Provide: store icon, 1280×800 screenshots, a short + full
   description, and a category (Productivity).
3. **Privacy:** declare that data is processed locally and not transmitted. The
   `activeTab` + on-demand `<all_urls>` model keeps the review straightforward —
   justify host access as "fetch pages the user asks to scrape."
4. Submit for review.

---

## Firefox / Edge

- **Edge:** the same MV3 package works. Publish via Microsoft Partner Center.
- **Firefox:** MV3 support differs. Typically:
  - Add a `browser_specific_settings.gecko.id`.
  - Firefox uses `scripting`/`activeTab` similarly, but background is an *event
    page*; test the service-worker code under Firefox's model.
  - Submit via addons.mozilla.org (AMO).
- Consider `webextension-polyfill` if you want one codebase to use `browser.*`
  promises across engines. Current code uses `chrome.*` (works in Chrome/Edge).

---

## Monetization

Gating is already implemented; only the **license check** is a stub. To turn on
real payments, replace one function.

- **File:** `engine/entitlement.js` → `verifyLicense(key)`.
- Today it accepts any key shaped `SCR-XXXX-XXXX` (local testing).
- **Extension →** [ExtensionPay](https://extensionpay.com): add `extpay.js`,
  init with your extension ID, and make `verifyLicense`/`isPro` consult
  `extpay.getUser().paid`. No backend needed.
- **Web app / Android →** [Gumroad](https://gumroad.com) or
  [LemonSqueezy](https://lemonsqueezy.com) **license keys**: sell a key, then
  have `verifyLicense` call the provider's license-verify API and cache the
  result.
- The free/Pro **feature map** and the **daily row cap** live in the same file
  (`PRO_FEATURES`, `FREE_ROW_CAP`) — adjust the split there.

Because gating is centralized, wiring a provider is a small, isolated change and
doesn't touch the UI.

---

## Android (Capacitor)

The web app is responsive and ready to wrap; the transport layer already
detects a native environment.

1. Scaffold: `npm create @capacitor/app`, set the web dir to a copy of
   `scraper/` (app files + `engine/`).
2. Add `@capacitor/core` and the HTTP plugin. In `engine/fetcher.js` the
   `capacitor` transport calls `window.CapacitorHttp.get(...)`, which bypasses
   CORS natively — wire the plugin so `window.Capacitor.isNativePlatform()` is
   true and `CapacitorHttp` is available.
3. `npx cap add android` → `npx cap sync` → open in Android Studio → build.
4. The picker's live-DOM path (extension-only on desktop) isn't available in a
   wrapped web view, but native HTTP + paste-HTML + fetch cover the mobile use
   cases; a WebView content-script picker is a later option.

This is a planned phase — see [ROADMAP.md](ROADMAP.md).

---

## Pre-publish checklist

- [ ] `npm test` green
- [ ] `npm run sync:ext-engine` run; `extension/engine/` matches `engine/`
- [ ] Real icons in `extension/` (16/32/48/128)
- [ ] Extension smoke-tested on a live JS site (Chartink)
- [ ] Store listing: description, screenshots, privacy statement
- [ ] `verifyLicense()` pointed at a real provider (or intentionally left open)
- [ ] `npm run check` green (from repo root)
