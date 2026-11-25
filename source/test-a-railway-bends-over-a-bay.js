// ⛔ #a-railway-bends-over-a-bay — A RAILWAY WHOSE 3D TRACK THE GAME WOULD DRAW OVER WATER COSTS THE PLANNER TWO STEPS MORE, AND THE
// MAP EDITOR'S TOOLS SAY SO.
//
// The owner played TEST 38 (10-23) and sent a railway crossing a bay: "the railways are the same as before issue". The game draws a
// railway twice: the straight station-to-station arrow, which every rail rule before this measured, and the 3D track, which hoi4.exe
// builds from the CROSSINGS of each rail province's links, never along the arrow (gfx_railway.cpp): the crossing X(a, b) is the pixel of
// the lower id of the two, among its pixels that touch the other, nearest both stations truncated to whole pixels, the first of the
// nearest in the exe's chain of those pixels (1.19.3 0x1415AB570, 1.19.4.0 0x1416479D0, the chain 0x141637670); a through-route in b is a cubic Bézier from X(a, b) to X(b, c), its handles min(½·chord, 3) px along the ways
// A → B and C → B (1.19.3 0x141C65E70, 1.19.4.0 0x141CF7440); a spur — in a province with one rail neighbour, or a hub, a naval base or a
// capital — runs from X(a, b) to B + 0.2·(X − B); 17 samples, t = i/16. So in a province that curves round a bay the track runs from
// one arm to the other straight over the water, while the arrow and its borders look clean.
//
// Pinned here:
//   0. the curve, against hand-worked Béziers and the fixture's own borders (railTrackCrossing, railTrackCurve, railThroughRoute,
//      railSpur, railTrackWaterShare): the crossing a WHOLE pixel of the lower id, the stations truncated in the game's frame (review F5),
//      a tie settled in the exe's chain of the border's pixels (railBorderChain), not the raster;
//   0b. the engine's own code, found in the installed hoi4.exe by what it does, not by an address (review F1: the old pin skipped on
//      1.19.4): the crossing's walk over the lower id's pixel list, its truncated stations, its whole-pixel winner, its strait midpoint,
//      and the rail mesh builder that calls it reading 0.5, 3.0, 0.2 and 0.0625;
//   1. the planner (generateSupplyNetwork): two hubs either side of a bay inside a U-shaped province are joined ROUND it, through the
//      provinces below, where the through-route over the bay would be drawn; with the bay land, or another land province, or nothing
//      round it, or the U a victory point, or a victory point beside it whose border the curve ends at (1c), it goes straight through
//      as before — but a town the rail already reaches is charged like any other province (1d); a loop (h) through the U waits (1b), and
//      so does a loop whose only curve over water is a hub's spur (1e) or a through-route at a junction the rail already reaches (1f);
//      a triangle's through-route, which the game does not draw, is not charged (1g); a lake is water (1h);
//   2. a hub whose spur would be drawn over its own bay is entered from the side whose spur is on land — the spur charged as the walk
//      from the hub takes its first step (2b), and a naval base's spur as a walk enters it (2c);
//   3. a longer world where the curve over the bay is on a walk INSIDE one hub's territory (the search's charge, not the link's);
//   4. Auto-fix's path — a joinOnly call joining a new capital's hub — lays the same way round;
//   5. railwayCurvesOverWater, the function the map editor asks, finds the same curve, and only it: not a triangle's, a lake's too, a
//      change judged by the curves it ADDS (review F2), the page's own hubs (F3), a hub's spurs (5b);
//   6. the page: the 🛤 Railway tool's click and Finish, the 🏭 Supply hub click and a railway's removal (review F3), through server.js's
//      own /api/map/railway-curves handler, add a note naming the province and never refuse; a dry line hears nothing; the rail already
//      there is not blamed on a new line; an answer is added only to the line its own action left (review F4); painted shapes not saved
//      yet are named.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const vm = require("vm");
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-rail-bay-"));
process.env.APPDATA = path.join(ROOT, "appdata"); process.env.NOVA_APP_DATA_DIR = process.env.APPDATA; process.env.XDG_CONFIG_HOME = process.env.APPDATA;
process.env.NOVA_HOME_DIR = path.join(ROOT, "home");
fs.mkdirSync(process.env.NOVA_HOME_DIR, { recursive: true });
const md = require("./map-data.js");
const P = require("./testlib-map-page.js");

let pass = 0, fail = 0, skipped = 0;
const ok = (c, m, x) => {
  if (c) { pass++; console.log("  ok   " + m); }
  else { fail++; console.log("  FAIL " + m + (x !== undefined ? "   -> " + JSON.stringify(x).slice(0, 500) : "")); }
};
const write = (dir, rel, body) => { const p = path.join(dir, ...rel.split("/")); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, body); return p; };
function bmp24(W, H, fn) {
  const rs = Math.floor((24 * W + 31) / 32) * 4, b = Buffer.alloc(54 + rs * H);
  b.write("BM", 0, "ascii"); b.writeUInt32LE(b.length, 2); b.writeUInt32LE(54, 10); b.writeUInt32LE(40, 14);
  b.writeInt32LE(W, 18); b.writeInt32LE(H, 22); b.writeUInt16LE(1, 26); b.writeUInt16LE(24, 28); b.writeUInt32LE(rs * H, 34);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const [r, g, bl] = fn(x, y); const o = 54 + (H - 1 - y) * rs + x * 3; b[o] = bl; b[o + 1] = g; b[o + 2] = r; }
  return b;
}
const colour = (id) => [(id * 29) % 256, (id * 67) % 256, 30 + id];
const SEA = 1, W = 96, H = 48;   // wide enough that no pair here is joined round the east–west seam
const same = (a, b) => !!a && !!b && (a.join() === b.join() || a.slice().reverse().join() === b.join());
const near = (a, b, e = 1e-9) => Math.abs(a - b) <= e;
const nearPt = (p, x, row, e = 1e-9) => !!p && near(p.x, x, e) && near(p.row, row, e);

// ── world 1: a U round a bay ────────────────────────────────────────────────────────────────────────────────────────────
//        x: 0   8 12        24          36 40   48
//   row 0   [H1][C ]~~~~~~~ bay ~~~~~~~[C ][H2]          H1, H2: the two hubs (states 1 and 2, their victory points)
//           [H1][C ]~~~~~~~~~~~~~~~~~~~[C ][H2]          C: the U — arms x 8..12 and 36..40, rows 0..30, and its bottom
//      30   [H1][C ......... C ......... C ][H2]            x 8..40, rows 30..40; its station on the bottom, (24, 35)
//      40   [ S1 ............ ][ S2 ............ ]       S1 x 0..24, S2 x 24..48, rows 40..48: the way round, one province longer
// The track through C from H1 to H2 runs from X(H1, C) = (7, 20), H1's pixel, to X(C, H2) = (39, 20), C's, straight over the bay.
const H1 = 10, C = 11, H2 = 12, S1 = 13, S2 = 14, B = 15, LK = 20;
const U = [[8, 0, 12, 30], [36, 0, 40, 30], [8, 30, 40, 40]];
const W1 = { [H1]: [[0, 0, 8, 40]], [C]: U, [H2]: [[40, 0, 48, 40]], [S1]: [[0, 40, 24, 48]], [S2]: [[24, 40, 48, 48]] };
const ST1 = { [H1]: [4, 5], [C]: [24, 35], [H2]: [44, 5], [S1]: [8, 44], [S2]: [40, 44], [B]: [24, 15] };
const STATES1 = { 1: [H1, S1, C], 2: [H2, S2] }, VP1 = { 1: [[H1, 5]], 2: [[H2, 5]] };
const provAt = (rects) => (x, y) => {
  for (const [id, rs] of Object.entries(rects)) for (const [x0, y0, x1, y1] of rs) if (x >= x0 && x < x1 && y >= y0 && y < y1) return +id;
  return SEA;
};
/** the fixture's own extents, in provinceExtents' shape, counted from the same function the bitmap is drawn from */
function extentsOf(rects) {
  const at = provAt(rects), cnt = new Map(), box = new Map();
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const p = at(x, y);
    cnt.set(p, (cnt.get(p) || 0) + 1);
    const b = box.get(p);
    if (!b) box.set(p, { minX: x, maxX: x, minY: y, maxY: y });
    else { b.minX = Math.min(b.minX, x); b.maxX = Math.max(b.maxX, x); b.minY = Math.min(b.minY, y); b.maxY = Math.max(b.maxY, y); }
  }
  return { W, H, pidAt: at, cnt, box };
}
const stackRows = (st) => Object.entries(st).map(([p, [x, row]]) => [0, 9, 38].map((ty) => `${p};${ty};${x};10.00;${H - 1 - row};0.00;0.00`).join("\n")).join("\n") + "\n";

/** A mod of `rects` (every other pixel sea), `states` { id: [pids] } all AAA's with `vps` { id: [[pid, value]] }, stations `st` in its
 *  own unitstacks.txt. `nodes`: its own supply_nodes.txt rows (hubs); `capital`: AAA's capital state, in history/countries; `naval`:
 *  provinces with a naval base in their state's buildings; `rails`: its own railways.txt rows, each [pid, …] at level 1; `lakes`:
 *  provinces of `rects` that are lakes, not land. */
