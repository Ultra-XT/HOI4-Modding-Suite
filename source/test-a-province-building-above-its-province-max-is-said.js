// ⛔ #a-province-building-above-its-province-max (B4-9) — a province building above the most its province may hold is said, and the page
// gets the caps it must hold to off the model it already fetches.
//
// The state panel's Naval base field had min 0 and no max: Naval base 25 → 💾 wrote `10721 = { naval_base = 25 }` into 683 Northeastern
// Canada, answered 200, and no rule said a word, while vanilla's common/buildings caps naval_base at `province_max = 10`. stateBuildingRules
// kept only `provincial`, never the number. Now: the number is kept (the effective common/buildings, a later layer's same-named file
// winning), the model carries `buildingProvinceMax` (and `maxRailwayLevel`, the effective NSupply.MAX_RAILWAY_LEVEL, 5 when unset: B4-8),
// and province_building_over_max is a WARNING with no Auto-fix (what the game does above the cap is not traced; which level to keep is the
// modder's), naming the state-panel step. A strategic location's extra levels raise the cap; a level the layer below ships is the layer
// below's.
//
// World: one row of 10-px cells [1][2][3][4][9]; 1-4 land, 9 sea. Run: node test-a-province-building-above-its-province-max-is-said.js
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-province-max-"));
process.env.APPDATA = path.join(ROOT, "appdata"); process.env.NOVA_APP_DATA_DIR = process.env.APPDATA; process.env.XDG_CONFIG_HOME = process.env.APPDATA;
process.env.NOVA_HOME_DIR = path.join(ROOT, "home");
fs.mkdirSync(process.env.APPDATA, { recursive: true }); fs.mkdirSync(process.env.NOVA_HOME_DIR, { recursive: true });
const md = require("./map-data.js");
const labels = require("./public/map-rule-labels.js");

let pass = 0, fail = 0;
const ok = (c, m, x) => {
  if (c) { pass++; console.log("  ok   " + m); }
  else { fail++; console.log("  FAIL " + m + (x !== undefined ? "   -> " + JSON.stringify(x).slice(0, 900) : "")); }
};
const write = (dir, rel, body) => { const p = path.join(dir, ...rel.split("/")); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, body); return p; };
function bmp24(W, H, fn) {
  const rs = Math.floor((24 * W + 31) / 32) * 4, b = Buffer.alloc(54 + rs * H);
  b.write("BM", 0, "ascii"); b.writeUInt32LE(b.length, 2); b.writeUInt32LE(54, 10); b.writeUInt32LE(40, 14);
  b.writeInt32LE(W, 18); b.writeInt32LE(H, 22); b.writeUInt16LE(1, 26); b.writeUInt16LE(24, 28); b.writeUInt32LE(rs * H, 34);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const [r, g, bl] = fn(x, y); const o = 54 + (H - 1 - y) * rs + x * 3; b[o] = bl; b[o + 1] = g; b[o + 2] = r; }
  return b;
}
const CELLS = [1, 2, 3, 4, 9], CELL = 10, W = CELLS.length * CELL, H = 10;
const colour = (id) => [(id * 37) % 256, (id * 71) % 256, 40 + id];
const BUILDINGS = (navalMax) => `buildings = {\n\tinfrastructure = {\n\t\tlevel_cap = {\n\t\t\tstate_max = 5\n\t\t}\n\t}\n\tnaval_base = {\n\t\tonly_costal = yes\n\t\tshow_on_map = 1\n\t\tlevel_cap = {\n\t\t\tprovince_max = ${navalMax}\n\t\t}\n\t}\n}\n`;
const state = (id, provs, provinceBlocks, extra = "") => `state={\n\tid=${id}\n\tname="STATE_${id}"\n\tmanpower=1000\n\tstate_category=rural\n\tprovinces={ ${provs.join(" ")} }\n\thistory={\n\t\towner=AAA\n${extra}\t\tbuildings={\n\t\t\tinfrastructure=1\n${provinceBlocks}\t\t}\n\t}\n}\n`;
const naval = (p, n) => `\t\t\t${p} = { naval_base = ${n} }\n`;
const harbour = (p) => `\t\tstrategic_province_location = { natural_harbor = ${p} }\n`;
function mapFiles(dir) {
  write(dir, "map/provinces.bmp", bmp24(W, H, (x) => colour(CELLS[Math.floor(x / CELL)])));
  write(dir, "map/definition.csv", ["0;0;0;0;land;false;unknown;0"].concat([1, 2, 3, 4].map((i) => `${i};${colour(i).join(";")};land;true;plains;1`),
    [`9;${colour(9).join(";")};sea;true;ocean;0`]).join("\n") + "\n");
}
function game(label, statesFn) {
  const g = path.join(ROOT, label);
  mapFiles(g);
  write(g, "common/buildings/00_buildings.txt", BUILDINGS(10));
  write(g, "common/strategic_locations/strategic_locations.txt", "natural_harbor = {\n\tnaval_base = 2\n}\n");
  if (statesFn) statesFn(g);
  return g;
}
const overMax = (opts) => {
  const model = md.buildMapModel(opts);
  return { model, p: md.validateMapModel(model).find((x) => x && x.rule === "province_building_over_max") || null };
};
const items = (p) => (p && p.items ? p.items.map((i) => `${i.stateId}/${i.province}:${i.building}=${i.level}>${i.max}`) : []);

