const END_CHARS = new Set([
  "ب", "پ", "ت", "ٹ", "ث", "ج", "چ", "ح", "خ", "س", "ش", "ص", "ض", "ط", "ظ",
  "ع", "غ", "ف", "ق", "ک", "گ", "ل", "م", "ن", "ں", "ہ", "ھ", "ئ", "ی", "ّ",
  "ِ", "َ", "ٰ", "؂",
]);

const HEN_STRINGS = new Set(["ے", "ی"]);

const ENGLISH_CHARS = new Set(
  " ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz()[]{}./*-+=!@#$%&_<>?\\|;:'\"0123456789".split("")
);

const CLEAN_REPLACEMENTS = [
  ["طاسا", "شا"], ["لنہید", "لہٰذ"], ["سحثیم", "مستقیم"], ["پتھ م بر", "پیغمبر"],
  ["بیار", "بطور"], ["پتہ غ", "بلوغ"], ["آشمع ن", "آسمان"], ["ماظاً", "ماتحت "],
  ["عالم نٹھ", "عالم گیر"], ["ضدانوں", "خزانوں"], ["ضدانے", "خزانے"], ["ضدانہ", "خزانہ"],
  ["فرماہیں ں", "کارفرمائیاں"], ["ابیکر", "اٹھیں"], ["خاپنکھیاں", "خاصیتوں"], ["اسارہ", "اشارہ"],
  ["رٹیکیں", "رہتیں"], ["رئنگ", "رہنے"], ["صفت ات", "حشرات"], ["مریبہ ئ", "مرتبۂ"],
  ["اسارے", "اشارے"], ["شمع ویہ", "سماویہ"], ["براہیں ں", "برائیاں"], ["نقدت", "نجات"],
  ["لہٹ ائیوں", "گہرائیوں"], ["ہمہ نٹھ", "ہمہ گیر"], ["رنکوں", "رنگوں"], ["خالقب", "خالقیت"],
  ["ٹگےطعا", "بہکے چلے"], ["طعاجا", "چلے جا"], ["اجیام", "اجسام"], ["ساداب", "شاداب"],
  ["براہبو", "براہین"], ["میہر", "مضمر"], ["پھگرپن", "پھکڑپن"], ["متکثرم", "میکنزم"],
  ["لتلہ القدر", "لیلۃ القدر"], ["بدطیتاں", "بدظنیاں"], ["حلقہ المسح", "خلیفۃالمسیح"],
  ["غیرمباعیں", "غیرمبائعین"], ["ہیں ا ", "میرا"], ["میراور", "ہیں اور"], ["انقص اف", "انحراف"],
  ["لہٹ ا", "گہرا"], ["ہیں ں", "ئیاں"], ["شمع ئ", "سمائی"], ["تدرفظت", "تدریجی"],
  ["نالنہ نی", "ناگہانی"], ["آبطوری", "آبیاری"], ["ظلہ س", "پچاس"], ["رہےمیر", "رہے ہیں"],
  ["تےمیر", "تے ہیں"], ["میر۔", "ہیں۔"], ["رکھی میر", "رکھی ہیں"], ["ہےمیر", "ہے ہیں"],
  ["تممیر", "تمہیں"], ["صدفہ", "صدقہ"], ["راسیتاز", "راستباز"], ["فملثر", "فیملیز"],
  ["میران", "ہیں ان"], ["حتیتاں", "چینیاں"], ["متیتک", "میٹیک"], ["سکتیتک", "سکیننگ"],
  ["مصاحتیں", "مصاحبین"], ["تی میر", "تی ہیں"], ["المسح", "المسیح"], ["حضرت حلقہ", "حضرت خلیفۃ"],
  ["لدت", "لذت"], ["مسیعد", "مستعد"], ["ہیںا", "ہیں ا"], ["صطردلی", "سنگ دلی"],
  ["ضہیں", "ضمیر"], ["بادشاساہ", "بادشاہ"], ["اشاشارہ", "اشارہ"], ["ہیں ی", "میری"],
  ["ہیں ے", "میرے"], ["ہیں ا", "میرا"],
];

