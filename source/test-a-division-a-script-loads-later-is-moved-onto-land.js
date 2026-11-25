// ⛔ #a-script-loads-an-army-later — AN ARMY AN EVENT LOADS MID-GAME IS STILL AN ARMY ON THE MAP.
//
// Every drowned-unit rule and fixer read ONE list: the orders of battle a country's history starts
// (startingUnitLocations). An event, focus or decision that runs `load_oob = "SLO_independence"` spawns an army
// too, through the same loader with no land test, and none of those files was ever read. Measured on the owner's
// TEST 32 (New mod → Delete map → Generate land → Auto-fix): 50 files the scripts load, 381 divisions, 214 of them
// on water — Germany's civil-war armies, the Cossack hosts, Slovakia's independence army — and Nova said nothing.
//
// WHERE THEY GO is the one decision, and the base game answers it: 381 of its 381 loaded divisions stand on the 1936
// land of the country that held the province — Slovakia's on Czech land, the Cossacks' on Soviet land — though 230
// of them belong to a country that owns nothing at the start. So a loaded division goes to the nearest land of the
// country that held its province in the world the mod replaced, and when that country owns nothing here it stays.
//
// THE FIXTURE (8x8 provinces of 32px, ids 1..64 by row; row r holds 8r+1 .. 8r+8):
//     below  land = rows 0–5;  states 1 [1,8] ZZZ · 2 [16] AAA · 3 [41,42] PPP · 4 [44] QQQ
//     mod    land = rows 0–2;  states 1 [1..8] ZZZ · 3 [23,9] PPP · 2 every other land province AAA — QQQ owns nothing
//   KID_independence  loaded by events/kid.txt; divisions at 41, 41, 42 (drowned, PPP's below) and 1 (ZZZ's land)
//   ORPHAN_rising     loaded (bare name); a division at 44 (drowned, QQQ's below — QQQ owns nothing now)
//   GHO_1936          the start file of GHO, a country with no state; a division at 42 (PPP's below). Never loads.
//   DEAD_file         named only in a COMMENTED-OUT load_oob; a division at 45
//   UNREF             named by nothing; a division at 46
//   ZZZ_1936          started by ZZZ's history; a division at 1
//
//     41 -> 17   3 rows            NEAREST — but AAA's
//     41 -> 9    4 rows            PPP's nearest: the first two go here
//     41 -> 23   3 rows, 6 cols    PPP's, listed FIRST, furthest — the third goes here: KID's own density is
//                                  4 divisions on 3 provinces, so no PPP province takes more than 2 of them
"use strict";
const assert = require("assert");
const fs = require("fs"), os = require("os"), path = require("path");

const APPDATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "nova-laterdiv-appdata-"));
process.env.NOVA_APP_DATA_DIR = APPDATA_DIR;
process.env.APPDATA = APPDATA_DIR;
process.env.XDG_CONFIG_HOME = APPDATA_DIR;
const md = require("./map-data.js");

let pass = 0;
const fails = [];
const rec = (name, cond, detail) => {
  if (cond) { console.log("  ok   " + name); pass++; }
  else { console.log("  FAIL " + name + (detail === undefined ? "" : "   → " + JSON.stringify(detail).slice(0, 400))); fails.push(name); }
};
const tmps = [APPDATA_DIR];
const tmp = (t) => { const d = fs.mkdtempSync(path.join(os.tmpdir(), "nova-laterdiv-" + t + "-")); tmps.push(d); return d; };
const mk = (root, rel, body) => { const p = path.join(root, ...rel.split("/")); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, body); };

