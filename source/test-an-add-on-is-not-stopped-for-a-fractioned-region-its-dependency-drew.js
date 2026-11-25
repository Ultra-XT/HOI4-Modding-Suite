// An add-on over a dependency that re-draws the strategic regions — and ships no map of its own — is not told, and its Save is not
// stopped, for the fragment the dependency's region files cut; one Auto-fix click never copies those region files in to move it. A mod
// that cuts the same region itself is still stopped and repaired. #an-add-on-is-not-stopped-for-a-fractioned-region-its-dependency-drew
//
// THE DEFECT. fractioned_naval_region (FATAL: HOI4 refuses to load the map) subtracts what the layers below already ship,
// baseFractionedProvinces. Its "effective base" was the highest layer below shipping BOTH definition.csv and provinces.bmp, so a
// dependency that ships only map/strategicregions was skipped and the base game answered for it. The gate in front of the rule,
// modChangedMapFile, diffs against the base game only, so an add-on holding a verbatim copy of the dependency's region files "changed"
// them — and so did an add-on with nothing but an adjacencies.csv of its own.
//
// MEASURED on 65978a2 (scratchpad batch8/layers probe-a.js, in-process; probe-b.js with a flattened-stack oracle): a dependency whose two
// region files put sea 5 and sea 8 in one region; an add-on holding a verbatim copy of them was told fractioned_naval_region [8], and so
// was an add-on shipping only an adjacencies.csv; fixFractionedRegions then wrote the dependency's two region files into each. Asked of
// the flattened stack, the base answer is [4] for the fixture below where the code answered [].
//
// THE FIX. The base is the highest layer below that ships any of definition.csv, provinces.bmp, adjacencies.csv or a strategic-region
// file, read with the layers under it in declared order, and cached per whole stack.
"use strict";

const fs = require("fs");
const path = require("path");
const lib = require("./testlib-two-layer-map.js");

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (ok || detail == null ? "" : "   -> " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 360)));
  if (!ok) fails.push(label);
};

const W = lib.makeWorld("depregions");
const { createApp } = require("./server.js");

const RULE = "fractioned_naval_region";
// The dependency moves inland land 4 into the sea region: 4 touches none of it, so region 1 is cut in two and 4 is the fragment.
const REGION_FILES = { "map/strategicregions/1-Sea.txt": lib.region(1, "1 4"), "map/strategicregions/2-Land.txt": lib.region(2, "2 3 5") };
const DEP_NAME = "Region dependency";
const DEP = W.mod(DEP_NAME, REGION_FILES);
const OWN = { "history/states/3-C.txt": lib.st(3, "3", { manpower: 0 }) };
const ADJ = "From;To;Type;Through;start_x;start_y;stop_x;stop_y;adjacency_rule_name;Comment\r\n-1;-1;;-1;-1;-1;-1;-1;-1\r\n";
const regionFiles = (d) => { const p = path.join(d, "map", "strategicregions"); return fs.existsSync(p) ? fs.readdirSync(p).sort() : []; };

async function inheritedCase(label, a) {
  const v = await S.validate(a);
  rec(`${label}: THE CONTROL — the add-on is told its own problem (state 3 has no manpower)`, lib.idsOf(v, "state_no_manpower").join() === "3", lib.rulesIn(v));
  rec(`⭐⭐⭐ ${label}: …and is not told of the dependency's fragment`, lib.idsOf(v, RULE).length === 0, lib.idsOf(v, RULE));
  const g = await lib.saveGate(v);
  rec(`⭐⭐⭐ ${label}: …so Save is not stopped`, g.crashes === 0 && !g.armed, g.status);
  const shippedBefore = regionFiles(a);
  const before = lib.tree(a);
  const r = await S.autoFix(a);
  const after = lib.tree(a);
  rec(`${label}: the click ran every fixer — it was not 'nothing to fix'`, r.status === 200 && r.body.ok === true && !r.body.nothingToFix, r.body);
  rec(`⭐⭐⭐ ${label}: …moved no province between regions`, !((r.body.fixes || {}).fractionedRegions || {}).moved, (r.body.fixes || {}).fractionedRegions);
  rec(`⭐⭐ ${label}: …and wrote only the add-on's own state file`, lib.written(before, after).join() === "history/states/3-C.txt" && regionFiles(a).join() === shippedBefore.join(), lib.written(before, after));
}

let S = null;
(async () => {
  try {
    S = await lib.startServer(createApp);

    console.log("\n=== THE CONTROLS ===");
    {
      const v = await S.validate(DEP);
      rec("the dependency, validated as the mod over the game, is told of the fragment its region files cut", lib.idsOf(v, RULE).join() === "4", lib.idsOf(v, RULE));
      const g = await lib.saveGate(v);
      rec("…and its own Save is stopped for it", g.crashes >= 1 && g.armed, g.status);
      const a = W.mod("Plain addon", OWN, [DEP_NAME]);
      const va = await S.validate(a);
      rec("an add-on over it shipping no map file is told nothing of it", lib.idsOf(va, RULE).length === 0 && lib.idsOf(va, "state_no_manpower").join() === "3", lib.rulesIn(va));
    }

    console.log("\n=== 1. an add-on holding the dependency's region files verbatim ===");
    await inheritedCase("copy", W.mod("Copy addon", { ...OWN, ...REGION_FILES }, [DEP_NAME]));

    console.log("\n=== 2. an add-on whose only map file is an adjacencies.csv of its own ===");
    await inheritedCase("adjacencies", W.mod("Adjacencies addon", { ...OWN, "map/adjacencies.csv": ADJ }, [DEP_NAME]));

    console.log("\n=== 3. three layers: the game < a dependency shipping definition.csv < the region dependency < the add-on ===");
    {
      const MAPDEP = "Map dependency";
      W.mod(MAPDEP, { "map/definition.csv": lib.DEF({ 5: "5;0;200;200;land;false;hills;1" }) });
      await inheritedCase("three layers", W.mod("Three-layer addon", { ...OWN, ...REGION_FILES }, [MAPDEP, DEP_NAME]));
    }

    console.log("\n=== 4. …but a mod that cuts the region itself is still stopped, and Auto-fix repairs it ===");
    {
      const a = W.mod("Own regions", { ...REGION_FILES });
      const v = await S.validate(a);
      rec("⭐⭐⭐ a mod over the game alone shipping those region files is told of fragment 4", lib.idsOf(v, RULE).join() === "4", lib.idsOf(v, RULE));
      const g = await lib.saveGate(v);
      rec("⭐⭐⭐ …and its Save is stopped (count, and the type-save gate armed)", g.crashes >= 1 && g.armed, g.status);
      const r = await S.autoFix(a);
      rec("⭐⭐ …and one Auto-fix click moves the fragment", r.status === 200 && ((r.body.fixes || {}).fractionedRegions || {}).moved >= 1, (r.body.fixes || {}).fractionedRegions);
      rec("⭐ …after which the region is whole", lib.idsOf(await S.validate(a), RULE).length === 0, lib.idsOf(await S.validate(a), RULE));
    }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 10).join("\n") : e);
    fails.push("harness error");
  } finally {
    if (S) S.close();
    W.cleanup();
  }
  console.log(`\n=== an add-on is not stopped for a fractioned region its dependency drew: ${checks} checks, ${fails.length} failed ===`);
  if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
})();
