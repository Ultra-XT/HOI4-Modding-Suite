// Two fixFractionedRegions behaviors found by an in-game launch comparison on Millennium Dawn (the game flagged
// fractioned provinces Nova missed, and Nova over-flagged one the game didn't):
//   (1) NAVAL = "contains a sea province" (the in-game rule), NOT "≥half water". A sub-half-water naval region
//       (e.g. "Taiwan Strait", 19% water) with a cut-off coastal-land member was being SKIPPED → missed error.
//   (2) adjacencies.csv sea STRAITS connect their two provinces, so a member reachable only by a strait is NOT
//       fractioned — the pixel-only graph was over-flagging strait-connected provinces.
// Run: node test-map-fractioned-naval-and-straits.js
"use strict";
const assert = require("assert");
const fs = require("fs"), os = require("os"), path = require("path");
const md = require("./map-data.js");
let pass = 0;
const ok = (n, c, x) => { assert.ok(c, n + (x !== undefined ? " -> " + JSON.stringify(x) : "")); console.log("  ok  " + n); pass++; };
const mk = (p, c) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, c); };
function bmp24(width, height, fn) {
  const rowSize = (width * 3 + 3) & ~3, imageSize = rowSize * height; const buf = Buffer.alloc(54 + imageSize);
  buf.write("BM", 0, "ascii"); buf.writeUInt32LE(54 + imageSize, 2); buf.writeUInt32LE(54, 10); buf.writeUInt32LE(40, 14);
  buf.writeInt32LE(width, 18); buf.writeInt32LE(height, 22); buf.writeUInt16LE(1, 26); buf.writeUInt16LE(24, 28); buf.writeUInt32LE(0, 30); buf.writeUInt32LE(imageSize, 34);
  for (let y = 0; y < height; y++) { let off = 54 + (height - 1 - y) * rowSize; for (let x = 0; x < width; x++) { const [r, g, b] = fn(x, y); buf[off++] = b; buf[off++] = g; buf[off++] = r; } }
  return buf;
}
const reg = (id, provs) => `strategic_region = {\n\tid = ${id}\n\tname = "R${id}"\n\tprovinces = { ${provs} }\n}\n`;

// ── (1) sub-half-water naval region (25% water) whose cut-off land member must still be flagged ──
(() => {
  console.log("=== naval = has-sea: a 25%-water region's cut-off land member is flagged ===");
  const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-frac-navhassea-"));
  const COL = {}; for (let i = 1; i <= 8; i++) COL[i] = [i * 20, 0, 0];
  const provAt = (x, y) => { const c = Math.floor(x / 2); return (y < 2 ? [1, 2, 3, 4] : [5, 6, 7, 8])[c]; };
  mk(path.join(mod, "descriptor.mod"), 'name="F2"\nreplace_path="map"\n');
  mk(path.join(mod, "map", "provinces.bmp"), bmp24(8, 4, (x, y) => COL[provAt(x, y)]));
  mk(path.join(mod, "map", "definition.csv"), [
    "0;0;0;0;land;false;unknown;0",
    "1;20;0;0;sea;false;ocean;0",    // region 100 — the ONLY sea (1 of 4 = 25% water)
    "2;40;0;0;land;false;plains;1",  // region 100 — touches sea 1
    "3;60;0;0;land;false;plains;1",  // region 100 — touches 2
    "4;80;0;0;land;false;plains;1",  // region 200
    "5;100;0;0;land;false;plains;1", // region 400
    "6;120;0;0;land;false;plains;1", // region 400
    "7;140;0;0;land;false;plains;1", // region 300
    "8;160;0;0;land;false;plains;1", // region 100 — CUT OFF (touches only 4 + 7, neither in region 100)
  ].join("\r\n") + "\r\n");
  mk(path.join(mod, "map", "strategicregions", "r.txt"), reg(100, "1 2 3 8") + reg(200, "4") + reg(300, "7") + reg(400, "5 6"));
  try {
    const dry = md.fixFractionedRegions({ modRoot: mod, dryRun: true });
    ok("region 100 is only 25% water but still naval → cut-off land member 8 is flagged", (dry.provinces || []).includes(8), dry);
    const r = md.fixFractionedRegions({ modRoot: mod });
    ok("auto-fix re-homes province 8 out of region 100", r.moved >= 1, r);
    ok("8 left region 100", md.buildMapModel({ modRoot: mod }).provinceToRegion[8] !== 100);
    ok("idempotent — second pass moves nothing", md.fixFractionedRegions({ modRoot: mod }).moved === 0);
  } finally { try { fs.rmSync(mod, { recursive: true, force: true }); } catch (_) {} }
})();

// ── (2) a sea strait keeps a region contiguous (no false fractioned) ──
(() => {
  console.log("=== adjacencies.csv strait keeps a region contiguous (no false fractioned) ===");
  const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-frac-strait-"));
  const COL = { 1: [20, 0, 0], 2: [40, 0, 0], 3: [60, 0, 0], 4: [80, 0, 0] };
  const provAt = (x) => (x < 1 ? 1 : x < 2 ? 2 : x < 3 ? 3 : 4); // 4px wide, 1 province each
  mk(path.join(mod, "descriptor.mod"), 'name="F3"\nreplace_path="map"\n');
  mk(path.join(mod, "map", "provinces.bmp"), bmp24(4, 1, (x) => COL[provAt(x)]));
  mk(path.join(mod, "map", "definition.csv"), [
    "0;0;0;0;land;false;unknown;0",
    "1;20;0;0;sea;false;ocean;0",   // region 100
    "2;40;0;0;land;false;plains;1", // region 200 — splits 1 from 3 in pixels
    "3;60;0;0;sea;false;ocean;0",   // region 100 — only reachable from 1 via a strait
    "4;80;0;0;sea;false;ocean;0",   // region 300 — gives the fragment a naval re-home target
  ].join("\r\n") + "\r\n");
  mk(path.join(mod, "map", "strategicregions", "r.txt"), reg(100, "1 3") + reg(200, "2") + reg(300, "4"));
  try {
    const noStrait = md.fixFractionedRegions({ modRoot: mod, dryRun: true });
    ok("without a strait, region 100's two seas are detected as fractioned", (noStrait.provinces || []).length > 0, noStrait);
    mk(path.join(mod, "map", "adjacencies.csv"), "From;To;Type;Through;start_x;start_y;stop_x;stop_y;adjacency_rule_name;Comment\n1;3;sea;2;-1;-1;-1;-1;;test-strait\n");
    const withStrait = md.fixFractionedRegions({ modRoot: mod, dryRun: true });
    ok("with the adjacencies.csv strait, region 100 is NOT fractioned", (withStrait.provinces || []).length === 0, withStrait);
  } finally { try { fs.rmSync(mod, { recursive: true, force: true }); } catch (_) {} }
})();

console.log(`\ntest-map-fractioned-naval-and-straits: ${pass} checks passed`);
