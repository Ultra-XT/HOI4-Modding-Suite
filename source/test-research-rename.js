// RENAME invariants (#rename-marks-referrers).
//
// Save writes ONLY the techs in dirtyTechIds — that selectivity is what stops it from corrupting
// untouched content, and it is also what makes an unmarked mutation silently wrong. Any code that
// rewrites a field on a tech OTHER than the one being edited must queue that tech too, or the edit
// lands in memory and never on disk. renameTechIdInClient rewrote every referrer and marked none.
"use strict";
const fs = require("fs");
const path = require("path");
const assert = require("assert");

const src = fs.readFileSync(path.join(__dirname, "public", "research.js"), "utf8");
let checks = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); checks += 1; };

const i = src.indexOf("function renameTechIdInClient(");
ok(i !== -1, "renameTechIdInClient exists");
const open = src.indexOf("{", i);
let d = 0, end = open;
for (let j = open; j < src.length; j++) {
  if (src[j] === "{") d++;
  else if (src[j] === "}") { d--; if (!d) { end = j; break; } }
}
const body = src.slice(open + 1, end);

ok(/markTechDirty\(t\.id, `Rename /.test(body), "a rewritten referrer is queued for save");
ok(/if \(changed && t\.id !== newId\)/.test(body),
  "only techs actually changed are queued, and never the renamed tech twice");
ok(/let changed = false;/.test(body), "the loop tracks whether it really modified each tech");

// every one of the four reference kinds must set `changed` — missing one leaves that link dangling
for (const [field, guard] of [
  ["prerequisites (OR)", /p\.techs\.includes\(oldId\)\) \{ p\.techs = p\.techs\.map[\s\S]{0,60}changed = true;/],
  ["prerequisites (single)", /p\.tech === oldId\) \{\s*\n?\s*p\.tech = newId; changed = true;/],
  ["mutuallyExclusive", /t\.mutuallyExclusive\.includes\(oldId\)[\s\S]{0,120}changed = true;/],
  ["dependencies", /t\.dependencies\.includes\(oldId\)[\s\S]{0,120}changed = true;/],
  ["subTechnologies", /t\.subTechnologies\.includes\(oldId\)[\s\S]{0,120}changed = true;/],
]) {
  ok(guard.test(body), `rewriting ${field} marks the tech as changed`);
}

// the country's starting-tech set must follow the rename too, or the country would start with a
// technology id that no longer exists
ok(/countryResearchedTechs\.delete\(oldId\)[\s\S]{0,80}countryResearchedTechs\.add\(newId\)/.test(body),
  "a renamed tech is renamed inside the country's starting-tech set as well");

// the delete path is where this pattern came from — keep them consistent
ok(/refEdits\.forEach\(\(e\) => markTechDirty\(e\.ownerId\)\)/.test(src),
  "SANITY: the delete path still queues the techs whose references it stripped");

// the dirty set has to be observable for the live test to be able to prove any of this
ok(/window\.__researchDirtyIds/.test(src), "the dirty set is exposed for testing");

console.log(`test-research-rename: ${checks} checks passed`);
