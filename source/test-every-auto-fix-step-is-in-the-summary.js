// ⛔ EVERY AUTO-FIX STEP SAYS WHAT IT DID — or a new one joins the silent list on purpose, and says why.
//
// Found by the review of 620258f: on the owner's TEST 29, one Auto-fix click changed nine files — heightmap.bmp,
// terrain.bmp, trees.bmp, world_normal.bmp and five colour pictures, 53,455 pixels of old coast lowered — all through the
// new drowned-coast step, and the summary line said nothing, because public/map.js builds it from a hand-kept list of
// `fr.fixes.<key>` reads and the new key was never added. A failure inside the step would have been swallowed the same way.
//
// The step list is DERIVED from autoFixMap's own source (every `fixes.<key> =`), and each must be read by the page. The
// steps below were silent before this test existed; they are allow-listed with a staleness check — an entry whose step
// is gone, or which the page has since learnt to read, fails until it is taken off.
//
// #every-auto-fix-step-is-in-the-summary — 2026-09-25: the eleven steps that were still silent now say what they did, and
// what went wrong. A source check cannot tell a line that reads a field the fixer never returns from one that works, so
// sections 3 and 4 DRIVE the real autoFixMap on scratch mods built to trigger each of the eleven, hand its real answer to
// the page's own summary code (lifted out of public/map.js and run), and require each line on the answer that produced it.
// The field names asserted there are read straight off the fixer's result, so a renamed field fails here, not in front of
// a modder.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const vm = require("vm");
const { stripJsComments, maskJsComments } = require("./testlib-strip-comments.js");

// ⛔ The fixtures below run the real autoFixMap, which backs every write up. Its backups, its auto-fix snapshot and its
// caches go to this test's own scratch folder, never to the user's AppData or home — whether or not run-tests.js is the caller.
const SCRATCH = fs.mkdtempSync(path.join(os.tmpdir(), "nova-every-step-"));
const APP = path.join(SCRATCH, "appdata");
fs.mkdirSync(APP, { recursive: true });
process.env.APPDATA = APP; process.env.NOVA_APP_DATA_DIR = APP; process.env.XDG_CONFIG_HOME = APP;
process.env.NOVA_HOME_DIR = path.join(SCRATCH, "home");
const md = require("./map-data.js");
const P = require("./testlib-map-page.js");   // withNoteHelpers: the summary's note helpers, derived not named

let pass = 0, fail = 0;
const ok = (c, m, x) => {
  if (c) { pass++; console.log("  ok   " + m); }
  else { fail++; console.log("  FAIL " + m + (x !== undefined ? "   -> " + JSON.stringify(x).slice(0, 400) : "")); }
};

// Silent before 2026-09-25. Each is a step whose result the summary does not mention yet. Do not add to this list to make
// a new step pass: put a line in the summary instead.
const SILENT_BEFORE = [
  // ⚠️ "backupSnapshot" was here ("read whole, through backupSnapshotNote(fr.fixes), not by key") until 🌍 Generate a world read it
  // by key, for its list of where each step's copies went: this list's own staleness check took it off. It is no step — see NOT_A_STEP.
];

// Not a step: the backup scope's own record, which autoFixMap sets in its `finally` from endBackupScope()'s answer. No fixer runs
// under that name, so nothing can throw into it and section 5's `{ error }` is not a shape it can take. The summary says it whole,
// through backupSnapshotNote(fr.fixes) — section 1 runs that. name → staleness check (true while it is still only the scope's record)
const NOT_A_STEP = {
  backupSnapshot: (b) => /\}\s*finally\s*\{[\s\S]*?const\s+snap\s*=\s*endBackupScope\(\)\s*;[\s\S]*?fixes\.backupSnapshot\s*=\s*snap\s*;/.test(b)
    && (b.match(/fixes\.backupSnapshot\s*=/g) || []).length === 1,
};

// Steps whose FAILURE the summary swallowed before 2026-09-25 (section 5): hand the page `{ error }` for one of these — the
// shape autoFixMap stores when a step throws — and the line it builds does not contain the reason, so a step that crashed
// reads exactly like one that found nothing. Measured by that section on the day it was written: 27 of the 43 steps. Same
// rule as the list above — put the failure in the summary rather than adding a step here; the staleness check takes a step
// off once its failure is said.
// ⛔ #every-auto-fix-step-says-why-it-failed — EMPTIED 2026-11-13 (tool campaign B6-1): the 27 it held were still silent on
// 11-13, 27 of the 52 steps, and a real write refusal (a read-only state file, fixes.categories.error) read "Auto-fix changed
// nothing this time". Each now says its failure beside its own line in public/map.js. Keep it empty: a new step says why it failed.
const ERROR_SILENT_BEFORE = [];

const src = stripJsComments(fs.readFileSync(path.join(__dirname, "map-data.js"), "utf8"));
const a = src.indexOf("function autoFixMap(");
const body = a < 0 ? "" : src.slice(a, src.indexOf("\nfunction ", a + 10));
const keys = [...new Set([...body.matchAll(/fixes\.([A-Za-z0-9_]+)\s*=/g)].map((m) => m[1]))];
const page = stripJsComments(fs.readFileSync(path.join(__dirname, "public", "map.js"), "utf8"));
const reads = (k) => new RegExp("fixes\\." + k + "\\b").test(page);

