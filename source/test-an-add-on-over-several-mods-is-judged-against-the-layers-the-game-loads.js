// An add-on is judged against the layers HOI4 actually loads beneath it — every dependency in load order, and the one that shapes the
// answer even when it ships no map file — so it is not told, and Auto-fix does not copy in, what those layers already carry.
// #a-look-below-reads-the-layers-in-load-order #a-look-below-asks-the-layer-that-shapes-the-answer
//
// THE DEFECT, TWICE OVER. The look-below helpers (base*: what the layers below the mod already carry, which a rule and its fixer subtract)
// list the layers below with layersBelow, highest priority first, and then:
//   1. handed the layers under their base to buildMapModel / the fixers in THAT order, while both take dependencies lowest first, as a
//      descriptor declares them. With two or more layers under the base, the lowest dependency overrode the ones above it.
//   2. took as their base the highest layer below that ships ONE file they read, skipping a dependency that changes the answer through
//      another: a mod that only moves provinces between states decides which coasts have a port and where buildings land.
//
// MEASURED on 65978a2 (scratchpad batch8/layers probe-b.js). ORACLE: the same helper over ONE dependency that is the stack flattened —
// the files of each layer copied into one folder in load order, which is what HOI4 loads beneath the add-on. Four layers (the game < A <
// B < C): baseProvinceShape, baseCoastalFlagDisagreements, baseSupplyRailProblems, baseInlandSeaProvinces, baseCapitalMismatches and
// baseCoastalNoPortTargets each answered for A's files where B's load (e.g. coasts [2,3,4] against [2,4]; inland seas [] against [5]). A
// dependency shipping only history/states: baseCoastalNoPortTargets [] against [2,3], baseBuildingProblemKeys placement [] against
// ["2:2","3:3"]. Through the endpoints, a plain add-on over those stacks was told the stack's own problems and one click wrote files in.
//
// The helper list is DERIVED from map-data.js (every function base*(gameRoot, dependencyRoots, modRoot), plus statesBelow and
// categorySlotsBelow), so a look-below helper added later is held to the same oracle without being typed in here.
"use strict";

const fs = require("fs");
const path = require("path");
const Module = require("module");
const lib = require("./testlib-two-layer-map.js");

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (ok || detail == null ? "" : "   -> " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 420)));
  if (!ok) fails.push(label);
};

const W = lib.makeWorld("stackbelow");
const { createApp } = require("./server.js");

// A private instance of map-data.js with its look-below helpers reachable (they are not exported). Derived from the source.
const FILE = path.join(__dirname, "map-data.js");
const SRC = fs.readFileSync(FILE, "utf8");
const LOOK_BELOW = [...SRC.matchAll(/^function (base[A-Z]\w*)\(gameRoot, dependencyRoots = \[\], modRoot = ""\)/gm)].map((m) => m[1]);
const priv = new Module(FILE, module); priv.filename = FILE; priv.paths = Module._nodeModulePaths(__dirname);
priv._compile(SRC + "\nmodule.exports.__lookBelow = { " + LOOK_BELOW.concat(["statesBelow", "categorySlotsBelow"]).join(", ") + " };\n", FILE);
const md = priv.exports, H = md.__lookBelow;

const norm = (v) => {
  if (v == null) return v;
  if (v instanceof Set) return [...v].map(String).sort();
  if (v instanceof Map) return [...v.entries()].map(([k, x]) => [String(k), x && typeof x === "object" ? JSON.stringify(x) : x]).sort();
  if (Array.isArray(v)) return v.map(norm);
  if (typeof v === "object") { const o = {}; for (const k of Object.keys(v).sort()) o[k] = norm(v[k]); return o; }
  return v;
};
const copyTree = (from, to) => { for (const e of fs.readdirSync(from, { withFileTypes: true })) { if (e.name === "descriptor.mod" || e.name === "hoi4.exe") continue; const a = path.join(from, e.name), b = path.join(to, e.name); if (e.isDirectory()) { fs.mkdirSync(b, { recursive: true }); copyTree(a, b); } else fs.copyFileSync(a, b); } };
let flatN = 0;
const flatten = (layers) => { const f = W.mod("Flattened " + (++flatN), {}); for (const l of layers) copyTree(l, f); return f; };

/** Every look-below helper, asked of `deps` under the add-on `addon`, against the same helper over ONE dependency holding the game and
 *  every layer flattened in load order. "Nothing below" (null) reads as nothing to subtract, which is what an empty set says. */
