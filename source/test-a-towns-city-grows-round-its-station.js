// ⛔ #one-town-point-per-province — A TOWN'S CITY GROWS ROUND ITS STATION, AND ITS OWN BUILDING ROWS STAND ON THAT ONE POINT.
//
// The owner played TEST 31 (09-30): "not all cities seem to have a city graphics" and "some train tracks are not connected
// correctly within some cities". In Cacav — a 5,359 px province that was ocean below — the star, the city block and the station
// stood 16, 8 and 23 px apart, because three rules placed them:
//   · the city core grew from the province's DEEPEST pixel (paintProvincesInTerrainBmp);
//   · the supply_node row went to stateBuildingAnchor's centroid pixel — 1–1.41 px off the Standstill on 71.5% of TEST 31's rows,
//     where vanilla writes it AT its Standstill (9,689 of ~10,146 rows identical, median 0 px);
//   · the station icon, the white rail arrow and the rail node are drawn at map/unitstacks.txt's type 0, the Standstill — and on
//     land raised out of the sea that is still the SEA layout the layer below left there (the F-sea fingerprint).
// Now one point per province (townPointOf): its Standstill where that is a land layout standing on a full 3x3 of the province,
// else its own pixel nearest its centroid with a full 3x3 of itself, else the old anchor rule. The per-province rows stand on it
// and the painter grows the city core from it — one computation (generateLand asks it once and hands it to both).
//
// The fixture, a layer below and a Delete-map'd mod over it (derived below, never typed as answers):
//   L (2)  an L-shaped province, SEA below: a 20x20 square with a 60x6 arm. Its deepest pixel is in the square, its centroid is
//          pulled out along the arm, and its sea-layout Standstill (type 0; type 38 == type 9) stands at the arm's far end —
//          the three pairwise at least 8 px apart, so a core seeded at the wrong one cannot reach the right one.
//   B (3)  a compact 14x14 province, LAND below, whose Standstill stands on a full 3x3 of it, 2+ px off its centroid pixel — and
//          whose type 38 stands on its type 9, the shape of 8,371 of vanilla's 10,147 land provinces, so only its being LAND
//          below tells its rows from a sea layout (a B laid out like a victory point, 38 off 9, passed with that clause dropped).
//   T (4)  a second city of B's state in the layer below, out in what the mod leaves as sea and never raises.
//          ⚠️ MOVED WITH #a-generated-world-has-the-layer-belows-cities-per-state: the state below held ONE city on its one
//          province, and that share of the land (1 of 1) made both L and B towns. Counted per state that is one town for the
//          one generated state — B's — and L's core, which half of this file is about, was never painted. So the state below
//          holds two cities, and the generated state gets two.
// Checks: each clause of the sea-layout fingerprint answers alone (land now, sea below, type 0 and type 38 the layer below's — in
// whichever slot the layer below's marker sat); the supply_node (and every per-province) row of each is its town point — L's own centroid pixel, B's
// Standstill to the hundredth; each city core contains its town point, and a town point that did not come up with the land does not seed one;
// a modder's own layout is kept and one standing off the province is not used; no row stands over water or on another state
// (#a-building-over-water); and a caller that passes no town points (createState, Auto-fix's slot repair) gets the same rows.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-town-point-"));
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
  const rs = Math.floor((8 * W + 31) / 32) * 4, off = 54 + 1024, b = Buffer.alloc(off + rs * H);
  b.write("BM", 0, "ascii"); b.writeUInt32LE(b.length, 2); b.writeUInt32LE(off, 10); b.writeUInt32LE(40, 14);
  b.writeInt32LE(W, 18); b.writeInt32LE(H, 22); b.writeUInt16LE(1, 26); b.writeUInt16LE(8, 28); b.writeUInt32LE(rs * H, 34); b.writeUInt32LE(256, 46);
  for (let i = 0; i < 256; i++) { b[54 + i * 4] = i; b[54 + i * 4 + 1] = i; b[54 + i * 4 + 2] = i; }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) b[off + (H - 1 - y) * rs + x] = fn(x, y);
  return b;
}
const read8 = (file) => { const b = fs.readFileSync(file), W = b.readInt32LE(18), H = b.readInt32LE(22), off = b.readUInt32LE(10), rs = Math.floor((8 * W + 31) / 32) * 4; return (x, y) => b[off + (H - 1 - y) * rs + x]; };

