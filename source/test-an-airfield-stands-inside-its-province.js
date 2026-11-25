// ⛔ #an-airfield-stands-inside-its-province — A STATE'S AIR BASE ROW STANDS WHERE THE AIRFIELD'S WHOLE MODEL IS ON ONE PROVINCE.
//
// The owner played TEST 32 (10-02) and saw airfields stand over their province's border: Datrer's 44% over the next province of
// its own state, Vobostheth's runway over the sea, Makratis' 3.5%. The air_base row's model (hangar_flight.mesh × 1.4) reaches
// 1.85 px west, 2.72 px east, 1.68 px north and 1.85 px south of its row, and Nova put the row on the town province's neighbour's
// EAST ring point — 1,001 of TEST 32's 1,081 — which buildingSpreadPositions puts as far out as a 3x3 of the state's land allows.
// Nothing in Nova knew how big a model is. The base game's own airfields cross their province 64% of the time, so this is not a
// validator rule and not an Auto-fix mover: it is where Nova's one air_base writer (ensureBuildingSlotsForState) puts a row.
//
// The rule (airfieldSpot): the position the air base has today if its model's block is all that province and CLEAR; else the
// nearest clear pixel of the state's land whose block is all its own province; else the same two with the block all the state's
// land; else, for a pile, the point of its 3x3 whose block is most its own province; else today's spot. A pile tries each of its
// positions first. CLEAR: the block holds no pixel a row of the state stands on — a town point, a row the state already has (its
// ports…; not the air base's own position, which it leaves). The block is the model the mod's layers draw (airfieldReach),
// vanilla's where none is read.
// ⛔ #the-runway-goes-first — NOT the rows the layout is about to write, nor a pile's 3x3: the runway takes its spot first and those
// go round it (test-the-runway-goes-first.js). A row that exists never moves, and a world laid out before this is topped up on the
// spots it already has.
//
// Every expected spot is derived here from the reach and the fixture's rectangles by a brute-force search, never typed in; each case
// asserts the fixture still exercises it first, and each guard of the rule has a case that needs it — the search with that guard
// left out gives another answer there (the review of 10-07 found two guards no case needed: overlapping filters hide each other).
//   A  Datrer      today's spot's 3x3 is its own province, its block's east column the next province: 1 px aside, beside the
//                  position it leaves, where nothing stands
//   A2 the sides   today's spot has one column of its own west of its block and none to spare: it STAYS (a symmetric box moves it)
//   B  Vobostheth  a one-province island: today's block hangs over the sea, the scan finds an inner pixel
//   C  state land  two 4 px provinces side by side: no one province holds a block, the state's land does
//   D  a 2 px strip  nothing fits passes 1–4: pass 5 takes a point of the strip, the other rows keep its one point
//   V  pass 5      a pile with no spot whose anchor's model is not the one most its own province: the point that is
//   E  a pile      the air base leaves it for its first position that fits; every other row stays on the pile
//   N  its port    a naval_base_spawn row the state already has is kept clear of
//   P  the pile    a pile's 3x3 under the runway moves off it where the state has room
//   T  a town point  the next province's town point (its supply_node…) beside the scan's nearest spot
//   S  a step aside  today's block holds a factory row a position steps one pixel aside: the air base keeps today's spot, the row
//                  goes round it
//   X  the edge    a province over the map's seam: past the east edge the bitmap reads on into the next row, its own land again
//   Y  pass 3      a pile whose position's block is all the state's land: preferred to the pixel nearest its anchor
//   M  the model   a mod over a dependency that draws its own airfield: judged by that model (airfieldReach)
//   R  its layers  airfieldReach takes each file as the game does: a file at the same path, replace_path, two definitions, none
//   Q  coast rows  keepClearOf asked of the same read, for rows a caller places beside the air base in the same call
//   G the writer's shape, H the reach re-derived from the installed game, J no other type's spot moves, F rows that exist are
//   never moved, K a world laid out before this is topped up on its own spots, Z no air base over another row, I the source.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-airfield-"));
process.env.APPDATA = path.join(ROOT, "appdata"); process.env.NOVA_APP_DATA_DIR = process.env.APPDATA; process.env.XDG_CONFIG_HOME = process.env.APPDATA;
process.env.NOVA_HOME_DIR = path.join(ROOT, "home");
fs.mkdirSync(process.env.NOVA_HOME_DIR, { recursive: true });
const md = require("./map-data.js");
const { maskJsComments, maskJsLiterals, jsBodyAt } = require("./testlib-strip-comments.js");

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

// ── the fixture: rectangles [x0, y0, x1, y1) on a 128 x 64 sea (province 1), rows top-down ─────────────────────────────────
const W = 128, H = 64, SEA = 1;
const RECT = {
  2: [[4, 4, 16, 16]],     // A: the town province…
  3: [[16, 4, 31, 18]],    // …its nearest neighbour, whose east ring point has one column of its own east of it…
  4: [[31, 4, 47, 18]],    // …and the state's third province, right behind that column
  5: [[52, 4, 66, 16]],    // A2: one province, its Standstill 8 px from its west edge and 5 from its east
  6: [[72, 4, 87, 16]],    // B: a one-province island
  7: [[92, 4, 96, 24]],    // C: two provinces 4 px wide…
  8: [[96, 4, 100, 24]],   // …side by side, the second's Standstill one column from its east edge
  9: [[104, 4, 106, 30]],  // D: a strip 2 px wide between two seas
  10: [[110, 4, 117, 36]], // E: 7 px wide, so only a north and a south ring point: a pile
  11: [[72, 24, 87, 29]],  // N and P: an island 5 px tall, with a port on its south coast; too low for a ring point north or south
  12: [[8, 40, 16, 52]],   // T: the town province…
  13: [[16, 40, 25, 54]],  // …the next, 9 px wide, so its east ring point is 4 px from its town point…
  14: [[25, 40, 40, 54]],  // …and a third behind it
  15: [[116, 40, 128, 52], [0, 38, 3, 54]],   // X: one province over the map's seam — the east edge, and on at the west
  16: [[68, 40, 72, 62]],  // Y: a pile 4 px wide…
  17: [[67, 40, 68, 62]],  // …with a 1 px province along its west side
  18: [[76, 40, 79, 50]],  // S: three provinces 3 px wide side by side
  19: [[79, 40, 82, 53]],
  20: [[82, 40, 85, 56]],
  21: [[88, 30, 90, 34], [88, 34, 89, 37]],   // V: a strip 2 px wide and 4 tall with a 1 px tail below it, which draws its middle down
};
const STATES = { 1: [2, 3, 4], 2: [5], 3: [6], 4: [7, 8], 5: [9], 6: [10], 7: [11], 8: [12, 13, 14], 9: [15], 10: [16, 17], 11: [18, 19, 20], 12: [21] };
const STANDSTILL = { 5: [60, 10], 8: [98, 13], 15: [121, 45], 17: [67, 60] };   // [px, row] — a town point placed where the case needs it
const provAt = (x, y) => { for (const [id, rects] of Object.entries(RECT)) for (const [x0, y0, x1, y1] of rects) if (x >= x0 && x < x1 && y >= y0 && y < y1) return +id; return SEA; };
const stateOf = (p) => +(Object.keys(STATES).find((s) => STATES[s].includes(p)) || 0);
const colour = (id) => [(id * 37) % 256, (id * 71) % 256, 40 + id];
const heightOf = (x, y) => (provAt(x, y) === SEA ? 80 : 96 + ((x * 3 + y * 5) % 120));   // no two neighbours alike, so a row's height says which pixel it was read under
const PORT = { sid: 7, px: 76, row: 28 };                                            // N: on island 11's south coast
const PORT_ROW = `${PORT.sid};naval_base_spawn;${PORT.px}.00;9.50;${H - 1 - PORT.row}.00;0.00;${SEA}`;
const OTHER_ROW = "99;radar_station;1.00;9.50;1.00;0.00;0";                           // a row that is nobody's here
function writeMod(dir, descriptor) {
  write(dir, "descriptor.mod", descriptor);
  write(dir, "map/provinces.bmp", bmp24(W, H, (x, y) => colour(provAt(x, y))));
  write(dir, "map/heightmap.bmp", bmp8(W, H, heightOf));
  write(dir, "map/definition.csv", ["0;0;0;0;land;false;unknown;0", `1;${colour(1).join(";")};sea;false;ocean;0`]
    .concat(Object.keys(RECT).map((id) => `${id};${colour(+id).join(";")};land;false;plains;1`)).join("\n") + "\n");
  write(dir, "map/unitstacks.txt", Object.entries(STANDSTILL).map(([p, [x, row]]) => `${p};0;${x}.00;10.00;${H - 1 - row}.00;0.00;0.00`).join("\n") + "\n");
  for (const [s, provs] of Object.entries(STATES)) {
    write(dir, `history/states/${s}-S.txt`, `state = {\n\tid = ${s}\n\tname = "STATE_${s}"\n\tmanpower = 1000\n\tstate_category = rural\n\tprovinces = { ${provs.join(" ")} }\n\thistory = {\n\t\towner = AAA\n\t}\n}\n`);
  }
  write(dir, "map/buildings.txt", [OTHER_ROW, PORT_ROW].join("\n") + "\n");
}
const mod = path.join(ROOT, "mod");
const roots = { modRoot: mod, gameRoot: path.join(ROOT, "no-game"), dependencyRoots: [] };
writeMod(mod, 'name="airfield"\nreplace_path="history/states"\nreplace_path="map"\n');
const BUILDINGS = path.join(mod, "map", "buildings.txt");

