// Node test suite for the scraper engine. Uses linkedom to provide a real DOM
// so the SAME engine code that runs in the browser / extension is exercised
// here against captured fixtures. Convention mirrors inpage/tests.
//
//   npm test   (→ node scraper/tests/run-scraper-tests.mjs)

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseHTML } from "linkedom";

import { extract, extractRecords, extractValues } from "../engine/extract.js";
import { generalizeToList, findRepeatingAncestor, buildSelector } from "../engine/selector.js";
import { findNextUrl, crawl } from "../engine/paginate.js";
import { toCSV, toJSON, toNDJSON } from "../engine/export.js";
import { normalizeRecipe, defaultRecipe } from "../engine/recipe.js";
import { createEntitlement } from "../engine/entitlement.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.join(__dirname, "fixtures");

async function docFromFixture(name) {
  const html = await readFile(path.join(FIXTURES, name), "utf8");
  return parseHTML(html).document;
}

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

/* ----------------------------- Extraction (chartink) ----------------------------- */

test("chartink: container/field mode extracts every screener row + columns", async () => {
  const doc = await docFromFixture("chartink-screener.html");
  const recipe = {
    container: "#DataTables_Table_0 tbody tr",
    fields: [
      { name: "name", selector: "td:nth-child(2) a", type: "text" },
      { name: "symbol", selector: "td:nth-child(3)", type: "text" },
      { name: "chg", selector: "td:nth-child(5)", type: "text" },
      { name: "price", selector: "td:nth-child(6)", type: "text" },
      { name: "link", selector: "td:nth-child(2) a", type: "attr", attr: "href" },
    ],
  };
  const { columns, records, count } = extractRecords(doc, recipe);
  assert.equal(count, 8, "should find all 8 rows");
  assert.deepEqual(columns, ["name", "symbol", "chg", "price", "link"]);
  assert.equal(records[0].symbol, "RELIANCE");
  assert.equal(records[0].name, "Reliance Industries Ltd");
  assert.equal(records[0].chg, "2.34");
  assert.equal(records[0].price, "2,910.50");
  assert.equal(records[0].link, "https://chartink.com/stocks/RELIANCE.html");
  assert.equal(records[7].symbol, "ITC");
});

test("chartink: simple mode 'all' pulls the symbol column", async () => {
  const doc = await docFromFixture("chartink-screener.html");
  const { values, count } = extractValues(doc, {
    selector: "#DataTables_Table_0 tbody tr td:nth-child(3)",
    mode: "all",
    extractType: "text",
  });
  assert.equal(count, 8);
  assert.deepEqual(values.slice(0, 3), ["RELIANCE", "TCS", "INFY"]);
});

test("simple mode 'one' respects 1-based index", async () => {
  const doc = await docFromFixture("chartink-screener.html");
  const { text } = extractValues(doc, {
    selector: "#DataTables_Table_0 tbody tr td:nth-child(3)",
    mode: "one",
    index: 4,
    extractType: "text",
  });
  assert.equal(text, "HDFCBANK");
});

test("attr extraction returns href; html extraction returns markup", async () => {
  const doc = await docFromFixture("list-sample.html");
  const attr = extractValues(doc, { selector: "li.item a.title", mode: "one", index: 2, extractType: "attr", attr: "href" });
  assert.equal(attr.text, "/p/2");
  const html = extractValues(doc, { selector: "ul.feed", mode: "one", index: 1, extractType: "html" });
  assert.match(html.text, /<li[^>]*class="item"/i);
});

test("extract() dispatches records vs values by presence of container", async () => {
  const doc = await docFromFixture("list-sample.html");
  const recs = extract(doc, { container: "li.item", fields: [{ name: "t", selector: "a.title", type: "text" }] });
  assert.equal(recs.kind, "records");
  assert.equal(recs.records.length, 4);
  const vals = extract(doc, { selector: "li.item a.title", mode: "all", extractType: "text" });
  assert.equal(vals.kind, "values");
  assert.equal(vals.count, 4);
});

test("invalid selector never throws — yields empty", async () => {
  const doc = await docFromFixture("list-sample.html");
  const { count } = extractValues(doc, { selector: ">>bad<<", mode: "all" });
  assert.equal(count, 0);
});

/* ----------------------------- Selector / select-similar ----------------------------- */

test("select-similar: one clicked cell → container matching all rows + columns", async () => {
  const doc = await docFromFixture("chartink-screener.html");
  const cell = doc.querySelector("#DataTables_Table_0 tbody tr:nth-child(3) td:nth-child(3)");
  assert.ok(cell, "picked cell exists");
  const generalized = generalizeToList(cell, doc);
  // container should re-select every data row
  const rows = doc.querySelectorAll(generalized.container);
  assert.ok(rows.length >= 8, `container should match all rows, got ${rows.length}`);
  // one field per column
  assert.ok(generalized.fields.length >= 5, "should derive a field per column");
  // and it should actually extract
  const { records } = extractRecords(doc, generalized);
  assert.equal(records.length, 8);
});

