// ⛔ #a-railway-is-priced-by-the-ground-it-crosses — A GENERATED RAILWAY PAYS FOR A BIG PROVINCE BY ITS SIZE, NOT AS ONE STEP.
//
// The owner played TEST 37 (10-21): "some places did not have a full correct train track look". The rail search counted provinces,
// so a way through one big province cost what a way through one small one did, and the fewest provinces won — the big ones. The
// game draws the 3D track from border to border through each province, past its station, so a big province is a long stretch of
// track that runs far from its station. TEST 37's own states re-planned (scratchpad cityrail/builder/replan.js on a copy of the t37a
// rehearsal; track-model.js, the curves hoi4.exe 1.19.3 builds): 14.4% of the track ran inside provinces over 1,000 px (the base
// game 4.2%), its rail provinces were 1.10x as likely as its land to be over 1,000 px (the base game 0.24x), and through-routes
// passed their station by 2.23 px at the median and more than 10 px 114 times (the base game 1.12 and 15).
//
// So a border crossed costs RAIL_STEP_UNITS × the mean of its two provinces' sizes, a size being √(px ÷ the median px of the
// provinces the rail BELOW runs through) and never under 1 — a province no bigger than the rail below's costs one step, as before,
// and a sliver is no cheaper than a province; a border that costs a step more (thin, missed, steep) costs RAIL_DEAR_UNITS × the same
// mean, so it still loses to a clean way through one province of its own size, and still beats one two provinces longer. With no
// railway below to ask, nothing is weighed and every province is one step, as it always was.
//
// Pinned on small worlds of rectangles over the sea, over a layer below whose own railway and bitmap give the median:
//   1. ⭐ one big province or three small ones between two hubs: the small ones; CONTROL: with no railway below, the big one;
//   2. the plan says what it weighed by, the median read back off the fixture's layer below;
//   3. ⭐ a sliver is no cheaper than a province: of two ways of one count, the tie-break of the walk's widest border decides, as before;
//   4. ⭐ a border that costs a step more between two big provinces costs it at their size: the way round by a third of their size.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-rail-ground-"));
process.env.APPDATA = path.join(ROOT, "appdata"); process.env.NOVA_APP_DATA_DIR = process.env.APPDATA; process.env.XDG_CONFIG_HOME = process.env.APPDATA;
process.env.NOVA_HOME_DIR = path.join(ROOT, "home");
fs.mkdirSync(process.env.NOVA_HOME_DIR, { recursive: true });
const md = require("./map-data.js");

let pass = 0, fail = 0;
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
const pairKey = (a, b) => `${Math.min(a, b)}-${Math.max(a, b)}`;
const SEA = 1;
const sameWay = (row, want) => !!row && (row.join() === want.join() || row.slice().reverse().join() === want.join());
const runsOver = (rails, a, b) => rails.some((r) => r.some((p, i) => i > 0 && pairKey(p, r[i - 1]) === pairKey(a, b)));
const atOf = (rects) => (x, y) => { for (const [id, rs] of Object.entries(rects)) for (const [x0, y0, x1, y1] of rs) if (x >= x0 && x < x1 && y >= y0 && y < y1) return +id; return SEA; };

