// ⛔ #the-world-pictures-have-the-base-games-grain — THE WORLD PICTURES CARRY THE GRAIN OF THE PICTURES BELOW.
//
// A generated world looked airbrushed: its colour map carried 13% of the base game's grain at one texel (2.4 against 18.1,
// mean |ΔR|+|ΔG|+|ΔB|, rehearsal t34a of the owner's flow), its water tint 0.15–0.21 of the base game's local spread, the
// fog's shine over the sea 0.18, its grey over the land 0.25. Two causes: textureFbm's "roughly unit" spread is 0.46, and its
// finest octave is three texels, so nothing the pictures were painted with had any grain at all. Each picture now gets one
// (textureGrain, unit local spread) at the LOCAL spread of the layer below's own picture — the colour map's per terrain index,
// the water's per distance from land, the fog's per signed distance — and the water's and the fog's coarse noise is unit.
//
// Pinned on a game whose pictures carry known grain, through Nova's real writers (a raise and an erase):
//   · the colour map of raised land strays locally as the layer below's land does, and steps at 1, 2 and 4 texels as it does
//     (8–32 are the owner's flow's to measure: there the base game's mean field, which a fixture does not have, is half of it);
//   · …and is MOTTLED and LIGHT-SPECKED as the base game's is, whatever the layer below's shape: its strength varies from
//     patch to patch under a field of unit mean square over the map, and its specks are lighter than their ground;
//   · every texel the same: no two-texel pattern, and a picture Nova painted reads back at the spread it was painted at —
//     per unit of that field, and a restyled world's second raise, learnt off land its first raise painted, is painted at
//     the strength its first was;
//   · the water tint and the fog follow the layer below's grain by distance — a coast's first texels rougher than the open sea;
//   · the grain is laid about the mean the painter lays, so a picture whose mean steps at the coast is not read as grain;
//   · the water's coarse noise is at the layer below's spread, not 0.23 of it;
//   · …in the branches that KEEP a texel's old detail as far as its distance stayed, too: the open sea the raise after Delete
//     map repaints (every sea texel's distance moved, from none: the whole sea of the owner's flow), and the land an erase
//     left whose coast it moved — the fog's grey there, grain and coarse noise;
//   · each terrain index is painted with its own index's grain, and read by what it MEANS where a mod renumbers it; the
//     fog's grain is laid net of the coarse noise's own share;
//   · a bucket too thin to measure is read where the measure is: the water's coarse noise across latitudes, the fog's grain
//     on its own side of the coast; and a mod of another size reads the water's noise at the same latitude FRACTION;
//   · the minimap's grain, drawn the same way, is the same at every point;
//   · the noise units themselves: textureFbm's real spread is TEXTURE_FBM_RMS, the grain's local spread is 1, and the learn's
//     measure is not fooled by a two-texel pattern;
//   · the same write twice gives the same bytes.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const md = require("./map-data.js");
const dds = require("./dds-codec.js");
const SALT = md.TEXTURE_GRAIN_SALT;   // (each picture's grain lattice, read from the source)

let pass = 0, fail = 0;
const ok = (c, m, x) => {
  if (c) { pass++; console.log("  ok   " + m); }
  else { fail++; console.log("  FAIL " + m + (x !== undefined ? "   -> " + JSON.stringify(x).slice(0, 400) : "")); }
};
const roots = [];
const tmp = (tag) => { const d = fs.mkdtempSync(path.join(os.tmpdir(), "nova-grain-" + tag + "-")); roots.push(d); return d; };
const write = (dir, rel, body) => { const p = path.join(dir, ...rel.split("/")); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, body); return p; };
const sha = (b) => crypto.createHash("sha1").update(b).digest("hex");

// ── bitmaps and DDS files ──────────────────────────────────────────────────────────────────────────────────────
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
/** An uncompressed 32-bit DDS, one level, painted by fn(x, y) → [r, g, b, a] (rounded and clamped). */
function rgb32(W, H, fn) {
  const h = Buffer.alloc(128);
  h.write("DDS ", 0, "latin1"); h.writeUInt32LE(124, 4); h.writeUInt32LE(0x100f, 8); h.writeUInt32LE(H, 12); h.writeUInt32LE(W, 16);
  h.writeUInt32LE(W * 4, 20); h.writeUInt32LE(1, 28); h.writeUInt32LE(32, 76); h.writeUInt32LE(0x41, 80); h.writeUInt32LE(32, 88);
  h.writeUInt32LE(0xff0000, 92); h.writeUInt32LE(0xff00, 96); h.writeUInt32LE(0xff, 100); h.writeUInt32LE(0xff000000, 104); h.writeUInt32LE(0x1000, 108);
  const buf = Buffer.alloc(128 + W * H * 4); h.copy(buf);
  const hdr = dds.parseDdsHeader(buf), rgba = new Uint8Array(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) rgba.set(fn(x, y).map((v) => Math.max(0, Math.min(255, Math.round(v)))), (y * W + x) * 4);
  dds.patchDdsLevel(buf, hdr, 0, rgba, new Uint8Array(W * H).fill(1));
  return buf;
}
const readTex = (root, name) => { const b = fs.readFileSync(path.join(root, "map", "terrain", name)); const h = dds.parseDdsHeader(b); return dds.decodeDdsLevel(b, h, 0); };

// ── the test's OWN measures (Nova's are what is under test) ────────────────────────────────────────────────────
const TW = 512, TH = 256, TN = TW * TH;
/** Every centre in `centre` against the mean of the `mask` texels within 2 of it (at least 15 of 25), rms per channel. */
function localSpread(img, mask, centre, ch, S = 4) {
  const q = ch.map(() => 0); let n = 0;
  for (let y = 0; y < TH; y++) for (let x = 0; x < TW; x++) {
    const i = y * TW + x; if (!centre[i]) continue;
    const m = ch.map(() => 0); let c = 0;
    for (let yy = Math.max(0, y - 2); yy <= Math.min(TH - 1, y + 2); yy++) for (let xx = Math.max(0, x - 2); xx <= Math.min(TW - 1, x + 2); xx++) {
      const j = yy * TW + xx; if (!mask[j]) continue; c++; ch.forEach((k, a) => { m[a] += img[j * S + k]; });
    }
    if (c < 15) continue;
    ch.forEach((k, a) => { const d = img[i * S + k] - m[a] / c; q[a] += d * d; }); n++;
  }
  return q.map((v) => Math.sqrt(v / Math.max(1, n)));
}
/** Root-mean-square difference at lag d (across and down), per channel, both ends in `mask`. */
function rmsDiff(img, mask, d, ch) {
  const q = ch.map(() => 0); let n = 0;
  for (let y = 0; y < TH; y++) for (let x = 0; x < TW; x++) {
    const i = y * TW + x; if (!mask[i]) continue;
    for (const j of [x + d < TW ? i + d : -1, y + d < TH ? i + d * TW : -1]) { if (j < 0 || !mask[j]) continue; ch.forEach((k, a) => { const e = img[i * 4 + k] - img[j * 4 + k]; q[a] += e * e; }); n++; }
  }
  return q.map((v) => Math.sqrt(v / Math.max(1, n)));
}
/** The local stray of each of the four parities of (x, y), every centre — max over min. */
function parityRatio(img, mask, k) {
  const q = [0, 0, 0, 0], n = [0, 0, 0, 0];
  for (let y = 2; y < TH - 2; y++) for (let x = 2; x < TW - 2; x++) {
    const i = y * TW + x; if (!mask[i]) continue;
    let m = 0, c = 0; for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const j = i + dy * TW + dx; if (mask[j]) { m += img[j * 4 + k]; c++; } }
    if (c < 25) continue;
    const e = img[i * 4 + k] - m / c, p = (x & 1) + 2 * (y & 1); q[p] += e * e; n[p]++;
  }
  const r = q.map((v, p) => Math.sqrt(v / n[p]));
  return Math.max(...r) / Math.min(...r);
}
/** The 5 × 5 stray of channel `k` at every centre whose 25 texels are all in `mask`: its skew, and over 8 × 8 blocks (32
 *  centres or more) the spread of the log of each block's rms and its correlation with the next block across and down. */
