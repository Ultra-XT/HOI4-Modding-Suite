// The Auto-fix pass that gives a state with no people some manpower reads each state file once, however many states the map has, and
// still edits exactly the states it did before. #giving-states-people-reads-each-state-file-once
//
// THE DEFECT. fixStateNoManpower asked editStateBlock about EVERY land state the mod answers for, and a state whose layer below has
// people counts as the mod's (it would be the mod that took them away). editStateBlock looks for a state by reading the mod's state
// files and then the base's, one file at a time, until one holds the id, and only then runs the transform, which for a state that
// has people changes nothing. So one pass read the state files about N squared over 2 times to change one or two states.
//
// MEASURED on 65978a2 with batch 7's per-function timer (scratch instrumented copy, in-process autoFixMap with the arguments POST
// /api/map/auto-fix passes, the batch-6 sweep add-on: one state file without its state_category). One click took 54.3 s on an add-on
// over Old World Blues, 38.6 s over Millennium Dawn and 28.1 s over the base game, and fixStateNoManpower took 49.7 s, 34.6 s and
// 25.0 s of that: 1,525, 1,251 and 1,082 editStateBlock calls, 1.17 M, 0.78 M and 0.59 M findStateBlockById calls. None of those
// add-ons had a state without people.
//
// THE FIX. The pass finds the block editStateBlock would hand the transform (the mod's files first, then each layer below in
// baseRootsFor order, first file in listTxt order and first block in the file, found by the same scan findStateBlockById uses) from
// one read of each file, runs the same transform, and calls editStateBlock only when that changes the block. editStateBlock writes
// nothing and reports no change otherwise, so the answer is the same. The mod's files are read again after each write.
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

const tmps = [];
const tmp = (tag) => { const d = fs.mkdtempSync(path.join(os.tmpdir(), "nova-peopleonce-" + tag + "-")); tmps.push(d); return d; };
const APP = tmp("appdata");
process.env.APPDATA = APP; process.env.NOVA_APP_DATA_DIR = APP; process.env.XDG_CONFIG_HOME = APP;
process.env.NOVA_HOME_DIR = tmp("home");

// Count every read of a history/states file, installed before map-data.js loads (it calls fs.readFileSync at call time).
const reads = new Map();
let counting = false;
const origRead = fs.readFileSync;
fs.readFileSync = function (p, ...rest) {
  if (counting && typeof p === "string" && /[\\/]history[\\/]states[\\/]/i.test(p)) { const k = path.resolve(p); reads.set(k, (reads.get(k) || 0) + 1); }
  return origRead.call(this, p, ...rest);
};
const md = require("./map-data.js");
const measure = (fn) => { reads.clear(); counting = true; try { return fn(); } finally { counting = false; } };
const total = () => [...reads.values()].reduce((a, b) => a + b, 0);
const most = (under) => { let best = 0, file = ""; for (const [k, n] of reads) if (k.startsWith(path.resolve(under)) && n > best) { best = n; file = k; } return { n: best, file: path.basename(file) }; };

const write = (root, files) => { for (const [rel, body] of Object.entries(files)) { const p = path.join(root, ...rel.split("/")); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, body); } return root; };
const st = (id, mp = "\tmanpower = 1000\n") => `state = {\n\tid = ${id}\n\tname = "STATE_${id}"\n${mp}\tstate_category = rural\n\tprovinces = { ${id} }\n\thistory = {\n\t\towner = AAA\n\t}\n}\n`;

