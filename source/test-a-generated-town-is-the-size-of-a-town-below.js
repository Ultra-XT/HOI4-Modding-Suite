// ⛔ #a-generated-town-is-the-size-of-a-town-below — EACH GENERATED TOWN IS THE SIZE OF A TOWN OF ITS KIND BELOW, AND IT IS LIT LIKE ONE.
//
// TEST 32 (10-01): 185 of its 220 towns were exactly 95 px of city ground (vanilla: 2 of 275). The terrain painter grew every core to
// ONE number, cityGroundBeneath's mean (`coreArea`), where the base game's towns run 48 / 84 / 166 px at p10 / median / p90 in 119
// distinct sizes, a bigger urban province holding a bigger town (Spearman 0.58–0.96 within a category). The owner: "a lot of cities
// have normal sizes … looked realistic" — so the mean stays where it was right (the brush, a province nothing drew a size for), and
// only the stamp goes. And the night lights capped every lit core at the base game's MEAN core, so a big town stayed stamped at night.
//
// Pinned on the 8 x 6 grid of test-a-generated-world-has-the-layer-belows-cities-per-state.js, whose columns are unequal so a
// province's area order is not its id order. Below, two `city` states carry towns of four different sizes and two `town` states two
// more, out of a disjoint range, plus one urban province with no city ground at all. Every expected size, area and assignment is
// derived in this file from the fixture's own files, never typed in:
//   1. cityGroundBeneath lists each urban province's own city ground, per category, the empty one left out;
//   2. townCoreSizes, pure: smallest province, smallest town, at evenly spaced quantiles;
//   3. Generate land paints each town at its own size, from its own category's towns, round its station;
//   4. a category with ONE town below takes the whole map's towns; 5. what had no sizes keeps the mean;
//   6. a category no state below uses takes its stand-in's towns;
//   7. a town that is all city ground is lit whole, and urban ground that is not city ground is still capped at the mean.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-town-sizes-"));
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
const sameList = (a, b) => Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v, i) => v === b[i]);

// ── the world: 8 x 6 provinces, id = row * 8 + col + 1 ────────────────────────────────────────────────────────────────────────
//   layer below   rows 0-4 land in FOUR states of two columns each, ten provinces a state; row 5 open ocean. Each urban province
//                 carries a core of its own size (`CORES`): the first N pixels of its inner box, row by row.
//   the mod       the same shapes, all sea. Its strategic regions are three provinces in a row, so each becomes one generated state.
const COLW = [20, 12, 16, 20, 12, 16, 12, 12], ROWH = [14, 14, 14, 14, 14, 22], COLS = 8, ROWS = 6, LAND_ROWS = 5;
const COLX = COLW.map((_, i) => COLW.slice(0, i).reduce((a, b) => a + b, 0)), ROWY = ROWH.map((_, i) => ROWH.slice(0, i).reduce((a, b) => a + b, 0));
const W = COLW.reduce((a, b) => a + b, 0), H = ROWH.reduce((a, b) => a + b, 0);
const SPAWN = 13, PLAINS = 0, OCEAN = 15;
const idAt = (c, r) => r * COLS + c + 1;
const cellOfId = (id) => [(id - 1) % COLS, Math.floor((id - 1) / COLS)];
const colOf = (x) => COLX.findIndex((x0, i) => x >= x0 && x < x0 + COLW[i]), rowOf = (y) => ROWY.findIndex((y0, i) => y >= y0 && y < y0 + ROWH[i]);
const provAt = (x, y) => idAt(colOf(x), rowOf(y));
const colour = (id) => [(id * 29) % 256, (id * 67) % 256, 30 + id];
const belowLand = (id) => cellOfId(id)[1] < LAND_ROWS;
/** pixel (x, y) is one of the first `n` pixels of its province's inner box (1 px in from every edge), row by row */
const inCore = (x, y, n) => { const c = colOf(x), r = rowOf(y), lx = x - COLX[c], ly = y - ROWY[r]; if (lx < 1 || ly < 1 || lx >= COLW[c] - 1 || ly >= ROWH[r] - 1) return false; return (ly - 1) * (COLW[c] - 2) + (lx - 1) < n; };
const LAND_REGIONS = [0, 1, 2].flatMap((r) => [[0, 1, 2], [3, 4, 5]].map((cols) => cols.map((c) => idAt(c, r))));
const OCEAN_REGIONS = [[0, 1, 2], [3, 4, 5]].map((cols) => cols.map((c) => idAt(c, LAND_ROWS)));
const slotFile = (slots) => `state_categories = {\n${Object.entries(slots).map(([k, v]) => `\t${k} = { local_building_slots = ${v} }`).join("\n")}\n}\n`;

