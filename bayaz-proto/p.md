You are building a FULLY FUNCTIONAL single-file web application called:

Urdu Book Editor

This is a professional writing pad for Urdu novelists. The goal is to simulate the feeling of writing directly inside a printed book while still providing WYSIWYG editing capabilities.

The entire application MUST be implemented inside a SINGLE file:

index.html

Do not split into multiple files.

Use:

- Tailwind via CDN
- Vanilla JavaScript only
- Material Icons or FontAwesome (no emojis)
- No frameworks
- No build tools

The editor must be fast and able to handle long manuscripts.

---

CORE CONCEPT

The editor behaves like an OPEN BOOK.

On large screens:
show TWO pages side by side.

On small screens:
show ONE page.

Pages must look like real book pages with:

• margins
• page borders
• header
• footer
• page numbers
• chapter titles

There must be NO continuous scrolling.

Navigation is done with:

< previous page
page number input

> next page

Only the visible pages are rendered for performance.

---

PAGE SYSTEM

Default page size:
A5

Also support:
A4
Custom page size

Page margins must be configurable.

Page sizes should be internally converted to pixels.

---

PAGINATION ENGINE

Use SOFT PAGINATION.

Maintain a continuous internal HTML buffer.

Split content into pages based on page height.

Rules:

• content flows automatically
• overflow pushes to next page
• only 1 or 2 pages rendered at once
• support manual page break tag

Manual page break element:

<page-break></page-break>

When pagination runs, this element forces a new page.

During export this tag must remain intact.

---

HEADER / FOOTER SYSTEM

Header and footer are user editable templates.

They support tokens:

<title>
<chapter>
<page-number>

User can type normal text.

Example:

<title> | <chapter> | <page-number>

Pipe symbol "|" defines columns.

Rules:

0 pipes:
single centered column

1 pipe:
two columns
left + right

2 pipes:
three columns
left / center / right

Use flex or grid internally.

User may include additional text.

Example:

Chapter 1 <chapter> | <page-number>

Tokens must dynamically update.

---

CHAPTER DETECTION

Chapters are automatically detected.

Rule:

Every H1 element represents a chapter.

Algorithm:

Scan the document.
Find the most recent H1 before a page.
Use its text as <chapter>.

If no H1 exists:
chapter is blank.

This encourages semantic structure.

---

TITLE SYSTEM

There is an input box at the top for:

Novel Title

This value replaces the <title> token.

---

EDITOR

Main text area must be:

contenteditable

Default writing direction:

RTL

Default alignment:

right aligned

User can switch between:

RTL
LTR

---

TOOLBAR (TOP RIBBON)

Must include the following formatting tools:

font family dropdown
font size (px)

bold
italic
underline

superscript
subscript

text alignment
RTL toggle
LTR toggle

bulleted list
numbered list

font color

line height

margin controls
padding controls

hanging paragraph indent

insert page break

All formatting must apply to:

• selected text
OR
• current line if nothing selected

Use document.execCommand for formatting.

---

FONTS

Default fonts must include:

Mehr Nastaliq (default)
https://cdn.jsdelivr.net/gh/shakesvision/MehrNastaleeq/MehrNastaliqWeb.woff

Amiri
Noto Nastaliq Urdu

The editor must support dynamic font loading.

User can add fonts by providing:

Font Name
Font URL (.woff / .woff2 / .ttf)

The font is dynamically registered using @font-face.

It then appears in the font dropdown.

---

PERFORMANCE

The editor must remain fast for large manuscripts.

Requirements:

• internal HTML buffer
• page array
• render only visible pages
• debounce pagination
• avoid full DOM reflows

Goal:

handle 500+ pages smoothly.

---

NAVIGATION

Navigation UI must include:

previous page button
next page button

page number input

total page count display

User can jump to any page.

---

EXPORT

Export must generate:

continuous HTML document

Rules:

• remove page layout wrappers
• keep original HTML content
• preserve <page-break> tags
• preserve headings

User downloads:

novel.html

---

PRINT

Printing must be supported.

Pages should print cleanly.

Use print CSS to remove UI.

---

AUTOSAVE

Use localStorage.

Automatically save:

• manuscript buffer
• title
• header template
• footer template

Restore on reload.

---

STYLING

Use Tailwind CSS.

Book pages must visually resemble printed pages:

white background
subtle border
soft shadow
page margins

Spacing must feel like a book.

---

UI STRUCTURE

Top toolbar
Header/footer configuration inputs
Book page display
Bottom navigation bar

---

IMPORTANT RULES

Do NOT simplify features.

Do NOT remove any functionality.

Do NOT introduce emojis.

Use Material Icons.

The final output must be a complete working:

index.html

with all CSS and JavaScript embedded.

---

GOAL

Produce a clean, maintainable, readable implementation
with comments explaining major sections.

The file should open directly in a browser and work immediately.
