// reindentPdxStatement(text, tabs) re-homes an extracted PDX block to a target tab depth: it trims the
// first line, strips the common leading indent from the rest, and prepends `tabs` tabs — preserving the
// block's RELATIVE nesting. Every maker's round-trip preservation re-indents salvaged blocks through it
// (decision/event/equipment preserve tests use it incidentally); this locks its behavior directly so a
// regression there can't silently mangle indentation in re-saved files.
"use strict";
const { reindentPdxStatement } = require("./server.js");

let pass = 0, fail = 0;
const check = (n, c, e) => { if (c) { pass++; console.log("  PASS", n); } else { fail++; console.log("  FAIL", n, e != null ? "→ " + JSON.stringify(e) : ""); } };
const L = (s) => JSON.stringify(s);

// --- single line: trimmed + padded to `tabs` tabs ---
check("single line padded to 2 tabs", reindentPdxStatement("priority = 100", 2) === "\t\tpriority = 100", reindentPdxStatement("priority = 100", 2));
check("single line: leading whitespace is trimmed", reindentPdxStatement("    priority = 100", 1) === "\tpriority = 100", reindentPdxStatement("    priority = 100", 1));
check("tabs=0 → no pad (just trimmed)", reindentPdxStatement("\t\tfoo = bar", 0) === "foo = bar", reindentPdxStatement("\t\tfoo = bar", 0));
check("negative tabs clamp to 0", reindentPdxStatement("x = y", -3) === "x = y", reindentPdxStatement("x = y", -3));

// --- a real decision block: shift to 2 tabs, keep relative nesting ---
const block = [
  "my_dec = {",
  "\ticon = GFX_decision_generic",
  "\tcomplete_effect = {",
  "\t\tadd_political_power = 50",
  "\t}",
  "}",
].join("\n");
const out = reindentPdxStatement(block, 2).split("\n");
check("block first line at 2 tabs", out[0] === "\t\tmy_dec = {", out[0]);
check("block icon line at 3 tabs (relative +1)", out[1] === "\t\t\ticon = GFX_decision_generic", out[1]);
check("nested effect value at 4 tabs (relative +2)", out[3] === "\t\t\t\tadd_political_power = 50", out[3]);
check("block closing brace back at 2 tabs", out[5] === "\t\t}", out[5]);
check("re-indent is brace-balanced", (() => { let d = 0; for (const c of out.join("\n")) { if (c === "{") d++; else if (c === "}") { d--; if (d < 0) return false; } } return d === 0; })());

// --- blank interior lines become empty (not padded) ---
const withBlank = reindentPdxStatement("a = {\n\tx = 1\n\n\ty = 2\n}", 1).split("\n");
check("interior blank line stays empty", withBlank[2] === "", L(withBlank[2]));
check("line after blank still indented", withBlank[3] === "\t\ty = 2", withBlank[3]);

// --- CRLF input: \r is stripped, no stray carriage returns ---
const crlf = reindentPdxStatement("a = {\r\n\tx = 1\r\n}", 0);
check("CRLF stripped (no \\r in output)", !/\r/.test(crlf), L(crlf));
check("CRLF block reindents to 0 tabs correctly", crlf === "a = {\n\tx = 1\n}", L(crlf));

// --- idempotent at its own depth: a block already at depth 0 stays put ---
const flat = "a = {\n\tx = 1\n}";
check("reindent to 0 is idempotent for a 0-depth block", reindentPdxStatement(flat, 0) === flat, L(reindentPdxStatement(flat, 0)));

console.log(`\nREINDENT-PDX TEST: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
