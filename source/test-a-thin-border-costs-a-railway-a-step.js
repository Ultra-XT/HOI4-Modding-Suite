// ⛔ #a-thin-border-costs-a-step — A BORDER OF TWO PIXELS OR FEWER COSTS A GENERATED RAILWAY ONE PROVINCE MORE.
//
// The owner played TEST 31 (09-30): "some train tracks are not connected correctly within some cities, seem to not connect at all
// or overlap". The game draws one railway twice — a straight arrow from station to station, and the 3D track, which has to CROSS
// THE BORDER the two provinces share; over a one-pixel border it is forced out to that corner, away from the station. The
// wide-border tie-break (test-a-generated-railway-crosses-a-real-wide-border.js) took TEST 31 from 46 one-pixel rail edges to 17,
// but only settled TIES: every one of the 17 was at a hub, and each was a way one province shorter than a wide one. So a border of
// RAIL_THIN_BORDER px or fewer now costs the search one step more. Owner's decision (09-30): 1.8% more track (1,583 → 1,612
// province pairs) is invisible; a track that misses its station is what they saw. Rebuilt on TEST 31's own hubs: 17 → 2.
//
// The rule, pinned on small worlds of rectangles (every width counted from the fixture's own pixels):
//   · a thin border loses to a way ONE province longer over wide borders — in the search, where two hubs' land meets, and at a
//     hub's own door;
//   · it still beats a way TWO provinces longer: it costs one step, it is not a wall;
//   · two pixels is thin, three is not (measured on six maps rebuilt: at 1 the two-pixel edges stay, 11 to 69 a map; at 3
//     one-pixel edges come back on three of them);
//   · where it is the only way it is still taken — the network is never cut;
//   · a strait (a row over water, no border at all) is no thin border: it is crossed where it is the only way, and where land
//     joins its two shores the land way round is taken (#a-strait-costs-more-than-a-border, which moved this check with it);
//   · the same map gives the same railways every time, and it is the rule that decides, not the ids.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-thin-border-"));
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
const colour = (id) => [(id * 29) % 256, (id * 67) % 256, 30 + id];
const pairKey = (a, b) => `${Math.min(a, b)}-${Math.max(a, b)}`;
const SEA = 1;

/**
 * A world of rectangles [x0, y0, x1, y1) over the sea (province 1), with single pixels handed from one province to another
 * ({ "x,y": id }) — which is how a border is drawn thinner than its rectangles. `sea`: ids typed sea besides 1. Every state is
 * AAA's and has its victory point — so its hub — on `vp`. The supply plan is a dry run; `again` asks for it a second time.
 */
function world(tag, { W, H, rects, pixels = {}, sea = [], states, vp, rows = [] }) {
  const provAt = (x, y) => {
    if (pixels[`${x},${y}`]) return pixels[`${x},${y}`];
    for (const [id, [x0, y0, x1, y1]] of Object.entries(rects)) if (x >= x0 && x < x1 && y >= y0 && y < y1) return +id;
    return SEA;
  };
  // the fixture's own count of the pixel edges each pair shares: four-neighbour, and the map wraps east to west
  const border = new Map(), count = (a, b) => { if (a !== b) border.set(pairKey(a, b), (border.get(pairKey(a, b)) || 0) + 1); };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    count(provAt(x, y), provAt((x + 1) % W, y));
    if (y + 1 < H) count(provAt(x, y), provAt(x, y + 1));
  }
  const mod = path.join(ROOT, tag);
  write(mod, "descriptor.mod", `name="${tag}"\nreplace_path="history/states"\n`);
  write(mod, "map/provinces.bmp", bmp24(W, H, (x, y) => colour(provAt(x, y))));
  const isSea = (id) => id === SEA || sea.includes(id);
  const ids = [SEA].concat(Object.keys(rects).map(Number));
  write(mod, "map/definition.csv", ["0;0;0;0;land;false;unknown;0"].concat(ids.map((id) => `${id};${colour(id).join(";")};${isSea(id) ? "sea;false;ocean;0" : "land;false;plains;1"}`)).join("\n") + "\n");
  for (const [s, provs] of Object.entries(states)) {
    write(mod, `history/states/${s}-S.txt`, `state={\n\tid=${s}\n\tname="STATE_${s}"\n\tmanpower=1000\n\tstate_category=rural\n\tprovinces={ ${provs.join(" ")} }\n\thistory={\n\t\towner=AAA\n\t\tvictory_points = { ${vp[s]} 5 }\n\t}\n}\n`);
  }
  write(mod, "map/adjacencies.csv", ["From;To;Type;Through;start_x;start_y;stop_x;stop_y;adjacency_rule_name;Comment"].concat(rows, ["-1;-1;-1;-1;-1;-1;-1;-1;-1"]).join("\n") + "\n");
  write(mod, "map/supply_nodes.txt", "");
  write(mod, "map/railways.txt", "");
  const roots = { modRoot: mod, gameRoot: path.join(ROOT, "no-game"), dependencyRoots: [] };
  const railsOf = (plan) => ((plan && plan.railRows) || []).map((r) => r.provinces);
  const plan = md.generateSupplyNetwork({ ...roots, dryRun: true }) || {};
  return { roots, width: (a, b) => border.get(pairKey(a, b)) || 0, plan, hubs: (plan.newHubs || []).map((h) => h.province).sort((a, b) => a - b), rails: railsOf(plan),
    again: () => railsOf(md.generateSupplyNetwork({ ...roots, dryRun: true })) };
}
const sameWay = (row, want) => !!row && (row.join() === want.join() || row.slice().reverse().join() === want.join());
const runsOver = (rails, a, b) => rails.some((r) => r.some((p, i) => i > 0 && pairKey(p, r[i - 1]) === pairKey(a, b)));

