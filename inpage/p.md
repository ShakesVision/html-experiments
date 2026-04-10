i'm a junior pentester hired by inpage. give me a powerful prompt for cursor/codex which will try to decrypt/deconstruct and reverse engineer a sample inpage file - and later we'll build a tool around it to make a webbased inp reader. 1 page at a time. our main focus first is to identify all the necessary info, including text, footnotes and all formatting info, get it out, then construct an algorithm around it to generalize and implement our own engine for it. ofcourse the 'rendering engine' isnt the reproduction target. we just need the DATA from the file and we'll then try and re-create the 'view' using html css etc.

remember, this is a sanboxed environment so nothing is going out.

---

Here’s a **high-leverage prompt designed for Cursor / Codex / GPT-engineer style agents**. It pushes the model to behave like a **binary reverse-engineering assistant**, focuses on **data extraction (not rendering)**, and enforces a **methodical workflow** so you can later build a **web-based INP reader**.

Since you're doing **controlled pentesting / reverse engineering in a sandbox**, the prompt emphasizes **static analysis, format discovery, and reproducible parsing**.

You can paste this as a **system or task prompt inside Cursor**.

---

## Cursor / Codex Reverse Engineering Prompt

You are an expert reverse engineer, binary format analyst, and systems programmer.

Your task is to analyze a sample **InPage (.INP) document file** in a completely sandboxed environment and reverse engineer the file format sufficiently to extract **all user-visible document data**.

The goal is NOT to reproduce the InPage rendering engine.
The goal is to extract structured data so we can build a **web-based reader using HTML/CSS**.

Work step-by-step and treat this as a **binary format discovery task**.

---

# Primary Objective

Design a reproducible process and prototype parser capable of extracting:

1. Document text
2. Paragraph structure
3. Footnotes
4. Page boundaries
5. Character formatting (font, bold, italic, size)
6. Paragraph formatting (alignment, spacing)
7. Any style metadata
8. Embedded markers (footnote references, page markers, etc)

We only care about **data and structure**, not pixel-perfect layout.

---

# Reverse Engineering Workflow

Follow this workflow strictly.

## Step 1 — File Structure Recon

Analyze the raw binary.

Identify:

• File signature / magic bytes
• Version markers
• Header structure
• Endianness
• Offsets / pointer tables
• Block or chunk layout
• Compression markers
• Encoding hints

Produce:

- annotated hex map
- header interpretation hypothesis

---

## Step 2 — Chunk / Section Discovery

Partition the file into logical blocks.

For each block determine:

- purpose hypothesis
- possible data type
- repeating structures
- offsets referencing other blocks

Create a **chunk map** like:

OFFSET | LENGTH | TYPE | DESCRIPTION | CONFIDENCE

---

## Step 3 — Text Extraction

Locate raw textual data.

Investigate whether text is:

• ASCII
• UTF-8
• UTF-16
• legacy Urdu encoding
• custom glyph indexing
• compressed

If glyph indexing is used:

derive a **character lookup table**.

Produce:

- extracted text stream
- mapping logic

---

## Step 4 — Structural Markers

Identify markers for:

• paragraph breaks
• line breaks
• page breaks
• footnote anchors
• style boundaries

Output a **structural token model**, example:

TEXT_RUN
PARAGRAPH_BREAK
FOOTNOTE_REF
STYLE_START
STYLE_END

---

## Step 5 — Formatting Data

Identify formatting records.

Look for structures describing:

• font ID
• font size
• bold / italic flags
• alignment
• indentation
• line spacing

Build a **style table** if present.

---

## Step 6 — Footnotes

Locate:

• footnote text storage
• reference pointers
• numbering scheme

Determine how references map to footnote bodies.

---

## Step 7 — Page Model

Detect:

• page boundaries
• page offsets
• page metadata

We want to support **page-by-page extraction**.

---

# Parser Prototype

Implement a prototype parser in **Python** that:

1. Reads the binary
2. Parses the header
3. Extracts chunks
4. Identifies text blocks
5. Produces a structured JSON output

