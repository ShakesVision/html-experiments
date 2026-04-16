const fs = require("fs");
const path = require("path");

const DEFAULT_EXCLUDES = new Set([
  ".git",
  "node_modules",
  ".vscode",
]);

function toPosixPath(inputPath) {
  return inputPath.split(path.sep).join("/");
}

function readHtmlTitle(filePath) {
  try {
    const content = fs.readFileSync(filePath, "utf8");
    const match = content.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    return match ? match[1].replace(/\s+/g, " ").trim() : "";
  } catch {
    return "";
  }
}

function walkFiles(rootDir, entries, excludes) {
  const children = fs.readdirSync(rootDir, { withFileTypes: true });
  for (const child of children) {
    if (excludes.has(child.name)) {
      continue;
    }

    const absolutePath = path.join(rootDir, child.name);
    if (child.isDirectory()) {
      walkFiles(absolutePath, entries, excludes);
      continue;
    }

    if (!child.isFile() || path.extname(child.name).toLowerCase() !== ".html") {
      continue;
    }

    const relativePath = toPosixPath(path.relative(process.cwd(), absolutePath));
    const parts = relativePath.split("/");
    const folder = parts.length > 1 ? parts[0] : ".";
    const isIndex = path.basename(relativePath).toLowerCase() === "index.html";
    const isRoot = relativePath === "index.html";

    entries.push({
      path: relativePath,
      folder,
      isIndex,
      title: readHtmlTitle(absolutePath),
      isRoot,
    });
  }
}

function scanProjectFiles(options = {}) {
  const root = options.root || process.cwd();
  const excludes = new Set([
    ...DEFAULT_EXCLUDES,
    ...(options.excludes || []),
  ]);

  const previousCwd = process.cwd();
  if (root !== previousCwd) {
    process.chdir(root);
  }

  try {
    const entries = [];
    walkFiles(root, entries, excludes);
    entries.sort((a, b) => a.path.localeCompare(b.path));
    return entries;
  } finally {
    if (root !== previousCwd) {
      process.chdir(previousCwd);
    }
  }
}

module.exports = {
  scanProjectFiles,
};
