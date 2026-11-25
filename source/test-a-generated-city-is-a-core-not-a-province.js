// ⛔ #a-generated-city-is-a-core-not-a-province — A GENERATED CITY IS A TOWN IN THE MIDDLE OF ITS PROVINCE, NOT A BLOCK THE
// SIZE OF ONE, AND IT STANDS IN A DEVELOPED STATE.
//
// hoi4.exe builds a city mesh on every second pixel of terrain.bmp ground whose graphical terrain says `spawn_city = yes`, and
// picks the building by how deep inside the patch the point is: the last of cities.txt's `distance` rings it reaches (cities.cpp,
// 0x1416F2B60 in 1.19.4.1). Generate land painted every urban province WHOLE with that ground, and it chose the urban provinces by
// HEIGHT. TEST 30, measured 09-25:
//   · 32,272 city meshes, 73% of them the tallest building, in province-sized blocks — vanilla has 5,463, 8% the tallest;
//   · 96% of the city ground stood in rural, pastoral, wasteland and island states, and the ten megalopolis states had none.
//
// What a shipping map does instead, measured 09-26 over six of them: an urban province is a CORE of city ground (vanilla 95 px
// each, 76% of an urban province; Millennium Dawn 67, Old World Blues 66, Novum Vexillum 82, Rise of Nations 87, Road to 56 91)
// inside ordinary ground (vanilla's commonest there is plains, 43%; OWB's is its index 3), and urban is a share of each STATE
// CATEGORY's land (vanilla metropolis 9.2%, city 6.0%, rural 0.8%, wasteland 0.0%; OWB megalopolis 50.5% … shanty 0.5%).
//
// Pinned on a two-layer world whose layer below does both in numbers no shipping map has, so nothing here can pass on a
// constant: its city ground is index 19 (as Old World Blues's is, not vanilla's 13), each of its cities carries a 40-pixel core
// painted round with FOREST, and a third of its metropolis land is urban while its wasteland has none.
//   1. the urban provinces go to the metropolis states, on the victory point first and then beside it; none to the wasteland;
//   2. each gets ONE core of exactly the layer below's size, in its middle, the rest painted as the layer below paints round a
//      city — and no city ground anywhere else;
//   3. every core is lit at night, and nothing far from one is.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-city-core-"));
process.env.APPDATA = path.join(ROOT, "appdata"); process.env.NOVA_APP_DATA_DIR = process.env.APPDATA; process.env.XDG_CONFIG_HOME = process.env.APPDATA;
process.env.NOVA_HOME_DIR = path.join(ROOT, "home");
fs.mkdirSync(process.env.NOVA_HOME_DIR, { recursive: true });
const md = require("./map-data.js");
const dds = require("./dds-codec.js");

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
/** A DDS of `format` (RGB32 | DXT5), `levels` mips, painted by fn(x, y, level) → [r, g, b, a]. */
function makeDds(W, H, format, levels, fn) {
  const compressed = format !== "RGB32";
  const h = Buffer.alloc(128);
  h.write("DDS ", 0, "latin1"); h.writeUInt32LE(124, 4);
  h.writeUInt32LE(0x1007 | (levels > 1 ? 0x20000 : 0) | (compressed ? 0x80000 : 0x8), 8);
  h.writeUInt32LE(H, 12); h.writeUInt32LE(W, 16);
  h.writeUInt32LE(compressed ? Math.max(1, Math.ceil(W / 4)) * Math.max(1, Math.ceil(H / 4)) * 16 : W * 4, 20);
  h.writeUInt32LE(levels, 28); h.writeUInt32LE(32, 76);
  if (compressed) { h.writeUInt32LE(0x4, 80); h.write(format, 84, "latin1"); }
  else { h.writeUInt32LE(0x41, 80); h.writeUInt32LE(32, 88); h.writeUInt32LE(0xff0000, 92); h.writeUInt32LE(0xff00, 96); h.writeUInt32LE(0xff, 100); h.writeUInt32LE(0xff000000, 104); }
  h.writeUInt32LE(0x1000 | (levels > 1 ? 0x400008 : 0), 108);
  let size = 128, w = W, hh = H;
  for (let l = 0; l < levels; l++) { size += compressed ? Math.max(1, Math.ceil(w / 4)) * Math.max(1, Math.ceil(hh / 4)) * 16 : w * hh * 4; w = Math.max(1, w >> 1); hh = Math.max(1, hh >> 1); }
  const buf = Buffer.alloc(size); h.copy(buf);
  const hdr = dds.parseDdsHeader(buf);
  for (let l = 0; l < hdr.levels; l++) {
    const { w: lw, h: lh } = hdr.lv[l], rgba = new Uint8Array(lw * lh * 4);
    for (let y = 0; y < lh; y++) for (let x = 0; x < lw; x++) rgba.set(fn(x, y, l), (y * lw + x) * 4);
    dds.patchDdsLevel(buf, hdr, l, rgba, new Uint8Array(lw * lh).fill(1));
  }
  return buf;
}

