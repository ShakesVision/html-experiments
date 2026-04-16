const fs = require("fs");
const path = require("path");
const { scanProjectFiles } = require("./lib/project-scan");

const SHARED_SCRIPT_PATH = path.join("assets", "js", "shared-init.js");
const SHARED_SENTINEL = "shared-init.js";

function toPosixPath(value) {
  return value.split(path.sep).join("/");
}

function addSharedScriptTag(filePath) {
  const absolutePath = path.join(process.cwd(), filePath);
  let content = fs.readFileSync(absolutePath, "utf8");

  if (content.includes(SHARED_SENTINEL)) {
    return false;
  }

  const headClose = /<\/head>/i;
  if (!headClose.test(content)) {
    console.warn(`Skipped (no </head>): ${filePath}`);
    return false;
  }

  const fromDir = path.dirname(filePath);
  const relativeScriptPath = toPosixPath(path.relative(fromDir, SHARED_SCRIPT_PATH));
  const normalizedSrc = relativeScriptPath.startsWith(".")
    ? relativeScriptPath
    : `./${relativeScriptPath}`;
  const scriptTag = `    <script defer src="${normalizedSrc}"></script>\n`;

  content = content.replace(headClose, `${scriptTag}</head>`);
  fs.writeFileSync(absolutePath, content, "utf8");
  return true;
}

function main() {
  const files = scanProjectFiles();
  let updated = 0;

  for (const file of files) {
    if (addSharedScriptTag(file.path)) {
      updated += 1;
    }
  }

  console.log(`Shared init tag added to ${updated} HTML files.`);
}

main();
