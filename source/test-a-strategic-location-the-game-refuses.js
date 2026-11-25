// ⭐⭐⭐ THE GAME IS THE ORACLE: twelve error.log lines Nova had no rule for. #a-strategic-location-the-game-refuses
//
// On 2026-09-16 the owner launched a world built entirely through Nova (new mod → Delete map → Generate land →
// Auto-fix ×2) WITHOUT -debug. Nova had called it 3 problems, 1 error, 0 fatal. It loaded, reached the menu and
// started a 1936 singleplayer game — and error.log carried twelve lines about a system Nova does not read at all:
//
//   strategic_locations_effect.cpp:51  "Strategic location for province N is in wrong state scope."
//       provinces 11932 (×2), 13041, 13021, 7393, 7251 (×2)          — seven lines
//   province.cpp:1726  "Building: Coastal Fort did not exist or is invalid in the province: N"
//       provinces 10124, 13025, 3995, 4357  · and "Naval Base … 12140"  — five lines
//
// WHAT A STRATEGIC LOCATION IS (established, not assumed): common/strategic_locations/documentation.md —
// "Create a strategic location that contains province buildings extra max level value". A named bundle such as
// vanilla's `natural_harbor = { naval_base = 2 }`, handed to ONE province from a state's history:
//     strategic_province_location = { natural_harbor = 12140 }
// hoi4.exe 1.19.2 carries `strategic_province_location` and `strategic_state_location` as whole strings; the bare
// `strategic_location` of the in-game documentation string is not a token at all.
//
// WHY EACH LINE FIRED — measured against the installed mod, 9 of 9 and 7 of 7:
//   • 0x14051AF6B looks the effect's province up in the state's own province array and, when it is not there, logs
//     line 0x33 = 51. The mod's states carry exactly seven `strategic_province_location` entries whose province is
//     not in their `provinces = { }` — 11932 twice, 13041, 13021, 7393, 7251 twice — which is the log, id for id
//     and count for count. Its three out-of-scope `strategic_state_location` entries (11932, 13031, 10206) are
//     named ZERO times, so only the province effect is reported here.
//   • For an in-scope entry, 0x140E6C9C5 looks the bundle's building up on the province and logs line 0x6BE = 1726
//     when it is not there. Five in-scope entries name a bundle granting coastal_bunker or naval_base on a province
//     the mod's definition.csv marks NOT coastal — 10124, 13025, 3995, 4357, 12140 — which is the log exactly
//     ("Coastal Fort" ×4, "Naval Base" ×1). The same buildings on a province still marked coastal (12003, 13071,
//     2489) and a `bunker` bundle, which carries no only_costal, on a non-coastal one (12103) are named zero times.
//
// Both are WARNINGS: the game logged them, loaded, and played. Same shape and same severity as vp_not_in_state and
// province_building_not_in_state, whose ownership gate they share.
//
// Run: node test-a-strategic-location-the-game-refuses.js
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (detail == null ? "" : "   " + (typeof detail === "string" ? detail : JSON.stringify(detail))).slice(0, 360));
  if (!ok) fails.push(label);
};

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-stratloc-"));
process.env.NOVA_HOME_DIR = path.join(ROOT, "home");
fs.mkdirSync(process.env.NOVA_HOME_DIR, { recursive: true });
const M = require("./map-data.js");
const { isFatalRule, mapRuleLabel, mapRuleFixHint } = require("./public/map-rule-labels.js");
const SCOPE = "strategic_location_not_in_state";
const COAST = "strategic_location_building_needs_coast";
const NOGAME = path.join(ROOT, "no-game");
const GAME = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
const W = "D:/SteamLibrary/steamapps/workshop/content/394360/";
const SHIPPING = { vanilla: GAME, MD: W + "2777392649", R56: W + "820260968", OWB: W + "2265420196", NV: W + "1827273767", RoN: W + "2026448968" };

