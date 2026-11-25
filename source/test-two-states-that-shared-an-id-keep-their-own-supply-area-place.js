// Two states that shared an id each keep their own place in a supply area when the ids are pulled apart.
// #two-states-that-shared-an-id-keep-their-own-supply-area-place
//
// THE DEFECT. renumberStateId rewrites `states = { … }` in map/supplyareas with a blind token replace — every `\b<old>\b`
// in the list becomes the new id. A supply area holds ONE MEMBERSHIP PER STATE, so when two state blocks declare the same
// id (the shape closeStateIdGaps exists for: HOI4 keeps the first block it loads, logs "State ID conflict" for the rest,
// and the gap-closer moves them apart one at a time) the list carries that id twice — one entry per state — and both
// entries moved together.
//
// MEASURED on fe44da5, one "Auto-fix all" click over test-map-stress.js's seed-7 shape (ids 1, 45, 3, 45; gaps at 2 and 4;
// area 1 = `states = { 1 45 3 45 }`; scratchpad batch12/flake/repro3.js):
//   renumbered [{45→2},{45→4}]   area 1 -> `states = { 1 2 3 2 }`
//   state 2 listed TWICE in the one area, and the state that became 4 left in NO supply area at all;
//   validate then reports, for ever, "1 state(s) are listed in more than one supply area (e.g. state 2 in areas 1, 1)"
//   — an area named twice — and no fixer clears it: the second click writes nothing.
// That is the click leaving a problem the map did not have, which is what the Auto-fix guard
// (test-no-auto-fix-pass-undoes-another-and-a-second-click-writes-nothing.js) caught intermittently on seed 7: it maps the
// start problems through the renumber list to follow moved ids, which hid the carried-over duplicate whenever that
// mapping applied.
//
// The list spans come from _liveListIdSpans, which masks comments, so this also pins that a number inside a comment in
// the list is not rewritten (comments are content).
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const lib = require("./testlib-two-layer-map.js");
const M = require("./map-data.js");

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (ok || detail == null ? "" : "   -> " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 600)));
  if (!ok) fails.push(label);
};

