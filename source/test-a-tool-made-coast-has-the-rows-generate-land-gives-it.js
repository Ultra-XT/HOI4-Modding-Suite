// ⛔ #a-tool-made-coast-has-the-rows-generate-land-gives-it — A COAST OR LAND A MAP TOOL MAKES GETS THE ROWS GENERATE LAND GIVES ONE.
// (Review of the map tools, CB-3 and CB-4.)
//
// Every coastal land province of the base game carries a coastal_bunker, naval_headquarters and naval_supply_hub row in
// map/buildings.txt, every coastal state one dockyard row (555 of 555), every land province a supply_node, bunker and
// special_project_facility_spawn row. Generate land writes them through ensureBuildingSlotsForState's `coast`, and it was the only
// caller that named a coast, so what the tools made got only Auto-fix's port: erasing a coastal province left the land behind it
// coastal with no coastal fort, naval HQ or supply hub position and its state with no dockyard position; land the type dropdown made
// from the sea, homed by a move or by Auto-fix, had none of the six; and a move, a carve or an erase of the province a coastal state's
// dockyard row stood on took the row and gave nothing back. Map Errors read 0/0 on all of it.
//
// One fixture, a mod that owns its map, its common/buildings vanilla-shaped (a hub and an HQ on rows of their own), every state laid
// out the way Generate land lays one out; each tool driven with the body public/map.js sends:
//   0. the fixture: which provinces touch the sea; every row the template asks for is there, state 1's dockyard row on its port 3.
//   1. Erase (flip-province-sea { provinceId: 3 }): 7, inland before, has its coast's rows, keyed to its state 2, which has a dockyard
//      row now; state 1 keeps a coast and has its dockyard row back (the old one stood on 3); no other province gains a row — not 6,
//      whose coastal fort the fixture took away (a gap the layer below ships is not the edit's), nor 4 (coastal before) — and every row
//      that did not stand on 3 is byte for byte where it was. The answer names what was added; the file is written once more.
//  1b. The same erase in an Erase stroke (flip-provinces-sea { provinceIds: [3, 7, 11] }: one request, ONE sink of the stroke): map/buildings.txt
//      and heightmap.bmp byte for byte what one erase at a time leaves, each province's answer naming the rows its own erase names, and no
//      row on a province the stroke erased (7 gets its coast rows from 3's erase and loses them with its own, which gives 8 its).
//   2. + New state, as the page sends it (create-state { name: "", owner }, then move-province { provinceId, toStateId }): the carve of
//      3 leaves state 1 coastal with a dockyard row of its own on its own coast, and the new state has the one that stood on 3; a
//      second carve, of 2, gives that state a dockyard row too; and create-state's own carve ({ provinces: [3] }) answers the same.
//   3. The type dropdown's sea → land, as /api/map/set-province-terrain writes it (setProvinceDefinitionWithItsRows, the inspector's
//      { provinceId: 14, terrain: "plains", type: "land", coastal: false }), then a move into state 3: 14 has its depot, fort,
//      special-project, coastal fort, naval HQ and supply hub rows, each standing on 14 — and not on 16, the state's highest id, where a
//      top-up by count puts them — and state 3 keeps its one dockyard row.
//   4. The same new land homed by Auto-fix's stateless-land pass: the same rows, on 14.
//   5. The type dropdown's lake → sea ({ provinceId: 15, terrain: "lakes", type: "sea", coastal: false }): 8, which touched only the
//      lake, has its coast's rows.
//   6. ✏ Paint shape: a channel of sea painted through 3 to 7: 7 has its coast's rows and state 2 its dockyard row.
//   7. Controls — a move of a coastal province that carries its rows between two coastal states adds nothing; a merge adds no row of
//      its own (its moves give none half-way).
//   8. The page: buildingRowsNote, run as public/map.js has it on section 1's own answer, names each state's dockyard position and the
//      kinds on each province; the Save loop, the paint's step and Auto-fix's summary say it; the type dropdown's endpoint writes
//      through the function sections 3–5 drive.
//   9. Delete state (delete-state { stateId: 1 }), then Auto-fix (autoFixMap): the provinces it homes keep the rows they stood on, one of
//      each kind, re-keyed to their new state by the click's buildings pass — not a second set beside them (review of the coast rows,
//      CR-R2) — and a second click writes nothing.
// Binds no port. Run: node test-a-tool-made-coast-has-the-rows-generate-land-gives-it.js
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-tool-coast-rows-"));
process.env.APPDATA = path.join(ROOT, "appdata"); process.env.NOVA_APP_DATA_DIR = process.env.APPDATA; process.env.XDG_CONFIG_HOME = process.env.APPDATA;
process.env.NOVA_HOME_DIR = path.join(ROOT, "home");
fs.mkdirSync(process.env.APPDATA, { recursive: true });
fs.mkdirSync(process.env.NOVA_HOME_DIR, { recursive: true });
const md = require("./map-data.js");
const vm = require("vm");
const { lift } = require("./testlib-map-page.js");
const { stripJsComments } = require("./testlib-strip-comments.js");
let erased = null;                                                     // section 1's answer, which section 8 has the page say

