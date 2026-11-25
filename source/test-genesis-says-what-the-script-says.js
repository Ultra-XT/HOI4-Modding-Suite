// #trigger-if-drops-its-own-condition — GENESIS TOLD MODDERS THE OPPOSITE OF WHAT THEY WROTE.
//
// Genesis exists so a non-programmer can read a focus, a spirit or a decision back as a sentence instead
// of a wall of tokens. That makes its accuracy safety-critical in an unusual way: a wrong rendering does
// not crash and does not fail a test. It states something false in fluent English, the modder believes it,
// and ships. There is no symptom except a person being confidently misled.
//
// Two causes, both found by rendering real vanilla and Millennium Dawn script through the real module.
//
// 1. `if` / `else_if` / `else` inside a CONDITION field deleted the condition.
//
//      IN : if = { limit = { NOT = { has_government = fascism } } has_autonomy_state = autonomy_dominion }
//      OUT: "If: is Autonomy Dominion"
//
//    The guard vanished — the NOT with it — and its payload was promoted to an unconditional requirement.
//    renderTrigger had branches for limit, tooltip, not, and, or, count_triggers, all_of and any_of, but
//    none for the conditionals, so they fell to the generic block fallback, which renders the body and
//    drops `limit` to "" because that line is marked "handled by parent" — and for an `if` there was no
//    parent. Vanilla's australia.txt uses two such branches back to back, so the focus read as demanding
//    Dominion AND Satellite status simultaneously, which is impossible.
//
//    The EFFECT renderer had handled this correctly all along, via renderIf. The trigger renderer never
//    adopted it — the same shape as most defects found in this codebase.
//
// 2. Boolean triggers ignored their own yes/no.
//
//      has_civil_war = no   ->  "is in a civil war"
//      has_civil_war = yes  ->  "is in a civil war"
//
//    Identical output for opposite inputs, from a zero-argument arrow that never read s.value — while its
//    siblings has_war and is_subject read it correctly. `has_civil_war = no` is how people write "only
//    while this country is stable", and it rendered as the exact reverse.
//
// These assertions run the REAL module over REAL script, so they cannot pass by agreeing with a
// paraphrase of the implementation.
"use strict";

const path = require("path");
const genesis = require(path.join(__dirname, "public", "genesis-engine.js"));

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  const shown = detail == null ? "" : "   " + (typeof detail === "string" ? detail : JSON.stringify(detail));
  console.log((ok ? "  ok   " : "  FAIL ") + label + shown);
  if (!ok) fails.push(label);
};
const T = (s) => String(genesis.translateTriggers(s) || "");
const E = (s) => String(genesis.translate(s) || "");

