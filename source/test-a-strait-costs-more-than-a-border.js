// ⛔ #a-strait-costs-more-than-a-border — A GENERATED RAILWAY TAKES A STRAIT ONLY WHERE NO DRY WAY JOINS ITS SHORES, PAYS TWO STEPS
// AND ITS WATER FOR ONE, AND NO TOP-UP HUB STANDS ON AN ISLET.
//
// The owner played TEST 37 (10-21): "some places did not have a full correct train track look". Where the game has no border to
// cross it draws the 3D track straight from station to station, over the water. The rail search priced a strait like a border, so
// it hopped over water wherever that was a province shorter, and the hub top-up (chooseSupplyHubs step 3, the province farthest
// from every hub over the land links, straits too) put hubs on the ends of islet chains, which the rail then reached over more
// water. TEST 37's own states re-planned (scratchpad cityrail/builder/replan.js on a copy of the t37a rehearsal): 18 rail pairs over
// a strait (the base game 5), 4 of them with a dry way round, 12 rail provinces on pieces of land under 200 px (the base game 1),
// 5 of the 286 top-up hubs on one-province islets, every one of them railed over water.
//
// The rule, pinned on small worlds of rectangles over the sea, every border and gap counted from the fixture's own pixels:
//   1. a strait whose two shores the owner's own land joins over passable borders is no rail edge: the land way round, however long;
//   2. CONTROL: a strait that is the only way is taken;
//   3. ⭐ the owner pass asks the OWNER's land: where the only dry way runs through another country, the strait carries the
//      country's own rail (#a-country-reaches-its-hubs-by-its-own-rail) — and the pass across borders does not take it;
//   4. a strait costs two steps more than a border: a way over one strait and two provinces beats a way over two straits by an islet;
//   5. …and its water: a short crossing three provinces on beats a wide one next door;
//   6. ⭐ the hub top-up never stands a hub on an islet (a province no passable border joins to other land) — in the chooser and in
//      the plan Generate land runs;
//   7. the plan says what it found: `railStraits` { rows over water, with a dry way round, with the owner's own dry way round }.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-strait-price-"));
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
const strait = (a, b) => `${a};${b};sea;${SEA};-1;-1;-1;-1;;Strait`;

/**
 * A world of rectangles over the sea (province 1): `rects` { id: [[x0, y0, x1, y1), …] }. `states` { id: { provs, vp, owner } }
 * (owner AAA when not given), `rows` adjacencies.csv rows. The supply plan is a dry run over no layer below.
 */
function world(tag, { W, H, rects, states, rows = [] }) {
  const provAt = (x, y) => {
    for (const [id, rs] of Object.entries(rects)) for (const [x0, y0, x1, y1] of rs) if (x >= x0 && x < x1 && y >= y0 && y < y1) return +id;
    return SEA;
  };
  // the fixture's own counts: the pixel edges each pair shares (four-neighbour, the map wrapping east to west) and each province's pixels
  const border = new Map(), px = new Map();
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const p = provAt(x, y), e = provAt((x + 1) % W, y);
    px.set(p, (px.get(p) || 0) + 1);
    if (p !== e) border.set(pairKey(p, e), (border.get(pairKey(p, e)) || 0) + 1);
    if (y + 1 < H) { const s = provAt(x, y + 1); if (p !== s) border.set(pairKey(p, s), (border.get(pairKey(p, s)) || 0) + 1); }
  }
  // …and the water between two provinces: the pixels between their nearest pixels, less one
  const gap = (a, b) => {
    let best = Infinity;
    const A = [], B = [];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const p = provAt(x, y); if (p === a) A.push([x, y]); else if (p === b) B.push([x, y]); }
    for (const [ax, ay] of A) for (const [bx, by] of B) best = Math.min(best, (ax - bx) ** 2 + (ay - by) ** 2);
    return Math.sqrt(best) - 1;
  };
  const mod = path.join(ROOT, tag);
  write(mod, "descriptor.mod", `name="${tag}"\nreplace_path="history/states"\n`);
  write(mod, "map/provinces.bmp", bmp24(W, H, (x, y) => colour(provAt(x, y))));
  const ids = [SEA].concat(Object.keys(rects).map(Number));
  write(mod, "map/definition.csv", ["0;0;0;0;land;false;unknown;0"].concat(ids.map((id) => `${id};${colour(id).join(";")};${id === SEA ? "sea;false;ocean;0" : "land;false;plains;1"}`)).join("\n") + "\n");
  for (const [s, { provs, vp, owner = "AAA" }] of Object.entries(states)) {
    write(mod, `history/states/${s}-S.txt`, `state={\n\tid=${s}\n\tname="STATE_${s}"\n\tmanpower=1000\n\tstate_category=rural\n\tprovinces={ ${provs.join(" ")} }\n\thistory={\n\t\towner=${owner}\n\t\tvictory_points = { ${vp} 5 }\n\t}\n}\n`);
  }
  write(mod, "map/adjacencies.csv", ["From;To;Type;Through;start_x;start_y;stop_x;stop_y;adjacency_rule_name;Comment"].concat(rows, ["-1;-1;-1;-1;-1;-1;-1;-1;-1"]).join("\n") + "\n");
  write(mod, "map/supply_nodes.txt", "");
  write(mod, "map/railways.txt", "");
  const roots = { modRoot: mod, gameRoot: path.join(ROOT, "no-game"), dependencyRoots: [] };
  const plan = md.generateSupplyNetwork({ ...roots, dryRun: true }) || {};
  return { plan, px, gap, width: (a, b) => border.get(pairKey(a, b)) || 0, hubs: (plan.newHubs || []).map((h) => h.province).sort((a, b) => a - b),
    rails: (plan.railRows || []).map((r) => r.provinces) };
}

