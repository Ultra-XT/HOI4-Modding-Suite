// ⛔ #a-generated-province-is-one-flat-texture — A GENERATED PROVINCE WAS ONE FLAT GROUND TEXTURE WITH A HARD EDGE.
//
// paintProvincesInTerrainBmp gave every raised pixel of a terrain ONE terrain.bmp index: this map's commonest, and on a world
// built after Delete map — where no land is left to vote — the FIRST index the table declares. 📊 TEST 31 against vanilla
// (wf-world/ground, 09-30): distinct indices per province 1.02 against 3.08; index changes that fall ON a province border
// 97.9% against 9.5%; provinces of 100 px or more painted one flat tile 100% against 6.4%; mountains painted index 6, which is
// 0.2% of vanilla's own mountain pixels. Vanilla's ground is a field laid over its provinces, not a fill of them.
//
// Now a land category the layer below has a mix for is painted from it: per terrain × latitude band × height tercile, sliced
// by a field, carried a few pixels over borders by a warp, with each province's commonest index its own terrain's.
//
// WHAT THIS FILE PINS (fixture-only, binds nothing):
//   1. the raised land carries the layer below's mix — shares, TILES per province, the height rule, its own terrain modal —
//      straight through the painter and through the sink the app calls;
//   2. no spawn_city, water or undeclared index is ever painted, and perm_snow only where the band below has it;
//   3. a small marsh flanked by forest stays marsh-modal, and the pixels that give way are the borrowed ones, then the deepest;
//      a province with nothing of its own terrain left is repaired with its mix's commonest index, not the first declared;
//   4. ask the mod first: its own index on many pixels, on few, and on none — and indices the layer below never paints, or
//      only the mod's own table declares: the mod's look is never dropped for the layer below's minority index;
//   5. a sink is what it always was, and does not even ASK the layer below;
//   6. the x = 0 seam: the field is one ring, and the warp borrows across it as across any border;
//   7. the same clicks give the same bytes after the caches are dropped;
//   8. an index means what each table says: one the mod's table — or an add-on's — gives another terrain is not carried over.
//
// ⚠️ The measuring kit below is the test's own code: a measurement that runs the writer's helpers cannot refute the writer.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const md = require("./map-data.js");

let pass = 0;
const fails = [];
const ok = (cond, label, detail) => {
  if (cond === true) { pass++; console.log("  ok   " + label); }
  else { fails.push(label); console.log("  FAIL " + label + (detail !== undefined ? "   -> " + JSON.stringify(detail).slice(0, 400) : "")); }
};
const tmps = [];
const mkdtemp = (tag) => { const d = fs.mkdtempSync(path.join(os.tmpdir(), "nova-ground-" + tag + "-")); tmps.push(d); return d; };
const sha = (buf) => crypto.createHash("sha1").update(buf).digest("hex");
// ⚠️ A back-out must BITE ON BEHAVIOUR, not throw on a missing export and take the rest of the file with it: a missing one is
// reported, and the checks that matter still run (the stand-ins are only there so they can).
const exported = (name, standIn) => { if (md[name] !== undefined) return md[name]; ok(false, `map-data exports ${name}`, typeof md[name]); return standIn; };
const GATE = exported("GROUND_MIX_MIN_GROUP", 4000), WARP = exported("GROUND_WARP_PX", 4);
const COUNTERS = exported("groundMixCounters", { asked: 0, learnt: 0 });

// ══ the table: every index with its type and atlas TILE, written into the fixture and read back from here ══════════════════
// ⚠️ The look is the TILE, not the index (G1-tiles): 6 and 11 share tile 11 as in vanilla, so a "mix" of the two is one look.
// The first-declared mountain is 6, as vanilla's is: the old fallback painted every generated mountain with it.
const TABLE = [
  { name: "plains_a", type: "plains", index: 0, tile: 1 },
  { name: "forest_a", type: "forest", index: 1, tile: 4 },
  { name: "mountain_twin", type: "mountain", index: 6, tile: 11 },
  { name: "plains_b", type: "plains", index: 5, tile: 0 },
  { name: "marsh_a", type: "marsh", index: 9, tile: 6 },
  { name: "mountain_mid", type: "mountain", index: 10, tile: 13 },
  { name: "mountain_high", type: "mountain", index: 11, tile: 11 },
  { name: "city", type: "urban", index: 13, tile: 10, extra: "spawn_city = yes" },
  { name: "ocean_a", type: "ocean", index: 15, tile: 9 },
  { name: "plains_snow", type: "plains", index: 19, tile: 2, extra: "perm_snow = yes" },
  { name: "mountain_low", type: "mountain", index: 20, tile: 7 },
  { name: "marsh_b", type: "marsh", index: 23, tile: 8 },
  { name: "plains_rare", type: "plains", index: 24, tile: 3 },
  { name: "hills_a", type: "hills", index: 2, tile: 5 },
  { name: "plains_mod_a", type: "plains", index: 25, tile: 12 },   // declared, never painted by any layer below here: a mod's own
  { name: "plains_mod_b", type: "plains", index: 26, tile: 14 },
];
const IDX = Object.fromEntries(TABLE.map((e) => [e.name, e.index]));
const P1 = IDX.plains_a, P2 = IDX.plains_b, PS = IDX.plains_snow, F1 = IDX.forest_a, K1 = IDX.marsh_a, K2 = IDX.marsh_b, HL = IDX.hills_a;
const M_LOW = IDX.mountain_low, M_MID = IDX.mountain_mid, M_HIGH = IDX.mountain_high, U = IDX.city, O = IDX.ocean_a, RARE = IDX.plains_rare;
const UNDECLARED = 99;
const typeOf = new Map(TABLE.map((e) => [e.index, e.type])), tileOf = new Map(TABLE.map((e) => [e.index, e.tile]));
const terrainTxtOf = (table) => "categories = {\n"
  + "\tocean = { is_water = yes naval_terrain = yes color = { 40 83 176 } }\n"
  + ["plains", "forest", "mountain", "marsh", "hills", "urban"].map((c) => `\t${c} = { color = { 100 120 140 } }`).join("\n") + "\n}\n"
  + "terrain = {\n" + table.map((e) => `\t${e.name} = { type = ${e.type} color = { ${e.index} } texture = ${e.tile}${e.extra ? " " + e.extra : ""} }`).join("\n") + "\n}\n";
const terrainTxt = terrainTxtOf(TABLE);
// A mod's own 00_terrain.txt: TABLE with some indices given another type (as Old World Blues re-types 19 of vanilla's), and
// rows only it declares — indices no layer below here declares at all, as a mod adds a texture of its own.
const tableWith = (add = [], retype = {}) => TABLE.map((e) => (retype[e.index] ? { ...e, type: retype[e.index] } : e)).concat(add);
const MINE = { index: 30, row: { name: "plains_mine", type: "plains", index: 30, tile: 15 } };
const MINE_B = { index: 32, row: { name: "plains_mine_b", type: "plains", index: 32, tile: 17 } };
const MINE_SNOW = { index: 31, row: { name: "plains_mine_snow", type: "plains", index: 31, tile: 16, extra: "perm_snow = yes" } };

