import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(
  new URL("./src/index.js", import.meta.url),
  "utf8",
);
const helpersBlock = source.match(
  /function getNumericValue\([\s\S]*?function normalizePageKeyTiles\([\s\S]*?\n\}/,
)?.[0];

if (!helpersBlock) {
  throw new Error(
    "Could not locate page-key compatibility helper block in source file.",
  );
}

const helpers = new Function(
  "console",
  `${helpersBlock}\nreturn { normalizePageKeyTiles, getTilePosition, getNumericValue };`,
)(console);

const legacy = {
  PageWidth: 500,
  PageHeight: 900,
  X: 5,
  Y: 3,
  Sub: [
    { X1: 2, X2: 1, Y1: 0, Y2: 0 },
    { X1: 0, X2: 0, Y1: 0, Y2: 1 },
  ],
};

const modern = {
  PageWidth: 624,
  PageHeight: 1080,
  X: 13,
  Y: 22,
  Sub: [
    { index: 10, X1: 1, X2: 0, Y1: 2, Y2: 0 },
    { index: 0, X1: 3, X2: 0, Y1: 10, Y2: 0 },
    { index: 5, X1: 9, X2: 0, Y1: 20, Y2: 1 },
  ],
};

assert.equal(helpers.normalizePageKeyTiles(legacy).length, 2);
assert.deepEqual(
  helpers.normalizePageKeyTiles(modern).map((tile) => tile.index),
  [0, 5, 10],
);
assert.equal(helpers.getNumericValue("7", 0), 7);
assert.deepEqual(helpers.getTilePosition({ X2: 0, Y2: 0, index: 10 }), {
  index: 10,
  X1: 0,
  X2: 0,
  Y1: 0,
  Y2: 0,
});

console.log("page-key compat checks passed");
