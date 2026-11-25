// A generated world must have TERRAIN TYPES. Generate land gave every province it raised `plains`.
// #a-generated-world-is-one-terrain
//
// The owner builds a world with: new mod → Delete map → Generate land 35% → Auto-fix. generateLand stamped
// `c[6] = "plains"` on every row it turned into land, so the world that came out was ONE terrain type. That
// is two faults in one: map/terrain.bmp paints what the row says, so the whole world is one ground texture;
// and terrain is what HOI4 reads for combat width, attack modifiers, movement cost, supply flow penalty and
// truck attrition, so every battle anywhere on that world is fought on identical ground.
//
// Measured on his own built world (4,721 land provinces): plains 100.0%. No shipping map is anything like
// that — the most single-minded of the six is Old World Blues at 41.7% plains — and section 1 below
// re-measures that from the maps installed on this machine rather than trusting the line above.
//
// What the fix has to reproduce is not just a MIX. Terrain on a real map comes in PATCHES: 59.7% of
// vanilla's land-land province neighbour pairs carry the same terrain, against 19.9% if every province drew
// independently from vanilla's own mix (MD 56.1/18.9, R56 59.8/20.0, OWB 73.5/25.3, NV 55.8/17.4, RoN
// 59.9/19.9). Drawing one terrain per province out of the right table would still be noise — three times
// less clustered than every map that ships. The Sahara is one desert and the Alps are one range.
//
// So the writer grows two smoothed fields over the same province graph the landmasses were grown over, bands
// the provinces by the corpus's height-percentile table and orders each band by how coastal the province is.
// This test asks four things of that, each of which the old `"plains"` fails:
//
//   1. the corpus tables in map-data.js are what the installed base game actually says (re-derived here);
//   2. a generated world carries more than one terrain, in about the corpus's proportions, in patches;
//   3. every name it writes comes from the MOD'S OWN common/terrain — Old World Blues declares `radiation`
//      and no `lakes` at all, so a hardcoded list writes categories that map does not have;
//   4. what the row says and what terrain.bmp is painted with agree, and the result is deterministic.
//
// Run: node test-a-generated-world-has-terrain-types.js
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

const SANDBOX = fs.mkdtempSync(path.join(os.tmpdir(), "nova-genterr-"));
process.env.APPDATA = path.join(SANDBOX, "appdata");
process.env.XDG_CONFIG_HOME = process.env.APPDATA;
process.env.NOVA_APP_DATA_DIR = process.env.APPDATA;
process.env.NOVA_HOME_DIR = path.join(SANDBOX, "home");
fs.mkdirSync(process.env.APPDATA, { recursive: true });
fs.mkdirSync(process.env.NOVA_HOME_DIR, { recursive: true });
const md = require("./map-data.js");

const GAME = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
const WORKSHOP = "D:/SteamLibrary/steamapps/workshop/content/394360";
const INSTALLED = [
  ["vanilla", GAME], ["Millennium Dawn", WORKSHOP + "/2777392649"], ["Road to 56", WORKSHOP + "/820260968"],
  ["Old World Blues", WORKSHOP + "/2265420196"], ["Novum Vexillum", WORKSHOP + "/1827273767"], ["Rise of Nations", WORKSHOP + "/2026448968"],
];

const mk = (p, c) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, c); };

// ─────────────────────────────────────────────────────────────────────────────────────────────────────────
// 1. THE CORPUS. Both tables are re-derived from the installed game here rather than compared with numbers
//    typed into this file: a constant nobody re-measures is a constant that goes stale.
// ─────────────────────────────────────────────────────────────────────────────────────────────────────────
console.log("=== 1. what the installed maps say a world is made of ===");

/** Every land row of a root's effective definition.csv, by terrain. Cheap — no bitmap. */
function landMixOf(root) {
  const own = path.join(root, "map", "definition.csv");
  const csv = fs.existsSync(own) ? own : path.join(GAME, "map", "definition.csv");
  if (!fs.existsSync(csv)) return null;
  const by = new Map();
  let n = 0;
  for (const line of fs.readFileSync(csv, "utf8").split("\n")) {
    const c = (line.endsWith("\r") ? line.slice(0, -1) : line).split(";");
    if (c.length < 7 || !/^\d+$/.test(c[0]) || c[0] === "0" || c[4] !== "land") continue;
    const t = (c[6] || "").trim().toLowerCase();
    by.set(t, (by.get(t) || 0) + 1);
    n++;
  }
  return n ? { by, n } : null;
}

