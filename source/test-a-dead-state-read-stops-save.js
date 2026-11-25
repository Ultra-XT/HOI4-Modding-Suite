// ⛔ #a-dead-state-read-is-fatal — A SCRIPT THAT READS A MISSING STATE THROUGH A PATH HOI4 NEVER CHECKS STOPS SAVE.
//
// script_state_missing was one error rule for four shapes. Two of them the engine reads through with no test at all:
//   script_state_read_unguarded   `910.DEN_develop_state_cost` — an explicit id takes the variable resolver's one branch with no
//                                 null test (0x140589BAF in 0x140589930, hoi4.exe 1.19.4.1): TEST 19, 22 and 23 died there — and
//                                 `910 = { add_dynamic_modifier = { … } }`, the effect a Nova world's country history crashed in at
//                                 game start (CAddRemoveDynamicModifierEffect, 0x14059E4D0 in 1.19.4.1), and played without. FATAL, "crashes".
//   script_state_check_unguarded  is_core_of / is_claimed_by / num_owned_neighbour_states in the dead state's scope, read from the
//                                 code (0x483180, 0x482C70) and never launched. FATAL, "untested".
// …for a state the world the mod builds on HAD, and — ⛔ #a-mods-own-read-of-a-state-no-layer-has (the review of 2135d070) — for ANY
// missing state the mod's OWN files read that way: the explicit-id branch faults on an id out of range with rbx still 0, whatever the
// layers below say. Only a LOWER layer's file naming an id no layer had stays script_state_missing (the layer below's own problem;
// the base game ships none in these shapes). So does add_core_of, which looks its state up and returns (the comment once blamed it
// for the history crash; that was the add_dynamic_modifier beside it).
// ⛔ #a-dynamic-modifier-through-a-scripted-effect (the same review) — the modifier one scripted effect away is the same read
// (vanilla's `85 = { pol_remove_danzig_effect = yes }`), and so is one under a random_list weight or a loop that keeps the scope, and
// one in a focus's bypass_effect, which no rule saw at all.
// ⛔ #a-variable-of-a-missing-state-is-guarded — and a variable op in a dead state's scope is none of these: the resolver tests the
// scope's own state (0x14058A369), logs "State N not found" and answers no — every one of the 29 variable classes goes through it.
//
// THE FIXTURE: a base game with states 1..6; the mod's world keeps 1..3 (replace_path history/states).
"use strict";
const fs = require("fs"), os = require("os"), path = require("path");
const md = require(path.join(__dirname, "map-data.js"));
const labels = require(path.join(__dirname, "public", "map-rule-labels.js"));

let pass = 0;
const fails = [];
const rec = (name, cond, detail) => {
  if (cond) { console.log("  ok   " + name); pass++; }
  else { console.log("  FAIL " + name + (detail === undefined ? "" : "   → " + JSON.stringify(detail).slice(0, 700))); fails.push(name); }
};
const mk = (p, c) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, c); };
const tmps = [];
const tmp = (tag) => { const d = fs.mkdtempSync(path.join(os.tmpdir(), "nova-deadread-" + tag + "-")); tmps.push(d); return d; };

