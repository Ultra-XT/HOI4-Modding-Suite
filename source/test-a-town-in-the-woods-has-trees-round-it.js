// ⛔ #a-town-in-the-woods-has-trees-round-it — A TOWN RINGED IN FOREST GROWS THE FOREST'S TREES ROUND ITS CORE, AND NONE ON IT.
//
// #a-city-stands-in-its-own-ground paints the ground round a generated town's core in the ground round the province — forest, for
// a town in the woods. The planter keys a trees.bmp block by the province's DEFINITION terrain, and that says urban, whose
// commonest index below is bare — so the ring came up as forest ground with not one tree on it, the look
// #a-generated-forest-has-no-trees-in-it fixed for forest provinces. Measured 09-29 on TEST 31: 18 of its 90 towns are ringed in
// forest, 17,468 px, and their 1,121 blocks inside the town are 100% bare against 16.3% bare on the world's other forest ground.
//
// A town's block that carries no city ground is planted by the category of what it is painted with; a block with any city ground
// in it stays the town's, and bare. Two writes raise land and plant it, and each paints terrain.bmp FIRST and plants off that
// paint: a raise through sinkProvincesInHeightmap (the path Generate land takes) and a paint-brush stroke through
// applyProvinceDiff, which calls the painter and the planter itself and never goes near sinkProvincesInHeightmap. Pinned on both,
// over a layer below whose forest grows tree 6 on three blocks in four:
//   1. a raise of a strip of forest with one town in it: the town's ring is forest (the painter's answer, the fixture's control);
//   2. the ring's blocks carry the forest's trees, and only a tree the loaded trees.gfx declares; no block with city ground in it
//      carries a tree;
//   3. a brush stroke that carries a town out over the sea: the same, planted off the paint that same stroke has just laid —
//      not off the sea it was, which is what a planter run before the painter reads.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-town-trees-"));
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

// ── the world: 8 x 4 provinces, id = row * 8 + col + 1; trees.bmp is half the size, so one block is 2 x 2 pixels ───────────────
//   layer below   rows 0-2 forest land, row 3 sea; one town (col 2, row 1) with a 40 px core of city ground, ringed in forest,
//                 exactly as a shipping map paints one. Its forest grows tree 6 on three blocks in four; its town and sea nothing.
//   the mod       the same, with row 3 raised: forest, and one town in the middle of it (col 2, row 3).
//   §3's brush    its own layer below, the same with a second town on the coast (col 2, row 2), and a mod with no map of its own.
const COLW = [20, 12, 20, 12, 20, 12, 20, 12], ROWH = [14, 14, 14, 22], COLS = 8, ROWS = 4;
const COLX = COLW.map((_, i) => COLW.slice(0, i).reduce((a, b) => a + b, 0)), ROWY = ROWH.map((_, i) => ROWH.slice(0, i).reduce((a, b) => a + b, 0));
const W = COLW.reduce((a, b) => a + b, 0), H = ROWH.reduce((a, b) => a + b, 0), TW = W / 2, TH = H / 2;
const SPAWN = 19, FOREST = 1, OCEAN = 15, TREE = 6, BARE = 0, CORE_BELOW = 40;
const idAt = (c, r) => r * COLS + c + 1;
const cellOfId = (id) => [(id - 1) % COLS, Math.floor((id - 1) / COLS)];
const colOf = (x) => COLX.findIndex((x0, i) => x >= x0 && x < x0 + COLW[i]), rowOf = (y) => ROWY.findIndex((y0, i) => y >= y0 && y < y0 + ROWH[i]);
const provAt = (x, y) => idAt(colOf(x), rowOf(y));
const colour = (id) => [(id * 29) % 256, (id * 67) % 256, 30 + id];
const TOWN_BELOW = idAt(2, 1), TOWN = idAt(2, 3), TOWN_BY_SEA = idAt(2, 2);
const RAISED = Array.from({ length: COLS }, (_, c) => idAt(c, 3));
const inBelowCore = (x, y) => { const lx = x - COLX[colOf(x)], ly = y - ROWY[rowOf(y)]; return lx >= 2 && lx < 10 && ly >= 4 && ly < 9; };   // 8 x 5 = 40 px
const rowFor = (id, land, towns) => `${id};${colour(id).join(";")};${!land ? "sea;false;ocean;0" : `land;false;${towns.has(id) ? "urban" : "forest"};1`}`;

