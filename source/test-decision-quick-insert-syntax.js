// #quick-insert-writes-effects-into-triggers — the "+ Spirit / + Tech / + Event / + Decision" chips wrote
// EFFECT script into whichever box they were opened for, including boxes that hold conditions or modifiers.
//
// All 12 chips routed to one picker that hard-coded a single syntax per entity type:
//   spirit -> add_ideas = X      tech -> set_technology = { X = 1 }
//   event  -> country_event = X  decision -> activate_decision = X
//
// Those are correct only in the Effect box. The chips also sit above "Available Trigger" (which holds
// CONDITIONS — has_idea, has_tech, has_country_flag) and above "Modifier" (which holds MODIFIERS such as
// political_power_gain = 0.05). So 8 of the 12 buttons produced script that is invalid where it landed, Save
// accepted it, and the mod shipped things like `available = { activate_decision = … }`.
//
// Chips exist on exactly three boxes — decisionAvailable, decisionEffect, decisionModifier — so 4 were always
// right and 8 were always wrong.
//
// Now the syntax depends on the box. Where a meaningful form exists it is used; where none does, the chip
// says why instead of inserting something wrong. Notably HOI4 has no "has this event fired" trigger — the
// idiom is a country flag set by the event — and Nova cannot invent a flag name, so that one explains itself.
"use strict";
const fs = require("fs"), path = require("path");

let pass = 0, total = 0;
const ok = (n, c, x) => { total++; if (c) { pass++; console.log("  ok  " + n); } else console.error("  FAIL " + n + (x !== undefined ? " -> " + JSON.stringify(x) : "")); };

const src = fs.readFileSync(path.join(__dirname, "public", "decisions.js"), "utf8");
const grab = (name) => {
  const start = src.indexOf(`function ${name}(`);
  if (start === -1) return "";
  let d = 0;
  for (let i = src.indexOf("{", start); i < src.length; i++) {
    if (src[i] === "{") d++;
    else if (src[i] === "}") { d--; if (d === 0) return src.slice(start, i + 1); }
  }
  return "";
};
const fns = ["decisionBoxKind", "quickInsertSyntaxFor", "quickInsertWhyNot"].map(grab).join("\n\n");
ok("the quick-insert helpers exist", /quickInsertSyntaxFor/.test(fns) && /decisionBoxKind/.test(fns), fns.slice(0, 120));
// eslint-disable-next-line no-new-func
const { quickInsertSyntaxFor, quickInsertWhyNot, decisionBoxKind } =
  new Function(`${fns}\nreturn { quickInsertSyntaxFor, quickInsertWhyNot, decisionBoxKind };`)();

// The three boxes that actually carry chips, taken from the markup rather than assumed.
const html = fs.readFileSync(path.join(__dirname, "public", "decisions.html"), "utf8");
const targets = [...new Set([...html.matchAll(/data-target="([^"]+)"/g)].map((m) => m[1]))].sort();
ok("chips sit on exactly the three known boxes",
  JSON.stringify(targets) === JSON.stringify(["decisionAvailable", "decisionEffect", "decisionModifier"]), targets);

// ── the Effect box keeps working exactly as before ────────────────────────────────────────────────
ok("effect + spirit", quickInsertSyntaxFor("spirit", "decisionEffect", "my_spirit") === "add_ideas = my_spirit");
ok("effect + tech", /set_technology = \{\n\tmy_tech = 1\n\}/.test(quickInsertSyntaxFor("tech", "decisionEffect", "my_tech")));
ok("effect + event", quickInsertSyntaxFor("event", "decisionEffect", "ns.1") === "country_event = ns.1");
ok("effect + decision", quickInsertSyntaxFor("decision", "decisionEffect", "my_dec") === "activate_decision = my_dec");

// ── the Available box now gets CONDITIONS ─────────────────────────────────────────────────────────
ok("available + spirit becomes has_idea", quickInsertSyntaxFor("spirit", "decisionAvailable", "my_spirit") === "has_idea = my_spirit",
  quickInsertSyntaxFor("spirit", "decisionAvailable", "my_spirit"));
ok("available + tech becomes has_tech", quickInsertSyntaxFor("tech", "decisionAvailable", "my_tech") === "has_tech = my_tech",
  quickInsertSyntaxFor("tech", "decisionAvailable", "my_tech"));
ok("available + decision becomes has_decision", quickInsertSyntaxFor("decision", "decisionAvailable", "my_dec") === "has_decision = my_dec",
  quickInsertSyntaxFor("decision", "decisionAvailable", "my_dec"));
ok("…and none of them emits an effect any more",
  ["spirit", "tech", "decision"].every((t) => !/add_ideas|set_technology|activate_decision|country_event/.test(quickInsertSyntaxFor(t, "decisionAvailable", "x"))),
  ["spirit", "tech", "decision"].map((t) => quickInsertSyntaxFor(t, "decisionAvailable", "x")));

// ── the two combinations with no valid form must refuse, not guess ────────────────────────────────
ok("available + event inserts nothing", quickInsertSyntaxFor("event", "decisionAvailable", "ns.1") === "",
  quickInsertSyntaxFor("event", "decisionAvailable", "ns.1"));
ok("…and explains the country-flag idiom instead",
  /has_country_flag/.test(quickInsertWhyNot("event", "decisionAvailable")), quickInsertWhyNot("event", "decisionAvailable"));

for (const t of ["spirit", "tech", "event", "decision"]) {
  ok(`modifier + ${t} inserts nothing`, quickInsertSyntaxFor(t, "decisionModifier", "x") === "",
    quickInsertSyntaxFor(t, "decisionModifier", "x"));
}
ok("…and the modifier message says what that box is for",
  /political_power_gain/.test(quickInsertWhyNot("spirit", "decisionModifier")), quickInsertWhyNot("spirit", "decisionModifier"));

// ── box classification ────────────────────────────────────────────────────────────────────────────
ok("cancel/remove/target trigger boxes count as triggers",
  ["decisionCancelTrigger", "decisionRemoveTrigger", "decisionTargetRootTrigger"].every((id) => decisionBoxKind(id) === "trigger"),
  ["decisionCancelTrigger", "decisionRemoveTrigger", "decisionTargetRootTrigger"].map(decisionBoxKind));
ok("the effect boxes count as effects",
  ["decisionEffect", "decisionRemoveEffect", "decisionCancelEffect"].every((id) => decisionBoxKind(id) === "effect"),
  ["decisionEffect", "decisionRemoveEffect", "decisionCancelEffect"].map(decisionBoxKind));
ok("an unknown box keeps the old effect behaviour rather than refusing",
  decisionBoxKind("somethingNew") === "effect", decisionBoxKind("somethingNew"));

console.log("\ntest-decision-quick-insert-syntax: " + pass + "/" + total + " checks passed");
process.exitCode = pass === total && total >= 18 ? 0 : 1;
