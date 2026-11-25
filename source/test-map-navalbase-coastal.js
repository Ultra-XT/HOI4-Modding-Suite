// validateMapModel should WARN (not error) when a naval_base sits on a non-coastal province — HOI4 loads
// fine but logs "naval base on non-coastal province" and the base never spawns. Must not false-positive
// on coastal provinces or when coastal data is unknown.
"use strict";
const md = require("./map-data.js");

let pass = 0, fail = 0;
const check = (n, c, e) => { if (c) { pass++; console.log("  PASS", n); } else { fail++; console.log("  FAIL", n, e != null ? "→ " + e : ""); } };

const base = {
  provinces: [
    { id: 10, type: "land", coastal: true,  r: 1, g: 1, b: 1, continent: 1 },
    { id: 11, type: "land", coastal: false, r: 2, g: 2, b: 2, continent: 1 },
  ],
  provinceToState: { 10: 1, 11: 1 },
  capitals: {},
};

// Naval base on a NON-coastal province (11) → warning.
const m1 = { ...base, states: [{ id: 1, name: "S1", provinces: [10, 11], provinceBuildings: { 11: { naval_base: 3 } } }] };
const w1 = md.validateMapModel(m1).filter((p) => p.rule === "naval_base_non_coastal");
check("flags naval_base on non-coastal province", w1.length === 1, JSON.stringify(w1));
check("severity is warning (not a crash)", w1[0] && w1[0].severity === "warning");
check("names province + state", w1[0] && /province 11/.test(w1[0].message) && /state 1/.test(w1[0].message));

// Naval base on a COASTAL province (10) → no warning.
const m2 = { ...base, states: [{ id: 1, name: "S1", provinces: [10, 11], provinceBuildings: { 10: { naval_base: 5 } } }] };
check("coastal naval_base does NOT warn", md.validateMapModel(m2).filter((p) => p.rule === "naval_base_non_coastal").length === 0);

// naval_base = 0 on a non-coastal province → not a real base, no warning.
const m3 = { ...base, states: [{ id: 1, name: "S1", provinces: [10, 11], provinceBuildings: { 11: { naval_base: 0 } } }] };
check("naval_base level 0 does NOT warn", md.validateMapModel(m3).filter((p) => p.rule === "naval_base_non_coastal").length === 0);

// A non-naval building on a non-coastal province → no warning (only naval_base matters here).
const m4 = { ...base, states: [{ id: 1, name: "S1", provinces: [10, 11], provinceBuildings: { 11: { bunker: 2 } } }] };
check("non-naval province building does NOT warn", md.validateMapModel(m4).filter((p) => p.rule === "naval_base_non_coastal").length === 0);

console.log(`\nMAP-NAVALBASE-COASTAL TEST: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
