// ⛔ #a-berth-the-mods-own-file-gives-is-judged-by-the-map — A UNIT THE MOD'S OWN ORDER OF BATTLE PLACES IS JUDGED BY THE MAP ALONE.
//
// THE DEFECT (review of the merged map editor, crash-world F1 + F2, page-honesty F1). findUnitsStrandedByTheMap judged a started unit
// only against the layer below: a fleet on land with no sea only where the base game had sea at or beside that id, a division on
// water only where the base game had land. That excuse is right for an INHERITED berth (what a mod inherits broken is not its to
// fix) and wrong for a berth the mod's own file gives: Nova's own repairs write exactly those — a fleet re-berthed at a harbour that
// was a base-game inland province the new land made coastal, or at a cut piece the base game has no id for; a division moved onto
// land raised from the base game's sea. A later Nova step (a re-roll, a second Generate land, an inspector edit) takes that coast or
// that land away, and nothing judged the berth again. Measured on the review's re-roll of the owner's TEST 37 (seed 2, 35%): 86
// started task forces on land with no sea — Japan's whole 1936 home fleet at 7187, "# Nova: moved from 9998" — and 1,225 of 4,571
// started divisions on water, every one in the mod's own files; Map Errors, the Save gate, Auto-fix and Generate land's crash
// repair all said nothing, because each of them reads this one search.
//
// THE RULE NOW. The excuse covers an inherited berth only: a unit in a file of a layer below, or in the mod's copy of one where the
// same-named file below places a unit of its kind on that same province (a copy Nova made to move another unit, which left this one
// as it was). Every other berth in the mod's own files is the mod's, and is judged by the mod's map alone.
//
// THE FIXTURE (8x8 provinces of 32 px, ids 1..64 by row; row r holds 8r+1 .. 8r+8, and two pieces the base game has no id for):
//   below  land rows 0-2 (1..24): row 2 (17..24) is the coast, rows 0-1 inland. AAA owns it with a harbour on 20.
//          AAA_naval  "Home Fleet" (home 20, "Bay Squadron" on 20)  ·  "Old Fleet" (home 6, "Old Hulk" on 6 — land with no sea below too)
//          AAA_1936   "Home Guard" on 2 (land)  ·  "Sailors" on 40 (sea below too)
//          BBB_naval  "Hill Fleet" (home 7, "Hill Squadron" on 7 — inland below too), a file the mod never copies
//   mod    a world after a re-roll: land rows 0-3 (1..32), row 3 the coast now, AAA's harbour on 28; piece 65 cut out of 4 (land, no
//          sea), piece 66 cut out of 50 (sea). Its own AAA_naval keeps the base game's two fleets as they were and adds what Nova's
//          repairs wrote: "Re-berthed Fleet" home 12 with a task force on 12 ("# Nova: moved from 20") — inland below, inland now — and
//          "Piece Squadron" on 65. Its own AAA_1936 keeps the base game's two divisions and adds "Raised Guard" on 44 (sea below, sea
//          again now) and "Piece Guard" on 66.
"use strict";
const assert = require("assert");
const fs = require("fs"), os = require("os"), path = require("path");

const APPDATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "nova-ownberth-appdata-"));
process.env.NOVA_APP_DATA_DIR = APPDATA_DIR;
process.env.APPDATA = APPDATA_DIR;
process.env.XDG_CONFIG_HOME = APPDATA_DIR;
process.env.NOVA_HOME_DIR = APPDATA_DIR;
const md = require("./map-data.js");
const labels = require("./public/map-rule-labels.js");

let pass = 0;
const fails = [];
const rec = (name, cond, detail) => {
  if (cond) { console.log("  ok   " + name); pass++; }
  else { console.log("  FAIL " + name + (detail === undefined ? "" : "   -> " + JSON.stringify(detail).slice(0, 500))); fails.push(name); }
};
const tmps = [APPDATA_DIR];
const tmp = (t) => { const d = fs.mkdtempSync(path.join(os.tmpdir(), "nova-ownberth-" + t + "-")); tmps.push(d); return d; };
const mk = (root, rel, body) => { const p = path.join(root, ...rel.split("/")); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, body); };

