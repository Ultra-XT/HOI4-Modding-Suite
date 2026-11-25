// A mod's map/strategicregions, history/states or map/supplyareas file at the same path as a lower layer's replaces that
// file WHOLESALE in Nova's map, as it does in the game — whatever ids either defines. #a-same-named-file-replaces-the-lower-one
//
// THE DEFECT. buildMapModel merged strategic regions, states and supply areas BY ID across the base game, dependencies
// and the mod. HOI4 loads a folder as the union of every layer's files BY RELATIVE PATH: a higher layer's file at the same
// path is the only one read (CLAUDE.md: a common/ file is replaced "wholesale at the same relative path"; buildMapModel's
// own capital merge is by filename for exactly this reason). So a mod that renumbers region 304 to 305 inside its own copy
// of "304-North-Western Australia.txt" leaves the game with no region 304 — a hole in the region ids, which Nova gates
// Save on (strategic_region_id_gap, FATAL) — while Nova kept vanilla's 304 beside the mod's 305.
//
// MEASURED on 113d5b5 with the owner's launch-test build "Nova Launch Test 4 - gap in strategic region ids" (one file:
// vanilla's 304-North-Western Australia.txt with id=305): no strategic_region_id_gap, province_in_two_regions (a warning)
// instead, and region 304 still in the model with vanilla's ten provinces — a Save gate that should fire and did not.
// A read-only census of 38 local mod roots (the owner's mod folder and the workshop, dependencies resolved by name) and
// vanilla found that build the ONLY root where the by-id merge and the by-path file system disagree on which region,
// state or supply-area ids exist; the others that ship same-named files keep the same ids in them.
//
// THE FIX. blocksThatLoad drops a layer's file when a higher layer ships one at the same path, before the by-id merge —
// in buildMapModel for all three folders and in the layers-below readers the ownership gates use, so a hole a DEPENDENCY
// opens this way is still that dependency's, not an add-on's (section 2).
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

let checks = 0, skips = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (ok || detail == null ? "" : "   -> " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 320)));
  if (!ok) fails.push(label);
};
const skip = (label) => { skips++; console.log("  SKIP " + label); };

const HOME = fs.mkdtempSync(path.join(os.tmpdir(), "nova-samename-home-"));
process.env.NOVA_HOME_DIR = HOME;
const md = require("./map-data.js");
const labels = require("./public/map-rule-labels.js");
const tmps = [HOME];

function dir(tag, files) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "nova-samename-" + tag + "-")); tmps.push(d);
  for (const [rel, body] of Object.entries(files)) {
    const p = path.join(d, ...rel.split("/"));
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, body);
  }
  return d;
}
const rg = (id, provs) => `strategic_region = {\n\tid = ${id}\n\tname = "R${id}"\n\tprovinces = { ${provs.join(" ")} }\n\tweather = {}\n}\n`;
const st = (id, provs) => `state = {\n\tid = ${id}\n\tname = "STATE_${id}"\n\tmanpower = 1000\n\tstate_category = rural\n\tprovinces = { ${provs.join(" ")} }\n}\n`;
const sa = (id, states) => `supply_area = {\n\tid = ${id}\n\tname = "SA${id}"\n\tvalue = 1\n\tstates = { ${states.join(" ")} }\n}\n`;
const DEF = ["0;0;0;0;land;false;unknown;0"].concat([1, 2, 3, 4].map((i) => `${i};${i * 40};${i * 9};${i * 5};land;false;plains;1`)).join("\n") + "\n";

const model = (modRoot, gameRoot, dependencyRoots = []) => { md.clearMapLayerCache(); return md.buildMapModel({ modRoot, gameRoot, dependencyRoots, cacheStableLayers: false }); };
const rules = (m, rule) => md.validateMapModel(m).filter((p) => p.rule === rule);
const ids = (list) => (list || []).map((x) => x.id).sort((a, b) => a - b);
const mod = (tag, files, extra = "") => dir(tag, { "descriptor.mod": `name="${tag}"\nsupported_version="1.19.*"\n${extra}`, ...files });

