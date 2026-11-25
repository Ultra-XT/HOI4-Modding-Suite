// ⛔ #a-generated-coast-is-not-the-oceans-border — A ROUGH COAST LEAVES EVERY STATION AND STAR ON ITS OWN PROVINCE.
//
// The coast step moves pixels between a raised province and the sea beside it, and some things in the map files stand on a pixel
// and mean the province under it: unitstacks.txt's type 0 row is a province's Standstill (its hub icon and white arrow) and type 38
// its victory-point star; an adjacencies.csv start or stop point is where the game draws a crossing to. In the owner's flow the mod
// owns neither file — they are the base game's, read through the layer below — so the coast has to leave them where they are: a
// 3 × 3 under every type 0/38 row and a 7 × 7 round every crossing point stay as they were (freezes (c) and (b)).
//
// Asked of what Generate land itself WRITES, over a layer below that ships a unitstacks.txt with a Standstill and a star for every
// province (each two pixels inside one of its province's edges, opposite ones, so the coast reaches both) and an adjacencies.csv
// whose points sit three pixels either side of a province border:
//   · every type 0/38 row stands on a pixel of its own province in the FINAL provinces.bmp, and every crossing point's 7 × 7 is
//     what it was;
//   · fixCoastalNoPort finds no coastal province without a port that the control (`roughenCoast: false`) does not, and no row of
//     the buildings.txt Generate land wrote stands over water;
//   · IN-TEST CONTROL: the same step on the same world with those two freezes turned off moves at least one Standstill and at least
//     one star off its province, and at least one crossing point's ground — so this fixture can tell the freezes from no freezes, for
//     each type. With them on, the step gives back exactly the bitmap the click wrote.
// Every count is derived from the fixture's own files.
//
// Run: node test-a-rough-coast-leaves-every-station-and-star-on-its-province.js
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (detail == null ? "" : "   " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 300)));
  if (!ok) fails.push(label);
};

const SANDBOX = fs.mkdtempSync(path.join(os.tmpdir(), "nova-coaststations-"));
process.env.APPDATA = path.join(SANDBOX, "appdata");
process.env.XDG_CONFIG_HOME = process.env.APPDATA;
process.env.NOVA_APP_DATA_DIR = process.env.APPDATA;
process.env.NOVA_HOME_DIR = path.join(SANDBOX, "home");
fs.mkdirSync(process.env.APPDATA, { recursive: true });
fs.mkdirSync(process.env.NOVA_HOME_DIR, { recursive: true });
const md = require("./map-data.js");

const mk = (p, c) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, c); };
const sha = (b) => crypto.createHash("sha1").update(b).digest("hex");

// ── the world: square provinces; below, a continent and an island the mod's Delete map has drowned ────────────────────────
const S = 24, COLS = 16, ROWS = 8, W = S * COLS, H = S * ROWS, PROVINCES = COLS * ROWS;
const idAt = (x, y) => Math.floor(y / S) * COLS + Math.floor(x / S) + 1;
const colAt = (id) => (id - 1) % COLS, rowAt = (id) => Math.floor((id - 1) / COLS);
const colourOf = (id) => [(id * 37) & 255, id, 120];
const LAKE = idAt(14 * S, 6 * S);
const landBelow = (id) => (colAt(id) >= 3 && colAt(id) <= 8 && rowAt(id) >= 2 && rowAt(id) <= 5) || (colAt(id) >= 11 && colAt(id) <= 12 && rowAt(id) >= 1 && rowAt(id) <= 2);
const IRS = Math.floor((8 * W + 31) / 32) * 4;
function bmp24(fn) {
  const rs = (W * 3 + 3) & ~3, b = Buffer.alloc(54 + rs * H);
  b.write("BM", 0, "ascii"); b.writeUInt32LE(b.length, 2); b.writeUInt32LE(54, 10); b.writeUInt32LE(40, 14);
  b.writeInt32LE(W, 18); b.writeInt32LE(H, 22); b.writeUInt16LE(1, 26); b.writeUInt16LE(24, 28); b.writeUInt32LE(rs * H, 34);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const [r, g, bl] = fn(x, y); const o = 54 + (H - 1 - y) * rs + x * 3; b[o] = bl; b[o + 1] = g; b[o + 2] = r; }
  return b;
}
const bmp8 = (v) => { const off = 54 + 1024, b = Buffer.alloc(off + IRS * H, v); b.write("BM", 0, "ascii"); b.writeUInt32LE(b.length, 2); b.writeUInt32LE(off, 10); b.writeUInt32LE(40, 14); b.writeInt32LE(W, 18); b.writeInt32LE(H, 22); b.writeUInt16LE(1, 26); b.writeUInt16LE(8, 28); b.writeUInt32LE(IRS * H, 34); b.writeUInt32LE(256, 46); b.writeUInt32LE(256, 50); for (let i = 0; i < 256; i++) { b[54 + i * 4] = i; b[54 + i * 4 + 1] = i; b[54 + i * 4 + 2] = i; } return b; };
// a z (and an adjacency y) counts from the BOTTOM row: pixel row y is z = H - 1 - y, and a z of row + .5 still floors to it
const zOf = (y) => (H - 1 - y + 0.5).toFixed(2);

