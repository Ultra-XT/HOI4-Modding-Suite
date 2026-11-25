// validateMapModel — the wiki-confirmed crash rules added in the crash-hardening pass:
//   state_id_gap (warning), province_not_in_region, province_no_continent, duplicate_province_color.
// Pure-function tests (no disk): feed crafted models, assert the right rule fires / stays quiet.
const md = require("./map-data.js");
let pass = 0, fail = 0;
const check = (n, c, e) => { if (c) { pass++; console.log("  PASS", n); } else { fail++; console.log("  FAIL", n, e != null ? "→ " + e : ""); } };
const has = (probs, rule) => probs.some((p) => p.rule === rule);
const sev = (probs, rule) => (probs.find((p) => p.rule === rule) || {}).severity;

// ── state_id_gap (ERROR — hoi4.exe refuses to load a map with a missing mid-sequence state id; Auto-fix moves the highest state into the gap) ──
{
  const gap = md.validateMapModel({ states: [{ id: 1, provinces: [1] }, { id: 3, provinces: [3] }] });
  check("gap in state ids is flagged", has(gap, "state_id_gap"), JSON.stringify(gap));
  check("state_id_gap is an ERROR (the game refuses to load the map; auto-fixable)", sev(gap, "state_id_gap") === "error", sev(gap, "state_id_gap"));
  check("gap reports the missing id (2)", (gap.find((p) => p.rule === "state_id_gap") || {}).missing.includes(2), JSON.stringify(gap));
  const contig = md.validateMapModel({ states: [{ id: 1, provinces: [1] }, { id: 2, provinces: [2] }, { id: 3, provinces: [3] }] });
  check("contiguous 1..max → no gap", !has(contig, "state_id_gap"), JSON.stringify(contig));
  const single = md.validateMapModel({ states: [{ id: 1, provinces: [1] }] });
  check("single state id 1 → no gap", !has(single, "state_id_gap"), JSON.stringify(single));
}

// ── land_not_in_state (ERROR) — a passable land province belonging to no state (auto-fixable) ──
{
  const orphan = md.validateMapModel({ provinces: [{ id: 1, type: "land" }, { id: 2, type: "land" }], provinceToState: { 1: 1 }, states: [{ id: 1, provinces: [1] }] });
  check("land province in no state → land_not_in_state ERROR", has(orphan, "land_not_in_state") && sev(orphan, "land_not_in_state") === "error", JSON.stringify(orphan));
  const covered = md.validateMapModel({ provinces: [{ id: 1, type: "land" }, { id: 2, type: "sea" }], provinceToState: { 1: 1 }, states: [{ id: 1, provinces: [1] }] });
  check("sea province in no state → NOT flagged (sea is never in a state)", !has(covered, "land_not_in_state"), JSON.stringify(covered));
}

// ── state_no_manpower (WARNING) + sea_province_has_continent (WARNING) ──
// sea_province_has_continent was an ERROR. It is a warning: vanilla ships sea province 5257 on continent 2, Old World
// Blues, Novum Vexillum and Rise of Nations each ship one too, all four launch, and hoi4.exe's only continent check is
// "prov %d has no continent" — for land. #a-map-message-matches-what-the-engine-checks
{
  const noMp = md.validateMapModel({ provinces: [{ id: 1, type: "land" }], provinceToState: { 1: 1 }, states: [{ id: 1, provinces: [1], manpower: 0 }] });
  check("land state with 0 manpower → state_no_manpower WARNING", has(noMp, "state_no_manpower") && sev(noMp, "state_no_manpower") === "warning", JSON.stringify(noMp));
  const hasMp = md.validateMapModel({ provinces: [{ id: 1, type: "land" }], provinceToState: { 1: 1 }, states: [{ id: 1, provinces: [1], manpower: 5000 }] });
  check("land state WITH manpower → not flagged", !has(hasMp, "state_no_manpower"), JSON.stringify(hasMp));
  const seaCont = md.validateMapModel({ provinces: [{ id: 1, type: "sea", continent: 5 }, { id: 2, type: "sea", continent: 0 }], states: [{ id: 1, provinces: [], manpower: 0 }] });
  check("sea province with non-zero continent → sea_province_has_continent WARNING (only the nonzero one)", sev(seaCont, "sea_province_has_continent") === "warning" && (seaCont.find((p) => p.rule === "sea_province_has_continent") || {}).provinces.join() === "1", JSON.stringify(seaCont));
}