// ── the fixture: two bundles that need a coast, one that does not ────────────────────────────────────────────
const LOCATIONS = [
  "harbour_bundle = {", "\tnaval_base = 2", "}", "",
  "fort_bundle = {", "\tcoastal_bunker = 2", "}", "",
  "inland_bundle = {", "\tbunker = 2", "}", "",
].join("\n");
// Shaped like vanilla's common/buildings: one `buildings = { … }` wrapper, level_cap nested inside each building
// so a nested block cannot contribute a flag of its own.
const BUILDINGS = [
  "buildings = {", "",
  "\tnaval_base = {", "\t\tonly_costal = yes", "\t\tis_port = yes", "\t\tlevel_cap = { province_max = 10 }", "\t}", "",
  "\tcoastal_bunker = {", "\t\tonly_costal = yes", "\t\tlevel_cap = { province_max = 10 }", "\t}", "",
  "\tbunker = {", "\t\tlevel_cap = { province_max = 10 }", "\t}", "",
  "}", "",
].join("\n");
// province -> coastal. 3, 7 and 8 have lost their coast.
const COASTAL = { 1: true, 2: true, 3: false, 4: true, 5: true, 6: true, 7: false, 8: false, 9: true };
const definitionCsv = (coastal) => {
  const rows = ["0;0;0;0;land;false;unknown;0"];
  for (let p = 1; p <= 9; p++) rows.push(`${p};${p * 20};0;0;land;${coastal[p] ? "true" : "false"};plains;1`);
  return rows.join("\n") + "\n";
};
const state = (id, provinces, historyLines) => [
  "state = {", `\tid = ${id}`, `\tname = "STATE_${id}"`, "\tmanpower = 1000", "\tstate_category = rural",
  `\tprovinces = { ${provinces.join(" ")} }`, "\thistory = {", `\t\towner = A${id}A`,
  ...historyLines.map((l) => "\t\t" + l), "\t}", "}", "",
].join("\n");
const STATES = {
  // state 1 points a bundle at province 5, which state 2 holds → the scope rule.
  "1-A.txt": state(1, [1, 2], [
    "strategic_province_location = { harbour_bundle = 5 }",
  ]),
  // state 2's own provinces: 3 has lost its coast.
  "2-B.txt": state(2, [3, 4, 5], [
    "strategic_province_location = { fort_bundle = 3 }",      // coastal_bunker on a province with no coast → the coast rule
    "strategic_province_location = { inland_bundle = 3 }",    // bunker carries no only_costal → the Palau 12103 case, silent
    "strategic_province_location = { harbour_bundle = 4 }",   // 4 is still coastal → the Malta / Canary case, silent
    "strategic_province_location = { no_such_bundle = 3 }",   // a bundle nothing defines says nothing about the province
  ]),
  // the STATE effect, which the launch proved is not checked either way.
  "3-C.txt": state(3, [6, 7], [
    "strategic_state_location = { fort_bundle = 9 }",         // out of scope, state effect
    "strategic_state_location = { fort_bundle = 7 }",         // in scope, no coast, state effect
  ]),
  // a DATED block speaks for a later bookmark, not for the start date these messages speak for.
  "4-D.txt": state(4, [8, 9], [
    "1939.1.1 = {",
    "\tstrategic_province_location = { harbour_bundle = 1 }", // out of scope, dated
    "\tstrategic_province_location = { fort_bundle = 8 }",    // in scope, no coast, dated
    "}",
  ]),
};
function writeRoot(root, { descriptor = null, states = STATES, coastal = COASTAL, common = true, map = true } = {}) {
  const mk = (rel, c) => { const p = path.join(root, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, c); };
  if (descriptor) mk("descriptor.mod", descriptor);
  if (map) mk("map/definition.csv", definitionCsv(coastal));
  if (common) { mk("common/strategic_locations/00_locations.txt", LOCATIONS); mk("common/buildings/00_buildings.txt", BUILDINGS); }
  for (const [f, body] of Object.entries(states)) mk("history/states/" + f, body);
  return root;
}
const mine = (modRoot, gameRoot, rule) =>
  M.validateMapModel(M.buildMapModel({ modRoot, gameRoot, dependencyRoots: [], cacheStableLayers: false }))
    .filter((p) => p.rule === rule);

