// ⛔ #rail-arrows-do-not-lie-on-each-other — A GENERATED RAILWAY'S ARROWS DO NOT FAN OUT OF ONE STATION, TURN BACK ON THEMSELVES OR
// RUN OVER A STATION THEY DO NOT STOP AT.
//
// The owner played TEST 32 (10-02), and the audit measured its rail against the base game's: the game draws a railway as straight
// arrows from station to station (the Standstill, unitstacks.txt type 0), and Generate land's planner laid a link as soon as it was
// the cheapest, whatever its arrows did to the rail already drawn. On the walled-in islets of a generated world that left 3 arrows
// within 1.5 px of a station they skip (2 of them over the skipped town's victory-point star), 5 stations whose two arrows leave
// less than 15 deg apart, and a row that doubled back on itself; vanilla ships 0, 0 and 0, its narrowest fan 22.17 deg and its
// closest arrow 2.17 px from a third station. So the planner keeps a LEDGER of the arrows drawn — seeded with every railway the
// game loads, the layers below included — and a link whose arrows would lie on them WAITS: it is laid after every other link of
// its pass, and only if its two hubs are still apart. Nothing is cut: the pieces the rail joins are the pieces it joined.
//
// The rule, pinned on small worlds of rectangles with the stations written into the fixture's own unitstacks.txt (every angle and
// distance measured off the fixture's own stations):
//   · a link whose arrow would leave a station under 20 deg from one already there waits, and the way through the station it
//     would have skipped is laid instead — 19 deg waits, 21 deg does not — at either end of the arrow: a link the planner walks
//     TOWARD that station waits as well;
//   · …whether the rail already there is the mod's own railways.txt or the LAYER BELOW's;
//   · a path that turns back under 20 deg at a province it passes waits for the way round;
//   · an arrow within 2 px of a station on the rail it does not stop at waits — 2 px waits, 2.5 px does not;
//   · where nothing else joins the two pieces, the waiting link is laid anyway, and the plan says so;
//   · a CROSSING is not a reason: waiting on one sent hubs side by side round the whole network (TEST 32 rebuilt: 15 pairs of hubs
//     40 px apart or less went 20 or more rail hops further), and the shipping maps ship crossings themselves;
//   · a world where no arrow lies on another is planned exactly as before;
//   · and the ledger itself (railArrowLedger) on hand-placed stations: each threshold from both sides (a fan at the arrow's start
//     and at its end; a station 2 px off across a boundary of the ledger's grid as well as within a cell), and what it does not judge —
//     a crossing, a T, a shared station, the east–west seam, a pair already laid, a missing station, and the known limit: a
//     station that joins the rail AFTER an arrow was laid over it is not asked.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-rail-arrows-"));
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
const SEA = 1, W = 64, H = 40;   // wide enough that no arrow here is longer than half the map: none goes round the seam

/** A world of rectangles: `rects` { id: [[x0, y0, x1, y1]] } (the `top` ids painted last — an enclave), `st` { id: [x, row] } the
 *  stations (rows top-down, written as the mod's own unitstacks.txt types 0, 9 and 38, z = H − 1 − row), `states` and `vp` (every
 *  state AAA's, its hub on its victory point), and the railways already there: `rails` in the mod's own railways.txt, or
 *  `railsBelow` in the LAYER BELOW's alone (the mod then has none). Returns the dry-run plan, its rows, and every row the game would
 *  load (the existing ones and the plan's). */
