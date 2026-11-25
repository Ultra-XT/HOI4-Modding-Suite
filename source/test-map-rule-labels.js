// Unit test: every map-validation rule that /api/map/validate can emit has a friendly, human-readable
// label in public/map-rule-labels.js — so the Mod Health "Will it crash?" panel never shows a raw
// snake_case rule name (e.g. the buildings.txt / coastal / fractioned classes added recently). The test
// scrapes the rule strings straight out of map-data.js, so adding a new validator rule without a label
// fails here. Run: node test-map-rule-labels.js
"use strict";
const assert = require("assert");
const fs = require("fs"), path = require("path");
const labels = require("./public/map-rule-labels.js");
let pass = 0;
const ok = (n, c, x) => { assert.ok(c, n + (x !== undefined ? " -> " + JSON.stringify(x) : "")); console.log("  ok  " + n); pass++; };

(() => {
  console.log("=== map rule labels: every validator rule reads as plain English ===");
  const src = fs.readFileSync(path.join(__dirname, "map-data.js"), "utf8");
  const rules = [...new Set([...src.matchAll(/rule:\s*"([a-z0-9_]+)"/g)].map((m) => m[1]))]; // [a-z0-9_]: rule names can carry digits (e.g. bmp_not_24bit)
  ok("found a healthy set of validator rules in map-data.js", rules.length >= 20, rules.length);
  const missing = rules.filter((r) => !labels.LABELS[r]);
  ok("EVERY emitted map rule has an explicit friendly label", missing.length === 0, { missing });
  // The recent crash-class rules specifically (these used to show raw in the panel).
  for (const r of ["building_wrong_state", "coastal_no_port", "fractioned_naval_region", "land_not_in_state", "state_no_manpower", "sea_province_has_continent", "capital_state_owned_by_other"]) {
    ok(`'${r}' has a curated label`, !!labels.LABELS[r] && labels.mapRuleLabel(r) === labels.LABELS[r], labels.mapRuleLabel(r));
  }
  // An unknown rule is prettified, never shown raw.
  ok("unknown rule falls back to a prettified label", labels.mapRuleLabel("some_brand_new_rule") === "Some brand new rule", labels.mapRuleLabel("some_brand_new_rule"));
  ok("empty/garbage rule yields a safe default", labels.mapRuleLabel("") === "Map problem" && labels.mapRuleLabel(null) === "Map problem");

  // ── GUARANTEED-FATAL set (drives the Save hard-gate) ──
  console.log("\n=== guaranteed-fatal rules (Save gate) ===");
  ok("a non-empty FATAL set exists", labels.FATAL && labels.FATAL.size >= 10, labels.FATAL && labels.FATAL.size);
  const ruleSet = new Set(rules);
  const ghosts = [...labels.FATAL].filter((r) => !ruleSet.has(r));
  ok("every FATAL rule is actually emitted by map-data.js (no typos / dead rules)", ghosts.length === 0, { ghosts });
  ok("every FATAL rule has a real, specific fix hint", [...labels.FATAL].every((r) => labels.mapRuleFixHint(r).length > 15), [...labels.FATAL].filter((r) => labels.mapRuleFixHint(r).length <= 15));
  ok("every FATAL rule has a friendly label", [...labels.FATAL].every((r) => !!labels.LABELS[r]));
  // The unreadable-bitmap + never-in-a-working-map structural breaks ARE gated.
  // #a-map-the-game-refuses-to-load — the three gamestate.cpp MAP_ERRORs hoi4.exe fails the map load on are gated too.
  for (const r of ["map_x_crossing", "province_no_pixels", "state_id_gap", "empty_state", "empty_capital_state", "capital_state_missing", "bmp_not_24bit",
    "land_not_in_state", "province_no_region", "state_split_strategic_regions", "fractioned_naval_region"]) {
    ok(`'${r}' is treated as guaranteed-fatal`, labels.isFatalRule(r) === true);
  }
  // ⭐⭐⭐ state_no_air_base_or_rocket_site LEFT that list on 2026-09-17. The trace that put it there is still true
  // instruction for instruction; its consequence never happened. Seven of the owner's own launches reached a 1936 game
  // on maps with states missing these rows and hoi4.exe logged nothing — clearest, nova_torture_0912 state 1083 (owned
  // by FRA, two land provinces, a VP, 22 building rows, neither site row), launched 2026-09-09 15:38 with --debug and
  // one active mod, error.log 15 lines and not one MAP_ERROR. Same flags DID produce "MAP_ERROR: The land province …
  // has no state." on 09-08, so the gate was open and --debug does not suppress MAP_ERROR. #a-validator-must-not-cry-wolf
  ok("'state_no_air_base_or_rocket_site' is NOT guaranteed-fatal — seven launches reached a 1936 game with it",
    labels.isFatalRule("state_no_air_base_or_rocket_site") === false);
  // state_no_air_base_or_rocket_site joined it (#a-state-without-an-air-base-site-fails-the-map-load): its three MAP_ERRORs
  // clear strategicair.cpp's ok-flag, and a cleared flag calls the same failed-load path (0x140CB789F -> 0x140201F90 in 1.19.4.1).
  // ⚠️ land_not_in_state MOVED from the un-gated list below. It was pinned un-gated on launches that "loaded past" stateless
  // land — and the owner's launches carry --debug (both crash folders: "LaunchArguments: --debug"). hoi4.exe records
  // IsMapInGoodState "no" for it and, without -debug, shows "Failed to load the map" and aborts.
  // ⚠️ fractioned_naval_region MOVED too (#a-fractioned-region-is-judged-the-way-the-game-judges-it). It was pinned
  // un-gated because Nova's detector reported 27 provinces on Old World Blues, which loads. The detector judged a region's
  // sea without its coast; hoi4.exe floods every listed province (0x1401F1160 in 1.19.4.1), and read that way all six shipping maps
  // have 0 — while the same map check fails the load on a real one.
  // Things HOI4 only LOGS but loads past are deliberately NOT gated — the gate must never fire on something
  // that isn't a certain crash, or it becomes noise. CRITICAL: duplicate_state_id + province_in_two_states[_files]
  // appear in clean, launchable Millennium Dawn (its <id>-restored.txt stubs; HOI4 resolves them first-wins), so
  // gating them would false-fire on a real working mod — they MUST stay un-gated.
  for (const r of ["duplicate_state_id", "province_in_two_states", "province_in_two_states_files",
    "coastal_no_port", "naval_base_non_coastal", "state_no_manpower", "province_too_large", "building_wrong_state"]) {
    ok(`'${r}' is NOT gated (clean MD has it / game loads past it / auto-fixable)`, labels.isFatalRule(r) === false);
  }
  ok("isFatalRule is safe on unknown/empty input", labels.isFatalRule("nope") === false && labels.isFatalRule("") === false);
  console.log(`\ntest-map-rule-labels: ${pass} checks passed`);
})();
