// An add-on is not told about a land province on continent 0 that it only inherited, and one Auto-fix click never copies a
// dependency's definition.csv in to give it a continent. #auto-fix-leaves-a-land-province-without-a-continent-the-mod-inherited
//
// THE DEFECT. province_no_continent reported every land row with continent 0 in the definition.csv the mod loads, whoever ships it,
// and fixMissingContinents — which autoFixMap runs on every click — set a continent on every one through setProvinceDefinition, which
// copies the effective definition.csv into the mod to change one row. Batch 6's coverage table lists the pair as "BOTH UNGATED".
//
// MEASURED on the base commit 4592c54, through the endpoints the Map Errors popup calls (GET /api/map/validate?modPath, then POST
// /api/map/auto-fix { modPath }), on this file's fixture: a dependency shipping a definition.csv whose land province 3 is on
// continent 0, and an add-on over it with one problem of its own (state 2 with manpower 0). The validator told the add-on
// province_no_continent [3], and ONE click wrote the dependency's whole map/definition.csv (185 B here; 465 KB for the base game,
// 596 KB for Millennium Dawn) into the add-on. HOI4 replaces definition.csv wholesale, so from then on the add-on pins the
// dependency's map definition as it was that day. No shipping map carries the shape (0 land rows on continent 0 in the six-map
// runs), so only a fixture shows it.
//
// THE FIX. One helper, landWithoutContinentIsTheModsOwn, answers for the rule and the fixer: a row whose type and continent are the
// ones the mod inherited is the layer below's, a verbatim copy of its definition.csv included (provinceRowIsTheModsOwn, the question
// sea_province_has_continent already asks). A row the mod changed, or a province it added, is the mod's (section 3).
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

const W = lib.makeWorld("inhcont");
const { createApp } = require("./server.js");
const md = require("./map-data.js");

const RULE = "province_no_continent";
const DEP_NAME = "Inherited continent dependency";
const DEP_DEF = lib.DEF({ 3: "3;0;200;0;land;true;plains;0" });
const DEP = W.mod(DEP_NAME, { "map/definition.csv": DEP_DEF });
const OWN = { "history/states/2-B.txt": lib.st(2, "2 5", { manpower: 0 }) };
const has = (d, rel) => fs.existsSync(path.join(d, ...rel.split("/")));
const read = (d, rel) => fs.readFileSync(path.join(d, ...rel.split("/")), "utf8");
const continentOf = (d, id) => { if (!has(d, "map/definition.csv")) return null; const row = read(d, "map/definition.csv").split(/\r?\n/).find((l) => l.split(";")[0] === String(id)); return row ? +row.split(";")[7] : null; };

