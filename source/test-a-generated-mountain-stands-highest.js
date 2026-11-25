// ⛔ #a-generated-mountain-stands-highest — THE TERRAIN IS CHOSEN BY THE GROUND THE RAISE WILL WRITE UNDER IT.
//
// Generate land chose each province's terrain by banding a smoothed RANDOM field through TERRAIN_BY_ELEVATION, while the raise
// wrote heightmapReliefField under it: two fields that never met. Measured on TEST 31 (all of its land generated), mean height by
// terrain: forest 112.8 · plains 112.7 · hills 112.0 · desert 111.1 · MOUNTAIN 108.7 · jungle 108.1 · marsh 105.7 — mountains
// LOWER than plains, where vanilla has mountain 131.8 · hills 116.1 · desert 114.9 · forest 105.3 · plains 102.9 · jungle 101.8 ·
// marsh 99.5. And every terrain was as rough as every other (within-province sd ~5.5 all), where vanilla's plains are flat (2.5)
// and its mountains rough (9.7). The table was measured by ranking vanilla's land by its height, so the bands are now ranked by
// each province's mean of the field the raise writes (provinceReliefMeans).
//
// Pinned here, on a fixture world built through generateLand with the latitude pass at work (a layer below with no jungle in its
// northern half), over several seeds:
//   1. provinceReliefMeans is the mean of heightmapReliefField(x, y, 0) over the sampled pixels, and a province no sample falls on
//      is still measured;
//   2. generatedTerrainTypes, given elevationOf, bands by it averaged TERRAIN_RELIEF_SMOOTHING times over the graph — each band
//      holds exactly the terrains the table gives it — and draws no random field for it; a province with no mean is left out of
//      its neighbours' averages; without it, the same seed gives the same world twice and the field is drawn twice, as before;
//   3. ⭐ on the world generateLand raises: mean height mountain > hills > plains, and plains are flatter inside than mountains.
//      Orders, never typed heights — and on every seed, so a lucky draw of the random field cannot pass it. And ⭐⭐ the wiring
//      itself, exactly: the terrain written is what generatedTerrainTypes and the latitude pass give the relief and the latitude read
//      off the provinces.bmp Generate land left (#a-generated-terrain-follows-the-latitude-below: the latitude below now chooses with
//      the relief, so a band of it no longer holds the table's terrains exactly — a twin call is the exact answer). The orders alone
//      were a thin guard on it: with the relief handed over upside down they failed on seed 1 only (1 check of 30), because the coast
//      order puts mountains inland, where the relief stands tallest.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-mountain-highest-"));
process.env.APPDATA = path.join(ROOT, "appdata"); process.env.NOVA_APP_DATA_DIR = process.env.APPDATA; process.env.XDG_CONFIG_HOME = process.env.APPDATA;
process.env.NOVA_HOME_DIR = path.join(ROOT, "home");
fs.mkdirSync(process.env.NOVA_HOME_DIR, { recursive: true });
const md = require("./map-data.js");
const { maskJsLiterals, jsBodyAt } = require("./testlib-strip-comments.js");

