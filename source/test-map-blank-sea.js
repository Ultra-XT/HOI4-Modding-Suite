// Unit test: blankMapToSea — the 'Delete map → blank canvas' reset. Crash-safe per the HOI4 rules: it KEEPS
// the province partition (pixels + ids) and the strategic regions, and leaves NO dangling references. It
// retypes every LAND province → sea in definition.csv, deletes all state files (no land ⇒ no states), deletes
// all supply-area files (they reference dead states), and strips every `capital = N` from country files (a
// dangling capital crashes the game). Builds a synthetic mod and verifies all of that on disk. Run: node test-map-blank-sea.js
"use strict";
const assert = require("assert");
const fs = require("fs"), os = require("os"), path = require("path");
const md = require("./map-data.js");

let pass = 0;
const ok = (n, c) => { assert.ok(c, n); console.log("  ok  " + n); pass++; };
const mk = (p, c) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, c); };

function buildMod() {
  const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-blank-"));
  mk(path.join(mod, "descriptor.mod"), 'name="Blank"\nreplace_path="history/states"\nreplace_path="history/countries"\nreplace_path="map"\nreplace_path="map/strategicregions"\nreplace_path="map/supplyareas"\n');
  mk(path.join(mod, "map", "definition.csv"), [
    "0;0;0;0;land;false;unknown;0;",
    "1;200;0;0;land;false;plains;3;",
    "2;0;200;0;land;true;forest;3;",
    "3;0;0;200;sea;false;ocean;0;",   // an existing sea province — must be left alone
    "4;200;200;0;land;false;hills;3;",
  ].join("\r\n") + "\r\n");
  const st = (id, provs) => `state = {\n\tid = ${id}\n\tname = "STATE_${id}"\n\tstate_category = rural\n\tprovinces = { ${provs} }\n\thistory = {\n\t\towner = AAA\n\t}\n}\n`;
  mk(path.join(mod, "history", "states", "1.txt"), st(1, "1 2"));
  mk(path.join(mod, "history", "states", "2.txt"), st(2, "4"));
  mk(path.join(mod, "map", "supplyareas", "a.txt"), 'supply_area={\n\tid=1\n\tname="SUPPLYAREA_1"\n\tvalue=5\n\tstates={ 1 2 }\n}\n');
  mk(path.join(mod, "history", "countries", "AAA.txt"), 'capital = 1\noob = "AAA_1936"\nset_politics = { ruling_party = neutrality }\n');
  mk(path.join(mod, "map", "strategicregions", "r.txt"), 'strategic_region={\n\tid=1\n\tname="REGION_1"\n\tprovinces={ 1 2 3 4 }\n\tweather={}\n}\n');
  return mod;
}

const defRow = (mod, id) => { const m = new RegExp("(^|\\n)(" + id + ";[^\\r\\n]*)").exec(fs.readFileSync(path.join(mod, "map", "definition.csv"), "utf8")); return m ? m[2].split(";") : null; };

