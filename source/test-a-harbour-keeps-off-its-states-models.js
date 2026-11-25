// ⛔ #a-harbour-keeps-off-its-states-models — A PORT AUTO-FIX ADDS KEEPS ITS MODEL OFF THE FACTORIES, THE RUNWAY AND THE DOCKYARD
// STANDING ROUND ITS COAST.
//
// harbourSpot stood the port on the coast pixel nearest its depot (#a-harbour-stands-on-its-coast-not-its-corner) and asked nothing of
// the models round it: a state's factories and runway ring its depot 3–6 px out, so on the owner's flow 10 drawn ports stood more than
// a quarter over a drawn land model (the Dutch capital's 100% over a civilian factory; 4 over a runway, 3 a civilian factory, 2 a
// military one, 1 a depot), where the base game has 3 of 535 such pairs; the runway stood over a drawn port's point 4 times (the base
// game 2 of 331); and drawn dockyard + port pairs over a quarter were 6.2% of the drawn ports (the base game 1.3%). The port now takes,
// of the pixels within the neighbour's share, one whose turned model shares PORT_OVER_MODEL or less of the smaller model with every row
// standing round it — any state's, but the coast's own rows (kept off by the gap key) and the depot (its pull) — ahead of the river.
//
//   1. Over the installed base game (SKIPS without it): DOCKYARD_REACH is the reach of the dockyard's models (DOCKYARD_MODEL_ENTITIES),
//      as buildingModelReach reads them, and every type a model is drawn on has a reach read (or LAND_ROW_REACH's).
//   2. A fixture: a coastal province whose coast pixel nearest the depot has a civilian factory, a military factory and an air base
//      behind it and a dockyard beside it. Auto-fix's port shares PORT_OVER_MODEL or less with each (this test's own sampler, every
//      0.05 px) — a CONTROL shows the pixel the key without models picks would share more than a quarter — and is the clear pixel
//      nearest the depot; the file's rows stand byte for byte; the same click on a second copy writes the same bytes.
//   3. The depot is not a model it keeps off: with only the depot by the coast the port stands where it stood without the key.
//   4. Another state's model counts too, and harbourSpot's answer does not hang on the order of the coast or of the models.
// Binds no port. Run: node test-a-harbour-keeps-off-its-states-models.js
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-harbour-models-"));
process.env.APPDATA = path.join(ROOT, "appdata"); process.env.NOVA_APP_DATA_DIR = process.env.APPDATA; process.env.XDG_CONFIG_HOME = process.env.APPDATA;
process.env.NOVA_HOME_DIR = path.join(ROOT, "home");
fs.mkdirSync(process.env.APPDATA, { recursive: true });
fs.mkdirSync(process.env.NOVA_HOME_DIR, { recursive: true });
const md = require("./map-data.js");

let pass = 0, fail = 0;
const ok = (c, m, x) => {
  if (c) { pass++; console.log("  ok   " + m); }
  else { fail++; console.log("  FAIL " + m + (x !== undefined ? "   -> " + JSON.stringify(x).slice(0, 600) : "")); }
};
const write = (dir, rel, body) => { const p = path.join(dir, ...rel.split("/")); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, body); return p; };
function bmp24(W, H, fn) {
  const rs = Math.floor((24 * W + 31) / 32) * 4, b = Buffer.alloc(54 + rs * H);
  b.write("BM", 0, "ascii"); b.writeUInt32LE(b.length, 2); b.writeUInt32LE(54, 10); b.writeUInt32LE(40, 14);
  b.writeInt32LE(W, 18); b.writeInt32LE(H, 22); b.writeUInt16LE(1, 26); b.writeUInt16LE(24, 28); b.writeUInt32LE(rs * H, 34);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const [r, g, bl] = fn(x, y); const o = 54 + (H - 1 - y) * rs + x * 3; b[o] = bl; b[o + 1] = g; b[o + 2] = r; }
  return b;
}
const LIMIT = md.PORT_OVER_MODEL;
const PORT = md.PORT_REACH, LAND = md.LAND_ROW_REACH || {};
const REACH_OF = { industrial_complex: LAND.industrial_complex, arms_factory: LAND.arms_factory, air_base: md.AIRFIELD_REACH, anti_air_building: LAND.anti_air_building, dockyard: md.DOCKYARD_REACH, supply_node: LAND.supply_node };
/** this test's own sampler: of the smaller of two turned models ({ x, z, rot, reach }, rotation counter-clockwise, x east, z north), the
 *  share under the other, every 0.05 px */