// ── 1. a bay: the shores face each other over one pixel of water, and the owner's land runs round its head ─────────────────
//        x: 0       8  11 12     16       24
//   y 0   [ H5         ]~[ H6          ]      H5 and H6 meet nowhere; a strait row joins them over column 11, one pixel of sea
//     8   [ H5 ]  ~ bay ~  [ H6 ]
//    16   [ P1   ][ P2   ][ P3   ]            the land way round: H5 – P1 – P2 – P3 – H6, three provinces longer
const BAY = { W: 32, H: 24, rects: { 10: [[0, 0, 8, 16], [8, 0, 11, 8]], 11: [[16, 0, 24, 16], [12, 0, 16, 8]], 12: [[0, 16, 8, 24]], 13: [[8, 16, 16, 24]], 14: [[16, 16, 24, 24]] } };
const [H5, H6, P1, P2, P3] = [10, 11, 12, 13, 14];
console.log("\n-- ⭐ 1. a strait whose shores the owner's own land joins is no rail edge: the land way round, however long --");
{
  const w = world("bay", { ...BAY, states: { 5: { provs: [H5, P1, P2], vp: H5 }, 6: { provs: [H6, P3], vp: H6 } }, rows: [strait(H5, H6)] });
  ok(w.width(H5, H6) === 0 && w.gap(H5, H6) === 1 && w.width(H5, P1) === 8 && w.width(P1, P2) === 8 && w.width(P2, P3) === 8 && w.width(P3, H6) === 8,
    "(the fixture: H5 and H6 share no pixel and one pixel of sea lies between them; H5 – P1 – P2 – P3 – H6 crosses four borders of 8 px)", { gap: w.gap(H5, H6) });
  ok(w.hubs.join() === [H5, H6].join() && w.rails.length === 1, "two hubs, one railway", { hubs: w.hubs, rails: w.rails });
  ok(sameWay(w.rails[0], [H5, P1, P2, P3, H6]), "⭐⭐ the railway runs round the bay by land, three provinces longer", w.rails);
  ok(!runsOver(w.rails, H5, H6), "⭐⭐ …and not over the one pixel of water", w.rails);
  const rs = w.plan.railStraits || {};
  ok(rs.rows === 1 && rs.dryWayRound === 1 && rs.ownDryWayRound === 1, "⭐ 7. the plan says it: one strait over water, its shores joined by land, the owner's own", rs);
}

