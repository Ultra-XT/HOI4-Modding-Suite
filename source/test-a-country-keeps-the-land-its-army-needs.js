// ⛔ #a-country-keeps-the-land-its-army-needs — A COUNTRY HOLDS THE LAND ITS STARTED ARMY NEEDS, SO THE ARMY IS NOT A PILE.
//
// TEST 33 (the owner's flow: New mod → Delete map → Generate land 35% seed 1, inherit → Auto-fix → Redraw regions) kept every
// country of the base game and still started 12 piles of ten or more divisions on one province (Turkey 31 on 11898; China 59 in
// 1939), where the base game has none. The spread was not the cause — it cannot do better than a country's divisions over its
// provinces — the land was: Turkey won one 1-province state by the majority rule, and nothing sized a country's land by its army.
// So after the keep pass a country whose land is less than its started army needs (each order of battle it starts needs its
// divisions over its own density, the spread's) takes the nearest new land too. Only land the proximity pass dealt — a donor's own
// homeland never moves, and so neither does a harbour of it — a donor keeps its floor and its own army's need, a donor with a
// navy keeps its last coast on the ocean (Portugal gave its whole coast to a first draft and its fleets started at sea), and no
// hand-over costs any land its supply route (a first build handed Mongolia walled-in raised sea and cut the USA's own land off:
// land with no route rose from 26.46% to 30.94%).
//
// This test pins:
//   1. orderOfBattleDensity: the one density the spread and the land need share.
//   2. keepEveryCountryBelow's second pass as a pure function, on a chain whose donor groups are RAISED SEA owned by proximity:
//      exactly the need, nearest first; nothing without a need; the floor; the donor's own need; the HOMELAND guard; the NAVY
//      guard; the SUPPLY REACH (the receiver's, the donor's, and the receiver's own homeland); pass 1 unchanged; one touching land
//      first, land just taken included; a group changes hands once; sizeOf; order-free.
//   3. armyLandNeed: every started file (a date, a DLC branch) counted; the divisions of the copy the game LOADS (a modder's added
//      army counts, Nova's pile does not change the count); the density of the copy BELOW (honouring the mod's own replace_path);
//      a country not asked about not read; the navies; the countries that can ship (convoys anywhere in the file, or a navy).
//   4. generateLand + Auto-fix end to end: the army that was a pile is spread at its own density, every handed state is new land
//      that was sea below, no harbour from below changes hands, (an independent judge over the written world) no province loses
//      its supply route, and a country with no convoys takes no land its supply could reach only by ship; the capitals are chosen
//      again after the second pass, under the land's own carry (4e) and under the 1936 economy, by the people written (4f).
//   5. fixDrownedDivisions reads "below" the same way: a mod that replaces history/units is spread at its own density.
//   6. the page says it; comments stripped, the density is computed in ONE place; and the navy guard's inputs are wired.
//
// Fixture-only: binds no port. Run: node test-a-country-keeps-the-land-its-army-needs.js
"use strict";
const fs = require("fs"), os = require("os"), path = require("path");

let checks = 0;
const fails = [];
const rec = (label, cond, detail) => {
  checks++;
  console.log((cond ? "  ok   " : "  FAIL ") + label + (detail == null ? "" : "   " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 300)));
  if (!cond) fails.push(label);
};

const SANDBOX = fs.mkdtempSync(path.join(os.tmpdir(), "nova-army-land-"));
process.env.APPDATA = path.join(SANDBOX, "appdata");
process.env.XDG_CONFIG_HOME = process.env.APPDATA;
process.env.NOVA_APP_DATA_DIR = process.env.APPDATA;
process.env.NOVA_HOME_DIR = path.join(SANDBOX, "home");
process.env.HOI4_MODS_ROOT = SANDBOX;
fs.mkdirSync(process.env.APPDATA, { recursive: true });
fs.mkdirSync(process.env.NOVA_HOME_DIR, { recursive: true });
const md = require("./map-data.js");

const mk = (p, c) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, c); };
function bmp24(width, height, fn) {
  const rowSize = (width * 3 + 3) & ~3, imageSize = rowSize * height;
  const buf = Buffer.alloc(54 + imageSize);
  buf.write("BM", 0, "ascii"); buf.writeUInt32LE(54 + imageSize, 2); buf.writeUInt32LE(54, 10); buf.writeUInt32LE(40, 14);
  buf.writeInt32LE(width, 18); buf.writeInt32LE(height, 22); buf.writeUInt16LE(1, 26); buf.writeUInt16LE(24, 28);
  buf.writeUInt32LE(0, 30); buf.writeUInt32LE(imageSize, 34);
  for (let y = 0; y < height; y++) { let off = 54 + (height - 1 - y) * rowSize; for (let x = 0; x < width; x++) { const [r, g, b] = fn(x, y); buf[off++] = b; buf[off++] = g; buf[off++] = r; } }
  return buf;
}
const adjOf = (edges) => {
  const adj = new Map();
  const add = (a, b) => { if (!adj.has(a)) adj.set(a, []); adj.get(a).push(b); };
  for (const [a, b] of edges) { add(a, b); add(b, a); }
  return adj;
};
const facts = (pairs) => new Map(pairs.map(([p, owner]) => [p, { owner }]));
const oob = (locs, extra = "") => ['division_template = { name = "Inf" regiments = { infantry = { x = 0 y = 0 } } }', extra, "units = {",
  ...locs.map((p, i) => `\tdivision = { name = "D${i + 1}" location = ${p} division_template = "Inf" }`), "}", ""].join("\r\n");
const fleet = (at) => `units = {\r\n\tfleet = { name = "F" naval_base = ${at} task_force = { name = "TF" location = ${at} ship = { name = "S" definition = destroyer equipment = { ship_hull_light_1 = { amount = 1 owner = CCC } } } } }\r\n}\r\n`;
// what one order of battle needs, from the rule's own words: its divisions over its density, the density its divisions over the
// provinces they stand on, rounded up
const densityOf = (locs) => (new Set(locs).size ? Math.max(1, Math.ceil(locs.length / new Set(locs).size)) : 1);
const needOfLocs = (count, belowLocs) => Math.ceil(count / densityOf(belowLocs));

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
console.log("=== 1. orderOfBattleDensity ===");
const HAS = { density: typeof md.orderOfBattleDensity === "function", keep2: typeof md.keepEveryCountryBelow === "function" && typeof md.armyLandNeed === "function",
  below: typeof md.historyFilesBelow === "function" };
