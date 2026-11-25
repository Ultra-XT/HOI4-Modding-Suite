// #a-script-touches-a-state-that-is-gone — THE BASE GAME'S SCRIPT, ASKED WHETHER IT TOUCHES A MISSING STATE UNCHECKED.
//
// A world that keeps fewer states than the game beneath it leaves focuses, decisions, events and scripted effects naming
// states that are not there. Most are harmless: a trigger like is_owned_by looks the state up, logs "Invalid state" and
// answers false. Four shapes the engine does not check, and each is a null the game reads through:
//   read     `910.DEN_develop_state_cost` — what the owner's TEST 19, 22 and 23 all faulted on (hoi4.exe 1.19.3 0x54277F)
//   check    `886 = { is_core_of = ETH }` — is_core_of / is_claimed_by / num_owned_neighbour_states
//   effect   `910 = { add_core_of = ROOT }` in a focus reward, decision or event
//   targets  a targeted decision's `targets = { 987 988 }`
// ⛔ #a-variable-of-a-missing-state-is-guarded — NOT a variable in such a scope (`5 = { check_variable = … }`, has_variable, a
// variable effect): hoi4.exe's one variable resolver tests the scope's state and answers no. It was a "check" here until 2026-10-20.
// ⛔ #a-dead-state-read-is-fatal — the reads and the checks of a state the map below had are their own two FATAL rules now
// (script_state_read_unguarded, script_state_check_unguarded); the rest stays script_state_missing. One Auto-fix for all three.
//
// What this pins:
//   · the rules count each kind, and leave the checked (guarded) triggers alone
//   · each repair: comment out / `always = no` / 0 / trim, and a decision with nothing left to target commented out
//   · context is the NEAREST key that says trigger or effect: a `limit` inside `completion_reward` is a trigger
//   · decoys: live states, a guarded trigger, a numbered list that is not states (division names, random_list), a comment
//   · SPLICE: every changed line is a `#`-prefix, an `always = no`, a 0 or a trimmed id — nothing else moves
//   · line endings per file (one CRLF, one LF), idempotence, #inherited-problem-not-yours, the back-out control
"use strict";
const fs = require("fs"), os = require("os"), path = require("path");
const md = require(path.join(__dirname, "map-data.js"));

let pass = 0;
const fails = [];
const rec = (name, cond, detail) => {
  if (cond) { console.log("  ok   " + name); pass++; }
  else { console.log("  FAIL " + name + (detail === undefined ? "" : "   → " + JSON.stringify(detail).slice(0, 700))); fails.push(name); }
};
const mk = (p, c) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, c); };
const tmps = [];
const tmp = (tag) => { const d = fs.mkdtempSync(path.join(os.tmpdir(), "nova-scriptstate-" + tag + "-")); tmps.push(d); return d; };

