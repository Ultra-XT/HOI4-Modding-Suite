// Unit test: the manual 8-bit INDEXED BMP reader/overlay/patch used by the rivers feature. Builds a synthetic
// rivers.bmp buffer (BM header + 256-entry BGRA palette + 1 byte/pixel, bottom-up, 4-byte row padding), then
// checks readIndexedBmp parses palette+indices, buildRiversOverlayRGBA makes land transparent + rivers opaque,
// and patchRiversBmp changes only the targeted index byte (palette/header untouched). Run: node test-map-rivers.js
"use strict";
const assert = require("assert");
const md = require("./map-data.js");

let pass = 0;
const ok = (n, c) => { assert.ok(c, n); console.log("  ok  " + n); pass++; };

// Build an 8-bit indexed BMP. palette: index→{r,g,b}; indexFn(x,y)→palette index.
function bmp8(width, height, palette, indexFn) {
  const rowSize = (width + 3) & ~3, imageSize = rowSize * height, dataOffset = 54 + 256 * 4;
  const buf = Buffer.alloc(dataOffset + imageSize);
  buf.write("BM", 0, "ascii");
  buf.writeUInt32LE(buf.length, 2); buf.writeUInt32LE(dataOffset, 10); buf.writeUInt32LE(40, 14);
  buf.writeInt32LE(width, 18); buf.writeInt32LE(height, 22); buf.writeUInt16LE(1, 26);
  buf.writeUInt16LE(8, 28); buf.writeUInt32LE(0, 30); buf.writeUInt32LE(imageSize, 34); buf.writeUInt32LE(256, 46);
  for (let i = 0; i < 256; i++) { const c = palette[i] || { r: 0, g: 0, b: 0 }; const o = 54 + i * 4; buf[o] = c.b; buf[o + 1] = c.g; buf[o + 2] = c.r; buf[o + 3] = 0; }
  for (let y = 0; y < height; y++) { const row = dataOffset + (height - 1 - y) * rowSize; for (let x = 0; x < width; x++) buf[row + x] = indexFn(x, y) & 0xff; }
  return buf;
}

