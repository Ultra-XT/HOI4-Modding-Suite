// #the-sea-in-a-state-count-is-not-the-cap — non_land_province_in_state must report how many sea provinces are in
// states, not how many it stopped counting at.
//
// THE DEFECT. The rule collected its offenders with the payload cap wired into the SEARCH:
//
//     if (ty === "sea" && bad.length <= 60 && seaProvinceInStateIsTheModsOwn(...)) bad.push(...)
//     ... items: bad.slice(0, 60), message: `${bad.length} sea province(s) are inside a state ...`
//
// so the walk stopped at 61 and `bad.length` — the number the modder reads — was the cap, not the map. It was
// also internally inconsistent: the message said 61 while `items` carried 60, because the push ran at lengths
// 0..60 and the slice then took 60.
//
// MEASURED, on the owner's own workflow (new mod -> Delete map -> Generate land -> Auto-fix all, the build at
// scratchpad/flow2b16): the map has 5,049 sea provinces sitting in states across 842 states, and Map Errors said
//
//     "61 sea province(s) are inside a state (e.g. province 3838 in state 1)."
//
// 61 is a precise-looking number, so nothing about it reads as truncation — and the brief for this very session
// quoted it back as "province 61", which is what a number that means nothing does to a reader.
//
// THE FIX IS THE COUNT, NOT THE CAP. `items` still carries at most 60 rows; only the walk was uncapped, so the
// message states the map's number. Uncapping the walk means the ownership gate is now asked per reference rather
// than 61 times, which is why provinceRowIsTheModsOwn resolves its inherited row index ONCE PER MODEL (the same
// per-model caching statesBelow next door already does) — without that, validateMapModel on the built world went
// 193 ms -> 969 ms, 776 ms of it filesystem stats of one definition.csv. Section 3 pins that; it is what keeps
// this fix from being a five-times slowdown.
//
// ⛔ AND THE GATE MUST STILL HOLD. Uncapping a walk is exactly the shape that quietly widens what a rule reports,
// so section 4 keeps a sea province the layers below ALREADY list in that state out of the count
// (#auto-fix-leaves-a-sea-province-in-a-state-the-mod-inherited).
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const md = require("./map-data.js");
const { stripJsComments } = require("./testlib-strip-comments.js");

let pass = 0, fail = 0;
const rec = (n, c, e) => { if (c) { pass++; console.log("  ok   " + n); } else { fail++; console.log("  FAIL " + n + (e != null ? "   " + e : "")); } };
const countIn = (msg) => parseInt(/^(\d+)/.exec(String(msg || ""))[1], 10);