/** o: { categories (one per state below, columns 2k and 2k+1), cores (Map urban id → px of city ground; 0 = urban with none), slots } */
function makeGame(tag, o) {
  const g = path.join(ROOT, tag);
  write(g, "hoi4.exe", "");
  write(g, "map/provinces.bmp", bmp24(W, H, (x, y) => colour(provAt(x, y))));
  const rows = ["0;0;0;0;land;false;unknown;0"];
  for (let id = 1; id <= COLS * ROWS; id++) rows.push(`${id};${colour(id).join(";")};${belowLand(id) ? `land;false;${o.cores.has(id) ? "urban" : "plains"};1` : "sea;false;ocean;0"}`);
  write(g, "map/definition.csv", rows.join("\n") + "\n");
  write(g, "map/terrain.bmp", bmp8(W, H, (x, y) => { const p = provAt(x, y); return !belowLand(p) ? OCEAN : (o.cores.get(p) > 0 && inCore(x, y, o.cores.get(p))) ? SPAWN : PLAINS; }));
  write(g, "map/heightmap.bmp", bmp8(W, H, (x, y) => (belowLand(provAt(x, y)) ? 106 : 89)));
  write(g, "map/buildings.txt", "1;air_base;10.00;10.40;15.00;0.00;0\n");   // a layer below with building rows, so the new states get theirs
  write(g, "common/terrain/00_terrain.txt", ["categories = {", "  plains = { color = { 200 200 100 } }", "  urban = { color = { 120 110 100 } }", "  ocean = { color = { 0 0 200 } is_water = yes }", "}",
    "terrain = {", "  plains = { type = plains color = { 0 } }", "  terrain_city = { type = urban color = { 13 } spawn_city = yes }", "  ocean = { type = ocean color = { 15 } }", "}", ""].join("\n"));
  if (o.slots) write(g, "common/state_category/cats.txt", slotFile(o.slots));
  const states = o.categories.map((cat, k) => {
    const provinces = []; for (let r = 0; r < LAND_ROWS; r++) for (const c of [2 * k, 2 * k + 1]) provinces.push(idAt(c, r));
    write(g, `history/states/${k + 1}-S.txt`, `state={\n\tid=${k + 1}\n\tname="STATE_${k + 1}"\n\tmanpower=100000\n\tstate_category=${cat}\n\tprovinces={ ${provinces.join(" ")} }\n\thistory={\n\t\towner=AAA\n\t\tvictory_points = { ${provinces[0]} 5 }\n\t}\n}\n`);
    return { id: k + 1, category: cat, provinces };
  });
  return { root: g, states };
}
function makeMod(tag, regions) {
  const m = path.join(ROOT, tag);
  write(m, "descriptor.mod", 'name="town sizes"\nreplace_path="history/states"\n');
  write(m, "map/provinces.bmp", bmp24(W, H, (x, y) => colour(provAt(x, y))));
  const rows = ["0;0;0;0;land;false;unknown;0"];
  for (let id = 1; id <= COLS * ROWS; id++) rows.push(`${id};${colour(id).join(";")};sea;false;ocean;0`);
  write(m, "map/definition.csv", rows.join("\n") + "\n");
  write(m, "map/terrain.bmp", bmp8(W, H, () => OCEAN));
  write(m, "map/heightmap.bmp", bmp8(W, H, () => 89));
  regions.forEach((ids, i) => write(m, `map/strategicregions/r${i + 1}.txt`, `strategic_region={\n\tid=${i + 1}\n\tname="REGION_${i + 1}"\n\tprovinces={ ${ids.join(" ")} }\n\tweather={}\n}\n`));
  fs.mkdirSync(path.join(m, "history", "states"), { recursive: true });
  return m;
}
const defRows = (root) => {
  const out = new Map();
  for (const line of fs.readFileSync(path.join(root, "map", "definition.csv"), "utf8").split(/\r?\n/)) { const c = line.split(";"); if (c.length >= 7 && +c[0] > 0) out.set(+c[0], { type: c[4], terrain: c[6] }); }
  return out;
};
const statesOf = (m) => fs.readdirSync(path.join(m, "history", "states")).map((f) => {
  const t = fs.readFileSync(path.join(m, "history", "states", f), "utf8");
  return { id: +(/\bid\s*=\s*(\d+)/.exec(t) || [])[1], category: (/state_category\s*=\s*(\w+)/.exec(t) || [])[1] || "",
    provinces: ((/provinces\s*=\s*\{([^}]*)\}/.exec(t) || [])[1] || "").trim().split(/\s+/).map(Number).filter(Boolean) };
}).sort((a, b) => a.id - b.id);
/** province id → its pixels of index `t` in `root`'s terrain.bmp */
const countIndex = (root, t) => { const at = read8(path.join(root, "map", "terrain.bmp")), out = new Map(); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (at(x, y) === t) out.set(provAt(x, y), (out.get(provAt(x, y)) || 0) + 1); return out; };
/** province id → its pixel count, off the mod's own provinces.bmp */
const areasOf = (root) => {
  const b = fs.readFileSync(path.join(root, "map", "provinces.bmp")), off = b.readUInt32LE(10), rs = Math.floor((24 * W + 31) / 32) * 4, byColour = new Map(), out = new Map();
  for (let id = 1; id <= COLS * ROWS; id++) { const [r, g, bl] = colour(id); byColour.set((r << 16) | (g << 8) | bl, id); }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const o = off + (H - 1 - y) * rs + x * 3, id = byColour.get((b[o + 2] << 16) | (b[o + 1] << 8) | b[o]); out.set(id, (out.get(id) || 0) + 1); }
  return out;
};
/** What the layer below says, read off its own files: per category the ascending city ground of its urban provinces that carry any,
 *  every one of them together, and the mean over every urban province (the empty one counted, as coreArea counts it). */
