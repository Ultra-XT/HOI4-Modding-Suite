// Unit test: fixSeaProvinceLeftovers — scrubs land-data clinging to a SEA province. Erasing a coastal province
// to sea can leave the state still listing it, keeping its victory point and its province-keyed naval base —
// land data on a water province that HOI4 faults on while building the gamestate. Ground truth: vanilla has ZERO
// sea provinces in states (lakes are left alone). Run: node test-map-fix-sea-leftovers.js
"use strict";
const assert = require("assert");
const fs = require("fs"), os = require("os"), path = require("path");
const md = require("./map-data.js");
let pass = 0;
const ok = (n, c, x) => { assert.ok(c, n + (x !== undefined ? " -> " + JSON.stringify(x) : "")); console.log("  ok  " + n); pass++; };
const mk = (p, c) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, c); };

function bmp24(width, height, pixelFn) {
  const rowSize = (width * 3 + 3) & ~3, imageSize = rowSize * height;
  const buf = Buffer.alloc(54 + imageSize);
  buf.write("BM", 0, "ascii");
  buf.writeUInt32LE(54 + imageSize, 2); buf.writeUInt32LE(54, 10); buf.writeUInt32LE(40, 14);
  buf.writeInt32LE(width, 18); buf.writeInt32LE(height, 22); buf.writeUInt16LE(1, 26);
  buf.writeUInt16LE(24, 28); buf.writeUInt32LE(0, 30); buf.writeUInt32LE(imageSize, 34);
  for (let y = 0; y < height; y++) { let off = 54 + (height - 1 - y) * rowSize; for (let x = 0; x < width; x++) { const [r, g, b] = pixelFn(x, y); buf[off++] = b; buf[off++] = g; buf[off++] = r; } }
  return buf;
}
const COL = { 1: [200, 0, 0], 2: [0, 0, 200], 3: [0, 200, 0], 4: [90, 90, 90] };
const provAtX = (x) => (x <= 2 ? 1 : x <= 5 ? 2 : x <= 8 ? 3 : 4);

(() => {
  console.log("=== fixSeaProvinceLeftovers (land-data on a sea province) ===");
  const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-sealeft-"));
  mk(path.join(mod, "descriptor.mod"), 'name="SeaLeft"\nreplace_path="history/states"\nreplace_path="map"\n');
  mk(path.join(mod, "map", "provinces.bmp"), bmp24(12, 4, (x) => COL[provAtX(x)]));
  mk(path.join(mod, "map", "definition.csv"), [
    "0;0;0;0;land;false;unknown;0",
    "1;200;0;0;land;false;plains;1",
    "2;0;0;200;sea;false;ocean;0",   // SEA province wrongly referenced by the state below
    "3;0;200;0;land;false;plains;1",
    "4;90;90;90;lake;false;lakes;1", // a LAKE in the state — must be LEFT ALONE
  ].join("\r\n") + "\r\n");
  mk(path.join(mod, "history", "states", "100.txt"),
    'state = {\n\tid = 100\n\tname = "S100"\n\tstate_category = rural\n\tprovinces = { 1 2 3 4 }\n\thistory = {\n\t\towner = AAA\n\t\tvictory_points = { 2 5 }\n\t\tbuildings = {\n\t\t\t2 = { naval_base = 1 }\n\t\t}\n\t}\n}\n');
  const stateTxt = () => fs.readFileSync(path.join(mod, "history", "states", "100.txt"), "utf8");
  const provsOf = () => { const m = /provinces\s*=\s*\{([^}]*)\}/.exec(stateTxt()); return m ? (m[1].match(/\d+/g) || []).map(Number) : []; };

  try {
    const r = md.fixSeaProvinceLeftovers({ modRoot: mod });
    ok("removes the sea province from the state's provinces list", r.provincesRemoved === 1, r);
    ok("drops the victory point on the sea province", r.vpRemoved === 1, r);
    ok("deletes the naval base keyed to the sea province", r.navalRemoved === 1, r);
    ok("disk: provinces list no longer contains sea province 2", !provsOf().includes(2), provsOf());
    ok("disk: the LAKE (4) is left in the state", provsOf().includes(4), provsOf());
    ok("disk: land provinces 1 and 3 are untouched", provsOf().includes(1) && provsOf().includes(3), provsOf());
    ok("disk: the victory_points entry for 2 is gone", !/victory_points\s*=\s*\{[^}]*\b2\b/.test(stateTxt()), stateTxt());
    ok("disk: the naval_base block for 2 is gone", !/\b2\s*=\s*\{[^}]*naval_base/.test(stateTxt()), stateTxt());
    ok("idempotent — a second pass changes nothing", md.fixSeaProvinceLeftovers({ modRoot: mod }).provincesRemoved === 0);

    console.log(`\ntest-map-fix-sea-leftovers: ${pass} checks passed`);
  } finally { try { fs.rmSync(mod, { recursive: true, force: true }); } catch (_) {} }
})();