// ── the fixture: a base game with states 1..6; the mod's world keeps 1..3 ────────────────────────────────────────────
const DECISIONS = [                                                         // written CRLF
  "TST_category = {",
  "\tTST_develop_five = {",
  "\t\tcost = 5.TST_cost",                                                  // read, a bare field → 0
  "\t\tvisible = {",
  "\t\t\t5 = { check_variable = { TST_level > 1 } }",                       // decoy: a variable of a missing state is guarded
  "\t\t\t2 = { check_variable = { TST_level > 1 } }",                       // decoy: live
  "\t\t}",
  "\t\tavailable = {",
  "\t\t\t4 = {",                                                           // check (is_core_of, through AND) → always = no
  "\t\t\t\tAND = { is_core_of = ROOT is_controlled_by = ROOT }",
  "\t\t\t}",
  "\t\t\t4 = { is_owned_by = ROOT }",                                       // decoy: guarded — the engine answers no
  "\t\t}",
  "\t\tcomplete_effect = {",
  "\t\t\t5 = { add_core_of = ROOT }",                                       // effect → commented out
  "\t\t\tif = { limit = { always = yes } 6 = { add_claim_by = ROOT } }",     // effect sharing a line → removed inline
  "\t\t\tif = {",
  "\t\t\t\tlimit = { 6 = { is_claimed_by = ROOT } }",                        // check inside an effect's limit → always = no
  "\t\t\t\t2 = { add_core_of = ROOT }",                                     // decoy: live
  "\t\t\t}",
  "\t\t}",
  "\t\tremove_effect = {",
  "\t\t\tmultiply_variable = { 5.TST_cost = 2 }",                           // read as a key, in an effect → commented out
  "\t\t}",
  "\t}",
  "\tTST_target_some = {",
  "\t\tstate_target = yes",
  "\t\ttargets = { 1 5 2 }",                                                // targets: 5 comes out, 1 and 2 stay
  "\t}",
  "\tTST_target_none = {",
  "\t\tstate_target = yes",
  "\t\ttargets = { 6 }",                                                    // targets: nothing left → decision commented out
  "\t}",
  "\tTST_tags = {",
  "\t\ttargets = { GER ITA }",                                              // decoy: a list of tags is not states
  "\t}",
  "\tTST_scripted = {",
  "\t\tvisible = {",
  "\t\t\t4 = { TST_calls_reader = yes }",                                  // check THROUGH two scripted triggers → always = no
  "\t\t\t5 = { TST_harmless = yes }",                                      // decoy: a scripted trigger that only asks guarded things
  "\t\t\t6 = { TST_reads_var = yes }",                                     // decoy: …and one that only asks has_variable (guarded)
  "\t\t}",
  "\t}",
  "}",
  "",
];
const FOCUS = [                                                             // written LF
  "focus_tree = {",
  "\tfocus = {",
  "\t\tid = TST_claim",
  "\t\tavailable = {",
  "\t\t\tNOT = { has_war_with = 5.OWNER }",                                 // read in a trigger, sharing a line → inline always = no
  "\t\t\tis_ally_with = 6.owner",                                          // read in a trigger, own line → always = no + comment
  "\t\t}",
  "\t\tcompletion_reward = {",
  "\t\t\t# 5 = { add_core_of = ROOT } — a decoy in a comment",
  "\t\t\tcreate_wargoal = {",                                              // read inside an argument block → the whole effect goes
  "\t\t\t\ttype = take_state_focus",
  "\t\t\t\ttarget = 4.controller",
  "\t\t\t}",
  "\t\t\trandom_list = { 5 = { add_political_power = 10 } 95 = { } }",     // decoy: random_list weights are not states
  "\t\t}",
  "\t}",
  "}",
  "",
];
const EVENTS = [
  "country_event = {",
  "\tid = tst.1",
  "\toption = {",
  "\t\tname = tst.1.a",
  "\t\tset_variable = { TST_industry = 6.arms_factory_level }",             // read in arithmetic → 0
  "\t\tvar:5.controller = { country_event = { id = tst.2 } }",               // read as a scope key, in an effect → commented out
  "\t\t6 = { add_to_variable = { TST_x = 5.foo } }",                         // a variable op's block stays (guarded); the read in it → 0
  "\t}",
  "}",
  "",
];
const EFFECTS = "TST_effect = {\n\t4 = { add_core_of = ROOT }\n\t1 = { add_core_of = ROOT }\n}\n";         // top level is an effect
const TRIGGERS = "TST_trigger = {\n\t5 = { is_owned_by = ROOT }\n\t6 = { is_claimed_by = ROOT }\n}\n"      // top level is a trigger
  + "TST_reads_state = {\n\tis_core_of = ROOT\n}\n"                                                        // reads its scope's state
  + "TST_calls_reader = {\n\tOR = { TST_reads_state = yes always = no }\n}\n"                              // …through another one
  + "TST_harmless = {\n\tis_owned_by = ROOT\n}\n"                                                          // guarded only
  + "TST_reads_var = {\n\thas_variable = TST_var\n}\n";                                                    // a variable: guarded