// ── the world ──────────────────────────────────────────────────────────────────────────────────────────────────────────
const W = 96, H = 48, SEA = 1, L = 2, B = 3, T = 4;
const SPAWN = 13, PLAINS = 0, OCEAN = 15, CORE_BELOW = 40;
const provAt = (x, y) => {
  if ((x >= 4 && x < 24 && y >= 4 && y < 24) || (x >= 24 && x < 84 && y >= 14 && y < 20)) return L;
  if (x >= 4 && x < 18 && y >= 24 && y < 38) return B;
  if (x >= 60 && x < 74 && y >= 30 && y < 40) return T;
  return SEA;
};
const COLOUR = { 1: [10, 20, 200], 2: [200, 40, 40], 3: [40, 200, 40], 4: [200, 200, 40] };
const inBelowCore = (x, y) => (x >= 6 && x < 14 && y >= 28 && y < 33) || (x >= 62 && x < 70 && y >= 32 && y < 37);   // 8 x 5 = 40 px of B below is city ground, and 40 of T
const zOf = (row) => H - 1 - row;                                      // pixelYToBuildingZ, bottom-up
const rowOf = (z) => H - 1 - Math.floor(z);                            // buildingZToPixelY
const sq = (a, b) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
// unitstacks rows of the layer below: L laid out as the sea is (38 == 9), B as Paradox lays out most of its land (38 == 9 as well)
const L_SEA_STANDSTILL = { x: 78.4, z: 31.3 }, B_STANDSTILL = { x: 8.37, z: 19.62 }, B_SLOT = { x: 6.5, z: 18.5 };
const stackRow = (pid, type, p, y = 9.5) => `${pid};${type};${p.x.toFixed(2)};${y.toFixed(2)};${p.z.toFixed(2)};0.00;0.24`;
const L_SLOT = { x: 70, z: 31 };
function unitstacks({ l0 = L_SEA_STANDSTILL, b0 = B_STANDSTILL, l38 = L_SLOT, b38 = B_SLOT } = {}) {
  const rows = [];
  for (const t of [0, 1, 2, 9, 10, 11, 12, 38]) rows.push(stackRow(SEA, t, { x: 90, z: 40 }));
  for (const t of [0, 1, 2, 10, 11, 12]) rows.push(stackRow(L, t, t === 0 ? l0 : L_SEA_STANDSTILL));
  rows.push(stackRow(L, 9, L_SLOT), stackRow(L, 38, l38));
  rows.push(stackRow(B, 0, b0, 10.6), stackRow(B, 1, B_STANDSTILL, 10.6), stackRow(B, 9, B_SLOT, 10.6), stackRow(B, 38, b38, 10.6));
  return rows.join("\n") + "\n";
}
const TERRAIN_TXT = ["categories = {", "  plains = { color = { 200 200 100 } }", "  forest = { color = { 0 120 0 } }", "  urban = { color = { 120 110 100 } }",
  "  ocean = { color = { 0 0 200 } is_water = yes }", "}", "terrain = {", "  plains = { type = plains color = { 0 } }", "  forest = { type = forest color = { 1 } }",
  "  terrain_city = { type = urban color = { 13 } spawn_city = yes }", "  ocean = { type = ocean color = { 15 } }", "}", ""].join("\n");

const game = path.join(ROOT, "game");
write(game, "hoi4.exe", "");
write(game, "map/provinces.bmp", bmp24(W, H, (x, y) => COLOUR[provAt(x, y)]));
write(game, "map/definition.csv", ["0;0;0;0;land;false;unknown;0", `1;${COLOUR[1].join(";")};sea;false;ocean;0`, `2;${COLOUR[2].join(";")};sea;false;ocean;0`,
  `3;${COLOUR[3].join(";")};land;false;urban;1`, `4;${COLOUR[4].join(";")};land;false;urban;1`].join("\n") + "\n");