function mottle(img, mask, k) {
  const B = 8, BX = TW / B, BY = TH / B, q = new Float64Array(BX * BY), c = new Float64Array(BX * BY);
  let s1 = 0, s2 = 0, s3 = 0, n = 0;
  for (let y = 2; y < TH - 2; y++) for (let x = 2; x < TW - 2; x++) {
    const i = y * TW + x; if (!mask[i]) continue;
    let m = 0, all = true;
    for (let dy = -2; dy <= 2 && all; dy++) for (let dx = -2; dx <= 2; dx++) { const j = i + dy * TW + dx; if (!mask[j]) { all = false; break; } m += img[j * 4 + k]; }
    if (!all) continue;
    const d = img[i * 4 + k] - m / 25; s1 += d; s2 += d * d; s3 += d * d * d; n++;
    const b = ((y / B) | 0) * BX + ((x / B) | 0); q[b] += d * d; c[b]++;
  }
  const mu = s1 / n, va = s2 / n - mu * mu, skew = (s3 / n - 3 * mu * s2 / n + 2 * mu ** 3) / va ** 1.5;
  const lr = new Float64Array(BX * BY).fill(NaN); let t = 0, nb = 0;
  for (let b = 0; b < BX * BY; b++) if (c[b] >= 32 && q[b] > 0) { lr[b] = 0.5 * Math.log(q[b] / c[b]); t += lr[b]; nb++; }
  let v = 0; for (let b = 0; b < lr.length; b++) if (!Number.isNaN(lr[b])) { lr[b] -= t / nb; v += lr[b] ** 2; }
  let a = 0, p = 0, r = 0;
  for (let by = 0; by < BY; by++) for (let bx = 0; bx < BX; bx++) {
    const u = lr[by * BX + bx]; if (Number.isNaN(u)) continue;
    for (const w of [bx + 1 < BX ? lr[by * BX + bx + 1] : NaN, by + 1 < BY ? lr[(by + 1) * BX + bx] : NaN]) { if (Number.isNaN(w)) continue; a += u * w; p += u * u; r += w * w; }
  }
  return { skew, sd: Math.sqrt(v / nb), corr: a / Math.sqrt(p * r), blocks: nb };
}
/** A LINE along a row: for every row, the step from the row above averaged over runs of 16 texels (both rows in `mask`) —
 *  a step whose sign holds along the row, where a grain's cancels — its rms over the row's runs, against the same for the
 *  two rows either side of it (a picture whose strength changes with latitude steps more where it is strong, but not at one
 *  row only); the worst row, per channel. */
function rowLine(img, mask, ch) {
  const S = new Array(TH).fill(null);
  for (let y = 1; y < TH; y++) {
    const q = ch.map(() => 0); let n = 0;
    for (let x0 = 0; x0 + 16 <= TW; x0 += 16) {
      const s = ch.map(() => 0); let all = true;
      for (let x = x0; x < x0 + 16; x++) { const i = y * TW + x; if (!mask[i] || !mask[i - TW]) { all = false; break; } ch.forEach((k, a) => { s[a] += img[i * 4 + k] - img[(i - TW) * 4 + k]; }); }
      if (!all) continue;
      ch.forEach((k, a) => { q[a] += (s[a] / 16) ** 2; }); n++;
    }
    if (n >= 4) S[y] = q.map((v) => Math.sqrt(v / n));
  }
  return ch.map((k, a) => {
    let worst = 0, at = -1, rows = 0;
    for (let y = 3; y < TH - 2; y++) {
      const nb = [S[y - 2], S[y - 1], S[y + 1], S[y + 2]];
      if (!S[y] || nb.some((r) => !r)) continue;
      const v = S[y][a] / (nb.reduce((t, r) => t + r[a], 0) / 4); rows++;
      if (v > worst) { worst = v; at = y; }
    }
    return { ratio: worst, row: at, rows };
  });
}
/** The root of the land patch field's mean square over `mask` — what a grain painted under it strays by, per unit. */
const patchRms = (mask) => { const f = md.textureGrainPatchOver(TW, TH); let q = 0, n = 0; for (let i = 0; i < TN; i++) if (mask[i]) { q += f(i % TW, (i / TW) | 0) ** 2; n++; } return Math.sqrt(q / n); };
const within = (a, b, tol) => a.every((v, k) => Math.abs(v / b[k] - 1) <= tol);
const ratios = (a, b) => a.map((v, k) => +(v / b[k]).toFixed(2));
const maskOf = (f) => { const m = new Uint8Array(TN); for (let i = 0; i < TN; i++) if (f(i % TW, (i / TW) | 0, i)) m[i] = 1; return m; };

// ── the game ────────────────────────────────────────────────────────────────────────────────────────────────
// 1024 x 512 provinces.bmp, so every world picture is 512 x 256 texels:
//   1 sea        everywhere else
//   2 land       640 <= x < 992 (texels 320–495)      what the erase drowns; the layer below's land to learn from
//   5 land       x >= 992 (texels 496–511)             what is left beside it: the erased sea's new coast
//   3 sea        64 <= x < 576, 64 <= y < 448 (texels 32–287 x 32–223), a bay 32 texels from the land: what the raise lifts
const W = 1024, H = 512;
const provAt = (x, y) => (x >= 992 ? 5 : x >= 640 ? 2 : x >= 64 && x < 576 && y >= 64 && y < 448 ? 3 : 1);
const COL = { 1: [0, 0, 200], 2: [200, 0, 0], 3: [0, 100, 200], 5: [0, 200, 0], 6: [100, 50, 0] };   // (6: the forest game's, below)
const provT = (X, Y) => provAt(2 * X, 2 * Y);
const landBelow = (X, Y) => { const p = provT(X, Y); return p === 2 || p === 5; };
const dLandB = md.textureDistanceTo(TW, TH, (i) => landBelow(i % TW, (i / TW) | 0));
const dWaterB = md.textureDistanceTo(TW, TH, (i) => !landBelow(i % TW, (i / TW) | 0));
// a grain of its own (not Nova's): uniform hash values, each texel's with 0.3 of its four neighbours' — a step at one texel
// correlated as the base game's is (0.44 here, 0.41 on the base game's colour map) — at unit root mean square
const hash = (x, y, s) => { let h = (x * 73856093) ^ (y * 19349663) ^ (s * 83492791); h = Math.imul(h ^ (h >>> 15), 2246822519); h = Math.imul(h ^ (h >>> 13), 3266489917); h ^= h >>> 16; return (h >>> 0) / 4294967296 - 0.5; };
const grainOf = (s) => (X, Y) => (hash(X, Y, s) + 0.3 * (hash(X - 1, Y, s) + hash(X + 1, Y, s) + hash(X, Y - 1, s) + hash(X, Y + 1, s))) / Math.sqrt((1 + 4 * 0.09) / 12);
const coarseOf = (s, base, oct) => (X, Y) => md.textureFbm(X, Y, s, base, oct) / md.TEXTURE_FBM_RMS;
const gCm = grainOf(11), cCm = coarseOf(9101, 48, 5), gW = grainOf(12), cW = coarseOf(9102, 6, 2), gF = grainOf(13), gS = grainOf(14), cF = coarseOf(9103, 12, 4), cS = coarseOf(9105, 40, 4);
const ramp = (d, near, far, d0, d1) => (d <= d0 ? near : d >= d1 ? far : near + ((far - near) * (d - d0)) / (d1 - d0));
// the layer below's pictures, each painted for this map:
//   colour map  land: a colour, a coarse field and a grain of 7 / 6 / 6.5;   sea: flat
//   water tint  sea: a shelf (bluer within 6 of land: a MEAN that changes at the coast), a coarse field of 6 / 8 / 10 finer than
//               a latitude band (so a bucket's mean cannot soak it up, as the base game's many coasts do not let it), and a
//               grain of 10 within 6 of land falling to 3 from 16 out;   land: flat
//   fog         land: grey 30 darker within 2 of the coast (a mean that STEPS), coarse 8, grain 9 within 2 falling to 5 from 8 in,
//               shine 21;   sea: grey 90, shine 40 with a coarse 4 and a grain of 6 within 2 falling to 2 from 16 out
const CM_SEA = [79, 102, 141];
const cmBelow = (X, Y) => { if (!landBelow(X, Y)) return [...CM_SEA, 0]; const c = cCm(X, Y), g = gCm(X, Y); return [150 + 15 * c + 7 * g, 120 + 10 * c + 6 * g, 60 + 13 * c + 6.5 * g, 0]; };
const waterBelow = (X, Y) => {
  if (landBelow(X, Y)) return [60, 70, 60, 255];
  const d = dLandB[Y * TW + X], c = cW(X, Y), g = gW(X, Y) * ramp(d, 10, 3, 6, 16), shelf = 30 * Math.max(0, 1 - d / 6);
  return [35 + 6 * c + 0.7 * g, 59 + 8 * c + 0.85 * g + shelf * 0.5, 81 + 10 * c + g + shelf, 255];
};
const fowBelow = (X, Y) => {
  if (landBelow(X, Y)) { const d = dWaterB[Y * TW + X], v = 150 - (d <= 2 ? 30 : 0) + 8 * cF(X, Y) + ramp(d, 9, 5, 2, 8) * gF(X, Y); return [v, v, v, 21]; }
  const d = dLandB[Y * TW + X]; return [90, 90, 90, 40 + 4 * cS(X, Y) + ramp(d, 6, 2, 2, 16) * gS(X, Y)];
};
const MW = 64, MH = 32;
const DEF = "0;0;0;0;land;false;unknown;0\n1;0;0;200;sea;false;ocean;0\n2;200;0;0;land;false;plains;1\n3;0;100;200;sea;false;ocean;0\n5;0;200;0;land;false;plains;1\n";
/** common/terrain/00_terrain.txt: plains index `ix.plains`, and forest `ix.forest` if given */
const terrainTable = (ix) => ["categories = {", "  plains = { color = { 200 200 100 } }", ...(ix.forest !== undefined ? ["  forest = { color = { 0 120 0 } }"] : []), "  ocean = { color = { 0 0 200 } is_water = yes }", "}",
  "terrain = {", `  plains = { type = plains color = { ${ix.plains} } }`, ...(ix.forest !== undefined ? [`  forest = { type = forest color = { ${ix.forest} } }`] : []), "  ocean = { type = ocean color = { 15 } }", "}", ""].join("\n");
