// ⛔ #a-generated-country-keeps-its-economy — THE RULE ITSELF: keepCountryEconomies and stateWorthByCategory, as pure functions,
// and the deal order dealCarriedBuildings now deals by.
//
// TEST 33 (the owner's flow, 35% of the sea raised over vanilla) started with factories 311/82/45 of the base game's 804/317/151,
// 532 M people of 2,075 M and 2,262 resources of 10,187, because a state carried only what the land under it held. Each country now
// keeps its 1936 economy: its budget (what it held below, less what it holds in states that load now and the carry of ownerless
// states on its land) is spread over its new states — each keeps its own land's carry first, the rest goes by what a state of its
// category holds below — and a country with less land than its factories need keeps its mix. This pins, by hand-made cases and then
// over 500 seeded worlds:
//   · Σ manpower and Σ each resource per country is its remaining budget, exactly, made whole by largest remainder;
//   · carry first; a carry over the budget is scaled down pro rata; a budget below what loads now is 0, never negative;
//   · the rest goes by the category's per-state worth, not by size; a coast-only key only to the coast while there is one;
//   · a state whose slots are unknown takes no building remainder and is no part of its country's capacity; a short country keeps
//     its mix (and is said);
//   · infrastructure keeps the country's mean below, 1..state_max, made whole per country (a tie to the lower id), and the flat 2
//     where nothing below gives a level;
//   · the answer does not depend on the order the states come in, and 10^8 people are made whole without a one-level loop
//     (run in a child process, so a back-out that loops fails here rather than hanging the file);
//   · stateWorthByCategory is a per-state mean per category, with "*" for all and the dated-first state's buildings left out;
//   · dealCarriedBuildings deals the coast-only shared keys first and still WRITES in its old order;
//   · economyTakenWithLand (the review's IR-1): a country within its budget took nothing with the land its states stand on (a
//     second Generate land click), one over it took the excess, never more than the land's share, pro rata, per quantity — and a
//     donor that is a receiver too is asked again, so a chain (GER holds Alsace, FRA holds Belgian land) takes what each moved.
//
// Pure: no disk, no port. Run: node test-a-country-economy-is-spread-by-what-a-state-of-its-kind-holds.js
"use strict";
const path = require("path");
const { spawnSync } = require("child_process");
const md = require("./map-data.js");

let checks = 0;
const fails = [];
const rec = (label, cond, detail) => {
  checks++;
  console.log((cond ? "  ok   " : "  FAIL ") + label + (cond || detail == null ? "" : "   -> " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 400)));
  if (!cond) fails.push(label);
};
const keep = md.keepCountryEconomies, worthBy = md.stateWorthByCategory, deal = md.dealCarriedBuildings;
rec("map-data.js exports keepCountryEconomies, stateWorthByCategory and dealCarriedBuildings", [keep, worthBy, deal].every((f) => typeof f === "function"));
if (![keep, worthBy, deal].every((f) => typeof f === "function")) { console.log("FAILED"); process.exit(1); }

const R = (o) => Object.assign({ sharesSlots: false, stateMax: Infinity, coastOnly: false, provincial: false, showOnMap: 0, rowType: "" }, o);
const IC = R({ sharesSlots: true, stateMax: 20, showOnMap: 6, rowType: "industrial_complex" });
const AF = R({ sharesSlots: true, stateMax: 20, showOnMap: 6, rowType: "arms_factory" });
const DY = R({ sharesSlots: true, stateMax: 20, coastOnly: true, showOnMap: 1, rowType: "dockyard" });
const AA = R({ stateMax: 5, showOnMap: 3, rowType: "anti_air_building" });
const RULES = new Map([["industrial_complex", IC], ["arms_factory", AF], ["dockyard", DY], ["anti_air_building", AA]]);
const ROWS = new Set(["industrial_complex", "arms_factory", "dockyard", "anti_air_building"]);
const SHARED = [...RULES].filter(([, r]) => r.sharesSlots).map(([k]) => k);
const B = (o = {}) => ({ buildings: o.buildings || {}, manpower: o.manpower || 0, resources: o.resources || {} });
const sum = (xs) => xs.reduce((a, b) => a + b, 0);
// the per-state worth a category stands for, by hand: a city state is worth more of everything than a rural one
const WORTH = new Map([["city", { manpower: 3000, buildings: { industrial_complex: 3, arms_factory: 1, dockyard: 1 }, resources: { steel: 4 }, infrastructure: 4 }],
  ["rural", { manpower: 1000, buildings: { industrial_complex: 1, arms_factory: 1, dockyard: 1 }, resources: { steel: 1 }, infrastructure: 2 }]]);
const worthOf = (c) => WORTH.get(c) || null;
const st = (id, owner, category, o = {}) => ({ id, owner, category, coastal: !!o.coastal, slots: o.slots == null ? (category === "city" ? 6 : 2) : o.slots, unknownSlots: !!o.unknownSlots, carried: B(o.carried) });

