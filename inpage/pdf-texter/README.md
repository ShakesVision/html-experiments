# Webapp Prototype

Static browser-first prototype for the old Naseem PDF Texter.

## What it does

- loads the original XML mapping files from the legacy C# project
- processes the PDF fully in-browser with `mupdf` WebAssembly
- supports single-page, range, or whole-book processing
- applies the JavaScript port of the legacy ligature cleanup logic
- uses MuPDF glyph/font callbacks instead of the old PowerShell preprocessing path

## Current constraints

- paragraph mode is heuristic; there is no explicit paragraph marker in these InPage PDFs
- MuPDF gives us the real subset font names and glyph payloads, but line clustering still needs more parity work on difficult pages
- text order/content cleanup is improved but not yet guaranteed to match the legacy C# app byte-for-byte
- the `mupdf` npm package is AGPL/commercially licensed, so shipping this path may require license review

## Local testing

Run from the `webapp` folder:

```powershell
npm test
```

To use the UI, serve the repo with any static file server so the browser can fetch:

- `webapp/index.html`
- `UnicodeToInpage/*.xml`
- `webapp/node_modules/mupdf/dist/*`

Opening `index.html` directly from `file://` may block `fetch()` in some browsers.

## Recommended use

1. Start from page `5` for `hp1.pdf`, because that is where the sample book text begins.
2. Keep `Break Mode` on `Paragraph` for the best current output.
3. Use the `Debug` panel to inspect recovered MuPDF font names if output quality looks off.