/** The game: its water tint `water`; and for the forest game below, `o` another map — `at` its provinces, `def` its
 *  definition.csv, `ix(x, y)` its terrain.bmp, `table` its terrain table — and its own colour and fog maps `cm` and `fow`. */
function makeGame(water = waterBelow, o = {}) {
  const g = tmp("game"), at = o.at || provAt;
  write(g, "hoi4.exe", "");
  write(g, "map/provinces.bmp", bmp24(W, H, (x, y) => COL[at(x, y)]));
  write(g, "map/definition.csv", o.def || DEF);
  const landPx = (x, y) => { const p = at(x, y); return p !== 1 && p !== 3; };
  write(g, "map/terrain.bmp", bmp8(W, H, o.ix || ((x, y) => (landPx(x, y) ? 0 : 15))));
  write(g, "map/heightmap.bmp", bmp8(W, H, (x, y) => (landPx(x, y) ? 106 : 89)));
  write(g, "common/terrain/00_terrain.txt", o.table || terrainTable({ plains: 0 }));
  write(g, "map/terrain/colormap_rgb_cityemissivemask_a.dds", rgb32(TW, TH, o.cm || cmBelow));
  write(g, "map/terrain/colormap_water_0.dds", rgb32(TW, TH, water));
  write(g, "map/terrain/colormap_water_1.dds", rgb32(TW / 2, TH / 2, (X, Y) => water(2 * X, 2 * Y)));
  write(g, "map/terrain/colormap_water_2.dds", rgb32(TW / 4, TH / 4, (X, Y) => water(4 * X, 4 * Y)));
  write(g, "map/terrain/fow_rgb_waterspec_a.dds", rgb32(TW, TH, o.fow || fowBelow));
  write(g, "gfx/minimap/minimap.dds", rgb32(MW, MH, (u, v) => { const x = Math.floor((u + 0.5) * W / MW), y = Math.floor((v + 0.5) * H / MH); return landPx(x, y) ? [170, 162, 147, 255] : [84, 78, 66, 255]; }));
  return g;
}
const mkMod = () => { const m = tmp("mod"); write(m, "descriptor.mod", 'version="1.0"\nname="grain"\n'); return m; };