console.log("=== 1. carry first, then the rest by what a state of its kind holds ===");
{
  // AAA: a city state that kept land worth 1,000 people and a larger rural state raised from the sea; its budget is 10,001
  const states = [st(1, "AAA", "city", { carried: { manpower: 1000, buildings: { industrial_complex: 1 }, resources: { steel: 2 } } }), st(2, "AAA", "rural")];
  const budgets = new Map([["AAA", B({ manpower: 10001, buildings: { industrial_complex: 4 }, resources: { steel: 7 } })]]);
  const r = keep({ states, budgets, worthOf, rules: RULES });
  const rest = 10001 - 1000, wc = WORTH.get("city").manpower, wr = WORTH.get("rural").manpower;
  const exp1 = 1000 + rest * wc / (wc + wr), exp2 = rest * wr / (wc + wr);
  rec("the fixture: by category the city state's share of the rest is the larger, by size the rural one's would be", wc > wr);
  rec("Σ manpower is the budget, exactly", r.manpower.get(1) + r.manpower.get(2) === 10001, [...r.manpower]);
  rec("⭐ each state is its carry plus the rest by its category's worth, made whole", Math.abs(r.manpower.get(1) - exp1) < 1 && Math.abs(r.manpower.get(2) - exp2) < 1, { got: [...r.manpower], exp1, exp2 });
  rec("Σ steel is the budget, exactly, and each state got some", r.resources.get(1).steel + r.resources.get(2).steel === 7 && r.resources.get(2).steel > 0, [...r.resources]);
  rec("the buildings stay fractions for the deal, summing to the budget", Math.abs(sum([...r.want.values()].map((w) => w.industrial_complex || 0)) - 4) < 1e-9, [...r.want]);
  rec("…and the carried factory stays with the state whose land held it", r.want.get(1).industrial_complex >= 1, r.want.get(1));
  rec("nothing is short, scaled down or unplaced", !r.report.short.length && !r.report.scaledDown.length && !r.report.unplaced.length, r.report);
}
{
  // CCC holds land below that was DDD's: its carry is over its own budget, and is scaled down to it, pro rata
  const states = [st(1, "CCC", "rural", { carried: { manpower: 300, resources: { steel: 3 } } }), st(2, "CCC", "rural", { carried: { manpower: 100, resources: { chromium: 2 } } })];
  const r = keep({ states, budgets: new Map([["CCC", B({ manpower: 200, resources: { steel: 3 } })]]), worthOf, rules: RULES });
  rec("⭐ a carry over the budget is scaled down pro rata, to the budget", r.manpower.get(1) === 150 && r.manpower.get(2) === 50, [...r.manpower]);
  rec("…and a resource it held none of below is scaled to nothing", !r.resources.get(2).chromium && r.resources.get(1).steel === 3, [...r.resources]);
  rec("…and it is said", JSON.stringify(r.report.scaledDown) === JSON.stringify(["CCC"]), r.report.scaledDown);
  // a state raised from the sea in a country whose carry is scaled down gets none of the rest: it still gets 1 person, from the largest
  const hollow = keep({ states: [st(1, "CCC", "rural", { carried: { manpower: 300 } }), st(2, "CCC", "rural")], budgets: new Map([["CCC", B({ manpower: 200 })]]), worthOf, rules: RULES });
  rec("⭐ a state left with nobody gets 1, taken from the country's largest, so its total is still the budget", hollow.manpower.get(2) === 1 && hollow.manpower.get(1) === 199, [...hollow.manpower]);
}
{
  // DDD already holds more in a state that loads now than its whole budget: nothing is left, never less than nothing
  const states = [st(1, "DDD", "rural", { carried: { manpower: 500, buildings: { industrial_complex: 2 } } }), st(2, "DDD", "city")];
  const r = keep({ states, budgets: new Map([["DDD", B({ manpower: 1000, buildings: { industrial_complex: 2 } })]]),
    held: new Map([["DDD", B({ manpower: 5000, buildings: { industrial_complex: 3 } })]]), worthOf, rules: RULES });
  rec("⭐ a budget below what already loads is 0: every carry is scaled to nothing, manpower to the minimum of 1", r.manpower.get(1) === 1 && r.manpower.get(2) === 1
    && !Object.keys(r.want.get(1)).length && !Object.keys(r.want.get(2)).length, { mp: [...r.manpower], want: [...r.want] });
  rec("…and the remaining it reports is 0, not negative", r.report.remaining.manpower === 0 && (r.report.remaining.buildings.industrial_complex || 0) === 0, r.report.remaining);
}
{
  // held and the ownerless charge both come off the budget
  const states = [st(1, "EEE", "rural")];
  const r = keep({ states, budgets: new Map([["EEE", B({ manpower: 1000, resources: { oil: 9 } })]]), held: new Map([["EEE", B({ manpower: 300, resources: { oil: 2 } })]]),
    ownerlessCharge: new Map([["EEE", B({ manpower: 200, resources: { oil: 3 } })]]), worthOf, rules: RULES });
  rec("⭐ what loads now and an ownerless state's carry on its land are both taken off the budget", r.manpower.get(1) === 500 && r.resources.get(1).oil === 4, { mp: r.manpower.get(1), res: r.resources.get(1) });
  const noCharge = keep({ states, budgets: new Map([["EEE", B({ manpower: 1000 })]]), held: new Map([["EEE", B({ manpower: 300 })]]), worthOf, rules: RULES });
  rec("CONTROL: without the charge it is budget − held", noCharge.manpower.get(1) === 700, noCharge.manpower.get(1));
}
{
  // a state whose category the slot table does not know keeps its carry and takes no building remainder; people still go there
  const states = [st(1, "FFF", "rural", { slots: 2 }), st(2, "FFF", "city", { unknownSlots: true, slots: Infinity, carried: { buildings: { industrial_complex: 1 } } })];
  const r = keep({ states, budgets: new Map([["FFF", B({ manpower: 4000, buildings: { industrial_complex: 3 } })]]), worthOf, rules: RULES });
  rec("⭐ a state with unknown slots keeps its carry and takes none of the rest", Math.abs((r.want.get(2).industrial_complex || 0) - 1) < 1e-9 && Math.abs((r.want.get(1).industrial_complex || 0) - 2) < 1e-9, [...r.want]);
  rec("…it is said by id", JSON.stringify(r.report.unknownSlots) === JSON.stringify([2]), r.report.unknownSlots);
  rec("…and its people are still spread there (slots bound buildings, not manpower)", r.manpower.get(2) > r.manpower.get(1), [...r.manpower]);
  const only = keep({ states: [states[1]], budgets: new Map([["FFF", B({ buildings: { industrial_complex: 3 } })]]), worthOf, rules: RULES });
  rec("a country whose every state has unknown slots places nothing past its carry, and says what it could not", only.report.unplaced.length === 1 && Math.abs(only.report.unplaced[0].buildings.industrial_complex - 2) < 1e-9, only.report.unplaced);
}
{
  // (the second review, R2-4) …and is no part of its country's capacity: UUU's known states have 8 slots for 11 levels, beside a state
  // of unknown slots that carries one factory. Counted in, that state's endless room hid the shortage, and the deal — which is handed
  // Infinity slots for it, as generateLand's slotsOf answers — poured what the known states had no room for into it
  const states = [st(1, "UUU", "city", { slots: 6 }), st(2, "UUU", "rural", { slots: 2 }), st(3, "UUU", "city", { unknownSlots: true, slots: Infinity, carried: { buildings: { industrial_complex: 1 } } })];
  const budget = { industrial_complex: 8, arms_factory: 4 }, carried = states[2].carried.buildings;
  const r = keep({ states, budgets: new Map([["UUU", B({ buildings: budget })]]), worthOf, rules: RULES });
  const slots = states[0].slots + states[1].slots, need = sum(Object.values(budget)) - sum(Object.values(carried));
  rec("CONTROL: the known states' need is over their slots", need > slots, { need, slots });
  rec("⭐⭐ the country is short on its KNOWN states, by their slots alone", r.report.short.length === 1 && r.report.short[0].tag === "UUU" && r.report.short[0].slots === slots
    && r.report.short[0].need === need, r.report.short);
  const d = deal({ rules: RULES, rowTypes: ROWS, states: states.map((s) => ({ id: s.id, owner: s.owner, want: r.want.get(s.id), slots: s.slots, coastal: s.coastal })) });
  rec("⭐⭐ …and dealt, the state of unknown slots holds its carry and nothing the known states had no room for", JSON.stringify(d.levels.get(3) || {}) === JSON.stringify(carried), [...d.levels]);
  rec("…while the known states hold their slots' worth, in the country's mix", sum([1, 2].map((id) => sum(SHARED.map((k) => (d.levels.get(id) || {})[k] || 0)))) === slots
    && [1, 2].some((id) => (d.levels.get(id) || {}).arms_factory > 0), [...d.levels]);
}
{
  // the coast: a coast-only key goes only to coastal states while the country has one
  const states = [st(1, "GGG", "city", { coastal: false }), st(2, "GGG", "rural", { coastal: true })];
  const r = keep({ states, budgets: new Map([["GGG", B({ buildings: { dockyard: 2, industrial_complex: 2 } })]]), worthOf, rules: RULES });
  rec("⭐ a coast-only key weighs nothing off the coast", !r.want.get(1).dockyard && Math.abs(r.want.get(2).dockyard - 2) < 1e-9, [...r.want]);
  rec("CONTROL: a key that is not coast-only goes to both, the city the more", r.want.get(1).industrial_complex > r.want.get(2).industrial_complex && r.want.get(2).industrial_complex > 0, [...r.want]);
  const inland = keep({ states: states.map((s) => ({ ...s, coastal: false })), budgets: new Map([["GGG", B({ buildings: { dockyard: 2 } })]]), worthOf, rules: RULES });
  rec("…with no coast at all it is spread anyway, so the deal says noCoast rather than losing it silently", Math.abs(sum([...inland.want.values()].map((w) => w.dockyard || 0)) - 2) < 1e-9, [...inland.want]);
}
{
  // a country without a budget entry, and one with a budget and no state here
  const r = keep({ states: [st(1, "HHH", "rural")], budgets: new Map([["III", B({ manpower: 5000, buildings: { industrial_complex: 2 } })]]), worthOf, rules: RULES });
  rec("a country with nothing below keeps nothing but the minimum of 1 person", r.manpower.get(1) === 1 && !Object.keys(r.want.get(1)).length, { mp: r.manpower.get(1), want: r.want.get(1) });
  rec("⭐ a country with a budget and no state here is said, never handed to another", r.report.unplaced.length === 1 && r.report.unplaced[0].tag === "III" && r.report.unplaced[0].manpower === 5000, r.report.unplaced);
  const own = keep({ states: [st(1, "", "rural", { carried: { manpower: 7 } })], budgets: new Map(), worthOf, rules: RULES });
  rec("a state with no owner is not this function's: it is in no map", !own.want.has(1) && !own.manpower.has(1) && !own.infrastructure.has(1), { want: [...own.want], mp: [...own.manpower] });
  const noMp = keep({ states: [st(1, "HHH", "rural")], budgets: new Map([["HHH", B({ manpower: 5000 })]]), worthOf, rules: RULES, withManpower: false });
  rec("withManpower false leaves manpower alone (a caller's own figure wins)", !noMp.manpower.has(1), [...noMp.manpower]);
}

