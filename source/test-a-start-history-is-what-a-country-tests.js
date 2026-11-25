// ⛔ #a-start-history-is-what-a-country-tests — WHICH IDS A COUNTRY'S OWN START HISTORY HOLDS FIRST.
//
// Generate land's renumbering keeps, before anything else, the ids a country's own history/countries file names (`firstOf` in
// chooseGeneratedStateIds). It counted EVERY id that file names, so an id it only ACTS on — a `<id> = { … }` block that sets a flag, a
// set_capital, a transfer_state — stood level with an id it TESTS, and a test is what the game's setup reads back: Spain's La Résistance
// garrison limit spares 177 178 290 699 783 297, and its civil war leaves Spain only those. On seed 2 at 35% a Spain short of states kept
// ids its file only acts on and 699 went to IRQ. The w5b2 critic's P4, rebuilt by the w5b3 builder on the owner's flow: the start history
// narrowed to the state a trigger tests by number (state, owns_state, controls_state, has_full_control_of_state, is_in_state, in a trigger
// context), the full set kept in the weight — same-owner trigger references 23,301 -> 23,541 (seed 1/35%), 20,743 -> 20,951 and Spain's six
// kept (seed 2/35%), 24,481 -> 24,523 (seed 1/15%), each world 0 errors, 0 warnings. Pinned as pure functions over a fixture, every
// expectation derived from the fixture's own text, never typed:
//   1. stateIdScriptNamings marks with a file's tag exactly the ids that file tests inside a limit — and no id it only acts on — while the
//      weight still counts every id it names;
//   2. Spain's shape: a short country's one group, holding half of the state below an id its file only acts on and a little of an id its
//      garrison limit spares, keeps the spared id;
//   3. ⛔ #a-start-history-acts-on-its-own-states — …but what the file only ACTS on is the second tier, not nothing: dropped to the weight,
//      a country's own day-1 `<id> = { … }` acts landing in another country's state went 26 -> 44 of 82 on the owner's flow (Turkey's
//      Kurdish start_resistance in English and Portuguese states; w5b3 review, gameplay-F2). stateIdScriptNamings marks every id a file
//      names in `startActs`, and a short country's second group takes the id its file starts resistance in over one it names nowhere
//      whose land it holds half of.
// Fixture-only: binds no port. Run: node test-a-start-history-is-what-a-country-tests.js
"use strict";
const fs = require("fs"), os = require("os"), path = require("path");

let checks = 0;
const fails = [];
const rec = (label, cond, detail) => {
  checks++;
  console.log((cond ? "  ok   " : "  FAIL ") + label + (detail == null ? "" : "   " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 300)));
  if (!cond) fails.push(label);
};

const SANDBOX = fs.mkdtempSync(path.join(os.tmpdir(), "nova-start-history-tests-"));
process.env.APPDATA = path.join(SANDBOX, "appdata");
process.env.XDG_CONFIG_HOME = process.env.APPDATA;
process.env.NOVA_APP_DATA_DIR = process.env.APPDATA;
process.env.NOVA_HOME_DIR = path.join(SANDBOX, "home");
fs.mkdirSync(process.env.APPDATA, { recursive: true });
fs.mkdirSync(process.env.NOVA_HOME_DIR, { recursive: true });
const md = require("./map-data.js");
const mk = (p, c) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, c); };

// The layer below: two country histories. Spain's tests 3 and 4 in its garrison limit and 6 in an `if`'s limit, and acts on 5 (a block),
// 7 (transfer_state), 8 (set_capital) and 10 (a block that starts resistance); England's tests 9.
const HISTORY = {
  "SPR - Spain.txt": [
    "capital = 1",
    "every_owned_state = {",
    "\tlimit = {",
    "\t\tNOT = { state = 3 state = 4 }",
    "\t}",
    "\tset_state_flag = spr_garrison",
    "}",
    "5 = {",
    "\tset_state_flag = spr_spared",
    "}",
    "if = {",
    "\tlimit = { owns_state = 6 }",
    "\tset_country_flag = spr_holds_six",
    "}",
    "transfer_state = 7",
    "set_capital = { state = 8 }",
    "10 = {",
    "\tstart_resistance = yes",
    "}",
    "",
  ].join("\n"),
  "ENG - England.txt": [
    "capital = 2",
    "every_state = {",
    "\tlimit = { OR = { state = 9 } }",
    "\tset_state_flag = eng_watch",
    "}",
    "",
  ].join("\n"),
};
const game = path.join(SANDBOX, "game");
for (const [f, t] of Object.entries(HISTORY)) mk(path.join(game, "history", "countries", f), t);
const mod = path.join(SANDBOX, "mod");
mk(path.join(mod, "descriptor.mod"), 'name="Start history"\nsupported_version="1.19.*"\n');

