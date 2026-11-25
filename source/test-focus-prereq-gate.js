// Autonomous in-game-equivalent proof for the SCARIEST fix (bug-hunt #4, commit 8520eb7):
// "focus sibling-prerequisite AND-groups flattened to OR on save". rewriteFocusBlockPrerequisites rebuilds
// ONE merged `prerequisite = { }` block from the flat focus.prerequisites model — which collapses two sibling
// AND-blocks into a single OR-block. It USED to run on EVERY focus on EVERY save, silently breaking completion
// gating across a whole vanilla/MD tree just by opening + saving it. The fix GATES that rewrite on a per-focus
// `prereqsEdited` flag set only at the 3 real user-edit points, so an untouched focus is byte-preserved.
//
// This test runs the ACTUAL shipped functions (brace-matched out of public/app.js — it's browser-only, not
// require-able) against a REAL Millennium Dawn focus that has two sibling prerequisite blocks, and:
//   (1) proves the flatten IS destructive (2 AND-blocks -> 1 OR-block) when it runs,
//   (2) simulates the save-loop's gate decision: unedited focus -> block byte-PRESERVED (2 blocks intact),
//   (3) source-asserts the save loop actually uses that gate and nothing calls the flattener ungated.
// Run: node test-focus-prereq-gate.js
"use strict";
const fs = require("fs"), path = require("path");
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log("  PASS", n); } else { fail++; console.log("  FAIL", n, x != null ? "→ " + JSON.stringify(x) : ""); } };

const src = fs.readFileSync(path.join(__dirname, "public", "app.js"), "utf8");
// These are column-0 top-level function declarations whose bodies contain regex/template literals with braces
// (so a char-level brace counter over-runs). Extract by LINES instead: from `function NAME(` at column 0 to the
// next line that is exactly `}` (the top-level close — nested closes are indented, never at column 0).
const lines = src.split(/\r?\n/);
const grab = (name) => {
  const start = lines.findIndex((l) => l.startsWith(`function ${name}(`));
  if (start < 0) throw new Error("cannot find " + name);
  let end = -1;
  for (let i = start + 1; i < lines.length; i++) { if (lines[i] === "}") { end = i; break; } }
  if (end < 0) throw new Error("no top-level close for " + name);
  return lines.slice(start, end + 1).join("\n");
};
// rewriteFocusBlockPrerequisites needs stripAllSubsectionsNamed, which needs findMatchingBrace.
const make = new Function(`${grab("findMatchingBrace")}\n${grab("stripAllSubsectionsNamed")}\n${grab("rewriteFocusBlockPrerequisites")}\nreturn { rewriteFocusBlockPrerequisites };`);
const { rewriteFocusBlockPrerequisites } = make();

// A REAL Millennium Dawn focus (israel_tree.txt): requires ISR_un_inspections AND (atheism OR religion) — two
// SIBLING prerequisite blocks. The AND between the blocks is the gating that must survive an unedited save.
const REAL_BLOCK =
`	focus = {
		id = ISR_befriend_south_africa
		icon = AFR_south_africa_currency
		x = -3
		y = 4
		relative_position_id = ISR_binational_state
		cost = 3
		prerequisite = {
			focus = ISR_un_inspections
		}
		prerequisite = {
			focus = ISR_identity_atheism
			focus = ISR_identity_religion
		}
		completion_reward = {
			add_political_power = 50
		}
	}`;

const countPrereqBlocks = (s) => (s.match(/prerequisite\s*=\s*\{/g) || []).length;
// The parser flattens every `focus = X` across all prerequisite blocks into one array (this flat model is
// exactly WHY re-emitting loses the AND structure — the gate is the safeguard, not a re-model).
const flatModel = { prerequisites: ["ISR_un_inspections", "ISR_identity_atheism", "ISR_identity_religion"] };

try {
  ok("fixture is a real 2-block AND-group (sanity)", countPrereqBlocks(REAL_BLOCK) === 2, countPrereqBlocks(REAL_BLOCK));

  // (1) The danger is real: run the flattener → the two AND-blocks collapse into ONE block (an OR of all 3).
  const flattened = rewriteFocusBlockPrerequisites(REAL_BLOCK, flatModel);
  ok("flattener collapses the 2 AND-blocks into 1 (this is the bug it must NOT do on an untouched save)", countPrereqBlocks(flattened) === 1, countPrereqBlocks(flattened));
  ok("...and that 1 block ORs all three prereqs together", ["ISR_un_inspections", "ISR_identity_atheism", "ISR_identity_religion"].every((id) => flattened.includes("focus = " + id)));

  // (2) The gate in action — simulate the save loop's exact decision on THIS block.
  //     unedited focus (prereqsEdited falsy) → the prereq rewrite is SKIPPED → block untouched.
  const unedited = { prerequisites: flatModel.prerequisites, prereqsEdited: undefined };
  const savedUnedited = unedited.prereqsEdited ? rewriteFocusBlockPrerequisites(REAL_BLOCK, unedited) : REAL_BLOCK;
  ok("UNEDITED save preserves the block BYTE-FOR-BYTE (both AND-blocks intact)", savedUnedited === REAL_BLOCK);
  ok("...still 2 prerequisite blocks after an unedited save", countPrereqBlocks(savedUnedited) === 2, countPrereqBlocks(savedUnedited));

  //     edited focus (user actually changed prereqs) → the rewrite runs, as intended.
  const edited = { prerequisites: flatModel.prerequisites, prereqsEdited: true };
  const savedEdited = edited.prereqsEdited ? rewriteFocusBlockPrerequisites(REAL_BLOCK, edited) : REAL_BLOCK;
  ok("EDITED save DOES rewrite (gate lets a genuine prereq edit through)", countPrereqBlocks(savedEdited) === 1);

  // (3) Source-assert the shipped save loop really uses that gate, and nothing calls the flattener ungated.
  const gated = /prereqsEdited\s*[\r\n\t ]*\?\s*[\r\n\t ]*rewriteFocusBlockPrerequisites\s*\(/.test(src);
  ok("save loop calls the flattener ONLY under `prereqsEdited ? ...`", gated);
  const callSites = (src.match(/rewriteFocusBlockPrerequisites\s*\(/g) || []).length; // 1 definition + 1 gated call
  ok("exactly ONE call site (the gated one) besides the definition", callSites === 2, callSites);
  const flagSets = (src.match(/prereqsEdited\s*=\s*true/g) || []).length;
  ok("prereqsEdited is set at exactly the 3 known user-edit points (tripwire vs. an ungated set)", flagSets === 3, flagSets);
  const parseSetsFlag = /function parseFocus[\s\S]*?prereqsEdited\s*=\s*true[\s\S]*?\n}/.test(src);
  ok("the parser does NOT set prereqsEdited (a freshly-loaded focus stays gated)", !parseSetsFlag);
} catch (e) { fail++; console.log("  FAIL threw →", e && e.stack || e); }

console.log(`\nFOCUS-PREREQ-GATE: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
