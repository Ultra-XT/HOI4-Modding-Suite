// ⛔ #a-railway-climbs-round-a-mountain — AN ARROW THAT CLIMBS STEEPLY COSTS A GENERATED RAILWAY ONE STEP MORE, AND GENERATE LAND
// PLANS ITS RAIL ON THE GROUND IT HAS JUST RAISED.
//
// The owner played TEST 32 (10-02) at Shagrei: "the rail just climb the mountains". generateSupplyNetwork knew nothing of the
// ground, and Generate land planned it before the raise anyway, while the new land still read 89. Re-planned on the base game's
// own hubs, the planner's steepest climb per link (the largest rise over 8 px of the station-to-station arrow) was p99 44 where
// Paradox's rails are 37; counted one step more from 46 it is 37.
//
// Pinned on small worlds of rectangles, a heightmap and stations written into the fixture (no game is read):
//   · arrowClimb, the measurement: a ramp of 46 over 8 px of land is 46, 45 is 45; a water sample breaks the stretch; both ways
//     round the same; the seam and a missing station are not measured;
//   · two hubs either side of a ridge go round it by a way one province longer — at 46, not at 45;
//   · a climb is not a ban: one steep arrow still beats a way two provinces longer;
//   · it is the ARROW that is measured, not the province: the same ridge with the stations below it, and the rail goes straight;
//   · two NEIGHBOURING hubs keep their own rail over a ridge — and only two hubs: a steep arrow from a province that is not one
//     into a hub still costs the step;
//   · both halves of the plan charge a climb: the search that grows each hub's land walks round a steep arrow inside it, and
//     the link between two hubs' lands costs the step when it climbs — a steep arrow out of a hub needs the two together;
//   · the ground is the one that loads: a heightmap only in the layer below is read; none at all, and nothing is asked; one
//     that is not the size of provinces.bmp lies under nothing, and is not read;
//   · the plan says what it measured (railClimbs), each border once;
//   · Generate land measures the RAISED ground: its plan's steepest climb is not the 0 of a world still at the sea's 89.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-rail-climb-"));
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
  const rs = Math.floor((8 * W + 31) / 32) * 4, isz = rs * H, b = Buffer.alloc(54 + 1024 + isz);
  b.write("BM", 0, "ascii"); b.writeUInt32LE(b.length, 2); b.writeUInt32LE(54 + 1024, 10); b.writeUInt32LE(40, 14);
  b.writeInt32LE(W, 18); b.writeInt32LE(H, 22); b.writeUInt16LE(1, 26); b.writeUInt16LE(8, 28); b.writeUInt32LE(isz, 34);
  b.writeUInt32LE(256, 46); b.writeUInt32LE(256, 50);
  for (let i = 0; i < 256; i++) { const o = 54 + i * 4; b[o] = i; b[o + 1] = i; b[o + 2] = i; }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) b[54 + 1024 + (H - 1 - y) * rs + x] = Math.max(0, Math.min(255, Math.round(fn(x, y))));
  return b;
}
const colour = (id) => [(id * 29) % 256, (id * 67) % 256, 30 + id];
const SEA = 1, FLAT = 100, SEA_H = 89;
const sameWay = (row, want) => !!row && (row.join() === want.join() || row.slice().reverse().join() === want.join());

