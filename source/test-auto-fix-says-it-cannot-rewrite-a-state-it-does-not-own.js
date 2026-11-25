// Auto-fix looked at 480 states, refused every one of them on purpose, and said nothing about any of them.
// #a-state-nova-will-not-rewrite-is-still-a-state-it-looked-at
//
// THE DEFECT. non_land_province_in_state and fixSeaProvinceLeftovers ask two different questions and neither
// knows the other's answer:
//
//   the rule   "did THIS MOD make this province sea, or list it in this state?"  (seaProvinceInStateIsTheModsOwn)
//   the fixer  "is this state's FILE one this mod defines?"                      (modOwnedStateIds)
//
// Both are right. A mod that retypes a province to sea in its own definition.csv owns the problem — and the state
// still listing that province can perfectly well be the base game's, which the fixer may not rewrite, because
// editStateBlock would materialise the layer below's copy into the mod (#seafix-materialises-vanilla-states: one
// click created three vanilla state files in a clean mod and took the validator 0 → 3 errors).
//
// Nothing bridged them. fixSeaProvinceLeftovers dropped such a state at
//
//     if (s.size && modOwnedStateIds.has(sid)) seaRefByState.set(sid, s); else seaRefByState.delete(sid);
//
// with no count, no state id and no reason — while its sibling refusal, `wouldEmpty`, had carried all three since
// the day it was written.
//
// ⚠️ MEASURED on the world the owner built and installed as nova_world_0917 (new mod → Delete map → Generate land
// → Auto-fix), read off disk with map-data.js's own validator and autoFixMap:
//
//     non_land_province_in_state    6,537 sea provinces the mod is answerable for, across 696 states
//     fixSeaProvinceLeftovers       0 rewritten — it can reach none of them
//     wouldEmpty                      216 states, 1,673 provinces   refused AND explained
//     dropped, before this change      480 states, 4,864 provinces   74% of the error, in silence
//
// So the sentence the modder read accounted for a quarter of the error printed beside it, and the other
// three quarters fell between the two questions. 216 + 480 = 696 and 1,673 + 4,864 = 6,537: the two registers
// partition the rule's whole population exactly, which is the check section 3 makes on the fixture.
//
// THE FIX. The fixer returns `notYours` / `notYoursProvinces` / `notYoursRoots` — including WHOSE files they are,
// the thing that decides who can fix it, the way the stranded-fleet rule names its 88 base-game files instead of
// telling a modder to edit what they do not have. public/map.js adds a clause of its own, because the remedy
// differs: these states did not lose their land, their provinces did.
//
// How it is checked: the two-layer fixture, so "not the mod's file" is a real layer below and not a flag. The
// page's OWN summary code is lifted out of public/map.js and run on the real fixer result, so a wording change
// that stops naming the refusal fails here. Section 4 is the negative control: the same map with the state file
// copied into the mod is FIXED, and names nothing as left alone.
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const lib = require("./testlib-two-layer-map.js");

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (ok || detail == null ? "" : "   -> " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 360)));
  if (!ok) fails.push(label);
};

const W = lib.makeWorld("notmine");
const { createApp } = require("./server.js");
const md = require("./map-data.js");
const { maskJsComments } = require("./testlib-strip-comments.js");
const P = require("./testlib-map-page.js");   // withNoteHelpers: the summary's note helpers, derived not named

const RULE = "non_land_province_in_state";
// The fixture's own inputs, never a number read back out of a result. The game ships state 2 = { 2 5 } and
// state 3 = { 3 }; a mod that retypes 5 and 3 to sea in its own definition.csv owns both problems and owns
// neither state file. 2 keeps land province 2, so it is the "still has land" shape; 3 has nothing left, so it
// is the shape that would be `wouldEmpty` if the file were the mod's.
const KEEPS_LAND = 2, ALL_GONE = 3;
const SEA_5 = { 5: "5;0;200;200;sea;false;ocean;0" };
const SEA_3 = { 3: "3;0;200;0;sea;false;ocean;0" };
const has = (d, rel) => fs.existsSync(path.join(d, ...rel.split("/")));
const read = (d, rel) => (has(d, rel) ? fs.readFileSync(path.join(d, ...rel.split("/")), "utf8") : "");
const listOf = (d, rel) => { const m = /provinces\s*=\s*\{([^}]*)\}/.exec(read(d, rel)); return m ? m[1].trim().split(/\s+/).filter(Boolean).join(" ") : null; };
const fix = (mod) => md.fixSeaProvinceLeftovers({ modRoot: mod, gameRoot: W.GAME, dependencyRoots: [] });

