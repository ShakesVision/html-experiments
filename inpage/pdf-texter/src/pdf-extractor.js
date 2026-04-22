function pickFirstString(values) {
  return values.find((value) => typeof value === "string" && value.trim());
}

function getCommonObjData(page, fontName) {
  try {
    const commonObjs = page.commonObjs;
    if (!commonObjs) {
      return null;
    }

    if (typeof commonObjs.has === "function" && !commonObjs.has(fontName)) {
      return null;
    }

    if (typeof commonObjs.get === "function") {
      return commonObjs.get(fontName);
    }
  } catch {
    return null;
  }

  return null;
}

function getResolvedFontName(page, item, styles) {
  const style = styles[item.fontName] ?? {};
  const commonObj = getCommonObjData(page, item.fontName);

  const resolved = pickFirstString([
    commonObj?.psName,
    commonObj?.name,
    commonObj?.fontName,
    commonObj?.loadedName,
    commonObj?.fallbackName,
    commonObj?.cssFontInfo?.fontFamily,
    style.fontSubstitution,
    style.fontFamily,
    item.fontName,
  ]) || "Unknown";

  return {
    rawFontName: item.fontName || "Unknown",
    resolvedFontName: resolved,
    commonObj,
    style,
  };
}

function isLikelyBold(fontInfo) {
  return /bold/i.test(
    [
      fontInfo.resolvedFontName,
      fontInfo.commonObj?.psName,
      fontInfo.commonObj?.name,
      fontInfo.style?.fontFamily,
    ]
      .filter(Boolean)
      .join(" ")
  );
}

function getFontSize(item) {
  const transformSize = Math.abs(item.transform?.[3] ?? 0);
  return item.height || transformSize || 0;
}

function getBottom(item) {
  return item.transform?.[5] ?? 0;
}

export async function extractLegacyLikeRuns(pdfDocument, pageNumber, options = {}) {
  const page = await pdfDocument.getPage(pageNumber);
  try {
    await page.getOperatorList();
  } catch {
    // Best-effort only. Some PDF.js builds may not expose useful commonObjs data here.
  }
  const textContent = await page.getTextContent();
  const runs = [];

  let lastBottom = 0;
  let lastFontSize = 0;
  let lastText = "";
  let lastFont = "";
  let ligatureRepeatCount = 0;

  for (const item of textContent.items) {
    const fontInfo = getResolvedFontName(page, item, textContent.styles);
    const fontName = fontInfo.resolvedFontName;
    const fontSize = getFontSize(item);
    const bottom = getBottom(item);
    const lineBreak = Boolean(
      item.hasEOL ||
        (runs.length > 0 && options.lineFeed !== false && bottom < (lastBottom - lastFontSize))
    );

    let text = item.str ?? "";
    if (text === lastText && fontName === lastFont) {
      ligatureRepeatCount += 1;
    } else {
      ligatureRepeatCount = 0;
    }

    if (ligatureRepeatCount === 3) {
      ligatureRepeatCount = 0;
      lastText = "";
      lastFont = "";
      text += "۞";
    }

    runs.push({
      pageNumber,
      fontName: isLikelyBold(fontInfo) ? `${fontName}-Bold` : fontName,
      rawFontName: fontInfo.rawFontName,
      resolvedFontName: fontInfo.resolvedFontName,
      styleFontFamily: fontInfo.style?.fontFamily || "",
      psName: fontInfo.commonObj?.psName || "",
      loadedName: fontInfo.commonObj?.loadedName || "",
      fontSize,
      bottom,
      lineBreak,
      text,
    });

    lastBottom = bottom;
    lastFontSize = fontSize;
    lastText = text;
    lastFont = fontName;
  }

  return runs;
}
