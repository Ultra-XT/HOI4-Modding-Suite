// ⛔ #a-script-loads-an-army-later — A FLEET AN EVENT LOADS ONTO LAND WITH NO SEA IS THE CRASH BERTH, REACHED LATER.
//
// Every one of the eleven crashes at +12011578 named a STARTED fleet berthed on land with no sea neighbour (6332 ten
// times, 9340 once). On the owner's TEST 32 two more sat in files no rule read: events/USA.txt runs
// `CAN = { load_oob = "CAN_destroyers_for_bases" }` (and its _mtg twin), whose naval_base and task force are both on
// 7361, Halifax — land in the mod's world with no sea left beside it. It is reached through a mid-game effect, which
// has never been seen in a launch — but load_oob runs the game start's own loader into the same unchecked read, so where
// the MOD's map took the sea (this fixture: the same province below, by id and colour) the rule is
// fleet_loaded_on_land_the_map_cut_off and stops Save (#a-fleet-loaded-where-the-map-took-the-sea; its error twin for a
// map's own province is pinned by test-a-fleet-loaded-where-the-map-took-the-sea-stops-save.js); and the repair is the
// started fleets' own: the nearest coastal harbour of the fleet's country, else the nearest sea, location and home base both.
//
// WHOSE FLEET: a loaded file names no country, so each stranded fleet takes the country that holds its berth NOW — it
// is land, and somebody's. Not the owner in the world below: on Old World Blues the owner below of cartel_fuerte's
// berth (MEX) owns no harbour there and the owner now (SIN) is the country the file's own ships name.
//
// THE FIXTURE (8x8 provinces of 32px, ids 1..64 by row; row r holds 8r+1 .. 8r+8):
//     below  land = rows 0–5, sea = rows 6–7: row 5 (41..48) is the coast
//     mod    land = rows 0–6, sea = row 7: row 5 has no sea left, row 6 (49..56) is the coast now
//   CCC owns 43, 44, 45 and 51; naval bases on 51 (coastal) and 43 (landlocked, and NEARER to 44 — a decoy)
//   DDD owns 46 and no harbour at all → its fleet goes to the nearest sea
//   SSS owns 47 and 52 (harbour); 47 was MMM's below, and MMM owns 48 and no harbour
//   XXX_gift   CCC's load: fleet on 44 "# Halifax", naval_base 44 → 51, with an honest comment
//   DDD_boats  DDD's load: on 46 → the nearest sea, 62
//   YYY_boats  SSS's load: on 47 → SSS's harbour 52 (the owner below, MMM, would have sent it to sea)
//   TWO_fleets one file, three fleets: CCC's on 45, SSS's on 47, and a third whose task force is at sea but whose
//              naval_base is 45 — a file of two countries, so that base's country cannot be told: left, and said
//   SEA_boats  a loaded fleet already at sea: harmless, never collected
"use strict";
const assert = require("assert");
const fs = require("fs"), os = require("os"), path = require("path");

const APPDATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "nova-laterfleet-appdata-"));
process.env.NOVA_APP_DATA_DIR = APPDATA_DIR;
process.env.APPDATA = APPDATA_DIR;
process.env.XDG_CONFIG_HOME = APPDATA_DIR;
const md = require("./map-data.js");
const labels = require("./public/map-rule-labels.js");

let pass = 0;
const fails = [];
const rec = (name, cond, detail) => {
  if (cond) { console.log("  ok   " + name); pass++; }
  else { console.log("  FAIL " + name + (detail === undefined ? "" : "   → " + JSON.stringify(detail).slice(0, 400))); fails.push(name); }
};
const tmps = [APPDATA_DIR];
const tmp = (t) => { const d = fs.mkdtempSync(path.join(os.tmpdir(), "nova-laterfleet-" + t + "-")); tmps.push(d); return d; };
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
const state = (id, provs, owner, harbours) =>
  `state = {\n\tid = ${id}\n\tname = "STATE_${id}"\n\tmanpower = 1000\n\tstate_category = rural\n\tprovinces = { ${provs.join(" ")} }\n`
  + `\thistory = {\n\t\towner = ${owner}\n\t\tbuildings = {\n\t\t\tinfrastructure = 2\n`
  + (harbours || []).map((p) => `\t\t\t${p} = { naval_base = 3 }\n`).join("")
  + `\t\t}\n\t}\n}\n`;
