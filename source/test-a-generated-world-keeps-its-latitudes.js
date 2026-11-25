// ⛔ #a-generated-world-ignores-the-latitude — NO JUNGLE IN THE ARCTIC, AND NO PALM TREES IN THE NORTHERN FORESTS.
//
// Generate land chose terrain by a height-band table and the coast alone, so latitude played no part. Measured 09-26 on the
// owner's flow (vanilla → Delete map → Generate land 35%, seed 1), land terrain per eighth of the map, north to south:
//     jungle   generated 9.1 · 6.3 · 5.4 · 2.6 · 4.8 · 2.4 · 3.5 · 4.3 %     vanilla 0 · 0 · 0 · 1.0 · 17.1 · 39.6 · 7.7 · 0 %
// and the trees it planted followed the terrain across the WHOLE map below: vanilla's forest grows tree types 6 and 5 in the
// north (bands 0-3: 6 at 45-62%) and 28 and 29 in the tropics (bands 4-6: 28 at 36-44%), so a generated northern forest was
// planted with the tropical kinds too.
//
// Pinned on a two-layer lattice whose layer below has NO jungle in its northern half and grows different trees on its northern
// and southern forest:
//   1. no generated province carries a terrain its latitude has (almost) none of below — jungle stays out of the north;
//   2. the terrain is still there where the layer below has it — jungle in the south;
//   3. a forest is planted with the trees the layer below grows on forest AT THAT LATITUDE.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-latitude-"));
process.env.APPDATA = path.join(ROOT, "appdata"); process.env.NOVA_APP_DATA_DIR = process.env.APPDATA; process.env.XDG_CONFIG_HOME = process.env.APPDATA;
process.env.NOVA_HOME_DIR = path.join(ROOT, "home");
fs.mkdirSync(process.env.NOVA_HOME_DIR, { recursive: true });
const md = require("./map-data.js");

let pass = 0, fail = 0;
const ok = (c, m, x) => {
  if (c) { pass++; console.log("  ok   " + m); }
  else { fail++; console.log("  FAIL " + m + (x !== undefined ? "   -> " + JSON.stringify(x).slice(0, 400) : "")); }
};
const write = (dir, rel, body) => { const p = path.join(dir, ...rel.split("/")); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, body); return p; };
function bmp24(W, H, fn) {
  const rs = Math.floor((24 * W + 31) / 32) * 4, b = Buffer.alloc(54 + rs * H);
  b.write("BM", 0, "ascii"); b.writeUInt32LE(b.length, 2); b.writeUInt32LE(54, 10); b.writeUInt32LE(40, 14);
  b.writeInt32LE(W, 18); b.writeInt32LE(H, 22); b.writeUInt16LE(1, 26); b.writeUInt16LE(24, 28); b.writeUInt32LE(rs * H, 34);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const [r, g, bl] = fn(x, y); const o = 54 + (H - 1 - y) * rs + x * 3; b[o] = bl; b[o + 1] = g; b[o + 2] = r; }
  return b;
}
function bmp8(W, H, fn) {
  const rs = Math.floor((8 * W + 31) / 32) * 4, off = 54 + 1024, b = Buffer.alloc(off + rs * H);
  b.write("BM", 0, "ascii"); b.writeUInt32LE(b.length, 2); b.writeUInt32LE(off, 10); b.writeUInt32LE(40, 14);
  b.writeInt32LE(W, 18); b.writeInt32LE(H, 22); b.writeUInt16LE(1, 26); b.writeUInt16LE(8, 28); b.writeUInt32LE(rs * H, 34); b.writeUInt32LE(256, 46);
  for (let i = 0; i < 256; i++) { b[54 + i * 4] = i; b[54 + i * 4 + 1] = i; b[54 + i * 4 + 2] = i; }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) b[off + (H - 1 - y) * rs + x] = fn(x, y);
  return b;
}
const read8 = (file) => { const b = fs.readFileSync(file), W = b.readInt32LE(18), H = b.readInt32LE(22), off = b.readUInt32LE(10), rs = Math.floor((8 * W + 31) / 32) * 4; return (x, y) => b[off + (H - 1 - y) * rs + x]; };