// ── in the search: a province one thin border away, or one province round ──────────────────────────────────────────────
//        x: 8      16      24      32
//   y 0   [ H     ][ R1    ][ R2    ]
//     8   [ A     ]  ····  [ X     ]      A runs a strip `k` pixels tall east along the bottom of its row to x = 23, where it
//    16                    [ Y     ]      touches X over k pixels — its only contact with X. The way round, H – R1 – R2 – X,
//    24                    [ Z     ]      is one province longer and 8 px wide all along.
//    32                    [ V     ]
//    40                    [ H2    ]
const cornerWorld = (tag, k, ids) => {
  const { H, A, R1, R2, X, Y, Z, V, H2 } = ids, pixels = {};
  for (let y = 16 - k; y <= 15; y++) for (let x = 16; x <= 23; x++) pixels[`${x},${y}`] = A;
  const w = world(tag, { W: 40, H: 48, pixels,
    rects: { [H]: [8, 0, 16, 8], [R1]: [16, 0, 24, 8], [R2]: [24, 0, 32, 8], [A]: [8, 8, 16, 16], [X]: [24, 8, 32, 16], [Y]: [24, 16, 32, 24], [Z]: [24, 24, 32, 32], [V]: [24, 32, 32, 40], [H2]: [24, 40, 32, 48] },
    states: { 1: [H, A, R1, R2], 2: [X, Y, Z, V, H2] }, vp: { 1: H, 2: H2 } });
  const far = [X, Y, Z, V, H2];
  return { ...w, ...ids, corner: [H, A].concat(far), round: [H, R1, R2].concat(far) };
};
const CORNER_LOW = { H: 10, A: 11, R1: 12, R2: 13, X: 14, Y: 15, Z: 16, V: 17, H2: 18 };
console.log("\n-- ⭐ in the search: a province one ONE-pixel border away is reached the way round, one province longer --");
{
  const w = cornerWorld("search-1px", 1, CORNER_LOW), { H, A, R1, R2, X } = w;
  ok(w.width(A, X) === 1 && w.width(H, A) === 8 && w.width(H, R1) === 8 && w.width(R1, R2) === 8 && w.width(R2, X) === 8 && w.width(H, X) === 0 && w.width(A, R1) === 0,
    "(the fixture: H – A – X crosses one border of 1 px; H – R1 – R2 – X is one province longer, 8 px at every border)", { AX: w.width(A, X), AR1: w.width(A, R1) });
  ok(A < R1, "(…and A has the lower id: first seen and fewest provinces both say H – A – X)");
  ok(w.hubs.join() === [H, w.H2].join() && w.rails.length === 1, "two hubs, one railway between them", { hubs: w.hubs, rails: w.rails });
  ok(sameWay(w.rails[0], w.round), "⭐⭐ the railway goes round: H – R1 – R2 – X, one province longer", w.rails);
  ok(!runsOver(w.rails, A, X), "⭐⭐ …and not over the one-pixel border between A and X", w.rails);
}

