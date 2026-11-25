// ⛔ #a-harbour-stands-on-ground-the-game-draws — A PORT AUTO-FIX ADDS STANDS WITH ITS WAREHOUSES ON GROUND THE GAME DRAWS AS LAND, NOT ON
// A SPIT OF BEACH THE GAME DRAWS AS SEA.
//
// The owner played TEST 38 (10-23): "most of the ports are fine, just few are not looking good" — a harbour standing offshore at Aldiler
// and harbours "floating" at Hutibresk. Both stood on the tip of a one-pixel spit of beach: height 94, under the water plane the game
// draws at 9.5 (gfx/FX/pdxwater.shader: alpha 1 − saturate((h̄ / 95.7 − 0.954) · 25), h̄ nine taps round the point), with the sea on
// three sides of it, so the game draws 0.84–0.87 of water over it and over all or nearly all of the model's land half (1.00 and 0.96 of
// it: its warehouses; its water arm is mesh −z, #a-harbour-faces-its-sea), the island 2–3 px behind. The base game's own port in
// Hutibresk's province stands on 98 at the spit's root. harbourSpot — the one chooser of every port Nova adds (fixCoastalNoPort) — never
// read the heightmap, and its gap key (BUILDING_RING_NEAR px off the fort, hub, HQ and dockyard standing nearest the depot) walked the
// port out along a jagged coast to the first pixel past them. TEST 38's drawn ports with the land half wholly afloat: 10 of 276 (3.6%),
// the base game 9 of 534 (1.7%).
// Now a pixel whose turned model has more than PORT_AFLOAT of its land half over water the game draws loses to one that has not —
// ahead of the models key, because Aldiler's one-province island carries every one of its state's 22 rows on its main body, and the
// models key alone took the drowned sliver 2 px off it.
// ⛔ …AND THE WATER IS READ WHERE THE GAME DRAWS IT (review PC-R1). The plane's uv puts texel i's centre at world x = i and blends
// between centres; the code read floor() of every sample, the pixel west and south of it — its coast pixel for a port facing south or
// west, the pixel behind it for one facing north or east. On TEST 38 the south-facing land halves read 0.243 afloat where the game
// draws 0.099, the north-facing 0.037 where it draws 0.096; refilled on TEST 38's own map, that key left 24 drawn ports more than half
// afloat and stood 4 of them there from drier spots, where reading the point leaves 1 (Todrim's: both its coast pixels are afloat) and
// moves none onto the water. The counts first given here (21 of 276 and 15 of 534, 73763c61) came from that reading (PC-R2).
//
//   0. Over the installed game (SKIPS without it): the formula and the nine taps waterDrawnOver reads are pdxwater.shader's own, and the
//      water plane is constants.fxh's WATER_HEIGHT, where the 94 beach stands under it; the plane's uv puts texel i's centre at world
//      x = i and the heightmap is filtered Linear — and waterDrawnOver reads a point between texel centres as this test's own nine
//      bilinear taps do (the code read floor() of it).
//   1. harbourSpot on Hutibresk's shape — a coast whose fort, hub, HQ and dockyard stand by the depot and a one-pixel spit of 94 past
//      them: CONTROL, without `waterAt` the port stands on the spit, its land half afloat (this test's own sampler); with it, on the
//      straight coast, its land half on land, 3 px or more off every coast row, the nearest the depot of all the coast pixels that are
//      (this test derives that set itself); the same answer whatever order the coast comes in.
//   2. harbourSpot on Aldiler's shape — a one-province island whose main body is under a model and a detached one-row sliver of 94 two
//      rows off it: CONTROL, without `waterAt` the models key takes the sliver; with it the port stands on the main body, its land half on
//      land (the afloat key is ahead of the models key).
//   3. fixCoastalNoPort on a fixture mod of 1's shape with a heightmap.bmp: the port it writes stands with its land half on land, on its
//      own coast, its column 7 the sea beside it, turned to it (coastFacing); CONTROL, the same mod over a heightmap that stands the spit
//      at 106 puts it on the spit — the heightmap is what moved it. The rows the file had stay byte for byte; a second copy, same bytes.
//   4. An islet that is all beach (every coast pixel afloat): it still gets exactly one port — a key that prefers, never one that refuses.
//   5. A square island with a one-pixel knob in the middle of each side, inland 97 (the generator's) and 106 (the base game's land):
//      CONTROL, the floor() reading answers the four alike knobs two ways — north and east dry, south and west afloat — while the shader
//      read at the sample point draws them alike; turnedModelAfloat gives the shader's reading on every one of the island's coast pixels.
//   6. Valavothesk's knob (TEST 38, state 730): an east-facing one-pixel knob whose land half floor() read as land and the game draws in
//      the sea, the nearest the depot of the coast clear of the coast rows: harbourSpot, and fixCoastalNoPort on a fixture mod, stand the
//      port off it on the nearest the shader draws dry; CONTROL, the same mod with no heightmap stands it on the knob.
// Binds no port. Run: node test-a-harbour-stands-on-ground-the-game-draws.js
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-harbour-ground-"));
process.env.APPDATA = path.join(ROOT, "appdata"); process.env.NOVA_APP_DATA_DIR = process.env.APPDATA; process.env.XDG_CONFIG_HOME = process.env.APPDATA;
process.env.NOVA_HOME_DIR = path.join(ROOT, "home");
process.env.HOI4_MODS_ROOT = ROOT;
fs.mkdirSync(process.env.APPDATA, { recursive: true });
fs.mkdirSync(process.env.NOVA_HOME_DIR, { recursive: true });
const md = require("./map-data.js");

