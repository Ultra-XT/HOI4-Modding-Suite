// A cut-off piece is given a state of its own WITHOUT emptying a state that nothing can then delete.
// #a-carve-must-not-empty-a-state-it-cannot-delete
//
// ⛔ THE DEFECT — A REGRESSION THAT TRADED ONE FATAL FOR ANOTHER. Batch 15 taught fixFractionedRegions to CARVE a cut-off
// province into a state of its own when no neighbouring region can take its whole state (#a-cut-off-piece-gets-a-state-of-
// its-own). Measured on fixtures and on a Millennium Dawn copy that ends the owner's workflow green. Run for real on a NEW
// EMPTY MOD OVER VANILLA it does not:
//
//     base 26c2b4f : 49 problems, 47 errors. Fatal rules: fractioned_naval_region(1)  state_no_air_base_or_rocket_site(1)
//     head 4601d18 : 48 problems, 46 errors. Fatal rules: empty_state_with_content(1) state_no_air_base_or_rocket_site(1)
//
// empty_state_with_content and fractioned_naval_region are both "refuses-to-load" in the curated fatal set
// (public/map-rule-labels.js); province_in_two_states is NOT. So the carve removed one fatal and introduced another.
//
// THE CHAIN, INSTRUMENTED ON THE CLICK. Vanilla's state 932 "Isle of Man" holds exactly ONE province, 3311. Generate land
// writes a state of its own over that ground, so 3311 is claimed twice before Auto-fix begins. The carve then asks
// splitStateOffProvinces for a state holding 3311, and createState — which STEALS the province from every state that lists
// it, so a province never lives in two states after a create — took it off 932 as well. Hooking every write that lands on a
// mod state file named the pass outright:
//
//     rename 932-Isle of Man.txt  <-  editStateBlock < createState < splitStateOffProvinces < fixFractionedRegions < autoFixMap
//
// It is NOT fixProvinceInTwoStates, which ran earlier and refused this exact thing by name ("state 932 also comes from the
// base game or a dependency — deleting the mod's copy would restore it, not remove it"). editStateBlock materialises a
// base-layer state into the mod to edit it, under the base file's own name, so 932 landed in the mod with
// `provinces = { }` and `infrastructure = 3` still declared — and deleteState refuses to remove that (#delete-inherited-
// state): deleting the mod's copy only un-shadows vanilla's, which claims 3311 again. autoFixMap's empty-state sweep runs
// TWICE for exactly this class and could not clear it on either pass, or on a second click.
//
// THE DECISION, FROM THE MEASUREMENT. The state that was emptied is NOT the parent the carve cut from, so neither
// "refuse the carve" nor "carry the parent's content" nor "clean the emptied parent" is the repair — the parent is fine,
// and the emptied state is a THIRD claimant one layer down. Two things follow, and this file pins both:
//
//   1. createState never empties a state it cannot delete. The claim is left standing instead. The province is then in two
//      states — which is what it already was before the click, is not fatal, and is reported by name — while the state
//      below keeps the land that makes it a state. Deliberately narrow, for the reason #a-cleanup-must-not-empty-a-state
//      gives: a state the MOD ships is emptied exactly as before, because the click's own sweep can delete that one.
//   2. The carve does not MINT a state the layer below already keeps for exactly that land. A MOD IS AN OVERLAY: 932 is
//      already the whole state the region needs. Taking the land off the parent and leaving it to 932 ends the click with
//      no fatal, no province in two states, and nothing invented — where minting a twin left a conflict the NEXT click
//      resolved by deleting the state this one announced it had made.
//
// Requests are the page's: GET /api/map/validate?modPath, POST /api/map/auto-fix { modPath }, POST /api/map/create-state.
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

const world = lib.makeWorld("b16-carve-twin");
const { createApp } = require("./server.js");

