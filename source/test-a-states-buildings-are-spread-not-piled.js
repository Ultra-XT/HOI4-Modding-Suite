// ⛔ #a-states-buildings-are-spread-not-piled — A STATE'S OWN BUILDING ROWS ARE SPREAD OVER ITS PROVINCES, NOT PILED ON ITS STAR.
//
// The owner played TEST 31 (09-30) and reported "not all cities seem to have a city graphics, some only have factories". What
// stood at every star was a pile: all 22 of a state's own map/buildings.txt rows — six arms_factory, six industrial_complex, its
// air base and the rest — inside ONE 3x3 at stateBuildingAnchor's point, on the supply hub and the city core. An arms_factory row
// stood on an industrial_complex row's spot in 1,080 of its 1,081 states; vanilla's factory rows reach a median 29.7 px from their
// own middle, over 6 provinces, at 12 spots, and its nearest one stands 5 px from the hub.
//
// So ensureBuildingSlotsForState takes a state's rows from a LIST of positions (buildingSpreadPositions): the town province's ring
// — east, north, west, south of its town point, 6 px out where there is room and never nearer than 3 — then every other province,
// nearest first, its ring. The town's own point is reserved for the hub and the city. industrial_complex takes
// the 1st, 3rd, 5th…, arms_factory the 2nd, 4th, 6th…, the air base the first position outside the town province, the rest carry
// on from where the factories stop (stateSlotLayout). A state too thin to have the positions keeps the pile, as before — ⚠️ MOVED with
// #a-small-states-models-are-spread-over-its-land: no longer in one 3x3 but on spots of their own over the state's land (states 3, 5).
//
// ⛔ #every-town-point-is-kept-clear — a province gave its town point first and then its ring, and the air base takes the first
// position outside the town province: on vanilla's geometry it stood exactly on the neighbouring province's town point — its
// supply_node, bunker and special_project_facility_spawn rows, and its Standstill — in 999 of 1,024 laid-out states (vanilla as
// shipped: 6 of 1,081). Now every province's town point is kept clear by 3 px, and one is taken only by a state whose rings
// alone are too few to spread over (state 8).
//
// Pinned on eight fixture states, every expected spot derived from the fixture's rectangles and the town points, never typed in:
//   1  four roomy provinces                     the spread itself
//   2  one province, sea on three sides and     a ring pulled in so no row leaves the state (#a-building-over-water), the air
//      another state on the fourth              base on the ring point furthest out unless its model hangs over the sea there
//                                               (#an-airfield-stands-inside-its-province), and a position taken twice one pixel aside
//   3  one province 7 px wide                   no ring point east or west, so too thin: the pile — all but the air base, which
//                                               leaves for a position — its two factories taking its 3x3 in turn
//   4  a province and a 2 px strip beside it    two positions are never nearer than 3 px, nor a position and a town point
//   5  a 2 px strip between two seas            the pile's own guard: no step sideways; the CONTROL that the checks above can see
//                                               an arms_factory on an industrial_complex's spot
//   6  a province on the map's east edge and    no position on the map's first or last column — past either, the bitmap reads
//      one on its west edge                     on into the next row, which here is the state's own land
//   7  a town province with one province        of two provinces equally near, the lower id is taken first
//      north of it and one south, as far
//   8  a 5 px town province and a 7 px wide     rings alone give two positions, so the other province's town point makes a third
//      one                                      and the state is spread, not piled
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-spread-"));
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

// ── the fixture: rectangles [x0, y0, x1, y1) on a 96 x 64 sea (province 1), rows top-down ──────────────────────────────────
const W = 96, H = 64, SEA = 1;
const RECT = {
  2: [8, 8, 28, 28],     // state 1's town province: its smallest
  3: [28, 8, 52, 32],    // …the nearest to it
  4: [8, 28, 28, 56],
  5: [28, 32, 60, 62],
  6: [70, 8, 80, 22],    // state 2: sea west, north and south, state 3 to the east
  7: [80, 8, 87, 40],    // state 3: 7 px wide
  8: [72, 44, 85, 58],   // state 4's town province
  9: [85, 44, 87, 58],   // …and a strip 2 px wide along its east side
  10: [90, 8, 92, 40],   // state 5: a strip 2 px wide between two seas
  11: [88, 42, 96, 52],  // state 6's town province, against the map's EAST edge
  12: [0, 40, 7, 54],    // …and its other province, against the WEST edge
  13: [55, 9, 66, 16],   // state 7's town province
  14: [55, 16, 66, 25],  // …the province south of it
  15: [55, 0, 66, 9],    // …and the one north, its town point exactly as far away
  16: [62, 59, 67, 64],  // state 8's town province: 5 px square, no room for a ring point
  17: [62, 27, 69, 59],  // …and a province 7 px wide: a ring point north and south of its town point, none east or west
};
const STATES = { 1: [2, 3, 4, 5], 2: [6], 3: [7], 4: [8, 9], 5: [10], 6: [11, 12], 7: [13, 14, 15], 8: [16, 17] };
const provAt = (x, y) => { for (const [id, [x0, y0, x1, y1]] of Object.entries(RECT)) if (x >= x0 && x < x1 && y >= y0 && y < y1) return +id; return SEA; };
const stateOf = (p) => +(Object.keys(STATES).find((s) => STATES[s].includes(p)) || 0);
const colour = (id) => [(id * 37) % 256, (id * 71) % 256, 40 + id];
const heightOf = (x, y) => (provAt(x, y) === SEA ? 80 : 96 + ((x * 3 + y * 5) % 120));   // no two neighbours alike, so a row's height says which pixel it was read under
const mod = path.join(ROOT, "mod");
const roots = { modRoot: mod, gameRoot: path.join(ROOT, "no-game"), dependencyRoots: [] };
write(mod, "descriptor.mod", 'name="spread"\nreplace_path="history/states"\nreplace_path="map"\n');
write(mod, "map/provinces.bmp", bmp24(W, H, (x, y) => colour(provAt(x, y))));
write(mod, "map/heightmap.bmp", bmp8(W, H, heightOf));
write(mod, "map/definition.csv", ["0;0;0;0;land;false;unknown;0", `1;${colour(1).join(";")};sea;false;ocean;0`]
  .concat(Object.keys(RECT).map((id) => `${id};${colour(+id).join(";")};land;false;plains;1`)).join("\n") + "\n");