// ── the world: 8 x 4 provinces, id = row * 8 + col + 1; the textures are 2 px to a texel ──────────────────────────────────
//   layer below   rows 0-2 land, row 3 sea.  cols 0-3 METROPOLIS (states 1, 2), cols 4-7 WASTELAND (states 3, 4).
//                 4 of the 12 metropolis provinces are urban: a 40 px core of index 19 in each, forest round it.
//   the mod      the same shapes, all sea (what Delete map leaves), four strategic regions of two columns each.
// ⚠ The provinces are NOT equal, on purpose: even columns are wider and the bottom row taller, so a generated state's largest
// provinces are at the bottom of its wide column, away from its victory point — which is its TOWN province, the smallest that
// holds the layer below's core (#a-town-on-a-town-sized-province: the top of its narrow column). On equal squares "the largest
// remaining" and "beside the city" pick the same province and the patch rule's back-out cannot bite.
// ⚠️ MOVED WITH #a-town-on-a-town-sized-province: the victory point was the state's LARGEST province, at the bottom.
const COLW = [20, 12, 20, 12, 20, 12, 20, 12], ROWH = [14, 14, 14, 22], COLS = 8, ROWS = 4;
const COLX = COLW.map((_, i) => COLW.slice(0, i).reduce((a, b) => a + b, 0)), ROWY = ROWH.map((_, i) => ROWH.slice(0, i).reduce((a, b) => a + b, 0));
const W = COLW.reduce((a, b) => a + b, 0), H = ROWH.reduce((a, b) => a + b, 0), TW = W / 2, TH = H / 2;
const SPAWN = 19, FOREST = 1, PLAINS = 0, DESERT = 3, OCEAN = 15, CORE_BELOW = 40;
const idAt = (c, r) => r * COLS + c + 1;
const cellOfId = (id) => [(id - 1) % COLS, Math.floor((id - 1) / COLS)];
const colOf = (x) => COLX.findIndex((x0, i) => x >= x0 && x < x0 + COLW[i]), rowOf = (y) => ROWY.findIndex((y0, i) => y >= y0 && y < y0 + ROWH[i]);
const provAt = (x, y) => idAt(colOf(x), rowOf(y));
const areaOf = (id) => { const [c, r] = cellOfId(id); return COLW[c] * ROWH[r]; };
/** The pixel the painter should grow a core from: the province's town point, which with no unitstacks.txt here is its own pixel
 *  nearest its centroid whose 3x3 is all the province, the first such in row-major order.
 *  ⚠️ MOVED WITH #one-town-point-per-province: this derived the pixel farthest from the edge, where the painter seeded a core
 *  before it was handed town points — and the check below went on asserting that pixel under a label that said "town point". */
const townPixelOf = (id) => {
  const [c, r] = cellOfId(id), cx = (COLW[c] - 1) / 2, cy = (ROWH[r] - 1) / 2; let best = Infinity, at = -1;
  for (let ly = 1; ly < ROWH[r] - 1; ly++) for (let lx = 1; lx < COLW[c] - 1; lx++) { const d = (lx - cx) ** 2 + (ly - cy) ** 2; if (d < best) { best = d; at = (ROWY[r] + ly) * W + COLX[c] + lx; } }
  return at;
};
const colour = (id) => [(id * 29) % 256, (id * 67) % 256, 30 + id];
const BELOW_URBAN = new Set([idAt(0, 0), idAt(1, 1), idAt(2, 2), idAt(3, 0)]);
const belowLand = (id) => cellOfId(id)[1] < 3;
const inBelowCore = (x, y) => { const lx = x - COLX[colOf(x)], ly = y - ROWY[rowOf(y)]; return lx >= 2 && lx < 10 && ly >= 4 && ly < 9; };   // 8 x 5 = 40 px
const URBAN_RGB = [120, 110, 100], LAND_RGB = [150, 120, 60], SEA_RGB = [79, 102, 141];

