// The core extraction engine. Pure: give it a DOM root + a recipe, get data
// back. No fetching, no globals — that lives in fetcher.js / the shells.
import { getValue, safeQueryAll } from "./dom.js";

export { extractRecords, extractValues, extract };

// Container/field mode: `container` selects repeating rows; each field pulls
// one value from within a row. Returns { columns, records }.
function extractRecords(root, recipe) {
  const rows = safeQueryAll(root, recipe.container);
  const fields = (recipe.fields || []).filter((f) => f && f.name);
  const columns = fields.map((f) => f.name);

  const records = rows.map((row) => {
    const record = {};
    fields.forEach((field) => {
      const el = field.selector ? row.querySelector(field.selector) : row;
      record[field.name] = getValue(el, field.type || "text", field.attr);
    });
    return record;
  });

  return { columns, records, count: rows.length };
}

// Simple mode (the classic single-selector path): one or all matches, as
// text/html/attr. Returns { values, count, text }.
function extractValues(root, recipe) {
  const els = safeQueryAll(root, recipe.selector);
  const type = recipe.extractType === "html" ? "html" : (recipe.extractType || "text");
  const attr = recipe.attr;

  if (recipe.mode === "one") {
    const index = Math.max(1, parseInt(recipe.index, 10) || 1);
    const el = els[index - 1];
    const value = el ? getValue(el, type, attr) : "";
    return { values: el ? [value] : [], count: els.length, text: value };
  }

  const values = els.map((el) => getValue(el, type, attr));
  const joiner = recipe.joiner != null ? recipe.joiner : "\n";
  return { values, count: els.length, text: values.join(joiner) };
}

// Convenience dispatcher used by the shells: container set → records mode,
// otherwise simple values mode.
function extract(root, recipe) {
  if (recipe && recipe.container && (recipe.fields || []).length) {
    const { columns, records, count } = extractRecords(root, recipe);
    return { kind: "records", columns, records, count };
  }
  const { values, count, text } = extractValues(root, recipe);
  return { kind: "values", values, count, text };
}