const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
const fleet = (name, base, loc, tail = "") => [`\tfleet = {`, `\t\tname = "${name}"`, `\t\tnaval_base = ${base}${tail}`,
  `\t\ttask_force = {`, `\t\t\tname = "${name} TF"`, `\t\t\tlocation = ${loc}${tail}`,
  `\t\t\tship = { name = "${name} 1" definition = destroyer equipment = { destroyer_1 = { amount = 1 owner = CAN } } }`, `\t\t}`, `\t}`];
const unitsFile = (...fleets) => ["units = {", ...fleets.flat(), "}", ""];

// CRLF on purpose, and with the trailing comment vanilla writes beside a berth: a moved number under it must not lie.
const XXX = unitsFile(fleet("Halifax Escort", 44, 44, " # Halifax")).join("\r\n");
const DDD = unitsFile(fleet("Inland Flotilla", 46, 46)).join("\n");
const YYY = unitsFile(fleet("Cartel Boats", 47, 47)).join("\n");
const TWO = unitsFile(fleet("C One", 45, 45), fleet("S One", 47, 47), fleet("Far Out", 45, 62)).join("\n");
const SEA = unitsFile(fleet("At Sea", 63, 63)).join("\n");
const EVENTS = ["namespace = gift", "country_event = {", "\tid = gift.1", "\timmediate = {",
  '\t\tCCC = { load_oob = "XXX_gift" }', '\t\tDDD = { load_oob = "DDD_boats" }', '\t\tSSS = { load_oob = "YYY_boats" }',
  '\t\tCCC = { load_oob = "TWO_fleets" }', '\t\tEEE = { load_oob = "SEA_boats" }', "\t}", "}", ""].join("\n");

const GAME = tmp("game");
mk(GAME, "map/provinces.bmp", BMP);
mk(GAME, "map/definition.csv", definition((p) => p <= 48));
mk(GAME, "history/states/1.txt", state(1, [43, 44, 45], "CCC", [44]));
mk(GAME, "history/states/2.txt", state(2, [46], "DDD", [46]));
mk(GAME, "history/states/3.txt", state(3, [47], "MMM", [47]));
mk(GAME, "history/states/4.txt", state(4, [...range(1, 42), 48], "OOO", []));
for (const [f, body] of [["XXX_gift", XXX], ["DDD_boats", DDD], ["YYY_boats", YYY], ["TWO_fleets", TWO], ["SEA_boats", SEA]]) mk(GAME, `history/units/${f}.txt`, body);
mk(GAME, "events/gift.txt", EVENTS);

function writeMod(m) {
  mk(m, "descriptor.mod", 'name="later fleets"\nreplace_path="history/states"\n');
  mk(m, "map/definition.csv", definition((p) => p <= 56));
  mk(m, "history/states/1.txt", state(1, [43, 44, 45, 51], "CCC", [51, 43]));
  mk(m, "history/states/2.txt", state(2, [46], "DDD", []));
  mk(m, "history/states/3.txt", state(3, [47, 52], "SSS", [52]));
  mk(m, "history/states/4.txt", state(4, [48], "MMM", []));
  mk(m, "history/states/5.txt", state(5, [...range(1, 42), 49, 50, 53, 54, 55, 56], "OOO", []));
}
const MOD = tmp("mod"); writeMod(MOD);
const ctx = (modRoot) => ({ modRoot, gameRoot: GAME, dependencyRoots: [] });
const read = (root, f) => (fs.existsSync(path.join(root, "history", "units", f)) ? fs.readFileSync(path.join(root, "history", "units", f), "utf8") : "");
const nums = (s, k) => (s.match(new RegExp(k + "\\s*=\\s*(\\d+)", "g")) || []).map((x) => Number(x.replace(/\D/g, "")));

// ── 0. the geometry the answers depend on ───────────────────────────────────────────────────────────────────────────
console.log("=== THE CONTROLS ===");
{
  const model = md.buildMapModel(ctx(MOD));
  const coast = md.landProvincesTouchingSea({ ...ctx(MOD), model });
  rec("THE CONTROL: 43..47 have no sea beside them now; 51 and 52 do", [43, 44, 45, 46, 47].every((p) => !coast.has(p)) && coast.has(51) && coast.has(52),
    [43, 44, 45, 46, 47, 51, 52].map((p) => p + ":" + coast.has(p)));
  const c = md.provinceCentroids({ ...ctx(MOD), wanted: new Set([43, 44, 51]) });
  const d = (a, b) => (c.get(a).x - c.get(b).x) ** 2 + (c.get(a).z - c.get(b).z) ** 2;
  rec("THE CONTROL: the landlocked decoy 43 is nearer to 44 than the real harbour 51", d(44, 43) < d(44, 51), { d43: d(44, 43), d51: d(44, 51) });
}

