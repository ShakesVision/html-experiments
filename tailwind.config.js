const fs = require("fs");
const path = require("path");

const EXCLUDED_DIRS = new Set([
  ".git",
  ".vscode",
  "node_modules",
  "%TEMP%",
  "rekhta-upstream-temp",
]);

function walkContentFiles(rootDir, entries = []) {
  const children = fs.readdirSync(rootDir, { withFileTypes: true });

  for (const child of children) {
    if (EXCLUDED_DIRS.has(child.name)) {
      continue;
    }

    const absolutePath = path.join(rootDir, child.name);
    if (child.isDirectory()) {
      walkContentFiles(absolutePath, entries);
      continue;
    }

    if (!child.isFile()) {
      continue;
    }

    if (!/\.(html|js)$/i.test(child.name)) {
      continue;
    }

    entries.push(absolutePath);
  }

  return entries;
}

module.exports = {
  darkMode: "class",
  content: walkContentFiles(process.cwd()),
  theme: {
    extend: {
      colors: {
        primary: "#1b4965",
        secondary: "#62b6cb",
        tertiary: "#bee9e8",
      },
    },
  },
  plugins: [],
};
