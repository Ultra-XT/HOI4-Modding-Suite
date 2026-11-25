// A paint must judge "too small" by the game's own minimum, not by a number Nova typed in.
// #a-paint-judges-a-tiny-province-by-the-games-own-define
//
// HOI4's floor for a province is a define, NGraphics.MINIMUM_PROVINCE_SIZE_IN_PIXELS: vanilla ships 8 in the NGraphics
// table (common/defines/00_graphics.lua), and a mod may change it — Rise of Nations sets 2. The map validator's
// province_too_small already reads the effective define through readEffectiveDefineNumber (71b9d47).
//
// The paint tool did not. applyProvinceDiff and analyzePaintedShapes hard-coded `< 8`, and so did the reseed that
// keeps a patch of a province the paint fully covered (SEED = 8). Measured on fixtures before the fix:
//
//   · define 2  — a province painted down to 2 pixels, which the game accepts, was warned "under 8 pixels";
//   · define 20 — a province painted down to 12 pixels, which the game logs, drew no warning at all;
//   · define 10 — a fully covered province was reseeded to 8 pixels, below the game's minimum, in silence.
//
// So on a mod that lowers the floor the paint cried wolf, and on one that raises it the paint kept quiet while Nova
// itself planted a province the game complains about.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const md = require("./map-data.js");

let pass = 0;
const fails = [];
const ok = (cond, label, detail) => {
  if (cond === true) { pass++; console.log("  ok   " + label); }
  else { fails.push(label); console.log("  FAIL " + label + (detail !== undefined ? "   -> " + JSON.stringify(detail).slice(0, 300) : "")); }
};

const tmps = [];
const W = 16, H = 8;
const bmp24 = (pixelFn) => {
  const rowSize = (W * 3 + 3) & ~3, imageSize = rowSize * H;
  const buf = Buffer.alloc(54 + imageSize);
  buf.write("BM", 0, "ascii");
  buf.writeUInt32LE(54 + imageSize, 2); buf.writeUInt32LE(54, 10); buf.writeUInt32LE(40, 14);
  buf.writeInt32LE(W, 18); buf.writeInt32LE(H, 22); buf.writeUInt16LE(1, 26);
  buf.writeUInt16LE(24, 28); buf.writeUInt32LE(imageSize, 34);
  for (let y = 0; y < H; y++) { let o = 54 + (H - 1 - y) * rowSize; for (let x = 0; x < W; x++) { const [r, g, b] = pixelFn(x, y); buf[o++] = b; buf[o++] = g; buf[o++] = r; } }
  return buf;
};

// Province 1 fills the map except a strip along the top row that is province 2, `stripLen` pixels long.
const P1 = [10, 10, 10], P2 = [20, 20, 20];
const GAME = path.join(os.tmpdir(), "__nova_no_game_minpx__");

// `define` is the value the mod's own common/defines file sets; null writes no define (the game's 8 applies).
const mk = (stripLen, define) => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "nova-minpx-")); tmps.push(d);
  fs.writeFileSync(path.join(d, "descriptor.mod"), 'name="MINPX"\nreplace_path="map"\n');
  fs.mkdirSync(path.join(d, "map"), { recursive: true });
  fs.writeFileSync(path.join(d, "map", "definition.csv"), [
    "0;0;0;0;land;false;unknown;0",
    `1;${P1.join(";")};land;false;plains;1`,
    `2;${P2.join(";")};land;false;plains;1`,
  ].join("\n") + "\n");
  fs.writeFileSync(path.join(d, "map", "provinces.bmp"), bmp24((x, y) => (y === 0 && x < stripLen ? P2 : P1)));
  if (define !== null) {
    fs.mkdirSync(path.join(d, "common", "defines"), { recursive: true });
    fs.writeFileSync(path.join(d, "common", "defines", "zz_minpx_test.lua"),
      `-- the mod's own floor\nNDefines.NGraphics.MINIMUM_PROVINCE_SIZE_IN_PIXELS = ${define}\n`);
  }
  return d;
};
const paintP1 = (xs) => xs.map((x) => ({ x, y: 0, r: P1[0], g: P1[1], b: P1[2] }));
const countP2 = (d) => {
  const buf = fs.readFileSync(path.join(d, "map", "provinces.bmp"));
  const dataOff = buf.readUInt32LE(10), w = buf.readInt32LE(18), h = buf.readInt32LE(22);
  const rowSize = Math.floor((24 * w + 31) / 32) * 4;
  let n = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const o = dataOff + (h - 1 - y) * rowSize + x * 3;
    if (buf[o + 2] === P2[0] && buf[o + 1] === P2[1] && buf[o] === P2[2]) n++;
  }
  return n;
};
const TOO_SMALL = /under \d+ pixels?/;
const range = (a, b) => Array.from({ length: b - a }, (_, i) => a + i);

