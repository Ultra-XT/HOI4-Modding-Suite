// ⛔ #moved-province-strands-its-position-buildings — MOVING A PROVINCE SILENTLY DELETED ITS BUILDINGS.
//
// map/buildings.txt rows are `stateId;type;x;y;z;rot;anchor`. The 7th column anchors a floating_harbor to a
// LAND province and a naval_base to a SEA one; for everything else — arms_factory, industrial_complex,
// bunker, dockyard, supply_node… — it is 0, and HOI4 takes the province from the (x,z) POSITION instead.
//
// The move path only ever re-keyed by that 7th column (rekeyBuildingAnchorsForProvince), so a moved province
// took its floating_harbor along and left everything else keyed to the state it came from. HOI4 then logs
// "location is not within specified state … BUILDING IGNORED": no crash, no dialog, the building is simply
// not in the game. Nova's own validator reported it afterwards, so the modder could be told they had broken
// something — by the tool that broke it, with no hint that the tool had.
//
// Measured by using the editor: "New state" over two Icelandic provinces moved the 2 floating_harbor rows
// and stranded 14 others (2 arms_factory, industrial_complex, supply_node, naval_base_spawn, 2 bunker,
// coastal_bunker, dockyard, anti_air_building, nuclear_reactor_spawn, 2 special_project_facility_spawn,
// naval_headquarters). Afterwards: 16 rows follow, and the placement scan finds nothing.
//
// ⭐ THE PROPERTY THIS PINS is that agreement: the writer re-keys exactly what the validator would flag, so
// "move a province, then scan" must come back empty. Testing the two against each other is what makes this
// hard to regress — a future change to either has to keep them consistent.
//
// ⚠ naval_base_spawn is why the first cut was still wrong. It DOES carry a 7th column, but a sea one, so it
// can never match a moved land province — while its position sits on the coastal land that just moved. A
// rule of "only re-home rows with anchor 0" therefore still stranded it.
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

// prov 1 (land) | prov 2 (land) | prov 3 (sea).  Pixel = (floor(x), H - floor(z)).
const COL = { 1: [200, 0, 0], 2: [0, 200, 0], 3: [0, 0, 200] };
const provAtX = (x) => (x <= 2 ? 1 : x <= 5 ? 2 : 3);
const W = 9, H = 4;

function makeMod(buildingLines) {
  const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-movebldg-"));
  mk(path.join(mod, "descriptor.mod"), 'name="MoveBldg"\nreplace_path="history/states"\nreplace_path="map"\n');
  mk(path.join(mod, "map", "provinces.bmp"), bmp24(W, H, (x) => COL[provAtX(x)]));
  mk(path.join(mod, "map", "definition.csv"), [
    "0;0;0;0;land;false;unknown;0", "1;200;0;0;land;false;plains;1", "2;0;200;0;land;false;plains;1", "3;0;0;200;sea;false;ocean;0",
  ].join("\r\n") + "\r\n");
  mk(path.join(mod, "history", "states", "100.txt"), 'state = {\n\tid = 100\n\tname = "S100"\n\tmanpower = 1000\n\tprovinces = { 1 2 }\n\thistory = { owner = AAA }\n}\n');
  mk(path.join(mod, "history", "states", "200.txt"), 'state = {\n\tid = 200\n\tname = "S200"\n\tmanpower = 1000\n\tprovinces = { }\n\thistory = { owner = BBB }\n}\n');
  mk(path.join(mod, "map", "buildings.txt"), buildingLines.join("\n") + "\n");
  return mod;
}

// Province 2 is the one that moves (100 -> 200). x=4 lands on it; x=1 lands on province 1; x=7 is sea.
const ROWS = [
  "100;arms_factory;4.00;10.0;2.00;0.00;0",        // position on prov 2, anchor 0   -> must follow
  "100;industrial_complex;4.00;10.0;2.00;0.00;0",  // position on prov 2, anchor 0   -> must follow
  "100;floating_harbor;4.00;9.5;2.00;0.00;2",      // anchored to prov 2             -> must follow
  "100;naval_base_spawn;4.00;9.5;2.00;0.00;3",     // SEA anchor, position on prov 2 -> must follow
  "100;radar_station;1.00;10.0;2.00;0.00;0",       // position on prov 1             -> must NOT move
  "100;floating_harbor;1.00;9.5;2.00;0.00;1",      // anchored to prov 1             -> must NOT move
  "100;dockyard;7.00;10.0;2.00;0.00;0",            // over SEA                       -> must NOT move
];
const typeOf = (l) => l.split(";")[1];
const keyOf = (l) => parseInt(l.split(";")[0], 10);
const readRows = (mod) => fs.readFileSync(path.join(mod, "map", "buildings.txt"), "utf8").split("\n").filter((l) => l.trim());