/** o.noCityGround: the urban provinces below carry no city ground at all — nothing to measure a town's size from. */
function makeGame(tag, o = {}) {
  const g = path.join(ROOT, tag);
  write(g, "hoi4.exe", "");
  write(g, "map/provinces.bmp", bmp24(W, H, (x, y) => colour(provAt(x, y))));
  const rows = ["0;0;0;0;land;false;unknown;0"];
  for (let id = 1; id <= COLS * ROWS; id++) rows.push(`${id};${colour(id).join(";")};${belowLand(id) ? `land;false;${BELOW_URBAN.has(id) ? "urban" : "plains"};1` : "sea;false;ocean;0"}`);
  write(g, "map/definition.csv", rows.join("\n") + "\n");
  write(g, "map/terrain.bmp", bmp8(W, H, (x, y) => { const p = provAt(x, y); return !belowLand(p) ? OCEAN : BELOW_URBAN.has(p) ? (inBelowCore(x, y) && !o.noCityGround ? SPAWN : FOREST) : PLAINS; }));
  write(g, "map/heightmap.bmp", bmp8(W, H, (x, y) => (belowLand(provAt(x, y)) ? 106 : 89)));
  write(g, "common/terrain/00_terrain.txt", [
    "categories = {", "  plains = { color = { 200 200 100 } }", "  forest = { color = { 0 120 0 } }", "  urban = { color = { 120 110 100 } }", "  desert = { color = { 250 200 100 } }",
    "  ocean = { color = { 0 0 200 } is_water = yes }", "}",
    "terrain = {", "  plains = { type = plains color = { 0 } }", "  forest = { type = forest color = { 1 } }", "  desert = { type = desert color = { 3 } }",
    "  terrain_city = { type = urban color = { 19 } texture = 10 spawn_city = yes }", "  ocean = { type = ocean color = { 15 } }", "}", ""].join("\n"));
  const states = { 1: [0, 1, "metropolis", "AAA"], 2: [2, 3, "metropolis", "AAA"], 3: [4, 5, "wasteland", "BBB"], 4: [6, 7, "wasteland", "BBB"] };
  for (const [s, [c0, c1, cat, tag2]] of Object.entries(states)) {
    const provs = []; for (let r = 0; r < 3; r++) for (const c of [c0, c1]) provs.push(idAt(c, r));
    write(g, `history/states/${s}-S.txt`, `state={\n\tid=${s}\n\tname="STATE_${s}"\n\tmanpower=100000\n\tstate_category=${cat}\n\tprovinces={ ${provs.join(" ")} }\n\thistory={\n\t\towner=${tag2}\n\t}\n}\n`);
  }
  // the night lights, painted FOR this map: lit over each city's core, dark everywhere else
  const texel = (X, Y) => { const x = 2 * X, y = 2 * Y, p = provAt(x, y); return { land: belowLand(p), core: BELOW_URBAN.has(p) && inBelowCore(x, y) }; };
  write(g, "map/terrain/colormap_rgb_cityemissivemask_a.dds", makeDds(TW, TH, "RGB32", 1, (X, Y) => { const t = texel(X, Y); return t.core ? [...URBAN_RGB, 173] : t.land ? [...LAND_RGB, 0] : [...SEA_RGB, 0]; }));
  for (const [n, s] of [["colormap_water_0.dds", 1], ["colormap_water_1.dds", 2], ["colormap_water_2.dds", 4]]) {
    write(g, "map/terrain/" + n, makeDds(TW / s, TH / s, "DXT5", 1, (X, Y) => (texel(X * s, Y * s).land ? [60, 70, 60, 255] : [35, 59, 81, 255])));
  }
  write(g, "map/terrain/fow_rgb_waterspec_a.dds", makeDds(TW, TH, "DXT5", 6, (X, Y, l) => (texel(Math.min(TW - 1, X << l), Math.min(TH - 1, Y << l)).land ? [140, 140, 140, 21] : [90, 90, 90, 40])));
  return g;
}
function makeMod(tag) {
  const m = path.join(ROOT, tag);
  write(m, "descriptor.mod", 'name="city cores"\nreplace_path="history/states"\n');
  write(m, "map/provinces.bmp", bmp24(W, H, (x, y) => colour(provAt(x, y))));
  const rows = ["0;0;0;0;land;false;unknown;0"];
  for (let id = 1; id <= COLS * ROWS; id++) rows.push(`${id};${colour(id).join(";")};sea;false;ocean;0`);
  write(m, "map/definition.csv", rows.join("\n") + "\n");
  write(m, "map/terrain.bmp", bmp8(W, H, () => OCEAN));
  write(m, "map/heightmap.bmp", bmp8(W, H, () => 89));
  for (let r = 0; r < 4; r++) {
    const ids = []; for (let row = 0; row < ROWS; row++) for (const c of [2 * r, 2 * r + 1]) ids.push(idAt(c, row));
    write(m, `map/strategicregions/r${r + 1}.txt`, `strategic_region={\n\tid=${r + 1}\n\tname="REGION_${r + 1}"\n\tprovinces={ ${ids.join(" ")} }\n\tweather={}\n}\n`);
  }
  fs.mkdirSync(path.join(m, "history", "states"), { recursive: true });
  return m;
}
const rowsOf = (m) => {
  const out = new Map();
  for (const line of fs.readFileSync(path.join(m, "map", "definition.csv"), "utf8").split(/\r?\n/)) {
    const c = line.split(";");
    if (c.length >= 7 && /^\d+$/.test(c[0]) && c[0] !== "0") out.set(+c[0], { type: c[4], terrain: c[6] });
  }
  return out;
};
const statesOf = (m) => {
  const out = [];
  for (const f of fs.readdirSync(path.join(m, "history", "states"))) {
    const t = fs.readFileSync(path.join(m, "history", "states", f), "utf8");
    const provinces = ((/provinces\s*=\s*\{([^}]*)\}/.exec(t) || [])[1] || "").trim().split(/\s+/).map(Number).filter(Boolean);
    const vp = +((/victory_points\s*=\s*\{\s*(\d+)/.exec(t) || [])[1] || 0);
    out.push({ file: f, category: (/state_category\s*=\s*(\w+)/.exec(t) || [])[1] || "", provinces, vp });
  }
  return out;
};
const n4 = (id) => { const [c, r] = cellOfId(id); return [[c - 1, r], [c + 1, r], [c, r - 1], [c, r + 1]].filter(([a, b]) => a >= 0 && a < COLS && b >= 0 && b < ROWS).map(([a, b]) => idAt(a, b)); };

const game = makeGame("game");
console.log("\n-- the layer below, as the new readers see it --");
{
  const spawn = md.spawnCityTerrainIndices({ modRoot: game, gameRoot: game });
  ok(spawn.size === 1 && spawn.has(SPAWN), "the city ground is the index the map's own common/terrain marks spawn_city (19 here, not vanilla's 13)", [...spawn]);
  const g = md.cityGroundBeneath({ modRoot: path.join(ROOT, "nothing"), gameRoot: game });
  ok(g && g.coreArea === CORE_BELOW && g.fill === FOREST, "…one urban province carries 40 px of it, painted round with forest", g && { coreArea: g.coreArea, fill: g.fill });
  ok(g && Math.abs(g.shareByCategory.get("metropolis") - 4 / 12) < 1e-9 && g.shareByCategory.get("wasteland") === 0, "…and a third of the metropolis land is urban, none of the wasteland", g && [...g.shareByCategory]);
}

const mod = makeMod("mod");
const r = md.generateLand({ modRoot: mod, gameRoot: game, dependencyRoots: [], count: COLS * ROWS, provincesPerState: 8, seed: 3, splitLargeProvinces: false });   // #a-raised-province-is-cut-to-land-size: not this test's subject — its fixture's cells are its provinces, and the cut would add more
ok(r && r.changed && r.flippedProvinces === COLS * ROWS && r.createdStates === 4, "Generate land raised the whole world into four states", r && (r.error || { flipped: r.flippedProvinces, states: r.createdStates }));

