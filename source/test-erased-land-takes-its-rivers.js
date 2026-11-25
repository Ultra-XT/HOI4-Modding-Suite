// ⛔ #erased-land-takes-its-rivers — THE ERASE TOOK THE LAND AND LEFT ITS RIVER STANDING ON THE SEA.
//
// sinkProvincesInHeightmap — the path every province that goes under takes — repainted the heights, terrain.bmp, the normals,
// the world pictures, the minimap and trees.bmp both ways, and never opened rivers.bmp. So erasing a province left every river
// pixel it carried drawn over open water, joining two stretches still on land, and no rule saw it (river_no_source asks only for
// a missing green). Critic R2 of the rivers design: on v5's seed-1 world 2,219 of 4,721 land provinces carry rivers, 2,185 of
// them mid-river. 📊 Measured through flipProvinceToSea on a copy of TEST 31 with those rivers, 20 river-holding provinces erased:
// 843 river pixels left over the drowned land and 4 green sources on open water before; 0 and 0 after.
//
// What a cut must do, pinned on a fixture small enough to state every pixel:
//   1. the erase — the river pixels over the drowned land go back to the file's own SEA background (voted off this file, not
//      typed); the piece holding the green is left exactly as it was and ends at the new water; a long piece cut off from its
//      source gets one at its upstream end; a short one is wiped; a tributary whose junction went under loses its dangling red
//      and becomes a river of its own. One green per river afterwards, and fixMalformedRivers' dry run finds nothing sourceless.
//   2. a cut piece's main is its own course while that is long enough, re-sourced by ONE pixel with every tributary left joined;
//      only when it is too short is the main its LONGEST river: a long tributary that joined a short stub of the old main keeps a
//      source, and the stub joins it as a tributary with its own red (or goes, at 2 px or fewer).
//   2b. which way a cut river flows is read the way the game traces it, from its markers — a flow-out whose split went under, a
//      delta cut above its split, two rivers touching — so the real downstream end is never taken for the head (review RS2).
//   2c. what the cut leaves of the markers: no red inside a 2x2 block, no red left with 2 px of tributary or fewer (review RS3).
//   3. never a source on the SEA: a head on the sea is trimmed back to the land and the river kept, and a tributary that joined it
//      out on that sea is kept too, a river of its own; a head on a lake stays there, as 14 of vanilla's 317 sources do (review RS1).
//   4. the paint brush's land-to-sea stroke takes the rivers too, through the same writer — and only on the pixels it lowered.
//   5. a mod that does not own rivers.bmp takes its copy only when a river really stood on the drowned land, and is told.
//   6. Delete map clears every river itself afterwards, so its sink skips this — its rivers.bmp is byte for byte what
//      clearAllRivers alone writes.
//   7. Auto-fix's settle of an old coast under the sea is a sink too: the rivers on it go, and its line names rivers.bmp.
//   8. the page reloads its river overlay after a Save whose erase or paint changed rivers.bmp on the server.
//   9. what the pass must leave alone: a raise draws no river and takes none, and the sea background is voted from water this write
//      did not drown, even when the drowned land outnumbers the sea (review RS5).
// The minimum length is the layer below's own (riverMainFloorBeneath), re-derived here by this file's own walker.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const md = require("./map-data.js");
const page = require("./testlib-map-page.js");

let pass = 0;
const fails = [];
const ok = (cond, label, detail) => {
  if (cond === true) { pass++; console.log("  ok   " + label); }
  else { fails.push(label); console.log("  FAIL " + label + (detail !== undefined ? "   -> " + JSON.stringify(detail).slice(0, 400) : "")); }
};
const tmps = [];
const mkdir = (tag) => { const d = fs.mkdtempSync(path.join(os.tmpdir(), "nova-riversink-" + tag + "-")); tmps.push(d); return d; };
const write = (dir, files) => {
  for (const [rel, body] of Object.entries(files)) { const p = path.join(dir, ...rel.split("/")); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, body); }
  return dir;
};

// ══ the fixture ══════════════════════════════════════════════════════════════════════════════════════════
//
// 160x96. Sea (1) along the bottom (y >= 80) and the east edge (x >= 150), one pixel of it at (64,30) on C's west edge and an inlet
// of two at (64..65,33); land A (2) x < 40, B (3) 40..63 — the province that is erased, coastal on the south sea — and C (4) beyond
// it; a small lake (5) cut into C's west edge at x 64..65, y 45..55.
const W = 160, H = 96, ERASED = 3, NOTCH = [64, 30], INLET_Y = 33;
const provAt = (x, y) => (y >= 80 || x >= 150 || (x === NOTCH[0] && y === NOTCH[1]) || (y === INLET_Y && (x === 64 || x === 65)) ? 1
  : x >= 64 && x <= 65 && y >= 45 && y <= 55 ? 5 : x < 40 ? 2 : x < 64 ? 3 : 4);
const COL = { 1: [0, 0, 200], 2: [200, 0, 0], 3: [0, 200, 0], 4: [200, 200, 0], 5: [0, 200, 200] };
const WATER = new Set([1, 5]);
const DEF = ["0;0;0;0;land;false;unknown;0", "1;0;0;200;sea;false;ocean;0", "2;200;0;0;land;true;plains;1",
  "3;0;200;0;land;true;plains;1", "4;200;200;0;land;true;plains;1", "5;0;200;200;lake;false;lakes;0"].join("\r\n") + "\r\n";
// rivers.bmp in vanilla's palette layout — 0 green source, 1 red flow-in, 2 yellow flow-out, 3..11 widths, 254 grey, 255 white —
// plus a DECOY mid-grey at 100 that nothing paints. clearAllRivers clears to the first mid-grey (100); a sink clears to the sea
// background this file actually paints over open water (254). So a Delete map that ran the sink first would show in the bytes.
const BLUES = [[0, 225, 255], [0, 200, 255], [0, 150, 255], [0, 100, 255], [0, 0, 255], [0, 0, 225], [0, 0, 200], [0, 0, 150], [0, 0, 100]];
const PAL = Array.from({ length: 256 }, (_, i) => (i === 0 ? [0, 255, 0] : i === 1 ? [255, 0, 0] : i === 2 ? [255, 252, 0]
  : i >= 3 && i <= 11 ? BLUES[i - 3] : i === 100 ? [128, 128, 128] : i === 254 ? [122, 122, 122] : i === 255 ? [255, 255, 255] : [2, 0, 1]));
const GREEN = 0, RED = 1, YELLOW = 2;