let pass = 0, fail = 0;
const ok = (c, m, x) => {
  if (c) { pass++; console.log("  ok   " + m); }
  else { fail++; console.log("  FAIL " + m + (x !== undefined ? "   -> " + JSON.stringify(x).slice(0, 700) : "")); }
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

// ── the world: a block of land provinces on a sea, rows top-down ────────────────────────────────────────────────────────────────
//        x 10-20  20-30  30-40  40-50  50-55
//  y 5     2      3      4      5
//  y 15    6      7      8      9          7 and 8 inland; 15 a lake inside 8
//  y 25   10     11     12     13     16   (16: y 25-30)
//  y 35   14 (a bay, x 10-30, y 35-40)     the rest is sea 1
const W = 70, H = 50, SEA = 1, BAY = 14, LAKE = 15;
const RECT = {
  [LAKE]: [34, 19, 36, 21],
  2: [10, 5, 20, 15], 3: [20, 5, 30, 15], 4: [30, 5, 40, 15], 5: [40, 5, 50, 15],
  6: [10, 15, 20, 25], 7: [20, 15, 30, 25], 8: [30, 15, 40, 25], 9: [40, 15, 50, 25],
  10: [10, 25, 20, 35], 11: [20, 25, 30, 35], 12: [30, 25, 40, 35], 13: [40, 25, 50, 35], 16: [50, 25, 55, 30],
  [BAY]: [10, 35, 30, 40],
};
const ORDER = [LAKE, ...Object.keys(RECT).map(Number).filter((id) => id !== LAKE)];
const shapeAt = (x, y) => { for (const id of ORDER) { const [x0, y0, x1, y1] = RECT[id]; if (x >= x0 && x < x1 && y >= y0 && y < y1) return id; } return SEA; };
const LAND = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 16];
const colour = (id) => [(id * 37) % 256, (id * 71) % 256, 40 + id];
const STATES = { 1: [2, 3, 6], 2: [7], 3: [4, 5, 9, 10, 11, 13, 16], 4: [8, 12] };

// common/buildings, vanilla-shaped: every coast row a building of its own draws on
const building = (name, { coast = false, spawn = "", shared = false } = {}) =>
  `\t${name} = {\n\t\tbase_cost = 1000\n\t\tshow_on_map = 1\n${coast ? "\t\tonly_costal = yes\n" : ""}${spawn ? `\t\tspawn_point = ${spawn}\n` : ""}\t\tlevel_cap = {\n${shared ? "\t\t\tshares_slots = yes\n\t\t\tstate_max = 20\n" : "\t\t\tprovince_max = 1\n"}\t\t}\n\t}\n`;
const BUILDINGS = `buildings = {\n${[building("naval_base", { coast: true, spawn: "naval_base_spawn" }), building("dockyard", { coast: true, shared: true }),
  building("coastal_bunker", { coast: true }), building("naval_supply_hub", { coast: true }), building("naval_headquarters", { coast: true }),
  building("arms_factory", { shared: true }), building("bunker"), building("supply_node")].join("")}}\n`;

const COAST_ROWS = md.PER_COASTAL_PROVINCE_BUILDING_SLOTS.slice();            // the ones this fixture's buildings draw on: all three
const LAND_ROWS = md.PER_LAND_PROVINCE_BUILDING_SLOTS.slice();
const YARD = md.COASTAL_STATE_BUILDING_SLOTS.map(([t]) => t)[0];