console.log("\n-- ⭐ 1. the cities go to the developed states, starting at the star --");
const rows = rowsOf(mod), states = statesOf(mod);
const urban = [...rows].filter(([, v]) => v.type === "land" && v.terrain === "urban").map(([id]) => id);
// ⚠️ MOVED WITH #a-generated-world-has-the-layer-belows-cities-per-state: this was "a third of the 16 metropolis provinces, rounded: 5"
// — the layer below's share of the LAND. The count is per STATE now: the two metropolis states below hold its four cities, two
// each, so the two generated metropolis states get four. Derived from both layers' own state files, and used by every count below.
const BELOW_METRO = statesOf(game).filter((s) => s.category === "metropolis");
const CITIES = Math.round(BELOW_METRO.reduce((a, s) => a + s.provinces.filter((p) => BELOW_URBAN.has(p)).length, 0) / BELOW_METRO.length * states.filter((s) => s.category === "metropolis").length);
// ⚠️ MOVED WITH #every-generated-capital-has-a-city: BBB owns only wasteland, whose rate below is 0, so the count gave its country no
// city at all; its capital now gets one on top of that count, which the report names (cities.forCapitals). Every count of the
// world's cities below is the per-state count plus those.
const CAP_TOWNS = (r && r.cities && r.cities.forCapitals) || [];
const URBAN_N = CITIES + CAP_TOWNS.length;
// #a-victory-point-has-a-town: the stars the city pass left on bare ground, read off the generated states and rows
const TOWN_STARS = states.map((s) => s.vp).filter((p) => p > 0 && !urban.includes(p));
{
  const metro = states.filter((s) => s.category === "metropolis"), waste = states.filter((s) => s.category === "wasteland");
  ok(metro.length === 2 && waste.length === 2, "the generated states took the layer below's categories", states.map((s) => s.category));
  const inMetro = urban.filter((p) => metro.some((s) => s.provinces.includes(p)));
  const inWaste = urban.filter((p) => waste.some((s) => s.provinces.includes(p)));
  const belowLandN = BELOW_METRO.reduce((a, s) => a + s.provinces.length, 0), belowUrbanN = BELOW_METRO.reduce((a, s) => a + s.provinces.filter((p) => BELOW_URBAN.has(p)).length, 0);
  const bySize = Math.round(belowUrbanN / belowLandN * metro.reduce((a, s) => a + s.provinces.length, 0));
  ok(CITIES > 0 && bySize !== CITIES, `(the fixture tells the two counts apart: per state ${CITIES}, the layer below's share of the generated land ${bySize})`, { CITIES, bySize, below: [BELOW_METRO.length, belowUrbanN, belowLandN] });
  ok(inMetro.length === CITIES && urban.length === URBAN_N, `⭐⭐ the metropolis states get the layer below's cities per state (${CITIES} in ${metro.length} states)`, { inMetro, urban });
  // every province here has a 3x3 of its own, so the town province is the smallest that holds the 40 px core, lowest id on a tie
  const townOf = (s) => s.provinces.filter((p) => areaOf(p) >= CORE_BELOW).sort((a, b) => areaOf(a) - areaOf(b) || a - b)[0];
  const largestOf = (s) => s.provinces.slice().sort((a, b) => areaOf(b) - areaOf(a) || a - b)[0];
  ok(metro.every((s) => s.vp === townOf(s) && townOf(s) !== largestOf(s)), "(the fixture: each state's victory point is its town province, not its largest)", metro.map((s) => [s.vp, townOf(s), largestOf(s)]));
  const bbbCap = waste.filter((s) => CAP_TOWNS.some((p) => s.provinces.includes(p)));
  ok(CAP_TOWNS.length === 1 && bbbCap.length === 1 && bbbCap[0].vp === CAP_TOWNS[0], "⭐⭐ BBB, whose land is all wasteland, gets one town, on its capital's star", { CAP_TOWNS, waste: waste.map((s) => [s.file, s.vp]) });
  ok(inWaste.length === CAP_TOWNS.length && inWaste.every((p) => CAP_TOWNS.includes(p)), "⭐ …and the wasteland, whose share below is 0, gets no other", inWaste);
  ok(metro.every((s) => s.vp > 0 && urban.includes(s.vp)), "⭐ each metropolis state's victory point is one of its cities", metro.map((s) => [s.vp, urban.includes(s.vp)]));
  const onePatch = metro.every((s) => {
    const mine = urban.filter((p) => s.provinces.includes(p));
    if (mine.length < 2) return true;
    const seen = new Set([mine[0]]), q = [mine[0]];
    while (q.length) { const u = q.shift(); for (const v of n4(u)) if (mine.includes(v) && !seen.has(v)) { seen.add(v); q.push(v); } }
    return seen.size === mine.length;
  });
  ok(onePatch, "…and a state with more than one grows them as one patch beside it, not scattered", metro.map((s) => urban.filter((p) => s.provinces.includes(p))));
  ok(r.cities && r.cities.provinces === URBAN_N && r.cities.fromLayerBelow === true, "the report says how many cities it placed and that the layer below decided", r.cities);
  // Generate land put the star on the largest province (until #a-town-on-a-town-sized-province), which is also what "the largest remaining" picks, so the rule that the
  // FIRST city stands on the star cannot be told apart through it (its back-out passed). Asked of the chooser directly, with a
  // star that is not the largest province — the case any other caller, or a later change to where the star goes, would hit.
  const one = md.chooseUrbanProvinces({ states: [{ id: 1, provinces: [11, 12, 13], category: "c", vpProvince: 13 }], shareOf: () => 1 / 3, adj: null, areaOf: new Map([[11, 300], [12, 200], [13, 100]]) });
  ok(one.size === 1 && one.has(13), "the first city of a state is its victory point even when a larger province is free", [...one]);
}

