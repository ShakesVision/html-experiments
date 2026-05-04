const fs = require("fs");
const path = require("path");
const { normalizeProject } = require("./lib/registry");
const { scanProjectFiles } = require("./lib/project-scan");

const filePath = path.join(process.cwd(), "projects.json");
const source = JSON.parse(fs.readFileSync(filePath, "utf8"));
const registeredIndexLinks = new Set(
  source
    .filter((item) => !item.external && typeof item.link === "string" && item.link.endsWith("/index.html"))
    .map((item) => item.link.split("/")[0]),
);

const missingTopLevelTools = scanProjectFiles()
  .filter((item) => item.isIndex && !item.isRoot && item.path.split("/").length === 2)
  .filter((item) => !registeredIndexLinks.has(item.folder))
  .map((item) => ({
    title: item.title || item.folder,
    description: `Standalone browser tool hosted at ${item.path}.`,
    img: "assets/images/project.png",
    link: item.path,
    status: "alpha",
  }));

const projects = [...source, ...missingTopLevelTools].map((item, index) => {
  const normalized = normalizeProject({ ...item, slug: undefined });
  return {
    id: normalized.id || index + 1,
    slug: normalized.slug,
    title: normalized.title,
    description: normalized.description,
    desc: normalized.description,
    category: normalized.category,
    status: normalized.status,
    tags: normalized.tags,
    offlineSupport: normalized.offlineSupport,
    external: normalized.external,
    featured: normalized.featured,
    lastReviewed: normalized.lastReviewed,
    img: normalized.img,
    link: normalized.link,
  };
});

fs.writeFileSync(filePath, `${JSON.stringify(projects, null, 2)}\n`, "utf8");
console.log(`Normalized ${projects.length} project entries.`);
