// Genesis "plain English" preview: set_variable is an ASSIGNMENT, not a delta, so it must read
// "Set variable X to N" — not "Set variable X by +N", which is contradictory and reads like
// add_to_variable. This locks the set-vs-delta wording: set uses "to" + an unsigned value, while the
// delta verbs (add/subtract/scale) keep "by" + a signed value. Display-only — the engine never
// rewrites the saved script. (Genesis is browser-loaded but module.exports the same api for node.)
"use strict";
const G = require("./public/genesis-engine.js");

let pass = 0, fail = 0;
const check = (n, c, e) => { if (c) { pass++; console.log("  PASS", n); } else { fail++; console.log("  FAIL", n, e !== undefined ? "→ " + JSON.stringify(e) : ""); } };
const tr = (s) => G.translate(s);

// --- set_variable: assignment phrasing ("to", unsigned). ---
check('set_variable integer → "to 100" (not "by +100")', tr("set_variable = { treasury = 100 }") === "Set variable Treasury to 100", tr("set_variable = { treasury = 100 }"));
check("set_variable result contains no contradictory 'by +'", !/\bby \+/.test(tr("set_variable = { treasury = 100 }")), tr("set_variable = { treasury = 100 }"));
check('set_variable fraction → unsigned percent "to 50%"', tr("set_variable = { ratio = 0.5 }") === "Set variable Ratio to 50%", tr("set_variable = { ratio = 0.5 }"));
check('set_variable to a token → "to Token Y"', tr("set_variable = { x = token_y }") === "Set variable X to Token Y", tr("set_variable = { x = token_y }"));
check('set_variable negative keeps the minus → "to -5"', tr("set_variable = { x = -5 }") === "Set variable X to -5", tr("set_variable = { x = -5 }"));

// --- Delta verbs unchanged: "by" + signed value (regression guard — the fix is scoped to set). ---
check('add_to_variable still "Increase … by +50"', tr("add_to_variable = { treasury = 50 }") === "Increase variable Treasury by +50", tr("add_to_variable = { treasury = 50 }"));
check('subtract_from_variable still "Decrease … by +25"', tr("subtract_from_variable = { treasury = 25 }") === "Decrease variable Treasury by +25", tr("subtract_from_variable = { treasury = 25 }"));
check('multiply_variable still "Scale … by +2"', tr("multiply_variable = { treasury = 2 }") === "Scale variable Treasury by +2", tr("multiply_variable = { treasury = 2 }"));

// --- Sanity: a couple of unrelated effects still translate (the shared helpers weren't broken). ---
check("add_political_power unaffected", tr("add_political_power = 50") === "Political power +50", tr("add_political_power = 50"));
check("set_stability unaffected", tr("add_stability = 0.05") === "Stability +5%", tr("add_stability = 0.05"));

console.log(`\nGENESIS-SET-VARIABLE TEST: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
