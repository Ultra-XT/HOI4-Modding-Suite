// ⛔ #a-short-palette-puts-the-pixels-somewhere-else — WHERE A MAP BITMAP'S PIXELS START IS A FIELD IN THE
// FILE, NOT A NUMBER YOU CAN CARRY IN YOUR HEAD.
//
// An 8-bit BMP's pixel data begins at the offset byte 10 names, which is 14 + the DIB header's own length +
// biClrUsed × 4. Across the six maps installed here, every 8-bit map bitmap but one sits at 1074, 1078, 1142,
// 1158 or 1162 — all of them "54 + a 1024-byte palette", give or take a longer header. THE ONE IS OLD WORLD
// BLUES' map/terrain.bmp: it declares TWENTY-ONE palette entries, because its own common/terrain declares
// twenty-one graphical terrains, so its pixels start at byte 138. Reading it at 1078 lands 940 bytes into
// the image.
//
// ⭐ THE HOLE THIS FILE FILLS IS A HOLE IN THE TESTS, NOT IN THE CODE. Measured 2026-09-17 by driving the
// four bitmap writers over a copy of Old World Blues through the real endpoints, every one of them is
// already right: Delete map moved 4,171,410 heightmap bytes, 4,170,321 terrain bytes, 121,326 trees blocks
// and 968,943 normal-map bytes, and every file came back with its header AND ITS PALETTE byte-for-byte
// identical and its length unchanged. A paint stroke at (2961, 2052) — a row only this map has — moved
// bytes in exactly bitmap rows 2038..2066 of heightmap.bmp and terrain.bmp, 597..605 of trees.bmp and
// 1019..1033 of world_normal.bmp, which is that stroke mapped through each file's own scale.
//
// ⛔ BUT NOTHING PINNED IT. Counted from the sources on 2026-09-17, twenty-one test and e2e files build an
// 8-bit BMP fixture and every one of them declares `biClrUsed = 256`; not one is short, so every fixture's
// pixels start at 54 + 1024. Measured: replacing `buf.readUInt32LE(10)` in readIndexedBmp with that constant
// changes the verdict of exactly ONE of the thirteen map-bitmap tests — and that one only through its corpus
// section, which drives the installed game's own trees.bmp at 1162, so it would stay green on a machine with
// no game installed. The other twelve are unmoved: the terrain repaint, the relief, the beach, the rivers,
// the planter and the second raise all pass on their own fixtures, while the same change would write 940
// bytes into the image every time Auto-fix touched Old World Blues' terrain.bmp. That is the shape this
// project keeps meeting: a guard with the right name passing because it only ever asked about the easy case.
//
// The fixture below is that shape, deliberately: a terrain.bmp with a 124-byte V5 header and 21 palette
// entries (pixels at 222), a trees.bmp with a 40-byte header and 12 entries (pixels at 102), a heightmap
// with the ordinary 256 (pixels at 1078) and a 24-bit world_normal (pixels at 54) — four different answers
// in one mod, so no single constant can satisfy them. And the trees.bmp is at a NON-INTEGER scale, 2.5
// province pixels per block, because Old World Blues' is 3.4133 and both fixtures this suite already has
// are exactly 2.
//
// A CONTROL runs the identical assertions over the ordinary shape — every palette 256, the trees.bmp at a
// round 2 — so a failure here is "the short palette broke it" and never "the writer broke".
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const md = require("./map-data.js");

let pass = 0;
const fails = [];
const ok = (cond, label, detail) => {
  if (cond === true) { pass++; console.log("  ok   " + label); }
  else { fails.push(label); console.log("  FAIL " + label + (detail !== undefined ? "   -> " + JSON.stringify(detail).slice(0, 350) : "")); }
};

const GAME = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
const WORKSHOP = "D:/SteamLibrary/steamapps/workshop/content/394360/";
const CORPUS = {
  vanilla: GAME,
  "Millennium Dawn": WORKSHOP + "2777392649",
  "Road to 56": WORKSHOP + "820260968",
  "Old World Blues": WORKSHOP + "2265420196",
  "Novum Vexillum": WORKSHOP + "1827273767",
  "Rise of Nations": WORKSHOP + "2026448968",
};
// The 8-bit map bitmaps, taken from map-data's own list plus the one it holds to no size, so a bitmap added
// to either list joins this sweep without being typed in here.
const EIGHT_BIT = [...(md.MAP_BITMAPS_SIZED_LIKE_PROVINCES || []), ...(md.MAP_BITMAPS_HELD_TO_NO_SIZE || [])];

