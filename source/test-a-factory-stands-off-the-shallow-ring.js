// ⛔ #a-factory-stands-off-the-shallow-ring — A FACTORY NOVA PLACES STANDS OFF ITS STATE'S SHORE, NOT ON THE RING THE GAME DRAWS UNDER
// SHALLOW WATER.
//
// Generate land raises every land pixel with a water 4-neighbour to height 94 — under HOI4's 95 waterline, so the game draws that
// ring of the coast under shallow water — and it writes the state's rows before that raise, so a row read off the heights cannot see
// it. A position's 3x3 is the state's land (#a-building-over-water), but a pixel of it may be on that ring, and a factory stepped one
// pixel aside onto it stands in the water: on the owner's flow (TEST 34 audit L12; the TEST 35 rehearsal alike) 109 of 6,486
// civilian factory rows stood on a shore pixel (1.7%; the base game 13, 0.2%) and 3.8% of the drawn ones had more than a quarter of
// their model on it (the base game 2.6%). So buildingSpreadPositions marks a position `shore` where its 3x3 is not wholly off the shore
// (shoreFreeAround: every pixel of it with land on all four sides — the geometric shore is the ring the raise makes), the factories
// go round such a position where they have another (stateSlotLayout), and a spot of its own (provinceSiteSpots, for a pile's rows and
// the rows the positions have no room for) is one off the shore before one on it. The positions themselves stay where they stood, so
// the air base's spot is what it was.
//
//   1. Over the installed base game (SKIPS without it): fewer than 1% of its factory rows stand on a shore pixel.
//   2. A coastal state of two provinces: the CONTROL — the ring point the old rule takes, the furthest out whose 3x3 is the state's
//      land, has a shore pixel in its 3x3 for some direction — then the positions are the old rule's, each that has one is marked `shore`, no
//      factory row stands on such a position (a stepped copy within a pixel of it), none (a stepped copy included) on a shore pixel,
//      and no factory's model (its reach, at its written rotation, this test's own sampler) holds more than a quarter of shore.
//   2b. provinceSiteSpots, pure, for a state's own rows round a town point on its coast: the CONTROL — asked without `isLand`, a spot
//      has a shore pixel in its 3x3 — then, asked with it, no spot does; and siteSpotRows, which a pile's rows and the rows the
//      positions have no room for take, asks it: the CONTROL, its answer for the coastal state's own read with `typeOf` taken out,
//      has a spot on the shore, its answer for the read has none.
//   2c. provinceSiteSpots on a 7 x 7 island: the pixels off the shore are taken before any on it, though they stand a pixel apart —
//      the base game stands the rows of a state under 100 px a median 0 px from the nearest.
//   3. The same click on a second copy writes the same bytes.
// Binds no port. Run: node test-a-factory-stands-off-the-shallow-ring.js
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-off-the-shore-"));
process.env.APPDATA = path.join(ROOT, "appdata"); process.env.NOVA_APP_DATA_DIR = process.env.APPDATA; process.env.XDG_CONFIG_HOME = process.env.APPDATA;
process.env.NOVA_HOME_DIR = path.join(ROOT, "home");
fs.mkdirSync(process.env.APPDATA, { recursive: true });
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
function bmp8(W, H, fn) {
  const rs = Math.floor((8 * W + 31) / 32) * 4, off = 54 + 1024, b = Buffer.alloc(off + rs * H);
  b.write("BM", 0, "ascii"); b.writeUInt32LE(b.length, 2); b.writeUInt32LE(off, 10); b.writeUInt32LE(40, 14);
  b.writeInt32LE(W, 18); b.writeInt32LE(H, 22); b.writeUInt16LE(1, 26); b.writeUInt16LE(8, 28); b.writeUInt32LE(rs * H, 34); b.writeUInt32LE(256, 46);
  for (let i = 0; i < 256; i++) { b[54 + i * 4] = i; b[54 + i * 4 + 1] = i; b[54 + i * 4 + 2] = i; }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) b[off + (H - 1 - y) * rs + x] = fn(x, y);
  return b;
}
const FACTORY = new Set(["industrial_complex", "arms_factory"]);

