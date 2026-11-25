// An add-on holding a verbatim copy of its dependency's definition.csv — what one Terrain click leaves — is not told about the ports its
// dependency points at a lake, and one Auto-fix click never copies a buildings.txt in to drop them. A port the add-on itself turned to
// face a lake is still reported and removed, and only that row. #auto-fix-leaves-a-lake-facing-port-the-mod-inherited
//
// THE DEFECT. naval_base_sea_zone_invalid and the lake half of fixPortsWhoseWaterIsGone share one ownership gate: "the mod changed
// map/buildings.txt or map/definition.csv" (modChangedMapFile). That helper diffs against the BASE GAME only. An add-on over a
// dependency that ships its own definition.csv "changed" it the moment it holds a verbatim copy of the dependency's — and Nova's Terrain
// tool materialises exactly that copy on the first click — so every port the dependency points at a lake became the add-on's.
//
// MEASURED on 396c560 (batch 7 / owners, probe-lake.js), through GET /api/map/validate?modPath and POST /api/map/auto-fix { modPath } on
// the two-layer fixture: a dependency whose definition.csv turns sea 1 into a lake (both of the game's ports now face it), and an add-on
// with one problem of its own. The plain add-on was told nothing (the gate works when the add-on ships neither file). The add-on
// holding the dependency's definition.csv verbatim was told naval_base_sea_zone_invalid [1], and ONE click wrote map/buildings.txt into
// it with both ports removed — a copy of the base's buildings.txt that then shadows the dependency's. No shipping map has a port
// facing anything but a sea (0 of 17,187 rows on six).
//
// THE FIX. basePortRowsWithoutASea runs the same scan (portRowsWithoutASea) on what the layers below load, keyed by the row without its
// state column and by why it has no sea; the rule and the fixer subtract those rows, as naval_base_water_is_gone does for ports on land.
// The base-game diff stays as the cheap first question. A sea the add-on turns into a lake, or a port row it writes facing one, is still
// reported and removed (section 3).
"use strict";

const fs = require("fs");
const path = require("path");
const lib = require("./testlib-two-layer-map.js");

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (ok || detail == null ? "" : "   -> " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 360)));
  if (!ok) fails.push(label);
};

const W = lib.makeWorld("inhlakeport");
const { createApp } = require("./server.js");
const md = require("./map-data.js");

const RULE = "naval_base_sea_zone_invalid";
const LAKE_DEF = lib.DEF({ 1: "1;0;0;200;lake;false;lakes;0" });             // sea 1 is a lake: both of the game's ports face it
const DEP_NAME = "Lake dependency";
const DEP = W.mod(DEP_NAME, { "map/definition.csv": LAKE_DEF });
const OWN = { "history/states/1-A.txt": lib.st(1, "4", { manpower: 0 }) };
const GAME_BUILD = lib.BUILD.join("\n");
const has = (d, rel) => fs.existsSync(path.join(d, ...rel.split("/")));
const rows = (d) => (has(d, "map/buildings.txt") ? fs.readFileSync(path.join(d, "map", "buildings.txt"), "utf8").split(/\r?\n/).map((l) => l.trim()).filter(Boolean) : []);
const items = (v) => ((v && v.problems) || []).filter((p) => p.rule === RULE).flatMap((p) => p.items || []);