const tmps = [];
(() => {
  console.log("\n=== before the move, the map is clean ===");
  const mod = makeMod(ROWS); tmps.push(mod);
  {
    // #a-building-over-water — the scan now also reports the dockyard standing on the sea (HOI4: "not over the land -
    // ignoring instance"). What this test pins is the WRONG-STATE half, so it asks that rule; the sea row is pinned as reported.
    const probs = md.findBuildingPlacementProblems({ modRoot: mod });
    ok(probs.filter((p) => p.rule === "building_wrong_state").length === 0, "the fixture starts with no stranded buildings", probs);
    const wet = probs.filter((p) => p.rule === "building_not_over_land");
    ok(wet.length === 1 && wet[0].items.length === 1 && wet[0].items[0].type === "dockyard",
      "…and the dockyard over the sea is reported as standing on water, which the game ignores", wet);
  }

  console.log("\n=== move province 2 from state 100 to state 200 ===");
  const res = md.moveProvince({ modRoot: mod, provinceId: 2, fromStateId: 100, toStateId: 200 });
  ok(!res.error, "the move itself succeeded", res.error);

  console.log("\n=== ⭐ every row whose PROVINCE moved follows it ===");
  {
    const rows = readRows(mod);
    const byType = Object.fromEntries(rows.map((l) => [typeOf(l) + "@" + l.split(";")[2], keyOf(l)]));
    ok(byType["arms_factory@4.00"] === 200, "arms_factory (anchor 0, position on prov 2) is re-keyed", byType);
    ok(byType["industrial_complex@4.00"] === 200, "industrial_complex is re-keyed", byType);
    ok(byType["floating_harbor@4.00"] === 200, "the anchored floating_harbor is re-keyed (it always was)", byType);
    ok(byType["naval_base_spawn@4.00"] === 200,
      "naval_base_spawn is re-keyed — its anchor is a SEA province, so only its POSITION can place it", byType);
  }

  console.log("\n=== …and nothing else is touched ===");
  {
    const rows = readRows(mod);
    const byType = Object.fromEntries(rows.map((l) => [typeOf(l) + "@" + l.split(";")[2], keyOf(l)]));
    ok(byType["radar_station@1.00"] === 100, "a building on the province that did NOT move stays put", byType);
    ok(byType["floating_harbor@1.00"] === 100, "…and so does a harbor anchored to it", byType);
    ok(byType["dockyard@7.00"] === 100,
      "a row over SEA is not re-keyed — there is no land under it to decide a state by (#a-building-over-water reports it instead)", byType);
    // ⚠️ MOVED WITH #a-province-move-keeps-every-state-its-sites. This pinned `rows.length === ROWS.length`: no row added or
    // dropped. State 200 is written with `provinces = { }` — the shape the map page's "+ New state" creates and then fills with
    // moves — and this move gives it its first land, so the move now also writes the standard building positions createState
    // gives a state created with provinces; without them state 200 has no air base and no rocket site, a map HOI4 refuses to
    // load (state_no_air_base_or_rocket_site). What the old check protected still holds, and is pinned more tightly: no row
    // was dropped or changed beyond its state key, and every row added is one of state 200's standard positions, on province 2.
    const geom = (l) => l.split(";").slice(1).join(";");
    const lost = ROWS.filter((r) => !rows.some((l) => geom(l) === geom(r)));
    ok(lost.length === 0, "no row was dropped, and none changed but its state key", lost);
    const added = rows.filter((l) => !ROWS.some((r) => geom(r) === geom(l)));
    // #a-slot-is-per-land-province-not-per-state - a standard position is either table's type: the per-state
    // constants OR the three written once per land province. Reading only the first table made every
    // supply_node / bunker / special_project_facility_spawn row this move adds look like an intruder.
    const standard = new Set([...md.STATE_BUILDING_SLOTS.map(([t]) => t), ...md.PER_LAND_PROVINCE_BUILDING_SLOTS]);
    // ⚠️ MOVED WITH #a-painted-state-leaves-its-source-every-kind-of-building: state 100's only arms_factory and industrial_complex
    // went with province 2, and a state that loses the last row of a standard kind now gets that kind back on the land it kept.
    const at = (l) => provAtX(Math.floor(parseFloat(l.split(";")[2])));
    const to200 = added.filter((l) => keyOf(l) === 200), to100 = added.filter((l) => keyOf(l) === 100);
    ok(to200.length > 0 && to200.length + to100.length === added.length && to200.every((l) => standard.has(typeOf(l)) && at(l) === 2),
      "…every row added is a standard position of state 200, the state that got its first land, standing on province 2 — or state 100's", added.slice(0, 3));
    const lostWhole = ["arms_factory", "industrial_complex"];
    ok(to100.length > 0 && to100.every((l) => lostWhole.includes(typeOf(l)) && at(l) === 1) && lostWhole.every((t) => to100.some((l) => typeOf(l) === t)),
      "…and state 100's are the two kinds it lost whole, arms_factory and industrial_complex, on the province it kept", to100);
    const per = {};
    for (const l of rows) if (keyOf(l) === 200 && standard.has(typeOf(l))) per[typeOf(l)] = (per[typeOf(l)] || 0) + 1;
    ok(md.STATE_BUILDING_SLOTS.every(([t, n]) => per[t] === n), "…exactly the standard count of each, counting the two factories province 2 carried in", per);
  }

  console.log("\n=== ⭐ THE PROPERTY: the writer and the validator agree ===");
  {
    // Whatever the placement scan would flag as wrong-state is exactly what the move re-keys, so a move can never leave
    // that finding behind. This is what makes the pair hard to drift apart. (The dockyard on the sea is a different
    // finding, building_not_over_land, and a move neither causes nor cures it.)
    const probs = md.findBuildingPlacementProblems({ modRoot: mod }).filter((p) => p.rule === "building_wrong_state");
    ok(probs.length === 0, "after the move the placement scan finds nothing", probs);
    const anchors = md.findBuildingAnchorMismatches({ modRoot: mod, model: md.buildMapModel({ modRoot: mod }) });
    ok(anchors.length === 0, "…and neither does the anchor scan", anchors);
  }

  console.log("\n=== a second move of the same province is a no-op, not a double edit ===");
  {
    const before = readRows(mod).join("\n");
    md.moveProvince({ modRoot: mod, provinceId: 2, fromStateId: 100, toStateId: 200 });
    ok(readRows(mod).join("\n") === before, "buildings.txt is byte-identical after a repeat move");
  }

  console.log("\n=== moving it back brings the buildings back ===");
  {
    // ⚠ Assert the STARTING point, or this section passes for free when the fix is backed out: the rows
    // would never have left state 100, so "they are 100 again" would be true without anything happening.
    const before = Object.fromEntries(readRows(mod).map((l) => [typeOf(l) + "@" + l.split(";")[2], keyOf(l)]));
    ok(before["arms_factory@4.00"] === 200 && before["naval_base_spawn@4.00"] === 200,
      "…starting from the rows actually sitting in state 200", before);
    md.moveProvince({ modRoot: mod, provinceId: 2, fromStateId: 200, toStateId: 100 });
    const rows = readRows(mod);
    const byType = Object.fromEntries(rows.map((l) => [typeOf(l) + "@" + l.split(";")[2], keyOf(l)]));
    ok(byType["arms_factory@4.00"] === 100, "the arms_factory returns to state 100", byType);
    ok(byType["naval_base_spawn@4.00"] === 100, "…and so does the naval_base_spawn", byType);
    ok(md.findBuildingPlacementProblems({ modRoot: mod }).filter((p) => p.rule === "building_wrong_state").length === 0, "and the scan is still clean");
  }

  tmps.forEach((d) => { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} });
  console.log(`\n=== a moved province takes its buildings with it: ${pass} checks, ${fails.length} failed ===`);
  fails.forEach((f) => console.log("   FAILED: " + f));
  process.exit(fails.length ? 1 : 0);
})();