console.log("\n-- ⭐ 2. each is ONE core in the middle of its province, the size the layer below's are --");
{
  const at = read8(path.join(mod, "map", "terrain.bmp"));
  const perProv = new Map();
  // ⚠️ MOVED WITH #a-victory-point-has-a-town: "no city ground anywhere but the urban provinces' cores" — every star the city pass
  // leaves on bare ground now carries a small town too, its province's terrain left as it is (pinned in section 2b). The stray count
  // leaves those stars out; any other province's city ground is still stray.
  let strayCity = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const p = provAt(x, y), t = at(x, y);
    if (!perProv.has(p)) perProv.set(p, new Map());
    perProv.get(p).set(t, (perProv.get(p).get(t) || 0) + 1);
    if (t === SPAWN && !urban.includes(p) && !TOWN_STARS.includes(p)) strayCity++;
  }
  const sizes = urban.map((p) => (perProv.get(p).get(SPAWN) || 0));
  ok(urban.length && sizes.every((n) => n === CORE_BELOW), "⭐⭐ every urban province carries exactly the layer below's 40 px of city ground, not the whole province", { sizes, areas: urban.map(areaOf) });
  const blobs = urban.map((p) => {
    const [c, rr] = cellOfId(p), px = new Set();
    for (let y = ROWY[rr]; y < ROWY[rr] + ROWH[rr]; y++) for (let x = COLX[c]; x < COLX[c] + COLW[c]; x++) if (at(x, y) === SPAWN) px.add(y * W + x);
    const first = px.values().next().value, seen = new Set([first]), q = [first];
    while (q.length) { const i = q.shift(), x = i % W; for (const d of [-1, 1, -W, W, -W - 1, -W + 1, W - 1, W + 1]) { const j = i + d; if (Math.abs((j % W) - x) > 1 || !px.has(j) || seen.has(j)) continue; seen.add(j); q.push(j); } }
    return { one: seen.size === px.size, central: px.has(townPixelOf(p)) };
  });
  ok(blobs.every((b) => b.one), "⭐ …in ONE patch, which is what makes it a town with rings rather than scattered blocks", blobs);
  ok(blobs.every((b) => b.central), "…grown from the middle of the province (its town point; no unitstacks.txt here, so its own pixel nearest the centroid)", blobs);
  // ⚠️ MOVED WITH #a-city-stands-in-its-own-ground: this said "as the layer below paints round its cities (forest here)" — one
  // index for the whole map. The ring is the ground round the province now.
  // ⚠️ MOVED AGAIN WITH #a-town-on-a-town-sized-province: this said "here the plains the generator raised about it", which was the
  // luck of which provinces were towns. With the towns on the narrow top provinces, one of them (3) touches nothing but other towns.
  // So the ground round each town is read off the map — the commonest ordinary index its edge touches outside it, another town not
  // counted, lowest on a tie; a town that touches none takes the layer below's fill (forest), which is what `fill` is for — and one
  // town at least must stand in something other than that forest, or the check could not tell the two apart.
  const tAt = read8(path.join(mod, "map", "terrain.bmp"));
  const roundOf = (p) => {
    const votes = new Map();
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (provAt(x, y) !== p) continue;
      for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const q = provAt(nx, ny);
        if (q === p || urban.includes(q) || (rows.get(q) || {}).type !== "land") continue;
        votes.set(tAt(nx, ny), (votes.get(tAt(nx, ny)) || 0) + 1);
      }
    }
    let best = -1, n = 0;
    for (const [t, k] of votes) if (k > n || (k === n && t < best)) { best = t; n = k; }
    return best;
  };
  const rounds = urban.map((p) => { const t = roundOf(p); return t >= 0 ? t : FOREST; });
  ok(rounds.some((t) => t !== FOREST), "(the fixture: at least one town stands in ground that is not the layer below's forest)", rounds);
  ok(urban.every((p, i) => (perProv.get(p).get(rounds[i]) || 0) === areaOf(p) - CORE_BELOW), "⭐ the rest of an urban province is the ground round it, not one index for the whole map", urban.map((p, i) => [p, rounds[i], [...perProv.get(p)]]));
  ok(strayCity === 0, "no city ground anywhere but the urban provinces' cores", strayCity);
  ok(r.heightmap && r.heightmap.terrain && r.heightmap.terrain.cities && r.heightmap.terrain.cities.provinces === URBAN_N && r.heightmap.terrain.cities.coreArea === CORE_BELOW,
    "the painter says what it did", r.heightmap && r.heightmap.terrain && r.heightmap.terrain.cities);
}

console.log("\n-- ⭐ 2b. every other victory point gets a small town, its province's terrain left as it is (#a-victory-point-has-a-town) --");
{
  const at = read8(path.join(mod, "map", "terrain.bmp"));
  const MEASURED = md.VICTORY_POINT_TOWN_SIZES_MEASURED;
  ok(TOWN_STARS.length >= 1, "(the fixture: a generated state whose star the city pass left on bare ground)", { TOWN_STARS, states: states.map((s) => [s.category, s.vp]) });
  const px = (p) => { const [c, rr] = cellOfId(p), out = []; for (let y = ROWY[rr]; y < ROWY[rr] + ROWH[rr]; y++) for (let x = COLX[c]; x < COLX[c] + COLW[c]; x++) if (at(x, y) === SPAWN) out.push(y * W + x); return out; };
  const towns = TOWN_STARS.map((p) => {
    const s = new Set(px(p)), first = s.values().next().value, seen = new Set(s.size ? [first] : []), q = [...seen];
    while (q.length) { const i = q.shift(), x = i % W; for (const d of [-1, 1, -W, W, -W - 1, -W + 1, W - 1, W + 1]) { const j = i + d; if (Math.abs((j % W) - x) > 1 || !s.has(j) || seen.has(j)) continue; seen.add(j); q.push(j); } }
    return { p, n: s.size, one: s.size > 0 && seen.size === s.size, block: [...s].some((i) => s.has(i + 1) && s.has(i + W) && s.has(i + W + 1) && (i % W) + 1 < W), terrain: (rows.get(p) || {}).terrain };
  });
  ok(towns.every((t) => MEASURED.includes(t.n) && t.one && t.block), "⭐⭐ each holds ONE small town, a size Millennium Dawn gives its smaller places, holding a 2 x 2 block (a point of the mesh grid)", towns);
  ok(towns.every((t) => t.terrain && t.terrain !== "urban"), "⭐⭐ …and its province keeps the terrain the generator gave it: city ground only, not an urban row", towns.map((t) => [t.p, t.terrain]));
  // at its name: this fixture has no unitstacks.txt (so no type-38 marker), and the town point is the province's own pixel nearest
  // its centroid (townPixelOf, as section 2 reads it); a marker's case is pinned in test-a-victory-point-has-a-town.js
  ok(!fs.existsSync(path.join(mod, "map", "unitstacks.txt")), "(the fixture: no unitstacks.txt, so the town point is the province's middle)");
  const near = TOWN_STARS.map((p) => { const m = townPixelOf(p), mx = m % W, my = (m - mx) / W; return Math.min(...px(p).map((i) => Math.max(Math.abs((i % W) - mx), Math.abs(Math.floor(i / W) - my)))); });
  ok(near.every((d) => d <= 1), "⭐ …at its name: touching the star's town point", near);
  const t = r.cities && r.cities.towns;
  ok(t && t.changed && t.painted === TOWN_STARS.length && t.asked === TOWN_STARS.length && t.from === "measured", "the report says how many it painted, and that their sizes were Millennium Dawn's (this map has no small towns of its own)", t);
  // THE CONTROL: the same world with the town pass turned off differs from this one in those towns' pixels and nowhere else
  const mod0 = makeMod("mod-no-towns");
  const r0 = md.generateLand({ modRoot: mod0, gameRoot: game, dependencyRoots: [], count: COLS * ROWS, provincesPerState: 8, seed: 3, splitLargeProvinces: false, victoryPointTowns: false });
  const at0 = read8(path.join(mod0, "map", "terrain.bmp"));
  const diff = []; for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (at(x, y) !== at0(x, y)) diff.push({ p: provAt(x, y), now: at(x, y), was: at0(x, y) });
  ok(r0 && r0.changed && r0.cities && r0.cities.towns && r0.cities.towns.changed === false, "CONTROL: the same world generated with the town pass turned off", r0 && r0.cities && r0.cities.towns);
  ok(diff.length === towns.reduce((a, x) => a + x.n, 0) && diff.every((d) => TOWN_STARS.includes(d.p) && d.now === SPAWN && d.was !== SPAWN),
    "⭐⭐⭐ …differs only in the towns' own pixels: every city's core, and every other pixel, is exactly as the city pass left it", { diff: diff.length, odd: diff.filter((d) => !TOWN_STARS.includes(d.p) || d.now !== SPAWN).slice(0, 5) });
  ok(fs.readFileSync(path.join(mod, "map", "definition.csv"), "utf8") === fs.readFileSync(path.join(mod0, "map", "definition.csv"), "utf8"), "⭐ …and definition.csv is byte for byte the same: no province was retyped");
}

