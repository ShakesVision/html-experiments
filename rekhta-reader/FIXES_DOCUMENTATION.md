# Rekhta Reader - RTL/LTR Navigation Fix

## Issues Fixed

### 1. **Language Detection Not Working**

- **Problem**: The regex for detecting `?lang=ur` in the URL wasn't being applied correctly, or the flag wasn't being checked consistently.
- **Root Cause**: The `state.isUrduBook` was being set correctly, but might not have been being used reliably in all code paths.
- **Solution**:
  - Added console.log output when loading manifest to confirm language detection: `console.log("Book URL:", bookUrl, "| isUrduBook:", state.isUrduBook);`
  - Ensured the cache badge displays "Manifest cached - Urdu navigation enabled" when Urdu is detected
  - Verified renderManifest() uses the flag

### 2. **Both Arrow Buttons Going Forward**

- **Problem**: Clicking the left arrow (prev button) and right arrow (next button) both navigated forward.
- **Root Cause**: The button disabled states were using `getDirectionalDelta()` which applies _logical_ direction logic, but the buttons are wired to _visual_ navigation helpers that use different logic. This mismatch caused confusion.
- **Solution**:
  - Changed disabled state calculation to use _visual_ deltas (same logic as stepVisualLeft/Right)
  - Visual deltas are:
    - For LTR: left = -delta, right = +delta (backward/forward)
    - For RTL: left = +delta, right = -delta (forward/backward)

### 3. **Two-Page RTL Layout Not Rendering Correctly**

- **Problem**: Two-page view wasn't displaying pages in right-to-left order for Urdu books.
- **Solution**:
  - Ensured `renderReaderPages()` sets `dir="rtl"` on the `.reader-pages-container` when Urdu is detected
  - CSS rules use `[dir="rtl"] .reader-image:first-child` to reorder pages visually
  - Pages are built and pushed in visual order

## How to Test

### Test URL

```
https://www.rekhta.org/ebooks/jamaliyat-aur-urdu-shairi-qazi-jamal-husain-ebooks?lang=ur
```

### Step-by-Step Testing

1. **Open Developer Console** (F12 or Ctrl+Shift+I)

2. **Paste the Urdu book URL** into the URL input field

3. **Click "Go"** to load the manifest

4. **Verify Language Detection:**
   - Check console: should show `"isUrduBook: true"`
   - Check cache badge: should show "Manifest cached - Urdu navigation enabled"

5. **One-Page View Test:**
   - Click on any page preview to open the reader
   - Single page should display
   - Click left arrow: should go to NEXT page (forward)
   - Click right arrow: should go to PREVIOUS page (backward)
   - Press ArrowLeft: same behavior as left arrow button
   - Press ArrowRight: same behavior as right arrow button

6. **Two-Page View Test:**
   - Click the "two-page view" icon (book icon) in the toolbar
   - Two pages should display: right page first, then left page (RTL layout)
   - Click left arrow: should advance 2 pages forward
   - Click right arrow: should go back 2 pages backward
   - Console logs should show the deltas and page indices

### What to Look For

- **Console Output**: Each button click should log:

  ```
  stepVisualLeft: isUrdu= true delta= 1 currentIndex= X nextIndex= Y
  stepVisualRight: isUrdu= true delta= -1 currentIndex= X nextIndex= Y
  Book URL: https://... ?lang=ur | isUrduBook: true
  ```

- **Visual Behavior**:
  - Left arrow should move the book forward (to next pages) in Urdu
  - Right arrow should move the book backward (to previous pages) in Urdu
  - Two-page layout should show: right page, left page (not left, right)

- **Button States**:
  - Buttons should enable/disable correctly at book boundaries

## Code Changes Made

### index.html

- Added `reader-pages-container` div to wrap the two image elements
- Images now have class `reader-image` in addition to `reader-page`

### index.js

1. **Language Detection Logging** (line ~157):

   ```javascript
   console.log("Book URL:", bookUrl, "| isUrduBook:", state.isUrduBook);
   ```

2. **Visual Navigation Helpers** (lines ~978-1025):
   - `stepVisualLeft()`: Moves visual viewport to the left
   - `stepVisualRight()`: Moves visual viewport to the right
   - These account for RTL/LTR and one/two-page modes
   - Each includes console.log for debugging

3. **Button Event Listeners** (lines ~106-107):

   ```javascript
   elements.readerPrev.addEventListener("click", () => stepVisualLeft());
   elements.readerNext.addEventListener("click", () => stepVisualRight());
   ```

4. **Keyboard Handlers** (lines ~486-494):
   - ArrowLeft calls `stepVisualLeft()`
   - ArrowRight calls `stepVisualRight()`

5. **Touch Swipe** (lines ~1027-1032):
   - Swipe right calls `stepVisualLeft()`
   - Swipe left calls `stepVisualRight()`

6. **Button Disabled States** (lines ~1146-1161):
   - Now uses visual deltas instead of logical deltas
   - Correctly reflects whether buttons can be pressed

7. **Two-Page Rendering** (lines ~1086-1205):
   - `renderReaderPages()` sets `dir="rtl"` on container for Urdu books
   - Pages are pushed into `pagesToRender` in visual order
   - CSS handles the visual reordering

### styles.css

- Already has CSS rules for `.reader-pages-container[dir="rtl"]`
- These reorder the images visually using flexbox order

## Debugging Tips

If the fix doesn't work:

1. **Check browser console for errors** - Press F12, look for red errors

2. **Verify URL structure** - The regex looks for `?lang=ur` with word boundary
   - ✓ Works: `?lang=ur` (at end)
   - ✓ Works: `?lang=ur&other=value`
   - ✗ Fails: `lang=urd` (word boundary fails)

3. **Check Network tab** - Ensure the book manifest is loading

4. **Check Console output**:
   - When loading a book, should see "Book URL: ... | isUrduBook: true"
   - When clicking buttons in reader, should see navigation logs

5. **Test both modes** - Try one-page AND two-page view

6. **Test with non-Urdu book** - Verify LTR books still work correctly

## Expected Behavior Summary

| Action            | LTR Book            | RTL Book (Urdu)     |
| ----------------- | ------------------- | ------------------- |
| Click Left Arrow  | Go Back 1           | Go Forward 1        |
| Click Right Arrow | Go Forward 1        | Go Back 1           |
| Press ArrowLeft   | Same as Left Arrow  | Same as Left Arrow  |
| Press ArrowRight  | Same as Right Arrow | Same as Right Arrow |
| Swipe Right       | Go Back 1-2         | Go Forward 1-2      |
| Swipe Left        | Go Forward 1-2      | Go Back 1-2         |
| Two-Page Layout   | Left then Right     | Right then Left     |
