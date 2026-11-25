// Auto-fix re-homes only the map/buildings.txt rows building_wrong_state reports: a row the layer below already keys to a state
// that does not hold the land under it is left where it is, and that layer's buildings.txt is not copied into the mod.
// #auto-fix-leaves-a-building-row-the-mod-inherited
//
// THE DEFECT. building_wrong_state reports a row standing on another state's land only when the layer below did not already have
// that exact problem (buildingProblemIsTheModsOwn, keyed from:province). fixBuildingsTxtPlacement - the last pass of every Auto-fix
// click, and autoFixMap is its only caller - re-homed every such row whoever shipped it, and trimmed the trailing newline of a
// buildings.txt it only inherited, so one click copied the layer's whole file into the mod to change rows no rule had named.
// fixStatesWithoutBuildingSlots counts each state's sites by that same re-home list, so it counted a re-home of the layer's row too.
//
// MEASURED on 94ef834, whose fixBuildingsTxtPlacement, buildingsTxtPlacementScan and fixStatesWithoutBuildingSlots are unchanged
// from 21808ba, with the fixtures below - 7 of 22 checks failed:
//   1. an add-on over a game with one stale row: the validator reported nothing, a dry run planned { rehomed 1, trimmed 1 }, and
//      one Auto-fix click wrote map/buildings.txt (materialized: true) beside the add-on's own state file.
//   2. an add-on moving province 4 into state 2: the fixer planned 4 re-homes - the add-on's 3 and the game's stale arms factory.
//   3. the game's only air-base row for state 2 keyed to state 1: the click re-homed the game's row instead of leaving it.
// On the six shipping maps the fixer plans 0 re-homes and 0 trims (a dry run with each as the map being edited), so no installed
// map shows it; a dependency carrying one stale row does, and so does any buildings.txt that ends in a newline
// (ensureBuildingSlotsForState writes one).
//
// THE FIX. One predicate, placementIsTheModsOwn, answers for the rule and the fixer. fixBuildingsTxtPlacement applies only the
// re-homes it answers yes for and trims only a file the mod ships or is writing anyway; fixStatesWithoutBuildingSlots counts by
// that same list, so a state the add-on answers for still gets its own site in the same click (section 3).
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (ok || detail == null ? "" : "   -> " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 360)));
  if (!ok) fails.push(label);
};

const HOME = fs.mkdtempSync(path.join(os.tmpdir(), "nova-inhrehome-home-"));
process.env.NOVA_HOME_DIR = HOME;
const md = require("./map-data.js");
const tmps = [HOME];

function dir(tag, files) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "nova-inhrehome-" + tag + "-")); tmps.push(d);
  for (const [rel, body] of Object.entries(files)) {
    const p = path.join(d, ...rel.split("/"));
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, body);
  }
  return d;
}
function bmp24(W, H, fn) {
  const rs = Math.floor((24 * W + 31) / 32) * 4, size = 54 + rs * H, b = Buffer.alloc(size);
  b.write("BM", 0, "ascii"); b.writeUInt32LE(size, 2); b.writeUInt32LE(54, 10); b.writeUInt32LE(40, 14);
  b.writeInt32LE(W, 18); b.writeInt32LE(H, 22); b.writeUInt16LE(1, 26); b.writeUInt16LE(24, 28); b.writeUInt32LE(rs * H, 34);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const [r, g, bl] = fn(x, y); const o = 54 + (H - 1 - y) * rs + x * 3; b[o] = bl; b[o + 1] = g; b[o + 2] = r; }
  return b;
}
// Every file under a directory, relative path -> sha1. NOTHING is skipped: this used to drop the sibling .bak
// copies a writer left beside each file, and a file the comparison cannot see is a file a writer can add for
// free. There are none to skip now. #a-backup-must-not-ship-with-the-mod
function tree(d, base = d, out = {}) {
  if (!fs.existsSync(d)) return out;
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) tree(p, base, out);
    else out[path.relative(base, p).replace(/\\/g, "/")] = crypto.createHash("sha1").update(fs.readFileSync(p)).digest("hex");
  }
  return out;
}
const written = (a, b) => Object.keys(b).filter((k) => a[k] !== b[k]).sort();