function oracle(section, deps, addon) {
  const F = flatten([W.GAME, ...deps]);
  const asSet = (h, v) => (v == null && !/Shape|DefinitionIndex/.test(h) ? new Set() : v);
  for (const h of LOOK_BELOW) {
    let a, o;
    md.clearMapLayerCache(); try { a = JSON.stringify(norm(asSet(h, H[h](W.GAME, deps, addon)))); } catch (e) { a = "threw " + e.message; }
    md.clearMapLayerCache(); try { o = JSON.stringify(norm(asSet(h, H[h](W.GAME, [F], addon)))); } catch (e) { o = "threw " + e.message; }
    rec(`${section}: ${h} answers for the layers the game loads`, a === o, { stack: a && a.slice(0, 180), flattened: o && o.slice(0, 180) });
  }
  for (const h of ["statesBelow", "categorySlotsBelow"]) {
    md.clearMapLayerCache();
    const ma = md.buildMapModel({ modRoot: addon, gameRoot: W.GAME, dependencyRoots: deps, cacheStableLayers: true });
    const mo = md.buildMapModel({ modRoot: addon, gameRoot: W.GAME, dependencyRoots: [F], cacheStableLayers: true });
    const pick = (v) => (h === "statesBelow" && v ? [...v.values()].map((s) => [s.id, s.owner, (s.provinces || []).join(" "), s.category]).sort() : v);
    const a = JSON.stringify(pick(H[h](ma))), o = JSON.stringify(pick(H[h](mo)));
    rec(`${section}: ${h} answers for the layers the game loads`, a === o, { stack: a, flattened: o });
  }
}

// ---- the four-layer stack: the game < A < B < C < the add-on, with A and B disagreeing on every input a helper reads ----
const row = (p, t) => `${p};${t};100.00;9.50;100.00;0.00;0.24`;
const STACKS = [0, 1, 2, 9, 10, 11, 12, 21, 22, 23, 30, 31, 38].map((t) => row(1, t)).concat([2, 3, 4, 5].flatMap((p) => [row(p, 1), row(p, 2)]));
lib.write(W.GAME, { "map/unitstacks.txt": STACKS.join("\n") + "\n", "map/supply_nodes.txt": "1 4\n", "history/countries/AAA - A.txt": "capital = 2\n", "history/countries/BBB - B.txt": "capital = 3\n" });
const owner = (id, provs, tag) => lib.st(id, provs).replace("owner = AAA", "owner = " + tag);
W.mod("Layer A", {
  "map/provinces.bmp": lib.bmp24(256, 256, (x, y) => lib.COL[x < 8 ? 1 : lib.provAt(x, y)]),                  // a sea column reaches 5
  "map/supply_nodes.txt": "1 5\n", "map/buildings.txt": lib.BUILD.filter((r) => !/^3;naval/.test(r)).join("\n"),
  "history/states/1-A.txt": owner(1, "4", "BBB"), "map/unitstacks.txt": STACKS.concat([row(2, 11)]).join("\n") + "\n",
  // A lower layer moves coastal 2 and 3 between states — so every row placed on them names the wrong state — and B puts them back
  "history/states/2-B.txt": lib.st(2, "3 5"), "history/states/3-C.txt": lib.st(3, "2"),
});
W.mod("Layer B", {
  "map/provinces.bmp": lib.bmp24(256, 256, (x, y) => lib.COL[y < 64 && x >= 120 ? 4 : lib.provAt(x, y)]),     // a strip of 4 landlocks 3
  "map/supply_nodes.txt": "1 4\n", "map/buildings.txt": lib.BUILD.join("\n"), "history/states/1-A.txt": owner(1, "4", "AAA"),
  "map/unitstacks.txt": STACKS.join("\n") + "\n",
  "history/states/2-B.txt": lib.st(2, "2 5"), "history/states/3-C.txt": lib.st(3, "3"),
});
W.mod("Layer C", { "map/definition.csv": lib.DEF({ 5: "5;0;200;200;sea;false;ocean;0" }) });
const rootOf = (name) => { for (const d of fs.readdirSync(W.MODS)) { const p = path.join(W.MODS, d); try { if (fs.readFileSync(path.join(p, "descriptor.mod"), "utf8").includes(`name="${name}"`)) return p; } catch (_) {} } return ""; };
const STACK4 = ["Layer A", "Layer B", "Layer C"];