(async () => {
  let S = null;
  try {
    S = await lib.startServer(createApp);

    console.log("\n=== THE CONTROLS ===");
    rec("the dependency, validated as the mod over the game, is told of both ports facing its lake", items(await S.validate(DEP)).length === 2, items(await S.validate(DEP)));
    {
      const a = W.mod("Plain addon", OWN, [DEP_NAME]);
      const v = await S.validate(a);
      rec("an add-on over it shipping neither file is told nothing of them", items(v).length === 0 && lib.idsOf(v, "state_no_manpower").join() === "1", lib.rulesIn(v));
    }

    console.log("\n=== 1. an add-on holding the dependency's definition.csv verbatim — one Terrain click's copy ===");
    {
      const a = W.mod("Copy addon", { ...OWN, "map/definition.csv": LAKE_DEF }, [DEP_NAME]);
      const v = await S.validate(a);
      rec("THE CONTROL: the add-on is told its own problem (state 1 has no manpower)", lib.idsOf(v, "state_no_manpower").join() === "1", lib.rulesIn(v));
      rec("⭐⭐⭐ …and is not told of the dependency's ports facing a lake", items(v).length === 0, items(v));
      const before = lib.tree(a);
      const r1 = await S.autoFix(a);
      const after = lib.tree(a);
      rec("the click ran every fixer — it was not 'nothing to fix'", r1.status === 200 && r1.body.ok === true && !r1.body.nothingToFix, r1.body);
      rec("⭐⭐⭐ …removed no port", !((r1.body.fixes || {}).strandedPorts || {}).removed, (r1.body.fixes || {}).strandedPorts);
      rec("⭐⭐⭐ …and wrote no buildings.txt into the add-on", !has(a, "map/buildings.txt"), lib.written(before, after));
      rec("⭐⭐ the whole click wrote only the add-on's own state file", lib.written(before, after).join() === "history/states/1-A.txt", lib.written(before, after));
      await S.autoFix(a);
      rec("⭐ a second click writes nothing", lib.written(after, lib.tree(a)).length === 0, lib.written(after, lib.tree(a)));
    }

    console.log("\n=== 2. …holding the buildings.txt its layers load, verbatim, as well ===");
    {
      const a = W.mod("Copy both addon", { ...OWN, "map/definition.csv": LAKE_DEF, "map/buildings.txt": GAME_BUILD }, [DEP_NAME]);
      rec("⭐⭐⭐ the add-on is not told of the ports facing its dependency's lake", items(await S.validate(a)).length === 0, items(await S.validate(a)));
      const r = md.fixPortsWhoseWaterIsGone({ modRoot: a, gameRoot: W.GAME, dependencyRoots: [DEP] });
      rec("⭐⭐⭐ …and fixPortsWhoseWaterIsGone leaves its buildings.txt as the layers below wrote it", !!r && !r.removed && rows(a).join("\n") === GAME_BUILD, { r, rows: rows(a).length });
    }

    console.log("\n=== 3. …but a port the add-on itself turned to face a lake IS reported and removed — only that row ===");
    {
      // (a) a mod over the game alone turns sea 1 into a lake in its own definition.csv
      const a = W.mod("Own lake", { "map/definition.csv": LAKE_DEF });
      rec("⭐⭐⭐ a sea the mod turned into a lake: both ports facing it are reported", items(await S.validate(a)).length === 2, items(await S.validate(a)));
      const ra = md.fixPortsWhoseWaterIsGone({ modRoot: a, gameRoot: W.GAME, dependencyRoots: [] });
      rec("⭐⭐ …and fixPortsWhoseWaterIsGone removes both", !!ra && ra.removed === 2 && !rows(a).some((l) => l.split(";")[1] === "naval_base_spawn"), { ra, rows: rows(a) });

      // (b) the copy add-on writes one more port facing its dependency's lake
      const OWN_ROW = "2;naval_base_spawn;30.00;9.50;191.00;0.00;1";
      const b = W.mod("Own row", { "map/definition.csv": LAKE_DEF, "map/buildings.txt": GAME_BUILD + "\n" + OWN_ROW }, [DEP_NAME]);
      const vb = await S.validate(b);
      rec("⭐⭐⭐ a port the add-on wrote facing the lake is reported, and only it", items(vb).length === 1 && items(vb)[0].stateId === 2 && items(vb)[0].why === "lake", items(vb));
      const rb = md.fixPortsWhoseWaterIsGone({ modRoot: b, gameRoot: W.GAME, dependencyRoots: [DEP] });
      rec("⭐⭐⭐ …and fixPortsWhoseWaterIsGone removes that row only", !!rb && rb.removed === 1 && !rows(b).includes(OWN_ROW) && rows(b).filter((l) => l.split(";")[1] === "naval_base_spawn").length === 2, { rb, rows: rows(b) });
    }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 10).join("\n") : e);
    fails.push("harness error");
  } finally {
    if (S) S.close();
    W.cleanup();
  }
  console.log(`\n=== auto-fix leaves a lake-facing port the mod inherited: ${checks} checks, ${fails.length} failed ===`);
  if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
})();
