// ⛔ #a-placeholder-state-stands-for-the-states-below — LAND RAISED FROM OPEN OCEAN IS A 2-SLOT STATE, NOT THE WORLD'S AVERAGE ONE.
//
// Generate land gives each state the category of the states whose provinces it was built on. A state raised from open ocean had
// none below it and is written `rural`, and its victory point and its share of cities were then read per category — and rural
// had no answer on a map whose states never use it, so both fell back to the MEAN over every state below. Measured 09-29 over
// Millennium Dawn (it declares vanilla's rural, 2 slots, and no state of its own uses it): 157 placeholder states took 47 of the
// world's 301 cities (5.40%, the map-wide share — three times MD's least-developed tier) and every one a victory point of 11,
// which MD's own graphics draw as the big round icon of a major city. Over Novum Vexillum: 91 cities at 11.14%, VP 20. And
// Auto-fix's state-id floor split them with the same mean. Over vanilla, OWB, HoM, RoN and R56 rural is measured and none of
// this happens — which is every world the owner has built.
//
// A category no state below uses now stands in for by the measured category whose BUILDING SLOTS are nearest — slots are what a
// state_category means to the game — and a slot tie goes to the one measured on more of the land below, so a 0-slot special
// category on five provinces (MD's military bases, 40% urban) cannot speak for a 2-slot state. Pinned on:
//   1. a layer below in Millennium Dawn's shape in miniature: it DECLARES rural and no state uses it;
//   2. Millennium Dawn's REAL shape: the base game's states ARE rural, and a dependency replace_paths history/states;
//   3. a slot tie between a 0-slot category on few provinces and a 4-slot one on many;
//   3b. a category whose states hold only lakes: it has no share of cities to give, so it cannot stand in — the stand-in is a
//      category measured on LAND, and the victory point and the share come from the same one;
//   4. controls: a measured category answers for itself, and with no slot table at all the old answer stands.
// ⚠️ MOVED WITH #a-generated-world-has-the-layer-belows-cities-per-state: a category's cities are counted per STATE of it below
// now, not as a share of its land. The stand-in is asked exactly as before; the counts it and the map-wide mean give are the
// per-state ones (here cat_hi 4 a state, cat_lo 1, cat_zero 0, every state together 9 over 4).
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-placeholder-"));
process.env.APPDATA = path.join(ROOT, "appdata"); process.env.NOVA_APP_DATA_DIR = process.env.APPDATA; process.env.XDG_CONFIG_HOME = process.env.APPDATA;
process.env.NOVA_HOME_DIR = path.join(ROOT, "home");
fs.mkdirSync(process.env.NOVA_HOME_DIR, { recursive: true });
const md = require("./map-data.js");
const { maskJsComments } = require("./testlib-strip-comments.js");

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

// ── the world: 8 x 4 provinces, id = row * 8 + col + 1 (the grid of test-a-generated-city-is-a-core-not-a-province.js) ────────
//   layer below   rows 0-2 land in four states of two columns each (ids 1, 2, 3 and 6), row 3 open ocean. Each urban
//                 province carries a 40 px core of city ground, painted round with forest.
//   the mod       the same shapes, all sea, replace_path history/states; five strategic regions — four over the old land, and
//                 one over the old OCEAN (row 3), which becomes the placeholder "rural" state: 8 provinces nobody held.
const COLW = [20, 12, 20, 12, 20, 12, 20, 12], ROWH = [14, 14, 14, 22], COLS = 8, ROWS = 4;
const COLX = COLW.map((_, i) => COLW.slice(0, i).reduce((a, b) => a + b, 0)), ROWY = ROWH.map((_, i) => ROWH.slice(0, i).reduce((a, b) => a + b, 0));
const W = COLW.reduce((a, b) => a + b, 0), H = ROWH.reduce((a, b) => a + b, 0);
const SPAWN = 19, FOREST = 1, PLAINS = 0, OCEAN = 15;
const idAt = (c, r) => r * COLS + c + 1;
const cellOfId = (id) => [(id - 1) % COLS, Math.floor((id - 1) / COLS)];
const colOf = (x) => COLX.findIndex((x0, i) => x >= x0 && x < x0 + COLW[i]), rowOf = (y) => ROWY.findIndex((y0, i) => y >= y0 && y < y0 + ROWH[i]);
const provAt = (x, y) => idAt(colOf(x), rowOf(y));
const colour = (id) => [(id * 29) % 256, (id * 67) % 256, 30 + id];
const belowLand = (id) => cellOfId(id)[1] < 3;
const inBelowCore = (x, y) => { const lx = x - COLX[colOf(x)], ly = y - ROWY[rowOf(y)]; return lx >= 2 && lx < 10 && ly >= 4 && ly < 9; };
const oceanRow = new Set(Array.from({ length: COLS }, (_, c) => idAt(c, 3)));