function bmp24(w, h, fn) {
  const rs = (w * 3 + 3) & ~3, is = rs * h; const b = Buffer.alloc(54 + is);
  b.write("BM", 0, "ascii"); b.writeUInt32LE(54 + is, 2); b.writeUInt32LE(54, 10); b.writeUInt32LE(40, 14);
  b.writeInt32LE(w, 18); b.writeInt32LE(h, 22); b.writeUInt16LE(1, 26); b.writeUInt16LE(24, 28); b.writeUInt32LE(is, 34);
  for (let y = 0; y < h; y++) { let o = 54 + (h - 1 - y) * rs; for (let x = 0; x < w; x++) { const [r, g, bl] = fn(x, y); b[o++] = bl; b[o++] = g; b[o++] = r; } }
  return b;
}
const provAt = (x, y) => Math.floor(x / 32) + Math.floor(y / 32) * 8 + 1;
const COL = (p) => [((p * 29) % 210) + 15, ((p * 67) % 210) + 15, ((p * 101) % 210) + 15];
const BMP = bmp24(256, 256, (x, y) => COL(provAt(x, y)));
const definition = (isLand) => {
  const rows = ["0;0;0;0;land;false;unknown;0"];
  for (let p = 1; p <= 64; p++) {
    const [r, g, b] = COL(p), land = isLand(p);
    rows.push(`${p};${r};${g};${b};${land ? "land" : "sea"};false;${land ? "plains" : "ocean"};${land ? 1 : 0}`);
  }
  return rows.join("\n") + "\n";
};
const st = (id, provs, owner) => `state = {\n\tid = ${id}\n\tname = "STATE_${id}"\n\tmanpower = 1000\n\tstate_category = rural\n\tprovinces = { ${provs.join(" ")} }\n\thistory = {\n\t\towner = ${owner}\n\t}\n}\n`;
const oob = (divs, eol = "\n") => ['division_template = { name = "Inf" regiments = { infantry = { x = 0 y = 0 } } }', "units = {",
  ...divs.map(([n, p]) => `\tdivision = { name = "${n}" location = ${p} division_template = "Inf" }`), "}", ""].join(eol);

// KID's army, CRLF on purpose (the mix is real and per-file), with a comment above each division: comments are content.
const KID = ['division_template = { name = "Inf" regiments = { infantry = { x = 0 y = 0 } } }', "units = {",
  "\t# the first of the Kid army", '\tdivision = { name = "K1" location = 41 division_template = "Inf" }',
  '\tdivision = { name = "K2" location = 41 division_template = "Inf" }',
  "\t# the third", '\tdivision = { name = "K3" location = 42 division_template = "Inf" }',
  "\t# on land already, and stays", '\tdivision = { name = "K4" location = 1 division_template = "Inf" }',
  "}", ""].join("\r\n");
const EVENTS = ['namespace = kid', 'country_event = {', '\tid = kid.1', '\timmediate = {',
  '\t\tKID = { load_oob = "KID_independence" }', '\t\tORP = { load_oob = ORPHAN_rising }', '\t\t# load_oob = "DEAD_file"', '\t}', '}', ''].join("\n");

function writeGame(g) {
  mk(g, "map/provinces.bmp", BMP);
  mk(g, "map/definition.csv", definition((p) => p <= 48));
  mk(g, "history/states/1.txt", st(1, [1, 8], "ZZZ"));
  mk(g, "history/states/2.txt", st(2, [16], "AAA"));
  mk(g, "history/states/3.txt", st(3, [41, 42], "PPP"));
  mk(g, "history/states/4.txt", st(4, [44], "QQQ"));
  mk(g, "history/countries/ZZZ - Zland.txt", 'capital = 1\noob = "ZZZ_1936"\n');
  for (const t of ["AAA", "PPP", "QQQ"]) mk(g, `history/countries/${t} - ${t}land.txt`, "capital = 1\n");
  mk(g, "history/countries/GHO - Ghost.txt", 'capital = 1\noob = "GHO_1936"\n');
  mk(g, "history/units/ZZZ_1936.txt", oob([["Z1", 1]]));
  mk(g, "history/units/KID_independence.txt", KID);
  mk(g, "history/units/ORPHAN_rising.txt", oob([["O1", 44]]));
  mk(g, "history/units/GHO_1936.txt", oob([["G1", 42]]));
  mk(g, "history/units/DEAD_file.txt", oob([["D1", 45]]));
  mk(g, "history/units/UNREF.txt", oob([["U1", 46]]));
  mk(g, "events/kid.txt", EVENTS);
}
function writeMod(m) {
  mk(m, "descriptor.mod", 'name="later fixture"\nreplace_path="history/states"\n');
  mk(m, "map/definition.csv", definition((p) => p <= 24));
  // every land province in a state, so Auto-fix's stateless-land pass hands PPP nothing more before the units move
  mk(m, "history/states/1.txt", st(1, [1, 2, 3, 4, 5, 6, 7, 8], "ZZZ"));
  mk(m, "history/states/2.txt", st(2, [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 24], "AAA"));
  mk(m, "history/states/3.txt", st(3, [23, 9], "PPP"));
}
const GAME = tmp("game"); writeGame(GAME);
const MOD = tmp("mod"); writeMod(MOD);
const ctx = (modRoot) => ({ modRoot, gameRoot: GAME, dependencyRoots: [] });
const unitsFile = (root, f) => path.join(root, "history", "units", f);
const locsIn = (s) => (s.match(/location\s*=\s*(\d+)/g) || []).map((x) => Number(x.replace(/\D/g, "")));
const key = (u) => `${u.file}:${u.province}:${u.tag}`;

