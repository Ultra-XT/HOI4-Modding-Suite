// Auto-fix gives a state with no state_category a category its shared buildings fit, so the click that clears "State has no
// category" does not create "State has more buildings than slots" for the same state. #auto-fix-gives-a-state-a-category-that-holds-its-buildings
//
// THE DEFECT. fixMissingStateCategories put every category-less state on "rural" whenever the slot table defines rural, whatever the
// state holds. state_buildings_exceed_slots counts a state's civilian factories, military factories and dockyards against its
// category's local_building_slots and skips a state with no category, so the same click that cleared state_no_category created
// state_buildings_exceed_slots for that state. The mod was then never clean, so every later click ran the whole Auto-fix pass again.
//
// MEASURED. Batch 7's endpoint sweep (fb6224b): an add-on over Old World Blues holding OWB's own history/states/1-State.txt without its
// state_category line (metropolis below, 1 military and 4 civilian factories). Click 1 set rural (OWB's rural has 1 slot), the add-on
// was then told state_buildings_exceed_slots for its own state 1, and click 2 took 52.9 s re-running everything. On the base commit
// 65978a2 this file failed 12 of its 31 checks: every fixture state whose buildings rural cannot hold got rural and was then reported
// over its slots, and so was the installed OWB's state 1 (5 shared buildings in rural's 1 slot). Nothing but the chosen category moved.
//
// THE FIX. The category is chosen per state, from the table the validator sizes states with (model.categorySlots), counting the
// state's own add_extra_state_shared_building_slots:
//   1. the category the layers below give the same state, when it is defined and adds nothing state_buildings_exceed_slots reports:
//      the buildings fit it, or the overflow is the one the layers below already ship (stateBuildingsOverSlotsIsTheModsOwn);
//   2. else rural, when rural holds them (the choice before, kept: a 0-slot category such as wasteland is never picked for a state
//      that fits rural);
//   3. else the smallest defined category that holds them;
//   4. else, when none does, the one with the most slots (the overflow is then the mod's own, and the smallest it can be).
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

const W = lib.makeWorld("catfits");
const { createApp } = require("./server.js");
const md = require("./map-data.js");

const NO_CAT = "state_no_category", OVER = "state_buildings_exceed_slots";
const buildings = (o) => `\t\tbuildings = {\n${Object.entries(o).map(([k, n]) => `\t\t\t${k} = ${n}\n`).join("")}\t\t}\n`;
const withoutCategory = (src) => src.replace(/^[ \t]*state_category\s*=\s*\S+[ \t]*\r?\n/m, () => "");
// The game's table (testlib): rural 2, town 4. The dependency adds city 6 and a 0-slot wasteland.
const DEP_NAME = "Category table dependency";
const DEP_1 = lib.st(1, "4", { category: "town", history: buildings({ industrial_complex: 2, arms_factory: 1 }) });   // 3 in town's 4
const DEP_3 = lib.st(3, "3", { category: "town", history: buildings({ industrial_complex: 5 }) });                    // 5 over town's 4
const DEP = W.mod(DEP_NAME, {
  "common/state_category/01_more.txt": "state_categories = {\n\tcity = {\n\t\tlocal_building_slots = 6\n\t}\n\twasteland = {\n\t\tlocal_building_slots = 0\n\t}\n}\n",
  "history/states/1-A.txt": DEP_1,
  "history/states/3-C.txt": DEP_3,
});
const has = (d, rel) => fs.existsSync(path.join(d, ...rel.split("/")));
const read = (d, rel) => fs.readFileSync(path.join(d, ...rel.split("/")), "utf8");
const categoryIn = (d, rel) => { if (!has(d, rel)) return null; const m = /(^|\s)state_category\s*=\s*(\S+)/.exec(read(d, rel)); return m ? m[2] : null; };
/** A state the add-on carves out of the game's state 2: province 5, no category. */
const carved = (history) => ({ "history/states/2-B.txt": lib.st(2, "2"), "history/states/4-New.txt": lib.st(4, "5", { category: "", history }) });