// ── a lattice of one-pixel provinces, 48 x 32, id = y * 48 + x + 1; trees.bmp at the same size ─────────────────────────────
//   below   the two edge columns sea; north half (y < 16) forest / plains / hills / mountain and NO jungle;
//           south half jungle / forest / plains / jungle. Northern forest grows tree 6, southern forest 28, jungle 29.
//   mod     the same shapes, all sea (what Delete map leaves), with its own bare trees.bmp.
const W = 48, H = 32, NORTH = 16;
const idAt = (x, y) => y * W + x + 1;
const colourOf = (id) => [id & 255, (id >> 8) & 255, 91];
const regionOf = (id) => { const i = id - 1; return Math.floor((i % W) / 12) + 4 * Math.floor(Math.floor(i / W) / 8) + 1; };
const seaBelow = (x) => x === 0 || x === W - 1;
const terrainBelow = (x, y) => (seaBelow(x) ? "ocean" : y < NORTH ? ["forest", "plains", "hills", "mountain"][(x + y) % 4] : ["jungle", "forest", "plains", "jungle"][(x + y) % 4]);
const TREE_NORTH = 6, TREE_SOUTH = 28, TREE_JUNGLE = 29;
// …and the southernmost eighth's forest is thin: 60% bare ground, so bare is its commonest single value, as vanilla's band-6
// jungle is (39%). It still grows trees, and a generated forest there must get them in that mix, not none at all.
const THIN = 28;
const treeBelow = (x, y) => { const t = terrainBelow(x, y); return t === "forest" ? (y < NORTH ? TREE_NORTH : y >= THIN && x % 5 < 3 ? 0 : TREE_SOUTH) : t === "jungle" ? TREE_JUNGLE : 0; };
const TABLE = { plains: 0, forest: 1, hills: 2, desert: 3, mountain: 6, marsh: 9, jungle: 21, ocean: 15 };

const game = path.join(ROOT, "game");
{
  write(game, "hoi4.exe", "");
  write(game, "map/provinces.bmp", bmp24(W, H, (x, y) => colourOf(idAt(x, y))));
  const rows = ["0;0;0;0;land;false;unknown;0"];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const id = idAt(x, y), t = terrainBelow(x, y); rows.push(`${id};${colourOf(id).join(";")};${t === "ocean" ? "sea;false;ocean;0" : `land;false;${t};1`}`); }
  write(game, "map/definition.csv", rows.join("\n") + "\n");
  write(game, "map/trees.bmp", bmp8(W, H, treeBelow));
  write(game, "map/heightmap.bmp", bmp8(W, H, (x) => (seaBelow(x) ? 89 : 106)));
  write(game, "map/terrain.bmp", bmp8(W, H, (x, y) => TABLE[terrainBelow(x, y)]));
  write(game, "common/terrain/00_terrain.txt", "categories = {\n"
    + Object.keys(TABLE).map((c) => `\t${c} = {${c === "ocean" ? " is_water = yes" : ""} color = { 100 120 140 } }`).join("\n")
    + "\n}\nterrain = {\n" + Object.entries(TABLE).map(([c, i]) => `\t${c}_g = { type = ${c} color = { ${i} } texture = 1 }`).join("\n") + "\n}\n");
  write(game, "gfx/entities/trees.gfx", ["objectTypes = {", ...[TREE_NORTH, TREE_SOUTH, TREE_JUNGLE].map((i) => `\tpdxmesh = { name = "mapobject_${i}" file = "gfx/models/t${i}.mesh" }`), "}", ""].join("\n"));
}
function makeMod(tag) {
  const mod = path.join(ROOT, tag);
  write(mod, "descriptor.mod", 'name="latitude"\nreplace_path="history/states"\n');
  write(mod, "map/provinces.bmp", bmp24(W, H, (x, y) => colourOf(idAt(x, y))));
  const rows = ["0;0;0;0;land;false;unknown;0"];
  for (let id = 1; id <= W * H; id++) rows.push(`${id};${colourOf(id).join(";")};sea;false;ocean;0`);
  write(mod, "map/definition.csv", rows.join("\n") + "\n");
  write(mod, "map/heightmap.bmp", bmp8(W, H, () => 89));
  write(mod, "map/terrain.bmp", bmp8(W, H, () => TABLE.ocean));
  write(mod, "map/trees.bmp", bmp8(W, H, () => 0));
  const byRegion = new Map();
  for (let id = 1; id <= W * H; id++) { const r = regionOf(id); if (!byRegion.has(r)) byRegion.set(r, []); byRegion.get(r).push(id); }
  for (const [r, provs] of byRegion) write(mod, `map/strategicregions/r${r}.txt`, `strategic_region={\n\tid=${r}\n\tname="REGION_${r}"\n\tprovinces={ ${provs.join(" ")} }\n\tweather={}\n}\n`);
  fs.mkdirSync(path.join(mod, "history", "states"), { recursive: true });
  return mod;
}
const landRows = (mod) => {
  const out = new Map();
  for (const line of fs.readFileSync(path.join(mod, "map", "definition.csv"), "utf8").split(/\r?\n/)) {
    const c = line.split(";");
    if (c.length >= 7 && /^\d+$/.test(c[0]) && c[0] !== "0" && c[4] === "land") out.set(+c[0], c[6]);
  }
  return out;
};
const rowOf = (id) => Math.floor((id - 1) / W), colOf = (id) => (id - 1) % W;