// ── the world ────────────────────────────────────────────────────────────────────────────────────────────────────────
//        x: 0     16              48     64                128
//   y 0   [ A    ][ M              ][ B    ]  ~~~ sea ~~~        A, B: the two hubs (each its state's victory point)
//    20   [ A    ][ S1    ][ S2    ][ B    ]  ~~~ sea ~~~        M north of S1 and S2; every border 16 or 20 px wide
// Stations: A (8, 10), M (32, 10), B (56, 10), S1 (24, 30), S2 (40, 30). The ridge runs north–south through M on rows 0..19:
// FLAT west of x 24, rising to FLAT + rise at x 32, back to FLAT at x 40 — so the arrows A→M and M→B each climb `rise` over 8 px,
// and the arrows round by S1 and S2 stay on the flat (measured below, not assumed).
const W = 128, H = 40, A = 10, M = 11, B = 12, S1 = 13, S2 = 14, S3 = 15;
const TWO = { [A]: [[0, 0, 16, 40]], [M]: [[16, 0, 48, 20]], [S1]: [[16, 20, 32, 40]], [S2]: [[32, 20, 48, 40]], [B]: [[48, 0, 64, 40]] };
// the way round two provinces longer: three southern provinces, kept off M by a strip of sea on rows 20-21, so no way round is one longer
const THREE = { [A]: [[0, 0, 16, 40]], [M]: [[16, 0, 48, 20]], [S1]: [[16, 22, 27, 40]], [S2]: [[27, 22, 38, 40]], [S3]: [[38, 22, 48, 40]], [B]: [[48, 0, 64, 40]] };
const ST = { [A]: [8, 10], [M]: [32, 10], [B]: [56, 10], [S1]: [24, 30], [S2]: [40, 30] };
const ST3 = { [A]: [8, 10], [M]: [32, 10], [B]: [56, 10], [S1]: [21, 30], [S2]: [32, 30], [S3]: [43, 30] };
const provAt = (rects) => (x, y) => { for (const [id, rs] of Object.entries(rects)) for (const [x0, y0, x1, y1] of rs) if (x >= x0 && x < x1 && y >= y0 && y < y1) return +id; return SEA; };
// a tent `rise` high, peak at x 32, rows 0..ridgeRows-1; `east` false: the west face only (up at x 24..32, then down 16 px, half as steep)
const ridge = (rise, { ridgeRows = 20, east = true } = {}) => (x, y) => {
  if (y >= ridgeRows || x < 24 || x >= 48) return FLAT;
  if (x <= 32) return FLAT + (rise * (x - 24)) / 8;
  return east ? Math.max(FLAT, FLAT + rise - (rise * (x - 32)) / 8) : FLAT + rise - (rise * (x - 32)) / 16;
};
const stackRows = (st) => Object.entries(st).map(([p, [x, row]]) => [0, 9, 38].map((ty) => `${p};${ty};${x}.00;10.00;${H - 1 - row}.00;0.00;0.00`).join("\n")).join("\n") + "\n";
// every pair of land provinces that share a pixel edge, read off the fixture's own rectangles
const landPairs = (rects) => {
  const at = provAt(rects), out = new Set();
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const p = at(x, y);
    for (const [qx, qy] of [[x + 1, y], [x, y + 1]]) {
      if (qx >= W || qy >= H) continue;
      const q = at(qx, qy);
      if (p !== SEA && q !== SEA && p !== q) out.add(`${Math.min(p, q)}-${Math.max(p, q)}`);
    }
  }
  return [...out].map((k) => k.split("-").map(Number));
};

/** A mod over a fixture world. `ground`: (x, y) → height of land (sea reads 89), or null for no heightmap. `groundBelow`: the
 *  same, written only into the layer below (the fixture's gameRoot). `raw`: (provAt) → the mod's heightmap.bmp bytes, written
 *  as they are. Every state AAA's, its hub on its victory point. */