console.log("\n=== 2. a country with less land than its factories need keeps its mix ===");
{
  // one 4-slot coastal state; the budget is 8 / 4 / 4: 16 levels for 4 slots
  const states = [st(1, "BBB", "rural", { slots: 4, coastal: true })];
  const budget = { industrial_complex: 8, arms_factory: 4, dockyard: 4 };
  const r = keep({ states, budgets: new Map([["BBB", B({ buildings: budget })]]), worthOf, rules: RULES });
  const need = sum(Object.values(budget)), slots = 4;
  rec("⭐ it is said, with its need and its slots", r.report.short.length === 1 && r.report.short[0].tag === "BBB" && r.report.short[0].need === need && r.report.short[0].slots === slots, r.report.short);
  rec("every shared want is scaled by slots ÷ need", SHARED.every((k) => Math.abs((r.want.get(1)[k] || 0) - budget[k] * slots / need) < 1e-9), r.want.get(1));
  const d = deal({ rules: RULES, rowTypes: ROWS, states: [{ id: 1, owner: "BBB", want: r.want.get(1), slots, coastal: true }] });
  const lv = d.levels.get(1) || {};
  rec("⭐⭐ dealt, it keeps its mix: each key within one of budget × slots ÷ need, and a military factory among them", SHARED.every((k) => Math.abs((lv[k] || 0) - Math.round(budget[k] * slots / need)) <= 1) && lv.arms_factory > 0, lv);
  rec("…and no more than its slots", sum(SHARED.map((k) => lv[k] || 0)) <= slots, lv);
  const raw = deal({ rules: RULES, rowTypes: ROWS, states: [{ id: 1, owner: "BBB", want: budget, slots, coastal: true }] });
  rec("CONTROL: dealt by want alone, one key takes every slot", SHARED.filter((k) => (raw.levels.get(1) || {})[k] > 0).length === 1, raw.levels.get(1));
  const inland = keep({ states: [st(1, "BBB", "rural", { slots: 4, coastal: false })], budgets: new Map([["BBB", B({ buildings: budget })]]), worthOf, rules: RULES });
  rec("a coast-only key counts toward the need only where the country has a coast", inland.report.short.length === 1 && inland.report.short[0].need === need - budget.dockyard, inland.report.short);
}

