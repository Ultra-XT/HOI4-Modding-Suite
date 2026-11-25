// ⛔ #a-conflict-whose-loser-cannot-be-deleted-keeps-the-province — A CONFLICT NOTHING IN THE CLICK CAN RESOLVE SURVIVES
// EVERY CLICK, AND TAKES A FATAL RULE WITH IT.
//
// fixProvinceInTwoStates keeps a contested province in one claimant and takes it out of the others; when that empties a
// claimant it deletes the emptied stub — unless a layer beneath the mod supplies that id, because then deleting the mod's
// copy only un-shadows the base game's, which still claims the province (#deleting-the-mods-copy-un-shadows-vanilla). The
// ordering that picks the keeper never knew about that refusal: it took the state with the MOST provinces, so a shadowed
// base state cut down to ONE province was always the loser, always undeletable, and the conflict was always refused.
//
// MEASURED on the owner's own workflow at 4601d18 — new mod over vanilla, Delete map, Generate land at the page's own
// defaults (35% of the ocean, seed 1), Auto-fix twice, through the page's own endpoints:
//
//   fixProvinceInTwoStates  : 25 conflicts, 0 resolved, 25 unresolved — every one "state N also comes from the base
//                             game or a dependency — deleting the mod's copy would restore it, not remove it"
//   the validator           : state_no_air_base_or_rocket_site naming 25 states, FATAL ("refuses-to-load"), and the
//                             25 ids were the 25 losers, to the id
//
// The two are the same fact. Each of those vanilla states had been cut to one land province, a generated state had taken
// that same province, and inside ONE Auto-fix click fixStatesWithoutBuildingSlots gave all 25 their building positions
// (fixed 25) and fixBuildingsTxtPlacement — which runs last and re-homes every row to the state that owns the province
// under it — handed all 25 straight back to the generated state (850 rows re-homed, from 1010 to 1313 and so on). One
// click wrote them, the same click took them away, and no number of clicks converged: HOI4 stops with "Failed to load
// the map" on a map Nova had just called fixed.
//
// A claimant that cannot be emptied is now the keeper. It costs the other claimant one province — it has more, by the
// very ordering that used to make it the keeper — and the refusal is still the answer when neither can be emptied.
//
// Run: node test-a-conflict-whose-loser-cannot-be-deleted-keeps-the-province.js
"use strict";

const fs = require("fs");
const path = require("path");
const lib = require("./testlib-two-layer-map.js");

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (ok || detail == null ? "" : "   -> " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 700)));
  if (!ok) fails.push(label);
};

const world = lib.makeWorld("conflict-pinned-keeper");
const { createApp } = require("./server.js");
const md = require("./map-data.js");

const RULE = "state_no_air_base_or_rocket_site";
// The site types the rule itself names, read off its own report rather than typed here.
const missingTypes = (v) => [...new Set(((v && v.problems) || [])
  .filter((p) => p.rule === RULE)
  .flatMap((p) => (p.items || []).flatMap((i) => i.missing || [])))].sort();
const rowsFor = (mod, stateId, type) => {
  let txt = ""; try { txt = fs.readFileSync(path.join(mod, "map", "buildings.txt"), "utf8"); } catch (_) { return []; }
  return txt.split(/\r?\n/).filter((ln) => {
    const c = ln.split(";");
    return c.length >= 7 && parseInt(c[0], 10) === stateId && (c[1] || "").trim() === type;
  });
};
// province_in_two_states names its province in `province`, not in `provinces`, so lib.idsOf reads the STATE off it.
const contested = (v) => [...new Set(((v && v.problems) || []).filter((p) => p.rule === "province_in_two_states").map((p) => +p.province))].sort((a, b) => a - b);
const holders = (model, pid) => ((model && model.states) || []).filter((s) => (s.provinces || []).includes(pid)).map((s) => s.id).sort((a, b) => a - b);
const stateFiles = (mod) => { try { return fs.readdirSync(path.join(mod, "history", "states")).sort(); } catch (_) { return []; } };

