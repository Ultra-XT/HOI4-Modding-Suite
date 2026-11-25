// ⛔ #an-arrow-off-its-border-costs-a-step — A BORDER THE STATION-TO-STATION ARROW MISSES BY MORE THAN 5 PX COSTS A GENERATED
// RAILWAY ONE PROVINCE MORE, HOWEVER WIDE IT IS.
//
// The owner played TEST 31 (09-30): "some train tracks are not connected correctly within some cities, seem to not connect at all
// or overlap". The game draws one railway twice: a straight arrow from station to station (the Standstill, unitstacks.txt type 0),
// and the 3D track, which has to CROSS THE BORDER the two provinces share. Where two provinces meet round a third, the straight
// line runs over the third and the track leaves it, and the station. After the thin-border step
// (test-a-thin-border-costs-a-railway-a-step.js), 35 of TEST 31's rebuilt rail edges still missed their border by more than 5 px,
// 34 of them with the arrow over a third province (vanilla ships 6 of its 3,317). Counted one step more, with the clean way taken
// first where that ties it with a way one province longer, TEST 31 went to 7, and vanilla's, Millennium Dawn's, Old World Blues',
// Hearts of Minecraft's and Novum Vexillum's geometry rebuilt on their own hubs to 0, 2, 0, 1 and 0, for 0.1–1.1% more track and
// the same reach.
//
// The rule, pinned on small worlds of rectangles with the stations written into the fixture's own unitstacks.txt:
//   · two hubs whose border lies away from the line between their stations are joined round by the third province the line
//     crosses, whose borders the lines do cross — where their land meets, and inside one hub's walk;
//   · the missed border and the way round then cost the same, and the way round is taken even where it is the narrower;
//   · a miss of exactly 5 px costs nothing, 6 px costs the step — and it is the stations that decide: the same borders with the
//     stations moved so the line crosses the border, and the railway is straight again;
//   · no stations to measure (no unitstacks.txt), and nothing is asked;
//   · where the missed border is the only way, it is still taken;
//   · a Standstill still standing where the SEA below laid it out is not a station: the town point Auto-fix moves it to is;
//   · and the measurement itself (arrowMissesBorder) against the fixture's own border — side by side, and one above the other —
//     with each pixel edge taken at its middle, whichever of the four neighbours decides;
//   · the same world turned on its side goes round by T too.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-arrow-border-"));
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
const SEA = 1;
const sameWay = (row, want) => !!row && (row.join() === want.join() || row.slice().reverse().join() === want.join());