// ── 1. the base game ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
console.log("\n=== 1. the base game keeps its factories off the shore ===");
const GAME = process.env.HOI4_ROOT || "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
if (!["map/provinces.bmp", "map/buildings.txt", "map/definition.csv"].every((f) => fs.existsSync(path.join(GAME, f)))) console.log("  SKIP: no Hearts of Iron IV install at " + GAME + " — section 1 did not run");
else {
  const buf = fs.readFileSync(path.join(GAME, "map", "provinces.bmp"));
  const off = buf.readUInt32LE(10), GW = buf.readInt32LE(18), GH = buf.readInt32LE(22), rs = Math.floor((24 * GW + 31) / 32) * 4;
  const byColour = new Map(), type = new Map();
  for (const l of fs.readFileSync(path.join(GAME, "map", "definition.csv"), "latin1").split(/\r?\n/)) {
    const c = l.split(";");
    if (c.length < 5 || !/^\d+$/.test(c[0]) || +c[0] === 0) continue;
    byColour.set(((+c[1] << 16) | (+c[2] << 8) | +c[3]) >>> 0, +c[0]); type.set(+c[0], c[4].trim().toLowerCase());
  }
  const land = (x, row) => { if (row < 0 || row >= GH) return true; const o = off + (GH - 1 - row) * rs + (((x % GW) + GW) % GW) * 3; return type.get(byColour.get(((buf[o + 2] << 16) | (buf[o + 1] << 8) | buf[o]) >>> 0)) === "land"; };
  let n = 0, onShore = 0;
  for (const l of fs.readFileSync(path.join(GAME, "map", "buildings.txt"), "latin1").split(/\r?\n/)) {
    const c = l.split(";");
    if (c.length < 7 || !FACTORY.has(c[1])) continue;
    const x = Math.floor(+c[2]), row = GH - 1 - Math.floor(+c[4]);
    n++;
    if (land(x, row) && !(land(x + 1, row) && land(x - 1, row) && land(x, row - 1) && land(x, row + 1))) onShore++;
  }
  ok(n > 10000 && onShore / n < 0.01, `the base game stands ${onShore} of its ${n} factory rows (${(100 * onShore / n).toFixed(2)}%) on a shore pixel — under 1%`, { n, onShore });
}

// ── the fixture: rectangles [x0, y0, x1, y1) on a 48 x 40 sea (province 1), rows top-down ────────────────────────────────────
const W = 48, H = 40, SEA = 1;
// state 1: a 10 x 14 province, whose ring is on its shore, and a 20 x 20 one, whose ring is off it; the sea all round them
const RECT = { 2: [4, 6, 14, 20], 3: [14, 4, 34, 24] };
const STATES = { 1: [2, 3] };
const provAt = (x, y) => { for (const [p, [x0, y0, x1, y1]] of Object.entries(RECT)) if (x >= x0 && x < x1 && y >= y0 && y < y1) return +p; return SEA; };
const isLand = (x, y) => y < 0 || y >= H || provAt(((x % W) + W) % W, y) !== SEA;
const shore = (x, y) => provAt(x, y) !== SEA && !(isLand(x + 1, y) && isLand(x - 1, y) && isLand(x, y - 1) && isLand(x, y + 1));
const shoreIn3x3 = (x, y) => [-1, 0, 1].some((dy) => [-1, 0, 1].some((dx) => shore(x + dx, y + dy)));
const own3x3 = (x, y) => [-1, 0, 1].every((dy) => [-1, 0, 1].every((dx) => STATES[1].includes(provAt(x + dx, y + dy))));
const colour = (p) => [(p * 37) % 256, (p * 71) % 256, 40 + p];
const heightOf = (x, y) => (provAt(x, y) === SEA ? 80 : 110 + ((x * 3 + y * 5) % 80));
function makeMod(dir) {
  write(dir, "descriptor.mod", 'name="off-the-shore"\nreplace_path="history/states"\nreplace_path="map"\n');
  write(dir, "map/provinces.bmp", bmp24(W, H, (x, y) => colour(provAt(x, y))));
  write(dir, "map/heightmap.bmp", bmp8(W, H, heightOf));
  write(dir, "map/definition.csv", ["0;0;0;0;land;false;unknown;0", `1;${colour(1).join(";")};sea;false;ocean;0`]
    .concat(Object.keys(RECT).map((p) => `${p};${colour(+p).join(";")};land;true;plains;1`)).join("\n") + "\n");
  for (const [s, provs] of Object.entries(STATES)) write(dir, `history/states/${s}-S.txt`, `state = {\n\tid = ${s}\n\tname = "STATE_${s}"\n\tmanpower = 1000\n\tstate_category = rural\n\tprovinces = { ${provs.join(" ")} }\n\thistory = {\n\t\towner = AAA\n\t}\n}\n`);
  write(dir, "map/buildings.txt", "99;radar_station;1.00;9.50;1.00;0.00;0\n");
}
const modA = path.join(ROOT, "a"), modB = path.join(ROOT, "b");
makeMod(modA); makeMod(modB);
const rootsA = { modRoot: modA, gameRoot: path.join(ROOT, "no-game"), dependencyRoots: [] };
const readRows = (dir) => fs.readFileSync(path.join(dir, "map", "buildings.txt"), "utf8").split(/\r?\n/).filter(Boolean).map((l) => l.split(";")).filter((c) => c.length >= 7)
  .map((c) => { const x = +c[2], z = +c[4]; return { sid: +c[0], type: c[1], x, z, rot: +c[5], px: Math.floor(x), row: H - 1 - Math.floor(z) }; });