// 256x256: a sea strip on top (1); under it land 2 on the left (state 2) and, on the right, land 3 on the sea over land 4 (state 1).
const W = 256, H = 256;
const COL = { 1: [0, 0, 200], 2: [200, 0, 0], 3: [0, 200, 0], 4: [200, 200, 0] };
const provAt = (x, y) => (y < 64 ? 1 : x < 128 ? 2 : y < 160 ? 3 : 4);
const Z = (py) => (H - 1 - py).toFixed(2);   // a row's z for the pixel row py: buildingZToPixelY(H, z) = H - 1 - floor(z)
const row = (state, type, px, py, anchor = 0) => `${state};${type};${px.toFixed(2)};9.50;${Z(py)};0.00;${anchor}`;
const st = (id, provs, manpower = 1000) => `state={\n\tid=${id}\n\tname="STATE_${id}"\n\tmanpower = ${manpower}\n\tstate_category = rural\n\tprovinces={ ${provs} }\n}\n`;
const MAP = {
  "map/provinces.bmp": bmp24(W, H, (x, y) => COL[provAt(x, y)]),
  "map/definition.csv": ["0;0;0;0;land;false;unknown;0", "1;0;0;200;sea;false;ocean;0", "2;200;0;0;land;true;plains;1", "3;0;200;0;land;true;plains;1", "4;200;200;0;land;false;plains;1"].join("\r\n") + "\r\n",
};
const PORTS = [row(1, "naval_base_spawn", 192, 64, 1), row(2, "naval_base_spawn", 64, 64, 1)];   // provinces 3 and 2, facing sea 1
const STALE = row(1, "arms_factory", 40, 200);     // keyed to state 1, standing on province 2 - state 2's land - in the game itself
const GAME = dir("game", Object.assign({
  "map/buildings.txt": [
    row(1, "air_base", 192, 208), row(1, "rocket_site_spawn", 196, 208), row(1, "industrial_complex", 200, 220),   // on province 4
    row(2, "air_base", 64, 160), row(2, "rocket_site_spawn", 68, 160),                                           // on province 2
    ...PORTS, STALE,
  ].join("\n") + "\n",
  "history/states/1-East.txt": st(1, "3 4"),
  "history/states/2-West.txt": st(2, "2"),
}, MAP));
const opts = (modRoot, gameRoot = GAME) => ({ modRoot, gameRoot, dependencyRoots: [] });
const byRule = (modRoot, rule, gameRoot = GAME) => md.validateMapBitmap(opts(modRoot, gameRoot)).filter((p) => p.rule === rule);
const wrongState = (modRoot, gameRoot = GAME) => byRule(modRoot, "building_wrong_state", gameRoot).map((p) => p.stateId + ":" + p.provinceId).sort();
const noSite = (modRoot, gameRoot = GAME) => byRule(modRoot, "state_no_air_base_or_rocket_site", gameRoot).flatMap((p) => p.states || []).sort();
// The rows the game will read: the mod's buildings.txt when it ships one, else the game layer's.
const rowsOf = (modRoot, gameRoot = GAME) => {
  const own = path.join(modRoot, "map", "buildings.txt");
  return fs.readFileSync(fs.existsSync(own) ? own : path.join(gameRoot, "map", "buildings.txt"), "utf8").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
};
const keyedAt = (modRoot, type, px, py, gameRoot = GAME) => rowsOf(modRoot, gameRoot)
  .filter((l) => { const c = l.split(";"); return c[1] === type && c[2] === px.toFixed(2) && c[4] === Z(py); }).map((l) => l.split(";")[0]);

