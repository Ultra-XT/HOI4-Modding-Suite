// ⛔ #an-air-base-holds-the-planes-it-starts-with — THE PURE HALF: airWingKeyMoves, airWingDemand and generatedAirBaseLevels, over hand
// cases and 500 seeded worlds.
//
// The promise, asked of the output and nothing else: whichever one order-of-battle file each country loads (its bookmarks and DLC
// branches are alternatives), no state holds more planes than its air base has room for unless its need is past the state_max —
//   BEFORE the repair, every wing at the id its file names, and
//   AFTER Auto-fix's repair (fixAirWingsBasedAbroad, simulated here with the very rule it runs: airWingDestinations over the
//   country's states with an air base, room first, other countries' wings counted), every wing it moves where it lands — in EVERY
//   world: a wing its nearest state cannot hold even at the state_max was sized where the repair spills it, the next nearest
//   (#a-full-air-base-spills-where-it-was-sized). Only a state whose own need is past the state_max, named in `capped`, may be over —
//   one its file keys more planes than the state_max holds, or one whose country has no room left anywhere (a regenerated seed-2
//   world gave Germany one state for 3,018 planes). This asked "after" only of worlds where nothing was capped (316 of 500), so the
//   spill went unseen: sized as if room were endless, 9 of these worlds ended with a state that was not capped over after the repair.
// Sizing only where a wing ends up left 74–95 of TEST 32's wings at a state with no air base until Auto-fix ran; sizing a country's
// total instead of each destination left a wing with nowhere to fit once it moved.
"use strict";
const md = require("./map-data.js");

let pass = 0, fail = 0;
const ok = (c, m, x) => {
  if (c) { pass++; console.log("  ok   " + m); }
  else { fail++; console.log("  FAIL " + m + (x !== undefined ? "   -> " + JSON.stringify(x).slice(0, 500) : "")); }
};
const { airWingKeyMoves: moves, airWingDemand: demand, generatedAirBaseLevels: levelsOf, airWingDestinations: destinations } = md;
ok([moves, demand, levelsOf, destinations].every((f) => typeof f === "function"), "map-data.js exports airWingKeyMoves, airWingDemand, generatedAirBaseLevels and airWingDestinations");

