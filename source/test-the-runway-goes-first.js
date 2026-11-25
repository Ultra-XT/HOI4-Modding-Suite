// ⛔ #the-runway-goes-first — A STATE'S AIR BASE TAKES ITS SPOT FIRST, AND THE ROWS A CALL HAS NOT WRITTEN YET GO ROUND IT.
//
// airfieldSpot kept the runway off every row the layout was about to write, the copies it steps aside too, and off a pile's whole
// 3x3 — so the runway was the last row placed, and where the layout filled a province it found no spot at all: 29 of the 37 states
// of TEST 33a whose airfield crossed its province had none (21 of them piles), and kept their position. The order is turned round. The
// runway keeps off the town points and the rows that already STAND, of any type — a row that stands never moves — and
// ensureBuildingSlotsForState lays the rest out round it: stateSlotLayout's positions under the runway yield (`underRunway`), and a
// pile's 3x3 moves off it where the state has room (pileOffRunway). A pile with no spot takes airfieldSpot's pass 5, pinned by
// test-an-airfield-stands-inside-its-province.js (D and V).
//
// The runway the rows go round is the one that STANDS — the state's own air_base row — or the one the call writes; never one a
// read would place, which a top-up does not write. And a world laid out before this is topped up on the spots its rows hold: the
// layout is asked with the yield and without it, and the one more of the state's rows stand on is taken.
//
// Every expected spot comes from the module's own reads (stateBuildingAnchor's positions, stateSlotLayout) or a brute-force search
// over the fixture's rectangles, never typed in; each case asserts first that its fixture exercises it.
//   a  two 8 px provinces    (Bindken) the rule as it was finds no spot at all: the runway takes one of one province now, and the
//                            rows go round it — civilian factories on the even positions, military on the odd, as before
//   b  a modder's factory     a row that stands is kept clear of, whatever its type
//   c  a modder's air base    the state's own air_base row is the runway its new rows go round
//   k  no spot at all        two 3 px strips, laid out: no model fits, and the rows go round the air base's own position, where
//                            it is written
//   e  the runway's last row  a position whose top copies stand on the block's last row is covered: a copy is read on its own pixel
//   l  a strip's pile        a pile on one point stays where the runway covers a pixel beside it and not the point
//   m  a wider airfield      a dependency draws one reaching further east, as Millennium Dawn's does: the layout's rows and the
//                            province's sites go round the runway the layers DRAW, not the base game's
//   d  stateSlotLayout        pure: a list every position of which is covered keeps them all; a factory keeps its kind's list;
//                            without underRunway nothing moves
//   f  pileOffRunway          pure: the nearest 3x3 of the state's land wholly off the block; null where the pile is clear or has
//                            no room
//   i  an older Nova's world  a runway over a copy no row used: every row dropped in turn comes back on its own spot
//   i2 this Nova's world      …and every row of a state laid out round its runway
//   j  a pile and its runway  a pile's lost row comes back off the runway that stands, not off one a read would place — and a pile
//                            moved off it stands at the height of the ground it moved to
//   g  a second call          adds nothing
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-runway-first-"));
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
/** a .mesh as the game's carry their aabb: the float triples "min" and "max" ('!', name length, name, 'f', int32 count, values) */
function meshFile(min, max) {
  const prop = (name, v) => { const b = Buffer.alloc(2 + name.length + 1 + 4 + 4 * v.length); b[0] = 0x21; b[1] = name.length; b.write(name + "f", 2, "latin1"); b.writeInt32LE(v.length, 3 + name.length); v.forEach((f, k) => b.writeFloatLE(f, 7 + name.length + 4 * k)); return b; };
  return Buffer.concat([Buffer.from("@@b@", "latin1"), Buffer.from("[aabb", "latin1"), prop("min", min), prop("max", max)]);
}

// ── the fixture: rectangles [x0, y0, x1, y1) on a 128 x 64 sea (province 1), rows top-down ─────────────────────────────────────
const W = 128, H = 64, SEA = 1;
const RECT = {
  2: [4, 4, 12, 12], 3: [12, 4, 20, 12],     // a: two provinces 8 x 8 side by side
  4: [24, 4, 32, 12], 5: [32, 4, 40, 12],    // b: the same, a modder's factory row where the runway would stand
  6: [44, 4, 60, 26],                        // c: 16 x 22, a modder's air base over a factory position
  7: [64, 4, 80, 26],                        // i: the same, laid out by an older Nova
  9: [4, 30, 19, 35],                        // j: an island 15 x 5: two ring points, so a pile
  10: [84, 30, 92, 33], 11: [92, 30, 100, 33], // k: two strips 3 px high: three positions, and no model fits anywhere
  12: [84, 4, 100, 26],                      // e: 16 x 22, a modder's air base whose block ends a row above a position
  13: [4, 40, 44, 41], 14: [21, 41, 25, 43], 15: [4, 41, 8, 43],    // l: a 1 px strip, the town; 4 x 2 under its middle and its west end
};
const STATES = { 1: [2, 3], 2: [4, 5], 3: [6], 4: [7], 5: [9], 6: [10, 11], 7: [12], 8: [13, 14, 15] };
const [A, B, C, D, J, K, E, S] = [1, 2, 3, 4, 5, 6, 7, 8];
const provAt = (x, y) => { for (const [id, [x0, y0, x1, y1]] of Object.entries(RECT)) if (x >= x0 && x < x1 && y >= y0 && y < y1) return +id; return SEA; };
const stateOf = (p) => +(Object.keys(STATES).find((s) => STATES[s].includes(p)) || 0);
const colour = (id) => [(id * 37) % 256, (id * 71) % 256, 40 + id];
const heightOf = (x, y) => (provAt(x, y) === SEA ? 80 : 96 + ((x * 3 + y * 5) % 120));   // no two neighbours alike
const mod = path.join(ROOT, "mod");
const roots = { modRoot: mod, gameRoot: path.join(ROOT, "no-game"), dependencyRoots: [] };
write(mod, "descriptor.mod", 'name="runway"\nreplace_path="history/states"\nreplace_path="map"\n');
write(mod, "map/provinces.bmp", bmp24(W, H, (x, y) => colour(provAt(x, y))));
write(mod, "map/heightmap.bmp", bmp8(W, H, heightOf));
write(mod, "map/definition.csv", ["0;0;0;0;land;false;unknown;0", `1;${colour(1).join(";")};sea;false;ocean;0`]
  .concat(Object.keys(RECT).map((id) => `${id};${colour(+id).join(";")};land;false;plains;1`)).join("\n") + "\n");