function bmp24(fn) {
  const rs = Math.floor((24 * W + 31) / 32) * 4, size = 54 + rs * H, b = Buffer.alloc(size);
  b.write("BM", 0, "ascii"); b.writeUInt32LE(size, 2); b.writeUInt32LE(54, 10); b.writeUInt32LE(40, 14);
  b.writeInt32LE(W, 18); b.writeInt32LE(H, 22); b.writeUInt16LE(1, 26); b.writeUInt16LE(24, 28); b.writeUInt32LE(rs * H, 34);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const [r, g, bl] = fn(x, y); const o = 54 + (H - 1 - y) * rs + x * 3; b[o] = bl; b[o + 1] = g; b[o + 2] = r; }
  return b;
}
function bmp8(fn, pal) {
  const rs = (W + 3) & ~3, off = 54 + 1024, b = Buffer.alloc(off + rs * H);
  b.write("BM", 0, "ascii"); b.writeUInt32LE(b.length, 2); b.writeUInt32LE(off, 10); b.writeUInt32LE(40, 14);
  b.writeInt32LE(W, 18); b.writeInt32LE(H, 22); b.writeUInt16LE(1, 26); b.writeUInt16LE(8, 28); b.writeUInt32LE(rs * H, 34); b.writeUInt32LE(256, 46);
  for (let i = 0; i < 256; i++) { const c = pal ? pal[i] : [i, i, i]; b[54 + i * 4] = c[2]; b[55 + i * 4] = c[1]; b[56 + i * 4] = c[0]; }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) b[off + (H - 1 - y) * rs + x] = fn(x, y) & 255;
  return b;
}
// A river as a list of [x, y, index], drawn in order from its source.
const run = (x0, x1, y, idxAt) => Array.from({ length: x1 - x0 + 1 }, (_, i) => [x0 + i, y, idxAt(x0 + i)]);
const col = (x, y0, y1, idxAt) => Array.from({ length: y1 - y0 + 1 }, (_, i) => [x, y0 + i, idxAt(y0 + i)]);
// The layer below's own rivers, which the minimum length is learnt from: five mains of 20, 24, 28, 32 and 36 px in A's top rows.
const LEARN = [20, 24, 28, 32, 36].flatMap((len, k) => [[1, 1 + 2 * k, GREEN], ...run(2, len, 1 + 2 * k, () => 3)]);
// R1 runs across all three land provinces into the east sea; R2 ends inland 7 px into C; R3 turns south through B to the sea, and
// T joins R3 from C with its red on C's side of the border, beside R3's pixel in B.
const R1 = [[4, 12, GREEN], ...run(5, 154, 12, (x) => (x <= 39 ? 3 : x <= 63 ? 6 : 11))];
const R2 = [[8, 18, GREEN], ...run(9, 70, 18, () => 3)];
const R3 = [[4, 24, GREEN], ...run(5, 63, 24, () => 3), ...col(63, 25, 83, () => 6)];
const T = [[64, 40, RED], ...run(65, 110, 40, () => 3)];
// R4 is cut close to its mouth, and a long tributary T4 joins the short stub left below the cut.
const R4 = [[4, 75, GREEN], ...run(5, 70, 75, (x) => (x <= 63 ? 3 : 6)), ...col(70, 76, 83, () => 6)];
const T4 = [[68, 74, RED], ...col(68, 40, 73, () => 3)];
// R6 is cut far from its mouth, so its own course below the cut is long enough to stand alone; T6 joins it below the cut and is
// longer still, so the longest walk up from R6's mouth goes up T6.
const R6 = [[4, 60, GREEN], ...run(5, 110, 60, () => 3), ...col(110, 61, 83, () => 6)];
const T6 = [[100, 59, RED], ...col(100, 20, 58, () => 3)];
// R5 crosses B, then the lake, then C: cut by the erase, its downstream piece begins on the lake.
const R5 = [[4, 50, GREEN], ...run(5, 120, 50, () => 3)];
// RN crosses B, then the one pixel of sea at the notch, then C: its downstream piece begins on the sea.
const RN = [[4, NOTCH[1], GREEN], ...run(5, 120, NOTCH[1], () => 3)];
// RI crosses B, then the inlet's two pixels of sea, then C; TI joins it on the inlet from C to the north, its red beside the inlet's
// eastern pixel: above RI's last pixel of land.
const RI = [[4, INLET_Y, GREEN], ...run(5, 120, INLET_Y, () => 3)];
const TI = [[65, INLET_Y - 1, RED], ...col(65, 8, INLET_Y - 2, () => 3)];
// R4S is R4 with its tributary joining two pixels below the cut, so the old main's stub is 2 px.
const T4S = [[66, 74, RED], ...col(66, 40, 73, () => 3)];
// ── which way a cut river flows (2b) ──
// MY runs through B and turns south to the sea; at its corner (63,20), in B, a flow-out (yellow) starts BY, which runs east through
// C and south into the sea. The split goes under with B.
const MY = [[4, 20, GREEN], ...run(5, 63, 20, () => 3), ...col(63, 21, 83, () => 6)];
const BY = [[64, 20, YELLOW], ...run(65, 110, 20, () => 3), ...col(110, 21, 83, () => 6)];
// MD runs through B, splits at (65,70) in C (a yellow at (65,69) starts DB), and turns south into the sea at x 66: below the cut its
// own course is shorter than the learnt minimum, while DB, a long branch north, east and south to the sea, is not.
const MD = [[4, 70, GREEN], ...run(5, 66, 70, () => 3), ...col(66, 71, 83, () => 6)];
const DB = [[65, 69, YELLOW], ...col(65, 60, 68, () => 3), ...run(66, 140, 60, () => 3), ...col(140, 61, 83, () => 6)];
// MY2 is MY at y 40, and its branch BY2 is too short to stand alone; T2 joins BY2 from the north and is long, so the longest river
// in the cut piece is T2's, and BY2's upper stretch, the yellow at its top, is left beside it as a stub.
const MY2 = [[4, 40, GREEN], ...run(5, 63, 40, () => 3), ...col(63, 41, 83, () => 6)];
const BY2 = [[64, 40, YELLOW], ...run(65, 70, 40, () => 3)];
const T2 = [[67, 39, RED], ...col(67, 10, 38, () => 3)];
// A2 and B2 are two rivers whose sources touch at (4,14)/(4,15): one component holding two greens, as vanilla ships one.
const A2 = [[4, 14, GREEN], ...run(5, 154, 14, (x) => (x <= 63 ? 3 : 11))];
const B2 = [[4, 15, GREEN], ...col(4, 16, 22, () => 3), ...run(5, 120, 22, () => 3), ...col(120, 23, 83, () => 6)];
// ── what the cut leaves of the markers (2c) ──
// RB is cut by B and carries a 2x2 block below the cut, where it steps down a row at x 90..91.
const RB = [[4, 35, GREEN], ...run(5, 90, 35, () => 3), [90, 36, 3], ...run(91, 154, 36, () => 6)];
const RB_BLOCK = [[91, 35, 3]];
// M4 runs down C's west edge at x 65 and east to the sea; TZ joins it with a red at (64,15), all of its tributary in B and A, so the
// erase takes it up to the red. M5 is the same a pixel further east, and TS leaves one pixel of tributary beside its red.
const M4 = [[65, 6, GREEN], ...col(65, 7, 25, () => 3), ...run(66, 154, 25, () => 6)];
const TZ = [[64, 15, RED], ...run(10, 63, 15, () => 3)];
// TP is a 2-px tributary of M4 the modder drew, which the erase does not touch: it is theirs, short or not.
const TP = [[66, 20, RED], [67, 20, 3]];
const M5 = [[66, 6, GREEN], ...col(66, 7, 25, () => 3), ...run(67, 154, 25, () => 6)];
const TS = [[65, 15, RED], ...run(10, 64, 15, () => 3)];

// `bHeight`: B's own height in the layer below, when it is not the plain land the rest stands on.
function makeGame(extraRivers, { bHeight = 0 } = {}) {
  const g = mkdir("game");
  const riv = new Map();
  for (const [x, y, v] of LEARN.concat(extraRivers || [])) riv.set(y * W + x, v);
  write(g, {
    "hoi4.exe": "placeholder",
    "map/provinces.bmp": bmp24((x, y) => COL[provAt(x, y)]),
    "map/definition.csv": DEF,
    "map/heightmap.bmp": bmp8((x, y) => (WATER.has(provAt(x, y)) ? md.HEIGHTMAP_SEA_VALUE : bHeight && provAt(x, y) === ERASED ? bHeight : md.HEIGHTMAP_SEA_LEVEL + 11)),
    "map/rivers.bmp": bmp8((x, y) => (riv.has(y * W + x) ? riv.get(y * W + x) : WATER.has(provAt(x, y)) ? 254 : 255), PAL),
    "map/strategicregions/1-Sea.txt": "strategic_region = {\n\tid = 1\n\tname = \"R1\"\n\tprovinces = { 1 5 }\n}\n",
    "map/strategicregions/2-Land.txt": "strategic_region = {\n\tid = 2\n\tname = \"R2\"\n\tprovinces = { 2 3 4 }\n}\n",
    "history/states/1-A.txt": "state = {\n\tid = 1\n\tname = \"STATE_1\"\n\tmanpower = 1000\n\tstate_category = rural\n\tprovinces = { 2 }\n\thistory = {\n\t\towner = AAA\n\t}\n}\n",
    "history/states/2-B.txt": "state = {\n\tid = 2\n\tname = \"STATE_2\"\n\tmanpower = 1000\n\tstate_category = rural\n\tprovinces = { 3 }\n\thistory = {\n\t\towner = AAA\n\t}\n}\n",
    "history/states/3-C.txt": "state = {\n\tid = 3\n\tname = \"STATE_3\"\n\tmanpower = 1000\n\tstate_category = rural\n\tprovinces = { 4 }\n\thistory = {\n\t\towner = AAA\n\t}\n}\n",
  });
  return g;
}
const mkMod = (tag, files) => write(mkdir(tag), { "descriptor.mod": `name="${tag}"\nsupported_version="1.*"\n`, ...(files || {}) });
// The mod's own rivers, drawn the way the river tool draws them.
const paintRivers = (mod, game, rivers) => md.writeRiversPaint({ modRoot: mod, gameRoot: game, dependencyRoots: [], edits: rivers.flat().map(([x, y, index]) => ({ x, y, index })) });

