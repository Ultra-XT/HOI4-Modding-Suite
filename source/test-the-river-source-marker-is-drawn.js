// The river SOURCE marker must actually be drawn. #the-river-source-marker-was-never-drawn
//
// HOI4 needs exactly one green (0,255,0) source pixel per river, or it draws nothing for that river at all.
// Nova's palette offers it as "🟢 Source", and Nova's own auto-fix ADDS one when a river has none
// (#a-river-without-a-source-is-invisible, which reports "Nova added the green source pixel at x,y").
//
// isRiverBackground returned true for green — "green marker / synthetic land" — so buildRiversOverlayRGBA
// made every source fully transparent. The modder could not see the marker they were told to place, could
// not see the one Nova placed for them, and could not see the ones the base game ships.
//
// ⚠️ The unit fixture hid it: it used GREEN as its land background, so "land pixel is transparent" passed
// for the very reason the real markers were vanishing. That is why this test measures the SHIPPED maps.
"use strict";
const fs = require("fs");
const path = require("path");
const md = require("./map-data.js");

let pass = 0;
const fails = [];
const ok = (cond, label, detail) => {
  if (cond === true) { pass++; console.log("  ok   " + label); }
  else { fails.push(label); console.log("  FAIL " + label + (detail !== undefined ? "   -> " + JSON.stringify(detail).slice(0, 300) : "")); }
};

console.log("\n=== the classifier ===");
{
  ok(md.isRiverBackground({ r: 0, g: 255, b: 0 }) === false,
    "⭐⭐⭐ green (0,255,0) is the SOURCE marker, not background");
  ok(md.isRiverBackground({ r: 122, g: 122, b: 122 }) === true, "…grey is still background");
  ok(md.isRiverBackground({ r: 255, g: 255, b: 255 }) === true, "…and so is white");
  const src = md.riverOverlayColor({ r: 0, g: 255, b: 0 });
  ok(src.a > 0, "⭐⭐ …and it is drawn opaque", src);
  ok(src.g > src.r && src.g > src.b, "⭐⭐ …in green, so it reads as a marker and not as water", src);
}

const GAME = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
const WS = "D:/SteamLibrary/steamapps/workshop/content/394360";
const roots = [];
if (fs.existsSync(path.join(GAME, "map", "rivers.bmp"))) roots.push(["vanilla", GAME]);
for (const id of fs.existsSync(WS) ? fs.readdirSync(WS) : []) {
  if (fs.existsSync(path.join(WS, id, "map", "rivers.bmp"))) roots.push([id, path.join(WS, id)]);
}

console.log("\n=== 🈯 …measured on every rivers.bmp installed ===");
if (!roots.length) {
  console.log("  ..   (no rivers.bmp on this machine — the corpus half cannot run)");
} else {
  let totalSources = 0, checked = 0;
  for (const [label, root] of roots) {
    const buf = fs.readFileSync(path.join(root, "map", "rivers.bmp"));
    const bmp = md.readIndexedBmp(buf);
    if (!bmp) continue;
    const near = (c, r, g, b, t) => c && Math.abs(c.r - r) <= (t || 20) && Math.abs(c.g - g) <= (t || 20) && Math.abs(c.b - b) <= (t || 20);
    let srcIdx = -1;
    for (let i = 0; i < bmp.palette.length; i++) if (near(bmp.palette[i], 0, 255, 0)) { srcIdx = i; break; }
    if (srcIdx < 0) continue;

    const ov = md.buildRiversOverlayRGBA(buf);
    let sources = 0, drawn = 0;
    for (let y = 0; y < bmp.height; y++) for (let x = 0; x < bmp.width; x++) {
      if (buf[bmp.pixelOffset(x, y)] !== srcIdx) continue;
      sources++;
      if (ov.rgba[(y * ov.width + x) * 4 + 3] !== 0) drawn++;
    }
    if (!sources) continue;
    checked++; totalSources += sources;
    ok(drawn === sources,
      `⭐⭐⭐ ${label}: all ${sources} river sources are drawn (was 0)`, { sources, drawn });
  }
  ok(checked >= 1, `${checked} map(s) carry source markers, ${totalSources} in total`, { checked, totalSources });
  ok(totalSources > 100,
    "⚠️ …and it is not a rounding error: there are hundreds of them across the corpus", totalSources);
}

console.log("\n=== ⚠️ CONTROL: the rest of the map is still transparent ===");
{
  // A bitmap of nothing but land and sea must paint no pixel at all — the regression the background check
  // exists to prevent (an early version painted a real map's whole surface blue).
  const pal = []; pal[0] = { r: 122, g: 122, b: 122 }; pal[1] = { r: 255, g: 255, b: 255 };
  const W = 8, H = 4, rowSize = ((W + 3) & ~3), dataOffset = 54 + 256 * 4;
  const buf = Buffer.alloc(dataOffset + rowSize * H);
  buf.write("BM", 0, "ascii");
  buf.writeUInt32LE(buf.length, 2); buf.writeUInt32LE(dataOffset, 10); buf.writeUInt32LE(40, 14);
  buf.writeInt32LE(W, 18); buf.writeInt32LE(H, 22); buf.writeUInt16LE(1, 26); buf.writeUInt16LE(8, 28);
  buf.writeUInt32LE(rowSize * H, 34); buf.writeUInt32LE(256, 46);
  for (let i = 0; i < 256; i++) { const c = pal[i] || { r: 0, g: 0, b: 0 }; const o = 54 + i * 4; buf[o] = c.b; buf[o + 1] = c.g; buf[o + 2] = c.r; }
  for (let y = 0; y < H; y++) { const row = dataOffset + (H - 1 - y) * rowSize; for (let x = 0; x < W; x++) buf[row + x] = x < 4 ? 0 : 1; }
  const ov = md.buildRiversOverlayRGBA(buf);
  let opaque = 0;
  for (let i = 3; i < ov.rgba.length; i += 4) if (ov.rgba[i] !== 0) opaque++;
  ok(opaque === 0,
    "⚠️⚠️ an all-land/sea bitmap still renders fully transparent — no blue blanket", opaque);
}

console.log(`\n=== the river source marker is drawn: ${pass} checks, ${fails.length} failed ===`);
fails.forEach((f) => console.log("   FAILED: " + f));
process.exit(fails.length ? 1 : 0);