// ── the world ────────────────────────────────────────────────────────────────────────────────────────────────────────
//        x: 8      16      24      32      40
//   y 0   [ A, and its arm east over T    ][ X  ]      A: the column x 8..16 and the arm x 16..32, y 0..8
//     8   [ A    ][ T                     ][ X  ]      T: x 16..32, y 8..40      X: x 32..40, y 0..40
//    …    [ A    ][ T                     ][ X  ]      A and X meet only at the end of the arm — 8 px, x = 31|32, y 0..7
//    32   [ A    ][ T                     ][ X  ]
// A and X are the two hubs; T is A's. Stations: A's and X's where `st` says, T's at (24, 24). Rows run top-down; unitstacks.txt
// stores z bottom-up, z = H - 1 - row.
const W = 64, H = 40, A = 10, T = 11, X = 12;   // wide enough that A to X is less than half the map: no line here goes round the seam
const RECTS = { [A]: [[8, 0, 16, 40], [16, 0, 32, 8]], [T]: [[16, 8, 32, 40]], [X]: [[32, 0, 40, 40]] };
// the same world with A's arm three times as deep, rows 0..23: A and X then share 24 px, A and T 32, T and X only 16
const WIDE = { [A]: [[8, 0, 16, 40], [16, 0, 32, 24]], [T]: [[16, 24, 32, 40]], [X]: [[32, 0, 40, 40]] };
// …and either world carried east by E1, E2 and a third hub, Z: X is then one of Z's provinces, three steps from it
const E1 = 13, E2 = 14, Z = 15;
const east = (rects) => ({ ...rects, [E1]: [[40, 0, 48, 40]], [E2]: [[48, 0, 56, 40]], [Z]: [[56, 0, 64, 40]] });
const provAt = (x, y, seaIds = [], rects = RECTS) => {
  for (const [id, rs] of Object.entries(rects)) for (const [x0, y0, x1, y1] of rs) if (x >= x0 && x < x1 && y >= y0 && y < y1) return seaIds.includes(+id) ? SEA : +id;
  return SEA;
};
// the fixture's own border and extents: what arrowMissesBorder is handed, counted from the same function the bitmap is drawn from
function extentsOf(seaIds = [], rects = RECTS) {
  const cnt = new Map(), box = new Map(), border = new Map();
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const p = provAt(x, y, seaIds, rects);
    cnt.set(p, (cnt.get(p) || 0) + 1);
    const b = box.get(p);
    if (!b) box.set(p, { minX: x, maxX: x, minY: y, maxY: y });
    else { b.minX = Math.min(b.minX, x); b.maxX = Math.max(b.maxX, x); b.minY = Math.min(b.minY, y); b.maxY = Math.max(b.maxY, y); }
    for (const q of [provAt((x + 1) % W, y, seaIds, rects), y + 1 < H ? provAt(x, y + 1, seaIds, rects) : p]) if (q !== p) { const k = `${Math.min(p, q)}-${Math.max(p, q)}`; border.set(k, (border.get(k) || 0) + 1); }
  }
  return { W, H, pidAt: (x, y) => provAt(x, y, seaIds, rects), cnt, box, border, width: (a, b) => border.get(`${Math.min(a, b)}-${Math.max(a, b)}`) || 0 };
}
const stackRows = (st) => Object.entries(st).map(([p, [x, row]]) => [0, 9, 38].map((ty) => `${p};${ty};${x};10.00;${H - 1 - row};0.00;0.00`).join("\n")).join("\n") + "\n";

/** `st`: { pid: [x, row] } — the stations, written as the mod's own unitstacks.txt (none when null). `below`: { stacks, sea } — a layer
 *  below (the fixture's gameRoot) with its own unitstacks.txt and a definition.csv typing `sea` as sea there. `rects`, `states`
 *  and `vp`: another world than the first (every state AAA's, its hub on its victory point). */
function world(tag, { st = null, seaIds = [], below = null, rects = RECTS, states = null, vp = null }) {
  const mod = path.join(ROOT, tag), game = path.join(ROOT, tag + "-below");
  write(mod, "descriptor.mod", `name="${tag}"\nreplace_path="history/states"\n`);
  write(mod, "map/provinces.bmp", bmp24(W, H, (x, y) => colour(provAt(x, y, seaIds, rects))));
  const ids = [SEA].concat(Object.keys(rects).map(Number)), type = (id, sea) => (id === SEA || sea.includes(id) ? "sea;false;ocean;0" : "land;false;plains;1");
  write(mod, "map/definition.csv", ["0;0;0;0;land;false;unknown;0"].concat(ids.map((id) => `${id};${colour(id).join(";")};${type(id, seaIds)}`)).join("\n") + "\n");
  if (!states) { states = { 1: seaIds.includes(T) ? [A] : [A, T], 2: [X] }; vp = { 1: A, 2: X }; }
  for (const [s, provs] of Object.entries(states)) {
    write(mod, `history/states/${s}-S.txt`, `state={\n\tid=${s}\n\tname="STATE_${s}"\n\tmanpower=1000\n\tstate_category=rural\n\tprovinces={ ${provs.join(" ")} }\n\thistory={\n\t\towner=AAA\n\t\tvictory_points = { ${vp[s]} 5 }\n\t}\n}\n`);
  }
  write(mod, "map/adjacencies.csv", "From;To;Type;Through;start_x;start_y;stop_x;stop_y;adjacency_rule_name;Comment\n-1;-1;-1;-1;-1;-1;-1;-1;-1\n");
  write(mod, "map/supply_nodes.txt", "");
  write(mod, "map/railways.txt", "");
  if (st) write(mod, "map/unitstacks.txt", stackRows(st));
  if (below) {
    write(game, "map/unitstacks.txt", stackRows(below.stacks));
    write(game, "map/definition.csv", ["0;0;0;0;land;false;unknown;0"].concat(ids.map((id) => `${id};${colour(id).join(";")};${type(id, below.sea)}`)).join("\n") + "\n");
  }
  const roots = { modRoot: mod, gameRoot: below ? game : path.join(ROOT, "no-game"), dependencyRoots: [] };
  const plan = md.generateSupplyNetwork({ ...roots, dryRun: true }) || {};
  return { plan, hubs: (plan.newHubs || []).map((h) => h.province).sort((a, b) => a - b), rails: (plan.railRows || []).map((r) => r.provinces) };
}
// arrowMissesBorder, or undefined where the module has none (a FAIL, not a crash, on a tree without the rule)
const measure = (...a) => (typeof md.arrowMissesBorder === "function" ? md.arrowMissesBorder(...a) : undefined);
const ex = extentsOf();
const straight = [A, X], round = [A, T, X];