console.log("\n-- hand cases --");
{
  ok(!moves({ tag: "GER", ownerNow: "GER", ownerBeneath: "ENG" }) && !moves({ tag: "GER", ownerNow: "", ownerBeneath: "ENG" }), "a wing in its own country's state, or in one nobody owns, stays");
  ok(!moves({ tag: "ENG", ownerNow: "PAL", ownerBeneath: "PAL" }) && moves({ tag: "ENG", ownerNow: "PAL", ownerBeneath: "PAL", noted: true }),
    "one the world beneath already based in that country's state stays (the base game's own 22) — unless Nova moved it there itself");
  ok(moves({ tag: "GER", ownerNow: "eng", ownerBeneath: "GER" }) && moves({ tag: "GER", ownerNow: "ENG", ownerBeneath: "" }), "a wing in another country's state the world beneath did not give it moves (tags in any case)");

  const L = levelsOf({ states: [{ id: 1, carried: 4 }, { id: 2, planes: 120 }, { id: 3, planes: 400 }, { id: 4, named: true }, { id: 5 }, { id: 6, carried: 2, named: true, planes: 101 }], mult: 50, cap: 5 });
  ok([1, 2, 3, 4, 5, 6].map((i) => L.levels.get(i)).join() === "4,3,5,1,0,3" && L.capped.join() === "3", "carried, ⌈planes / mult⌉ and the named floor, the largest of them, capped at the state_max — and 0 is none", { levels: [...L.levels], capped: L.capped });
  ok(levelsOf({ states: [{ id: 1, planes: 1 }] }).levels.get(1) === 1 && levelsOf({ states: [{ id: 1, planes: 201 }], mult: 0 }).levels.get(1) === 2, "with no define, the base game's 200 planes a level");

  // two countries, each with two files (one loads): the most of one file, summed over the countries
  const w = (file, tag, state, planes) => ({ kind: "air_wing", file, tag, state, planes });
  const d = demand({ wings: [w("A1", "AAA", 1, 100), w("A1", "AAA", 1, 50), w("A2", "AAA", 1, 300), w("B1", "BBB", 1, 70), w("B2", "BBB", 2, 10)] });
  ok(d.planes.get(1) === 300 + 70 && d.planes.get(2) === 10 && d.moving === 0, "a country's alternatives are not added together — the most of any one file — and countries are", [...d.planes]);
  // a wing the repair moves is sized at both ids: where its file names it, and the nearest of its country's homes
  const at = { 1: { x: 0, z: 0 }, 2: { x: 10, z: 0 }, 3: { x: 3, z: 0 }, 4: { x: -3, z: 0 } };
  const own = { 1: "AAA", 2: "BBB", 3: "BBB", 4: "BBB" };
  const m = demand({ wings: [w("B1", "BBB", 1, 150), w("B1", "BBB", 3, 20)], ownerNow: (id) => own[id], ownerBeneath: () => "", homesOf: (t) => Object.keys(own).map(Number).filter((id) => own[id] === t),
    centreOfState: (id) => at[id], centreOfProvinces: () => null, oldProvincesOf: () => [] });
  ok(m.moving === 1 && m.planes.get(1) === 150 && m.planes.get(3) === 170 && m.movedIn.get(3) === 150 && !m.movedIn.has(4), "⭐⭐ a moving wing counts where its file names it AND at its country's nearest state — the lower id of two as near", { planes: [...m.planes], movedIn: [...m.movedIn] });
  ok(demand({ wings: [w("B1", "BBB", 1, 150)], ownerNow: (id) => own[id], ownerBeneath: () => "" }).planes.get(1) === 150 && demand({ wings: [w("B1", "BBB", 1, 150)], ownerNow: (id) => own[id], ownerBeneath: () => "" }).moving === 0,
    "with no homes to ask (the split pass), nothing moves: a wing counts where it is");

  // ⛔ #a-full-air-base-spills-where-it-was-sized — room is asked as the repair asks it: up to the state_max, other countries' wings that
  // stay counted. BBB's homes from state 1, nearest first: 3, then 4 (as near; the higher id), then 2.
  const R = 200, KEEP = 20, WING = 150, ASK = { ownerNow: (id) => own[id], homesOf: (t) => Object.keys(own).map(Number).filter((id) => own[id] === t), centreOfState: (id) => at[id], centreOfProvinces: () => null, oldProvincesOf: () => [] };
  ok(KEEP + WING <= R && KEEP + 2 * WING > R && WING <= R, `(the fixture: one ${WING}-plane wing fits beside BBB's own ${KEEP} at state 3 within ${R}, two do not)`);
  const S = demand({ ...ASK, wings: [w("B1", "BBB", 3, KEEP), w("B1", "BBB", 1, WING), w("B1", "BBB", 1, WING)], ownerBeneath: () => "", room: R });
  ok(S.planes.get(3) === KEEP + WING && S.planes.get(4) === WING && S.movedIn.get(3) === WING && S.movedIn.get(4) === WING,
    "⭐⭐⭐ a wing the nearest state cannot hold even at the state_max is sized where the repair will spill it — the next nearest — and the nearest only for what it can hold", { planes: [...S.planes], movedIn: [...S.movedIn] });
  const endless = demand({ ...ASK, wings: [w("B1", "BBB", 3, KEEP), w("B1", "BBB", 1, WING), w("B1", "BBB", 1, WING)], ownerBeneath: () => "" });
  ok(endless.planes.get(3) === KEEP + 2 * WING && !endless.planes.has(4), "(…with no room given, room is not asked: everything at the nearest, as before)", [...endless.planes]);
  const FOREIGN = R - WING + 10;   // AAA's wing the world beneath already based in BBB's state 3: it stays, and takes room there
  const F = demand({ ...ASK, wings: [w("A1", "AAA", 3, FOREIGN), w("B1", "BBB", 1, WING)], ownerBeneath: (id) => (id === 3 ? "BBB" : ""), room: R });
  ok(F.moving === 1 && F.planes.get(3) === FOREIGN && F.planes.get(4) === WING && !F.movedIn.has(3),
    "⭐⭐⭐ another country's wing that stays in the nearest state counts against its room, as the repair counts it: the wing is sized at the next", { planes: [...F.planes], movedIn: [...F.movedIn] });
  const ALT = R - WING - 10;   // …but a country's two alternative files there count once, the most of either: one loads
  ok(ALT + WING <= R && 2 * ALT + WING > R, `(the fixture: ${WING} fits beside one of AAA's files' ${ALT}, not beside both)`);
  const A = demand({ ...ASK, wings: [w("A1", "AAA", 3, ALT), w("A2", "AAA", 3, ALT), w("B1", "BBB", 1, WING)], ownerBeneath: (id) => (id === 3 ? "BBB" : ""), room: R });
  ok(A.movedIn.get(3) === WING && !A.planes.has(4), "⭐⭐ …and a country's alternative files count once against it, the most of any one, as the repair counts them", { planes: [...A.planes], movedIn: [...A.movedIn] });
}