for (const [s, provs] of Object.entries(STATES)) {
  write(mod, `history/states/${s}-S.txt`, `state = {\n\tid = ${s}\n\tname = "STATE_${s}"\n\tmanpower = 1000\n\tstate_category = rural\n\tprovinces = { ${provs.join(" ")} }\n\thistory = {\n\t\towner = AAA\n\t}\n}\n`);
}
const BUILDINGS = path.join(mod, "map", "buildings.txt");
const OTHER_ROW = "99;radar_station;1.00;9.50;1.00;0.00;0";                      // a file to append to, and a row that is nobody's here
write(mod, "map/buildings.txt", OTHER_ROW + "\n");

const PER_STATE = md.STATE_BUILDING_SLOTS.map(([t]) => t), PER_PROVINCE = md.PER_LAND_PROVINCE_BUILDING_SLOTS;
const SLOTS = md.STATE_BUILDING_SLOTS.reduce((a, [, n]) => a + n, 0);
const countOf = (type) => (md.STATE_BUILDING_SLOTS.find(([t]) => t === type) || [0, 0])[1];
const readRows = () => fs.readFileSync(BUILDINGS, "utf8").split(/\r?\n/).filter(Boolean).map((l) => l.split(";")).filter((c) => c.length >= 7)
  .map((c) => { const x = +c[2], z = +c[4], px = Math.floor(x), row = H - 1 - Math.floor(z); return { sid: +c[0], type: c[1], x, y: c[3], z, px, row, province: provAt(px, row), spot: `${c[2]};${c[4]}` }; });
const ownRows = (sid, rows = readRows()) => rows.filter((r) => r.sid === sid && PER_STATE.includes(r.type));
const cheb = (a, b) => Math.max(Math.abs(a.px - b.px), Math.abs(a.row - b.row));
const full3x3 = (sid, px, row) => { for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (stateOf(provAt(px + dx, row + dy)) !== sid) return false; return true; };
const onAnAfSpot = (rows) => { const ic = new Set(rows.filter((r) => r.type === "industrial_complex").map((r) => r.spot)); return rows.filter((r) => r.type === "arms_factory" && ic.has(r.spot)).length; };
const townPointsOf = (sid) => md.stateBuildingAnchor({ ...roots, provinces: STATES[sid], each: true });
const pix = (t) => ({ px: Math.floor(t.x), row: H - 1 - Math.floor(t.z) });
const area = (p) => (RECT[p][2] - RECT[p][0]) * (RECT[p][3] - RECT[p][1]);
/** the fixture's own answer to townProvinceOf: the smallest province 3 px or more each way (a 3x3 of its own), else the largest */
const homeOf = (sid) => STATES[sid].filter((p) => RECT[p][2] - RECT[p][0] >= 3 && RECT[p][3] - RECT[p][1] >= 3).sort((a, b) => area(a) - area(b) || a - b)[0]
  || STATES[sid].slice().sort((a, b) => area(b) - area(a) || a - b)[0];
/** stateBuildingAnchor's `positions` answer, read so that a build without one fails its checks rather than throwing */
const spreadOf = (sid) => { const a = md.stateBuildingAnchor({ ...roots, provinces: STATES[sid], positions: true }) || {}; return { ...a, positions: Array.isArray(a.positions) ? a.positions : [] }; };
const layoutOf = (a) => (typeof md.stateSlotLayout === "function" ? md.stateSlotLayout(a) : undefined);
const NEAR = 3, FAR = 6;                                                         // the ring: never nearer the town point than 3 px, 6 where there is room
/** how far out a ring point can stand on one side of `pid` from its town point: `inState` when the land past that edge is the state's own */
const room = (pid, t, side, inState) => {
  const [x0, y0, x1, y1] = RECT[pid], p = pix(t), edge = inState ? 0 : 1;      // a foreign neighbour keeps the whole 3x3 inside the province
  const most = side === "E" ? x1 - 1 - edge - p.px : side === "W" ? p.px - x0 - edge : side === "N" ? p.row - y0 - edge : y1 - 1 - edge - p.row;
  return Math.min(FAR, most) >= NEAR ? Math.min(FAR, most) : 0;
};
const ringPoint = (t, side, out) => { const p = pix(t); return side === "E" ? { px: p.px + out, row: p.row } : side === "W" ? { px: p.px - out, row: p.row } : side === "N" ? { px: p.px, row: p.row - out } : { px: p.px, row: p.row + out }; };
const at = (rows, p) => rows.filter((r) => r.px === p.px && r.row === p.row);
// ⛔ #an-airfield-stands-inside-its-province — the pixels the airfield's model covers from a whole-pixel row, from md.AIRFIELD_REACH
const fieldOf = (p) => { const R = md.AIRFIELD_REACH || {}, Y = p.row + 1, out = []; for (let r = Math.floor(Y - R.north); r <= Math.ceil(Y + R.south) - 1; r++) for (let c = Math.floor(p.px - R.west); c <= Math.ceil(p.px + R.east) - 1; c++) out.push({ px: c, row: r }); return out; };
const fieldIn = (p, pid) => { const f = fieldOf(p); return f.length > 0 && f.every((q) => q.px >= 0 && q.px < W && q.row >= 0 && q.row < H && provAt(q.px, q.row) === pid); };