// ── 2. CONTROL: the same strait with no land round the bay ────────────────────────────────────────────────────────────────
console.log("\n-- ⭐ 2. CONTROL: where the strait is the only way, the railway crosses it --");
{
  const rects = { ...BAY.rects }; delete rects[P3];
  const w = world("bay-open", { ...BAY, rects, states: { 5: { provs: [H5, P1, P2], vp: H5 }, 6: { provs: [H6], vp: H6 } }, rows: [strait(H5, H6)] });
  ok(w.width(P2, H6) === 0 && w.width(H6, P1) === 0, "(the fixture: without P3 nothing joins H6 to the rest by land)");
  ok(w.rails.length === 1 && sameWay(w.rails[0], [H5, H6]), "⭐⭐ the railway crosses the strait", w.rails);
  const rs = w.plan.railStraits || {};
  ok(rs.rows === 1 && rs.dryWayRound === 0 && rs.ownDryWayRound === 0, "…and the plan says there was no dry way round", rs);
}

// ── 3. the land round the bay is another country's ──────────────────────────────────────────────────────────────────────
console.log("\n-- ⭐ 3. the owner pass asks the OWNER's land: round the bay through another country, the strait carries the country's own rail --");
{
  const w = world("bay-foreign", { ...BAY, states: { 5: { provs: [H5], vp: H5 }, 6: { provs: [H6], vp: H6 }, 7: { provs: [P1, P2, P3], vp: P2, owner: "BBB" } }, rows: [strait(H5, H6)] });
  ok(w.hubs.join() === [H5, H6, P2].join(), "(the fixture: AAA's hubs H5 and H6, BBB's P2 on the land round the bay)", w.hubs);
  ok(w.rails.some((r) => sameWay(r, [H5, H6])), "⭐⭐ AAA's two hubs are joined over the strait, by AAA's own rail", w.rails);
  ok(w.rails.length === 2 && w.rails.some((r) => r.includes(P2)) && !w.rails.some((r) => r.includes(P2) && runsOver([r], H5, H6)),
    "⭐ …and BBB's hub joins them by land, in the pass across borders, which does not take the strait", w.rails);
  const rs = w.plan.railStraits || {};
  ok(rs.rows === 1 && rs.dryWayRound === 1 && rs.ownDryWayRound === 0, "…and the plan says the dry way round was not the owner's", rs);
}

// ── 4. two steps: over one strait and two provinces, or over two straits by an islet ────────────────────────────────────────
//        x: 0     8       16      24
//   y 0   [ H  ][ M1   ][ M2   ]           H and the islet Y, Y and HI, M2 and HI: each a strait over one pixel of sea
//     9   [ Y  ]                [ HI ]
//    17   [ HI                       ]     HI: the island's hub, an L round to under M2
console.log("\n-- ⭐ 4. a strait costs two steps more than a border: one strait and two provinces beat two straits by an islet --");
{
  const H = 20, M1 = 21, M2 = 22, Y = 23, HI = 24;
  const w = world("islet-hop", { W: 32, H: 24, rects: { [H]: [[0, 0, 8, 8]], [M1]: [[8, 0, 16, 8]], [M2]: [[16, 0, 24, 8]], [Y]: [[0, 9, 8, 16]], [HI]: [[16, 9, 24, 17], [0, 17, 24, 24]] },
    states: { 1: { provs: [H, M1, M2], vp: H }, 2: { provs: [HI, Y], vp: HI } }, rows: [strait(H, Y), strait(Y, HI), strait(M2, HI)] });
  ok([[H, Y], [Y, HI], [M2, HI]].every(([a, b]) => w.width(a, b) === 0 && w.gap(a, b) === 1) && w.width(H, M1) === 8 && w.width(M1, M2) === 8,
    "(the fixture: three straits of one pixel each; H – Y – HI crosses two, H – M1 – M2 – HI one and two borders of 8 px)", [[H, Y], [Y, HI], [M2, HI]].map(([a, b]) => w.gap(a, b)));
  ok(w.hubs.join() === [H, HI].join() && w.rails.length === 1, "two hubs, one railway", { hubs: w.hubs, rails: w.rails });
  ok(sameWay(w.rails[0], [H, M1, M2, HI]), "⭐⭐ H – M1 – M2 – HI: one strait, one province longer than the way by the islet", w.rails);
  ok(!w.rails.some((r) => r.includes(Y)), "⭐⭐ …and no rail on the islet Y", w.rails);
}

