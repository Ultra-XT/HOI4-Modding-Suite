// Two small worlds for the generated-rivers tests, and the test's OWN judges of what was drawn. #a-generated-world-has-no-rivers
//
// ⚠️ NOT NAMED test-*.js ON PURPOSE — run-tests.js enumerates `test-*.js` and would execute a helper as a test file.
//
// THE SAMPLE — what a map below looks like (gridSample): 640x256, square provinces of 16 px, sea west of x 48, and rivers drawn
// BY HAND along province borders, the way shipping maps draw them: mains along the rows y = 16j - 1 (the last row of one band
// of squares, against the next) from a green head down to the coast and 3 px on into the sea, narrow (3) then middling (6) then
// wide (11); tributaries along the columns x = 16i + 47, narrow, their last pixel red beside the main. Four long mains carry
// the tributaries; four short ones near the coast set the floor. Every number a test expects of it is counted off the arrays by
// the test, never typed in.
// THE TARGET — what Generate land raises (voronoiWorld): 512x256, Voronoi provinces of about 18 px, sea west of x 100 and a
// round lake, the ground rising inland with bumps (rivers/synth.js, the designer's fixture). Its heightmap and the sample's are
// one formula, so the sample's climbs are the target's kind of climb.
//
// The judges are written from the wiki's description of a river, NOT from map-data.js, so a planner and its gate cannot agree
// with each other by sharing a bug: a river is a tree hanging from its one green; its main runs from the green to the end not
// reached through a red; each red is a tributary's last pixel.
"use strict";

const fs = require("fs");
const path = require("path");

// vanilla's palette layout (all nine installed rivers.bmp share it): 0 green, 1 red, 2 yellow, 3..11 the widths, 254 grey,
// 255 white, everything else a near-black grey
const BLUES = [[0, 225, 255], [0, 200, 255], [0, 150, 255], [0, 100, 255], [0, 0, 255], [0, 0, 225], [0, 0, 200], [0, 0, 150], [0, 0, 100]];
const PALETTE = Array.from({ length: 256 }, (_, i) => {
  const c = i === 0 ? [0, 255, 0] : i === 1 ? [255, 0, 0] : i === 2 ? [255, 252, 0] : i >= 3 && i <= 11 ? BLUES[i - 3]
    : i === 254 ? [122, 122, 122] : i === 255 ? [255, 255, 255] : [2, 0, 1];
  return { r: c[0], g: c[1], b: c[2] };
});
const GREEN = 0, RED = 1, BG = 255, SEA_BG = 254;
const isRiverIndex = (v) => v <= 11;

function mix(a, b) { let h = (Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1)) | 0; h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d); h = Math.imul(h ^ (h >>> 13), 0x297a2d39); return (h ^ (h >>> 16)) >>> 0; }
const groundAt = (x, y, coast) => Math.min(250, 96 + Math.round((x - coast) * 0.15 + 10 * Math.sin(x / 23) * Math.cos(y / 17)));

/** The target: { W, H, N, pid, land, water, type (1 land, 2 sea, 3 lake), height }. `ground(x, y)` replaces the heights. */
function voronoiWorld({ W = 512, H = 256, coast = 100, lake = { x: 330, y: 130, r: 14 }, ground = null } = {}) {
  const N = W * H, seeds = [];
  for (let gy = 0; gy < H; gy += 18) for (let gx = 0; gx < W; gx += 18) seeds.push([gx + (mix(gx, gy) % 14), gy + (mix(gy, gx + 7) % 14)]);
  const pid = new Int32Array(N), land = new Uint8Array(N), water = new Uint8Array(N), type = new Uint8Array(N), height = new Uint8Array(N);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let best = 0, bd = Infinity;
    for (let i = 0; i < seeds.length; i++) { const dx = seeds[i][0] - x, dy = seeds[i][1] - y, d = dx * dx + dy * dy; if (d < bd) { bd = d; best = i; } }
    const k = y * W + x, inLake = !!lake && Math.hypot(x - lake.x, y - lake.y) < lake.r;
    if (x < coast || inLake) { water[k] = 1; pid[k] = x < coast ? 100000 : 100001; type[k] = x < coast ? 2 : 3; height[k] = 89; continue; }
    land[k] = 1; pid[k] = best + 1; type[k] = 1; height[k] = ground ? ground(x, y) : groundAt(x, y, coast);
  }
  return { W, H, N, pid, land, water, type, height, seeds };
}