// ── 1. what is found, and what is not ───────────────────────────────────────────────────────────────
console.log("=== the armies the scripts load ===");
const st1 = md.findUnitsStrandedByTheMap(ctx(MOD));
st1.laterDivisions = st1.laterDivisions || [];   // a finder without the field reads as finding nothing: a FAIL below, not a crash
{
  // THE CONTROLS: the geometry the destinations depend on, read off the same centroids the fixer uses
  const c = md.provinceCentroids({ ...ctx(MOD), wanted: new Set([41, 42, 17, 9, 23]) });
  const d = (a, b) => (c.get(a).x - c.get(b).x) ** 2 + (c.get(a).z - c.get(b).z) ** 2;
  rec("THE CONTROL: from 41, AAA's 17 is nearer than PPP's 9, and PPP's 23 is the furthest",
    d(41, 17) < d(41, 9) && d(41, 9) < d(41, 23) && d(42, 9) < d(42, 23), { d17: d(41, 17), d9: d(41, 9), d23: d(41, 23) });
  rec("THE CONTROL: the started half reads only ZZZ's own start file — never KID, GHO, DEAD or UNREF",
    [...new Set(md.startingUnitLocations({ ...ctx(MOD), model: md.buildMapModel(ctx(MOD)) }).map((u) => u.file))].join() === "ZZZ_1936.txt"
    && st1.divisions.length === 0, { divisions: st1.divisions.map(key) });
}
const wantLater = ["KID_independence.txt:41:PPP", "KID_independence.txt:41:PPP", "KID_independence.txt:42:PPP", "ORPHAN_rising.txt:44:QQQ"];
rec("⭐⭐⭐ exactly the four loaded divisions on water are found, each with the country that held its province below",
  JSON.stringify(st1.laterDivisions.map(key).sort()) === JSON.stringify(wantLater.slice().sort()), st1.laterDivisions.map(key));
rec("⭐⭐ …out of the five the scripts load (a commented-out load_oob loads nothing, a start file of a country with no state never loads)",
  st1.loadedDivisions === 5, { loadedDivisions: st1.loadedDivisions });
rec("⭐⭐ …and each names the script that loads it", st1.laterDivisions.every((u) => (u.loadedBy || []).join() === "events/kid.txt"),
  st1.laterDivisions.map((u) => u.loadedBy));

const found = md.drownedDivisionsInOwnFiles(ctx(MOD));
found.laterMovable = found.laterMovable || []; found.laterNoLand = found.laterNoLand || [];
rec("⭐⭐⭐ three can move (PPP owns land), one cannot (QQQ owns nothing on this map)",
  found.laterMovable.length === 3 && found.laterNoLand.length === 1 && found.laterNoLand[0].file === "ORPHAN_rising.txt",
  { laterMovable: found.laterMovable.map(key), laterNoLand: found.laterNoLand.map(key) });
rec("⭐⭐ …and the started half is untouched by them", found.movable.length === 0 && found.noLand.length === 0,
  { movable: found.movable.length, noLand: found.noLand.length });

// ── 2. the rule ─────────────────────────────────────────────────────────────────────────────────────
console.log("\n=== the rule ===");
{
  const rows = (md.validateMapBitmap(ctx(MOD)) || []).filter((p) => p.rule === "division_loaded_on_water");
  const r = rows[0] || {};
  rec("⭐⭐⭐ division_loaded_on_water: a warning, all four counted, three movable, the button offered",
    rows.length === 1 && r.severity === "warning" && r.total === 4 && r.movable === 3 && r.autoFix === true && r.loadedDivisions === 5,
    rows.map((p) => ({ severity: p.severity, total: p.total, movable: p.movable, autoFix: p.autoFix })));
  rec("⭐⭐ …it names the script that loads them, and the country that owns nothing", /events\/kid\.txt/.test(r.message || "") && /QQQ/.test(r.message || ""), r.message);
  rec("⭐⭐ …and the started rule stays silent", !(md.validateMapBitmap(ctx(MOD)) || []).some((p) => p.rule === "division_starts_on_water"));
}

// ── 3. the repair ───────────────────────────────────────────────────────────────────────────────────
console.log("\n=== the repair ===");
const r = md.fixDrownedDivisions(ctx(MOD));
rec("⭐⭐⭐ it moves the three, copying in KID's file alone and naming it",
  r.moved === 3 && (r.files || []).join() === "KID_independence.txt" && (r.materialised || []).join() === "KID_independence.txt", r);