/** The map files of a layer below: `urban` the ids typed urban (each with a 40 px core); `lakes` ids past the grid, typed lake. */
function mapFiles(dir, urban, lakes = []) {
  write(dir, "map/provinces.bmp", bmp24(W, H, (x, y) => colour(provAt(x, y))));
  const rows = ["0;0;0;0;land;false;unknown;0"];
  for (let id = 1; id <= COLS * ROWS; id++) rows.push(`${id};${colour(id).join(";")};${belowLand(id) ? `land;false;${urban.has(id) ? "urban" : "plains"};1` : "sea;false;ocean;0"}`);
  for (const id of lakes) rows.push(`${id};${colour(id).join(";")};lake;false;lakes;0`);
  write(dir, "map/definition.csv", rows.join("\n") + "\n");
  write(dir, "map/terrain.bmp", bmp8(W, H, (x, y) => { const p = provAt(x, y); return !belowLand(p) ? OCEAN : urban.has(p) ? (inBelowCore(x, y) ? SPAWN : FOREST) : PLAINS; }));
  write(dir, "map/heightmap.bmp", bmp8(W, H, (x, y) => (belowLand(provAt(x, y)) ? 106 : 89)));
}
/** `states` [[id, firstColumn, category, vp]] — each state is two columns by the three land rows. */
function stateFiles(dir, states) {
  for (const [s, c0, cat, vp] of states) {
    const provs = []; for (let r = 0; r < 3; r++) for (const c of [c0, c0 + 1]) provs.push(idAt(c, r));
    write(dir, `history/states/${s}-S.txt`, `state={\n\tid=${s}\n\tname="STATE_${s}"\n\tmanpower=100000\n\tstate_category=${cat}\n\tprovinces={ ${provs.join(" ")} }\n\thistory={\n\t\towner=AAA\n\t\tvictory_points = { ${provs[0]} ${vp} }\n\t}\n}\n`);
  }
}
const slotFile = (slots) => `state_categories = {\n${Object.entries(slots).map(([k, v]) => `\t${k} = { local_building_slots = ${v} }`).join("\n")}\n}\n`;
/** o: { states, urban, slots (null: no common/state_category anywhere),
 *       lakeStates ([[id, category, vp, provinces]] — states holding only lakes, whose provinces are rows past the grid) } */