function world(tag, { rects = TWO, st = ST, ground = null, groundBelow = null, raw = null, states = null }) {
  const mod = path.join(ROOT, tag), game = path.join(ROOT, tag + "-below");
  const at = provAt(rects);
  write(mod, "descriptor.mod", `name="${tag}"\nreplace_path="history/states"\n`);
  write(mod, "map/provinces.bmp", bmp24(W, H, (x, y) => colour(at(x, y))));
  const ids = [SEA].concat(Object.keys(rects).map(Number));
  write(mod, "map/definition.csv", ["0;0;0;0;land;false;unknown;0"].concat(ids.map((id) => `${id};${colour(id).join(";")};${id === SEA ? "sea;false;ocean;0" : "land;false;plains;1"}`)).join("\n") + "\n");
  const land = Object.keys(rects).map(Number);
  states = states || { 1: { provs: land.filter((p) => p !== B), vp: A }, 2: { provs: [B], vp: B } };
  for (const [s, { provs, vp }] of Object.entries(states)) {
    write(mod, `history/states/${s}-S.txt`, `state={\n\tid=${s}\n\tname="STATE_${s}"\n\tmanpower=1000\n\tstate_category=rural\n\tprovinces={ ${provs.join(" ")} }\n\thistory={\n\t\towner=AAA\n\t\tvictory_points = { ${vp} 5 }\n\t}\n}\n`);
  }
  write(mod, "map/adjacencies.csv", "From;To;Type;Through;start_x;start_y;stop_x;stop_y;adjacency_rule_name;Comment\n-1;-1;-1;-1;-1;-1;-1;-1;-1\n");
  write(mod, "map/supply_nodes.txt", "");
  write(mod, "map/railways.txt", "");
  write(mod, "map/unitstacks.txt", stackRows(st));
  const hm = (g) => bmp8(W, H, (x, y) => (at(x, y) === SEA ? SEA_H : g(x, y)));
  if (ground) write(mod, "map/heightmap.bmp", hm(ground));
  if (groundBelow) write(game, "map/heightmap.bmp", hm(groundBelow));
  if (raw) write(mod, "map/heightmap.bmp", raw(at));
  const plan = md.generateSupplyNetwork({ modRoot: mod, gameRoot: groundBelow ? game : path.join(ROOT, "no-game"), dependencyRoots: [], dryRun: true }) || {};
  return { plan, rails: (plan.railRows || []).map((r) => r.provinces) };
}
const climb = (...a) => (typeof md.arrowClimb === "function" ? md.arrowClimb(...a) : undefined);
const SPAN = md.RAIL_CLIMB_SPAN, LIMIT = md.RAIL_CLIMB;
// the climb of the arrow between two stations of a fixture, on the ground `g` as the fixture's heightmap holds it (one byte a
// pixel, as bmp8 writes it), land samples only
const asWritten = (g) => (x, y) => Math.max(0, Math.min(255, Math.round(g(x, y))));
const climbOn = (rects, g) => (P, Q) => climb({ W, H, A: { x: P[0], row: P[1] }, B: { x: Q[0], row: Q[1] }, span: SPAN, heightAt: asWritten(g), isLandAt: (x, y) => provAt(rects)(x, y) !== SEA });

// ── the measurement ──────────────────────────────────────────────────────────────────────────────────────────────────
console.log("\n-- ⭐ the measurement: the largest rise over RAIL_CLIMB_SPAN px of land along the station-to-station arrow --");
{
  ok(SPAN === 8 && LIMIT === 46, "(the constants: 8 px, 46 — the rise at which a plan on vanilla's own hubs climbs as vanilla's rails do)", { SPAN, LIMIT });
  const line = (rise, water = -1) => climb({ W, H, A: { x: 8, row: 10 }, B: { x: 40, row: 10 }, span: SPAN,
    heightAt: (x) => (x <= 24 ? FLAT : x <= 32 ? FLAT + (rise * (x - 24)) / 8 : FLAT + rise), isLandAt: (x) => x !== water });
  ok(line(46) === 46 && line(45) === 45, "⭐⭐ a ramp of 46 over 8 px measures 46, of 45 measures 45", [line(46), line(45)]);
  // the oracle: every 8 px stretch with no water in it, on either side of the water sample at x 28
  const ramp = (x) => (x <= 24 ? FLAT : x <= 32 ? FLAT + (46 * (x - 24)) / 8 : FLAT + 46);
  let dry = 0; for (let x = 8 + SPAN; x <= 40; x++) { let wet = false; for (let k = x - SPAN; k <= x; k++) if (k === 28) wet = true; if (!wet) dry = Math.max(dry, Math.abs(ramp(x) - ramp(x - SPAN))); }
  ok(dry < 46 && line(46, 28) === dry, `⭐⭐ …a water sample in the middle of the ramp breaks the stretch: only the 8 px of land either side of it count (${dry})`, { got: line(46, 28), dry });
  ok(line(46, 20) === 46, "⭐ …a water sample outside it does not", line(46, 20));
  const back = climb({ W, H, A: { x: 40, row: 10 }, B: { x: 8, row: 10 }, span: SPAN, heightAt: (x) => (x <= 24 ? FLAT : x <= 32 ? FLAT + (46 * (x - 24)) / 8 : FLAT + 46), isLandAt: () => true });
  ok(back === 46, "⭐ the same both ways round", back);
  ok(climb({ W, H, A: { x: 8, row: 10 }, B: { x: 8 + W / 2 + 1, row: 10 }, span: SPAN, heightAt: (x) => x * 10, isLandAt: () => true }) === 0, "…a line longer than half the map is the way round the seam, which is not measured");
  ok(climb({ W, H, A: null, B: { x: 40, row: 10 }, span: SPAN, heightAt: () => FLAT, isLandAt: () => true }) === 0, "…no station: nothing to measure");
}