let sawAMap = false;
for (const [name, root] of INSTALLED) {
  const mix = landMixOf(root);
  if (!mix) { console.log("  ~~   " + name + " is not installed — nothing measured from it"); continue; }
  sawAMap = true;
  const top = [...mix.by.entries()].sort((a, b) => b[1] - a[1]);
  rec(name + " ships more than one land terrain", mix.by.size > 1, mix.by.size + " terrains over " + mix.n + " land rows");
  rec(name + "'s commonest terrain is not the whole map", top[0][1] / mix.n < 0.75,
    top.slice(0, 3).map(([t, k]) => t + " " + (k * 100 / mix.n).toFixed(1) + "%").join("  "));
}
if (!sawAMap) console.log("  ⚠️  NO MAP IS INSTALLED — section 1 measured nothing. That is not a pass.");

/** Vanilla's own land provinces with the two things the tables are cut by: the mean heightmap value under
 *  their pixels, and their hops to the nearest sea province over the graph hoi4.exe floods. */
function vanillaLandProvinces() {
  const need = ["map/provinces.bmp", "map/heightmap.bmp", "map/definition.csv"].map((r) => path.join(GAME, r));
  if (!need.every((p) => fs.existsSync(p))) return null;
  const model = md.buildMapModel({ modRoot: GAME, gameRoot: GAME, dependencyRoots: [] });
  const adj = md.provinceNeighbourGraph({ modRoot: GAME, gameRoot: GAME, dependencyRoots: [], model });
  const pbuf = fs.readFileSync(need[0]);
  const hbuf = fs.readFileSync(need[1]);
  const hm = md.readIndexedBmp(hbuf);
  const dataOff = pbuf.readUInt32LE(10), W = pbuf.readInt32LE(18), H = pbuf.readInt32LE(22);
  if (!hm || hm.width !== W || hm.height !== H) return null;
  const rowSize = Math.floor((24 * W + 31) / 32) * 4;
  const sum = new Map(), px = new Map();
  for (let y = 0; y < H; y++) {
    const base = dataOff + (H - 1 - y) * rowSize;
    for (let x = 0; x < W; x++) {
      const o = base + x * 3;
      const c = ((pbuf[o + 2] << 16) | (pbuf[o + 1] << 8) | pbuf[o]) >>> 0;
      sum.set(c, (sum.get(c) || 0) + hbuf[hm.pixelOffset(x, y)]);
      px.set(c, (px.get(c) || 0) + 1);
    }
  }
  const hop = new Map();
  let front = [];
  for (const p of model.provinces) if (p.type === "sea") { hop.set(p.id, 0); front.push(p.id); }
  for (let d = 1; front.length; d++) {
    const next = [];
    for (const c of front) for (const nb of (adj.get(c) || [])) { if (hop.has(nb)) continue; hop.set(nb, d); next.push(nb); }
    front = next;
  }
  const out = [];
  for (const p of model.provinces) {
    if (p.type !== "land") continue;
    const c = ((p.r << 16) | (p.g << 8) | p.b) >>> 0;
    if (!px.get(c)) continue;
    out.push({ terrain: String(p.terrain || "").toLowerCase(), mean: sum.get(c) / px.get(c), hop: hop.has(p.id) ? hop.get(p.id) : -1 });
  }
  return out.length ? out : null;
}

