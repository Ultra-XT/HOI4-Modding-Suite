// ⛔ #a-move-that-leaves-only-water-empties-the-state (B1-29's Move twin) — ↔ MOVING A STATE'S LAST LAND OUT EMPTIES IT, EVEN WHEN IT ALSO
// LISTS A LAKE, AS THE ERASE BRUSH ALREADY SAYS IT.
//
// The erase was fixed for this in the B1-29 round (test-an-erase-that-leaves-only-water-empties-the-state.js); ↔ Move province still called a
// state emptied only when it listed no province at all. A state of the mod's own that also lists a lake was left standing on the lake when its
// last land was moved out: nothing was said at the click, the emptied-state handling never ran, and state_owns_no_land stayed after the Save.
// The click now counts LAND, as the Q4 predicate does (baseStatesLeftWithoutLand: only a move that takes land out); what the state still
// lists is water, so the emptied-state handling runs on it: with 🛠 Auto-fix on it is merged into the state that took its last land, the
// water going with it as mergeState moves every province it lists; with Auto-fix off the line says it has no land left and what clears it.
// It is never called EMPTY: HOI4 loads a state with no land (state_owns_no_land is an error, not a crash).
//
// RUN, not grepped: the page's own doMoveProvince, deleteEmptiedStates and the helpers they call (testlib-state-panel-page.js), each write
// sent to map-data.js as server.js's handler passes it, on a small world whose province 13 is a lake. Binds no port.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-move-leaves-water-"));
process.env.APPDATA = path.join(ROOT, "appdata"); process.env.NOVA_APP_DATA_DIR = process.env.APPDATA; process.env.XDG_CONFIG_HOME = process.env.APPDATA;
process.env.NOVA_HOME_DIR = path.join(ROOT, "home");
fs.mkdirSync(process.env.APPDATA, { recursive: true });
fs.mkdirSync(process.env.NOVA_HOME_DIR, { recursive: true });
const md = require("./map-data.js");
const L = require("./testlib-state-panel-page.js");

let pass = 0, fail = 0;
const ok = (c, m, x) => {
  if (c) { pass++; console.log("  ok   " + m); }
  else { fail++; console.log("  FAIL " + m + (x !== undefined ? "   -> " + JSON.stringify(x).slice(0, 700) : "")); }
};
let seq = 0;
/** testlib's world (state 5 = [9, 13], 4 = [8, 12] …) with `lakes` retyped to lakes in definition.csv, as buildMapModel then reads them. */
function world(lakes = [13], { autoFix = true, capitals = null } = {}) {
  const roots = L.makeWorld(ROOT, `w${++seq}`);
  const def = path.join(roots.modRoot, "map", "definition.csv");
  const rows = fs.readFileSync(def, "utf8").split("\n").map((l) => {
    const c = l.split(";");
    return lakes.includes(Number(c[0])) ? [c[0], c[1], c[2], c[3], "lake", "false", "lakes", c[7]].join(";") : l;
  });
  fs.writeFileSync(def, rows.join("\n"));
  const model = md.buildMapModel({ ...roots, cacheStableLayers: false });
  const pg = L.openPage(md, roots, model, { autoFix });
  if (capitals) Object.assign(pg.ctx.model.capitals, capitals);
  return { roots, pg, model };
}
const stateOnDisk = (roots, sid) => L.stateText(roots, sid);
const provsOnDisk = (roots, sid) => ((/provinces\s*=\s*\{([^}]*)\}/.exec(stateOnDisk(roots, sid)) || [])[1] || "").trim().split(/\s+/).filter(Boolean).map(Number).sort((a, b) => a - b);

console.log("\n-- THE CONTROL: the world reads province 13 as a lake, in state 5 with land 9 --");
{
  const { pg, model } = world();
  ok((model.provinces.find((p) => p.id === 13) || {}).type === "lake" && pg.ctx.provinceType.get(13) === "lake", "province 13 is a lake on the page", model.provinces.find((p) => p.id === 13));
  ok(JSON.stringify(pg.state(5).provinces.slice().sort((a, b) => a - b)) === "[9,13]", "…and state 5 lists 9 and the lake", pg.state(5).provinces);
}