(async () => {
  let S = null;
  try {
    S = await lib.startServer(createApp);

    console.log("\n=== THE CONTROLS ===");
    {
      const v = await S.validate(DEP);
      rec("the dependency, validated as the mod over the game, is told its land province 3 has no continent", lib.idsOf(v, RULE).join() === "3", lib.idsOf(v, RULE));
      const pv = await S.validate(W.mod("Plain", OWN));
      rec("a mod over the game alone, with the same one problem, is told of no province without a continent", lib.idsOf(pv, RULE).length === 0 && lib.idsOf(pv, "state_no_manpower").join() === "2", lib.rulesIn(pv));
    }

    console.log("\n=== 1. an add-on with one problem of its own: the dependency's row is neither reported nor copied in ===");
    {
      const a = W.mod("Addon", OWN, [DEP_NAME]);
      const v = await S.validate(a);
      rec("THE CONTROL: the add-on is told its own problem (state 2 has no manpower)", lib.idsOf(v, "state_no_manpower").join() === "2", lib.rulesIn(v));
      rec("⭐⭐⭐ …and is not told that the dependency's province 3 has no continent", lib.idsOf(v, RULE).length === 0, lib.idsOf(v, RULE));
      const before = lib.tree(a);
      const r1 = await S.autoFix(a);
      const after = lib.tree(a);
      rec("the click ran every fixer — it was not 'nothing to fix'", r1.status === 200 && r1.body.ok === true && !r1.body.nothingToFix, r1.body);
      rec("⭐⭐⭐ …set a continent on no province", ((r1.body.fixes || {}).continents || {}).count === 0, (r1.body.fixes || {}).continents);
      rec("⭐⭐⭐ …and wrote no copy of the dependency's definition.csv into the add-on", !has(a, "map/definition.csv"), lib.written(before, after));
      rec("⭐⭐ the whole click wrote only the add-on's own state file", lib.written(before, after).join() === "history/states/2-B.txt", lib.written(before, after));
      await S.autoFix(a);
      rec("⭐ a second click writes nothing", lib.written(after, lib.tree(a)).length === 0, lib.written(after, lib.tree(a)));
    }

    console.log("\n=== 2. a verbatim copy of the dependency's definition.csv is not an authorship claim ===");
    {
      const a = W.mod("AddonCopy", { ...OWN, "map/definition.csv": DEP_DEF }, [DEP_NAME]);
      rec("⭐⭐⭐ an add-on holding the dependency's own definition.csv is not told province 3 has no continent", lib.idsOf(await S.validate(a), RULE).length === 0, lib.idsOf(await S.validate(a), RULE));
      const r = await S.autoFix(a);
      rec("the click ran", r.status === 200 && r.body.ok === true, r.body);
      rec("⭐⭐⭐ …and leaves the copy exactly as the dependency wrote it", read(a, "map/definition.csv") === DEP_DEF, continentOf(a, 3));
    }

    console.log("\n=== 3. …but a row the add-on itself left without a continent IS reported and repaired ===");
    {
      // (a) the add-on's definition.csv takes province 4's continent away; its row 3 is still the dependency's
      const OWN_DEF = lib.DEF({ 3: "3;0;200;0;land;true;plains;0", 4: "4;200;200;0;land;false;plains;0" });
      const a = W.mod("AddonOwn", { "map/definition.csv": OWN_DEF }, [DEP_NAME]);
      rec("⭐⭐⭐ the province whose continent the add-on removed is reported, and the dependency's 3 is not", lib.idsOf(await S.validate(a), RULE).join() === "4", lib.idsOf(await S.validate(a), RULE));
      const r = await S.autoFix(a);
      rec("⭐⭐ Auto-fix gives province 4 a continent", r.status === 200 && r.body.ok === true && continentOf(a, 4) > 0, { fixes: (r.body.fixes || {}).continents, c4: continentOf(a, 4) });
      rec("⭐⭐⭐ …and leaves the row the add-on inherited as the dependency wrote it", continentOf(a, 3) === 0, continentOf(a, 3));
      rec("…and the validator has nothing left to report", lib.idsOf(await S.validate(a), RULE).length === 0, lib.idsOf(await S.validate(a), RULE));

      // (b) a land province the add-on adds on continent 0
      const b = W.mod("AddonNew", { "map/definition.csv": DEP_DEF.replace(/\r\n$/, "\r\n6;10;10;10;land;false;plains;0\r\n") }, [DEP_NAME]);
      const opts = { modRoot: b, gameRoot: W.GAME, dependencyRoots: [DEP] };
      const told = md.validateMapModel(md.buildMapModel({ ...opts, cacheStableLayers: false })).filter((p) => p.rule === RULE).flatMap((p) => p.provinces || []);
      rec("⭐⭐ a land province the add-on added on continent 0 is reported, and only it", told.join() === "6", told);
      const rb = md.fixMissingContinents(opts);
      rec("⭐⭐ …and fixMissingContinents gives it a continent, and only it", !!rb && rb.count === 1 && (rb.applied || []).join() === "6" && continentOf(b, 6) > 0 && continentOf(b, 3) === 0, { rb, c6: continentOf(b, 6), c3: continentOf(b, 3) });
    }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 10).join("\n") : e);
    fails.push("harness error");
  } finally {
    if (S) S.close();
    W.cleanup();
  }
  console.log(`\n=== auto-fix leaves a land province without a continent the mod inherited: ${checks} checks, ${fails.length} failed ===`);
  if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
})();