(() => {
  console.log("=== rivers.bmp 8-bit indexed reader/overlay/patch ===");
  // ⚠️ Index 0 is GREY land — what every shipping rivers.bmp uses — not green. This fixture used green as
  // its background, which is exactly why "land pixel is transparent" passed while the real SOURCE marker
  // was being blanked on every real map. A fixture that disagrees with the corpus hides the bug it should
  // expose. #the-river-source-marker-was-never-drawn
  const PAL = []; PAL[0] = { r: 122, g: 122, b: 122 }; PAL[1] = { r: 0, g: 255, b: 255 }; PAL[2] = { r: 255, g: 0, b: 0 };
  const W = 6, H = 4;
  // Row y==1 is a horizontal river (index 1); everything else is land (index 0).
  const buf = bmp8(W, H, PAL, (x, y) => (y === 1 ? 1 : 0));

  const bmp = md.readIndexedBmp(buf);
  ok("readIndexedBmp parses width/height", bmp && bmp.width === W && bmp.height === H);
  ok("palette index 0 = grey land (122,122,122), as every shipping map uses", bmp.palette[0].r === 122 && bmp.palette[0].g === 122 && bmp.palette[0].b === 122);
  ok("palette index 1 = cyan river (0,255,255)", bmp.palette[1].r === 0 && bmp.palette[1].g === 255 && bmp.palette[1].b === 255);
  ok("a river-row pixel reads index 1", buf[bmp.pixelOffset(2, 1)] === 1);
  ok("a land pixel reads index 0", buf[bmp.pixelOffset(2, 0)] === 0);

  const ov = md.buildRiversOverlayRGBA(buf);
  ok("overlay is the right size", ov && ov.width === W && ov.height === H && ov.rgba.length === W * H * 4);
  const px = (x, y) => { const o = (y * W + x) * 4; return [ov.rgba[o], ov.rgba[o + 1], ov.rgba[o + 2], ov.rgba[o + 3]]; };
  ok("land pixel is transparent in the overlay", px(2, 0)[3] === 0);
  // The overlay recolours the raw palette into a cohesive water-blue (display only). A narrowest river
  // (cyan 0,255,255 → width factor 0) becomes the LIGHT water colour at ~235 alpha — not raw cyan.
  const wc = md.riverOverlayColor({ r: 0, g: 255, b: 255 });
  ok("river pixel is recoloured to water-blue (not raw cyan)", JSON.stringify(px(2, 1)) === JSON.stringify([wc.r, wc.g, wc.b, wc.a]));
  ok("water-blue is bluish + mostly opaque", wc.b > wc.r && wc.b > 150 && wc.a >= 200);
  // A wide river (pure blue 0,0,255 → factor 1) is DEEPER than a narrow one (depth encodes width).
  const deep = md.riverOverlayColor({ r: 0, g: 0, b: 255 });
  ok("wide rivers render deeper than narrow ones", deep.b < wc.b && deep.r < wc.r);
  // Red flow-IN / yellow flow-OUT markers fold into the (light) headwater colour, not jarring dots.
  // ⚠️ RED IS NOT THE SOURCE. It is flow-in (a tributary joining another river); the SOURCE is GREEN. The
  // palette classifier was corrected for that mislabelling; this test kept it until 2026-09-08.
  ok("flow-in (red) folds into water-blue", JSON.stringify(md.riverOverlayColor({ r: 255, g: 0, b: 0 })) === JSON.stringify(wc));
  // ⭐⭐⭐ …and the real SOURCE is drawn AS ITSELF. #the-river-source-marker-was-never-drawn
  const src = md.riverOverlayColor({ r: 0, g: 255, b: 0 });
  ok("the green SOURCE marker renders green, not water-blue", src.g > src.r && src.g > src.b && src.a > 0);
  ok("…so a river's start is distinguishable from a narrow stretch of it", JSON.stringify(src) !== JSON.stringify(wc));

  // Background detection matches the REAL game scheme: land = grey (122,122,122), sea = white — both must be
  // transparent (NOT painted blue). Only saturated reds/yellows/cyans/blues are rivers. (Regression: the
  // original "land = green only" check painted a real map's whole grey/white surface blue.)
  ok("grey land (122,122,122) is background → transparent", md.isRiverBackground({ r: 122, g: 122, b: 122 }) === true);
  ok("white sea (255,255,255) is background → transparent", md.isRiverBackground({ r: 255, g: 255, b: 255 }) === true);
  // ⛔ GREEN IS NOT BACKGROUND — this asserted the bug. #the-river-source-marker-was-never-drawn
  // Green (0,255,0) is the river SOURCE: the one pixel HOI4 requires per river, the one the palette offers
  // as "🟢 Source", and the one Nova's auto-fix ADDS when a river has none. Treating it as background made
  // buildRiversOverlayRGBA render every one transparent. Measured over the six installed maps: vanilla
  // 317 sources → 0 drawn, MD 364 → 0, OWB 221 → 0, while flow-in and flow-out drew 100%.
  ok("green (0,255,0) is the SOURCE marker, NOT background", md.isRiverBackground({ r: 0, g: 255, b: 0 }) === false);
  ok("cyan river (0,225,255) is NOT background", md.isRiverBackground({ r: 0, g: 225, b: 255 }) === false);
  ok("blue river (0,0,255) is NOT background", md.isRiverBackground({ r: 0, g: 0, b: 255 }) === false);
  ok("red source (255,0,0) is NOT background", md.isRiverBackground({ r: 255, g: 0, b: 0 }) === false);
  // A whole grey/white BMP yields a fully-transparent overlay (nothing painted blue).
  const greyPal = []; greyPal[0] = { r: 122, g: 122, b: 122 }; greyPal[1] = { r: 255, g: 255, b: 255 };
  const greyBuf = bmp8(4, 4, greyPal, (x) => (x < 2 ? 0 : 1));
  const greyOv = md.buildRiversOverlayRGBA(greyBuf);
  let anyOpaque = false; for (let i = 3; i < greyOv.rgba.length; i += 4) if (greyOv.rgba[i] !== 0) anyOpaque = true;
  ok("an all-land/sea bitmap renders fully transparent (no blue blanket)", anyOpaque === false);

  // Patch: paint a source (index 2) at (0,0); only that byte changes, palette + other pixels intact.
  const before = Buffer.from(buf);
  const r = md.patchRiversBmp(buf, [{ x: 0, y: 0, index: 2 }]);
  ok("patch reports 1 changed pixel", r.ok && r.changed === 1);
  ok("the painted pixel now reads index 2", buf[bmp.pixelOffset(0, 0)] === 2);
  ok("an untouched river pixel still reads index 1", buf[bmp.pixelOffset(2, 1)] === 1);
  // Exactly ONE byte differs from the original (palette + header + all other pixels unchanged).
  let diffs = 0; for (let i = 0; i < buf.length; i++) if (buf[i] !== before[i]) diffs++;
  ok("exactly one byte changed (palette/header preserved)", diffs === 1);

  // A non-indexed / junk buffer is rejected cleanly.
  ok("readIndexedBmp rejects a non-BMP buffer", md.readIndexedBmp(Buffer.from("not a bmp")) === null);

  console.log(`\ntest-map-rivers: ${pass} checks passed`);
})();