/**
 * The shape the owner's workflow left behind, in five files.
 *
 * The base game ships state 1 = { 4 }. The mod shadows 1-A.txt with a copy of that same one-province state — which is
 * what Auto-fix's own sea-province sweep leaves when the rest of a state's provinces have gone — and its own state 2
 * has taken province 4 as well. The mod's buildings.txt is the game's, less every row keyed to state 1: the state has
 * land and no site on it, exactly as a generated map leaves one.
 */
const BUILD_WITHOUT_STATE_1 = lib.BUILD.filter((r) => parseInt(r.split(";")[0], 10) !== 1);
const fixture = (name) => world.mod(name, {
  "history/states/1-A.txt": lib.st(1, "4"),
  "history/states/2-B.txt": lib.st(2, "2 5 4"),
  "map/buildings.txt": BUILD_WITHOUT_STATE_1.join("\n") + "\n",
});

(async () => {
  let srv = null;
  try {
    console.log("0. The fixture really is the measured shape");
    rec("the mod's buildings.txt has no row for state 1, and still has the game's others",
      BUILD_WITHOUT_STATE_1.length > 0 && BUILD_WITHOUT_STATE_1.length < lib.BUILD.length,
      { kept: BUILD_WITHOUT_STATE_1.length, all: lib.BUILD.length });
    rec("the base game supplies state 1 in a file the mod shadows by name",
      Object.keys(lib.GAME_STATES).some((k) => path.basename(k) === "1-A.txt"), Object.keys(lib.GAME_STATES));

    srv = await lib.startServer(createApp);
    const model = (mod) => fetch(`${srv.base}/api/map/model?modPath=${encodeURIComponent(mod)}`).then((r) => r.json());

    console.log("\n1. ⭐⭐⭐ THE LOOP: one Auto-fix click must leave no state without an air base or a rocket site");
    {
      const mod = fixture("pinned keeper");
      const before = await srv.validate(mod);
      rec("CONTROL: the validator reports province 4 in two states", contested(before).includes(4), { contested: contested(before), rules: lib.rulesIn(before) });
      rec("CONTROL: …and state 1 with no air base or rocket site, reported as an error",
        lib.idsOf(before, RULE).includes(1) && missingTypes(before).length === 2, { states: lib.idsOf(before, RULE), missing: missingTypes(before) });
      // ⚠️ THIS CONTROL USED TO SAY "and Save is stopped for it", which was true only while
      // state_no_air_base_or_rocket_site sat in the fatal set. It came OUT on 2026-09-17 on SEVEN of the owner's
      // own launches: nova_torture_0912's state 1083 owns two LAND provinces, has neither an air_base nor a
      // rocket_site_spawn row, and reached 1936.01.01.12 under --debug with a 15-line error.log and no MAP_ERROR —
      // with a positive control proving that launcher does log them. #the-game-is-the-oracle
      // What the control is FOR is unchanged: showing the fixture really is in the bad state before the fix. The
      // severity still says so; the Save gate no longer does, and must not, because the map loads.
      const gate = await lib.saveGate(before);
      rec("CONTROL: …and it is an error, though no longer one Save stops for",
        (before.problems || []).some((p) => p.rule === RULE && p.severity === "error") && gate.armed === false,
        { severity: (before.problems || []).filter((p) => p.rule === RULE).map((p) => p.severity), armed: gate.armed, status: gate.status });

      const fx = await srv.autoFix(mod);
      rec("Auto-fix answers 200 ok", fx.status === 200 && fx.body.ok === true, { status: fx.status, error: fx.body.error });
      const pc = (fx.body.fixes && fx.body.fixes.provConflicts) || {};
      rec("⭐⭐⭐ the conflict is RESOLVED, not refused", (pc.resolved || []).some((x) => +x.province === 4 && +x.keptIn === 1 && +x.removedFrom === 2)
        && !(pc.unresolved || []).some((u) => +u.province === 4), { resolved: pc.resolved, unresolved: pc.unresolved });
      rec("⚠️ …and nothing was deleted to do it", (pc.deletedStates || []).length === 0 && stateFiles(mod).includes("1-A.txt"),
        { deleted: pc.deletedStates, files: stateFiles(mod) });

      const after = await srv.validate(mod);
      rec("⭐⭐⭐ no state is left without an air base or a rocket site", lib.idsOf(after, RULE).length === 0, lib.idsOf(after, RULE));
      rec("⭐⭐ …and no province is left in two states", contested(after).length === 0, contested(after));
      const gate2 = await lib.saveGate(after);
      rec("⭐⭐⭐ …so Save is no longer stopped", gate2.armed === false, gate2.status);

      const m1 = await model(mod);
      rec("province 4 is in state 1 alone", JSON.stringify(holders(m1, 4)) === "[1]", holders(m1, 4));
      rec("⚠️ state 2 keeps everything else it had", JSON.stringify(((m1.states.find((s) => s.id === 2) || {}).provinces || []).slice().sort((a, b) => a - b)) === JSON.stringify([2, 5]),
        (m1.states.find((s) => s.id === 2) || {}).provinces);
      for (const type of missingTypes(before)) {
        rec(`state 1 has exactly one ${type} of its own`, rowsFor(mod, 1, type).length === 1, rowsFor(mod, 1, type));
        // ⚠️ THE CRY-WOLF SIDE: a state that already had one must not be handed a second.
        rec(`⚠️ …and state 3, which already had a ${type}, still has exactly the one`,
          rowsFor(mod, 3, type).length === lib.BUILD.filter((r) => parseInt(r.split(";")[0], 10) === 3 && r.split(";")[1] === type).length,
          rowsFor(mod, 3, type));
      }

      console.log("\n2. …and a SECOND click has nothing left to do");
      {
        const t0 = lib.tree(mod);
        const fx2 = await srv.autoFix(mod);
        rec("the second click answers ok", fx2.status === 200 && fx2.body.ok === true, { status: fx2.status, error: fx2.body.error });
        rec("⭐⭐ …and writes nothing", JSON.stringify(lib.written(t0, lib.tree(mod))) === "[]", lib.written(t0, lib.tree(mod)));
      }
    }

    console.log("\n3. ⚠️ CONTROL: when NEITHER claimant can be emptied, the refusal is still the answer");
    {
      // Both claimants are one-province states the base game also supplies, so whichever loses is emptied and cannot be
      // deleted. Nothing here is an improvement on the refusal, and the fixer must not invent one.
      const mod = world.mod("both pinned", {
        "history/states/1-A.txt": lib.st(1, "4"),
        "history/states/3-C.txt": lib.st(3, "4"),
      });
      const r = md.fixProvinceInTwoStates({ modRoot: mod, gameRoot: world.GAME, dependencyRoots: [] });
      rec("nothing is deleted", (r.deletedStates || []).length === 0 && stateFiles(mod).includes("1-A.txt") && stateFiles(mod).includes("3-C.txt"),
        { r, files: stateFiles(mod) });
      rec("…and the conflict is still reported unresolved, with the reason",
        (r.unresolved || []).some((u) => +u.province === 4 && /base game or a dependency/.test(String(u.reason || ""))), r.unresolved);
    }

    console.log("\n4. ⚠️ CONTROL: a loser the fixer MAY delete is still deleted, not kept");
    {
      // The mod's own state 4 is no layer's but its own, so emptying it is safe and deleting the stub is still right.
      // Without this the change would look like "never empty anyone", which would leave the id gap class behind. The
      // contested province is 2, which the base game holds in a state of MORE than one province: nothing here is pinned.
      const mod = world.mod("deletable loser", {
        "history/states/2-B.txt": lib.st(2, "2 5"),
        "history/states/4-D.txt": lib.st(4, "2"),
      });
      const r = md.fixProvinceInTwoStates({ modRoot: mod, gameRoot: world.GAME, dependencyRoots: [] });
      rec("the mod-only stub is deleted and the province kept in the bigger state",
        (r.deletedStates || []).includes(4) && (r.resolved || []).some((x) => +x.province === 2 && +x.keptIn === 2 && +x.removedFrom === 4)
        && (r.unresolved || []).length === 0, r);
    }
  } catch (e) {
    rec("harness threw: " + (e && e.stack ? e.stack.split("\n").slice(0, 6).join(" | ") : e), false);
  } finally {
    if (srv) srv.close();
    world.cleanup();
    console.log(`\n=== a conflict whose loser cannot be deleted keeps the province: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) { fails.forEach((f) => console.log("   FAILED: " + f)); process.exitCode = 1; }
  }
})();