const shareOf = (a, b) => {
  const size = (q) => (q.reach.west + q.reach.east) * (q.reach.south + q.reach.north);
  const [s, t] = size(a) <= size(b) ? [a, b] : [b, a], st = 0.05;
  const inT = (X, Z) => { const cs = Math.cos(t.rot), sn = Math.sin(t.rot), dx = X - t.x, dz = Z - t.z, u = dx * cs + dz * sn, v = -dx * sn + dz * cs; return u >= -t.reach.west && u <= t.reach.east && v >= -t.reach.south && v <= t.reach.north; };
  const cs = Math.cos(s.rot), sn = Math.sin(s.rot);
  let n = 0, k = 0;
  for (let u = -s.reach.west + st / 2; u < s.reach.east; u += st) for (let v = -s.reach.south + st / 2; v < s.reach.north; v += st) { n++; if (inT(s.x + u * cs - v * sn, s.z + u * sn + v * cs)) k++; }
  return k / n;
};

// ── 1. the base game ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
console.log("\n=== 1. the base game ===");
const GAME = process.env.HOI4_ROOT || "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
if (!fs.existsSync(path.join(GAME, "common", "buildings")) || !fs.existsSync(path.join(GAME, "gfx", "entities"))) console.log("  SKIP: no Hearts of Iron IV install at " + GAME + " — section 1 did not run");
else {
  const roots = { modRoot: GAME, gameRoot: GAME, dependencyRoots: [] };
  const read = md.buildingModelReach({ ...roots, entities: md.DOCKYARD_MODEL_ENTITIES || [], fallback: null });
  ok(Array.isArray(md.DOCKYARD_MODEL_ENTITIES) && md.DOCKYARD_MODEL_ENTITIES.length === 3 && !!read && JSON.stringify(read) === JSON.stringify(md.DOCKYARD_REACH),
    "DOCKYARD_REACH is the reach of the dockyard's models off the installed game (buildingModelReach over DOCKYARD_MODEL_ENTITIES)", { read, table: md.DOCKYARD_REACH });
  // the dockyard draws on show_on_map_meshes, as the harbour does — which is why its entities are named, not derived from its name
  const b = fs.readFileSync(path.join(GAME, "common", "buildings", "00_buildings.txt"), "utf8");
  const yard = /\n\tdockyard\s*=\s*\{([\s\S]*?)\n\t\}/.exec(b);
  ok(!!yard && /show_on_map_meshes\s*=\s*3/.test(yard[1]) && md.buildingModelReach({ ...roots, entities: ["building_dockyard"], fallback: null }) === null,
    "(the base game draws its dockyard on three numbered meshes, and no model is named building_dockyard)");
  const rules = md.stateBuildingRules(md.buildMapModel({ ...roots, cacheStableLayers: true }));
  const drawn = [...new Set([...rules.values()].filter((r) => r.showOnMap > 0).map((r) => r.rowType))];
  const coastOwn = new Set(["naval_base_spawn", "coastal_bunker", "naval_supply_hub", "naval_headquarters", "floating_harbor", "supply_node"]);
  const unread = drawn.filter((t) => !coastOwn.has(t) && t !== "dockyard" && t !== "air_base"
    && !md.buildingRowReach({ ...roots, rules, rowType: t, fallback: (md.LAND_ROW_REACH || {})[t] || null }));
  ok(drawn.length >= 10 && unread.length === 0, `every land type the base game draws a model on (${drawn.length} drawn types) has a reach the port keeps off`, { unread });
}