try {
  console.log("\n=== THE CONTROL: the game ships a row keyed to a state that does not hold the land under it ===");
  rec("the game, judged as the map being edited, reports its arms factory keyed to state 1 on province 2", JSON.stringify(wrongState(GAME, GAME)) === '["1:2"]', wrongState(GAME, GAME));

  console.log("\n=== 1. an add-on over it: the game's row is neither reported nor re-homed, and its buildings.txt is not copied in ===");
  {
    const files = { "descriptor.mod": 'name="Addon"\n', "history/states/1-East.txt": st(1, "3 4", 0) };
    const a = dir("addon", files);
    rec("THE CONTROL: the validator tells the add-on nothing about that row (building_wrong_state's gate)", wrongState(a).length === 0, wrongState(a));
    const dry = md.fixBuildingsTxtPlacement({ ...opts(a), dryRun: true });
    rec("⭐⭐⭐ fixBuildingsTxtPlacement plans no re-home of it", !!dry && !dry.error && (dry.rehomed || 0) === 0, dry);
    rec("⭐⭐ …and no trim of a buildings.txt the add-on does not ship", !!dry && !dry.error && (dry.trimmed || 0) === 0, dry);
    const real = md.fixBuildingsTxtPlacement(opts(a));
    rec("⭐⭐⭐ …so a real call copies no buildings.txt into the add-on", !!real && !real.error && !fs.existsSync(path.join(a, "map")), real);

    const c = dir("click", files);
    const t0 = tree(c);
    const r1 = md.autoFixMap(opts(c));
    rec("the click ran every fixer — it was not 'nothing to fix'", !!r1 && r1.ok === true && !r1.nothingToFix, r1 && (r1.error || r1.note));
    rec("…and repaired the add-on's own problem", ((r1.fixes || {}).noManpower || {}).fixed === 1, (r1.fixes || {}).noManpower);
    const t1 = tree(c);
    rec("⭐⭐⭐ the whole click wrote nothing but the add-on's own state file", JSON.stringify(written(t0, t1)) === '["history/states/1-East.txt"]',
      { written: written(t0, t1), buildingsTxt: (r1.fixes || {}).buildingsTxt, stateSites: (r1.fixes || {}).stateSites });
    md.autoFixMap(opts(c));
    rec("⭐ a second click writes nothing", written(t1, tree(c)).length === 0, written(t1, tree(c)));
  }

  console.log("\n=== 2. …but the rows the add-on's own edit strands ARE reported and re-homed — and the game's stale row still is not ===");
  {
    // The add-on moves province 4 from state 1 to state 2, so the game's rows on 4 - state 1's sites and its industrial complex -
    // now stand on state 2's land. The game did not have that problem; the add-on made it.
    const b = dir("own", { "descriptor.mod": 'name="Own"\n', "history/states/1-East.txt": st(1, "3"), "history/states/2-West.txt": st(2, "2 4") });
    rec("THE CONTROL: the validator reports the rows on province 4, which the add-on gave to state 2, and not the game's row on 2",
      JSON.stringify(wrongState(b)) === '["1:4"]', wrongState(b));
    const dry = md.fixBuildingsTxtPlacement({ ...opts(b), dryRun: true });
    const planned = (((dry || {}).details || {}).rehome || []).map((r) => String(r.type).trim() + "@" + r.province).sort();
    rec("⭐⭐⭐ fixBuildingsTxtPlacement plans the three rows on province 4, and not the game's arms factory on 2",
      JSON.stringify(planned) === JSON.stringify(["air_base@4", "industrial_complex@4", "rocket_site_spawn@4"]), dry);
    const r = md.autoFixMap(opts(b));
    rec("the click ran", !!r && r.ok === true && !r.nothingToFix, r && (r.error || r.note));
    rec("⭐⭐⭐ after one click the game's arms factory is still keyed to state 1", JSON.stringify(keyedAt(b, "arms_factory", 40, 200)) === '["1"]', keyedAt(b, "arms_factory", 40, 200));
    rec("⭐⭐ …the rows on province 4 are keyed to state 2",
      JSON.stringify(keyedAt(b, "air_base", 192, 208)) === '["2"]' && JSON.stringify(keyedAt(b, "rocket_site_spawn", 196, 208)) === '["2"]'
        && JSON.stringify(keyedAt(b, "industrial_complex", 200, 220)) === '["2"]',
      rowsOf(b).filter((l) => /;(air_base|rocket_site_spawn|industrial_complex);/.test(l)));
    rec("⭐⭐ …and the validator reports no row in the wrong state and no state without its sites", wrongState(b).length === 0 && noSite(b).length === 0, { wrong: wrongState(b), noSite: noSite(b) });
    const t = tree(b);
    md.autoFixMap(opts(b));
    rec("⭐ a second click writes nothing", written(t, tree(b)).length === 0, written(t, tree(b)));
  }

  console.log("\n=== 3. the site pass counts by the re-homes the click applies: a state the add-on answers for gets its own site ===");
  {
    // The game's only air base row for state 2 is keyed to state 1 (it stands on 2's land), so the game has state 2 without an air
    // base of its own. An add-on that ships state 2 answers for that. Re-homing the game's row is not the add-on's to do, so the
    // site pass must not count it as state 2's either: it gives state 2 a position of its own.
    const STRAY = row(1, "air_base", 40, 200);
    const GAME3 = dir("game3", Object.assign({
      "map/buildings.txt": [
        row(1, "air_base", 192, 208), row(1, "rocket_site_spawn", 196, 208),
        row(2, "rocket_site_spawn", 68, 160),
        ...PORTS, STRAY,
      ].join("\n") + "\n",
      "history/states/1-East.txt": st(1, "3 4"),
      "history/states/2-West.txt": st(2, "2"),
    }, MAP));
    rec("THE CONTROL: the game, judged by itself, has state 2 without an air base and the stray keyed to state 1",
      JSON.stringify(noSite(GAME3, GAME3)) === "[2]" && JSON.stringify(wrongState(GAME3, GAME3)) === '["1:2"]', { noSite: noSite(GAME3, GAME3), wrong: wrongState(GAME3, GAME3) });
    const d = dir("ships2", { "descriptor.mod": 'name="Ships2"\n', "history/states/2-West.txt": st(2, "2", 0) });
    rec("THE CONTROL: the add-on is told state 2 has no air base, and nothing about the stray row",
      JSON.stringify(noSite(d, GAME3)) === "[2]" && wrongState(d, GAME3).length === 0, { noSite: noSite(d, GAME3), wrong: wrongState(d, GAME3) });
    const r = md.autoFixMap(opts(d, GAME3));
    rec("the click ran", !!r && r.ok === true && !r.nothingToFix, r && (r.error || r.note));
    rec("⭐⭐⭐ ONE click leaves the validator no state without its sites", noSite(d, GAME3).length === 0,
      { noSite: noSite(d, GAME3), stateSites: (r.fixes || {}).stateSites, buildingsTxt: (r.fixes || {}).buildingsTxt });
    rec("⭐⭐⭐ …and the game's stray row is still keyed to state 1", JSON.stringify(keyedAt(d, "air_base", 40, 200, GAME3)) === '["1"]', keyedAt(d, "air_base", 40, 200, GAME3));
    rec("⭐⭐ …while state 2 has an air base standing on its own land",
      rowsOf(d, GAME3).some((l) => { const c = l.split(";"); return c[0] === "2" && c[1] === "air_base" && provAt(Math.floor(+c[2]), md.buildingZToPixelY(H, +c[4])) === 2; }),
      rowsOf(d, GAME3).filter((l) => l.startsWith("2;air_base")));
  }
} catch (e) {
  console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 10).join("\n") : e);
  fails.push("harness error");
} finally {
  for (const d of tmps) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} }
}
console.log(`\n=== auto-fix leaves a building row the mod inherited: ${checks} checks, ${fails.length} failed ===`);
if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
