// ⛔ #a-depot-stands-on-its-stations-islet — A PROVINCE WHOSE STANDSTILL STANDS ON A SMALL ISLET OF ITS OWN KEEPS ITS TOWN POINT ON
// THAT ISLET, NOT ON ANOTHER ONE NEAREST ITS CENTROID.
//
// The audit of TEST 32 (10-02) found 1751 Bestothel's depot — its supply_node row — 45.23 px from its station, where the base game's
// hubs keep theirs within 13.21. townPointOf answers a province's ONE point (#one-town-point-per-province): its Standstill where
// that stands on a full 3x3 of the province (rule 1), else the province's own full-3x3 pixel nearest its CENTROID (rule 2). 1751 is
// six islets: its Standstill stands on its own islet, which has no full 3x3 there, so rule 2 measured from the centroid of all six
// and took a pixel on another islet 45 px away. Rule 2 now measures from the Standstill's pixel when the Standstill stands on the
// province itself (a land layout: the sea's, on land that has come up since, is still not asked). Re-measured on the installed
// base game: of its 205 land provinces whose Standstill stands on the province without a full 3x3, vanilla writes its own
// supply_node row ON the Standstill for 158; from the centroid 8 town points land more than 10 px from it, from the Standstill 2;
// and of the 18 hubs among them, vanilla's depot stands within 5 px of the station 18 times, the Standstill rule 18, the
// centroid 17. Rebuilt through the owner's flow (Delete map, Generate land 35% seed 1, Auto-fix, Redraw): 25 supply_node rows
// move, 24 nearer their station and none further (1751 45.23 → 0.61 px, 10440 23.98 → 0.24), the rows of those 25 states'
// own buildings follow their town (all on the state's own land before and after) — and no hub, station, unit row or railway.
//
// Pinned on a small world of hand-measured extents (the answers derived from the fixture's own pixels, never typed in):
//   · the Standstill on its own islet without a full 3x3: the islet's own full-3x3 pixel nearest it (rule 2), not the far islet;
//   · CONTROL: the centroid's pixel is on the far islet, 30+ px off — the fixture can tell the two rules apart;
//   · a Standstill on the SEA beside the islet is not the province's: the centroid rule, as before;
//   · a Standstill with a full 3x3: itself (rule 1), as before;
//   · a Standstill still in the sea's layout is not asked: the centroid rule, as before;
//   · and stateBuildingAnchor's per-province answer — the one caller that hands townPointOf a land-layout Standstill, and where the
//     supply_node row is written — stands at the same point on a mod built from the same pixels;
//   · RULE 3 IS NOT MOVED: a province with no full 3x3 of its own anywhere still takes its pixel nearest its CENTROID whose 3x3 is
//     the state's land, though its Standstill stands on it. That is where the base game writes its own depot: of the 4 vanilla
//     provinces in the class above that answer rule 3 (with their own state's land), its supply_node row stands exactly on the
//     centroid answer for 1513 and 7245, which the Standstill's would put 11.18 and 7.62 px off it; 10011 goes the other way by
//     1 px, and 7412 is the same both ways. Pinned directly and through stateBuildingAnchor, on a world of two thin strips.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-depot-islet-"));
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

