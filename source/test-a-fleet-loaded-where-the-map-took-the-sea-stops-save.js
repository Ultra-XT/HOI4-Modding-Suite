// ⛔ #a-fleet-loaded-where-the-map-took-the-sea — A FLEET A SCRIPT LOADS ONTO LAND THE MOD'S MAP CUT OFF FROM THE SEA STOPS SAVE;
// ONE ON A PROVINCE OF THE MOD'S OWN MAP DOES NOT.
//
// load_oob is CLoadOOBEffect, whose execute slot (0x1403734A0) tail-jumps into the game start's own order-of-battle loader
// (0x14074B100; both 1.19.4.1) — which reads a berth's port through the same unchecked `mov rax,[rax+0C8h]` (1.19.3's 0x140D6D29A) that every one of the
// eleven start crashes died on. So a fleet loaded later onto land with no sea is the start crash, reached later, and where the
// MOD's map took that sea away (the province below has the same id AND the same colour, and had sea at or beside it) the rule is
// fleet_loaded_on_land_the_map_cut_off, FATAL ("untested": no launch has fired one mid-game). Old World Blues shipped the shape
// in its OWN map — cartel_fuerte.txt berthed on 10730, a province of its own definition.csv, not vanilla's coastal 10730 — and
// played (by its 2026-10-28 download that berth is its coastal 2255: no installed map carries the shape now, the OWN fixture does),
// so a berth whose colour is not the one below stays fleet_loaded_on_land_with_no_sea, an error (#a-validator-must-not-cry-wolf).
//
// THE FIXTURE (8x8 provinces of 32px, ids 1..64 by row; row r holds 8r+1 .. 8r+8):
//   below  land rows 0-5, sea rows 6-7 (row 5 = 41..48 is the coast); CCC holds 43..45, harbour 44; events/gift.txt loads XXX_gift
//          for CCC: a fleet berthed on 44, "# Halifax" — and XXX_gift_mtg, its twin on the same berth (destroyers-for-bases' shape)
//   CUT    the mod's map: land rows 0-6 (row 6 took row 5's sea), same colours; CCC holds 43..45 and 51, harbour 51
//   OWN    the same, but the mod ships its own provinces.bmp and definition.csv in which 44 is ANOTHER province (another colour):
//          Old World Blues' shape
//   OTHER  the decoy: CUT with an unrelated province (3) recoloured — the berth is still the province below
"use strict";
const assert = require("assert");
const fs = require("fs"), os = require("os"), path = require("path");

const APPDATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "nova-cutfleet-appdata-"));
process.env.NOVA_APP_DATA_DIR = APPDATA_DIR;
process.env.APPDATA = APPDATA_DIR;
process.env.XDG_CONFIG_HOME = APPDATA_DIR;
const md = require("./map-data.js");
const labels = require("./public/map-rule-labels.js");

let pass = 0;
const fails = [];
const rec = (name, cond, detail) => {
  if (cond) { console.log("  ok   " + name); pass++; }
  else { console.log("  FAIL " + name + (detail === undefined ? "" : "   → " + JSON.stringify(detail).slice(0, 500))); fails.push(name); }
};
const tmps = [APPDATA_DIR];
const tmp = (t) => { const d = fs.mkdtempSync(path.join(os.tmpdir(), "nova-cutfleet-" + t + "-")); tmps.push(d); return d; };
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
const OTHER_COLOUR = [3, 250, 7];   // in no COL(p): 250 > 224
const colourOf = (recolour) => (p) => (p === recolour ? OTHER_COLOUR : COL(p));
const definition = (isLand, col = COL) => {
  const rows = ["0;0;0;0;land;false;unknown;0"];
  for (let p = 1; p <= 64; p++) {
    const [r, g, b] = col(p), land = isLand(p);
    rows.push(`${p};${r};${g};${b};${land ? "land" : "sea"};false;${land ? "plains" : "ocean"};${land ? 1 : 0}`);
  }
  return rows.join("\n") + "\n";
};
const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
const state = (id, provs, owner, harbours) =>
  `state = {\n\tid = ${id}\n\tname = "STATE_${id}"\n\tmanpower = 1000\n\tstate_category = rural\n\tprovinces = { ${provs.join(" ")} }\n`
  + `\thistory = {\n\t\towner = ${owner}\n\t\tbuildings = {\n\t\t\tinfrastructure = 2\n`
  + (harbours || []).map((p) => `\t\t\t${p} = { naval_base = 3 }\n`).join("")
  + `\t\t}\n\t}\n}\n`;
