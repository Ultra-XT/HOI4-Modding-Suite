// An add-on's look at the dependency beneath it reads the dependency once: the supply and unit checks take it from the layer the
// validate already cached. #a-look-below-keeps-the-base-games-cached-layer
//
// THE DEFECT. Two checks batch 6 gated on the layer below an add-on — supply_node_bad_province / railway_bad_province
// (baseSupplyRailProblems) and the unit check (baseProvinceShape) — built that layer's model with modRoot = the dependency. The
// active mod's layer is never cached, so buildMapModel read the dependency's every state, region, supply-area, country and
// definition file afresh, although the add-on's own model had cached that same layer moments before. Measured 2026-09-15 on an
// add-on over Old World Blues (a definition.csv turning one land province into sea and one sea into land), the validate timed
// function by function: validateMapModel 71 -> 609 ms, readBlockFilesFromRoot 39 -> 51 calls, +631 ms, cold.
//
// Fixture: a 4x4 base game, a dependency that ships its own map, states, a supply hub on sea and a started fleet, and an add-on
// over it that adds a hub of its own on sea and turns sea into land.
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (ok || detail == null ? "" : "   -> " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 400)));
  if (!ok) fails.push(label);
};

const HOME = fs.mkdtempSync(path.join(os.tmpdir(), "nova-depbelow-home-"));
process.env.NOVA_HOME_DIR = HOME;
const APPDATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "nova-depbelow-appdata-"));
process.env.NOVA_APP_DATA_DIR = APPDATA_DIR;
process.env.APPDATA = APPDATA_DIR;
process.env.XDG_CONFIG_HOME = APPDATA_DIR;
const md = require("./map-data.js");
const tmps = [HOME, APPDATA_DIR];

function bmp24(w, h, fn) {
  const rs = (w * 3 + 3) & ~3, is = rs * h; const b = Buffer.alloc(54 + is);
  b.write("BM", 0, "ascii"); b.writeUInt32LE(54 + is, 2); b.writeUInt32LE(54, 10); b.writeUInt32LE(40, 14);
  b.writeInt32LE(w, 18); b.writeInt32LE(h, 22); b.writeUInt16LE(1, 26); b.writeUInt16LE(24, 28); b.writeUInt32LE(is, 34);
  for (let y = 0; y < h; y++) { let o = 54 + (h - 1 - y) * rs; for (let x = 0; x < w; x++) { const [r, g, bl] = fn(x, y); b[o++] = bl; b[o++] = g; b[o++] = r; } }
  return b;
}
const provAt = (x, y) => Math.floor(x / 64) + Math.floor(y / 64) * 4 + 1;
const COL = (p) => [((p * 37) % 200) + 20, ((p * 71) % 200) + 20, ((p * 113) % 200) + 20];
const definition = (typeOf) => ["0;0;0;0;land;false;unknown;0"].concat(Array.from({ length: 16 }, (_, i) => {
  const p = i + 1, [r, g, b] = COL(p), t = typeOf(p);
  return `${p};${r};${g};${b};${t};false;${t === "land" ? "plains" : "ocean"};${t === "land" ? 1 : 0}`;
})).join("\n") + "\n";
const mk = (root, rel, body) => { const p = path.join(root, ...rel.split("/")); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, body); };
const st = (id, provs, owner) => `state = {\n\tid = ${id}\n\tname = "STATE_${id}"\n\tmanpower = 1000\n\tstate_category = rural\n\tprovinces = { ${provs} }\n\thistory = {\n\t\towner = ${owner}\n\t}\n}\n`;