const tmps = [];
const NOGAME = path.join(os.tmpdir(), "nova-shortpal-nogame");

// ── the measuring kit, deliberately its own code ────────────────────────────────────────────────────────
/** A BMP's geometry straight out of its own header: nothing here may be shared with the writer under test. */
function head(file) {
  const buf = fs.readFileSync(file);
  const dataOffset = buf.readUInt32LE(10), dib = buf.readUInt32LE(14);
  const W = buf.readInt32LE(18), rawH = buf.readInt32LE(22);
  const H = Math.abs(rawH), up = rawH > 0, bpp = buf.readUInt16LE(28);
  const clrUsed = buf.readUInt32LE(46);
  const rowSize = Math.floor((bpp * W + 31) / 32) * 4;
  return { buf, dataOffset, dib, W, H, up, bpp, clrUsed, rowSize,
    off: (x, y) => dataOffset + (up ? (H - 1 - y) : y) * rowSize + x * (bpp / 8),
    at(x, y, c = 0) { return this.buf[this.off(x, y) + c]; } };
}
/** Which byte positions differ between two copies of one file, and which of them are outside the pixel data. */
function movedBytes(beforeBuf, afterFile) {
  const a = beforeBuf, b = fs.readFileSync(afterFile);
  const off = b.readUInt32LE(10);
  const moved = [];
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) if (a[i] !== b[i]) moved.push(i);
  return { a, b, off, moved, sameLength: a.length === b.length,
    headerIntact: a.length >= off && Buffer.compare(a.slice(0, off), b.slice(0, off)) === 0,
    outsidePixels: moved.filter((i) => i < off) };
}

// ══ 1. THE SHAPE IS REAL — the corpus, not an invention ═════════════════════════════════════════════════
console.log("\n=== 🈯 what the installed maps say about where their pixels start ===");
let installed = 0, shortPalettes = 0;
{
  for (const [name, root] of Object.entries(CORPUS)) {
    let sawOne = false;
    for (const f of EIGHT_BIT) {
      const p = path.join(root, "map", f);
      if (!fs.existsSync(p)) continue;
      sawOne = true;
      let h;
      try { h = head(p); } catch (_) { continue; }
      if (h.bpp !== 8) continue;
      const entries = h.clrUsed || 256;
      const derived = 14 + h.dib + entries * 4;
      console.log(`  ..   ${name} ${f}: ${h.W}x${h.H}  DIB ${h.dib}  palette ${entries}  pixels at ${h.dataOffset}`
        + (h.dataOffset === derived ? "" : `  ⚠️ not 14 + ${h.dib} + ${entries}×4 = ${derived}`));
      if (entries < 256) shortPalettes++;
      // The offset the file NAMES must be the offset its own header and palette IMPLY — otherwise nothing
      // below can be trusted, and it is the arithmetic readIndexedBmp does.
      ok(h.dataOffset === derived, `${name} ${f}: its pixel offset is 14 + DIB + palette×4`, { dataOffset: h.dataOffset, derived });
    }
    if (sawOne) installed++;
  }
  if (!installed) console.log("  ..   (no map is installed on this machine — the fixture below still carries the guard)");
  else ok(shortPalettes > 0, "⭐⭐ at least one shipping map declares FEWER than 256 palette entries — the fixture's shape is not invented", shortPalettes);
}