// ── the fixture: province 2 (state 1) a rectangle on a sea (province 1), rows top-down; its north coast is row 4 ─────────────────
const W = 48, H = 24, SEA = 1;
const RECT = { 2: [8, 4, 36, 20], 3: [36, 4, 44, 20] };     // province 3: state 2's, east of it
const STATE_OF = { 2: 1, 3: 2 };
const provAt = (x, y) => { for (const [id, [x0, y0, x1, y1]] of Object.entries(RECT)) if (x >= x0 && x < x1 && y >= y0 && y < y1) return +id; return SEA; };
const colour = (id) => [(id * 37) % 256, (id * 71) % 256, 40 + id];
const zOf = (row) => H - 1 - row;
const DEPOT = { px: 20, row: 8 };
const row = (s, t, px, r, rot = 0) => `${s};${t};${px}.00;10.00;${zOf(r)}.00;${rot.toFixed(2)};0`;
// behind the coast pixel nearest the depot (20, 4): a civilian factory, a military one and the air base; a dockyard on the coast beside
const MODELS = [["industrial_complex", 20, 5, 0.40], ["arms_factory", 22, 5, 1.10], ["air_base", 16, 6, 0.00], ["dockyard", 24, 4, 3.14]];
const BASE_ROWS = [row(1, "supply_node", DEPOT.px, DEPOT.row, 1.0)].concat(MODELS.map(([t, x, r, rot]) => row(1, t, x, r, rot)));
function makeMod(dir, rows) {
  write(dir, "descriptor.mod", 'name="harbour-models"\nreplace_path="history/states"\nreplace_path="map"\n');
  write(dir, "map/provinces.bmp", bmp24(W, H, (x, y) => colour(provAt(x, y))));
  write(dir, "map/definition.csv", ["0;0;0;0;land;false;unknown;0", `1;${colour(1).join(";")};sea;false;ocean;0`]
    .concat(Object.keys(RECT).map((id) => `${id};${colour(+id).join(";")};land;true;plains;1`)).join("\n") + "\n");
  write(dir, "history/states/1-S.txt", "state = {\n\tid = 1\n\tname = \"STATE_1\"\n\tmanpower = 1000\n\tstate_category = rural\n\tprovinces = { 2 }\n\thistory = {\n\t\towner = AAA\n\t}\n}\n");
  write(dir, "history/states/2-S.txt", "state = {\n\tid = 2\n\tname = \"STATE_2\"\n\tmanpower = 1000\n\tstate_category = rural\n\tprovinces = { 3 }\n\thistory = {\n\t\towner = BBB\n\t}\n}\n");
  // state 2 has its port already, on its own coast's far end
  write(dir, "map/buildings.txt", rows.concat([`2;naval_base_spawn;42.00;9.50;${zOf(4)}.00;3.14;${SEA}`]).join("\n") + "\n");
}
const portOf = (dir, sid) => {
  const l = fs.readFileSync(path.join(dir, "map", "buildings.txt"), "utf8").split(/\r?\n/).find((x) => { const c = x.split(";"); return c[1] === "naval_base_spawn" && +c[0] === sid; });
  if (!l) return null;
  const c = l.split(";");
  return { line: l, x: +c[2], z: +c[4], rot: +c[5], px: Math.floor(+c[2]), row: H - 1 - Math.floor(+c[4]), sea: +c[6] };
};
const ex = { W, H, pidAt: (x, r) => provAt(((x % W) + W) % W, r) }, typeOf = (id) => (id === SEA ? "sea" : "land"), stateOf = (p) => STATE_OF[p] || null;
const seaAt = (x, r) => r >= 0 && r < H && provAt(((x % W) + W) % W, r) === SEA;
const coastOf = (pid) => {
  const out = [];
  for (let r = 0; r < H; r++) for (let x = 0; x < W; x++) {
    if (provAt(x, r) !== pid) continue;
    const seas = [[1, 0], [-1, 0], [0, -1], [0, 1]].filter(([dx, dy]) => seaAt(x + dx, r + dy)).map(([dx, dy]) => [dx, dy, SEA]);
    if (seas.length) out.push({ x, row: r, seas });
  }
  return out;
};
const modelOf = ([t, x, r, rot]) => ({ type: t, x, z: zOf(r), rot, reach: REACH_OF[t] });
const portModel = (px, r) => ({ x: px, z: zOf(r), rot: md.coastFacing(ex, typeOf, px, zOf(r)) || 0, reach: PORT });
const worstOver = (p, models) => Math.max(0, ...models.map((m) => shareOf(p, m)));
const cheb = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.row - b.row));