const NAMES = "TST_names = {\n\tordered = {\n\t\t5 = { \"%d. Division\" }\n\t}\n}\n";                    // numbered names, not states

const stateFile = (id) => `state = {\n\tid = ${id}\n\tname = "S${id}"\n\tmanpower = 100\n\tprovinces = { ${id} }\n\thistory = { owner = AAA }\n}\n`;
function makeGame() {
  const g = tmp("game");
  for (const id of [1, 2, 3, 4, 5, 6]) mk(path.join(g, "history", "states", `${id}-S${id}.txt`), stateFile(id));
  mk(path.join(g, "common", "decisions", "TST.txt"), DECISIONS.join("\r\n"));
  mk(path.join(g, "common", "national_focus", "tst.txt"), FOCUS.join("\n"));
  mk(path.join(g, "events", "tst.txt"), EVENTS.join("\n"));
  mk(path.join(g, "common", "scripted_effects", "tst.txt"), EFFECTS);
  mk(path.join(g, "common", "scripted_triggers", "tst.txt"), TRIGGERS);
  mk(path.join(g, "common", "units", "names_divisions", "tst.txt"), NAMES);
  return g;
}
function makeMod(keep) {
  const m = tmp("mod");
  mk(path.join(m, "descriptor.mod"), `name="script state fixture"\n${keep.length < 6 ? 'replace_path="history/states"\n' : ""}`);
  if (keep.length < 6) for (const id of keep) mk(path.join(m, "history", "states", `${id}-S${id}.txt`), stateFile(id));
  return m;
}
const GAME = makeGame();
const ctx = (modRoot, deps = []) => ({ modRoot, gameRoot: GAME, dependencyRoots: deps });
const RULES = ["script_state_read_unguarded", "script_state_check_unguarded", "script_state_missing"];
const rowsFor = (c) => (md.validateMapModel(md.buildMapModel(c)) || []).filter((p) => RULES.includes(p.rule));
const labels = require(path.join(__dirname, "public", "map-rule-labels.js"));

