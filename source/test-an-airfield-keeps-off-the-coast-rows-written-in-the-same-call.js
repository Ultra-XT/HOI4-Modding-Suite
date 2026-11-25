// ⛔ #an-airfield-stands-inside-its-province — THE RUNWAY KEEPS OFF THE COAST ROWS GENERATE LAND WRITES BESIDE IT, IN THE SAME CALL.
//
// Generate land gives each coastal state its coast's own rows (#a-generated-state-keeps-the-industry-of-the-land-below: one dockyard,
// and a coastal_bunker on each coastal province — coastSlotPositions) in the SAME ensureBuildingSlotsForState call that places its
// air base, and places them AFTER it. The air base's spot (airfieldSpot) keeps its runway off every row of the state it is told of
// (`keepClearOf`), and in the owner's flow — Generate land into a blank world — a new state has no rows yet, so it was told of none:
// the coast rows written a moment later were placed with no regard to the runway. Measured on the owner's flow at the merge of the
// two fixes (10-07): 7 laid-out states with a coast row under their runway, 0 with the wiring. The wiring: the call's first
// stateBuildingAnchor asks keepClearOf, as a FUNCTION of the read its answer stands on, for the coast rows coastSlotPositions will
// place on that same read. test-an-airfield-stands-inside-its-province.js section Q pins the function form on stateBuildingAnchor
// itself; this pins that ensureBuildingSlotsForState uses it, and uses it right.
//
//   A  the dockyard   a one-province island whose air base the scan moves off its position to the nearest pixel whose model is all
//                     the island — down by the south coast, where the dockyard stands BUILDING_RING_NEAR px along the shore from the
//                     coastal_bunker: kept clear of, and the coast rows themselves stand where they did
//   H  coastHeld      a state that already holds a coastal_bunker on one of its provinces: the runway is not kept off the bunker the
//                     call does NOT write there — that province's coast pixel nearest its town point, under the air base's position
//   D  dockyards      A's island again, already holding a dockyard row: the runway is not kept off the dockyard the call does NOT
//                     write — the one A's call writes, under the spot the rule gives
// H and D are the two arguments that tell coastSlotPositions what the state already has; asked without them, it names rows the call
// never writes, and the runway is kept off ground nothing stands on.
//
// Every expected spot is the module's own answer: stateBuildingAnchor's airfield asked with the rows to keep clear of as a plain
// list (the airfield test's N and Q cases pin that form). The coast rows come from a TWIN of the fixture laid out the old way —
// the state's own rows in one call, its coast's in a second that has no air base to place — so they are coastSlotPositions' own
// and cannot have seen the runway. Nothing is typed in but the fixture's rectangles and town points.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-airfield-coast-"));
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

// ── the fixture: rectangles [x0, y0, x1, y1) on a 64 x 20 sea (province 1), rows top-down ─────────────────────────────────────
const W = 64, H = 20, SEA = 1;
const RECT = {
  2: [6, 5, 18, 13],    // A: an island, its town point 2 px above its south coast and nearer its east end than its west
  3: [33, 5, 41, 16],   // H: the town province, the smaller of the state's two…
  4: [20, 5, 33, 16],   // …and the next, west of it: its town point 4 px below its north coast, 2 px from the town province
  5: [44, 5, 56, 13],   // D: A's island again, its town point where A's is
};
const STATES = { 1: [2], 2: [3, 4], 3: [5] };
const STANDSTILL = { 2: [12, 10], 3: [37, 10], 4: [30, 9], 5: [50, 10] };   // [px, row] — the town points the cases need
const provAt = (x, y) => { for (const [id, [x0, y0, x1, y1]] of Object.entries(RECT)) if (x >= x0 && x < x1 && y >= y0 && y < y1) return +id; return SEA; };
const stateOf = (p) => +(Object.keys(STATES).find((s) => STATES[s].includes(p)) || 0);
const colour = (id) => [(id * 37) % 256, (id * 71) % 256, 40 + id];
const heightOf = (x, y) => (provAt(x, y) === SEA ? 80 : 96 + ((x * 3 + y * 5) % 120));
/** a province's own pixels with a 4-neighbour of sea, x wrapping as the map does — the coast, read off the fixture */
const coastPixels = (pid) => {
  const out = [];
  for (let row = 0; row < H; row++) for (let px = 0; px < W; px++) {
    if (provAt(px, row) !== pid) continue;
    if ([[(px + 1) % W, row], [(px - 1 + W) % W, row], [px, row - 1], [px, row + 1]].some(([x, y]) => y >= 0 && y < H && provAt(x, y) === SEA)) out.push({ px, row });
  }
  return out;
};
const sq = (v) => v * v;
/** a province's coast pixel furthest from its town point (first in the raster) — where a row a state already holds is put, out of
 *  every case's way */
