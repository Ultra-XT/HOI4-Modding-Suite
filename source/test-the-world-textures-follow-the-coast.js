// ⛔ #the-air-map-still-shows-the-old-world — THE WORLD'S COLOURS FOLLOW THE WORLD.
//
// After TEST 28 the owner wrote that the air map "still looks like the vanilla … air reigions but destroyed, as in
// africa is missing parts and north america and asia … its not even the same map i look at in navy or land". The
// regions were right. The colours were vanilla's: five textures in map/terrain (the colour map with the city lights in
// its alpha, three water tints, the fog and water-shine map) are each a picture of one map, Nova never wrote them, and
// so every world it built was tinted with Earth — 69.9% of TEST 28's new land in the ocean's slate, South America 100%
// on new land. repaintWorldTextures now repaints them where the ground under them changed, with colours learnt from
// the layer below, and patches only what changed (dds-codec.js).
//
// Pinned on a small game with its own five textures, driven through Nova's real writers:
//   · the codec: an empty patch is byte-identical, a patch keeps the header, a format it cannot write is refused;
//   · an erase repaints the drowned texels with the layer below's sea colour, puts out its city lights, keeps the
//     header and size, and leaves land far from it byte-identical;
//   · a raise repaints land with the colour of its NEW terrain, which it can only read after the terrain painter ran;
//   · a second pass writes nothing; erasing what is already sea copies nothing into the mod;
//   · a world built before the writer existed is reported, repaired by Auto-fix's step, and then quiet;
//   · a mod that inherits its map is never given textures;
//   · every height writer in the source hands its mask to the texture writer.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const md = require("./map-data.js");
const dds = require("./dds-codec.js");
const L = require("./public/map-rule-labels.js");
const { stripJsComments } = require("./testlib-strip-comments.js");

let pass = 0, fail = 0;
const ok = (c, m, x) => {
  if (c) { pass++; console.log("  ok   " + m); }
  else { fail++; console.log("  FAIL " + m + (x !== undefined ? "   -> " + JSON.stringify(x).slice(0, 300) : "")); }
};
const roots = [];
const tmp = (tag) => { const d = fs.mkdtempSync(path.join(os.tmpdir(), "nova-world-tex-" + tag + "-")); roots.push(d); return d; };
const write = (dir, rel, body) => { const p = path.join(dir, ...rel.split("/")); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, body); return p; };
const sha = (b) => crypto.createHash("sha1").update(b).digest("hex");
const hashDir = (d) => { const o = {}; if (!fs.existsSync(d)) return o; for (const f of fs.readdirSync(d)) { const p = path.join(d, f); if (fs.statSync(p).isFile()) o[f] = sha(fs.readFileSync(p)); } return o; };

// ── the fixture's bitmaps ──────────────────────────────────────────────────────────────────────────────────────
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

// ── a small game: sea on the left, land on the right, a city in the land's south-east corner ──────────────────
// 128 x 64 provinces.bmp, so every world texture is 64 x 32.
//   1 sea    x <  48
//   2 land   48 <= x < 64                    (the coast; what the erase drowns)
//   3 land   x >= 64, y < 44                 plains
//   4 land   x >= 96, y >= 44                urban (a city, lit)
//   6 land   64 <= x < 96, y >= 44           desert — so the layer below has a desert colour to learn
//   5 sea    a lagoon: 76 <= x < 116, 6 <= y < 34, inside 3 (what the raise lifts, as desert)
//   7 land   an islet, 20 <= x < 24, 50 <= y < 54, in the sea: four texels (what a small hand edit drowns)
const W = 128, H = 64, TW = 64, TH = 32;
const COL = { 1: [0, 0, 200], 2: [200, 0, 0], 3: [0, 200, 0], 4: [200, 200, 0], 5: [0, 100, 200], 6: [100, 50, 0], 7: [50, 50, 50] };
const provAt = (x, y) => (x >= 20 && x < 24 && y >= 50 && y < 54 ? 7 : x >= 76 && x < 116 && y >= 6 && y < 34 ? 5 : x < 48 ? 1 : x < 64 ? 2 : y < 44 ? 3 : x >= 96 ? 4 : 6);
const IDX = { plains: 0, urban: 13, ocean: 15, desert: 7 };
const LAND_RGB = [150, 120, 60], URBAN_RGB = [120, 110, 100], DESERT_RGB = [210, 180, 110], SEA_RGB = [79, 102, 141];
function makeGame() {
  const g = tmp("game");
  write(g, "hoi4.exe", "");
  write(g, "map/provinces.bmp", bmp24(W, H, (x, y) => COL[provAt(x, y)]));
  write(g, "map/definition.csv", "0;0;0;0;land;false;unknown;0\n1;0;0;200;sea;false;ocean;0\n2;200;0;0;land;true;plains;1\n3;0;200;0;land;true;plains;1\n4;200;200;0;land;false;urban;1\n5;0;100;200;sea;false;ocean;0\n6;100;50;0;land;false;desert;1\n7;50;50;50;land;true;plains;1\n");
  const landAt = (x, y) => { const p = provAt(x, y); return p !== 1 && p !== 5; };
  write(g, "map/terrain.bmp", bmp8(W, H, (x, y) => { const p = provAt(x, y); return p === 1 || p === 5 ? IDX.ocean : p === 4 ? IDX.urban : p === 6 ? IDX.desert : IDX.plains; }));
  write(g, "map/heightmap.bmp", bmp8(W, H, (x, y) => (landAt(x, y) ? 106 : 89)));
  write(g, "common/terrain/00_terrain.txt", [
    "categories = {", "  plains = { color = { 200 200 100 } }", "  urban = { color = { 120 110 100 } }", "  desert = { color = { 210 180 110 } }",
    "  ocean = { color = { 0 0 200 } is_water = yes }", "}",
    "terrain = {", "  plains = { type = plains color = { 0 } }", "  desert = { type = desert color = { 7 } }", "  urban = { type = urban color = { 13 } }", "  ocean = { type = ocean color = { 15 } }", "}", ""].join("\n"));
  // the pictures, painted FOR this map: a texel is a 2 x 2 block of provinces.bmp
  const texelLand = (X, Y) => landAt(2 * X, 2 * Y);
  const cm = (X, Y) => { const p = provAt(2 * X, 2 * Y); return p === 1 || p === 5 ? [...SEA_RGB, 0] : p === 4 ? [...URBAN_RGB, 173] : p === 6 ? [...DESERT_RGB, 0] : [...LAND_RGB, 0]; };
  write(g, "map/terrain/colormap_rgb_cityemissivemask_a.dds", makeDds(TW, TH, "RGB32", 1, (x, y) => cm(x, y)));
  write(g, "map/terrain/colormap_water_0.dds", makeDds(TW, TH, "DXT5", 1, (x, y) => (texelLand(x, y) ? [60, 70, 60, 255] : [35, 59, 81, 255])));
  write(g, "map/terrain/colormap_water_1.dds", makeDds(TW / 2, TH / 2, "DXT5", 1, (x, y) => (texelLand(2 * x, 2 * y) ? [60, 70, 60, 255] : [35, 59, 81, 255])));
  write(g, "map/terrain/colormap_water_2.dds", makeDds(TW / 4, TH / 4, "DXT5", 1, (x, y) => (texelLand(4 * x, 4 * y) ? [60, 70, 60, 255] : [35, 59, 81, 255])));
  write(g, "map/terrain/fow_rgb_waterspec_a.dds", makeDds(TW, TH, "DXT5", 7, (x, y, l) => (texelLand(x << l, y << l) ? [140, 140, 140, 21] : [90, 90, 90, 40])));
  // the minimap: a line from the sea's paper colour to the land's by the land share under each point, with a little grain
  // …and the coast's land drawn 25 lighter, a regional tint as vanilla's Sahara is: a point that goes under must not carry
  // it into the sea (TEST 28's first minimap repaint left Australia as a shadow that way)
  write(g, "gfx/minimap/minimap.dds", makeDds(MW, MH, "RGB32", 1, (u, v) => {
    const s = miniLandShare(u, v), grain = (u * 7 + v * 3) % 5 + (s === 1 && u >= 12 && u < 16 ? 25 : 0);
    return [...MINI_SEA.map((c, k) => c + s * (MINI_LAND[k] - c) + grain), 255].map(Math.round);
  }));
  return g;
}
// The minimap: 32 x 12 points over the 128 x 64 map — not a whole ratio, as vanilla's 268 x 97 over 5632 x 2048 is not.
const MW = 32, MH = 12, MINI_SEA = [84, 78, 66], MINI_LAND = [170, 162, 147];
function miniLandShare(u, v, landPx = (x, y) => { const p = provAt(x, y); return p !== 1 && p !== 5; }) {
  const x0 = Math.floor(u * W / MW), x1 = Math.floor((u + 1) * W / MW), y0 = Math.floor(v * H / MH), y1 = Math.floor((v + 1) * H / MH);
  let land = 0, n = 0; for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { n++; if (landPx(x, y)) land++; }
  return land / n;
}
const readMini = (root) => { const b = fs.readFileSync(path.join(root, "gfx", "minimap", "minimap.dds")); const h = dds.parseDdsHeader(b); return { b, h, rgba: dds.decodeDdsLevel(b, h, 0) }; };
const NAMES = ["colormap_rgb_cityemissivemask_a.dds", "colormap_water_0.dds", "colormap_water_1.dds", "colormap_water_2.dds", "fow_rgb_waterspec_a.dds"];
const mkMod = () => { const m = tmp("mod"); write(m, "descriptor.mod", 'version="1.0"\nname="world textures"\n'); return m; };
const readTex = (root, name) => { const b = fs.readFileSync(path.join(root, "map", "terrain", name)); const h = dds.parseDdsHeader(b); return { b, h, rgba: dds.decodeDdsLevel(b, h, 0) }; };
const texelOfProvince = (p) => { const out = []; for (let Y = 0; Y < TH; Y++) for (let X = 0; X < TW; X++) if (provAt(2 * X, 2 * Y) === p && provAt(2 * X + 1, 2 * Y + 1) === p) out.push(Y * TW + X); return out; };
const near = (a, b, tol) => a.every((v, k) => Math.abs(v - b[k]) <= tol);

