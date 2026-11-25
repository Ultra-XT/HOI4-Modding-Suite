// ⛔ #a-generated-state-keeps-the-industry-of-the-land-below — THE DEAL ITSELF: dealCarriedBuildings, as a pure function.
//
// A generated state wants the sum of its provinces' shares of the buildings below, a fraction. The levels are made whole per
// COUNTRY and per key, T = round(Σ want), and handed out one at a time to the country's state with the most share still unplaced
// (Hamilton's largest remainder), under the category's slots, each key's state_max and the coast. This test pins, by hand-made
// cases and then over 500 seeded random worlds:
//   · placed + dropped = Σ over countries of round(Σ want), per key;
//   · no state over its slots or a key's state_max, and no coast-only key on a state off the coast;
//   · with nothing binding, every state gets ⌊want⌋ or ⌈want⌉ — the property largest-remainder has and "largest want" lacks;
//   · the answer does not depend on the order the states come in;
//   · a level dropped for want of a coast is `noCoast` exactly when its country has no coastal state, else `noRoom`;
//   · a key the rules do not define, a provincial one, and one whose models have no row are `notCarried`, never dealt.
//
// Pure: no disk, no port. Run: node test-carried-industry-is-dealt-per-country.js
"use strict";
const md = require("./map-data.js");

let checks = 0;
const fails = [];
const rec = (label, cond, detail) => {
  checks++;
  console.log((cond ? "  ok   " : "  FAIL ") + label + (cond || detail == null ? "" : "   -> " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 400)));
  if (!cond) fails.push(label);
};
const deal = md.dealCarriedBuildings;
rec("map-data.js exports dealCarriedBuildings", typeof deal === "function");
if (typeof deal !== "function") { console.log("FAILED"); process.exit(1); }

const R = (o) => Object.assign({ sharesSlots: false, stateMax: Infinity, coastOnly: false, provincial: false, showOnMap: 0, rowType: "" }, o);
const IC = R({ sharesSlots: true, stateMax: 20, showOnMap: 6, rowType: "industrial_complex" });
const DY = R({ sharesSlots: true, stateMax: 20, coastOnly: true, showOnMap: 1, rowType: "dockyard" });
const AA = R({ stateMax: 2, showOnMap: 3, rowType: "anti_air_building" });
const RULES = new Map([["industrial_complex", IC], ["dockyard", DY], ["anti_air_building", AA]]);
const ROWS = new Set(["industrial_complex", "dockyard", "anti_air_building"]);
const lv = (r, id) => r.levels.get(id) || {};