console.log(`\n-- the slot pass furnishes all ${Object.keys(STATES).length} states --`);
const fixed = md.fixStatesWithoutBuildingSlots(roots);
ok(fixed && fixed.fixed === Object.keys(STATES).length && !(fixed.failed || []).length, `fixStatesWithoutBuildingSlots — Auto-fix's own pass — gave each of the ${Object.keys(STATES).length} states its rows`, fixed);
const all = readRows();
ok(Object.keys(STATES).every((s) => ownRows(+s, all).length === SLOTS), `each has its ${SLOTS} own rows (${PER_STATE.length} types)`, Object.keys(STATES).map((s) => ownRows(+s, all).length));

// ── state 1: the spread ────────────────────────────────────────────────────────────────────────────────────────────────
console.log("\n-- ⭐ 1. a state of four roomy provinces: its rows are spread, the factories apart --");
{
  const tp = townPointsOf(1), rows = ownRows(1, all);
  const anchor = spreadOf(1);
  const home = homeOf(1), T = tp.get(home), t0 = pix(T);
  ok(anchor.home === home && home === STATES[1].slice().sort((a, b) => area(a) - area(b))[0], "its town province — the anchor's `home` — is its smallest, which has a 3x3 of its own", anchor.home);
  const others = STATES[1].filter((p) => p !== home).sort((a, b) => Math.hypot(pix(tp.get(a)).px - t0.px, pix(tp.get(a)).row - t0.row) - Math.hypot(pix(tp.get(b)).px - t0.px, pix(tp.get(b)).row - t0.row));
  ok(["E", "N", "W", "S"].every((s) => room(home, T, s, false) === FAR), "(the fixture: the town province has room for a ring point 6 px out on every side)");
  const E = ringPoint(T, "E", FAR), N = ringPoint(T, "N", FAR), Wp = ringPoint(T, "W", FAR), S = ringPoint(T, "S", FAR);
  const ic = rows.filter((r) => r.type === "industrial_complex"), af = rows.filter((r) => r.type === "arms_factory");
  ok(onAnAfSpot(rows) === 0, "⭐⭐ no arms_factory row stands on an industrial_complex row's spot", onAnAfSpot(rows));
  const nearest = Math.min(...ic.map((a) => Math.min(...af.map((b) => cheb(a, b)))));
  ok(nearest >= NEAR, `⭐⭐ …nor beside one: the nearest pair is ${NEAR} px apart or more`, nearest);
  ok(new Set(ic.map((r) => r.spot)).size === countOf("industrial_complex") && new Set(af.map((r) => r.spot)).size === countOf("arms_factory")
    && new Set(ic.concat(af).map((r) => r.spot)).size === countOf("industrial_complex") + countOf("arms_factory"),
  "⭐ the twelve factory rows stand on twelve spots", [new Set(ic.map((r) => r.spot)).size, new Set(af.map((r) => r.spot)).size]);
  ok(at(ic, E).length === 1 && at(ic, Wp).length === 1 && at(af, N).length === 1 && at(af, S).length === 1 && at(rows, E).length === 1 && at(rows, N).length === 1,
    `⭐⭐ the ring is walked east, north, west, south, ${FAR} px out: industrial_complex takes east and west of the town point, arms_factory north and south`,
    { E, N, W: Wp, S, ic: ic.map((r) => [r.px, r.row]), af: af.map((r) => [r.px, r.row]) });
  ok(rows.filter((r) => cheb(r, t0) < NEAR - 1).length === 0, "⭐⭐ the town point is kept clear: none of the state's own rows stands on it or beside it", rows.filter((r) => cheb(r, t0) < NEAR - 1).map((r) => [r.type, r.px, r.row]));
  // ⚠️ MOVED with ⛔ #a-fort-stands-off-its-depot: all three per-province rows stood on the town point; the supply_node, its station,
  // still does, and the fort and the special-project site stand off it (test-a-fort-stands-off-its-depot.js)
  const hubRows = all.filter((r) => r.sid === 1 && PER_PROVINCE.includes(r.type) && r.px === t0.px && r.row === t0.row);
  ok(hubRows.length === 1 && hubRows[0].type === "supply_node", "…CONTROL: its supply_node row does stand there", hubRows.map((r) => r.type));
  // ⚠️ MOVED with #every-town-point-is-kept-clear: the air base took the nearest other province's TOWN POINT, which was that
  // province's first position. A province gives its ring now, so the first position outside the town province is its east ring point.
  ok(room(others[0], tp.get(others[0]), "E", false) === FAR, "(the fixture: the nearest other province has room for its east ring point 6 px out)");
  const air = rows.filter((r) => r.type === "air_base"), near = ringPoint(tp.get(others[0]), "E", FAR);
  ok(air.length === 1 && air[0].province === others[0] && air[0].px === near.px && air[0].row === near.row,
    `⭐⭐ the air base is not in the town province: it takes the first ring point — east — of the nearest other province, ${others[0]}`, air.map((r) => [r.province, r.px, r.row]));
  ok(rows.filter((r) => r.type !== "air_base" && cheb(r, near) < NEAR - 1).length === 0, "⭐ …and keeps it to itself", rows.filter((r) => r.type !== "air_base" && cheb(r, near) < NEAR - 1).map((r) => r.type));
  const stoodIn = [...new Set(rows.map((r) => r.province))].sort((a, b) => a - b);
  ok(stoodIn.join() === STATES[1].join(), "⭐⭐ the rows stand in all four of its provinces", stoodIn);
  // ⚠️ MOVED with it: four positions a province, not five, so the twelve factory positions reach one province further
  const facIn = [...new Set(ic.concat(af).map((r) => r.province))].sort((a, b) => a - b);
  ok(facIn.join() === STATES[1].join(), "…the factories among them, in all four", facIn);
  // ⛔ #every-town-point-is-kept-clear
  const points = STATES[1].map((p) => pix(tp.get(p)));
  const onAPoint = anchor.positions.map((p) => pix(p)).filter((p) => points.some((t) => cheb(p, t) < NEAR));
  ok(anchor.positions.length > 0 && onAPoint.length === 0, `⭐⭐⭐ no position stands on a town point of the state, or within ${NEAR} px of one — not the town's, not another province's`, onAPoint);
  const besideAPoint = rows.filter((r) => points.some((t) => cheb(r, t) < NEAR - 1));
  ok(besideAPoint.length === 0, "⭐⭐ …so no row of the state's own stands on one or beside one, the air base included", besideAPoint.map((r) => [r.type, r.px, r.row]));
  // ⚠️ MOVED with ⛔ #a-fort-stands-off-its-depot: the supply_node alone of the per-province rows
  const nodesOn = (p) => all.filter((r) => r.sid === 1 && PER_PROVINCE.includes(r.type) && cheb(r, pix(tp.get(p))) === 0).map((r) => r.type);
  ok(others.every((p) => nodesOn(p).join() === "supply_node"), "…CONTROL: each other province's own supply_node row does stand on its town point", others.map(nodesOn));
  ok(rows.every((r) => stateOf(r.province) === 1 && full3x3(1, r.px, r.row)), "⭐⭐ every row stands on the state's own land, with a 3x3 of it round it", rows.filter((r) => !(stateOf(r.province) === 1 && full3x3(1, r.px, r.row))).map((r) => [r.type, r.px, r.row]));
  ok(rows.every((r) => r.y === md.modelYForHeight(heightOf(r.px, r.row)).toFixed(2)) && new Set(rows.map((r) => r.y)).size > 1,
    "⭐ each row carries the height of the ground under it, not the anchor's", rows.filter((r) => r.y !== md.modelYForHeight(heightOf(r.px, r.row)).toFixed(2)).map((r) => [r.type, r.y, md.modelYForHeight(heightOf(r.px, r.row)).toFixed(2)]).slice(0, 4));
  const P = anchor.positions;
  ok(P.length === 4 + 4 * others.length && P.slice(0, 4).every((p) => p.province === home) && P[4].province === others[0] && P[P.length - 1].province === others[others.length - 1],
    `(its ${4 + 4 * others.length} positions: the town province's four, then four for each other province, nearest first)`, P.map((p) => p.province));
  // ⚠️ MOVED with #every-town-point-is-kept-clear: "the rows stand in all four of its provinces" was what showed where the other
  // types start, while the factories reached only three. They reach all four now, so it is asked of the positions themselves.
  const spare = P.map((p) => pix(p)).filter((p) => at(ic.concat(af, air), p).length === 0);
  ok(spare.length === P.length - 1 - countOf("industrial_complex") - countOf("arms_factory") && spare.length > 0 && spare.every((p) => at(rows, p).length === 1),
    `⭐ the other types carry on from where the factories stop: each of the ${spare.length} positions no factory took holds one row, before any position is taken twice`, spare.map((p) => at(rows, p).map((r) => r.type)));
}

