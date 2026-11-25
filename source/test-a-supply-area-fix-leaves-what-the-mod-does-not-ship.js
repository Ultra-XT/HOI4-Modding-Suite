// A supply-area rule and its Auto-fix must stay inside the supply areas the mod actually ships.
// #a-supply-area-fix-leaves-what-the-mod-does-not-ship
//
// supply_area_split_regions reports a supply area whose member states span more than one strategic region,
// and fixSupplyAreaRegionSplits re-homes the out-of-region states. Measured by the overnight invariant audit
// and reproduced by an independent verifier, on Old World Blues — a shipping, current (1.19.*) map:
//
//   * the rule fired 62 times, 88.6% of everything Nova said about the map, each asserting a launch crash;
//   * one Auto-fix click would move 411 of the mod's 1,382 supply-area memberships and invent 20 areas;
//   * and on an ADD-ON to that mod, which ships no supply areas of its own, the fixer materialised 103 of
//     the dependency's files into the add-on to make those moves.
//
// ⚠️ THE CRASH EVIDENCE IS GENUINELY MIXED, SO THIS FIXES ONLY WHAT IS CERTAIN.
//   For: 2026-06-13, the map editor moved a region-5 state into vanilla's lone region-38 supply area and
//   vanilla crashed at boot (md-crash-playbook). The rule and its fixer both come from that.
//   Against: the same playbook entry records THREE layered causes for that crash, and the isolation shown is
//   for a different one (malformed maker files HOI4 1.19 made fatal — quarantining them "advanced the boot to
//   the loading screen"). Supply areas are deprecated since 1.11. Old World Blues ships 62 cross-region areas
//   and launches. A later session already noted this rule "makes the same outdated crash claim".
//
// So this does NOT remove the rule or the fixer. It enforces the ownership rule every other map fixer here
// already follows (#inherited-problem-not-yours): a supply area the mod does not ship is not the mod's to
// report or rewrite. It reports the mod's own split areas ONCE, not once per area. And it stops stating a
// launch crash as fact. Whether Auto-fix should rewrite a mod's OWN authored areas is left as it was, and
// flagged for the owner, because deciding that needs a launch rather than a guess.
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (detail == null ? "" : "   " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 220)));
  if (!ok) fails.push(label);
};

const HOME = fs.mkdtempSync(path.join(os.tmpdir(), "nova-sa-home-"));
process.env.NOVA_HOME_DIR = HOME;
const md = require("./map-data.js");
const tmps = [HOME];
const mk = (p, c) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, c); };

// Provinces 1-3 in region 10, 4-6 in region 20. States: 1={1} 2={2} 3={4} 4={5} 5={3} 6={6}.
function writeWorld(root) {
  mk(path.join(root, "map", "definition.csv"),
    ["0;0;0;0;land;false;unknown;0"].concat([1, 2, 3, 4, 5, 6].map((i) => `${i};${i * 20};0;0;land;false;plains;1`)).join("\r\n") + "\r\n");
  mk(path.join(root, "map", "strategicregions", "10-R10.txt"), 'strategic_region = {\n\tid = 10\n\tname = "R10"\n\tprovinces = { 1 2 3 }\n}\n');
  mk(path.join(root, "map", "strategicregions", "20-R20.txt"), 'strategic_region = {\n\tid = 20\n\tname = "R20"\n\tprovinces = { 4 5 6 }\n}\n');
  const st = (id, p) => `state = {\n\tid = ${id}\n\tname = "STATE_${id}"\n\tmanpower = 1000\n\tstate_category = rural\n\tprovinces = { ${p} }\n\thistory = { owner = AAA }\n}\n`;
  mk(path.join(root, "history", "states", "1-S.txt"), st(1, 1));
  mk(path.join(root, "history", "states", "2-S.txt"), st(2, 2));
  mk(path.join(root, "history", "states", "3-S.txt"), st(3, 4));
  mk(path.join(root, "history", "states", "4-S.txt"), st(4, 5));
  mk(path.join(root, "history", "states", "5-S.txt"), st(5, 3));
  mk(path.join(root, "history", "states", "6-S.txt"), st(6, 6));
}
const area = (id, states) => `supply_area = {\n\tid = ${id}\n\tname = "SUPPLYAREA_${id}"\n\tvalue = 1\n\tstates = { ${states} }\n}\n`;
const splits = (modRoot, gameRoot) => md.validateMapModel(md.buildMapModel({ modRoot, gameRoot, dependencyRoots: [] }))
  .filter((p) => p.rule === "supply_area_split_regions");