rec("⭐⭐ …and says they were loaded ones, and that one could not be moved",
  r.later && r.later.moved === 3 && r.later.noLand === 1 && r.later.files.join() === "KID_independence.txt", r.later);
const kid = fs.existsSync(unitsFile(MOD, "KID_independence.txt")) ? fs.readFileSync(unitsFile(MOD, "KID_independence.txt"), "utf8") : "";
rec("⭐⭐⭐ THE ASSERTION: KID's army lands on PPP's land — 9, 9, then 23 — and the one on land stays on 1",
  JSON.stringify(locsIn(kid)) === JSON.stringify([9, 9, 23, 1]),
  { got: locsIn(kid), meaning: locsIn(kid).includes(17) ? "AAA's land: the tag was not the owner below" : locsIn(kid).filter((p) => p === 9).length === 3 ? "all on 9: no density cap" : "?" });
rec("⭐⭐⭐ nothing else is written: ORPHAN (no land), GHO (never loads), DEAD (commented out) and UNREF stay out of the mod",
  ["ORPHAN_rising.txt", "GHO_1936.txt", "DEAD_file.txt", "UNREF.txt", "ZZZ_1936.txt"].every((f) => !fs.existsSync(unitsFile(MOD, f))),
  fs.existsSync(path.join(MOD, "history", "units")) ? fs.readdirSync(path.join(MOD, "history", "units")) : []);
rec("⭐⭐ the base game's copy is unchanged", fs.readFileSync(unitsFile(GAME, "KID_independence.txt"), "utf8") === KID);
const endings = (s) => { let crlf = 0, lf = 0; for (let i = 0; i < s.length; i++) if (s[i] === "\n") { if (s[i - 1] === "\r") crlf++; else lf++; } return { crlf, lf }; };
rec("⭐⭐⭐ the CRLF file stays all CRLF", endings(kid).crlf === endings(KID).crlf && endings(kid).lf === 0, endings(kid));
rec("⭐⭐⭐ …and undoing the three numbers gives the base game's bytes back exactly — only digits changed, every comment in place",
  kid.replace("K1\" location = 9", "K1\" location = 41").replace("K2\" location = 9", "K2\" location = 41").replace("K3\" location = 23", "K3\" location = 42") === KID, null);

// ── 4. a second click ───────────────────────────────────────────────────────────────────────────────
console.log("\n=== a second click writes nothing ===");
{
  const r2 = md.fixDrownedDivisions(ctx(MOD));
  rec("⭐⭐⭐ it moves nothing and the bytes are identical", r2.moved === 0 && !!kid && fs.readFileSync(unitsFile(MOD, "KID_independence.txt"), "utf8") === kid, r2);
  const rows = (md.validateMapBitmap(ctx(MOD)) || []).filter((p) => p.rule === "division_loaded_on_water");
  rec("⭐⭐⭐ the rule now counts only the one it cannot move, and offers no button for it",
    rows.length === 1 && rows[0].total === 1 && rows[0].movable === 0 && rows[0].autoFix === false,
    rows.map((p) => ({ total: p.total, movable: p.movable, autoFix: p.autoFix })));
}

// ── 5. wired into the click ─────────────────────────────────────────────────────────────────────────
console.log("\n=== wired into Auto-fix all ===");
{
  const m2 = tmp("click"); writeMod(m2);
  const fx = (md.autoFixMap(ctx(m2)) || {}).fixes || {};
  rec("⭐⭐⭐ one click on Auto-fix all moves them", ((fx.drownedDivisions || {}).later || {}).moved === 3, fx.drownedDivisions);
  rec("⭐⭐ …to the same places", fs.existsSync(unitsFile(m2, "KID_independence.txt"))
    && JSON.stringify(locsIn(fs.readFileSync(unitsFile(m2, "KID_independence.txt"), "utf8"))) === "[9,9,23,1]",
    fs.existsSync(unitsFile(m2, "KID_independence.txt")) ? locsIn(fs.readFileSync(unitsFile(m2, "KID_independence.txt"), "utf8")) : "not written");
}

// ── 6. THE BACK-OUT CONTROL: a map that drowns nothing ──────────────────────────────────────────────
console.log("\n=== THE BACK-OUT CONTROL: a mod that drowns nothing ===");
{
  const dry = tmp("dry");
  mk(dry, "descriptor.mod", 'name="drowns nothing"\n');
  mk(dry, "map/definition.csv", definition((p) => p <= 48));
  const s = md.findUnitsStrandedByTheMap(ctx(dry));
  const rr = md.fixDrownedDivisions(ctx(dry));
  rec("⭐⭐⭐ nothing is found and nothing is written", (s.laterDivisions || []).length === 0 && rr.moved === 0 && !fs.existsSync(path.join(dry, "history", "units")),
    { later: (s.laterDivisions || []).length, moved: rr.moved });
}