const PER_STATE = md.STATE_BUILDING_SLOTS.map(([t]) => t);
const pix = (t) => ({ px: Math.floor(t.x), row: H - 1 - Math.floor(t.z) });
const cheb = (a, b) => Math.max(Math.abs(a.px - b.px), Math.abs(a.row - b.row));
const rowsIn = (file) => fs.readFileSync(file, "utf8").split(/\r?\n/).filter(Boolean).map((l) => l.split(";")).filter((c) => c.length >= 7)
  .map((c) => { const x = +c[2], z = +c[4], px = Math.floor(x), row = H - 1 - Math.floor(z); return { sid: +c[0], type: c[1], x, y: c[3], z, px, row, rot: c[5], anchor: c[6], cx: c[2], cz: c[4], province: provAt(px, row), line: c.join(";") }; });
const readRows = () => rowsIn(BUILDINGS);
const airOf = (sid, rows = readRows()) => rows.filter((r) => r.sid === sid && r.type === "air_base");
const townPointsOf = (sid, r = roots) => md.stateBuildingAnchor({ ...r, provinces: STATES[sid], each: true });
const spreadOf = (sid, r = roots) => { const a = md.stateBuildingAnchor({ ...r, provinces: STATES[sid], positions: true }) || {}; return { ...a, positions: Array.isArray(a.positions) ? a.positions : [] }; };
/** today's answer: stateSlotLayout as it was, with no airfield — null for a pile */
const todayLayout = (a) => md.stateSlotLayout({ ...a, airfield: null });
const around = (p) => [-1, 0, 1].flatMap((dy) => [-1, 0, 1].map((dx) => ({ px: p.px + dx, row: p.row + dy })));

// ── the airfield's block at a reach (md.AIRFIELD_REACH unless another is given): every pixel the model's box touches from a whole-
//    pixel row (px, row) ──────────────────────────────────────────────────────────────────────────────────────────────────
const REACH = md.AIRFIELD_REACH || { west: 0, east: 0, south: 0, north: 0 };
const blockOf = (p, R = REACH) => {
  const Y = p.row + 1;                                                                  // the row's point, top-down: H - z
  return { c0: Math.floor(p.px - R.west), c1: Math.ceil(p.px + R.east) - 1, r0: Math.floor(Y - R.north), r1: Math.ceil(Y + R.south) - 1 };
};
const pixelsOf = (p, R = REACH) => { const b = blockOf(p, R), out = []; for (let r = b.r0; r <= b.r1; r++) for (let c = b.c0; c <= b.c1; c++) out.push({ px: c, row: r }); return out; };
const onMap = (p, R = REACH) => { const b = blockOf(p, R); return b.c0 >= 0 && b.r0 >= 0 && b.c1 < W && b.r1 < H; };
const blockAll = (p, okId, R = REACH) => onMap(p, R) && pixelsOf(p, R).every((q) => okId(provAt(q.px, q.row)));
/** …and as a read with no bounds sees it: past the east edge the bitmap runs on into the row above's first pixels, past the west
 *  into the row below's last (bottom-up rows) */
const readOn = (q) => (q.row < 0 || q.row >= H ? -1 : q.px >= W ? (q.row - 1 >= 0 ? provAt(q.px - W, q.row - 1) : -1) : q.px < 0 ? (q.row + 1 < H ? provAt(q.px + W, q.row + 1) : -1) : provAt(q.px, q.row));
const blockAllReadOn = (p, okId, R = REACH) => pixelsOf(p, R).every((q) => okId(readOn(q)));
const inBlock = (p, q, R = REACH) => { const b = blockOf(p, R); return q.px >= b.c0 && q.px <= b.c1 && q.row >= b.r0 && q.row <= b.r1; };
const sq = (x) => x * x;
/** airfieldReach's answer, read so that a build without one fails its checks rather than throwing */
const readReach = (r) => (typeof md.airfieldReach === "function" ? md.airfieldReach(r) : null);

/** the rule, searched by brute force over the fixture's own rectangles: { px, row, province, pass }, or null; pass 5's answer
 *  carries `ties`, every point of the pile's 3x3 its count ties with. `o`: R (the reach), keep (the pixels rows that exist stand
 *  on), r (the roots), upTo4 (passes 1–4 only) — and the CONTROLS, each the rule with one guard left out or put back, to show that
 *  a case needs it: noTown, ownToo (the air base's own position kept clear of too), triesUnmasked, noBounds, noPass3, and
 *  layoutRows (⛔ #the-runway-goes-first: the rule as it was, the rows the layout writes and a pile's 3x3 kept clear of as well) */
function expectedSpot(sid, o = {}) {
  const R = o.R || REACH, r = o.r || roots;
  const a = spreadOf(sid, r), P = a.positions, home = a.home, tp = townPointsOf(sid, r), anchor = pix(a);
  const L = todayLayout(a), pile = L === null;
  const idx = P.map((_, i) => i);
  const order = idx.filter((i) => P[i].province !== home).concat(idx.filter((i) => P[i].province === home).sort((i, j) => P[j].d - P[i].d || i - j));
  const tries = (pile ? order : order.slice(0, 1)).map((i) => ({ ...pix(P[i]), province: P[i].province }));
  const ref = pile ? anchor : tries[0];
  // every pixel a row of the state stands on: its town points and the rows that exist
  const rows = !o.layoutRows ? [] : pile ? around(anchor) : [...L].filter(([t]) => t !== "air_base").flatMap(([, l]) => l.map(pix));
  const kept = (o.noTown ? [] : STATES[sid].filter((p) => tp.get(p)).map((p) => pix(tp.get(p))))
    .concat(rows, o.ownToo && !pile ? [pix(P[order[0]])] : [], o.keep || []);
  const clear = (c) => !kept.some((k) => inBlock(c, k, R));
  const fits = (c, okId) => (o.noBounds ? blockAllReadOn(c, okId, R) : blockAll(c, okId, R));
  const cands = [];
  for (let row = 0; row < H; row++) for (let px = 0; px < W; px++) {
    const p = provAt(px, row);
    if (p === SEA || stateOf(p) !== sid || !clear({ px, row })) continue;
    cands.push({ px, row, province: p, d: sq(px - ref.px) + sq(row - ref.row) });
  }
  cands.sort((x, y) => x.d - y.d || x.row - y.row || x.px - y.px);
  const own = (p) => (id) => id === p, land = () => (id) => id !== SEA && stateOf(id) === sid;
  const fromTries = (okOf) => tries.find((t) => (o.triesUnmasked || clear(t)) && fits(t, okOf(t.province)));
  const scan = (okOf) => cands.find((q) => fits(q, okOf(q.province)));
  const passes = [[1, () => fromTries(own)], [2, () => scan(own)], [3, () => fromTries(land)], [4, () => scan(land)]].filter(([n]) => !(o.noPass3 && n === 3));
  for (const [n, f] of passes) { const s = f(); if (s) return { px: s.px, row: s.row, province: s.province, pass: n }; }
  if (!pile || o.upTo4 || o.layoutRows) return null;
  // 5. a pile with no spot: the points of its 3x3 on the state's land whose block holds the most pixels of their own province
  const mine = around(anchor).filter((q) => stateOf(provAt(q.px, q.row)) === sid && provAt(q.px, q.row) !== SEA)
    .map((q) => ({ ...q, province: provAt(q.px, q.row), n: pixelsOf(q, R).filter((b) => b.px >= 0 && b.row >= 0 && b.px < W && b.row < H && provAt(b.px, b.row) === provAt(q.px, q.row)).length }));
  const most = Math.max(...mine.map((q) => q.n)), ties = mine.filter((q) => q.n === most);
  return ties.length ? { px: ties[0].px, row: ties[0].row, province: ties[0].province, pass: 5, ties, n: most } : null;
}
/** whether a row stands where the rule says: on its spot, or, for pass 5, on one of the points that tie for it */
const atRule = (r, w) => !!r && !!w && (w.pass === 5 ? w.ties.some((q) => same(r, q)) : same(r, w));
const same = (r, p) => !!r && !!p && r.px === p.px && r.row === p.row;
/** the rule for a state as its file stands: N's state has a port row */
const ruleOf = (sid, o = {}) => expectedSpot(sid, { ...o, keep: sid === PORT.sid ? [PORT] : [] });
const allOne = (p, R = REACH) => blockAll(p, (id) => id === provAt(p.px, p.row), R);
/** the pixels the state's rows stand on in the file, but its air base's */
const rowPixels = (sid, rows = readRows()) => rows.filter((r) => r.sid === sid && r.type !== "air_base").map((r) => ({ px: r.px, row: r.row, type: r.type }));

