// An add-on holding a verbatim copy of its dependency's definition.csv — what one Terrain click leaves — is not told about the unit
// positions its dependency's unitstacks.txt contradicts, and one Auto-fix click never copies that unitstacks.txt in to "repair" them. A
// province type the add-on itself changed is still reported and repaired, and the fixer drops nothing the rule did not report.
// #auto-fix-leaves-unit-positions-the-mod-inherited
//
// THE DEFECT. unitstacks_disagrees_with_province_type and fixUnitStacks are gated on modChangedMapFile(definition.csv), which diffs the
// mod's file against the BASE GAME only. An add-on over a dependency that ships its own definition.csv "changed" it the moment it holds
// a verbatim copy of the dependency's, and every slot the dependency's unitstacks.txt contradicts became the add-on's. Batch 7 fixed the
// same gate for lake-facing ports (basePortRowsWithoutASea); this caller never adopted it.
//
// MEASURED on 65978a2 (scratchpad batch8/layers probe-a.js), in-process on the two-layer fixture: a dependency whose definition.csv
// differs from the game's (a terrain) and whose unitstacks.txt puts sea-only slot 11 on land 2. The plain add-on was told nothing. The
// add-on holding the dependency's definition.csv verbatim was told [2], and ONE Auto-fix click wrote map/unitstacks.txt into it
// ("materialised": true) with the dependency's row dropped — a copy that then shadows the dependency's file. An add-on that retyped land
// 4 as sea was told of its own province 4 AND the dependency's 2, and the fixer dropped the dependency's row from the add-on's copy.
//
// THE FIX. baseUnitStackMismatchKeys runs findUnitStackMismatches on the stack below (cached layers), and the rule and the fixer read one
// shared answer, unitStackMismatchesTheModOwns, which subtracts it. The base-game diff stays as the cheap first question.
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

const W = lib.makeWorld("inhunitstacks");
const { createApp } = require("./server.js");
const md = require("./map-data.js");

const RULE = "unitstacks_disagrees_with_province_type";
const row = (p, t) => `${p};${t};100.00;9.50;100.00;0.00;0.24`;
const SEA_FLOOR = [0, 1, 2, 9, 10, 11, 12, 21, 22, 23, 30, 31, 38];
const GAME_STACKS = SEA_FLOOR.map((t) => row(1, t)).concat([2, 3, 4, 5].flatMap((p) => [row(p, 1), row(p, 2)]));
const DEP_ROW = row(2, 11);                                             // a sea-only slot on land 2: the dependency's own contradiction
lib.write(W.GAME, { "map/unitstacks.txt": GAME_STACKS.join("\n") + "\n" });
const DEP_DEF = lib.DEF({ 5: "5;0;200;200;land;false;hills;1" });      // differs from the game's file, changes no province type
const DEP_NAME = "Unit stack dependency";
const DEP = W.mod(DEP_NAME, { "map/definition.csv": DEP_DEF, "map/unitstacks.txt": GAME_STACKS.concat([DEP_ROW]).join("\n") + "\n" });
const OWN = { "history/states/1-A.txt": lib.st(1, "4", { manpower: 0 }) };
const has = (d, rel) => fs.existsSync(path.join(d, ...rel.split("/")));
const told = (v) => ((v && v.problems) || []).filter((p) => p.rule === RULE);
const stackRows = (d) => fs.readFileSync(path.join(d, "map", "unitstacks.txt"), "utf8").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

