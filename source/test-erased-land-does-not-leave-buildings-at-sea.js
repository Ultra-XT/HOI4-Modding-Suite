// ⛔ #erased-land-leaves-its-buildings-standing-on-the-sea — THE ERASE TOOL SANK THE LAND AND LEFT THE
// FACTORIES FLOATING.
//
// Erasing a coastal province to water already retyped it, pulled it out of its state, dropped its supply
// node, trimmed it out of railways, moved it into the adjacent naval region, and deleted the state file's
// `provinceBuildings` block for it. For map/buildings.txt it dropped exactly one kind of row: a
// floating_harbor whose 7th column named the erased province — "a land model on sea", as the code puts it.
//
// Everything else places itself by (x,z) POSITION and was left where it was. Measured on the real game,
// vanilla province 13271 (Iceland, coastal), which carries 9 building rows:
//
//     dropped: 1  (the anchored floating_harbor)
//     left standing on open ocean: 8  — arms_factory, industrial_complex, bunker, dockyard,
//                                       naval_base_spawn, nuclear_reactor_spawn,
//                                       special_project_facility_spawn, naval_headquarters
//     Nova's own validator afterwards: 0 problems
//
// ⚠️ AND THE OBVIOUS FIX IS A TRAP. The placement scan deliberately leaves EVERY sea-pixel row alone,
// because vanilla's coastal buildings often sit a pixel into the water and the game snaps them back to land
// by a rule Nova cannot reproduce — dropping on that signal would delete thousands of real buildings. So the
// cleanup is gated on `waterIds`: the provinces THIS CALL just turned to water. Those were land a moment
// ago, so a row standing on one is a fact, not a heuristic. The whole-map backlog sweep passes no waterIds
// and must still drop nothing — that is the second half of this test, and it is the important half.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const md = require("./map-data.js");

let pass = 0;
const fails = [];
const ok = (cond, label, detail) => {
  if (cond === true) { pass++; console.log("  ok   " + label); }
  else { fails.push(label); console.log("  FAIL " + label + (detail !== undefined ? "   -> " + JSON.stringify(detail).slice(0, 320) : "")); }
};
const mk = (p, c) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, c); };

function bmp24(width, height, fn) {
  const rowSize = (width * 3 + 3) & ~3, imageSize = rowSize * height;
  const buf = Buffer.alloc(54 + imageSize);
  buf.write("BM", 0, "ascii"); buf.writeUInt32LE(54 + imageSize, 2); buf.writeUInt32LE(54, 10); buf.writeUInt32LE(40, 14);
  buf.writeInt32LE(width, 18); buf.writeInt32LE(height, 22); buf.writeUInt16LE(1, 26); buf.writeUInt16LE(24, 28);
  buf.writeUInt32LE(0, 30); buf.writeUInt32LE(imageSize, 34);
  for (let y = 0; y < height; y++) { let off = 54 + (height - 1 - y) * rowSize; for (let x = 0; x < width; x++) { const [r, g, b] = fn(x, y); buf[off++] = b; buf[off++] = g; buf[off++] = r; } }
  return buf;
}
// prov 1 (coastal land, the one erased) | prov 2 (land) | prov 3 (sea, so 1 really is coastal)
const COL = { 1: [200, 0, 0], 2: [0, 200, 0], 3: [0, 0, 200] };
const provAtX = (x) => (x <= 2 ? 1 : x <= 5 ? 2 : 3);
const W = 9, H = 4;
const ROWS = [
  "100;arms_factory;1.00;10.0;2.00;0.00;0",        // stands on prov 1  -> must go
  "100;dockyard;1.00;9.9;2.00;0.00;0",             // stands on prov 1  -> must go
  "100;naval_base_spawn;1.00;9.5;2.00;0.00;3",     // SEA anchor, stands on prov 1 -> must go
  "100;floating_harbor;1.00;9.5;2.00;0.00;1",      // anchored to prov 1 -> must go (already did)
  "100;bunker;4.00;10.0;2.00;0.00;0",              // stands on prov 2  -> must STAY
  "100;floating_harbor;4.00;9.5;2.00;0.00;2",      // anchored to prov 2 -> must STAY
  "100;radar_station;7.00;10.0;2.00;0.00;0",       // already over SEA before the erase -> must STAY
];
const rowsOf = (p) => fs.readFileSync(p, "utf8").split("\n").map((l) => l.replace(/\r$/, "")).filter((l) => l.includes(";"));

function makeMod(tmps) {
  const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-erasebldg-")); tmps.push(mod);
  mk(path.join(mod, "descriptor.mod"), 'name="EraseBldg"\nreplace_path="history/states"\nreplace_path="map"\n');
  mk(path.join(mod, "map", "provinces.bmp"), bmp24(W, H, (x) => COL[provAtX(x)]));
  mk(path.join(mod, "map", "definition.csv"), [
    "0;0;0;0;land;false;unknown;0", "1;200;0;0;land;true;plains;1", "2;0;200;0;land;false;plains;1", "3;0;0;200;sea;false;ocean;0",
  ].join("\r\n") + "\r\n");
  mk(path.join(mod, "history", "states", "100.txt"), 'state = {\n\tid = 100\n\tname = "S100"\n\tmanpower = 1000\n\tprovinces = { 1 2 }\n\thistory = { owner = AAA }\n}\n');
  mk(path.join(mod, "map", "buildings.txt"), ROWS.join("\n") + "\n");
  return mod;
}
const has = (rows, type, x) => rows.some((r) => { const c = r.split(";"); return c[1] === type && c[2] === x; });