function bmp24(w, h, fn) {
  const rs = (w * 3 + 3) & ~3, is = rs * h; const b = Buffer.alloc(54 + is);
  b.write("BM", 0, "ascii"); b.writeUInt32LE(54 + is, 2); b.writeUInt32LE(54, 10); b.writeUInt32LE(40, 14);
  b.writeInt32LE(w, 18); b.writeInt32LE(h, 22); b.writeUInt16LE(1, 26); b.writeUInt16LE(24, 28); b.writeUInt32LE(is, 34);
  for (let y = 0; y < h; y++) { let o = 54 + (h - 1 - y) * rs; for (let x = 0; x < w; x++) { const [r, g, bl] = fn(x, y); b[o++] = bl; b[o++] = g; b[o++] = r; } }
  return b;
}
const cellAt = (x, y) => Math.floor(x / 32) + Math.floor(y / 32) * 8 + 1;
const COL = (p) => [((p * 29) % 210) + 15, ((p * 67) % 210) + 15, ((p * 101) % 210) + 15];
// the pieces: a 16x16 block inside cell 4 (row 0, x 96..127) and inside cell 50 (row 6, x 32..63, y 192..223)
const PIECES = { 65: { cell: 4, x0: 104, y0: 8 }, 66: { cell: 50, x0: 40, y0: 200 } };
const provAt = (pieces) => (x, y) => {
  if (pieces) for (const [id, p] of Object.entries(PIECES)) if (x >= p.x0 && x < p.x0 + 16 && y >= p.y0 && y < p.y0 + 16) return +id;
  return cellAt(x, y);
};
const definition = (n, isLand) => {
  const rows = ["0;0;0;0;land;false;unknown;0"];
  for (let p = 1; p <= n; p++) {
    const [r, g, b] = COL(p), land = isLand(p);
    rows.push(`${p};${r};${g};${b};${land ? "land" : "sea"};false;${land ? "plains" : "ocean"};${land ? 1 : 0}`);
  }
  return rows.join("\n") + "\n";
};
const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
const state = (id, provs, owner, harbours) =>
  `state = {\n\tid = ${id}\n\tname = "STATE_${id}"\n\tmanpower = 1000\n\tstate_category = rural\n\tprovinces = { ${provs.join(" ")} }\n`
  + `\thistory = {\n\t\towner = ${owner}\n\t\tbuildings = {\n\t\t\tinfrastructure = 2\n`
  + (harbours || []).map((p) => `\t\t\t${p} = { naval_base = 3 }\n`).join("") + `\t\t}\n\t}\n}\n`;
const ship = (n, tag) => `ship = { name = "${n}" definition = destroyer equipment = { destroyer_1 = { amount = 1 owner = ${tag} } } }`;
const fleet = (tag, name, base, tfName, loc, tail = "") => [`\tfleet = {`, `\t\tname = "${name}"`, `\t\tnaval_base = ${base}${tail}`,
  `\t\ttask_force = {`, `\t\t\tname = "${tfName}"`, `\t\t\tlocation = ${loc}${tail}`, `\t\t\t${ship(tfName + " 1", tag)}`, `\t\t}`, `\t}`];
const division = (name, loc, tail = "") => `\tdivision = {\n\t\tname = "${name}"\n\t\tlocation = ${loc}${tail}\n\t\tdivision_template = "Inf"\n\t}`;
const TEMPLATE = 'division_template = {\n\tname = "Inf"\n\tregiments = {\n\t\tinfantry = { x = 0 y = 0 }\n\t}\n}\n';

