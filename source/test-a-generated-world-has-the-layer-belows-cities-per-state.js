// ⛔ #a-generated-world-has-the-layer-belows-cities-per-state — CITIES ARE COUNTED PER STATE, NOT PER PROVINCE.
//
// The owner played TEST 31 (09-30): "not all cities seem to have a city graphics, some only have factories". Generate land took the
// layer below's urban share of each state_category's LAND — urban provinces ÷ land provinces — and gave a category that share of its
// own provinces. But a generated world is built out of the old ocean's provinces, three to five times the size of the base game's:
// TEST 31's states hold 3.7–5.3 provinces each where vanilla's hold 10–20. So the same share of far fewer provinces came to 90
// cities in 90 of 1,081 states — 4 of its 13 megalopolis states and 9 of its 18 metropolis states had one — against the 265 urban
// provinces vanilla spreads over its 1,081 states. What a player compares is per state: does this star have a town?
//
// So the count is the layer below's urban provinces PER STATE of the category (vanilla: megalopolis 1.75, metropolis 1.42,
// large_city 0.95, city 0.65, town 0.28, rural 0.08) times the states the generated world has in it. Pinned on a layer below of four
// `city` states of ten provinces, one of them a city, under a generated world of six `city` states of three provinces: per state
// that is six cities, one to a state, each on its town province; per province it was round(0.1 × 18) = 2. Every expected count is
// derived from the fixture's own states, never typed in. And the fallbacks are the ones the share has: a category no state below
// uses asks the category that stands in for it (#a-placeholder-state-stands-for-the-states-below), then the map-wide rate; with no
// layer below to ask, the elevation table's share of the land stands, as it always did.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-cities-per-state-"));
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

// ── the world: 8 x 6 provinces, id = row * 8 + col + 1 ────────────────────────────────────────────────────────────────────────
//   layer below   rows 0-4 land in FOUR states of two columns each — ten provinces a state — and row 5 open ocean. Each urban
//                 province carries a 40 px core of city ground.
//   the mod       the same shapes, all sea (what Delete map leaves). Its strategic regions are three provinces in a row, so each
//                 becomes ONE generated state of three provinces: six over the old land (rows 0-2, columns 0-2 and 3-5) and, where
//                 a fixture asks, two over the old ocean (row 5), which nobody held and Generate land writes `rural`.
// ⚠ The columns are NOT equal: in every generated state the middle province is the smallest that still holds the core, so a
// state's town province is neither its first nor its largest and "on its town province" cannot pass by either accident.
const COLW = [20, 12, 16, 20, 12, 16, 12, 12], ROWH = [14, 14, 14, 14, 14, 22], COLS = 8, ROWS = 6, LAND_ROWS = 5;
const COLX = COLW.map((_, i) => COLW.slice(0, i).reduce((a, b) => a + b, 0)), ROWY = ROWH.map((_, i) => ROWH.slice(0, i).reduce((a, b) => a + b, 0));
const W = COLW.reduce((a, b) => a + b, 0), H = ROWH.reduce((a, b) => a + b, 0);
const SPAWN = 13, PLAINS = 0, OCEAN = 15;
const idAt = (c, r) => r * COLS + c + 1;
const cellOfId = (id) => [(id - 1) % COLS, Math.floor((id - 1) / COLS)];
const colOf = (x) => COLX.findIndex((x0, i) => x >= x0 && x < x0 + COLW[i]), rowOf = (y) => ROWY.findIndex((y0, i) => y >= y0 && y < y0 + ROWH[i]);
const provAt = (x, y) => idAt(colOf(x), rowOf(y));
const areaOf = (id) => { const [c, r] = cellOfId(id); return COLW[c] * ROWH[r]; };
const colour = (id) => [(id * 29) % 256, (id * 67) % 256, 30 + id];
const belowLand = (id) => cellOfId(id)[1] < LAND_ROWS;
const inBelowCore = (x, y) => { const lx = x - COLX[colOf(x)], ly = y - ROWY[rowOf(y)]; return lx >= 2 && lx < 10 && ly >= 4 && ly < 9; };   // 8 x 5 = 40 px
const CORE_BELOW = 40;
const LAND_REGIONS = [0, 1, 2].flatMap((r) => [[0, 1, 2], [3, 4, 5]].map((cols) => cols.map((c) => idAt(c, r))));
const OCEAN_REGIONS = [[0, 1, 2], [3, 4, 5]].map((cols) => cols.map((c) => idAt(c, LAND_ROWS)));
const slotFile = (slots) => `state_categories = {\n${Object.entries(slots).map(([k, v]) => `\t${k} = { local_building_slots = ${v} }`).join("\n")}\n}\n`;

