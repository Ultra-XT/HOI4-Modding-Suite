// ⛔ #auto-fix-fought-the-overlay — "AUTO-FIX ALL" REPORTED REPAIRS, DELETED THE USER'S FILES, AND LEFT THE
// PROBLEM COUNT EXACTLY WHERE IT STARTED.
//
// Measured on the owner's own kurdistan mod, three clicks in a row: 48 problems before, 48 after, while the
// panel reported "21 conflicts resolved, 2 states deleted" every single time. That is precisely the symptom
// the owner has reported for a long time — map problems "come back every click".
//
// Four separate bugs, all the same misconception: A MOD IS AN OVERLAY, and the mod's own files are not the
// whole map. Deleting a mod file does not delete the state it declares — vanilla's copy underneath simply
// loads again.
//
//   1. editStateBlock / editBlockInDir materialised a BASE file into the mod even when the transform changed
//      NOTHING, returning changed:true. So fixStateNoManpower, merely looking at a vanilla-only state and
//      deciding it was fine, wrote it into the mod — putting back the very state files fixProvinceInTwoStates
//      had deleted four fixers earlier, inside the same click. Net disk change: zero. Every click.
//   2. closeStateIdGaps read the gap set from modRoot alone. kurdistan's states run 2..1081 purely because it
//      never overrides vanilla's 1-France.txt, so this saw "a gap at 1" and renumbered state 1081 (Otago) down
//      to id 1 — leaving the game loading TWO states with id 1. The auto-fixer manufacturing the fatal
//      "errors in the map definition" duplicate it exists to prevent.
//   3. fixProvinceInTwoStates "resolved" a conflict by deleting the mod's copy of a state that vanilla also
//      ships. Vanilla's copy returned, still claiming the province, so the conflict survived — and the
//      owner's edited 554-Syria.txt and 1079-Auckland.txt were gone.
//   4. It removed a province from a state without taking the province's VICTORY POINT with it, though
//      moveProvince has always carried it and removeVictoryPointForProvince's own doc says it must. One
//      click took vp_not_in_state from 2 to 7.
//
// After the fixes, on the same mod: 48 → 10 problems, no state file deleted, and clicks 2 and 3 write
// nothing at all.
//
// Every check below carries a BACK-OUT CONTROL — the same scenario arranged so the old behaviour is correct —
// because a test that only asserts "nothing was written" passes just as happily against a function that
// writes nothing ever.
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const md = require("./map-data.js");

let pass = 0, fail = 0;
const ok = (c, m, x) => {
  if (c) { pass++; console.log("  ok   " + m); }
  else { fail++; console.log("  FAIL " + m + (x !== undefined ? "   -> " + JSON.stringify(x) : "")); }
};
const cleanup = [];
const mk = (tag, files) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "nova-" + tag + "-"));
  cleanup.push(root);
  for (const [rel, body] of Object.entries(files)) {
    const p = path.join(root, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, body, "utf8");
  }
  return root;
};
const st = (id, provs, extra) => `state = {
	id = ${id}
	name = "STATE_${id}"
	manpower = 1000
	provinces = { ${provs.join(" ")} }
	history = {
		owner = GER
${extra || ""}	}
}
`;
const stateFiles = (root) => {
  try { return fs.readdirSync(path.join(root, "history", "states")).sort(); } catch (_) { return []; }
};