/** A layer below: rows 0-2 forest land, row 3 sea; each of `towns` a 40 px core of city ground, ringed in forest. */
function makeGame(dir, towns) {
  write(dir, "hoi4.exe", "");
  write(dir, "map/provinces.bmp", bmp24(W, H, (x, y) => colour(provAt(x, y))));
  const rows = ["0;0;0;0;land;false;unknown;0"];
  for (let id = 1; id <= COLS * ROWS; id++) rows.push(rowFor(id, cellOfId(id)[1] < 3, towns));
  write(dir, "map/definition.csv", rows.join("\n") + "\n");
  write(dir, "map/terrain.bmp", bmp8(W, H, (x, y) => { const p = provAt(x, y); return cellOfId(p)[1] === 3 ? OCEAN : towns.has(p) && inBelowCore(x, y) ? SPAWN : FOREST; }));
  write(dir, "map/heightmap.bmp", bmp8(W, H, (x, y) => (rowOf(y) < 3 ? 106 : 89)));
  write(dir, "map/trees.bmp", bmp8(TW, TH, (bx, by) => { const p = provAt(2 * bx, 2 * by); return cellOfId(p)[1] < 3 && !towns.has(p) && (bx * 7 + by * 5) % 4 !== 0 ? TREE : BARE; }));
  write(dir, "gfx/entities/trees.gfx", `objectTypes = {\n\tpdxmesh = { name = "mapobject_${TREE}" file = "gfx/models/t.mesh" }\n}\n`);
  write(dir, "common/terrain/00_terrain.txt", [
    "categories = {", "  forest = { color = { 0 120 0 } }", "  urban = { color = { 120 110 100 } }", "  ocean = { color = { 0 0 200 } is_water = yes }", "}",
    "terrain = {", "  forest = { type = forest color = { 1 } }", "  terrain_city = { type = urban color = { 19 } texture = 10 spawn_city = yes }",
    "  ocean = { type = ocean color = { 15 } }", "}", ""].join("\n"));
  return dir;
}
const game = makeGame(path.join(ROOT, "game"), new Set([TOWN_BELOW]));
const mod = path.join(ROOT, "mod");
{
  write(mod, "descriptor.mod", 'name="town in the woods"\n');
  write(mod, "map/provinces.bmp", bmp24(W, H, (x, y) => colour(provAt(x, y))));
  const rows = ["0;0;0;0;land;false;unknown;0"];
  for (let id = 1; id <= COLS * ROWS; id++) rows.push(rowFor(id, true, new Set([TOWN_BELOW, TOWN])));
  write(mod, "map/definition.csv", rows.join("\n") + "\n");
  write(mod, "map/heightmap.bmp", bmp8(W, H, (x, y) => (rowOf(y) < 3 ? 106 : 89)));
}

const up = md.sinkProvincesInHeightmap({ modRoot: mod, gameRoot: game, dependencyRoots: [], provinceIds: RAISED, raise: true });
ok(up && up.changed && up.trees && up.trees.changed && fs.existsSync(path.join(mod, "map", "trees.bmp")) && fs.existsSync(path.join(mod, "map", "terrain.bmp")),
  "the raise painted terrain.bmp and planted trees.bmp", up && (up.error || up.reason || { terrain: up.terrain && (up.terrain.reason || up.terrain.pixels), trees: up.trees }));

const paint = read8(path.join(mod, "map", "terrain.bmp"));
const trees = fs.existsSync(path.join(mod, "map", "trees.bmp")) ? read8(path.join(mod, "map", "trees.bmp")) : () => -1;
const [tc, tr] = cellOfId(TOWN);
const inTown = (x, y) => x >= COLX[tc] && x < COLX[tc] + COLW[tc] && y >= ROWY[tr] && y < ROWY[tr] + ROWH[tr];

console.log("\n-- 1. the fixture: the town stands in forest --");
{
  const got = {};
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (inTown(x, y)) got[paint(x, y)] = (got[paint(x, y)] || 0) + 1;
  ok(got[SPAWN] === CORE_BELOW && got[FOREST] === COLW[tc] * ROWH[tr] - CORE_BELOW, "CONTROL: the painter gave the town a 40 px core and ringed the rest in the forest round it", got);
  // the raised forest itself was planted, so the planter had the sample, the declaration and the palette it needs here
  let blocks = 0, grown = 0;
  for (let by = 0; by < TH; by++) for (let bx = 0; bx < TW; bx++) {
    const p = provAt(2 * bx, 2 * by);
    if (!RAISED.includes(p) || p === TOWN) continue;
    blocks++; if (trees(bx, by) === TREE) grown++;
  }
  ok(blocks > 0 && grown > blocks / 2, "CONTROL: the raised forest round the town came up with trees", { blocks, grown });
}