function makeMod(name, { drop = [] } = {}) {
  const dir = path.join(ROOT, name);
  write(dir, "descriptor.mod", `name="${name}"\nreplace_path="history/states"\nreplace_path="map"\nreplace_path="common/buildings"\n`);
  write(dir, "map/provinces.bmp", bmp24(W, H, (x, y) => colour(shapeAt(x, y))));
  write(dir, "map/heightmap.bmp", bmp8(W, H, (x, y) => { const id = shapeAt(x, y); return id === SEA || id === BAY || id === LAKE ? 80 : 100 + ((x * 3 + y * 5) % 40); }));
  const defs = ["0;0;0;0;land;false;unknown;0", `${SEA};${colour(SEA).join(";")};sea;false;ocean;0`];
  for (let id = 2; id <= 16; id++) defs.push(`${id};${colour(id).join(";")};${id === BAY ? "sea" : id === LAKE ? "lake" : "land"};false;${id === BAY ? "ocean" : id === LAKE ? "lakes" : "plains"};${id === BAY || id === LAKE ? 0 : 1}`);
  write(dir, "map/definition.csv", defs.join("\n") + "\n");
  write(dir, "common/buildings/00_buildings.txt", BUILDINGS);
  for (const [sid, provs] of Object.entries(STATES)) {
    const port = +sid === 1 ? "\n\t\t\t3 = { naval_base = 2 }" : "";
    write(dir, `history/states/${sid}-S.txt`, `state = {\n\tid = ${sid}\n\tname = "STATE_${sid}"\n\tmanpower = 1000\n\tstate_category = rural\n\tprovinces = { ${provs.join(" ")} }\n\thistory = {\n\t\towner = AAA\n\t\tbuildings = {\n\t\t\tinfrastructure = 2${port}\n\t\t}\n\t}\n}\n`);
  }
  write(dir, "map/buildings.txt", "");
  const roots = { modRoot: dir, gameRoot: path.join(ROOT, "no-game"), dependencyRoots: [] };
  // every state laid out as Generate land lays one out (generateLand's own call)
  const model = md.buildMapModel({ ...roots, cacheStableLayers: true });
  const coastNow = md.landProvincesTouchingSea({ ...roots, model }) || new Set();
  const types = md.coastRowTypesDrawn(md.stateBuildingRules(model));
  for (const [sid, provs] of Object.entries(STATES)) {
    const ports = +sid === 1 ? [{ province: 3, level: 2 }] : [];
    md.ensureBuildingSlotsForState({ ...roots, stateId: +sid, provinces: provs, townPoints: md.stateBuildingAnchor({ ...roots, provinces: provs, each: true }),
      coast: { provinces: new Set(provs.filter((p) => coastNow.has(p))), ports, types } });
  }
  // gaps the layer below "ships": rows the edit must not put back, because the edit is not why they are missing
  if (drop.length) {
    const p = path.join(dir, "map", "buildings.txt");
    const lines = fs.readFileSync(p, "utf8").split("\n");
    const keep = lines.filter((l) => { const c = l.split(";"); return !(c.length >= 7 && drop.some(([sid, type, pid]) => +c[0] === sid && c[1] === type && provinceOf(c) === pid)); });
    fs.writeFileSync(p, keep.join("\n"));
  }
  return roots;
}
// a row's province is its pixel, on the map as the mod has it now
let pidAtNow = null;
function readMap(dir) {
  const buf = fs.readFileSync(path.join(dir, "map", "provinces.bmp"));
  const off = buf.readUInt32LE(10), w = buf.readInt32LE(18), h = buf.readInt32LE(22), rs = Math.floor((24 * w + 31) / 32) * 4;
  const byColour = new Map();
  for (const l of fs.readFileSync(path.join(dir, "map", "definition.csv"), "utf8").split(/\r?\n/)) { const c = l.split(";"); if (c.length >= 5 && +c[0] > 0) byColour.set(((+c[1] << 16) | (+c[2] << 8) | +c[3]) >>> 0, +c[0]); }
  pidAtNow = (x, y) => { const o = off + (h - 1 - y) * rs + x * 3; return byColour.get(((buf[o + 2] << 16) | (buf[o + 1] << 8) | buf[o]) >>> 0) || 0; };
}
const provinceOf = (c) => (pidAtNow || shapeAt)(Math.floor(+c[2]), H - 1 - Math.floor(+c[4]));
const rowsOf = (dir) => { readMap(dir); return fs.readFileSync(path.join(dir, "map", "buildings.txt"), "utf8").split(/\r?\n/).filter(Boolean).map((l) => l.split(";")).filter((c) => c.length >= 7)
  .map((c) => ({ sid: +c[0], type: c[1], line: c.join(";"), province: provinceOf(c) })); };
const on = (rows, sid, type, pid) => rows.filter((r) => r.sid === sid && r.type === type && r.province === pid).length;
const keyed = (rows, sid, type) => rows.filter((r) => r.sid === sid && r.type === type);
// What an edit ADDED of the kinds this pass writes, as "type@province" → how many more, on land: counted by (type, province) and not by
// the state key or the line, because the same edit re-keys the rows of a province that moves (rekeyBuildingAnchorsForProvince), turns
// and moves the harbours on a coast that moved (keepCoastRowsFacingTheirSea) and re-seats a row whose ground went under — none of them
// an addition — and gives a state back a standard kind it lost (giveMovedStatesTheirSites), which is not one of these kinds.
const MINE = new Set([...COAST_ROWS, YARD, ...LAND_ROWS]);
const addedOfMine = (before, after) => {
  const n = new Map(), tally = (rows, d) => { for (const r of rows) if (MINE.has(r.type) && LAND.concat(BAY).includes(r.province)) { const k = `${r.type}@${r.province}`; n.set(k, (n.get(k) || 0) + d); } };
  tally(after, 1); tally(before, -1);
  return [...n].filter(([, d]) => d > 0).map(([k, d]) => `${k}${d > 1 ? " ×" + d : ""}`).sort();
};
const coastOf = (roots) => md.landProvincesTouchingSea({ ...roots, model: md.buildMapModel({ ...roots, cacheStableLayers: true }) }) || new Set();
// the backups safeModWrite took under this pass's own label — one per write of map/buildings.txt it made
const passWrites = () => { let n = 0; const walk = (p) => { for (const e of fs.readdirSync(p, { withFileTypes: true })) { if (e.isDirectory()) walk(path.join(p, e.name)); else if (e.name.includes("map-giveEditedLandItsRows")) n++; } }; try { walk(process.env.APPDATA); } catch (_) {} return n; };
const at = (pid, types) => types.map((t) => `${t}@${pid}`);

console.log("\n=== 0. the fixture ===");
{
  const roots = makeMod("fixture");
  const coast = coastOf(roots), rows = rowsOf(roots.modRoot);
  ok([2, 3, 4, 5, 6, 9, 10, 11, 12, 13, 16].every((p) => coast.has(p)) && !coast.has(7) && !coast.has(8), `(the sea touches every province but 7 and 8: ${[...coast].sort((a, b) => a - b).join(" ")})`);
  ok(COAST_ROWS.length === 3 && md.coastRowTypesDrawn(md.stateBuildingRules(md.buildMapModel({ ...roots, cacheStableLayers: true }))).size === 4, "(its common/buildings draws the dockyard and all three per-province coast rows)");
  const short = [];
  for (const [sid, provs] of Object.entries(STATES)) for (const p of provs) {
    for (const t of LAND_ROWS) if (!on(rows, +sid, t, p)) short.push(`${sid}/${p}/${t}`);
    if (coast.has(p)) for (const t of COAST_ROWS) if (!on(rows, +sid, t, p)) short.push(`${sid}/${p}/${t}`);
  }
  ok(!short.length, "(every province holds every row the template gives it, laid out by Generate land's own call)", short);
  ok([1, 3, 4].every((sid) => keyed(rows, sid, YARD).length === 1) && !keyed(rows, 2, YARD).length, "(each coastal state holds one dockyard row; inland state 2 none)");
  ok(on(rows, 1, YARD, 3) === 1, "(state 1's dockyard row stands on its port, 3)");
}

