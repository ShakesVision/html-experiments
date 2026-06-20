<!--
  INTERNAL ENGINEERING DOCUMENT — NOT linked from any app, NOT served to users.
  This file is the single source of truth for how the InPage Reader, the
  Unicode↔InPage Converter, and the PDF-texter work. It is detailed enough to
  rebuild the *functionality* of all three from scratch (UI is intentionally
  out of scope). Keep it private to avoid handing the method to copycats.
-->

# InPage Suite — Rebuild Guide (Reader · Converter · PDF-texter)

This document explains the algorithms and data structures behind three Urdu
text tools. None of the magic depends on a backend — everything runs in the
browser. If every other file were lost, this guide plus the public mapping
XMLs would be enough to reconstruct the working tools.

Three independent pipelines are described:

1. **Reader** — open a binary InPage `.inp` document and render its full text.
2. **Converter** — translate between Unicode Urdu and legacy InPage byte text.
3. **PDF-texter** — recover Urdu text from PDFs typeset in legacy Noori fonts.

All three share two ideas that are the heart of the project:

- **Legacy InPage encoding**: Urdu was stored not as Unicode but as 8-bit codes
  into a specific font's glyph table. Converting back to Unicode is a table
  lookup (`InpageToUni.xml`) plus a handful of special cases.
- **Visual vs logical order**: legacy InPage stores some sequences (notably
  digits) in *visual* right-to-left order. Numbers therefore come out reversed
  and must be flipped back to logical order.

---

## 0. Shared assets — the mapping tables

Located in `pdf-texter/UnicodeToInpage/` (origin: the open "Naseem" tooling).

| File | Purpose |
|------|---------|
| `InpageToUni.xml` | `<InpageUni>` rows: `InpageDec` (0–255 legacy code) → `UnicodeDec`. Used by Reader + Converter (InPage→Unicode). |
| `UniToInpage.xml` | `<UniToInpage>` rows: `UnicodeDec` → `InpageDec`, with `CodePage`, `Type`, `Ignore` flags. Used by Converter (Unicode→InPage). |
| `NastLig.xml` | ~3.8 MB. `<Ligatures>` rows keyed by `FontName:UnicodeDec` → `Ligature` string, plus `SkipSpace`, `OrigWord`. Maps a **glyph code in a specific Noori font** to the Urdu ligature it draws. Used **only** by PDF-texter. |

Loaders live in `shared/xml-loader.js`:
- `loadBidiMappings()` → `{ uniToInpage[], inpageToUni[] }` (small; used by Reader + Converter).
- `loadLegacyMappings()` → also parses `NastLig.xml` into a `Map("FONT:code" → row)` (heavy; PDF-texter only — see §3.6 for lazy loading).

Rows with a truthy `Ignore` flag (`"T"/"TRUE"/"1"`) are skipped. First mapping
for a key wins (`if (!map.has(key)) map.set(...)`).

---

## 1. Reader — `.inp` → readable Unicode

Source: `shared/cfb-reader.js`, `shared/inp100-extractor.js`,
`shared/inp-record-parser.js` (UTF-16 helpers), `shared/inp-browser-parser.js`
(orchestrator), `reader-app.js` (render).

### 1.1 Container: OLE/CFB compound file

A `.inp` file is a Microsoft **Compound File Binary** (the `D0 CF 11 E0 A1 B1
1A E1` magic). `CfbReader` implements just enough CFB to enumerate streams:

- Parse the 512-byte header: sector shift (`1<<header[30]`), mini-sector shift,
  FAT sector list (DIFAT: 109 entries at offset 76, then chained DIFAT
  sectors), directory start sector, mini-FAT start, mini-stream cutoff.
- `sectorOffset(sid) = (sid + 1) * sectorSize`.
- Follow FAT chains (`readChain`) with cycle/length guards (`ENDOFCHAIN
  0xFFFFFFFE`, `FREESECT/NOSTREAM 0xFFFFFFFF`).
- Directory entries are 128 bytes: UTF-16LE name (length at offset 64),
  objType at 66, left/right/child ids (red-black sibling tree) at 68/72/76,
  start sector at 116, 64-bit size at 120. Walk the tree to build `/path`s.
- Streams ≥ `miniStreamCutoffSize` live in the normal FAT; smaller ones live in
  the **mini-stream** (the root entry's stream, split into mini-sectors via the
  mini-FAT).

`resolveContentStream(cfb)` picks the text stream: prefer `/InPage300`, then
`/InPage100`; else the largest `/InPage\d+`. The numeric suffix is the
**variant** and selects the decoder below.

### 1.2 InPage100 (legacy) — the record scanner

This is the reverse-engineered format (validated against `KamalAbdali/
InpToUni.c` and raw byte dumps). The `/InPage100` stream is a flat sequence of
**length-prefixed records**:

