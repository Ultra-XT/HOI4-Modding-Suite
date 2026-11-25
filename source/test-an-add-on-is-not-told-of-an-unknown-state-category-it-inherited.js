// An add-on is not told that a state uses a category nothing defines when the state and its category come from its dependency.
// #an-add-on-is-not-told-of-an-unknown-state-category-it-inherited
//
// THE DEFECT. unknown_state_category — an error with no Auto-fix — reported every state in the merged map whose state_category no
// loaded common/state_category file defines, whoever ships the state. Its sibling state_no_category now asks whose it is
// (stateCategoryIsTheModsOwn); this one, in the same loop, never did.
//
// MEASURED on the base commit 4592c54, through GET /api/map/validate?modPath: on this file's fixture (a dependency shipping state 3 on
// state_category = megalopoliss, and an add-on over it with one problem of its own) the add-on was told unknown_state_category [3].
// And in batch 6's endpoint sweep, an add-on over the installed Old World Blues with one problem of its own was told OWB's
// unknown_state_category (state 1182, "ENCLAVE") before and after both Auto-fix clicks (logs sweep-base-OWB.json) — a problem the
// add-on can neither cause nor clear, and because it never goes away the add-on is never clean, so every later Auto-fix click
// runs the whole ~50 s pass for nothing.
//
// THE FIX. The rule asks stateCategoryIsTheModsOwn, the helper state_no_category and fixMissingStateCategories share: a state the
// layers below load with provinces and the same category is inherited, a verbatim copy in the mod included. Nova merges every
// layer's state categories, so a category nothing defines for the mod was defined by nothing below it either. A state the add-on
// invented, or whose category it wrote, is still reported (section 3).
"use strict";

const fs = require("fs");
const path = require("path");
const lib = require("./testlib-two-layer-map.js");

let checks = 0, skips = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (ok || detail == null ? "" : "   -> " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 360)));
  if (!ok) fails.push(label);
};
const skip = (label) => { skips++; console.log("  SKIP " + label); };

const W = lib.makeWorld("inhunkcat");
const { createApp } = require("./server.js");
const md = require("./map-data.js");

const RULE = "unknown_state_category";
const DEP_NAME = "Unknown category dependency";
const DEP_STATE_3 = lib.st(3, "3", { category: "megalopoliss" });
const DEP = W.mod(DEP_NAME, { "history/states/3-C.txt": DEP_STATE_3 });
const OWN = { "history/states/2-B.txt": lib.st(2, "2 5", { manpower: 0 }) };