// ── The cap, DERIVED from the shipped rule rather than typed here ────────────────────────────────────────────
// ⚠️ Strip comments first: the explanation above the fix quotes `bad.length <= 60`, so a raw grep finds the
// prose that describes the bug and calls it the code.
const SRC = stripJsComments(fs.readFileSync(path.join(__dirname, "map-data.js"), "utf8"));
// ⭐ EITHER SHAPE, on purpose. Two passes fixed this rule independently in the same batch: one stopped capping the
// collection and sliced at the payload, the other kept the cap on the collection and counted alongside it. The one
// that shipped is the second — it never builds an array of 5,049 objects to show 60 of them — so a pattern that knew
// only the first shape failed here while the behaviour was right, which is a test pinning a shape, not a rule.
const capM = /rule:\s*"non_land_province_in_state",\s*items:\s*bad\.slice\(0,\s*(\d+)\)/.exec(SRC)
  || /if\s*\(bad\.length\s*<=?\s*(\d+)\)\s*bad\.push\(/.exec(SRC);
const CAP = capM ? +capM[1] : null;

console.log("\n1. ⭐⭐⭐ The number in the message is the map's, not the cap");
rec("the rule's payload cap was found in map-data.js", CAP != null, capM ? "" : "pattern did not match — has the push been reshaped?");

// A model with many more sea-in-state references than the cap. No modRoot, so every one is the mod's to answer
// for and the gate is not what is under test here.
const SEA_IDS = [];
for (let i = 200; i < 200 + (CAP || 60) * 2 + 17; i++) SEA_IDS.push(i);   // deliberately well over the cap
const LAND_IDS = [10, 11, 12];
const provinces = [
  ...LAND_IDS.map((id) => ({ id, type: "land", r: id, g: 1, b: 1, continent: 1 })),
  ...SEA_IDS.map((id, k) => ({ id, type: "sea", r: (id >> 8) & 255, g: id & 255, b: 7 + (k & 1), continent: 0 })),
];
// spread them over several states, so the count is not "one state's list length" by accident
const states = [];
for (let s = 0; s < 4; s++) {
  const mine = SEA_IDS.filter((_, k) => k % 4 === s);
  states.push({ id: s + 1, name: "S" + (s + 1), provinces: [LAND_IDS[s % LAND_IDS.length], ...mine] });
}
const model = { provinces, provinceToState: {}, states, capitals: {} };
for (const st of states) for (const p of st.provinces) model.provinceToState[p] = st.id;

const p1 = md.validateMapModel(model).filter((x) => x.rule === "non_land_province_in_state");
rec("the rule fires once, aggregated", p1.length === 1, JSON.stringify(p1.map((x) => x.rule)));
rec("⭐⭐⭐ the message counts EVERY sea province in a state, not the cap",
  p1[0] && countIn(p1[0].message) === SEA_IDS.length, p1[0] ? countIn(p1[0].message) + " vs " + SEA_IDS.length : "no problem");
rec("…and the fixture really does exceed the cap, so this is not a vacuous pass", SEA_IDS.length > CAP, SEA_IDS.length + " vs cap " + CAP);

console.log("\n2. ⚠️ …while the PAYLOAD is still capped — the fix is the count, not the cap");
rec("items carries at most the cap", p1[0] && p1[0].items.length === CAP, p1[0] ? String(p1[0].items.length) : "");
rec("⭐⭐ …so the message and its own list now disagree ON PURPOSE, and the message is the larger",
  p1[0] && countIn(p1[0].message) > p1[0].items.length);
rec("every item still carries province/state/type", p1[0] && p1[0].items.every((i) => i.province != null && i.stateId != null && i.type === "sea"));

console.log("\n3. ⭐⭐⭐ The inherited row index is resolved ONCE PER MODEL, not once per province");
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-seacount-"));
const GAME = path.join(ROOT, "game"), MOD = path.join(ROOT, "mod");
const w = (dir, rel, body) => { const q = path.join(dir, ...rel.split("/")); fs.mkdirSync(path.dirname(q), { recursive: true }); fs.writeFileSync(q, body); };
const stFile = (id, provs) => `state = {\n\tid = ${id}\n\tname = "STATE_${id}"\n\tmanpower = 1000\n\tstate_category = rural\n\tprovinces = { ${provs.join(" ")} }\n\thistory = {\n\t\towner = AAA\n\t}\n}\n`;

// 2..149 land, 150..299 sea in the BASE game; the mod retypes 2..120 to sea itself.
const MOD_MADE_SEA = []; for (let i = 2; i <= 120; i++) MOD_MADE_SEA.push(i);
const BASE_SEA_IN_STATE = []; for (let i = 150; i <= 160; i++) BASE_SEA_IN_STATE.push(i);
const row = (id, type) => `${id};${(id >> 8) & 255};${id & 255};${id % 251};${type};false;plains;${type === "sea" ? 0 : 1}`;
const baseRows = ["0;0;0;0;land;false;unknown;0"];
for (let i = 1; i <= 299; i++) baseRows.push(row(i, i >= 150 ? "sea" : "land"));
const modRows = ["0;0;0;0;land;false;unknown;0"];
for (let i = 1; i <= 299; i++) modRows.push(row(i, (i >= 150 || MOD_MADE_SEA.includes(i)) ? "sea" : "land"));
w(GAME, "hoi4.exe", "not really an exe");
w(GAME, "map/definition.csv", baseRows.join("\r\n") + "\r\n");
w(GAME, "history/states/1-A.txt", stFile(1, [140, ...MOD_MADE_SEA]));        // the base lists them while they are LAND
w(GAME, "history/states/900-Z.txt", stFile(900, [141, ...BASE_SEA_IN_STATE])); // the base's OWN sea-in-a-state
w(MOD, "descriptor.mod", 'name="seacount"\nsupported_version="1.*"\n');
w(MOD, "map/definition.csv", modRows.join("\r\n") + "\r\n");
w(MOD, "history/states/1-A.txt", stFile(1, [140, ...MOD_MADE_SEA]));         // the mod owns this state file

const m2 = md.buildMapModel({ modRoot: MOD, gameRoot: GAME, dependencyRoots: [] });
let defStats = 0;
const realExists = fs.existsSync;
fs.existsSync = function (q) { if (String(q).replace(/\\/g, "/").endsWith("map/definition.csv")) defStats++; return realExists.apply(this, arguments); };
let p2;
try { p2 = md.validateMapModel(m2).filter((x) => x.rule === "non_land_province_in_state"); }
finally { fs.existsSync = realExists; }

rec("the rule fires on the fixture", p2.length === 1, JSON.stringify(p2.map((x) => x.rule)));
const reported = p2[0] ? countIn(p2[0].message) : -1;
rec("…on more references than the cap, so the walk is long enough to matter", reported > CAP, String(reported));
rec("⭐⭐⭐ definition.csv is stat-ed a handful of times, not once per province",
  defStats <= 8, defStats + " stats for " + reported + " reported references");
rec("…and the saving is real, not a fixture too small to show it", reported >= 100, String(reported));

console.log("\n4. ⛔ The gate still holds: a sea province the layers below already list is NOT the mod's");
rec("⭐⭐⭐ the count is exactly what the MOD made sea, and excludes the base game's own sea-in-a-state",
  reported === MOD_MADE_SEA.length, reported + " vs " + MOD_MADE_SEA.length + " (base's own: " + BASE_SEA_IN_STATE.length + ")");
rec("…and none of the reported items is one of the base game's",
  p2[0] && p2[0].items.every((i) => !BASE_SEA_IN_STATE.includes(+i.province)),
  p2[0] ? JSON.stringify(p2[0].items.filter((i) => BASE_SEA_IN_STATE.includes(+i.province)).slice(0, 5)) : "");
rec("…so the fixture really did put a base-game sea province in a base-game state", BASE_SEA_IN_STATE.length > 0);

try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
console.log(`\n=== the sea in a state count is not the cap: ${pass + fail} checks, ${fail} failed ===`);
process.exit(fail ? 1 : 0);