function makeMod(tag, { rects = W1, states = STATES1, vps = VP1, st = ST1, nodes = null, capital = null, naval = [], rails = [], lakes = [] } = {}) {
  const mod = path.join(ROOT, tag);
  const at = provAt(rects);
  write(mod, "descriptor.mod", `name="${tag}"\nreplace_path="history/states"\n`);
  write(mod, "map/provinces.bmp", bmp24(W, H, (x, y) => colour(at(x, y))));
  const ids = [SEA].concat(Object.keys(rects).map(Number));
  const type = (id) => (id === SEA ? "sea;false;ocean;0" : lakes.includes(id) ? "lake;false;lakes;0" : "land;false;plains;1");
  write(mod, "map/definition.csv", ["0;0;0;0;land;false;unknown;0"].concat(ids.map((id) => `${id};${colour(id).join(";")};${type(id)}`)).join("\n") + "\n");
  for (const [s, provs] of Object.entries(states)) {
    const vp = (vps[s] || []).map(([p, v]) => `\t\tvictory_points = { ${p} ${v} }\n`).join("");
    const ports = provs.filter((p) => naval.includes(p)).map((p) => `\t\t\t${p} = { naval_base = 1 }\n`).join("");
    write(mod, `history/states/${s}-S.txt`, `state={\n\tid=${s}\n\tname="STATE_${s}"\n\tmanpower=1000\n\tstate_category=rural\n\tprovinces={ ${provs.join(" ")} }\n\thistory={\n\t\towner=AAA\n${vp}${ports ? `\t\tbuildings = {\n${ports}\t\t}\n` : ""}\t}\n}\n`);
  }
  if (capital) write(mod, "history/countries/AAA - Aaa.txt", `capital = ${capital}\n`);
  write(mod, "map/adjacencies.csv", "From;To;Type;Through;start_x;start_y;stop_x;stop_y;adjacency_rule_name;Comment\n-1;-1;-1;-1;-1;-1;-1;-1;-1\n");
  write(mod, "map/supply_nodes.txt", (nodes || []).map((p) => `1 ${p}`).join("\n") + (nodes && nodes.length ? "\n" : ""));
  write(mod, "map/railways.txt", rails.map((r) => `1 ${r.length} ${r.join(" ")}\n`).join(""));
  write(mod, "map/unitstacks.txt", stackRows(Object.fromEntries(Object.entries(st).filter(([p]) => rects[p]))));
  return mod;
}
const GAME = path.join(ROOT, "no-game");
const roots = (mod) => ({ modRoot: mod, gameRoot: GAME, dependencyRoots: [] });
function plan(tag, opts = {}, call = {}) {
  const r = md.generateSupplyNetwork({ ...roots(makeMod(tag, opts)), dryRun: true, ...call }) || {};
  return { r, hubs: (r.newHubs || []).map((h) => h.province).sort((a, b) => a - b), rails: (r.railRows || []).map((x) => x.provinces) };
}
const stationsOf = (st) => (p) => (st[p] ? { x: st[p][0], row: st[p][1] } : null);
// the curve functions, or NaN where the module has none (a FAIL, not a crash, on a tree without them — so every section still runs)
const hasCurve = () => ["railTrackCrossing", "railThroughRoute", "railSpur", "railTrackWaterShare"].every((n) => typeof md[n] === "function");
/** the share over water of the through-route in u from t to v, and of the spur in u toward v, on `rects` with stations `st` */
const curveShares = (rects, st, water = (id) => id === SEA) => {
  const ex = extentsOf(rects), s = stationsOf(st), X = (a, b) => md.railTrackCrossing(ex, a, b, s(a), s(b));
  return {
    through: (t, u, v) => { if (!hasCurve()) return NaN; const X1 = X(t, u), X2 = X(u, v); return X1 && X2 ? md.railTrackWaterShare(md.railThroughRoute(X1, X2, s(t), s(u), s(v)), ex, water) : NaN; },
    spur: (u, v) => { if (!hasCurve()) return NaN; const Xv = X(v, u); return Xv ? md.railTrackWaterShare(md.railSpur(Xv, s(v), s(u)), ex, water) : NaN; },
  };
};

// ── 0. the curve ─────────────────────────────────────────────────────────────────────────────────────────────────────────
console.log("\n-- ⭐ 0. the curve the game draws, against hand-worked Béziers and the fixture's own borders --");
{
  const T = md.RAIL_TRACK || {};
  ok(T.steps === 16 && T.handle === 3 && T.spurEnd === 0.2 && T.wet === 0.1 && T.endPx === 1.5 && Number.isInteger(T.baySteps) && T.baySteps >= 1,
    "(the constants: 17 points, a 3 px handle, a spur ending 0.2 of the way out, over water past 10%, 1.5 px at either end not asked, whole steps more)", T);
  const ex = extentsOf(W1), st = stationsOf(ST1);
  const X = (a, b) => (typeof md.railTrackCrossing === "function" ? md.railTrackCrossing(ex, a, b, st(a), st(b)) : undefined);
  // ⛔ review F5 (10-28): the exe's crossing is a PIXEL — the lower id's, its whole x and row — never the middle of a pixel edge
  ok(nearPt(X(H1, C), 7, 20) && X(H1, C).strait === false, "⭐⭐ X(H1, C) is a pixel of their border, H1's (the lower id), nearest both stations: (7, 20)", X(H1, C));
  ok(nearPt(X(C, H2), 39, 20) && nearPt(X(H2, C), 39, 20), "⭐ …X(C, H2) on C's pixel (39, 20), the same both ways round", [X(C, H2), X(H2, C)]);
  ok(nearPt(X(S1, S2), 23, 44) && nearPt(X(H1, S1), 6, 39), "⭐ …and on a border seen from above: X(H1, S1) (6, 39), X(S1, S2) (23, 44)", [X(H1, S1), X(S1, S2)]);
  ok(nearPt(X(H1, H2), 24, 5) && X(H1, H2).strait === true, "⭐ two provinces that share no border: the middle of their stations, a strait", X(H1, H2));
  ok(typeof md.railTrackCrossing === "function" && md.railTrackCrossing(ex, H1, C, null, st(C)) === null, "…a station missing: no crossing");
  const shared = [[H1, C], [C, H2], [H1, S1], [S1, S2], [C, S1], [C, S2], [H2, S2]].map(([a, b]) => X(a, b));
  ok(shared.every((p) => !!p && p.strait === false && Number.isInteger(p.x) && Number.isInteger(p.row)), "⭐ every crossing over a shared border is a whole pixel", shared);
  const cross = (rects, a, b, A, Bs) => (typeof md.railTrackCrossing === "function" ? md.railTrackCrossing(extentsOf(rects), a, b, A, Bs) : undefined);
  // the higher id on the left AND the smaller province: neither the argument order nor which side is scanned decides the side
  const LO = 5, HI = 7, two = { [HI]: [[4, 0, 10, 10]], [LO]: [[10, 0, 20, 10]] };
  const lo1 = cross(two, HI, LO, { x: 6, row: 5 }, { x: 15, row: 5 }), lo2 = cross(two, LO, HI, { x: 15, row: 5 }, { x: 6, row: 5 });
  ok(nearPt(lo1, 10, 5) && nearPt(lo2, 10, 5), "⭐⭐⭐ the crossing stands on the LOWER id's pixel (10, 5) whichever way round — not the edge's middle (9.5, 5), nor the higher id's or the smaller province's (9, 5)", [lo1, lo2]);
  // the stations as the exe reads them: truncated to whole pixels in its own frame, z up the map (z = H − 1 − row)
  const tz = cross({ 23: [[0, 20, 10, 30]], 24: [[10, 20, 20, 30]] }, 23, 24, { x: 5, row: 24.4 }, { x: 15, row: 24.4 });
  ok(nearPt(tz, 9, 25), "⭐⭐ the stations truncated in the game's frame: rows 24.4 are z 22.6, truncated to z 22 — row 25, where the nearest row is 24", tz);
  const tx = cross({ 21: [[0, 0, 20, 10]], 22: [[0, 10, 20, 20]] }, 21, 22, { x: 4.9, row: 5 }, { x: 4.9, row: 15 });
  ok(nearPt(tx, 4, 9), "⭐ …and x 4.9 truncated to 4: X (4, 9), on 21's pixel above the border, where the nearest is x 5", tx);
  // ⛔ the tie (read again 10-29): the exe keeps the FIRST of the nearest in its CHAIN of the lower id's border pixels (railBorderChain:
  // sorted up the map, started at the most isolated pixel, each next the nearest to the chain's last — or, when one is nearer its
  // first, the chain reversed and that one put last), so on a border running north–south a tie goes to the southern pixel
  const col = { 5: [[0, 0, 10, 10]], 7: [[10, 0, 20, 10]] };
  const tie = [cross(col, 5, 7, { x: 4, row: 4 }, { x: 15, row: 5 }), cross(col, 7, 5, { x: 15, row: 5 }, { x: 4, row: 4 })];
  ok(tie.every((p) => nearPt(p, 9, 5)), "⭐⭐ two of 5's pixels tied, rows 4 and 5: the chain's first, (9, 5), both ways round — not the raster's first (9, 4)", tie);
  const chainOf = (rects, a, b) => { if (typeof md.railBorderChain !== "function") return undefined; const c = md.railBorderChain(extentsOf(rects), a, b); return c && c.map((p) => p.row); };
  ok(JSON.stringify(chainOf(col, 7, 5)) === "[9,8,7,6,5,4,3,2,1,0]", "⭐ …the chain of 5's pixels beside 7 runs from the border's south end up the map", chainOf(col, 7, 5));
  const gaps = { 5: [[0, 0, 10, 21]], 7: [[10, 0, 20, 4], [10, 9, 20, 10], [10, 15, 20, 21]], 8: [[10, 4, 20, 9], [10, 10, 20, 15]] };
  ok(JSON.stringify(chainOf(gaps, 5, 7)) === "[20,19,18,17,16,15,9,3,2,1,0]", "⭐ …it starts at the most isolated pixel (row 9), runs south to row 20, and is reversed to take the north: rows 20 → 0", chainOf(gaps, 5, 7));
  const iso = { 5: [[0, 0, 10, 10]], 7: [[10, 0, 20, 1], [10, 6, 20, 10]], 8: [[10, 1, 20, 6]] };
  ok(JSON.stringify(chainOf(iso, 5, 7)) === "[0,6,7,8,9]", "⭐ …the most isolated pixel, not the first up the map: from row 0 south", chainOf(iso, 5, 7));
  ok(JSON.stringify(chainOf({ 5: [[0, 0, 4, 4]], 7: [[10, 0, 14, 4]] }, 5, 7)) === "[]" && chainOf(col, 5, 99) === null, "(…two provinces apart: no pixel; a province with none: null)");
  // the Bézier: P(½) = (X1 + 3·C1 + 3·C2 + X2) / 8
  const curve = (...a) => (typeof md.railTrackCurve === "function" ? md.railTrackCurve(...a) : []);
  const long = curve({ x: 0, row: 0 }, { x: 0, row: 1 }, { x: 10, row: 0 }, { x: 0, row: 1 });
  ok(long.length === 17 && nearPt(long[0], 0, 0) && nearPt(long[16], 10, 0) && nearPt(long[8], 5, 2.25),
    "⭐⭐ a 10 px chord: 17 points from X1 to X2, its handles 3 px out (min(½·10, 3)): P(½) = (5, 2.25)", long[8]);
  const short = curve({ x: 0, row: 0 }, { x: 0, row: 1 }, { x: 4, row: 0 }, { x: 0, row: 1 });
  ok(nearPt(short[8], 2, 1.5), "⭐ a 4 px chord: its handles ½·4 = 2 px out, P(½) = (2, 1.5)", short[8]);
  const thr = typeof md.railThroughRoute === "function" ? md.railThroughRoute({ x: 0, row: 0 }, { x: 10, row: 0 }, { x: -4, row: -3 }, { x: 5, row: 4 }, { x: 14, row: -3 }) : [];
  // T1 = way A → B = (9, 7)/√130, T2 = way C → B = (−9, 7)/√130, h = 3
  const k = 3 / Math.sqrt(130), mid = { x: (0 + 3 * (9 * k) + 3 * (10 - 9 * k) + 10) / 8, row: (3 * 7 * k * 2) / 8 };
  ok(nearPt(thr[8], mid.x, mid.row), "⭐ a through-route's handles lie along the way A → B at its start and C → B at its end", { got: thr[8], want: mid });
  const sp = typeof md.railSpur === "function" ? md.railSpur({ x: 10, row: 0 }, { x: 20, row: 0 }, { x: 0, row: 0 }) : [];
  ok(sp.length === 17 && nearPt(sp[0], 10, 0) && nearPt(sp[16], 2, 0), "⭐ a spur runs from its crossing to B + 0.2·(X − B): (10, 0) → (2, 0)", [sp[0], sp[16]]);
  // the share: points over water, but none within 1.5 px of either end; more than 10% is over water
  const share = (pts, water) => (typeof md.railTrackWaterShare === "function" ? md.railTrackWaterShare(pts, { W: 100, H: 10, pidAt: (x) => (water(x) ? SEA : 2) }, (id) => id === SEA) : NaN);
  const line = Array.from({ length: 17 }, (_, i) => ({ x: 4 * i, row: 5 }));
  ok(near(share(line, (x) => x >= 50 && x < 54), 1 / 17), "1 of 17 points over water: 1/17", share(line, (x) => x >= 50 && x < 54));
  ok(near(share(line, (x) => x >= 50 && x < 60), 2 / 17) && 2 / 17 > T.wet && 1 / 17 <= T.wet, "⭐ 2 of 17: over 10%, a curve over water; 1 of 17 is not", share(line, (x) => x >= 50 && x < 60));
  ok(share(line, (x) => x < 1 || x > 63) === 0, "⭐ the points at either end stand on the crossing's own pixels and are not asked", share(line, (x) => x < 1 || x > 63));
  // the U: the through-route over the bay, and the way round
  const over = curveShares(W1, ST1).through;
  ok(over(H1, C, H2) > 0.5, "⭐⭐⭐ the track through C from H1 to H2 runs more than half over the bay", over(H1, C, H2));
  ok(over(H1, S1, S2) === 0 && over(S1, S2, H2) === 0, "⭐ …and the way round, through S1 and S2, none of it", [over(H1, S1, S2), over(S1, S2, H2)]);
  ok(over(H1, C, S2) > T.wet, "(…and the track through C from H1 down to S2 still cuts the bay's corner)", over(H1, C, S2));
}