// ---- a dependency that ships only history/states: coastal 2 and 3 swap states, so neither stands in the state its port row names ----
const STATES_DEP = "States dependency";
W.mod(STATES_DEP, { "history/states/2-B.txt": lib.st(2, "3 5"), "history/states/3-C.txt": lib.st(3, "2") });

let S = null;
(async () => {
  try {
    S = await lib.startServer(createApp);
    rec("the look-below helpers were derived from map-data.js", LOOK_BELOW.length >= 10, LOOK_BELOW);

    console.log("\n=== 1. four layers: every look-below helper against the flattened stack ===");
    oracle("four layers", STACK4.map(rootOf), W.mod("Oracle addon 4", {}, STACK4));

    console.log("\n=== 2. a dependency that ships only history/states ===");
    oracle("states only", [rootOf(STATES_DEP)], W.mod("Oracle addon S", {}, [STATES_DEP]));

    console.log("\n=== 3. through the endpoints: an add-on with one problem of its own over the four-layer stack ===");
    {
      const a = W.mod("Stack addon", { "history/states/3-C.txt": lib.st(3, "3", { manpower: 0 }) }, STACK4);
      const v = await S.validate(a);
      rec("THE CONTROL: the add-on is told its own problem (state 3 has no manpower)", lib.idsOf(v, "state_no_manpower").join() === "3", lib.rulesIn(v));
      rec("⭐⭐⭐ …and is not told of the coastal flag layer C writes over layer B's bitmap", lib.idsOf(v, "coastal_province_has_no_sea").length === 0, lib.idsOf(v, "coastal_province_has_no_sea"));
      const before = lib.tree(a);
      const r = await S.autoFix(a);
      rec("the click ran every fixer", r.status === 200 && r.body.ok === true && !r.body.nothingToFix, r.body);
      rec("⭐⭐⭐ …and wrote only the add-on's own state file", lib.written(before, lib.tree(a)).join() === "history/states/3-C.txt", lib.written(before, lib.tree(a)));
    }

    console.log("\n=== 4. through the endpoints: an add-on with one problem of its own over the states-only dependency ===");
    {
      const a = W.mod("States addon", { "history/states/1-A.txt": lib.st(1, "4", { manpower: 0 }) }, [STATES_DEP]);
      const v = await S.validate(a);
      rec("THE CONTROL: the add-on is told its own problem (state 1 has no manpower)", lib.idsOf(v, "state_no_manpower").join() === "1", lib.rulesIn(v));
      rec("⭐⭐⭐ …and is not told of the coasts the dependency's states left without a port", lib.idsOf(v, "coastal_no_port").length === 0, lib.idsOf(v, "coastal_no_port"));
      const before = lib.tree(a);
      const r = await S.autoFix(a);
      rec("the click ran every fixer", r.status === 200 && r.body.ok === true && !r.body.nothingToFix, r.body);
      rec("⭐⭐⭐ …added no port and wrote only the add-on's own state file", !((r.body.fixes || {}).coastalNoPort || {}).added && lib.written(before, lib.tree(a)).join() === "history/states/1-A.txt", { coastalNoPort: (r.body.fixes || {}).coastalNoPort, written: lib.written(before, lib.tree(a)) });
    }

    console.log("\n=== 5. …but a mod over the game alone that ships those same files is still told ===");
    {
      const m4 = W.mod("Own four", {});
      for (const n of STACK4) copyTree(rootOf(n), m4);
      rec("⭐⭐ the four layers' files in one mod: the coastal flag over the landlocked 3 is reported", lib.idsOf(await S.validate(m4), "coastal_province_has_no_sea").includes(3), lib.idsOf(await S.validate(m4), "coastal_province_has_no_sea"));
      const ms = W.mod("Own states", { "history/states/2-B.txt": lib.st(2, "3 5"), "history/states/3-C.txt": lib.st(3, "2") });
      rec("⭐⭐ the states dependency's files in one mod: its portless coasts are reported", lib.idsOf(await S.validate(ms), "coastal_no_port").join() === "2,3", lib.idsOf(await S.validate(ms), "coastal_no_port"));
    }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 10).join("\n") : e);
    fails.push("harness error");
  } finally {
    if (S) S.close();
    W.cleanup();
  }
  console.log(`\n=== an add-on over several mods is judged against the layers the game loads: ${checks} checks, ${fails.length} failed ===`);
  if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
})();