// ── province_not_in_region (ERROR) — a state's province in no strategic region ──
{
  const model = {
    states: [{ id: 1, provinces: [10, 11] }],
    provinceToState: { 10: 1, 11: 1 },
    strategicRegions: [{ id: 5, provinces: [10] }],
    provinceToRegion: { 10: 5 }, // 11 is in NO region
  };
  const p = md.validateMapModel(model);
  check("province in a state but no region is flagged", has(p, "province_not_in_region"), JSON.stringify(p));
  check("province_not_in_region is an error", sev(p, "province_not_in_region") === "error", sev(p, "province_not_in_region"));
  check("it names the orphan province 11", (p.find((x) => x.rule === "province_not_in_region") || {}).provinces.includes(11), JSON.stringify(p));
  // All provinces covered → no rule.
  const ok = md.validateMapModel({ states: [{ id: 1, provinces: [10] }], provinceToState: { 10: 1 }, strategicRegions: [{ id: 5, provinces: [10] }], provinceToRegion: { 10: 5 } });
  check("all provinces in a region → no orphan flag", !has(ok, "province_not_in_region"), JSON.stringify(ok));
  // No region data loaded → can't tell → don't flag (guard).
  const noRegions = md.validateMapModel({ states: [{ id: 1, provinces: [10] }], provinceToState: { 10: 1 }, strategicRegions: [], provinceToRegion: {} });
  check("no region data → no false orphan flag", !has(noRegions, "province_not_in_region"), JSON.stringify(noRegions));
}

// ── province_no_continent (ERROR) — land province with continent 0 ──
{
  const model = { states: [{ id: 1, provinces: [10] }], provinces: [
    { id: 0, r: 0, g: 0, b: 0, type: "land", continent: 0 },        // reserved province 0 — ignored
    { id: 10, r: 1, g: 2, b: 3, type: "land", continent: 0 },       // BAD: land, no continent
    { id: 11, r: 4, g: 5, b: 6, type: "land", continent: 2 },       // ok
    { id: 12, r: 7, g: 8, b: 9, type: "sea", continent: 0 },        // sea may be 0
  ] };
  const p = md.validateMapModel(model);
  check("land province with continent 0 flagged", has(p, "province_no_continent"), JSON.stringify(p.filter((x)=>x.rule==="province_no_continent")));
  check("province_no_continent is an error", sev(p, "province_no_continent") === "error", sev(p, "province_no_continent"));
  const np = (p.find((x) => x.rule === "province_no_continent") || {}).provinces || [];
  check("flags province 10 only (not 0/11/12)", np.includes(10) && !np.includes(0) && !np.includes(11) && !np.includes(12), JSON.stringify(np));
}

// ── duplicate_province_color (ERROR) — two provinces share an RGB ──
{
  const model = { states: [{ id: 1, provinces: [10] }], provinces: [
    { id: 0, r: 0, g: 0, b: 0, type: "land", continent: 1 },
    { id: 10, r: 50, g: 60, b: 70, type: "land", continent: 1 },
    { id: 11, r: 50, g: 60, b: 70, type: "land", continent: 1 },    // dup of 10
    { id: 12, r: 1, g: 2, b: 3, type: "land", continent: 1 },
  ] };
  const p = md.validateMapModel(model);
  check("duplicate province colour flagged", has(p, "duplicate_province_color"), JSON.stringify(p.filter((x)=>x.rule==="duplicate_province_color")));
  check("duplicate_province_color is an error", sev(p, "duplicate_province_color") === "error", sev(p, "duplicate_province_color"));
  const ok = md.validateMapModel({ states: [{ id: 1, provinces: [10] }], provinces: [
    { id: 0, r: 0, g: 0, b: 0, type: "land", continent: 1 },
    { id: 10, r: 50, g: 60, b: 70, type: "land", continent: 1 },
    { id: 11, r: 51, g: 60, b: 70, type: "land", continent: 1 },
  ] });
  check("unique colours → no dup flag", !has(ok, "duplicate_province_color"), JSON.stringify(ok));
}

