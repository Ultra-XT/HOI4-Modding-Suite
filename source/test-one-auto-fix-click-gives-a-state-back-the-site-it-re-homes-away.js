// One Auto-fix click leaves every state with an air base and a rocket site, even when the click re-homes the only one a
// state had. #one-click-gives-a-state-back-the-site-it-re-homes-away
//
// THE DEFECT. A map/buildings.txt air_base (or rocket_site_spawn) row keyed to state 4 but standing on state 3's land is
// reported — since #a-site-row-off-its-own-land, as state_no_air_base_or_rocket_site for state 4 naming that stray, because
// hoi4.exe counts a site only on its own state's land — and Auto-fix re-homes it to state 3 — in fixBuildingsTxtPlacement, which runs last
// on purpose (it re-homes by the province under each row, so it must read the province→state map every other fixer has
// finished changing; test-every-map-fixer-is-wired-in.js pins it last). The pass that gives a state its missing
// positions, fixStatesWithoutBuildingSlots, runs before it and still counted the row as state 4's. So the click ended
// with state 4 owning no air base, and only a SECOND click gave it one.
//
// MEASURED on the base commit 113d5b5 (a 4x4 grid, states 1-4, state 4's air_base on state 3's province 7):
//   click 1: building_wrong_state fixed, buildings.txt re-homed 1 row, stateSites fixed 0 — and the validator then
//            reported state_no_air_base_or_rocket_site for state 4 ("no air base site defined for state").
//   click 2: stateSites fixed 1, buildings.txt changed again.   click 3: nothing.
// And when the state receiving the row had no air base of its own, click 1 gave it two: its new position AND the
// re-homed row.
//
// THE FIX. The slot pass counts each state's positions as they will be once the re-home has run — the same rehome list
// buildingsTxtPlacementScan hands fixBuildingsTxtPlacement — so the order stays pinned and one click converges.
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (ok || detail == null ? "" : "   -> " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 320)));
  if (!ok) fails.push(label);
};

const HOME = fs.mkdtempSync(path.join(os.tmpdir(), "nova-siterehome-home-"));
process.env.NOVA_HOME_DIR = HOME;
const M = require("./map-data.js");
const tmps = [HOME];
const RULE = "state_no_air_base_or_rocket_site";

function bmp24(w, h, fn) {
  const rs = (w * 3 + 3) & ~3, is = rs * h; const b = Buffer.alloc(54 + is);
  b.write("BM", 0, "ascii"); b.writeUInt32LE(54 + is, 2); b.writeUInt32LE(54, 10); b.writeUInt32LE(40, 14);
  b.writeInt32LE(w, 18); b.writeInt32LE(h, 22); b.writeUInt16LE(1, 26); b.writeUInt16LE(24, 28); b.writeUInt32LE(0, 30); b.writeUInt32LE(is, 34);
  for (let y = 0; y < h; y++) { let o = 54 + (h - 1 - y) * rs; for (let x = 0; x < w; x++) { const [r, g, bl] = fn(x, y); b[o++] = bl; b[o++] = g; b[o++] = r; } }
  return b;
}
// A 4x4 grid of 64px cells: provinces 1..12 land, 13..16 sea. States 1={1 2 3} 2={4 5 6} 3={7 8 9} 4={10 11 12}.
const provAt = (x, y) => Math.floor(x / 64) + Math.floor(y / 64) * 4 + 1;
const stateOfProvince = (p) => (p >= 1 && p <= 12 ? Math.ceil(p / 3) : 0);
const COLOF = (p) => [((p * 37) % 200) + 20, ((p * 71) % 200) + 20, ((p * 113) % 200) + 20];
const row = (state, type, x, y) => `${state};${type};${x.toFixed(2)};9.50;${(255 - y).toFixed(2)};0.00;0`;

function writeMod(buildings) {
  const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-siterehome-")); tmps.push(mod);
  const mk = (rel, c) => { const p = path.join(mod, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, c); };
  mk("descriptor.mod", 'name="SiteRehome"\nreplace_path="history/states"\nreplace_path="map"\n');
  mk("map/provinces.bmp", bmp24(256, 256, (x, y) => COLOF(provAt(x, y))));
  const rows = ["0;0;0;0;land;false;unknown;0"];
  for (let p = 1; p <= 16; p++) { const [r, g, b] = COLOF(p); const sea = p >= 13; rows.push(`${p};${r};${g};${b};${sea ? "sea" : "land"};${!sea && p >= 9 ? "true" : "false"};${sea ? "ocean" : "plains"};${sea ? 0 : 1}`); }
  mk("map/definition.csv", rows.join("\n") + "\n");
  const st = (id, provs, owner) => `state = {\n\tid = ${id}\n\tname = "STATE_${id}"\n\tmanpower = ${1000 * id}\n\tstate_category = rural\n\tprovinces = { ${provs} }\n\thistory = {\n\t\towner = ${owner}\n\t}\n}\n`;
  mk("history/states/1.txt", st(1, "1 2 3", "AAA"));
  mk("history/states/2.txt", st(2, "4 5 6", "BBB"));
  mk("history/states/3.txt", st(3, "7 8 9", "AAA"));
  mk("history/states/4.txt", st(4, "10 11 12", "BBB"));
  mk("history/countries/AAA.txt", "capital = 1\n");
  mk("history/countries/BBB.txt", "capital = 2\n");
  const weather = "\tweather={\n\t\tperiod={\n\t\t\tbetween={ 0.0 364.0 }\n\t\t\ttemperature={ -5.0 25.0 }\n\t\t\tno_phenomenon=0.700\n\t\t}\n\t}\n";
  mk("map/strategicregions/1.txt", `strategic_region={\n\tid=1\n\tname="R1"\n\tprovinces={ 1 2 3 4 5 6 7 8 9 10 11 12 }\n${weather}}\n`);
  mk("map/strategicregions/2.txt", `strategic_region={\n\tid=2\n\tname="R2"\n\tprovinces={ 13 14 15 16 }\n${weather}}\n`);
  mk("map/buildings.txt", buildings.join("\n") + "\n");
  mk("map/adjacencies.csv", "From;To;Type;Through;start_x;start_y;stop_x;stop_y;adjacency_rule_name;Comment\n-1;-1;-1;-1;-1;-1;-1;-1;-1\n");
  return mod;
}
const opts = (mod) => ({ modRoot: mod, gameRoot: null, dependencyRoots: [] });
const buildingsText = (mod) => fs.readFileSync(path.join(mod, "map", "buildings.txt"), "utf8");
const rowsOf = (mod) => buildingsText(mod).split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
// The state whose land a row stands on, read from the bitmap the way the game reads it.
const standsIn = (line) => { const c = line.split(";"); return stateOfProvince(provAt(Math.floor(parseFloat(c[2])), M.buildingZToPixelY(256, parseFloat(c[4])))); };
const sitesOf = (mod, state, type) => rowsOf(mod).filter((l) => l.split(";")[0] === String(state) && l.split(";")[1] === type);
const missingSites = (mod) => M.validateMapBitmap(opts(mod)).filter((p) => p.rule === RULE);