console.log("\n=== 1. Erase — flip-province-sea { provinceId: 3 } ===");
{
  const roots = makeMod("erase", { drop: [[1, "coastal_bunker", 6]] });
  const before = rowsOf(roots.modRoot), w0 = passWrites();
  ok(!on(before, 1, "coastal_bunker", 6), "(the fixture: 6 is shipped with no coastal fort row — a gap of the layer below's)");
  const r = md.flipProvinceToSea({ ...roots, provinceId: 3 });
  ok(!!r && r.changed && !r.error, "(the erase answered changed)", r && r.error);
  const after = rowsOf(roots.modRoot), coast = coastOf(roots);
  ok(coast.has(7), "(7 touches the sea now)");
  const missing7 = COAST_ROWS.filter((t) => on(after, 2, t, 7) !== 1);
  ok(!missing7.length, `⭐⭐ 7, given a coast by the erase, holds one row of each coast type, keyed to its state 2 (${COAST_ROWS.join(", ")})`, missing7);
  ok(keyed(after, 2, YARD).length === 1 && on(after, 2, YARD, 7) === 1, "⭐⭐ state 2, coastal now, holds one dockyard row, on its coast (7)", keyed(after, 2, YARD).map((x) => x.line));
  ok(keyed(after, 1, YARD).length === 1 && [2, 6].includes(keyed(after, 1, YARD)[0].province), "⭐⭐ state 1 keeps a coast and holds a dockyard row again, on its own coast (its old one stood on 3)", keyed(after, 1, YARD).map((x) => x.line));
  const yard1 = (keyed(after, 1, YARD)[0] || {}).province;
  const want = at(7, COAST_ROWS.concat(YARD)).concat(`${YARD}@${yard1}`).sort();
  const got = addedOfMine(before, after);
  ok(JSON.stringify(got) === JSON.stringify(want), `⭐ nothing else was added — not 6's coastal fort, not a row for 4 (coastal before): ${got.join(", ")}`, { got, want });
  const where = (x) => `${x.sid};${x.type};${x.line.split(";")[2]};${x.line.split(";")[4]}`;
  const gone = before.filter((x) => x.province !== 3).filter((x) => !after.some((y) => where(y) === where(x)));
  ok(!gone.length, "⭐ every row that did not stand on 3 still stands where it stood (state, type, x, z — the harbour pass may turn one)", gone.map((x) => x.line));
  const br = r && r.buildingRows;
  erased = br;
  ok(!!br && br.placed.some((p) => p.stateId === 2 && p.dockyard && (p.coast || []).includes(7) && COAST_ROWS.every((t) => (p.coastKinds || []).includes(t)))
    && br.placed.some((p) => p.stateId === 1 && p.dockyard) && !br.failed.length, "⭐ the answer names what was added, by state, province and kind (the Save line reads it)", br);
  ok(passWrites() - w0 === 1, `⭐ the rows of both states went in one write of map/buildings.txt (${passWrites() - w0}), not one each`);
}

console.log("\n=== 1b. The same erase in an Erase stroke — flip-provinces-sea { provinceIds: [3, 7, 11] }, one sink ===");
{
  // ⛔ #an-erase-stroke-keeps-its-own-backups — the page sends a run of erases as one request, and each flip holds its sink back for the stroke's
  // one sink (`sinkLater`), so step 6 gives the new coast its rows before the ground under the erased provinces goes down
  const IDS = [3, 7, 11];
  const one = makeMod("erase-one-at-a-time", { drop: [[1, "coastal_bunker", 6]] });
  const stroke = makeMod("erase-stroke", { drop: [[1, "coastal_bunker", 6]] });
  const singles = IDS.map((provinceId) => md.flipProvinceToSea({ ...one, provinceId }));
  const batch = typeof md.flipProvincesToSea === "function" ? md.flipProvincesToSea({ ...stroke, provinceIds: IDS }) : null;
  ok(singles.every((r) => r && r.changed && !r.error) && !!batch && batch.flipped === IDS.length && !batch.error, "(both erased all three, one at a time and as a stroke)", { singles: singles.map((r) => r && r.error), batch: batch && (batch.error || batch.flipped) });
  const coastGot = (r, pid) => !!(r && r.buildingRows && r.buildingRows.placed.some((p) => (p.coast || []).includes(pid)));
  ok(coastGot(singles[0], 7) && coastGot(singles[1], 8), "(one at a time, 3's erase gives 7 its coast rows, and 7's gives 8 its)", singles.map((r) => r && r.buildingRows));
  const file = (roots, rel) => fs.readFileSync(path.join(roots.modRoot, ...rel.split("/")));
  const lines = (roots) => file(roots, "map/buildings.txt").toString("utf8").split(/\r?\n/).filter(Boolean);
  ok(file(stroke, "map/buildings.txt").equals(file(one, "map/buildings.txt")),
    "⭐⭐⭐ the stroke's map/buildings.txt is byte for byte the one-at-a-time's: every row of the coast it made where, at the height and turned the way one erase at a time puts it",
    { onlyOne: lines(one).filter((l) => !lines(stroke).includes(l)).slice(0, 6), onlyStroke: lines(stroke).filter((l) => !lines(one).includes(l)).slice(0, 6) });
  ok(file(stroke, "map/heightmap.bmp").equals(file(one, "map/heightmap.bmp")), "(…on the same ground: the two heightmaps are the same bytes)");
  const said = (r) => JSON.stringify(r && r.buildingRows ? r.buildingRows.placed : null);
  const answers = (batch && batch.results) || [];
  ok(answers.length === IDS.length && answers.every((r, i) => r.provinceId === IDS[i] && said(r) === said(singles[i])),
    "⭐⭐ …and each province's answer in the stroke names the rows its own erase names (the Save line reads them off it)", answers.map((r, i) => [r.provinceId, said(r) === said(singles[i])]));
  const left = rowsOf(stroke.modRoot).filter((r) => MINE.has(r.type) && IDS.includes(r.province));
  ok(!left.length, "⭐ …and no row of these kinds stands on a province the stroke erased: the rows 3's erase gave 7 went with 7", left.map((r) => r.line));
}