// ── the layer below: a strip of land provinces, a railway over some of them ─────────────────────────────────────────────────
//   ids 2..6 in a row, 8 px tall: 2 is 4 px wide, 3 8, 4 8, 5 12, 6 16; its railway runs 2 – 3 – 4 – 5
const BELOW_RECTS = { 2: [[0, 0, 4, 8]], 3: [[4, 0, 12, 8]], 4: [[12, 0, 20, 8]], 5: [[20, 0, 32, 8]], 6: [[32, 0, 48, 8]] };
const BELOW_RAIL = [2, 3, 4, 5];
const game = path.join(ROOT, "game");
{
  const W = 48, H = 8, at = atOf(BELOW_RECTS);
  write(game, "hoi4.exe", "");
  write(game, "map/provinces.bmp", bmp24(W, H, (x, y) => colour(at(x, y))));
  write(game, "map/definition.csv", ["0;0;0;0;land;false;unknown;0", `${SEA};${colour(SEA).join(";")};sea;false;ocean;0`]
    .concat(Object.keys(BELOW_RECTS).map((id) => `${id};${colour(+id).join(";")};land;false;plains;1`)).join("\n") + "\n");
  write(game, "map/railways.txt", `1 ${BELOW_RAIL.length} ${BELOW_RAIL.join(" ")}\n`);
}
// the median the rule weighs by, read off the fixture: its rail provinces' pixels, the lower median
const BELOW_PX = (() => {
  const n = BELOW_RAIL.map((id) => BELOW_RECTS[id].reduce((s, [x0, y0, x1, y1]) => s + (x1 - x0) * (y1 - y0), 0)).sort((a, b) => a - b);
  return n[(n.length - 1) >> 1];
})();

/** A mod world of rectangles over the sea; `below` false: over no layer at all. Every state AAA's, its hub on `vp`. `rails` are the
 *  railways that join hubs; `loops` the ones that close a loop where the way round is long (#a-railway-closes-the-long-way-round). */
function world(tag, { W, H, rects, states, below = true }) {
  const at = atOf(rects);
  const border = new Map(), px = new Map();
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const p = at(x, y), e = at((x + 1) % W, y);
    px.set(p, (px.get(p) || 0) + 1);
    if (p !== e) border.set(pairKey(p, e), (border.get(pairKey(p, e)) || 0) + 1);
    if (y + 1 < H) { const s = at(x, y + 1); if (p !== s) border.set(pairKey(p, s), (border.get(pairKey(p, s)) || 0) + 1); }
  }
  const mod = path.join(ROOT, tag);
  write(mod, "descriptor.mod", `name="${tag}"\nreplace_path="history/states"\n`);
  write(mod, "map/provinces.bmp", bmp24(W, H, (x, y) => colour(at(x, y))));
  const ids = [SEA].concat(Object.keys(rects).map(Number));
  write(mod, "map/definition.csv", ["0;0;0;0;land;false;unknown;0"].concat(ids.map((id) => `${id};${colour(id).join(";")};${id === SEA ? "sea;false;ocean;0" : "land;false;plains;1"}`)).join("\n") + "\n");
  for (const [s, { provs, vp }] of Object.entries(states)) {
    write(mod, `history/states/${s}-S.txt`, `state={\n\tid=${s}\n\tname="STATE_${s}"\n\tmanpower=1000\n\tstate_category=rural\n\tprovinces={ ${provs.join(" ")} }\n\thistory={\n\t\towner=AAA\n\t\tvictory_points = { ${vp} 5 }\n\t}\n}\n`);
  }
  write(mod, "map/adjacencies.csv", "From;To;Type;Through;start_x;start_y;stop_x;stop_y;adjacency_rule_name;Comment\n-1;-1;-1;-1;-1;-1;-1;-1;-1\n");
  write(mod, "map/supply_nodes.txt", "");
  write(mod, "map/railways.txt", "");
  const plan = md.generateSupplyNetwork({ modRoot: mod, gameRoot: below ? game : path.join(ROOT, "no-game"), dependencyRoots: [], dryRun: true }) || {};
  return { plan, px, width: (a, b) => border.get(pairKey(a, b)) || 0, hubs: (plan.newHubs || []).map((h) => h.province).sort((a, b) => a - b),
    rails: (plan.railRows || []).filter((r) => !r.loop).map((r) => r.provinces), loops: (plan.railRows || []).filter((r) => r.loop).map((r) => r.provinces) };
}
const sizeOf = (w, p) => Math.max(1, Math.sqrt(w.px.get(p) / BELOW_PX));
const U = md.RAIL_STEP_UNITS, D = md.RAIL_DEAR_UNITS;
const edge = (w, a, b) => Math.max(1, Math.round(U * (sizeOf(w, a) + sizeOf(w, b)) / 2));
const walkCost = (w, ps) => ps.slice(1).reduce((s, p, i) => s + edge(w, ps[i], p), 0);