const farShore = (pid) => { const [tx, ty] = STANDSTILL[pid]; let best = null; for (const q of coastPixels(pid)) if (!best || sq(q.px - tx) + sq(q.row - ty) > best.d) best = { ...q, d: sq(q.px - tx) + sq(q.row - ty) }; return best; };
const rowAt = (sid, type, q) => `${sid};${type};${q.px}.00;9.50;${H - 1 - q.row}.00;0.00;0`;
const HELD_BUNKER = rowAt(2, "coastal_bunker", farShore(4));   // H: state 2 holds a coastal_bunker on province 4
const HELD_YARD = rowAt(3, "dockyard", farShore(5));           // D: state 3 holds a dockyard
const OTHER_ROW = "99;radar_station;1.00;9.50;1.00;0.00;0";    // a row that is nobody's here
function writeMod(dir, rows) {
  write(dir, "descriptor.mod", 'name="airfield-coast"\nreplace_path="history/states"\nreplace_path="map"\n');
  write(dir, "map/provinces.bmp", bmp24(W, H, (x, y) => colour(provAt(x, y))));
  write(dir, "map/heightmap.bmp", bmp8(W, H, heightOf));
  write(dir, "map/definition.csv", ["0;0;0;0;land;false;unknown;0", `1;${colour(1).join(";")};sea;false;ocean;0`]
    .concat(Object.keys(RECT).map((id) => `${id};${colour(+id).join(";")};land;false;plains;1`)).join("\n") + "\n");
  write(dir, "map/unitstacks.txt", Object.entries(STANDSTILL).map(([p, [x, row]]) => `${p};0;${x}.00;10.00;${H - 1 - row}.00;0.00;0.00`).join("\n") + "\n");
  for (const [s, provs] of Object.entries(STATES)) {
    write(dir, `history/states/${s}-S.txt`, `state = {\n\tid = ${s}\n\tname = "STATE_${s}"\n\tmanpower = 1000\n\tstate_category = rural\n\tprovinces = { ${provs.join(" ")} }\n\thistory = {\n\t\towner = AAA\n\t}\n}\n`);
  }
  write(dir, "map/buildings.txt", rows.join("\n") + "\n");
}
// the TWIN holds no row of any state: what its calls write is coastSlotPositions' answer on ground nothing stands on yet
const mod = path.join(ROOT, "mod"), twin = path.join(ROOT, "twin");
writeMod(mod, [OTHER_ROW, HELD_BUNKER, HELD_YARD]); writeMod(twin, [OTHER_ROW]);
const roots = { modRoot: mod, gameRoot: path.join(ROOT, "no-game"), dependencyRoots: [] }, rootsT = { ...roots, modRoot: twin };

const rowsIn = (r) => fs.readFileSync(path.join(r.modRoot, "map", "buildings.txt"), "utf8").split(/\r?\n/).filter(Boolean).map((l) => l.split(";")).filter((c) => c.length >= 7)
  .map((c) => { const x = +c[2], z = +c[4], px = Math.floor(x), row = H - 1 - Math.floor(z); return { sid: +c[0], type: c[1], x, z, px, row, province: provAt(px, row), line: c.join(";") }; });
const ofState = (sid, r) => rowsIn(r).filter((w) => w.sid === sid);
const pix = (t) => (t ? { px: Math.floor(t.x), row: H - 1 - Math.floor(t.z) } : null);
const same = (a, b) => !!a && !!b && a.px === b.px && a.row === b.row;
const where = (w) => w && [w.px, w.row];

