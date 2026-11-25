// ⛔ #the-coast-shelf-comes-back-with-the-land — THE MAP BEFORE A WRITE IS RECOUNTED FROM ITS PIXELS, NOT FLIPPED BY THE TEXEL.
//
// repaintWorldTextures (every picture the mod owns) and repaintMinimap (a minimap it owns) judge a write against the map
// as it stood BEFORE it: the map that loads now, with what crossed the waterline put back. They rebuilt that map by
// flipping EVERY texel holding a crossed pixel. A texel only one of whose four pixels crossed did not change class, so the
// rebuilt map grew a fringe of phantom land along every coast the write drew. After Delete map → Generate land (the
// owner's own flow) that fringe lies on every new coast: the writer believed each coast had been there all along, kept the
// empty ocean's deep tint as the water's "detail", and the light shelf along every shore never came back. Measured on a
// copy of vanilla (Delete map, then the same land raised): water within 4 texels of land 41,62,92 against the base game's
// 77,124,167, and 16–64 texels out 31,48,73 against 40,67,95 — the whole ocean's gradient flattened. TEST 31 is 43,67,98
// within 4, while TEST 30, the same land and sea texel for texel, has its shelf.
//
// Pinned on a small game with ONE island whose coast runs on a diagonal, so texels straddle it (the other texture tests
// draw coasts on even pixels, which leave no texel with one crossed pixel and cannot show this). Its water tint darkens
// smoothly with the distance from land, so every distance band has its own colour to come back to.
//   · the recount itself (texelClassBeforeWrite), texel by texel, against the map before four writes worked out here from
//     the pixels (one of them to a lake, which is water as much as the sea is) — its class, and whether it was all one kind;
// …and driven through Nova's real writers:
//   · Delete map, then both halves raised by setProvinceDefinition (the page's retype, one province a call);
//   · Delete map, then both raised by ONE sinkProvincesInHeightmap call (the shape generateLand writes in);
//   · the minimap of the same world: a sea point beside the new coast keeps its bytes;
//   · an erase that also sinks the drowned coast's shallows (its fringe): no regression;
//   · a paint stroke through applyProvinceDiff across the diagonal coast, both ways at once: the recount of the map before
//     it, texel by texel — land-now ties included — and the tint of the water it brought nearer land or took away from it.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const md = require("./map-data.js");
const dds = require("./dds-codec.js");

let pass = 0, fail = 0;
const ok = (c, m, x) => {
  if (c) { pass++; console.log("  ok   " + m); }
  else { fail++; console.log("  FAIL " + m + (x !== undefined ? "   -> " + JSON.stringify(x).slice(0, 300) : "")); }
};
const roots = [];
const tmp = (tag) => { const d = fs.mkdtempSync(path.join(os.tmpdir(), "nova-coast-shelf-" + tag + "-")); roots.push(d); return d; };
const write = (dir, rel, body) => { const p = path.join(dir, ...rel.split("/")); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, body); return p; };

// ── the fixture's bitmaps (as test-the-world-textures-follow-the-coast.js draws them) ──────────────────────────
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
/** A DDS of `format` (RGB32 | DXT1 | DXT3 | DXT5), `levels` mips, painted by fn(x, y, level) → [r, g, b, a]. */
function makeDds(W, H, format, levels, fn) {
  const h = Buffer.alloc(128), compressed = format !== "RGB32";
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
  for (let l = 0; l < hdr.levels; l++) {
    const { w: lw, h: lh } = hdr.lv[l], rgba = new Uint8Array(lw * lh * 4);
    for (let y = 0; y < lh; y++) for (let x = 0; x < lw; x++) rgba.set(fn(x, y, l), (y * lw + x) * 4);
    dds.patchDdsLevel(buf, hdr, l, rgba, new Uint8Array(lw * lh).fill(1));
  }
  return buf;
}