// ── the rule ─────────────────────────────────────────────────────────────────────────────────────────────────────────
console.log("\n-- ⭐ two hubs either side of a ridge go round it by a way one province longer --");
{
  const flat = world("flat", { ground: () => FLAT });
  ok(flat.rails.length === 1 && sameWay(flat.rails[0], [A, M, B]), "(on flat ground the rail runs straight, A-M-B)", flat.rails);
  const r46 = world("r46", { ground: ridge(46) });
  ok(r46.rails.length === 1 && sameWay(r46.rails[0], [A, S1, S2, B]), "⭐⭐ a ridge whose face rises 46 over 8 px on both arrows: round it, A-S1-S2-B", r46.rails);
  const r45 = world("r45", { ground: ridge(45) });
  ok(r45.rails.length === 1 && sameWay(r45.rails[0], [A, M, B]), "⭐⭐ …45: straight over it, A-M-B", r45.rails);
  // the way round is flat: derived from the fixture, not assumed
  const s = climbOn(TWO, ridge(46));
  const round = [s(ST[A], ST[S1]), s(ST[S1], ST[S2]), s(ST[S2], ST[B])], over = [s(ST[A], ST[M]), s(ST[M], ST[B])], cut = s(ST[S1], ST[M]);
  ok(round.every((c) => c < LIMIT) && over.every((c) => c >= LIMIT) && cut < LIMIT, "(the fixture: A→M and M→B climb 46, the way round and S1→M climb less than 46)", { round, over, cut });
  // what the plan must report, read off the fixture: with the ridge in the way the search meets every border of this small world
  // (the way round is walked as well as the way over), and each is measured once, however many times it is asked
  const pairs = landPairs(TWO), climbs = pairs.map(([p, q]) => s(ST[p], ST[q]));
  const want = { asked: pairs.length, steep: climbs.filter((c) => c >= LIMIT).length, steepest: Math.max(...climbs) };
  ok(!!r46.plan.railClimbs && JSON.stringify(r46.plan.railClimbs) === JSON.stringify(want),
    `⭐ the plan says what it measured: railClimbs { asked ${want.asked}, steep ${want.steep}, steepest ${want.steepest} } — each of the fixture's borders once`, { got: r46.plan.railClimbs, want });
  const fc = flat.plan.railClimbs;
  ok(!!fc && fc.steep === 0 && fc.steepest === 0 && fc.asked > 0 && fc.asked <= pairs.length,
    `…and on flat ground it measured (no more than the ${pairs.length} borders there are), and found nothing steep`, fc);
}

console.log("\n-- ⭐ a climb is not a ban: one steep arrow still beats a way two provinces longer --");
{
  const w = world("one-face", { rects: THREE, st: ST3, ground: ridge(46, { east: false }) });
  const s = climbOn(THREE, ridge(46, { east: false }));
  ok(s(ST3[A], ST3[M]) >= LIMIT && s(ST3[M], ST3[B]) < LIMIT, "(the fixture: only the west face is steep — A→M climbs 46, M→B less)", [s(ST3[A], ST3[M]), s(ST3[M], ST3[B])]);
  ok(w.rails.length === 1 && sameWay(w.rails[0], [A, M, B]), "⭐⭐ the ridge's west face only: straight, A-M-B, not A-S1-S2-S3-B", w.rails);
  const fl = world("flat-three", { rects: THREE, st: ST3, ground: () => FLAT });
  ok(fl.rails.length === 1 && sameWay(fl.rails[0], [A, M, B]), "(the fixture: no way round is one province longer — flat, A-M-B; the only other is A-S1-S2-S3-B)", fl.rails);
}

console.log("\n-- ⭐ it is the ARROW that is measured, not the province --");
{
  const st = { ...ST, [A]: [8, 16], [M]: [32, 16], [B]: [56, 16] };
  const w = world("stations-below", { st, ground: ridge(46, { ridgeRows: 12 }) });
  ok(w.rails.length === 1 && sameWay(w.rails[0], [A, M, B]), "⭐⭐ the same ridge on rows 0..11 and the stations on row 16: the arrows pass below it, straight A-M-B", w.rails);
}

