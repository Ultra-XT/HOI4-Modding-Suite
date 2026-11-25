// ⛔ #emptying-a-base-state-is-refused-at-the-click — ↔ MOVE PROVINCE AND 🧹 ERASE REFUSE, AT THE CLICK, TO TAKE THE LAST LAND OUT OF A STATE
// THE MOD DOES NOT OWN (the owner's Q4; tool campaign B2-21, B1-3).
//
// On a vanilla add-on, moving the Faroe Islands' only province into Iceland (or erasing Åland's) only WARNED. The Save then stopped at the
// FATAL empty_state_with_content and nothing could clear it: deleteState refuses a state from the base game or a dependency (the original
// would come back), no Map tool moves a province INTO an empty state, and Auto-fix leaves it. Delete state and 🔗 Merge already refused such a
// state at the click; Move and Erase now ask ONE predicate, baseStatesLeftWithoutLand, before anything changes, and say one plain sentence.
// Merge's and Delete's advice no longer sends the modder to Move to empty the state by hand.
//
// The page's own functions on a fake DOM (testlib-state-panel-page.js), each write sent to map-data.js as server.js's handler passes it; the
// predicate and its sentence are lifted from public/map.js into the same sandbox. Binds no port.
// Run: node test-emptying-a-base-state-is-refused-at-the-click.js
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const vm = require("vm");
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-base-state-kept-"));
process.env.APPDATA = path.join(ROOT, "appdata"); process.env.NOVA_APP_DATA_DIR = process.env.APPDATA; process.env.XDG_CONFIG_HOME = process.env.APPDATA;
process.env.NOVA_HOME_DIR = path.join(ROOT, "home");
fs.mkdirSync(process.env.APPDATA, { recursive: true });
fs.mkdirSync(process.env.NOVA_HOME_DIR, { recursive: true });
const md = require("./map-data.js");
const L = require("./testlib-state-panel-page.js");
const { lift } = require("./testlib-map-page.js");
const { maskJsComments } = require("./testlib-strip-comments.js");

let pass = 0, fail = 0;
const ok = (c, m, x) => {
  if (c) { pass++; console.log("  ok   " + m); }
  else { fail++; console.log("  FAIL " + m + (x !== undefined ? "   -> " + JSON.stringify(x).slice(0, 700) : "")); }
};
const model = (roots) => md.buildMapModel({ ...roots, cacheStableLayers: false });
let seq = 0;
/** A world (testlib's: state 7 = [3], 3 = [4, 5], 4 = [8, 12] …) whose states `base` are marked as the base game's, as buildMapModel marks them. */
function world(base = []) {
  const roots = L.makeWorld(ROOT, `w${++seq}`);
  const pg = L.openPage(md, roots, model(roots));
  // the predicate and its sentence, lifted into the page's sandbox (the rest of the page is testlib's)
  vm.runInContext(lift("function baseStatesLeftWithoutLand(") + "\n" + lift("function baseStateEmptyRefusal("), pg.ctx);
  pg.ctx.eraseBaseKept = new Map();
  for (const id of base) pg.ctx.stateById.get(id).inBaseLayer = true;
  return { roots, pg };
}

console.log("\n-- ⭐⭐⭐ ↔ Move: the last province of a base-game state is refused at the click, and nothing is staged --");
{
  const { pg } = world([7]);
  const undo = pg.ctx.undoStack.length;
  const line = pg.move(3, 3);
  ok(/^🚫 Province 3 is the last land of /.test(line), "the click says why, in one sentence", line);
  ok(/comes from the base game or a dependency/.test(line) && /HOI4 will not start a game with/.test(line) && /Nothing was changed\.$/.test(line), "…what it comes from, what the game does, and that nothing changed", line);
  ok(pg.queue().length === 0, "…nothing is queued, so the Save cannot write the empty state", pg.urls());
  ok(JSON.stringify(pg.state(7).provinces) === "[3]" && pg.ctx.model.provinceToState[3] === 7, "…the province stays in its state on the page", pg.state(7).provinces);
  ok(pg.ctx.undoStack.length === undo, "…and no Undo step is taken for a click that did nothing");
  ok(pg.ctx.moveSource === null, "…and the Move tool is disarmed");
}