// ── the world ────────────────────────────────────────────────────────────────────────────────────────────────────────
//        x: 0   6    10 14                  40                  60  64
//   y 6   [J  ]                             [ K, the far islet: 20x20      ]
//    10   [J  ]      [K ]                   [                              ]      K: a 4x4 islet (x 10..13, rows 10..13) and a
//    13   [J  ]      [K ]                   [                              ]         20x20 one (x 40..59, rows 6..25)
//    25   [J  ]                             [                              ]      J: a strip of land, x 0..5; the rest sea
const W = 64, H = 32, K = 5, J = 6, SEA = 1;
const at = (x, y) => (x >= 10 && x < 14 && y >= 10 && y < 14) || (x >= 40 && x < 60 && y >= 6 && y < 26) ? K : (x < 6 ? J : SEA);
/** provinceExtents' answer, measured by hand off a world of `at(x, y)` ids */
function extentsOf(W, H, at) {
  const ex = { W, H, pidAt: (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? -1 : at(x, y)), cnt: new Map(), box: new Map(), sumX: new Map(), sumY: new Map() };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const p = at(x, y);
    ex.cnt.set(p, (ex.cnt.get(p) || 0) + 1); ex.sumX.set(p, (ex.sumX.get(p) || 0) + x); ex.sumY.set(p, (ex.sumY.get(p) || 0) + y);
    const b = ex.box.get(p);
    if (!b) ex.box.set(p, { minX: x, maxX: x, minY: y, maxY: y });
    else { b.minX = Math.min(b.minX, x); b.maxX = Math.max(b.maxX, x); b.minY = Math.min(b.minY, y); b.maxY = Math.max(b.maxY, y); }
  }
  return ex;
}
/** a mod of that world: every id but SEA land, `provinces` state 1's, and `standstill` [pid, { x, z }] its unitstacks types 0, 9, 38 */
function modOf(name, W, H, at, provinces, [pid, s]) {
  const mod = path.join(ROOT, name), ids = [...new Set(Array.from({ length: W * H }, (_, i) => at(i % W, Math.floor(i / W))))].sort((a, b) => a - b);
  write(mod, "descriptor.mod", `name="${name}"\nreplace_path="history/states"\n`);
  write(mod, "map/provinces.bmp", bmp24(W, H, (x, y) => colour(at(x, y))));
  write(mod, "map/definition.csv", ["0;0;0;0;land;false;unknown;0"].concat(ids.map((id) => `${id};${colour(id).join(";")};${id === SEA ? "sea;false;ocean;0" : "land;false;plains;1"}`)).join("\n") + "\n");
  write(mod, "history/states/1-S.txt", `state={\n\tid=1\n\tname="STATE_1"\n\tmanpower=1000\n\tstate_category=rural\n\tprovinces={ ${provinces.join(" ")} }\n\thistory={\n\t\towner=AAA\n\t}\n}\n`);
  write(mod, "map/unitstacks.txt", [0, 9, 38].map((ty) => `${pid};${ty};${s.x.toFixed(2)};10.00;${s.z.toFixed(2)};0.00;0.00`).join("\n") + "\n");
  return mod;
}
const ex = extentsOf(W, H, at);
const z = (row) => H - 1 - row;                 // buildings.txt / unitstacks.txt z is bottom-up
const dist = (t, s) => Math.hypot(t.x - s.x, t.z - s.z);
// the answers, from the fixture's own pixels: K's pixels whose 3x3 is all K, the one nearest a point (first in the raster on a tie)
const full3 = (x, y) => { for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (ex.pidAt(x + dx, y + dy) !== K) return false; return true; };
const nearestFull = (cx, cy) => {
  let best = null;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (at(x, y) === K && full3(x, y)) { const d = (x - cx) ** 2 + (y - cy) ** 2; if (!best || d < best.d) best = { x, row: y, d }; }
  return { x: best.x, z: z(best.row) };
};
const centroid = nearestFull(ex.sumX.get(K) / ex.cnt.get(K), ex.sumY.get(K) / ex.cnt.get(K));
const S = { x: 10.5, z: z(12) };                // on the small islet's west edge: K's own pixel (10, 12), with no full 3x3 of K
const islet = nearestFull(10, 12);

console.log("\n-- ⭐ a Standstill on its own small islet, without a full 3x3 there: the town point stays on that islet --");
{
  ok(at(10, 12) === K && !full3(10, 12) && islet.x < 14 && centroid.x >= 40 && dist(centroid, S) > 30,
    "(the fixture: the Standstill's pixel is K's but not a full 3x3 of it; the islet's nearest full-3x3 pixel is on the small islet, the centroid's 30+ px away on the far one)", { islet, centroid, d: +dist(centroid, S).toFixed(2) });
  const t = md.townPointOf({ pid: K, ex, standstill: S, standstillIsSeaLayout: false });
  ok(!!t && t.rule === 2 && t.x === islet.x && t.z === islet.z, "⭐⭐ rule 2 takes the islet's own full-3x3 pixel nearest the Standstill, not the one nearest K's centroid", { t, islet });
  ok(!!t && dist(t, S) <= 1.5, "⭐ …so the depot stands within 1.5 px of the station", t && +dist(t, S).toFixed(2));
}
console.log("\n-- ⭐ CONTROL: where the Standstill does not stand on the province, or is not asked, the centroid rule is as before --");
{
  const sea = { x: 8.5, z: z(12) };
  ok(at(8, 12) === SEA, "(the fixture: (8, 12) is sea, beside the small islet)");
  const tSea = md.townPointOf({ pid: K, ex, standstill: sea, standstillIsSeaLayout: false });
  ok(!!tSea && tSea.rule === 2 && tSea.x === centroid.x && tSea.z === centroid.z, "⭐⭐ a Standstill on the sea beside it is not the province's: the pixel nearest K's centroid, on the far islet", { tSea, centroid });
  const tLay = md.townPointOf({ pid: K, ex, standstill: S, standstillIsSeaLayout: true });
  ok(!!tLay && tLay.rule === 2 && tLay.x === centroid.x && tLay.z === centroid.z, "⭐⭐ a Standstill still in the sea's layout is not asked: the centroid rule", { tLay, centroid });
  const tNone = md.townPointOf({ pid: K, ex });
  ok(!!tNone && tNone.rule === 2 && tNone.x === centroid.x && tNone.z === centroid.z, "⭐ no Standstill at all (the hub picker's question): the centroid rule", tNone);
  const own = { x: 11.5, z: z(11) };
  ok(full3(11, 11), "(the fixture: (11, 11) has a full 3x3 of K)");
  const tFull = md.townPointOf({ pid: K, ex, standstill: own, standstillIsSeaLayout: false });
  ok(!!tFull && tFull.rule === 1 && tFull.x === own.x && tFull.z === own.z, "⭐ a Standstill with a full 3x3 of its province: itself (rule 1)", tFull);
}