const tmps = [];
const mkmod = (files) => { const d = fs.mkdtempSync(path.join(os.tmpdir(), "nova-dupid-sa-")); tmps.push(d); return lib.write(d, files); };
/** The ids each `states = { … }` list actually shows the game, comments masked out. */
const stateLists = (txt) => [...String(txt).replace(/#[^\n\r]*/g, "").matchAll(/states\s*=\s*\{([^}]*)\}/g)]
  .map((m) => (m[1].match(/\d+/g) || []).map(Number));
const areaText = (mod, file) => fs.readFileSync(path.join(mod, "map", "supplyareas", file), "utf8");
const hasDuplicate = (list) => new Set(list).size !== list.length;

try {
  console.log("1. The writer: one renumber moves ONE membership");
  {
    const mod = mkmod({
      "descriptor.mod": 'name="dup id"\nsupported_version="1.*"\nreplace_path="history/states"\n',
      // 2-B.txt sorts first, so HOI4 keeps its 45 and renumberStateId moves that one.
      "history/states/1-A.txt": lib.st(1, "1 2 3"),
      "history/states/2-B.txt": lib.st(45, "4 5 6"),
      "history/states/3-C.txt": lib.st(3, "7 8 9"),
      "history/states/45-D.txt": lib.st(45, "10 11 12"),
      "map/supplyareas/1-S.txt": 'supply_area = {\n\tid = 1\n\tname = "S"\n\tvalue = 1\n\tstates = { 1 45 3 45 # 45 is in here twice, once per state\n\t}\n}\n',
    });
    const before = stateLists(areaText(mod, "1-S.txt"))[0];
    rec("CONTROL: two state files declare id 45, and the area lists 45 twice — one entry per state",
      JSON.stringify(before) === "[1,45,3,45]", before);

    const rep = M.renumberStateId(mod, 45, 2, { gameRoot: null, dependencyRoots: [] });
    const txt = areaText(mod, "1-S.txt");
    const after = stateLists(txt)[0];
    rec("⭐⭐⭐ the first entry moves to 2 and the other keeps 45 for the state that still carries it",
      JSON.stringify(after) === "[1,2,3,45]", { after, rep });
    rec("⭐ a 45 inside a comment in that list is left alone (comments are content)",
      /#\s*45 is in here twice, once per state/.test(txt), txt);

    // …and the second renumber moves the second entry, so the two states end up in the area separately.
    M.renumberStateId(mod, 45, 4, { gameRoot: null, dependencyRoots: [] });
    const both = stateLists(areaText(mod, "1-S.txt"))[0];
    rec("⭐⭐ after the second renumber the area lists both states once: { 1 2 3 4 }",
      JSON.stringify(both) === "[1,2,3,4]", both);
  }

  console.log("\n2. …and a state whose new id the list ALREADY shows is not listed twice");
  {
    const mod = mkmod({
      "descriptor.mod": 'name="stale entry"\nsupported_version="1.*"\nreplace_path="history/states"\n',
      "history/states/1-A.txt": lib.st(1, "1 2 3"),
      "history/states/45-D.txt": lib.st(45, "10 11 12"),
      // 2 names no state yet — a stale entry left by an older edit. Renumbering 45 into 2 must not list 2 twice.
      "map/supplyareas/1-S.txt": 'supply_area = {\n\tid = 1\n\tname = "S"\n\tvalue = 1\n\tstates = { 1 2 45 }\n}\n',
    });
    M.renumberStateId(mod, 45, 2, { gameRoot: null, dependencyRoots: [] });
    const after = stateLists(areaText(mod, "1-S.txt"))[0];
    rec("⭐⭐ the area lists state 2 once, not twice", JSON.stringify(after) === "[1,2]", after);
  }

  console.log("\n2b. …but a new id ANOTHER state already declares is a SECOND membership, not the same one");
  {
    // This is how the duplicate id is made in the first place: test-map-stress seed 7 renumbers 4 to 45 and then 2 to
    // 45, and the area's entries for those two states are two places. Merging them here dropped one before the click
    // even began (measured: seed 7's area built as `{ 1 3 45 }` instead of `{ 1 45 3 45 }`).
    const mod = mkmod({
      "descriptor.mod": 'name="second state"\nsupported_version="1.*"\nreplace_path="history/states"\n',
      "history/states/1-A.txt": lib.st(1, "1 2 3"),
      "history/states/2-B.txt": lib.st(2, "4 5 6"),
      "history/states/45-D.txt": lib.st(45, "10 11 12"),
      "map/supplyareas/1-S.txt": 'supply_area = {\n\tid = 1\n\tname = "S"\n\tvalue = 1\n\tstates = { 1 2 45 }\n}\n',
    });
    M.renumberStateId(mod, 2, 45, { gameRoot: null, dependencyRoots: [] });
    const after = stateLists(areaText(mod, "1-S.txt"))[0];
    rec("⭐⭐⭐ the state keeps its own place: the area lists 45 twice, once per state",
      JSON.stringify(after) === "[1,45,45]", after);
  }

  console.log("\n3. The CLICK over the shape test-map-stress seed 7 leaves: ids 1, 45, 3, 45 and one area listing 45 twice");
  {
    // A spec-valid 256x256 map: 4x4 grid of 64px cells, provinces 1..12 land (13..16 sea, so row-2 land is coastal).
    const provAt = (x, y) => Math.floor(x / 64) + Math.floor(y / 64) * 4 + 1;
    const COLOF = (p) => [((p * 37) % 200) + 20, ((p * 71) % 200) + 20, ((p * 113) % 200) + 20];
    const rows = ["0;0;0;0;land;false;unknown;0"];
    for (let p = 1; p <= 16; p++) { const [r, g, b] = COLOF(p); const sea = p >= 13; rows.push(`${p};${r};${g};${b};${sea ? "sea" : "land"};${!sea && p >= 9 ? "true" : "false"};${sea ? "ocean" : "plains"};${sea ? 0 : 1}`); }
    const weather = "\tweather={\n\t\tperiod={\n\t\t\tbetween={ 0.0 30.11 }\n\t\t\ttemperature={ -5.0 25.0 }\n\t\t\tno_phenomenon=0.700\n\t\t}\n\t}\n";
    const mod = mkmod({
      "descriptor.mod": 'name="dup id click"\nsupported_version="1.*"\nreplace_path="history/states"\nreplace_path="history/countries"\nreplace_path="map"\nreplace_path="map/strategicregions"\nreplace_path="map/supplyareas"\n',
      "map/provinces.bmp": lib.bmp24(256, 256, (x, y) => COLOF(provAt(x, y))),
      "map/definition.csv": rows.join("\n") + "\n",
      "map/buildings.txt": "1;arms_factory;20.00;9.60;20.00;0.00;0\n",
      "map/adjacencies.csv": "From;To;Type;Through;start_x;start_y;stop_x;stop_y;adjacency_rule_name;Comment\n-1;-1;-1;-1;-1;-1;-1;-1;-1\n",
      "map/strategicregions/1.txt": `strategic_region={\n\tid=1\n\tname="R1"\n\tprovinces={ 1 2 3 4 5 6 7 8 9 10 11 12 }\n${weather}}\n`,
      "map/strategicregions/2.txt": `strategic_region={\n\tid=2\n\tname="R2"\n\tprovinces={ 13 14 15 16 }\n${weather}}\n`,
      "history/states/1.txt": lib.st(1, "1 2 3"),
      "history/states/2.txt": lib.st(45, "4 5 6"),
      "history/states/3.txt": lib.st(3, "7 8 9"),
      "history/states/45.txt": lib.st(45, "10 11 12"),
      "history/countries/AAA.txt": "capital = 1\n",
      "map/supplyareas/1.txt": 'supply_area={\n\tid=1\n\tname="SA1"\n\tvalue=1\n\tstates={ 1 45 3 45 }\n}\n',
    });
    const opts = { modRoot: mod, gameRoot: null, dependencyRoots: [] };
    rec("CONTROL: the click's map starts with 45 declared twice and listed twice in area 1",
      JSON.stringify(stateLists(areaText(mod, "1.txt"))[0]) === "[1,45,3,45]", stateLists(areaText(mod, "1.txt")));

    M.clearMapLayerCache();
    const r = M.autoFixMap(opts);
    rec("the click ran", !!(r && r.ok), r && r.error);
    const moved = ((r.fixes && r.fixes.stateGaps && r.fixes.stateGaps.renumbered) || []).map((x) => [x.from, x.to]);
    rec("CONTROL: …and it pulled the duplicated id apart, into 2 and 4",
      JSON.stringify(moved) === "[[45,2],[45,4]]", r.fixes && r.fixes.stateGaps);

    const lists = stateLists(areaText(mod, "1.txt"));
    rec("⭐⭐⭐ both states keep their place: the area lists { 1 2 3 4 }", JSON.stringify(lists[0]) === "[1,2,3,4]", lists);
    rec("⭐⭐⭐ no supply area lists one state twice", !lists.some(hasDuplicate), lists);
    rec("⭐⭐ the state HOI4 discarded (now id 4) is still in a supply area", lists.some((l) => l.includes(4)), lists);

    M.clearMapLayerCache();
    const problems = M.validateMapModel(M.buildMapModel({ ...opts, cacheStableLayers: true }));
    const twoAreas = problems.filter((p) => p.rule === "state_in_two_supply_areas");
    rec("⭐⭐⭐ the click leaves no state_in_two_supply_areas — the map did not have one",
      twoAreas.length === 0, twoAreas.map((p) => p.message));

    const t1 = lib.tree(mod);
    M.clearMapLayerCache();
    M.autoFixMap(opts);
    rec("⭐⭐ a second click writes nothing", lib.written(t1, lib.tree(mod)).length === 0, lib.written(t1, lib.tree(mod)));
  }
} catch (e) {
  rec("harness", false, String((e && e.stack) || e));
} finally {
  for (const d of tmps) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} }
  console.log(`\n=== two states that shared an id keep their own supply-area place: ${checks} checks, ${fails.length} failed ===`);
  if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
}