// the layer below's rows: a star two pixels inside one of its province's four edges (by id), and the Standstill two pixels inside
// the opposite edge — so each type is in the coast's reach on its own (a Standstill at the middle, 12 px from every edge, was not,
// and freezing only the stars passed). On vanilla-sized provinces (median 160 px, about 13 × 13) a middle is that close too.
const STANDS = [];
const nearEdge = (id, edge) => { const x0 = colAt(id) * S, y0 = rowAt(id) * S; return { x: [x0 + S / 2, x0 + S - 3, x0 + S / 2, x0 + 2][edge], y: [y0 + 2, y0 + S / 2, y0 + S - 3, y0 + S / 2][edge] }; };
for (let id = 1; id <= PROVINCES; id++) {
  STANDS.push({ id, type: 0, ...nearEdge(id, (id + 2) % 4) });
  STANDS.push({ id, type: 38, ...nearEdge(id, id % 4) });
}
// …and crossings drawn between horizontal neighbours, each point three pixels from their shared border
const CROSSINGS = [];
for (const r of [1, 3, 4, 6]) for (const c of [1, 5, 9]) CROSSINGS.push({ from: r * COLS + c + 1, to: r * COLS + c + 2, sx: (c + 1) * S - 3, ex: (c + 1) * S + 2, y: r * S + S / 2 });
const POINTS = CROSSINGS.flatMap((a) => [{ x: a.sx, y: a.y }, { x: a.ex, y: a.y }]);

const BELOW = fs.mkdtempSync(path.join(SANDBOX, "below-"));
{
  const rows = ["0;0;0;0;land;false;unknown;0"];
  for (let id = 1; id <= PROVINCES; id++) { const [r, g, b] = colourOf(id); rows.push(id === LAKE ? `${id};${r};${g};${b};lake;false;lakes;0` : landBelow(id) ? `${id};${r};${g};${b};land;false;plains;1` : `${id};${r};${g};${b};sea;false;ocean;0`); }
  mk(path.join(BELOW, "map", "definition.csv"), rows.join("\r\n") + "\r\n");
  mk(path.join(BELOW, "map", "provinces.bmp"), bmp24((x, y) => colourOf(idAt(x, y))));
  mk(path.join(BELOW, "map", "unitstacks.txt"), STANDS.map((s) => `${s.id};${s.type};${s.x.toFixed(2)};9.50;${zOf(s.y)};0.00;0.00`).join("\r\n") + "\r\n");
  mk(path.join(BELOW, "map", "adjacencies.csv"), ["From;To;Type;Through;start_x;start_y;stop_x;stop_y;adjacency_rule_name;Comment"]
    .concat(CROSSINGS.map((a) => `${a.from};${a.to};impassable;-1;${a.sx};${H - 1 - a.y};${a.ex};${H - 1 - a.y};;wall`)).concat(["-1;-1;;-1;-1;-1;-1;-1;-1"]).join("\r\n") + "\r\n");
  // a buildings.txt with no rows left in it — what Delete map leaves of the drowned world's — so Generate land has one to add to
  mk(path.join(BELOW, "map", "buildings.txt"), "# every row of the drowned world is gone\r\n");
}