// ── what Generate land hands ensureBuildingSlotsForState for a state: its town points (stateBuildingAnchor each) and its coast —
//    the provinces touching sea (landProvincesTouchingSea), no ports here, and the coast types Nova writes ───────────────────────
const COAST_TYPES = new Set([...md.COASTAL_STATE_BUILDING_SLOTS.map(([t]) => t), ...md.PER_COASTAL_PROVINCE_BUILDING_SLOTS]);
const pointsOf = (sid, r) => md.stateBuildingAnchor({ ...r, provinces: STATES[sid], each: true }) || new Map();
const coastOf = (sid, r) => { const now = md.landProvincesTouchingSea(r) || new Set(); return { provinces: new Set(STATES[sid].filter((p) => now.has(p))), ports: [], types: COAST_TYPES }; };
const generate = (sid, r) => md.ensureBuildingSlotsForState({ ...r, stateId: sid, provinces: STATES[sid], townPoints: pointsOf(sid, r), coast: coastOf(sid, r) });
/** stateBuildingAnchor's positions answer for the state, its airfield asked to keep clear of `keep` ([{ x, z }]) */
const readOf = (sid, r, keep = null) => md.stateBuildingAnchor({ ...r, provinces: STATES[sid], positions: true, townPoints: pointsOf(sid, r), stateId: sid, keepClearOf: keep }) || {};
const spotOf = (sid, r, keep = null) => pix(readOf(sid, r, keep).airfield);
const xz = (w) => ({ x: w.x, z: w.z });

// ── the airfield's block: every pixel its model covers from a row (x, z), at the reach the mod's layers draw (airfieldReach) — the
//    arithmetic airfieldBlock does, from the row's point (x, H − z) ──────────────────────────────────────────────────────────
const REACH = md.airfieldReach(roots);
const blockOf = (p) => { const x = p.px, Y = p.row + 1; return { c0: Math.floor(x - REACH.west), c1: Math.ceil(x + REACH.east) - 1, r0: Math.floor(Y - REACH.north), r1: Math.ceil(Y + REACH.south) - 1 }; };
const inBlock = (q, air) => { const b = blockOf(air); return q.px >= b.c0 && q.px <= b.c1 && q.row >= b.r0 && q.row <= b.r1; };

console.log("\n-- the fixture --");
{
  const brute = new Set(Object.keys(RECT).map(Number).filter((p) => coastPixels(p).length));
  const now = md.landProvincesTouchingSea(roots) || new Set();
  ok(brute.size === Object.keys(RECT).length && [...brute].every((p) => now.has(p)) && now.size === brute.size,
    "(every province of every state touches the sea, as landProvincesTouchingSea reads the bitmap)", [...now]);
  const p = { px: 20, row: 10 }, b = blockOf(p);
  ok(JSON.stringify(REACH) === JSON.stringify(md.AIRFIELD_REACH) && b.c0 === p.px - 2 && b.c1 === p.px + 2 && b.r0 === p.row - 1 && b.r1 === p.row + 2,
    "(a mod that draws no airfield of its own is judged by vanilla's model: columns px-2..px+2 and rows row-1..row+2 of a whole-pixel row)", { REACH, b });
  ok(COAST_TYPES.has("dockyard") && COAST_TYPES.has("coastal_bunker"), "(the coast types Nova writes are a dockyard and a coastal_bunker)", [...COAST_TYPES]);
}