console.log("\n=== 3. infrastructure ===");
{
  const states = [st(1, "AAA", "city"), st(2, "AAA", "rural"), st(3, "AAA", "rural")];
  const r = keep({ states, budgets: new Map([["AAA", B({ manpower: 9 })]]), worthOf, rules: RULES, infraBelow: new Map([["AAA", 3.5]]), infraMax: 5 });
  const lv = [1, 2, 3].map((id) => r.infrastructure.get(id));
  rec("⭐ the country's mean below is kept (within 0.5)", Math.abs(sum(lv) / lv.length - 3.5) <= 0.5, lv);
  rec("…shaped by category: the city the higher", lv[0] > lv[1] && lv[1] === lv[2], lv);
  rec("…and every level 1..state_max", lv.every((v) => v >= 1 && v <= 5), lv);
  const flat = keep({ states, budgets: new Map([["AAA", B({ manpower: 9 })]]), worthOf, rules: RULES, infraMax: 5 });
  rec("⭐ a country nothing below gives a level keeps the flat 2, and is said", [1, 2, 3].every((id) => flat.infrastructure.get(id) === 2) && JSON.stringify(flat.report.keptFlat) === JSON.stringify(["AAA"]), { lv: [...flat.infrastructure], kept: flat.report.keptFlat });
  const low = keep({ states, budgets: new Map(), worthOf, rules: RULES, infraBelow: new Map([["AAA", 0.2]]), infraMax: 5 });
  rec("a mean below 1 still leaves every state a level of 1 (a supply path)", [1, 2, 3].every((id) => low.infrastructure.get(id) === 1), [...low.infrastructure]);
  const cap = keep({ states, budgets: new Map(), worthOf, rules: RULES, infraBelow: new Map([["AAA", 9]]), infraMax: 5 });
  rec("…and none above state_max", [1, 2, 3].every((id) => cap.infrastructure.get(id) <= 5), [...cap.infrastructure]);
}
{
  // (the second review, R2-5) made whole per COUNTRY, not rounded per state: on TEST 33's world rounding each state alone wrote 2,166
  // levels for 2,200 (7 states at 5 became 2). Three states of one kind at a mean of 2.4 are 7 levels; rounded alone, 3 × 2 = 6
  const states = [st(1, "AAA", "rural"), st(2, "AAA", "rural"), st(3, "AAA", "rural")], mean = 2.4;
  const r = keep({ states, budgets: new Map(), worthOf, rules: RULES, infraBelow: new Map([["AAA", mean]]), infraMax: 5 });
  const lv = [1, 2, 3].map((id) => r.infrastructure.get(id));
  rec(`CONTROL: rounded per state they would hold ${states.length * Math.round(mean)} levels, made whole ${Math.round(states.length * mean)}, and no clamp binds`,
    states.length * Math.round(mean) !== Math.round(states.length * mean) && Math.ceil(mean) <= 5 && Math.floor(mean) >= 1);
  rec("⭐⭐ Σ levels is round(states × the country's mean below), each level the mean's floor or ceiling", sum(lv) === Math.round(states.length * mean)
    && lv.every((v) => v === Math.floor(mean) || v === Math.ceil(mean)), lv);
  // every largest remainder here breaks a tie the same way, so the answer is the same whatever order the states come in
  rec("⭐ …and the level left over by a tie goes to the lowest id", lv[0] === Math.ceil(mean) && lv.slice(1).every((v) => v === Math.floor(mean)), lv);
}

