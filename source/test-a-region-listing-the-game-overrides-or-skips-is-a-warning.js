// A strategic-region listing HOI4 overrides or skips is reported as a warning: a province listed by two regions (or
// twice by one), and a region naming a province definition.csv does not define. #a-region-listing-the-game-overrides
//
// THE DEFECT. Neither had a rule. model.provinceToRegion keeps the LAST listing silently, so a province in two regions
// looked like it was in one; state_split_strategic_regions caught it only when the winning region differed from the
// rest of the state, and a sea province (no state) or a repeat inside one region was never mentioned. A region naming
// a province that does not exist was invisible.
//
// THE EVIDENCE — hoi4.exe 1.19.2, strategicregion.cpp:
//   * "Province has added another strategic region as theirs. Might be duplicates of this province in strategic
//     regions templates. ProvinceID  = … first region: … overridden by: … - did you move provinces about without
//     making sure they moved in regions?" — the later listing wins, and it is logged.
//   * "Province '…' added twice to strategic area …" — the repeat is logged and ignored.
//   * "invalid province '…' in Strategic region …" — the entry is logged and skipped.
//   None carries a MAP_ERROR prefix or reaches the map-load check, so both rules are warnings, not FATAL.
//   * 0 double listings, 0 repeats and 0 undefined provinces on the six shipping maps.
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

const HOME = fs.mkdtempSync(path.join(os.tmpdir(), "nova-regionlist-home-"));
process.env.NOVA_HOME_DIR = HOME;
const md = require("./map-data.js");
const labels = require("./public/map-rule-labels.js");
const tmps = [HOME];
const mk = (p, c) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, c); };
const rg = (id, provs) => `strategic_region = {\n\tid = ${id}\n\tname = "R${id}"\n\tprovinces = { ${provs.join(" ")} }\n\tweather = {}\n}\n`;
const defRows = (ids) => ["0;0;0;0;land;false;unknown;0"].concat(ids.map((i) => `${i};${i * 20};${i * 9};${i * 5};sea;false;ocean;0`)).join("\r\n") + "\r\n";

function game(regions, defIds = [1, 2, 3, 4]) {
  const g = fs.mkdtempSync(path.join(os.tmpdir(), "nova-regionlist-game-")); tmps.push(g);
  mk(path.join(g, "map", "definition.csv"), defRows(defIds));
  for (const [id, provs] of Object.entries(regions)) mk(path.join(g, "map", "strategicregions", `${id}.txt`), rg(id, provs));
  return g;
}
const mod = (tag, files) => {
  const m = fs.mkdtempSync(path.join(os.tmpdir(), "nova-regionlist-" + tag + "-")); tmps.push(m);
  mk(path.join(m, "descriptor.mod"), `name="${tag}"\nsupported_version="1.19.*"\n`);
  for (const [rel, body] of Object.entries(files)) mk(path.join(m, ...rel.split("/")), body);
  return m;
};
const probs = (modRoot, gameRoot, rule) => {
  md.clearMapLayerCache();
  return md.validateMapModel(md.buildMapModel({ modRoot, gameRoot, dependencyRoots: [], cacheStableLayers: true })).filter((p) => p.rule === rule);
};
const provsOf = (ps) => [].concat(...ps.map((p) => p.provinces || [])).sort((a, b) => a - b);

try {
  const CLEAN = { 10: [1, 2], 20: [3, 4] };

  console.log("1. ⭐⭐ province_in_two_regions");
  {
    const g = game(CLEAN);
    const two = probs(mod("two", { "map/strategicregions/20.txt": rg(20, [3, 4, 2]) }), g, "province_in_two_regions");
    rec("⭐⭐⭐ the mod lists province 2 in region 20 as well as the base's region 10: reported", provsOf(two).join(",") === "2", two);
    const p = two[0] || {};
    rec("…as a warning, not FATAL", p.severity === "warning" && labels.isFatalRule("province_in_two_regions") === false, p.severity);
    rec("…naming both regions", /10/.test(p.message || "") && /20/.test(p.message || ""), p.message);
    rec("⭐ …and saying the game keeps one of them and logs it", /overridden|reads last|keeps/i.test(p.message || ""), p.message);
    const twice = probs(mod("twice", { "map/strategicregions/10.txt": rg(10, [1, 2, 1]) }), g, "province_in_two_regions");
    rec("⭐⭐ a repeat inside one region counts too", provsOf(twice).join(",") === "1", twice);
    rec("a clean overlay is not reported", probs(mod("clean", { "map/strategicregions/10.txt": rg(10, [1, 2]) }), g, "province_in_two_regions").length === 0);
  }
  {
    const g = game({ 10: [1, 2], 20: [3, 4, 2] });
    rec("browsing a base that lists 2 twice reports it", provsOf(probs(null, g, "province_in_two_regions")).join(",") === "2");
    rec("⭐⭐⭐ an add-on shipping no regions inherits none of it", probs(mod("inherit", {}), g, "province_in_two_regions").length === 0);
    rec("…nor one shipping an unrelated region", probs(mod("unrelated", { "map/strategicregions/30.txt": rg(30, []) }), g, "province_in_two_regions").length === 0);
  }

  console.log("\n2. ⭐⭐ region_province_not_in_definition");
  {
    const g = game(CLEAN);
    const bad = probs(mod("ghost", { "map/strategicregions/20.txt": rg(20, [3, 4, 99]) }), g, "region_province_not_in_definition");
    rec("⭐⭐⭐ the mod's region 20 names province 99, which no definition.csv row defines: reported", provsOf(bad).join(",") === "99", bad);
    const p = bad[0] || {};
    rec("…as a warning, not FATAL", p.severity === "warning" && labels.isFatalRule("region_province_not_in_definition") === false, p.severity);
    rec("⭐ …saying the game skips the entry", /skip/i.test(p.message || ""), p.message);
    const dropped = probs(mod("dropped", { "map/definition.csv": defRows([1, 2, 3]) }), g, "region_province_not_in_definition");
    rec("⭐⭐ a mod whose definition.csv drops province 4, still listed by the base's region 20, made that itself", provsOf(dropped).join(",") === "4", dropped);
  }
  {
    const g = game({ 10: [1, 2], 20: [3, 4, 99] });
    rec("browsing a base whose region names 99 reports it", provsOf(probs(null, g, "region_province_not_in_definition")).join(",") === "99");
    rec("⭐⭐⭐ an add-on shipping nothing inherits none of it", probs(mod("inherit2", {}), g, "region_province_not_in_definition").length === 0);
  }

  console.log("\n3. Both read as plain English, with a hand fix");
  for (const r of ["province_in_two_regions", "region_province_not_in_definition"]) {
    rec(`${r} has a label`, !!labels.LABELS[r]);
    rec(`${r} has a fix hint`, labels.mapRuleFixHint(r).length > 40, labels.mapRuleFixHint(r));
  }

  console.log(`\n=== a region listing the game overrides or skips is a warning: ${checks} checks, ${fails.length} failed ===`);
  if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
} catch (e) {
  console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 10).join("\n") : e);
  process.exitCode = 1;
} finally {
  for (const d of tmps) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} }
}