// The 256x256 map test-a-cut-off-piece-gets-a-state-of-its-own.js uses, because it is the shape where no neighbouring
// region can take the whole state. Top half: sea 1 (x < 128) and sea 5 (x >= 128), with the island, land 3, inside sea 5.
// Bottom half: land 2 (32 <= x < 96) with land 4 either side. Land 2 touches sea 1 and land 4 only, so a region holding
// sea 5 cannot also hold land 2 in one piece.
const COL = { 1: [0, 0, 200], 2: [200, 0, 0], 3: [0, 200, 0], 4: [200, 200, 0], 5: [0, 0, 120] };
const at = (x, y) => (y < 128 ? (x >= 192 && x < 224 && y >= 32 && y < 64 ? 3 : x < 128 ? 1 : 5) : (x >= 32 && x < 96 ? 2 : 4));
const DEF = ["0;0;0;0;land;false;unknown;0", "1;0;0;200;sea;false;ocean;0", "2;200;0;0;land;true;plains;1",
  "3;0;200;0;land;true;plains;1", "4;200;200;0;land;true;plains;1", "5;0;0;120;sea;false;ocean;0"].join("\r\n") + "\r\n";
// The island carries its own air base and rocket site, so state_no_air_base_or_rocket_site is not a pre-existing problem
// of the fixture and "the second click writes nothing" is about the carve and nothing else.
const BUILD = [
  "1;air_base;176.00;9.50;56.00;0.00;0", "1;rocket_site_spawn;176.00;9.50;56.00;0.00;0",
  "2;air_base;48.00;9.50;56.00;0.00;0", "2;rocket_site_spawn;48.00;9.50;56.00;0.00;0",
  "3;air_base;208.00;9.50;208.00;0.00;0", "3;rocket_site_spawn;208.00;9.50;208.00;0.00;0",
  "2;naval_base_spawn;48.00;9.50;126.00;0.00;1", "1;naval_base_spawn;176.00;9.50;126.00;0.00;5",
  "2;naval_base_spawn;208.00;9.50;223.00;0.00;5",
].join("\n");

// THE LAYER BELOW: one state, 3 = { 3 } — the Isle of Man shape, a single province with a state-level building of its own.
// The two default base state files are blanked so nothing else in the base claims this geometry's land.
const BASE_ISLAND = 'state = {\n\tid = 3\n\tname = "STATE_3"\n\tmanpower = 51000\n\tstate_category = small_island\n\tprovinces = { 3 }\n'
  + '\thistory = {\n\t\towner = AAA\n\t\tbuildings = {\n\t\t\tinfrastructure = 3\n\t\t}\n\t}\n}\n';
lib.write(world.GAME, {
  "map/provinces.bmp": lib.bmp24(256, 256, (x, y) => COL[at(x, y)]),
  "map/definition.csv": DEF,
  "map/buildings.txt": BUILD,
  "history/states/1-A.txt": "# blank\n",
  "history/states/2-B.txt": "# blank\n",
  "history/states/3-C.txt": BASE_ISLAND,
});

// THE MOD: state 2 = { 2 3 } spans the mainland and the island, exactly as Generate land writes a state over ground the
// base game already holds. Owned by AAA, OCCUPIED by BBB, cored by CCC — three different tags — and the island carries
// the state's only victory point, so anything that moves the land has to move what the land carries.
const MOD_STATE2 = 'state = {\n\tid = 2\n\tname = "STATE_2"\n\tmanpower = 8000\n\tstate_category = town\n\tprovinces = { 2 3 }\n'
  + '\thistory = {\n\t\towner = AAA\n\t\tcontroller = BBB\n\t\tadd_core_of = CCC\n\t\tvictory_points = { 3 5 }\n\t}\n}\n';
const MOD_FILES = {
  "map/provinces.bmp": lib.bmp24(256, 256, (x, y) => COL[at(x, y)]),
  "map/definition.csv": DEF,
  "map/buildings.txt": BUILD,
  "map/strategicregions/1-R.txt": lib.region(1, "1 2 3 4"),
  "map/strategicregions/2-R.txt": lib.region(2, "5"),
  "history/states/1-S.txt": lib.st(1, "4"),
  "history/states/2-S.txt": MOD_STATE2,
};
const DESC = (extra) => `name="b16"\nsupported_version="1.*"\nreplace_path="map/strategicregions"\n${extra}`;