// ══ the canvas: 512 x 512, a 16 x 16 grid of 32-px provinces — 8 latitude bands of 64 rows, two province rows each ══════════
const W = 512, H = 512, G = 32, N = W / G;
const BAND = H / md.LATITUDE_BANDS;
const idOf = (r, c) => r * N + c + 1;
const gridId = (x, y) => idOf(Math.floor(y / G), Math.floor(x / G));
const colourOf = (id) => [(id * 37) & 255, (id >> 3) & 255, 100 + (id % 7)];
// THE LAYER BELOW, by province row:
//   0-1 plains (band 0), snow on half its high ground · 2-3 plains (band 1) · 4-7 mountain (bands 2-3), its index BY HEIGHT ·
//   8-9 forest (band 4), one index · 10-11 marsh (band 5), two indices in patches · 12-15 sea, but for ONE small plains
//   province in band 6 (SMALL), painted all P2: far too few pixels for its band to speak, so a raise there takes the fallback.
const SMALL = { r: 12, c: 0 };
const belowTerrain = (r, c = -1) => (r <= 3 ? "plains" : r <= 7 ? "mountain" : r <= 9 ? "forest" : r <= 11 ? "marsh" : r === SMALL.r && c === SMALL.c ? "plains" : "ocean");
// Heights: three values in a fine pattern, 40% / 30% / 30%, so the thirds the learning cuts fall exactly between them.
const third = (x, y) => { const v = (x * 7 + y * 13) % 10; return v < 4 ? 0 : v < 7 ? 1 : 2; };
const PLAINS_H = [100, 104, 108], MOUNTAIN_H = [120, 140, 160], MOUNTAIN_IDX = [M_LOW, M_MID, M_HIGH];
const blockHash = (bx, by) => ((bx * 73856093) ^ (by * 19349663)) >>> 0;
const plainsPatch = (x, y) => (blockHash(x >> 3, y >> 3) % 5 === 0 ? P2 : P1);      // 8-px patches, a fifth of them P2
const marshPatch = (x, y) => (blockHash((x >> 3) + 7, y >> 3) % 2 === 0 ? K1 : K2);
// Indices that must never be painted, each in one band-1 plains province's interior, each above the floor of its group; one
// plains index on about 1% of the band's interior, under the floor; and round every band-1 plains province a 2-px ring of
// forest — a border blend, which is not what is painted INSIDE a plains province and must not be learnt as if it were.
const BLOB = { [idOf(2, 3)]: U, [idOf(2, 9)]: O, [idOf(3, 12)]: UNDECLARED };
const inBlob = (x, y) => { const lx = x % G, ly = y % G; return lx >= 4 && lx < 28 && ly >= 4 && ly < 28; };
const RARE_AT = idOf(3, 6), inRare = (x, y) => { const lx = x % G, ly = y % G; return lx >= 8 && lx < 23 && ly >= 8 && ly < 23; };
const onRing = (x, y) => { const lx = x % G, ly = y % G; return lx < 2 || lx >= G - 2 || ly < 2 || ly >= G - 2; };
function belowIndex(x, y) {
  const r = Math.floor(y / G), t = belowTerrain(r, Math.floor(x / G)), id = gridId(x, y);
  if (t === "plains") {
    if (r === SMALL.r) return P2;
    if (BLOB[id] !== undefined && inBlob(x, y)) return BLOB[id];
    if (id === RARE_AT && inRare(x, y)) return RARE;
    if ((r === 2 || r === 3) && onRing(x, y)) return F1;
    if (r <= 1 && third(x, y) === 2 && (x & 1)) return PS;
    return plainsPatch(x, y);
  }
  if (t === "mountain") return MOUNTAIN_IDX[third(x, y)];
  if (t === "forest") return F1;
  if (t === "marsh") return marshPatch(x, y);
  return O;
}
function belowHeight(x, y) {
  const t = belowTerrain(Math.floor(y / G), Math.floor(x / G));
  return t === "plains" ? PLAINS_H[third(x, y)] : t === "mountain" ? MOUNTAIN_H[third(x, y)] : t === "forest" ? 104 : t === "marsh" ? 98 : 89;
}

// ══ the kit: bitmaps written and read by this file alone ═══════════════════════════════════════════════════════════════════
const IRS = (W + 3) & ~3;
function bmp8(fn) {
  const isz = IRS * H, b = Buffer.alloc(54 + 1024 + isz);
  b.write("BM", 0, "ascii"); b.writeUInt32LE(b.length, 2); b.writeUInt32LE(54 + 1024, 10); b.writeUInt32LE(40, 14);
  b.writeInt32LE(W, 18); b.writeInt32LE(H, 22); b.writeUInt16LE(1, 26); b.writeUInt16LE(8, 28); b.writeUInt32LE(0, 30);
  b.writeUInt32LE(isz, 34); b.writeUInt32LE(256, 46); b.writeUInt32LE(256, 50);
  for (let i = 0; i < 256; i++) { const o = 54 + i * 4; b[o] = i; b[o + 1] = (i * 3) & 255; b[o + 2] = 255 - i; }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) b[54 + 1024 + (H - 1 - y) * IRS + x] = fn(x, y);
  return b;
}
function bmp24(idAt) {
  const rs = (W * 3 + 3) & ~3, b = Buffer.alloc(54 + rs * H);
  b.write("BM", 0, "ascii"); b.writeUInt32LE(b.length, 2); b.writeUInt32LE(54, 10); b.writeUInt32LE(40, 14);
  b.writeInt32LE(W, 18); b.writeInt32LE(H, 22); b.writeUInt16LE(1, 26); b.writeUInt16LE(24, 28); b.writeUInt32LE(rs * H, 34);
  for (let y = 0; y < H; y++) { let o = 54 + (H - 1 - y) * rs; for (let x = 0; x < W; x++) { const c = colourOf(idAt(x, y)); b[o++] = c[2]; b[o++] = c[1]; b[o++] = c[0]; } }
  return b;
}
const at8 = (buf, x, y) => buf[buf.readUInt32LE(10) + (H - 1 - y) * IRS + x];
const defRow = (id, type, terrain) => { const c = colourOf(id); return `${id};${c[0]};${c[1]};${c[2]};${type};false;${terrain};${type === "land" ? 1 : 0}`; };

/** A layer below — the game root a mod sits on — with its four map files and the table (`txt`, TABLE's by default). */
function makeBelow(tag, terrainAt, indexAt, heightAt, txt = terrainTxt) {
  const d = mkdtemp(tag);
  fs.mkdirSync(path.join(d, "map"), { recursive: true });
  fs.mkdirSync(path.join(d, "common", "terrain"), { recursive: true });
  fs.writeFileSync(path.join(d, "common", "terrain", "00_terrain.txt"), txt);
  fs.writeFileSync(path.join(d, "map", "provinces.bmp"), bmp24(gridId));
  const rows = ["0;0;0;0;land;false;unknown;0"];
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) { const t = terrainAt(r, c); rows.push(defRow(idOf(r, c), t === "ocean" ? "sea" : "land", t)); }
  fs.writeFileSync(path.join(d, "map", "definition.csv"), rows.join("\n") + "\n");
  fs.writeFileSync(path.join(d, "map", "terrain.bmp"), bmp8(indexAt));
  fs.writeFileSync(path.join(d, "map", "heightmap.bmp"), bmp8(heightAt));
  return d;
}
const BELOW = makeBelow("below", belowTerrain, belowIndex, belowHeight);

/** A mod over BELOW: its own provinces.bmp (the grid, or `idAt`), a definition.csv in which every province is sea unless
 *  `land` (Map id → terrain) says otherwise, terrain.bmp painted `paint(x, y, id)` (ocean by default) and heightmap.bmp
 *  `height(x, y, id)`; with `table`, its own common/terrain/00_terrain.txt, which replaces the layer below's. */
function makeMod(tag, { land = new Map(), idAt = gridId, paint = null, height = null, extraIds = [], table = null } = {}) {
  const d = mkdtemp(tag);
  fs.mkdirSync(path.join(d, "map"), { recursive: true });
  fs.writeFileSync(path.join(d, "descriptor.mod"), `name="${tag}"\n`);
  if (table) { fs.mkdirSync(path.join(d, "common", "terrain"), { recursive: true }); fs.writeFileSync(path.join(d, "common", "terrain", "00_terrain.txt"), terrainTxtOf(table)); }
  fs.writeFileSync(path.join(d, "map", "provinces.bmp"), bmp24(idAt));
  const rows = ["0;0;0;0;land;false;unknown;0"];
  for (const id of [...Array.from({ length: N * N }, (_, i) => i + 1), ...extraIds]) rows.push(defRow(id, land.has(id) ? "land" : "sea", land.get(id) || "ocean"));
  fs.writeFileSync(path.join(d, "map", "definition.csv"), rows.join("\n") + "\n");
  fs.writeFileSync(path.join(d, "map", "terrain.bmp"), bmp8((x, y) => { const id = idAt(x, y); const v = paint ? paint(x, y, id) : undefined; return v === undefined ? O : v; }));
  fs.writeFileSync(path.join(d, "map", "heightmap.bmp"), bmp8((x, y) => { const id = idAt(x, y); return height ? height(x, y, id) : (land.has(id) ? 106 : 89); }));
  return { d, idAt };
}
/** The painter, called as the sink calls it, on the pixels of `ids` (all of them crossed). */
function paint(mod, ids, below = BELOW, deps = []) {
  const want = new Set(ids), mask = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (want.has(mod.idAt(x, y))) mask[y * W + x] = 1;
  return md.paintProvincesInTerrainBmp({ modRoot: mod.d, gameRoot: below, dependencyRoots: deps, provinceIds: ids, crossed: { mask, W, H } });
}
/** province id → Map(index → px) of the mod's terrain.bmp now, over `ids`. */
function histograms(mod, ids) {
  const buf = fs.readFileSync(path.join(mod.d, "map", "terrain.bmp")), want = new Set(ids), out = new Map(ids.map((id) => [id, new Map()]));
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const id = mod.idAt(x, y); if (!want.has(id)) continue;
    const h = out.get(id), v = at8(buf, x, y); h.set(v, (h.get(v) || 0) + 1);
  }
  return out;
}
const modalOf = (h) => { let m = -1, b = -1; for (const [i, n] of h) if (n > b || (n === b && i < m)) { m = i; b = n; } return m; };
const tilesOf = (h) => new Set([...h.keys()].map((i) => (tileOf.has(i) ? tileOf.get(i) : -1000 - i)));
const sum = (h) => { let s = 0; for (const v of h.values()) s += v; return s; };
const pooled = (hists) => { const all = new Map(); for (const h of hists.values()) for (const [i, n] of h) all.set(i, (all.get(i) || 0) + n); return all; };
const keysOf = (h) => [...h.keys()].sort((a, b) => a - b).join(",");
const FORBIDDEN = new Set([U, O, UNDECLARED]);
let forbiddenSeen = 0;
const noteForbidden = (hists, raisedTerrainOf) => { for (const [id, h] of hists) if (raisedTerrainOf.get(id) !== "ocean") for (const [i, n] of h) if (FORBIDDEN.has(i)) forbiddenSeen += n; };