console.log("\n=== 2. the port keeps off the factories, the runway and the dockyard behind and beside its coast ===");
const modA = path.join(ROOT, "a"), modB = path.join(ROOT, "b");
makeMod(modA, BASE_ROWS); makeMod(modB, BASE_ROWS);
const rootsA = { modRoot: modA, gameRoot: path.join(ROOT, "no-game"), dependencyRoots: [] };
const models = MODELS.map(modelOf);
const coast2 = coastOf(2);
const depotNear = { x: DEPOT.px, row: DEPOT.row };
const old = md.harbourSpot({ ex, typeOf, stateOf, sid: 1, coast: coast2, near: depotNear, rows: [{ x: 24, row: 4 }], reach: PORT });
ok(!!old && worstOver(portModel(old.x, old.row), models) > 0.25,
  "CONTROL: the pixel the key without models picks (nearest the depot, 3 px off the dockyard) shares more than a quarter of a model behind it", { old, over: old && models.map((m) => [m.type, +shareOf(portModel(old.x, old.row), m).toFixed(3)]) });
const r = md.fixCoastalNoPort(rootsA);
const p = portOf(modA, 1);
ok(r && r.added === 1 && !!p, "Auto-fix adds the one port province 2 lacks", r);
ok(!!p && provAt(p.px, p.row) === 2 && coast2.some((c) => c.x === p.px && c.row === p.row) && p.sea === SEA && p.rot.toFixed(2) === (md.coastFacing(ex, typeOf, p.x, p.z) || 0).toFixed(2),
  "it stands on province 2's own coast, its column 7 the sea, turned to it", p);
const over = p ? models.map((m) => [m.type, +shareOf({ x: p.x, z: p.z, rot: p.rot, reach: PORT }, m).toFixed(3)]) : [];
ok(!!p && over.every(([, s]) => s <= LIMIT), `⭐⭐ its model shares ${LIMIT} or less of the smaller model with the civilian and the military factory, the runway and the dockyard`, over);
// the clear pixel nearest the depot, by this test's own sampler: on the coast, 3 px or more off the dockyard, sharing LIMIT or less
const clear = coast2.filter((c) => cheb(c, { x: 24, row: 4 }) >= md.BUILDING_RING_NEAR && worstOver(portModel(c.x, c.row), models) <= LIMIT)
  .sort((a, b) => ((a.x - DEPOT.px) ** 2 + (a.row - DEPOT.row) ** 2) - ((b.x - DEPOT.px) ** 2 + (b.row - DEPOT.row) ** 2) || a.row - b.row || a.x - b.x)[0];
ok(!!p && !!clear && p.px === clear.x && p.row === clear.row, "⭐ …and it is the clear pixel nearest the depot", { p: p && [p.px, p.row], clear });
{
  const lines = fs.readFileSync(path.join(modA, "map", "buildings.txt"), "utf8").split(/\r?\n/);
  ok(BASE_ROWS.every((l, i) => lines[i] === l), "⭐ every row the file had stands byte for byte where it stood (the port is the only row added)", lines.slice(0, BASE_ROWS.length + 2));
  const r2 = md.fixCoastalNoPort({ modRoot: modB, gameRoot: path.join(ROOT, "no-game"), dependencyRoots: [] });
  ok(r2 && r2.added === 1 && fs.readFileSync(path.join(modB, "map", "buildings.txt"), "utf8") === fs.readFileSync(path.join(modA, "map", "buildings.txt"), "utf8"),
    "the same click on a second copy writes the same bytes", r2);
}