function world(tag, { rects, st, states, vp, rails = "", railsBelow = null, top = [], stateIds = null }) {
  const order = Object.keys(rects).map(Number).filter((id) => !top.includes(id)).concat(top);
  const provAt = (x, y) => { let hit = SEA; for (const id of order) for (const [x0, y0, x1, y1] of rects[id]) if (x >= x0 && x < x1 && y >= y0 && y < y1) hit = id; return hit; };
  const mod = path.join(ROOT, tag), game = path.join(ROOT, tag + "-below");
  write(mod, "descriptor.mod", `name="${tag}"\nreplace_path="history/states"\n`);
  write(mod, "map/provinces.bmp", bmp24(W, H, (x, y) => colour(provAt(x, y))));
  const ids = [SEA].concat(order);
  write(mod, "map/definition.csv", ["0;0;0;0;land;false;unknown;0"].concat(ids.map((id) => `${id};${colour(id).join(";")};${id === SEA ? "sea;false;ocean;0" : "land;false;plains;1"}`)).join("\n") + "\n");
  for (const [s, provs] of Object.entries(states)) {
    write(mod, `history/states/${s}-S.txt`, `state={\n\tid=${s}\n\tname="STATE_${s}"\n\tmanpower=1000\n\tstate_category=rural\n\tprovinces={ ${provs.join(" ")} }\n\thistory={\n\t\towner=AAA\n\t\tvictory_points = { ${vp[s]} 5 }\n\t}\n}\n`);
  }
  write(mod, "map/adjacencies.csv", "From;To;Type;Through;start_x;start_y;stop_x;stop_y;adjacency_rule_name;Comment\n-1;-1;-1;-1;-1;-1;-1;-1;-1\n");
  write(mod, "map/supply_nodes.txt", "");
  if (railsBelow === null) write(mod, "map/railways.txt", rails);
  else write(game, "map/railways.txt", railsBelow);
  write(mod, "map/unitstacks.txt", Object.entries(st).map(([p, [x, row]]) => [0, 9, 38].map((ty) => `${p};${ty};${x.toFixed(2)};10.00;${(H - 1 - row).toFixed(2)};0.00;0.00`).join("\n")).join("\n") + "\n");
  const roots = { modRoot: mod, gameRoot: railsBelow === null ? path.join(ROOT, "no-game") : game, dependencyRoots: [] };
  const plan = md.generateSupplyNetwork({ ...roots, dryRun: true, ...(stateIds ? { stateIds } : {}) }) || {};
  const ra = plan.railArrows;
  ok(!!ra && !!ra.waited && typeof ra.waited === "object" && Number.isInteger(ra.laidAnyway), `(${tag}: the plan says which links waited, and how many were laid anyway)`, ra);
  const rows = (plan.railRows || []).map((r) => r.provinces);
  const existing = (railsBelow === null ? rails : railsBelow).split("\n").map((l) => l.trim().split(/\s+/).map(Number)).filter((n) => n.length > 3).map((n) => n.slice(2, 2 + n[1]));
  return { plan, rows, all: existing.concat(rows), st, roots, waited: (ra && ra.waited) || null, laidAnyway: ra ? ra.laidAnyway : undefined };
}

// ── the geometry the test asserts, measured off the fixture's own stations ([x, row], rows top-down) ──────────────────────────
const deg = (P, Q, R) => { let d = Math.abs(Math.atan2(Q[1] - P[1], Q[0] - P[0]) - Math.atan2(R[1] - P[1], R[0] - P[0])) * 180 / Math.PI; return d > 180 ? 360 - d : d; };
const off = (P, A, B) => { const dx = B[0] - A[0], dy = B[1] - A[1], L2 = dx * dx + dy * dy; let t = ((P[0] - A[0]) * dx + (P[1] - A[1]) * dy) / L2; t = Math.max(0, Math.min(1, t)); return Math.hypot(A[0] + t * dx - P[0], A[1] + t * dy - P[1]); };
/** every row the game would load, as drawn: the narrowest angle between two arrows at one station (a row turning back is one such
 *  pair), the nearest an arrow comes to a station on the rail it does not stop at, the crossings, and who is joined to whom */
