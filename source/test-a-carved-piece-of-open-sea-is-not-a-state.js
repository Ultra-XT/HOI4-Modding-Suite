// A cut-off piece with no land in it is taken OUT of the state that was standing on it — not given a state of its own.
// #a-carved-piece-of-open-sea-is-not-a-state
//
// ⛔ THE DEFECT — AUTO-FIX REPAIRED A FATAL BY MINTING AN ERROR. fixFractionedRegions carves a cut-off piece into a state
// of its own when no neighbouring region can take its whole state (#a-cut-off-piece-gets-a-state-of-its-own). It never
// asked whether the piece has any LAND in it. A strategic region holds whole states, so the carve exists to keep a state
// whole — but a sea province needs no state at all (the base game keeps 3,133 of them in none), and a state made of sea
// alone is `state_owns_no_land`, which validateMapModel reports as an ERROR and whose own message says none of the 7,523
// states on the six shipping maps owns no land.
//
// ⚠️ MEASURED on the owner's own workflow, the whole of it, through the page's own endpoints — new mod over the installed
// base game, copy provinces.bmp in, POST /api/map/blank-to-sea, POST /api/map/generate-land (4,650 provinces, 35% of the
// ocean, seed 1), POST /api/map/auto-fix twice, GET /api/map/validate. That world ends with 344 states Nova wrote. 342
// hold land. Two do not:
//
//     1424  provinces = { 12219 12234 13392 }   owner = INS   add_core_of = TNE   manpower = 243464
//     1425  provinces = { 13384 }               owner = INS   add_core_of = TNE   manpower = 81154
//
// Every one of those four provinces is sea. Both states came out of splitStateOffProvinces, twice over the base game's
// state 667 "West Nusa Tenggara": 667 ships 12 provinces and 973854 manpower, and this function's own share arithmetic
// run twice gives 973854 → 243464 (3 of 12), then 730390 → 81154 (1 of 9), leaving 649236 — which is the manpower the
// mod's copy of 667 ends with, to the digit. They are also the ONLY sea provinces in any state Nova made on that map: 4
// of the 6,537 that `non_land_province_in_state` counts, the other 6,533 being in states the base game ships.
//
// THE DECISION. Take the water out of the state instead. The region then has no state to keep whole and can take the
// piece as it is; the parent keeps its land; nothing is minted. SEA only, never a lake — fixSeaProvinceLeftovers says
// why in as many words ("lakes are valid in states") and the base game itself puts 100+ lake provinces inside states —
// and the cut is that same fixer's, provinceMoveSourceTransform, so the province's whole history goes with it in every
// date rather than being left behind naming a province the state no longer lists. The guard that refuses to empty the
// parent is untouched.
//
// Requests are the page's: GET /api/map/validate?modPath and POST /api/map/auto-fix { modPath }.
"use strict";

const fs = require("fs");
const path = require("path");
const lib = require("./testlib-two-layer-map.js");
const { isFatalRule } = require("./public/map-rule-labels.js");

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (ok || detail == null ? "" : "   -> " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 900)));
  if (!ok) fails.push(label);
};

const world = lib.makeWorld("c3-sea-carve");
const { createApp } = require("./server.js");

// The 256x256 map the two carve tests use, with ONE change: the island, province 3, is SEA. That is the whole point —
// the geometry is the shape where no neighbouring region can take the whole state, and the piece left over is water.
//
//   y < 128   sea 1 (x < 128)   sea 5 (x >= 128)   with sea 3 at x in [192,224), y in [32,64), entirely inside 5
//   y >= 128  land 2 (32 <= x < 96)   land 4 either side
//
// So 3 touches only 5; land 2 touches sea 1 and land 4 only. A region holding 5 cannot also hold 2 in one piece.
const COL = { 1: [0, 0, 200], 2: [200, 0, 0], 3: [0, 200, 0], 4: [200, 200, 0], 5: [0, 0, 120] };
const at = (x, y) => (y < 128 ? (x >= 192 && x < 224 && y >= 32 && y < 64 ? 3 : x < 128 ? 1 : 5) : (x >= 32 && x < 96 ? 2 : 4));
const DEF = ["0;0;0;0;land;false;unknown;0", "1;0;0;200;sea;false;ocean;0", "2;200;0;0;land;true;plains;1",
  "3;0;200;0;sea;false;ocean;0", "4;200;200;0;land;true;plains;1", "5;0;0;120;sea;false;ocean;0"].join("\r\n") + "\r\n";
