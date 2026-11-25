// Unit test: fixBuildingsTxtPlacement — re-homes map/buildings.txt rows to the state that actually owns
// the province under their (x,z) position. This is the dominant real-crash-log error class ("map building
// location is not within specified state … BUILDING IGNORED") — the buildings left stranded when a province
// is moved between states. The province is derived from the EXACT pixel = (floor(x), H - floor(z)); a
// land-pixel row in the wrong state is re-homed (reliable), a SEA-pixel row is LEFT ALONE (the game snaps
// coastal ports to land by a rule we can't reproduce — dropping would delete real buildings). Also covers
// the building_wrong_state validator rule + trailing-blank trim. Run: node test-map-fix-buildings-placement.js
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
const provAtX = (x) => (x <= 2 ? 1 : x <= 5 ? 2 : 3); // prov1 land | prov2 land | prov3 sea

(() => {
  console.log("=== fixBuildingsTxtPlacement (re-home stranded buildings; leave sea-pixel rows alone) ===");
  const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-bldg-"));
  const W = 9, H = 4;
  mk(path.join(mod, "descriptor.mod"), 'name="Bldg"\nreplace_path="history/states"\nreplace_path="map"\n');
  mk(path.join(mod, "map", "provinces.bmp"), bmp24(W, H, (x) => COL[provAtX(x)]));
  mk(path.join(mod, "map", "definition.csv"), [
    "0;0;0;0;land;false;unknown;0", "1;200;0;0;land;false;plains;1", "2;0;200;0;land;false;plains;1", "3;0;0;200;sea;false;ocean;0",
  ].join("\r\n") + "\r\n");
  mk(path.join(mod, "history", "states", "100.txt"), 'state = {\n\tid = 100\n\tname = "S100"\n\tmanpower = 1000\n\tprovinces = { 1 }\n\thistory = { owner = AAA }\n}\n');
  mk(path.join(mod, "history", "states", "200.txt"), 'state = {\n\tid = 200\n\tname = "S200"\n\tmanpower = 1000\n\tprovinces = { 2 }\n\thistory = { owner = AAA }\n}\n');
  // (x,z) -> pixel (floor(x), H-floor(z)).  x=4 -> prov2(state200) ; x=7 -> prov3(sea) ; x=1 -> prov1(state100)
  const B = path.join(mod, "map", "buildings.txt");
  mk(B, [
    "100;arms_factory;4.00;10.0;2.00;0.00;0",   // on prov2 (state 200) but keyed 100  -> RE-HOME 100->200
    "200;bunker;4.00;10.0;2.00;0.00;0",         // on prov2 (state 200), keyed 200      -> correct, untouched
    "100;dockyard;7.00;10.0;2.00;0.00;0",       // on SEA prov3, keyed 100              -> LEFT ALONE (can't classify)
    "100;radar_station;1.00;10.0;2.00;0.00;0",  // on prov1 (state 100), keyed 100      -> correct, untouched
  ].join("\n") + "\n"); // one trailing newline -> a phantom blank record the trim removes
  const read = () => fs.readFileSync(B, "utf8").split("\n").filter((l) => l.trim());
  const lineFor = (type) => read().find((l) => l.split(";")[1] === type) || "";

  try {
    // validator surfaces the stranded building (position-based, so via validateMapBitmap)
    const probs = md.findBuildingPlacementProblems({ modRoot: mod });
    ok("validator flags building_wrong_state for the stranded arms_factory", probs.some((p) => p.rule === "building_wrong_state" && p.stateId === 100 && p.provinceId === 2), probs);
    ok("validator does NOT flag the correctly-keyed or sea rows", probs.filter((p) => p.rule === "building_wrong_state").length === 1, probs.filter((p) => p.rule === "building_wrong_state"));

    const dry = md.fixBuildingsTxtPlacement({ modRoot: mod, dryRun: true });
    ok("dry-run plans exactly 1 re-home and writes nothing", dry.rehomed === 1 && dry.changed === false, dry);

    const r = md.fixBuildingsTxtPlacement({ modRoot: mod });
    ok("re-homes exactly the 1 stranded building", r.changed && r.rehomed === 1, r);
    ok("trims the trailing phantom blank line", r.trimmed === 1, r);
    ok("disk: arms_factory is now keyed to state 200 (followed its province)", lineFor("arms_factory").startsWith("200;"), lineFor("arms_factory"));
    ok("disk: SEA-pixel dockyard is LEFT ALONE (still keyed 100 — not dropped)", lineFor("dockyard").startsWith("100;") && lineFor("dockyard") !== "", lineFor("dockyard"));
    ok("disk: correctly-keyed bunker untouched", lineFor("bunker").startsWith("200;"), lineFor("bunker"));
    ok("disk: correctly-keyed radar_station untouched", lineFor("radar_station").startsWith("100;"), lineFor("radar_station"));
    ok("disk: all 4 building rows survive (nothing deleted)", read().length === 4, read());
    ok("disk: file no longer ends with a trailing newline (no phantom record)", !fs.readFileSync(B, "utf8").endsWith("\n"));

    ok("validator is now clean of building_wrong_state", !md.findBuildingPlacementProblems({ modRoot: mod }).some((p) => p.rule === "building_wrong_state"));
    ok("idempotent — a second pass changes nothing", md.fixBuildingsTxtPlacement({ modRoot: mod }).changed === false);

    console.log(`\ntest-map-fix-buildings-placement: ${pass} checks passed`);
  } finally { try { fs.rmSync(mod, { recursive: true, force: true }); } catch (_) {} }
})();
