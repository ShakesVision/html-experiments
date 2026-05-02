const fs = require("fs");
const path = require("path");

const ROOT = process.cwd();
const TAILWIND_OUTPUT = path.join("assets", "css", "tailwind.css");
const EXCLUDED_DIRS = new Set([
  ".git",
  ".vscode",
  "assets",
  "node_modules",
  "%TEMP%",
  "rekhta-upstream-temp",
]);

function toPosix(value) {
  return value.split(path.sep).join("/");
}

function walkHtmlFiles(rootDir, entries = []) {
  const children = fs.readdirSync(rootDir, { withFileTypes: true });

  for (const child of children) {
    if (EXCLUDED_DIRS.has(child.name)) {
      continue;
    }

    const absolutePath = path.join(rootDir, child.name);
    if (child.isDirectory()) {
      walkHtmlFiles(absolutePath, entries);
      continue;
    }

    if (child.isFile() && /\.html$/i.test(child.name)) {
      entries.push(absolutePath);
    }
  }

  return entries;
}

function buildStylesheetTag(filePath) {
  const relativePath = path.relative(path.dirname(filePath), path.join(ROOT, TAILWIND_OUTPUT));
  const href = toPosix(relativePath).startsWith(".")
    ? toPosix(relativePath)
    : `./${toPosix(relativePath)}`;

  return `    <link rel="stylesheet" href="${href}" />`;
}

function migrateHtmlFile(filePath) {
  const original = fs.readFileSync(filePath, "utf8");

  if (!/cdn\.tailwindcss\.com|tailwindcss@2|tailwind\.min\.css/.test(original)) {
    return false;
  }

  let updated = original;
  const stylesheetTag = buildStylesheetTag(filePath);

  updated = updated.replace(
    /^\s*<script\s+src="https:\/\/cdn\.tailwindcss\.com"><\/script>\s*$/m,
    stylesheetTag,
  );

  updated = updated.replace(
    /^\s*<link[\s\S]*?href="https:\/\/cdn\.jsdelivr\.net\/npm\/tailwindcss@2\.2\.19\/dist\/tailwind\.min\.css"[\s\S]*?rel="stylesheet"[\s\S]*?\/>\s*$/m,
    stylesheetTag,
  );

  updated = updated.replace(/^\s*tailwind\.config\s*=\s*\{[\s\S]*?\}\s*;?\s*$/m, "");

  if (updated !== original) {
    fs.writeFileSync(filePath, updated, "utf8");
    return true;
  }

  return false;
}

function main() {
  const files = walkHtmlFiles(ROOT);
  let changed = 0;

  for (const filePath of files) {
    if (migrateHtmlFile(filePath)) {
      changed += 1;
    }
  }

  console.log(`Migrated ${changed} HTML files to local Tailwind CSS.`);
}

main();
