# MuPDF Spike

## What this script does

Tests the official `mupdf` npm package directly against `hp1.pdf` page 5.

## Scripts

- `mupdf-spike.mjs`
  - inspects page 5 using MuPDF structured text and low-level text device callbacks
  - writes a JSON report to `notes/mupdf-page5-spike.json`

- `mupdf-transform-page5.mjs`
  - reconstructs a MuPDF raw-like run stream for page 5
  - passes those runs through the existing JS legacy transform
  - writes:
    - `notes/mupdf-page5-raw-like.txt`
    - `notes/mupdf-page5-transform-report.json`
    - `out/mupdf-page5-paragraph.txt`

## Run

From `webapp`:

```powershell
node .\scripts\mupdf-spike.mjs
node .\scripts\mupdf-transform-page5.mjs
```

## Why this matters

This is the first browser-compatible engine in the project that has exposed:

- real subset font names like `AAWXAE+NOORIN01`
- glyph ids
- unicode/glyph payload values like ``, ``
- low-level text callbacks via MuPDF `Device` + `Text.walk()`

That means MuPDF is a serious candidate for replacing the legacy PowerShell/iTextSharp extraction path in a true frontend-only build.

## Current caveat

The MuPDF proof-of-concept is promising but not parity-complete yet.
The first reconstructed page-5 output is close enough to prove access to the right primitives, but still needs line grouping and layout tuning before it can replace the CLI extractor.
