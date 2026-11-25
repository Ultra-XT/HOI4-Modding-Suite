// moveProvinceToRegion must be OVERLAP-PROOF: a province ends up in exactly ONE strategic region, no
// matter how many regions currently list it or what (possibly stale/empty) fromRegionId the caller passes.
// This is the fix for the real bug where an add-on added provinces to a region without removing them from
// their original (dependency) region → 105 stray provinces / 33 state-splits → launch crash.
const fs = require("fs"), os = require("os"), path = require("path");
const md = require("./map-data.js");
let pass = 0, fail = 0;
const check = (n, c, e) => { if (c) { pass++; console.log("  PASS", n); } else { fail++; console.log("  FAIL", n, e != null ? "→ " + e : ""); } };
function mk(p) { return fs.mkdtempSync(path.join(os.tmpdir(), p)); }
function w(root, rel, txt) { const p = path.join(root, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, txt, "utf8"); }
function rmrf(d) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} }
const DEF = "province;red;green;blue;type;coastal;terrain;continent\r\n0;0;0;0;land;false;unknown;0\r\n10;1;1;1;land;false;plains;1\r\n11;2;2;2;land;false;plains;1\r\n20;3;3;3;land;false;plains;1\r\n";
function dbl(model) { const pr = new Map(); for (const r of model.strategicRegions) for (const p of (r.provinces || [])) { if (!pr.has(p)) pr.set(p, new Set()); pr.get(p).add(r.id); } let d = 0; for (const [, s] of pr) if (s.size > 1) d++; return d; }

// 1. Province double-listed in the mod's own regions → move cleans the overlap even with empty fromRegionId.
(function selfOverlap() {
  const game = mk("novarg-game-"), mod = mk("novarg-mod-");
  try {
    w(game, "map/definition.csv", DEF);
    w(mod, "map/strategicregions/regions.txt",
      'strategic_region = { id = 1 name = "R1" provinces = { 10 11 } }\nstrategic_region = { id = 2 name = "R2" provinces = { 11 20 } }');
    md.clearMapLayerCache();
    let model = md.buildMapModel({ modRoot: mod, gameRoot: game });
    check("setup: province 11 starts in TWO regions", dbl(model) === 1, dbl(model));
    // Caller passes NO fromRegionId on purpose (the stale-source scenario that caused the real bug).
    const r = md.moveProvinceToRegion({ modRoot: mod, gameRoot: game, provinceId: 11, fromRegionId: "", toRegionId: 1 });
    check("move ok, removedFrom includes region 2", r.changed && (r.removedFrom || []).includes(2), JSON.stringify(r));
    md.clearMapLayerCache();
    model = md.buildMapModel({ modRoot: mod, gameRoot: game });
    check("after: ZERO double-membership", dbl(model) === 0, dbl(model));
    check("after: province 11 only in region 1", model.provinceToRegion[11] === 1, model.provinceToRegion[11]);
    const r2 = (model.strategicRegions.find((x) => x.id === 2) || {}).provinces || [];
    check("after: region 2 no longer lists 11", !r2.includes(11), JSON.stringify(r2));
  } finally { rmrf(game); rmrf(mod); }
})();