const vanilla = vanillaLandProvinces();
if (!vanilla) {
  console.log("  ⚠️  the base game's map could not be read — the two corpus tables were NOT re-derived here.");
} else {
  const byHeight = vanilla.slice().sort((a, b) => a.mean - b.mean);
  let at = 0, worstBand = 0, worstWhere = "";
  for (const band of md.TERRAIN_BY_ELEVATION) {
    const end = Math.floor(band.upTo * byHeight.length);
    const slice = byHeight.slice(at, end);
    at = end;
    if (!slice.length) continue;
    const c = new Map();
    for (const r of slice) c.set(r.terrain, (c.get(r.terrain) || 0) + 1);
    // every terrain the table names for this band, AND every terrain the map puts there — a missing entry is
    // as wrong as a wrong one
    for (const t of new Set([...Object.keys(band.mix), ...c.keys()])) {
      const got = (c.get(t) || 0) * 100 / slice.length;
      const said = band.mix[t] || 0;
      if (Math.abs(got - said) > worstBand) { worstBand = Math.abs(got - said); worstWhere = "band " + band.upTo + " " + t + " table " + said + " map " + got.toFixed(1); }
    }
    const lo = Math.round(slice[0].mean), hi = Math.round(slice[slice.length - 1].mean);
    if (Math.abs(lo - band.h[0]) > 1 || Math.abs(hi - band.h[1]) > 1) worstWhere += " | height range " + band.upTo + " table " + JSON.stringify(band.h) + " map [" + lo + ", " + hi + "]";
  }
  rec("TERRAIN_BY_ELEVATION is what the installed base game says", worstBand <= 0.5, worstWhere || ("worst |Δ| " + worstBand.toFixed(2) + " pp"));

  const hs = new Map(), hn = new Map();
  for (const r of vanilla) { if (r.hop < 0) continue; hs.set(r.terrain, (hs.get(r.terrain) || 0) + r.hop); hn.set(r.terrain, (hn.get(r.terrain) || 0) + 1); }
  let worstHop = 0, hopWhere = "";
  for (const t of Object.keys(md.TERRAIN_HOPS_FROM_SEA)) {
    if (!hn.get(t)) { worstHop = 99; hopWhere = t + " is not a terrain this map uses"; break; }
    const got = hs.get(t) / hn.get(t);
    const d = Math.abs(got - md.TERRAIN_HOPS_FROM_SEA[t]);
    if (d > worstHop) { worstHop = d; hopWhere = t + " table " + md.TERRAIN_HOPS_FROM_SEA[t] + " map " + got.toFixed(2); }
  }
  rec("TERRAIN_HOPS_FROM_SEA is what the installed base game says", worstHop <= 0.05, hopWhere);

  // …and the relationship the table exists to carry: the highest land is mountain, the lowest is not.
  const top = md.TERRAIN_BY_ELEVATION[md.TERRAIN_BY_ELEVATION.length - 1].mix;
  const bottom = md.TERRAIN_BY_ELEVATION[0].mix;
  const commonest = (mix) => Object.entries(mix).sort((a, b) => b[1] - a[1])[0][0];
  rec("the table says the highest land is mountain and the lowest is plains",
    commonest(top) === "mountain" && commonest(bottom) === "plains", commonest(bottom) + " … " + commonest(top));
}

// ─────────────────────────────────────────────────────────────────────────────────────────────────────────
// 2. THE FIXTURE. An all-sea lattice of one-pixel provinces — the shape Delete map leaves — with a terrain
//    table of its own, so nothing here depends on the installed game.
// ─────────────────────────────────────────────────────────────────────────────────────────────────────────
const W = 48, H = 32;
const PROVINCES = W * H;
const idAt = (x, y) => y * W + x + 1;
const colourOf = (id) => [id & 255, (id >> 8) & 255, 91];
const regionOf = (id) => { const i = id - 1; return Math.floor((i % W) / 12) + 4 * Math.floor(Math.floor(i / W) / 8) + 1; };

