// ⛔ #a-dated-wing-is-judged-at-its-date — A WING A LATER BOOKMARK LOADS IS JUDGED BY WHO HELD ITS STATE ON THAT BOOKMARK, BELOW AND HERE.
//
// HOI4 loads a country's 1939 air force from a `set_air_oob` inside its history's `1939.1.1 = { … }` block, and that file bases wings
// in states the country holds BY THEN: vanilla JAP_1939_air_bba keys two wings to 597 and 591, Chinese states whose 1938.10.25
// history hands their control to Japan. airWingKeyMoves (one predicate for Map Errors' air_wing_based_abroad, its Auto-fix repair and
// Generate land's air-base sizing) excuses a wing the world below already based in its state's owner, and asked that of the UNDATED
// owner: CHI. Once Generate land's renumbering kept 597 Chinese (it is CHI's id), the wing stayed in a state China holds at 1939 —
// and Japan declares war on China in that same 1939 block — and nothing moved it (the w5b2 critic, P2: s3p35's 1939 air foreign 5 -> 7).
//
// Now the wing's DATE is the date of the history block that loads its file (oobStartDates, the first reference per country and name,
// as startedOobNames takes its first), and the predicate is asked of who CONTROLS the state at that date, on both sides:
//   below — the layer below's own state file (stateControllerAtDate: the undated owner/controller, then every dated block up to it);
//   here  — the mod's own state file the same way, so a mod that keeps the base game's states (and its dated blocks) is not told its
//           vanilla 1939 wings are abroad. A generated state answers by the dated blocks it is written with: the base game's own, only
//           where its id kept its country and up to the last bookmark (#a-generated-state-keeps-its-later-owners) — none in a game whose
//           only bookmark is the start (sections 4 and 5), state 1's 1938 control in one with a 1939 bookmark (section 6).
// An undated wing keeps the 1936 owner on both sides, as before.
// ⛔ #a-dated-wing-lands-where-its-country-holds-then — and where such a wing GOES is asked the same way: the repair's homes, its
// "can it move" in Map Errors and Generate land's air-base sizing all take a dated wing's homes as the states its country holds at
// that date (sections 7 and 8), not every state it owned in 1936 — else the repair re-keys it into a state another country holds
// then, Map Errors finds it there again, and the next click picks the same state.
//
// Pinned by: the pure reader on hand-made blocks; oobStartDates against an independent backward brace walk over every reference in
// the installed game's country histories; findAirWingsBasedAbroad over a fixture world with three mods (a Generate-land world, a
// copy of the states below, and a mod with no states of its own) and over the installed game under an empty mod; Generate land's
// air-base sizing and Auto-fix's repair on a world built over the fixture, and on a mod and a world whose nearest airfield another
// country holds at the wing's date. Every expectation is derived from the fixture's files.
//
// Fixture-only plus the installed game (read-only): binds no port. Run: node test-a-dated-air-wing-is-judged-by-who-held-its-state-then.js
"use strict";
const fs = require("fs"), os = require("os"), path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-dated-wing-"));
process.env.APPDATA = path.join(ROOT, "appdata"); process.env.NOVA_APP_DATA_DIR = process.env.APPDATA; process.env.XDG_CONFIG_HOME = process.env.APPDATA;
process.env.NOVA_HOME_DIR = path.join(ROOT, "home");
fs.mkdirSync(process.env.APPDATA, { recursive: true });
fs.mkdirSync(process.env.NOVA_HOME_DIR, { recursive: true });
const md = require("./map-data.js");
const GAME_INSTALLED = process.env.HOI4_ROOT || "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";

let pass = 0, fail = 0;
const ok = (c, m, x) => {
  if (c) { pass++; console.log("  ok   " + m); }
  else { fail++; console.log("  FAIL " + m + (x !== undefined ? "   -> " + JSON.stringify(x).slice(0, 400) : "")); }
};
const write = (dir, rel, body) => { const p = path.join(dir, ...rel.split("/")); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, body); return p; };
function bmp24(W, H, fn) {
  const rs = Math.floor((24 * W + 31) / 32) * 4, b = Buffer.alloc(54 + rs * H);
  b.write("BM", 0, "ascii"); b.writeUInt32LE(b.length, 2); b.writeUInt32LE(54, 10); b.writeUInt32LE(40, 14);
  b.writeInt32LE(W, 18); b.writeInt32LE(H, 22); b.writeUInt16LE(1, 26); b.writeUInt16LE(24, 28); b.writeUInt32LE(rs * H, 34);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const [r, g, bl] = fn(x, y); const o = 54 + (H - 1 - y) * rs + x * 3; b[o] = bl; b[o + 1] = g; b[o + 2] = r; }
  return b;
}

