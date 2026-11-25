// ⛔ #a-second-click-reads-the-scripts-not-novas-copies — A SECOND GENERATE LAND IN THE SAME MOD WEIGHS THE IDS BY WHAT THE SCRIPTS MEAN,
// NOT BY THE COPIES NOVA MADE OF THEM.
//
// Generate land keeps the base game's meaning of its state ids by weighing each id by how often the scripts that load name it, and by the
// ids each country's start history tests (stateIdScriptNamings). After one Generate land and one Auto-fix the mod holds copies Nova
// made of files below: orders of battle with a wing's state key moved (`# Nova: moved from state …`), a country history with its
// `capital = <id>` line written and its set_capital pointed at that id. Each copy names the FIRST world's ids, and stateIdScriptNamings
// read it as the scripts' meaning: on the owner's flow 39 ids' weights and one id's start-history tags differed from a fresh mod's (the
// w5b2 critic, P8). Now a mod file under history/units or history/countries whose text is the file below with numbers changed (comments
// blanked, `capital = <n>` statements dropped) is read from below.
//
// Pinned by: a world built over a fixture with the real writers (generateLand, then autoFixMap), whose namings equal the fresh mod's
// while the copies are on disk and differ from below — checked first, so the equality is not vacuous; a modder's own edit to such a
// copy is read as theirs; a numbers-only copy outside those two folders (events/) is read as the mod's; and the switch back, the
// mod's file read again once it is no longer a copy.
//
// Fixture-only: binds no port. Run: node test-a-second-click-reads-the-scripts-not-novas-copies.js
"use strict";
const fs = require("fs"), os = require("os"), path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-second-click-"));
process.env.APPDATA = path.join(ROOT, "appdata"); process.env.NOVA_APP_DATA_DIR = process.env.APPDATA; process.env.XDG_CONFIG_HOME = process.env.APPDATA;
process.env.NOVA_HOME_DIR = path.join(ROOT, "home");
fs.mkdirSync(process.env.APPDATA, { recursive: true });
fs.mkdirSync(process.env.NOVA_HOME_DIR, { recursive: true });
const md = require("./map-data.js");

let pass = 0, fail = 0;
const ok = (c, m, x) => {
  if (c) { pass++; console.log("  ok   " + m); }
  else { fail++; console.log("  FAIL " + m + (x !== undefined ? "   -> " + JSON.stringify(x).slice(0, 500) : "")); }
};
const write = (dir, rel, body) => { const p = path.join(dir, ...rel.split("/")); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, body); return p; };
function bmp24(W, H, fn) {
  const rs = Math.floor((24 * W + 31) / 32) * 4, b = Buffer.alloc(54 + rs * H);
  b.write("BM", 0, "ascii"); b.writeUInt32LE(b.length, 2); b.writeUInt32LE(54, 10); b.writeUInt32LE(40, 14);
  b.writeInt32LE(W, 18); b.writeInt32LE(H, 22); b.writeUInt16LE(1, 26); b.writeUInt16LE(24, 28); b.writeUInt32LE(rs * H, 34);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const [r, g, bl] = fn(x, y); const o = 54 + (H - 1 - y) * rs + x * 3; b[o] = bl; b[o + 1] = g; b[o + 2] = r; }
  return b;
}

