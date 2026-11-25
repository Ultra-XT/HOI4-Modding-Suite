// ⛔ #a-link-shape-no-map-ships (B4-6) — a row of map/adjacencies.csv the MOD wrote in a shape no shipping map has is said.
//
// 🔗 Add wrote `sea` between two land provinces through a land one, `sea` between two seas through a sea one, and `impassable` with a
// sea end, each answered 200 and written, and validate stayed silent. Across the 8 installed maps that draw their own definition.csv
// each shape ships 0 times (MD's `sea` between two seas with no through, 19 rows, and `sea` between two land provinces through a lake,
// 11, do ship, so the predicate is exactly the three). A warning naming the 🔗 step, never an Auto-fix (the rows are the modder's), and a
// row the layer below has as it stands is the layer below's.
//
// Fixture: a 12×4 provinces.bmp, two columns a province: 1 2 3 4 5 6 in a row; 1-3 land, 4-6 sea (6 touches 1 across the wrap seam).
// Run: node test-a-link-shape-no-map-ships-is-said.js
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (detail == null ? "" : "   " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 400)));
  if (!ok) fails.push(label);
};
const SANDBOX = fs.mkdtempSync(path.join(os.tmpdir(), "nova-adjshape-home-"));
process.env.APPDATA = SANDBOX; process.env.XDG_CONFIG_HOME = SANDBOX; process.env.NOVA_APP_DATA_DIR = SANDBOX; process.env.NOVA_HOME_DIR = SANDBOX;
const md = require("./map-data.js");
const labels = require("./public/map-rule-labels.js");
const tmps = [SANDBOX];

function bmp24(width, height, pixelFn) {
  const rowSize = (width * 3 + 3) & ~3, imageSize = rowSize * height;
  const buf = Buffer.alloc(54 + imageSize);
  buf.write("BM", 0, "ascii");
  buf.writeUInt32LE(54 + imageSize, 2); buf.writeUInt32LE(54, 10); buf.writeUInt32LE(40, 14);
  buf.writeInt32LE(width, 18); buf.writeInt32LE(height, 22); buf.writeUInt16LE(1, 26);
  buf.writeUInt16LE(24, 28); buf.writeUInt32LE(0, 30); buf.writeUInt32LE(imageSize, 34);
  for (let y = 0; y < height; y++) { let off = 54 + (height - 1 - y) * rowSize; for (let x = 0; x < width; x++) { const [r, g, b] = pixelFn(x, y); buf[off++] = b; buf[off++] = g; buf[off++] = r; } }
  return buf;
}
const COL = { 1: [10, 0, 0], 2: [20, 0, 0], 3: [30, 0, 0], 4: [40, 0, 0], 5: [50, 0, 0], 6: [60, 0, 0] };
const TYPE = { 1: "land", 2: "land", 3: "land", 4: "sea", 5: "sea", 6: "sea" };
const DEF = "0;0;0;0;land;false;unknown;0;\n" + [1, 2, 3, 4, 5, 6].map((i) => `${i};${COL[i].join(";")};${TYPE[i]};false;${TYPE[i] === "sea" ? "ocean;0" : "plains;1"};`).join("\n") + "\n";
const HDR = "From;To;Type;Through;start_x;start_y;stop_x;stop_y;adjacency_rule_name;Comment";
const BMP = bmp24(12, 4, (x) => COL[1 + Math.floor(x / 2)]);
const A = "1;3;sea;2;-1;-1;-1;-1;;dried";        // sea between two land provinces through land
const B = "4;6;sea;5;-1;-1;-1;-1;;drowned";      // sea between two seas through sea
const C = "3;4;impassable;-1;-1;-1;-1;-1;;wall"; // impassable with a sea end
const FINE = ["1;3;sea;4;-1;-1;-1;-1;;a strait", "4;6;;-1;-1;-1;-1;-1;;plain", "1;2;impassable;-1;-1;-1;-1;-1;;a wall on land"];
const csv = (rows) => [HDR].concat(rows, ["-1;-1;;-1;-1;-1;-1;-1;;", ""]).join("\n");
const mkRoot = (label, files) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `nova-adjshape-${label}-`)); tmps.push(root);
  for (const [rel, body] of Object.entries(files)) { const p = path.join(root, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, body); }
  return root;
};
const shapeRule = (opts) => md.validateMapFiles(opts).find((p) => p.rule === "adjacency_shape_no_map_ships") || null;
const pairs = (p) => (p && p.items ? p.items.map((i) => `${i.from}-${i.to}:${i.shape}`) : []);