// ── 1. the pure reader ──────────────────────────────────────────────────────────────────────────────────────────────────────────
console.log("\n-- 1. stateControllerAtDate: who holds a state at a history date --");
{
  const at = md.stateControllerAtDate;
  ok(typeof at === "function", "map-data.js exports stateControllerAtDate");
  const S = (hist) => `state = {\n\tid = 7\n\tprovinces = { 1 2 }\n\thistory = {\n${hist}\n\t}\n}\n`;
  const shandong = S("\t\towner = CHI\n\t\tadd_core_of = CHI\n\t\t1936.1.1 = {\n\t\t\tadd_core_of = SND\n\t\t}\n\t\t1938.10.25 = {\n\t\t\towner = CHI\n\t\t\tcontroller = JAP # held\n\t\t}\n\t\t1939.1.1 = {\n\t\t\tbuildings = { air_base = 2 }\n\t\t}");
  if (typeof at === "function") {
    ok(at(shandong, "") === "CHI" && at(shandong) === "CHI", "undated: the owner (no date asked is the 1936 start)", at(shandong, ""));
    ok(at(shandong, "1938.10.24") === "CHI" && at(shandong, "1938.10.25") === "JAP" && at(shandong, "1939.1.1") === "JAP",
      "a dated `controller` holds from its own date on, not before (vanilla 597 Shandong's shape)", [at(shandong, "1938.10.24"), at(shandong, "1938.10.25"), at(shandong, "1939.1.1")]);
    const handed = S("\t\towner = AAA\n\t\tcontroller = BBB\n\t\t1939.1.1 = {\n\t\t\towner = CCC\n\t\t}\n\t\t1940.1.1 = {\n\t\t\tcontroller = DDD\n\t\t}");
    ok(at(handed, "") === "BBB" && at(handed, "1939.1.1") === "CCC" && at(handed, "1940.1.1.12") === "DDD",
      "an undated controller beats the owner; a dated `owner` alone hands over control too; a later controller wins (an hour is later)", [at(handed, ""), at(handed, "1939.1.1"), at(handed, "1940.1.1.12")]);
    const outOfOrder = S("\t\towner = AAA\n\t\t1940.1.1 = { controller = DDD }\n\t\t1939.1.1 = { controller = CCC }");
    ok(at(outOfOrder, "1939.6.1") === "CCC" && at(outOfOrder, "1941.1.1") === "DDD", "dated blocks apply in TIME order, not file order", [at(outOfOrder, "1939.6.1"), at(outOfOrder, "1941.1.1")]);
    const nested = S("\t\towner = AAA\n\t\t1939.1.1 = {\n\t\t\tif = { limit = { has_dlc = \"X\" } controller = EEE }\n\t\t\tAAA = { set_province_controller = 1 }\n\t\t}\n\t\t# 1938.1.1 = { controller = FFF }");
    ok(at(nested, "1939.1.1") === "AAA", "only a dated block's own statements count — not one behind an `if`, a province controller, or a commented-out block", at(nested, "1939.1.1"));
    ok(at("state = { id = 1 }", "1939.1.1") === "" && at("", "") === "", "no history, no answer");
  }
}

// ── 2. the date each order of battle loads at, over the installed game ─────────────────────────────────────────────────────────
console.log("\n-- 2. oobStartDates: the history block each order of battle is loaded in --");
const EMPTY_MOD = path.join(ROOT, "mod-empty");
write(EMPTY_MOD, "descriptor.mod", 'name="nothing"\n');
{
  ok(typeof md.oobStartDates === "function", "map-data.js exports oobStartDates");
  // an independent reading: every oob key outside comments, the innermost `<date> = {` around it found by walking BACK over braces
  const dir = path.join(GAME_INSTALLED, "history", "countries");
  const want = new Map();
  let dated = 0, datedAir = 0;
  for (const f of fs.readdirSync(dir).filter((n) => /\.txt$/i.test(n)).sort()) {
    const tag = ((/^([A-Za-z][A-Za-z0-9]{1,2})\b/.exec(f) || [])[1] || "").toUpperCase();
    if (!tag) continue;
    const t = fs.readFileSync(path.join(dir, f), "utf8").replace(/#[^\r\n]*/g, (m) => " ".repeat(m.length));
    const re = /(?:^|[^A-Za-z0-9_])(set_oob|set_naval_oob|set_air_oob|load_oob|oob)\s*=\s*(?:"([^"\r\n]+)"|([A-Za-z0-9_.-]+))/gi;
    let m;
    while ((m = re.exec(t))) {
      const name = (m[2] || m[3] || "").trim().toLowerCase();
      let depth = 0, date = "";
      for (let i = m.index; i >= 0; i--) {
        if (t[i] === "}") depth++;
        else if (t[i] === "{") { if (depth) { depth--; continue; } const d = /(\d+\.\d+\.\d+(?:\.\d+)?)\s*=\s*$/.exec(t.slice(Math.max(0, i - 30), i)); if (d) { date = d[1]; break; } }
      }
      const k = tag + "|" + name;
      if (!want.has(k)) { want.set(k, date); if (date) { dated++; if (/set_air_oob/i.test(m[1])) datedAir++; } }
    }
  }
  const got = typeof md.oobStartDates === "function" ? md.oobStartDates({ modRoot: EMPTY_MOD, gameRoot: GAME_INSTALLED, dependencyRoots: [] }) : new Map();
  const diff = [...want].filter(([k, d]) => got.get(k) !== d).concat([...got].filter(([k]) => !want.has(k)));
  ok(want.size > 100 && dated > 0 && datedAir > 0 && diff.length === 0,
    `⭐⭐ every order of battle the base game's ${want.size} country references load is dated as an independent walk dates it (${dated} in a dated block, ${datedAir} of them air)`, diff.slice(0, 6));
  ok(got.get("JAP|jap_1939_air_bba") === want.get("JAP|jap_1939_air_bba") && /^1939\./.test(want.get("JAP|jap_1939_air_bba") || "") && got.get("JAP|jap_1936_air_bba") === "",
    "(Japan's 1939 air force loads in its 1939 block, its 1936 one at the start)", [got.get("JAP|jap_1939_air_bba"), got.get("JAP|jap_1936_air_bba")]);
}

