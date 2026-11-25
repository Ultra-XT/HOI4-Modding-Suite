// ⛔ #an-empty-inherited-state-is-told-a-step-it-can-take — WHAT NOVA SAYS ABOUT AN EMPTY STATE THE MOD INHERITS (final round, L1).
//
// A state a layer below the mod defines (the base game or a dependency, the mod not replacing history/states) cannot be deleted:
// deleteState refuses it, since the mod's copy would just stop overriding and the original would come back, so 🔧 Auto-fix all leaves
// it (fixEmptyStates hands the refusal on). And no Map tool gives an empty state a province: the two-click Move needs a province of the
// destination, and only + New state's fill adds into a state, a new one. Four places said otherwise:
//   * the validator's empty_state row: "Auto-fix removes the empty state and closes the id gap";
//   * its siblings empty_state_with_content / empty_capital_state: "… or delete the state";
//   * the Save gate's "🛠 Fix it yourself" hint for empty_state: "Give it at least one province with the Move-province tool";
//   * the page's inheritedEmptyWarning (Move and Erase): "Move a province into it";
// and deleteState's refusal, which Auto-fix's line shows after its reload, named "↶ Undo the edit that emptied it" — no step by then: an
// empty state on disk is past a Save, and Auto-fix reloads the map; both clear the page's Undo (markSaveBoundary, load).
//
// Probe (scratchpad final/left/probe-L1.js, the page's own requests on a fresh vanilla 1.20 add-on with an emptied copy of 337-Faroe
// Islands.txt): exit 1 at ba18d96c, exit 0 with the fix. This test asks the same of a synthetic two-layer world, so it runs anywhere.
"use strict";
const fs = require("fs"), os = require("os"), path = require("path");
const md = require("./map-data.js");
const { maskJsComments } = require("./testlib-strip-comments.js");

let pass = 0, total = 0;
const fails = [];
const ok = (n, c, x) => { total++; if (c) { pass++; console.log("  ok  " + n); } else { fails.push(n); console.error("  FAIL " + n + (x !== undefined ? " -> " + JSON.stringify(x).slice(0, 600) : "")); } };

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-empty-inherited-"));
const mk = (f, t) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, t, "utf8"); };
const state = (id, owner, provs, extra = "") => `state = {\n\tid = ${id}\n\tname = "STATE_${id}"\n\tmanpower = 1000\n\tstate_category = rural\n`
  + `\thistory = {\n\t\towner = ${owner}\n${extra}\t}\n\tprovinces = { ${provs.join(" ")} }\n}\n`;
// The "base game": state 7 (BAS's capital), 8 (BAS's other land), 9 (no capital), 10 (no capital, with buildings).
const BASE = path.join(ROOT, "base");
mk(path.join(BASE, "history", "states", "7-Seven.txt"), state(7, "BAS", [700, 701]));
mk(path.join(BASE, "history", "states", "8-Eight.txt"), state(8, "BAS", [800]));
mk(path.join(BASE, "history", "states", "9-Nine.txt"), state(9, "BAS", [900, 901]));
mk(path.join(BASE, "history", "states", "10-Ten.txt"), state(10, "BAS", [1000], "\t\tbuildings = { infrastructure = 2 }\n\t\tvictory_points = { 1000 1 }\n"));
mk(path.join(BASE, "history", "countries", "BAS - Base.txt"), "capital = 7\n");
// The mod: an emptied copy of each of 7, 9 and 10 (what an older Nova's Move, or a hand edit, left), their provinces in state 8, and
// two states of its OWN emptied the same way (the controls: those Auto-fix does delete).
const MOD = path.join(ROOT, "mod");
mk(path.join(MOD, "descriptor.mod"), 'name="EI"\nsupported_version="1.20.*"\n');
mk(path.join(MOD, "history", "states", "7-Seven.txt"), state(7, "BAS", []));
mk(path.join(MOD, "history", "states", "8-Eight.txt"), state(8, "BAS", [800, 700, 701, 900, 901, 1000]));
mk(path.join(MOD, "history", "states", "9-Nine.txt"), state(9, "BAS", []));
mk(path.join(MOD, "history", "states", "10-Ten.txt"), state(10, "BAS", [], "\t\tbuildings = { infrastructure = 2 }\n\t\tvictory_points = { 1000 1 }\n"));
mk(path.join(MOD, "history", "states", "11-Own.txt"), state(11, "BAS", []));
mk(path.join(MOD, "history", "states", "12-OwnBuilt.txt"), state(12, "BAS", [], "\t\tbuildings = { infrastructure = 2 }\n"));