console.log("\n=== 4. the deal order: the coast-only shared keys first, the write order as it was ===");
{
  // a coastal 1-slot state and an inland 4-slot one of the same country; the factory share, the larger, sits on the coast
  const states = [{ id: 1, owner: "A", want: { industrial_complex: 1.4, dockyard: 1 }, slots: 1, coastal: true }, { id: 2, owner: "A", want: {}, slots: 4, coastal: false }];
  const d = deal({ rules: RULES, rowTypes: ROWS, states });
  rec("the fixture: by share the factory would be dealt first, and fill the coast's one slot", 1.4 > 1);
  rec("⭐⭐ the dockyard is dealt first and stands on the coast; the factory goes inland; nothing is dropped",
    (d.levels.get(1) || {}).dockyard === 1 && (d.levels.get(2) || {}).industrial_complex === 1 && !Object.keys(d.report.dropped.noRoom).length, { levels: [...d.levels], dropped: d.report.dropped });
  rec("⭐ the WRITE order is unchanged: shared keys by share, the factory before the dockyard", JSON.stringify(d.order) === JSON.stringify(["industrial_complex", "dockyard"]), d.order);
  rec("…and the deal order puts the coast-only key first", JSON.stringify(d.dealOrder) === JSON.stringify(["dockyard", "industrial_complex"]), d.dealOrder);
}