let pass = 0, fail = 0;
const ok = (c, m, x) => {
  if (c) { pass++; console.log("  ok   " + m); }
  else { fail++; console.log("  FAIL " + m + (x !== undefined ? "   -> " + JSON.stringify(x).slice(0, 600) : "")); }
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
const REACH = md.PORT_REACH || { west: 1.52, east: 1.52, south: 3.14, north: 1.02 };
const AFLOAT = md.PORT_AFLOAT, NEAR = md.BUILDING_RING_NEAR;
const waterDrawnOver = typeof md.waterDrawnOver === "function" ? md.waterDrawnOver : () => null;

// ── 0. the game's own shader ──────────────────────────────────────────────────────────────────────────────────────────────────────
console.log("\n=== 0. the water the game draws is pdxwater.shader's ===");
const GAME = process.env.HOI4_ROOT || "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
// the shader's numbers: read off the installed shader where there is one; the ones it ships (1.19) where there is not, and section 0 says so
let SH = { scale: 95.7, shore: 0.954, slope: 25, taps: 9 };
{
  const fx = path.join(GAME, "gfx", "FX", "pdxwater.shader"), cf = path.join(GAME, "gfx", "FX", "constants.fxh");
  if (!fs.existsSync(fx) || !fs.existsSync(cf)) console.log("  SKIP: no Hearts of Iron IV install at " + GAME + " — section 0 did not run");
  else {
    const t = fs.readFileSync(fx, "utf8"), c = fs.readFileSync(cf, "utf8");
    const h = /MultiSampleTexX\(\s*HeightTexture\s*,\s*Input\.uv\s*\)\s*\/\s*\(\s*([\d.]+)f\s*\/\s*255\.0f\s*\)/.exec(t);
    const s = /saturate\(\s*\(\s*waterHeight\s*-\s*([\d.]+)f\s*\)\s*\*\s*([\d.]+)f\s*\)/.exec(t);
    const back = /return\s+float4\(\s*vOut\s*,\s*1\.0f\s*-\s*waterShore\s*\)/.test(t);
    const taps = (t.match(/vResult\s*\+?=\s*tex2D\(\s*TexCh/g) || []).length, div = /vResult\s*\/=\s*(\d+)/.exec(t);
    const half = /vOffsetX\s*=\s*-0\.5f\s*\/\s*MAP_SIZE_X/.test(t) && /vOffsetY\s*=\s*-0\.5f\s*\/\s*MAP_SIZE_Y/.test(t);
    const wh = /WATER_HEIGHT\s*=\s*([\d.]+)f/.exec(c);
    ok(!!h && !!s && back, "pdxwater.shader draws its plane with alpha 1 − saturate((h̄ / k − shore) · slope)", { scale: h && h[1], shore: s && s[1], slope: s && s[2], back });
    ok(taps === 9 && !!div && +div[1] === 9 && half, "…h̄ the mean of nine taps of the heightmap at half-pixel offsets (MultiSampleTexX)", { taps, div: div && div[1], half });
    if (h && s) SH = { scale: +h[1], shore: +s[1], slope: +s[2], taps };
    ok(!!wh && Math.abs(+wh[1] - (0.2617 + 94 * 0.09785)) < 0.2 && 94 / SH.scale < SH.shore + 1 / SH.slope,
      "…at WATER_HEIGHT (constants.fxh), which the beach's 94 stands under: the game draws water over it", { WATER_HEIGHT: wh && wh[1] });
    // ⛔ the half pixel (review PC-R1): the plane's vertex at world (x, z) reads uv ((x + 0.5) / MAP_SIZE_X, (z + 0.5 − MAP_SIZE_Y) /
    // −MAP_SIZE_Y), so texel i's centre stands at world x = i and row j's at z = H − 1 − j, and the heightmap is filtered Linear: a point
    // between two texel centres reads a blend of both, not the one floor() names
    const uv = /uv\s*=\s*float2\(\s*\(\s*VertexIn\.position\.x\s*\+\s*0\.5f\s*\)\s*\/\s*MAP_SIZE_X\s*,\s*\(\s*VertexIn\.position\.y\s*\+\s*0\.5f\s*-\s*MAP_SIZE_Y\s*\)\s*\/\s*-MAP_SIZE_Y\s*\)/.test(t);
    const hBlock = /HeightTexture\s*=\s*\{([^}]*)\}/.exec(t);
    const linear = !!hBlock && /MagFilter\s*=\s*"Linear"/.test(hBlock[1]) && /MinFilter\s*=\s*"Linear"/.test(hBlock[1]);
    ok(uv && linear, "…read at the point itself: uv = (x + 0.5) / MAP_SIZE_X puts texel i's centre at world x = i, and the heightmap is filtered Linear between texel centres", { uv, linear });
  }
}
/** this test's own reading of the shader at a point (x, row) in the heightmap's texel frame, rows top-down, texel (i, j)'s centre at
 *  (i, j) — buildings.txt's (x, z) is (x, H − 1 − z) — fractional allowed: nine taps at ±0.5 texel round it, each the bilinear blend of
 *  the four texels round the tap; x wraps and rows clamp, as waterDrawnOver's do */
const alphaOf = (hAt, W0, H0) => (x, row) => {
  const t = (i, j) => hAt(((i % W0) + W0) % W0, j < 0 ? 0 : j >= H0 ? H0 - 1 : j);
  const bil = (px, py) => {
    const i = Math.floor(px), j = Math.floor(py), fx = px - i, fy = py - j;
    return (1 - fx) * (1 - fy) * t(i, j) + fx * (1 - fy) * t(i + 1, j) + (1 - fx) * fy * t(i, j + 1) + fx * fy * t(i + 1, j + 1);
  };
  let s = 0;
  for (const dy of [-0.5, 0, 0.5]) for (const dx of [-0.5, 0, 0.5]) s += bil(x + dx, row + dy);
  return 1 - Math.min(1, Math.max(0, (s / 9 / SH.scale - SH.shore) * SH.slope));
};
{
  // the nine taps round a pixel's centre weigh it 4/9, each 4-neighbour 1/9, each corner 1/36: a heightmap of one 1 among 0s, read
  // (with the alpha taken off) at the 1 and round it
  const meanOf = (hAt, x, row) => { let s = 0; for (const dy of [-0.5, 0, 0.5]) for (const dx of [-0.5, 0, 0.5]) { const i = Math.floor(x + dx), j = Math.floor(row + dy), fx = x + dx - i, fy = row + dy - j; s += (1 - fx) * (1 - fy) * hAt(i, j) + fx * (1 - fy) * hAt(i + 1, j) + (1 - fx) * fy * hAt(i, j + 1) + fx * fy * hAt(i + 1, j + 1); } return s / 9; };
  const one = (x, row) => (x === 10 && row === 10 ? 1 : 0);
  const w = [meanOf(one, 10, 10), meanOf(one, 11, 10), meanOf(one, 11, 11)].map((v) => +v.toFixed(9));
  ok(w[0] === +(4 / 9).toFixed(9) && w[1] === +(1 / 9).toFixed(9) && w[2] === +(1 / 36).toFixed(9), "(this test's taps weigh a pixel's centre 4/9, a 4-neighbour 1/9, a corner 1/36)", w);
}
{
  // read at (10, 10) of a 64 x 64 map, and at points between texel centres round it: a straight shore (the sea west of it, land behind),
  // and the tip of a spit running east
  const flat = (v) => () => v;
  const shore = (x) => (x < 10 ? 89 : x === 10 ? 94 : 97), tip = (x, row) => (row !== 10 || x < 10 ? 89 : x <= 11 ? 94 : 97);
  const cases = { sea: flat(89), land: flat(106), shore, tip };
  const got = {}, want = {};
  for (const [k, f] of Object.entries(cases)) { const w = waterDrawnOver(f, 64, 64); got[k] = w ? +w(10, 10).toFixed(6) : null; want[k] = +alphaOf(f, 64, 64)(10, 10).toFixed(6); }
  ok(JSON.stringify(got) === JSON.stringify(want), "waterDrawnOver gives this test's reading of the shader: the sea opaque, land none, 94 on a shore and on a spit's tip", { got, want });
  ok(want.sea === 1 && want.land === 0 && want.shore < 0.5 && want.tip > 0.5, "…and a 94 on a straight shore is drawn mostly land, the same 94 on a spit's tip mostly sea", want);
  // ⛔ (review PC-R1) between texel centres, where every sample of a model's ground falls: the code read floor(x), the pixel west and
  // south of the point, entirely the coast pixel for a port facing south or west and entirely the pixel behind it for one facing north
  const POINTS = [[10.5, 10], [10.25, 9.75], [9.6, 10.4], [10.875, 10.125], [11.3, 9.5]];
  const gotF = {}, wantF = {};
  for (const [k, f] of Object.entries({ shore, tip })) {
    const w = waterDrawnOver(f, 64, 64);
    gotF[k] = POINTS.map(([x, row]) => (w ? +w(x, row).toFixed(6) : null));
    wantF[k] = POINTS.map(([x, row]) => +alphaOf(f, 64, 64)(x, row).toFixed(6));
  }
  ok(JSON.stringify(gotF) === JSON.stringify(wantF), "⭐⭐ …and so it does at a point between texel centres: the shader read at the point itself, not at floor() of it", { gotF, wantF, POINTS });
  const sea9 = alphaOf(shore, 64, 64)(9, 10), between = alphaOf(shore, 64, 64)(9.75, 10), shore10 = alphaOf(shore, 64, 64)(10, 10);
  ok(between < sea9 && between > shore10, "(three quarters of the way from the last sea pixel to the shore pixel the game draws less water than over the sea and more than over the shore: floor() reads the sea pixel there)", { sea9, between, shore10 });
}

// ── the fixtures ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// Hutibresk's shape, rows top-down: province 2 (state 1) the block x 20..55, y 6..33 and a one-pixel spit x 15..19 on row 19 on a sea
// (province 1). Its depot inland by the spit; its HQ, fort, hub and dockyard on the west coast round the spit's root, so the west coast
// pixels 3 px clear of them are rows ≤ 13 and ≥ 27. Heights: the sea 89, a land pixel with a sea 4-neighbour 94 (the beach), other land 97.
const W = 64, H = 40, SEA = 1, LAND = 2;
const S = 19, inBody = (x, y) => x >= 20 && x <= 55 && y >= 6 && y <= 33, inSpit = (x, y) => y === S && x >= 15 && x <= 19;
const provA = (x, y) => (inBody(x, y) || inSpit(x, y) ? LAND : SEA);
const zOf = (row) => H - 1 - row;
const DEPOT = { x: 24, row: S };
const COAST_ROWS = [["naval_headquarters", 20, S - 3], ["coastal_bunker", 20, S - 1], ["naval_supply_hub", 20, S + 2], ["dockyard", 20, S + 5]];
const heightsOf = (prov, beach = 94, inland = 97) => (x, y) => {
  if (y < 0 || y >= H) return 89;
  const xx = ((x % W) + W) % W, p = prov(xx, y);
  if (p === SEA) return 89;
  const coast = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => y + dy >= 0 && y + dy < H && prov((((xx + dx) % W) + W) % W, y + dy) === SEA);
  return coast ? beach : inland;
};
const coastOf = (prov, id) => {
  const out = [];
  for (let row = 0; row < H; row++) for (let x = 0; x < W; x++) {
    if (prov(x, row) !== id) continue;
    const seas = [[1, 0], [-1, 0], [0, -1], [0, 1]].filter(([dx, dy]) => row + dy >= 0 && row + dy < H && prov(((x + dx) % W + W) % W, row + dy) === SEA).map(([dx, dy]) => [dx, dy, SEA]);
    if (seas.length) out.push({ x, row, seas });
  }
  return out;
};
/** this test's own sampler: of the model's land half (mesh z 0..north) standing at pixel (x, row) turned `a`, the centre of every
 *  0.25-px cell (the grain the audits sample a model at), the share the game draws more water than land over (alphaOf over `hAt`, read
 *  at the sample point itself, (X, H − 1 − Z) in the texel frame) */
