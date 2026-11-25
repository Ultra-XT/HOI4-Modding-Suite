// An add-on is not told — and its Save is not stopped — for a naval building its dependency ships in a state with no coast, and one
// Auto-fix click never copies that state's file in to remove it. A state the add-on itself landlocks still stops Save and is still
// repaired. #auto-fix-leaves-a-dockyard-without-a-coast-the-mod-inherited
//
// THE DEFECT. state_naval_building_without_coast is FATAL (the owner's island crash: a dockyard in a state an edit elsewhere had
// landlocked). The rule is fixNavalBuildingsWithoutCoast's own dry run, and neither asked whose problem it was: every state in the
// merged map keeping a dockyard (or a naval base on a province) with no sea beside it was reported to the mod — stopping its Save
// behind the type-"save" gate — and on a click removed, by editStateBlock, which copies the state's file into the mod first.
// Batch 6's coverage table lists the pair as "BOTH UNGATED, FATAL".
//
// MEASURED on the base commit 4592c54, through the endpoints the Map Errors popup calls (GET /api/map/validate?modPath, then POST
// /api/map/auto-fix { modPath }), on this file's fixture: a dependency shipping state 1 (inland) with a dockyard, and an add-on over
// it with one problem of its own. The validator told the add-on state_naval_building_without_coast [1] — a will-crash error its own
// Save would stop on — and ONE click wrote the dependency's history/states/1-A.txt (148 B, dockyard removed) into the add-on. No
// shipping map carries the shape (0 states on all six), so only a fixture shows it.
//
// THE FIX. fixNavalBuildingsWithoutCoast — the one function the rule and Auto-fix share — subtracts what the layers below already
// have: baseNavalBuildingsWithoutCoast runs the same judgement (navalBuildingsWithoutCoastWork) on the model the layers below load,
// and a state building or a province building it already names is inherited. The mod's edit at a distance is still the mod's: a
// sea retyped as land, a coast painted over, or a naval building written into a state file the mod ships — each is reported, gates
// Save, and is repaired (section 3): moved to a coast of its country, or, where its country has none, left where it is and said —
// Auto-fix deletes none since #a-coast-taken-away-keeps-its-naval-buildings; a province moved out of a coastal state takes the state's dockyard with it since
// #a-moved-coast-takes-its-dockyards, so it leaves nothing to report (3a). That is the reason the gate is a subtraction of what
// lies below and not "does the mod ship the state file": the owner's island landlocked two vanilla states the mod never touched.
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

const W = lib.makeWorld("inhdock");
const { createApp } = require("./server.js");
const md = require("./map-data.js");
const { isFatalRule } = require("./public/map-rule-labels.js");

const RULE = "state_naval_building_without_coast";
const DOCK = "\t\tbuildings = {\n\t\t\tdockyard = 1\n\t\t}\n";
const PORT5 = "\t\tbuildings = {\n\t\t\t5 = {\n\t\t\t\tnaval_base = 1\n\t\t\t}\n\t\t}\n";
// The dependency: state 1 is inland and keeps a dockyard; state 2 keeps a naval base on its inland province 5.
const DEP_NAME = "Landlocked dockyard dependency";
const DEP_STATE_1 = lib.st(1, "4", { history: DOCK });
const DEP_STATE_2 = lib.st(2, "2 5", { history: PORT5 });
const DEP = W.mod(DEP_NAME, { "history/states/1-A.txt": DEP_STATE_1, "history/states/2-B.txt": DEP_STATE_2 });
// A healthy dependency: state 2 keeps a dockyard and touches the sea through province 2.
const COAST_NAME = "Coastal dockyard dependency";
const COAST = W.mod(COAST_NAME, { "history/states/2-B.txt": lib.st(2, "2 5", { history: DOCK }) });
const OWN = { "history/states/3-C.txt": lib.st(3, "3", { manpower: 0 }) };
const has = (d, rel) => fs.existsSync(path.join(d, ...rel.split("/")));
const read = (d, rel) => (has(d, rel) ? fs.readFileSync(path.join(d, ...rel.split("/")), "utf8") : "");
const fatalIn = (v) => ((v && v.problems) || []).filter((p) => isFatalRule(p.rule)).length;
// Province 2's coast painted over: a strip of province 3 between it and the sea (3 stays coastal above the strip).
const PAINTED = lib.bmp24(256, 256, (x, y) => lib.COL[y < 60 ? 1 : y < 64 ? (x < 128 ? 3 : 1) : lib.provAt(x, y)]);