console.log("\n=== 5. stateWorthByCategory ===");
{
  const S = (id, category, manpower, buildings, o = {}) => ({ id, provinces: [id], category, manpower, buildings, resources: o.resources || {}, victoryPoints: o.vp ? [{ province: id, value: o.vp }] : [], buildingsDated: !!o.dated });
  const states = [S(1, "rural", 100, { infrastructure: 2, industrial_complex: 1 }, { vp: 1, resources: { oil: 4 } }), S(2, "rural", 300, { industrial_complex: 3 }, { vp: 3 }),
    S(3, "city", 1000, { infrastructure: 4, industrial_complex: 6, air_base: 5 }, { vp: 10 }), S(4, "city", 2000, { industrial_complex: 50, infrastructure: 5 }, { dated: true, vp: 20 }),
    { id: 5, provinces: [], category: "city", manpower: 9e9, buildings: {}, resources: {}, victoryPoints: [] }];
  const w = worthBy({ states });
  const rural = w.get("rural") || {}, city = w.get("city") || {}, all = w.get("*") || {};
  rec("per-state means per category", rural.states === 2 && rural.manpower === 200 && rural.vp === 2 && rural.resources.oil === 2 && rural.buildings.industrial_complex === 2, rural);
  rec("⭐ infrastructure is a mean with a level not declared as 0, and says how many declare one", rural.infrastructure === 1 && rural.infraDeclared === 1, rural);
  rec("⭐ a state whose buildings block is dated-first gives no buildings and no infrastructure, but its people and its star count",
    city.states === 2 && city.manpower === 1500 && city.vp === 15 && city.buildings.industrial_complex === 6 && city.infrastructure === 4, city);
  rec("infrastructure and air_base are not buildings here", !("infrastructure" in (city.buildings || {})) && !("air_base" in (city.buildings || {})), city.buildings);
  rec("a state with no provinces is not counted", all.states === 4, all);
  rec("\"*\" is every state together", all.manpower === (100 + 300 + 1000 + 2000) / 4 && all.vp === (1 + 3 + 10 + 20) / 4, all);
}

console.log("\n=== 6. 10^8 people are made whole without a one-level loop (child process, 20 s) ===");
{
  // 1,000 states: a one-level-at-a-time loop is then 3·10^11 steps however tight it is (at 40 states one finished in time)
  const code = `const md = require(${JSON.stringify(path.join(__dirname, "map-data.js"))});
    const states = Array.from({ length: 1000 }, (_, i) => ({ id: i + 1, owner: "CHI", category: "rural", coastal: false, slots: 2, carried: { buildings: {}, manpower: 0, resources: {} } }));
    const r = md.keepCountryEconomies({ states, budgets: new Map([["CHI", { buildings: {}, manpower: 327000001, resources: {} }]]), worthOf: () => ({ manpower: 1 }), rules: new Map() });
    let s = 0; for (const v of r.manpower.values()) s += v; console.log("SUM " + s);`;
  const t0 = Date.now();
  const r = spawnSync(process.execPath, ["-e", code], { encoding: "utf8", timeout: 20000, cwd: __dirname });
  console.log(`   (finished in ${((Date.now() - t0) / 1000).toFixed(1)} s)`);
  rec("⭐ it finished, and Σ is the budget exactly", r.status === 0 && /SUM 327000001\b/.test(r.stdout || ""), { status: r.status, signal: r.signal, out: (r.stdout || "").slice(0, 200), err: (r.stderr || "").slice(-300) });
}