const pix = (t) => ({ px: Math.floor(t.x), row: H - 1 - Math.floor(t.z) });
/** this test's own sampler: the share of the model of `reach` at (x, z) turned `a` counter-clockwise (x east, z north) over shore pixels */
const shoreShare = (x, z, a, reach) => {
  const cs = Math.cos(a), sn = Math.sin(a), st = 0.1;
  let n = 0, k = 0;
  for (let u = -reach.west + st / 2; u < reach.east; u += st) for (let v = -reach.south + st / 2; v < reach.north; v += st) {
    const X = x + u * cs - v * sn, Z = z + u * sn + v * cs, row = H - 1 - Math.floor(Z), col = Math.floor(X);
    n++;
    if (row >= 0 && row < H && col >= 0 && col < W && shore(col, row)) k++;
  }
  return k / n;
};

console.log("\n=== 2. a coastal state: its positions and its factories stand off the shore ===");
const towns = md.stateBuildingAnchor({ ...rootsA, provinces: STATES[1], each: true, stateId: 1 });
// the old rule, worked out here: per province and direction, the ring point furthest out (6 px in to 3) whose 3x3 is the state's land
const NEAR = md.BUILDING_RING_NEAR, FAR = 6;
const oldRing = [];
for (const p of STATES[1]) {
  const t = towns.get(p); if (!t) continue;
  const T = pix(t);
  for (const [dx, dy] of [[1, 0], [0, -1], [-1, 0], [0, 1]]) for (let r = FAR; r >= NEAR; r--) { const q = { px: T.px + dx * r, row: T.row + dy * r }; if (provAt(q.px, q.row) === p && own3x3(q.px, q.row)) { oldRing.push(q); break; } }
}
ok(oldRing.length > 0 && oldRing.some((q) => shoreIn3x3(q.px, q.row)), `CONTROL: the old rule's ring points (${oldRing.length}) include one whose 3x3 has a shore pixel`, oldRing.filter((q) => shoreIn3x3(q.px, q.row)));
const pos = md.stateBuildingAnchor({ ...rootsA, provinces: STATES[1], positions: true, stateId: 1 });
const P = ((pos && pos.positions) || []).map(pix);
ok(P.length >= 3 && md.stateSlotLayout(pos) !== null, `(the fixture: ${P.length} positions, laid out)`, P.length);
const wetP = P.filter((q) => shoreIn3x3(q.px, q.row));
const key = (q) => q.px + "," + q.row;
ok(P.length > 0 && P.every((q) => oldRing.some((o) => key(o) === key(q))), `the positions (${P.length}) stand where the old rule stood them: the air base's spot and every other type's are what they were`, { P, oldRing });
ok(wetP.length > 0 && wetP.length < P.length, `(the fixture: ${wetP.length} of the ${P.length} positions have a shore pixel in their 3x3)`, wetP);
ok(pos.positions.every((p) => !!p.shore === shoreIn3x3(pix(p).px, pix(p).row)), "…and each that has one is marked `shore`, and no other", pos.positions.filter((p) => !!p.shore !== shoreIn3x3(pix(p).px, pix(p).row)));
const fixed = md.fixStatesWithoutBuildingSlots(rootsA);
ok(fixed && fixed.fixed === 1, "Auto-fix's slot pass furnishes the state", fixed);
const fac = readRows(modA).filter((r) => r.sid === 1 && FACTORY.has(r.type));
ok(fac.length === 12, "(its 12 factory rows)", fac.length);
const onWet = fac.filter((r) => wetP.some((q) => Math.abs(q.px - r.px) <= 1 && Math.abs(q.row - r.row) <= 1));
ok(wetP.length > 0 && !onWet.length, `⭐⭐ no factory row stands on (a pixel aside of) one of the ${wetP.length} positions on the shore — the state has others`, onWet.map((r) => [r.type, r.px, r.row]));
const dryP = P.filter((q) => !shoreIn3x3(q.px, q.row));
// ⚠️ MOVED with ⛔ #a-factorys-copy-stands-on-a-spot-of-its-own: a factory's copy on a position its kind took already takes a spot of its
// own where the land has a good one — here, whose positions off the shore have room round them, a 3x3 of the state's land with no
// shore pixel, 2 px or more from every factory row and BUILDING_RING_NEAR px from every other row — so a factory stands on (a pixel
// aside of) a position off the shore, or on such a spot
const others = readRows(modA).filter((r) => r.sid === 1);
// (the row itself the one row of the state's that near it — `others` is a read of its own, so counted, not compared)
const cheb = (a, b) => Math.max(Math.abs(a.px - b.px), Math.abs(a.row - b.row));
const ownDry = (r) => own3x3(r.px, r.row) && !shoreIn3x3(r.px, r.row) && others.filter((o) => cheb(o, r) < (FACTORY.has(o.type) ? 2 : NEAR)).length === 1;
const offLayout = fac.filter((r) => !dryP.some((q) => Math.abs(q.px - r.px) <= 1 && Math.abs(q.row - r.row) <= 1));
ok(offLayout.every(ownDry), "⭐ …each stands on (a pixel aside of) one of its positions off the shore — the lists go round — or on a dry spot of its own, clear of the rest", offLayout.filter((r) => !ownDry(r)).map((r) => [r.type, r.px, r.row]));
ok(fac.filter((r) => !offLayout.includes(r)).length >= 2, "(…the first of each kind on its layout's positions)", fac.length - offLayout.length);
ok(fac.every((r) => !shore(r.px, r.row)), "⭐⭐ no factory row — a stepped copy included — stands on a shore pixel", fac.filter((r) => shore(r.px, r.row)).map((r) => [r.type, r.px, r.row]));
const heavy = fac.filter((r) => shoreShare(r.x, r.z, r.rot, md.LAND_ROW_REACH[r.type]) > 0.25);
ok(!heavy.length, "⭐ no factory's model, turned as written, holds more than a quarter of shore", heavy.map((r) => [r.type, r.px, r.row, shoreShare(r.x, r.z, r.rot, md.LAND_ROW_REACH[r.type]).toFixed(2)]));