console.log("\n-- ⭐ …two pixels is thin too, and three is not: there the fewer provinces win, as they always did --");
for (const [k, thin] of [[2, true], [3, false]]) {
  const w = cornerWorld(`search-${k}px`, k, CORNER_LOW), { A, R2, X } = w;
  ok(w.width(A, X) === k && w.width(R2, X) === 8 && w.width(A, R2) === 0, `(the fixture: A touches X over ${k} pixels)`, { AX: w.width(A, X) });
  if (thin) ok(w.rails.length === 1 && sameWay(w.rails[0], w.round) && !runsOver(w.rails, A, X), "⭐⭐ over 2 px: the way round, as over 1", w.rails);
  else ok(w.rails.length === 1 && sameWay(w.rails[0], w.corner), "⭐⭐ over 3 px: H – A – X, the fewer provinces — a narrow border costs no more than a wide one", w.rails);
}

// ── where two hubs' land meets: a thin border between them, or one province round ────────────────────────────────────
//        x: 8      16      24      32
//   y 0   [ H     ][ M     ][ K     ]      M owns ONE pixel below its south-east corner, (23,8): its only contact with H2
//     8                    [ H2    ]
console.log("\n-- ⭐ where two hubs' land meets: over a one-pixel border, or one province round — the way round --");
{
  const H = 30, M = 31, K = 32, H2 = 33;
  const w = world("meet-1px", { W: 40, H: 16, pixels: { "23,8": M },
    rects: { [H]: [8, 0, 16, 8], [M]: [16, 0, 24, 8], [K]: [24, 0, 32, 8], [H2]: [24, 8, 32, 16] }, states: { 1: [H, M], 2: [K, H2] }, vp: { 1: H, 2: H2 } });
  ok(w.width(M, H2) === 1 && w.width(H, M) === 8 && w.width(M, K) === 8 && w.width(K, H2) === 8 && w.width(H, H2) === 0,
    "(the fixture: H – M – H2 crosses one border of 1 px, into the other hub itself; H – M – K – H2 is one province longer, all 8 px)", { MH2: w.width(M, H2) });
  ok(w.hubs.join() === [H, H2].join() && w.rails.length === 1 && sameWay(w.rails[0], [H, M, K, H2]), "⭐⭐ the railway goes round by K", w.rails);
  ok(!runsOver(w.rails, M, H2), "⭐⭐ …and not over the one-pixel border between M and the hub H2", w.rails);
}

// ── inside a walk: a thin border at a hub's own door, far from where the walks meet ───────────────────────────────────
//        x: 8   16    24    32    40   48
//   y 0   [    ][ P0 ][ P1 ][ P2 ][    ]      Ha's east column is sea beside P0 but for ONE pixel, (15,0)
//     8   [ Ha ]      (sea)       [ Hb ]
//    16   [    ][Q0][Q1][Q2][Q3]  [    ]      the Q way is one province longer, 8 px wide all along
console.log("\n-- ⭐ …and inside a walk: a one-pixel border at a hub's own door costs its step too --");
{
  const Ha = 60, P = [61, 62, 63], Q = [64, 65, 66, 67], Hb = 68;
  const rects = { [Ha]: [8, 0, 16, 24], [Hb]: [40, 0, 48, 24] }, pixels = {};
  P.forEach((id, i) => { rects[id] = [16 + 8 * i, 0, 24 + 8 * i, 8]; });
  Q.forEach((id, i) => { rects[id] = [16 + 6 * i, 16, 22 + 6 * i, 24]; });
  for (let y = 1; y <= 7; y++) pixels[`15,${y}`] = SEA;
  const w = world("door-1px", { W: 56, H: 24, rects, pixels, states: { 7: [Ha, P[0], P[1], Q[0], Q[1]], 8: [P[2], Q[2], Q[3], Hb] }, vp: { 7: Ha, 8: Hb } });
  ok(w.width(Ha, P[0]) === 1 && w.width(P[0], P[1]) === 8 && w.width(P[1], P[2]) === 8 && w.width(P[2], Hb) === 8 && w.width(Ha, Q[0]) === 8 && w.width(Q[3], Hb) === 8
    && Q.every((q, i) => i === 0 || w.width(Q[i - 1], q) === 8) && P.every((p) => Q.every((q) => w.width(p, q) === 0)),
    "(the fixture: Ha – P0 – P1 – P2 – Hb, four steps, the first over 1 px; Ha – Q0 … Q3 – Hb, five, all 8 px; the two never touch)", { HaP0: w.width(Ha, P[0]) });
  ok(w.hubs.join() === [Ha, Hb].join() && w.rails.length === 1 && sameWay(w.rails[0], [Ha, ...Q, Hb]), "⭐⭐ the railway takes the Q way, one province longer", w.rails);
  ok(!runsOver(w.rails, Ha, P[0]), "⭐⭐ …and not the hub's one-pixel door", w.rails);
}