console.log("\n-- 1. AUTO-FIX ON: MOVING STATE 5'S LAST LAND OUT MERGES IT, LAKE AND ALL, INTO THE STATE THAT TOOK THE LAND --");
{
  const { roots, pg } = world();
  const line = pg.move(9, 4);
  ok(JSON.stringify(pg.urls()) === JSON.stringify(["move-province", "merge-state"]), "⭐⭐⭐ the click queues the move AND the merge of state 5, which has no land left", pg.urls());
  const mg = pg.queue().find((w) => /merge-state/.test(w.url)) || {};
  ok(mg.body && mg.body.sourceStateId === 5 && mg.body.targetStateId === 4, "…from state 5 into state 4, the state that took its land", mg.body);
  ok(!pg.ctx.stateById.has(5) && !pg.ctx.model.states.some((s) => s.id === 5), "⭐⭐ the page's model no longer holds state 5", pg.ctx.model.states.map((s) => s.id));
  ok(pg.state(4).provinces.includes(13) && pg.ctx.model.provinceToState[13] === 4, "⭐⭐ …and its lake is in state 4 on the page, as mergeState will write it", { provinces: pg.state(4).provinces, at: pg.ctx.model.provinceToState[13] });
  ok(/Auto-fixed: merged STATE_5, which had no land left, into STATE_4, which took its last land: the water of province 13 goes into STATE_4 with it/.test(line), "⭐⭐ the line says the state had no land left, and where its water goes", line);
  ok(!/now-empty|now EMPTY|will not start a game/.test(line), "⭐ …and does not call it EMPTY or say HOI4 will not start: the game loads a state with no land", line);
  pg.save();
  ok(stateOnDisk(roots, 5) === "", "⭐⭐⭐ after the Save the mod has no state 5", stateOnDisk(roots, 5).slice(0, 200));
  ok(JSON.stringify(provsOnDisk(roots, 4)) === JSON.stringify(pg.state(4).provinces.slice().sort((a, b) => a - b)), "⭐⭐⭐ …and state 4's file lists what the page shows, the lake with it", { disk: provsOnDisk(roots, 4), page: pg.state(4).provinces });
}

console.log("\n-- 2. AUTO-FIX OFF: IT IS LEFT, AND THE LINE SAYS WHAT CLEARS IT --");
{
  const { pg } = world([13], { autoFix: false });
  const line = pg.move(9, 4);
  ok(JSON.stringify(pg.urls()) === JSON.stringify(["move-province"]), "THE CONTROL: only the move is queued", pg.urls());
  ok(pg.ctx.stateById.has(5) && JSON.stringify(pg.state(5).provinces) === "[13]", "…and state 5 stays, with its lake", pg.state(5) && pg.state(5).provinces);
  ok(/STATE_5 has no land left, only the water of province 13: HOI4 loads it/.test(line), "⭐⭐ the line says the state has no land left, only its water", line);
  ok(/↶ Undo this move to give it its land back, or move a land province into it with ↔ Move province\./.test(line), "⭐ …and names the steps that give it land", line);
  ok(!/now EMPTY/.test(line), "…and does not call it EMPTY", line);
}

console.log("\n-- 3. CONTROLS: A STATE THAT KEEPS LAND IS NOT EMPTIED; A LAKE MOVED OUT OF A STATE WITH NO LAND WAS NO LAND OF IT; A DRY STATE IS AS BEFORE --");
{
  const { pg } = world([13]);
  const line = pg.move(13, 4);
  ok(JSON.stringify(pg.urls()) === JSON.stringify(["move-province"]) && pg.ctx.stateById.has(5), "⭐ moving the lake out of state 5, which keeps land 9, empties nothing", { q: pg.urls(), line });
}
{
  const { pg } = world([9, 13]);
  const line = pg.move(13, 4);
  ok(JSON.stringify(pg.urls()) === JSON.stringify(["move-province"]) && pg.ctx.stateById.has(5), "⭐⭐ a lake moved out of a state that already held no land takes no land out of it: nothing else is queued", { q: pg.urls(), line });
  ok(!/no land left|Auto-fixed/.test(line), "…and the line says nothing of it", line);
}
{
  const { pg } = world([]);
  const line = pg.move(9, 4);
  ok(JSON.stringify(pg.urls()) === JSON.stringify(["move-province"]) && pg.ctx.stateById.has(5), "THE CONTROL: with no lake, moving 9 out of state 5 = [9, 13] empties nothing", { q: pg.urls(), line });
  const line2 = pg.move(13, 4);
  ok(JSON.stringify(pg.urls()) === JSON.stringify(["move-province", "move-province", "merge-state"]), "⭐ …and moving its last province too merges it, as before", pg.urls());
  ok(/Auto-fixed: merged the now-empty state STATE_5 into STATE_4, which took its last province/.test(line2) && !/no land left/.test(line2), "…with the words it always had", line2);
}

console.log("\n-- 4. A CAPITAL STATE KEPT WITH ONLY WATER IS SAID AS THAT, NOT AS EMPTY --");
{
  const { pg } = world([13], { capitals: { AAA: 5 } });
  const line = pg.move(9, 4);
  ok(JSON.stringify(pg.urls()) === JSON.stringify(["move-province"]) && pg.ctx.stateById.has(5), "THE CONTROL: AAA's capital state is kept, not merged (mergeState refuses a capital)", pg.urls());
  ok(/STATE_5 has no land left, only water, AND is AAA's capital/.test(line), "⭐⭐ the line says it has no land left and is AAA's capital", line);
  ok(!/is now empty AND is/.test(line) && !/deletes the empty state/.test(line), "⭐ …not that it is empty, nor that Auto-fix all deletes it (it deletes no state that still lists water)", line);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