function shape(r) {
  const nb = new Map(), arrows = [];
  for (const p of r.all) for (let i = 1; i < p.length; i++) {
    const a = p[i - 1], b = p[i];
    if (!nb.has(a)) nb.set(a, new Set()); if (!nb.has(b)) nb.set(b, new Set());
    if (!nb.get(a).has(b)) arrows.push([a, b]);
    nb.get(a).add(b); nb.get(b).add(a);
  }
  let minFan = 180;
  for (const [p, s] of nb) { const q = [...s]; for (let i = 0; i < q.length; i++) for (let j = i + 1; j < q.length; j++) minFan = Math.min(minFan, deg(r.st[p], r.st[q[i]], r.st[q[j]])); }
  let minOver = Infinity;
  for (const [a, b] of arrows) for (const p of nb.keys()) if (p !== a && p !== b) minOver = Math.min(minOver, off(r.st[p], r.st[a], r.st[b]));
  let crossings = 0;
  for (let i = 0; i < arrows.length; i++) for (let j = i + 1; j < arrows.length; j++) {
    const [a, b] = arrows[i], [c, d] = arrows[j];
    if (a === c || a === d || b === c || b === d) continue;
    const A = r.st[a], B = r.st[b], C = r.st[c], D = r.st[d];
    const rx = B[0] - A[0], ry = B[1] - A[1], sx = D[0] - C[0], sy = D[1] - C[1], den = rx * sy - ry * sx;
    if (!den) continue;
    const t = ((C[0] - A[0]) * sy - (C[1] - A[1]) * sx) / den, u = ((C[0] - A[0]) * ry - (C[1] - A[1]) * rx) / den;
    if (t > 0 && t < 1 && u > 0 && u < 1) crossings++;
  }
  const joined = (x, y) => { const seen = new Set([x]), q = [x]; while (q.length) { const u = q.pop(); if (u === y) return true; for (const v of (nb.get(u) || [])) if (!seen.has(v)) { seen.add(v); q.push(v); } } return false; };
  return { minFan: +minFan.toFixed(2), minOver: +minOver.toFixed(2), crossings, joined };
}
const key = (rows) => JSON.stringify(rows.map((r) => (r[0] <= r[r.length - 1] ? r : r.slice().reverse()).join("-")).sort());
const same = (rows, want) => key(rows) === key(want);
const sameWaited = (w, want) => !!w && !!want && JSON.stringify(Object.entries(w).sort()) === JSON.stringify(Object.entries(want).sort());

// ── 1. THROUGH-ROUTE ──────────────────────────────────────────────────────────────────────────────────────────────────
//        x: 0          20  24        40          60
//   y 0   [ H1          ][ P            ][ H3        ]      H2: a 4x4 hub against H1's east edge, P round its other sides;
//    18   [ H1          ][H2][ P        ][ H3        ]      every station on row 20 — H1 (10), H2 (22), P (30), H3 (50).
//    40                                                     The cheapest links are H1–H2, then H1–P–H3, whose first arrow
//                                                           leaves H1 along H1–H2 and runs straight over H2's station.
const H1 = 10, H2 = 11, P = 12, H3 = 13;
const W1 = {
  rects: { [H1]: [[0, 0, 20, 40]], [P]: [[20, 0, 40, 40]], [H2]: [[20, 18, 24, 22]], [H3]: [[40, 0, 60, 40]] },
  st: { [H1]: [10, 20], [H2]: [22, 20], [P]: [30, 20], [H3]: [50, 20] }, states: { 1: [H1], 2: [H2], 3: [P, H3] }, vp: { 1: H1, 2: H2, 3: H3 }, top: [H2],
};
console.log("\n-- ⭐ a link whose first arrow would leave H1 along the rail to H2, and run over H2's station: it waits, and the rail runs THROUGH H2 --");
{
  ok(deg(W1.st[H1], W1.st[H2], W1.st[P]) === 0 && off(W1.st[H2], W1.st[H1], W1.st[P]) === 0,
    "(the fixture: H1–P leaves H1 at 0 deg from H1–H2, and passes 0 px from H2's station — the plan without the rule lies on its own rail)");
  const r = world("through", W1), s = shape(r);
  ok(s.minFan >= 20, "⭐ no two arrows leave one station less than 20 deg apart", { minFan: s.minFan, rows: r.rows });
  ok(s.minOver > 2, "⭐ no arrow passes within 2 px of a station it does not stop at", { minOver: s.minOver, rows: r.rows });
  ok(same(r.rows, [[H1, H2], [H2, P, H3]]), "⭐⭐ H1 – H2 and H2 – P – H3: the railway runs through H2", r.rows);
  ok(s.joined(H1, H3) && s.joined(H2, H3), "…and every hub is joined");
  ok(sameWaited(r.waited, { fan: 1 }) && r.laidAnyway === 0, "⭐ the plan says one link waited, for its fan out of H1, and none was laid anyway", r.plan.railArrows);
  const named = world("through-named", { ...W1, stateIds: [1, 2, 3] });
  ok(same(named.rows, [[H1, H2], [H2, P, H3]]), "⭐ Generate land's call (the states named) plans the same as Auto-fix's repair", named.rows);
}

