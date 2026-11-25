// test-ai-prompt-trim.js — the AI cost-trim: pure-text field requests (needsScript:false) must
// drop the heavy script guidance (cheat sheet + tech categories + command vocab); everything else
// (default/undefined, or true) keeps it. Guards the token-cost saving + back-compat.
const { aiScriptGuidance } = require("./server.js");

let failed = 0;
function ok(cond, msg) { if (cond) console.log("  ok  " + msg); else { console.error("  FAIL " + msg); failed++; } }

const TC = "TECHCAT_MARKER";
const VB = "VOCAB_MARKER";

// needsScript === false → empty (text fields skip all guidance)
ok(aiScriptGuidance(false, TC, VB) === "", "needsScript:false drops ALL script guidance");

// default (undefined) → full guidance kept (back-compat: every existing caller is unaffected)
const def = aiScriptGuidance(undefined, TC, VB);
ok(def.includes("HOI4 SCRIPT SYNTAX RULES"), "default keeps the syntax cheat sheet");
ok(def.includes(TC), "default keeps the tech-category rule");
ok(def.includes(VB), "default keeps the command vocab");

// explicit true → same as default
const yes = aiScriptGuidance(true, TC, VB);
ok(yes.includes("HOI4 SCRIPT SYNTAX RULES") && yes.includes(TC) && yes.includes(VB), "needsScript:true keeps full guidance");

// the saving is real: text-field guidance is dramatically smaller than script-field guidance
ok(aiScriptGuidance(false, TC, VB).length < def.length - 1000, "text guidance is far smaller (real saving)");

// tolerant of missing pieces (no crash if techCatRule/vocab absent)
ok(typeof aiScriptGuidance(true) === "string", "no crash when techCat/vocab omitted");

if (failed) { console.error(`\ntest-ai-prompt-trim: ${failed} check(s) FAILED`); process.exit(1); }
console.log("\ntest-ai-prompt-trim: all checks passed");