console.log("\n-- the block, from md.AIRFIELD_REACH --");
{
  const p = { px: 40, row: 30 }, b = blockOf(p);
  ok(!!md.AIRFIELD_REACH && b.c0 === p.px - 2 && b.c1 === p.px + 2 && b.r0 === p.row - 1 && b.r1 === p.row + 2 && pixelsOf(p).length === 20,
    "the airfield's model covers columns px-2..px+2 and rows row-1..row+2 of a whole-pixel row: 20 px, the 3x3 among them", { REACH: md.AIRFIELD_REACH, b });
  ok(JSON.stringify(readReach(roots)) === JSON.stringify(md.AIRFIELD_REACH), "a mod whose layers draw no airfield of their own is judged by vanilla's reach", readReach(roots));
}

console.log("\n-- H. the reach, re-derived from the installed game --");
{
  const GAME = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
  const ASSET = path.join(GAME, "gfx", "entities", "buildings.asset"), GFX = path.join(GAME, "gfx", "entities", "buildings.gfx");
  if (!fs.existsSync(ASSET) || !fs.existsSync(GFX)) console.log("  ..   SKIP: the base game is not installed at the expected path, so the reach is not re-derived");
  else {
    // the entity's own block, its nested blocks (locators, states) blanked so a scale inside one cannot answer
    const asset = fs.readFileSync(ASSET, "latin1"), at = asset.indexOf('name = "building_air_base"'), open = asset.lastIndexOf("{", at);
    let d = 0, end = open, top = "";
    for (let k = open; k < asset.length; k++) { const c = asset[k]; if (c === "{") d++; if (d === 1 && c !== "{") top += c; if (c === "}" && --d === 0) { end = k; break; } }
    const mesh = (/\bpdxmesh\s*=\s*"([^"]+)"/.exec(top) || [])[1], scale = +((/\bscale\s*=\s*([0-9.]+)/.exec(top) || [])[1]);
    ok(at > 0 && !!mesh && scale > 0 && !/\battach\s*=/.test(asset.slice(open, end)), "(buildings.asset: building_air_base names its pdxmesh and a scale, and attaches nothing)", { mesh, scale });
    const gfx = fs.readFileSync(GFX, "latin1"), m = new RegExp(`name\\s*=\\s*"${mesh}"\\s*file\\s*=\\s*"([^"]+)"`).exec(gfx);
    const buf = m ? fs.readFileSync(path.join(GAME, m[1])) : Buffer.alloc(0);
    // a .mesh property: '!' <name length> <name> <type> <int32 count> <data> — the aabb is the float triples "min" and "max"
    const floats = (name) => {
      const out = [], needle = Buffer.concat([Buffer.from([0x21, name.length]), Buffer.from(name + "f", "latin1")]);
      for (let i = buf.indexOf(needle); i !== -1; i = buf.indexOf(needle, i + needle.length)) {
        const n = buf.readInt32LE(i + needle.length), v = [];
        for (let k = 0; k < n; k++) v.push(buf.readFloatLE(i + needle.length + 4 + 4 * k));
        out.push(v);
      }
      return out;
    };
    const mins = floats("min"), maxs = floats("max");
    ok(!!m && mins.length === 1 && maxs.length === 1 && mins[0].length === 3 && maxs[0].length === 3, `(buildings.gfx gives ${mesh} a mesh file with one aabb)`, { file: m && m[1], mins, maxs });
    if (mins.length === 1 && maxs.length === 1) {
      const up = (v) => Math.ceil(100 * Math.abs(v) * scale) / 100;
      const derived = { west: up(mins[0][0]), east: up(maxs[0][0]), south: up(mins[0][2]), north: up(maxs[0][2]) };
      ok(JSON.stringify(derived) === JSON.stringify(md.AIRFIELD_REACH), "⭐⭐ md.AIRFIELD_REACH is the model's aabb × its entity scale, rounded up to the hundredth: west -x, east +x, south -z, north +z", { derived, AIRFIELD_REACH: md.AIRFIELD_REACH });
      const read = readReach({ modRoot: mod, gameRoot: GAME, dependencyRoots: [] });
      ok(JSON.stringify(read) === JSON.stringify(derived), "⭐⭐ …and airfieldReach reads the same off the installed game, entity to mesh", { read, derived });
    }
  }
}

console.log(`\n-- Auto-fix's slot pass furnishes all ${Object.keys(STATES).length} states --`);
const fixed = md.fixStatesWithoutBuildingSlots(roots);
ok(fixed && fixed.fixed === Object.keys(STATES).length && !(fixed.failed || []).length, `fixStatesWithoutBuildingSlots gave each of the ${Object.keys(STATES).length} states its rows`, fixed);
const all = readRows();
ok(Object.keys(STATES).every((s) => airOf(+s, all).length === 1), "each has one air_base row", Object.keys(STATES).map((s) => airOf(+s, all).length));

console.log("\n-- ⭐ A. Datrer: today's 3x3 is its own province, its block's east column is the state's next province --");
{
  const a = spreadOf(1), L = todayLayout(a), today = L && pix(L.get("air_base")[0]), [, B, C] = STATES[1];
  ok(!!today && provAt(today.px, today.row) === B && [-1, 0, 1].every((d) => provAt(today.px + d, today.row) === B && provAt(today.px, today.row + d) === B && provAt(today.px + 1, today.row + d) === B && provAt(today.px - 1, today.row + d) === B)
    && provAt(today.px + 2, today.row) === C && stateOf(C) === 1,
  `(the fixture: today's spot is province ${B}'s, its 3x3 all ${B}, and the column 2 px east is province ${C} of the same state)`, today);
  const want = expectedSpot(1), air = airOf(1, all)[0];
  ok(!!want && want.pass === 2 && same(air, want), "⭐⭐ the air base stands on the nearest clear pixel whose block is all one province", { air: air && [air.px, air.row], want });
  ok(!!air && allOne(air) && !same(air, today) && air.province === B, `⭐⭐ its whole block is province ${B}'s, and it is not today's spot`, air && { at: [air.px, air.row], today });
  // ⛔ the position it leaves holds no row once it leaves (stateSlotLayout's rest leaves it out): keeping clear of it as well sends
  // the air base further and leaves more of them crossing (vanilla's geometry 44 → 59)
  const ownToo = expectedSpot(1, { ownToo: true });
  ok(!!air && cheb(air, today) === 1 && !!ownToo && !same(ownToo, want) && cheb(ownToo, today) > 1, "⭐⭐ …one pixel from the position it left: nothing stands there to keep clear of", { air: air && [air.px, air.row], today, ownToo });
}