console.log("=== 1. by hand ===");
{
  const r = deal({ rules: RULES, rowTypes: ROWS, states: [1, 2, 3].map((id) => ({ id, owner: "A", want: { industrial_complex: 0.4 }, slots: 2, coastal: false })) });
  rec("three states of one country at 0.4 are ONE level (rounded per country, not per state)", r.report.written.industrial_complex === 1 && lv(r, 1).industrial_complex === 1, [...r.levels]);
  const two = deal({ rules: RULES, rowTypes: ROWS, states: [{ id: 1, owner: "A", want: { industrial_complex: 0.4 } }, { id: 2, owner: "B", want: { industrial_complex: 0.4 } }] });
  rec("…and two countries at 0.4 each are none: a share never crosses to another country", !two.report.written.industrial_complex, two.report);
}
{
  const r = deal({ rules: RULES, rowTypes: ROWS, states: [{ id: 5, owner: "A", want: { industrial_complex: 2.2 }, slots: 1 }, { id: 6, owner: "A", want: {}, slots: 4 }] });
  rec("a state full at its slots passes the rest to another state of its country", lv(r, 5).industrial_complex === 1 && lv(r, 6).industrial_complex === 1, [...r.levels]);
  rec("…and says it as outside its state", r.report.outsideItsState === 1, r.report);
  const full = deal({ rules: RULES, rowTypes: ROWS, states: [{ id: 5, owner: "A", want: { industrial_complex: 3 }, slots: 1 }] });
  rec("a level no state of its country has room for is dropped as noRoom", lv(full, 5).industrial_complex === 1 && full.report.dropped.noRoom.industrial_complex === 2, full.report);
  const cap = deal({ rules: RULES, rowTypes: ROWS, states: [{ id: 1, owner: "A", want: { anti_air_building: 5 } }] });
  rec("a key stops at its state_max (it shares no slots)", lv(cap, 1).anti_air_building === AA.stateMax && cap.report.dropped.noRoom.anti_air_building === 5 - AA.stateMax, cap.report);
}
{
  const inland = deal({ rules: RULES, rowTypes: ROWS, states: [{ id: 1, owner: "A", want: { dockyard: 2 }, coastal: false }] });
  rec("a dockyard in a country with no coast is dropped as noCoast", !lv(inland, 1).dockyard && inland.report.dropped.noCoast.dockyard === 2 && !inland.report.dropped.noRoom.dockyard, inland.report);
  const moved = deal({ rules: RULES, rowTypes: ROWS, states: [{ id: 1, owner: "A", want: { dockyard: 2 }, coastal: false }, { id: 2, owner: "A", want: {}, coastal: true, slots: 6 }] });
  rec("…and one with a coastal state goes there", lv(moved, 2).dockyard === 2 && !Object.keys(moved.report.dropped.noCoast).length, [...moved.levels]);
  const full = deal({ rules: RULES, rowTypes: ROWS, states: [{ id: 1, owner: "A", want: { dockyard: 2 }, coastal: true, slots: 1 }] });
  rec("a dockyard whose country's coast is full is noRoom, not noCoast", full.report.dropped.noRoom.dockyard === 1 && !full.report.dropped.noCoast.dockyard, full.report);
  // #a-generated-country-keeps-its-economy — the factory's share is the larger, but the coast-only key is DEALT first: it takes the
  // coast's one slot, and the factory, which could have stood inland, is what this country has no room for. (This case said the
  // dockyard was noRoom while the factory was dealt first; on TEST 33's world that order cost Italy 5 of its 15 dockyards.)
  const both = deal({ rules: RULES, rowTypes: ROWS, states: [{ id: 1, owner: "A", want: { industrial_complex: 1.4, dockyard: 1 }, coastal: true, slots: 1 }] });
  rec("⭐ a coastal slot goes to the dockyard, dealt first, and the factory is noRoom", lv(both, 1).dockyard === 1 && both.report.dropped.noRoom.industrial_complex === 1
    && !both.report.dropped.noRoom.dockyard && !Object.keys(both.report.dropped.noCoast).length, both.report);
}
{
  const rules = new Map([...RULES, ["naval_base", R({ provincial: true, coastOnly: true, showOnMap: 1, rowType: "naval_base_spawn" })],
    ["steel_mill", R({ sharesSlots: true, showOnMap: 1, rowType: "steel_mill" })], ["offices", R({ sharesSlots: true })]]);
  const r = deal({ rules, rowTypes: ROWS, states: [{ id: 1, owner: "A", want: { naval_base: 1, steel_mill: 2, offices: 2, mystery: 1 }, slots: 6 }] });
  rec("a provincial key, one whose models have no row, and one nobody defines are not dealt", !lv(r, 1).naval_base && !lv(r, 1).steel_mill && !lv(r, 1).mystery, lv(r, 1));
  rec("…and are said as notCarried, with their share", r.report.notCarried.naval_base === 1 && r.report.notCarried.steel_mill === 2 && r.report.notCarried.mystery === 1, r.report.notCarried);
  rec("a shared key with no models is dealt (Millennium Dawn's offices)", lv(r, 1).offices === 2, lv(r, 1));
  // provincial and nothing else in the way: no models to want a row (vanilla's rail_way has a province_max and no show_on_map)
  const prov = deal({ rules: new Map([...RULES, ["rail_way", R({ provincial: true })]]), rowTypes: ROWS, states: [{ id: 1, owner: "A", want: { rail_way: 2 }, slots: 6 }] });
  rec("a provincial key is never dealt as a state's, even with no models in the way", !lv(prov, 1).rail_way && prov.report.notCarried.rail_way === 2, { levels: lv(prov, 1), report: prov.report });
}
{
  const r = deal({ rules: RULES, rowTypes: ROWS, states: [{ id: 1, owner: "A", want: { anti_air_building: 9, dockyard: 1, industrial_complex: 2 }, coastal: true, slots: 6 }] });
  rec("shared keys are written first, the most share first, then the rest", JSON.stringify(r.order) === JSON.stringify(["industrial_complex", "dockyard", "anti_air_building"]), r.order);
  // #a-generated-country-keeps-its-economy — …and dealt in that order but the coast-only shared keys first; the write order is kept
  rec("…and dealt the same, but the coast-only shared keys first", JSON.stringify(r.dealOrder) === JSON.stringify(["dockyard", "industrial_complex", "anti_air_building"]), r.dealOrder);
  // equal shares, so every pick is a tie; the HIGHEST id has the most free slots, so "more free slots" and "lower id" disagree
  const tied = [{ id: 2, slots: 2 }, { id: 4, slots: 2 }, { id: 9, slots: 6 }].map((s) => ({ ...s, owner: "A", want: { industrial_complex: 0.5 } }));
  const tie = deal({ rules: RULES, rowTypes: ROWS, states: tied });
  const T = Math.round(tied.length * 0.5);
  const byRule = tied.slice().sort((a, b) => b.slots - a.slots || a.id - b.id).slice(0, T).map((s) => s.id).sort((a, b) => a - b);
  const byId = tied.slice(0, T).map((s) => s.id);
  const got = tied.filter((s) => lv(tie, s.id).industrial_complex === 1).map((s) => s.id);
  rec("the fixture: the free-slot rule and the lower-id rule pick different states", JSON.stringify(byRule) !== JSON.stringify(byId), { byRule, byId });
  rec("⭐ a tie goes to the state with more free slots, then to the lower id", JSON.stringify(got) === JSON.stringify(byRule)
    && tied.every((s) => (lv(tie, s.id).industrial_complex || 0) <= 1), { got, byRule, levels: [...tie.levels] });
  // six provinces' shares of one 12-province factory: summed in floating point they are 0.49999999999999994, not 0.5
  const twelfths = Array.from({ length: 6 }, (_, i) => ({ id: i + 1, owner: "A", want: { industrial_complex: 1 / 12 } }));
  const sum = twelfths.reduce((a, s) => a + s.want.industrial_complex, 0);
  rec("the fixture: the float sum is a hair under one half, and plain rounding would make it none", sum < 0.5 && Math.round(sum) === 0, sum);
  const half = deal({ rules: RULES, rowTypes: ROWS, states: twelfths });
  rec("⭐ shares summing to a half only in exact arithmetic (6 × 1/12) still round up", half.report.written.industrial_complex === 1, half.report);
  const none = deal({ rules: RULES, rowTypes: ROWS, states: [{ id: 1, owner: "", want: { industrial_complex: 1.6 } }, { id: 2, owner: "", want: { industrial_complex: 0 } }] });
  rec("states with no owner are dealt among themselves", lv(none, 1).industrial_complex === 2, [...none.levels]);
}