// ── one step, not a wall: a way TWO provinces longer still loses to the thin border ──────────────────────────────────
//        x: 8      16      24      32      40
//   y 0   [ H     ][ R1    ][ R2    ][ R3    ]
//     8   [ A     ]  ···········    [ X     ]      A's one-pixel strip runs east to x = 31: its only contact with X is ONE pixel
//    16                             [ Y     ]
//    24                             [ H2    ]
console.log("\n-- ⭐ a thin border costs ONE step: against a way two provinces longer it is still taken --");
{
  const H = 40, A = 41, R1 = 42, R2 = 43, R3 = 44, X = 45, Y = 46, H2 = 47, pixels = {};
  for (let x = 16; x <= 31; x++) pixels[`${x},15`] = A;
  const w = world("two-longer", { W: 48, H: 32, pixels,
    rects: { [H]: [8, 0, 16, 8], [R1]: [16, 0, 24, 8], [R2]: [24, 0, 32, 8], [R3]: [32, 0, 40, 8], [A]: [8, 8, 16, 16], [X]: [32, 8, 40, 16], [Y]: [32, 16, 40, 24], [H2]: [32, 24, 40, 32] },
    states: { 1: [H, A, R1, R2, R3], 2: [X, Y, H2] }, vp: { 1: H, 2: H2 } });
  ok(w.width(A, X) === 1 && w.width(R3, X) === 8 && w.width(H, A) === 8 && w.width(A, R1) === 0 && w.width(A, R2) === 0,
    "(the fixture: H – A – X crosses one border of 1 px; H – R1 – R2 – R3 – X is two provinces longer, all 8 px)", { AX: w.width(A, X) });
  ok(w.hubs.join() === [H, H2].join() && w.rails.length === 1 && sameWay(w.rails[0], [H, A, X, Y, H2]), "⭐⭐ the railway crosses the one-pixel border: two provinces more is dearer than one step", w.rails);
}

// ── the only way ─────────────────────────────────────────────────────────────────────────────────────────────────────
//        x: 8      16      24                        x: 8      16      24      32      40
//   y 0   [ H5    ]                            y 0   [ H     ]                        [ H2    ]
//     8           [ H6    ]                      8           [ A     ][ B     ]
//   H5 owns (16,7): the two touch over ONE pixel      H owns (16,7) and H2 (31,7): every way out of each hub is ONE pixel
console.log("\n-- ⭐ CONTROL: where a thin border is the only way, it is still taken — the network is never cut --");
{
  const H5 = 50, H6 = 51;
  const w = world("only-way", { W: 32, H: 16, pixels: { "16,7": H5 }, rects: { [H5]: [8, 0, 16, 8], [H6]: [16, 8, 24, 16] }, states: { 5: [H5], 6: [H6] }, vp: { 5: H5, 6: H6 } });
  ok(w.width(H5, H6) === 1, "(the fixture: two hubs whose land touches over one pixel, and nowhere else)", { H5H6: w.width(H5, H6) });
  ok(w.hubs.join() === [H5, H6].join() && w.rails.length === 1 && sameWay(w.rails[0], [H5, H6]), "⭐⭐ the railway is laid over it", w.rails);

  const H = 52, A = 53, B = 54, H2 = 55;
  const v = world("only-ways-out", { W: 48, H: 16, pixels: { "16,7": H, "31,7": H2 },
    rects: { [H]: [8, 0, 16, 8], [A]: [16, 8, 24, 16], [B]: [24, 8, 32, 16], [H2]: [32, 0, 40, 8] }, states: { 1: [H, A], 2: [B, H2] }, vp: { 1: H, 2: H2 } });
  ok(v.width(H, A) === 1 && v.width(B, H2) === 1 && v.width(A, B) === 8 && v.width(H, H2) === 0,
    "(the fixture: H – A and B – H2 are one pixel each, and the only way out of either hub; A and B share 8 px)", { HA: v.width(H, A), BH2: v.width(B, H2) });
  ok(v.hubs.join() === [H, H2].join() && v.rails.length === 1 && sameWay(v.rails[0], [H, A, B, H2]),
    "⭐⭐ the search walks both thin borders — at a step when nothing else is left to walk — and the railway is laid", v.rails);
}