const below = (game) => {
  const rows = defRows(game.root), city = countIndex(game.root, SPAWN), byCat = new Map(), all = [];
  const catOf = new Map(); for (const s of game.states) for (const p of s.provinces) catOf.set(p, s.category);
  const urban = [...rows].filter(([id, r]) => r.type === "land" && r.terrain === "urban").map(([id]) => id);
  for (const p of urban) { const n = city.get(p) || 0; if (!n) continue; all.push(n); if (!byCat.has(catOf.get(p))) byCat.set(catOf.get(p), []); byCat.get(catOf.get(p)).push(n); }
  for (const a of byCat.values()) a.sort((x, y) => x - y);
  all.sort((x, y) => x - y);
  return { byCat, all, urban: urban.length, coreArea: Math.max(1, Math.round(all.reduce((a, b) => a + b, 0) / urban.length)) };
};
/** The assignment, by this test's own loop: per category, provinces by area then id, the i-th of n takes list[floor((i + ½)·m/n)]. */
const expectSizes = (urban, catOf, areaOf, listOf) => {
  const out = new Map(), byCat = new Map();
  for (const p of urban) { const c = catOf.get(p); if (!byCat.has(c)) byCat.set(c, []); byCat.get(c).push(p); }
  for (const [c, ps] of byCat) {
    const src = listOf(c); if (!src) continue;
    ps.sort((a, b) => areaOf.get(a) - areaOf.get(b) || a - b);
    ps.forEach((p, i) => out.set(p, src[Math.min(src.length - 1, Math.floor((i + 0.5) * src.length / ps.length))]));
  }
  return out;
};
function world(game, tag, regions) {
  const mod = makeMod("mod-" + tag, regions);
  const r = md.generateLand({ modRoot: mod, gameRoot: game.root, dependencyRoots: [], count: regions.length * 3, provincesPerState: 3, seed: 3, ownerMode: "inherit", splitLargeProvinces: false });   // #a-raised-province-is-cut-to-land-size: not this test's subject — its fixture's cells are its provinces, and the cut would add more
  const states = statesOf(mod), rows = defRows(mod);
  const urban = [...rows].filter(([, v]) => v.type === "land" && v.terrain === "urban").map(([id]) => id).sort((a, b) => a - b);
  const catOf = new Map(); for (const s of states) for (const p of s.provinces) catOf.set(p, s.category);
  return { mod, r, states, urban, catOf, city: countIndex(mod, SPAWN), area: areasOf(mod) };
}

// ── the main layer below: city states hold towns of 12 / 30 / 20 / 42 px, town states 56 / 72 and one urban province with none ──
const CITY_CORES = [[idAt(0, 0), 12], [idAt(1, 2), 30], [idAt(2, 1), 20], [idAt(3, 3), 42]];
const TOWN_CORES = [[idAt(4, 0), 56], [idAt(5, 2), 0], [idAt(6, 1), 72]];
const G = makeGame("game-main", { categories: ["city", "city", "town", "town"], cores: new Map(CITY_CORES.concat(TOWN_CORES)), slots: null });
const B = below(G);

console.log("\n-- ⭐ 1. cityGroundBeneath lists each town below by its own size, per category --");
{
  const g = md.cityGroundBeneath({ modRoot: path.join(ROOT, "nothing"), gameRoot: G.root });
  const city = B.byCat.get("city"), town = B.byCat.get("town");
  ok(city && city.length === 4 && new Set(city).size === 4 && town && town.length === 2 && Math.max(...city) < Math.min(...town) && B.urban === city.length + town.length + 1,
    "(the fixture: four city towns of four sizes, two town towns of a disjoint range, and one urban province with no city ground)", { city, town, urban: B.urban });
  const listed = (c) => (g && g.coreSizesByCategory instanceof Map ? g.coreSizesByCategory.get(c) : undefined);
  ok(sameList(listed("city"), city), "⭐⭐ the city towns below, smallest first, each its own size", listed("city"));
  ok(sameList(listed("town"), town), "⭐ …and the town towns — the urban province with no city ground is not a town of 0 px", listed("town"));
  ok(g && sameList(g.coreSizes, B.all), "…and every town below together", g && g.coreSizes);
  ok(g && g.coreArea === B.coreArea, `CONTROL: coreArea is still the mean over EVERY urban province, the empty one counted (${B.coreArea})`, g && g.coreArea);
  const bare = md.cityGroundBeneath({ modRoot: path.join(ROOT, "nothing"), gameRoot: G.root, shares: false });
  ok(bare && sameList(bare.coreSizes, B.all) && bare.coreSizesByCategory instanceof Map && bare.coreSizesByCategory.size === 0, "a caller that only paints (shares: false) gets the sizes and no categories", bare && { s: bare.coreSizes, c: bare.coreSizesByCategory && bare.coreSizesByCategory.size });
  if (g && g.coreSizes) { g.coreSizes.push(999); g.coreSizes.reverse(); }
  if (bare && bare.coreSizes) bare.coreSizes.length = 0;
  const again = md.cityGroundBeneath({ modRoot: path.join(ROOT, "nothing"), gameRoot: G.root });
  ok(again && sameList(again.coreSizes, B.all), "⭐ the answer is remembered, and a caller that changes the list it was handed does not change the next answer", again && again.coreSizes);
}

