// One "Auto-fix all" click never deletes a naval building from a state the same click leaves with a coast.
// #a-click-keeps-the-dockyard-of-a-coast-it-gives-back
//
// THE DEFECT (batch 8 discovery F5). autoFixMap ran fixNavalBuildingsWithoutCoast before fixStatelessLand. So a state whose only
// coastal province had lost its state lost its dockyard for having no coast, and the stateless-land pass then handed that
// province straight back to the same state. MEASURED with the page's own flow on a fresh vanilla mod (r5c-dockyard.js): "+ New
// state" filled with Litorale's (736) only coastal province 6626, Save, "Delete state", Save, "Auto-fix all". The click answered
// navalNoCoast { removed: 1, states: [736] } and statelessLand { province: 6626, addedToState: 736 }; afterwards 736 held
// { 599 11595 6626 }, touched the sea, had no dockyard (it had `dockyard = 1`), and validate named nothing — a building the game
// would have kept, deleted, and a map that reads clean. Pennsylvania (360) lost its undated 7 the same way; Vaster Gotland (140),
// whose province went to a neighbour, rightly lost its own — and since #a-coast-taken-away-keeps-its-naval-buildings (review of the
// coast rows, CR-R3) even that one is not deleted: it goes to the nearest coastal state of its country (sections 2 and 3's controls).
//
// THE DECISION. The naval judgement is made once states hold their final provinces and province types are final: after both
// stateless-land passes and after the second inland-sea pass (which turns sea into land and can landlock a state), still before the
// port settle loop that reads its count. Its rule, state_naval_building_without_coast, is unchanged.
//
// Requests are the page's: POST /api/map/auto-fix { modPath }, GET /api/map/validate?modPath. For the installed game the shape was
// made with create-state { name: "", owner }, move-province { provinceId, toStateId } and delete-state { stateId }, as flushMapSaves
// posts them; since #a-moved-coast-takes-its-dockyards that paint carries the dockyards with the coast, so the state's copy is written
// without its coastal province instead (editStateBlock), the shape those three writes left.
"use strict";

const fs = require("fs");
const path = require("path");
const lib = require("./testlib-two-layer-map.js");

let checks = 0, skips = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (ok || detail == null ? "" : "   -> " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 900)));
  if (!ok) fails.push(label);
};
const skip = (label, why) => { skips++; console.log("  SKIP " + label + "   " + why); };

const world = lib.makeWorld("b9-dockyard-coast");
const { createApp } = require("./server.js");
const md = require("./map-data.js");

const DOCK = "\t\tbuildings = {\n\t\t\tdockyard = 2\n\t\t}\n";
const has = (v, rule, id) => lib.idsOf(v, rule).includes(id);
const dockyardIn = (file) => { const m = /(?:^|[^A-Za-z0-9_])dockyard\s*=\s*(\d+)/.exec(fs.existsSync(file) ? fs.readFileSync(file, "utf8") : ""); return m ? +m[1] : 0; };