const FONT_CLEAN_MAP = new Map(
  Array.from({ length: 99 }, (_, index) => {
    const no = String(index + 1).padStart(2, "0");
    return [`NOORI${String(index + 1).padStart(3, "0")}`, `NOORIN${no}`];
  }).concat([
    ["NOORIC01", "NOORIC01"],
    ["NOORIC02", "NOORIC02"],
    ["NOORIC", "NOORIC"],
  ])
);

const HIGH_CHAR_MAP = new Map([
  [257, 158], [338, 140], [339, 156], [352, 138], [353, 154], [376, 159], [381, 142],
  [382, 158], [402, 131], [710, 136], [732, 152], [956, 181], [8211, 150], [8212, 151],
  [8216, 145], [8217, 146], [8218, 130], [8220, 147], [8221, 148], [8222, 132], [8224, 134],
  [8225, 135], [8226, 149], [8230, 133], [8240, 137], [8249, 139], [8250, 155], [8364, 128],
  [8482, 153], [8722, 173],
]);

const FONT_REMAPS = new Map([
  ["NOORIN06:8", 157], ["NOORIN09:247", 144], ["NOORIN11:219", 158], ["NOORIN11:247", 217],
  ["NOORIN14:5", 127], ["NOORIN14:203", 173], ["NOORIN14:215", 144], ["NOORIN14:216", 127],
  ["NOORIN14:247", 252], ["NOORIN15:247", 254], ["NOORIN21:2", 121], ["NOORIN49:212", 127],
  ["NOORIN53:213", 142], ["NOORIN81:163", 142], ["NOORIN81:63", 142], ["NOORIN81:166", 158],
  ["NOORIN82:141", 20], ["NOORIN82:97", 158], ["NOORIN82:147", 158], ["NOORIN82:138", 173],
]);

const SKIP_RULES = [
  { chCode: 46, font: "NOORIN86", preChar: 125, preFont: "NOORIN81", result: 1 },
  { chCode: 46, font: "NOORIN86", preChar: 93, preFont: "NOORIN81", result: 1 },
  { chCode: 46, font: "NOORIN86", preChar: 95, preFont: "NOORIN81", result: 1 },
  { chCode: 46, font: "NOORIN86", preChar: 126, preFont: "NOORIN81", result: 1 },
  { chCode: 47, font: "NOORIN86", preChar: 154, preFont: "NOORIN82", result: 1 },
  { chCode: 47, font: "NOORIN86", preChar: 156, preFont: "NOORIN82", result: 1 },
  { chCode: 47, font: "NOORIN86", preChar: 164, preFont: "NOORIN82", result: 1 },
  { chCode: 47, font: "NOORIN86", preChar: 165, preFont: "NOORIN82", result: 1 },
  { chCode: 47, font: "NOORIN86", preChar: 166, preFont: "NOORIN82", result: 1 },
  { chCode: 56, font: "NOORIN86", preChar: 162, preFont: "NOORIN28", result: 1 },
  { chCode: 56, font: "NOORIN86", preChar: 166, preFont: "NOORIN28", result: 1 },
  { chCode: 56, font: "NOORIN86", preChar: 167, preFont: "NOORIN28", result: 1 },
  { chCode: 111, font: "NOORIN86", preChar: 92, preFont: "NOORIN32", result: 1 },
  { chCode: 112, font: "NOORIN86", preChar: 112, preFont: "NOORIN32", result: 1 },
  { chCode: 215, font: "NOORIN83", preChar: 39, preFont: "NOORIN82", result: 1 },
  { chCode: 219, preChar: 140, preFont: "NOORIN82", result: 1 },
  { chCode: 219, font: "NOORIN83", preChar: 129, preFont: "NOORIN82", result: 1 },
  { chCode: 219, font: "NOORIN83", preChar: 130, preFont: "NOORIN82", result: 1 },
  { chCode: 225, font: "NOORIN83", preChar: 247, preFont: "NOORIN81", result: 127 },
  { chCode: 225, font: "NOORIN83", preChar: 144, preFont: "NOORIN81", result: 1 },
];

