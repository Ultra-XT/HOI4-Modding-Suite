// Guard the X-crossing detector + repair. An X-crossing is a 2×2 pixel block in provinces.bmp where all four
// pixels are different provinces — four provinces meeting at one corner. HOI4 logs it ("Map invalid X
// crossing", map.cpp) and carries on; Nova still stops Save for it until a launch test settles what it does
// (#a-map-message-says-when-the-game-stops). Painting created this class, and Nova was previously blind to it. Build a tiny bmp with one X-crossing,
// detect it, repair it, and confirm it's gone — and that a clean (no-crossing) bmp reports nothing.
const fs = require("fs"), os = require("os"), path = require("path");
const md = require("./map-data.js");
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) { pass++; console.log("  ✓ " + m); } else { fail++; console.log("  ✗ FAIL " + m + (x !== undefined ? " -> " + JSON.stringify(x) : "")); } };

// Build a 24-bit BMP. pixels[y][x] = [r,g,b], y=0 = TOP row (BMP stores bottom-up; we flip on write).
function writeBmp(file, pixels) {
  const H = pixels.length, W = pixels[0].length;
  const rs = Math.floor((24 * W + 31) / 32) * 4;           // row stride padded to 4 bytes
  const imgSize = rs * H, dataOff = 54, fileSize = dataOff + imgSize;
  const buf = Buffer.alloc(fileSize);
  buf.write("BM", 0); buf.writeUInt32LE(fileSize, 2); buf.writeUInt32LE(dataOff, 10);
  buf.writeUInt32LE(40, 14); buf.writeInt32LE(W, 18); buf.writeInt32LE(H, 22);
  buf.writeUInt16LE(1, 26); buf.writeUInt16LE(24, 28); buf.writeUInt32LE(imgSize, 34);
  for (let y = 0; y < H; y++) {
    const base = dataOff + (H - 1 - y) * rs;               // image row y → buffer row (H-1-y)
    for (let x = 0; x < W; x++) { const [r, g, b] = pixels[y][x]; const o = base + x * 3; buf[o] = b; buf[o + 1] = g; buf[o + 2] = r; }
  }
  fs.writeFileSync(file, buf);
}
const A = [255, 0, 0], B = [0, 255, 0], C = [0, 0, 255], D = [255, 255, 0];
function mkMod(grid) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "nova-xc-"));
  fs.mkdirSync(path.join(root, "map"), { recursive: true });
  fs.writeFileSync(path.join(root, "descriptor.mod"), 'name="XC"\n', "utf8");
  writeBmp(path.join(root, "map", "provinces.bmp"), grid);
  return root;
}
const game = fs.mkdtempSync(path.join(os.tmpdir(), "nova-xc-game-"));
const cleanup = [game];

try {
  // 6×4 grid: E A A B B E / E A A B B E / E C C D D E / E C C D D E — four provinces meet at the centre corner →
  // 1 X-crossing. The E border on BOTH edges is load-bearing: the map wraps horizontally, so on the old 4-wide
  // A A B B grid column 3 (B/D) met column 0 (A/C) across the seam in a SECOND four-way corner, which the scan
  // now sees (#an-x-crossing-on-the-wrap-seam). The border keeps this test about one interior crossing.
  const E = [40, 40, 40];
  const xgrid = [[E, A, A, B, B, E], [E, A, A, B, B, E], [E, C, C, D, D, E], [E, C, C, D, D, E]];
  const m1 = mkMod(xgrid); cleanup.push(m1);
  const found = md.findMapXCrossings({ modRoot: m1, gameRoot: game });
  ok(found.length === 1, "detects exactly one X-crossing", found);
  const fx = md.fixMapXCrossings({ modRoot: m1, gameRoot: game });
  ok(fx.fixed === 1, "fix reports 1 crossing repaired", fx);
  ok(md.findMapXCrossings({ modRoot: m1, gameRoot: game }).length === 0, "no X-crossing remains after the fix");
  // the repair only recoloured a single pixel (the rest of the bitmap is untouched)
  const reread = md.findMapXCrossings({ modRoot: m1, gameRoot: game });
  ok(reread.length === 0, "still clean on re-read (write persisted)");

  // A clean checkerboard-free bitmap (only 2 provinces, never 4 at a corner) → no crossing.
  const clean = [[A, A, B, B], [A, A, B, B], [A, A, B, B], [A, A, B, B]];
  const m2 = mkMod(clean); cleanup.push(m2);
  ok(md.findMapXCrossings({ modRoot: m2, gameRoot: game }).length === 0, "clean bitmap → no X-crossing");
  ok(md.fixMapXCrossings({ modRoot: m2, gameRoot: game }).fixed === 0, "clean bitmap → fix is a no-op");

  // validateMapBitmap surfaces it as an error.
  const m3 = mkMod(xgrid); cleanup.push(m3);
  const probs = md.validateMapBitmap({ modRoot: m3, gameRoot: game }) || [];
  ok(probs.some((p) => p.rule === "map_x_crossing" && p.severity === "error"), "validator flags map_x_crossing as an error", probs.map((p) => p.rule));
} catch (e) { ok(false, "threw: " + e.message + "\n" + e.stack); }
finally { cleanup.forEach((d) => { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} }); }

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exitCode = fail ? 1 : 0;