(async () => {
  let S = null;
  try {
    S = await lib.startServer(createApp);

    console.log("\n=== THE CONTROLS ===");
    {
      const v = await S.validate(DEP);
      rec("the dependency, validated as the mod over the game, is told its state 3 uses a category nothing defines", lib.idsOf(v, RULE).join() === "3", lib.idsOf(v, RULE));
      const pv = await S.validate(W.mod("Plain", OWN));
      rec("a mod over the game alone, with the same one problem, is told of no unknown category", lib.idsOf(pv, RULE).length === 0 && lib.idsOf(pv, "state_no_manpower").join() === "2", lib.rulesIn(pv));
    }

    console.log("\n=== 1. an add-on with one problem of its own is not told the dependency's ===");
    {
      const a = W.mod("Addon", OWN, [DEP_NAME]);
      const v = await S.validate(a);
      rec("THE CONTROL: the add-on is told its own problem (state 2 has no manpower)", lib.idsOf(v, "state_no_manpower").join() === "2", lib.rulesIn(v));
      rec("⭐⭐⭐ …and is not told that the dependency's state 3 uses a category nothing defines", lib.idsOf(v, RULE).length === 0, lib.idsOf(v, RULE));
      const r = await S.autoFix(a);
      rec("the add-on's Auto-fix click clears its own problem", r.status === 200 && r.body.ok === true && !r.body.nothingToFix, r.body);
      // province_too_large is this small fixture's own warning (it is not a problem the add-on made either), so the click cannot
      // answer "nothing to fix" here; what matters is that nothing of the dependency's is left standing against the add-on.
      const v2 = await S.validate(a);
      rec("⭐⭐ …and leaves the add-on with nothing of its dependency's still reported against it", v2.problems.filter((p) => p.rule !== "province_too_large").length === 0,
        lib.rulesIn(v2));
    }

    console.log("\n=== 2. a verbatim copy of the dependency's state is not an authorship claim ===");
    {
      const a = W.mod("AddonCopy", { ...OWN, "history/states/3-C.txt": DEP_STATE_3 }, [DEP_NAME]);
      rec("⭐⭐⭐ an add-on holding the dependency's own 3-C.txt is not told state 3's category is unknown", lib.idsOf(await S.validate(a), RULE).length === 0, lib.idsOf(await S.validate(a), RULE));
    }

    console.log("\n=== 3. …but a category the add-on itself wrote IS reported ===");
    {
      const a = W.mod("AddonOther", { "history/states/3-C.txt": lib.st(3, "3", { category: "megapolis" }) }, [DEP_NAME]);
      rec("⭐⭐⭐ the add-on writing a different unknown category on the dependency's state is reported", lib.idsOf(await S.validate(a), RULE).join() === "3", lib.idsOf(await S.validate(a), RULE));
      const b = W.mod("AddonGame", { "history/states/1-A.txt": lib.st(1, "4", { category: "megalopoliss" }) }, [DEP_NAME]);
      rec("⭐⭐⭐ the add-on putting a game state on an unknown category is reported, and the dependency's 3 is not", lib.idsOf(await S.validate(b), RULE).join() === "1", lib.idsOf(await S.validate(b), RULE));
      const c = W.mod("AddonNew", { "history/states/2-B.txt": lib.st(2, "2"), "history/states/4-New.txt": lib.st(4, "5", { category: "megalopoliss" }) }, [DEP_NAME]);
      rec("⭐⭐ a state the add-on invented on an unknown category is reported", lib.idsOf(await S.validate(c), RULE).join() === "4", lib.idsOf(await S.validate(c), RULE));
    }

    console.log("\n=== 4. the real Old World Blues (read-only; only a temp add-on is written) ===");
    {
      const VAN = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
      const OWB = "D:/SteamLibrary/steamapps/workshop/content/394360/2265420196";
      if (!fs.existsSync(path.join(OWB, "history", "states")) || !fs.existsSync(path.join(VAN, "history", "states"))) {
        skip("Old World Blues or the base game is not installed — the corpus half did NOT run");
      } else {
        const told = (opts) => md.validateMapModel(md.buildMapModel({ ...opts, cacheStableLayers: true })).filter((p) => p.rule === RULE).flatMap((p) => (p.items || []).map((i) => i.stateId));
        // Moved with #a-state-category-is-matched-without-regard-to-case: the control here was "Old World Blues is told its own", and
        // it held because OWB's state 1182 writes `state_category=ENCLAVE` for the category it defines as `enclave`. hoi4.exe finds a
        // category without regard to case, so that state was never unknown and OWB is told nothing. The control is now DERIVED — OWB is
        // told exactly its states on a category nothing defines in any capitalisation — and the add-on half runs every time instead
        // of skipping when that list is empty.
        const own = told({ modRoot: OWB, gameRoot: VAN, dependencyRoots: [] });
        const owbModel = md.buildMapModel({ modRoot: OWB, gameRoot: VAN, dependencyRoots: [], cacheStableLayers: true });
        const known = owbModel.categorySlots || {};
        const fold = (s) => String(s).trim().replace(/[A-Z]/g, (c) => c.toLowerCase());
        const nowhere = (owbModel.states || []).filter((s) => (s.provinces || []).length && String(s.category || "").trim()
          && !Object.keys(known).some((k) => fold(k) === fold(s.category))).map((s) => s.id);
        rec(`THE CONTROL: Old World Blues is told exactly its states on a category nothing defines in any case (${nowhere.join(", ") || "none"})`,
          own.slice().sort().join() === nowhere.slice().sort().join(), { own, nowhere });
        const a = lib.write(path.join(W.MODS, "owb-addon"), { "descriptor.mod": 'name="OWB addon"\ndependencies={ "Old World Blues" }\n' });
        const inherited = told({ modRoot: a, gameRoot: VAN, dependencyRoots: [OWB] });
        rec(`⭐⭐⭐ an add-on over Old World Blues is told none of them`, inherited.length === 0, inherited);
      }
    }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 10).join("\n") : e);
    fails.push("harness error");
  } finally {
    if (S) S.close();
    W.cleanup();
  }
  console.log(`\n=== an add-on is not told of an unknown state category it inherited: ${checks} checks, ${fails.length} failed${skips ? `, ${skips} SKIPPED (not counted as passes)` : ""} ===`);
  if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
})();