console.log("\n-- ⭐ 2. townCoreSizes: the smallest province takes the smallest town --");
{
  ok(typeof md.townCoreSizes === "function", "map-data.js exports townCoreSizes");
  const S = (urban, sizesOf) => (typeof md.townCoreSizes === "function" ? md.townCoreSizes({ urban, sizesOf }) : new Map());
  const three = S([{ id: 1, category: "c", area: 300 }, { id: 2, category: "c", area: 100 }, { id: 3, category: "c", area: 200 }], () => [10, 20, 30]);
  ok(three.get(2) === 10 && three.get(3) === 20 && three.get(1) === 30, "⭐⭐ by area, not by id: 100 px → 10, 200 → 20, 300 → 30", [...three]);
  const tie = S([{ id: 7, category: "c", area: 50 }, { id: 4, category: "c", area: 50 }], () => [10, 20]);
  ok(tie.get(4) === 10 && tie.get(7) === 20, "an area tie goes to the lower id", [...tie]);
  const one = S([{ id: 1, category: "c", area: 9 }], () => [10, 20, 30, 40, 50]);
  ok(one.get(1) === 30, "one province takes the middle of the list, list[floor(m/2)]", [...one]);
  const list = [10, 20, 30], many = Array.from({ length: 7 }, (_, i) => ({ id: i + 1, category: "c", area: 100 - i }));
  const m = S(many, () => list), byArea = many.slice().sort((a, b) => a.area - b.area).map((u) => m.get(u.id));
  ok(byArea.length === 7 && byArea.every((v, i) => list.includes(v) && (i === 0 || v >= byArea[i - 1])) && new Set(byArea).size === list.length,
    "more provinces than towns: never decreasing with area, every one a size from the list, every size used", byArea);
  const mix = S([{ id: 1, category: "a", area: 1 }, { id: 2, category: "b", area: 2 }], (c) => (c === "a" ? [5, 6] : [70, 80]));
  ok([5, 6].includes(mix.get(1)) && [70, 80].includes(mix.get(2)), "categories never mix", [...mix]);
  const none = S([{ id: 1, category: "a", area: 1 }, { id: 2, category: "b", area: 2 }], (c) => (c === "a" ? null : [70]));
  ok(!none.has(1) && none.get(2) === 70, "a category with no list leaves its provinces out — the painter's mean stands for them", [...none]);
}

console.log("\n-- ⭐ 3. Generate land paints each town the size of one of its kind below, round its station --");
const A = world(G, "main", LAND_REGIONS);
{
  const terrain = A.r && A.r.heightmap && A.r.heightmap.terrain;
  ok(A.r && A.r.cities && A.r.cities.provinces > 0 && terrain && terrain.cities && terrain.cities.provinces > 0,
    "(guard: Generate land placed towns and the painter painted them)", A.r && (A.r.error || { cities: A.r.cities, terrain: terrain && terrain.cities }));
  const cats = new Set(A.states.map((s) => s.category));
  ok(cats.size === 2 && cats.has("city") && cats.has("town"), "(the fixture: the world is city and town states)", A.states.map((s) => [s.id, s.category]));
  const listOf = (c) => { const a = B.byCat.get(c); return a && a.length >= 2 ? a : (B.all.length ? B.all : null); };
  const want = expectSizes(A.urban, A.catOf, A.area, listOf);
  const byId = A.urban.slice().sort((a, b) => a - b), byArea = A.urban.slice().sort((a, b) => A.area.get(a) - A.area.get(b) || a - b);
  ok(byId.join() !== byArea.join(), "(the fixture: the urban provinces' area order is not their id order)", { byId, byArea });
  const painted = A.urban.map((p) => [p, A.city.get(p) || 0, Math.min(want.get(p), A.area.get(p))]);
  ok(painted.length === A.r.cities.provinces && painted.every(([, got, w]) => got === w), "⭐⭐⭐ each town is painted at exactly the size it was dealt — min(its size, its province)", painted);
  const cityTowns = A.urban.filter((p) => A.catOf.get(p) === "city").map((p) => A.city.get(p) || 0);
  ok(new Set(cityTowns).size >= 2, "⭐ the city towns are not one stamp: they come in more than one size", cityTowns);
  const range = (c) => [Math.min(...B.byCat.get(c)), Math.max(...B.byCat.get(c))];
  const inRange = (p) => { const [lo, hi] = range(A.catOf.get(p)), n = A.city.get(p) || 0; return n >= lo && n <= hi; };
  ok(A.urban.length && A.urban.every(inRange), "⭐⭐ every town state's town is in the town range below, every city state's in the city range", A.urban.map((p) => [p, A.catOf.get(p), A.city.get(p)]));
  // each town's core holds its province's supply_node row: the station stands in the town (#one-town-point-per-province)
  const at = read8(path.join(A.mod, "map", "terrain.bmp"));
  const sn = fs.readFileSync(path.join(A.mod, "map", "buildings.txt"), "utf8").split(/\r?\n/).map((l) => l.split(";"))
    .filter((c) => c.length >= 7 && c[1] === "supply_node").map((c) => ({ x: Math.floor(+c[2]), y: H - 1 - Math.floor(+c[4]) }));
  const stationIn = (p) => sn.filter((s) => provAt(s.x, s.y) === p);
  ok(A.urban.every((p) => stationIn(p).length === 1 && at(stationIn(p)[0].x, stationIn(p)[0].y) === SPAWN), "⭐ …and each town's core holds its province's supply_node row", A.urban.map((p) => [p, stationIn(p), stationIn(p)[0] && at(stationIn(p)[0].x, stationIn(p)[0].y)]));
  const v = A.urban.map((p) => A.city.get(p) || 0).sort((a, b) => a - b);
  const sizes = A.r.cities.sizes || {};
  ok(sizes.min === v[0] && sizes.median === v[v.length >> 1] && sizes.max === v[v.length - 1] && sizes.distinct === new Set(v).size, "the report says the sizes it drew: smallest, median, largest and how many distinct", { sizes, painted: v });
  ok(terrain && terrain.cities && terrain.cities.sized === A.r.cities.provinces, "…and the painter says every town took its own size", terrain && terrain.cities);
}

