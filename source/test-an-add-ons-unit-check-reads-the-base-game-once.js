// An add-on's unit check reads the base game once, and leaves the base game's cached layer where it was.
// #a-look-below-keeps-the-base-games-cached-layer
//
// THE DEFECT. GET /api/map/validate got slower on every shipping map when the unit check arrived
// (fleet_starts_on_land_with_no_sea / division_starts_on_water, batch 6). Its look at the layer below — baseProvinceShape, which
// needs nothing but the base's province types and coasts — built the base game's model with modRoot set to the game root.
// buildMapModel takes that for an EDIT of the base game: it reads every base-game file afresh instead of from the cache, and
// deletes the cached base-game layer, so the next model the same validate builds reads the whole base game a third time.
// Measured 2026-09-15 with every map-data.js function timed (scratchpad batch7/speed, validate as the endpoint runs it, cold):
// readRootLayer 11 -> 13 calls on Millennium Dawn (+461 ms), the same two extra reads on Road to 56, Old World Blues, Novum
// Vexillum and Rise of Nations. baseSupplyRailProblems, beside it, already builds the base game from the cached layer.
//
// Fixture: a 4x4 base game whose bottom row is sea, with a started fleet and division, and an add-on that turns that sea into
// land and a coastal land province into sea — the edit that opens the unit check.
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

const HOME = fs.mkdtempSync(path.join(os.tmpdir(), "nova-lookbelow-home-"));
process.env.NOVA_HOME_DIR = HOME;
const APPDATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "nova-lookbelow-appdata-"));
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

try {
  const GAME = fs.mkdtempSync(path.join(os.tmpdir(), "nova-lookbelow-game-")); tmps.push(GAME);
  mk(GAME, "map/provinces.bmp", bmp24(256, 256, (x, y) => COL(provAt(x, y))));
  mk(GAME, "map/definition.csv", definition((p) => (p >= 13 ? "sea" : "land")));
  const st = (id, provs, owner) => `state = {\n\tid = ${id}\n\tname = "STATE_${id}"\n\tmanpower = 1000\n\tstate_category = rural\n\tprovinces = { ${provs} }\n\thistory = {\n\t\towner = ${owner}\n\t}\n}\n`;
  mk(GAME, "history/states/1.txt", st(1, "1 2 3 4", "AAA"));
  mk(GAME, "history/states/2.txt", st(2, "5 6 7 8", "AAA"));
  mk(GAME, "history/states/3.txt", st(3, "9 10 11 12", "AAA"));
  mk(GAME, "history/countries/AAA - Aland.txt", 'capital = 1\noob = "AAA_1936"\nset_naval_oob = "AAA_naval"\n');
  mk(GAME, "history/units/AAA_naval.txt", 'units = {\n\tfleet = {\n\t\tname = "Home Fleet"\n\t\tnaval_base = 10\n\t\ttask_force = {\n\t\t\tname = "Bay Squadron"\n\t\t\tlocation = 10\n\t\t}\n\t}\n}\n');
  mk(GAME, "history/units/AAA_1936.txt", 'units = {\n\tdivision = { name = "Coast Guard" location = 4 division_template = "Inf" }\n\tdivision = { name = "Home Guard" location = 2 division_template = "Inf" }\n}\n');

  const MOD = fs.mkdtempSync(path.join(os.tmpdir(), "nova-lookbelow-mod-")); tmps.push(MOD);
  mk(MOD, "descriptor.mod", 'name="Look below"\n');
  // 13-15 become land (province 10's only sea, 14, is gone), 4 becomes sea (under the division). 16 stays sea.
  mk(MOD, "map/definition.csv", definition((p) => (p === 4 || p === 16 ? "sea" : "land")));

  // Every read of a base-game STATE file, counted — the layer readRootLayer builds for the base game.
  const stateDir = path.resolve(GAME, "history", "states").toLowerCase();
  const stateFiles = fs.readdirSync(path.join(GAME, "history", "states")).filter((f) => /\.txt$/i.test(f));
  let reads = 0;
  const origRead = fs.readFileSync;
  fs.readFileSync = function (p, ...rest) {
    if (typeof p === "string" && path.resolve(p).toLowerCase().startsWith(stateDir + path.sep)) reads++;
    return origRead.call(this, p, ...rest);
  };

  const opts = { modRoot: MOD, gameRoot: GAME, dependencyRoots: [] };
  console.log("\n=== 1. the validate's first model caches the base game ===");
  md.clearMapLayerCache();
  reads = 0;
  const model = md.buildMapModel({ ...opts, cacheStableLayers: true });
  rec("THE CONTROL: building the add-on's model reads each base-game state file once", reads === stateFiles.length, { reads, files: stateFiles.length });

  console.log("\n=== 2. the unit check looks below, and the validate builds its next model ===");
  reads = 0;
  const stranded = md.findUnitsStrandedByTheMap({ ...opts, model });
  const afterCheck = reads;
  md.buildMapModel({ ...opts, cacheStableLayers: true });
  rec("⭐⭐⭐ the unit check's look at the base game reads no base-game state file again", afterCheck === 0, { readsDuringTheCheck: afterCheck });
  rec("⭐⭐ …and the next model still finds the base game cached (no state file read)", reads === afterCheck, { readsByTheNextModel: reads - afterCheck });

  console.log("\n=== 3. the answer is the one the edit makes ===");
  const fleets = stranded.fleets.map((u) => `${u.name}@${u.province}`), divisions = stranded.divisions.map((u) => `${u.name}@${u.province}`);
  rec("it was judged against the layer below", stranded.judgedAgainstBelow === true, stranded.judgedAgainstBelow);
  rec("⭐⭐ the fleet whose sea became land is stranded (Bay Squadron, 10)", fleets.length === 1 && fleets[0] === "Bay Squadron@10", fleets);
  rec("⭐⭐ the division whose land became sea is stranded (Coast Guard, 4)", divisions.length === 1 && divisions[0] === "Coast Guard@4", divisions);

  console.log("\n=== 4. THE CONTROL: a model of the base game edited directly still reads it fresh ===");
  reads = 0;
  md.buildMapModel({ modRoot: GAME, gameRoot: GAME, dependencyRoots: [], cacheStableLayers: true });
  rec("editing the base game itself re-reads its state files (the guard this change must not weaken)", reads === stateFiles.length, { reads });
  fs.readFileSync = origRead;
} catch (e) {
  console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
  fails.push("harness error");
} finally {
  for (const d of tmps) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} }
}
console.log(`\n=== an add-on's unit check reads the base game once: ${checks} checks, ${fails.length} failed ===`);
if (fails.length) fails.forEach((x) => console.log("   FAILED: " + x));
process.exit(fails.length ? 1 : 0);
