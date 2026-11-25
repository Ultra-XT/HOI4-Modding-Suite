/*
 * Regression guard for FINDING #7: a `set_technology` focus completion_reward could not be saved.
 *
 * set_technology = { <tech> = 1 } is a MULTI-LINE block effect (the { and } land on separate lines).
 * queueEffectLines (public/app.js) only treats an incoming unit as a block — joining ALL its lines —
 * when the command key is in EFFECT_BLOCK_KEYS. Otherwise it falls through to single-line handling that
 * keeps only the first line ("set_technology = {"), producing unbalanced braces. app.js's own pre-save
 * parse check then refuses the save ("effect rewrite blocked: Unbalanced braces (missing closing) in
 * managed effects segment"), so the focus becomes permanently unsaveable. The fix registers
 * set_technology as a block key.
 *
 * app.js can't run headlessly (top-level DOM access), so — like test-focus-allowbranch.js — this asserts
 * the wiring against the source text. Run: node test-focus-set-technology-block.js
 */
const fs = require("fs");
const path = require("path");
const appJs = fs.readFileSync(path.join(__dirname, "public", "app.js"), "utf8");

let fail = 0;
const ok = (label, cond) => { console.log((cond ? "PASS " : "FAIL ") + label); if (!cond) fail++; };

console.log("set_technology block-effect save wiring:");

// 1. THE fix: set_technology must be registered in EFFECT_BLOCK_KEYS, or queueEffectLines truncates the
//    block to its first line and the save is blocked by the unbalanced-brace check.
const blockKeysMatch = appJs.match(/const EFFECT_BLOCK_KEYS = new Set\(\[([\s\S]*?)\]\)/);
ok("app.js defines EFFECT_BLOCK_KEYS", !!blockKeysMatch);
ok('EFFECT_BLOCK_KEYS includes "set_technology"',
  !!blockKeysMatch && /["']set_technology["']/.test(blockKeysMatch[1]));

// 2. The technology_picker still EMITS a multi-line block + queues it (if it ever emitted a single line,
//    the block-key registration would be pointless — this keeps the two halves of the contract in sync).
ok("technology_picker emits the `${cmd} = {` opening line",
  /`\$\{cmd\} = \{`/.test(appJs));
ok("technology_picker emits the `\\t${selected} = 1` tech line",
  /`\\t\$\{selected\} = 1`/.test(appJs));
ok("technology_picker queues the block via queueEffectLines(focus.id, lines)",
  /mode === "technology_picker"[\s\S]*?queueEffectLines\(focus\.id, lines\)/.test(appJs));

// 3. The CLASS fix: queueEffectLines must never truncate a multi-line block unit to its first line in
//    the fallthrough. This is what makes set_technology robust even if it ever leaves EFFECT_BLOCK_KEYS,
//    and what fixes the siblings that CAN'T be listed there — add_autonomy_score and the state-scope
//    blocks (`<stateId> = { add_core_of = ROOT }`) whose key is a number.
ok("queueEffectLines preserves multi-line block units (no lines[0] truncation)",
  /if \(unit\.lines\.length > 1\)[\s\S]*?merged\.push\(joinedBlock\)[\s\S]*?return;/.test(appJs));

// 4. The pre-save brace validation that catches this regression class is still present (the safety net
//    that turned a silent corruption into a blocked save — keep it).
ok("app.js keeps the managed-effects unbalanced-brace validation",
  /Unbalanced braces[\s\S]*?managed effects segment/.test(appJs));

console.log(fail ? `\nset_technology block test: FAILED (${fail})` : "\nset_technology block test: ALL PASS");
process.exitCode = fail ? 1 : 0;