try {
  // The base: regions 1-3 in 1.txt..3.txt, states 1-3 in 1-A.txt..3-C.txt, one supply area in 1-SA.txt.
  const GAME = dir("game", {
    "map/definition.csv": DEF,
    "map/strategicregions/1.txt": rg(1, [1]), "map/strategicregions/2.txt": rg(2, [2]), "map/strategicregions/3.txt": rg(3, [3, 4]),
    "history/states/1-A.txt": st(1, [1]), "history/states/2-B.txt": st(2, [2]), "history/states/3-C.txt": st(3, [3, 4]),
    "map/supplyareas/1-SA.txt": sa(1, [1, 2, 3]),
  });

  console.log("\n=== 1. ⛔ a mod renumbering the region inside its copy of the base's 2.txt ===");
  {
    const m = model(mod("renumber", { "map/strategicregions/2.txt": rg(4, [2]) }), GAME);
    rec("⭐⭐⭐ the model has no region 2 — the base's 2.txt no longer loads", !ids(m.strategicRegions).includes(2), ids(m.strategicRegions));
    rec("…and has the mod's region 4 in its place", ids(m.strategicRegions).join() === "1,3,4" && m.provinceToRegion[2] === 4, { regions: ids(m.strategicRegions), p2: m.provinceToRegion[2] });
    const gap = rules(m, "strategic_region_id_gap");
    rec("⭐⭐⭐ strategic_region_id_gap names region 2", gap.length === 1 && (gap[0].missing || []).join() === "2", gap.map((p) => p.missing));
    rec("⭐⭐ …which gates Save", labels.isFatalRule("strategic_region_id_gap") === true);
    rec("⭐⭐ no province is reported in two regions — province 2 is listed once in what loads", rules(m, "province_in_two_regions").length === 0,
      rules(m, "province_in_two_regions").map((p) => p.provinces));
  }
  {
    const m = model(mod("verbatim", { "map/strategicregions/2.txt": rg(2, [2]) }), GAME);
    rec("THE CONTROL: a copy that keeps id 2 changes nothing", ids(m.strategicRegions).join() === "1,2,3" && rules(m, "strategic_region_id_gap").length === 0, ids(m.strategicRegions));
    const other = model(mod("othername", { "map/strategicregions/4.txt": rg(4, [2]) }), GAME);
    rec("THE CONTROL: region 4 in a file of another name leaves the base's 2.txt loaded", ids(other.strategicRegions).join() === "1,2,3,4", ids(other.strategicRegions));
    rec("…where province 2 really is listed twice, and is reported", rules(other, "province_in_two_regions").some((p) => (p.provinces || []).includes(2)),
      rules(other, "province_in_two_regions").map((p) => p.provinces));
  }

  console.log("\n=== 2. a dependency that renumbers it: the hole is the dependency's, not an add-on's ===");
  {
    const DEP = mod("dep", { "map/strategicregions/2.txt": rg(4, [2]) });
    const own = model(DEP, GAME);
    rec("THE CONTROL: the dependency, validated on its own, is told region 2 is missing", (rules(own, "strategic_region_id_gap")[0] || {}).missing + "" === "2", rules(own, "strategic_region_id_gap"));
    const addon = mod("addon", {}, 'dependencies={ "dep" }\n');
    const m = model(addon, GAME, [DEP]);
    rec("⭐⭐ the add-on's model has no region 2 either", !ids(m.strategicRegions).includes(2), ids(m.strategicRegions));
    rec("⭐⭐⭐ …and the add-on is not told about a hole it did not open", rules(m, "strategic_region_id_gap").length === 0, rules(m, "strategic_region_id_gap").map((p) => p.missing));
  }

  console.log("\n=== 3. history/states: the same rule ===");
  {
    const m = model(mod("state", { "history/states/2-B.txt": st(4, [2]) }), GAME);
    rec("⭐⭐ the model has no state 2 — the base's 2-B.txt no longer loads", ids(m.states).join() === "1,3,4", ids(m.states));
    rec("⭐⭐ …so province 2 is state 4's", m.provinceToState[2] === 4, m.provinceToState[2]);
    rec("⭐ state_id_gap names state 2", (rules(m, "state_id_gap")[0] || {}).missing + "" === "2", rules(m, "state_id_gap").map((p) => p.missing));
    const other = model(mod("state-other", { "history/states/4-D.txt": st(4, [4]) }), GAME);
    rec("THE CONTROL: state 4 in a file of another name leaves every base state loaded", ids(other.states).join() === "1,2,3,4", ids(other.states));
    const same = model(mod("state-same", { "history/states/2-B.txt": st(2, [2]) }), GAME);
    const s2 = (same.states || []).find((s) => s.id === 2);
    rec("THE CONTROL: a copy that keeps id 2 is the mod's state 2, which the base also defines", !!s2 && s2.inBaseLayer === true && md.readStatesFromRoot(GAME).some((s) => s.id === 2), s2 && { inBaseLayer: s2.inBaseLayer });
  }

  console.log("\n=== 4. map/supplyareas: the same rule ===");
  {
    const m = model(mod("area", { "map/supplyareas/1-SA.txt": sa(2, [1, 2, 3]) }), GAME);
    rec("⭐ the model has only the mod's supply area 2", ids(m.supplyAreas).join() === "2", ids(m.supplyAreas));
  }

  console.log("\n=== 5. the owner's launch test, rebuilt over the installed base game (read-only; only a temp mod is written) ===");
  {
    const VAN = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
    const FILE = "304-North-Western Australia.txt";
    const src = path.join(VAN, "map", "strategicregions", FILE);
    if (!fs.existsSync(src)) {
      skip("the base game is not installed — the corpus half did NOT run");
    } else {
      const text = fs.readFileSync(src, "utf8");
      const renumbered = text.replace(/(^|\n)(\s*id\s*=\s*)304\b/, (all, a, b) => a + b + "305");
      rec("THE CONTROL: vanilla's file defines region 304, and the copy defines 305", /id\s*=\s*304\b/.test(text) && /id\s*=\s*305\b/.test(renumbered) && !/id\s*=\s*304\b/.test(renumbered));
      const t0 = Date.now();
      const m = model(mod("launch4", { [`map/strategicregions/${FILE}`]: renumbered }), VAN);
      const listed = (md.parseStrategicRegions(text)[0] || {}).provinces || [];
      rec(`⭐⭐⭐ the model has no region 304 (${Date.now() - t0} ms)`, !ids(m.strategicRegions).includes(304) && ids(m.strategicRegions).includes(305), ids(m.strategicRegions).slice(-4));
      const gap = rules(m, "strategic_region_id_gap");
      rec("⭐⭐⭐ strategic_region_id_gap names 304 — the Save gate fires", gap.length === 1 && (gap[0].missing || []).includes(304), gap.map((p) => p.missing));
      rec("⭐⭐ none of region 304's provinces is reported in two regions", listed.length > 0 && !rules(m, "province_in_two_regions").some((p) => (p.provinces || []).some((x) => listed.includes(x))),
        rules(m, "province_in_two_regions").map((p) => p.provinces));
      const ctl = model(mod("launch0", { [`map/strategicregions/${FILE}`]: text }), VAN);
      rec("THE CONTROL: the same file verbatim — no hole, and region 304 is the mod's copy", rules(ctl, "strategic_region_id_gap").length === 0
        && ((ctl.strategicRegions || []).find((r) => r.id === 304) || {}).file === FILE, rules(ctl, "strategic_region_id_gap").map((p) => p.missing));
    }
  }
} catch (e) {
  console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 10).join("\n") : e);
  fails.push("harness error");
} finally {
  for (const d of tmps) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} }
}
console.log(`\n=== a same-named map file replaces the lower one wholesale: ${checks} checks, ${fails.length} failed${skips ? `, ${skips} SKIPPED (not counted as passes)` : ""} ===`);
if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
