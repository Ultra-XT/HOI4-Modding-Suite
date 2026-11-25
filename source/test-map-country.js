// Country removal (reversible) — deleteCountry / listRemovedCountries / restoreCountry.
// Covers: mod-owned country, reassign-to variant, dependency-owned country (override + restore),
// the saved list, and the input guards. Drives the real map-data writers against temp roots.
const fs = require("fs");
const os = require("os");
const path = require("path");
const md = require("./map-data.js");

let pass = 0, fail = 0;
const check = (n, c, e) => { if (c) { pass++; console.log("  PASS", n); } else { fail++; console.log("  FAIL", n, e != null ? "→ " + e : ""); } };

function mk(prefix) { return fs.mkdtempSync(path.join(os.tmpdir(), prefix)); }
function w(root, rel, txt) { const p = path.join(root, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, txt, "utf8"); }
function rmrf(d) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} }
const DEF = "province;red;green;blue;type;coastal;terrain;continent\r\n0;0;0;0;land;false;unknown;0\r\n10;1;1;1;land;false;plains;1\r\n11;2;2;2;land;false;plains;1\r\n20;3;3;3;land;false;plains;1\r\n";

// ───────────────────────── 1. Mod-owned country: delete (unowned) + restore ─────────────────────────
(function modOwned() {
  const game = mk("novac-game-"), mod = mk("novac-mod-");
  try {
    w(game, "map/definition.csv", DEF);
    w(mod, "history/states/ABC.txt", `state = { id = 100 name = "S100" provinces = { 10 11 } history = { owner = ABC add_core_of = ABC add_core_of = TUR } }`);
    w(mod, "history/countries/ABC - Abcland.txt", `capital = 100\nset_politics = { ruling_party = neutrality }\n`);
    md.clearMapLayerCache();

    let model = md.buildMapModel({ modRoot: mod, gameRoot: game });
    check("setup: ABC owns state 100", (model.provinceOwner[10] === "ABC") && model.capitals.ABC === 100, JSON.stringify(model.capitals));

    const del = md.deleteCountry({ modRoot: mod, gameRoot: game, tag: "ABC" });
    check("delete ok, 1 state changed, capital removed", del.ok && del.statesChanged === 1 && del.capitalRemoved, JSON.stringify(del));

    md.clearMapLayerCache();
    model = md.buildMapModel({ modRoot: mod, gameRoot: game });
    const s100 = model.states.find((s) => s.id === 100);
    check("after delete: state 100 still exists, unowned", s100 && !s100.owner, JSON.stringify(s100 && s100.owner));
    check("after delete: ABC core removed, TUR core kept", s100 && !s100.cores.includes("ABC") && s100.cores.includes("TUR"), JSON.stringify(s100 && s100.cores));
    check("after delete: ABC has no capital in model (no phantom)", model.capitals.ABC === undefined, JSON.stringify(model.capitals));
    check("after delete: state 100 keeps its provinces", s100 && s100.provinces.length === 2, JSON.stringify(s100 && s100.provinces));

    // ⛔ #a-removal-archive-lives-outside-the-mod (B2-28) — in Nova's store for the mod, not in the mod (it was <mod>/.nova/removed_countries)
    const snapPath = path.join(md.removedCountriesDir(mod), "ABC.json");
    check("snapshot file written", fs.existsSync(snapPath), snapPath);
    check("…outside the mod: nothing of Nova's is left in it", !fs.existsSync(path.join(mod, ".nova")), "a .nova folder in the mod ships with it");
    const list = md.listRemovedCountries({ modRoot: mod });
    check("listRemovedCountries shows ABC w/ name + state count", list.length === 1 && list[0].tag === "ABC" && list[0].name === "Abcland" && list[0].stateCount === 1, JSON.stringify(list));
    const histTxt = fs.readFileSync(path.join(mod, "history/countries/ABC - Abcland.txt"), "utf8");
    check("country file neutralised (no capital line)", !/\bcapital\s*=/.test(histTxt), histTxt.slice(0, 40));

    const res = md.restoreCountry({ modRoot: mod, gameRoot: game, tag: "ABC" });
    check("restore ok, 1 state restored", res.ok && res.statesRestored === 1, JSON.stringify(res));
    md.clearMapLayerCache();
    model = md.buildMapModel({ modRoot: mod, gameRoot: game });
    const r100 = model.states.find((s) => s.id === 100);
    check("after restore: state 100 owned by ABC again", r100 && r100.owner === "ABC", JSON.stringify(r100 && r100.owner));
    check("after restore: ABC core back", r100 && r100.cores.includes("ABC"), JSON.stringify(r100 && r100.cores));
    check("after restore: ABC capital back", model.capitals.ABC === 100, JSON.stringify(model.capitals));
    check("after restore: snapshot removed", !fs.existsSync(snapPath), "still exists");
    check("after restore: list empty", md.listRemovedCountries({ modRoot: mod }).length === 0, "");
  } finally { rmrf(game); rmrf(mod); }
})();

