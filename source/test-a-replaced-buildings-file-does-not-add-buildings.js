// ⛔ #a-same-named-file-replaces-the-lower-one — WHAT common/buildings SAYS IS WHAT THE FILES THAT LOAD SAY.
//
// stateBuildingRules read every layer's common/buildings and merged them by key. HOI4 does not: a mod file at the same relative
// path replaces the lower layer's file wholesale. Hearts of Minecraft ships its own common/buildings/00_buildings.txt, which defines
// neither naval_supply_hub nor naval_headquarters — and stateBuildingRules still answered both, from vanilla's file beneath it. Old
// World Blues: 33 buildings no file it loads defines, among them fuel_silo, stronghold_network and the coast-only naval_facility.
// Everything that asks it — the strategic-location rule's coast-only set, Generate land's industry deal and air-base cap, and the
// coast rows Generate land writes — was answering for buildings the game does not have. terrainFilesThatLoad and
// effectiveScriptFiles already read their folders this way; this reader never adopted it.
//
//   A  a mod's 00_buildings.txt (the base file's name) defining the coastal fort and the dockyard only: the base's hub, HQ and
//      factory are gone, and the mod's own state_max is the one answered
//   B  …the same, its name in another case: the file system compares names case-insensitively
//   C  a mod file of another name: the base's buildings all load, and the mod's beside them
//   D  replace_path = "common/buildings": the base's file is gone whatever the mod's is called
//   E  a dependency that replaces the base's 00_buildings.txt, under a mod with a file of another name: the dependency's file is
//      the one that loads
// Every expected set is read off the fixture's own files by this test's reader. Binds no port.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-buildings-replaced-"));
process.env.APPDATA = path.join(ROOT, "appdata"); process.env.NOVA_APP_DATA_DIR = process.env.APPDATA; process.env.XDG_CONFIG_HOME = process.env.APPDATA;
process.env.NOVA_HOME_DIR = path.join(ROOT, "home");
process.env.HOI4_MODS_ROOT = ROOT;
fs.mkdirSync(process.env.APPDATA, { recursive: true });
fs.mkdirSync(process.env.NOVA_HOME_DIR, { recursive: true });
const md = require("./map-data.js");

let pass = 0, fail = 0;
const ok = (c, m, x) => {
  if (c) { pass++; console.log("  ok   " + m); }
  else { fail++; console.log("  FAIL " + m + (x !== undefined ? "   -> " + JSON.stringify(x).slice(0, 400) : "")); }
};
const write = (dir, rel, body) => { const p = path.join(dir, ...rel.split("/")); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, body); return p; };
const building = (name, { coast = false, shared = false, max = 0, spawn = "" } = {}) =>
  `\t${name} = {\n\t\tbase_cost = 1000\n${coast ? "\t\tonly_costal = yes\n" : ""}${spawn ? `\t\tspawn_point = ${spawn}\n` : ""}\t\tlevel_cap = {\n${max ? `\t\t\tstate_max = ${max}\n` : ""}${shared ? "\t\t\tshares_slots = yes\n" : "\t\t\tprovince_max = 1\n"}\t\t}\n\t}\n`;