console.log("\n-- ⭐ 2. the town's ring grows the forest's trees; its core grows none --");
{
  let ring = 0, ringGrown = 0, core = 0, coreGrown = 0;
  const kinds = new Set();
  for (let by = 0; by < TH; by++) for (let bx = 0; bx < TW; bx++) {
    const px = [[2 * bx, 2 * by], [2 * bx + 1, 2 * by], [2 * bx, 2 * by + 1], [2 * bx + 1, 2 * by + 1]];
    if (!px.every(([x, y]) => inTown(x, y))) continue;
    const t = trees(bx, by);
    if (px.some(([x, y]) => paint(x, y) === SPAWN)) { core++; if (t !== BARE) coreGrown++; }
    else { ring++; if (t !== BARE) { ringGrown++; kinds.add(t); } }
  }
  ok(ring > 50 && core > 5, `(the fixture: ${ring} blocks of the town are all ring, ${core} hold some of its core)`, { ring, core });
  ok(ringGrown > ring / 2, "⭐⭐ the ring's blocks carry trees — forest ground with no tree on it is what the fix is for", { ring, ringGrown });
  ok(kinds.size === 1 && kinds.has(TREE), "⭐ …and only the tree the loaded trees.gfx declares", [...kinds]);
  ok(core > 0 && coreGrown === 0, "⭐⭐ no block with city ground in it carries a tree — the town stays the town", { core, coreGrown });
}

console.log("\n-- ⭐ 3. the paint brush: a stroke that carries a town out over the sea grows the same trees round the same core --");
{
  // A second layer below, whose town (col 2, row 2) stands on the coast, and a mod with nothing of its own: the stroke takes the
  // top 20 rows of the sea province under the town in the town's colour. applyProvinceDiff raises those pixels, paints them and
  // plants them itself — the planter must read the paint this stroke has just laid, where the layer below still says ocean.
  const game2 = makeGame(path.join(ROOT, "game-brush"), new Set([TOWN_BELOW, TOWN_BY_SEA]));
  const mod2 = path.join(ROOT, "mod-brush");
  write(mod2, "descriptor.mod", 'name="brush town"\n');
  const STROKE = 20;
  const inStroke = (x, y) => y >= ROWY[3] && y < ROWY[3] + STROKE && x >= COLX[2] && x < COLX[2] + COLW[2];
  const [r, g, b] = colour(TOWN_BY_SEA);
  const diff = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (inStroke(x, y)) diff.push({ x, y, r, g, b });
  const res = md.applyProvinceDiff({ modRoot: mod2, gameRoot: game2, dependencyRoots: [], diff });
  const hm = (res && res.heightmap) || {};
  ok(res && res.ok !== false && hm.terrain && hm.terrain.changed && hm.trees && hm.trees.changed,
    "the stroke raised its pixels, painted terrain.bmp and planted trees.bmp", res && (res.error || { terrain: hm.terrain && (hm.terrain.reason || hm.terrain.pixels), trees: hm.trees }));
  // what the game loads: the mod's own file, else the layer below's
  const loaded = (rel) => read8(fs.existsSync(path.join(mod2, "map", rel)) ? path.join(mod2, "map", rel) : path.join(game2, "map", rel));
  const paint2 = loaded("terrain.bmp"), trees2 = loaded("trees.bmp");
  const got = {};
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (inStroke(x, y)) got[paint2(x, y)] = (got[paint2(x, y)] || 0) + 1;
  ok(got[SPAWN] === CORE_BELOW && got[FOREST] === STROKE * COLW[2] - CORE_BELOW,
    "CONTROL: the painter gave the stroke a 40 px core and ringed the rest in the forest round the town", got);
  let ring = 0, ringGrown = 0, core = 0, coreGrown = 0;
  const kinds = new Set();
  for (let by = 0; by < TH; by++) for (let bx = 0; bx < TW; bx++) {
    const px = [[2 * bx, 2 * by], [2 * bx + 1, 2 * by], [2 * bx, 2 * by + 1], [2 * bx + 1, 2 * by + 1]];
    if (!px.every(([x, y]) => inStroke(x, y))) continue;
    const t = trees2(bx, by);
    if (px.some(([x, y]) => paint2(x, y) === SPAWN)) { core++; if (t !== BARE) coreGrown++; }
    else { ring++; if (t !== BARE) { ringGrown++; kinds.add(t); } }
  }
  ok(ring > 50 && core > 5, `(the fixture: ${ring} blocks of the stroke are all ring, ${core} hold some of its core)`, { ring, core });
  ok(ringGrown > ring / 2 && kinds.size === 1 && kinds.has(TREE), "⭐⭐ BRUSH: the ring's blocks carry the forest's trees, and only the declared one", { ring, ringGrown, kinds: [...kinds] });
  ok(core > 0 && coreGrown === 0, "⭐ BRUSH: no block with city ground in it carries a tree", { core, coreGrown });
}

try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) { /* scratch only */ }
console.log("\n" + (fail ? "FAILED " + fail + "/" + (pass + fail) : "PASSED " + pass + "/" + pass));
process.exitCode = fail ? 1 : 0;
