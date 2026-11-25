// ⛔ #a-capital-says-the-file-it-copied-in (tool campaign B2-19, the data part).
//
// 🏛 Set capital on a country the mod inherits copies the layer below's WHOLE history file into the mod to change one line (France:
// 36 KB, 1,405 lines), and from then on that layer's changes to the file no longer reach the mod. The copy is required; the silence
// was not: set-capital's answer said nothing of it. It now names the file and the layer it came from (`materialisedFrom`), for the
// Save line to say the way the rivers / heightmap / provinces notes do.
//   1. a base-game country file: the answer carries materialisedFrom { file, layer: "base game", root };
//   2. a dependency's country file: layer "dependency";
//   3. control: the mod's own file (the second Set capital) carries none;
//   4. the route passes it through (server.js spreads the answer) — source, comments masked.
// Binds no port. Run: node test-a-capital-says-the-file-it-copied-in.js
"use strict";
const assert = require("assert");
const fs = require("fs"), os = require("os"), path = require("path");
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-capital-copied-"));
process.env.NOVA_APP_DATA_DIR = path.join(ROOT, "appdata"); process.env.APPDATA = process.env.NOVA_APP_DATA_DIR; process.env.XDG_CONFIG_HOME = process.env.NOVA_APP_DATA_DIR;
process.env.NOVA_HOME_DIR = path.join(ROOT, "home");
fs.mkdirSync(process.env.NOVA_APP_DATA_DIR, { recursive: true }); fs.mkdirSync(process.env.NOVA_HOME_DIR, { recursive: true });
const md = require("./map-data.js");
const { maskJsComments } = require("./testlib-strip-comments.js");
let pass = 0;
const ok = (n, c, x) => { assert.ok(c, n + (x !== undefined ? " -> " + JSON.stringify(x).slice(0, 900) : "")); console.log("  ok  " + n); pass++; };
const mk = (root, rel, body) => { const p = path.join(root, ...rel.split("/")); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, body); };
const state = (id, owner) => `state = {\n\tid = ${id}\n\tname = "S${id}"\n\tmanpower = 1000\n\tstate_category = town\n\tprovinces = { ${id} }\n\thistory = { owner = ${owner} }\n}\n`;
const GAME = path.join(ROOT, "game"), DEP = path.join(ROOT, "dep");
mk(GAME, "map/definition.csv", "0;0;0;0;land;false;unknown;0\n1;10;0;0;land;false;plains;1\n2;20;0;0;land;false;plains;1\n3;30;0;0;land;false;plains;1\n");
for (const [id, o] of [[1, "AAA"], [2, "AAA"], [3, "BBB"]]) mk(GAME, `history/states/${id}-S${id}.txt`, state(id, o));
mk(GAME, "history/countries/AAA - Aland.txt", "capital = 1\nset_research_slots = 3\n");
mk(DEP, "descriptor.mod", 'name="dep"\n');
mk(DEP, "history/countries/BBB - Bland.txt", "capital = 3\nset_research_slots = 2\n");
const MOD = path.join(ROOT, "mod");
mk(MOD, "descriptor.mod", 'name="m"\n');

try {
  console.log("=== 1. a base-game country file ===");
  const r = md.setCountryCapital({ modRoot: MOD, gameRoot: GAME, dependencyRoots: [DEP], tag: "AAA", stateId: 2 });
  ok("Set capital changed AAA's file, now in the mod", r && r.changed && fs.existsSync(path.join(MOD, "history", "countries", "AAA - Aland.txt")), r);
  ok("…and the answer names the file it copied in and the layer", r.materialisedFrom && r.materialisedFrom.file === "history/countries/AAA - Aland.txt" && r.materialisedFrom.layer === "base game" && path.resolve(r.materialisedFrom.root) === path.resolve(GAME), r);

  console.log("=== 2. a dependency's country file ===");
  const d = md.setCountryCapital({ modRoot: MOD, gameRoot: GAME, dependencyRoots: [DEP], tag: "BBB", stateId: 3 });
  ok("the answer says it came from a dependency", d && d.changed && d.materialisedFrom && d.materialisedFrom.layer === "dependency" && path.resolve(d.materialisedFrom.root) === path.resolve(DEP), d);

  console.log("=== 3. control: the mod's own file ===");
  const again = md.setCountryCapital({ modRoot: MOD, gameRoot: GAME, dependencyRoots: [DEP], tag: "AAA", stateId: 1 });
  ok("a second Set capital edits the mod's own copy and says no copy", again && again.changed && !("materialisedFrom" in again), again);

  console.log("=== 4. the route passes it through (source, comments masked) ===");
  const srv = maskJsComments(fs.readFileSync(path.join(__dirname, "server.js"), "utf8"));
  const at = srv.indexOf('app.post("/api/map/set-capital"');
  ok("/api/map/set-capital answers ...result", at > 0 && srv.indexOf('app.post("/api/map/set-capital"', at + 1) === -1 && /res\.json\(\{\s*ok:\s*true,\s*\.\.\.result/.test(srv.slice(at, at + 2500)));
  console.log(`\ntest-a-capital-says-the-file-it-copied-in: ${pass} checks passed`);
} finally {
  try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) { /* this test's own temp fixture */ }
}
