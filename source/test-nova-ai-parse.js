// Tests for the shared robust AI JSON parser (public/nova-ai-parse.js).
// Loads the IIFE under a fake window, then exercises the failure shapes that broke the
// old `JSON.parse(cleaned)` path on complex requests.
const fs = require("fs"), path = require("path"), vm = require("vm");

const src = fs.readFileSync(path.join(__dirname, "public", "nova-ai-parse.js"), "utf8");
const sandbox = { window: {} };
vm.runInNewContext(src, sandbox);
const { parseJsonResponse } = sandbox.window.NovaAI;

let fail = 0;
function ok(label, cond, extra) {
  if (cond) console.log("PASS " + label);
  else { fail++; console.log("FAIL " + label + (extra !== undefined ? "  -> " + JSON.stringify(extra) : "")); }
}
function parsesTo(label, raw, check) {
  try { const o = parseJsonResponse(raw); ok(label, check(o), o); }
  catch (e) { ok(label + " (threw: " + e.message + ")", false); }
}
function throwsFriendly(label, raw) {
  try { parseJsonResponse(raw); ok(label + " (did NOT throw)", false); }
  catch (e) { ok(label, !/unexpected token|JSON\.parse|position \d/i.test(e.message), e.message); }
}

// Clean object
parsesTo("plain JSON object", '{"id":"x","cost":"50"}', o => o.id === "x" && o.cost === "50");

// Fenced json
parsesTo("```json fenced", '```json\n{"id":"a","name":"Test"}\n```', o => o.id === "a" && o.name === "Test");

// Leading chatter (the classic complex-request failure)
parsesTo("leading chatter before object",
  'Sure! Here is your decision:\n{"id":"war_economy","cost":"75"}', o => o.id === "war_economy");

// Trailing chatter
parsesTo("trailing chatter after object",
  '{"id":"a","effect":"add_political_power = 50"}\nLet me know if you want changes!', o => o.id === "a");

// Trailing comma (very common model slip)
parsesTo("trailing comma before brace",
  '{"id":"a","cost":"50",}', o => o.id === "a" && o.cost === "50");

// Effect value contains braces and = (must not confuse the extractor)
parsesTo("braces inside a string value",
  '{"id":"x","effect":"if = { limit = { has_war = no } add_stability = 0.1 }"}',
  o => /add_stability/.test(o.effect));

// Fenced + chatter + trailing comma combined
parsesTo("fenced + chatter + trailing comma",
  'Here you go:\n```json\n{"id":"z","name":"Z","cost":"10",}\n```\nDone.',
  o => o.id === "z" && o.cost === "10");

// Truncated object -> friendly error, not cryptic
throwsFriendly("truncated object -> friendly error", '{"id":"x","effect":"add_pol');

// Pure chatter, no object -> friendly error
throwsFriendly("no JSON at all -> friendly error", 'I cannot help with that request.');

// Empty -> friendly error
throwsFriendly("empty -> friendly error", '   ');

console.log(fail === 0 ? "\nALL PASS" : "\n" + fail + " FAILURE(S)");
process.exit(fail ? 1 : 0);
