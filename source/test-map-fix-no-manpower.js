// Unit test: fixStateNoManpower — populates a LAND state that has no manpower (HOI4 warns "State #N has no
// people living in it" — the "deleted land became empty land" case). The crash-safe fix is to give it people
// (a state can't be deleted without a state-id gap). Also covers the state_no_manpower validator rule and the
// createState default. Run: node test-map-fix-no-manpower.js
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
const COL = { 1: [200, 0, 0], 2: [0, 200, 0], 3: [0, 0, 200] };
const provAtX = (x) => (x <= 2 ? 1 : x <= 5 ? 2 : 3);

(() => {
  console.log("=== fixStateNoManpower (a land state with no people) ===");
  const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-nomp-"));
  mk(path.join(mod, "descriptor.mod"), 'name="NoMp"\nreplace_path="history/states"\nreplace_path="map"\n');
  mk(path.join(mod, "map", "provinces.bmp"), bmp24(9, 4, (x) => COL[provAtX(x)]));
  mk(path.join(mod, "map", "definition.csv"), [
    "0;0;0;0;land;false;unknown;0", "1;200;0;0;land;false;plains;1", "2;0;200;0;land;false;plains;1", "3;0;0;200;sea;false;ocean;0",
  ].join("\r\n") + "\r\n");
  mk(path.join(mod, "history", "states", "100.txt"), 'state = {\n\tid = 100\n\tname = "S100"\n\tstate_category = rural\n\tprovinces = { 1 }\n\thistory = { owner = AAA }\n}\n'); // NO manpower
  mk(path.join(mod, "history", "states", "200.txt"), 'state = {\n\tid = 200\n\tname = "S200"\n\tmanpower = 5000\n\tstate_category = rural\n\tprovinces = { 2 }\n\thistory = { owner = AAA }\n}\n'); // has manpower
  mk(path.join(mod, "history", "states", "300.txt"), 'state = {\n\tid = 300\n\tname = "S300"\n\tprovinces = { 3 }\n\thistory = { owner = AAA }\n}\n'); // sea-only, no land
  const mpOf = (id) => { const m = /manpower\s*=\s*(\d+)/.exec(fs.readFileSync(path.join(mod, "history", "states", id + ".txt"), "utf8")); return m ? parseInt(m[1], 10) : 0; };

  try {
    const before = md.validateMapModel(md.buildMapModel({ modRoot: mod }));
    ok("validator flags the no-manpower land state (warning)", before.some((p) => p.rule === "state_no_manpower" && p.severity === "warning" && (p.states || []).includes(100)), before.filter((p) => p.rule === "state_no_manpower"));
    ok("validator does NOT flag the sea-only state (300)", !before.some((p) => p.rule === "state_no_manpower" && (p.states || []).includes(300)), before.filter((p) => p.rule === "state_no_manpower"));

    const r = md.fixStateNoManpower({ modRoot: mod });
    ok("fixes exactly the 1 no-manpower land state (100)", r.fixed === 1 && r.details[0].state === 100, r);
    ok("disk: state 100 now has a positive manpower", mpOf(100) > 0, mpOf(100));
    ok("disk: state 200 keeps its 5000 manpower (untouched)", mpOf(200) === 5000, mpOf(200));
    ok("disk: sea-only state 300 still has no manpower (skipped)", mpOf(300) === 0, mpOf(300));
    ok("validator is now clean of state_no_manpower", !md.validateMapModel(md.buildMapModel({ modRoot: mod })).some((p) => p.rule === "state_no_manpower"));
    ok("idempotent — a second pass fixes nothing", md.fixStateNoManpower({ modRoot: mod }).fixed === 0);

    // createState now defaults a non-zero manpower (prevention)
    const cs = md.createState({ modRoot: mod, name: "New", owner: "AAA", provinces: [1] });
    ok("createState writes a non-zero default manpower", cs.ok !== false && /manpower\s*=\s*[1-9]/.test(fs.readFileSync(path.join(mod, "history", "states", cs.file), "utf8")), cs);

    console.log(`\ntest-map-fix-no-manpower: ${pass} checks passed`);
  } finally { try { fs.rmSync(mod, { recursive: true, force: true }); } catch (_) {} }
})();