// ── state_province_not_in_definition (ERROR) — a state owns a province absent from definition.csv ──
{
  const known = [
    { id: 0, r: 0, g: 0, b: 0, type: "land", continent: 1 },
    { id: 10, r: 1, g: 2, b: 3, type: "land", continent: 1 },
    { id: 11, r: 4, g: 5, b: 6, type: "land", continent: 1 },
  ];
  // State owns 10 (exists) and 99 (does NOT exist in definition).
  const bad = md.validateMapModel({ states: [{ id: 1, provinces: [10, 99] }], provinces: known });
  check("state owning an undefined province is flagged", has(bad, "state_province_not_in_definition"), JSON.stringify(bad.filter((x) => x.rule === "state_province_not_in_definition")));
  check("state_province_not_in_definition is an error", sev(bad, "state_province_not_in_definition") === "error");
  const items = (bad.find((x) => x.rule === "state_province_not_in_definition") || {}).items || [];
  check("names the missing province 99, not the valid 10", items.some((i) => i.province === 99) && !items.some((i) => i.province === 10), JSON.stringify(items));
  // Every province a state owns exists → no flag (an add-on owning a base-game province is fine once it's in the merged list).
  const ok = md.validateMapModel({ states: [{ id: 1, provinces: [10, 11] }], provinces: known });
  check("all state provinces defined → no flag", !has(ok, "state_province_not_in_definition"), JSON.stringify(ok.filter((x) => x.rule === "state_province_not_in_definition")));
  // No province list loaded → can't tell → don't flag (guard against a false "will crash").
  const noProvs = md.validateMapModel({ states: [{ id: 1, provinces: [10, 99] }] });
  check("no province list → no false flag (guard)", !has(noProvs, "state_province_not_in_definition"), JSON.stringify(noProvs.filter((x) => x.rule === "state_province_not_in_definition")));
}

// ── supply_area_split_regions (WARNING) — a supply area whose states span >1 strategic region ──
// This rule was written as "the exact bug that crashed plain vanilla at launch" (2026-06-13: a region-5 state moved
// into a supply area of region-38 states). It is a WARNING now: that crash had three layered causes, Old World Blues
// ships 62 such areas and launches, and hoi4.exe (1.19) contains "supplyareas" / "supply_area" / "SupplyArea" zero
// times — the game does not read the folder. #a-map-message-matches-what-the-engine-checks
{
  const base = {
    states: [
      { id: 5, provinces: [50] }, { id: 8, provinces: [80] },
    ],
    provinceToRegion: { 50: 38, 80: 5 }, // state 5 → region 38, state 8 → region 5
  };
  // BAD: one supply area groups state 5 (region 38) and state 8 (region 5).
  const bad = md.validateMapModel({ ...base, supplyAreas: [{ id: 1, name: "X", states: [5, 8] }] });
  check("supply area spanning two regions is flagged", has(bad, "supply_area_split_regions"), JSON.stringify(bad.filter((x) => x.rule === "supply_area_split_regions")));
  check("supply_area_split_regions is a warning", sev(bad, "supply_area_split_regions") === "warning", sev(bad, "supply_area_split_regions"));
  check("it names the offending supply area id 1", (bad.find((x) => x.rule === "supply_area_split_regions") || {}).supplyArea === 1, JSON.stringify(bad.filter((x) => x.rule === "supply_area_split_regions")));
  // OK: a supply area whose states all share one region (the vanilla/MD shape).
  const ok = md.validateMapModel({ ...base, supplyAreas: [{ id: 1, name: "X", states: [5] }] });
  check("single-region supply area → no flag", !has(ok, "supply_area_split_regions"), JSON.stringify(ok.filter((x) => x.rule === "supply_area_split_regions")));
  // GUARD: a state with no region contributes nothing (rule (b) handles orphan provinces) → no double-flag.
  const orphan = md.validateMapModel({ states: [{ id: 5, provinces: [50] }, { id: 8, provinces: [80] }], provinceToRegion: { 50: 38 }, supplyAreas: [{ id: 1, name: "X", states: [5, 8] }] });
  check("region-less state doesn't trip supply_area_split_regions", !has(orphan, "supply_area_split_regions"), JSON.stringify(orphan.filter((x) => x.rule === "supply_area_split_regions")));
  // GUARD: no region data → can't tell → don't flag.
  const noRegions = md.validateMapModel({ states: [{ id: 5, provinces: [50] }], supplyAreas: [{ id: 1, name: "X", states: [5, 8] }] });
  check("no region data → no false supply-area flag", !has(noRegions, "supply_area_split_regions"), JSON.stringify(noRegions.filter((x) => x.rule === "supply_area_split_regions")));
}

