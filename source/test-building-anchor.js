// rekeyBuildingAnchorsForProvince + findBuildingAnchorMismatches — the map/buildings.txt anchor
// consistency added after the Millennium Dawn Gaza/Negev crash (a floating_harbor row keyed to a
// state that no longer owned its anchor province crashed HOI4 at game launch with no log).
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const md = require("./map-data.js");

let passed = 0, failed = 0;
function check(name, cond) {
  if (cond) { passed++; console.log("  ok " + name); }
  else { failed++; console.log("  ✗ " + name); }
}

// ── Fixture: a mod with two states and a buildings.txt anchoring a harbor to province 10 in state 1 ──
const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-anchor-mod-"));
const game = fs.mkdtempSync(path.join(os.tmpdir(), "nova-anchor-game-")); // empty vanilla stand-in
fs.mkdirSync(path.join(mod, "history", "states"), { recursive: true });
fs.mkdirSync(path.join(mod, "map"), { recursive: true });
fs.writeFileSync(path.join(mod, "history", "states", "1-One.txt"),
  'state = {\n\tid = 1\n\tname = "STATE_1"\n\thistory = { owner = AAA }\n\tprovinces = { 10 11 }\n}\n', "utf8");
fs.writeFileSync(path.join(mod, "history", "states", "2-Two.txt"),
  'state = {\n\tid = 2\n\tname = "STATE_2"\n\thistory = { owner = BBB }\n\tprovinces = { 20 }\n}\n', "utf8");
fs.writeFileSync(path.join(mod, "map", "definition.csv"),
  "0;0;0;0;land;false;unknown;0\n10;10;0;0;land;true;plains;1\n11;11;0;0;land;false;plains;1\n20;20;0;0;land;true;plains;1\n99;99;0;0;sea;false;ocean;1\n", "utf8");
fs.writeFileSync(path.join(mod, "map", "buildings.txt"),
  "1;floating_harbor;1.0;2.0;3.0;0.5;10\n" + // anchored to prov 10 (will move)
  "1;arms_factory;1.0;2.0;3.0;0.5;0\n" +      // unanchored — must never change
  "1;naval_base_spawn;1.0;2.0;3.0;0.5;99\n" + // sea anchor — must never change
  "2;floating_harbor;4.0;5.0;6.0;0.5;20\n", "utf8");

console.log("BUILDING-ANCHOR TEST:");

// 1. Mismatch detection BEFORE any move: none (everything consistent).
let model = md.buildMapModel({ modRoot: mod, gameRoot: game, dependencyRoots: [] });
let probs = md.findBuildingAnchorMismatches({ modRoot: mod, gameRoot: game, dependencyRoots: [], model });
check("consistent fixture has no anchor mismatches", probs.length === 0);

// 2. moveProvince(10: state 1 -> 2) re-keys the anchored harbor row.
const res = md.moveProvince({ modRoot: mod, gameRoot: game, dependencyRoots: [], provinceId: 10, fromStateId: 1, toStateId: 2 });
check("move reports changed", res.changed === true);
check("move re-keyed exactly one buildings.txt row", res.buildingAnchors && res.buildingAnchors.rekeyed === 1);
const btxt = fs.readFileSync(path.join(mod, "map", "buildings.txt"), "utf8");
check("harbor row now keyed to state 2", btxt.includes("2;floating_harbor;1.0;2.0;3.0;0.5;10"));
check("unanchored row untouched", btxt.includes("1;arms_factory;1.0;2.0;3.0;0.5;0"));
check("sea-anchored naval_base_spawn untouched", btxt.includes("1;naval_base_spawn;1.0;2.0;3.0;0.5;99"));
// #a-backup-must-not-ship-with-the-mod — this asserted the OPPOSITE until 2026-09-16. safeModWrite already
// copies the original into Nova's backup folder; the sibling copy was a SECOND backup, in the one place it
// must not be — a modder uploads it to the Workshop with the mod (fifteen buildings.txt.bak of ~3.3 MB each
// were measured in the owner's mod folder). test-a-backup-must-not-ship-with-the-mod.js owns the rule.
check("no .bak was left beside buildings.txt", !fs.existsSync(path.join(mod, "map", "buildings.txt.bak")));

// 3. Model + scan agree after the move: no mismatches.
model = md.buildMapModel({ modRoot: mod, gameRoot: game, dependencyRoots: [] });
check("state 2 owns prov 10 after move", model.provinceToState[10] === 2);
probs = md.findBuildingAnchorMismatches({ modRoot: mod, gameRoot: game, dependencyRoots: [], model });
check("no anchor mismatches after re-keyed move", probs.length === 0);

// 4. A hand-made mismatch IS detected (simulate an external/manual edit that skipped the re-key).
fs.writeFileSync(path.join(mod, "map", "buildings.txt"),
  "1;floating_harbor;1.0;2.0;3.0;0.5;10\n", "utf8"); // prov 10 is in state 2 now, row keyed to 1
probs = md.findBuildingAnchorMismatches({ modRoot: mod, gameRoot: game, dependencyRoots: [], model });
check("mismatch detected", probs.length === 1);
check("mismatch is a warning (base mods ship tolerated ones)", probs[0] && probs[0].severity === "warning");
check("mismatch names the rule", probs[0] && probs[0].rule === "building_anchor_wrong_state");

// 5. Refuses to write into the game directory.
const guard = md.rekeyBuildingAnchorsForProvince({ modRoot: game, gameRoot: game, provinceId: 10, toStateId: 2 });
check("refuses to write to the game root", guard.changed === false && /game directory/i.test(guard.error || ""));

try { fs.rmSync(mod, { recursive: true, force: true }); fs.rmSync(game, { recursive: true, force: true }); } catch (_) {}
console.log(`  ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