// ── state 2: the ring pulled in ────────────────────────────────────────────────────────────────────────────────────────
console.log("\n-- ⭐ 2. one province with the sea and another state round it: no row leaves it --");
{
  const tp = townPointsOf(2), rows = ownRows(2, all), pid = STATES[2][0], T = tp.get(pid);
  const out = { E: room(pid, T, "E", false), N: room(pid, T, "N", false), W: room(pid, T, "W", false), S: room(pid, T, "S", false) };
  ok(Object.values(out).every((n) => n >= NEAR) && new Set(Object.values(out)).size === 4 && out.W === NEAR && Math.max(...Object.values(out)) === FAR,
    "(the fixture: room for a ring point on every side, each a different distance out, from 3 px to 6)", out);
  ok(stateOf(provAt(RECT[pid][2], pix(T).row)) === 3 && provAt(RECT[pid][0] - 1, pix(T).row) === SEA, "(…with another state past its east edge and the sea past its west)");
  const P = spreadOf(2).positions.map((p) => pix(p));
  const want = ["E", "N", "W", "S"].map((s) => ringPoint(T, s, out[s]));
  ok(JSON.stringify(P) === JSON.stringify(want), "⭐⭐ each ring point stands as far out as its 3x3 stays on the state's land, and no further", { P, want });
  ok(rows.every((r) => r.province === pid), "⭐⭐⭐ every row stands on the state's own land — none in the sea, none in the state next door (#a-building-over-water)", rows.filter((r) => r.province !== pid).map((r) => [r.type, r.px, r.row, r.province]));
  const far = Object.keys(out).find((s) => out[s] === FAR), airAt = ringPoint(T, far, FAR), air = rows.filter((r) => r.type === "air_base");
  // ⚠️ MOVED with #an-airfield-stands-inside-its-province: the ring point furthest out is the south one, and the airfield's model
  // reaches 2 px south of its row — over the sea. It stands where its whole model is the province: the pixel nearest that ring
  // point (ties to the upper row, then the left) whose model holds no row of the state — the town point and every row the layout
  // writes, stepped copies too; not the ring point it leaves, where nothing stands then.
  const L = layoutOf({ ...spreadOf(2), airfield: null }) || new Map(), [x0, y0, x1, y1] = RECT[pid];
  const kept = [pix(T)].concat(...[...L].filter(([t]) => t !== "air_base").map(([, l]) => l.map(pix)));
  let spot = null;
  for (let row = y0; row < y1; row++) for (let px = x0; px < x1; px++) {
    const d = (px - airAt.px) ** 2 + (row - airAt.row) ** 2, f = fieldOf({ px, row });
    if (kept.some((k) => f.some((q) => q.px === k.px && q.row === k.row)) || !fieldIn({ px, row }, pid) || (spot && d >= spot.d)) continue;
    spot = { px, row, d };
  }
  ok(far === "S" && !fieldIn(airAt, pid) && !!spot, "(the fixture: the furthest ring point is the south one, and the airfield's model there reaches past the province)", { far, airAt, spot });
  ok(air.length === 1 && !!spot && air[0].px === spot.px && air[0].row === spot.row, `⭐⭐ with no other province, the air base takes the ring point furthest from the town point (${far}) — or, its model over the sea there, the nearest pixel clear of the others whose model is all the province`, { air: air.map((r) => [r.px, r.row]), airAt, spot });
  ok(new Set(rows.map((r) => r.spot)).size === SLOTS, `⭐⭐ three positions for ${SLOTS - 1} rows: a position taken again is taken one pixel aside, so no two rows share a spot`, SLOTS - new Set(rows.map((r) => r.spot)).size);
  ok(onAnAfSpot(rows) === 0, "⭐ …and still no arms_factory row on an industrial_complex row's spot", onAnAfSpot(rows));
}