const BASE_NAVAL = ["units = {", ...fleet("AAA", "Home Fleet", 20, "Bay Squadron", 20), ...fleet("AAA", "Old Fleet", 6, "Old Hulk", 6), "}", ""];
const BASE_ARMY = [TEMPLATE + "units = {", division("Home Guard", 2), division("Sailors", 40), "}", ""];
function writeGame(g) {
  mk(g, "map/provinces.bmp", bmp24(256, 256, (x, y) => COL(provAt(false)(x, y))));
  mk(g, "map/definition.csv", definition(64, (p) => p <= 24));
  mk(g, "history/states/1.txt", state(1, range(1, 24), "AAA", [20]));
  mk(g, "history/countries/AAA - Aland.txt", 'capital = 1\noob = "AAA_1936"\nset_naval_oob = "AAA_naval"\n');
  mk(g, "history/countries/BBB - Bland.txt", 'capital = 2\nset_naval_oob = "BBB_naval"\n');
  mk(g, "history/units/AAA_naval.txt", BASE_NAVAL.join("\n"));
  mk(g, "history/units/AAA_1936.txt", BASE_ARMY.join("\n"));
  mk(g, "history/units/BBB_naval.txt", ["units = {", ...fleet("BBB", "Hill Fleet", 7, "Hill Squadron", 7), "}", ""].join("\n"));
  // two orders of battle an event loads mid-game (#a-script-loads-an-army-later): a fleet on the coast, a division on AAA's land
  mk(g, "events/gift.txt", 'gift.1 = {\n\timmediate = { AAA = { load_oob = "AAA_gift" load_oob = "AAA_later" } }\n}\n');
  mk(g, "history/units/AAA_gift.txt", ["units = {", ...fleet("AAA", "Gift Fleet", 20, "Gift Squadron", 20), "}", ""].join("\n"));
  mk(g, "history/units/AAA_later.txt", [TEMPLATE + "units = {", division("Exile", 3), "}", ""].join("\n"));
  return g;
}
// The mod's own AAA_naval is CRLF and its AAA_1936 LF, as a copy and a hand-made file can be.
const MOD_NAVAL = ["units = {", ...fleet("AAA", "Home Fleet", 20, "Bay Squadron", 20), ...fleet("AAA", "Old Fleet", 6, "Old Hulk", 6),
  ...fleet("AAA", "Re-berthed Fleet", 12, "Re-berthed Squadron", 12, "    # Nova: moved from 20"),
  ...fleet("AAA", "Piece Fleet", 28, "Piece Squadron", 65), ...fleet("AAA", "Lone Home Fleet", 13, "Lone Squadron", 28), "}", ""].join("\r\n");
const MOD_ARMY = [TEMPLATE + "units = {", division("Home Guard", 2), division("Sailors", 40), division("Raised Guard", 44), division("Piece Guard", 66), "}", ""].join("\n");
function writeMod(m) {
  mk(m, "descriptor.mod", 'name="own berths"\nreplace_path="history/states"\n');
  mk(m, "map/provinces.bmp", bmp24(256, 256, (x, y) => COL(provAt(true)(x, y))));
  mk(m, "map/definition.csv", definition(66, (p) => p <= 32 || p === 65));
  mk(m, "history/states/1.txt", state(1, [...range(1, 8), ...range(17, 32), 65], "AAA", [28]));
  mk(m, "history/states/2.txt", state(2, range(9, 16), "BBB", []));
  mk(m, "history/units/AAA_naval.txt", MOD_NAVAL);
  mk(m, "history/units/AAA_1936.txt", MOD_ARMY);
  // …and the mod's copies of the two loaded ones, as Nova's repairs left them in the world before: the fleet re-berthed on 5 (inland
  // below, inland now), the division moved onto 45 (sea below, sea again now)
  mk(m, "history/units/AAA_gift.txt", ["units = {", ...fleet("AAA", "Gift Fleet", 5, "Gift Squadron", 5, "    # Nova: moved from 20"), "}", ""].join("\n"));
  mk(m, "history/units/AAA_later.txt", [TEMPLATE + "units = {", division("Exile", 45), "}", ""].join("\n"));
  return m;
}
const GAME = writeGame(tmp("game"));
const ctx = (modRoot) => ({ modRoot, gameRoot: GAME, dependencyRoots: [] });
const read = (root, f) => { const p = path.join(root, "history", "units", f); return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : ""; };
const at = (us) => us.map((u) => `${u.name}@${u.province}`).sort();
const locOf = (text, name) => { const i = text.indexOf(`name = "${name}"`); const m = i < 0 ? null : /location = (\d+)/.exec(text.slice(i)); return m ? +m[1] : null; };
const homeOf = (text, name) => { const i = text.indexOf(`name = "${name}"`); const m = i < 0 ? null : /naval_base = (\d+)/.exec(text.slice(i)); return m ? +m[1] : null; };
const FLEET = "fleet_starts_on_land_with_no_sea", DIV = "division_starts_on_water", HOMES = "fleet_home_port_has_no_sea";