const model = md.buildMapModel({ modRoot: MOD, gameRoot: BASE, dependencyRoots: [], cacheStableLayers: false });
const rows = md.validateMapModel(model) || [];
const rowOf = (id) => rows.find((p) => p && /^empty_/.test(p.rule || "") && +p.stateId === id) || null;
const r7 = rowOf(7), r9 = rowOf(9), r10 = rowOf(10), r11 = rowOf(11), r12 = rowOf(12);
ok("precondition: the five emptied states are reported, each by its own rule",
  r7 && r7.rule === "empty_capital_state" && r9 && r9.rule === "empty_state" && r10 && r10.rule === "empty_state_with_content"
  && r11 && r11.rule === "empty_state" && r12 && r12.rule === "empty_state_with_content", rows.filter((p) => /^empty_/.test(p.rule || "")).map((p) => [p.rule, p.stateId]));

console.log("\n-- the validator's rows for an EMPTY INHERITED state name what can clear it --");
const STEPS = /Neither 🔧 Auto-fix all nor Delete state can remove it: deleting your copy would just bring the original back, with its own provinces and buildings\. No Map tool gives an empty state a province: 🛟 Restore baseline in Map Errors to one saved before it was emptied\. By hand: list one of its provinces again in history\/states\//;
for (const [r, file, below] of [[r9, "9-Nine.txt", "900, 901"], [r10, "10-Ten.txt", "1000"], [r7, "7-Seven.txt", "700, 701"]]) {
  const m = String((r && r.message) || "");
  ok(`⭐ ${r && r.rule} (state ${r && r.stateId}) says it comes from below, and that neither Auto-fix nor Delete state removes it`,
    /It comes from the base game or a dependency, and this mod doesn't replace history\/states\./.test(m) && STEPS.test(m), m);
  ok(`⭐ …and names its file and the provinces the layer beneath gives it`,
    m.includes(`history/states/${file} (the file beneath your mod gives it ${below}) and take that province out of the state that holds it now.`), m);
  ok(`…and promises nothing it cannot do: no "Auto-fix removes", no "or delete the state", no "↶ Undo"`,
    !/Auto-fix removes the empty state/.test(m) && !/or delete the state\./.test(m) && !/↶ Undo/.test(m), m);
}
console.log("\n-- CONTROL: a state the mod itself defines keeps its words (Auto-fix does delete it) --");
ok("a mod-owned empty state: \"Auto-fix removes the empty state and closes the id gap.\"",
  /A state must own at least one province\. Auto-fix removes the empty state and closes the id gap\.$/.test(String(r11 && r11.message)) && !/base game or a dependency/.test(String(r11 && r11.message)), r11);
ok("a mod-owned empty state with content: \"… or delete the state.\"",
  /Give it a province, remove the buildings\/VP, or delete the state\.$/.test(String(r12 && r12.message)) && !/base game or a dependency/.test(String(r12 && r12.message)), r12);

console.log("\n-- what Auto-fix does with them, and the reason it gives, agree with the rows --");
const fixed = md.fixEmptyStates({ modRoot: MOD, gameRoot: BASE, dependencyRoots: [] });
const skip9 = (fixed.skipped || []).find((s) => s.id === 9), skip10 = (fixed.skipped || []).find((s) => s.id === 10);
ok("Auto-fix leaves both inherited empty states, and deletes the two of the mod's own",
  skip9 && skip10 && !(fixed.deleted || []).includes(9) && !(fixed.deleted || []).includes(10)
  && (fixed.deleted || []).includes(11) && (fixed.deleted || []).includes(12), fixed);
const why = String((skip9 && skip9.reason) || "");
ok("⭐ its reason names no ↶ Undo (the reload after Auto-fix has cleared it) and the same steps as the row",
  !/↶ Undo/.test(why) && STEPS.test(why) && why.includes("history/states/9-Nine.txt (the file beneath your mod gives it 900, 901)"), why);
const tail = (s) => s.slice(s.indexOf("Neither 🔧 Auto-fix all"));
ok("⭐ …word for word: the reason and the row end in one sentence", why.indexOf("Neither") > 0 && tail(why) === tail(String(r9.message)), [tail(why), tail(String(r9.message))]);
const MD = maskJsComments(fs.readFileSync(path.join(__dirname, "map-data.js"), "utf8"));
ok("…from one builder both call (emptyInheritedStateSteps): deleteState once, the validator once",
  (MD.match(/emptyInheritedStateSteps\(copy\.file, below\)/g) || []).length === 1
  && (MD.match(/emptyInheritedStateSteps\(st\.file, emptyStatesBelow\.get\(\+st\.id\)\)/g) || []).length === 1);
ok("…and the validator asks the flag the page asks (inBaseLayer), only where the mod can inherit",
  /const inheritedSteps = !\(modCanInherit && st\.inBaseLayer\) \? null :/.test(MD));
ok("…and every one of the three rows carries it", (MD.match(/\$\{inheritedSteps \|\| " /g) || []).length === 3);

console.log("\n-- the Save gate's hints and the page's click words --");
const ML = require("./public/map-rule-labels.js");
const hint = (r) => String(ML.mapRuleFixHint(r) || "");
ok("⭐ empty_state's hint sends nobody to the Move-province tool, and says no Map tool gives an empty state a province",
  !/Move-province tool/.test(hint("empty_state")) && /no Map tool gives an empty state a province/.test(hint("empty_state")), hint("empty_state"));
ok("…and says Auto-fix deletes one the mod defines", /If your mod defines it, “Auto-fix all” deletes it\./.test(hint("empty_state")), hint("empty_state"));
for (const r of ["empty_state", "empty_state_with_content", "empty_capital_state"]) {
  ok(`⭐ ${r}'s hint says one from the base game or a dependency cannot be deleted, and how to give it a province back`,
    /One from the base game or a dependency cannot be deleted/.test(hint(r)) && /give it a province back: with 🛟 Restore baseline to a baseline saved before it was emptied, or by hand in its history\/states file\./.test(hint(r)), hint(r));
}
const MAPJS = maskJsComments(fs.readFileSync(path.join(__dirname, "public", "map.js"), "utf8"));
const at = MAPJS.indexOf("function inheritedEmptyWarning(");
const body = at >= 0 ? MAPJS.slice(at, MAPJS.indexOf("\n  }", at) + 4) : "";
ok("precondition: the page's warning is found (one shared builder)", at >= 0 && body.length > 40 && MAPJS.indexOf("function inheritedEmptyWarning(", at + 1) < 0);
const warn = body ? new Function(body + "\nreturn inheritedEmptyWarning;")()([{ id: 9, name: "STATE_9", displayName: "Nine" }], (s) => s.displayName) : "";
ok("⭐ the click's warning sends nobody to move a province into it, and names the click's Undo",
  !/Move a province into/.test(warn) && /No Map tool gives an empty state a province, so press Undo\./.test(warn), warn);
ok("…and still says where it comes from (\"the base game or a dependency\")", /comes from the base game or a dependency/.test(warn), warn);

try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
console.log(`\n=== an empty inherited state is told what can clear it: ${pass}/${total} checks ===`);
fails.forEach((f) => console.log("   FAILED: " + f));
process.exit(pass === total && total >= 20 ? 0 : 1);
