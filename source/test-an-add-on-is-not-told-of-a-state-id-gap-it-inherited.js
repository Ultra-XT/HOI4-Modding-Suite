// An add-on is not told of a state-id gap it inherited, and Auto-fix does not close one for it — while a gap the add-on's own
// edits open is still reported and still stops Save. #an-add-on-is-not-told-of-a-state-id-gap-it-inherited
//
// THE DEFECT. state_id_gap (FATAL, "refuses-to-load") read model.states with no ownership judgement. A brand-new add-on over a
// dependency with a gap was told that gap before any edit, and its Save gate stayed armed for good: nothing the add-on can do
// to its own files changes the ids its dependency loads. Its neighbours already ask: strategic_region_id_gap subtracts the holes
// the layers below have (strategicRegionsBelow), state_split_strategic_regions asks stateSplitIsTheModsOwn, and the add-on's
// other inherited problems were withheld. closeStateIdGaps, behind "Auto-fix all", then did what the rule asked: it slid the
// add-on's own highest state down into the dependency's gap.
//
// THE EVIDENCE (batch 8 discovery F13, f3.js on 65978a2): the dependency was a Delete-map world (replace_path="history/states",
// Generate land numbering 1082-1399, so ids 1..1081 missing). POST /api/mod/create { dependencies: [it] } made an add-on holding
// only descriptor.mod, a focus tree and a loc file; GET /api/map/validate on it answered state_id_gap (error, FATAL) and the gate
// counted 1, while the dependency's supply_area_state_missing, fractioned_naval_region and building_not_over_land were correctly
// withheld. After the add-on's own Save and two Auto-fix clicks, Auto-fix had renumbered its new state 1400 into gap 1
// (history/states/1400-STATE_1400.txt -> 1-STATE_1400.txt) and the gate was still armed with the dependency's 1,080 other gaps.
//
// WHAT COUNTS AS THE ADD-ON'S: the rule's neighbour's reading. A missing id above the highest id the layers below load, or one
// they load and the add-on no longer does (it shadowed that file, or renumbered or deleted that state), is the add-on's. A missing
// id at or under their highest that none of them loads is theirs.
//
// Requests are the page's: GET /api/map/validate?modPath (Map Errors and the Save gate), POST /api/map/auto-fix { modPath },
// POST /api/map/create-state { name, owner, modPath } and POST /api/map/delete-state { stateId, modPath } (flushMapSaves posts each
// queued body with modPath added). The Save gate is the REAL mapCrashGate, lifted by testlib-two-layer-map.js's saveGate.
"use strict";

const fs = require("fs");
const path = require("path");
const lib = require("./testlib-two-layer-map.js");
const { maskJsComments } = require("./testlib-strip-comments.js");

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (ok || detail == null ? "" : "   -> " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 900)));
  if (!ok) fails.push(label);
};

const world = lib.makeWorld("b9-gap-inherited");
const { createApp } = require("./server.js");
const labels = require("./public/map-rule-labels.js");

const RULE = "state_id_gap";
const gapsOf = (v) => ((v && v.problems) || []).filter((p) => p.rule === RULE);
const gapIds = (v) => { const g = gapsOf(v); return g.length ? (g[0].missing || []).slice() : []; };
/** The Save gate handed only the state_id_gap problems of a response: does that gap, by itself, stop Save? */
const gapAloneGate = (v) => lib.saveGate({ ok: true, errors: gapsOf(v).length, warnings: 0, problems: gapsOf(v) });
const stateFilesIn = (mod) => { try { return fs.readdirSync(path.join(mod, "history", "states")).sort(); } catch (_) { return []; } };

// The dependency: a mod that replaces history/states and ships states 1, 2 and 4 — the Delete-map world's shape, small. Its
// buildings.txt carries the base game's rows with state 3's re-keyed to 4, so the one thing wrong with it is the gap at 3.
const DEP_NAME = "gap dep replaces states";
const dep = world.mod(DEP_NAME, {
  "descriptor.mod": `name="${DEP_NAME}"\nsupported_version="1.*"\nreplace_path="history/states"\n`,
  "history/states/1-A.txt": lib.st(1, "4"),
  "history/states/2-B.txt": lib.st(2, "2 5"),
  "history/states/4-D.txt": lib.st(4, "3"),
  "map/buildings.txt": lib.BUILD.map((r) => r.replace(/^3;/, "4;")).join("\n"),
});
// A second dependency that does NOT replace history/states: it moves province 5 out of state 2 into a new state 5, so it loads
// the base game's 1 and 3, its own 2 and 5, and leaves 4 missing.
const DEP2_NAME = "gap dep over the game";
const dep2 = world.mod(DEP2_NAME, {
  "history/states/2-B.txt": lib.st(2, "2"),
  "history/states/5-E.txt": lib.st(5, "5"),
  "map/buildings.txt": lib.BUILD.concat(["5;air_base;64.00;9.50;31.00;0.00;0", "5;rocket_site_spawn;64.00;9.50;31.00;0.00;0"]).join("\n"),
});