// Both land states carry their own air base and rocket site, so nothing about air bases is a pre-existing problem of the
// fixture and the rules this file reads are about the carve and nothing else.
const BUILD = [
  "1;air_base;176.00;9.50;56.00;0.00;0", "1;rocket_site_spawn;176.00;9.50;56.00;0.00;0",
  "2;air_base;48.00;9.50;56.00;0.00;0", "2;rocket_site_spawn;48.00;9.50;56.00;0.00;0",
  "2;naval_base_spawn;48.00;9.50;126.00;0.00;1", "1;naval_base_spawn;176.00;9.50;126.00;0.00;5",
].join("\n");

// State 2 = { 2 3 }: one land province and one sea province. Owned by AAA, occupied by BBB, cored by CCC, and the sea
// province carries the state's only victory point — so a carve that minted a state would hand all of that to water, and
// a cut that merely unlisted the province would leave the victory point behind naming a province the state has dropped.
const STATE2 = 'state = {\n\tid = 2\n\tname = "STATE_2"\n\tmanpower = 8000\n\tstate_category = town\n\tprovinces = { 2 3 }\n'
  + '\thistory = {\n\t\towner = AAA\n\t\tcontroller = BBB\n\t\tadd_core_of = CCC\n\t\tvictory_points = { 3 5 }\n\t}\n}\n';

// THE LAYER BELOW ships state 2 exactly as the mod does, and the province rows too. That is deliberate and it is what
// the owner's world looks like: it makes seaProvinceInStateIsTheModsOwn answer NO for province 3, so neither
// non_land_province_in_state nor fixSeaProvinceLeftovers touches it before the region pass ever runs, and the sea in
// state 2 reaches the carve exactly as it did on his map.
lib.write(world.GAME, {
  "map/provinces.bmp": lib.bmp24(256, 256, (x, y) => COL[at(x, y)]),
  "map/definition.csv": DEF,
  "map/buildings.txt": BUILD,
  "map/strategicregions/1-Sea.txt": lib.region(1, "1"),
  "map/strategicregions/2-Land.txt": lib.region(2, "2 3 4 5"),
  "history/states/1-A.txt": lib.st(1, "4"),
  "history/states/2-B.txt": STATE2,
  "history/states/3-C.txt": "# blank\n",
});

// THE MOD: its own copy of state 2 (so the carve may cut it — #auto-fix-leaves-an-inherited-fractioned-region) and its
// own strategic regions, which is what cuts province 3 off region 1.
const MOD_FILES = {
  "map/strategicregions/1-R.txt": lib.region(1, "1 2 3 4"),
  "map/strategicregions/2-R.txt": lib.region(2, "5"),
  "history/states/2-B.txt": STATE2,
};
const DESC = 'name="c3 sea carve"\nsupported_version="1.*"\nreplace_path="map/strategicregions"\n';

const rulesOf = (v) => { const t = {}; for (const p of (v && v.problems) || []) t[p.rule] = (t[p.rule] || 0) + 1; return t; };
const fatalRules = (v) => Object.keys(rulesOf(v)).filter((r) => isFatalRule(r)).sort();
const frac = (b) => ((b && b.fixes) || {}).fractionedRegions || {};
const stateFilesOf = (mod) => {
  const dir = path.join(mod, "history", "states");
  const out = {};
  for (const f of (fs.existsSync(dir) ? fs.readdirSync(dir) : [])) out[f] = fs.readFileSync(path.join(dir, f), "utf8");
  return out;
};
const provincesIn = (text) => {
  const m = /provinces\s*=\s*\{([^}]*)\}/.exec(text || "");
  return m ? m[1].trim().split(/\s+/).filter(Boolean).map(Number) : [];
};
const blockOf = (texts, id) => Object.values(texts).find((t) => new RegExp(`(?:^|\\n)\\s*id\\s*=\\s*${id}\\b`).test(t)) || "";
/** Every state the MOD defines, and which of them own no land — derived from the files and definition.csv, never typed. */
const landIds = new Set(DEF.split(/\r?\n/).map((l) => l.split(";")).filter((c) => c[4] === "land").map((c) => Number(c[0])));
const waterOnlyStates = (texts) => Object.entries(texts)
  .map(([f, t]) => ({ f, id: Number((/(?:^|\n)\s*id\s*=\s*(\d+)/.exec(t) || [])[1]), provinces: provincesIn(t) }))
  .filter((s) => Number.isFinite(s.id) && s.provinces.length && !s.provinces.some((p) => landIds.has(p)));