// ── the fixture world: a row of cells, 8 x 8 px each. A digit is a state below; "~" is sea everywhere; "L" is land of state 1 below
// that stays sea (it is in no strategic region, so it cannot rise). ───────────────────────────────────────────────────────────────
//   1  AAA's, but from 1938.10.25 BBB CONTROLS it below — BBB's 1939 air force bases a wing there (vanilla 597's shape). Most of its
//      land below is the far "L" cells, so BBB's home nearest the land the wing's file meant is 3, while from the land that rose it is 2
//   2  BBB's        3  BBB's        4  AAA's
const MAP = "~44~11~22~33~LLL";
const CELL = 8, COLS = MAP.length, W = COLS * CELL, H = CELL;
const idAt = (c) => c + 1;
const colour = (id) => [id & 255, 60, 91];
const cells = [...MAP].map((k, c) => ({ c, id: idAt(c), k }));
// each country's capital state below holds the most people. Which of BBB's two lands Generate land makes its capital (and so pins id 2
// to) is chooseCapitals' business, not this test's: every expectation below reads the id the state on a land was written under.
const BELOW = { 1: { tag: "AAA", controlledFrom: "1938.10.25", by: "BBB" }, 2: { tag: "BBB", capital: true }, 3: { tag: "BBB" }, 4: { tag: "AAA", capital: true } };
const provsOf = (k) => cells.filter((x) => x.k === k || (k === "1" && x.k === "L")).map((x) => x.id);
const risesOf = (k) => cells.filter((x) => x.k === k).map((x) => x.id);
const centre = (ids) => ids.reduce((a, id) => a + cells.find((x) => x.id === id).c, 0) / ids.length;
const nearestHome = (from) => ["2", "3"].sort((a, b) => Math.abs(centre(risesOf(a)) - centre(from)) - Math.abs(centre(risesOf(b)) - centre(from)))[0];
const MULT = 50, STATE_MAX = 10;
const PLANES = { home1936: 40, home1939: 40, abroad1939: 150 };
const stateFile = (k, { dated = true } = {}) => {
  const s = BELOW[k];
  const later = dated && s.controlledFrom ? `\t\t${s.controlledFrom} = {\n\t\t\towner = ${s.tag}\n\t\t\tcontroller = ${s.by}\n\t\t}\n` : "";
  return `state={\n\tid=${k}\n\tname="STATE_${k}"\n\tmanpower=${s.capital ? 5000 : 1000}\n\tstate_category=rural\n\tprovinces={ ${provsOf(k).join(" ")} }\n\thistory={\n\t\towner=${s.tag}\n\t\tadd_core_of=${s.tag}\n${later}\t}\n}\n`;
};
const wing = (id, planes, name) => `\t${id} = {\n\t\tname = "${name}"\n\t\tfighter_equipment_0 = {\n\t\t\towner = "BBB"\n\t\t\tamount = ${planes}\n\t\t}\n\t}\n`;
function makeGame() {
  const g = path.join(ROOT, "game");
  write(g, "hoi4.exe", "");
  write(g, "map/provinces.bmp", bmp24(W, H, (x) => colour(idAt(Math.floor(x / CELL)))));
  write(g, "map/definition.csv", ["0;0;0;0;land;false;unknown;0"].concat(cells.map((x) => `${x.id};${colour(x.id).join(";")};${x.k === "~" ? "sea;false;ocean;0" : "land;false;plains;1"}`)).join("\n") + "\n");
  for (const k of Object.keys(BELOW)) write(g, `history/states/${k}-S.txt`, stateFile(k));
  write(g, "common/defines/00_defines.lua", `NDefines = {\nNAir = {\n\tAIRBASE_CAPACITY_MULT = ${MULT},\n},\n}\n`);
  write(g, "common/buildings/00_buildings.txt", `buildings = {\n\tair_base = {\n\t\tbase_cost = 1000\n\t\tlevel_cap = {\n\t\t\tstate_max = ${STATE_MAX}\n\t\t}\n\t\tshow_on_map = 1\n\t}\n}\n`);
  write(g, "history/countries/AAA - A.txt", "capital = 4\n");
  // BBB's history, the vanilla shape: its 1936 air force at the start, its 1939 one inside the 1939 block, behind a DLC branch
  write(g, "history/countries/BBB - B.txt", `capital = 2\nset_air_oob = "BBB_1936_air"\n1939.1.1 = {\n\tif = {\n\t\tlimit = { has_dlc = "X" }\n\t\tset_air_oob = "BBB_1939_air"\n\t}\n}\n`);
  write(g, "history/units/BBB_1936_air.txt", `air_wings = {\n${wing(2, PLANES.home1936, "B36")}}\n`);
  write(g, "history/units/BBB_1939_air.txt", `air_wings = {\n${wing(1, PLANES.abroad1939, "B39abroad")}${wing(2, PLANES.home1939, "B39home")}}\n`);
  return g;
}
const GAME = makeGame();
const descriptor = (m, replaceStates) => write(m, "descriptor.mod", `name="dated wing"\n${replaceStates ? 'replace_path="history/states"\n' : ""}`);
const abroad = (mod, game = GAME) => { md.clearMapLayerCache(); return md.findAirWingsBasedAbroad({ modRoot: mod, gameRoot: game, dependencyRoots: [] }).wings; };