// ── the fixture can feed the gate: every band × tercile group the tests lean on is over GROUND_MIX_MIN_GROUP ────────────────
// (square interiors, 3 px in from every edge, which is fewer pixels than the learner's diamond — a lower bound)
{
  const interior = (G - 6) * (G - 6), provincesPerBand = 2 * N, smallestThird = 0.3;
  ok(provincesPerBand * interior * smallestThird >= GATE,
    `the fixture's smallest band × tercile group (${Math.floor(provincesPerBand * interior * smallestThird)} px) is over the gate (${GATE})`);
}

// ══ 1. the raised land carries the layer below's variety ═══════════════════════════════════════════════════════════════════
console.log("\n=== 1. raised land carries the layer below's mix: shares, tiles, the height rule, its own terrain modal ===");
const plainsTargets = [], mountainTargets = [];
for (let c = 0; c < N; c++) { plainsTargets.push(idOf(2, c), idOf(3, c)); mountainTargets.push(idOf(4, c), idOf(5, c)); }
const ROW2 = Array.from({ length: N }, (_, c) => idOf(2, c));   // a whole band-1 strip of plains, 512 x 32: no index left to one patch
{
  const land = new Map([...plainsTargets.map((id) => [id, "plains"]), ...mountainTargets.map((id) => [id, "mountain"])]);
  // heights as the raise would have written them: plains mid-ground, mountains a ramp over every province (110 → 170)
  const mod = makeMod("one", { land, height: (x, y, id) => (land.get(id) === "mountain" ? 110 + Math.round(((x % G) * 60) / (G - 1)) : land.has(id) ? 106 : 89) });
  const r = paint(mod, [...land.keys()]);
  ok(r.changed === true && !!r.ground, "the painter painted from a mix", r.ground || r.reason);
  ok(!!(r.ground && path.resolve(r.ground.from) === path.resolve(BELOW)), "…and says which layer it asked", r.ground);
  const hists = histograms(mod, [...land.keys()]);
  noteForbidden(hists, land);

  const belowBuf = fs.readFileSync(path.join(BELOW, "map", "terrain.bmp"));
  const countIn = (ids, idx) => ids.reduce((s, id) => s + (hists.get(id).get(idx) || 0), 0);
  ok(countIn(plainsTargets, P1) > 0 && countIn(plainsTargets, P2) > 0, "⭐⭐ the raised plains carry both of the layer below's plains indices",
    { P1: countIn(plainsTargets, P1), P2: countIn(plainsTargets, P2) });
  // the raised plains border only plains, mountain and sea: a forest index on them can only be the ring, learnt
  ok(countIn(plainsTargets, F1) === 0, "⭐⭐ the forest ring round the layer below's plains is a border blend, not plains ground: never learnt", countIn(plainsTargets, F1));
  ok(countIn(plainsTargets, RARE) === 0, `⭐⭐ an index on about 1% of its group, under the floor (${(100 * exported("GROUND_MIX_FLOOR", 0.02)).toFixed(0)}%), is never painted`, countIn(plainsTargets, RARE));
  // the band is the PIXEL's: band 1's plains below paint no snow, band 0's high ground is half snow, and these raised plains
  // stand at 106, high ground by the plains' own cuts — so snow here would be band 0's group answering for band 1
  ok(countIn(plainsTargets, PS) === 0, "⭐⭐ the band-1 raise carries no permanent snow: its own band below paints none (band 0's high ground does)", countIn(plainsTargets, PS));

  // TILES per province — the look, not the index: the layer below's own per-province count (its median province, over the
  // tiles of the terrain's own indices), less one, on every raised province; and as often as below, near enough, two or more
  const belowTiles = (terrain, rows) => {
    const counts = [];
    for (const r of rows) for (let c = 0; c < N; c++) {
      if (belowTerrain(r, c) !== terrain || BLOB[idOf(r, c)] !== undefined || idOf(r, c) === RARE_AT) continue;
      const t = new Set();
      for (let y = r * G; y < (r + 1) * G; y++) for (let x = c * G; x < (c + 1) * G; x++) { const v = at8(belowBuf, x, y); if (typeOf.get(v) === terrain) t.add(tileOf.get(v)); }
      counts.push(t.size);
    }
    counts.sort((p, q) => p - q);
    return { median: counts[Math.floor(counts.length / 2)], several: counts.filter((n) => n >= 2).length / counts.length };
  };
  for (const [terrain, ids, rows] of [["plains", plainsTargets, [2, 3]], ["mountain", mountainTargets, [4, 5]]]) {
    const below = belowTiles(terrain, rows), need = below.median - 1;   // the same rows, so the same latitude
    const tiles = ids.map((id) => tilesOf(hists.get(id)).size);
    const short = ids.filter((id, k) => tiles[k] < need);
    ok(need >= 1 && short.length === 0,
      `⭐⭐ every raised ${terrain} province shows at least ${need} atlas TILES (the layer below's per-province count, ${below.median}, less one)`, { need, short: short.slice(0, 5) });
    const several = tiles.filter((n) => n >= 2).length / tiles.length;
    ok(several >= below.several / 2,
      `⭐⭐ …and ${(100 * several).toFixed(0)}% of them show two tiles or more, against ${(100 * below.several).toFixed(0)}% of the layer below's (at least half as often)`, { several, below: below.several });
  }
  const mtTiles = mountainTargets.map((id) => tilesOf(hists.get(id)).size);
  ok(mtTiles.every((n) => n >= 3), "⭐⭐ …and every raised mountain shows all three of its tiles — low, mid and high ground", mtTiles.slice(0, 8));

  // the height rule, where no warp can reach: the index is the one the layer below paints at that height
  const hm = fs.readFileSync(path.join(mod.d, "map", "heightmap.bmp")), tb = fs.readFileSync(path.join(mod.d, "map", "terrain.bmp"));
  const reach = WARP + 1;
  let checked = 0, wrong = 0, firstWrong = null;
  for (let y = 4 * G + reach; y < 6 * G; y++) for (let x = 0; x < W; x++) {
    // out of the warp's reach of the plains above; sideways every neighbour is mountain too, and the sea below borrows nothing
    const h = at8(hm, x, y), v = at8(tb, x, y);
    const expect = h <= MOUNTAIN_H[0] ? M_LOW : h <= MOUNTAIN_H[1] ? M_MID : M_HIGH;
    checked++; if (v !== expect) { wrong++; if (!firstWrong) firstWrong = { x, y, h, v, expect }; }
  }
  ok(checked > 0 && wrong === 0, `⭐⭐⭐ a mountain pixel is painted with the index the layer below paints at its height (${checked} pixels checked)`, { wrong, firstWrong });

  const notOwn = [...hists].filter(([id, h]) => typeOf.get(modalOf(h)) !== land.get(id));
  ok(notOwn.length === 0, "⭐⭐ every raised province's commonest index is one its own terrain declares", notOwn.slice(0, 4).map(([id, h]) => [id, land.get(id), modalOf(h)]));
  ok(!!(r.byCategory && r.byCategory.plains && typeOf.get(r.byCategory.plains.index) === "plains" && r.byCategory.plains.indices && r.byCategory.plains.indices[P2] > 0),
    "…and the report keeps `.index` (its own terrain's commonest) beside every index it painted", r.byCategory);
}