const DECISIONS = [
  "TST_category = {",
  "\tTST_one = {",
  "\t\tcost = 5.TST_cost",                                                       // 3  read                      → read_unguarded
  "\t\tvisible = {",
  "\t\t\t4 = { is_core_of = ROOT }",                                             // 5  check                     → check_unguarded
  "\t\t\t5 = { has_variable = TST_flag }",                                       // 6  a variable: guarded       → nothing
  "\t\t\t4 = { is_owned_by = ROOT }",                                            // 7  guarded trigger           → nothing
  "\t\t}",
  "\t\tcomplete_effect = {",
  "\t\t\t5 = { add_dynamic_modifier = { modifier = TST_mod } }",                // 10 effect, dynamic modifier  → read_unguarded
  "\t\t\t6 = { remove_dynamic_modifier = { modifier = TST_mod } }",             // 11 effect, dynamic modifier  → read_unguarded
  "\t\t\t4 = { add_core_of = ROOT }",                                            // 12 effect                    → script_state_missing
  "\t\t\t6 = { set_variable = { TST_x = 1 } }",                                  // 13 a variable: guarded       → nothing
  "\t\t\t5 = { if = { limit = { is_claimed_by = ROOT } } add_claim_by = ROOT }",  // 14 effect, a check inside it → check_unguarded
  "\t\t\t2 = { add_dynamic_modifier = { modifier = TST_mod } }",                // 15 live state                → nothing
  "\t\t}",
  "\t}",
  "}",
  "",
];
const RAIDS = "TST_raids = {\n\tvisible = { 7 = { is_core_of = ROOT } }\n\tcost = 7.TST_cost\n}\n";        // the game's own dead id 7 (1348's shape)
// ⛔ #a-dynamic-modifier-through-a-scripted-effect — the modifier one call away (and two), and a check one call away. No state id in
// the file, so only reading common/scripted_effects in full finds them.
const EFFECTS = [
  "TST_dm_effect = {",
  "\tif = { limit = { always = yes } add_dynamic_modifier = { modifier = TST_mod } }",
  "}",
  "TST_calls_dm = {",
  "\tTST_dm_effect = yes",
  "}",
  "TST_asks_core = {",
  "\tif = { limit = { is_core_of = ROOT } add_claim_by = ROOT }",
  "}",
  "TST_plain_effect = {",
  "\tadd_core_of = ROOT",
  "}",
  "",
].join("\n");
const FOCUS = [
  "focus_tree = {",
  "\tid = tst_tree",
  "\tfocus = {",
  "\t\tid = TST_f",
  "\t\tcompletion_reward = {",
  "\t\t\t5 = { TST_dm_effect = yes }",                                                                     // 6  scripted effect → read
  "\t\t\t6 = { TST_calls_dm = yes }",                                                                      // 7  two calls away → read
  "\t\t\t4 = { TST_asks_core = yes }",                                                                     // 8  a check one call away → check
  "\t\t\t5 = { TST_plain_effect = yes }",                                                                  // 9  CONTROL: plain → missing
  "\t\t\t4 = { random_list = { 50 = { add_dynamic_modifier = { modifier = TST_mod } } 50 = { } } }",     // 10 under a weight → read
  "\t\t\t6 = { while_loop_effect = { limit = { always = no } remove_dynamic_modifier = { modifier = TST_mod } } }", // 11 a loop → read
  "\t\t\t5 = { for_each_scope_loop = { array = global.tst add_dynamic_modifier = { modifier = TST_mod } } }",   // 12 CONTROL: changes scope → missing
  "\t\t}",
  "\t\tbypass_effect = {",
  "\t\t\t4 = { add_dynamic_modifier = { modifier = TST_mod } }",                                          // 15 bypass_effect → read
  "\t\t\t6 = { add_core_of = ROOT }",                                                                      // 16 bypass_effect, plain → missing
  "\t\t}",
  "\t}",
  "}",
  "",
];
const MINE = [                                                                    // the mod's own file, naming ids no layer ever had
  "namespace = mine",
  "country_event = {",
  "\tid = mine.1",
  "\ttrigger = { 8 = { is_core_of = ROOT } }",                                    // 4 check of a never-state  → check_unguarded
  "\toption = { name = mine.1.a set_variable = { TST_y = 9.TST_cost } }",          // 5 read of a never-state   → read_unguarded
  "}",
  "",
].join("\n");

