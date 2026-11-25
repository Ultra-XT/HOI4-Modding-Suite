/*
 * Regression guard for the focus `will_lead_to_war_with` (scalar tag) + `select_effect` (block) fields.
 *
 * Like test-focus-allowbranch.js, app.js can't run headlessly (top-level DOM), so this verifies every
 * integration point of the WIRING via source assertions — a refactor must not drop one and leave a field
 * that renders but never saves/loads. MD usage that motivated these: will_lead_to_war_with ×55 files,
 * select_effect ×13 files.
 *
 * Run: node test-focus-warwith-selecteffect.js
 */
const fs = require("fs");
const path = require("path");

const appJs = fs.readFileSync(path.join(__dirname, "public", "app.js"), "utf8");
const indexHtml = fs.readFileSync(path.join(__dirname, "public", "index.html"), "utf8");
const aiJs = fs.readFileSync(path.join(__dirname, "public", "ai-field-assist.js"), "utf8");

let fail = 0;
const ok = (label, cond) => { console.log((cond ? "PASS " : "FAIL ") + label); if (!cond) fail++; };

console.log("focus will_lead_to_war_with + select_effect wiring:");

// 1. HTML fields.
ok("index.html has #sb-focus-warwith input", /id="sb-focus-warwith"/.test(indexHtml));
ok("index.html has #sb-focus-selecteffect textarea", /id="sb-focus-selecteffect"/.test(indexHtml));

// 2. Live-change listeners (edit marks the focus dirty).
ok("app.js wires both fields into the input listeners",
  /"sb-focus-bypass",\s*"sb-focus-warwith",\s*"sb-focus-selecteffect"/.test(appJs));

// 3. Load focus -> sidebar.
ok("app.js loads focus.willLeadToWarWith into the field",
  /warEl\.value\s*=\s*focus\.willLeadToWarWith/.test(appJs));
ok("app.js loads focus.selectEffect into the field",
  /selEl\.value\s*=\s*focus\.selectEffect/.test(appJs));

// 4. Read sidebar -> focus.
ok("app.js reads will_lead_to_war_with back into focus",
  /focus\.willLeadToWarWith\s*=\s*warEl\.value\.trim\(\)/.test(appJs));
ok("app.js reads select_effect back into focus",
  /focus\.selectEffect\s*=\s*selEl\.value\.trim\(\)/.test(appJs));

// 5. Parse existing block -> value + source (needed for the dirty diff).
ok("app.js parses willLeadToWarWith from the block",
  /willLeadToWarWith:\s*\(blockText\.match\(\/\(\?:\^\|\\n\)\\s\*will_lead_to_war_with/.test(appJs));
ok("app.js parses sourceWillLeadToWarWith", /sourceWillLeadToWarWith:/.test(appJs));
ok("app.js parses selectEffect via extractFocusSectionBody",
  /selectEffect:\s*extractFocusSectionBody\(blockText,\s*"select_effect"\)/.test(appJs));
ok("app.js parses sourceSelectEffect",
  /sourceSelectEffect:\s*extractFocusSectionBody\(blockText,\s*"select_effect"\)/.test(appJs));

// 6. Existing-focus save: upsert only when changed.
ok("app.js upserts will_lead_to_war_with as a scalar",
  /upsertScalar\(out,\s*"will_lead_to_war_with",\s*focus\.willLeadToWarWith\)/.test(appJs));
ok("app.js guards the war-with upsert with a source comparison",
  /\(focus\.willLeadToWarWith \|\| ""\)\s*!==\s*\(focus\.sourceWillLeadToWarWith \|\| ""\)/.test(appJs));
ok("app.js upserts select_effect as a section",
  /upsertSection\(out,\s*"select_effect",\s*focus\.selectEffect\)/.test(appJs));
ok("app.js guards the select_effect upsert with a source comparison",
  /\(focus\.selectEffect \|\| ""\)\s*!==\s*\(focus\.sourceSelectEffect \|\| ""\)/.test(appJs));

// 6b. upsertScalar must match ANY value (yes/no OR a tag), not only yes|no — else a tag-valued scalar
//     never updates/removes in place and duplicates.
ok("upsertScalar regex accepts a non-block value (tag), not just yes|no",
  /const re = new RegExp\(`\^\\\\s\*\$\{key\}\\\\s\*=\\\\s\*\[\^\{\\\\s\]/.test(appJs));

// 7. New-focus save: template emits both, and the call site forwards them.
ok("focusBlockTemplate emits will_lead_to_war_with",
  /will_lead_to_war_with = \$\{focus\.willLeadToWarWith\}/.test(appJs));
ok("focusBlockTemplate emits select_effect",
  /emitTriggerSection\("select_effect",\s*focus\.selectEffect\)/.test(appJs));
// One spread replaces the hand-listed forwarding these two used to assert individually — see the note in
// test-focus-allowbranch.js: the list left out icon and cost, so a new focus lost them on its first save.
ok("new-focus call site forwards the whole parsed focus (not a hand-listed subset)",
  /const merged = \{\s*\.\.\.focus,\s*\.\.\.full\s*\}/.test(appJs));

// 8. AI assist for the effects field.
ok("ai-field-assist registers #sb-focus-selecteffect as effects",
  /selector:\s*"#sb-focus-selecteffect",\s*type:\s*"effects"/.test(aiJs));

const total = 21;
console.log("\n  " + (total - fail) + "/" + total + " passed");
process.exit(fail ? 1 : 0);