/** A T of border lanes, so the plan's rivers are known before it is drawn: province 1 the south band (y >= ym), provinces 2 and 3 the
 *  north blocks either side of x = xb, the sea a strip at the EAST edge (x >= coast). planGeneratedRivers draws on one side of each
 *  border (the lower id's), so the lanes are province 1's top row, from the coast inland — a main — and province 2's east column,
 *  from the top of the map down to that row — the one place a tributary can join it, at (xb − 1, ym). `ground(x, y)` the heights. */
function teeWorld({ W = 240, H = 160, ym = 90, xb = 180, coast = 232, ground }) {
  const N = W * H, pid = new Int32Array(N), land = new Uint8Array(N), water = new Uint8Array(N), height = new Uint8Array(N);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const k = y * W + x;
    if (x >= coast) { water[k] = 1; pid[k] = 9000; height[k] = 89; continue; }
    land[k] = 1; pid[k] = y >= ym ? 1 : x < xb ? 2 : 3; height[k] = ground(x, y);
  }
  return { W, H, N, pid, land, water, height, ym, xb, coast };
}

const SAMPLE_MAINS = [{ y: 15, head: 600 }, { y: 79, head: 520 }, { y: 143, head: 560 }, { y: 207, head: 480 }, { y: 47, head: 80 }, { y: 111, head: 85 }, { y: 175, head: 90 }, { y: 239, head: 78 }];
const SAMPLE_TRIBS = [{ x: 559, y0: 130, yMain: 15 }, { x: 575, y0: 230, yMain: 15 }, { x: 495, y0: 130, yMain: 79 }, { x: 527, y0: 240, yMain: 143 }, { x: 463, y0: 150, yMain: 207 },
  { x: 127, y0: 45, yMain: 15 }, { x: 191, y0: 50, yMain: 79 }, { x: 255, y0: 112, yMain: 143 }, { x: 319, y0: 245, yMain: 207 }];

/** The sample: { W, H, N, idx, palette, type, pid, height } — riversLearntFromMap's own input shape. */
function gridSample({ W = 640, H = 256, coast = 48, mains = SAMPLE_MAINS, tribs = SAMPLE_TRIBS, runOn = 3 } = {}) {
  const N = W * H;
  const pid = new Int32Array(N), type = new Uint8Array(N), height = new Uint8Array(N), idx = new Uint8Array(N).fill(BG);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const k = y * W + x;
    if (x < coast) { pid[k] = 9000; type[k] = 2; height[k] = 89; idx[k] = SEA_BG; continue; }
    pid[k] = 1 + Math.floor((x - coast) / 16) + 100 * Math.floor(y / 16); type[k] = 1; height[k] = groundAt(x, y, coast);
  }
  for (const { y, head } of mains) {
    const len = head - coast + 1;
    for (let x = head; x >= coast - runOn; x--) { const t = (head - x) / len; idx[y * W + x] = x === head ? GREEN : t < 1 / 3 ? 3 : t < 2 / 3 ? 6 : 11; }
  }
  for (const { x, y0, yMain } of tribs) {
    const step = y0 < yMain ? 1 : -1;
    for (let y = y0; y !== yMain; y += step) idx[y * W + x] = y + step === yMain ? RED : 3;
  }
  return { W, H, N, idx, palette: PALETTE, type, pid, height };
}

const nb4 = (W, N, k) => { const x = k % W, o = []; if (x + 1 < W) o.push(k + 1); if (x > 0) o.push(k - 1); if (k + W < N) o.push(k + W); if (k >= W) o.push(k - W); return o; };

/** The test's own border share: land-land pixel pairs (two provinces) — with `side`, only those with a pixel of it on a side —
 *  and how many have a river pixel on a side. `isRiver(k)`. */
