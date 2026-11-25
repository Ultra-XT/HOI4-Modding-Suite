// ⛔ #a-railway-crosses-a-real-border — A GENERATED RAILWAY TAKES THE WIDE BORDER, NOT THE CORNER, AND NEVER A BORDER THAT IS NOT THERE.
//
// The owner played TEST 31 (09-30): "some train tracks are not connected correctly within some cities, seem to not connect at all
// or overlap". The game draws one railway twice — a straight white arrow from station to station on the supply map, and the brown
// 3D track, which has to CROSS THE BORDER the two provinces share. Where that border is a single pixel the track is forced out to
// that corner, away from the arrow: 46 of TEST 31's 1,553 rail edges crossed a one-pixel border (3.0%; vanilla 19 of 3,317,
// 0.57%), 35 of them at a hub, and the arrow missed the shared border by more than 5 px on 80 edges (vanilla: 6). Two more rails
// ran between provinces that do not touch at all — over adjacencies.csv rows that were straits until the sea under them was raised.
//
// generateSupplyNetwork counted a border as a border. It joins hubs by the fewest provinces, and that stays its first cost; what
// changed is what it does with a TIE, and what it calls a border:
//   (a) a province the search reaches from several provinces at once is entered by the way whose walk back to the hub is widest
//       at its narrowest border, then over the widest border into the province itself;
//   (b) of two links of the same length, the one whose narrowest border is wider is laid first;
//   (c) two provinces joined only by an adjacencies.csv row are a rail edge only where that row crosses WATER — a strait, which
//       vanilla's railways do cross (5 of them) — and not when what it went through is land now, or nothing.
// provinceNeighbourGraph counts the pixel edges each pair shares (`borderPixels`), which is what all three read.
//
// ⛔ #a-railway-crosses-a-river — WATER, NOT "A SEA PROVINCE". (c) was first written "through a sea province" and measured on vanilla
// alone. Hearts of Minecraft joins its river banks with 70 rows through nothing (54 `large_river`, 16 untyped), Millennium Dawn,
// Novum Vexillum and Old World Blues cross lakes with rows through a LAKE province, and Minecraft joins its worlds with twelve
// rows over dry land, thousands of pixels long — and each map's own railways run over them. A rebuild of Minecraft's network on
// its own hubs fell from 7 pieces with 774 hubs in the largest to 22 with 310. So: a row that names what it goes through is
// believed (sea or lake: a crossing; land: not); one that names nothing is a crossing when only water lies between the two
// provinces; and a row over dry land is still an edge when nothing else joins the two pieces of land it joins. One fixture for
// each shape below, and the rule is pinned where the search steps as well as where two hubs' land meets.
//
// Pinned on small worlds of rectangles. In each, the ids are arranged so that the old rule — first seen, lowest id — takes the
// narrow way, and every border width quoted is counted from the fixture's own pixels.
//
// ⛔ #a-thin-border-costs-a-step — A BORDER OF TWO PIXELS OR FEWER NOW COSTS ONE STEP MORE (test-a-thin-border-costs-a-railway-a-step.js),
// so a one-pixel corner no longer TIES with a wide way of the same length: it loses outright, and (a) and (b) are never asked. The
// narrow borders below were one-pixel corners until then; they are three pixels or more now — narrow, not thin — so the two ways
// still cost the same and it is still the tie-break that is pinned. Two checks turned when the step came in, and moved with it.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-wide-border-"));
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
 * A world of rectangles [x0, y0, x1, y1) over the sea (province 1; province 2 where `east` says so), with single pixels handed from
 * one province to another ({ "x,y": id }) — which is how a border is drawn narrower than its rectangles. `sea`: ids typed sea
 * besides 1 and 2; `lake`: ids typed lake. Every state is AAA's and has its victory point — so its hub — on `vp`.
 */
