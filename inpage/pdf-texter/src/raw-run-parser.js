const LEGACY_LINE_MARKER = String.fromCharCode(0x06e9);

export function extractPageNumberFromName(fileName = "") {
  const match = /page-(\d+)/i.exec(fileName);
  return match ? Number(match[1]) : Number.NaN;
}

export function parseLegacyRawText(rawText, pageNumber = Number.NaN) {
  return rawText
    .split("<=!=>")
    .map((chunk) => {
      const lineBreak = chunk.includes(LEGACY_LINE_MARKER);
      const normalizedChunk = chunk.replaceAll(LEGACY_LINE_MARKER, "").trim();
      const parts = normalizedChunk.split("<=;=>");
      if (parts.length < 3) {
        return null;
      }

      const [x = "", y = "", bottom = "", fontSize = ""] = (parts[1] ?? "").split("|");
      return {
        pageNumber,
        fontName: parts[0].trim(),
        x: Number.parseFloat(x),
        y: Number.parseFloat(y),
        bottom: Number.parseFloat(bottom),
        fontSize: Number.parseFloat(fontSize),
        text: parts.slice(2).join("<=;=>"),
        lineBreak,
      };
    })
    .filter(Boolean);
}

export async function loadLegacyRawFiles(fileList) {
  const files = Array.from(fileList ?? []);
  const results = await Promise.all(
    files.map(async (file, index) => {
      const rawText = await file.text();
      const pageNumber = extractPageNumberFromName(file.name) || index + 1;
      return {
        fileName: file.name,
        pageNumber,
        runs: parseLegacyRawText(rawText, pageNumber),
      };
    })
  );

  return results.sort((left, right) => left.pageNumber - right.pageNumber);
}