// ── this file's own readers: a measurement that runs the writer's helpers cannot refute the writer ──────────
function read8(file) {
  const b = fs.readFileSync(file), off = b.readUInt32LE(10), dib = b.readUInt32LE(14), w = b.readInt32LE(18), rh = b.readInt32LE(22);
  const h = Math.abs(rh), up = rh > 0, rs = (w + 3) & ~3;
  const pal = []; for (let i = 0; i < 256; i++) { const o = 14 + dib + 4 * i; pal.push([b[o + 2], b[o + 1], b[o]]); }
  const a = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) { const r = off + (up ? h - 1 - y : y) * rs; for (let x = 0; x < w; x++) a[y * w + x] = b[r + x]; }
  return { a, pal, head: b.subarray(0, off) };
}
const greyish = (c) => Math.abs(c[0] - c[1]) <= 12 && Math.abs(c[1] - c[2]) <= 12 && Math.abs(c[0] - c[2]) <= 12;
const roleOf = (pal, i) => { const c = pal[i]; if (greyish(c)) return "bg"; if (c[0] <= 40 && c[1] >= 200 && c[2] <= 40) return "green"; if (c[0] >= 200 && c[1] <= 90 && c[2] <= 90) return "red"; return "body"; };
const nbrs = (k) => { const x = k % W, o = []; if (x + 1 < W) o.push(k + 1); if (x > 0) o.push(k - 1); if (k + W < W * H) o.push(k + W); if (k >= W) o.push(k - W); return o; };
/** Every river in a rivers.bmp: its pixels, its greens, and every red with no junction (no neighbour of degree 3) beside it. */
function riversIn(R) {
  const isR = (k) => roleOf(R.pal, R.a[k]) !== "bg", seen = new Uint8Array(W * H), out = [];
  for (let s = 0; s < W * H; s++) {
    if (!isR(s) || seen[s]) continue;
    const px = [s]; seen[s] = 1;
    for (let h = 0; h < px.length; h++) for (const j of nbrs(px[h])) if (isR(j) && !seen[j]) { seen[j] = 1; px.push(j); }
    const greens = px.filter((k) => roleOf(R.pal, R.a[k]) === "green");
    const lostReds = px.filter((k) => roleOf(R.pal, R.a[k]) === "red" && !nbrs(k).filter(isR).some((j) => nbrs(j).filter(isR).length >= 3));
    out.push({ px, greens, lostReds });
  }
  return out;
}
/** The layer below's shortest river, as the learner measures it: a walk from each green that never steps onto a marker, at its
 *  10th percentile (the learner's own percentile), never under 3. */
function learntMinMain(file) {
  const R = read8(file), seen = new Uint8Array(W * H), mains = [];
  for (let k = 0; k < W * H; k++) {
    if (roleOf(R.pal, R.a[k]) !== "green") continue;
    seen[k] = 1; let cur = k, len = 1;
    for (;;) { const n = nbrs(cur).find((j) => !seen[j] && roleOf(R.pal, R.a[j]) === "body"); if (n === undefined) break; seen[n] = 1; cur = n; len++; }
    mains.push(len);
  }
  mains.sort((a, b) => a - b);
  return Math.max(3, mains[Math.min(mains.length - 1, Math.floor(0.1 * (mains.length - 1) + 0.5))]);
}
/** The background this file paints over open water (and over land): the commonest non-river index on each. */
function backgroundOf(R, water) {
  const v = new Map();
  for (let k = 0; k < W * H; k++) {
    if (WATER.has(provAt(k % W, (k - (k % W)) / W)) !== water || roleOf(R.pal, R.a[k]) !== "bg") continue;
    v.set(R.a[k], (v.get(R.a[k]) || 0) + 1);
  }
  return [...v].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0];
}
const at = (x, y) => y * W + x;
const inB = (k) => provAt(k % W, (k - (k % W)) / W) === ERASED;
const erase = (mod, game) => md.flipProvinceToSea({ modRoot: mod, gameRoot: game, dependencyRoots: [], provinceId: ERASED });

const GAME = makeGame();
const MIN = learntMinMain(path.join(GAME, "map", "rivers.bmp"));
const BASE = read8(path.join(GAME, "map", "rivers.bmp"));
const SEA_BG = backgroundOf(BASE, true), LAND_BG = backgroundOf(BASE, false);
console.log(`\n=== the fixture: the layer below's shortest river is ${MIN} px; sea background ${SEA_BG}, land background ${LAND_BG} ===`);
{
  // controls: the fixture can tell right from wrong
  const down1 = R1.filter(([x]) => x >= 64).length, down2 = R2.filter(([x]) => x >= 64).length, lenT = T.length;
  ok(down2 < MIN && MIN <= down1 && MIN <= lenT, "THE CONTROL: R2's cut-off piece is shorter than the learnt minimum, R1's and T's are not", { MIN, down1, down2, lenT });
  ok(SEA_BG !== 100 && SEA_BG !== LAND_BG, "THE CONTROL: the sea background is neither the decoy grey nor the land background", { SEA_BG, LAND_BG });
  ok(typeof md.riverMainFloorBeneath === "function" && md.riverMainFloorBeneath({ modRoot: mkMod("floor"), gameRoot: GAME, dependencyRoots: [] }).minMain === MIN,
    "riverMainFloorBeneath learns the same minimum from the layer below");
}