// ══ 2. THE FIXTURE — four bitmaps, four different pixel offsets ═════════════════════════════════════════
//
// 20x10 provinces, five 4-pixel-wide provinces: 1 sea · 2 land · 3 land · 4 land · 5 sea. Province 3 is the
// one retyped and sunk, so its 40 pixels are the exact set every writer below has to move and no others.
// ⚠️ The land height is DERIVED from the module's own waterline, not typed: the sink only touches a pixel
// above HEIGHTMAP_SEA_LEVEL, so a fixture that wrote a number below it would report "already below sea
// level" and every assertion after it would be measuring nothing. (HEIGHTMAP_LAND_VALUE is not exported;
// it does not need to be — anything above the threshold crosses.)
const SEA_LEVEL = md.HEIGHTMAP_SEA_LEVEL, SEA_VALUE = md.HEIGHTMAP_SEA_VALUE, LAND_VALUE = SEA_LEVEL + 11;
const W = 20, H = 10, NW = 10, NH = 5;
const KIND = { 1: "sea", 2: "land", 3: "land", 4: "land", 5: "sea" };
const COL = { 1: [10, 10, 10], 2: [20, 20, 20], 3: [30, 30, 30], 4: [40, 40, 40], 5: [50, 50, 50] };
const idAtX = (x) => Math.min(5, 1 + Math.floor(x / 4));
// This map PAINTS its sea with index 1 while its terrain table declares { 2 1 } for ocean, so a writer that
// takes the first DECLARED index instead of the one the map already uses writes 2 and is caught here — the
// same renumbering trap Old World Blues sets, where ocean is 1 and vanilla's 15 is its desert.
const OCEAN_PAINTED = 1, OCEAN_DECLARED_FIRST = 2, PLAINS_PAINTED = 3, PLAINS_OTHER = 4;
const WOOD = 6, BARE = 7;                       // ⚠️ bare is not 0: the vote has to find it

function bmp24(width, height, rgbFn) {
  const rowSize = Math.floor((24 * width + 31) / 32) * 4, imageSize = rowSize * height;
  const b = Buffer.alloc(54 + imageSize);
  b.write("BM", 0, "ascii");
  b.writeUInt32LE(b.length, 2); b.writeUInt32LE(54, 10); b.writeUInt32LE(40, 14);
  b.writeInt32LE(width, 18); b.writeInt32LE(height, 22); b.writeUInt16LE(1, 26);
  b.writeUInt16LE(24, 28); b.writeUInt32LE(0, 30); b.writeUInt32LE(imageSize, 34);
  for (let y = 0; y < height; y++) {
    let o = 54 + (height - 1 - y) * rowSize;
    for (let x = 0; x < width; x++) { const c = rgbFn(x, y); b[o++] = c[2]; b[o++] = c[1]; b[o++] = c[0]; }
  }
  return b;
}
/** An 8-bit BMP with EXACTLY `entries` palette entries and a DIB header of `dib` bytes — so its pixels start
 *  at 14 + dib + entries×4 and nowhere else. */
function bmp8(width, height, indexFn, entries, dib) {
  const rowSize = (width + 3) & ~3, imageSize = rowSize * height;
  const dataOffset = 14 + dib + entries * 4;
  const b = Buffer.alloc(dataOffset + imageSize);
  b.write("BM", 0, "ascii");
  b.writeUInt32LE(b.length, 2); b.writeUInt32LE(dataOffset, 10); b.writeUInt32LE(dib, 14);
  b.writeInt32LE(width, 18); b.writeInt32LE(height, 22); b.writeUInt16LE(1, 26);
  b.writeUInt16LE(8, 28); b.writeUInt32LE(0, 30); b.writeUInt32LE(imageSize, 34);
  b.writeUInt32LE(entries, 46); b.writeUInt32LE(entries, 50);
  for (let i = 0; i < entries; i++) { const o = 14 + dib + i * 4; b[o] = (i * 11) & 255; b[o + 1] = (i * 7) & 255; b[o + 2] = (i * 3) & 255; b[o + 3] = 0; }
  for (let y = 0; y < height; y++) { const row = dataOffset + (height - 1 - y) * rowSize; for (let x = 0; x < width; x++) b[row + x] = indexFn(x, y) & 255; }
  return b;
}

/** shape "short" = Old World Blues': a 21-entry V5 terrain table and a trees.bmp at 2.5 px per block.
 *  shape "full"  = everybody else's: 256 everywhere, trees.bmp at a round 2. */