const landBelow = (x, y) => provAt(x, y) === B || provAt(x, y) === T;
write(game, "map/terrain.bmp", bmp8(W, H, (x, y) => (!landBelow(x, y) ? OCEAN : inBelowCore(x, y) ? SPAWN : PLAINS)));
write(game, "map/heightmap.bmp", bmp8(W, H, (x, y) => (landBelow(x, y) ? 106 : 89)));
write(game, "map/unitstacks.txt", unitstacks());
write(game, "map/buildings.txt", "50;air_base;10.00;10.40;15.00;0.00;0\n");
write(game, "common/terrain/00_terrain.txt", TERRAIN_TXT);
write(game, "history/states/50-S.txt", "state={\n\tid=50\n\tname=\"STATE_50\"\n\tmanpower=100000\n\tstate_category=metropolis\n\tprovinces={ 3 4 }\n\thistory={\n\t\towner=AAA\n\t}\n}\n");

/** o.stacks: the mod's own map/unitstacks.txt (null: none, it inherits the layer below's) */
function makeMod(tag, o = {}) {
  const m = path.join(ROOT, tag);
  write(m, "descriptor.mod", 'name="town point"\nreplace_path="history/states"\n');
  write(m, "map/provinces.bmp", bmp24(W, H, (x, y) => COLOUR[provAt(x, y)]));
  write(m, "map/definition.csv", ["0;0;0;0;land;false;unknown;0"].concat([1, 2, 3, 4].map((id) => `${id};${COLOUR[id].join(";")};sea;false;ocean;0`)).join("\n") + "\n");
  write(m, "map/terrain.bmp", bmp8(W, H, () => OCEAN));
  write(m, "map/heightmap.bmp", bmp8(W, H, () => 89));
  write(m, "map/strategicregions/r1.txt", "strategic_region={\n\tid=1\n\tname=\"REGION_1\"\n\tprovinces={ 2 3 }\n\tweather={}\n}\n");
  write(m, "map/supply_nodes.txt", ""); write(m, "map/railways.txt", "");
  if (o.stacks != null) write(m, "map/unitstacks.txt", o.stacks);
  fs.mkdirSync(path.join(m, "history", "states"), { recursive: true });
  return m;
}
const rowsOf = (m, sid) => fs.readFileSync(path.join(m, "map", "buildings.txt"), "utf8").split(/\r?\n/).map((l) => l.split(";"))
  .filter((c) => c.length >= 7 && +c[0] === sid).map((c) => ({ type: c[1], x: +c[2], z: +c[4], px: Math.floor(+c[2]), row: rowOf(+c[4]) }));
const full3x3 = (px, row, pid) => { for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const x = px + dx, y = row + dy; if (x < 0 || y < 0 || x >= W || y >= H || provAt(x, y) !== pid) return false; } return true; };

// ── what the fixture says, from its own pixels ─────────────────────────────────────────────────────────────────────────
const pixelsOf = (pid) => { const out = []; for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (provAt(x, y) === pid) out.push({ x, y }); return out; };
const centroidOf = (pid) => { const px = pixelsOf(pid); return { x: px.reduce((a, p) => a + p.x, 0) / px.length, y: px.reduce((a, p) => a + p.y, 0) / px.length }; };
/** the province's own pixel nearest its centroid whose 3x3 is all of it, first in the raster on a tie */
const ownCentrePixel = (pid) => { const c = centroidOf(pid); let best = null, d = Infinity; for (const p of pixelsOf(pid)) { if (!full3x3(p.x, p.y, pid)) continue; const e = sq(p, c); if (e < d) { d = e; best = p; } } return best; };
/** the pixel farthest from the province's edge (4-neighbour walk in from every edge pixel), first in the raster; `keep`: only
 *  those pixels of it (the painter's walk over the pixels that crossed the waterline) */