console.log("\n-- ⭐ A2. the model reaches 1.85 px west, not 2.72: a spot with one column of its own to the west stays --");
{
  const a = spreadOf(2), L = todayLayout(a), today = L && pix(L.get("air_base")[0]), pid = STATES[2][0];
  ok(!!today && provAt(today.px - 2, today.row) === pid && provAt(today.px - 3, today.row) !== pid && [1, 2, 3].every((d) => provAt(today.px + d, today.row) === pid) && allOne(today),
    "(the fixture: today's spot has its own province 2 px west and not 3, and 3 columns of it east; its block is all that province)", today);
  const air = airOf(2, all)[0];
  ok(same(air, today) && same(air, expectedSpot(2)), "⭐⭐ the air base stays on today's spot — a box as wide west as east would have moved it", { air: air && [air.px, air.row], today });
}

console.log("\n-- ⭐ B. Vobostheth: a one-province island whose air base's runway hung over the sea --");
{
  const a = spreadOf(3), L = todayLayout(a), today = L && pix(L.get("air_base")[0]), pid = STATES[3][0];
  const inner = []; for (let row = 0; row < H; row++) for (let px = 0; px < W; px++) if (provAt(px, row) === pid && allOne({ px, row })) inner.push({ px, row });
  ok(!!today && !blockAll(today, (id) => id === pid) && pixelsOf(today).some((q) => provAt(q.px, q.row) === SEA) && inner.length > 0,
    "(the fixture: today's block reaches the sea, and the island has pixels whose block is all of it)", { today, inner: inner.length });
  const want = expectedSpot(3), air = airOf(3, all)[0];
  ok(!!want && want.pass === 2 && same(air, want), "⭐⭐ the air base stands on the nearest pixel whose block is all the island", { air: air && [air.px, air.row], want });
  const under = air ? rowPixels(3, all).filter((q) => inBlock(air, q)) : [{}];
  ok(under.length === 0, "⭐⭐ …and its block holds no row of the state: its town point, every position the layout writes on and each copy stepped aside", under);
}

console.log("\n-- ⭐ C. two provinces 4 px wide: no one province holds the model, the state's land does --");
{
  const [p7, p8] = STATES[4], a = spreadOf(4), L = todayLayout(a), today = L && pix(L.get("air_base")[0]), b = blockOf({ px: 0, row: 0 });
  ok([p7, p8].every((p) => RECT[p][0][2] - RECT[p][0][0] < b.c1 - b.c0 + 1) && !!today && pixelsOf(today).some((q) => provAt(q.px, q.row) === SEA),
    "(the fixture: each province is narrower than the block, and today's block reaches the sea)", { today });
  const want = expectedSpot(4), air = airOf(4, all)[0];
  ok(!!want && want.pass === 4 && same(air, want), "⭐⭐ the air base stands on the nearest clear pixel whose block is all the state's land", { air: air && [air.px, air.row], want });
  const under = air ? new Set(pixelsOf(air).map((q) => provAt(q.px, q.row))) : new Set();
  ok(under.size === 2 && under.has(p7) && under.has(p8), `⭐ …across both its provinces, ${p7} and ${p8}, and nowhere else`, [...under]);
}

console.log("\n-- D. a 2 px strip: no spot for the model by passes 1–4; pass 5 takes a point of the strip, the other rows keep its one --");
{
  const a = spreadOf(5), rows = readRows().filter((r) => r.sid === 5 && PER_STATE.includes(r.type) && r.type !== "air_base"), air = airOf(5, all)[0];
  // ⚠️ MOVED with ⛔ #the-runway-goes-first: the air base stayed on the pile's point with every other row (airfieldSpot answered null);
  // pass 5 answers a pile now, and in a strip with no 3x3 of its land the other rows have nowhere to go round it (pileOffRunway)
  ok(a.positions.length === 0 && expectedSpot(5, { upTo4: true }) === null && !!a.airfield && a.airfield.pass === 5, "(nothing fits passes 1–4: no position, and no pixel whose block is the state's land)", a.airfield);
  ok(atRule(air, expectedSpot(5)), "⭐⭐ the air base stands on pass 5's point: of the strip's 3x3 at its anchor, one whose model is most its own province", { air: air && [air.px, air.row], want: expectedSpot(5) });
  // ⚠️ MOVED with #a-small-states-models-are-spread-over-its-land: the other rows stayed on the strip's one point; a pile's rows take
  // spots of their own over the state's land now, every one still on the strip
  ok(rows.length > 0 && rows.every((r) => STATES[5].includes(provAt(r.px, r.row))), "⭐ every other row stays on the strip", rows.map((r) => [r.type, r.px, r.row]).slice(0, 3));
}

console.log("\n-- ⭐ V. pass 5: a pile with no spot takes the point of its 3x3 whose model is most its own province, not its anchor --");
{
  const sid = 12, a = spreadOf(sid), anchor = pix(a), want = expectedSpot(sid), air = airOf(sid, all)[0];
  const atAnchor = want && want.ties ? want.ties.some((q) => same(q, anchor)) : true;
  ok(todayLayout(a) === null && expectedSpot(sid, { upTo4: true }) === null && !!want && want.pass === 5 && !atAnchor,
    "(the fixture: a pile no pass 1–4 places, whose anchor's model is not one of those most its own province)", { anchor, want });
  ok(!!a.airfield && a.airfield.pass === 5 && atRule(air, want), "⭐⭐ the air base stands on the point whose model holds the most of its own province", { air: air && [air.px, air.row], want });
}

console.log("\n-- ⭐ E. a pile: the air base leaves it for its first position that fits, the other rows stay --");
{
  const a = spreadOf(6), anchor = pix(a), rows = readRows().filter((r) => r.sid === 6 && PER_STATE.includes(r.type));
  ok(todayLayout(a) === null && a.positions.length > 0, "(the fixture: too thin to spread over — a pile — with positions of its own)", a.positions.length);
  const want = expectedSpot(6), air = airOf(6, all)[0];
  ok(!!want && want.pass === 1 && same(air, want) && cheb(air, anchor) > 1, "⭐⭐ the air base stands on the first of its positions whose block is all its province, off the pile", { air: air && [air.px, air.row], want, anchor });
  // ⚠️ MOVED with #a-small-states-models-are-spread-over-its-land: the other rows stayed in the 3x3 at the anchor; a pile's rows take
  // spots of their own over the state's land now, none under the runway where the land has room
  ok(rows.filter((r) => r.type !== "air_base").every((r) => STATES[6].includes(provAt(r.px, r.row)) && !inBlock(air, r)), "⭐ every other row stays on the state's own land, none under the runway",
    rows.filter((r) => r.type !== "air_base" && (!STATES[6].includes(provAt(r.px, r.row)) || inBlock(air, r))).map((r) => [r.type, r.px, r.row]));
}

console.log("\n-- ⭐ N. the port the state already has is kept clear of --");
{
  const port = readRows().find((r) => r.sid === PORT.sid && r.type === "naval_base_spawn");
  const nearSea = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => provAt(PORT.px + dx, PORT.row + dy) === SEA);
  const without = expectedSpot(PORT.sid);
  ok(!!port && stateOf(provAt(PORT.px, PORT.row)) === PORT.sid && nearSea && !!without && inBlock(without, PORT),
    "(the fixture: the port row stands on the state's coast, and the spot the rule would take with no port there has it under the model)", { without });
  // asked with no rows to keep clear of, as Generate land asks before Auto-fix has written any port: two spots stand equally near
  // the anchor, 4 px east and 4 px west, and the tie goes to the upper row, then the lower x
  const noPort = spreadOf(PORT.sid).airfield, anchor = pix(spreadOf(PORT.sid)), twin = without && { px: 2 * anchor.px - without.px, row: without.row };
  ok(!!noPort && same(pix(noPort), without) && !!twin && allOne(twin) && sq(twin.px - anchor.px) === sq(without.px - anchor.px) && without.px < twin.px,
    "⭐ with no port, of two spots equally near the anchor the air base takes the western one", { noPort: noPort && pix(noPort), without, twin });
  const want = expectedSpot(PORT.sid, { keep: [PORT] }), air = airOf(PORT.sid, all)[0];
  ok(!!want && same(air, want) && !same(air, without) && !inBlock(air, PORT), "⭐⭐ the air base stands on the nearest spot clear of the port too", { air: air && [air.px, air.row], want, without });
}

