// An add-on is not told — and its Save is not stopped — for a port its dependency's buildings.txt points at land, and one Auto-fix
// click never copies that buildings.txt in to remove it. A port the add-on itself strands still stops Save and is still removed —
// only that row. #auto-fix-leaves-a-stranded-port-the-mod-inherited
//
// THE DEFECT. naval_base_water_is_gone is FATAL (the owner's second launch: ports whose water had become land, an access violation
// a second after the menu). It scanned the effective buildings.txt — the mod's, or the highest layer below's — for position-keyed
// rows whose 7th column names a LAND province, and fixPortsWhoseWaterIsGone repeated the scan and called removePortsAnchoredTo for
// each such province, which copies the effective buildings.txt into the mod to drop them. Neither asked whose rows they were. Batch
// 6's coverage table lists the stranded half as "BOTH UNGATED, FATAL".
//
// MEASURED on the base commit 4592c54, through the endpoints the Map Errors popup calls (GET /api/map/validate?modPath, then POST
// /api/map/auto-fix { modPath }), on this file's fixture: a dependency whose buildings.txt carries a naval_base_spawn pointing at
// land province 4, and an add-on over it with one problem of its own. The validator told the add-on naval_base_water_is_gone [4] —
// a will-crash error its own Save would stop on — and ONE click wrote the dependency's whole map/buildings.txt (331 B here; 3.9 MB for
// Millennium Dawn) into the add-on, where it replaces the dependency's file wholesale. No shipping map carries the shape (0 of
// 17,187 port rows on the six maps), so only a fixture shows it.
//
// THE FIX. portRowsOnLand is the one scan the rule, the fixer and the layer below share; basePortsWhoseWaterIsGone runs it on what the
// layers below load, keyed by everything in a row but its state column (a row re-keyed to another state is still the row below
// ships). The rule reports, and the fixer removes, only the rows that set does not hold — the fixer by line, in one write, so a row
// the add-on added beside an inherited one on the same province takes only itself with it. A sea the add-on retyped as land, or a
// row it wrote, is still reported, gates Save and is removed (section 3).
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

const W = lib.makeWorld("inhport");
const { createApp } = require("./server.js");
const md = require("./map-data.js");
const { isFatalRule } = require("./public/map-rule-labels.js");

const RULE = "naval_base_water_is_gone";
// Two more ports facing sea 1, so naval_base_spawn is plainly a type placed by position: the file's own vote decides that.
const HEALTHY = ["2;naval_base_spawn;30.00;9.50;191.00;0.00;1", "3;naval_base_spawn;230.00;9.50;191.00;0.00;1"];
const STRANDED_4 = "1;naval_base_spawn;192.00;9.50;47.00;0.00;4";          // stands on land 4 and points at it
const DEP_NAME = "Stranded port dependency";
const DEP_BUILD = lib.BUILD.concat(HEALTHY, [STRANDED_4]).join("\n");
const DEP = W.mod(DEP_NAME, { "map/buildings.txt": DEP_BUILD });
// A dependency with two seas: sea 6 is the right half of the top strip, and three ports face sea 1 against two facing 6.
const COL2 = { ...lib.COL, 6: [0, 100, 200] };
const provAt2 = (x, y) => (y < 64 ? (x < 128 ? 1 : 6) : lib.provAt(x, y));
const TWO_DEF = lib.DEF() + "6;0;100;200;sea;false;ocean;0\r\n";
const TWO_NAME = "Two seas dependency";
const TWO = W.mod(TWO_NAME, {
  "map/provinces.bmp": lib.bmp24(256, 256, (x, y) => COL2[provAt2(x, y)]),
  "map/definition.csv": TWO_DEF,
  "map/buildings.txt": lib.BUILD.map((r) => (r === "3;naval_base_spawn;192.00;9.50;191.00;0.00;1" ? "3;naval_base_spawn;192.00;9.50;191.00;0.00;6" : r))
    .concat(["2;naval_base_spawn;30.00;9.50;191.00;0.00;1", "2;naval_base_spawn;100.00;9.50;191.00;0.00;1", "3;naval_base_spawn;230.00;9.50;191.00;0.00;6"]).join("\n"),
  "map/strategicregions/1-Sea.txt": lib.region(1, "1 6"),
});
const OWN = { "history/states/2-B.txt": lib.st(2, "2 5", { manpower: 0 }) };
const has = (d, rel) => fs.existsSync(path.join(d, ...rel.split("/")));
const rows = (d) => (has(d, "map/buildings.txt") ? fs.readFileSync(path.join(d, "map", "buildings.txt"), "utf8").split(/\r?\n/).map((l) => l.trim()).filter(Boolean) : []);
const stranded = (v) => [...new Set(((v && v.problems) || []).filter((p) => p.rule === RULE).flatMap((p) => p.provinces || []))].sort((a, b) => a - b);
const fatalIn = (v) => ((v && v.problems) || []).filter((p) => isFatalRule(p.rule)).length;