console.log("\n-- 3. findAirWingsBasedAbroad: a mod that keeps the states below, and one that has none of its own, are told nothing --");
{
  ok(typeof md.oobStartDates === "function" && md.oobStartDates({ modRoot: GAME, gameRoot: GAME, dependencyRoots: [] }).get("BBB|bbb_1939_air") === "1939.1.1", "(the fixture: BBB's 1939 air force loads in its 1939 block)");
  const SAME = path.join(ROOT, "mod-same");
  descriptor(SAME, true);
  for (const k of Object.keys(BELOW)) write(SAME, `history/states/${k}-S.txt`, stateFile(k));
  const same = abroad(SAME);
  ok(same.length === 0, "⭐⭐⭐ a mod whose states are the ones below, dated blocks and all, has no wing abroad: at 1939 BBB holds state 1 in it too", same.map((w) => `${w.tag}@${w.state}:${w.owner}/${w.was}`));
  const BARE = path.join(ROOT, "mod-bare");
  descriptor(BARE, false);
  const bare = abroad(BARE);
  ok(bare.length === 0, "⭐⭐ …nor a mod with no states of its own", bare.map((w) => `${w.tag}@${w.state}:${w.owner}/${w.was}`));
  const vanilla = abroad(EMPTY_MOD, GAME_INSTALLED);
  ok(vanilla.length === 0, "⭐⭐⭐ …nor an empty mod over the installed game, whose 1939 files base wings in states a dated block hands over (JAP's in 597 and 591, ITA's in Albania and Ethiopia)", vanilla.slice(0, 8).map((w) => `${w.tag}@${w.state}:${w.owner}/${w.was}`));
}

console.log("\n-- 4. a world Generate land builds over it: the 1939 wing in AAA's state is abroad, sized where it moves, and moved --");
const MOD = path.join(ROOT, "mod-gen");
let gen = null;
{
  descriptor(MOD, true);
  write(MOD, "map/provinces.bmp", bmp24(W, H, (x) => colour(idAt(Math.floor(x / CELL)))));
  write(MOD, "map/definition.csv", ["0;0;0;0;land;false;unknown;0"].concat(cells.map((x) => `${x.id};${colour(x.id).join(";")};sea;false;ocean;0`)).join("\n") + "\n");
  Object.keys(BELOW).forEach((k, i) => write(MOD, `map/strategicregions/r${i + 1}.txt`, `strategic_region={\n\tid=${i + 1}\n\tname="REGION_${i + 1}"\n\tprovinces={ ${risesOf(k).join(" ")} }\n\tweather={}\n}\n`));
  write(MOD, "map/supply_nodes.txt", ""); write(MOD, "map/railways.txt", "");
  fs.mkdirSync(path.join(MOD, "history", "states"), { recursive: true });
  const land = Object.keys(BELOW).reduce((n, k) => n + risesOf(k).length, 0);
  gen = md.generateLand({ modRoot: MOD, gameRoot: GAME, dependencyRoots: [], count: land, provincesPerState: 8, seed: 1, ownerMode: "inherit", roughenCoast: false });
  const states = fs.readdirSync(path.join(MOD, "history", "states")).map((f) => fs.readFileSync(path.join(MOD, "history", "states", f), "utf8")).map((t) => ({
    id: +(/\bid\s*=\s*(\d+)/.exec(t) || [])[1], owner: (/\bowner\s*=\s*(\w+)/.exec(t) || [])[1] || "", dated: /\d+\.\d+\.\d+\s*=\s*\{/.test(t),
    provinces: ((/provinces\s*=\s*\{([^}]*)\}/.exec(t) || [])[1] || "").trim().split(/\s+/).map(Number), airBase: +((/\bair_base\s*=\s*(\d+)/.exec(t) || [])[1] || 0) }));
  const at = (k) => states.find((s) => risesOf(k).every((p) => s.provinces.includes(p))) || { id: -1, airBase: -1 };
  ok(gen && gen.changed && Object.keys(BELOW).every((k) => at(k).owner === BELOW[k].tag) && at("1").id === 1 && states.every((s) => !s.dated),
    "(the fixture: every state below rose with its owner, state 1's land under id 1, and Generate land wrote no dated block)", gen && (gen.error || states.map((s) => [s.id, s.owner, s.dated, s.provinces])));
  const HOME = nearestHome(provsOf("1"));
  ok(HOME !== nearestHome(risesOf("1")), `(the fixture: BBB's home nearest the land the wing's file meant is ${HOME}; from the land that rose it is ${nearestHome(risesOf("1"))})`);
  // BBB's 1939 file keeps its home wing in id 2, whichever land that id was written on
  const home = at(HOME), level = Math.ceil(((home.id === 2 ? PLANES.home1939 : 0) + PLANES.abroad1939) / MULT);
  ok(gen.airBases && gen.airBases.movedInPlanes === PLANES.abroad1939, `⭐⭐⭐ the air-base sizing counts BBB's 1939 wing in state 1 as one Auto-fix will move: ${PLANES.abroad1939} planes moved in`, gen.airBases);
  ok(home.id > 0 && home.airBase >= level, `⭐⭐ …and BBB's home nearest the land the wing's file meant, state ${home.id} (the land of ${HOME} below), has room for those ${PLANES.abroad1939}: level ${level}`, home);
  const found = abroad(MOD);
  ok(found.length === 1 && found[0].tag === "BBB" && found[0].state === 1 && found[0].owner === "AAA" && found[0].was === "BBB" && /bbb_1939_air/i.test(found[0].file),
    "⭐⭐⭐ Map Errors finds it: BBB's 1939 wing in state 1, AAA's here and BBB's below at 1939 — and nothing else (its 1936 wing is home)", found.map((w) => `${w.tag}@${w.state}:${w.owner}/${w.was} ${w.file}`));
  const copy = path.join(ROOT, "mod-gen-fixed");
  fs.cpSync(MOD, copy, { recursive: true });
  md.clearMapLayerCache();
  const fx = (md.autoFixMap({ modRoot: copy, gameRoot: GAME, dependencyRoots: [] }) || {}).fixes || {};
  const t39 = fs.existsSync(path.join(copy, "history", "units", "BBB_1939_air.txt")) ? fs.readFileSync(path.join(copy, "history", "units", "BBB_1939_air.txt"), "utf8") : "";
  const key = +((/^\s*(\d+) = \{[^}]*?name = "B39abroad"/m.exec(t39) || [])[1]);
  ok(fx.airWingsAbroad && fx.airWingsAbroad.moved === 1 && key === home.id && !fs.existsSync(path.join(copy, "history", "units", "BBB_1936_air.txt")),
    `⭐⭐ Auto-fix moves it to state ${home.id} — where it was sized — and copies in only the 1939 file`, { fix: fx.airWingsAbroad, key });
  ok(abroad(copy).length === 0, "…after which no wing is abroad", abroad(copy).map((w) => `${w.tag}@${w.state}`));
}

