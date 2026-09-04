import fs from "node:fs";
import vm from "node:vm";

const sourcePath = new URL("./src/index.js", import.meta.url);
const source = fs.readFileSync(sourcePath, "utf8");
const cleaned = source
  .replace(/import\s*\{[^}]*\}\s*from\s*["']\.\/shared\.js["'];?\n?/g, "")
  .replace(/export\s*\{[\s\S]*?\};?\s*$/g, "");

const patterns = {
  "meta[property='og:title']":
    /meta[^>]*property=['\"]og:title['\"][^>]*content=['\"]([^'\"]+)['\"]/i,
  "meta[property='og:description']":
    /meta[^>]*property=['\"]og:description['\"][^>]*content=['\"]([^'\"]+)['\"]/i,
  ".c-book-name": /class=['\"][^'\"]*c-book-name[^'\"]*['\"][^>]*>(.*?)<\//is,
  ".faded": /class=['\"][^'\"]*faded[^'\"]*['\"][^>]*>(.*?)<\//is,
  title: /<title>(.*?)<\/title>/is,
};

function lookup(selector, rawHtml) {
  const match = patterns[selector]?.exec(rawHtml);
  if (!match) return null;
  const value = (match[1] || "")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return value || null;
}

const context = {
  console,
  fetch,
  URL,
  setTimeout,
  clearTimeout,
  localStorage: {
    getItem() {
      return null;
    },
    setItem() {},
    removeItem() {},
  },
  navigator: { hardwareConcurrency: 4, deviceMemory: 4 },
  DOMParser: class {
    parseFromString(rawHtml) {
      return {
        querySelector(selector) {
          const text = lookup(selector, rawHtml);
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
  },
  createSelectorStore: (storageKey, defaults) => ({
    get: (key) => defaults[key],
  }),
  createLimiter: () => async (task) => task(),
  applyProxyPrefix: (url, prefix) =>
    prefix ? `${prefix}${encodeURIComponent(url)}` : url,
  getDeviceProfile: () => ({
    deviceMemory: 4,
    hardwareConcurrency: 4,
    previewConcurrency: 1,
    downloadConcurrency: 1,
  }),
  globalThis: {},
};
vm.createContext(context);
vm.runInContext(
  cleaned +
    "\n; globalThis.normalizeManifest = normalizeManifest; globalThis.readScriptValue = readScriptValue; globalThis.parseScriptArray = parseScriptArray; globalThis.buildPageKeyUrl = buildPageKeyUrl;",
  context,
);

const html = await fetch(
  "https://www.rekhta.org/ebooks/deewan-ghalib-mirza-ghalib-ebooks",
).then((res) => res.text());
const manifest = context.normalizeManifest(
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
    },
    null,
    2,
  ),
);
