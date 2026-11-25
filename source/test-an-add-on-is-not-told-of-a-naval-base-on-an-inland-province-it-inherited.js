// An add-on is not told that a naval base sits on a province definition.csv marks inland when its dependency put it there.
// #an-add-on-is-not-told-of-a-naval-base-on-an-inland-province-it-inherited
//
// THE DEFECT. naval_base_non_coastal — a warning with no Auto-fix — reported every province-level naval_base in the merged map on a
// province whose definition.csv row says coastal = false, whoever ships the state and the row. Batch 7 gated its state-history
// neighbours (state_no_category, unknown_state_category, state_buildings_exceed_slots); this one, a few lines below them in
// validateMapModel, never asked whose problem it was either.
//
// MEASURED on 396c560 (batch 7 / owners, probe-extra.js), through GET /api/map/validate?modPath on the two-layer fixture: a dependency
// shipping state 2 with `5 = { naval_base = 1 }` on inland province 5, and an add-on over it with one problem of its own. The add-on
// was told naval_base_non_coastal [state 2], so was an add-on holding a verbatim copy of the dependency's 2-B.txt, and an Auto-fix
// click left it standing (there is no fixer), so the add-on is never clean of it.
//
// THE FIX. navalBaseOnInlandProvinceIsTheModsOwn: inherited when the layers below already load that state with a naval base on that
// province and the province's row (type and coastal flag) is the one the mod inherited (provinceRowIsTheModsOwn). A naval base the
// add-on built, a province it moved into another state with its base, or a coastal flag it cleared is still reported (section 3).
"use strict";

const lib = require("./testlib-two-layer-map.js");

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (ok || detail == null ? "" : "   -> " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 360)));
  if (!ok) fails.push(label);
};

const W = lib.makeWorld("inhnavalinland");
const { createApp } = require("./server.js");

const RULE = "naval_base_non_coastal";
const base = (pid) => `\t\tbuildings = {\n\t\t\t${pid} = {\n\t\t\t\tnaval_base = 1\n\t\t\t}\n\t\t}\n`;
const DEP_NAME = "Inland naval base dependency";
const DEP_STATE_2 = lib.st(2, "2 5", { history: base(5) });                 // 5 is inland: coastal = false
const DEP = W.mod(DEP_NAME, { "history/states/2-B.txt": DEP_STATE_2 });
const COAST_NAME = "Coastal naval base dependency";
const COAST = W.mod(COAST_NAME, { "history/states/2-B.txt": lib.st(2, "2 5", { history: base(2) }) });   // 2 is coastal = true
const OWN = { "history/states/1-A.txt": lib.st(1, "4", { manpower: 0 }) };
// ids a validate response names for this rule: "state:province"
const told = (v) => [...new Set(((v && v.problems) || []).filter((p) => p.rule === RULE).flatMap((p) => (p.items || []).map((i) => i.stateId + ":" + i.province)))].sort();

(async () => {
  let S = null;
  try {
    S = await lib.startServer(createApp);

    console.log("\n=== THE CONTROLS ===");
    rec("the dependency, validated as the mod over the game, is told of its naval base on inland province 5", told(await S.validate(DEP)).join() === "2:5", told(await S.validate(DEP)));
    rec("the coastal dependency is told nothing: province 2 is coastal", told(await S.validate(COAST)).length === 0, told(await S.validate(COAST)));
    {
      const pv = await S.validate(W.mod("Plain", OWN));
      rec("a mod over the game alone, with the same one problem, is told of no naval base", told(pv).length === 0 && lib.idsOf(pv, "state_no_manpower").join() === "1", lib.rulesIn(pv));
    }

    console.log("\n=== 1. an add-on with one problem of its own is not told the dependency's ===");
    {
      const a = W.mod("Addon", OWN, [DEP_NAME]);
      const v = await S.validate(a);
      rec("THE CONTROL: the add-on is told its own problem (state 1 has no manpower)", lib.idsOf(v, "state_no_manpower").join() === "1", lib.rulesIn(v));
      rec("⭐⭐⭐ …and is not told of the dependency's naval base on inland province 5", told(v).length === 0, told(v));
    }

    console.log("\n=== 2. a verbatim copy of the dependency's state is not an authorship claim ===");
    {
      const a = W.mod("AddonCopy", { ...OWN, "history/states/2-B.txt": DEP_STATE_2 }, [DEP_NAME]);
      rec("⭐⭐⭐ an add-on holding the dependency's own 2-B.txt is not told of its naval base", told(await S.validate(a)).length === 0, told(await S.validate(a)));
    }

    console.log("\n=== 3. …but a naval base on an inland province the add-on itself made IS reported ===");
    {
      const a = W.mod("AddonBuilt", { "history/states/1-A.txt": lib.st(1, "4", { history: base(4) }) }, [DEP_NAME]);
      rec("⭐⭐⭐ a naval base the add-on built on inland province 4 is reported, and the dependency's is not", told(await S.validate(a)).join() === "1:4", told(await S.validate(a)));
      const b = W.mod("AddonMoved", { "history/states/2-B.txt": lib.st(2, "2"), "history/states/3-C.txt": lib.st(3, "3 5", { history: base(5) }) }, [DEP_NAME]);
      rec("⭐⭐ province 5 moved into state 3 with its naval base is the add-on's to answer for", told(await S.validate(b)).join() === "3:5", told(await S.validate(b)));
      const c = W.mod("AddonUncoasted", { "map/definition.csv": lib.DEF({ 2: "2;200;0;0;land;false;plains;1" }) }, [COAST_NAME]);
      rec("⭐⭐⭐ the add-on marking its dependency's port province inland in definition.csv is reported", told(await S.validate(c)).join() === "2:2", told(await S.validate(c)));
    }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 10).join("\n") : e);
    fails.push("harness error");
  } finally {
    if (S) S.close();
    W.cleanup();
  }
  console.log(`\n=== an add-on is not told of a naval base on an inland province it inherited: ${checks} checks, ${fails.length} failed ===`);
  if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
})();