// ── the SHARE, over the whole canvas: a field slices a mix exactly only over the area its ranks were taken on ──────────────
// 📊 Over one band strip (512 x 64) the field's top fifth covers 24% ± 6.4 points from one realisation to the next; over the
// whole canvas, ± 0.2 (probe-share-spread, 16 salts). So the share is pinned where it is a property of the painter, not of
// one realisation: a layer below that is plains everywhere, in the same 80 / 20 patches, under a mod that raises all of it.
console.log("\n=== 1a. …at the layer below's share, over the whole canvas ===");
{
  const uniform = makeBelow("uniform", () => "plains", plainsPatch, (x, y) => PLAINS_H[third(x, y)]);
  const all = Array.from({ length: N * N }, (_, i) => i + 1);
  const land = new Map(all.map((id) => [id, "plains"]));
  const mod = makeMod("share", { land, height: (x, y) => PLAINS_H[third(x, y)] });
  const r = paint(mod, all, uniform);
  ok(r.changed === true && !!(r.ground && r.ground.provinces === all.length), "every province of the canvas was painted from the mix", r.ground || r.reason);
  const ub = fs.readFileSync(path.join(uniform, "map", "terrain.bmp")), tb = fs.readFileSync(path.join(mod.d, "map", "terrain.bmp"));
  let b1 = 0, b2 = 0, g1 = 0, g2 = 0, other = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const u = at8(ub, x, y), v = at8(tb, x, y);
    if (u === P1) b1++; else if (u === P2) b2++;
    if (v === P1) g1++; else if (v === P2) g2++; else other++;
  }
  const want = b2 / (b1 + b2), got = g2 / ((g1 + g2) || 1);
  ok(b1 > 0 && b2 > 0 && other === 0 && Math.abs(got - want) <= 0.06,
    `⭐⭐⭐ the raised canvas carries the second plains index at the layer below's share, ±6 points (below ${(100 * want).toFixed(1)}%, raised ${(100 * got).toFixed(1)}%)`, { want, got, other });
}

// ── …and through the sink the app calls: heights written by the raise, then the painter reads them ──────────────────────
console.log("\n=== 1b. …through sinkProvincesInHeightmap, as Generate land raises it ===");
{
  const ids = plainsTargets.slice();   // the 32 plains provinces of band 1, so the two indices are not left to one realisation
  const land = new Map(ids.map((id) => [id, "plains"]));
  const mod = makeMod("sinkraise", { land, height: () => 89 });   // still under water: the rows say land, the raise lifts it
  const r = md.sinkProvincesInHeightmap({ modRoot: mod.d, gameRoot: BELOW, dependencyRoots: [], provinceIds: ids, raise: true });
  ok(r.changed === true && !!(r.terrain && r.terrain.changed), "the raise ran and repainted terrain.bmp", r.terrain);
  ok(!!(r.terrain && r.terrain.ground && r.terrain.ground.provinces === ids.length), "⭐⭐ …every raised province from the layer below's mix", r.terrain && r.terrain.ground);
  const hists = histograms(mod, ids);
  noteForbidden(hists, land);
  const all = new Map();
  for (const h of hists.values()) for (const [i, n] of h) all.set(i, (all.get(i) || 0) + n);
  ok((all.get(P1) || 0) > 0 && (all.get(P2) || 0) > 0, "⭐⭐ …and the raised plains carry both plains indices", [...all]);
}

// ══ 2. never a forbidden index; perm_snow only where the band below has it ═════════════════════════════════════════════════
console.log("\n=== 2. no spawn_city, water or undeclared index; permanent snow only from its own band ===");
{
  // band 5 has no plains below at all, so its raise falls back to every band's plains — which includes band 0's snow
  const north = [idOf(0, 4), idOf(0, 5)], south = [idOf(10, 4), idOf(10, 5)];
  const land = new Map([...north, ...south].map((id) => [id, "plains"]));
  const mod = makeMod("snow", { land, height: (x, y, id) => (land.has(id) ? 110 : 89) });   // high ground, where band 0 has its snow
  paint(mod, [...land.keys()]);
  const hists = histograms(mod, [...land.keys()]);
  noteForbidden(hists, land);
  const snowIn = (ids) => ids.reduce((s, id) => s + (hists.get(id).get(PS) || 0), 0);
  ok(snowIn(north) > 0, `CONTROL: a band-0 raise on high ground does carry the layer below's snow (${snowIn(north)} px) — the fixture can tell`, snowIn(north));
  ok(snowIn(south) === 0, "⭐⭐⭐ a band-5 raise carries NO permanent snow: a fallback group never paints it", { snow: snowIn(south), mix: south.map((id) => [...hists.get(id)]) });
}
{
  // band 6's only plains below is SMALL, painted all P2 on far fewer pixels than the gate: its band does not speak, every band does
  const ids = [1, 2, 3, 4].map((k) => idOf(SMALL.r, SMALL.c + k)), land = new Map(ids.map((id) => [id, "plains"]));
  const mod = makeMod("small", { land });
  paint(mod, ids);
  const hists = histograms(mod, ids);
  noteForbidden(hists, land);
  const all = new Map();
  for (const h of hists.values()) for (const [i, n] of h) all.set(i, (all.get(i) || 0) + n);
  ok((all.get(P1) || 0) > 0,
    `⭐⭐ a band whose own plains are under the gate (${(G - 6) * (G - 6)} px of ${GATE}, all P2) takes every band's mix, P1 and all — not its one province's`, [...all]);
}

