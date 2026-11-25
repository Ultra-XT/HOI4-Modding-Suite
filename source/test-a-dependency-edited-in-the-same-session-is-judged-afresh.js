// A dependency the modder edits in Nova — then opens the add-on again in the same session — is judged as it now is: the add-on's map
// check does not keep answering from what the dependency looked like at the first validate. #a-look-below-answer-moves-when-a-layer-below-changes
//
// THE DEFECT. Every look-below answer (base*: what the layers below an add-on already carry, which a rule and its fixer subtract) was
// cached per base root for the life of the server process, and so was each dependency's parsed layer (getRootLayer). Nova's server is
// one long-lived process. Validate an add-on, open its dependency and repair it, open the add-on again: the subtraction still held the
// repaired problem, so a row the add-on itself ships stayed "inherited" — for naval_base_water_is_gone, a problem HOI4 has crashed on,
// Save was not stopped. Batch 7 fixed the same shape in modChangedMapFile with a stamp of the files it read (#a-map-file-changed-after-a-
// validate-is-asked-again); these caches never adopted it.
//
// MEASURED on 65978a2 (scratchpad batch8/layers probe-c.js): (1) a dependency shipping a port row pointing at land 4 and an add-on holding
// a copy of that buildings.txt: after the dependency's buildings.txt is repaired on disk (a temp file renamed over, as safeModWrite
// writes), the same process reported nothing while a fresh process reported naval_base_water_is_gone [4]. (2) a dependency whose
// definition.csv makes sea 1 a lake: after it is made a sea again, the same process still reported the add-on's port facing a lake and
// missed the coastal flags a fresh process reported. Re-verified on 17e65d7 (batch 9, with batch 8's renumber, Auto-fix and engine work
// merged underneath): with the stamps backed out the same 5 of these 13 checks fail.
//
// THE FIX. One stamp per stable root — size, modified and changed times and file id of each map input file and of each folder the map is
// read from — computed at most once per turn of the event loop, keys every cached layer and every look-below answer.
"use strict";

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const lib = require("./testlib-two-layer-map.js");

const FRESH = process.argv[2] === "--fresh";
if (FRESH) {
  // A fresh process: nothing cached. Prints the problems one validate reports for the add-on, as the endpoint concatenates them.
  const [, , , addon, game, dep] = process.argv;
  const md = require("./map-data.js");
  const model = md.buildMapModel({ modRoot: addon, gameRoot: game, dependencyRoots: [dep], cacheStableLayers: true });
  const ps = [].concat(md.findStateFileConflicts(addon), md.validateMapModel(model), md.findBuildingAnchorMismatches({ modRoot: addon, gameRoot: game, dependencyRoots: [dep], model }), md.validateMapBitmap({ modRoot: addon, gameRoot: game, dependencyRoots: [dep] }));
  process.stdout.write(JSON.stringify(ps.map((p) => ({ rule: p.rule, ids: lib.idsOf({ problems: [p] }, p.rule) }))) + "\n");
  process.exit(0);
}

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (ok || detail == null ? "" : "   -> " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 360)));
  if (!ok) fails.push(label);
};

const W = lib.makeWorld("depedited");
const { createApp } = require("./server.js");
const fresh = (addon, dep) => JSON.parse(execFileSync(process.execPath, [__filename, "--fresh", addon, W.GAME, dep], {
  encoding: "utf8", env: Object.assign({}, process.env), cwd: __dirname,
}).trim().split("\n").pop());
const ruleIds = (list, rule) => [...new Set(list.filter((p) => p.rule === rule).flatMap((p) => p.ids))].sort((a, b) => a - b).join();
const told = (v, rule) => lib.idsOf(v, rule).join();
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