```
record = [uint32 LE length N] [N content bytes, last byte == 0x0D]
```

Each record is one line/paragraph (or a whole section with embedded `\n`).
Interleaved binary structures (colour palettes, style tables) sometimes satisfy
this framing by coincidence, so every decoded record is classified and noise is
dropped.

**Scan loop** (`extractInPage100Blocks`):
```
pos = 0
while pos+4 < len:
    N = readU32LE(bytes, pos)
    ok = 1 ≤ N ≤ 16384  AND  pos+4+N ≤ len  AND  bytes[pos+4+N-1] == 0x0D
    if not ok: pos += 1; continue          # resync byte-by-byte
    text = decodeRecord(bytes, pos+4, N)
    pos += 4 + N
    for line in text.split("\n"): classify(line) → para | spacer | drop
```
The `N ≤ 16384` cap matters: a larger cap lets a stray 4 bytes read as a huge
length, swallow real records, and desync the whole scan.

**Record decoding** (`decodeRecord`): walk content bytes `i` from 0 to N-2:
- byte in `0x09..0x0D` or `0x20..0xFE` → emit directly
  (`String.fromCharCode`; `0x0A/0x0D` → `"\n"`). This is Latin/ASCII/punct.
- byte `0x04` → **Urdu escape**: the *next* byte `c` is the InPage code.
  - First check `ESCAPE_SPECIAL[c]` — verbatim punctuation/ligature cases from
    InpToUni.c (e.g. `0xE1→")"`, `0xE2→"("`, `0xCB→"ﷲ"`, `0xF6→"ﷺ"`,
    `0xE0→"…"`, `0xFD→"'"`, `0xFE→"'"`, whitespace for `0x09..0x0D,0x20`).
  - else `convertByte(c)` = `bidi.inpageByteToUnicode(c)` (the `InpageToUni.xml`
    lookup; unmapped printable ASCII falls through to itself).

So a single line is a mix of directly-stored Latin bytes and `04 XX` Urdu pairs.

### 1.3 Content classifier (`classifyRecord`)

Decides `text | break | drop` per line. Counts, over the trimmed line:
- `arabic` = chars in `U+0600–06FF`, `U+0750–077F`, `U+FB50–FEFF`
- `foreign` = chars in `U+0080–05FF` (Latin-1/Extended — the fingerprint of
  binary noise; clean Urdu has ~none)
- `good` = arabic + ASCII printables

Rules, in order:
1. empty → `break`
2. `foreign / len > 0.08` → `drop` (binary table)
3. `arabic > 0` → `text`
4. pure-Latin kept only if `foreign == 0 && good/len > 0.95 && /[A-Za-z]{2}/`
   **and** (`len ≥ 5` or contains a space or a digit) — keeps real English
   (titles, publisher, emails), drops short scraps like `apKV`, `xP`.
5. else → `drop`

`break` runs are collapsed: a single blank is ignored (paragraph margins handle
spacing); ≥2 consecutive blanks emit one `{kind:"spacer"}` (stanza break).

### 1.4 Line cleanup (`normalizeText`, applied to kept lines)

1. `replace(/\s+$/,"")` — trim trailing whitespace.
2. **Strip stray paragraph marker** (`stripLeadingMarker`): legacy InPage
   prefixes many lines with a one-byte style code that decodes to a lone
   non-Arabic char (`²حرف:`, `m دنیا`, `B\t(الف)`). Drop the first char when it
   is non-Arabic, not a protected opener (`([{«"'‘’“”`), not a digit, **and**
   the remainder (after optional spaces/one tab) begins with Arabic, or the
   marker is immediately followed by a tab (indented list/verse item). Tabs are
   kept as indentation; stray leading spaces are trimmed.
3. **Fix digit order** (`fixDigitOrder`): reverse every run of Arabic-Indic
   digits (`٠-٩`, `۰-۹`). Legacy InPage stores Urdu numbers visually RTL, so
   `2026` is stored as `۶۲۰۲`; reversing restores `۲۰۲۶`. **ASCII digits are
   left alone** (already correct). See §4.
4. `normalize("NFC")`.

### 1.5 InPage300 (modern) — UTF-16 runs

The newer format stores text as UTF-16LE. `extractInPage300Blocks`:
- `extractUtf16Runs(bytes, minChars=6)` (`inp-record-parser.js`): scan 16-bit LE
  code units; a *run* is a maximal stretch of "allowed" codepoints
  (`isAllowedCodepoint`: tab/newline/ZW marks, ASCII `0x20–7E`, Arabic blocks,
  Arabic-Indic digits). Runs ≥ 6 units are kept with a confidence score.