// ── 5. its water: a wide crossing next door, or a short one three provinces on ───────────────────────────────────────────────
//        x: 0       16      32      48      64 65    80
//   y 0   [ H     ][ M1    ][ M2    ][ M3    ]~[ HI ]      M1 – HI: a strait over 33 px of sea; M3 – HI: over one
console.log("\n-- ⭐ 5. …and its water: a short crossing three provinces on beats a wide one next door --");
{
  const H = 30, M1 = 31, M2 = 32, M3 = 33, HI = 34;
  const w = world("two-straits", { W: 80, H: 8, rects: { [H]: [[0, 0, 16, 8]], [M1]: [[16, 0, 32, 8]], [M2]: [[32, 0, 48, 8]], [M3]: [[48, 0, 64, 8]], [HI]: [[65, 0, 73, 8]] },
    states: { 1: { provs: [H, M1, M2, M3], vp: H }, 2: { provs: [HI], vp: HI } }, rows: [strait(M1, HI), strait(M3, HI)] });
  const wide = w.gap(M1, HI), short = w.gap(M3, HI);
  // the water in provinces is px over the side of the map's median land province (no rail below to ask): the fixture's own
  const land = [...w.px].filter(([id]) => id !== SEA).map(([, n]) => n).sort((a, b) => a - b), side = Math.sqrt(land[(land.length - 1) >> 1]);
  const U = md.RAIL_STEP_UNITS, viaM1 = U + (U + 2 * U + Math.round(U * wide / side)), viaM3 = 3 * U + (U + 2 * U + Math.round(U * short / side));
  ok(wide === 33 && short === 1 && w.width(M1, HI) === 0 && w.width(M3, HI) === 0 && w.width(M2, HI) === 0, "(the fixture: M1 – HI over 33 px of sea, M3 – HI over 1; M2 touches HI nowhere)", { wide, short });
  ok(viaM3 < viaM1, `(the price, from the fixture: by M3 ${viaM3}, by M1 ${viaM1}; counting provinces, by M1 is 2 and by M3 4)`, { viaM1, viaM3, side });
  ok(w.rails.length === 1 && sameWay(w.rails[0], [H, M1, M2, M3, HI]), "⭐⭐ the railway runs on to M3 and crosses the one pixel of sea", w.rails);
  ok(!runsOver(w.rails, M1, HI), "⭐⭐ …not the 33 px next door", w.rails);
}

