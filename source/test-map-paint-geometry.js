// The province-PAINT tool writes raw provinces.bmp pixels — the one map tool whose crash conditions
// aren't text-model rules the Save-gate (validateMapModel) can see. applyProvinceDiff must therefore
// catch them itself: REFUSE a paint that erases a province (0 px → HOI4 fails to load the map), and
// WARN when a paint leaves a province tiny (<8 px) or split into far-apart blobs (disjoint → map error
// that can crash). This locks all four cases in. Synthetic 80×1 map so 1/8-of-map = 10 px.
const fs = require("fs"), os = require("os"), path = require("path");
const md = require("./map-data.js");
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) { pass++; console.log("  PASS " + m); } else { fail++; console.log("  FAIL " + m + (x !== undefined ? " -> " + JSON.stringify(x) : "")); } };

// Build a 24-bit BMP (W×1) from a per-x [r,g,b] function.
function makeBmp(W, colorAt) {
  const H = 1, stride = (W * 3 + 3) & ~3, hdr = Buffer.alloc(54), data = Buffer.alloc(stride);
  hdr.write("BM", 0); hdr.writeUInt32LE(54 + stride, 2); hdr.writeUInt32LE(54, 10); hdr.writeUInt32LE(40, 14);
  hdr.writeInt32LE(W, 18); hdr.writeInt32LE(H, 22); hdr.writeUInt16LE(1, 26); hdr.writeUInt16LE(24, 28);
  for (let x = 0; x < W; x++) { const [r, g, b] = colorAt(x); data[x * 3] = b; data[x * 3 + 1] = g; data[x * 3 + 2] = r; }
  return Buffer.concat([hdr, data]);
}
const BG = [50, 50, 50], A = [200, 0, 0], B = [0, 200, 0], C = [0, 0, 200];
// x: 0–15 = A (16px), 16–25 = B (10px), 30–32 = C (3px), else background.
const colorAt = (x) => (x <= 15 ? A : x >= 16 && x <= 25 ? B : x >= 30 && x <= 32 ? C : BG);

const root = fs.mkdtempSync(path.join(os.tmpdir(), "nova-paintgeo-"));
const gameRoot = root + "_g"; // different from modRoot → writes allowed
md.setAllowGameRootWrites(false);
function reset() { const d = path.join(root, "map"); fs.mkdirSync(d, { recursive: true }); fs.writeFileSync(path.join(d, "provinces.bmp"), makeBmp(80, colorAt)); }
const paint = (diff) => md.applyProvinceDiff({ modRoot: root, gameRoot, dependencyRoots: [], diff });
const px = (x, col) => ({ x, y: 0, r: col[0], g: col[1], b: col[2] });

try {
  console.log("\nProvince-paint geometry guard:");

  // 1. Normal paint — extend A by one neighbouring pixel. No warning even though A's box (17px) exceeds
  //    1/8-map: it's one contiguous component, so the disjoint check must NOT false-positive.
  reset();
  let r = paint([px(16, A)]);
  ok(r.ok && !r.warnings, "normal contiguous paint → ok, no warnings", r.warnings);

  // 2. Erase a province entirely (paint all of C away) → AUTO-FIXED: a small seed of C is kept so the map
  //    still loads (HOI4 can't have a 0-pixel province, and it can't be deleted without breaking id contiguity).
  reset();
  r = paint([px(30, BG), px(31, BG), px(32, BG)]);
  ok(r.ok && (r.warnings || []).some((w) => /Auto-fixed|fully covered/i.test(w)), "paint that fully covers a province is AUTO-FIXED (reseeded, not refused)", r);

  // 2b. Fully cover a LARGE province (all 16 px of A) → only a small contiguous SEED is kept (not all 16,
  //     so the paint mostly applies), and the province survives (not 0 px).
  reset();
  r = paint(Array.from({ length: 16 }, (_, x) => px(x, BG)));
  {
    const after = md.readBmp24(fs.readFileSync(path.join(root, "map", "provinces.bmp")));
    let aCount = 0; for (let x = 0; x < 80; x++) if (after.rgb[x * 3] === A[0] && after.rgb[x * 3 + 1] === A[1] && after.rgb[x * 3 + 2] === A[2]) aCount++;
    ok(r.ok && aCount === 8, "fully covering a 16px province keeps an 8px seed (not 0, not all 16)", { ok: r.ok, aCount });
  }

  // 3. Shrink B from 10px to 3px (<8) → ok, but warns about the tiny province.
  reset();
  r = paint([px(16, BG), px(17, BG), px(18, BG), px(19, BG), px(20, BG), px(21, BG), px(22, BG)]);
  ok(r.ok && (r.warnings || []).some((w) => /under 8 pixels|only/i.test(w)), "paint leaving a <8px province → ok + tiny-province warning", r.warnings);

  // 4. Stranded far blob — paint A's colour at x=70 (gap 54 ≫ 1/8-map=10) → ok, but warns about disjoint.
  reset();
  r = paint([px(70, A)]);
  ok(r.ok && (r.warnings || []).some((w) => /split into pieces|far apart/i.test(w)), "paint that strands a far blob → ok + disjoint warning", r.warnings);

  // 5. analyzePaintedShapes directly: far-apart blobs of the same colour are flagged; one contiguous run isn't.
  const img = md.readBmp24(makeBmp(80, (x) => (x <= 3 || (x >= 70 && x <= 73)) ? A : BG)); // A in two far clumps
  const packed = (c) => (c[0] << 16) | (c[1] << 8) | c[2];
  let s = md.analyzePaintedShapes(img, new Set([packed(A)]));
  ok(s.disjointFar.includes(packed(A)), "analyzePaintedShapes flags far-apart blobs as disjoint", s.disjointFar);
  const img2 = md.readBmp24(makeBmp(80, (x) => x <= 30 ? A : BG)); // one contiguous run, big box
  s = md.analyzePaintedShapes(img2, new Set([packed(A)]));
  ok(!s.disjointFar.includes(packed(A)), "one contiguous (even large) province is NOT flagged disjoint", s.disjointFar);

  console.log("\n  " + pass + " passed, " + fail + " failed");
} catch (e) { console.error(e); fail++; }
finally { try { fs.rmSync(root, { recursive: true, force: true }); } catch (_) {} process.exitCode = fail ? 1 : 0; }
