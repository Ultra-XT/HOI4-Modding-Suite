// Regression (map campaign, hunt #22 — wiki-spec audit workflow + hand adjudication): 11 map fixes.
//  (1) removeAdjacencyRow matched only one direction — the UI is bidirectional, so removing a row stored
//      in the opposite click-order silently failed AND halted the whole save queue. Now undirected.
//  (2) writeAdjacency "add" stacked a second conflicting row for an existing pair (edit type = 2 rows on
//      disk, HOI4's pick undefined). Now replaces: strips the pair (both orientations) before inserting.
//  (3) writeAdjacency "add": from/to must exist in definition.csv, and so must a sea adjacency's `through`.
//      ⚠️ It need NOT be a sea province — that was an invented rule which made every canal unwritable,
//      vanilla's PANAMA_CANAL, KIEL_CANAL and SUEZ_CANAL included, all three of which pass through LAND.
//      Skipped when no definition.csv resolves (bare fixtures).
//  (4) writeSupplyNode/writeRailway wrote hubs/rails onto sea/lake/missing/STATELESS provinces — HOI4's
//      supply pathfinder divide-by-zero CTD. Now rejected at the writer choke point.
//  (5) validateMapModel gained supply_node_bad_province + railway_bad_province rules (mods can arrive
//      with the damage already on disk).
//  (6) mergeState carried only province-keyed buildings; the source's STATE-LEVEL buildings (factories/
//      infrastructure), resources, and manpower were silently destroyed. Now SUMMED onto the target.
//  (7) createStrategicRegion left claimed provinces in their OLD region too (double membership breaks
//      weather/air) and never wrote weatherpositions rows. (The small+large rule it used was itself wrong
//      and was replaced 2026-09-08 — see #weatherpositions-invented-a-size.)
//  (8) renumberStateId never rekeyed map/buildings.txt's FIRST column (the state id) — every building of
//      a renumbered state stayed keyed to the dead id (naval-base anchor crash class).
//  (9) fixSeaProvinceLeftovers cleaned sea-in-land-STATE but left the province in its land strategic
//      REGION (dead-water CTD, the real MD crash class). Now re-files into the adjacent naval region.
// Run: node test-map-campaign-fixes.js
"use strict";
const fs = require("fs"), os = require("os"), path = require("path");
const M = require("./map-data.js");
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log("  PASS", n); } else { fail++; console.log("  FAIL", n, x != null ? "→ " + JSON.stringify(String(x).slice(0, 220)) : ""); } };

const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-mapfix-"));
const w = (rel, body) => { const p = path.join(mod, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, body); };

// Fixture: 5 provinces — 1,2 land in state 1; 4 land in state 2; 3 sea; 5 land STATELESS.
w("map/definition.csv", [
  "0;0;0;0;land;false;unknown;0",
  "1;10;10;10;land;true;plains;1",
  "2;20;20;20;land;false;plains;1",
  "3;30;30;30;sea;false;ocean;0",
  "4;40;40;40;land;true;plains;1",
  "5;50;50;50;land;false;plains;1",
].join("\n") + "\n");
w("history/states/1-One.txt", `state = {\n\tid = 1\n\tname = "STATE_1"\n\tmanpower = 1000\n\tstate_category = rural\n\tresources = {\n\t\tsteel = 10\n\t}\n\tprovinces = {\n\t\t1 2\n\t}\n\thistory = {\n\t\towner = AAA\n\t\tbuildings = {\n\t\t\tindustrial_complex = 3\n\t\t\tinfrastructure = 2\n\t\t}\n\t\tvictory_points = { 1 5 }\n\t}\n}\n`);
w("history/states/2-Two.txt", `state = {\n\tid = 2\n\tname = "STATE_2"\n\tmanpower = 500\n\tstate_category = rural\n\tresources = {\n\t\tsteel = 4\n\t}\n\tprovinces = {\n\t\t4\n\t}\n\thistory = {\n\t\towner = AAA\n\t\tbuildings = {\n\t\t\tindustrial_complex = 1\n\t\t}\n\t}\n}\n`);
w("map/adjacencies.csv", "From;To;Type;Through;start_x;start_y;stop_x;stop_y;adjacency_rule_name;Comment\n1;4;impassable;-1;-1;-1;-1;-1;-1;\n-1;-1;-1;-1;-1;-1;-1;-1;-1\n");
w("map/supply_nodes.txt", "1 1\n");
w("map/railways.txt", "3 2 1 2\n");
w("map/strategicregions/1-land.txt", `strategic_region={\n\tid=1\n\tname="R1"\n\tprovinces={ 1 2 4 5 }\n\tweather={\n\t\tperiod={\n\t\t\tbetween={ 0.0 364.0 }\n\t\t\ttemperature={ -5.0 25.0 }\n\t\t\tno_phenomenon=0.700\n\t\t}\n\t}\n}\n`);
w("map/strategicregions/2-sea.txt", `strategic_region={\n\tid=2\n\tname="R2"\n\tprovinces={ 3 }\n\tweather={\n\t\tperiod={\n\t\t\tbetween={ 0.0 364.0 }\n\t\t\ttemperature={ -5.0 25.0 }\n\t\t\tno_phenomenon=0.700\n\t\t}\n\t}\n}\n`);
w("map/weatherpositions.txt", "1;100.00;9.90;100.00;small\n1;110.00;9.90;110.00;large\n2;200.00;9.90;200.00;small\n2;210.00;9.90;210.00;large\n");
w("map/buildings.txt", "1;arms_factory;10.00;9.60;10.00;0.00;0\n1;naval_base;12.00;9.60;12.00;0.00;3\n2;arms_factory;40.00;9.60;40.00;0.00;0\n");