// ══ 1. the erase ═════════════════════════════════════════════════════════════════════════════════════════
console.log("\n=== 1. erasing B: what each river keeps, gets and loses ===");
{
  const mod = mkMod("erase");
  const p = paintRivers(mod, GAME, [R1, R2, R3, T]);
  ok(p.ok === true && p.addedSource === 0, "the mod's rivers were drawn with the river tool's writer, each with its own source", p);
  const file = path.join(mod, "map", "rivers.bmp");
  const before = read8(file);
  const onB = [...before.a.keys()].filter((k) => inB(k) && roleOf(before.pal, before.a[k]) !== "bg");
  ok(onB.length > 0, `THE CONTROL: ${onB.length} river pixels stand on B before the erase`, onB.length);

  const r = erase(mod, GAME);
  const rv = (r.heightmap && r.heightmap.rivers) || {};
  ok(r.changed === true && rv.changed === true, "the erase changed the map, and rivers.bmp with it", { err: r.error, rivers: rv });
  const after = read8(file);
  const left = onB.filter((k) => roleOf(after.pal, after.a[k]) !== "bg");
  ok(left.length === 0, "⭐⭐⭐ no river pixel is left over the drowned land", left.slice(0, 6).map((k) => [k % W, (k - (k % W)) / W]));
  ok(onB.every((k) => roleOf(after.pal, after.a[k]) !== "bg" || after.a[k] === SEA_BG), "⭐ …each went back to the sea background this file paints over open water, not the land's",
    [...new Set(onB.map((k) => after.a[k]))]);
  ok(rv.pixels === onB.length && rv.minMain === MIN, "…and the result says how many, and which minimum it judged by", { pixels: rv.pixels, want: onB.length, minMain: rv.minMain });
  ok(Buffer.compare(before.head, after.head) === 0, "the header and palette are byte for byte what they were");

  // what each piece should have become, derived from the rivers as drawn
  const want = new Map();
  for (const k of onB) want.set(k, SEA_BG);
  const r1Down = R1.filter(([x]) => x >= 64), r2Down = R2.filter(([x]) => x >= 64), r3RunOn = R3.filter(([x, y]) => provAt(x, y) === 1);
  const r1Head = r1Down.find(([x, y]) => inB(at(x - 1, y))), tHead = T[T.length - 1];
  // the heads given a source, the pieces wiped (each to the background under it) and the reds unhooked (to the body they continue)
  const given = [r1Head, tHead], gone = [[r2Down, LAND_BG], [r3RunOn, SEA_BG]], unhooked = [[T[0], T[1][2]]];
  for (const [x, y] of given) want.set(at(x, y), GREEN);
  for (const [px, bg] of gone) for (const [x, y] of px) want.set(at(x, y), bg);
  for (const [[x, y], body] of unhooked) want.set(at(x, y), body);
  const wrong = [];
  for (let k = 0; k < W * H; k++) { const w = want.has(k) ? want.get(k) : before.a[k]; if (after.a[k] !== w) wrong.push({ x: k % W, y: (k - (k % W)) / W, was: before.a[k], is: after.a[k], want: w }); }
  ok(wrong.length === 0, "⭐⭐ every pixel is what the rule says, and nothing else changed", wrong.slice(0, 8));
  ok(R1.filter(([x]) => x < 40).every(([x, y, v]) => after.a[at(x, y)] === v), "⭐⭐ the piece that kept R1's source is untouched…");
  const r1End = R1.filter(([x]) => x < 40).pop();
  ok(after.a[at(r1End[0] + 1, r1End[1])] === SEA_BG && provAt(r1End[0] + 1, r1End[1]) === ERASED, "…and ends at the new water");
  ok(after.a[at(r1Head[0], r1Head[1])] === GREEN, `⭐⭐⭐ R1's long piece below the cut (${r1Down.length} px) is given a source at its upstream end`, after.a[at(r1Head[0], r1Head[1])]);
  ok(r1Down.every(([x, y]) => roleOf(after.pal, after.a[at(x, y)]) !== "bg"), "⭐⭐ …and keeps every pixel of its river: it is not wiped");
  ok(r2Down.every(([x, y]) => roleOf(after.pal, after.a[at(x, y)]) === "bg"), `⭐⭐ R2's piece below the cut (${r2Down.length} px, under ${MIN}) is wiped`);
  ok(r2Down.every(([x, y]) => roleOf(after.pal, after.a[at(x, y)]) !== "bg" || after.a[at(x, y)] === LAND_BG),
    "⭐ …back to the background under it, the land's, not the sea's", [...new Set(r2Down.map(([x, y]) => after.a[at(x, y)]))]);
  ok(after.a[at(tHead[0], tHead[1])] === GREEN && roleOf(after.pal, after.a[at(T[0][0], T[0][1])]) === "body",
    "⭐⭐ the tributary whose junction went under keeps its rivers: a source at its head, and its dangling red is body now");
  ok(r3RunOn.every(([x, y]) => after.a[at(x, y)] === SEA_BG), "…and the stretch R3 ran out into the sea, cut from everything, is wiped too");
  ok(rv.resourced === given.length && rv.wiped === gone.length && rv.unhooked === unhooked.length, "the result counts what it did",
    { resourced: rv.resourced, wiped: rv.wiped, unhooked: rv.unhooked, want: [given.length, gone.length, unhooked.length] });

  const rivers = riversIn(after);
  ok(rivers.every((c) => c.greens.length === 1), "⭐⭐⭐ every river on the map has exactly one source", rivers.map((c) => c.greens.length));
  ok(rivers.every((c) => !c.lostReds.length), "⭐ …and no red is left beside a river that is gone", rivers.flatMap((c) => c.lostReds));
  const dry = md.fixMalformedRivers({ modRoot: mod, gameRoot: GAME, dependencyRoots: [], dryRun: true });
  ok(dry.ok === true && dry.sourceless.length === 0, "fixMalformedRivers' dry run finds nothing sourceless", dry.sourceless);
  const again = md.sinkProvincesInHeightmap({ modRoot: mod, gameRoot: GAME, dependencyRoots: [], provinceIds: [ERASED], drowned: true });
  ok(again.changed === false && read8(file).a.every((v, k) => v === after.a[k]), "a second sink of the same province writes nothing", again.rivers);
}

// ══ 2. the longest river ═════════════════════════════════════════════════════════════════════════════════
console.log("\n=== 2. a cut piece's main: its own course, or its longest river when that is too short ===");
{
  const mod = mkMod("longest");
  paintRivers(mod, GAME, [R4, T4]);
  const file = path.join(mod, "map", "rivers.bmp");
  const stub = R4.filter(([x, y]) => x >= 64 && y === 75 && x < T4[0][0]);
  const oldMain = R4.filter(([x]) => x >= 64).length;
  // the longest way up from R4's mouth: down R4 to the junction under T4's red, then up T4
  const longest = R4.filter(([x, y]) => (y === 75 && x >= T4[0][0]) || y > 75).length + T4.length;
  ok(oldMain < MIN && longest >= MIN, "THE CONTROL: following the old main the piece is too short, its longest river is not", { oldMain, longest, MIN });
  const r = erase(mod, GAME);
  const after = read8(file);
  const tHead = T4.reduce((a, b) => (b[1] < a[1] ? b : a));
  ok(after.a[at(tHead[0], tHead[1])] === GREEN, "⭐⭐⭐ the long tributary keeps its river: the source goes to its head", (r.heightmap || {}).rivers);
  ok(roleOf(after.pal, after.a[at(T4[0][0], T4[0][1])]) === "body", "⭐ …its red, in the middle of the river now, is body");
  const last = stub[stub.length - 1];
  ok(after.a[at(last[0], last[1])] === RED && stub.slice(0, -1).every(([x, y, v]) => after.a[at(x, y)] === v),
    "⭐⭐ …and the stub of the old main joins it as a tributary, its last pixel the red", stub.map(([x, y]) => after.a[at(x, y)]));
  const rivers = riversIn(after);
  ok(rivers.every((c) => c.greens.length === 1 && !c.lostReds.length), "every river has one source and every red a junction", rivers.map((c) => [c.greens.length, c.lostReds.length]));
  // the mirror of the red rule: where three river pixels meet, one of them is the red of the tributary that joins there
  const isR = (k) => roleOf(after.pal, after.a[k]) !== "bg";
  const junctions = [...after.a.keys()].filter((k) => isR(k) && nbrs(k).filter(isR).length >= 3);
  ok(junctions.every((k) => nbrs(k).some((j) => roleOf(after.pal, after.a[j]) === "red")),
    "⭐ …and every junction is marked: the stub's red stands beside it", junctions.map((k) => [k % W, (k - (k % W)) / W]));
}
{
  const mod = mkMod("owncourse");
  paintRivers(mod, GAME, [R6, T6]);
  const file = path.join(mod, "map", "rivers.bmp");
  const before = read8(file);
  const own = R6.filter(([x]) => x >= 64), ownHead = own[0];
  // the longest way up from R6's mouth: down to T6's junction, then up T6
  const longest = R6.filter(([x, y]) => (y === 60 && x >= T6[0][0]) || y > 60).length + T6.length;
  ok(own.length >= MIN && longest > own.length, "THE CONTROL: R6's own course below the cut stands alone, and T6's way up is longer still", { own: own.length, longest, MIN });
  const r = erase(mod, GAME);
  const after = read8(file);
  ok(after.a[at(ownHead[0], ownHead[1])] === GREEN, "⭐⭐⭐ the cut river keeps its own course: the source goes to its upstream end, not to the tributary's head", (r.heightmap || {}).rivers);
  ok(after.a[at(T6[0][0], T6[0][1])] === RED, "⭐ …and the tributary still joins it with its red");
  const t6Head = T6.reduce((a, b) => (b[1] < a[1] ? b : a));
  ok(after.a[at(t6Head[0], t6Head[1])] !== GREEN, "⭐ …and the tributary's head is not made a source", after.a[at(t6Head[0], t6Head[1])]);
  const changed = [...after.a.keys()].filter((k) => after.a[k] !== before.a[k] && !inB(k));
  ok(changed.length === 1 && changed[0] === at(ownHead[0], ownHead[1]), "⭐⭐ off the drowned land, that one pixel is all the cut changed", changed.map((k) => [k % W, (k - (k % W)) / W, before.a[k], after.a[k]]));
}
{
  // R4 again with its tributary two pixels below the cut: a stub that short is too small a river to keep (hoi4.exe logs "Too small
  // river found" for a walk of 2 or fewer from a marker), so it goes instead of becoming a tributary of its own
  const mod = mkMod("shortstub");
  paintRivers(mod, GAME, [R4, T4S]);
  const file = path.join(mod, "map", "rivers.bmp");
  const stub = R4.filter(([x, y]) => x >= 64 && y === 75 && x < T4S[0][0]);
  const longest = R4.filter(([x, y]) => (y === 75 && x >= T4S[0][0]) || y > 75).length + T4S.length;
  ok(stub.length > 0 && stub.length <= 2 && R4.filter(([x]) => x >= 64).length < MIN && longest >= MIN,
    "THE CONTROL: the old main is too short, the tributary's way is not, and 2 px or fewer of the old main are left above the junction", { stub: stub.length, longest, MIN });
  erase(mod, GAME);
  const after = read8(file);
  const tHead = T4S.reduce((a, b) => (b[1] < a[1] ? b : a));
  ok(after.a[at(tHead[0], tHead[1])] === GREEN, "the tributary's head is the source");
  ok(stub.every(([x, y]) => after.a[at(x, y)] === LAND_BG), "⭐⭐ …and the old main's 2-px stub is wiped to the land's background, not made a tributary", stub.map(([x, y]) => after.a[at(x, y)]));
}