console.log("\n=== 3. the depot is not a model it keeps off: its pull stands ===");
{
  // only the depot, right behind the coast: a port on the pixel nearest it shares much of the depot's model, and stands there all the same
  const modC = path.join(ROOT, "c");
  const D3 = { px: 26, row: 5 };
  makeMod(modC, [row(1, "supply_node", D3.px, D3.row, 0)]);
  const pick = md.harbourSpot({ ex, typeOf, stateOf, sid: 1, coast: coast2, near: { x: D3.px, row: D3.row }, rows: [], reach: PORT });
  ok(!!pick && shareOf(portModel(pick.x, pick.row), { x: D3.px, z: zOf(D3.row), rot: 0, reach: LAND.supply_node }) > LIMIT,
    "CONTROL: the pixel nearest that depot shares more than PORT_OVER_MODEL of the depot's model", pick);
  md.fixCoastalNoPort({ modRoot: modC, gameRoot: path.join(ROOT, "no-game"), dependencyRoots: [] });
  const q = portOf(modC, 1);
  ok(!!q && !!pick && q.px === pick.x && q.row === pick.row, "⭐ the port stands there: the depot draws it, it does not push it away", { q, pick });
}

console.log("\n=== 4. another state's model counts too; the answer does not hang on the order of the coast or the models ===");
{
  // a coast pixel nearest the depot whose model would stand over state 2's anti-air gun across the border
  const near = { x: 35, row: 7 };
  const theirs = [modelOf(["anti_air_building", 37, 5, 0.0])];
  const without = md.harbourSpot({ ex, typeOf, stateOf, sid: 1, coast: coast2, near, rows: [], reach: PORT });
  ok(!!without && worstOver(portModel(without.x, without.row), theirs) > LIMIT, "CONTROL: without models the pixel nearest the depot stands over state 2's gun", without);
  const withThem = md.harbourSpot({ ex, typeOf, stateOf, sid: 1, coast: coast2, near, rows: [], reach: PORT, models: theirs });
  ok(!!withThem && worstOver(portModel(withThem.x, withThem.row), theirs) <= LIMIT, "⭐ with them it keeps off it", withThem);
  const again = md.harbourSpot({ ex, typeOf, stateOf, sid: 1, coast: coast2.slice().reverse(), near: depotNear, rows: [{ x: 24, row: 4 }], reach: PORT, models: models.slice().reverse() });
  const once = md.harbourSpot({ ex, typeOf, stateOf, sid: 1, coast: coast2, near: depotNear, rows: [{ x: 24, row: 4 }], reach: PORT, models });
  ok(!!once && JSON.stringify(once) === JSON.stringify(again), "the same answer whatever order the coast pixels and the models come in", { once, again });
}