const stateFile = (id) => `state = {\n\tid = ${id}\n\tname = "S${id}"\n\tmanpower = 100\n\tprovinces = { ${id} }\n\thistory = { owner = AAA }\n}\n`;
const GAME = tmp("game");
for (const id of [1, 2, 3, 4, 5, 6]) mk(path.join(GAME, "history", "states", `${id}-S${id}.txt`), stateFile(id));
mk(path.join(GAME, "common", "decisions", "TST.txt"), DECISIONS.join("\n"));
mk(path.join(GAME, "common", "decisions", "raids.txt"), RAIDS);
mk(path.join(GAME, "common", "scripted_effects", "tst_effects.txt"), EFFECTS);
mk(path.join(GAME, "common", "national_focus", "tst.txt"), FOCUS.join("\n"));
function makeMod(keep, own = true) {
  const m = tmp("mod");
  mk(path.join(m, "descriptor.mod"), `name="dead read fixture"\n${keep.length < 6 ? 'replace_path="history/states"\n' : ""}`);
  if (keep.length < 6) for (const id of keep) mk(path.join(m, "history", "states", `${id}-S${id}.txt`), stateFile(id));
  if (own) mk(path.join(m, "events", "mine.txt"), MINE);
  return m;
}
const ctx = (modRoot, deps = []) => ({ modRoot, gameRoot: GAME, dependencyRoots: deps });
const RULES = ["script_state_read_unguarded", "script_state_check_unguarded", "script_state_missing"];
const rowsFor = (c) => (md.validateMapModel(md.buildMapModel(c)) || []).filter((p) => RULES.includes(p.rule));
const at = (row, file) => ((row || {}).items || []).filter((i) => i.file === file).map((i) => `${i.line}:${i.stateId}:${i.kind}`).sort();
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const F = "common/national_focus/tst.txt";

