// ⛔ #a-factory-pair-is-not-one-point — IN A PILE, THE FIRST CIVILIAN AND THE FIRST MILITARY FACTORY STAND ON TWO POINTS, NOT ONE.
//
// A state too thin to spread over (stateSlotLayout gives null: fewer than BUILDING_SPREAD_LEAST positions) has its own rows piled in
// the 3x3 at its anchor. The pile put the k-th row of EVERY type on the 3x3's point k — so industrial_complex k and arms_factory k
// shared a point for every k, and the air base, where airfieldSpot found it no spot, stood on them too. The audit of TEST 33a found
// the first civilian and military factory on one point in 40 states, all one-province piles (the base game: 5), the air base on
// them as well in 26 (the base game: 7). Laid-out states never had it: stateSlotLayout gives industrial_complex the even positions
// and arms_factory the odd ones.
//
// So the pile takes its 3x3 in turn the same way: industrial_complex k on point 2k, arms_factory k on 2k + 1, every other type
// after them. A strip 2 px wide has no 3x3 of its own and keeps one point, as before (#a-building-over-water).
// ⚠️ MOVED with #a-small-states-models-are-spread-over-its-land (test-a-small-states-models-are-spread-over-its-land.js): a pile's
// rows now take spots of their own over the state's land, in that same turn order (the factories interleaved first), and the 3x3
// point is only where a row stays when the land has no spot left. What this test guards still holds and is still checked — the
// pair on two points, the air base on neither, the next type off them, every row on the state's own land, the strip's rows on the
// strip — but the rows no longer stand in the 3x3, each stands at its own pixel's height, and the strip's are spread along it.
//
// Every expected point is derived from the anchor stateBuildingAnchor gives and STATE_BUILDING_SLOTS' counts, never typed in, and a
// CONTROL builds the old pile from the same anchor to show each check can tell the two apart.
//   1  one province 7 px wide     two positions (north and south ring points): a pile, its air base off it on a position
//   2  a 5 px square island       no position at all, and no spot whose runway keeps off the pile: the air base is piled too
//   3  a strip 2 px wide          no 3x3 of its own: every row on the strip
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-factory-pair-"));
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

// ── the fixture: rectangles [x0, y0, x1, y1) on a 48 x 48 sea (province 1), rows top-down ────────────────────────────────────
const W = 48, H = 48, SEA = 1;
const RECT = {
  2: [8, 4, 15, 36],     // 1: 7 px wide — a ring point north and south of its town point, none east or west
  3: [30, 8, 35, 13],    // 2: a 5 px square island
  4: [40, 4, 42, 36],    // 3: a strip 2 px wide between two seas
};
const STATES = { 1: [2], 2: [3], 3: [4] };
const provAt = (x, y) => { for (const [id, [x0, y0, x1, y1]] of Object.entries(RECT)) if (x >= x0 && x < x1 && y >= y0 && y < y1) return +id; return SEA; };
const colour = (id) => [(id * 37) % 256, (id * 71) % 256, 40 + id];
const heightOf = (x, y) => (provAt(x, y) === SEA ? 80 : 96 + ((x * 3 + y * 5) % 120));
const mod = path.join(ROOT, "mod");
const roots = { modRoot: mod, gameRoot: path.join(ROOT, "no-game"), dependencyRoots: [] };
write(mod, "descriptor.mod", 'name="pair"\nreplace_path="history/states"\nreplace_path="map"\n');
write(mod, "map/provinces.bmp", bmp24(W, H, (x, y) => colour(provAt(x, y))));
write(mod, "map/heightmap.bmp", bmp8(W, H, heightOf));
write(mod, "map/definition.csv", ["0;0;0;0;land;false;unknown;0", `1;${colour(1).join(";")};sea;false;ocean;0`]
  .concat(Object.keys(RECT).map((id) => `${id};${colour(+id).join(";")};land;false;plains;1`)).join("\n") + "\n");