// ── 0b. the exe ──────────────────────────────────────────────────────────────────────────────────────────────────────────
// ⛔ Review F1 (10-28): this read four constants at fixed 1.19.3 addresses behind a size gate, so from the 1.19.4 patch (10-27) it said
// SKIP and the run counted green. Now the code is FOUND by what it does, on whatever build is installed, and a build where it cannot be
// found FAILS, naming the build: the rail code must be read again. Found on 1.19.4 (56,529,528 bytes): the crossing 0x1416479D0, the
// mesh builder 0x141CF7440 (0.5 @0x14279DD64, 3.0 @0x1429C7F28, 0.2 @0x1429C72C4, 0.0625 @0x142AD0078); on 1.19.3 (55,778,424) they
// were 0x1415AB570 and 0x141C65E70 (0x14271FC54, 0x14294B0C0, 0x14294A31C, 0x142A5982C), the same code relocated. A SKIP only when no
// hoi4.exe is installed at all. Why a FAIL, where test-every-engine-trace-still-reads-the-installed-build.js reports a size-gated trace
// left on an old build as a SKIP: an update that only MOVES the code cannot make this fail — the signature carries no address — so it
// fails only when Paradox changes the rail code itself, which is exactly when Nova's replay of the track may have stopped being true.
console.log("\n-- ⭐ 0b. the engine's own code, found in the installed hoi4.exe by what it does --");
{
  const EXE = process.env.NOVA_HOI4_EXE || "D:/SteamLibrary/steamapps/common/Hearts of Iron IV/hoi4.exe";
  let b = null; try { b = fs.readFileSync(EXE); } catch (_) { b = null; }
  if (!b) { skipped++; console.log(`  SKIP no hoi4.exe at ${EXE}`); }
  else {
    const stat = fs.statSync(EXE), build = `${stat.size} bytes, ${stat.mtime.toISOString().slice(0, 10)}`;
    const pe = b.readUInt32LE(0x3c), nsec = b.readUInt16LE(pe + 6), optSize = b.readUInt16LE(pe + 20), opt = pe + 24;
    const IB = Number(b.readBigUInt64LE(opt + 24)), secs = [];
    for (let i = 0; i < nsec; i++) { const s = opt + optSize + i * 40; secs.push({ name: b.toString("latin1", s, s + 8).replace(/\0+$/, ""), vsize: b.readUInt32LE(s + 8), va: b.readUInt32LE(s + 12), rawSize: b.readUInt32LE(s + 16), raw: b.readUInt32LE(s + 20) }); }
    const off = (rva) => { const s = secs.find((x) => rva >= x.va && rva < x.va + Math.max(x.vsize, x.rawSize)); return s ? s.raw + (rva - s.va) : -1; };
    const rvaOf = (o) => { const s = secs.find((x) => o >= x.raw && o < x.raw + x.rawSize); return s ? s.va + (o - s.raw) : -1; };
    const VA = (rva) => "0x" + (IB + rva).toString(16).toUpperCase();
    // .pdata: the function holding an rva, followed through chained unwind info to the function it is a part of
    const exc = b.readUInt32LE(opt + 112 + 3 * 8), excSize = b.readUInt32LE(opt + 112 + 3 * 8 + 4), pd = off(exc), nfn = Math.floor(excSize / 12);
    const fnAt = (i) => [b.readUInt32LE(pd + i * 12), b.readUInt32LE(pd + i * 12 + 4), b.readUInt32LE(pd + i * 12 + 8)];
    const holding = (rva) => { let lo = 0, hi = nfn - 1; while (lo <= hi) { const m = (lo + hi) >> 1, f = fnAt(m); if (f[1] <= rva) lo = m + 1; else if (f[0] > rva) hi = m - 1; else return f; } return null; };
    const primary = (f) => { for (let g = 0; f && g < 32; g++) { const u = off(f[2]); if (!((b[u] >> 3) & 4)) return f; const c = u + 4 + ((b[u + 2] + 1) & ~1) * 2; f = [b.readUInt32LE(c), b.readUInt32LE(c + 4), b.readUInt32LE(c + 8)]; } return f; };
    const text = secs.find((s) => s.name === ".text") || { raw: 0, rawSize: 0 };
    const count = (hex, from, to) => { const n = Buffer.from(hex, "hex"); let k = 0; for (let i = b.indexOf(n, from); i >= 0 && i < to; i = b.indexOf(n, i + 1)) k++; return k; };
    // the float32s RIP-relative SSE scalar ops in [o0, o1) read (F3 [REX] 0F {10 58 59 5C 5D 5E 5F} modrm 00·reg·101 disp32)
    const floatsRead = (o0, o1) => {
      const out = new Set();
      for (let i = o0; i < o1 - 8; i++) {
        if (b[i] !== 0xf3) continue;
        let q = i + 1; if (b[q] >= 0x40 && b[q] <= 0x4f) q++;
        if (b[q] !== 0x0f || ![0x10, 0x58, 0x59, 0x5c, 0x5d, 0x5e, 0x5f].includes(b[q + 1]) || (b[q + 2] & 0xc7) !== 0x05) continue;
        const t = off(rvaOf(q + 7) + b.readInt32LE(q + 3));
        if (t >= 0 && t + 4 <= b.length) out.add(b.readFloatLE(t));
      }
      return out;
    };
    // 1. the crossing's walk over a border's pixel list: each (int16 x, int16 row), its integer distance to two whole stations
    //    (movzx ecx, word [r10]; movzx edx, word [r10+2]; movzx eax, cx; sub ax, r12w; sub cx, r14w)
    const LOOP = Buffer.from("410fb70a410fb752020fb7c166412bc466412bce", "hex"), hits = [];
    for (let i = b.indexOf(LOOP, text.raw); i >= 0 && i < text.raw + text.rawSize; i = b.indexOf(LOOP, i + 1)) hits.push(i);
    ok(hits.length === 1, `⭐ the crossing's walk over a border's pixel list is found, once, in hoi4.exe (${build}) — if not, the game changed and its rail code must be read again`, hits.map((o) => VA(rvaOf(o))));
    const L = hits.length === 1 ? hits[0] : -1, fnL = L >= 0 ? holding(rvaOf(L)) : null, entry = fnL ? primary(fnL) : null, e0 = entry ? off(entry[0]) : -1;
    ok(!!entry && e0 < L && L - e0 < 0x1000, `(…in the function at ${entry ? VA(entry[0]) : "?"}: 1.19.4's 0x1416479D0, 1.19.3's 0x1415AB570)`, entry && { entry: VA(entry[0]), walk: VA(rvaOf(L)) });
    if (entry) {
      // 2. its head orders the two ids — cmp r8d, r9d; cmovle esi, r9d (the higher); cmovle edi, r8d (the lower) — and the list it walks
      //    is the LOWER id's: movsxd rdx, edi; lea rdx, [rdx+rdx*2], that province's record, just before the walk (map load files each
      //    pixel under its OWN province, per neighbour: the pixels on the lower id's side of the border)
      ok(count("453bc1", e0, e0 + 0x40) >= 1 && count("410f4ef1", e0, e0 + 0x60) === 1 && count("410f4ef8", e0, e0 + 0x60) === 1,
        "⭐⭐ the crossing orders its two provinces' ids, the lower one first (cmp r8d, r9d; cmovle ×2)");
      ok(count("4863d7488d1452", L - 0x80, L) === 1, "⭐⭐ …and walks the border's pixel list of the LOWER id (movsxd rdx, edi: the lower id's record)");
      // 3. both stations truncated to whole pixels: four cvttss2si (F3 [REX] 0F 2C) between the stations' read and the walk
      let cvtt = 0; for (let i = L - 0x80; i < L; i++) if (b[i] === 0xf3 && ((b[i + 1] === 0x0f && b[i + 2] === 0x2c) || (b[i + 1] >= 0x40 && b[i + 1] <= 0x4f && b[i + 2] === 0x0f && b[i + 3] === 0x2c))) cvtt++;
      ok(cvtt === 4, "⭐⭐ the two stations are truncated to whole pixels before the walk: four cvttss2si, the x and z of each", cvtt);
      // 4. the winner is its pixel's own whole x and row as floats — movsx eax, word [rax]; … cvtdq2ps; movsx eax, word [rbx+2]; …
      //    cvtdq2ps — with no add or subtract (F3 [REX] 0F 58 / 5C) between the walk and the second convert
      const tail = b.subarray(L, L + 0xc0), i1 = tail.indexOf(Buffer.from("0fbf00", "hex")), i2 = tail.indexOf(Buffer.from("0fbf4302", "hex"));
      const c1 = i1 < 0 ? -1 : tail.indexOf(Buffer.from("0f5bc0", "hex"), i1), c2 = i2 < 0 ? -1 : tail.indexOf(Buffer.from("0f5bc9", "hex"), i2);
      let added = 0; for (let i = 0; i < c2; i++) if (tail[i] === 0xf3 && ((tail[i + 1] === 0x0f && (tail[i + 2] === 0x58 || tail[i + 2] === 0x5c)) || (tail[i + 1] >= 0x40 && tail[i + 1] <= 0x4f && tail[i + 2] === 0x0f && (tail[i + 3] === 0x58 || tail[i + 3] === 0x5c)))) added++;
      ok(i1 > 0 && c1 > i1 && i2 > i1 && c2 > i2 && c2 > c1 && added === 0, "⭐⭐⭐ the crossing is its pixel's own whole x and row, made floats with nothing added: never the middle of a pixel edge", { i1, c1, i2, c2, added });
      // 5. a strait — a pair with no pixel in its list — falls back to the middle of the two stations: the crossing reads 0.5
      ok(floatsRead(e0, L).has(0.5), "⭐ …and a strait, whose list is empty, falls back to the middle of the two stations: the crossing reads 0.5");
      // 6. the rail mesh builder calls it, and reads the curve's constants: ½·chord, the 3 px cap, the spur's 0.2, t's 1/16
      const callers = new Set();
      for (let i = text.raw; i + 5 <= text.raw + text.rawSize; i++) if (b[i] === 0xe8 && rvaOf(i) + 5 + b.readInt32LE(i + 1) === entry[0]) { const f = holding(rvaOf(i)); if (f) callers.add(primary(f)[0]); }
      const mesh = [...callers].map((r) => { const f = holding(r); return { at: VA(r), floats: f ? floatsRead(off(f[0]), off(f[1])) : new Set() }; });
      const builder = mesh.find((m) => m.floats.has(0.5) && m.floats.has(3) && [...m.floats].some((v) => near(v, 0.2, 1e-7)) && m.floats.has(0.0625));
      ok(!!builder, `⭐⭐ the rail mesh builder (${builder ? builder.at : "not found"}) calls the crossing and reads 0.5, 3.0, 0.2 and 0.0625: ½·chord, the 3 px cap, the spur's 0.2, t's 1/16`,
        mesh.map((m) => ({ at: m.at, floats: [...m.floats].sort((x, y) => x - y) })));
    }
  }
}