for (const [s, provs] of Object.entries(STATES)) {
  write(mod, `history/states/${s}-S.txt`, `state = {\n\tid = ${s}\n\tname = "STATE_${s}"\n\tmanpower = 1000\n\tstate_category = rural\n\tprovinces = { ${provs.join(" ")} }\n\thistory = {\n\t\towner = AAA\n\t}\n}\n`);
}
const BUILDINGS = path.join(mod, "map", "buildings.txt");
write(mod, "map/buildings.txt", "99;radar_station;1.00;9.50;1.00;0.00;0\n");

const LAID = md.STATE_BUILDING_SLOTS.map(([t]) => t).filter((t) => t !== "air_base");    // the layout's types but the air base
const REACH = md.airfieldReach(roots);
const lines = () => fs.readFileSync(BUILDINGS, "utf8").split(/\r?\n/).filter(Boolean);
// a modder's row, appended on a line of its own: Nova's row writers end the file as the base game's does, with no final newline
// (#a-buildings-row-writer-ends-as-the-base-game-does), so a bare append would join it onto the last row
const appendRow = (row) => { const t = fs.readFileSync(BUILDINGS, "utf8"); fs.writeFileSync(BUILDINGS, t + (t && !/\n$/.test(t) ? "\n" : "") + row + "\n"); };
const rowOf = (l) => { const c = l.split(";"), x = +c[2], z = +c[4], px = Math.floor(x), row = H - 1 - Math.floor(z); return { sid: +c[0], type: c[1], x, z, px, row, province: provAt(px, row), line: l }; };
const rowsOf = (sid) => lines().map(rowOf).filter((r) => r.sid === sid);
const pix = (t) => ({ px: Math.floor(t.x), row: H - 1 - Math.floor(t.z) });
const cheb = (a, b) => Math.max(Math.abs(a.px - b.px), Math.abs(a.row - b.row));
const same = (a, b) => !!a && !!b && a.px === b.px && a.row === b.row;
/** the pixels a model's box covers from a whole-pixel row — airfieldBlock's arithmetic: the row's point is (px, row + 1) */
const blockOf = (p) => { const Y = p.row + 1; return { c0: Math.floor(p.px - REACH.west), c1: Math.ceil(p.px + REACH.east) - 1, r0: Math.floor(Y - REACH.north), r1: Math.ceil(Y + REACH.south) - 1 }; };
const inBlock = (b, q) => q.px >= b.c0 && q.px <= b.c1 && q.row >= b.r0 && q.row <= b.r1;
const pixelsOf = (b) => { const out = []; for (let r = b.r0; r <= b.r1; r++) for (let c = b.c0; c <= b.c1; c++) out.push({ px: c, row: r }); return out; };
const onMap = (b) => b.c0 >= 0 && b.r0 >= 0 && b.c1 < W && b.r1 < H;
/** stateBuildingAnchor's positions answer for a state, as the writer reads it */
const positionsOf = (sid, keepClearOf = null) => md.stateBuildingAnchor({ ...roots, provinces: STATES[sid], positions: true, stateId: sid, keepClearOf }) || {};
const townsOf = (sid) => md.stateBuildingAnchor({ ...roots, provinces: STATES[sid], each: true });
/** a state's layout with the yield to the runway whose block is `b` (stateSlotLayout's underRunway, in the buildings frame) */
const yieldTo = (pos, b) => md.stateSlotLayout({ ...pos, underRunway: (x, z) => inBlock(b, pix({ x, z })) });
/** a layout's spots as `type;x;z` lines, sorted, the air base's left out — what the file must hold of them */
const spotsOf = (L) => [...L].filter(([t]) => t !== "air_base").flatMap(([t, l]) => l.map((s) => `${t};${s.x.toFixed(2)};${s.z.toFixed(2)}`)).sort();
const fileSpots = (sid) => rowsOf(sid).filter((r) => LAID.includes(r.type)).map((r) => `${r.type};${r.x.toFixed(2)};${r.z.toFixed(2)}`).sort();
// ⚠️ MOVED with ⛔ #a-state-building-keeps-off-the-factory-spots: a row whose layout spot is on a position another row took first (the
// layout's `shared`) takes a spot of its own over the state's land (test-a-state-building-keeps-off-the-factory-spots.js pins where). So
// "the state's rows stand on the layout's spots" is asked of the layout's other spots, each held exactly as often as the layout gives it,
// and of how many rows stand elsewhere: as many as the layout sends to a spot of their own
const laidSpots = (L) => {
  const sh = (t) => (L && L.shared && L.shared.get(t)) || [];
  const own = [...L].filter(([t]) => t !== "air_base").reduce((n, [t]) => n + sh(t).filter(Boolean).length, 0);
  return [...L].filter(([t]) => t !== "air_base").flatMap(([t, l]) => l.filter((_, k) => !sh(t)[k]).map((s) => `${t};${s.x.toFixed(2)};${s.z.toFixed(2)}`)).sort().concat(`+${own} on spots of their own`);
};
const fileLaid = (sid, L) => {
  const want = laidSpots(L), keys = new Set(want), all = fileSpots(sid), on = all.filter((k) => keys.has(k));
  return on.concat(`+${all.length - on.length} on spots of their own`);
};
const lineAt = (sid, type, p) => `${sid};${type};${p.x.toFixed(2)};${md.modelYForHeight(heightOf(pix(p).px, pix(p).row)).toFixed(2)};${p.z.toFixed(2)};0.00;0`;
/** the rest of the positions, as stateSlotLayout splits them: the even ones (industrial_complex) and the odd (arms_factory) */
const restOf = (pos) => { const P = pos.positions || [], air = md.airBaseIndex(P, pos.home); return P.filter((_, i) => i !== air).map((p, i) => ({ ...pix(p), even: i % 2 === 0 })); };