// ══ 3. the modal repair ════════════════════════════════════════════════════════════════════════════════════════════════════
console.log("\n=== 3. a small marsh flanked by forest stays marsh-modal ===");
{
  // a one-pixel strip of marsh through the middle of a forest province, forest on both sides: the warp borrows forest on most
  // of it, and forest is ONE index while marsh's own pixels split between two — so forest would be its commonest index
  const STRIP = N * N + 1, sx = 3 * G + 16;
  const idAt = (x, y) => (x === sx && Math.floor(y / G) === 8 ? STRIP : gridId(x, y));
  const forest = [idOf(8, 2), idOf(8, 3), idOf(8, 4)];
  const land = new Map([...forest.map((id) => [id, "forest"]), [STRIP, "marsh"]]);
  const mod = makeMod("marsh", { land, idAt, extraIds: [STRIP], height: (x, y, id) => (id === STRIP ? 98 : land.has(id) ? 104 : 89) });
  const r = paint(mod, [...land.keys()]);
  const h = histograms(mod, [STRIP]).get(STRIP);
  noteForbidden(new Map([[STRIP, h]]), land);
  const foreign = (h.get(F1) || 0);
  ok(foreign > 0, `CONTROL: the warp did paint forest into the strip (${foreign} of ${sum(h)} px) — there was something to repair`, [...h]);
  ok(typeOf.get(modalOf(h)) === "marsh", "⭐⭐⭐ …and the strip's commonest index is still a MARSH one", { modal: modalOf(h), mix: [...h], repaired: r.ground && r.ground.repaired });
}
{
  // WHICH pixels give way. A layer below whose marsh is mostly a FOREST index (as vanilla's mountains carry a desert one), so a
  // raised marsh province is forest-modal by its own mix and must be repaired; ringed by hills, whose ground the warp carries in
  // over its edge. The pixels the warp borrowed give way first — the flow from next door, not the province's own mix — and
  // then the deepest, so what is left of the foreign index lies along the edge, where the eye reads it as a blend.
  const FOREIGN = { r: 2, c: 6 };
  const below = makeBelow("foreign", (r) => (r <= 7 ? "marsh" : "hills"),
    (x, y) => (Math.floor(y / G) > 7 ? HL : (blockHash(x >> 2, y >> 2) % 20 < 14 ? F1 : blockHash(x >> 2, (y >> 2) + 5) % 2 ? K1 : K2)),
    (x, y) => (Math.floor(y / G) > 7 ? 110 : 98));
  const target = idOf(FOREIGN.r, FOREIGN.c), ring = [];
  for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) if (dr || dc) ring.push(idOf(FOREIGN.r + dr, FOREIGN.c + dc));
  const land = new Map([[target, "marsh"], ...ring.map((id) => [id, "hills"])]);
  const mod = makeMod("repairorder", { land, paint: (x, y, id) => (land.get(id) === "hills" ? HL : undefined), height: (x, y, id) => (land.has(id) ? 98 : 89) });
  const r = paint(mod, [target], below);
  const g = r.ground || {};
  noteForbidden(histograms(mod, [target]), land);
  const buf = fs.readFileSync(path.join(mod.d, "map", "terrain.bmp"));
  // the province's own depth map, by this file's own walk: 0 on its edge, one more each 4-neighbour step in
  const x0 = FOREIGN.c * G, y0 = FOREIGN.r * G, depth = (x, y) => Math.min(x - x0, x0 + G - 1 - x, y - y0, y0 + G - 1 - y);
  const byDepth = new Map();   // depth → { px, forest }
  let hillsLeft = 0;
  for (let y = y0; y < y0 + G; y++) for (let x = x0; x < x0 + G; x++) {
    const v = at8(buf, x, y), d = depth(x, y);
    if (!byDepth.has(d)) byDepth.set(d, { px: 0, forest: 0 });
    byDepth.get(d).px++;
    if (v === F1) byDepth.get(d).forest++;
    if (v === HL) hillsLeft++;
  }
  ok(g.repaired > 0 && g.borrowed > 0 && g.repaired >= g.borrowed,
    `CONTROL: the province was repaired (${g.repaired} px) and the warp had borrowed hills into it (${g.borrowed} px), fewer than the repair`, g);
  ok(hillsLeft === 0, "⭐⭐ the borrowed pixels gave way first: not one pixel of the hills' ground is left inside the repaired marsh", { hillsLeft, g });
  // the repair past the borrowed pixels is deepest first, so every ring whose pixels all fit in it is cleared of the forest index
  const deepest = [...byDepth.keys()].sort((a, b) => b - a);
  let room = g.repaired - g.borrowed, cleared = [];
  for (const d of deepest) { if (byDepth.get(d).px > room) break; room -= byDepth.get(d).px; cleared.push(d); }
  const forestLeft = cleared.reduce((s, d) => s + byDepth.get(d).forest, 0);
  ok(cleared.length >= 2 && forestLeft === 0,
    `⭐⭐ …then the deepest: the ${cleared.length} innermost rings, which the rest of the repair covers, hold no forest index`, { cleared, forestLeft, rings: [...byDepth].sort((a, b) => b[0] - a[0]).slice(0, 6) });
}
{
  // NOTHING OF ITS OWN LEFT. A mountain province of one pixel, which the warp carries into the plains round it: no pixel of it
  // was given a mountain index, so the repair has none of the province's own to keep. It must take the mountain MIX's commonest
  // — not the first index the table declares, which on a world after Delete map (no mountain left to vote) is vanilla's
  // mountain 6, 0.2% of its own mountains. The pixel is found by the field (any one the warp moves); the control says it was.
  const fieldOf = exported("groundPatchField", null);
  let spot = null;
  if (fieldOf) { const f = fieldOf(W, H); for (let c = 0; c < N && !spot; c++) { const x = c * G + 16, y = 2 * G + 16, [dx, dy] = f.warp(x, y); if (dx || dy) spot = { x, y }; } }
  const ONE = N * N + 2, at = spot || { x: 16, y: 2 * G + 16 };
  const idAt = (x, y) => (x === at.x && y === at.y ? ONE : gridId(x, y));
  const round = gridId(at.x, at.y), land = new Map([[ONE, "mountain"], [round, "plains"]]);
  const mod = makeMod("onepixel", { land, idAt, extraIds: [ONE], paint: (x, y, id) => (id === round ? P1 : undefined), height: (x, y, id) => (id === ONE ? 150 : land.has(id) ? 106 : 89) });
  const r = paint(mod, [ONE]);
  // the answers, derived: the commonest mountain index the layer below paints its mountains with, and the table's first one
  const belowBuf = fs.readFileSync(path.join(BELOW, "map", "terrain.bmp")), mt = new Map();
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (belowTerrain(Math.floor(y / G), Math.floor(x / G)) === "mountain") { const v = at8(belowBuf, x, y); if (typeOf.get(v) === "mountain") mt.set(v, (mt.get(v) || 0) + 1); }
  const commonest = modalOf(mt), first = TABLE.find((e) => e.type === "mountain").index;
  const g = r.ground || {}, got = at8(fs.readFileSync(path.join(mod.d, "map", "terrain.bmp")), at.x, at.y);
  ok(!!spot && g.provinces === 1 && g.borrowed === 1 && g.repaired === 1 && commonest !== first,
    `CONTROL: the one pixel was borrowed from the plains and repaired, and the mix's commonest mountain index (${commonest}) is not the first declared (${first})`, { spot, g });
  ok(got === commonest, `⭐⭐ a province with nothing of its own left is repaired with its mix's commonest index (${commonest}), not the table's first (${first})`, { got });
}

