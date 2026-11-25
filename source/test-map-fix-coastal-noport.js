// Unit test: fixCoastalNoPort — repairs a coastal province with no port (map.cpp:1628 "setup as coastal but has
// no port building... will likely crash"). Erasing a neighbour to sea turns an inland LAND province coastal
// (bitmap-derived), but it has no naval_base_spawn → crash. The fixer adds a spawn at the coast pointing to the
// adjacent sea and flips the CSV coastal flag to true. Run: node test-map-fix-coastal-noport.js
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
// columns 0-4 = land province 1, 5-9 = sea province 2  (province 1 borders sea 2, but is flagged coastal=false)
const COL = { 1: [200, 0, 0], 2: [0, 0, 200] };
const provAtX = (x) => (x < 5 ? 1 : 2);

(() => {
  console.log("=== fixCoastalNoPort (coastal province with no port) ===");
  const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-coastnp-"));
  mk(path.join(mod, "descriptor.mod"), 'name="CoastNP"\nreplace_path="history/states"\nreplace_path="map"\n');
  mk(path.join(mod, "map", "provinces.bmp"), bmp24(10, 4, (x) => COL[provAtX(x)]));
  mk(path.join(mod, "map", "definition.csv"), [
    "0;0;0;0;land;false;unknown;0",
    "1;200;0;0;land;false;plains;1",  // LAND, flagged coastal=FALSE but borders sea 2 (no port) → must be fixed
    "2;0;0;200;sea;false;ocean;0",
  ].join("\r\n") + "\r\n");
  mk(path.join(mod, "map", "buildings.txt"), "1;arms_factory;1.0;9.5;1.0;0.0;0\r\n"); // no naval_base_spawn anywhere
  mk(path.join(mod, "history", "states", "1.txt"), 'state = {\n\tid = 1\n\tname = "S1"\n\tstate_category = rural\n\tprovinces = { 1 }\n\thistory = { owner = AAA }\n}\n');
  const buildings = () => fs.readFileSync(path.join(mod, "map", "buildings.txt"), "utf8");
  const defLine = (id) => (fs.readFileSync(path.join(mod, "map", "definition.csv"), "utf8").split(/\r?\n/).find((l) => l.split(";")[0] === String(id)) || "");

  try {
    const dry = md.fixCoastalNoPort({ modRoot: mod, dryRun: true }); // the validator's detection path
    ok("dryRun detects the portless province and writes nothing", dry.added === 0 && dry.targets && dry.targets[0] === 1 && !/naval_base_spawn/.test(buildings()), dry);
    const r = md.fixCoastalNoPort({ modRoot: mod });
    ok("adds a port for the 1 portless coastal province", r.added === 1 && r.provinces[0] === 1, r);
    const spawn = buildings().split(/\r?\n/).find((l) => /;naval_base_spawn;/.test(l));
    ok("buildings.txt gains a naval_base_spawn line", !!spawn, buildings());
    ok("the spawn is keyed to the owning state (1) and the adjacent sea (2)", spawn && /^1;naval_base_spawn;/.test(spawn) && /;2$/.test(spawn.trim()), spawn);
    ok("the unrelated arms_factory line is preserved", /;arms_factory;/.test(buildings()), buildings());
    ok("the province's CSV coastal flag is flipped to true", defLine(1).split(";")[5] === "true", defLine(1));
    ok("idempotent — a second pass adds nothing (it now has a spawn)", md.fixCoastalNoPort({ modRoot: mod }).added === 0);
    console.log(`\ntest-map-fix-coastal-noport: ${pass} checks passed`);
  } finally { try { fs.rmSync(mod, { recursive: true, force: true }); } catch (_) {} }
})();