let pass = 0, fail = 0;
const ok = (c, m, x) => {
  if (c) { pass++; console.log("  ok   " + m); }
  else { fail++; console.log("  FAIL " + m + (x !== undefined ? "   -> " + JSON.stringify(x).slice(0, 500) : "")); }
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

// ── the world: 1024 x 512 of 16 x 16 provinces, 64 x 32 of them, id = row * 64 + col + 1 ───────────────────────────────────────
//   below  all land but the two edge columns. The north half (rows 0-15) grows every terrain the table names but jungle; the
//          south half grows all seven. So the latitude pass has jungle to move off the north, as it moves desert, jungle and
//          marsh on the owner's flow (224 provinces on TEST 31's geometry).
//   mod    the same shapes, all sea (what Delete map leaves), its own heightmap at the sea floor; regions of 8 x 8 provinces.
// ⚠️ THIS BIG ON PURPOSE. The raise lays an 8-pixel beach and fades the relief in over 24 more, so land within 32 pixels of the
// water stands near 103 whatever its relief — and the ranking is of the relief at depth 0. Measured on a 512 x 256 world of 8-pixel
// provinces, most of the land is that coast and one seed in three put hills over mountains WITH the fix; at this size the order
// held on all six seeds tried, and the random field broke it on three of the six (1, 3 and 6).
const CELL = 16, COLS = 64, ROWS = 32, W = COLS * CELL, H = ROWS * CELL, N = COLS * ROWS, NORTH = ROWS / 2;
const idAt = (c, r) => r * COLS + c + 1;
const colOf = (id) => (id - 1) % COLS, rowOf = (id) => Math.floor((id - 1) / COLS);
const provAt = (x, y) => idAt(Math.floor(x / CELL), Math.floor(y / CELL));
const colourOf = (id) => [id & 255, (id >> 8) & 255, 91];
const TABLE = { plains: 0, forest: 1, hills: 2, desert: 3, mountain: 6, marsh: 9, jungle: 21, ocean: 15 };
const NORTH_MIX = ["forest", "plains", "hills", "mountain", "desert", "marsh"];
const SOUTH_MIX = ["jungle", "forest", "plains", "hills", "mountain", "desert", "marsh"];
const terrainBelow = (c, r) => (c === 0 || c === COLS - 1 ? "ocean" : (r < NORTH ? NORTH_MIX : SOUTH_MIX)[(c + r) % (r < NORTH ? NORTH_MIX.length : SOUTH_MIX.length)]);

const game = path.join(ROOT, "game");
{
  write(game, "hoi4.exe", "");
  write(game, "map/provinces.bmp", bmp24(W, H, (x, y) => colourOf(provAt(x, y))));
  const rows = ["0;0;0;0;land;false;unknown;0"];
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) { const id = idAt(c, r), t = terrainBelow(c, r); rows.push(`${id};${colourOf(id).join(";")};${t === "ocean" ? "sea;false;ocean;0" : `land;false;${t};1`}`); }
  write(game, "map/definition.csv", rows.join("\n") + "\n");
  write(game, "common/terrain/00_terrain.txt", "categories = {\n"
    + Object.keys(TABLE).map((c) => `\t${c} = {${c === "ocean" ? " is_water = yes" : ""} color = { 100 120 140 } }`).join("\n")
    + "\n}\nterrain = {\n" + Object.entries(TABLE).map(([c, i]) => `\t${c}_g = { type = ${c} color = { ${i} } texture = 1 }`).join("\n") + "\n}\n");
}
function makeMod(tag) {
  const mod = path.join(ROOT, tag);
  write(mod, "descriptor.mod", 'name="relief"\nreplace_path="history/states"\n');
  write(mod, "map/provinces.bmp", bmp24(W, H, (x, y) => colourOf(provAt(x, y))));
  const rows = ["0;0;0;0;land;false;unknown;0"];
  for (let id = 1; id <= N; id++) rows.push(`${id};${colourOf(id).join(";")};sea;false;ocean;0`);
  write(mod, "map/definition.csv", rows.join("\n") + "\n");
  write(mod, "map/heightmap.bmp", bmp8(W, H, () => md.HEIGHTMAP_SEA_VALUE));
  write(mod, "map/terrain.bmp", bmp8(W, H, () => TABLE.ocean));
  const byRegion = new Map();
  for (let id = 1; id <= N; id++) { const reg = Math.floor(colOf(id) / 8) + 8 * Math.floor(rowOf(id) / 8) + 1; if (!byRegion.has(reg)) byRegion.set(reg, []); byRegion.get(reg).push(id); }
  for (const [reg, provs] of byRegion) write(mod, `map/strategicregions/r${reg}.txt`, `strategic_region={\n\tid=${reg}\n\tname="REGION_${reg}"\n\tprovinces={ ${provs.join(" ")} }\n\tweather={}\n}\n`);
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
/** The CELL x CELL square of every province as a raster, row 0 at the top — what provinceReliefMeans reads. */
const raster = new Int32Array(W * H);
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) raster[y * W + x] = provAt(x, y);

