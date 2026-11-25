// Genesis trigger translation (GenesisEngine.translateTriggers) — powers the "plain English"
// preview under condition fields (available / visible / allowed) in the makers.
// Mirrors the effect-translation path but renders TRIGGERS instead of EFFECTS, so phrasings read
// like conditions ("has completed the focus X; war support > +60%") not effects.
//
// Run:  node test-genesis-triggers.js
// Exit: 0 = all green, 1 = a phrasing regressed.
const G = require("./public/genesis-engine.js");

let pass = 0, fail = 0;
function eq(input, expected) {
  const got = G.translateTriggers(input);
  if (got === expected) { pass++; console.log("  ✓ " + JSON.stringify(input) + " -> " + JSON.stringify(got)); }
  else { fail++; console.error("  ✗ FAIL " + JSON.stringify(input) + "\n      expected " + JSON.stringify(expected) + "\n      got      " + JSON.stringify(got)); }
}
function has(input, needle) {
  const got = G.translateTriggers(input);
  if (got.indexOf(needle) !== -1) { pass++; console.log("  ✓ " + JSON.stringify(input) + " contains " + JSON.stringify(needle)); }
  else { fail++; console.error("  ✗ FAIL " + JSON.stringify(input) + " should contain " + JSON.stringify(needle) + "\n      got " + JSON.stringify(got)); }
}

console.log("[api]");
(function () {
  const ok = typeof G.translateTriggers === "function";
  if (ok) { pass++; console.log("  ✓ translateTriggers is exported"); }
  else { fail++; console.error("  ✗ FAIL translateTriggers not exported"); }
})();

console.log("\n[empty / guards]");
eq("", "");
eq("   ", "");
eq(null, "");
eq(undefined, "");

console.log("\n[always — the most common condition default]");
eq("always = yes", "always");
eq("always = no", "never");

console.log("\n[single conditions]");
eq("has_completed_focus = GER_rhineland", "has completed the focus Rhineland");
eq("tag = GER", "is Germany");
eq("is_major = yes", "is a major power");
eq("has_war = no", "is at peace");

console.log("\n[multiple conditions join with '; ' (implicit AND)]");
eq("has_government = fascism\nis_major = yes", "is Fascist; is a major power");
has("original_tag = FRA\nhas_idea = my_spirit", "was originally France");
has("original_tag = FRA\nhas_idea = my_spirit", "has the national spirit My Spirit");

console.log("\n[boolean logic wrappers]");
eq("NOT = { has_country_flag = reform_done }", "not (has the flag “Reform Done”)");
eq("OR = { has_war = yes threat > 0.3 }", "(is at war or world tension > +30%)");

console.log("\n[numeric comparisons keep the operator]");
has("has_war_support > 0.6", "war support > ");
has("controls_state = 64", "controls state 64");

console.log("\n[unknown custom triggers degrade to a readable title-case, never crash]");
has("some_custom_unknown_trigger = yes", "some custom unknown trigger");

console.log("\n[a wrapping { } block is unwrapped like translate()]");
eq("{ always = yes }", "always");

console.log("\n[display-only tooltip noise is dropped in trigger context]");
eq("tooltip = SOME_KEY", "");
eq("has_war = yes\ntooltip = NOISE\nhas_stability > 0.4", "is at war; stability > +40%");
// custom_trigger_tooltip / custom_override_tooltip just wrap real conditions — render those, drop the wrapper + tooltip
eq("custom_trigger_tooltip = { tooltip = TT has_war = no has_stability > 0.5 }", "is at peace, stability > +50%");
eq("custom_override_tooltip = { tooltip = X has_completed_focus = GER_x }", "has completed the focus X");

console.log("\n[data-mined diplomacy/war/leader conditions (were rendering 'X is Y')]");
eq("is_neighbor_of = GER", "borders Germany");
eq("has_border_war_with = CHI", "is in a border war with China");
eq("has_wargoal_against = SOV", "has a war goal against Soviet Union");
eq("is_guaranteed_by = ENG", "is guaranteed by United Kingdom");
eq("has_doctrine = mobile_warfare", "has the doctrine Mobile Warfare");
eq("has_country_leader_with_trait = warmonger", "the country leader has the trait Warmonger");
eq("is_special_project_completed = nuclear_bomb", "the special project Nuclear Bomb is completed");
eq("is_in_tech_sharing_group = axis_research", "is in the tech-sharing group Axis Research");