// ── 1. the planner: round the bay ────────────────────────────────────────────────────────────────────────────────────
console.log("\n-- ⭐ 1. the planner joins two hubs ROUND a bay, not across it --");
{
  const p = plan("w1");
  ok(same(p.hubs, [H1, H2]) && p.rails.length === 1, "(the fixture: the two hubs H1 and H2, one railway)", { hubs: p.hubs, rails: p.rails });
  ok(p.rails.length === 1 && same(p.rails[0], [H1, S1, S2, H2]), "⭐⭐⭐ the railway runs H1 → S1 → S2 → H2, round the bay — one province longer, its track on land", p.rails);
  ok(!p.rails.some((r) => r.includes(C)), "⭐⭐ …and not through C, whose track from H1 to H2 the game would draw over the bay", p.rails);
  ok(p.r.railWater && p.r.railWater.curves > 0 && p.r.railWater.overWater >= 1, "⭐ the result says what it replayed: the curves asked, and how many ran over water", p.r.railWater);
  const land = plan("w1-land", { rects: { ...W1, [C]: [[8, 0, 40, 40]] } });
  ok(land.rails.length === 1 && same(land.rails[0], [H1, C, H2]), "THE CONTROL: the bay land (C a block), and the railway goes straight through C", land.rails);
  const other = plan("w1-other", { rects: { ...W1, [B]: [[12, 0, 36, 30]] }, states: { 1: [H1, S1, C, B], 2: [H2, S2] } });
  ok(other.rails.length === 1 && same(other.rails[0], [H1, C, H2]), "⭐ the bay another land province: the track over a neighbour is no bay, and it goes straight", other.rails);
  const alone = plan("w1-alone", { rects: { [H1]: W1[H1], [C]: U, [H2]: W1[H2] }, states: { 1: [H1, C], 2: [H2] } });
  ok(alone.rails.length === 1 && same(alone.rails[0], [H1, C, H2]), "⭐⭐ nothing round the bay: the way over it is still taken — not a ban", alone.rails);
  const vp = plan("w1-vp", { vps: { 1: [[H1, 5], [C, 1]], 2: [[H2, 5]] } });
  ok(same(vp.hubs, [H1, H2]) && vp.rails.length === 1 && same(vp.rails[0], [H1, C, H2]),
    "⭐⭐ C a victory point: a town keeps its rail before its track keeps off a bay (TEST 38's Thurstote)", { hubs: vp.hubs, rails: vp.rails });
}

// ── 1b. a loop ───────────────────────────────────────────────────────────────────────────────────────────────────────
//   world 1 with the way round one province longer (S1 | S2 | S3): the railway runs round, 4 hops, and the link through C, 2 hops, is a
//   way round more than 1.5 times shorter — a loop (h) the planner lays, unless its curves would be drawn over water.
console.log("\n-- ⭐ 1b. a loop (h) waits on a curve over water, as it waits on a dear border --");
{
  const S3 = 16;
  const rects = { ...W1, [S2]: [[24, 40, 36, 48]], [S3]: [[36, 40, 48, 48]] };
  const p = plan("w1-loop", { rects, st: { ...ST1, [S2]: [30, 44], [S3]: [42, 44] }, states: { 1: [H1, S1, C], 2: [H2, S2, S3] } });
  ok(p.rails.length >= 1 && same(p.rails[0], [H1, S1, S2, S3, H2]), "(the fixture: the forest runs round, H1 → S1 → S2 → S3 → H2)", p.rails);
  ok(p.r.railLoops && p.r.railLoops.asked >= 1, "(…and the link through C is asked as a loop: the way round is 4 hops against its 2)", p.r.railLoops);
  ok(p.rails.length === 1 && p.r.railLoops.waited && p.r.railLoops.waited.water >= 1, "⭐⭐ the loop through C waits: its track would be drawn over the bay", { rails: p.rails, loops: p.r.railLoops });
}

// ── 1c. a town beside the bay ────────────────────────────────────────────────────────────────────────────────────────
//   world 1 with a town TV (a victory point, no hub) between H1 and the U, and the way round three provinces long (S1 | S2 | S3):
//        x: 0  4  8 12        24          36 40   48
//   row 0   [H1][TV][C ]~~~~~~~ bay ~~~~~~~[C ][H2]      the curve over the bay is C's through-route from TV to H2: it ends at
//      40   [ S1 ........ ][ S2 ......... ][ S3 .... ]   TV's border. Charged, the line went round by S1–S3 and left TV off the rail.
console.log("\n-- ⭐ 1c. a curve that ends at a town's border is not charged: the town keeps its rail --");
{
  const S3 = 16, TV = 17;
  const rects = { [H1]: [[0, 0, 4, 40]], [TV]: [[4, 0, 8, 40]], [C]: U, [H2]: W1[H2], [S1]: [[0, 40, 16, 48]], [S2]: [[16, 40, 32, 48]], [S3]: [[32, 40, 48, 48]] };
  const st = { [H1]: [2, 5], [TV]: [6, 5], [C]: [24, 35], [H2]: [44, 5], [S1]: [8, 44], [S2]: [24, 44], [S3]: [40, 44] };
  const over = curveShares(rects, st).through(TV, C, H2);
  ok(over > 0.5, "(the fixture: C's track from TV's border to H2's runs more than half over the bay)", over);
  const p = plan("w1-town", { rects, st, states: { 1: [H1, TV, C, S1, S2], 2: [H2, S3] }, vps: { 1: [[H1, 5], [TV, 1]], 2: [[H2, 5]] } });
  ok(same(p.hubs, [H1, H2]) && p.rails.length === 1 && same(p.rails[0], [H1, TV, C, H2]),
    "⭐⭐ the line runs H1 → TV → C → H2: the town TV keeps its rail, though the curve beside it crosses the bay", { hubs: p.hubs, rails: p.rails });
}

// ── 1d. a town already on the rail ───────────────────────────────────────────────────────────────────────────────────
//   world 1 with C a victory point, through Auto-fix's join (H1 the map's hub, H2 AAA's capital to be hubbed and joined). With nothing
//   on the rail, C is a town the rail does not reach yet: the line runs through it and over the bay, and C has rail. With the mod's own
//   railway H1 → C already there, C has its rail, and the join's curve from H1's border to H2's in C is charged like any other: the
//   line goes round. Left free, a loop ran into TEST 38's Vobos (state 622, VP 139) by a curve 53% over its bay.
console.log("\n-- ⭐ 1d. a town the rail already reaches is charged like any other province --");
{
  const vps = { 1: [[H1, 5], [C, 1]], 2: [[H2, 5]] };
  const fresh = plan("w1-town-fresh", { vps, nodes: [H1], capital: 2 }, { stateIds: [2], joinOnly: true });
  ok(!fresh.r.error && same(fresh.hubs, [H2]) && fresh.rails.length === 1 && same(fresh.rails[0], [H1, C, H2]),
    "THE CONTROL: C a town with no rail yet — the join runs H1 → C → H2, through it and over the bay, and C keeps the rail it is given", { hubs: fresh.hubs, rails: fresh.rails, err: fresh.r.error });
  const laid = plan("w1-town-laid", { vps, nodes: [H1], capital: 2, rails: [[H1, C]] }, { stateIds: [2], joinOnly: true });
  ok(!laid.r.error && same(laid.hubs, [H2]) && laid.rails.length === 1 && same(laid.rails[0], [H1, S1, S2, H2]),
    "⭐⭐ the mod's railway H1 → C already there: C has its rail, its curve over the bay is charged, and the join goes round by S1 and S2", { hubs: laid.hubs, rails: laid.rails, err: laid.r.error });
}