const GIFT = ["units = {", "\tfleet = {", '\t\tname = "Halifax Escort"', "\t\tnaval_base = 44 # Halifax", "\t\ttask_force = {", '\t\t\tname = "Halifax Escort TF"',
  "\t\t\tlocation = 44 # Halifax", '\t\t\tship = { name = "HE 1" definition = destroyer equipment = { destroyer_1 = { amount = 1 owner = CCC } } }', "\t\t}", "\t}", "}", ""].join("\r\n");

const GAME = tmp("game");
mk(GAME, "map/provinces.bmp", bmp24(256, 256, (x, y) => COL(provAt(x, y))));
mk(GAME, "map/definition.csv", definition((p) => p <= 48));
mk(GAME, "history/states/1.txt", state(1, [43, 44, 45], "CCC", [44]));
mk(GAME, "history/states/2.txt", state(2, [...range(1, 42), ...range(46, 48)], "OOO", []));
mk(GAME, "history/units/XXX_gift.txt", GIFT);
// …and its _mtg twin on the same berth, as the base game ships destroyers-for-bases (TEST 32's two hits, both on 7361)
mk(GAME, "history/units/XXX_gift_mtg.txt", GIFT.replace(/Halifax Escort/g, "Halifax Escort MtG"));
mk(GAME, "events/gift.txt", ["namespace = gift", "country_event = {", "\tid = gift.1", "\timmediate = {", '\t\tCCC = { load_oob = "XXX_gift" }',
  '\t\tCCC = { load_oob = "XXX_gift_mtg" }', "\t}", "}", ""].join("\n"));

// recolour: the province the mod's OWN map paints differently (its provinces.bmp and definition.csv both), or 0 for none
function writeMod(recolour) {
  const m = tmp("mod");
  mk(m, "descriptor.mod", 'name="later fleet"\nreplace_path="history/states"\n');
  if (recolour) mk(m, "map/provinces.bmp", bmp24(256, 256, (x, y) => colourOf(recolour)(provAt(x, y))));
  mk(m, "map/definition.csv", definition((p) => p <= 56, recolour ? colourOf(recolour) : COL));
  mk(m, "history/states/1.txt", state(1, [43, 44, 45, 51], "CCC", [51]));
  mk(m, "history/states/2.txt", state(2, [...range(1, 42), ...range(46, 50), ...range(52, 56)], "OOO", []));
  return m;
}
const ctx = (modRoot, deps = []) => ({ modRoot, gameRoot: GAME, dependencyRoots: deps });
const fleetRows = (c) => { md.clearMapLayerCache(); return (md.validateMapBitmap(c) || []).filter((p) => /^fleet_loaded_on_land_/.test(p.rule)); };
const giftIn = (m) => { const p = path.join(m, "history", "units", "XXX_gift.txt"); return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : ""; };
const nums = (s, k) => (s.match(new RegExp(k + "\\s*=\\s*(\\d+)", "g")) || []).map((x) => Number(x.replace(/\D/g, "")));

const CUT = writeMod(0), OWN = writeMod(44), OTHER = writeMod(3);
console.log("=== THE CONTROLS ===");
for (const [name, m] of [["CUT", CUT], ["OWN", OWN], ["OTHER", OTHER]]) {
  md.clearMapLayerCache();
  const st = md.findUnitsStrandedByTheMap(ctx(m));
  const coast = md.landProvincesTouchingSea({ ...ctx(m), model: md.buildMapModel(ctx(m)) });
  rec(`THE CONTROL (${name}): the gift's berth 44 has no sea now, CCC's 51 does, and the finder finds the gift and its twin there`,
    !coast.has(44) && coast.has(51) && (st.laterFleets || []).length === 2 && st.laterFleets.every((u) => u.province === 44 && u.tag === "CCC"),
    (st.laterFleets || []).map((u) => ({ p: u.province, tag: u.tag, cut: u.cutOff })));
}
rec("THE CONTROL: OWN's 44 is a province of its own map — another colour on disk, in its bitmap and its definition",
  fs.readFileSync(path.join(OWN, "map", "definition.csv"), "utf8").split("\n")[44].startsWith("44;3;250;7;land") && fs.existsSync(path.join(OWN, "map", "provinces.bmp")));