console.log("\n-- ⭐ A. the dockyard Generate land writes beside the air base, in the same call --");
{
  const sid = 1;
  // the TWIN, laid out the old way: its own rows in one call, as every caller but Generate land asks — no rows to keep clear of —
  // and its coast's in a second, which has nothing left to place but the coast and cannot see the runway
  const t1 = md.ensureBuildingSlotsForState({ ...rootsT, stateId: sid, provinces: STATES[sid], townPoints: pointsOf(sid, rootsT) });
  const between = ofState(sid, rootsT);
  const t2 = generate(sid, rootsT);
  const twinRows = ofState(sid, rootsT), twinCoast = twinRows.filter((w) => COAST_TYPES.has(w.type)), twinAir = twinRows.filter((w) => w.type === "air_base");
  ok(!!t1 && t1.changed && !between.some((w) => COAST_TYPES.has(w.type)) && !!t2 && t2.changed && t2.added === twinCoast.length && twinCoast.length > 0
    && twinRows.length === between.length + twinCoast.length, "(the twin: the state's own rows in one call, the coast's — and only those — in a second)", { t1, t2, coast: twinCoast.map((w) => w.type) });
  const unwired = spotOf(sid, roots), wired = spotOf(sid, roots, twinCoast.map(xz)), under = twinCoast.filter((q) => unwired && inBlock(q, unwired));
  ok(twinAir.length === 1 && same(twinAir[0], unwired) && under.length > 0,
    "CONTROL: laid out with no coast rows to keep clear of, the air base's runway holds a coast row the same call writes — " + under.map((q) => q.type).join(", "),
    { air: where(twinAir[0]), unwired, under: under.map((q) => [q.type, q.px, q.row]) });
  ok(!!wired && !same(wired, unwired), "(…and the rule, told of the coast rows, puts the air base elsewhere)", { wired, unwired });

  const g = generate(sid, roots);
  const rows = ofState(sid, roots), air = rows.filter((w) => w.type === "air_base"), coast = rows.filter((w) => COAST_TYPES.has(w.type));
  ok(!!g && g.changed && g.added === rows.length && air.length === 1 && coast.length === twinCoast.length,
    "Generate land's call writes the state its rows, its coast's among them, in one go", { g, rows: rows.length, coast: coast.length });
  ok(same(air[0], wired), "⭐⭐ the air base stands where the rule puts it with the coast rows of the same call kept clear of", { air: where(air[0]), wired, unwired });
  ok(!!air[0] && coast.length > 0 && !coast.some((q) => inBlock(q, air[0])), "⭐⭐ no coast row the call wrote stands under the air base's runway",
    coast.filter((q) => air[0] && inBlock(q, air[0])).map((q) => [q.type, q.px, q.row]));
  ok(!!air[0] && rows.filter((w) => w.type !== "air_base").every((q) => !inBlock(q, air[0])), "⭐ …nor any other row of the state",
    rows.filter((w) => w.type !== "air_base" && air[0] && inBlock(w, air[0])).map((q) => [q.type, q.px, q.row]));
  // the wiring moves the RUNWAY: every coast row stands where coastSlotPositions put it in the twin, which never saw an air base
  const lines = (list) => list.map((w) => w.line).sort().join("\n");
  ok(lines(coast) === lines(twinCoast), "⭐⭐ the coast rows stand exactly where the twin's do: the coast was not moved for the runway", { coast: coast.map((w) => w.line), twinCoast: twinCoast.map((w) => w.line) });
  // ⚠️ MOVED with ⛔ #a-fort-stands-off-its-depot: "every other row, byte for byte: only the air base moved" — the fort and the
  // special-project site now keep off every row the call writes, the coast's and the runway among them, which the twin's first call never
  // saw; they are pinned by test-a-fort-stands-off-its-depot.js, and here only that none stands on a coast row
  // ⚠️ MOVED with ⛔ #a-land-model-is-turned-as-the-base-game-turns-its-own: a land row's turn keeps its model off the other rows' points,
  // the coast's and the runway's among them, which the twin's first call never saw — so it is the SPOT that is compared, every column but
  // the rotation (test-a-land-model-is-turned-as-the-base-game-turns-its-own.js pins the turn)
  // ⚠️ MOVED with ⛔ #a-state-building-keeps-off-the-factory-spots: a row whose layout spot is on a position another row took first now
  // takes a spot of its own over the state's land (siteSpotRows), kept off every row the call writes, the coast's among them, which the
  // twin's first call never saw — so it moves with the sites; the layout's `shared` names them (pinned by
  // test-a-state-building-keeps-off-the-factory-spots.js), and here only that none stands on a coast row
  const L = md.stateSlotLayout(md.stateBuildingAnchor({ ...roots, provinces: STATES[sid], positions: true, stateId: sid }));
  const sharedTypes = new Set(L && L.shared ? [...L.shared].filter(([, sh]) => sh.some(Boolean)).map(([t]) => t) : []);
  // ⚠️ MOVED with ⛔ #a-factorys-copy-stands-on-a-spot-of-its-own: a factory's copy on a position its kind took already is `shared` too, so
  // a row is set aside by its ENTRY, not its type — one standing on the spot the layout gives an entry that is not shared is compared —
  // and "on a spot of its own" is a row of a shared type on none of its type's layout spots (a copy with no room keeps its step)
  const keyOf = (t, s) => `${t};${(+s.x).toFixed(2)};${(+s.z).toFixed(2)}`;
  const plain = new Set(L ? [...L].flatMap(([t, list]) => list.filter((_, k) => !((L.shared && L.shared.get(t)) || [])[k]).map((s) => keyOf(t, s))) : []);
  const laid = new Set(L ? [...L].flatMap(([t, list]) => list.map((s) => keyOf(t, s))) : []);
  const ownSpot = (w) => sharedTypes.has(w.type) && !laid.has(keyOf(w.type, w));
  const SITES = md.SITE_TYPES || [], moves = (w) => w.type === "air_base" || SITES.includes(w.type) || (sharedTypes.has(w.type) && !plain.has(keyOf(w.type, w)));
  const spots = (list) => list.map((w) => { const c = w.line.split(";"); c[5] = "*"; return c.join(";"); }).sort().join("\n");
  ok(SITES.length > 0 && spots(rows.filter((w) => !moves(w))) === spots(twinRows.filter((w) => !moves(w))), "⭐ …and so does every other row of the state, on the same spot, but the air base, the sites (" + SITES.join(", ") + ") and the rows on spots of their own (" + [...sharedTypes].join(", ") + ")");
  const sitesOn = rows.filter((w) => (SITES.includes(w.type) || ownSpot(w)) && coast.some((q) => same(q, w)));
  ok(rows.filter((w) => SITES.includes(w.type)).length > 0 && sitesOn.length === 0, "⭐ …which stand on no coast row of the same call", sitesOn.map((w) => w.line));
  ok(coast.every((q) => stateOf(q.province) === sid && coastPixels(q.province).some((c) => same(c, q))) && coast.filter((q) => q.type === "dockyard").length === 1,
    "(each coast row stands on its state's own coast, and there is one dockyard)", coast.map((q) => [q.type, q.px, q.row, q.province]));
}