for (const [s, provs] of Object.entries(STATES)) {
  write(mod, `history/states/${s}-S.txt`, `state = {\n\tid = ${s}\n\tname = "STATE_${s}"\n\tmanpower = 1000\n\tstate_category = rural\n\tprovinces = { ${provs.join(" ")} }\n\thistory = {\n\t\towner = AAA\n\t}\n}\n`);
}
const BUILDINGS = path.join(mod, "map", "buildings.txt");
write(mod, "map/buildings.txt", "99;radar_station;1.00;9.50;1.00;0.00;0\n");

const PER_STATE = md.STATE_BUILDING_SLOTS.map(([t]) => t);
const countOf = (type) => (md.STATE_BUILDING_SLOTS.find(([t]) => t === type) || [0, 0])[1];
const IC = "industrial_complex", AF = "arms_factory";
const readRows = () => fs.readFileSync(BUILDINGS, "utf8").split(/\r?\n/).filter(Boolean).map((l) => l.split(";")).filter((c) => c.length >= 7)
  .map((c) => { const x = +c[2], z = +c[4]; return { sid: +c[0], type: c[1], x, y: c[3], z, px: Math.floor(x), row: H - 1 - Math.floor(z), spot: `${c[2]};${c[4]}` }; });
const ownRows = (sid, rows) => rows.filter((r) => r.sid === sid && PER_STATE.includes(r.type));
const spreadOf = (sid) => { const a = md.stateBuildingAnchor({ ...roots, provinces: STATES[sid], positions: true }) || {}; return { ...a, positions: Array.isArray(a.positions) ? a.positions : [] }; };
const pix = (t) => ({ px: Math.floor(t.x), row: H - 1 - Math.floor(t.z) });
const cheb = (a, b) => Math.max(Math.abs(a.px - b.px), Math.abs(a.row - b.row));
const of = (rows, type) => rows.filter((r) => r.type === type);                     // in the order they were written: k = 0, 1, …
/** how many k have industrial_complex k and arms_factory k on one spot */
const pairsShared = (rows) => { const ic = of(rows, IC), af = of(rows, AF); let n = 0; for (let k = 0; k < Math.min(ic.length, af.length); k++) if (ic[k].spot === af[k].spot) n++; return n; };
/** the 3x3's points that hold a row */
const pointsHeld = (rows, anchor) => new Set(rows.filter((r) => cheb(r, anchor) <= 1).map((r) => `${r.px - anchor.px},${r.row - anchor.row}`));
/** CONTROL: the pile as it was written before — the k-th row of every type on point k of the 3x3 at the anchor */
const oldPile = (sid, a) => md.STATE_BUILDING_SLOTS.flatMap(([type, count]) => Array.from({ length: count }, (_, k) => {
  const x = a.x + (k % 3) - 1, z = a.z + Math.floor(k / 3) - 1;
  return { sid, type, x, z, px: Math.floor(x), row: H - 1 - Math.floor(z), spot: `${x.toFixed(2)};${z.toFixed(2)}` };
}));

console.log(`\n-- Auto-fix's slot pass furnishes all ${Object.keys(STATES).length} states --`);
const fixed = md.fixStatesWithoutBuildingSlots(roots);
ok(fixed && fixed.fixed === Object.keys(STATES).length && !(fixed.failed || []).length, `fixStatesWithoutBuildingSlots gave each of the ${Object.keys(STATES).length} states its rows`, fixed);
const all = readRows();