// ── The page's own Auto-fix summary, lifted out of public/map.js, exactly as
// test-auto-fix-says-what-it-refused-rather-than-that-it-found-nothing.js lifts it. "\n  }" is deliberate and
// EOL-agnostic: a CRLF checkout's "\r\n  }" contains it. ──────────────────────────────────────────────────────
const MAP_SRC = fs.readFileSync(path.join(__dirname, "public", "map.js"), "utf8");
const MASKED = maskJsComments(MAP_SRC);
function liftSummary() {
  const grabFn = (needle) => { const s = MASKED.indexOf(needle); if (s < 0) return ""; const e = MASKED.indexOf("\n  }", s); return e < 0 ? "" : MAP_SRC.slice(s, e + 4); };
  const s = MASKED.indexOf("const ro = (fr.fixes");
  const at = MASKED.indexOf("const summaryLine = (parts.length", s);
  const e = at < 0 ? -1 : MASKED.indexOf(";", at);
  // ⚠️ DERIVED, not named. Listing three by hand broke this test the day a fourth helper
  // (duplicateStatesLeftNote) joined public/map.js — "is not defined", thrown from inside the click's own
  // catch, which blames the page rather than the missing lift. testlib-map-page.js already solved this.
  return { body: s >= 0 && e >= 0 ? MAP_SRC.slice(s, e + 1) : "", helpers: [] };
}
const LIFT = liftSummary();
function summaryFor(fr) {
  const sandbox = { console, JSON, Set, Math, Array, Number, String, Object, fr };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(P.withNoteHelpers(`var statusEl = null;\n${LIFT.body}`) + "\nglobalThis.__line = summaryLine;", sandbox);
  return String(sandbox.__line);
}
// The new clause only. The rest of the line quotes hoi4.exe's own coastal-no-port text, which really does say
// "will likely crash the game", so scanning the whole sentence would fail on somebody else's correct quote.
const clauseOf = (line) => (/\(⛔ [^)]*state files? (?:is|are) not your mod's[^)]*\)/.exec(line) || [""])[0];

(async () => {
  let S = null;
  try {
    S = await lib.startServer(createApp);

    console.log("=== 0. THE CONTROLS: the page's summary code was found, and the rule does call this the mod's problem ===");
    rec("the summary body was lifted out of public/map.js", LIFT.body.length > 2000, LIFT.body.length);
    // Derived, so the check is that the derivation actually reaches them — including the one whose arrival broke this.
    const withHelpers = P.withNoteHelpers(LIFT.body);
    rec("…and every note helper it calls came with it, derived rather than named",
      /function regionRepairNote\(/.test(withHelpers) && /function duplicateStatesLeftNote\(/.test(withHelpers),
      (withHelpers.match(/\n\s*function \w+Note\(/g) || []).length + " helper(s)");
    rec("…and it builds a line from an empty response", summaryFor({ ok: true, fixes: {} }).length > 0, summaryFor({ ok: true, fixes: {} }));
    {
      const clean = W.mod("Clean", { "history/states/9-D.txt": lib.st(9, "4") });
      const v = await S.validate(clean);
      rec("THE NEGATIVE CONTROL: a mod that retypes nothing is told of no sea province in a state",
        lib.idsOf(v, RULE).length === 0, lib.rulesIn(v));
    }

    console.log("\n=== 1. the rule calls it the modder's problem, and the fixer cannot reach it ===");
    const inh = W.mod("Inherited", { "map/definition.csv": lib.DEF({ ...SEA_5, ...SEA_3 }) });
    const told = lib.idsOf(await S.validate(inh), RULE);
    rec(`⭐⭐⭐ the rule reports states ${KEEPS_LAND} and ${ALL_GONE} — the mod retyped those provinces, so they are its problem`,
      told.includes(KEEPS_LAND) && told.includes(ALL_GONE), told);
    const before = lib.tree(inh);
    const r = fix(inh);
    rec("the fixer ran", !!r && !r.error, r);
    rec("⭐⭐ …and rewrote nothing, which is the whole reason the refusal exists", (r.statesEdited || 0) === 0 && (r.provincesRemoved || 0) === 0, r);
    rec("⭐⭐⭐ …and did NOT materialise the base game's state file into the mod",
      !has(inh, `history/states/${KEEPS_LAND}-B.txt`) && !has(inh, `history/states/${ALL_GONE}-C.txt`) && lib.written(before, lib.tree(inh)).length === 0,
      lib.written(before, lib.tree(inh)));

    console.log("\n=== 2. …and now it says so ===");
    rec(`⭐⭐⭐ notYours names both states — the one that keeps land (${KEEPS_LAND}) and the one that does not (${ALL_GONE})`,
      (r.notYours || []).includes(KEEPS_LAND) && (r.notYours || []).includes(ALL_GONE), r.notYours);
    rec("⭐⭐ …counts the provinces, not the states, so the figure matches the error's noun",
      r.notYoursProvinces === 2, { notYoursProvinces: r.notYoursProvinces, notYours: r.notYours });
    rec("⭐⭐ …and names WHOSE files they are, which is what decides who can fix it — here, the base game",
      Array.isArray(r.notYoursRoots) && r.notYoursRoots.length === 1 && r.notYoursRoots[0] === "the base game",
      r.notYoursRoots);
    rec("⛔ …and does NOT report them as ones it would have emptied — the two refusals are different refusals",
      (r.wouldEmpty || []).length === 0, r.wouldEmpty);

    console.log("\n=== 3. the two registers account for every state the rule reported, with no state in both ===");
    {
      const both = [...(r.wouldEmpty || []), ...(r.notYours || [])];
      const overlap = (r.wouldEmpty || []).filter((s) => (r.notYours || []).includes(s));
      rec("⭐⭐ no state is in both registers", overlap.length === 0, overlap);
      const missed = told.filter((s) => !both.includes(s));
      rec("⭐⭐⭐ every state the rule named is in one of them — nothing falls between the two questions",
        missed.length === 0, { told, wouldEmpty: r.wouldEmpty, notYours: r.notYours, missed });
    }

    console.log("\n=== 4. THE NEGATIVE CONTROL: the same map, with the state file copied in, is FIXED and named as nothing ===");
    {
      const own = W.mod("Owned", { "map/definition.csv": lib.DEF(SEA_5), [`history/states/${KEEPS_LAND}-B.txt`]: lib.st(KEEPS_LAND, "2 5") });
      const ro = fix(own);
      rec("⭐⭐⭐ a state file the mod does define is rewritten, not declined", (ro.provincesRemoved || 0) === 1 && listOf(own, `history/states/${KEEPS_LAND}-B.txt`) === "2",
        { ro, list: listOf(own, `history/states/${KEEPS_LAND}-B.txt`) });
      rec("⭐⭐ …and notYours names nothing, so the new branch is not simply always on", (ro.notYours || []).length === 0 && (ro.notYoursProvinces || 0) === 0, ro);
      rec("…and its line carries no such clause", clauseOf(summaryFor({ ok: true, fixes: { seaLeftovers: ro } })) === "",
        summaryFor({ ok: true, fixes: { seaLeftovers: ro } }));
    }

    console.log("\n=== 4b. …and the layer is named, not assumed to be the base game ===");
    {
      // A dependency shipping its own copy of the state, and an add-on that retypes the province under it. The
      // label has to come from the root the file was read from, or an add-on is told to go and edit the game.
      const DEP_NAME = "State supplier";
      const DEP = W.mod(DEP_NAME, { [`history/states/${KEEPS_LAND}-B.txt`]: lib.st(KEEPS_LAND, "2 5") });
      const a = W.mod("AddonRetyper", { "map/definition.csv": lib.DEF(SEA_5) }, [DEP_NAME]);
      const ra = md.fixSeaProvinceLeftovers({ modRoot: a, gameRoot: W.GAME, dependencyRoots: [DEP] });
      rec(`⭐⭐⭐ the dependency's state ${KEEPS_LAND} is declined and named by ITS OWN folder, not "the base game"`,
        (ra.notYours || []).includes(KEEPS_LAND) && (ra.notYoursRoots || []).join() === path.basename(DEP),
        { notYours: ra.notYours, notYoursRoots: ra.notYoursRoots, expected: path.basename(DEP) });
      rec("…and the add-on is still handed no copy of it", !has(a, `history/states/${KEEPS_LAND}-B.txt`));
    }

    console.log("\n=== 5. the line the modder actually reads, built from the real fixer result ===");
    {
      const line = summaryFor({ ok: true, fixes: { seaLeftovers: r } });
      console.log("  LINE: " + line);
      const clause = clauseOf(line);
      rec("THE CONTROL: the new clause was isolated from the line", clause.length > 80, clause);
      rec("⭐⭐⭐ the click does not claim it found nothing", !/Nothing auto-fixable was found/.test(line), line);
      rec(`⭐⭐ it names how many states were left alone (${(r.notYours || []).length})`,
        new RegExp(`\\b${(r.notYours || []).length} states?\\b`).test(clause), clause);
      rec(`⭐⭐ …and how many provinces (${r.notYoursProvinces}), so the figure can be read against the error beside it`,
        new RegExp(`\\b${r.notYoursProvinces} sea provinces?\\b`).test(clause), clause);
      rec("⭐⭐ …names the state ids, so the modder can go to them", (r.notYours || []).every((s) => new RegExp(`\\b${s}\\b`).test(clause)), clause);
      rec("⭐⭐⭐ …says whose files they are", clause.indexOf(path.basename(W.GAME)) > 0 && /not your mod's/.test(clause), clause);
      rec("⭐⭐ …why Nova will not do it — copying the file in freezes that state at this build", /copying .* into your mod/.test(clause) && /freezes/.test(clause), clause);
      rec("…and what to do instead", /land again in the terrain editor/.test(clause) && /take the states? over yourself/.test(clause), clause);
      rec("⛔ …and claims no crash it cannot show", clause.length > 0 && !/crash/i.test(clause), clause);
    }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 10).join("\n") : e);
    fails.push("harness error");
  } finally {
    if (S) S.close();
    W.cleanup();
  }
  console.log(`\n=== auto-fix says it cannot rewrite a state it does not own: ${checks} checks, ${fails.length} failed ===`);
  if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
})();