/** o: { categories (one per state below, by its first column 0, 2, 4, 6), urban (Set of ids typed urban below),
 *       slots (null: no common/state_category anywhere), noCityGround (the urban provinces carry no city ground) } */
function makeGame(tag, o) {
  const g = path.join(ROOT, tag);
  write(g, "hoi4.exe", "");
  write(g, "map/provinces.bmp", bmp24(W, H, (x, y) => colour(provAt(x, y))));
  const rows = ["0;0;0;0;land;false;unknown;0"];
  for (let id = 1; id <= COLS * ROWS; id++) rows.push(`${id};${colour(id).join(";")};${belowLand(id) ? `land;false;${o.urban.has(id) ? "urban" : "plains"};1` : "sea;false;ocean;0"}`);
  write(g, "map/definition.csv", rows.join("\n") + "\n");
  write(g, "map/terrain.bmp", bmp8(W, H, (x, y) => { const p = provAt(x, y); return !belowLand(p) ? OCEAN : (o.urban.has(p) && inBelowCore(x, y) && !o.noCityGround) ? SPAWN : PLAINS; }));
  write(g, "map/heightmap.bmp", bmp8(W, H, (x, y) => (belowLand(provAt(x, y)) ? 106 : 89)));
  write(g, "common/terrain/00_terrain.txt", ["categories = {", "  plains = { color = { 200 200 100 } }", "  urban = { color = { 120 110 100 } }", "  ocean = { color = { 0 0 200 } is_water = yes }", "}",
    "terrain = {", "  plains = { type = plains color = { 0 } }", "  terrain_city = { type = urban color = { 13 } spawn_city = yes }", "  ocean = { type = ocean color = { 15 } }", "}", ""].join("\n"));
  if (o.slots) write(g, "common/state_category/cats.txt", slotFile(o.slots));
  const states = o.categories.map((cat, k) => {
    const provinces = []; for (let r = 0; r < LAND_ROWS; r++) for (const c of [2 * k, 2 * k + 1]) provinces.push(idAt(c, r));
    // a category of "" is a state that writes no state_category line at all
    write(g, `history/states/${k + 1}-S.txt`, `state={\n\tid=${k + 1}\n\tname="STATE_${k + 1}"\n\tmanpower=100000\n${cat ? `\tstate_category=${cat}\n` : ""}\tprovinces={ ${provinces.join(" ")} }\n\thistory={\n\t\towner=AAA\n\t\tvictory_points = { ${provinces[0]} 5 }\n\t}\n}\n`);
    return { id: k + 1, category: cat, provinces };
  });
  return { root: g, states, urban: o.urban };
}
function makeMod(tag, regions) {
  const m = path.join(ROOT, tag);
  write(m, "descriptor.mod", 'name="cities per state"\nreplace_path="history/states"\n');
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
const urbanOf = (m) => {
  const out = new Set();
  for (const line of fs.readFileSync(path.join(m, "map", "definition.csv"), "utf8").split(/\r?\n/)) { const c = line.split(";"); if (c.length >= 7 && c[4] === "land" && c[6] === "urban") out.add(+c[0]); }
  return out;
};
const statesOf = (m) => fs.readdirSync(path.join(m, "history", "states")).map((f) => {
  const t = fs.readFileSync(path.join(m, "history", "states", f), "utf8");
  return { id: +(/\bid\s*=\s*(\d+)/.exec(t) || [])[1], category: (/state_category\s*=\s*(\w+)/.exec(t) || [])[1] || "",
    provinces: ((/provinces\s*=\s*\{([^}]*)\}/.exec(t) || [])[1] || "").trim().split(/\s+/).map(Number).filter(Boolean),
    vp: +((/victory_points\s*=\s*\{\s*(\d+)/.exec(t) || [])[1] || 0) };
}).sort((a, b) => a.id - b.id);
/** What the layer below holds per category, read off the fixture itself: { states, land, urban } — and "*" for all of it. */
const below = (game) => {
  const out = new Map();
  const add = (k, s) => { const a = out.get(k) || { states: 0, land: 0, urban: 0 }; a.states++; a.land += s.provinces.length; a.urban += s.provinces.filter((p) => game.urban.has(p)).length; out.set(k, a); };
  for (const s of game.states) { if (s.category) add(s.category, s); add("*", s); }
  return out;
};
/** the fixture's own answer for a state's town province: the smallest that holds the core (every province here has a 3x3 of its own) */
const townOf = (s) => s.provinces.filter((p) => areaOf(p) >= CORE_BELOW).sort((a, b) => areaOf(a) - areaOf(b) || a - b)[0];
const largestOf = (s) => s.provinces.slice().sort((a, b) => areaOf(b) - areaOf(a) || a - b)[0];
function world(game, tag, regions) {
  const mod = makeMod("mod-" + tag, regions);
  const r = md.generateLand({ modRoot: mod, gameRoot: game.root, dependencyRoots: [], count: regions.length * 3, provincesPerState: 3, seed: 3, ownerMode: "inherit", splitLargeProvinces: false });   // #a-raised-province-is-cut-to-land-size: not this test's subject — its fixture's cells are its provinces, and the cut would add more
  const states = statesOf(mod), urban = urbanOf(mod);
  const citiesIn = (list) => list.reduce((a, s) => a + s.provinces.filter((p) => urban.has(p)).length, 0);
  return { mod, r, states, urban, citiesIn, of: (cat) => states.filter((s) => s.category === cat) };
}

// ── 1. four `city` states of ten provinces below, one city each → six generated `city` states of three provinces ──────────────
console.log("\n-- the layer below: four city states of ten provinces, one of them a city --");
const G1 = makeGame("game-city", { categories: ["city", "city", "city", "city"], urban: new Set([idAt(0, 0), idAt(2, 1), idAt(4, 2), idAt(6, 3)]), slots: null });
const B1 = below(G1), PER_STATE = B1.get("city").urban / B1.get("city").states, PER_PROVINCE = B1.get("city").urban / B1.get("city").land;
{
  const g = md.cityGroundBeneath({ modRoot: path.join(ROOT, "nothing"), gameRoot: G1.root });
  ok(g && g.coreArea === CORE_BELOW, "one urban province below carries 40 px of city ground", g && g.coreArea);
  ok(g && g.perStateByCategory instanceof Map && g.perStateByCategory.get("city") === PER_STATE && g.perState === B1.get("*").urban / B1.get("*").states,
    `⭐⭐ cityGroundBeneath says how many urban provinces a city STATE below holds (${PER_STATE}), and a state of any kind`, g && { perState: g.perState, byCategory: g.perStateByCategory && [...g.perStateByCategory] });
  ok(g && Math.abs(g.shareByCategory.get("city") - PER_PROVINCE) < 1e-9, `CONTROL: …beside the share of a city state's LAND it has always given (${PER_PROVINCE})`, g && [...g.shareByCategory]);
  const bare = md.cityGroundBeneath({ modRoot: path.join(ROOT, "nothing"), gameRoot: G1.root, shares: false });
  ok(bare && bare.perStateByCategory instanceof Map && bare.perStateByCategory.size === 0 && bare.perState === null, "a caller that only paints (shares: false) is handed no rate, as it is handed no share", bare && { perState: bare.perState });
}

console.log("\n-- ⭐ 1. six generated city states of three provinces get six cities, one each, on their town province --");
const A = world(G1, "city", LAND_REGIONS);
const WANT = Math.round(PER_STATE * A.of("city").length), OLD = Math.round(PER_PROVINCE * A.of("city").reduce((a, s) => a + s.provinces.length, 0));
{
  ok(A.r && A.r.changed && A.states.length === LAND_REGIONS.length && A.states.every((s) => s.provinces.length === 3 && s.category === "city"),
    "Generate land raised six states of three provinces, each taking the layer below's category", A.r && (A.r.error || A.states.map((s) => [s.id, s.category, s.provinces.length])));
  ok(WANT === A.states.length && OLD < WANT && OLD > 0, `(the fixture tells the two rules apart: per state ${WANT} cities, per province ${OLD})`, { WANT, OLD });
  ok(A.urban.size === WANT, `⭐⭐⭐ the world has the layer below's cities PER STATE: ${WANT}, not its share of the provinces (${OLD})`, [...A.urban]);
  ok(A.states.every((s) => A.citiesIn([s]) === 1), "⭐⭐ …one to every state — no star without a town", A.states.map((s) => [s.id, A.citiesIn([s])]));
  ok(A.states.every((s) => townOf(s) !== largestOf(s) && townOf(s) !== s.provinces.slice().sort((a, b) => a - b)[0]), "(the fixture: a state's town province is neither its largest nor its first)", A.states.map((s) => [townOf(s), largestOf(s)]));
  ok(A.states.every((s) => s.vp === townOf(s) && A.urban.has(s.vp)), "⭐⭐ …each on that state's town province, where its victory point is", A.states.map((s) => [s.vp, townOf(s), A.urban.has(s.vp)]));
  ok(A.r.cities && A.r.cities.provinces === WANT && A.r.cities.states === A.states.length && A.r.cities.fromLayerBelow === true,
    "the report says how many cities it placed, in how many states, and that the layer below decided", A.r.cities);
  const at = read8(path.join(A.mod, "map", "terrain.bmp")), core = new Map();
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (at(x, y) === SPAWN) core.set(provAt(x, y), (core.get(provAt(x, y)) || 0) + 1);
  ok(core.size === WANT && [...A.urban].every((p) => core.get(p) === CORE_BELOW), "⭐ …and each is painted: one 40 px core of city ground in every state, which is what the game builds a town on", [...core]);
}

console.log("\n-- ⭐ 2. the chooser: a rate per state, handed out one to a state per round, largest state first --");
{
  const three = [{ id: 1, provinces: [11, 12], category: "c", vpProvince: 12 }, { id: 2, provinces: [21, 22, 23, 24, 25], category: "c", vpProvince: 23 }, { id: 3, provinces: [31, 32, 33], category: "c", vpProvince: 31 }];
  const pick = (perState, share = 0, states = three) => [...md.chooseUrbanProvinces({ states, shareOf: () => share, perStateOf: perState, adj: null, areaOf: new Map() })].sort((a, b) => a - b);
  ok(pick(() => 2 / 3).join() === "23,31", "fewer cities than states (2 for 3) go to the biggest states, each on its victory point", pick(() => 2 / 3));
  ok(pick(() => 1).join() === "12,23,31", "one a state puts one on every victory point", pick(() => 1));
  const four = pick(() => 4 / 3);
  ok(four.length === 4 && [12, 23, 31].every((p) => four.includes(p)) && four.filter((p) => p > 20 && p < 30).length === 2, "…and the one left over after every state has its first goes to the largest state as its second", four);
  ok(pick(() => 5, 0, [three[0]]).join() === "11,12", "a rate above what a state holds is capped at its land", pick(() => 5, 0, [three[0]]));
  ok(pick(() => 0, 1).length === 0, "a rate of none is none, whatever the share of the land says — the rate decides when there is one", pick(() => 0, 1));
  // round(0.2 × 10 provinces) = 2: the count it always made, when nothing below gives a rate per state
  ok(pick(() => null, 0.2).join() === "23,31" && pick(null, 0.2).join() === "23,31" && [...md.chooseUrbanProvinces({ states: three, shareOf: () => 0.2 })].length === 2,
    "CONTROL: with no rate to ask (none given, or none for that category) the count is the share of the land, as before", { none: pick(() => null, 0.2), nofn: pick(null, 0.2) });
}

// ── 3. a category no state below uses: the ocean row comes up `rural`, and rural stands in for `small` (its nearest slots) ──────
console.log("\n-- ⭐ 3. a category no state below uses takes its stand-in's rate per state --");
const STAND_URBAN = new Set([idAt(0, 0), idAt(1, 3), idAt(2, 1), idAt(3, 4), idAt(4, 2)]);
const STAND = { categories: ["big", "big", "small", "small"], urban: STAND_URBAN };
const G2 = makeGame("game-standin", { ...STAND, slots: { rural: 2, small: 1, big: 8 } });
const B2 = below(G2), rate = (k) => B2.get(k).urban / B2.get(k).states, share = (k) => B2.get(k).urban / B2.get(k).land;
const S = world(G2, "standin", LAND_REGIONS.concat(OCEAN_REGIONS));
{
  const rural = S.of("rural"), landOf = (l) => l.reduce((a, s) => a + s.provinces.length, 0);
  ok(S.r && S.r.changed && rural.length === OCEAN_REGIONS.length && rural.every((s) => s.provinces.every((p) => !belowLand(p))) && !B2.has("rural"),
    "the two states raised from open ocean are written rural, a category no state below uses", S.states.map((s) => [s.id, s.category]));
  const model = md.buildMapModel({ modRoot: S.mod, gameRoot: G2.root, dependencyRoots: [] });
  const measured = new Map([...B2].filter(([k]) => k !== "*").map(([k, v]) => [k, v.land]));
  ok(md.standInStateCategory("rural", measured, model.categorySlots) === "small", "(the fixture: rural's 2 slots stand nearest small's 1, not big's 8)", model.categorySlots);
  const want = Math.round(rate("small") * rural.length), mean = Math.round(rate("*") * rural.length), perProvince = Math.round(share("small") * landOf(rural));
  ok(want > 0 && want !== mean && want !== perProvince, `(the fixture tells them apart: small's rate gives ${want}, the map-wide rate ${mean}, small's share of the land ${perProvince})`, { want, mean, perProvince });
  ok(S.citiesIn(rural) === want, `⭐⭐ the rural states get small's cities per state (${want} between them), not the map-wide rate (${mean})`, rural.map((s) => [s.id, S.citiesIn([s])]));
  ok(rural.filter((s) => S.citiesIn([s])).every((s) => S.urban.has(s.vp) && s.vp === townOf(s)), "…on the town province of the state that got it", rural.map((s) => [s.vp, townOf(s)]));
  const big = S.of("big"), small = S.of("small");
  ok(big.length > 0 && small.length > 0 && big.length + small.length === LAND_REGIONS.length
    && S.citiesIn(big) === Math.min(landOf(big), Math.round(rate("big") * big.length)) && S.citiesIn(small) === Math.round(rate("small") * small.length),
    "CONTROL: a measured category answers for itself — big and small each take their own rate", { big: [big.length, S.citiesIn(big), rate("big")], small: [small.length, S.citiesIn(small), rate("small")] });
  ok(big.every((s) => S.citiesIn([s]) >= 1) && S.citiesIn(big) > big.length, "…and a category with more than one city a state gives every state its first before any its second", big.map((s) => S.citiesIn([s])));
}

console.log("\n-- ⭐ 4. with no stand-in to ask, the map-wide rate per state --");
{
  // the same layer below with no common/state_category anywhere: nothing says what rural's slots are, so nothing stands in for it
  const G3 = makeGame("game-noslots", { ...STAND, slots: null });
  const N = world(G3, "noslots", LAND_REGIONS.concat(OCEAN_REGIONS));
  const rural = N.of("rural"), landN = rural.reduce((a, s) => a + s.provinces.length, 0);
  const mean = Math.round(rate("*") * rural.length), perProvince = Math.round(share("*") * landN);
  ok(rural.length === OCEAN_REGIONS.length && mean !== perProvince, `(the fixture: the map-wide rate gives the rural states ${mean}, the map-wide share of their land ${perProvince})`, { mean, perProvince });
  ok(N.citiesIn(rural) === mean, `⭐⭐ the rural states get the map-wide cities per state (${mean}), not the map-wide share of their provinces (${perProvince})`, rural.map((s) => [s.id, N.citiesIn([s])]));
}

console.log("\n-- 5. CONTROL: with no city ground below to measure, the elevation table's share of the land, as before --");
{
  const G4 = makeGame("game-nocity", { categories: ["city", "city", "city", "city"], urban: G1.urban, slots: null, noCityGround: true });
  ok(md.cityGroundBeneath({ modRoot: path.join(ROOT, "nothing"), gameRoot: G4.root }) === null, "(a layer below whose urban provinces carry no city ground gives no answer)");
  const C = world(G4, "nocity", LAND_REGIONS);
  const table = Math.round(md.urbanShareOfTheElevationTable() * LAND_REGIONS.length * 3);
  // ⚠️ MOVED WITH #every-generated-capital-has-a-city: the table's share is the count; a capital it gives no city gets one on top
  const capsC = (C.r && C.r.cities && C.r.cities.forCapitals) || [];
  ok(C.r && C.r.changed && C.r.cities && C.r.cities.fromLayerBelow === false && C.urban.size - capsC.length === table && table < LAND_REGIONS.length,
    `the count is the table's share of the ${LAND_REGIONS.length * 3} provinces (${table}) — not one a state, which nothing below said`, { cities: C.r && C.r.cities, urban: [...C.urban], table });
}

console.log("\n-- 6. the map-wide rate is over EVERY state below, one that writes no category included --");
{
  // two `city` states and two that write no state_category, three urban provinces between the four. "Every state together"
  // means those two as well: leave them out and the same three cities are shared between two states, twice the rate.
  const G5 = makeGame("game-nocat", { categories: ["city", "city", "", ""], urban: new Set([idAt(0, 0), idAt(4, 2), idAt(6, 3)]), slots: null });
  const B5 = below(G5), all = B5.get("*"), named = B5.get("city");
  ok(all.states === G5.states.length && named.states < all.states && all.urban > named.urban && all.urban / all.states !== all.urban / named.states,
    `(the fixture: ${all.urban} cities over ${all.states} states is ${all.urban / all.states} a state; over the ${named.states} that name a category it would be ${all.urban / named.states})`, [...B5]);
  const g = md.cityGroundBeneath({ modRoot: path.join(ROOT, "nothing"), gameRoot: G5.root });
  ok(g && g.perState === all.urban / all.states, `⭐⭐ cityGroundBeneath's map-wide rate counts the states with no category: ${all.urban / all.states} a state`, g && g.perState);
  ok(g && g.perStateByCategory.size === 1 && g.perStateByCategory.get("city") === named.urban / named.states && Math.abs(g.share - all.urban / all.land) < 1e-9,
    "CONTROL: …they are in no category's rate, and the map-wide share of the land counts their provinces as it always did", g && { byCategory: [...g.perStateByCategory], share: g.share });
  // …and a world raised over those two states' land: nothing below names a category for it, so it is written rural, and with
  // no common/state_category nothing stands in for rural — the map-wide rate decides
  const NOCAT_REGIONS = [0, 1, 2].map((r) => [4, 5, 6].map((c) => idAt(c, r)));
  const U = world(G5, "nocat", NOCAT_REGIONS), rural = U.of("rural");
  const want = Math.round(all.urban / all.states * rural.length), over = Math.round(all.urban / named.states * rural.length);
  ok(rural.length === NOCAT_REGIONS.length && want > 0 && want !== over, `(the fixture: three rural states — the map-wide rate gives them ${want} cities, the rate over named states only ${over})`, U.states.map((s) => [s.id, s.category]));
  // ⚠️ MOVED WITH #every-generated-capital-has-a-city: the count is the rate's; a capital it passed over gets one on top (forCapitals)
  const capsU = ((U.r && U.r.cities && U.r.cities.forCapitals) || []).filter((p) => rural.some((s) => s.provinces.includes(p)));
  ok(U.citiesIn(rural) - capsU.length === want, `⭐⭐ a generated world counts by it: ${want} cities, not ${over}`, { capitals: capsU, perState: rural.map((s) => [s.id, U.citiesIn([s])]) });
}

console.log("\n-- 7. a layer below with cities and no states: no rate to ask, so the share of the land --");
{
  // City ground below, and not one state file: there is a core size to measure and nothing to count states by, so the
  // map-wide rate is null — "no rate", not "a rate of none". The chooser then keeps the share, which with no state below
  // to measure either is the elevation table's.
  const G6 = makeGame("game-nostates", { categories: [], urban: G1.urban, slots: null });
  const g = md.cityGroundBeneath({ modRoot: path.join(ROOT, "nothing"), gameRoot: G6.root });
  ok(g && g.coreArea === CORE_BELOW && g.perState === null && g.share === null && g.perStateByCategory.size === 0, "(the fixture: the layer below has city ground to measure and no state to count by — its map-wide rate is null)", g && { coreArea: g.coreArea, perState: g.perState, share: g.share });
  const regions = LAND_REGIONS.concat(OCEAN_REGIONS);
  const Z = world(G6, "nostates", regions);
  const table = Math.round(md.urbanShareOfTheElevationTable() * regions.length * 3);
  ok(table > 0 && table < regions.length, `(the fixture: the elevation table's share of ${regions.length * 3} provinces is ${table} — neither none nor one a state)`, table);
  ok(Z.r && Z.r.changed && Z.r.cities && Z.r.cities.fromLayerBelow === true && Z.urban.size === table,
    `⭐⭐ a null rate is not a rate of none: the world gets the ${table} the share of its land gives, not 0`, { cities: Z.r && (Z.r.error || Z.r.cities), urban: [...Z.urban] });
}

try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) { /* scratch only */ }
console.log("\n" + (fail ? "FAILED " + fail + "/" + (pass + fail) : "PASSED " + pass + "/" + pass));
process.exitCode = fail ? 1 : 0;