// ── the measurement ──────────────────────────────────────────────────────────────────────────────────────────────────
console.log("\n-- ⭐ the measurement: the line between two stations against every pixel edge the two provinces share --");
{
  ok(ex.width(A, X) === 8 && ex.width(A, T) === 48 && ex.width(T, X) === 32 && ex.width(T, SEA) === 0,
    "(the fixture: A and X share 8 px, at the end of A's arm, x = 31|32, rows 0-7; T shares 48 with A and 32 with X, and none with the sea)", { AX: ex.width(A, X), AT: ex.width(A, T), TX: ex.width(T, X) });
  const miss = (a, b, P, Q) => measure(ex, a, b, { x: P[0], row: P[1] }, { x: Q[0], row: Q[1] }, 5);
  ok(miss(A, X, [10, 13], [36, 13]) === true, "⭐⭐ a line along row 13 passes 6 px below the border's last edge, (31.5, 7): it misses");
  ok(miss(A, X, [10, 12], [36, 12]) === false, "⭐⭐ …along row 12, exactly 5 px: it does not — 5 px is within reach");
  ok(miss(A, X, [28, 4], [36, 4]) === false, "⭐ …and a line through the arm's end crosses the border itself");
  ok(miss(A, X, [36, 13], [10, 13]) === true, "⭐ the same both ways round");
  ok(miss(T, X, [24, 24], [36, 13]) === false && miss(A, T, [10, 13], [24, 24]) === false, "⭐ …and T's lines, to A and to X, cross their borders");
  ok(measure(ex, A, X, null, { x: 36, row: 13 }, 5) === false, "…no station: nothing to measure, no miss");
  ok(measure(ex, T, SEA, { x: 24, row: 24 }, { x: 44, row: 13 }, 5) === false, "…no pixel edge shared (T and the sea): nothing to miss");
  ok(measure(ex, A, X, { x: 10, row: 13 }, { x: 10 + W / 2 + 1, row: 13 }, 5) === false, "…a line longer than half the map is the way round the east–west seam, which is not measured");
}