function makeFixture(shape) {
  const short = shape === "short";
  const TR_W = short ? 8 : 10, TR_H = short ? 4 : 5;   // 20/8 = 2.5 and 10/4 = 2.5 · or a round 2
  const palTerrain = short ? 21 : 256, dibTerrain = short ? 124 : 40;
  const palTrees = short ? 12 : 256, dibTrees = 40;
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "nova-shortpal-")); tmps.push(d);
  fs.mkdirSync(path.join(d, "map"), { recursive: true });
  fs.mkdirSync(path.join(d, "common", "terrain"), { recursive: true });
  // replace_path="map" keeps every layer below out of it, so what the writers read is only what is written here.
  fs.writeFileSync(path.join(d, "descriptor.mod"), 'name="ShortPalette"\nreplace_path="map"\n');
  fs.writeFileSync(path.join(d, "common", "terrain", "00_terrain.txt"),
    "categories = {\n" +
    "\tocean = { is_water = yes naval_terrain = yes color = { 40 83 176 } }\n" +
    "\tplains = { color = { 200 200 100 } }\n" +
    "}\n" +
    "terrain = {\n" +
    `\tt_ocean  = { type = ocean  color = { ${OCEAN_DECLARED_FIRST} ${OCEAN_PAINTED} } texture = 9 }\n` +
    `\tt_plains = { type = plains color = { ${PLAINS_PAINTED} ${PLAINS_OTHER} } texture = 1 }\n` +
    "}\n");

  fs.writeFileSync(path.join(d, "map", "provinces.bmp"), bmp24(W, H, (x) => COL[idAtX(x)]));
  fs.writeFileSync(path.join(d, "map", "definition.csv"),
    ["0;0;0;0;land;false;unknown;0"].concat([1, 2, 3, 4, 5].map((i) =>
      `${i};${COL[i][0]};${COL[i][1]};${COL[i][2]};${KIND[i]};false;${KIND[i] === "land" ? "plains" : "ocean"};${KIND[i] === "land" ? 1 : 0}`)).join("\n") + "\n");
  fs.writeFileSync(path.join(d, "map", "heightmap.bmp"),
    bmp8(W, H, (x) => (KIND[idAtX(x)] === "land" ? LAND_VALUE : SEA_VALUE), 256, 40));
  fs.writeFileSync(path.join(d, "map", "terrain.bmp"),
    bmp8(W, H, (x) => (KIND[idAtX(x)] === "land" ? PLAINS_PAINTED : OCEAN_PAINTED), palTerrain, dibTerrain));
  // Vegetation everywhere except the two blocks that are open water and nothing else — those are what the
  // bare index has to be VOTED for from.
  const pureWater = (bx, by) => {
    for (let x = 0; x < W; x++) {
      if (Math.min(TR_W - 1, Math.floor(x * TR_W / W)) !== bx) continue;
      for (let y = 0; y < H; y++) {
        if (Math.min(TR_H - 1, Math.floor(y * TR_H / H)) !== by) continue;
        if (KIND[idAtX(x)] !== "sea") return false;
      }
    }
    return true;
  };
  fs.writeFileSync(path.join(d, "map", "trees.bmp"),
    bmp8(TR_W, TR_H, (bx, by) => (pureWater(bx, by) ? BARE : WOOD), palTrees, dibTrees));
  // A flat normal map, exactly half in both axes.
  fs.writeFileSync(path.join(d, "map", "world_normal.bmp"), bmp24(NW, NH, () => [128, 128, 255]));
  return { d, TR_W, TR_H, short };
}
const retype = (f, id, type, terrain) => {
  const p = path.join(f.d, "map", "definition.csv");
  const out = fs.readFileSync(p, "utf8").split("\n").map((l) => (l.split(";")[0] === String(id)
    ? l.split(";").map((c, i) => (i === 4 ? type : i === 6 ? terrain : i === 7 ? (type === "land" ? "1" : "0") : c)).join(";")
    : l));
  fs.writeFileSync(p, out.join("\n"));
};

/** Which trees.bmp block covers a province pixel, at THIS fixture's scale. */
const blockOf = (f, x, y) => Math.min(f.TR_H - 1, Math.floor(y * f.TR_H / H)) * f.TR_W + Math.min(f.TR_W - 1, Math.floor(x * f.TR_W / W));