// ── 1e. a loop into a hub from its bay's side ────────────────────────────────────────────────────────────────────────
//        x: 0   8   16 20          44 48
//   row 0   [H1][A1][HB]~~~ bay ~~~[HB]      HB: a hub, a U round its own bay, its station low on the east arm (46, 34): the game spurs
//      20   [H1]~~~~[HB]~~~~~~~~~~~[HB]          a hub toward each rail neighbour, and its spur toward A1, on the west arm, crosses the
//      24   [G1]~~~~[HB]~~~~~~~~~~~[HB]          bay. G1 → G2 → G3: the way round, into HB's bottom by its west arm — HB's spur that way,
//      30   [G1]~~~~[HB ................]        and its through-route from G3 up to A1, on land
//      40   [G1][G2][G3]                 The forest goes round (4 hops); H1 → A1 → HB (2) is a loop (h) whose ONLY curve over water is
//                                        the spur in HB, a hub with a rail neighbour already (G3). Review F4: unasked, the loop was laid.
console.log("\n-- ⭐ 1e. a loop waits on a hub's spur over its bay, the hub already on the rail --");
{
  const A1 = 11, HB = 12, G1 = 13, G2 = 14, G3 = 15;
  const rects = { [H1]: [[0, 0, 8, 24]], [A1]: [[8, 0, 16, 20]], [HB]: [[16, 0, 20, 30], [44, 0, 48, 30], [16, 30, 48, 38]], [G1]: [[0, 24, 8, 48]], [G2]: [[8, 40, 16, 48]], [G3]: [[16, 38, 20, 48]] };
  const st = { [H1]: [4, 10], [A1]: [12, 10], [HB]: [46, 34], [G1]: [4, 36], [G2]: [12, 44], [G3]: [18, 43] };
  const sh = curveShares(rects, st);
  ok(sh.spur(HB, A1) > 0.3 && sh.spur(HB, G3) === 0 && sh.through(G3, HB, A1) === 0 && sh.through(H1, A1, HB) === 0 && sh.spur(H1, A1) === 0,
    "(the fixture: HB's spur toward A1 runs over its bay; its spur toward G3, its through-route from G3 to A1, A1's track and H1's spur on land)",
    { spurA1: sh.spur(HB, A1), spurG3: sh.spur(HB, G3), throughG3A1: sh.through(G3, HB, A1), throughA1: sh.through(H1, A1, HB), spurH1: sh.spur(H1, A1) });
  const p = plan("w1e", { rects, st, states: { 1: [H1, A1, G1, G2, G3], 2: [HB] }, vps: { 1: [[H1, 5]], 2: [[HB, 5]] } });
  ok(same(p.hubs, [H1, HB]) && p.rails.length >= 1 && same(p.rails[0], [H1, G1, G2, G3, HB]), "(the forest goes round, H1 → G1 → G2 → G3 → HB)", { hubs: p.hubs, rails: p.rails });
  ok(p.r.railLoops && p.r.railLoops.asked >= 1, "(…and H1 → A1 → HB is asked as a loop: the way round is 4 hops against its 2)", p.r.railLoops);
  ok(p.rails.length === 1 && p.r.railLoops.waited && p.r.railLoops.waited.water >= 1,
    "⭐⭐⭐ the loop waits: the game would spur the hub HB toward A1 over its bay, though HB has a rail neighbour already", { rails: p.rails, loops: p.r.railLoops });
}

// ── 1f. a loop closing at a junction ─────────────────────────────────────────────────────────────────────────────────
//   world 1b with C's station on its east arm (38, 5) and the mod's own railway H1 → C already there. The forest runs round; the loop
//   through C is the row C → H2 alone (H1 → C is on the rail), and its curve over water is C's through-route from H1 — C's rail neighbour
//   ALREADY THERE — to H2: the junction's. C's spur toward H2, which a row seen alone would ask, is on land. Review F4: asked of the row's
//   own links only, the loop was laid.
console.log("\n-- ⭐ 1f. a loop waits on a through-route at a junction, from the rail already there --");
{
  const S3 = 16;
  const rects = { ...W1, [S2]: [[24, 40, 36, 48]], [S3]: [[36, 40, 48, 48]] };
  const st = { ...ST1, [C]: [38, 5], [S2]: [30, 44], [S3]: [42, 44] };
  const sh = curveShares(rects, st);
  ok(sh.through(H1, C, H2) > 0.5 && sh.spur(C, H2) === 0 && sh.spur(H2, C) === 0 && sh.through(S3, H2, C) === 0,
    "(the fixture: C's through-route from H1 to H2 runs over the bay; its spur toward H2, and H2's curves, on land)",
    { through: sh.through(H1, C, H2), spurC: sh.spur(C, H2), spurH2: sh.spur(H2, C), throughH2: sh.through(S3, H2, C) });
  const p = plan("w1f", { rects, st, states: { 1: [H1, S1, C], 2: [H2, S2, S3] }, rails: [[H1, C]] });
  ok(p.rails.length >= 1 && same(p.rails[0], [H1, S1, S2, S3, H2]), "(the fixture: the forest runs round, H1 → S1 → S2 → S3 → H2)", p.rails);
  ok(p.rails.length === 1 && p.r.railLoops && p.r.railLoops.waited && p.r.railLoops.waited.water >= 1,
    "⭐⭐⭐ the loop C → H2 waits: at the junction C the game would draw the track from H1's border, the rail already there, to H2's over the bay", { rails: p.rails, loops: p.r.railLoops });
}

// ── 1g. a triangle ───────────────────────────────────────────────────────────────────────────────────────────────────
//        x: 0   8 12        24      32 36 40   48
//   row 0   [HA][T ][T  bridge ][V  bridge ][V ][HB]    T and V meet over a 2 px border at the top (x 23|24, rows 0..1): a thin one,
//       3   [HA][T ][C ]~~~~~~ bay ~~~~~~[C ][V ][HB]   a step dearer (d). C: a U round a bay below them. With the mod's own railway
//      30   [HA][T ][C ............... C ][V ][HB]      T → V already there, C's through-route from T to V is one the game does not
//                                                       draw — a through-route joins two rail neighbours that are NOT each other's — so
//   the way through C is charged nothing: HA → T → C → V → HB (4 hops) beats the dear bridge (3 hops and a step). Review F4: charged
//   as if drawn, the line took the bridge. Without that railway (the CONTROL) the curve would be drawn, and the line takes the bridge.
console.log("\n-- ⭐ 1g. a triangle's through-route, which the game does not draw, is not charged --");
{
  const HA = 10, T = 11, CU = 12, V = 13, HB = 14;
  const rects = { [HA]: [[0, 0, 8, 40]], [T]: [[8, 0, 12, 40], [12, 0, 24, 3]], [CU]: [[12, 3, 16, 30], [32, 2, 36, 30], [12, 30, 36, 40]], [V]: [[36, 0, 40, 40], [24, 0, 36, 2]], [HB]: [[40, 0, 48, 40]] };
  const st = { [HA]: [4, 1], [T]: [10, 1], [CU]: [24, 35], [V]: [38, 1], [HB]: [44, 1] };
  const sh = curveShares(rects, st);
  ok(sh.through(T, CU, V) > 0.3 && sh.through(HA, T, V) === 0 && sh.through(T, V, HB) === 0 && sh.through(HA, T, CU) === 0 && sh.through(CU, V, HB) === 0,
    "(the fixture: C's through-route from T to V would run over the bay; the bridge's curves and the curves either side of C on land)",
    { cTV: sh.through(T, CU, V), tHAV: sh.through(HA, T, V), vTHB: sh.through(T, V, HB) });
  const opts = { rects, st, states: { 1: [HA, T, CU], 2: [V, HB] }, vps: { 1: [[HA, 5]], 2: [[HB, 5]] } };
  const ctl = plan("w1g-ctl", opts);
  ok(same(ctl.hubs, [HA, HB]) && ctl.rails.length === 1 && same(ctl.rails[0], [HA, T, V, HB]), "THE CONTROL: no railway T → V — C's through-route would be drawn, and the line takes the bridge", { hubs: ctl.hubs, rails: ctl.rails });
  const p = plan("w1g", { ...opts, rails: [[T, V]] });
  ok(same(p.hubs, [HA, HB]) && p.rails.length === 1 && same(p.rails[0], [HA, T, CU, V, HB]),
    "⭐⭐⭐ the railway T → V already there: T and V are rail neighbours, the game draws no through-route in C between them, and the line runs through C", { hubs: p.hubs, rails: p.rails });
}

// ── 1h. a lake ───────────────────────────────────────────────────────────────────────────────────────────────────────
console.log("\n-- ⭐ 1h. a lake is water: the planner goes round world 1's bay made a lake --");
{
  const rects = { ...W1, [LK]: [[12, 0, 36, 30]] };
  const lakeShare = curveShares(rects, ST1, (id) => id === SEA || id === LK).through(H1, C, H2);
  ok(lakeShare > 0.5, "(the fixture: the track through C from H1 to H2 runs more than half over the lake)", lakeShare);
  const p = plan("w1-lake", { rects, lakes: [LK] });
  ok(same(p.hubs, [H1, H2]) && p.rails.length === 1 && same(p.rails[0], [H1, S1, S2, H2]), "⭐⭐ the railway runs round the lake, H1 → S1 → S2 → H2", { hubs: p.hubs, rails: p.rails });
}

