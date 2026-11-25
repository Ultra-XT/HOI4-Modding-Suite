// Unit test: clearAllRivers — the one-click "wipe every river → land" escape hatch for a botched/giant river.
// Builds a synthetic 8-bit indexed rivers.bmp (grey land, white sea, several river colours incl. a thick 2x2
// band) and asserts every river pixel becomes land while the grey-land + white-sea backgrounds are preserved,
// no .bak is left inside the mod, and the palette/header are untouched. Run: node test-map-clear-rivers.js
"use strict";
const assert = require("assert");
const fs = require("fs"), os = require("os"), path = require("path");
const md = require("./map-data.js");
let pass = 0;
const ok = (n, c, x) => { assert.ok(c, n + (x !== undefined ? " -> " + JSON.stringify(x) : "")); console.log("  ok  " + n); pass++; };
const mk = (p, c) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, c); };

// 8-bit indexed BMP. palette: index→{r,g,b}; indexFn(x,y)→index.
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
  console.log("=== clearAllRivers (wipe every river → land) ===");
  const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-clearriv-"));
  mk(path.join(mod, "descriptor.mod"), 'name="ClearRiv"\nreplace_path="map"\n');
  // Standard-ish palette: 0 green source, 1 red flow-in, 3 cyan small river, 11 deep-blue large river,
  // 254 grey LAND, 255 white SEA.
  const PAL = [];
  PAL[0] = { r: 0, g: 255, b: 0 }; PAL[1] = { r: 255, g: 0, b: 0 }; PAL[3] = { r: 0, g: 225, b: 255 };
  PAL[11] = { r: 0, g: 0, b: 100 }; PAL[254] = { r: 122, g: 122, b: 122 }; PAL[255] = { r: 255, g: 255, b: 255 };
  // Layout (16x8): left half land (254), right two columns sea (255). A 1px river (3) at y=2, a source (0) at
  // (1,2), a flow marker (1) at (5,5), and a THICK 2x2 large-river band (11) at (8..9, 3..4).
  const W = 16, H = 8;
  const idxFn = (x, y) => {
    if (x >= 14) return 255;                         // sea (right columns)
    if (x === 1 && y === 2) return 0;                // green source
    if (y === 2 && x >= 2 && x <= 10) return 3;      // small river line
    if (x === 5 && y === 5) return 1;                // red flow-in
    if (x >= 8 && x <= 9 && y >= 3 && y <= 4) return 11; // thick 2x2 large-river band
    return 254;                                      // land
  };
  const riversPath = path.join(mod, "map", "rivers.bmp");
  mk(riversPath, bmp8(W, H, PAL, idxFn));
  const origBuf = fs.readFileSync(riversPath);
  const origMeta = md.readIndexedBmp(origBuf);

  try {
    const r = md.clearAllRivers({ modRoot: mod });
    ok("clear reports ok + changed", r.ok === true && r.changed === true, r);
    ok("it identified the grey land index (254)", r.landIdx === 254, r);
    // count river pixels in the original to know how many should have been cleared
    let origRiver = 0; for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const v = origBuf[origMeta.pixelOffset(x, y)]; if ([0, 1, 3, 11].includes(v)) origRiver++; }
    ok("cleared exactly the river-pixel count", r.cleared === origRiver, { cleared: r.cleared, origRiver });

    const newBuf = fs.readFileSync(riversPath);
    const newMeta = md.readIndexedBmp(newBuf);
    let riverLeft = 0, landKept = true, seaKept = true;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const v = newBuf[newMeta.pixelOffset(x, y)];
      if ([0, 1, 3, 11].includes(v)) riverLeft++;                                  // any river pixel remaining?
      const o = origBuf[origMeta.pixelOffset(x, y)];
      if (o === 254 && v !== 254) landKept = false;                                // land must stay land
      if (o === 255 && v !== 255) seaKept = false;                                 // sea must stay sea
    }
    ok("NO river pixels remain (all types: source/flow/small/large band)", riverLeft === 0, { riverLeft });
    ok("grey LAND background is preserved", landKept);
    ok("white SEA background is preserved", seaKept);
    // #a-backup-must-not-ship-with-the-mod — the backup is Nova's, not the mod's. safeModWrite copies the
    // original into the backups folder under AppData; an 11.5 MB rivers.bmp.bak inside map/ ships to the
    // Workshop and HOI4 never reads it. test-a-backup-must-not-ship-with-the-mod.js asserts the previous
    // bytes are still recoverable from there.
    ok("NO .bak was left beside rivers.bmp", !fs.existsSync(riversPath + ".bak"));
    ok("BMP header (first 54 bytes) unchanged", origBuf.slice(0, 54).equals(newBuf.slice(0, 54)));
    ok("256-colour palette unchanged", origBuf.slice(54, 54 + 256 * 4).equals(newBuf.slice(54, 54 + 256 * 4)));

    // Idempotent: a second clear finds nothing.
    const r2 = md.clearAllRivers({ modRoot: mod });
    ok("a second clear finds nothing to do (idempotent)", r2.ok === true && r2.changed === false && r2.cleared === 0, r2);

    console.log(`\ntest-map-clear-rivers: ${pass} checks passed`);
  } finally { try { fs.rmSync(mod, { recursive: true, force: true }); } catch (_) {} }
})();