console.log("\n-- 5. …and a state the mod already had answers by its own dated blocks, in the sizing as in the repair --");
{
  // the mod keeps state 1's land as it stands below, dated block and all (its far "L" cells stay sea), and raises the rest
  const KEEP = path.join(ROOT, "mod-keep");
  descriptor(KEEP, true);
  write(KEEP, "map/provinces.bmp", bmp24(W, H, (x) => colour(idAt(Math.floor(x / CELL)))));
  write(KEEP, "map/definition.csv", ["0;0;0;0;land;false;unknown;0"].concat(cells.map((x) => `${x.id};${colour(x.id).join(";")};${x.k === "1" ? "land;false;plains;1" : "sea;false;ocean;0"}`)).join("\n") + "\n");
  Object.keys(BELOW).forEach((k, i) => write(KEEP, `map/strategicregions/r${i + 1}.txt`, `strategic_region={\n\tid=${i + 1}\n\tname="REGION_${i + 1}"\n\tprovinces={ ${risesOf(k).join(" ")} }\n\tweather={}\n}\n`));
  write(KEEP, "map/supply_nodes.txt", ""); write(KEEP, "map/railways.txt", "");
  write(KEEP, "history/states/1-S.txt", stateFile("1").replace(/provinces=\{[^}]*\}/, `provinces={ ${risesOf("1").join(" ")} }`));
  const land = ["2", "3", "4"].reduce((n, k) => n + risesOf(k).length, 0);
  md.clearMapLayerCache();
  const g2 = md.generateLand({ modRoot: KEEP, gameRoot: GAME, dependencyRoots: [], count: land, provincesPerState: 8, seed: 1, ownerMode: "inherit", roughenCoast: false });
  const kept = fs.readFileSync(path.join(KEEP, "history", "states", "1-S.txt"), "utf8");
  ok(g2 && g2.changed && /1938\.10\.25\s*=\s*\{[^}]*controller\s*=\s*BBB/.test(kept) && /owner=AAA/.test(kept),
    "(the fixture: the mod kept state 1 as AAA's, BBB-held from 1938.10.25, and raised the rest)", g2 && (g2.error || kept));
  ok(g2 && g2.airBases && g2.airBases.movedInPlanes === 0, "⭐⭐⭐ the air-base sizing does not count BBB's 1939 wing in state 1 as moving: at 1939 BBB holds that state in this mod", g2 && g2.airBases);
  const found = abroad(KEEP);
  ok(found.length === 0, "⭐⭐ …as Map Errors does not", found.map((w) => `${w.tag}@${w.state}:${w.owner}/${w.was}`));
}