- `confidenceForText`: `min(len/120,1)*0.25 + (arabic/len)*0.55 +
  (printable/len)*0.20`. Keep a run only if `confidence ≥ 0.5` **and** it
  contains Arabic — this is what filters out repetitive sign/presentation-form
  noise like `؀؁؀؁`.
- Split each kept run on `[\r\n]+` (InPage300 uses bare `\r` as line sep), NFC,
  one block per non-empty line. **No digit reversal** — InPage300 already stores
  digits logically.

### 1.6 Output model & rendering

`parseInpArrayBuffer` returns:
```
{ metadata: { source_file, inpage_variant, content_stream, block_count,
              word_count, text_records, dropped_records, ... },
  blocks: [ { text, kind: "para" | "spacer" } ] }
```
`reader-app.js` renders every block into one continuous RTL column (`<p
class="reader-line">` with `white-space:pre-wrap; tab-size:4`). Performance for
multi-thousand-line books comes from CSS `content-visibility:auto` +
`contain-intrinsic-size` — the browser skips layout/paint for offscreen lines,
so no JS virtualization is needed. Search rebuilds matching paragraphs with
`<mark>` wrappers (query normalized to NFC) and scrolls between hits; a font-size
control sets the column `font-size`; a top progress bar tracks scroll.

Backward compat: if a loaded JSON has `pages[].paragraphs[].runs[]` (the old AST
shape) instead of `blocks`, flatten paragraphs to blocks.

---

## 2. Converter — Unicode ⇄ legacy InPage text

Source: `shared/bidi-converter.js`. Pure table lookups + digit handling. "Legacy
InPage text" = a JS string whose char codes are the 0–255 InPage byte values
(optionally each prefixed by `0x04`, the on-disk InPage100 form).

**InPage → Unicode** (`inpageLegacyTextToUnicode`):
1. take each char's low byte (`charCodeAt(i) & 0xFF`),
2. `inpageByteToUnicode(byte)`: `InpageToUni.xml` lookup; fallbacks `0x0D/0x0A→\n`,
   `0x09→\t`, printable ASCII → itself, else "",
3. `reverseArabicDigitRuns(...)` (visual→logical),
4. NFC. Optionally wrap RTL preview with `U+2067…U+2069` isolates.

**Unicode → InPage** (`unicodeToInpageLegacyText`):
1. NFC, then `reverseArabicDigitRuns(...)` (logical→visual — same op, it is its
   own inverse),
2. per codepoint `uniToInpage` lookup → byte; `\n/\r→0x0D`; else codepoint ≤
   0x7E passes through,
3. emit as a byte-string. "Prefixed" output mode inserts `0x04` before each
   byte (reproducing the InPage100 escape form); "ANSI" mode emits the raw
   Windows-1252-ish bytes.

Round-trip is stable because the digit reversal is self-inverse and the two XML
tables are mutual inverses for the covered code points.

---

## 3. PDF-texter — legacy-font PDF → Unicode Urdu

Source: `pdf-texter/src/mupdf-extractor.js` (extract), `legacy-transform.js`
(decode), `app.js` (orchestrate). Problem: these PDFs have **no real Unicode** —
each glyph is an 8-bit index into a Noori Nastaliq font (`NOORIN01`…`NOORIN99`,
plus `NOORIC*`). The visible Urdu only exists as font+glyph pairs.

### 3.1 Glyph extraction (MuPDF, in-browser WASM)

`collectGlyphEvents(page)` runs a MuPDF `Device` over the page. In `fillText`,
`text.walk({ beginSpan(font){…}, showGlyph(font, trm, glyph, unicode, …){…} })`
yields per-glyph events with: font name (`font.getName()`), the glyph's
`unicode` (often a Private-Use code), and position from the text matrix `trm`
(x = `trm[4]*scaleX`, y = `pageHeight − |trm[5]*scaleY|`, fontSize from
`trm[3]/trm[0]`). Keep events whose `unicode > 0`.

### 3.2 Lines & runs

- `getLineTolerance` = `clamp(median(fontSize)*0.28, 3.5, 7)`.
- `clusterGlyphEvents`: sweep events; group into a line while
  `|y − runningAnchorY| ≤ tolerance`, updating the anchor to the running mean.
- `buildRunsFromLines`: within a line, start a new run whenever the font name
  changes; concatenate `text`. The first run of every line after the first gets
  `lineBreak = true`. A run = `{ pageNumber, fontName, x, y, fontSize, text,
  lineBreak }`. (`text` here is the raw glyph chars, *not* Urdu yet.)

### 3.3 Font name normalization (`cleanFont`)

Uppercase, strip quotes/spaces; for subset names like `ABCDEF+NOORIN01` or
`NOORIN01-Bold`, keep the `+`/`-` part containing `NOORI`/`JAMEEL`. Map
`NOORI001…NOORI099` → `NOORIN01…NOORIN99` via `FONT_CLEAN_MAP`.