console.log("\n-- 1. provinceReliefMeans is the mean of the relief the raise writes, over the sampled pixels --");
{
  const relief = md.heightmapReliefField(W);
  const some = [idAt(3, 4), idAt(40, 20), idAt(63, 31)];
  const got = md.provinceReliefMeans({ W, H, ids: raster, provinceIds: some, step: 2 });
  let worst = 0;
  for (const id of some) {
    let s = 0, n = 0;
    for (let y = rowOf(id) * CELL; y < (rowOf(id) + 1) * CELL; y++) for (let x = colOf(id) * CELL; x < (colOf(id) + 1) * CELL; x++) if (x % 2 === 0 && y % 2 === 0) { s += relief(x, y, 0); n++; }
    worst = Math.max(worst, Math.abs(got.get(id) - s / n));
  }
  ok(got.size === some.length && worst < 1e-9, "each mean is the field's own, at depth 0, over every second pixel of every second row", { size: got.size, worst });
  ok(new Set(some.map((id) => got.get(id))).size === some.length, "CONTROL: the three provinces stand at three different heights, so a wrong pixel would show", some.map((id) => got.get(id)));
  const asFn = md.provinceReliefMeans({ W, H, ids: (x, y) => raster[y * W + x], provinceIds: some, step: 2 });
  ok(some.every((id) => asFn.get(id) === got.get(id)), "…and a pixel lookup (provinceExtents' pidAt) answers exactly what the raster does", some.map((id) => [got.get(id), asFn.get(id)]));
  // a one-pixel province on an odd column and row: no sample of step 2 falls on it
  const speck = new Int32Array(raster); const SPECK = N + 1; speck[5 * W + 3] = SPECK;
  const sp = md.provinceReliefMeans({ W, H, ids: speck, provinceIds: [SPECK, idAt(0, 0)], step: 2 });
  ok(sp.has(SPECK) && sp.get(SPECK) === relief(3, 5, 0), "⭐ a province no sample falls on is measured on its own pixels, not left out", { has: sp.has(SPECK), got: sp.get(SPECK), want: relief(3, 5, 0) });
}

console.log("\n-- 2. generatedTerrainTypes bands by elevationOf when given it, and draws no random field for it --");
const palette = md.generatedTerrainPalette({ modRoot: makeMod("palette"), gameRoot: game, dependencyRoots: [] }).filter((t) => t !== "urban");
const disc = [];
for (let r = 4; r < 28; r++) for (let c = 8; c < 56; c++) disc.push(String(idAt(c, r)));
const discLand = new Set(disc.map(Number));
const discAdj = new Map();
for (const id of discLand) {
  const c = colOf(id), r = rowOf(id), nb = [];
  for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const q = idAt(c + dc, r + dr); if (c + dc >= 0 && c + dc < COLS && r + dr >= 0 && r + dr < ROWS) nb.push(q); }
  discAdj.set(id, nb);
}
const discElevation = md.provinceReliefMeans({ W, H, ids: raster, provinceIds: disc });
const K = md.TERRAIN_RELIEF_SMOOTHING;
/** `means` averaged `rounds` times over `adj` among `within`, as generatedTerrainTypes averages the relief before it bands it: a
 *  province with no mean is left out of its neighbours' averages and gets none itself. Written out from that rule, not lifted. */
