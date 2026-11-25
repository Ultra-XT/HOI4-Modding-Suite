// ⏱ #an-erase-repaints-the-whole-world — A PICTURE THE MOD OWNS IS REPAINTED IN A WINDOW, AND IT IS THE SAME BYTES.
//
// Once a mod owns its five world textures, what an edit leaves stale is only what it moved across the waterline, yet
// repaintWorldTextures did whole-map work on every call: 0.8 s per single-province erase on the base game, paid once per
// province when the map page replays an erase stroke on Save. It now reads, paints, patches and compares only inside
// windows shown to hold every texel whose bytes can move (the long form is on repaintWorldTextures). A window that is
// one texel too small does not crash or warn: it leaves an old byte standing where the whole-map answer has a new one.
// So this pins the windowed path to the whole-map path (`_wholeMap`, the same writer over the whole world) byte for
// byte, on edits chosen to reach each window's edge:
//   · the codec: a windowed patch followed down a mip chain — odd tail included — equals a whole-level one, per format;
//   · a small world the mod owns the pictures of, in the base game's formats and in the others the corpus ships
//     (DXT1/DXT3/DXT5, 32- and 24-bit, mips on every picture, a size whose mip chain stops halving): erase a large coast
//     beside inland ground, a lone islet whose water reaches far, land touching the east edge and the west edge, a lit
//     city (its harbour glow goes out), raise a sea bay at the west edge as a new city (a core, and its glow), and raise
//     the islet back — and the same edits on a restyle the mod draws itself, learnt from itself over the whole map
//     (#a-restyled-world-keeps-its-own-colours), with full-size _1 and _2 water tints.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const md = require("./map-data.js");
const dds = require("./dds-codec.js");

let pass = 0, fail = 0;
const ok = (c, m, x) => {
  if (c) { pass++; console.log("  ok   " + m); }
  else { fail++; console.log("  FAIL " + m + (x !== undefined ? "   -> " + JSON.stringify(x).slice(0, 400) : "")); }
};
const roots = [];
const tmp = (tag) => { const d = fs.mkdtempSync(path.join(os.tmpdir(), "nova-texwin-" + tag + "-")); roots.push(d); return d; };
const write = (dir, rel, body) => { const p = path.join(dir, ...rel.split("/")); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, body); return p; };
const sha = (b) => crypto.createHash("sha1").update(b).digest("hex");
const copyDir = (src) => { const d = tmp("copy"); fs.cpSync(src, d, { recursive: true }); return d; };

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
/** A DDS of `format` (RGB32 | RGB24 | DXT1 | DXT3 | DXT5), `levels` mips (0 = the whole chain), painted by fn(x, y, level). */
function makeDds(W, H, format, levels, fn) {
  if (!levels) { levels = 1; for (let w = W, h = H; w > 1 || h > 1; w = Math.max(1, w >> 1), h = Math.max(1, h >> 1)) levels++; }
  const h = Buffer.alloc(128), compressed = format.startsWith("DXT"), bpp = format === "RGB24" ? 3 : 4;
  h.write("DDS ", 0, "latin1"); h.writeUInt32LE(124, 4);
  h.writeUInt32LE(0x1007 | (levels > 1 ? 0x20000 : 0) | (compressed ? 0x80000 : 0x8), 8);
  h.writeUInt32LE(H, 12); h.writeUInt32LE(W, 16);
  h.writeUInt32LE(compressed ? Math.max(1, Math.ceil(W / 4)) * Math.max(1, Math.ceil(H / 4)) * (format === "DXT1" ? 8 : 16) : W * bpp, 20);
  h.writeUInt32LE(levels, 28); h.writeUInt32LE(32, 76);
  if (compressed) { h.writeUInt32LE(0x4, 80); h.write(format, 84, "latin1"); }
  else if (bpp === 4) { h.writeUInt32LE(0x41, 80); h.writeUInt32LE(32, 88); h.writeUInt32LE(0xff0000, 92); h.writeUInt32LE(0xff00, 96); h.writeUInt32LE(0xff, 100); h.writeUInt32LE(0xff000000, 104); }
  else { h.writeUInt32LE(0x40, 80); h.writeUInt32LE(24, 88); h.writeUInt32LE(0xff0000, 92); h.writeUInt32LE(0xff00, 96); h.writeUInt32LE(0xff, 100); h.writeUInt32LE(0, 104); }
  h.writeUInt32LE(0x1000 | (levels > 1 ? 0x400008 : 0), 108);
  let size = 128, w = W, hh = H;
  for (let l = 0; l < levels; l++) { size += compressed ? Math.max(1, Math.ceil(w / 4)) * Math.max(1, Math.ceil(hh / 4)) * (format === "DXT1" ? 8 : 16) : w * hh * bpp; w = Math.max(1, w >> 1); hh = Math.max(1, hh >> 1); }
  const buf = Buffer.alloc(size); h.copy(buf);
  const hdr = dds.parseDdsHeader(buf);
  if (hdr.error) throw new Error("makeDds: " + hdr.error);
  for (let l = 0; l < hdr.levels; l++) {
    const { w: lw, h: lh } = hdr.lv[l], rgba = new Uint8Array(lw * lh * 4);
    for (let y = 0; y < lh; y++) for (let x = 0; x < lw; x++) rgba.set(fn(x, y, l), (y * lw + x) * 4);
    dds.patchDdsLevel(buf, hdr, l, rgba, new Uint8Array(lw * lh).fill(1));
  }
  return buf;
}
// deterministic texture detail, so every picture has something for a stale byte to disagree with
const jit = (x, y, s) => { let v = (x * 73856093) ^ (y * 19349663) ^ (s * 83492791); v = Math.imul(v ^ (v >>> 13), 1274126177); return ((v ^ (v >>> 16)) >>> 0) % 13; };