try {
  console.log("\n-- the codec patches in place and refuses what it cannot write --");
  {
    for (const f of ["RGB32", "DXT1", "DXT3", "DXT5"]) {
      const b = makeDds(16, 8, f, 3, (x, y) => [x * 16, y * 30, 200 - x * 8, 255 - y * 20]);
      const h = dds.parseDdsHeader(b), before = Buffer.from(b);
      const n = dds.patchDdsWithMips(b, h, dds.decodeDdsLevel(b, h, 0), new Uint8Array(16 * 8));
      ok(n === 0 && Buffer.compare(b, before) === 0, `${f}: an empty patch writes nothing and leaves every byte`);
      const rgba = dds.decodeDdsLevel(b, h, 0); for (let i = 0; i < 4; i++) rgba.set([255, 0, 0, 255], i * 4);
      const dirty = new Uint8Array(16 * 8); for (let i = 0; i < 4; i++) dirty[i] = 1;
      dds.patchDdsWithMips(b, h, rgba, dirty);
      const back = dds.decodeDdsLevel(b, h, 0);
      ok(Buffer.compare(b.subarray(0, 128), before.subarray(0, 128)) === 0 && b.length === before.length && near([back[0], back[1], back[2]], [255, 0, 0], 8),
        `${f}: a patch keeps the header and the size, and the texel reads back as painted`, [back[0], back[1], back[2]]);
      const far = (h.format === "RGB32" ? 16 * 8 - 1 : 16 * 8 - 1);
      ok(back[far * 4] === dds.decodeDdsLevel(before, h, 0)[far * 4], `${f}: a texel in a block nobody touched is unchanged`);
    }
    const dx10 = makeDds(8, 8, "DXT5", 1, () => [0, 0, 0, 255]); dx10.write("DX10", 84, "latin1");
    ok(/unsupported compressed format/.test(String(dds.parseDdsHeader(dx10).error)), "a DX10 header is refused, not guessed at", dds.parseDdsHeader(dx10));
    const GAME = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
    if (fs.existsSync(path.join(GAME, "map", "terrain", NAMES[0]))) {
      for (const n of NAMES) {
        const b = fs.readFileSync(path.join(GAME, "map", "terrain", n)), h = dds.parseDdsHeader(b), c = Buffer.from(b);
        dds.patchDdsWithMips(c, h, dds.decodeDdsLevel(c, h, 0), new Uint8Array(h.width * h.height));
        ok(!h.error && Buffer.compare(c, b) === 0, `the base game's ${n} (${h.format}, ${h.levels} level${h.levels > 1 ? "s" : ""}) reads, and an empty patch leaves it byte-identical`, h.error);
      }
    }
  }

  const game = makeGame();
  const G = (m) => ({ modRoot: m, gameRoot: game, dependencyRoots: [] });

  console.log("\n-- ⭐ an erase repaints what went under, and nothing it did not touch --");
  let erased;
  {
    const m = mkMod(); erased = m;
    const r = md.flipProvinceToSea({ ...G(m), provinceId: 2 });
    ok(r && r.changed && r.type === "sea", "province 2 was erased to sea", r && r.error);
    const tx = r.heightmap && r.heightmap.textures;
    ok(!!tx && tx.changed && tx.inherited === true, "…and the erase repainted the world textures, as a world that inherited them", tx);
    for (const n of NAMES.slice(0, 2).concat(NAMES[4])) ok(fs.existsSync(path.join(m, "map", "terrain", n)), `…the mod now has its own ${n}`);
    const g0 = readTex(game, NAMES[0]), m0 = readTex(m, NAMES[0]);
    ok(m0.b.length === g0.b.length && Buffer.compare(m0.b.subarray(0, 128), g0.b.subarray(0, 128)) === 0, "…the colour map keeps the base game's header and size byte for byte");
    const drowned = texelOfProvince(2);
    const notSea = drowned.filter((i) => !near([m0.rgba[i * 4], m0.rgba[i * 4 + 1], m0.rgba[i * 4 + 2]], SEA_RGB, 12));
    ok(drowned.length > 50 && !notSea.length, `every one of the ${drowned.length} texels that went under carries the layer below's sea colour`, notSea.slice(0, 5).map((i) => [...m0.rgba.subarray(i * 4, i * 4 + 4)]));
    const farLand = texelOfProvince(4).filter((i) => (i % TW) >= 80 - 0);
    let changed = 0; for (const i of texelOfProvince(4)) for (let k = 0; k < 4; k++) if (m0.rgba[i * 4 + k] !== g0.rgba[i * 4 + k]) changed++;
    ok(changed === 0, "⭐ the city far from the erase is byte-for-byte what the base game painted, lights included", changed);
    const lit = drowned.filter((i) => m0.rgba[i * 4 + 3] > 0);
    ok(!lit.length, "…and no city light is left shining on the new sea", lit.length);
    const w0 = readTex(m, NAMES[1]), gw = readTex(game, NAMES[1]);
    const wLand = drowned.filter((i) => near([w0.rgba[i * 4], w0.rgba[i * 4 + 1], w0.rgba[i * 4 + 2]], [60, 70, 60], 10));
    ok(!wLand.length, "the water tint over the new sea is water's, not the land's it was", wLand.length);
    void farLand; void gw;
    // …and the minimap (#the-minimap-still-shows-the-earth)
    const mm = r.heightmap && r.heightmap.minimap;
    ok(!!mm && mm.changed && mm.materialized === true && fs.existsSync(path.join(m, "gfx", "minimap", "minimap.dds")), "the erase repainted the minimap too, and the mod now has its own", mm);
    const gMini = readMini(game), mMini = readMini(m);
    ok(mMini.b.length === gMini.b.length && Buffer.compare(mMini.b.subarray(0, 128), gMini.b.subarray(0, 128)) === 0, "…keeping the base game's header and size");
    const coastPts = []; for (let v = 0; v < MH; v++) for (let u = 0; u < MW; u++) if (miniLandShare(u, v) === 1 && miniLandShare(u, v, (x, y) => { const p = provAt(x, y); return p !== 1 && p !== 5 && p !== 2; }) === 0) coastPts.push(v * MW + u);
    const notSeaPaper = coastPts.filter((i) => !near([mMini.rgba[i * 4], mMini.rgba[i * 4 + 1], mMini.rgba[i * 4 + 2]], MINI_SEA, 8));
    ok(coastPts.length >= 3 && !notSeaPaper.length, `the ${coastPts.length} minimap points that were all coast now show the sea's paper colour`, notSeaPaper.map((i) => [...mMini.rgba.subarray(i * 4, i * 4 + 3)]));
    const farPts = []; for (let v = 0; v < MH; v++) for (let u = 20; u < MW; u++) farPts.push(v * MW + u);
    ok(farPts.every((i) => [0, 1, 2, 3].every((k) => mMini.rgba[i * 4 + k] === gMini.rgba[i * 4 + k])), "…and every point far from the erase keeps its bytes");
  }

  console.log("\n-- it settles --");
  {
    const snap = hashDir(path.join(erased, "map", "terrain"));
    const again = md.repaintWorldTextures(G(erased));
    ok(!again.changed && JSON.stringify(hashDir(path.join(erased, "map", "terrain"))) === JSON.stringify(snap), "a second pass with nothing crossed writes nothing", again);
    const r = md.flipProvinceToSea({ ...G(erased), provinceId: 2 });
    ok(JSON.stringify(hashDir(path.join(erased, "map", "terrain"))) === JSON.stringify(snap), "…and erasing it again leaves every texture byte-identical", r && r.heightmap && r.heightmap.textures);
    const fresh = mkMod();
    md.flipProvinceToSea({ ...G(fresh), provinceId: 1 });
    ok(!fs.existsSync(path.join(fresh, "map", "terrain")), "erasing what is already sea copies no texture into the mod");
  }

  console.log("\n-- ⭐ once the mod paints its own, the next edit repaints what IT moved --");
  {
    // The erase above gave the mod its own five pictures, so they no longer describe any layer below: what is stale now
    // is exactly what the next write moves across the waterline. Raise the lagoon in the same mod.
    const before = readTex(erased, NAMES[0]);
    const r = md.setProvinceDefinition({ ...G(erased), provinceId: 5, type: "land", terrain: "plains", coastal: false, continent: 1 });
    const tx = r && r.heightmap && r.heightmap.textures;
    ok(!!tx && tx.changed && tx.inherited === false, "the raise repainted the mod's own textures, as ones it owns", tx);
    const m0 = readTex(erased, NAMES[0]);
    const lagoon = texelOfProvince(5).filter((i) => near([m0.rgba[i * 4], m0.rgba[i * 4 + 1], m0.rgba[i * 4 + 2]], SEA_RGB, 25));
    ok(!lagoon.length, "…the lagoon is land-coloured now", lagoon.length);
    let moved = 0; for (const i of texelOfProvince(2)) for (let k = 0; k < 4; k++) if (m0.rgba[i * 4 + k] !== before.rgba[i * 4 + k]) moved++;
    ok(moved === 0, "…and the sea the first erase painted, far from it, is byte-for-byte as it was", moved);
    // the minimap the mod now owns follows the same write: a point that was all lagoon is land now
    const mm = r && r.heightmap && r.heightmap.minimap, mMini = readMini(erased);
    const lagoonPts = []; for (let v = 0; v < MH; v++) for (let u = 0; u < MW; u++) if (miniLandShare(u, v) === 0 && miniLandShare(u, v, (x, y) => provAt(x, y) !== 1) === 1) lagoonPts.push(v * MW + u);
    // each point nearer the land's paper than the sea's, and on average within 10 of it (the grain it is given is the land's
    // own spread, which the fixture's tinted coast widens)
    const px = (i) => [mMini.rgba[i * 4], mMini.rgba[i * 4 + 1], mMini.rgba[i * 4 + 2]];
    const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
    const avg = [0, 1, 2].map((k) => lagoonPts.reduce((s, i) => s + mMini.rgba[i * 4 + k], 0) / Math.max(1, lagoonPts.length));
    ok(!!mm && mm.changed && mm.inherited === false && lagoonPts.length >= 2 && lagoonPts.every((i) => dist(px(i), MINI_LAND) < dist(px(i), MINI_SEA)) && near(avg, MINI_LAND, 10),
      `…and the minimap the mod owns shows the ${lagoonPts.length} points that were all lagoon as land`, { mm, avg, pts: lagoonPts.slice(0, 6).map(px) });
  }

  console.log("\n-- ⭐ land raised on a world Delete map left all sea is not one flat colour (#the-minimap-land-is-one-flat-colour) --");
  {
    // Delete map gives the mod its own minimap, all sea. The grain a point that turns to land is given was measured on THIS
    // minimap's land — of which there is none — so it was 0, and TEST 31's whole generated world drew on the minimap as one
    // flat colour (review of add0eb0). With none to measure, it is the grain of the minimap below.
    const m = mkMod();
    // the owner's flow: the map's shapes copied into the mod, then Delete map
    for (const f of ["provinces.bmp", "definition.csv"]) write(m, "map/" + f, fs.readFileSync(path.join(game, "map", f)));
    const b = md.blankMapToSea(G(m));
    const own = path.join(m, "gfx", "minimap", "minimap.dds");
    ok(b && b.changed && fs.existsSync(own), "Delete map left the mod its own minimap", b && (b.error || b.minimap));
    const r = md.setProvinceDefinition({ ...G(m), provinceId: 2, type: "land", terrain: "plains", coastal: false, continent: 1 });
    ok(r && r.changed, "province 2 is raised back to land", r && (r.error || r.reason));
    const mMini = readMini(m);
    const pts = []; for (let v = 0; v < MH; v++) for (let u = 0; u < MW; u++) if (miniLandShare(u, v, (x, y) => provAt(x, y) === 2) === 1) pts.push(v * MW + u);
    const cols = pts.map((i) => [mMini.rgba[i * 4], mMini.rgba[i * 4 + 1], mMini.rgba[i * 4 + 2]]);
    const distinct = new Set(cols.map((c) => c.join(","))).size;
    ok(pts.length >= 6 && distinct >= 3, `⭐⭐ the ${pts.length} minimap points of the raised land carry the paper's grain — ${distinct} different colours, not one`, cols.slice(0, 8));
    const avg = [0, 1, 2].map((k) => cols.reduce((s, c) => s + c[k], 0) / Math.max(1, cols.length));
    ok(near(avg, MINI_LAND, 15), "…and still read as the land's paper colour on average", avg);
    // …at the paper's STRENGTH, and one that holds (#the-minimap-grain-is-half-the-papers, review of 3d0f85e). The grain is
    // noise × a spread learnt off a minimap; it came out at 0.46 of that spread, and a later repaint, learning off Nova's own
    // land, took 0.46 of it again. Now the spread is measured LOCALLY and the noise is scaled so its own local spread is 1:
    // what a repaint paints, the next one measures back. Measured here over a grid the size of vanilla's minimap at another
    // offset than the one the noise is scaled on, so this is not the scaler checking itself.
    const GW = 268, GH = 97, S = 4;
    const painted = new Float64Array(GW * GH * 4), allLand = new Array(GW * GH).fill("land");
    for (let v = 0; v < GH; v++) for (let u = 0; u < GW; u++) painted[(v * GW + u) * 4] = Math.round(150 + S * md.minimapGrain(u + 700, v + 300));
    const back = md.minimapLocalSpread(painted, allLand, GW, GH).land[0];
    ok(back > S * 0.9 && back < S * 1.1, `⭐⭐ grain painted at a spread of ${S} measures back as ${back.toFixed(2)} — a repaint of a repaint keeps it, not ${(S * 0.46).toFixed(1)}`, back);
    // …and a whole-region tint is not grain: vanilla's land strays 8–10 from its mean but only 3.6–4.5 from its neighbours —
    // the Sahara is lighter, the jungles darker — and the whole-map figure drawn as grain would speckle new land with it
    const tint = new Float64Array(GW * GH * 4);
    for (let v = 0; v < GH; v++) for (let u = 0; u < GW; u++) tint[(v * GW + u) * 4] = 60 + u * 0.5;
    const mean = 60 + (GW - 1) * 0.25, whole = Math.sqrt(Array.from({ length: GW }, (_, u) => (60 + u * 0.5 - mean) ** 2).reduce((a, b) => a + b, 0) / GW);
    const tintBack = md.minimapLocalSpread(tint, allLand, GW, GH).land[0];
    ok(whole > 30 && tintBack < 1, `⭐ a smooth tint across the whole minimap (${whole.toFixed(0)} from its mean) is measured as almost no grain (${tintBack.toFixed(2)})`, { whole, tintBack });
    const body = stripJsComments(fs.readFileSync(path.join(__dirname, "map-data.js"), "utf8"));
    const fn = (name) => { const a = body.indexOf(`function ${name}(`); return body.slice(a, body.indexOf("\nfunction ", a + 1)); };
    // (the learning measures its grain through minimapPaletteOf, which a minimap the mod owns is learnt through as well —
    // #a-restyled-map-keeps-its-own-colours — so the check follows the call there rather than asking for a second one)
    ok(/minimapGrain\(u, v\)/.test(fn("repaintMinimap")) && !/textureFbm\(/.test(fn("repaintMinimap")) && /minimapLocalSpread\(/.test(fn("repaintMinimap"))
      && /minimapPaletteOf\(/.test(fn("minimapColours")) && /minimapLocalSpread\(/.test(fn("minimapPaletteOf")),
      "…and both the repaint and the learning from below measure and draw the grain that way", [fn("repaintMinimap").length, fn("minimapColours").length, fn("minimapPaletteOf").length]);
  }

  console.log("\n-- ⭐ a raise paints the land with the colour of what it now IS --");
  {
    // The lagoon (5) becomes DESERT land. The texture writer reads terrain.bmp's new index, which the terrain painter
    // has only just written — called before it, it would read the ocean index and paint the old world's sea colour.
    const m = mkMod();
    const r = md.setProvinceDefinition({ ...G(m), provinceId: 5, type: "land", terrain: "desert", coastal: false, continent: 1 });
    ok(r && r.changed, "the lagoon was retyped to desert land", r && r.error);
    const tx = r.heightmap && r.heightmap.textures;
    ok(!!tx && tx.changed, "…the raise repainted the world textures", tx || r.heightmap);
    const m0 = readTex(m, NAMES[0]);
    const lagoon = texelOfProvince(5);
    const off = lagoon.filter((i) => near([m0.rgba[i * 4], m0.rgba[i * 4 + 1], m0.rgba[i * 4 + 2]], SEA_RGB, 25));
    ok(lagoon.length > 100 && !off.length, `none of its ${lagoon.length} texels is still painted as sea`, off.length);
    // Its middle, away from the seam that fades new paint into the plains round it, is DESERT: the colour the layer below
    // gives terrain.bmp's desert index. Read before the terrain painter ran, the index is still the ocean's, which no land
    // carries, and the colour falls back to the plains around it.
    const mid = 10 * TW + 48;
    const c = [m0.rgba[mid * 4], m0.rgba[mid * 4 + 1], m0.rgba[mid * 4 + 2]];
    const d = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
    ok(provAt(96, 20) === 5 && d(c, DESERT_RGB) < d(c, LAND_RGB), "⭐ …and its middle is painted nearer the desert colour it now is than the plains around it", { c, DESERT_RGB, LAND_RGB });
    ok(lagoon.every((i) => m0.rgba[i * 4 + 3] === 0), "…with no city lights, because a desert is not a city");
  }

  console.log("\n-- ⭐ a paint stroke across the coast repaints what it moved --");
  {
    // The map editor's other height writer: painting sea pixels with a land province's colour raises them
    // (levelPaintedPixels). Paint a 12 x 16 block of the open sea as coast province 2.
    const m = mkMod();
    const diff = [];
    for (let y = 0; y < 16; y++) for (let x = 36; x < 48; x++) diff.push({ x, y, r: COL[2][0], g: COL[2][1], b: COL[2][2] });
    const r = md.applyProvinceDiff({ ...G(m), diff });
    const tx = r && r.heightmap && r.heightmap.textures;
    ok(!!tx && tx.changed, "the stroke repainted the world textures", tx || (r && r.error));
    const m0 = readTex(m, NAMES[0]);
    const painted = []; for (let Y = 0; Y < 8; Y++) for (let X = 18; X < 24; X++) painted.push(Y * TW + X);
    const sea = painted.filter((i) => near([m0.rgba[i * 4], m0.rgba[i * 4 + 1], m0.rgba[i * 4 + 2]], SEA_RGB, 25));
    ok(!sea.length, "…and none of the 48 texels it made land is still painted as sea", sea.length);
    const mm = r && r.heightmap && r.heightmap.minimap;
    ok(!!mm && mm.changed && mm.texels > 0, "…and the stroke repainted the minimap too", mm);
  }

  console.log("\n-- a small hand-made change is not called another map --");
  {
    // An add-on that retypes one small corner of its map by hand disagrees with the colour map it inherits on a few
    // texels, as Millennium Dawn does with its own (0.26%). That is below the line: no warning, and Auto-fix does not
    // copy 19 MB of pictures into the mod to repaint four texels.
    const m = mkMod();
    write(m, "map/definition.csv", fs.readFileSync(path.join(game, "map", "definition.csv"), "utf8").replace("7;50;50;50;land;true;plains;1", "7;50;50;50;sea;false;ocean;0"));
    const o = md.worldTexturesOutOfStep(G(m));
    ok(!!o && o.differ === 4 && o.share < md.WORLD_TEXTURE_STALE_SHARE, `the islet made sea disagrees on ${o && o.differ} texels (${o && (100 * o.share).toFixed(1)}%)`, o);
    ok(!md.validateMapBitmap(G(m)).some((q) => q.rule === "world_textures_painted_for_another_map"), "…and Map Errors does not call that another map");
    const fx = md.fixWorldTexturesPaintedForAnotherMap(G(m));
    ok(!fx.changed && !fs.existsSync(path.join(m, "map", "terrain")), "…nor does Auto-fix's step copy the pictures in", fx);
    const om = md.minimapOutOfStep(G(m));
    ok(!!om && om.differ >= 1 && om.share < md.MINIMAP_STALE_SHARE, `the minimap disagrees on ${om && om.differ} of its ${om && om.texels} points — under the line too`, om);
    ok(!md.validateMapBitmap(G(m)).some((q) => q.rule === "minimap_drawn_for_another_map") && !md.fixMinimapDrawnForAnotherMap(G(m)).changed && !fs.existsSync(path.join(m, "gfx")),
      "…so no minimap warning, and nothing copied in");
  }

  console.log("\n-- ⭐ a world built before the writer existed is reported, repaired once, and then quiet --");
  {
    // What TEST 26–29 are: the map reshaped (here, the whole coast drowned: 12.5% of the texels) and the textures
    // inherited. ⚠️ Only the coast: drown the city too and it is an inland sea, which Auto-fix raises back to land — and
    // that raise repaints the textures through the sink, so this step would never be what did it.
    const m = mkMod();
    write(m, "map/definition.csv", fs.readFileSync(path.join(game, "map", "definition.csv"), "utf8").replace("2;200;0;0;land;true;plains;1", "2;200;0;0;sea;false;ocean;0"));
    write(m, "map/heightmap.bmp", bmp8(W, H, (x, y) => { const p = provAt(x, y); return p === 1 || p === 2 || p === 5 ? 89 : 106; }));
    const probs = md.validateMapBitmap(G(m));
    const p = probs.find((q) => q.rule === "world_textures_painted_for_another_map");
    ok(!!p && p.severity === "warning" && p.autoFix === true, "Map Errors says the colours were painted for another map", p);
    ok(!L.isFatalRule("world_textures_painted_for_another_map"), "…as a warning: TEST 26 played nine months like this");
    const fx = md.autoFixMap(G(m));
    ok(fx && fx.fixes && fx.fixes.worldTextures && fx.fixes.worldTextures.changed, "Auto-fix repaints them", fx && fx.fixes && fx.fixes.worldTextures);
    const m0 = readTex(m, NAMES[0]);
    const coast = texelOfProvince(2).filter((i) => !near([m0.rgba[i * 4], m0.rgba[i * 4 + 1], m0.rgba[i * 4 + 2]], SEA_RGB, 12));
    ok(!coast.length, "…and the drowned coast is painted as sea", coast.length);
    const after = md.validateMapBitmap(G(m));
    ok(!after.some((q) => q.rule === "world_textures_painted_for_another_map"), "…and Map Errors is quiet afterwards");
    ok(fx.fixes.minimap && fx.fixes.minimap.changed && fs.existsSync(path.join(m, "gfx", "minimap", "minimap.dds")), "…and repaints the minimap on its own step", fx.fixes.minimap);
    ok(!after.some((q) => q.rule === "minimap_drawn_for_another_map"), "…whose warning is gone too");
    const snap = hashDir(path.join(m, "map", "terrain")), miniSnap = sha(fs.readFileSync(path.join(m, "gfx", "minimap", "minimap.dds")));
    const fx2 = md.autoFixMap(G(m));
    ok(JSON.stringify(hashDir(path.join(m, "map", "terrain"))) === JSON.stringify(snap) && sha(fs.readFileSync(path.join(m, "gfx", "minimap", "minimap.dds"))) === miniSnap,
      "⭐ a second Auto-fix leaves every texture and the minimap byte-identical", fx2 && fx2.fixes && [fx2.fixes.worldTextures, fx2.fixes.minimap]);
  }

  console.log("\n-- ⭐ a world that owns its colour pictures but still shows Earth on its minimap (TEST 30) --");
  {
    // TEST 30's colour pictures are its own; its minimap was the base game's, 46.5% in agreement. The colour-picture rule
    // is rightly quiet about a picture the mod owns, so the minimap needs its own answer.
    const m = mkMod();
    write(m, "map/definition.csv", fs.readFileSync(path.join(game, "map", "definition.csv"), "utf8").replace("2;200;0;0;land;true;plains;1", "2;200;0;0;sea;false;ocean;0"));
    write(m, "map/heightmap.bmp", bmp8(W, H, (x, y) => { const p = provAt(x, y); return p === 1 || p === 2 || p === 5 ? 89 : 106; }));
    for (const n of NAMES) write(m, "map/terrain/" + n, fs.readFileSync(path.join(game, "map", "terrain", n)));
    const probs = md.validateMapBitmap(G(m));
    ok(!probs.some((q) => q.rule === "world_textures_painted_for_another_map") && probs.some((q) => q.rule === "minimap_drawn_for_another_map"),
      "Map Errors leaves the owned colour pictures alone and names the minimap", probs.filter((q) => /minimap|world_textures/.test(q.rule)).map((q) => q.rule));
    ok(!L.isFatalRule("minimap_drawn_for_another_map"), "…as a warning");
    const r = md.fixMinimapDrawnForAnotherMap(G(m));
    const mMini = readMini(m);
    const coastPts = []; for (let v = 0; v < MH; v++) for (let u = 0; u < MW; u++) if (miniLandShare(u, v) === 1 && miniLandShare(u, v, (x, y) => { const p = provAt(x, y); return p !== 1 && p !== 5 && p !== 2; }) === 0) coastPts.push(v * MW + u);
    ok(r.changed && coastPts.every((i) => near([mMini.rgba[i * 4], mMini.rgba[i * 4 + 1], mMini.rgba[i * 4 + 2]], MINI_SEA, 8)), "…and Auto-fix's step repaints the drowned coast as sea on it", r);
    const again = md.fixMinimapDrawnForAnotherMap(G(m));
    ok(!again.changed, "…once", again);
  }

  console.log("\n-- a mod that inherits its map is never given textures --");
  {
    const m = mkMod();
    const r = md.repaintWorldTextures(G(m));
    ok(!r.changed && /inherits its map/.test(String(r.reason)) && !fs.existsSync(path.join(m, "map")), "the writer declines and writes nothing", r);
    const probs = md.validateMapBitmap(G(m));
    ok(!probs.some((q) => q.rule === "world_textures_painted_for_another_map"), "…and Map Errors has nothing to say about it");
  }

  console.log("\n-- ⭐ the rule does not cry wolf on a shipping map --");
  {
    // Every installed map mod, found on disk, read only. They either paint their own colour map (nothing to judge) or
    // disagree with the one they inherit on well under the line — Millennium Dawn's 0.26% was the corpus's worst.
    const GAME = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV", WS = "D:/SteamLibrary/steamapps/workshop/content/394360";
    if (!fs.existsSync(path.join(GAME, "map", "provinces.bmp")) || !fs.existsSync(WS)) console.log("  ..   skipped: the base game or the workshop is not installed here");
    else {
      const maps = fs.readdirSync(WS).map((e) => path.join(WS, e)).filter((r) => fs.existsSync(path.join(r, "map", "definition.csv")) || fs.existsSync(path.join(r, "map", "provinces.bmp")));
      const loud = [];
      for (const r of maps) {
        const o = md.worldTexturesOutOfStep({ modRoot: r, gameRoot: GAME, dependencyRoots: [] });
        if (o && o.share > md.WORLD_TEXTURE_STALE_SHARE) loud.push({ mod: path.basename(r), share: o.share });
      }
      ok(maps.length > 0 && !loud.length, `none of the ${maps.length} installed map mods is told its colours are another map's`, loud);
      const loudMini = [];
      for (const r of maps) {
        const o = md.minimapOutOfStep({ modRoot: r, gameRoot: GAME, dependencyRoots: [] });
        if (o && o.share > md.MINIMAP_STALE_SHARE) loudMini.push({ mod: path.basename(r), share: o.share });
      }
      ok(!loudMini.length, "…nor that its minimap is", loudMini);
    }
  }

  console.log("\n-- ⭐ an add-on of a map mod that ships only some of the pictures (review of d6ccba7) --");
  {
    // Millennium Dawn, MDC, Road to 56 and Rise of Nations ship their own colour map and water tint but not the fog map,
    // which comes from the base game under them. Asking one layer for all three refused every add-on of them — and Map
    // Errors still told the modder to click Auto-fix, for a repaint the writer would never do.
    const dep = tmp("dep");
    write(dep, "descriptor.mod", 'name="map mod"\n');
    for (const f of ["provinces.bmp", "definition.csv", "terrain.bmp", "heightmap.bmp"]) write(dep, "map/" + f, fs.readFileSync(path.join(game, "map", f)));
    for (const n of [NAMES[0], NAMES[1]]) write(dep, "map/terrain/" + n, fs.readFileSync(path.join(game, "map", "terrain", n)));
    const D = (m) => ({ modRoot: m, gameRoot: game, dependencyRoots: [dep] });
    const m = mkMod();
    const r = md.flipProvinceToSea({ ...D(m), provinceId: 2 });
    const tx = r && r.heightmap && r.heightmap.textures;
    ok(!!tx && tx.changed, "an erase in the add-on repaints the pictures, learning the fog map from the base game under the map mod", tx);
    const has = fs.existsSync(path.join(m, "map", "terrain", NAMES[0]));
    const m0 = has ? readTex(m, NAMES[0]) : null;
    const off = m0 ? texelOfProvince(2).filter((i) => !near([m0.rgba[i * 4], m0.rgba[i * 4 + 1], m0.rgba[i * 4 + 2]], SEA_RGB, 12)) : ["no colour map"];
    ok(!off.length, "…and the drowned coast is painted as the map mod's sea", off.length);
    // …and where the writer genuinely cannot repaint, Map Errors does not offer Auto-fix at all
    const bad = tmp("dep-bad");
    write(bad, "descriptor.mod", 'name="odd map mod"\n');
    for (const f of ["provinces.bmp", "definition.csv", "terrain.bmp", "heightmap.bmp"]) write(bad, "map/" + f, fs.readFileSync(path.join(game, "map", f)));
    write(bad, "map/terrain/" + NAMES[0], makeDds(TW / 2, TH / 2, "RGB32", 1, () => [...SEA_RGB, 0]));   // a colour map of the wrong size
    const m2 = mkMod();
    write(m2, "map/definition.csv", fs.readFileSync(path.join(game, "map", "definition.csv"), "utf8").replace("2;200;0;0;land;true;plains;1", "2;200;0;0;sea;false;ocean;0"));
    const B = { modRoot: m2, gameRoot: game, dependencyRoots: [bad] };
    ok(!md.validateMapBitmap(B).some((q) => q.rule === "world_textures_painted_for_another_map"), "a colour map the writer refuses is not reported as one Auto-fix repairs");
  }

  console.log("\n-- ⭐ a light out at sea that no edit came near is left alone (review of d6ccba7) --");
  {
    // The base game has 244 lit water texels further than 8 from any lit land. The harbour-glow pass put out every one of
    // them on any edit anywhere, re-encoding blocks 1,309 texels from an erase.
    const g2 = makeGame();
    const cmFile = path.join(g2, "map", "terrain", NAMES[0]);
    const b = fs.readFileSync(cmFile), h = dds.parseDdsHeader(b), rgba = dds.decodeDdsLevel(b, h, 0), dirty = new Uint8Array(TW * TH);
    const lamp = 5 * TW + 5;
    rgba[lamp * 4 + 3] = 150; dirty[lamp] = 1;
    dds.patchDdsLevel(b, h, 0, rgba, dirty); fs.writeFileSync(cmFile, b);
    const m = mkMod();
    md.flipProvinceToSea({ modRoot: m, gameRoot: g2, dependencyRoots: [], provinceId: 2 });
    const m0 = readTex(m, NAMES[0]);
    ok(m0.rgba[lamp * 4 + 3] === 150, "the lit texel far out in the open sea is still lit after an erase on the coast", m0.rgba[lamp * 4 + 3]);
  }

  console.log("\n-- ⭐ an empty ocean keeps no lights (#an-empty-ocean-keeps-no-lights) --");
  {
    // The rule above keeps the base game's own far lights through every edit that leaves land: they belong to coasts it did not
    // touch. A write that leaves NO land has no coast for any of them to belong to — and Delete map kept all 244 of vanilla's,
    // 153 of which TEST 32's world still showed in an ocean of its own, 86 farther from any land than a shipping map lights its sea.
    // Two lamps far out in the open sea, as the case above lays one: L1 19 texels from the coast that goes under, L2 on the map's
    // west edge, outside every window an erase of the coast would read.
    const lampGame = () => {
      const g = makeGame(), f = path.join(g, "map", "terrain", NAMES[0]);
      const b = fs.readFileSync(f), h = dds.parseDdsHeader(b), rgba = dds.decodeDdsLevel(b, h, 0), dirty = new Uint8Array(TW * TH);
      for (const t of [L1, L2]) { rgba[t * 4 + 3] = 150; dirty[t] = 1; }
      dds.patchDdsLevel(b, h, 0, rgba, dirty); fs.writeFileSync(f, b);
      return g;
    };
    const L1 = 5 * TW + 5, L2 = 5 * TW + 0;
    const g2 = lampGame(), plain = makeGame();
    const G2 = (m) => ({ modRoot: m, gameRoot: g2, dependencyRoots: [] });
    const shapes = (m, g) => { for (const f of ["provinces.bmp", "definition.csv"]) write(m, "map/" + f, fs.readFileSync(path.join(g, "map", f))); return m; };
    const litOf = (rgba) => { let n = 0; for (let i = 0; i < TW * TH; i++) if (rgba[i * 4 + 3] > 0) n++; return n; };
    const alpha = (m) => readTex(m, NAMES[0]).rgba;
    // the fixture: both lamps lit, and each more than 8 texels (chessboard, a bound below the chamfer's) from every lit land
    // texel — so the d6ccba7 rule cannot be what puts them out, and every case below is the new rule or nothing
    const gA = readTex(g2, NAMES[0]).rgba;
    const litLand = []; for (let i = 0; i < TW * TH; i++) { const p = provAt(2 * (i % TW), 2 * Math.floor(i / TW)); if (gA[i * 4 + 3] > 0 && p !== 1 && p !== 5) litLand.push(i); }
    const gap = (t) => Math.min(...litLand.map((j) => Math.max(Math.abs(j % TW - t % TW), Math.abs(Math.floor(j / TW) - Math.floor(t / TW)))));
    ok(gA[L1 * 4 + 3] === 150 && gA[L2 * 4 + 3] === 150 && litLand.length > 0 && gap(L1) > 8 && gap(L2) > 8,
      `(the fixture: both lamps lit at 150, ${gap(L1)} and ${gap(L2)} texels from the nearest of ${litLand.length} lit land texels)`, { L1: gA[L1 * 4 + 3], L2: gA[L2 * 4 + 3], gaps: litLand.length ? [gap(L1), gap(L2)] : null });

    // A — the inherited path: the owner's flow, the map's shapes copied in and Delete map
    const a = shapes(mkMod(), g2), ctl = shapes(mkMod(), plain);
    const ba = md.blankMapToSea(G2(a));
    md.blankMapToSea({ modRoot: ctl, gameRoot: plain, dependencyRoots: [] });
    const aA = alpha(a), cA = alpha(ctl);
    ok(ba && ba.changed && ba.heightmap && ba.heightmap.textures && ba.heightmap.textures.inherited === true, "A: Delete map repainted the pictures the mod inherited", ba && (ba.error || ba.heightmap && ba.heightmap.textures));
    ok(aA[L1 * 4 + 3] === 0 && aA[L2 * 4 + 3] === 0 && litOf(aA) === 0, "⭐⭐ A: …and no light is left anywhere over the empty ocean, the far lamps included", { L1: aA[L1 * 4 + 3], L2: aA[L2 * 4 + 3], lit: litOf(aA) });
    let rgbOff = 0; for (let i = 0; i < TW * TH; i++) for (let k = 0; k < 3; k++) if (aA[i * 4 + k] !== cA[i * 4 + k]) rgbOff++;
    ok(rgbOff === 0, "A: …and only the light went: every colour is the one a game with no lamps gets from the same Delete map", rgbOff);

    // B — the windowed path: the mod owns its pictures (an erase first), then Delete map
    const b = shapes(mkMod(), g2);
    md.flipProvinceToSea({ ...G2(b), provinceId: 2 });
    const bA = alpha(b);
    ok(NAMES.every((n) => fs.existsSync(path.join(b, "map", "terrain", n))), "B: after an erase the mod owns all five pictures, so its next write is windowed", NAMES.filter((n) => !fs.existsSync(path.join(b, "map", "terrain", n))));
    ok(bA[L1 * 4 + 3] === 150 && bA[L2 * 4 + 3] === 150, "B: …and both far lamps survived that erase, which left land (the rule above)", [bA[L1 * 4 + 3], bA[L2 * 4 + 3]]);
    md.blankMapToSea(G2(b));
    const bB = alpha(b);
    ok(bB[L1 * 4 + 3] === 0 && bB[L2 * 4 + 3] === 0 && litOf(bB) === 0, "⭐⭐ B: …and Delete map on the pictures it owns puts out every light, the lamp outside an erase's window too", { L1: bB[L1 * 4 + 3], L2: bB[L2 * 4 + 3], lit: litOf(bB) });

    // B' — no land left: the window is the whole map, and the windowed repaint is the whole-map one byte for byte (mips too)
    const bp = shapes(mkMod(), g2);
    md.flipProvinceToSea({ ...G2(bp), provinceId: 2 });
    const csv = path.join(bp, "map", "definition.csv"), ids = [];
    fs.writeFileSync(csv, fs.readFileSync(csv, "utf8").split("\n").map((l) => { const c = l.split(";"); if (c.length >= 8 && c[0] !== "0" && c[4] === "land") { ids.push(+c[0]); c[4] = "sea"; c[5] = "false"; c[6] = "ocean"; c[7] = "0"; return c.join(";"); } return l; }).join("\n"));
    const model = md.buildMapModel({ ...G2(bp), cacheStableLayers: true });
    const hm = md.writeProvinceHeightmap({ ...G2(bp), provinceIds: ids, drowned: true, model });
    md.paintProvincesInTerrainBmp({ ...G2(bp), provinceIds: ids, model, crossed: hm._crossed });
    const twin = () => { const d = tmp("twin"); fs.cpSync(bp, d, { recursive: true }); return d; };
    const wA = twin(), wB = twin();
    const win = md.repaintWorldTextures({ ...G2(wA), model, crossed: hm._crossed });
    md.repaintWorldTextures({ ...G2(wB), model, crossed: hm._crossed, _wholeMap: true });
    const differ = NAMES.filter((n) => sha(fs.readFileSync(path.join(wA, "map", "terrain", n))) !== sha(fs.readFileSync(path.join(wB, "map", "terrain", n))));
    ok(ids.length > 0 && !!hm._crossed && win.changed && win.inherited === false, `B': the last ${ids.length} land provinces drowned by the height writer, and the pictures the mod owns repainted`, { ids, win, hm: hm.reason || hm.error });
    ok(!differ.length && litOf(alpha(wA)) === 0, "⭐ B': …windowed and over the whole map, the same bytes in all five pictures, mips and all — and nothing lit", { differ, lit: litOf(alpha(wA)) });

    // H — the map, not the button: erased by hand down to the islet, the lamps stay; erase the last land and they go
    const hh = shapes(mkMod(), g2);
    for (const p of [2, 3, 4, 6]) md.flipProvinceToSea({ ...G2(hh), provinceId: p });
    const h1 = alpha(hh);
    ok(h1[L1 * 4 + 3] === 150 && h1[L2 * 4 + 3] === 150, "⭐ H: four provinces erased by hand, the islet still land — both far lamps stay lit", [h1[L1 * 4 + 3], h1[L2 * 4 + 3]]);
    const r7 = md.flipProvinceToSea({ ...G2(hh), provinceId: 7 });
    const h2 = alpha(hh);
    ok(r7 && r7.changed && h2[L1 * 4 + 3] === 0 && h2[L2 * 4 + 3] === 0 && litOf(h2) === 0, "⭐⭐ H: …then the islet, the last land: no light is left over the water", { changed: r7 && r7.changed, L1: h2[L1 * 4 + 3], L2: h2[L2 * 4 + 3], lit: litOf(h2) });
  }

  console.log("\n-- ⭐ a picture the mod owns is not repainted as if it were inherited (review of d6ccba7) --");
  {
    // A mod holding its own water tint but not the colour map — a write that failed half way, or a mod that ships only
    // some. Its water was judged against the layer below as if it were inherited, and every repair shifted it again.
    const m = mkMod();
    write(m, "map/definition.csv", fs.readFileSync(path.join(game, "map", "definition.csv"), "utf8").replace("2;200;0;0;land;true;plains;1", "2;200;0;0;sea;false;ocean;0"));
    write(m, "map/heightmap.bmp", bmp8(W, H, (x, y) => { const p = provAt(x, y); return p === 1 || p === 2 || p === 5 ? 89 : 106; }));
    write(m, "map/terrain/" + NAMES[1], fs.readFileSync(path.join(game, "map", "terrain", NAMES[1])));
    const own = sha(fs.readFileSync(path.join(m, "map", "terrain", NAMES[1])));
    const r1 = md.fixWorldTexturesPaintedForAnotherMap(G(m));
    ok(r1.changed && !!r1.files[NAMES[0]], "the repair repaints the colour map the mod inherits", r1);
    ok(sha(fs.readFileSync(path.join(m, "map", "terrain", NAMES[1]))) === own, "…and leaves the water tint the mod owns byte-identical");
    const snap = hashDir(path.join(m, "map", "terrain"));
    md.fixWorldTexturesPaintedForAnotherMap(G(m));
    ok(JSON.stringify(hashDir(path.join(m, "map", "terrain"))) === JSON.stringify(snap), "…and a second repair changes nothing at all");
  }

  console.log("\n-- ⭐ DXT1 transparency survives a patch (review of d6ccba7) --");
  {
    // Hearts of Minecraft's fog/shine map is DXT1 and fully transparent: 180,224 blocks of c0 = c1 = 0, every index 3,
    // which three-colour mode reads as transparent black. The codec read them as opaque and wrote them back opaque.
    const b = makeDds(16, 8, "DXT1", 1, () => [0, 0, 0, 255]);
    const h = dds.parseDdsHeader(b);
    for (let k = 0; k < 8; k++) { b.writeUInt16LE(0, 128 + k * 8); b.writeUInt16LE(0, 128 + k * 8 + 2); b.writeUInt32LE(0xffffffff, 128 + k * 8 + 4); }
    const before = Buffer.from(b), rgba = dds.decodeDdsLevel(b, h, 0);
    ok(rgba.every((v, k) => k % 4 !== 3 || v === 0), "a three-colour block's index 3 reads as transparent");
    dds.patchDdsLevel(b, h, 0, rgba, new Uint8Array(16 * 8).fill(1));
    ok(Buffer.compare(b, before) === 0, "…and re-encoding what it read gives back the same bytes");
    // the first block's top two rows opaque (texels x 0..3, y 0..1), its bottom two still transparent
    const mixed = new Uint8Array(rgba); for (let y = 0; y < 2; y++) for (let x = 0; x < 4; x++) mixed.set([200, 60, 20, 255], (y * 16 + x) * 4);
    dds.patchDdsLevel(b, h, 0, mixed, new Uint8Array(16 * 8).fill(1));
    const back = dds.decodeDdsLevel(b, h, 0);
    const alphaAt = (x, y) => back[(y * 16 + x) * 4 + 3];
    ok(alphaAt(0, 0) === 255 && alphaAt(3, 1) === 255 && alphaAt(0, 2) === 0 && alphaAt(3, 3) === 0 && alphaAt(4, 0) === 0 && near([back[0], back[1], back[2]], [200, 60, 20], 10),
      "…and a block half opaque, half transparent keeps both halves", { a00: alphaAt(0, 0), a31: alphaAt(3, 1), a02: alphaAt(0, 2), a33: alphaAt(3, 3), a40: alphaAt(4, 0), rgb: [back[0], back[1], back[2]] });
  }

  console.log("\n-- the save says which pictures the mod has just taken a copy of --");
  {
    // heightmapNote names every file a click copied into the mod — about 19 MB more for these five. Lifted out of the page
    // CRLF-tolerantly and run, rather than grepped for.
    const MAP = fs.readFileSync(path.join(__dirname, "public", "map.js"), "utf8").replace(/\r\n/g, "\n");
    const s0 = MAP.indexOf("function heightmapNote(hm) {");
    const body = s0 < 0 ? "" : MAP.slice(s0, MAP.indexOf("\n  }\n", s0) + 4);
    let note = null; try { note = new Function(body + "\nreturn heightmapNote;")(); } catch (_) { note = null; }
    const said = typeof note === "function" ? note({ pixels: 1817, raised: false, materialized: true,
      textures: { changed: true, files: { [NAMES[0]]: { units: 888, materialized: true }, [NAMES[4]]: { units: 50, materialized: true }, [NAMES[1]]: { units: 3, materialized: false } } } }) : "";
    ok(said.includes("map/terrain/" + NAMES[0]) && said.includes("map/terrain/" + NAMES[4]), "the note names the pictures the click copied in", said);
    ok(!said.includes("map/terrain/" + NAMES[1]), "…and not one it only repainted, which the mod already had", said);
  }

  console.log("\n-- every height writer hands its mask to the texture writer --");
  {
    const src = stripJsComments(fs.readFileSync(path.join(__dirname, "map-data.js"), "utf8"));
    const bodies = [];
    for (let i = src.indexOf("writeWorldNormalFromHeightmap("); i >= 0; i = src.indexOf("writeWorldNormalFromHeightmap(", i + 1)) {
      if (src.slice(Math.max(0, i - 9), i) === "function ") continue;
      const f = src.lastIndexOf("\nfunction ", i), e = src.indexOf("\nfunction ", i);
      bodies.push(src.slice(f + 1, e < 0 ? undefined : e));
    }
    ok(bodies.length >= 2, `found the functions that rewrite heights and relight them (${bodies.length})`);
    const missing = bodies.filter((b) => !/repaintWorldTextures\(/.test(b)).map((b) => b.slice(9, b.indexOf("(")));
    ok(!missing.length, "…and every one of them repaints the world textures too", missing);
    const noMini = bodies.filter((b) => !/repaintMinimap\(/.test(b)).map((b) => b.slice(9, b.indexOf("(")));
    ok(!noMini.length, "…and the minimap", noMini);
    const sink = bodies.find((b) => b.startsWith("function sinkProvincesInHeightmap"));
    ok(!!sink && sink.indexOf("repaintWorldTextures(") > sink.indexOf("paintProvincesInTerrainBmp("), "…after the terrain painter, whose new index it reads");
  }
} catch (e) {
  ok(false, "threw: " + e.message + "\n" + e.stack);
} finally {
  for (const r of roots) { try { fs.rmSync(r, { recursive: true, force: true }); } catch (_) { /* scratch only */ } }
}
console.log("\n" + (fail ? "FAILED " + fail + "/" + (pass + fail) : "PASSED " + pass + "/" + pass));
process.exitCode = fail ? 1 : 0;