// ── state 3: too thin, so the pile — the control ───────────────────────────────────────────────────────────────────────
console.log("\n-- 3. CONTROL: a province with no ring point east or west is too thin to spread over: a pile, spread over its land --");
{
  const tp = townPointsOf(3), rows = ownRows(3, all), pid = STATES[3][0], T = tp.get(pid);
  ok(room(pid, T, "E", false) === 0 && room(pid, T, "W", false) === 0 && room(pid, T, "N", false) === FAR && room(pid, T, "S", false) === FAR
    && RECT[pid][2] - 1 - 1 - pix(T).px === NEAR - 1, "(the fixture: a ring point fits north and south only — east and west the 3x3 reaches 2 px out, one short)");
  const a = spreadOf(3);
  ok(a.positions.length === 2 && layoutOf(a) === null, "two positions: one for the air base and one left, which cannot hold a factory of each kind apart", a.positions.length);
  // ⚠️ MOVED with #an-airfield-stands-inside-its-province: all but the air base. Its model reaches 2.72 px east of its row, past this
  // 7 px province from the pile; it takes the first of the state's two positions — both the town province's, both 6 px out, so the
  // first in the list — whose model is all the province and over none of the pile's 3x3 or the town point.
  const pile = [-1, 0, 1].flatMap((dy) => [-1, 0, 1].map((dx) => ({ px: a.x + dx, row: H - 1 - a.z + dy }))).concat([pix(T)]);
  const piled = rows.filter((r) => r.type !== "air_base"), air = rows.filter((r) => r.type === "air_base");
  const first = a.positions.map((p) => pix(p)).find((p) => fieldIn(p, pid) && !pile.some((k) => fieldOf(p).some((q) => q.px === k.px && q.row === k.row)));
  // ⚠️ MOVED with #a-small-states-models-are-spread-over-its-land (test-a-small-states-models-are-spread-over-its-land.js): this pinned
  // the pile — every row but the air base in the 3x3 at the anchor. A pile's rows now take spots of their own over the state's land.
  const sx = piled.map((r) => r.px), sy = piled.map((r) => r.row);
  ok(piled.length === rows.length - 1 && rows.every((r) => r.province === pid) && Math.max(Math.max(...sx) - Math.min(...sx), Math.max(...sy) - Math.min(...sy)) > 2,
    "⭐ its rows stand on the province, spread over it rather than piled in the 3x3 at its anchor — all but the air base", piled.map((r) => [r.px, r.row]).slice(0, 6));
  ok(air.length === 1 && !!first && air[0].px === first.px && air[0].row === first.row && cheb(air[0], { px: a.x, row: H - 1 - a.z }) > 1, "⭐ …which stands off the pile, on the first position whose airfield model is all the province", { air: air.map((r) => [r.px, r.row]), first });
  // ⚠️ MOVED with #a-factory-pair-is-not-one-point: this was the CONTROL that a pile puts every arms_factory on an industrial_complex
  // row's spot. The pile takes its 3x3 in turn now (industrial_complex k on point 2k, arms_factory k on 2k + 1), so it is the opposite
  // here, and the CONTROL moved to state 5, whose strip keeps every row on one point.
  const ic3 = piled.filter((r) => r.type === "industrial_complex"), af3 = piled.filter((r) => r.type === "arms_factory");
  ok(ic3.length === countOf("industrial_complex") && af3.length === countOf("arms_factory") && ic3.every((r, k) => r.spot !== af3[k].spot) && onAnAfSpot(rows) < countOf("arms_factory"),
    "⭐⭐ …and in the pile industrial_complex k and arms_factory k stand on two points, not one (test-a-factory-pair-is-not-one-point.js)", ic3.map((r, k) => [r.spot, af3[k] && af3[k].spot]));
}

