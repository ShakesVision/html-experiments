// Pagination: find the "next page" link (explicit selector or heuristic), and
// a crawl driver that walks pages via an injected fetch+parse function.
import { extract } from "./extract.js";

export { findNextUrl, crawl };

const NEXT_TEXT = /^(next|older|more|load more|›|»|→|>>?)$/i;
const NEXT_REL = /next/i;

// Returns the href of the next-page link, or null. Explicit `nextSelector`
// wins; otherwise a rel=next / text / class heuristic.
function findNextUrl(root, options = {}) {
  const pick = (el) => {
    if (!el) return null;
    const href = el.getAttribute ? el.getAttribute("href") : null;
    return (el.href || href) || null;
  };

  if (options.nextSelector) {
    try { return pick(root.querySelector(options.nextSelector)); } catch { return null; }
  }

  const relNext = root.querySelector('a[rel~="next"], link[rel="next"]');
  if (relNext) return pick(relNext);

  const classNext = root.querySelector(
    '.next a, a.next, .pagination-next a, a.pagination-next, [class*="next"] a[href]',
  );
  if (classNext) return pick(classNext);

  const anchors = Array.from(root.querySelectorAll("a[href]"));
  const byText = anchors.find((a) => NEXT_TEXT.test((a.textContent || "").trim())) ||
    anchors.find((a) => NEXT_REL.test(a.getAttribute("aria-label") || ""));
  return pick(byText);
}

// Walk up to maxPages, extracting from each. `fetchAndParse(url)` must resolve
// to a DOM root (Document/Element). Resolves relative next-URLs against the
// page they were found on. Aborts on error or when no next link is found.
async function crawl(fetchAndParse, startUrl, recipe, options = {}) {
  const maxPages = Math.max(1, options.maxPages || 1);
  const onPage = options.onPage || (() => {});
  const results = [];
  const seen = new Set();

  let url = startUrl;
  for (let page = 1; page <= maxPages && url && !seen.has(url); page += 1) {
    seen.add(url);
    const root = await fetchAndParse(url);
    if (!root) break;

    const extracted = extract(root, recipe);
    results.push({ url, page, ...extracted });
    onPage(page, extracted, url);

    let next = findNextUrl(root, recipe.pagination || {});
    if (next) {
      try { next = new URL(next, url).href; } catch { /* keep as-is */ }
    }
    url = next;
  }

  return results;
}