// ── 1. one big province or three small ones ──────────────────────────────────────────────────────────────────────────────
//        x: 0      8    19   29   40     48
//   y 0   [ H1    ][ S1 ][ S2 ][ S3 ][ H2    ]      H1, H2: 8 × 16; S1–S3 along the top, 8 tall; B under them, 32 × 32; sea to x 56
//     8   [ H1    ][          B          ][ H2    ]
//    16           [          B          ]
const ONE = { 10: [[0, 0, 8, 16]], 11: [[40, 0, 48, 16]], 12: [[8, 0, 19, 8]], 13: [[19, 0, 29, 8]], 14: [[29, 0, 40, 8]], 15: [[8, 8, 40, 40]] };
const [H1, H2, S1, S2, S3, B] = [10, 11, 12, 13, 14, 15];
const ONE_STATES = { 1: { provs: [H1, S1, S2, B], vp: H1 }, 2: { provs: [H2, S3], vp: H2 } };
console.log("\n-- ⭐ 1. between two hubs, one big province or three small ones: the small ones --");
{
  const w = world("big-or-small", { W: 56, H: 40, rects: ONE, states: ONE_STATES });
  ok(w.width(H1, B) === 8 && w.width(B, H2) === 8 && w.width(H1, S1) === 8 && w.width(S1, S2) === 8 && w.width(S2, S3) === 8 && w.width(S3, H2) === 8 && w.width(H1, H2) === 0,
    "(the fixture: H1 – B – H2 and H1 – S1 – S2 – S3 – H2, every border 8 px)");
  const viaB = walkCost(w, [H1, B, H2]), viaS = walkCost(w, [H1, S1, S2, S3, H2]);
  ok(BELOW_PX === 64 && w.px.get(B) === 1024 && viaS < viaB, `(the price, from the fixture: B is ${w.px.get(B)} px against the rail below's ${BELOW_PX}; through B ${viaB}, through S1–S3 ${viaS} — counting provinces, 2 and 4)`, { viaB, viaS });
  ok(w.hubs.join() === [H1, H2].join() && w.rails.length === 1, "two hubs, one railway between them", { hubs: w.hubs, rails: w.rails });
  ok(sameWay(w.rails[0], [H1, S1, S2, S3, H2]), "⭐⭐ the railway runs through the three small provinces", w.rails);
  ok(!w.rails.some((r) => r.includes(B)), "⭐⭐ …and not through the big one (the loop the long way round then closes through it is another rule's)", { rails: w.rails, loops: w.loops });
  ok(w.plan.railCost && w.plan.railCost.railProvinceMedianPxBelow === BELOW_PX && md.railProvinceMedianPxBeneath({ modRoot: path.join(ROOT, "big-or-small"), gameRoot: game, dependencyRoots: [] }) === BELOW_PX,
    `⭐ 2. the plan says what it weighed by: the rail below's median province, ${BELOW_PX} px, read off the layer below`, w.plan.railCost);
  const bare = world("big-or-small-no-rail-below", { W: 56, H: 40, rects: ONE, states: ONE_STATES, below: false });
  ok(bare.rails.length === 1 && sameWay(bare.rails[0], [H1, B, H2]) && bare.plan.railCost && bare.plan.railCost.railProvinceMedianPxBelow === 0,
    "⭐⭐ CONTROL: with no railway below, every province is one step, and the fewest provinces win, as they always did: H1 – B – H2", { rails: bare.rails, railCost: bare.plan.railCost });
}