console.log("\n-- ⭐ 3. every city is lit at night, and nothing far from one is --");
{
  const b = fs.existsSync(path.join(mod, "map", "terrain", "colormap_rgb_cityemissivemask_a.dds")) ? fs.readFileSync(path.join(mod, "map", "terrain", "colormap_rgb_cityemissivemask_a.dds")) : null;
  ok(!!b, "Generate land repainted the colour map that carries the lights", r.heightmap && r.heightmap.textures);
  if (b) {
    const h = dds.parseDdsHeader(b), rgba = dds.decodeDdsLevel(b, h, 0);
    const at = read8(path.join(mod, "map", "terrain.bmp"));
    const coreTexel = new Set();
    for (let Y = 0; Y < TH; Y++) for (let X = 0; X < TW; X++) for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) if (at(2 * X + dx, 2 * Y + dy) === SPAWN) coreTexel.add(Y * TW + X);
    const litCities = urban.map((p) => { let lit = 0; for (const i of coreTexel) { const X = i % TW, Y = Math.floor(i / TW); if (provAt(2 * X, 2 * Y) === p && rgba[i * 4 + 3] > 0) lit++; } return lit; });
    ok(litCities.length === URBAN_N && litCities.every((n) => n > 0), `⭐ every one of the ${URBAN_N} cities has lights over its core`, litCities);
    // (⛔ #a-town-less-star-is-lit-as-often-as-below — a victory point with no town is lit as often as the layer below lights
    // one, and no state below has a victory point here: the rate is unknown, so none is lit and the wasteland's town-less
    // points stay as dark as the rest)
    let farLit = 0;
    for (let i = 0; i < TW * TH; i++) {
      if (!(rgba[i * 4 + 3] > 0)) continue;
      const X = i % TW, Y = Math.floor(i / TW);
      let near = false; for (const j of coreTexel) if (Math.max(Math.abs(j % TW - X), Math.abs(Math.floor(j / TW) - Y)) <= 8) { near = true; break; }
      if (!near) farLit++;
    }
    ok(farLit === 0, "…and no light shines more than 8 texels from a city — the wasteland stays dark", farLit);
  }
}

console.log("\n-- ⭐ 4. a town in the desert stands in desert (#a-city-stands-in-its-own-ground) --");
{
  // Dry country the generator could have raised: every wasteland pixel of the mod repainted desert, and one inland province of
  // it made urban — the painter meeting a city there. The ring round its core used to be ONE index for the whole map, the one
  // the layer below paints round ITS cities (forest here, plains on vanilla), so a desert town stood in a square of it.
  const tb = path.join(mod, "map", "terrain.bmp");
  const b = fs.readFileSync(tb), off = b.readUInt32LE(10), rs = Math.floor((8 * W + 31) / 32) * 4;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (colOf(x) >= 4 && rowOf(y) < 3) b[off + (H - 1 - y) * rs + x] = DESERT;
  fs.writeFileSync(tb, b);
  const town = idAt(5, 1);
  const def = path.join(mod, "map", "definition.csv");
  fs.writeFileSync(def, fs.readFileSync(def, "utf8").split("\n").map((l) => (l.startsWith(`${town};`) ? l.split(";").map((c, i) => (i === 6 ? "urban" : c)).join(";") : l)).join("\n"));
  const mask = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (provAt(x, y) === town) mask[y * W + x] = 1;
  const pr = md.paintProvincesInTerrainBmp({ modRoot: mod, gameRoot: game, dependencyRoots: [], provinceIds: [town], crossed: { W, H, mask } });
  const at = read8(tb), got = new Map();
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (provAt(x, y) === town) got.set(at(x, y), (got.get(at(x, y)) || 0) + 1);
  ok(pr && pr.changed && (got.get(SPAWN) || 0) === CORE_BELOW, "the desert province is painted a city, with the layer below's 40 px core", { pr: pr && (pr.error || pr.reason || pr.cities), got: [...got] });
  ok((got.get(DESERT) || 0) === areaOf(town) - CORE_BELOW, "⭐⭐ …and the rest of it is desert, the ground round it — not the forest the layer below paints round its own cities", [...got]);
  ok(pr && pr.cities && pr.cities.ownGround === 1, "…and the painter says the town took the ground round it", pr && pr.cities);
}

