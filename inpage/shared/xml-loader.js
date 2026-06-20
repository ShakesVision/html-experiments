const XML_BASE = new URL("../pdf-texter/UnicodeToInpage/", import.meta.url);

const XML_FILES = {
  ligatures: "NastLig.xml",
  uniToInpage: "UniToInpage.xml",
  inpageToUni: "InpageToUni.xml",
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
  const match = new RegExp(`<${tagName}>([\\s\\S]*?)<\\/${tagName}>`).exec(block);
  return decodeXml(match?.[1]?.trim() ?? "");
}

async function readXml(fileName, baseUrl = XML_BASE) {
  const url = new URL(fileName, baseUrl);
  if (typeof window !== "undefined" && typeof fetch === "function") {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to load ${url.pathname}: ${response.status}`);
    }
    return response.text();
  }

  const { readFile } = await import("node:fs/promises");
  const { fileURLToPath } = await import("node:url");
  return readFile(fileURLToPath(url), "utf8");
}

function parseLigatureMap(ligaturesXml) {
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
  return ligatureMap;
}

function parseUniToInpage(uniToInpageXml) {
  return extractBlocks(uniToInpageXml, "UniToInpage").map((row) => ({
    unicodeDec: Number(textOf(row, "UnicodeDec")),
    inpageDec: Number(textOf(row, "InpageDec")),
    codePage: Number(textOf(row, "CodePage")),
    type: textOf(row, "Type"),
    string1: textOf(row, "String1"),
    endTrans: textOf(row, "EndTrans"),
    ignore: textOf(row, "Ignore"),
  }));
}

function parseInpageToUni(inpageToUniXml) {
  return extractBlocks(inpageToUniXml, "InpageUni").map((row) => ({
    inpageDec: Number(textOf(row, "InpageDec")),
    unicodeDec: Number(textOf(row, "UnicodeDec")),
    ignore: textOf(row, "Ignore"),
  }));
}

export async function loadBidiMappings(options = {}) {
  const baseUrl = options.baseUrl ?? XML_BASE;
  const [uniToInpageXml, inpageToUniXml] = await Promise.all([
    readXml(XML_FILES.uniToInpage, baseUrl),
    readXml(XML_FILES.inpageToUni, baseUrl),
  ]);

  return {
    uniToInpage: parseUniToInpage(uniToInpageXml),
    inpageToUni: parseInpageToUni(inpageToUniXml),
  };
}

export async function loadLegacyMappings(options = {}) {
  const baseUrl = options.baseUrl ?? XML_BASE;
  const [ligaturesXml, uniToInpageXml, inpageToUniXml] = await Promise.all([
    readXml(XML_FILES.ligatures, baseUrl),
    readXml(XML_FILES.uniToInpage, baseUrl),
    readXml(XML_FILES.inpageToUni, baseUrl),
  ]);

  return {
    ligatureMap: parseLigatureMap(ligaturesXml),
    uniToInpage: parseUniToInpage(uniToInpageXml),
    inpageToUni: parseInpageToUni(inpageToUniXml),
  };
}

export { extractBlocks, textOf, decodeXml, readXml, XML_BASE };