console.log("\n-- 6. …and over a game with a 1939 bookmark, the state Generate land writes on AAA's own id carries its 1938 control: the wing is home --");
{
  // ⛔ #a-generated-state-keeps-its-later-owners — the same world below, with the base game's two bookmarks
  const G39 = path.join(ROOT, "game-1939");
  fs.cpSync(GAME, G39, { recursive: true });
  write(G39, "common/bookmarks/the_fixture.txt", "bookmarks = {\n\tbookmark = {\n\t\tname = \"A\"\n\t\tdate = 1936.1.1.12\n\t\tdefault = yes\n\t}\n\tbookmark = {\n\t\tname = \"B\"\n\t\tdate = 1939.8.14.12\n\t}\n}\n");
  const M6 = path.join(ROOT, "mod-gen-1939");
  descriptor(M6, true);
  write(M6, "map/provinces.bmp", bmp24(W, H, (x) => colour(idAt(Math.floor(x / CELL)))));
  write(M6, "map/definition.csv", ["0;0;0;0;land;false;unknown;0"].concat(cells.map((x) => `${x.id};${colour(x.id).join(";")};sea;false;ocean;0`)).join("\n") + "\n");
  Object.keys(BELOW).forEach((k, i) => write(M6, `map/strategicregions/r${i + 1}.txt`, `strategic_region={\n\tid=${i + 1}\n\tname=\"REGION_${i + 1}\"\n\tprovinces={ ${risesOf(k).join(" ")} }\n\tweather={}\n}\n`));
  write(M6, "map/supply_nodes.txt", ""); write(M6, "map/railways.txt", "");
  fs.mkdirSync(path.join(M6, "history", "states"), { recursive: true });
  const land = Object.keys(BELOW).reduce((n, k) => n + risesOf(k).length, 0);
  md.clearMapLayerCache();
  const g6 = md.generateLand({ modRoot: M6, gameRoot: G39, dependencyRoots: [], count: land, provincesPerState: 8, seed: 1, ownerMode: "inherit", roughenCoast: false });
  const f1 = fs.readdirSync(path.join(M6, "history", "states")).map((f) => fs.readFileSync(path.join(M6, "history", "states", f), "utf8")).find((t) => +(/\bid\s*=\s*(\d+)/.exec(t) || [])[1] === 1) || "";
  const s1 = BELOW["1"];
  ok(g6 && g6.changed && new RegExp(`owner = ${s1.tag}`).test(f1) && new RegExp(`${s1.controlledFrom.replace(/\./g, "\\.")} = \\{[^}]*controller = ${s1.by}`).test(f1),
    `⭐⭐⭐ state 1, on ${s1.tag}'s own id, is written with its state's ${s1.controlledFrom} block below: ${s1.by} holds it from then on`, g6 && (g6.error || f1));
  ok(g6 && g6.airBases && g6.airBases.movedInPlanes === 0, `⭐⭐⭐ so the air-base sizing does not count ${s1.by}'s 1939 wing in state 1 as moving: at 1939 ${s1.by} holds it here too`, g6 && g6.airBases);
  const found = abroad(M6, G39);
  ok(found.length === 0, "⭐⭐ …as Map Errors does not", found.map((w) => `${w.tag}@${w.state}:${w.owner}/${w.was}`));
}

