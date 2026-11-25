// Two Decisions-page controls that quietly wrote the wrong thing.
//
// #country-lock-misses-original-tag — the "Restrict to country" dropdown only recognised a bare `tag = XXX`.
// Real content overwhelmingly writes `original_tag = XXX`, and Nova's OWN Allowed label and textarea
// placeholder both say `original_tag = GRE`. So a decision restricted the recommended way loaded showing
// "— Any country (no restriction) —", and picking a country PREPENDED a second line, producing
//
//     allowed = { tag = FRA   original_tag = GRE }
//
// which is `tag == FRA AND original_tag == GRE` — never true. The decision became available to NO country in
// the game, and Save reported success.
//
// The code already carried a comment describing this exact failure and saying it was fixed. It was — but only
// for bare `tag`, not for `original_tag`, which is the form Nova itself recommends.
//
// The keyword is PRESERVED rather than normalised: `tag` is a country's current tag and `original_tag` the one
// it started as, and they differ after a civil war, a formable nation or a release. Rewriting one as the other
// would silently change which countries the decision applies to.
//
// #category-icon-retargets-another-category — the Category Icon box is written only by the icon picker and
// read only by Save, and nothing ever reset it: not the sidebar click (which repopulates ~30 other fields),
// not New, not Duplicate, not the mod switch. Pick a category icon for one decision, then later save a
// decision in a DIFFERENT category, and that other category's `icon =` line was rewritten to the first one's
// sprite. Same stale-field class as the spirit "Extra script" box.
"use strict";
const fs = require("fs"), path = require("path");

let pass = 0, total = 0;
const ok = (n, c, x) => { total++; if (c) { pass++; console.log("  ok  " + n); } else console.error("  FAIL " + n + (x !== undefined ? " -> " + JSON.stringify(x) : "")); };

const src = fs.readFileSync(path.join(__dirname, "public", "decisions.js"), "utf8");

// Run the REAL functions out of the shipped client rather than a copy of them.
const grab = (name) => {
  const start = src.indexOf(`function ${name}(`);
  if (start === -1) return "";
  let d = 0;
  for (let i = src.indexOf("{", start); i < src.length; i++) {
    if (src[i] === "{") d++;
    else if (src[i] === "}") { d--; if (d === 0) return src.slice(start, i + 1); }
  }
  return "";
};
const reLine = (src.match(/const NOVA_COUNTRY_LOCK_RE = [^\n]+/) || [""])[0];
const fns = [reLine, grab("findBareCountryLock"), grab("extractCountryLock"), grab("injectCountryLock")].join("\n");
ok("the country-lock functions were found", /findBareCountryLock/.test(fns) && /injectCountryLock/.test(fns), fns.slice(0, 120));
// eslint-disable-next-line no-new-func
const { extractCountryLock, injectCountryLock } = new Function(`${fns}\nreturn { extractCountryLock, injectCountryLock };`)();

// ── reading an existing restriction ───────────────────────────────────────────────────────────────
ok("a bare `tag = FRA` is still recognised", extractCountryLock("tag = FRA").tag === "FRA", extractCountryLock("tag = FRA"));
ok("an `original_tag = GRE` is recognised too", extractCountryLock("original_tag = GRE").tag === "GRE",
  extractCountryLock("original_tag = GRE"));
ok("…and the keyword is remembered", extractCountryLock("original_tag = GRE").keyword === "original_tag",
  extractCountryLock("original_tag = GRE"));
ok("the line is stripped from the visible Allowed box",
  extractCountryLock("original_tag = GRE\nhas_war = no").allowed.trim() === "has_war = no",
  extractCountryLock("original_tag = GRE\nhas_war = no"));

// A tag INSIDE a nested block is a different condition and must be left alone.
const nested = "OR = {\n\toriginal_tag = GRE\n\toriginal_tag = TUR\n}";
ok("an original_tag inside an OR block is NOT taken as the lock", extractCountryLock(nested).tag === "",
  extractCountryLock(nested));
ok("…and that block is left untouched", extractCountryLock(nested).allowed === nested, extractCountryLock(nested));

// ── writing a restriction ─────────────────────────────────────────────────────────────────────────
const out = injectCountryLock("original_tag = GRE", "FRA");
ok("re-restricting replaces the existing line instead of adding a second",
  (out.match(/original_tag|(^|\s)tag\s*=/g) || []).length === 1, out);
ok("…so the impossible AND is gone", !/GRE/.test(out), out);
ok("…the new country is written", /FRA/.test(out), out);
ok("…and it keeps original_tag rather than silently switching to tag", /^original_tag = FRA/.test(out), out);

const out2 = injectCountryLock("tag = GRE", "FRA");
ok("a decision written with bare `tag` keeps bare `tag`", /^tag = FRA/.test(out2) && !/original_tag/.test(out2), out2);

const out3 = injectCountryLock("has_war = no", "FRA");
ok("a brand-new lock still uses Nova's default keyword", /^tag = FRA/.test(out3), out3);
ok("…and keeps the user's own conditions", /has_war = no/.test(out3), out3);

ok("clearing the restriction removes the line entirely",
  injectCountryLock("original_tag = GRE\nhas_war = no", "").trim() === "has_war = no",
  injectCountryLock("original_tag = GRE\nhas_war = no", ""));

// ── the category icon box must be cleared like every other field ──────────────────────────────────
const selHandler = src.slice(src.indexOf("setDecisionCategory(isDraftFolder"), src.indexOf("setDecisionCategory(isDraftFolder") + 1200);
ok("selecting a decision clears the Category Icon box",
  /decisionCategoryIcon"\);\s*if \(ci\) ci\.value = ""/.test(selHandler), selHandler.slice(0, 400));
ok("…and it is explained", /category-icon-retargets-another-category/.test(selHandler), "no marker comment");
ok("the mod-switch reset clears it too", /"decisionCategoryIcon",/.test(src), "not in the clear list");

console.log("\ntest-decision-country-lock-and-icon: " + pass + "/" + total + " checks passed");
process.exitCode = pass === total && total >= 16 ? 0 : 1;
