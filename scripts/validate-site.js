const fs = require("fs");
const path = require("path");
const { scanProjectFiles } = require("./lib/project-scan");
const {
  VALID_OFFLINE_SUPPORT,
  VALID_STATUSES,
  readProjects,
} = require("./lib/registry");

const ROOT = process.cwd();
const REQUIRED_PROJECT_FIELDS = [
  "slug",
  "title",
  "description",
  "category",
  "status",
  "tags",
  "offlineSupport",
  "external",
  "featured",
  "lastReviewed",
];

function exists(relativePath) {
  return fs.existsSync(path.join(ROOT, relativePath));
}

function isRemote(value) {
  return /^https?:\/\//i.test(value || "");
}

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

function collectErrors() {
  const errors = [];
  const projects = readProjects();
  const slugs = new Set();
  const ids = new Set();

  projects.forEach((project, index) => {
    REQUIRED_PROJECT_FIELDS.forEach((field) => {
      if (!(field in project)) {
        errors.push(`projects.json[${index}] is missing required field "${field}".`);
      }
    });

    if (!project.id || ids.has(project.id)) {
      errors.push(`projects.json[${index}] has a missing or duplicate id: ${project.id}`);
    }
    ids.add(project.id);

    if (!project.slug || slugs.has(project.slug)) {
      errors.push(`projects.json[${index}] has a missing or duplicate slug: ${project.slug}`);
    }
    slugs.add(project.slug);

    if (!VALID_STATUSES.has(project.status)) {
      errors.push(`${project.slug} has invalid status "${project.status}".`);
    }

    if (!VALID_OFFLINE_SUPPORT.has(project.offlineSupport)) {
      errors.push(`${project.slug} has invalid offlineSupport "${project.offlineSupport}".`);
    }

    if (!Array.isArray(project.tags)) {
      errors.push(`${project.slug} tags must be an array.`);
    }

    if (!project.external && !exists(project.link)) {
      errors.push(`${project.slug} link does not exist: ${project.link}`);
    }

    if (!isRemote(project.img) && !exists(project.img)) {
      errors.push(`${project.slug} image does not exist: ${project.img}`);
    }
  });

  const indexedToolFolders = new Set(
    scanProjectFiles()
      .filter((item) => item.isIndex && !item.isRoot && item.path.split("/").length === 2)
      .map((item) => item.folder),
  );
  const registeredFolders = new Set(
    projects
      .filter((project) => !project.external && project.link.endsWith("/index.html"))
      .map((project) => project.link.split("/")[0]),
  );

  indexedToolFolders.forEach((folder) => {
    if (!registeredFolders.has(folder)) {
      errors.push(`Top-level tool folder "${folder}" has no projects.json catalog entry.`);
    }
  });

  scanProjectFiles().forEach((entry) => {
    const content = read(entry.path);
    if (!/<head[^>]*>/i.test(content)) {
      return;
    }
    const sharedCount = (content.match(/shared-init\.js/g) || []).length;
    if (!/<title[^>]*>[\s\S]*?<\/title>/i.test(content)) {
      errors.push(`${entry.path} is missing a <title>.`);
    }
    if (!/<meta\s+charset=/i.test(content)) {
      errors.push(`${entry.path} is missing <meta charset>.`);
    }
    if (!/<meta\s+name=["']viewport["']/i.test(content)) {
      errors.push(`${entry.path} is missing viewport metadata.`);
    }
    if (sharedCount !== 1) {
      errors.push(`${entry.path} must include shared-init.js exactly once; found ${sharedCount}.`);
    }
  });

  ["manifest.webmanifest", "sw.js", "sitemap.xml", "robots.txt", "CNAME"].forEach((file) => {
    if (!exists(file)) {
      errors.push(`Missing required deploy asset: ${file}`);
    }
  });

  return errors;
}

function main() {
  const errors = collectErrors();
  if (errors.length) {
    console.error(errors.map((error) => `- ${error}`).join("\n"));
    process.exit(1);
  }
  console.log("Site validation passed.");
}

main();