console.log("\n-- ⭐ 4. a category with ONE town below takes the whole map's towns --");
{
  const G4 = makeGame("game-onetown", { categories: ["city", "city", "town", "town"], cores: new Map(CITY_CORES.concat([[idAt(4, 0), 56], [idAt(6, 1), 0]])), slots: null });
  const B4 = below(G4);
  ok(sameList(B4.byCat.get("town"), [56]) && B4.all.some((n) => n < 56), "(the fixture: one town below carries city ground, and the whole map has smaller ones)", { town: B4.byCat.get("town"), all: B4.all });
  const F = world(G4, "onetown", LAND_REGIONS);
  const towns = F.urban.filter((p) => F.catOf.get(p) === "town").map((p) => F.city.get(p) || 0);
  ok(towns.length > 1 && towns.some((n) => n !== 56) && towns.every((n) => B4.all.includes(n)), "⭐⭐ one size is the stamp this removes: the town states take the whole map's towns, not 56 every time", towns);
}

console.log("\n-- 5. what has no sizes keeps the mean --");
{
  // the brush, applyProvinceDiff, a raise of one province: no sizes are passed, and the core is the layer below's mean, as before
  const mod = makeMod("mod-brush", LAND_REGIONS), p = idAt(0, 0), def = path.join(mod, "map", "definition.csv");
  fs.writeFileSync(def, fs.readFileSync(def, "utf8").split("\n").map((l) => (l.startsWith(`${p};`) ? l.replace(/;sea;false;ocean;0$/, ";land;false;urban;1") : l)).join("\n"));
  const r = md.sinkProvincesInHeightmap({ modRoot: mod, gameRoot: G.root, dependencyRoots: [], provinceIds: [p], raise: true });
  const n = countIndex(mod, SPAWN).get(p) || 0;
  ok(r && r.terrain && r.terrain.cities && r.terrain.cities.provinces === 1 && n === B.coreArea && !(r.terrain.cities.sized > 0), `a raise of one urban province with no sizes paints exactly the mean, ${B.coreArea} px`, { n, cities: r && r.terrain && r.terrain.cities });
  // …and the painter itself grows a core to the size it is handed, whoever hands it one: a size none of the towns below has
  const handed = makeMod("mod-handed", LAND_REGIONS), hdef = path.join(handed, "map", "definition.csv"), size = Math.max(...B.all) + B.coreArea;
  fs.writeFileSync(hdef, fs.readFileSync(hdef, "utf8").split("\n").map((l) => (l.startsWith(`${p};`) ? l.replace(/;sea;false;ocean;0$/, ";land;false;urban;1") : l)).join("\n"));
  const rh = md.sinkProvincesInHeightmap({ modRoot: handed, gameRoot: G.root, dependencyRoots: [], provinceIds: [p], raise: true, coreSizes: new Map([[p, size]]) });
  const nh = countIndex(handed, SPAWN).get(p) || 0;
  ok(size < areasOf(handed).get(p) && nh === size && rh.terrain && rh.terrain.cities && rh.terrain.cities.sized === 1, `⭐ the painter grows a core to the size it is handed (${size} px), not to the mean`, { nh, cities: rh && rh.terrain && rh.terrain.cities });
  const GU = makeGame("game-uniform", { categories: ["city", "city", "town", "town"], cores: new Map(CITY_CORES.concat(TOWN_CORES).filter(([, n]) => n > 0).map(([id]) => [id, 40])), slots: null });
  const U = world(GU, "uniform", LAND_REGIONS);
  ok(U.urban.length > 0 && U.urban.every((q) => U.city.get(q) === 40) && U.r.cities.sizes && U.r.cities.sizes.distinct === 1, "CONTROL: a layer below whose towns are all 40 px gives every town 40, today's answer", U.urban.map((q) => U.city.get(q)));
}

