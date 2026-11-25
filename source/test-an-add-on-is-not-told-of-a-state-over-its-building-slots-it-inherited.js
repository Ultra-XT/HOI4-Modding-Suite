// An add-on is not told that a state has more shared buildings than its category's slots when that exact overflow comes from its
// dependency. #an-add-on-is-not-told-of-a-state-over-its-building-slots-it-inherited
//
// THE DEFECT. state_buildings_exceed_slots — a warning with no Auto-fix — reported every state in the merged map whose civilian
// factories, military factories and dockyards outnumber its category's local_building_slots plus its own extra slots, whoever ships
// the state. Its neighbours in validateMapModel ask whose a problem is; this one never did.
//
// MEASURED on the base commit 4592c54, through GET /api/map/validate?modPath: on this file's fixture (a dependency shipping state 3 on
// rural, 2 slots, with 5 civilian factories, and an add-on over it with one problem of its own) the add-on was told
// state_buildings_exceed_slots [3]. And in batch 6's endpoint sweep an add-on over the installed Old World Blues with one problem of
// its own was told OWB's own overflow (state 90, 16 shared buildings on large_city) before and after both Auto-fix clicks
// (logs sweep-base-OWB.json). OWB launches with it.
//
// THE FIX. stateBuildingsOverSlotsIsTheModsOwn: the overflow is inherited when the layers below already load that state over its
// slots with the same shared total, the same category and the same number of slots — the slot table read from the layers below, so
// an add-on that lowers a category's local_building_slots under a dependency's state has made that overflow its own. A state the
// add-on invented, filled with more buildings, or moved onto a category that no longer fits is still reported (section 3).
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

const W = lib.makeWorld("inhslots");
const { createApp } = require("./server.js");
const md = require("./map-data.js");

const RULE = "state_buildings_exceed_slots";
const factories = (n) => `\t\tbuildings = {\n\t\t\tindustrial_complex = ${n}\n\t\t}\n`;
const DEP_NAME = "Crowded state dependency";
const DEP_STATE_3 = lib.st(3, "3", { history: factories(5) });            // rural: 2 slots
const DEP = W.mod(DEP_NAME, { "history/states/3-C.txt": DEP_STATE_3 });
const FITS_NAME = "Fitting town dependency";
W.mod(FITS_NAME, { "history/states/3-C.txt": lib.st(3, "3", { category: "town", history: factories(3) }) });   // town: 4 slots
const OWN = { "history/states/2-B.txt": lib.st(2, "2 5", { manpower: 0 }) };