function makeMod(tag) {
  const mod = fs.mkdtempSync(path.join(SANDBOX, tag + "-"));
  // the map folder is the mod's own but not REPLACED: unitstacks.txt and adjacencies.csv are read from the layer below, as in the owner's flow
  mk(path.join(mod, "descriptor.mod"), 'name="Stations"\nreplace_path="history/states"\nreplace_path="map/strategicregions"\nreplace_path="common/terrain"\n');
  const rows = ["0;0;0;0;land;false;unknown;0"];
  for (let id = 1; id <= PROVINCES; id++) { const [r, g, b] = colourOf(id); rows.push(id === LAKE ? `${id};${r};${g};${b};lake;false;lakes;0` : `${id};${r};${g};${b};sea;false;ocean;0`); }
  mk(path.join(mod, "map", "definition.csv"), rows.join("\r\n") + "\r\n");
  fs.copyFileSync(path.join(BELOW, "map", "provinces.bmp"), path.join(mod, "map", "provinces.bmp"));
  mk(path.join(mod, "map", "heightmap.bmp"), bmp8(md.HEIGHTMAP_SEA_VALUE));
  mk(path.join(mod, "map", "terrain.bmp"), bmp8(15));
  mk(path.join(mod, "common", "terrain", "00_terrain.txt"), "categories = {\n\tplains = { color = { 100 120 140 } movement_cost = 1.0 }\n\tforest = { color = { 100 120 140 } movement_cost = 1.0 }\n\tlakes = { is_water = yes color = { 100 120 140 } movement_cost = 1.0 }\n\tocean = { is_water = yes color = { 100 120 140 } movement_cost = 1.0 }\n}\nterrain = {\n\tplains_g = { type = plains color = { 0 } texture = 1 }\n\tforest_g = { type = forest color = { 1 } texture = 1 }\n\tlakes_g = { type = lakes color = { 14 } texture = 1 }\n\tocean_g = { type = ocean color = { 15 } texture = 1 }\n}\n");
  const byRegion = new Map();
  for (let id = 1; id <= PROVINCES; id++) { if (id === LAKE) continue; const r = Math.floor(colAt(id) / 4) + 4 * Math.floor(rowAt(id) / 4) + 1; if (!byRegion.has(r)) byRegion.set(r, []); byRegion.get(r).push(id); }
  for (const [r, provs] of byRegion) mk(path.join(mod, "map", "strategicregions", `r${r}.txt`), `strategic_region={\n\tid=${r}\n\tname="REGION_${r}"\n\tprovinces={ ${provs.join(" ")} }\n\tweather={}\n}\n`);
  return mod;
}
function idsOf(file) {
  const b = fs.readFileSync(file), off = b.readUInt32LE(10), rs = (W * 3 + 3) & ~3, byColour = new Map();
  for (let id = 1; id <= PROVINCES; id++) { const [r, g, bl] = colourOf(id); byColour.set((r << 16) | (g << 8) | bl, id); }
  const ids = new Int32Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const o = off + (H - 1 - y) * rs + x * 3; ids[y * W + x] = byColour.get((b[o + 2] << 16) | (b[o + 1] << 8) | b[o]) || 0; }
  return ids;
}
const typesOf = (mod) => { const t = new Map(); for (const ln of fs.readFileSync(path.join(mod, "map", "definition.csv"), "utf8").split(/\r?\n/)) { const c = ln.split(";"); if (c.length > 4 && /^\d+$/.test(c[0]) && c[0] !== "0") t.set(+c[0], c[4]); } return t; };
const offProvince = (ids) => STANDS.filter((s) => ids[s.y * W + s.x] !== s.id);
const groundMoved = (before, after) => POINTS.filter((p) => { for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) { const i = (p.y + dy) * W + (p.x + dx + W) % W; if (before[i] !== after[i]) return true; } return false; });

