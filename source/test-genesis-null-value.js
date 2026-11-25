// Robustness: the Genesis "plain English" preview updates on every keystroke, so it routinely sees
// half-typed effects like "add_political_power = " (no value yet). The signed-number formatters
// (flat/pct) used to render a null/missing value as the literal word "null" — "Political power null"
// flashing mid-type. They must instead drop a blank value (returning "") while still passing a real
// non-numeric token (a variable name) straight through. Display-only — Genesis never rewrites script.
"use strict";
const G = require("./public/genesis-engine.js");

let pass = 0, fail = 0;
const check = (n, c, e) => { if (c) { pass++; console.log("  PASS", n); } else { fail++; console.log("  FAIL", n, e !== undefined ? "→ " + JSON.stringify(e) : ""); } };
const tr = (s) => G.translate(s);

// --- The reported glitch: empty value must NOT print "null". ---
check('add_political_power with empty value → no "null"', !/\bnull\b/.test(tr("add_political_power = ")), tr("add_political_power = "));
check('add_political_power empty → "Political power" (clean)', tr("add_political_power = ") === "Political power", tr("add_political_power = "));
check('pct path empty value → no "null"', !/\bnull\b/.test(tr("add_political_power_gain = ")), tr("add_political_power_gain = "));
check('set_variable empty value → no "null"/"undefined"', !/\b(null|undefined)\b/.test(tr("set_variable = { x = }")), tr("set_variable = { x = }"));

// --- A real non-numeric token (variable name) must STILL pass through, not be blanked. ---
check("flat passes a non-numeric token through (abc)", tr("add_political_power = abc") === "Political power abc", tr("add_political_power = abc"));

// --- Regression: real numbers format exactly as before (signed). ---
check('integer value unchanged ("+50")', tr("add_political_power = 50") === "Political power +50", tr("add_political_power = 50"));
check('negative value unchanged ("-25")', tr("add_political_power = -25") === "Political power -25", tr("add_political_power = -25"));
check('percent value unchanged ("+5%")', tr("add_stability = 0.05") === "Stability +5%", tr("add_stability = 0.05"));

// --- Broad sweep: no half-typed numeric effect should ever surface the literal "null"/"undefined". ---
const halfTyped = [
  "add_political_power = ", "add_stability = ", "add_war_support = ", "add_manpower = ",
  "add_political_power_gain = ", "set_variable = { v = }", "add_to_variable = { v = }",
];
const leaked = halfTyped.filter((e) => /\b(null|undefined)\b/.test(tr(e)));
check("no half-typed effect prints null/undefined", leaked.length === 0, leaked.map((e) => [e, tr(e)]));

console.log(`\nGENESIS-NULL-VALUE TEST: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