console.log("\n-- ⭐ a. Bindken: two 8 px provinces; the rule as it was finds the runway no spot --");
{
  ok(JSON.stringify(REACH) === JSON.stringify(md.AIRFIELD_REACH), "(the fixture's layers draw no airfield of their own: the base game's reach)", REACH);
  const pos = positionsOf(A), L0 = md.stateSlotLayout(pos), towns = [...townsOf(A).values()].map(pix);
  // the rule as it was: the runway kept off every row the layout would write (and the town points) — no pixel of the state then had a
  // block clear of them and all on the state's land, let alone one province
  const kept = towns.concat(L0 ? spotsOf(L0).map((l) => pix({ x: +l.split(";")[1], z: +l.split(";")[2] })) : []);
  const old = [];
  for (let row = 0; row < H; row++) for (let px = 0; px < W; px++) {
    if (stateOf(provAt(px, row)) !== A) continue;
    const b = blockOf({ px, row });
    if (onMap(b) && pixelsOf(b).every((q) => stateOf(provAt(q.px, q.row)) === A) && !kept.some((k) => inBlock(b, k))) old.push({ px, row });
  }
  ok(!!L0 && old.length === 0, "(the fixture: laid out, and with the layout's rows kept clear of no pixel has a block of the state's land clear of them)", old.slice(0, 3));
  const r = md.ensureBuildingSlotsForState({ ...roots, stateId: A, provinces: STATES[A] });
  const air = rowsOf(A).filter((w) => w.type === "air_base");
  const b = air.length ? blockOf(air[0]) : null;
  ok(!!r && r.changed && air.length === 1 && onMap(b) && pixelsOf(b).every((q) => provAt(q.px, q.row) === air[0].province),
    "⭐⭐ the runway takes a spot whose whole model is on one province — its own", air.map((w) => [w.px, w.row, w.province]));
  const Ly = b ? yieldTo(pos, b) : null;
  ok(!!Ly && JSON.stringify([...Ly]) !== JSON.stringify([...L0]), "(the fixture: that runway covers a position of the layout)");
  ok(!!Ly && JSON.stringify(fileLaid(A, Ly)) === JSON.stringify(laidSpots(Ly)), "⭐⭐ the state's rows stand on the layout's spots with the yield to it: they went round the runway", { file: fileLaid(A, Ly), want: Ly && laidSpots(Ly) });
  const under = b ? rowsOf(A).filter((w) => LAID.includes(w.type) && inBlock(b, w)) : [{}];
  ok(under.length === 0, "⭐⭐ …and none of them stands under it", under.map((w) => [w.type, w.px, w.row]));
  // h. the factories keep their kinds: civilian on the even positions' copies, military on the odd ones', as stateSlotLayout splits them
  const rest = restOf(pos), near = (w, even) => rest.some((p) => p.even === even && cheb(p, w) <= 1);
  // ⚠️ MOVED with ⛔ #a-factorys-copy-stands-on-a-spot-of-its-own: a copy on a position its kind took already takes a spot of its own
  // where the land has a good one, on no position at all — so the kinds are checked on the factories that stand on one
  const onList = (w) => near(w, true) || near(w, false);
  const ic = rowsOf(A).filter((w) => w.type === "industrial_complex" && onList(w)), af = rowsOf(A).filter((w) => w.type === "arms_factory" && onList(w));
  ok(ic.length > 0 && af.length > 0 && ic.every((w) => near(w, true) && !near(w, false)) && af.every((w) => near(w, false) && !near(w, true)),
    "⭐ the civilian factories on the positions stand on the even ones, the military on the odd: the yield keeps each kind's list", { ic: ic.map((w) => [w.px, w.row]), af: af.map((w) => [w.px, w.row]) });
}

console.log("\n-- ⭐ b. a modder's factory row where the runway would stand is kept clear of --");
{
  const free = positionsOf(B).airfield;                       // where the runway stands with no row of the state to keep off
  const X = free && pix(free), modder = X ? lineAt(B, "industrial_complex", { x: X.px, z: H - 1 - X.row }) : "";
  ok(!!X && stateOf(provAt(X.px, X.row)) === B, "(the fixture: with no row of the state, the runway's spot is a pixel of its land)", X);
  appendRow(modder);
  const r = md.ensureBuildingSlotsForState({ ...roots, stateId: B, provinces: STATES[B] });
  const air = rowsOf(B).filter((w) => w.type === "air_base"), want = X ? positionsOf(B, [{ x: X.px, z: H - 1 - X.row }]).airfield : null;
  ok(!!r && r.changed && lines().includes(modder), "the modder's industrial_complex row stands as it was", modder);
  ok(air.length === 1 && !!X && !inBlock(blockOf(air[0]), X), "⭐⭐ the runway's block holds no pixel of it", air.map((w) => [w.px, w.row]));
  ok(air.length === 1 && !!want && same(air[0], pix(want)), "⭐ …and it stands where airfieldSpot puts it, told of the row", { air: air.map((w) => [w.px, w.row]), want: want && pix(want) });
}