console.log("\n-- 7. …and the repair bases a dated wing where its country holds the state AT THAT DATE, and offers nothing where it holds none --");
{
  // ⛔ #a-dated-wing-lands-where-its-country-holds-then — a mod that keeps the states below but gives state 1 to AAA outright, so BBB's
  // 1939 wing there is abroad; BBB's airfields are 2 and 3, and the mod hands control of some of them to AAA before that wing loads.
  // The repair's homes were every state its country OWNED in 1936: it re-keyed the wing into a state AAA holds at 1939, Map Errors
  // found it there again, and the next click picked the same state (the owner's flow, seed 5 at 10%: CHI's two 1939 wings, moved
  // from 605 into 1035, Japanese-held from 1938.10.25 — 0 errors, 1 warning, after two Auto-fix clicks).
  const modState = (k, { owner = BELOW[k].tag, air = 0, later = "" } = {}) =>
    `state={\n\tid=${k}\n\tname="STATE_${k}"\n\tmanpower=1000\n\tstate_category=rural\n\tprovinces={ ${provsOf(k).join(" ")} }\n\thistory={\n\t\towner=${owner}\n\t\tadd_core_of=${owner}\n${air ? `\t\tbuildings = {\n\t\t\tair_base = ${air}\n\t\t}\n` : ""}${later}\t}\n}\n`;
  const HELD_FROM = "1938.6.1";
  const mkMod = (name, held) => {
    const m = path.join(ROOT, name);
    descriptor(m, true);
    write(m, "history/states/1-S.txt", modState("1"));
    write(m, "history/states/4-S.txt", modState("4"));
    for (const k of ["2", "3"]) write(m, `history/states/${k}-S.txt`, modState(k, { air: STATE_MAX, later: held.includes(k) ? `\t\t${HELD_FROM} = {\n\t\t\tcontroller = AAA\n\t\t}\n` : "" }));
    return m;
  };
  const rule = (m) => { md.clearMapLayerCache(); return (md.validateMapBitmap({ modRoot: m, gameRoot: GAME, dependencyRoots: [] }) || []).filter((p) => p.rule === "air_wing_based_abroad"); };
  const fixed = (m) => { const c = m + "-fixed"; fs.cpSync(m, c, { recursive: true }); md.clearMapLayerCache(); return { c, r: md.fixAirWingsBasedAbroad({ modRoot: c, gameRoot: GAME, dependencyRoots: [] }) || {} }; };
  const keyOf = (m, name) => { const p = path.join(m, "history", "units", "BBB_1939_air.txt"); const t = fs.existsSync(p) ? fs.readFileSync(p, "utf8") : ""; return +((new RegExp(`^\\s*(\\d+) = \\{[^}]*?name = "${name}"`, "m").exec(t) || [])[1]); };
  const show = (ws) => ws.map((w) => `${w.tag}@${w.state}:${w.owner}/${w.was}`);
  // the destination the rule says, off the fixture: the nearest to the land the wing's file meant of BBB's airfields BBB holds at 1939
  const nearestOf = (ks) => ks.slice().sort((a, b) => Math.abs(centre(risesOf(a)) - centre(provsOf("1"))) - Math.abs(centre(risesOf(b)) - centre(provsOf("1"))) || a - b)[0];

  const A = mkMod("mod-held-nearest", ["3"]);
  const free = ["2", "3"].filter((k) => !["3"].includes(k)), want = +nearestOf(free);
  ok(nearestOf(["2", "3"]) === "3" && want === 2, "(the fixture: of BBB's airfields the nearest to the land the wing's file meant is 3, which AAA holds from 1938; BBB still holds 2)");
  const foundA = abroad(A);
  ok(foundA.length === 1 && foundA[0].state === 1 && foundA[0].owner === "AAA" && foundA[0].was === "BBB" && /bbb_1939_air/i.test(foundA[0].file),
    "(the fixture: BBB's 1939 wing in state 1 is abroad, and nothing else)", show(foundA));
  const rA = rule(A);
  ok(rA.length === 1 && rA[0].autoFix === true && rA[0].movable === 1, "Map Errors offers the repair: BBB holds an airfield at 1939", rA.map((p) => ({ autoFix: p.autoFix, movable: p.movable })));
  const fa = fixed(A);
  ok(fa.r.moved === 1 && keyOf(fa.c, "B39abroad") === want, `⭐⭐⭐ the repair bases it in state ${want}, the nearest airfield BBB HOLDS at 1939 — not 3, which BBB owns but AAA holds then`, { fix: fa.r, key: keyOf(fa.c, "B39abroad") });
  md.clearMapLayerCache();
  ok(abroad(fa.c).length === 0, "⭐⭐⭐ …after which Map Errors finds no wing abroad", show(abroad(fa.c)));
  md.clearMapLayerCache();
  const again = md.fixAirWingsBasedAbroad({ modRoot: fa.c, gameRoot: GAME, dependencyRoots: [] }) || {};
  ok(again.moved === 0, "⭐ …and a second click moves nothing", again);

  const B = mkMod("mod-held-both", ["2", "3"]);
  const foundB = abroad(B);
  ok(foundB.length === 2 && foundB.every((w) => w.owner === "AAA" && w.was === "BBB") && foundB.map((w) => w.state).sort().join() === "1,2",
    "(the fixture: AAA holds both BBB airfields at 1939, so BBB's 1939 wings in 1 and 2 are both abroad)", show(foundB));
  const rB = rule(B);
  ok(rB.length === 1 && rB[0].autoFix === false && rB[0].movable === 0,
    "⭐⭐⭐ Map Errors offers no repair: BBB holds no airfield at 1939, so the click could only move them into AAA's hands again", rB.map((p) => ({ autoFix: p.autoFix, movable: p.movable })));
  // BBB OWNS two states with an air base: "owns none" would be false — what it lacks is one it holds on the date those wings load
  ok(rB.length === 1 && (rB[0].message || "").includes("2 cannot be moved: BBB holds no state with an air base on 1939.1.1, the date those wings load.")
    && !/BBB owns? no state/.test(rB[0].message || ""),
    "⭐ …and says why, at the date — not that BBB owns no air base, which it does", rB.map((p) => p.message));
  const fb = fixed(B);
  ok(fb.r.moved === 0 && fb.r.noAirBase === 2 && !fs.existsSync(path.join(fb.c, "history", "units", "BBB_1939_air.txt")),
    "⭐⭐ …and the repair, asked anyway, moves nothing and copies nothing in: no home at that date", fb.r);
}