console.log("\n=== a mod that LOWERS the floor to 2: a 2-pixel province is legal and must not be called tiny ===");
{
  const d = mk(6, 2);
  const r = md.applyProvinceDiff({ modRoot: d, gameRoot: GAME, dependencyRoots: [], diff: paintP1(range(0, 4)) });
  ok(r && r.ok === true, "the paint applies", r && r.error);
  ok(countP2(d) === 2, "province 2 really is left with 2 pixels", countP2(d));
  const warns = (r.warnings || []).join(" | ");
  ok(!TOO_SMALL.test(warns), "⭐⭐⭐ no too-small warning — the game's own minimum on this mod is 2", warns);
}
{
  // positive control on the same floor: 1 pixel IS under 2
  const d = mk(6, 2);
  const r = md.applyProvinceDiff({ modRoot: d, gameRoot: GAME, dependencyRoots: [], diff: paintP1(range(0, 5)) });
  const warns = (r.warnings || []).join(" | ");
  ok(countP2(d) === 1, "control: province 2 left with 1 pixel", countP2(d));
  ok(/under 2 pixels?/.test(warns), "⭐⭐ control: 1 pixel IS under this mod's floor of 2, and the warning says 2", warns);
}

console.log("\n=== a mod that RAISES the floor to 20: a 12-pixel province is under it and must be said ===");
{
  const d = mk(16, 20);
  const r = md.applyProvinceDiff({ modRoot: d, gameRoot: GAME, dependencyRoots: [], diff: paintP1(range(0, 4)) });
  ok(r && r.ok === true, "the paint applies", r && r.error);
  ok(countP2(d) === 12, "province 2 really is left with 12 pixels", countP2(d));
  const warns = (r.warnings || []).join(" | ");
  ok(/under 20 pixels/.test(warns), "⭐⭐⭐ warned as under 20 pixels — the floor this mod set", warns);
  ok(/MINIMUM_PROVINCE_SIZE_IN_PIXELS/.test(warns), "⭐ …and the warning names the define, so the modder can find it", warns);
}

console.log("\n=== a fully covered province is reseeded to at least the game's minimum, when the paint left room ===");
{
  const d = mk(12, 10);
  const r = md.applyProvinceDiff({ modRoot: d, gameRoot: GAME, dependencyRoots: [], diff: paintP1(range(0, 12)) });
  ok(r && r.ok === true, "the paint applies rather than being refused", r && r.error);
  const warns = (r.warnings || []).join(" | ");
  ok(/fully covered/.test(warns), "it says it auto-repaired a fully covered province", warns);
  const n = countP2(d);
  ok(n >= 10, `⭐⭐⭐ the patch it kept is at least 10 pixels (it has ${n}) — not the old fixed 8, below this mod's floor`, n);
  ok(!TOO_SMALL.test(warns), "⭐⭐ …so the patch Nova planted draws no too-small warning", warns);
}

console.log("\n=== ⚠️ no define anywhere: the game's default of 8 still applies ===");
{
  const d = mk(6, null);
  const r = md.applyProvinceDiff({ modRoot: d, gameRoot: GAME, dependencyRoots: [], diff: paintP1(range(0, 1)) });
  const warns = (r.warnings || []).join(" | ");
  ok(countP2(d) === 5, "province 2 left with 5 pixels", countP2(d));
  ok(/under 8 pixels/.test(warns), "⚠️ with no define, 5 pixels is still under the game's 8", warns);
}

