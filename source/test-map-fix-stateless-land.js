// Unit test: fixStatelessLand — repairs a passable LAND province that belongs to no state (HOI4 flags it as a
// map-definition error → "Failed to load the map"). It finds a land neighbour that IS in a state and adds the
// orphan to that state. This is the tail of the inland-sea repair chain (erase→water→revert-to-land can leave
// a stateless province). Builds a synthetic provinces.bmp + states. Run: node test-map-fix-stateless-land.js
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
const COL = { 1: [200, 0, 0], 2: [0, 200, 0], 3: [0, 0, 200] };
const provAtX = (x) => (x <= 5 ? 1 : x <= 11 ? 2 : 3); // 1 | 2(stateless) | 3

(() => {
  console.log("=== fixStatelessLand (orphan land province → a neighbour's state) ===");
  const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-stateless-"));
  mk(path.join(mod, "descriptor.mod"), 'name="Stateless"\nreplace_path="history/states"\nreplace_path="map"\n');
  mk(path.join(mod, "map", "provinces.bmp"), bmp24(18, 4, (x) => COL[provAtX(x)]));
  mk(path.join(mod, "map", "definition.csv"), [
    "0;0;0;0;land;false;unknown;0;",
    "1;200;0;0;land;false;plains;3;",
    "2;0;200;0;land;false;desert;3;",  // STATELESS land (in no state) → must be added to a neighbour's state
    "3;0;0;200;land;false;hills;3;",
  ].join("\r\n") + "\r\n");
  const st = (id, provs) => `state = {\n\tid = ${id}\n\tname = "STATE_${id}"\n\tstate_category = rural\n\tprovinces = { ${provs} }\n\thistory = { owner = AAA }\n}\n`;
  mk(path.join(mod, "history", "states", "100.txt"), st(100, "1")); // owns prov 1
  mk(path.join(mod, "history", "states", "200.txt"), st(200, "3")); // owns prov 3 (prov 2 is in NEITHER)
  const provincesOf = (id) => { const m = /provinces\s*=\s*\{([^}]*)\}/.exec(fs.readFileSync(path.join(mod, "history", "states", id + ".txt"), "utf8")); return m ? (m[1].match(/\d+/g) || []).map(Number) : []; };

  try {
    const r = md.fixStatelessLand({ modRoot: mod });
    ok("fixes exactly 1 stateless province (prov 2)", r.fixed === 1 && r.details[0].province === 2, r);
    ok("adds it to a NEIGHBOUR's state (100 or 200)", [100, 200].includes(r.details[0].addedToState), r.details);
    const inState = provincesOf(r.details[0].addedToState).includes(2);
    ok("disk: state file now lists province 2", inState, { state: r.details[0].addedToState, provs: provincesOf(r.details[0].addedToState) });
    // re-scan: no stateless land remains
    const m2 = md.buildMapModel({ modRoot: mod });
    const seen = new Set(); for (const s of (m2.states || [])) for (const p of (s.provinces || [])) seen.add(p);
    const orphans = (m2.provinces || []).filter((p) => p.type === "land" && p.id > 0 && !seen.has(p.id));
    ok("no stateless land remains after the fix", orphans.length === 0, orphans.map((p) => p.id));
    ok("idempotent — a second pass fixes nothing", md.fixStatelessLand({ modRoot: mod }).fixed === 0);

    console.log(`\ntest-map-fix-stateless-land: ${pass} checks passed`);
  } finally { try { fs.rmSync(mod, { recursive: true, force: true }); } catch (_) {} }
})();