console.log("\n=== 2. + New state: create-state { name: \"\", owner }, then move-province { provinceId, toStateId } ===");
{
  const roots = makeMod("carve");
  const c1 = md.createState({ ...roots, name: "", owner: "AAA" });
  ok(!!c1 && c1.ok, "(create-state made a state)", c1);
  const m1 = md.moveProvince({ ...roots, provinceId: 3, toStateId: c1.id });
  ok(!!m1 && m1.changed, "(move-province 3 answered changed)", m1 && m1.error);
  let rows = rowsOf(roots.modRoot);
  ok(keyed(rows, 1, YARD).length === 1 && [2, 6].includes(keyed(rows, 1, YARD)[0].province), "⭐⭐ state 1, still coastal, holds a dockyard row on its own coast (the one on 3 went with the carve)", keyed(rows, 1, YARD).map((x) => x.line));
  ok(keyed(rows, c1.id, YARD).length === 1 && on(rows, c1.id, YARD, 3) === 1, `⭐ the new state ${c1.id} holds the dockyard row that stood on 3, and no second`, keyed(rows, c1.id, YARD).map((x) => x.line));
  ok(!!m1.buildingRows && m1.buildingRows.placed.some((p) => p.stateId === 1 && p.dockyard), "(the move's answer names state 1's dockyard row)", m1.buildingRows);
  const c2 = md.createState({ ...roots, name: "", owner: "AAA" });
  const m2 = md.moveProvince({ ...roots, provinceId: 2, toStateId: c2.id });
  ok(!!m2 && m2.changed, "(move-province 2 answered changed)", m2 && m2.error);
  rows = rowsOf(roots.modRoot);
  ok(keyed(rows, c2.id, YARD).length === 1 && on(rows, c2.id, YARD, 2) === 1, `⭐⭐ a second carve, of 2: the new state ${c2.id} holds a dockyard row on its coast`, keyed(rows, c2.id, YARD).map((x) => x.line));
  ok(keyed(rows, 1, YARD).length >= 1 && keyed(rows, 1, YARD).every((x) => x.province === 6), "⭐ and state 1, left with 6, holds one on 6", keyed(rows, 1, YARD).map((x) => x.line));
}
{
  // the server's own carve, create-state with its provinces (/api/map/create-state { name, owner, provinces }): the same answer
  const roots = makeMod("carve-api");
  const c = md.createState({ ...roots, name: "", owner: "AAA", provinces: [3] });
  ok(!!c && c.ok, "(create-state { provinces: [3] } made a state)", c);
  const rows = rowsOf(roots.modRoot);
  ok(keyed(rows, 1, YARD).length === 1 && [2, 6].includes(keyed(rows, 1, YARD)[0].province), "⭐⭐ a carve of 3 by create-state's own provinces: state 1, still coastal, holds a dockyard row on its own coast", keyed(rows, 1, YARD).map((x) => x.line));
  ok(keyed(rows, c.id, YARD).length === 1 && on(rows, c.id, YARD, 3) === 1, `⭐ the new state ${c.id} holds the one that stood on 3, and no second`, keyed(rows, c.id, YARD).map((x) => x.line));
  ok(!!c.buildingRows && c.buildingRows.placed.some((p) => p.stateId === 1 && p.dockyard), "(the answer names state 1's dockyard row)", c.buildingRows);
}

const newLandChecks = (label, roots, before, sid) => {
  const after = rowsOf(roots.modRoot);
  const short = LAND_ROWS.concat(COAST_ROWS).filter((t) => on(after, sid, t, BAY) !== 1);
  ok(!short.length, `⭐⭐ ${label}: 14 holds one row of each of the six, keyed to state ${sid} and standing on 14`, short);
  const got = addedOfMine(before, after), want = at(BAY, LAND_ROWS.concat(COAST_ROWS)).sort();
  ok(JSON.stringify(got) === JSON.stringify(want), `⭐⭐ ${label}: no row was added anywhere else — not on 16, the state's highest id, where a top-up by count puts one: ${got.join(", ")}`, { got, want });
  ok(keyed(after, sid, YARD).length === 1, `${label}: state ${sid} keeps its one dockyard row`, keyed(after, sid, YARD).map((x) => x.line));
};