function oneClick(label, siteType, { stateThreeHasItsOwn = true } = {}) {
  console.log(`\n${label}`);
  const other = siteType === "air_base" ? "rocket_site_spawn" : "air_base";
  const STRAY = row(4, siteType, 168, 100);                 // keyed to state 4, standing on province 7 — state 3's land
  const buildings = [
    row(1, "air_base", 32, 32), row(1, "rocket_site_spawn", 36, 32),
    row(2, "air_base", 224, 32), row(2, "rocket_site_spawn", 228, 32),
    row(3, other, 164, 96),
    row(4, other, 96, 160),                                   // on state 4's own province 10
    STRAY,
  ];
  if (stateThreeHasItsOwn) buildings.push(row(3, siteType, 160, 96));
  const mod = writeMod(buildings);
  rec("THE CONTROL: the stray row stands on state 3's land", standsIn(STRAY) === 3, standsIn(STRAY));
  // #a-site-row-off-its-own-land moved this control. It used to say nothing reports state 4 before the click, "its row is
  // only in the wrong place" — but hoi4.exe counts a site row only on a land province of the state it is keyed to, so a
  // state whose only site row stands on a neighbour's land is a state the game refuses when a game starts. The validator
  // now says so: state 4, and — when state 3 has no site of its own — state 3 too, since the stray is keyed to state 4.
  const expectedBefore = stateThreeHasItsOwn ? [4] : [3, 4];
  const reportedBefore = [...new Set(missingSites(mod).flatMap((p) => p.states || []))].sort((a, b) => a - b);
  rec(`THE CONTROL: before the click, the validator reports state${expectedBefore.length > 1 ? "s" : ""} ${expectedBefore.join(" and ")} without the site — the game refuses a site standing off its state's land`,
    JSON.stringify(reportedBefore) === JSON.stringify(expectedBefore), reportedBefore);

  const r1 = M.autoFixMap(opts(mod));
  rec("Auto-fix ran", !!r1 && r1.ok === true, r1 && r1.error);
  rec("…and re-homed the stray row", ((r1.fixes || {}).buildingsTxt || {}).rehomed === 1, (r1.fixes || {}).buildingsTxt);
  const four = sitesOf(mod, 4, siteType);
  rec(`⭐⭐⭐ ONE click: state 4 has a ${siteType} of its own`, four.length === 1, rowsOf(mod).filter((l) => l.startsWith("4;")));
  rec("⭐⭐ …standing on state 4's own land", four.length > 0 && four.every((l) => standsIn(l) === 4), four.map((l) => [l, standsIn(l)]));
  const threeWants = stateThreeHasItsOwn ? 2 : 1;           // its own, when it had one, and the re-homed row
  rec(`⭐⭐⭐ …and state 3 has ${threeWants === 1 ? `exactly one ${siteType}: the re-homed row, and no second one written` : `its own ${siteType} and the re-homed one`}`,
    sitesOf(mod, 3, siteType).length === threeWants, sitesOf(mod, 3, siteType));
  rec("⭐⭐ the validator has no state left without its sites", missingSites(mod).length === 0, missingSites(mod).map((p) => p.message.slice(0, 120)));
  const after1 = buildingsText(mod);
  M.autoFixMap(opts(mod));
  rec("⭐⭐⭐ a second click leaves buildings.txt byte-identical", buildingsText(mod) === after1,
    rowsOf(mod).filter((l) => !after1.includes(l)));
}

try {
  oneClick("1. ⛔ an air base keyed to state 4 stands on state 3's land", "air_base");
  oneClick("2. ⛔ …and the same for a rocket site", "rocket_site_spawn");
  oneClick("3. ⛔ …when state 3 had no air base of its own, the re-homed row is its air base — no second one is written", "air_base", { stateThreeHasItsOwn: false });
  console.log(`\n=== one auto-fix click gives a state back the site it re-homes away: ${checks} checks, ${fails.length} failed ===`);
  if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
} catch (e) {
  console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 10).join("\n") : e);
  process.exitCode = 1;
} finally {
  for (const d of tmps) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} }
}