// ── state_buildings_exceed_slots (WARNING) — more shared factories than the category (+extra) allows ──
// Was an ERROR on a 16-in-12 crash that was never isolated. It is a warning: hoi4.exe's only text for it, " has too
// many buildings : ", is a periodic gamestate consistency check, and Old World Blues ships state 90 with 16 in 8 and
// launches. #a-map-message-matches-what-the-engine-checks. Must honor the state's own
// add_extra_state_shared_building_slots (vanilla state 179 = rural 2 + 1 extra, with 3 factories = legal).
{
  const model = {
    states: [
      { id: 1, provinces: [1], category: "rural", buildings: { industrial_complex: 3 } },                         // 3 > 2 → overflow
      { id: 2, provinces: [2], category: "rural", buildings: { industrial_complex: 3 }, extraBuildingSlots: 1 },   // 3 ≤ 2+1 → ok
      { id: 3, provinces: [3], category: "city",  buildings: { industrial_complex: 4, arms_factory: 2 } },         // 6 = 6 → ok (at limit)
    ],
    categorySlots: { rural: 2, city: 6 },
  };
  const p = md.validateMapModel(model);
  check("factories over the category slot limit are flagged", has(p, "state_buildings_exceed_slots"), JSON.stringify(p.filter((x)=>x.rule==="state_buildings_exceed_slots")));
  check("state_buildings_exceed_slots is a warning", sev(p, "state_buildings_exceed_slots") === "warning", sev(p, "state_buildings_exceed_slots"));
  const items = (p.find((x) => x.rule === "state_buildings_exceed_slots") || {}).items || [];
  check("flags the overflow state 1 only (not 2 w/extra slots, not 3 at-limit)", items.length === 1 && items[0].stateId === 1, JSON.stringify(items));
  // No slot table loaded → can't tell → don't flag (guard against false "will crash").
  const noSlots = md.validateMapModel({ states: model.states, categorySlots: {} });
  check("no category-slot data → no false overflow flag", !has(noSlots, "state_buildings_exceed_slots"), JSON.stringify(noSlots));
}

// ── capital_state_owned_by_other (ERROR) — an EXISTING country not owning its own capital ──
// Annexing another country's capital crashes country selection. But releasable nations (own nothing yet,
// capital sits in the overlord's land — 275 in vanilla) must NOT be flagged.
{
  const model = {
    states: [
      { id: 10, provinces: [1], owner: "AAA" }, // AAA exists (owns a state)
      { id: 11, provinces: [2], owner: "BBB" }, // BBB exists, owns state 11
    ],
    capitals: { AAA: 11, BBB: 11, CCC: 10 }, // AAA's capital(11) owned by BBB → flag; BBB owns its own; CCC owns nothing → skip
  };
  const p = md.validateMapModel(model);
  check("an existing country not owning its capital is flagged", has(p, "capital_state_owned_by_other"), JSON.stringify(p.filter((x)=>x.rule==="capital_state_owned_by_other")));
  check("capital_state_owned_by_other is an error", sev(p, "capital_state_owned_by_other") === "error");
  const items = (p.find((x) => x.rule === "capital_state_owned_by_other") || {}).items || [];
  check("flags AAA only (not BBB who owns its capital, not stateless CCC)", items.length === 1 && items[0].tag === "AAA", JSON.stringify(items));
  // A country owning its own capital → no flag.
  const ok = md.validateMapModel({ states: [{ id: 5, provinces: [1], owner: "AAA" }], capitals: { AAA: 5 } });
  check("country owning its own capital → no flag", !has(ok, "capital_state_owned_by_other"), JSON.stringify(ok));
}

// ── state_no_category / unknown_state_category (ERROR) — a missing or typo'd state_category crashes ──
{
  const model = {
    states: [
      { id: 1, provinces: [1], category: "rural" },          // ok
      { id: 2, provinces: [2], category: "" },               // missing → error
      { id: 3, provinces: [3], category: "megalopoliss" },   // typo → unknown error
      { id: 4, provinces: [],  category: "" },               // empty state → its own rule, NOT a category flag
    ],
    categorySlots: { rural: 2, megalopolis: 12 },
  };
  const p = md.validateMapModel(model);
  check("a state with no category is flagged", has(p, "state_no_category"), JSON.stringify(p.filter((x)=>x.rule==="state_no_category")));
  check("state_no_category is an error", sev(p, "state_no_category") === "error");
  check("the empty state (4) is NOT category-flagged", !((p.find((x)=>x.rule==="state_no_category")||{}).states||[]).includes(4), JSON.stringify(p.filter((x)=>x.rule==="state_no_category")));
  check("a typo'd category is flagged", has(p, "unknown_state_category"), JSON.stringify(p.filter((x)=>x.rule==="unknown_state_category")));
  check("unknown_state_category names the bad category", ((p.find((x)=>x.rule==="unknown_state_category")||{}).items||[]).some((i)=>i.category==="megalopoliss"));
  const noSlots = md.validateMapModel({ states: model.states, categorySlots: {} });
  check("no category-slot table → no category flags (guard)", !has(noSlots, "state_no_category") && !has(noSlots, "unknown_state_category"), JSON.stringify(noSlots));
}

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exitCode = fail ? 1 : 0;