// ── The page's own summary, lifted out of public/map.js and run on an auto-fix answer ────────────────────────────────
// From `const ro = (fr.fixes` down to the `summaryLine` it builds — the same lift test-auto-fix-says-what-it-refused-rather-
// than-that-it-found-nothing.js uses, so a wording change is a change to the very lines this runs.
const MAP_SRC = fs.readFileSync(path.join(__dirname, "public", "map.js"), "utf8");
const MASKED = maskJsComments(MAP_SRC);
const liftAt = MASKED.indexOf("const ro = (fr.fixes");
const liftEndAt = MASKED.indexOf("const summaryLine = (parts.length", liftAt);
const liftEnd = liftEndAt < 0 ? -1 : MASKED.indexOf(";", liftEndAt);
const LIFT = liftAt >= 0 && liftEnd >= 0 ? MAP_SRC.slice(liftAt, liftEnd + 1) : "";
function summaryFor(fr) {
  const sandbox = { console, JSON, Set, Math, Array, Number, String, Object, fr };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(P.withNoteHelpers(`var statusEl = null;\n${LIFT}`) + "\nglobalThis.__line = summaryLine;", sandbox);
  return String(sandbox.__line);
}

// ── The fixtures ──────────────────────────────────────────────────────────────────────────────────────────────────────
function bmp24(w, h, fn) {
  const rs = (w * 3 + 3) & ~3, is = rs * h; const b = Buffer.alloc(54 + is);
  b.write("BM", 0, "ascii"); b.writeUInt32LE(54 + is, 2); b.writeUInt32LE(54, 10); b.writeUInt32LE(40, 14);
  b.writeInt32LE(w, 18); b.writeInt32LE(h, 22); b.writeUInt16LE(1, 26); b.writeUInt16LE(24, 28); b.writeUInt32LE(0, 30); b.writeUInt32LE(is, 34);
  for (let y = 0; y < h; y++) { let o = 54 + (h - 1 - y) * rs; for (let x = 0; x < w; x++) { const [r, g, bl] = fn(x, y); b[o++] = bl; b[o++] = g; b[o++] = r; } }
  return b;
}
const writer = (root) => (rel, c) => { const p = path.join(root, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, c); };
const WEATHER = "\tweather={\n\t\tperiod={\n\t\t\tbetween={ 0.0 364.0 }\n\t\t\ttemperature={ -5.0 25.0 }\n\t\t\tno_phenomenon=0.700\n\t\t}\n\t}\n";
const stateTxt = (id, provs, owner, { manpower = 1000, buildings = "" } = {}) =>
  `state = {\n\tid = ${id}\n\tname = "STATE_${id}"\n${manpower ? `\tmanpower = ${manpower}\n` : ""}\tstate_category = rural\n\tprovinces = { ${provs} }\n` +
  `\thistory = {\n\t\towner = ${owner}\n${buildings ? `\t\tbuildings = {\n${buildings}\t\t}\n` : ""}\t}\n}\n`;

