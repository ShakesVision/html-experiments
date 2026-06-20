# Master InPage Reverse Engineering & Parser Guide

This document serves as the definitive reference and working guide for parsing, reverse engineering, and converting InPage `.inp` files. If the codebase is ever lost, this guide contains all the technical specifications, file format layouts, encoding rules, and algorithmic patterns required to rebuild the entire suite from scratch.

---

## 1. The OLE/CFB Compound File Binary Format

InPage `.inp` files are compound documents stored in the **OLE Compound File Binary (CFB)** format (also known as Microsoft Compound Document File format). It acts as a "file system within a file," containing virtual directories (storages) and files (streams).

### 1.1 Header Structure
Every `.inp` file begins with a 512-byte header. The first 8 bytes contain the magic signature:
* **Magic Hex:** `d0 cf 11 e0 a1 b1 1a e1` (often referred to as "DOCFILE" magic).

Key fields in the header (little-endian):
* **Sector Shift (offset 30, 2 bytes):** Typically `9`, meaning sector size is $2^9 = 512$ bytes.
* **Mini-Sector Shift (offset 32, 2 bytes):** Typically `6`, meaning mini-sector size is $2^6 = 64$ bytes.
* **First Directory Sector (offset 48, 4 bytes):** The sector ID where the Directory Entry chain starts.
* **Mini-Stream Cutoff (offset 56, 4 bytes):** Typically `4096` bytes. Streams smaller than this are stored in the Mini-FAT stream.
* **First Mini-FAT Sector (offset 60, 4 bytes):** Starting sector of the Mini-FAT chain.

### 1.2 FAT and Directory Entries
* **FAT (File Allocation Table):** Chchains sectors together. Sector chains are traversed by looking up the next sector index in the FAT table until a terminator (`0xfffffffe`) is reached.
* **Directory Entry (128 bytes per entry):**
  * **Name (offset 0, 64 bytes):** UTF-16LE encoded name of the storage or stream.
  * **Name Length (offset 64, 2 bytes):** Length of the name in bytes (including null terminator).
  * **Object Type (offset 66, 1 byte):** `1` = Storage, `2` = Stream, `5` = Root Storage.
  * **Starting Sector (offset 116, 4 bytes):** The first sector ID of the stream's data.
  * **Stream Size (offset 120, 8 bytes):** Total size of the stream in bytes.

---

## 2. InPage Content Stream Variants

Inside the parsed CFB directory, the main document text is stored in a stream located in the root directory. There are two primary variants of InPage files, distinguished by the stream name and encoding:

### 2.1 InPage300 (Unicode Variant)
* **Stream Path:** `/InPage300`
* **Encoding:** Standard UTF-16LE Unicode.
* **Characteristics:** Direct mapping to standard Arabic/Urdu Unicode code points (e.g., `0x0627` for Alef, `0x0628` for Beh). Easy to parse directly using standard text decoders.

### 2.2 InPage100 (Legacy Variant)
* **Stream Path:** `/InPage100`
* **Encoding:** Legacy Windows-1252 private-use byte encoding mapped into the Cyrillic block of UTF-16LE.
* **Characteristics:** Requires a custom bi-directional mapping table to convert to standard Unicode.

---

## 3. Deep-Dive: InPage100 Cyrillic Block Encoding

The most complex part of reverse engineering InPage is parsing `/InPage100` streams. The stream contains both document text and binary formatting/layout records.

### 3.1 The 16-Bit Word Structure
In `/InPage100`, characters are represented as 16-bit little-endian words (2 bytes: `low` and `high`):
1. **Text Characters (Urdu, English, Spaces):**
   * **Rule:** The high byte is strictly `0x04`.
   * **Urdu Letters:** The low byte is a legacy CP1252 private-use code (ranging from `129` to `250`).
   * **ASCII Letters/Spaces:** The low byte is a standard ASCII code (ranging from `32` to `126`).
   * **Example:** `81 04` represents Alef (`low = 129`, `high = 4`). `20 04` represents a space (`low = 32`, `high = 4`).
2. **Control, Formatting, and Structural Bytes:**
   * **Rule:** The high byte is strictly `0x00`.
   * **Example:** `94 00` is a paragraph/style delimiter. `0d 00` is a carriage return. `20 00` is a structural padding byte.
   * **Crucial Discovery:** If you do not check the high byte and only check the low byte, you will parse structural formatting records as random Urdu letters (e.g., treating `94 00` as `ص`), resulting in severe gibberish.

### 3.2 The Extraction Algorithm
To extract clean text runs from an `/InPage100` stream, use the following state machine:

```javascript
export function extractScatteredLegacyUtf16(bytes, convertByte, options = {}) {
  const gapThreshold = options.gapThreshold ?? 4; // Max allowed non-text bytes between characters
  const minChars = options.minChars ?? 4;         // Min characters to form a valid text run
  const units = [];

  // 1. Scan the stream and collect valid text units
  for (let i = 0; i + 1 < bytes.length; i += 2) {
    const low = bytes[i];
    const high = bytes[i + 1];
    
    const isLegacy = (low >= 129 && low <= 250) && high === 0x04;
    const isAscii = (low >= 0x20 && low <= 0x7e) && high === 0x04;
    const isBreak = (low === 0x0d || low === 0x0a) && high === 0x00;

    if (isLegacy) {
      units.push({ offset: i, code: low, kind: "legacy" });
    } else if (isBreak) {
      units.push({ offset: i, code: low, kind: "break" });
    } else if (isAscii) {
      units.push({ offset: i, code: low, kind: "ascii" });
    }
  }

  const runs = [];
  let bucket = [];

  const flush = () => {
    if (bucket.length < minChars) {
      bucket = [];
      return;
    }
    let text = "";
    for (const unit of bucket) {
      if (unit.kind === "break") text += "\n";
      else if (unit.kind === "ascii") text += String.fromCharCode(unit.code);
      else text += convertByte(unit.code);
    }
    text = text.normalize("NFC");
    if (!text.trim()) {
      bucket = [];
      return;
    }
    runs.push({
      offset: bucket[0].offset,
      lengthBytes: bucket[bucket.length - 1].offset - bucket[0].offset + 2,
      lengthChars: text.length,
      decodedText: text,
      confidence: confidenceForText(text),
      encoding: "legacy-scattered",
    });
    bucket = [];
  };

  // 2. Group units into runs based on gap threshold
  for (const unit of units) {
    if (bucket.length) {
      const gap = unit.offset - bucket[bucket.length - 1].offset;
      if (gap > gapThreshold) flush();
    }
    bucket.push(unit);
  }
  flush();
  return runs;
}
```

---

## 4. Bi-directional Unicode ↔ InPage Conversion

Conversion relies on XML mapping tables: `InpageToUni.xml` and `UniToInpage.xml`.

### 4.1 Resolving Duplicate Mappings
* **The Problem:** The mapping tables contain duplicate entries. For example, the InPage code `32` (space) has 28 mappings in the XML, with the last one mapping to `1730` (`ۂ`). If you overwrite mappings sequentially, spaces will convert to `ۂ`.
* **The Solution:** When building the `inpageToUni` Map, **only keep the first mapping** for any given InPage code. The first mapping is the primary character (e.g., `32` maps to `32` space).

```javascript
export function buildInpageToUniMap(rows = []) {
  const map = new Map();
  for (const row of rows) {
    if (row.ignore === "T" || row.ignore === "TRUE" || row.ignore === "1") continue;
    if (!Number.isFinite(row.inpageDec) || !Number.isFinite(row.unicodeDec)) continue;
    
    // CRITICAL: Keep the first primary mapping, do not overwrite!
    if (!map.has(row.inpageDec)) {
      map.set(row.inpageDec, row.unicodeDec);
    }
  }
  return map;
}
```

### 4.2 The 16-Bit EOT-Prefixed Format (`\u0004`)
Many legacy Urdu converters (including Naseem) output InPage text as a 16-bit stream where each character is prefixed with the control character `\u0004` (End of Transmission).
* **Unicode to InPage (Prefixed):** Convert each Unicode character to its legacy byte, and prepend `\u0004` to each byte (e.g., `\u0004\u0081\u0004\u0092` for `"اس"`).
* **InPage to Unicode (Prefixed):** Strip out all `\u0004` characters first, then pass the remaining legacy text to the standard decoder.

---

## 5. Architectural Blueprint of the Rebuilt Suite

To rebuild the browser-based InPage Suite, organize the code into these modular ES modules:

1. **`cfb-reader.js`**: Parses the OLE Compound File structure, FAT, and Directory Entries. Resolves the main content stream.
2. **`xml-loader.js`**: Loads and parses the XML mapping tables.
3. **`bidi-converter.js`**: Implements bi-directional conversion using the maps, including standard space preservation and `\u0004` prefix handling.
4. **`inp-record-parser.js`**: Scans content streams, filters out structural bytes using the `high === 0x04` rule, and extracts clean text runs.
5. **`inp-ast-builder.js`**: Groups text runs into paragraphs and pages, decodes styling prefixes (bold, italic, font size, alignment), and maps footnotes.
6. **`reader-app.js`**: Wires up the UI, handles tab switching, file uploads, page navigation, and rendering with proper Urdu typography (Nastaliq font stack, `leading-[2.5]` line height, and large font sizes).