function makeGame(tag, o) {
  const g = path.join(ROOT, tag);
  write(g, "hoi4.exe", "");
  mapFiles(g, o.urban, (o.lakeStates || []).flatMap((s) => s[3]));
  write(g, "common/terrain/00_terrain.txt", [
    "categories = {", "  plains = { color = { 200 200 100 } }", "  forest = { color = { 0 120 0 } }", "  urban = { color = { 120 110 100 } }",
    "  ocean = { color = { 0 0 200 } is_water = yes }", "}",
    "terrain = {", "  plains = { type = plains color = { 0 } }", "  forest = { type = forest color = { 1 } }",
    "  terrain_city = { type = urban color = { 19 } texture = 10 spawn_city = yes }", "  ocean = { type = ocean color = { 15 } }", "}", ""].join("\n"));
  if (o.slots) write(g, "common/state_category/cats.txt", slotFile(o.slots));
  stateFiles(g, o.states);
  for (const [s, cat, vp, provs] of o.lakeStates || [])
    write(g, `history/states/${s}-L.txt`, `state={\n\tid=${s}\n\tname="STATE_${s}"\n\tmanpower=100000\n\tstate_category=${cat}\n\tprovinces={ ${provs.join(" ")} }\n\thistory={\n\t\towner=AAA\n\t\tvictory_points = { ${provs[0]} ${vp} }\n\t}\n}\n`);
  return g;
}
// ids 1, 2, 3 and 6: the base game's ceiling is 6, so a world of five states is one short once something names state 6.
// ⚠️ MOVED WITH #a-generated-world-has-every-state-id-the-scripts-name: this event stood in the base game from the start (o.floorRef),
// and Generate land now makes every id the loaded scripts name by itself — a sixth state, and nothing left for the floor to
// split. The floor is still the repair for every world that is not fresh, and how IT values a split is what the checks below
// pin, so the base game comes to name state 6 only after the world is generated.
const nameState6 = (g) => write(g, "events/base.txt", "namespace = base\ncountry_event = {\n\tid = base.1\n\toption = {\n\t\tname = base.1.a\n\t\t6 = { add_core_of = ROOT }\n\t}\n}\n");
function makeMod(tag) {
  const m = path.join(ROOT, tag);
  write(m, "descriptor.mod", 'name="placeholder"\nreplace_path="history/states"\n');
  write(m, "map/provinces.bmp", bmp24(W, H, (x, y) => colour(provAt(x, y))));
  const rows = ["0;0;0;0;land;false;unknown;0"];
  for (let id = 1; id <= COLS * ROWS; id++) rows.push(`${id};${colour(id).join(";")};sea;false;ocean;0`);
  write(m, "map/definition.csv", rows.join("\n") + "\n");
  write(m, "map/terrain.bmp", bmp8(W, H, () => OCEAN));
  write(m, "map/heightmap.bmp", bmp8(W, H, () => 89));
  for (let r = 0; r < 4; r++) {
    const ids = []; for (let row = 0; row < 3; row++) for (const c of [2 * r, 2 * r + 1]) ids.push(idAt(c, row));
    write(m, `map/strategicregions/r${r + 1}.txt`, `strategic_region={\n\tid=${r + 1}\n\tname="REGION_${r + 1}"\n\tprovinces={ ${ids.join(" ")} }\n\tweather={}\n}\n`);
  }
  write(m, "map/strategicregions/r5.txt", `strategic_region={\n\tid=5\n\tname="REGION_5"\n\tprovinces={ ${[...oceanRow].join(" ")} }\n\tweather={}\n}\n`);
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
  const vp = /victory_points\s*=\s*\{\s*(\d+)\s+(\d+)/.exec(t);
  return { id: +(/\bid\s*=\s*(\d+)/.exec(t) || [])[1], category: (/state_category\s*=\s*(\w+)/.exec(t) || [])[1] || "",
    provinces: ((/provinces\s*=\s*\{([^}]*)\}/.exec(t) || [])[1] || "").trim().split(/\s+/).map(Number).filter(Boolean), vp: vp ? +vp[2] : 0 };
}).sort((a, b) => a.id - b.id);
/** Generate land as POST /api/map/generate-land runs it: the whole sea, ownerMode inherit, provincesPerState left at its default. */
function world(game, tag, dependencyRoots = []) {
  const mod = makeMod("mod-" + tag);
  const r = md.generateLand({ modRoot: mod, gameRoot: game, dependencyRoots, count: COLS * ROWS, provincesPerState: 8, seed: 3, ownerMode: "inherit", splitLargeProvinces: false });   // #a-raised-province-is-cut-to-land-size: not this test's subject — its fixture's cells are its provinces, and the cut would add more
  const states = statesOf(mod), urban = urbanOf(mod);
  const ph = states.find((s) => s.provinces.length && s.provinces.every((p) => oceanRow.has(p)));
  const urbanIn = (s) => (s ? s.provinces.filter((p) => urban.has(p)).length : -1);
  return { game, mod, r, states, urban, ph, urbanIn, dependencyRoots };
}