console.log("\n=== 7. 500 seeded worlds ===");
{
  let seed = 20261008;
  const rnd = () => { seed = (seed * 1103515245 + 12345) >>> 0; return seed / 4294967296; };
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const TAGS = ["AAA", "BBB", "CCC", "DDD"];
  const bad = { sums: [], res: [], slots: [], coast: [], shuffled: [], kind: [], infra: [] };
  let worlds = 0, sums = 0, res = 0, slotsOk = 0, coastOk = 0, shuffled = 0, kind = 0, infra = 0;
  for (let w = 0; w < 500; w++) {
    worlds++;
    const n = 2 + Math.floor(rnd() * 14);
    const states = Array.from({ length: n }, (_, i) => st(10 + i * 7, pick(TAGS), pick(["city", "rural"]), { coastal: rnd() < 0.5, slots: pick([1, 2, 4, 6]),
      carried: rnd() < 0.5 ? { manpower: Math.floor(rnd() * 5000), buildings: { industrial_complex: Math.floor(rnd() * 8) / 4, dockyard: Math.floor(rnd() * 4) / 4 }, resources: { steel: Math.floor(rnd() * 12) / 4 } } : {} }));
    // people in the tens of thousands, so a one-level-at-a-time back-out still finishes here and fails in section 6's child instead
    const budgets = new Map(TAGS.map((t) => [t, B({ manpower: 1000 * n + Math.floor(rnd() * 20000), buildings: { industrial_complex: Math.floor(rnd() * 20), arms_factory: Math.floor(rnd() * 10), dockyard: Math.floor(rnd() * 6), anti_air_building: Math.floor(rnd() * 4) },
      resources: { steel: Math.floor(rnd() * 40), oil: Math.floor(rnd() * 9) } })]));
    const held = new Map(TAGS.filter(() => rnd() < 0.3).map((t) => [t, B({ manpower: Math.floor(rnd() * 2000), resources: { steel: Math.floor(rnd() * 10) } })]));
    const infraBelow = new Map(TAGS.filter(() => rnd() < 0.8).map((t) => [t, 1 + rnd() * 3]));
    const args = { budgets, held, worthOf, rules: RULES, infraBelow, infraMax: 5 };
    const r = keep({ states, ...args });
    const left = (t, kind, k) => Math.max(0, (k ? (budgets.get(t)[kind][k] || 0) - (((held.get(t) || {})[kind] || {})[k] || 0) : budgets.get(t)[kind] - ((held.get(t) || {})[kind] || 0)));
    const owners = [...new Set(states.map((s) => s.owner))];
    // Σ manpower and each resource per country: the remaining budget exactly (manpower's floor of 1 cannot bind: each budget ≥ 1,000 a state)
    if (owners.every((t) => sum(states.filter((s) => s.owner === t).map((s) => r.manpower.get(s.id))) === Math.round(left(t, "manpower")))) sums++; else bad.sums.push(w);
    if (owners.every((t) => ["steel", "oil"].every((k) => sum(states.filter((s) => s.owner === t).map((s) => r.resources.get(s.id)[k] || 0)) === Math.round(left(t, "resources", k))))) res++; else bad.res.push(w);
    // dealt: no state over its slots, no dockyard off the coast
    const d = deal({ rules: RULES, rowTypes: ROWS, states: states.map((s) => ({ id: s.id, owner: s.owner, want: r.want.get(s.id), slots: s.slots, coastal: s.coastal })) });
    if (states.every((s) => sum(SHARED.map((k) => (d.levels.get(s.id) || {})[k] || 0)) <= s.slots)) slotsOk++; else bad.slots.push(w);
    if (states.every((s) => s.coastal || !((d.levels.get(s.id) || {}).dockyard))) coastOk++; else bad.coast.push(w);
    // the same answer for the states in any order
    const r2 = keep({ states: states.slice().sort(() => rnd() - 0.5).reverse(), ...args });
    const flat = (x) => JSON.stringify(states.map((s) => [s.id, x.want.get(s.id), x.manpower.get(s.id), x.resources.get(s.id), x.infrastructure.get(s.id)]));
    if (flat(r) === flat(r2) && JSON.stringify(r.report) === JSON.stringify(r2.report)) shuffled++; else bad.shuffled.push(w);
    // two states of one country and one category with no carry get remainders within one person of each other
    const pairs = owners.flatMap((t) => ["city", "rural"].map((c) => states.filter((s) => s.owner === t && s.category === c && !s.carried.manpower)));
    if (pairs.every((g) => g.length < 2 || Math.max(...g.map((s) => r.manpower.get(s.id))) - Math.min(...g.map((s) => r.manpower.get(s.id))) <= 1)) kind++; else bad.kind.push(w);
    // infrastructure: 1..5, and a country with no level below is flat 2
    if (states.every((s) => { const v = r.infrastructure.get(s.id); return infraBelow.has(s.owner) ? v >= 1 && v <= 5 : v === 2; })) infra++; else bad.infra.push(w);
  }
  rec(`⭐ Σ manpower per country is its remaining budget, exactly, in ${sums}/${worlds} worlds`, sums === worlds, bad.sums.slice(0, 5));
  rec(`⭐ Σ each resource per country is its remaining budget, exactly, in ${res}/${worlds}`, res === worlds, bad.res.slice(0, 5));
  rec(`dealt, no state over its slots, in ${slotsOk}/${worlds}`, slotsOk === worlds, bad.slots.slice(0, 5));
  rec(`dealt, no dockyard off the coast, in ${coastOk}/${worlds}`, coastOk === worlds, bad.coast.slice(0, 5));
  rec(`⭐ the same answer whatever order the states come in, in ${shuffled}/${worlds}`, shuffled === worlds, bad.shuffled.slice(0, 5));
  rec(`two states of one kind with nothing carried differ by at most one person, in ${kind}/${worlds}`, kind === worlds, bad.kind.slice(0, 5));
  rec(`infrastructure 1..state_max, the flat 2 where nothing below says, in ${infra}/${worlds}`, infra === worlds, bad.infra.slice(0, 5));
}