// ⚠️ MOVED with ⛔ #the-runway-goes-first: "a pile's own 3x3 is kept clear of" — the runway stood off the pile wherever it could, and
// found no spot at all in a pile that filled its province. The runway takes its spot first now and the pile goes round it.
console.log("\n-- ⭐ P. a pile's 3x3 under the runway moves off it, where the state has room --");
{
  const a = spreadOf(PORT.sid), anchor = pix(a), want = expectedSpot(PORT.sid, { keep: [PORT] }), was = expectedSpot(PORT.sid, { keep: [PORT], layoutRows: true });
  const air = airOf(PORT.sid, all)[0], rows = all.filter((r) => r.sid === PORT.sid && PER_STATE.includes(r.type) && r.type !== "air_base");
  ok(todayLayout(a) === null && !!want && same(air, want) && around(anchor).some((q) => inBlock(want, q)) && !!was && !same(was, want),
    "(the fixture: a pile, the runway's spot over its 3x3 at the anchor — a spot the rule kept off when the pile's 3x3 was masked)", { want, was, anchor });
  const centre = rows.length ? { px: Math.round(rows.reduce((s, r) => s + r.px, 0) / rows.length), row: Math.round(rows.reduce((s, r) => s + r.row, 0) / rows.length) } : null;
  ok(rows.length > 0 && rows.every((r) => !inBlock(air, r)), "⭐⭐ none of the pile's rows stands under the runway", rows.filter((r) => inBlock(air, r)).map((r) => [r.type, r.px, r.row]));
  // ⚠️ MOVED with #a-small-states-models-are-spread-over-its-land: they stood in a 3x3 of the state's land off the anchor's; a pile's
  // rows take spots of their own over the state's land now
  ok(!!centre && rows.every((r) => stateOf(r.province) === PORT.sid && stateOf(provAt(r.px, r.row)) === PORT.sid), "⭐ …they stand on the state's own land", { centre, anchor });
}

console.log("\n-- ⭐ T. the next province's town point, beside the scan's nearest spot, is kept clear of --");
{
  const sid = 8, [, B] = STATES[sid], tp = townPointsOf(sid), T = pix(tp.get(B)), want = expectedSpot(sid), noTown = expectedSpot(sid, { noTown: true });
  ok(!!want && !!noTown && !same(noTown, want) && inBlock(noTown, T) && provAt(noTown.px, noTown.row) === B,
    `(the fixture: with the town points left out the rule would stand the runway over province ${B}'s town point — its supply_node row and its Standstill)`, { noTown, want, T });
  const air = airOf(sid, all)[0];
  ok(!!want && want.pass === 2 && same(air, want) && !inBlock(air, T), "⭐⭐ the air base's block holds no town point", { air: air && [air.px, air.row], want, T });
  ok(!!air && airOf(sid, all).length === 1 && rowPixels(sid, all).filter((q) => q.type === "supply_node").length === STATES[sid].length
    && rowPixels(sid, all).filter((q) => q.type === "supply_node").every((q) => !inBlock(air, q)), "⭐ …nor any of the state's supply_node rows, which stand on them");
}

// ⚠️ MOVED with ⛔ #the-runway-goes-first: "the air base leaves today's spot for the nearest whose block holds no row of the layout" —
// the runway kept off every row the layout was about to write, its stepped copies too, and that order is what left it no spot in a
// full province. The runway keeps today's spot now, and the row goes round it.
console.log("\n-- ⭐ S. a factory row stepped one pixel aside of a position, under today's runway: the runway stays, the row goes round it --");
{
  const sid = 11, a = spreadOf(sid), L = todayLayout(a), today = L && pix(L.get("air_base")[0]);
  const want = expectedSpot(sid), was = expectedSpot(sid, { layoutRows: true });
  const copies = L ? [...L].filter(([t]) => t !== "air_base").flatMap(([t, l]) => l.map((s) => ({ t, ...pix(s) }))) : [];
  const stepped = copies.filter((q) => !a.positions.some((p) => same(pix(p), q)));
  ok(!!L && !!was && !same(was, today) && stepped.some((q) => inBlock(today, q)) && !a.positions.some((p) => !same(pix(p), today) && inBlock(today, pix(p))),
    "(the fixture: today's block holds a row stepped aside from the next position, and no position itself — the old rule moved the runway off it)", { today, was, under: stepped.filter((q) => inBlock(today, q)) });
  const air = airOf(sid, all)[0], rows = rowPixels(sid, all);
  ok(!!want && same(want, today) && same(air, want), "⭐⭐ the air base keeps today's spot", { air: air && [air.px, air.row], want, today });
  ok(rows.length > 0 && !rows.some((q) => inBlock(air, q)), "⭐⭐ …and no row of the layout stands under it: the stepped row went round it", rows.filter((q) => inBlock(air, q)));
}

console.log("\n-- ⭐ X. a province over the map's seam: the block may not run past the east edge --");
{
  const sid = 9, pid = STATES[sid][0], a = spreadOf(sid), L = todayLayout(a), today = L && pix(L.get("air_base")[0]), b = today && blockOf(today);
  ok(!!b && b.c1 >= W && blockAllReadOn(today, (id) => id === pid) && provAt(0, today.row) === pid,
    "(the fixture: today's block runs past the east edge, and a read with no bounds finds the province's own land there — it goes on at the west edge)", { today, b });
  const want = expectedSpot(sid), noBounds = expectedSpot(sid, { noBounds: true }), air = airOf(sid, all)[0];
  ok(!!noBounds && same(noBounds, today) && !!want && !same(want, today), "(…so with no bounds the rule would keep it)", { noBounds, want });
  ok(same(air, want) && !!air && onMap(air) && allOne(air), "⭐⭐ the air base stands where its whole block is on the map, and its province", { air: air && [air.px, air.row], want });
}

console.log("\n-- ⭐ Y. pass 3: a pile whose position's block is all the state's land is preferred to the pixel nearest its anchor --");
{
  const sid = 10, a = spreadOf(sid), want = expectedSpot(sid), noPass3 = expectedSpot(sid, { noPass3: true }), air = airOf(sid, all)[0];
  ok(todayLayout(a) === null && !!want && want.pass === 3 && !!noPass3 && !same(noPass3, want) && a.positions.some((p) => same(pix(p), want)),
    "(the fixture: a pile, no spot whose block is one province, and one of its positions whose block is all the state's land)", { want, noPass3 });
  ok(same(air, want), "⭐⭐ the air base stands on that position, off the pile, its block across the state's two provinces", { air: air && [air.px, air.row], want });
}

console.log("\n-- ⭐ G. the writer's shape --");
{
  const air = Object.keys(STATES).map((s) => airOf(+s, all)[0]).filter(Boolean);
  // ⚠️ MOVED with ⛔ #a-land-model-is-turned-as-the-base-game-turns-its-own: "rotation 0.00 … the shape onTheSeaFloor knows Nova's rows by"
  // — every land row is turned now, as the base game turns its own, where its model fits as at 0 (that writer's own test pins where);
  // onTheSeaFloor's shape is that of worlds written before 6a1fd27, and a row Generate land writes now is re-seated in its own click
  ok(air.length === Object.keys(STATES).length && air.every((r) => /^\d+\.\d\d$/.test(r.rot) && +r.rot >= 0 && +r.rot <= 6.28 && r.anchor === "0" && /^\d+\.00$/.test(r.cx) && /^\d+\.00$/.test(r.cz)),
    "⭐⭐ every air_base row has a rotation of 2 decimals in [0, 6.28], anchor 0 and a whole-pixel x and z", air.map((r) => r.line));
  ok(air.every((r) => r.y === md.modelYForHeight(heightOf(r.px, r.row)).toFixed(2)), "⭐ …and the height of the ground under its own pixel", air.filter((r) => r.y !== md.modelYForHeight(heightOf(r.px, r.row)).toFixed(2)).map((r) => r.line));
}