const tmps = [];
(() => {
  console.log("\n=== erasing the province takes everything standing on it ===");
  const mod = makeMod(tmps);
  const res = md.flipProvinceToSea({ modRoot: mod, gameRoot: "", dependencyRoots: [], provinceId: 1 });
  ok(!res.error, "the erase succeeded", res.error);
  ok(res.type === "sea", "…and the province is water now", res.type);

  const rows = rowsOf(path.join(mod, "map", "buildings.txt"));
  ok(!has(rows, "arms_factory", "1.00"), "the arms_factory standing on it is gone", rows);
  ok(!has(rows, "dockyard", "1.00"), "…and the dockyard", rows);
  ok(!has(rows, "naval_base_spawn", "1.00"),
    "…and the naval_base_spawn, whose SEA anchor could never have found it", rows);
  ok(!has(rows, "floating_harbor", "1.00"), "…and the anchored harbor (which already worked)", rows);

  console.log("\n=== …and nothing that was not standing on it ===");
  {
    ok(has(rows, "bunker", "4.00"), "a building on the neighbouring province stays", rows);
    ok(has(rows, "floating_harbor", "4.00"), "…and a harbor anchored to that neighbour stays", rows);
    ok(has(rows, "radar_station", "7.00"),
      "…and a row that was ALREADY over sea before the erase is left alone", rows);
    // ⚠️ MOVED WITH #a-painted-state-leaves-its-source-every-kind-of-building. This pinned `rows.length === ROWS.length - 4`: nothing
    // written. The erase takes state 100's only arms_factory, and a state that loses the last row of a standard kind now gets that kind
    // back on the land it kept, as it gets an air base or rocket site back — so the rows written are exactly those, and the four still went.
    const back = rows.filter((r) => !ROWS.includes(r));
    const want = (md.STATE_BUILDING_SLOTS.find(([t]) => t === "arms_factory") || [])[1];
    ok(back.length === want && back.every((r) => { const c = r.split(";"); return c[0] === "100" && c[1] === "arms_factory" && provAtX(Math.floor(parseFloat(c[2]))) === 2; }),
      `…the one kind state 100 lost whole, arms_factory, is given back on the land it kept (${back.length} rows, the template's ${want})`, back);
    ok(rows.length - back.length === ROWS.length - 4, "exactly the four rows on the erased province went", { was: ROWS.length, now: rows.length, back: back.length });
  }

  console.log("\n=== ⭐ THE GUARD: the whole-map sweep must still drop nothing by position ===");
  {
    // Without waterIds there is no "this was land a second ago" fact — only the sea-pixel signal the
    // placement scan refuses to act on. Acting on it here would delete every coastal building on the map.
    const m2 = makeMod(tmps);
    const before = rowsOf(path.join(m2, "map", "buildings.txt")).length;
    // Make province 1 water in the DEFINITION only, so the sweep sees sea pixels under real buildings —
    // exactly the shape that must not trigger a mass delete.
    mk(path.join(m2, "map", "definition.csv"), [
      "0;0;0;0;land;false;unknown;0", "1;200;0;0;sea;false;ocean;0", "2;0;200;0;land;false;plains;1", "3;0;0;200;sea;false;ocean;0",
    ].join("\r\n") + "\r\n");
    const r = md.fixWaterSupplyRail({ modRoot: m2, gameRoot: "", dependencyRoots: [] });   // no waterIds
    const after = rowsOf(path.join(m2, "map", "buildings.txt"));
    ok(r.strandedRemoved === 0, "the sweep removes nothing by position", r);
    ok(after.length === before - 1,
      "…only the orphaned floating_harbor, by its anchor, as it always did", { before, after: after.length });
    ok(has(after, "arms_factory", "1.00"),
      "⭐ the arms_factory over what is now sea SURVIVES the sweep — this is the mass-delete guard", after);
  }

  console.log("\n=== the targeted call still reports what it did ===");
  {
    const m3 = makeMod(tmps);
    const r = md.fixWaterSupplyRail({ modRoot: m3, gameRoot: "", dependencyRoots: [], waterIds: [1] });
    ok(r.strandedRemoved === 3, "three position-placed rows are counted separately", r);
    ok(r.harborRemoved === 1, "…and the anchored harbor keeps its own count", r);
    ok(r.changed === true, "…and the result says something changed", r);
  }

  tmps.forEach((d) => { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} });
  console.log(`\n=== erased land does not leave buildings at sea: ${pass} checks, ${fails.length} failed ===`);
  fails.forEach((f) => console.log("   FAILED: " + f));
  process.exit(fails.length ? 1 : 0);
})();