try {
  const MOD = makeMod([1, 2, 3]);
  console.log("=== the rule ===");
  const rows = rowsFor(ctx(MOD));
  const by = Object.fromEntries(rows.map((r) => [r.rule, r]));
  const sum = { read: 0, check: 0, effect: 0, targets: 0 };
  for (const r of rows) for (const k of Object.keys(sum)) sum[k] += (r.byKind || {})[k] || 0;
  const items = rows.flatMap((r) => r.items || []);
  rec("THE CONTROL: the three rules fire on the shrunken world, one row each", rows.length === 3 && RULES.every((x) => by[x]), rows.map((r) => r.rule));
  // reads: cost 5, multiply 5, has_war_with 5, is_ally_with 6, target 4, set_variable 6, var:5, 5.foo = 8
  // checks: 4 (is_core_of via AND), 6 (is_claimed_by in a limit), scripted trigger 6, 4 through two scripted triggers = 4
  // effects: 5 add_core_of, 6 inline, scripted effect 4 = 3 · targets: 5 (trim), 6 (emptied) = 2
  rec("⭐⭐⭐ they count 8 reads, 4 unchecked checks, 3 effects and 2 target ids — nothing from the decoys",
    JSON.stringify(sum) === JSON.stringify({ read: 8, check: 4, effect: 3, targets: 2 }) && rows.reduce((t, r) => t + r.total, 0) === 17, { sum, items });
  rec("⭐⭐⭐ #a-dead-state-read-is-fatal: the 8 reads and the 4 checks of states the map below had stop Save; the 5 others are an error",
    (by.script_state_read_unguarded || {}).total === 8 && (by.script_state_check_unguarded || {}).total === 4 && (by.script_state_missing || {}).total === 5
    && rows.every((r) => r.severity === "error") && labels.isFatalRule("script_state_read_unguarded") && labels.isFatalRule("script_state_check_unguarded")
    && !labels.isFatalRule("script_state_missing"), rows.map((r) => [r.rule, r.total, r.byKind]));
  rec("⭐⭐ the guarded trigger (4 = { is_owned_by }) is not counted", !items.some((i) => i.file === "common/decisions/TST.txt" && i.line === 12), items);
  rec("⭐⭐⭐ #a-variable-of-a-missing-state-is-guarded: 5 = { check_variable }, 6 = { TST_reads_var } and 6 = { add_to_variable } are not counted",
    !items.some((i) => i.file === "common/decisions/TST.txt" && (i.line === DECISIONS.indexOf("\t\t\t5 = { check_variable = { TST_level > 1 } }") + 1 || i.line === DECISIONS.indexOf("\t\t\t6 = { TST_reads_var = yes }") + 1))
    && !items.some((i) => i.file === "events/tst.txt" && i.line === EVENTS.indexOf("\t\t6 = { add_to_variable = { TST_x = 5.foo } }") + 1 && i.kind !== "read")
    && DECISIONS.indexOf("\t\t\t6 = { TST_reads_var = yes }") > 0, items);
  rec("⭐⭐ a numbered name list and a random_list weight are not states",
    !items.some((i) => /names_divisions/.test(i.file)) && !items.some((i) => i.file === "common/national_focus/tst.txt" && i.line === 14), items);

  console.log("\n=== the repair ===");
  const r = md.fixScriptStateRefs(ctx(MOD));
  rec("⭐⭐⭐ it repairs exactly the 17 the rules counted, in one click for all three",
    r.fixed === 17 && JSON.stringify(r.byKind) === JSON.stringify({ read: 8, check: 4, effect: 3, targets: 2 }), r);
  rec("⭐⭐ …copying the five base-game files it had to change in, and saying which",
    (r.materialised || []).slice().sort().join(",") === ["common/decisions/TST.txt", "common/national_focus/tst.txt", "common/scripted_effects/tst.txt", "common/scripted_triggers/tst.txt", "events/tst.txt"].join(","), r.materialised);
  rec("…and no skips", !(r.skipped || []).length, r.skipped);
  rec("⭐⭐⭐ the rule is silent afterwards", rowsFor(ctx(MOD)).length === 0, rowsFor(ctx(MOD)).map((x) => x.byKind));
  rec("⭐⭐ the file it had no reason to touch is not copied in", !fs.existsSync(path.join(MOD, "common", "units")));

  const dec = fs.readFileSync(path.join(MOD, "common", "decisions", "TST.txt"), "utf8");
  const D = dec.split("\r\n");
  const has = (L, s) => L.includes(s);
  rec("⭐⭐ read, bare field: `cost = 5.TST_cost` becomes `cost = 0`", has(D, "\t\tcost = 0"), D.slice(0, 4));
  rec("⭐⭐⭐ #a-variable-of-a-missing-state-is-guarded: the dead visible block asking a variable is left exactly as it was",
    has(D, "\t\t\t5 = { check_variable = { TST_level > 1 } }") && !D.some((l) => /^\t\t\talways = no    # Nova: state 5 is not in this map/.test(l)), D.slice(3, 9));
  rec("⭐⭐⭐ check (is_core_of through AND): the whole 4 = { … } block, all three lines", has(D, "#\t\t\t4 = {") && has(D, "#\t\t\t\tAND = { is_core_of = ROOT is_controlled_by = ROOT }"));
  rec("⭐⭐⭐ decoy: the guarded 4 = { is_owned_by } is untouched", has(D, "\t\t\t4 = { is_owned_by = ROOT }"));
  rec("⭐⭐⭐ effect: 5 = { add_core_of } is commented out, note on the line", D.some((l) => l.startsWith("#\t\t\t5 = { add_core_of = ROOT }    # Nova: state 5")), D.slice(14, 20));
  rec("⭐⭐⭐ effect sharing a line: removed inline, the if and its limit kept", has(D, "\t\t\tif = { limit = { always = yes }  }"), D.slice(14, 20));
  rec("⭐⭐⭐ context is the NEAREST key: a check inside complete_effect's limit becomes always = no, not a deletion",
    has(D, "\t\t\t\tlimit = { always = no }"), D.slice(16, 21));
  rec("⭐⭐ decoy: the live effect beside it is untouched", has(D, "\t\t\t\t2 = { add_core_of = ROOT }"));
  rec("⭐⭐ read as a key in an effect: multiply_variable is commented out whole", D.some((l) => l.startsWith("#\t\t\tmultiply_variable = { 5.TST_cost = 2 }    # Nova:")));
  rec("⭐⭐⭐ targets: 5 comes out of a list that keeps 1 and 2", has(D, "\t\ttargets = { 1 2 }"), D.filter((l) => /targets/.test(l)));
  rec("⭐⭐⭐ targets: a decision left with nothing to target is commented out whole",
    D.some((l) => l.startsWith("#\tTST_target_none = {    # Nova: state 6 is not in this map, so this decision has nothing to target")) && has(D, "#\t\ttargets = { 6 }"), D.filter((l) => /TST_target_none|targets = \{ 6/.test(l)));
  rec("⭐⭐ decoy: a list of tags is untouched", has(D, "\t\ttargets = { GER ITA }"));
  rec("⭐⭐⭐ a check THROUGH scripted triggers becomes always = no",
    has(D, "#\t\t\t4 = { TST_calls_reader = yes }") && D.some((l) => /^\t\t\talways = no    # Nova: state 4/.test(l)), D.slice(-10));
  rec("⭐⭐ decoy: a scripted trigger that only asks guarded things is left alone", has(D, "\t\t\t5 = { TST_harmless = yes }"));
  rec("⭐⭐⭐ decoy: …and one that only asks has_variable of its state (the owner's Chinese decisions' shape) too", has(D, "\t\t\t6 = { TST_reads_var = yes }"), D.slice(-10));
  rec("⭐⭐ the CRLF file is still all CRLF", (dec.match(/\r\n/g) || []).length === (dec.match(/\n/g) || []).length);

  const foc = fs.readFileSync(path.join(MOD, "common", "national_focus", "tst.txt"), "utf8");
  const F = foc.split("\n");
  rec("⭐⭐ read in a trigger, sharing a line: `NOT = { always = no }`", has(F, "\t\t\tNOT = { always = no }"), F.slice(3, 9));
  rec("⭐⭐ read in a trigger, own line: always = no, the original kept as a comment",
    F.some((l) => /^\t\t\talways = no    # Nova: state 6/.test(l)) && has(F, "#\t\t\tis_ally_with = 6.owner"), F.slice(3, 10));
  rec("⭐⭐⭐ read inside an argument block: the WHOLE create_wargoal goes, not just its target line",
    F.some((l) => l.startsWith("#\t\t\tcreate_wargoal = {    # Nova: state 4")) && has(F, "#\t\t\t\ttype = take_state_focus") && has(F, "#\t\t\t}"), F.slice(9, 16));
  rec("⭐⭐ decoys: the comment and the random_list are untouched",
    has(F, "\t\t\t# 5 = { add_core_of = ROOT } — a decoy in a comment") && has(F, "\t\t\trandom_list = { 5 = { add_political_power = 10 } 95 = { } }"));
  rec("⭐⭐ the LF file stays LF", foc.indexOf("\r") === -1);

  const ev = fs.readFileSync(path.join(MOD, "events", "tst.txt"), "utf8").split("\n");
  rec("⭐⭐ read in arithmetic: the value becomes 0", has(ev, "\t\tset_variable = { TST_industry = 0 }"), ev);
  rec("⭐⭐ read as a scope key in an effect: commented out", ev.some((l) => l.startsWith("#\t\tvar:5.controller = { country_event = { id = tst.2 } }    # Nova:")), ev);
  rec("⭐⭐⭐ a variable op's block on a missing state stays (guarded), and the explicit read inside it counts 0",
    has(ev, "\t\t6 = { add_to_variable = { TST_x = 0 } }"), ev);

  const eff = fs.readFileSync(path.join(MOD, "common", "scripted_effects", "tst.txt"), "utf8").split("\n");
  rec("⭐⭐ a scripted effect's top level is an effect: 4 = { add_core_of } commented out, 1 = { … } kept",
    eff[1].startsWith("#\t4 = { add_core_of = ROOT }") && eff[2] === "\t1 = { add_core_of = ROOT }", eff);
  const trg = fs.readFileSync(path.join(MOD, "common", "scripted_triggers", "tst.txt"), "utf8").split("\n");
  rec("⭐⭐ a scripted trigger's top level is a trigger: is_claimed_by → always = no, the guarded is_owned_by kept",
    trg[1] === "\t5 = { is_owned_by = ROOT }" && /^\talways = no/.test(trg[2]), trg);

  // SPLICE: undo every marker and the file is the original
  const undo = (lines) => lines.filter((l) => !/^\s*always = no    # Nova: /.test(l))
    .map((l) => l.replace(/^#/, "").replace(/    # Nova: .*$/, ""));
  const undoneFocus = undo(F).join("\n").replace("NOT = { always = no }", "NOT = { has_war_with = 5.OWNER }");
  rec("⭐⭐⭐ SPLICE: undo the markers and the one inline change, and the focus file is byte-identical to the original",
    undoneFocus === FOCUS.join("\n"), undoneFocus.split("\n").filter((l, i) => l !== FOCUS[i]));

  const again = md.fixScriptStateRefs(ctx(MOD));
  rec("⭐⭐⭐ a second click writes nothing", again.fixed === 0 && fs.readFileSync(path.join(MOD, "common", "decisions", "TST.txt"), "utf8") === dec, again);

  console.log("\n=== a state that was gone before this mod ===");
  const DEP = makeMod([1, 2, 3]);
  const ADDON = tmp("addon");
  mk(path.join(ADDON, "descriptor.mod"), 'name="addon"\n');
  rec("⭐⭐ an add-on on that world is not blamed for what its dependency broke", rowsFor(ctx(ADDON, [DEP])).length === 0);
  const af = md.fixScriptStateRefs(ctx(ADDON, [DEP]));
  rec("⭐⭐ …and the repair copies nothing into it", af.fixed === 0 && !fs.existsSync(path.join(ADDON, "common")) && !fs.existsSync(path.join(ADDON, "events")), af);

  console.log("\n=== the back-out control ===");
  const WHOLE = makeMod([1, 2, 3, 4, 5, 6]);
  rec("⭐⭐⭐ on a world that kept its states the rule says nothing", rowsFor(ctx(WHOLE)).length === 0);
  const w = md.fixScriptStateRefs(ctx(WHOLE));
  rec("⭐⭐⭐ …and the repair writes nothing", w.fixed === 0 && !fs.existsSync(path.join(WHOLE, "common")), w);

  console.log("\n=== Auto-fix all ===");
  const src = fs.readFileSync(path.join(__dirname, "map-data.js"), "utf8");
  const a = src.indexOf("fixes.deadAiStrategyLists = fixAiStrategyStateLists(");
  const b = src.indexOf("fixes.deadScriptStateRefs = fixScriptStateRefs(");
  const c = src.indexOf("fixes.deadStateScopes = fixCountryHistoryStateScopes(");
  rec("⭐⭐ autoFixMap runs it, after the last pass that changes which state ids exist", c !== -1 && a > c && b > a, { a, b, c });
} finally {
  for (const d of tmps) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} }
}

console.log(`\n${pass} passed, ${fails.length} failed`);
if (fails.length) { console.log("FAILED: " + fails.join(" | ")); process.exit(1); }
