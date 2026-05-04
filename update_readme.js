const fs = require("fs");
const path = require("path");
const { readProjects } = require("./scripts/lib/registry");

const BASE_URL = process.env.BASE_URL || "https://tools.shakeeb.in/";
const OUTPUT_MARKDOWN = path.join(__dirname, "README.md");
const PROJECTS_HEADING = "### Projects";

function generateProjectLinks() {
  const projects = readProjects();

  return projects.map((item) => {
    const label = item.external ? `${item.title} (external)` : item.title;
    const url = item.external ? item.link : `${BASE_URL}${item.link}`;
    return `- [${label}](${url})`;
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