function runShape(label, shape) {
  console.log(`\n=== ${label} ===`);
  const f = makeFixture(shape);
  const files = ["heightmap.bmp", "terrain.bmp", "trees.bmp", "world_normal.bmp"];
  const before = {};
  for (const n of files) before[n] = fs.readFileSync(path.join(f.d, "map", n));

  // ⭐ the four offsets are genuinely different, or this fixture proves nothing.
  const offs = files.map((n) => before[n].readUInt32LE(10));
  console.log("     pixel offsets: " + files.map((n, i) => n + "=" + offs[i]).join("  ")
    + "   trees " + f.TR_W + "x" + f.TR_H + " = " + (W / f.TR_W).toFixed(4) + " province px per block");
  ok(new Set(offs).size === (shape === "short" ? 4 : 2),
    shape === "short" ? "⭐ four bitmaps, four DIFFERENT pixel offsets — no one constant can read them all"
      : "the ordinary shape: the indexed three share one offset and the 24-bit one is at 54", offs);

  // ⭐ readIndexedBmp answers from the FILE, which is the arithmetic the whole thing rests on.
  for (const n of ["heightmap.bmp", "terrain.bmp", "trees.bmp"]) {
    const h = head(path.join(f.d, "map", n));
    const r = md.readIndexedBmp(before[n]);
    ok(!!r && r.dataOffset === h.dataOffset && r.palette.length === (h.clrUsed || 256) && r.dibSize === h.dib,
      `readIndexedBmp reads ${n}'s own offset (${h.dataOffset}) and palette (${h.clrUsed})`,
      r && { dataOffset: r.dataOffset, palette: r.palette.length, dibSize: r.dibSize });
  }

  // ── the write: province 3 becomes sea, and all four bitmaps follow it ─────────────────────────────────
  retype(f, 3, "sea", "ocean");
  const r = md.sinkProvincesInHeightmap({ modRoot: f.d, gameRoot: NOGAME, dependencyRoots: [], provinceIds: [3] });
  ok(r.changed === true && r.pixels === 40, "the sink moved province 3's 40 pixels", { changed: r.changed, pixels: r.pixels, reason: r.reason, error: r.error });
  ok(!!(r.terrain && r.terrain.changed && r.terrain.pixels === 40), "…and terrain.bmp followed it, 40 pixels", r.terrain);
  ok(!!(r.trees && r.trees.changed), "…and trees.bmp followed it", r.trees);
  ok(!!(r.normal && r.normal.changed), "…and world_normal.bmp followed it", r.normal);
  ok(!!(r.trees && r.trees.bare === BARE), "⭐ the bare index was VOTED for off this map's own open water, not typed as 0", r.trees && r.trees.bare);

  // ── ⛔ THE POINT: every byte that moved is INSIDE the pixel data the file's own header names ──────────
  for (const n of files) {
    const m = movedBytes(before[n], path.join(f.d, "map", n));
    ok(m.sameLength, `${n}: the file is the same length it was`, { was: m.a.length, now: m.b.length });
    ok(m.headerIntact, `⭐⭐ ${n}: its header and palette came through byte-identical`, { dataOffset: m.off, differingBeforeIt: m.outsidePixels.slice(0, 8) });
    ok(m.outsidePixels.length === 0, `⭐⭐⭐ ${n}: not one byte before its own pixel offset (${m.off}) was written`, m.outsidePixels.slice(0, 8));
    ok(m.moved.length > 0, `${n}: …and pixels really did move`, m.moved.length);
  }

  // ── …and they moved at the RIGHT pixels, which is what an offset read wrongly would get subtly wrong ──
  const hm = head(path.join(f.d, "map", "heightmap.bmp"));
  const tb = head(path.join(f.d, "map", "terrain.bmp"));
  const wrongH = [], wrongT = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const isThree = idAtX(x) === 3;
    const wantH = isThree || KIND[idAtX(x)] === "sea" ? SEA_VALUE : LAND_VALUE;
    const wantT = isThree || KIND[idAtX(x)] === "sea" ? OCEAN_PAINTED : PLAINS_PAINTED;
    if (hm.at(x, y) !== wantH) wrongH.push(`${x},${y}:${hm.at(x, y)}≠${wantH}`);
    if (tb.at(x, y) !== wantT) wrongT.push(`${x},${y}:${tb.at(x, y)}≠${wantT}`);
  }
  ok(wrongH.length === 0, "⭐⭐ every one of the 200 heightmap pixels holds exactly what it should", wrongH.slice(0, 6));
  ok(wrongT.length === 0, `⭐⭐ every one of the 200 terrain pixels does too — and the sea is ${OCEAN_PAINTED}, the index this map USES, not the ${OCEAN_DECLARED_FIRST} its table declares first`, wrongT.slice(0, 6));
  ok(SEA_LEVEL > SEA_VALUE, "…against the sink threshold the module itself publishes", { SEA_LEVEL, SEA_VALUE });

  // ── the trees.bmp blocks, at THIS file's own scale ────────────────────────────────────────────────────
  const tr = head(path.join(f.d, "map", "trees.bmp"));
  ok(tr.W === f.TR_W && tr.H === f.TR_H, "trees.bmp kept its own size", { got: [tr.W, tr.H], want: [f.TR_W, f.TR_H] });
  // A block may be cleared only when every province pixel under it belongs to province 3.
  const pureThree = new Set();
  const anyOther = new Set();
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const b = blockOf(f, x, y);
    if (idAtX(x) === 3) pureThree.add(b); else anyOther.add(b);
  }
  for (const b of anyOther) pureThree.delete(b);
  const wrongTrees = [];
  for (let by = 0; by < tr.H; by++) for (let bx = 0; bx < tr.W; bx++) {
    const b = by * tr.W + bx;
    const wasBare = md.readIndexedBmp(before["trees.bmp"])
      ? before["trees.bmp"][md.readIndexedBmp(before["trees.bmp"]).pixelOffset(bx, by)] === BARE : null;
    const want = pureThree.has(b) ? BARE : (wasBare ? BARE : WOOD);
    if (tr.at(bx, by) !== want) wrongTrees.push(`(${bx},${by}) ${tr.at(bx, by)}≠${want}`);
  }
  console.log(`     blocks whose whole footprint is province 3: ${[...pureThree].sort((a, b) => a - b).join(",") || "(none)"}`);
  ok(pureThree.size > 0, "the fixture really has blocks that are province 3 and nothing else", pureThree.size);
  ok(wrongTrees.length === 0, `⭐⭐⭐ every one of the ${tr.W * tr.H} trees blocks holds exactly what it should at ${(W / tr.W).toFixed(4)} px per block`, wrongTrees.slice(0, 8));
  ok(r.trees.pixels === pureThree.size, "…and the writer reported exactly that many", { reported: r.trees.pixels, expected: pureThree.size });

  // ── world_normal.bmp: half in both axes, and only the half-pixels over the change moved ──────────────
  const wn = head(path.join(f.d, "map", "world_normal.bmp"));
  ok(wn.W * 2 === W && wn.H * 2 === H, "world_normal.bmp is still half the map in both axes", { got: [wn.W, wn.H] });
  const wmoved = movedBytes(before["world_normal.bmp"], path.join(f.d, "map", "world_normal.bmp"));
  const rowsTouched = new Set(wmoved.moved.map((i) => Math.floor((i - wmoved.off) / wn.rowSize)));
  ok([...rowsTouched].every((rw) => rw >= 0 && rw < wn.H), "⭐ every normal-map byte it wrote is inside a real row of that file", [...rowsTouched]);
  return f;
}

runShape("⛔ OLD WORLD BLUES' SHAPE: a 21-entry palette, a V5 header, 2.5 px per trees block", "short");
runShape("✅ THE CONTROL: the ordinary 256-entry palettes and a round 2 px per trees block", "full");

// ══ 3. …and a short palette is not a licence to write outside the mod ═══════════════════════════════════
console.log("\n=== the ordinary refusals still hold on the odd shape ===");
{
  const f = makeFixture("short");
  const r = md.paintProvincesInTerrainBmp({ modRoot: f.d, gameRoot: f.d, dependencyRoots: [], provinceIds: [3],
    crossed: { mask: new Uint8Array(W * H), W, H } });
  ok(r.changed === false && /game directory/.test(String(r.error || "")), "refused when the mod IS the game root", r);
  const s = md.paintProvincesInTerrainBmp({ modRoot: f.d, gameRoot: NOGAME, dependencyRoots: [], provinceIds: [3], crossed: null });
  ok(s.changed === false && /crossed/.test(String(s.reason || "")), "…and with no crossed mask it writes nothing at all", s);
}

for (const d of tmps) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} }
console.log(`\n${pass} passed, ${fails.length} failed`);
if (fails.length) { for (const f of fails) console.log("  - " + f); process.exit(1); }