// ── a 256 x 128 world: open sea, and one diamond of an island cut in two, 2 to the west and 3 to the east ─────────
// Its shallows read 92 for two pixels round it (vanilla's sea stands above 89 beside its own coasts), so an erase has a
// fringe of them to sink.
const W = 256, H = 128, TW = 128, TH = 64, MW = 64, MH = 32;
const inIsland = (x, y) => Math.abs(x - 128) + Math.abs(y - 64) * 1.7 < 70;
const provAt = (x, y) => (inIsland(x, y) ? (x < 128 ? 2 : 3) : 1);
const COL = { 1: [0, 0, 200], 2: [200, 0, 0], 3: [0, 200, 0] };
const DEF = "0;0;0;0;land;false;unknown;0\n1;0;0;200;sea;false;ocean;0\n2;200;0;0;land;true;plains;1\n3;0;200;0;land;true;plains;1\n";
const shallow = (x, y) => !inIsland(x, y) && [[1, 0], [-1, 0], [0, 1], [0, -1], [2, 0], [-2, 0], [0, 2], [0, -2], [1, 1], [1, -1], [-1, 1], [-1, -1]].some(([a, b]) => inIsland(x + a, y + b));
// A texel's class, as textureMapLayer counts it: the most of its four pixels, land on a two-two tie.
const texelLand = (X, Y, land = inIsland) => (land(2 * X, 2 * Y) ? 1 : 0) + (land(2 * X + 1, 2 * Y) ? 1 : 0) + (land(2 * X, 2 * Y + 1) ? 1 : 0) + (land(2 * X + 1, 2 * Y + 1) ? 1 : 0) >= 2;
const touchesIsland = (X, Y) => inIsland(2 * X, 2 * Y) || inIsland(2 * X + 1, 2 * Y) || inIsland(2 * X, 2 * Y + 1) || inIsland(2 * X + 1, 2 * Y + 1);
/** Each texel's distance from land, chamfer 3-4 in texels — the measure the writer paints the water by. */
function distanceFromLand(land) {
  const N = TW * TH, d = new Float32Array(N);
  for (let i = 0; i < N; i++) d[i] = texelLand(i % TW, (i / TW) | 0, land) ? 0 : 1e9;
  for (let y = 0; y < TH; y++) for (let x = 0; x < TW; x++) { const i = y * TW + x; let v = d[i]; if (x > 0) v = Math.min(v, d[i - 1] + 3); if (y > 0) { v = Math.min(v, d[i - TW] + 3); if (x > 0) v = Math.min(v, d[i - TW - 1] + 4); if (x < TW - 1) v = Math.min(v, d[i - TW + 1] + 4); } d[i] = v; }
  for (let y = TH - 1; y >= 0; y--) for (let x = TW - 1; x >= 0; x--) { const i = y * TW + x; let v = d[i]; if (x < TW - 1) v = Math.min(v, d[i + 1] + 3); if (y < TH - 1) { v = Math.min(v, d[i + TW] + 3); if (x < TW - 1) v = Math.min(v, d[i + TW + 1] + 4); if (x > 0) v = Math.min(v, d[i + TW - 1] + 4); } d[i] = v; }
  return d.map((v) => v / 3);
}
const dLand = distanceFromLand(inIsland);
// The water tint the layer below paints FOR this map: light over the shelf, darker and darker out to the open ocean, the
// way the base game's darkens (its 0–4, 4–16 and 16–64 texel bands are three different colours).
const SHELF = [90, 140, 180], DEEP = [20, 40, 60], OVER_LAND = [60, 70, 60];
const tintAt = (d) => { const t = Math.min(1, Math.log2(1 + d) / Math.log2(1 + 48)); return SHELF.map((c, k) => Math.round(c + (DEEP[k] - c) * t)); };
const fogAt = (d) => Math.round(100 - 34 * Math.min(1, Math.log2(1 + d) / Math.log2(1 + 48)));
const MINI_SEA = [84, 78, 66], MINI_LAND = [170, 162, 147];
const miniShare = (u, v) => {
  const x0 = Math.floor(u * TW / MW), x1 = Math.max(x0 + 1, Math.floor((u + 1) * TW / MW)), y0 = Math.floor(v * TH / MH), y1 = Math.max(y0 + 1, Math.floor((v + 1) * TH / MH));
  let l = 0, n = 0; for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { n++; if (texelLand(x, y)) l++; } return l / n;
};
const miniTouches = (u, v) => { for (let y = Math.floor(v * TH / MH); y < Math.floor((v + 1) * TH / MH); y++) for (let x = Math.floor(u * TW / MW); x < Math.floor((u + 1) * TW / MW); x++) if (touchesIsland(x, y)) return true; return false; };
function makeGame() {
  const g = tmp("game");
  write(g, "hoi4.exe", "");
  write(g, "map/provinces.bmp", bmp24(W, H, (x, y) => COL[provAt(x, y)]));
  write(g, "map/definition.csv", DEF);
  write(g, "map/terrain.bmp", bmp8(W, H, (x, y) => (inIsland(x, y) ? 0 : 15)));
  write(g, "map/heightmap.bmp", bmp8(W, H, (x, y) => (inIsland(x, y) ? 106 : shallow(x, y) ? 92 : 89)));
  write(g, "common/terrain/00_terrain.txt", ["categories = {", "  plains = { color = { 200 200 100 } }", "  ocean = { color = { 0 0 200 } is_water = yes }", "}",
    "terrain = {", "  plains = { type = plains color = { 0 } }", "  ocean = { type = ocean color = { 15 } }", "}", ""].join("\n"));
  const at = (X, Y) => Y * TW + X;
  write(g, "map/terrain/colormap_rgb_cityemissivemask_a.dds", makeDds(TW, TH, "RGB32", 1, (X, Y) => (texelLand(X, Y) ? [150, 120, 60, 0] : [79, 102, 141, 0])));
  const water = (X, Y) => (texelLand(X, Y) ? [...OVER_LAND, 255] : [...tintAt(dLand[at(X, Y)]), 255]);
  write(g, "map/terrain/colormap_water_0.dds", makeDds(TW, TH, "DXT5", 1, water));
  write(g, "map/terrain/colormap_water_1.dds", makeDds(TW / 2, TH / 2, "DXT5", 1, (X, Y) => water(2 * X, 2 * Y)));
  write(g, "map/terrain/colormap_water_2.dds", makeDds(TW / 4, TH / 4, "DXT5", 1, (X, Y) => water(4 * X, 4 * Y)));
  write(g, "map/terrain/fow_rgb_waterspec_a.dds", makeDds(TW, TH, "DXT5", 1, (X, Y) => { if (texelLand(X, Y)) return [140, 140, 140, 21]; const f = fogAt(dLand[at(X, Y)]); return [f, f, f, 39]; }));
  // the minimap: the paper's line from sea to land by the land share, and a grain of its own that Nova's never is
  write(g, "gfx/minimap/minimap.dds", makeDds(MW, MH, "RGB32", 1, (u, v) => { const s = miniShare(u, v), grain = (u * 7 + v * 3) % 5; return [...MINI_SEA.map((c, k) => Math.round(c + s * (MINI_LAND[k] - c) + grain)), 255]; }));
  return g;
}
const readTex = (root, rel) => { const b = fs.readFileSync(path.join(root, ...rel.split("/"))); const h = dds.parseDdsHeader(b); return dds.decodeDdsLevel(b, h, 0); };
const W0 = "map/terrain/colormap_water_0.dds", FOW = "map/terrain/fow_rgb_waterspec_a.dds", MINI = "gfx/minimap/minimap.dds";
const mean = (img, set, ch) => ch.map((c) => set.reduce((s, i) => s + img[i * 4 + c], 0) / Math.max(1, set.length));
const dist = (a, b) => Math.hypot(...a.map((v, k) => v - b[k]));
const fmt = (a) => a.map((v) => Math.round(v)).join(",");
// the water texels of the finished map by their distance from land, texels touching an island pixel left out (their
// class is the coast's to argue about, not the shelf's)
const band = (lo, hi) => { const o = []; for (let i = 0; i < TW * TH; i++) { const X = i % TW, Y = (i / TW) | 0; if (!texelLand(X, Y) && !touchesIsland(X, Y) && dLand[i] > lo && dLand[i] <= hi) o.push(i); } return o; };
const BANDS = [[0, 4, "0–4"], [4, 16, "4–16"], [16, 64, "16–64"]];
/** A colour → type map for provinces 1–3, as typeByColour builds one off definition.csv. */
const rows = (types) => new Map(Object.entries(types).map(([id, t]) => [((COL[id][0] << 16) | (COL[id][1] << 8) | COL[id][2]) >>> 0, t]));