try {
  console.log("\n-- the noise units --");
  {
    for (const [s, base, oct, what] of [[11, 48, 5, "colour map, detail"], [53, 24, 4, "colour map, tint"], [211, 96, 5, "water tint"], [401, 40, 4, "water shine"], [307, 12, 4, "fog grey"]]) {
      // (every fifth texel of a field 5,000 wide: the coarsest is 96 texels, and a small field holds too few of its cells to say)
      let q = 0; for (let y = 0; y < 2500; y += 5) for (let x = 0; x < 5000; x += 5) q += md.textureFbm(x + 300, y + 200, s, base, oct) ** 2;
      const rms = Math.sqrt(q / (1000 * 500));
      ok(Math.abs(rms / md.TEXTURE_FBM_RMS - 1) < 0.03, `textureFbm(${s}, ${base}, ${oct}) — the ${what} — spreads ${rms.toFixed(3)}: TEXTURE_FBM_RMS (${md.TEXTURE_FBM_RMS.toFixed(3)}), not the 1 its comment once claimed`);
    }
    const img = new Float64Array(TN * 4), all = new Uint8Array(TN).fill(1);
    for (let y = 0; y < TH; y++) for (let x = 0; x < TW; x++) img[(y * TW + x) * 4] = md.textureGrain(x + 1500, y + 700, SALT.land);
    const ls = localSpread(img, all, all, [0])[0], pr = parityRatio(img, all, 0);
    ok(Math.abs(ls - 1) < 0.03, `the grain's local spread, measured by this test away from where it was scaled, is 1 (${ls.toFixed(3)})`);
    ok(pr < 1.05, `⭐ …and the same at every texel: its four parities of row and column stray within 5% of each other (${pr.toFixed(3)}) — not a two-texel pattern`);
    // …and the minimap's grain, drawn the same way (#the-minimap-grain-is-the-same-at-every-point): at whole points its first
    // octave strayed 1.79 × as far at (even, even) as at (odd, odd)
    const mini = new Float64Array(TN * 4);
    for (let y = 0; y < TH; y++) for (let x = 0; x < TW; x++) mini[(y * TW + x) * 4] = md.minimapGrain(x + 700, y + 300);
    const mpr = parityRatio(mini, all, 0);
    ok(mpr < 1.05, `⭐ …and so is the minimap's grain: its four parities stray within 5% of each other (${mpr.toFixed(3)})`);
    // a picture with a two-texel pattern: only its even texels carry anything
    const pat = new Float64Array(TN * 4), zero = new Int8Array(TN);
    for (let y = 0; y < TH; y++) for (let x = 0; x < TW; x++) pat[(y * TW + x) * 4] = (x & 1) || (y & 1) ? 0 : 20 * hash(x, y, 99);
    const nova = md.textureLocalSpread(pat, TW, TH, [0], zero, null, 1).rms(0)[0], mine = localSpread(pat, all, all, [0])[0];
    ok(Math.abs(nova / mine - 1) < 0.05, `⭐ the learn's measure reads a picture with a two-texel pattern as every centre does (${nova.toFixed(2)} against ${mine.toFixed(2)}) — not at its peaks only`);
    // the land's grain is skewed (light specks) and moves no colour; the water's is not skewed
    let sum = 0; for (let i = 0; i < TN; i++) sum += img[i * 4];
    ok(Math.abs(sum / TN) < 0.03, `the land's grain is laid about 0: its mean is ${(sum / TN).toFixed(3)} of its local spread — skewing it moves no colour`);
    const skewOf = (s) => { const im = new Float64Array(TN * 4); for (let y = 0; y < TH; y++) for (let x = 0; x < TW; x++) im[(y * TW + x) * 4] = md.textureGrain(x + 1500, y + 700, s); return mottle(im, all, 0).skew; };
    const sl = skewOf(SALT.land), sw = skewOf(SALT.water);
    ok(sl > 0.3 && sl < 0.9, `⭐ the land's grain has the base game's light specks: its 5 × 5 stray skews +${sl.toFixed(2)} (the base game's land +0.42 / +0.53 / +0.85)`);
    ok(Math.abs(sw) < 0.1, `…and only the land's: the water's grain skews ${sw.toFixed(2)}`);
    // the patch field: unit mean square over the plane, and scaled to unit mean square over each map
    let q = 0, c = 0; for (let y = 0; y < 16384; y += 16) for (let x = 0; x < 32768; x += 16) { q += md.textureGrainPatch(x + 999, y + 333) ** 2; c++; }
    ok(Math.abs(q / c - 1) < 0.03, `the patch field the land's grain is mottled by has a mean square of 1 over the plane (${(q / c).toFixed(3)})`);
    const pf = md.textureGrainPatchOver(TW, TH); q = 0; for (let i = 0; i < TN; i++) q += pf(i % TW, (i / TW) | 0) ** 2;
    const here = md.textureGrainPatch(100, 100) ** 2, over = pf(100, 100) ** 2;
    ok(Math.abs(q / TN - 1) < 0.01 && Math.abs(over / here - 1) > 0.05, `⭐ …and of 1 over THIS map, whose own patch of the plane is not 1 (${(q / TN).toFixed(3)}, scaled by ${Math.sqrt(over / here).toFixed(3)}): the land's grain is the strength learnt, on the whole, on any map`);
  }

  const game = makeGame();
  const G = (m) => ({ modRoot: m, gameRoot: game, dependencyRoots: [] });
  const cm0 = readTex(game, "colormap_rgb_cityemissivemask_a.dds"), w0 = readTex(game, "colormap_water_0.dds"), f0 = readTex(game, "fow_rgb_waterspec_a.dds");

  console.log("\n-- ⭐ raised land carries the layer below's grain --");
  const rgbA = [0, 1, 2];
  const newLand = maskOf((X, Y) => provT(X, Y) === 3), newIn = maskOf((X, Y) => X >= 35 && X < 285 && Y >= 35 && Y < 221);
  const belowLand = maskOf((X, Y) => landBelow(X, Y)), belowIn = maskOf((X, Y) => X >= 323 && X < 493 && Y >= 3 && Y < 253);
  let raised;
  {
    const m = mkMod(); raised = m;
    const r = md.setProvinceDefinition({ ...G(m), provinceId: 3, type: "land", terrain: "plains", coastal: false, continent: 1 });
    const tx = r && r.heightmap && r.heightmap.textures;
    ok(r && r.changed && tx && tx.changed, "the bay was raised and the world pictures repainted", r && (r.error || tx));
    const cm = readTex(m, "colormap_rgb_cityemissivemask_a.dds");
    // (per unit of the patch field the grain is laid under: over this bay its mean square is not 1 — that is the mottling)
    const pm = patchRms(newIn);
    const lN = localSpread(cm, newLand, newIn, rgbA).map((v) => v / pm), lB = localSpread(cm0, belowLand, belowIn, rgbA);
    ok(within(lN, lB, 0.25), `⭐ the colour map of the raised land strays locally as the layer below's land does, per channel, per unit of the patch field (${pm.toFixed(2)} here) (${ratios(lN, lB).join(" / ")} of ${lB.map((v) => v.toFixed(1)).join(" / ")})`, { got: lN, below: lB });
    for (const d of [1, 2, 4]) {
      const a = rmsDiff(cm, newIn, d, rgbA).map((v) => v / pm), b = rmsDiff(cm0, belowIn, d, rgbA);
      ok(within(a, b, 0.25), `…and steps ${d} texel${d > 1 ? "s" : ""} apart as it does (${ratios(a, b).join(" / ")})`, { got: a, below: b });
    }
    const pr = parityRatio(cm, newIn, 0);
    ok(pr < 1.1, `⭐ every texel of it alike: its four parities of row and column stray within 10% of each other (${pr.toFixed(3)})`);
    // mottled and light-specked as the base game's land (8-texel blocks of one index: log rms spread 0.37, next-block
    // correlation 0.63; skew +0.53 on green) — where the layer below's own grain here is even and symmetric
    const mo = mottle(cm, newIn, 1), mb = mottle(cm0, belowIn, 1);
    ok(mb.corr < 0.25 && Math.abs(mb.skew) < 0.2, `CONTROL: the layer below's grain here is even and symmetric (next-block correlation ${mb.corr.toFixed(2)}, skew ${mb.skew.toFixed(2)})`);
    ok(mo.corr >= 0.4 && mo.sd >= 0.22, `⭐ the raised land's grain is MOTTLED: the log of its strength over 8-texel blocks spreads ${mo.sd.toFixed(2)} and a block's correlates ${mo.corr.toFixed(2)} with the next (${mo.blocks} blocks)`, mo);
    ok(mo.skew >= 0.25, `⭐ …and LIGHT-SPECKED: its 5 × 5 stray skews +${mo.skew.toFixed(2)}`, mo);
    // a picture Nova painted reads back at the spread it was painted at: learnt as the mod's own picture of a later write (per
    // unit of the patch field, as repaintWorldTextures learns one), over a map whose only land is the raised bay's inside (its
    // first texel carries the sea's colour in part, as the base game's coast does), its grain is the one it was given
    const learnt = (img, land, perPatch) => md.learnWorldTextureColours({ layer: { W: TW, H: TH, N: TN, cls: Uint8Array.from(land, (v) => (v ? 1 : 2)), pure: new Uint8Array(TN).fill(1), idx: Uint8Array.from(land, (v) => (v ? 0 : 15)) },
      colormap: img, urbanIdx: [], idxCat: new Map([[0, "plains"], [15, "ocean"]]), key: null, perPatch }).localSd(0);
    const back = learnt(cm, newIn, true), given = learnt(cm0, belowIn, false), plain = learnt(cm, newIn, false);
    ok(within(back, given, 0.05), `⭐ learnt back from its own picture, the raised land's grain is the one it was given (${ratios(back, given).join(" / ")}): a repaint settles rather than grows`, { back, given, plain });
    // the fog's grey over the new land, by distance from the water, against the layer below's at the same distances
    const fw = readTex(m, "fow_rgb_waterspec_a.dds"), dW = md.textureDistanceTo(TW, TH, (i) => !(newLand[i] || belowLand[i]));
    for (const [lo, hi, name] of [[2, 3, "two or three texels from the coast"], [10, 99, "ten and more inland"]]) {
      const a = localSpread(fw, newLand, maskOf((X, Y, i) => newLand[i] && dW[i] >= lo && dW[i] <= hi), [1])[0];
      const b = localSpread(f0, belowLand, maskOf((X, Y, i) => belowLand[i] && Y >= 3 && Y < TH - 3 && dWaterB[i] >= lo && dWaterB[i] <= hi), [1])[0];
      ok(Math.abs(a / b - 1) <= 0.25, `⭐ the fog's grey over the raised land, ${name}, strays as the layer below's does there (${a.toFixed(1)} against ${b.toFixed(1)})`);
    }
    let shine = 0; for (let i = 0; i < TN; i++) if (newIn[i] && fw[i * 4 + 3] !== 21) shine++;
    ok(!shine, "…and the water's shine over it is the layer below's over land, 21, with no grain laid on it", shine);
  }

  console.log("\n-- ⭐ the sea an erase leaves carries the layer below's grain, by distance from the land --");
  {
    const m = mkMod();
    const r = md.flipProvinceToSea({ ...G(m), provinceId: 2 });
    const tx = r && r.heightmap && r.heightmap.textures;
    ok(r && r.changed && tx && tx.changed, "the land was erased and the world pictures repainted", r && (r.error || tx));
    const w = readTex(m, "colormap_water_0.dds"), fw = readTex(m, "fow_rgb_waterspec_a.dds");
    const fresh = maskOf((X, Y) => provT(X, Y) === 2), belowSea = maskOf((X, Y) => !landBelow(X, Y));
    const dNow = md.textureDistanceTo(TW, TH, (i) => provT(i % TW, (i / TW) | 0) === 5);
    for (const [lo, hi, name] of [[3, 6, "three to six texels from the land"], [24, 999, "twenty-four and more out"]]) {
      const cN = maskOf((X, Y, i) => fresh[i] && Y >= 2 && Y < TH - 2 && dNow[i] >= lo && dNow[i] <= hi), cB = maskOf((X, Y, i) => belowSea[i] && Y >= 2 && Y < TH - 2 && dLandB[i] >= lo && dLandB[i] <= hi);
      const a = localSpread(w, fresh, cN, rgbA), b = localSpread(w0, belowSea, cB, rgbA);
      ok(within(a, b, 0.25), `⭐ the water tint ${name} strays as the layer below's does at that distance (${ratios(a, b).join(" / ")} of ${b.map((v) => v.toFixed(1)).join(" / ")})`, { got: a, below: b });
      const sa = localSpread(fw, fresh, cN, [3])[0], sb = localSpread(f0, belowSea, cB, [3])[0];
      ok(Math.abs(sa / sb - 1) <= 0.25, `⭐ …and so does the water's shine (${sa.toFixed(2)} against ${sb.toFixed(2)})`);
    }
    // ⛔ #kept-land-keeps-the-fogs-grain — the land the erase LEFT, whose coast it moved: province 5 was far inland and is now
    // the coast, so its fog's grey is repainted by distance with none of its old detail kept — and was laid flat
    const kept = maskOf((X, Y) => provT(X, Y) === 5), dK = md.textureDistanceTo(TW, TH, (i) => !kept[i]);
    let nearest = Infinity; for (let i = 0; i < TN; i++) if (kept[i]) nearest = Math.min(nearest, dWaterB[i]);
    ok(Math.min(40, nearest) - 14 >= 10, `CONTROL: before the erase that land stood ${nearest.toFixed(0)} texels and more from the water, so at fourteen from its new coast or nearer its distance moved ten or more: none of its old detail is kept`);
    for (const [lo, hi, name] of [[3, 6, "three to six"], [7, 14, "seven to fourteen"]]) {
      const cN = maskOf((X, Y, i) => kept[i] && Y >= 3 && Y < TH - 3 && dK[i] >= lo && dK[i] <= hi), cB = maskOf((X, Y, i) => belowLand[i] && Y >= 3 && Y < TH - 3 && dWaterB[i] >= lo && dWaterB[i] <= hi);
      const a = localSpread(fw, kept, cN, [1])[0], b = localSpread(f0, belowLand, cB, [1])[0];
      ok(Math.abs(a / b - 1) <= 0.25, `⭐ the fog's grey over the land the erase left, ${name} texels from its new coast, strays as the layer below's does there (${a.toFixed(2)} against ${b.toFixed(2)}) — not laid flat where its coast moved`);
    }
    // …and is not grain alone: its coarse noise too. Measured where the grain averages out — the grey's mean over blocks of
    // four rows of the strip three to fourteen from the coast (every block the same columns, so the same distances: the mean
    // laid by distance is one constant), its spread from block to block (the grain alone leaves 0.29 of the layer below's)
    const blockSd = (img, band) => {
      const s = new Float64Array(TH / 4), c = new Float64Array(TH / 4);
      for (let i = 0; i < TN; i++) if (band[i]) { const b = ((i / TW) | 0) >> 2; s[b] += img[i * 4 + 1]; c[b]++; }
      const v = []; for (let b = 0; b < s.length; b++) if (c[b]) v.push(s[b] / c[b]);
      const mu = v.reduce((t, x) => t + x, 0) / v.length;
      return Math.sqrt(v.reduce((t, x) => t + (x - mu) ** 2, 0) / v.length);
    };
    const kN = blockSd(fw, maskOf((X, Y, i) => kept[i] && dK[i] >= 3 && dK[i] <= 14)), kB = blockSd(f0, maskOf((X, Y, i) => belowLand[i] && dWaterB[i] >= 3 && dWaterB[i] <= 14));
    ok(Math.abs(kN / kB - 1) <= 0.35, `⭐ …and its mean over four rows of that strip strays from block to block as the layer below's does (${kN.toFixed(2)} against ${kB.toFixed(2)}): its coarse noise as well as its grain`);
    // the coarse noise: what the open water the erase left strays from the mean the painter lays there, against what the palette
    // (learnt here from the layer below as the repaint learns it) says the layer below's strays — its coarse noise and its grain
    const lay = { W: TW, H: TH, N: TN, cls: Uint8Array.from(belowSea, (v) => (v ? 2 : 1)), pure: new Uint8Array(TN).fill(1), idx: Uint8Array.from(belowSea, (v) => (v ? 15 : 0)) };
    const pw = md.learnWorldTextureColours({ layer: lay, water0: w0, urbanIdx: [], idxCat: new Map([[0, "plains"], [15, "ocean"]]), key: null });
    // (the water grain's root mean square per unit of its local spread, measured here: what it adds to the water's whole stray)
    let gq = 0; for (let y = 0; y < TH; y++) for (let x = 0; x < TW; x++) gq += md.textureGrain(x + 1500, y + 700, SALT.water) ** 2;
    const gRms = Math.sqrt(gq / TN);
    const far = maskOf((X, Y, i) => fresh[i] && dNow[i] >= 24), e = [0, 0, 0], want = [0, 0, 0], amp = [0, 0, 0];
    let n = 0;
    for (let i = 0; i < TN; i++) {
      if (!far[i]) continue;
      const Y = (i / TW) | 0, p = pw.waterAt(dNow[i], Y), a = pw.waterNoiseAt(dNow[i], Y), gl = pw.waterGrainAt(dNow[i]);
      for (let k = 0; k < 3; k++) { e[k] += (w[i * 4 + k] - p[k]) ** 2; want[k] += a[k] ** 2 + (gRms * gl[k]) ** 2; amp[k] += a[k]; }
      n++;
    }
    ok(amp.every((v, k) => v / n > 0.6 * Math.sqrt(want[k] / n)), `CONTROL: out there the palette's coarse noise is most of what the water strays (${amp.map((v) => (v / n).toFixed(1)).join(" / ")} of ${want.map((v) => Math.sqrt(v / n).toFixed(1)).join(" / ")})`);
    const rr = e.map((v, k) => Math.sqrt(v / want[k]));
    ok(rr.every((v) => v >= 0.6 && v <= 1.6), `⭐ the open water strays from the mean the painter lays as far as the palette says the layer below's does (${rr.map((v) => v.toFixed(2)).join(" / ")}) — its coarse noise at the spread measured, not 0.23 of it`, { e, want });
  }

  console.log("\n-- ⭐ every land erased, then land raised — the owner's flow: the open sea the raise repaints carries the layer below's grain --");
  {
    // Delete map leaves no land, so the raise after it moves every sea texel's distance from land, from none to a finite one:
    // the open sea is repainted through the branch that KEEPS a texel's old detail as far as its distance stayed — here none
    // of it — not the fresh branch the erase above measures. That branch paints the whole sea of the owner's flow.
    const m = mkMod();
    const e1 = md.flipProvinceToSea({ ...G(m), provinceId: 2 }), e2 = md.flipProvinceToSea({ ...G(m), provinceId: 5 });
    ok(e1 && e1.changed && e2 && e2.changed, "every land was erased", [e1 && e1.error, e2 && e2.error]);
    const wAll = readTex(m, "colormap_water_0.dds"), fAll = readTex(m, "fow_rgb_waterspec_a.dds");
    const r = md.setProvinceDefinition({ ...G(m), provinceId: 3, type: "land", terrain: "plains", coastal: false, continent: 1 });
    const tx = r && r.heightmap && r.heightmap.textures;
    ok(r && r.changed && tx && tx.changed, "…then the bay was raised and the world pictures repainted", r && (r.error || tx));
    const w = readTex(m, "colormap_water_0.dds"), fw = readTex(m, "fow_rgb_waterspec_a.dds");
    const seaNow = maskOf((X, Y) => provT(X, Y) !== 3), belowSea = maskOf((X, Y) => !landBelow(X, Y));
    const dNow = md.textureDistanceTo(TW, TH, (i) => !seaNow[i]);
    // (the water tint measured at the texels whose tint the raise changed: out at sea a tint that has levelled off is left as
    // it was; the shine at every texel under the fog's cap of 40, the distance it reads — every one of them moved, from none)
    const movedW = maskOf((X, Y, i) => [0, 1, 2].some((k) => w[i * 4 + k] !== wAll[i * 4 + k]));
    for (const [lo, hi, name] of [[3, 6, "three to six texels from the land"], [24, 999, "twenty-four and more out"]]) {
      const band = maskOf((X, Y, i) => seaNow[i] && Y >= 2 && Y < TH - 2 && dNow[i] >= lo && dNow[i] <= hi), cB = maskOf((X, Y, i) => belowSea[i] && Y >= 2 && Y < TH - 2 && dLandB[i] >= lo && dLandB[i] <= hi);
      const cW = maskOf((X, Y, i) => band[i] && movedW[i]), cF = maskOf((X, Y, i) => band[i] && Math.round(dNow[i]) < 40);
      let n = 0, nW = 0, nF = 0, chF = 0; for (let i = 0; i < TN; i++) if (band[i]) { n++; nW += cW[i]; if (cF[i]) { nF++; if (fw[i * 4 + 3] !== fAll[i * 4 + 3]) chF++; } }
      ok(nW >= 0.75 * n && chF >= 0.5 * nF, `CONTROL: of the ${n} sea texels ${name}, every one of them sea before it, the raise changed the water tint of ${nW}, and the shine of ${chF} of the ${nF} under the fog's cap`);
      const a = localSpread(w, seaNow, cW, rgbA), b = localSpread(w0, belowSea, cB, rgbA);
      ok(within(a, b, 0.25), `⭐ the water tint ${name} strays as the layer below's does at that distance (${ratios(a, b).join(" / ")} of ${b.map((v) => v.toFixed(1)).join(" / ")})`, { got: a, below: b });
      const sa = localSpread(fw, seaNow, cF, [3])[0], sb = localSpread(f0, belowSea, cB, [3])[0];
      ok(Math.abs(sa / sb - 1) <= 0.25, `⭐ …and so does the water's shine (${sa.toFixed(2)} against ${sb.toFixed(2)})`);
    }
  }

  console.log("\n-- ⭐ the sea an erase leaves has no line where the layer below's water changes with latitude --");
  {
    // A game whose water's coarse field is strong at some latitudes and weak at others — smoothly, a cosine of 64 rows, 0.4 to
    // 2 times the first game's — so whatever latitude bands the repaint learns it in, neighbouring ones are learnt at spreads
    // far apart, while the picture below steps at no row. (#a-sea-has-no-line-where-a-latitude-band-ends)
    const swell = (Y) => 0.4 + 1.6 * (0.5 - 0.5 * Math.cos((2 * Math.PI * Y) / 64));
    const waterSwell = (X, Y) => {
      if (landBelow(X, Y)) return [60, 70, 60, 255];
      const d = dLandB[Y * TW + X], c = cW(X, Y) * swell(Y), g = gW(X, Y) * ramp(d, 10, 3, 6, 16), shelf = 30 * Math.max(0, 1 - d / 6);
      return [35 + 6 * c + 0.7 * g, 59 + 8 * c + 0.85 * g + shelf * 0.5, 81 + 10 * c + g + shelf, 255];
    };
    const game2 = makeGame(waterSwell), m = mkMod();
    const r = md.flipProvinceToSea({ modRoot: m, gameRoot: game2, dependencyRoots: [], provinceId: 2 });
    const tx = r && r.heightmap && r.heightmap.textures;
    ok(r && r.changed && tx && tx.changed, "the land was erased and the world pictures repainted", r && (r.error || tx));
    const w = readTex(m, "colormap_water_0.dds"), wS = readTex(game2, "colormap_water_0.dds");
    const dNow = md.textureDistanceTo(TW, TH, (i) => provT(i % TW, (i / TW) | 0) === 5);
    const belowSea = maskOf((X, Y) => !landBelow(X, Y));
    const lay = { W: TW, H: TH, N: TN, cls: Uint8Array.from(belowSea, (v) => (v ? 2 : 1)), pure: new Uint8Array(TN).fill(1), idx: Uint8Array.from(belowSea, (v) => (v ? 15 : 0)) };
    const pw = md.learnWorldTextureColours({ layer: lay, water0: wS, urbanIdx: [], idxCat: new Map([[0, "plains"], [15, "ocean"]]), key: null });
    let lo = Infinity, hi = 0;
    for (let Y = 0; Y < TH; Y++) { const a = pw.waterNoiseAt(40, Y)[2]; lo = Math.min(lo, a); hi = Math.max(hi, a); }
    ok(hi > 2 * lo, `CONTROL: the palette learnt from it lays the water's coarse noise at spreads ${lo.toFixed(1)} to ${hi.toFixed(1)} by latitude, at one distance`);
    const lb = rowLine(wS, maskOf((X, Y, i) => belowSea[i] && dLandB[i] >= 16), rgbA), ln = rowLine(w, maskOf((X, Y, i) => provT(X, Y) === 2 && dNow[i] >= 16), rgbA);
    ok(lb.every((e) => e.ratio < 2.5), `CONTROL: the layer below's open sea steps at no row more than at the rows beside it: its worst row's step, averaged along the row, is ${lb.map((e) => `${e.ratio.toFixed(2)} (row ${e.row})`).join(" / ")} × theirs (${lb[0].rows} rows)`, lb);
    ok(ln.every((e, a) => e.ratio < 1.3 * lb[a].ratio), `⭐ …and nor does the open sea the erase painted (${ln.map((e) => `${e.ratio.toFixed(2)} (row ${e.row})`).join(" / ")} ×, ${ln[0].rows} rows): its strength drawn across latitude, not a band's taken whole — that drew a line across the sea at every band's edge`, ln);
  }

  console.log("\n-- ⭐ a restyled world's second raise, learnt off the land its first raise painted, is as grainy as the first --");
  {
    // A mod that owns its map and a colour map of its own colours (a header unlike the game's: not a copy, learnt from itself
    // at every write): its land a strip at the west edge, where the patch field is weak; bays A and B where it is strong, and
    // as strong in both (so whatever else strays in them — the coarse field — scales alike). Raising A paints it at the
    // strength learnt off the strip; raising B learns off the strip AND A, which is two fifths of the land it learns from.
    const RPX = (x, y) => (x < 128 ? 2 : y >= 256 && y < 448 ? (x >= 480 && x < 704 ? 3 : x >= 800 ? 4 : 1) : 1);
    const RT = (X, Y) => RPX(2 * X, 2 * Y);
    const m = mkMod();
    write(m, "map/provinces.bmp", bmp24(W, H, (x, y) => ({ 1: [0, 0, 200], 2: [200, 0, 0], 3: [0, 100, 200], 4: [0, 150, 200] })[RPX(x, y)]));
    write(m, "map/definition.csv", "0;0;0;0;land;false;unknown;0\n1;0;0;200;sea;false;ocean;0\n2;200;0;0;land;false;plains;1\n3;0;100;200;sea;false;ocean;0\n4;0;150;200;sea;false;ocean;0\n");
    write(m, "map/terrain.bmp", bmp8(W, H, (x, y) => (RPX(x, y) === 2 ? 0 : 15)));
    write(m, "map/heightmap.bmp", bmp8(W, H, (x, y) => (RPX(x, y) === 2 ? 106 : 89)));
    const own = rgb32(TW, TH, (X, Y) => { if (RT(X, Y) !== 2) return [...CM_SEA, 0]; const c = cCm(X, Y), g = gCm(X, Y); return [180 + 15 * c + 7 * g, 110 + 10 * c + 6 * g, 50 + 13 * c + 6.5 * g, 0]; });
    own.write("RSTY", 44, "latin1");   // (a reserved word: the header is not the game's, the pixels are as they were)
    write(m, "map/terrain/colormap_rgb_cityemissivemask_a.dds", own);
    const inA = maskOf((X, Y) => X >= 243 && X < 349 && Y >= 131 && Y < 221), inB = maskOf((X, Y) => X >= 403 && X < 509 && Y >= 131 && Y < 221);
    const landA = maskOf((X, Y) => RT(X, Y) === 3), landB = maskOf((X, Y) => RT(X, Y) === 4), strip = maskOf((X, Y) => RT(X, Y) === 2);
    const pA = patchRms(inA), pB = patchRms(inB), pS = patchRms(strip);
    ok(pA * pA > 1.3 && Math.abs(pB / pA - 1) < 0.05 && pS * pS < 0.95, `CONTROL: bays A and B lie where the patch field is strong (mean square ${(pA * pA).toFixed(2)} and ${(pB * pB).toFixed(2)}), the mod's own land where it is weak (${(pS * pS).toFixed(2)})`);
    const raise = (id) => md.setProvinceDefinition({ ...G(m), provinceId: id, type: "land", terrain: "plains", coastal: false, continent: 1 });
    const r1 = raise(3);
    ok(r1 && r1.changed && r1.heightmap && r1.heightmap.textures && r1.heightmap.textures.changed, "bay A was raised and the colour map repainted", r1 && (r1.error || r1.heightmap));
    const cmA = readTex(m, "colormap_rgb_cityemissivemask_a.dds");
    let red = 0, n = 0; for (let i = 0; i < TN; i++) if (inA[i]) { red += cmA[i * 4]; n++; }
    ok(red / n > 168, `CONTROL: bay A was painted in the mod's own land colour, learnt off its own picture (red ${(red / n).toFixed(0)}: the mod's 180, the game's 150)`);
    const gB = md.worldTextureLearnCounters.grains;
    const r2 = raise(4);
    ok(r2 && r2.changed && r2.heightmap && r2.heightmap.textures && r2.heightmap.textures.changed, "bay B was raised and the colour map repainted", r2 && (r2.error || r2.heightmap));
    ok(md.worldTextureLearnCounters.grains > gB, `CONTROL: a raise paints land, and the mod's own colour map was measured for its grain (+${md.worldTextureLearnCounters.grains - gB})`);
    const cmB = readTex(m, "colormap_rgb_cityemissivemask_a.dds");
    const sA = localSpread(cmA, landA, inA, rgbA).map((v) => v / pA), sB = localSpread(cmB, landB, inB, rgbA).map((v) => v / pB);
    ok(within(sB, sA, 0.05), `⭐ per unit of the patch field, bay B's grain is bay A's (${ratios(sB, sA).join(" / ")}): learnt off land Nova painted under a strong patch, the strength did not grow with it`, { A: sA, B: sB });
    // …and to the learner's own precision: the grain the second raise learns off the strip and bay A is the one the first
    // learnt off the strip alone — bay A's coast, where the repaint laid the sea's colour over its grain, not read as grain
    const lay = (land) => ({ W: TW, H: TH, N: TN, cls: Uint8Array.from(land, (v) => (v ? 1 : 2)), pure: new Uint8Array(TN).fill(1), idx: Uint8Array.from(land, (v) => (v ? 0 : 15)) });
    const learnOwn = (img, land) => md.learnWorldTextureColours({ layer: lay(land), colormap: img, urbanIdx: [], idxCat: new Map([[0, "plains"], [15, "ocean"]]), key: null, perPatch: true }).localSd(0);
    const l1 = learnOwn(dds.decodeDdsLevel(own, dds.parseDdsHeader(own), 0), strip), l2 = learnOwn(cmA, Uint8Array.from(strip, (v, i) => (v || landA[i] ? 1 : 0)));
    ok(within(l2, l1, 0.015), `⭐ …learnt as the mod's own picture is, the first raise's land adds nothing to the grain (${ratios(l2, l1).join(" / ")} of ${l1.map((v) => v.toFixed(2)).join(" / ")})`, { l1, l2 });
    // ⏱ the land's grain is measured when a write asks for it: an erase paints no land, so a restyled mod's own colour map —
    // learnt at every write, as every big mod's is (their pictures' headers are not the game's) — is not measured for it
    const gE = md.worldTextureLearnCounters.grains;
    const r3 = md.flipProvinceToSea({ ...G(m), provinceId: 3 });
    ok(r3 && r3.changed && r3.heightmap && r3.heightmap.textures && r3.heightmap.textures.changed, "bay A was erased again and the world pictures repainted", r3 && (r3.error || r3.heightmap));
    ok(md.worldTextureLearnCounters.grains === gE, `⭐ …and the land's grain was not measured for it (${md.worldTextureLearnCounters.grains - gE} times): an erase paints no land`);
  }

  console.log("\n-- ⭐ a layer below with two grounds of different grain: each index its own, read by what it MEANS where a mod renumbers it --");
  {
    // The forest game: the south half of its land west of the strip is forest (index 1, province 6), whose colour map carries
    // twice the plains' grain, as the base game's grounds differ from index to index. A raise paints each ground with its
    // own index's grain, not the land's pooled; and a mod whose table numbers forest 0 and plains 1 (as Old World Blues
    // renumbers 22 of vanilla's indices) paints its forest with the layer below's FOREST grain, which below is index 1 —
    // #a-layer-below-is-read-by-its-own-terrain-table. Its fog's grey carries a coarse field eight times its grain, so the
    // coarse noise the painter lays is most of the local stray it must leave room for (fog below).
    const forestAt = (X, Y) => landBelow(X, Y) && X < 496 && Y >= 128;
    const at3 = (x, y) => (x >= 640 && x < 992 && y >= 256 ? 6 : provAt(x, y));
    const cm3 = (X, Y) => { if (!forestAt(X, Y)) return cmBelow(X, Y); const c = cCm(X, Y), g = gCm(X, Y); return [70 + 15 * c + 14 * g, 110 + 10 * c + 12 * g, 40 + 13 * c + 13 * g, 0]; };
    const fow3 = (X, Y) => { if (!landBelow(X, Y)) return fowBelow(X, Y); const d = dWaterB[Y * TW + X], v = 150 - (d <= 2 ? 30 : 0) + 24 * cF(X, Y) + 3 * gF(X, Y); return [v, v, v, 21]; };
    const ix3 = (ix) => (x, y) => { const p = at3(x, y); return p === 1 || p === 3 ? 15 : p === 6 ? ix.forest : ix.plains; };
    const GAME_IX = { plains: 0, forest: 1 }, MOD_IX = { plains: 1, forest: 0 };
    const game3 = makeGame(waterBelow, { at: at3, def: DEF + "6;100;50;0;land;false;forest;1\n", ix: ix3(GAME_IX), table: terrainTable(GAME_IX), cm: cm3, fow: fow3 });
    const cmG = readTex(game3, "colormap_rgb_cityemissivemask_a.dds"), fG = readTex(game3, "fow_rgb_waterspec_a.dds");
    // (the layer below's two grounds, their windows inside them: west of the strip, clear of the line between them)
    const plainsB = maskOf((X, Y) => landBelow(X, Y) && !forestAt(X, Y)), forestB = maskOf((X, Y) => forestAt(X, Y));
    const gP = localSpread(cmG, plainsB, maskOf((X, Y) => X >= 323 && X < 493 && Y >= 3 && Y < 125), rgbA), gF3 = localSpread(cmG, forestB, maskOf((X, Y) => X >= 323 && X < 493 && Y >= 131 && Y < 253), rgbA);
    ok(gF3.every((v, k) => v >= 1.8 * gP[k]), `CONTROL: the layer below's forest strays ${ratios(gF3, gP).join(" / ")} × as far as its plains (${gF3.map((v) => v.toFixed(1)).join(" / ")} against ${gP.map((v) => v.toFixed(1)).join(" / ")}): one figure for the land is neither`);
    const pm = patchRms(newIn);
    for (const [what, terrain, table, want, below] of [["plains", "plains", null, GAME_IX.plains, gP], ["forest", "forest", null, GAME_IX.forest, gF3], ["forest, in a mod that numbers forest 0 and plains 1", "forest", MOD_IX, MOD_IX.forest, gF3]]) {
      const m = mkMod(), G3 = { modRoot: m, gameRoot: game3, dependencyRoots: [] };
      if (table) {
        write(m, "common/terrain/00_terrain.txt", terrainTable(table));
        write(m, "map/terrain.bmp", bmp8(W, H, ix3(table)));
      }
      const r = md.setProvinceDefinition({ ...G3, provinceId: 3, type: "land", terrain, coastal: false, continent: 1 });
      const tb = fs.readFileSync(path.join(m, "map", "terrain.bmp")), tm = md.readIndexedBmp(tb);
      let n = 0, right = 0; for (let y = 64; y < 448; y++) for (let x = 64; x < 576; x++) { n++; if (tb[tm.pixelOffset(x, y)] === want) right++; }
      ok(r && r.changed && r.heightmap && r.heightmap.textures && r.heightmap.textures.changed && right === n, `CONTROL ${what}: the bay was raised and repainted, every one of its ${n} pixels of terrain.bmp the mod's ${terrain} index ${want} (${right})`, r && (r.error || r.heightmap));
      const lN = localSpread(readTex(m, "colormap_rgb_cityemissivemask_a.dds"), newLand, newIn, rgbA).map((v) => v / pm);
      ok(within(lN, below, 0.25), `⭐ raised as ${what}, its colour map strays as the layer below's ${terrain} does, per unit of the patch field (${ratios(lN, below).join(" / ")} of ${below.map((v) => v.toFixed(1)).join(" / ")})`, { got: lN, below });
      if (terrain !== "plains") continue;
      // the fog's grey ten and more inland: the painter's coarse noise lays most of the local stray here, so the grain is
      // only what is left of it — laid at the layer below's whole stray, the new land strayed a quarter more
      const fw = readTex(m, "fow_rgb_waterspec_a.dds"), dW = md.textureDistanceTo(TW, TH, (i) => !(newLand[i] || landBelow(i % TW, (i / TW) | 0)));
      const belowIn10 = maskOf((X, Y, i) => landBelow(X, Y) && Y >= 3 && Y < TH - 3 && dWaterB[i] >= 10);
      const a = localSpread(fw, newLand, maskOf((X, Y, i) => newLand[i] && dW[i] >= 10), [1])[0], b = localSpread(fG, belowLand, belowIn10, [1])[0];
      const coarse = localSpread(Float64Array.from(fG, (v, i) => ((i & 3) === 1 ? 24 * cF((i >> 2) % TW, ((i >> 2) / TW) | 0) : v)), belowLand, belowIn10, [1])[0];
      ok(coarse >= 0.8 * b, `CONTROL: ten and more inland the layer below's coarse field alone strays ${coarse.toFixed(2)} of its grey's ${b.toFixed(2)}: most of it`);
      ok(Math.abs(a / b - 1) <= 0.12, `⭐ …and its fog's grey ten and more inland strays as the layer below's does there (${a.toFixed(2)} against ${b.toFixed(2)}): the grain laid net of the coarse noise's own share`);
    }
  }

  console.log("\n-- ⭐ a bucket too thin to measure is read where the measure is: the water's across latitudes, the fog's on its own side of the coast --");
  {
    const belowSea = maskOf((X, Y) => !landBelow(X, Y)), idxCat = new Map([[0, "plains"], [15, "ocean"]]);
    const lay = (pure) => ({ W: TW, H: TH, N: TN, cls: Uint8Array.from(belowSea, (v) => (v ? 2 : 1)), pure, idx: Uint8Array.from(belowSea, (v) => (v ? 15 : 0)) });
    // the water: three texels from the land the layer below's coast is one column of texels, so each latitude band of the
    // palette's (a sixteenth of the map) holds 16 of them — too few to measure, and read across every latitude at that
    // distance: the stray from the mean the painter lays, less what the grain lays beside it
    const pw = md.learnWorldTextureColours({ layer: lay(new Uint8Array(TN).fill(1)), water0: w0, urbanIdx: [], idxCat, key: null });
    const kAt = (d) => Math.round(pw.kOf(d)), k3 = kAt(3), q = [0, 0, 0], perRow = new Array(TH).fill(0);
    let n = 0;
    for (let i = 0; i < TN; i++) {
      if (!belowSea[i] || kAt(dLandB[i]) !== k3) continue;
      const Y = (i / TW) | 0, p = pw.waterAt(dLandB[i], Y); perRow[Y]++; n++;
      for (let c = 0; c < 3; c++) q[c] += (w0[i * 4 + c] - p[c]) ** 2;
    }
    // (the water grain's root mean square per unit of its local spread, over the grid the learn measures it on)
    let gq = 0; for (let y = 0; y < TH; y++) for (let x = 0; x < TW; x++) gq += md.textureGrain(x, y, SALT.water) ** 2;
    const gr = Math.sqrt(gq / TN), gl = pw.waterGrainAt(3), want = q.map((v, c) => Math.sqrt(Math.max(0, v / n - (gr * gl[c]) ** 2)));
    ok(perRow.every((v) => v === perRow[0]) && perRow[0] * TH / 16 < 60 && want.every((v, c) => v > 0.4 * Math.sqrt(q[c] / n)),
      `CONTROL: at three texels from the land the layer below's sea is ${perRow[0]} texel a row, ${perRow[0] * TH / 16} a latitude band; what it strays there is ${want.map((v) => v.toFixed(1)).join(" / ")} of coarse noise in ${q.map((v) => Math.sqrt(v / n).toFixed(1)).join(" / ")}`);
    const off = [8, 72, 136, 200, 248].map((Y) => [Y, pw.waterNoiseAt(3, Y)]).filter(([, a]) => !within(a, want, 0.05));
    ok(!off.length, `⭐ its coarse noise three texels out is read across latitudes at every latitude (${want.map((v) => v.toFixed(2)).join(" / ")}) — not none for want of a band to measure it in`, off.map(([Y, a]) => [Y, a.map((v) => +v.toFixed(2))]));
    // the fog: the land's first two texels counted at 24 rows only (the rest not pure: a texel of two provinces), so its
    // grain there is read from the nearest land that holds enough — three in — and not from across the coast, the sea's
    // first texel, whose grey is flat
    const pure = Uint8Array.from({ length: TN }, (_, i) => (landBelow(i % TW, (i / TW) | 0) && dWaterB[i] <= 2 && ((i / TW) | 0) >= 24 ? 0 : 1));
    const pf = md.learnWorldTextureColours({ layer: lay(pure), fow: f0, urbanIdx: [], idxCat, key: null });
    const ring = (d) => { let k = 0; for (let i = 0; i < TN; i++) if (pure[i] && landBelow(i % TW, (i / TW) | 0) && Math.round(dWaterB[i]) === d) k++; return k; };
    const seaGrey = localSpread(f0, belowSea, maskOf((X, Y, i) => belowSea[i] && dLandB[i] <= 3), [1])[0];
    ok(ring(1) === 24 && ring(2) === 24 && ring(3) === TH && seaGrey === 0, `CONTROL: the land's first and second texels in hold ${ring(1)} and ${ring(2)} pure texels, its third ${ring(3)}; the sea's grey beside them is flat (it strays ${seaGrey})`);
    const g1 = pf.fowAt(1).gg, g3 = pf.fowAt(3).gg;
    ok(g3 > 0 && Math.abs(g1 / g3 - 1) <= 0.2, `⭐ the fog's grey grain at the land's first texel is the land's three in (${g1.toFixed(2)} against ${g3.toFixed(2)}) — not the sea's, across the coast`);
  }

  console.log("\n-- ⭐ a mod of another size reads the layer below's water noise at the same latitude FRACTION --");
  {
    // #a-kind-nothing-knows-is-read-across-sizes — a mod whose map is 320 texels high (the game's 256), land but for a strait
    // at its west edge (four texels: under the 1% of the world a kind needs to be its own), so its own pictures know no sea:
    // the sea an erase leaves is painted from the game's water tint, read at the same FRACTION of the map's height. That
    // game's water carries its coarse noise only south of its row 128 — row 160 of the mod — so the mod's rows 136–148, north
    // of it at the fraction and south of it at the same row, are as quiet as the north. (Its coarse field smooth, 24 texels:
    // the grain is learnt per distance, over every latitude, and a fine one there is grain the north is painted with too.)
    const cSouth = coarseOf(9106, 24, 3), south = (X, Y) => {
      if (landBelow(X, Y)) return [60, 70, 60, 255];
      const d = dLandB[Y * TW + X], c = Y < TH / 2 ? 0 : 2 * cSouth(X, Y), g = gW(X, Y) * ramp(d, 10, 3, 6, 16), shelf = 30 * Math.max(0, 1 - d / 6);
      return [35 + 6 * c + 0.7 * g, 59 + 8 * c + 0.85 * g + shelf * 0.5, 81 + 10 * c + g + shelf, 255];
    };
    const gameS = makeGame(south), m = mkMod(), RH = 640, RTH = RH / 2, strait = (X) => X < 4;
    write(m, "map/provinces.bmp", bmp24(W, RH, (x) => COL[x < 8 ? 1 : x < 640 ? 2 : 5]));
    write(m, "map/definition.csv", "0;0;0;0;land;false;unknown;0\n1;0;0;200;sea;false;ocean;0\n2;200;0;0;land;false;plains;1\n5;0;200;0;land;false;plains;1\n");
    write(m, "map/terrain.bmp", bmp8(W, RH, (x) => (x < 8 ? 15 : 0)));
    write(m, "map/heightmap.bmp", bmp8(W, RH, (x) => (x < 8 ? 89 : 106)));
    // its own pictures, in its own colours (a header unlike the game's: not a copy)
    const own = (w, h, fn) => { const b = rgb32(w, h, fn); b.write("RSTY", 44, "latin1"); return b; };
    write(m, "map/terrain/colormap_rgb_cityemissivemask_a.dds", own(TW, RTH, (X, Y) => (strait(X) ? [40, 90, 150, 0] : [180 + 7 * gCm(X, Y), 110 + 6 * gCm(X, Y), 50, 0])));
    for (const [n, s] of [["colormap_water_0.dds", 1], ["colormap_water_1.dds", 2], ["colormap_water_2.dds", 4]]) write(m, "map/terrain/" + n, own(TW / s, RTH / s, (X) => (strait(X * s) ? [20, 40, 120, 255] : [50, 60, 50, 255])));
    write(m, "map/terrain/fow_rgb_waterspec_a.dds", own(TW, RTH, (X, Y) => { if (strait(X)) return [80, 80, 80, 45]; const v = 160 + 5 * gF(X, Y); return [v, v, v, 21]; }));
    const r = md.flipProvinceToSea({ modRoot: m, gameRoot: gameS, dependencyRoots: [], provinceId: 2 });
    ok(r && r.changed && r.heightmap && r.heightmap.textures && r.heightmap.textures.changed, "the mod's west half was erased and its pictures repainted", r && (r.error || r.heightmap));
    // the new sea 24 and more texels from the land (columns 6–295), each row less its own mean: how far it strays, by rows
    const w = readTex(m, "colormap_water_0.dds");
    const stray = (y0, y1) => {
      let q = 0, n = 0;
      for (let Y = y0; Y <= y1; Y++) {
        let mu = 0; for (let X = 6; X < 296; X++) mu += w[(Y * TW + X) * 4 + 2]; mu /= 290;
        for (let X = 6; X < 296; X++) { q += (w[(Y * TW + X) * 4 + 2] - mu) ** 2; n++; }
      }
      return Math.sqrt(q / n);
    };
    const north = stray(16, 100), southRows = stray(200, 300), between = stray(136, 148);
    ok(north > 0.5 && southRows >= 3 * north, `CONTROL: the new sea's blue strays ${southRows.toFixed(1)} on rows 200–300 (south of the game's row 128 at either reading) and ${north.toFixed(1)} — its grain — on rows 16–100 (north of it at either)`);
    ok(between <= 1.3 * north, `⭐ …and ${between.toFixed(1)} on rows 136–148: north of the game's row 128 at the same fraction of the height (rows 108–118 of its 256), as quiet as the north — not the south's noise, read at the same row`);
  }

  console.log("\n-- the same write gives the same bytes --");
  {
    const m = mkMod();
    md.setProvinceDefinition({ ...G(m), provinceId: 3, type: "land", terrain: "plains", coastal: false, continent: 1 });
    for (const n of ["colormap_rgb_cityemissivemask_a.dds", "colormap_water_0.dds", "fow_rgb_waterspec_a.dds"]) {
      const a = fs.readFileSync(path.join(raised, "map", "terrain", n)), b = fs.readFileSync(path.join(m, "map", "terrain", n));
      ok(sha(a) === sha(b), `${n}: the same raise in another mod paints the same bytes`);
    }
  }
} finally {
  for (const r of roots) { try { fs.rmSync(r, { recursive: true, force: true }); } catch (_) { /* a temp folder: the OS cleans it */ } }
}
console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