// ── 2. THE RAIL ALREADY THERE ─────────────────────────────────────────────────────────────────────────────────────────
console.log("\n-- ⭐ the same world over a railway the map already has (H1 – H2): the mod's own, and the LAYER BELOW's alone --");
for (const [label, extra] of [["the mod's own railways.txt", { rails: `1 2 ${H1} ${H2}\n` }], ["the LAYER BELOW's railways.txt", { railsBelow: `1 2 ${H1} ${H2}\n` }]]) {
  const r = world(extra.rails ? "seeded-own" : "seeded-below", { ...W1, ...extra }), s = shape(r);
  ok(same(r.rows, [[H2, P, H3]]), `⭐⭐ ${label}: H2 – P – H3 is added, never H1 – P over H2`, r.rows);
  ok(s.minFan >= 20 && s.minOver > 2, `⭐ ${label}: nothing lies on the railway that was there`, { minFan: s.minFan, minOver: s.minOver });
}

// ── 3. A FAN, AND NOTHING OVER ANYTHING ───────────────────────────────────────────────────────────────────────────────
// H2 (an 8x12 hub, x 20..28, rows 18..30) joined to H1; its station at (24, y), y chosen so the arrow H1–H2 leaves H1 at `a` deg
// from the line H1–P, and always more than 2 px from it — so only the fan can make H1–P–H3 wait. `ids` relabels the four provinces
// (the planner walks a link from the hub of the lower id of the two provinces where their lands touch)
console.log("\n-- ⭐ two arrows out of one station at 15.9, 19 and 21 deg, neither over the other's station --");
const W3 = (y, { h1 = H1, h2 = H2, p = P, h3 = H3 } = {}) => ({
  rects: { [h1]: [[0, 0, 20, 40]], [p]: [[20, 0, 40, 40]], [h2]: [[20, 18, 28, 30]], [h3]: [[40, 0, 60, 40]] },
  st: { [h1]: [10, 20], [h2]: [24, y], [p]: [30, 20], [h3]: [50, 20] }, states: { 1: [h1], 2: [h2], 3: [p, h3] }, vp: { 1: h1, 2: h2, 3: h3 }, top: [h2],
});
{
  const at = (a) => 20 + 14 * Math.tan(a * Math.PI / 180);   // the row of H2's station 14 px east of H1's, `a` deg below the line
  const fan = (y) => deg(W3(y).st[H1], W3(y).st[H2], W3(y).st[P]), gap = (y) => off(W3(y).st[H2], W3(y).st[H1], W3(y).st[P]);
  ok(fan(24) < 20 && fan(at(19)) < 20 && fan(at(21)) > 20 && [24, at(19), at(21)].every((y) => gap(y) > 2),
    "(the fixture: H1–H2 leaves H1 15.9, 19 and 21 deg from H1–P, and H2's station is more than 2 px from that line each time)", [24, at(19), at(21)].map((y) => [+fan(y).toFixed(2), +gap(y).toFixed(2)]));
  const r = world("fan-15.9", W3(24));
  ok(shape(r).minFan >= 20 && sameWaited(r.waited, { fan: 1 }), "⭐⭐ 15.9 deg is under 20: the second arrow out of H1 waits for its fan, and another way is laid", { minFan: shape(r).minFan, rows: r.rows, railArrows: r.plan.railArrows });
  const r19 = world("fan-19", W3(at(19)));
  ok(shape(r19).minFan >= 20, "⭐⭐ 19 deg: it waits", { minFan: shape(r19).minFan, rows: r19.rows });
  const r21 = world("fan-21", W3(at(21)));
  ok(same(r21.rows, [[H1, H2], [H1, P, H3]]) && sameWaited(r21.waited, {}), "⭐⭐ 21 deg: nothing waits — H1 – H2 and H1 – P – H3, the plan without the rule", { rows: r21.rows, railArrows: r21.plan.railArrows });
  // …and walked the other way: H3 < P < H1 < H2, so the link starts at H3 and its last arrow, P – H1, ENDS at the station it fans
  // from — every case above put that station first, and the ledger must ask an arrow at both its ends
  const rev = { h3: 70, p: 71, h1: 72, h2: 73 };
  const back21 = world("fan-21-walked-back", W3(at(21), rev));
  ok(back21.rows.some((row) => row.join() === [rev.h3, rev.p, rev.h1].join()) && sameWaited(back21.waited, {}),
    "(the fixture: at 21 deg nothing waits, and the planner walks the link H3 – P – H1, toward the station already joined to H2)", { rows: back21.rows, railArrows: back21.plan.railArrows });
  const back = world("fan-15.9-walked-back", W3(24, rev));
  ok(shape(back).minFan >= 20 && sameWaited(back.waited, { fan: 1 }) && same(back.rows, [[rev.h1, rev.h2], [rev.h3, rev.p, rev.h2]]),
    "⭐⭐ 15.9 deg at the arrow's FAR end: it waits as well, and H3 – P – H2 is laid instead", { minFan: shape(back).minFan, rows: back.rows, railArrows: back.plan.railArrows });
}

