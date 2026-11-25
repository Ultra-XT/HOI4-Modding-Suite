// A strategic location on landlocked LAND says whose line it is, instead of telling the modder they wrote it.
// #a-strategic-location-on-landlocked-land-may-not-be-the-modders-line
//
// ⛔ THE DEFECT. strategic_location_building_needs_coast has two shapes and the drowned one already asks whose problem it
// is — three lines apart, `problemIsTheModsOwn(model, st)` chooses between "Nova will not assume you did not mean it" and
// "your mod does not ship this state's file". The LAND shape never adopted anything of the kind. It closed, always, with:
//
//     "…and none of them is deleting a line you wrote on land you still own."
//
// ⚠️ MEASURED on the owner's own workflow, through the page's own endpoints — new mod over the installed base game, own
// the map, POST /api/map/blank-to-sea, POST /api/map/generate-land (4,650 provinces, 35% of the ocean, seed 1), POST
// /api/map/auto-fix twice, GET /api/map/validate. That world gets exactly one of these warnings, and the sentence is
// false about it:
//
//     state 178 is vanilla's Canary Islands, one province, 13071.
//     The mod holds history/states/178-Canary islands.txt ONLY because that same Auto-fix click copied it in to take
//     `13071 = { naval_base = 1 }` out of it — 13071 had lost its coast when Generate land raised its four neighbours.
//     The `strategic_province_location = { natural_harbor = 13071 }` left standing beside it is byte-for-byte the base
//     game's, and natural_harbor's whole content is `naval_base = 2` — the same building, on the same province, refused
//     for the same reason as the port the click had just removed.
//
// So `problemIsTheModsOwn`, which asks about the FILE, says yes, and the modder never typed the line. That is the
// dominant bug shape here — the fix exists next door and one caller never adopted it — with the twist that the
// next-door predicate is not the right one either: the question is about the LINE.
//
// THE DECISION. Nova still does not delete it: which of the three repairs the modder wants is their decision, and on
// LAND "give this one its coast back" is a real repair (that is why strategicLocationClearedByAutoFix is sea-only).
// What changes is the sentence. strategicLocationLineIsTheModsOwn asks whether a layer below declares this same effect,
// location and province for this same state — decidable, and true when there is nobody below to attribute it to.
//
// Run: node test-a-strategic-location-on-landlocked-land-says-whose-line-it-is.js
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (detail == null ? "" : "   " + (typeof detail === "string" ? detail : JSON.stringify(detail))).slice(0, 420));
  if (!ok) fails.push(label);
};

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-slwhose-"));
process.env.NOVA_HOME_DIR = path.join(ROOT, "home");
fs.mkdirSync(process.env.NOVA_HOME_DIR, { recursive: true });
const M = require("./map-data.js");
const COAST = "strategic_location_building_needs_coast";
const NOGAME = path.join(ROOT, "no-game");

// harbour_bundle raises naval_base, exactly as vanilla's natural_harbor does; naval_base is the only_costal building.
const LOCATIONS = ["harbour_bundle = {", "\tnaval_base = 2", "}", ""].join("\n");
const BUILDINGS = ["buildings = {", "", "\tnaval_base = {", "\t\tonly_costal = yes", "\t\tis_port = yes",
  "\t\tlevel_cap = { province_max = 10 }", "\t}", "", "}", ""].join("\n");
// Four LAND provinces. 2 is landlocked — the shape the sentence is about; nothing here is sea, so `drowned` is false
// and the message takes the land branch every time.
const COASTAL = { 1: true, 2: false, 3: true, 4: true };
const definitionCsv = () => ["0;0;0;0;land;false;unknown;0"]
  .concat([1, 2, 3, 4].map((p) => `${p};${p * 40};0;0;land;${COASTAL[p] ? "true" : "false"};plains;1`)).join("\n") + "\n";

