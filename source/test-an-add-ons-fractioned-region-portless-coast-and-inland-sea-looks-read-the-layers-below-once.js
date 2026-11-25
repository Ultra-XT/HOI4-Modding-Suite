// An add-on's fractioned-region, portless-coast and inland-sea looks below read the layers beneath it once: the fixer dry runs that
// measure a dependency, or the base game, take it from the layer the validate (or the click) already cached, and leave that cached
// layer, and what the add-on's own model says about it, in place. #a-look-below-keeps-the-layers-below-cached
//
// THE DEFECT. baseFractionedProvinces, baseCoastalNoPortTargets and baseInlandSeaProvinces measure the layer below with a FIXER'S DRY
// RUN on that layer (fixFractionedRegions, fixCoastalNoPort, fixInlandSeas with modRoot = the layer), and a fixer builds its model with
// the mod slot read afresh. So over a dependency each read the dependency's every state, region, supply-area, country and definition file
// again, although the add-on's own model had just cached them; and over the base game, buildMapModel took the game for an edit of itself,
// read it afresh and threw its cached layer away, so the validate's next model read the whole base game a third time.
//
// MEASURED on 17e65d7 with the stamps of #a-look-below-answer-moves-when-a-layer-below-changes (scratchpad batch9/layers/D/probe-d2.js,
// one cold validate of an add-on over the installed maps, read-only): a region file of the add-on's own cutting one sea province off its
// region made the fractioned-region look read Millennium Dawn's layer again (179 ms), Old World Blues' (169 ms), and over the base game
// read it again and evicted it (137 + 124 ms); one port row the add-on dropped made the portless-coast look read MD's layer again (156
// ms) and OWB's (162 ms). The inland-sea look runs on an Auto-fix click, the same way.
//
// Fixture: a 4x4 base game (bottom row sea); a dependency with states, ports, and a coast and two sea-region fragments of its own; an
// add-on over it with a coast and a fragment of its own; a second dependency with an isolated sea of its own and an add-on over it with
// another; and an add-on over the base game alone. Every answer is asserted, so reading less is not bought by judging differently.
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

const HOME = fs.mkdtempSync(path.join(os.tmpdir(), "nova-dryrunbelow-home-"));
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
// 4x4 provinces, 64 px each, the map wrapping left to right; the bottom row (13-16) is sea, so 9-12 are the coast
const provAt = (x, y) => Math.floor(x / 64) + Math.floor(y / 64) * 4 + 1;
const COL = (p) => [((p * 37) % 200) + 20, ((p * 71) % 200) + 20, ((p * 113) % 200) + 20];
const definition = (extraSea = []) => ["0;0;0;0;land;false;unknown;0"].concat(Array.from({ length: 16 }, (_, i) => {
  const p = i + 1, [r, g, b] = COL(p), sea = p >= 13 || extraSea.includes(p), coastal = p >= 9 && p <= 12;
  return `${p};${r};${g};${b};${sea ? "sea" : "land"};${!sea && coastal ? "true" : "false"};${sea ? "ocean" : "plains"};${sea ? 0 : 1}`;
})).join("\n") + "\n";
const mk = (root, rel, body) => { const p = path.join(root, ...rel.split("/")); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, body); };
const st = (id, provs, owner = "AAA") => `state = {\n\tid = ${id}\n\tname = "STATE_${id}"\n\tmanpower = 1000\n\tstate_category = rural\n\tprovinces = { ${provs} }\n\thistory = {\n\t\towner = ${owner}\n\t}\n}\n`;
const region = (id, provs) => `strategic_region = {\n\tid = ${id}\n\tname = "R${id}"\n\tprovinces = { ${provs} }\n\tweather = {}\n}\n`;
// a position inside province p (x across, z bottom-up), and a row of buildings.txt
const at = (p) => { const i = p - 1; return { x: (i % 4) * 64 + 32, z: 255 - (Math.floor(i / 4) * 64 + 32) }; };
const row = (state, type, p, col7 = 0) => `${state};${type};${at(p).x}.00;9.50;${at(p).z}.00;0.00;${col7}`;
const SITES = [[1, 2], [2, 6], [3, 10]].flatMap(([s, p]) => [row(s, "air_base", p), row(s, "rocket_site_spawn", p)]);
const ports = (coasts) => coasts.map((p) => row(3, "naval_base_spawn", p, p + 4));   // a port on each coast, facing the sea below it
const provincesOf = (ps, rule) => [...new Set((ps || []).filter((p) => p.rule === rule).flatMap((p) => p.provinces || []))].sort((a, b) => a - b);
const typeInCsv = (root, id) => ((fs.readFileSync(path.join(root, "map", "definition.csv"), "utf8").split(/\r?\n/).find((l) => l.startsWith(id + ";")) || "").split(";")[4]);
const LAND = Array.from({ length: 12 }, (_, i) => i + 1).join(" ");