// ── 4. FORCED ─────────────────────────────────────────────────────────────────────────────────────────────────────────
//        x: 0          20      28  32          50     60
//   y 0   [ A           ][ Q                    ][ B    ]      E: an enclave of Q, x 28..32, rows 16..24, its station (30, 20)
//    16   [ A           ][ Q    [ E ]           ][ B    ]      between A's (10, 20) and Q's (40, 20) — the only way into E is
//    40                                                        through Q, and every arrow to or from it lies on the A – Q line
console.log("\n-- ⭐ forced: where only the waiting link joins two pieces, it is laid anyway, and nothing is cut --");
{
  const A = 20, Q = 21, E = 22, B = 23;
  const r = world("forced", { rects: { [A]: [[0, 0, 20, 40]], [Q]: [[20, 0, 50, 40]], [E]: [[28, 16, 32, 24]], [B]: [[50, 0, 60, 40]] },
    st: { [A]: [10, 20], [Q]: [40, 20], [E]: [30, 20], [B]: [55, 20] }, states: { 1: [A], 2: [Q, B], 3: [E] }, vp: { 1: A, 2: B, 3: E }, top: [E] });
  const s = shape(r);
  ok(s.joined(A, B) && s.joined(A, E), "⭐⭐ every hub is still joined: a waiting link is laid when nothing else joins its two pieces", r.rows);
  ok(r.rows.length === 2, "⭐ two railways, as without the rule", r.rows);
  ok(r.laidAnyway === 1, "⭐⭐ …and the plan says one was laid anyway", r.plan.railArrows);
}

// ── 5. A TURN BACK, WITH A WAY ROUND ──────────────────────────────────────────────────────────────────────────────────
//        x: 0     12        26              52
//   y 0   [ A4  ][ R       ][ Q2   [E2]      ]      E2: an enclave of Q2, its station (34, 12) between R's (19, 12) and Q2's
//    24   [ A4  ][ S                  ]              (44, 12) — so A4 – R – Q2 – E2 runs east past E2 and turns back to it;
//    40                                              S is a second way into Q2, from below
console.log("\n-- ⭐ a path that doubles back at a province it passes waits for the way round --");
{
  const A4 = 30, R = 31, Q2 = 32, E2 = 33, S = 34;
  const w = { rects: { [A4]: [[0, 0, 12, 40]], [R]: [[12, 0, 26, 24]], [S]: [[12, 24, 40, 40]], [Q2]: [[26, 0, 52, 24]], [E2]: [[32, 10, 36, 14]] },
    st: { [A4]: [6, 12], [R]: [19, 12], [S]: [30, 32], [Q2]: [44, 12], [E2]: [34, 12] }, states: { 1: [A4, R, S], 2: [Q2, E2] }, vp: { 1: A4, 2: E2 }, top: [E2] };
  ok(deg(w.st[Q2], w.st[R], w.st[E2]) === 0 && deg(w.st[Q2], w.st[S], w.st[E2]) >= 20,
    "(the fixture: R – Q2 – E2 turns back 0 deg at Q2; S – Q2 – E2 does not)");
  const r = world("turn-back", w), s = shape(r);
  ok(s.minFan >= 20, "⭐⭐ no path turns back by less than 20 deg", { minFan: s.minFan, rows: r.rows });
  ok(s.joined(A4, E2), "…and the two hubs are joined");
}

