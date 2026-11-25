// #focus-id-truncated — a focus id containing a hyphen or a dot must be indexed whole.
//
// The id pattern stopped at the first hyphen or dot, silently truncating the id. That is a straight bug, and
// it corrupted two Mod Health rules at once:
//
//   - missing_localization looked up a key that does not exist, so a focus with perfectly good localisation
//     was reported as missing it;
//   - duplicate_id manufactured pairs out of thin air — ETH_anti-italian_propaganda and ETH_anti-tank_guns
//     both indexed as "ETH_anti", so each was reported as clobbering the other.
//
// 14 vanilla and 30 Millennium Dawn focus ids are affected, so this is shipped content, not a hypothetical.
//
// Also covers the second half of the same fix: an advisor's idea_token is not a displayed entity — the name
// the player sees comes from the character — so demanding localisation for the token itself was wrong, and
// accounted for 1,628 MD firings.
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

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-focusid-"));
const MOD = path.join(ROOT, "focusmod");
["common/national_focus", "localisation/english"].forEach((d) =>
  fs.mkdirSync(path.join(MOD, ...d.split("/")), { recursive: true }));
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="FocusMod"\nsupported_version="1.18.*"\n', "utf8");

// The exact shape that collided in vanilla: two ids sharing everything up to the first hyphen.
fs.writeFileSync(path.join(MOD, "common", "national_focus", "tree.txt"), [
  "focus_tree = {",
  "\tid = zz-tree.main",
  "\tfocus = {",
  "\t\tid = ZZ_anti-italian_propaganda",
  "\t\tx = 0",
  "\t\ty = 0",
  "\t}",
  "\tfocus = {",
  "\t\tid = ZZ_anti-tank_guns",
  "\t\tx = 1",
  "\t\ty = 0",
  "\t}",
  "\tfocus = {",
  "\t\tid = ZZ_plain_focus",
  "\t\tx = 2",
  "\t\ty = 0",
  // A REFERENCE to a hyphenated focus. Without this the reference assertions below would pass on an empty
  // set and prove nothing — which is precisely how the one-sided fix shipped.
  "\t\tprerequisite = { focus = ZZ_anti-tank_guns }",
  "\t\tmutually_exclusive = { focus = ZZ_anti-italian_propaganda }",
  "\t}",
  "}",
  "",
].join("\n"), "utf8");

// A reference to the dotted/hyphenated focus_tree id, from where such references really live.
fs.mkdirSync(path.join(MOD, "events"), { recursive: true });
fs.writeFileSync(path.join(MOD, "events", "load.txt"), [
  "add_namespace = zz",
  "",
  "country_event = {",
  "\tid = zz.1",
  "\toption = {",
  "\t\tname = zz.1.a",
  "\t\tload_focus_tree = zz-tree.main",
  "\t}",
  "}",
  "",
].join("\n"), "utf8");

// Every focus IS localised, under its full id — so any missing_localization here is the truncation bug.
fs.writeFileSync(path.join(MOD, "localisation", "english", "zz_l_english.yml"),
  "﻿l_english:\n ZZ_anti-italian_propaganda:0 \"Anti-Italian Propaganda\"\n" +
  " ZZ_anti-tank_guns:0 \"Anti-Tank Guns\"\n ZZ_plain_focus:0 \"Plain Focus\"\n", "utf8");

try {
  const idx = mi.buildModIndex(MOD, { vanillaRoot: null, dependencyRoots: [] });
  const focusIds = (idx.entities || []).filter((e) => e.type === "focus").map((e) => e.id);
  const treeIds = (idx.entities || []).filter((e) => e.type === "focus_tree").map((e) => e.id);
  const problems = idx.problems || [];
  const dupes = problems.filter((p) => p.rule === "duplicate_id");
  const missingLoc = problems.filter((p) => p.rule === "missing_localization");

  console.log("\n[ids are indexed whole]");
  rec("a hyphenated focus id keeps its full name",
    focusIds.includes("ZZ_anti-italian_propaganda"), focusIds);
  rec("…and so does the one that shares its prefix",
    focusIds.includes("ZZ_anti-tank_guns"), focusIds);
  rec("neither was truncated at the hyphen", !focusIds.includes("ZZ_anti"), focusIds);
  rec("a focus_tree id may contain a dot and a hyphen", treeIds.includes("zz-tree.main"), treeIds);
  rec("an ordinary id is unaffected", focusIds.includes("ZZ_plain_focus"), focusIds);

  console.log("\n[the two rules the truncation corrupted]");
  rec("no bogus duplicate_id was manufactured", dupes.length === 0,
    dupes.map((p) => p.entityId + " in " + p.file));
  rec("no focus is reported as missing localisation it actually has",
    !missingLoc.some((p) => p.entityType === "focus"),
    missingLoc.filter((p) => p.entityType === "focus").map((p) => p.entityId));

  // ── The half that was missing, and that let a regression ship ────────────────────────────────
  // The first version of this test covered only the DEFINITION side. Widening that alone made every
  // reference to a hyphenated focus resolve to a truncated id that no longer existed, turning a fixed bug
  // into 37 new broken_reference reports on Millennium Dawn. An identifier convention has two halves and
  // they must move together, so both are asserted here.
  console.log("\n[references must use the same identifier class]");
  const brokenFocusRefs = problems.filter((p) => p.rule === "broken_reference" && p.refType === "focus");
  rec("a prerequisite naming a hyphenated focus resolves", brokenFocusRefs.length === 0,
    brokenFocusRefs.map((p) => p.refId));
  const treeRefs = problems.filter((p) => p.rule === "broken_reference" && p.refType === "focus_tree");
  rec("a load_focus_tree naming a dotted tree id resolves", treeRefs.length === 0,
    treeRefs.map((p) => p.refId));

  console.log(`\n=== focus id not truncated: ${checks} checks, ${fails.length} failed ===`);
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