console.log("\n-- ⭐ 6. a category no state below uses takes its stand-in's towns --");
{
  // The ocean row comes up `rural`, which no state below uses; rural's 2 slots stand nearest small's 1, not big's 8. On Millennium
  // Dawn, MD: Damaged Continuum and Novum Vexillum every ocean-raised town is sized this way.
  const STAND_CORES = [[idAt(0, 0), 12], [idAt(1, 3), 18], [idAt(2, 1), 24], [idAt(3, 4), 30], [idAt(4, 2), 50], [idAt(5, 0), 56], [idAt(4, 4), 62]];
  const GS = makeGame("game-standin", { categories: ["big", "big", "small", "small"], cores: new Map(STAND_CORES), slots: { rural: 2, small: 1, big: 8 } });
  const BS = below(GS);
  const S = world(GS, "standin", LAND_REGIONS.concat(OCEAN_REGIONS));
  const model = md.buildMapModel({ modRoot: S.mod, gameRoot: GS.root, dependencyRoots: [] });
  const measured = new Map(); for (const s of GS.states) measured.set(s.category, (measured.get(s.category) || 0) + s.provinces.length);
  const stand = md.standInStateCategory("rural", measured, model.categorySlots);
  ok(stand === "small" && !BS.byCat.has("rural") && Math.max(...BS.byCat.get("big")) < Math.min(...BS.byCat.get("small")), "(the fixture: rural stands in as small, and big's towns and small's are disjoint)", { stand, byCat: [...BS.byCat] });
  const of = (c) => S.urban.filter((p) => S.catOf.get(p) === c).map((p) => S.city.get(p) || 0);
  const inList = (c, list) => of(c).length > 0 && of(c).every((n) => list.includes(n));
  ok(inList("rural", BS.byCat.get("small")), "⭐⭐ every rural town is the size of one of small's towns — its stand-in's — not one of big's", { rural: of("rural"), small: BS.byCat.get("small") });
  ok(inList("big", BS.byCat.get("big")) && inList("small", BS.byCat.get("small")), "CONTROL: big and small each take their own towns", { big: of("big"), small: of("small") });
}