console.log("\n-- ⭐ two NEIGHBOURING hubs keep their own rail over a ridge --");
{
  // A x 0..16, B x 16..32, both rows 0..20; S x 0..32 rows 20..40 touches both. Ridge between their stations on row 10.
  const rects = { [A]: [[0, 0, 16, 20]], [B]: [[16, 0, 32, 20]], [S1]: [[0, 20, 32, 40]] };
  const st = { [A]: [8, 10], [B]: [24, 10], [S1]: [16, 30] };
  const tent = (x, y) => (y >= 20 || x < 8 || x >= 24 ? FLAT : x <= 16 ? FLAT + (46 * (x - 8)) / 8 : FLAT + 46 - (46 * (x - 16)) / 8);
  const w = world("neighbours", { rects, st, ground: tent, states: { 1: { provs: [A, S1], vp: A }, 2: { provs: [B], vp: B } } });
  const c = climbOn(rects, tent)(st[A], st[B]);
  ok(c >= LIMIT, "(the fixture: A→B climbs 46)", c);
  ok(w.rails.length === 1 && sameWay(w.rails[0], [A, B]), "⭐⭐ A and B touch: their own rail, A-B, not round by S", w.rails);
}

console.log("\n-- ⭐ …only a link between TWO hubs: a steep arrow into a hub from a province that is not one still costs the step --");
{
  // a gentle west slope (46 over 32 px) up to M's station, then a steep east face (46 over 8 px) down towards B, the hub
  const face = (x, y) => (y >= 20 || x >= 40 ? FLAT : x <= 32 ? FLAT + (46 * Math.max(0, x)) / 32 : FLAT + 46 - (46 * (x - 32)) / 8);
  const c = climbOn(TWO, face);
  const pre = { AM: c(ST[A], ST[M]), MB: c(ST[M], ST[B]), AS1: c(ST[A], ST[S1]), S1S2: c(ST[S1], ST[S2]), S2B: c(ST[S2], ST[B]), MS2: c(ST[M], ST[S2]), S1M: c(ST[S1], ST[M]) };
  ok(pre.MB >= LIMIT && [pre.AM, pre.AS1, pre.S1S2, pre.S2B, pre.MS2, pre.S1M].every((x) => x < LIMIT), "(the fixture: only M→B, into the hub B, climbs 46)", pre);
  const w = world("east-face", { ground: face });
  const usesMB = w.rails.some((r) => r.some((p, i) => i > 0 && ((p === B && r[i - 1] === M) || (p === M && r[i - 1] === B))));
  ok(w.rails.length === 1 && !usesMB && sameWay([w.rails[0][0], w.rails[0][w.rails[0].length - 1]], [A, B]),
    "⭐⭐ M is no hub, so its arrow into the hub B is charged: the rail goes round, not A-M-B", w.rails);
}