console.log("=== THE CONTROLS: the fixture is the shape it claims ===");
{
  const M0 = writeMod(tmp("control"));
  const model = md.buildMapModel(ctx(M0));
  const coast = md.landProvincesTouchingSea({ ...ctx(M0), model });
  rec("THE CONTROL: 12, 20, 6, 7 and the piece 65 are land with no sea now; 28 is the coast", [12, 20, 6, 7, 65].every((p) => !coast.has(p)) && coast.has(28),
    [12, 20, 6, 7, 65, 28].map((p) => `${p}:${coast.has(p)}`));
  const type = new Map(model.provinces.map((p) => [+p.id, p.type]));
  rec("THE CONTROL: 40, 44 and the piece 66 are sea now", [40, 44, 66].every((p) => type.get(p) === "sea"), [40, 44, 66].map((p) => `${p}:${type.get(p)}`));
  const below = md.buildMapModel({ modRoot: GAME, gameRoot: GAME, dependencyRoots: [] });
  const btype = new Map(below.provinces.map((p) => [+p.id, p.type]));
  rec("THE CONTROL: below, 12, 6 and 7 are land inland of the coast row (17..24), 40 and 44 are sea, and 65 and 66 are no province at all",
    [12, 6, 7].every((p) => btype.get(p) === "land") && [40, 44].every((p) => btype.get(p) === "sea") && !btype.has(65) && !btype.has(66), [...btype].length);
  const units = md.startingUnitLocations({ ...ctx(M0), model });
  const written = [read(M0, "AAA_naval.txt"), read(M0, "AAA_1936.txt"), read(GAME, "BBB_naval.txt")].reduce((n, t) => n + (t.match(/\b(task_force|division) = \{/g) || []).length, 0);
  rec(`THE CONTROL: the started units are the ${written} the mod's own two files and the base game's BBB_naval place`,
    units.filter((u) => u.kind !== "fleet_home").length === written && new Set(units.map((u) => u.file)).size === 3, at(units));
}

console.log("\n=== 1. the search ===");
const MOD = writeMod(tmp("mod"));
{
  const st = md.findUnitsStrandedByTheMap(ctx(MOD));
  rec("⭐⭐⭐ a fleet the mod's own file berths on land that was inland below too, and has no sea now, is found (Re-berthed Squadron, 12)",
    at(st.fleets).includes("Re-berthed Squadron@12"), at(st.fleets));
  rec("⭐⭐⭐ …and one on a piece the base game has no id for (Piece Squadron, 65)", at(st.fleets).includes("Piece Squadron@65"), at(st.fleets));
  rec("⭐⭐ …beside the one the layer-below rule always found (Bay Squadron, 20 — a coast below)", at(st.fleets).includes("Bay Squadron@20"), at(st.fleets));
  rec("⭐⭐⭐ THE CONTROL: an inherited berth keeps its excuse in the mod's own copy of its file (Old Hulk, 6 — land with no sea below too)",
    !at(st.fleets).some((x) => /Old Hulk/.test(x)), at(st.fleets));
  rec("⭐⭐⭐ THE CONTROL: …and in a file of the layer below that the mod never copied (Hill Squadron, 7)", !at(st.fleets).some((x) => /Hill/.test(x)), at(st.fleets));
  rec("⭐ exactly those three fleets", st.fleets.length === 3, at(st.fleets));
  rec("⭐⭐⭐ a division the mod's own file stands on a province that was sea below and is sea now is found (Raised Guard, 44)",
    at(st.divisions).includes("Raised Guard@44"), at(st.divisions));
  rec("⭐⭐⭐ …and one on a sea piece the base game has no id for (Piece Guard, 66)", at(st.divisions).includes("Piece Guard@66"), at(st.divisions));
  rec("⭐⭐⭐ THE CONTROL: the base game's own division at sea keeps its excuse in the mod's copy (Sailors, 40), and land is land (Home Guard, 2)",
    !at(st.divisions).some((x) => /Sailors|Home Guard/.test(x)) && st.divisions.length === 2, at(st.divisions));
  rec("⭐⭐ the home ports the mod's own file gives on that land are found (Re-berthed Fleet 12, Lone Home Fleet 13 — its task force in port), the inherited one is not (Old Fleet, 6)",
    at(st.fleetHomes).includes("Re-berthed Fleet@12") && at(st.fleetHomes).includes("Lone Home Fleet@13") && !at(st.fleetHomes).some((x) => /Old Fleet|Hill Fleet/.test(x)), at(st.fleetHomes));
  rec("⭐⭐⭐ a fleet an event loads, re-berthed by the mod's own file on land with no sea (Gift Squadron, 5), is found — and not as a berth the map cut off",
    at(st.laterFleets).join() === "Gift Squadron@5" && st.laterFleets[0].ownBerth === true && st.laterFleets[0].cutOff === false, st.laterFleets.map((u) => ({ at: `${u.name}@${u.province}`, own: u.ownBerth, cutOff: u.cutOff })));
  rec("⭐⭐⭐ a division an event loads, placed by the mod's own file on water that was sea below too (Exile, 45), is found",
    at(st.laterDivisions).join() === "Exile@45" && st.laterDivisions[0].ownBerth === true, at(st.laterDivisions));
  rec("⭐⭐⭐ …with the country the same-named file below gave it — AAA, owner of 3 below, where the base game put it — not nobody",
    st.laterDivisions.length === 1 && st.laterDivisions[0].tag === "AAA", st.laterDivisions.map((u) => u.tag));
  rec("⭐ each unit found only because its berth is the mod's own says so (ownBerth), and the layer-below one does not",
    st.fleets.filter((u) => u.ownBerth).map((u) => u.province).sort((a, b) => a - b).join() === "12,65"
      && st.divisions.every((u) => u.ownBerth) && !st.fleets.find((u) => u.province === 20).ownBerth,
    st.fleets.map((u) => `${u.province}:${!!u.ownBerth}`));
}

console.log("\n=== 2. Map Errors and the Save gate ===");
{
  const probs = md.validateMapBitmap(ctx(MOD)) || [];
  const f = probs.find((p) => p.rule === FLEET), d = probs.find((p) => p.rule === DIV);
  rec("⭐⭐⭐ fleet_starts_on_land_with_no_sea counts all three, as an error in the FATAL set the Save gate stops on",
    !!f && f.total === 3 && f.severity === "error" && labels.isFatalRule(FLEET), f && { total: f.total, severity: f.severity });
  rec("⭐⭐ …with Auto-fix offered for them", !!f && f.autoFix === true && f.movable === 3, f && { autoFix: f.autoFix, movable: f.movable });
  const fm = String((f || {}).message || "");
  rec("⭐⭐ …and saying which berths are the mod's own files', not that the map below had sea at all of them",
    /For 1 of them the map your mod builds on had sea there or beside it, and your map edits took it away\. The other 2 are berthed there by your mod's own order-of-battle files, where the files below berth no fleet/.test(fm)
      && !/(^|\. )The map your mod builds on had sea there or beside it/.test(fm), fm.slice(0, 700));
  rec("⭐⭐⭐ division_starts_on_water counts both", !!d && d.total === 2 && d.severity === "warning", d && { total: d.total, severity: d.severity });
  const dm = String((d || {}).message || "");
  rec("⭐⭐ …and does not say the map below had land where it had sea", !!d && !/had land there/.test(dm)
    && /They are placed there by your mod's own order-of-battle files, where the files below place no division, so the berth is your mod's own — and that province is water now\./.test(dm), dm.slice(0, 700));
  const h = probs.find((p) => p.rule === HOMES);
  rec("⭐ fleet_home_port_has_no_sea counts the three homes (20 from the layer below, 12 and 13 the mod's own)", !!h && h.total === 3, h && h.total);
  const lf = probs.find((p) => p.rule === "fleet_loaded_on_land_with_no_sea"), cut = probs.find((p) => p.rule === "fleet_loaded_on_land_the_map_cut_off");
  rec("⭐⭐ the loaded fleet is an error with Auto-fix offered, under the rule for a berth that is the mod's own shape", !!lf && lf.total === 1 && lf.severity === "error" && lf.autoFix === true && !cut,
    { own: lf && { total: lf.total, autoFix: lf.autoFix }, cut: cut && cut.total });
  rec("⭐ …saying where its berth came from", /It is berthed there by your mod's own order-of-battle files/.test(String((lf || {}).message || "")), String((lf || {}).message || "").slice(0, 400));
  const ld = probs.find((p) => p.rule === "division_loaded_on_water");
  rec("⭐⭐ the loaded division is reported with Auto-fix offered, its country known", !!ld && ld.total === 1 && ld.movable === 1 && ld.autoFix === true, ld && { total: ld.total, movable: ld.movable });
}

console.log("\n=== 3. Generate land's crash repair (fatal only) re-berths them ===");
{
  const M3 = writeMod(tmp("crash"));
  const r = md.fixDrownedFleetBerths({ ...ctx(M3), fatalOnly: true });
  const a = read(M3, "AAA_naval.txt");
  rec("⭐⭐⭐ the three started fleets on land with no sea, and the loaded one, go to AAA's harbour on 28",
    ["Bay Squadron", "Re-berthed Squadron", "Piece Squadron"].every((n) => locOf(a, n) === 28) && locOf(read(M3, "AAA_gift.txt"), "Gift Squadron") === 28 && r.moved === 4,
    { moved: r.moved, locs: ["Bay Squadron", "Re-berthed Squadron", "Piece Squadron"].map((n) => locOf(a, n)), gift: locOf(read(M3, "AAA_gift.txt"), "Gift Squadron") });
  rec("THE CONTROL: Old Hulk is untouched", locOf(a, "Old Hulk") === 6, locOf(a, "Old Hulk"));
  rec("THE CONTROL: the file stays all CRLF", !/[^\r]\n/.test(a));
  rec("⭐⭐ the search finds no fleet on land with no sea after it", md.findUnitsStrandedByTheMap(ctx(M3)).fleets.length === 0, at(md.findUnitsStrandedByTheMap(ctx(M3)).fleets));
}

console.log("\n=== 4. Auto-fix's two repairs ===");
{
  const fr = md.fixDrownedFleetBerths(ctx(MOD));
  const dr = md.fixDrownedDivisions(ctx(MOD));
  const a = read(MOD, "AAA_naval.txt"), d = read(MOD, "AAA_1936.txt");
  rec("⭐⭐⭐ every stranded task force is re-berthed at 28, and every home port it named", ["Bay Squadron", "Re-berthed Squadron", "Piece Squadron"].every((n) => locOf(a, n) === 28)
    && homeOf(a, "Home Fleet") === 28 && homeOf(a, "Re-berthed Fleet") === 28, { moved: fr.moved, rebased: fr.rebased });
  rec("⭐⭐ …and the home port no stranded task force stands on goes to the harbour too (Lone Home Fleet, 13), its task force untouched",
    homeOf(a, "Lone Home Fleet") === 28 && locOf(a, "Lone Squadron") === 28 && /naval_base = 28\s+# Nova: moved from 13/.test(a), [homeOf(a, "Lone Home Fleet"), locOf(a, "Lone Squadron")]);
  rec("⭐⭐ …each moved line saying where it came from", /location = 28\s+# Nova: moved from 12/.test(a) && /location = 28\s+# Nova: moved from 65/.test(a), a.split(/\r?\n/).filter((l) => /Nova:/.test(l)));
  rec("THE CONTROL: the inherited fleet keeps its berth and its home (Old Hulk, 6)", locOf(a, "Old Hulk") === 6 && homeOf(a, "Old Fleet") === 6);
  rec("THE CONTROL: the base game's BBB_naval is never copied in", !fs.existsSync(path.join(MOD, "history", "units", "BBB_naval.txt")));
  const landOfAAA = new Set([...range(1, 8), ...range(17, 32), 65]);
  rec("⭐⭐⭐ both drowned divisions are moved onto AAA's land, and the loaded one too", landOfAAA.has(locOf(d, "Raised Guard")) && landOfAAA.has(locOf(d, "Piece Guard"))
    && landOfAAA.has(locOf(read(MOD, "AAA_later.txt"), "Exile")) && dr.moved === 3 && dr.later.moved === 1,
    { moved: dr.moved, later: dr.later, raised: locOf(d, "Raised Guard"), piece: locOf(d, "Piece Guard"), exile: locOf(read(MOD, "AAA_later.txt"), "Exile") });
  rec("⭐⭐ the loaded fleet is re-berthed at 28", locOf(read(MOD, "AAA_gift.txt"), "Gift Squadron") === 28 && homeOf(read(MOD, "AAA_gift.txt"), "Gift Fleet") === 28,
    [locOf(read(MOD, "AAA_gift.txt"), "Gift Squadron"), homeOf(read(MOD, "AAA_gift.txt"), "Gift Fleet")]);
  rec("THE CONTROL: the inherited division at sea and the one on land stay where they were (Sailors 40, Home Guard 2)", locOf(d, "Sailors") === 40 && locOf(d, "Home Guard") === 2);
  const st = md.findUnitsStrandedByTheMap(ctx(MOD));
  rec("⭐⭐⭐ the search is silent afterwards: no fleet on land with no sea, no division on water, no home port without one — started or loaded",
    st.fleets.length === 0 && st.divisions.length === 0 && st.fleetHomes.length === 0 && st.laterFleets.length === 0 && st.laterDivisions.length === 0,
    { fleets: at(st.fleets), divisions: at(st.divisions), homes: at(st.fleetHomes), later: at(st.laterFleets.concat(st.laterDivisions)) });
  const probs = (md.validateMapBitmap(ctx(MOD)) || []).filter((p) => [FLEET, DIV, HOMES, "fleet_loaded_on_land_with_no_sea", "division_loaded_on_water"].includes(p.rule));
  rec("⭐⭐ …and so is Map Errors", probs.length === 0, probs.map((p) => `${p.rule} ${p.total}`));
  const again = md.fixDrownedFleetBerths(ctx(MOD)), again2 = md.fixDrownedDivisions(ctx(MOD));
  rec("⭐ a second click moves nothing", again.moved === 0 && again.rebased === 0 && again2.moved === 0 && read(MOD, "AAA_naval.txt") === a && read(MOD, "AAA_1936.txt") === d,
    { moved: again.moved, rebased: again.rebased, div: again2.moved });
}

for (const d of tmps) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} }
console.log(`\n=== a berth the mod's own file gives is judged by the map: ${pass + fails.length} checks, ${fails.length} failed ===`);
if (fails.length) { for (const f of fails) console.log("   FAILED: " + f); process.exit(1); }
assert.ok(pass > 0);