const mod = makeMod("mod");
const r = md.generateLand({ modRoot: mod, gameRoot: game, dependencyRoots: [], count: 1100, provincesPerState: 8, seed: 7 });
// #generate-land-fills-the-seas-it-cuts-off — the 1,100 asked for, and the seas the grown coast cut off, which became land with it
// #generate-land-leaves-no-sea-cut-off — …less the picks left sea to keep a sea it would have cut off open to the ocean
ok(r && r.changed && r.flippedProvinces === 1100 - ((r.inlandSeas || {}).leftSea || []).length + ((r.inlandSeas || {}).filled || 0), "Generate land raised 1,100 provinces", r && (r.error || r.flippedProvinces));
const rows = landRows(mod);

console.log("\n-- ⭐ 1. no terrain where its latitude below has none --");
{
  const north = [...rows].filter(([id]) => rowOf(id) < NORTH), south = [...rows].filter(([id]) => rowOf(id) >= NORTH);
  const jungleNorth = north.filter(([, t]) => t === "jungle").map(([id]) => id);
  ok(north.length > 300 && south.length > 300, `the fixture: ${north.length} new provinces in the north, ${south.length} in the south`);
  ok(jungleNorth.length === 0, "⭐⭐ not one generated province in the northern half is jungle, where the layer below has none", jungleNorth.slice(0, 12));
  // #a-generated-terrain-follows-the-latitude-below — the latitude below chooses WITH the height now, under the pass's own floor, so
  // the pass after it — the guard — finds nothing here to move
  ok(r.latitude && r.latitude.lifted === true && r.latitude.moved === 0, "…and the report says the latitude below chose the terrain, so the pass after it had nothing to move", r.latitude);
}

console.log("\n-- 2. …and the terrain is still there where the layer below has it --");
{
  const jungleSouth = [...rows].filter(([id, t]) => rowOf(id) >= NORTH && t === "jungle").length;
  ok(jungleSouth > 5, "jungle is still generated in the south", jungleSouth);
  const kinds = new Set(rows.values());
  ok(kinds.size >= 5, "…and the world is still more than a couple of terrains", [...kinds]);
}

console.log("\n-- ⭐ 3. a forest is planted with the trees its latitude grows below --");
{
  const at = read8(path.join(mod, "map", "trees.bmp"));
  const northForest = [], southForest = [];
  for (const [id, t] of rows) if (t === "forest") (rowOf(id) < NORTH ? northForest : southForest).push(at(colOf(id), rowOf(id)));
  const tally = (list) => { const m = {}; for (const i of list) m[i] = (m[i] || 0) + 1; return m; };
  ok(northForest.length > 20 && southForest.length > 20, `the fixture: ${northForest.length} northern and ${southForest.length} southern forest provinces`);
  ok(northForest.filter((i) => i === TREE_SOUTH || i === TREE_JUNGLE).length === 0 && northForest.includes(TREE_NORTH),
    "⭐⭐ a northern forest is planted with the northern tree, never the tropical one", tally(northForest));
  ok(southForest.filter((i) => i === TREE_NORTH).length === 0 && southForest.includes(TREE_SOUTH),
    "⭐ …and a southern forest with the southern one", tally(southForest));
  const thin = [];
  for (const [id, t] of rows) if (t === "forest" && rowOf(id) >= THIN) thin.push(at(colOf(id), rowOf(id)));
  const planted = thin.filter((i) => i === TREE_SOUTH).length;
  ok(thin.length >= 10 && planted > 0 && planted < thin.length, "⭐ a forest where the layer below's is mostly bare still gets trees, in that thin mix", { forestProvinces: thin.length, ...tally(thin) });
}

try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) { /* scratch only */ }
console.log("\n" + (fail ? "FAILED " + fail + "/" + (pass + fail) : "PASSED " + pass + "/" + pass));
process.exitCode = fail ? 1 : 0;