const landHalfShare = (hAt, x, row, a, readAt) => {
  const al = alphaOf(hAt, W, H), z = zOf(row), cs = Math.cos(a), sn = Math.sin(a), st = 0.25;
  let n = 0, k = 0;
  for (let u = -REACH.west + st / 2; u < REACH.east; u += st) for (let v = st / 2; v < REACH.north; v += st) {
    const X = x + u * cs - v * sn, Z = z + u * sn + v * cs;
    n++;
    if (readAt(al, X, Z) > 0.5) k++;
  }
  return k / n;
};
const afloatOf = (hAt, x, row, a) => landHalfShare(hAt, x, row, a, (al, X, Z) => al(X, H - 1 - Z));
/** …and the reading map-data.js had until review PC-R1, for the CONTROLs: the alpha at the centre of the pixel floor() names, half a
 *  pixel west and south of the point on average */
const afloatFloorOf = (hAt, x, row, a) => landHalfShare(hAt, x, row, a, (al, X, Z) => al(Math.floor(X), H - 1 - Math.floor(Z)));
const typeOf = (id) => (id === SEA ? "sea" : "land"), stateOf = (p) => (p === LAND ? 1 : null);
const cheb = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.row - b.row));
const d2 = (a, b) => (a.x - b.x) ** 2 + (a.row - b.row) ** 2;