try {
  console.log("1. THE POSITIVE CONTROL — each condition is reported once, and nothing else is");
  {
    const mod = writeRoot(path.join(ROOT, "mod"), { descriptor: 'name="SL"\nreplace_path="history/states"\nreplace_path="map"\n' });
    const scope = mine(mod, NOGAME, SCOPE);
    rec("⭐⭐⭐ the out-of-scope entry is reported once", scope.length === 1, scope.map((x) => [x.stateId, x.province, x.location]));
    const s = scope[0] || {};
    rec("⭐⭐ …for province 5 in state 1", s.stateId === 1 && s.province === 5, s);
    rec("…naming the state that does hold it", /state 2\b/.test(String(s.message)), String(s.message).slice(0, 220));
    rec("⭐ …quoting what HOI4 logs", /Strategic location for province 5 is in wrong state scope/.test(String(s.message)), String(s.message).slice(0, 260));
    rec("⭐ …and saying the extra levels are never applied", /never applied/.test(String(s.message)));
    rec("…as a warning", s.severity === "warning", s.severity);

    const coast = mine(mod, NOGAME, COAST);
    rec("⭐⭐⭐ the coast-only entry is reported once", coast.length === 1, coast.map((x) => [x.stateId, x.province, x.location, x.buildings]));
    const c = coast[0] || {};
    rec("⭐⭐ …for province 3 in state 2", c.stateId === 2 && c.province === 3, c);
    rec("⭐⭐ …naming the building it derived from common/buildings, not a typed-in list",
      Array.isArray(c.buildings) && c.buildings.length === 1 && c.buildings[0] === "coastal_bunker", c.buildings);
    rec("⭐ …quoting what HOI4 logs", /did not exist or is invalid in the province: 3/.test(String(c.message)), String(c.message).slice(0, 300));
    rec("…as a warning", c.severity === "warning", c.severity);

    rec("⚠️ a bundle whose buildings need no coast is NOT reported (the Palau 12103 case)", !coast.some((x) => x.location === "inland_bundle"), coast.map((x) => x.location));
    rec("⚠️ the same bundle on a province that IS coastal is NOT reported (the Malta / Canary case)", !coast.some((x) => x.province === 4), coast.map((x) => x.province));
    rec("⚠️ a bundle name nothing defines is NOT reported", !coast.some((x) => x.location === "no_such_bundle"), coast.map((x) => x.location));
    rec("⭐⭐ strategic_state_location is NOT reported — the launch named zero of its three", !scope.some((x) => x.stateId === 3) && !coast.some((x) => x.stateId === 3), [scope, coast]);
    rec("⚠️ a DATED entry is NOT reported", !scope.some((x) => x.stateId === 4) && !coast.some((x) => x.stateId === 4), [scope, coast]);

    for (const r of [SCOPE, COAST]) {
      rec(`⭐⭐ '${r}' is not in the fatal set — the owner's launch loaded and played with all twelve`, isFatalRule(r) === false);
      rec(`'${r}' has a label a modder can read`, mapRuleLabel(r) !== r && mapRuleLabel(r).length > 15, mapRuleLabel(r));
      rec(`'${r}' has a fix hint`, mapRuleFixHint(r).length > 15, mapRuleFixHint(r).slice(0, 120));
    }
  }

  console.log("\n2. ⛔ #inherited-problem-not-yours — told only about what it could have caused");
  {
    const base = writeRoot(path.join(ROOT, "base"), { coastal: { ...COASTAL, 3: true } });   // base: province 3 still coastal
    const blind = writeRoot(path.join(ROOT, "blind"), { descriptor: 'name="Blind"\n', states: {}, common: false, map: false });
    rec("⭐⭐ an add-on shipping neither the state nor the row is told about neither",
      mine(blind, base, SCOPE).length === 0 && mine(blind, base, COAST).length === 0, [mine(blind, base, SCOPE), mine(blind, base, COAST)]);
    const holder = writeRoot(path.join(ROOT, "holder"), { descriptor: 'name="Holder"\n', states: { "2-B.txt": STATES["2-B.txt"] }, common: false, map: false });
    rec("⭐ an add-on shipping the state that HOLDS the province is told — it could have moved it", mine(holder, base, SCOPE).length === 1, mine(holder, base, SCOPE));
    // The owner's own shape: the state file is inherited, and it is the mod's definition.csv that took the coast away.
    const drowner = writeRoot(path.join(ROOT, "drowner"), { descriptor: 'name="Drowner"\n', states: {}, common: false });
    const d = mine(drowner, base, COAST);
    rec("⭐⭐⭐ an add-on that only took the province's coast away IS told — the row is its own", d.length === 1 && d[0].province === 3, d);

    // ⚠️ A "nothing happened" probe needs a positive control, or it proves nothing. This layer HAS both problems
    // already — province 3 has no coast and state 1 already points outside itself — so the silence below is the
    // gate's doing and not the fixture's.
    const layer = writeRoot(path.join(ROOT, "layer"));
    rec("THE CONTROL: that layer, edited directly, reports both",
      mine(layer, layer, SCOPE).length === 1 && mine(layer, layer, COAST).length === 1, [mine(layer, layer, SCOPE).length, mine(layer, layer, COAST).length]);
    const inheritor = writeRoot(path.join(ROOT, "inheritor"), { descriptor: 'name="Inheritor"\n', states: {}, common: false, map: false });
    rec("⭐⭐⭐ …and an add-on that inherits both is told about neither",
      mine(inheritor, layer, SCOPE).length === 0 && mine(inheritor, layer, COAST).length === 0, [mine(inheritor, layer, SCOPE), mine(inheritor, layer, COAST)]);
  }

  console.log("\n3. ⭐⭐ THE REAL DATA — vanilla's own state 526, with the two edits the owner's flow made");
  if (!fs.existsSync(path.join(GAME, "history", "states", "526-Okinawa.txt"))) console.log("  ..   (the base game is not installed)");
  else {
    // Vanilla 526 lists provinces 1123 7115 10124 11932 and carries four strategic-location entries: three
    // `strategic_province_location` (11932, 10124, 11932) and one `strategic_state_location` (11932). Nova's flow
    // dropped 11932 out of the state and turned 10124 into sea — and hoi4.exe logged 11932 twice and 10124 once.
    const vanillaState = fs.readFileSync(path.join(GAME, "history", "states", "526-Okinawa.txt"), "utf8");
    const dropped = vanillaState.replace(/(provinces\s*=\s*\{)([^}]*)\}/, (_m, head, body) => head + body.replace(/(?<![0-9])11932(?![0-9])/, "") + "}");
    rec("the fixture really dropped 11932 from the province list, and changed nothing else",
      dropped !== vanillaState && !/provinces\s*=\s*\{[^}]*11932/.test(dropped) && /11932/.test(dropped), dropped.length - vanillaState.length);
    const def = fs.readFileSync(path.join(GAME, "map", "definition.csv"), "latin1")
      .split(/\r?\n/).map((l) => (/^10124;/.test(l) ? l.replace(/;land;true;[^;]*;/, ";sea;false;ocean;") : l)).join("\n");
    rec("…and really turned 10124 into sea", /^10124;.*;sea;false;/m.test(def));
    const mod = path.join(ROOT, "okinawa");
    fs.mkdirSync(path.join(mod, "history", "states"), { recursive: true });
    fs.mkdirSync(path.join(mod, "map"), { recursive: true });
    fs.writeFileSync(path.join(mod, "descriptor.mod"), 'name="Okinawa"\n');
    fs.writeFileSync(path.join(mod, "history", "states", "526-Okinawa.txt"), dropped);
    fs.writeFileSync(path.join(mod, "map", "definition.csv"), def);
    const scope = mine(mod, GAME, SCOPE), coast = mine(mod, GAME, COAST);
    rec("⭐⭐⭐ province 11932 is reported TWICE — the two province effects, not the state one",
      scope.length === 2 && scope.every((x) => x.province === 11932 && x.stateId === 526), scope.map((x) => [x.stateId, x.province, x.location]));
    rec("⭐⭐⭐ province 10124 is reported once, for the coastal fort the game refused",
      coast.length === 1 && coast[0].province === 10124 && coast[0].buildings.join() === "coastal_bunker", coast.map((x) => [x.province, x.buildings]));
    rec("⭐ …and the bundle names are vanilla's own", scope.map((x) => x.location).sort().join() === "defensible_coastline,defensive_chokepoint", scope.map((x) => x.location));
  }

  console.log("\n4. ⭐⭐⭐ NO SHIPPING MAP GAINS A PROBLEM — every one of these launches");
  {
    let seen = 0;
    for (const [key, root] of Object.entries(SHIPPING)) {
      if (!fs.existsSync(path.join(root, "history", "states"))) { console.log("  ..   (" + key + " is not installed)"); continue; }
      seen++;
      const model = M.buildMapModel({ modRoot: key === "vanilla" ? null : root, gameRoot: GAME, dependencyRoots: [], cacheStableLayers: true });
      const probs = M.validateMapModel(model);
      let entries = 0, dated = 0;
      for (const st of model.states || []) for (const sl of st.strategicLocations || []) { entries++; if (sl.dated) dated++; }
      const hits = probs.filter((p) => p.rule === SCOPE || p.rule === COAST);
      rec(`⭐⭐ ${key}: ${entries} strategic-location entries, ${dated} dated, 0 problems`, hits.length === 0 && dated === 0, hits.map((x) => [x.rule, x.stateId, x.province]));
    }
    rec("at least the base game was measured", seen >= 1, seen);
  }
} catch (e) {
  rec("harness threw: " + (e && e.stack ? e.stack.split("\n").slice(0, 6).join(" | ") : e), false);
} finally {
  try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
  console.log(`\n=== a strategic location the game refuses: ${checks} checks, ${fails.length} failed ===`);
  if (fails.length) { fails.forEach((f) => console.log("   FAILED: " + f)); process.exitCode = 1; }
}