console.log("\n-- CONTROL: the same move out of a state the mod owns goes ahead (the state is merged into the one that took it) --");
{
  const { pg } = world([]);
  const line = pg.move(3, 3);
  ok(!/^🚫/.test(line) && pg.urls().includes("move-province"), "the move is staged", { line, q: pg.urls() });
}

console.log("\n-- a base-game state that keeps land is not refused; one left with only a lake is --");
{
  const { pg } = world([3]);
  const line = pg.move(4, 1);
  ok(!/^🚫/.test(line) && pg.urls().includes("move-province"), "moving 4 out of base state 3 = [4, 5] leaves 5: staged", { line, q: pg.urls() });
}
{
  const { pg } = world([3]);
  pg.ctx.provinceType.set(5, "lake");
  const line = pg.move(4, 1);
  ok(/^🚫 Province 4 is the last land of /.test(line) && pg.queue().length === 0, "…but with 5 a lake, 4 is its last LAND, and the move is refused", { line, q: pg.urls() });
  // (review of the fix) …and the sentence says what is left: the lake, a state with no land, which HOI4 loads; not an empty state the game stops for
  ok(/would leave that state with no land, only water/.test(line) && /Map Errors reports a state that owns no land/.test(line)
    && !/empty/.test(line) && !/HOI4 will not start a game with/.test(line), "…saying it would leave the state with only water, not that it would be empty", line);
}
{
  // (review of the fix) a lake moved out of a base state that keeps other provinces takes no land out of it: not refused
  const { pg } = world([3]);
  pg.ctx.provinceType.set(4, "lake"); pg.ctx.provinceType.set(5, "lake");
  const line = pg.move(4, 1);
  ok(!/^🚫/.test(line) && pg.urls().includes("move-province"), "moving lake 4 out of base state 3 = [lake 4, lake 5] takes no land out: staged", { line, q: pg.urls() });
}
{
  // (review of the fix) …but its LAST province, a lake, still empties it: refused, and said as the last province, not the last land
  const { pg } = world([7]);
  pg.ctx.provinceType.set(3, "lake");
  const line = pg.move(3, 3);
  ok(/^🚫 Province 3 is the last province of /.test(line) && /would leave that state empty, which HOI4 will not start a game with/.test(line) && pg.queue().length === 0,
    "the last province of base state 7 = [lake 3] is refused: that would leave it empty", { line, q: pg.urls() });
}

console.log("\n-- ⭐⭐⭐ 🧹 Erase: the last land of a base-game state is left, said at the stroke's end --");
{
  const { pg } = world([7]);
  const flipped = pg.erase(3);
  const line = pg.last();
  ok(flipped === false && pg.queue().length === 0, "the brush flips nothing and queues nothing", { flipped, q: pg.urls() });
  ok(/^🚫 Province 3 is the last land of /.test(line) && /erasing it would leave that state empty/.test(line) && /Nothing was changed\.$/.test(line), "…and the stroke's line says why", line);
  ok(JSON.stringify(pg.state(7).provinces) === "[3]", "…the state keeps its province", pg.state(7).provinces);
}
{
  const { pg } = world([3]);
  pg.ctx.beginEraseStroke();
  const a = pg.ctx.eraseProvinceLocal(4), b = pg.ctx.eraseProvinceLocal(5);
  pg.ctx.commitEraseStroke();
  const line = pg.last();
  ok(a === true && b === false, "one stroke over both of base state 3's provinces flips the first and leaves the last", { a, b });
  ok(/Erased 1 coastal province/.test(line) && /🚫 Province 5 is the last land of /.test(line), "…and its line says both", line);
  ok(/erasing it would leave that state empty/.test(line), "…the state 5 leaves is empty (4 was erased to sea, which leaves the state)", line);
  ok(pg.urls().filter((u) => u === "flip-province-sea").length === 1, "…one flip queued", pg.urls());
}
{
  // (review of the fix) Erase on a base state that keeps a lake: refused, and the line says the state would keep only water
  const { pg } = world([3]);
  pg.ctx.provinceType.set(5, "lake");
  const flipped = pg.erase(4);
  const line = pg.last();
  ok(flipped === false && pg.queue().length === 0 && /^🚫 Province 4 is the last land of /.test(line)
    && /erasing it would leave that state with no land, only water/.test(line) && !/HOI4 will not start a game with/.test(line), "Erase leaves base state 3's last land beside its lake, and says what that would have left", { flipped, line });
}
{
  const { pg } = world([]);
  const flipped = pg.erase(3);
  ok(flipped === true && pg.urls().includes("flip-province-sea"), "CONTROL: a state the mod owns can still be erased away", pg.urls());
}

