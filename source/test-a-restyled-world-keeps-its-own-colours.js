// ⛔ #a-restyled-world-keeps-its-own-colours — A WORLD PICTURE THE MOD OWNS IS PAINTED IN ITS OWN COLOURS.
//
// repaintWorldTextures learnt every palette from the layer BELOW. A mod that ships its own restyled world pictures — Hearts
// of Minecraft's saturated water tint, Old World Blues' brown one, Rise of Nations' darker sea — had every Delete map, raise
// and erase repaint the texels it touched in the base game's colours: on a copy of Hearts of Minecraft, Delete map painted
// the whole ocean of its 45,68,247 tint 32,50,75, and Old World Blues (a 5632 x 2304 map, every picture a size vanilla's
// are not) was never repainted at all — the drowned land kept its land paint. A picture the mod owns is now learnt from
// ITSELF, over the map it was drawn for — the map before the write, recounted, so a Delete map still has the land to learn
// from — kind by kind, wherever the minimap's trust rule (ownKindsOf) trusts it; the rest from the layer below. Pinned here,
// driven through Nova's real writers (Delete map, the erase, the retype), on a world whose open sea lies 40 and more texels
// from any land, so what the drowned texels take is the picture's own open-sea colour and not a fallback:
//   · Delete map: the drowned texels carry the mod's own colour-map sea and water tint, and the untouched ocean its tint;
//   · a mod of another size than the layer below (Old World Blues' case) is repainted too, and nothing keeps land paint;
//     a city raised on it lights one core the size of its own cities, counted on its map as it stood before the write;
//     land raised on it after Delete map, a kind its own pictures no longer have, is read from the layer below's pictures
//     at the same latitude FRACTION (#a-kind-nothing-knows-is-read-across-sizes), and the sea round it stays its own;
//     a land colour that changes with latitude is read at that fraction too, not at the same row; and a picture of that size
//     whose two kinds are both its own keeps both through an erase, though its sea is the game's paper drawn again;
//   · a mod whose terrain table numbers its ground otherwise than the layer below's (Old World Blues' does, 22 indices of 25)
//     is painted by what each index MEANS: the layer below is learnt with its own table and asked by the mod's category, at
//     the layer below's size and at another (#a-layer-below-is-read-by-its-own-terrain-table) — and with ITS table, not one a
//     dependency above it renumbers;
//   · each kind of ONE picture from where it was learnt: a colour map whose land is its own and whose sea is the game's paper
//     (Hearts of Minecraft's), and after Delete map a water tint and a fog map whose sea is their own and whose land is not;
//   · a kind with under 1% of the world's texels is not the mod's own, and a coast a stroke crossed is learnt as neither kind;
//   · Delete map, then land raised on the empty sea: the ocean keeps the mod's tint (its one kind is its own) — and a tint
//     that changes with latitude, as Rise of Nations' does, keeps each latitude's, spread as it is;
//   · the base game's tint saved again in another format (Millennium Dawn's) is the layer below's paper, judged at the
//     same distance from land, so a coast raised after Delete map still gets the layer below's shallows;
//   · a mod that restyles only its water tint keeps it, whatever its colour map is (the water is judged by itself);
//   · full-size _1 and _2 water tints (Hearts of Minecraft's, Rise of Nations') follow _0 texel for texel;
//   · the same clicks give the same bytes whether or not Nova was restarted between them, and a tint repainted outside
//     Nova between two clicks is learnt again (nothing a session remembers of a picture outlives a write to it);
//   · a picture that is not one to learn from is not learnt from: one drawn for another map, one drawn for far less land,
//     a picture of continents over a map all sea, and one whose header is the base game's byte for byte (every Nova world);
//   · a distance nothing on the map stands at is read from the nearest one something does, not from vanilla's sea;
//   · an index thin in the map's first latitude band is not read from the band before it — which, by number, is the last band
//     of the index before it — and nor is a terrain category asked by name.
// Every restyled picture carries a header unlike the game's (another format), as Hearts of Minecraft's and OWB's do.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { spawnSync } = require("child_process");
const md = require("./map-data.js");
const dds = require("./dds-codec.js");
const { stripJsComments } = require("./testlib-strip-comments.js");

let pass = 0, fail = 0;
const ok = (c, m, x) => {
  if (c) { pass++; console.log("  ok   " + m); }
  else { fail++; console.log("  FAIL " + m + (x !== undefined ? "   -> " + JSON.stringify(x).slice(0, 400) : "")); }
};
const roots = [];
const tmp = (tag) => { const d = fs.mkdtempSync(path.join(os.tmpdir(), "nova-restyled-world-" + tag + "-")); roots.push(d); return d; };
const write = (dir, rel, body) => { const p = path.join(dir, ...rel.split("/")); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, body); return p; };
const sha = (b) => crypto.createHash("sha1").update(b).digest("hex");

// ── bitmaps and DDS files (as test-the-owned-world-texture-repaint-is-windowed.js makes them) ─────────────────────────
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
/** A DDS of `format` (RGB32 | DXT1 | DXT3 | DXT5), `levels` mips (0 = the whole chain), painted by fn(x, y, level) → [r, g, b, a]. */
function makeDds(W, H, format, levels, fn) {
  if (!levels) { levels = 1; for (let w = W, h = H; w > 1 || h > 1; w = Math.max(1, w >> 1), h = Math.max(1, h >> 1)) levels++; }
  const h = Buffer.alloc(128), compressed = format.startsWith("DXT");
  h.write("DDS ", 0, "latin1"); h.writeUInt32LE(124, 4);
  h.writeUInt32LE(0x1007 | (levels > 1 ? 0x20000 : 0) | (compressed ? 0x80000 : 0x8), 8);
  h.writeUInt32LE(H, 12); h.writeUInt32LE(W, 16);
  h.writeUInt32LE(compressed ? Math.max(1, Math.ceil(W / 4)) * Math.max(1, Math.ceil(H / 4)) * (format === "DXT1" ? 8 : 16) : W * 4, 20);
  h.writeUInt32LE(levels, 28); h.writeUInt32LE(32, 76);
  if (compressed) { h.writeUInt32LE(0x4, 80); h.write(format, 84, "latin1"); }
  else { h.writeUInt32LE(0x41, 80); h.writeUInt32LE(32, 88); h.writeUInt32LE(0xff0000, 92); h.writeUInt32LE(0xff00, 96); h.writeUInt32LE(0xff, 100); h.writeUInt32LE(0xff000000, 104); }
  h.writeUInt32LE(0x1000 | (levels > 1 ? 0x400008 : 0), 108);
  let size = 128, w = W, hh = H;
  for (let l = 0; l < levels; l++) { size += compressed ? Math.max(1, Math.ceil(w / 4)) * Math.max(1, Math.ceil(hh / 4)) * (format === "DXT1" ? 8 : 16) : w * hh * 4; w = Math.max(1, w >> 1); hh = Math.max(1, hh >> 1); }
  const buf = Buffer.alloc(size); h.copy(buf);
  const hdr = dds.parseDdsHeader(buf);
  if (hdr.error) throw new Error("makeDds: " + hdr.error);
  for (let l = 0; l < hdr.levels; l++) {
    const { w: lw, h: lh } = hdr.lv[l], rgba = new Uint8Array(lw * lh * 4);
    for (let y = 0; y < lh; y++) for (let x = 0; x < lw; x++) rgba.set(fn(x, y, l).map((v) => Math.max(0, Math.min(255, Math.round(v)))), (y * lw + x) * 4);
    dds.patchDdsLevel(buf, hdr, l, rgba, new Uint8Array(lw * lh).fill(1));
  }
  return buf;
}
// deterministic texture detail, so every picture has a grain of its own
const jit = (x, y, s) => { let v = (x * 73856093) ^ (y * 19349663) ^ (s * 83492791); v = Math.imul(v ^ (v >>> 13), 1274126177); return ((v ^ (v >>> 16)) >>> 0) % 5; };

// ── the game: 384 x 128 provinces.bmp, so every world picture is 192 x 64 texels ────────────────────────────────────
//   1  sea, everywhere else: 120 texels of it west of the continent, its middle 40 and more from any land
//   2  land, the continent's west coast        240 <= x < 272, 16 <= y < 112   (what the erase drowns, what the raise lifts)
//   3  land, inland                             272 <= x < 384, 16 <= y < 112
//   4  urban, a lit city                        336 <= x < 368, 88 <= y < 112
//   5  sea, a lagoon inside 3                    296 <= x < 360, 24 <= y < 72
//   7  land, an islet                            200 <= x < 204, 60 <= y < 64
const PW = 384, PH = 128, TW = 192, TH = 64;
const COL = { 1: [0, 0, 200], 2: [200, 0, 0], 3: [0, 200, 0], 4: [200, 200, 0], 5: [0, 100, 200], 7: [50, 50, 50], 8: [100, 0, 100], 9: [90, 0, 0], 10: [0, 0, 90] };
const provAt = (x, y) => (x >= 200 && x < 204 && y >= 60 && y < 64 ? 7 : y < 16 || y >= 112 || x < 240 ? 1 : x < 272 ? 2
  : x >= 296 && x < 360 && y >= 24 && y < 72 ? 5 : x >= 336 && x < 368 && y >= 88 ? 4 : 3);
const DEF = "0;0;0;0;land;false;unknown;0\n1;0;0;200;sea;false;ocean;0\n2;200;0;0;land;true;plains;1\n3;0;200;0;land;true;plains;1\n4;200;200;0;land;true;urban;1\n5;0;100;200;sea;false;ocean;0\n7;50;50;50;land;true;plains;1\n";
const IDX = { plains: 0, urban: 13, ocean: 15 };
// common/terrain/00_terrain.txt numbering its terrain.bmp by `ix` (the game's by IDX)
const terrainTable = (ix) => ["categories = {", "  plains = { color = { 200 200 100 } }", "  urban = { color = { 120 110 100 } }", "  ocean = { color = { 0 0 200 } is_water = yes }", "}",
  "terrain = {", `  plains = { type = plains color = { ${ix.plains} } }`, `  urban = { type = urban color = { ${ix.urban} } }`, `  ocean = { type = ocean color = { ${ix.ocean} } }`, "}", ""].join("\n");
