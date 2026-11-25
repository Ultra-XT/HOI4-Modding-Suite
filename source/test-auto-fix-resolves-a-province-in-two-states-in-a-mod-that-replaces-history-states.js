// Auto-fix resolves a province two states claim in a mod that replaces history/states.
// #the-conflict-fixer-reads-what-loads-beneath-the-mod
//
// fixProvinceInTwoStates keeps a contested province in one state and takes it out of the other; when that empties the
// other — a one-province stub — it deletes the stub. Before deleting it asks whether a layer beneath the mod also defines
// the id, because deleting the mod's copy of a base state only brings the base's copy back (#deleting-the-mods-copy-un-
// shadows-vanilla, the owner's kurdistan). It asked through baseStateIdsByFile, which walked baseRootsFor — and that
// honours a DEPENDENCY's replace_path, never the active mod's. A mod declaring replace_path="history/states" loads no base
// state file, so nothing comes back; the fixer refused anyway.
//
// Measured on 65978a2 (probe-A-callers.js, batch 8): a replace_path mod whose own state 2 lists provinces 1 2 3 and whose
// own one-province state 3 lists 3, over a base game that has a state 3 in a file the mod keeps from loading. The validator
// reported province_in_two_states on 3; Auto-fix answered "state 3 also comes from the base game or a dependency — deleting
// the mod's copy would restore it, not remove it", which is false for this mod, and left the conflict for every click.
// Every shipping map declares this replace_path (MD, R56, OWB, NV, RoN, workshop 3721160655). layersBelow is the sibling
// that answers "what loads beneath this mod"; closeStateIdGaps adopted it in the previous commit.
//
// Requests are the page's: POST /api/map/auto-fix { modPath }, GET /api/map/validate?modPath, GET /api/map/model?modPath.
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

const world = lib.makeWorld("b8-conflict-replace-path");
const { createApp } = require("./server.js");
const md = require("./map-data.js");

const statesDir = (mod) => path.join(mod, "history", "states");
const stateFiles = (mod) => { try { return fs.readdirSync(statesDir(mod)).sort(); } catch (_) { return []; } };
const conflictsOn = (v, pid) => ((v && v.problems) || []).filter((p) => p.rule === "province_in_two_states" && +p.province === pid);
const holders = (model, pid) => ((model && model.states) || []).filter((s) => (s.provinces || []).includes(pid)).map((s) => s.id).sort((a, b) => a - b);