console.log("\n-- ⭐ Z. no air base the rule placed stands over another row of its state --");
{
  // ⚠️ MOVED with ⛔ #the-runway-goes-first: passes 1–4 only — pass 5 places a pile's runway clear or not, and a pile with no room
  // round it (D's strip) keeps its rows under it; pass 5 is pinned by D and V
  const placed = Object.keys(STATES).map(Number).filter((s) => !!spreadOf(s).airfield && spreadOf(s).airfield.pass <= 4);
  const fifth = Object.keys(STATES).map(Number).filter((s) => !!spreadOf(s).airfield && spreadOf(s).airfield.pass === 5);
  const over = placed.map((s) => { const air = airOf(s, all)[0]; return [s, rowPixels(s, all).filter((q) => inBlock(air, q)).map((q) => q.type)]; }).filter(([, t]) => t.length);
  ok(placed.length + fifth.length === Object.keys(STATES).length && fifth.join() === "5,12" && over.length === 0,
    `⭐⭐ in all ${placed.length} states with a spot by passes 1–4, the airfield's block holds none of the state's rows in the file`, { over, fifth });
  const each = Object.keys(STATES).map(Number).map((s) => [s, ruleOf(s), airOf(s, all)[0]]).filter(([, w, air]) => (w ? !atRule(air, w) : false));
  ok(each.length === 0, "⭐ …and every state's air base is the rule's answer", each.map(([s, w, air]) => [s, w, air && [air.px, air.row]]));
}

console.log("\n-- ⭐ J. no other type's spot moves --");
{
  const diffs = [];
  let laid = 0;
  for (const s of Object.keys(STATES).map(Number)) {
    const a = spreadOf(s), now = md.stateSlotLayout(a), then = todayLayout(a);
    if ((now === null) !== (then === null)) { diffs.push([s, "pile?"]); continue; }
    if (!now) continue;
    laid++;
    for (const t of PER_STATE) if (t !== "air_base" && JSON.stringify(now.get(t)) !== JSON.stringify(then.get(t))) diffs.push([s, t]);
  }
  ok(laid > 0 && diffs.length === 0,
    `⭐⭐ in all ${laid} laid-out states, every type but air_base has the same spots with the airfield as without it`, diffs);
  const moved = Object.keys(STATES).filter((s) => { const a = spreadOf(+s), now = md.stateSlotLayout(a), then = todayLayout(a); return now && JSON.stringify(now.get("air_base")) !== JSON.stringify(then.get("air_base")); });
  ok(moved.length > 0, "…CONTROL: and the air base's does move in some of them, so the comparison can see a change", moved);
}

console.log("\n-- ⭐ Q. keepClearOf asked of the same read: rows a caller places beside the air base in the same call --");
{
  // the shape Generate land's coast rows take (coastSlotPositions, on stateBuildingAnchor's own read): here EVERY coastal pixel of
  // the island holds a row, read off the bitmap the function is handed
  const sid = 3, pid = STATES[sid][0], seen = [];
  const coast = (read) => {
    seen.push(read);
    const out = [], b = read && read.ex && read.ex.box.get(pid);
    if (!b || typeof read.typeOf !== "function") return out;
    for (let row = b.minY; row <= b.maxY; row++) for (let px = b.minX; px <= b.maxX; px++) {
      if (read.ex.pidAt(px, row) !== pid) continue;
      if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => read.typeOf(read.ex.pidAt(px + dx, row + dy)) === "sea")) out.push({ x: px, z: H - 1 - row });
    }
    return out;
  };
  const a = md.stateBuildingAnchor({ ...roots, provinces: STATES[sid], positions: true, keepClearOf: coast }) || {};
  const r = seen[0] || {}, T = pix(townPointsOf(sid).get(pid));
  const shore = []; for (let row = 0; row < H; row++) for (let px = 0; px < W; px++) if (provAt(px, row) === pid && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => provAt(px + dx, row + dy) === SEA)) shore.push({ px, row });
  ok(seen.length === 1 && !!r.ex && r.ex.pidAt(T.px, T.row) === pid && r.typeOf(SEA) === "sea" && r.typeOf(pid) === "land" && r.home === pid && r.townPoints instanceof Map && r.townPoints.has(pid),
    "⭐ the function is asked once, of the read the answer stands on: its bitmap, the provinces' types, the town province and the town points", { calls: seen.length, home: r.home });
  const plain = expectedSpot(sid), want = expectedSpot(sid, { keep: shore });
  ok(!!plain && shore.some((q) => inBlock(plain, q)) && !!want && !same(want, plain), "(the fixture: with no coast rows the air base's block holds some of the coast)", { plain, want });
  ok(!!a.airfield && same(pix(a.airfield), want) && !shore.some((q) => inBlock(pix(a.airfield), q)), "⭐⭐ the air base stands on the nearest spot whose block holds none of the rows the function names", { got: a.airfield && pix(a.airfield), want });
}

console.log("\n-- ⭐ F. rows that exist are never moved, a crossing air base among them --");
{
  const a = spreadOf(3), today = pix(todayLayout(a).get("air_base")[0]);
  const lines = fs.readFileSync(BUILDINGS, "utf8").split("\n");
  const at = lines.findIndex((l) => l.startsWith("3;air_base;"));
  lines[at] = `3;air_base;${today.px}.00;${md.modelYForHeight(heightOf(today.px, today.row)).toFixed(2)};${H - 1 - today.row}.00;0.00;0`;
  fs.writeFileSync(BUILDINGS, lines.join("\n"));
  const before = fs.readFileSync(BUILDINGS, "utf8");
  ok(!allOne(today), "(the fixture: state 3's air base now stands on today's spot, its block over the sea)", today);
  const again = md.ensureBuildingSlotsForState({ ...roots, stateId: 3, provinces: STATES[3] });
  ok(again && again.changed === false && fs.readFileSync(BUILDINGS, "utf8") === before, "⭐⭐ ensureBuildingSlotsForState leaves the state exactly as it is", again);
  const pass2 = md.fixStatesWithoutBuildingSlots(roots);
  ok(pass2 && !pass2.fixed && fs.readFileSync(BUILDINGS, "utf8") === before, "⭐⭐ …and so does Auto-fix's slot pass: not a byte of the file changes", pass2);
}