for (const [sid, what] of [[1, "one province 7 px wide, its air base off the pile"], [2, "a 5 px island, its air base in the pile"]]) {
  console.log(`\n-- ⭐ ${sid}. a pile: ${what} --`);
  const a = spreadOf(sid), anchor = pix(a), rows = ownRows(sid, all), piled = rows.filter((r) => cheb(r, anchor) <= 1);
  ok(md.stateSlotLayout(a) === null && a.spread !== false && [-1, 0, 1].every((dy) => [-1, 0, 1].every((dx) => provAt(anchor.px + dx, anchor.row + dy) === STATES[sid][0])),
    "(the fixture: too thin to spread over — a pile — with a 3x3 of its own round the anchor)", { positions: a.positions.length, anchor });
  const air = of(rows, "air_base")[0];
  ok(sid === 1 ? !!air && cheb(air, anchor) > 1 : !!air && cheb(air, anchor) <= 1,
    sid === 1 ? "(…its air base stands off the pile, on a position: airfieldSpot found it one)" : "(…and its air base stands in the pile: no spot keeps the runway off it)", air && [air.px, air.row]);
  const ic = of(rows, IC), af = of(rows, AF);
  ok(ic.length === countOf(IC) && af.length === countOf(AF),
    `(its ${countOf(IC)} industrial_complex and ${countOf(AF)} arms_factory rows)`, { ic: ic.length, af: af.length, piled: piled.length });
  ok(pairsShared(rows) === 0, "⭐⭐ industrial_complex k and arms_factory k never stand on one point", ic.map((r, k) => [r.spot, af[k] && af[k].spot]));
  ok(!!ic[0] && !!af[0] && ic[0].spot !== af[0].spot && (!air || (air.spot !== ic[0].spot && air.spot !== af[0].spot)),
    "⭐⭐ …the first of each — the ones a state shows — on two points, and the air base on neither", { ic0: ic[0] && ic[0].spot, af0: af[0] && af[0].spot, air: air && air.spot });
  // the other types carry on round the 3x3 from where the factories stop (as stateSlotLayout's `turn` does), so the first of them —
  // the next type in STATE_BUILDING_SLOTS after the two factories — does not start again on the drawn pair's points
  const next = md.STATE_BUILDING_SLOTS.map(([t]) => t).find((t) => t !== IC && t !== AF), nextRows = of(rows, next);
  ok(!!ic[0] && !!af[0] && nextRows.length === countOf(next) && nextRows.every((r) => r.spot !== ic[0].spot && r.spot !== af[0].spot),
    `⭐ the ${next} rows, the first type after the factories, stand off those two points too`, nextRows.map((r) => r.spot));
  const spots = new Set(rows.map((r) => r.spot));
  ok(spots.size >= 9, "⭐ the rows stand on nine points or more, not the first six (spread over the province since #a-small-states-models-are-spread-over-its-land)", [...spots]);
  ok(rows.every((r) => provAt(r.px, r.row) === STATES[sid][0]) && rows.filter((r) => r.type !== "air_base").every((r) => r.y === md.modelYForHeight(heightOf(r.px, r.row)).toFixed(2)),
    "every row on the state's own land, each at its own pixel's height", rows.filter((r) => provAt(r.px, r.row) !== STATES[sid][0] || (r.type !== "air_base" && r.y !== md.modelYForHeight(heightOf(r.px, r.row)).toFixed(2))).map((r) => [r.type, r.px, r.row, r.y]));
  const old = oldPile(sid, a);
  ok(pairsShared(old) === Math.min(countOf(IC), countOf(AF)) && pointsHeld(old, anchor).size < 9,
    "⭐⭐ CONTROL: the old pile, built from the same anchor, puts every arms_factory on an industrial_complex's point and leaves points empty — the checks above see it", { shared: pairsShared(old), points: pointsHeld(old, anchor).size });
}

console.log("\n-- 3. a strip 2 px wide: no 3x3 of its own, so every row on the strip --");
{
  const a = spreadOf(3), rows = ownRows(3, all);
  ok(a.spread === false && md.stateSlotLayout(a) === null, "(the fixture: no 3x3 of the state's land at the anchor)", a.spread);
  ok(rows.length === md.STATE_BUILDING_SLOTS.reduce((n, [, k]) => n + k, 0) && rows.every((r) => provAt(r.px, r.row) === STATES[3][0]),
    "⭐⭐ every row on the strip — no step sideways into the sea (spread along it since #a-small-states-models-are-spread-over-its-land)", [...new Set(rows.map((r) => r.spot))]);
}

console.log("\n-- ⭐ 4. idempotent --");
{
  const before = fs.readFileSync(BUILDINGS, "utf8");
  const again = md.fixStatesWithoutBuildingSlots(roots);
  ok(again && !again.fixed && fs.readFileSync(BUILDINGS, "utf8") === before, "a second pass changes nothing", again);
}

try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) { /* scratch only */ }
console.log("\n" + (fail ? "FAILED " + fail + "/" + (pass + fail) : "PASSED " + pass + "/" + pass));
process.exitCode = fail ? 1 : 0;
