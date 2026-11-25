// ⛔ #a-duplicate-province-block-keeps-its-building — A REMOVAL TAKES EVERY COPY.
//
// Generate land wrote one state of TEST 27 (a world built by Nova alone, 2026-09-24) with the same province twice:
//     3878 = { naval_base = 3 }
//     3878 = { naval_base = 6 }
// When 3878 lost its coast, Auto-fix's dockyard pass removed the first naval base and reported the state fixed; the second
// stayed, the rule still fired, and the NEXT click wrote the file again — a second click that was supposed to change nothing
// changed one state. setProvinceBuildingInHistory edited only the first block for a province. A level being SET still goes to
// the first block, as it always has; a level of 0 now walks on to every later block that holds the key, and leaves a later
// block that does NOT hold it byte for byte alone.
//
// Back-out control (by hand, 2026-09-24): with the walk removed (the first block only, as before), the "both copies go"
// checks below fail with naval_base = 6 left behind.
"use strict";
const assert = require("assert");
const { setProvinceBuildingInHistory } = require("./map-data.js");

let pass = 0;
const ok = (cond, msg, detail) => { assert.ok(cond, msg + (detail === undefined ? "" : " → " + JSON.stringify(detail))); pass++; };
const state = (buildings) => `state = {\n\tid = 448\n\tname = "STATE_448"\n\tprovinces = { 3878 3894 }\n\thistory = {\n\t\towner = USA\n\t\tbuildings = {\n\t\t\tinfrastructure = 2\n${buildings}\t\t}\n\t}\n}\n`;
const nb = (t) => (t.match(/naval_base\s*=\s*\d+/g) || []);

// the TEST 27 shape: two blocks, each holding only the key
{
  const before = state("\t\t\t3878 = {\n\t\t\t\tnaval_base = 3\n\t\t\t}\n\t\t\t3878 = {\n\t\t\t\tnaval_base = 6\n\t\t\t}\n");
  const after = setProvinceBuildingInHistory(before, 3878, "naval_base", 0);
  ok(nb(after).length === 0, "⭐⭐⭐ both copies of the naval base go in ONE removal", nb(after));
  ok(!/3878\s*=/.test(after), "…and the two blocks they emptied with them", after);
  ok(/infrastructure = 2/.test(after), "the state-level building beside them stays");
  ok(setProvinceBuildingInHistory(after, 3878, "naval_base", 0) === after, "a second removal changes nothing");
}
// a first block that keeps another building, a second that holds the key
{
  const before = state("\t\t\t3878 = { naval_base = 3 bunker = 1 }\n\t\t\t3878 = { naval_base = 6 }\n");
  const after = setProvinceBuildingInHistory(before, 3878, "naval_base", 0);
  ok(nb(after).length === 0, "⭐⭐ the key goes from the second block even when the first block stays for its bunker", after);
  ok(/3878 = \{ bunker = 1 \}/.test(after), "…and the bunker stays where it was", after);
}
// a later block that does NOT hold the key is left exactly as written
{
  const later = "\t\t\t3878 = { # the author's note\n\t\t\t\tcoastal_bunker = 2\n\t\t\t}\n";
  const before = state("\t\t\t3878 = { naval_base = 3 }\n" + later);
  const after = setProvinceBuildingInHistory(before, 3878, "naval_base", 0);
  ok(nb(after).length === 0, "the naval base goes");
  ok(after.includes(later), "⭐ a later block for the province without the key is untouched, comment and layout included", after);
}
// SETTING a level still edits the first block only, as it always has
{
  const before = state("\t\t\t3878 = { naval_base = 3 }\n\t\t\t3878 = { naval_base = 6 }\n");
  const after = setProvinceBuildingInHistory(before, 3878, "naval_base", 5);
  ok(nb(after).join(",") === "naval_base = 5,naval_base = 6", "a level being set goes to the first block, and only there", nb(after));
}
// a province whose id is the tail of another's is never touched (121 inside 1121)
{
  const before = state("\t\t\t1121 = { naval_base = 3 }\n\t\t\t121 = { naval_base = 4 }\n\t\t\t1121 = { naval_base = 5 }\n");
  const after = setProvinceBuildingInHistory(before, 121, "naval_base", 0);
  ok(nb(after).join(",") === "naval_base = 3,naval_base = 5", "removing province 121's naval base leaves both of 1121's", after);
}
// a commented-out copy is not a copy
{
  const before = state("\t\t\t3878 = { naval_base = 3 }\n\t\t\t# 3878 = { naval_base = 6 }\n");
  const after = setProvinceBuildingInHistory(before, 3878, "naval_base", 0);
  ok(after.includes("# 3878 = { naval_base = 6 }"), "a commented-out block stays exactly as the author wrote it", after);
}

console.log(`✓ test-a-duplicate-province-block-loses-its-building-too.js — ${pass} checks`);
