const fs = require("fs");
const path = require("path");

const ROOT = process.cwd();
const EXCLUDED_DIRS = new Set([".git", "node_modules", ".vscode"]);
const URL_PATTERN = /https?:\/\/[^"'\s)<>]+/g;

const APPROVED_REMOTE_HOSTS = new Set([
  "ajax.googleapis.com",
  "api.allorigins.win",
  "api.github.com",
  "api.quran.com",
  "api.qurancdn.com",
  "api.rss2json.com",
  "api.whatsapp.com",
  "archive.org",
  "cdnjs.cloudflare.com",
  "cdn.jsdelivr.net",
  "cdn.quilljs.com",
  "code.jquery.com",
  "db.onlinewebfonts.com",
  "fonts.googleapis.com",
  "fonts.gstatic.com",
  "gist.github.com",
  "github.com",
  "icon.kitchen",
  "lh3.googleusercontent.com",
  "mnemonic.ninja",
  "example.blogspot.com",
  "example.com",
  "ebooksapi.rekhta.org",
  "esm.sh",
  "pagead2.googlesyndication.com",
  "play-lh.googleusercontent.com",
  "purl.org",
  "quran.shakeeb.in",
  "quran.com",
  "qaafiyah.sarbakaf.com",
  "romannurik.github.io",
  "s3.tradingview.com",
  "shakeeb.in",
  "script.google.com",
  "schema.org",
  "stackoverflow.com",
  "subhra74.github.io",
  "tools.shakeeb.in",
  "unpkg.com",
  "utools.shakeeb.in",
  "www.googleapis.com",
  "www.idpf.org",
  "www.rekhta.org",
  "www.w3.org",
  "www.quranwbw.com",
  "www.shakeeb.in",
  "ur.shakeeb.in",
  "web.archive.org",
]);

function walk(dir, files = []) {
  for (const child of fs.readdirSync(dir, { withFileTypes: true })) {
    if (EXCLUDED_DIRS.has(child.name)) {
      continue;
    }
    const absolute = path.join(dir, child.name);
    if (child.isDirectory()) {
      walk(absolute, files);
    } else if (/\.(html|js|css)$/i.test(child.name)) {
      files.push(absolute);
    }
  }
  return files;
}

function main() {
  const violations = [];

  walk(ROOT).forEach((file) => {
    const relative = path.relative(ROOT, file);
    if (relative.startsWith(`scripts${path.sep}`)) {
      return;
    }
    if (relative === path.join("assets", "css", "tailwind.css")) {
      return;
    }
    const content = fs.readFileSync(file, "utf8");
    const matches = content.match(URL_PATTERN) || [];
    matches.forEach((rawUrl) => {
      if (rawUrl.includes("${") || rawUrl.includes("...") || rawUrl.includes("localhost")) {
        return;
      }
      try {
        const host = new URL(rawUrl.replace(/[.,;]+$/, "")).hostname;
        if (!APPROVED_REMOTE_HOSTS.has(host)) {
          violations.push(`${relative}: unapproved remote host ${host}`);
        }
      } catch {
        violations.push(`${relative}: malformed URL ${rawUrl}`);
      }
    });
  });

  if (violations.length) {
    console.error(violations.map((item) => `- ${item}`).join("\n"));
    process.exit(1);
  }

  console.log("Third-party dependency audit passed.");
}

main();