console.log("\n=== 2b. a spot of its own (provinceSiteSpots) stands off the shore where the land has room ===");
{
  // a 16 x 16 province 1 on a 20 x 20 sea (province 0), its town point in the corner: rows top-down
  const SW = 20, SH = 20;
  const pidOf = (x, r) => (x >= 2 && x <= 17 && r >= 2 && r <= 17 ? 1 : 0);
  const ex = { W: SW, H: SH, pidAt: (x, r) => pidOf(x, r), box: new Map([[1, { minX: 2, maxX: 17, minY: 2, maxY: 17 }]]) };
  const land = (x, r) => r < 0 || r >= SH || pidOf(((x % SW) + SW) % SW, r) === 1;
  const sh = (x, r) => land(x, r) && !(land(x + 1, r) && land(x - 1, r) && land(x, r - 1) && land(x, r + 1));
  const wet = (s) => { const x = Math.floor(s.x), r = SH - 1 - Math.floor(s.z); return [-1, 0, 1].some((dy) => [-1, 0, 1].some((dx) => sh(x + dx, r + dy))); };
  const town = { x: 3.5, z: SH - 1 - 3 + 0.5 };
  const reaches = Array.from({ length: 8 }, (_, i) => md.LAND_ROW_REACH[i % 2 ? "arms_factory" : "industrial_complex"]);
  const ask = (isLand) => md.provinceSiteSpots({ ex, pids: [1], town, ownLand: (p) => p === 1, kept: [], runways: [], reaches, from: md.SITE_FROM_TOWN, isLand });
  const before = ask(null), now = ask((p) => p === 1);
  ok(before.length === 8 && before.some(wet), `CONTROL: asked without isLand, ${before.filter(wet).length} of its ${before.length} spots have a shore pixel in their 3x3`, before.filter(wet));
  ok(now.length === 8 && !now.some(wet), "⭐⭐ asked with isLand, every spot's 3x3 is off the shore", now.filter(wet));
  ok(typeof md.shoreFreeAround === "function" && md.shoreFreeAround({ W: SW, H: SH, pidAt: ex.pidAt, isLand: (p) => p === 1 }, 4, 4) && !md.shoreFreeAround({ W: SW, H: SH, pidAt: ex.pidAt, isLand: (p) => p === 1 }, 3, 4),
    "(shoreFreeAround: the pixel 2 in from the coast is off the shore, the one 1 in is not)");
}