// ── the measurement, one above the other: a border of north–south pixel edges only ──────────────────────────────────────
//        x: 0            30   40      56
//   y 0   [ P                   ]                 P: x 0..40, y 0..20, and a tongue x 30..40 on row 20
//    20   ~~~~~~~~~~~~~~[ P    ]~~~~~~~~~        Q: x 0..40 — or 0..56, wider than P — y 21..40
//    21   [ Q                   ]( Q    )        P and Q meet only under the tongue: 10 px, rows 20|21, x 30..39
// ⛔ #an-arrow-off-its-border-costs-a-step — arrowMissesBorder walks the SMALLER province, so a border seen from above (P the
// smaller: the pixel below decides) and from below (Q the smaller: the pixel above decides) are two fixtures. With neither, the
// side-by-side world above stayed green with both those checks deleted, while TEST 31 laid out went from 4 misses to 6.
console.log("\n-- ⭐ …and a border of pixels one above the other, seen from above and from below --");
{
  const P = 16, Q = 17, tongue = [[0, 0, 40, 20], [30, 20, 40, 21]];
  for (const [label, rects, walked] of [
    ["P the smaller, seen from above", { [P]: tongue, [Q]: [[0, 21, 56, 40]] }, P],
    ["Q the smaller, seen from below", { [P]: tongue, [Q]: [[0, 21, 40, 40]] }, Q],
  ]) {
    const e = extentsOf([], rects), pq = (p, q) => (p === P && q === Q) || (p === Q && q === P);
    let across = 0, down = 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (pq(e.pidAt(x, y), e.pidAt((x + 1) % W, y))) across++;
      if (y + 1 < H && pq(e.pidAt(x, y), e.pidAt(x, y + 1))) down++;
    }
    const smaller = e.cnt.get(P) < e.cnt.get(Q) ? P : e.cnt.get(Q) < e.cnt.get(P) ? Q : 0;
    ok(e.width(P, Q) === 10 && down === 10 && across === 0 && smaller === walked,
      `(the fixture, ${label}: P and Q share 10 px, every one of them one above the other, and ${walked === P ? "P" : "Q"} is the smaller)`, { width: e.width(P, Q), down, across, P: e.cnt.get(P), Q: e.cnt.get(Q) });
    const miss = (x) => measure(e, P, Q, { x, row: 5 }, { x, row: 35 }, 5);
    ok(miss(5) === true, `⭐⭐ ${label}: a line down column 5, 25 px west of the border — it misses`);
    ok(miss(24) === true && miss(25) === false, `⭐⭐ ${label}: down column 24, 6 px from the border's west end (30, 20.5), it misses; down column 25, exactly 5, it does not`);
    // ⛔ the west end alone pins an edge half a pixel EAST of its middle, never west: taken at (x − ½, y ± ½), both these checks
    // took TEST 31 from 7 misses to 8, vanilla's and Old World Blues' from 0 to 1 and Millennium Dawn's from 2 to 4
    ok(miss(45) === true && miss(44) === false, `⭐⭐ ${label}: …and down column 45, 6 px from its east end (39, 20.5), it misses; down column 44, exactly 5, it does not`, [44, 45].map(miss));
    ok(miss(35) === false, `⭐ ${label}: a line down column 35 crosses the border itself`);
    ok(measure(e, Q, P, { x: 24, row: 35 }, { x: 24, row: 5 }, 5) === true, `⭐ ${label}: the same both ways round`);
    // an edge is measured at its middle, row 20½, half a pixel from each side. Measured half a pixel on the wrong side instead,
    // the pixel below took TEST 31 laid out from 4 misses to 5 and vanilla's and Old World Blues' from 0 to 1; the pixel above,
    // vanilla's from 0 to 1 and Old World Blues' from 0 to 2
    const along = (row) => measure(e, P, Q, { x: 30, row }, { x: 39, row }, 5);
    ok(along(16) === false && along(25) === false && along(15) === true && along(26) === true,
      `⭐⭐ ${label}: an edge is measured at its middle — a line alongside the border on row 16 or 25 passes 4½ px off, within reach; on row 15 or 26, 5½, it misses`, [15, 16, 25, 26].map(along));
  }
}