// ── 2. a hub's spur ──────────────────────────────────────────────────────────────────────────────────────────────────
//        x: 0   8   16 20          44 48
//   row 0   [H1][A1][H2]~~~ bay ~~~[H2]           H2: a U round its own bay, its station on the bottom (32, 35); a hub, so the game
//      20   [H1]~~~~[H2]~~~~~~~~~~~[H2]               draws a spur from each rail neighbour's crossing toward it
//      30   [H1]~~~~[H2 ................]         A1 meets H2's west arm at rows 0..20: its spur would cross the bay
//      40   [H1][ A2 ...................]         A2 meets H2's bottom: its spur is on land
console.log("\n-- ⭐ 2. a hub is entered from the side whose spur the game draws on land --");
{
  const A1 = 11, A2 = 12, HB = 13;
  const rects = { [H1]: [[0, 0, 8, 48]], [A1]: [[8, 0, 16, 20]], [A2]: [[8, 40, 48, 48]], [HB]: [[16, 0, 20, 30], [44, 0, 48, 30], [16, 30, 48, 40]] };
  const st = { [H1]: [4, 30], [A1]: [12, 14], [A2]: [12, 44], [HB]: [32, 35] };
  const opts = { rects, st, states: { 1: [H1, A1, A2], 2: [HB] }, vps: { 1: [[H1, 5]], 2: [[HB, 5]] } };
  const spur = curveShares(rects, st).spur;
  ok(spur(HB, A1) > 0.3 && spur(HB, A2) === 0, "(the fixture: H2's spur toward A1 runs over its bay, toward A2 on land)", [spur(HB, A1), spur(HB, A2)]);
  const p = plan("w2", opts);
  ok(same(p.hubs, [H1, HB]) && p.rails.length === 1 && same(p.rails[0], [H1, A2, HB]), "⭐⭐⭐ the railway enters H2 from A2: its spur on land", { hubs: p.hubs, rails: p.rails });
}

// ── 2b. a hub's spur on the first step of its own walk ─────────────────────────────────────────────────────────────
//   world 2 with G1 and G2 between H1 and the A's, so A1 and A2 are a step from H2 and two from H1: the walk from H2 is the one that
//   reaches them, and the link between the two hubs' lands is G1–A1 or G2–A2, not at H2. So H2's spur toward A1 is seen only as the
//   walk from H2 takes its first step (the spur in the province a step LEAVES), and with it unasked G1–A1 wins on its wider borders.
console.log("\n-- ⭐ 2b. a hub's spur is charged on its walk's first step, where no link reaches it --");
{
  const A1 = 11, A2 = 12, HB = 13, G1 = 14, G2 = 15;
  const rects = { [H1]: [[0, 0, 4, 48]], [G1]: [[4, 0, 8, 20]], [G2]: [[4, 20, 8, 48]], [A1]: [[8, 0, 16, 20]], [A2]: [[8, 40, 48, 48]], [HB]: [[16, 0, 20, 30], [44, 0, 48, 30], [16, 30, 48, 40]] };
  const st = { [H1]: [2, 30], [G1]: [6, 10], [G2]: [6, 34], [A1]: [12, 14], [A2]: [12, 44], [HB]: [32, 35] };
  const spur = curveShares(rects, st).spur;
  ok(spur(HB, A1) > 0.3 && spur(HB, A2) === 0, "(the fixture: H2's spur toward A1 runs over its bay, toward A2 on land)", [spur(HB, A1), spur(HB, A2)]);
  const p = plan("w2b", { rects, st, states: { 1: [H1, G1, G2, A1, A2], 2: [HB] }, vps: { 1: [[H1, 5]], 2: [[HB, 5]] } });
  ok(same(p.hubs, [H1, HB]) && p.rails.length === 1 && same(p.rails[0], [H1, G2, A2, HB]),
    "⭐⭐ the railway runs H1 → G2 → A2 → H2: the walk from H2 is charged its bay as it leaves for A1", { hubs: p.hubs, rails: p.rails });
}

// ── 2c. a naval base entered from its bay's side ────────────────────────────────────────────────────────────────────
//        x: 8  16  18      34 38 42 46    56  64  72  80  88  96
//   row 0   [H1]  [ M ............ ]                                   N: a naval base (no hub, no town), a bar along row 16..20
//       8   [H1][ P ......... ]~~[ Q ...................][R ][S ][T ][H2]  and an arm down x 46..56, its station low on the arm
//      16       [ N ......................... ][N ]                    (51, 32). The game spurs a naval base toward each rail
//      20        ~~~~~~~~~~~~~ bay ~~~~~~~~~~~ [N ]                     neighbour: toward P from the bar's west end, over the bay;
//                                                                      toward Q from right above its station, on land
//   The walk from H1 takes N two steps out, entering it from P and leaving for Q; the way round by M is as long, its M–Q border 4 px.
//   So N's spur toward P is seen only as the walk ENTERS N (the spur in the province a step enters), and with it unasked the walk
//   through N wins on its wider borders. The link between the two hubs' lands is Q–R, far from N.
console.log("\n-- ⭐ 2c. a naval base's spur toward the side it is entered from is charged as the walk enters it --");
{
  const Pp = 11, N = 12, Q = 13, M = 14, R = 15, S = 16, T = 17, HE = 18;
  const rects = { [H1]: [[8, 0, 16, 16]], [M]: [[18, 0, 42, 8]], [Pp]: [[16, 8, 34, 16]], [Q]: [[38, 8, 64, 16]], [N]: [[16, 16, 46, 20], [46, 16, 56, 48]],
    [R]: [[64, 8, 72, 16]], [S]: [[72, 8, 80, 16]], [T]: [[80, 8, 88, 16]], [HE]: [[88, 8, 96, 16]] };
  const st = { [H1]: [12, 8], [M]: [30, 4], [Pp]: [25, 12], [Q]: [51, 12], [N]: [51, 32], [R]: [68, 12], [S]: [76, 12], [T]: [84, 12], [HE]: [92, 12] };
  const sh = curveShares(rects, st);
  const shares = !hasCurve() ? null : { spurP: sh.spur(N, Pp), spurQ: sh.spur(N, Q), through: sh.through(Pp, N, Q) };
  ok(!!shares && shares.spurP > 0.3 && shares.spurQ === 0 && shares.through === 0,
    "(the fixture: N's spur toward P runs over the bay; toward Q, and its through-route from P to Q, on land)", shares);
  const p = plan("w2c", { rects, st, states: { 1: [H1, M, Pp, N, Q], 2: [R, S, T, HE] }, vps: { 1: [[H1, 5]], 2: [[HE, 5]] }, naval: [N] });
  ok(same(p.hubs, [H1, HE]) && p.rails.length === 1 && same(p.rails[0], [H1, Pp, M, Q, R, S, T, HE]),
    "⭐⭐ the railway runs H1 → P → M → Q …: the walk is charged N's bay as it enters N from P", { hubs: p.hubs, rails: p.rails });
}

// ── 3. inside one hub's walk ─────────────────────────────────────────────────────────────────────────────────────────
//   world 1 with H2 moved two provinces east: Q takes H2's place, R and H2 beyond it. Q is one step from C and two from H2, so the walk
//   from H1 reaches Q THROUGH C — the curve over the bay is inside H1's walk, and only the search's charge sees it.
console.log("\n-- ⭐ 3. the curve over the bay on the walk inside one hub's land: charged in the search, not only in the link --");
{
  const Q = 12, R = 13, HE = 14, T1 = 15, T2 = 16;
  const rects = { [H1]: W1[H1], [C]: U, [Q]: [[40, 0, 48, 40]], [R]: [[48, 0, 56, 40]], [HE]: [[56, 0, 64, 40]], [T1]: [[0, 40, 24, 48]], [T2]: [[24, 40, 48, 48]] };
  const st = { [H1]: [4, 5], [C]: [24, 35], [Q]: [44, 5], [R]: [52, 20], [HE]: [60, 20], [T1]: [8, 44], [T2]: [40, 44] };
  const p = plan("w3", { rects, st, states: { 1: [H1, C, T1, T2], 2: [Q, R, HE] }, vps: { 1: [[H1, 5]], 2: [[HE, 5]] } });
  ok(same(p.hubs, [H1, HE]) && p.rails.length === 1 && same(p.rails[0], [H1, T1, T2, Q, R, HE]),
    "⭐⭐⭐ H1 → T1 → T2 → Q → R → H2: round the bay, where the walk from H1 would have reached Q through C", { hubs: p.hubs, rails: p.rails });
}

// ── 4. Auto-fix's path ───────────────────────────────────────────────────────────────────────────────────────────────
console.log("\n-- ⭐ 4. Auto-fix's join (a joinOnly call hubbing a capital) lays the same way round --");
{
  const p = plan("w1-join", { nodes: [H1], capital: 2 }, { stateIds: [2], joinOnly: true });
  ok(p.r && !p.r.error && same(p.hubs, [H2]), "(the fixture: H1 is the map's hub; the call hubs AAA's capital, H2)", { hubs: p.hubs, err: p.r && p.r.error });
  ok(p.rails.length === 1 && same(p.rails[0], [H1, S1, S2, H2]), "⭐⭐⭐ the new hub is joined round the bay, as Generate land joins it", p.rails);
}