async function stopsSave(S, a, id, label) {
  const v = await S.validate(a);
  rec(`⭐⭐⭐ ${label}: state ${id} is reported`, lib.idsOf(v, RULE).includes(id), lib.idsOf(v, RULE));
  // ⛔ #a-refused-dockyard-is-not-a-save-gate — moved 2026-11-19 (tool campaign B1-31): the rule left the fatal set (HOI4 refuses the
  // building and plays on), so the mod's own is reported and Save does not stop on it. This used to read "…so Save stops on it".
  const g = await lib.saveGate(v);
  rec(`⭐⭐⭐ …as an error Save does not stop on`, !isFatalRule(RULE) && g.crashes === fatalIn(v) && ((v && v.problems) || []).some((p) => p.rule === RULE && p.severity === "error"), { crashes: g.crashes, fatal: fatalIn(v), status: g.status.slice(0, 120) });
  return v;
}

(async () => {
  let S = null;
  try {
    S = await lib.startServer(createApp);

    console.log("\n=== THE CONTROLS ===");
    {
      const v = await S.validate(DEP);
      // Moved with #a-naval-building-the-game-refuses-claims-no-crash: state 2's naval base on inland province 5 was counted here too.
      // State 2 touches the sea, and a naval base HOI4 refuses is naval_base_non_coastal (a warning) now; the dockyard is still this rule.
      rec("the dependency, validated as the mod over the game, is told of its landlocked dockyard", lib.idsOf(v, RULE).join() === "1", lib.idsOf(v, RULE));
      rec("…and of its naval base on inland province 5 as naval_base_non_coastal", lib.idsOf(v, "naval_base_non_coastal").join() === "2", lib.idsOf(v, "naval_base_non_coastal"));
      rec("…as an error Save does not stop on (#a-refused-dockyard-is-not-a-save-gate; it read \"…and Save would stop on them\")", (await lib.saveGate(v)).crashes === 0 && !isFatalRule(RULE));
      const cv = await S.validate(COAST);
      rec("the coastal dependency is told nothing: its dockyard's state touches the sea", lib.idsOf(cv, RULE).length === 0, lib.idsOf(cv, RULE));
      const pv = await S.validate(W.mod("Plain", OWN));
      rec("a mod over the game alone, with the same one problem, has nothing Save would stop on", lib.idsOf(pv, RULE).length === 0 && (await lib.saveGate(pv)).crashes === 0, lib.rulesIn(pv));
    }

    console.log("\n=== 1. an add-on with one problem of its own: the dependency's are not reported, do not stop Save, and are not copied in ===");
    {
      const a = W.mod("Addon", OWN, [DEP_NAME]);
      const v = await S.validate(a);
      rec("THE CONTROL: the add-on is told its own problem (state 3 has no manpower)", lib.idsOf(v, "state_no_manpower").join() === "3", lib.rulesIn(v));
      rec("⭐⭐⭐ …and is not told of the dependency's landlocked dockyard or naval base", lib.idsOf(v, RULE).length === 0, lib.idsOf(v, RULE));
      const g = await lib.saveGate(v);
      rec("⭐⭐⭐ …so its Save is not stopped behind the will-crash gate", g.crashes === 0 && !g.armed, g.status.slice(0, 160));
      const before = lib.tree(a);
      const r1 = await S.autoFix(a);
      const after = lib.tree(a);
      rec("the click ran every fixer — it was not 'nothing to fix'", r1.status === 200 && r1.body.ok === true && !r1.body.nothingToFix, r1.body);
      rec("⭐⭐⭐ …removed no naval building", ((r1.body.fixes || {}).navalNoCoast || {}).removed === 0, (r1.body.fixes || {}).navalNoCoast);
      rec("⭐⭐⭐ …and wrote no copy of the dependency's 1-A.txt or 2-B.txt into the add-on", !has(a, "history/states/1-A.txt") && !has(a, "history/states/2-B.txt"), lib.written(before, after));
      rec("⭐⭐ the whole click wrote only the add-on's own state file", lib.written(before, after).join() === "history/states/3-C.txt", lib.written(before, after));
      await S.autoFix(a);
      rec("⭐ a second click writes nothing", lib.written(after, lib.tree(a)).length === 0, lib.written(after, lib.tree(a)));
    }

    console.log("\n=== 2. verbatim copies of the dependency's states are not an authorship claim ===");
    {
      const a = W.mod("AddonCopy", { ...OWN, "history/states/1-A.txt": DEP_STATE_1, "history/states/2-B.txt": DEP_STATE_2 }, [DEP_NAME]);
      const v = await S.validate(a);
      rec("⭐⭐⭐ an add-on holding the dependency's own two files is not told of either building", lib.idsOf(v, RULE).length === 0, lib.idsOf(v, RULE));
      rec("⭐⭐⭐ …and its Save is not stopped", (await lib.saveGate(v)).crashes === 0);
      const r = await S.autoFix(a);
      rec("the click ran", r.status === 200 && r.body.ok === true, r.body);
      rec("⭐⭐⭐ …and leaves both copies exactly as the dependency wrote them", read(a, "history/states/1-A.txt") === DEP_STATE_1 && read(a, "history/states/2-B.txt") === DEP_STATE_2);
    }

    console.log("\n=== 3. …but a coast the add-on itself took away IS reported, stops Save, and is repaired ===");
    {
      // (a) moved a province: province 2, state 2's only coast, into state 3 — through move-province, as the page queues it. Moved with
      // ⛔ #a-moved-coast-takes-its-dockyards: the dockyard goes with its coast now, so the move takes no coast away from it — nothing is
      // reported, Save does not stop, and Auto-fix has nothing to delete (it deleted this dockyard before: the review's SUS-1)
      const a = W.mod("AddonMoved", {}, [COAST_NAME]);
      const mv = await S.post("/api/map/move-province", { provinceId: 2, toStateId: 3 }, a);
      rec("setup: province 2 moved into state 3", mv.status === 200 && mv.body.ok === true, mv.body);
      const dockOf = (sid) => { const m = md.buildMapModel({ modRoot: a, gameRoot: W.GAME, dependencyRoots: [COAST] }); const s = (m.states || []).find((x) => x.id === sid); return s ? +((s.buildings || {}).dockyard) || 0 : -1; };
      rec("⭐⭐⭐ a province moved out of the dockyard's coastal state takes the dockyard with it: state 3 holds it, state 2 none, and the answer says so",
        dockOf(3) === 1 && dockOf(2) === 0 && (mv.body.navalCarried || []).some((c) => c.from === 2 && c.to === 3), { navalCarried: mv.body.navalCarried, two: dockOf(2), three: dockOf(3) });
      const va = await S.validate(a);
      rec("⭐⭐ …so nothing is reported and Save is not stopped", lib.idsOf(va, RULE).length === 0 && (await lib.saveGate(va)).crashes === 0, lib.idsOf(va, RULE));
      const fx = await S.autoFix(a);
      rec("⭐⭐ …and Auto-fix removes no dockyard", fx.status === 200 && !(((fx.body.fixes || {}).navalNoCoast || {}).removed > 0) && dockOf(3) === 1,
        { navalNoCoast: (fx.body.fixes || {}).navalNoCoast, three: dockOf(3) });

      // (b) retyped the sea as land in the add-on's own definition.csv
      const b = W.mod("AddonRetyped", { "map/definition.csv": lib.DEF({ 1: "1;0;0;200;land;false;plains;1" }) }, [COAST_NAME]);
      await stopsSave(S, b, 2, "the sea retyped as land");
      // ⛔ #a-coast-taken-away-keeps-its-naval-buildings — moved with it: fixNavalBuildingsWithoutCoast deletes none now. With sea 1 land
      // there is no sea left at all, so no state of AAA has a coast to take the dockyard: it stays, said, and is not copied in to be cut
      const rb = md.fixNavalBuildingsWithoutCoast({ modRoot: b, gameRoot: W.GAME, dependencyRoots: [COAST] });
      const lb = ((rb && rb.left) || [])[0] || {};
      rec("⭐⭐ …and fixNavalBuildingsWithoutCoast leaves it where it is, saying why, and deletes nothing", !!rb && rb.removed === 0 && (rb.left || []).length === 1 && lb.stateId === 2 && lb.key === "dockyard"
        && /no other state of AAA has a coast/.test(lb.why || "") && !has(b, "history/states/2-B.txt"), rb);

      // (c) painted province 2's coast over in the add-on's own provinces.bmp
      const c = W.mod("AddonPainted", { "map/provinces.bmp": PAINTED }, [COAST_NAME]);
      await stopsSave(S, c, 2, "the coast painted over");
      // …and here state 3, above the strip, still touches the sea: the dockyard goes to it
      const rc = md.fixNavalBuildingsWithoutCoast({ modRoot: c, gameRoot: W.GAME, dependencyRoots: [COAST] });
      const cc = ((rc && rc.carried) || [])[0] || {};
      rec("⭐⭐ …and fixNavalBuildingsWithoutCoast takes it to state 3, its country's coastal state next door, deleting nothing", !!rc && rc.removed === 0 && cc.from === 2 && cc.to === 3
        && JSON.stringify(cc.levels) === JSON.stringify([{ date: null, key: "dockyard", level: 1 }]) && /dockyard = 1/.test(read(c, "history/states/3-C.txt")) && !/dockyard/.test(read(c, "history/states/2-B.txt")), rc);

      // (d) shipped a state file with a dockyard in inland state 1
      const d = W.mod("AddonShipped", { "history/states/1-A.txt": lib.st(1, "4", { history: DOCK }) }, [COAST_NAME]);
      const vd = await stopsSave(S, d, 1, "a dockyard the add-on wrote into an inland state");
      rec("…and only that state", lib.idsOf(vd, RULE).join() === "1", lib.idsOf(vd, RULE));
      const fd = await S.autoFix(d);
      // (moved with #a-coast-taken-away-keeps-its-naval-buildings: it goes to state 2, the nearer of its country's two coastal states, ties
      // to the lower id, summed with the 1 the dependency gives it — it was deleted here before)
      rec("⭐⭐ Auto-fix takes it out of the add-on's own file — to state 2, its country's coastal state next door, not deleted", fd.status === 200 && !/dockyard/.test(read(d, "history/states/1-A.txt"))
        && /dockyard = 2/.test(read(d, "history/states/2-B.txt")) && !(((fd.body.fixes || {}).navalNoCoast || {}).removed > 0), { one: read(d, "history/states/1-A.txt"), two: read(d, "history/states/2-B.txt") });

      // (e) the add-on adds a naval base to a state whose dockyard it inherited: only the building it added is its own.
      // Moved with #a-naval-building-the-game-refuses-claims-no-crash: that naval base is naval_base_non_coastal now — a warning, not a
      // Save gate — and the dry run below (what Auto-fix removes) still names it and not the inherited dockyard.
      const e = W.mod("AddonAdded", { "history/states/1-A.txt": lib.st(1, "4", { history: "\t\tbuildings = {\n\t\t\tdockyard = 1\n\t\t\t4 = {\n\t\t\t\tnaval_base = 1\n\t\t\t}\n\t\t}\n" }) }, [DEP_NAME]);
      const ve = await S.validate(e);
      rec("⭐⭐⭐ a naval base the add-on added beside the dependency's dockyard is naval_base_non_coastal for state 1", lib.idsOf(ve, "naval_base_non_coastal").join() === "1", lib.idsOf(ve, "naval_base_non_coastal"));
      rec("⭐⭐ …not this rule (the dockyard is the dependency's)", lib.idsOf(ve, RULE).length === 0, lib.idsOf(ve, RULE));
      rec("⭐⭐ …and Save is not stopped", (await lib.saveGate(ve)).crashes === 0);
      const re = md.fixNavalBuildingsWithoutCoast({ modRoot: e, gameRoot: W.GAME, dependencyRoots: [DEP], dryRun: true });
      const w1 = ((re && re.work) || []).find((x) => x.stateId === 1) || {};
      rec("⭐⭐⭐ …the work is the naval base on province 4, not the inherited dockyard", !!re && re.removed === 1 && (w1.stateKeys || []).length === 0 && (w1.provinceKeys || []).map((p) => p.province + ":" + p.key).join() === "4:naval_base", re && re.work);
    }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 10).join("\n") : e);
    fails.push("harness error");
  } finally {
    if (S) S.close();
    W.cleanup();
  }
  console.log(`\n=== auto-fix leaves a dockyard without a coast the mod inherited: ${checks} checks, ${fails.length} failed ===`);
  if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
})();