const rulesOf = (v) => { const t = {}; for (const p of (v && v.problems) || []) t[p.rule] = (t[p.rule] || 0) + 1; return t; };
/** Every rule the click left that the curated fatal set calls "refuses-to-load" — derived, never typed. */
const fatalRules = (v) => Object.keys(rulesOf(v)).filter((r) => isFatalRule(r)).sort();
const stateText = (mod, id) => {
  const d = path.join(mod, "history", "states");
  for (const f of (fs.existsSync(d) ? fs.readdirSync(d) : [])) {
    const t = fs.readFileSync(path.join(d, f), "utf8");
    if (new RegExp(`\\bid\\s*=\\s*${id}\\b`).test(t)) return { file: f, text: t };
  }
  return null;
};
const provincesIn = (text) => {
  const m = /provinces\s*=\s*\{([^}]*)\}/.exec(text || "");
  return m ? m[1].trim().split(/\s+/).filter(Boolean).map(Number) : [];
};
const stateFileCount = (mod) => { const d = path.join(mod, "history", "states"); return (fs.existsSync(d) ? fs.readdirSync(d) : []).length; };

/** public/map.js's OWN fractionedRepairNote, lifted the way test-a-cut-off-piece-gets-a-state-of-its-own.js lifts it. */
function repairNote(frg) {
  const vm = require("vm");
  const { maskJsComments } = require("./testlib-strip-comments.js");
  const SRC = fs.readFileSync(path.join(__dirname, "public", "map.js"), "utf8");
  const MASKED = maskJsComments(SRC);
  const s = MASKED.indexOf("function fractionedRepairNote(");
  if (s < 0) throw new Error("fractionedRepairNote not found in public/map.js");
  const e = MASKED.indexOf("\n  }", s);
  if (e < 0) throw new Error("could not find the end of fractionedRepairNote");
  const fn = SRC.slice(s, e + 4);
  const sandbox = { console };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(`${fn}\nglobalThis.__note = fractionedRepairNote;`, sandbox);
  return sandbox.__note(frg);
}

