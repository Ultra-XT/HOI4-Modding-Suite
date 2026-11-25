// ⛔ #a-state-that-owns-only-water — A STATE THAT OWNS PROVINCES BUT NOT ONE SQUARE OF LAND, WHICH NOTHING REPORTED.
//
// Three rules in validateMapModel already say the sentence: HOI4 "checks every state for an air base site on its own
// land, and one with no land has none". That is why empty_state, empty_state_with_content and empty_capital_state are
// all FATAL. A state whose provinces are every one of them sea — or every one of them lake — has no land either, and
// had no rule at all, because the rule written for exactly that consequence exempts it:
//
//     findStatesWithoutSites:  for (const st of model.states) {
//                                if (!(st.provinces || []).some((p) => typeOf.get(p) === "land")) continue;
//
// state_no_air_base_or_rocket_site — an ERROR and in the FATAL set — skips precisely the states that cannot have a
// site. The skip is right for THAT rule (its Auto-fix places positions on the state's own land, and there is none to
// place on), so the condition belongs beside the empty state it is the same shape as.
//
// ⭐ WHAT MADE IT VISIBLE. The owner's own workflow — own the map → Delete map → Generate land 35% → Auto-fix ×2 —
// builds a world whose states still stand where their land used to be. Measured on the build installed as
// nova_world_0917: 589 of its 1,425 states own provinces and not one of them is land (579 all sea, 10 all lake), and
// its map/buildings.txt carries an air_base row for 836 states — 1,425 − 836 = 589, the same states, because the
// writer skips them for the same reason the reader does. Nova called that world "18 problems, 1 error, ZERO fatal".
// The twelve strategic_location_building_needs_coast warnings it DID report are the visible tip: eleven of the twelve
// name a province that is ocean, and nine of the ten states carrying them own no land at all.
//
// 🚫🚫 NOT FATAL. THIS HEADER ARGUED THE OPPOSITE FOR ABOUT THREE HOURS ON 2026-09-17, AND THE GAME SETTLED IT.
// The argument below is kept because it is careful, it is where anyone who re-opens this will start, and being
// careful was not enough. What refuted it, in one line: SEVEN of the owner's own launches carry this shape and
// none of them logged a thing. nova_flow2_b16 reached a 1936 game with 293 states owning only water and ZERO
// occurrences of "air base" in its error.log; six more from 09-09 (nova_torture_0912/0913/0914, nova_island/2/3)
// did the same, and 0912's state 1083 — owned by FRA, owning two LAND provinces, carrying a victory point and 22
// buildings.txt rows — has neither an air_base nor a rocket_site_spawn row and still reached 1936.01.01.12 with a
// 15-line error.log and no MAP_ERROR at all, under --debug, with a positive control proving that launcher does log
// them. So state_no_air_base_or_rocket_site came OUT of the fatal set too, on the same evidence.
// ⭐⭐⭐ THE GAME IS THE ORACLE AND OUTRANKS A TRACE OF THE BINARY. Something upstream gates that walk and nobody
// has found it yet; until someone produces a launch that FAILS, neither rule claims the map will not load.
// The trace, kept instruction by instruction (fn-strategicair.txt), at hoi4.exe 1.19.4.1's addresses unless marked:
//   0x140CB7151 r15d = 1 and 0x140CB7772 `inc r15d` — the walk is over state ids 1..N, with NO land filter;
//   0x140C4AD11 (1.19.2) an empty site list -> 0x140CB722E "MAP_ERROR: no air base site defined for state " -> 0x140CB726A
//     `xor r12b,r12b`, the ok-flag;
//   0x140CB72DD `test [prov+0D2h],1` (the land bit) and the list walk at 0x140CB7300 — a site row that IS there must
//     stand on land the state owns, or 0x140CB7347 "… is invalid for state " clears the same flag at 0x140CB73AF;
//   0x140CB7791 `test r12b,r12b` -> 0x140CB789F `call 0x140201F90`, the failed-load path.
// A state with no land has no branch that passes — on paper. MEASURED on the built world (scratchpad
// IT-D1-airbase.js): its map/buildings.txt names exactly the 836 states that have land, so all 589 landless ones
// take the first branch. That measurement is still true; what it does NOT do is fail the load, which is the only
// thing a fatal rule claims. 0 of 7,523 shipping states are landless, so the corpus could never have refuted this
// either — only a launch could, and seven of them did. The rule stays as an ERROR, which it earns: 589 landless
// states is worth telling a modder about. #a-validator-must-not-cry-wolf
//
// Run: node test-a-state-that-owns-only-water-is-reported.js
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

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-onlywater-"));
process.env.NOVA_HOME_DIR = path.join(ROOT, "home");
fs.mkdirSync(process.env.NOVA_HOME_DIR, { recursive: true });
const M = require("./map-data.js");
const { isFatalRule, mapRuleLabel, mapRuleFixHint, fatalOutcome, fatalVerdict, LABELS } = require("./public/map-rule-labels.js");
const { maskJsComments } = require("./testlib-strip-comments.js");
const RULE = "state_owns_no_land";
const AIRBASE = "state_no_air_base_or_rocket_site";
const NOGAME = path.join(ROOT, "no-game");
const GAME = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
const W = "D:/SteamLibrary/steamapps/workshop/content/394360/";
const SHIPPING = { vanilla: GAME, MD: W + "2777392649", R56: W + "820260968", OWB: W + "2265420196", NV: W + "1827273767", RoN: W + "2026448968" };