const deepestPixel = (pid, keep = () => true) => {
  const inP = (x, y) => x >= 0 && y >= 0 && x < W && y < H && provAt(x, y) === pid && keep(x, y);
  const dist = new Map(), q = [];
  for (const p of pixelsOf(pid)) if (keep(p.x, p.y) && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => !inP(p.x + dx, p.y + dy))) { dist.set(p.y * W + p.x, 0); q.push(p); }
  for (let h = 0; h < q.length; h++) { const p = q[h]; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const x = p.x + dx, y = p.y + dy; if (!inP(x, y) || dist.has(y * W + x)) continue; dist.set(y * W + x, dist.get(p.y * W + p.x) + 1); q.push({ x, y }); } }
  let best = null, d = -1; for (const p of pixelsOf(pid)) { const e = dist.get(p.y * W + p.x); if (e > d) { d = e; best = p; } } return best;
};
const L_TOWN = ownCentrePixel(L), L_DEEP = deepestPixel(L), L_SEA = { x: Math.floor(L_SEA_STANDSTILL.x), y: rowOf(L_SEA_STANDSTILL.z) };
const B_STAND = { x: Math.floor(B_STANDSTILL.x), y: rowOf(B_STANDSTILL.z) }, B_CENTRE = ownCentrePixel(B);

console.log("\n-- the fixture can tell the three points apart --");
ok(Math.sqrt(sq(L_TOWN, L_DEEP)) >= 8 && Math.sqrt(sq(L_TOWN, L_SEA)) >= 8 && Math.sqrt(sq(L_DEEP, L_SEA)) >= 8,
  "L's centroid pixel, deepest pixel and sea-layout Standstill are pairwise at least 8 px apart", { L_TOWN, L_DEEP, L_SEA });
ok(full3x3(L_SEA.x, L_SEA.y, L), "…and the sea layout's Standstill stands on a full 3x3 of L, so only its being the SEA layout can refuse it", L_SEA);
ok(full3x3(B_STAND.x, B_STAND.y, B) && (B_STAND.x !== B_CENTRE.x || B_STAND.y !== B_CENTRE.y), "B's Standstill stands on a full 3x3 of B, and not on B's centroid pixel", { B_STAND, B_CENTRE });
{
  // read back off the layer below's own file: B's rows match the sea layout's shape in every clause but `sea below`
  const below = fs.readFileSync(path.join(game, "map", "unitstacks.txt"), "utf8").split(/\r?\n/).map((l) => l.split(";"));
  const rowAt = (pid, type) => { const c = below.find((r) => +r[0] === pid && +r[1] === type); return c ? { x: +c[2], z: +c[4] } : null; };
  const on9 = (pid) => { const a = rowAt(pid, 38), b = rowAt(pid, 9); return !!a && !!b && a.x === b.x && a.z === b.z; };
  ok(on9(L) && on9(B), "…and B's type 38 stands on its type 9 below, as L's sea layout's does — only B's being LAND below keeps its Standstill", { L38: rowAt(L, 38), B9: rowAt(B, 9), B38: rowAt(B, 38) });
}

