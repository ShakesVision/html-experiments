// Poetry/prose scraping engine — the dynamic replacement for dRekhta's
// bookmarklet. Book-specific logic (manifest/unscramble/canvas) stays out of
// here on purpose; only createLimiter/fetchHtml are shared with the book app.
import { createLimiter, createSelectorStore, fetchHtml } from "../../src/shared.js";

const REKHTA_ORIGIN = "https://www.rekhta.org";

// Every CSS selector this scraper pulls from Rekhta, in one editable place.
// If Rekhta renames a class and discovery/reading breaks, a user can fix the
// matching value from the in-app selector settings — no code change needed.
const POETRY_SELECTOR_DEFS = [
  { key: "poetCard", label: "Search · poet card", description: "Each poet/author card in search results.", def: ".poetColumn" },
  { key: "poetNameLink", label: "Search · name link", description: "The name link inside a poet card (its href is the profile).", def: ".poetDescColumn .poetNameDatePlace a[href]" },
  { key: "poetImage", label: "Search · photo", description: "The poet's photo inside a search card.", def: ".poetListImg img" },
  { key: "categoryLink", label: "Profile · category links", description: "Content-category links on a poet's profile (with counts).", def: "li h2 a[href]" },
  { key: "listingPager", label: "Listing · page loader", description: "Hidden pagination markers that hold every listing page's URL.", def: ".contentLoadMorePaging[data-url]" },
  { key: "listingItem", label: "Listing · item heading", description: "Each work's title heading in a listing (ghazals, nazms, stories…).", def: "h3.noPoetSubTtl" },
  { key: "coupletSection", label: "Couplets · block", description: "Each inline couplet block on a couplets listing.", def: ".sherSection" },
  { key: "coupletLines", label: "Couplets · lines", description: "The verse lines inside a couplet block.", def: ".sherLines .pMC p" },
  { key: "coupletAuthor", label: "Couplets · author", description: "The author name inside a couplet block.", def: ".poetName" },
  { key: "workTitle", label: "Work page · title", description: "The title heading on a single poem/story page.", def: "h1" },
  { key: "workAuthor", label: "Work page · author", description: "The author link on a single poem/story page.", def: "a.ghazalAuthor" },
  { key: "workBody", label: "Work page · body", description: "The text container on a single poem/story page (last match is the real one).", def: ".pMC" },
];

const poetrySelectors = createSelectorStore(
  "rekhta_poetry_selectors_v1",
  Object.fromEntries(POETRY_SELECTOR_DEFS.map((d) => [d.key, d.def])),
);

const S = (key) => poetrySelectors.get(key);

// Profile-tab entries outside this set (profile, audio, video, blogs, t20,
// imageshayari, other, ...) are curated/media pages, not plain-text content
// we can scrape the same way.
const KNOWN_CATEGORY_SLUGS = new Set([
  "ghazals", "nazms", "couplets", "stories", "marsiya", "qita", "rubaai",
  "qasiida", "naat", "salaam", "manqabat", "dohe", "rekhti", "afsanche",
  "tanz-o-mazah", "hindi-ghazals", "quotes", "articles", "mazahiya",
  "masnavii", "vaasokht", "tazmiin", "tarkiib-band", "allusions", "mahiye",
  "kah-mukarniyan", "lori", "haiku", "geet", "ashra", "paheli", "tarajim",
  "latiife", "drama", "novelette", "mukhammas", "unpublished-ghazal",
  "unpublished-sher", "khud-navisht-savaaneh", "children-s-stories",
]);

// Categories that read as prose (paragraphs) rather than verse (lines/couplets).
const PROSE_SLUGS = new Set([
  "stories", "children-s-stories", "articles", "drama", "novelette",
  "khud-navisht-savaaneh", "latiife",
]);

export {
  KNOWN_CATEGORY_SLUGS,
  POETRY_SELECTOR_DEFS,
  PROSE_SLUGS,
  collectListingLinks,
  discoverPoetCategories,
  fetchWorkContent,
  poetrySelectors,
  searchPoets,
  toRekhtaAbsoluteUrl,
};

function toRekhtaAbsoluteUrl(href) {
  if (!href) {
    return "";
  }

  if (/^https?:\/\//i.test(href)) {
    return href;
  }

  if (href.startsWith("/")) {
    return `${REKHTA_ORIGIN}${href}`;
  }

  return `${REKHTA_ORIGIN}/${href}`;
}

function slugFromUrl(url) {
  try {
    const segments = new URL(url).pathname.split("/").filter(Boolean);
    return segments[segments.length - 1] || "";
  } catch {
    return "";
  }
}