// ── 3. a sliver is no cheaper ─────────────────────────────────────────────────────────────────────────────────────────────
//        x: 8      16      24
//   y 0   [ H 40 ][ U2 42 ]           U1 (41): the three-pixel column x 13..15 under H, 24 px; it touches H over 3 px, V over 8
//     8     [ U1 ][ V 43  ]           U2 touches V over 4 — the rest of its bottom row is sea
//    16           [ X 44  ] [ Y 45 ] [ H2 46 ] below
console.log("\n-- ⭐ 3. a sliver is no cheaper than a province: of two ways of one count, the widest walk, as before --");
{
  const H = 40, U1 = 41, U2 = 42, V = 43, X = 44, Y = 45, HH = 46;
  const rects = { [H]: [[8, 0, 16, 8]], [U1]: [[13, 8, 16, 16]], [U2]: [[16, 0, 24, 7], [16, 7, 20, 8]], [V]: [[16, 8, 24, 16]], [X]: [[16, 16, 24, 24]], [Y]: [[16, 24, 24, 32]], [HH]: [[16, 32, 24, 40]] };
  const w = world("sliver", { W: 32, H: 40, rects, states: { 1: { provs: [H, U1, U2, V], vp: H }, 2: { provs: [X, Y, HH], vp: HH } } });
  ok(w.width(H, U1) === 3 && w.width(U1, V) === 8 && w.width(H, U2) === 8 && w.width(U2, V) === 4 && w.px.get(U1) === 24 && w.px.get(U2) === 60,
    "(the fixture: by the 24 px sliver U1 the walk crosses 3 px and 8; by U2, 60 px, 8 and 4 — both under the rail below's median)", { U1: w.px.get(U1), U2: w.px.get(U2) });
  ok(w.rails.length === 1 && sameWay(w.rails[0], [H, U2, V, X, Y, HH]), "⭐⭐ the railway leaves the hub over its wide border, H – U2 – V, as the tie-break always chose", w.rails);
  ok(!runsOver(w.rails, H, U1), "⭐⭐ …and not through the sliver, which a size under one would have made the cheaper", w.rails);
}

// ── 4. a thin border between two big provinces ───────────────────────────────────────────────────────────────────────────
//        x: 0               32 33              65
//   y 0   [ A               ]~[ X               ]      A and X: 32 × 32, meeting over ONE pixel, (32, 31); T under both
//    32           [        T        ]                   T: 32 × 32, 16 px of border with each
console.log("\n-- ⭐ 4. a thin border between two big provinces costs its step at their size: round by a third as big --");
{
  const A = 50, X = 51, T = 52;
  const rects = { [A]: [[0, 0, 32, 32], [32, 31, 33, 32]], [X]: [[33, 0, 65, 32]], [T]: [[17, 32, 49, 64]] };
  const w = world("thin-and-big", { W: 72, H: 64, rects, states: { 1: { provs: [A, T], vp: A }, 2: { provs: [X], vp: X } } });
  const thin = edge(w, A, X) + Math.round(D * (sizeOf(w, A) + sizeOf(w, X)) / 2), round = walkCost(w, [A, T, X]), unscaled = edge(w, A, X) + D;
  ok(w.width(A, X) === 1 && w.width(A, T) === 16 && w.width(T, X) === 16, "(the fixture: A – X over one pixel; A – T – X over 16 and 16)", { AX: w.width(A, X), AT: w.width(A, T), TX: w.width(T, X) });
  ok(round < thin && unscaled < round, `(the price, from the fixture: over the pixel ${thin}, round by T ${round}; with the step at a small province's size, ${unscaled})`, { thin, round, unscaled });
  ok(w.rails.length === 1 && sameWay(w.rails[0], [A, T, X]) && !runsOver(w.rails, A, X), "⭐⭐ the railway goes round by T, not over the one-pixel border", w.rails);
}

try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) { /* scratch only */ }
console.log("\n" + (fail ? "FAILED " + fail + "/" + (pass + fail) : "PASSED " + pass + "/" + pass));
process.exitCode = fail ? 1 : 0;