// Millennium Dawn in miniature: rural declared (2 slots), no state uses it. cat_hi 12 slots, 8 of its 12 provinces urban, VP 30;
// cat_lo 1 slot, 1 of 6 urban, VP 2; cat_zero 0 slots, none urban, VP 1. Map-wide: 9 of 24 urban, mean VP round(63/4) = 16.
const MD_SLOTS = { rural: 2, cat_zero: 0, cat_lo: 1, cat_hi: 12 };
const MD_STATES = [[1, 0, "cat_hi", 30], [2, 2, "cat_hi", 30], [3, 4, "cat_lo", 2], [6, 6, "cat_zero", 1]];
const MD_URBAN = new Set([idAt(0, 0), idAt(1, 0), idAt(2, 0), idAt(3, 0), idAt(0, 1), idAt(1, 1), idAt(2, 1), idAt(3, 1), idAt(4, 0)]);

console.log("\n-- ⭐ 1. over a layer that declares rural and never uses it (Millennium Dawn's shape in miniature) --");
const A = world(makeGame("game-md", { states: MD_STATES, urban: MD_URBAN, slots: MD_SLOTS }), "md");
{
  ok(A.r && A.r.changed && A.states.length === 5, "Generate land made five states", A.r && (A.r.error || A.states.map((s) => [s.id, s.category, s.provinces.length])));
  ok(A.ph && A.ph.category === "rural", "CONTROL: the state raised from open ocean is written rural, as before — the category is not what changes", A.ph);
  ok(A.ph && A.ph.vp === 2, "⭐⭐ its victory point is what cat_lo's states are worth (2) — rural's 2 slots stand nearest cat_lo's 1 — not the map-wide mean (16)", A.ph && A.ph.vp);
  ok(A.urbanIn(A.ph) === 1, "⭐⭐ …and it gets cat_lo's cities per state (1), not the map-wide mean's (9 over 4 states: 2)", { urban: A.urbanIn(A.ph) });
  const said = A.ph && ((A.r.newStates || []).find((s) => s.id === A.ph.id) || {}).vp;
  ok(said && said.value === A.ph.vp && said.province > 0 && A.ph.provinces.includes(said.province),
    "⭐ what Generate land hands the page and the naming endpoint (newStates[].vp) is the victory point it wrote in the file", { said, file: A.ph && A.ph.vp });
  const hi = A.states.filter((s) => s.category === "cat_hi");
  ok(hi.length === 2 && hi.reduce((a, s) => a + A.urbanIn(s), 0) === 8 && hi.every((s) => s.vp === 30),
    "CONTROL: a measured category answers for itself — cat_hi keeps its 4 a state (8 of its 12) and VP 30", hi.map((s) => [s.id, A.urbanIn(s), s.vp]));
  // ⭐ Auto-fix's state-id floor splits the largest state — the placeholder, 8 provinces — and gives the new half a victory point
  // of its own, by the same rule. It asked the map-wide mean too; the fix next door that one caller never adopted.
  nameState6(A.game);
  const f = md.fixStateIdFloor({ modRoot: A.mod, gameRoot: A.game, dependencyRoots: [] });
  const made = statesOf(A.mod).filter((s) => s.id === 6);
  ok(f && f.added === 1 && made.length === 1 && made[0].category === "rural" && made[0].provinces.every((p) => oceanRow.has(p)),
    "CONTROL: the state-id floor split the placeholder (the largest state) and the new state is rural", { f: f && (f.error || { added: f.added }), made });
  ok(made.length === 1 && made[0].vp === 2, "⭐⭐ …and the split's own victory point is the stand-in's (2), not the map-wide mean (16)", made);
}