// ── 7. a STARTED army that a script loads again ─────────────────────────────────────────────────────────────────────
// Seven shipping maps start an order of battle that a script ALSO loads: Rise of Nations 15 (ger_1936, by a focus), Old World
// Blues 9, Novum Vexillum 5, Hearts of Minecraft 5, Millennium Dawn 2, MDC 2, Road to 56 1 (ger_1936, by an event); vanilla none
// (re-measured 2026-10-07 by Nova's own readers). The game places such an army at the start, for the country that starts it — so
// it is that country's started army, reported once. Judged as a loaded one too, it took the country that held its province BELOW
// and the repair could walk it onto that country's land.
//     AAA starts AAA_1936 (a division on 41: PPP's land below, sea now), and events/aaa.txt loads it again.
console.log("\n=== a started army a script also loads ===");
{
  const g = tmp("game-both"); writeGame(g);
  mk(g, "history/countries/AAA - AAAland.txt", 'capital = 1\noob = "AAA_1936"\n');
  mk(g, "history/units/AAA_1936.txt", oob([["A1", 41]]));
  mk(g, "events/aaa.txt", ["namespace = aaa", "country_event = {", "\tid = aaa.1", '\timmediate = { AAA = { load_oob = "AAA_1936" } }', "}", ""].join("\n"));
  const m = tmp("both"); writeMod(m);
  const c = { modRoot: m, gameRoot: g, dependencyRoots: [] };
  // the two answers, off the centroids the fixer uses: AAA's land nearest 41 (right), PPP's (the owner below: wrong)
  const model = md.buildMapModel(c);
  const landOf = (tag) => model.states.filter((s) => s.owner === tag).flatMap((s) => s.provinces.map(Number)).filter((p) => p <= 24);
  const cents = md.provinceCentroids({ ...c, wanted: new Set([41, ...landOf("AAA"), ...landOf("PPP")]) });
  const nearest = (tag) => landOf(tag).map((p) => [p, (cents.get(p).x - cents.get(41).x) ** 2 + (cents.get(p).z - cents.get(41).z) ** 2])
    .sort((a, b) => a[1] - b[1] || a[0] - b[0])[0][0];
  const own = nearest("AAA"), below = nearest("PPP");
  rec("THE CONTROL: AAA starts AAA_1936, a script loads it, and AAA's nearest land is not PPP's — so the fixture tells the two apart",
    md.scriptLoadedOobs(m, g, []).has("aaa_1936") && md.startingUnitLocations({ ...c, model }).some((u) => u.file === "AAA_1936.txt") && own !== below,
    { own, below });
  const s = md.findUnitsStrandedByTheMap(c);
  const mine = (us) => (us || []).filter((u) => u.file === "AAA_1936.txt").map(key);
  rec("⭐⭐⭐ it is found ONCE, as the started army it is, with the country that starts it — never also as a loaded one",
    JSON.stringify(mine(s.divisions)) === '["AAA_1936.txt:41:AAA"]' && mine(s.laterDivisions).length === 0,
    { started: mine(s.divisions), loaded: mine(s.laterDivisions) });
  const rows = md.validateMapBitmap(c) || [];
  const named = (rule) => rows.filter((p) => p.rule === rule).flatMap((p) => p.items || []).filter((i) => i.file === "AAA_1936.txt").length;
  rec("⭐⭐ …division_starts_on_water names it, division_loaded_on_water does not",
    named("division_starts_on_water") === 1 && named("division_loaded_on_water") === 0,
    { starts: named("division_starts_on_water"), loaded: named("division_loaded_on_water") });
  md.fixDrownedDivisions(c);
  const got = locsIn(fs.existsSync(unitsFile(m, "AAA_1936.txt")) ? fs.readFileSync(unitsFile(m, "AAA_1936.txt"), "utf8") : "");
  rec(`⭐⭐⭐ THE ASSERTION: the repair moves it to ${own}, its own country's nearest land — not ${below}, the land of the country below`,
    JSON.stringify(got) === JSON.stringify([own]), { got, meaning: got[0] === below ? "judged as a loaded army too: the owner below's land" : "?" });
}

for (const d of tmps) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} }
console.log(`\n=== a division a script loads later is moved onto land: ${pass + fails.length} checks, ${fails.length} failed ===`);
if (fails.length) { for (const f of fails) console.log("   FAILED: " + f); process.exit(1); }
assert.ok(pass > 0);