// ── the one caller that hands it a land-layout Standstill: stateBuildingAnchor's per-province answer, where the depot is written ──
console.log("\n-- ⭐ stateBuildingAnchor's per-province point — where the supply_node row is written — stands on the islet too --");
{
  const mod = modOf("depot-islet", W, H, at, [K, J], [K, S]);
  const pts = md.stateBuildingAnchor({ modRoot: mod, gameRoot: path.join(ROOT, "no-game"), dependencyRoots: [], provinces: [K, J], each: true, stateId: 1 });
  const k = pts instanceof Map ? pts.get(K) : null;
  ok(!!k && k.x === islet.x && k.z === islet.z, "⭐⭐ K's point is the islet's pixel nearest its Standstill — its supply_node row stands by its station", { k, islet });
  const j = pts instanceof Map ? pts.get(J) : null;
  ok(!!j && j.x < 6, "…and J, with no Standstill, keeps its own centroid point", j);
}

// ── rule 3: no full 3x3 of the province anywhere, and its Standstill on it — the centroid's pixel still ─────────────────────────────
//        x: 0 1  4 6                                    40 42      47
//   y 0   ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~      T: two strips 2 px wide — x 4..5, rows 8..13, and x 40..41,
//     2   ~[U                                       [T]        ]~         rows 2..21 — so no pixel of T has a full 3x3 of T;
//     8   ~[U  [T]                                  [T]        ]~         U, of T's own state, all round them; a frame of sea.
//    22   ~[U                                       [T]        ]~         T's Standstill on the short strip, (4, 10)
console.log("\n-- ⭐ rule 3 — no full 3x3 of the province anywhere — is measured from the centroid still, though the Standstill stands on it --");
{
  const W2 = 48, H2 = 24, T = 7, U = 8;
  const at2 = (x, y) => (x >= 4 && x < 6 && y >= 8 && y < 14) || (x >= 40 && x < 42 && y >= 2 && y < 22) ? T : (x >= 1 && x < 47 && y >= 1 && y < 23 ? U : SEA);
  const ex2 = extentsOf(W2, H2, at2);
  const ownLand = (id) => id === T || id === U;
  // T's pixel nearest (cx, cy) whose 3x3 all passes `is`, first in the raster on a tie; null when none has
  const nearestOf = (is, cx, cy) => {
    let best = null;
    for (let y = 0; y < H2; y++) for (let x = 0; x < W2; x++) {
      if (at2(x, y) !== T) continue;
      let full = true;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (!is(ex2.pidAt(x + dx, y + dy))) full = false;
      const d = (x - cx) ** 2 + (y - cy) ** 2;
      if (full && (!best || d < best.d)) best = { x, row: y, d };
    }
    return best && { x: best.x, z: H2 - 1 - best.row };
  };
  const S2 = { x: 4.5, z: H2 - 1 - 10 };
  const byCentroid = nearestOf(ownLand, ex2.sumX.get(T) / ex2.cnt.get(T), ex2.sumY.get(T) / ex2.cnt.get(T)), byStandstill = nearestOf(ownLand, 4, 10);
  ok(at2(4, 10) === T && nearestOf((id) => id === T, 0, 0) === null && !!byCentroid && !!byStandstill && dist(byCentroid, byStandstill) > 30,
    "(the fixture: the Standstill's pixel is T's, T has no full 3x3 of its own, and its state-land pixel nearest the Standstill stands 30+ px from the one nearest its centroid)", { byCentroid, byStandstill });
  const t = md.townPointOf({ pid: T, ex: ex2, standstill: S2, standstillIsSeaLayout: false, ownLand });
  ok(!!t && t.rule === 3 && t.x === byCentroid.x && t.z === byCentroid.z, "⭐⭐ rule 3 takes T's state-land pixel nearest its CENTROID, not the one nearest its Standstill", { t, byCentroid, byStandstill });
  const pts = md.stateBuildingAnchor({ modRoot: modOf("rule-3", W2, H2, at2, [T, U], [T, S2]), gameRoot: path.join(ROOT, "no-game"), dependencyRoots: [], provinces: [T, U], each: true, stateId: 1 });
  const p = pts instanceof Map ? pts.get(T) : null;
  ok(!!p && p.rule === 3 && p.x === byCentroid.x && p.z === byCentroid.z, "⭐⭐ …and so does stateBuildingAnchor's per-province point, where T's supply_node row is written", { p, byCentroid });
}

try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) { /* scratch only */ }
console.log("\n" + (fail ? "FAILED " + fail + "/" + (pass + fail) : "PASSED " + pass + "/" + pass));
process.exitCode = fail ? 1 : 0;