// ── 1. what is found ────────────────────────────────────────────────────────────────────────────────────────────────
console.log("\n=== the fleets the scripts load ===");
const st1 = md.findUnitsStrandedByTheMap(ctx(MOD));
st1.laterFleets = st1.laterFleets || [];   // a finder without the field reads as finding nothing: a FAIL below, not a crash
const fl = st1.laterFleets.map((u) => `${u.file}:${u.province}:${u.tag}`).sort();
rec("⭐⭐⭐ the five task forces berthed on land with no sea are found, each with the country that holds its berth NOW",
  JSON.stringify(fl) === JSON.stringify(["DDD_boats.txt:46:DDD", "TWO_fleets.txt:45:CCC", "TWO_fleets.txt:47:SSS", "XXX_gift.txt:44:CCC", "YYY_boats.txt:47:SSS"]), fl);
rec("⭐⭐ …and the ones at sea are not (SEA_boats, and TWO_fleets' third task force)", !st1.laterFleets.some((u) => u.province === 62 || u.province === 63));
{
  // #a-fleet-loaded-where-the-map-took-the-sea — the mod's rows 0..5 are the map below's provinces (same id, same colour), and its
  // row 6 took row 5's sea: the berth the MOD's map cut off
  const all = (md.validateMapBitmap(ctx(MOD)) || []).filter((p) => /^fleet_loaded_on_land_/.test(p.rule));
  const rows = all.filter((p) => p.rule === "fleet_loaded_on_land_the_map_cut_off");
  const r = rows[0] || {};
  rec("⭐⭐⭐ fleet_loaded_on_land_the_map_cut_off: an ERROR, all five counted, the button offered — and no twin row beside it",
    all.length === 1 && rows.length === 1 && r.severity === "error" && r.total === 5 && r.autoFix === true, all.map((p) => ({ rule: p.rule, severity: p.severity, total: p.total, autoFix: p.autoFix })));
  rec("⭐⭐⭐ …and FATAL: the mod's map took the sea, and load_oob runs the start's own loader, so Save stops — its outcome \"untested\"",
    labels.isFatalRule("fleet_loaded_on_land_the_map_cut_off") === true && labels.fatalOutcome("fleet_loaded_on_land_the_map_cut_off") === "untested"
    && labels.isFatalRule("fleet_loaded_on_land_with_no_sea") === false);
  rec("⭐⭐ …it names the script that loads it, and never says it WILL crash", /events\/gift\.txt/.test(r.message || "") && !/will crash/i.test(r.message || ""), r.message);
  rec("⭐⭐ …and the started rule stays silent", !(md.validateMapBitmap(ctx(MOD)) || []).some((p) => p.rule === "fleet_starts_on_land_with_no_sea"));
}

// ── 2. the repair ───────────────────────────────────────────────────────────────────────────────────────────────────
console.log("\n=== the repair ===");
const r = md.fixDrownedFleetBerths(ctx(MOD));
rec("⭐⭐⭐ four re-berthed at a harbour, one to sea, five home bases with them",
  r.moved === 4 && r.toSea === 1 && r.rebased === 5, { moved: r.moved, toSea: r.toSea, rebased: r.rebased });
rec("⭐⭐ …copying in exactly the four files it changed, and naming them",
  (r.materialised || []).slice().sort().join() === "DDD_boats.txt,TWO_fleets.txt,XXX_gift.txt,YYY_boats.txt", r.materialised);
const x = read(MOD, "XXX_gift.txt");
rec("⭐⭐⭐ THE ASSERTION: CCC's gift lands on 51, its coastal harbour — not the nearer landlocked 43",
  nums(x, "location")[0] === 51 && nums(x, "naval_base")[0] === 51,
  { location: nums(x, "location"), naval_base: nums(x, "naval_base"), meaning: nums(x, "location")[0] === 43 ? "the decoy: a port with no sea" : "?" });