console.log("\n-- ⭐ 2. Millennium Dawn's REAL shape: the base game's states ARE rural, and a dependency replaces them --");
{
  // A reader that ignored the dependency's replace_path would measure the base game's rural states (VP 3, no cities) here and the
  // stand-in would never engage — the fixture above, with everything in one root, cannot tell.
  const base = makeGame("game-vanilla", { states: MD_STATES.map(([s, c0]) => [s, c0, "rural", 3]), urban: new Set(), slots: { rural: 2 } });
  const dep = path.join(ROOT, "mods", "dep");
  write(dep, "descriptor.mod", 'name="dep"\nreplace_path="history/states"\n');
  mapFiles(dep, MD_URBAN);
  write(dep, "common/state_category/dep_cats.txt", slotFile({ cat_zero: 0, cat_lo: 1, cat_hi: 12 }));
  stateFiles(dep, MD_STATES);
  const D = world(base, "dep", [dep]);
  ok(D.r && D.r.changed && D.ph && D.ph.category === "rural", "Generate land over the dependency made its placeholder state, rural", D.r && (D.r.error || D.ph));
  ok(D.ph && D.ph.vp === 2 && D.urbanIn(D.ph) === 1, "⭐⭐ it takes cat_lo's victory point (2) and cities per state (1) — not the hidden base game's rural (3, none), not the mean (16, 2)",
    D.ph && { vp: D.ph.vp, urban: D.urbanIn(D.ph) });
}

console.log("\n-- ⭐ 3. a slot tie goes to the category measured on more of the land below --");
{
  // rural's 2 slots stand as near cat_zero's 0 as cat_four's 4. cat_zero is one state of 6 provinces, half of them cities, VP 1 —
  // MD's state_military_base in miniature (0 slots, 40% urban on 5 provinces). cat_four is three states, 18 provinces, 3 urban,
  // VP 20. The placeholder state: cat_four's 1 city a state gives it 1, cat_zero's 3 a state 3, the map-wide mean (6 over 4 states) 2.
  const T = world(makeGame("game-tie", {
    states: [[1, 0, "cat_four", 20], [2, 2, "cat_four", 20], [3, 4, "cat_four", 20], [6, 6, "cat_zero", 1]],
    urban: new Set([idAt(0, 0), idAt(2, 0), idAt(4, 0), idAt(6, 0), idAt(7, 0), idAt(6, 1)]),
    slots: { rural: 2, cat_zero: 0, cat_four: 4 },
  }), "tie");
  ok(T.ph && T.ph.category === "rural" && T.states.filter((s) => s.category === "cat_four").length === 3,
    "CONTROL: the placeholder is rural and three generated states took cat_four", T.states.map((s) => [s.id, s.category]));
  ok(T.ph && T.ph.vp === 20, "⭐⭐ the placeholder's victory point is cat_four's (20) — measured on 18 provinces — not cat_zero's (1) on 6, nor the mean (15)", T.ph && T.ph.vp);
  ok(T.urbanIn(T.ph) === 1, "⭐⭐ …and its cities are cat_four's per state (1), not cat_zero's (3), nor the mean's (2)", { urban: T.urbanIn(T.ph) });
  nameState6(T.game);
  const f = md.fixStateIdFloor({ modRoot: T.mod, gameRoot: T.game, dependencyRoots: [] });
  const made = statesOf(T.mod).filter((s) => s.id === 6);
  ok(f && f.added === 1 && made.length === 1 && made[0].vp === 20, "⭐ the state-id floor's split breaks the tie the same way (VP 20)", { f: f && (f.error || f.added), made });
}