(async () => {
  let srv = null;
  try {
    srv = await lib.startServer(createApp);

    console.log("1. ⭐⭐⭐ CONTROL: the shape — an island cut off from its region, whose land the layer below keeps a whole state for");
    const mod = world.mod("b16 twin", { "descriptor.mod": DESC(""), ...MOD_FILES });
    const before = await srv.validate(mod);
    {
      const r = rulesOf(before);
      rec("validate names island 3 as cut off, and that is FATAL", lib.idsOf(before, "fractioned_naval_region").join(",") === "3" && isFatalRule("fractioned_naval_region"),
        { frac: lib.idsOf(before, "fractioned_naval_region"), rules: r });
      // The rule reports `{ province, stateId }` — the province, and the SECOND state to claim it — so read the problem
      // rather than lib.idsOf, which collects state ids and would answer 2 for a check about province 3.
      const dbl = ((before && before.problems) || []).filter((p) => p.rule === "province_in_two_states");
      rec("…and province 3 is already claimed twice — by the mod's state 2 and by state 3 one layer down",
        dbl.length === 1 && dbl[0].province === 3 && [2, 3].includes(dbl[0].stateId) && /state 2 and state 3|state 3 and state 2/.test(dbl[0].message || ""),
        { dbl, rules: r });
      rec("…while the mod ships no copy of the base island state", !stateText(mod, 3), stateText(mod, 3));
    }

    console.log("\n2. ⭐⭐⭐ ONE CLICK: no fatal rule is left — the fractioned region is gone and NO state was emptied");
    const t0 = lib.tree(mod);
    const click1 = await srv.autoFix(mod);
    const t1 = lib.tree(mod);
    const frg = ((click1.body && click1.body.fixes) || {}).fractionedRegions || {};
    const after = await srv.validate(mod);
    {
      const r = rulesOf(after);
      rec("⭐⭐⭐ the click leaves NO rule the fatal set calls refuses-to-load", fatalRules(after).length === 0, { fatal: fatalRules(after), rules: r });
      rec("⭐⭐ specifically: no empty_state_with_content, no empty_state, no empty_capital_state", !r.empty_state_with_content && !r.empty_state && !r.empty_capital_state, r);
      rec("⭐⭐ …and no fractioned_naval_region", !r.fractioned_naval_region, r);
      rec("…nor a province in two states: the double claim the carve would have left is settled too", !r.province_in_two_states, r);
      rec("the click did move the island's region", frg.moved === 1, frg);
    }

    console.log("\n3. ⭐⭐⭐ The land went BACK to the state the layer below already keeps for it — nothing was invented");
    {
      const s3 = stateText(mod, 3);
      rec("state 3 still holds province 3", !!s3 && provincesIn(s3.text).join(",") === "3", s3 && { file: s3.file, provinces: provincesIn(s3.text) });
      rec("⭐⭐ …and it was NOT emptied and left declaring content", !!s3 && /infrastructure\s*=\s*3/.test(s3.text) && provincesIn(s3.text).length > 0, s3 && s3.text);
      rec("⭐⭐ the victory point the island carried came with it", !!s3 && /victory_points\s*=\s*\{\s*3\s+5\s*\}/.test(s3.text), s3 && s3.text);
      rec("…and the state it left no longer lists the island, nor its victory point", (() => {
        const s2 = stateText(mod, 2);
        return !!s2 && provincesIn(s2.text).join(",") === "2" && !/victory_points/.test(s2.text);
      })(), stateText(mod, 2) && stateText(mod, 2).text);
      rec("⭐⭐ NO state was minted for a piece that already had one", !frg.statesMade, { statesMade: frg.statesMade, handedToBase: frg.handedToBase });
      // ⚠️ THE ROUTE IS NOT THE INVARIANT — THE TRUTHFULNESS OF THE REPORT IS. This check used to require a hand-over,
      // which pinned the one route that existed when it was written. #a-conflict-whose-loser-cannot-be-deleted-keeps-the-province
      // then made fixProvinceInTwoStates keep a province in the claimant it may not delete, which runs EARLIER in the same
      // click — so the land is already home by the time the region pass looks, and that pass merely moves it between regions
      // with nothing to hand over. Same outcome, reported honestly, by a better road. What must hold either way: the click
      // never claims it minted a state, and when it DID hand one over it says which, and out of which.
      rec("…and the click's report matches the road it actually took", !frg.statesMade
        && (!Array.isArray(frg.handedToBase) || frg.handedToBase.length === 0
          || (frg.handedToBase.length === 1 && frg.handedToBase[0].id === 3 && frg.handedToBase[0].from === 2)),
        { statesMade: frg.statesMade, handedToBase: frg.handedToBase });
      // Derived from the fixture, not typed: the state files the mod ships, plus the one base state it now holds a copy of.
      const shipped = Object.keys(MOD_FILES).filter((k) => k.startsWith("history/states/")).length;
      rec("the mod ends with exactly the state files it ships, plus the base island it now holds", stateFileCount(mod) === shipped + 1,
        { shipped, now: fs.readdirSync(path.join(mod, "history", "states")) });
      // map/buildings.txt keys every row by STATE, and the land changed state. The fixture keys the island's rows to the
      // state below (as vanilla keys the Isle of Man's to 932), so before the click they named a state that did not hold
      // that land and building_wrong_state fired; the hand-over is what makes them right.
      rec("…and the rows map/buildings.txt keys to that land no longer name a state that does not hold it",
        !rulesOf(after).building_wrong_state && rulesOf(before).building_wrong_state === 1,
        { before: rulesOf(before).building_wrong_state, after: rulesOf(after).building_wrong_state });
      rec("the click wrote something (a control on the checks above)", lib.written(t0, t1).length > 0, Object.keys(lib.written(t0, t1)));
    }

    console.log("\n4. ⭐⭐⭐ A SECOND CLICK WRITES NOTHING — the click is complete, not half of a pair");
    {
      await srv.autoFix(mod);
      const t2 = lib.tree(mod);
      rec("⭐⭐⭐ the second Auto-fix leaves the tree byte-identical", lib.written(t1, t2).length === 0, lib.written(t1, t2));
      const after2 = await srv.validate(mod);
      rec("…and the screen still shows no fatal rule", fatalRules(after2).length === 0, { fatal: fatalRules(after2), rules: rulesOf(after2) });
    }

    console.log("\n5. ⭐⭐ The popup says what happened — public/map.js's own fractionedRepairNote, on this click's answer");
    {
      const note = repairNote(frg);
      const said = note.parts.join(" | ");
      rec("fractionedRepairNote was lifted", Array.isArray(note.parts));
      // ⭐⭐ THE HALF THAT BITES IS THE FALSE CLAIM. Reverting the fix makes this click announce that it "gave 1 cut-off
      // piece a state of its own" over a state it emptied instead — so what must never appear is that sentence when
      // nothing was minted. Naming the hand-over is required only on the click that made one (see section 3's note).
      rec("⭐⭐ it never claims a state was invented, and names the hand-over on a click that made one", (() => {
        if (/state of (its|their) own/.test(said)) return false;
        const handed = Array.isArray(frg.handedToBase) && frg.handedToBase.length > 0;
        return !handed || (/already keeps for exactly that land/.test(said) && /\b3, taken out of 2\b/.test(said));
      })(), { said, handedToBase: frg.handedToBase });
      rec("…and nothing is left for the modder", !note.tail, note.tail);
    }

    console.log("\n6. ⭐⭐⭐ CONTROL: with the layer below replaced, there IS no state for the island — so the piece is CARVED, as batch 15 made it");
    {
      const solo = world.mod("b16 solo", { "descriptor.mod": DESC('replace_path="history/states"\n'), ...MOD_FILES });
      const before = await srv.validate(solo);
      rec("CONTROL: the same island is cut off here too", lib.idsOf(before, "fractioned_naval_region").join(",") === "3", lib.idsOf(before, "fractioned_naval_region"));
      rec("…and nothing claims province 3 twice, because the layer below is replaced", !rulesOf(before).province_in_two_states, rulesOf(before));
      const r = await srv.autoFix(solo);
      const f = ((r.body && r.body.fixes) || {}).fractionedRegions || {};
      rec("⭐⭐⭐ a state IS made for the piece", Array.isArray(f.statesMade) && f.statesMade.length === 1 && f.statesMade[0].from === 2, f.statesMade);
      rec("…and nothing was handed to a layer below, because there is none", !f.handedToBase, f.handedToBase);
      const made = stateText(solo, f.statesMade && f.statesMade[0] && f.statesMade[0].id);
      rec("…the new state holds the island and keeps the owner, controller and cores it was carved from",
        !!made && provincesIn(made.text).join(",") === "3" && /owner\s*=\s*AAA/.test(made.text) && /controller\s*=\s*BBB/.test(made.text) && /add_core_of\s*=\s*CCC/.test(made.text),
        made && made.text);
      const after = await srv.validate(solo);
      rec("⭐⭐ and this click, too, leaves no fatal rule", fatalRules(after).length === 0, { fatal: fatalRules(after), rules: rulesOf(after) });
    }

    console.log("\n7. ⭐⭐⭐ THE INVARIANT ITSELF: creating a state over land an undeletable state's LAST province holds leaves that claim standing");
    {
      const m = world.mod("b16 create", { "descriptor.mod": DESC(""), ...MOD_FILES });
      const res = await srv.post("/api/map/create-state", { name: "", owner: "", provinces: [3] }, m);
      const b = res.body || {};
      rec("the state was created, with the island", b.ok === true && !!stateText(m, b.id) && provincesIn(stateText(m, b.id).text).join(",") === "3", b);
      rec("⭐⭐⭐ state 3 one layer down was NOT emptied — the mod holds no copy of it at all", !stateText(m, 3), stateText(m, 3) && stateText(m, 3).text);
      rec("⭐⭐ …and the answer SAYS the claim was left, naming the state and why",
        Array.isArray(b.notTaken) && b.notTaken.length === 1 && b.notTaken[0].stateId === 3 && /has no other province/.test(b.notTaken[0].reason), b.notTaken);
      rec("…on the line the page shows write warnings on", typeof b.fileWarning === "string" && /does not have sole claim/.test(b.fileWarning), b.fileWarning);
      const v = await srv.validate(m);
      const r = rulesOf(v);
      rec("⭐⭐⭐ so the map has a province in two states — reported, and NOT fatal", r.province_in_two_states === 1 && !isFatalRule("province_in_two_states"), r);
      rec("⭐⭐⭐ …rather than an empty state, which is fatal and which nothing could then delete", !r.empty_state && !r.empty_state_with_content, r);
    }
  } catch (e) {
    rec("the test ran to the end", false, String((e && e.stack) || e));
  } finally {
    if (srv) srv.close();
    world.cleanup();
  }

  console.log(`\n=== a carve must not empty a state it cannot delete: ${checks} checks, ${fails.length} failed ===`);
  if (fails.length) { for (const f of fails) console.log("  - " + f); process.exit(1); }
})();