try {
  // A game with LAND single-province states, one file each; the last row of provinces is sea.
  const LAND = 240;
  const GAME = tmp("game");
  const rows = ["0;0;0;0;land;false;unknown;0"];
  for (let p = 1; p <= LAND + 16; p++) rows.push(`${p};${p % 250};${(p * 7) % 250};${(p * 13) % 250};${p > LAND ? "sea" : "land"};false;${p > LAND ? "ocean" : "plains"};${p > LAND ? 0 : 1}`);
  const game = { "map/definition.csv": rows.join("\n") + "\n", "common/state_category/00.txt": "state_categories = {\n\trural = {\n\t\tlocal_building_slots = 2\n\t}\n}\n" };
  for (let id = 1; id <= LAND; id++) game[`history/states/${id}-S.txt`] = st(id);
  game["history/states/11-S.txt"] = st(11, "\tmanpower = 0\n");     // a state the game itself ships with no people
  write(GAME, game);
  const gameFiles = fs.readdirSync(path.join(GAME, "history", "states")).length;

  // An add-on over the game: it took the people away from state 7, wrote state 9 without a manpower line, and holds two states in one
  // file (20 with manpower 0, 21 with people) so the second edit in that file comes after the first one's write.
  const MOD = write(tmp("mod"), {
    "descriptor.mod": 'name="People once"\nsupported_version="1.*"\n',
    "history/states/7-S.txt": st(7, "\tmanpower = 0\n"),
    "history/states/9-S.txt": st(9, ""),
    "history/states/20-S.txt": st(20, "\tmanpower = 0\n") + st(21) + st(22, ""),
  });
  const opts = { modRoot: MOD, gameRoot: GAME, dependencyRoots: [] };
  const modFiles = () => fs.readdirSync(path.join(MOD, "history", "states")).sort();
  const fileOf = (name) => fs.readFileSync(path.join(MOD, "history", "states", name), "utf8");
  md.buildMapModel({ ...opts, cacheStableLayers: true });   // the layers Auto-fix's own validate has already cached

  console.log("\n=== THE CONTROLS ===");
  const model = md.buildMapModel({ ...opts, cacheStableLayers: true });
  rec(`the add-on's map loads all ${LAND} land states`, (model.states || []).length === LAND, (model.states || []).length);
  rec(`the game ships ${gameFiles} state files`, gameFiles === LAND, gameFiles);

  console.log("\n=== 1. one pass gives people to exactly the add-on's own states without them ===");
  const r1 = measure(() => md.fixStateNoManpower(opts));
  const got = ((r1 && r1.details) || []).map((d) => `${d.state}:${d.manpower}`).sort().join(" ");
  rec("the pass reports the four states it gave people (7, 9, 20, 22), 1000 each", !!r1 && r1.fixed === 4 && got === "20:1000 22:1000 7:1000 9:1000", r1);
  rec("state 7's manpower 0 became 1000 in the add-on's own file", /\n\tmanpower = 1000\n/.test(fileOf("7-S.txt")) && !/manpower = 0/.test(fileOf("7-S.txt")), fileOf("7-S.txt"));
  rec("state 9 gained a manpower line after its id", /\tid = 9\n\tmanpower = 1000\n/.test(fileOf("9-S.txt")), fileOf("9-S.txt"));
  rec("in the file holding 20, 21 and 22: 20 and 22 got people and 21 kept its own", (fileOf("20-S.txt").match(/manpower = 1000/g) || []).length === 3 && !/manpower = 0/.test(fileOf("20-S.txt")), fileOf("20-S.txt"));
  rec("no state file of the game was copied into the add-on (11 has no people in the game itself)", modFiles().join() === "20-S.txt,7-S.txt,9-S.txt", modFiles());
  const n1 = total(), m1 = most(GAME);
  rec(`⭐⭐⭐ the pass read the ${gameFiles + 3} state files ${n1} times in all — at most twice each, plus the add-on's own again after a write`, n1 <= 2 * (gameFiles + 3) + 12, n1);
  rec("⭐⭐⭐ …and no game state file more than once", m1.n <= 1, m1);

  console.log("\n=== 2. a second pass changes nothing, and reads as little ===");
  const r2 = measure(() => md.fixStateNoManpower(opts));
  rec("the second pass gives people to no state", !!r2 && r2.fixed === 0, r2);
  const n2 = total();
  rec(`⭐⭐⭐ …reading the state files ${n2} times`, n2 <= gameFiles + 3 + 6, n2);
} catch (e) {
  console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 10).join("\n") : e);
  fails.push("harness error");
} finally {
  fs.readFileSync = origRead;
  for (const d of tmps) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} }
}
console.log(`\n=== giving states people reads each state file once: ${checks} checks, ${fails.length} failed ===`);
if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
