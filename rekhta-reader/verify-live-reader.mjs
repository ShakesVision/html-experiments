Object.defineProperty(globalThis, "localStorage", {
  value: {
    getItem() {
      return null;
    },
    setItem() {},
    removeItem() {},
  },
  configurable: true,
});

const patterns = {
  "meta[property='og:title']":
    /meta[^>]*property=['\"]og:title['\"][^>]*content=['\"]([^'\"]+)['\"]/i,
  "meta[property='og:description']":
    /meta[^>]*property=['\"]og:description['\"][^>]*content=['\"]([^'\"]+)['\"]/i,
  ".c-book-name": /class=['\"][^'\"]*c-book-name[^'\"]*['\"][^>]*>(.*?)<\//is,
  ".faded": /class=['\"][^'\"]*faded[^'\"]*['\"][^>]*>(.*?)<\//is,
  title: /<title>(.*?)<\/title>/is,
};

globalThis.DOMParser = class {
  parseFromString(rawHtml) {
    return {
      querySelector(selector) {
        const match = patterns[selector]?.exec(rawHtml);
        if (!match) return null;
        const text = (match[1] || "")
          .replace(/<[^>]+>/g, "")
          .replace(/\s+/g, " ")
          .trim();
        if (!text) return null;
        return {
          textContent: text,
          getAttribute(name) {
            return name === "content" ? text : null;
          },
        };
      },
    };
  }
};

const { normalizeManifest } = await import(
  new URL("./src/index.js", import.meta.url)
);
const html = await fetch(
  "https://www.rekhta.org/ebooks/deewan-ghalib-mirza-ghalib-ebooks",
).then((response) => response.text());
const manifest = normalizeManifest(
  "https://www.rekhta.org/ebooks/deewan-ghalib-mirza-ghalib-ebooks",
  html,
);
console.log(
  JSON.stringify(
    {
      bookName: manifest.bookName,
      author: manifest.author,
      pageCount: manifest.pageCount,
      pageIdsCount: manifest.pageIds.length,
      firstPageId: manifest.pageIds[0],
      firstPageKeyUrl: manifest.scrambleMap[0]?.keyUrl,
      firstImageUrl: manifest.scrambleMap[0]?.imgUrl,
    },
    null,
    2,
  ),
);