console.log("\n=== the country mover (dragCountryShape) judges by the same define ===");
// Its endpoint is switched off today (server.js: TEMPORARILY DISABLED), but the function is exported and tested, and a
// second copy of the old hard-coded 8 is exactly what would come back with it.
const DW = 24, DH = 8;
const DCOL = { 1: [200, 0, 0], 2: [0, 0, 200], 3: [0, 200, 0] };
const dragBmp = (provAt) => {
  const rowSize = (DW * 3 + 3) & ~3, imageSize = rowSize * DH, buf = Buffer.alloc(54 + imageSize);
  buf.write("BM", 0, "ascii"); buf.writeUInt32LE(54 + imageSize, 2); buf.writeUInt32LE(54, 10); buf.writeUInt32LE(40, 14);
  buf.writeInt32LE(DW, 18); buf.writeInt32LE(DH, 22); buf.writeUInt16LE(1, 26); buf.writeUInt16LE(24, 28); buf.writeUInt32LE(imageSize, 34);
  for (let y = 0; y < DH; y++) { let o = 54 + (DH - 1 - y) * rowSize; for (let x = 0; x < DW; x++) { const [r, g, b] = DCOL[provAt(x)]; buf[o++] = b; buf[o++] = g; buf[o++] = r; } }
  return buf;
};
const put = (p, c) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, c); };
// Columns 0-7 = province 1 (AAA, land), the next `cccCols` columns = province 3 (CCC, land), the rest = province 2 (sea).
const dragMod = (cccCols, define) => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "nova-minpx-drag-")); tmps.push(d);
  put(path.join(d, "descriptor.mod"), 'name="DragMinPx"\nreplace_path="history/states"\nreplace_path="map"\nreplace_path="map/strategicregions"\n');
  put(path.join(d, "map", "provinces.bmp"), dragBmp((x) => (x < 8 ? 1 : x < 8 + cccCols ? 3 : 2)));
  put(path.join(d, "map", "definition.csv"), [
    "0;0;0;0;land;false;unknown;0;", "1;200;0;0;land;false;plains;1;", "2;0;0;200;sea;false;ocean;0;", "3;0;200;0;land;false;plains;1;",
  ].join("\r\n") + "\r\n");
  const st = (id, provs, owner) => `state = {\n\tid = ${id}\n\tname = "STATE_${id}"\n\tstate_category = rural\n\tprovinces = { ${provs} }\n\thistory = {\n\t\towner = ${owner}\n\t}\n}\n`;
  put(path.join(d, "history", "states", "1.txt"), st(1, "1", "AAA"));
  put(path.join(d, "history", "states", "3.txt"), st(3, "3", "CCC"));
  put(path.join(d, "map", "strategicregions", "r.txt"), 'strategic_region={\n\tid=1\n\tname="REGION_1"\n\tprovinces={ 1 2 3 }\n\tweather={}\n}\n');
  if (define !== null) put(path.join(d, "common", "defines", "zz_minpx_test.lua"), `NDefines.NGraphics.MINIMUM_PROVINCE_SIZE_IN_PIXELS = ${define}\n`);
  return d;
};
const countColour = (d, col) => {
  const buf = fs.readFileSync(path.join(d, "map", "provinces.bmp"));
  const dataOff = buf.readUInt32LE(10), w = buf.readInt32LE(18), h = buf.readInt32LE(22);
  const rowSize = Math.floor((24 * w + 31) / 32) * 4;
  let n = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const o = dataOff + (h - 1 - y) * rowSize + x * 3;
    if (buf[o + 2] === col[0] && buf[o + 1] === col[1] && buf[o] === col[2]) n++;
  }
  return n;
};
{
  // AAA moves right by 8 and covers all 16 pixels of CCC's province 3, so the mover restores a seed of it.
  const d = dragMod(2, 20);
  const r = md.dragCountryShape({ modRoot: d, tag: "AAA", dx: 8, dy: 0 });
  ok(r && r.ok === true, "drag: the move applies", r && r.error);
  ok(Array.isArray(r.seededProvinces) && r.seededProvinces.includes(3), "drag: the covered province 3 is reported as seeded", r.seededProvinces);
  const n = countColour(d, DCOL[3]);
  ok(n === 16, `⭐⭐⭐ drag: on a floor of 20 the seed restores all 16 of province 3's pixels (it has ${n}) — not the old fixed 8`, n);
}
{
  const d = dragMod(2, null);
  const r = md.dragCountryShape({ modRoot: d, tag: "AAA", dx: 8, dy: 0 });
  const n = countColour(d, DCOL[3]);
  ok(r && r.ok === true && n === 8, `⚠️ drag control: with no define the seed is still the game's 8 (it has ${n})`, { ok: r && r.ok, n });
}
{
  // AAA moves right by 3 onto columns 3-10, cutting province 3 (columns 8-11) down to column 11: 8 pixels.
  const d = dragMod(4, 20);
  const r = md.dragCountryShape({ modRoot: d, tag: "AAA", dx: 3, dy: 0 });
  ok(r && r.ok === true && countColour(d, DCOL[3]) === 8, "drag: province 3 is cut down to 8 pixels", { ok: r && r.ok, n: countColour(d, DCOL[3]) });
  ok((r.tooSmallProvinces || []).some((t) => t.province === 3 && t.pixels === 8),
    "⭐⭐⭐ drag: on a floor of 20, 8 pixels is reported as too small", r.tooSmallProvinces);
}
{
  const d = dragMod(4, null);
  const r = md.dragCountryShape({ modRoot: d, tag: "AAA", dx: 3, dy: 0 });
  ok(r && r.ok === true && !(r.tooSmallProvinces || []).some((t) => t.province === 3),
    "⚠️ drag control: with no define, 8 pixels meets the game's 8 and is not reported", r && r.tooSmallProvinces);
}

console.log("\n=== ⚠️ the reader is the validator's own, not a second copy ===");
{
  const SRC = fs.readFileSync(path.join(__dirname, "map-data.js"), "utf8");
  const a = SRC.indexOf("function applyProvinceDiff");
  const app = a < 0 ? "" : SRC.slice(a, SRC.indexOf("\n/**", a));
  ok(app.length > 500, "applyProvinceDiff was found", app.length);
  ok(/readEffectiveDefineNumber\(/.test(app) && /MINIMUM_PROVINCE_SIZE_IN_PIXELS/.test(app),
    "⭐ applyProvinceDiff asks readEffectiveDefineNumber for MINIMUM_PROVINCE_SIZE_IN_PIXELS", app.slice(0, 120));
}

tmps.forEach((d) => { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} });
console.log(`\n=== a paint judges a tiny province by the game's own define: ${pass} checks, ${fails.length} failed ===`);
fails.forEach((f) => console.log("   FAILED: " + f));
process.exit(fails.length ? 1 : 0);