// ── 6. the hub top-up and the islet ──────────────────────────────────────────────────────────────────────────────────────
console.log("\n-- ⭐ 6. the hub top-up never stands a hub on an islet: the chooser --");
{
  // a strip 1 – 2 – … – 6 and an islet 7 off its end, joined only by a strait: the land links walk it, and it is the farthest
  const graph = new Map([[1, new Set([2])], [2, new Set([1, 3])], [3, new Set([2, 4])], [4, new Set([3, 5])], [5, new Set([4, 6])], [6, new Set([5, 7])], [7, new Set([6])]]);
  const states = [{ id: 1, category: "rural", owner: "XXX", provinces: [1, 2, 3, 4, 5, 6, 7], urban: false, vpValue: 0 }];
  const ask = (isletOf) => md.chooseSupplyHubs({ states, rateOf: () => 0, capitalStateIds: [1], graph, landProvincesPerHub: 3.5, hubProvinceOf: () => 1, ...(isletOf ? { isletOf } : {}) });
  const before = ask(null), after = ask((p) => p === 7);
  ok(before.hubs.map((h) => h.province).join() === "1,7", "(the fixture: 7 provinces at 3.5 a hub ask for two; asked no islet, the top-up takes the islet, the farthest)", before.hubs);
  ok(after.hubs.map((h) => h.province).join() === "1,6" && after.density.topUp === 1, "⭐⭐ told 7 is an islet, it takes 6, the farthest province that is not", after);
}
console.log("\n-- ⭐ 6. …and in the plan Generate land runs, over a layer below that hubs its land --");
{
  // the layer below: four rural states of two provinces, the first two hubbed on both: 2 land provinces a hub, half the states hubbed
  const g = path.join(ROOT, "game-below");
  write(g, "hoi4.exe", "");
  const defRows = ["0;0;0;0;land;false;unknown;0"], hubRows = [];
  for (let k = 0; k < 4; k++) {
    const provs = [2 * k + 1, 2 * k + 2];
    for (const p of provs) defRows.push(`${p};${colour(p).join(";")};land;false;plains;1`);
    if (k < 2) for (const p of provs) hubRows.push(`1 ${p}`);
    write(g, `history/states/${k + 1}-S.txt`, `state={\n\tid=${k + 1}\n\tname="STATE_${k + 1}"\n\tmanpower=1000\n\tstate_category=rural\n\tprovinces={ ${provs.join(" ")} }\n\thistory={\n\t\towner=ZZZ\n\t}\n}\n`);
  }
  write(g, "map/definition.csv", defRows.join("\n") + "\n");
  write(g, "map/supply_nodes.txt", hubRows.join("\n") + "\n");
  // the mod: a strip of twelve 8 px cells, XXX's west half and YYY's east, and an islet two rows below its east end, joined to it by
  // a strait; every star on its state's first province
  const CELL = 8, COLS = 14, W = COLS * CELL, Hh = 5 * CELL, idAt = (c, r) => r * COLS + c + 1;
  const STRIP = [...Array(12)].map((_, k) => idAt(k + 1, 1)), ISLET = idAt(12, 3);
  const land = new Set(STRIP.concat([ISLET]));
  const m = path.join(ROOT, "mod-islet");
  write(m, "descriptor.mod", 'name="islet"\nreplace_path="history/states"\n');
  write(m, "map/provinces.bmp", bmp24(W, Hh, (x, y) => { const id = idAt(Math.floor(x / CELL), Math.floor(y / CELL)); return colour(land.has(id) ? id : SEA); }));
  const rows = ["0;0;0;0;land;false;unknown;0", `${SEA};${colour(SEA).join(";")};sea;false;ocean;0`];
  for (const id of [...land].sort((a, b) => a - b)) rows.push(`${id};${colour(id).join(";")};land;false;plains;1`);
  write(m, "map/definition.csv", rows.join("\n") + "\n");
  write(m, "map/adjacencies.csv", `From;To;Type;Through;start_x;start_y;stop_x;stop_y;adjacency_rule_name;Comment\n${strait(STRIP[11], ISLET)}\n-1;-1;-1;-1;-1;-1;-1;-1;-1\n`);
  write(m, "map/supply_nodes.txt", ""); write(m, "map/railways.txt", "");
  const ST = [{ id: 1, owner: "XXX", provinces: STRIP.slice(0, 6) }, { id: 2, owner: "YYY", provinces: STRIP.slice(6).concat([ISLET]) }];
  for (const s of ST) write(m, `history/states/${s.id}-S.txt`, `state={\n\tid=${s.id}\n\tname="STATE_${s.id}"\n\tmanpower=1000\n\tstate_category=rural\n\tprovinces={ ${s.provinces.join(" ")} }\n\thistory={\n\t\towner=${s.owner}\n\t\tvictory_points = { ${s.provinces[0]} 3 }\n\t}\n}\n`);
  write(m, "history/countries/XXX - XXX.txt", "capital = 1\n"); write(m, "history/countries/YYY - YYY.txt", "capital = 2\n");
  const plan = md.generateSupplyNetwork({ modRoot: m, gameRoot: g, dependencyRoots: [], stateIds: [1, 2], dryRun: true }) || {};
  const hubs = (plan.newHubs || []).map((h) => h.province);
  const target = Math.round(land.size / 2);
  ok(plan.density && plan.density.fromLayerBelow === true && hubs.length === target && plan.density.topUp === target - 2,
    `(the fixture: the layer below asks for round(${land.size} ÷ 2) = ${target} hubs, two of them the capitals and the rest the top-up)`, { hubs, density: plan.density });
  ok(!hubs.includes(ISLET), "⭐⭐ no hub on the islet, though the top-up walks the strait to it", hubs);
  ok(!(plan.railRows || []).some((r) => r.provinces.includes(ISLET)), "⭐ …and no railway over the water to it", (plan.railRows || []).map((r) => r.provinces));
}

try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) { /* scratch only */ }
console.log("\n" + (fail ? "FAILED " + fail + "/" + (pass + fail) : "PASSED " + pass + "/" + pass));
process.exitCode = fail ? 1 : 0;