(async () => {
  let srv = null;
  try {
    srv = await lib.startServer(createApp);

    console.log("1. ⭐⭐⭐ CONTROL: the shape — a SEA province cut off from its region, in a state that also holds land");
    const mod = world.mod("c3 sea carve", { "descriptor.mod": DESC, ...MOD_FILES });
    const before = await srv.validate(mod);
    {
      const r = rulesOf(before);
      rec("validate names sea province 3 as cut off, and that is FATAL",
        lib.idsOf(before, "fractioned_naval_region").join(",") === "3" && isFatalRule("fractioned_naval_region"),
        { frac: lib.idsOf(before, "fractioned_naval_region"), rules: r });
      rec("⭐ CONTROL: no state owns only water before the click", waterOnlyStates(stateFilesOf(mod)).length === 0, waterOnlyStates(stateFilesOf(mod)));
      rec("⭐ CONTROL: the sea in state 2 is the layer below's, so nothing before the region pass may take it out",
        !r.non_land_province_in_state && !r.state_owns_no_land, r);
      rec("…and state 2 does hold the sea province the fixture is about", provincesIn(blockOf(stateFilesOf(mod), 2)).join(",") === "2,3",
        provincesIn(blockOf(stateFilesOf(mod), 2)));
    }

    console.log("\n2. ⭐⭐⭐ ONE CLICK clears the fatal WITHOUT leaving a state that owns no land");
    const click1 = await srv.autoFix(mod);
    const after = await srv.validate(mod);
    const texts = stateFilesOf(mod);
    const f1 = frac(click1.body);
    {
      const r = rulesOf(after);
      rec("⭐⭐ the fractioned region is gone", !r.fractioned_naval_region, r);
      rec("⭐⭐⭐ NO state owns only water — the defect this file is named for", waterOnlyStates(texts).length === 0, waterOnlyStates(texts));
      rec("⭐⭐⭐ …so validate reports no state_owns_no_land", !r.state_owns_no_land, r);
      rec("⭐⭐ …and no sea province is left inside any state the mod defines", !r.non_land_province_in_state, r);
      rec("the click leaves NO rule the fatal set calls refuses-to-load", fatalRules(after).length === 0, { fatal: fatalRules(after), rules: r });
      rec("the click did move the cut-off province's region", f1.moved === 1, f1);
    }

    console.log("\n3. ⭐⭐⭐ The water was taken OUT of state 2, whole, and the land it kept is untouched");
    {
      const s2 = blockOf(texts, 2);
      rec("state 2 now holds only its land province", provincesIn(s2).join(",") === "2", { provinces: provincesIn(s2), s2 });
      rec("⭐⭐ the victory point the sea province carried went with it — nothing left naming a province the state dropped",
        !/victory_points/.test(s2), s2);
      rec("⭐⭐ …and who state 2 is was not touched: owner, controller and core all stand",
        /owner\s*=\s*AAA/.test(s2) && /controller\s*=\s*BBB/.test(s2) && /add_core_of\s*=\s*CCC/.test(s2), s2);
      rec("⭐⭐ …and its people stayed with it: no share was split off to water",
        /manpower\s*=\s*8000/.test(s2), s2);
      rec("⭐⭐⭐ NO state was minted for the water", !f1.statesMade, { statesMade: f1.statesMade, handedToBase: f1.handedToBase });
      rec("⭐⭐ …and the click SAYS it took water out of a state, rather than doing it in silence",
        Array.isArray(f1.seaTakenOutOfState) && f1.seaTakenOutOfState.length === 1
        && f1.seaTakenOutOfState[0].from === 2 && f1.seaTakenOutOfState[0].provinces.join(",") === "3",
        f1.seaTakenOutOfState);
      rec("no state file was minted at all — the mod still defines the one state it shipped",
        Object.keys(texts).length === 1, Object.keys(texts));
    }

    console.log("\n4. ⭐⭐ A SECOND click has nothing left to do — the first one settled it");
    {
      const t0 = lib.tree(mod);
      const click2 = await srv.autoFix(mod);
      const t1 = lib.tree(mod);
      const f2 = frac(click2.body);
      rec("the second click moves no region and mints no state", !f2.moved && !f2.statesMade, f2);
      rec("⭐⭐ …and writes nothing", lib.written(t0, t1).length === 0, lib.written(t0, t1));
      const again = await srv.validate(mod);
      rec("…and validate still reports no state that owns no land", !rulesOf(again).state_owns_no_land, rulesOf(again));
    }
  } catch (e) {
    rec("the test ran to the end", false, (e && e.stack) || String(e));
  } finally {
    if (srv) srv.close();
    world.cleanup();
  }

  console.log(`\n${fails.length ? "FAIL" : "PASS"}  ${checks - fails.length}/${checks} checks`);
  if (fails.length) { for (const f of fails) console.log("  - " + f); process.exit(1); }
})();