{
  // siteSpotRows over the coastal state of section 2, round the state's town point (rows Nova would write for a pile or a shared spot)
  const wanted = Array.from({ length: 10 }, (_, i) => ({ type: i % 2 ? "arms_factory" : "industrial_complex" }));
  const spotsOf = (p) => [...md.siteSpotRows({ ...rootsA, pos: p, provinces: STATES[1], anchors: towns, runway: null, wanted, kept: [], from: md.SITE_FROM_TOWN }).values()];
  const wet = (s) => { const q = pix(s); return shoreIn3x3(q.px, q.row); };
  const blind = spotsOf({ ...pos, typeOf: undefined }), seen = spotsOf(pos);
  ok(blind.length === 10 && blind.some(wet), `CONTROL: siteSpotRows, its read's typeOf taken out, stands ${blind.filter(wet).length} of its ${blind.length} spots with a shore pixel in their 3x3`, blind.filter(wet).map(pix));
  ok(seen.length === 10 && !seen.some(wet), "⭐⭐ siteSpotRows over the state's own read stands every spot off the shore", seen.filter(wet).map(pix));
}

{
  // a 7 x 7 island, its town point in the middle: its only pixels whose 3x3 is off the shore are the 3 x 3 round the town point, each
  // a pixel from it, and the pixels 2 px out have room round them but the shore in their 3x3
  const IW = 11, IH = 11, inI = (x, r) => x >= 2 && x <= 8 && r >= 2 && r <= 8;
  const exI = { W: IW, H: IH, pidAt: (x, r) => (inI(x, r) ? 7 : 6), box: new Map([[7, { minX: 2, maxX: 8, minY: 2, maxY: 8 }]]) };
  const landI = (x, r) => inI(x, r), shI = (x, r) => landI(x, r) && !(landI(x + 1, r) && landI(x - 1, r) && landI(x, r - 1) && landI(x, r + 1));
  const wetI = (s) => { const x = Math.floor(s.x), r = IH - 1 - Math.floor(s.z); return [-1, 0, 1].some((dy) => [-1, 0, 1].some((dx) => shI(x + dx, r + dy))); };
  const townI = { x: 5.5, z: IH - 1 - 5 + 0.5 };
  const reachesI = Array.from({ length: 10 }, (_, i) => md.LAND_ROW_REACH[i % 2 ? "arms_factory" : "industrial_complex"]);
  const spotsI = md.provinceSiteSpots({ ex: exI, pids: [7], town: townI, ownLand: (p) => p === 7, kept: [], runways: [], reaches: reachesI, from: md.SITE_FROM_TOWN, isLand: (p) => p === 7 });
  const dryI = spotsI.filter((s) => !wetI(s)).length;
  ok(spotsI.length === 10 && dryI === 8, `⭐⭐ a small island's rows take every pixel off the shore (8, all but the town point's) before one on it, though those stand a pixel apart: ${dryI} of ${spotsI.length}`, spotsI.map((s) => [Math.floor(s.x), IH - 1 - Math.floor(s.z), wetI(s)]));
}

console.log("\n=== 3. deterministic ===");
{
  const r2 = md.fixStatesWithoutBuildingSlots({ modRoot: modB, gameRoot: path.join(ROOT, "no-game"), dependencyRoots: [] });
  ok(r2 && r2.fixed === 1 && fs.readFileSync(path.join(modB, "map", "buildings.txt"), "utf8") === fs.readFileSync(path.join(modA, "map", "buildings.txt"), "utf8"),
    "⭐⭐ the same click on a second copy writes the same bytes", r2);
}

try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) { /* scratch only */ }
console.log("\n" + (fail ? "FAILED " + fail + "/" + (pass + fail) : "PASSED " + pass + "/" + pass));
process.exitCode = fail ? 1 : 0;