// ── the fixture world: a row of 8 x 8 px cells. A digit is a state below; "~" is sea everywhere; "L" is land of state 1 below that stays
// sea (it is in no strategic region). The shapes are test-a-dated-air-wing-is-judged-by-who-held-its-state-then.js's, so Auto-fix
// moves BBB's 1939 wing out of state 1, and CCC's history sets its capital only with a set_capital naming AAA's capital, which Generate
// land points at CCC's own capital and writes as a line.
const MAP = "~44~11~22~33~55~LLL";
const CELL = 8, COLS = MAP.length, W = COLS * CELL, H = CELL;
const idAt = (c) => c + 1;
const colour = (id) => [id & 255, 60, 91];
const cells = [...MAP].map((k, c) => ({ c, id: idAt(c), k }));
const BELOW = { 1: { tag: "AAA", controlledFrom: "1938.10.25", by: "BBB" }, 2: { tag: "BBB", capital: true }, 3: { tag: "BBB" }, 4: { tag: "AAA", capital: true }, 5: { tag: "CCC", capital: true } };
const provsOf = (k) => cells.filter((x) => x.k === k || (k === "1" && x.k === "L")).map((x) => x.id);
const risesOf = (k) => cells.filter((x) => x.k === k).map((x) => x.id);
const stateFile = (k) => {
  const s = BELOW[k];
  const later = s.controlledFrom ? `\t\t${s.controlledFrom} = {\n\t\t\towner = ${s.tag}\n\t\t\tcontroller = ${s.by}\n\t\t}\n` : "";
  return `state={\n\tid=${k}\n\tname="STATE_${k}"\n\tmanpower=${s.capital ? 5000 : 1000}\n\tstate_category=rural\n\tprovinces={ ${provsOf(k).join(" ")} }\n\thistory={\n\t\towner=${s.tag}\n\t\tadd_core_of=${s.tag}\n${later}\t}\n}\n`;
};
const wing = (id, planes, name) => `\t${id} = {\n\t\tname = "${name}"\n\t\tfighter_equipment_0 = {\n\t\t\towner = "BBB"\n\t\t\tamount = ${planes}\n\t\t}\n\t}\n`;
const GAME = path.join(ROOT, "game");
{
  const g = GAME;
  write(g, "hoi4.exe", "");
  write(g, "map/provinces.bmp", bmp24(W, H, (x) => colour(idAt(Math.floor(x / CELL)))));
  write(g, "map/definition.csv", ["0;0;0;0;land;false;unknown;0"].concat(cells.map((x) => `${x.id};${colour(x.id).join(";")};${x.k === "~" ? "sea;false;ocean;0" : "land;false;plains;1"}`)).join("\n") + "\n");
  for (const k of Object.keys(BELOW)) write(g, `history/states/${k}-S.txt`, stateFile(k));
  write(g, "common/defines/00_defines.lua", "NDefines = {\nNAir = {\n\tAIRBASE_CAPACITY_MULT = 50,\n},\n}\n");
  write(g, "common/buildings/00_buildings.txt", "buildings = {\n\tair_base = {\n\t\tbase_cost = 1000\n\t\tlevel_cap = {\n\t\t\tstate_max = 10\n\t\t}\n\t\tshow_on_map = 1\n\t}\n}\n");
  write(g, "history/countries/AAA - A.txt", "capital = 4 # the A capital\n");
  write(g, "history/countries/BBB - B.txt", `capital = 2\nset_air_oob = "BBB_1936_air"\n1939.1.1 = {\n\tif = {\n\t\tlimit = { has_dlc = "X" }\n\t\tset_air_oob = "BBB_1939_air"\n\t}\n}\n`);
  write(g, "history/countries/CCC - C.txt", "# no capital line: the effect sets it\nset_capital = { state = 4 }\nevery_owned_state = {\n\tlimit = { NOT = { state = 5 } }\n\tadd_core_of = CCC\n}\n");
  write(g, "history/units/BBB_1936_air.txt", `air_wings = {\n${wing(2, 40, "B36")}}\n`);
  write(g, "history/units/BBB_1939_air.txt", `air_wings = {\n${wing(1, 150, "B39abroad")}${wing(2, 40, "B39home")}}\n`);
  write(g, "events/E.txt", "country_event = {\n\tid = e.1\n\timmediate = {\n\t\t3 = { add_core_of = BBB }\n\t}\n}\n");
}
const MOD = path.join(ROOT, "mod");
write(MOD, "descriptor.mod", 'name="second click"\nreplace_path="history/states"\n');
write(MOD, "map/provinces.bmp", bmp24(W, H, (x) => colour(idAt(Math.floor(x / CELL)))));
write(MOD, "map/definition.csv", ["0;0;0;0;land;false;unknown;0"].concat(cells.map((x) => `${x.id};${colour(x.id).join(";")};sea;false;ocean;0`)).join("\n") + "\n");
Object.keys(BELOW).forEach((k, i) => write(MOD, `map/strategicregions/r${i + 1}.txt`, `strategic_region={\n\tid=${i + 1}\n\tname="REGION_${i + 1}"\n\tprovinces={ ${risesOf(k).join(" ")} }\n\tweather={}\n}\n`));
write(MOD, "map/supply_nodes.txt", ""); write(MOD, "map/railways.txt", "");
fs.mkdirSync(path.join(MOD, "history", "states"), { recursive: true });

