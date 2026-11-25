// A map hoi4.exe refuses to load — a land province with no state, a province with no strategic region, a state
// spread over two strategic regions — is a FATAL error that gates Save, reported only when the mod could have
// caused it, and its message says what the game really does. #a-map-the-game-refuses-to-load
//
// THE DEFECT. All three were "error" and none was in the curated FATAL set, so Save never gated on them — while
// state_split_strategic_regions' own message said "HOI4 will crash on launch", land_not_in_state claimed "errors in
// the map definition" and province_no_region hedged "can crash". None of the three asked whether the mod had caused
// the problem, so an add-on inherited the base layer's (measured: an add-on fixture was told land_not_in_state for
// two provinces that are stateless in the base game, not in the add-on). And province_not_in_region fired for the
// same provinces as province_no_region, one problem reported twice.
//
// THE EVIDENCE — hoi4.exe 1.19.2 (a729), read with dumpbin, no launch:
//   * All three MAP_ERROR texts are logged from gamestate.cpp inside one function (VA 0x1401E3F70 in 1.19.4.1): "The land
//     province … has no state." at line 2890 and "The province … has no strategic region assigned." at 2897 each
//     clear the same local ok-flag; "State … belonging to different strategic areas" (line 2767) makes the state check
//     it calls (0x1401CF9C0, 1.19.2) return false, exactly as "Definition for state id … is either missing or invalid" does —
//     the state-id gap Nova already gates on.
//   * Any failure calls 0x140201F90 (1.19.4.1), which records IsMapInGoodState "no" and, unless the global the "debug" launch
//     argument sets is on, shows MAP_LOADING_ERROR_TITLE ("Failed to load the map") and calls the CRT abort()
//     (int 29h fast-fail 7, STATUS_FATAL_APP_EXIT, _exit 3).
//   * The owner's two crash folders (2026-09-08 21:00, 2026-09-09 09:55) read "IsMapInGoodState: no" beside only
//     "has no state" MAP_ERRORs, and both were launched "--debug" — which is why those games went on loading.
//   * 0 of 95,434 provinces lack a region and 0 of 7,494 states are split on the six shipping maps.
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (detail == null ? "" : "   " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 260)));
  if (!ok) fails.push(label);
};

const HOME = fs.mkdtempSync(path.join(os.tmpdir(), "nova-refusedmap-home-"));
process.env.NOVA_HOME_DIR = HOME;
const md = require("./map-data.js");
const labels = require("./public/map-rule-labels.js");
const { maskJsComments } = require("./testlib-strip-comments.js");
const tmps = [HOME];
const mk = (p, c) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, c); };

// The three engine texts, as hoi4.exe logs them. Every Nova rule that quotes one is derived from the source below.
const ENGINE_TEXTS = ["has no state.", "has no strategic region assigned.", "belonging to different strategic areas"];

const defRow = (id, type) => `${id};${id * 10};${id * 7 % 256};${id * 3};${type};false;${type === "sea" ? "ocean" : "plains"};${type === "sea" ? 0 : 1}`;
const BASE_DEF = ["0;0;0;0;land;false;unknown;0", defRow(1, "land"), defRow(2, "land"), defRow(3, "land"), defRow(4, "land"), defRow(5, "land"), defRow(6, "land"), defRow(7, "sea")];
const st = (id, provs) => `state = {\n\tid = ${id}\n\tname = "STATE_${id}"\n\tmanpower = 1000\n\tstate_category = rural\n\tprovinces = { ${provs.join(" ")} }\n}\n`;
const rg = (id, provs) => `strategic_region = {\n\tid = ${id}\n\tname = "R${id}"\n\tprovinces = { ${provs.join(" ")} }\n\tweather = {}\n}\n`;

// THE BASE GAME already ships all three problems: state 2 = {3 4} spans regions 10 and 20; land 5 is in no state;
// land 6 is in no state and no region.
function makeGame() {
  const g = fs.mkdtempSync(path.join(os.tmpdir(), "nova-refusedmap-game-")); tmps.push(g);
  mk(path.join(g, "map", "definition.csv"), BASE_DEF.join("\r\n") + "\r\n");
  mk(path.join(g, "map", "strategicregions", "10.txt"), rg(10, [1, 2, 3]));
  mk(path.join(g, "map", "strategicregions", "20.txt"), rg(20, [4, 5, 7]));
  mk(path.join(g, "history", "states", "1-S.txt"), st(1, [1, 2]));
  mk(path.join(g, "history", "states", "2-S.txt"), st(2, [3, 4]));
  return g;
}
const mod = (tag, files) => {
  const m = fs.mkdtempSync(path.join(os.tmpdir(), "nova-refusedmap-" + tag + "-")); tmps.push(m);
  mk(path.join(m, "descriptor.mod"), `name="${tag}"\nsupported_version="1.19.*"\n`);
  for (const [rel, body] of Object.entries(files)) mk(path.join(m, ...rel.split("/")), body);
  return m;
};
const problemsOf = (modRoot, gameRoot) => {
  md.clearMapLayerCache();
  return md.validateMapModel(md.buildMapModel({ modRoot, gameRoot, dependencyRoots: [], cacheStableLayers: true }));
};
const listed = (probs, rule) => [].concat(...probs.filter((p) => p.rule === rule).map((p) => p.provinces || [])).sort((a, b) => a - b);
const splitStates = (probs) => probs.filter((p) => p.rule === "state_split_strategic_regions").map((p) => p.stateId).sort((a, b) => a - b);