(async () => {
  let S = null;
  try {
    S = await lib.startServer(createApp);

    console.log("\n=== THE CONTROLS ===");
    {
      const v = await S.validate(DEP);
      rec("the dependency, validated as the mod over the game, is told its state 3 has more buildings than slots", lib.idsOf(v, RULE).join() === "3", lib.idsOf(v, RULE));
      const pv = await S.validate(W.mod("Plain", OWN));
      rec("a mod over the game alone, with the same one problem, is told of no crowded state", lib.idsOf(pv, RULE).length === 0 && lib.idsOf(pv, "state_no_manpower").join() === "2", lib.rulesIn(pv));
    }

    console.log("\n=== 1. an add-on with one problem of its own is not told the dependency's ===");
    {
      const a = W.mod("Addon", OWN, [DEP_NAME]);
      const v = await S.validate(a);
      rec("THE CONTROL: the add-on is told its own problem (state 2 has no manpower)", lib.idsOf(v, "state_no_manpower").join() === "2", lib.rulesIn(v));
      rec("⭐⭐⭐ …and is not told that the dependency's state 3 has more buildings than slots", lib.idsOf(v, RULE).length === 0, lib.idsOf(v, RULE));
    }

    console.log("\n=== 2. a verbatim copy of the dependency's state is not an authorship claim ===");
    {
      const a = W.mod("AddonCopy", { ...OWN, "history/states/3-C.txt": DEP_STATE_3 }, [DEP_NAME]);
      rec("⭐⭐⭐ an add-on holding the dependency's own 3-C.txt is not told state 3 is crowded", lib.idsOf(await S.validate(a), RULE).length === 0, lib.idsOf(await S.validate(a), RULE));
    }

    console.log("\n=== 3. …but an overflow the add-on itself made IS reported ===");
    {
      const a = W.mod("AddonMore", { "history/states/3-C.txt": lib.st(3, "3", { history: factories(6) }) }, [DEP_NAME]);
      rec("⭐⭐⭐ the add-on adding a factory to the dependency's crowded state is reported", lib.idsOf(await S.validate(a), RULE).join() === "3", lib.idsOf(await S.validate(a), RULE));
      const b = W.mod("AddonGame", { "history/states/1-A.txt": lib.st(1, "4", { history: factories(3) }) }, [DEP_NAME]);
      rec("⭐⭐⭐ the add-on crowding a game state is reported, and the dependency's 3 is not", lib.idsOf(await S.validate(b), RULE).join() === "1", lib.idsOf(await S.validate(b), RULE));
      const c = W.mod("AddonTable", { "common/state_category/00_state_category.txt": "state_categories = {\n\trural = {\n\t\tlocal_building_slots = 2\n\t}\n\ttown = {\n\t\tlocal_building_slots = 2\n\t}\n}\n" }, [FITS_NAME]);
      rec("⭐⭐⭐ the add-on cutting town's slots under its dependency's fitting state is reported (the slot table is read from the layers below)", lib.idsOf(await S.validate(c), RULE).join() === "3", lib.idsOf(await S.validate(c), RULE));
      const d = W.mod("AddonNew", { "history/states/2-B.txt": lib.st(2, "2"), "history/states/4-New.txt": lib.st(4, "5", { history: factories(4) }) }, [DEP_NAME]);
      rec("⭐⭐ a crowded state the add-on invented is reported", lib.idsOf(await S.validate(d), RULE).join() === "4", lib.idsOf(await S.validate(d), RULE));
    }

    console.log("\n=== 4. the real Old World Blues (read-only; only a temp add-on is written) ===");
    {
      const VAN = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
      const OWB = "D:/SteamLibrary/steamapps/workshop/content/394360/2265420196";
      if (!fs.existsSync(path.join(OWB, "history", "states")) || !fs.existsSync(path.join(VAN, "history", "states"))) {
        skip("Old World Blues or the base game is not installed — the corpus half did NOT run");
      } else {
        const told = (opts) => md.validateMapModel(md.buildMapModel({ ...opts, cacheStableLayers: true })).filter((p) => p.rule === RULE).flatMap((p) => (p.items || []).map((i) => i.stateId));
        const own = told({ modRoot: OWB, gameRoot: VAN, dependencyRoots: [] });
        if (!own.length) skip("Old World Blues no longer ships a crowded state — the corpus half has nothing to measure");
        else {
          rec(`THE CONTROL: Old World Blues is told its own (${own.join(", ")})`, own.length > 0, own);
          const a = lib.write(path.join(W.MODS, "owb-addon"), { "descriptor.mod": 'name="OWB addon"\ndependencies={ "Old World Blues" }\n' });
          const inherited = told({ modRoot: a, gameRoot: VAN, dependencyRoots: [OWB] });
          rec("⭐⭐⭐ an add-on over Old World Blues is told none of them", inherited.length === 0, inherited);
        }
      }
    }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 10).join("\n") : e);
    fails.push("harness error");
  } finally {
    if (S) S.close();
    W.cleanup();
  }
  console.log(`\n=== an add-on is not told of a state over its building slots it inherited: ${checks} checks, ${fails.length} failed${skips ? `, ${skips} SKIPPED (not counted as passes)` : ""} ===`);
  if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
})();
