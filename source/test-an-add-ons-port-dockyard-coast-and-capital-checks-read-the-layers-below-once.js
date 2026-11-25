// An add-on's port, dockyard, coastal-flag and capital checks read the layers beneath it once: their look below takes the dependency, or
// the base game, from the layer the validate already cached, as the supply and unit checks do, and leaves that cached layer in place.
// #a-look-below-keeps-the-layers-below-cached
//
// THE DEFECT. baseNavalBuildingsWithoutCoast, basePortsWhoseWaterIsGone and basePortRowsWithoutASea (batch 7, written beside the speed fix
// that moved baseSupplyRailProblems and baseProvinceShape onto the cached layers), baseCoastalFlagDisagreements and baseCapitalMismatches
// built the layer below with modRoot = that layer. The active mod's layer is never cached, so over a dependency each read the
// dependency's every state, region, supply-area, country and definition file afresh, although the add-on's own model had just cached
// them. Over the base game two of them (the coastal-flag and capital checks) did worse: buildMapModel took the game for an edit of itself,
// read it afresh and threw its cached layer away, so the next model read the whole base game a third time.
//
// MEASURED on 17e65d7 with the stamps of #a-look-below-answer-moves-when-a-layer-below-changes (scratchpad batch9/layers/D/probe-d2.js,
// one cold validate of an add-on over the installed Millennium Dawn, Old World Blues and base game, read-only): each of those helpers read
// MD's or OWB's layer once more, 147-177 ms apiece; an add-on turning one sea into a lake paid it three times (463 of a 3,008 ms validate
// over MD); over the base game, one cleared coastal flag read the game twice more (133 + 128 ms) and one capital pointed at another
// country's state read it again (132 ms) and dropped its cached layer. The warm validates read nothing extra.
//
// Fixture: a 4x4 base game; a dependency shipping its own map, states, ports and one of each shape itself; an add-on over it with one of
// each of its own; and an add-on over the base game alone with a coastal flag and a capital of its own. Every answer the checks give is
// asserted, so reading less is not bought by judging differently.
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

const HOME = fs.mkdtempSync(path.join(os.tmpdir(), "nova-belowonce-home-"));
process.env.NOVA_HOME_DIR = HOME;
process.env.NOVA_APP_DATA_DIR = HOME; process.env.APPDATA = HOME; process.env.XDG_CONFIG_HOME = HOME;
const md = require("./map-data.js");
const tmps = [HOME];

