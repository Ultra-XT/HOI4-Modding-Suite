// A province cut off from its strategic region that no neighbouring region can take together with its whole state is
// carved out into a STATE OF ITS OWN, and moved — so one "Auto-fix all" ends on a map HOI4 will load.
// #a-cut-off-piece-gets-a-state-of-its-own
//
// THE DEFECT. fractioned_naval_region is FATAL (isFatalRule: "refuses-to-load") and it gates Save. A strategic region
// holds whole states, so fixFractionedRegions moves a cut-off piece only together with the state its land belongs to —
// and when no neighbouring region can take that whole state without being cut in two itself, the click reported no work,
// wrote nothing, and said it could not repair the province. There was no button anywhere in Nova that repaired it, while
// the rule's own message told the modder to do by hand exactly what Nova would not: "Move each into a state of the region
// it touches, or give it a state of its own, then pick that region in the province inspector".
//
// MEASURED on the owner's own workflow — Delete map, then Generate land, then Auto-fix all — over a copy of Millennium
// Dawn. Delete map retypes every land province to sea, so all 222 of MD's strategic regions hold sea and hoi4.exe checks
// every one of them; the 39 provinces sitting in a LAND exclave of a pure-land region, perfectly legal until that moment
// because the game never checks a region with no sea share, become fragments there and then. MD as it ships has none
// (113 checked regions, 0 fragments, scratchpad probe-delete-map.js). Generate land, at the page's own default of 35% of
// the ocean (5,726 provinces into 813 states, 189s), leaves all 39 exactly as they are. Then, on the base commit, one
// Auto-fix moved 16 of them with their states, wrote 25 files and left 23: fractioned_naval_region was the ONLY rule left
// on the screen, fatal and Save-gated, and the second click wrote 0 of 5,238 files and left it there. With the carve, one
// click moves all 39 in three passes — 17 carried by a state carved for them — writes 74 files, and validate then reports
// NO map problem at all; the second click writes 0 files.
//
// THE DECISION. Giving the piece a state of its own is the deterministic half of Nova's own message: the new state keeps
// the owner, controller, cores and claims of the state it was carved from, verbatim, and its share of that state's
// manpower — so nothing about who holds the land is decided by a fixer. Handing the province to a NEIGHBOURING state,
// the other half of the message, stays the modder's decision. And the one state Auto-fix will not carve is a state the
// mod does not ship: cutting that in two would copy a lower layer's file into the mod, which is the same rule
// #auto-fix-leaves-an-inherited-fractioned-region already applies to the fragment itself.
//
// Requests are the page's: GET /api/map/validate?modPath and POST /api/map/auto-fix { modPath }.
"use strict";

const fs = require("fs");
const path = require("path");
const lib = require("./testlib-two-layer-map.js");

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (ok || detail == null ? "" : "   -> " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 900)));
  if (!ok) fails.push(label);
};

const world = lib.makeWorld("b14-carve");
// a second language below, as the base game has ten: the carved state's name must reach it too (review of e1f3586, finding 9 —
// with English alone in the fixture, the carve could go back to naming English only and nothing here would notice)
lib.write(world.GAME, { "localisation/german/base_l_german.yml": `${String.fromCharCode(0xfeff)}l_german:\n STATE_1:0 "Erdeins"\n` });
const { createApp } = require("./server.js");

// The same 256x256 map test-a-cut-off-province-moves-with-its-whole-state-or-auto-fix-says-it-cannot.js uses, because it is
// the shape where no neighbouring region can take the whole state. Top half: sea 1 (x < 128) and sea 5 (x >= 128), with the
// island, land 3, inside sea 5. Bottom half: land 2 (32 <= x < 96) with land 4 either side. Land 2 touches sea 1 and land 4
// only, so a region holding sea 5 cannot also hold land 2 in one piece.
const COL = { 1: [0, 0, 200], 2: [200, 0, 0], 3: [0, 200, 0], 4: [200, 200, 0], 5: [0, 0, 120] };
const at = (x, y) => (y < 128 ? (x >= 192 && x < 224 && y >= 32 && y < 64 ? 3 : x < 128 ? 1 : 5) : (x >= 32 && x < 96 ? 2 : 4));
const DEF = ["0;0;0;0;land;false;unknown;0", "1;0;0;200;sea;false;ocean;0", "2;200;0;0;land;true;plains;1",
  "3;0;200;0;land;true;plains;1", "4;200;200;0;land;true;plains;1", "5;0;0;120;sea;false;ocean;0"].join("\r\n") + "\r\n";
