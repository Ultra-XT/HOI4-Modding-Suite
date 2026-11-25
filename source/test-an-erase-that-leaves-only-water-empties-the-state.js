// ⛔ #an-erase-that-leaves-only-water-empties-the-state (B1-29, the page part) — 🧹 ERASING A STATE'S LAST LAND EMPTIES IT, EVEN WHEN IT ALSO LISTS A LAKE.
//
// The Erase brush called a state emptied only when it listed no province at all. A state that also lists a lake (vanilla's 507, lake 8913)
// was left standing on the lake: nothing was said at the click, the emptied-state handling never ran, and state_owns_no_land stayed after
// the Save (the campaign's repro-B1-29). The click now counts LAND; what the state still lists is water, so the mod's own state is deleted
// by the same emptied-state handling (its water stays where it is, in no state), or, with 🛠 Auto-fix off, the line says it has no land
// left and what clears it. It is not called EMPTY: HOI4 loads a state with no land (state_owns_no_land is an error, not a crash).
//
// RUN, not grepped: the page's own eraseProvinceLocal, commitEraseStroke and deleteEmptiedStates (lifted from public/map.js) on a small
// model. (A copy of a base-game or dependency state is the Q4 refusal's, #emptying-a-base-state-is-refused-at-the-click, so it is not here.)
"use strict";
const P = require("./testlib-map-page.js");

let checks = 0; const fails = [];
const ok = (c, m, d) => { checks++; if (c) console.log("  ✓ " + m); else { fails.push(m); console.log("  ✗ " + m + (d !== undefined ? "  " + JSON.stringify(d).slice(0, 500) : "")); } };

const LIFTS = ["function eraseProvinceLocal(pid)", "function beginEraseStroke()", "function commitEraseStroke()", "function deleteEmptiedStates(emptied, intoStateId)", "function queueWrite(url, body, meta)"];
function page(model, autoFix) {
  const types = new Map(), defs = new Map();
  for (const p of model.provinces) { types.set(p.id, p.type); defs.set(p.id, p); }
  return P.runPage(LIFTS, P.loadGlobals({
    $: () => null, model, provinceType: types, provinceDef: defs, provNeighborsCache: new Map(), buildProvNeighbors: () => {},
    stateById: new Map((model.states || []).map((s) => [s.id, s])), provinceToOwner: Object.assign({}, model.provinceToOwner || {}),
    pendingWrites: [], paintDiff: new Map(), erasedThisStroke: new Set(), eraseEmptied: new Set(), eraseSkippedInland: new Set(), eraseHeld: new Map(),
    eraseSupplyRail: null, autoFix, flushMapSaves: Object.assign(function flushMapSaves() {}, { running: null }),
    pushUndo: () => {}, paintDropRefusal: () => "", unmirrorDroppedMove: () => {}, moveProvinceLevels: () => {}, setProvinceRegionLocally: () => {},
    mirrorLandTurnedWater: () => null, landTurnedWaterRailWords: () => "", emptiedStatesYardWords: () => "", inheritedEmptyWarning: () => "\n(inherited)",
    stateNavalLevels: () => [], navalLevelsWords: () => ({ text: "" }), railPanelOpen: () => false, renderRailPanel: () => {}, recolorAll: () => {}, draw: () => {},
  }));
}
/** state 10 = coastal land 1, 2 and `extra` (a lake 3 by default); state 20 = coastal land 4, 5 */
const model = (extra = { id: 3, type: "lake", coastal: false, terrain: "lakes" }) => {
  const provinces = [1, 2, 4, 5].map((id) => ({ id, type: "land", coastal: true, terrain: "plains" })).concat(extra ? [extra] : []);
  const s10 = [1, 2].concat(extra ? [extra.id] : []);
  return {
    provinces, capitals: {},
    states: [{ id: 10, name: "STATE_10", displayName: "Lakeland", provinces: s10, owner: "AAA" }, { id: 20, name: "STATE_20", displayName: "Dryland", provinces: [4, 5], owner: "AAA" }],
    provinceToState: Object.assign({ 4: 20, 5: 20 }, ...s10.map((p) => ({ [p]: 10 }))),
    provinceToOwner: { 1: "AAA", 2: "AAA", 3: "AAA", 4: "AAA", 5: "AAA" },
  };
};
const erase = (pg, ids) => { pg.sb.beginEraseStroke(); for (const id of ids) pg.sb.eraseProvinceLocal(id); pg.sb.commitEraseStroke(); return String(pg.statuses[pg.statuses.length - 1] || ""); };
const urls = (pg) => pg.sb.pendingWrites.map((w) => w.url.replace("/api/map/", "") + (w.body && w.body.stateId != null ? ":" + w.body.stateId : ""));

