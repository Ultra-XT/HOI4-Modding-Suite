// ⛔ #an-empty-capital-of-a-landless-country-is-deleted — THE PAGE'S HALF (tool campaign B2-2 / B1-4, the owner's decision; B2-27; B2-18).
//
// ↔ Move province and 🧹 Erase delete the state they empty, except a capital (deleteEmptiedStates' keptCapitals), and the line said "set a new
// capital or move a province into it". For a capital that only countries with NO land name (G0's BOS at state 104, BRA's), neither step
// exists — 🏛 Set capital sets the state OWNER's capital, and no Map tool moves a province INTO an empty state — so the Save left the FATAL
// empty_capital_state that nothing cleared. The decision: such a state is deleted, as fixEmptyStates now deletes it (map-data.js
// countriesThatOwnLand, the same question: does any tag that names it own a state with a province?), and the line says what that leaves,
// capital_state_missing_no_land, a warning HOI4 loads past. A state a country WITH land names is kept, as before, and the line names the step a
// Map tool can take: 🏛 Set capital on one of that country's states.
// B2-27: 🗑 Delete's confirm for a capital said "Save will stop for it" for a landless country too; it now follows the rule the delete
// leaves, and whether Save stops for that rule is the curated fatal set's (map-rule-labels.js isFatalRule).
// B2-18: 🗑 Delete on a new state not saved yet said "will leave them in NO state"; it discards the state and puts its provinces back.
//
// The page's own functions on a fake DOM (testlib-state-panel-page.js), each write sent to map-data.js as server.js's handler passes it.
// Binds no port. Run: node test-an-empty-capital-of-a-landless-country-is-deleted-on-the-page.js
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-landless-capital-page-"));
process.env.APPDATA = path.join(ROOT, "appdata"); process.env.NOVA_APP_DATA_DIR = process.env.APPDATA; process.env.XDG_CONFIG_HOME = process.env.APPDATA;
process.env.NOVA_HOME_DIR = path.join(ROOT, "home");
fs.mkdirSync(process.env.APPDATA, { recursive: true });
fs.mkdirSync(process.env.NOVA_HOME_DIR, { recursive: true });
const md = require("./map-data.js");
const L = require("./testlib-state-panel-page.js");
const ML = require("./public/map-rule-labels.js");

let pass = 0, fail = 0;
const ok = (c, m, x) => {
  if (c) { pass++; console.log("  ok   " + m); }
  else { fail++; console.log("  FAIL " + m + (x !== undefined ? "   -> " + JSON.stringify(x).slice(0, 700) : "")); }
};
const model = (roots) => md.buildMapModel({ ...roots, cacheStableLayers: false });
let seq = 0;
/** testlib's world (state 7 = [3], 3 = [4, 5] …, every state AAA's), with `capitals` as the page's model holds them. */
function world(capitals, { owner7 } = {}) {
  const roots = L.makeWorld(ROOT, `w${++seq}`);
  const pg = L.openPage(md, roots, model(roots));
  pg.ctx.model.capitals = Object.assign({}, capitals);
  if (owner7) pg.ctx.stateById.get(7).owner = owner7;
  return { roots, pg };
}
const onDisk = (roots, sid) => model(roots).states.some((s) => s.id === sid);

console.log("\n-- ⭐⭐⭐ ↔ Move empties a state only a country with NO land names as capital: deleted, and said --");
{
  const { roots, pg } = world({ BOS: 7 });
  const people = Number(pg.state(7).manpower) || 0;
  const line = pg.move(3, 3);
  ok(pg.urls().join() === "move-province,delete-state", "the move and a DELETE are queued (never a merge: mergeState refuses a capital)", pg.urls());
  ok(!pg.ctx.stateById.get(7), "…and the state is gone from the page", null);
  ok(/was the capital only of BOS, which owns no land, so it was deleted too/.test(line) && /HOI4 loads/.test(line) && /warning, not a stop/.test(line), "…the line says why, and what that leaves", line);
  ok(!/set a new capital or move a province into it/.test(line), "…and no longer names steps no Map tool can take", line);
  // (review of the fix) deleted, not merged as every other state a Move empties is: what a merge would have carried is lost, and said
  ok(people > 0 && line.includes(`its ${people.toLocaleString()} people`) && /not merged into the state that took its last province/.test(line) && /go with it/.test(line),
    "…and what goes with it: it is deleted, not merged, so its people are not carried into state 3, and the line says so", { people, line });
  const out = pg.save();
  ok(out.every((r) => !r.error) && !onDisk(roots, 7), "the Save writes both: state 7 is gone from the files", out.map((r) => r.error || "ok"));
}

