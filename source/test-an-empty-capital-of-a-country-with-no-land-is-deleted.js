// ⛔ #an-empty-capital-of-a-country-with-no-land-is-deleted (tool campaign B2-2, and B1-4 on a generated world).
//
// Moving or erasing the last province of a state that is the capital of a country owning NO land left FATAL empty_capital_state,
// and nothing cleared it: fixEmptyStates skipped every capital state, Set capital sets the clicked state's OWNER's capital, a landless
// country has no state to be re-pointed at, and an empty state cannot be clicked. 235 of a generated world's 1,081 states are such
// capitals. The owner's decision (Q3): such a state is DELETED, and said; what remains is the capital_state_missing_no_land warning
// HOI4 loads. A state a country that owns land names as capital keeps today's behaviour (skipped, still reported).
//
// What this pins:
//   1. fixEmptyStates deletes an empty state that only landless countries name as capital, says so (`landlessCapitals`), and skips
//      one a land-owning country names — alone or beside a landless one;
//   2. the validator then reports the landless country's capital as the WARNING, never as a fatal row;
//   3. one Auto-fix on such a map leaves no FATAL at all, and the page's own Auto-fix summary names the state and the country;
//   4. ONE landless test: validateMapModel's capital split and fixEmptyStates both ask countriesThatOwnLand (source, comments masked).
// Run: node test-an-empty-capital-of-a-country-with-no-land-is-deleted.js
"use strict";
const assert = require("assert");
const fs = require("fs"), os = require("os"), path = require("path");
const md = require("./map-data.js");
const labels = require("./public/map-rule-labels.js");
const { maskJsComments, jsBodyAt } = require("./testlib-strip-comments.js");
const TL = require("./testlib-map-page.js");
let pass = 0;
const ok = (n, c, x) => { assert.ok(c, n + (x !== undefined ? " -> " + JSON.stringify(x).slice(0, 900) : "")); console.log("  ok  " + n); pass++; };
const mk = (p, c) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, c); };
function bmp24(w, h, fn) {
  const rs = (w * 3 + 3) & ~3, is = rs * h; const b = Buffer.alloc(54 + is);
  b.write("BM", 0, "ascii"); b.writeUInt32LE(54 + is, 2); b.writeUInt32LE(54, 10); b.writeUInt32LE(40, 14);
  b.writeInt32LE(w, 18); b.writeInt32LE(h, 22); b.writeUInt16LE(1, 26); b.writeUInt16LE(24, 28); b.writeUInt32LE(0, 30); b.writeUInt32LE(is, 34);
  for (let y = 0; y < h; y++) { let o = 54 + (h - 1 - y) * rs; for (let x = 0; x < w; x++) { const [r, g, bl] = fn(x, y); b[o++] = bl; b[o++] = g; b[o++] = r; } }
  return b;
}
const COL = { 1: [10, 10, 10], 2: [20, 20, 20], 3: [30, 30, 30] };
const provAtX = (x) => (x <= 1 ? 1 : x <= 3 ? 2 : 3);
const state = (id, owner, provs) => `state = {\n\tid = ${id}\n\tname = "S${id}"\n\tmanpower = 1000\n\tstate_category = town\n\tprovinces = { ${provs} }\n\thistory = { owner = ${owner} add_core_of = ${owner} }\n}\n`;
function world(label, states, countries) {
  const mod = fs.mkdtempSync(path.join(os.tmpdir(), `nova-landless-cap-${label}-`));
  mk(path.join(mod, "descriptor.mod"), 'name="LC"\nreplace_path="history/states"\nreplace_path="history/countries"\nreplace_path="map"\n');
  mk(path.join(mod, "map", "provinces.bmp"), bmp24(6, 2, (x) => COL[provAtX(x)]));
  mk(path.join(mod, "map", "definition.csv"), ["0;0;0;0;land;false;unknown;0", "1;10;10;10;land;false;plains;1", "2;20;20;20;land;false;plains;1", "3;30;30;30;land;false;plains;1"].join("\n") + "\n");
  mk(path.join(mod, "map", "strategicregions", "00.txt"), 'strategic_region = { id = 1 name = "R" provinces = { 1 2 3 } }');
  for (const [id, owner, provs] of states) mk(path.join(mod, "history", "states", `${id}-S${id}.txt`), state(id, owner, provs));
  for (const [tag, cap] of countries) mk(path.join(mod, "history", "countries", `${tag}.txt`), `capital = ${cap}\n`);
  return mod;
}
const validate = (mod) => md.validateMapModel(md.buildMapModel({ modRoot: mod }));
const rulesOf = (ps) => ps.map((p) => p.rule);
const made = [];