const state = (id, provinces, historyLines) => [
  "state = {", `\tid = ${id}`, `\tname = "STATE_${id}"`, "\tmanpower = 1000", "\tstate_category = rural",
  `\tprovinces = { ${provinces.join(" ")} }`, "\thistory = {", `\t\towner = A${id}A`,
  ...historyLines.map((l) => "\t\t" + l), "\t}", "}", "",
].join("\n");
const LOCATION_LINE = "strategic_province_location = { harbour_bundle = 2 }";
const STATE2_WITH = state(2, [1, 2], [LOCATION_LINE]);
const STATE2_WITHOUT = state(2, [1, 2], []);
const STATE1 = state(1, [3, 4], []);

function writeRoot(root, { descriptor = null, state2 = STATE2_WITH, common = true, map = true, states = true } = {}) {
  const mk = (rel, c) => { const p = path.join(root, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, c); };
  if (descriptor) mk("descriptor.mod", descriptor);
  if (map) mk("map/definition.csv", definitionCsv());
  if (common) { mk("common/strategic_locations/00_locations.txt", LOCATIONS); mk("common/buildings/00_buildings.txt", BUILDINGS); }
  if (states) { mk("history/states/1-A.txt", STATE1); if (state2) mk("history/states/2-B.txt", state2); }
  return root;
}
const coastProblems = (modRoot, gameRoot) =>
  M.validateMapModel(M.buildMapModel({ modRoot, gameRoot, dependencyRoots: [], cacheStableLayers: false }))
    .filter((p) => p.rule === COAST);

// The two sentences, lifted from the message rather than typed twice: what must differ is which one is used.
const SAYS_YOURS = /none of them is deleting a line you wrote on land you still own/;
const SAYS_NOT_YOURS = /It is not a line you wrote: (.+?) declares this same location for this state one layer down/;

