// moveStateToSupplyArea must be OVERLAP-PROOF: a state ends up in exactly ONE supply area regardless of a
// stale/empty fromAreaId. Same class of fix as moveProvinceToRegion (a state in two supply areas is bad
// data the editor must never create).
const fs = require("fs"), os = require("os"), path = require("path");
const md = require("./map-data.js");
let pass = 0, fail = 0;
const check = (n, c, e) => { if (c) { pass++; console.log("  PASS", n); } else { fail++; console.log("  FAIL", n, e != null ? "→ " + e : ""); } };
function mk(p) { return fs.mkdtempSync(path.join(os.tmpdir(), p)); }
function w(root, rel, txt) { const p = path.join(root, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, txt, "utf8"); }
function rmrf(d) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} }
const DEF = "province;red;green;blue;type;coastal;terrain;continent\r\n0;0;0;0;land;false;unknown;0\r\n10;1;1;1;land;false;plains;1\r\n";
function dblSA(model) { const m = new Map(); for (const a of (model.supplyAreas || [])) for (const s of (a.states || [])) { if (!m.has(s)) m.set(s, new Set()); m.get(s).add(a.id); } let d = 0; for (const [, x] of m) if (x.size > 1) d++; return d; }

// 1. state double-listed across the mod's own supply areas → cleaned even with empty fromAreaId.
(function selfOverlap() {
  const game = mk("novsa-game-"), mod = mk("novsa-mod-");
  try {
    w(game, "map/definition.csv", DEF);
    w(mod, "map/supplyareas/areas.txt", 'supply_area = { id = 1 name = "A1" value = 5 states = { 1 2 } }\nsupply_area = { id = 2 name = "A2" value = 5 states = { 1 3 } }');
    md.clearMapLayerCache();
    let model = md.buildMapModel({ modRoot: mod, gameRoot: game });
    check("setup: state 1 starts in TWO supply areas", dblSA(model) === 1, dblSA(model));
    const r = md.moveStateToSupplyArea({ modRoot: mod, gameRoot: game, stateId: 1, fromAreaId: "", toAreaId: 1 });
    check("move ok, removedFrom includes area 2", r.changed && (r.removedFrom || []).includes(2), JSON.stringify(r));
    md.clearMapLayerCache();
    model = md.buildMapModel({ modRoot: mod, gameRoot: game });
    check("after: ZERO double-listing", dblSA(model) === 0, dblSA(model));
    check("after: state 1 in area 1 only", model.stateToSupplyArea[1] === 1, model.stateToSupplyArea[1]);
  } finally { rmrf(game); rmrf(mod); }
})();

// 2. state in a DEPENDENCY supply area → materialise + remove, even with a bogus fromAreaId.
(function depOverlap() {
  const game = mk("novsa-game-"), dep = mk("novsa-dep-"), mod = mk("novsa-mod-");
  try {
    w(game, "map/definition.csv", DEF);
    w(dep, "map/supplyareas/5-Dep.txt", 'supply_area = { id = 5 name = "D5" value = 5 states = { 1 2 } }');
    w(mod, "map/supplyareas/6-Addon.txt", 'supply_area = { id = 6 name = "A6" value = 5 states = { } }');
    md.clearMapLayerCache();
    const r = md.moveStateToSupplyArea({ modRoot: mod, gameRoot: game, dependencyRoots: [dep], stateId: 1, fromAreaId: 99, toAreaId: 6 });
    check("dep move ok, removed from area 5 (real source, not bogus 99)", r.changed && (r.removedFrom || []).includes(5), JSON.stringify(r));
    md.clearMapLayerCache();
    const model = md.buildMapModel({ modRoot: mod, gameRoot: game, dependencyRoots: [dep] });
    check("dep after: ZERO double-listing", dblSA(model) === 0, dblSA(model));
    check("dep after: state 1 now in area 6", model.stateToSupplyArea[1] === 6, model.stateToSupplyArea[1]);
    check("dep after: area 5 materialised into mod without state 1", !((model.supplyAreas.find((a) => a.id === 5) || {}).states || []).includes(1), "");
  } finally { rmrf(game); rmrf(dep); rmrf(mod); }
})();

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exitCode = fail ? 1 : 0;