console.log("\n-- ⭐ 4b. a town beside a town stands in ITS own ground, whichever is painted first --");
{
  // The ground round a town was every ordinary pixel its edge touches — and a NEIGHBOURING town's pixels are not that: one already
  // painted carries that town's ring, one not yet painted the stale paint under it. So a chain of towns took its ring from whichever
  // the loop reached first. Measured 09-29: 2 of 90 towns on a vanilla-based world, 20 of 295 over Old World Blues — the worst an
  // arctic town of 13,500 px ringed in forest off its neighbour's ring, in mountains. Here two coastal towns stacked in column 4
  // share a 20 px edge, and each touches its own ground (desert left of one, forest right of the other) along only 14 px. Both are
  // painted plains before the painter reaches them — a third index, so neither the other's ring nor its stale paint can pass.
  const ringMod = (tag, cells, paintOf) => {
    const m = path.join(ROOT, tag);
    write(m, "descriptor.mod", 'name="rings"\n');
    write(m, "map/provinces.bmp", bmp24(W, H, (x, y) => colour(provAt(x, y))));
    const rows = ["0;0;0;0;land;false;unknown;0"];
    for (let id = 1; id <= COLS * ROWS; id++) { const t = cells.get(id) || "plains"; rows.push(`${id};${colour(id).join(";")};${t === "ocean" ? "sea;false;ocean;0" : `land;false;${t};1`}`); }
    write(m, "map/definition.csv", rows.join("\n") + "\n");
    write(m, "map/terrain.bmp", bmp8(W, H, paintOf));
    return m;
  };
  const PAINT = { desert: DESERT, forest: FOREST, ocean: OCEAN };
  const tally = (m, id, inMask = () => true) => {
    const at = read8(path.join(m, "map", "terrain.bmp")), got = {};
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (provAt(x, y) === id && inMask(x, y)) got[at(x, y)] = (got[at(x, y)] || 0) + 1;
    return got;
  };
  const towns = (desertOnTop) => {
    const rD = desertOnTop ? 1 : 2, rF = desertOnTop ? 2 : 1, D = idAt(4, rD), F = idAt(4, rF), outer = (r) => idAt(4, r === 1 ? 0 : 3);
    const cells = new Map([[D, "urban"], [F, "urban"],
      [idAt(3, rD), "desert"], [idAt(5, rD), "ocean"], [outer(rD), "ocean"],
      [idAt(5, rF), "forest"], [idAt(3, rF), "ocean"], [outer(rF), "ocean"]]);
    const m = ringMod("mod-rings-" + (desertOnTop ? "desert-first" : "forest-first"), cells, (x, y) => PAINT[cells.get(provAt(x, y))] || PLAINS);
    // the fixture, read off its own grid: each town touches the other along more of its edge than it touches ordinary land
    const contact = (town, other) => {
      let withOther = 0, withGround = 0;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        if (provAt(x, y) !== town) continue;
        for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
          if (nx < 0 || nx >= W || ny < 0 || ny >= H) continue;
          const q = provAt(nx, ny), t = cells.get(q) || "plains";
          if (q === other) withOther++; else if (q !== town && t !== "ocean" && t !== "urban") withGround++;
        }
      }
      return { withOther, withGround };
    };
    const mask = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (provAt(x, y) === D || provAt(x, y) === F) mask[y * W + x] = 1;
    const pr = md.paintProvincesInTerrainBmp({ modRoot: m, gameRoot: game, dependencyRoots: [], provinceIds: [D, F], crossed: { W, H, mask } });
    return { D, F, pr, cD: contact(D, F), cF: contact(F, D), gotD: tally(m, D), gotF: tally(m, F) };
  };
  for (const desertOnTop of [true, false]) {
    const t = towns(desertOnTop), first = desertOnTop ? "the desert town" : "the forest town";
    ok(t.cD.withOther > t.cD.withGround && t.cF.withOther > t.cF.withGround && t.D !== t.F,
      `(the fixture, ${first} painted first: each town touches the other along more of its edge than its own ground)`, { desert: t.cD, forest: t.cF });
    ok(t.pr && t.pr.changed && t.gotD[SPAWN] === CORE_BELOW && t.gotD[DESERT] === areaOf(t.D) - CORE_BELOW,
      `⭐⭐ ${first} painted first: the desert town stands in desert — not in the other town's ring or the plains still under it`, { got: t.gotD, pr: t.pr && (t.pr.error || t.pr.reason) });
    ok(t.gotF[SPAWN] === CORE_BELOW && t.gotF[FOREST] === areaOf(t.F) - CORE_BELOW,
      `⭐⭐ ${first} painted first: the forest town stands in forest`, t.gotF);
  }
  // …and a town only PART of which just came up keeps its own ground as a vote: the half that did not cross is painted desert and
  // is the ground round the half that did. Its other neighbours are forest along 14 px of edge against the 20 it shares with itself.
  // Skipping every town pixel, its own included, would ring it in forest.
  const P = idAt(4, 1), lower = (x, y) => y - ROWY[1] >= ROWH[1] / 2;
  const cells = new Map([[P, "urban"], [idAt(3, 1), "forest"], [idAt(5, 1), "forest"], [idAt(4, 0), "ocean"]]);
  const m = ringMod("mod-ring-part", cells, (x, y) => { const p = provAt(x, y); return p === P ? (lower(x, y) ? DESERT : PLAINS) : PAINT[cells.get(p)] || PLAINS; });
  const mask = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (provAt(x, y) === P && !lower(x, y)) mask[y * W + x] = 1;
  const pr = md.paintProvincesInTerrainBmp({ modRoot: m, gameRoot: game, dependencyRoots: [], provinceIds: [P], crossed: { W, H, mask } });
  const crossedHalf = tally(m, P, (x, y) => !lower(x, y)), keptHalf = tally(m, P, lower);
  ok(pr && pr.changed && crossedHalf[SPAWN] === CORE_BELOW && crossedHalf[DESERT] === areaOf(P) / 2 - CORE_BELOW && !crossedHalf[FOREST],
    "⭐⭐ a town half of which came up is ringed in its own desert — the half that did not cross — not in its neighbours' forest", { crossedHalf, pr: pr && (pr.error || pr.reason) });
  ok(keptHalf[DESERT] === areaOf(P) / 2, "CONTROL: the half that did not cross keeps the paint it had", keptHalf);
}