// ── state 4: positions keep their distance ─────────────────────────────────────────────────────────────────────────────
console.log("\n-- ⭐ 4. two positions are never nearer than 3 px --");
{
  const tp = townPointsOf(4), a = spreadOf(4), P = a.positions.map((p) => ({ ...pix(p), province: p.province }));
  // ⚠️ MOVED with #every-town-point-is-kept-clear: the ring point stood 6 px out, 1 px from the strip's town point, and it was the
  // strip's town point that was then too near to be a position. A town point is kept clear whichever province's it is, so it is
  // the ring point that gives way.
  const [town, strip] = STATES[4], most = room(town, tp.get(town), "E", true), E0 = ringPoint(tp.get(town), "E", most), s0 = pix(tp.get(strip));
  ok(homeOf(4) === town && most === FAR && cheb(E0, s0) < NEAR && full3x3(4, s0.px, s0.row), "(the fixture: the strip's town point has a 3x3 of the state's land and stands 1 px from where the town province's east ring point would stand, 6 px out)", { E0, s0 });
  const out = [FAR, FAR - 1, FAR - 2, NEAR].find((r) => cheb(ringPoint(tp.get(town), "E", r), s0) >= NEAR), E = ringPoint(tp.get(town), "E", out);
  ok(out < FAR && P.some((p) => p.px === E.px && p.row === E.row) && !P.some((p) => p.px === E0.px && p.row === E0.row) && !P.some((p) => p.px === s0.px && p.row === s0.row),
    `⭐⭐ the strip's town point is no position, and the east ring point steps in to ${out} px out, where it is ${NEAR} px clear of it`, P);
  let nearest = Infinity; for (let i = 0; i < P.length; i++) for (let j = i + 1; j < P.length; j++) nearest = Math.min(nearest, cheb(P[i], P[j]));
  ok(P.length > 1 && nearest >= NEAR && P.every((p) => cheb(p, pix(tp.get(town))) >= NEAR && cheb(p, s0) >= NEAR), "⭐⭐ every two positions, and each position and either town point, are 3 px apart or more", nearest);
  ok(P.every((p) => provAt(p.px, p.row) === p.province) && P.filter((p) => p.province === strip).length === 2, "⭐ each position is a pixel of the province it names — the strip's two are north and south along it", P);
  const rows = ownRows(4, all);
  ok(rows.every((r) => stateOf(r.province) === 4) && new Set(rows.map((r) => r.spot)).size === SLOTS && onAnAfSpot(rows) === 0, "…and its rows: all on its own land, no two on one spot", SLOTS - new Set(rows.map((r) => r.spot)).size);
}

// ── state 5: the pile's own guard ──────────────────────────────────────────────────────────────────────────────────────
console.log("\n-- 5. a strip between two seas: nowhere to spread and no 3x3, so every row on the strip itself --");
{
  const rows = ownRows(5, all), pid = STATES[5][0];
  ok(spreadOf(5).positions.length === 0 && spreadOf(5).home === pid, "(no position at all)");
  // ⚠️ MOVED with #a-small-states-models-are-spread-over-its-land: the strip's rows stood on ONE pixel of it; they are spread along it
  // now, every one still on the strip
  ok(rows.length === SLOTS && rows.every((r) => r.province === pid), "⭐⭐ all its rows stand on the strip — no step sideways into the sea (#a-building-over-water)", [...new Set(rows.map((r) => r.spot))]);
  // ⚠️ MOVED here from state 3 with #a-factory-pair-is-not-one-point, and built from the strip's own rows since the strip spreads them:
  // the same rows gathered on one point, as the strip had them
  const onePoint = rows.map((r) => ({ ...r, spot: rows[0].spot }));
  ok(onAnAfSpot(onePoint) === countOf("arms_factory") && onAnAfSpot(rows) === 0, "⭐⭐ CONTROL: on one point every arms_factory row stands on an industrial_complex row's spot — what state 1's, 2's and 3's checks would see; on the strip none does", { onePoint: onAnAfSpot(onePoint), strip: onAnAfSpot(rows) });
}

