// ⛔ #an-erase-cuts-the-strategic-locations-of-its-province (tool campaign B1-33).
//
// 🧹 Erase (and the 🔍 inspector's Type → sea, the same flipProvinceToSea) drops the province from its state and cuts its history
// (victory points, province buildings, every date: takeProvinceHistory) — but left each `strategic_province_location` naming it, so
// the state handed a strategic location to open sea no state holds: strategic_location_not_in_state, which no fixer clears and the game
// logs ("Strategic location for province N is in wrong state scope"; Okinawa's 11932 twice on vanilla). The erase now cuts them with
// the victory point, by splice (removeStrategicLocationFromBlock: the caption goes with its line, a block granting another province
// keeps that one), and says so on the Save line.
//   1. flipProvinceToSea of province 1: both locations naming it are gone, the caption with the whole line, `natural_harbor = 2` stays
//      in the block it shared, strategic_state_location stays (nothing knows the game checks it), and the answer's historyCut names them;
//   2. the map check finds no strategic_location_not_in_state after the erase;
//   3. control: a location naming another province of the state is untouched, and a flip of a province no location names cuts none;
//   4. the page's erasedHistoryNote says the strategic locations it cut;
//   5. source (comments masked): flipProvinceToSea's state step asks cutStrategicLocationsOfProvince.
// Binds no port. Run: node test-an-erase-cuts-the-strategic-locations-of-its-province.js
"use strict";
const assert = require("assert");
const fs = require("fs"), os = require("os"), path = require("path");
const md = require("./map-data.js");
const { lift } = require("./testlib-map-page.js");
const { maskJsComments, jsBodyAt } = require("./testlib-strip-comments.js");
let pass = 0;
const ok = (n, c, x) => { assert.ok(c, n + (x !== undefined ? " -> " + JSON.stringify(x).slice(0, 900) : "")); console.log("  ok  " + n); pass++; };
const mk = (p, c) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, c); };
// 1 land (coastal), 2 land (coastal), 3 land (coastal), 4 sea.
const DEF = ["0;0;0;0;land;false;unknown;0", "1;10;0;0;land;true;plains;1", "2;20;0;0;land;true;plains;1", "3;30;0;0;land;true;plains;1",
  "4;40;0;0;sea;false;ocean;0"].join("\n") + "\n";
const STATE = [
  "state = {", "\tid = 1", "\tname = \"S1\"", "\tmanpower = 1000", "\tstate_category = town", "\tprovinces = { 1 2 3 }", "\thistory = {",
  "\t\towner = AAA", "\t\tvictory_points = { 1 5 }",
  "\t\t# the coast the islanders held",
  "\t\tstrategic_province_location = { defensible_coastline = 1 }",
  "\t\tstrategic_province_location = { defensive_chokepoint = 1 natural_harbor = 2 }",
  "\t\tstrategic_state_location = { favorable_approach = 1 }",
  "\t}", "}", ""].join("\n");
const made = [];
function world(label) {
  const mod = fs.mkdtempSync(path.join(os.tmpdir(), `nova-erase-strategic-${label}-`));
  made.push(mod);
  mk(path.join(mod, "descriptor.mod"), 'name="SL"\nreplace_path="history/states"\nreplace_path="map"\n');
  mk(path.join(mod, "map", "definition.csv"), DEF);
  mk(path.join(mod, "map", "strategicregions", "00.txt"), 'strategic_region = { id = 1 name = "R" provinces = { 1 2 3 4 } }');
  mk(path.join(mod, "history", "states", "1-S1.txt"), STATE);
  return mod;
}
const stateText = (mod) => fs.readFileSync(path.join(mod, "history", "states", "1-S1.txt"), "utf8");
const notInState = (mod) => md.validateMapModel(md.buildMapModel({ modRoot: mod })).filter((p) => p.rule === "strategic_location_not_in_state");

try {
  console.log("=== 1-2. the erase of province 1 ===");
  let cutOfOne = null;
  {
    const mod = world("one");
    ok("setup: no strategic_location_not_in_state before the erase", notInState(mod).length === 0, notInState(mod));
    const r = md.flipProvinceToSea({ modRoot: mod, provinceId: 1 });
    ok("the erase is accepted", r && r.changed, r);
    const t = stateText(mod);
    ok("the line granting only province 1 is gone, with the caption above it", !/defensible_coastline/.test(t) && !/the coast the islanders held/.test(t), t);
    ok("the shared line loses only province 1's location: natural_harbor = 2 stays", !/defensive_chokepoint/.test(t) && /strategic_province_location = \{ natural_harbor = 2 \}|strategic_province_location = \{\s*natural_harbor = 2\s*\}/.test(t), t);
    ok("strategic_state_location stays (nothing knows the game checks it)", /strategic_state_location = \{ favorable_approach = 1 \}/.test(t), t);
    ok("the victory point went, as before", !/victory_points/.test(t), t);
    cutOfOne = (r.historyCut || []).find((c) => c.stateId === 1);
    ok("the answer's historyCut names both locations it cut", cutOfOne && JSON.stringify(cutOfOne.strategicLocations) === JSON.stringify(["defensible_coastline", "defensive_chokepoint"]), r.historyCut);
    ok("the map check finds no strategic_location_not_in_state", notInState(mod).length === 0, notInState(mod));
  }

  console.log("=== 3. control: a province no location names ===");
  {
    const mod = world("three");
    const before = stateText(mod);
    const r = md.flipProvinceToSea({ modRoot: mod, provinceId: 3 });
    ok("the erase of 3 is accepted", r && r.changed, r);
    const t = stateText(mod);
    ok("every strategic location line stays as written", ["strategic_province_location = { defensible_coastline = 1 }", "strategic_province_location = { defensive_chokepoint = 1 natural_harbor = 2 }", "# the coast the islanders held"].every((s) => t.includes(s) && before.includes(s)), t);
    ok("…and the answer names none", !((r.historyCut || []).some((c) => (c.strategicLocations || []).length)), r.historyCut);
  }

  console.log("=== 4. the page's erasedHistoryNote ===");
  {
    const erasedHistoryNote = new Function(lift("function erasedHistoryNote(") + "\nreturn erasedHistoryNote;")();
    const line = erasedHistoryNote([cutOfOne], (sid) => `state ${sid} (S1)`);
    ok("the Save line says the strategic locations the erase cut", /strategic locations \(defensible coastline, defensive chokepoint\)/.test(line), line);
  }

  console.log("=== 5. source (comments masked) ===");
  {
    const masked = maskJsComments(fs.readFileSync(path.join(__dirname, "map-data.js"), "utf8"));
    const opening = "function flipProvinceToSea(";
    const at = masked.indexOf(opening);
    if (at < 0 || masked.indexOf(opening, at + 1) !== -1) throw new Error("map-data.js: not found exactly once: " + opening);
    const span = jsBodyAt(masked, at);
    const body = masked.slice(span[0], span[1] + 1);
    const step = body.indexOf("takeProvinceHistory(removeProvinceFromBlock(b, pid), pid)");
    ok("flipProvinceToSea's state step asks cutStrategicLocationsOfProvince on the block it cut", step > 0 && /cutStrategicLocationsOfProvince\s*\(\s*t\.block\s*,\s*pid\s*\)/.test(body.slice(step, step + 300)));
  }
  console.log(`\ntest-an-erase-cuts-the-strategic-locations-of-its-province: ${pass} checks passed`);
} finally {
  for (const d of made) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) { /* a temp fixture of this test's own */ } }
}
