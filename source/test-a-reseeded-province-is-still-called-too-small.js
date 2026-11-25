// A province the paint auto-repaired must still be counted as too small if it is.
// #a-reseeded-province-is-never-called-too-small
//
// applyProvinceDiff refuses nothing when a paint fully covers a province. HOI4 cannot load a 0-pixel
// province, so it RESEEDS one: a flood fill through the pixels that were painted over, keeping up to 8 of
// them, and it says "Kept a small patch of each so the map still works".
//
// The seed grows only through overpainted pixels CONTIGUOUS with the first one, so it can come out smaller
// than 8 — as small as the province's whole overpainted footprint. Two pixels is under HOI4's threshold
// ("province has only N pixels") exactly as much as a province the modder shrank by hand.
//
// And it could never be reported, by construction:
//
//   · analyzePaintedShapes runs BEFORE the reseed loop;
//   · it skips any province whose post-paint count is 0 — which every fully-covered one is at that moment,
//     with a comment saying a full wipe "is handled (refused) by the caller", which stopped being true when
//     the caller started reseeding instead of refusing.
//
// So the one warning that exists for tiny provinces could not see the tiny provinces Nova itself created.
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

// Province 1 fills the map except for a 3-pixel strip that is province 2. Painting over that strip covers
// province 2 completely, so the reseed can plant at most 3 pixels — under the 8-pixel threshold.
const P1 = [10, 10, 10], P2 = [20, 20, 20];
const isP2 = (x, y) => y === 0 && x < 3;

const mk = () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "nova-seed-")); tmps.push(d);
  fs.writeFileSync(path.join(d, "descriptor.mod"), 'name="SEED"\nreplace_path="map"\n');
  fs.mkdirSync(path.join(d, "map"), { recursive: true });
  fs.writeFileSync(path.join(d, "map", "definition.csv"), [
    "0;0;0;0;land;false;unknown;0",
    `1;${P1.join(";")};land;false;plains;1`,
    `2;${P2.join(";")};land;false;plains;1`,
  ].join("\n") + "\n");
  fs.writeFileSync(path.join(d, "map", "provinces.bmp"), bmp24((x, y) => (isP2(x, y) ? P2 : P1)));
  return d;
};
const GAME = path.join(os.tmpdir(), "__nova_no_game_seed__");

console.log("\n=== painting over a whole province leaves a patch, and says how it went ===");
{
  const d = mk();
  const diff = [];
  for (let x = 0; x < 3; x++) diff.push({ x, y: 0, r: P1[0], g: P1[1], b: P1[2] });
  const r = md.applyProvinceDiff({ modRoot: d, gameRoot: GAME, dependencyRoots: [], diff });
  ok(r && r.ok === true, "the paint applies rather than being refused", r && r.error);

  const warns = (r.warnings || []).join(" | ");
  ok(/fully covered/.test(warns),
    "it says it auto-repaired a fully covered province", warns);

  // ⭐⭐⭐ THE POINT. The patch it kept is 3 pixels — under HOI4's threshold — and that has to be said.
  ok(/under 8 pixels/.test(warns),
    "⭐⭐⭐ …and ALSO says the patch it kept is under 8 pixels", warns);

  // …and the province really is that small on disk, so the warning is not just words.
  const buf = fs.readFileSync(path.join(d, "map", "provinces.bmp"));
  const dataOff = buf.readUInt32LE(10), w = buf.readInt32LE(18), h = buf.readInt32LE(22);
  const rowSize = Math.floor((24 * w + 31) / 32) * 4;
  let n = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const o = dataOff + (h - 1 - y) * rowSize + x * 3;
    if (buf[o + 2] === P2[0] && buf[o + 1] === P2[1] && buf[o] === P2[2]) n++;
  }
  ok(n > 0, "⭐⭐ province 2 was NOT left at 0 pixels — HOI4 could not load that", n);
  ok(n < 8, `⭐⭐⭐ …but it IS under 8 (it has ${n}), which is exactly what had to be reported`, n);
}

console.log("\n=== ⚠️ and the analyser still explains why the caller has to do this ===");
{
  const SRC = fs.readFileSync(path.join(__dirname, "map-data.js"), "utf8");
  const s = SRC.indexOf("function analyzePaintedShapes");
  const body = s < 0 ? "" : SRC.slice(s, SRC.indexOf("\n/**", s));
  ok(body.length > 300, "analyzePaintedShapes was found", body.length);
  ok(!/a full wipe is handled \(refused\) by the caller/.test(body),
    "⚠️ the stale comment claiming the caller REFUSES a full wipe is gone — it reseeds", body.slice(0, 200));
  ok(/if \(n === 0\) continue;/.test(body),
    "…the skip itself stays (the caller owns that case), now with the real reason", body.slice(0, 200));

  const a = SRC.indexOf("function applyProvinceDiff");
  const app = a < 0 ? "" : SRC.slice(a, SRC.indexOf("\n/**", a));
  ok(/shape\.tooSmall\.push\(/.test(app),
    "⭐⭐ …and the reseed loop records the seed it planted, where the exact size is known", app.length);
}

console.log("\n=== ⚠️ CONTROL: an ordinary paint that shrinks nothing says neither thing ===");
{
  const d = mk();
  // Repaint one pixel of province 1 with province 1's own colour: nothing is covered, nothing shrinks.
  const r = md.applyProvinceDiff({ modRoot: d, gameRoot: GAME, dependencyRoots: [],
    diff: [{ x: 8, y: 4, r: P1[0], g: P1[1], b: P1[2] }] });
  ok(r && r.ok === true, "the no-op paint applies", r && r.error);
  const warns = (r.warnings || []).join(" | ");
  ok(!/fully covered/.test(warns), "⚠️ …and claims no auto-repair", warns);
  ok(!/under 8 pixels/.test(warns), "⚠️⚠️ …and does not cry wolf about a tiny province", warns);
}

tmps.forEach((d) => { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} });
console.log(`\n=== a reseeded province is still called too small: ${pass} checks, ${fails.length} failed ===`);
fails.forEach((f) => console.log("   FAILED: " + f));
process.exit(fails.length ? 1 : 0);