console.log("\n-- 5. a read that fails once is not remembered as \"no cities below\" (#a-failed-read-is-not-an-answer) --");
{
  // What the layer below's cities look like is remembered against its files' size and time. A read that throws once — a file an
  // antivirus holds for a moment — must not be remembered: the files are unchanged, so the next ask would get the failure again.
  const gameTb = path.resolve(path.join(game, "map", "terrain.bmp"));
  const t = new Date(Date.now() + 60000); fs.utimesSync(gameTb, t, t);   // a stamp nothing has cached yet
  const realRead = fs.readFileSync;
  let thrown = 0;
  fs.readFileSync = function (p, ...rest) {
    if (!thrown && typeof p === "string" && path.resolve(p) === gameTb) { thrown++; const e = new Error("EBUSY: resource busy or locked"); e.code = "EBUSY"; throw e; }
    return realRead.call(fs, p, ...rest);
  };
  let first, second;
  try { first = md.cityGroundBeneath({ modRoot: path.join(ROOT, "nothing"), gameRoot: game, shares: false }); }
  finally { fs.readFileSync = realRead; }
  second = md.cityGroundBeneath({ modRoot: path.join(ROOT, "nothing"), gameRoot: game, shares: false });
  ok(thrown === 1 && first === null, "CONTROL: while the read throws, there is no answer", { thrown, first });
  ok(second && second.coreArea === CORE_BELOW, "⭐⭐ …and once it reads again the answer is there, not the failure remembered", second);
}

console.log("\n-- 6. what the page says about the cities is what the painter did --");
{
  // The status line after Generate land is built by the page's own generatedCitiesNote, lifted out of public/map.js and fed
  // Generate land's real answers. "Each a town in the middle of its province" is only true where cores were made; with no
  // city ground below to measure one by, the cities are painted whole, and the line said "town" over them (review of dc6554d).
  const vm = require("vm");
  const note = vm.runInNewContext(require("./testlib-map-page.js").lift("function generatedCitiesNote(") + "\ngeneratedCitiesNote", {});
  const said = note(r);
  ok(said.includes(` ${URBAN_N} of the provinces are cities`) && /town in the middle of its province/.test(said), `with cores made, the page says ${URBAN_N} towns, each in the middle of its province`, said);
  ok(said.includes(`${CITIES} in the most developed states`) && said.includes(`and ${CAP_TOWNS.length} so every country's capital has one`), "…and how many of them are there so every capital has one", said);
  // A base game whose urban provinces carry no city ground: nothing to measure a town by. (A world this small gets no city from
  // the elevation table's share, so the painter is driven directly, on one province made urban — its real answer, beside the
  // chooser's count of one.)
  const bare = makeGame("game-nocity", { noCityGround: true }), mod2 = makeMod("mod-nocity");
  const town2 = idAt(2, 1), def2 = path.join(mod2, "map", "definition.csv");
  fs.writeFileSync(def2, fs.readFileSync(def2, "utf8").split("\n").map((l) => (l.startsWith(`${town2};`) ? l.replace(/;sea;false;ocean;0$/, ";land;false;urban;1") : l)).join("\n"));
  const mask2 = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (provAt(x, y) === town2) mask2[y * W + x] = 1;
  const pr2 = md.paintProvincesInTerrainBmp({ modRoot: mod2, gameRoot: bare, dependencyRoots: [], provinceIds: [town2], crossed: { W, H, mask: mask2 } });
  const painted = (pr2 && pr2.cities) || {};
  ok(pr2 && pr2.changed && painted.provinces === 1 && painted.corePixels === areaOf(town2) && !(painted.coreArea > 0), "CONTROL: over a base game with no city ground, a city province is painted whole — no core", pr2 && (pr2.error || pr2.reason || painted));
  const said2 = note({ cities: { provinces: 1, fromLayerBelow: false }, heightmap: { terrain: pr2 } });
  ok(!/town in the middle/.test(said2) && /edge to edge/.test(said2), "⭐⭐ …and the page does not call them towns in the middle of their provinces", said2);
  ok(/^ ⚠ The land is there but its cities could not be placed: disk full$/.test(note({ cities: { error: "disk full" } })) && note({ cities: {} }) === "", "a failure is said out loud, and no cities says nothing");
  // The painter never reaching the cities is not the painter painting them whole (review of e891d08): a raise refused over a
  // heightmap the wrong size answers with a reason and no terrain at all — the shape writeProvinceHeightmap returns.
  const refused = { changed: false, pixels: 0, reason: "heightmap.bmp is 10x10 but provinces.bmp is 20x20" };
  const said3 = note({ cities: { provinces: 3, fromLayerBelow: true }, heightmap: refused });
  ok(!/edge to edge|town in the middle/.test(said3) && /not painted/.test(said3) && said3.includes(refused.reason),
    "⭐⭐ a raise that never ran is said as not painted, with the writer's reason — not as cities painted whole", said3);
  const said4 = note({ cities: { provinces: 1, fromLayerBelow: true }, heightmap: { terrain: pr2 } });
  ok(/edge to edge/.test(said4) && !/no map underneath/.test(said4), "⭐ …and cities counted from the world underneath are never told there is no map underneath", said4);
}

try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) { /* scratch only */ }
console.log("\n" + (fail ? "FAILED " + fail + "/" + (pass + fail) : "PASSED " + pass + "/" + pass));
process.exitCode = fail ? 1 : 0;