const smoothedOver = (means, adj, within, rounds) => {
  let v = new Map([...means].filter(([id]) => within.has(id)));
  for (let k = 0; k < rounds; k++) {
    const w = new Map();
    for (const [id, x] of v) { let s = x, n = 1; for (const nb of (adj.get(id) || [])) if (v.has(nb)) { s += v.get(nb); n++; } w.set(id, s / n); }
    v = w;
  }
  return v;
};
/** `ids` in the order the bands are cut in: by `means`, a province with none lowest, ties by id — as generatedTerrainTypes ranks. */
const bandOrder = (ids, means) => ids.slice().sort((p, q) => (means.has(p) ? means.get(p) : 0) - (means.has(q) ? means.get(q) : 0) || p - q);
/** Σ over the bands of TERRAIN_BY_ELEVATION, cut by the rank of `means` as the table is cut, and over the terrains, of |how many
 *  `terrainOf` puts in the band − how many generatedTerrainTypes gives it|. A band's count of each terrain is set by the band's
 *  size and the table alone — not by the coast, the graph or the seed — so it is asked of the module with no graph at all, which
 *  leaves `means` as they are. */
const bandDeviation = (ids, means, terrainOf, seed) => {
  const want = md.generatedTerrainTypes({ picked: ids, adj: null, landAfter: new Set(ids), seed, palette, elevationOf: means });
  const order = bandOrder(ids, means);
  let at = 0, dev = 0;
  for (const band of md.TERRAIN_BY_ELEVATION) {
    const end = Math.round(band.upTo * order.length), n = new Map();
    for (const id of order.slice(at, end)) { n.set(terrainOf.get(id), (n.get(terrainOf.get(id)) || 0) + 1); n.set(want.get(id), (n.get(want.get(id)) || 0) - 1); }
    for (const v of n.values()) dev += Math.abs(v);
    at = end;
  }
  return dev;
};
{
  const base = { picked: disc, adj: discAdj, landAfter: discLand, palette };
  const a = md.generatedTerrainTypes({ ...base, seed: 7 }), b = md.generatedTerrainTypes({ ...base, seed: 7 });
  ok(a.size === disc.length && [...a].every(([id, t]) => b.get(id) === t), "without elevationOf, the same seed gives the same world on two calls", { a: a.size, b: b.size });
  // each band's provinces, cut by the rank of the relief — averaged K times over the graph — exactly as the table is cut, carry
  // only that band's terrains
  const g = md.generatedTerrainTypes({ ...base, seed: 7, elevationOf: discElevation });
  const ids = disc.map(Number), averaged = smoothedOver(discElevation, discAdj, discLand, K);
  const strays = (terrainOf) => {
    const order = bandOrder(ids, averaged);
    let at = 0, bad = 0, where = "";
    for (const band of md.TERRAIN_BY_ELEVATION) {
      const end = Math.round(band.upTo * order.length);
      for (const id of order.slice(at, end)) if (!(band.mix[terrainOf.get(id)] > 0)) { bad++; if (!where) where = `province ${id} in the band up to ${band.upTo} is ${terrainOf.get(id)}`; }
      at = end;
    }
    return { bad, where };
  };
  const withIt = strays(g), without = strays(a);
  ok(g.size === disc.length && withIt.bad === 0, `⭐⭐ given elevationOf, every province carries a terrain of the band its relief puts it in, averaged with its neighbours' ${K} time(s)`, withIt);
  ok(without.bad > 0, `CONTROL: the random field puts ${without.bad} provinces in another band's terrain, so the check can tell`, without);
  // …exactly: the number of each terrain in each band is the table's. Cut by the relief unaveraged, it is not — so a province is
  // banded by its neighbourhood's ground, the patches the averaging is there for (#a-generated-mountain-stands-highest)
  const exact = bandDeviation(ids, averaged, g, 7), raw = bandDeviation(ids, discElevation, g, 7);
  ok(exact === 0, "⭐⭐ each band, cut by the averaged relief, holds exactly the terrains the table gives it", exact);
  ok(K > 0 && raw > 0, `CONTROL: cut by the relief as measured, unaveraged, the bands would be ${raw} terrains off the table`, { K, raw });
  // a province with no mean is left out of its neighbours' averages: it is not a height of 0 dragging them into lower bands
  const gap = idAt(32, 16), holed = new Map([...discElevation].filter(([id]) => id !== gap));
  const gh = md.generatedTerrainTypes({ ...base, seed: 7, elevationOf: holed });
  const asGap = bandDeviation(ids, smoothedOver(holed, discAdj, discLand, K), gh, 7);
  const asZero = bandDeviation(ids, smoothedOver(new Map([...holed, [gap, 0]]), discAdj, discLand, K), gh, 7);
  ok(discLand.has(gap) && gh.size === disc.length && asGap === 0, `⭐ a province with no mean (${gap}) is left out of its neighbours' averages, and the bands are the rest's`, asGap);
  ok(asZero > 0, `CONTROL: counted as a height of 0 it would move its neighbours ${asZero} terrains off the table, so the check can tell`, asZero);
  const top = md.TERRAIN_BY_ELEVATION[md.TERRAIN_BY_ELEVATION.length - 1].mix;
  const highest = bandOrder(ids, averaged)[ids.length - 1];
  ok(top[g.get(highest)] > 0, "the highest province of all is given a terrain of the highest band", { highest, terrain: g.get(highest) });

  // The function's own text, with its random field counted — a lift of the source, checked against the module's answer first.
  const SRC = fs.readFileSync(path.join(__dirname, "map-data.js"), "utf8").replace(/\r\n/g, "\n");
  const code = maskJsLiterals(SRC);
  const at = code.indexOf("function generatedTerrainTypes(");
  const body = at >= 0 ? jsBodyAt(code, at) : null;
  let text = body ? SRC.slice(at, body[1] + 1) : "";
  const anchor = "const field = () => {";
  ok(text.split(anchor).length === 2, "generatedTerrainTypes and its one random field were found in map-data.js", text.split(anchor).length - 1);
  text = text.replace(anchor, () => "const field = () => { __drawn.n++;");
  const names = ["TERRAIN_HOPS_FROM_SEA", "TERRAIN_FIELD_SMOOTHING", "TERRAIN_RELIEF_SMOOTHING", "TERRAIN_BY_ELEVATION", "TERRAIN_COAST_SHARE"];
  const __drawn = { n: 0 };
  const lifted = new Function("__drawn", ...names, text + "\nreturn generatedTerrainTypes;")(__drawn, ...names.map((k) => md[k]));
  const same = (p, q) => p.size === q.size && [...p].every(([id, t]) => q.get(id) === t);
  __drawn.n = 0; const liftedPlain = lifted({ ...base, seed: 7 }); const drawnPlain = __drawn.n;
  __drawn.n = 0; const liftedRelief = lifted({ ...base, seed: 7, elevationOf: discElevation }); const drawnRelief = __drawn.n;
  ok(same(liftedPlain, a) && same(liftedRelief, g), "CONTROL: the lifted text answers exactly what the module does, with the option and without");
  ok(drawnPlain === 2, "without elevationOf the random field is drawn twice, as it always was", drawnPlain);
  ok(drawnRelief === 1, "⭐ with it, once: the elevation path does not draw (or waste) a random field", drawnRelief);
}