// ── the fixture ──────────────────────────────────────────────────────────────────────────────────────────────
// Province types, by id. 1-2 land, 3-6 sea, 7-8 lake, 9 land.
const TYPES = { 1: "land", 2: "land", 3: "sea", 4: "sea", 5: "sea", 6: "sea", 7: "lake", 8: "lake", 9: "land" };
const definitionCsv = (types, coastal = null) => {
  const rows = ["0;0;0;0;land;false;unknown;0"];
  for (const p of Object.keys(types).map(Number).sort((a, b) => a - b)) {
    const t = types[p];
    const c = coastal && Object.prototype.hasOwnProperty.call(coastal, p) ? coastal[p] : t === "land";
    rows.push(`${p};${p * 20};0;0;${t};${c ? "true" : "false"};${t === "land" ? "plains" : t === "lake" ? "lakes" : "ocean"};${t === "land" ? 1 : 0}`);
  }
  return rows.join("\n") + "\n";
};
const state = (id, provinces) => [
  "state = {", `\tid = ${id}`, `\tname = "STATE_${id}"`, "\tmanpower = 1000", "\tstate_category = rural",
  `\tprovinces = { ${provinces.join(" ")} }`, "\thistory = {", `\t\towner = A${id}A`, "\t}", "}", "",
].join("\n");
const STATES = {
  "1-Dry.txt": state(1, [1, 2]),          // land only          -> silent
  "2-Drowned.txt": state(2, [3, 4]),      // every province sea -> reported
  "3-Mixed.txt": state(3, [5, 9]),        // one land left      -> silent (its sea is non_land_province_in_state's)
  "4-Lakes.txt": state(4, [7, 8]),        // every province lake-> reported; non_land_province_in_state never flags a lake
  "5-Sunk.txt": state(5, [6]),            // one province, sea  -> reported
};
function writeRoot(root, { descriptor = null, states = STATES, types = TYPES, map = true } = {}) {
  const mk = (rel, c) => { const p = path.join(root, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, c); };
  if (descriptor) mk("descriptor.mod", descriptor);
  if (map) mk("map/definition.csv", definitionCsv(types));
  for (const [f, body] of Object.entries(states)) mk("history/states/" + f, body);
  return root;
}
const probsOf = (modRoot, gameRoot) =>
  M.validateMapModel(M.buildMapModel({ modRoot, gameRoot, dependencyRoots: [], cacheStableLayers: false }));
const mine = (modRoot, gameRoot, rule) => probsOf(modRoot, gameRoot).filter((p) => p.rule === rule);