const GEN = { gameRoot: BELOW, dependencyRoots: [], count: 40, provincesPerState: 6, seed: 7 };
try {
  console.log("=== a rough coast leaves every station and star on its province ===\n");
  const pristine = idsOf(path.join(BELOW, "map", "provinces.bmp"));
  rec("(the fixture: every Standstill and star of the layer below stands on its own province before the click)", STANDS.length === 2 * PROVINCES && offProvince(pristine).length === 0);

  const rough = makeMod("rough"), control = makeMod("control"), twin = makeMod("twin");
  const g = md.generateLand({ modRoot: rough, ...GEN });
  const gc = md.generateLand({ modRoot: control, ...GEN, roughenCoast: false });
  const c = g.coasts || {};
  console.log(`     coasts: ${JSON.stringify(c).slice(0, 400)}`);
  rec("Generate land made its land, and reshaped the coast", g.changed === true && g.flippedProvinces === GEN.count && c.changed === true && c.pixels > 0, { flipped: g.flippedProvinces, error: g.error, coasts: c });
  rec("⭐ it froze a 3 × 3 under every type 0 and type 38 row of the effective unitstacks.txt — the layer below's", !!(c.freezes && c.freezes.stations && c.freezes.stations.rows === STANDS.length), c.freezes);
  rec("⭐ …and a 7 × 7 round every start and stop point of the effective adjacencies.csv", !!(c.freezes && c.freezes.adjacencies && c.freezes.adjacencies.points === POINTS.length), c.freezes);
  rec("the mod still reads both files from below (Generate land wrote neither)", !fs.existsSync(path.join(rough, "map", "unitstacks.txt")) && !fs.existsSync(path.join(rough, "map", "adjacencies.csv")));

  console.log("\n1. On the bitmap the click wrote");
  const after = idsOf(path.join(rough, "map", "provinces.bmp"));
  const off = offProvince(after);
  for (const [t, what] of [[0, "Standstill (type 0)"], [38, "star (type 38)"]]) {
    const o = off.filter((s) => s.type === t);
    rec(`⭐⭐⭐ every ${what} stands on a pixel of its own province`, o.length === 0, o.slice(0, 5).map((s) => ({ ...s, on: after[s.y * W + s.x] })));
  }
  const moved = groundMoved(pristine, after);
  rec("⭐⭐ every crossing point's 7 × 7 is the ground it was", moved.length === 0, moved.slice(0, 5));

  console.log("\n2. What the click built on that coast");
  const portsMissing = (mod) => new Set(((md.fixCoastalNoPort({ modRoot: mod, gameRoot: BELOW, dependencyRoots: [], dryRun: true }) || {}).targets || []).map(String));
  const pr = portsMissing(rough), pc = portsMissing(control);
  const newMissing = [...pr].filter((p) => !pc.has(p));
  rec("⭐⭐ fixCoastalNoPort finds no coastal province without a port that the control does not", newMissing.length === 0, { rough: [...pr], control: [...pc] });
  const types = typesOf(rough);
  const bRows = fs.readFileSync(path.join(rough, "map", "buildings.txt"), "utf8").split(/\r?\n/).map((l) => l.split(";")).filter((c2) => c2.length >= 6 && /^\d+$/.test(c2[0]));
  const wet = bRows.filter((c2) => c2[1] !== "floating_harbor").filter((c2) => { const x = Math.floor(+c2[2]), y = H - 1 - Math.floor(+c2[4]); return !(x >= 0 && y >= 0 && x < W && y < H) || types.get(after[y * W + x]) !== "land"; });
  rec("⭐⭐ no row of the buildings.txt it wrote stands over water", bRows.length > 0 && wet.length === 0, { rows: bRows.length, wet: wet.slice(0, 5).map((c2) => c2.join(";")) });

  console.log("\n3. CONTROL: the same step, on the same world, with the freezes off");
  const picked = [...types].filter(([, t]) => t === "land").map(([id]) => String(id));
  const model = md.buildMapModel({ modRoot: twin, gameRoot: BELOW, dependencyRoots: [] });
  const same = md.roughenGeneratedCoast({ modRoot: twin, gameRoot: BELOW, dependencyRoots: [], picked, model, seed: GEN.seed });
  rec("with the freezes on, the step on the untouched twin is exactly the bitmap the click wrote", picked.length === GEN.count && !!same.raster && sha(Buffer.from(same.raster.ids.buffer)) === sha(Buffer.from(after.buffer)));
  const loose = md.roughenGeneratedCoast({ modRoot: twin, gameRoot: BELOW, dependencyRoots: [], picked, model, seed: GEN.seed, freeze: { stations: false, adjacencies: false } });
  const looseOff = loose.raster ? offProvince(loose.raster.ids) : [];
  const looseMoved = loose.raster ? groundMoved(pristine, loose.raster.ids) : [];
  const looseOf = (t) => looseOff.filter((s) => s.type === t).length;
  rec("⭐⭐ CONTROL: without them, the coast takes at least one Standstill AND at least one star off its province — each type can tell", looseOf(0) > 0 && looseOf(38) > 0, { standstills: looseOf(0), stars: looseOf(38), report: loose.report });
  rec("⭐⭐ CONTROL: …and moves the ground under at least one crossing point", looseMoved.length > 0, looseMoved.length);
  rec("…and the twin was never written", sha(fs.readFileSync(path.join(twin, "map", "provinces.bmp"))) === sha(fs.readFileSync(path.join(BELOW, "map", "provinces.bmp"))));

  console.log(`\n=== a rough coast leaves every station and star on its province: ${checks} checks, ${fails.length} failed ===`);
  if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
} catch (e) {
  console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 10).join("\n") : e);
  process.exitCode = 1;
} finally {
  try { fs.rmSync(SANDBOX, { recursive: true, force: true }); } catch (_) {}
}