console.log("\n-- the helpers, asked directly --");
if (typeof md.unitStandstills !== "function" || typeof md.townPointOf !== "function") ok(false, "map-data.js exports unitStandstills and townPointOf");
else {
  // Generate land's first write makes L and B land in the mod; asked before that, nothing is land yet, so ask it the way it will stand
  const raised = (tag, stacks) => {
    const m = makeMod(tag, { stacks });
    write(m, "map/definition.csv", ["0;0;0;0;land;false;unknown;0", `1;${COLOUR[1].join(";")};sea;false;ocean;0`, `2;${COLOUR[2].join(";")};land;false;plains;1`, `3;${COLOUR[3].join(";")};land;false;plains;1`, `4;${COLOUR[4].join(";")};sea;false;ocean;0`].join("\n") + "\n");
    return m;
  };
  const st = md.unitStandstills({ modRoot: raised("probe", unitstacks()), gameRoot: game, dependencyRoots: [], provinces: [L, B, SEA] });
  ok(st.get(L) && st.get(L).seaLayout === true && Math.abs(st.get(L).x - L_SEA_STANDSTILL.x) < 0.005, "⭐ L, land now and sea below with the layer below's rows unchanged, still carries the SEA layout", st.get(L));
  ok(st.get(B) && st.get(B).seaLayout === false, "…B, land below as well, carries a land layout", st.get(B));
  // ⛔ …and the other clauses, each answering alone — the auto-fix that moves these Standstills (the design's Fix 5) is built on this
  // fingerprint. Measured on TEST 31 over vanilla, from the files, while it also asked that the layer below's 38 stand on its 9: the
  // five together 1,490 provinces; `land now` dropped, 3,112 (every sea province the mod left alone); `sea below` dropped, 3,842.
  // Without that fifth clause, as it is now, 1,500.
  ok(st.get(SEA) && st.get(SEA).seaLayout === false, "…the sea itself — the layer below's rows unchanged, its 38 on its 9 — is not land that came up", st.get(SEA));
  const L_MARKER = { x: 60.5, z: 30.5 };
  ok(L_MARKER.x !== L_SLOT.x || L_MARKER.z !== L_SLOT.z, "(the fixture: a victory point marker for L that is off L's default slot)", { L_MARKER, L_SLOT });
  const sOwn = md.unitStandstills({ modRoot: raised("probe-own-marker", unitstacks({ l38: L_MARKER })), gameRoot: game, dependencyRoots: [], provinces: [L] }).get(L);
  ok(sOwn && sOwn.seaLayout === false && sOwn.x === L_SEA_STANDSTILL.x && sOwn.z === L_SEA_STANDSTILL.z, "…L with only its victory point marker (type 38) moved by the modder is laid out, its Standstill the layer below's still", sOwn);
  // ⛔ Paradox placed the marker of 21 of vanilla's 3,133 sea provinces by hand (38 off 9), and land raised from one carries the
  // sea's rows all the same: they were placed for a sea. This check asserted the opposite until the review of 12a2bab — the
  // fingerprint asked for the layer below's 38 on its 9, and ten of TEST 31's provinces stayed on the sea's layout behind it,
  // province 2230's star 9.72 px from its station. The same rows in the mod and below, as L's above, so only that slot differs.
  // B there is laid out the way the rest of vanilla's land is, a victory point's marker off its default slot: land below keeps it.
  const B_MARKER = { x: 12, z: 20 }, handLaidStacks = unitstacks({ l38: L_MARKER, b38: B_MARKER });
  const handLaid = path.join(ROOT, "game-hand-laid");
  fs.cpSync(game, handLaid, { recursive: true });
  write(handLaid, "map/unitstacks.txt", handLaidStacks);
  const hand = md.unitStandstills({ modRoot: raised("probe-hand-laid", handLaidStacks), gameRoot: handLaid, dependencyRoots: [], provinces: [L, B] }), sHand = hand.get(L);
  ok(sHand && sHand.seaLayout === true && sHand.markerNeverLaidOut === false && sHand.x === L_SEA_STANDSTILL.x && sHand.z === L_SEA_STANDSTILL.z, "⭐ …and L over a layer below that placed its sea marker by hand (38 off 9), rows unchanged, carries the sea's layout all the same", sHand);
  ok((B_MARKER.x !== B_SLOT.x || B_MARKER.z !== B_SLOT.z) && hand.get(B) && hand.get(B).seaLayout === false, "…B there, land below with a victory point's marker (38 off 9), does not", hand.get(B));
  // townPointOf takes provinceExtents' shape; built here from the fixture's own pixels
  const cnt = new Map(), sumX = new Map(), sumY = new Map(), box = new Map();
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const id = provAt(x, y); cnt.set(id, (cnt.get(id) || 0) + 1); sumX.set(id, (sumX.get(id) || 0) + x); sumY.set(id, (sumY.get(id) || 0) + y);
    const b = box.get(id); if (!b) box.set(id, { minX: x, maxX: x, minY: y, maxY: y }); else { b.minX = Math.min(b.minX, x); b.maxX = Math.max(b.maxX, x); b.minY = Math.min(b.minY, y); b.maxY = Math.max(b.maxY, y); }
  }
  const ex = { W, H, pidAt: provAt, cnt, sumX, sumY, box };
  const own = (id) => id === L || id === B;
  const tL = md.townPointOf({ pid: L, ex, standstill: st.get(L), standstillIsSeaLayout: true, ownLand: own });
  ok(tL && tL.rule === 2 && tL.x === L_TOWN.x && tL.z === zOf(L_TOWN.y), "townPointOf(L): its own pixel nearest its centroid (rule 2)", tL);
  const tL1 = md.townPointOf({ pid: L, ex, standstill: st.get(L), standstillIsSeaLayout: false, ownLand: own });
  ok(tL1 && tL1.rule === 1 && tL1.x === st.get(L).x, "…and the same Standstill NOT flagged as the sea layout would be taken (rule 1) — the flag is what refuses it", tL1);
  const tB = md.townPointOf({ pid: B, ex, standstill: st.get(B), standstillIsSeaLayout: false, ownLand: own });
  ok(tB && tB.rule === 1 && tB.x === B_STANDSTILL.x && tB.z === B_STANDSTILL.z, "townPointOf(B): its Standstill, unchanged (rule 1)", tB);
  const tOff = md.townPointOf({ pid: B, ex, standstill: { x: 2.5, z: 17.5 }, standstillIsSeaLayout: false, ownLand: own });
  ok(tOff && tOff.rule === 2 && tOff.x === B_CENTRE.x && tOff.z === zOf(B_CENTRE.y), "…a Standstill standing on the sea beside B is not taken: its centroid pixel instead", tOff);
}