// Off the drowned land, every pixel is as drawn except the ones `want` names (pixel → the index it should be now).
function offB(before, after, want) {
  const wrong = [];
  for (let k = 0; k < W * H; k++) {
    if (inB(k)) continue;
    const w = want.has(k) ? want.get(k) : before.a[k];
    if (after.a[k] !== w) wrong.push({ x: k % W, y: (k - (k % W)) / W, was: before.a[k], is: after.a[k], want: w });
  }
  return wrong;
}
const onSea = (x, y) => provAt(x, y) === 1;

// ══ 2b. which way a cut river flows ══════════════════════════════════════════════════════════════════════
console.log("\n=== 2b. which way a cut river flows: read from its own markers, not from one mouth (review RS2) ===");
{
  // (i) a flow-out whose split went under: the branch is a river of its own now, and its upstream end is the yellow
  const mod = mkMod("flowout");
  paintRivers(mod, GAME, [MY, BY]);
  const file = path.join(mod, "map", "rivers.bmp");
  const before = read8(file);
  const split = at(BY[0][0] - 1, BY[0][1]), far = BY[BY.length - 1];
  ok(inB(split) && MY.some(([x, y]) => at(x, y) === split) && BY.length >= MIN && onSea(far[0], far[1]),
    "THE CONTROL: the split is MY's pixel on B, the branch is long enough, and its far end runs into the sea", { len: BY.length, MIN });
  erase(mod, GAME);
  const after = read8(file);
  const want = new Map([[at(BY[0][0], BY[0][1]), GREEN]]);
  for (const [x, y] of MY) if (onSea(x, y)) want.set(at(x, y), SEA_BG);   // MY's run-on into the sea, cut from everything
  const wrong = offB(before, after, want);
  ok(after.a[at(BY[0][0], BY[0][1])] === GREEN, "⭐⭐⭐ the branch's yellow, its upstream end, is its source now — not its mouth in the sea", after.a[at(BY[0][0], BY[0][1])]);
  ok(wrong.length === 0, "⭐⭐ …and off the drowned land nothing else changed: the branch is not wiped", wrong.slice(0, 6));
  ok(riversIn(after).every((c) => c.greens.length === 1), "every river has one source", riversIn(after).map((c) => c.greens.length));
}
{
  // (i') …and when that branch is too short to stand alone but a long tributary joins it, the tributary takes the source and the
  // branch's upper stretch joins it as a tributary: its yellow, which marks a split that is gone, is body like the rest of it
  const mod = mkMod("flowout2");
  paintRivers(mod, GAME, [MY2, BY2, T2]);
  const file = path.join(mod, "map", "rivers.bmp");
  const before = read8(file);
  const j = BY2.find(([x]) => x === T2[0][0]), stub = BY2.filter(([x]) => x < j[0]), tHead = T2.reduce((a, b) => (b[1] < a[1] ? b : a));
  const ownLen = BY2.length, longest = BY2.filter(([x]) => x >= j[0]).length + T2.length;
  ok(inB(at(BY2[0][0] - 1, BY2[0][1])) && ownLen < MIN && longest >= MIN && stub.length >= 3, "THE CONTROL: the split is on B, the branch alone is too short, the way up the tributary is not, and the stub left is 3 px or more", { ownLen, longest, stub: stub.length, MIN });
  erase(mod, GAME);
  const after = read8(file);
  const want = new Map([[at(tHead[0], tHead[1]), GREEN], [at(stub[stub.length - 1][0], stub[stub.length - 1][1]), RED], [at(BY2[0][0], BY2[0][1]), BY2[1][2]], [at(T2[0][0], T2[0][1]), T2[1][2]]]);
  for (const [x, y] of MY2) if (onSea(x, y)) want.set(at(x, y), SEA_BG);
  const wrong = offB(before, after, want);
  ok(after.a[at(tHead[0], tHead[1])] === GREEN && after.a[at(stub[stub.length - 1][0], stub[stub.length - 1][1])] === RED, "the tributary's head is the source, and the branch's stub joins it with a red");
  ok(after.a[at(BY2[0][0], BY2[0][1])] !== YELLOW && wrong.length === 0, "⭐⭐ …and no yellow is left marking a split that went under: it is body", wrong.slice(0, 6));
}
{
  // (ii) a delta cut above its split: the main's own way to the sea is too short to stand alone, the way down the branch is not
  const mod = mkMod("delta");
  paintRivers(mod, GAME, [MD, DB]);
  const file = path.join(mod, "map", "rivers.bmp");
  const before = read8(file);
  const head = MD.find(([x]) => x === 64), own = MD.filter(([x]) => x >= 64).length;
  const viaBranch = DB.length + MD.filter(([x, y]) => y === 70 && x >= 64 && x <= DB[0][0]).length, far = DB[DB.length - 1];
  const system = riversIn(before).find((c) => c.greens.includes(at(MD[0][0], MD[0][1])));
  ok(own < MIN && viaBranch >= MIN && onSea(far[0], far[1]) && !!system && DB.every(([x, y]) => system.px.includes(at(x, y))),
    "THE CONTROL: below the cut the main's own course is too short, the way down its branch is not, both reach the sea, and they are one river", { own, viaBranch, MIN });
  erase(mod, GAME);
  const after = read8(file);
  const wrong = offB(before, after, new Map([[at(head[0], head[1]), GREEN]]));
  ok(after.a[at(head[0], head[1])] === GREEN, "⭐⭐⭐ the source goes at the cut, upstream of the split — not at the branch's mouth in the sea", after.a[at(head[0], head[1])]);
  ok(DB.filter(([x, y]) => !onSea(x, y)).every(([x, y]) => roleOf(after.pal, after.a[at(x, y)]) !== "bg"), "⭐⭐ …the branch is not wiped");
  ok(after.a[at(DB[0][0], DB[0][1])] !== GREEN, "⭐ …nor given a source of its own at its yellow: it is fed by the river above the split", after.a[at(DB[0][0], DB[0][1])]);
  ok(after.a[at(DB[0][0], DB[0][1])] === YELLOW && wrong.length === 0, "⭐⭐ …the flow-out is still a flow-out, and nothing else off the drowned land changed", wrong.slice(0, 6));
}
{
  // (iii) two rivers whose sources touch: each flows from its own source, so the one read second is not read backwards
  const mod = mkMod("twogreens");
  paintRivers(mod, GAME, [A2, B2]);
  const file = path.join(mod, "map", "rivers.bmp");
  const before = read8(file);
  const heads = [A2, B2].map((r) => r.find(([x]) => x === 64));
  const farB = B2[B2.length - 1];
  ok(Math.abs(A2[0][1] - B2[0][1]) + Math.abs(A2[0][0] - B2[0][0]) === 1 && heads.every(Boolean) && onSea(farB[0], farB[1]),
    "THE CONTROL: the two sources are 4-neighbours, both rivers cross B, and B2 runs into the sea");
  erase(mod, GAME);
  const after = read8(file);
  const wrong = offB(before, after, new Map(heads.map(([x, y]) => [at(x, y), GREEN])));
  ok(heads.every(([x, y]) => after.a[at(x, y)] === GREEN), "⭐⭐⭐ both cut rivers get their source at the cut", heads.map(([x, y]) => after.a[at(x, y)]));
  ok(wrong.length === 0, "⭐⭐ …and off the drowned land nothing else changed: neither is wiped from its mouth", wrong.slice(0, 6));
}