console.log("\n=== 5. a short coast its dockyard covers: the port takes the pixel sharing least of the dockyard's model ===");
{
  // province 4 (state 1), a 5 px coast x 6..10 on row 4 under the sea, its dockyard on x 8 and its depot inland by x 7: every coast
  // pixel is within BUILDING_RING_NEAR px of the dockyard, so the gap key grades them all alike but x 8. Province 5, the same state's,
  // holds the land round it, with a port of its own.
  const W5 = 24, H5 = 16, SEA5 = 1;
  const prov5 = (x, y) => (y < 4 || y >= H5 - 1 ? SEA5 : x >= 6 && x <= 10 && y <= 9 ? 4 : x >= 1 && x <= 18 ? 5 : SEA5);
  const z5 = (r) => H5 - 1 - r;
  const mod5 = path.join(ROOT, "e");
  write(mod5, "descriptor.mod", 'name="harbour-yard"\nreplace_path="history/states"\nreplace_path="map"\n');
  write(mod5, "map/provinces.bmp", bmp24(W5, H5, (x, y) => colour(prov5(x, y))));
  write(mod5, "map/definition.csv", ["0;0;0;0;land;false;unknown;0", `1;${colour(1).join(";")};sea;false;ocean;0`, `4;${colour(4).join(";")};land;true;plains;1`, `5;${colour(5).join(";")};land;true;plains;1`].join("\n") + "\n");
  write(mod5, "history/states/1-S.txt", "state = {\n\tid = 1\n\tname = \"STATE_1\"\n\tmanpower = 1000\n\tstate_category = rural\n\tprovinces = { 4 5 }\n\thistory = {\n\t\towner = AAA\n\t}\n}\n");
  const YARD = { x: 8, row: 4, rot: 3.14 };
  write(mod5, "map/buildings.txt", [`1;supply_node;7.00;10.00;${z5(8)}.00;0.00;0`, `1;dockyard;${YARD.x}.00;9.50;${z5(YARD.row)}.00;${YARD.rot.toFixed(2)};0`,
    `1;supply_node;15.00;10.00;${z5(8)}.00;0.00;0`, `1;naval_base_spawn;16.00;9.50;${z5(4)}.00;3.14;${SEA5}`].join("\n") + "\n");
  const ex5 = { W: W5, H: H5, pidAt: (x, r) => prov5(((x % W5) + W5) % W5, r) }, type5 = (id) => (id === SEA5 ? "sea" : "land");
  const yardModel = { x: YARD.x, z: z5(YARD.row), rot: YARD.rot, reach: md.DOCKYARD_REACH };
  const coast4 = [];
  for (let x = 6; x <= 10; x++) coast4.push({ x, row: 4, seas: [[0, -1, SEA5]] });
  const shareAt = (c) => shareOf({ x: c.x, z: z5(c.row), rot: md.coastFacing(ex5, type5, c.x, z5(c.row)) || 0, reach: PORT }, yardModel);
  const without = md.harbourSpot({ ex: ex5, typeOf: type5, stateOf: (q) => (q === 4 || q === 5 ? 1 : null), sid: 1, coast: coast4, near: { x: 7, row: 8 }, rows: [{ x: YARD.x, row: YARD.row }], reach: PORT });
  const least = Math.min(...coast4.map(shareAt));
  ok(!!without && shareAt(without) > least + 0.1 && coast4.every((c) => shareAt(c) > LIMIT),
    "CONTROL: every coast pixel shares more than PORT_OVER_MODEL of the dockyard's model, and the one the key without models picks shares far more than the least", { without, shares: coast4.map((c) => [c.x, +shareAt(c).toFixed(3)]) });
  const r5 = md.fixCoastalNoPort({ modRoot: mod5, gameRoot: path.join(ROOT, "no-game"), dependencyRoots: [] });
  const q = (() => { const l = fs.readFileSync(path.join(mod5, "map", "buildings.txt"), "utf8").split(/\r?\n/).filter((x) => x.split(";")[1] === "naval_base_spawn")
    .map((x) => x.split(";")).find((c) => prov5(Math.floor(+c[2]), H5 - 1 - Math.floor(+c[4])) === 4); return l ? { x: Math.floor(+l[2]), row: H5 - 1 - Math.floor(+l[4]) } : null; })();
  ok(r5 && r5.added === 1 && !!q && Math.abs(shareAt(q) - least) < 0.02, "⭐⭐ Auto-fix's port takes the pixel sharing least of the dockyard's model", { r5, q, share: q && shareAt(q), least });
}

try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) { /* scratch only */ }
console.log("\n" + (fail ? "FAILED " + fail + "/" + (pass + fail) : "PASSED " + pass + "/" + pass));
process.exitCode = fail ? 1 : 0;
