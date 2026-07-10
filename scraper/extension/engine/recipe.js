// Recipe = a saved scrape definition. Schema + normalization (pure) plus a
// localStorage-backed store (guarded so importing in Node never touches
// storage). Mirrors createSelectorStore() in rekhta-reader/src/shared.js.

export { defaultRecipe, normalizeRecipe, createRecipeStore };

function defaultRecipe(overrides = {}) {
  return {
    name: "",
    url: "",
    // Container/field (record) mode:
    container: "",
    fields: [], // [{ name, selector, type: "text"|"html"|"attr", attr }]
    // Simple (single-selector) mode:
    selector: "",
    mode: "one", // "one" | "all"
    index: 1,
    joiner: "\n",
    extractType: "text", // "text" | "html" | "attr"
    attr: "href",
    pagination: { mode: "none", nextSelector: "", maxPages: 1 },
    ...overrides,
  };
}

// Coerce an arbitrary object (e.g. from storage or import) into a valid recipe.
function normalizeRecipe(input) {
  const base = defaultRecipe();
  const r = input && typeof input === "object" ? input : {};
  const out = {
    ...base,
    ...r,
    fields: Array.isArray(r.fields)
      ? r.fields
          .filter((f) => f && typeof f === "object")
          .map((f) => ({
            name: String(f.name || "").trim(),
            selector: String(f.selector || "").trim(),
            type: ["text", "html", "attr"].includes(f.type) ? f.type : "text",
            attr: String(f.attr || "href"),
          }))
          .filter((f) => f.name) // a field without a name is not a usable column
      : [],
    pagination: { ...base.pagination, ...(r.pagination || {}) },
  };
  out.index = Math.max(1, parseInt(out.index, 10) || 1);
  out.mode = out.mode === "all" ? "all" : "one";
  out.extractType = ["text", "html", "attr"].includes(out.extractType) ? out.extractType : "text";
  return out;
}

function createRecipeStore(storageKey = "scraperRecipesV1") {
  const read = () => {
    try {
      const raw = (typeof localStorage !== "undefined" && localStorage.getItem(storageKey)) || "{}";
      const obj = JSON.parse(raw);
      return obj && typeof obj === "object" ? obj : {};
    } catch {
      return {};
    }
  };
  const write = (obj) => {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(storageKey, JSON.stringify(obj));
  };

  return {
    list() {
      const all = read();
      return Object.keys(all).map((name) => ({ name, recipe: normalizeRecipe(all[name]) }));
    },
    get(name) {
      const all = read();
      return all[name] ? normalizeRecipe(all[name]) : null;
    },
    save(name, recipe) {
      const all = read();
      all[name] = normalizeRecipe({ ...recipe, name });
      write(all);
    },
    remove(name) {
      const all = read();
      delete all[name];
      write(all);
    },
  };
}
