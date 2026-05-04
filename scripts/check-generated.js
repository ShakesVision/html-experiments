const fs = require("fs");
const crypto = require("crypto");

const generatedFiles = [
  "README.md",
  "assets/css/tailwind.css",
  "assets/data/pwa-assets.json",
  "assets/data/tools-manifest.json",
  "manifest.webmanifest",
  "robots.txt",
  "sitemap.xml",
];

function hashFile(file) {
  if (!fs.existsSync(file)) {
    return "missing";
  }
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

const before = new Map(generatedFiles.map((file) => [file, hashFile(file)]));

require("./generate-tools-manifest");
require("./generate-site-assets");
require("../update_readme");

const stale = generatedFiles.filter((file) => before.get(file) !== hashFile(file));
if (stale.length) {
  console.error("Generated files are stale. Run `npm run build` and commit:");
  stale.forEach((file) => console.error(`- ${file}`));
  process.exit(1);
}

console.log("Generated files are fresh.");