// ══ 2c. what the cut leaves of the markers ═══════════════════════════════════════════════════════════════
console.log("\n=== 2c. no red inside a 2x2 block, no red left with 2 px of river or fewer (review RS3) ===");
{
  // a 2x2 block on the main below the cut is the main's own drawing, not a stub beside it: re-sourcing leaves it as drawn
  const mod = mkMod("block");
  paintRivers(mod, GAME, [RB, RB_BLOCK]);
  const file = path.join(mod, "map", "rivers.bmp");
  const before = read8(file);
  const [bx, by] = RB_BLOCK[0];
  const block = [[bx, by], [bx - 1, by], [bx, by + 1], [bx - 1, by + 1]];
  const head = RB.find(([x]) => x === 64);
  ok(block.every(([x, y]) => roleOf(before.pal, before.a[at(x, y)]) !== "bg") && RB.filter(([x]) => x >= 64).length >= MIN, "THE CONTROL: RB carries a 2x2 block below the cut, and is long enough to keep");
  erase(mod, GAME);
  const after = read8(file);
  const wrong = offB(before, after, new Map([[at(head[0], head[1]), GREEN]]));
  ok(after.a[at(head[0], head[1])] === GREEN && wrong.length === 0, "⭐⭐ the source goes at the cut and the block is left as drawn: no red inside it, nothing wiped", wrong.slice(0, 6));
}
for (const [tag, main, trib, untouched] of [["zeroarm", M4, TZ, TP], ["shortarm", M5, TS, []]]) {
  // a tributary the erase took up to its red (or to a pixel short of it): the red has no river left to mark — hoi4.exe's "Too small
  // river found" for a walk of 2 or fewer from a marker — so it goes, and the part of the tributary beyond the cut is judged alone
  const mod = mkMod(tag);
  paintRivers(mod, GAME, [main, trib, untouched]);
  const file = path.join(mod, "map", "rivers.bmp");
  const before = read8(file);
  const left = trib.filter(([x, y]) => !inB(at(x, y)) && x >= 64), beyond = trib.filter(([x]) => x < 40);
  const beyondHead = beyond.reduce((a, b) => (b[0] < a[0] ? b : a));
  ok(left.length >= 1 && left.length <= 2 && left.some(([, , v]) => v === RED) && beyond.length >= MIN,
    `THE CONTROL (${tag}): ${left.length} px of the tributary, its red among them, stand beside the main after the cut, and the part beyond B is long enough`, { left: left.length, beyond: beyond.length, MIN });
  erase(mod, GAME);
  const after = read8(file);
  const want = new Map(left.map(([x, y]) => [at(x, y), LAND_BG]));
  want.set(at(beyondHead[0], beyondHead[1]), GREEN);
  const wrong = offB(before, after, want);
  ok(left.every(([x, y]) => roleOf(after.pal, after.a[at(x, y)]) === "bg"), `⭐⭐ (${tag}) the red and what is left of its tributary beside the main are wiped`, left.map(([x, y]) => after.a[at(x, y)]));
  if (untouched.length) ok(untouched.every(([x, y, v]) => after.a[at(x, y)] === v), `⭐ (${tag}) …but a ${untouched.length}-px tributary the cut never reached is the modder's, and stays`, untouched.map(([x, y]) => after.a[at(x, y)]));
  ok(wrong.length === 0 && riversIn(after).every((c) => c.greens.length === 1 && !c.lostReds.length), `⭐ (${tag}) …the main is left as drawn, and the tributary's far part has a source of its own`, wrong.slice(0, 6));
}

// ══ 3. never a source on the sea ═════════════════════════════════════════════════════════════════════════
console.log("\n=== 3. a piece whose new head stands on water: trimmed back off the sea, kept on a lake (review RS1) ===");
{
  // A whole river was wiped because its new upstream end stood on the sea: 659 px of Millennium Dawn's, 649 of them on standing land
  // and the last 10 over a sea province. The sea goes; the source goes on the first pixel of land after it. One pixel of it here.
  const mod = mkMod("seahead");
  paintRivers(mod, GAME, [RN]);
  const file = path.join(mod, "map", "rivers.bmp");
  const before = read8(file);
  const down = RN.filter(([x]) => x >= 64), wet = down.filter(([x, y]) => WATER.has(provAt(x, y)));
  const firstLand = down.find(([x, y]) => !WATER.has(provAt(x, y)));
  ok(wet.length === 1 && onSea(down[0][0], down[0][1]) && down.length - wet.length >= MIN, "THE CONTROL: the cut piece begins on one pixel of SEA, and the rest of it is long enough", { wet: wet.length, len: down.length, MIN });
  erase(mod, GAME);
  const after = read8(file);
  const want = new Map(wet.map(([x, y]) => [at(x, y), SEA_BG]));
  want.set(at(firstLand[0], firstLand[1]), GREEN);
  const wrong = offB(before, after, want);
  ok(after.a[at(firstLand[0], firstLand[1])] === GREEN, "⭐⭐⭐ the source goes on the first pixel of land past the sea pixel", after.a[at(firstLand[0], firstLand[1])]);
  ok(down.filter(([x, y]) => !WATER.has(provAt(x, y))).every(([x, y]) => roleOf(after.pal, after.a[at(x, y)]) !== "bg"), "⭐⭐⭐ …so the river is kept: not one pixel of it on land is wiped");
  ok(wet.every(([x, y]) => roleOf(after.pal, after.a[at(x, y)]) !== "body"), "⭐ …and no river is left standing on the sea above its new source", wet.map(([x, y]) => after.a[at(x, y)]));
  ok(wrong.length === 0, "⭐⭐ …the sea pixel goes to the sea background, and the rest of the river stays as drawn", wrong.slice(0, 6));
  const greensOnSea = [...after.a.keys()].filter((k) => roleOf(after.pal, after.a[k]) === "green" && onSea(k % W, (k - (k % W)) / W));
  ok(greensOnSea.length === 0, "⭐⭐ no source is painted on the sea", greensOnSea.map((k) => [k % W, (k - (k % W)) / W]));
}
{
  // …and what joined the river out on that sea is not wiped with it. TI empties into RI on the inlet, above RI's last pixel of land:
  // wiping everything above the new head took TI too, all of it on standing land. Cut off by the trim, TI is a river of its own now,
  // ending at the sea where it always met RI.
  const mod = mkMod("inlet");
  paintRivers(mod, GAME, [RI, TI]);
  const file = path.join(mod, "map", "rivers.bmp");
  const before = read8(file);
  const down = RI.filter(([x]) => x >= 64), wet = down.filter(([x, y]) => onSea(x, y));
  const firstLand = down.find(([x, y]) => !onSea(x, y)), red = TI[0], tiHead = TI.reduce((a, p) => (p[1] < a[1] ? p : a));
  ok(wet.length === 2 && onSea(down[0][0], down[0][1]) && !onSea(red[0], red[1]) && onSea(red[0], red[1] + 1) && TI.slice(1).every(([x, y]) => provAt(x, y) === 4)
    && down.length - wet.length >= MIN && TI.length >= MIN,
    "THE CONTROL: RI's cut piece begins on two pixels of SEA, TI joins it there from the land, and both are long enough on land", { wet: wet.length, len: down.length, ti: TI.length, MIN });
  erase(mod, GAME);
  const after = read8(file);
  const want = new Map(wet.map(([x, y]) => [at(x, y), SEA_BG]));
  want.set(at(firstLand[0], firstLand[1]), GREEN);
  want.set(at(tiHead[0], tiHead[1]), GREEN);
  want.set(at(red[0], red[1]), 3);
  const wrong = offB(before, after, want);
  const tiGone = TI.filter(([x, y]) => roleOf(after.pal, after.a[at(x, y)]) === "bg");
  ok(tiGone.length === 0, "⭐⭐⭐ the tributary that joined the river on the sea is kept: not one pixel of it is wiped", tiGone.length);
  ok(after.a[at(tiHead[0], tiHead[1])] === GREEN, "⭐⭐ …it is a river of its own, with a source at its head", after.a[at(tiHead[0], tiHead[1])]);
  ok(after.a[at(red[0], red[1])] === 3, "⭐⭐ …its red, which joins nothing now, is the body it continues, ending at the sea", after.a[at(red[0], red[1])]);
  ok(after.a[at(firstLand[0], firstLand[1])] === GREEN, "⭐ RI's source goes on its first pixel of land past the inlet", after.a[at(firstLand[0], firstLand[1])]);
  ok(wrong.length === 0, "⭐⭐ …and nothing else changed: the inlet's two pixels go to the sea background", wrong.slice(0, 6));
}
{
  // …and a head on a LAKE stays there: vanilla puts 14 of its 317 sources on a lake, 11 of them five or more pixels into it
  const mod = mkMod("lake");
  paintRivers(mod, GAME, [R5]);
  const file = path.join(mod, "map", "rivers.bmp");
  const before = read8(file);
  const down = R5.filter(([x]) => x >= 64);
  ok(down.length >= MIN && provAt(down[0][0], down[0][1]) === 5, "THE CONTROL: the piece is long enough, and its upstream end is on the lake", { len: down.length, MIN });
  erase(mod, GAME);
  const after = read8(file);
  const wrong = offB(before, after, new Map([[at(down[0][0], down[0][1]), GREEN]]));
  ok(after.a[at(down[0][0], down[0][1])] === GREEN, "⭐⭐⭐ the source goes on the piece's upstream end, on the lake", after.a[at(down[0][0], down[0][1])]);
  ok(wrong.length === 0, "⭐⭐ …and the river is kept as drawn: not wiped", wrong.slice(0, 6));
}