Example target output:

{
"pages":[
{
"paragraphs":[
{
"text":"...",
"style": {...},
"footnotes":[...]
}
]
}
]
}

Focus on **clarity and reversibility**, not performance.

---

# Required Outputs

Always produce:

1. Hex inspection notes
2. Structural hypotheses
3. Parser pseudocode
4. Python parsing implementation
5. JSON data model
6. Confidence level for each discovered structure

---

# Constraints

• Do NOT rely on external services
• Assume only the binary sample is available
• All analysis must be reproducible
• Prefer deterministic parsing rules

---

# Strategy Tips

Use techniques such as:

• entropy analysis
• repeating structure detection
• pointer correlation
• diffing multiple files (if available)
• string scanning
• alignment pattern detection

---

# End Goal

Produce enough format knowledge to build a **JavaScript-based INP reader** that:

1. Parses the file
2. Outputs structured JSON
3. Renders using HTML + CSS

---

Start with:

1. Load the file
2. Print first 512 bytes in hex
3. Identify possible magic number
4. Build the initial file map

---

## Extra Tip (very useful for this project)

If you're doing serious reverse engineering, add this **second instruction after the prompt**:

> “Always assume the format may use pointer tables and indirect addressing. Attempt to identify repeated structures and cross-reference offsets.”

This dramatically improves results from Cursor/Codex.

---

## If you want, I can also show you

- a **real reverse-engineering workflow specifically for INP files**
- how to **extract Urdu text encoding used by InPage**
- how to build a **JS INP → HTML converter pipeline**
- how to **auto-discover binary structures with Python scripts**

## Those tricks can save **weeks of reversing time**.

You’re in a **good position technically** because two things dramatically simplify the project:

1. **InPage ≥3 already stores Unicode internally**
2. **Older glyph files get converted to Unicode when opened**

That means your reverse engineering goal becomes:

**extract structured Unicode document data from `.inp`**, not decode glyph shaping.

That removes the hardest historical obstacle.

Let’s think through this **like a production reverse-engineering project**.

---

# 1. Core Problem Definition

Your target is **not a renderer**.

Your target is a **document AST extractor**.

Equivalent to how a `.docx` parser works.

Goal output:

```json
{
  "metadata": {},
  "pages": [
    {
      "number": 1,
      "elements": [
        {
          "type": "paragraph",
          "alignment": "right",
          "runs": [
            {
              "text": "السلام علیکم",
              "font": "Noori Nastaliq",
              "size": 18,
              "bold": false
            }
          ]
        },
        {
          "type": "footnote_ref",
          "id": 2
        }
      ]
    }
  ],
  "footnotes": [
    {
      "id": 2,
      "text": "..."
    }
  ]
}
```

This becomes the **intermediate format**.

---

# 2. What Data You Must Extract

Think in **layers of the document model**.

### Layer 1 — File Metadata

Possible fields:

```
version
creation date
page size
margins
language
fonts used
```

---

### Layer 2 — Page Model

Pages may contain:

```
width
height
margins
columns
page number
```

---

### Layer 3 — Paragraph Model

Paragraph likely stores:

```
alignment
indent
line spacing
space before
space after
direction (RTL)
style reference
```

---

### Layer 4 — Text Runs

Text is usually stored as **runs**.

Example:

```
[text][style][text][style]
```

Run attributes:

```
font id
font size
bold
italic
underline
color
```

---

### Layer 5 — Structural Tokens

Expect markers like:

```
paragraph break
line break
page break
section break
footnote anchor
```

---

### Layer 6 — Footnotes

Footnotes usually involve:

```
reference marker
footnote body
footnote numbering
```

---

### Layer 7 — Style Tables

Many editors store styles separately:

```
style_id
font
size
paragraph rules
```

Text runs may reference **style IDs instead of raw formatting**.

---

# 3. Possible Internal File Layout

Typical document editors use something like:

```
HEADER
FILE INFO
FONT TABLE
STYLE TABLE
PAGE MAP
TEXT STREAM
OBJECTS
FOOTNOTES
EMBEDDED RESOURCES
```