function borderShareOf({ W, H, isLand, pid, isRiver, side = null }) {
  const N = W * H;
  let pairs = 0, withRiver = 0;
  for (let k = 0; k < N; k++) {
    if (!isLand(k)) continue;
    for (const j of [k % W + 1 < W ? k + 1 : -1, k + W < N ? k + W : -1]) {
      if (j < 0 || !isLand(j) || pid[j] === pid[k] || (side && !side[k] && !side[j])) continue;
      pairs++; if (isRiver(k) || isRiver(j)) withRiver++;
    }
  }
  return { pairs, withRiver, share: pairs ? withRiver / pairs : 0 };
}

/** On a province border, or beside one: a land pixel with a 4-neighbour in another land province, or 4-next to such a pixel. */
function nearBorder(world, k) {
  const { W, N, land, pid } = world;
  const on = (q) => land[q] && nb4(W, N, q).some((j) => land[j] && pid[j] !== pid[q]);
  return on(k) || nb4(W, N, k).some((j) => land[j] && on(j));
}

/** Read every river of an index array as a tree hanging from its green. Per component: its greens, whether it has a cycle, its
 *  main (green → the end not reached through a red), its tributaries (head → red), and the width checks. */
function riverTrees({ W, H, idx }) {
  const N = W * H, isR = (k) => isRiverIndex(idx[k]);
  const deg = (k) => nb4(W, N, k).filter(isR).length;
  const seen = new Uint8Array(N), out = [];
  for (let s = 0; s < N; s++) {
    if (!isR(s) || seen[s]) continue;
    const px = [s]; seen[s] = 1;
    for (let i = 0; i < px.length; i++) for (const j of nb4(W, N, px[i])) if (isR(j) && !seen[j]) { seen[j] = 1; px.push(j); }
    const c = { px, greens: px.filter((k) => idx[k] === GREEN), cycle: px.reduce((e, k) => e + deg(k), 0) / 2 > px.length - 1, main: null, tribs: [] };
    out.push(c);
    if (c.greens.length !== 1 || c.cycle) continue;
    const par = new Map([[c.greens[0], -1]]), ord = [c.greens[0]];
    for (let i = 0; i < ord.length; i++) for (const j of nb4(W, N, ord[i])) if (isR(j) && !par.has(j)) { par.set(j, ord[i]); ord.push(j); }
    const redOn = (k) => { for (let q = k; q >= 0; q = par.get(q)) if (idx[q] === RED) return q; return -1; };
    for (const k of px) {
      if (k === c.greens[0] || deg(k) > 1) continue;
      const r = redOn(k), p = [];
      for (let q = k; q >= 0 && q !== r; q = par.get(q)) p.push(q);
      if (r < 0) c.main = p.reverse();                        // green → mouth
      else { p.push(r); c.tribs.push({ path: p, red: r, junction: par.get(r) }); }   // head → red
    }
  }
  return out;
}

/** Widths along a path (downstream order) never narrow: the count of steps where a body index falls. */
const narrowings = (idx, p) => { let last = 0, n = 0; for (const k of p) { const w = idx[k]; if (w >= 3) { if (w < last) n++; last = w; } } return n; };

/** climb.js's measure, written out again: the heightmap smoothed by a 5×5 box (clipped at the edge), and along a path ordered
 *  downstream the largest rise over the lowest point before it. */
function smoothed5({ W, H, height }) {
  const out = new Float64Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let s = 0, n = 0;
    for (let yy = y - 2; yy <= y + 2; yy++) for (let xx = x - 2; xx <= x + 2; xx++) if (xx >= 0 && yy >= 0 && xx < W && yy < H) { s += height[yy * W + xx]; n++; }
    out[y * W + x] = s / n;
  }
  return out;
}
function climbAlong(h5, p) { let low = Infinity, c = 0; for (const k of p) { low = Math.min(low, h5[k]); c = Math.max(c, h5[k] - low); } return c; }