(() => {
  console.log("=== blankMapToSea ('Delete map → blank canvas') ===");
  const mod = buildMod();
  let snapshotDir = "";
  try {
    const regionBefore = fs.readFileSync(path.join(mod, "map", "strategicregions", "r.txt"), "utf8");
    const csvLineCount = fs.readFileSync(path.join(mod, "map", "definition.csv"), "utf8").split("\n").length;

    const r = md.blankMapToSea({ modRoot: mod });
    ok("blank reports changed", r.changed === true);
    ok("blank flipped the 3 land provinces (1,2,4)", r.flippedProvinces === 3, r.flippedProvinces);

    // definition.csv: every land row is now sea; the pre-existing sea row + province 0 untouched; ids intact.
    ok("province 1 land → sea (ocean, continent 0, not coastal)", (() => { const c = defRow(mod, 1); return c[4] === "sea" && c[6] === "ocean" && c[7] === "0" && c[5] === "false"; })());
    ok("province 2 land → sea", defRow(mod, 2)[4] === "sea");
    ok("province 4 land → sea", defRow(mod, 4)[4] === "sea");
    ok("province 3 (already sea) left alone", (() => { const c = defRow(mod, 3); return c[4] === "sea" && c[6] === "ocean"; })());
    ok("province ids stay contiguous (same row count, no rows added/removed)", fs.readFileSync(path.join(mod, "map", "definition.csv"), "utf8").split("\n").length === csvLineCount);
    ok("province 2 keeps its colour (0,200,0)", (() => { const c = defRow(mod, 2); return c[1] === "0" && c[2] === "200" && c[3] === "0"; })());

    // All state files deleted (no land ⇒ no states).
    ok("all state files deleted", fs.readdirSync(path.join(mod, "history", "states")).filter((f) => f.endsWith(".txt")).length === 0);
    ok("blank reports 2 states deleted", r.deletedStates === 2, r.deletedStates);

    // Supply areas deleted (referenced dead states).
    ok("all supply-area files deleted", fs.readdirSync(path.join(mod, "map", "supplyareas")).filter((f) => f.endsWith(".txt")).length === 0);

    // Capital stripped from the country file (dangling capital would crash), rest of the file intact.
    const aaa = fs.readFileSync(path.join(mod, "history", "countries", "AAA.txt"), "utf8");
    ok("capital line stripped from the country file", !/capital\s*=\s*\d+/.test(aaa));
    ok("the rest of the country file is preserved (oob/politics kept)", /oob\s*=/.test(aaa) && /set_politics/.test(aaa));
    ok("blank reports 1 capital stripped", r.strippedCapitals === 1, r.strippedCapitals);

    // Strategic regions + the province partition are untouched.
    ok("strategic region file untouched (partition + regions kept)", fs.readFileSync(path.join(mod, "map", "strategicregions", "r.txt"), "utf8") === regionBefore);

    // ── #blank-map-deleted-without-a-copy — the deleted files must be recoverable ──
    //
    // Steps (1) and (4) back up every file they merely EDIT. Steps (2) and (3) unlinked every state
    // and supply-area file with no copy at all — 1,143-1,524 of them on a real mod, and fs.unlinkSync on
    // Windows has no recycle bin. The operation protected what it changed and not what it destroyed.
    // deleteCountry snapshots first for exactly this reason and deletes far less.
    ok("a snapshot path is reported", typeof r.snapshotPath === "string" && r.snapshotPath.length > 0, r.snapshotPath);
    ok("…covering every file that was deleted", r.snapshotted === 3, { snapshotted: r.snapshotted, failed: r.snapshotFailed });
    ok("…with no copy failures", r.snapshotFailed === 0, r.snapshotFailed);
    snapshotDir = r.snapshotPath;
    ok("the deleted state files are in it, byte-for-byte", (() => {
      const d = path.join(r.snapshotPath, "history", "states");
      const files = fs.readdirSync(d).filter((f) => f.endsWith(".txt"));
      return files.length === 2 && files.every((f) => fs.readFileSync(path.join(d, f), "utf8").includes("state"));
    })(), (() => { try { return fs.readdirSync(path.join(r.snapshotPath, "history", "states")); } catch (e) { return e.message; } })());
    ok("the deleted supply-area file is in it too", (() => {
      const d = path.join(r.snapshotPath, "map", "supplyareas");
      return fs.readdirSync(d).filter((f) => f.endsWith(".txt")).length === 1;
    })(), (() => { try { return fs.readdirSync(path.join(r.snapshotPath, "map", "supplyareas")); } catch (e) { return e.message; } })());
    // ⚠️ OUTSIDE the mod. A snapshot of 1,500 files inside history/states would be picked up by the next
    // scan, shipped in the user's release, and deleted by the very next blank.
    ok("the snapshot lives outside the mod", !path.resolve(r.snapshotPath).startsWith(path.resolve(mod)),
      { snapshot: r.snapshotPath, mod });

    console.log(`\ntest-map-blank-sea: ${pass} checks passed`);
  } finally {
    try { fs.rmSync(mod, { recursive: true, force: true }); } catch (_) {}
    // Nova's own store, created by this test in the user's home — clean it up, do not leave it lying there.
    try { if (snapshotDir) fs.rmSync(path.dirname(snapshotDir), { recursive: true, force: true }); } catch (_) {}
  }
})();