function bmp24(width, height, fn) {
  const rowSize = (width * 3 + 3) & ~3, imageSize = rowSize * height;
  const buf = Buffer.alloc(54 + imageSize);
  buf.write("BM", 0, "ascii"); buf.writeUInt32LE(54 + imageSize, 2); buf.writeUInt32LE(54, 10); buf.writeUInt32LE(40, 14);
  buf.writeInt32LE(width, 18); buf.writeInt32LE(height, 22); buf.writeUInt16LE(1, 26); buf.writeUInt16LE(24, 28);
  buf.writeUInt32LE(0, 30); buf.writeUInt32LE(imageSize, 34);
  for (let y = 0; y < height; y++) { let off = 54 + (height - 1 - y) * rowSize; for (let x = 0; x < width; x++) { const [r, g, b] = fn(x, y); buf[off++] = b; buf[off++] = g; buf[off++] = r; } }
  return buf;
}
const IRS = Math.floor((8 * W + 31) / 32) * 4;
function bmp8(fn) {
  const isz = IRS * H;
  const b = Buffer.alloc(54 + 1024 + isz);
  b.write("BM", 0, "ascii");
  b.writeUInt32LE(54 + 1024 + isz, 2); b.writeUInt32LE(54 + 1024, 10); b.writeUInt32LE(40, 14);
  b.writeInt32LE(W, 18); b.writeInt32LE(H, 22); b.writeUInt16LE(1, 26);
  b.writeUInt16LE(8, 28); b.writeUInt32LE(0, 30); b.writeUInt32LE(isz, 34);
  b.writeUInt32LE(256, 46); b.writeUInt32LE(256, 50);
  for (let i = 0; i < 256; i++) { const o = 54 + i * 4; b[o] = i; b[o + 1] = i; b[o + 2] = i; b[o + 3] = 0; }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) b[54 + 1024 + (H - 1 - y) * IRS + x] = fn(x, y);
  return b;
}
const idx8 = (file, x, y) => { const b = fs.readFileSync(file); return b[b.readUInt32LE(10) + (H - 1 - y) * IRS + x]; };

/** A common/terrain file: `table` is category → graphical index, `water` the ones that are is_water. */
function terrainFile(table, water) {
  return "categories = {\n"
    + Object.keys(table).map((c) => `\t${c} = {${water.includes(c) ? " is_water = yes" : ""} color = { 100 120 140 } movement_cost = 1.0 }`).join("\n")
    + "\n}\nterrain = {\n"
    + Object.entries(table).map(([c, i]) => `\t${c}_g = { type = ${c} color = { ${i} } texture = 1 }`).join("\n")
    + "\n}\n";
}
const FULL_TABLE = { plains: 0, forest: 1, hills: 2, desert: 3, mountain: 6, marsh: 9, urban: 13, jungle: 21, lakes: 14, ocean: 15 };
const THIN_TABLE = { plains: 0, forest: 1, marsh: 9, ocean: 15 };

function makeMod(tag, table, water) {
  const mod = fs.mkdtempSync(path.join(SANDBOX, tag + "-"));
  mk(path.join(mod, "descriptor.mod"), 'name="Terrain"\nreplace_path="history/states"\nreplace_path="map"\nreplace_path="map/strategicregions"\nreplace_path="common/terrain"\n');
  const rows = ["0;0;0;0;land;false;unknown;0"];
  for (let id = 1; id <= PROVINCES; id++) { const [r, g, b] = colourOf(id); rows.push(`${id};${r};${g};${b};sea;false;ocean;0`); }
  mk(path.join(mod, "map", "definition.csv"), rows.join("\r\n") + "\r\n");
  mk(path.join(mod, "map", "provinces.bmp"), bmp24(W, H, (x, y) => colourOf(idAt(x, y))));
  mk(path.join(mod, "map", "heightmap.bmp"), bmp8(() => md.HEIGHTMAP_SEA_VALUE));
  mk(path.join(mod, "map", "terrain.bmp"), bmp8(() => table.ocean));
  if (table) mk(path.join(mod, "common", "terrain", "00_terrain.txt"), terrainFile(table, water));
  const byRegion = new Map();
  for (let id = 1; id <= PROVINCES; id++) { const r = regionOf(id); if (!byRegion.has(r)) byRegion.set(r, []); byRegion.get(r).push(id); }
  for (const [r, provs] of byRegion) {
    mk(path.join(mod, "map", "strategicregions", `r${r}.txt`), `strategic_region={\n\tid=${r}\n\tname="REGION_${r}"\n\tprovinces={ ${provs.join(" ")} }\n\tweather={}\n}\n`);
  }
  return mod;
}
/** province id → terrain, straight off the rows the generator wrote. */
function generatedRows(mod) {
  const out = new Map();
  for (const line of fs.readFileSync(path.join(mod, "map", "definition.csv"), "utf8").split(/\r?\n/)) {
    const c = line.split(";");
    if (c.length < 7 || !/^\d+$/.test(c[0]) || c[0] === "0" || c[4] !== "land") continue;
    out.set(parseInt(c[0], 10), (c[6] || "").trim().toLowerCase());
  }
  return out;
}