try {
  console.log("1. ⭐⭐ CONTROL: with nobody below to attribute it to, the line is the modder's and the old sentence stands");
  {
    const solo = writeRoot(path.join(ROOT, "solo"), { descriptor: 'name="Solo"\n' });
    const p = coastProblems(solo, NOGAME);
    rec("the warning fires once, for province 2 in state 2", p.length === 1 && p[0].province === 2 && p[0].stateId === 2,
      p.map((x) => [x.stateId, x.province, x.location]));
    const m = String((p[0] || {}).message || "");
    rec("⭐⭐ …and it says the line is the modder's", SAYS_YOURS.test(m) && !SAYS_NOT_YOURS.test(m), m.slice(-260));
    rec("…it is the LAND branch, not the drowned one", !/is not land at all/.test(m) && p[0].provinceType === "land", p[0].provinceType);
    rec("…Auto-fix still declines it, in the words the popup reads", /Auto-fix leaves it alone/.test(m) && p[0].autoFix === false, p[0].autoFix);
  }

  console.log("\n2. ⭐⭐⭐ THE OWNER'S SHAPE: the mod holds a verbatim copy of a base state, so the LINE is not his");
  {
    const base = writeRoot(path.join(ROOT, "base-a"), { state2: STATE2_WITH });
    // No replace_path: the mod's 2-B.txt replaces the base's by name, and the base is still a layer below to ask.
    const copy = writeRoot(path.join(ROOT, "copy"), { descriptor: 'name="Copy"\n', state2: STATE2_WITH, common: false, map: false });
    const p = coastProblems(copy, base);
    rec("CONTROL: the warning still fires — the mod ships the state, so it is reported", p.length === 1 && p[0].province === 2,
      p.map((x) => [x.stateId, x.province]));
    const m = String((p[0] || {}).message || "");
    rec("⭐⭐⭐ it no longer tells the modder they wrote it", !SAYS_YOURS.test(m), m.slice(-300));
    rec("⭐⭐⭐ …it says whose line it is", SAYS_NOT_YOURS.test(m), m.slice(-300));
    rec("⭐⭐ …and names the layer it comes from", (SAYS_NOT_YOURS.exec(m) || [])[1] === "the base game", (SAYS_NOT_YOURS.exec(m) || [])[1]);
    rec("⭐ …while still offering the same three repairs", /Point the location at a coastal province, give this one its coast back, or use a location whose buildings it can hold/.test(m), m.slice(-200));
    rec("⭐ …and still declining the fix in the words the popup reads", /Auto-fix leaves it alone/.test(m) && p[0].autoFix === false, p[0].autoFix);
  }

  console.log("\n3. ⭐⭐⭐ THE OTHER HALF: a line the mod added itself, over a base state that has none, IS the modder's");
  {
    const base = writeRoot(path.join(ROOT, "base-b"), { state2: STATE2_WITHOUT });
    const own = writeRoot(path.join(ROOT, "own"), { descriptor: 'name="Own"\n', state2: STATE2_WITH, common: false, map: false });
    const p = coastProblems(own, base);
    rec("CONTROL: the warning fires", p.length === 1 && p[0].province === 2, p.map((x) => [x.stateId, x.province]));
    const m = String((p[0] || {}).message || "");
    rec("⭐⭐⭐ the sentence is the one about a line the modder wrote", SAYS_YOURS.test(m) && !SAYS_NOT_YOURS.test(m), m.slice(-300));
  }

  console.log("\n4. ⭐⭐ A DIFFERENT line below is not this line: the predicate asks about the location and the province");
  {
    // The base declares the same bundle for a DIFFERENT province of the same state. The mod's line for province 2 is
    // still its own — a multiset of bundle names would have said otherwise.
    const base = writeRoot(path.join(ROOT, "base-c"), { state2: state(2, [1, 2], ["strategic_province_location = { harbour_bundle = 1 }"]) });
    const own = writeRoot(path.join(ROOT, "own-c"), { descriptor: 'name="OwnC"\n', state2: STATE2_WITH, common: false, map: false });
    const p = coastProblems(own, base);
    rec("CONTROL: the warning fires for province 2", p.length === 1 && p[0].province === 2, p.map((x) => [x.stateId, x.province]));
    const m = String((p[0] || {}).message || "");
    rec("⭐⭐ the line is still the modder's — the one below names another province", SAYS_YOURS.test(m) && !SAYS_NOT_YOURS.test(m), m.slice(-300));
  }

  console.log("\n5. ⭐⭐⭐ The same map answers the same way twice — the layer is named by the LAYER, not by a warm cache");
  {
    // ⚠️ A state's `rootPath` is written during buildMapModel's merge, onto the object the CACHED layer holds. Naming the
    // layer off that field made the sentence depend on whether an earlier call had warmed the cache: measured, the same
    // fixture said "the base game" once and "a layer below" once. Two runs over one fixture, cold then warm.
    const base = writeRoot(path.join(ROOT, "base-d"), { state2: STATE2_WITH });
    const copy = writeRoot(path.join(ROOT, "copy-d"), { descriptor: 'name="CopyD"\n', state2: STATE2_WITH, common: false, map: false });
    const cold = String((coastProblems(copy, base)[0] || {}).message || "");
    // Warm every layer cache the merge touches, then ask again.
    M.buildMapModel({ modRoot: copy, gameRoot: base, dependencyRoots: [], cacheStableLayers: true });
    const warm = String((coastProblems(copy, base)[0] || {}).message || "");
    rec("both runs report the warning", cold.length > 0 && warm.length > 0, [cold.length, warm.length]);
    rec("⭐⭐⭐ …and say the same thing", cold === warm, { cold: cold.slice(-200), warm: warm.slice(-200) });
    rec("⭐⭐ …naming the base game in both", (SAYS_NOT_YOURS.exec(cold) || [])[1] === "the base game" && (SAYS_NOT_YOURS.exec(warm) || [])[1] === "the base game",
      [(SAYS_NOT_YOURS.exec(cold) || [])[1], (SAYS_NOT_YOURS.exec(warm) || [])[1]]);
  }
} catch (e) {
  rec("the test ran to the end", false, (e && e.stack) || String(e));
} finally {
  try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
}

console.log(`\n=== a strategic location on landlocked land says whose line it is: ${checks} checks, ${fails.length} failed ===`);
if (fails.length) { for (const f of fails) console.log("  - " + f); process.exit(1); }