console.log("\n=== 8. economyTakenWithLand: what a country over its budget took with the land its states stand on ===");
{
  const take = md.economyTakenWithLand;
  rec("map-data.js exports economyTakenWithLand", typeof take === "function");
  const M = (o) => new Map(Object.entries(o));
  const on = (o) => new Map(Object.entries(o).map(([t, by]) => [t, M(by)]));
  const got = (r, t, kind = "manpower", k = null) => { const v = r.get(t); return v ? (k == null ? v[kind] : (v[kind] || {})[k] || 0) : 0; };
  // a second Generate land click: CAN's first-click state stands on BRA land worth 2,000 and holds a share of CAN's own budget
  const second = take({ budgets: M({ CAN: B({ manpower: 10000 }), BRA: B({ manpower: 40000 }) }), held: M({ CAN: B({ manpower: 10000 }), BRA: B({ manpower: 40000 }) }),
    standsOn: on({ CAN: { BRA: B({ manpower: 2000 }) } }) });
  rec("⭐⭐ a country within its budget took nothing with the land it stands on (the second click)", second.size === 0, [...second]);
  // an add-on moved Alsace (2,000 people, 3 steel) from FRA to GER, people and steel and all
  const alsace = take({ budgets: M({ GER: B({ manpower: 50000, resources: { steel: 10 } }), FRA: B({ manpower: 30000, resources: { steel: 5 } }) }),
    held: M({ GER: B({ manpower: 52000, resources: { steel: 13 } }) }), standsOn: on({ GER: { FRA: B({ manpower: 2000, resources: { steel: 3 } }) } }) });
  rec("⭐⭐ a country over its budget took the excess with the land: off the land's owner below", got(alsace, "FRA") === 2000 && got(alsace, "FRA", "resources", "steel") === 3, [...alsace]);
  const more = take({ budgets: M({ GER: B({ manpower: 50000 }) }), held: M({ GER: B({ manpower: 61000 }) }), standsOn: on({ GER: { FRA: B({ manpower: 2000 }) } }) });
  rec("⭐ …never more than that land's share, however far over it is", got(more, "FRA") === 2000, [...more]);
  const less = take({ budgets: M({ GER: B({ manpower: 50000 }) }), held: M({ GER: B({ manpower: 50500 }) }), standsOn: on({ GER: { FRA: B({ manpower: 2000 }) } }) });
  rec("⭐ …and no more than its excess", got(less, "FRA") === 500, [...less]);
  const two = take({ budgets: M({ GER: B({ manpower: 50000 }) }), held: M({ GER: B({ manpower: 51000 }) }), standsOn: on({ GER: { FRA: B({ manpower: 3000 }), BEL: B({ manpower: 1000 }) } }) });
  rec("⭐ two donors give pro rata to the land of theirs it stands on", Math.abs(got(two, "FRA") - 750) < 1e-9 && Math.abs(got(two, "BEL") - 250) < 1e-9, [...two]);
  const kinds = take({ budgets: M({ GER: B({ manpower: 50000, buildings: { industrial_complex: 9 } }) }), held: M({ GER: B({ manpower: 52000, buildings: { industrial_complex: 4 } }) }),
    standsOn: on({ GER: { FRA: B({ manpower: 2000, buildings: { industrial_complex: 2 } }) } }) });
  rec("each quantity on its own: over in people, under in factories, only people are taken", got(kinds, "FRA") === 2000 && got(kinds, "FRA", "buildings", "industrial_complex") === 0, [...kinds]);
  // a chain: GER holds Alsace (FRA's), FRA holds Belgian land, each moved people and all — FRA is over only once Alsace is gone
  const chain = take({ budgets: M({ GER: B({ manpower: 50000 }), FRA: B({ manpower: 30000 }), BEL: B({ manpower: 8000 }) }),
    held: M({ GER: B({ manpower: 52000 }), FRA: B({ manpower: 29000 }), BEL: B({ manpower: 5000 }) }),
    standsOn: on({ GER: { FRA: B({ manpower: 2000 }) }, FRA: { BEL: B({ manpower: 1000 }) } }) });
  rec("CONTROL: measured against its whole budget FRA is under it", 29000 < 30000);
  rec("⭐⭐ a donor that is a receiver too: FRA, without Alsace, is over by the Belgian land it holds, and that is taken off BEL",
    got(chain, "FRA") === 2000 && got(chain, "BEL") === 1000, [...chain]);
  const swap = take({ budgets: M({ GER: B({ manpower: 50000 }), FRA: B({ manpower: 30000 }) }), held: M({ GER: B({ manpower: 50001 }), FRA: B({ manpower: 30001 }) }),
    standsOn: on({ GER: { FRA: B({ manpower: 1e8 }) }, FRA: { GER: B({ manpower: 1e8 }) } }) });
  rec("a pair over budget on each other's land stops, and takes no more than the land", got(swap, "GER") <= 1e8 && got(swap, "FRA") <= 1e8 && got(swap, "FRA") > 0, [...swap]);
  rec("…and nothing at all from an empty world", take({}).size === 0);
}

console.log("\n" + (fails.length ? "FAILED " + fails.length + " of " + checks : "PASSED " + checks + " checks"));
if (fails.length) { for (const f of fails) console.log("  - " + f); process.exit(1); }