// ── the measurement, side by side: which half of a pixel an east–west edge is taken at ────────────────────────────────────
//        x: 0          30|31      40        62
//   y 0   [ L             ]                             L: x 0..30, rows 0..9, and a tongue down x 30, rows 10..19
//    10   ~~~~~~~~~~~~~[L][ R      ]( R       )         R: x 31..40, rows 10..19 — or x 31..62, rows 10..39, wider than L
//    19   ~~~~~~~~~~~~~[L][ R      ]( R       )         L and R meet only beside the tongue: 10 px, x 30|31, rows 10..19
// ⛔ #an-arrow-off-its-border-costs-a-step — the first world pins only how far below its side-by-side border a line passes (the
// border's other end is the map's top), never which half of a pixel its edges are taken at: a line along a row is as far from
// (31.5, 7) as from (32.5, 7). Measured half a pixel on the wrong side, the pixel east took Millennium Dawn from 2 misses to 4 and
// Old World Blues' from 0 to 2; the pixel west, Millennium Dawn's from 2 to 3 and Old World Blues' from 0 to 1; both taken half
// a pixel low, (x ± ½, y + ½), TEST 31's from 7 to 8, vanilla's from 0 to 1 and Millennium Dawn's from 2 to 4 — and every rail
// test stayed green. So, as one above the other: a line ALONGSIDE the border, and lines past BOTH its ends, seen from the west
// (L the smaller: the pixel east decides) and from the east (R the smaller: the pixel west decides).
console.log("\n-- ⭐ …and a border of pixels side by side, seen from the west and from the east: each edge at its middle --");
{
  const L = 16, R = 17, tongue = [[0, 0, 31, 10], [30, 10, 31, 20]];
  for (const [label, rects, walked] of [
    ["L the smaller, seen from the west", { [L]: tongue, [R]: [[31, 10, 63, 40]] }, L],
    ["R the smaller, seen from the east", { [L]: tongue, [R]: [[31, 10, 41, 20]] }, R],
  ]) {
    const e = extentsOf([], rects), lr = (p, q) => (p === L && q === R) || (p === R && q === L);
    let across = 0, down = 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (lr(e.pidAt(x, y), e.pidAt((x + 1) % W, y))) across++;
      if (y + 1 < H && lr(e.pidAt(x, y), e.pidAt(x, y + 1))) down++;
    }
    const smaller = e.cnt.get(L) < e.cnt.get(R) ? L : e.cnt.get(R) < e.cnt.get(L) ? R : 0;
    ok(e.width(L, R) === 10 && across === 10 && down === 0 && smaller === walked,
      `(the fixture, ${label}: L and R share 10 px, every one of them side by side, and ${walked === L ? "L" : "R"} is the smaller)`, { width: e.width(L, R), across, down, L: e.cnt.get(L), R: e.cnt.get(R) });
    // the edges' middle is column 30½: a line down column 26 or 35 passes 4½ px off it, down 25 or 36, 5½
    const along = (x) => measure(e, L, R, { x, row: 10 }, { x, row: 19 }, 5);
    ok(along(26) === false && along(35) === false && along(25) === true && along(36) === true,
      `⭐⭐ ${label}: an edge is measured at its middle — a line alongside the border down column 26 or 35 passes 4½ px off, within reach; down 25 or 36, 5½, it misses`, [25, 26, 35, 36].map(along));
    // …and its ends, (30½, 10) and (30½, 19), pin the middle down the border: a line along a row, across the border's column
    const past = (row) => measure(e, L, R, { x: 20, row }, { x: 41, row }, 5);
    ok(past(4) === true && past(5) === false, `⭐⭐ ${label}: a line along row 4 passes 6 px above the border's north end (30½, 10): it misses; along row 5, exactly 5, it does not`, [4, 5].map(past));
    ok(past(25) === true && past(24) === false, `⭐⭐ ${label}: …and along row 25, 6 px below its south end (30½, 19), it misses; along row 24, exactly 5, it does not`, [24, 25].map(past));
  }
}