console.log("\n-- ⭐ c. the air base row a state already has is the runway its new rows go round --");
{
  const pos = positionsOf(C), L0 = md.stateSlotLayout(pos), ic0 = L0 && L0.get("industrial_complex")[0];
  const runwayRow = ic0 ? lineAt(C, "air_base", ic0) : "", b = ic0 ? blockOf(pix(ic0)) : null;
  const Ly = b ? yieldTo(pos, b) : null;
  ok(!!L0 && spotsOf(L0).some((l) => inBlock(b, pix({ x: +l.split(";")[1], z: +l.split(";")[2] }))) && JSON.stringify([...Ly]) !== JSON.stringify([...L0]),
    "(the fixture: a modder's air base on the first civilian factory's position — the layout without the yield stands rows under it)", ic0);
  appendRow(runwayRow);
  const r = md.ensureBuildingSlotsForState({ ...roots, stateId: C, provinces: STATES[C] });
  const air = rowsOf(C).filter((w) => w.type === "air_base");
  ok(!!r && r.changed && air.length === 1 && air[0].line === runwayRow, "⭐ the modder's air base stands as it was, and no other is written", air.map((w) => w.line));
  const under = rowsOf(C).filter((w) => LAID.includes(w.type) && inBlock(b, w));
  ok(under.length === 0, "⭐⭐ no row the call wrote stands under it", under.map((w) => [w.type, w.px, w.row]));
  ok(JSON.stringify(fileLaid(C, Ly)) === JSON.stringify(laidSpots(Ly)), "⭐⭐ …they stand on the layout's spots with the yield to THAT runway", { file: fileLaid(C, Ly), want: laidSpots(Ly) });
}

console.log("\n-- ⭐ k. a laid-out state with no spot for the runway: the rows go round the air base's own position --");
{
  const pos = positionsOf(K), P = pos.positions || [], L0 = md.stateSlotLayout(pos), a = P[md.airBaseIndex(P, pos.home)];
  const b = a ? blockOf(pix(a)) : null, Ly = b ? yieldTo(pos, b) : null;
  ok(!!L0 && pos.airfield === null && !!Ly && JSON.stringify([...Ly]) !== JSON.stringify([...L0]),
    "(the fixture: laid out, airfieldSpot finds no spot, and the air base's position covers a copy of another)", { n: P.length, airfield: pos.airfield });
  const r = md.ensureBuildingSlotsForState({ ...roots, stateId: K, provinces: STATES[K] });
  const air = rowsOf(K).filter((w) => w.type === "air_base");
  ok(!!r && r.changed && air.length === 1 && !!a && air[0].x === a.x && air[0].z === a.z, "the air base stands on its position, as before", air.map((w) => [w.x, w.z]));
  // three positions: the air base's, one even and one odd — a list whose every position is covered keeps them (d), so the military
  // factories stay under it; every other row goes round
  const under = b ? rowsOf(K).filter((w) => LAID.includes(w.type) && inBlock(b, w)) : [];
  const was = b && L0 ? spotsOf(L0).filter((l) => inBlock(b, pix({ x: +l.split(";")[1], z: +l.split(";")[2] }))) : [];
  ok(!!b && under.length < was.length && under.every((w) => w.type === "arms_factory"),
    "⭐⭐ of the rows the call wrote only the military factories, whose one position it covers, stand under its model — fewer than without the yield", { under: under.map((w) => [w.type, w.px, w.row]), was: was.length });
  ok(!!Ly && JSON.stringify(fileLaid(K, Ly)) === JSON.stringify(laidSpots(Ly)), "⭐ …they stand on the layout's spots with the yield to it", { file: fileLaid(K, Ly), want: laidSpots(Ly) });
}

console.log("\n-- ⭐ e. a position whose top copies stand on the runway's last row yields to it --");
{
  // the writer's underRunway reads a copy's pixel as every building reader does (buildingZToPixelY); read a row low, a position just
  // below the block — its top copies on the block's last row — is not covered, and the rows written on those copies stand under it
  const pos = positionsOf(E), L0 = md.stateSlotLayout(pos), json = (l) => JSON.stringify(l ? [...l] : null);
  const low = (b) => md.stateSlotLayout({ ...pos, underRunway: (x, z) => inBlock(b, { px: Math.floor(x), row: H - Math.floor(z) }) });
  let spot = null, b = null;
  for (const p of L0 ? restOf(pos) : []) {
    const a = { px: p.px, row: p.row - 3 }, k = blockOf(a);
    if (k.r1 !== p.row - 1 || !onMap(k) || stateOf(provAt(a.px, a.row)) !== E) continue;
    if (json(yieldTo(pos, k)) !== json(L0) && json(low(k)) !== json(yieldTo(pos, k))) { spot = a; b = k; break; }
  }
  ok(!!spot, "(the fixture: a spot for a modder's air base whose block's last row holds a position's top copies, and the layout read a row low is another)", spot);
  if (spot) {
    const runwayRow = lineAt(E, "air_base", { x: spot.px, z: H - 1 - spot.row });
    appendRow(runwayRow);
    const r = md.ensureBuildingSlotsForState({ ...roots, stateId: E, provinces: STATES[E] });
    const Ly = yieldTo(pos, b), under = rowsOf(E).filter((w) => LAID.includes(w.type) && inBlock(b, w));
    ok(!!r && r.changed && JSON.stringify(fileLaid(E, Ly)) === JSON.stringify(laidSpots(Ly)), "⭐⭐ the state's rows stand on the layout's spots with the yield to it", { file: fileLaid(E, Ly), want: laidSpots(Ly) });
    ok(under.length === 0, "⭐⭐ …and none of them stands under its model", under.map((w) => [w.type, w.px, w.row]));
  }
}