// ── 5. the Railway tool's question ───────────────────────────────────────────────────────────────────────────────────
console.log("\n-- ⭐ 5. railwayCurvesOverWater: the curves a change would have drawn over water, and only those --");
const TOOL = makeMod("tool", { nodes: [H1, H2] });
const ask = (rows, at, mod = TOOL, more = {}) => (typeof md.railwayCurvesOverWater === "function" ? md.railwayCurvesOverWater({ ...roots(mod), rows, at, ...more }) : { ok: false, error: "no railwayCurvesOverWater" });
{
  const r = ask([[H1, C, H2]], [C]);
  ok(r.ok && r.overWater.length === 1 && r.overWater[0].province === C && r.overWater[0].kind === "through" && r.overWater[0].from === H1 && r.overWater[0].to === H2,
    "⭐⭐⭐ H1 → C → H2: the through-route in C, from H1 to H2, is over water", r);
  const want = curveShares(W1, ST1).through(H1, C, H2);
  ok(r.ok && r.overWater.length === 1 && near(r.overWater[0].share, Math.round(want * 1000) / 1000), "⭐ …by the same share the planner charges it by (the same functions, on the map as saved)", { got: r.overWater, want });
  const two = ask([[H1, C], [C, H2]], [C]);
  ok(two.ok && two.overWater.length === 1 && two.overWater[0].province === C, "⭐ two lines meeting in C are the same through-route: a junction is asked too", two);
  const round = ask([[H1, S1, S2, H2]], [H1, S1, S2, H2]);
  ok(round.ok && round.overWater.length === 0, "⭐⭐ the way round: nothing over water, at any of its four provinces", round);
  const end = ask([[H1, C]], [C]);
  ok(end.ok && end.overWater.length === 1 && end.overWater[0].kind === "spur" && end.overWater[0].from === H1, "⭐ a line that ends in C: the game draws a spur there, and it crosses the bay", end);
  const notAsked = ask([[H1, C, H2]], [H1, H2]);
  ok(notAsked.ok && notAsked.overWater.length === 0, "…only the provinces asked are judged: H1's and H2's spurs are on land", notAsked);
  ok(ask([[H1, C, H2]], []).ok && ask([[H1, C, H2]], []).overWater.length === 0, "…nothing asked: nothing over water, and no map read");
  // ⛔ review F4: a triangle — the game draws a through-route only between two rail neighbours that are not each other's
  const tri = ask([[H1, C, H2], [H1, H2]], [C]);
  ok(tri.ok && tri.overWater.length === 0, "⭐⭐ H1 and H2 rail neighbours too (a triangle): the game draws no through-route in C between them, and none is named", tri);
  // …and a lake is water
  const lake = ask([[H1, C, H2]], [C], makeMod("tool-lake", { rects: { ...W1, [LK]: [[12, 0, 36, 30]] }, nodes: [H1, H2], lakes: [LK] }));
  ok(lake.ok && lake.overWater.length === 1 && lake.overWater[0].province === C && lake.overWater[0].kind === "through", "⭐⭐ the bay a lake: the track over it is over water too", lake);
  // ⛔ review F2 (10-28): A CHANGE IS JUDGED BY WHAT IT ADDS. C a hub with the railway H1 → C already there: the game spurs C toward H1,
  // over the bay, before any new line. A line C → S1 adds C's through-route from H1 down to S1 and its spur toward S1, both on land.
  const HUBC = makeMod("tool-hub-c", { nodes: [H1, H2, C] });
  const before = ask([[H1, C]], [C], HUBC);
  ok(before.ok && before.overWater.length === 1 && before.overWater[0].kind === "spur" && before.overWater[0].from === H1,
    "(the fixture: the railway H1 → C already there, C a hub: its spur toward H1 is drawn over the bay)", before);
  const plain = ask([[H1, C], [C, S1]], [C], HUBC);
  ok(plain.ok && plain.overWater.length === 1, "(…asked without the rail before, the line C → S1 hears of it: the note the reviewer found)", plain);
  const diff = ask([[H1, C], [C, S1]], [C], HUBC, { was: { rows: [[H1, C]] } });
  ok(diff.ok && diff.overWater.length === 0 && diff.already === 1,
    "⭐⭐⭐ asked with the rail before (`was`), the line C → S1 is told nothing: the curve over the bay is the rail already there's, and `already` counts it", diff);
  const added = ask([[H1, C], [C, H2]], [C], TOOL, { was: { rows: [[H1, C]] } });
  ok(added.ok && added.overWater.length === 1 && added.overWater[0].kind === "through" && added.already === 0,
    "⭐⭐ …while a line C → H2 out of the same dead end adds the through-route over the bay, and is told of it (the old spur goes, it is not named)", added);
  // ⛔ review F3: the hubs the page holds, saved or not, in place of the map's saved ones
  const hubbed = ask([[H1, C], [C, S1]], [C], TOOL, { hubs: [C], was: { rows: [[H1, C], [C, S1]], hubs: [] } });
  ok(hubbed.ok && hubbed.overWater.length === 1 && hubbed.overWater[0].kind === "spur" && hubbed.overWater[0].from === H1,
    "⭐⭐⭐ C hubbed on the page and not saved, the railways the same: the spur the game will draw in the hub toward H1, over the bay, is the change's", hubbed);
  const dropped = ask([[H1, C], [C, S1]], [C], HUBC, { hubs: [] });
  ok(dropped.ok && dropped.overWater.length === 0, "⭐⭐ …and the hub C taken off on the page, not saved: judged with no hub there, nothing over water", dropped);
}
// the game spurs a hub, a naval base and a capital toward every rail neighbour: world 2's H2, here no hub, on a line A1 → H2 → A2
console.log("\n-- ⭐ 5b. …and the spurs the game draws in a hub, a naval base and a capital --");
{
  const A1 = 11, A2 = 12, HB = 13;
  const rects = { [H1]: [[0, 0, 8, 48]], [A1]: [[8, 0, 16, 20]], [A2]: [[8, 40, 48, 48]], [HB]: [[16, 0, 20, 30], [44, 0, 48, 30], [16, 30, 48, 40]] };
  const st = { [H1]: [4, 30], [A1]: [12, 14], [A2]: [12, 44], [HB]: [32, 35] };
  const base = { rects, st, nodes: [H1], states: { 1: [H1, A1, A2], 2: [HB] }, vps: { 1: [[H1, 5]], 2: [[HB, 5]] } };
  const spurs = (mod, more) => { const r = ask([[A1, HB, A2]], [HB], mod, more); return r.ok ? r.overWater.filter((w) => w.kind === "spur" && w.province === HB).map((w) => w.from) : null; };
  const plainMod = makeMod("tool-plain", { ...base, capital: 1 });
  const plain = spurs(plainMod);
  const naval = makeMod("tool-naval", { ...base, capital: 1 });
  write(naval, "history/states/2-S.txt", `state={\n\tid=2\n\tname="STATE_2"\n\tmanpower=1000\n\tstate_category=rural\n\tprovinces={ ${HB} }\n\thistory={\n\t\towner=AAA\n\t\tvictory_points = { ${HB} 5 }\n\t\tbuildings = {\n\t\t\t${HB} = { naval_base = 1 }\n\t\t}\n\t}\n}\n`);
  const capital = spurs(makeMod("tool-capital", { ...base, capital: 2 }));
  const hub = spurs(makeMod("tool-hub", { ...base, nodes: [H1, HB], capital: 1 }));
  ok(Array.isArray(plain) && plain.length === 0, "THE CONTROL: H2 neither a hub, a naval base nor a capital, with two rail neighbours: no spur is drawn in it", plain);
  ok(same(hub, [A1]), "⭐⭐⭐ H2 a hub with two rail neighbours: the game spurs a hub toward each, and its spur toward A1 crosses its bay (review F4)", hub);
  ok(same(spurs(plainMod, { hubs: [HB] }), [A1]), "⭐⭐ …and the same when H2 is hubbed on the page and not saved (review F3)", spurs(plainMod, { hubs: [HB] }));
  ok(same(spurs(naval), [A1]), "⭐⭐ a naval base in H2: the game spurs it, and its spur toward A1 crosses its bay", spurs(naval));
  ok(same(capital, [A1]), "⭐⭐ H2 its country's capital (its state's victory point): the same", capital);
}