// ══ 4. the paint brush ═══════════════════════════════════════════════════════════════════════════════════
console.log("\n=== 4. a land-to-sea paint stroke takes the rivers under it too ===");
{
  const mod = mkMod("paint");
  paintRivers(mod, GAME, [R1]);
  const file = path.join(mod, "map", "rivers.bmp");
  const diff = [];
  for (let x = 100; x <= 103; x++) for (let y = 10; y <= 14; y++) diff.push({ x, y, r: COL[1][0], g: COL[1][1], b: COL[1][2] });
  const painted = new Set(diff.map((d) => at(d.x, d.y)));
  const under = R1.filter(([x, y]) => painted.has(at(x, y)));
  ok(under.length > 0, `THE CONTROL: the stroke covers ${under.length} of R1's pixels`, under.length);
  const r = md.applyProvinceDiff({ modRoot: mod, gameRoot: GAME, dependencyRoots: [], diff });
  ok(r.ok === true && r.heightmap && r.heightmap.sunk === painted.size, "the paint applied and sank every painted pixel", r.error || r.heightmap);
  const after = read8(file);
  ok(under.every(([x, y]) => after.a[at(x, y)] === SEA_BG), "⭐⭐⭐ the river pixels under the stroke are gone", (r.heightmap || {}).rivers);
  const below = R1.filter(([x]) => x > 103);
  ok(after.a[at(below[0][0], below[0][1])] === GREEN, "⭐ …and the river beyond the stroke has a source of its own");
  ok(riversIn(after).every((c) => c.greens.length === 1), "every river has one source");
}
{
  // …and only on the pixels it LOWERED: one Save can carry strokes both ways, and the river over the land a stroke raised stays
  const mod = mkMod("paint2");
  paintRivers(mod, GAME, [R1]);
  const file = path.join(mod, "map", "rivers.bmp");
  const diff = [];
  for (let x = 100; x <= 103; x++) for (let y = 10; y <= 14; y++) diff.push({ x, y, r: COL[1][0], g: COL[1][1], b: COL[1][2] });
  const raised = new Set();
  for (let x = 150; x <= 152; x++) for (let y = 11; y <= 13; y++) { diff.push({ x, y, r: COL[4][0], g: COL[4][1], b: COL[4][2] }); raised.add(at(x, y)); }
  const onRaised = R1.filter(([x, y]) => raised.has(at(x, y)));
  ok(onRaised.length > 0 && onRaised.every(([x, y]) => onSea(x, y)), `THE CONTROL: the stroke also paints land over ${onRaised.length} of R1's pixels in the sea`, onRaised.length);
  const r = md.applyProvinceDiff({ modRoot: mod, gameRoot: GAME, dependencyRoots: [], diff });
  ok(r.ok === true && r.heightmap && r.heightmap.raised > 0 && r.heightmap.sunk > 0, "the paint went both ways", r.error || r.heightmap);
  const after = read8(file);
  ok(onRaised.every(([x, y, v]) => after.a[at(x, y)] === v), "⭐⭐ the river over the land the stroke raised is left as it was", onRaised.map(([x, y]) => after.a[at(x, y)]));
}

// ══ 5. a mod that does not own rivers.bmp ════════════════════════════════════════════════════════════════
console.log("\n=== 5. the mod takes its own copy only when a river stood on the drowned land ===");
{
  const mod = mkMod("noriver");
  const r = erase(mod, GAME);
  ok(r.changed === true && !fs.existsSync(path.join(mod, "map", "rivers.bmp")), "⭐⭐ no river on B: the erase leaves the mod without a rivers.bmp", (r.heightmap || {}).rivers);
}
{
  const GAME2 = makeGame(R1);
  const min2 = learntMinMain(path.join(GAME2, "map", "rivers.bmp"));
  const mod = mkMod("inherit");
  const r = erase(mod, GAME2);
  const rv = (r.heightmap && r.heightmap.rivers) || {};
  const file = path.join(mod, "map", "rivers.bmp");
  ok(fs.existsSync(file) && rv.materialized === true && rv.minMain === min2, "⭐⭐ R1 inherited across B: the mod takes its copy, and says so", rv);
  const after = fs.existsSync(file) ? read8(file) : null;
  ok(!!after && R1.filter(([x, y]) => inB(at(x, y))).every(([x, y]) => after.a[at(x, y)] === SEA_BG), "⭐ …with the river off the drowned land");
  ok(fs.readFileSync(path.join(GAME2, "map", "rivers.bmp")).equals(makeGameRivers(R1)), "…and the base game's file untouched");
  // the page names it — lifted (testlib-map-page: LF, comment-masked anchors) and RUN, with the erase's own answer
  let note = null;
  try { note = new Function(page.lift("function heightmapNote(hm) {") + "\nreturn heightmapNote;")(); } catch (_) { note = null; }
  const said = typeof note === "function" ? note(r.heightmap) : "";
  ok(!rv.materialized || /map\/rivers\.bmp/.test(said), "⭐⭐ the page's note names map/rivers.bmp among the files the erase took the mod its own copy of", said);
  ok(rv.pixels > 0 && new RegExp(String(rv.pixels) + " river pixels? .*taken off").test(said), "⭐ …and says how many river pixels were taken off the drowned land", said);
  const quiet = typeof note === "function" ? note({ ...r.heightmap, rivers: { changed: false, pixels: 0 } }) : "x";
  ok(!/rivers/.test(quiet), "…and says nothing about rivers on a click that did not touch them", quiet);
  // ⭐ review RS4: every erase after the first on a world finds the mod already owning each file it writes, so nothing is acquired —
  // and the rivers it took, gave a source or wiped, outside the erased province too, must still be said. The same answer, owned.
  const owned = JSON.parse(JSON.stringify(r.heightmap), (k, v) => (k === "materialized" ? false : v));
  const saidOwned = typeof note === "function" ? note(owned) : "";
  ok(new RegExp(String(rv.pixels) + " river pixels? .*taken off").test(saidOwned) && /map\/rivers\.bmp/.test(saidOwned),
    "⭐⭐ …and says it, naming rivers.bmp, when the mod already owned every file the click wrote", saidOwned);
  const quietOwned = typeof note === "function" ? note({ ...owned, rivers: { changed: false, pixels: 0 } }) : "x";
  ok(!/rivers/.test(quietOwned), "…and on such a mod says nothing about rivers when none was touched", quietOwned);
}
function makeGameRivers(extra) {
  const riv = new Map();
  for (const [x, y, v] of LEARN.concat(extra || [])) riv.set(y * W + x, v);
  return bmp8((x, y) => (riv.has(y * W + x) ? riv.get(y * W + x) : WATER.has(provAt(x, y)) ? 254 : 255), PAL);
}