const file = (...blocks) => `buildings = {\n${blocks.join("")}}\n`;
/** this test's own reader: the building keys a buildings file defines inside its `buildings = { … }` */
const keysOf = (txt) => { const out = []; let d = 0; for (const m of txt.replace(/#[^\n]*/g, "").matchAll(/([A-Za-z0-9_]+)\s*=\s*\{|\{|\}/g)) { if (m[0] === "{") d++; else if (m[0] === "}") d--; else { if (d === 1) out.push(m[1]); d++; } } return out; };
const sorted = (a) => [...a].sort().join(",");

// the base: four coast and port buildings and a factory that shares the state's slots
const BASE_FILE = file(building("coastal_bunker", { coast: true }), building("dockyard", { coast: true, shared: true, max: 15 }),
  building("naval_supply_hub", { coast: true }), building("naval_headquarters", { coast: true }), building("arms_factory", { shared: true, max: 20 }));
const game = path.join(ROOT, "game");
write(game, "common/buildings/00_buildings.txt", BASE_FILE);
write(game, "map/definition.csv", "0;0;0;0;land;false;unknown;0\n");
// the replacement: the fort and the dockyard only, the dockyard with a state_max of its own
const MOD_FILE = file(building("coastal_bunker", { coast: true }), building("dockyard", { coast: true, shared: true, max: 7 }));
const OWN_FILE = file(building("lighthouse", { coast: true }));
const mod = (name, files, extra = "") => {
  const d = path.join(ROOT, name);
  write(d, "descriptor.mod", `name="${name}"\n${extra}`);
  for (const [rel, body] of Object.entries(files)) write(d, rel, body);
  return d;
};
const rulesOf = (modRoot, dependencyRoots = []) => md.stateBuildingRules({ modRoot, gameRoot: game, dependencyRoots });
const BASE = keysOf(BASE_FILE), REPL = keysOf(MOD_FILE), OWN = keysOf(OWN_FILE);

console.log("\n-- the fixture --");
{
  ok(sorted(BASE) === "arms_factory,coastal_bunker,dockyard,naval_headquarters,naval_supply_hub" && sorted(REPL) === "coastal_bunker,dockyard" && sorted(OWN) === "lighthouse",
    "(this test's reader: the base file defines five buildings, the replacement two, the mod's own file one)", { BASE, REPL, OWN });
  const plain = rulesOf(mod("plain", {}));
  ok(sorted(plain.keys()) === sorted(BASE), "CONTROL: a mod with no common/buildings of its own is answered the base's five", sorted(plain.keys()));
}

console.log("\n-- ⭐ A. a mod file of the base file's name replaces it --");
{
  const r = rulesOf(mod("same-name", { "common/buildings/00_buildings.txt": MOD_FILE }));
  ok(sorted(r.keys()) === sorted(REPL), "⭐⭐ only the mod's buildings are answered: no naval_supply_hub, naval_headquarters or arms_factory", sorted(r.keys()));
  ok(r.has("dockyard") && r.get("dockyard").stateMax === 7, "…and the dockyard's state_max is the mod file's", r.get("dockyard"));
}

console.log("\n-- ⭐ B. …compared case-insensitively --");
{
  const r = rulesOf(mod("other-case", { "common/buildings/00_BUILDINGS.txt": MOD_FILE }));
  ok(sorted(r.keys()) === sorted(REPL), "⭐ 00_BUILDINGS.txt replaces 00_buildings.txt", sorted(r.keys()));
}

console.log("\n-- C. a mod file of another name adds to the base --");
{
  const r = rulesOf(mod("other-name", { "common/buildings/99_my_buildings.txt": OWN_FILE }));
  ok(sorted(r.keys()) === sorted([...BASE, ...OWN]), "the base's five load, and the mod's lighthouse beside them", sorted(r.keys()));
}

console.log("\n-- D. replace_path hides the base's file whatever the mod's is called --");
{
  const r = rulesOf(mod("replaces-folder", { "common/buildings/99_my_buildings.txt": OWN_FILE }, 'replace_path="common/buildings"\n'));
  ok(sorted(r.keys()) === sorted(OWN), "only the mod's own file loads", sorted(r.keys()));
}

console.log("\n-- ⭐ E. a dependency's file of the base's name replaces it under the mod --");
{
  const dep = mod("dependency", { "common/buildings/00_buildings.txt": MOD_FILE });
  const r = rulesOf(mod("on-a-dependency", { "common/buildings/99_my_buildings.txt": OWN_FILE }), [dep]);
  ok(sorted(r.keys()) === sorted([...REPL, ...OWN]), "⭐ the dependency's file loads in the base's place, and the mod's own beside it", sorted(r.keys()));
}

try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) { /* scratch only */ }
console.log("\n" + (fail ? "FAILED " + fail + "/" + (pass + fail) : "PASSED " + pass + "/" + pass));
process.exitCode = fail ? 1 : 0;