// ── the railway ──────────────────────────────────────────────────────────────────────────────────────────────────────
console.log("\n-- ⭐ two hubs whose border lies off the line between their stations: the railway goes round by T --");
{
  const w = world("misses-by-6", { st: { [A]: [10, 13], [X]: [36, 13], [T]: [24, 24] } });
  ok(w.hubs.join() === [A, X].join() && w.rails.length === 1, "two hubs, one railway between them", { hubs: w.hubs, rails: w.rails });
  ok(sameWay(w.rails[0], round), "⭐⭐ A – T – X: one province longer, and every arrow crosses its own border", w.rails);
}
console.log("\n-- ⭐ …a miss of 5 px costs nothing, and it is the stations that decide --");
{
  const five = world("misses-by-5", { st: { [A]: [10, 12], [X]: [36, 12], [T]: [24, 24] } });
  ok(five.rails.length === 1 && sameWay(five.rails[0], straight), "⭐⭐ the line 5 px from the border: straight from A to X, as before", five.rails);
  const arm = world("stations-at-the-arm", { st: { [A]: [28, 4], [X]: [36, 4], [T]: [24, 24] } });
  ok(arm.rails.length === 1 && sameWay(arm.rails[0], straight), "⭐⭐ CONTROL: the same borders, the stations moved so the line crosses the border — straight again", arm.rails);
}
console.log("\n-- ⭐ CONTROL: where there are no stations to measure, or the missed border is the only way, nothing changes --");
{
  const blind = world("no-stations", {});
  ok(blind.rails.length === 1 && sameWay(blind.rails[0], straight), "⭐ no unitstacks.txt: the fewest provinces, A – X", blind.rails);
  const only = world("only-way", { st: { [A]: [10, 13], [X]: [36, 13] }, seaIds: [T] });
  ok(only.hubs.join() === [A, X].join() && only.rails.length === 1 && sameWay(only.rails[0], straight), "⭐⭐ T is sea: the missed border is the only way, and the railway is laid over it", only.rails);
}
// the first world turned on its side, x for row: A's arm now runs down x 0..7, and A and X meet one above the other, rows 31|32
const turn = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, Array.isArray(v[0]) ? v.map(([x0, y0, x1, y1]) => [y0, x0, y1, x1]) : [v[1], v[0]]]));
console.log("\n-- ⭐ …and the same world turned on its side: a border of pixels one above the other is measured the same --");
{
  const side = world("on-its-side", { st: turn({ [A]: [10, 13], [X]: [36, 13], [T]: [24, 24] }), rects: turn(RECTS) });
  ok(side.hubs.join() === [A, X].join() && side.rails.length === 1 && sameWay(side.rails[0], round), "⭐⭐ A – T – X on its side too: the arrow down column 13 passes 6 px east of the border's last edge, (7, 31.5)", side.rails);
  const arm = world("on-its-side-at-the-arm", { st: turn({ [A]: [28, 4], [X]: [36, 4], [T]: [24, 24] }), rects: turn(RECTS) });
  ok(arm.rails.length === 1 && sameWay(arm.rails[0], straight), "⭐ CONTROL: on its side with the stations moved so the line crosses the border — straight from A to X", arm.rails);
}

// ── inside a walk ────────────────────────────────────────────────────────────────────────────────────────────────────
//        x: 8      16      24      32      40      48      56
//   y 0   [ A, and its arm        ][ X    ][ E1   ][ E2   ][ Z    ]      the first world carried east: X, E1, E2 and Z are
//     8   [ A    ][ T             ][ X    ][ E1   ][ E2   ][ Z    ]      Z's, and the hubs are A and Z — so X is reached by
//    …                                                                     A's search, two walks away from where they meet
console.log("\n-- ⭐ …and inside a walk, away from where two hubs' land meets: A's search reaches X round by T too --");
{
  const states = { 1: [A, T], 2: [X, E1, E2, Z] }, vp = { 1: A, 2: Z };
  const far = world("in-a-walk", { st: { [A]: [10, 13], [X]: [36, 13], [T]: [24, 24] }, rects: east(RECTS), states, vp });
  ok(far.hubs.join() === [A, Z].join() && far.rails.length === 1 && sameWay(far.rails[0], [A, T, X, E1, E2, Z]),
    "⭐⭐ A – T – X – E1 – E2 – Z: the walk into X goes by T, not over the border A's arrow misses", far.rails);
  const arm = world("in-a-walk-at-the-arm", { st: { [A]: [28, 4], [X]: [36, 4], [T]: [24, 24] }, rects: east(RECTS), states, vp });
  ok(arm.rails.length === 1 && sameWay(arm.rails[0], [A, X, E1, E2, Z]), "⭐ CONTROL: the stations moved so the line crosses the border — A – X – E1 – E2 – Z, the fewest provinces", arm.rails);
}