console.log("\n-- ⭐ K. a world laid out before the airfield moved is topped up on its own spots --");
{
  // state 1's own rows as an older Nova wrote them: stateSlotLayout with no airfield, each at the height of the ground under it
  const a = spreadOf(1), L = todayLayout(a), today = pix(L.get("air_base")[0]);
  const rowOf = (t, s) => { const p = pix(s); return `1;${t};${s.x.toFixed(2)};${md.modelYForHeight(heightOf(p.px, p.row)).toFixed(2)};${s.z.toFixed(2)};0.00;0`; };
  const own = (l) => l.split(";")[0] === "1" && PER_STATE.includes(l.split(";")[1]);
  const oldOwn = PER_STATE.flatMap((t) => L.get(t).map((s) => rowOf(t, s))), sorted = (t) => t.split(/\r?\n/).filter(Boolean).sort().join("\n");
  const nowOwn = fs.readFileSync(BUILDINGS, "utf8").split(/\r?\n/).filter(own);
  const lines = fs.readFileSync(BUILDINGS, "utf8").split(/\r?\n/).filter(Boolean).filter((l) => !own(l)).concat(oldOwn);
  const at = lines.findIndex((l) => l.startsWith("1;air_base;")), old = lines.join("\n") + "\n";
  const ic = lines.filter((l) => l.startsWith("1;industrial_complex;"));
  ok(ic.length === md.STATE_BUILDING_SLOTS.find(([t]) => t === "industrial_complex")[1] && !allOne(today) && lines[at] === rowOf("air_base", L.get("air_base")[0]),
    "(the fixture: state 1 as an older Nova laid it out — its air base on today's spot, over the next province)", today);
  // ⚠️ MOVED with ⛔ #a-land-model-is-turned-as-the-base-game-turns-its-own: a row is compared by WHERE it stands (all but its rotation,
  // column 6): the rows written now are turned, an older Nova's were at 0.00, and these two checks were always about the spot
  const spotOf = (l) => { const c = l.split(";"); c[5] = "*"; return c.join(";"); };
  const spots = (t) => sorted(t.split(/\r?\n/).filter(Boolean).map(spotOf).join("\n"));
  // ⚠️ MOVED with ⛔ #a-state-building-keeps-off-the-factory-spots: a row whose layout spot is on a position another row took first (the
  // layout's `shared`) takes a spot of its own over the state's land now, off the factories — so those are set aside here, and every
  // other row is still where an older Nova wrote it
  // ⚠️ MOVED with ⛔ #a-factorys-copy-stands-on-a-spot-of-its-own: set aside per ENTRY, not per type — a factory's copy is marked too,
  // and setting its whole type aside left 0 factories in the check; every unmarked entry's row must still stand where it stood
  const sharedTypes = new Set(L.shared ? [...L.shared].filter(([, sh]) => sh.some(Boolean)).map(([t]) => t) : []);
  const plainOld = PER_STATE.filter((t) => t !== "air_base").flatMap((t) => L.get(t).filter((_, k) => !((L.shared && L.shared.get(t)) || [])[k]).map((s) => spotOf(rowOf(t, s))));
  const nowSpots = nowOwn.map(spotOf), left = nowSpots.slice();
  const missingOld = plainOld.filter((s) => { const i = left.indexOf(s); if (i < 0) return true; left.splice(i, 1); return false; });
  ok(!missingOld.length && 2 * plainOld.length > PER_STATE.filter((t) => t !== "air_base").reduce((n, t) => n + L.get(t).length, 0) && plainOld.some((s) => s.startsWith("1;industrial_complex;")) && plainOld.some((s) => s.startsWith("1;arms_factory;")),
    "⭐⭐ the fix wrote every one of state 1's other own rows exactly where an older Nova did — all but the ones on spots of their own (entries of " + [...sharedTypes].join(", ") + "), " + plainOld.length + " rows, more than half the template's, factories among them", missingOld);
  fs.writeFileSync(BUILDINGS, lines.filter((l) => l !== ic[ic.length - 1]).join("\n") + "\n");
  const top = md.ensureBuildingSlotsForState({ ...roots, stateId: 1, provinces: STATES[1] });
  ok(top && top.added === 1 && spots(fs.readFileSync(BUILDINGS, "utf8")) === spots(old), "⭐⭐ a lost industrial_complex row comes back on the very spot it had: the file holds what it held, but for the row's own turn", { top, back: readRows().filter((r) => r.sid === 1 && r.type === "industrial_complex").map((r) => [r.px, r.row]) });
  fs.writeFileSync(BUILDINGS, lines.filter((l, i) => i !== at).join("\n") + "\n");
  const back = md.ensureBuildingSlotsForState({ ...roots, stateId: 1, provinces: STATES[1] });
  const air = airOf(1)[0], others = readRows().filter((r) => r.sid === 1 && r.type !== "air_base");
  ok(back && back.added === 1 && same(air, expectedSpot(1)), "a lost air_base row comes back where the airfield fits", { back, air: air && [air.px, air.row] });
  ok(!!air && others.length > 0 && others.every((r) => !inBlock(air, r)), "⭐⭐ …and its model stands on no other row of the state", others.filter((r) => air && inBlock(air, r)).map((r) => [r.type, r.px, r.row]));
}

// ── a dependency that draws its own airfield, as Old World Blues does: its own gfx/entities/buildings.asset (the same path, so it
//    replaces the game's file) names another pdxmesh, defined in a .gfx under gfx/models with a scale of its own ────────────────
const DEP_MESH = { min: [-2.2, 0, -1.0], max: [0.6, 1.0, 1.0] }, DEP_SCALE = { entity: 1.0, mesh: 1.25 };
const writeDepModel = (dir, name) => {
  write(dir, "gfx/entities/buildings.asset", `entity = {\n\tname = "building_air_base"\n\tpdxmesh = "${name}"\n\tscale = ${DEP_SCALE.entity.toFixed(1)}\n\tlocator = { name = "damage_locator_01" position = { 1.35 0.0 -0.35 } scale = 9 }\n}\n`);
  write(dir, `gfx/models/${name}/${name}.gfx`, `objectTypes = {\n\tpdxmesh = {\n\t\tname = "${name}"\n\t\tfile = "gfx/models/${name}/hangar.mesh"\n\t\tscale = ${DEP_SCALE.mesh}\n\t}\n}\n`);
  write(dir, `gfx/models/${name}/hangar.mesh`, meshFile(DEP_MESH.min, DEP_MESH.max));
};
/** the reach a mesh at two scales gives, from the float32 the file holds — the same arithmetic the game's model is read with */
const reachOf = (m, scale) => { const up = (v) => Math.ceil(100 * Math.max(0, Math.fround(v)) * scale) / 100; return { west: up(-m.min[0]), east: up(m.max[0]), south: up(-m.min[2]), north: up(m.max[2]) }; };

console.log("\n-- ⭐ M. a mod over a dependency that draws its own airfield is judged by that model --");
{
  const dep = path.join(ROOT, "dep"), mod2 = path.join(ROOT, "mod2");
  write(dep, "descriptor.mod", 'name="dep"\n');
  writeDepModel(dep, "dep_hangar");
  writeMod(mod2, 'name="airfield2"\nreplace_path="history/states"\nreplace_path="map"\ndependencies = { "dep" }\n');
  const roots2 = { modRoot: mod2, gameRoot: roots.gameRoot, dependencyRoots: [dep] };
  const R2 = reachOf(DEP_MESH, DEP_SCALE.entity * DEP_SCALE.mesh), read = readReach(roots2);
  ok(JSON.stringify(read) === JSON.stringify(R2) && JSON.stringify(R2) !== JSON.stringify(REACH),
    "⭐⭐ airfieldReach reads the dependency's model: its entity's pdxmesh, that pdxmesh's file and scale under gfx/models, the mesh's aabb", { read, R2 });
  const differ = Object.keys(STATES).map(Number).filter((s) => { const v = ruleOf(s), d = ruleOf(s, { R: R2, r: roots2 }); return (v === null) !== (d === null) || (v && !same(v, d)); });
  const wouldCross = differ.filter((s) => { const v = ruleOf(s); return v && !allOne(v, R2); });
  ok(differ.length > 0 && wouldCross.length > 0, "(the fixture: in some states the spot vanilla's model fits leaves the dependency's model over its province)", { differ, wouldCross });
  const fixed2 = md.fixStatesWithoutBuildingSlots(roots2), rows2 = rowsIn(path.join(mod2, "map", "buildings.txt"));
  const off = Object.keys(STATES).map(Number).map((s) => [s, ruleOf(s, { R: R2, r: roots2 }), airOf(s, rows2)[0]]).filter(([, w, air]) => (w ? !atRule(air, w) : false));
  ok(fixed2 && fixed2.fixed === Object.keys(STATES).length && off.length === 0, `⭐⭐ every air base Generate land's writer puts in the mod is the rule's answer at the dependency's reach — ${differ.length} of them elsewhere than vanilla's would be`, off.map(([s, w, air]) => [s, w, air && [air.px, air.row]]));
}