// A — AN OVERLAY over a small base game of its own, whose own definition.csv turns the base's two inland seas (1, 2) to land.
// 10x4: top row 1 2 3 4, bottom row 5 6 7 8, two pixels a province, and ocean 9 down the right edge (the map wraps, so 1
// and 5 touch it too). State 1 {3 7} keeps a dockyard and had only sea 2 beside it; two ports face the drained seas and three
// face the ocean, which is the majority the port census needs to call a port on land a stranded one. The mod also ships an
// EMPTY map/supply_nodes.txt over a base that has hubs — the add-on shape the supply step refuses.
// Triggers: strandedPorts, coastalFlags, adjacencyTypes (materialised), navalNoCoast, unitStacks (materialised), stateSites,
// and supplyNetwork's refusal.
// ⛔ #a-coast-taken-away-keeps-its-naval-buildings — moved with it: Auto-fix deletes no dockyard now. State 3 {4 8}, the one other
// coastal state, is BBB's here, so no other state of state 1's country has a coast and the dockyard stays where it is, said (`left`);
// with `state3Owner` "AAA" (fixture A2) it goes to state 3 (`carried`). (A2's carry copies the base's state 3 into the mod, which makes
// every land state the mod's, so A2 is not the supply step's refusal: that is A's.)
function makeOverlayFixture(root, { state3Owner = "BBB" } = {}) {
  const game = path.join(root, "A-game"), mod = path.join(root, "A-mod");
  const g = writer(game), m = writer(mod);
  const col = (id) => [id * 20, 7, 0];
  const provAt = (x, y) => (x >= 8 ? 9 : (y < 2 ? [1, 2, 3, 4] : [5, 6, 7, 8])[Math.floor(x / 2)]);
  const base = { 1: "sea", 2: "sea", 3: "land", 4: "land", 5: "land", 6: "land", 7: "land", 8: "land", 9: "sea" };
  const coastal = { 3: true, 4: true, 5: true, 6: true, 8: true };
  const csv = (types) => ["0;0;0;0;land;false;unknown;0"].concat(Object.keys(types).map((i) => {
    const [r, gg, b] = col(+i); const sea = types[i] === "sea";
    return `${i};${r};${gg};${b};${types[i]};${coastal[i] && !sea ? "true" : "false"};${sea ? "ocean" : "plains"};${sea ? 0 : 1}`;
  })).join("\n") + "\n";
  g("map/provinces.bmp", bmp24(10, 4, (x, y) => col(provAt(x, y))));
  g("map/definition.csv", csv(base));
  g("map/default.map", 'definitions = "definition.csv"\nprovinces = "provinces.bmp"\n');
  g("map/adjacencies.csv", "From;To;Type;Through;start_x;start_y;stop_x;stop_y;adjacency_rule_name;Comment\n5;6;sea;1;-1;-1;-1;-1;;\n-1;-1;-1;-1;-1;-1;-1;-1;-1\n");
  g("map/buildings.txt", [
    "2;naval_base_spawn;1.00;9.50;1.50;0.00;1",
    "1;naval_base_spawn;4.50;9.50;2.50;0.00;2",
    "3;naval_base_spawn;7.50;9.50;3.00;0.00;9",
    "3;naval_base_spawn;7.50;9.50;1.00;0.00;9",
    "3;naval_base_spawn;7.50;9.50;2.00;0.00;9",
  ].join("\n") + "\n");
  const us = [];
  for (const i of Object.keys(base)) {
    for (const k of (base[i] === "sea" ? [0, 1, 2, 9, 10, 11, 12, 21, 22, 23, 30, 31, 38] : [1, 2])) us.push(`${i};${k};${(+i).toFixed(2)};9.50;1.00;0.00;0.24`);
  }
  g("map/unitstacks.txt", us.join("\n") + "\n");
  g("map/supply_nodes.txt", "1 3\n1 5\n1 4\n");
  g("map/railways.txt", "1 2 3 4 \n");
  g("map/strategicregions/1-L.txt", `strategic_region={\n\tid=1\n\tname="R1"\n\tprovinces={ 3 4 5 6 7 8 }\n${WEATHER}}\n`);
  g("map/strategicregions/2-S.txt", `strategic_region={\n\tid=2\n\tname="R2"\n\tprovinces={ 1 2 9 }\n\tnaval_terrain = water_deep_ocean\n${WEATHER}}\n`);
  g("history/states/1-S1.txt", stateTxt(1, "3 7", "AAA", { buildings: "\t\t\tinfrastructure = 2\n\t\t\tdockyard = 2\n" }));
  g("history/states/2-S2.txt", stateTxt(2, "5 6", "BBB"));
  g("history/states/3-S3.txt", stateTxt(3, "4 8", state3Owner));
  g("history/countries/AAA - A.txt", "capital = 1\n");
  g("history/countries/BBB - B.txt", "capital = 2\n");
  m("descriptor.mod", 'name="EveryStepOverlay"\nsupported_version="1.19.*"\n');
  m("map/definition.csv", csv(Object.assign({}, base, { 1: "land", 2: "land" })));
  m("map/supply_nodes.txt", "");
  return { modRoot: mod, gameRoot: game, dependencyRoots: [] };
}

// B — A WORLD THE MOD OWNS OUTRIGHT (replace_path map and history/states), with no base game at all.
// 256x256: x<20 land 2, x>=200 ocean 4 above y=128 and land 5 below, a bay of sea 3 at [60,200)x[80,176), land 1 elsewhere.
// Province 6 is land in definition.csv with no pixels at all, so state 3's building positions cannot be placed anywhere.
// State 1 sets a building on province 5, which is state 2's; state 2 has no manpower line; one supply area spans two
// strategic regions; an air base of state 1 and a factory of state 3 stand in the bay; the mod's own supply files are empty.
// Triggers: noManpower, orphanBuildings, supplyAreaSplits, slotsOverWater (with a state it could not repair), stateSites
// (with one it could not place), supplyNetwork.
function makeWorldFixture(root) {
  const mod = path.join(root, "B-mod");
  const m = writer(mod);
  const provAt = (x, y) => (x < 20 ? 2 : x >= 200 ? (y < 128 ? 4 : 5) : (x >= 60 && y >= 80 && y < 176) ? 3 : 1);
  const COL = { 1: [10, 10, 10], 2: [20, 20, 20], 3: [30, 30, 30], 4: [40, 40, 40], 5: [50, 50, 50] };
  const Z = (y) => (255 - y).toFixed(2);
  m("descriptor.mod", 'name="EveryStepWorld"\nsupported_version="1.19.*"\nreplace_path="history/states"\nreplace_path="map"\nreplace_path="map/supplyareas"\nreplace_path="map/strategicregions"\n');
  m("map/provinces.bmp", bmp24(256, 256, (x, y) => COL[provAt(x, y)]));
  m("map/definition.csv", ["0;0;0;0;land;false;unknown;0", "1;10;10;10;land;true;plains;1", "2;20;20;20;land;false;plains;1",
    "3;30;30;30;sea;false;ocean;0", "4;40;40;40;sea;false;ocean;0", "5;50;50;50;land;true;plains;1", "6;60;60;60;land;false;plains;1"].join("\n") + "\n");
  m("history/states/1-S1.txt", stateTxt(1, "1 2", "AAA", { buildings: "\t\t\tinfrastructure = 3\n\t\t\t5 = { bunker = 1 }\n" }));
  m("history/states/2-S2.txt", stateTxt(2, "5", "BBB", { manpower: 0 }));
  m("history/states/3-S3.txt", stateTxt(3, "6", "BBB"));
  m("history/countries/AAA - A.txt", "capital = 1\n");
  m("history/countries/BBB - B.txt", "capital = 2\n");
  m("map/strategicregions/1-R1.txt", `strategic_region={\n\tid=1\n\tname="R1"\n\tprovinces={ 1 2 6 }\n${WEATHER}}\n`);
  m("map/strategicregions/2-R2.txt", `strategic_region={\n\tid=2\n\tname="R2"\n\tprovinces={ 3 4 }\n\tnaval_terrain = water_deep_ocean\n${WEATHER}}\n`);
  m("map/strategicregions/3-R3.txt", `strategic_region={\n\tid=3\n\tname="R3"\n\tprovinces={ 5 }\n${WEATHER}}\n`);
  m("map/supplyareas/1-SA.txt", 'supply_area = {\n\tid = 1\n\tname = "SUPPLYAREA_1"\n\tvalue = 1\n\tstates = { 1 2 3 }\n}\n');
  m("map/adjacencies.csv", "From;To;Type;Through;start_x;start_y;stop_x;stop_y;adjacency_rule_name;Comment\n-1;-1;-1;-1;-1;-1;-1;-1;-1\n");
  m("map/buildings.txt", [`1;naval_base_spawn;100.00;9.50;${Z(79)};0.00;3`, `1;air_base;120.00;9.50;${Z(120)};0.00;0`,
    `3;arms_factory;130.00;9.50;${Z(130)};0.00;0`].join("\n") + "\n");
  m("map/supply_nodes.txt", "");
  m("map/railways.txt", "");
  return { modRoot: mod, gameRoot: path.join(root, "no-game"), dependencyRoots: [] };
}