rec("⭐⭐⭐ …and the comment is made honest, its old text kept", /naval_base = 51\s+# Nova: moved from 44\s+# Halifax/.test(x) && /location = 51\s+# Nova: moved from 44\s+# Halifax/.test(x),
  x.split(/\r?\n/).filter((l) => /Nova:/.test(l)));
const endings = (s) => { let crlf = 0, lf = 0; for (let i = 0; i < s.length; i++) if (s[i] === "\n") { if (s[i - 1] === "\r") crlf++; else lf++; } return { crlf, lf }; };
rec("⭐⭐ …in a file that stays all CRLF", endings(x).lf === 0 && endings(x).crlf === endings(XXX).crlf, endings(x));
const y = read(MOD, "YYY_boats.txt");
rec("⭐⭐⭐ the cartel's boats go to 52, the harbour of SSS, which holds the berth now — not to sea for MMM, which held it below",
  nums(y, "location")[0] === 52 && nums(y, "naval_base")[0] === 52, { location: nums(y, "location"), naval_base: nums(y, "naval_base") });
const dd = read(MOD, "DDD_boats.txt");
rec("⭐⭐⭐ DDD has no coast left: its flotilla and its home base go to the nearest sea, 62", nums(dd, "location")[0] === 62 && nums(dd, "naval_base")[0] === 62,
  { location: nums(dd, "location"), naval_base: nums(dd, "naval_base") });
const two = read(MOD, "TWO_fleets.txt");
rec("⭐⭐⭐ one file, two countries: CCC's fleet goes to 51 and SSS's to 52, each to its own country's harbour",
  JSON.stringify(nums(two, "location")) === "[51,52,62]" && nums(two, "naval_base").slice(0, 2).join() === "51,52", { location: nums(two, "location"), naval_base: nums(two, "naval_base") });
rec("⭐⭐⭐ …and the third fleet's home base, whose country cannot be told, is left where it was and said",
  nums(two, "naval_base")[2] === 45 && (r.skipped || []).some((s) => s.file === "TWO_fleets.txt" && /naval_base 45/.test(s.reason)), { bases: nums(two, "naval_base"), skipped: r.skipped });
rec("⭐⭐ the fleet already at sea is untouched and not copied in", !fs.existsSync(path.join(MOD, "history", "units", "SEA_boats.txt")));
rec("⭐⭐ the base game's copies are unchanged", fs.readFileSync(path.join(GAME, "history", "units", "XXX_gift.txt"), "utf8") === XXX);

// ── 3. a second click, and the rule ─────────────────────────────────────────────────────────────────────────────────
console.log("\n=== a second click writes nothing ===");
{
  const before = ["XXX_gift.txt", "DDD_boats.txt", "YYY_boats.txt", "TWO_fleets.txt"].map((f) => read(MOD, f)).join("|");
  const r2 = md.fixDrownedFleetBerths(ctx(MOD));
  rec("⭐⭐⭐ it moves nothing and the bytes are identical", r2.moved === 0 && r2.toSea === 0 && r2.rebased === 0
    && ["XXX_gift.txt", "DDD_boats.txt", "YYY_boats.txt", "TWO_fleets.txt"].map((f) => read(MOD, f)).join("|") === before, r2);
  rec("⭐⭐⭐ the rule goes silent", !(md.validateMapBitmap(ctx(MOD)) || []).some((p) => /^fleet_loaded_on_land_/.test(p.rule)));
}

// ── 4. wired into the click ─────────────────────────────────────────────────────────────────────────────────────────
console.log("\n=== wired into Auto-fix all ===");
{
  const m2 = tmp("click"); writeMod(m2);
  const fx = (md.autoFixMap(ctx(m2)) || {}).fixes || {};
  rec("⭐⭐⭐ one click on Auto-fix all re-berths them", ((fx.fleetBerths || {}).moved || 0) === 4 && ((fx.fleetBerths || {}).toSea || 0) === 1, fx.fleetBerths);
  rec("⭐⭐ …CCC's gift on 51", fs.existsSync(path.join(m2, "history", "units", "XXX_gift.txt")) && nums(read(m2, "XXX_gift.txt"), "location")[0] === 51, null);
}

for (const d of tmps) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} }
console.log(`\n=== a fleet a script loads later is berthed where it can reach the sea: ${pass + fails.length} checks, ${fails.length} failed ===`);
if (fails.length) { for (const f of fails) console.log("   FAILED: " + f); process.exit(1); }
assert.ok(pass > 0);