console.log("\n-- ⭐ R. airfieldReach takes each file as the game does --");
{
  const R = path.join(ROOT, "reach"), MESH_A = { min: [-1.0, 0, -1.0], max: [2.0, 1.0, 1.0] }, MESH_B = { min: [-1.0, 0, -1.5], max: [3.0, 1.0, 0.5] }, MESH_C = { min: [-3.0, 0, -1.0], max: [1.0, 1.0, 2.0] };
  // a base game's own model, as vanilla ships it: the entity in gfx/entities/buildings.asset, its pdxmesh in buildings.gfx
  const game = path.join(R, "game"), md1 = path.join(R, "md"), cut = path.join(R, "cut"), none = path.join(R, "none");
  write(game, "gfx/entities/buildings.asset", 'entity = {\n\tname = "building_air_base"\n\tpdxmesh = "building_air_base"\n\tscale = 1.4\n}\n');
  write(game, "gfx/entities/buildings.gfx", 'objectTypes = {\n\tpdxmesh = {\n\t\tname = "building_air_base"\n\t\tfile = "gfx/models/buildings/hangar_flight.mesh"\n\t}\n}\n');
  write(game, "gfx/models/buildings/hangar_flight.mesh", meshFile(MESH_A.min, MESH_A.max));
  // Millennium Dawn's way: only a mesh of its own at the same path, the game's entity and .gfx left to name it
  write(md1, "descriptor.mod", 'name="md"\n');
  write(md1, "gfx/models/buildings/hangar_flight.mesh", meshFile(MESH_B.min, MESH_B.max));
  write(cut, "descriptor.mod", 'name="cut"\nreplace_path="gfx/models/buildings"\n');
  write(none, "descriptor.mod", 'name="none"\n');
  const ask = (modRoot, deps) => readReach({ modRoot, gameRoot: game, dependencyRoots: deps });
  ok(JSON.stringify(ask(none, [])) === JSON.stringify(reachOf(MESH_A, 1.4)), "the base game's own model, read through its entity, its .gfx and its mesh", ask(none, []));
  ok(JSON.stringify(ask(none, [md1])) === JSON.stringify(reachOf(MESH_B, 1.4)), "⭐⭐ a dependency's mesh at the same path replaces the game's, the game's entity still naming it", ask(none, [md1]));
  ok(JSON.stringify(ask(none, [cut])) === JSON.stringify(md.AIRFIELD_REACH), "⭐ a layer whose replace_path hides the mesh's folder leaves no model to read: vanilla's reach", ask(none, [cut]));
  ok(JSON.stringify(ask(none, [md1, cut])) === JSON.stringify(md.AIRFIELD_REACH) && JSON.stringify(ask(none, [cut, md1])) === JSON.stringify(reachOf(MESH_B, 1.4)),
    "⭐ …and only what lies BELOW it: declared after the other dependency it hides that one's mesh too, before it, not", { after: ask(none, [md1, cut]), before: ask(none, [cut, md1]) });
  // ⛔ #replace-path-not-recursive — a layer replacing gfx/ ITSELF hides only the files directly in gfx/, none of the folders under it, so
  // the game's entity, .gfx and mesh are all still read. No one subpath stands for the walk (a root list cut at "gfx" loses them all).
  const parent = path.join(R, "parent");
  write(parent, "descriptor.mod", 'name="parent"\nreplace_path="gfx"\n');
  ok(JSON.stringify(ask(none, [parent])) === JSON.stringify(reachOf(MESH_A, 1.4)) && JSON.stringify(reachOf(MESH_A, 1.4)) !== JSON.stringify(md.AIRFIELD_REACH),
    "⭐ a layer replacing gfx/ itself leaves the folders under it: the game's own model is still read", ask(none, [parent]));
  // two files that both define it: which the game draws is not known, so the block holds the widest of them
  const two = path.join(R, "two");
  write(two, "descriptor.mod", 'name="two"\n');
  write(two, "gfx/entities/zz_more_buildings.asset", 'entity = {\n\tname = "building_air_base"\n\tpdxmesh = "other_hangar"\n\tscale = 1.0\n}\n');
  write(two, "gfx/entities/zz_more_buildings.gfx", 'objectTypes = {\n\tpdxmesh = {\n\t\tname = "other_hangar"\n\t\tfile = "gfx/models/other/hangar.mesh"\n\t}\n}\n');
  write(two, "gfx/models/other/hangar.mesh", meshFile(MESH_C.min, MESH_C.max));
  const a1 = reachOf(MESH_A, 1.4), c1 = reachOf(MESH_C, 1.0), widest = { west: Math.max(a1.west, c1.west), east: Math.max(a1.east, c1.east), south: Math.max(a1.south, c1.south), north: Math.max(a1.north, c1.north) };
  ok(JSON.stringify(ask(two, [])) === JSON.stringify(widest) && JSON.stringify(widest) !== JSON.stringify(a1) && JSON.stringify(widest) !== JSON.stringify(c1),
    "⭐ two definitions in two files: the widest reach of the two, side by side", { got: ask(two, []), widest });
  // read once, and again when a layer's gfx/entities changes
  const later = path.join(R, "later");
  write(later, "descriptor.mod", 'name="later"\n');
  fs.mkdirSync(path.join(later, "gfx", "entities"), { recursive: true });
  const first = ask(later, []);
  // …in a LATER clock tick than the read, as a modder's copy lands: another program's write inside the tick of the one before is the
  // one change stat cannot see (#a-same-tick-write-keeps-its-stamp; Nova's own writes are counted instead, and that is pinned by
  // test-a-same-tick-write-is-seen-by-every-map-cache.js). Written at once, it landed in the folder's tick about 1 run in 10 and this
  // check failed (review of merge-x, MX-R2).
  const entities = path.join(later, "gfx", "entities"), was = fs.statSync(entities).mtimeMs;
  for (let n = 0; n < 200 && Date.now() <= was + 20; n++) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 5);
  writeDepModel(later, "later_hangar");
  ok(fs.statSync(entities).mtimeMs !== was, "(the fixture: the model landed in a later tick than the read — the folder's time moved)", { was, now: fs.statSync(entities).mtimeMs });
  ok(JSON.stringify(first) === JSON.stringify(a1) && JSON.stringify(ask(later, [])) === JSON.stringify(reachOf(DEP_MESH, DEP_SCALE.entity * DEP_SCALE.mesh)),
    "⭐ a model a mod gains after the first read is read on the next ask", { first, then: ask(later, []) });
}

console.log("\n-- I. the source: the air base's preference is written once, and so is the block --");
{
  const src = fs.readFileSync(path.join(__dirname, "map-data.js"), "utf8"), code = maskJsComments(src), lit = maskJsLiterals(src);
  const body = (name) => { const i = code.indexOf(`function ${name}(`); const b = i >= 0 ? jsBodyAt(lit, i) : null; return b ? { from: b[0], to: b[1], text: code.slice(b[0], b[1] + 1) } : null; };
  const pref = [...code.matchAll(/\bp\.province !== home\b/g)].map((m) => m.index), own = body("airBaseIndex");
  ok(pref.length === 1 && !!own && pref[0] > own.from && pref[0] < own.to, "`p.province !== home` appears once in the code, in airBaseIndex", pref.length);
  const layout = body("stateSlotLayout"), spot = body("airfieldSpot"), anchor = body("stateBuildingAnchor"), writer = body("ensureBuildingSlotsForState");
  ok(!!layout && /\bairBaseIndex\(/.test(layout.text) && !!spot && /\bairBaseIndex\(/.test(spot.text), "stateSlotLayout and airfieldSpot both ask airBaseIndex");
  ok(!!anchor && /\bairfieldSpot\(/.test(anchor.text) && /\bairfieldReach\(/.test(anchor.text) && /\breturn \{[^}]*\bairfield\b/.test(anchor.text), "stateBuildingAnchor's positions answer carries the airfield, at the reach the mod's layers draw");
  ok(!!writer && /\bkeepClearOf\s*:/.test(writer.text) && /pos\.airfield\b/.test(writer.text), "ensureBuildingSlotsForState names its other rows to keep clear of, and writes a pile's air base at the airfield");
  // ⚠️ MOVED with ⛔ #a-land-model-is-turned-as-the-base-game-turns-its-own: a model is turned now, and the ground a TURNED one covers is
  // worked out in one place of its own beside the block (turnedModelSamples, turnedModelCovers, turnedModelFar) — and, with
  // #a-harbour-keeps-off-its-states-models, how much two turned models share (turnedModelShare), there too
  const block = body("airfieldBlock"), turned = ["turnedModelSamples", "turnedModelCovers", "turnedModelShare", "turnedModelFar"].map(body), west = [...code.matchAll(/[\w$]\.west\b/g)].map((m) => m.index);
  const inside = (i) => [block, ...turned].some((b) => b && i > b.from && i < b.to);
  ok(!!block && turned.every(Boolean) && west.length > 0 && west.every(inside), "⭐ every pixel a model covers is worked out in one place, airfieldBlock (and a turned one's beside it): `.west` appears nowhere else in the code", west.filter((i) => !inside(i)).length);
}

try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) { /* scratch only */ }
console.log("\n" + (fail ? "FAILED " + fail + "/" + (pass + fail) : "PASSED " + pass + "/" + pass));
process.exitCode = fail ? 1 : 0;