// ══ 4. ask the mod first ═══════════════════════════════════════════════════════════════════════════════════════════════════
console.log("\n=== 4. ask the mod first: its own index on many pixels, on few, and on none ===");
{
  const run = (tag, ownPlains, targets = [idOf(2, 8), idOf(2, 9), idOf(2, 10), idOf(2, 11)], ownIndex = () => P2) => {
    const land = new Map([...targets.map((id) => [id, "plains"]), ...ownPlains.map((id) => [id, "plains"])]);
    const own = new Set(ownPlains);
    const mod = makeMod(tag, { land, paint: (x, y, id) => (own.has(id) ? ownIndex(x, y) : undefined) });
    paint(mod, targets);
    const hists = histograms(mod, targets);
    noteForbidden(hists, land);
    const all = new Map();
    for (const h of hists.values()) for (const [i, n] of h) all.set(i, (all.get(i) || 0) + n);
    return all;
  };
  // the mod's own plains, painted P2 only — on more pixels than the gate, and on fewer
  const many = [], few = [idOf(3, 0)];
  for (let c = 0; many.length * G * G < GATE * 1.5; c++) many.push(idOf(3, c));
  ok(many.length * G * G >= GATE && few.length * G * G < GATE,
    `the fixture's own plains: ${many.length * G * G} px (over the gate) and ${few.length * G * G} px (under it)`);
  // (c) raises all 32 band-1 plains provinces, so that both indices showing is the mix's doing, not one realisation's
  const a = run("askmany", many), b = run("askfew", few), c = run("asknone", [], plainsTargets);
  ok(a.size === 1 && a.has(P2), "⭐⭐⭐ (a) the mod paints its plains with the second index on many pixels: the raised plains are all that index", [...a]);
  ok(b.size === 1 && b.has(P2), "⭐⭐⭐ (b) …and on a few pixels, still all that index — a small mod keeps its own look (G1-small)", [...b]);
  ok((c.get(P1) || 0) > 0 && (c.get(P2) || 0) > 0, "⭐⭐ (c) a mod that paints no plains gets the layer below's mix, both indices", [...c]);
  // …and with indices of its OWN, which the layer below never paints its plains with: there is nothing below to reweight
  const OWN_A = IDX.plains_mod_a, OWN_B = IDX.plains_mod_b;
  const ownPatch = (x, y) => (blockHash(x >> 3, (y >> 3) + 11) % 10 < 7 ? OWN_A : OWN_B);
  const d = run("askownmany", many, undefined, ownPatch), e = run("askownfew", few, undefined, () => OWN_A);
  ok(d.size === 2 && d.has(OWN_A) && d.has(OWN_B),
    "⭐⭐ (d) on many pixels, the mod's own two indices ARE the mix — both of them, not its commonest alone and not the layer below's", [...d]);
  ok(e.size === 1 && e.has(OWN_A),
    "⭐⭐ (e) on a few pixels, its one own index: restricted to nothing the layer below paints, the province keeps the single index the mod votes for", [...e]);

  // …and when the mod's look is MOSTLY an index the layer below cannot place, and a little of one it can (review of b7a2b703:
  // the raise painted the minority index alone, where the batch base had kept the mod's own). The mod's own plains, with a 2-px
  // forest ring at their edges as a painted map has; a whole strip of plains raised. The mod's look is every index its OWN table
  // declares as plains and paints them with — never a perm_snow one, which needs its band — and the raise must carry exactly
  // that set, commonest first as the mod paints it. The ring is another terrain's bleed and is not the mod's plains.
  const askOwn = (tag, ownIndex, { table = null, ring = true, below = BELOW } = {}) => {
    const own = new Set(many), land = new Map([...ROW2, ...many].map((id) => [id, "plains"]));
    const mod = makeMod(tag, { land, table, paint: (x, y, id) => (own.has(id) ? (ring && onRing(x, y) ? F1 : ownIndex(x, y)) : undefined) });
    paint(mod, ROW2, below);
    const raisedHists = histograms(mod, ROW2), mine = pooled(histograms(mod, many));
    noteForbidden(raisedHists, land);
    const declared = new Map((table || TABLE).map((t) => [t.index, t]));
    const look = new Map([...mine].filter(([i]) => declared.has(i) && declared.get(i).type === "plains" && !/perm_snow/.test(declared.get(i).extra || "")));
    return { raised: pooled(raisedHists), look, lookShare: Math.min(...[...look.values()]) / sum(look) };
  };
  const ninety = (major) => (x, y) => (blockHash((x >> 3) + 3, (y >> 3) + 9) % 10 === 0 ? P1 : major);
  // (h) has no ring, so nothing in the mod's plains is an index the layer below's table declares: the batch base then took the
  // mod for one that paints no plains at all, and raised them with the layer below's P1 and P2 (the review's case C).
  // (l) is the layer below that paints its plains 80 / 20 with P1 and P2 and calls P2 HILLS — as vanilla paints a little of its
  // plains with its desert 3, which Old World Blues' own table calls plains, its commonest plains index. This mod's table calls
  // P2 plains and paints its plains mostly with it: the layer below paints P2 there but does not MEAN plains by it, so it cannot
  // place it for this mod, and P2 is the mod's own — not dropped as if the layer below had spoken for it.
  const p2Hills = makeBelow("p2hills", belowTerrain, belowIndex, belowHeight, terrainTxtOf(tableWith([], { [P2]: "hills" })));
  const cases = [
    ["(f) mostly an index only the mod's own table declares, a little of the layer below's P1", askOwn("askmine", ninety(MINE.index), { table: tableWith([MINE.row]) })],
    ["(g) mostly an index both tables declare and the layer below never paints, a little P1", askOwn("askunpainted", ninety(IDX.plains_mod_a))],
    ["(h) only indices of its own, one of them perm_snow", askOwn("askminesnow", (x, y) => (blockHash(x >> 3, (y >> 3) + 5) % 4 === 0 ? MINE_SNOW.index : MINE.index), { table: tableWith([MINE.row, MINE_SNOW.row]), ring: false })],
    ["(l) mostly an index the layer below paints its plains with as another terrain's, a little P1", askOwn("askretyped", ninety(P2), { table: TABLE, below: p2Hills })],
  ];
  // two checks a case: nothing past the mod's look (not the layer below's own indices), and all of it, commonest still commonest
  const carries = (what, k) => {
    const extra = [...k.raised.keys()].filter((i) => !k.look.has(i)), missing = [...k.look.keys()].filter((i) => !k.raised.has(i));
    ok(extra.length === 0, `⭐⭐⭐ ${what}: the raised plains carry nothing the mod does not paint its own plains with`, { extra, raised: [...k.raised], look: [...k.look] });
    ok(missing.length === 0 && modalOf(k.raised) === modalOf(k.look),
      `⭐⭐⭐ ${what.slice(0, 3)} …and all of the mod's look (${keysOf(k.look)}), its commonest (${modalOf(k.look)}) still commonest`, { missing, raised: [...k.raised], look: [...k.look] });
  };
  for (const [what, k] of cases) {
    ok(k.look.size >= 1 && k.lookShare >= 0.05, `CONTROL ${what.slice(0, 3)}: the mod's look is ${keysOf(k.look)}, each index at least 5% of it (far over the floor)`, [...k.look]);
    carries(what, k);
  }
  // (i) A TOTAL CONVERSION WITH ITS OWN TABLE (Old World Blues re-types 19 of vanilla's indices, and paints 0% of any terrain with
  // an index both tables agree on): every index the layer below paints its plains with means another terrain in this mod's table,
  // so the layer below cannot speak for its plains at all — but the mod paints them on more than the gate, in two indices of its
  // own. It keeps both, not one flat index.
  const tc = askOwn("askowntable", (x, y) => (blockHash(x >> 3, (y >> 3) + 7) % 10 < 7 ? MINE.index : MINE_B.index), { table: tableWith([MINE.row, MINE_B.row], { [P1]: "forest", [P2]: "hills" }) });
  ok(tc.look.size === 2 && tc.lookShare >= 0.05, `CONTROL (i): the mod's look is two indices of its own (${keysOf(tc.look)})`, [...tc.look]);
  carries("(i) a mod whose own table re-types every index the layer below paints its plains with", tc);
  {
    // (j) ON A FEW PIXELS THE MOD SAYS WHICH INDICES, NOT HOW MUCH OF EACH (G1-small): one province of plains, half P1 and half P2,
    // under the gate. The raised plains take the layer below's split of the two, not the one province's half and half.
    // …and the gate counts the mod's GROUND, not water: plains provinces left carrying the ocean index (one older Nova stroke left
    // 38.8% of a brush so) take the mod's plains over the gate by pixel count, and must not make its one province speak for them.
    const belowBuf = fs.readFileSync(path.join(BELOW, "map", "terrain.bmp"));
    let b1 = 0, b2 = 0;   // the layer below's own band-1 plains, P1 against P2
    for (let y = 2 * G; y < 4 * G; y++) for (let x = 0; x < W; x++) { const v = at8(belowBuf, x, y); if (v === P1) b1++; else if (v === P2) b2++; }
    const split = (h) => (h.get(P2) || 0) / (((h.get(P1) || 0) + (h.get(P2) || 0)) || 1);
    const want = b2 / (b1 + b2);
    const drowned = Array.from({ length: Math.ceil(GATE / (G * G)) - few.length }, (_, k) => idOf(3, few.length + k));
    for (const [what, wet] of [["(j)", []], ["(j2)", drowned]]) {
      const own = new Set(few), land = new Map([...ROW2, ...few, ...wet].map((id) => [id, "plains"]));
      const mod = makeMod("asksplit" + wet.length, { land, paint: (x, y, id) => (own.has(id) ? (blockHash(x >> 3, (y >> 3) + 13) % 2 ? P1 : P2) : wet.includes(id) ? O : undefined) });
      paint(mod, ROW2);
      const raised = pooled(histograms(mod, ROW2)), mine = pooled(histograms(mod, few)), all = sum(mine) + sum(pooled(histograms(mod, wet)));
      const theirs = split(mine), got = split(raised);
      ok(sum(mine) < GATE && Math.abs(theirs - want) >= 0.2 && (!wet.length || all >= GATE),
        `CONTROL ${what}: the mod's one province (${sum(mine)} px, under the gate) is ${(100 * theirs).toFixed(0)}% P2, the layer below's plains ${(100 * want).toFixed(0)}%${wet.length ? `; with ${wet.length} plains provinces of the ocean index its plains are ${all} px, over it` : ""}`, { theirs, want, all });
      ok(Math.abs(got - want) < Math.abs(got - theirs) && keysOf(raised) === keysOf(mine),
        `⭐⭐ ${what} …and the raised plains carry its two indices at the layer below's split (${(100 * got).toFixed(0)}% P2), not its own${wet.length ? " — water is not the mod's ground, and does not count to the gate" : ""}`, { got, want, theirs, raised: [...raised] });
    }
  }
  {
    // (k) THE STRUCTURE IS THE MAP BELOW'S, THE MIX THE MOD'S. The mod's own mountains, a whole row of them (over the gate),
    // painted as the layer below paints its own: three indices by height. Reweighting by the mod's shares must not flatten what
    // the layer below says about WHERE each index goes — a raised mountain pixel still takes the index painted at its height.
    const targets = [...mountainTargets], own = new Set(Array.from({ length: N }, (_, c) => idOf(7, c)));
    const land = new Map([...targets, ...own].map((id) => [id, "mountain"]));
    const mod = makeMod("askmountain", { land, paint: (x, y, id) => (own.has(id) ? MOUNTAIN_IDX[third(x, y)] : undefined),
      height: (x, y, id) => (own.has(id) ? MOUNTAIN_H[third(x, y)] : land.has(id) ? 110 + Math.round(((x % G) * 60) / (G - 1)) : 89) });
    paint(mod, targets);
    const hm = fs.readFileSync(path.join(mod.d, "map", "heightmap.bmp")), tb = fs.readFileSync(path.join(mod.d, "map", "terrain.bmp"));
    let checked = 0, wrong = 0, firstWrong = null;
    for (let y = 4 * G; y < 6 * G; y++) for (let x = 0; x < W; x++) {
      // rows 3 and 6 are this mod's sea, so nothing is borrowed into the raised rows: every pixel is the mountains' own pick
      const h = at8(hm, x, y), v = at8(tb, x, y), expect = h <= MOUNTAIN_H[0] ? M_LOW : h <= MOUNTAIN_H[1] ? M_MID : M_HIGH;
      checked++; if (v !== expect) { wrong++; if (!firstWrong) firstWrong = { x, y, h, v, expect }; }
    }
    ok(own.size * G * G >= GATE, `CONTROL (k): the mod's own mountains cover ${own.size * G * G} px, over the gate — the mod speaks`);
    ok(checked > 0 && wrong === 0, `⭐⭐⭐ (k) the mod speaking for its mountains keeps the height rule: every raised mountain pixel (${checked}) takes the index painted at its height`, { wrong, firstWrong });

    // (k2) …and where the layer below paints SEVERAL indices at one height, in proportions that change with height (low ground
    // mostly the low index, a little of the mid; high ground mostly the high), the reweight scales each by the mod's share and
    // keeps WHICH leads where: weighting a group by the mod's shares alone would paint every height with the mod's commonest.
    const slope = (x, y) => { const q = third(x, y), r = blockHash(x >> 2, (y >> 2) + 23) % 10; return q === 0 ? (r < 8 ? M_LOW : M_MID) : q === 1 ? (r < 6 ? M_MID : r < 8 ? M_LOW : M_HIGH) : (r < 8 ? M_HIGH : M_MID); };
    const slopes = makeBelow("slopes", belowTerrain, (x, y) => (belowTerrain(Math.floor(y / G), Math.floor(x / G)) === "mountain" ? slope(x, y) : belowIndex(x, y)), belowHeight);
    const mod2 = makeMod("askslopes", { land, paint: (x, y, id) => (own.has(id) ? slope(x, y) : undefined),
      height: (x, y, id) => (own.has(id) ? MOUNTAIN_H[third(x, y)] : land.has(id) ? 110 + Math.round(((x % G) * 60) / (G - 1)) : 89) });
    paint(mod2, targets, slopes);
    // the answers, derived from the layer below's own bitmaps: per height, the index it paints most there
    const tercileOf = (h) => (h <= MOUNTAIN_H[0] ? 0 : h <= MOUNTAIN_H[1] ? 1 : 2);
    const tally = (tbuf, hbuf, rows) => {
      const per = [new Map(), new Map(), new Map()];
      for (const r of rows) for (let y = r * G; y < (r + 1) * G; y++) for (let x = 0; x < W; x++) { const q = tercileOf(at8(hbuf, x, y)), v = at8(tbuf, x, y); per[q].set(v, (per[q].get(v) || 0) + 1); }
      return per;
    };
    const lead = tally(fs.readFileSync(path.join(slopes, "map", "terrain.bmp")), fs.readFileSync(path.join(slopes, "map", "heightmap.bmp")), [4, 5, 6, 7]).map(modalOf);
    const got = tally(fs.readFileSync(path.join(mod2.d, "map", "terrain.bmp")), fs.readFileSync(path.join(mod2.d, "map", "heightmap.bmp")), [4, 5]);
    const mixedAtEvery = got.every((h) => h.size >= 2), ownLead = modalOf(pooled(histograms(mod2, [...own])));
    ok(new Set(lead).size === 3 && mixedAtEvery && lead.some((i) => i !== ownLead),
      `CONTROL (k2): the layer below leads with ${lead.join(" / ")} at low / mid / high ground, the raised mountains mix two or more indices at every height, and the mod's own commonest (${ownLead}) is not every height's lead`, { lead, ownLead, got: got.map((h) => [...h]) });
    ok(got.every((h, q) => modalOf(h) === lead[q]),
      `⭐⭐⭐ (k2) …and at every height the raised mountains lead with the index the layer below leads with there`, { lead, got: got.map((h) => [...h]) });
  }
  {
    // (m) …AT THE MOD'S OWN SHARES. An index the layer below cannot place goes into each group at that group's part of the terrain,
    // as one it can place goes in by where the layer below paints it, so over a wide area each keeps the share the mod paints it
    // at. §1a's uniform layer below (plains everywhere, P1 and P2 in patches); the mod's own plains are its top two rows, mostly an
    // index only its own table declares and the rest P1; every other province raised. Over the whole canvas the field slices a
    // mix exactly (§1a), so P1's share of the raised plains is the mod's own, to §1a's six points.
    const uniform = makeBelow("uniform-own", () => "plains", plainsPatch, (x, y) => PLAINS_H[third(x, y)]);
    const own = new Set(), targets = [];
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) { if (r < 2) own.add(idOf(r, c)); else targets.push(idOf(r, c)); }
    const land = new Map([...own, ...targets].map((id) => [id, "plains"]));
    const mod = makeMod("askshare", { land, table: tableWith([MINE.row]), height: (x, y) => PLAINS_H[third(x, y)],
      paint: (x, y, id) => (own.has(id) ? (blockHash((x >> 3) + 1, (y >> 3) + 17) % 8 === 0 ? P1 : MINE.index) : undefined) });
    paint(mod, targets, uniform);
    const raised = pooled(histograms(mod, targets)), mine = pooled(histograms(mod, [...own]));
    const shareOf = (h) => (h.get(P1) || 0) / sum(h), want = shareOf(mine), got = shareOf(raised);
    ok(keysOf(mine) === keysOf(new Map([[P1, 1], [MINE.index, 1]])) && sum(mine) >= GATE && want >= 0.05,
      `CONTROL (m): the mod's own plains are P1 and its own index, ${sum(mine)} px (over the gate), ${(100 * want).toFixed(1)}% P1`, [...mine]);
    ok(keysOf(raised) === keysOf(mine) && Math.abs(got - want) <= 0.06,
      `⭐⭐⭐ (m) …and the raised plains carry the two at the mod's own shares, ±6 points (the mod ${(100 * want).toFixed(1)}% P1, raised ${(100 * got).toFixed(1)}%)`, { want, got, raised: [...raised] });
  }
}