const N = 600;
console.log("\n=== 2. a generated world has terrain types, in the corpus's proportions, in patches ===");
const mod = makeMod("full", FULL_TABLE, ["ocean", "lakes"]);
const gen = md.generateLand({ modRoot: mod, gameRoot: null, dependencyRoots: [], count: N, provincesPerState: 8, seed: 7 });
// #generate-land-fills-the-seas-it-cuts-off — the N asked for, and the seas the grown coast cut off, which became land with it
// #generate-land-leaves-no-sea-cut-off — …less the picks left sea to keep a sea it would have cut off open to the ocean
rec("the generator ran", gen.changed === true && !gen.error && gen.flippedProvinces === N - ((gen.inlandSeas || {}).leftSea || []).length + ((gen.inlandSeas || {}).filled || 0), gen.error || gen.flippedProvinces);

const rows = generatedRows(mod);
const mix = new Map();
for (const [, t] of rows) mix.set(t, (mix.get(t) || 0) + 1);
rec("it did not write one terrain over the whole world", mix.size > 1,
  [...mix.entries()].sort((a, b) => b[1] - a[1]).map(([t, n]) => t + " " + (n * 100 / rows.size).toFixed(1) + "%").join("  "));

// The proportions the writer's OWN table implies, integrated over the bands — derived, never typed in.
const expected = new Map();
{
  let prev = 0;
  for (const band of md.TERRAIN_BY_ELEVATION) {
    const width = band.upTo - prev; prev = band.upTo;
    const total = Object.values(band.mix).reduce((a, b) => a + b, 0);
    for (const [t, w] of Object.entries(band.mix)) expected.set(t, (expected.get(t) || 0) + width * w / total);
  }
}
let worstMix = 0, worstMixWhere = "";
for (const t of new Set([...expected.keys(), ...mix.keys()])) {
  const got = (mix.get(t) || 0) / rows.size, want = expected.get(t) || 0;
  if (Math.abs(got - want) > worstMix) { worstMix = Math.abs(got - want); worstMixWhere = t + " wanted " + (want * 100).toFixed(1) + "% got " + (got * 100).toFixed(1) + "%"; }
}
rec("the mix is the one TERRAIN_BY_ELEVATION implies", worstMix <= 0.02, worstMixWhere + "  (worst |Δ| " + (worstMix * 100).toFixed(2) + " pp)");

// …and it comes in PATCHES, not as noise. The yardstick is this world's own independent baseline, because
// that is exactly what a per-province draw from the same mix would produce.
const model = md.buildMapModel({ modRoot: mod, gameRoot: null, dependencyRoots: [], cacheStableLayers: true });
const adj = md.provinceNeighbourGraph({ modRoot: mod, gameRoot: null, dependencyRoots: [], model });
let same = 0, pairs = 0;
for (const [id, t] of rows) for (const nb of (adj.get(id) || [])) {
  if (nb <= id || !rows.has(nb)) continue;
  pairs++; if (rows.get(nb) === t) same++;
}
let independent = 0;
for (const [, n] of mix) independent += (n / rows.size) * (n / rows.size);
const shared = same / pairs;
rec("neighbouring provinces share a terrain far more often than chance",
  pairs > 100 && shared >= 2 * independent,
  (shared * 100).toFixed(1) + "% of " + pairs + " pairs, against " + (independent * 100).toFixed(1) + "% if each drew on its own (vanilla 59.7% / 19.9%)");