/** A mod owning the game's map, whose world is then deleted: every picture Nova repaints is its own from here on. */
function deletedWorld(game, tag) {
  const m = tmp(tag);
  write(m, "descriptor.mod", 'version="1.0"\nname="shelf"\n');
  for (const f of ["provinces.bmp", "definition.csv"]) write(m, "map/" + f, fs.readFileSync(path.join(game, "map", f)));
  const b = md.blankMapToSea({ modRoot: m, gameRoot: game, dependencyRoots: [] });
  ok(b && b.changed, `Delete map ran on ${tag}`, b && b.error);
  return m;
}
/** The shelf and the ocean's gradient, band by band, against the layer below's own picture of this same map. */
function checkShelf(game, m, how) {
  const w0 = readTex(m, W0), g0 = readTex(game, W0), fow = readTex(m, FOW), gf = readTex(game, FOW);
  for (const [lo, hi, name] of BANDS) {
    const set = band(lo, hi), a = mean(w0, set, [0, 1, 2]), want = mean(g0, set, [0, 1, 2]);
    ok(set.length > 100 && dist(a, want) < 12, `${lo ? "" : "⭐ "}${how}: the water ${name} texels from land (${set.length}) is the layer below's ${fmt(want)}, not the empty ocean's`, { got: fmt(a), want: fmt(want) });
  }
  const near = band(0, 4), fa = mean(fow, near, [0])[0], fw = mean(gf, near, [0])[0];
  ok(Math.abs(fa - fw) < 8, `${how}: …and the fog's grey over the shelf is the shelf's (${Math.round(fw)}), not the open sea's`, { got: Math.round(fa), want: Math.round(fw) });
}
/** A minimap point that is sea before and after, beside the new coast, keeps the bytes the Delete map left it. */
function checkMinimap(game, m, how) {
  const mini = readTex(m, MINI), g = readTex(game, MINI);
  const pts = []; for (let v = 0; v < MH; v++) for (let u = 0; u < MW; u++) if (miniShare(u, v) === 0 && miniTouches(u, v)) pts.push(v * MW + u);
  const moved = pts.filter((i) => [0, 1, 2, 3].some((k) => mini[i * 4 + k] !== g[i * 4 + k]));
  ok(pts.length >= 10 && !moved.length, `⭐ ${how}: the ${pts.length} minimap points that are sea before and after, beside the new coast, keep their bytes`, moved.slice(0, 6).map((i) => [i % MW, (i / MW) | 0]));
}