// ── state 6: the map's own edges ───────────────────────────────────────────────────────────────────────────────────────
// provinceExtents' pixel reader has no bounds of its own: one column past the east edge it reads the first pixel of the row
// ABOVE, one column before the west edge the last pixel of the row BELOW. With a province on each edge, that pixel is this
// state's own land — so without the position's own guard the "3x3 of the state's land" is found hanging off the map.
console.log("\n-- ⭐ 6. a state on both of the map's edges: no position on the first or the last column --");
{
  const [east, west] = STATES[6], tp = townPointsOf(6), a = spreadOf(6), P = a.positions.map((p) => ({ ...pix(p), province: p.province }));
  const tE = pix(tp.get(east)), tW = pix(tp.get(west));
  ok(homeOf(6) === east && a.home === east && RECT[east][2] === W && RECT[west][0] === 0, "(the fixture: its town province runs to the map's last column, its other province from the first)");
  ok([-1, 0, 1].every((d) => stateOf(provAt(0, tE.row - 1 + d)) === 6 && stateOf(provAt(W - 1, tW.row + 1 + d)) === 6),
    "(…and read round the seam one row off, as the bitmap lies in memory, the pixel past either edge is the state's own land)");
  const outE = W - 1 - tE.px;                                                    // how far out the last column is
  ok(outE >= NEAR + 1 && outE <= FAR && room(east, tp.get(east), "E", false) === outE - 1, `(the last column is ${outE} px east of the town point: a ring point could stand ON it, or one short of it)`, outE);
  const E = ringPoint(tp.get(east), "E", outE - 1);
  ok(P.some((p) => p.px === E.px && p.row === E.row) && !P.some((p) => p.px >= W - 1), `⭐⭐ the east ring point stands one short, ${outE - 1} px out, its 3x3 inside the map — no position on the last column`, P.filter((p) => p.province === east));
  ok(tW.px >= NEAR && tW.px <= FAR && provAt(0, tW.row) === west, `(the first column is ${tW.px} px west of the other province's town point, and is that province's)`, tW.px);
  ok(!P.some((p) => p.px < 1) && P.filter((p) => p.province === west && p.row === tW.row).length === 0, "⭐⭐ …and none on the first: the west province has no west ring point", P.filter((p) => p.province === west));
  const rows = ownRows(6, all);
  ok(rows.length === SLOTS && rows.every((r) => r.px >= 0 && r.px < W && stateOf(r.province) === 6), "⭐⭐ every row stands on the map and on the state's own land, the copies stepped a pixel aside too", rows.filter((r) => !(r.px >= 0 && r.px < W && stateOf(r.province) === 6)).map((r) => [r.type, r.x]));
  ok(layoutOf(a) !== null && onAnAfSpot(rows) === 0, "…and it is spread like any other", a.positions.length);
}

// ── state 7: two provinces equally near ────────────────────────────────────────────────────────────────────────────────
console.log("\n-- ⭐ 7. of two provinces equally near the town, the lower id is taken first --");
{
  const tp = townPointsOf(7), a = spreadOf(7), home = homeOf(7), t0 = pix(tp.get(home));
  const [south, north] = STATES[7].filter((p) => p !== home);
  const far = (p) => Math.hypot(pix(tp.get(p)).px - t0.px, pix(tp.get(p)).row - t0.row);
  ok(a.home === home && far(south) === far(north) && south < north && pix(tp.get(south)).row > t0.row && pix(tp.get(north)).row < t0.row,
    `(the fixture: the two other provinces' town points are both ${far(south)} px from the town's; the lower id, ${south}, is the SOUTH one — the later in the bitmap)`, [far(south), far(north)]);
  const firstOut = a.positions.find((p) => p.province !== home), air = ownRows(7, all).filter((r) => r.type === "air_base");
  ok(!!firstOut && firstOut.province === south, `⭐⭐ the first position outside the town province is in ${south}`, firstOut);
  ok(air.length === 1 && air[0].province === south, "⭐⭐ …so that is where the air base stands: the same state is laid out the same way every time", air.map((r) => r.province));
}