console.log("\n-- ⭐ Generate land: the rows stand on the town points and the cities grow round them --");
const pixelOf = (r) => ({ x: r.px, y: r.row });
function generate(tag, stacks) {
  const m = makeMod(tag, { stacks });
  // #a-generated-coast-is-not-the-oceans-border — roughenCoast: false. This file is about town points, and every answer it checks
  // (L's centroid pixel, the province under each row, the 40 px cores) is read off the fixture's own drawing; the coast step reshapes
  // L's shore first (259 px on this seed, a cape under rows 36..38,22) and the drawing would no longer be the map. That the rows
  // follow the reshaped coast is test-a-rough-coast-leaves-every-station-and-star-on-its-province.js's to pin.
  const r = md.generateLand({ modRoot: m, gameRoot: game, dependencyRoots: [], count: 2, provincesPerState: 8, seed: 1, roughenCoast: false, splitLargeProvinces: false });   // #a-raised-province-is-cut-to-land-size: not this test's subject — its fixture's cells are its provinces, and the cut would add more
  const sid = r && r.newStates && r.newStates[0] && r.newStates[0].id;
  return { m, r, sid, rows: sid ? rowsOf(m, sid) : [], at: read8(path.join(m, "map", "terrain.bmp")) };
}
const coreOf = (at, pid) => pixelsOf(pid).filter((p) => at(p.x, p.y) === SPAWN);
const hasPixel = (list, p) => list.some((q) => q.x === p.x && q.y === p.y);
{
  // the owner's flow: the mod owns a copy of the layer below's unitstacks.txt (Auto-fix's unit-stack repair takes one in)
  const g = generate("mod", unitstacks());
  ok(g.r && g.r.changed && g.r.createdStates === 1 && g.sid > 0, "Generate land raised L and B into one state", g.r && (g.r.error || { states: g.r.createdStates }));
  const sn = g.rows.filter((r) => r.type === "supply_node");
  const onL = sn.filter((r) => provAt(r.px, r.row) === L), onB = sn.filter((r) => provAt(r.px, r.row) === B);
  ok(sn.length === 2 && onL.length === 1 && onB.length === 1, "one supply_node row in each province", sn);
  ok(onL[0] && onL[0].x === L_TOWN.x && onL[0].z === zOf(L_TOWN.y), "⭐⭐ L's supply_node row stands on L's own centroid pixel — not on the sea layout the layer below left there", { row: onL[0], want: L_TOWN });
  ok(onB[0] && onB[0].x === B_STANDSTILL.x && onB[0].z === B_STANDSTILL.z, "⭐⭐ B's supply_node row stands exactly on B's Standstill, 0 px — vanilla's own convention", { row: onB[0], want: B_STANDSTILL });
  const perProv = md.PER_LAND_PROVINCE_BUILDING_SLOTS;
  // ⚠️ MOVED with ⛔ #a-fort-stands-off-its-depot: every per-province row stood on the town point; the supply_node is the station and
  // stays, the fort and the special-project site each take a point of their own in the same province
  const sites = perProv.filter((t) => t !== "supply_node");
  ok(sites.length === perProv.length - 1 && sites.every((t) => {
    const rs = g.rows.filter((r) => r.type === t), inL = rs.filter((r) => provAt(r.px, r.row) === L), inB = rs.filter((r) => provAt(r.px, r.row) === B);
    return rs.length === 2 && inL.length === 1 && inB.length === 1 && !(inL[0].x === L_TOWN.x && inL[0].z === zOf(L_TOWN.y)) && !(inB[0].x === B_STANDSTILL.x && inB[0].z === B_STANDSTILL.z);
  }),
    `…and the other per-province rows (${sites.join(", ")}) stand in the same province, one each, off its town point`, g.rows.filter((r) => sites.includes(r.type)));
  ok(g.rows.length > 0 && g.rows.every((r) => provAt(r.px, r.row) === L || provAt(r.px, r.row) === B), "#a-building-over-water — no row of the state stands over water or off its land", g.rows.filter((r) => provAt(r.px, r.row) === SEA));
  ok(g.rows.filter((r) => perProv.includes(r.type)).every((r) => full3x3(r.px, r.row, provAt(r.px, r.row))), "…and every per-province row stands on a full 3x3 of its own province");
  const cL = coreOf(g.at, L), cB = coreOf(g.at, B);
  ok(cL.length === CORE_BELOW && cB.length === CORE_BELOW, "(both are towns, each with the layer below's 40 px core)", { L: cL.length, B: cB.length });
  ok(hasPixel(cL, L_TOWN), "⭐⭐ L's city core grows round its town point — where its station and its supply_node row stand", { core: cL.slice(0, 6), want: L_TOWN, deepest: L_DEEP });
  ok(hasPixel(cB, B_STAND), "⭐ B's city core grows round its Standstill", { want: B_STAND });
  const cities = g.r.heightmap && g.r.heightmap.terrain && g.r.heightmap.terrain.cities;
  ok(cities && cities.provinces === 2 && cities.atTownPoint === 2, "the painter says both cores were seeded at their town points", cities);
}
{
  // a mod that never took a copy in reads the layer below's rows — still the sea layout, derived, not assumed from ownership
  const g = generate("mod-inherits", null);
  const onL = g.rows.filter((r) => r.type === "supply_node" && provAt(r.px, r.row) === L);
  ok(onL.length === 1 && onL[0].x === L_TOWN.x && onL[0].z === zOf(L_TOWN.y), "⭐ with no unitstacks.txt of its own the mod reads the layer below's, and L's row still leaves the sea layout", onL);
}
{
  // the modder laid L out themselves (a row that differs from the layer below's), and moved B's Standstill off B onto the sea
  const L_MINE = { x: 40.25, z: 30.4 }, B_WET = { x: 2.5, z: 17.5 };
  ok(full3x3(Math.floor(L_MINE.x), rowOf(L_MINE.z), L) && provAt(Math.floor(B_WET.x), rowOf(B_WET.z)) === SEA, "(the fixture: the modder's L Standstill is on a full 3x3 of L, their B Standstill on the sea)");
  const g = generate("mod-laid-out", unitstacks({ l0: L_MINE, b0: B_WET }));
  const sn = g.rows.filter((r) => r.type === "supply_node");
  const onL = sn.filter((r) => provAt(r.px, r.row) === L), onB = sn.filter((r) => provAt(r.px, r.row) === B);
  ok(onL.length === 1 && onL[0].x === L_MINE.x && onL[0].z === L_MINE.z, "⭐⭐ a Standstill the modder placed is theirs: L's row stands on it, not on L's centroid pixel", { row: onL[0], want: L_MINE });
  ok(hasPixel(coreOf(g.at, L), { x: Math.floor(L_MINE.x), y: rowOf(L_MINE.z) }), "…and L's city grows round it", L_MINE);
  ok(onB.length === 1 && onB[0].x === B_CENTRE.x && onB[0].z === zOf(B_CENTRE.y), "⭐⭐ a Standstill off the province is not used: B's row stands on B's centroid pixel, not on the sea", { row: onB[0], want: B_CENTRE });
  ok(sn.length === 2 && sn.every((r) => provAt(r.px, r.row) !== SEA), "#a-building-over-water — no supply_node row over water", sn);
}