console.log("\n=== the map below's province, its sea taken by the mod ===");
{
  const rows = fleetRows(ctx(CUT));
  const r = rows[0] || {};
  rec("⭐⭐⭐ fleet_loaded_on_land_the_map_cut_off, one row, both fleets, Auto-fix offered",
    rows.length === 1 && r.rule === "fleet_loaded_on_land_the_map_cut_off" && r.severity === "error" && r.total === 2 && r.autoFix === true && (r.provinces || []).join() === "44",
    rows.map((p) => ({ rule: p.rule, total: p.total, autoFix: p.autoFix, provinces: p.provinces })));
  rec("⭐⭐⭐ …and it stops Save: FATAL, its outcome said honestly (\"untested\"), its twin not",
    labels.isFatalRule("fleet_loaded_on_land_the_map_cut_off") === true && labels.fatalOutcome("fleet_loaded_on_land_the_map_cut_off") === "untested"
    && labels.isFatalRule("fleet_loaded_on_land_with_no_sea") === false);
  rec("⭐⭐ …saying the mod's map took the sea and that load_oob runs the start's loader, never that it WILL crash",
    /your map edits took it away/.test(r.message || "") && /load_oob/.test(r.message || "") && !/will crash/i.test(r.message || ""), r.message);
  rec("⭐⭐ …and a twin on the same berth is said as that, not as an empty list (\"1 more, at )\")",
    /\(1 more, at the same province\)/.test(r.message || "") && !/at \)/.test(r.message || ""), (r.message || "").slice(0, 300));
  rec("⭐⭐ …with a label and a fix hint of its own, each saying the map took the sea",
    labels.LABELS.fleet_loaded_on_land_the_map_cut_off === labels.mapRuleLabel("fleet_loaded_on_land_the_map_cut_off") && /took the sea/.test(labels.mapRuleLabel("fleet_loaded_on_land_the_map_cut_off"))
    && /load_oob/.test(labels.mapRuleFixHint("fleet_loaded_on_land_the_map_cut_off")) && labels.mapRuleFixHint("fleet_loaded_on_land_the_map_cut_off") !== labels.mapRuleFixHint("fleet_loaded_on_land_with_no_sea"),
    { label: labels.mapRuleLabel("fleet_loaded_on_land_the_map_cut_off"), hint: labels.mapRuleFixHint("fleet_loaded_on_land_the_map_cut_off").slice(0, 200) });
}

console.log("\n=== Old World Blues' shape: the berth is a province of the mod's own map ===");
{
  const rows = fleetRows(ctx(OWN));
  const r = rows[0] || {};
  rec("⭐⭐⭐ fleet_loaded_on_land_with_no_sea, an ERROR — not the FATAL rule",
    rows.length === 1 && r.rule === "fleet_loaded_on_land_with_no_sea" && r.severity === "error" && r.total === 2 && !labels.isFatalRule(r.rule),
    rows.map((p) => ({ rule: p.rule, total: p.total })));
  rec("⭐⭐ …saying the berth is the mod's own map's province", /your map's own/.test(r.message || ""), r.message);
}

console.log("\n=== the decoy: an unrelated province recoloured ===");
{
  const rows = fleetRows(ctx(OTHER));
  rec("⭐⭐⭐ the berth is judged by ITS colour, not by whether the mod ships a map: still the FATAL rule",
    rows.length === 1 && rows[0].rule === "fleet_loaded_on_land_the_map_cut_off", rows.map((p) => p.rule));
}

console.log("\n=== #inherited-problem-not-yours ===");
{
  const ADD = tmp("addon");
  mk(ADD, "descriptor.mod", 'name="add-on"\n');
  rec("⭐⭐ an empty add-on over the CUT world is not told it cut the sea off (the world below it did)", fleetRows(ctx(ADD, [CUT])).length === 0,
    fleetRows(ctx(ADD, [CUT])).map((p) => p.rule));
  const ADDG = tmp("addon-game");
  mk(ADDG, "descriptor.mod", 'name="add-on"\n');
  rec("⭐⭐ …nor an add-on over the base game, whose berth 44 is coastal", fleetRows(ctx(ADDG)).length === 0);
}

console.log("\n=== Auto-fix all clears both ===");
for (const [name, m] of [["CUT", CUT], ["OWN", OWN]]) {
  const fx = (md.autoFixMap(ctx(m)) || {}).fixes || {};
  const g = giftIn(m);
  rec(`⭐⭐⭐ ${name}: one click re-berths the gift and its twin at CCC's harbour 51, task force and home base`,
    ((fx.fleetBerths || {}).moved || 0) === 2 && nums(g, "location")[0] === 51 && nums(g, "naval_base")[0] === 51, { fb: fx.fleetBerths, location: nums(g, "location") });
  rec(`⭐⭐⭐ ${name}: …and neither rule speaks again`, fleetRows(ctx(m)).length === 0, fleetRows(ctx(m)).map((p) => p.rule));
}
rec("⭐⭐ the base game's copy is unchanged", fs.readFileSync(path.join(GAME, "history", "units", "XXX_gift.txt"), "utf8") === GIFT);

for (const d of tmps) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} }
console.log(`\n=== a fleet loaded where the map took the sea stops Save: ${pass + fails.length} checks, ${fails.length} failed ===`);
if (fails.length) { for (const f of fails) console.log("   FAILED: " + f); process.exit(1); }
assert.ok(pass > 0);