let S = null;
(async () => {
  try {
    S = await lib.startServer(createApp);

    console.log("\n=== 1. the dependency's stranded port is repaired in Nova; the add-on still ships the row ===");
    {
      const STRANDED = lib.BUILD.concat(["3;naval_base_spawn;192.00;9.50;150.00;0.00;4"]).join("\n");
      const DEP_NAME = "Port dependency";
      const DEP = W.mod(DEP_NAME, { "map/buildings.txt": STRANDED });
      const a = W.mod("Port addon", { "map/buildings.txt": STRANDED, "history/states/1-A.txt": lib.st(1, "4", { manpower: 0 }) }, [DEP_NAME]);
      const v1 = await S.validate(a);
      rec("THE CONTROL: the row the add-on copied is the dependency's, so it is not told", told(v1, "naval_base_water_is_gone") === "", told(v1, "naval_base_water_is_gone"));
      const vd = await S.validate(DEP);
      rec("THE CONTROL: the dependency, opened as the mod, is told of its stranded port", lib.idsOf(vd, "naval_base_water_is_gone").includes(4), told(vd, "naval_base_water_is_gone"));
      await pause(40);
      const fix = await S.autoFix(DEP);
      rec("the modder repairs the dependency with Auto-fix, which removes the row", fix.status === 200 && ((fix.body.fixes || {}).strandedPorts || {}).removed >= 1 && !fs.readFileSync(path.join(DEP, "map", "buildings.txt"), "utf8").includes(";4\n") && !fs.readFileSync(path.join(DEP, "map", "buildings.txt"), "utf8").endsWith(";4"), (fix.body.fixes || {}).strandedPorts);
      const control = fresh(a, DEP);
      rec("THE CONTROL: a fresh process now reports the add-on's own copy of the row", ruleIds(control, "naval_base_water_is_gone").split(",").includes("4"), control);
      const v2 = await S.validate(a);
      rec("⭐⭐⭐ the same server, opening the add-on again, reports it too", lib.idsOf(v2, "naval_base_water_is_gone").includes(4), told(v2, "naval_base_water_is_gone"));
      const g = await lib.saveGate(v2);
      rec("⭐⭐⭐ …and the add-on's Save is stopped for it", g.crashes >= 1 && g.armed, g.status);
    }

    console.log("\n=== 2. the dependency's lake is made a sea again in Nova (its definition.csv, a file every cached layer reads) ===");
    {
      const LAKE = lib.DEF({ 1: "1;0;0;200;lake;false;lakes;0" });
      const DEP_NAME = "Lake dependency";
      const DEP = W.mod(DEP_NAME, { "map/definition.csv": LAKE });
      const OWN_ROW = "2;naval_base_spawn;30.00;9.50;191.00;0.00;1";
      const a = W.mod("Lake addon", { "map/buildings.txt": lib.BUILD.join("\n") + "\n" + OWN_ROW }, [DEP_NAME]);
      const v1 = await S.validate(a);
      rec("THE CONTROL: the add-on's own port faces the dependency's lake, and only it is reported", lib.idsOf(v1, "naval_base_sea_zone_invalid").join() === "1,2", lib.idsOf(v1, "naval_base_sea_zone_invalid"));
      await pause(40);
      const r = await S.post("/api/map/set-province-terrain", { provinceId: 1, terrain: "ocean", type: "sea", coastal: false }, DEP);
      rec("the modder makes province 1 a sea again in the dependency (the province inspector's request)", r.status === 200 && r.body.ok === true && /;sea;/.test(fs.readFileSync(path.join(DEP, "map", "definition.csv"), "utf8").split(/\r?\n/).find((l) => l.startsWith("1;")) || ""), r.body);
      const control = fresh(a, DEP);
      rec("THE CONTROL: a fresh process reports no port without a sea", ruleIds(control, "naval_base_sea_zone_invalid") === "", control);
      const v2 = await S.validate(a);
      rec("⭐⭐⭐ the same server, opening the add-on again, reports none either", lib.idsOf(v2, "naval_base_sea_zone_invalid").length === 0, lib.idsOf(v2, "naval_base_sea_zone_invalid"));
      const same = JSON.stringify(v2.problems.map((p) => ({ rule: p.rule, ids: lib.idsOf({ problems: [p] }, p.rule) })));
      rec("⭐⭐ …and its whole answer is the fresh process's", same === JSON.stringify(control), { same: JSON.parse(same), fresh: control });
    }

    console.log("\n=== 3. a dependency file rewritten in place by another editor (no rename) is noticed too ===");
    {
      const DEP_NAME = "In-place dependency";
      const STRANDED = lib.BUILD.concat(["3;naval_base_spawn;192.00;9.50;150.00;0.00;4"]).join("\n");
      const DEP = W.mod(DEP_NAME, { "map/buildings.txt": STRANDED });
      const a = W.mod("In-place addon", { "map/buildings.txt": STRANDED }, [DEP_NAME]);
      rec("THE CONTROL: not told while the dependency ships the same row", told(await S.validate(a), "naval_base_water_is_gone") === "", told(await S.validate(a), "naval_base_water_is_gone"));
      await pause(40);
      fs.writeFileSync(path.join(DEP, "map", "buildings.txt"), lib.BUILD.join("\n"));
      rec("⭐⭐ after the dependency's buildings.txt is rewritten in place, the add-on's own row is reported", lib.idsOf(await S.validate(a), "naval_base_water_is_gone").includes(4), told(await S.validate(a), "naval_base_water_is_gone"));
    }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 10).join("\n") : e);
    fails.push("harness error");
  } finally {
    if (S) S.close();
    W.cleanup();
  }
  console.log(`\n=== a dependency edited in the same session is judged afresh: ${checks} checks, ${fails.length} failed ===`);
  if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
})();
