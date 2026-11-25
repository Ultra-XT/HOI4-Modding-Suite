// ⛔ A NEW RULE MUST NOT GET A FIX BUTTON BY DEFAULT.
//
// Mod Health has two fix tiers and, until 2026-09-07, only one of them had been thought through. The
// deterministic tier carries a rule-by-rule assessment and says so in its header: "EVERY RULE WAS ASSESSED
// AGAINST THAT TEST, so this is a closed question rather than a standing invite." Its sibling, NO_AUTOFIX,
// was two entries grown reactively — so every rule nobody had considered got an "✨ AI Auto-Fix" button by
// DEFAULT, silently, the moment the rule was added.
//
// That default produced four withdrawals, three of them in one night:
//   country_no_flag              the file is a .tga whose ABSENCE is the problem
//   file_unreadable              Nova itself could not read the file; the fix path reads first
//   dependency_not_found         file is descriptor.mod, which EXISTS — so it would not fail safely, it
//                                would edit the descriptor and most likely delete the dependency line
//   loc_duplicate_key_across_files  the rule's own help text ends "there is no auto-fix"
//
// So the three sets are now exhaustive between them, and this derives the rule list FROM THE SCANNERS and
// fails when a rule belongs to none of them. It does not judge which set a rule should be in — that is a
// product call — only that somebody made the call.
//
// ⚠️ Derived, never typed: the rule ids come from `rule: "…"` in the files that emit problems, with comments
// masked first, because a rule id quoted in a comment is not a rule.
"use strict";
const fs = require("fs");
const path = require("path");
const { maskJsComments } = require("./testlib-strip-comments.js");

let pass = 0;
const fails = [];
const ok = (cond, label, detail) => {
  if (cond) { pass++; console.log("  ok   " + label); }
  else { fails.push(label); console.log("  FAIL " + label + (detail !== undefined ? "   -> " + JSON.stringify(detail).slice(0, 400) : "")); }
};

// ── the rules that actually reach a card, taken from the code that pushes them ──────────────────────────
const EMITTERS = ["mod-index.js", "server.js"];
const emitted = new Set();
for (const f of EMITTERS) {
  const src = maskJsComments(fs.readFileSync(path.join(__dirname, f), "utf8"));
  for (const m of src.matchAll(/\brule:\s*["']([a-z_]+)["']/g)) emitted.add(m[1]);
}

const mh = maskJsComments(fs.readFileSync(path.join(__dirname, "public", "modhealth.js"), "utf8"));
const setLiteral = (marker) => {
  const at = mh.indexOf(marker);
  if (at === -1) return null;
  const close = mh.indexOf("]", at);
  if (close === -1) return null;
  return new Set([...mh.slice(at, close + 1).matchAll(/"([a-z_]+)"/g)].map((m) => m[1]));
};
const objectKeys = (marker) => {
  const at = mh.indexOf(marker);
  if (at === -1) return null;
  const close = mh.indexOf("};", at);
  if (close === -1) return null;
  return new Set([...mh.slice(at, close).matchAll(/^\s{4}([a-z_]+)\s*:/gm)].map((m) => m[1]));
};

const noAutofix = setLiteral("NO_AUTOFIX = new Set");
const aiOk = setLiteral("AI_APPROPRIATE = new Set");
const deterministic = objectKeys("DETERMINISTIC_FIXES = {");

console.log("\n-- the three sets are all still there and readable --");
ok(emitted.size > 15, `the scanners emit a plausible number of rules (${emitted.size})`, [...emitted].slice(0, 5));
ok(noAutofix && noAutofix.size > 0, "NO_AUTOFIX parsed", noAutofix ? [...noAutofix] : null);
ok(aiOk && aiOk.size > 0, "AI_APPROPRIATE parsed", aiOk ? [...aiOk] : null);
ok(deterministic && deterministic.size > 0, "DETERMINISTIC_FIXES parsed", deterministic ? [...deterministic] : null);

if (noAutofix && aiOk && deterministic) {
  console.log("\n-- ⭐ every rule has had its fix affordance DECIDED --");
  {
    const undecided = [...emitted].filter((r) => !noAutofix.has(r) && !aiOk.has(r) && !deterministic.has(r)).sort();
    ok(undecided.length === 0,
      "no rule falls through to an AI button by default",
      { undecided, hint: "put it in DETERMINISTIC_FIXES, AI_APPROPRIATE or NO_AUTOFIX — with the reason" });
  }

  console.log("\n-- …and no rule is in two minds about it --");
  {
    const both = [...emitted].filter((r) => (noAutofix.has(r) ? 1 : 0) + (aiOk.has(r) ? 1 : 0) + (deterministic.has(r) ? 1 : 0) > 1).sort();
    ok(both.length === 0, "no rule is classified twice", both);
  }

  console.log("\n-- …and the sets name real rules, not stale ids --");
  {
    // An entry that outlives the rule it excused is exactly the allow-list rot this project has been bitten
    // by before: it reads as a considered decision while protecting nothing.
    const stale = [...noAutofix, ...aiOk].filter((r) => !emitted.has(r)).sort();
    ok(stale.length === 0, "every excluded or AI-approved id is a rule something still emits", stale);
  }
}

console.log(`\n=== every rule has a decided fix affordance: ${pass} checks, ${fails.length} failed ===`);
fails.forEach((f) => console.log("   FAILED: " + f));
process.exit(fails.length ? 1 : 0);