try {
  console.log("1. THE POSITIVE CONTROL — one problem for the class, naming every state and no state that has land");
  {
    const mod = writeRoot(path.join(ROOT, "mod"), { descriptor: 'name="Sunk"\nreplace_path="history/states"\nreplace_path="map"\n' });
    const hits = mine(mod, NOGAME, RULE);
    rec("⭐⭐⭐ a state that owns provinces and no land is reported", hits.length === 1, hits.map((h) => [h.total, (h.items || []).map((i) => i.stateId)]));
    const h = hits[0] || {};
    const ids = (h.items || []).map((i) => i.stateId).sort((a, b) => a - b);
    rec("⭐⭐ …ONE problem for the class, not one per state (the way non_land_province_in_state reports)",
      h.total === 3 && ids.length === 3, { total: h.total, ids });
    rec("⭐⭐ …naming the two all-sea states and the all-lake one", ids.join() === "2,4,5", ids);
    rec("⚠️ a state with land is NOT in it — not the dry one, not the one with a single land province left",
      !ids.includes(1) && !ids.includes(3), ids);
    rec("…as an error", h.severity === "error", h.severity);
    rec("⭐ …counting provinces and naming what they are", (h.items || []).every((i) => i.provinces > 0 && Array.isArray(i.types) && i.types.length), h.items);
    rec("⭐ …quoting the MAP_ERROR the empty-state rules quote for the same missing air base site",
      /MAP_ERROR: no air base site defined for state/.test(String(h.message)), String(h.message).slice(0, 200));
    // ⭐⭐⭐ MOVED 2026-09-17. These two pinned "Save stops for this" and "the walk has no land filter, which is why a
    // landless state cannot pass it". The first stopped being true at 1580733, when the rule left the fatal set, and the
    // message was never updated with it — it told the modder Save would stop when it would not. The second is the trace's
    // reasoning, and six earlier launches refute it for states that are not landless at all (nova_torture_0912 state
    // 1083: owner FRA, two land provinces, a VP, 22 building rows, neither site row, 1936 game reached, nothing logged).
    rec("⭐⭐ …and NOT claiming Save stops for it, because it does not", !/Save stops for this/.test(String(h.message)), String(h.message).slice(-330));
    rec("⭐⭐ …saying instead that the game has been seen to play on, so the modder is not told a falsehood",
      /played on/.test(String(h.message)) && /never once been seen/.test(String(h.message)), String(h.message).slice(0, 460));
    rec("⭐ …and still saying what it does cost, so it is not dismissed either",
      /can hold no building and no air base/.test(String(h.message)), String(h.message).slice(-400));

    rec("⭐⭐⭐ THE HOLE IT CLOSES: the air-base rule is silent on exactly these states",
      M.findStatesWithoutSites({ modRoot: mod, gameRoot: NOGAME, dependencyRoots: [] }).length === 0,
      M.findStatesWithoutSites({ modRoot: mod, gameRoot: NOGAME, dependencyRoots: [] }));
    rec("⭐⭐ …and the skip that makes it silent is still in the source, so this rule is still the only cover",
      /some\(\(p\) => typeOf\.get\(p\) === "land"\)\) continue;/.test(maskJsComments(fs.readFileSync(path.join(__dirname, "map-data.js"), "utf8"))));

    rec("⚠️ an EMPTY state is not double-reported — it is still empty_state alone", (() => {
      const e = writeRoot(path.join(ROOT, "empty"), { descriptor: 'name="E"\nreplace_path="history/states"\nreplace_path="map"\n', states: { "9-Void.txt": state(9, []) } });
      const p = probsOf(e, NOGAME);
      return p.some((x) => x.rule === "empty_state") && !p.some((x) => x.rule === RULE);
    })());

    // 🚫🚫 THESE THREE ASSERTED THE OPPOSITE UNTIL 2026-09-17, AND THE GAME SETTLED IT.
    // The rule was put in the fatal set on a reading of strategicair.cpp: the walk over state ids has no land filter,
    // an empty site list logs "MAP_ERROR: no air base site defined for state" and clears the ok-flag, and a cleared
    // flag reaches the failed-load path — so a landless state fails by whichever branch it takes. Careful, and wrong.
    // The owner launched a Nova-built world on 09-16 and reached a 1936 game. On that exact installed mod: 1,380
    // states, 1,087 with land, 293 OWNING ONLY WATER — and his 14-line error.log contains ZERO occurrences of
    // "air base". None of the 293 produced the message, and the map loaded.
    // ⭐⭐⭐ THE GAME IS THE ORACLE and outranks a trace of the binary. A gate here would stop a Save on a map he has
    // already played, which is the cry-wolf failure CLAUDE.md exists to prevent. The rule stays as an ERROR.
    rec(`⭐⭐⭐ '${RULE}' is NOT in the fatal set — 293 of these loaded a 1936 game on 09-16`, isFatalRule(RULE) === false);
    // ⭐⭐⭐ AND ITS SIBLING WENT WITH IT, 2026-09-17. The note above said the same launch "never contradicted" the
    // sibling. Six earlier launches did: nova_torture_0912/0913/0914 and nova_island/2/3, each with a state that has
    // LAND and no air_base row, each launched with --debug and one active mod, each reaching 1936.01.01.12, none
    // logging a word about an air base. nova_torture_0912's state 1083 is owned by FRA with two land provinces, a
    // victory point and 22 buildings.txt rows. So landless-ness was never the variable, and neither rule is a refusal.
    rec(`⭐⭐ …and neither is its sibling, which six earlier launches contradicted`,
      fatalOutcome(AIRBASE) === "" && isFatalRule(AIRBASE) === false, [fatalOutcome(RULE), fatalOutcome(AIRBASE)]);
    rec("⭐⭐ …so a map carrying only this one is not told the game refuses to load it",
      !/refuses to load/.test(fatalVerdict([RULE]).sentence || ""), fatalVerdict([RULE]).sentence);
    rec(`'${RULE}' has a label a modder can read`, LABELS[RULE] && mapRuleLabel(RULE) === LABELS[RULE] && mapRuleLabel(RULE).length > 15, mapRuleLabel(RULE));
    rec(`'${RULE}' has a fix hint that says what to do`, mapRuleFixHint(RULE).length > 15, mapRuleFixHint(RULE).slice(0, 120));
  }

  console.log("\n2. ⭐ THE CAP IS NOT THE COUNT — #a-count-is-the-population-not-the-length-of-the-capped-list");
  {
    const many = {};
    const types = { 1: "land" };
    for (let i = 1; i <= 75; i++) { types[100 + i] = "sea"; many[`s${i}.txt`] = state(i, [100 + i]); }
    types[1] = "land";
    const mod = writeRoot(path.join(ROOT, "many"), { descriptor: 'name="Many"\nreplace_path="history/states"\nreplace_path="map"\n', states: many, types });
    const h = mine(mod, NOGAME, RULE)[0] || {};
    rec("⭐⭐ 75 drowned states: total counts every one", h.total === 75, h.total);
    rec("⭐ …while items carries the first 60", (h.items || []).length === 60, (h.items || []).length);
    rec("…and the message prints the population, not the cap", new RegExp("^75 state").test(String(h.message)), String(h.message).slice(0, 40));
  }

  console.log("\n3. ⛔ #inherited-problem-not-yours — told only about what it could have caused");
  {
    // The layer below already has the condition: state 2 owns only sea there too. A "nothing happened" probe needs
    // a positive control, so the layer is measured on its own first.
    const layer = writeRoot(path.join(ROOT, "layer"));
    rec("THE CONTROL: that layer, edited directly, reports it", (mine(layer, layer, RULE)[0] || {}).total === 3, mine(layer, layer, RULE).map((h) => h.total));
    const blind = writeRoot(path.join(ROOT, "blind"), { descriptor: 'name="Blind"\n', states: {}, map: false });
    rec("⭐⭐⭐ an add-on shipping neither the state file nor the province rows is told about none of them",
      mine(blind, layer, RULE).length === 0, mine(blind, layer, RULE));

    // The owner's own shape: the state files are inherited, and it is the MOD's definition.csv that drowned them.
    const dryBase = writeRoot(path.join(ROOT, "dry-base"), { types: { ...TYPES, 3: "land", 4: "land", 6: "land", 7: "land", 8: "land" } });
    const drowner = writeRoot(path.join(ROOT, "drowner"), { descriptor: 'name="Drowner"\n', states: {} });
    const d = mine(drowner, dryBase, RULE)[0] || {};
    rec("⭐⭐⭐ an add-on that only retyped the provinces to water IS told — the rows are its own",
      d.total === 3 && (d.items || []).map((i) => i.stateId).sort().join() === "2,4,5", [d.total, (d.items || []).map((i) => i.stateId)]);

    // A state Nova cannot resolve every province of is not a state Nova may call landless.
    const partial = writeRoot(path.join(ROOT, "partial"), {
      descriptor: 'name="Partial"\nreplace_path="history/states"\nreplace_path="map"\n',
      states: { "2-Drowned.txt": state(2, [3, 4, 999]) },
    });
    rec("⚠️ a state listing a province definition.csv does not have is NOT called landless",
      mine(partial, NOGAME, RULE).length === 0, mine(partial, NOGAME, RULE));
  }

  console.log("\n4. ⭐⭐ THE DROWNED PROVINCE READS AS DROWNED — the strategic-location warning's other half");
  {
    // #a-drowned-province-is-not-a-province-that-lost-its-coast. Same rule, two shapes, opposite repairs.
    const LOCATIONS = ["harbour = {", "\tnaval_base = 2", "}", ""].join("\n");
    const BUILDINGS = ["buildings = {", "\tnaval_base = {", "\t\tonly_costal = yes", "\t\tlevel_cap = { province_max = 10 }", "\t}", "}", ""].join("\n");
    // Province 2 is the one the location points at, and it carries coastal=false in BOTH shapes — so the only thing
    // that differs between (a) and (b) is whether definition.csv types it land or sea.
    const mk = (root, types, prov) => {
      const p = (rel, c) => { const q = path.join(root, rel); fs.mkdirSync(path.dirname(q), { recursive: true }); fs.writeFileSync(q, c); };
      p("descriptor.mod", 'name="SL"\nreplace_path="history/states"\nreplace_path="map"\n');
      p("map/definition.csv", definitionCsv(types, { 2: false }));
      p("common/strategic_locations/00.txt", LOCATIONS);
      p("common/buildings/00.txt", BUILDINGS);
      p("history/states/7-S.txt", [
        "state = {", "\tid = 7", '\tname = "STATE_7"', "\tmanpower = 1000", "\tstate_category = rural",
        `\tprovinces = { 1 ${prov} }`, "\thistory = {", "\t\towner = AAA",
        `\t\tstrategic_province_location = { harbour = ${prov} }`, "\t}", "}", "",
      ].join("\n"));
      return root;
    };
    const COAST = "strategic_location_building_needs_coast";
    // (a) landlocked LAND — the shape the original sentence described.
    const dry = mk(path.join(ROOT, "sl-dry"), { ...TYPES, 2: "land" }, 2);
    const a = mine(dry, NOGAME, COAST)[0] || {};
    rec("a landlocked land province is still reported", a.province === 2 && a.provinceType === "land", [a.province, a.provinceType]);
    rec("⭐ …and still told to give the province its coast back", /give this one its coast back/.test(String(a.message)), String(a.message).slice(-160));
    rec("…without being called drowned", !/is not land at all/.test(String(a.message)));
    // (b) the same entry on a province the map drowned.
    const wet = mk(path.join(ROOT, "sl-wet"), { ...TYPES, 2: "sea" }, 2);
    const b = mine(wet, NOGAME, COAST)[0] || {};
    rec("⭐⭐ a drowned province is reported too — the engine refuses the building either way", b.province === 2 && b.provinceType === "sea", [b.province, b.provinceType]);
    rec("⭐⭐⭐ …but is told it is not land at all, and its state still owns it", /is not land at all/.test(String(b.message)) && /still owns it/.test(String(b.message)), String(b.message).slice(-300));
    rec("⭐⭐⭐ …and is NOT told to give a sea province its coast back", !/give this one its coast back/.test(String(b.message)), String(b.message).slice(-200));
    rec("⭐ …and the same state is reported as owning no land only when it owns none", mine(wet, NOGAME, RULE).length === 0, mine(wet, NOGAME, RULE));
  }

  console.log("\n5. ⭐⭐⭐ NO SHIPPING MAP GAINS A SAVE GATE — every one of these launches");
  {
    let seen = 0;
    for (const [key, root] of Object.entries(SHIPPING)) {
      if (!fs.existsSync(path.join(root, "history", "states"))) { console.log("  ..   (" + key + " is not installed)"); continue; }
      seen++;
      const model = M.buildMapModel({ modRoot: key === "vanilla" ? null : root, gameRoot: GAME, dependencyRoots: [], cacheStableLayers: true });
      const ty = new Map((model.provinces || []).map((p) => [p.id, String(p.type || "").toLowerCase()]));
      const landless = (model.states || []).filter((st) => (st.provinces || []).length && !(st.provinces || []).some((p) => ty.get(p) === "land"));
      const hits = M.validateMapModel(model).filter((p) => p.rule === RULE);
      rec(`⭐⭐ ${key}: ${(model.states || []).length} states, ${landless.length} own no land, ${hits.length} problems`,
        hits.length === 0 && landless.length === 0, landless.slice(0, 5).map((s) => s.id));
    }
    rec("at least the base game was measured", seen >= 1, seen);
  }
} catch (e) {
  rec("harness threw: " + (e && e.stack ? e.stack.split("\n").slice(0, 6).join(" | ") : e), false);
} finally {
  try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
  console.log(`\n=== a state that owns only water: ${checks} checks, ${fails.length} failed ===`);
  if (fails.length) { for (const f of fails) console.log("  - " + f); process.exit(1); }
}