console.log("\n-- ONE predicate: Move and Erase both ask baseStatesLeftWithoutLand, and nothing else answers the question --");
{
  const code = maskJsComments(fs.readFileSync(path.join(__dirname, "public", "map.js"), "utf8").replace(/\r\n/g, "\n"));
  const body = (o) => { const s = code.indexOf(o); const e = code.indexOf("\n  }\n", s); return s < 0 || e < 0 ? "" : code.slice(s, e); };
  const move = body("function doMoveProvince("), erase = body("function eraseProvinceLocal(");
  ok(/baseStatesLeftWithoutLand\(provinceId, toStateId\)/.test(move), "doMoveProvince asks it, for the state the province goes to");
  ok(/baseStatesLeftWithoutLand\(pid, null\)/.test(erase), "eraseProvinceLocal asks it, with no state kept");
  ok(move.indexOf("baseStatesLeftWithoutLand(") < move.indexOf("stateMoveRegionTarget("), "…Move asks before the region question, so a refused move asks nothing first");
  ok(move.indexOf("baseStatesLeftWithoutLand(") < move.indexOf('pushUndo("Move province")'), "…and before its Undo step");
  ok(erase.indexOf("baseStatesLeftWithoutLand(") < erase.indexOf('pushUndo("Erase land")'), "…Erase too");
  ok((code.match(/function baseStatesLeftWithoutLand\(/g) || []).length === 1, "one definition");
}

console.log("\n-- Merge and Delete stop sending the modder to Move to empty the state, and the server's Merge says the same --");
{
  const map = maskJsComments(fs.readFileSync(path.join(__dirname, "public", "map.js"), "utf8").replace(/\r\n/g, "\n"));
  const data = maskJsComments(fs.readFileSync(path.join(__dirname, "map-data.js"), "utf8").replace(/\r\n/g, "\n"));
  const merge = map.slice(map.indexOf("function doMergeState("), map.indexOf("pushUndo(\"Merge states\")"));
  const del = map.slice(map.indexOf('$("miDeleteBtn").addEventListener("click"'), map.indexOf('pushUndo("Delete state")'));
  const keep = "It has to keep at least one of its provinces: move the others with ↔ Move province, or leave it in place.";
  ok(!/Move its provinces over manually instead/.test(merge) && merge.includes(keep), "🔗 Merge's refusal: keep one province, move the others", merge.slice(-400));
  ok(!/Move its provinces to another state instead/.test(del) && del.includes(keep), "🗑 Delete's refusal: the same", del.slice(-600));
  const ms = data.slice(data.indexOf("function mergeState("), data.indexOf("function mergeState(") + 4000);
  ok(ms.includes(keep), "mergeState (map-data.js) gives the same words when a Save reaches it");
  // the live refusal itself: the page's doMergeState, run
  const { pg } = world([7]);
  const line = pg.merge(7, 3);
  ok(/^🚫 /.test(line) && line.includes(keep) && pg.queue().length === 0, "…and the click says it", line);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