async function stopsSave(S, a, provs, label) {
  const v = await S.validate(a);
  rec(`⭐⭐⭐ ${label}: the port(s) at ${provs} are reported, and only they`, stranded(v).join() === provs, stranded(v));
  const g = await lib.saveGate(v);
  rec("⭐⭐⭐ …as a crash, so Save stops on it", isFatalRule(RULE) && g.crashes >= 1 && g.crashes === fatalIn(v) && g.armed, { crashes: g.crashes, fatal: fatalIn(v), status: g.status.slice(0, 120) });
  return v;
}

(async () => {
  let S = null;
  try {
    S = await lib.startServer(createApp);

    console.log("\n=== THE CONTROLS ===");
    {
      const v = await S.validate(DEP);
      rec("the dependency, validated as the mod over the game, is told of its port pointing at land 4", stranded(v).join() === "4", stranded(v));
      rec("…and Save would stop on it", (await lib.saveGate(v)).crashes >= 1);
      rec("the two-seas dependency is told nothing: every port faces a sea", stranded(await S.validate(TWO)).length === 0, stranded(await S.validate(TWO)));
      const pv = await S.validate(W.mod("Plain", OWN));
      rec("a mod over the game alone, with the same one problem, has nothing Save would stop on", stranded(pv).length === 0 && (await lib.saveGate(pv)).crashes === 0, lib.rulesIn(pv));
    }

    console.log("\n=== 1. an add-on with one problem of its own: the dependency's port is not reported, does not stop Save, and is not copied in ===");
    {
      const a = W.mod("Addon", OWN, [DEP_NAME]);
      const v = await S.validate(a);
      rec("THE CONTROL: the add-on is told its own problem (state 2 has no manpower)", lib.idsOf(v, "state_no_manpower").join() === "2", lib.rulesIn(v));
      rec("⭐⭐⭐ …and is not told of the dependency's port pointing at land", stranded(v).length === 0, stranded(v));
      const g = await lib.saveGate(v);
      rec("⭐⭐⭐ …so its Save is not stopped behind the will-crash gate", g.crashes === 0 && !g.armed, g.status.slice(0, 160));
      const before = lib.tree(a);
      const r1 = await S.autoFix(a);
      const after = lib.tree(a);
      rec("the click ran every fixer — it was not 'nothing to fix'", r1.status === 200 && r1.body.ok === true && !r1.body.nothingToFix, r1.body);
      rec("⭐⭐⭐ …removed no port", !((r1.body.fixes || {}).strandedPorts || {}).removed, (r1.body.fixes || {}).strandedPorts);
      rec("⭐⭐⭐ …and wrote no copy of the dependency's buildings.txt into the add-on", !has(a, "map/buildings.txt"), lib.written(before, after));
      rec("⭐⭐ the whole click wrote only the add-on's own state file", lib.written(before, after).join() === "history/states/2-B.txt", lib.written(before, after));
      await S.autoFix(a);
      rec("⭐ a second click writes nothing", lib.written(after, lib.tree(a)).length === 0, lib.written(after, lib.tree(a)));
    }

    console.log("\n=== 2. a copy of the dependency's buildings.txt is not an authorship claim — nor is a row re-keyed to another state ===");
    {
      const a = W.mod("AddonCopy", { ...OWN, "map/buildings.txt": DEP_BUILD }, [DEP_NAME]);
      const v = await S.validate(a);
      rec("⭐⭐⭐ an add-on holding the dependency's own buildings.txt is not told of its stranded port", stranded(v).length === 0, stranded(v));
      rec("⭐⭐⭐ …and its Save is not stopped", (await lib.saveGate(v)).crashes === 0);
      const r = md.fixPortsWhoseWaterIsGone({ modRoot: a, gameRoot: W.GAME, dependencyRoots: [DEP] });
      rec("⭐⭐⭐ …and fixPortsWhoseWaterIsGone leaves the copy exactly as the dependency wrote it", !!r && !r.removed && rows(a).join("\n") === DEP_BUILD, { r, rows: rows(a).length });
      const k = W.mod("AddonRekeyed", { "map/buildings.txt": DEP_BUILD.replace(STRANDED_4, () => "2" + STRANDED_4.slice(1)) }, [DEP_NAME]);
      rec("⭐⭐ the same row keyed to another state is still the dependency's", stranded(await S.validate(k)).length === 0, stranded(await S.validate(k)));
    }

    console.log("\n=== 3. …but a port the add-on itself stranded IS reported, stops Save, and is removed — only that row ===");
    {
      // (a) the add-on retypes sea 6 as land in its own definition.csv: both ports facing it now point at land
      const a = W.mod("AddonRetyped", { "map/definition.csv": TWO_DEF.replace("6;0;100;200;sea;false;ocean;0", () => "6;0;100;200;land;false;plains;1") }, [TWO_NAME]);
      await stopsSave(S, a, "6", "a sea the add-on retyped as land");
      const ra = md.fixPortsWhoseWaterIsGone({ modRoot: a, gameRoot: W.GAME, dependencyRoots: [TWO] });
      rec("⭐⭐ …and fixPortsWhoseWaterIsGone removes both ports that faced it", !!ra && ra.removed === 2 && !rows(a).some((l) => l.split(";")[6] === "6"), { ra, rows: rows(a) });
      rec("…keeping the three that face sea 1", rows(a).filter((l) => l.split(";")[1] === "naval_base_spawn" && l.split(";")[6] === "1").length === 3, rows(a));

      // (b) the add-on writes a port pointing at land 5 into its own buildings.txt
      const OWN_ROW = "2;naval_base_spawn;64.00;9.50;35.00;0.00;5";
      const b = W.mod("AddonShipped", { "map/buildings.txt": DEP_BUILD + "\n" + OWN_ROW }, [DEP_NAME]);
      await stopsSave(S, b, "5", "a port the add-on wrote pointing at land");
      const fb = await S.autoFix(b);
      rec("⭐⭐ Auto-fix removes the add-on's row", fb.status === 200 && fb.body.ok === true && !rows(b).includes(OWN_ROW), { strandedPorts: (fb.body.fixes || {}).strandedPorts });
      rec("⭐⭐⭐ …and leaves the row the add-on inherited from its dependency", rows(b).includes(STRANDED_4), rows(b));
      rec("…and nothing is left to report", stranded(await S.validate(b)).length === 0, stranded(await S.validate(b)));

      // (c) the add-on adds a second port pointing at land 4, the province its dependency's own row already points at
      const SAME_ROW = "3;naval_base_spawn;200.00;9.50;40.00;0.00;4";
      const c = W.mod("AddonSameProvince", { "map/buildings.txt": DEP_BUILD + "\n" + SAME_ROW }, [DEP_NAME]);
      await stopsSave(S, c, "4", "a port the add-on added beside the dependency's, on the same land province");
      const rc = md.fixPortsWhoseWaterIsGone({ modRoot: c, gameRoot: W.GAME, dependencyRoots: [DEP] });
      rec("⭐⭐⭐ …and fixPortsWhoseWaterIsGone removes the add-on's row only", !!rc && rc.removed === 1 && !rows(c).includes(SAME_ROW) && rows(c).includes(STRANDED_4), { rc, rows: rows(c) });
    }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 10).join("\n") : e);
    fails.push("harness error");
  } finally {
    if (S) S.close();
    W.cleanup();
  }
  console.log(`\n=== auto-fix leaves a stranded port the mod inherited: ${checks} checks, ${fails.length} failed ===`);
  if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
})();
