const fs = require("fs");
const path = require("path");

const ROOT = process.cwd();
const EXCLUDED = new Set([".git", "node_modules", ".vscode"]);
const PATTERN = /cdn\.tailwindcss\.com|tailwindcss@2|tailwind\.min\.css/i;

function walk(dir, files = []) {
  for (const child of fs.readdirSync(dir, { withFileTypes: true })) {
    if (EXCLUDED.has(child.name)) continue;
    const absolute = path.join(dir, child.name);
    if (child.isDirectory()) {
      walk(absolute, files);
    } else if (/\.html$/i.test(child.name)) {
      files.push(absolute);
    }
  }
  return files;
}

const hits = walk(ROOT).filter((file) => PATTERN.test(fs.readFileSync(file, "utf8")));
if (hits.length) {
  console.error("Tailwind CDN/runtime references are not allowed:");
  hits.forEach((file) => console.error(`- ${path.relative(ROOT, file)}`));
  process.exit(1);
}

console.log("Tailwind CDN check passed.");
