// #a-count-is-the-population-not-the-length-of-the-capped-list
//
// Four validateMapModel rules collect their offenders into an array that is CAPPED so the problem's payload
// stays small, and then printed that array's length as the number of offenders. So a map with 5,049 sea
// provinces sitting inside states told the modder "61 sea province(s) are inside a state" — the cap, rendered
// as a count, one more than the 60 the panel then listed. Measured 2026-09-16 on the world the owner built
// through Delete map -> Generate land -> Auto-fix: the panel said 61, the map held 5,049, and that number is
// one of the three problems the Save gate reports.
//
// This is the project's own trap ("never diagnose from truncated output") inside the tool that does the
// diagnosing. The rule must count every offender and list the first CAP of them.
//
// The cap is DERIVED from the shipping source, never typed here, and the source is read with comments
// stripped — this file's own prose, and map-data.js's, contain the number. The derivation matches the cap
// with EITHER operator (`< n` or `<= n`) on purpose: backing the fix out restores `<=`, and a derivation that
// only knew the fixed shape would come back empty and make the fixtures unbuildable instead of failing.
"use strict";
const fs = require("fs");
const path = require("path");
const md = require("./map-data.js");
const { stripJsComments } = require("./testlib-strip-comments.js");

let pass = 0, fail = 0;
const check = (n, c, e) => { if (c) { pass++; console.log("  PASS", n); } else { fail++; console.log("  FAIL", n, e != null ? "→ " + e : ""); } };

// ── the cap, derived ────────────────────────────────────────────────────────────────────────────────────
const src = stripJsComments(fs.readFileSync(path.join(__dirname, "map-data.js"), "utf8"));
const caps = new Set();
for (const m of src.matchAll(/\b(?:bad|over|missing|unknown)\.length <=? (\d+)/g)) caps.add(parseInt(m[1], 10));
check("every capped example list in map-data.js uses the same cap", caps.size === 1, "found caps " + JSON.stringify([...caps]));
const CAP = [...caps][0];
check("the cap is a positive number", Number.isFinite(CAP) && CAP > 0, String(CAP));
if (!Number.isFinite(CAP) || CAP <= 0) {
  console.log("\nPROBLEM-COUNT-NOT-EXAMPLE-LIST TEST: " + pass + " passed, " + fail + " failed (cap underivable — the rest could not run)");
  process.exit(1);
}
// ⚠️ A count must never be the length of that list again: the four collectors must not gate the offender
// test on the example list's own length the way they used to (`bad.length <= 60 && <the expensive test>`).
const gatedOnLength = [...src.matchAll(/\b(?:bad|over|missing|unknown)\.length <= \d+ &&/g)].length;
check("no collector gates its offender test on the example list's length", gatedOnLength === 0, gatedOnLength + " still do");

const N = CAP * 2 + 7;                                   // comfortably past the cap, derived from it
const numberIn = (p) => { const m = String(p && p.message).match(/^(\d+)/); return m ? parseInt(m[1], 10) : NaN; };

// ── (1) non_land_province_in_state ──────────────────────────────────────────────────────────────────────
{
  const provinces = [{ id: 1, type: "land", r: 1, g: 1, b: 1, continent: 1 }];
  const provinceToState = { 1: 1 };
  const seaIds = [];
  for (let i = 0; i < N; i++) {
    const id = 1000 + i;
    seaIds.push(id);
    provinces.push({ id, type: "sea", r: (i % 200) + 20, g: 3, b: 4, continent: 0 });
    provinceToState[id] = 1;
  }
  const model = { provinces, provinceToState, states: [{ id: 1, name: "S1", provinces: [1, ...seaIds] }], capitals: {} };
  const p = md.validateMapModel(model).find((x) => x.rule === "non_land_province_in_state");
  check("non_land_province_in_state fires", !!p);
  check("…its message counts every sea province, not the cap", p && numberIn(p) === N, p && numberIn(p) + " !== " + N);
  check("…it carries the same total", p && p.total === N, p && String(p.total));
  check("…and lists exactly CAP examples", p && p.items.length === CAP, p && String(p.items.length));
  // and below the cap the count is still the truth
  const one = {
    provinces: [provinces[0], { id: 1000, type: "sea", r: 20, g: 3, b: 4, continent: 0 }],
    provinceToState: { 1: 1, 1000: 1 },
    states: [{ id: 1, name: "S1", provinces: [1, 1000] }], capitals: {},
  };
  const q = md.validateMapModel(one).find((x) => x.rule === "non_land_province_in_state");
  check("…one offender still reads as 1, listed once", q && numberIn(q) === 1 && q.items.length === 1 && q.total === 1, q && q.message);
}