const has = (line, s) => line.indexOf(s) >= 0;
const clauseOf = (line, s) => { const i = line.indexOf(s); return i < 0 ? "" : line.slice(i, i + 260); };

try {
  console.log("\n-- the steps, derived from autoFixMap --");
  ok(keys.length >= 40 && keys.includes("drownedCoast") && keys.includes("worldTextures"), `found ${keys.length} steps, the two newest among them`, keys);
  const silent = keys.filter((k) => !reads(k) && !SILENT_BEFORE.includes(k) && !NOT_A_STEP[k]);
  ok(!silent.length, "every step the summary does not list is one that was silent before this test existed", silent);

  console.log("\n-- the silent list is not stale --");
  const gone = SILENT_BEFORE.filter((k) => !keys.includes(k));
  ok(!gone.length, "every allow-listed step still exists", gone);
  const nowRead = SILENT_BEFORE.filter((k) => reads(k));
  ok(!nowRead.length, "…and none of them is read by the page yet (take it off the list once it is)", nowRead);
  for (const [k, holds] of Object.entries(NOT_A_STEP)) {
    ok(keys.includes(k) && holds(body), `${k} is no step: autoFixMap sets it once, in its finally, from endBackupScope()'s answer`);
    // the summary hands fr.fixes to backupSnapshotNote, whose words live in public/map-rule-labels.js (this sandbox has no window)
    const ML = require("./public/map-rule-labels.js");
    const said = ML.backupSnapshotNote({ [k]: { dir: "C:/probe/the-copies-folder", files: 2, failed: 0 } });
    const all = ML.backupSnapshotNote({ [k]: { files: 0, failed: 3 } });
    ok(/\btail \+= snapNote\b/.test(LIFT) && /const snapNote = backupSnapshotNote\(fr\.fixes\)/.test(LIFT) && said.includes("C:/probe/the-copies-folder") && /could not copy the 3 files/.test(all),
      `…and the summary says it whole (backupSnapshotNote(fr.fixes)): the folder, and copies that all failed`, [said.slice(-160), all.slice(-160)]);
  }

  console.log("\n-- the two newest say what they did, and what went wrong --");
  for (const k of ["drownedCoast", "worldTextures"]) {
    const at = page.indexOf("fixes." + k);
    const near = at < 0 ? "" : page.slice(at, at + 2400);
    ok(at >= 0 && /parts\.push\(/.test(near), `${k}: the summary gains a line when it changed something`);
    ok(new RegExp("\\.error\\)\\s*(parts|unfinished)\\.push\\(").test(near), `${k}: …and one when it failed`);
  }

  console.log("\n-- 1. THE CONTROL: the page's summary code was found and runs --");
  ok(LIFT.length > 5000 && /summaryLine/.test(LIFT), "the summary was lifted out of public/map.js", LIFT.length);
  const empty = summaryFor({ ok: true, fixes: {} });
  ok(/changed nothing/.test(empty), "…and an empty answer builds the line that says the click changed nothing", empty);

  const fx = {};
  console.log("\n-- 2. the real autoFixMap, on scratch mods built to trigger the eleven --");
  {
    fx.A = md.autoFixMap(makeOverlayFixture(path.join(SCRATCH, "A")));
    fx.B = md.autoFixMap(makeWorldFixture(path.join(SCRATCH, "B")));
    // C: the world with no provinces.bmp anywhere — the steps that need the bitmap report an error instead.
    const C = makeWorldFixture(path.join(SCRATCH, "C"));
    fs.unlinkSync(path.join(C.modRoot, "map", "provinces.bmp"));
    fx.C = md.autoFixMap(C);
    // D: the world with state 1's file and railways.txt read-only, so those two writes fail.
    const D = makeWorldFixture(path.join(SCRATCH, "D"));
    const locked = [path.join(D.modRoot, "history", "states", "1-S1.txt"), path.join(D.modRoot, "map", "railways.txt")];
    for (const f of locked) fs.chmodSync(f, 0o444);
    try { fx.D = md.autoFixMap(D); } finally { for (const f of locked) { try { fs.chmodSync(f, 0o666); } catch (_) {} } }
    // A2: A with state 3 AAA's, so state 1's dockyard has a coast of its country to go to
    fx.A2 = md.autoFixMap(makeOverlayFixture(path.join(SCRATCH, "A2"), { state3Owner: "AAA" }));
    // E: B's world once its click has given state 1 every position, with one more air base of state 1's put back in the bay —
    // the drop leaves the state furnished, and the slot writer answers "state already has every building slot".
    const Bmod = path.join(SCRATCH, "B", "B-mod");
    const Bbuild = path.join(Bmod, "map", "buildings.txt"), Bnow = fs.readFileSync(Bbuild, "utf8");   // the click's rewrite ends with no newline
    fs.writeFileSync(Bbuild, Bnow + (Bnow.endsWith("\n") ? "" : "\n") + `1;air_base;121.00;9.50;${(255 - 121).toFixed(2)};0.00;0\n`);
    fx.E = md.autoFixMap({ modRoot: Bmod, gameRoot: path.join(SCRATCH, "B", "no-game"), dependencyRoots: [] });
    for (const k of ["A", "B", "C", "D", "E", "A2"]) ok(fx[k] && fx[k].ok && !fx[k].nothingToFix && fx[k].fixes, `fixture ${k}: Auto-fix ran and had work to do`, fx[k] && (fx[k].error || fx[k].note));
  }
  const F = (k) => (fx[k] && fx[k].fixes) || {};
  const line = {};
  for (const k of ["A", "B", "C", "D", "E", "A2"]) { line[k] = summaryFor(fx[k] || { ok: true, fixes: {} }); console.log(`  ${k}: ${line[k].slice(0, 3000)}`); }

  console.log("\n-- 3. each of the eleven: the fixer's own answer, and the line the modder reads --");
  {
    const sp = F("A").strandedPorts || {};
    ok(sp.removed === 2 && Array.isArray(sp.provinces) && sp.provinces.includes(1) && sp.provinces.includes(2), "strandedPorts: removed the two ports facing the drained seas", sp);
    ok(has(line.A, `removed ${sp.removed} port(s) from map/buildings.txt`) && has(line.A, "facing province 1, 2"), "…and the summary says how many, and which provinces they faced", clauseOf(line.A, "port(s) from"));

    const cf = F("A").coastalFlags || {};
    ok(cf.changed > 0 && cf.file === "map/definition.csv" && cf.materialized === false, "coastalFlags: rewrote the coastal column of the mod's own definition.csv", cf);
    ok(has(line.A, `corrected the coastal flag of ${cf.changed} province(s) in map/definition.csv`), "…and the summary says how many", clauseOf(line.A, "corrected the coastal"));
    ok(!/definition\.csv is now YOUR mod's/.test(line.A), "…and claims no copy: the mod already had that file");

    const at = F("A").adjacencyTypes || {};
    ok(at.changed === true && at.retyped === 1 && at.landCrossings === 1 && at.seaLinks === 0 && at.materialized === true && at.file === "map/adjacencies.csv",
      "adjacencyTypes: retyped the strait whose sea became land, copying the base's adjacencies.csv in", at);
    ok(has(line.A, `retyped ${at.retyped} row(s) of map/adjacencies.csv`) && has(line.A, `${at.landCrossings} whose sea is now land became land crossings`) && !has(line.A, "became sea links"),
      "…and the summary says how many, and of which kind", clauseOf(line.A, "retyped"));
    ok(has(line.A, "map/adjacencies.csv is now YOUR mod's"), "⭐ …and that the mod has just taken a copy of the file", clauseOf(line.A, "retyped"));

    // ⛔ #a-coast-taken-away-keeps-its-naval-buildings — this was "removed state 1's dockyard": Auto-fix deletes none now
    const nn = F("A").navalNoCoast || {}, nl = (nn.left || [])[0] || {};
    ok(nn.removed === 0 && (nn.left || []).length === 1 && nl.stateId === 1 && nl.key === "dockyard" && nl.province == null && /no other state of AAA has a coast/.test(nl.why || "") && !(nn.carried || []).length,
      "navalNoCoast: left state 1's dockyard, which lost its only sea, where it is — no other state of its country has a coast — and deleted nothing", nn);
    ok(has(line.A, `left ${(nn.left || []).length} dockyard(s) and naval base(s) with no coast where they are, in state 1: no other state of AAA has a coast`) && has(line.A, "Nova deletes none of them")
      && has(line.A, "(a dockyard with the state panel's Dockyard field; Save does not stop for it)") && !has(line.A, "Save stops for a dockyard") && !has(line.A, "removed 1 dockyard"),
      "…and the summary says how many, where, why, and the state panel step that clears it — with no Save-stop claim (⛔ #a-refused-dockyard-is-not-a-save-gate)", clauseOf(line.A, "dockyard(s)"));
    const nn2 = F("A2").navalNoCoast || {}, nc = (nn2.carried || [])[0] || {};
    ok(nn2.removed === 0 && (nn2.carried || []).length === 1 && nc.from === 1 && nc.to === 3 && JSON.stringify(nc.levels) === JSON.stringify([{ date: null, key: "dockyard", level: 2 }]) && !(nn2.left || []).length,
      "A2: navalNoCoast carried state 1's 2 dockyards to state 3, its country's coastal state", nn2);
    ok(has(line.A2, "moved the dockyards and naval bases of 1 state(s) left with no coast to the nearest coastal state of the same country (state 1 → 3: 2 dockyards)") && !has(line.A2, "dockyard(s) and naval base(s) with no coast where they are"),
      "…and the summary says what went where", clauseOf(line.A2, "moved the dockyards"));

    const us = F("A").unitStacks || {};
    ok(us.changed === true && us.removed > 0 && us.materialised === true, "unitStacks: dropped the drained seas' naval slots, copying the base's unitstacks.txt in", us);
    ok(has(line.A, `removed ${us.removed} unit position(s) of the wrong kind`) && has(line.A, "map/unitstacks.txt is now YOUR mod's"),
      "…and the summary says how many, and that the mod has just taken a copy of the file", clauseOf(line.A, "unitstacks"));
    ok(!has(line.A, "sea province cannot do without"), "…and names no added position when it added none", us.added);

    const snA = F("A").supplyNetwork || {};
    ok(snA.changed === false && snA.landStates > 0 && typeof snA.reason === "string" && snA.ownedByThisMod < snA.landStates,
      "supplyNetwork: refused to write hubs over an empty file that hides the base's", snA);
    ok(has(line.A, `no supply hubs were written: ${snA.reason}`), "…and the summary says why", clauseOf(line.A, "no supply hubs"));

    const nm = F("B").noManpower || {};
    ok(nm.fixed === 1 && nm.details && nm.details[0] && nm.details[0].state === 2, "noManpower: gave state 2 people", nm);
    ok(has(line.B, `gave ${nm.fixed} land state(s) with no people a manpower of their own (state 2)`), "…and the summary says how many, and which", clauseOf(line.B, "no people"));

    const ob = F("B").orphanBuildings || {};
    ok(ob.removed === 1 && ob.details[0] && ob.details[0].province === 5 && ob.details[0].file === "1-S1.txt", "orphanBuildings: took state 1's block for province 5 out", ob);
    ok(has(line.B, `took ${ob.removed} province building block(s) out of state history`), "…and the summary says how many", clauseOf(line.B, "province building block"));

    const sa = F("B").supplyAreaSplits || {};
    ok(sa.changed === true && sa.moved.length === 1 && sa.moved[0].state === 2 && sa.created.length === 1, "supplyAreaSplits: moved state 2 into a new area of its own region", sa);
    ok(has(line.B, `moved ${sa.moved.length} state(s) into a supply area of their own strategic region, making ${sa.created.length} new area(s)`),
      "…and the summary says so", clauseOf(line.B, "supply area of their own"));
    ok(/HOI4 has not read map\/supplyareas/.test(clauseOf(line.B, "supply area of their own")), "…and that it is a tidy-up the game does not read, not a repair", clauseOf(line.B, "supply area of their own"));

    const so = F("B").slotsOverWater || {};
    const soFail = (so.failed || [])[0] || {};
    ok(so.dropped === 2 && so.states.length === 1 && so.states[0] === 1 && soFail.state === 3 && /no land pixels/.test(soFail.reason || ""),
      "slotsOverWater: dropped the two positions in the bay, put state 1's back and could not place state 3's", so);
    ok(has(line.B, `dropped ${so.dropped} building position(s) standing on water`) && has(line.B, "state 1 back on its own land"), "…and the summary says how many, and for which state", clauseOf(line.B, "dropped"));
    ok(has(line.B, `state 3's building positions were taken off the water but not put back on its land: ${soFail.reason}`), "⭐ …and which state it could not repair, and why", clauseOf(line.B, "state 3's building"));

    const ss = F("B").stateSites || {};
    const ssFail = (ss.failed || [])[0] || {};
    ok(ss.fixed === 1 && ss.states[0] === 2 && ssFail.state === 3 && /no land pixels/.test(ssFail.reason || ""), "stateSites: gave state 2 its positions and could not place state 3's", ss);
    ok(has(line.B, `gave ${ss.fixed} state(s) with no air base or rocket site position the standard building positions (state 2)`), "…and the summary says how many, and which", clauseOf(line.B, "no air base"));
    ok(has(line.B, `state 3 still has no air base or rocket site position: ${ssFail.reason}`), "⭐ …and which state it could not place, and why", clauseOf(line.B, "state 3 still"));

    const snB = F("B").supplyNetwork || {};
    ok(snB.changed === true && snB.hubs === 3 && snB.railways === 1 && !snB.error, "supplyNetwork: gave the world three hubs and a railway", snB);
    ok(has(line.B, `${snB.hubs} supply hub(s) and ${snB.railways} railway(s) joining them, written to map/supply_nodes.txt and map/railways.txt`),
      "…and the summary says how many, and where", clauseOf(line.B, "supply network"));
    ok(!has(line.B, "no supply hubs were written"), "…and says no refusal beside a network it wrote");
  }

  console.log("\n-- 4. …and what went wrong: the failures the fixers report, driven for real --");
  {
    for (const k of ["coastalFlags", "navalNoCoast", "slotsOverWater"]) {
      const e = (F("C")[k] || {}).error;
      ok(typeof e === "string" && /provinces\.bmp/.test(e), `C: ${k} reports that it had no bitmap to read`, F("C")[k]);
      const eb = String(e || "").replace(/[.\s]+$/, "");
      ok(!!e && has(line.C, eb) && /could not [^:]*: provinces\.bmp not found/.test(clauseOf(line.C, "could not")), `…and the summary says ${k} could not run, and why`, clauseOf(line.C, eb));
    }
    const ssC = F("C").stateSites || {};
    ok((ssC.failed || []).length === 3, "C: stateSites could place no state's positions", ssC);
    ok((line.C.match(/still has no air base or rocket site position/g) || []).length === 3, "…and the summary names each of the three", line.C.length);

    // ⭐⭐⭐ THE ADVERSARIAL CASE. fixOrphanedStateBuildings used to count a block as removed BEFORE its file was written and fold a
    // failed write into `details`, which it cuts at 80 — so a read-only state file answered { removed: 1 } and, past the 80th entry,
    // no error at all (review: 82 claimed, 81 removed). It now counts a block once its file is written, and lists every file it
    // could not write in `writeErrors`, uncapped.
    const bare = (e) => String(e || "").replace(/[.\s]+$/, "");   // the page drops a message's own full stop
    const obD = F("D").orphanBuildings || {};
    const obErr = (obD.writeErrors || [])[0] || {};
    ok(obD.removed === 0 && obErr.file === "1-S1.txt" && obErr.blocks === 1 && /read-only/.test(obErr.error || ""), "D: the fixer counts nothing it could not write, and lists the file it could not", obD);
    ok(/5\s*=\s*\{\s*bunker/.test(fs.readFileSync(path.join(SCRATCH, "D", "B-mod", "history", "states", "1-S1.txt"), "utf8")), "…and the block really is still on disk");
    ok(!has(line.D, "province building block(s) out of state history"), "⭐⭐⭐ …so the summary does NOT claim it took the block out", clauseOf(line.D, "province building block"));
    ok(has(line.D, `could not rewrite history/states/1-S1.txt, so its 1 building block(s) are still there: ${bare(obErr.error)}`), "⭐⭐ …and says which file it could not write, and why", clauseOf(line.D, "could not rewrite"));

    const snD = F("D").supplyNetwork || {};
    ok(snD.changed === true && snD.hubs === 3 && snD.railways === 0 && /railways\.txt/.test(snD.error || ""), "D: the supply step wrote its hubs and failed on railways.txt", snD);
    ok(has(line.D, `${snD.hubs} supply hub(s), written to map/supply_nodes.txt`) && !has(clauseOf(line.D, "supply network it had none of"), "railway(s) joining"),
      "…and the summary claims the hubs and no railway", clauseOf(line.D, "supply network it had none of"));
    ok(has(line.D, `could not finish your world's supply network: ${bare(snD.error)}`), "⭐⭐ …and says the network is unfinished, and why", clauseOf(line.D, "could not finish"));
    ok(!/\.\.(?!\.)/.test(line.D.replace(/…/g, "")), "…and no quoted message ends a sentence in two full stops", line.D.match(/.{60}\.\.(?!\.)/));

    // ⚠️ A "failure" that is not one. slotsOverWater lists a state whose writer answered "state already has every building slot" in
    // `failed` — the state lost a surplus row and is fully furnished. Said as "could not", that is a cry of wolf on every such click.
    const soE = F("E").slotsOverWater || {};
    const furnished = (soE.failed || []).find((f) => f && f.state === 1) || {};
    ok(soE.dropped === 1 && /^state already has/.test(furnished.reason || ""), "E: the fixer drops the surplus air base and lists state 1 as not written, already furnished", soE);
    ok(has(line.E, `dropped ${soE.dropped} building position(s) standing on water`), "…and the summary says it dropped the row", clauseOf(line.E, "dropped"));
    ok(!has(line.E, "state 1's building positions were taken off the water but not put back"), "⭐⭐ …and does not call a furnished state a failure", clauseOf(line.E, "state 1's"));
    ok(has(line.E, "state 3 still has no air base or rocket site position: could not place"), "…while the state that really could not be placed is still said", clauseOf(line.E, "state 3"));
  }

  console.log("\n-- 5. every step says when it failed --");
  {
    // autoFixMap turns a step that THROWS into `fixes.<key> = { error }`, so that shape reaches every step whatever its fixer
    // returns — and a step whose failure the summary swallows reads, to the modder, exactly like a step that found nothing to do.
    // The steps are the ones derived above; each is handed that shape alone, and its reason must reach the line.
    const unsaid = [];
    for (const k of keys.filter((x) => !SILENT_BEFORE.includes(x) && !NOT_A_STEP[x])) {
      const marker = `probe-failure-of-${k}`;
      let l = "";
      try { l = summaryFor({ ok: true, fixes: { [k]: { error: marker } } }); } catch (e) { l = "THREW " + e.message; }
      if (!has(l, marker)) unsaid.push(k);
    }
    const newlySilent = unsaid.filter((k) => !ERROR_SILENT_BEFORE.includes(k));
    ok(!newlySilent.length, "every step's failure reaches the summary, or it is one whose failure was swallowed before this test said so", newlySilent);
    const staleErr = ERROR_SILENT_BEFORE.filter((k) => !keys.includes(k) || !unsaid.includes(k));
    ok(!staleErr.length, "…and that list is not stale (take a step off it once its failure is said)", staleErr);
  }

  console.log("\n-- 6. counts past a fixer's cap, and a click that only failed (review of the summary lines) --");
  {
    // ⭐ 81 orphaned blocks in a state file that writes, then one in a file that does not. The fixer cuts `details` at 80, so the
    // failure used to fall off the end: the summary claimed 82 taken out and never named the file still holding one.
    const Fx = makeWorldFixture(path.join(SCRATCH, "F"));
    const many = Array.from({ length: 81 }, (_, i) => `\t\t\t${7001 + i} = { bunker = 1 }\n`).join("");
    fs.writeFileSync(path.join(Fx.modRoot, "history", "states", "1-S1.txt"), stateTxt(1, "1 2", "AAA", { buildings: many }));
    const lockedF = path.join(Fx.modRoot, "history", "states", "3-S3.txt");
    fs.writeFileSync(lockedF, stateTxt(3, "6", "BBB", { buildings: "\t\t\t8001 = { bunker = 1 }\n" }));
    fs.chmodSync(lockedF, 0o444);
    let obF;
    try { obF = md.fixOrphanedStateBuildings(Fx); } finally { try { fs.chmodSync(lockedF, 0o666); } catch (_) {} }
    ok(obF.removed === 81 && (obF.writeErrors || []).length === 1 && obF.writeErrors[0].file === "3-S3.txt" && obF.writeErrors[0].blocks === 1,
      "the fixer counts the 81 it wrote and lists the one file it could not, past its own cap of 80 details", { removed: obF.removed, writeErrors: obF.writeErrors, details: (obF.details || []).length });
    const lF = summaryFor({ ok: true, fixes: { orphanBuildings: obF } });
    ok(has(lF, "took 81 province building block(s)") && has(lF, "could not rewrite history/states/3-S3.txt, so its 1 building block(s) are still there"),
      "⭐ …and the summary says 81, and names the file still holding its block", lF.slice(0, 400));

    // ⭐ 61 states that could not be placed: `failed` stops at 40, and "…and N more" was counted from it (said 35, true 56)
    const fortyOf61 = Array.from({ length: 40 }, (_, i) => ({ state: 100 + i, reason: "could not place: no land pixels" }));
    const lS = summaryFor({ ok: true, fixes: { stateSites: { fixed: 0, states: [], failed: fortyOf61, unplacedTotal: 61 } } });
    ok(has(lS, "…and 56 more state(s) the same"), "⭐ \"…and N more\" counts every state not placed, not the fixer's first 40", lS.slice(0, 600));
    ok((F("C").stateSites || {}).unplacedTotal === 3 && (F("E").slotsOverWater || {}).unplacedTotal === 0,
      "…and the fixers report that count, leaving out a state that already has every slot", { C: F("C").stateSites, E: F("E").slotsOverWater });

    // ⛔ #a-coast-taken-away-keeps-its-naval-buildings — a naval base moved within its state (the answer on a copy of Millennium Dawn
    // after sea 2408 made land), and one left where it is
    const lN = summaryFor({ ok: true, fixes: { navalNoCoast: { removed: 0, states: [], moved: [{ stateId: 37, from: 6389, to: 3231, key: "naval_base", level: 8 }],
      left: [{ stateId: 6, key: "naval_base", province: 3277, why: "every coastal province of its state holds one already" }] } } });
    // (moved with #the-harbour-words-say-what-auto-fix-did, tool campaign B4-17: the base it moves may stand on a province that never had a sea)
    ok(/^🔧 Auto-fixed: moved 1 naval base\(s\) on a province with no sea beside it onto another coastal province of the same state, at the same level \(6389 → 3231 in state 37\)/.test(lN)
      && has(lN, "⚠ Not finished: left 1 dockyard(s) and naval base(s) with no coast where they are, in state 6: every coastal province of its state holds one already")
      && !has(lN, "Save stops for a dockyard"), "⭐ a naval base moved within its state is said, and one left where it is, with no Save-stop claim for a naval base", lN.slice(0, 700));

    // ⭐ a click whose only news is a failure must not open by claiming a repair
    const lOnly = summaryFor({ ok: true, fixes: { coastalFlags: { error: "provinces.bmp not found." } } });
    ok(/^⚠ Auto-fix could not finish: could not correct the coastal flags/.test(lOnly) && !has(lOnly, "Auto-fixed"), "⭐ a click that only failed says so, and not \"🔧 Auto-fixed\"", lOnly.slice(0, 300));
    ok(has(lOnly, "map/definition.csv: provinces.bmp not found.") && !/\.\.(?!\.)/.test(lOnly.replace(/…/g, "")), "…quoting the fixer's message without doubling its full stop", lOnly.slice(0, 300));
    const lBoth = summaryFor({ ok: true, fixes: { noManpower: { fixed: 1, details: [{ state: 2, manpower: 1000 }] }, coastalFlags: { error: "provinces.bmp not found." } } });
    ok(/^🔧 Auto-fixed: gave 1 land state/.test(lBoth) && has(lBoth, "⚠ Not finished: could not correct the coastal flags"), "…and one that did both says both, the repair first", lBoth.slice(0, 400));
  }
} catch (e) {
  fail++;
  console.log("HARNESS ERROR " + (e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e));
} finally {
  try { fs.rmSync(SCRATCH, { recursive: true, force: true }); } catch (_) {}
}

console.log("\n" + (fail ? "FAILED " + fail + "/" + (pass + fail) : "PASSED " + pass + "/" + pass));
process.exitCode = fail ? 1 : 0;