(async () => {
  let S = null;
  try {
    S = await lib.startServer(createApp);

    console.log("\n=== THE CONTROLS ===");
    {
      const v = await S.validate(DEP);
      rec("the dependency, validated as the mod over the game, is told of its own slot on land 2", told(v).length === 1 && (told(v)[0].provinces || []).join() === "2", told(v));
      const a = W.mod("Plain addon", OWN, [DEP_NAME]);
      const va = await S.validate(a);
      rec("an add-on over it shipping no definition.csv is told nothing of it", told(va).length === 0 && lib.idsOf(va, "state_no_manpower").join() === "1", lib.rulesIn(va));
    }

    console.log("\n=== 1. an add-on holding the dependency's definition.csv verbatim — one Terrain click's copy ===");
    {
      const a = W.mod("Copy addon", { ...OWN, "map/definition.csv": DEP_DEF }, [DEP_NAME]);
      const v = await S.validate(a);
      rec("THE CONTROL: the add-on is told its own problem (state 1 has no manpower)", lib.idsOf(v, "state_no_manpower").join() === "1", lib.rulesIn(v));
      rec("⭐⭐⭐ …and is not told of the dependency's unit positions", told(v).length === 0, told(v).map((p) => p.message.slice(0, 160)));
      const dry = md.fixUnitStacks({ modRoot: a, gameRoot: W.GAME, dependencyRoots: [DEP], dryRun: true });
      rec("⭐⭐ fixUnitStacks' dry run finds nothing to drop or add", !!dry && !dry.removed && !dry.added, dry);
      const before = lib.tree(a);
      const r1 = await S.autoFix(a);
      const after = lib.tree(a);
      rec("the click ran every fixer — it was not 'nothing to fix'", r1.status === 200 && r1.body.ok === true && !r1.body.nothingToFix, r1.body);
      rec("⭐⭐⭐ …changed no unit positions", !((r1.body.fixes || {}).unitStacks || {}).changed, (r1.body.fixes || {}).unitStacks);
      rec("⭐⭐⭐ …and wrote no unitstacks.txt into the add-on", !has(a, "map/unitstacks.txt"), lib.written(before, after));
      rec("⭐⭐ the whole click wrote only the add-on's own state file", lib.written(before, after).join() === "history/states/1-A.txt", lib.written(before, after));
      await S.autoFix(a);
      rec("⭐ a second click writes nothing", lib.written(after, lib.tree(a)).length === 0, lib.written(after, lib.tree(a)));
    }

    console.log("\n=== 2. …but a province type the add-on itself changed IS reported and repaired — and nothing of the dependency's ===");
    {
      // the add-on's own definition.csv makes land 5 a sea: short of every sea slot, which is the add-on's doing
      const OWN_DEF = lib.DEF({ 5: "5;0;200;200;sea;false;ocean;0" });
      const a = W.mod("Own type addon", { "map/definition.csv": OWN_DEF }, [DEP_NAME]);
      const v = await S.validate(a);
      rec("⭐⭐⭐ the add-on is told its unit positions describe the old map", told(v).length === 1, lib.rulesIn(v));
      const msg = told(v).length ? told(v)[0].message : "";
      rec("⭐⭐⭐ …for its own new sea province, and not for the dependency's slot on land 2",
        /1 sea province\(s\) have no unit positions at all/.test(msg) && !/naval slot/.test(msg) && !(told(v)[0].provinces || []).includes(2), { msg: msg.slice(0, 200), provinces: told(v)[0] && told(v)[0].provinces });
      const r = md.fixUnitStacks({ modRoot: a, gameRoot: W.GAME, dependencyRoots: [DEP] });
      // 5 already carries slots 1 and 2 as land; the fixer adds the rest of the floor
      rec("⭐⭐ fixUnitStacks repairs it: drops nothing, adds the sea floor for 5", !!r && r.changed === true && r.removed === 0 && r.added === SEA_FLOOR.filter((t) => t !== 1 && t !== 2).length, r);
      const rows = has(a, "map/unitstacks.txt") ? stackRows(a) : [];
      rec("⭐⭐⭐ …and the add-on's copy keeps the dependency's own row, which the rule never reported", rows.includes(DEP_ROW), rows.filter((l) => l.startsWith("2;")));
      rec("⭐ …with province 5 given every sea slot", SEA_FLOOR.every((t) => rows.some((l) => l.startsWith("5;" + t + ";"))), rows.filter((l) => l.startsWith("5;")));
      rec("⭐⭐ the rule is quiet afterwards", told(await S.validate(a)).length === 0, told(await S.validate(a)));
    }

    console.log("\n=== 3. a mod over the game alone that makes the same contradiction is still told and repaired ===");
    {
      const a = W.mod("Own slot", { "map/definition.csv": DEP_DEF, "map/unitstacks.txt": GAME_STACKS.concat([DEP_ROW]).join("\n") + "\n" });
      const v = await S.validate(a);
      rec("⭐⭐⭐ its slot on land 2 is reported", told(v).length === 1 && (told(v)[0].provinces || []).join() === "2", told(v));
      const r = md.fixUnitStacks({ modRoot: a, gameRoot: W.GAME, dependencyRoots: [] });
      rec("⭐⭐ …and fixUnitStacks drops it", !!r && r.removed === 1 && !stackRows(a).includes(DEP_ROW), r);
    }

    console.log("\n=== 4. the installed corpus: an add-on holding Novum Vexillum's definition.csv verbatim (read-only; nothing is written) ===");
    {
      // Novum Vexillum ships unitstacks contradictions of its own and launches. Found by descriptor name, its own count derived here.
      const VAN = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV", WS = "D:/SteamLibrary/steamapps/workshop/content/394360";
      let NV = "";
      try { for (const id of fs.readdirSync(WS)) { const r = path.join(WS, id); let d = ""; try { d = fs.readFileSync(path.join(r, "descriptor.mod"), "utf8"); } catch (_) {} if (/name\s*=\s*"Novum Vexillum"/.test(d) && has(r, "map/definition.csv") && has(r, "map/unitstacks.txt")) NV = r; } } catch (_) {}
      const own = NV && fs.existsSync(path.join(VAN, "map", "definition.csv")) ? md.findUnitStackMismatches({ modRoot: NV, gameRoot: VAN, dependencyRoots: [] }) : null;
      const n = own ? own.seaTypeOnLand.length + own.landTypeOnSea.length + own.seaMissingFloor.length : 0;
      if (!n) console.log("  NOTICE (not counted): Novum Vexillum is not installed, or ships no unitstacks contradiction any more — the fixture sections above stand alone.");
      else {
        const a = W.mod("NV copy addon", {});
        fs.mkdirSync(path.join(a, "map"), { recursive: true });
        fs.copyFileSync(path.join(NV, "map", "definition.csv"), path.join(a, "map", "definition.csv"));
        const v = md.validateMapBitmap({ modRoot: a, gameRoot: VAN, dependencyRoots: [NV] }).filter((p) => p.rule === RULE);
        rec(`⭐⭐⭐ Novum Vexillum reports ${n} contradiction(s) for itself; an add-on holding its definition.csv verbatim is told none`, v.length === 0, v.map((p) => p.message.slice(0, 160)));
        const dry = md.fixUnitStacks({ modRoot: a, gameRoot: VAN, dependencyRoots: [NV], dryRun: true });
        rec("⭐⭐ …and fixUnitStacks' dry run over it finds nothing to drop or add", !!dry && !dry.removed && !dry.added, dry);
      }
    }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 10).join("\n") : e);
    fails.push("harness error");
  } finally {
    if (S) S.close();
    W.cleanup();
  }
  console.log(`\n=== auto-fix leaves unit positions the mod inherited: ${checks} checks, ${fails.length} failed ===`);
  if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
})();