async function searchPoets(keyword, lang, { proxyPrefix, signal } = {}) {
  const url = `${REKHTA_ORIGIN}/poets?keyword=${encodeURIComponent(keyword)}&lang=${encodeURIComponent(lang)}`;
  const doc = await fetchHtml(url, { proxyPrefix, signal });

  return Array.from(doc.querySelectorAll(S("poetCard")))
    .map((card) => {
      const anchor = card.querySelector(S("poetNameLink"));
      const href = anchor?.getAttribute("href")?.trim();
      const name = anchor?.querySelector("h2")?.textContent?.trim() || anchor?.textContent?.trim();
      const image = card.querySelector(S("poetImage"))?.getAttribute("src") || "";

      if (!href || !name) {
        return null;
      }

      return { name, href: toRekhtaAbsoluteUrl(href), image };
    })
    .filter(Boolean);
}

async function discoverPoetCategories(profileUrl, { proxyPrefix, signal } = {}) {
  const doc = await fetchHtml(profileUrl, { proxyPrefix, signal });
  const categories = [];

  doc.querySelectorAll(S("categoryLink")).forEach((anchor) => {
    const href = anchor.getAttribute("href")?.trim();
    if (!href) {
      return;
    }

    const slug = slugFromUrl(href);
    if (!KNOWN_CATEGORY_SLUGS.has(slug)) {
      return;
    }

    const count = Number(anchor.querySelector("span")?.textContent?.trim()) || 0;
    if (!count) {
      return;
    }

    const labelNode = anchor.cloneNode(true);
    labelNode.querySelector("span")?.remove();

    categories.push({
      count,
      href: toRekhtaAbsoluteUrl(href),
      isProse: PROSE_SLUGS.has(slug),
      label: labelNode.textContent.trim() || slug,
      slug,
    });
  });

  return categories;
}

// One "page" of a listing = the initial full page, or one of the AJAX
// fragments returned by a literal `.contentLoadMorePaging[data-url]` — the
// mechanism that removes the old bookmarklet requirement entirely.
async function collectListingLinks(categoryUrl, { proxyPrefix, signal, onProgress } = {}) {
  const firstPageDoc = await fetchHtml(categoryUrl, { proxyPrefix, signal });
  const extraPageUrls = Array.from(
    firstPageDoc.querySelectorAll(S("listingPager")),
  ).map((el) => toRekhtaAbsoluteUrl(el.getAttribute("data-url")));

  const limiter = createLimiter(3);
  let pagesDone = 0;
  const reportProgress = () => {
    pagesDone += 1;
    onProgress?.(pagesDone, extraPageUrls.length + 1);
  };

  reportProgress(); // the page we already fetched above
  const extraDocs = await Promise.all(
    extraPageUrls.map((url) =>
      limiter(async () => {
        const doc = await fetchHtml(url, { proxyPrefix, signal });
        reportProgress();
        return doc;
      }),
    ),
  );

  const items = [];
  [firstPageDoc, ...extraDocs].forEach((doc) => {
    const inlineCouplets = extractInlineCouplets(doc);
    if (inlineCouplets.length) {
      items.push(...inlineCouplets);
      return;
    }

    doc.querySelectorAll(S("listingItem")).forEach((heading) => {
      const href = heading.closest("a[href]")?.getAttribute("href")?.trim();
      if (!href) {
        return;
      }

      items.push({
        href: toRekhtaAbsoluteUrl(href),
        resolved: false,
        title: heading.textContent.trim(),
      });
    });
  });

  return items;
}

// Couplets ("sher") render fully inline in their own listing page — each
// `.sherSection` already carries its own text, no per-item page fetch needed.
function extractInlineCouplets(doc) {
  return Array.from(doc.querySelectorAll(S("coupletSection")))
    .map((section) => {
      const lines = Array.from(section.querySelectorAll(S("coupletLines")))
        .map((p) => p.textContent.trim())
        .filter(Boolean);

      if (!lines.length) {
        return null;
      }

      const author = section.querySelector(S("coupletAuthor"))?.textContent?.trim() || "";
      const sourceHref = section.getAttribute("data-content-url");

      return {
        author,
        href: sourceHref ? toRekhtaAbsoluteUrl(sourceHref) : "",
        resolved: true,
        text: lines.join("\n"),
        title: lines[0],
      };
    })
    .filter(Boolean);
}

async function fetchWorkContent(href, { proxyPrefix, signal } = {}) {
  const doc = await fetchHtml(href, { proxyPrefix, signal });
  const title = doc.querySelector(S("workTitle"))?.textContent?.trim() || "Untitled";
  const author = doc.querySelector(S("workAuthor"))?.textContent?.trim() || "";

  // The real body is the LAST match in the document — an earlier one is a
  // hidden "download as image" widget carrying decoy/placeholder text.
  const pmcBlocks = doc.querySelectorAll(S("workBody"));
  const bodyBlock = pmcBlocks[pmcBlocks.length - 1];
  const text = bodyBlock
    ? Array.from(bodyBlock.querySelectorAll("p"))
        .map((p) => p.textContent.trim())
        .filter(Boolean)
        .join("\n")
    : "";

  return { author, href, text, title };
}