// ══ 5. a sink is what it always was ════════════════════════════════════════════════════════════════════════════════════════
console.log("\n=== 5. a sink paints what it always painted, and never asks the layer below ===");
{
  const landIds = [idOf(2, 1), idOf(2, 2), idOf(2, 3)];
  const land = new Map(landIds.map((id) => [id, "plains"]));
  const mod = makeMod("sink", { land, paint: (x, y, id) => (land.has(id) ? P1 : undefined) });
  // it goes under: the row first, as every sink caller writes it, then the sink
  const def = path.join(mod.d, "map", "definition.csv");
  fs.writeFileSync(def, fs.readFileSync(def, "utf8").split("\n").map((l) => (l.split(";")[0] === String(landIds[1]) ? defRow(landIds[1], "sea", "ocean") : l)).join("\n"));
  const tbBefore = fs.readFileSync(path.join(mod.d, "map", "terrain.bmp")), hmBefore = fs.readFileSync(path.join(mod.d, "map", "heightmap.bmp"));
  const asked = COUNTERS.asked;
  const r = md.sinkProvincesInHeightmap({ modRoot: mod.d, gameRoot: BELOW, dependencyRoots: [], provinceIds: [landIds[1]], drowned: true });
  ok(r.changed === true && !!(r.terrain && r.terrain.changed), "the sink ran and repainted", r.terrain);
  ok(COUNTERS.asked === asked, "⭐⭐⭐ …and the layer below's mix was never even asked for", { before: asked, after: COUNTERS.asked });
  // the batch base's answer, derived: every pixel that crossed the waterline takes this map's ocean index, and nothing else moves
  const tbAfter = fs.readFileSync(path.join(mod.d, "map", "terrain.bmp")), hmAfter = fs.readFileSync(path.join(mod.d, "map", "heightmap.bmp"));
  const expected = Buffer.from(tbBefore);
  let crossed = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (at8(hmBefore, x, y) >= md.HEIGHTMAP_SEA_LEVEL && at8(hmAfter, x, y) < md.HEIGHTMAP_SEA_LEVEL) { expected[expected.readUInt32LE(10) + (H - 1 - y) * IRS + x] = O; crossed++; }
  }
  ok(crossed > 0 && Buffer.compare(expected, tbAfter) === 0, `⭐⭐⭐ terrain.bmp is byte for byte the old rule's answer (${crossed} crossed pixels to the ocean index, nothing else)`, { crossed, sha: [sha(expected), sha(tbAfter)] });
}

