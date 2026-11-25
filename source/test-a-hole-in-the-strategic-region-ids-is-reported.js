// A hole in the strategic region ids — region 4 missing between 3 and 5 — is reported as a fatal map error, when the
// mod made it. #a-hole-in-the-strategic-region-ids
//
// THE DEFECT. Nova checks that STATE ids run 1…max (state_id_gap, FATAL) but had no rule at all for strategic region
// ids, which the game keeps in the same kind of id-indexed table.
//
// THE EVIDENCE:
//   * HOI4 wiki, Strategic region modding: region ids must be added sequentially; "skipping numbers will cause
//     crashes".
//   * hoi4.exe 1.19.2 carries "Hole in Strategic Regions DB at ID = " (map_graphics/gradientbordermanager.cpp),
//     logged for an empty slot in the region table. The map check that runs on every modded load (VA 0x1401E6380 in 1.19.4.1,
//     gamestate.cpp) reads every slot of that same table with no empty-slot test, while its caller does test for one
//     — so an empty slot is an expected state, and the check dereferences it.
//   * 0 holes on the six shipping maps (vanilla 1..304, MD 1..220, R56 1..298, OWB 1..226, NV 1..236, RoN 1..228),
//     and Nova's own region tool always takes max+1, so only a hand edit or another tool makes one.
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

const HOME = fs.mkdtempSync(path.join(os.tmpdir(), "nova-regionhole-home-"));
process.env.NOVA_HOME_DIR = HOME;
const md = require("./map-data.js");
const labels = require("./public/map-rule-labels.js");
const tmps = [HOME];
const mk = (p, c) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, c); };
const rg = (id, provs) => `strategic_region = {\n\tid = ${id}\n\tname = "R${id}"\n\tprovinces = { ${provs.join(" ")} }\n\tweather = {}\n}\n`;
const DEF = ["0;0;0;0;land;false;unknown;0"].concat([1, 2, 3, 4, 5, 6].map((i) => `${i};${i * 20};${i * 9};${i * 5};sea;false;ocean;0`)).join("\r\n") + "\r\n";

function game(ids) {
  const g = fs.mkdtempSync(path.join(os.tmpdir(), "nova-regionhole-game-")); tmps.push(g);
  mk(path.join(g, "map", "definition.csv"), DEF);
  for (const id of ids) mk(path.join(g, "map", "strategicregions", `${id}.txt`), rg(id, [id]));
  return g;
}
const mod = (tag, files, descriptorExtra = "") => {
  const m = fs.mkdtempSync(path.join(os.tmpdir(), "nova-regionhole-" + tag + "-")); tmps.push(m);
  mk(path.join(m, "descriptor.mod"), `name="${tag}"\nsupported_version="1.19.*"\n${descriptorExtra}`);
  for (const [rel, body] of Object.entries(files)) mk(path.join(m, ...rel.split("/")), body);
  return m;
};
const holes = (modRoot, gameRoot) => {
  md.clearMapLayerCache();
  return md.validateMapModel(md.buildMapModel({ modRoot, gameRoot, dependencyRoots: [], cacheStableLayers: true })).filter((p) => p.rule === "strategic_region_id_gap");
};

try {
  console.log("1. The rule, its severity and its place in the Save gate");
  {
    const g = game([1, 2, 3]);
    const found = holes(mod("gap", { "map/strategicregions/5.txt": rg(5, [5]) }), g);
    rec("⭐⭐⭐ a mod adding region 5 after 1..3 is told region 4 is missing", found.length === 1 && (found[0].missing || []).join(",") === "4", found);
    const p = found[0] || {};
    rec("…as an error", p.severity === "error", p.severity);
    rec("⭐⭐ …which gates Save", labels.isFatalRule("strategic_region_id_gap") === true);
    rec("…with a label", !!labels.LABELS.strategic_region_id_gap);
    rec("⭐ …and a hint that names the hand fix, weatherpositions rows included", /weatherpositions/.test(labels.mapRuleFixHint("strategic_region_id_gap")), labels.mapRuleFixHint("strategic_region_id_gap"));
    rec("the message names the engine's own complaint", /Hole in Strategic Regions DB/.test(p.message || ""), p.message);
  }

  console.log("\n2. The controls");
  {
    const g = game([1, 2, 3]);
    rec("a contiguous 1..4 is not reported", holes(mod("next", { "map/strategicregions/4.txt": rg(4, [4]) }), g).length === 0);
    rec("an add-on that ships no regions is not reported", holes(mod("empty", {}), g).length === 0);
  }

  console.log("\n3. ⛔ An inherited hole is the base's, not the add-on's");
  {
    const g = game([1, 2, 4]);
    rec("browsing that base itself reports region 3 missing", (holes(null, g)[0] || {}).missing + "" === "3", holes(null, g));
    rec("⭐⭐⭐ an add-on shipping nothing is not blamed for it", holes(mod("inherit", {}), g).length === 0, holes(mod("inherit", {}), g));
    const own = holes(mod("inheritplus", { "map/strategicregions/7.txt": rg(7, [6]) }), g);
    rec("⭐⭐ …but a hole the add-on opens on top of it is, and only that one", own.length === 1 && (own[0].missing || []).join(",") === "5,6", own);
  }

  console.log("\n4. A mod that replaces the folder owns every hole in it");
  {
    const g = game([1, 2, 3]);
    const found = holes(mod("replace", { "map/strategicregions/1.txt": rg(1, [1]), "map/strategicregions/3.txt": rg(3, [3]) }, 'replace_path="map/strategicregions"\n'), g);
    rec("region 2 is missing from the mod's own 1 and 3", found.length === 1 && (found[0].missing || []).join(",") === "2", found);
  }

  console.log(`\n=== a hole in the strategic region ids is reported: ${checks} checks, ${fails.length} failed ===`);
  if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
} catch (e) {
  console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 10).join("\n") : e);
  process.exitCode = 1;
} finally {
  for (const d of tmps) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} }
}
