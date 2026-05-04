const fs = require("fs");
const path = require("path");
const { scanProjectFiles } = require("./lib/project-scan");
const { absoluteSiteUrl } = require("./lib/registry");

const SHARED_SCRIPT_PATH = path.join("assets", "js", "shared-init.js");
const SHARED_SENTINEL = "shared-init.js";
const TAILWIND_PATH = path.join("assets", "css", "tailwind.css");
const MANIFEST_PATH = "manifest.webmanifest";
const THEME_COLOR = "#1b4965";

function toPosixPath(value) {
  return value.split(path.sep).join("/");
}

function relativeAssetPath(fromFile, assetPath) {
  const fromDir = path.dirname(fromFile);
  const relativePath = toPosixPath(path.relative(fromDir, assetPath));
  return relativePath.startsWith(".") ? relativePath : `./${relativePath}`;
}

function upsertBeforeHeadClose(content, tag, sentinel) {
  if (sentinel && content.includes(sentinel)) {
    return content;
  }
  return content.replace(/<\/head>/i, `${tag}\n</head>`);
}

function ensureCharset(content) {
  if (/<meta\s+charset=/i.test(content)) {
    return content;
  }
  return content.replace(/<head[^>]*>/i, (match) => `${match}\n    <meta charset="UTF-8">`);
}

function ensureViewport(content) {
  if (/<meta\s+name=["']viewport["']/i.test(content)) {
    return content;
  }
  return content.replace(
    /<meta\s+charset=[^>]*>/i,
    (match) => `${match}\n    <meta name="viewport" content="width=device-width, initial-scale=1.0">`,
  );
}

function ensureTitle(content, filePath) {
  const fallback = filePath.replace(/\/index\.html$/i, "").replace(/\.html$/i, "") || "tools.shakeeb.in";
  if (/<title[^>]*>\s*<\/title>/i.test(content)) {
    return content.replace(/<title[^>]*>\s*<\/title>/i, `<title>${fallback}</title>`);
  }
  if (/<title[^>]*>[\s\S]*?<\/title>/i.test(content)) {
    return content;
  }
  return content.replace(/<head[^>]*>/i, (match) => `${match}\n    <title>${fallback}</title>`);
}

function ensureSingleMeta(content, name, tag) {
  const pattern = new RegExp(`<meta\\s+name=["']${name}["'][^>]*>`, "i");
  if (pattern.test(content)) {
    return content.replace(pattern, tag);
  }
  return upsertBeforeHeadClose(content, `    ${tag}`, `name="${name}"`);
}

function ensureSingleLink(content, rel, href, tag) {
  const pattern = new RegExp(`<link\\s+[^>]*rel=["']${rel}["'][^>]*>`, "i");
  if (pattern.test(content)) {
    return content.replace(pattern, tag);
  }
  return upsertBeforeHeadClose(content, `    ${tag}`, href);
}

function ensureStylesheet(content, filePath) {
  if (content.includes("assets/css/tailwind.css") || content.includes("../assets/css/tailwind.css") || content.includes("../../assets/css/tailwind.css")) {
    return content;
  }
  const href = relativeAssetPath(filePath, TAILWIND_PATH);
  return upsertBeforeHeadClose(content, `    <link rel="stylesheet" href="${href}" />`, href);
}

function ensureSharedScript(content, filePath) {
  if (content.includes(SHARED_SENTINEL)) {
    return content;
  }
  const src = relativeAssetPath(filePath, SHARED_SCRIPT_PATH);
  return upsertBeforeHeadClose(content, `    <script defer src="${src}"></script>`, SHARED_SENTINEL);
}

function normalizeHead(filePath) {
  const absolutePath = path.join(process.cwd(), filePath);
  let content = fs.readFileSync(absolutePath, "utf8");

  const headClose = /<\/head>/i;
  if (!headClose.test(content)) {
    console.warn(`Skipped (no </head>): ${filePath}`);
    return false;
  }

  const original = content;
  const canonicalPath = filePath === "index.html" ? "" : filePath;
  const manifestHref = relativeAssetPath(filePath, MANIFEST_PATH);

  content = ensureCharset(content);
  content = ensureViewport(content);
  content = ensureTitle(content, filePath);
  content = ensureSingleLink(
    content,
    "canonical",
    absoluteSiteUrl(canonicalPath),
    `<link rel="canonical" href="${absoluteSiteUrl(canonicalPath)}">`,
  );
  content = ensureSingleLink(
    content,
    "manifest",
    manifestHref,
    `<link rel="manifest" href="${manifestHref}">`,
  );
  content = ensureSingleMeta(
    content,
    "theme-color",
    `<meta name="theme-color" content="${THEME_COLOR}">`,
  );
  content = ensureStylesheet(content, filePath);
  content = ensureSharedScript(content, filePath);

  if (content === original) {
    return false;
  }

  fs.writeFileSync(absolutePath, content, "utf8");
  return true;
}

function main() {
  const files = scanProjectFiles();
  let updated = 0;

  for (const file of files) {
    if (normalizeHead(file.path)) {
      updated += 1;
    }
  }

  console.log(`Shared head normalized in ${updated} HTML files.`);
}

main();
