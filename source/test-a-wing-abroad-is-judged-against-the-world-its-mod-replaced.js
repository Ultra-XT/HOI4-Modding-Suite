// ⛔ #a-wing-the-map-sent-abroad — A WING ABROAD IS JUDGED AGAINST THE WORLD THE MOD'S OWN STATES REPLACED, NOT THE BASE GAME'S.
//
// "Based in another country's state" is only the active mod's doing when its own states moved the state out from under the wing.
// The reference is statesBeneath — the states that load UNDER the mod, through baseRootsFor, honouring every layer's
// replace_path — because the two shortcuts next door each fail one way:
//   · the base game's states, always: an add-on over a map that gave state 1 to BBB would be told about the map's choice, which
//     it inherits and cannot fix (the add-on floodgate: Millennium Dawn ships 8 such wings, every add-on over it would hear of them);
//   · statesBelow (layersBelowForRule): it is null under replace_path="history/states", so the map that made the choice would
//     be told nothing — and every generated world declares that line.
//
// THE FIXTURE: the 4×4 grid of test-a-wing-the-map-sent-abroad-flies-home.js (state n = row n), base game 1, 2 AAA · 3, 4 BBB,
// AAA's wings in 1 and 2.
//     DEP  replace_path history/states; gives state 1 to BBB                                → AAA's wing in 1 is DEP's doing
//     ADD  depends on DEP; no states of its own, but one history/countries file of its own, so the air rules run for it at all
//          (they sit behind "the mod ships history"; without it the add-on check below would pass by never being asked)
"use strict";
const assert = require("assert");
const fs = require("fs"), os = require("os"), path = require("path");

const APPDATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "nova-wingref-appdata-"));
process.env.NOVA_APP_DATA_DIR = APPDATA_DIR;
process.env.APPDATA = APPDATA_DIR;
process.env.XDG_CONFIG_HOME = APPDATA_DIR;
process.env.NOVA_HOME_DIR = APPDATA_DIR;
const md = require("./map-data.js");

let pass = 0;
const fails = [];
const rec = (name, cond, detail) => {
  if (cond) { console.log("  ok   " + name); pass++; }
  else { console.log("  FAIL " + name + (detail === undefined ? "" : "   → " + JSON.stringify(detail).slice(0, 400))); fails.push(name); }
};
const tmps = [APPDATA_DIR];
const tmp = (t) => { const d = fs.mkdtempSync(path.join(os.tmpdir(), "nova-wingref-" + t + "-")); tmps.push(d); return d; };
const mk = (root, rel, body) => { const p = path.join(root, ...rel.split("/")); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, body); };

function bmp24(w, h, fn) {
  const rs = (w * 3 + 3) & ~3, is = rs * h; const b = Buffer.alloc(54 + is);
  b.write("BM", 0, "ascii"); b.writeUInt32LE(54 + is, 2); b.writeUInt32LE(54, 10); b.writeUInt32LE(40, 14);
  b.writeInt32LE(w, 18); b.writeInt32LE(h, 22); b.writeUInt16LE(1, 26); b.writeUInt16LE(24, 28); b.writeUInt32LE(is, 34);
  for (let y = 0; y < h; y++) { let o = 54 + (h - 1 - y) * rs; for (let x = 0; x < w; x++) { const [r, g, bl] = fn(x, y); b[o++] = bl; b[o++] = g; b[o++] = r; } }
  return b;
}
const provAt = (x, y) => Math.floor(x / 64) + Math.floor(y / 64) * 4 + 1;
const COL = (p) => [((p * 37) % 200) + 20, ((p * 71) % 200) + 20, ((p * 113) % 200) + 20];
const stateTxt = (id, owner) => `state = {\n\tid = ${id}\n\tname = "STATE_${id}"\n\tmanpower = 1000\n\tstate_category = rural\n\tprovinces = { ${[1, 2, 3, 4].map((k) => 4 * id - 4 + k).join(" ")} }\n`
  + `\thistory = {\n\t\towner = ${owner}\n\t\tbuildings = {\n\t\t\tair_base = 1\n\t\t}\n\t}\n}\n`;
const wing = (sid, planes) => `\t${sid} = {\n\t\tfighter_equipment_0 = { owner = "AAA" amount = ${planes} }\n\t}`;