try {
  // The BASE layer ships a cross-region supply area of its own — the shape Old World Blues ships 62 of.
  const GAME = fs.mkdtempSync(path.join(os.tmpdir(), "nova-sa-game-")); tmps.push(GAME);
  writeWorld(GAME);
  mk(path.join(GAME, "map", "supplyareas", "1-SupplyArea.txt"), area(1, "1 2 3"));   // state 3 is region 20
  mk(path.join(GAME, "map", "supplyareas", "2-SupplyArea.txt"), area(2, "4 5 6"));   // state 5 is region 10

  console.log("1. ⛔⛔ An add-on that ships no supply areas is neither told off nor rewritten");
  {
    const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-sa-addon-")); tmps.push(mod);
    mk(path.join(mod, "descriptor.mod"), 'name="Addon"\n');

    const rep = splits(mod, GAME);
    rec("⭐⭐⭐ the inherited split areas are not reported as the add-on's problem", rep.length === 0, rep.map((p) => p.message.slice(0, 70)));

    const r = md.fixSupplyAreaRegionSplits({ modRoot: mod, gameRoot: GAME, dependencyRoots: [] });
    rec("⭐⭐⭐ …the fixer changes nothing", r.changed === false && (r.moved || []).length === 0, r);
    rec("⭐⭐⭐ …and no supply-area file was materialised into the add-on",
      !fs.existsSync(path.join(mod, "map", "supplyareas")),
      fs.existsSync(path.join(mod, "map", "supplyareas")) ? fs.readdirSync(path.join(mod, "map", "supplyareas")) : "(none)");
  }

  console.log("\n2. ⭐⭐ A mod's OWN split areas are reported once, without asserting a crash");
  {
    const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-sa-own-")); tmps.push(mod);
    mk(path.join(mod, "descriptor.mod"), 'name="Own"\nreplace_path="map/supplyareas"\n');
    mk(path.join(mod, "map", "supplyareas", "1-SupplyArea.txt"), area(1, "1 2 3"));
    mk(path.join(mod, "map", "supplyareas", "2-SupplyArea.txt"), area(2, "4 5 6"));

    const rep = splits(mod, GAME);
    rec("⭐⭐⭐ two split areas produce ONE report, not one each", rep.length === 1, rep.length);
    const p = rep[0] || {};
    rec("…that names both areas", Array.isArray(p.supplyAreas) && p.supplyAreas.includes(1) && p.supplyAreas.includes(2), p.supplyAreas);
    rec("…and still carries `supplyArea` as the first one, for callers that read the old field", p.supplyArea === 1, p.supplyArea);
    // 2026-09-11: a WARNING, and no crash in the message at all. hoi4.exe (1.19, 55,680,632 bytes) contains the strings
    // "supplyareas", "supply_area" and "SupplyArea" zero times, in ASCII and UTF-16 — while "strategicregions",
    // "map/supply_nodes.txt" and "map/railways.txt" are all there. The game does not read the folder, so nothing in
    // it can crash the game. #a-map-message-matches-what-the-engine-checks
    rec("⭐⭐ a WARNING now — the game does not read map/supplyareas at all", p.severity === "warning", p.severity);
    rec("⭐⭐ the message does not mention a crash", !/crash/i.test(String(p.message)), String(p.message).slice(0, 160));
    rec("⭐⭐ …and says the game does not read supply areas", /(no longer|does not|doesn't) (read|load)/i.test(String(p.message)), String(p.message).slice(0, 200));
    rec("⭐ …since 1.11", /1\.11/.test(String(p.message)), String(p.message).slice(0, 160));
  }

  console.log("\n3. ⭐ The stress fuzzer's contract still holds: a mod's own split is still repaired");
  {
    // test-map-stress.js ships its own supply area, runs ops that split it, then asserts ZERO errors after
    // autoFixMap. The ownership gate must leave that repair in place.
    const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-sa-fuzz-")); tmps.push(mod);
    mk(path.join(mod, "descriptor.mod"),
      'name="Fuzz"\nreplace_path="map"\nreplace_path="map/strategicregions"\nreplace_path="map/supplyareas"\nreplace_path="history/states"\n');
    writeWorld(mod);
    mk(path.join(mod, "map", "supplyareas", "1-SupplyArea.txt"), area(1, "1 2 3"));

    rec("the mod's own split is reported", splits(mod, null).length === 1, splits(mod, null).length);
    const r = md.fixSupplyAreaRegionSplits({ modRoot: mod, gameRoot: null, dependencyRoots: [] });
    rec("⭐⭐ …the fixer repairs it", r.changed === true && (r.moved || []).some((m) => m.state === 3), r);
    rec("⭐⭐ …and the rule is satisfied afterwards", splits(mod, null).length === 0, splits(mod, null).map((x) => x.supplyAreas));
  }

  console.log("\n4. The existing single-area contract (test-map-validate.js)");
  {
    const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-sa-one-")); tmps.push(mod);
    mk(path.join(mod, "descriptor.mod"), 'name="One"\nreplace_path="map"\nreplace_path="map/strategicregions"\nreplace_path="map/supplyareas"\nreplace_path="history/states"\n');
    writeWorld(mod);
    mk(path.join(mod, "map", "supplyareas", "1-SupplyArea.txt"), area(1, "1 2 5"));   // all region 10
    rec("a single-region supply area is not flagged", splits(mod, null).length === 0, splits(mod, null).length);
  }

  console.log(`\n=== a supply-area fix leaves what the mod does not ship: ${checks} checks, ${fails.length} failed ===`);
  if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
} catch (e) {
  console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 10).join("\n") : e);
  process.exitCode = 1;
} finally {
  for (const d of tmps) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} }
}