function bmp24(w, h, fn) {
  const rs = (w * 3 + 3) & ~3, is = rs * h; const b = Buffer.alloc(54 + is);
  b.write("BM", 0, "ascii"); b.writeUInt32LE(54 + is, 2); b.writeUInt32LE(54, 10); b.writeUInt32LE(40, 14);
  b.writeInt32LE(w, 18); b.writeInt32LE(h, 22); b.writeUInt16LE(1, 26); b.writeUInt16LE(24, 28); b.writeUInt32LE(is, 34);
  for (let y = 0; y < h; y++) { let o = 54 + (h - 1 - y) * rs; for (let x = 0; x < w; x++) { const [r, g, bl] = fn(x, y); b[o++] = bl; b[o++] = g; b[o++] = r; } }
  return b;
}
// 4x4 provinces, 64 px each; the bottom row (13-16) is sea, so 9-12 are the coast
const provAt = (x, y) => Math.floor(x / 64) + Math.floor(y / 64) * 4 + 1;
const COL = (p) => [((p * 37) % 200) + 20, ((p * 71) % 200) + 20, ((p * 113) % 200) + 20];
const definition = (coastalToo = []) => ["0;0;0;0;land;false;unknown;0"].concat(Array.from({ length: 16 }, (_, i) => {
  const p = i + 1, [r, g, b] = COL(p), sea = p >= 13, coastal = (p >= 9 && p <= 12) || coastalToo.includes(p);
  return `${p};${r};${g};${b};${sea ? "sea" : "land"};${!sea && coastal ? "true" : "false"};${sea ? "ocean" : "plains"};${sea ? 0 : 1}`;
})).join("\n") + "\n";
const mk = (root, rel, body) => { const p = path.join(root, ...rel.split("/")); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, body); };
const st = (id, provs, owner, extra = "") => `state = {\n\tid = ${id}\n\tname = "STATE_${id}"\n\tmanpower = 1000\n\tstate_category = rural\n\tprovinces = { ${provs} }\n\thistory = {\n\t\towner = ${owner}\n${extra}\t}\n}\n`;
const DOCK = "\t\tbuildings = {\n\t\t\tdockyard = 1\n\t\t}\n";
// a position inside province p (x across, z bottom-up), and a row of buildings.txt
const at = (p) => { const i = p - 1; return { x: (i % 4) * 64 + 32, z: 255 - (Math.floor(i / 4) * 64 + 32) }; };
const row = (state, type, p, col7 = 0) => `${state};${type};${at(p).x}.00;9.50;${at(p).z}.00;0.00;${col7}`;
const SITES = [[1, 2], [2, 6], [3, 10]].flatMap(([s, p]) => [row(s, "air_base", p), row(s, "rocket_site_spawn", p)]);
const PORTS = [9, 10, 11, 12].map((p) => row(3, "naval_base_spawn", p, p + 4));   // every coast has a port facing the sea below it
const ids = (ps, rule) => [...new Set((ps || []).filter((p) => p.rule === rule).flatMap((p) => (p.provinces || []).concat(p.states || [], (p.items || []).map((i) => (i && i.province != null ? i.province : i && i.stateId)))))].filter((v) => v != null).sort((a, b) => a - b);
// capital_state_owned_by_other lists { tag, capital, ownedBy } per country
const capitals = (ps) => (ps || []).filter((p) => p.rule === "capital_state_owned_by_other").flatMap((p) => (p.items || []).map((i) => `${i.tag}@${i.capital}:${i.ownedBy}`)).sort();
const coastalLies = (ps) => (ps || []).filter((p) => p.rule === "coastal_province_has_no_sea").map((p) => ({ lost: (p.lost || []).slice().sort((a, b) => a - b), gained: (p.gained || []).slice().sort((a, b) => a - b) }));