try {
  const MOD = makeMod([1, 2, 3]);
  const rows = rowsFor(ctx(MOD));
  const by = Object.fromEntries(rows.map((r) => [r.rule, r]));
  const miss = by.script_state_missing || {};
  console.log("=== the split ===");
  rec("THE CONTROL: the shrunken world has all three rules, one row each", rows.length === 3 && RULES.every((x) => by[x]), rows.map((r) => r.rule));
  rec("⭐⭐⭐ script_state_read_unguarded: the explicit read (line 3) and both dynamic modifiers (10, 11) of the decision — and nothing else of it",
    same(at(by.script_state_read_unguarded, "common/decisions/TST.txt"), ["10:5:effect", "11:6:effect", "3:5:read"]), at(by.script_state_read_unguarded, "common/decisions/TST.txt"));
  rec("⭐⭐⭐ script_state_check_unguarded: is_core_of in 4's scope (line 5), and is_claimed_by inside an effect on 5 (line 14)",
    same(at(by.script_state_check_unguarded, "common/decisions/TST.txt"), ["14:5:effect", "5:4:check"]), at(by.script_state_check_unguarded, "common/decisions/TST.txt"));
  rec("⭐⭐⭐ both stop Save, and say what HOI4 does: the read crashed launches, the check is read from the code",
    labels.isFatalRule("script_state_read_unguarded") && labels.isFatalRule("script_state_check_unguarded") && !labels.isFatalRule("script_state_missing")
    && labels.fatalOutcome("script_state_read_unguarded") === "crashes" && labels.fatalOutcome("script_state_check_unguarded") === "untested"
    && rows.every((r) => r.severity === "error"));
  rec("⭐⭐⭐ add_core_of on a state the map below had is an error, not FATAL: it looks its state up and returns",
    same(at(miss, "common/decisions/TST.txt"), ["12:4:effect"]), at(miss, "common/decisions/TST.txt"));
  rec("⭐⭐⭐ the game's own dead id 7 (1348's shape) — a LOWER layer's file naming an id no layer had: an error, never FATAL",
    same(at(miss, "common/decisions/raids.txt"), ["2:7:check", "3:7:read"])
    && !at(by.script_state_read_unguarded, "common/decisions/raids.txt").length && !at(by.script_state_check_unguarded, "common/decisions/raids.txt").length,
    { miss: at(miss, "common/decisions/raids.txt") });
  rec("⭐⭐⭐ #a-variable-of-a-missing-state-is-guarded: has_variable (6) and set_variable (13) in a dead scope are in no rule",
    !rows.some((r) => (r.items || []).some((i) => i.file === "common/decisions/TST.txt" && (i.line === 6 || i.line === 13))), rows.flatMap((r) => r.items));
  rec("⭐⭐ the guarded trigger (7) and the live state's modifier (15) are in no rule",
    !rows.some((r) => (r.items || []).some((i) => i.file === "common/decisions/TST.txt" && (i.line === 7 || i.line === 15))));

  console.log("\n=== #a-mods-own-read-of-a-state-no-layer-has ===");
  rec("⭐⭐⭐ the mod's OWN file reading 9 — a state no layer ever had — stops Save as TEST 23's read did: the branch faults on any id out of range",
    same(at(by.script_state_read_unguarded, "events/mine.txt"), ["5:9:read"]), { read: at(by.script_state_read_unguarded, "events/mine.txt"), miss: at(miss, "events/mine.txt") });
  rec("⭐⭐⭐ …and its is_core_of of 8 is a check that stops Save too",
    same(at(by.script_state_check_unguarded, "events/mine.txt"), ["4:8:check"]) && !at(miss, "events/mine.txt").length, at(by.script_state_check_unguarded, "events/mine.txt"));

  console.log("\n=== #a-dynamic-modifier-through-a-scripted-effect ===");
  const readF = at(by.script_state_read_unguarded, F), readsAt = (...keys) => keys.every((k) => readF.includes(k));
  rec("⭐⭐⭐ a dynamic modifier one scripted effect away (6) is a read", readsAt("6:5:effect"), readF);
  rec("⭐⭐⭐ …and two scripted effects away (7)", readsAt("7:6:effect"), readF);
  rec("⭐⭐⭐ …and under a random_list weight (10)", readsAt("10:4:effect"), readF);
  rec("⭐⭐⭐ …and in a loop that keeps the scope (11)", readsAt("11:6:effect"), readF);
  rec("⭐⭐⭐ …and in a focus's bypass_effect (15), which no rule saw at all", readsAt("15:4:effect"), readF);
  rec("⭐⭐ …and the focus has no other read", same(readF, ["10:4:effect", "11:6:effect", "15:4:effect", "6:5:effect", "7:6:effect"]), readF);
  rec("⭐⭐⭐ is_core_of one scripted effect away (8) is a check", same(at(by.script_state_check_unguarded, F), ["8:4:effect"]), at(by.script_state_check_unguarded, F));
  rec("⭐⭐⭐ THE CONTROLS: a scripted effect that only adds a core (9), the modifier under for_each_scope_loop — which changes scope (12) — and add_core_of in a bypass_effect (16) stay errors",
    same(at(miss, F), ["12:5:effect", "16:6:effect", "9:5:effect"]), at(miss, F));
  rec("⭐⭐ the totals: 9 reads, 4 checks, 6 errors", by.script_state_read_unguarded.total === 9 && by.script_state_check_unguarded.total === 4 && miss.total === 6,
    rows.map((r) => [r.rule, r.total]));

  console.log("\n=== what each says ===");
  const rm = (by.script_state_read_unguarded || {}).message || "", cm = (by.script_state_check_unguarded || {}).message || "", mm = miss.message || "";
  rec("⭐⭐ the read row says HOI4 crashed on these and Save stops; the check row says no launch has fired one",
    /HOI4 has crashed on these, so Save stops/.test(rm) && /add_dynamic_modifier/.test(rm) && /no launch has yet fired one/.test(cm), { rm: rm.slice(0, 300), cm: cm.slice(0, 300) });
  rec("⭐⭐ both FATAL rows say which of theirs are in the mod's own files, naming a state no layer has; the error row says its reads are a lower layer's",
    /or is in your mod's own files \(1 of them, naming a state no layer below has either\)/.test(rm) && /or is in your mod's own files \(1 of them/.test(cm)
    && /in files your mod does not ship/.test(mm), { rm: rm.slice(0, 600), mm: mm.slice(0, 500) });
  const claimsAddCore = (s) => /add_core_of[^.;]*(crash|what crashed)/i.test(s);
  rec("⭐⭐⭐ nothing says add_core_of crashed — not a message, a hint, nor a label",
    ![rm, cm, mm, ...RULES.map(labels.mapRuleFixHint), ...RULES.map(labels.mapRuleLabel)].some(claimsAddCore)
    && /add_core_of looks the state up and does nothing/.test(mm), RULES.map(labels.mapRuleFixHint).filter(claimsAddCore));
  rec("⭐⭐ nothing says a variable of a missing state is unchecked", ![rm, cm, mm, ...RULES.map(labels.mapRuleFixHint)].some((s) => /variable[^.]*(without checking|unchecked|never checks)/i.test(s)));
  rec("⭐⭐ the fix hints say a mod's own files count and a scripted effect does",
    /any state at all in your mod's own files/.test(labels.mapRuleFixHint("script_state_read_unguarded")) && /by a scripted effect it calls/.test(labels.mapRuleFixHint("script_state_read_unguarded"))
    && /in a file your mod does not ship/.test(labels.mapRuleFixHint("script_state_missing")));
  {
    const raw = ["map-data.js", "public/map-rule-labels.js"].map((f) => fs.readFileSync(path.join(__dirname, f), "utf8")).join("\n");
    rec("⭐⭐ the wrong resolver address (0x541DC0) is gone, comments included; the fault's own two are named",
      !/541DC0/i.test(raw) && /0x140589BAF/.test(raw) && /0x140589930/.test(raw));
  }

  console.log("\n=== where it is silent ===");
  {
    const v = (md.validateMapModel(md.buildMapModel({ modRoot: null, gameRoot: GAME, dependencyRoots: [] })) || []).filter((p) => RULES.includes(p.rule));
    rec("⭐⭐⭐ the base game itself: its own dead id 7 never stops Save", !v.some((p) => labels.isFatalRule(p.rule)), v.map((p) => [p.rule, p.total]));
  }
  rec("⭐⭐⭐ a world that kept every state: nothing", rowsFor(ctx(makeMod([1, 2, 3, 4, 5, 6], false))).filter((r) => r.rule !== "script_state_missing" || at(r, "common/decisions/TST.txt").length).length === 0);
  {
    const ADD = tmp("addon");
    mk(path.join(ADD, "descriptor.mod"), 'name="addon"\n');
    rec("⭐⭐ an add-on over the shrunken world is not blamed for what its dependency broke", rowsFor(ctx(ADD, [makeMod([1, 2, 3], false)])).length === 0);
  }

  console.log("\n=== Auto-fix ===");
  const r = md.fixScriptStateRefs(ctx(MOD));
  const after = rowsFor(ctx(MOD));
  rec("⭐⭐⭐ one Auto-fix neutralises all nineteen, and no rule speaks again", r.fixed === 19 && after.length === 0, { fixed: r.fixed, byKind: r.byKind, after: after.map((x) => [x.rule, x.total]) });
  const D = fs.readFileSync(path.join(MOD, "common", "decisions", "TST.txt"), "utf8").split("\n");
  rec("⭐⭐⭐ the dynamic modifiers are commented out, the variable ops left exactly as they were",
    D.some((l) => l.startsWith("#\t\t\t5 = { add_dynamic_modifier = { modifier = TST_mod } }    # Nova: state 5"))
    && D.some((l) => l.startsWith("#\t\t\t6 = { remove_dynamic_modifier = { modifier = TST_mod } }    # Nova: state 6"))
    && D.includes(DECISIONS[5]) && D.includes(DECISIONS[12]) && D.includes(DECISIONS[14]), D.slice(2, 18));
  const FO = fs.readFileSync(path.join(MOD, ...F.split("/")), "utf8").split("\n");
  rec("⭐⭐ …and the focus's blocks on a missing state with them, the bypass_effect's included — every other line as it was",
    FO.length === FOCUS.length && FO.every((l, i) => l === FOCUS[i] || (l.startsWith("#" + FOCUS[i]) && /# Nova: state [456]/.test(l)))
    && FO.filter((l, i) => l !== FOCUS[i]).length === 9, FO.filter((l, i) => l !== FOCUS[i]));
} finally {
  for (const d of tmps) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} }
}

console.log(`\n=== a dead-state read stops Save: ${pass + fails.length} checks, ${fails.length} failed ===`);
if (fails.length) { console.log("FAILED: " + fails.join(" | ")); process.exit(1); }