// ══ 6. Delete map ════════════════════════════════════════════════════════════════════════════════════════
console.log("\n=== 6. Delete map clears every river itself, and its sink leaves them to it ===");
{
  const mod = mkMod("blank", { "map/provinces.bmp": fs.readFileSync(path.join(GAME, "map", "provinces.bmp")), "map/definition.csv": DEF });
  paintRivers(mod, GAME, [R1, R2]);
  const file = path.join(mod, "map", "rivers.bmp");
  const before = read8(file), raw = fs.readFileSync(file);
  // what clearAllRivers alone writes: every saturated, not near-white index → the first mid-grey of the palette
  const firstGrey = PAL.findIndex((c) => greyish(c) && c[0] > 40 && c[0] < 210);
  const want = Buffer.from(raw), off = raw.readUInt32LE(10), rs = (W + 3) & ~3;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const o = off + (H - 1 - y) * rs + x, c = PAL[raw[o]];
    if (!greyish(c) && !(c[0] >= 245 && c[1] >= 245 && c[2] >= 245)) want[o] = firstGrey;
  }
  ok(firstGrey === 100 && before.a.some((v) => roleOf(before.pal, v) !== "bg"), "THE CONTROL: rivers to clear, and a clear-all index that is not the sea background", { firstGrey, SEA_BG });
  const r = md.blankMapToSea({ modRoot: mod, gameRoot: GAME, dependencyRoots: [] });
  ok(r.changed === true && r.rivers && r.rivers.changed === true, "Delete map ran and cleared the rivers", r.error || r.rivers);
  ok(fs.readFileSync(file).equals(want), "⭐⭐⭐ rivers.bmp is byte for byte what clearing every river writes — the sink did not get there first");
  ok(!!(r.heightmap && r.heightmap.rivers && r.heightmap.rivers.skipped && !r.heightmap.rivers.changed), "⭐ …and its sink said it left the rivers to the clear", r.heightmap && r.heightmap.rivers);
}

// ══ 7. Auto-fix's settle of an old coast ═════════════════════════════════════════════════════════════════
console.log("\n=== 7. Auto-fix settles an old coast under the sea: its rivers go too, and the line names rivers.bmp ===");
{
  // B is low shore in the layer below, under the waterline, and sea in the mod, which owns the heightmap the old sink left it: the
  // fingerprint findDrownedCoast hands Auto-fix, whose settle runs through the same sink as the erase
  const GAME3 = makeGame(null, { bHeight: md.HEIGHTMAP_SEA_LEVEL - 1 });
  const def = DEF.replace("3;0;200;0;land;true;plains;1", "3;0;200;0;sea;false;ocean;0");
  const mod = mkMod("settle", { "map/definition.csv": def, "map/heightmap.bmp": fs.readFileSync(path.join(GAME3, "map", "heightmap.bmp")) });
  paintRivers(mod, GAME3, [R1]);
  const ctx = { modRoot: mod, gameRoot: GAME3, dependencyRoots: [] };
  const f0 = md.findDrownedCoast(ctx);
  ok(def !== DEF && f0.provinceIds.length === 1 && f0.provinceIds[0] === ERASED, "THE CONTROL: the old coast under the sea is B's, and Map Errors finds it", f0);
  const hashTree = (root) => {
    const out = {};
    const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else out[path.relative(root, p).split(path.sep).join("/")] = crypto.createHash("sha1").update(fs.readFileSync(p)).digest("hex"); } };
    walk(root);
    return out;
  };
  const tree0 = hashTree(mod);
  const r = md.settleDrownedSeaFloor(ctx);
  const after = read8(path.join(mod, "map", "rivers.bmp"));
  const onB = R1.filter(([x, y]) => inB(at(x, y)));
  ok(r.changed === true && !!r.rivers && r.rivers.changed === true && onB.every(([x, y]) => after.a[at(x, y)] === SEA_BG),
    "⭐⭐ the settle took R1 off the land it lowered", r.rivers);
  const tree1 = hashTree(mod);
  const written = Object.keys(tree1).filter((f) => tree1[f] !== tree0[f] && /^(map|gfx)\//.test(f)).sort();
  const said = page.autoFixSummary({ ok: true, fixes: { drownedCoast: r } });
  ok(written.includes("map/rivers.bmp"), "THE CONTROL: the settle rewrote map/rivers.bmp", written);
  ok(written.every((f) => said.includes(f)), "⭐⭐⭐ the Auto-fix line names every file the settle wrote, rivers.bmp among them", { missing: written.filter((f) => !said.includes(f)), said });
}

// ══ 8. the page's river overlay ══════════════════════════════════════════════════════════════════════════
console.log("\n=== 8. a Save whose erase or paint changed rivers.bmp on the server reloads the river overlay ===");
{
  // The overlay reload at the end of a Save is gated on staged river edits or riversWrittenByServer, which only Delete map's answer
  // set (#delete-map-leaves-the-rivers-running). Every write whose heightmap the page reads — the Save loop's and the paint's — must set
  // it from that heightmap's rivers, or the river stays drawn over the new sea. Derived from the page's comment-masked text.
  const P = page.MASKED, OPEN = "if (res.heightmap && res.heightmap.pixels) {";
  const blockAt = (s) => { let d = 0; for (let i = P.indexOf("{", s); i < P.length; i++) { if (P[i] === "{") d++; else if (P[i] === "}" && --d === 0) return P.slice(s, i + 1); } return ""; };
  const blocks = [];
  for (let s = P.indexOf(OPEN); s >= 0; s = P.indexOf(OPEN, s + 1)) blocks.push(blockAt(s));
  const calls = P.split("heightmapNote(res.heightmap)").length - 1;
  const noted = blocks.filter((b) => b.includes("heightmapNote(res.heightmap)"));
  ok(calls > 0 && noted.length === calls, `THE CONTROL: each of the page's ${calls} heightmapNote(res.heightmap) calls sits in a write's heightmap block`, { calls, blocks: blocks.length, noted: noted.length });
  // one check per block, named by the line its notes go to (writeWarnings: the Save loop's writes; paintWarnings: the paint)
  for (const b of noted) {
    const line = (b.match(/\b(\w+Warnings)\b/) || [])[1] || "(no warnings line)";
    ok(/if \(res\.heightmap\.rivers && res\.heightmap\.rivers\.changed\) riversWrittenByServer = true;/.test(b),
      `⭐⭐ the block that writes to ${line} flags the river overlay for a reload when the write changed rivers.bmp`);
  }
}

// ══ 9. what the pass must leave alone ════════════════════════════════════════════════════════════════════
console.log("\n=== 9. a raise takes no river, and the sea background is voted from water this write did not drown (review RS5) ===");
{
  // a lake made land is a RAISE through the same sink: the river crossing the lake stays exactly as drawn
  const mod = mkMod("raise");
  paintRivers(mod, GAME, [R5]);
  const file = path.join(mod, "map", "rivers.bmp");
  const raw = fs.readFileSync(file);
  const r = md.setProvinceDefinition({ modRoot: mod, gameRoot: GAME, dependencyRoots: [], provinceId: 5, type: "land", terrain: "plains" });
  ok(R5.some(([x, y]) => provAt(x, y) === 5) && r.changed === true && !!r.heightmap && r.heightmap.changed === true && r.heightmap.pixels > 0,
    "THE CONTROL: R5 crosses the lake, and the lake was made land and raised", r.error || r.heightmap);
  ok(fs.readFileSync(file).equals(raw), "⭐⭐ rivers.bmp is byte for byte as it was: a raise takes no river", r.heightmap && r.heightmap.rivers);
}
{
  // C is erased, and C alone is larger than all the water on the map: a vote that counted the drowned pixels would pick the land's
  // background as the sea's
  const mod = mkMod("bigerase");
  paintRivers(mod, GAME, [R1]);
  const file = path.join(mod, "map", "rivers.bmp");
  const C = 4, isC = (k) => provAt(k % W, (k - (k % W)) / W) === C;
  let cPx = 0, water = 0;
  for (let k = 0; k < W * H; k++) { if (isC(k)) cPx++; else if (WATER.has(provAt(k % W, (k - (k % W)) / W))) water++; }
  ok(cPx > water, "THE CONTROL: C has more pixels than all the water on the map", { cPx, water });
  const r = md.flipProvinceToSea({ modRoot: mod, gameRoot: GAME, dependencyRoots: [], provinceId: C });
  const after = read8(file);
  const onC = R1.filter(([x, y]) => isC(at(x, y)));
  ok(r.changed === true && onC.length > 0 && onC.every(([x, y]) => after.a[at(x, y)] === SEA_BG),
    "⭐⭐ R1's pixels over C went back to the SEA background, voted from the water this write did not drown", [...new Set(onC.map(([x, y]) => after.a[at(x, y)]))]);
}

for (const d of tmps) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} }
console.log(`\n${fails.length ? "FAILED" : "PASSED"}: ${pass} ok, ${fails.length} failed`);
if (fails.length) { for (const f of fails) console.log("  - " + f); process.exit(1); }