(async () => {
  let srv = null;
  try {
    console.log("0. The page's requests, and why it matters");
    {
      const MAP = maskJsComments(fs.readFileSync(path.join(__dirname, "public", "map.js"), "utf8"));
      rec("the page posts Auto-fix as { modPath: modPath() }",
        (MAP.match(/fetch\("\/api\/map\/auto-fix", \{ method: "POST", headers: \{ "Content-Type": "application\/json" \}, body: JSON\.stringify\(\{ modPath: modPath\(\) \}\) \}\)/g) || []).length >= 1);
      rec("…and queues a delete as { stateId }", /queueWrite\("\/api\/map\/delete-state", \{ stateId: [a-z.]+ \}\)/.test(MAP));
      rec("state_id_gap is a rule Save stops for", labels.isFatalRule(RULE) === true);
    }

    srv = await lib.startServer(createApp);
    const depTree0 = lib.tree(dep), dep2Tree0 = lib.tree(dep2);

    console.log("\n1. CONTROL: the dependency opened as itself is told its gap");
    {
      const v = await srv.validate(dep);
      rec("the dependency is told id 3 is missing", JSON.stringify(gapIds(v)) === "[3]", gapsOf(v));
      const g = await lib.saveGate(v);
      rec("…and its Save stops", g.crashes >= 1, g.status);
      const v2 = await srv.validate(dep2);
      rec("the dependency over the game is told id 4 is missing", JSON.stringify(gapIds(v2)) === "[4]", gapsOf(v2));
    }

    console.log("\n2. ⭐⭐⭐ A brand-new add-on over it, before any edit");
    {
      const addon = world.mod("gap addon fresh", {}, [DEP_NAME]);
      const v = await srv.validate(addon);
      rec("⭐⭐⭐ the add-on is not told of the dependency's gap", gapsOf(v).length === 0, gapsOf(v));
      const g = await lib.saveGate(v);
      rec("⭐⭐⭐ …and Save is not stopped", g.crashes === 0 && !g.armed, { crashes: g.crashes, status: g.status, rules: lib.rulesIn(v) });
      const t0 = lib.tree(addon);
      const fx = await srv.autoFix(addon);
      const sg = (fx.body.fixes && fx.body.fixes.stateGaps) || {};
      rec("Auto-fix answers 200 ok", fx.status === 200 && fx.body.ok === true, { status: fx.status, error: fx.body.error });
      rec("⭐⭐ Auto-fix renumbers nothing into the dependency's gap", !(sg.renumbered || []).length && !sg.error, sg);
      rec("…and writes no state file into the add-on", stateFilesIn(addon).length === 0 && JSON.stringify(lib.written(t0, lib.tree(addon)).filter((k) => k.startsWith("history/states/"))) === "[]", stateFilesIn(addon));
      const v2 = await srv.validate(addon);
      rec("…after which it is still not told of the gap", gapsOf(v2).length === 0, gapsOf(v2));
    }

    console.log("\n3. ⭐⭐ An add-on that takes a state past the dependency's highest id, leaving 5 out");
    {
      // Province 5 moved out of state 2 into the add-on's own state 6: the add-on loads 1, 2, 4 and 6.
      const addon = world.mod("gap addon own state past", {
        "history/states/2-B.txt": lib.st(2, "2"),
        "history/states/6-F.txt": lib.st(6, "5"),
      }, [DEP_NAME]);
      const v = await srv.validate(addon);
      rec("⭐⭐⭐ the add-on is told of its own gap, 5, and only that one", JSON.stringify(gapIds(v)) === "[5]", gapsOf(v));
      const g = await gapAloneGate(v);
      rec("⭐⭐⭐ …and that gap, by itself, stops Save", g.crashes === 1 && g.armed, g.status);
      const fx = await srv.autoFix(addon);
      const sg = (fx.body.fixes && fx.body.fixes.stateGaps) || {};
      rec("⭐⭐⭐ Auto-fix moves state 6 into the add-on's gap, 5 — not into the dependency's, 3", JSON.stringify(sg.renumbered) === JSON.stringify([{ from: 6, to: 5 }]), sg);
      const v2 = await srv.validate(addon);
      rec("⭐⭐ …after which no gap is reported", gapsOf(v2).length === 0, gapsOf(v2));
    }

    console.log("\n4. ⭐⭐ An add-on that shadows the dependency's 4-D.txt with the state renumbered to 5");
    {
      const addon = world.mod("gap addon shadows a file", { "history/states/4-D.txt": lib.st(5, "3") }, [DEP_NAME]);
      const v = await srv.validate(addon);
      rec("⭐⭐⭐ the add-on is told id 4 is missing — the dependency loads it and the add-on no longer does — and not 3", JSON.stringify(gapIds(v)) === "[4]", gapsOf(v));
      const g = await gapAloneGate(v);
      rec("⭐⭐ …and that gap stops Save", g.crashes === 1 && g.armed, g.status);
    }

    console.log("\n5. ⭐⭐ The page creates two states in an add-on and deletes the first");
    {
      const addon = world.mod("gap addon deletes its own", {}, [DEP_NAME]);
      const c1 = await srv.post("/api/map/create-state", { name: "", owner: "" }, addon);
      const c2 = await srv.post("/api/map/create-state", { name: "", owner: "" }, addon);
      rec("both creates answer ok, with consecutive ids past the dependency's", c1.status === 200 && c2.status === 200 && c2.body.id === c1.body.id + 1 && c1.body.id === 5, [c1.body.id, c2.body.id, c1.body.error, c2.body.error]);
      const v0 = await srv.validate(addon);
      rec("CONTROL: before the delete the add-on is told of no gap", gapsOf(v0).length === 0, gapsOf(v0));
      const d = await srv.post("/api/map/delete-state", { stateId: c1.body.id }, addon);
      rec("the delete answers ok", d.status === 200 && d.body.ok !== false, d.body);
      const v = await srv.validate(addon);
      rec(`⭐⭐⭐ the add-on is told of the gap its delete opened, ${c1.body.id}, and only that one`, JSON.stringify(gapIds(v)) === JSON.stringify([c1.body.id]), gapsOf(v));
      const g = await gapAloneGate(v);
      rec("⭐⭐⭐ …and that gap stops Save", g.crashes === 1 && g.armed, g.status);
    }

    console.log("\n6. ⭐⭐ Over a dependency that does not replace history/states");
    {
      const fresh = world.mod("gap addon2 fresh", {}, [DEP2_NAME]);
      const v = await srv.validate(fresh);
      rec("⭐⭐⭐ a fresh add-on is not told of the dependency's gap at 4", gapsOf(v).length === 0, gapsOf(v));
      const own = world.mod("gap addon2 empties 3-C", { "history/states/3-C.txt": "# state 3 taken out by the add-on\n" }, [DEP2_NAME]);
      const v2 = await srv.validate(own);
      rec("⭐⭐⭐ an add-on that empties the base game's 3-C.txt is told id 3 is missing, and not 4", JSON.stringify(gapIds(v2)) === "[3]", gapsOf(v2));
    }

    console.log("\n7. CONTROL: a mod with nothing below its states owns every gap in them");
    {
      const mod = world.mod("gap own replace", {
        "descriptor.mod": 'name="gap own replace"\nsupported_version="1.*"\nreplace_path="history/states"\n',
        "history/states/1-A.txt": lib.st(1, "4"),
        "history/states/2-B.txt": lib.st(2, "2 5"),
        "history/states/4-D.txt": lib.st(4, "3"),
      });
      const v = await srv.validate(mod);
      rec("it is told id 3 is missing", JSON.stringify(gapIds(v)) === "[3]", gapsOf(v));
    }

    console.log("\n8. The dependencies were never written to");
    rec("the dependency that replaces history/states is byte-identical", lib.written(depTree0, lib.tree(dep)).length === 0, lib.written(depTree0, lib.tree(dep)));
    rec("…and so is the other", lib.written(dep2Tree0, lib.tree(dep2)).length === 0, lib.written(dep2Tree0, lib.tree(dep2)));
  } catch (e) {
    rec("harness threw: " + (e && e.stack ? e.stack.split("\n").slice(0, 6).join(" | ") : e), false);
  } finally {
    if (srv) srv.close();
    world.cleanup();
    console.log(`\n=== an add-on is not told of a state-id gap it inherited: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) { fails.forEach((f) => console.log("   FAILED: " + f)); process.exitCode = 1; }
  }
})();