// ───────────────────────── 2. Reassign variant: land goes to another tag ─────────────────────────
(function reassign() {
  const game = mk("novac-game-"), mod = mk("novac-mod-");
  try {
    w(game, "map/definition.csv", DEF);
    w(mod, "history/states/ABC.txt", `state = { id = 100 name = "S100" provinces = { 10 11 } history = { owner = ABC add_core_of = ABC } }`);
    w(mod, "history/countries/ABC - Abcland.txt", `capital = 100\n`);
    md.clearMapLayerCache();
    const del = md.deleteCountry({ modRoot: mod, gameRoot: game, tag: "ABC", reassignTo: "XYZ" });
    check("reassign: delete ok, reassignedTo XYZ", del.ok && del.reassignedTo === "XYZ", JSON.stringify(del));
    md.clearMapLayerCache();
    const model = md.buildMapModel({ modRoot: mod, gameRoot: game });
    const s100 = model.states.find((s) => s.id === 100);
    check("reassign: state 100 now owned by XYZ", s100 && s100.owner === "XYZ", JSON.stringify(s100 && s100.owner));
    check("reassign: ABC core dropped", s100 && !s100.cores.includes("ABC"), JSON.stringify(s100 && s100.cores));
  } finally { rmrf(game); rmrf(mod); }
})();

// ───────────────────────── 3. Dependency-owned country: override + restore ─────────────────────────
(function depOwned() {
  const game = mk("novac-game-"), dep = mk("novac-dep-"), mod = mk("novac-mod-");
  try {
    w(game, "map/definition.csv", DEF);
    // The country + its land live in the dependency (like a country defined by Millennium Dawn).
    w(dep, "history/states/DEP_states.txt", `state = { id = 200 name = "S200" provinces = { 20 } history = { owner = DEP add_core_of = DEP } }`);
    w(dep, "history/countries/DEP - Depland.txt", `capital = 200\n`);
    md.clearMapLayerCache();

    let model = md.buildMapModel({ modRoot: mod, gameRoot: game, dependencyRoots: [dep] });
    check("dep setup: DEP owns 200, capital 200", model.provinceOwner[20] === "DEP" && model.capitals.DEP === 200, JSON.stringify(model.capitals));

    const del = md.deleteCountry({ modRoot: mod, gameRoot: game, dependencyRoots: [dep], tag: "DEP" });
    check("dep delete ok, 1 state changed", del.ok && del.statesChanged === 1 && del.capitalRemoved, JSON.stringify(del));
    check("dep delete: mod now has an overriding state file", fs.existsSync(path.join(mod, "history/states/DEP_states.txt")), "");
    check("dep delete: mod shadows the country file", fs.existsSync(path.join(mod, "history/countries/DEP - Depland.txt")), "");

    md.clearMapLayerCache();
    model = md.buildMapModel({ modRoot: mod, gameRoot: game, dependencyRoots: [dep] });
    check("dep delete: state 200 unowned in model", !(model.states.find((s) => s.id === 200) || {}).owner, JSON.stringify((model.states.find((s) => s.id === 200) || {}).owner));
    check("dep delete: DEP capital dropped from model (override works)", model.capitals.DEP === undefined, JSON.stringify(model.capitals));

    const res = md.restoreCountry({ modRoot: mod, gameRoot: game, dependencyRoots: [dep], tag: "DEP" });
    check("dep restore ok", res.ok && res.statesRestored === 1, JSON.stringify(res));
    check("dep restore: mod stub country file removed (base shows through)", !fs.existsSync(path.join(mod, "history/countries/DEP - Depland.txt")), "still present");
    md.clearMapLayerCache();
    model = md.buildMapModel({ modRoot: mod, gameRoot: game, dependencyRoots: [dep] });
    check("dep restore: DEP owns 200 again", model.provinceOwner[20] === "DEP", JSON.stringify(model.provinceOwner[20]));
    check("dep restore: DEP capital 200 back", model.capitals.DEP === 200, JSON.stringify(model.capitals));
  } finally { rmrf(game); rmrf(dep); rmrf(mod); }
})();

// ───────────────────────── 4. Guards ─────────────────────────
(function guards() {
  const game = mk("novac-game-"), mod = mk("novac-mod-");
  try {
    w(game, "map/definition.csv", DEF);
    w(mod, "history/states/ABC.txt", `state = { id = 100 provinces = { 10 } history = { owner = ABC } }`);
    w(mod, "history/countries/ABC - Abcland.txt", `capital = 100\n`);
    md.clearMapLayerCache();
    check("guard: refuse writing to game dir", !md.deleteCountry({ modRoot: game, gameRoot: game, tag: "ABC" }).ok, "");
    check("guard: bad tag rejected", !md.deleteCountry({ modRoot: mod, gameRoot: game, tag: "a!" }).ok, "");
    check("guard: reassign-to-self rejected", !md.deleteCountry({ modRoot: mod, gameRoot: game, tag: "ABC", reassignTo: "ABC" }).ok, "");
    check("guard: absent country rejected", !md.deleteCountry({ modRoot: mod, gameRoot: game, tag: "ZZZ" }).ok, "");
    check("guard: restore w/o snapshot rejected", !md.restoreCountry({ modRoot: mod, gameRoot: game, tag: "ZZZ" }).ok, "");
  } finally { rmrf(game); rmrf(mod); }
})();

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exitCode = fail ? 1 : 0;