// 2. Province lives in a DEPENDENCY region → materialize that file into the mod with it removed, add to target.
(function depOverlap() {
  const game = mk("novarg-game-"), dep = mk("novarg-dep-"), mod = mk("novarg-mod-");
  try {
    w(game, "map/definition.csv", DEF);
    w(dep, "map/strategicregions/dep_regions.txt",
      'strategic_region = { id = 5 name = "DepA" provinces = { 10 20 } }\nstrategic_region = { id = 6 name = "DepB" provinces = { 11 } }');
    md.clearMapLayerCache();
    // Move province 20 (currently in dependency region 5) into region 6. fromRegionId deliberately wrong (99).
    const r = md.moveProvinceToRegion({ modRoot: mod, gameRoot: game, dependencyRoots: [dep], provinceId: 20, fromRegionId: 99, toRegionId: 6 });
    check("dep move ok, removed from region 5 (the real source, not the bogus 99)", r.changed && (r.removedFrom || []).includes(5), JSON.stringify(r));
    md.clearMapLayerCache();
    const model = md.buildMapModel({ modRoot: mod, gameRoot: game, dependencyRoots: [dep] });
    check("dep after: ZERO double-membership", dbl(model) === 0, dbl(model));
    check("dep after: province 20 now in region 6", model.provinceToRegion[20] === 6, model.provinceToRegion[20]);
    check("dep after: region 5 materialized into mod without 20", !((model.strategicRegions.find((x) => x.id === 5) || {}).provinces || []).includes(20), "");
    check("dep after: mod has an override file for region 5", fs.existsSync(path.join(mod, "map/strategicregions/dep_regions.txt")), "");
  } finally { rmrf(game); rmrf(dep); rmrf(mod); }
})();

// 3. repairRegionOverlaps: ALIGN split states to one region (covers double-membership too). Real MD uses
//    one region per file. State 1 owns {11,20}; province 11 sits in dep region 5, province 20 in the
//    add-on's region 6 (and is also double-listed in 5) → the state spans two regions → launch crash.
const splits = (m) => md.validateMapModel(m).filter((p) => p.rule === "state_split_strategic_regions").length;
(function repair() {
  const game = mk("novarg-game-"), dep = mk("novarg-dep-"), mod = mk("novarg-mod-");
  try {
    w(game, "map/definition.csv", DEF);
    w(dep, "map/strategicregions/5-DepA.txt", 'strategic_region = { id = 5 name = "DepA" provinces = { 10 11 20 } }');
    w(mod, "map/strategicregions/6-Addon.txt", 'strategic_region = { id = 6 name = "AddonR" provinces = { 20 } }');
    w(mod, "history/states/s.txt", 'state = { id = 1 name = "S1" provinces = { 11 20 } history = { owner = GRE } }');
    md.clearMapLayerCache();
    let model = md.buildMapModel({ modRoot: mod, gameRoot: game, dependencyRoots: [dep] });
    check("repair setup: province 20 double-listed", dbl(model) === 1, dbl(model));
    check("repair setup: state 1 is split across regions", splits(model) === 1, splits(model));
    const res = md.repairRegionOverlaps({ modRoot: mod, gameRoot: game, dependencyRoots: [dep] });
    check("repair ok, aligned 1 state", res.ok && res.statesAligned === 1, JSON.stringify(res));
    check("repair targeted the mod-defined region 6", (res.alignedDetail[0] || {}).target === 6, JSON.stringify(res.alignedDetail));
    md.clearMapLayerCache();
    model = md.buildMapModel({ modRoot: mod, gameRoot: game, dependencyRoots: [dep] });
    check("repair after: ZERO state-splits", splits(model) === 0, splits(model));
    check("repair after: ZERO double-membership", dbl(model) === 0, dbl(model));
    check("repair after: state 1's provinces all in region 6", model.provinceToRegion[11] === 6 && model.provinceToRegion[20] === 6, model.provinceToRegion[11] + "," + model.provinceToRegion[20]);
    const r5 = (model.strategicRegions.find((x) => x.id === 5) || {}).provinces || [];
    check("repair after: region 5 keeps 10, drops 11/20", r5.includes(10) && !r5.includes(11) && !r5.includes(20), JSON.stringify(r5));
    const res2 = md.repairRegionOverlaps({ modRoot: mod, gameRoot: game, dependencyRoots: [dep] });
    check("repair is idempotent (second run aligns 0)", res2.ok && res2.statesAligned === 0, JSON.stringify(res2));
  } finally { rmrf(game); rmrf(dep); rmrf(mod); }
})();

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exitCode = fail ? 1 : 0;