const namings = (mod) => {
  md.clearMapLayerCache();
  const { weights, startHistory, startActs } = md.stateIdScriptNamings({ modRoot: mod, gameRoot: GAME, dependencyRoots: [] });
  const bySet = (m) => [...m].map(([id, s]) => [id, [...s].sort()]).sort((a, b) => a[0] - b[0]);
  return { weights: [...weights].sort((a, b) => a[0] - b[0]), startHistory: bySet(startHistory), startActs: bySet(startActs) };
};
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const weightOf = (n, id) => ((n.weights.find((x) => x[0] === id) || [])[1] || 0);

console.log("\n-- 1. the first click, and the copies Nova makes --");
const fresh = namings(MOD);
// CCC's start history is what its file TESTS (#a-start-history-is-what-a-country-tests): the 5 its garrison limit spares, not the 4 its
// set_capital acts on, which only weighs
ok(weightOf(fresh, 1) > 0 && weightOf(fresh, 4) > 0 && weightOf(fresh, 5) > 0 && fresh.startHistory.some(([id, t]) => id === 5 && t.includes("CCC"))
  && !fresh.startHistory.some(([id, t]) => id === 4 && t.includes("CCC")),
  "(the fixture: the fresh mod's namings count BBB's 1939 wing key 1, CCC's set_capital 4 and its garrison-shaped 5, and CCC's start history is the 5 its garrison tests)", fresh);
const gen = md.generateLand({ modRoot: MOD, gameRoot: GAME, dependencyRoots: [], count: Object.keys(BELOW).reduce((n, k) => n + risesOf(k).length, 0),
  provincesPerState: 8, seed: 1, ownerMode: "inherit", roughenCoast: false });