const BUILD = [
  "1;air_base;176.00;9.50;56.00;0.00;0", "1;rocket_site_spawn;176.00;9.50;56.00;0.00;0",
  "2;air_base;48.00;9.50;56.00;0.00;0", "2;rocket_site_spawn;48.00;9.50;56.00;0.00;0",
  "2;naval_base_spawn;48.00;9.50;126.00;0.00;1", "1;naval_base_spawn;176.00;9.50;126.00;0.00;5",
  "2;naval_base_spawn;208.00;9.50;223.00;0.00;5",
].join("\n");
// State 2 = { 2 3 }: owned by AAA, OCCUPIED by BBB, cored by CCC — three different tags, so a new state that merely copied
// "the owner" would be visibly wrong, and one created through createState's own owner argument would mint `add_core_of = AAA`
// for land nobody cores (#map-created-country-cores-nothing). The island carries the state's only victory point.
const STATE2 = `state = {\n\tid = 2\n\tname = "STATE_2"\n\tmanpower = 8000\n\tstate_category = town\n\tprovinces = { 2 3 }\n`
  + `\thistory = {\n\t\towner = AAA\n\t\tcontroller = BBB\n\t\tadd_core_of = CCC\n\t\tvictory_points = { 3 5 }\n\t}\n}\n`;
const MAPFILES = {
  "map/provinces.bmp": lib.bmp24(256, 256, (x, y) => COL[at(x, y)]),
  "map/definition.csv": DEF,
  "map/buildings.txt": BUILD,
};
const REGIONS_CUT = { "map/strategicregions/1-R.txt": lib.region(1, "1 2 3 4"), "map/strategicregions/2-R.txt": lib.region(2, "5") };
const REGIONS_WHOLE = { "map/strategicregions/1-R.txt": lib.region(1, "1 2 4"), "map/strategicregions/2-R.txt": lib.region(2, "5 3") };
const STATES = { "history/states/1-S.txt": lib.st(1, "4"), "history/states/2-S.txt": STATE2 };

const only = (v, rule) => ((v && v.problems) || []).filter((p) => p.rule === rule);
const frac = (b) => ((b && b.fixes) || {}).fractionedRegions || {};
const regionWork = (b) => {
  const f = (b && b.fixes) || {};
  return { fractionedMoved: (f.fractionedRegions || {}).moved || 0, statesAligned: (f.regionOverlaps || {}).statesAligned || 0, provincesMoved: (f.regionOverlaps || {}).provincesMoved || 0 };
};
const NO_WORK = JSON.stringify({ fractionedMoved: 0, statesAligned: 0, provincesMoved: 0 });
const stateFiles = (mod) => {
  const dir = path.join(mod, "history", "states");
  const out = {};
  for (const f of (fs.existsSync(dir) ? fs.readdirSync(dir) : [])) out[f] = fs.readFileSync(path.join(dir, f), "utf8");
  return out;
};
/** Every state's manpower, read off the files themselves — derived, never typed, so a correct fix cannot fail on a number. */
const manpowerTotal = (texts) => Object.values(texts).reduce((n, t) => {
  let sum = 0; for (const m of t.matchAll(/(?:^|[^A-Za-z0-9_])manpower\s*=\s*(\d+)/g)) sum += +m[1];
  return n + sum;
}, 0);
const blockOf = (texts, id) => Object.values(texts).find((t) => new RegExp(`\\bid\\s*=\\s*${id}\\b`).test(t)) || "";
const buildingRows = (mod) => fs.readFileSync(path.join(mod, "map", "buildings.txt"), "utf8").split(/\r?\n/).filter(Boolean).map((l) => l.split(";"));
const provinceToState = async (srv, mod) => {
  const m = await fetch(`${srv.base}/api/map/model?modPath=${encodeURIComponent(mod)}`).then((r) => r.json());
  return (m && m.provinceToState) || {};
};
const regionOf = async (srv, mod, p) => {
  const m = await fetch(`${srv.base}/api/map/model?modPath=${encodeURIComponent(mod)}`).then((r) => r.json());
  return m && m.provinceToRegion ? m.provinceToRegion[p] : undefined;
};