function world(tag, { W, H, rects, pixels = {}, east = W, sea = [], lake = [], states, vp, rows = [] }) {
  const provAt = (x, y) => {
    if (pixels[`${x},${y}`]) return pixels[`${x},${y}`];
    for (const [id, [x0, y0, x1, y1]] of Object.entries(rects)) if (x >= x0 && x < x1 && y >= y0 && y < y1) return +id;
    return x >= east ? 2 : SEA;
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
  const isSea = (id) => id === 1 || id === 2 || sea.includes(id);
  const ids = [1, 2].concat(Object.keys(rects).map(Number));
  write(mod, "map/definition.csv", ["0;0;0;0;land;false;unknown;0"].concat(ids.map((id) => `${id};${colour(id).join(";")};${isSea(id) ? "sea;false;ocean;0" : lake.includes(id) ? "lake;false;lakes;0" : "land;false;plains;1"}`)).join("\n") + "\n");
  for (const [s, provs] of Object.entries(states)) {
    write(mod, `history/states/${s}-S.txt`, `state={\n\tid=${s}\n\tname="STATE_${s}"\n\tmanpower=1000\n\tstate_category=rural\n\tprovinces={ ${provs.join(" ")} }\n\thistory={\n\t\towner=AAA\n\t\tvictory_points = { ${vp[s]} 5 }\n\t}\n}\n`);
  }
  write(mod, "map/adjacencies.csv", ["From;To;Type;Through;start_x;start_y;stop_x;stop_y;adjacency_rule_name;Comment"].concat(rows, ["-1;-1;-1;-1;-1;-1;-1;-1;-1"]).join("\n") + "\n");
  write(mod, "map/supply_nodes.txt", "");
  write(mod, "map/railways.txt", "");
  const roots = { modRoot: mod, gameRoot: path.join(ROOT, "no-game"), dependencyRoots: [] };
  const plan = md.generateSupplyNetwork({ ...roots, dryRun: true }) || {};
  return { roots, border, width: (a, b) => border.get(pairKey(a, b)) || 0, plan, hubs: (plan.newHubs || []).map((h) => h.province).sort((a, b) => a - b), rails: (plan.railRows || []).map((r) => r.provinces) };
}
const graphOf = (w) => { const adj = md.provinceNeighbourGraph({ ...w.roots, model: md.buildMapModel(w.roots) }); return { adj, px: adj && adj.borderPixels instanceof Map ? adj.borderPixels : new Map() }; };
const sameWay = (row, want) => !!row && (row.join() === want.join() || row.slice().reverse().join() === want.join());
const runsOver = (rails, a, b) => rails.some((r) => r.some((p, i) => i > 0 && pairKey(p, r[i - 1]) === pairKey(a, b)));

// ── (a) the search enters a province over its wider border ─────────────────────────────────────────────────────────────
//        x: 8      16      24
//   y 0   [   H1 (10)    ]            H1 touches A and B, 8 px each
//     8   [ A 11 ][ B 12 ]            A owns THREE pixels of B's bottom row, (16..18,15): its only contact with X
//    16    (sea)  [ X 13 ]
//    24           [ Y 14 ]
//    32           [ Z 15 ]
//    40           [ H2 16]
console.log("\n-- ⭐ (a) a province reached from two provinces at once is entered over the wider border --");
{
  const H1 = 10, A = 11, B = 12, X = 13, Y = 14, Z = 15, H2 = 16;
  const w = world("frontier", { W: 32, H: 48, east: 24,
    rects: { [H1]: [8, 0, 24, 8], [A]: [8, 8, 16, 16], [B]: [16, 8, 24, 16], [X]: [16, 16, 24, 24], [Y]: [16, 24, 24, 32], [Z]: [16, 32, 24, 40], [H2]: [16, 40, 24, 48] },
    pixels: { "16,15": A, "17,15": A, "18,15": A }, states: { 1: [H1, A, B, X], 2: [Y, Z, H2] }, vp: { 1: H1, 2: H2 } });
  ok(w.width(A, X) === 3 && w.width(B, X) === 5 && w.width(H1, A) === w.width(H1, B) && w.width(H1, X) === 0,
    `(the fixture: X touches A over 3 pixels and B over ${w.width(B, X)}; both are one step from the hub, which X does not touch)`, { AX: w.width(A, X), BX: w.width(B, X), H1A: w.width(H1, A), H1B: w.width(H1, B) });
  ok(A < B, "(…and A has the lower id, so the first province to reach X is A)");
  ok(w.hubs.join() === [H1, H2].join() && w.rails.length === 1, "two hubs, one railway between them", { hubs: w.hubs, rails: w.rails });
  ok(sameWay(w.rails[0], [H1, B, X, Y, Z, H2]), "⭐⭐ it runs H1 – B – X: into X over the wide border", w.rails);
  ok(!runsOver(w.rails, A, X), "⭐⭐ …and not over the narrower border between A and X", w.rails);

  // provinceNeighbourGraph's count, against the fixture's own
  const { adj, px } = graphOf(w);
  const wrong = [...w.border].filter(([k, n]) => px.get(k) !== n).concat([...px].filter(([k]) => !w.border.has(k)));
  ok(px.size === w.border.size && wrong.length === 0, `⭐⭐ the graph counts the pixel edges each pair shares: all ${w.border.size} pairs agree with the fixture's own count`, { size: px.size, wrong: wrong.slice(0, 6) });
  ok(w.width(1, 2) === 48 && px.get(pairKey(1, 2)) === 48, "⭐ …the east–west seam among them: the two seas meet nowhere else, and share the map's 48 rows across it", px.get(pairKey(1, 2)));
  ok(adj instanceof Map && [...w.border.keys()].every((k) => { const [a, b] = k.split("-").map(Number); return adj.get(a) instanceof Set && adj.get(a).has(b) && adj.get(b).has(a); })
    && [...adj].reduce((n, [, s]) => n + s.size, 0) === 2 * w.border.size, "…and the graph itself is what it was: each province's set of neighbours, those pairs and no others");
}

//        x: 8      16      24
//   y 0   [ H 40 ][ U2 42 ]           U1 (41) is the three-pixel column x = 13..15 under H: it touches H over THREE pixels, and V over 8
//     8     [ U1 ][ V 43  ]           U2 touches V over 4 — the other four pixels of its bottom row are sea
//    16           [ X 44  ]
//    24           [ Y 45  ]
//    32           [ H2 46 ]
console.log("\n-- ⭐ (a) …by the way whose whole walk back to the hub is widest, not just its last border --");
{
  const H = 40, U1 = 41, U2 = 42, V = 43, X = 44, Y = 45, H2 = 46;
  const w = world("walk-back", { W: 32, H: 40, east: 24,
    rects: { [H]: [8, 0, 16, 8], [U1]: [13, 8, 16, 16], [U2]: [16, 0, 24, 8], [V]: [16, 8, 24, 16], [X]: [16, 16, 24, 24], [Y]: [16, 24, 24, 32], [H2]: [16, 32, 24, 40] },
    pixels: { "20,7": SEA, "21,7": SEA, "22,7": SEA, "23,7": SEA }, states: { 1: [H, U1, U2, V], 2: [X, Y, H2] }, vp: { 1: H, 2: H2 } });
  ok(w.width(H, U1) === 3 && w.width(U1, V) === 8 && w.width(H, U2) === 8 && w.width(U2, V) === 4 && w.width(H, V) === 0,
    "(the fixture: by U1 the walk crosses 3 px and then 8; by U2, 8 and then 4 — the LAST border is wider by U1, the walk is wider by U2)", { HU1: w.width(H, U1), U1V: w.width(U1, V), HU2: w.width(H, U2), U2V: w.width(U2, V) });
  ok(U1 < U2, "(…and U1 has the lower id)");
  ok(w.hubs.join() === [H, H2].join() && w.rails.length === 1 && sameWay(w.rails[0], [H, U2, V, X, Y, H2]), "⭐⭐ the railway leaves the hub over its wide border: H – U2 – V", w.rails);
  ok(!runsOver(w.rails, H, U1), "⭐⭐ …and not over the narrow border between the hub and U1", w.rails);
}

//        x: 8      16      24
//   y 0   [    H 50      ]            H's bottom row is sea but for three pixels over U1 and three over U2
//     8   [ U1 51][ U2 52]            U1's bottom row is sea but for four pixels: it touches V over 4, U2 over 7
//    16   [    V 53      ]
//    24   [    X 54      ]
//    32   [    Y 55      ]
//    40   [    H2 56     ]
console.log("\n-- ⭐ (a) …and of two walks equally wide, over the wider border into the province --");
{
  const H = 50, U1 = 51, U2 = 52, V = 53, X = 54, Y = 55, H2 = 56;
  const pixels = {};
  for (let x = 11; x <= 20; x++) pixels[`${x},7`] = SEA;
  for (let x = 12; x <= 15; x++) pixels[`${x},15`] = SEA;
  const w = world("equal-walks", { W: 32, H: 48, east: 24,
    rects: { [H]: [8, 0, 24, 8], [U1]: [8, 8, 16, 16], [U2]: [16, 8, 24, 16], [V]: [8, 16, 24, 24], [X]: [8, 24, 24, 32], [Y]: [8, 32, 24, 40], [H2]: [8, 40, 24, 48] },
    pixels, states: { 1: [H, U1, U2, V], 2: [X, Y, H2] }, vp: { 1: H, 2: H2 } });
  // ⛔ #a-thin-border-costs-a-step: at 2 px each the hub's two borders cost a step more, V is then as far from H2 as from H, and it
  // is H2's search that takes it — so this fixture's narrowest borders are 3 px, narrow but not thin
  ok(w.width(H, U1) === 3 && w.width(H, U2) === 3 && w.width(U1, V) === 4 && w.width(U2, V) === 8 && w.width(H, V) === 0,
    "(the fixture: both walks are 3 px at their narrowest — the hub's own border — and V is entered over 4 px from U1, 8 from U2)", { HU1: w.width(H, U1), HU2: w.width(H, U2), U1V: w.width(U1, V), U2V: w.width(U2, V) });
  ok(U1 < U2, "(…and U1 has the lower id)");
  ok(w.hubs.join() === [H, H2].join() && w.rails.length === 1 && sameWay(w.rails[0], [H, U2, V, X, Y, H2]), "⭐⭐ the railway enters V over the wider border: H – U2 – V", w.rails);
}

//        x: 8      16      24
//   y 0   [    H 80      ]            the two ways are alike: west and east each touch H over 8 px and V over 8
//     8   [ west ][ east ]
//    16   [    V 83      ]
//    24   [    X 84      ]            …and H2 is three steps from V, so it is H's search that reaches V, from both at once
//    32   [    Y 85      ]
//    40   [    H2 86     ]
console.log("\n-- ⭐ (a) …and of two ways alike in both, the lower id — whichever side it lies on --");
for (const [tag, westId, eastId] of [["alike-west", 81, 82], ["alike-east", 82, 81]]) {
  const H = 80, V = 83, X = 84, Y = 85, H2 = 86, low = Math.min(westId, eastId);
  const w = world(tag, { W: 32, H: 48, east: 24,
    rects: { [H]: [8, 0, 24, 8], [westId]: [8, 8, 16, 16], [eastId]: [16, 8, 24, 16], [V]: [8, 16, 24, 24], [X]: [8, 24, 24, 32], [Y]: [8, 32, 24, 40], [H2]: [8, 40, 24, 48] },
    states: { 1: [H, westId, eastId, V], 2: [X, Y, H2] }, vp: { 1: H, 2: H2 } });
  ok(w.width(H, westId) === w.width(H, eastId) && w.width(westId, V) === w.width(eastId, V) && w.width(H, westId) === w.width(westId, V) && w.width(H, westId) > 2 && w.width(H, V) === 0,
    `(the fixture: the west and the east way are ${w.width(H, westId)} px wide at every border; the lower id, ${low}, is the ${low === westId ? "west" : "east"} one)`, { HW: w.width(H, westId), HE: w.width(H, eastId), WV: w.width(westId, V), EV: w.width(eastId, V) });
  ok(w.hubs.join() === [H, H2].join() && w.rails.length === 1 && sameWay(w.rails[0], [H, low, V, X, Y, H2]), `⭐⭐ the railway runs by the lower id, H – ${low} – V: the same network from the same map, every time`, w.rails);
}

// ── (b) of two links the same length, the wider one ────────────────────────────────────────────────────────────────────
//        x: 8      16      24
//   y 0   [ H3 20][ Mw 22]            both ways from H3 to H4 are two steps
//     8   [ Mc 21 ][ H4 23]           Mc stops one column short of H4, but for THREE pixels, (15,8..10)
console.log("\n-- ⭐ (b) of two links of the same length, the one over the wider borders is laid --");
const linkWorld = (tag, far) => {
  const H3 = 20, Mc = 21, Mw = 22, H4 = 23, Mw2 = 24;
  // `far`: H4 one cell further south, with Mw2 between it and Mw — the wide way is then three steps and the narrow way still two
  const rects = far ? { [H3]: [8, 0, 16, 8], [Mc]: [8, 8, 15, 24], [Mw]: [16, 0, 24, 8], [Mw2]: [16, 8, 24, 16], [H4]: [16, 16, 24, 24] }
    : { [H3]: [8, 0, 16, 8], [Mc]: [8, 8, 15, 16], [Mw]: [16, 0, 24, 8], [H4]: [16, 8, 24, 16] };
  const y0 = far ? 16 : 8, pixels = { [`15,${y0}`]: Mc, [`15,${y0 + 1}`]: Mc, [`15,${y0 + 2}`]: Mc };
  const w = world(tag, { W: 32, H: 24, rects, pixels, states: { 3: far ? [H3, Mc, Mw, Mw2] : [H3, Mc, Mw], 4: [H4] }, vp: { 3: H3, 4: H4 } });
  return { ...w, H3, Mc, Mw, H4, Mw2 };
};
{
  const w = linkWorld("link", false), { H3, Mc, Mw, H4 } = w;
  ok(w.width(Mc, H4) === 3 && w.width(H3, Mc) > 3 && w.width(H3, Mw) > 3 && w.width(Mw, H4) > 3 && w.width(H3, H4) === 0,
    `(the fixture: two ways of two steps — by Mc, which touches H4 over 3 pixels, and by Mw, ${w.width(Mw, H4)} px wide all the way)`, { McH4: w.width(Mc, H4), H3Mc: w.width(H3, Mc), H3Mw: w.width(H3, Mw), MwH4: w.width(Mw, H4) });
  ok(Mc < Mw && Mw < H4, "(…and Mc has the lower id, so its link sorts first among equals)");
  ok(w.hubs.join() === [H3, H4].join() && w.rails.length === 1, "two hubs, one railway between them", { hubs: w.hubs, rails: w.rails });
  ok(sameWay(w.rails[0], [H3, Mw, H4]), "⭐⭐ it runs H3 – Mw – H4, over the wide borders", w.rails);
  ok(!runsOver(w.rails, Mc, H4), "⭐⭐ …and not over the narrow border between Mc and H4", w.rails);

  // ⛔ #a-thin-border-costs-a-step: this control was a ONE-pixel corner, and a corner now costs a step more — two steps and one
  // corner is three, the same as the wide way, and the wide way wins the tie. That a thin border still wins against a way TWO
  // provinces longer is pinned in test-a-thin-border-costs-a-railway-a-step.js; here the narrow border is 3 px, which costs no more.
  const f = linkWorld("link-far", true);
  ok(f.width(f.Mc, f.H4) === 3 && f.width(f.Mw, f.H4) === 0 && f.width(f.Mw, f.Mw2) > 3 && f.width(f.Mw2, f.H4) > 3, "(the fixture, stretched: the wide way is now three steps, the narrow way still two)");
  ok(f.rails.length === 1 && sameWay(f.rails[0], [f.H3, f.Mc, f.H4]), "⭐⭐ CONTROL: the fewest provinces is still the first cost — the shorter way is laid, narrow border and all", f.rails);
}

//        x: 8      16   24   32   40   48
//   y 0   [      ][ P0 ][ P1 ][ P2 ][ P3 ][      ]      Ha's east column is sea beside P0 but for THREE pixels, (15,0..2)
//     8   [  Ha  ]        (sea)           [  Hb  ]
//    16   [  60  ][ Q0 ][ Q1 ][ Q2 ][ Q3 ][  69  ]      the Q way is 8 px wide all along
console.log("\n-- ⭐ (b) …wherever on the link the narrow border is: at the hub's own door, two steps from where the two walks meet --");
{
  const Ha = 60, P = [61, 62, 63, 64], Q = [65, 66, 67, 68], Hb = 69;
  const rects = { [Ha]: [8, 0, 16, 24], [Hb]: [48, 0, 56, 24] }, pixels = {};
  P.forEach((id, i) => { rects[id] = [16 + 8 * i, 0, 24 + 8 * i, 8]; });
  Q.forEach((id, i) => { rects[id] = [16 + 8 * i, 16, 24 + 8 * i, 24]; });
  for (let y = 3; y <= 7; y++) pixels[`15,${y}`] = SEA;
  const w = world("link-door", { W: 64, H: 24, rects, pixels, states: { 7: [Ha, P[0], P[1], Q[0], Q[1]], 8: [P[2], P[3], Q[2], Q[3], Hb] }, vp: { 7: Ha, 8: Hb } });
  ok(w.width(Ha, P[0]) === 3 && w.width(P[1], P[2]) === 8 && w.width(Ha, Q[0]) === 8 && w.width(Q[1], Q[2]) === 8 && P.every((p) => Q.every((q) => w.width(p, q) === 0)),
    "(the fixture: two ways of five steps that never touch; the walks meet over 8 px on both, and only the P way has a 3 px border — between the hub and P0)", { HaP0: w.width(Ha, P[0]), P1P2: w.width(P[1], P[2]) });
  ok(Math.max(...P) < Math.min(...Q), "(…and the P way has the lower ids, so its link sorts first among equals)");
  ok(w.hubs.join() === [Ha, Hb].join() && w.rails.length === 1 && sameWay(w.rails[0], [Ha, ...Q, Hb]), "⭐⭐ the railway takes the Q way", w.rails);
  ok(!runsOver(w.rails, Ha, P[0]), "⭐⭐ …and not the hub's narrow border", w.rails);
}

// ── (c) an adjacencies.csv row is a rail edge only through a sea ───────────────────────────────────────────────────────
//        x: 8      16      24     32
//   y 0   [ H5 30][ T 31 ][ H6 32]    a row joins H5 and H6, which do not touch
console.log("\n-- ⭐ (c) two provinces joined only by an adjacencies.csv row are a rail edge only when the row goes through a sea --");
{
  const H5 = 30, T = 31, H6 = 32;
  const base = { W: 40, H: 8, rects: { [H5]: [8, 0, 16, 8], [T]: [16, 0, 24, 8], [H6]: [24, 0, 32, 8] } };
  const land = { ...base, states: { 5: [H5, T], 6: [H6] }, vp: { 5: H5, 6: H6 } };
  // what a strait is once the sea under it has been raised, before and after the retype: `sea` through a province that is land…
  const raised = world("strait-through-land", { ...land, rows: [`${H5};${H6};sea;${T};-1;-1;-1;-1;;Strait`, `${H5};${T};;-1;-1;-1;-1;-1;;a row between two provinces that touch`] });
  ok(raised.width(H5, H6) === 0 && raised.width(H5, T) > 2 && raised.width(T, H6) > 2, "(the fixture: H5 and H6 do not touch; the land between them, T, touches both)", { H5H6: raised.width(H5, H6) });
  ok(raised.hubs.join() === [H5, H6].join() && raised.rails.length === 1 && sameWay(raised.rails[0], [H5, T, H6]), "⭐⭐ a row through a province that is LAND is not a rail edge: the railway goes over the land, H5 – T – H6", raised.rails);
  ok(!runsOver(raised.rails, H5, H6), "⭐⭐ …and no railway runs straight from H5 to H6", raised.rails);
  ok(runsOver(raised.rails, H5, T), "⭐ …while two provinces that touch stay a rail edge, whatever row names them", raised.rails);
  ok(graphOf(raised).px.get(pairKey(H5, T)) === raised.width(H5, T), "⭐ …their border still counted in pixels: a row adds nothing to it", graphOf(raised).px.get(pairKey(H5, T)));
  // …and the row TEST 31 holds: no type, through nothing
  const retyped = world("strait-retyped", { ...land, rows: [`${H5};${H6};;-1;-1;-1;-1;-1;;Strait`] });
  ok(retyped.rails.length === 1 && sameWay(retyped.rails[0], [H5, T, H6]) && !runsOver(retyped.rails, H5, H6), "⭐⭐ nor is a row that goes through nothing (`;;-1`, the shape the retype leaves)", retyped.rails);
  const { adj, px } = graphOf(retyped);
  ok(adj.get(H5).has(H6) && px.get(pairKey(H5, H6)) === 0, "⭐ the graph still links the pair — a region is judged by every row — with a border of 0 pixels", px.has(pairKey(H5, H6)) ? px.get(pairKey(H5, H6)) : "no count");
  // CONTROL: the same row over a province that IS sea — a real strait
  const strait = world("strait", { ...base, sea: [T], states: { 5: [H5], 6: [H6] }, vp: { 5: H5, 6: H6 }, rows: [`${H5};${H6};sea;${T};-1;-1;-1;-1;;Strait`] });
  ok(strait.hubs.join() === [H5, H6].join() && strait.rails.length === 1 && sameWay(strait.rails[0], [H5, H6]), "⭐⭐ CONTROL: through a province that is sea it is a strait, and the railway crosses it — as five of vanilla's do", strait.rails);
  const none = world("no-row", { ...base, sea: [T], states: { 5: [H5], 6: [H6] }, vp: { 5: H5, 6: H6 } });
  ok(none.hubs.join() === [H5, H6].join() && none.rails.length === 0, "…CONTROL: and with no row at all the two are not joined, so it is the row that carries it", none.rails);
}

// ── (c) …and water is a sea or a lake, whether the row names it or the bitmap shows it ─────────────────────────────────
//        x: 8      16      24     32
//   y 0   [ H5 30][ T 31 ][ H6 32]    T is water here: H5 and H6 are the two banks, and nothing else joins them
//     8   [ U 33 ]
// ⛔ #a-strait-costs-more-than-a-border — this section's banks were joined the long way too, by U round the head of the water, and
// each row was pinned by the railway crossing it "though there is a way round by land". A crossing is taken now only where no dry
// way joins its shores, so the banks are two pieces of land here, and what each row IS — water, not a portal over land — is read
// off the plan too (`railStraits.rows`, the crossings it found over water); with U round the head, the land way (the last check).
console.log("\n-- ⭐ (c) a row over WATER is a crossing in every shape a shipping map writes it --");
{
  const H5 = 30, T = 31, H6 = 32, U = 33;
  const banks = { W: 40, H: 16, rects: { [H5]: [8, 0, 16, 8], [T]: [16, 0, 24, 8], [H6]: [24, 0, 32, 8], [U]: [8, 8, 16, 16] }, states: { 5: [H5, U], 6: [H6] }, vp: { 5: H5, 6: H6 } };
  const crossed = (w) => w.hubs.join() === [H5, H6].join() && w.rails.length === 1 && sameWay(w.rails[0], [H5, H6]) && !!w.plan.railStraits && w.plan.railStraits.rows === 1;
  const lake = world("lake-named", { ...banks, lake: [T], rows: [`${H5};${H6};sea;${T};-1;-1;-1;-1;;Lake crossing`] });
  ok(lake.width(H5, H6) === 0 && lake.width(H5, U) > 2 && lake.width(U, H6) === 0, "(the fixture: the banks do not touch, and nothing joins them by land — U touches H5 alone)", { H5H6: lake.width(H5, H6), UH6: lake.width(U, H6) });
  const dry = world("banks-no-row", { ...banks, sea: [T] });
  ok(dry.hubs.join() === [H5, H6].join() && dry.rails.length === 0, "…CONTROL: with no row, the two banks are not joined", dry.rails);
  ok(crossed(lake), "⭐⭐ through a province that is a LAKE (Millennium Dawn's 11 rows, Novum Vexillum's 2, Old World Blues' 1)", { rails: lake.rails, railStraits: lake.plan.railStraits });
  const river = world("river-typed", { ...banks, sea: [T], rows: [`${H5};${H6};large_river;-1;-1;-1;-1;-1;;River`] });
  ok(crossed(river), "⭐⭐ `large_river` through nothing, with only sea between the banks (Hearts of Minecraft's 54 rows)", { rails: river.rails, railStraits: river.plan.railStraits });
  const ford = world("river-untyped", { ...banks, sea: [T], rows: [`${H5};${H6};;-1;-1;-1;-1;-1;;River`] });
  ok(crossed(ford), "⭐⭐ no type and through nothing, with only sea between (its other 16) — the row the retype writes, told apart by what lies under it", { rails: ford.rails, railStraits: ford.plan.railStraits });
  const pond = world("lake-unnamed", { ...banks, lake: [T], rows: [`${H5};${H6};;-1;-1;-1;-1;-1;;River`] });
  ok(crossed(pond), "⭐ …or only lake between", { rails: pond.rails, railStraits: pond.plan.railStraits });
  const round = world("lake-and-land-round", { ...banks, rects: { ...banks.rects, [U]: [8, 8, 32, 16] }, lake: [T], rows: [`${H5};${H6};sea;${T};-1;-1;-1;-1;;Lake crossing`] });
  ok(round.width(H5, U) > 2 && round.width(U, H6) > 2 && round.rails.length === 1 && sameWay(round.rails[0], [H5, U, H6]) && round.plan.railStraits.rows === 1,
    "⭐ …and with U round the head of the water, the row is still a crossing, but the railway takes the land (#a-strait-costs-more-than-a-border)", { rails: round.rails, railStraits: round.plan.railStraits });
}

//        x: 8      16      24     32                x: 8      16   20   24     32               x: 8      16      24
//   y 0   [ H5 30][ T 31 ][ H6 32]              y 0   [ H5 30][ T ] sea [ H6 32]            y 0   [ H5 30][ Cq 35]
//     8           [ S 33 ]   S is sea             8           [    Bq 34      ]               8           [ H6 32]
console.log("\n-- ⭐ (c) …a row that names what it goes through is believed, and one that names nothing must have water, and only water, under it --");
{
  const H5 = 30, T = 31, H6 = 32, S = 33, Bq = 34, Cq = 35;
  // a strait by its own row, though the bitmap puts land on the line between the two: 5 of vanilla's 146 straits touch at a
  // corner or have land there, and one of Old World Blues' own railways runs over such a row
  // ⛔ #a-strait-costs-more-than-a-border — T touched H6 too until a crossing was taken only where no dry way joins its shores; it
  // stops a pixel short of H6 now, so land and then a pixel of sea lie between the two and nothing joins them by land
  const named = world("sea-named-land-between", { W: 40, H: 16, sea: [S], rects: { [H5]: [8, 0, 16, 8], [T]: [16, 0, 23, 8], [H6]: [24, 0, 32, 8], [S]: [16, 8, 24, 16] },
    states: { 5: [H5, T], 6: [H6] }, vp: { 5: H5, 6: H6 }, rows: [`${H5};${H6};sea;${S};-1;-1;-1;-1;;Strait`] });
  ok(named.width(H5, H6) === 0 && named.width(H5, S) === 0 && named.width(H6, S) === 0 && named.width(H5, T) > 2 && named.width(T, H6) === 0,
    "(the fixture: land T lies between H5 and H6 and touches H5; the row goes through S, a sea that touches neither)", { H5S: named.width(H5, S), H6S: named.width(H6, S), TH6: named.width(T, H6) });
  ok(named.rails.length === 1 && sameWay(named.rails[0], [H5, H6]) && named.plan.railStraits.rows === 1, "⭐⭐ a row through a province that is sea is a strait, whatever the bitmap shows between the two", { rails: named.rails, railStraits: named.plan.railStraits });
  // land AND water on the line between them, and a way round over land
  const mixed = world("land-and-water-between", { W: 40, H: 16, rects: { [H5]: [8, 0, 16, 8], [T]: [16, 0, 20, 8], [H6]: [24, 0, 32, 8], [Bq]: [16, 8, 32, 16] },
    states: { 5: [H5, T], 6: [Bq, H6] }, vp: { 5: H5, 6: H6 }, rows: [`${H5};${H6};;-1;-1;-1;-1;-1;;Strait`] });
  ok(mixed.width(H5, T) > 2 && mixed.width(T, H6) === 0 && mixed.width(T, SEA) > 0 && mixed.width(H6, SEA) > 0 && mixed.width(T, Bq) > 2 && mixed.width(Bq, H6) > 2 && mixed.width(H5, Bq) === 0,
    "(the fixture: between H5 and H6 lie T, which is land, and then sea; the way round is H5 – T – Bq – H6)", { TH6: mixed.width(T, H6), H5Bq: mixed.width(H5, Bq) });
  ok(mixed.rails.length === 1 && sameWay(mixed.rails[0], [H5, T, Bq, H6]) && !runsOver(mixed.rails, H5, H6), "⭐⭐ land and water between is not a crossing: the railway goes round", mixed.rails);
  // nothing between: the two touch at a corner, which is no border to cross
  const corner = world("corner", { W: 40, H: 16, rects: { [H5]: [8, 0, 16, 8], [Cq]: [16, 0, 24, 8], [H6]: [16, 8, 24, 16] },
    states: { 5: [H5, Cq], 6: [H6] }, vp: { 5: H5, 6: H6 }, rows: [`${H5};${H6};;-1;-1;-1;-1;-1;;Strait`] });
  ok(corner.width(H5, H6) === 0 && corner.width(H5, Cq) > 2 && corner.width(Cq, H6) > 2, "(the fixture: H5 and H6 meet at one corner and share no pixel edge; Cq touches both)", { H5H6: corner.width(H5, H6) });
  ok(corner.rails.length === 1 && sameWay(corner.rails[0], [H5, Cq, H6]) && !runsOver(corner.rails, H5, H6), "⭐⭐ nor is nothing at all between — two provinces that meet at a corner: the railway goes round", corner.rails);
}

//        x: 8      16   20      28   32     40
//   y 0   [ H5 30] sea [ K 31 ] sea [ H6 32]      three islands; a row joins H5 and H6 over K
console.log("\n-- ⭐ (c) …and a row over dry land is an edge where nothing else joins the two pieces of land: a portal --");
{
  const H5 = 30, K = 31, H6 = 32;
  const isles = { W: 48, H: 8, rects: { [H5]: [8, 0, 16, 8], [K]: [20, 0, 28, 8], [H6]: [32, 0, 40, 8] }, states: { 5: [H5, K], 6: [H6] }, vp: { 5: H5, 6: H6 } };
  const portal = world("portal", { ...isles, rows: [`${H5};${H6};;-1;-1;-1;-1;-1;;Portal`] });
  ok(portal.width(H5, K) === 0 && portal.width(K, H6) === 0 && portal.width(H5, H6) === 0, "(the fixture: land lies between H5 and H6 — the island K — and touches neither)", { H5K: portal.width(H5, K), KH6: portal.width(K, H6) });
  ok(portal.hubs.join() === [H5, H6].join() && portal.rails.length === 1 && sameWay(portal.rails[0], [H5, H6]),
    "⭐⭐ the row is the only thing joining them, so the railway runs over it (Hearts of Minecraft's 12 rows between its worlds, every one under its own rail)", portal.rails);
  const alone = world("portal-no-row", isles);
  ok(alone.hubs.join() === [H5, H6].join() && alone.rails.length === 0, "…CONTROL: with no row the two are not joined", alone.rails);
  // …and the same row with the same land between, where that land joins them: the dried-up strait of the section above
  const dried = world("portal-dried", { ...isles, rects: { ...isles.rects, [K]: [16, 0, 32, 8] }, rows: [`${H5};${H6};;-1;-1;-1;-1;-1;;Strait`] });
  ok(dried.width(H5, K) > 2 && dried.width(K, H6) > 2 && dried.rails.length === 1 && sameWay(dried.rails[0], [H5, K, H6]) && !runsOver(dried.rails, H5, H6),
    "⭐⭐ CONTROL: the very same row is no edge once the land between touches both — there is a way round, and the railway takes it", dried.rails);
  // …nor where the three islands are already joined by straits: a crossing over water is a way round too
  const ferried = world("portal-ferried", { ...isles, rows: [`${H5};${H6};;-1;-1;-1;-1;-1;;Portal`, `${H5};${K};sea;${SEA};-1;-1;-1;-1;;Strait`, `${K};${H6};sea;${SEA};-1;-1;-1;-1;;Strait`] });
  ok(ferried.rails.length === 1 && sameWay(ferried.rails[0], [H5, K, H6]) && !runsOver(ferried.rails, H5, H6), "⭐⭐ CONTROL: …or once straits join the islands: the railway crosses the two straits, not the land between", ferried.rails);
}

// ── (c) at the search's own step ───────────────────────────────────────────────────────────────────────────────────────
// Every fixture above puts the pair a row joins exactly where two hubs' land meets. The rule is asked in a second place — where
// the search steps from province to province — and there a pair that is no edge would be walked straight over, in the MIDDLE of
// one hub's walk, with the link itself (B – C below) a perfectly good border.
//        x: 8      16     24     32     40     48     56     64
//   y 0   [ H5 30][ A 31][ G 32][ B 33][ C 34][ D 35][ H6 36]      a row joins A and B over G
console.log("\n-- ⭐ (c) …where the search steps, too: a pair that is no edge is not walked over two steps from the hub --");
{
  const H5 = 30, A = 31, G = 32, B = 33, C = 34, D = 35, H6 = 36;
  const line = { W: 72, H: 8, rects: { [H5]: [8, 0, 16, 8], [A]: [16, 0, 24, 8], [G]: [24, 0, 32, 8], [B]: [32, 0, 40, 8], [C]: [40, 0, 48, 8], [D]: [48, 0, 56, 8], [H6]: [56, 0, 64, 8] } };
  const land = { ...line, states: { 5: [H5, A, G], 6: [B, C, D, H6] }, vp: { 5: H5, 6: H6 } };
  const round = [H5, A, G, B, C, D, H6];
  const dried = world("mid-walk-dried", { ...land, rows: [`${A};${B};;-1;-1;-1;-1;-1;;Strait`] });
  ok(dried.width(A, B) === 0 && dried.width(A, G) > 2 && dried.width(G, B) > 2 && dried.width(B, C) > 2, "(the fixture: A and B do not touch; G, which is land, lies between them and touches both)", { AB: dried.width(A, B) });
  ok(dried.hubs.join() === [H5, H6].join() && dried.rails.length === 1 && sameWay(dried.rails[0], round) && !runsOver(dried.rails, A, B),
    "⭐⭐ a row through nothing over land: the railway runs A – G – B, not straight from A to B", dried.rails);
  const raised = world("mid-walk-through-land", { ...land, rows: [`${A};${B};sea;${G};-1;-1;-1;-1;;Strait`] });
  ok(raised.rails.length === 1 && sameWay(raised.rails[0], round) && !runsOver(raised.rails, A, B), "⭐⭐ a row through a province that is land: the same", raised.rails);
  const strait = world("mid-walk-strait", { ...line, sea: [G], states: { 5: [H5, A], 6: [B, C, D, H6] }, vp: { 5: H5, 6: H6 }, rows: [`${A};${B};sea;${G};-1;-1;-1;-1;;Strait`] });
  ok(strait.rails.length === 1 && sameWay(strait.rails[0], [H5, A, B, C, D, H6]), "…CONTROL: with G a sea the same row is a strait, and the railway crosses it", strait.rails);
}

//        x: 8      16     24     32     40     48     56
//   y 0   [ H5 40][ A 41][ B 42][ C 43][ D 44][ H6 45]      A and B touch, over 8 px — and an `impassable` row closes that border
//     8           [T1 46][T2 47]                            the way round: A – T1 – T2 – B
console.log("\n-- ⭐ …and the older rule with it: the search does not step over an `impassable` border either --");
{
  const H5 = 40, A = 41, B = 42, C = 43, D = 44, H6 = 45, T1 = 46, T2 = 47;
  const w = world("mid-walk-impassable", { W: 64, H: 16,
    rects: { [H5]: [8, 0, 16, 8], [A]: [16, 0, 24, 8], [B]: [24, 0, 32, 8], [C]: [32, 0, 40, 8], [D]: [40, 0, 48, 8], [H6]: [48, 0, 56, 8], [T1]: [16, 8, 24, 16], [T2]: [24, 8, 32, 16] },
    states: { 5: [H5, A, T1, T2], 6: [B, C, D, H6] }, vp: { 5: H5, 6: H6 }, rows: [`${A};${B};impassable;-1;-1;-1;-1;-1;;Wall`] });
  ok(w.width(A, B) > 2 && w.width(A, T1) > 2 && w.width(T1, T2) > 2 && w.width(T2, B) > 2 && w.width(H5, T1) === 0 && w.width(T2, C) === 0,
    "(the fixture: A and B share a border the row closes; T1 and T2 are the only other way from one to the other)", { AB: w.width(A, B), H5T1: w.width(H5, T1), T2C: w.width(T2, C) });
  ok(w.hubs.join() === [H5, H6].join() && w.rails.length === 1 && sameWay(w.rails[0], [H5, A, T1, T2, B, C, D, H6]) && !runsOver(w.rails, A, B),
    "⭐⭐ the railway goes round by T1 and T2, two provinces longer, and not over the impassable border in the middle of its walk", w.rails);
}

try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) { /* scratch only */ }
console.log("\n" + (fail ? "FAILED " + fail + "/" + (pass + fail) : "PASSED " + pass + "/" + pass));
process.exitCode = fail ? 1 : 0;