console.log("\n-- ⭐ 500 seeded worlds, before and after the repair --");
let seed = 77;
const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
const int = (a, b) => a + Math.floor(rnd() * (b - a + 1));
function world() {
  const tags = ["AAA", "BBB", "CCC", "DDD"].slice(0, int(2, 4));
  const n = int(4, 18), states = [];
  for (let id = 1; id <= n; id++) states.push({ id, owner: rnd() < 0.1 ? "" : tags[int(0, tags.length - 1)], at: { x: int(0, 100), z: int(0, 50) }, old: { x: int(0, 100), z: int(0, 50) },
    beneath: rnd() < 0.3 ? "" : tags[int(0, tags.length - 1)], carried: rnd() < 0.25 ? int(1, 6) : 0 });
  const wings = [];
  for (const t of tags) for (let f = int(1, 3); f > 0; f--) for (let k = int(1, 6); k > 0; k--) wings.push({ kind: "air_wing", file: `${t}_${f}.txt`, tag: t, state: int(1, n), planes: int(1, 30) * 10 });
  const named = new Set(wings.map((x) => x.state));
  for (const s of states) if (rnd() < 0.1) named.add(s.id);
  return { tags, states, wings, named, mult: [50, 100, 200][int(0, 2)], cap: rnd() < 0.4 ? Infinity : int(3, 10) };
}
const bad = { formula: [], capped: [], before: [], after: [], shuffle: [] };
let worlds = 0, movedSeen = 0, cappedSeen = 0, choices = 0, whole = 0, spilled = 0;
for (let w = 0; w < 500; w++) {
  const W = world();
  const byId = new Map(W.states.map((s) => [s.id, s]));
  const ownerNow = (id) => (byId.get(id) || {}).owner || "", ownerBeneath = (id) => (byId.get(id) || {}).beneath || "";
  const homesOf = (t) => W.states.filter((s) => s.owner === t).map((s) => s.id);
  const centreOfState = (id) => (byId.get(id) || {}).at || null;
  const centreOfProvinces = (ps) => (ps.length ? byId.get(ps[0] - 10000).old : null);   // a state's old place: its own key, 10000 up
  const oldProvincesOf = (id) => [id + 10000];
  const room = W.cap * W.mult;   // the most one state can be sized for: the state_max's room (Infinity with none)
  const dm = demand({ wings: W.wings, ownerNow, ownerBeneath, homesOf, centreOfState, centreOfProvinces, oldProvincesOf, room });
  // (a world where the state_max sent a wing past its nearest state: the sizing differs from one that never asks room)
  if (JSON.stringify([...demand({ wings: W.wings, ownerNow, ownerBeneath, homesOf, centreOfState, centreOfProvinces, oldProvincesOf }).movedIn].sort()) !== JSON.stringify([...dm.movedIn].sort())) spilled++;
  const L = levelsOf({ states: W.states.map((s) => ({ id: s.id, carried: s.carried, named: W.named.has(s.id), planes: dm.planes.get(s.id) || 0 })), mult: W.mult, cap: W.cap });
  worlds++; movedSeen += dm.moving; cappedSeen += L.capped.length;
  const lv = (id) => L.levels.get(id) || 0;
  for (const s of W.states) {
    const want = Math.max(s.carried, W.named.has(s.id) ? 1 : 0, Math.ceil((dm.planes.get(s.id) || 0) / W.mult));
    if (lv(s.id) !== Math.min(W.cap, want)) bad.formula.push({ w, id: s.id });
    if ((want > W.cap) !== L.capped.includes(s.id)) bad.capped.push({ w, id: s.id });
  }
  const capped = new Set(L.capped);
  if (!capped.size) whole++;
  // the repair, as fixAirWingsBasedAbroad runs it: per file, homes = the country's states with an air base, room first, the
  // other countries' kept wings counted (the most of any one of their files)
  const files = new Map();
  for (const x of W.wings) { if (!files.has(x.file)) files.set(x.file, []); files.get(x.file).push(x); }
  const keepsOf = (f) => files.get(f).filter((x) => !moves({ tag: x.tag, ownerNow: ownerNow(x.state), ownerBeneath: ownerBeneath(x.state) }));
  const after = new Map();   // file → [{ state, planes }] once moved
  for (const [f, ks] of files) {
    const T = ks[0].tag;
    const foreign = (id) => { let sum = 0; for (const t of W.tags) if (t !== T) sum += Math.max(0, ...[...files.keys()].filter((g) => files.get(g)[0].tag === t).map((g) => keepsOf(g).filter((x) => x.state === id).reduce((a, x) => a + x.planes, 0))); return sum; };
    const keys = ks.map((x, i) => ({ i, tag: T, state: x.state, planes: x.planes, oldProvinces: oldProvincesOf(x.state), moving: moves({ tag: T, ownerNow: ownerNow(x.state), ownerBeneath: ownerBeneath(x.state) }) }));
    const dest = destinations({ keys, homesOf: (t) => homesOf(t).filter((id) => lv(id) > 0), centreOfState, centreOfProvinces, capacityOf: (id) => W.mult * lv(id), foreignLoad: foreign });
    after.set(f, keys.map((k) => ({ state: k.moving && dest.get(k.i) ? dest.get(k.i).to : k.state, planes: k.planes })));
  }
  // every choice of one file per country
  const perTag = W.tags.map((t) => [...files.keys()].filter((f) => files.get(f)[0].tag === t));
  const combos = perTag.reduce((acc, fs) => acc.flatMap((c) => fs.map((f) => c.concat(f))), [[]]);
  for (const combo of combos) {
    choices++;
    for (const [which, place] of [["before", (f) => files.get(f).map((x) => ({ state: x.state, planes: x.planes }))], ["after", (f) => after.get(f)]]) {
      const load = new Map();
      for (const f of combo) for (const x of place(f)) load.set(x.state, (load.get(x.state) || 0) + x.planes);
      for (const [id, n] of load) if (byId.has(id) && !capped.has(id) && n > W.mult * lv(id)) { bad[which].push({ w, id, n, room: W.mult * lv(id), combo }); break; }
    }
  }
  // the same wings with the files in another order, and the states listed in another order: the same levels
  const order = [...files.keys()].sort(() => rnd() - 0.5);
  const dm2 = demand({ wings: order.flatMap((f) => files.get(f)), ownerNow, ownerBeneath, homesOf, centreOfState, centreOfProvinces, oldProvincesOf, room });
  const L2 = levelsOf({ states: W.states.slice().reverse().map((s) => ({ id: s.id, carried: s.carried, named: W.named.has(s.id), planes: dm2.planes.get(s.id) || 0 })), mult: W.mult, cap: W.cap });
  if (W.states.some((s) => L2.levels.get(s.id) !== lv(s.id)) || L2.capped.join() !== L.capped.join()) bad.shuffle.push(w);
}
ok(worlds === 500 && movedSeen > 500 && cappedSeen > 10 && whole > 150 && worlds - whole > 50 && spilled > 10 && choices > 2000,
  `(the worlds: ${worlds}, ${movedSeen} wings the repair moves, ${cappedSeen} states past the state_max, ${whole} worlds with none and ${worlds - whole} with some, ${spilled} where the state_max sent a wing past its nearest state, ${choices} choices of one file per country)`);
ok(bad.formula.length === 0 && bad.capped.length === 0, "every level is min(state_max, max(carried, named, ⌈planes / mult⌉)), and capped names exactly those past it", { formula: bad.formula.slice(0, 3), capped: bad.capped.slice(0, 3) });
ok(bad.before.length === 0, "⭐⭐⭐ BEFORE the repair, whichever file each country loads, no state holds more planes than it has room for", bad.before.slice(0, 3));
ok(bad.after.length === 0, "⭐⭐⭐ AFTER the repair moves the wings it moves, the same — in every world, those with a need past the state_max too", bad.after.slice(0, 3));
ok(bad.shuffle.length === 0, "⭐⭐ the same levels whatever order the files and the states come in", bad.shuffle.slice(0, 5));

console.log("\n" + (fail ? "FAILED " + fail + "/" + (pass + fail) : "PASSED " + pass + "/" + pass));
process.exitCode = fail ? 1 : 0;