// ── 6. the page ──────────────────────────────────────────────────────────────────────────────────────────────────────
console.log("\n-- ⭐ 6. the map editor's tools add a note, through server.js's own handler, and never refuse --");
(async () => {
  const SERVER = fs.readFileSync(path.join(__dirname, "server.js"), "utf8").replace(/\r\n/g, "\n");
  const at = SERVER.indexOf('app.post("/api/map/railway-curves"');
  const end = at < 0 ? -1 : SERVER.indexOf("\n  app.", at + 10);
  ok(at >= 0 && end > at, "(server.js's /api/map/railway-curves handler is found)", { at, end });
  const routes = {};
  if (at >= 0 && end > at) vm.runInNewContext(SERVER.slice(at, end), {
    app: { post: (url, mw, fn) => { routes[url] = fn; } }, express: { json: () => null }, mapData: md, DEV_ROOT: "<dev>",
    getActiveRoot: () => "", resolveHoi4GameRoot: () => GAME, resolveDependencyRootsForAssets: () => [],
  });
  const sent = [];
  // the page's fetch, answered by the server's own handler with the body the page built
  const fetch = (url, opts) => {
    const body = JSON.parse(opts.body);
    sent.push({ url, body });
    let status = 200, json = null;
    if (!routes[url]) return Promise.resolve({ status: 404, json: () => Promise.resolve({ ok: false, error: "no route" }) });
    routes[url]({ body }, { status(c) { status = c; return this; }, json(j) { json = j; return this; } });
    return Promise.resolve({ status, json: () => Promise.resolve(json) });
  };
  const at1 = provAt(W1), data = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const c = colour(at1(x, y)), i = (y * W + x) * 4; data[i] = c[0]; data[i + 1] = c[1]; data[i + 2] = c[2]; data[i + 3] = 255; }
  const ids = [SEA, H1, C, H2, S1, S2];
  const colorToProvince = new Map(ids.map((id) => { const c = colour(id); return [(c[0] << 16) | (c[1] << 8) | c[2], id]; }));
  const provinceType = new Map(ids.map((id) => [id, id === SEA ? "sea" : "land"]));
  const queued = [];
  const fns = ["function buildPidGrid(", "function buildProvNeighbors(", "function supplyRailReason(", "function railLinkReason(", "function railLinkTouches(", "function handleRailwayClick(",
    "function updateRailBar(", "function finishRailway(", "function handleSupplyHubClick(", "function removeRailway("];
  const savedHubs = () => [{ level: 1, province: H1 }, { level: 1, province: H2 }];   // the TOOL mod's supply_nodes.txt
  const { sb, statuses } = P.runPage(fns, P.loadGlobals({
    imgW: W, imgH: H, baseImageData: { data, width: W, height: H }, baseImageDataPristine: null, colorToProvince, provinceType,
    model: { provinceToState: { [H1]: 1, [S1]: 1, [C]: 1, [H2]: 2, [S2]: 2 }, adjacencies: [], railways: [], supplyNodes: savedHubs() },
    railPath: [], pidGrid: null, borderEdges: null, provNeighborsCache: null, seaAdjacent: null, draw() {},
    pushUndo() {}, queueWrite: (url, body) => queued.push({ url, body }), modPath: () => TOOL, fetch,
  }));
  sb.buildPidGrid();
  const last = () => statuses[statuses.length - 1] || "";
  const NOTE = /over water/i;
  const click = async (...pids) => { for (const p of pids) sb.handleRailwayClick(p); await P.settle(40); };
  const rails = (...rows) => rows.map((r) => ({ level: 1, provinces: r }));
  const lastAsk = () => (sent[sent.length - 1] || { body: {} }).body;

  sb.railPath = []; sent.length = 0;
  await click(H1, C);
  ok(same(sb.railPath, [H1, C]) && !NOTE.test(last()) && sent.length === 1 && same(sent[0].body.at, [H1]),
    "⭐ the second click asks only of the first province, the one it settles (H1's spur, on land): no note", { path: sb.railPath, status: last(), sent: sent.map((s) => s.body) });
  await click(H2);
  ok(same(sb.railPath, [H1, C, H2]), "⭐⭐⭐ the click across the bay is TAKEN: the tool does not refuse the modder's line", sb.railPath);
  ok(sent.length === 2 && same(sent[1].body.at, [C]) && sent[1].body.modPath === TOOL && (sent[1].body.rows || []).some((r) => same(r, [H1, C, H2])),
    "⭐ …it asks of C, the province the line now runs through, with the line itself, for the mod the page has open", sent.map((s) => s.body));
  ok(!!sent[1] && !!sent[1].body.was && Array.isArray(sent[1].body.was.rows) && Array.isArray(sent[1].body.hubs),
    "⭐ …with the rail as it was before the line (`was`) and the page's own hubs, saved or not", sent[1] && sent[1].body);
  ok(/^🛤 Railway: 3 provinces/.test(last()) && NOTE.test(last()) && new RegExp(`province ${C}\\b`).test(last()) && new RegExp(`${H1} and ${H2}`).test(last()),
    "⭐⭐⭐ …and the line on screen says the game will draw its track over water in province C, between its borders with H1 and H2", last());
  ok(/still carries supply/.test(last()) && /round the bay/.test(last()) && !/not saved yet/.test(last()), "⭐ …that the railway still works, and what keeps its track on land", last());
  sb.finishRailway(); await P.settle(40);
  ok(queued.length === 1 && same(queued[0].body.provinces, [H1, C, H2]), "⭐⭐ Finish stages the line as drawn", queued);
  ok(/^🛤 Railway across 3 provinces/.test(last()) && NOTE.test(last()) && same(lastAsk().at, [H1, C, H2]),
    "⭐⭐ …and says it once more of the whole line, asked of all three provinces", { status: last(), at: lastAsk().at });

  sb.model.railways = []; sb.railPath = []; sent.length = 0; statuses.length = 0;
  await click(H1, S1, S2, H2);
  sb.finishRailway(); await P.settle(40);
  ok(sent.length === 4 && statuses.length > 0 && !statuses.some((s) => NOTE.test(s)), "⭐⭐ the way round: four asks, and not one note", { sent: sent.length, statuses });

  // a junction: the line just staged runs through C, and a new line into C meets it there
  sb.model.railways = rails([H1, C, H2]);
  sb.railPath = []; sent.length = 0;
  await click(S2, C, S1);
  ok(sent.length === 2 && same(sent[1].body.at, [C]) && (sent[1].body.rows || []).some((r) => same(r, [H1, C, H2])),
    "⭐ a line through a junction sends the railway already there through it (whose curves meet the new one's)", sent.map((s) => s.body));

  // ⛔ review F2: the rail already there is not the new line's. C hubbed on the page (not saved) and the railway H1 → C held: the game
  // spurs C toward H1 over the bay before any new line; a line C → S1 adds only curves on land
  sb.model.railways = rails([H1, C]); sb.model.supplyNodes = savedHubs().concat([{ level: 1, province: C }]);
  sb.railPath = []; sent.length = 0; statuses.length = 0;
  await click(C, S1);
  ok(sent.length === 1 && same(sent[0].body.at, [C]) && (sent[0].body.hubs || []).includes(C) && !NOTE.test(last()),
    "⭐⭐⭐ a new line out of a province whose rail already draws a curve over water hears nothing of it: the curve is not the line's", { status: last(), body: sent[0] && sent[0].body });
  sb.finishRailway(); await P.settle(40);
  ok(!NOTE.test(last()), "⭐⭐ …nor at Finish", last());

  // ⛔ review F3: a 🏭 Supply hub click changes the track: the game spurs a hub toward each rail neighbour
  sb.model.railways = rails([H1, C, H2]); sb.model.supplyNodes = savedHubs();
  sent.length = 0; statuses.length = 0;
  sb.handleSupplyHubClick(C); await P.settle(40);
  ok(sent.length === 1 && same(sent[0].body.at, [C]) && (sent[0].body.hubs || []).includes(C) && sent[0].body.was && !(sent[0].body.was.hubs || []).includes(C),
    "⭐ the hub click asks of the province hubbed, with the page's hubs after the click and before it", sent.map((s) => s.body));
  ok(/^🏭 Supply hub on province/.test(last()) && NOTE.test(last()) && /With a supply hub here/.test(last()) && new RegExp(`province ${C}\\b`).test(last()) && /to its station/.test(last()),
    "⭐⭐⭐ …and says the game will draw the hub's spur over water in province C, to its station (the through-route over the bay is not the hub's)", last());
  sb.model.railways = rails([H1, S1, S2, H2]); sb.model.supplyNodes = savedHubs();
  sent.length = 0; statuses.length = 0;
  sb.handleSupplyHubClick(S1); await P.settle(40);
  ok(sent.length === 1 && /^🏭 Supply hub on province/.test(last()) && !NOTE.test(last()), "THE CONTROL: a hub on S1, its spurs on land: no note", last());
  sent.length = 0;
  sb.handleSupplyHubClick(S1); await P.settle(40);
  ok(sent.length === 0 && /^Removed the supply hub/.test(last()), "…and a hub taken away only takes spurs away: nothing asked", { sent: sent.length, status: last() });
  sb.model.railways = rails([H1, C, H2]); sb.model.supplyNodes = savedHubs();
  sent.length = 0;
  sb.handleSupplyHubClick(S1); await P.settle(40);
  ok(sent.length === 0 && /^🏭 Supply hub on province/.test(last()) && !NOTE.test(last()), "…nor a hub no railway runs through: it draws no track", { sent: sent.length, status: last() });
  sb.model.supplyNodes = savedHubs();
  // ⛔ review F3: an unsaved hub is the page's: a line drawn through C just hubbed on the page is judged with the hub there
  sb.model.railways = []; sb.model.supplyNodes = savedHubs().concat([{ level: 1, province: C }]);
  sb.railPath = []; sent.length = 0;
  await click(H1, C, H2);
  ok(NOTE.test(last()) && /and in 2 more of its curves/.test(last()), "⭐⭐ a line through C hubbed and not saved: its through-route AND the hub's two spurs, over the bay", last());
  sb.railPath = [];

  // ⛔ review F3: a railway removed changes the track of the rail left: C left at the end of a line is spurred toward H1, over the bay
  sb.model.railways = rails([H1, C], [C, H2]); sb.model.supplyNodes = savedHubs();
  sent.length = 0; statuses.length = 0;
  sb.removeRailway(1); await P.settle(40);
  ok(sent.length === 1 && [C, H2, H1].every((p) => (sent[0].body.at || []).includes(p)) && (sent[0].body.rows || []).length === 1 && (sent[0].body.was.rows || []).length === 2,
    "⭐ removing a railway asks of its provinces and their rail neighbours, the rail left against the rail before", sent.map((s) => s.body));
  ok(/^🛤 Railway removed/.test(last()) && NOTE.test(last()) && /Without this railway/.test(last()) && new RegExp(`province ${C}, from its border with ${H1}`).test(last()),
    "⭐⭐⭐ …and says the rail left will draw C's spur toward H1 over the bay", last());
  sb.model.railways = rails([H1, S1, S2, H2]);
  sent.length = 0; statuses.length = 0;
  sb.removeRailway(0); await P.settle(40);
  ok(sent.length === 1 && /^🛤 Railway removed/.test(last()) && !NOTE.test(last()), "THE CONTROL: removing a railway that leaves nothing over water: no note", last());

  // the next click before the answer: the answer for the line that was is not added to the line that is
  sb.model.railways = []; sb.model.supplyNodes = savedHubs();
  sb.railPath = []; sent.length = 0; statuses.length = 0;
  sb.handleRailwayClick(H1); sb.handleRailwayClick(C); sb.handleRailwayClick(H2); sb.handleRailwayClick(S2);
  await P.settle(40);
  ok(same(sb.railPath, [H1, C, H2, S2]) && sent.length === 3 && !NOTE.test(last()),
    "⭐⭐ an answer that comes back after the next click says nothing (the CONTROL above shows the same click's note)", { path: sb.railPath, status: last(), asks: sent.length });
  // ⛔ review F4: …and after Finish, an answer is added only to the line ITS Finish left — not to a hub click's, a new line's first
  // click's (no ask: only the line on screen differs), or another Finish's of the same length (the same line on screen: only the ask
  // order differs)
  const finishWet = () => { sb.model.railways = []; sb.railPath = [H1, C, H2]; sb.finishRailway(); };
  sb.model.supplyNodes = [{ level: 1, province: H2 }];   // H1 not hubbed on the page: the click hubs it on the line just Finished, and asks
  sent.length = 0; statuses.length = 0;
  finishWet(); sb.handleSupplyHubClick(H1);
  await P.settle(40);
  ok(sent.length === 2 && /^🏭 Supply hub on province/.test(last()) && !NOTE.test(last()), "⭐⭐ Finish, then a hub click before its answer: the Finish's note is not added to the hub's line", { status: last(), asks: sent.length });
  sb.model.supplyNodes = savedHubs();
  sent.length = 0; statuses.length = 0;
  finishWet(); sb.handleRailwayClick(S1);
  await P.settle(40);
  ok(sent.length === 1 && /^🛤 Railway: 1 province/.test(last()) && !NOTE.test(last()), "⭐⭐ Finish, then a new line's first click (which asks nothing): the note is not added to the new line", { status: last(), asks: sent.length });
  sent.length = 0; statuses.length = 0;
  finishWet(); sb.railPath = [H1, S1, S2]; sb.finishRailway();
  await P.settle(40);
  ok(sent.length === 2 && /^🛤 Railway across 3 provinces/.test(last()) && !NOTE.test(last()), "⭐⭐ Finish, then another line of three Finished before its answer: the first line's note is not added to the second's, though the line reads the same", { status: last(), asks: sent.length });
  sent.length = 0; statuses.length = 0;
  finishWet(); await P.settle(40);
  ok(sent.length === 1 && NOTE.test(last()), "THE CONTROL: Finish alone, and the note comes", last());

  // painted shapes staged: the note says the map it was judged on
  sb.model.railways = [];
  sb.paintDiff = new Map([["30,20", { x: 30, y: 20, r: 0, g: 0, b: 0 }]]);
  sb.railPath = [];
  await click(H1, C, H2);
  ok(NOTE.test(last()) && /Judged on the map as saved/.test(last()), "⭐ with painted shapes not saved yet, the note says it was judged on the map as saved", last());
  sb.paintDiff = new Map();

  try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) { /* scratch only */ }
  console.log("\n" + (fail ? "FAILED " + fail + "/" + (pass + fail) : "PASSED " + pass + "/" + pass) + (skipped ? ` (${skipped} skipped)` : ""));
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.log("  FAIL the page section threw: " + (e && e.stack || e)); try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {} process.exit(1); });