console.log("\n-- ⭐ both halves charge a climb: the search that grows each hub's land, and the link that joins two lands --");
{
  // The ridge's west face only: A→M, out of the hub A, is the one steep arrow. The search charges it, so M is reached from B; the
  // link A–M then joins the two lands and is charged in turn, and the way round by S1 and S2, one province longer, wins. Without
  // the search M is A's and A→M is no link at all; without the link half A–M is a link at no step more. Either way: A-M-B.
  const g = ridge(46, { east: false }), c = climbOn(TWO, g);
  const steep = landPairs(TWO).filter(([p, q]) => c(ST[p], ST[q]) >= LIMIT).map((pq) => pq.join("-"));
  ok(steep.join() === [A, M].join("-"), "(the fixture: of its borders only A→M, out of the hub A, climbs 46)", steep);
  const w = world("west-face", { ground: g });
  ok(w.rails.length === 1 && sameWay(w.rails[0], [A, S1, S2, B]), "⭐⭐ a steep arrow out of a hub: round it, A-S1-S2-B, not A-M-B", w.rails);
}
{
  // …and the search alone: a steep arrow INSIDE one hub's land. A ramp of 46 over 8 px on rows 0..15 between A's station and X's,
  // falling half as steeply east of X. P, south of X, is A's land too, so the search reaches X round the ramp by P, one province
  // longer at the same cost, and A→X never joins two lands: the link half never sees it.
  //        x: 0     16      32      48     64
  //   y 0   [ A    ][ X    ][ Y    ][ B    ]      Y on rows 0..11 only, sea below it
  //    20   [ A    ][ P    ]  sea   [ B    ]
  const X = 16, P = 17, Y = 18;
  const INNER = { [A]: [[0, 0, 16, 40]], [X]: [[16, 0, 32, 20]], [P]: [[16, 20, 32, 40]], [Y]: [[32, 0, 48, 12]], [B]: [[48, 0, 64, 40]] };
  const sti = { [A]: [8, 10], [X]: [24, 10], [P]: [24, 30], [Y]: [40, 6], [B]: [56, 6] };
  const ramp = (x, y) => (y >= 16 || x < 12 || x >= 36 ? FLAT : x <= 20 ? FLAT + (46 * (x - 12)) / 8 : FLAT + 46 - (46 * (x - 20)) / 16);
  const c = climbOn(INNER, ramp);
  const steep = landPairs(INNER).filter(([p, q]) => c(sti[p], sti[q]) >= LIMIT).map((pq) => pq.join("-"));
  ok(steep.join() === [A, X].join("-"), "(the fixture: of its borders only A→X, inside A's land, climbs 46)", steep);
  const fl = world("inner-flat", { rects: INNER, st: sti, ground: () => FLAT });
  ok(fl.rails.length === 1 && sameWay(fl.rails[0], [A, X, Y, B]), "(the fixture: on flat ground the rail runs A-X-Y-B; by P is one province longer)", fl.rails);
  const w = world("inner", { rects: INNER, st: sti, ground: ramp });
  ok(w.rails.length === 1 && sameWay(w.rails[0], [A, P, X, Y, B]), "⭐⭐ a steep arrow inside a hub's own land: the search goes round it by P, A-P-X-Y-B", w.rails);
}

console.log("\n-- ⭐ the ground is the one that loads --");
{
  const below = world("below", { groundBelow: ridge(46) });
  ok(below.rails.length === 1 && sameWay(below.rails[0], [A, S1, S2, B]), "⭐⭐ a heightmap only in the layer below is the one measured: round, A-S1-S2-B", below.rails);
  const none = world("none", {});
  ok(none.rails.length === 1 && sameWay(none.rails[0], [A, M, B]) && none.plan.railClimbs === null, "⭐ no heightmap anywhere: nothing is asked, A-M-B, and railClimbs is null", { rails: none.rails, rc: none.plan.railClimbs });
  const own = world("own-over-below", { ground: () => FLAT, groundBelow: ridge(46) });
  ok(own.rails.length === 1 && sameWay(own.rails[0], [A, M, B]), "⭐ the mod's own flat heightmap over the layer below's ridge: the mod's is the one that loads, A-M-B", own.rails);
  // A heightmap not the size of provinces.bmp does not line up with it, so it is not read. Each one here holds, in its corner the
  // bitmap's size, the very heightmap the ridge-46 world above was planned on and went round: read as if it lay under the
  // provinces, it would send the rail round again.
  const pixel = (b, x, row) => { const w = b.readInt32LE(18), h = b.readInt32LE(22), rs = Math.floor((8 * w + 31) / 32) * 4; return b[b.readUInt32LE(10) + (h - 1 - row) * rs + x]; };
  const r46hm = fs.readFileSync(path.join(ROOT, "r46", "map", "heightmap.bmp"));
  for (const [tag, GW, GH] of [["tall", W, 2 * H], ["wide", 2 * W, H]]) {
    const big = bmp8(GW, GH, (x, y) => (x >= W || y >= H ? FLAT : provAt(TWO)(x, y) === SEA ? SEA_H : ridge(46)(x, y)));
    let same = r46hm.readInt32LE(18) === W && r46hm.readInt32LE(22) === H;
    for (let y = 0; y < H && same; y++) for (let x = 0; x < W && same; x++) same = pixel(big, x, y) === pixel(r46hm, x, y);
    ok(same, `(the fixture: the ${W} x ${H} corner of the ${GW} x ${GH} heightmap is the ridge-46 world's heightmap, pixel for pixel)`);
    const w = world(tag, { raw: () => big });
    ok(w.rails.length === 1 && sameWay(w.rails[0], [A, M, B]) && w.plan.railClimbs === null,
      `⭐⭐ a heightmap ${GW} x ${GH} under provinces ${W} x ${H} is not read: nothing asked, railClimbs null, A-M-B`, { rails: w.rails, rc: w.plan.railClimbs });
  }
}

