const XML_FILES = {
  ligatures: "./UnicodeToInpage/NastLig.xml",
  uniToInpage: "./UnicodeToInpage/UniToInpage.xml",
  inpageToUni: "./UnicodeToInpage/InpageToUni.xml",
};

function decodeXml(text = "") {
  return text
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'");
}

function extractBlocks(xmlText, tagName) {
  const pattern = new RegExp(`<${tagName}>([\\s\\S]*?)<\\/${tagName}>`, "g");
  return [...xmlText.matchAll(pattern)].map((match) => match[1]);
}

function textOf(block, tagName) {
  const match = new RegExp(`<${tagName}>([\\s\\S]*?)<\\/${tagName}>`).exec(
    block,
  );
  return decodeXml(match?.[1]?.trim() ?? "");
}

async function readXml(relativePath) {
  if (typeof window !== "undefined" && typeof fetch === "function") {
    const response = await fetch(relativePath);
    return response.text();
  }

  const { readFile } = await import("node:fs/promises");
  const absolute = new URL(relativePath, import.meta.url);
  return readFile(absolute, "utf8");
}

export async function loadLegacyMappings() {
  const [ligaturesXml, uniToInpageXml, inpageToUniXml] = await Promise.all([
    readXml(XML_FILES.ligatures),
    readXml(XML_FILES.uniToInpage),
    readXml(XML_FILES.inpageToUni),
  ]);

  const ligatureMap = new Map();
  for (const row of extractBlocks(ligaturesXml, "Ligatures")) {
    const fontName = textOf(row, "FontName");
    const unicodeDec = Number(textOf(row, "UnicodeDec"));
    if (!fontName || Number.isNaN(unicodeDec)) {
      continue;
    }

    ligatureMap.set(`${fontName}:${unicodeDec}`, {
      fontName,
      unicodeDec,
      ligature: textOf(row, "Ligature"),
      skipSpace: textOf(row, "SkipSpace"),
      origWord: textOf(row, "OrigWord"),
    });
  }

  const uniToInpage = extractBlocks(uniToInpageXml, "UniToInpage").map(
    (row) => ({
      unicodeDec: Number(textOf(row, "UnicodeDec")),
      inpageDec: Number(textOf(row, "InpageDec")),
      codePage: Number(textOf(row, "CodePage")),
      type: textOf(row, "Type"),
      string1: textOf(row, "String1"),
      endTrans: textOf(row, "EndTrans"),
      ignore: textOf(row, "Ignore"),
    }),
  );

  const inpageToUni = extractBlocks(inpageToUniXml, "InpageToUni").map(
    (row) => ({
      inpageDec: Number(textOf(row, "InpageDec")),
      unicodeDec: Number(textOf(row, "UnicodeDec")),
      ignore: textOf(row, "Ignore"),
    }),
  );

  return {
    ligatureMap,
    uniToInpage,
    inpageToUni,
  };
}
