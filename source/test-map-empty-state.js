// Guard: an EMPTY state (no provinces) is FATAL — HOI4 logs "no provinces in state … with id: N" (state.cpp) and
// loads the map, then refuses to start a game with it (strategicair finds no air base site on a state with no
// land: "Failed to load the map"; #a-map-message-says-when-the-game-stops). Nova used to call it a harmless WARNING, so a
// stress test that emptied a state passed validation with "0 errors" yet crashed in-game. Now it's an ERROR,
// and Auto-fix deletes a non-capital empty state (a capital empty is skipped — the country needs land there).
const fs = require("fs"), os = require("os"), path = require("path");
const md = require("./map-data.js");
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) { pass++; console.log("  ✓ " + m); } else { fail++; console.log("  ✗ FAIL " + m + (x !== undefined ? " -> " + JSON.stringify(x) : "")); } };

// ── 1. validateMapModel: empty_state is now an ERROR (model-only, no files needed) ──
const probs = md.validateMapModel({
  capitals: { FRA: 12 },
  states: [
    { id: 10, name: "Real", provinces: [1, 2] },
    { id: 11, name: "Empty", provinces: [] },          // non-capital empty
    { id: 12, name: "Cap", provinces: [] },            // empty, but FRA's capital
  ],
});
const byRule = (r) => probs.filter((p) => p.rule === r);
ok(byRule("empty_state").some((p) => p.stateId === 11 && p.severity === "error"), "empty non-capital state is an ERROR (was a warning)", byRule("empty_state"));
ok(byRule("empty_capital_state").some((p) => p.stateId === 12 && p.severity === "error"), "empty capital state is an ERROR", byRule("empty_capital_state"));
ok(!probs.some((p) => p.stateId === 10), "a state with provinces is not flagged");

// ── 2. fixEmptyStates: deletes the non-capital empty, skips the capital one ──
const root = fs.mkdtempSync(path.join(os.tmpdir(), "nova-empty-"));
const game = fs.mkdtempSync(path.join(os.tmpdir(), "nova-empty-game-"));
const w = (rel, body) => { const p = path.join(root, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, body, "utf8"); };
try {
  w("descriptor.mod", 'name="Empty"\n');
  w("map/definition.csv", "0;0;0;0;land;false;unknown;0\n1;10;10;10;land;false;plains;0\n2;20;20;20;land;false;plains;0\n");
  // FRA owns land (state 10), so its empty capital is kept; a country with NO land loses its empty capital to Auto-fix
  // (test-an-empty-capital-of-a-country-with-no-land-is-deleted.js, tool campaign B2-2).
  w("history/states/10-Real.txt", 'state = { id = 10 name = "Real" provinces = { 1 2 } history = { owner = FRA } }');
  w("history/states/11-Empty.txt", 'state = { id = 11 name = "Empty" provinces = { } history = { owner = GER } }');
  w("history/states/12-Cap.txt", 'state = { id = 12 name = "Cap" provinces = { } history = { owner = FRA } }');
  w("history/countries/FRA.txt", "capital = 12\n");
  const r = md.fixEmptyStates({ modRoot: root, gameRoot: game });
  ok(r.deleted.includes(11), "fixEmptyStates deleted the non-capital empty state (11)", r);
  ok(!r.deleted.includes(12) && r.skipped.some((s) => s.id === 12), "fixEmptyStates SKIPPED the capital empty state (12)", r);
  ok(!fs.existsSync(path.join(root, "history/states/11-Empty.txt")), "the empty state's file is gone");
  ok(fs.existsSync(path.join(root, "history/states/12-Cap.txt")), "the capital state's file is kept");
} catch (e) { ok(false, "threw: " + e.message + "\n" + e.stack); }
finally { [root, game].forEach((d) => { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} }); }

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exitCode = fail ? 1 : 0;
