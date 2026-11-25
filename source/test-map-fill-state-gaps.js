// Unit test: fillMissingStateGaps — repairs a MISSING STATE-ID gap, the fatal MAP_ERROR ("Definition for state
// id N is either missing or invalid"). HOI4 needs state ids 1..max with NO holes; deleting a middle state (e.g.
// erasing its last province) crashes on launch. The fixer re-creates each gap state with one land province
// carved from the largest neighbour, inheriting its owner. Run: node test-map-fill-state-gaps.js
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
const COL = { 1: [10, 0, 0], 2: [20, 0, 0], 3: [30, 0, 0], 4: [40, 0, 0], 5: [50, 0, 0] };
const provAtX = (x) => Math.min(5, Math.floor(x / 2) + 1);

(() => {
  console.log("=== fillMissingStateGaps (missing state-id gap) ===");
  const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-stategap-"));
  mk(path.join(mod, "descriptor.mod"), 'name="Gap"\nreplace_path="history/states"\nreplace_path="map"\n');
  mk(path.join(mod, "map", "provinces.bmp"), bmp24(10, 4, (x) => COL[provAtX(x)]));
  mk(path.join(mod, "map", "definition.csv"), [
    "0;0;0;0;land;false;unknown;0", "1;10;0;0;land;false;plains;1", "2;20;0;0;land;false;plains;1",
    "3;30;0;0;land;false;plains;1", "4;40;0;0;land;false;plains;1", "5;50;0;0;land;false;plains;1",
  ].join("\r\n") + "\r\n");
  const st = (id, provs, owner) => `state = {\n\tid = ${id}\n\tname = "S${id}"\n\tstate_category = rural\n\tprovinces = { ${provs} }\n\thistory = { owner = ${owner} }\n}\n`;
  mk(path.join(mod, "history", "states", "1.txt"), st(1, "1 2 3", "AAA")); // donor (3 land provinces)
  mk(path.join(mod, "history", "states", "2.txt"), st(2, "4", "AAA"));
  mk(path.join(mod, "history", "states", "4.txt"), st(4, "5", "AAA")); // GAP at 3 (max id 4)

  try {
    const r = md.fillMissingStateGaps({ modRoot: mod });
    ok("fills exactly the 1 gap (state 3)", r.filled === 1 && r.details[0].id === 3, r);
    ok("carves the province from the largest donor (state 1)", r.details[0].fromState === 1, r.details);
    ok("inherits the donor's owner", r.details[0].owner === "AAA", r.details);
    const m = md.buildMapModel({ modRoot: mod });
    const ids = new Set((m.states || []).map((s) => s.id)); const max = [...ids].reduce((a, b) => Math.max(a, b), 0);
    let gaps = 0; for (let i = 1; i <= max; i++) if (!ids.has(i)) gaps++;
    ok("no state-id gaps remain", gaps === 0, { ids: [...ids].sort((a, b) => a - b), max });
    const s3 = (m.states || []).find((s) => s.id === 3);
    ok("new state 3 exists with one land province", s3 && (s3.provinces || []).length === 1, s3);
    ok("donor state 1 shrank to 2 provinces", ((m.states || []).find((s) => s.id === 1).provinces || []).length === 2, (m.states || []).find((s) => s.id === 1));
    ok("idempotent — a second pass fills nothing", md.fillMissingStateGaps({ modRoot: mod }).filled === 0);
    console.log(`\ntest-map-fill-state-gaps: ${pass} checks passed`);
  } finally { try { fs.rmSync(mod, { recursive: true, force: true }); } catch (_) {} }
})();
