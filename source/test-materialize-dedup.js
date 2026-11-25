// editStateBlock / editBlockInDir must NOT create a duplicate id when materialising a grouped base file.
// If a dependency file groups state 1 + state 2 and the mod already overrides state 2 elsewhere, editing
// state 1 used to copy the WHOLE file in — re-defining state 2 → two mod files with id 2 → "errors in the
// map definition" crash. stripModDuplicateSiblings drops the already-overridden sibling. (Task #146.)
const fs = require("fs"), os = require("os"), path = require("path");
const md = require("./map-data.js");
let pass = 0, fail = 0;
const check = (n, c, e) => { if (c) { pass++; console.log("  PASS", n); } else { fail++; console.log("  FAIL", n, e != null ? "→ " + e : ""); } };
function mk(p) { return fs.mkdtempSync(path.join(os.tmpdir(), p)); }
function w(root, rel, txt) { const p = path.join(root, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, txt, "utf8"); }
function rmrf(d) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} }
const DEF = "province;red;green;blue;type;coastal;terrain;continent\r\n0;0;0;0;land;false;unknown;0\r\n10;1;1;1;land;false;plains;1\r\n11;2;2;2;land;false;plains;1\r\n12;3;3;3;land;false;plains;1\r\n";

// ── states: editStateBlock materialising a grouped dependency file ──
(function states() {
  const game = mk("novmd-game-"), dep = mk("novmd-dep-"), mod = mk("novmd-mod-");
  try {
    w(game, "map/definition.csv", DEF);
    // dependency groups states 1 and 2 in ONE file
    w(dep, "history/states/grp.txt", 'state = { id = 1 name = "S1" provinces = { 10 } history = { owner = AAA } }\nstate = { id = 2 name = "S2" provinces = { 11 } history = { owner = AAA } }');
    // the mod ALREADY overrides state 2 in its own file
    w(mod, "history/states/mod2.txt", 'state = { id = 2 name = "S2" provinces = { 11 } history = { owner = BBB } }');
    md.clearMapLayerCache();
    // edit state 1 → materialises grp.txt into the mod
    const r = md.writeStateOwner({ modRoot: mod, gameRoot: game, dependencyRoots: [dep], stateId: 1, newOwner: "GRE" });
    check("edit state 1 ok (materialised)", r.changed && r.created, JSON.stringify(r));
    check("reported stripping 1 already-overridden sibling", r.strippedSiblings === 1, JSON.stringify(r));
    const grpTxt = fs.readFileSync(path.join(mod, "history/states/grp.txt"), "utf8");
    check("materialised file no longer redefines state 2", !/\bid\s*=\s*2\b/.test(grpTxt), grpTxt);
    check("materialised file keeps state 1 (now GRE)", /\bid\s*=\s*1\b/.test(grpTxt) && /owner\s*=\s*GRE/.test(grpTxt), grpTxt);
    const conflicts = md.findStateFileConflicts(mod);
    check("NO duplicate_state_id conflict created", !conflicts.some((c) => c.rule === "duplicate_state_id"), JSON.stringify(conflicts));
    md.clearMapLayerCache();
    const model = md.buildMapModel({ modRoot: mod, gameRoot: game, dependencyRoots: [dep] });
    check("state 1 owner = GRE", (model.states.find((s) => s.id === 1) || {}).owner === "GRE", "");
    check("state 2 owner still = BBB (mod's own file wins)", (model.states.find((s) => s.id === 2) || {}).owner === "BBB", (model.states.find((s) => s.id === 2) || {}).owner);
  } finally { rmrf(game); rmrf(dep); rmrf(mod); }
})();

// ── control: when there is NO sibling conflict, nothing is stripped ──
(function noConflict() {
  const game = mk("novmd-game-"), dep = mk("novmd-dep-"), mod = mk("novmd-mod-");
  try {
    w(game, "map/definition.csv", DEF);
    w(dep, "history/states/grp.txt", 'state = { id = 1 name = "S1" provinces = { 10 } history = { owner = AAA } }\nstate = { id = 2 name = "S2" provinces = { 11 } history = { owner = AAA } }');
    md.clearMapLayerCache();
    const r = md.writeStateOwner({ modRoot: mod, gameRoot: game, dependencyRoots: [dep], stateId: 1, newOwner: "GRE" });
    check("no-conflict: strips 0 siblings", r.changed && r.strippedSiblings === 0, JSON.stringify(r));
    const grpTxt = fs.readFileSync(path.join(mod, "history/states/grp.txt"), "utf8");
    check("no-conflict: sibling state 2 preserved in the copy", /\bid\s*=\s*2\b/.test(grpTxt), "");
  } finally { rmrf(game); rmrf(dep); rmrf(mod); }
})();

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exitCode = fail ? 1 : 0;