console.log("\n-- ⭐ 3b. a stand-in is a category the states below hold LAND in --");
{
  // cat_lake has rural's own 2 slots and is worth VP 40, but its one state holds nothing but two lakes. States do hold lakes —
  // every province a shipping map's states hold that is not land is one: vanilla 118 of 10,272, MD 170, NV 162 — and a category
  // on no land has no share of cities to give. It stood in for rural all the same: VP 40 off cat_lake and, with no share to read
  // there, the map-wide mean's 3 of 8 — two halves of one state from two places. Both now come from cat_lo, the nearest on land.
  const L = world(makeGame("game-lake", { states: MD_STATES, urban: MD_URBAN, slots: { ...MD_SLOTS, cat_lake: 2 },
    lakeStates: [[4, "cat_lake", 40, [33, 34]]] }), "lake");
  const facts = md.provinceFactsBeneath({ modRoot: L.mod, gameRoot: L.game, dependencyRoots: [] });
  const ground = md.cityGroundBeneath({ modRoot: L.mod, gameRoot: L.game, dependencyRoots: [] });
  ok((facts.get(33) || {}).category === "cat_lake" && (facts.get(34) || {}).category === "cat_lake" && ground && !ground.shareByCategory.has("cat_lake") && ground.shareByCategory.has("cat_lo"),
    "CONTROL: the states below hold cat_lake, on no land — it has no share of cities, cat_lo has one", { lake: facts.get(33), shares: ground && [...ground.shareByCategory] });
  ok(L.ph && L.ph.category === "rural" && L.ph.vp === 2, "⭐⭐ the placeholder's victory point is cat_lo's (2), the nearest category on land — not cat_lake's (40)", L.ph && { category: L.ph.category, vp: L.ph.vp });
  ok(L.urbanIn(L.ph) === 1, "⭐⭐ …and its cities are cat_lo's per state (1), the same category's — not the map-wide mean's (2)", { urban: L.urbanIn(L.ph) });
  nameState6(L.game);
  const f = md.fixStateIdFloor({ modRoot: L.mod, gameRoot: L.game, dependencyRoots: [] });
  const made = statesOf(L.mod).filter((s) => s.id === 6);
  ok(f && f.added === 1 && made.length === 1 && made[0].vp === 2, "⭐ the state-id floor's split asks the same land (VP 2, not 40)", { f: f && (f.error || f.added), made });
}

console.log("\n-- 4. CONTROL: where the states below DO use rural, rural answers for itself (vanilla, OWB, HoM, RoN, R56) --");
{
  // rural is measured (the fourth state) and given 1 slot, tying cat_lo: its own answer must still win over any stand-in's
  const B = world(makeGame("game-rural", { states: MD_STATES.map((s) => (s[0] === 6 ? [6, 6, "rural", 1] : s)), urban: MD_URBAN, slots: { ...MD_SLOTS, rural: 1 } }), "rural");
  const ruralB = B.states.filter((s) => s.category === "rural");
  ok(B.ph && B.ph.category === "rural" && B.ph.vp === 1, "⭐ the placeholder takes rural's own victory point (1), not a stand-in's (2)", B.ph);
  ok(ruralB.length === 2 && ruralB.reduce((a, s) => a + B.urbanIn(s), 0) === 0, "⭐ …and rural's own cities per state (none), not a stand-in's (cat_lo's 1 a state: 2)", ruralB.map((s) => [s.id, B.urbanIn(s)]));
}