console.log("\n-- ⭐ a town point that did not come up with the land does not seed the core --");
{
  // The painter paints only the pixels that crossed the waterline. A town only half of which came up, its town point in the half
  // that did not: a core seeded there is never painted and grows only through crossed neighbours — none, that deep — so the town
  // would carry no city ground at all. It grows from the deepest crossed pixel instead, as a town with no town point does.
  const ys = pixelsOf(B).map((p) => p.y), top = Math.min(...ys), bottom = Math.max(...ys), mid = (top + bottom + 1) / 2;
  const up = (x, y) => provAt(x, y) === B && y < mid;   // B's top half came up: 98 px, more than the 40 px core
  const halfUp = (tag, tp) => {
    const m = makeMod(tag);
    write(m, "map/definition.csv", ["0;0;0;0;land;false;unknown;0", `1;${COLOUR[1].join(";")};sea;false;ocean;0`, `2;${COLOUR[2].join(";")};sea;false;ocean;0`, `3;${COLOUR[3].join(";")};land;false;urban;1`, `4;${COLOUR[4].join(";")};sea;false;ocean;0`].join("\n") + "\n");
    const mask = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (up(x, y)) mask[y * W + x] = 1;
    const pr = md.paintProvincesInTerrainBmp({ modRoot: m, gameRoot: game, dependencyRoots: [], provinceIds: [B], crossed: { W, H, mask }, townPoints: new Map([[B, { x: tp.x, z: zOf(tp.y) }]]) });
    return { pr, cities: (pr && pr.cities) || {}, core: coreOf(read8(path.join(m, "map", "terrain.bmp")), B) };
  };
  const nine = (p, fn) => { for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (!fn(p.x + dx, p.y + dy)) return false; return true; };
  const DOWN = { x: B_CENTRE.x, y: bottom - 2 }, UP = { x: B_CENTRE.x, y: top + 2 };
  ok(nine(DOWN, (x, y) => provAt(x, y) === B && !up(x, y)) && nine(UP, up), "(the fixture: one town point with its whole 3x3 in the half that stayed down, one with its whole 3x3 in the half that came up)", { DOWN, UP, mid });
  const hi = halfUp("mod-half-up-high", UP);
  ok(hi.cities.atTownPoint === 1 && hi.core.length === CORE_BELOW && hasPixel(hi.core, UP), "CONTROL: a town point in the half that came up seeds the core", { cities: hi.cities, core: hi.core.length });
  const lo = halfUp("mod-half-up-low", DOWN);
  ok(lo.core.length === CORE_BELOW && lo.core.every((p) => up(p.x, p.y)), "⭐⭐ a town point in the half that stayed down: the half that came up still carries the layer below's 40 px core", { core: lo.core.length, pr: lo.pr && (lo.pr.error || lo.pr.reason) });
  const deepUp = deepestPixel(B, up);
  ok(hasPixel(lo.core, deepUp) && lo.cities.provinces === 1 && !lo.cities.atTownPoint, "⭐ …grown from the deepest pixel that came up, and the painter does not say it was seeded at the town point", { deepUp, cities: lo.cities });
}

console.log("\n-- ⭐ the same rows for every other caller of the slot writer --");
{
  // createState, Auto-fix's slot repair, the over-water repair and a province move call ensureBuildingSlotsForState with no town
  // points: it asks the same helper itself. A mod over the layer below that makes a new state of B, land below and in the mod.
  const m = path.join(ROOT, "mod-new-state");
  write(m, "descriptor.mod", 'name="new state"\n');
  const r = md.ensureBuildingSlotsForState({ modRoot: m, gameRoot: game, dependencyRoots: [], stateId: 60, provinces: [B] });
  const sn = r && r.changed ? rowsOf(m, 60).filter((x) => x.type === "supply_node") : [];
  ok(r && r.changed && sn.length === 1 && sn[0].x === B_STANDSTILL.x && sn[0].z === B_STANDSTILL.z, "⭐⭐ a new state's supply_node row stands on its province's Standstill", { r: r && (r.error || r.reason || r.added), sn });
}

try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) { /* scratch only */ }
console.log("\n" + (fail ? "FAILED " + fail + "/" + (pass + fail) : "PASSED " + pass + "/" + pass));
process.exitCode = fail ? 1 : 0;