// ══ 6. the seam at x = 0 ═══════════════════════════════════════════════════════════════════════════════════════════════════
console.log("\n=== 6. the map wraps east-west, and so does the ground ===");
{
  const field = exported("groundPatchField", null);
  if (field) {
    const f = field(W, H);
    let seam = 0, inner = 0, ni = 0;
    for (let y = 0; y < H; y++) {
      seam += Math.abs(f.at(W - 1, y) - f.at(0, y));
      for (let x = 0; x < W - 1; x += 7) { inner += Math.abs(f.at(x + 1, y) - f.at(x, y)); ni++; }
    }
    seam /= H; inner /= ni;
    ok(seam <= 1.5 * inner, `⭐⭐ the field steps across the seam as it steps anywhere else (mean step ${seam.toFixed(4)} at the seam, ${inner.toFixed(4)} inside)`, { seam, inner });
  }
  // a column of plains at the east edge and a column of mountain at the west edge touch only across the seam: the warp must
  // borrow across it as it borrows across the mountain's other border with plains (eight provinces tall, so each border is
  // 256 px long and the two counts are not one short stretch of field each)
  const ROWS = [2, 3, 4, 5, 6, 7, 8, 9];
  const land = new Map();
  for (const r of ROWS) { land.set(idOf(r, N - 1), "plains"); land.set(idOf(r, 0), "mountain"); land.set(idOf(r, 1), "plains"); }
  const mod = makeMod("seam", { land, height: (x, y, id) => (land.get(id) === "mountain" ? 150 : land.has(id) ? 106 : 89) });
  paint(mod, [...land.keys()]);
  const tb = fs.readFileSync(path.join(mod.d, "map", "terrain.bmp"));
  const mountainIn = (x0, x1) => { let n = 0; for (let y = ROWS[0] * G; y < (ROWS[ROWS.length - 1] + 1) * G; y++) for (let x = x0; x < x1; x++) if (typeOf.get(at8(tb, x, y)) === "mountain") n++; return n; };
  const atSeam = mountainIn(W - WARP, W), atBorder = mountainIn(G, G + WARP);
  ok(atBorder > 0, `CONTROL: the plains east of the mountain borrow its ground across their shared border (${atBorder} px)`, atBorder);
  ok(atSeam > 0 && atSeam >= atBorder / 3 && atSeam <= atBorder * 3,
    `⭐⭐⭐ …and the plains WEST of it, across the seam, borrow it too, as much (${atSeam} px)`, { atSeam, atBorder });
}

// ══ 7. determinism across a cache drop ═════════════════════════════════════════════════════════════════════════════════════
console.log("\n=== 7. the same clicks give the same bytes after the caches are dropped ===");
{
  const ids = [idOf(2, 12), idOf(2, 13), idOf(4, 12), idOf(4, 13)];
  const land = new Map([[ids[0], "plains"], [ids[1], "plains"], [ids[2], "mountain"], [ids[3], "mountain"]]);
  const height = (x, y, id) => (land.get(id) === "mountain" ? 110 + Math.round(((x % G) * 60) / (G - 1)) : land.has(id) ? 106 : 89);
  const a = makeMod("detA", { land, height }), b = makeMod("detB", { land, height });
  paint(a, ids);
  const learnt = COUNTERS.learnt;
  md.clearMapLayerCache();
  paint(b, ids);
  ok(COUNTERS.learnt === learnt + 1, "the drop really dropped it: the layer below was learnt again", { before: learnt, after: COUNTERS.learnt });
  const ha = sha(fs.readFileSync(path.join(a.d, "map", "terrain.bmp"))), hb = sha(fs.readFileSync(path.join(b.d, "map", "terrain.bmp")));
  ok(ha === hb, "⭐⭐ …and the same raise painted the same bytes", { ha, hb });
  // the cache: kept while the layer below's four files stand still, dropped the moment one of them is rewritten
  const c = makeMod("detC", { land, height });
  paint(c, ids);
  ok(COUNTERS.learnt === learnt + 1, "⭐⭐ a third raise on the same layer below learns nothing again — the walk is cached", { before: learnt + 1, after: COUNTERS.learnt });
  const restamp = makeBelow("restamp", belowTerrain, belowIndex, belowHeight);
  paint(makeMod("detD", { land, height }), ids, restamp);
  const tPath = path.join(restamp, "map", "terrain.bmp"), tBuf = fs.readFileSync(tPath);
  tBuf[tBuf.readUInt32LE(10) + (H - 1 - (2 * G + 16)) * IRS + 16] = P2;   // one pixel of a plains interior: same size, new bytes
  fs.writeFileSync(tPath, tBuf);
  const before = COUNTERS.learnt;
  paint(makeMod("detE", { land, height }), ids, restamp);
  ok(COUNTERS.learnt === before + 1, "⭐⭐ …and a layer below whose terrain.bmp was rewritten is learnt afresh, not served from the cache", { before, after: COUNTERS.learnt });
}

// ══ 8. an index means what each table says ══════════════════════════════════════════════════════════════════════════════════
console.log("\n=== 8. an index the mod's own table — or an add-on's — gives another terrain is not carried over ===");
{
  // The layer below paints its plains 80 / 20 with P1 and P2, and its table says both are plains. Old World Blues re-types 19 of
  // vanilla's indices; carried over by number, the layer below's plains paint a mod's plains with what ITS table calls hills —
  // on a copy of OWB with the same-type rule backed out, raised mountains came out 23% OWB's hills (review of b7a2b703).
  // So the mod says P2 is hills, by its own 00_terrain.txt, or through an add-on's: one dependency carries the map the ground is
  // learnt from and no table, the one loaded above it carries the table and no map. The table the learnt indices MEANT is the
  // map's own (what loads under it), not the add-on's above it.
  const land = new Map(ROW2.map((id) => [id, "plains"]));
  const raise = (tag, table, deps = []) => {
    const mod = makeMod(tag, { land, table });
    const r = paint(mod, ROW2, BELOW, deps);
    return { r, all: pooled(histograms(mod, ROW2)) };
  };
  const hills = tableWith([], { [P2]: "hills" });
  const same = raise("typedsame", TABLE), retyped = raise("typedhills", hills);
  ok((same.all.get(P2) || 0) > 0, `CONTROL: a mod shipping a table that agrees with the layer below's carries P2 in its raised plains (${same.all.get(P2) || 0} px)`, [...same.all]);
  ok((retyped.all.get(P2) || 0) === 0 && (retyped.all.get(P1) || 0) > 0,
    "⭐⭐⭐ a mod whose own table says P2 is HILLS: its raised plains never carry P2, and still carry the layer below's P1", [...retyped.all]);
  const dep = (tag, table) => {
    const d = mkdtemp(tag);
    if (table) { fs.mkdirSync(path.join(d, "common", "terrain"), { recursive: true }); fs.writeFileSync(path.join(d, "common", "terrain", "00_terrain.txt"), terrainTxtOf(table)); }
    else { fs.mkdirSync(path.join(d, "map"), { recursive: true }); for (const f of ["provinces.bmp", "definition.csv", "terrain.bmp", "heightmap.bmp"]) fs.copyFileSync(path.join(BELOW, "map", f), path.join(d, "map", f)); }
    return d;
  };
  const mapDep = dep("dep-map", null);   // dependencyRoots run lowest first: the map's dependency, then the table's above it
  const viaSame = raise("addonsame", null, [mapDep, dep("dep-table-same", TABLE)]), viaHills = raise("addonhills", null, [mapDep, dep("dep-table-hills", hills)]);
  const fromDep = (x) => !!(x.r.ground && path.resolve(x.r.ground.from) === path.resolve(mapDep));
  ok(fromDep(viaSame) && (viaSame.all.get(P2) || 0) > 0,
    `CONTROL: an add-on over a dependency's map learns from that dependency, and with a table that agrees carries P2 (${viaSame.all.get(P2) || 0} px)`, { from: viaSame.r.ground && viaSame.r.ground.from, all: [...viaSame.all] });
  ok(fromDep(viaHills) && (viaHills.all.get(P2) || 0) === 0 && (viaHills.all.get(P1) || 0) > 0,
    "⭐⭐⭐ …and when a dependency loaded ABOVE the map's says P2 is hills, the raised plains never carry P2: the map's indices meant its own table's", { from: viaHills.r.ground && viaHills.r.ground.from, all: [...viaHills.all] });
}

// every raise above, the forbidden indices counted as they went
ok(forbiddenSeen === 0, "⭐⭐⭐ not one pixel of any raise above is a spawn_city, water or undeclared index", forbiddenSeen);

for (const d of tmps) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) { /* a temp dir */ } }
console.log(`\n=== generated ground carries the layer below's variety: ${pass + fails.length} checks, ${fails.length} failed ===`);
if (fails.length) { for (const f of fails) console.log("  - " + f); process.exit(1); }