// ── 7. the lights: the colour-map fixture of test-a-generated-city-is-a-core-not-a-province.js, its towns two sizes below ──────────
console.log("\n-- ⭐ 7. a town that is all city ground is lit whole; urban ground that is not is still capped at the mean --");
{
  const LW = [20, 12, 20, 12, 20, 12, 20, 12], LH = [14, 14, 14, 22], LC = 8, LR = 4;
  const LX = LW.map((_, i) => LW.slice(0, i).reduce((a, b) => a + b, 0)), LY = LH.map((_, i) => LH.slice(0, i).reduce((a, b) => a + b, 0));
  const LWW = LW.reduce((a, b) => a + b, 0), LHH = LH.reduce((a, b) => a + b, 0), TW = LWW / 2, TH = LHH / 2;
  const LSPAWN = 19, LFOREST = 1, LPLAINS = 0, LOCEAN = 15;
  const lid = (c, r) => r * LC + c + 1, lcell = (id) => [(id - 1) % LC, Math.floor((id - 1) / LC)];
  const lcol = (x) => LX.findIndex((x0, i) => x >= x0 && x < x0 + LW[i]), lrow = (y) => LY.findIndex((y0, i) => y >= y0 && y < y0 + LH[i]);
  const lprov = (x, y) => lid(lcol(x), lrow(y));
  const lland = (id) => lcell(id)[1] < 3;
  // two big towns (12 x 10 px) and two small ones (4 x 4), texel-aligned, so the mean core in texels falls between them
  const CORE_BOX = new Map([[lid(0, 0), [12, 10]], [lid(2, 2), [12, 10]], [lid(1, 1), [4, 4]], [lid(3, 0), [4, 4]]]);
  const inLCore = (x, y) => { const p = lprov(x, y), b = CORE_BOX.get(p); if (!b) return false; const lx = x - LX[lcol(x)], ly = y - LY[lrow(y)]; return lx >= 2 && lx < 2 + b[0] && ly >= 2 && ly < 2 + b[1]; };
  function makeDds(Wd, Hd, format, levels, fn) {
    const compressed = format !== "RGB32";
    const h = Buffer.alloc(128);
    h.write("DDS ", 0, "latin1"); h.writeUInt32LE(124, 4);
    h.writeUInt32LE(0x1007 | (levels > 1 ? 0x20000 : 0) | (compressed ? 0x80000 : 0x8), 8);
    h.writeUInt32LE(Hd, 12); h.writeUInt32LE(Wd, 16);
    h.writeUInt32LE(compressed ? Math.max(1, Math.ceil(Wd / 4)) * Math.max(1, Math.ceil(Hd / 4)) * 16 : Wd * 4, 20);
    h.writeUInt32LE(levels, 28); h.writeUInt32LE(32, 76);
    if (compressed) { h.writeUInt32LE(0x4, 80); h.write(format, 84, "latin1"); }
    else { h.writeUInt32LE(0x41, 80); h.writeUInt32LE(32, 88); h.writeUInt32LE(0xff0000, 92); h.writeUInt32LE(0xff00, 96); h.writeUInt32LE(0xff, 100); h.writeUInt32LE(0xff000000, 104); }
    h.writeUInt32LE(0x1000 | (levels > 1 ? 0x400008 : 0), 108);
    let size = 128, w = Wd, hh = Hd;
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
  /** cityGround: false declares the urban terrain WITHOUT spawn_city — urban ground that is not city ground */
  const lightGame = (tag, cityGround) => {
    const g = path.join(ROOT, tag);
    write(g, "hoi4.exe", "");
    write(g, "map/provinces.bmp", bmp24(LWW, LHH, (x, y) => colour(lprov(x, y))));
    const rows = ["0;0;0;0;land;false;unknown;0"];
    for (let id = 1; id <= LC * LR; id++) rows.push(`${id};${colour(id).join(";")};${lland(id) ? `land;false;${CORE_BOX.has(id) ? "urban" : "plains"};1` : "sea;false;ocean;0"}`);
    write(g, "map/definition.csv", rows.join("\n") + "\n");
    write(g, "map/terrain.bmp", bmp8(LWW, LHH, (x, y) => { const p = lprov(x, y); return !lland(p) ? LOCEAN : CORE_BOX.has(p) ? (inLCore(x, y) ? LSPAWN : LFOREST) : LPLAINS; }));
    write(g, "map/heightmap.bmp", bmp8(LWW, LHH, (x, y) => (lland(lprov(x, y)) ? 106 : 89)));
    write(g, "common/terrain/00_terrain.txt", ["categories = {", "  plains = { color = { 200 200 100 } }", "  forest = { color = { 0 120 0 } }", "  urban = { color = { 120 110 100 } }",
      "  ocean = { color = { 0 0 200 } is_water = yes }", "}", "terrain = {", "  plains = { type = plains color = { 0 } }", "  forest = { type = forest color = { 1 } }",
      `  terrain_city = { type = urban color = { 19 } texture = 10${cityGround ? " spawn_city = yes" : ""} }`, "  ocean = { type = ocean color = { 15 } }", "}", ""].join("\n"));
    for (const [s, c0] of [[1, 0], [2, 2], [3, 4], [4, 6]]) {
      const provs = []; for (let r = 0; r < 3; r++) for (const c of [c0, c0 + 1]) provs.push(lid(c, r));
      write(g, `history/states/${s}-S.txt`, `state={\n\tid=${s}\n\tname="STATE_${s}"\n\tmanpower=100000\n\tstate_category=${s <= 2 ? "metropolis" : "wasteland"}\n\tprovinces={ ${provs.join(" ")} }\n\thistory={\n\t\towner=AAA\n\t}\n}\n`);
    }
    // the night lights, painted FOR this map: lit over each town's core, dark everywhere else
    const texel = (X, Y) => { const x = 2 * X, y = 2 * Y, p = lprov(x, y); return { land: lland(p), core: inLCore(x, y) }; };
    write(g, "map/terrain/colormap_rgb_cityemissivemask_a.dds", makeDds(TW, TH, "RGB32", 1, (X, Y) => { const t = texel(X, Y); return t.core ? [120, 110, 100, 173] : t.land ? [150, 120, 60, 0] : [79, 102, 141, 0]; }));
    for (const [n, s] of [["colormap_water_0.dds", 1], ["colormap_water_1.dds", 2], ["colormap_water_2.dds", 4]]) {
      write(g, "map/terrain/" + n, makeDds(TW / s, TH / s, "DXT5", 1, (X, Y) => (texel(X * s, Y * s).land ? [60, 70, 60, 255] : [35, 59, 81, 255])));
    }
    write(g, "map/terrain/fow_rgb_waterspec_a.dds", makeDds(TW, TH, "DXT5", 6, (X, Y, l) => (texel(Math.min(TW - 1, X << l), Math.min(TH - 1, Y << l)).land ? [140, 140, 140, 21] : [90, 90, 90, 40])));
    return g;
  };
  const lightMod = (tag) => {
    const m = path.join(ROOT, tag);
    write(m, "descriptor.mod", 'name="town lights"\nreplace_path="history/states"\n');
    write(m, "map/provinces.bmp", bmp24(LWW, LHH, (x, y) => colour(lprov(x, y))));
    const rows = ["0;0;0;0;land;false;unknown;0"];
    for (let id = 1; id <= LC * LR; id++) rows.push(`${id};${colour(id).join(";")};sea;false;ocean;0`);
    write(m, "map/definition.csv", rows.join("\n") + "\n");
    write(m, "map/terrain.bmp", bmp8(LWW, LHH, () => LOCEAN));
    write(m, "map/heightmap.bmp", bmp8(LWW, LHH, () => 89));
    for (let r = 0; r < 4; r++) {
      const ids = []; for (let row = 0; row < LR; row++) for (const c of [2 * r, 2 * r + 1]) ids.push(lid(c, row));
      write(m, `map/strategicregions/r${r + 1}.txt`, `strategic_region={\n\tid=${r + 1}\n\tname="REGION_${r + 1}"\n\tprovinces={ ${ids.join(" ")} }\n\tweather={}\n}\n`);
    }
    fs.mkdirSync(path.join(m, "history", "states"), { recursive: true });
    return m;
  };
  // the texel rule the colour map is read by (textureMapLayer): the index most of a texel's four pixels carry, the earliest on a tie
  const mostOf = (a, b, c, d) => (a === b || a === c || a === d ? a : b === c || b === d ? b : c === d ? c : a);
  const texelIdx = (root) => { const at = read8(path.join(root, "map", "terrain.bmp")), out = new Uint8Array(TW * TH); for (let Y = 0; Y < TH; Y++) for (let X = 0; X < TW; X++) out[Y * TW + X] = mostOf(at(2 * X, 2 * Y), at(2 * X + 1, 2 * Y), at(2 * X, 2 * Y + 1), at(2 * X + 1, 2 * Y + 1)); return out; };
  /** the mean lit core below, in texels — its urban texels over its urban provinces, which is what the repaint caps a core at */
  const meanBelow = (g) => { const t = texelIdx(g), urbanRows = [...defRows(g)].filter(([, r]) => r.type === "land" && r.terrain === "urban").length; let n = 0; for (let i = 0; i < TW * TH; i++) if (t[i] === LSPAWN && lland(lprov(2 * (i % TW), 2 * Math.floor(i / TW)))) n++; return n / urbanRows; };
  /** each 4-connected patch of urban texels the write made, with how many of its texels are lit */
  const patches = (m) => {
    const b = fs.readFileSync(path.join(m, "map", "terrain", "colormap_rgb_cityemissivemask_a.dds")), h = dds.parseDdsHeader(b), rgba = dds.decodeDdsLevel(b, h, 0);
    const t = texelIdx(m), seen = new Uint8Array(TW * TH), out = [];
    for (let s = 0; s < TW * TH; s++) {
      if (seen[s] || t[s] !== LSPAWN) continue;
      const comp = [s]; seen[s] = 1;
      for (let k = 0; k < comp.length; k++) { const i = comp[k], X = i % TW; for (const q of [X > 0 ? i - 1 : -1, X < TW - 1 ? i + 1 : -1, i - TW, i + TW]) { if (q < 0 || q >= TW * TH || seen[q] || t[q] !== LSPAWN) continue; seen[q] = 1; comp.push(q); } }
      out.push({ size: comp.length, lit: comp.filter((i) => rgba[i * 4 + 3] > 0).length, province: lprov(2 * (comp[0] % TW), 2 * Math.floor(comp[0] / TW)) });
    }
    return out.sort((a, b) => a.size - b.size || a.province - b.province);
  };
  const LG = lightGame("game-lights", true), mean = meanBelow(LG);
  const big = (CORE_BOX.get(lid(0, 0))[0] * CORE_BOX.get(lid(0, 0))[1]) / 4, small = (CORE_BOX.get(lid(1, 1))[0] * CORE_BOX.get(lid(1, 1))[1]) / 4;
  ok(small < mean && mean < big, `(the fixture: the mean lit core below, ${mean} texels, falls between its small towns (${small}) and its big ones (${big}))`, { small, mean, big });
  const LM = lightMod("mod-lights");
  const r = md.generateLand({ modRoot: LM, gameRoot: LG, dependencyRoots: [], count: LC * LR, provincesPerState: 8, seed: 3 });
  const towns = r && r.changed ? patches(LM) : [];
  ok(towns.length > 0 && r.cities && r.cities.sizes && r.cities.sizes.distinct > 1, "(guard: Generate land drew towns of more than one size, and the textures were repainted)", r && (r.error || { cities: r.cities, towns }));
  const largest = towns[towns.length - 1] || { size: 0, lit: 0 };
  ok(largest.size > mean && largest.lit === largest.size, `⭐⭐ the biggest town is lit over all of its ${largest.size} texels — not capped at the mean core, ${Math.round(mean)}`, towns);
  ok(towns.length > 1 && towns.every((p) => p.lit === p.size), "⭐ …and every town is lit over its own city ground, small and big", towns);
  // CONTROL: the urban terrain is not city ground — the painter paints a province whole with it, and the repaint caps its light at the mean
  const NG = lightGame("game-lights-nocity", false), meanN = meanBelow(NG), NM = lightMod("mod-lights-nocity"), p = lid(0, 0), def = path.join(NM, "map", "definition.csv");
  fs.writeFileSync(def, fs.readFileSync(def, "utf8").split("\n").map((l) => (l.startsWith(`${p};`) ? l.replace(/;sea;false;ocean;0$/, ";land;false;urban;1") : l)).join("\n"));
  const rn = md.sinkProvincesInHeightmap({ modRoot: NM, gameRoot: NG, dependencyRoots: [], provinceIds: [p], raise: true });
  const whole = rn && rn.changed ? patches(NM) : [];
  ok(whole.length === 1 && whole[0].size > meanN && whole[0].lit === Math.max(1, Math.round(Math.min(whole[0].size, meanN))),
    `CONTROL: urban ground that is not city ground is painted whole (${whole[0] && whole[0].size} texels) and lit at the mean core, ${Math.round(meanN)}`, { whole, meanN, r: rn && (rn.error || rn.reason) });
}

try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) { /* scratch only */ }
console.log("\n" + (fail ? "FAILED " + fail + "/" + (pass + fail) : "PASSED " + pass + "/" + pass));
process.exitCode = fail ? 1 : 0;