console.log("\n-- ⭐ 3. on the world Generate land raises, mountains stand highest and plains lie flattest --");
/** The mod's provinces.bmp as province ids through its own definition.csv, row 0 at the top: the provinces Generate land left,
 *  read here without Nova's reader. */
const rasterOf = (mod) => {
  const byColour = new Map();
  for (const line of fs.readFileSync(path.join(mod, "map", "definition.csv"), "utf8").split(/\r?\n/)) {
    const c = line.split(";");
    if (c.length >= 4 && /^\d+$/.test(c[0]) && c[0] !== "0") byColour.set((+c[1] << 16) | (+c[2] << 8) | +c[3], +c[0]);
  }
  const b = fs.readFileSync(path.join(mod, "map", "provinces.bmp")), w = b.readInt32LE(18), h = b.readInt32LE(22), off = b.readUInt32LE(10), rs = Math.floor((24 * w + 31) / 32) * 4;
  const ids = new Int32Array(w * h).fill(-1);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const o = off + (h - 1 - y) * rs + x * 3, id = byColour.get((b[o + 2] << 16) | (b[o + 1] << 8) | b[o]); if (id != null) ids[y * w + x] = id; }
  return { W: w, H: h, ids };
};
const SEEDS = [1, 2, 3];
for (const seed of SEEDS) {
  const mod = makeMod("seed" + seed);
  const r = md.generateLand({ modRoot: mod, gameRoot: game, dependencyRoots: [], count: 700, provincesPerState: 8, seed, splitLargeProvinces: false });   // #a-raised-province-is-cut-to-land-size: not this test's subject — its fixture's cells are its provinces, and the cut would add more
  // #generate-land-fills-the-seas-it-cuts-off — the 700 asked for, less the picks it left sea to keep a cut-off sea open to the ocean
  // (#generate-land-leaves-no-sea-cut-off), plus the cut-off seas it raised with them: it reports both
  const filled = (r && r.inlandSeas && Number(r.inlandSeas.filled)) || 0, leftSea = (r && r.inlandSeas && (r.inlandSeas.leftSea || []).length) || 0;
  ok(r && r.changed && r.flippedProvinces === 700 - leftSea + filled, `seed ${seed}: Generate land raised 700 provinces, less the ${leftSea} it left sea, and the ${filled} sea provinces they cut off`, r && (r.error || { flipped: r.flippedProvinces, leftSea, filled }));
  if (!r || !r.changed) continue;
  ok(r.relief && r.relief.provinces === r.flippedProvinces && !r.relief.error && !r.relief.skipped, `seed ${seed}: the report says every raised province had its ground measured`, r.relief);
  // #a-generated-terrain-follows-the-latitude-below — the latitude below chooses with the relief now, so the pass after it is the
  // guard and has (here) nothing left to move: the report says the lift took part, and how many the pass moved
  ok(r.latitude && r.latitude.lifted === true && typeof r.latitude.moved === "number" && !r.latitude.error, `seed ${seed}: CONTROL: the latitude below took part in the choice, over the same read, and the pass after it ran (moved ${r.latitude && r.latitude.moved})`, r.latitude);
  // The wiring, exactly: a twin of the click's own choice — generatedTerrainTypes, then the latitude pass — handed the relief and the
  // latitude read here off the provinces.bmp Generate land left, the province graph it walks (which the raise does not change), the
  // land, the seed and the terrains it may write, must give every province the terrain the click wrote.
  const raised = landRows(mod), ids = [...raised.keys()], ras = rasterOf(mod), land = new Set(ids);
  const graph = md.provinceNeighbourGraph({ modRoot: mod, gameRoot: game, dependencyRoots: [], model: md.buildMapModel({ modRoot: mod, gameRoot: game, dependencyRoots: [] }) });
  const means = md.provinceReliefMeans({ W: ras.W, H: ras.H, ids: ras.ids, provinceIds: ids });
  const from = Object.keys((r.latitude && r.latitude.byTerrain) || {});
  ok(ids.length === r.flippedProvinces && means.size === ids.length && from.every((t) => !NORTH_MIX.includes(t)),
    `seed ${seed}: CONTROL: the land is the ${r.flippedProvinces} raised, each has a mean, and the latitude pass moved nothing but what the north has none of (${from})`, { land: ids.length, means: means.size, from });
  const latitudeOf = new Map();
  {
    const sumY = new Map(), n = new Map();
    for (let y = 0; y < ras.H; y++) for (let x = 0; x < ras.W; x++) { const id = ras.ids[y * ras.W + x]; if (land.has(id)) { sumY.set(id, (sumY.get(id) || 0) + y); n.set(id, (n.get(id) || 0) + 1); } }
    for (const id of ids) latitudeOf.set(id, (sumY.get(id) / n.get(id) + 0.5) / ras.H);
  }
  const writable = palette.filter((t) => Object.prototype.hasOwnProperty.call(md.TERRAIN_HOPS_FROM_SEA, t));
  const mix = md.terrainMixByLatitude({ modRoot: mod, gameRoot: game, dependencyRoots: [] });
  const twinOf = (elevationOf, lat) => {
    const t = md.generatedTerrainTypes({ picked: ids.map(String), adj: graph, landAfter: land, seed, palette: writable, elevationOf, latitudeOf: lat, latitudeMix: lat ? mix : null });
    if (lat) md.keepTerrainToItsLatitudes({ terrainOf: t, latitudeOf: lat, mix, adj: graph, palette: writable });
    return t;
  };
  const differ = (t) => ids.filter((id) => t.get(id) !== raised.get(id)).length;
  const dev = differ(twinOf(means, latitudeOf));
  ok(mix && dev === 0, `⭐⭐ seed ${seed}: the terrain written is exactly what the twin call gives the relief and the latitude read off the map Generate land left (${dev} of ${ids.length} differ)`, { dev });
  const upsideDown = md.provinceReliefMeans({ W: ras.W, H: ras.H, ids: (x, y) => ras.ids[(ras.H - 1 - y) * ras.W + x], provinceIds: ids });
  const devUpsideDown = differ(twinOf(upsideDown, latitudeOf));
  ok(devUpsideDown > 0, `seed ${seed}: CONTROL: handed the relief read upside down, the twin would give ${devUpsideDown} provinces another terrain, so a relief handed over wrong cannot pass`, devUpsideDown);
  const devFlat = differ(twinOf(means, null));
  ok(devFlat > 0, `seed ${seed}: CONTROL: chosen without the latitude below, the twin would give ${devFlat} provinces another terrain, so the latitude must be handed over too`, devFlat);
  const at = read8(path.join(mod, "map", "heightmap.bmp"));
  const by = new Map();
  for (const [id, t] of landRows(mod)) {
    let s = 0, q = 0, n = 0;
    for (let y = rowOf(id) * CELL; y < (rowOf(id) + 1) * CELL; y++) for (let x = colOf(id) * CELL; x < (colOf(id) + 1) * CELL; x++) { const h = at(x, y); s += h; q += h * h; n++; }
    const mean = s / n, sd = Math.sqrt(Math.max(0, q / n - mean * mean));
    const e = by.get(t) || { n: 0, mean: 0, sd: 0 };
    e.n++; e.mean += mean; e.sd += sd; by.set(t, e);
  }
  for (const e of by.values()) { e.mean /= e.n; e.sd /= e.n; }
  const said = [...by].sort((p, q) => q[1].mean - p[1].mean).map(([t, e]) => `${t} ${e.mean.toFixed(1)} sd ${e.sd.toFixed(1)} (${e.n})`).join(" · ");
  const M = by.get("mountain"), Hl = by.get("hills"), P = by.get("plains");
  ok(M && Hl && P && M.n >= 10 && Hl.n >= 10 && P.n >= 50, `seed ${seed}: the fixture: mountains, hills and plains enough to compare`, said);
  if (!(M && Hl && P)) continue;
  ok(M.mean > Hl.mean && Hl.mean > P.mean, `⭐⭐ seed ${seed}: mean height mountain > hills > plains — ${said}`, said);
  ok(P.sd < M.sd, `⭐ seed ${seed}: plains are flatter inside than mountains (sd ${P.sd.toFixed(2)} < ${M.sd.toFixed(2)})`, said);
}

try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) { /* scratch only */ }
console.log("\n" + (fail ? "FAILED " + fail + "/" + (pass + fail) : "PASSED " + pass + "/" + pass));
process.exitCode = fail ? 1 : 0;