console.log("\n=== 1. Hutibresk's shape: the port leaves the spit for the coast the game draws as land ===");
const hA = heightsOf(provA), exA = { W, H, pidAt: (x, row) => provA(((x % W) + W) % W, row) };
const coastA = coastOf(provA, LAND), rowsA = COAST_ROWS.map(([, x, row]) => ({ x, row }));
{
  const spot = (extra) => md.harbourSpot({ ex: exA, typeOf, stateOf, sid: 1, coast: coastA, near: DEPOT, rows: rowsA, reach: REACH, ...extra });
  const rotAt = (c) => md.coastFacing(exA, typeOf, c.x, zOf(c.row)) || 0;
  const blind = spot({});
  ok(!!blind && inSpit(blind.x, blind.row) && afloatOf(hA, blind.x, blind.row, rotAt(blind)) > AFLOAT,
    "CONTROL: asked of no heightmap, harbourSpot stands the port on the spit, more than PORT_AFLOAT of its land half over water the game draws",
    { blind, afloat: blind && afloatOf(hA, blind.x, blind.row, rotAt(blind)) });
  const waterAt = waterDrawnOver((x, row) => hA(x, row), W, H);
  const s = spot({ waterAt });
  const sa = s ? afloatOf(hA, s.x, s.row, s.rot == null ? 0 : s.rot) : null;
  ok(!!s && provA(s.x, s.row) === LAND && !inSpit(s.x, s.row) && sa <= AFLOAT, "⭐⭐ with the water the game draws, the port stands off the spit, PORT_AFLOAT or less of its land half afloat", { s, sa });
  // the pixels it may take: its coast, 3 px or more off every coast row, its land half on land — the nearest the depot of them
  const fair = coastA.filter((c) => Math.min(...rowsA.map((q) => cheb(c, q))) >= NEAR && afloatOf(hA, c.x, c.row, rotAt(c)) <= AFLOAT);
  const nearest = fair.slice().sort((a, b) => d2(a, DEPOT) - d2(b, DEPOT) || a.row - b.row || a.x - b.x)[0];
  ok(fair.length > 0 && !!s && !!nearest && s.x === nearest.x && s.row === nearest.row, "⭐ …on the coast pixel nearest the depot of those 3 px or more off every coast row with their land half on land", { s, nearest });
  ok(!!s && s.rot === md.coastFacing(exA, typeOf, s.x, zOf(s.row)) && s.sea === SEA, "…turned to its sea (coastFacing), its column 7 the sea beside it", s);
  const again = md.harbourSpot({ ex: exA, typeOf, stateOf, sid: 1, coast: coastA.slice().reverse(), near: DEPOT, rows: rowsA, reach: REACH, waterAt });
  ok(JSON.stringify(again) === JSON.stringify(s), "⭐ the same answer whatever order the coast pixels come in", { s, again });
}