// ── Generate land measures the ground it raised ─────────────────────────────────────────────────────────────────────────
console.log("\n-- ⭐ Generate land plans its rail on the ground it has just raised --");
{
  // An all-sea world of 12 x 12 px provinces, each with a Standstill at its middle, as Delete map leaves one; Generate land then
  // raises some of them. Before the raise they read 89, every arrow over them flat; after it they stand on the relief.
  const GW = 384, GH = 192, C = 12, NX = GW / C, NY = GH / C, N = NX * NY;
  const idAt = (x, y) => Math.floor(y / C) * NX + Math.floor(x / C) + 2;
  const mod = path.join(ROOT, "gen");
  write(mod, "descriptor.mod", 'name="gen"\nreplace_path="history/states"\nreplace_path="map"\nreplace_path="map/strategicregions"\n');
  const col = (id) => [id & 255, (id >> 8) & 255, 77];
  write(mod, "map/provinces.bmp", bmp24(GW, GH, (x, y) => col(idAt(x, y))));
  const rows = ["0;0;0;0;land;false;unknown;0"];
  for (let id = 2; id < N + 2; id++) rows.push(`${id};${col(id).join(";")};sea;false;ocean;0`);
  write(mod, "map/definition.csv", rows.join("\n") + "\n");
  write(mod, "map/heightmap.bmp", bmp8(GW, GH, () => SEA_H));
  write(mod, "map/supply_nodes.txt", ""); write(mod, "map/railways.txt", "");
  const us = [];
  for (let id = 2; id < N + 2; id++) { const i = id - 2, x = (i % NX) * C + C / 2, row = Math.floor(i / NX) * C + C / 2; for (const ty of [0, 9, 38]) us.push(`${id};${ty};${x}.00;9.50;${GH - 1 - row}.00;0.00;0.00`); }
  write(mod, "map/unitstacks.txt", us.join("\n") + "\n");
  for (let r = 0; r < 8; r++) {
    const provs = []; for (let id = 2; id < N + 2; id++) if ((id - 2) % 8 === r) provs.push(id);
    write(mod, `map/strategicregions/r${r + 1}.txt`, `strategic_region={\n\tid=${r + 1}\n\tname="R${r + 1}"\n\tprovinces={ ${provs.join(" ")} }\n\tweather={}\n}\n`);
  }
  const gen = md.generateLand({ modRoot: mod, gameRoot: null, dependencyRoots: [], count: 220, provincesPerState: 6, seed: 7 });
  const net = (gen && gen.supplyNetwork) || {};
  ok(gen && gen.changed && net.railways > 0, "(Generate land raised land and laid railways)", { err: gen && gen.error, net });
  const rc = net.railClimbs;
  ok(!!rc && rc.asked > 0, "⭐ the plan measured the arrows of the world it laid", rc);
  // the raise is what lifts the new land off the sea's 89: counted on the heightmap Generate land left
  const hb = fs.readFileSync(path.join(mod, "map", "heightmap.bmp")), off = hb.readUInt32LE(10), rs8 = Math.floor((8 * GW + 31) / 32) * 4;
  const hAt = (x, row) => hb[off + (GH - 1 - row) * rs8 + x];
  const raised = (() => { let n = 0; for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) if (hAt(x, y) > SEA_H) n++; return n; })();
  ok(raised > 0, "(the raise wrote the new land above the sea's 89)", raised);
  ok(!!rc && rc.steepest > 0, "⭐⭐ …and the plan measured the RAISED ground: its steepest climb is not the 0 of a world still at 89", rc);
}

try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) { /* scratch only */ }
console.log("\n" + (fail ? "FAILED " + fail + "/" + (pass + fail) : "PASSED " + pass + "/" + pass));
process.exitCode = fail ? 1 : 0;