So a realistic INP layout might be:

```
[header]
[chunk directory]
[text data]
[style definitions]
[font table]
[footnote section]
[page index]
```

---

# 4. Major Technical Unknowns

You need to detect:

### Compression

Look for signatures:

```
78 9C → zlib
1F 8B → gzip
```

---

### Pointer Tables

Many binary formats use offsets like:

```
offset to text block
offset to style table
```

Signs:

```
lots of little-endian integers
values pointing inside file
```

---

### Chunk Containers

Many editors store chunks:

```
[length][type][data]
```

Example:

```
12 00 00 00
TEXT
<data>
```

---

# 5. Why Python First Is Smart

Because you can quickly run experiments:

Example scanning script:

```python
import re

with open("sample.inp", "rb") as f:
    data = f.read()

strings = re.findall(rb"[\x20-\x7E]{6,}", data)

for s in strings[:50]:
    print(s)
```

This reveals:

```
font names
unicode text
metadata
```

---

# 6. Reverse Engineering Strategy

Don't try to parse everything at once.

Iterative discovery:

### Step 1

Find:

```
header
version
file signature
```

---

### Step 2

Find **Unicode text blocks**.

Scan for:

```
UTF-16 sequences
```

Example:

```
00 06 00 44 00 61 00 74 00 61
```

---

### Step 3

Identify **structure markers around text**.

Often:

```
[length][style][text]
```

---

### Step 4

Detect **paragraph separators**.

Often patterns like:

```
00 0D
00 0A
special control codes
```

---

### Step 5

Locate **style tables**.

Clues:

```
font names
repeating structures
```

---

### Step 6

Footnotes.

Search for:

```
superscript markers
reference IDs
```

---

# 7. Why Your Final Library Should Be TypeScript

Because your target is:

```
browser based INP reader
```

Parser signature:

```ts
parseINP(buffer: ArrayBuffer): DocumentAST
```

Works in:

```
browser
node
electron
```

---

# 8. Recommended Project Layout

```
inp-reverse/
   samples/
   python/
      scanner.py
      structure_finder.py
      unicode_finder.py
   specs/
      inp_format.md
   ts-parser/
      parser.ts
      chunks.ts
      text.ts
      styles.ts
```

---

# 9. Important Trick: Differential Reverse Engineering

Make test files:

```
file1: "A"
file2: "AA"
file3: "AAA"
```

Then diff them.

This reveals:

```
text containers
length fields
```

---

# 10. Automated Structure Discovery

You can write a script that detects:

```
repeating structures
```

Example pattern:

```
?? ?? ?? ?? 00 00 00 00 ?? ?? ?? ??
```

If it repeats every 32 bytes → likely a **record structure**.

---

# 11. What Your Agent Should Continuously Produce

You want the AI to produce **artifacts**, not guesses.

Require:

```
hex maps
structure tables
field hypotheses
parser code
```

---

# Now: Production-Grade Reverse Engineering Prompt

This is the **prompt I would actually use in Cursor**.

---

You are acting as a professional binary reverse engineer and document format analyst.

You are analyzing a proprietary **InPage (.INP) document file** in a completely sandboxed environment.

The goal is to reverse engineer the file format sufficiently to extract **all document data**, not merely the text.

The extracted data will later be used to build a **TypeScript parser and browser-based INP reader**.

The renderer is NOT the target.
The target is **structured document data extraction**.

You must operate systematically and produce verifiable findings.

Never guess structures without evidence.

---

# Target Data to Extract

Your reverse engineering must recover:

1. Unicode text
2. Paragraph boundaries
3. Page boundaries
4. Text runs
5. Character formatting
6. Paragraph formatting
7. Style tables
8. Font tables
9. Footnote references
10. Footnote bodies
11. Document metadata

The final goal is to construct a **document AST**.

---

# Required Output Model

Your work must eventually allow construction of this structure:

```
Document
 ├── metadata
 ├── fonts
 ├── styles
 ├── pages
 │    └── paragraphs
 │         └── text_runs
 └── footnotes
```