console.log("\n=== 2. Aldiler's shape: the port stays on the island rather than the sliver of beach off it ===");
{
  // a one-province island (province 2): its main body x 10..14, y 10..13, under a model of its state standing on it, and a detached
  // sliver x 10..12 on row 16, two rows of sea off it
  const provB = (x, y) => ((x >= 10 && x <= 14 && y >= 10 && y <= 13) || (y === 16 && x >= 10 && x <= 12) ? LAND : SEA);
  const hB = heightsOf(provB), exB = { W, H, pidAt: (x, row) => provB(((x % W) + W) % W, row) }, coastB = coastOf(provB, LAND);
  const sliver = (c) => c.row === 16;
  const body = [{ x: 12, z: zOf(11.5), rot: 0, reach: { west: 3.2, east: 3.2, south: 2.5, north: 2.6 } }];
  const blind = md.harbourSpot({ ex: exB, typeOf, stateOf, sid: 1, coast: coastB, near: { x: 12, row: 12 }, rows: [], reach: REACH, models: body });
  ok(!!blind && sliver(blind), "CONTROL: asked of no heightmap, the models key stands the port on the sliver, off the model on the main body", blind);
  const waterAt = waterDrawnOver((x, row) => hB(x, row), W, H);
  const s = md.harbourSpot({ ex: exB, typeOf, stateOf, sid: 1, coast: coastB, near: { x: 12, row: 12 }, rows: [], reach: REACH, models: body, waterAt });
  const sa = s ? afloatOf(hB, s.x, s.row, s.rot == null ? 0 : s.rot) : null;
  ok(!!s && !sliver(s) && provB(s.x, s.row) === LAND && sa <= AFLOAT, "⭐⭐ with the water the game draws, it stands on the island's main body, its land half on land — afloat is weighed ahead of the models key", { s, sa });
  ok(!!blind && afloatOf(hB, blind.x, blind.row, md.coastFacing(exB, typeOf, blind.x, zOf(blind.row)) || 0) > AFLOAT, "(the sliver's own land half is afloat)", blind);
}

console.log("\n=== 3. fixCoastalNoPort, on a mod with a heightmap ===");
const colour = (id) => [(id * 37) % 256, (id * 71) % 256, 40 + id];
function makeMod(dir, heights) {
  write(dir, "descriptor.mod", 'name="harbour-ground"\nreplace_path="history/states"\nreplace_path="map"\n');
  write(dir, "map/provinces.bmp", bmp24(W, H, (x, y) => colour(provA(x, y))));
  write(dir, "map/heightmap.bmp", bmp8(W, H, heights));
  write(dir, "map/definition.csv", ["0;0;0;0;land;false;unknown;0", `1;${colour(1).join(";")};sea;false;ocean;0`, `2;${colour(2).join(";")};land;true;plains;1`].join("\n") + "\n");
  write(dir, "history/states/1-S.txt", "state = {\n\tid = 1\n\tname = \"STATE_1\"\n\tmanpower = 1000\n\tstate_category = rural\n\tprovinces = { 2 }\n\thistory = {\n\t\towner = AAA\n\t}\n}\n");
  const rows = [`1;supply_node;${DEPOT.x}.00;9.80;${zOf(DEPOT.row)}.00;0.00;0`].concat(COAST_ROWS.map(([t, x, row]) => `1;${t};${x}.00;9.50;${zOf(row)}.00;-1.57;0`));
  write(dir, "map/buildings.txt", rows.join("\n") + "\n");
  return rows;
}
const portsIn = (dir) => fs.readFileSync(path.join(dir, "map", "buildings.txt"), "utf8").split(/\r?\n/).filter((l) => l.split(";")[1] === "naval_base_spawn")
  .map((l) => { const c = l.split(";"); return { line: l, sid: +c[0], x: +c[2], z: +c[4], rot: +c[5], rotText: c[5], sea: +c[6], px: Math.floor(+c[2]), row: H - 1 - Math.floor(+c[4]) }; });