console.log("\n-- 5. CONTROL: with no slot count to compare, the old answer stands (nothing invented) --");
{
  const C = world(makeGame("game-noslots", { states: MD_STATES, urban: MD_URBAN, slots: null }), "noslots");
  // ⚠️ MOVED WITH #a-generated-world-has-the-layer-belows-cities-per-state: the mean was the map-wide SHARE of the placeholder's 8
  // provinces (9 of 24: 3). It is the map-wide cities per state now, read off the fixture: 9 cities over its 4 states, for one state.
  const meanCities = Math.round(MD_URBAN.size / MD_STATES.length), meanShare = Math.round(MD_URBAN.size / (MD_STATES.length * 6) * oceanRow.size);
  ok(meanCities !== meanShare, "(the fixture tells the map-wide rate per state from the map-wide share of the land)", { meanCities, meanShare });
  ok(C.ph && C.ph.category === "rural" && C.ph.vp === 16 && C.urbanIn(C.ph) === meanCities, `no common/state_category anywhere: the map-wide mean, as before (VP 16, ${meanCities} cities)`, C.ph && { vp: C.ph.vp, urban: C.urbanIn(C.ph) });
}

console.log("\n-- 6. the rule itself --");
{
  const S = md.standInStateCategory;
  ok(typeof S === "function", "map-data exports standInStateCategory", typeof S);
  if (typeof S === "function") {
    const MD = { rural: 2, state_inhospitable: 0, state_00: 1, state_01: 4, state_military_base: 0 };
    ok(S("rural", new Map([["state_inhospitable", 43], ["state_00", 1], ["state_01", 4], ["state_military_base", 5]]), MD) === "state_00",
      "Millennium Dawn's slots: rural (2) stands for state_00 (1), the nearest");
    ok(S("x", new Map([["zero", 5], ["four", 200]]), { x: 2, zero: 0, four: 4 }) === "four", "⭐ a slot tie goes to the category measured on more land, not to fewer slots");
    ok(S("x", new Map([["b", 7], ["a", 7], ["c", 7]]), { x: 2, a: 3, b: 1, c: 1 }) === "b", "…then to fewer slots, then to the name");
    ok(S("RURAL", new Map([["lo", 1]]), { rural: 2, lo: 1 }) === "lo", "the category is matched as the game matches it, without regard to case");
    // Old World Blues' states spell ENCLAVE against its declared enclave. An exact match would drop STATE_00 and take state_01.
    ok(S("rural", new Map([["STATE_00", 1], ["state_01", 4]]), { rural: 2, state_00: 1, state_01: 4 }) === "STATE_00",
      "⭐ …and so is each category the states below measured: their STATE_00 is the table's state_00, the nearest, spelt as the states spell it (the key their VP and share are read by)");
    ok(S("rural", new Map([["lo", 1]]), { lo: 1 }) === "" && S("rural", new Map(), { rural: 2 }) === "" && S("rural", new Map([["lo", 1]]), null) === "",
      "no slot count for it, nothing measured, or no slot table: no stand-in");
  }
}

console.log("\n-- 7. every answer that falls back to the map-wide mean asks the stand-in first (derived from the source) --");
{
  const code = maskJsComments(fs.readFileSync(path.join(__dirname, "map-data.js"), "utf8"));
  const means = code.split(/\r?\n/).map((l, i) => [i + 1, l]).filter(([, l]) => l.includes('.get("*")'));
  const blind = means.filter(([, l]) => !/\bstandIn/.test(l));
  // Generate land's victory point, the state-id floor's split, and (#a-generated-country-keeps-its-economy) what a state of each
  // category is worth when a country's 1936 economy is spread — read, and it asks the stand-in. A fourth is a new caller, and it must
  // be read before this moves.
  ok(means.length === 3, "CONTROL: the scan finds exactly the three answers that fall back to the mean \"*\"", means.map(([n, l]) => n + ": " + l.trim().slice(0, 100)));
  ok(!blind.length, "⭐ none of them skips the stand-in", blind.map(([n, l]) => n + ": " + l.trim().slice(0, 120)));
}

try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) { /* scratch only */ }
console.log("\n" + (fail ? "FAILED " + fail + "/" + (pass + fail) : "PASSED " + pass + "/" + pass));
process.exitCode = fail ? 1 : 0;