console.log("\n=== 3. The type dropdown's sea → land, then a move into state 3 ===");
{
  const roots = makeMod("bay-move");
  const before = rowsOf(roots.modRoot);
  const t = md.setProvinceDefinitionWithItsRows({ ...roots, provinceId: BAY, terrain: "plains", type: "land", coastal: false });
  ok(!!t && t.changed && !t.error, "(set-province-terrain's write of the inspector's { provinceId: 14, terrain: plains, type: land, coastal: false } answered changed)", t && t.error);
  ok(coastOf(roots).has(BAY), "(14 is land touching the sea)");
  const m = md.moveProvince({ ...roots, provinceId: BAY, toStateId: 3 });
  ok(!!m && m.changed, "(move-province 14 → 3 answered changed)", m && m.error);
  newLandChecks("moved", roots, before, 3);
  ok(!!m.buildingRows && m.buildingRows.placed.some((p) => p.stateId === 3 && (p.land || []).includes(BAY) && (p.coast || []).includes(BAY)), "⭐ the move's answer names 14 as new land and as coast", m.buildingRows);
}

console.log("\n=== 4. The same new land, homed by Auto-fix's stateless-land pass ===");
{
  const roots = makeMod("bay-autofix");
  const before = rowsOf(roots.modRoot);
  md.setProvinceDefinitionWithItsRows({ ...roots, provinceId: BAY, terrain: "plains", type: "land", coastal: false });
  const f = md.fixStatelessLand(roots);
  ok(!!f && f.fixed === 1 && f.details[0].addedToState === 3, "(the stateless-land pass homed 14 into state 3)", f);
  newLandChecks("homed", roots, before, 3);
  ok(!!f.buildingRows && f.buildingRows.placed.some((p) => p.stateId === 3 && (p.land || []).includes(BAY)), "⭐ the pass's answer names 14 (Auto-fix's summary reads it)", f.buildingRows);
}

console.log("\n=== 5. The type dropdown's lake → sea ===");
{
  const roots = makeMod("lake");
  const before = rowsOf(roots.modRoot);
  // (the inspector's body: its terrain dropdown still holds the lake's own terrain)
  const t = md.setProvinceDefinitionWithItsRows({ ...roots, provinceId: LAKE, terrain: "lakes", type: "sea", coastal: false });
  ok(!!t && t.changed && !t.error, "(set-province-terrain's write of { provinceId: 15, terrain: lakes, type: sea, coastal: false } answered changed)", t && t.error);
  ok(coastOf(roots).has(8), "(8 touches the sea now)");
  const after = rowsOf(roots.modRoot);
  const short = COAST_ROWS.filter((x) => on(after, 4, x, 8) !== 1);
  ok(!short.length, "⭐⭐ 8, given a coast, holds one row of each coast type, keyed to its state 4", short);
  const got = addedOfMine(before, after), want = at(8, COAST_ROWS).sort();
  ok(JSON.stringify(got) === JSON.stringify(want) && keyed(after, 4, YARD).length === 1, `⭐ nothing else was added, and state 4 (coastal before, through 12) keeps its one dockyard row: ${got.join(", ")}`, { got, want });
  ok(!!t.buildingRows && t.buildingRows.placed.some((p) => p.stateId === 4 && (p.coast || []).includes(8)), "(the answer names 8)", t.buildingRows);
}

console.log("\n=== 6. ✏ Paint shape: a channel of sea through 3 to 7 ===");
{
  const roots = makeMod("paint");
  const before = rowsOf(roots.modRoot);
  const [r, g, b] = colour(SEA), diff = [];
  for (let y = 5; y < 15; y++) for (let x = 24; x < 26; x++) diff.push({ x, y, r, g, b });
  const p = md.applyProvinceDiff({ ...roots, diff, requireDefinedColours: true });
  ok(!!p && p.ok, "(paint-provinces { diff } answered ok)", p && p.error);
  ok(coastOf(roots).has(7), "(7 touches the channel)");
  const after = rowsOf(roots.modRoot);
  const short = COAST_ROWS.filter((x) => on(after, 2, x, 7) !== 1);
  ok(!short.length, "⭐⭐ 7, given a coast by the stroke, holds one row of each coast type, keyed to its state 2", short);
  ok(keyed(after, 2, YARD).length === 1 && on(after, 2, YARD, 7) === 1, "⭐⭐ state 2 holds a dockyard row on 7", keyed(after, 2, YARD).map((x) => x.line));
  const got = addedOfMine(before, after), want = at(7, COAST_ROWS.concat(YARD)).sort();
  ok(JSON.stringify(got) === JSON.stringify(want), `⭐ nothing else was added (3 and 4 were coastal before): ${got.join(", ")}`, { got, want });
  ok(!!p.buildingRows && p.buildingRows.placed.some((q) => q.stateId === 2 && q.dockyard), "(the answer names state 2's rows — the paint's Save line reads it)", p.buildingRows);
}