console.log("\n-- ⭐ l. a strip's pile keeps its one point where the runway covers only a pixel beside it --");
{
  // pileOffRunway is asked of the pile's 3x3 only where the pile spreads over one; a strip's rows all stand on its one point
  const pos = positionsOf(S), at = pix(pos), a = { px: at.px, row: at.row + 2 }, b = blockOf(a);
  const ask = (full) => md.pileOffRunway({ ex: pos.ex, provinces: STATES[S], at: { x: at.px, row: at.row, full }, ownLand: pos.ownLand, runway: b });
  const beside = [-1, 0, 1].some((dy) => [-1, 0, 1].some((dx) => inBlock(b, { px: at.px + dx, row: at.row + dy })));
  ok(md.stateSlotLayout(pos) === null && pos.spread === false && stateOf(provAt(a.px, a.row)) === S && !inBlock(b, at) && beside && ask(false) === null && !!ask(true),
    "(the fixture: a pile on a strip's one point, a modder's air base whose block covers a pixel beside it but not the point, and room for a 3x3 off the block)", { at, spread: pos.spread, moved: ask(true) });
  appendRow(lineAt(S, "air_base", { x: a.px, z: H - 1 - a.row }));
  const r = md.ensureBuildingSlotsForState({ ...roots, stateId: S, provinces: STATES[S] });
  const piled = rowsOf(S).filter((w) => LAID.includes(w.type));
  // ⚠️ MOVED with #a-small-states-models-are-spread-over-its-land: every row stood on the strip's one point; a pile's rows take spots
  // of their own over the state's land now — still all on the strip, and still none under the runway that stands
  ok(!!r && r.changed && piled.length === LAID.reduce((n, t) => n + md.STATE_BUILDING_SLOTS.find(([u]) => u === t)[1], 0) && piled.every((w) => stateOf(provAt(w.px, w.row)) === S && !inBlock(b, w)),
    "⭐⭐ every row of the pile stands on the strip, none under the runway", piled.filter((w) => stateOf(provAt(w.px, w.row)) !== S || inBlock(b, w)).map((w) => [w.type, w.px, w.row]));
}