try {
  console.log("1. ⭐⭐⭐ A map the mod owns: a level above province_max is said, one at the cap or within a strategic location's extra is not");
  {
    const G = game("game-own");
    const mod = path.join(ROOT, "own");
    write(mod, "descriptor.mod", 'name="ProvinceMax"\nreplace_path="map"\nreplace_path="history/states"\n');
    mapFiles(mod);
    write(mod, "history/states/1-A.txt", state(1, [1], naval(1, 25)));
    write(mod, "history/states/2-B.txt", state(2, [2], naval(2, 10)));
    write(mod, "history/states/3-C.txt", state(3, [3], naval(3, 12), harbour(3)));
    write(mod, "history/states/4-D.txt", state(4, [4], naval(4, 13), harbour(4)));
    const { model, p } = overMax({ modRoot: mod, gameRoot: G, dependencyRoots: [] });
    ok(model.buildingProvinceMax && model.buildingProvinceMax.naval_base === 10 && !("infrastructure" in model.buildingProvinceMax),
      "the model carries buildingProvinceMax: naval_base 10, and nothing for a state-level building", model.buildingProvinceMax);
    ok(model.strategicLocationExtras && model.strategicLocationExtras.natural_harbor && model.strategicLocationExtras.natural_harbor.naval_base === 2,
      "…and the strategic locations' extra levels, since a state names one", model.strategicLocationExtras);
    ok(JSON.stringify(items(p)) === JSON.stringify(["1/1:naval_base=25>10", "4/4:naval_base=13>12"]) && p.total === 2,
      "⭐⭐⭐ 25 on a cap of 10 and 13 on a natural harbour's 12 are said; 10 and 12 are not", p && { items: p.items, total: p.total });
    ok(!!p && p.severity === "warning" && !labels.isFatalRule(p.rule), "⭐⭐ a warning, never fatal (the game effect is not traced)", p && p.severity);
    ok(!!p && p.autoFix === false && labels.autoFixOffered([p]) === false, "⭐⭐ no Auto-fix is offered (which level to keep is the modder's)", p && { autoFix: p.autoFix });
    ok(!!p && labels.mapRuleLabel(p.rule) !== "Province building over max", "…with a label of its own", p && labels.mapRuleLabel(p.rule));
    ok(!!p && /state panel/.test(p.message) && /Naval base to 10 or less/.test(p.message) && /💾 Save/.test(p.message) && /province_max = 10/.test(p.message),
      "⭐⭐ the message names the cap and the Map-tool step that clears it", p && p.message);
  }

  console.log("\n2. The cap is the EFFECTIVE common/buildings: the mod's same-named file replaces the one below");
  {
    const G = game("game-raised");
    const mod = path.join(ROOT, "raised");
    write(mod, "descriptor.mod", 'name="Raised"\nreplace_path="map"\nreplace_path="history/states"\n');
    mapFiles(mod);
    write(mod, "common/buildings/00_buildings.txt", BUILDINGS(30));
    write(mod, "history/states/1-A.txt", state(1, [1], naval(1, 25)));
    const { model, p } = overMax({ modRoot: mod, gameRoot: G, dependencyRoots: [] });
    ok((model.buildingProvinceMax || {}).naval_base === 30, "naval_base's cap is the mod's 30", model.buildingProvinceMax);
    ok(p === null, "⭐⭐ so 25 is within it and nothing is said", p && p.items);
  }

  console.log("\n3. ⭐⭐⭐ An add-on: a level the layer below ships is the layer below's; one the add-on set is its own");
  {
    const G = game("game-ships", (g) => write(g, "history/states/1-A.txt", state(1, [1], naval(1, 25))));
    const inherits = path.join(ROOT, "inherits"); write(inherits, "descriptor.mod", 'name="Inherits"\n');
    ok(overMax({ modRoot: inherits, gameRoot: G, dependencyRoots: [] }).p === null, "⭐⭐⭐ an add-on that ships no state file is told nothing of the base's 25");
    const copies = path.join(ROOT, "copies"); write(copies, "descriptor.mod", 'name="Copies"\n');
    write(copies, "history/states/1-A.txt", state(1, [1], naval(1, 25)));
    ok(overMax({ modRoot: copies, gameRoot: G, dependencyRoots: [] }).p === null, "⭐⭐ …nor one that copies the base's file word for word");
    const raises = path.join(ROOT, "raises"); write(raises, "descriptor.mod", 'name="Raises"\n');
    write(raises, "history/states/1-A.txt", state(1, [1], naval(1, 26)));
    const { p } = overMax({ modRoot: raises, gameRoot: G, dependencyRoots: [] });
    ok(JSON.stringify(items(p)) === JSON.stringify(["1/1:naval_base=26>10"]), "THE CONTROL: an add-on that set 26 is told", p && p.items);
  }

  console.log("\n4. (B4-8) The model carries maxRailwayLevel: the effective NSupply.MAX_RAILWAY_LEVEL, 5 when no define sets it");
  {
    const G = game("game-rail");
    const plain = path.join(ROOT, "rail-plain"); write(plain, "descriptor.mod", 'name="RailPlain"\n');
    ok(md.buildMapModel({ modRoot: plain, gameRoot: G, dependencyRoots: [] }).maxRailwayLevel === 5, "no define anywhere: 5");
    const six = path.join(ROOT, "rail-six"); write(six, "descriptor.mod", 'name="RailSix"\n');
    write(six, "common/defines/zz_rail.lua", "NDefines.NSupply.MAX_RAILWAY_LEVEL = 6\n");
    ok(md.buildMapModel({ modRoot: six, gameRoot: G, dependencyRoots: [] }).maxRailwayLevel === 6, "⭐⭐ the mod's define sets 6: 6 (Millennium Dawn's)");
    const off = path.join(ROOT, "rail-off"); write(off, "descriptor.mod", 'name="RailOff"\n');
    write(off, "common/defines/zz_rail.lua", "-- NDefines.NSupply.MAX_RAILWAY_LEVEL = 9\n");
    ok(md.buildMapModel({ modRoot: off, gameRoot: G, dependencyRoots: [] }).maxRailwayLevel === 5, "…and a commented-out define is not read: 5");
  }
} catch (e) {
  fail++;
  console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 10).join("\n") : e);
} finally {
  try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
}
console.log(`\n=== a province building above its province_max is said: ${pass} passed, ${fail} failed ===`);
process.exitCode = fail ? 1 : 0;