// ── state 8: the rings alone are too few ───────────────────────────────────────────────────────────────────────────────
console.log("\n-- ⭐ 8. a state whose rings give only two positions takes the other province's town point for the third --");
{
  const [town, other] = STATES[8], tp = townPointsOf(8), a = spreadOf(8), P = a.positions.map((p) => ({ ...pix(p), province: p.province }));
  const T = tp.get(other), t = pix(T);
  ok(homeOf(8) === town && a.home === town && ["E", "N", "W", "S"].every((s) => room(town, tp.get(town), s, s === "N") === 0), "(the fixture: its town province has no room for a ring point on any side)");
  ok(room(other, T, "E", false) === 0 && room(other, T, "W", false) === 0 && room(other, T, "N", false) === FAR && room(other, T, "S", true) === FAR,
    "(…and the other province has room north and south only: two ring points, one short of what a spread needs)");
  const N = ringPoint(T, "N", FAR), S = ringPoint(T, "S", FAR);
  ok(JSON.stringify(P) === JSON.stringify([{ ...t, province: other }, { ...N, province: other }, { ...S, province: other }]),
    "⭐⭐ its positions are the other province's town point, then its two ring points", P);
  const rows = ownRows(8, all), air = rows.filter((r) => r.type === "air_base");
  const ic = rows.filter((r) => r.type === "industrial_complex"), af = rows.filter((r) => r.type === "arms_factory");
  ok(layoutOf(a) !== null && rows.length === SLOTS && onAnAfSpot(rows) === 0 && ic.length === countOf("industrial_complex") && ic.every((r) => cheb(r, N) <= 1) && af.length === countOf("arms_factory") && af.every((r) => cheb(r, S) <= 1),
    "⭐⭐ so it is spread, not piled: the industrial_complex rows at the north ring point, the arms_factory rows at the south, none of one on a spot of the other", { onAnAfSpot: onAnAfSpot(rows), ic: ic.map((r) => [r.px, r.row]), af: af.map((r) => [r.px, r.row]) });
  // ⚠️ MOVED with #an-airfield-stands-inside-its-province: the air base's position is that town point, the one place a row of the
  // state's own may stand on a province's point — but the runway there would cover the point's own rows (its supply_node, bunker…),
  // so the air base stands on the nearest pixel whose model holds no row of the state, all one province, else all the state's land
  const L8 = layoutOf({ ...a, airfield: null }) || new Map();
  const kept8 = [...tp.values()].map(pix).concat(...[...L8].filter(([ty]) => ty !== "air_base").map(([, l]) => l.map(pix)));
  const clear8 = (p) => !kept8.some((k) => fieldOf(p).some((q) => q.px === k.px && q.row === k.row));
  const onMap8 = (p) => fieldOf(p).every((q) => q.px >= 0 && q.px < W && q.row >= 0 && q.row < H);
  let want8 = null;
  for (const okOf of [(p) => (id) => id === provAt(p.px, p.row), () => (id) => stateOf(id) === 8]) {
    for (let row = 0; row < H; row++) for (let px = 0; px < W; px++) {
      const p = { px, row }, d = (px - t.px) ** 2 + (row - t.row) ** 2;
      if (stateOf(provAt(px, row)) !== 8 || !clear8(p) || !onMap8(p) || !fieldOf(p).every((q) => okOf(p)(provAt(q.px, q.row))) || (want8 && d >= want8.d)) continue;
      want8 = { px, row, d };
    }
    if (want8) break;
  }
  ok(!clear8(t) && air.length === 1 && !!want8 && air[0].px === want8.px && air[0].row === want8.row,
    "…the air base's position is that town point — the one place a row of the state's own stands on a province's point — but it stands off it, where its runway covers none of the state's rows", { air: air.map((r) => [r.px, r.row]), t, want8 });
  ok(rows.every((r) => stateOf(r.province) === 8), "…and every row on the state's own land", rows.filter((r) => stateOf(r.province) !== 8).map((r) => [r.type, r.px, r.row]));
}

// ── only missing rows are written ──────────────────────────────────────────────────────────────────────────────────────
console.log("\n-- ⭐ 9. rows that exist are never moved, and a top-up takes the spots that are free --");
{
  const before = fs.readFileSync(BUILDINGS, "utf8");
  const again = md.ensureBuildingSlotsForState({ ...roots, stateId: 1, provinces: STATES[1] });
  ok(again && again.changed === false && fs.readFileSync(BUILDINGS, "utf8") === before, "a state that has every row is left exactly as it is", again);
  // a pile an older Nova wrote: every one of state 2's own rows on one spot
  const lines = before.split("\n").filter(Boolean), pile = lines.map((l) => { const c = l.split(";"); return c[0] === "2" && PER_STATE.includes(c[1]) ? `2;${c[1]};75.00;10.00;${(H - 1 - 15).toFixed(2)};0.00;0` : l; }).join("\n") + "\n";
  fs.writeFileSync(BUILDINGS, pile);
  const kept = md.ensureBuildingSlotsForState({ ...roots, stateId: 2, provinces: STATES[2] });
  ok(kept && kept.changed === false && fs.readFileSync(BUILDINGS, "utf8") === pile, "⭐⭐ …and so is a state whose rows an older Nova piled: nothing is re-spread behind a modder's back", kept);
  // state 1 loses the last two of its arms_factory rows and one industrial_complex row
  const af = lines.filter((l) => l.startsWith("1;arms_factory;")), ic = lines.filter((l) => l.startsWith("1;industrial_complex;"));
  const gone = new Set([af[af.length - 1], af[af.length - 2], ic[2]]);
  fs.writeFileSync(BUILDINGS, lines.filter((l) => !gone.has(l)).join("\n") + "\n");
  const top = md.ensureBuildingSlotsForState({ ...roots, stateId: 1, provinces: STATES[1] });
  const now = ownRows(1);
  ok(top && top.changed && top.added === gone.size, `a state three rows short is given three`, top);
  ok(new Set(now.filter((r) => r.type === "arms_factory").map((r) => r.spot)).size === countOf("arms_factory") && new Set(now.filter((r) => r.type === "industrial_complex").map((r) => r.spot)).size === countOf("industrial_complex"),
    "⭐⭐ …on the spots no row of that type stands on: six arms_factory rows on six spots again, not two on one", now.filter((r) => r.type === "arms_factory").map((r) => r.spot));
  const sorted = (t) => t.split("\n").filter(Boolean).sort().join("\n");
  ok(sorted(fs.readFileSync(BUILDINGS, "utf8")) === sorted(before), "⭐ …the very rows it lost, so the file holds what it held", null);
  ok(readRows().filter((r) => r.sid === 99).length === 1 && fs.readFileSync(BUILDINGS, "utf8").startsWith(OTHER_ROW + "\n"), "…and the row that was there first is still the file's first line");
}

try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) { /* scratch only */ }
console.log("\n" + (fail ? "FAILED " + fail + "/" + (pass + fail) : "PASSED " + pass + "/" + pass));
process.exitCode = fail ? 1 : 0;