console.log("\n-- ⭐ H. a coastal_bunker the state already holds: the runway keeps off the rows the call writes, not one it does not --");
{
  const sid = 2, a = readOf(sid, roots), pts = pointsOf(sid, roots), [, B] = STATES[sid];
  const tB = pix(pts.get(B)), held = ofState(sid, roots);
  // the bunker the call would write on province B if it did not hold one: its coast pixel nearest its town point (coastPixelOf, as
  // coastSlotPositions asks it)
  const ghost = a.ex && typeof a.typeOf === "function" ? md.coastPixelOf(a.ex, B, (id) => a.typeOf(id) === "sea", tB) : null;
  const ghostRow = ghost && { px: ghost.x, row: ghost.row };
  ok(a.home !== B && held.length === 1 && held[0].type === "coastal_bunker" && held[0].province === B && !!ghostRow && ghostRow.px >= 0 && provAt(ghostRow.px, ghostRow.row) === B && !same(ghostRow, held[0]),
    `(the fixture: the state holds a coastal_bunker on province ${B}, its non-town province, away from that province's coast pixel nearest its town point)`, { home: a.home, held: held.map((w) => w.line), ghostRow });

  const g = generate(sid, roots);
  const rows = ofState(sid, roots), air = rows.filter((w) => w.type === "air_base");
  const written = rows.filter((w) => COAST_TYPES.has(w.type) && !held.some((h) => h.line === w.line));
  const L = md.stateSlotLayout({ ...a, airfield: null }), position = L ? pix(L.get("air_base")[0]) : null;   // the air base's own position
  const want = spotOf(sid, roots, held.concat(written).map(xz));
  const withGhost = ghostRow ? spotOf(sid, roots, held.concat(written).map(xz).concat([{ x: ghostRow.px, z: H - 1 - ghostRow.row }])) : null;
  ok(!!g && g.changed && air.length === 1 && written.length > 0 && rows.filter((w) => w.type === "coastal_bunker" && w.province === B).length === 1,
    `the call writes the state's rows and the coast rows of its other province, and no second coastal_bunker on province ${B}`, { g, written: written.map((w) => [w.type, w.px, w.row, w.province]) });
  ok(!!want && same(want, position) && !!ghostRow && inBlock(ghostRow, want) && !!withGhost && !same(withGhost, want),
    "CONTROL: the air base's own position fits, its runway over that coast pixel — so a runway kept off a bunker that is not written would move", { want, position, ghostRow, withGhost });
  ok(same(air[0], want), "⭐⭐ the air base stays on its position: the runway keeps clear of the rows the state holds and the call writes, and of nothing else",
    { air: where(air[0]), want, withGhost });
  ok(!!air[0] && rows.filter((w) => w.type !== "air_base").every((q) => !inBlock(q, air[0])), "⭐ …and no row of the state stands under it",
    rows.filter((w) => w.type !== "air_base" && air[0] && inBlock(w, air[0])).map((q) => [q.type, q.px, q.row]));
}