// ── 6. A CROSSING IS NOT A REASON ─────────────────────────────────────────────────────────────────────────────────────
// K – C is laid first; D reaches C through M, whose arrow back to D crosses K – C, or through L, which would not
console.log("\n-- ⭐ an arrow that crosses one already laid is laid as it always was --");
{
  const K = 40, C = 41, D = 42, M = 43, Lp = 44, Z = 45;
  const r = world("crossing", { rects: { [D]: [[0, 0, 12, 40]], [K]: [[20, 0, 36, 12]], [C]: [[24, 12, 32, 24]], [M]: [[12, 12, 24, 20], [32, 12, 44, 24]], [Lp]: [[12, 20, 24, 40]], [Z]: [[24, 24, 44, 40]] },
    st: { [D]: [6, 12], [K]: [28, 4], [C]: [28, 20], [M]: [38, 16], [Lp]: [18, 30], [Z]: [34, 32] }, states: { 1: [C, M, Z], 2: [D, Lp], 3: [K] }, vp: { 1: C, 2: D, 3: K } });
  const s = shape(r);
  ok(s.crossings === 1, "(the fixture: the plan's two railways cross once — the rule had a crossing to wait on)", { crossings: s.crossings, rows: r.rows });
  ok(same(r.rows, [[K, C], [D, M, C]]) && sameWaited(r.waited, {}), "⭐⭐ a crossing is NOT a reason to wait: K – C and D – M – C, the plan without the rule, and nothing waited", { rows: r.rows, railArrows: r.plan.railArrows });
  ok(s.joined(C, D) && s.joined(C, K), "…and every hub is joined");
}

// ── 7. OVER, AND NOTHING ELSE ─────────────────────────────────────────────────────────────────────────────────────────
// G (a thin column x 21..25, rows 6..24, inside P) is on a railway the map already has, G – N, north; it is joined to neither H1
// nor P. H1 – P – H3 runs straight over G's station, with no fan and no turn anywhere; S, below P, is the way round.
console.log("\n-- ⭐ an arrow over a station already on the rail, which it does not stop at: it waits; 2 px off waits, 2.5 px does not --");
const W7 = (gy) => {
  const G = 50, N = 51, S = 52;
  return { G, N, S, w: { rects: { [H1]: [[0, 0, 20, 40]], [P]: [[20, 0, 40, 30]], [N]: [[24, 0, 36, 6]], [G]: [[21, 6, 25, 24]], [S]: [[20, 30, 40, 40]], [H3]: [[40, 0, 60, 40]] },
    st: { [H1]: [10, 20], [P]: [30, 20], [N]: [30, 3], [G]: [23, gy], [S]: [30, 35], [H3]: [50, 20] },
    states: { 1: [H1], 2: [P, S, H3, G, N] }, vp: { 1: H1, 2: H3 }, top: [N, G], rails: `1 2 ${G} ${N}\n` } };
};
{
  const { G, S, w } = W7(20);
  ok([20, 18, 17.5].map((gy) => +off(W7(gy).w.st[G], w.st[H1], w.st[P]).toFixed(2)).join() === "0,2,2.5" && off(w.st[G], w.st[H1], w.st[S]) > 2,
    "(the fixture: G's station 0, 2 and 2.5 px off the line H1 – P, and more than 2 px off H1 – S, the way round)");
  const r = world("over", w), s = shape(r);
  ok(s.minOver > 2 && same(r.rows, [[H1, S, H3]]), "⭐⭐ nothing passes within 2 px of G's station: H1 – S – H3, not H1 – P – H3", { minOver: s.minOver, rows: r.rows });
  ok(s.joined(H1, H3), "…and the two hubs are joined");
  const r2 = world("over-2px", W7(18).w);
  ok(shape(r2).minOver > 2 && same(r2.rows, [[H1, S, H3]]), "⭐⭐ G's station 2 px off the line: it still waits", r2.rows);
  const r25 = world("over-2.5px", W7(17.5).w);
  ok(same(r25.rows, [[H1, P, H3]]) && sameWaited(r25.waited, {}), "⭐⭐ 2.5 px off: nothing waits — H1 – P – H3", { rows: r25.rows, railArrows: r25.plan.railArrows });
}