function cleanFont(fontName = "") {
  let font = fontName.toUpperCase().replace(/['"\s]/g, "");

  if (font.includes("+")) {
    const match = font
      .split("+")
      .find((part) => part.includes("NOORI") || part.includes("JAMEEL"));
    if (match) {
      font = match;
    }
  }

  if (font.includes("-")) {
    const match = font
      .split("-")
      .find((part) => part.includes("NOORI") || part.includes("JAMEEL"));
    if (match) {
      font = match;
    }
  }

  return FONT_CLEAN_MAP.get(font) ?? font;
}

function getCharDefault(chCode, font) {
  if (chCode >= 0xf000 && chCode <= 0xf0ff) {
    chCode -= 0xf000;
  }

  if (HIGH_CHAR_MAP.has(chCode)) {
    return HIGH_CHAR_MAP.get(chCode);
  }

  const fontKey = `${font}:${chCode}`;
  let mapped = FONT_REMAPS.get(fontKey) ?? chCode;
  if (mapped === 142) {
    mapped = 142;
  }
  return mapped;
}

function urduNumber(englishDigit) {
  return ["۰", "۱", "۲", "۳", "۴", "۵", "۶", "۷", "۸", "۹"][Number(englishDigit)] ?? englishDigit;
}

function cleanEnglishWords(line) {
  const englishMatches = [...line].filter((char) => ENGLISH_CHARS.has(char)).join("");
  const engCharAndDigitCount = (line.match(/[a-zA-Z0-9]/g) ?? []).length;

  if (!engCharAndDigitCount || !englishMatches.trim()) {
    return line.trim();
  }

  const parts = line.split(englishMatches.trim());
  if (parts.length === 1) {
    return line.trim();
  }

  return `${parts[1] ?? ""} ${englishMatches} ${parts[0] ?? ""}`.trim();
}

function cleanLines(text, options) {
  return text
    .split("۩")
    .map((line) => {
      const cleaned = cleanEnglishWords(line);
      if (options.swapText && cleaned.includes("ﷺ")) {
        const divided = cleaned.trim().split("ﷺ");
        if (divided.length >= 2) {
          return `${divided[1]}ﷺ${divided[0]}`;
        }
      }
      return cleaned;
    })
    .join("\n");
}

function toFlatText(text) {
  return text
    .split(/\r?\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .join("");
}

function splitUrduSentences(text) {
  const stop = String.fromCharCode(0x06d4);
  const sentences = [];
  let start = 0;

  for (let index = 0; index < text.length; index += 1) {
    if (text[index] === stop) {
      sentences.push(text.slice(start, index + 1));
      start = index + 1;
    }
  }

  if (start < text.length) {
    sentences.push(text.slice(start));
  }

  return sentences.filter(Boolean);
}

function extractVisualLineGroups(runs) {
  const groups = [];
  let current = [];

  for (const run of runs) {
    if (!run?.text?.trim()) {
      continue;
    }

    if (run.lineBreak && current.length) {
      groups.push(current);
      current = [];
    }

    current.push(run);
  }

  if (current.length) {
    groups.push(current);
  }

  return groups;
}

function getMedian(values) {
  const filtered = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (!filtered.length) {
    return 0;
  }
  return filtered[Math.floor(filtered.length / 2)];
}

function buildLineLayoutInfo(decodedLines, runs) {
  const rawLines = extractVisualLineGroups(runs);
  if (rawLines.length !== decodedLines.length) {
    return [];
  }

  return rawLines.map((rawLine, index) => {
    const xs = rawLine.map((run) => run.x).filter((value) => Number.isFinite(value));
    const startX = xs.length ? Math.max(...xs) : Number.NaN;
    const endX = xs.length ? Math.min(...xs) : Number.NaN;
    return {
      text: decodedLines[index],
      startX,
      endX,
      width: Number.isFinite(startX) && Number.isFinite(endX) ? startX - endX : Number.NaN,
    };
  });
}

function applyParagraphModeFromLines(text, runs) {
  const decodedLines = text
    .split(/\r?\n+/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (decodedLines.length <= 1) {
    return decodedLines[0] ?? "";
  }

  const lineInfo = buildLineLayoutInfo(decodedLines, runs);
  if (!lineInfo.length) {
    return applyParagraphMode(text);
  }

  const medianLen = getMedian(lineInfo.map((line) => line.text.length));
  const medianWidth = getMedian(lineInfo.map((line) => line.width));
  const medianStartX = getMedian(lineInfo.map((line) => line.startX));
  const strongStarters = /^(ہماری|ان|کھول|شہر|جب|وہ|یہ|اسی|پھر|مگر|لیکن|ممکن|مسٹر|مسز|ٹھیک)/;
  const shortLenThreshold = medianLen * 0.9;
  const shortWidthThreshold = medianWidth * 0.72;
  const indentThreshold = 12;

  const paragraphs = [];
  let current = lineInfo[0].text;

  for (let index = 1; index < lineInfo.length; index += 1) {
    const previous = lineInfo[index - 1];
    const currentLine = lineInfo[index];
    const previousShort =
      previous.text.length < shortLenThreshold ||
      (Number.isFinite(previous.width) && previous.width < shortWidthThreshold);
    const currentIndented =
      Number.isFinite(currentLine.startX) &&
      Number.isFinite(medianStartX) &&
      currentLine.startX < medianStartX - indentThreshold;
    const shouldBreak =
      previousShort ||
      (currentIndented && strongStarters.test(currentLine.text));

    if (shouldBreak) {
      paragraphs.push(current);
      current = currentLine.text;
      continue;
    }

    current += currentLine.text;
  }

  if (current) {
    paragraphs.push(current);
  }

  return paragraphs.join("\n");
}

function applyParagraphMode(text) {
  const flat = toFlatText(text);
  const sentences = splitUrduSentences(flat);
  if (sentences.length <= 1) {
    return flat;
  }

  const strongStarters = /^(ہماری|ان|کھول|شہر|جب|وہ|یہ|اسی|پھر|مگر|لیکن|ممکن|مسٹر|مسز|ٹھیک)/;
  const paragraphs = [];
  let current = "";
  let currentSentenceCount = 0;

  for (let index = 0; index < sentences.length; index += 1) {
    const sentence = sentences[index];
    const trimmed = sentence.trim();
    if (!trimmed) {
      continue;
    }

    if (!current) {
      current = trimmed;
      currentSentenceCount = 1;
      continue;
    }

    const remaining = sentences.slice(index).join("").trim().length;
    const nextStartsStrong = strongStarters.test(trimmed);
    const shouldBreak =
      (paragraphs.length === 0 && currentSentenceCount === 1 && current.length <= 120) ||
      (current.length >= 380 && current.length <= 650 && nextStartsStrong) ||
      (remaining <= 140 && current.length >= 80);

    if (shouldBreak) {
      paragraphs.push(current);
      current = trimmed;
      currentSentenceCount = 1;
      continue;
    }

    current += trimmed;
    currentSentenceCount += 1;
  }

  if (current) {
    paragraphs.push(current);
  }

  return paragraphs.join("\n");
}

function applyBreakMode(text, options, runs = []) {
  const mode = options.newlineMode ?? "paragraph";
  if (mode === "none") {
    return toFlatText(text);
  }
  if (mode === "line") {
    return text;
  }
  if (runs.length && text.includes("\n")) {
    return applyParagraphModeFromLines(text, runs);
  }
  return applyParagraphMode(text);
}

function removeBoldness(text, options, firstBoldLigature) {
  const lines = text.split("۞٭");
  let regularText = "";
  let lineFeed = false;

  for (let i = 0; i < lines.length; i += 1) {
    if (i === 0) {
      regularText = lines[i];
      const triple = `${firstBoldLigature}${firstBoldLigature}${firstBoldLigature}`;
      regularText = regularText.replaceAll(triple, "");
      regularText = regularText.replaceAll(`${firstBoldLigature} ${firstBoldLigature} ${firstBoldLigature}`, "");
      continue;
    }

    if (i === lines.length - 1) {
      regularText += lines[i];
      continue;
    }

    if (lines[i].length > 3) {
      let line = lines[i];
      if (line.includes("۩")) {
        line = line.replaceAll("۩", "");
        lineFeed = true;
      }
      const offset = Math.floor(line.length / 4);
      regularText += lineFeed ? `۩${line.slice(0, offset)}` : line.slice(0, offset);
      lineFeed = false;
      continue;
    }

    regularText += lines[i];
  }

  return cleanLines(regularText, options);
}

function cleanString(text, options, firstBoldLigature) {
  let cleaned = text;
  for (const [from, to] of CLEAN_REPLACEMENTS) {
    cleaned = cleaned.replaceAll(from, to);
  }
  return removeBoldness(cleaned, options, firstBoldLigature);
}

function extractNooriFont(run) {
  return cleanFont(run.fontName);
}

function nextCharWithDiffFont(runs, index, ligatureMap) {
  const nextRun = runs[index + 1];
  if (!nextRun) {
    return "0";
  }

  const font = extractNooriFont(nextRun);
  if (!font.includes("NOORI")) {
    return "0";
  }

  const chars = [...(nextRun.text ?? "")];
  if (!chars.length) {
    return "0";
  }

  const ch = chars[0].codePointAt(0);
  const row = ligatureMap.get(`${font}:${ch}`);
  return row?.ligature || "0";
}

function applySkipRule(chCode, font, preChar, preFont, runs, runIndex, ligatureMap) {
  if (chCode === 252 && font === "NOORIN14") {
    if (preChar === 90 && preFont === "NOORIN01") {
      return 247;
    }
    if (HEN_STRINGS.has(nextCharWithDiffFont(runs, runIndex, ligatureMap))) {
      return 247;
    }
  }

  const matched = SKIP_RULES.find((rule) =>
    rule.chCode === chCode &&
    (rule.font === undefined || rule.font === font) &&
    (rule.preChar === undefined || rule.preChar === preChar) &&
    (rule.preFont === undefined || rule.preFont === preFont)
  );

  return matched?.result ?? 0;
}

export function transformLegacyRuns(runs, mappings, options = {}) {
  const resolvedOptions = {
    skipEnglishWords: true,
    lineFeed: true,
    newlineMode: "paragraph",
    swapText: true,
    ...options,
  };

  let preFont = "";
  let preChar = 0;
  let urduNum = "";
  let needSpace = false;
  let firstBoldCaptured = false;
  let firstBoldLigature = "";
  let output = "";

  for (let runIndex = 0; runIndex < runs.length; runIndex += 1) {
    const run = runs[runIndex];
    if (!run.text?.trim()) {
      continue;
    }

    const font = extractNooriFont(run);
    if (resolvedOptions.skipEnglishWords && !font.includes("NOORI")) {
      continue;
    }
    if (run.text.includes("ASW")) {
      continue;
    }

    if (run.lineBreak && resolvedOptions.lineFeed) {
      output += "۩";
    }

    for (const char of [...run.text]) {
      let chCode = char.codePointAt(0);
      chCode = getCharDefault(chCode, font);
      const skipResult = applySkipRule(chCode, font, preChar, preFont, runs, runIndex, mappings.ligatureMap);
      if (skipResult === 1) {
        continue;
      }
      if (skipResult > 1) {
        chCode = skipResult;
      }

      preFont = font;
      preChar = chCode;

      const ligatureRow = mappings.ligatureMap.get(`${font}:${chCode}`);
      const ligature = ligatureRow?.ligature ?? "EMPTY";

      if (chCode >= 48 && chCode <= 57 && font === "NOORIN01") {
        urduNum += urduNumber(ligature);
        continue;
      }

      if (urduNum.length > 0) {
        output += [...urduNum].reverse().join("") + " ";
        urduNum = "";
      }

      if (ligatureRow?.skipSpace === "Y") {
        needSpace = false;
      } else if (ligature.length > 0 && ligature !== "EMPTY" && END_CHARS.has(ligature.at(-1))) {
        needSpace = true;
      }

      if (!ligatureRow && ENGLISH_CHARS.has(char)) {
        output += char;
      } else if (ligatureRow) {
        if (ligatureRow.ligature.trim()) {
          output += ligatureRow.ligature;
        }
      } else if (char === "۞") {
        firstBoldCaptured = true;
        output += "۞٭";
      }

      if (!firstBoldCaptured) {
        firstBoldLigature = ligature !== "EMPTY" ? ligature : firstBoldLigature;
      }

      if (needSpace) {
        output += " ";
      }
      needSpace = false;
    }
  }

  return applyBreakMode(cleanString(output, resolvedOptions, firstBoldLigature), resolvedOptions, runs);
}
