// An add-on is not told about a sea province its dependency lists in a state, and Auto-fix leaves a verbatim copy of that state file as
// the dependency wrote it. A sea province the add-on itself put in a state is still reported and taken out.
// #auto-fix-leaves-a-sea-province-in-a-state-the-mod-inherited
//
// THE DEFECT. non_land_province_in_state — an error — reported every sea province in any state's provinces list in the merged map,
// whoever ships the state. Its fixer, fixSeaProvinceLeftovers, rewrites only the states the mod ships (modOwnedStateIds), so a plain
// add-on was told the dependency's problem on every validate and no Auto-fix click could clear it; and once the rule asks whose it is,
// that fixer would still scrub a verbatim copy of the dependency's file the rule no longer reports.
//
// MEASURED on 396c560 (batch 7 / owners, probe-extra.js), through GET /api/map/validate?modPath and POST /api/map/auto-fix { modPath }
// on the two-layer fixture: a dependency shipping state 3 with sea province 1 in its provinces list, and an add-on over it with one
// problem of its own. The add-on — and an add-on holding a verbatim copy of 3-C.txt — was told non_land_province_in_state [state 3],
// and after the click it still was. No shipping map puts a sea province in a state (0 on six).
//
// THE FIX. seaProvinceInStateIsTheModsOwn answers for the rule and the fixer: inherited when the layers below already load that state
// listing that province and the province's type is the one the mod inherited. A sea province the add-on listed, or a province it
// retyped as sea, is still reported and removed (section 3).
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

const W = lib.makeWorld("inhseainstate");
const { createApp } = require("./server.js");
const md = require("./map-data.js");

const RULE = "non_land_province_in_state";
const DEP_NAME = "Sea in a state dependency";
const DEP_STATE_3 = lib.st(3, "3 1");                                          // sea 1 listed in state 3
const DEP = W.mod(DEP_NAME, { "history/states/3-C.txt": DEP_STATE_3 });
const OWN = { "history/states/1-A.txt": lib.st(1, "4", { manpower: 0 }) };
const has = (d, rel) => fs.existsSync(path.join(d, ...rel.split("/")));
const read = (d, rel) => (has(d, rel) ? fs.readFileSync(path.join(d, ...rel.split("/")), "utf8") : "");
const told = (v) => [...new Set(((v && v.problems) || []).filter((p) => p.rule === RULE).flatMap((p) => (p.items || []).map((i) => i.stateId + ":" + i.province)))].sort();
const listOf = (d, rel) => { const m = /provinces\s*=\s*\{([^}]*)\}/.exec(read(d, rel)); return m ? m[1].trim().split(/\s+/).filter(Boolean).join(" ") : null; };

(async () => {
  let S = null;
  try {
    S = await lib.startServer(createApp);

    console.log("\n=== THE CONTROLS ===");
    rec("the dependency, validated as the mod over the game, is told its state 3 lists sea province 1", told(await S.validate(DEP)).join() === "3:1", told(await S.validate(DEP)));
    {
      const pv = await S.validate(W.mod("Plain", OWN));
      rec("a mod over the game alone, with the same one problem, is told of no sea province in a state", told(pv).length === 0 && lib.idsOf(pv, "state_no_manpower").join() === "1", lib.rulesIn(pv));
    }

    console.log("\n=== 1. an add-on with one problem of its own is not told the dependency's ===");
    {
      const a = W.mod("Addon", OWN, [DEP_NAME]);
      const v = await S.validate(a);
      rec("THE CONTROL: the add-on is told its own problem (state 1 has no manpower)", lib.idsOf(v, "state_no_manpower").join() === "1", lib.rulesIn(v));
      rec("⭐⭐⭐ …and is not told that the dependency's state 3 lists sea province 1", told(v).length === 0, told(v));
      const before = lib.tree(a);
      const r = await S.autoFix(a);
      rec("the click ran", r.status === 200 && r.body.ok === true && !r.body.nothingToFix, r.body);
      rec("⭐⭐ …wrote only the add-on's own state file", lib.written(before, lib.tree(a)).join() === "history/states/1-A.txt", lib.written(before, lib.tree(a)));
    }

    console.log("\n=== 2. a verbatim copy of the dependency's state is not an authorship claim, for the rule or for Auto-fix ===");
    {
      const a = W.mod("AddonCopy", { ...OWN, "history/states/3-C.txt": DEP_STATE_3 }, [DEP_NAME]);
      rec("⭐⭐⭐ an add-on holding the dependency's own 3-C.txt is not told of the sea province in it", told(await S.validate(a)).length === 0, told(await S.validate(a)));
      const r = md.fixSeaProvinceLeftovers({ modRoot: a, gameRoot: W.GAME, dependencyRoots: [DEP] });
      rec("⭐⭐⭐ …and fixSeaProvinceLeftovers leaves the copy exactly as the dependency wrote it", !!r && !r.provincesRemoved && read(a, "history/states/3-C.txt") === DEP_STATE_3, { r, file: read(a, "history/states/3-C.txt") });
    }

    console.log("\n=== 3. …but a sea province the add-on itself put in a state IS reported and taken out ===");
    {
      const a = W.mod("AddonListed", { "history/states/2-B.txt": lib.st(2, "2 5 1") }, [DEP_NAME]);
      rec("⭐⭐⭐ sea province 1 the add-on listed in state 2 is reported, and the dependency's state 3 is not", told(await S.validate(a)).join() === "2:1", told(await S.validate(a)));
      const ra = md.fixSeaProvinceLeftovers({ modRoot: a, gameRoot: W.GAME, dependencyRoots: [DEP] });
      rec("⭐⭐ …and fixSeaProvinceLeftovers takes it out of the add-on's state 2", !!ra && ra.provincesRemoved === 1 && listOf(a, "history/states/2-B.txt") === "2 5", { ra, list: listOf(a, "history/states/2-B.txt") });
      rec("⭐⭐⭐ …without copying the dependency's state in", !has(a, "history/states/3-C.txt"));

      const b = W.mod("AddonRetyped", { "map/definition.csv": lib.DEF({ 5: "5;0;200;200;sea;false;ocean;0" }) }, [DEP_NAME]);
      rec("⭐⭐⭐ a province the add-on retyped as sea in state 2 is reported, and the dependency's is not", told(await S.validate(b)).join() === "2:5", told(await S.validate(b)));
    }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 10).join("\n") : e);
    fails.push("harness error");
  } finally {
    if (S) S.close();
    W.cleanup();
  }
  console.log(`\n=== auto-fix leaves a sea province in a state the mod inherited: ${checks} checks, ${fails.length} failed ===`);
  if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
})();