const TERRAIN = terrainTable(IDX);
const isWater = (p) => p === 1 || p === 5 || p === 10;
const isCity = (p) => p === 4 || p === 8;   // (8: a second city only one mod's map has; 9 and 10 are another mod's, below)
// every province edge is on an even pixel, so each texel is one province: its top-left pixel's
const provT = (X, Y, at = provAt) => at(2 * X, 2 * Y);
// the base game's paper, and a restyle far from it in every picture. (Its sea is not vanilla's 79,102,142, the colour once
// typed in for a distance nothing stands at, so the two can be told apart.)
const SEA_RGB = [60, 110, 160], LAND_RGB = [150, 120, 60], URBAN_RGB = [120, 110, 100], GAME_WATER = [35, 59, 81];
const TYPED_SEA = [79, 102, 142];
// the base game's water tint over LAND changes with latitude, and is nowhere the 60,70,60 once typed in for a palette with no
// land to learn it from — so a raised coast that took that colour, or another latitude's, can be told from one that did not
const gameWaterLand = (Y) => [40 + 3 * Y, 90, 40], TYPED_WATER_LAND = [60, 70, 60];
const MOD_CM_SEA = [200, 60, 30], MOD_CM_LAND = [120, 120, 120], MOD_WATER = [45, 67, 247];
// the base game's water tint is lighter near land, as vanilla's is: SHALLOW_STEP more a texel nearer than SHALLOWS
const SHALLOWS = 24, SHALLOW_STEP = [2, 3, 4];
const gameLandDist = (() => {
  const land = []; for (let Y = 0; Y < TH; Y++) for (let X = 0; X < TW; X++) if (!isWater(provT(X, Y))) land.push(X, Y);
  const d = new Float32Array(TW * TH);
  for (let Y = 0; Y < TH; Y++) for (let X = 0; X < TW; X++) {
    let m = Infinity;
    if (isWater(provT(X, Y))) { for (let j = 0; j < land.length; j += 2) { const q = (land[j] - X) ** 2 + (land[j + 1] - Y) ** 2; if (q < m) m = q; } } else m = 0;
    d[Y * TW + X] = Math.sqrt(m);
  }
  return d;
})();
const shallow = (X, Y, c) => SHALLOW_STEP[c] * Math.max(0, SHALLOWS - gameLandDist[Y * TW + X]);
// (drawn for the game's map, the only one it is drawn for; its land LAND_RGB at every latitude unless `landAt` says otherwise)
const gamePics = (at, landAt = () => LAND_RGB) => ({
  colormap: (X, Y) => { const p = provT(X, Y, at), L = landAt(Y); return isWater(p) ? [SEA_RGB[0] + jit(X, Y, 1), SEA_RGB[1], SEA_RGB[2], 0] : p === 4 ? [...URBAN_RGB, 173] : [L[0] + jit(X, Y, 2), L[1], L[2] + jit(X, Y, 3), 0]; },
  water: (X, Y) => (isWater(provT(X, Y, at)) ? [GAME_WATER[0] + jit(X, Y, 4) + shallow(X, Y, 0), GAME_WATER[1] + shallow(X, Y, 1), GAME_WATER[2] + shallow(X, Y, 2), 255] : [...gameWaterLand(Y), 255]),
  fow: (X, Y) => (isWater(provT(X, Y, at)) ? [90, 90, 90, 40 + jit(X, Y, 5)] : [140, 140, 140, 21]),
});
const modPics = (at) => ({
  colormap: (X, Y) => { const p = provT(X, Y, at); return isWater(p) ? [MOD_CM_SEA[0] + jit(X, Y, 6), MOD_CM_SEA[1], MOD_CM_SEA[2], 0] : isCity(p) ? [60, 60, 200, 173] : [MOD_CM_LAND[0] + jit(X, Y, 7), MOD_CM_LAND[1], MOD_CM_LAND[2], 0]; },
  water: (X, Y) => [MOD_WATER[0] + jit(X, Y, 8), MOD_WATER[1], MOD_WATER[2], 255],
  fow: (X, Y) => (isWater(provT(X, Y, at)) ? [50, 50, 50, 38 + jit(X, Y, 9)] : [180, 180, 180, 12]),
});
const NAMES = { colormap: "colormap_rgb_cityemissivemask_a.dds", water0: "colormap_water_0.dds", water1: "colormap_water_1.dds", water2: "colormap_water_2.dds", fow: "fow_rgb_waterspec_a.dds" };
const MW = 32, MH = 12;
/** The game: its map `at` (provAt unless given) with `def`, and its pictures drawn for it, its land coloured by `landAt`. */
function makeGame({ at = provAt, def = DEF, landAt } = {}) {
  const g = tmp("game");
  write(g, "hoi4.exe", "");
  write(g, "map/provinces.bmp", bmp24(PW, PH, (x, y) => COL[at(x, y)]));
  write(g, "map/definition.csv", def);
  write(g, "map/terrain.bmp", bmp8(PW, PH, (x, y) => { const p = at(x, y); return isWater(p) ? IDX.ocean : p === 4 ? IDX.urban : IDX.plains; }));
  write(g, "map/heightmap.bmp", bmp8(PW, PH, (x, y) => (isWater(at(x, y)) ? 89 : 106)));
  write(g, "common/terrain/00_terrain.txt", TERRAIN);
  const p = gamePics(at, landAt);
  write(g, "map/terrain/" + NAMES.colormap, makeDds(TW, TH, "RGB32", 1, (x, y) => p.colormap(x, y)));
  write(g, "map/terrain/" + NAMES.water0, makeDds(TW, TH, "DXT5", 1, (x, y) => p.water(x, y)));
  write(g, "map/terrain/" + NAMES.water1, makeDds(TW / 2, TH / 2, "DXT5", 1, (x, y) => p.water(2 * x, 2 * y)));
  write(g, "map/terrain/" + NAMES.water2, makeDds(TW / 4, TH / 4, "DXT5", 1, (x, y) => p.water(4 * x, 4 * y)));
  write(g, "map/terrain/" + NAMES.fow, makeDds(TW, TH, "DXT5", 7, (x, y, l) => p.fow(x << l, y << l)));
  write(g, "gfx/minimap/minimap.dds", makeDds(MW, MH, "RGB32", 1, (u, v) => { const x = Math.floor((u + 0.5) * PW / MW), y = Math.floor((v + 0.5) * PH / MH); return isWater(at(x, y)) ? [84, 78, 66, 255] : [170, 162, 147, 255]; }));
  return g;
}
/** A mod that owns the map `at` draws (the game's unless given) and its own pictures: `pics` (the restyle unless given) in
 *  another format than the game's — so a header unlike the game's — with its _1 and _2 water tints full-size copies of _0,
 *  as Hearts of Minecraft ships them. `only` names the pictures the mod draws itself; the rest are the game's, copied.
 *  `def` is its definition.csv when its map is not the game's. */
function makeMod(game, tag, { at = null, rows = PH, pics = null, only = null, def = null } = {}) {
  const m = tmp(tag);
  write(m, "descriptor.mod", 'version="1.0"\nname="restyled world"\n');
  const mapAt = at || provAt, TH2 = rows / 2;
  if (!at && rows === PH) for (const f of ["provinces.bmp", "definition.csv", "terrain.bmp", "heightmap.bmp"]) write(m, "map/" + f, fs.readFileSync(path.join(game, "map", f)));
  else {
    write(m, "map/provinces.bmp", bmp24(PW, rows, (x, y) => COL[mapAt(x, y)]));
    write(m, "map/definition.csv", def || DEF);
    write(m, "map/terrain.bmp", bmp8(PW, rows, (x, y) => { const p = mapAt(x, y); return isWater(p) ? IDX.ocean : isCity(p) ? IDX.urban : IDX.plains; }));
    write(m, "map/heightmap.bmp", bmp8(PW, rows, (x, y) => (isWater(mapAt(x, y)) ? 89 : 106)));
  }
  const p = pics || modPics(mapAt), mine = (k) => !only || only.includes(k);
  const copy = (n) => write(m, "map/terrain/" + n, fs.readFileSync(path.join(game, "map", "terrain", n)));
  if (mine("colormap")) write(m, "map/terrain/" + NAMES.colormap, makeDds(TW, TH2, "DXT5", 0, (x, y, l) => p.colormap(x << l, y << l))); else copy(NAMES.colormap);
  if (mine("water")) {
    const w = makeDds(TW, TH2, "RGB32", 1, (x, y) => p.water(x, y));
    for (const n of [NAMES.water0, NAMES.water1, NAMES.water2]) write(m, "map/terrain/" + n, w);
  } else for (const n of [NAMES.water0, NAMES.water1, NAMES.water2]) copy(n);
  if (mine("fow")) write(m, "map/terrain/" + NAMES.fow, makeDds(TW, TH2, "RGB32", 1, (x, y) => p.fow(x, y))); else copy(NAMES.fow);
  return m;
}
const readTex = (root, n) => { const b = fs.readFileSync(path.join(root, "map", "terrain", n)); const h = dds.parseDdsHeader(b); return { b, h, img: dds.decodeDdsLevel(b, h, 0) }; };
const px = (img, i) => [img[i * 4], img[i * 4 + 1], img[i * 4 + 2]];
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const fmt = (a) => a.map((v) => Math.round(v)).join(",");
const avg = (img, set) => [0, 1, 2].map((k) => set.reduce((s, i) => s + img[i * 4 + k], 0) / Math.max(1, set.length));
const texels = (f, th = TH) => { const o = []; for (let Y = 0; Y < th; Y++) for (let X = 0; X < TW; X++) if (f(X, Y)) o.push(Y * TW + X); return o; };
const hashes = (m) => Object.fromEntries(Object.values(NAMES).map((n) => [n, sha(fs.readFileSync(path.join(m, "map", "terrain", n)))]));
/** The two numbers the two-kind guard reads, worked out here over the map `at`: of the texels all land or all water, the share
 *  nearer their own kind's mean than the other's (a tie counts as land), and how far apart the two means are. */