try {
  const GAME = fs.mkdtempSync(path.join(os.tmpdir(), "nova-belowonce-game-")); tmps.push(GAME);
  mk(GAME, "map/provinces.bmp", bmp24(256, 256, (x, y) => COL(provAt(x, y))));
  mk(GAME, "map/definition.csv", definition());
  mk(GAME, "history/states/1.txt", st(1, "1 2 3 4 5 6 7 8 9 10 11 12", "AAA"));

  const DEP = fs.mkdtempSync(path.join(os.tmpdir(), "nova-belowonce-dep-")); tmps.push(DEP);
  mk(DEP, "descriptor.mod", 'name="Port Dependency"\nreplace_path="history/states"\n');
  mk(DEP, "map/provinces.bmp", bmp24(256, 256, (x, y) => COL(provAt(x, y))));
  mk(DEP, "map/definition.csv", definition([8]));                                     // its own coastal flag on inland 8
  mk(DEP, "history/states/1.txt", st(1, "1 2 3 4", "AAA"));
  mk(DEP, "history/states/2.txt", st(2, "5 6 7 8", "AAA", DOCK));                    // its own dockyard on an inland state
  mk(DEP, "history/states/3.txt", st(3, "9 10 11 12", "AAA"));
  mk(DEP, "history/countries/AAA - Aland.txt", "capital = 1\n");
  const DEP_ROWS = SITES.concat(PORTS, [row(3, "naval_base_spawn", 11, 7), row(3, "naval_base_spawn", 12, 98)]);   // its own port on land 7, and one facing nothing
  mk(DEP, "map/buildings.txt", DEP_ROWS.join("\n"));

  const MOD = fs.mkdtempSync(path.join(os.tmpdir(), "nova-belowonce-mod-")); tmps.push(MOD);
  mk(MOD, "descriptor.mod", 'name="Over the port dependency"\ndependencies={\n\t"Port Dependency"\n}\n');
  mk(MOD, "history/states/1.txt", st(1, "1 2 3 4", "BBB", DOCK));                    // its own dockyard on an inland state, owned by BBB
  mk(MOD, "history/countries/BBB - Bland.txt", "capital = 2\n");                    // …whose capital is a state AAA owns
  mk(MOD, "map/definition.csv", definition([8, 5]));                                  // …its own coastal flag on inland 5
  mk(MOD, "map/buildings.txt", DEP_ROWS.concat([row(3, "naval_base_spawn", 10, 6), row(3, "naval_base_spawn", 9, 99)]).join("\n"));   // …a port on land 6, one facing nothing

  const OVER_GAME = fs.mkdtempSync(path.join(os.tmpdir(), "nova-belowonce-overgame-")); tmps.push(OVER_GAME);
  mk(OVER_GAME, "descriptor.mod", 'name="Over the base game"\n');
  mk(OVER_GAME, "history/states/1.txt", st(1, "1 2 3 4 5 6", "AAA"));
  mk(OVER_GAME, "history/states/2.txt", st(2, "7 8 9 10 11 12", "BBB"));             // BBB takes the coast…
  mk(OVER_GAME, "history/countries/BBB - Bland.txt", "capital = 1\n");              // …with its capital on AAA's state 1
  mk(OVER_GAME, "map/definition.csv", definition([5]));                               // …and a coastal flag of its own on inland 5

  const under = (root) => path.resolve(root, "history", "states").toLowerCase() + path.sep;
  const nDepStates = fs.readdirSync(path.join(DEP, "history", "states")).length;
  const nGameStates = fs.readdirSync(path.join(GAME, "history", "states")).length;
  let depStateReads = 0, gameStateReads = 0;
  const origRead = fs.readFileSync;
  fs.readFileSync = function (p, ...rest) {
    if (typeof p === "string") { const q = path.resolve(p).toLowerCase(); if (q.startsWith(under(DEP))) depStateReads++; if (q.startsWith(under(GAME))) gameStateReads++; }
    return origRead.call(this, p, ...rest);
  };
  const zero = () => { depStateReads = 0; gameStateReads = 0; };
  const opts = { modRoot: MOD, gameRoot: GAME, dependencyRoots: [DEP] };

  console.log("\n=== 1. the validate's first model caches the dependency and the game ===");
  md.clearMapLayerCache();
  zero();
  const model = md.buildMapModel({ ...opts, cacheStableLayers: true });
  rec("THE CONTROL: the add-on's model reads each of the dependency's state files once", depStateReads === nDepStates, { depStateReads, files: nDepStates });

  console.log("\n=== 2. the dockyard, port and coastal-flag checks look below the dependency ===");
  zero();
  const bitmapProblems = md.validateMapBitmap(opts);
  rec("⭐⭐⭐ their look at the dependency reads none of its state files again", depStateReads === 0, { depStateReads });
  rec("⭐⭐ …nor the base game's", gameStateReads === 0, { gameStateReads });
  rec("⭐⭐ state_naval_building_without_coast still reports the add-on's dockyard (state 1) and not the dependency's (state 2)",
    JSON.stringify(ids(bitmapProblems, "state_naval_building_without_coast")) === "[1]", ids(bitmapProblems, "state_naval_building_without_coast"));
  rec("⭐⭐ naval_base_water_is_gone still reports the add-on's port on land 6 and not the dependency's on 7",
    ids(bitmapProblems, "naval_base_water_is_gone").includes(6) && !ids(bitmapProblems, "naval_base_water_is_gone").includes(7), ids(bitmapProblems, "naval_base_water_is_gone"));
  const noSea = bitmapProblems.filter((p) => p.rule === "naval_base_sea_zone_invalid").flatMap((p) => p.items || []);
  rec("⭐⭐ naval_base_sea_zone_invalid still reports the add-on's port facing 99 and not the dependency's facing 98",
    noSea.some((i) => i.province === 99) && !noSea.some((i) => i.province === 98), noSea);
  rec("⭐⭐ coastal_province_has_no_sea still reports the add-on's flag on 5 and not the dependency's on 8",
    JSON.stringify(coastalLies(bitmapProblems)) === JSON.stringify([{ lost: [5], gained: [] }]), coastalLies(bitmapProblems));

  console.log("\n=== 3. the capital check looks below the dependency ===");
  zero();
  const modelProblems = md.validateMapModel(model);
  rec("⭐⭐⭐ capital_state_owned_by_other's look at the dependency reads none of its state files again", depStateReads === 0, { depStateReads });
  rec("⭐⭐ …nor the base game's", gameStateReads === 0, { gameStateReads });
  rec("⭐⭐ …and still reports both capitals the add-on's state 1 unsettled: AAA's on state 1, now BBB's, and BBB's on AAA's state 2",
    JSON.stringify(capitals(modelProblems)) === JSON.stringify(["AAA@1:BBB", "BBB@2:AAA"]), capitals(modelProblems));

  console.log("\n=== 4. an add-on over the base game alone: the coastal-flag and capital checks look below the game ===");
  const optsGame = { modRoot: OVER_GAME, gameRoot: GAME, dependencyRoots: [] };
  md.clearMapLayerCache();
  zero();
  const gModel = md.buildMapModel({ ...optsGame, cacheStableLayers: true });
  rec("THE CONTROL: the add-on's model reads each of the base game's state files once", gameStateReads === nGameStates, { gameStateReads, files: nGameStates });
  zero();
  const gBitmap = md.validateMapBitmap(optsGame);
  rec("⭐⭐⭐ the coastal-flag check's look at the base game reads none of its state files again", gameStateReads === 0, { gameStateReads });
  rec("⭐⭐ …and still reports the add-on's flag on 5 and none of the game's coast",
    JSON.stringify(coastalLies(gBitmap)) === JSON.stringify([{ lost: [5], gained: [] }]), coastalLies(gBitmap));
  zero();
  const gProblems = md.validateMapModel(gModel);
  rec("⭐⭐⭐ the capital check's look at the base game reads none of its state files again", gameStateReads === 0, { gameStateReads });
  rec("⭐⭐ …and still reports BBB's capital on AAA's state 1", JSON.stringify(capitals(gProblems)) === JSON.stringify(["BBB@1:AAA"]), capitals(gProblems));
  zero();
  md.buildMapModel({ ...optsGame, cacheStableLayers: true });
  rec("⭐⭐⭐ after both looks below, the next model of the add-on still finds the base game cached", gameStateReads === 0, { gameStateReads });

  console.log("\n=== 5. THE CONTROL: the active mod's own layer is still read fresh ===");
  const modStates = under(OVER_GAME);
  let modReads = 0;
  fs.readFileSync = function (p, ...rest) {
    if (typeof p === "string" && path.resolve(p).toLowerCase().startsWith(modStates)) modReads++;
    return origRead.call(this, p, ...rest);
  };
  md.buildMapModel({ ...optsGame, cacheStableLayers: true });
  rec("a model of the add-on reads each of the add-on's own state files again", modReads === fs.readdirSync(path.join(OVER_GAME, "history", "states")).length, { modReads });
  fs.readFileSync = origRead;
} catch (e) {
  console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
  fails.push("harness error");
} finally {
  for (const d of tmps) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} }
}
console.log(`\n=== an add-on's port, dockyard, coast and capital checks read the layers below once: ${checks} checks, ${fails.length} failed ===`);
if (fails.length) fails.forEach((x) => console.log("   FAILED: " + x));
process.exit(fails.length ? 1 : 0);
