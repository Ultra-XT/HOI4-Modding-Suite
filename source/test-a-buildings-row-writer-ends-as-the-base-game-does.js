// ⛔ #a-buildings-row-writer-ends-as-the-base-game-does (tool campaign B2-25).
//
// map/buildings.txt has two kinds of writer in map-data.js. fixCoastalNoPort ends the file with NO final newline, on purpose ("HOI4's
// buildings.txt parser reads a final newline as an empty record and logs 'invalid arguments count'"), and the base game's own file ends
// without one. The row writers a province move, a new state and an edit of the land reach (ensureBuildingSlotsForState,
// giveEditedLandItsRows) ended it WITH one, so the next 🔧 Auto-fix rewrote the whole 3.2 MB file to trim that byte
// (fixBuildingsTxtPlacement, trimmed: 1) and its line did not say so. Measured by repro-B2-25: Move 4861 -> 337 on a fresh add-on, then
// Auto-fix, answered buildingsTxt { trimmed: 1 }.
//   1. ensureBuildingSlotsForState on a mod's own file that ended in a newline: rows added, no final newline, the first row kept;
//   2. a state created on a fresh add-on (the base game's file copied in, rows added): ends as the base game's file ends;
//   3. giveEditedLandItsRows for a state with no rows: no final newline;
//   4. after each, the trim Auto-fix runs has nothing left to trim.
// Reads the installed base game (skips when it is absent). Binds no port. Run: node run-tests.js test-a-buildings-row-writer-ends
"use strict";
const assert = require("assert");
const fs = require("fs"), os = require("os"), path = require("path");
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-bt-eol-"));
process.env.APPDATA = path.join(ROOT, "appdata"); process.env.NOVA_APP_DATA_DIR = process.env.APPDATA; process.env.XDG_CONFIG_HOME = process.env.APPDATA;
process.env.NOVA_HOME_DIR = path.join(ROOT, "home");
fs.mkdirSync(process.env.APPDATA, { recursive: true });
fs.mkdirSync(process.env.NOVA_HOME_DIR, { recursive: true });
const md = require("./map-data.js");
let pass = 0;
const ok = (n, c, x) => { assert.ok(c, n + (x !== undefined ? " -> " + JSON.stringify(x).slice(0, 900) : "")); console.log("  ok  " + n); pass++; };
const GAME = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
const BASE_BT = path.join(GAME, "map", "buildings.txt");
const tail = (f) => { const b = fs.readFileSync(f); return { size: b.length, last: b[b.length - 1], newline: b[b.length - 1] === 10 || b[b.length - 1] === 13, blankLines: b.toString("latin1").split("\n").filter((l) => !l.trim()).length }; };
const trimLeft = (mod) => md.fixBuildingsTxtPlacement({ modRoot: mod, gameRoot: GAME, dependencyRoots: [], dryRun: true });
const newMod = (label, extra) => {
  const mod = path.join(ROOT, label);
  fs.mkdirSync(mod, { recursive: true });
  fs.writeFileSync(path.join(mod, "descriptor.mod"), `version="1.0"\nname="BT ${label}"\n${extra || ""}`, "utf8");
  return mod;
};

try {
  if (!fs.existsSync(BASE_BT)) {
    console.log("  ..  skipped: the base game is not installed at the expected path");
  } else {
    const base = tail(BASE_BT);
    ok("the base game's own buildings.txt ends without a final newline (what the writers imitate, read off the install)", !base.newline, base);

    console.log("=== 1. ensureBuildingSlotsForState on the mod's own file that ended in a newline ===");
    {
      const mod = newMod("own");
      fs.mkdirSync(path.join(mod, "map"), { recursive: true });
      const bt = path.join(mod, "map", "buildings.txt");
      fs.writeFileSync(bt, "1081;air_base;100.00;10.00;100.00;0.00;0\n", "utf8");
      const r = md.ensureBuildingSlotsForState({ modRoot: mod, gameRoot: GAME, dependencyRoots: [], stateId: 108, provinces: [3838] });
      ok("rows were added for state 108", r && r.changed === true && r.added > 0, r);
      const t = tail(bt);
      ok("…and the file ends without a final newline, with no blank line in it", !t.newline && t.blankLines === 0, t);
      ok("…and its first row is the one it had", fs.readFileSync(bt, "utf8").split("\n")[0] === "1081;air_base;100.00;10.00;100.00;0.00;0");
      const fx = trimLeft(mod);
      ok("…so the trim Auto-fix runs has nothing to trim", !(fx && fx.trimmed), fx);
    }

    console.log("=== 2. a state created on a fresh add-on ends its copy of the base game's file as the base game does ===");
    {
      const mod = newMod("create");
      const res = md.createState({ modRoot: mod, gameRoot: GAME, dependencyRoots: [], name: "Eolland", owner: "GER", provinces: [3838, 11374] });
      ok("the state was created", res && res.ok, res && res.error);
      const bt = path.join(mod, "map", "buildings.txt");
      ok("map/buildings.txt was copied into the mod", fs.existsSync(bt));
      const t = tail(bt);
      ok("…and it ends without a final newline, as the base game's file does", !t.newline && t.blankLines === base.blankLines, { mod: t, base });
      const fx = trimLeft(mod);
      ok("…so the trim Auto-fix runs has nothing to trim", !(fx && fx.trimmed), fx);
    }

    console.log("=== 3. giveEditedLandItsRows for a state with no rows ===");
    {
      const mod = newMod("edited", 'replace_path="history/states"\n');
      fs.mkdirSync(path.join(mod, "history", "states"), { recursive: true });
      fs.writeFileSync(path.join(mod, "history", "states", "999-Bare.txt"),
        'state = {\n\tid = 999\n\tname = "STATE_999"\n\tmanpower = 1000\n\tstate_category = town\n\tprovinces = { 3838 }\n\thistory = { owner = GER }\n}\n', "utf8");
      const r = md.giveEditedLandItsRows({ modRoot: mod, gameRoot: GAME, dependencyRoots: [], states: [999] });
      ok("rows were given to state 999", r && (r.placed || []).some((p) => p.stateId === 999 && p.added > 0), r);
      const bt = path.join(mod, "map", "buildings.txt");
      const t = tail(bt);
      ok("…and the file ends without a final newline", !t.newline && t.blankLines === base.blankLines, { mod: t, base });
      const fx = trimLeft(mod);
      ok("…so the trim Auto-fix runs has nothing to trim", !(fx && fx.trimmed), fx);
    }
  }
  console.log(`\ntest-a-buildings-row-writer-ends-as-the-base-game-does: ${pass} checks passed`);
} finally {
  try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) { /* this test's own temp fixtures and app-data */ }
}
