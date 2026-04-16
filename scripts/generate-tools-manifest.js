const fs = require("fs");
const path = require("path");
const { scanProjectFiles } = require("./lib/project-scan");

const OUTPUT_PATH = path.join(process.cwd(), "assets", "data", "tools-manifest.json");

function ensureDirFor(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function buildManifest() {
  const entries = scanProjectFiles();
  return {
    generatedAt: new Date().toISOString(),
    count: entries.length,
    entries,
  };
}

function main() {
  const manifest = buildManifest();
  ensureDirFor(OUTPUT_PATH);
  fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  console.log(`Generated ${manifest.count} entries at ${path.relative(process.cwd(), OUTPUT_PATH)}`);
}

main();