// ── (2) state_no_category and (3) unknown_state_category ────────────────────────────────────────────────
{
  const mk = (category) => {
    const provinces = [], states = [], provinceToState = {};
    for (let i = 0; i < N; i++) {
      const pid = 2000 + i, sid = 500 + i;
      provinces.push({ id: pid, type: "land", r: (i % 200) + 20, g: 7, b: 9, continent: 1 });
      provinceToState[pid] = sid;
      states.push({ id: sid, name: "S" + sid, provinces: [pid], category });
    }
    return { provinces, provinceToState, states, capitals: {}, categorySlots: { rural: 2, town: 4 } };
  };
  const noCat = md.validateMapModel(mk("")).find((x) => x.rule === "state_no_category");
  check("state_no_category fires", !!noCat);
  check("…its message counts every state, not the cap", noCat && numberIn(noCat) === N, noCat && numberIn(noCat) + " !== " + N);
  check("…it carries the same total and lists CAP", noCat && noCat.total === N && noCat.states.length === CAP, noCat && noCat.total + "/" + (noCat.states || []).length);

  const badCat = md.validateMapModel(mk("no_such_category_anywhere")).find((x) => x.rule === "unknown_state_category");
  check("unknown_state_category fires", !!badCat);
  check("…its message counts every state, not the cap", badCat && numberIn(badCat) === N, badCat && numberIn(badCat) + " !== " + N);
  check("…it carries the same total and lists CAP", badCat && badCat.total === N && badCat.items.length === CAP, badCat && badCat.total + "/" + (badCat.items || []).length);

  // no crying wolf: a known category, in another capitalisation, is neither missing nor unknown
  const fine = md.validateMapModel(mk("RURAL")).filter((x) => x.rule === "state_no_category" || x.rule === "unknown_state_category");
  check("a known category in another case trips neither rule", fine.length === 0, JSON.stringify(fine.map((x) => x.rule)));
}

// ── (4) state_buildings_exceed_slots ────────────────────────────────────────────────────────────────────
{
  const provinces = [], states = [], provinceToState = {};
  for (let i = 0; i < N; i++) {
    const pid = 3000 + i, sid = 800 + i;
    provinces.push({ id: pid, type: "land", r: (i % 200) + 20, g: 11, b: 13, continent: 1 });
    provinceToState[pid] = sid;
    states.push({ id: sid, name: "S" + sid, provinces: [pid], category: "rural", buildings: { industrial_complex: 9 } });
  }
  const model = { provinces, provinceToState, states, capitals: {}, categorySlots: { rural: 2 } };
  const p = md.validateMapModel(model).find((x) => x.rule === "state_buildings_exceed_slots");
  check("state_buildings_exceed_slots fires", !!p);
  check("…its message counts every state, not the cap", p && numberIn(p) === N, p && numberIn(p) + " !== " + N);
  check("…it carries the same total and lists CAP", p && p.total === N && p.items.length === CAP, p && p.total + "/" + (p.items || []).length);

  // no crying wolf: within the slots, nothing is reported
  const ok = states.map((s) => ({ ...s, buildings: { industrial_complex: 1 } }));
  check("a state inside its slots is not reported",
    !md.validateMapModel({ provinces, provinceToState, states: ok, capitals: {}, categorySlots: { rural: 2 } }).some((x) => x.rule === "state_buildings_exceed_slots"));
}

console.log(`\nPROBLEM-COUNT-NOT-EXAMPLE-LIST TEST: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