console.log("\n=== 7. Control — a move of a province that carries its rows, between two coastal states ===");
{
  const roots = makeMod("plain-move");
  const before = rowsOf(roots.modRoot);
  const m = md.moveProvince({ ...roots, provinceId: 13, toStateId: 4 });
  ok(!!m && m.changed, "(move-province 13 → 4 answered changed)", m && m.error);
  const after = rowsOf(roots.modRoot), got = addedOfMine(before, after);
  ok(!got.length && !m.buildingRows, "⭐ no row of the coast's or a land province's was added, and the answer names none (13's own went with it)", { got, rows: m.buildingRows });
}
{
  // a merge moves every province of the merged state one by one (moveProvince) and writes no rows of its own: the merged state's rows go
  // with its provinces. Given rows half-way, the target — inland state 2, coastal once 2 is in it — got a dockyard row of its own before
  // 3 carried state 1's in: two, where the two states held one between them
  const roots = makeMod("merge");
  const before = rowsOf(roots.modRoot);
  const r = md.mergeState({ ...roots, sourceStateId: 1, targetStateId: 2 });
  ok(!!r && r.changed !== false && !r.error, "(merge-state { sourceStateId: 1, targetStateId: 2 } answered)", r && r.error);
  const after = rowsOf(roots.modRoot), got = addedOfMine(before, after);
  ok(!got.length && keyed(after, 2, YARD).length === 1 && on(after, 2, YARD, 3) === 1, `⭐ a merge adds no row of its own: state 2 holds the one dockyard row that stood on 3, and nothing was added: ${got.join(", ")}`, { got, yard: keyed(after, 2, YARD).map((x) => x.line) });
}

