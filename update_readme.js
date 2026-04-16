const fs = require("fs");
const path = require("path");
const { scanProjectFiles } = require("./scripts/lib/project-scan");

const BASE_URL = process.env.BASE_URL || "https://shakesvision.github.io/html-experiments/";
const OUTPUT_MARKDOWN = path.join(__dirname, "README.md");
const PROJECTS_HEADING = "### Projects";

function generateProjectLinks() {
  const entries = scanProjectFiles({ root: __dirname });
  const toolEntries = entries.filter(
    (item) =>
      item.isIndex &&
      !item.isRoot &&
      item.path.split("/").length === 2,
  );

  return toolEntries.map((item) => {
    const folder = item.folder;
    return `- [${folder}](${BASE_URL}${folder}/index.html)`;
  });
}

function updateMarkdownFile() {
  if (!fs.existsSync(OUTPUT_MARKDOWN)) {
    throw new Error(`README not found at ${OUTPUT_MARKDOWN}`);
  }

  const existingContent = fs.readFileSync(OUTPUT_MARKDOWN, "utf8");
  const headingIndex = existingContent.indexOf(PROJECTS_HEADING);

  if (headingIndex === -1) {
    throw new Error(`Could not find "${PROJECTS_HEADING}" heading in README.md`);
  }

  const beforeProjects = existingContent.slice(0, headingIndex).trimEnd();
  const links = generateProjectLinks();
  const refreshedSection = [
    PROJECTS_HEADING,
    "",
    `[Home page](${BASE_URL}index.html)`,
    ...links,
  ].join("\n");

  const output = `${beforeProjects}\n\n${refreshedSection}\n`;
  fs.writeFileSync(OUTPUT_MARKDOWN, output, "utf8");
  console.log(`README updated with ${links.length} project links.`);
}

updateMarkdownFile();
