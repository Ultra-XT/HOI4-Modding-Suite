// #orphan-spirit-crywolf — the orphan_spirit rule must recognise every real way a mod grants a spirit.
//
// A validator rule that fires on working content is worse than a missing rule: it trains the user to ignore
// Mod Health. Measured against Paradox's own shipped content, orphan_spirit was firing 1,470 times on vanilla
// and 3,537 on Millennium Dawn — 30.7% of MD's entire problem list — and 77-90% of that was wrong. Two grant
// forms it did not know about account for most of it:
//
//   - `add_timed_idea = { idea = X days = N }` — an unambiguous grant it simply did not match.
//   - `add_timed_idea = { idea = tribute_idea_[ROOTTAG] }` — an id built at runtime. Only the literal prefix
//     is knowable statically, so every idea sharing that prefix must count as granted. In MD this single
//     construct accounts for 448 spirits.
//
// Both directions are the point. Narrowing a rule until it stops complaining is easy and useless — the rule
// must still catch a spirit nothing grants. And the runtime prefix must NOT be recorded as an ordinary
// reference, or broken_reference starts reporting an idea that never existed under that name (that regression
// happened while making this change, and cost MD two extra false positives until it was caught by measuring).
//
// Hermetic: fake mod under tmpdir; corpora are never read.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const mi = require("./mod-index.js");

const fails = [];
let checks = 0;
function rec(label, ok, detail) {
  checks++;
  if (ok) console.log("  ok   " + label);
  else {
    fails.push(label);
    console.log("  FAIL " + label + "  -> " + String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 300));
  }
}

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-orphan-"));
const MOD = path.join(ROOT, "orphanmod");
["common/ideas", "events", "common/national_focus"].forEach((d) =>
  fs.mkdirSync(path.join(MOD, ...d.split("/")), { recursive: true }));
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="OrphanMod"\nsupported_version="1.18.*"\n', "utf8");

fs.writeFileSync(path.join(MOD, "common", "ideas", "spirits.txt"), [
  "ideas = {",
  "\tcountry = {",
  "\t\tzz_orphaned = { removal_cost = -1 }",          // nothing grants this — MUST still be reported
  "\t\tzz_by_add_ideas = { removal_cost = -1 }",       // classic grant
  "\t\tzz_by_timed = { removal_cost = -1 }",           // add_timed_idea grant
  "\t\tzz_dyn_alpha = { removal_cost = -1 }",          // granted through a runtime-built id
  "\t\tzz_dyn_beta = { removal_cost = -1 }",           // …and so is this one, same prefix
  "\t\tzz_unrelated_dyn = { removal_cost = -1 }",      // prefix must NOT match this
  "\t}",
  "}",
  "",
].join("\n"), "utf8");

fs.writeFileSync(path.join(MOD, "events", "grants.txt"), [
  "add_namespace = zz",
  "",
  "country_event = {",
  "\tid = zz.1",
  "\toption = {",
  "\t\tname = zz.1.a",
  "\t\tadd_ideas = zz_by_add_ideas",
  "\t\tadd_timed_idea = { idea = zz_by_timed days = 30 }",
  "\t\tadd_timed_idea = { idea = zz_dyn_[ROOT.GetTag] days = 30 }",
  "\t}",
  "}",
  "",
].join("\n"), "utf8");

try {
  const idx = mi.buildModIndex(MOD, { vanillaRoot: null, dependencyRoots: [] });
  const problems = idx.problems || [];
  const orphans = problems.filter((p) => p.rule === "orphan_spirit").map((p) => p.entityId);
  const broken = problems.filter((p) => p.rule === "broken_reference");

  console.log("\n[grants the rule must recognise]");
  rec("an add_ideas grant is recognised", !orphans.includes("zz_by_add_ideas"), orphans);
  rec("an add_timed_idea grant is recognised", !orphans.includes("zz_by_timed"), orphans);
  rec("a runtime-built id grants every idea with its prefix",
    !orphans.includes("zz_dyn_alpha") && !orphans.includes("zz_dyn_beta"), orphans);

  console.log("\n[what must still be caught]");
  rec("a spirit nothing grants is STILL reported", orphans.includes("zz_orphaned"), orphans);
  rec("…and the prefix does not silence an unrelated spirit", orphans.includes("zz_unrelated_dyn"), orphans);

  console.log("\n[the prefix must not leak into other rules]");
  rec("the literal prefix is not reported as a broken reference",
    !broken.some((p) => String(p.refId || "").startsWith("zz_dyn") && !/alpha|beta/.test(String(p.refId))),
    broken.map((p) => p.refId));

  console.log("\n[the message must not overclaim]");
  const msg = (problems.find((p) => p.rule === "orphan_spirit" && p.entityId === "zz_orphaned") || {}).message || "";
  rec("it no longer asserts the spirit won't appear in game", !/won't appear in game/i.test(msg), msg);
  rec("…and it names the escape hatch", /scripted GUI|runtime/i.test(msg), msg);

  console.log(`\n=== orphan_spirit grant forms: ${checks} checks, ${fails.length} failed ===`);
  if (fails.length) {
    fails.forEach((f) => console.log("   FAILED: " + f));
    process.exitCode = 1;
  }
} catch (e) {
  console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 6).join("\n") : e);
  process.exitCode = 1;
} finally {
  try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
}