const opts = { modRoot: mod, gameRoot: null, dependencyRoots: [] };
const adjText = () => fs.readFileSync(path.join(mod, "map", "adjacencies.csv"), "utf8");

// ── (1) undirected remove ──
{
  const r = M.removeAdjacencyRow("From;To;Type;Through;a;b;c;d;e;f\n1;4;impassable;-1;-1;-1;-1;-1;-1;\n-1;-1;-1;-1;-1;-1;-1;-1;-1\n", 4, 1);
  ok("remove matches the REVERSED orientation", r.removed === 1, r.removed);
}
// ── (2)+(3) add replaces + validates ──
{
  const bad = M.writeAdjacency({ ...opts, action: "add", from: 1, to: 999, type: "impassable" });
  ok("add rejects a from/to missing from definition.csv", !bad.changed && /does not exist/.test(bad.error || ""), bad.error);
  // #a-canal-goes-through-land — this used to assert the opposite, that a LAND `through` is rejected.
  // That rule was invented: it made every canal unwritable, including the three the base game ships
  // (PANAMA_CANAL through 7617, KIEL_CANAL through 6257, SUEZ_CANAL through 1155 — all land). A sea route
  // cut through land is what a canal IS, and the wiki defines `through` only as "a province that serves as
  // a gateway for the adjacency for the sea type". See test-a-canal-goes-through-land.js for the
  // vanilla-derived evidence. Province 2 in this fixture is land.
  const canal = M.writeAdjacency({ ...opts, action: "add", from: 1, to: 4, type: "sea", through: 2 });
  ok("sea adjacency ACCEPTS a land through province — that is a canal", canal.changed, canal.error);
  // …but the province still has to exist. Relaxing the type must not relax that.
  const noThr = M.writeAdjacency({ ...opts, action: "add", from: 1, to: 4, type: "sea", through: 999 });
  ok("…while a through province missing from definition.csv is still rejected",
    !noThr.changed && /does not exist/.test(noThr.error || ""), noThr.error);
  const okSea = M.writeAdjacency({ ...opts, action: "add", from: 1, to: 4, type: "sea", through: 3 });
  ok("sea strait accepts a real sea through", okSea.changed === true, okSea.error);
  const rows = adjText().split(/\r?\n/).filter((l) => /^(1;4|4;1);/.test(l));
  ok("add REPLACED the existing pair row (exactly one row, type sea)", rows.length === 1 && /;sea;/.test(rows[0]), rows.join(" | "));
  const rem = M.writeAdjacency({ ...opts, action: "remove", from: 4, to: 1 });
  ok("reverse-order remove now persists", rem.changed === true && rem.removed === 1, JSON.stringify(rem));
}
// ── (4) supply/rail write guards ──
{
  const sSea = M.writeSupplyNode({ ...opts, action: "add", province: 3 });
  ok("supply hub on SEA rejected", !sSea.changed && /sea/i.test(sSea.error || ""), sSea.error);
  const sNoState = M.writeSupplyNode({ ...opts, action: "add", province: 5 });
  ok("supply hub on STATELESS land rejected", !sNoState.changed && /no state/.test(sNoState.error || ""), sNoState.error);
  const sOk = M.writeSupplyNode({ ...opts, action: "add", province: 2 });
  ok("supply hub on stateful land accepted", sOk.changed === true, sOk.error);
  const rSea = M.writeRailway({ ...opts, action: "add", provinces: [1, 3] });
  ok("railway through SEA rejected", !rSea.changed && /sea/i.test(rSea.error || ""), rSea.error);
  const rOne = M.writeRailway({ ...opts, action: "add", provinces: [1] });
  ok("railway with <2 provinces rejected", !rOne.changed && /at least 2/.test(rOne.error || ""), rOne.error);
  const rOk = M.writeRailway({ ...opts, action: "add", provinces: [1, 4], level: 1 });
  ok("railway on stateful land accepted", rOk.changed === true, rOk.error);
}
// ── (5) validator rules on already-damaged files ──
{
  w("map/supply_nodes.txt", "1 3\n");   // hub on sea
  w("map/railways.txt", "3 2 1 5\n");   // rail through stateless
  const model = M.buildMapModel(opts);
  const probs = M.validateMapModel(model);
  ok("validate flags supply_node_bad_province", probs.some((p) => p.rule === "supply_node_bad_province"), probs.map((p) => p.rule).join(","));
  ok("validate flags railway_bad_province", probs.some((p) => p.rule === "railway_bad_province"), probs.map((p) => p.rule).join(","));
}
// ── (6) merge carries state-level payload ──
{
  const r = M.mergeState({ ...opts, sourceStateId: 2, targetStateId: 1 });
  ok("merge ran", r.changed === true, JSON.stringify(r).slice(0, 160));
  const oneTxt = fs.readFileSync(path.join(mod, "history", "states", "1-One.txt"), "utf8");
  ok("target got SUMMED industrial_complex (3+1=4)", /industrial_complex\s*=\s*4/.test(oneTxt), oneTxt.slice(0, 400));
  ok("target got SUMMED steel (10+4=14)", /steel\s*=\s*14/.test(oneTxt), oneTxt);
  ok("target got SUMMED manpower (1000+500=1500)", /manpower\s*=\s*1500/.test(oneTxt), oneTxt);
  ok("target owns the moved province 4", /provinces\s*=\s*\{[^}]*\b4\b/.test(oneTxt), oneTxt);
}
// ── (7) create-region: no double membership + weatherpositions rows ──
{
  const r = M.createStrategicRegion({ ...opts, provinces: [4] });
  ok("create-region ok", r.ok === true, r.error);
  const r1 = fs.readFileSync(path.join(mod, "map", "strategicregions", "1-land.txt"), "utf8");
  ok("province 4 REMOVED from its old region", !/provinces=\{[^}]*\b4\b[^}]*\}/.test(r1.replace(/\s+/g, "")), r1);
  const wp = fs.readFileSync(path.join(mod, "map", "weatherpositions.txt"), "utf8");
  // ⚠️ 2026-09-08: this asserted a "small" row AND a "large" row, which was the rule the writer invented.
  // Measured over vanilla and five workshop maps: the tokens in use are `big` and `small`, **"large" appears
  // zero times anywhere**, no region carries both a small and a large, and the normal shape is TWO ROWS OF
  // THE SAME SIZE. #weatherpositions-invented-a-size
  //
  // The writer now derives the token from the file it is editing. This fixture's file uses small and large,
  // so "small" is its most-used token — assert the derived property, not a literal, or this becomes the same
  // hardcoded rule one layer up.
  const rows = wp.split(/\r?\n/).filter((l) => l.split(";")[0] === String(r.id)).map((l) => l.split(";")[4]);
  ok("weatherpositions got rows for the new region", rows.length === 2, wp);
  ok("…two of them, the same size, as every shipping map does", new Set(rows).size === 1, rows);
  ok("…using a token this file already uses, not an invented one", wp.split(/\r?\n/).some((l) => l.split(";")[0] !== String(r.id) && l.split(";")[4] === rows[0]), rows);
}
// ── (8) renumber rekeys buildings.txt ──
{
  const rep = M.renumberStateId(mod, 1, 7, { gameRoot: null, dependencyRoots: [] });
  ok("renumber reports buildings rows rekeyed", (rep.buildingsRows || 0) >= 2, JSON.stringify(rep));
  const b = fs.readFileSync(path.join(mod, "map", "buildings.txt"), "utf8");
  ok("buildings.txt rows now keyed to the NEW id", /^7;arms_factory/m.test(b) && /^7;naval_base/m.test(b), b);
  ok("no rows left on the old id", !/^1;/m.test(b), b);
  ok("other states' rows untouched", /^2;arms_factory/m.test(b), b);
}

try { fs.rmSync(mod, { recursive: true, force: true }); } catch (_) {}
console.log(`\nMAP-CAMPAIGN-FIXES: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