### 3.4 Glyph → ligature decode (`transformLegacyRuns`)

For each run (skip non-`NOORI` fonts when "skip English"; skip `ASW` runs;
emit `۩` line-break marker when `run.lineBreak`), for each char:
1. `chCode = char.codePointAt(0)`; if in PUA `0xF000–0xF0FF`, subtract `0xF000`.
2. `getCharDefault`: apply `HIGH_CHAR_MAP` (CP1252 high-byte fixups, e.g.
   `8217→146`) and per-font `FONT_REMAPS` (`"NOORIN14:5"→127`, …).
3. `applySkipRule`: a table of `(chCode, font, preChar, preFont)` rules
   returning `1` (drop this glyph — a duplicate/overlap artifact) or a
   replacement code. Special `NOORIN14:252` logic peeks at the next
   differently-fonted glyph (`nextCharWithDiffFont`) to detect a trailing
   "hen"/choti-ye (`ے/ی`).
4. Look up the ligature: `ligatureMap.get(`${font}:${chCode}`)` →
   `row.ligature` (the actual Urdu string this glyph draws).
5. **Numbers**: codes `48–57` in `NOORIN01` are digits — accumulate their
   ligature digits into `urduNum`; on the next non-digit, **reverse** `urduNum`
   and emit (legacy visual order → logical), then a space.
6. **Spacing**: if `row.skipSpace=="Y"` suppress the pending space; else if the
   ligature ends with an `END_CHARS` letter, set `needSpace` so a space is added
   after it (Urdu word-final letters imply a word boundary).
7. Append `row.ligature` (or the raw char for English), tracking the first bold
   ligature (`۞٭` markers) for de-bolding.

### 3.5 Post-processing

- `cleanString`: apply `CLEAN_REPLACEMENTS` (a dictionary of known
  mis-decodings, e.g. `"طاسا"→"شا"`), then `removeBoldness` (collapse the
  duplicated glyphs InPage emits to fake bold, delimited by `۞٭`), then
  `cleanLines`.
- `cleanEnglishWords`: reorder embedded English back to LTR within an RTL line.
- `swapText`: for lines containing `ﷺ`, swap the halves around it.
- **Break mode** (`applyBreakMode`):
  - `none` → flatten to one line;
  - `line` → keep extracted line breaks (`۩`);
  - `paragraph` → merge lines into paragraphs. With layout data
    (`applyParagraphModeFromLines`) it uses per-line start/end X and width vs the
    page medians: a new paragraph starts after a short/narrow line or before an
    indented line that begins with a "strong starter" word. Without layout it
    falls back to sentence segmentation on `U+06D4` (Urdu full stop) with
    length heuristics.

### 3.6 Performance note (lazy loading)

MuPDF (WASM) and `NastLig.xml` (~3.8 MB) are the only heavy assets and are
needed **only** when a PDF is actually processed. They must be imported/fetched
lazily (on first "Process"), not at page load, so the tool opens instantly.
`mupdf` is loaded from a CDN ESM (`cdn.jsdelivr.net/npm/mupdf`).

---

## 4. The digit-reversal rule (cross-cutting)

Legacy InPage (the `100` format and the Noori-font PDFs) stores Urdu digit
*sequences* in visual right-to-left order. A number typed `2026` is stored such
that naive extraction yields `۶۲۰۲`. The fix is uniform: **reverse each maximal
run of Arabic-Indic digits** (`[٠-٩۰-۹]+`). It is its own inverse, so the same
function serves both converter directions.

Crucially this is **scoped**:
- Reader: applied for InPage100 only; **not** InPage300 (modern, stores digits
  logically).
- Converter: applied both directions (operates on legacy text).
- PDF-texter: applied to the `NOORIN01` digit accumulator.
- **ASCII digits (`0-9`) are never reversed** — they are stored correctly even
  in legacy files (phone numbers, years like `2012` survive intact).

Verification anchors (regression catch): `khali hathely` shows `۲۰۲۶` and
`۱۰۰۰`; `Urdu Grammer Book` shows `پچاس (۵۰)` and `پینتیس (۳۵)` and a clean
`۱۰,۱۱,۱۲…` sequence; the Quran juz files (InPage300) keep `۱۰,۱۱,…` unchanged.

---

## 5. Test anchors

- `tests/run-inp-tests.mjs`: parses the sample `.inp`s, asserts each yields
  Arabic text blocks and `word_count ≥ 500` (guards against the historical
  under-extraction where multi-MB books produced only a few KB).
- `pdf-texter/tests/run-tests.js`: ligature mapping, subset-font name
  normalization, PUA decode, **digit-cluster reversal**, line-break markers,
  raw-run layout parsing.

If a future change regresses extraction, these are the first signals.