console.log("\n-- 8. …and Generate land sizes the air base where the repair will put it: in a state its country holds at that date --");
{
  // ⛔ #a-dated-wing-lands-where-its-country-holds-then — a game whose last bookmark is 1938.11.1: below, BBB's control of state 1 comes
  // after it (1938.12.1), so the state Generate land writes on AAA's id 1 carries none and BBB's 1939 wing there is abroad; and BBB's
  // capital below, 2, is handed to AAA's control before it (1938.6.1), which the state written on BBB's id 2 carries — on this fixture
  // the land nearest the one the wing's file meant (the check below reads which, off the files written). BBB's 1939 wing in 2 stays:
  // the world below based it in an AAA-held state at 1939 too.
  const G8 = path.join(ROOT, "game-held");
  fs.cpSync(GAME, G8, { recursive: true });
  write(G8, "common/bookmarks/the_fixture.txt", "bookmarks = {\n\tbookmark = {\n\t\tname = \"A\"\n\t\tdate = 1936.1.1.12\n\t\tdefault = yes\n\t}\n\tbookmark = {\n\t\tname = \"B\"\n\t\tdate = 1938.11.1.12\n\t}\n}\n");
  write(G8, "history/states/1-S.txt", stateFile("1").replace(`${BELOW["1"].controlledFrom} = {`, "1938.12.1 = {"));
  write(G8, "history/states/2-S.txt", stateFile("2").replace("\t}\n}\n", "\t\t1938.6.1 = {\n\t\t\tcontroller = AAA\n\t\t}\n\t}\n}\n"));
  const M8 = path.join(ROOT, "mod-gen-held");
  descriptor(M8, true);
  write(M8, "map/provinces.bmp", bmp24(W, H, (x) => colour(idAt(Math.floor(x / CELL)))));
  write(M8, "map/definition.csv", ["0;0;0;0;land;false;unknown;0"].concat(cells.map((x) => `${x.id};${colour(x.id).join(";")};sea;false;ocean;0`)).join("\n") + "\n");
  Object.keys(BELOW).forEach((k, i) => write(M8, `map/strategicregions/r${i + 1}.txt`, `strategic_region={\n\tid=${i + 1}\n\tname="REGION_${i + 1}"\n\tprovinces={ ${risesOf(k).join(" ")} }\n\tweather={}\n}\n`));
  write(M8, "map/supply_nodes.txt", ""); write(M8, "map/railways.txt", "");
  fs.mkdirSync(path.join(M8, "history", "states"), { recursive: true });
  const land = Object.keys(BELOW).reduce((n, k) => n + risesOf(k).length, 0);
  md.clearMapLayerCache();
  const g8 = md.generateLand({ modRoot: M8, gameRoot: G8, dependencyRoots: [], count: land, provincesPerState: 8, seed: 1, ownerMode: "inherit", roughenCoast: false });
  const st8 = fs.readdirSync(path.join(M8, "history", "states")).map((f) => fs.readFileSync(path.join(M8, "history", "states", f), "utf8")).map((t) => ({ text: t,
    id: +(/\bid\s*=\s*(\d+)/.exec(t) || [])[1], owner: (/\bowner\s*=\s*(\w+)/.exec(t) || [])[1] || "", airBase: +((/\bair_base\s*=\s*(\d+)/.exec(t) || [])[1] || 0),
    provinces: ((/provinces\s*=\s*\{([^}]*)\}/.exec(t) || [])[1] || "").trim().split(/\s+/).map(Number).filter((p) => cells.some((x) => x.id === p)) }));
  const at39 = (s) => md.stateControllerAtDate(s.text, "1939.1.1");
  const dist = (s) => Math.abs(centre(s.provinces) - centre(provsOf("1")));
  const nearest = (list) => list.filter((s) => s.provinces.length).sort((a, b) => dist(a) - dist(b) || a.id - b.id)[0] || { id: -1, airBase: -1 };
  const bbb = st8.filter((s) => s.owner === "BBB"), owned = nearest(bbb), held = nearest(bbb.filter((s) => at39(s) === "BBB"));
  const one = st8.find((s) => s.id === 1) || { owner: "", text: "" };
  ok(g8 && g8.changed && one.owner === "AAA" && at39(one) === "AAA" && owned.id > 0 && held.id > 0 && owned.id !== held.id && at39(owned) === "AAA",
    `(the fixture: id 1 is AAA's at 1939; BBB's state nearest the land the wing's file meant, ${owned.id}, is AAA-held at 1939 by the block its id carries; the nearest BBB holds is ${held.id})`,
    g8 && (g8.error || st8.map((s) => [s.id, s.owner, at39(s), s.provinces])));
  const found = abroad(M8, G8);
  ok(found.length === 1 && found[0].state === 1 && found[0].owner === "AAA" && found[0].was === "BBB", "(the fixture: BBB's 1939 wing in state 1 is abroad, and nothing else)", found.map((w) => `${w.tag}@${w.state}:${w.owner}/${w.was}`));
  const level = Math.ceil(((held.id === 2 ? PLANES.home1939 : 0) + PLANES.abroad1939) / MULT);
  ok(g8.airBases && g8.airBases.movedInPlanes === PLANES.abroad1939 && held.airBase >= level,
    `⭐⭐⭐ the air base sized for BBB's ${PLANES.abroad1939} moved-in planes is state ${held.id}'s, which BBB holds at 1939: level ${level}`, { airBases: g8.airBases, held });
  ok(owned.airBase < Math.ceil(PLANES.abroad1939 / MULT), `⭐⭐ …not state ${owned.id}'s, which AAA holds then`, owned);
  const copy = M8 + "-fixed";
  fs.cpSync(M8, copy, { recursive: true });
  md.clearMapLayerCache();
  const fx = (md.autoFixMap({ modRoot: copy, gameRoot: G8, dependencyRoots: [] }) || {}).fixes || {};
  const t39 = fs.existsSync(path.join(copy, "history", "units", "BBB_1939_air.txt")) ? fs.readFileSync(path.join(copy, "history", "units", "BBB_1939_air.txt"), "utf8") : "";
  const key = +((/^\s*(\d+) = \{[^}]*?name = "B39abroad"/m.exec(t39) || [])[1]);
  ok(fx.airWingsAbroad && fx.airWingsAbroad.moved === 1 && fx.airWingsAbroad.overCapacity === 0 && key === held.id,
    `⭐⭐⭐ Auto-fix moves it to state ${held.id} — where it was sized, with room`, { fix: fx.airWingsAbroad, key });
  ok(abroad(copy, G8).length === 0, "⭐⭐ …after which no wing is abroad", abroad(copy, G8).map((w) => `${w.tag}@${w.state}:${w.owner}`));
}

try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) { /* scratch only */ }
console.log("\n" + (fail ? "FAILED " + fail + "/" + (pass + fail) : "PASSED " + pass + "/" + pass));
process.exitCode = fail ? 1 : 0;
