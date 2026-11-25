// test-genesis-common-effects.js
// Locks in the high-frequency effects/triggers that previously fell back to raw title-case
// ("Add Idea: …", "Instant Build", etc.). These are the most common script tokens across vanilla +
// Millennium Dawn, so a regression here degrades every maker's plain-English preview at once.
//
// Run: node test-genesis-common-effects.js
const G = require("./public/genesis-engine.js");
let pass = 0, fail = 0;
const eq = (code, expect, kind) => {
  const out = (kind === "trigger" ? G.translateTriggers(code) : G.translate(code));
  if (out === expect) { pass++; console.log("  PASS " + code + "  =>  " + out); }
  else { fail++; console.log("  FAIL " + code + "\n       got:    " + JSON.stringify(out) + "\n       expect: " + JSON.stringify(expect)); }
};

console.log("\nGenesis common effects/triggers:");
// singular idea effects (were missing — only the plurals existed)
eq("add_idea = nova_spirit", "Gain national spirit: Nova Spirit");
eq("remove_idea = nova_spirit", "Remove national spirit: Nova Spirit");
// the timed block form that used to render as "Add Idea: Idea: X; Days: +N"
eq("add_idea = { idea = nova_spirit days = 30 }", "Gain national spirit: Nova Spirit for 30 days");
// construction / units / territory
eq("instant_build = yes", "Instantly finish all current construction");
eq("transfer_state_to = SOV", "Give this state to Soviet Union");
eq('create_unit = { division = "name=x location = 64" owner = SOV }', "Deploy a division for Soviet Union in state 64");
// triggers
eq("has_trait = scavenger", "has the trait Scavenger", "trigger");
eq("is_in_array = { array = global.x value = THIS }", "the list Global.x contains this country", "trigger");

// regression guard: the plural/national-spirit forms still work
eq("add_ideas = nova_spirit", "Gain national spirit: Nova Spirit");
eq("swap_ideas = { remove_idea = old_one add_idea = new_one }", "Replace Old One with New One");

console.log("\n  " + pass + " passed, " + fail + " failed");
process.exitCode = fail ? 1 : 0;
