# Quick Debug Checklist

## When Testing Urdu Books (`?lang=ur` in URL)

### ✓ Language Detection

- [ ] Console shows: `isUrduBook: true`
- [ ] Cache badge says: "Manifest cached - Urdu navigation enabled"

### ✓ One-Page Navigation

- [ ] Left arrow button = Go TO NEXT (forward in book)
- [ ] Right arrow button = Go TO PREVIOUS (backward in book)
- [ ] ArrowLeft key = Same as Left button
- [ ] ArrowRight key = Same as Right button

### ✓ Two-Page Navigation

- [ ] Left arrow button = Advance 2 pages (forward)
- [ ] Right arrow button = Go back 2 pages (backward)
- [ ] First image appears on RIGHT side
- [ ] Second image appears on LEFT side
- [ ] dir="rtl" is set on `.reader-pages-container`

### ✓ Console Output (Per Button Click)

```
stepVisualLeft: isUrdu= true delta= 1 currentIndex= 5 nextIndex= 6
stepVisualRight: isUrdu= true delta= -1 currentIndex= 6 nextIndex= 5
```

---

## When Testing Non-Urdu Books (No `?lang=ur`)

### ✓ Language Detection

- [ ] Console shows: `isUrduBook: false`
- [ ] Cache badge says: "Manifest cached" (no Urdu mention)

### ✓ One-Page Navigation

- [ ] Left arrow button = Go TO PREVIOUS (backward in book)
- [ ] Right arrow button = Go TO NEXT (forward in book)
- [ ] ArrowLeft key = Same as Left button
- [ ] ArrowRight key = Same as Right button

### ✓ Two-Page Navigation

- [ ] Left arrow button = Go back 2 pages (backward)
- [ ] Right arrow button = Advance 2 pages (forward)
- [ ] First image appears on LEFT side
- [ ] Second image appears on RIGHT side
- [ ] dir="ltr" is set on `.reader-pages-container`

### ✓ Console Output (Per Button Click)

```
stepVisualLeft: isUrdu= false delta= -1 currentIndex= 5 nextIndex= 4
stepVisualRight: isUrdu= false delta= 1 currentIndex= 5 nextIndex= 6
```

---

## Troubleshooting

### Language Not Detected

1. Check URL has `?lang=ur` in it exactly
2. Try clearing browser cache: Ctrl+Shift+Delete
3. Check console for any errors (F12)

### Arrows Both Going Forward

1. Check console logs - should show delta changing sign between left/right
2. Verify `state.isUrduBook` is being set (check console output on load)
3. Check that buttons are wired to `stepVisualLeft` and `stepVisualRight` (not `stepReader("prev")`)

### Two-Page Layout Not RTL

1. Check in DevTools (F12 → Elements tab)
2. Look for `.reader-pages-container` div
3. Should have `dir="rtl"` attribute
4. Check CSS rules for `.reader-pages-container[dir="rtl"]` applying

### Buttons Disabled Incorrectly

1. Check visual deltas in disabled state calculation
2. For Urdu one-page:
   - prevButton.disabled should check: `currentPage + 1 >= totalPages`
   - nextButton.disabled should check: `currentPage - 1 < 0`
3. For LTR one-page:
   - prevButton.disabled should check: `currentPage - 1 < 0`
   - nextButton.disabled should check: `currentPage + 1 >= totalPages`