try {
  console.log("\n-- a transform that changes nothing must not copy a base file into the mod --");
  {
    // Vanilla owns state 900. The mod has never heard of it. A fixer INSPECTS it and decides it is fine.
    const game = mk("game", { "history/states/900-Vanilla.txt": st(900, [9001]) });
    const mod = mk("mod", { "history/states/500-Mine.txt": st(500, [5001]) });
    const r = md.editStateBlock({ modRoot: mod, gameRoot: game, dependencyRoots: [], stateId: 900 }, (b) => b);
    ok(r.changed === false, "an unchanged transform reports changed:false", r);
    ok(stateFiles(mod).length === 1, "…and the mod still has only its own state file", stateFiles(mod));

    // CONTROL: the same call with a transform that DOES change the block must still materialise it,
    // or this check would pass against a function that simply stopped working.
    const r2 = md.editStateBlock({ modRoot: mod, gameRoot: game, dependencyRoots: [], stateId: 900 },
      (b) => b.replace("manpower = 1000", "manpower = 4242"));
    ok(r2.changed === true && r2.created === true, "CONTROL: a real edit still materialises the base state", r2);
    ok(stateFiles(mod).length === 2, "…so the mod now overrides it", stateFiles(mod));
    ok(/manpower = 4242/.test(fs.readFileSync(path.join(mod, "history", "states", "900-Vanilla.txt"), "utf8")),
      "…with the edit actually applied");
  }

  console.log("\n-- the same rule for supply areas / strategic regions (editBlockInDir) --");
  {
    // editBlockInDir isn't exported, so exercise it through moveStateToSupplyArea — which gives the control
    // for free. Area 7 does NOT contain state 500, so removing it is a no-op and area 7 must stay vanilla's;
    // area 8 really does gain the state, so it must be materialised into the mod.
    const game = mk("game2", {
      "map/supplyareas/7-V.txt": 'supply_area = { id = 7 name = "S7" states = { 900 } value = 5 }\n',
      "map/supplyareas/8-W.txt": 'supply_area = { id = 8 name = "S8" states = { 901 } value = 5 }\n',
    });
    const mod = mk("mod2", { "history/states/500-Mine.txt": st(500, [5001]) });
    md.moveStateToSupplyArea({ modRoot: mod, gameRoot: game, dependencyRoots: [], stateId: 500, fromAreaId: 7, toAreaId: 8 });
    ok(!fs.existsSync(path.join(mod, "map", "supplyareas", "7-V.txt")),
      "the area that did not actually change is not copied into the mod");
    ok(fs.existsSync(path.join(mod, "map", "supplyareas", "8-W.txt")),
      "CONTROL: the area that really gained the state IS materialised");
    ok(/states\s*=\s*\{[^}]*\b500\b/.test(fs.readFileSync(path.join(mod, "map", "supplyareas", "8-W.txt"), "utf8")),
      "…with the state actually added");
  }

  console.log("\n-- an id vanilla supplies is not a gap --");
  {
    // The exact kurdistan shape: the mod starts at id 2 because vanilla owns state 1 and the mod never
    // overrides that file. Nothing is missing from the GAME, so nothing should be renumbered.
    const game = mk("game3", {
      "history/states/1-France.txt": st(1, [101]),
      "history/states/2-B.txt": st(2, [102]),
      "history/states/3-C.txt": st(3, [103]),
    });
    const mod = mk("mod3", {
      "history/states/2-B.txt": st(2, [102]),
      "history/states/3-C.txt": st(3, [103]),
      "history/states/4-Mine.txt": st(4, [104]),
    });
    const r = md.closeStateIdGaps(mod, { gameRoot: game, dependencyRoots: [] });
    ok(r.renumbered.length === 0, "vanilla fills id 1, so nothing is renumbered", r);
    ok(fs.existsSync(path.join(mod, "history", "states", "4-Mine.txt")), "…the mod's top state keeps its id");
    const txt = fs.readFileSync(path.join(mod, "history", "states", "4-Mine.txt"), "utf8");
    ok(/id = 4/.test(txt), "…and was not slid down onto vanilla's state 1", txt.slice(0, 40));

    // CONTROL: without a base root there IS a real gap at 1, and it must still be closed — otherwise this
    // is just asserting that a broken gap-closer does nothing.
    const mod2 = mk("mod3b", {
      "history/states/2-B.txt": st(2, [102]),
      "history/states/3-C.txt": st(3, [103]),
      "history/states/4-Mine.txt": st(4, [104]),
    });
    const r2 = md.closeStateIdGaps(mod2);
    ok(r2.renumbered.length === 1 && r2.renumbered[0].to === 1, "CONTROL: a genuine gap at 1 is still closed", r2);
  }

  console.log("\n-- resolving a province conflict must not delete a state vanilla also ships --");
  {
    // Province 700 is claimed by the mod's state 10 (which owns other land) and by its one-province copy
    // of state 554 — a state vanilla ALSO ships. Emptying 554 would once have deleted the mod's file, and
    // vanilla's 554 would have loaded straight back, still claiming province 700.
    const game = mk("game4", { "history/states/554-Syria.txt": st(554, [700]) });
    const mod = mk("mod4", {
      "history/states/10-Big.txt": st(10, [700, 701, 702]),
      "history/states/554-Syria.txt": st(554, [700]),
    });
    const before = stateFiles(mod);
    const r = md.fixProvinceInTwoStates({ modRoot: mod, gameRoot: game, dependencyRoots: [] });
    ok(stateFiles(mod).length === before.length, "the mod's state file is NOT deleted", stateFiles(mod));
    ok(fs.existsSync(path.join(mod, "history", "states", "554-Syria.txt")), "…554-Syria.txt survives");
    ok((r.deletedStates || []).length === 0, "…and nothing is reported as deleted", r.deletedStates);
    // #a-conflict-whose-loser-cannot-be-deleted-keeps-the-province — it used to end here as an UNRESOLVED refusal, and a
    // conflict nothing in the click can resolve survives every click (measured on the owner's own workflow: 25 of them,
    // and the same 25 states reported by the FATAL state_no_air_base_or_rocket_site). A claimant that cannot be emptied
    // is now the keeper, so 554 keeps province 700 and state 10, which has others, gives it up. The never-delete rule
    // above is unchanged and still checked; what follows is that it is now kept by resolving rather than by giving up.
    ok((r.unresolved || []).length === 0, "…and the conflict is RESOLVED, not left for the next click", r.unresolved);
    ok((r.resolved || []).some((x) => +x.province === 700 && +x.keptIn === 554 && +x.removedFrom === 10),
      "…by keeping the province in the state that cannot be emptied", r.resolved);
    ok(/700/.test(fs.readFileSync(path.join(mod, "history", "states", "554-Syria.txt"), "utf8"))
      && !/700/.test(fs.readFileSync(path.join(mod, "history", "states", "10-Big.txt"), "utf8")),
      "…on disk: 554 still lists it and 10 no longer does");

    // CONTROL: the same conflict where the loser is the MOD'S OWN invention. Deleting really does remove
    // it, so the fixer must still act — proving the guard is narrow, not a blanket refusal.
    const game2 = mk("game4b", { "history/states/1-Far.txt": st(1, [9999]) });
    const mod2 = mk("mod4b", {
      "history/states/10-Big.txt": st(10, [700, 701, 702]),
      "history/states/880-Stub.txt": st(880, [700]),
    });
    const r2 = md.fixProvinceInTwoStates({ modRoot: mod2, gameRoot: game2, dependencyRoots: [] });
    ok((r2.deletedStates || []).includes(880), "CONTROL: a mod-only stub state is still deleted", r2.deletedStates);
    ok(!fs.existsSync(path.join(mod2, "history", "states", "880-Stub.txt")), "…its file is gone");
  }

  console.log("\n-- a province takes its victory point with it --");
  {
    // State 20 wrongly claims province 700 AND holds the victory point for it. State 10 is the real home.
    const game = mk("game5", { "history/states/1-Far.txt": st(1, [9999]) });
    const mod = mk("mod5", {
      "history/states/10-Home.txt": st(10, [700, 701, 702]),
      "history/states/20-Wrong.txt": st(20, [700, 703], "\t\tvictory_points = { 700 15 }\n"),
    });
    const r = md.fixProvinceInTwoStates({ modRoot: mod, gameRoot: game, dependencyRoots: [] });
    const wrong = fs.readFileSync(path.join(mod, "history", "states", "20-Wrong.txt"), "utf8");
    const home = fs.readFileSync(path.join(mod, "history", "states", "10-Home.txt"), "utf8");
    ok((r.resolved || []).length === 1, "the conflict is resolved", r.resolved);
    ok(!/victory_points\s*=\s*\{\s*700\b/.test(wrong), "the losing state no longer holds a VP for a province it lost", wrong);
    ok(/victory_points\s*=\s*\{\s*700\s+15\s*\}/.test(home), "…the VP moved to the state that kept the province, value intact", home);

    // CONTROL: a keeper that already defines its own VP for that province must not have it overwritten.
    const mod2 = mk("mod5b", {
      "history/states/10-Home.txt": st(10, [700, 701], "\t\tvictory_points = { 700 50 }\n"),
      "history/states/20-Wrong.txt": st(20, [700, 703], "\t\tvictory_points = { 700 15 }\n"),
    });
    md.fixProvinceInTwoStates({ modRoot: mod2, gameRoot: game, dependencyRoots: [] });
    const home2 = fs.readFileSync(path.join(mod2, "history", "states", "10-Home.txt"), "utf8");
    ok(/victory_points\s*=\s*\{\s*700\s+50\s*\}/.test(home2) && !/700\s+15/.test(home2),
      "CONTROL: the keeper's own VP value wins, it is not clobbered by the loser's", home2);
  }

  console.log("\n-- a conflict between a mod state and a VANILLA state is visible at all --");
  {
    // The fixer used to read only modRoot, so this whole class was invisible to it while the validator —
    // which reads the overlay — reported it every time. On kurdistan that stranded province 9851 between
    // the mod's state 162 and vanilla's state 1, and repairRegionOverlaps then flipped it between two
    // strategic regions on every click for ever, because each state pulled it a different way.
    const game = mk("game7", { "history/states/1-France.txt": st(1, [700, 701, 702]) });
    const mod = mk("mod7", { "history/states/50-Mine.txt": st(50, [700, 800, 801, 802]) });
    const r = md.fixProvinceInTwoStates({ modRoot: mod, gameRoot: game, dependencyRoots: [] });
    ok((r.resolved || []).length === 1, "the mod-vs-vanilla conflict is seen and resolved", r);
    const over = path.join(mod, "history", "states", "1-France.txt");
    ok(fs.existsSync(over), "…vanilla's state is materialised into the mod as an override");
    const txt = fs.existsSync(over) ? fs.readFileSync(over, "utf8") : "";
    ok(/provinces\s*=\s*\{[^}]*\}/.test(txt) && !/\b700\b/.test(txt.match(/provinces\s*=\s*\{([^}]*)\}/)[1]),
      "…with the disputed province removed from it", txt.slice(0, 120));
    ok(/\b701\b/.test(txt) && /\b702\b/.test(txt), "…and its own land untouched");
    const model = md.buildMapModel({ modRoot: mod, gameRoot: game, dependencyRoots: [] });
    const holders = (model.states || []).filter((s) => (s.provinces || []).includes(700)).map((s) => s.id);
    ok(holders.length === 1, "…province 700 now belongs to exactly one state", holders);
  }

  console.log("\n-- but a clash purely between INHERITED states is not the mod's to rewrite --");
  {
    // Vanilla ships its own overlaps. Writing base files into the mod to "fix" them would blame the modder
    // for the base game — the same reason validateMapModel withholds them (problemIsTheModsOwn).
    const game = mk("game8", {
      "history/states/1-A.txt": st(1, [700, 701]),
      "history/states/2-B.txt": st(2, [700, 702]),
    });
    const mod = mk("mod8", { "history/states/50-Mine.txt": st(50, [900]) });
    const before = stateFiles(mod);
    const r = md.fixProvinceInTwoStates({ modRoot: mod, gameRoot: game, dependencyRoots: [] });
    ok((r.resolved || []).length === 0, "an inherited-only clash is left alone", r.resolved);
    ok(JSON.stringify(stateFiles(mod)) === JSON.stringify(before), "…and no base file is copied into the mod", stateFiles(mod));

    // CONTROL: the moment the mod owns one side, it IS the mod's problem and must be fixed.
    const mod2 = mk("mod8b", { "history/states/2-B.txt": st(2, [700, 702, 703]) });
    const r2 = md.fixProvinceInTwoStates({ modRoot: mod2, gameRoot: game, dependencyRoots: [] });
    ok((r2.resolved || []).length === 1, "CONTROL: once the mod owns a side, the clash is repaired", r2);
  }

  console.log("\n-- and the whole point: a second click has nothing left to do --");
  {
    const game = mk("game6", { "history/states/1-Far.txt": st(1, [9999]) });
    const mod = mk("mod6", {
      "history/states/10-Home.txt": st(10, [700, 701, 702]),
      "history/states/20-Wrong.txt": st(20, [700, 703], "\t\tvictory_points = { 700 15 }\n"),
    });
    const A = { modRoot: mod, gameRoot: game, dependencyRoots: [] };
    const first = md.fixProvinceInTwoStates(A);
    const snap = stateFiles(mod).map((f) => fs.readFileSync(path.join(mod, "history", "states", f), "utf8")).join("\0");
    const second = md.fixProvinceInTwoStates(A);
    const snap2 = stateFiles(mod).map((f) => fs.readFileSync(path.join(mod, "history", "states", f), "utf8")).join("\0");
    ok((first.resolved || []).length > 0, "the first pass repairs something", first.resolved);
    ok((second.resolved || []).length === 0, "the second pass reports NOTHING left to repair", second.resolved);
    ok(snap === snap2, "…and writes nothing — the files are byte-identical");
  }
} catch (e) {
  ok(false, "threw: " + e.message + "\n" + e.stack);
} finally {
  for (const d of cleanup) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) { /* scratch only */ } }
}

console.log("\n" + (fail ? "FAILED " + fail + "/" + (pass + fail) : "PASSED " + pass + "/" + pass));
process.exitCode = fail ? 1 : 0;