console.log("\n-- ⭐ m. a dependency that draws a wider airfield: the rows go round the runway it DRAWS --");
{
  // Millennium Dawn's hangar reaches 4.26 px east (the base game's 2.72), and a state's runway is placed at the reach its layers draw
  // (stateBuildingAnchor's `reach`, airfieldReach). The rows the call writes go round that same model: a position only the wider one
  // covers yields to it, and the sites keep a pixel off it. A dependency's own gfx/entities names a pdxmesh, its .gfx under gfx/models
  // gives that mesh's file, and the mesh's aabb is the model, as test-an-airfield-stands-inside-its-province.js's M reads it. The
  // runway is a modder's air base row (as c), 5 px west of the south position, whose copies only the wider model's east end covers
  const MW = 32, MH = 28, ISLE = [8, 6, 24, 22], TOWN = [15, 13], AIR = [10, 18], MESH = { min: [-1.3, 0, -1.3], max: [3.0, 1.0, 0.85] }, SCALE = 1.4;
  const mProv = (x, y) => (x >= ISLE[0] && x < ISLE[2] && y >= ISLE[1] && y < ISLE[3] ? 2 : SEA), mHeight = (x, y) => (mProv(x, y) === SEA ? 80 : 96 + ((x * 3 + y * 5) % 120));
  const dep = path.join(ROOT, "dep"), mod2 = path.join(ROOT, "mod2");
  write(dep, "descriptor.mod", 'name="dep"\n');
  write(dep, "gfx/entities/buildings.asset", 'entity = {\n\tname = "building_air_base"\n\tpdxmesh = "wide_hangar"\n\tscale = 1.0\n}\n');
  write(dep, "gfx/models/wide_hangar/wide_hangar.gfx", `objectTypes = {\n\tpdxmesh = {\n\t\tname = "wide_hangar"\n\t\tfile = "gfx/models/wide_hangar/hangar.mesh"\n\t\tscale = ${SCALE}\n\t}\n}\n`);
  write(dep, "gfx/models/wide_hangar/hangar.mesh", meshFile(MESH.min, MESH.max));
  write(mod2, "descriptor.mod", 'name="runway2"\nreplace_path="history/states"\nreplace_path="map"\ndependencies = { "dep" }\n');
  write(mod2, "map/provinces.bmp", bmp24(MW, MH, (x, y) => colour(mProv(x, y))));
  write(mod2, "map/heightmap.bmp", bmp8(MW, MH, mHeight));
  write(mod2, "map/definition.csv", ["0;0;0;0;land;false;unknown;0", `1;${colour(1).join(";")};sea;false;ocean;0`, `2;${colour(2).join(";")};land;false;plains;1`].join("\n") + "\n");
  write(mod2, "map/unitstacks.txt", `2;0;${TOWN[0]}.00;10.00;${MH - 1 - TOWN[1]}.00;0.00;0.00\n`);
  write(mod2, "history/states/1-S.txt", "state = {\n\tid = 1\n\tname = \"STATE_1\"\n\tmanpower = 1000\n\tstate_category = rural\n\tprovinces = { 2 }\n\thistory = {\n\t\towner = AAA\n\t}\n}\n");
  const runwayRow = `1;air_base;${AIR[0]}.00;${md.modelYForHeight(mHeight(AIR[0], AIR[1])).toFixed(2)};${MH - 1 - AIR[1]}.00;0.00;0`;
  write(mod2, "map/buildings.txt", `99;radar_station;1.00;9.50;1.00;0.00;0\n${runwayRow}\n`);
  const roots2 = { modRoot: mod2, gameRoot: roots.gameRoot, dependencyRoots: [dep] };
  // the model's reach as the game reads it: the mesh's float32 aabb at its scale, rounded up to the hundredth
  const up = (v) => Math.ceil(100 * Math.max(0, Math.fround(v)) * SCALE) / 100, R2 = { west: up(-MESH.min[0]), east: up(MESH.max[0]), south: up(-MESH.min[2]), north: up(MESH.max[2]) };
  const read = md.airfieldReach(roots2);
  ok(JSON.stringify(read) === JSON.stringify(R2) && R2.east > REACH.east, "(the fixture: airfieldReach reads the dependency's airfield, wider east than the base game's)", { read, R2 });
  const pos = md.stateBuildingAnchor({ ...roots2, provinces: [2], positions: true, stateId: 1 }) || {}, T = md.stateBuildingAnchor({ ...roots2, provinces: [2], each: true }).get(2);
  const r = md.ensureBuildingSlotsForState({ ...roots2, stateId: 1, provinces: [2] });
  const rows = fs.readFileSync(path.join(mod2, "map", "buildings.txt"), "utf8").split(/\r?\n/).map((l) => l.split(";")).filter((c) => c.length >= 7 && c[0] === "1")
    .map((c) => ({ type: c[1], x: +c[2], z: +c[4], px: Math.floor(+c[2]), row: MH - 1 - Math.floor(+c[4]), line: c.join(";") }));
  const air = rows.filter((w) => w.type === "air_base"), pixOf = (s) => ({ px: Math.floor(s.x), row: MH - 1 - Math.floor(s.z) });
  /** the pixels a model at reach R covers from a whole-pixel row — airfieldBlock's arithmetic, on this map */
  const blockAt = (p, R) => { const Y = p.row + 1; return { c0: Math.floor(p.px - R.west), c1: Math.ceil(p.px + R.east) - 1, r0: Math.floor(Y - R.north), r1: Math.ceil(Y + R.south) - 1 }; };
  const bD = air.length === 1 ? blockAt(air[0], R2) : null, bV = air.length === 1 ? blockAt(air[0], REACH) : null;
  const yieldAt = (b) => md.stateSlotLayout({ ...pos, underRunway: (x, z) => inBlock(b, pixOf({ x, z })) });
  const Ld = bD ? yieldAt(bD) : null, Lv = bV ? yieldAt(bV) : null;
  const underD = (L) => (L && bD ? [...L].filter(([t]) => t !== "air_base").flatMap(([, l]) => l).filter((s) => inBlock(bD, pixOf(s))) : []);
  ok(!!r && r.changed && air.length === 1 && air[0].line === runwayRow, "the modder's air base stands as it was, and no other is written", air.map((w) => w.line));
  ok(!!Ld && underD(Lv).length > 0,
    "(the fixture: laid out, and the layout yielding to the base game's model would stand rows under the one the layers draw)", { underV: underD(Lv).map((s) => [pixOf(s).px, pixOf(s).row]) });
  const laid = rows.filter((w) => LAID.includes(w.type)), file = laid.map((w) => `${w.type};${w.x.toFixed(2)};${w.z.toFixed(2)}`).sort();
  // ⚠️ MOVED with ⛔ #a-state-building-keeps-off-the-factory-spots: asked as laidSpots does (the layout's other spots, and how many stand
  // on spots of their own)
  const want = Ld ? laidSpots(Ld) : [], keys = new Set(want), onLaid = file.filter((k) => keys.has(k)).concat(`+${file.length - file.filter((k) => keys.has(k)).length} on spots of their own`);
  ok(!!Ld && JSON.stringify(onLaid) === JSON.stringify(want), "⭐⭐ the state's rows stand on the layout's spots with the yield to the runway the layers draw", { file: onLaid, want });
  ok(!!bD && laid.length > 0 && laid.every((w) => !inBlock(bD, w)), "⭐⭐ …and none of them stands under it", laid.filter((w) => !bD || inBlock(bD, w)).map((w) => [w.type, w.px, w.row]));
  // the sites: provinceSiteSpots told what the call tells it — the town point and every row written before them — with the runway's
  // block at the base game's reach, and at the drawn one
  const before = rows.filter((w) => !md.PER_LAND_PROVINCE_BUILDING_SLOTS.includes(w.type)).map((w) => ({ x: w.x, z: w.z }));
  const spotsAt = (b) => md.provinceSiteSpots({ ex: pos.ex, pid: 2, town: T, ownLand: pos.ownLand, kept: [T].concat(before), runways: [b], reaches: md.SITE_TYPES.map((t) => md.SITE_REACH[t]) }).map(pixOf);
  const nearBlock = (b, q) => q.px >= b.c0 - 1 && q.px <= b.c1 + 1 && q.row >= b.r0 - 1 && q.row <= b.r1 + 1;
  const sv = bV ? spotsAt(bV) : [], sd = bD ? spotsAt(bD) : [];
  ok(!!bD && sv.length === md.SITE_TYPES.length && sv.some((q) => nearBlock(bD, q)), "(the fixture: kept off the base game's model, a site would stand within a pixel of the one the layers draw)", { sv, bD });
  const sites = rows.filter((w) => md.SITE_TYPES.includes(w.type));
  ok(!!bD && sites.length === md.SITE_TYPES.length && sites.every((w) => !nearBlock(bD, w)), "⭐⭐ the fort and the special-project site stand a pixel or more off the runway the layers draw", sites.map((w) => [w.type, w.px, w.row]));
  ok(sd.length === md.SITE_TYPES.length && md.SITE_TYPES.every((t, i) => sites.filter((w) => w.type === t).length === 1 && same(sites.find((w) => w.type === t), sd[i])),
    "⭐ …each on provinceSiteSpots' spot at that model's block", { sites: sites.map((w) => [w.type, w.px, w.row]), sd });
}

console.log("\n-- ⭐ d. stateSlotLayout's yield, pure --");
{
  // six positions in a row, 10 px apart: the first in another province (the air base's), the rest the town's — even: x 20, 40, 60
  const P = [10, 20, 30, 40, 50, 60].map((x, i) => ({ x, z: 10, province: i ? 1 : 2, d: 4 })), home = 1;
  const L = md.stateSlotLayout({ positions: P, home }), json = (l) => JSON.stringify(l ? [...l] : null);
  const under = (xs) => (x) => xs.some((c) => Math.abs(x - c) <= 1);
  const ask = (f) => { try { return md.stateSlotLayout({ positions: P, home, underRunway: f }); } catch (e) { return { error: e.message }; } };
  ok(!!L && json(ask(null)) === json(L) && json(ask(() => false)) === json(L), "⭐⭐ with no position under the runway, or none given, the answer is as it was");
  ok(json(ask(() => true)) === json(L), "⭐⭐ every position covered: each list keeps them all — a row needs a spot more than a clear runway", ask(() => true));
  const at = (l, t) => (l && l.get ? l.get(t) : []).map((s) => s.x);
  const odd = ask(under([30, 50]));
  ok(JSON.stringify(at(odd, "arms_factory")) === JSON.stringify(at(L, "arms_factory")) && JSON.stringify(at(odd, "industrial_complex")) === JSON.stringify(at(L, "industrial_complex"))
    && md.STATE_BUILDING_SLOTS.every(([t]) => t === "air_base" || t === "arms_factory" || at(odd, t).every((x) => Math.abs(x - 30) > 1 && Math.abs(x - 50) > 1)),
    "⭐⭐ the odd positions both covered: the military factories keep them, the civilian ones keep theirs, every other type goes round them", { af: at(odd, "arms_factory") });
  const even = ask(under([20]));
  ok(at(even, "industrial_complex").every((x) => Math.abs(x - 20) > 1) && at(even, "industrial_complex").length === at(L, "industrial_complex").length
    && JSON.stringify(at(even, "arms_factory")) === JSON.stringify(at(L, "arms_factory")),
    "⭐⭐ one even position covered: the civilian factories go round it on the other even ones, the military ones keep the odd", { ic: at(even, "industrial_complex") });
}

