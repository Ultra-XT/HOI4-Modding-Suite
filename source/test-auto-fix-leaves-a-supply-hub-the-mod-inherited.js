// An add-on is not told about a supply hub or railway on a bad province that it only inherited, and one Auto-fix click
// never copies a base layer's supply_nodes.txt, railways.txt or buildings.txt in to remove what that layer ships.
// #auto-fix-leaves-a-supply-hub-the-mod-inherited
//
// THE DEFECT. supply_node_bad_province and railway_bad_province reported every hub and railway on a sea, missing or
// stateless province in the merged map, whoever ships them, and fixWaterSupplyRail's whole-map sweep removed every hub on
// sea or stateless water, split every such railway and dropped every floating harbour anchored to water — copying the file
// into the mod to do it. Neither asked whose it was.
//
// MEASURED on the base commit 21808ba, through the endpoints the Map Errors popup calls (GET /api/map/validate, then POST
// /api/map/auto-fix { modPath }), on mkdtemp add-ons carrying one problem of their own:
//   * over the installed Old World Blues, the validator reported supply_node_bad_province for OWB's own hub on sea province
//     107 (OWB launches with it), and one click wrote OWB's map/supply_nodes.txt (15,398 B, the hub removed) into the add-on;
//   * over the installed Millennium Dawn, the validator reported nothing of the kind, and one click wrote MD's
//     map/buildings.txt into the add-on to drop a floating harbour MD anchors to water (harborRemoved 1).
// Each copy then shadows the dependency's own file.
//
// THE FIX. baseSupplyRailProblems: the hubs, railway provinces and water-anchored harbours the layers below already have,
// judged with the validator's own badRef (supplyProvinceProblemRef) on the highest layer below. The two rules and the sweep
// subtract them. The erase path, which names the provinces it is turning to water right now, is unchanged; a hub on a province
// the add-on's own edit made sea is still reported and removed (section 2).
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

let checks = 0, skips = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (ok || detail == null ? "" : "   -> " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 320)));
  if (!ok) fails.push(label);
};
const skip = (label) => { skips++; console.log("  SKIP " + label); };

const HOME = fs.mkdtempSync(path.join(os.tmpdir(), "nova-inhsupply-home-"));
process.env.NOVA_HOME_DIR = HOME;
const md = require("./map-data.js");
const tmps = [HOME];

function dir(tag, files) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "nova-inhsupply-" + tag + "-")); tmps.push(d);
  for (const [rel, body] of Object.entries(files)) {
    const p = path.join(d, ...rel.split("/"));
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, body);
  }
  return d;
}
const has = (d, rel) => fs.existsSync(path.join(d, ...rel.split("/")));
const lines = (d, f) => fs.readFileSync(path.join(d, "map", f), "utf8").split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
// 1, 2, 3, 5 land in state 1 · 4 sea
const DEF = (two = "land") => ["0;0;0;0;land;false;unknown;0", "1;10;0;0;land;false;plains;1", `2;20;0;0;${two};false;${two === "sea" ? "ocean" : "plains"};${two === "sea" ? 0 : 1}`,
  "3;30;0;0;land;false;plains;1", "4;40;0;0;sea;false;ocean;0", "5;50;0;0;land;false;plains;1"].join("\r\n") + "\r\n";
