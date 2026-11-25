// The 24-bit BMP encoder/decoder is the scariest map-corruption surface: a wrong header or row padding
// makes HOI4 fail to load the map. Lock the round-trip (writeBmp24 → readBmp24 = same pixels/dims), the
// header validity, the 4-byte row padding, and top-down (negative-height) decoding.
"use strict";
const md = require("./map-data.js");

let pass = 0, fail = 0;
const check = (n, c, e) => { if (c) { pass++; console.log("  PASS", n); } else { fail++; console.log("  FAIL", n, e != null ? "→ " + e : ""); } };

// A 5x3 image (width 5 → row = (5*3+3)&~3 = 16 bytes, i.e. 1 byte of padding per row — the tricky case).
const width = 5, height = 3;
const rgb = new Uint8Array(width * height * 3);
for (let i = 0; i < width * height; i++) { rgb[i * 3] = (i * 7) & 255; rgb[i * 3 + 1] = (i * 13) & 255; rgb[i * 3 + 2] = (i * 29) & 255; }

const buf = md.writeBmp24({ width, height, rgb });

// Header validity (HOI4 needs uncompressed 24-bit).
check("starts with 'BM' signature", buf[0] === 0x42 && buf[1] === 0x4d);
check("pixel data offset = 54", buf.readUInt32LE(10) === 54);
check("DIB header size = 40", buf.readUInt32LE(14) === 40);
check("width in header", buf.readInt32LE(18) === width);
check("height in header (bottom-up, positive)", buf.readInt32LE(22) === height);
check("bit depth = 24", buf.readUInt16LE(28) === 24);
check("compression = 0 (none)", buf.readUInt32LE(30) === 0);
const rowSize = (width * 3 + 3) & ~3;
check("file size = 54 + rowSize*height", buf.length === 54 + rowSize * height, buf.length + " vs " + (54 + rowSize * height));
check("rows are 4-byte aligned (padding present)", rowSize === 16);

// Round-trip: decode and compare every pixel.
const back = md.readBmp24(buf);
check("round-trip width", back.width === width);
check("round-trip height", back.height === height);
let pixelMatch = back.rgb.length === rgb.length;
for (let i = 0; i < rgb.length && pixelMatch; i++) if (back.rgb[i] !== rgb[i]) pixelMatch = false;
check("round-trip pixels identical", pixelMatch);

// Padding bytes must be zero (some loaders are picky; HOI4 expects clean rows).
let paddingZero = true;
for (let y = 0; y < height && paddingZero; y++) {
  for (let p = width * 3; p < rowSize; p++) if (buf[54 + y * rowSize + p] !== 0) paddingZero = false;
}
check("row padding bytes are zero", paddingZero);

// A top-down BMP (negative height) must decode to the same logical pixels. Build one by hand from buf.
const td = Buffer.from(buf);
td.writeInt32LE(-height, 22); // flip to top-down
// reorder rows so logical image is unchanged: writeBmp24 stored bottom-up; for top-down we reverse rows.
const body = Buffer.alloc(rowSize * height);
for (let y = 0; y < height; y++) buf.copy(body, y * rowSize, 54 + (height - 1 - y) * rowSize, 54 + (height - y) * rowSize);
body.copy(td, 54);
const backTD = md.readBmp24(td);
let tdMatch = backTD.width === width && backTD.height === height && backTD.rgb.length === rgb.length;
for (let i = 0; i < rgb.length && tdMatch; i++) if (backTD.rgb[i] !== rgb[i]) tdMatch = false;
check("top-down (negative height) decodes to same pixels", tdMatch);

// Rejects non-BMP and wrong bit depth.
check("rejects non-BMP buffer", (() => { try { md.readBmp24(Buffer.alloc(54)); return false; } catch (_) { return true; } })());

console.log(`\nBMP-ROUNDTRIP TEST: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
