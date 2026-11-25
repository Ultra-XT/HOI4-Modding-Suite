// ⛔ #a-state-left-with-only-water-is-emptied (tool campaign B1-29, the data part).
//
// Erasing every LAND province of a state that also lists a lake (vanilla's 507 Southern Chile, lake 8913) left the state standing on
// the lake: the erase's answer counted the lake as a province, so emptiedStates was [] for every flip, and state_owns_no_land (an
// error) stayed after Auto-fix while the popup still offered Auto-fix for it. The data part now asks ONE question, and says the way out:
//   1. stateOwnsOnlyWater, and flipProvinceToSea's emptiedStates names a state its erase leaves holding only water;
//   2. Auto-fix does NOT delete such a state (the game loads it, and the sea-leftover pass's refusal to empty one is decided and said:
//      test-auto-fix-says-what-it-refused-rather-than-that-it-found-nothing.js): fixEmptyStates leaves it and the lake alone;
//   3. the rule declines Auto-fix (autoFix: false) and names the Map steps: 🔍 Inspect one of its provinces and set its Type to land, or
//      move a land province into it with ↔ Move province, or — for a state of the mod's own — the state panel's Delete state; a copy of
//      a base-layer state is told why Delete would not help. (Review: it said "paint a land province into it", which no tool does —
//      🖌 Paint owner gives whole states to a country.)
//   4. one Auto-fix leaves it reported, and the page's summary claims nothing about it;
//   5. ONE test: the validator and flipProvinceToSea both call stateOwnsOnlyWater (source, comments masked).
// Run: node test-a-state-left-with-only-water-is-emptied.js
"use strict";
const assert = require("assert");
const fs = require("fs"), os = require("os"), path = require("path");
const md = require("./map-data.js");
const { maskJsComments, jsBodyAt } = require("./testlib-strip-comments.js");
const TL = require("./testlib-map-page.js");
let pass = 0;
const ok = (n, c, x) => { assert.ok(c, n + (x !== undefined ? " -> " + JSON.stringify(x).slice(0, 900) : "")); console.log("  ok  " + n); pass++; };
const mk = (p, c) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, c); };
// 1 land (coastal), 2 land, 3 land (coastal), 4 sea, 5 lake.
const DEF = ["0;0;0;0;land;false;unknown;0", "1;10;0;0;land;true;plains;1", "2;20;0;0;land;false;plains;1", "3;30;0;0;land;true;plains;1",
  "4;40;0;0;sea;false;ocean;0", "5;50;0;0;lake;false;lakes;0"].join("\n") + "\n";
const state = (id, owner, provs) => `state = {\n\tid = ${id}\n\tname = "S${id}"\n\tmanpower = 1000\n\tstate_category = town\n\tprovinces = { ${provs} }\n\thistory = { owner = ${owner} add_core_of = ${owner} }\n}\n`;
const made = [];
function world(label, states, countries, opts = {}) {
  const mod = fs.mkdtempSync(path.join(os.tmpdir(), `nova-only-water-${label}-`));
  made.push(mod);
  mk(path.join(mod, "descriptor.mod"), `name="OW"\n${opts.inherit ? "" : 'replace_path="history/states"\n'}replace_path="history/countries"\nreplace_path="map"\n`);
  mk(path.join(mod, "map", "definition.csv"), DEF);
  mk(path.join(mod, "map", "strategicregions", "00.txt"), 'strategic_region = { id = 1 name = "R" provinces = { 1 2 3 4 5 } }');
  for (const [id, owner, provs] of states) mk(path.join(mod, "history", "states", `${id}-S${id}.txt`), state(id, owner, provs));
  for (const [tag, cap] of countries) mk(path.join(mod, "history", "countries", `${tag}.txt`), `capital = ${cap}\n`);
  return mod;
}
function base(states) {
  const g = fs.mkdtempSync(path.join(os.tmpdir(), "nova-only-water-base-"));
  made.push(g);
  for (const [id, owner, provs] of states) mk(path.join(g, "history", "states", `${id}-S${id}.txt`), state(id, owner, provs));
  return g;
}
const validate = (mod, gameRoot) => md.validateMapModel(md.buildMapModel({ modRoot: mod, gameRoot }));
const statesDir = (mod) => fs.readdirSync(path.join(mod, "history", "states"));