// ── a dear border and a clean way one province longer cost the same: the clean way is taken, however wide the dear one ──
//        x: 8      16      24      32      40
//   y 0   [ A, and its arm, rows 0..23 ][ X  ]      A – X 24 px, missed by the line along row 29; A – T 32 px and T – X 16,
//    24   [ A    ][ T                  ][ X  ]      both crossed — so the way round is NARROWER than the missed border
console.log("\n-- ⭐ the missed border costs what the way round costs; at that tie the way round is taken, even where it is narrower --");
{
  const wide = extentsOf([], WIDE), st = { [A]: [10, 29], [X]: [36, 29], [T]: [24, 32] };
  const miss = (a, b) => measure(wide, a, b, { x: st[a][0], row: st[a][1] }, { x: st[b][0], row: st[b][1] }, 5);
  ok(wide.width(A, X) === 24 && wide.width(A, T) === 32 && wide.width(T, X) === 16, "(the fixture: A – X 24 px, A – T 32, T – X 16)", { AX: wide.width(A, X), AT: wide.width(A, T), TX: wide.width(T, X) });
  ok(miss(A, X) === true && miss(A, T) === false && miss(T, X) === false, "(…and the line along row 29 passes 6 px below the A – X border's last edge, (31.5, 23), while A – T and T – X are crossed)");
  const link = world("tie-at-the-link", { st, rects: WIDE });
  ok(link.hubs.join() === [A, X].join() && link.rails.length === 1 && sameWay(link.rails[0], round),
    "⭐⭐ where the two hubs' land meets: A – T – X, whose link crosses a clean border, before A – X, whose border is wider but missed", link.rails);
  const walk = world("tie-in-a-walk", { st, rects: east(WIDE), states: { 1: [A, T], 2: [X, E1, E2, Z] }, vp: { 1: A, 2: Z } });
  ok(walk.hubs.join() === [A, Z].join() && walk.rails.length === 1 && sameWay(walk.rails[0], [A, T, X, E1, E2, Z]),
    "⭐⭐ …and inside a walk: X is entered from T, over a clean border, not from A over the wider missed one", walk.rails);
  const blind = world("tie-no-stations", { rects: WIDE });
  ok(blind.rails.length === 1 && sameWay(blind.rails[0], straight), "⭐ CONTROL: the same world with no stations — A – X, the fewest provinces", blind.rails);
}

// ── the station of land that was sea ─────────────────────────────────────────────────────────────────────────────────
// X was SEA in the layer below, and the mod has no unitstacks.txt of its own: X's Standstill is the one the sea layout left, at
// (36, 2) — where a line from A's station at (10, 30) crosses the border. Auto-fix's layout moves it to X's town point, the pixel
// nearest its centroid with a full 3x3 of its own, (35, 19) — and a line from (10, 30) to there passes 12 px from the border.
console.log("\n-- ⭐ a Standstill still on the SEA's layout is not the station: the town point Auto-fix moves it to is --");
{
  const stacks = { [A]: [10, 30], [T]: [24, 24], [X]: [36, 2] };
  const miss = (P, Q) => measure(ex, A, X, { x: P[0], row: P[1] }, { x: Q[0], row: Q[1] }, 5);
  ok(miss([10, 30], [36, 2]) === false && miss([10, 30], [35, 19]) === true, "(the fixture: from A's station the line to the sea's Standstill crosses the border, the line to X's town point misses it)");
  const risen = world("risen-from-the-sea", { below: { stacks, sea: [X] } });
  ok(risen.hubs.join() === [A, X].join() && risen.rails.length === 1 && sameWay(risen.rails[0], round), "⭐⭐ measured from the town point, the railway goes round by T", risen.rails);
  const land = world("land-below-too", { below: { stacks, sea: [] } });
  ok(land.rails.length === 1 && sameWay(land.rails[0], straight), "⭐ CONTROL: the same rows over a layer below where X was land — a Standstill someone laid out — straight from A to X", land.rails);
}

try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) { /* scratch only */ }
console.log("\n" + (fail ? "FAILED " + fail + "/" + (pass + fail) : "PASSED " + pass + "/" + pass));
process.exitCode = fail ? 1 : 0;