md.clearMapLayerCache();
const fx = (md.autoFixMap({ modRoot: MOD, gameRoot: GAME, dependencyRoots: [] }) || {}).fixes || {};
const modFile = (rel) => { const p = path.join(MOD, ...rel.split("/")); return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : null; };
const gameFile = (rel) => fs.readFileSync(path.join(GAME, ...rel.split("/")), "utf8");
const units = modFile("history/units/BBB_1939_air.txt"), ccc = modFile("history/countries/CCC - C.txt");
const keysOf = (t) => [...String(t || "").matchAll(/^\t(\d+) = \{/gm)].map((m) => +m[1]);
const setCapOf = (t) => [...String(t || "").matchAll(/set_capital\s*=\s*\{\s*state\s*=\s*(\d+)/g)].map((m) => +m[1]);
ok(gen && gen.changed && fx.airWingsAbroad && fx.airWingsAbroad.moved === 1 && units && /# Nova: moved from state 1/.test(units)
  && !same(keysOf(units), keysOf(gameFile("history/units/BBB_1939_air.txt"))),
  "(the fixture: Auto-fix copied BBB's 1939 order of battle into the mod with its state-1 key moved, and said so in a comment)", { gen: gen && (gen.error || gen.changed), fix: fx.airWingsAbroad, keys: keysOf(units) });
ok(ccc && /^\s*capital\s*=\s*\d+/m.test(ccc) && !/^\s*capital\s*=/m.test(gameFile("history/countries/CCC - C.txt")) && setCapOf(ccc).length === 1 && setCapOf(ccc)[0] !== 4,
  "(the fixture: Generate land copied CCC's history into the mod, wrote its capital line and pointed its set_capital off AAA's 4)", { ccc, setCap: setCapOf(ccc) });

console.log("\n-- 2. the second click reads what the scripts mean --");
const after = namings(MOD);
ok(same(after.weights, fresh.weights), "⭐⭐⭐ every id's weight over the mod after Generate land and Auto-fix is the fresh mod's", { fresh: fresh.weights, after: after.weights });
ok(same(after.startHistory, fresh.startHistory), "⭐⭐⭐ …and every id's start-history countries", { fresh: fresh.startHistory, after: after.startHistory });
// #a-start-history-acts-on-its-own-states — the second tier reads the same file: the set_capital Generate land pointed is Nova's, not CCC's
ok(fresh.startActs.some(([, t]) => t.includes("CCC")) && same(after.startActs, fresh.startActs), "⭐⭐⭐ …and every id's second tier, the countries whose start history acts on it", { fresh: fresh.startActs, after: after.startActs });

console.log("\n-- 3. what is the modder's stays the modder's --");
{
  // a modder adds a wing of their own to Nova's copy: no longer a copy, read as theirs
  const p = path.join(MOD, "history", "units", "BBB_1939_air.txt");
  fs.writeFileSync(p, units.replace(/\}\s*$/, () => `${wing(3, 20, "MINE")}}\n`));
  const mine = namings(MOD);
  // read as the mod's: the file below's keys leave the count and the mod file's — the moved key and theirs — join it
  const belowKeys = keysOf(gameFile("history/units/BBB_1939_air.txt")), modKeys = keysOf(units).concat([3]);
  const ids = [...new Set(belowKeys.concat(modKeys))];
  const want = (id) => weightOf(fresh, id) - belowKeys.filter((k) => k === id).length + modKeys.filter((k) => k === id).length;
  ok(ids.every((id) => weightOf(mine, id) === want(id)) && weightOf(mine, 1) === weightOf(fresh, 1) - 1,
    "⭐⭐ a modder's own wing added to the copy makes it theirs: their key 3 counts, and so does the moved key, which no longer names 1",
    ids.map((id) => [id, weightOf(fresh, id), weightOf(mine, id), want(id)]));
  fs.writeFileSync(p, units);
  ok(same(namings(MOD).weights, fresh.weights), "…and taken out again, the file is Nova's copy once more (decided again by its stamp)");
  // a numbers-only copy outside history/units and history/countries is a modder's edit: events/ name states as content
  write(MOD, "events/E.txt", gameFile("events/E.txt").replace("\t\t3 = {", "\t\t2 = {"));
  const ev = namings(MOD);
  ok(weightOf(ev, 2) === weightOf(fresh, 2) + 1 && weightOf(ev, 3) === weightOf(fresh, 3) - 1,
    "⭐⭐ a numbers-only change to an event is the modder's, read as theirs: only history/units and history/countries hold Nova's copies", { 2: [weightOf(fresh, 2), weightOf(ev, 2)], 3: [weightOf(fresh, 3), weightOf(ev, 3)] });
  fs.rmSync(path.join(MOD, "events"), { recursive: true, force: true });   // the scratch mod's own file, in the temp fixture
  // a modder's real edit to a country history in the mod: a statement Nova never writes — a test of state 3, so start history too
  const c = path.join(MOD, "history", "countries", "CCC - C.txt");
  fs.writeFileSync(c, ccc + "if = { limit = { owns_state = 3 } set_country_flag = ccc_holds_3 }\n");
  const cl = namings(MOD);
  ok(weightOf(cl, 3) === weightOf(fresh, 3) + 1 && (cl.startHistory.find((x) => x[0] === 3) || [0, []])[1].includes("CCC"),
    "⭐⭐ a test of a state the modder adds to CCC's history in the mod is read as theirs, start history and all", cl.startHistory);
  fs.writeFileSync(c, ccc);
}

try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) { /* scratch only */ }
console.log("\n" + (fail ? "FAILED " + fail + "/" + (pass + fail) : "PASSED " + pass + "/" + pass));
process.exitCode = fail ? 1 : 0;
