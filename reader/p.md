You are building a modern, mobile-first web app that acts as a custom reader and library UI on top of archive.org scanned books.

---

## USER REQUIREMENTS

- Create an `index.html` that uses Tailwind CSS and JavaScript.

- Tailwind must be imported via:

  <link rel="stylesheet" href="../assets/css/tailwind.css" />

- Use Alpine.js for interactivity (avoid heavy frameworks).

- Use Material Icons or Feather Icons (no emojis anywhere).

- UI must look like a modern mobile app (clean, minimal, app-like).

- The app acts as:
  1. A library/catalog of books
  2. A reader for scanned books (image-based pages from archive.org)

- Use archive.org hosted images for reading (like:
  https://archive.org/download/{id}/page/n{page}.jpg)

- Inspiration reference:
  https://github.com/ShakesVision/quran/raw/refs/heads/master/src/app/pages/scanned/scanned.page.ts

---

## READER REQUIREMENTS

- Must support:
  - LTR and RTL toggle
  - Single page view
  - Two-page side-by-side view (when screen width allows)

- Reader features:
  - Next / Previous navigation
  - Page number display
  - Smooth experience (no reloads)
  - Responsive layout

---

## LIBRARY REQUIREMENTS

- Books are managed via a hardcoded JSON file
- JSON must be easily extendable and categorized

Each book should include:

- id

- title

- author

- language

- size

- category

- archiveId

- cover (first page image)

- pdf link

- total pages (optional)

- UI must show:
  - Thumbnail (first page)
  - Title, author
  - Language, size
  - Read button
  - Download PDF button

- Features:
  - Search (title + author)
  - Filter (language, category, size)
  - Sort (title, author, size)

---

## ADD BOOK FEATURE

- A floating "+" button
- User can input an archive.org URL
- App extracts archiveId
- Adds book dynamically to library

---

## GENERAL UX

- Mobile-first design
- Card-based layout
- Clean spacing and typography
- App-like navigation feel
- No emojis
- Use icons properly

---

## PROJECT STRUCTURE (MANDATORY)

/index.html -> Library UI
/reader.html -> Reader UI
/js/app.js -> Library logic (Alpine)
/js/reader.js -> Reader logic
/js/books.js -> Hardcoded JSON data

- Keep logic OUT of HTML as much as possible
- Use Alpine components cleanly

---

## IMPLEMENTATION PLAN

1. DATA LAYER

- Create books.js with a global BOOKS array
- Each book contains metadata and archiveId
- Make structure scalable for categories

2. LIBRARY (index.html)

- Header with title + search
- Search input bound with Alpine
- Grid layout (2 columns mobile)
- Book cards:
  - Image thumbnail
  - Metadata
  - Read + PDF buttons

- Floating "+" button
- Modal for adding new book

3. LIBRARY LOGIC (app.js)

- Alpine component:
  - books state
  - search query
  - filters
  - sorting

- Methods:
  - filteredBooks()
  - addBook()
  - extract archiveId from URL

4. READER (reader.html)

- Top bar:
  - RTL toggle
  - Page number
  - View toggle (1 page / 2 pages)

- Main viewer:
  - Image(s) rendered dynamically

- Bottom controls:
  - Prev / Next buttons

5. READER LOGIC (reader.js)

- Read book ID from URL params
- Find book from BOOKS
- Maintain:
  - current page
  - rtl state
  - two-page mode

- Methods:
  - next()
  - prev()
  - toggleRTL()
  - toggleView()
  - pageUrl()

6. RESPONSIVENESS

- Use Tailwind responsive utilities
- Enable 2-page view only on wider screens

7. EXTENSIBILITY

- Code should be clean and modular
- Easy to add:
  - bookmarks
  - offline support
  - categories UI
  - localStorage persistence

---

## CONSTRAINTS

- Do NOT use any frameworks other than Alpine.js
- Do NOT inline massive JS in HTML
- Do NOT overcomplicate
- Keep UI clean and modern
- Avoid unnecessary dependencies

---

## OUTPUT EXPECTATION

Generate ALL required files:

1. index.html
2. reader.html
3. js/app.js
4. js/reader.js
5. js/books.js

Each file must be complete and ready to use.

Ensure:

- Clean structure
- Working interactions
- No placeholder nonsense
- Realistic implementation

Make sure to have the following:
PWA/offline support
Kindle-like UI polish
Gesture-based page flipping
Auto-detection of archive.org metadata

---

Build this like a real product, not a demo.