// ── 8. NOTHING LIES ON ANYTHING ───────────────────────────────────────────────────────────────────────────────────────
console.log("\n-- ⭐ CONTROL: a world where no arrow lies on another — a 3x2 grid of hubs — is planned as before --");
{
  const rects = {}, st = {}, states = {}, vp = {};
  let id = 60;
  for (let gy = 0; gy < 2; gy++) for (let gx = 0; gx < 3; gx++, id++) { rects[id] = [[gx * 20, gy * 20, gx * 20 + 20, gy * 20 + 20]]; st[id] = [gx * 20 + 10, gy * 20 + 10]; states[id] = [id]; vp[id] = id; }
  const r = world("grid", { rects, st, states, vp });
  ok(sameWaited(r.waited, {}) && r.laidAnyway === 0, "⭐ nothing waits", r.plan.railArrows);
  // #a-railway-closes-the-long-way-round: the grid's squares are loops the rule may close, a row each (how many is that test's)
  const loops = ((r.plan.railLoops || {}).laid) || 0;
  ok(r.rows.length === Object.keys(st).length - 1 + loops && shape(r).minFan >= 45, "⭐ five railways joining six hubs, and one more for each loop closed, every angle 45 deg or more", { rows: r.rows, loops });
}

// ── 9. THE WRITE ──────────────────────────────────────────────────────────────────────────────────────────────────────
console.log("\n-- ⭐ the write lays what the plan laid, and says what waited too --");
{
  const r = world("written", W1);
  const done = md.generateSupplyNetwork({ ...r.roots });
  const back = fs.readFileSync(path.join(r.roots.modRoot, "map", "railways.txt"), "utf8").split(/\r?\n/).map((l) => l.trim().split(/\s+/).map(Number)).filter((n) => n.length > 3).map((n) => n.slice(2, 2 + n[1]));
  ok(!!done && done.changed === true && same(back, r.rows), "⭐ railways.txt holds the planned rows", { back, rows: r.rows, error: done && done.error });
  ok(!!done && !!done.railArrows && sameWaited(done.railArrows.waited, r.waited) && done.railArrows.laidAnyway === r.laidAnyway, "⭐ …and the result says what waited, as the plan did", done && done.railArrows);
}