const STATE = (manpower) => `state = {\n\tid = 1\n\tname = "STATE_1"\n\tmanpower = ${manpower}\n\tstate_category = rural\n\tprovinces = { 1 2 3 5 }\n\thistory = {\n\t\towner = AAA\n\t}\n}\n`;
const GAME = dir("game", {
  "map/definition.csv": DEF(),
  "map/supply_nodes.txt": "1 2\n",
  "map/railways.txt": "1 3 1 2 3 \n",
  "map/buildings.txt": "1;arms_factory;0.0;9.5;0.0;0.0;0\n1;floating_harbor;0.0;9.5;0.0;0.0;1\n",
  "history/states/1-A.txt": STATE(1000),
});
// The Old World Blues / Millennium Dawn shape: a dependency shipping a hub on sea 4, a railway through it, and a floating
// harbour anchored to it.
const DEP = dir("dep", {
  "descriptor.mod": 'name="Dep"\n',
  "map/supply_nodes.txt": "1 2\n1 4\n",
  "map/railways.txt": "1 3 1 2 3 \n1 3 3 4 5 \n",
  "map/buildings.txt": "1;arms_factory;0.0;9.5;0.0;0.0;0\n1;floating_harbor;0.0;9.5;0.0;0.0;4\n",
});
const supplyReports = (modRoot, deps) => {
  const probs = md.validateMapModel(md.buildMapModel({ modRoot, gameRoot: GAME, dependencyRoots: deps || [], cacheStableLayers: false }));
  const of = (rule) => probs.filter((p) => p.rule === rule).flatMap((p) => p.provinces || []);
  return { nodes: of("supply_node_bad_province"), rails: of("railway_bad_province") };
};
const noMapFiles = (d) => !has(d, "map/supply_nodes.txt") && !has(d, "map/railways.txt") && !has(d, "map/buildings.txt");

