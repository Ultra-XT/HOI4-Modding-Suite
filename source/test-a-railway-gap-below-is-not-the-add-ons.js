// ⛔ #a-railway-gap-below-is-not-the-add-ons / #a-railway-row-below-is-not-the-add-ons (B4-3) — Map Errors judges an add-on for what it
// changed, not for the railway rows it materialised.
//
// On a Millennium Dawn add-on one ▴ relevel copies MD's railways.txt into the mod, and Map Errors then handed the add-on MD's own rows:
// 3 railway_link_not_neighbours (links between provinces that do not touch, which the game drops) and 1 railway_malformed_row (MD's line
// 1278, a count of 7 with six ids). No fixer could clear them, so the add-on could never get back to 0/0. The gaps the map below already
// ships are subtracted by pair, and a malformed row the layer below ships word for word is that layer's. A gap or a malformed row the
// mod made is still said, and a mod that replaces map/ outright has nothing below to subtract.
//
// Fixture: a 12×4 provinces.bmp, two columns a province: 1 2 3 4 5 6 in a row (6 touches 1 across the wrap seam).
// Run: node test-a-railway-gap-below-is-not-the-add-ons.js
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (detail == null ? "" : "   " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 300)));
  if (!ok) fails.push(label);
};
const SANDBOX = fs.mkdtempSync(path.join(os.tmpdir(), "nova-railgap-home-"));
process.env.APPDATA = SANDBOX; process.env.XDG_CONFIG_HOME = SANDBOX; process.env.NOVA_APP_DATA_DIR = SANDBOX; process.env.NOVA_HOME_DIR = SANDBOX;
const md = require("./map-data.js");
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
const mkRoot = (label, files) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `nova-railgap-${label}-`)); tmps.push(root);
  for (const [rel, body] of Object.entries(files)) { const p = path.join(root, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, body); }
  return root;
};
const DEF = "0;0;0;0;land;false;unknown;0;\n" + [1, 2, 3, 4, 5, 6].map((i) => `${i};${COL[i].join(";")};land;false;plains;1;`).join("\n") + "\n";
// the base: 1-2-3 a clean line; 4 → 6 a GAP (4 and 6 do not touch); `2 3 1 2` a malformed row (a count of 3, two ids)
const BASE_RAIL = "1 3 1 2 3\n2 2 4 6\n2 3 1 2\n";
const mapFiles = (rail) => ({
  "map/provinces.bmp": bmp24(12, 4, (x) => COL[1 + Math.floor(x / 2)]),
  "map/definition.csv": DEF,
  "map/railways.txt": rail,
});
const rulesOf = (opts) => {
  const out = {};
  for (const p of md.validateMapFiles(opts)) if (/^railway_/.test(p.rule)) out[p.rule] = p;
  return out;
};
const pairs = (p) => (p && p.items ? p.items.map((i) => `${i.from}-${i.to}`) : []);

try {
  const base = mkRoot("base", mapFiles(BASE_RAIL));

  console.log("1. CONTROL: the map below's own rows ARE what the rules say, judged on that map itself");
  {
    const r = rulesOf({ modRoot: base, gameRoot: base, dependencyRoots: [] });
    rec("the base game edited directly is told its gap 4 → 6", JSON.stringify(pairs(r.railway_link_not_neighbours)) === '["4-6"]', r.railway_link_not_neighbours);
    rec("…and its malformed row", !!r.railway_malformed_row, r);
  }

  console.log("\n2. ⭐⭐⭐ An add-on that materialised railways.txt with one row relevelled is told neither");
  {
    const addon = mkRoot("addon", { "descriptor.mod": 'name="Addon"\n', "map/railways.txt": "2 3 1 2 3\n2 2 4 6\n2 3 1 2\n" });
    const r = rulesOf({ modRoot: addon, gameRoot: base, dependencyRoots: [] });
    rec("no railway_link_not_neighbours for the base's gap", !r.railway_link_not_neighbours, r.railway_link_not_neighbours);
    rec("no railway_malformed_row for the base's malformed row", !r.railway_malformed_row, r.railway_malformed_row);
  }

  console.log("\n3. ⭐⭐ …and a dependency's rows are the dependency's");
  {
    const game = mkRoot("game", { "map/definition.csv": DEF, "map/provinces.bmp": bmp24(12, 4, (x) => COL[1 + Math.floor(x / 2)]), "map/railways.txt": "1 3 1 2 3\n" });
    const dep = mkRoot("dep", Object.assign({ "descriptor.mod": 'name="Dep"\n' }, { "map/railways.txt": BASE_RAIL }));
    const addon = mkRoot("addon-dep", { "descriptor.mod": 'name="AddonDep"\n', "map/railways.txt": "3 3 1 2 3\n2 2 4 6\n2 3 1 2\n" });
    const r = rulesOf({ modRoot: addon, gameRoot: game, dependencyRoots: [dep] });
    rec("no gap and no malformed row the dependency ships", !r.railway_link_not_neighbours && !r.railway_malformed_row, r);
  }

  console.log("\n4. ⭐⭐⭐ What the add-on made itself is still said");
  {
    const addon = mkRoot("addon-own", { "descriptor.mod": 'name="AddonOwn"\n', "map/railways.txt": "1 3 1 2 3\n2 2 4 6\n2 3 1 2\n1 2 1 5\n2 3 2 1\n" });
    const r = rulesOf({ modRoot: addon, gameRoot: base, dependencyRoots: [] });
    rec("its own gap 1 → 5 is said, and the base's 4 → 6 is not", JSON.stringify(pairs(r.railway_link_not_neighbours)) === '["1-5"]', r.railway_link_not_neighbours);
    const items = (r.railway_malformed_row && r.railway_malformed_row.items) || [];
    rec("its own malformed row (line 5) is said, and the base's (line 3) is not", items.length === 1 && items[0].line === 5, items);
  }

  console.log("\n5. ⭐⭐ A mod that replaces map/ outright has nothing below: its rows are all its own");
  {
    const tc = mkRoot("tc", Object.assign({ "descriptor.mod": 'name="TC"\nreplace_path="map"\n' }, mapFiles(BASE_RAIL)));
    const r = rulesOf({ modRoot: tc, gameRoot: base, dependencyRoots: [] });
    rec("the gap 4 → 6 is said", JSON.stringify(pairs(r.railway_link_not_neighbours)) === '["4-6"]', r.railway_link_not_neighbours);
    rec("…and the malformed row", !!r.railway_malformed_row, r);
  }

  console.log(`\n=== a railway gap below is not the add-on's: ${checks} checks, ${fails.length} failed ===`);
  if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
} catch (e) {
  console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 10).join("\n") : e);
  process.exitCode = 1;
} finally {
  for (const d of tmps) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} }
}
