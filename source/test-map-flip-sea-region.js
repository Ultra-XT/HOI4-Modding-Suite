// Unit test: flipProvinceToSea re-files the new sea into the adjacent OCEAN's naval strategic region.
// A coastal land province flipped to sea must NOT stay in its old LAND region — that leaves "dead water" the
// naval engine can't use, which loads but CTDs (IsMapInGoodState=no, access violation; confirmed against a real
// MD crash dump 2026-06-20). With a provinces.bmp + a naval region present, the flip must MOVE the province out
// of its land region into the ocean's region. Run: node test-map-flip-sea-region.js
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
// cols 0-3 = land prov 1 (coastal); cols 4-9 = sea prov 2 (the open ocean). Province 1 borders sea 2.
const COL = { 1: [200, 0, 0], 2: [0, 0, 200] };
const provAtX = (x) => (x < 4 ? 1 : 2);

(() => {
  console.log("=== flipProvinceToSea re-files new sea into the ocean's naval region ===");
  const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-flipsea-rgn-"));
  try {
    mk(path.join(mod, "descriptor.mod"), 'name="FlipRgn"\nreplace_path="history/states"\nreplace_path="map"\nreplace_path="map/strategicregions"\n');
    mk(path.join(mod, "map", "provinces.bmp"), bmp24(10, 4, (x) => COL[provAtX(x)]));
    mk(path.join(mod, "map", "definition.csv"), [
      "0;0;0;0;land;false;unknown;0",
      "1;200;0;0;land;true;plains;1",    // LAND, coastal, borders sea 2
      "2;0;0;200;sea;false;ocean;0",      // the ocean
    ].join("\r\n") + "\r\n");
    mk(path.join(mod, "history", "states", "1.txt"), 'state = {\n\tid = 1\n\tname = "S1"\n\tstate_category = rural\n\tprovinces = { 1 }\n\thistory = { owner = AAA }\n}\n');
    // region 100 = LAND (holds province 1); region 200 = NAVAL (holds the ocean, sea 2)
    mk(path.join(mod, "map", "strategicregions", "land.txt"), 'strategic_region={\n\tid=100\n\tname="LAND"\n\tprovinces={ 1 }\n\tweather={}\n}\n');
    mk(path.join(mod, "map", "strategicregions", "sea.txt"), 'strategic_region={\n\tid=200\n\tname="SEA"\n\tprovinces={ 2 }\n\tnaval_terrain=water_littoral\n\tweather={}\n}\n');
    const regionProvs = (file) => { const m = /provinces\s*=\s*\{([^}]*)\}/.exec(fs.readFileSync(path.join(mod, "map", "strategicregions", file), "utf8")); return m ? (m[1].match(/\d+/g) || []).map(Number) : []; };

    const r = md.flipProvinceToSea({ modRoot: mod, provinceId: 1 });
    ok("flip reports changed", r.changed === true, r);
    ok("province 1 became sea", r.type === "sea");
    ok("flip reports the target naval region (200)", r.navalRegion === 200, r.navalRegion);
    ok("province 1 LEAVES its old land region (100)", !regionProvs("land.txt").includes(1), regionProvs("land.txt"));
    ok("province 1 JOINS the ocean's naval region (200)", regionProvs("sea.txt").includes(1), regionProvs("sea.txt"));
    ok("the ocean province 2 stays in its naval region", regionProvs("sea.txt").includes(2));

    // Re-flipping the now-sea province is idempotent (already in the naval region → no move, no error).
    const r2 = md.flipProvinceToSea({ modRoot: mod, provinceId: 1 });
    ok("re-flip is idempotent (already in the naval region)", r2.type === "sea" && regionProvs("sea.txt").filter((p) => p === 1).length === 1, regionProvs("sea.txt"));

    console.log(`\ntest-map-flip-sea-region: ${pass} checks passed`);
  } finally { try { fs.rmSync(mod, { recursive: true, force: true }); } catch (_) {} }
})();