try {
  const game = makeGame();
  const G = (m) => ({ modRoot: m, gameRoot: game, dependencyRoots: [] });

  console.log("\n-- the fixture can tell a shelf from the open ocean --");
  {
    const g0 = readTex(game, W0), bands = BANDS.map(([lo, hi]) => mean(g0, band(lo, hi), [0, 1, 2]));
    ok(dist(bands[0], bands[1]) > 15 && dist(bands[1], bands[2]) > 15, "CONTROL: the layer below's 0–4, 4–16 and 16–64 bands are three different colours", bands.map(fmt));
    let straddle = 0; for (let Y = 0; Y < TH; Y++) for (let X = 0; X < TW; X++) if (touchesIsland(X, Y) && !texelLand(X, Y)) straddle++;
    ok(straddle >= 20, `CONTROL: ${straddle} water texels hold an island pixel — the texels a flip by the texel turned into land`, straddle);
  }

  console.log("\n-- the map before a write is its pixels counted again, the crossed ones put back --");
  {
    // Worked here from the pixels, independently: each pixel's type BEFORE the write, then the most of each texel's four,
    // land on a two-two tie (textureMapLayer's rule). Four writes: a raise of the whole island on the empty sea (what
    // Generate land does after Delete map), an erase of its west half to the sea and one to a lake (the recount must count
    // a lake as water, as the map it recounts does), and a stroke that crossed every other pixel of the west half only —
    // the last one leaves one-colour texels with exactly two of four crossed, where the tie decides.
    const file = path.join(game, "map", "provinces.bmp"), px = (x, y) => y * W + x;
    const cases = [
      ["the island raised on the empty sea", { 1: "sea", 2: "land", 3: "land" }, (x, y) => inIsland(x, y), (x, y) => false],
      ["its west half erased", { 1: "sea", 2: "sea", 3: "land" }, (x, y) => provAt(x, y) === 2, (x, y) => inIsland(x, y)],
      ["its west half erased to a lake", { 1: "sea", 2: "lake", 3: "land" }, (x, y) => provAt(x, y) === 2, (x, y) => inIsland(x, y)],
      ["a stroke that crossed every other pixel of the west half", { 1: "sea", 2: "sea", 3: "land" }, (x, y) => provAt(x, y) === 2 && (x + y) % 2 === 0,
        (x, y) => provAt(x, y) === 3 || (provAt(x, y) === 2 && (x + y) % 2 === 0)],
    ];
    let ties = 0, mixedBefore = 0;
    for (const [name, types, crossedAt, landBefore] of cases) {
      const mask = new Uint8Array(W * H); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (crossedAt(x, y)) mask[px(x, y)] = 1;
      const rb = typeof md.texelClassBeforeWrite === "function" ? md.texelClassBeforeWrite(file, rows(types), { mask, W, H }) : null;
      if (!rb || rb.error) { ok(false, `${name}: the recount ran`, rb && rb.error); continue; }
      const want = (X, Y) => (texelLand(X, Y, landBefore) ? 1 : 2);
      // a texel inside one province has one colour (its four pixels counted as one); one on a border has several
      const inside = (X, Y) => { const p = provAt(2 * X, 2 * Y); return provAt(2 * X + 1, 2 * Y) === p && provAt(2 * X, 2 * Y + 1) === p && provAt(2 * X + 1, 2 * Y + 1) === p; };
      const asked = new Int8Array(TW * TH), wrong = { inside: [], border: [] };
      let nInside = 0;
      for (let i = 0; i < TW * TH; i++) {
        const X = i % TW, Y = (i / TW) | 0, k = inside(X, Y) ? "inside" : "border";
        if (k === "inside") nInside++;
        asked[i] = rb.classAt(i);
        if (asked[i] !== want(X, Y)) wrong[k].push(i);
      }
      const at = (l) => l.slice(0, 4).map((i) => [i % TW, (i / TW) | 0]);
      ok(!wrong.inside.length, `⭐ ${name}: each of the ${nInside} texels inside one province has the class the map before the write gives it`, { wrong: wrong.inside.length, first: at(wrong.inside) });
      ok(!wrong.border.length, `⭐ ${name}: …and each of the ${TW * TH - nInside} on a province border`, { wrong: wrong.border.length, first: at(wrong.border) });
      // …and asked backwards, which no repaint does, it walks its list again rather than answering from where it stopped
      const back = []; for (let i = TW * TH - 1; i >= 0; i--) if (rb.classAt(i) !== asked[i]) back.push(i);
      ok(!back.length, `${name}: asked backwards, every texel is answered as it was in order`, { differ: back.length, first: at(back) });
      // …and whether all four of its pixels were of one kind then (textureMapLayer's `pure`): a picture the mod owns is learnt
      // over the map before the write from those texels alone (#a-restyled-world-keeps-its-own-colours)
      const wrongPure = []; let mixed = 0;
      for (let i = 0; i < TW * TH; i++) {
        const X = i % TW, Y = (i / TW) | 0, n = [[0, 0], [1, 0], [0, 1], [1, 1]].filter(([a, b]) => landBefore(2 * X + a, 2 * Y + b)).length;
        if (n % 4) mixed++;
        if ((typeof rb.pureAt === "function" ? rb.pureAt(i) : -1) !== (n % 4 ? 0 : 1)) wrongPure.push(i);
      }
      ok(!wrongPure.length, `⭐ ${name}: …and whether all four of its pixels were one kind then, on every texel (${mixed} were not)`, { wrong: wrongPure.length, first: at(wrongPure) });
      mixedBefore += mixed;
      if (name.startsWith("a stroke")) for (let Y = 0; Y < TH; Y++) for (let X = 0; X < TW; X++) { const p = [px(2 * X, 2 * Y), px(2 * X + 1, 2 * Y), px(2 * X, 2 * Y + 1), px(2 * X + 1, 2 * Y + 1)]; if (p.every((q) => provAt(q % W, (q / W) | 0) === 2) && p.filter((q) => mask[q]).length === 2) ties++; }
    }
    ok(ties > 100, `CONTROL: ${ties} one-province texels had exactly two of their four pixels crossed — the tie is decided on them`, ties);
    ok(mixedBefore > 100, `CONTROL: ${mixedBefore} texels held both kinds before a write, where the answer is "not one kind"`, mixedBefore);
  }

  console.log("\n-- ⭐ Delete map, then each half raised again: the shelf along the shore comes back --");
  {
    const m = deletedWorld(game, "two-raises");
    const r2 = md.setProvinceDefinition({ ...G(m), provinceId: 2, type: "land", terrain: "plains", coastal: true, continent: 1 });
    const r3 = md.setProvinceDefinition({ ...G(m), provinceId: 3, type: "land", terrain: "plains", coastal: true, continent: 1 });
    const tx = [r2, r3].map((r) => r && r.heightmap && r.heightmap.textures);
    ok(tx.every((t) => t && t.changed), "both halves were raised and the world textures repainted", tx.map((t, k) => t || [r2, r3][k]));
    checkShelf(game, m, "two raises");
    checkMinimap(game, m, "two raises");
  }

  console.log("\n-- ⭐ …and the whole island raised in ONE call, the way Generate land writes it --");
  {
    const m = deletedWorld(game, "one-raise");
    // Generate land types the rows first and raises every province in one sinkProvincesInHeightmap call
    write(m, "map/definition.csv", DEF);
    const r = md.sinkProvincesInHeightmap({ ...G(m), provinceIds: [2, 3], raise: true });
    ok(r && r.changed && r.textures && r.textures.changed && r.minimap && r.minimap.changed, "the island was raised and its pictures repainted", r && { error: r.error, textures: r.textures, minimap: r.minimap });
    checkShelf(game, m, "one raise");
    checkMinimap(game, m, "one raise");
  }

  console.log("\n-- an erase that also sinks the drowned coast's shallows is repainted as before --");
  {
    // `crossed` marks the fringe's water pixels too, whose class never changed. The recount puts them back on the land
    // side, as the flip did for their whole texel; this pins that the erase still paints its new sea by its new coast.
    const m = tmp("fringe");
    write(m, "descriptor.mod", 'version="1.0"\nname="fringe"\n');
    for (const f of ["provinces.bmp", "definition.csv"]) write(m, "map/" + f, fs.readFileSync(path.join(game, "map", f)));
    const r = md.flipProvinceToSea({ ...G(m), provinceId: 2 });
    const hm = r && r.heightmap;
    ok(hm && hm.fringe > 0, `CONTROL: the erase sank ${hm && hm.fringe} fringe pixels of shallows beside the drowned coast`, hm);
    ok(hm && hm.textures && hm.textures.changed, "…and repainted the world textures", hm && hm.textures);
    const east = (x, y) => provAt(x, y) === 3, dNow = distanceFromLand(east);
    const w0 = readTex(m, W0), gone = [];
    for (let i = 0; i < TW * TH; i++) { const X = i % TW, Y = (i / TW) | 0; if (!texelLand(X, Y, east) && (texelLand(X, Y) || (touchesIsland(X, Y) && X < TW / 2))) gone.push(i); }
    const off = gone.filter((i) => dist([w0[i * 4], w0[i * 4 + 1], w0[i * 4 + 2]], tintAt(dNow[i])) > 20);
    ok(gone.length > 500 && off.length <= gone.length * 0.02, `every one of the ${gone.length} texels that went under or held the fringe carries the tint of its NEW distance from land (${off.length} off)`, off.slice(0, 5).map((i) => ({ got: [w0[i * 4], w0[i * 4 + 1], w0[i * 4 + 2]], want: tintAt(dNow[i]) })));
  }

  console.log("\n-- ⭐ a paint stroke across the diagonal coast, land out over the sea and sea in over the land --");
  {
    // applyProvinceDiff marks a painted pixel only when its HEIGHT crosses 89, so this world's sea stands at 89 right up to
    // its coast: every painted pixel that changes type crosses, and the map before the stroke is exactly what the recount
    // can give back (over shallows at 90–95 it cannot — texelClassBeforeWrite's note). The mod owns every picture.
    const m = tmp("paint");
    write(m, "descriptor.mod", 'version="1.0"\nname="paint"\n');
    for (const f of ["provinces.bmp", "definition.csv", "terrain.bmp"]) write(m, "map/" + f, fs.readFileSync(path.join(game, "map", f)));
    const hm0 = bmp8(W, H, (x, y) => (inIsland(x, y) ? 106 : 89));
    write(m, "map/heightmap.bmp", hm0);
    for (const f of Object.values(md.WORLD_TEXTURES)) write(m, "map/terrain/" + f, fs.readFileSync(path.join(game, "map", "terrain", f)));
    // province 3 brushed out along its north-east shore, and the sea brushed in along the south-west shore of 2: a brush of
    // radius 6 every 4 pixels, centred on the diagonal coast
    const brush = (cx, cy, r, p) => { const o = []; for (let y = cy - r; y <= cy + r; y++) for (let x = cx - r; x <= cx + r; x++) if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) o.push({ x, y, r: COL[p][0], g: COL[p][1], b: COL[p][2] }); return o; };
    const coastY = (x, sw) => Math.round(sw ? 64 + (70 - (128 - x)) / 1.7 : 64 - (70 - (x - 128)) / 1.7);
    const diff = [];
    for (let x = 140; x <= 190; x += 4) diff.push(...brush(x, coastY(x, false), 6, 3));
    for (let x = 66; x <= 116; x += 4) diff.push(...brush(x, coastY(x, true), 6, 1));
    const painted = new Map(diff.map((p) => [p.y * W + p.x, p.g ? 3 : 1]));
    const landNow = (x, y) => (painted.has(y * W + x) ? painted.get(y * W + x) !== 1 : inIsland(x, y));
    const mask = new Uint8Array(W * H); for (const [k, p] of painted) if ((p !== 1) !== inIsland(k % W, (k / W) | 0)) mask[k] = 1;
    const r = md.applyProvinceDiff({ ...G(m), diff });
    const tx = r && r.heightmap && r.heightmap.textures;
    ok(r && r.ok && tx && tx.changed, "the stroke was painted and the world textures repainted", r && (r.error || r.heightmap));
    // the pixels the writer moved across the waterline, read back off its heightmap: the mask worked out here, pixel for pixel
    const hm1 = fs.readFileSync(path.join(m, "map", "heightmap.bmp"));
    let moved = 0, strayed = 0;
    const rs8 = Math.floor((8 * W + 31) / 32) * 4, at8 = (b, x, y) => b[54 + 1024 + (H - 1 - y) * rs8 + x];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const c = at8(hm1, x, y) !== at8(hm0, x, y); if (c) moved++; if (c !== !!mask[y * W + x]) strayed++; }
    ok(moved > 200 && !strayed && hm1.length === hm0.length, `CONTROL: the stroke moved ${moved} pixels across the waterline, each one a pixel whose type it changed (${strayed} not)`, { moved, strayed });
    // (i) every texel holding a crossed pixel, recounted, against the map before the stroke counted off the pixels as they were
    const rb = typeof md.texelClassBeforeWrite === "function" ? md.texelClassBeforeWrite(path.join(m, "map", "provinces.bmp"), rows({ 1: "sea", 2: "land", 3: "land" }), { mask, W, H }) : null;
    if (!rb || rb.error) ok(false, "the recount ran on the painted map", rb && rb.error);
    else {
      // land now and water now apart: a one-province texel with two of four crossed is a tie either way, and land wins it
      const wrong = { land: [], water: [] }, n = { land: 0, water: 0 }, ties = { land: 0, water: 0 }, X2 = (i) => [i % TW, (i / TW) | 0];
      for (let Y = 0; Y < TH; Y++) for (let X = 0; X < TW; X++) {
        const q = [[2 * X, 2 * Y], [2 * X + 1, 2 * Y], [2 * X, 2 * Y + 1], [2 * X + 1, 2 * Y + 1]], f = q.filter(([x, y]) => mask[y * W + x]).length;
        if (!f) continue;
        const k = texelLand(X, Y, landNow) ? "land" : "water";
        n[k]++;
        if (rb.classAt(Y * TW + X) !== (texelLand(X, Y) ? 1 : 2)) wrong[k].push(Y * TW + X);
        const prov = q.map(([x, y]) => painted.get(y * W + x) || provAt(x, y));
        if (f === 2 && prov.every((p) => p === prov[0])) ties[k]++;
      }
      ok(ties.land > 0 && ties.water > 0, `CONTROL: ${ties.land} one-province texels land now and ${ties.water} water now have exactly two of their four pixels crossed — the tie decides them`, ties);
      for (const k of ["land", "water"]) ok(n[k] > 50 && !wrong[k].length, `⭐ each of the ${n[k]} texels the stroke crossed that are ${k} now has the class the map before it gives it`, { wrong: wrong[k].length, first: wrong[k].slice(0, 5).map(X2) });
    }
    // (ii) the water the stroke kept, whose distance from land it changed: the tint of its NEW distance, the layer below's
    // own gradient (the flip took the water beside every crossed texel for old coast, and kept its old tint)
    const dNow = distanceFromLand(landNow), w0 = readTex(m, W0);
    const kept = []; for (let i = 0; i < TW * TH; i++) { const X = i % TW, Y = (i / TW) | 0; if (!texelLand(X, Y, landNow) && !texelLand(X, Y) && dNow[i] < 12 && Math.abs(dNow[i] - dLand[i]) > 0.5) kept.push(i); }
    const err = kept.map((i) => dist([w0[i * 4], w0[i * 4 + 1], w0[i * 4 + 2]], tintAt(dNow[i])));
    const meanErr = err.reduce((a, b) => a + b, 0) / Math.max(1, err.length), over = err.filter((e) => e > 20).length;
    ok(kept.length > 300 && meanErr < 8 && over <= kept.length * 0.01, `⭐ the ${kept.length} water texels it brought nearer land or took further from it carry the tint of their new distance (${meanErr.toFixed(1)} off on average, ${over} over 20)`, { meanErr, over });
  }
} catch (e) {
  ok(false, "threw: " + e.message + "\n" + e.stack);
} finally {
  for (const r of roots) { try { fs.rmSync(r, { recursive: true, force: true }); } catch (_) { /* scratch only */ } }
}
console.log("\n" + (fail ? "FAILED " + fail + "/" + (pass + fail) : "PASSED " + pass + "/" + pass));
process.exitCode = fail ? 1 : 0;