try {
  const GAME = fs.mkdtempSync(path.join(os.tmpdir(), "nova-dryrunbelow-game-")); tmps.push(GAME);
  mk(GAME, "map/provinces.bmp", bmp24(256, 256, (x, y) => COL(provAt(x, y))));
  mk(GAME, "map/definition.csv", definition());
  mk(GAME, "map/strategicregions/1-Land.txt", region(1, LAND));
  mk(GAME, "map/strategicregions/2-Sea.txt", region(2, "13 14 15 16"));
  mk(GAME, "history/states/1.txt", st(1, LAND));

  // A dependency: its coast 12 has no port, and its sea regions 2 = { 13 15 } and 3 = { 14 16 } each leave a piece cut off (15, 16).
  const DEP = fs.mkdtempSync(path.join(os.tmpdir(), "nova-dryrunbelow-dep-")); tmps.push(DEP);
  mk(DEP, "descriptor.mod", 'name="Region Dependency"\nreplace_path="history/states"\n');
  mk(DEP, "map/provinces.bmp", bmp24(256, 256, (x, y) => COL(provAt(x, y))));
  mk(DEP, "map/definition.csv", definition());
  mk(DEP, "map/buildings.txt", SITES.concat(ports([9, 10, 11])).join("\n"));
  mk(DEP, "map/strategicregions/1-Land.txt", region(1, LAND));
  mk(DEP, "map/strategicregions/2-Sea.txt", region(2, "13 15"));
  mk(DEP, "map/strategicregions/3-SeaB.txt", region(3, "14 16"));
  mk(DEP, "history/states/1.txt", st(1, "1 2 3 4"));
  mk(DEP, "history/states/2.txt", st(2, "5 6 7 8"));
  mk(DEP, "history/states/3.txt", st(3, "9 10 11 12"));

  // …an add-on over it drops the port on 11 and cuts sea 13 off with a region of its own, { 5 13 }.
  const MOD = fs.mkdtempSync(path.join(os.tmpdir(), "nova-dryrunbelow-mod-")); tmps.push(MOD);
  mk(MOD, "descriptor.mod", 'name="Over the region dependency"\ndependencies={\n\t"Region Dependency"\n}\n');
  mk(MOD, "map/buildings.txt", SITES.concat(ports([9, 10])).join("\n"));
  mk(MOD, "map/strategicregions/4-Cut.txt", region(4, "5 13"));

  // A second dependency with an isolated sea of its own (1, in a land region), and an add-on over it that makes 6 one too.
  const LAKEDEP = fs.mkdtempSync(path.join(os.tmpdir(), "nova-dryrunbelow-lakedep-")); tmps.push(LAKEDEP);
  mk(LAKEDEP, "descriptor.mod", 'name="Sea Dependency"\nreplace_path="history/states"\n');
  mk(LAKEDEP, "map/provinces.bmp", bmp24(256, 256, (x, y) => COL(provAt(x, y))));
  mk(LAKEDEP, "map/definition.csv", definition([1]));
  mk(LAKEDEP, "map/strategicregions/1-Land.txt", region(1, LAND));
  mk(LAKEDEP, "map/strategicregions/2-Sea.txt", region(2, "13 14 15 16"));
  mk(LAKEDEP, "history/states/1.txt", st(1, "2 3 4"));
  mk(LAKEDEP, "history/states/2.txt", st(2, "5 6 7 8"));
  mk(LAKEDEP, "history/states/3.txt", st(3, "9 10 11 12"));
  const LAKEMOD = fs.mkdtempSync(path.join(os.tmpdir(), "nova-dryrunbelow-lakemod-")); tmps.push(LAKEMOD);
  mk(LAKEMOD, "descriptor.mod", 'name="Over the sea dependency"\ndependencies={\n\t"Sea Dependency"\n}\n');
  mk(LAKEMOD, "map/definition.csv", definition([1, 6]));

  // An add-on over the base game alone, with a region of its own cutting sea 13 off.
  const OVER_GAME = fs.mkdtempSync(path.join(os.tmpdir(), "nova-dryrunbelow-overgame-")); tmps.push(OVER_GAME);
  mk(OVER_GAME, "descriptor.mod", 'name="Over the base game"\n');
  mk(OVER_GAME, "map/strategicregions/4-Cut.txt", region(4, "5 13"));

  const under = (root) => path.resolve(root, "history", "states").toLowerCase() + path.sep;
  const count = (root) => fs.readdirSync(path.join(root, "history", "states")).length;
  let reads = { dep: 0, lake: 0, game: 0 };
  const origRead = fs.readFileSync;
  fs.readFileSync = function (p, ...rest) {
    if (typeof p === "string") {
      const q = path.resolve(p).toLowerCase();
      if (q.startsWith(under(DEP))) reads.dep++;
      if (q.startsWith(under(LAKEDEP))) reads.lake++;
      if (q.startsWith(under(GAME))) reads.game++;
    }
    return origRead.call(this, p, ...rest);
  };
  const zero = () => { reads = { dep: 0, lake: 0, game: 0 }; };
  const opts = { modRoot: MOD, gameRoot: GAME, dependencyRoots: [DEP] };

  console.log("\n=== 1. the validate's first model caches the dependency ===");
  md.clearMapLayerCache();
  zero();
  const model = md.buildMapModel({ ...opts, cacheStableLayers: true });
  rec("THE CONTROL: the add-on's model reads each of the dependency's state files once", reads.dep === count(DEP), reads);

  console.log("\n=== 2. the portless-coast and fractioned-region checks look below the dependency ===");
  zero();
  const bitmap = md.validateMapBitmap(opts);
  rec("⭐⭐⭐ their look at the dependency reads none of its state files again", reads.dep === 0, reads);
  rec("⭐⭐ …nor the base game's", reads.game === 0, reads);
  rec("⭐⭐ coastal_no_port still reports the add-on's coast 11 and not the dependency's 12", JSON.stringify(provincesOf(bitmap, "coastal_no_port")) === "[11]", provincesOf(bitmap, "coastal_no_port"));
  rec("⭐⭐ fractioned_naval_region still reports the add-on's cut-off 13 and not the dependency's 15 and 16", JSON.stringify(provincesOf(bitmap, "fractioned_naval_region")) === "[13]", provincesOf(bitmap, "fractioned_naval_region"));
  rec("THE CONTROL: after the whole validate the add-on's model still says its states are the dependency's",
    (model.states || []).length === 3 && model.states.every((s) => s.inBaseLayer === true), (model.states || []).map((s) => [s.id, s.inBaseLayer]));

  console.log("\n=== 2b. a look below that measures the dependency last leaves what the add-on's model says of its states alone ===");
  // The same states are the dependency's cached objects in both models, and to the dry run measuring the dependency, the dependency is
  // "the mod". Run with nothing after it (a validate's later model builds stamp the flag back), the measurement must not flip it.
  md.clearMapLayerCache();
  const fresh = md.buildMapModel({ ...opts, cacheStableLayers: true });
  const before = (fresh.states || []).map((s) => [s.id, s.inBaseLayer]);
  const cnp = md.fixCoastalNoPort({ ...opts, dryRun: true });
  rec("THE CONTROL: the portless-coast dry run looked below (it left the dependency's coast 12 out as inherited)", JSON.stringify(cnp.targets) === "[11]" && JSON.stringify(cnp.inheritedTargets) === "[12]", cnp);
  rec("⭐⭐⭐ …and the add-on's model still says every state is the dependency's, as it did before the look",
    JSON.stringify(before) === "[[1,true],[2,true],[3,true]]" && JSON.stringify((fresh.states || []).map((s) => [s.id, s.inBaseLayer])) === JSON.stringify(before), { before, after: (fresh.states || []).map((s) => [s.id, s.inBaseLayer]) });

  console.log("\n=== 3. an Auto-fix click's inland-sea repair looks below the dependency ===");
  const lakeOpts = { modRoot: LAKEMOD, gameRoot: GAME, dependencyRoots: [LAKEDEP] };
  zero();
  md.buildMapModel({ ...lakeOpts, cacheStableLayers: true });
  rec("THE CONTROL: the add-on's model reads each of the dependency's state files once", reads.lake === count(LAKEDEP), reads);
  zero();
  const seas = md.fixInlandSeas(lakeOpts);
  rec("⭐⭐⭐ the repair's look at the dependency reads none of its state files again", reads.lake === 0, reads);
  rec("⭐⭐ …and it still turns only the add-on's own isolated sea (6) into land, not the dependency's (1)",
    seas.fixed === 1 && JSON.stringify((seas.details || []).map((d) => d.province)) === "[6]" && typeInCsv(LAKEMOD, 6) === "land" && typeInCsv(LAKEMOD, 1) === "sea", { seas, six: typeInCsv(LAKEMOD, 6), one: typeInCsv(LAKEMOD, 1) });

  console.log("\n=== 4. an add-on over the base game alone: the fractioned-region check and the inland-sea repair look below the game ===");
  const gameOpts = { modRoot: OVER_GAME, gameRoot: GAME, dependencyRoots: [] };
  md.clearMapLayerCache();
  zero();
  md.buildMapModel({ ...gameOpts, cacheStableLayers: true });
  rec("THE CONTROL: the add-on's model reads each of the base game's state files once", reads.game === count(GAME), reads);
  zero();
  const gBitmap = md.validateMapBitmap(gameOpts);
  rec("⭐⭐⭐ the fractioned-region check's look at the base game reads none of its state files again", reads.game === 0, reads);
  rec("⭐⭐ …and still reports the add-on's cut-off 13", JSON.stringify(provincesOf(gBitmap, "fractioned_naval_region")) === "[13]", provincesOf(gBitmap, "fractioned_naval_region"));
  mk(OVER_GAME, "map/definition.csv", definition([6]));                             // the add-on now makes 6 an isolated sea of its own
  zero();
  const gSeas = md.fixInlandSeas(gameOpts);
  rec("⭐⭐⭐ the inland-sea repair's look at the base game reads none of its state files again", reads.game === 0, reads);
  rec("⭐⭐ …and it still turns the add-on's isolated sea 6 into land", gSeas.fixed === 1 && typeInCsv(OVER_GAME, 6) === "land", gSeas);
  zero();
  md.buildMapModel({ ...gameOpts, cacheStableLayers: true });
  rec("⭐⭐⭐ after both looks below, the next model of the add-on still finds the base game cached", reads.game === 0, reads);
  fs.readFileSync = origRead;
} catch (e) {
  console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
  fails.push("harness error");
} finally {
  for (const d of tmps) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} }
}
console.log(`\n=== an add-on's fractioned-region, portless-coast and inland-sea looks read the layers below once: ${checks} checks, ${fails.length} failed ===`);
if (fails.length) fails.forEach((x) => console.log("   FAILED: " + x));
process.exit(fails.length ? 1 : 0);