(async () => {
  let srv = null;
  try {
    srv = await lib.startServer(createApp);

    console.log("1. ⭐⭐⭐ The click gives a state its only coastal province back — the state keeps its dockyard");
    {
      // The game: state 2 = { 2 5 }, province 2 its coast on sea 1. The mod keeps state 2 as { 5 } with a dockyard, so 2 has no state,
      // and puts 3 and 4 in a region of their own, so the stateless-land pass hands 2 to the neighbour in its own region: state 2.
      const mod = world.mod("dock comes back", {
        "history/states/2-B.txt": lib.st(2, "5", { history: DOCK }),
        "map/strategicregions/2-Land.txt": lib.region(2, "2 5"),
        "map/strategicregions/3-East.txt": lib.region(3, "3 4"),
      });
      const file = path.join(mod, "history", "states", "2-B.txt");
      const before = await srv.validate(mod);
      rec("CONTROL: before the click province 2 has no state and state 2's dockyard has no coast", has(before, "land_not_in_state", 2)
        && has(before, "state_naval_building_without_coast", 2), lib.rulesIn(before));
      const c1 = await srv.autoFix(mod);
      const f = (c1.body && c1.body.fixes) || {};
      rec("click 1 is answered", c1.status === 200 && c1.body.ok === true, c1.body);
      rec("the click gives province 2 back to state 2", ((f.statelessLand || {}).details || []).some((d) => d.province === 2 && d.addedToState === 2), f.statelessLand);
      rec("⭐⭐⭐ …and removes no naval building from state 2, nor moves one away", !((f.navalNoCoast || {}).states || []).includes(2) && !((f.navalNoCoast || {}).removed)
        && !((f.navalNoCoast || {}).carried || []).some((c) => c.from === 2), f.navalNoCoast);
      rec("⭐⭐⭐ state 2's file still has its dockyard", dockyardIn(file) === 2, fs.readFileSync(file, "utf8"));
      const after = await srv.validate(mod);
      rec("after the click neither rule is named, and Save is not stopped", !has(after, "land_not_in_state", 2) && !has(after, "state_naval_building_without_coast", 2)
        && (await lib.saveGate(after)).crashes === 0, lib.rulesIn(after));
      const t1 = lib.tree(mod);
      await srv.autoFix(mod);
      rec("click 2 writes nothing", lib.written(t1, lib.tree(mod)).length === 0, lib.written(t1, lib.tree(mod)));
    }

    console.log("\n2. CONTROL: the click gives the province to another state — the dockyard it can no longer have still goes, to that coast");
    {
      // State 1 = { 4 } holds more dockyards than state 2 = { 5 }, and both touch province 2, so 2 goes to the state that holds the most and state 2
      // stays { 5 }. (⛔ #a-sea-made-land-takes-the-coast-its-dockyards-stood-on — with state 2 the only one asking, the click gives it its coast back, as section 1.)
      const mod = world.mod("dock goes", {
        "history/states/1-A.txt": lib.st(1, "4", { history: "\t\tbuildings = {\n\t\t\tdockyard = 5\n\t\t}\n" }),
        "history/states/2-B.txt": lib.st(2, "5", { history: DOCK }),
      });
      const file = path.join(mod, "history", "states", "2-B.txt");
      const before = await srv.validate(mod);
      rec("before the click state 2's dockyard has no coast", has(before, "state_naval_building_without_coast", 2), lib.rulesIn(before));
      const c1 = await srv.autoFix(mod);
      const f = (c1.body && c1.body.fixes) || {};
      rec("the click gives province 2 to a state other than 2", ((f.statelessLand || {}).details || []).some((d) => d.province === 2 && d.addedToState !== 2), f.statelessLand);
      // ⛔ #a-coast-taken-away-keeps-its-naval-buildings — it was deleted here; it goes to state 1, which took the coast and is the
      // nearest coastal state of state 2's country, added to what state 1 holds (5)
      const c2 = ((f.navalNoCoast || {}).carried || []).find((c) => c.from === 2) || {};
      const one = path.join(mod, "history", "states", "1-A.txt");
      rec("⭐ …and moves state 2's dockyard, which the game refuses there, to state 1, its country's coastal state next door — deleting nothing",
        c2.to === 1 && JSON.stringify(c2.levels) === JSON.stringify([{ date: null, key: "dockyard", level: 2 }]) && !((f.navalNoCoast || {}).removed) && dockyardIn(file) === 0 && dockyardIn(one) === 7,
        { navalNoCoast: f.navalNoCoast, file: fs.readFileSync(file, "utf8"), one: fs.existsSync(one) ? fs.readFileSync(one, "utf8") : "(none)" });
      const after = await srv.validate(mod);
      rec("after the click state_naval_building_without_coast is not named", !has(after, "state_naval_building_without_coast", 2), lib.rulesIn(after));
    }

    console.log("\n3. ⭐⭐ The installed game, through the page's own flow (states derived from it, not typed)");
    {
      const REAL = process.env.NOVA_TEST_HOI4_ROOT || "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
      if (!fs.existsSync(path.join(REAL, "hoi4.exe"))) skip("installed HOI4", "hoi4.exe not found at " + REAL);
      else {
        process.env.HOI4_ROOT = REAL;                               // resolveHoi4GameRoot reads it on every request
        const vm = md.buildMapModel({ modRoot: null, gameRoot: REAL, dependencyRoots: [], cacheStableLayers: true });
        const coastal = md.landProvincesTouchingSea({ modRoot: null, gameRoot: REAL, dependencyRoots: [], model: vm });
        const caps = new Set(Object.values(vm.capitals || {}).map(Number));
        const cands = (vm.states || []).filter((s) => !caps.has(s.id) && (s.provinces || []).length >= 2 && !s.buildingsDated && +((s.buildings || {}).dockyard) > 0)
          .map((s) => ({ s, coast: s.provinces.filter((p) => coastal.has(p)) })).filter((x) => x.coast.length === 1).sort((a, b) => a.s.id - b.s.id);
        rec("the base game has non-capital states with an undated dockyard and exactly one coastal province", cands.length > 0, cands.length);
        let cameBack = 0;
        for (const { s: S, coast: [p] } of cands.slice(0, 4)) {
          // (⛔ #a-moved-coast-takes-its-dockyards — the page's own flow, + New state with p painted into it and then Delete state, no longer
          // leaves this shape: the paint carries the state's dockyards with its last coast into the new state. So the mod's copy of the
          // state is written without p, through the writer every state edit goes through — the shape that flow left before)
          const mod = world.mod(`dock vanilla ${S.id}`, {});
          const cut = md.editStateBlock({ modRoot: mod, gameRoot: REAL, dependencyRoots: [], stateId: S.id },
            (b) => b.replace(/(\bprovinces\s*=\s*\{)([^}]*)\}/, (m, open, ids) => open + " " + ids.split(/\s+/).filter((t) => t && t !== String(p)).join(" ") + " }"));
          if (!(cut && cut.changed)) { rec(`state ${S.id}: its copy without province ${p} is written`, false, cut); continue; }
          const before = await srv.validate(mod);
          rec(`state ${S.id} (${S.name}): before the click province ${p} has no state and the state's dockyard has no coast`,
            has(before, "land_not_in_state", p) && has(before, "state_naval_building_without_coast", S.id), lib.rulesIn(before));
          const c1 = await srv.autoFix(mod);
          const f = (c1.body && c1.body.fixes) || {};
          const back = ((f.statelessLand || {}).details || []).some((d) => d.province === p && d.addedToState === S.id);
          const removed = ((f.navalNoCoast || {}).states || []).includes(S.id) || ((f.navalNoCoast || {}).removed > 0);
          const went = ((f.navalNoCoast || {}).carried || []).find((c) => c.from === S.id);
          const m = md.buildMapModel({ modRoot: mod, gameRoot: REAL, dependencyRoots: [], cacheStableLayers: true });
          const st = (m.states || []).find((x) => x.id === S.id);
          const dock = st && !st.buildingsDated ? +((st.buildings || {}).dockyard) || 0 : -1;
          if (back) {
            cameBack++;
            rec(`⭐⭐⭐ state ${S.id}: the click gave province ${p} back and removed no naval building from the state, nor moved one away`, !removed && !went, f.navalNoCoast);
            rec(`⭐⭐⭐ …so it still has its dockyard ${S.buildings.dockyard}`, dock === +S.buildings.dockyard, { dock, was: S.buildings.dockyard });
            const after = await srv.validate(mod);
            rec("…and validate names neither rule for it", !has(after, "state_naval_building_without_coast", S.id) && !has(after, "land_not_in_state", p), lib.rulesIn(after));
            break;
          }
          // ⛔ #a-coast-taken-away-keeps-its-naval-buildings — it was removed here; it goes to the nearest coastal state of its country now
          const T = went && (m.states || []).find((x) => x.id === went.to);
          rec(`CONTROL state ${S.id}: province ${p} went to another state, so the dockyard the state can no longer have went to ${went ? "state " + went.to : "no state"}, a coastal state of ${S.owner} — not deleted`,
            !!went && !removed && dock === 0 && !!T && T.owner === S.owner && (T.provinces || []).some((q) => coastal.has(q)) && +((T.buildings || {}).dockyard) >= +S.buildings.dockyard,
            { navalNoCoast: f.navalNoCoast, dock, to: T && { id: T.id, owner: T.owner, dockyard: (T.buildings || {}).dockyard }, statelessLand: (f.statelessLand || {}).details });
        }
        rec("⭐ one of the derived states had its coast given back by the click", cameBack === 1, cameBack);
      }
    }
  } catch (e) {
    rec("harness", false, String(e && e.stack || e));
  } finally {
    if (srv) srv.close();
    world.cleanup();
    console.log(`\n=== one Auto-fix click keeps a dockyard when it gives the coast back: ${checks} checks, ${fails.length} failed, ${skips} skipped ===`);
    if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
  }
})();