(async () => {
  let S = null;
  try {
    S = await lib.startServer(createApp);

    console.log("\n=== THE CONTROLS ===");
    {
      const v = await S.validate(DEP);
      rec("the dependency, validated as the mod over the game, is told its state 3 has more buildings than town's slots", lib.idsOf(v, OVER).join() === "3", lib.idsOf(v, OVER));
      rec("…and of no state without a category", lib.idsOf(v, NO_CAT).length === 0, lib.idsOf(v, NO_CAT));
      rec("state_no_category is not a rule Save stops for, so this is about a warning the click must not create", !require("./public/map-rule-labels.js").isFatalRule(NO_CAT));
    }

    /** Validate, click Auto-fix as the Map Errors popup does, validate again. */
    const click = async (a) => {
      const before = await S.validate(a);
      const t0 = lib.tree(a);
      const r = await S.autoFix(a);
      const t1 = lib.tree(a);
      const after = await S.validate(a);
      return { before, r, after, wrote: lib.written(t0, t1), t1 };
    };

    console.log("\n=== 1. the measured shape: the add-on holds the dependency's state without its category line ===");
    {
      const a = W.mod("AddonCopy", { "history/states/1-A.txt": withoutCategory(DEP_1) }, [DEP_NAME]);
      const c = await click(a);
      rec("THE CONTROL: before the click the add-on is told its state 1 has no category", lib.idsOf(c.before, NO_CAT).join() === "1", lib.rulesIn(c.before));
      rec("…and nothing about its slots (a state with no category has none to count)", lib.idsOf(c.before, OVER).length === 0, lib.idsOf(c.before, OVER));
      rec("the click ran and gave state 1 a category", c.r.status === 200 && c.r.body.ok === true && ((c.r.body.fixes || {}).categories || {}).applied.join() === "1", c.r.body.fixes && c.r.body.fixes.categories);
      rec("⭐⭐⭐ …the category the dependency gives the same state (town), which holds its 3 factories", categoryIn(a, "history/states/1-A.txt") === "town", categoryIn(a, "history/states/1-A.txt"));
      rec("⭐⭐⭐ after the click the add-on is not told state 1 has more buildings than slots", lib.idsOf(c.after, OVER).length === 0, lib.idsOf(c.after, OVER));
      rec("…nor that it has no category", lib.idsOf(c.after, NO_CAT).length === 0, lib.idsOf(c.after, NO_CAT));
      rec("⭐⭐ the click wrote only the add-on's own state file", c.wrote.join() === "history/states/1-A.txt", c.wrote);
      rec("⭐⭐ the result names the category it gave each state", ((c.r.body.fixes || {}).categories || {}).categories && c.r.body.fixes.categories.categories["1"] === "town", c.r.body.fixes && c.r.body.fixes.categories);
      const r2 = await S.autoFix(a);
      rec("⭐ a second click writes nothing", r2.status === 200 && lib.written(c.t1, lib.tree(a)).length === 0, lib.written(c.t1, lib.tree(a)));
    }

    console.log("\n=== 2. the dependency's category, even though its overflow is inherited ===");
    {
      const a = W.mod("AddonCrowdedCopy", { "history/states/3-C.txt": withoutCategory(DEP_3) }, [DEP_NAME]);
      const c = await click(a);
      rec("THE CONTROL: before the click the add-on is told its state 3 has no category", lib.idsOf(c.before, NO_CAT).join() === "3", lib.rulesIn(c.before));
      rec("⭐⭐⭐ Auto-fix gives it back town, the dependency's own category", categoryIn(a, "history/states/3-C.txt") === "town", categoryIn(a, "history/states/3-C.txt"));
      rec("⭐⭐⭐ …and the add-on is not told of the overflow, which is exactly the dependency's", lib.idsOf(c.after, OVER).length === 0, lib.idsOf(c.after, OVER));
    }

    console.log("\n=== 3. the add-on built more than the dependency's category holds ===");
    {
      const a = W.mod("AddonBuiltMore", { "history/states/1-A.txt": lib.st(1, "4", { category: "", history: buildings({ industrial_complex: 4, arms_factory: 1 }) }) }, [DEP_NAME]);
      const c = await click(a);
      rec("THE CONTROL: before the click state 1 has no category", lib.idsOf(c.before, NO_CAT).join() === "1", lib.rulesIn(c.before));
      rec("⭐⭐⭐ Auto-fix gives it the smallest category that holds 5 (city: 6), not town (4)", categoryIn(a, "history/states/1-A.txt") === "city", categoryIn(a, "history/states/1-A.txt"));
      rec("⭐⭐⭐ …and the add-on is not told state 1 has more buildings than slots", lib.idsOf(c.after, OVER).length === 0, lib.idsOf(c.after, OVER));
    }

    console.log("\n=== 4. a state the add-on invented ===");
    {
      const a = W.mod("AddonNewCrowded", carved(buildings({ industrial_complex: 3 })), [DEP_NAME]);
      const c = await click(a);
      rec("THE CONTROL: before the click the invented state 4 has no category", lib.idsOf(c.before, NO_CAT).join() === "4", lib.rulesIn(c.before));
      rec("⭐⭐⭐ with 3 factories it gets the smallest category that holds them (town: 4), not rural (2)", categoryIn(a, "history/states/4-New.txt") === "town", categoryIn(a, "history/states/4-New.txt"));
      rec("⭐⭐⭐ …and is not reported over its slots after the click", lib.idsOf(c.after, OVER).length === 0, lib.idsOf(c.after, OVER));

      const b = W.mod("AddonNewSmall", carved(buildings({ industrial_complex: 1 })), [DEP_NAME]);
      const cb = await click(b);
      rec("⭐⭐ with 1 factory it still gets rural — never the 0-slot wasteland, even though wasteland is smaller", categoryIn(b, "history/states/4-New.txt") === "rural", categoryIn(b, "history/states/4-New.txt"));
      rec("…and is not reported over its slots", lib.idsOf(cb.after, OVER).length === 0 && lib.idsOf(cb.after, NO_CAT).length === 0, lib.rulesIn(cb.after));

      const e = W.mod("AddonNewExtra", carved(buildings({ industrial_complex: 3 }) + "\t\tadd_extra_state_shared_building_slots = 1\n"), [DEP_NAME]);
      const ce = await click(e);
      rec("⭐⭐ with 3 factories and one extra slot of its own, rural (2 + 1) holds them, so it gets rural", categoryIn(e, "history/states/4-New.txt") === "rural", categoryIn(e, "history/states/4-New.txt"));
      rec("…and is not reported over its slots", lib.idsOf(ce.after, OVER).length === 0, lib.idsOf(ce.after, OVER));

      const f = W.mod("AddonNewHuge", carved(buildings({ industrial_complex: 9 })), [DEP_NAME]);
      const cf = await click(f);
      rec("⭐⭐⭐ with 9 factories no category holds them, so it gets the one with the most slots (city: 6)", categoryIn(f, "history/states/4-New.txt") === "city", categoryIn(f, "history/states/4-New.txt"));
      rec("…its category problem is gone, and the overflow it keeps is its own to lower", lib.idsOf(cf.after, NO_CAT).length === 0 && lib.idsOf(cf.after, OVER).join() === "4", lib.rulesIn(cf.after));
    }

    console.log("\n=== 6. the dependency spells its category in other capital letters ===");
    {
      // #a-state-category-is-matched-without-regard-to-case — HOI4 looks a category up without regard to case (Old World Blues ships
      // state 1182 on ENCLAVE and defines enclave). Merged beside that fix, this chooser still asked the table for the exact spelling, so
      // a state the layers below put on CITY was not recognised as having a category below at all: it was handed town, the smallest
      // category holding its 3 factories, and the add-on's copy silently lost the dependency's 6-slot city for a 4-slot town.
      const CASE_NAME = "Category case dependency";
      const CASE_1 = lib.st(1, "4", { category: "CITY", history: buildings({ industrial_complex: 3 }) });
      const dep = W.mod(CASE_NAME, {
        "common/state_category/01_more.txt": "state_categories = {\n\tcity = {\n\t\tlocal_building_slots = 6\n\t}\n}\n",
        "history/states/1-A.txt": CASE_1,
      });
      const dv = await S.validate(dep);
      rec("THE CONTROL: the dependency's CITY is the category city, so it is not told of an unknown category", lib.idsOf(dv, "unknown_state_category").length === 0 && lib.idsOf(dv, OVER).length === 0, lib.rulesIn(dv));
      const a = W.mod("AddonCaseCopy", { "history/states/1-A.txt": withoutCategory(CASE_1) }, [CASE_NAME]);
      const c = await click(a);
      rec("THE CONTROL: before the click the add-on is told its state 1 has no category", lib.idsOf(c.before, NO_CAT).join() === "1", lib.rulesIn(c.before));
      rec("⭐⭐⭐ Auto-fix gives it back the dependency's own category, spelled as the dependency spells it (CITY), not town", categoryIn(a, "history/states/1-A.txt") === "CITY", categoryIn(a, "history/states/1-A.txt"));
      rec("…and after the click the add-on is told nothing about state 1's category or slots", [NO_CAT, OVER, "unknown_state_category"].every((r) => lib.idsOf(c.after, r).length === 0), lib.rulesIn(c.after));
    }

    console.log("\n=== 5. the real Old World Blues (read-only; only a temp add-on is written) ===");
    {
      const VAN = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
      const OWB = "D:/SteamLibrary/steamapps/workshop/content/394360/2265420196";
      if (!fs.existsSync(path.join(OWB, "history", "states")) || !fs.existsSync(path.join(VAN, "history", "states"))) {
        skip("Old World Blues or the base game is not installed — the corpus half did NOT run");
      } else {
        const table = md.buildMapModel({ modRoot: OWB, gameRoot: VAN, dependencyRoots: [], cacheStableLayers: true }).categorySlots || {};
        const shared = (s) => { const b = s.buildings || {}; return (+b.industrial_complex || 0) + (+b.arms_factory || 0) + (+b.dockyard || 0); };
        // The first single-state file, by id, whose own category holds its shared buildings and rural does not.
        let pick = null;
        const dir = path.join(OWB, "history", "states");
        const files = fs.readdirSync(dir).filter((f) => /\.txt$/i.test(f)).sort((x, y) => ((parseInt(x, 10) || 1e9) - (parseInt(y, 10) || 1e9)) || x.localeCompare(y));
        for (const file of files) {
          const src = fs.readFileSync(path.join(dir, file), "latin1");
          const states = md.parseStatesText(src);
          if (states.length !== 1) continue;
          const s = states[0], extra = +s.extraBuildingSlots || 0;
          if (!(s.manpower > 0) || !s.provinces.length || !Object.prototype.hasOwnProperty.call(table, s.category) || !Object.prototype.hasOwnProperty.call(table, "rural")) continue;
          if (shared(s) > table.rural + extra && shared(s) <= table[s.category] + extra && withoutCategory(src) !== src) { pick = { file, src, s }; break; }
        }
        if (!pick) skip("Old World Blues ships no state that rural cannot hold and its own category can — the corpus half has nothing to measure");
        else {
          const a = lib.write(path.join(W.MODS, "owb-addon"), { "descriptor.mod": 'name="OWB addon"\ndependencies={ "Old World Blues" }\n' });
          fs.mkdirSync(path.join(a, "history", "states"), { recursive: true });
          fs.writeFileSync(path.join(a, "history", "states", pick.file), withoutCategory(pick.src), "latin1");
          const opts = { modRoot: a, gameRoot: VAN, dependencyRoots: [OWB] };
          const told = (rule) => md.validateMapModel(md.buildMapModel({ ...opts, cacheStableLayers: true })).filter((p) => p.rule === rule)
            .flatMap((p) => (p.states || []).concat((p.items || []).map((i) => i.stateId))).map(Number);
          rec(`THE CONTROL: the add-on holding OWB's ${pick.file} without its category is told state ${pick.s.id} has no category`, told(NO_CAT).includes(pick.s.id), told(NO_CAT));
          const r = md.fixMissingStateCategories(opts);
          rec(`the fixer gave state ${pick.s.id} a category`, !!r && (r.applied || []).includes(pick.s.id), r);
          rec(`⭐⭐⭐ …OWB's own (${pick.s.category}), which holds its ${shared(pick.s)} shared buildings where rural's ${table.rural} do not`, categoryIn(a, "history/states/" + pick.file) === pick.s.category, categoryIn(a, "history/states/" + pick.file));
          rec(`⭐⭐⭐ …and the add-on is not told state ${pick.s.id} has more buildings than slots`, !told(OVER).includes(pick.s.id), told(OVER));
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
  console.log(`\n=== auto-fix gives a state a category that holds its buildings: ${checks} checks, ${fails.length} failed${skips ? `, ${skips} SKIPPED (not counted as passes)` : ""} ===`);
  if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
})();