(async () => {
  let srv = null;
  let carveFixes = null, refusedFixes = null;
  try {
    srv = await lib.startServer(createApp);

    console.log("1. ⭐⭐⭐ The piece no region can take with its whole state is carved out into a state of its own");
    {
      const mod = world.mod("carve island", {
        "descriptor.mod": `name="carve island"\nsupported_version="1.*"\nreplace_path="history/states"\nreplace_path="map/strategicregions"\n`,
        ...MAPFILES, ...REGIONS_CUT, ...STATES,
      });
      const before = await srv.validate(mod);
      const gateBefore = await lib.saveGate(before);
      rec("CONTROL: validate names island 3 as cut off, and Save stops for it", lib.idsOf(before, "fractioned_naval_region").join(",") === "3" && gateBefore.crashes === 1 && gateBefore.armed,
        { frac: lib.idsOf(before, "fractioned_naval_region"), gate: gateBefore.status });
      const before2 = stateFiles(mod);
      const manpowerBefore = manpowerTotal(before2);
      rec("CONTROL: the island is in state 2 with land 2, and state 2 is the only state that owns it", Object.keys(before2).length === 2 && /provinces\s*=\s*\{\s*2\s+3\s*\}/.test(blockOf(before2, 2)), Object.keys(before2));

      const t0 = lib.tree(mod);
      const c1 = await srv.autoFix(mod);
      carveFixes = (c1.body && c1.body.fixes) || {};
      const f = frac(c1.body);
      rec("click 1 is answered", c1.status === 200 && c1.body && c1.body.ok === true, c1.body);
      rec("⭐⭐⭐ …and it carved a state for the island instead of leaving it", Array.isArray(f.statesMade) && f.statesMade.length === 1 && f.statesMade[0].from === 2 && f.statesMade[0].provinces === 1, f);
      rec("⭐⭐ …nothing is reported as unrepairable any more", (f.unrepairable || []).length === 0 && (f.splitErrors || []).length === 0, f);
      rec("⭐⭐ …and the island moved into the region of the sea it touches", (await regionOf(srv, mod, 3)) === 2, await regionOf(srv, mod, 3));
      rec("…while land 2 stayed where it was", (await regionOf(srv, mod, 2)) === 1, await regionOf(srv, mod, 2));

      const newId = f.statesMade && f.statesMade[0] ? f.statesMade[0].id : -1;
      const after = stateFiles(mod);
      const p2s = await provinceToState(srv, mod);
      rec("⭐⭐⭐ the island is the new state's only province, and state 2 keeps the rest", p2s[3] === newId && p2s[2] === 2, { newId, p2s });
      const nb = blockOf(after, newId), pb = blockOf(after, 2);
      rec("⭐⭐⭐ the new state IS the state it was carved from: same owner, same occupier, same core", /owner\s*=\s*AAA/.test(nb) && /controller\s*=\s*BBB/.test(nb) && /add_core_of\s*=\s*CCC/.test(nb), nb);
      rec("⭐⭐⭐ …and no core was minted for the owner that nobody cored", !/add_core_of\s*=\s*AAA/.test(nb) && !/add_core_of\s*=\s*BBB/.test(nb), nb);
      rec("⭐⭐ the province's own history went with it: the victory point is the new state's, not state 2's", /victory_points\s*=\s*\{\s*3\s+5\s*\}/.test(nb) && !/victory_points/.test(pb), { nb, pb });
      rec("⭐⭐ manpower is split, not minted: the map still holds the same people", manpowerTotal(after) === manpowerBefore && /manpower\s*=\s*4000/.test(nb) && /manpower\s*=\s*4000/.test(pb),
        { before: manpowerBefore, after: manpowerTotal(after) });
      rec("the new state keeps the category of the state it came from", /state_category\s*=\s*town/.test(nb), nb);
      // #a-new-state-has-no-name — createState writes `name = "STATE_815"` and nothing that says what STATE_815 reads as, so
      // without this the game shows the key on the map and in every list. Both other places that make a state name it.
      const locFile = path.join(mod, "localisation", "english", "replace", "nova_state_names_l_english.yml");
      const locTxt = fs.existsSync(locFile) ? fs.readFileSync(locFile, "utf8") : "";
      const key = ((c1.body.fixes.fractionedRegions.statesMade || [])[0] || {}).name || "";
      const named = c1.body.fixes.fractionedRegions.carvedStateNames || {};
      rec("⭐⭐ the carved state has a NAME, not just a key — the click localises what it created", key === `STATE_${newId}`
        && new RegExp(`(^|\\n)\\s*${key}:\\s*0?\\s*"[A-Z][a-z]{3,10}"`).test(locTxt) && named.written === 1 && !named.error,   // a made-up name (#a-generated-world-names-its-places)
        { key, loc: locTxt.slice(0, 300), said: named });
      const deFile = path.join(mod, "localisation", "german", "replace", "nova_state_names_l_german.yml");
      const deName = (new RegExp(`(?:^|\\n)\\s*${key}:\\s*0?\\s*"([^"]*)"`).exec(fs.existsSync(deFile) ? fs.readFileSync(deFile, "utf8") : "") || [])[1];
      const enName = (new RegExp(`(?:^|\\n)\\s*${key}:\\s*0?\\s*"([^"]*)"`).exec(locTxt) || [])[1];
      rec("⭐⭐ …and the name reaches the other language below, German, with the same text (#a-state-name-in-every-language)", !!enName && deName === enName, { en: enName, de: deName });
      const rows = buildingRows(mod);
      rec("⭐⭐ the new state has the building slots every shipping state has", rows.some((r) => +r[0] === newId && r[1] === "air_base") && rows.some((r) => +r[0] === newId && r[1] === "rocket_site_spawn"), rows.filter((r) => +r[0] === newId).length);
      rec("⭐⭐ …and the island's port went with it, re-keyed off state 2", rows.some((r) => +r[0] === newId && r[1] === "naval_base_spawn" && r[2] === "208.00")
        && !rows.some((r) => +r[0] === 2 && r[2] === "208.00"), rows.filter((r) => r[1] === "naval_base_spawn"));

      const v2 = await srv.validate(mod);
      const gate = await lib.saveGate(v2);
      rec("⭐⭐⭐ after ONE click the region rules are clear and Save is not stopped", only(v2, "fractioned_naval_region").length === 0
        && only(v2, "state_split_strategic_regions").length === 0 && gate.crashes === 0 && !gate.armed, { rules: lib.rulesIn(v2), gate: gate.status });
      rec("…and the click left no empty state and no province in two states behind", only(v2, "empty_state").length === 0 && only(v2, "province_in_two_states").length === 0
        && only(v2, "state_no_air_base_or_rocket_site").length === 0 && only(v2, "state_id_gap").length === 0, lib.rulesIn(v2));
      rec("the click did write (the control for the two checks below)", lib.written(t0, lib.tree(mod)).length > 0, lib.written(t0, lib.tree(mod)));

      const t1 = lib.tree(mod);
      const c2 = await srv.autoFix(mod);
      rec("⭐⭐⭐ click 2 writes NOTHING and reports no region work: the click reaches a fixed point", lib.written(t1, lib.tree(mod)).length === 0
        && JSON.stringify(regionWork(c2.body)) === NO_WORK, { wrote: lib.written(t1, lib.tree(mod)), work: regionWork(c2.body) });
      rec("…and carves nothing a second time", ((frac(c2.body).statesMade) || []).length === 0, frac(c2.body));
    }

    console.log("\n2. ⛔ The same island, when the state to carve is a layer below the mod's — left alone, and said so");
    {
      // The dependency ships the map and the states, with its regions WHOLE. The add-on ships only its own strategic
      // regions, and they are the ones that cut the island off — so the fragment is the add-on's doing, in a state it
      // inherits. Carving that would copy the dependency's state file into the add-on.
      const dep = world.mod("carve base", {
        "descriptor.mod": `name="carve base"\nsupported_version="1.*"\nreplace_path="history/states"\nreplace_path="map/strategicregions"\n`,
        ...MAPFILES, ...REGIONS_WHOLE, ...STATES,
      });
      const addon = world.mod("carve addon", {
        "descriptor.mod": `name="carve addon"\nsupported_version="1.*"\nreplace_path="map/strategicregions"\ndependencies={\n\t"carve base"\n}\n`,
        ...REGIONS_CUT,
      });
      rec("CONTROL: the dependency's own map is whole — it ships no fragment of its own", lib.idsOf(await srv.validate(dep), "fractioned_naval_region").length === 0,
        lib.rulesIn(await srv.validate(dep)));
      const before = await srv.validate(addon);
      rec("CONTROL: the add-on's own regions cut island 3 off, and Save stops for it", lib.idsOf(before, "fractioned_naval_region").join(",") === "3" && (await lib.saveGate(before)).crashes === 1,
        { frac: lib.idsOf(before, "fractioned_naval_region"), rules: lib.rulesIn(before) });
      const t0 = lib.tree(addon), depT0 = lib.tree(dep);
      const c1 = await srv.autoFix(addon);
      refusedFixes = (c1.body && c1.body.fixes) || {};
      const f = frac(c1.body);
      rec("⭐⭐⭐ no state was carved out of the dependency's state 2", ((f.statesMade) || []).length === 0 && Object.keys(stateFiles(addon)).length === 0, { made: f.statesMade, files: Object.keys(stateFiles(addon)) });
      rec("⭐⭐⭐ …and the province is reported as one Auto-fix cannot repair, because the state is inherited", (f.unrepairable || []).map(Number).join(",") === "3"
        && (f.stuckInherited || []).map(Number).join(",") === "3", f);
      rec("⭐⭐ the click wrote nothing into the add-on, and nothing at all into the dependency", lib.written(t0, lib.tree(addon)).length === 0 && lib.written(depT0, lib.tree(dep)).length === 0,
        { addon: lib.written(t0, lib.tree(addon)), dep: lib.written(depT0, lib.tree(dep)) });
      const after = await srv.validate(addon);
      const msg = (only(after, "fractioned_naval_region")[0] || {}).message || "";
      rec("⭐⭐ …and the rule says WHY: the state comes from a layer below, so it is not Auto-fix's to cut up", /Auto-fix cannot repair/.test(msg) && /layer below/.test(msg)
        && /state of its own/.test(msg), msg.slice(-400));
      const t1 = lib.tree(addon);
      await srv.autoFix(addon);
      rec("click 2 writes nothing either", lib.written(t1, lib.tree(addon)).length === 0, lib.written(t1, lib.tree(addon)));
    }

    console.log("\n3. ⭐⭐ The Map Errors popup says what the click carved, and what it left — public/map.js fractionedRepairNote, run on the two clicks above");
    {
      const vm = require("vm");
      const { maskJsComments } = require("./testlib-strip-comments.js");
      const MAP = fs.readFileSync(path.join(__dirname, "public", "map.js"), "utf8");
      const MASKED = maskJsComments(MAP);
      const s = MASKED.indexOf("\n  function fractionedRepairNote(");
      const e = s < 0 ? -1 : MASKED.indexOf("\n  }", s + 1);
      const fnSrc = s < 0 || e < 0 ? "" : MAP.slice(s + 1, e + 4);
      rec("fractionedRepairNote was lifted", fnSrc.length > 100, fnSrc.length);
      const sb = {};
      vm.createContext(sb);
      if (fnSrc) vm.runInContext(fnSrc, sb);
      const f = sb.fractionedRepairNote;
      if (typeof f === "function") {
        const carved = f((carveFixes || {}).fractionedRegions);
        rec("⭐⭐ the carve click's summary says a state was made, and out of which", carved.parts.some((p) => /state of its own/.test(p) && /out of 2/.test(p)) && carved.tail === "", carved);
        const left = f((refusedFixes || {}).fractionedRegions);
        rec("⭐⭐ …and the refused click's summary names province 3 and the reason", /\b3\b/.test(left.tail) && /layer below/.test(left.tail) && left.parts.length === 0, left);
      }
    }
  } catch (e) {
    rec("harness", false, String((e && e.stack) || e));
  } finally {
    if (srv) srv.close();
    world.cleanup();
    console.log(`\n=== a cut-off piece gets a state of its own: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
  }
})();