try {
  console.log("1. The rules that quote the engine's refusal, derived from map-data.js");
  const src = maskJsComments(fs.readFileSync(path.join(__dirname, "map-data.js"), "utf8"));
  const pushes = [];
  for (const m of src.matchAll(/rule:\s*"([a-z0-9_]+)"/g)) {
    const end = src.indexOf("});", m.index);
    pushes.push({ rule: m[1], text: src.slice(m.index, end < 0 ? m.index + 1500 : end) });
  }
  const refusing = [];
  for (const needle of ENGINE_TEXTS) {
    const rules = [...new Set(pushes.filter((p) => p.text.includes(needle)).map((p) => p.rule))];
    rec(`exactly one rule quotes "${needle}"`, rules.length === 1, rules);
    refusing.push(...rules);
  }
  for (const r of refusing) {
    rec(`⭐⭐⭐ ${r} is in the FATAL set, so Save gates on it`, labels.isFatalRule(r) === true);
    rec(`${r} has a label and a concrete fix hint`, !!labels.LABELS[r] && labels.mapRuleFixHint(r).length > 40, labels.mapRuleFixHint(r));
  }
  rec("province_not_in_region, the narrower duplicate, stays out of FATAL", labels.isFatalRule("province_not_in_region") === false);

  const game = makeGame();

  console.log("\n2. Browsing the base game itself: its problems are reported — there is nobody else to attribute them to");
  {
    const probs = problemsOf(null, game);
    rec("land 5 and 6 have no state", listed(probs, "land_not_in_state").join(",") === "5,6", listed(probs, "land_not_in_state"));
    rec("province 6 has no region", listed(probs, "province_no_region").join(",") === "6", listed(probs, "province_no_region"));
    rec("state 2 is split", splitStates(probs).join(",") === "2", splitStates(probs));
    for (const r of refusing) {
      const p = probs.find((x) => x.rule === r) || {};
      rec(`${r} is an error`, p.severity === "error", p.severity);
      rec(`⭐⭐ ${r} says the game fails to load the map, and when`, /Failed to load the map/.test(p.message || "") && /-debug/.test(p.message || ""), p.message);
      rec(`⭐ ${r} no longer hedges or overstates ("can crash" / "will crash on launch")`, !/can crash|will crash on launch/i.test(p.message || ""), p.message);
    }
    rec("⭐ province_not_in_region does not repeat province_no_region", listed(probs, "province_not_in_region").length === 0, listed(probs, "province_not_in_region"));
  }

  console.log("\n3. ⛔⛔⛔ An add-on that ships nothing of its map inherits none of them");
  {
    const probs = problemsOf(mod("addon", {}), game);
    for (const r of refusing) rec(`⭐⭐⭐ ${r} is not reported against the add-on`, !probs.some((p) => p.rule === r), probs.filter((p) => p.rule === r).map((p) => p.message));
    rec("…nor province_not_in_region", !probs.some((p) => p.rule === "province_not_in_region"));
  }

  console.log("\n4. ⭐⭐⭐ …but each one the MOD causes is reported, and only that one");
  {
    const a = problemsOf(mod("unstate", { "history/states/1-S.txt": st(1, [1]) }), game);
    rec("the mod took province 2 out of state 1: land_not_in_state names 2, not the base game's 5 or 6", listed(a, "land_not_in_state").join(",") === "2", listed(a, "land_not_in_state"));

    const b = problemsOf(mod("unregion", { "map/strategicregions/10.txt": rg(10, [1, 2]) }), game);
    rec("the mod took province 3 out of region 10: province_no_region names 3, not the base game's 6", listed(b, "province_no_region").join(",") === "3", listed(b, "province_no_region"));
    rec("…and province_not_in_region does not say it again", listed(b, "province_not_in_region").length === 0, listed(b, "province_not_in_region"));

    const c = problemsOf(mod("invent", { "map/definition.csv": BASE_DEF.concat([defRow(8, "land")]).join("\r\n") + "\r\n" }), game);
    rec("the mod invented land province 8: it has no state", listed(c, "land_not_in_state").join(",") === "8", listed(c, "land_not_in_state"));
    rec("…and no region", listed(c, "province_no_region").join(",") === "8", listed(c, "province_no_region"));

    const d = problemsOf(mod("splitstate", { "history/states/1-S.txt": st(1, [1, 2, 5]) }), game);
    rec("the mod put province 5 (region 20) into its state 1 (region 10): state 1 is reported, the base game's state 2 is not", splitStates(d).join(",") === "1", splitStates(d));

    const e = problemsOf(mod("splitregion", { "map/strategicregions/10.txt": rg(10, [1, 3]), "map/strategicregions/20.txt": rg(20, [2, 4, 5, 7]) }), game);
    rec("the mod's own region files split the inherited state 1: it is reported", splitStates(e).includes(1), splitStates(e));
  }

  console.log(`\n=== a map the game refuses to load is fatal when the mod made it: ${checks} checks, ${fails.length} failed ===`);
  if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
} catch (e) {
  console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 10).join("\n") : e);
  process.exitCode = 1;
} finally {
  for (const d of tmps) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} }
}