try {
  console.log("\n1. A conditional keeps its condition");
  // Verbatim from vanilla common/national_focus/australia.txt, focus AST_sever_ties_with_uk.
  const australia =
    'if = { limit = { NOT = { has_government = fascism } } has_autonomy_state = autonomy_dominion } ' +
    'if = { limit = { has_government = fascism } has_autonomy_state = autonomy_satellite }';
  const au = T(australia);
  rec("the guard survives — both branches say what they depend on",
    /if not .*fascist.*then.*dominion/i.test(au) && /if is fascist.*then.*satellite/i.test(au), au);
  // The specific harm: without the condition these read as simultaneous requirements.
  rec("…so it no longer reads as requiring both at once", !/^If: .*;\s*If: /.test(au), au);
  // The NOT inside the limit is the part that inverts meaning, so pin it separately.
  rec("a NOT inside the limit is not silently dropped", /not/i.test(au.split(",")[0]), au.split(",")[0]);

  console.log("\n2. else is a fallback, not another requirement");
  const el = T('if = { limit = { has_dlc = "La Resistance" } has_war = yes } else = { has_civil_war = yes }');
  rec("else renders as the alternative", /otherwise/i.test(el), el);
  rec("…and not as a second hard requirement", !/^If: /.test(el), el);

  console.log("\n2b. else_if is exclusive with the branch before it");
  // #else-if-reads-as-a-second-if — renderIf serves both `if` and `else_if` and used the same word for
  // each, so a chain of mutually exclusive branches read as though every one of them applied. Same harm as
  // the trigger-side `if`, in the other renderer.
  const chain = E("if = { limit = { has_war = yes } add_stability = 0.1 } else_if = { limit = { has_civil_war = yes } add_stability = 0.2 } else = { add_stability = -0.1 }");
  rec("else_if reads as an alternative, not a second requirement", /otherwise if/i.test(chain), chain);
  rec("…and the chain still ends in a plain otherwise", /otherwise:/i.test(chain), chain);
  // CONTROL: a lone `if` must not become "Otherwise if".
  rec("CONTROL: a plain if is untouched", /^If is at war, then/.test(E("if = { limit = { has_war = yes } add_stability = 0.1 }")),
    E("if = { limit = { has_war = yes } add_stability = 0.1 }"));

  console.log("\n3. Boolean triggers read their own value");
  // The bug in one line: these two produced identical text.
  const no = T("has_civil_war = no"), yes = T("has_civil_war = yes");
  rec("has_civil_war = no and = yes no longer render identically", no !== yes, { no, yes });
  rec("has_civil_war = no reads as the negative", /not in a civil war/i.test(no), no);
  rec("has_civil_war = yes still reads as the positive", /is in a civil war/i.test(yes) && !/not/i.test(yes), yes);
  const ind = T("is_independent = no");
  rec("is_independent = no is not rendered as independent", !/^is independent/i.test(ind), ind);
  const gt = T("has_government_transition = no");
  rec("has_government_transition = no reads as the negative", /not undergoing/i.test(gt), gt);

  console.log("\n4. A threshold is not discarded");
  // "> 20" and "> 90" used to read the same, which is a different way of saying nothing.
  const t20 = T("has_added_tension_amount > 20"), t90 = T("has_added_tension_amount > 90");
  rec("two different tension thresholds read differently", t20 !== t90, { t20, t90 });
  rec("…and the number survives", /20/.test(t20) && /90/.test(t90), { t20, t90 });

  console.log("\n5. A delayed event does not read as an immediate one");
  // #event-delay-dropped — only the field literally named `days` was read, so "fires six hours later" and
  // "fires now" rendered identically. news_event and state_event looked for no delay at all.
  const now = E("country_event = { id = now.1 }");
  const hrs = E("country_event = { id = a.1 hours = 6 }");
  rec("an hours delay is stated", /6 hours/.test(hrs), hrs);
  rec("…and is distinguishable from no delay at all", hrs !== now, { hrs, now });
  rec("one hour is singular", /\b1 hour\b/.test(E("country_event = { id = a.1 hours = 1 }")), E("country_event = { id = a.1 hours = 1 }"));
  // random_* is an upper bound, not a point, so it must not read like a fixed wait.
  const rnd = E("country_event = { id = a.1 random_days = 10 }");
  rec("a random delay reads as a range", /within 10 days/.test(rnd), rnd);
  rec("a fixed and a random delay together keep both", /5 days.*10 days/.test(E("country_event = { id = a.1 days = 5 random_days = 10 }")),
    E("country_event = { id = a.1 days = 5 random_days = 10 }"));
  // These two read no delay whatsoever before.
  rec("news_event states its delay", /4 hours/.test(E("news_event = { id = n.1 hours = 4 }")), E("news_event = { id = n.1 hours = 4 }"));
  rec("state_event states its delay", /12 hours/.test(E("state_event = { id = s.1 random_hours = 12 }")), E("state_event = { id = s.1 random_hours = 12 }"));
  // CONTROL: an event with no delay must still read as immediate, or the fix has over-corrected.
  rec("CONTROL: an undelayed event gains no phantom delay", !/\(in |\(within /.test(now), now);

  console.log("\n6. check_variable's long form is read as itself, not as the shorthand");
  // #check-variable-long-form — HOI4 accepts two spellings, and the long one was parsed as if it were the
  // short one: `tokenize(...).find(x => x.value !== null)` picks `var = my_var`, so the variable was named
  // "Var", its own name was printed where the value belongs, and the threshold and direction vanished.
  const cvGt = T("check_variable = { var = my_var value = 5 compare = greater_than }");
  rec("the variable is named, not the word \"var\"", /my var/i.test(cvGt) && !/\bvar\b\s*=/i.test(cvGt), cvGt);
  rec("…the threshold survives", /5/.test(cvGt), cvGt);
  rec("…and the direction is stated", />/.test(cvGt), cvGt);
  // The harm in one line: two opposite comparisons used to render identically.
  const cvLt = T("check_variable = { var = treasury value = 100 compare = less_than }");
  rec("greater_than and less_than no longer read the same", cvGt !== cvLt && /</.test(cvLt), { cvGt, cvLt });
  rec("equals renders as equality", /=/.test(T("check_variable = { var = x value = 3 compare = equals }")),
    T("check_variable = { var = x value = 3 compare = equals }"));
  // CONTROL: the shorthand always worked and must keep working — it is why this went unnoticed.
  rec("CONTROL: the shorthand form is unchanged", /my var/i.test(T("check_variable = { my_var > 5 }")) && />/.test(T("check_variable = { my_var > 5 }")),
    T("check_variable = { my_var > 5 }"));

  console.log("\n7. all_of, any_of and count_triggers mean three different things");
  // #count-triggers-reads-as-a-list — these shared one branch that flattened them to a comma list, so
  // three different requirements produced the same sentence.
  const allOf = T("all_of = { has_war = yes has_civil_war = yes }");
  const anyOf = T("any_of = { has_war = yes has_civil_war = yes }");
  // The dangerous one: "at least one of" used to read exactly like "all of".
  rec("any_of no longer reads identically to all_of", allOf !== anyOf, { allOf, anyOf });
  rec("all_of reads as a conjunction", /\band\b/.test(allOf), allOf);
  rec("any_of reads as a disjunction", /\bor\b/.test(anyOf), anyOf);
  const ct = T("count_triggers = { amount = 2 has_war = yes has_civil_war = no }");
  rec("count_triggers states how many are needed", /at least 2/.test(ct), ct);
  // `amount` is not one of the conditions; listing it invented a requirement and hid the real rule.
  rec("…and does not list the amount as a condition", !/amount is/i.test(ct), ct);
  rec("…while still naming the conditions", /at war/.test(ct) && /civil war/.test(ct), ct);
  // CONTROL: the operators these were made to match must be untouched.
  rec("CONTROL: AND and OR still read as before",
    /\band\b/.test(T("AND = { has_war = yes has_civil_war = yes }")) &&
    /\bor\b/.test(T("OR = { has_war = yes has_civil_war = yes }")));

  console.log("\n8. An effect states its odds, and a loop states its condition");
  // #random-states-its-odds — `chance` was rendered through the EFFECT path, so it appeared as
  // "Chance: +50" as though it were something that happens to a country, and the real likelihood was
  // flattened to the word "Possibly" — identical for a 5% chance and a 95% one.
  const r5 = E("random = { chance = 5 add_stability = 0.1 }");
  const r95 = E("random = { chance = 95 add_stability = 0.1 }");
  rec("a 5% chance and a 95% chance no longer read the same", r5 !== r95, { r5, r95 });
  rec("the odds are stated as odds", /5% chance/.test(r5) && /95% chance/.test(r95), { r5, r95 });
  rec("…and chance is not listed as an effect", !/chance: \+/i.test(r5), r5);
  rec("a random with a limit keeps both", /30% chance if is at war/.test(E("random = { chance = 30 limit = { has_war = yes } add_stability = 0.1 }")),
    E("random = { chance = 30 limit = { has_war = yes } add_stability = 0.1 }"));
  // CONTROL: no chance given must still read as before, not as "undefined% chance".
  rec("CONTROL: a random with no chance still reads Possibly", /^Possibly:/.test(E("random = { add_stability = 0.1 }")),
    E("random = { add_stability = 0.1 }"));

  // #while-loop-drops-its-condition — renderBlockBody separates the limit and the caller discarded it, so
  // "repeat while at war" and "repeat forever" read identically. One of those is alarming; the other is not.
  const wl = E("while_loop_effect = { limit = { has_war = yes } add_stability = 0.1 }");
  rec("a loop states the condition it runs under", /while is at war/i.test(wl), wl);
  rec("CONTROL: a loop with no condition still reads Repeat", /^Repeat:/.test(E("while_loop_effect = { add_stability = 0.1 }")),
    E("while_loop_effect = { add_stability = 0.1 }"));

  console.log("\n9. A random outcome's condition is a condition, not an effect");
  // #random-list-outcome-conditions — an outcome's `trigger` decides whether it is possible at all, and
  // `modifier` reweights how likely it is. Both went through the EFFECT path, producing "Trigger: Has War"
  // as though it were something that happens — and "Has War" rather than "is at war", because the trigger
  // never reached the trigger renderer and so was humanised as a bare key instead of described.
  const rlT = E("random_list = { 50 = { trigger = { has_war = yes } add_stability = 0.1 } 50 = { add_political_power = 5 } }");
  rec("an outcome's trigger reads as a condition", /only if/.test(rlT), rlT);
  rec("…and is described, not just humanised", /is at war/.test(rlT) && !/Trigger: Has War/.test(rlT), rlT);
  const rlM = E("random_list = { 50 = { modifier = { factor = 2 has_war = yes } add_stability = 0.1 } 50 = { add_political_power = 5 } }");
  rec("a weight modifier reads as a likelihood", /as likely/.test(rlM), rlM);
  rec("…and not as an effect that happens", !/Modifier: Factor/.test(rlM), rlM);
  // CONTROL: a plain outcome must be untouched by any of this.
  rec("CONTROL: a plain outcome is unchanged",
    E("random_list = { 50 = { add_stability = 0.1 } 50 = { add_political_power = 5 } }") ===
    "Randomly one of: (Stability +10%) or (Political power +5)",
    E("random_list = { 50 = { add_stability = 0.1 } 50 = { add_political_power = 5 } }"));

  console.log("\n10. The effect renderer's conditional, which was right all along, still is");
  // This is the sibling the trigger fix was modelled on. If it regresses, the reference is gone and this
  // test should say so rather than quietly measuring a copy of something that no longer works.
  const eff = E("if = { limit = { has_government = fascism } add_stability = 0.1 }");
  rec("effects still render their conditional", /if is fascist/i.test(eff) && /then/i.test(eff), eff);

  console.log("\n11. The checks can fail (composed here, not assumed)");
  // Guards against a green run produced by assertions that stopped matching anything.
  rec("the old dropped-condition shape would be rejected", /^If: .*;\s*If: /.test("If: is Autonomy Dominion; If: is Autonomy Satellite"));
  rec("the old identical-output shape would be rejected", !("is in a civil war" !== "is in a civil war"));

  console.log(`\n=== genesis says what the script says: ${checks} checks, ${fails.length} failed ===`);
  if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
} catch (e) {
  console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
  process.exitCode = 1;
}