const noGame = path.join(ROOT, "no-game");
{
  const modA = path.join(ROOT, "a"), modB = path.join(ROOT, "b"), modC = path.join(ROOT, "c");
  const rowsWritten = makeMod(modA, (x, y) => hA(x, y)); makeMod(modB, (x, y) => hA(x, y));
  const hFlat = (x, y) => (provA(x, y) === SEA ? 89 : inSpit(x, y) ? 106 : hA(x, y));
  makeMod(modC, hFlat);
  const r = md.fixCoastalNoPort({ modRoot: modA, gameRoot: noGame, dependencyRoots: [] });
  const p = portsIn(modA)[0];
  ok(r && r.added === 1 && portsIn(modA).length === 1, "Auto-fix adds one port to province 2", { r, ports: portsIn(modA).map((q) => q.line) });
  const pa = p ? afloatOf(hA, p.px, p.row, p.rot) : null;
  ok(!!p && provA(p.px, p.row) === LAND && !inSpit(p.px, p.row) && pa <= AFLOAT, "⭐⭐ it stands off the spit, PORT_AFLOAT or less of its land half over water the game draws", { line: p && p.line, pa });
  ok(!!p && p.sea === SEA && [[1, 0], [-1, 0], [0, -1], [0, 1]].some(([dx, dy]) => provA(p.px + dx, p.row + dy) === SEA), "…on its own coast, its column 7 the sea beside it", p && p.line);
  ok(!!p && p.rotText === (md.coastFacing(exA, typeOf, p.x, p.z) || 0).toFixed(2), "…turned to its sea (coastFacing)", { line: p && p.line, want: md.coastFacing(exA, typeOf, p.x, p.z) });
  ok(!!p && Math.min(...rowsA.map((q) => Math.max(Math.abs(q.x - p.px), Math.abs(q.row - p.row)))) >= NEAR, "…3 px or more off every coast row standing on its province", p && p.line);
  const lines = fs.readFileSync(path.join(modA, "map", "buildings.txt"), "utf8").split(/\r?\n/);
  ok(rowsWritten.every((l, i) => lines[i] === l), "⭐ every row the file had stays byte for byte where it stood", lines.slice(0, rowsWritten.length + 1));
  const rb = md.fixCoastalNoPort({ modRoot: modB, gameRoot: noGame, dependencyRoots: [] });
  ok(rb && rb.added === 1 && fs.readFileSync(path.join(modB, "map", "buildings.txt"), "utf8") === fs.readFileSync(path.join(modA, "map", "buildings.txt"), "utf8"),
    "⭐ the same click on a second copy writes the same bytes", rb);
  const rc = md.fixCoastalNoPort({ modRoot: modC, gameRoot: noGame, dependencyRoots: [] });
  const pc = portsIn(modC)[0];
  ok(rc && rc.added === 1 && !!pc && inSpit(pc.px, pc.row), "CONTROL: the same mod over a heightmap that stands the spit at 106 puts the port on the spit — the heightmap is what moved it", { rc, line: pc && pc.line });
}