console.log("\n[sub-block comparison triggers must not emit 'null' (scalar + block forms)]");
eq("strength_ratio = { tag = GER ratio > 0.75 }", "strength ratio vs Germany > 0.75");
eq("strength_ratio > 0.5", "strength ratio > 0.5");
eq("focus_progress = { focus = GER_x progress > 0.5 }", "progress on the focus X > 0.5");
eq("focus_progress > 0.5", "focus progress > 0.5");
eq("has_war_together_with = ENG", "is at war alongside United Kingdom");
eq("has_autonomy_state = autonomy_dominion", "is Autonomy Dominion");

console.log("\n[unknown boolean conditions read as plain clauses, not 'X is Yes/No']");
eq("has_resistance = yes", "has resistance");
eq("has_resistance = no", "not has resistance");
eq("is_on_continent = south_america\nhas_resistance = yes", "is on the continent South America; has resistance");

console.log("\n[clean phrasings for flat comparison triggers]");
eq("controls_province = 1234", "controls province 1234");
eq("command_power > 50", "command power > 50");
eq("amount_research_slots > 3", "research slots > 3");

console.log("\n[data-mined base-game conditions (verified vs real vanilla syntax)]");
eq("has_country_leader = { character = DEN_thorvald_stauning ruling_only = no }", "Thorvald Stauning is the country leader");
eq("has_equipment = { infantry_equipment > 1500 }", "stockpile of Infantry Equipment > 1500");
eq("has_army_manpower = { size > 99999 }", "army manpower > 99999");
eq("has_navy_size = { unit = destroyer size > 10 }", "Destroyer count > 10");
eq("divisions_in_state = { size > 0 state = 64 }", "divisions in state 64 > 0");
eq("strength_ratio > 0.5", "strength ratio > 0.5");
eq("has_political_power > 150", "political power > 150");
eq("has_legitimacy > 50", "legitimacy > 50");
eq("num_subjects > 0", "number of subjects > 0");
eq("has_active_mission = BUL_impending_zveno_coup", "the mission Impending Zveno Coup is active");
eq("has_variable = FIN_white_death_target_country", "the variable White Death Target Country is set");
eq("has_subject = SOV", "has Soviet Union as a subject");
eq("is_puppet = yes", "is a puppet");
eq("is_government_in_exile = yes", "is a government-in-exile");
eq("has_defensive_war = yes", "is in a defensive war");
eq("is_ally_with = ROOT", "is allied with this country");
eq("is_coastal = yes", "is coastal");
eq("is_capital = no", "is not the capital");

console.log("\n[any_* existence scopes]");
eq("any_other_country = { is_major = yes }", "any other country: is a major power");
has("any_allied_country = { has_war = yes }", "any ally");

console.log("\n[hidden_trigger unwraps; highlight_* display fields drop]");
eq('hidden_trigger = { has_dlc = "Waking the Tiger" }', 'the "Waking the Tiger" DLC is active');
eq("highlight_state_targets = { state = 64 }", "");
eq("has_war = yes\nhighlight_states_trigger = { x = yes }", "is at war");

console.log("\n[scripted_triggers resolve to English (simple bodies only)]");
G.setScriptedTriggers({
  my_avail_trigger: "has_completed_focus = GER_anschluss\nhas_war_support > 0.5",
  my_param_trigger: "has_manpower > $X$",
});
eq("my_avail_trigger = yes", "has completed the focus Anschluss, war support > +50%");
// parameterised ($X$) bodies are not safe to inline -> falls back to the plain-clause phrasing
eq("my_param_trigger = yes", "my param trigger");
// a negated call must NOT resolve the body positively -> falls back ("not <clause>")
eq("my_avail_trigger = no", "not my avail trigger");
// unknown (unregistered) -> plain clause, not "X is Yes"
eq("totally_unknown_trigger = yes", "totally unknown trigger");
G.setScriptedTriggers({});

console.log("\n========================================");
console.log("  " + pass + " passed, " + fail + " failed");
console.log("========================================");
process.exit(fail > 0 ? 1 : 0);