const GAME = tmp("game");
mk(GAME, "map/provinces.bmp", bmp24(256, 256, (x, y) => COL(provAt(x, y))));
{
  const rows = ["0;0;0;0;land;false;unknown;0"];
  for (let p = 1; p <= 16; p++) { const [r, g, b] = COL(p); rows.push(`${p};${r};${g};${b};land;false;plains;1`); }
  mk(GAME, "map/definition.csv", rows.join("\n") + "\n");
}
for (const [id, o] of [[1, "AAA"], [2, "AAA"], [3, "BBB"], [4, "BBB"]]) mk(GAME, `history/states/${id}.txt`, stateTxt(id, o));
mk(GAME, "history/countries/AAA - Aland.txt", 'capital = 2\nset_air_oob = "AAA_air"\n');
mk(GAME, "history/countries/BBB - Bland.txt", "capital = 3\n");
mk(GAME, "history/units/AAA_air.txt", ["air_wings = {", wing(1, 50), wing(2, 120), "}", ""].join("\n"));

const DEP = tmp("dep");
mk(DEP, "descriptor.mod", 'name="the map"\nreplace_path="history/states"\n');
for (const [id, o] of [[1, "BBB"], [2, "AAA"], [3, "BBB"], [4, "BBB"]]) mk(DEP, `history/states/${id}.txt`, stateTxt(id, o));
const ADD = tmp("add");
mk(ADD, "descriptor.mod", 'name="an add-on"\ndependencies = { "the map" }\n');
mk(ADD, "history/countries/CCC - Ccc.txt", "capital = 4\n");

const asDep = { modRoot: DEP, gameRoot: GAME, dependencyRoots: [] };
const asAdd = { modRoot: ADD, gameRoot: GAME, dependencyRoots: [DEP] };
const found = (c) => (md.findAirWingsBasedAbroad(c).wings || []).map((w) => `${w.file}:${w.state}`).sort();
const ruled = (c) => (md.validateMapBitmap(c) || []).filter((p) => p.rule === "air_wing_based_abroad").map((p) => (p.items || []).map((i) => `${i.file}:${i.state}`)).flat().sort();

console.log("=== THE CONTROLS ===");
{
  const shipsHistory = fs.readdirSync(path.join(ADD, "history", "countries")).length > 0;
  rec("THE CONTROL: the add-on ships history of its own, so the air rules are asked about it at all", shipsHistory);
  const ownerOf1 = (c) => (md.buildMapModel(c).states.find((s) => s.id === 1) || {}).owner;
  rec("THE CONTROL: state 1 is BBB's under both, and AAA's in the base game", ownerOf1(asDep) === "BBB" && ownerOf1(asAdd) === "BBB"
    && (md.buildMapModel({ modRoot: GAME, gameRoot: GAME, dependencyRoots: [] }).states.find((s) => s.id === 1) || {}).owner === "AAA");
}

console.log("\n=== the map that gave the state away is told ===");
rec("⭐⭐⭐ the finder: DEP active, AAA's wing in 1 is abroad, and DEP's own states put it there", JSON.stringify(found(asDep)) === '["AAA_air.txt:1"]', found(asDep));
rec("⭐⭐⭐ the rule says the same", JSON.stringify(ruled(asDep)) === '["AAA_air.txt:1"]', ruled(asDep));

console.log("\n=== an add-on that inherits it is not ===");
rec("⭐⭐⭐ the finder: ADD over DEP — the wing stands where the world beneath ADD already put it: nothing", found(asAdd).length === 0, found(asAdd));
rec("⭐⭐⭐ the rule says nothing either", ruled(asAdd).length === 0, ruled(asAdd));
rec("⭐⭐ …and its Auto-fix copies nothing in", md.fixAirWingsBasedAbroad(asAdd).moved === 0 && !fs.existsSync(path.join(ADD, "history", "units")));

for (const d of tmps) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} }
console.log(`\n=== a wing abroad is judged against the world its mod replaced: ${pass + fails.length} checks, ${fails.length} failed ===`);
if (fails.length) { for (const f of fails) console.log("   FAILED: " + f); process.exit(1); }
assert.ok(pass > 0);
