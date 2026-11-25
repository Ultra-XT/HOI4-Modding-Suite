// Regression for the event-option round-trip bug: the old reader filtered out EVERY bare "}" line,
// silently dropping the closing brace of any nested block inside an option (ai_chance, country_event =
// { id days }, hidden_effect, …). Editing an existing event and re-saving then produced unbalanced
// braces and corrupted the file. parseEventOptionScript must preserve nested blocks verbatim.
const { parseEventOptionScript } = require("./server.js");

let pass = 0, fail = 0;
const check = (n, c, e) => { if (c) { pass++; console.log("  PASS", n); } else { fail++; console.log("  FAIL", n, e != null ? "→ " + e : ""); } };
const braces = (s) => { let d = 0; for (const c of s) { if (c === "{") d++; else if (c === "}") { d--; if (d < 0) return -1; } } return d; };

// Mirror the server's option writer exactly (server.js /api/events/save): name first, then each script
// line indented with two leading tabs, wrapped in `\toption = { ... \t}`.
function writeOption(name, script) {
  let s = `\toption = {\n\t\tname = ${name}\n`;
  if (script) s += script.split("\n").map((l) => `\t\t${l}`).join("\n") + "\n";
  s += `\t}`;
  return s;
}
const roundTrip = (name, script) => parseEventOptionScript(writeOption(name, script));

// 1. Flat script round-trips unchanged.
check("flat script round-trips unchanged", roundTrip("opt_a", "add_political_power = 50") === "add_political_power = 50", JSON.stringify(roundTrip("opt_a", "add_political_power = 50")));

// 2. Nested ai_chance block keeps its closing brace (the core bug).
const aiScript = "ai_chance = {\n\tfactor = 1\n}";
const aiOut = roundTrip("opt_ai", aiScript);
check("nested ai_chance block is preserved (braces balanced)", braces(aiOut) === 0 && /ai_chance = \{/.test(aiOut) && /\}/.test(aiOut), JSON.stringify(aiOut));
check("nested ai_chance round-trips identically", aiOut === aiScript, JSON.stringify(aiOut));

// 3. country_event = { id days } (event-chain link) survives — the exact narrative-chain case.
const chainScript = "country_event = {\n\tid = greece.2\n\tdays = 3\n}";
const chainOut = roundTrip("opt_chain", chainScript);
check("country_event chain link is preserved (braces balanced)", braces(chainOut) === 0, JSON.stringify(chainOut));
check("country_event chain link round-trips identically", chainOut === chainScript, JSON.stringify(chainOut));

// 4. Multiple effects + a nested block together.
const mixScript = "add_political_power = 25\nset_country_flag = my_flag\nhidden_effect = {\n\tnews_event = greece.9\n}";
const mixOut = roundTrip("opt_mix", mixScript);
check("mixed flat + nested effects round-trip identically", mixOut === mixScript, JSON.stringify(mixOut));
check("mixed effects keep balanced braces", braces(mixOut) === 0, JSON.stringify(mixOut));

// 5. Empty script (option with only a name) yields empty, not garbage.
check("name-only option yields empty script", roundTrip("opt_empty", "") === "", JSON.stringify(roundTrip("opt_empty", "")));

// 6. Demonstrate the OLD parser would have corrupted case 2 (sanity that the test is meaningful).
const oldParse = (optBlock) => optBlock.split(/\r?\n/).map((l) => l.trim())
  .filter((l) => l && !l.startsWith("option") && !l.startsWith("name") && l !== "{" && l !== "}").join("\n");
check("(sanity) the OLD parser DID drop the nested closing brace", braces(oldParse(writeOption("opt_ai", aiScript))) !== 0, "old parser unexpectedly balanced");

console.log(`\nEVENT-OPTION-ROUNDTRIP TEST: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