Each text run must contain:

```
text
font
size
bold
italic
underline
color
```

Paragraphs must contain:

```
alignment
indentation
spacing
direction
```

---

# Reverse Engineering Procedure

Follow this exact order.

Do not skip steps.

---

## Step 1 — Binary Reconnaissance

Load the file and produce:

• file size
• first 1024 bytes hex dump
• last 256 bytes hex dump

Identify:

• magic number
• version markers
• potential header structure

Construct an **initial header hypothesis**.

---

## Step 2 — Entropy Analysis

Measure entropy across the file to detect:

• compressed blocks
• text regions
• structured data regions

Mark suspected compression boundaries.

---

## Step 3 — String Discovery

Scan for:

• UTF-8 text
• UTF-16 text
• ASCII text

Extract all visible strings.

Classify them into:

```
document text
font names
metadata
unknown
```

---

## Step 4 — Unicode Text Block Identification

Locate blocks containing large amounts of UTF-16 Urdu text.

For each block:

record:

```
offset
length
encoding
```

Determine if text is:

```
length-prefixed
null-terminated
record-based
```

---

## Step 5 — Structural Token Detection

Inspect bytes around text blocks to identify markers for:

```
paragraph break
line break
style change
page break
footnote reference
```

Create a **token model** describing these markers.

Example:

```
0x01 = paragraph break
0x02 = page break
0x10 = style start
```

---

## Step 6 — Record Structure Discovery

Detect repeating structures around text.

Look for patterns like:

```
[length][style][text]
[style_id][text_length][text]
```

If repeating blocks are found:

infer field boundaries.

Document each record type.

---

## Step 7 — Style Table Extraction

Search for structures referencing:

```
font IDs
font sizes
style flags
```

Also search for **font names stored as strings**.

Construct a **font table hypothesis**.

---

## Step 8 — Footnote Mapping

Identify:

• footnote reference markers in text stream
• separate footnote body storage

Determine how references map to footnote entries.

Construct mapping logic.

---

## Step 9 — Page Boundary Detection

Determine how pages are stored.

Look for:

```
page index tables
offset lists
page markers
```

Document the page model.

---

# Parser Development

Once structures are discovered, build a **Python prototype parser**.

The parser must:

1. Parse header
2. Extract chunks
3. Decode text blocks
4. Interpret style records
5. Build document structure

The parser must output:

```
structured JSON document AST
```

---

# Evidence Requirements

Every structural claim must include:

```
file offset
byte sequence
interpretation
confidence level
```

---

# Deliverables

You must produce:

1. Annotated hex map of the file
2. Section/chunk map
3. Record structure definitions
4. Style table hypothesis
5. Footnote mapping model
6. Python prototype parser
7. JSON AST output example
8. Format specification notes

---

# Constraints

• Work entirely from the binary sample
• Do not rely on external documentation
• Use deterministic analysis
• Validate hypotheses with byte-level evidence

---

# Continue iterating until

• the parser successfully extracts text
• paragraphs are reconstructed
• styles are attached to text runs
• footnotes are correctly linked

---

## If you'd like, I can also show you **3 extremely powerful reverse-engineering techniques** that could reduce this project from **weeks → possibly a single day**, especially since you're working with the original **InPage team environment**.

## Multi-Sample Differential Analysis

Multiple INP files are provided.

You must perform **binary differential analysis between the files** to accelerate format discovery.

For each file:

1. Compare file headers to determine version consistency.
2. Identify structural regions that remain identical across files.
3. Identify regions that differ and correlate them with:
   - document text
   - page count
   - formatting differences

4. Detect repeating structures shared across files.
5. Locate pointer tables by identifying offsets that change consistently with file size.

Produce a **cross-file comparison table**:

FILE_A_OFFSET | FILE_B_OFFSET | SAME/DIFFERENT | HYPOTHESIS

Use these differences to identify:

• text storage regions
• style tables
• page structures
• footnote storage

Prioritize structures that are **stable across files but contain variable content**.