// ── a strait is no thin border ───────────────────────────────────────────────────────────────────────────────────────
//        x: 8      16      24     32
//   y 0   [ H5    ][ T sea ][ H6    ]      a strait row H5 → H6 through T; U under H5 alone leaves H6 an island, and U run on
//     8   [ U     ]( U ··············)     under H6 too is the land way round, one province longer
// ⛔ #a-strait-costs-more-than-a-border — this check said "a strait costs one step, as it did: the railway crosses it, not the land
// way round". A strait is taken now only where no dry way joins its shores, so the land way round is the railway, and the strait
// is pinned where it is the only way.
console.log("\n-- ⭐ a strait shares no border at all and is no thin border: the only way, it is crossed; with land round, the land way --");
{
  const H5 = 70, T = 71, H6 = 72, U = 73;
  const at = (tag, uRect) => world(tag, { W: 40, H: 16, sea: [T], rects: { [H5]: [8, 0, 16, 8], [T]: [16, 0, 24, 8], [H6]: [24, 0, 32, 8], [U]: uRect },
    states: { 5: [H5, U], 6: [H6] }, vp: { 5: H5, 6: H6 }, rows: [`${H5};${H6};sea;${T};-1;-1;-1;-1;;Strait`] });
  const w = at("strait", [8, 8, 16, 16]);
  ok(w.width(H5, H6) === 0 && w.width(H5, U) === 8 && w.width(U, H6) === 0, "(the fixture: H5 and H6 share no pixel; U touches H5 alone, so H6 is an island)", { H5H6: w.width(H5, H6), UH6: w.width(U, H6) });
  ok(w.rails.length === 1 && sameWay(w.rails[0], [H5, H6]), "⭐⭐ the railway crosses the strait", w.rails);
  const round = at("strait-and-land", [8, 8, 32, 16]);
  ok(round.width(H5, U) === 8 && round.width(U, H6) === 8, "(the fixture: U touches both over 8)", { H5U: round.width(H5, U), UH6: round.width(U, H6) });
  ok(round.rails.length === 1 && sameWay(round.rails[0], [H5, U, H6]), "⭐⭐ …and with U joining the shores, the railway goes round by land, not over the water", round.rails);
}

// ── the same railways every time, whatever the ids ───────────────────────────────────────────────────────────────────
console.log("\n-- ⭐ determinism: the same map gives the same railways, and it is the rule that decides, not the ids --");
{
  const low = cornerWorld("ids-corner-low", 1, CORNER_LOW);
  const again = low.again();
  ok(JSON.stringify(again) === JSON.stringify(low.rails), "⭐ asked twice, the same map gives the same railways, row for row", { first: low.rails, again });
  // the corner way given the HIGHEST ids instead of the lowest: first-seen and id order now point the other way
  const high = cornerWorld("ids-corner-high", 1, { H: 20, R1: 21, R2: 22, X: 23, Y: 24, Z: 25, V: 26, H2: 27, A: 28 });
  ok(high.A > high.R1 && high.A > high.R2 && high.width(high.A, high.X) === 1, "(the fixture again, with A's id above R1's and R2's)");
  ok(high.rails.length === 1 && sameWay(high.rails[0], high.round), "⭐⭐ …and with the ids the other way round, still the way round", high.rails);
}

try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) { /* scratch only */ }
console.log("\n" + (fail ? "FAILED " + fail + "/" + (pass + fail) : "PASSED " + pass + "/" + pass));
process.exitCode = fail ? 1 : 0;