try {
  console.log("=== 1. fixEmptyStates: deletes what only landless countries name as capital, keeps what a land-owner names ===");
  {
    // AAA owns state 1 (provinces 1 2) and the empty 3, 4, 5, 6 and 7; CCC owns state 2 (province 3). So AAA and CCC own land.
    // BBB names the empty 3 · CCC (owns land) names the empty 4 · DDD and EEE (no land) both name the empty 5 · nobody names the empty 6
    // · HHH (no land) names the empty 7 · III owns only the empty 8 and names it, so III owns no land either.
    const mod = world("one", [[1, "AAA", "1 2"], [2, "CCC", "3"], [3, "AAA", ""], [4, "AAA", ""], [5, "AAA", ""], [6, "AAA", ""], [7, "AAA", ""], [8, "III", ""]],
      [["AAA", 1], ["BBB", 3], ["CCC", 4], ["DDD", 5], ["EEE", 5], ["HHH", 7], ["III", 8]]);
    made.push(mod);
    const v0 = rulesOf(validate(mod));
    ok("setup: the empty capitals report as empty_capital_state", v0.filter((r) => r === "empty_capital_state").length >= 1, v0);
    const r = md.fixEmptyStates({ modRoot: mod });
    ok("state 3 (capital only of BBB, which owns no land) is deleted", r.deleted.includes(3), r);
    ok("state 5 (capital only of DDD and EEE, both landless) is deleted", r.deleted.includes(5), r);
    ok("state 8 (capital only of III, whose only state is that empty one) is deleted", r.deleted.includes(8), r);
    ok("state 4 (capital of CCC, which owns land) is skipped, as before", !r.deleted.includes(4) && r.skipped.some((s) => s.id === 4), r);
    ok("each deletion of a capital is said: landlessCapitals names the state and its countries",
      JSON.stringify(r.landlessCapitals.map((c) => [c.id, c.tags.slice().sort()]).sort((a, b) => a[0] - b[0])) === JSON.stringify([[3, ["BBB"]], [5, ["DDD", "EEE"]], [7, ["HHH"]], [8, ["III"]]]), r.landlessCapitals);
    ok("a plain empty state (6, nobody's capital) is deleted as before, with no capital note", r.deleted.includes(6) && !r.landlessCapitals.some((c) => c.id === 6), r);
    const after = validate(mod);
    const missingNoLand = after.filter((p) => p.rule === "capital_state_missing_no_land");
    ok("2. the landless countries' capitals now report as capital_state_missing_no_land, a warning",
      missingNoLand.length === 1 && missingNoLand[0].severity === "warning" && ["BBB", "DDD", "EEE", "HHH", "III"].every((t) => (missingNoLand[0].tags || []).includes(t)), missingNoLand);
    ok("…and never as the fatal capital_state_missing", !after.some((p) => p.rule === "capital_state_missing"), rulesOf(after));
    ok("…while CCC's empty capital (state 4) is still reported", after.some((p) => p.rule === "empty_capital_state" && p.stateId === 4), rulesOf(after));
  }

  console.log("=== 1b. the mixed case: an empty state a land-owner AND a landless country both name is kept ===");
  {
    const mod = world("mixed", [[1, "AAA", "1 2"], [2, "AAA", ""], [3, "CCC", "3"]], [["AAA", 2], ["BBB", 2]]);
    made.push(mod);
    const r = md.fixEmptyStates({ modRoot: mod });
    ok("state 2 (capital of AAA, which owns land, and of BBB, which owns none) is skipped", !r.deleted.includes(2) && r.skipped.some((s) => s.id === 2), r);
    ok("…and nothing is said as a landless capital", !r.landlessCapitals.length, r.landlessCapitals);
  }

  console.log("=== 3. one Auto-fix leaves no FATAL, and the page's summary names the state and the country ===");
  {
    // States 1..3, the highest (3) the empty capital of landless BBB: no id gap opens.
    const mod = world("autofix", [[1, "AAA", "1 2"], [2, "CCC", "3"], [3, "AAA", ""]], [["AAA", 1], ["CCC", 2], ["BBB", 3]]);
    made.push(mod);
    const before = validate(mod);
    ok("setup: FATAL empty_capital_state before the click", before.some((p) => p.rule === "empty_capital_state" && labels.isFatalRule(p.rule)), rulesOf(before));
    const fr = md.autoFixMap({ modRoot: mod });
    ok("autoFixMap ok", fr && fr.ok, fr && fr.error);
    const after = validate(mod);
    const fatal = after.filter((p) => p.severity === "error" && labels.isFatalRule(p.rule));
    ok("no FATAL is left after ONE Auto-fix", fatal.length === 0, rulesOf(fatal));
    ok("what remains of BBB's capital is the warning", after.some((p) => p.rule === "capital_state_missing_no_land" && (p.tags || []).includes("BBB")), rulesOf(after));
    const es = (fr.fixes || {}).emptyStates || {};
    ok("the click's answer says it: emptyStates.landlessCapitals names state 3 and BBB", (es.landlessCapitals || []).some((c) => c.id === 3 && (c.tags || []).includes("BBB")), es);
    const line = TL.autoFixSummary(fr);
    ok("the page's own Auto-fix summary names the state and the country that owns no land", /state 3\b[^.]*capital only of BBB, which owns no land/.test(line), line);
  }

  console.log("=== 4. ONE landless test, asked by the validator's capital split and by fixEmptyStates (source, comments masked) ===");
  {
    const src = fs.readFileSync(path.join(__dirname, "map-data.js"), "utf8");
    const masked = maskJsComments(src);
    const bodyOf = (opening) => {
      const at = masked.indexOf(opening);
      if (at < 0 || masked.indexOf(opening, at + 1) !== -1) throw new Error("map-data.js: not found exactly once: " + opening);
      const span = jsBodyAt(masked, at);
      if (!span) throw new Error("map-data.js: no body for " + opening);
      return masked.slice(span[0], span[1] + 1);
    };
    const fes = bodyOf("function fixEmptyStates(");
    ok("fixEmptyStates asks countriesThatOwnLand", /countriesThatOwnLand\s*\(\s*model\.states\s*\)/.test(fes));
    ok("…and no longer skips every capital state wholesale", !/capitalStates\.has\s*\(/.test(fes));
    const vm = bodyOf("function validateMapModel(");
    const split = vm.indexOf('rule: "capital_state_missing_no_land"');
    const ask = vm.lastIndexOf("const landOwners = countriesThatOwnLand(model.states)", split);
    const between = ask > 0 ? vm.slice(ask, split) : "";
    ok("validateMapModel's missing-capital split asks the same countriesThatOwnLand, and splits the tags on it",
      split > 0 && ask > 0 && /tags\.filter\(\(t\) => !landOwners\.has\(t\)\)/.test(between) && !/landOwners\s*=\s*new Set/.test(between) && !/landOwners\.add\(/.test(between), { split, ask });
    const def = bodyOf("function countriesThatOwnLand(");
    ok("countriesThatOwnLand counts a state's owner once it lists a province", /\.provinces/.test(def) && /\.owner/.test(def));
  }
  console.log(`\ntest-an-empty-capital-of-a-country-with-no-land-is-deleted: ${pass} checks passed`);
} finally {
  for (const d of made) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) { /* a temp fixture of this test's own */ } }
}
