import fs from "fs";

async function test() {
  const slug = "deewan-ghalib-mirza-ghalib-ebooks";
  const bookId = "b833ccde-1b5b-4e7e-a4d1-bb05f074f4a9";

  console.log("Testing GetEbookPageIds from=1 count=10:");
  const res1 = await fetch(
    `https://www.rekhta.org/EbookData/GetEbookPageIds/?slug=${slug}&lang=1&from=1&count=10`,
    {
      headers: {
        "User-Agent": "Mozilla/5.0",
        Referer: "https://www.rekhta.org/",
        Origin: "https://www.rekhta.org",
      },
    },
  );
  const data1 = await res1.json();
  console.log("from=1 IDs:", data1);

  console.log("\nTesting GetEbookPageIds from=11 count=10:");
  const res2 = await fetch(
    `https://www.rekhta.org/EbookData/GetEbookPageIds/?slug=${slug}&lang=1&from=11&count=10`,
    {
      headers: {
        "User-Agent": "Mozilla/5.0",
        Referer: "https://www.rekhta.org/",
        Origin: "https://www.rekhta.org",
      },
    },
  );
  const data2 = await res2.json();
  console.log("from=11 IDs:", data2);

  if (data2.ids && data2.ids[0]) {
    const pageId11 = data2.ids[0];
    console.log(
      "\nTesting GetEbookFromApi for Page 11 (pgIdx=11, pgid=",
      pageId11,
      "):",
    );
    const keyUrl = `https://www.rekhta.org/EbookData/GetEbookFromApi/?bkId=${bookId}&pgIdx=11&pgid=${pageId11}`;
    const resKey = await fetch(keyUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0",
        Referer: "https://www.rekhta.org/",
        Origin: "https://www.rekhta.org",
      },
    });
    const textKey = await resKey.text();
    console.log(
      "Page 11 key response status:",
      resKey.status,
      "length:",
      textKey.length,
    );
    console.log("Preview:", textKey.slice(0, 300));
  }
}

test();
