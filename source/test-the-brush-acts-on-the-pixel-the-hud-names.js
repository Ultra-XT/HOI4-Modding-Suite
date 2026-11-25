// ⛔ #the-brush-acts-on-the-pixel-the-hud-names — THE PIXEL UNDER THE CURSOR IS THE ONE THE POINT FALLS INSIDE, FOR THE BRUSHES AS FOR THE HUD
// (tool campaign B1-11).
//
// imgXYAt, which the Erase, Terrain and Rivers brushes, the ruler and Move country read the cursor with, ROUNDED the image coordinate, while
// imgPixelAt (every click tool), the HUD and Paint shape FLOORED it. On a border A|B at zoom ~27, a Terrain click 75% across pixel A, where
// the HUD named A, set B. Every screen-to-image conversion on the page is read out of public/map.js (comments masked) and each must floor;
// imgXYAt and imgPixelAt are lifted and run at 25% and 75% across one pixel, at several zooms. Binds no port.
// Run: node test-the-brush-acts-on-the-pixel-the-hud-names.js
"use strict";
const vm = require("vm");
const { lift, MASKED } = require("./testlib-map-page.js");

let pass = 0, fail = 0;
const ok = (c, m, x) => {
  if (c) { pass++; console.log("  ok   " + m); }
  else { fail++; console.log("  FAIL " + m + (x !== undefined ? "\n       " + JSON.stringify(x).slice(0, 600) : "")); }
};

console.log("=== 1. every conversion from the cursor to an image pixel floors ===");
const CONV = /(Math\.\w+)\(\((?:e\.)?(?:clientX|clientY|cx|cy) - (?:rect|r)\.(?:left|top) - off[XY]\) \/ scale\)/g;
const found = [...MASKED.matchAll(CONV)].map((m) => ({ fn: m[1], line: MASKED.slice(0, m.index).split("\n").length, text: m[0] }));
console.log("  read from public/map.js: " + found.map((f) => `${f.fn} @${f.line}`).join(", "));
ok(found.length >= 6, "the conversions are read from the page (imgXYAt, imgPixelAt, the HUD, Paint shape: x and y each)", found.length);
for (const f of found) ok(f.fn === "Math.floor", `line ${f.line}: ${f.text}`, f);

console.log("=== 2. imgXYAt and imgPixelAt name the same pixel, anywhere inside it ===");
const code = lift("function imgXYAt(") + "\n" + lift("function imgPixelAt(") + "\nglobalThis.__f = { imgXYAt, imgPixelAt };";
const W = 40, H = 30;
const data = new Uint8ClampedArray(W * H * 4);
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = (y * W + x) * 4; data[i] = x; data[i + 1] = y; data[i + 2] = 7; }
for (const scale of [0.5, 1, 3, 27]) {
  const sb = { canvas: { getBoundingClientRect: () => ({ left: 10, top: 20 }) }, offX: 4, offY: -6, scale, imgW: W, imgH: H, baseImageData: { data } };
  vm.createContext(sb); vm.runInContext(code, sb);
  const bad = [];
  for (const px of [3, 17, 38]) for (const py of [2, 21]) for (const fx of [0.1, 0.25, 0.5, 0.75, 0.9]) for (const fy of [0.25, 0.75]) {
    const cx = 10 + 4 + (px + fx) * scale, cy = 20 - 6 + (py + fy) * scale;
    const a = sb.__f.imgXYAt(cx, cy), k = sb.__f.imgPixelAt(cx, cy);
    const kx = (k >> 16) & 255, ky = (k >> 8) & 255;
    if (a.x !== px || a.y !== py || kx !== px || ky !== py) bad.push({ px, py, fx, fy, imgXYAt: a, imgPixelAt: [kx, ky] });
  }
  ok(!bad.length, `zoom ${scale}: a point anywhere inside pixel (x, y) is that pixel for both`, bad.slice(0, 3));
}
{
  const sb = { canvas: { getBoundingClientRect: () => ({ left: 0, top: 0 }) }, offX: 0, offY: 0, scale: 2, imgW: W, imgH: H, baseImageData: { data } };
  vm.createContext(sb); vm.runInContext(code, sb);
  const a = sb.__f.imgXYAt(-5, -5), b = sb.__f.imgXYAt(9999, 9999);
  ok(a.x === 0 && a.y === 0 && b.x === W - 1 && b.y === H - 1, "imgXYAt still clamps to the image", { a, b });
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
