// Tiny DOM helpers shared across the engine. Everything takes an explicit
// root/element so the same code runs under the browser DOM, the extension's
// live DOM, and linkedom in Node tests — no global `document` assumptions.

export { collapseWhitespace, getValue, safeQuery, safeQueryAll, textOf };

function collapseWhitespace(text) {
  return (text || "").replace(/\s+/g, " ").trim();
}

function textOf(el) {
  return el ? collapseWhitespace(el.textContent) : "";
}

// Never throw on a user-typed selector — an invalid selector returns empty
// so the UI can report "invalid selector" instead of crashing.
function safeQuery(root, selector) {
  if (!root || !selector) return null;
  try {
    return root.querySelector(selector);
  } catch {
    return null;
  }
}

function safeQueryAll(root, selector) {
  if (!root || !selector) return [];
  try {
    return Array.from(root.querySelectorAll(selector));
  } catch {
    return [];
  }
}

// Pull a value out of one element per the field's type.
//   text → collapsed textContent
//   html → innerHTML
//   attr → the named attribute (href/src resolved to absolute when possible)
function getValue(el, type, attr) {
  if (!el) return "";
  if (type === "html") return (el.innerHTML || "").trim();
  if (type === "attr") {
    const name = attr || "href";
    // el.href / el.src are absolute in a real browser; fall back to the raw
    // attribute (what linkedom and relative links give us).
    const prop = el[name];
    if (typeof prop === "string" && prop) return prop;
    return el.getAttribute(name) || "";
  }
  return collapseWhitespace(el.textContent);
}
