// Unit test: fixStatelessLand must home an ISLAND too — a stateless land province whose ONLY neighbour is sea
// (no land path to any state). The land-neighbour pass can never reach it, so before the fix it landed in
// `skipped` and stayed `land_not_in_state` (a crash) — the exact near-miss left over after a paint stress on MD.
// Now it falls back to the GEOGRAPHICALLY NEAREST stated land province's state. Run: node test-map-stateless-island.js
"use strict";
const assert = require("assert");
const fs = require("fs"), os = require("os"), path = require("path");
const md = require("./map-data.js");
let pass = 0;
const ok = (n, c, x) => { assert.ok(c, n + (x !== undefined ? " -> " + JSON.stringify(x) : "")); console.log("  ok  " + n); pass++; };
const mk = (p, c) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, c); };
function bmp24(w, h, fn) {
  const rs = (w * 3 + 3) & ~3, is = rs * h; const b = Buffer.alloc(54 + is);
  b.write("BM", 0, "ascii"); b.writeUInt32LE(54 + is, 2); b.writeUInt32LE(54, 10); b.writeUInt32LE(40, 14);
  b.writeInt32LE(w, 18); b.writeInt32LE(h, 22); b.writeUInt16LE(1, 26); b.writeUInt16LE(24, 28); b.writeUInt32LE(0, 30); b.writeUInt32LE(is, 34);
  for (let y = 0; y < h; y++) { let o = 54 + (h - 1 - y) * rs; for (let x = 0; x < w; x++) { const [r, g, bl] = fn(x, y); b[o++] = bl; b[o++] = g; b[o++] = r; } }
  return b;
}
// horizontal strips: prov 1 (cols 0-1, LAND, stated) | prov 2 (cols 2-3, SEA) | prov 3 (cols 4-5, LAND island).
// Province 3's only neighbour is the sea (2) — it has NO land neighbour at all.
const COL = { 1: [10, 10, 10], 2: [20, 20, 20], 3: [30, 30, 30] };
const provAtX = (x) => (x <= 1 ? 1 : x <= 3 ? 2 : 3);

(() => {
  console.log("=== fixStatelessLand homes an island (only sea neighbours) via nearest-state fallback ===");
  const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-island-"));
  mk(path.join(mod, "descriptor.mod"), 'name="ISL"\nreplace_path="history/states"\nreplace_path="map"\n');
  mk(path.join(mod, "map", "provinces.bmp"), bmp24(6, 2, (x) => COL[provAtX(x)]));
  mk(path.join(mod, "map", "definition.csv"), ["0;0;0;0;land;false;unknown;0", "1;10;10;10;land;false;plains;1", "2;20;20;20;sea;false;ocean;0", "3;30;30;30;land;false;plains;1"].join("\n") + "\n");
  mk(path.join(mod, "map", "strategicregions", "00.txt"), "strategic_region = {\n\tid = 1\n\tname = \"R1\"\n\tprovinces = { 1 2 3 }\n}\n");
  // Only province 1 is in a state; province 3 is a stateless land island (its only neighbour is sea province 2).
  mk(path.join(mod, "history", "states", "10.txt"), 'state = {\n\tid = 10\n\tname = "S10"\n\tmanpower = 1000\n\tprovinces = { 1 }\n\thistory = { owner = AAA }\n}\n');
  const statelessLand = () => { const m = md.buildMapModel({ modRoot: mod }); const inS = new Set(); for (const s of m.states) for (const p of s.provinces || []) inS.add(p); return (m.provinces || []).filter((p) => p.type === "land" && p.id > 0 && !inS.has(p.id)).map((p) => p.id); };

  try {
    ok("setup: province 3 starts a stateless land island", JSON.stringify(statelessLand()) === "[3]", statelessLand());
    const r = md.fixStatelessLand({ modRoot: mod });
    ok("homes the island (none skipped)", r.fixed === 1 && (r.skipped || []).length === 0, r);
    ok("it was assigned to nearest state 10 by distance", r.details.some((d) => d.province === 3 && d.addedToState === 10 && d.viaDistance), r.details);
    ok("no stateless land remains", statelessLand().length === 0, statelessLand());
    ok("validator clean of land_not_in_state", !md.validateMapModel(md.buildMapModel({ modRoot: mod })).some((p) => p.rule === "land_not_in_state"));
    ok("idempotent — a second pass fixes nothing", md.fixStatelessLand({ modRoot: mod }).fixed === 0);
    console.log(`\ntest-map-stateless-island: ${pass} checks passed`);
  } finally { try { fs.rmSync(mod, { recursive: true, force: true }); } catch (_) {} }
})();