console.log("\n-- ⭐ D. a dockyard the state already holds: the runway is not kept off the dockyard the call does not write --");
{
  const sid = 3, pid = STATES[sid][0], held = ofState(sid, roots);
  // the twin holds none, so its call writes a dockyard where coastSlotPositions puts one — the ground this state's runway may use
  const t = generate(sid, rootsT), twinYard = ofState(sid, rootsT).filter((w) => w.type === "dockyard");
  ok(held.length === 1 && held[0].type === "dockyard" && held[0].province === pid && !!t && t.changed && twinYard.length === 1 && !same(twinYard[0], held[0]),
    "(the fixture: the state holds a dockyard row on its coast; its twin, holding none, is given one elsewhere)", { held: held.map((w) => w.line), twinYard: twinYard.map((w) => w.line) });

  const g = generate(sid, roots);
  const rows = ofState(sid, roots), air = rows.filter((w) => w.type === "air_base");
  const written = rows.filter((w) => COAST_TYPES.has(w.type) && !held.some((h) => h.line === w.line));
  const want = spotOf(sid, roots, held.concat(written).map(xz)), withGhost = spotOf(sid, roots, held.concat(written, twinYard).map(xz));
  ok(!!g && g.changed && air.length === 1 && written.length > 0 && rows.filter((w) => w.type === "dockyard").length === 1,
    "the call writes the state's rows and its coastal_bunker, and no second dockyard", { g, written: written.map((w) => [w.type, w.px, w.row]) });
  ok(!!want && twinYard.length === 1 && inBlock(twinYard[0], want) && !!withGhost && !same(withGhost, want),
    "CONTROL: the spot the rule gives has its runway over the twin's dockyard — so a runway kept off a dockyard that is not written would move", { want, twinYard: where(twinYard[0]), withGhost });
  ok(same(air[0], want), "⭐⭐ the air base stands there: the runway keeps clear of the rows the state holds and the call writes, and of nothing else",
    { air: where(air[0]), want, withGhost });
  ok(!!air[0] && rows.filter((w) => w.type !== "air_base").every((q) => !inBlock(q, air[0])), "⭐ …and no row of the state stands under it",
    rows.filter((w) => w.type !== "air_base" && air[0] && inBlock(w, air[0])).map((q) => [q.type, q.px, q.row]));
}

try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) { /* scratch only */ }
console.log("\n" + (fail ? "FAILED " + fail + "/" + (pass + fail) : "PASSED " + pass + "/" + pass));
process.exitCode = fail ? 1 : 0;