try {
  console.log("1. The predicate is the three shapes no shipping map has, and nothing the maps ship");
  {
    const t = (p) => TYPE[p];
    rec("sea land/land through land: a dried strait", (md.adjacencyShapeNoMapShips({ type: "sea", from: 1, to: 3, through: 2 }, t) || {}).shape === "dried-strait");
    rec("sea sea/sea through sea: a drowned strait", (md.adjacencyShapeNoMapShips({ type: "sea", from: 4, to: 6, through: 5 }, t) || {}).shape === "drowned-strait");
    rec("impassable with a sea end: a wall in the sea", (md.adjacencyShapeNoMapShips({ type: "impassable", from: 3, to: 4, through: -1 }, t) || {}).shape === "wall-in-the-sea");
    rec("CONTROL: a strait (sea land/land through sea) is not", md.adjacencyShapeNoMapShips({ type: "sea", from: 1, to: 3, through: 4 }, t) === null);
    rec("CONTROL: sea between two seas with NO through (MD ships 19) is not", md.adjacencyShapeNoMapShips({ type: "sea", from: 4, to: 6, through: -1 }, t) === null);
    rec("CONTROL: sea land/land through a lake (MD ships 11) is not", md.adjacencyShapeNoMapShips({ type: "sea", from: 1, to: 3, through: 9 }, (p) => (p === 9 ? "lake" : TYPE[p])) === null);
    rec("CONTROL: a plain link and an impassable border on land are not", md.adjacencyShapeNoMapShips({ type: "", from: 4, to: 6, through: -1 }, t) === null && md.adjacencyShapeNoMapShips({ type: "impassable", from: 1, to: 2, through: -1 }, t) === null);
  }

  console.log("\n2. ⭐⭐⭐ A map the mod owns: each such row it wrote is said, as a warning naming the 🔗 step");
  {
    const tc = mkRoot("tc", { "descriptor.mod": 'name="TC"\nreplace_path="map"\n', "map/provinces.bmp": BMP, "map/definition.csv": DEF, "map/adjacencies.csv": csv([A, B, C].concat(FINE)) });
    const p = shapeRule({ modRoot: tc, gameRoot: path.join(SANDBOX, "no-game"), dependencyRoots: [] });
    rec("the three rows, and only them", JSON.stringify(pairs(p)) === JSON.stringify(["1-3:dried-strait", "4-6:drowned-strait", "3-4:wall-in-the-sea"]), p && p.items);
    rec("⭐⭐ a warning, not fatal, with a label of its own", !!p && p.severity === "warning" && !labels.isFatalRule(p.rule) && labels.mapRuleLabel(p.rule) !== "Adjacency shape no map ships", p && { severity: p.severity, label: labels.mapRuleLabel(p.rule) });
    rec("⭐⭐ the message names the 🔗 step, and no Auto-fix (so the popup offers none)", !!p && /🔗 Adjacency/.test(p.message) && /Remove existing/.test(p.message) && !/Auto-fix/.test(p.message) && labels.autoFixOffered([p]) === false, p && p.message);
  }

  console.log("\n3. ⭐⭐⭐ An add-on: a row the layer below has as it stands is the layer below's");
  {
    const game = mkRoot("game", { "map/provinces.bmp": BMP, "map/definition.csv": DEF, "map/adjacencies.csv": csv([A].concat(FINE)) });
    const addon = mkRoot("addon", { "descriptor.mod": 'name="Addon"\n', "map/adjacencies.csv": csv([A, B, C].concat(FINE)) });
    const p = shapeRule({ modRoot: addon, gameRoot: game, dependencyRoots: [] });
    rec("the add-on is told of the two rows it wrote, not of the base's", JSON.stringify(pairs(p)) === JSON.stringify(["4-6:drowned-strait", "3-4:wall-in-the-sea"]), p && p.items);
    const inherits = mkRoot("inherits", { "descriptor.mod": 'name="Inherits"\n' });
    const game2 = mkRoot("game2", { "map/provinces.bmp": BMP, "map/definition.csv": DEF, "map/adjacencies.csv": csv([A, B, C].concat(FINE)) });
    rec("⭐⭐ an add-on that ships no adjacencies.csv is told nothing", shapeRule({ modRoot: inherits, gameRoot: game2, dependencyRoots: [] }) === null);
  }

  console.log(`\n=== a link shape no map ships is said: ${checks} checks, ${fails.length} failed ===`);
  if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
} catch (e) {
  console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 10).join("\n") : e);
  process.exitCode = 1;
} finally {
  for (const d of tmps) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} }
}