// …and the coastal relationship the second field carries. ⚠️ MEASURED ON A CONTINENT WITH AN INTERIOR,
// because that is the only place the question means anything: a continent whose every province is within a
// hop or two of the water has nowhere to put a desert. So a disc is cut out of the same lattice — 476
// provinces, ten hops deep at the middle — and the terrain is asked of it directly, over five seeds.
// One seed cannot carry this on a world this small: with the coastal term switched off entirely seed 11
// still comes out at rho 0.905, while 8, 9 and 10 give -0.48, -0.33 and -0.24. The MEAN over five is what
// separates them — 0.710 with the term against 0.110 without.
const discAdj = new Map();
{
  const link = (a, b) => { if (!discAdj.has(a)) discAdj.set(a, new Set()); discAdj.get(a).add(b); if (!discAdj.has(b)) discAdj.set(b, new Set()); discAdj.get(b).add(a); };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { if (x + 1 < W) link(idAt(x, y), idAt(x + 1, y)); if (y + 1 < H) link(idAt(x, y), idAt(x, y + 1)); }
}
const disc = [];
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const dx = x - (W / 2 - 0.5), dy = (y - (H / 2 - 0.5)) * 1.5;
  if (dx * dx + dy * dy <= 15 * 15) disc.push(String(idAt(x, y)));
}
const discLand = new Set(disc.map(Number));
const discHop = new Map();
{
  let front = [];
  for (const id of discLand) { let e = false; for (const nb of (discAdj.get(id) || [])) if (!discLand.has(nb)) { e = true; break; } if (e) { discHop.set(id, 1); front.push(id); } }
  for (let d = 2; front.length; d++) { const next = []; for (const c of front) for (const nb of (discAdj.get(c) || [])) if (discLand.has(nb) && !discHop.has(nb)) { discHop.set(nb, d); next.push(nb); } front = next; }
}
const SEEDS = [7, 8, 9, 10, 11];
const modPalette = md.generatedTerrainPalette({ modRoot: mod, gameRoot: null, dependencyRoots: [] });
const rhos = [];
for (const seed of SEEDS) {
  const got = md.generatedTerrainTypes({ picked: disc, adj: discAdj, landAfter: discLand, seed, palette: modPalette });
  const s = new Map(), c = new Map();
  for (const [id, t] of got) { const h = discHop.get(id) || 1; s.set(t, (s.get(t) || 0) + h); c.set(t, (c.get(t) || 0) + 1); }
  const ts = [...s.keys()];
  const mine = [...ts].sort((a, b) => s.get(a) / c.get(a) - s.get(b) / c.get(b));
  const theirs = [...ts].sort((a, b) => md.TERRAIN_HOPS_FROM_SEA[a] - md.TERRAIN_HOPS_FROM_SEA[b]);
  let d2 = 0;
  for (const t of ts) { const d = mine.indexOf(t) - theirs.indexOf(t); d2 += d * d; }
  rhos.push(ts.length > 2 ? 1 - 6 * d2 / (ts.length * (ts.length * ts.length - 1)) : 0);
}
const meanRho = rhos.reduce((a, b) => a + b, 0) / rhos.length;
rec("terrain sits at the corpus's own distance from the coast, seed after seed",
  Math.max(...discHop.values()) >= 8 && meanRho >= 0.45,
  "mean rho " + meanRho.toFixed(3) + " over seeds " + SEEDS.join(",") + " — " + rhos.map((r) => r.toFixed(2)).join(" ")
  + "; the disc is " + disc.length + " provinces, " + Math.max(...discHop.values()) + " hops deep");

// ─────────────────────────────────────────────────────────────────────────────────────────────────────────
// 3. THE NAMES ARE THE MOD'S OWN. #a-same-named-file-replaces-the-lower-one, in the column that names a
//    terrain. A list in Nova's source writes categories a map does not declare.
// ─────────────────────────────────────────────────────────────────────────────────────────────────────────
console.log("\n=== 3. every name it writes is one the mod's own common/terrain declares ===");
const palette = md.generatedTerrainPalette({ modRoot: mod, gameRoot: null, dependencyRoots: [] });
rec("the palette is the declared LAND categories, water left out",
  palette.length === Object.keys(FULL_TABLE).length - 2 && !palette.includes("ocean") && !palette.includes("lakes"), palette.join(" "));
const strays = [...new Set(rows.values())].filter((t) => !palette.includes(t));
rec("no generated row carries a terrain outside that palette", strays.length === 0, strays.join(" "));