rec("map-data.js exports orderOfBattleDensity, armyLandNeed and historyFilesBelow", HAS.density && HAS.keep2 && HAS.below);
if (HAS.density) {
  const locs = [5, 5, 5, 6, 7, 7];
  const d = md.orderOfBattleDensity(oob(locs, "# division = { location = 99 } — a comment is not a division"));
  rec("⭐⭐ divisions, places and density are counted off the text — a commented-out division is not one",
    d.divisions === locs.length && d.places === new Set(locs).size && d.density === densityOf(locs), d);
  rec("an order of battle with no division has density 1", md.orderOfBattleDensity("units = { }").density === 1 && md.orderOfBattleDensity("").density === 1);
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
console.log("\n=== 2. keepEveryCountryBelow's second pass, pure ===");
// THE CHAIN. TTT held provinces 1..6 below and holds the group on 1 (its own, by majority). Beyond its land: DDD's homeland group
// 7 (one step out), then raised sea 11..20 that DDD won by proximity (no row below), then DDD's capital 30 (protected). DDD holds
// 12 groups, so its floor is ceil(12/2).
const chain = () => {
  const groups = [{ id: 1, provinces: [1] }, { id: 7, provinces: [7] }, { id: 30, provinces: [30] }];
  for (let i = 0; i < 10; i++) groups.push({ id: 11 + i, provinces: [11 + i] });
  const ownerOf = new Map([[1, "TTT"], [7, "DDD"], [30, "DDD"]]);
  for (let i = 0; i < 10; i++) ownerOf.set(11 + i, "DDD");
  const pairs = [[1, "TTT"], [2, "TTT"], [3, "TTT"], [4, "TTT"], [5, "TTT"], [6, "TTT"], [7, "DDD"], [30, "DDD"]];
  const edges = [[1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 7], [7, 11], [20, 30]];
  for (let i = 0; i < 9; i++) edges.push([11 + i, 12 + i]);
  return { groups, ownerOf, f: facts(pairs), adj: adjOf(edges), protect: new Set([30]) };
};
const run = (W, extra) => md.keepEveryCountryBelow(Object.assign({ groups: W.groups, facts: W.f, adj: W.adj, ownerOf: W.ownerOf, protect: W.protect }, extra || {}));
const landOf = (W, t) => W.groups.filter((g) => W.ownerOf.get(g.id) === t).reduce((a, g) => a + g.provinces.length, 0);
const raisedInOrder = (n) => Array.from({ length: n }, (_, i) => 11 + i);
if (HAS.keep2) {
  {
    const W = chain(), NEED = 4;
    const r = run(W, { needOf: new Map([["TTT", NEED]]) });
    rec("THE FIXTURE: TTT holds one province and its army needs " + NEED, landOf(chain(), "TTT") === 1);
    rec("⭐⭐⭐ a country with less land than its army needs takes groups until it has exactly that much", landOf(W, "TTT") === NEED, { land: landOf(W, "TTT"), armies: r.armies });
    rec("⭐⭐ …the nearest raised land, in order", JSON.stringify(r.armies.map((a) => a.state)) === JSON.stringify(raisedInOrder(NEED - 1)), r.armies.map((a) => a.state));
    rec("⭐⭐⭐ THE HOMELAND: DDD's own land below (7, one step nearer) is never taken for an army — and it is counted",
      W.ownerOf.get(7) === "DDD" && r.heldByHome === 1, { owner7: W.ownerOf.get(7), heldByHome: r.heldByHome });
    rec("…and it is said as an army's top-up, not as a kept country", r.kept.length === 0 && r.armies.every((a) => a.tag === "TTT" && a.from === "DDD" && a.size === 1 && a.fromHome === 0), r);
    rec("…and nobody is left short", r.stillShort.length === 0, r.stillShort);
  }
  {
    const W = chain(), before = JSON.stringify([...W.ownerOf]);
    const r = run(W);
    rec("CONTROL: with no army's need nothing changes hands", r.armies.length === 0 && r.kept.length === 0 && JSON.stringify([...W.ownerOf]) === before && r.heldByHome === 0, r);
  }
  {
    const W = chain();
    const r = run(W, { needOf: new Map([["TTT", 99]]) });
    const held = W.groups.filter((g) => W.ownerOf.get(g.id) === "DDD").length;
    rec("⭐⭐ THE FLOOR: a donor of 12 groups keeps ceil(12/2) — and the shortfall is said, with what the army needs",
      held === Math.ceil(12 / 2) && r.heldByFloorForArmies > 0 && r.stillShort.length === 1 && r.stillShort[0].tag === "TTT" && r.stillShort[0].need === 99 && r.stillShort[0].has === landOf(W, "TTT"),
      { held, stillShort: r.stillShort, heldByFloorForArmies: r.heldByFloorForArmies });
  }
  {
    // DDD's own army needs 10 of its 12 provinces: it can spare two
    const W = chain();
    const r = run(W, { needOf: new Map([["TTT", 4], ["DDD", 10]]) });
    rec("⭐⭐⭐ a donor never goes below the land its own army needs", landOf(W, "DDD") === 10 && r.heldByNeed > 0 && r.stillShort.some((s) => s.tag === "TTT" && s.has === 3),
      { dddLand: landOf(W, "DDD"), heldByNeed: r.heldByNeed, stillShort: r.stillShort });
  }
  {
    // NOT THIS CLICK'S: a country the mod already owns a state of (alreadyOwning), or one holding a province of a state the mod already
    // loads (loadedProvinces), is the modder's — Generate land over a mod with states tops neither up from new land. (Review of
    // 7c258023: eligible() dropped from the second pass, all three keep tests passed.)
    const c = chain(), rc = run(c, { needOf: new Map([["TTT", 4]]) });
    rec("CONTROL: the same chain with nothing of the mod's own — TTT is topped up", rc.armies.length === 3 && landOf(c, "TTT") === 4, rc.armies);
    for (const [label, extra] of [["a country the mod already owns a state of", { alreadyOwning: new Set(["TTT"]) }],
      ["a country holding a province of a state the mod loads", { loadedProvinces: new Set([2]) }]]) {
      const W = chain(), before = JSON.stringify([...W.ownerOf]);
      const r = run(W, Object.assign({ needOf: new Map([["TTT", 4]]) }, extra));
      rec(`⭐⭐ ${label} is not topped up from new land, whatever its army needs`, r.armies.length === 0 && JSON.stringify([...W.ownerOf]) === before && !r.stillShort.some((s) => s.tag === "TTT"), r);
    }
  }
  {
    // THE RECEIVER'S REACH IS ASKED AGAIN AFTER EACH GAIN: TTT (needs 3) holds 1, takes 2 next to it, then is offered 3 — and once it
    // holds 3 its capital's piece moves and 2 is no longer reached. Asked of the reach TTT has NOW (2 included), 3 is refused; asked of
    // the reach it had before it took 2, it would be allowed. (Review of 7c258023: the cache clear after a gain was untested.)
    const groups = [1, 2, 3, 7, 8, 9, 10].map((id) => ({ id, provinces: [id] }));
    const ownerOf = new Map([[1, "TTT"], [2, "DDD"], [3, "DDD"], [7, "DDD"], [8, "DDD"], [9, "DDD"], [10, "DDD"]]);
    const reachOf = (tag, list) => (tag === "TTT" && list.some((g) => g.id === 3) ? new Set(list.filter((g) => g.id !== 2)) : new Set(list));
    const args = (o, reach) => ({ groups, facts: facts([[1, "TTT"], [7, "DDD"]]), adj: adjOf([[1, 2], [2, 3], [3, 7], [7, 8], [8, 9], [9, 10]]), ownerOf: o, protect: new Set([7]), needOf: new Map([["TTT", 3]]), reachOf: reach });
    const o0 = new Map(ownerOf), c = md.keepEveryCountryBelow(args(o0, (tag, list) => new Set(list)));
    rec("CONTROL: asked of a reach that loses nothing, TTT takes 2 then 3", JSON.stringify(c.armies.map((a) => a.state)) === JSON.stringify([2, 3]), c.armies);
    const o = new Map(ownerOf), r = md.keepEveryCountryBelow(args(o, reachOf));
    rec("⭐⭐ a hand-over that would cut off land the receiver GAINED earlier in the pass is refused: TTT keeps 2, and 3 stays DDD's (it takes the next instead)",
      o.get(2) === "TTT" && o.get(3) === "DDD" && r.heldByReach === 1 && !r.armies.some((a) => a.state === 3) && r.armies[0].state === 2, { armies: r.armies, heldByReach: r.heldByReach, stillShort: r.stillShort });
  }
  {
    // THE NAVY: DDD starts a fleet, and 11 and 12 are its only groups with a coast on the ocean. It gives 11; 12 is then its last.
    const ocean = new Set([11, 12]);
    const W = chain(), C = chain();
    const r = run(W, { needOf: new Map([["TTT", 4]]), navies: new Set(["DDD"]), oceanCoast: (g) => ocean.has(g.id) });
    const c = run(C, { needOf: new Map([["TTT", 4]]), navies: new Set(), oceanCoast: (g) => ocean.has(g.id) });
    rec("CONTROL: without a navy DDD hands over 11, 12, 13", JSON.stringify(c.armies.map((a) => a.state)) === JSON.stringify([11, 12, 13]) && c.heldByNavy === 0, c.armies.map((a) => a.state));
    rec("⭐⭐⭐ THE NAVY: a donor that starts a fleet keeps its last coast on the ocean — the receiver takes the next instead",
      W.ownerOf.get(12) === "DDD" && JSON.stringify(r.armies.map((a) => a.state)) === JSON.stringify([11, 13, 14]) && r.heldByNavy === 1, { armies: r.armies.map((a) => a.state), heldByNavy: r.heldByNavy });
  }
  {
    // THE SUPPLY REACH, judged as generateLand judges it: each country's land in pieces (ownLandPieces), its capital on capitalPieceFor's
    // piece, another piece reached only when it and the capital's both open onto the ocean. TTT holds 1 (opens); DDD holds the raised
    // chain 11-12-13-14-15 and its capital 30 (opens). 12 and 14 open onto the ocean, 11 and 13 do not, and nothing touches 1.
    const OPEN = new Set([1, 12, 14, 30]);
    const groups = [{ id: 1, provinces: [1] }, { id: 30, provinces: [30] }];
    for (const i of [11, 12, 13, 14, 15]) groups.push({ id: i, provinces: [i] });
    const W = () => ({ ownerOf: new Map(groups.map((g) => [g.id, g.id === 1 ? "TTT" : "DDD"])) });
    const f = facts([[1, "TTT"], [2, "TTT"], [3, "TTT"], [30, "DDD"]]);
    const adj = adjOf([[1, 2], [2, 3], [3, 11], [11, 12], [12, 13], [13, 14], [14, 15], [15, 30]]);
    const people = (g) => (g.id === 1 || g.id === 30 ? 100 : 1);
    const reachOf = (tag, list) => {
      const pieces = md.ownLandPieces({ groups: list, ownerOf: () => tag, links: (p) => adj.get(p) || [], opens: (p) => OPEN.has(p), peopleOf: people }).get(tag) || [];
      const cap = md.capitalPieceFor(pieces), out = new Set();
      for (const pc of pieces) if (pc === cap || (cap && cap.coast && pc.coast)) for (const g of pc.groups) out.add(g);
      return out;
    };
    const args = (w, extra) => Object.assign({ groups, facts: f, adj, ownerOf: w.ownerOf, protect: new Set([1, 30]), needOf: new Map([["TTT", 2]]) }, extra);
    const c = md.keepEveryCountryBelow(args(W()));
    rec("CONTROL: asked nothing of supply, TTT takes the nearest, 11", c.armies.length === 1 && c.armies[0].state === 11 && c.heldByReach === 0, c.armies);
    const w = W(), r = md.keepEveryCountryBelow(args(w, { reachOf }));
    rec("⭐⭐⭐ THE SUPPLY REACH: no hand-over costs supply — 11 (walled, its supply cannot reach it), 12 (it would cut 11 off from DDD's capital) and 13 (walled) are refused, and TTT takes 14",
      r.armies.length === 1 && r.armies[0].state === 14 && r.heldByReach === 3 && w.ownerOf.get(11) === "DDD" && w.ownerOf.get(12) === "DDD", { armies: r.armies, heldByReach: r.heldByReach });
    // …and a receiver whose capital's piece opens onto no ocean: a coast elsewhere would become its capital's piece, its homeland cut off
    const g2 = [{ id: 1, provinces: [1] }, { id: 2, provinces: [2] }, { id: 5, provinces: [5] }, { id: 6, provinces: [6] }, { id: 30, provinces: [30] }];
    const own = new Map([[1, "TTT"], [2, "TTT"], [5, "DDD"], [6, "DDD"], [30, "DDD"]]);
    const adj2 = adjOf([[1, 2], [2, 3], [3, 5], [5, 6], [6, 30]]);
    const OPEN2 = new Set([5, 6, 30]);
    const reach2 = (tag, list) => {
      const pieces = md.ownLandPieces({ groups: list, ownerOf: () => tag, links: (p) => adj2.get(p) || [], opens: (p) => OPEN2.has(p), peopleOf: people }).get(tag) || [];
      const cap = md.capitalPieceFor(pieces), out = new Set();
      for (const pc of pieces) if (pc === cap || (cap && cap.coast && pc.coast)) for (const g of pc.groups) out.add(g);
      return out;
    };
    const r2 = md.keepEveryCountryBelow({ groups: g2, facts: facts([[1, "TTT"], [2, "TTT"], [3, "TTT"], [30, "DDD"]]), adj: adj2, ownerOf: own, protect: new Set([1, 30]), needOf: new Map([["TTT", 3]]), reachOf: reach2 });
    rec("⭐⭐ …nor costs the RECEIVER its own land: a coast would become its capital's piece and cut its walled homeland off — refused, and said short",
      r2.armies.length === 0 && r2.heldByReach === 2 && r2.stillShort.length === 1 && r2.stillShort[0].tag === "TTT", r2);
  }
  {
    // PASS 1 IS UNCHANGED: NNN held only 40, next to DDD's homeland 41 — still kept from it, whatever DDD's army needs
    const groups = [{ id: 41, provinces: [41] }, { id: 42, provinces: [42] }];
    const ownerOf = new Map([[41, "DDD"], [42, "DDD"]]);
    const r = md.keepEveryCountryBelow({ groups, facts: facts([[40, "NNN"], [41, "DDD"], [42, "DDD"]]), adj: adjOf([[40, 41], [41, 42]]), ownerOf,
      protect: new Set([42]), needOf: new Map([["DDD", 2]]) });
    rec("⭐⭐ a country with NO land is still kept first, from the homeland if that is nearest, whatever the donor's army needs",
      r.kept.length === 1 && r.kept[0].tag === "NNN" && r.kept[0].state === 41 && r.kept[0].fromHome === 1 && r.armies.length === 0, r);
  }
  {
    // GROW AS ONE PIECE: TTT holds 1 (its own) and drowned 2 sits next to 11, then 12; 30 is just as near as 11 (one step from 1) but
    // TOUCHES 1, and 31 is as near as 12 and touches 30. DDD holds the four raised groups and its capital 32.
    const groups = [{ id: 1, provinces: [1] }, { id: 11, provinces: [11] }, { id: 12, provinces: [12] }, { id: 30, provinces: [30] }, { id: 31, provinces: [31] }, { id: 32, provinces: [32] }];
    const f = facts([[1, "TTT"], [2, "TTT"], [32, "DDD"]]);
    const grow = (edges) => {
      const ownerOf = new Map([[1, "TTT"], [11, "DDD"], [12, "DDD"], [30, "DDD"], [31, "DDD"], [32, "DDD"]]);
      return md.keepEveryCountryBelow({ groups, facts: f, adj: adjOf(edges), ownerOf, protect: new Set([32]), needOf: new Map([["TTT", 3]]) });
    };
    // the control: 30 hangs off drowned 2 instead of 1, so nothing touches TTT's land and the walk's own order decides
    const c = grow([[2, 11], [11, 12], [2, 30], [30, 31], [31, 32]]);
    rec("CONTROL: when nothing touches its land, TTT takes the walk's own order — 11 before 30 (same step, lower id) — then 12, next to the 11 it took",
      JSON.stringify(c.armies.map((a) => a.state)) === JSON.stringify([11, 12]), c.armies.map((a) => a.state));
    const r = grow([[2, 11], [11, 12], [1, 30], [30, 31], [31, 32]]);
    rec("⭐ the next group is one that TOUCHES land the country holds, before an earlier one that does not — and land it has just taken counts: 30, then 31",
      JSON.stringify(r.armies.map((a) => a.state)) === JSON.stringify([30, 31]), r.armies.map((a) => a.state));
  }
  {
    // ONCE: TTT (need 3) takes 11 and then the five-province 12, so it could spare 11 again; UUU (need 2) reaches 11 only through the
    // drowned 52 that no group holds. DDD holds five groups (its capital 60 protected), so its floor lets two go.
    // (12 is listed before 11 on purpose: both touch TTT's land at once, and the walk's order, not the list's, decides)
    const groups = [{ id: 1, provinces: [1] }, { id: 12, provinces: [12, 13, 14, 15, 16] }, { id: 11, provinces: [11] }, { id: 50, provinces: [50] },
      { id: 60, provinces: [60] }, { id: 61, provinces: [61] }, { id: 62, provinces: [62] }];
    const ownerOf = new Map([[1, "TTT"], [11, "DDD"], [12, "DDD"], [50, "UUU"], [60, "DDD"], [61, "DDD"], [62, "DDD"]]);
    const r = md.keepEveryCountryBelow({ groups, facts: facts([[1, "TTT"], [50, "UUU"], [60, "DDD"]]), adj: adjOf([[1, 11], [1, 12], [11, 52], [52, 50]]), ownerOf,
      protect: new Set([60]), needOf: new Map([["TTT", 3], ["UUU", 2]]) });
    rec("THE FIXTURE: TTT ends with land to spare beyond its need", landOf({ groups, ownerOf }, "TTT") - 1 >= 3, landOf({ groups, ownerOf }, "TTT"));
    rec("⭐⭐ a group changes hands once: 11, which TTT took, is not handed on to UUU — UUU is said to be short instead",
      JSON.stringify(r.armies.map((a) => [a.tag, a.state])) === JSON.stringify([["TTT", 11], ["TTT", 12]]) && ownerOf.get(11) === "TTT"
        && r.stillShort.length === 1 && r.stillShort[0].tag === "UUU" && r.stillShort[0].has === 1, { armies: r.armies, stillShort: r.stillShort });
  }
  {
    // FOUR AT ONCE, listed backwards: 11-14 all touch TTT's land, one step out; DDD's nine groups let four go
    const groups = [14, 13, 12, 11, 1, 60, 61, 62, 63, 64].map((id) => ({ id, provinces: [id] }));
    const ownerOf = new Map(groups.map((g) => [g.id, g.id === 1 ? "TTT" : "DDD"]));
    const r = md.keepEveryCountryBelow({ groups, facts: facts([[1, "TTT"], [60, "DDD"]]), adj: adjOf([[1, 11], [1, 12], [1, 13], [1, 14]]), ownerOf,
      protect: new Set([60]), needOf: new Map([["TTT", 3]]) });
    rec("⭐ of four groups that all touch its land, TTT takes the first two in the walk, 11 then 12 — however the groups are listed",
      JSON.stringify(r.armies.map((a) => a.state)) === JSON.stringify([11, 12]), r.armies.map((a) => a.state));
  }
  {
    const W = chain();
    const r = run(W, { needOf: new Map([["TTT", 4]]), sizeOf: (g) => (g.id === 11 ? 3 : g.provinces.length) });
    rec("⭐ land is counted by sizeOf (the land as dealt), and with no provincesOf said by it too: one group worth 3 meets a need of 4 with TTT's own 1",
      r.armies.length === 1 && r.armies[0].state === 11 && r.armies[0].size === 3, r.armies);
  }
  // ⛔ #a-raised-province-is-cut-to-land-size — THE LAND AS DEALT (sizeOf: Generate land passes a group's parents, the provinces the
  // owner passes owned) AGAINST THE LAND AS WRITTEN (provincesOf: the parents with the pieces joined to them). Counted in pieces, the
  // top-up handed Japan 4 states on the owner's flow against TEST 34's 11, and 6/4/3 of its factory levels against 12/7/7 (merge
  // review MR-2). Here a piece is an id of 100 or more.
  const asDealt = (g) => g.provinces.filter((p) => p < 100).length, asWritten = (g) => g.provinces.length;
  {
    const W = chain();
    W.groups.find((g) => g.id === 11).provinces.push(101, 102, 103, 104);
    const r = run(W, { needOf: new Map([["TTT", 4]]), sizeOf: asDealt, provincesOf: asWritten });
    rec("⭐⭐ the land is dealt as raised — a parent and its pieces are the one province the owner passes owned: TTT takes 11, 12 and 13 for a need of 4, and each is said with its provinces as written (11 and its four pieces: 5)",
      JSON.stringify(r.armies.map((a) => [a.state, a.size])) === JSON.stringify([[11, 5], [12, 1], [13, 1]]) && r.stillShort.length === 0, r.armies);
  }
  {
    // the floor leaves TTT 7 provinces as dealt against a need of 99: said short only when what it holds AS WRITTEN is short too
    const W1 = chain();
    W1.groups.find((g) => g.id === 11).provinces.push(...Array.from({ length: 120 }, (_, i) => 101 + i));
    const r1 = run(W1, { needOf: new Map([["TTT", 99]]), sizeOf: asDealt, provincesOf: asWritten });
    const W2 = chain();
    W2.groups.find((g) => g.id === 11).provinces.push(101, 102, 103);
    const r2 = run(W2, { needOf: new Map([["TTT", 99]]), sizeOf: asDealt, provincesOf: asWritten });
    const written2 = W2.groups.filter((g) => W2.ownerOf.get(g.id) === "TTT").reduce((a, g) => a + g.provinces.length, 0);
    rec("(control: the floor stops both at six hand-overs, 7 provinces as dealt)", r1.armies.length === 6 && r2.armies.length === 6, [r1.armies.length, r2.armies.length]);
    rec("⭐⭐ short as dealt but holding its need as written (a parent cut into 121): not said short", r1.stillShort.length === 0, r1.stillShort);
    rec("⭐⭐ short both ways: said short with what it holds AS WRITTEN (its pieces counted: 10), not as dealt (7)",
      r2.stillShort.length === 1 && r2.stillShort[0].tag === "TTT" && r2.stillShort[0].need === 99 && r2.stillShort[0].has === written2 && written2 === 10, { short: r2.stillShort, written2 });
  }
  {
    // …and the keep pass's "smaller group" is the land as dealt too: landless NNN stands one step from X (one parent and two pieces)
    // and Y (two parents) — X is the smaller as dealt, Y as written
    const groups = [{ id: 11, provinces: [11, 101, 102] }, { id: 21, provinces: [21, 22] }, { id: 30, provinces: [30] }];
    const ownerOf = new Map([[11, "DDD"], [21, "DDD"], [30, "DDD"]]);
    const r = md.keepEveryCountryBelow({ groups, facts: facts([[50, "NNN"], [30, "DDD"]]), adj: adjOf([[50, 11], [50, 21]]), ownerOf, protect: new Set([30]),
      sizeOf: asDealt, provincesOf: asWritten });
    rec("⭐ the first pass's tie-break counts the land as dealt: NNN takes X (one parent with its pieces), not Y (two parents)",
      r.kept.length === 1 && r.kept[0].tag === "NNN" && r.kept[0].state === 11 && ownerOf.get(11) === "NNN" && ownerOf.get(21) === "DDD", r.kept);
  }
  {
    const mkW = (rev) => {
      const W = chain();
      const g = rev ? W.groups.slice().reverse() : W.groups;
      return JSON.stringify(md.keepEveryCountryBelow({ groups: g, facts: W.f, adj: W.adj, ownerOf: W.ownerOf, protect: W.protect, needOf: new Map([["TTT", 4]]) }));
    };
    rec("⭐ the answer does not depend on the order the groups come in", mkW(false) === mkW(true), [mkW(false), mkW(true)]);
  }
  {
    const W = chain();
    const r = md.keepEveryCountryBelow({ groups: W.groups, facts: W.f, adj: null, ownerOf: W.ownerOf, protect: W.protect, needOf: new Map([["TTT", 4]]) });
    rec("⭐ with no province graph nothing is invented: the short country is said to be short", r.armies.length === 0 && r.stillShort.length === 1 && r.stillShort[0].has === 1, r);
  }
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
console.log("\n=== 3. armyLandNeed: every started file, the divisions that load, the density below ===");
if (HAS.keep2) {
  const base = path.join(SANDBOX, "need-base");
  const A36 = [1, 1, 2, 2, 3, 3, 4, 4], A39 = [1, 2, 3, 4, 5, 6, 7, 8, 9, 9], ADLC = [1, 1, 1, 2, 2, 2];
  const P = [1, 1, 2, 2, 3, 3, 4, 4], DB = [1, 1, 2, 2, 3, 3], RP = [1, 1, 1, 2, 2, 2, 3, 3, 3];
  // convoys: AAA's only in a dated block (Millennium Dawn's shape), BBB's not asked about, PIL's zero, DBL's only in a comment, CCC
  // none but a fleet
  // ⛔ the most-needing file (1939) named BETWEEN the other two, so a reader that keeps the first file's need or the last one's both go
  // red (review of b42f689a, Q4: the last-wins reading passed every check, and changes 21 of the base game's 92 countries' needs)
  const AAA_HISTORY = `﻿capital = 1\r\noob = "AAA_1936"\r\n1939.1.1 = { oob = "AAA_1939" set_convoys = 5 }\r\nif = { limit = { has_dlc = "X" } set_oob = AAA_dlc }\r\n`;
  mk(path.join(base, "history", "countries", "AAA - A.txt"), AAA_HISTORY);
  mk(path.join(base, "history", "countries", "BBB - B.txt"), `capital = 2\r\noob = "BBB_1936"\r\nset_convoys = 3\r\n`);
  mk(path.join(base, "history", "countries", "CCC - C.txt"), `capital = 3\r\noob = "CCC_1936"\r\nset_naval_oob = "CCC_naval"\r\n`);
  mk(path.join(base, "history", "countries", "PIL - P.txt"), `capital = 4\r\noob = "PIL_1936"\r\nset_convoys = 0\r\n`);
  mk(path.join(base, "history", "countries", "DBL - D.txt"), `capital = 5\r\noob = "DBL_1936"\r\n# set_convoys = 50\r\n`);
  mk(path.join(base, "history", "countries", "RPX - R.txt"), `capital = 6\r\noob = "RPX_1936"\r\n`);
  mk(path.join(base, "history", "units", "AAA_1936.txt"), oob(A36));
  mk(path.join(base, "history", "units", "AAA_1939.txt"), oob(A39));
  mk(path.join(base, "history", "units", "AAA_dlc.txt"), oob(ADLC));
  mk(path.join(base, "history", "units", "BBB_1936.txt"), oob([77, 77, 77, 77]));
  mk(path.join(base, "history", "units", "CCC_1936.txt"), oob([3]));
  mk(path.join(base, "history", "units", "CCC_naval.txt"), fleet(33));
  mk(path.join(base, "history", "units", "PIL_1936.txt"), oob(P));
  mk(path.join(base, "history", "units", "DBL_1936.txt"), oob(DB));
  mk(path.join(base, "history", "units", "RPX_1936.txt"), oob(RP));
  // the mod: Nova's pile of PIL's army (every division on one province) and the modder's doubled DBL army (twice as many on the same places)
  const mod = path.join(SANDBOX, "need-mod");
  mk(path.join(mod, "descriptor.mod"), 'name="m"\n');
  const pile = P.map(() => 9), doubled = DB.concat(DB);
  mk(path.join(mod, "history", "units", "PIL_1936.txt"), oob(pile));
  mk(path.join(mod, "history", "units", "DBL_1936.txt"), oob(doubled));
  // a second mod replaces history/units and ships its own RPX file: one division a province
  const rmod = path.join(SANDBOX, "need-replace");
  const own = [11, 12, 13, 14, 15, 16, 17, 18, 19];
  mk(path.join(rmod, "descriptor.mod"), 'name="r"\nreplace_path="history/units"\n');
  mk(path.join(rmod, "history", "units", "RPX_1936.txt"), oob(own));

  const r = md.armyLandNeed({ modRoot: mod, gameRoot: base, dependencyRoots: [], tags: ["AAA", "CCC", "PIL", "DBL"] });
  const wantA = Math.max(needOfLocs(A36.length, A36), needOfLocs(A39.length, A39), needOfLocs(ADLC.length, ADLC));
  rec("THE FIXTURE: AAA's three files need different amounts, and the 1939 one the most", wantA === needOfLocs(A39.length, A39) && wantA > needOfLocs(A36.length, A36), { wantA });
  const named = [...AAA_HISTORY.matchAll(/\b(?:set_)?oob\s*=\s*"?([A-Za-z0-9_]+)"?/g)].map((m) => m[1]);
  rec("THE FIXTURE: the history names the most-needing file neither first nor last, and the first and last need less",
    named.length === 3 && named[1] === "AAA_1939" && needOfLocs(A36.length, A36) < wantA && needOfLocs(ADLC.length, ADLC) < wantA, named);
  rec("⭐⭐⭐ a country needs what its most-needing started file needs — any date, any DLC branch", r.need.get("AAA") === wantA, { got: r.need.get("AAA"), wantA });
  const wantP = needOfLocs(pile.length, P);
  rec("THE FIXTURE: read off Nova's pile alone, PIL would need 1", needOfLocs(pile.length, pile) === 1 && wantP > 1, { wantP });
  rec("⭐⭐⭐ Nova's own pile in the mod changes nothing: the divisions are the same, the density is the copy below's", r.need.get("PIL") === wantP, { got: r.need.get("PIL"), wantP });
  const wantD = needOfLocs(doubled.length, DB);
  rec("⭐⭐⭐ a modder who doubled an army doubles its need: the divisions are counted in the copy that loads", r.need.get("DBL") === wantD && wantD === 2 * needOfLocs(DB.length, DB), { got: r.need.get("DBL"), wantD });
  rec("…and a country not asked about is not read", !r.need.has("BBB") && !r.need.has("RPX"), [...r.need]);
  rec("⭐⭐ the navies are the countries whose started orders of battle hold a fleet", r.navies.has("CCC") && !r.navies.has("AAA") && r.navies.size === 1, [...r.navies]);
  rec("⭐⭐⭐ the countries that can SHIP: convoys above zero anywhere in the file (a dated block too), or a navy — not zero, not a comment, not a country not asked about",
    !!r.sails && r.sails.has("AAA") && r.sails.has("CCC") && r.sails.size === 2, r.sails && [...r.sails]);
  rec("…and the files counted are the started ones with divisions", r.files === 6, r.files);
  const rr = md.armyLandNeed({ modRoot: rmod, gameRoot: base, dependencyRoots: [], tags: ["RPX"] });
  const wantR = needOfLocs(own.length, own);
  rec("THE FIXTURE: the base game's hidden RPX copy would say " + needOfLocs(RP.length, RP) + ", the mod's own " + wantR, wantR !== needOfLocs(RP.length, RP));
  rec("⭐⭐⭐ a mod that replaces history/units is read from its own copy alone — divisions AND density", rr.need.get("RPX") === wantR, { got: rr.need.get("RPX"), wantR });
  const below = md.historyFilesBelow(rmod, base, [], "history/units"), belowPlain = md.historyFilesBelow(mod, base, [], "history/units");
  rec("⭐⭐ historyFilesBelow is empty under the mod's own replace_path, and the base game's files otherwise",
    below.size === 0 && belowPlain.has("pil_1936.txt") && !samePathIn(belowPlain.get("pil_1936.txt").root, mod), { replaced: below.size, plain: belowPlain.size });
  rec("⭐ `at`: each country's started divisions by the province they stand on, every started file that loads added together",
    !!r.at && [...r.at.get("AAA")].every(([p, n]) => n === [A36, A39, ADLC].reduce((a, L) => a + L.filter((x) => x === p).length, 0)) && r.at.get("AAA").size === new Set([...A36, ...A39, ...ADLC]).size
      && r.at.get("PIL").get(9) === pile.length, r.at && [...r.at].map(([t, m]) => [t, [...m]]));

  // ⛔ CONVOYS GIVEN WHEN THE GAME STARTS — Millennium Dawn's shape: almost no set_convoys, and an on_startup every_country that calls a
  // scripted effect giving each country 100 or more. Read without it, 142 of the 210 countries an MD add-on's armies need land for
  // could not ship (review of 7c258023). A grant to every country makes `sails` null; one to a tag's scope, that tag's; one behind a
  // limit, an `if`, or a comment, or a scripted effect nothing calls, gives nothing. PIL and DBL start with none of their own.
  const onStartup = (body) => `on_actions = {\r\n\ton_startup = {\r\n\t\teffect = {\r\n${body}\r\n\t\t}\r\n\t}\r\n}\r\n`;
  const GIVE = "give_starting_convoys = {\r\n\tset_temp_variable = { n = 100 }\r\n\tadd_equipment_to_stockpile = {\r\n\t\ttype = convoy\r\n\t\tamount = n\r\n\t}\r\n}\r\n";
  const startupMod = (name, body, { effect = GIVE, countryLine = null } = {}) => {
    const m = path.join(SANDBOX, "need-startup-" + name);
    mk(path.join(m, "descriptor.mod"), `name="${name}"\n`);
    mk(path.join(m, "common", "on_actions", "zz_startup.txt"), onStartup(body));
    mk(path.join(m, "common", "scripted_effects", "zz_startup.txt"), effect);
    if (countryLine) mk(path.join(m, "history", "countries", "PIL - P.txt"), `capital = 4\r\noob = "PIL_1936"\r\n${countryLine}\r\n`);
    return md.armyLandNeed({ modRoot: m, gameRoot: base, dependencyRoots: [], tags: ["AAA", "CCC", "PIL", "DBL"] });
  };
  const shipping = (a) => (a.sails === null ? "every" : [...a.sails].sort().join(" "));
  const plain = shipping(r);
  rec("CONTROL: without a startup grant only AAA and CCC ship (a set_convoys, a navy)", plain === "AAA CCC", plain);
  const every = startupMod("every", "\t\t\tevery_country = {\r\n\t\t\t\tgive_starting_convoys = yes\r\n\t\t\t}");
  rec("⭐⭐⭐ convoys given to every country at startup, by a scripted effect an every_country calls: every country ships (sails null)", every.sails === null, shipping(every));
  rec("…and the rest of the read is the same", every.need.get("PIL") === r.need.get("PIL") && every.navies.has("CCC") && every.files === r.files, { need: [...every.need], files: every.files });
  const one = startupMod("tag", "\t\t\tPIL = { give_starting_convoys = yes }");
  rec("⭐⭐ …given in a country's own scope: that country ships", shipping(one) === "AAA CCC PIL", shipping(one));
  for (const [label, body, effect] of [
    ["behind every_country's limit", "\t\t\tevery_country = {\r\n\t\t\t\tlimit = { is_ai = no }\r\n\t\t\t\tgive_starting_convoys = yes\r\n\t\t\t}", GIVE],
    ["inside an if", "\t\t\tevery_country = {\r\n\t\t\t\tif = { limit = { has_navy_size = { size > 1 } } give_starting_convoys = yes }\r\n\t\t\t}", GIVE],
    ["commented out", "\t\t\tevery_country = {\r\n\t\t\t\t# give_starting_convoys = yes\r\n\t\t\t}", GIVE],
    ["in a scripted effect nothing calls", "\t\t\tevery_country = { set_country_flag = started }", GIVE],
    ["of another equipment", "\t\t\tevery_country = {\r\n\t\t\t\tgive_starting_convoys = yes\r\n\t\t\t}", GIVE.replace("type = convoy", "type = train_equipment")]]) {
    const a = startupMod(label.replace(/\W+/g, "-"), body, { effect });
    rec(`⭐ a grant ${label} ships nobody new`, shipping(a) === plain, shipping(a));
  }
  const hist = startupMod("history", "", { countryLine: "add_equipment_to_stockpile = { type = convoy_1 amount = 20 }" });
  rec("⭐⭐ …and convoys given in a country's own history file ship it, as set_convoys does", shipping(hist) === "AAA CCC PIL", shipping(hist));
}
function samePathIn(a, b) { return path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase(); }

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
console.log("\n=== 4. generateLand + Auto-fix end to end ===");
// The keep test's lattice: 24 x 16 one-pixel provinces; below, AAA x<5, BBB 5..9, CCC 10..11, open ocean from x 12, each country's
// state per four rows, its first the capital (VP 20). A naval base below on every coastal province (x 11). The mod is Delete map's
// world: every province sea, replace_path="history/states". Raised at 45%.
{
  const W = 24, H = 16, N = W * H;
  const idAt = (x, y) => y * W + x + 1, xOf = (id) => (id - 1) % W, yOf = (id) => Math.floor((id - 1) / W);
  const colourOf = (id) => [id & 255, (id >> 8) & 255, 61];
  const tagBelow = (id) => { const x = xOf(id); return x < 5 ? "AAA" : x < 10 ? "BBB" : x < 12 ? "CCC" : ""; };
  const regionOf = (id) => Math.floor(xOf(id) / 6) + 4 * Math.floor(yOf(id) / 8) + 1;
  const defRows = (blank) => { const rows = ["0;0;0;0;land;false;unknown;0"]; for (let id = 1; id <= N; id++) { const [r, g, b] = colourOf(id); rows.push(!blank && tagBelow(id) ? `${id};${r};${g};${b};land;false;plains;1` : `${id};${r};${g};${b};sea;false;ocean;0`); } return rows.join("\r\n") + "\r\n"; };
  const base = fs.mkdtempSync(path.join(SANDBOX, "lbase-"));
  mk(path.join(base, "map", "definition.csv"), defRows(false));
  mk(path.join(base, "map", "provinces.bmp"), bmp24(W, H, (x, y) => colourOf(idAt(x, y))));
  const byRegion = new Map();
  for (let id = 1; id <= N; id++) { const r = regionOf(id); if (!byRegion.has(r)) byRegion.set(r, []); byRegion.get(r).push(id); }
  for (const [r, p] of byRegion) mk(path.join(base, "map", "strategicregions", `r${r}.txt`), `strategic_region={\n\tid=${r}\n\tname="REGION_${r}"\n\tprovinces={ ${p.join(" ")} }\n\tweather={}\n}\n`);
  mk(path.join(base, "common", "state_category", "00_default.txt"), "state_categories = {\n\ttown = { local_building_slots = 4 }\n}\n");
  const byKey = new Map();
  for (let id = 1; id <= N; id++) { const t = tagBelow(id); if (!t) continue; const k = `${t}|${Math.floor(yOf(id) / 4)}`; if (!byKey.has(k)) byKey.set(k, []); byKey.get(k).push(id); }
  let sid = 1; const capOf = {}, landBelow = {}, portsBelow = new Set();
  for (const [k, p] of [...byKey].sort()) {
    const t = k.split("|")[0];
    if (!capOf[t]) capOf[t] = sid;
    landBelow[t] = (landBelow[t] || []).concat(p);
    const vp = capOf[t] === sid ? `\t\tvictory_points = { ${p[0]} 20 }\n` : "";
    const ports = p.filter((id) => xOf(id) === 11);
    for (const q of ports) portsBelow.add(q);
    const bl = ports.length ? `\t\tbuildings = {\n${ports.map((q) => `\t\t\t${q} = { naval_base = 2 }\n`).join("")}\t\t}\n` : "";
    mk(path.join(base, "history", "states", `${sid}-STATE_${sid}.txt`), `state = {\n\tid = ${sid}\n\tname = "STATE_${sid}"\n\tmanpower = ${1000 * p.length}\n\tstate_category = town\n\tprovinces = { ${p.join(" ")} }\n\thistory = {\n\t\towner = ${t}\n\t\tadd_core_of = ${t}\n${vp}${bl}\t}\n}\n`);
    sid++;
  }
  const countryFile = (t, convoys) => `﻿capital = ${capOf[t]} # home\r\noob = "${t}_1936"\r\n${convoys ? "set_convoys = 10" : "# set_convoys = 10"}\r\n`;
  for (const t of Object.keys(capOf)) mk(path.join(base, "history", "countries", `${t} - Land of ${t}.txt`), countryFile(t, true));
  const makeMod = () => { const mod = fs.mkdtempSync(path.join(SANDBOX, "lmod-")); mk(path.join(mod, "descriptor.mod"), 'name="Piles"\nreplace_path="history/states"\n'); mk(path.join(mod, "map", "definition.csv"), defRows(true)); mk(path.join(mod, "map", "provinces.bmp"), bmp24(W, H, (x, y) => colourOf(idAt(x, y)))); return mod; };
  const GEN = (mod, extra) => Object.assign({ modRoot: mod, gameRoot: base, dependencyRoots: [], count: Math.round(N * 0.45), seed: 3, provincesPerState: 4 }, extra || {});
  const statesOn = (mod) => { const d = path.join(mod, "history", "states"); return (fs.existsSync(d) ? fs.readdirSync(d) : []).map((f) => { const t = fs.readFileSync(path.join(d, f), "utf8"); return { id: +(/\bid\s*=\s*(\d+)/.exec(t) || [])[1], owner: ((/owner\s*=\s*([A-Za-z0-9_]+)/.exec(t) || [])[1]) || "", provinces: ((((/provinces\s*=\s*\{([^}]*)\}/.exec(t) || [])[1]) || "").match(/\d+/g) || []).map(Number), ports: [...t.matchAll(/(\d+)\s*=\s*\{\s*naval_base\s*=\s*\d+/g)].map((m) => +m[1]) }; }); };
  const landOf2 = (mod, tag) => statesOn(mod).filter((s) => s.owner === tag).reduce((a, s) => a + s.provinces.length, 0);
  // the country to arm: the one a run without the second pass leaves furthest short of its land below (derived, not typed)
  const probe = makeMod();
  md.generateLand(GEN(probe, { landForArmies: false }));
  const T = Object.keys(landBelow).sort((a, b) => (landOf2(probe, a) / landBelow[a].length) - (landOf2(probe, b) / landBelow[b].length) || (a < b ? -1 : 1))[0];
  const LOCS = landBelow[T].slice();                                  // one division on each province it held below: density 1
  mk(path.join(base, "history", "units", T + "_1936.txt"), oob(LOCS));
  const NEED = HAS.keep2 ? md.armyLandNeed({ modRoot: null, gameRoot: base, dependencyRoots: [], tags: [T] }).need.get(T) : LOCS.length;
  const ctl = makeMod(), des = makeMod();
  const r0 = md.generateLand(GEN(ctl, { landForArmies: false })), r1 = md.generateLand(GEN(des));
  const l0 = landOf2(ctl, T), l1 = landOf2(des, T);
  rec("THE FIXTURE: " + T + "'s army needs every province it held below, and a run without the second pass gives it less", NEED === LOCS.length && l0 > 0 && l0 < NEED && r0.changed === true, { T, NEED, l0 });
  const al = (r1.countries || {}).armyLand || {}, given = al.given || [], short = al.stillShort || [];
  rec("⭐⭐⭐ with it, " + T + " holds what its army needs — or the run says exactly how short it still is",
    r1.changed === true && (l1 >= NEED || short.some((s) => s.tag === T && s.has === l1 && s.need === NEED)), { l1, NEED, short, error: al.error });
  const onDisk = new Map(statesOn(des).map((s) => [s.id, s]));
  rec("⭐⭐ …and the report names each state handed over under the id it was written, owned by " + T + " on disk",
    given.length > 0 && given.every((g) => g.tag === T && onDisk.has(g.state) && onDisk.get(g.state).owner === T), given);
  rec("⭐⭐⭐ every handed state is land that was SEA below — none holds a province its donor held below",
    given.length > 0 && given.every((g) => onDisk.get(g.state).provinces.every((p) => tagBelow(p) !== g.from)), given.map((g) => [g.state, g.from, (onDisk.get(g.state) || {}).provinces]));
  const portOwner = (mod) => { const m = new Map(); for (const s of statesOn(mod)) for (const p of s.ports) if (portsBelow.has(p)) m.set(p, s.owner); return m; };
  const p0 = portOwner(ctl), p1 = portOwner(des);
  rec("THE FIXTURE: harbours from below stand in both worlds", p0.size > 0 && p1.size === p0.size, { ctl: [...p0], des: [...p1] });
  rec("⭐⭐ no harbour from below changes hands", [...p0].every(([p, o]) => p1.get(p) === o), { ctl: [...p0], des: [...p1] });
  rec("CONTROL: landForArmies:false reads no army and hands nothing over", !((r0.countries || {}).armyLand), (r0.countries || {}).armyLand);
  md.autoFixMap({ modRoot: ctl, gameRoot: base, dependencyRoots: [] });
  md.autoFixMap({ modRoot: des, gameRoot: base, dependencyRoots: [] });
  const stackOf = (mod) => { const f = path.join(mod, "history", "units", T + "_1936.txt"); const txt = fs.readFileSync(fs.existsSync(f) ? f : path.join(base, "history", "units", T + "_1936.txt"), "utf8"); const c = new Map(); for (const m of txt.matchAll(/location\s*=\s*(\d+)/g)) c.set(+m[1], (c.get(+m[1]) || 0) + 1); return Math.max(...c.values()); };
  const s0 = stackOf(ctl), s1 = stackOf(des);
  const want = short.some((x) => x.tag === T) ? Math.ceil(LOCS.length / l1) : densityOf(LOCS);   // its own density, unless the run said it is short
  console.log("    measured:", JSON.stringify({ T, NEED, l0, l1, s0, s1, want, given: given.length, short, heldByHome: al.heldByHome, heldByNavy: al.heldByNavy, heldByReach: al.heldByReach }));
  rec("CONTROL: without the second pass, Auto-fix piles " + T + "'s army (more than one division a province)", s0 > 1, { s0, l0 });
  rec("⭐⭐⭐ with it, Auto-fix spreads " + T + "'s army at its own density below", s1 <= want, { s1, want, l1 });
  globalThis.__armyLandResult = r1;

  // 4b. NO LAND LOSES ITS SUPPLY ROUTE. The same base raised at 35%, seed 1, where the second pass has land to refuse for reach. An
  // independent judge over the WRITTEN world: each country's land in pieces over the province graph the game loads, the capital
  // line's piece reached, another piece only when it and the capital's both open onto the ocean (opensOntoOcean, inlandSeaPlan's
  // ocean). Every province its owner's supply reached in the world built without the second pass is still reached with it.
  if (HAS.keep2) {
    const reached = (mod, noShips) => {
      const ctx = { modRoot: mod, gameRoot: base, dependencyRoots: [] };
      const model = md.buildMapModel(Object.assign({ cacheStableLayers: false }, ctx));
      const graph = md.provinceNeighbourGraph(Object.assign({ model }, ctx));
      const type = new Map(model.provinces.map((p) => [+p.id, p.type]));
      const oceanBody = md.inlandSeaPlan({ model, adj: graph }).oceanBody;
      const opens = (p) => !noShips && md.opensOntoOcean(+p, { adj: graph, isSea: (q) => type.get(+q) === "sea", oceanBody });
      const gs = model.states.filter((s) => s.owner && (s.provinces || []).length).map((s) => ({ id: s.id, provinces: s.provinces.map(Number), owner: s.owner, manpower: s.manpower || 0 }));
      const pieces = md.ownLandPieces({ groups: gs, ownerOf: (g) => g.owner, links: (p) => [...(graph.get(p) || [])].filter((q) => type.get(+q) === "land"), opens, peopleOf: (g) => g.manpower });
      const out = new Map();
      for (const [t, list] of pieces) {
        const cap = list.find((pc) => pc.groups.some((g) => g.id === (model.capitals || {})[t])) || null;
        for (const pc of list) for (const g of pc.groups) for (const p of g.provinces) out.set(p, { tag: t, ok: pc === cap || (!!cap && cap.coast && pc.coast) });
      }
      return out;
    };
    const GEN35 = (mod, extra) => Object.assign(GEN(mod, extra), { count: Math.round(N * 0.35), seed: 1 });
    const c35 = makeMod(), d35 = makeMod();
    md.generateLand(GEN35(c35, { landForArmies: false }));
    const rd = md.generateLand(GEN35(d35));
    const A = reached(c35), B = reached(d35), ald = (rd.countries || {}).armyLand || {};
    const okA = [...A.values()].filter((x) => x.ok).length, byLandOnly = [...reached(c35, true).values()].filter((x) => x.ok).length;
    rec("THE FIXTURE: here the second pass hands land over AND refuses some for its supply reach", (ald.given || []).length > 0 && ald.heldByReach > 0, { given: (ald.given || []).length, heldByReach: ald.heldByReach });
    rec("CONTROL: the judge tells reached from unreached land here — with no ships it reaches less", okA > 0 && byLandOnly < okA, { reached: okA, byLandOnly, of: A.size });
    const lost = [...A].filter(([p, x]) => x.ok && B.has(p) && !B.get(p).ok).map(([p, x]) => `${p} ${x.tag}>${B.get(p).tag}`);
    rec("⭐⭐⭐ no province its owner's supply reached loses that route — the receiver's and the donor's alike", lost.length === 0, lost.slice(0, 20));

    // 4c. SUPPLY CROSSES THE SEA ONLY ON CONVOYS. The same world, but the mod ships its own copy of T's country file, with no convoys
    // (and T starts no fleet): no state handed to T may be one its supply could reach only by ship. Czechoslovakia, Switzerland and
    // Yunnan start with none; a build that handed them such land stood 39 of their divisions where no supply could reach.
    const shipless = makeMod();
    mk(path.join(shipless, "history", "countries", `${T} - Land of ${T}.txt`), countryFile(T, false));
    const rn = md.generateLand(GEN35(shipless)), aln = (rn.countries || {}).armyLand || {};
    const byShipOnly = (mod, given) => {
      const land = reached(mod, true), sea = reached(mod), on = new Map(statesOn(mod).map((s) => [s.id, s.provinces]));
      return given.filter((g) => (on.get(g.state) || []).some((p) => !(land.get(p) || {}).ok && (sea.get(p) || {}).ok)).map((g) => g.state);
    };
    const withShips = byShipOnly(d35, ald.given || []), without = byShipOnly(shipless, aln.given || []);
    rec("THE FIXTURE: with convoys, " + T + " takes land its supply reaches only by ship", withShips.length > 0, { withShips });
    rec("⭐⭐⭐ with none (its OWN copy of the file says so), it takes no such land — and is said to be short of what its army needs",
      without.length === 0 && aln.heldByReach > 0 && (aln.stillShort || []).some((s) => s.tag === T), { without, heldByReach: aln.heldByReach, stillShort: aln.stillShort });
    // 4d. …AND CONVOYS GIVEN WHEN THE GAME STARTS ARE CONVOYS (Millennium Dawn's shape): the shipless mod, plus an on_startup every_country
    // that calls a scripted effect putting convoys in each country's stockpile. T ships again, and takes what the world with set_convoys
    // gave it — the same states, from the same countries.
    const given = makeMod();
    mk(path.join(given, "history", "countries", `${T} - Land of ${T}.txt`), countryFile(T, false));
    mk(path.join(given, "common", "on_actions", "zz_startup.txt"), "on_actions = {\r\n\ton_startup = {\r\n\t\teffect = {\r\n\t\t\tevery_country = { give_starting_convoys = yes }\r\n\t\t}\r\n\t}\r\n}\r\n");
    mk(path.join(given, "common", "scripted_effects", "zz_startup.txt"), "give_starting_convoys = {\r\n\tadd_equipment_to_stockpile = { type = convoy amount = 100 }\r\n}\r\n");
    const rg = md.generateLand(GEN35(given)), alg = (rg.countries || {}).armyLand || {};
    const handed = (list) => JSON.stringify((list || []).map((g) => [g.tag, g.from, g.size]));
    rec("⭐⭐⭐ convoys given at startup by an every_country: " + T + " takes the land its supply reaches by ship, as it does with set_convoys",
      byShipOnly(given, alg.given || []).length > 0 && handed(alg.given) === handed(ald.given) && (alg.stillShort || []).length === (ald.stillShort || []).length,
      { startup: handed(alg.given), convoys: handed(ald.given), stillShort: alg.stillShort });

    // 4f. …AND UNDER THE 1936 ECONOMY, A CAPITAL'S PIECE IS WEIGHED BY THE PEOPLE EACH STATE IS WRITTEN WITH. The default (no `economy`:
    // each country keeps its 1936 economy) deals a country's people over the states it holds, so the second pass, which moves states
    // between countries, changes how many people every state of the donor and of the receiver is written with — and where the armies
    // do not decide a country's capital piece, its people do. So chooseCapitals asks the economy FIRST, on every call, for the owners
    // as they stand (#a-generated-country-keeps-its-economy). Asked after the pieces were built, or only on the first call, the
    // re-choose weighed the pieces by the people of a world that is never written, and every test stayed green: on the owner's flow
    // about ten capitals stood on another piece, and MAN's was 1 person short of its own state 511 (review of the four-chain merge,
    // F1). 4e pins the re-choose under the land's own carry; this, under the default. Run before 4e arms every country: only T is
    // armed, as 4a left it. Worlds at 35% over twelve seeds; the judge reads the WRITTEN world, as 4e's does.
    {
      const pieceKey = (list) => { const bySea = list.filter((pc) => pc.coast).reduce((n, pc) => n + pc.army, 0); return (pc) => `${pc.coast ? bySea : pc.army} ${pc.army} ${pc.coast ? 1 : 0}`; };
      const wrongPiece = [], notMost = [], byPeople = [], modes = [];
      let exercised = 0;
      for (let seed = 1; seed <= 12; seed++) {
        const mod = makeMod(), r = md.generateLand(Object.assign(GEN35(mod), { seed })), given = ((r.countries || {}).armyLand || {}).given || [];
        modes.push(r.economy && !r.economy.error ? r.economy.mode : `error: ${(r.economy || {}).error}`);
        const ctx = { modRoot: mod, gameRoot: base, dependencyRoots: [] };
        const model = md.buildMapModel(Object.assign({ cacheStableLayers: false }, ctx));
        const graph = md.provinceNeighbourGraph(Object.assign({ model }, ctx));
        const type = new Map(model.provinces.map((p) => [+p.id, p.type]));
        const oceanBody = md.inlandSeaPlan({ model, adj: graph }).oceanBody;
        const army = new Set(LOCS);
        const gs = model.states.filter((s) => s.owner && (s.provinces || []).length).map((s) => ({ id: s.id, provinces: s.provinces.map(Number), owner: s.owner, manpower: Number(s.manpower) || 0, row: md.stateImportanceRow(s) }));
        const pieces = md.ownLandPieces({ groups: gs, ownerOf: (g) => g.owner, links: (p) => [...(graph.get(p) || [])].filter((q) => type.get(+q) === "land"),
          opens: (p) => md.opensOntoOcean(+p, { adj: graph, isSea: (q) => type.get(+q) === "sea", oceanBody }), peopleOf: (g) => g.manpower,
          armyOf: (g, t) => (t === T ? g.provinces.filter((p) => army.has(p)).length : 0) });
        let people = 0;
        for (const [t, list] of pieces) {
          const cap = (model.capitals || {})[t], want = md.capitalPieceFor(list, { ships: true });
          if (!want || !want.groups.some((g) => g.id === cap)) {
            wrongPiece.push(`seed ${seed} ${t} capital ${cap}: ` + list.map((pc) => `[${pc.groups.map((g) => g.id)} army ${pc.army}${pc.coast ? " coast" : ""} people ${pc.people}]`).join(" "));
            continue;
          }
          const best = md.mostImportantState(want.groups.map((g) => g.row));
          if (best !== cap) notMost.push(`seed ${seed} ${t} capital ${cap}, its piece's most important ${best}: ` + want.groups.map((g) => `${g.id} vp ${g.row.vp} mp ${g.manpower}`).join(", "));
          // the fixture: another piece ties with the capital's on everything capitalPieceFor asks before the people
          const key = pieceKey(list);
          if (list.some((pc) => pc !== want && key(pc) === key(want))) { byPeople.push(`seed ${seed} ${t}`); people++; }
        }
        if (given.length && people) exercised++;
      }
      rec("THE FIXTURE: every world was generated with the 1936 economy, the button's default", modes.every((m) => m === "country"), modes);
      rec("THE FIXTURE: in some world the second pass hands land over AND a country's capital piece is decided by its people (its pieces tie on the armies they reach and on the ocean)",
        exercised > 0, { exercised, byPeople });
      rec("⭐⭐⭐ under the 1936 economy every capital stands on the piece capitalPieceFor picks by the people WRITTEN, after the second pass", wrongPiece.length === 0, wrongPiece.slice(0, 4));
      rec("⭐⭐ …and is the most important state of that piece on disk", notMost.length === 0, notMost.slice(0, 4));
    }

    // 4e. THE CAPITALS ARE CHOSEN AGAIN AFTER THE SECOND PASS. Every country armed at density 1 (one division on each province it held
    // below), the same world at 35%, seed 1: the second pass hands land over and keeps no country, and the land a country holds THEN
    // decides where its capital stands — the piece capitalPieceFor picks, which reachOf assumed when it guarded the handing over
    // (review of b42f689a, P1: `if (k.kept.length || k.armies.length)` re-chooses; no test bit `if (k.kept.length)`). The judge reads
    // the WRITTEN world: each country's pieces over the province graph, the divisions on them, the coast, the people written.
    // ⚠️ With the land's own carry (`economy: "land"`): under #a-generated-country-keeps-its-economy a piece is weighed by the
    // manpower each state is WRITTEN with, and in this fixture that already puts CCC's FIRST capital on its armed piece, so the
    // re-choose decided nothing and `if (k.kept.length)` passed (merge of the network and industry chains). The carry keeps the
    // first choice where only the re-choose can move it.
    for (const t of Object.keys(landBelow)) if (t !== T) mk(path.join(base, "history", "units", t + "_1936.txt"), oob(landBelow[t]));
    const armed = makeMod(), ra = md.generateLand(GEN35(armed, { economy: "land" })), ala = (ra.countries || {}).armyLand || {};
    const ctx = { modRoot: armed, gameRoot: base, dependencyRoots: [] };
    const model = md.buildMapModel(Object.assign({ cacheStableLayers: false }, ctx));
    const graph = md.provinceNeighbourGraph(Object.assign({ model }, ctx));
    const type = new Map(model.provinces.map((p) => [+p.id, p.type]));
    const oceanBody = md.inlandSeaPlan({ model, adj: graph }).oceanBody;
    const armyAt = new Map(Object.entries(landBelow).map(([t, locs]) => [t, new Set(locs)]));
    const gs = model.states.filter((s) => s.owner && (s.provinces || []).length).map((s) => ({ id: s.id, provinces: s.provinces.map(Number), owner: s.owner, manpower: Number(s.manpower) || 0 }));
    const pieces = md.ownLandPieces({ groups: gs, ownerOf: (g) => g.owner, links: (p) => [...(graph.get(p) || [])].filter((q) => type.get(+q) === "land"),
      opens: (p) => md.opensOntoOcean(+p, { adj: graph, isSea: (q) => type.get(+q) === "sea", oceanBody }), peopleOf: (g) => g.manpower,
      armyOf: (g, t) => g.provinces.filter((p) => armyAt.get(t).has(p)).length });
    const told = [...pieces].filter(([, list]) => list.length > 1 && new Set(list.map((pc) => pc.army)).size > 1).map(([t]) => t);
    rec("THE FIXTURE: generated with the land's own carry, not the 1936 economy", (ra.economy || {}).mode === "land", ra.economy);
    rec("THE FIXTURE: the second pass hands land over and keeps no country, so only it re-chooses the capitals — and a country's pieces hold different armies",
      ra.changed === true && (ala.given || []).length > 0 && !((ra.countries || {}).kept || []).length && told.length > 0, { given: (ala.given || []).length, kept: (ra.countries || {}).kept, told });
    const wrong = [...pieces].filter(([t, list]) => { const want = md.capitalPieceFor(list, { ships: true }); return !want || !want.groups.some((g) => g.id === (model.capitals || {})[t]); })
      .map(([t, list]) => `${t} capital ${(model.capitals || {})[t]}: ` + list.map((pc) => `[${pc.groups.map((g) => g.id)} army ${pc.army}${pc.coast ? " coast" : ""}]`).join(" "));
    rec("⭐⭐ every capital stands on the piece of the land its country holds after the second pass that capitalPieceFor picks", wrong.length === 0, wrong);
  }
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
console.log("\n=== 5. fixDrownedDivisions: a mod that replaces history/units is spread at its own density ===");
{
  // 8x8 provinces of 32 px, ids by row. Below: rows 0-5 land, ZZZ owns all; the base game's ZZZ file is one division a province.
  // The mod keeps rows 0-1, replaces history/units, and ships its own ZZZ file: four on 9 and six on drowned 33 — two places, so
  // its own density is 5. Read through a hidden base-game copy the density would be 1, and the six would go one a province.
  const provAt = (x, y) => Math.floor(x / 32) + Math.floor(y / 32) * 8 + 1;
  const COL = (p) => [((p * 29) % 210) + 15, ((p * 67) % 210) + 15, ((p * 101) % 210) + 15];
  const def = (isLand) => { const rows = ["0;0;0;0;land;false;unknown;0"]; for (let p = 1; p <= 64; p++) { const [r, g, b] = COL(p), l = isLand(p); rows.push(`${p};${r};${g};${b};${l ? "land" : "sea"};false;${l ? "plains" : "ocean"};${l ? 1 : 0}`); } return rows.join("\n") + "\n"; };
  const st = (id, provs, owner) => `state = {\n\tid = ${id}\n\tname = "STATE_${id}"\n\tmanpower = 1000\n\tstate_category = rural\n\tprovinces = { ${provs.join(" ")} }\n\thistory = {\n\t\towner = ${owner}\n\t}\n}\n`;
  const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
  const g = fs.mkdtempSync(path.join(SANDBOX, "rp-game-")), m = fs.mkdtempSync(path.join(SANDBOX, "rp-mod-"));
  mk(path.join(g, "map", "provinces.bmp"), bmp24(256, 256, (x, y) => COL(provAt(x, y))));
  mk(path.join(g, "map", "definition.csv"), def((p) => p <= 48));
  mk(path.join(g, "history", "states", "1.txt"), st(1, range(1, 48), "ZZZ"));
  mk(path.join(g, "history", "countries", "ZZZ - Zland.txt"), 'capital = 1\noob = "ZZZ_1936"\n');
  const baseLocs = [9, 10, 11, 12, 13, 14, 33, 34, 35, 36];
  mk(path.join(g, "history", "units", "ZZZ_1936.txt"), oob(baseLocs));
  mk(path.join(m, "descriptor.mod"), 'name="rp"\nreplace_path="history/states"\nreplace_path="history/units"\n');
  mk(path.join(m, "map", "definition.csv"), def((p) => p <= 16));
  mk(path.join(m, "history", "states", "1.txt"), st(1, range(1, 16), "ZZZ"));
  const mine = [9, 9, 9, 9, 33, 33, 33, 33, 33, 33];
  mk(path.join(m, "history", "units", "ZZZ_1936.txt"), oob(mine));
  const ownDensity = densityOf(mine), hidden = densityOf(baseLocs);
  rec("THE FIXTURE: the mod's own density is " + ownDensity + ", the hidden base-game copy's " + hidden, ownDensity === 5 && hidden === 1);
  const r = md.fixDrownedDivisions({ modRoot: m, gameRoot: g, dependencyRoots: [] });
  const got = (fs.readFileSync(path.join(m, "history", "units", "ZZZ_1936.txt"), "utf8").match(/location\s*=\s*(\d+)/g) || []).map((x) => +x.replace(/\D/g, ""));
  const on9 = got.filter((p) => p === 9).length;
  rec("⭐⭐⭐ the six drowned divisions fill the nearest province up to the MOD's density — one more onto 9, which held four",
    r.moved === 6 && on9 === ownDensity && !got.includes(33), { moved: r.moved, got, on9 });
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
console.log("\n=== 6. the page says it, and the density is computed in one place ===");
{
  const { maskJsLiterals, jsBodyAt, stripJsComments } = require("./testlib-strip-comments.js");
  const PAGE = fs.readFileSync(path.join(__dirname, "public", "map.js"), "utf8"), MASKED = maskJsLiterals(PAGE);
  const at = MASKED.indexOf("function generatedCountriesNote("), body = at < 0 ? null : jsBodyAt(MASKED, at);
  rec("public/map.js has generatedCountriesNote", !!body);
  const note = body ? require("vm").runInNewContext("(" + PAGE.slice(at, body[1] + 1) + ")") : () => "";
  const given = [{ tag: "JAP", state: 901, from: "SOV", size: 3 }, { tag: "JAP", state: 902, from: "USA", size: 2 }, { tag: "JAP", state: 903, from: "SOV", size: 1 }, { tag: "TUR", state: 904, from: "FRA", size: 4 }];
  const said = note({ countries: { kept: [], stillGone: [], capitals: {}, armyLand: { files: 3, given, stillShort: [] } } });
  const provinces = given.reduce((a, g) => a + g.size, 0);
  rec("⭐⭐ the land handed to the armies is said: how many countries, states and provinces, each receiver with its main donors, most first",
    said.includes("2 countries") && said.includes(`${given.length} states, ${provinces} provinces`) && said.includes("JAP +6 from SOV, USA; TUR +4 from FRA"), said);
  const short = note({ countries: { kept: [], stillGone: [], capitals: {}, armyLand: { given: [], stillShort: [{ tag: "CHI", has: 12, need: 40 }] } } });
  rec("⭐⭐⭐ a country still short of its army's land is WARNED about, with what it has and needs", /⚠/.test(short) && short.includes("CHI has 12 of 40 provinces"), short);
  const err = note({ countries: { kept: [], stillGone: [], capitals: {}, armyLand: { error: "boom" } } });
  rec("⭐⭐ an order-of-battle read that failed is said with its reason", /⚠/.test(err) && err.includes("boom"), err);
  rec("CONTROL: nothing handed, nobody short — nothing said", note({ countries: { kept: [], stillGone: [], capitals: {}, armyLand: { files: 3, given: [], stillShort: [] } } }) === "", note({ countries: { kept: [], stillGone: [], capitals: {}, armyLand: { given: [] } } }));
  if (globalThis.__armyLandResult) {
    const real = note(globalThis.__armyLandResult), g0 = ((globalThis.__armyLandResult.countries || {}).armyLand || {}).given || [];
    rec("⭐ …and part 4's own answer is said in those words", g0.length > 0 && real.includes(`took the nearest new land that was sea underneath (${g0.length} state`), real);
  }

  const SRC = stripJsComments(fs.readFileSync(path.join(__dirname, "map-data.js"), "utf8"));
  const count = (s, needle) => s.split(needle).length - 1;
  rec("⭐⭐ the density is computed in ONE place in map-data.js (comments stripped)", count(SRC, "Math.ceil(locs.length / places)") === 1, count(SRC, "Math.ceil(locs.length / places)"));
  const f = SRC.indexOf("function fixDrownedDivisions("), fb = f < 0 ? null : jsBodyAt(maskJsLiterals(SRC), f);
  const FIX = fb ? SRC.slice(f, fb[1] + 1) : "";
  const dAt = FIX.indexOf("const densityOf ="), dEnd = dAt < 0 ? -1 : FIX.indexOf("};", dAt);
  const DENSITY = dAt < 0 ? "" : FIX.slice(dAt, dEnd);
  rec("⭐⭐ fixDrownedDivisions' densityOf asks orderOfBattleDensity, and reads below through historyFilesBelow — never effectiveHistoryFiles(null, …)",
    !!DENSITY && DENSITY.includes("orderOfBattleDensity(") && DENSITY.includes("historyFilesBelow(") && !DENSITY.includes("effectiveHistoryFiles(null"), DENSITY.slice(0, 300));
  // THE NAVY GUARD'S WIRING. The lattice cannot make it fire (120 shapes, shares and seeds searched: a donor always keeps another
  // ocean coast), so its inputs are pinned here and its effect on the owner's flow is measured (Portugal keeps its level-8 port).
  const g0 = SRC.indexOf("function generateLand("), gb = g0 < 0 ? null : jsBodyAt(maskJsLiterals(SRC), g0);
  const GEN_SRC = gb ? SRC.slice(g0, gb[1] + 1) : "";
  const callAt = GEN_SRC.indexOf("keepEveryCountryBelow({"), call = callAt < 0 ? "" : GEN_SRC.slice(callAt, GEN_SRC.indexOf("});", callAt));
  const coastLine = (GEN_SRC.match(/const oceanCoast = [^\n]*/) || [""])[0];
  // (the army is read ONCE, above the capitals, since the capital's piece is scored by it — #a-capital-stands-where-its-country-can-reach;
  // the reach asks the countries that ship through shipsOf, which reads that same read's `sails`)
  const reachAt = GEN_SRC.indexOf("const reachOf = "), reachSrc = reachAt < 0 ? "" : GEN_SRC.slice(reachAt, GEN_SRC.indexOf("};", reachAt));
  rec("⭐⭐ generateLand hands the keep pass the navies armyLandNeed read, a coast that opens onto the ocean as the navy homes ask it, and the reach",
    count(GEN_SRC, "keepEveryCountryBelow({") === 1 && /\bnavies\b/.test(call) && /\boceanCoast\b/.test(call) && /\breachOf\b/.test(call) && /\bneedOf\b/.test(call)
      && count(GEN_SRC, "armyLandNeed(") === 1 && count(GEN_SRC, "navies = armyRead.navies") === 1 && /const shipsOf = [^\n]*armyRead\.sails/.test(GEN_SRC) && /\bshipsOf\(tag\)/.test(reachSrc)
      && coastLine.includes("coastNow.has(") && coastLine.includes("opensNow("), { call: call.slice(0, 300), coastLine, reachSrc: reachSrc.slice(0, 300) });
  const handler = stripJsComments(PAGE), post = handler.indexOf('fetch("/api/map/generate-land"');
  rec("⭐ the Generate land report on the page carries generatedCountriesNote", post >= 0 && /=\s*generatedCountriesNote\(res\)/.test(handler.slice(post)));
}

try { fs.rmSync(SANDBOX, { recursive: true, force: true }); } catch (_) {}   // scratch fixtures only — never a mod directory (⛔ CLAUDE.md #1)
console.log("\n" + (fails.length ? "FAILED " + fails.length + " of " + checks : "PASSED " + checks + " checks"));
if (fails.length) { for (const f of fails) console.log("  - " + f); process.exit(1); }