try {
  const GAME = fs.mkdtempSync(path.join(os.tmpdir(), "nova-depbelow-game-")); tmps.push(GAME);
  mk(GAME, "map/provinces.bmp", bmp24(256, 256, (x, y) => COL(provAt(x, y))));
  mk(GAME, "map/definition.csv", definition((p) => (p >= 13 ? "sea" : "land")));
  mk(GAME, "history/states/1.txt", st(1, "1 2 3 4", "AAA"));

  const DEP = fs.mkdtempSync(path.join(os.tmpdir(), "nova-depbelow-dep-")); tmps.push(DEP);
  mk(DEP, "descriptor.mod", 'name="Below Dependency"\nreplace_path="history/states"\n');
  mk(DEP, "map/provinces.bmp", bmp24(256, 256, (x, y) => COL(provAt(x, y))));
  mk(DEP, "map/definition.csv", definition((p) => (p >= 13 ? "sea" : "land")));
  mk(DEP, "map/supply_nodes.txt", "1 13\n1 6\n");                        // its own hub on sea 13 — the dependency's, and it launches
  mk(DEP, "history/states/1.txt", st(1, "1 2 3 4", "AAA"));
  mk(DEP, "history/states/2.txt", st(2, "5 6 7 8", "AAA"));
  mk(DEP, "history/states/3.txt", st(3, "9 10 11 12", "AAA"));
  mk(DEP, "history/countries/AAA - Aland.txt", 'capital = 1\nset_naval_oob = "AAA_naval"\n');
  mk(DEP, "history/units/AAA_naval.txt", 'units = {\n\tfleet = {\n\t\tname = "Home Fleet"\n\t\tnaval_base = 10\n\t\ttask_force = {\n\t\t\tname = "Bay Squadron"\n\t\t\tlocation = 10\n\t\t}\n\t}\n}\n');

  const MOD = fs.mkdtempSync(path.join(os.tmpdir(), "nova-depbelow-mod-")); tmps.push(MOD);
  mk(MOD, "descriptor.mod", 'name="Over the dependency"\ndependencies={\n\t"Below Dependency"\n}\n');
  mk(MOD, "map/supply_nodes.txt", "1 13\n1 6\n1 15\n");                  // …plus one of the add-on's own, on sea 15
  // 13-15 become land (province 10's only sea, 14, is gone); 16 stays sea
  mk(MOD, "map/definition.csv", definition((p) => (p === 16 ? "sea" : "land")));

  const depStates = path.resolve(DEP, "history", "states").toLowerCase();
  const nDepStates = fs.readdirSync(path.join(DEP, "history", "states")).length;
  let reads = 0;
  const origRead = fs.readFileSync;
  fs.readFileSync = function (p, ...rest) {
    if (typeof p === "string" && path.resolve(p).toLowerCase().startsWith(depStates + path.sep)) reads++;
    return origRead.call(this, p, ...rest);
  };
  const opts = { modRoot: MOD, gameRoot: GAME, dependencyRoots: [DEP] };

  console.log("\n=== 1. the validate's first model caches the dependency ===");
  md.clearMapLayerCache();
  reads = 0;
  const model = md.buildMapModel({ ...opts, cacheStableLayers: true });
  rec("THE CONTROL: the add-on's model reads each of the dependency's state files once", reads === nDepStates, { reads, files: nDepStates });

  console.log("\n=== 2. the supply check looks below ===");
  reads = 0;
  const probs = md.validateMapModel(model);
  rec("⭐⭐⭐ supply_node_bad_province's look at the dependency reads none of its state files again", reads === 0, { reads });
  const hub = probs.find((p) => p.rule === "supply_node_bad_province");
  rec("⭐⭐ …and it still reports the add-on's own hub on sea (15) and not the dependency's (13)", !!hub && JSON.stringify(hub.provinces) === "[15]", hub && hub.provinces);

  console.log("\n=== 3. the unit check looks below ===");
  reads = 0;
  const stranded = md.findUnitsStrandedByTheMap({ ...opts, model });
  rec("⭐⭐⭐ the unit check's look at the dependency reads none of its state files again", reads === 0, { reads });
  rec("⭐⭐ …judged against the dependency, the fleet its sea was taken from is stranded (Bay Squadron, 10)",
    stranded.judgedAgainstBelow === true && JSON.stringify(stranded.fleets.map((u) => `${u.name}@${u.province}`)) === '["Bay Squadron@10"]', stranded.fleets.map((u) => `${u.name}@${u.province}`));

  console.log("\n=== 4. THE CONTROL: the active mod's own layer is still read fresh ===");
  const modStates = path.resolve(MOD).toLowerCase();
  let modReads = 0;
  fs.readFileSync = function (p, ...rest) {
    if (typeof p === "string" && /supply_nodes\.txt$/i.test(p) && path.resolve(p).toLowerCase().startsWith(modStates + path.sep)) modReads++;
    return origRead.call(this, p, ...rest);
  };
  md.buildMapModel({ ...opts, cacheStableLayers: true });
  rec("a model of the add-on reads the add-on's own supply_nodes.txt again", modReads === 1, { modReads });
  fs.readFileSync = origRead;
} catch (e) {
  console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
  fails.push("harness error");
} finally {
  for (const d of tmps) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} }
}
console.log(`\n=== an add-on's look below reads its dependency once: ${checks} checks, ${fails.length} failed ===`);
if (fails.length) fails.forEach((x) => console.log("   FAILED: " + x));
process.exit(fails.length ? 1 : 0);