console.log("\n-- CONTROL: a capital a country WITH land names is kept, and the line names 🏛 Set capital --");
{
  const { pg } = world({ AAA: 7 });
  const line = pg.move(3, 3);
  ok(pg.urls().join() === "move-province" && pg.ctx.stateById.get(7), "only the move is queued; the state stays", pg.urls());
  ok(/is now empty AND is AAA's capital/.test(line) && /🏛 Set capital/.test(line) && /Undo/.test(line), "…and the line gives a step a Map tool can take", line);
}
{
  const { pg } = world({ AAA: 7, BOS: 7 });
  pg.move(3, 3);
  ok(pg.urls().join() === "move-province" && pg.ctx.stateById.get(7), "a capital of BOTH a landless country and one with land is kept", pg.urls());
}

console.log("\n-- ⭐⭐ 🧹 Erase, the same (B1-4) --");
{
  const { pg } = world({ BOS: 7 });
  pg.erase(3);
  const line = pg.last();
  ok(pg.urls().join() === "flip-province-sea,delete-state", "the flip and the delete are queued", pg.urls());
  ok(/was the capital only of BOS, which owns no land, so it was deleted too/.test(line), "…and said", line);
  ok(!/not merged into the state that took/.test(line), "…with nothing said of a merge: an Erase has no state that took the land", line);
}
{
  const { pg } = world({ AAA: 7 });
  pg.erase(3);
  const line = pg.last();
  ok(pg.urls().join() === "flip-province-sea" && pg.ctx.stateById.get(7) && /🏛 Set capital/.test(line), "CONTROL: AAA's capital is kept, and the line names 🏛 Set capital", { q: pg.urls(), line });
}

console.log("\n-- ⭐ B2-27: 🗑 Delete's confirm follows the rule the delete leaves --");
{
  const { pg } = world({ CCC: 7 }, { owner7: "CCC" });
  pg.ctx.window.NovaMapRuleLabels = ML;
  const asked = pg.deleteState(7, 3);
  ok(/CCC owns no land once it is gone/.test(asked[0]) && /Save reports it as a warning and does not stop/.test(asked[0]) && !/Save will stop/.test(asked[0]), "a country left with no land: Save does not stop", asked[0]);
}
{
  const { pg } = world({ AAA: 7 });
  pg.ctx.window.NovaMapRuleLabels = ML;
  const asked = pg.deleteState(7, 3);
  ok(/AAA owns land once it is gone, so Save will stop for its capital: give it another capital with 🏛 Set capital first/.test(asked[0]), "a country that keeps land: Save stops, and the step is named", asked[0]);
}
{
  // the words are the fatal set's: were capital_state_missing_no_land ever made to stop Save, the confirm would say so
  const { pg } = world({ CCC: 7 }, { owner7: "CCC" });
  pg.ctx.window.NovaMapRuleLabels = Object.assign({}, ML, { isFatalRule: (r) => r === "capital_state_missing_no_land" || ML.isFatalRule(r) });
  const asked = pg.deleteState(7, 3);
  ok(/CCC owns no land once it is gone, so Save will stop for its capital\./.test(asked[0]), "…derived: a fatal set that stops for it is said as a stop", asked[0]);
  ok(ML.isFatalRule("capital_state_missing") && !ML.isFatalRule("capital_state_missing_no_land"), "(and the curated set today: missing stops, _no_land does not)");
}

console.log("\n-- B2-18: 🗑 Delete on a new state not saved yet says it discards it and puts its provinces back --");
{
  const { pg } = world({});
  const id = pg.newState("AAA");
  pg.ctx.moveTarget = id;
  pg.ctx.doMoveProvince(4, 3, id); pg.ctx.doMoveProvince(8, 4, id);   // one province each out of states 3 = [4, 5] and 4 = [8, 12]
  pg.ctx.moveTarget = null;
  const asked = pg.deleteState(id, 4);
  const q = asked.find((t) => /new state/.test(t)) || asked.join(" | ");
  ok(/has not been saved yet/.test(q) && /its 2 provinces go back to where they came from/.test(q) && !/NO state/.test(q), "the confirm says what happens", asked);
  ok(/2 provinces went back to where they came from/.test(pg.last()), "…and the line after it agrees", pg.last());
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