/** The plan's edits laid over a copy of `base` (an index array), or over the background. */
function overlay(N, edits, W, base = null) {
  const idx = base ? Uint8Array.from(base) : new Uint8Array(N).fill(BG);
  for (const e of edits) idx[e.y * W + e.x] = e.index;
  return idx;
}

// ── files on disk, for the tests that ask riversLearnt which map to learn from ──
function bmp8(W, H, idx, palette = PALETTE) {
  const stride = (W + 3) & ~3, off = 14 + 40 + 1024, size = off + stride * H, b = Buffer.alloc(size, 0);
  b.write("BM", 0, "ascii"); b.writeUInt32LE(size, 2); b.writeUInt32LE(off, 10);
  b.writeUInt32LE(40, 14); b.writeInt32LE(W, 18); b.writeInt32LE(H, 22); b.writeUInt16LE(1, 26); b.writeUInt16LE(8, 28);
  b.writeUInt32LE(0, 30); b.writeUInt32LE(stride * H, 34); b.writeUInt32LE(256, 46);
  palette.forEach((c, i) => { b[54 + i * 4] = c.b; b[55 + i * 4] = c.g; b[56 + i * 4] = c.r; });
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) b[off + (H - 1 - y) * stride + x] = idx[y * W + x];
  return b;
}
const colourOf = (id) => [id & 255, (id >> 8) & 255, 77];   // unique for every id under 65,536
function bmp24(W, H, pid) {
  const stride = Math.floor((24 * W + 31) / 32) * 4, size = 54 + stride * H, b = Buffer.alloc(size, 0);
  b.write("BM", 0, "ascii"); b.writeUInt32LE(size, 2); b.writeUInt32LE(54, 10);
  b.writeUInt32LE(40, 14); b.writeInt32LE(W, 18); b.writeInt32LE(H, 22); b.writeUInt16LE(1, 26); b.writeUInt16LE(24, 28);
  b.writeUInt32LE(stride * H, 34);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const [r, g, bl] = colourOf(pid[y * W + x]); const o = 54 + (H - 1 - y) * stride + x * 3; b[o] = bl; b[o + 1] = g; b[o + 2] = r; }
  return b;
}
function definitionCsv(world) {
  const types = new Map();
  for (let k = 0; k < world.N; k++) if (!types.has(world.pid[k])) types.set(world.pid[k], world.type[k] === 1 ? "land" : world.type[k] === 3 ? "lake" : "sea");
  const rows = ["0;0;0;0;land;false;unknown;0"];
  for (const id of [...types.keys()].sort((a, b) => a - b)) { const [r, g, b] = colourOf(id); const t = types.get(id); rows.push(`${id};${r};${g};${b};${t};false;${t === "land" ? "plains" : t === "lake" ? "lakes" : "ocean"};${t === "land" ? 1 : 0}`); }
  return rows.join("\r\n") + "\r\n";
}
/** Write a world's map files under `root/map`: provinces.bmp, definition.csv, heightmap.bmp and (with idx) rivers.bmp. */
function writeMap(root, world, { idx = null, palette = PALETTE, rivers = true } = {}) {
  const dir = path.join(root, "map");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "provinces.bmp"), bmp24(world.W, world.H, world.pid));
  fs.writeFileSync(path.join(dir, "definition.csv"), definitionCsv(world));
  const grey = Array.from({ length: 256 }, (_, i) => ({ r: i, g: i, b: i }));
  fs.writeFileSync(path.join(dir, "heightmap.bmp"), bmp8(world.W, world.H, world.height, grey));
  if (rivers) fs.writeFileSync(path.join(dir, "rivers.bmp"), bmp8(world.W, world.H, idx || world.idx, palette));
}

module.exports = { PALETTE, GREEN, RED, BG, SEA_BG, isRiverIndex, voronoiWorld, teeWorld, gridSample, SAMPLE_MAINS, SAMPLE_TRIBS, nb4, borderShareOf, nearBorder,
  riverTrees, narrowings, smoothed5, climbAlong, overlay, bmp8, bmp24, definitionCsv, writeMap };