console.log("\n=== 8. The page says it — on the line after a Save, a paint, and Auto-fix ===");
{
  let say = () => "";
  try { const box = {}; vm.runInNewContext(lift("function buildingRowsNote(") + "\nthis.f = buildingRowsNote;", box); say = box.f; }
  catch (e) { ok(false, "⭐ the page has buildingRowsNote", e.message); }
  const line = say(erased, (sid) => `S${sid}`);
  ok(/^🏭 Nova added \d+ building positions to map\/buildings\.txt for the coast and land the edit made/.test(line)
    && /S2 a dockyard position on its coast and coastal fort, naval supply hub and naval HQ positions on province 7, given a coast by the edit/.test(line)
    && /S1 a dockyard position on its coast/.test(line), "⭐ the Save line says, per state, the dockyard position and the kinds on each province the edit gave a coast — section 1's own answer", line);
  const part = say({ placed: (erased || {}).placed }, (sid) => `state ${sid}`, "part");
  ok(/^added \d+ building positions/.test(part), "(Auto-fix's list takes the phrase alone)", part);
  const refused = say({ placed: [], failed: [{ stateId: 5, reason: "map/provinces.bmp could not be read" }] }, (sid) => `S${sid}`);
  ok(/could not add the building positions S5 needs/.test(refused) && /provinces\.bmp could not be read/.test(refused), "⭐ a state the rows could not be placed for is said, with why", refused);
  ok(say(null) === "" && say({ placed: [], failed: [] }) === "", "(nothing added, nothing said)");
  const map = stripJsComments(fs.readFileSync(path.join(__dirname, "public", "map.js"), "utf8").replace(/\r\n/g, "\n"));
  const flush = map.slice(map.indexOf("async function flushMapSaves("), map.indexOf("async function flushMapSaves(") + 60000);
  ok((flush.match(/buildingRowsNote\(res\.buildingRows,/g) || []).length === 2, "⭐ the Save loop says it for every write that answers buildingRows, and the paint's step for the painted shapes", (flush.match(/buildingRowsNote\(res\.buildingRows,/g) || []).length);
  ok(/buildingRowsNote\(\{ placed: sl\.buildingRows\.placed \}/.test(map) && /buildingRowsNote\(\{ failed: sl\.buildingRows\.failed \}/.test(map), "⭐ Auto-fix's summary says what its stateless-land pass added, and what it could not", null);
  // the type dropdown's endpoint writes through the function sections 3–5 drive, not the bare row writer
  const srv = stripJsComments(fs.readFileSync(path.join(__dirname, "server.js"), "utf8").replace(/\r\n/g, "\n"));
  const at = srv.indexOf('app.post("/api/map/set-province-terrain"'), next = srv.indexOf("app.post(", at + 10);
  const handler = at >= 0 && next > at ? srv.slice(at, next) : "";
  ok(/mapData\.setProvinceDefinitionWithItsRows\(\{/.test(handler) && !/mapData\.setProvinceDefinition\(\{/.test(handler), "⭐ POST /api/map/set-province-terrain writes with setProvinceDefinitionWithItsRows", handler.length);
}

console.log("\n=== 9. Delete state, then Auto-fix: the land it homes keeps the rows it stood on, once ===");
{
  // (Review of the coast rows, CR-R2.) deleteState takes a state's history file and leaves its map/buildings.txt rows keyed to the id that
  // is gone. Auto-fix's stateless-land pass homes its provinces and gives each the rows its land and coast need, judged BY POSITION; only
  // the click's last pass, fixBuildingsTxtPlacement, re-keys the deleted state's rows to the province's new state. Judged under the new
  // state's key, every homed province looked bare and got a second set beside its own: on a copy of Millennium Dawn, Delete state 1055 and
  // one Auto-fix click left 724, 877 and 11673 with two bunker, supply_node and special-project rows each and 9817 with two of five kinds,
  // 14 rows a second click kept. The deleted state here is 1 = { 2 3 6 }, every province of it coastal, its dockyard row on its port 3:
  // once as the fixture lays it out (3 and 2 go to state 3, 6 to inland state 2), and once with strategic regions that send all three to
  // state 2 — which then holds a coast and no dockyard row of its own key, so the pass gave it a second one beside state 1's.
  const region = (id, provs) => `strategic_region = {\n\tid = ${id}\n\tname = "REGION_${id}"\n\tprovinces = {\n\t\t${provs.join(" ")}\n\t}\n}\n`;
  const deleteThenFix = (label, regions) => {
    const roots = makeMod(label);
    if (regions) regions.forEach((provs, k) => write(roots.modRoot, `map/strategicregions/${k + 1}-R.txt`, region(k + 1, provs)));
    const bt = () => fs.readFileSync(path.join(roots.modRoot, "map", "buildings.txt"), "utf8");
    const before = rowsOf(roots.modRoot);
    const d = md.deleteState({ ...roots, stateId: 1 });
    ok(!!d && d.changed && !d.error, `${label}: (delete-state { stateId: 1 } answered changed)`, d && d.error);
    ok(bt().split("\n").filter((l) => l.split(";")[0] === "1").length === before.filter((r) => r.sid === 1).length, `${label}: (the delete leaves state 1's rows in map/buildings.txt, keyed to the id that is gone)`);
    const fx = md.autoFixMap(roots);
    const sl = ((fx && fx.fixes) || {}).statelessLand || {};
    // (the same click closes the id gap the delete left: state 4 is state 1 after it)
    const idNow = (sid) => { const r = ((((fx && fx.fixes) || {}).stateGaps || {}).renumbered || []).find((x) => x.from === sid); return r ? r.to : sid; };
    const homed = new Map((sl.details || []).map((x) => [x.province, idNow(x.addedToState)]));
    ok(!!fx && fx.ok && [2, 3, 6].every((p) => homed.has(p)), `${label}: (Auto-fix homed 2, 3 and 6: ${[...homed].map(([p, s]) => `${p} → ${s}`).join(", ")})`, sl);
    const after = rowsOf(roots.modRoot);
    const wrong = [];
    for (const p of [2, 3, 6]) for (const t of LAND_ROWS.concat(COAST_ROWS)) {
      const all = after.filter((r) => r.type === t && r.province === p);
      if (all.length !== 1 || all[0].sid !== homed.get(p)) wrong.push(`${t}@${p}: ${all.map((r) => `state ${r.sid}`).join(", ") || "none"}`);
    }
    ok(!wrong.length, `⭐⭐ ${label}: each homed province holds ONE row of each kind it stood on, keyed to the state it went to — not a second set beside its own`, wrong);
    const given = ((sl.buildingRows || {}).placed || []).flatMap((x) => (x.land || []).concat(x.coast || []));
    ok(![2, 3, 6].some((p) => given.includes(p)), `⭐ ${label}: …and the pass's answer names no row for them: theirs came with them`, sl.buildingRows);
    // the dockyard rows, as the click leaves them: state 1's (on 3) is re-keyed to the state 3 went to, and a state the click made coastal
    // that the re-home gave none gets one of its own
    const yardsOf = (rows, sid) => rows.filter((r) => r.type === YARD && r.sid === sid).length;
    const rehomedIn = (sid) => before.filter((r) => r.sid === 1 && r.type === YARD && homed.get(r.province) === idNow(sid)).length;
    const coastAfter = coastOf(roots), statesNow = md.buildMapModel({ ...roots, cacheStableLayers: true }).states;
    const yards = [2, 3, 4].map((sid) => ({ sid, now: idNow(sid), was: yardsOf(before, sid), rehomed: rehomedIn(sid), rows: yardsOf(after, idNow(sid)),
      coastal: (statesNow.find((s) => s.id === idNow(sid)) || { provinces: [] }).provinces.some((p) => coastAfter.has(p)) }));
    const extra = yards.filter((x) => x.rows !== x.was + x.rehomed + (x.coastal && !(x.was + x.rehomed) ? 1 : 0));
    ok(!extra.length, `⭐ ${label}: no state is given a dockyard row beside one it holds or the re-home gives it; a state the click made coastal with none gets one`, { extra, yards });
    const t1 = bt();
    md.autoFixMap(roots);
    ok(bt() === t1, `⭐ ${label}: a second Auto-fix click writes nothing to map/buildings.txt`);
    return { homed, yards };
  };
  deleteThenFix("delete");
  const viaRegions = deleteThenFix("delete-by-region", [[2, 3, 6, 7], [4, 5, 8, 9, 10, 11, 12, 13, 16], [SEA, BAY, LAKE]]);
  ok([2, 3, 6].every((p) => viaRegions.homed.get(p) === 2) && (viaRegions.yards.find((x) => x.sid === 2) || {}).rows === 1,
    "⭐⭐ by region all three go to state 2, inland before: it holds ONE dockyard row, the one that stood on 3, and not a second one the pass gave it", viaRegions);
}

console.log(`\n${pass} passed, ${fail} failed`);
try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
process.exit(fail ? 1 : 0);