try {
  console.log("\n-- the codec: a windowed patch down a mip chain is the whole-level patch --");
  {
    // 44 x 20 halves to 22 x 10 and 11 x 5, then stops halving (11 → 5): the window follows the halving levels and hands
    // the odd tail to whole levels
    for (const f of ["RGB32", "RGB24", "DXT1", "DXT3", "DXT5"]) {
      const b0 = makeDds(44, 20, f, 0, (x, y, l) => [(x * 11 + l * 40) & 255, (y * 23 + x) & 255, (200 - x * 3) & 255, f === "DXT1" ? 255 : (60 + y * 9) & 255]);
      const h = dds.parseDdsHeader(b0);
      let same = 0, tried = 0, unitsSame = 0, changedSame = 0;
      for (const [rx0, ry0, rx1, ry1] of [[0, 0, 8, 4], [4, 4, 16, 12], [36, 16, 44, 20], [0, 0, 44, 20], [20, 8, 24, 12], [40, 0, 44, 4], [8, 12, 44, 20]]) {
        const rect = { x0: rx0, y0: ry0, x1: rx1, y1: ry1 };
        const rgba = dds.decodeDdsLevel(b0, h, 0), dirty = new Uint8Array(44 * 20);
        for (let y = ry0; y < ry1; y++) for (let x = rx0; x < rx1; x++) if ((x * 5 + y * 3) % 4 === 0) { dirty[y * 44 + x] = 1; const q = (y * 44 + x) * 4; rgba[q] = 255 - rgba[q]; rgba[q + 1] = (rgba[q + 1] + 90) & 255; rgba[q + 3] = f === "DXT1" ? 255 : (rgba[q + 3] + 77) & 255; }
        const whole = Buffer.from(b0), win = Buffer.from(b0), sw = { changed: false }, sn = { changed: false };
        const nw = dds.patchDdsWithMips(whole, h, rgba, dirty, null, sw);
        // the windowed call is handed values only inside its window, as repaintWorldTextures hands them
        const only = new Uint8Array(rgba.length);
        for (let y = ry0; y < ry1; y++) only.set(rgba.subarray((y * 44 + rx0) * 4, (y * 44 + rx1) * 4), (y * 44 + rx0) * 4);
        const nn = dds.patchDdsWithMips(win, h, only, dirty, rect, sn);
        tried++;
        if (Buffer.compare(whole, win) === 0) same++;
        if (nw === nn) unitsSame++;
        if (sw.changed === sn.changed && sw.changed === (Buffer.compare(whole, b0) !== 0)) changedSame++;
      }
      ok(same === tried && unitsSame === tried && changedSame === tried, `${f} (${h.levels} levels): ${tried} windows patched and followed down the chain give the whole-level bytes, units and change flag`, { same, unitsSame, changedSame, tried });
    }
    const b = makeDds(16, 8, "DXT5", 1, () => [10, 20, 30, 255]), h = dds.parseDdsHeader(b);
    let threw = false;
    try { dds.patchDdsLevel(b, h, 0, dds.decodeDdsLevel(b, h, 0), new Uint8Array(128), { x0: 2, y0: 0, x1: 8, y1: 4 }); } catch (_) { threw = true; }
    ok(threw, "a window that cuts a compressed block is refused rather than encoded from texels it was never given");
  }

  // ── a small world: 528 x 240 provinces.bmp, so every world texture is 264 x 120 — big enough that every window is a
  // strict part of the map (the widest reaches 41 texels past an edit), and a size whose mip chain stops halving at 33 ──
  //   1  sea (open)                    everywhere else
  //   2  land, the continent's west coast       90 <= x < 150, 30 <= y < 210
  //   3  land, the continent's inland (desert south of y 120)  150 <= x < 270, 30 <= y < 210
  //   4  urban, a lit city on the south coast    180 <= x < 216, 186 <= y < 210
  //   11 urban, a second lit city 12 texels east of it, kept: the harbour glow between the two stays lit when 4 goes
  //      out, and only a light OUTSIDE the erased city says so       238 <= x < 264, 192 <= y < 210
  //   8  land, a large east coast beside the inland         270 <= x < 336, 30 <= y < 210
  //   6  land touching the EAST edge          480 <= x < 528, 84 <= y < 150
  //   9  land touching the WEST edge          0 <= x < 36, 48 <= y < 138
  //   10 sea, a bay at the west edge          0 <= x < 36, 138 <= y < 174
  //   7  a lone islet, one texel, 35 from any other land     408 <= x < 410, 210 <= y < 212
  const PW = 528, PH = 240, TW = 264, TH = 120;
  const COL = { 1: [0, 0, 200], 2: [200, 0, 0], 3: [0, 200, 0], 4: [200, 200, 0], 6: [100, 50, 0], 7: [50, 50, 50], 8: [0, 120, 60], 9: [150, 0, 150], 10: [0, 90, 210], 11: [220, 120, 20] };
  const provAt = (x, y) => (
    x >= 408 && x < 410 && y >= 210 && y < 212 ? 7
      : x >= 480 && y >= 84 && y < 150 ? 6
        : x < 36 && y >= 48 && y < 138 ? 9
          : x < 36 && y >= 138 && y < 174 ? 10
            : y >= 30 && y < 210 && x >= 90 && x < 336
              ? (x < 150 ? 2 : x >= 270 ? 8 : x >= 180 && x < 216 && y >= 186 ? 4 : x >= 238 && x < 264 && y >= 192 ? 11 : 3)
              : 1);
  const TYPE = { 1: "sea", 10: "sea" };
  const IDX = { plains: 0, desert: 7, urban: 13, ocean: 15 };
  const idxAtPx = (x, y) => { const p = provAt(x, y); return TYPE[p] ? IDX.ocean : p === 4 || p === 11 ? IDX.urban : p === 3 && y >= 120 ? IDX.desert : IDX.plains; };
  const landPx = (x, y) => !TYPE[provAt(x, y)];
  const landT = (X, Y) => landPx(2 * X, 2 * Y);
  const cityT = (X, Y) => { const p = provAt(2 * X, 2 * Y); return p === 4 || p === 11; };
  const nearCity = (X, Y) => { for (let dy = -7; dy <= 7; dy++) for (let dx = -7; dx <= 7; dx++) { const x = X + dx, y = Y + dy; if (x >= 0 && y >= 0 && x < TW && y < TH && cityT(x, y)) return true; } return false; };
  const DEF = ["0;0;0;0;land;false;unknown;0",
    "1;0;0;200;sea;false;ocean;0", "2;200;0;0;land;true;plains;1", "3;0;200;0;land;false;plains;1", "4;200;200;0;land;true;urban;1",
    "6;100;50;0;land;true;plains;1", "7;50;50;50;land;true;plains;1", "8;0;120;60;land;true;plains;1", "9;150;0;150;land;true;plains;1",
    "10;0;90;210;sea;false;ocean;0", "11;220;120;20;land;true;urban;1", ""].join("\n");
  // the pictures the layer below paints for this map: city lights on the city and a harbour glow on the water beside it
  const paint = {
    colormap: (X, Y) => (landT(X, Y)
      ? (cityT(X, Y) ? [120 + jit(X, Y, 1), 110, 100, 173] : provAt(2 * X, 2 * Y) === 3 && 2 * Y >= 120 ? [210, 180 + jit(X, Y, 2), 110, 0] : [150 + jit(X, Y, 3), 120, 60 + jit(X, Y, 4), 0])
      : [79 + jit(X, Y, 5), 102, 141, nearCity(X, Y) ? 60 : 0]),
    water: (X, Y) => (landT(X, Y) ? [60, 70 + jit(X, Y, 6), 60, 255] : [35 + jit(X, Y, 7), 59, 81 - (X % 7), 255]),
    fow: (X, Y) => (landT(X, Y) ? [140 + jit(X, Y, 8), 140 + jit(X, Y, 8), 140 + jit(X, Y, 8), 21] : [90, 90, 90, 40 + jit(X, Y, 9)]),
  };
  // …and a restyle of them the mod draws itself, learnt from ITSELF over the whole map before the write
  // (#a-restyled-world-keeps-its-own-colours): a grey land, a red sea, a saturated blue water tint, a brighter fog
  const restyle = {
    colormap: (X, Y) => (landT(X, Y) ? (cityT(X, Y) ? [60, 60, 200, 173] : [120 + jit(X, Y, 3), 120, 120, 0]) : [200 + jit(X, Y, 5), 60, 30, nearCity(X, Y) ? 60 : 0]),
    water: (X, Y) => [45 + jit(X, Y, 7), 67, 247 - (X % 7), 255],
    fow: (X, Y) => (landT(X, Y) ? [180, 180, 180, 12] : [70, 70, 70, 38 + jit(X, Y, 9)]),
  };
  const NAMES = ["colormap_rgb_cityemissivemask_a.dds", "colormap_water_0.dds", "colormap_water_1.dds", "colormap_water_2.dds", "fow_rgb_waterspec_a.dds"];
  const VARIANTS = [
    { name: "the base game's formats (32-bit colour map, DXT5 tints, DXT5 fog with its mip chain)", fmt: [["RGB32", 1], ["DXT5", 1], ["DXT5", 1], ["DXT5", 1], ["DXT5", 0]] },
    { name: "the corpus's other formats, mips on every picture (DXT5 colour map, DXT1 / DXT3 / 32-bit tints, 24-bit fog)", fmt: [["DXT5", 0], ["DXT1", 0], ["DXT3", 0], ["RGB32", 0], ["RGB24", 0]] },
    // Hearts of Minecraft's shape: its own pictures in formats the game's are not, its _1 and _2 full-size copies of _0
    { name: "a restyled world the mod draws itself (DXT5 colour map, 32-bit tints with _1 and _2 full-size, 24-bit fog)", fmt: [["RGB32", 1], ["DXT5", 1], ["DXT5", 1], ["DXT5", 1], ["DXT5", 0]],
      own: [["DXT5", 0], ["RGB32", 1], ["RGB32", 1], ["RGB32", 1], ["RGB24", 0]] },
  ];
  const makeGame = (v) => {
    const g = tmp("game");
    write(g, "hoi4.exe", "");
    write(g, "map/provinces.bmp", bmp24(PW, PH, (x, y) => COL[provAt(x, y)]));
    write(g, "map/definition.csv", DEF);
    write(g, "map/terrain.bmp", bmp8(PW, PH, idxAtPx));
    write(g, "map/heightmap.bmp", bmp8(PW, PH, (x, y) => (landPx(x, y) ? 106 : 89)));
    write(g, "common/terrain/00_terrain.txt", [
      "categories = {", "  plains = { color = { 200 200 100 } }", "  urban = { color = { 120 110 100 } }", "  desert = { color = { 210 180 110 } }",
      "  ocean = { color = { 0 0 200 } is_water = yes }", "}",
      "terrain = {", "  plains = { type = plains color = { 0 } }", "  desert = { type = desert color = { 7 } }", "  urban = { type = urban color = { 13 } }", "  ocean = { type = ocean color = { 15 } }", "}", ""].join("\n"));
    const [cm, w0, w1, w2, fw] = v.fmt;
    write(g, "map/terrain/" + NAMES[0], makeDds(TW, TH, cm[0], cm[1], (x, y, l) => paint.colormap(x << l, y << l)));
    write(g, "map/terrain/" + NAMES[1], makeDds(TW, TH, w0[0], w0[1], (x, y, l) => paint.water(x << l, y << l)));
    write(g, "map/terrain/" + NAMES[2], makeDds(TW / 2, TH / 2, w1[0], w1[1], (x, y, l) => paint.water(x << (l + 1), y << (l + 1))));
    write(g, "map/terrain/" + NAMES[3], makeDds(TW / 4, TH / 4, w2[0], w2[1], (x, y, l) => paint.water(x << (l + 2), y << (l + 2))));
    write(g, "map/terrain/" + NAMES[4], makeDds(TW, TH, fw[0], fw[1], (x, y, l) => paint.fow(x << l, y << l)));
    return g;
  };

  // the two results agree in every field but `windowed`, which says how each one worked: the call left to itself in a window, the
  // `_wholeMap` one over the whole map (review R8 — the mixed case, a mod owning some pictures, reads this field)
  const sameResult = (win, whole) => { const strip = (o) => { const c = { ...o }; delete c.windowed; return c; }; return win.windowed === true && whole.windowed === false && JSON.stringify(strip(win)) === JSON.stringify(strip(whole)); };
  for (const v of VARIANTS) {
    console.log(`\n-- ⭐ ${v.name}: every edit, windowed and over the whole map, writes the same bytes --`);
    const game = makeGame(v);
    const G = (m) => ({ modRoot: m, gameRoot: game, dependencyRoots: [] });
    // the mod OWNS its pictures: that is the windowed path (a mod that inherits them is repaired over the whole map)
    const start = tmp("mod");
    write(start, "descriptor.mod", 'version="1.0"\nname="owned world textures"\n');
    if (!v.own) for (const n of NAMES) write(start, "map/terrain/" + n, fs.readFileSync(path.join(game, "map", "terrain", n)));
    else {
      const [cm, w0, w1, w2, fw] = v.own;
      write(start, "map/terrain/" + NAMES[0], makeDds(TW, TH, cm[0], cm[1], (x, y, l) => restyle.colormap(x << l, y << l)));
      for (const [n, f] of [[NAMES[1], w0], [NAMES[2], w1], [NAMES[3], w2]]) write(start, "map/terrain/" + n, makeDds(TW, TH, f[0], f[1], (x, y, l) => restyle.water(x << l, y << l)));
      write(start, "map/terrain/" + NAMES[4], makeDds(TW, TH, fw[0], fw[1], (x, y, l) => restyle.fow(x << l, y << l)));
    }
    // One edit, driven as sinkProvincesInHeightmap drives it (retype, heights and their mask, the terrain painter), then
    // the texture writer twice on two copies of that one state: windowed, and over the whole map.
    const edit = (from, pid, raise, terrain) => {
      const d = copyDir(from);
      if (raise) {
        const csv = path.join(d, "map", "definition.csv");
        const text = fs.existsSync(csv) ? fs.readFileSync(csv, "utf8") : DEF;
        const row = text.split("\n").find((l) => l.split(";")[0] === String(pid)).split(";");
        row[4] = "land"; row[6] = terrain; row[7] = "1";
        write(d, "map/definition.csv", text.split("\n").map((l) => (l.split(";")[0] === String(pid) ? row.join(";") : l)).join("\n"));
      } else {
        const r = md.setProvinceDefinition({ ...G(d), provinceId: pid, type: "sea", terrain: "ocean", coastal: false, continent: 0 });
        if (!r.changed) throw new Error(`retyping ${pid} failed: ${r.error}`);
      }
      const model = md.buildMapModel({ ...G(d), cacheStableLayers: true });
      const hm = md.writeProvinceHeightmap({ ...G(d), provinceIds: [pid], raise, drowned: !raise, model });
      if (!hm._crossed) throw new Error(`province ${pid}: the height writer moved nothing (${hm.reason || hm.error})`);
      md.paintProvincesInTerrainBmp({ ...G(d), provinceIds: [pid], model, crossed: hm._crossed });
      const A = copyDir(d), B = copyDir(d);
      const win = md.repaintWorldTextures({ ...G(A), model, crossed: hm._crossed });
      const whole = md.repaintWorldTextures({ ...G(B), model, crossed: hm._crossed, _wholeMap: true });
      const differ = NAMES.filter((n) => sha(fs.readFileSync(path.join(A, "map", "terrain", n))) !== sha(fs.readFileSync(path.join(B, "map", "terrain", n))));
      const moved = NAMES.filter((n) => sha(fs.readFileSync(path.join(A, "map", "terrain", n))) !== sha(fs.readFileSync(path.join(d, "map", "terrain", n))));
      return { A, win, whole, differ, moved };
    };
    const steps = [
      ["erase 8, a large east coast beside inland ground", 8, false],
      ["erase 7, a lone islet whose water reaches far", 7, false],
      ["erase 6, land touching the east edge", 6, false],
      ["erase 9, land touching the west edge", 9, false],
      ["erase 4, a lit city — its lights and its harbour glow go out", 4, false],
      ["raise 10, a sea bay at the west edge, as a new city (a core and its glow)", 10, true, "urban"],
      ["raise 7 back, the islet", 7, true, "plains"],
    ];
    let state = start;
    for (const [what, pid, raise, terrain] of steps) {
      const r = edit(state, pid, raise, terrain);
      ok(r.win.changed && r.win.inherited === false && r.moved.length >= 3, `${what}: the windowed repaint rewrote the mod's own pictures (${r.moved.length} of 5)`, { win: r.win, moved: r.moved });
      ok(!r.differ.length && sameResult(r.win, r.whole), "…and every byte of all five, and the result, is what the whole-map repaint gives (the one in a window, the other not)", { differ: r.differ, win: r.win, whole: r.whole });
      state = r.A;   // the next edit starts from this one's result, as a stroke does
    }
  }

  // ── Two worlds built to sit exactly ON a window's margin (review of the windowed repaint): with the windows cut to the
  // widths a mutant chose — the fog's distance-from-water window 41 → 30, the lit/core window 18 → 14, the city-core window
  // built from the glow's — the test above still passed, and these two worlds wrote different bytes. ──
  const marginWorld = (label, mapAt, eraseId) => {
    console.log(`\n-- ⭐ ${label}: the windowed repaint still writes the whole-map bytes --`);
    const MDEF = ["0;0;0;0;land;false;unknown;0", "1;0;0;200;sea;false;ocean;0", "2;200;0;0;land;true;plains;1", "3;0;200;0;land;true;plains;1",
      "4;200;200;0;land;true;urban;1", "11;220;120;20;land;true;urban;1", ""].join("\n");
    const land = (x, y) => mapAt(x, y) !== 1;
    const landT2 = (X, Y) => land(2 * X, 2 * Y);
    const city = (X, Y) => { const p = mapAt(2 * X, 2 * Y); return p === 4 || p === 11; };
    const nearC = (X, Y) => { for (let dy = -7; dy <= 7; dy++) for (let dx = -7; dx <= 7; dx++) { const x = X + dx, y = Y + dy; if (x >= 0 && y >= 0 && x < TW && y < TH && city(x, y)) return true; } return false; };
    const pic = {
      colormap: (X, Y) => (landT2(X, Y) ? (city(X, Y) ? [120 + jit(X, Y, 1), 110, 100, 173] : [150 + jit(X, Y, 3), 120, 60 + jit(X, Y, 4), 0]) : [79 + jit(X, Y, 5), 102, 141, nearC(X, Y) ? 60 : 0]),
      water: (X, Y) => (landT2(X, Y) ? [60, 70 + jit(X, Y, 6), 60, 255] : [35 + jit(X, Y, 7), 59, 81 - (X % 7), 255]),
      fow: (X, Y) => (landT2(X, Y) ? [140 + jit(X, Y, 8), 140 + jit(X, Y, 8), 140 + jit(X, Y, 8), 21] : [90 + (X % 5), 90 + (X % 5), 90 + (X % 5), 40 + jit(X, Y, 9)]),
    };
    const g = tmp("margin-game");
    write(g, "hoi4.exe", "");
    write(g, "map/provinces.bmp", bmp24(PW, PH, (x, y) => COL[mapAt(x, y)]));
    write(g, "map/definition.csv", MDEF);
    write(g, "map/terrain.bmp", bmp8(PW, PH, (x, y) => { const p = mapAt(x, y); return p === 1 ? IDX.ocean : p === 4 || p === 11 ? IDX.urban : IDX.plains; }));
    write(g, "map/heightmap.bmp", bmp8(PW, PH, (x, y) => (land(x, y) ? 106 : 89)));
    write(g, "common/terrain/00_terrain.txt", ["categories = {", "  plains = { color = { 200 200 100 } }", "  urban = { color = { 120 110 100 } }",
      "  ocean = { color = { 0 0 200 } is_water = yes }", "}", "terrain = {", "  plains = { type = plains color = { 0 } }", "  urban = { type = urban color = { 13 } }", "  ocean = { type = ocean color = { 15 } }", "}", ""].join("\n"));
    write(g, "map/terrain/" + NAMES[0], makeDds(TW, TH, "RGB32", 1, (x, y) => pic.colormap(x, y)));
    write(g, "map/terrain/" + NAMES[1], makeDds(TW, TH, "DXT5", 1, (x, y) => pic.water(x, y)));
    write(g, "map/terrain/" + NAMES[2], makeDds(TW / 2, TH / 2, "DXT5", 1, (x, y) => pic.water(x << 1, y << 1)));
    write(g, "map/terrain/" + NAMES[3], makeDds(TW / 4, TH / 4, "DXT5", 1, (x, y) => pic.water(x << 2, y << 2)));
    write(g, "map/terrain/" + NAMES[4], makeDds(TW, TH, "DXT5", 0, (x, y, l) => pic.fow(x << l, y << l)));
    const MG = (m) => ({ modRoot: m, gameRoot: g, dependencyRoots: [] });
    const mod = tmp("margin-mod");
    write(mod, "descriptor.mod", 'version="1.0"\nname="margins"\n');
    for (const n of NAMES) write(mod, "map/terrain/" + n, fs.readFileSync(path.join(g, "map", "terrain", n)));
    const r = md.setProvinceDefinition({ ...MG(mod), provinceId: eraseId, type: "sea", terrain: "ocean", coastal: false, continent: 0 });
    if (!r.changed) throw new Error(`retyping ${eraseId} failed: ${r.error}`);
    const model = md.buildMapModel({ ...MG(mod), cacheStableLayers: true });
    const hm = md.writeProvinceHeightmap({ ...MG(mod), provinceIds: [eraseId], drowned: true, model });
    if (!hm._crossed) throw new Error(`province ${eraseId}: the height writer moved nothing (${hm.reason || hm.error})`);
    md.paintProvincesInTerrainBmp({ ...MG(mod), provinceIds: [eraseId], model, crossed: hm._crossed });
    const A = copyDir(mod), B = copyDir(mod);
    const win = md.repaintWorldTextures({ ...MG(A), model, crossed: hm._crossed });
    const whole = md.repaintWorldTextures({ ...MG(B), model, crossed: hm._crossed, _wholeMap: true });
    const differ = NAMES.filter((n) => sha(fs.readFileSync(path.join(A, "map", "terrain", n))) !== sha(fs.readFileSync(path.join(B, "map", "terrain", n))));
    ok(win.changed && !differ.length && sameResult(win, whole), `erasing ${eraseId}: every byte of all five pictures, and the result, is what the whole-map repaint gives (the one in a window, the other not)`, { differ, win, whole });
  };
  // a 72-texel land strip, the erased coast on its west side, open water 38 texels east of a texel 35 texels east of the
  // erase: the fog reads its distance from water there, through a window that must reach past 40
  marginWorld("a long strip whose far coast sits just past the fog's window", (x, y) => { const X = x >> 1, Y = y >> 1; if (Y < 10 || Y >= 110) return 1; if (X >= 30 && X < 40) return 2; if (X >= 40 && X < 112) return 3; return 1; }, 2);
  // two lit city islands 15 texels apart across water, the west one erased: a water texel 7 from it and 8 from the kept
  // one stays lit, which only a window reaching 15 past the erase can see
  marginWorld("two lit cities 15 texels apart, one erased", (x, y) => { const X = x >> 1, Y = y >> 1; if (Y >= 50 && Y < 60 && X >= 100 && X < 110) return 4; if (Y >= 50 && Y < 60 && X >= 124 && X < 134) return 11; return 1; }, 4);
} catch (e) {
  ok(false, "threw: " + e.message + "\n" + e.stack);
} finally {
  for (const r of roots) { try { fs.rmSync(r, { recursive: true, force: true }); } catch (_) { /* scratch only */ } }
}
console.log("\n" + (fail ? "FAILED " + fail + "/" + (pass + fail) : "PASSED " + pass + "/" + pass));
process.exitCode = fail ? 1 : 0;
