const bookUrl =
  "https://www.rekhta.org/ebooks/deewan-ghalib-mirza-ghalib-ebooks";
const html = await fetch(bookUrl).then((response) => response.text());

const checks = {
  titleMeta:
    /meta[^>]*property=['\"]og:title['\"][^>]*content=['\"]([^'\"]+)['\"]/i.test(
      html,
    ),
  authorMeta:
    /meta[^>]*property=['\"]og:description['\"][^>]*content=['\"]([^'\"]+)['\"]/i.test(
      html,
    ),
  bookIdVar: /var\s+bookId\s*=\s*["']([^"']+)["']/i.test(html),
  totalPageVar: /var\s+totalPageCount\s*=\s*(\d+)/i.test(html),
  pageIdsVar: /var\s+pageIds\s*=\s*new\s+Array\s*\(/i.test(html),
  pageKeyEndpoint: /EbookData\/GetEbookFromApi\s*\//i.test(html),
};

console.log(JSON.stringify(checks, null, 2));