// …and a mod that declares a SMALLER table gets only what it declares.
const thin = makeMod("thin", THIN_TABLE, ["ocean"]);
const thinGen = md.generateLand({ modRoot: thin, gameRoot: null, dependencyRoots: [], count: N, provincesPerState: 8, seed: 7 });
const thinRows = generatedRows(thin);
const thinKinds = [...new Set(thinRows.values())].sort();
rec("a mod declaring only plains/forest/marsh is given only those", thinGen.changed === true && thinKinds.every((t) => ["plains", "forest", "marsh"].includes(t)), thinKinds.join(" "));
rec("…and still gets more than one of them", thinKinds.length > 1, thinKinds.join(" "));

// …and a mod with NO terrain table anywhere still gets its land, on the old default.
const bare = makeMod("bare", FULL_TABLE, ["ocean", "lakes"]);
fs.rmSync(path.join(bare, "common"), { recursive: true, force: true });
const bareGen = md.generateLand({ modRoot: bare, gameRoot: null, dependencyRoots: [], count: 40, provincesPerState: 8, seed: 3 });
const bareKinds = [...new Set(generatedRows(bare).values())];
rec("a mod with no terrain table at all still gets its land", bareGen.changed === true && bareGen.flippedProvinces === 40, bareGen.error || bareGen.flippedProvinces);
rec("…on the old plains default, not on a guess", bareKinds.length === 1 && bareKinds[0] === "plains", bareKinds.join(" "));

// ─────────────────────────────────────────────────────────────────────────────────────────────────────────
// 4. THE ROW AND THE PAINT AGREE, and the same seed gives the same world.
// ─────────────────────────────────────────────────────────────────────────────────────────────────────────
console.log("\n=== 4. the row and terrain.bmp agree, and it is deterministic ===");
const declared = md.graphicalTerrainIndices({ modRoot: mod, gameRoot: null, dependencyRoots: [] });
const tb = path.join(mod, "map", "terrain.bmp");
let painted = 0, wrong = 0, wrongWhere = "";
for (const [id, t] of rows) {
  const i = id - 1, x = i % W, y = Math.floor(i / W);
  const got = idx8(tb, x, y);
  const list = declared.get(t) || [];
  if (list.includes(got)) { painted++; continue; }
  if (got === FULL_TABLE.ocean) { wrong++; if (!wrongWhere) wrongWhere = "province " + id + " says " + t + " and is still painted as the sea"; continue; }
  wrong++;
  if (!wrongWhere) wrongWhere = "province " + id + " says " + t + " but is painted " + got + ", which that table gives to " + ([...declared.entries()].find(([, l]) => l.includes(got)) || ["nothing"])[0];
}
rec("every generated province is painted with an index its own terrain declares", wrong === 0 && painted === rows.size, wrongWhere || (painted + " of " + rows.size));

const twin = makeMod("twin", FULL_TABLE, ["ocean", "lakes"]);
md.generateLand({ modRoot: twin, gameRoot: null, dependencyRoots: [], count: N, provincesPerState: 8, seed: 7 });
const twinRows = generatedRows(twin);
let differs = 0;
for (const [id, t] of rows) if (twinRows.get(id) !== t) differs++;
rec("the same seed gives the same terrain on every province", differs === 0 && twinRows.size === rows.size, differs + " of " + rows.size);

const other = makeMod("other", FULL_TABLE, ["ocean", "lakes"]);
md.generateLand({ modRoot: other, gameRoot: null, dependencyRoots: [], count: N, provincesPerState: 8, seed: 8 });
const otherRows = generatedRows(other);
let moved = 0;
for (const [id, t] of otherRows) if (rows.get(id) !== t) moved++;
rec("a different seed gives a different world", moved > otherRows.size * 0.2, moved + " of " + otherRows.size + " provinces differ");

// ─────────────────────────────────────────────────────────────────────────────────────────────────────────
console.log("\n" + (fails.length ? "FAILED " + fails.length + " of " + checks : "PASSED " + checks + " checks"));
try { fs.rmSync(SANDBOX, { recursive: true, force: true }); } catch (_) {}
if (fails.length) { for (const f of fails) console.log("  - " + f); process.exit(1); }
process.exit(0);