// An independent reading of the fixture's own text: a brace walk keeping the key each block was opened by. A number a trigger tests is
// the value of one of the five state-by-number triggers inside a `limit` at any depth; every other number the file names as a block key
// or a value (the `capital = <id>` line aside, which the capital pins answer) is one it acts on.
const TESTS = new Set(["state", "owns_state", "controls_state", "has_full_control_of_state", "is_in_state"]);
function readFixture(text) {
  const tested = new Set(), named = new Set();
  const stack = [];
  let pending = "";
  for (const m of text.matchAll(/\{|\}|([A-Za-z0-9_]+)\s*=\s*(\{|[A-Za-z0-9_.]+)/g)) {
    if (m[0] === "{") { stack.push(pending); pending = ""; continue; }
    if (m[0] === "}") { stack.pop(); continue; }
    const key = m[1], val = m[2];
    if (val === "{") { if (/^\d+$/.test(key)) named.add(+key); stack.push(key.toLowerCase()); continue; }
    if (!/^\d+$/.test(val) || key.toLowerCase() === "capital" && !stack.length) continue;
    named.add(+val);
    if (TESTS.has(key.toLowerCase()) && stack.includes("limit")) tested.add(+val);
  }
  return { tested, actsOn: new Set([...named].filter((v) => !tested.has(v))) };
}
const tagOf = (f) => /^([A-Za-z0-9]{3})\s*-/.exec(f)[1];

console.log("\n-- 1. what a country's own start history holds --");
const nm = md.stateIdScriptNamings({ modRoot: mod, gameRoot: game, dependencyRoots: [], ceiling: 100 });
for (const [f, t] of Object.entries(HISTORY)) {
  const tag = tagOf(f), { tested, actsOn } = readFixture(t);
  const marked = (v) => (nm.startHistory.get(v) || new Set()).has(tag);
  rec(`${tag}: every id its file tests inside a limit is its start history (${[...tested].join(" ")})`, tested.size > 0 && [...tested].every(marked), [...nm.startHistory].map(([v, s]) => [v, [...s]]));
  rec(`${tag}: no id its file only acts on is (${[...actsOn].join(" ") || "none"})`, [...actsOn].every((v) => !marked(v)), [...actsOn].filter(marked));
  rec(`${tag}: …while the weight still counts every id the file names`, [...tested, ...actsOn].every((v) => (nm.weights.get(v) || 0) >= 1), [...nm.weights]);
  // #a-start-history-acts-on-its-own-states — and the second tier holds every id the file names, tested or acted on, and no other
  const acts = [...nm.startActs].filter(([, set]) => set.has(tag)).map(([v]) => v).sort((a, b) => a - b);
  rec(`${tag}: its second tier (startActs) is every id its file names (${[...tested, ...actsOn].sort((a, b) => a - b).join(" ")}), and nothing else`,
    acts.join() === [...tested, ...actsOn].sort((a, b) => a - b).join(), acts);
}
{
  const spr = readFixture(HISTORY["SPR - Spain.txt"]), eng = readFixture(HISTORY["ENG - England.txt"]);
  rec("a start history is the file's own tag: England's tested id is not Spain's, nor Spain's England's",
    [...eng.tested].every((v) => !(nm.startHistory.get(v) || new Set()).has("SPR")) && [...spr.tested].every((v) => !(nm.startHistory.get(v) || new Set()).has("ENG")));
  rec("the fixture has both kinds for Spain (else the checks above prove nothing)", spr.tested.size >= 2 && spr.actsOn.size >= 2, { tested: [...spr.tested], actsOn: [...spr.actsOn] });
}

console.log("\n-- 2. Spain's shape --");
{
  // ids 1..9 below: 9 is England's, the rest Spain's, four provinces each. Spain is short: ONE group here, holding half of the state
  // below the id its file only acts on with a block (5) and one province of the first id its garrison limit spares (3). Every other
  // group has no owner. generateLand's own firstOf: the id's owner below is the tag of a file whose start history holds it.
  const spr = readFixture(HISTORY["SPR - Spain.txt"]);
  const block = /^(\d+)\s*=\s*\{/m.exec(HISTORY["SPR - Spain.txt"]);
  const actedOn = +block[1], spared = [...spr.tested].sort((a, b) => a - b)[0];
  const lo = 1, hi = 9, size = 4;
  const baseOwner = new Map(); for (let v = lo; v <= hi; v++) baseOwner.set(v, v === 9 ? "ENG" : "SPR");
  const g0 = { owner: "SPR", provinces: [0, 0, 0], land: new Map([[actedOn, size / 2], [spared, 1]]) };
  const groups = [g0]; for (let v = lo + 1; v <= hi; v++) groups.push({ owner: "", provinces: [0], land: new Map() });
  const choose = (firstOf, actedOf) => md.chooseGeneratedStateIds({ groups, lo, hi, ownerOf: (g) => g.owner, overlapOf: (g) => g.land,
    baseOwnerOf: (v) => baseOwner.get(v) || "", baseSizeOf: () => size, weightOf: (v) => nm.weights.get(v) || 0, firstOf, actedOf });
  // generateLand's own two tiers: what the file tests, then what it acts on
  const r = choose((v) => !!baseOwner.get(v) && (nm.startHistory.get(v) || new Set()).has(baseOwner.get(v)), (v) => !!baseOwner.get(v) && (nm.startActs.get(v) || new Set()).has(baseOwner.get(v)));
  rec(`⭐⭐⭐ Spain's one state keeps the id its garrison limit spares (${spared}), over the one its file only acts on (${actedOn}) whose land it holds half of`,
    r.idOf.get(g0) === spared, { got: r.idOf.get(g0), report: r.report });
  // the control: with nothing a start history, the half it holds decides — so the start history is what moved it
  rec("…and without the start history the half it holds would win", choose(() => false).idOf.get(g0) === actedOn);
}

console.log("\n-- 3. what the start history acts on is the second tier --");
{
  // ids 1..10 below: 9 is England's, the rest Spain's, four provinces each. Spain is short: TWO groups here. One holds a province of the
  // first id its garrison limit spares; the other holds half of the state below an id Spain's file names nowhere, and none of the id its
  // file starts resistance in. Read off the fixture's own text.
  const spr = readFixture(HISTORY["SPR - Spain.txt"]);
  const resist = +/^(\d+)\s*=\s*\{\s*start_resistance\s*=\s*yes\s*\}/m.exec(HISTORY["SPR - Spain.txt"])[1];
  const spared = [...spr.tested].sort((a, b) => a - b)[0];
  const lo = 1, hi = 10, size = 4;
  const unnamed = Array.from({ length: hi - lo + 1 }, (_, i) => lo + i).find((v) => v !== 9 && !spr.tested.has(v) && !spr.actsOn.has(v));
  rec("(the fixture: Spain's file starts resistance in an id it tests nowhere, and names another id nowhere at all)", resist > 0 && !spr.tested.has(resist) && spr.actsOn.has(resist) && unnamed > 0, { resist, unnamed, spared });
  // Spain holds only these three ids below, England the rest: so one tested id, one acted on, one named nowhere
  const mine = new Set([spared, resist, unnamed]);
  const baseOwner = new Map(); for (let v = lo; v <= hi; v++) baseOwner.set(v, mine.has(v) ? "SPR" : "ENG");
  const g1 = { owner: "SPR", provinces: [0], land: new Map([[spared, 1]]) }, g2 = { owner: "SPR", provinces: [0, 0], land: new Map([[unnamed, size / 2]]) };
  const groups = [g1, g2]; for (let v = lo + 2; v <= hi; v++) groups.push({ owner: "", provinces: [0], land: new Map() });
  const tested = (v) => !!baseOwner.get(v) && (nm.startHistory.get(v) || new Set()).has(baseOwner.get(v));
  const acted = (v) => !!baseOwner.get(v) && (nm.startActs.get(v) || new Set()).has(baseOwner.get(v));
  const choose = (actedOf) => md.chooseGeneratedStateIds({ groups, lo, hi, ownerOf: (g) => g.owner, overlapOf: (g) => g.land,
    baseOwnerOf: (v) => baseOwner.get(v) || "", baseSizeOf: () => size, weightOf: (v) => nm.weights.get(v) || 0, firstOf: tested, actedOf });
  const r = choose(acted);
  rec(`⭐⭐⭐ Spain's two states keep the id its garrison limit spares (${spared}) and the id it starts resistance in (${resist}) — over the id its file names nowhere (${unnamed}), whose land one of them holds half of`,
    r.idOf.get(g1) === spared && r.idOf.get(g2) === resist, { g1: r.idOf.get(g1), g2: r.idOf.get(g2), report: r.report });
  // the control: with no second tier, the half it holds decides
  rec("…and without the second tier the half it holds would win", choose(() => false).idOf.get(g2) === unnamed, choose(() => false).idOf.get(g2));
}

try { fs.rmSync(SANDBOX, { recursive: true, force: true }); } catch (_) {}
console.log(`\n${checks - fails.length}/${checks} checks passed${fails.length ? " — FAILED: " + fails.join(" | ") : ""}`);
process.exit(fails.length ? 1 : 0);
