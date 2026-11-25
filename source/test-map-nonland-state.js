// validateMapModel must flag a SEA province sitting inside a state — no shipping map does it. (This header used to
// say HOI4 hard-crashes on load and quote an engine message for it; hoi4.exe 1.19 contains no such text, and no
// crash has been observed. #a-map-message-matches-what-the-engine-checks) Reachable if the terrain editor switches a
// state-owned province to sea. LAKE provinces are NOT flagged: vanilla itself ships 100+ lakes inside
// states (and MD inherits them), so a lake-in-state must not false-positive.
"use strict";
const md = require("./map-data.js");

let pass = 0, fail = 0;
const check = (n, c, e) => { if (c) { pass++; console.log("  PASS", n); } else { fail++; console.log("  FAIL", n, e != null ? "→ " + e : ""); } };

// A model with a state that owns a LAND province (10) and — wrongly — a SEA province (99).
const model = {
  provinces: [
    { id: 10, type: "land", r: 1, g: 2, b: 3, continent: 1 },
    { id: 11, type: "land", r: 4, g: 5, b: 6, continent: 1 },
    { id: 99, type: "sea",  r: 7, g: 8, b: 9, continent: 0 },
    { id: 98, type: "lake", r: 10, g: 11, b: 12, continent: 0 },
  ],
  provinceToState: { 10: 1, 11: 1, 99: 1 },
  states: [{ id: 1, name: "S1", provinces: [10, 11, 99] }],
  capitals: {},
};
const problems = md.validateMapModel(model);
const nonLand = problems.filter((p) => p.rule === "non_land_province_in_state");
check("flags the sea province in a state", nonLand.length === 1, JSON.stringify(nonLand));
check("severity is error (hard crash)", nonLand[0] && nonLand[0].severity === "error");
check("names the offending province + state", nonLand[0] && /province 99/.test(nonLand[0].message) && /state 1/.test(nonLand[0].message), nonLand[0] && nonLand[0].message);
check("items carry province/state/type", nonLand[0] && nonLand[0].items[0].province === 99 && nonLand[0].items[0].stateId === 1 && nonLand[0].items[0].type === "sea");

// A clean land-only model must NOT trip the check (no crying wolf).
const clean = {
  provinces: [
    { id: 10, type: "land", r: 1, g: 2, b: 3, continent: 1 },
    { id: 11, type: "land", r: 4, g: 5, b: 6, continent: 1 },
    { id: 99, type: "sea",  r: 7, g: 8, b: 9, continent: 0 }, // sea exists but is NOT in a state
  ],
  provinceToState: { 10: 1, 11: 1 },
  states: [{ id: 1, name: "S1", provinces: [10, 11] }],
  capitals: {},
};
const cleanProblems = md.validateMapModel(clean).filter((p) => p.rule === "non_land_province_in_state");
check("land-only model does NOT trip the check", cleanProblems.length === 0, JSON.stringify(cleanProblems));

// A lake province in a state must NOT be flagged — vanilla puts 100+ lakes inside states and loads fine.
const lakeModel = {
  provinces: [{ id: 10, type: "land", r: 1, g: 2, b: 3, continent: 1 }, { id: 98, type: "lake", r: 9, g: 9, b: 9, continent: 0 }],
  provinceToState: { 10: 1, 98: 1 },
  states: [{ id: 1, name: "S1", provinces: [10, 98] }],
  capitals: {},
};
check("does NOT flag a lake province in a state (vanilla-normal, not a crash)", !md.validateMapModel(lakeModel).some((p) => p.rule === "non_land_province_in_state"), JSON.stringify(md.validateMapModel(lakeModel).filter((p) => p.rule === "non_land_province_in_state")));

console.log(`\nMAP-NONLAND-STATE TEST: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