console.log("\n=== 4. an islet that is all beach still gets its port ===");
{
  // province 2 alone: a 3 x 1 islet, every pixel of it 94 with the sea on three sides — no pixel of its coast has its land half on land
  const provD = (x, y) => (y === 20 && x >= 30 && x <= 32 ? LAND : SEA);
  const hD = heightsOf(provD);
  const modD = path.join(ROOT, "d");
  write(modD, "descriptor.mod", 'name="harbour-islet"\nreplace_path="history/states"\nreplace_path="map"\n');
  write(modD, "map/provinces.bmp", bmp24(W, H, (x, y) => colour(provD(x, y))));
  write(modD, "map/heightmap.bmp", bmp8(W, H, (x, y) => hD(x, y)));
  write(modD, "map/definition.csv", ["0;0;0;0;land;false;unknown;0", `1;${colour(1).join(";")};sea;false;ocean;0`, `2;${colour(2).join(";")};land;true;plains;1`].join("\n") + "\n");
  write(modD, "history/states/1-S.txt", "state = {\n\tid = 1\n\tname = \"STATE_1\"\n\tmanpower = 1000\n\tstate_category = rural\n\tprovinces = { 2 }\n\thistory = {\n\t\towner = AAA\n\t}\n}\n");
  write(modD, "map/buildings.txt", "1;supply_node;31.00;9.50;" + zOf(20) + ".00;0.00;0\n");
  const exD = { W, H, pidAt: (x, row) => provD(((x % W) + W) % W, row) };
  const every = coastOf(provD, LAND).map((c) => afloatOf(hD, c.x, c.row, md.coastFacing(exD, typeOf, c.x, zOf(c.row)) || 0));
  ok(every.length === 3 && every.every((a) => a > AFLOAT), "(the fixture: every coast pixel's land half is afloat)", every);
  const r = md.fixCoastalNoPort({ modRoot: modD, gameRoot: noGame, dependencyRoots: [] });
  const ps = portsIn(modD);
  ok(r && r.added === 1 && ps.length === 1 && provD(ps[0].px, ps[0].row) === LAND, "⭐⭐ it still gets exactly one port, on its own land — the key prefers, it never refuses (a coast with no port can crash the game)", { r, ports: ps.map((q) => q.line) });
}

console.log("\n=== 5. the half pixel: a square island's four alike knobs are drawn alike, and turnedModelAfloat reads them so ===");
{
  // province 2: the square x 20..30, rows 10..20, with a one-pixel knob in the middle of each side, the sea round it — four alike
  // shapes, each turned to its own sea. The game draws them alike; the reading map-data.js had (floor(), review PC-R1) did not.
  const KNOBS = [["north", 25, 9], ["east", 31, 15], ["south", 25, 21], ["west", 19, 15]];
  const provE = (x, y) => ((x >= 20 && x <= 30 && y >= 10 && y <= 20) || KNOBS.some(([, kx, ky]) => kx === x && ky === y) ? LAND : SEA);
  const exE = { W, H, pidAt: (x, row) => provE(((x % W) + W) % W, row) }, coastE = coastOf(provE, LAND);
  const rotOf = (x, row) => md.coastFacing(exE, typeOf, x, zOf(row)) || 0;
  for (const inland of [97, 106]) {
    const hE = heightsOf(provE, 94, inland), waterAt = waterDrawnOver(hE, W, H);
    const knobs = KNOBS.map(([d, x, row]) => ({ d, floor: afloatFloorOf(hE, x, row, rotOf(x, row)), shader: afloatOf(hE, x, row, rotOf(x, row)), code: waterAt ? md.turnedModelAfloat(x, zOf(row), rotOf(x, row), REACH, waterAt, H) : null }));
    const spread = (k) => Math.max(...knobs.map((q) => q[k])) - Math.min(...knobs.map((q) => q[k]));
    const show = knobs.map((q) => `${q.d} floor ${q.floor.toFixed(3)} shader ${q.shader.toFixed(3)} code ${q.code == null ? "-" : q.code.toFixed(3)}`);
    if (inland === 97) {
      ok(knobs.filter((q) => q.floor <= AFLOAT).map((q) => q.d).join() === "north,east" && spread("floor") >= 0.5,
        "CONTROL (inland 97, the generator's): the floor() reading answers the four alike knobs two ways — dry facing north and east, afloat facing south and west", show);
      ok(spread("shader") <= 1 / 24 && knobs.every((q) => q.shader > AFLOAT), "…while the shader read at the sample point draws all four alike (within the 0.25-px grid, which is not symmetric round the model's origin), each more than PORT_AFLOAT afloat", show);
    } else {
      ok(knobs.filter((q) => q.floor > AFLOAT).map((q) => q.d).join() === "south,west" && knobs.every((q) => q.shader <= AFLOAT) && spread("shader") <= 1 / 24,
        "CONTROL (inland 106, the base game's land): the floor() reading calls the south and west knobs afloat, which the shader draws dry like the other two", show);
    }
    ok(knobs.every((q) => q.code != null && Math.abs(q.code - q.shader) < 1e-9), `⭐⭐ turnedModelAfloat gives the shader's reading on each knob (inland ${inland})`, show);
    const off = coastE.map((c) => ({ x: c.x, row: c.row, code: waterAt ? md.turnedModelAfloat(c.x, zOf(c.row), rotOf(c.x, c.row), REACH, waterAt, H) : null, shader: afloatOf(hE, c.x, c.row, rotOf(c.x, c.row)) }))
      .filter((q) => q.code == null || Math.abs(q.code - q.shader) >= 1e-9);
    ok(coastE.length === 40 && off.length === 0, `⭐ …and on every one of the island's ${coastE.length} coast pixels (the ring's 36 and the 4 knobs), its sides and corners too (inland ${inland})`, off.slice(0, 8));
  }
}