function agreeSep(img, at, th = TH) {
  const land = texels((X, Y) => !isWater(provT(X, Y, at)), th), sea = texels((X, Y) => isWater(provT(X, Y, at)), th);
  const ml = avg(img, land), ms = avg(img, sea);
  const good = land.filter((i) => dist(px(img, i), ml) <= dist(px(img, i), ms)).length + sea.filter((i) => dist(px(img, i), ml) > dist(px(img, i), ms)).length;
  return { agree: good / (land.length + sea.length), sep: dist(ml, ms), land: fmt(ml), sea: fmt(ms) };
}
const raise2 = (G) => md.setProvinceDefinition({ ...G, provinceId: 2, type: "land", terrain: "plains", coastal: true, continent: 1 });

try {
  const game = makeGame();
  const G = (m) => ({ modRoot: m, gameRoot: game, dependencyRoots: [] });
  // the land of the game's map, and the open sea 40 and more texels from any of it (Euclidean 43, which the writer's
  // chamfer distance never reads as under 40)
  const landTexels = texels((X, Y) => !isWater(provT(X, Y)));
  const openSea = texels((X, Y) => isWater(provT(X, Y)) && landTexels.every((j) => Math.hypot((j % TW) - X, ((j / TW) | 0) - Y) >= 43));
  ok(landTexels.length > 2000 && openSea.length >= 150, `CONTROL: the world has ${landTexels.length} land texels and ${openSea.length} of open sea 40 and more from any land — a bucket a restyle's own sea is learnt in, not a fallback`, { land: landTexels.length, open: openSea.length });

  console.log("\n-- ⭐ Delete map on a restyled mod: the drowned world carries the mod's own sea --");
  {
    const m = makeMod(game, "delete");
    const cm0 = readTex(m, NAMES.colormap).img, w00 = readTex(m, NAMES.water0).img;
    ok(landTexels.every((i) => dist(px(cm0, i), MOD_CM_SEA) > 100), "CONTROL: every land texel of its colour map is drawn far from its sea before the write");
    const b = md.blankMapToSea(G(m));
    const tx = b && b.heightmap && b.heightmap.textures;
    ok(!!tx && tx.changed && tx.inherited === false, "Delete map repainted the mod's own pictures", b && (b.error || tx));
    const cm = readTex(m, NAMES.colormap).img;
    // (within 12: the picture learnt over the map AFTER the write — all sea, its old land counted as sea — averages to a
    // blend 30 off it, which a looser bound let through)
    const off = landTexels.filter((i) => dist(px(cm, i), MOD_CM_SEA) > 12);
    ok(!off.length, `⭐ all ${landTexels.length} drowned texels of the colour map carry the mod's own sea (${fmt(MOD_CM_SEA)}), not the base game's (${fmt(SEA_RGB)}) nor a blend of its land and sea`, { off: off.length, got: fmt(avg(cm, off.slice(0, 50))) });
    const w0 = readTex(m, NAMES.water0).img;
    const wOff = landTexels.filter((i) => dist(px(w0, i), MOD_WATER) > 20);
    ok(!wOff.length, `⭐ …and of the water tint the mod's own tint (${fmt(MOD_WATER)}), not the base game's (${fmt(GAME_WATER)})`, { off: wOff.length, got: fmt(avg(w0, wOff.slice(0, 50))) });
    const seaMoved = openSea.filter((i) => dist(px(w0, i), px(w00, i)) > 6);
    ok(!seaMoved.length, `…and the ${openSea.length} texels of open sea keep the tint they had`, { moved: seaMoved.length, got: fmt(avg(w0, seaMoved.slice(0, 50))) });
    // …and its fog: learnt over the map as it loads after the write, all sea, the fog's land and sea are one blend that strays
    // too far to be trusted, and the drowned land took the game's sea fog (90) in the middle of the mod's own (50)
    const fw = readTex(m, NAMES.fow).img, fOff = landTexels.filter((i) => Math.abs(fw[i * 4 + 1] - 50) > 6);
    ok(!fOff.length, `⭐ …and of the fog map the mod's own sea fog (50 grey), not the base game's (90)`, { off: fOff.length, got: fOff.slice(0, 5).map((i) => fw[i * 4 + 1]) });
  }

  console.log("\n-- ⭐ a mod whose map is not the layer below's size (Old World Blues') is repainted too --");
  {
    // 32 more rows of sea to the south: every picture 192 x 80, the layer below's 192 x 64 — nothing below to learn from
    const ROWS = PH + 32, at = (x, y) => (y < PH ? provAt(x, y) : 1), land = texels((X, Y) => !isWater(provT(X, Y, at)), ROWS / 2);
    const islet = texels((X, Y) => provT(X, Y, at) === 7, ROWS / 2);
    const m = makeMod(game, "owb", { at, rows: ROWS });
    const r = md.flipProvinceToSea({ ...G(m), provinceId: 7 });
    const tx = r && r.heightmap && r.heightmap.textures;
    ok(!!tx && tx.changed, "⭐ an erase repaints its pictures, learnt from themselves", tx);
    const cm1 = readTex(m, NAMES.colormap).img;
    ok(islet.length === 4 && islet.every((i) => dist(px(cm1, i), MOD_CM_SEA) <= 30), `…and the ${islet.length} texels of the drowned islet carry its own sea`, islet.map((i) => px(cm1, i)));
    const b = md.blankMapToSea(G(m));
    const btx = b && b.heightmap && b.heightmap.textures;
    ok(!!btx && btx.changed, "⭐ Delete map repaints them — the map before it, recounted, still has its land to learn from", b && (b.error || btx));
    const cm = readTex(m, NAMES.colormap).img;
    const kept = land.filter((i) => dist(px(cm, i), MOD_CM_LAND) <= 30), notSea = land.filter((i) => dist(px(cm, i), MOD_CM_SEA) > 30);
    ok(land.length > 2000 && !kept.length && !notSea.length, `⭐ …so none of its ${land.length} drowned colour-map texels still shows the old land, and every one its own sea`, { kept: kept.length, notSea: notSea.length });
    // …and land raised on its all-sea map afterwards. Its own pictures know no land now, and nothing below is their size: the
    // kind they cannot paint is read from the layer below's pictures of another size, at the same FRACTION of the map's height
    // (#a-kind-nothing-knows-is-read-across-sizes). ⚠️ This check said the raise was refused, and left every picture as it was:
    // it was, and on Old World Blues 80,786 texels of new land sat in the sea paint Delete map had just written (review of fc219c6)
    const r2 = raise2(G(m));
    const tx2 = r2 && r2.heightmap && r2.heightmap.textures;
    ok(!!tx2 && tx2.changed, "⭐ land raised on its all-sea map afterwards is repainted, not left in the sea paint Delete map wrote", tx2);
    const coast = texels((X, Y) => provT(X, Y, at) === 2, ROWS / 2), mid = coast.filter((i) => { const X = i % TW; return X >= 124 && X < 132; });
    const cm2 = readTex(m, NAMES.colormap).img, w2 = readTex(m, NAMES.water0).img, f2 = readTex(m, NAMES.fow).img, a2 = avg(cm2, mid);
    ok(mid.length > 300 && dist(a2, LAND_RGB) <= 12, `⭐ …the middle of it the layer below's land (${fmt(LAND_RGB)}): ${fmt(a2)}, not its own sea (${fmt(MOD_CM_SEA)})`, { got: fmt(a2) });
    // its row Y of 80 is the layer below's row (Y + ½)·64/80 − ½: from row 34 on, reading the row as it stands is 21 and more off
    const atFraction = (Y) => gameWaterLand((Y + 0.5) * TH / (ROWS / 2) - 0.5), low = coast.filter((i) => ((i / TW) | 0) >= 34);
    const wOff = low.filter((i) => dist(px(w2, i), atFraction((i / TW) | 0)) > 9);
    ok(low.length > 300 && !wOff.length, `⭐ …its water tint over each of ${low.length} texels the layer below's at the same latitude FRACTION, not at the same row`,
      { off: wOff.length, got: wOff.slice(0, 5).map((i) => [(i / TW) | 0, fmt(px(w2, i)), fmt(atFraction((i / TW) | 0)), fmt(gameWaterLand((i / TW) | 0))]) });
    const fOff = coast.filter((i) => Math.abs(f2[i * 4 + 1] - 140) > 6);
    ok(!fOff.length, `⭐ …its fog the layer below's land fog (140 grey), not its own sea fog (50)`, { off: fOff.length, got: fOff.slice(0, 5).map((i) => f2[i * 4 + 1]) });
    // …and the sea round it, the one kind its pictures still have, stays its own: judged against the layer below's colours, as
    // a kind alone is at the same size — taken from the layer below too, it left a ring of the game's sea round the new coast
    const ring = texels((X, Y) => X >= 108 && X < 120 && Y >= 12 && Y < 52, ROWS / 2), ringOff = ring.filter((i) => dist(px(cm2, i), MOD_CM_SEA) > 30);
    ok(ring.length === 480 && !ringOff.length, `⭐ …and the ${ring.length} texels of its own sea beside the new coast keep its own sea (${fmt(MOD_CM_SEA)}), not the layer below's (${fmt(SEA_RGB)})`,
      { off: ringOff.length, got: fmt(avg(cm2, ringOff.slice(0, 50))) });
    // a new city on it gets one lit core the size its own cities are — counted on its own map as it stood before the write,
    // where its one city lights 192 texels: nothing below to count, and the new city not one of them yet
    const c = makeMod(game, "owb-city", { at, rows: ROWS });
    const city = texels((X, Y) => provT(X, Y, at) === 4, ROWS / 2), lagoon = texels((X, Y) => provT(X, Y, at) === 5, ROWS / 2);
    const lit = (img, set) => set.filter((i) => img[i * 4 + 3] >= 100).length;
    // …and one raised as a city on its all-sea map, the size the layer below's are (its one city: 192), counted on the map those
    // colours were learnt over — the layer below's, whatever its size
    const c2 = makeMod(game, "owb-city-after", { at, rows: ROWS });
    md.blankMapToSea(G(c2));
    const rc2 = md.setProvinceDefinition({ ...G(c2), provinceId: 2, type: "land", terrain: "urban", coastal: true, continent: 1 });
    const n2 = lit(readTex(c2, NAMES.colormap).img, coast);
    ok(rc2 && rc2.changed && rc2.heightmap && rc2.heightmap.textures && rc2.heightmap.textures.changed && Math.abs(n2 - 192) <= 10,
      `⭐ a city raised on its all-sea map lights one core of ${n2} texels of its ${coast.length}: the size of the layer below's cities (192)`, rc2 && (rc2.error || (rc2.heightmap && rc2.heightmap.textures)));
    ok(city.length === 192 && lit(readTex(c, NAMES.colormap).img, city) === 192 && lit(readTex(c, NAMES.colormap).img, lagoon) === 0, "CONTROL: its one city lights all its 192 texels, and its lagoon none");
    const rc = md.setProvinceDefinition({ ...G(c), provinceId: 5, type: "land", terrain: "urban", coastal: false, continent: 1 });
    const n = lit(readTex(c, NAMES.colormap).img, lagoon);
    ok(rc && rc.changed && rc.heightmap && rc.heightmap.textures && rc.heightmap.textures.changed && Math.abs(n - 192) <= 10,
      `⭐ the lagoon raised as a city lights one core of ${n} texels of its ${lagoon.length}: the size of the mod's own cities (192), not half of it`, rc && (rc.error || (rc.heightmap && rc.heightmap.textures)));
  }

  console.log("\n-- ⭐ …and a land colour that changes with latitude is read there at the same FRACTION of the map's height, not the same row --");
  {
    // another game, whose land is wide enough to be learnt band by band (288 texels a band, over the 150 a bucket needs — the
    // game above has 144, and is read as one colour at every latitude) and greener by 3 a row. An Old World Blues-sized mod's
    // own pictures know no land after Delete map: what it raises is read from that game's pictures, and its row Y of 80 is the
    // game's row (Y + ½)·64/80 − ½. Read at the same row instead, the raised land came out 0.6 a row too green (review of
    // f6908c4: 80,924 colour-map texels of Old World Blues' new land moved, by up to 47, and every check here stayed green)
    const WIDE = (x, y) => (y < 16 || y >= 112 || x < 96 ? 1 : 3), wideLand = (Y) => [150, 40 + 3 * Y, 60];
    const g2 = makeGame({ at: WIDE, def: "0;0;0;0;land;false;unknown;0\n1;0;0;200;sea;false;ocean;0\n3;0;200;0;land;true;plains;1\n", landAt: wideLand });
    const ROWS = PH + 32, at = (x, y) => (y < PH && x >= 96 && y >= 16 && y < 112 ? 2 : 1);
    const m = makeMod(g2, "latitude-land", { at, rows: ROWS, def: "0;0;0;0;land;false;unknown;0\n1;0;0;200;sea;false;ocean;0\n2;200;0;0;land;true;plains;1\n" });
    const G2 = { modRoot: m, gameRoot: g2, dependencyRoots: [] };
    const b = md.blankMapToSea(G2), r = raise2(G2);
    ok(!!(b && b.heightmap && b.heightmap.textures && b.heightmap.textures.changed && r && r.heightmap && r.heightmap.textures && r.heightmap.textures.changed),
      "Delete map, then the land raised again on its all-sea map, repainted the pictures", r && (r.error || (r.heightmap && r.heightmap.textures)));
    // rows 18–46: more than the blur's reach (9) inside the raised land, which spans rows 8–55; columns 60–183, past its coast
    const cm = readTex(m, NAMES.colormap).img, frac = (Y) => (Y + 0.5) * TH / (ROWS / 2) - 0.5, rowsOff = [], near = [];
    for (let Y = 18; Y <= 46; Y++) {
      const a = avg(cm, texels((X, YY) => YY === Y && X >= 60 && X < 184, ROWS / 2));
      if (dist(a, wideLand(frac(Y))) > 6) rowsOff.push([Y, fmt(a), fmt(wideLand(frac(Y))), fmt(wideLand(Y))]);
      if (dist(wideLand(Y), wideLand(frac(Y))) < 10) near.push(Y);
    }
    ok(!near.length, "CONTROL: on every row checked, the game's land at the same row is 10 and more from its land at the same fraction", near);
    ok(!rowsOff.length, `⭐ each of the 29 rows of the raised land is the game's land at the same latitude FRACTION (green ${fmt(wideLand(frac(18)))} on row 18 to ${fmt(wideLand(frac(46)))} on row 46), not at the same row`, rowsOff.slice(0, 5));
  }

  console.log("\n-- ⭐ a picture of another size whose two kinds are both its own keeps both, its sea the game's paper drawn again (Old World Blues') --");
  {
    // Old World Blues' colour-map sea is the base game's paper: 80,103,142 over its map, vanilla's 79.1,102,141.3. Judged against
    // the layer below's pictures of another size, it is that paper and is painted with the layer below's colours — so an erase
    // on it repainted in those where every erase before had painted its own (review of f6908c4: 5,326 texels of its colour map
    // and 6,057 of its fog moved in three erases). The layer of another size is read only for a kind nothing else can paint.
    const ROWS = PH + 32, at = (x, y) => (y < PH ? provAt(x, y) : 1);
    const SEA_OFF = [SEA_RGB[0] + 12, SEA_RGB[1], SEA_RGB[2] - 12];
    const m = makeMod(game, "owb-paper-sea", { at, rows: ROWS, pics: { ...modPics(at), colormap: (X, Y) => { const p = provT(X, Y, at);
      return isWater(p) ? [SEA_OFF[0] + jit(X, Y, 1), SEA_OFF[1], SEA_OFF[2], 0] : isCity(p) ? [60, 60, 200, 173] : [MOD_CM_LAND[0] + jit(X, Y, 7), MOD_CM_LAND[1], MOD_CM_LAND[2], 0]; } } });
    const cm0 = readTex(m, NAMES.colormap).img, g = agreeSep(cm0, at, ROWS / 2);
    const ownSea = avg(cm0, texels((X, Y) => isWater(provT(X, Y, at)), ROWS / 2)), gameSea = avg(readTex(game, NAMES.colormap).img, texels((X, Y) => isWater(provT(X, Y))));
    ok(g.agree >= 0.6 && g.sep >= 30 && dist(ownSea, gameSea) >= 12 && dist(ownSea, gameSea) < 20,
      `CONTROL: both its kinds pass the two-kind guard (agree ${g.agree.toFixed(3)}, ${g.sep.toFixed(0)} apart), and its sea ${fmt(ownSea)} lies ${dist(ownSea, gameSea).toFixed(1)} from the game's ${fmt(gameSea)}: within the 20 that makes a kind the layer below's paper`, g);
    const r = md.flipProvinceToSea({ ...G(m), provinceId: 2 });
    const cm = readTex(m, NAMES.colormap).img, drowned = texels((X, Y) => provT(X, Y, at) === 2, ROWS / 2);
    const off = drowned.filter((i) => dist(px(cm, i), ownSea) > 6 || dist(px(cm, i), ownSea) >= dist(px(cm, i), gameSea));
    ok(!!(r && r.changed) && drowned.length === 768 && !off.length,
      `⭐ the ${drowned.length} texels an erase drowned carry its own drawing of the sea (${fmt(ownSea)}), not the layer below's (${fmt(gameSea)})`, { off: off.length, got: fmt(avg(cm, off.slice(0, 50))) });
  }

  console.log("\n-- ⭐ a mod whose terrain table numbers its ground otherwise than the layer below's (Old World Blues') is painted by what each index MEANS --");
  {
    // its own common/terrain says plains is index 13 and urban index 0: the game's urban and plains the other way round, as Old
    // World Blues' urban is 19 where vanilla's 19 is plains. The layer below's pictures were learnt with the MOD's table and asked
    // by index number, so its new plains came out in the game's city ground, and a city raised on it lit nothing — the game's
    // plains counted as its cities (review of f6908c4: on Old World Blues new forest in vanilla's desert, 0 of 759 new city
    // texels lit). #a-layer-below-is-read-by-its-own-terrain-table, at the layer below's size and at Old World Blues' own.
    const PERM = { plains: IDX.urban, urban: IDX.plains, ocean: IDX.ocean };
    const lit = (img, set) => set.filter((i) => img[i * 4 + 3] >= 100).length;
    const tableOf = (root) => md.graphicalTerrainIndices({ modRoot: root, gameRoot: game, dependencyRoots: [] });
    for (const [what, rows] of [["at the layer below's size", PH], ["at another size (Old World Blues')", PH + 32]]) {
      const at = (x, y) => (y < PH ? provAt(x, y) : 1);
      const mk = (tag) => {
        const m = makeMod(game, tag, rows === PH ? {} : { at, rows });
        write(m, "common/terrain/00_terrain.txt", terrainTable(PERM));
        write(m, "map/terrain.bmp", bmp8(PW, rows, (x, y) => { const p = at(x, y); return isWater(p) ? PERM.ocean : isCity(p) ? PERM.urban : PERM.plains; }));
        return m;
      };
      const m = mk("perm-plains"), c = mk("perm-city"), mine = tableOf(m), below = tableOf(game);
      ok(String(mine.get("plains")) === String(below.get("urban")) && String(mine.get("urban")) === String(below.get("plains")) && String(mine.get("plains")) !== String(below.get("plains")),
        `CONTROL ${what}: its table's plains is the game's urban index, and its urban the game's plains`, { mine: [...mine], below: [...below] });
      const coast = texels((X, Y) => provT(X, Y, at) === 2, rows / 2), mid = coast.filter((i) => { const X = i % TW; return X >= 124 && X < 132; });
      md.blankMapToSea(G(m));
      const r = raise2(G(m)), a = avg(readTex(m, NAMES.colormap).img, mid);
      ok(!!(r && r.heightmap && r.heightmap.textures && r.heightmap.textures.changed) && dist(a, LAND_RGB) <= 12,
        `⭐ ${what}: plains raised after Delete map is the layer below's plains (${fmt(LAND_RGB)}): ${fmt(a)} — not its city ground (${fmt(URBAN_RGB)}), what the mod's plains index means below`, { got: fmt(a), tx: r && r.heightmap && r.heightmap.textures });
      md.blankMapToSea(G(c));
      const rc = md.setProvinceDefinition({ ...G(c), provinceId: 2, type: "land", terrain: "urban", coastal: true, continent: 1 });
      const n = lit(readTex(c, NAMES.colormap).img, coast);
      ok(!!(rc && rc.heightmap && rc.heightmap.textures && rc.heightmap.textures.changed) && Math.abs(n - 192) <= 10,
        `⭐ ${what}: a city raised after Delete map lights one core of ${n} texels of its ${coast.length}: the size of the layer below's cities (192), counted on the ground the layer below's own table calls urban`, rc && (rc.error || (rc.heightmap && rc.heightmap.textures)));
    }
    // …and the table that loads with a layer is its own and the ones BELOW it, never one above it: a mod built on a dependency that
    // renumbers the terrain (as a mod built on Old World Blues inherits Old World Blues' table) numbers its map by the dependency's
    // table, and the game's pictures under both are still learnt with the game's
    {
      const dep = tmp("perm-dep");
      write(dep, "descriptor.mod", 'version="1.0"\nname="renumbering dependency"\n');
      write(dep, "common/terrain/00_terrain.txt", terrainTable(PERM));
      const m = makeMod(game, "perm-dep-plains"), GD = { modRoot: m, gameRoot: game, dependencyRoots: [dep] };
      write(m, "map/terrain.bmp", bmp8(PW, PH, (x, y) => { const p = provAt(x, y); return isWater(p) ? PERM.ocean : isCity(p) ? PERM.urban : PERM.plains; }));
      const mine = md.graphicalTerrainIndices(GD);
      ok(!fs.existsSync(path.join(m, "common", "terrain")) && String(mine.get("plains")) === String(tableOf(game).get("urban")),
        "CONTROL with a dependency: the mod ships no terrain table, and the one that loads for it is the dependency's, whose plains is the game's urban index", { mine: [...mine] });
      const mid = texels((X, Y) => provT(X, Y) === 2 && X >= 124 && X < 132);
      md.blankMapToSea(GD);
      const r = raise2(GD), a = avg(readTex(m, NAMES.colormap).img, mid);
      ok(!!(r && r.heightmap && r.heightmap.textures && r.heightmap.textures.changed) && dist(a, LAND_RGB) <= 12,
        `⭐ with the renumbering table a dependency's: plains raised after Delete map is the game's plains (${fmt(LAND_RGB)}): ${fmt(a)} — not its city ground (${fmt(URBAN_RGB)})`, { got: fmt(a), tx: r && r.heightmap && r.heightmap.textures });
    }
  }

  console.log("\n-- ⭐ a city raised on a restyled mod lights a core the size of ITS OWN cities, counted on its own map --");
  {
    // the mod's map splits the game's one city of 192 texels in two of 96. Its lit texels are counted over its own map, so
    // its cities are counted there too: counted on the map below there is one, and a new core comes out twice their size
    const at = (x, y) => { const p = provAt(x, y); return p === 4 && x >= 352 ? 8 : p; };
    const m = makeMod(game, "two-cities", { at, def: DEF + "8;100;0;100;land;true;urban;1\n" });
    const cities = [4, 8].map((q) => texels((X, Y) => provT(X, Y, at) === q)), lagoon = texels((X, Y) => provT(X, Y, at) === 5);
    const lit = (img, set) => set.filter((i) => img[i * 4 + 3] >= 100).length, cm0 = readTex(m, NAMES.colormap).img;
    ok(cities.every((c) => c.length === 96 && lit(cm0, c) === 96), "CONTROL: its two cities light 96 texels each, where the game's one city lights 192");
    const rc = md.setProvinceDefinition({ ...G(m), provinceId: 5, type: "land", terrain: "urban", coastal: false, continent: 1 });
    const n = lit(readTex(m, NAMES.colormap).img, lagoon);
    ok(rc && rc.changed && Math.abs(n - 96) <= 10, `⭐ the lagoon raised as a city lights one core of ${n} texels: the size of the mod's own cities (96), not the base game's (192) nor a share counted with itself (64)`,
      rc && (rc.error || (rc.heightmap && rc.heightmap.textures)));
  }

  console.log("\n-- ⭐ Delete map, then land raised on the empty sea: the ocean keeps the mod's own tint --");
  {
    const m = makeMod(game, "delete-raise");
    md.blankMapToSea(G(m));
    const w1 = readTex(m, NAMES.water0).img;
    const r = raise2(G(m));
    ok(r && r.changed && r.heightmap && r.heightmap.textures && r.heightmap.textures.changed, "the coast was raised on the empty sea and the pictures repainted", r && (r.error || (r.heightmap && r.heightmap.textures)));
    const w = readTex(m, NAMES.water0).img;
    const ocean = texels((X, Y) => provT(X, Y) !== 2);
    const near = ocean.filter((i) => { const X = i % TW; return X >= 104 && X < 120; });
    ok(near.length > 500, `CONTROL: ${near.length} texels of ocean lie within 16 of the raised coast — their distance from land went from none to a few texels`, near.length);
    const off = ocean.filter((i) => dist(px(w, i), MOD_WATER) > 12);
    ok(!off.length, `⭐ every one of the ${ocean.length} texels of ocean the raise left carries the mod's own tint — its sea is all its map has, and its own`, { off: off.length, got: fmt(avg(w, off.slice(0, 50))), was: fmt(avg(w1, off.slice(0, 50))) });
    // ⭐ EACH KIND FROM WHERE IT WAS LEARNT. Its pictures have sea and no land now: the sea is theirs, the land the layer below's —
    // in one picture. The water tint over the raised land is the layer below's at each latitude, not the mod's palette asked
    // for a kind it has none of (which answered the 60,70,60 typed in for that); the fog of the sea beside it is the mod's own,
    // not the layer below's palette asked for both kinds (review of fc219c6: neither was read, and both could go either way)
    // (its first and last rows read half a band past the latitudes the layer below has land at, so they are left out)
    const coast = texels((X, Y) => provT(X, Y) === 2 && Y > 8 && Y < 55), wl = coast.filter((i) => dist(px(w, i), gameWaterLand((i / TW) | 0)) > 10);
    ok(coast.length === 736 && !wl.length, `⭐ …the water tint over each of the ${coast.length} raised texels is the layer below's over land at its latitude, not ${fmt(TYPED_WATER_LAND)}`,
      { off: wl.length, got: wl.slice(0, 5).map((i) => [(i / TW) | 0, fmt(px(w, i)), fmt(gameWaterLand((i / TW) | 0))]) });
    const fw = readTex(m, NAMES.fow).img, fOff = near.filter((i) => Math.abs(fw[i * 4 + 1] - 50) > 6);
    ok(!fOff.length, `⭐ …and the fog of the ${near.length} texels of sea beside it is the mod's own (50 grey), not the layer below's (90)`, { off: fOff.length, got: fOff.slice(0, 5).map((i) => fw[i * 4 + 1]) });
  }

  console.log("\n-- ⭐ a water tint that changes with latitude (Rise of Nations') keeps it through Delete map and a raise --");
  {
    // darker to the north, bluer to the south, on every texel: its sea strays further from its mean than it lies from the game's
    const LAT = (Y) => [20, 41, 30 + (200 * Y) / TH];
    const m = makeMod(game, "latitude", { pics: { ...modPics(provAt), water: (X, Y) => [LAT(Y)[0] + jit(X, Y, 8), LAT(Y)[1], LAT(Y)[2], 255] }, only: ["water"] });
    const w00 = readTex(m, NAMES.water0).img, g0 = readTex(game, NAMES.water0).img, all = texels(() => true), seaT = texels((X, Y) => isWater(provT(X, Y)));
    const mean = avg(w00, all), sd = Math.sqrt(all.reduce((q, i) => q + dist(px(w00, i), mean) ** 2, 0) / all.length), gm = avg(g0, seaT);
    ok(2 * sd >= dist(mean, gm), `CONTROL: its tint strays ${sd.toFixed(1)} from its mean ${fmt(mean)}, which lies ${dist(mean, gm).toFixed(1)} from the game's sea (${fmt(gm)}) — as spread as the one-kind bound refuses`, { sd, mean: fmt(mean), gm: fmt(gm) });
    md.blankMapToSea(G(m));
    const w1 = readTex(m, NAMES.water0).img;
    const offD = landTexels.filter((i) => dist(px(w1, i), LAT((i / TW) | 0)) > 12);
    ok(!offD.length, `⭐ Delete map paints each of the ${landTexels.length} drowned texels in the mod's own tint for its latitude`, { off: offD.length, got: offD.slice(0, 5).map((i) => [(i / TW) | 0, fmt(px(w1, i))]) });
    const r = raise2(G(m));
    ok(r && r.changed && r.heightmap && r.heightmap.textures && r.heightmap.textures.changed, "the coast was raised on the empty sea and the pictures repainted", r && (r.error || (r.heightmap && r.heightmap.textures)));
    const w = readTex(m, NAMES.water0).img, far = texels((X) => X < 100), a = avg(w, far), was = avg(w1, far);
    ok(dist(a, was) <= 12, `⭐ the ocean the raise left, 20 and more texels from the new coast, is still the mod's own tint: ${fmt(a)} against its ${fmt(was)}, not the game's ${fmt(gm)}`, { got: fmt(a), was: fmt(was) });
    const offR = far.filter((i) => dist(px(w, i), px(w1, i)) > 12);
    ok(!offR.length, `⭐ …and each of its ${far.length} texels its own latitude's: a distance nothing stood at after Delete map is read from the nearest at the same latitude, not from all of them pooled`,
      { off: offR.length, got: offR.slice(0, 5).map((i) => [(i / TW) | 0, fmt(px(w, i)), fmt(px(w1, i))]) });
    // …and on a world all sea from the start, every picture its own and drawn for it, the tint far from the game's whatever the
    // latitude: no rule that judges the water can refuse it, no click came before, and what is left is the reading by latitude
    const LAT2 = (Y) => [200, 41, 30 + (200 * Y) / TH];
    const m2 = makeMod(game, "latitude-all-sea", { at: (x, y) => (provAt(x, y) === 2 ? 2 : 1), def: DEF.replace("2;200;0;0;land;true;plains;1", "2;200;0;0;sea;false;ocean;0"),
      pics: { ...modPics(() => 1), water: (X, Y) => [LAT2(Y)[0] + jit(X, Y, 8), LAT2(Y)[1], LAT2(Y)[2], 255] } });
    write(m2, "map/terrain.bmp", bmp8(PW, PH, () => IDX.ocean));
    write(m2, "map/heightmap.bmp", bmp8(PW, PH, () => 89));
    const v1 = readTex(m2, NAMES.water0).img;
    const r2 = raise2(G(m2));
    ok(r2 && r2.changed && r2.heightmap && r2.heightmap.textures && r2.heightmap.textures.changed, "CONTROL: land was raised on a world drawn all sea, and its pictures repainted", r2 && (r2.error || (r2.heightmap && r2.heightmap.textures)));
    const v = readTex(m2, NAMES.water0).img, offA = far.filter((i) => dist(px(v, i), px(v1, i)) > 12);
    ok(!offA.length, `⭐ …and on a world drawn all sea from the start, each of the ${far.length} texels round the land raised on it keeps its own latitude's tint`,
      { off: offA.length, got: offA.slice(0, 5).map((i) => [(i / TW) | 0, fmt(px(v, i)), fmt(px(v1, i))]) });
  }

  console.log("\n-- ⭐ the layer below's water tint re-saved (Millennium Dawn's) keeps the layer below's shallows on a coast raised after Delete map --");
  {
    // the game's own tint, decoded and saved again in another format: not a copy by its header, the same paper by its pixels
    const g0 = readTex(game, NAMES.water0).img;
    const m = makeMod(game, "same-paper-water", { pics: { ...modPics(provAt), water: (X, Y) => { const i = (Y * TW + X) * 4; return [g0[i], g0[i + 1], g0[i + 2], 255]; } }, only: ["water"] });
    const seaT = texels((X, Y) => isWater(provT(X, Y))), openMean = avg(g0, openSea), seaMean = avg(g0, seaT);
    ok(dist(seaMean, openMean) >= 25, `CONTROL: the game's shallows lift its sea's plain mean ${dist(seaMean, openMean).toFixed(1)} off its open sea (${fmt(seaMean)} against ${fmt(openMean)}) — after Delete map a plain mean would read the drowned world as another paper`, { seaMean: fmt(seaMean), openMean: fmt(openMean) });
    md.blankMapToSea(G(m));
    const w1 = readTex(m, NAMES.water0).img;
    const offD = landTexels.filter((i) => dist(px(w1, i), openMean) > 12);
    ok(!offD.length, "CONTROL: Delete map painted its drowned world in the game's open-sea tint (the layer below's, its own being the same paper)", { off: offD.length, got: fmt(avg(w1, offD.slice(0, 50))) });
    const r = raise2(G(m));
    ok(r && r.changed && r.heightmap && r.heightmap.textures && r.heightmap.textures.changed, "the coast was raised on the empty sea and the pictures repainted", r && (r.error || (r.heightmap && r.heightmap.textures)));
    const w = readTex(m, NAMES.water0).img;
    const near = texels((X, Y) => (X === 118 || X === 119) && Y >= 12 && Y < 52), far = texels((X) => X < 60);
    const lift = avg(w, near)[2] - avg(w, far)[2];
    ok(lift >= 40, `⭐ the water beside the raised coast is the game's shallows, ${lift.toFixed(0)} bluer than the open sea — not open sea all the way to the shore, which is all a tint learnt from a drowned world knows`, { near: fmt(avg(w, near)), far: fmt(avg(w, far)) });
  }

  console.log("\n-- ⭐ a mod that restyles only its water tint keeps it, whatever its colour map is --");
  {
    // the colour map and the fog map are the game's own copies (a picture below's: learnt below); the water tint is its own
    const m = makeMod(game, "water-only", { only: ["water"] });
    const b = md.blankMapToSea(G(m));
    ok(b && b.heightmap && b.heightmap.textures && b.heightmap.textures.changed, "Delete map ran and repainted", b && (b.error || (b.heightmap && b.heightmap.textures)));
    const cm = readTex(m, NAMES.colormap).img, w = readTex(m, NAMES.water0).img;
    ok(landTexels.every((i) => dist(px(cm, i), SEA_RGB) <= 12), "CONTROL: its colour map, a copy of the game's, is painted in the game's sea");
    const off = landTexels.filter((i) => dist(px(w, i), MOD_WATER) > 20);
    ok(!off.length, `⭐ …and its own water tint keeps its own colour on all ${landTexels.length} drowned texels: the water is judged by itself, not by the colour map's verdict`, { off: off.length, got: fmt(avg(w, off.slice(0, 50))) });
  }

  console.log("\n-- ⭐ a colour map whose land is its own and whose sea is the game's paper (Hearts of Minecraft's): each kind from where it belongs --");
  {
    // its sea the game's drawn again a shade off — 12 redder and 12 less blue, 17 apart, within the 20 that makes a kind the
    // layer below's paper — and its land restyled: Hearts of Minecraft's colour map, whose sea east of column 1024 is vanilla's
    const SEA_OFF = [SEA_RGB[0] + 12, SEA_RGB[1], SEA_RGB[2] - 12];
    const m = makeMod(game, "mixed-kinds", { only: ["colormap"], pics: { ...modPics(provAt), colormap: (X, Y) => { const p = provT(X, Y);
      return isWater(p) ? [SEA_OFF[0] + jit(X, Y, 1), SEA_OFF[1], SEA_OFF[2], 0] : isCity(p) ? [60, 60, 200, 173] : [MOD_CM_LAND[0] + jit(X, Y, 7), MOD_CM_LAND[1], MOD_CM_LAND[2], 0]; } } });
    const g = agreeSep(readTex(m, NAMES.colormap).img, provAt), gameSea = avg(readTex(game, NAMES.colormap).img, texels((X, Y) => isWater(provT(X, Y)))), ownSea = g.sea.split(",").map(Number);
    ok(g.agree >= 0.6 && g.sep >= 30 && dist(ownSea, gameSea) >= 12 && dist(ownSea, gameSea) < 20 && dist(g.land.split(",").map(Number), LAND_RGB) > 30,
      `CONTROL: both its kinds pass the two-kind guard (agree ${g.agree.toFixed(3)}, ${g.sep.toFixed(0)} apart), its sea ${fmt(ownSea)} lies ${dist(ownSea, gameSea).toFixed(1)} from the game's ${fmt(gameSea)} and its land far from the game's`, g);
    md.blankMapToSea(G(m));
    const cm = readTex(m, NAMES.colormap).img, off = landTexels.filter((i) => dist(px(cm, i), gameSea) > 6 || dist(px(cm, i), gameSea) >= dist(px(cm, i), ownSea));
    ok(!off.length, `⭐ all ${landTexels.length} drowned texels are the layer below's sea (${fmt(gameSea)}), its own paper — not its own drawing of it (${fmt(ownSea)}), learnt with the land it does own`,
      { off: off.length, got: fmt(avg(cm, off.slice(0, 50))) });
  }

  console.log("\n-- a kind with under 1% of the world's texels is not the mod's own: a handful of land after Delete map --");
  {
    // Delete map, then the islet raised: four texels of land, painted from the layer below's land (the mod's pictures had none)
    // and, all four of them coast, two-fifths its own sea. Then the coast raised: learnt from those four, its land would come out
    // in the islet's blend — the same colour everywhere, at every latitude, from four texels of 12,288
    const m = makeMod(game, "floor");
    md.blankMapToSea(G(m));
    const ri = md.setProvinceDefinition({ ...G(m), provinceId: 7, type: "land", terrain: "plains", coastal: true, continent: 1 });
    const islet = texels((X, Y) => provT(X, Y) === 7), isl = avg(readTex(m, NAMES.colormap).img, islet);
    const gameLand = avg(readTex(game, NAMES.colormap).img, landTexels.filter((i) => provT(i % TW, (i / TW) | 0) !== 4));
    ok(ri && ri.changed && islet.length === 4 && islet.length < TW * TH * 0.01 && dist(isl, gameLand) > 25,
      `CONTROL: the islet is ${islet.length} texels (under 1% of ${TW * TH}), painted ${fmt(isl)}, ${dist(isl, gameLand).toFixed(0)} from the layer below's land ${fmt(gameLand)}`, { isl: fmt(isl) });
    raise2(G(m));
    const mid = texels((X, Y) => X >= 124 && X < 132 && Y >= 12 && Y < 52), a = avg(readTex(m, NAMES.colormap).img, mid);
    ok(dist(a, gameLand) <= 12, `⭐ the middle of the coast raised after it is the layer below's land (${fmt(gameLand)}): ${fmt(a)}, not the ${fmt(isl)} of four islet texels`, { got: fmt(a) });
  }

  console.log("\n-- ⭐ a coast the stroke crossed is not learnt as either kind: the map before the write is RECOUNTED, purity and all --");
  {
    // the mod's own map: one-pixel stripes of land (9) on every fourth pixel column, x ≡ 1 mod 4, in a sea (10) that is then
    // raised. Every even texel there holds two pixels of each — a coast, not land: its picture draws it magenta, its line. Odd
    // texels are all sea, but one of their two columns stands at 106 already, so the raise crosses only half of each (a sea
    // province drawn with land heights: the recount can only guess at it). Both are crossed; taken as they are NOW (all land,
    // pure), 2,304 magenta coast texels and 2,304 of sea paint are learnt as the mod's land beside its 2,688 real ones
    const MAGENTA = [250, 0, 250];
    const at = (x, y) => (y < 16 || y >= 112 ? 1 : x >= 272 ? 3 : x >= 40 && x < 232 ? ((x & 3) === 1 ? 9 : 10) : 1);
    const def = DEF + "9;90;0;0;land;true;plains;1\n10;0;0;90;sea;false;ocean;0\n";
    const kinds = (X, Y) => new Set([at(2 * X, 2 * Y), at(2 * X + 1, 2 * Y), at(2 * X, 2 * Y + 1), at(2 * X + 1, 2 * Y + 1)].map((p) => (isWater(p) ? "sea" : "land")));
    const m = makeMod(game, "stripes", { at, def, only: ["colormap"], pics: { ...modPics(at), colormap: (X, Y) => (kinds(X, Y).size > 1 ? [...MAGENTA, 0] : modPics(at).colormap(X, Y)) } });
    write(m, "map/heightmap.bmp", bmp8(PW, PH, (x, y) => (at(x, y) === 10 && (x & 3) === 2 ? 106 : isWater(at(x, y)) ? 89 : 106)));
    const cm0 = readTex(m, NAMES.colormap).img, coastT = texels((X, Y) => kinds(X, Y).size > 1), land0 = texels((X, Y) => at(2 * X, 2 * Y) === 3);
    ok(coastT.length === 2304 && coastT.every((i) => dist(px(cm0, i), MAGENTA) < 12) && land0.length === 2688,
      `CONTROL: its picture draws the ${coastT.length} texels of coast between the stripes magenta, beside ${land0.length} texels of its own land`, { coast: coastT.length, land: land0.length });
    const r = md.setProvinceDefinition({ ...G(m), provinceId: 10, type: "land", terrain: "plains", coastal: true, continent: 1 });
    ok(r && r.changed && r.heightmap && r.heightmap.textures && r.heightmap.textures.changed, "the sea between the stripes was raised and the pictures repainted", r && (r.error || (r.heightmap && r.heightmap.textures)));
    // the middle of it, 4 and more texels from any water left: the land colour learnt, as painted
    const mid = texels((X, Y) => X >= 40 && X < 96 && Y >= 16 && Y < 48), a = avg(readTex(m, NAMES.colormap).img, mid);
    ok(dist(a, MOD_CM_LAND) <= 15, `⭐ the middle of the raised sea is the mod's own land (${fmt(MOD_CM_LAND)}): ${fmt(a)} — not its land learnt with the coast and the half-crossed sea counted in`, { got: fmt(a) });
  }

  console.log("\n-- ⭐ full-size _1 and _2 water tints follow _0 --");
  {
    const m = makeMod(game, "water12");
    const before = hashes(m);
    ok(before[NAMES.water1] === before[NAMES.water0] && before[NAMES.water2] === before[NAMES.water0], "CONTROL: its _1 and _2 are byte-identical full-size copies of _0, as Hearts of Minecraft's are");
    const r = md.flipProvinceToSea({ ...G(m), provinceId: 2 });
    const after = hashes(m);
    ok(r && r.changed && after[NAMES.water0] !== before[NAMES.water0], "the erase repainted the water tint", r && (r.error || (r.heightmap && r.heightmap.textures)));
    ok(after[NAMES.water1] === after[NAMES.water0] && after[NAMES.water2] === after[NAMES.water0], "⭐ …and _1 and _2 are still _0 texel for texel, not the old coast left standing in them", after);
  }

  console.log("\n-- ⭐ the same clicks give the same bytes whether or not Nova was restarted between them --");
  {
    // the second click in a FRESH Nova (a child process): nothing a session remembers may change what it paints
    const inChild = (m, call) => {
      const src = `const md = require(${JSON.stringify(path.join(__dirname, "map-data.js"))});`
        + `const r = md.${call}(${JSON.stringify({ ...G(m), provinceId: 2, type: "land", terrain: "plains", coastal: true, continent: 1 })});`
        + "process.stdout.write(JSON.stringify({ changed: !!r.changed, error: r.error || null }));";
      const c = spawnSync(process.execPath, ["-e", src], { encoding: "utf8", env: process.env, timeout: 300000 });
      try { return JSON.parse(c.stdout); } catch (_) { return { error: (c.stderr || c.stdout || "").slice(-300) }; }
    };
    // its water tint has shallows of its own, so what it is learnt from after the first click (a drowned world has none) is
    // not what it was learnt from before it: a palette kept from the first click would paint the second otherwise
    const ramped = { ...modPics(provAt), water: (X, Y) => (isWater(provT(X, Y)) ? [MOD_WATER[0] + jit(X, Y, 8) + shallow(X, Y, 0), MOD_WATER[1] + shallow(X, Y, 1), MOD_WATER[2] - shallow(X, Y, 2), 255] : [...MOD_WATER, 255]) };
    for (const [what, first, second] of [
      ["Delete map, then the coast raised", (m) => md.blankMapToSea(G(m)), "setProvinceDefinition"],
      ["the islet erased, then the coast", (m) => md.flipProvinceToSea({ ...G(m), provinceId: 7 }), "flipProvinceToSea"],
    ]) {
      const A = makeMod(game, "same-a", { pics: ramped }), B = makeMod(game, "same-b", { pics: ramped });
      first(A); first(B);
      const mid = hashes(A);
      ok(JSON.stringify(mid) === JSON.stringify(hashes(B)), `${what}: CONTROL — the first click gives both copies the same bytes`);
      const ra = second === "setProvinceDefinition" ? raise2(G(A)) : md.flipProvinceToSea({ ...G(A), provinceId: 2 });
      const rb = inChild(B, second);
      const a = hashes(A), bh = hashes(B);
      ok(ra && ra.changed && rb && rb.changed && a[NAMES.colormap] !== mid[NAMES.colormap], `${what}: CONTROL — the second click, in this Nova and in a fresh one, repainted the pictures`, { ra: ra && (ra.error || ra.changed), rb });
      const differ = Object.keys(a).filter((n) => a[n] !== bh[n]);
      ok(!differ.length, `⭐ ${what}: every picture is byte for byte the same with and without a restart between the two clicks`, differ);
    }
  }

  console.log("\n-- a water tint repainted outside Nova between two clicks is learnt again --");
  {
    const GREEN = [60, 200, 60];
    const m = makeMod(game, "outside");
    md.flipProvinceToSea({ ...G(m), provinceId: 2 });
    // the modder repaints the tint in another program: all three files, as the mod ships them
    const w = makeDds(TW, TH, "RGB32", 1, (x, y) => [GREEN[0] + jit(x, y, 8), GREEN[1], GREEN[2], 255]);
    for (const n of [NAMES.water0, NAMES.water1, NAMES.water2]) write(m, "map/terrain/" + n, w);
    const r = md.flipProvinceToSea({ ...G(m), provinceId: 7 });
    const islet = texels((X, Y) => provT(X, Y) === 7), now = readTex(m, NAMES.water0).img;
    ok(r && r.changed && islet.length === 4, "the islet was erased", r && (r.error || (r.heightmap && r.heightmap.textures)));
    ok(islet.every((i) => dist(px(now, i), GREEN) <= 20), `⭐ its ${islet.length} texels take the tint the picture has NOW (${fmt(GREEN)}), not the one it had at the first click`, islet.map((i) => fmt(px(now, i))));
  }

  console.log("\n-- a colour map drawn for ANOTHER map is not learnt from: the layer below's sea --");
  {
    // the restyle drawn for this map mirrored east–west: its land lies where this map has sea
    const mirror = (x, y) => provAt(PW - 1 - x, y);
    const m = makeMod(game, "mirror", { pics: { ...modPics(provAt), colormap: modPics(mirror).colormap } });
    const g = agreeSep(readTex(m, NAMES.colormap).img, provAt);
    ok(g.agree < 0.6 && g.sep >= 30, `CONTROL: over this map it agrees ${g.agree.toFixed(3)} (under 0.6) at ${g.sep.toFixed(0)} apart (30 or more) — only its agreement refuses it`, g);
    md.flipProvinceToSea({ ...G(m), provinceId: 2 });
    const cm = readTex(m, NAMES.colormap).img, drowned = texels((X, Y) => provT(X, Y) === 2);
    const off = drowned.filter((i) => dist(px(cm, i), SEA_RGB) > 12);
    ok(!off.length, `⭐ the ${drowned.length} drowned texels are the layer below's sea (${fmt(SEA_RGB)}), not a blend of a picture that disagrees with its map`, { off: off.length, got: fmt(avg(cm, off.slice(0, 50))) });
  }

  console.log("\n-- …nor one drawn for far less land than its map has: the layer below's land --");
  {
    // drawn with land on the city alone: the coast, inland and islet were raised after it and it was never repainted — its
    // land's mean is most of the way to its sea, and nearly every texel of it agrees
    const m = makeMod(game, "less-land", { pics: { ...modPics(provAt), colormap: modPics((x, y) => (provAt(x, y) === 4 ? 4 : 1)).colormap } });
    const g = agreeSep(readTex(m, NAMES.colormap).img, provAt);
    ok(g.agree >= 0.6 && g.sep < 30, `CONTROL: it agrees ${g.agree.toFixed(3)} (0.6 or more) at ${g.sep.toFixed(1)} apart (under 30) — only the distance between its means refuses it`, g);
    md.setProvinceDefinition({ ...G(m), provinceId: 5, type: "land", terrain: "plains", coastal: false, continent: 1 });
    // the lagoon's middle, past the seam that fades new paint into the kept land round it
    const mid = texels((X, Y) => X >= 158 && X < 170 && Y >= 20 && Y < 28), cm = readTex(m, NAMES.colormap).img, a = avg(cm, mid);
    ok(provT(164, 24) === 5 && dist(a, LAND_RGB) < 25, `⭐ the middle of the raised lagoon is the layer below's land (${fmt(LAND_RGB)}): ${fmt(a)}, not the ${g.land} a land drawn mostly as sea averages to`, { got: fmt(a) });
  }

  console.log("\n-- …nor a picture of continents over a map all sea --");
  {
    // Delete map, then the game's own colour map put back re-encoded (so not a copy of it): drawn for continents, over a map
    // that has none. One kind of texel, whose mean is a blend and whose spread says so
    const m = makeMod(game, "paper-over-sea");
    md.blankMapToSea(G(m));
    const gp = gamePics(provAt);
    write(m, "map/terrain/" + NAMES.colormap, makeDds(TW, TH, "DXT5", 0, (x, y, l) => gp.colormap(x << l, y << l)));
    const cm0 = readTex(m, NAMES.colormap).img, all = texels(() => true), mean = avg(cm0, all);
    const sd = Math.sqrt(all.reduce((q, i) => q + dist(px(cm0, i), mean) ** 2, 0) / all.length);
    ok(2 * sd >= dist(mean, SEA_RGB), `CONTROL: its one kind strays ${sd.toFixed(1)} from its mean ${fmt(mean)}, which lies ${dist(mean, SEA_RGB).toFixed(1)} from the layer below's sea — a blend could hide there`, { sd, mean: fmt(mean) });
    raise2(G(m));
    const cm = readTex(m, NAMES.colormap).img, beside = texels((X, Y) => X >= 112 && X < 120 && Y >= 12 && Y < 52);
    const off = beside.filter((i) => dist(px(cm, i), SEA_RGB) > 12);
    ok(!off.length, `⭐ the ${beside.length} texels of sea beside the raised coast are the layer below's sea, not the ${fmt(mean)} that picture averages to`, { off: off.length, got: fmt(avg(cm, off.slice(0, 50))) });
  }

  console.log("\n-- a picture with the base game's header byte for byte is painted as the base game's (every Nova world) --");
  {
    // restyled pixels under the game's exact headers, in all five: what every picture Nova materialises is, once Nova has
    // painted in it — learnt from itself, a Nova world's detail would shrink at every click
    const m = makeMod(game, "same-header");
    const p = modPics(provAt);
    write(m, "map/terrain/" + NAMES.colormap, makeDds(TW, TH, "RGB32", 1, (x, y) => p.colormap(x, y)));
    write(m, "map/terrain/" + NAMES.water0, makeDds(TW, TH, "DXT5", 1, (x, y) => p.water(x, y)));
    write(m, "map/terrain/" + NAMES.water1, makeDds(TW / 2, TH / 2, "DXT5", 1, (x, y) => p.water(2 * x, 2 * y)));
    write(m, "map/terrain/" + NAMES.water2, makeDds(TW / 4, TH / 4, "DXT5", 1, (x, y) => p.water(4 * x, 4 * y)));
    write(m, "map/terrain/" + NAMES.fow, makeDds(TW, TH, "DXT5", 7, (x, y, l) => p.fow(x << l, y << l)));
    const same = Object.values(NAMES).filter((n) => { const a = fs.readFileSync(path.join(m, "map", "terrain", n)), b = fs.readFileSync(path.join(game, "map", "terrain", n)); return a.length === b.length && Buffer.compare(a.subarray(0, 128), b.subarray(0, 128)) === 0; });
    const cm0 = readTex(m, NAMES.colormap).img, plains = landTexels.filter((i) => provT(i % TW, (i / TW) | 0) !== 4);
    ok(same.length === 5 && plains.length > 2000 && plains.every((i) => dist(px(cm0, i), MOD_CM_LAND) < 10),
      "CONTROL: all five of its pictures have the game's header and size byte for byte, and the restyle's pixels", same);
    md.flipProvinceToSea({ ...G(m), provinceId: 2 });
    const cm = readTex(m, NAMES.colormap).img, w = readTex(m, NAMES.water0).img, fw = readTex(m, NAMES.fow).img, drowned = texels((X, Y) => provT(X, Y) === 2);
    const off = drowned.filter((i) => dist(px(cm, i), SEA_RGB) > 12);
    ok(!off.length, `⭐ the ${drowned.length} drowned texels are the layer below's sea (${fmt(SEA_RGB)})`, { off: off.length, got: fmt(avg(cm, off.slice(0, 50))) });
    const wOff = drowned.filter((i) => dist(px(w, i), MOD_WATER) < 60);
    ok(!wOff.length, `⭐ …and the layer below's water tint, not the restyle's ${fmt(MOD_WATER)}`, { off: wOff.length, got: fmt(avg(w, wOff.slice(0, 50))) });
    const fOff = drowned.filter((i) => Math.abs(fw[i * 4 + 1] - 90) > 6);
    ok(!fOff.length, "⭐ …and the layer below's sea fog (90 grey), not the restyle's (50)", { off: fOff.length, got: fOff.slice(0, 5).map((i) => fw[i * 4 + 1]) });
  }

  console.log("\n-- ⭐ a distance nothing on the map stands at is read from the nearest one, not from vanilla's sea --");
  {
    // the mod's own map: the continent reaches to x 64, so no sea texel lies more than 32 from land — and after Delete map
    // every drowned texel stands 40 and more from it, where this picture has nothing
    const at = (x, y) => (y < 16 || y >= 112 || x < 64 ? 1 : x < 96 ? 2 : 3);
    const land = texels((X, Y) => !isWater(provT(X, Y, at)));
    let far = 0; for (let Y = 0; Y < TH; Y++) for (let X = 0; X < TW; X++) if (isWater(provT(X, Y, at))) far = Math.max(far, Math.min(...land.map((j) => Math.max(Math.abs((j % TW) - X), Math.abs(((j / TW) | 0) - Y)))));
    ok(far < 40, `CONTROL: no sea texel of its map lies 40 from land (the farthest ${far})`, far);
    const m = makeMod(game, "narrow", { at });
    const b = md.blankMapToSea(G(m));
    ok(b && b.heightmap && b.heightmap.textures && b.heightmap.textures.changed, "Delete map ran and repainted", b && (b.error || (b.heightmap && b.heightmap.textures)));
    const cm = readTex(m, NAMES.colormap).img;
    const off = land.filter((i) => dist(px(cm, i), MOD_CM_SEA) > 30);
    ok(!off.length, `⭐ all ${land.length} drowned texels carry the mod's own sea, its farthest out, not the ${fmt(TYPED_SEA)} of vanilla's once typed in for a distance with nothing at it`, { off: off.length, got: fmt(avg(cm, off.slice(0, 50))) });
    // …nor that colour itself, whatever else a write may fall back to (the layer below's sea is not it here)
    const typed = land.filter((i) => dist(px(cm, i), TYPED_SEA) <= 8);
    ok(!typed.length && dist(SEA_RGB, TYPED_SEA) > 20, `⭐ …and not one of them is ${fmt(TYPED_SEA)}, the colour once typed in for it`, { typed: typed.length });
  }

  console.log("\n-- an index thin in the map's first latitude band is not read from the band before it (by number, the index before it's last) --");
  {
    // the palette keys its index × band buckets by number, ix × BANDS + b, so "band −1 of index 6" is band BANDS − 1 of index 5
    // (review of f6908c4: without the guard that stops the walk at the map's edge, a Nova world's new land moved by up to 2 on 173
    // texels and every check stayed green). Index 6 is thin in the first band and plentiful further south; index 5 fills the
    // last band in a colour of its own. BANDS is read off the palette's own source, and MIN — the one bucket floor this learn
    // and the city lights' share (#the-biggest-city-shines-widest), hoisted out of it — off the export, so the fixture follows them.
    const src = stripJsComments(fs.readFileSync(path.join(__dirname, "map-data.js"), "utf8"));
    const k = /const BANDS = (\d+), MIN = WORLD_TEXTURE_BUCKET_MIN;/.exec(src), BANDS = k ? +k[1] : 0, MIN = k ? md.WORLD_TEXTURE_BUCKET_MIN : 0;
    const W = 4 * MIN, H = 2 * BANDS, N = W * H, THIN = Math.floor(MIN / 3);
    const C5 = [200, 10, 200], C6 = [10, 200, 10], C9 = [100, 100, 100];
    const ixAt = (X, Y) => ((Y === 0 && X < THIN) || (Y >= 20 && Y < 40) ? 6 : Y >= H - 2 ? 5 : 9);
    const idx = new Uint8Array(N), img = new Uint8Array(N * 4);
    for (let Y = 0; Y < H; Y++) for (let X = 0; X < W; X++) { const i = Y * W + X, ix = ixAt(X, Y); idx[i] = ix; img.set([...(ix === 5 ? C5 : ix === 6 ? C6 : C9), 0], i * 4); }
    const layer = { W, H, N, cls: new Uint8Array(N).fill(1), pure: new Uint8Array(N).fill(1), idx };
    const pal = md.learnWorldTextureColours({ layer, colormap: img, urbanIdx: new Set(), idxCat: new Map([[5, "a"], [6, "b"], [9, "c"]]), key: null });
    ok(BANDS > 2 && THIN > 0 && THIN < MIN && dist(pal.landColour(5, H - 1), C5) < 1,
      `CONTROL: ${BANDS} bands of ${H / BANDS} rows; index 6 has ${THIN} texels in the first (under the ${MIN} a bucket needs), and index 5's last band is its own colour`, { BANDS, MIN, last: pal.landColour(5, H - 1) });
    const got = pal.landColour(6, 0);
    ok(dist(got, C6) < 1, `⭐ index 6 at the top of the map is its own colour (${fmt(C6)}), from its other latitudes: ${fmt(got)} — not index 5's last band (${fmt(C5)})`, fmt(got));
    // …and the same walk by terrain CATEGORY (#a-layer-below-is-read-by-its-own-terrain-table), keyed c × BANDS + b the same way:
    // category "b" (index 6's) is numbered right after "a" (index 5's), so its band −1 is "a"'s last band
    const byCat = typeof pal.landColourOfCategory === "function" ? pal.landColourOfCategory("b", 0) : [-99, -99, -99];
    ok(dist(byCat, C6) < 1, `⭐ …and so is index 6's category asked by name, at the top of the map: ${fmt(byCat)} — not category a's last band (${fmt(C5)})`, fmt(byCat));
  }
} catch (e) {
  ok(false, "threw: " + e.message + "\n" + e.stack);
} finally {
  for (const r of roots) { try { fs.rmSync(r, { recursive: true, force: true }); } catch (_) { /* scratch only */ } }
}
console.log("\n" + (fail ? "FAILED " + fail + "/" + (pass + fail) : "PASSED " + pass + "/" + pass));
process.exitCode = fail ? 1 : 0;