try {
  console.log("\n=== THE CONTROL: the dependency is told about its own ===");
  {
    const own = supplyReports(DEP);
    rec("the dependency, validated on its own over the game, reports its hub and its railway on sea 4", own.nodes.join() === "4" && own.rails.join() === "4", own);
  }

  console.log("\n=== 1. an add-on with one problem of its own: the dependency's supply network is neither reported nor rewritten ===");
  {
    const files = { "descriptor.mod": 'name="Addon"\ndependencies={ "Dep" }\n', "history/states/1-A.txt": STATE(0) };
    const a = dir("addon", files);
    const opts = { modRoot: a, gameRoot: GAME, dependencyRoots: [DEP] };
    const told = supplyReports(a, [DEP]);
    rec("⭐⭐⭐ the validator tells the add-on nothing about the dependency's hub or railway", !told.nodes.length && !told.rails.length, told);
    const r = md.fixWaterSupplyRail(opts);
    rec("⭐⭐⭐ the water cleanup removes none of the dependency's hubs, railways or harbours", !!r && r.changed === false
      && !r.supplyRemoved && !r.railFixed && !r.railRemoved && !r.harborRemoved, r);
    rec("⭐⭐⭐ …and copies no supply_nodes.txt, railways.txt or buildings.txt into the add-on", noMapFiles(a),
      { supply: has(a, "map/supply_nodes.txt"), rail: has(a, "map/railways.txt"), buildings: has(a, "map/buildings.txt") });
    const c = dir("addon-click", { ...files, "descriptor.mod": 'name="AddonClick"\ndependencies={ "Dep" }\n' });
    const r1 = md.autoFixMap({ modRoot: c, gameRoot: GAME, dependencyRoots: [DEP] });
    rec("the click ran every fixer — it was not 'nothing to fix'", !!r1 && r1.ok === true && !r1.nothingToFix, r1 && (r1.error || r1.note));
    rec("…and repaired the add-on's own problem", ((r1.fixes || {}).noManpower || {}).fixed === 1, (r1.fixes || {}).noManpower);
    rec("⭐⭐⭐ the whole click leaves the dependency's supply network alone and copies none of its files in",
      ((r1.fixes || {}).waterSupplyRail || {}).changed === false && noMapFiles(c), { waterSupplyRail: (r1.fixes || {}).waterSupplyRail, files: noMapFiles(c) });
  }

  console.log("\n=== 2. …but a hub on a province the add-on's own edit made sea IS reported and removed ===");
  {
    // The add-on's definition.csv turns land 2 — where both the game and the dependency keep a hub — into sea.
    const a = dir("addon-own", { "descriptor.mod": 'name="AddonOwn"\ndependencies={ "Dep" }\n', "map/definition.csv": DEF("sea") });
    const opts = { modRoot: a, gameRoot: GAME, dependencyRoots: [DEP] };
    const told = supplyReports(a, [DEP]);
    rec("⭐⭐⭐ the validator reports the hub and the railway on 2, and not the dependency's on 4", told.nodes.join() === "2" && told.rails.join() === "2", told);
    const r = md.fixWaterSupplyRail(opts);
    rec("⭐⭐ the cleanup removes that hub", !!r && r.supplyRemoved === 1, r);
    const sn = lines(a, "supply_nodes.txt"), rw = lines(a, "railways.txt");
    rec("⭐⭐ …in the add-on's copy, keeping the dependency's hub on 4 as the dependency wrote it", !sn.includes("1 2") && sn.includes("1 4"), sn);
    rec("⭐⭐ the railway through 2 is split away, and the dependency's railway through 4 is kept byte for byte", !rw.some((l) => l.split(/\s+/).slice(2).includes("2")) && rw.includes("1 3 3 4 5"), rw);
    rec("⭐ …and the dependency's harbour anchored to 4 is not touched: no buildings.txt is copied in", !has(a, "map/buildings.txt") && !r.harborRemoved, r);
  }

  console.log("\n=== 3. the real Old World Blues and Millennium Dawn (read-only; only temp add-ons are written) ===");
  {
    const VAN = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
    const OWB = "D:/SteamLibrary/steamapps/workshop/content/394360/2265420196";
    const MD = "D:/SteamLibrary/steamapps/workshop/content/394360/2777392649";
    if (!fs.existsSync(path.join(OWB, "map", "supply_nodes.txt")) || !fs.existsSync(path.join(VAN, "map", "definition.csv"))) {
      skip("Old World Blues or the base game is not installed — the OWB half did NOT run");
    } else {
      const t0 = Date.now();
      const ownProbs = md.validateMapModel(md.buildMapModel({ modRoot: OWB, gameRoot: VAN, dependencyRoots: [], cacheStableLayers: true }));
      const own = ownProbs.filter((p) => p.rule === "supply_node_bad_province").flatMap((p) => p.provinces || []);
      rec("THE CONTROL: Old World Blues reports its own hub on a bad province", own.length > 0, own);
      const a = dir("addon-owb", { "descriptor.mod": 'name="OWB addon"\ndependencies={ "Old World Blues" }\n' });
      const opts = { modRoot: a, gameRoot: VAN, dependencyRoots: [OWB] };
      const told = md.validateMapModel(md.buildMapModel({ ...opts, cacheStableLayers: true })).filter((p) => p.rule === "supply_node_bad_province" || p.rule === "railway_bad_province");
      rec(`⭐⭐⭐ an add-on over OWB is told none of OWB's (${own.join(", ")})`, told.length === 0, told.map((p) => [p.rule, p.provinces]));
      const r = md.fixWaterSupplyRail(opts);
      rec(`⭐⭐⭐ …the water cleanup removes none of them (${Date.now() - t0} ms)`, !!r && r.changed === false, r);
      rec("⭐⭐⭐ …and copies none of OWB's supply files into it", noMapFiles(a));
    }
    if (!fs.existsSync(path.join(MD, "map", "buildings.txt"))) {
      skip("Millennium Dawn is not installed — the MD half did NOT run");
    } else {
      const t0 = Date.now();
      const a = dir("addon-md", { "descriptor.mod": 'name="MD addon"\ndependencies={ "Millennium Dawn: A Modern Day Mod" }\n' });
      const r = md.fixWaterSupplyRail({ modRoot: a, gameRoot: VAN, dependencyRoots: [MD] });
      rec(`⭐⭐⭐ an add-on over MD has none of MD's floating harbours dropped (${Date.now() - t0} ms)`, !!r && r.changed === false && !r.harborRemoved, r);
      rec("⭐⭐⭐ …and no copy of MD's buildings.txt is written into it", noMapFiles(a));
    }
  }
} catch (e) {
  console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 10).join("\n") : e);
  fails.push("harness error");
} finally {
  for (const d of tmps) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} }
}
console.log(`\n=== auto-fix leaves a supply hub the mod inherited: ${checks} checks, ${fails.length} failed${skips ? `, ${skips} SKIPPED (not counted as passes)` : ""} ===`);
if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