console.log("\n=== 6. Valavothesk's knob: the port leaves a pixel floor() read as land, which the game draws in the sea ===");
{
  // province 2: the block x 10..40, rows 2..37 with the sea east of it, and a one-pixel knob east at (41, 19) — TEST 38's Valavothesk
  // (state 730, province 373), which the port took when the code read floor(): its land half points west, onto the knob's root, which
  // floor() reads whole and the game draws blended with the knob and the sea round it. The depot inland behind the knob, a coastal
  // bunker and an HQ on the coast 3 px north and south of it, so that of the coast 3 px clear of them the knob is nearest the depot.
  const K = { x: 41, row: 19 }, depotF = { x: 37, row: 19 }, ROWS_F = [["coastal_bunker", 40, 16], ["naval_headquarters", 40, 22]];
  const provF = (x, y) => ((x >= 10 && x <= 40 && y >= 2 && y <= 37) || (x === K.x && y === K.row) ? LAND : SEA);
  const hF = heightsOf(provF), exF = { W, H, pidAt: (x, row) => provF(((x % W) + W) % W, row) }, coastF = coastOf(provF, LAND);
  const rowsF = ROWS_F.map(([, x, row]) => ({ x, row }));
  const rotOf = (c) => md.coastFacing(exF, typeOf, c.x, zOf(c.row)) || 0;
  const nearestOf = (set) => set.slice().sort((a, b) => d2(a, depotF) - d2(b, depotF) || a.row - b.row || a.x - b.x)[0];
  const clear = coastF.filter((c) => Math.min(...rowsF.map((q) => cheb(c, q))) >= NEAR);
  const first = nearestOf(clear), isKnob = (c) => !!c && c.x === K.x && c.row === K.row;
  const kFloor = afloatFloorOf(hF, K.x, K.row, rotOf(K)), kShader = afloatOf(hF, K.x, K.row, rotOf(K));
  ok(isKnob(first) && kFloor <= AFLOAT && kShader > AFLOAT,
    "CONTROL: the knob is the nearest the depot of the coast 3 px off the rows, the floor() reading calls its land half dry, and the shader draws more than PORT_AFLOAT of it under water", { first, kFloor, kShader });
  const waterAt = waterDrawnOver(hF, W, H);
  const s = md.harbourSpot({ ex: exF, typeOf, stateOf, sid: 1, coast: coastF, near: depotF, rows: rowsF, reach: REACH, waterAt });
  const want = nearestOf(clear.filter((c) => afloatOf(hF, c.x, c.row, rotOf(c)) <= AFLOAT));
  ok(!!s && !isKnob(s) && !!want && s.x === want.x && s.row === want.row && afloatOf(hF, s.x, s.row, s.rot == null ? 0 : s.rot) <= AFLOAT,
    "⭐⭐ harbourSpot stands the port off the knob, on the coast pixel nearest the depot of those 3 px off the rows whose land half the shader draws on land", { s, want });
  // …and the same through Auto-fix's own writer, on a mod of this shape: CONTROL, with no heightmap there is no afloat key at all
  const makeF = (dir, withHeightmap) => {
    write(dir, "descriptor.mod", 'name="harbour-knob"\nreplace_path="history/states"\nreplace_path="map"\n');
    write(dir, "map/provinces.bmp", bmp24(W, H, (x, y) => colour(provF(x, y))));
    if (withHeightmap) write(dir, "map/heightmap.bmp", bmp8(W, H, (x, y) => hF(x, y)));
    write(dir, "map/definition.csv", ["0;0;0;0;land;false;unknown;0", `1;${colour(1).join(";")};sea;false;ocean;0`, `2;${colour(2).join(";")};land;true;plains;1`].join("\n") + "\n");
    write(dir, "history/states/1-S.txt", "state = {\n\tid = 1\n\tname = \"STATE_1\"\n\tmanpower = 1000\n\tstate_category = rural\n\tprovinces = { 2 }\n\thistory = {\n\t\towner = AAA\n\t}\n}\n");
    write(dir, "map/buildings.txt", [`1;supply_node;${depotF.x}.00;9.80;${zOf(depotF.row)}.00;0.00;0`].concat(ROWS_F.map(([t, x, row]) => `1;${t};${x}.00;9.50;${zOf(row)}.00;1.57;0`)).join("\n") + "\n");
  };
  const modF = path.join(ROOT, "f"), modG = path.join(ROOT, "g");
  makeF(modF, true); makeF(modG, false);
  const rf = md.fixCoastalNoPort({ modRoot: modF, gameRoot: noGame, dependencyRoots: [] }), pf = portsIn(modF)[0];
  ok(rf && rf.added === 1 && !!pf && !!want && pf.px === want.x && pf.row === want.row, "⭐⭐ Auto-fix's fixCoastalNoPort writes its port there too", { rf, line: pf && pf.line, want });
  const rg = md.fixCoastalNoPort({ modRoot: modG, gameRoot: noGame, dependencyRoots: [] }), pg = portsIn(modG)[0];
  ok(rg && rg.added === 1 && !!pg && isKnob({ x: pg.px, row: pg.row }), "CONTROL: the same mod with no heightmap stands it on the knob — the water the game draws is what moved it", { rg, line: pg && pg.line });
}

try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) { /* a temp directory this test made */ }
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
