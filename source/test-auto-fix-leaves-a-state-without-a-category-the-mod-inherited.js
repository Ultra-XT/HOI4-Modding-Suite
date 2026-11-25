// An add-on is not told about a state with no state_category that it only inherited, and one Auto-fix click never copies that
// state's file in to give it one. #auto-fix-leaves-a-state-without-a-category-the-mod-inherited
//
// THE DEFECT. state_no_category reported every state with provinces and no category in the merged map, whoever ships it, and
// fixMissingStateCategories — which autoFixMap runs on every click — wrote a category into every one of them through
// writeStateFields, which copies the state's file into the mod before it writes. Batch 6's coverage table lists the pair as
// "BOTH UNGATED".
//
// MEASURED on the base commit 4592c54, through the endpoints the Map Errors popup calls (GET /api/map/validate?modPath, then
// POST /api/map/auto-fix { modPath }), on this file's fixture: a dependency shipping state 3 with no state_category line, and an
// add-on over it with one problem of its own (state 2 with manpower 0). The validator told the add-on state_no_category [3], and
// ONE click wrote the dependency's history/states/3-C.txt (128 B, now with state_category = rural) into the add-on. That copy
// replaces the dependency's own file wholesale, so every later change the dependency makes to state 3 is lost to the add-on, and
// nothing in Nova undoes it. No shipping map carries the shape (state_no_category fires 0 times in the six-map runs), so only a
// fixture shows it.
//
// THE FIX. One helper, stateCategoryIsTheModsOwn, answers for the rule and the fixer: a state the layers below already load with
// provinces and the same category is inherited — a verbatim copy in the mod included, since a file Nova materialised is not an
// authorship claim. A state the mod invented, took the category from, or gave provinces is the mod's, reported and repaired as
// before (section 3).
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

const W = lib.makeWorld("inhcat");
const { createApp } = require("./server.js");
const md = require("./map-data.js");

const RULE = "state_no_category";
const DEP_NAME = "Inherited category dependency";
const DEP_STATE_3 = lib.st(3, "3", { category: "" });
const DEP = W.mod(DEP_NAME, { "history/states/3-C.txt": DEP_STATE_3 });
const OWN = { "history/states/2-B.txt": lib.st(2, "2 5", { manpower: 0 }) };
const has = (d, rel) => fs.existsSync(path.join(d, ...rel.split("/")));
const read = (d, rel) => fs.readFileSync(path.join(d, ...rel.split("/")), "utf8");
const fieldIn = (d, rel, key) => { if (!has(d, rel)) return null; const m = new RegExp("(^|\\s)" + key + "\\s*=\\s*(\\S+)").exec(read(d, rel)); return m ? m[2] : null; };

