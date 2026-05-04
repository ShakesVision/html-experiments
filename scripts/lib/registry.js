const fs = require("fs");
const path = require("path");

const SITE_URL = process.env.SITE_URL || "https://tools.shakeeb.in";
const REGISTRY_PATH = path.join(process.cwd(), "projects.json");

const VALID_STATUSES = new Set(["alpha", "beta", "stable"]);
const VALID_OFFLINE_SUPPORT = new Set(["full", "shell-cache", "online-required"]);

function toPosixPath(value) {
  return value.split(path.sep).join("/");
}

function trimSlashes(value) {
  return String(value || "").replace(/^\/+|\/+$/g, "");
}

function slugFromLink(link) {
  if (/^https?:\/\//i.test(link)) {
    try {
      return new URL(link).hostname.replace(/^www\./, "").split(".")[0];
    } catch {
      return trimSlashes(link).replace(/[^a-z0-9]+/gi, "-").toLowerCase();
    }
  }

  const clean = trimSlashes(link);
  if (!clean || clean === "index.html") {
    return "home";
  }

  const parts = clean.split("/");
  if (parts.length > 1 && parts[parts.length - 1].toLowerCase() !== "index.html") {
    return clean.replace(/\.html$/i, "").replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "");
  }
  return parts.length > 1 ? parts[0] : clean.replace(/\.html$/i, "");
}

function titleToSlug(title) {
  return String(title || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeStatus(status) {
  const normalized = String(status || "stable").toLowerCase();
  return VALID_STATUSES.has(normalized) ? normalized : "stable";
}

function inferCategory(item) {
  const text = [item.title, item.desc, item.link].join(" ").toLowerCase();
  if (/urdu|arabic|quran|mushaf|rekhta|inpage|poetry|qaafiyah|bayaz|naseem/.test(text)) {
    return "Urdu & language";
  }
  if (/pdf|image|graphic|logo|mock|quote|svg|post/.test(text)) {
    return "Media & design";
  }
  if (/rss|blog|scrape|json|zip|epub|reader|folder|ocr/.test(text)) {
    return "Readers & data";
  }
  if (/stock|shopping|planner|mnemonic|alphabet/.test(text)) {
    return "Productivity";
  }
  return "Utilities";
}

function inferOfflineSupport(item) {
  if (item.external) {
    return "online-required";
  }

  const text = [item.title, item.desc, item.link].join(" ").toLowerCase();
  if (/scraper|rekhta|rss|blog|quran|stock|tradingview|ocr|whatsapp|mushaf/.test(text)) {
    return "shell-cache";
  }

  return "full";
}

function inferTags(item) {
  const tags = new Set();
  const text = [item.title, item.desc, item.link].join(" ").toLowerCase();

  [
    ["urdu", /urdu|rekhta|inpage|naseem|poetry|qaafiyah|bayaz/],
    ["quran", /quran|mushaf|hifz/],
    ["pdf", /pdf/],
    ["image", /image|graphic|logo|mock|svg|post|quote/],
    ["reader", /reader|rss|epub|folder/],
    ["data", /json|scrape|blog|zip|ocr/],
    ["offline", /offline|local|client/],
    ["finance", /stock|profit|watchlist|retirement/],
  ].forEach(([tag, pattern]) => {
    if (pattern.test(text)) {
      tags.add(tag);
    }
  });

  return Array.from(tags).sort();
}

function normalizeProject(item) {
  const external = item.external === true;
  const slug = item.slug || slugFromLink(item.link) || titleToSlug(item.title);
  const description = item.description || item.desc || "";

  return {
    id: item.id,
    slug,
    title: item.title || slug,
    description,
    desc: description,
    category: item.category || inferCategory(item),
    status: normalizeStatus(item.status),
    tags: Array.isArray(item.tags) ? item.tags : inferTags(item),
    offlineSupport: VALID_OFFLINE_SUPPORT.has(item.offlineSupport)
      ? item.offlineSupport
      : inferOfflineSupport(item),
    external,
    featured: item.featured === true,
    lastReviewed: item.lastReviewed || "2026-05-04",
    img: item.img || "assets/images/project.png",
    link: item.link,
  };
}

function readProjects() {
  const raw = fs.readFileSync(REGISTRY_PATH, "utf8");
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    throw new Error("projects.json must contain an array");
  }
  return parsed.map(normalizeProject);
}

function absoluteSiteUrl(relativePath = "") {
  const cleanBase = SITE_URL.replace(/\/+$/, "");
  const cleanPath = trimSlashes(relativePath);
  return cleanPath ? `${cleanBase}/${cleanPath}` : `${cleanBase}/`;
}

module.exports = {
  REGISTRY_PATH,
  SITE_URL,
  VALID_OFFLINE_SUPPORT,
  VALID_STATUSES,
  absoluteSiteUrl,
  normalizeProject,
  readProjects,
  slugFromLink,
  toPosixPath,
};
