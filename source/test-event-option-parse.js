// parseEventOptionScript turns a raw `option = { name = X  <effects> }` block into the clean effect
// script the Event Maker shows in its option textarea: it drops the option's own `name =` (first
// occurrence only) and removes one level of the writer's indentation, preserving braces + nested blocks
// exactly. test-event-option-roundtrip.js exercises it through a full save; this locks the parser's
// behavior directly. Asserts ROBUST properties (name removed / effects + nested content kept / braces
// balanced), not exact whitespace — the indentation interplay is intentionally not over-specified.
"use strict";
const { parseEventOptionScript } = require("./server.js");

let pass = 0, fail = 0;
const check = (n, c, e) => { if (c) { pass++; console.log("  PASS", n); } else { fail++; console.log("  FAIL", n, e != null ? "→ " + JSON.stringify(e) : ""); } };
const balanced = (s) => { let d = 0; for (const c of s) { if (c === "{") d++; else if (c === "}") { d--; if (d < 0) return false; } } return d === 0; };

// --- basic: option name dropped, effects kept ---
const basic = parseEventOptionScript("\toption = {\n\t\tname = nfd_events.1.a\n\t\tadd_political_power = 50\n\t\tadd_stability = 0.05\n\t}");
check("option name line is dropped", !/\bname\s*=/.test(basic), basic);
check("first effect survives", /add_political_power\s*=\s*50/.test(basic), basic);
check("second effect survives", /add_stability\s*=\s*0\.05/.test(basic), basic);
check("the option's loc-key value is gone", !/nfd_events\.1\.a/.test(basic), basic);

// --- no braces → empty ---
check("no braces → empty string", parseEventOptionScript("not an option block") === "", parseEventOptionScript("not an option block"));
check("empty input → empty string", parseEventOptionScript("") === "");

// --- only a name, no effects → empty (after trim) ---
check("name-only option → empty script", parseEventOptionScript("option = {\n\t\tname = my.1.a\n\t}") === "", JSON.stringify(parseEventOptionScript("option = {\n\t\tname = my.1.a\n\t}")));

// --- nested block + its content preserved, braces intact, only the OPTION name removed ---
const nested = parseEventOptionScript(
  "option = {\n\t\tname = my.1.a\n\t\tset_politics = {\n\t\t\truling_party = fascism\n\t\t\telections_allowed = no\n\t\t}\n\t\tadd_popularity = { ideology = fascism popularity = 0.2 }\n\t}");
check("nested block stays brace-balanced", balanced(nested), nested);
check("nested block content preserved (ruling_party)", /ruling_party\s*=\s*fascism/.test(nested), nested);
check("nested block content preserved (add_popularity)", /add_popularity\s*=\s*\{[^}]*ideology\s*=\s*fascism/.test(nested), nested);
check("option name removed even with nested blocks present", !/my\.1\.a/.test(nested), nested);

// --- a nested (quoted) `name = "..."` inside an effect is NOT stripped (only the first option name) ---
const leader = parseEventOptionScript(
  "option = {\n\t\tname = my.1.b\n\t\tcreate_country_leader = {\n\t\t\tname = \"Jean Leblanc\"\n\t\t\tideology = despotism\n\t\t}\n\t}");
check("nested quoted name survives", /name\s*=\s*"Jean Leblanc"/.test(leader), leader);
check("option name (my.1.b) still removed", !/my\.1\.b/.test(leader), leader);
check("leader block brace-balanced", balanced(leader), leader);

console.log(`\nEVENT-OPTION-PARSE TEST: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