(async () => {
  let S = null;
  try {
    S = await lib.startServer(createApp);

    console.log("\n=== THE CONTROLS ===");
    {
      const v = await S.validate(DEP);
      rec("the dependency, validated as the mod over the game, is told its state 3 has no category", lib.idsOf(v, RULE).join() === "3", lib.idsOf(v, RULE));
      const plain = W.mod("Plain", OWN);
      const pv = await S.validate(plain);
      rec("a mod over the game alone, with the same one problem, is told of no state without a category", lib.idsOf(pv, RULE).length === 0 && lib.idsOf(pv, "state_no_manpower").join() === "2", lib.rulesIn(pv));
    }

    console.log("\n=== 1. an add-on with one problem of its own: the dependency's state is neither reported nor copied in ===");
    {
      const a = W.mod("Addon", OWN, [DEP_NAME]);
      const v = await S.validate(a);
      rec("THE CONTROL: the add-on is told its own problem (state 2 has no manpower)", lib.idsOf(v, "state_no_manpower").join() === "2", lib.rulesIn(v));
      rec("⭐⭐⭐ …and is not told that the dependency's state 3 has no category", lib.idsOf(v, RULE).length === 0, lib.idsOf(v, RULE));
      const before = lib.tree(a);
      const r1 = await S.autoFix(a);
      const after = lib.tree(a);
      rec("the click ran every fixer — it was not 'nothing to fix'", r1.status === 200 && r1.body.ok === true && !r1.body.nothingToFix, r1.body);
      rec("⭐⭐ …and repaired the add-on's own problem", +fieldIn(a, "history/states/2-B.txt", "manpower") > 0, fieldIn(a, "history/states/2-B.txt", "manpower"));
      rec("⭐⭐⭐ …set a category on no state", ((r1.body.fixes || {}).categories || {}).count === 0, (r1.body.fixes || {}).categories);
      rec("⭐⭐⭐ …and wrote no copy of the dependency's 3-C.txt into the add-on", !has(a, "history/states/3-C.txt"), lib.written(before, after));
      rec("⭐⭐ the whole click wrote only the add-on's own state file", lib.written(before, after).join() === "history/states/2-B.txt", lib.written(before, after));
      await S.autoFix(a);
      rec("⭐ a second click writes nothing", lib.written(after, lib.tree(a)).length === 0, lib.written(after, lib.tree(a)));
    }

    console.log("\n=== 2. a verbatim copy of the dependency's state is not an authorship claim ===");
    {
      const a = W.mod("AddonCopy", { ...OWN, "history/states/3-C.txt": DEP_STATE_3 }, [DEP_NAME]);
      const v = await S.validate(a);
      rec("⭐⭐⭐ an add-on holding the dependency's own 3-C.txt is not told state 3 has no category", lib.idsOf(v, RULE).length === 0, lib.idsOf(v, RULE));
      const r = await S.autoFix(a);
      rec("the click ran", r.status === 200 && r.body.ok === true, r.body);
      rec("⭐⭐⭐ …and leaves the copy exactly as the dependency wrote it", read(a, "history/states/3-C.txt") === DEP_STATE_3, read(a, "history/states/3-C.txt"));
    }

    console.log("\n=== 3. …but a state the add-on itself left without a category IS reported and repaired ===");
    {
      // (a) the add-on removed the category from a state of the game's
      const a = W.mod("AddonRemoved", { "history/states/1-A.txt": lib.st(1, "4", { category: "" }) }, [DEP_NAME]);
      const v = await S.validate(a);
      rec("⭐⭐⭐ a state whose category the add-on removed is reported, and the dependency's is not", lib.idsOf(v, RULE).join() === "1", lib.idsOf(v, RULE));
      const r = await S.autoFix(a);
      rec("⭐⭐ Auto-fix gives it a category, in the add-on's own file", r.status === 200 && r.body.ok === true && fieldIn(a, "history/states/1-A.txt", "state_category") !== null, { fixes: (r.body.fixes || {}).categories, cat: fieldIn(a, "history/states/1-A.txt", "state_category") });
      rec("⭐⭐⭐ …still without copying the dependency's state in", !has(a, "history/states/3-C.txt"));
      rec("…and the validator has no category-less state left to report", lib.idsOf(await S.validate(a), RULE).length === 0);

      // (b) a state the add-on invented, carved out of state 2, with no category
      const b = W.mod("AddonNew", { "history/states/2-B.txt": lib.st(2, "2"), "history/states/4-New.txt": lib.st(4, "5", { category: "" }) }, [DEP_NAME]);
      rec("⭐⭐ a state the add-on invented with no category is reported", lib.idsOf(await S.validate(b), RULE).join() === "4", lib.idsOf(await S.validate(b), RULE));
      const rb = md.fixMissingStateCategories({ modRoot: b, gameRoot: W.GAME, dependencyRoots: [DEP] });
      rec("⭐⭐ …and fixMissingStateCategories gives it a category, and only it", !!rb && rb.count === 1 && (rb.applied || []).join() === "4" && fieldIn(b, "history/states/4-New.txt", "state_category") !== null, rb);
      rec("⭐⭐⭐ …without copying the dependency's state in", !has(b, "history/states/3-C.txt"));

      // (c) the add-on gave provinces to a state its own dependency ships empty and without a category
      const EMPTY_NAME = "Empty state dependency";
      W.mod(EMPTY_NAME, { "history/states/4-Empty.txt": lib.st(4, "", { category: "" }) });
      const c = W.mod("AddonFilled", { "history/states/2-B.txt": lib.st(2, "2"), "history/states/4-Empty.txt": lib.st(4, "5", { category: "" }) }, [EMPTY_NAME]);
      rec("⭐⭐ a state the add-on gave provinces to, which held none below, is the add-on's to answer for", lib.idsOf(await S.validate(c), RULE).join() === "4", lib.idsOf(await S.validate(c), RULE));
    }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 10).join("\n") : e);
    fails.push("harness error");
  } finally {
    if (S) S.close();
    W.cleanup();
  }
  console.log(`\n=== auto-fix leaves a state without a category the mod inherited: ${checks} checks, ${fails.length} failed ===`);
  if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
})();