test("select-similar on a list item generalizes to the repeating <li>", async () => {
  const doc = await docFromFixture("list-sample.html");
  const link = doc.querySelector("li.item a.title");
  const row = findRepeatingAncestor(link, doc);
  assert.equal(row.tagName.toLowerCase(), "li");
  const g = generalizeToList(link, doc);
  assert.ok(doc.querySelectorAll(g.container).length >= 4);
});

test("buildSelector prefers a unique id anchor", async () => {
  const doc = await docFromFixture("chartink-screener.html");
  const table = doc.querySelector("#DataTables_Table_0");
  assert.equal(buildSelector(table, doc), "#DataTables_Table_0");
});

/* ----------------------------- Pagination ----------------------------- */

test("findNextUrl detects rel=next / .next link", async () => {
  const doc = await docFromFixture("list-sample.html");
  assert.equal(findNextUrl(doc), "/list?page=2");
});

test("findNextUrl honours an explicit selector and returns null when absent", async () => {
  const doc = await docFromFixture("chartink-screener.html");
  assert.equal(findNextUrl(doc), null, "chartink fixture has no pager");
  const doc2 = await docFromFixture("list-sample.html");
  assert.equal(findNextUrl(doc2, { nextSelector: "a[rel=next]" }), "/list?page=2");
});

test("crawl walks pages until no next link, resolving relative URLs", async () => {
  const p1 = await readFile(path.join(FIXTURES, "list-sample.html"), "utf8");
  // page 2 has the same items but no pager → crawl stops after 2
  const p2 = p1.replace(/<nav[\s\S]*?<\/nav>/, "");
  const pages = { "https://x.test/list": p1, "https://x.test/list?page=2": p2 };
  const fetchAndParse = async (url) => (pages[url] ? parseHTML(pages[url]).document : null);
  const results = await crawl(
    fetchAndParse,
    "https://x.test/list",
    { selector: "li.item a.title", mode: "all", extractType: "text" },
    { maxPages: 5 },
  );
  assert.equal(results.length, 2, "should crawl exactly two pages");
  assert.equal(results[1].url, "https://x.test/list?page=2");
});

/* ----------------------------- Export ----------------------------- */

test("toCSV escapes commas, quotes and newlines", () => {
  const csv = toCSV(
    [{ a: "hi, there", b: 'say "hey"' }, { a: "line\nbreak", b: "x" }],
    ["a", "b"],
  );
  const lines = csv.split("\r\n");
  assert.equal(lines[0], "a,b");
  assert.equal(lines[1], '"hi, there","say ""hey"""');
  assert.equal(lines[2], '"line\nbreak",x');
});

test("toJSON / toNDJSON shapes", () => {
  const recs = [{ x: 1 }, { x: 2 }];
  assert.equal(JSON.parse(toJSON(recs)).length, 2);
  assert.equal(toNDJSON(recs).split("\n").length, 2);
});

/* ----------------------------- Recipe ----------------------------- */

test("normalizeRecipe round-trips and sanitizes", () => {
  const r = normalizeRecipe({
    container: "table tr",
    fields: [{ name: "a", selector: "td", type: "bogus" }, { junk: true }],
    mode: "all",
    index: "3",
    extractType: "attr",
  });
  assert.equal(r.fields.length, 1, "drops field without a name-only entry? keeps named");
  assert.equal(r.fields[0].type, "text", "bogus type coerced to text");
  assert.equal(r.mode, "all");
  assert.equal(r.index, 3);
  assert.equal(r.extractType, "attr");
  // defaults present
  assert.equal(defaultRecipe().pagination.mode, "none");
  assert.equal(JSON.parse(JSON.stringify(r)).container, "table tr");
});

/* ----------------------------- Entitlement ----------------------------- */

test("free tier caps rows; pro is unlimited; license flips tier", () => {
  const mem = new Map();
  const store = { get: (k) => mem.get(k) ?? null, set: (k, v) => mem.set(k, v) };
  const ent = createEntitlement(store);

  assert.equal(ent.tier(), "free");
  assert.equal(ent.can("liveScrape"), false, "live scrape is Pro-gated");
  assert.equal(ent.can("exportCsv"), true, "unlisted feature is free");

  const first = ent.recordUsage(490);
  assert.equal(first.allowed, true);
  assert.equal(ent.rowsRemaining(), 10);
  const over = ent.recordUsage(50);
  assert.equal(over.allowed, false, "exceeding the cap is flagged");

  assert.equal(ent.setLicense("bad-key"), false);
  assert.equal(ent.setLicense("SCR-AB12-CD34"), true);
  assert.equal(ent.tier(), "pro");
  assert.equal(ent.can("liveScrape"), true);
  assert.equal(ent.rowsRemaining(), Infinity);
});

/* ----------------------------- Runner ----------------------------- */

let passed = 0;
let failed = 0;
for (const { name, fn } of tests) {
  try {
    await fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`  ✗ ${name}\n      ${err.message}`);
  }
}
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
