// Selector generation for the point-and-click picker, plus "select similar"
// which turns one clicked element into a whole repeating-list recipe.
// Pure DOM walking — works under linkedom too.

export { buildSelector, cssEscapeIdent, findRepeatingAncestor, generalizeToList };

// Classes that look auto-generated (hashes, state flags, framework noise) are
// poor selector anchors — skip them in favour of stable, human-named ones.
const UNSTABLE_CLASS = /(^|[-_])(active|selected|hover|focus|open|show|hidden|odd|even|row|first|last|ng-|js-|css-[a-z0-9]{4,}|[a-z]*\d{3,}|[a-f0-9]{6,})($|[-_])/i;

function cssEscapeIdent(value) {
  if (typeof CSS !== "undefined" && CSS.escape) return CSS.escape(value);
  return String(value).replace(/[^a-zA-Z0-9_-]/g, (ch) => "\\" + ch);
}

function stableClasses(el) {
  return Array.from(el.classList || [])
    .filter((c) => c && !UNSTABLE_CLASS.test(c))
    .slice(0, 2);
}

function nthOfType(el) {
  let i = 1;
  let sib = el;
  while ((sib = sib.previousElementSibling)) {
    if (sib.tagName === el.tagName) i += 1;
  }
  return i;
}

// One selector segment for an element: tag + stable classes, plus
// :nth-of-type when siblings of the same tag would otherwise be ambiguous.
function segmentFor(el) {
  const tag = el.tagName.toLowerCase();
  const classes = stableClasses(el);
  let seg = tag + classes.map((c) => "." + cssEscapeIdent(c)).join("");

  const parent = el.parentElement;
  if (parent) {
    const sameType = Array.from(parent.children).filter((c) => c.tagName === el.tagName);
    const matchesClasses = (c) =>
      classes.every((cls) => c.classList && c.classList.contains(cls));
    const ambiguous = classes.length
      ? Array.from(parent.children).filter(matchesClasses).length > 1
      : sameType.length > 1;
    if (ambiguous) seg += `:nth-of-type(${nthOfType(el)})`;
  }
  return seg;
}

// A reasonably-robust selector for a single element, relative to `root`
// (defaults to the document). Prefers an id anchor when present and unique.
function buildSelector(el, root) {
  if (!el || el.nodeType !== 1) return "";
  const doc = root || el.ownerDocument || el.getRootNode();

  if (el.id) {
    const idSel = "#" + cssEscapeIdent(el.id);
    try {
      if (doc.querySelectorAll(idSel).length === 1) return idSel;
    } catch { /* fall through */ }
  }

  const parts = [];
  let node = el;
  const stopAt = doc.body || doc.documentElement || doc;
  while (node && node.nodeType === 1 && node !== stopAt) {
    parts.unshift(segmentFor(node));
    if (node.id) { // an id anchor makes everything above it redundant
      parts[0] = "#" + cssEscapeIdent(node.id);
      break;
    }
    node = node.parentElement;
  }
  return parts.join(" > ");
}

// Climb from a clicked element to the ancestor that best represents a
// repeating record. Both cells (repeat horizontally) and rows (repeat
// vertically) have many same-tag siblings, so we prefer the OUTERMOST
// ancestor that both repeats enough AND holds multiple child fields — that's
// the row/card, not an individual cell.
function findRepeatingAncestor(el, root, minSiblings = 3) {
  const doc = root || el.ownerDocument;
  const stopAt = doc.body || doc.documentElement;
  const qualifying = []; // innermost → outermost

  let node = el;
  while (node && node.nodeType === 1 && node !== stopAt) {
    const parent = node.parentElement;
    if (parent) {
      const peers = Array.from(parent.children).filter((c) => c.tagName === node.tagName);
      if (peers.length >= 2) {
        qualifying.push({ node, peers: peers.length, kids: node.childElementCount });
      }
    }
    node = node.parentElement;
  }
  if (!qualifying.length) return null;

  const strong = qualifying.filter((q) => q.peers >= minSiblings && q.kids >= 2);
  if (strong.length) return strong[strong.length - 1].node; // outermost record-like
  const repeated = qualifying.filter((q) => q.peers >= minSiblings);
  if (repeated.length) return repeated[repeated.length - 1].node;
  return qualifying[qualifying.length - 1].node;
}

// The delight feature: from one clicked element, produce a full list recipe —
// { container, fields[] }. For table-ish rows each cell becomes a column;
// otherwise the whole row's text is one field. `thead` labels name columns
// when available.
function generalizeToList(el, root) {
  const doc = root || el.ownerDocument;
  const row = findRepeatingAncestor(el, doc);
  if (!row) {
    // No repeat found — treat the clicked element itself as a one-off field.
    return { container: buildSelector(el, doc), fields: [{ name: "value", selector: "", type: "text" }] };
  }

  // Container must match ALL rows, so anchor on the row's PARENT + row tag
  // (+ stable classes) rather than buildSelector(row), which uniquely targets
  // the single clicked row via :nth-of-type.
  const parent = row.parentElement;
  const rowTag = row.tagName.toLowerCase();
  const rowClasses = stableClasses(row).map((c) => "." + cssEscapeIdent(c)).join("");
  const container = parent
    ? `${buildSelector(parent, doc)} > ${rowTag}${rowClasses}`
    : buildSelector(row, doc);
  const cells = Array.from(row.children).filter((c) => c.nodeType === 1);

  // Header labels (for tables) give friendly column names.
  let headers = [];
  const table = row.closest && row.closest("table");
  if (table) {
    const headEl = table.querySelector("thead tr") || table.querySelector("tr");
    if (headEl) headers = Array.from(headEl.children).map((h) => h.textContent.trim());
  }

  let fields;
  if (cells.length >= 2) {
    fields = cells.map((cell, i) => {
      const tag = cell.tagName.toLowerCase();
      const link = cell.querySelector && cell.querySelector("a[href]");
      const name = (headers[i] && slug(headers[i])) || `col${i + 1}`;
      return link
        ? { name, selector: `${tag}:nth-child(${i + 1}) a`, type: "text" }
        : { name, selector: `${tag}:nth-child(${i + 1})`, type: "text" };
    });
  } else {
    fields = [{ name: "text", selector: "", type: "text" }];
  }

  return { container, fields };
}

function slug(text) {
  return (text || "")
    .toLowerCase()
    .replace(/[^\w]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 30) || "col";
}