try {
  console.log("=== 1. the erase's emptiedStates counts land ===");
  {
    const mod = world("flip", [[1, "AAA", "1 5"], [2, "AAA", "2 3"]], [["AAA", 2]]);
    const r = md.flipProvinceToSea({ modRoot: mod, provinceId: 1 });
    ok("the flip of state 1's last land is accepted", r && r.changed, r);
    ok("emptiedStates names state 1, left holding only its lake", Array.isArray(r.emptiedStates) && r.emptiedStates.includes(1), r.emptiedStates);
    const k = md.flipProvinceToSea({ modRoot: mod, provinceId: 3 });
    ok("control: erasing one of state 2's two land provinces empties nothing", k && k.changed && Array.isArray(k.emptiedStates) && k.emptiedStates.length === 0, k && k.emptiedStates);
    const m = md.buildMapModel({ modRoot: mod });
    ok("stateOwnsOnlyWater: {5} yes, {2} no, an empty state no, {2 5} without 2 yes",
      md.stateOwnsOnlyWater(m, { provinces: [5] }) && !md.stateOwnsOnlyWater(m, { provinces: [2] }) && !md.stateOwnsOnlyWater(m, { provinces: [] }) && md.stateOwnsOnlyWater(m, { provinces: [2, 5] }, 2));
  }

  console.log("=== 2-3. Auto-fix leaves it; the rule names the Map steps ===");
  {
    const mod = world("own", [[1, "AAA", "5"], [2, "AAA", "2 3"]], [["AAA", 2]]);
    const row = validate(mod).find((p) => p.rule === "state_owns_no_land");
    ok("the mod's own state holding only the lake is reported", row && row.total === 1 && row.items[0].stateId === 1, row);
    ok("…declines Auto-fix (the row says it leaves the state to you)", row.autoFix === false, row);
    ok("…and names the Map steps: Inspect → land, ↔ Move province a land province in, or the state panel's Delete state (it is the mod's own)",
      /Auto-fix does not change it/.test(row.message) && /🔍 Inspect one of its provinces and set its Type to land, or move a land province into it with ↔ Move province/.test(row.message) && /delete it with the state panel's Delete state, since it is your mod's own/.test(row.message), row.message);
    ok("…and names no tool that cannot put a province into a state (🖌 Paint owner gives whole states to a country)", !/\bpaint\b/i.test(row.message.slice(row.message.indexOf("Auto-fix does not change it"))), row.message);
    const defBefore = fs.readFileSync(path.join(mod, "map", "definition.csv"), "utf8");
    const r = md.fixEmptyStates({ modRoot: mod });
    ok("fixEmptyStates deletes nothing (a state that lists a province is not empty)", r.deleted.length === 0 && statesDir(mod).includes("1-S1.txt"), r);
    ok("the lake is left as it was: definition.csv not written", fs.readFileSync(path.join(mod, "map", "definition.csv"), "utf8") === defBefore);
  }
  {
    const g = base([[7, "AAA", "1 5"]]);
    const mod = world("inh", [[7, "AAA", "5"], [2, "AAA", "2 3"]], [["AAA", 2]], { inherit: true });
    const row = validate(mod, g).find((p) => p.rule === "state_owns_no_land");
    ok("the mod's copy of base state 7, holding only the lake, is reported", row && row.total === 1 && row.items[0].stateId === 7, row);
    ok("…declines Auto-fix and says why Delete would not help, naming the land-back steps",
      row.autoFix === false && /🔍 Inspect one of its provinces and set its Type to land/.test(row.message) && /comes from the base game or a dependency, so deleting your copy would bring the original back/.test(row.message) && !/Delete state, since/.test(row.message), row.message);
  }

  console.log("=== 4. one Auto-fix, and the page's own summary ===");
  {
    const mod = world("click", [[1, "AAA", "5"], [2, "AAA", "2 3"]], [["AAA", 2]]);
    const fr = md.autoFixMap({ modRoot: mod });
    ok("autoFixMap ok", fr && fr.ok, fr && fr.error);
    ok("the state is still there, and still reported", statesDir(mod).includes("1-S1.txt") && validate(mod).some((p) => p.rule === "state_owns_no_land"));
    const line = TL.autoFixSummary(fr);
    ok("the summary claims no removal of it", !/removed 1 empty state/.test(line) && !/only water/.test(line), line);
  }

  console.log("=== 5. ONE test, asked by the validator and the erase (source, comments masked) ===");
  {
    const masked = maskJsComments(fs.readFileSync(path.join(__dirname, "map-data.js"), "utf8"));
    const bodyOf = (opening) => {
      const at = masked.indexOf(opening);
      if (at < 0 || masked.indexOf(opening, at + 1) !== -1) throw new Error("map-data.js: not found exactly once: " + opening);
      const span = jsBodyAt(masked, at);
      if (!span) throw new Error("map-data.js: no body for " + opening);
      return masked.slice(span[0], span[1] + 1);
    };
    const vm = bodyOf("function validateMapModel(");
    const push = vm.indexOf('rule: "state_owns_no_land"');
    ok("validateMapModel's state_owns_no_land collects on stateOwnsOnlyWater", push > 0 && /stateOwnsOnlyWater\s*\(\s*model\s*,\s*st\s*\)/.test(vm.slice(0, push)));
    const fl = bodyOf("function flipProvinceToSea(");
    const em = fl.indexOf("const emptiedStates =");
    ok("flipProvinceToSea's emptiedStates asks it, leaving out the erased province", em > 0 && /stateOwnsOnlyWater\s*\(\s*model\s*,\s*\{\s*provinces\s*:\s*provs\s*\}\s*,\s*pid\s*\)/.test(fl.slice(em, em + 400)));
  }
  console.log(`\ntest-a-state-left-with-only-water-is-emptied: ${pass} checks passed`);
} finally {
  for (const d of made) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) { /* a temp fixture of this test's own */ } }
}