console.log("\n-- ⭐ f. pileOffRunway, pure --");
{
  const pos = positionsOf(J), at = { x: Math.floor(pos.x), row: H - 1 - Math.floor(pos.z), full: pos.spread !== false };
  const own = (q) => stateOf(provAt(q.px, q.row)) === J && provAt(q.px, q.row) !== SEA;
  /** the nearest pixel of the state whose 3x3 is all its land and off the block, ties to the lower row, then x — by brute force */
  const nearest = (b) => {
    let best = null;
    for (let row = 0; row < H; row++) for (let px = 0; px < W; px++) {
      if (!own({ px, row })) continue;
      if (![-1, 0, 1].every((dy) => [-1, 0, 1].every((dx) => own({ px: px + dx, row: row + dy }) && !inBlock(b, { px: px + dx, row: row + dy })))) continue;
      const d = (px - at.x) ** 2 + (row - at.row) ** 2;
      if (!best || d < best.d) best = { px, row, d };
    }
    return best;
  };
  const ask = (b) => md.pileOffRunway({ ex: pos.ex, provinces: STATES[J], at, ownLand: pos.ownLand, runway: b });
  const hit = blockOf({ px: at.x - 2, row: at.row }), clear = blockOf({ px: at.x - 5, row: at.row }), all = { c0: 0, c1: W - 1, r0: 0, r1: H - 1 };
  const want = nearest(hit), got = ask(hit);
  ok(md.stateSlotLayout(pos) === null && at.full && [-1, 0, 1].some((d) => inBlock(hit, { px: at.x + d, row: at.row })) && !!want,
    "(the fixture: a pile with a 3x3 at its anchor, a block over it, and room off it)", { at, want });
  ok(!!got && got.x === want.px && got.row === want.row && got.full === true, "⭐⭐ the pile moves to the nearest 3x3 of the state's land wholly off the block", { got, want });
  ok(ask(clear) === null && ![-1, 0, 1].some((dy) => [-1, 0, 1].some((dx) => inBlock(clear, { px: at.x + dx, row: at.row + dy }))), "⭐ a block clear of the pile's 3x3: it stays (null)");
  ok(ask(all) === null, "⭐ a block over the whole state: no room, it stays (null)");
}

/** drop each of a state's own rows (`pick`) in turn and top the state up: how many come back exactly where they were, and which not.
 *  ⚠️ `spotOnly` (MOVED with ⛔ #a-land-model-is-turned-as-the-base-game-turns-its-own): rows an OLDER Nova wrote stood at 0.00 and a row
 *  written now is turned, so for them the spot is compared — every column but the rotation; the rows written now come back turned as
 *  they were, and are compared whole */
const dropEach = (sid, pick, spotOnly = false) => {
  const full = lines(), out = { n: 0, exact: 0, wrong: [] };
  const key = (x) => { if (!spotOnly) return x; const c = x.split(";"); if (c.length >= 7) c[5] = "*"; return c.join(";"); };
  for (const l of full.filter((x) => { const r = rowOf(x); return r.sid === sid && pick(r); })) {
    out.n++;
    fs.writeFileSync(BUILDINGS, full.filter((x, i) => i !== full.indexOf(l)).join("\n") + "\n");
    const r = md.ensureBuildingSlotsForState({ ...roots, stateId: sid, provinces: STATES[sid] });
    const now = lines();
    if (r && r.added === 1 && JSON.stringify(now.map(key).sort()) === JSON.stringify(full.map(key).sort())) out.exact++;
    else out.wrong.push([l, now.filter((x) => !full.includes(x))]);
    fs.writeFileSync(BUILDINGS, full.join("\n") + "\n");
  }
  return out;
};

console.log("\n-- ⭐ i. a world an older Nova laid out, its runway over a copy no row used: every lost row comes back on its own spot --");
{
  // the province's own rows first (its supply_node, fort and special-project site), then the state's as an older Nova laid them out:
  // stateSlotLayout without the yield, and the air base where its block holds no row of them but covers a copy a position never used
  md.ensureBuildingSlotsForState({ ...roots, stateId: D, provinces: STATES[D], onlyTypes: md.PER_LAND_PROVINCE_BUILDING_SLOTS });
  const pos = positionsOf(D), L0 = md.stateSlotLayout(pos), towns = [...townsOf(D).values()].map(pix);
  const used = L0 ? spotsOf(L0).map((l) => pix({ x: +l.split(";")[1], z: +l.split(";")[2] })) : [];
  let spot = null;
  for (let row = 0; row < H && !spot; row++) for (let px = 0; px < W && !spot; px++) {
    if (stateOf(provAt(px, row)) !== D) continue;
    const b = blockOf({ px, row });
    if (!onMap(b) || used.some((q) => inBlock(b, q)) || towns.some((q) => inBlock(b, q))) continue;
    if (JSON.stringify([...yieldTo(pos, b)]) !== JSON.stringify([...L0])) spot = { px, row };
  }
  ok(!!L0 && !!spot, "(the fixture: a spot whose runway holds none of the rows an older Nova wrote, yet covers a copy of a position — the layout with the yield to it differs)", spot);
  if (spot) {
    const old = [lineAt(D, "air_base", { x: spot.px, z: H - 1 - spot.row })].concat([...L0].filter(([t]) => t !== "air_base").flatMap(([t, l]) => l.map((s) => lineAt(D, t, s))));
    fs.writeFileSync(BUILDINGS, lines().concat(old).join("\n") + "\n");
    const got = dropEach(D, (r) => LAID.includes(r.type), true);
    ok(got.n === old.length - 1 && got.exact === got.n, `⭐⭐ each of its ${got.n} rows dropped in turn comes back on its own spot, never on another row's`, got.wrong.slice(0, 3));
  }
}