console.log("\n-- 1. AUTO-FIX ON: THE MOD'S OWN STATE LEFT HOLDING ONLY A LAKE GOES THE WAY AN EMPTIED STATE GOES --");
{
  const pg = page(model(), true);
  const line = erase(pg, [1, 2]);
  ok(pg.sb.provinceType.get(1) === "sea" && pg.sb.provinceType.get(2) === "sea", "THE CONTROL: both land provinces were erased to sea");
  ok(JSON.stringify(urls(pg)) === JSON.stringify(["flip-province-sea", "flip-province-sea", "delete-state:10"]), "⭐⭐⭐ the stroke queued the two flips AND the delete of state 10, which has no land left", urls(pg));
  ok(!pg.sb.stateById.has(10) && !pg.sb.model.states.some((s) => s.id === 10), "⭐⭐ …and the page's model no longer holds it", pg.sb.model.states.map((s) => s.id));
  ok(pg.sb.model.provinceToState[3] === undefined && pg.sb.provinceToOwner[3] === undefined, "⭐ …and its lake is in no state on the page, as the file will hold it", { state: pg.sb.model.provinceToState[3], owner: pg.sb.provinceToOwner[3] });
  ok(pg.sb.provinceType.get(3) === "lake", "…and the lake stays a lake");
  ok(/Auto-fixed: deleted Lakeland, which had no land left: the water of province 3 stays where it is, in no state\./.test(line), "⭐⭐ the line says the state was deleted for having no land, and where its water goes", line);
  ok(!/now-empty|now EMPTY|will not start a game/.test(line), "⭐ …and does not call it EMPTY or say HOI4 will not start: the game loads a state with no land", line);
}

console.log("\n-- 2. AUTO-FIX OFF: IT IS LEFT, AND THE LINE SAYS WHAT CLEARS IT --");
{
  const pg = page(model(), false);
  const line = erase(pg, [1, 2]);
  ok(JSON.stringify(urls(pg)) === JSON.stringify(["flip-province-sea", "flip-province-sea"]), "THE CONTROL: only the flips are queued", urls(pg));
  ok(pg.sb.stateById.has(10), "…and state 10 stays");
  ok(/Lakeland has no land left, only the water of province 3: HOI4 loads it/.test(line), "⭐⭐ the line says the state has no land left, only its water", line);
  // (the merge with B8-6, #turning-auto-fix-on-says-what-it-leaves: turning Auto-fix on later deletes nothing, so the line no longer offers it)
  ok(/↶ Undo this stroke to give it its land back, or 🔍 Inspect one of its provinces and set its Type to land\./.test(line), "⭐ …and names the steps that clear it", line);
  ok(!/or turn 🛠 Auto-fix on/.test(line) && /Turning 🛠 Auto-fix on now does not delete it/.test(line), "⭐ …and does not offer turning Auto-fix on, which deletes nothing it already left", line);
  ok(!/now EMPTY/.test(line), "…and does not call it EMPTY", line);
}

console.log("\n-- 3. A STATE THAT KEEPS LAND IS NOT EMPTIED; A STATE WITH NO WATER IS EMPTIED AS IT ALWAYS WAS --");
{
  const pg = page(model(), true);
  const line = erase(pg, [1]);
  ok(JSON.stringify(urls(pg)) === JSON.stringify(["flip-province-sea"]) && pg.sb.stateById.has(10), "⭐⭐ erasing one of two land provinces leaves the state, with the lake, as it is", urls(pg));
  ok(!/no land left|deleted/.test(line), "…and the line says nothing of it", line);
  const dry = page(model(), true);
  const dryLine = erase(dry, [4, 5]);
  ok(JSON.stringify(urls(dry)) === JSON.stringify(["flip-province-sea", "flip-province-sea", "delete-state:20"]), "⭐ a state of land only, all erased, is deleted as before", urls(dry));
  ok(/Auto-fixed: deleted the now-empty state Dryland\./.test(dryLine) && !/no land left/.test(dryLine), "…with the words it always had", dryLine);
  const both = page(model(), false);
  const bothLine = erase(both, [1, 2, 4, 5]);
  ok(/Dryland is now EMPTY — HOI4 will not start a game with an empty state/.test(bothLine) && /Lakeland has no land left/.test(bothLine) && !/Lakeland[^\n]*now EMPTY/.test(bothLine), "⭐ with both in one stroke, each is said as what it is", bothLine);
}

console.log("\n-- 4. SEA LISTED IN A STATE IS WATER TOO; A PROVINCE OF NO KNOWN TYPE COUNTS AS LAND --");
{
  const sea = page(model({ id: 3, type: "sea", coastal: false, terrain: "ocean" }), true);
  erase(sea, [1, 2]);
  ok(urls(sea).includes("delete-state:10"), "⭐ a state left listing only a sea province has no land left either", urls(sea));
  const unknown = model(null);
  unknown.states[0].provinces = [1, 2, 9];
  unknown.provinceToState[9] = 10;
  const un = page(unknown, true);
  erase(un, [1, 2]);
  ok(!urls(un).some((u) => u.startsWith("delete-state")) && un.sb.stateById.has(10), "⭐ a province the page has no type for is not assumed to be water", urls(un));
}

console.log(`\n${checks - fails.length}/${checks} checks passed`);
if (fails.length) { console.log("FAILED:\n  " + fails.join("\n  ")); process.exit(1); }