// ── 10. THE LEDGER ITSELF ─────────────────────────────────────────────────────────────────────────────────────────────
console.log("\n-- ⭐ the ledger on hand-placed stations: each threshold from both sides, and what it does not judge --");
{
  const LW = 400;
  // undefined where the module has no ledger, and what it threw where a question throws (a FAIL, not a crash: a ledger that reads
  // a missing station's x throws on the last pin, where the planner would have thrown in the middle of Generate land)
  const ledger = (pts, laid = []) => {
    if (typeof md.railArrowLedger !== "function") return { why: () => undefined };
    const st = new Map(Object.entries(pts).map(([k, v]) => [+k, { x: v[0], row: v[1] }]));
    const L = md.railArrowLedger({ W: LW, stationOf: (p) => st.get(p) || null });
    for (const p of laid) L.lay(p);
    return { why: (p) => { try { return L.why(p); } catch (e) { return "threw: " + e.message; } } };
  };
  const rad = (d) => d * Math.PI / 180;
  // fan: 1 at (100, 100) with an arrow east to 2 laid; a new arrow out of 1 at a degrees from it — and the same arrow walked the
  // other way, a path that ENDS at 1
  for (const [a, want] of [[19.9, "fan"], [20.1, ""]]) {
    const L = ledger({ 1: [100, 100], 2: [140, 100], 3: [100 + 40 * Math.cos(rad(a)), 100 + 40 * Math.sin(rad(a))] }, [[1, 2]]);
    ok(L.why([1, 3]) === want, `⭐⭐ an arrow leaving a station ${a} deg from one already there: '${want}'`, L.why([1, 3]));
    ok(L.why([3, 1]) === want, `⭐⭐ an arrow ENDING at a station ${a} deg from one already there: '${want}'`, L.why([3, 1]));
  }
  // turn: a path doubling back by a degrees at its middle province, nothing laid
  for (const [a, want] of [[19.9, "turn"], [20.1, ""]]) {
    const L = ledger({ 1: [100, 100], 2: [140, 100], 3: [140 - 40 * Math.cos(rad(a)), 100 + 40 * Math.sin(rad(a))] });
    ok(L.why([1, 2, 3]) === want, `⭐⭐ a path turning back by ${a} deg at a province it passes: '${want}'`, L.why([1, 2, 3]));
  }
  // over: 5 on the rail (joined south to 6), d px off a new arrow 1 – 2 that does not stop at it
  for (const [d, want] of [[2.0, "over"], [2.01, ""]]) {
    const L = ledger({ 1: [100, 100], 2: [160, 100], 5: [130, 100 + d], 6: [130, 140] }, [[5, 6]]);
    ok(L.why([1, 2]) === want, `⭐⭐ an arrow ${d} px from a station on the rail it does not stop at: '${want}'`, L.why([1, 2]));
  }
  // …and 2 px off across row or column 96 — a cell boundary of the ledger's 16 px grid, and of any power-of-two grid up to 32 px —
  // so its search must reach past the cells the arrow itself crosses; the control, 2 px off on the arrow's own side, needs no reach
  for (const [where, pts] of [
    ["above it, across row 96", { 1: [100, 97.5], 2: [140, 97.5], 5: [120, 95.5], 6: [120, 40] }],
    ["beside it, across column 96", { 1: [97.5, 100], 2: [97.5, 140], 5: [95.5, 120], 6: [40, 120] }],
    ["below it, on its own side of row 96 (control)", { 1: [100, 97.5], 2: [140, 97.5], 5: [120, 99.5], 6: [120, 140] }],
  ]) {
    const A = pts[1], B = pts[2], O = pts[5];
    const L = ledger(pts, [[5, 6]]);
    ok(off(O, A, B) === 2 && L.why([1, 2]) === "over", `⭐⭐ a station on the rail 2 px off an arrow, ${where}: 'over'`, { off: off(O, A, B), why: L.why([1, 2]) });
  }
  ok(ledger({ 1: [100, 100], 2: [160, 100], 5: [130, 100] }).why([1, 2]) === "", "⭐ a station NOT on the rail is not asked: only what is laid is");
  ok(ledger({ 1: [100, 100], 2: [160, 100], 3: [130, 70], 4: [130, 130] }, [[3, 4]]).why([1, 2]) === "", "⭐⭐ two arrows crossing between their stations: not a reason (waiting on one detours the network)");
  ok(ledger({ 1: [100, 100], 5: [130, 100], 3: [130, 70], 4: [130, 130] }, [[3, 4]]).why([1, 5]) === "", "⭐ THE LIMIT: a station not yet on the rail is not asked whether a laid arrow runs over it");
  ok(ledger({ 1: [100, 100], 3: [130, 70], 4: [130, 130] }, [[3, 4]]).why([1, 4]) === "", "an arrow that meets another at its station: ''");
  ok(ledger({ 1: [100, 100], 2: [160, 100], 3: [130, 70] }, [[3, 1]]).why([1, 2]) === "", "two arrows sharing a station at 90 deg: ''");
  ok(ledger({ 1: [10, 100], 2: [390, 100], 5: [200, 100], 6: [200, 60] }, [[5, 6]]).why([1, 2]) === "", "an arrow round the east–west seam is not judged");
  ok(ledger({ 1: [100, 100], 2: [140, 100], 3: [140, 102] }, [[1, 2], [1, 3]]).why([1, 2]) === "", "an arrow already laid is the same arrow, not a new one");
  ok(ledger({ 1: [100, 100], 2: [140, 100] }, [[1, 2]]).why([1, 9]) === "", "no station, nothing asked");
}

try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) { /* scratch only */ }
console.log("\n" + (fail ? "FAILED " + fail + "/" + (pass + fail) : "PASSED " + pass + "/" + pass));
process.exitCode = fail ? 1 : 0;