console.log("\n-- ⭐ i2. …and so does every row of a state laid out round its runway --");
{
  const got = dropEach(A, (r) => LAID.includes(r.type));
  ok(got.n === LAID.reduce((n, t) => n + md.STATE_BUILDING_SLOTS.find(([u]) => u === t)[1], 0) && got.exact === got.n,
    `⭐⭐ each of the ${got.n} rows of a's state, written round the runway, dropped in turn comes back on its own spot`, got.wrong.slice(0, 3));
}

console.log("\n-- ⭐ j. a pile's lost row comes back off the runway that stands --");
{
  const r = md.ensureBuildingSlotsForState({ ...roots, stateId: J, provinces: STATES[J] });
  const pos = positionsOf(J), at = { px: Math.floor(pos.x), row: H - 1 - Math.floor(pos.z) };
  const air = rowsOf(J).filter((w) => w.type === "air_base"), b = air.length ? blockOf(air[0]) : null;
  const piled = rowsOf(J).filter((w) => LAID.includes(w.type));
  ok(!!r && r.changed && md.stateSlotLayout(pos) === null && !!b && [-1, 0, 1].some((dy) => [-1, 0, 1].some((dx) => inBlock(b, { px: at.px + dx, row: at.row + dy })))
    && piled.length > 0 && piled.every((w) => !inBlock(b, w)),
    "(the fixture: a pile whose runway took a spot over its anchor's 3x3, and whose rows went round it)", { air: air.map((w) => [w.px, w.row]), at });
  // the pile moved off it stands at the height of the ground under its new 3x3's middle — the heightmap gives no two neighbours one height
  const yOf = (p) => md.modelYForHeight(heightOf(p.px, p.row)).toFixed(2);
  // ⚠️ MOVED with #a-small-states-models-are-spread-over-its-land: the moved pile stood at the height of its new 3x3's middle; a pile's
  // rows take spots of their own now, each at the height of its own pixel
  const mid = piled.length ? { px: Math.min(...piled.map((w) => w.px)) + 1, row: Math.min(...piled.map((w) => w.row)) + 1 } : null;
  ok(!!mid && piled.every((w) => w.line.split(";")[3] === yOf(w)) && new Set(piled.map((w) => w.line.split(";")[3])).size > 1, "⭐ the moved pile's rows stand each at the height of its own pixel, not all at its anchor's",
    { mid, at, ys: [...new Set(piled.map((w) => w.line.split(";")[3]))], anchor: yOf(at) });
  // the runway a read would place: stateBuildingAnchor, told of every row that stands (the air base among them), puts another — and a
  // pile moved off THAT one (or left on its anchor, where it is clear of it) would stand its 3x3 under the runway that stands
  const ic = rowsOf(J).find((w) => w.type === "industrial_complex"), full = lines();
  fs.writeFileSync(BUILDINGS, full.filter((l) => !ic || l !== ic.line).join("\n") + "\n");
  const read = positionsOf(J, rowsOf(J).map((w) => ({ x: w.x, z: w.z }))).airfield;
  const readBlock = read && blockOf(pix(read));
  const phantom = readBlock && md.pileOffRunway({ ex: pos.ex, provinces: STATES[J], at: { x: at.px, row: at.row, full: true }, ownLand: pos.ownLand, runway: readBlock });
  const there = phantom ? { px: phantom.x, row: phantom.row } : at;
  ok(!!read && !same(pix(read), air[0]) && [-1, 0, 1].some((dy) => [-1, 0, 1].some((dx) => inBlock(b, { px: there.px + dx, row: there.row + dy }))),
    "(the fixture: the runway a read would place stands elsewhere, and the pile moved off it would stand under the one that stands)", { read: read && pix(read), air: air.map((w) => [w.px, w.row]), there });
  const top = md.ensureBuildingSlotsForState({ ...roots, stateId: J, provinces: STATES[J] });
  const back = rowsOf(J).filter((w) => w.type === "industrial_complex" && (!full.includes(w.line) || (!!ic && w.line === ic.line)));
  ok(!!top && top.added === 1 && back.length === 1 && !inBlock(b, back[0]), "⭐⭐ the lost civilian factory comes back off the runway that stands", back.map((w) => [w.px, w.row]));
  ok(JSON.stringify(lines().slice().sort()) === JSON.stringify(full.slice().sort()), "⭐ …on its own spot: the file holds what it held");
}

console.log("\n-- ⭐ g. a second call adds nothing --");
{
  const before = fs.readFileSync(BUILDINGS, "utf8");
  const again = Object.keys(STATES).map((s) => md.ensureBuildingSlotsForState({ ...roots, stateId: +s, provinces: STATES[s] }));
  ok(again.every((r) => r && r.changed === false) && fs.readFileSync(BUILDINGS, "utf8") === before, "⭐⭐ every state's call again changes nothing", again.filter((r) => !(r && r.changed === false)));
}

try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) { /* scratch only */ }
console.log("\n" + (fail ? "FAILED " + fail + "/" + (pass + fail) : "PASSED " + pass + "/" + pass));
process.exitCode = fail ? 1 : 0;