(async () => {
  let srv = null;
  try {
    console.log("0. The page's request");
    {
      const MAP = maskJsComments(fs.readFileSync(path.join(__dirname, "public", "map.js"), "utf8"));
      rec("the page still posts Auto-fix as { modPath: modPath() }",
        (MAP.match(/fetch\("\/api\/map\/auto-fix", \{ method: "POST", headers: \{ "Content-Type": "application\/json" \}, body: JSON\.stringify\(\{ modPath: modPath\(\) \}\) \}\)/g) || []).length >= 1);
    }

    srv = await lib.startServer(createApp);
    const model = (mod) => fetch(`${srv.base}/api/map/model?modPath=${encodeURIComponent(mod)}`).then((r) => r.json());

    console.log("\n1. ⭐⭐⭐ A mod that replaces history/states, whose one-province state 3 claims a province its state 2 lists");
    {
      const mod = world.mod("conflict replace path", {
        "descriptor.mod": 'name="conflict replace path"\nsupported_version="1.*"\nreplace_path="history/states"\n',
        "history/states/1-Alpha.txt": lib.st(1, "4"),
        "history/states/2-Beta.txt": lib.st(2, "2 5 3"),
        "history/states/3-Gamma.txt": lib.st(3, "3"),
      });
      const m0 = await model(mod);
      rec("the model loads only the mod's states: [1, 2, 3], none from the base game", JSON.stringify(m0.states.map((s) => s.id).sort()) === "[1,2,3]"
        && m0.states.every((s) => String(s.rootPath || "").toLowerCase() === path.resolve(mod).toLowerCase()), m0.states.map((s) => [s.id, s.rootPath]));
      const before = await srv.validate(mod);
      rec("CONTROL: the validator reports province 3 in two states", conflictsOn(before, 3).length === 1, (before.problems || []).map((p) => p.rule));

      const fx = await srv.autoFix(mod);
      rec("Auto-fix answers 200 ok", fx.status === 200 && fx.body.ok === true, { status: fx.status, error: fx.body.error });
      const pc = (fx.body.fixes && fx.body.fixes.provConflicts) || {};
      const refusal = (pc.unresolved || []).filter((u) => +u.province === 3);
      rec("⭐⭐⭐ Auto-fix does not refuse with \"state 3 also comes from the base game\"", refusal.length === 0, refusal);
      rec("⭐⭐ …it deletes the empty stub, state 3", (pc.deletedStates || []).includes(3), pc);

      const after = await srv.validate(mod);
      rec("⭐⭐⭐ the validator no longer reports province 3 in two states", conflictsOn(after, 3).length === 0, conflictsOn(after, 3));
      const m1 = await model(mod);
      rec("province 3 is in state 2 alone", JSON.stringify(holders(m1, 3)) === "[2]", holders(m1, 3));
      rec("the map's states are 1 and 2, with no gap left behind", JSON.stringify(m1.states.map((s) => s.id).sort()) === "[1,2]" && !(after.problems || []).some((p) => p.rule === "state_id_gap"), m1.states.map((s) => s.id));
      rec("⚠️ no base-game state file was copied into the mod", !stateFiles(mod).some((f) => Object.keys(lib.GAME_STATES).map((k) => path.basename(k)).includes(f)), stateFiles(mod));
      rec("⚠️ state 2 keeps its other provinces", JSON.stringify(((m1.states.find((s) => s.id === 2) || {}).provinces || []).slice().sort()) === JSON.stringify([2, 3, 5]), (m1.states.find((s) => s.id === 2) || {}).provinces);
    }

    console.log("\n2. ⚠️ CONTROL: without replace_path, deleting the mod's copy of 3-C.txt brings the base game's back — so it keeps the province instead");
    {
      // The kurdistan rule must survive: the mod shadows the base game's 3-C.txt by name, so deleting it un-shadows the base
      // state 3, which claims province 3 again. Called directly, so no other fixer's work muddies the answer.
      //
      // #a-conflict-whose-loser-cannot-be-deleted-keeps-the-province — this used to end as an UNRESOLVED refusal, and a
      // conflict nothing in the click can resolve survives every click. A state that cannot be emptied is now the keeper,
      // so the same never-delete rule is kept by a resolution rather than by giving up: state 3 keeps province 3 and state
      // 2, which has others, gives it up. The refusal is still the answer when neither claimant can be emptied.
      const mod = world.mod("conflict no replace path", {
        "history/states/2-B.txt": lib.st(2, "2 5 3"),
        "history/states/3-C.txt": lib.st(3, "3"),
      });
      const r = md.fixProvinceInTwoStates({ modRoot: mod, gameRoot: world.GAME, dependencyRoots: [] });
      rec("the stub is not deleted", !(r.deletedStates || []).includes(3) && stateFiles(mod).includes("3-C.txt"), { r, files: stateFiles(mod) });
      rec("…and it is not emptied either: province 3 stays in state 3", !(r.resolved || []).some((x) => +x.removedFrom === 3), r.resolved);
      rec("⭐⭐⭐ …and the conflict is RESOLVED, not left for the next click", (r.resolved || []).some((x) => +x.province === 3 && +x.keptIn === 3 && +x.removedFrom === 2)
        && !(r.unresolved || []).some((u) => +u.province === 3), { resolved: r.resolved, unresolved: r.unresolved });
      const m2 = await model(mod);
      rec("province 3 is in state 3 alone", JSON.stringify(holders(m2, 3)) === "[3]", holders(m2, 3));
      rec("⚠️ state 2 keeps everything else it had", JSON.stringify(((m2.states.find((s) => s.id === 2) || {}).provinces || []).slice().sort((a, b) => a - b)) === JSON.stringify([2, 5]), (m2.states.find((s) => s.id === 2) || {}).provinces);
    }
  } catch (e) {
    rec("harness threw: " + (e && e.stack ? e.stack.split("\n").slice(0, 6).join(" | ") : e), false);
  } finally {
    if (srv) srv.close();
    world.cleanup();
    console.log(`\n=== Auto-fix resolves a province in two states in a mod that replaces history/states: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) { fails.forEach((f) => console.log("   FAILED: " + f)); process.exitCode = 1; }
  }
})();
