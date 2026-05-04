const fs = require("fs");
const path = require("path");
const { scanProjectFiles } = require("./lib/project-scan");
const { absoluteSiteUrl, readProjects } = require("./lib/registry");

const ROOT = process.cwd();

function writeJson(relativePath, value) {
  fs.writeFileSync(
    path.join(ROOT, relativePath),
    `${JSON.stringify(value, null, 2)}\n`,
    "utf8",
  );
}

function writeText(relativePath, value) {
  fs.writeFileSync(path.join(ROOT, relativePath), value, "utf8");
}

function localProjectShortcuts(projects) {
  return projects
    .filter((project) => !project.external)
    .slice(0, 4)
    .map((project) => ({
      name: project.title,
      short_name: project.title.slice(0, 24),
      description: project.description,
      url: `/${project.link}`,
      icons: [{ src: "/assets/images/icon.png", sizes: "192x192", type: "image/png" }],
    }));
}

function buildWebManifest(projects) {
  return {
    name: "tools.shakeeb.in",
    short_name: "Shakeeb Tools",
    description:
      "A static, installable hub of browser tools for reading, editing, conversion, Urdu workflows, and small utilities.",
    id: "/",
    start_url: "/index.html",
    scope: "/",
    display: "standalone",
    display_override: ["window-controls-overlay", "standalone", "browser"],
    background_color: "#f8fbff",
    theme_color: "#1b4965",
    categories: ["productivity", "utilities", "education"],
    lang: "en",
    dir: "ltr",
    icons: [
      {
        src: "/assets/images/icon.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any maskable",
      },
      {
        src: "/assets/images/icon.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any maskable",
      },
    ],
    shortcuts: localProjectShortcuts(projects),
  };
}

function buildSitemap(projects, pages) {
  const urls = new Set([""]);
  projects
    .filter((project) => !project.external)
    .forEach((project) => urls.add(project.link));
  pages.forEach((page) => urls.add(page.path));

  const items = Array.from(urls)
    .sort()
    .map((urlPath) => {
      const loc = absoluteSiteUrl(urlPath);
      const priority = urlPath === "" ? "1.0" : urlPath.endsWith("/index.html") ? "0.8" : "0.5";
      return [
        "  <url>",
        `    <loc>${loc}</loc>`,
        "    <changefreq>weekly</changefreq>",
        `    <priority>${priority}</priority>`,
        "  </url>",
      ].join("\n");
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${items}\n</urlset>\n`;
}

function buildRobots() {
  return [
    "User-agent: *",
    "Allow: /",
    "",
    `Sitemap: ${absoluteSiteUrl("sitemap.xml")}`,
    "",
  ].join("\n");
}

function buildServiceWorkerManifest(projects, pages) {
  const assets = new Set([
    "/",
    "/index.html",
    "/projects.json",
    "/assets/data/tools-manifest.json",
    "/assets/css/tailwind.css",
    "/assets/js/shared-init.js",
    "/assets/images/icon.png",
    "/assets/images/project.png",
    "/manifest.webmanifest",
    "/offline.html",
  ]);

  projects
    .filter((project) => !project.external)
    .forEach((project) => {
      assets.add(`/${project.link}`);
      if (project.img && !/^https?:\/\//i.test(project.img)) {
        assets.add(`/${project.img}`);
      }
    });

  pages.forEach((page) => {
    assets.add(`/${page.path}`);
  });

  return {
    version: "2026-05-04",
    assets: Array.from(assets).sort(),
  };
}

function main() {
  const projects = readProjects();
  const pages = scanProjectFiles();

  writeJson("manifest.webmanifest", buildWebManifest(projects));
  writeText("sitemap.xml", buildSitemap(projects, pages));
  writeText("robots.txt", buildRobots());
  writeJson("assets/data/pwa-assets.json", buildServiceWorkerManifest(projects, pages));

  console.log("Generated PWA and SEO assets.");
}

main();