console.log("\n=== 2. 500 seeded worlds ===");
{
  let seed = 20261006;
  const rnd = () => { seed = (seed * 1103515245 + 12345) >>> 0; return seed / 4294967296; };
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const quarter = () => Math.floor(rnd() * 9) / 4;   // 0, 0.25, … 2: ties happen, as they do when one state below is split evenly
  let sums = 0, slotsOk = 0, coastOk = 0, maxOk = 0, hamilton = 0, shuffled = 0, attribution = 0, worlds = 0;
  const bad = { sums: [], slots: [], coast: [], max: [], hamilton: [], shuffled: [], attribution: [] };
  for (let w = 0; w < 500; w++) {
    worlds++;
    const n = 2 + Math.floor(rnd() * 14);
    const states = Array.from({ length: n }, (_, i) => ({ id: 100 + i * 3, owner: pick(["A", "B", "C", ""]), coastal: rnd() < 0.4,
      slots: pick([0, 1, 2, 4, 6, null]), want: { industrial_complex: quarter(), dockyard: rnd() < 0.5 ? quarter() : 0, anti_air_building: quarter() } }));
    const r = deal({ rules: RULES, rowTypes: ROWS, states });
    // placed + dropped = Σ per owner round(Σ want)
    const owners = [...new Set(states.map((s) => s.owner))];
    let okSum = true, okAttr = true;
    for (const k of ["industrial_complex", "dockyard", "anti_air_building"]) {
      const want = owners.reduce((a, o) => a + Math.round(states.filter((s) => s.owner === o).reduce((b, s) => b + s.want[k], 0) + 1e-9), 0);
      const placed = states.reduce((a, s) => a + (lv(r, s.id)[k] || 0), 0);
      const dropped = (r.report.dropped.noCoast[k] || 0) + (r.report.dropped.noRoom[k] || 0);
      if (placed + dropped !== want || (r.report.written[k] || 0) !== placed) okSum = false;
      // noCoast: exactly the levels of countries with no coastal state
      const coastless = owners.filter((o) => !states.some((s) => s.owner === o && s.coastal));
      const expectNoCoast = RULES.get(k).coastOnly ? coastless.reduce((a, o) => a + Math.round(states.filter((s) => s.owner === o).reduce((b, s) => b + s.want[k], 0) + 1e-9), 0) : 0;
      if ((r.report.dropped.noCoast[k] || 0) !== expectNoCoast) okAttr = false;
    }
    if (okSum) sums++; else bad.sums.push(w);
    if (okAttr) attribution++; else bad.attribution.push(w);
    const slotOf = (s) => (s.slots == null ? Infinity : s.slots);
    if (states.every((s) => Object.entries(lv(r, s.id)).filter(([k]) => RULES.get(k).sharesSlots).reduce((a, [, v]) => a + v, 0) <= slotOf(s))) slotsOk++; else bad.slots.push(w);
    if (states.every((s) => s.coastal || !lv(r, s.id).dockyard)) coastOk++; else bad.coast.push(w);
    if (states.every((s) => Object.entries(lv(r, s.id)).every(([k, v]) => v <= RULES.get(k).stateMax))) maxOk++; else bad.max.push(w);
    // with nothing binding, ⌊want⌋ or ⌈want⌉
    const free = deal({ rules: new Map([["industrial_complex", R({ sharesSlots: true })]]), rowTypes: ROWS, states: states.map((s) => ({ ...s, slots: null })) });
    if (states.every((s) => { const v = lv(free, s.id).industrial_complex || 0; return v >= Math.floor(s.want.industrial_complex + 1e-9) && v <= Math.ceil(s.want.industrial_complex - 1e-9); })) hamilton++; else bad.hamilton.push(w);
    // the same answer for the states in any order
    const mixed = states.slice().sort(() => rnd() - 0.5).reverse();
    const r2 = deal({ rules: RULES, rowTypes: ROWS, states: mixed });
    const flat = (x) => JSON.stringify(states.map((s) => [s.id, lv(x, s.id)]));
    if (flat(r) === flat(r2) && JSON.stringify(r.report) === JSON.stringify(r2.report)) shuffled++; else bad.shuffled.push(w);
  }
  rec(`placed + dropped = Σ per country round(Σ want), in ${sums}/${worlds} worlds`, sums === worlds, bad.sums.slice(0, 5));
  rec(`no state over its slots, in ${slotsOk}/${worlds}`, slotsOk === worlds, bad.slots.slice(0, 5));
  rec(`no key past its state_max, in ${maxOk}/${worlds}`, maxOk === worlds, bad.max.slice(0, 5));
  rec(`no dockyard on a state off the coast, in ${coastOk}/${worlds}`, coastOk === worlds, bad.coast.slice(0, 5));
  rec(`⭐ with nothing binding every state gets ⌊want⌋ or ⌈want⌉ (largest remainder), in ${hamilton}/${worlds}`, hamilton === worlds, bad.hamilton.slice(0, 5));
  rec(`⭐ the same answer whatever order the states come in, in ${shuffled}/${worlds}`, shuffled === worlds, bad.shuffled.slice(0, 5));
  rec(`noCoast is exactly the coast-only levels of countries with no coastal state, in ${attribution}/${worlds}`, attribution === worlds, bad.attribution.slice(0, 5));
}

console.log("\n" + (fails.length ? "FAILED " + fails.length + " of " + checks : "PASSED " + checks + " checks"));
if (fails.length) { for (const f of fails) console.log("  - " + f); process.exit(1); }
