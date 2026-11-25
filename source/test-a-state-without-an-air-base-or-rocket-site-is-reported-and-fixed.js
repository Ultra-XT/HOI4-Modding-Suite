// A state with no air base or rocket site position in map/buildings.txt is reported, and Auto-fix gives it the
// standard building positions. #a-state-without-an-air-base-or-rocket-site
//
// hoi4.exe (1.19) logs three per-state map errors side by side:
//     "MAP_ERROR: no air base site defined for state "
//     "MAP_ERROR: no rocket site defined for state "
//     "MAP_ERROR: no gun emplacement defined for state "
// In buildings.txt those are the `air_base` row and the `rocket_site_spawn` row keyed to the state — the gun
// emplacement is Götterdämmerung's mega_gun_emplacement, whose `spawn_point = rocket_site_spawn` (vanilla
// common/buildings/00_buildings.txt:317-328). Measured on the six shipping maps: 7,494 states, 0 missing either.
//
// Nova writes the standard set for a state it CREATES (ensureBuildingSlotsForState, from createState and
// generateLand), but nothing noticed a state that arrived without one — hand-written, from an older Nova, or copied
// in from another map — and nothing repaired it. It was first a WARNING ("the engine logs it; nothing shows it crashes");
// it is an ERROR in the FATAL set since #a-state-without-an-air-base-site-fails-the-map-load, because strategicair.cpp
// calls the failed-load path on it (test-a-state-without-an-air-base-site-is-a-map-the-game-refuses-to-load.js).
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (detail == null ? "" : "   " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 260)));
  if (!ok) fails.push(label);
};

const HOME = fs.mkdtempSync(path.join(os.tmpdir(), "nova-sites-home-"));
process.env.NOVA_HOME_DIR = HOME;
const M = require("./map-data.js");
const { isFatalRule, mapRuleLabel } = require("./public/map-rule-labels.js");
const tmps = [HOME];
const RULE = "state_no_air_base_or_rocket_site";

function bmp24(w, h, fn) {
  const rs = (w * 3 + 3) & ~3, is = rs * h; const b = Buffer.alloc(54 + is);
  b.write("BM", 0, "ascii"); b.writeUInt32LE(54 + is, 2); b.writeUInt32LE(54, 10); b.writeUInt32LE(40, 14);
  b.writeInt32LE(w, 18); b.writeInt32LE(h, 22); b.writeUInt16LE(1, 26); b.writeUInt16LE(24, 28); b.writeUInt32LE(0, 30); b.writeUInt32LE(is, 34);
  for (let y = 0; y < h; y++) { let o = 54 + (h - 1 - y) * rs; for (let x = 0; x < w; x++) { const [r, g, bl] = fn(x, y); b[o++] = bl; b[o++] = g; b[o++] = r; } }
  return b;
}
const provAt = (x, y) => Math.floor(x / 64) + Math.floor(y / 64) * 4 + 1;
const COLOF = (p) => [((p * 37) % 200) + 20, ((p * 71) % 200) + 20, ((p * 113) % 200) + 20];
const row = (state, type, x, y) => `${state};${type};${x.toFixed(2)};9.50;${(255 - y).toFixed(2)};0.00;0`;
// States 1-3 each get an air base and a rocket site inside their own land; state 4 = { 10 11 12 } gets neither.
const SITES = [
  row(1, "air_base", 32, 32), row(1, "rocket_site_spawn", 36, 32),
  row(2, "air_base", 224, 32), row(2, "rocket_site_spawn", 228, 32),
  row(3, "air_base", 160, 96), row(3, "rocket_site_spawn", 164, 96),
];

function writeMap(root, { buildings }) {
  const mk = (rel, c) => { const p = path.join(root, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, c); };
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
}
const rowsOf = (root) => fs.readFileSync(path.join(root, "map", "buildings.txt"), "utf8").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
const reported = (opts) => M.validateMapBitmap(opts).filter((p) => p.rule === RULE);

try {
  console.log("1. A state of the mod's own with neither site is reported — as a map the game refuses to load");
  {
    const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-sites-mod-")); tmps.push(mod);
    fs.writeFileSync(path.join(mod, "descriptor.mod"), 'name="Sites"\nreplace_path="history/states"\nreplace_path="map"\n');
    writeMap(mod, { buildings: SITES });
    const opts = { modRoot: mod, gameRoot: null, dependencyRoots: [] };
    const p = reported(opts);
    rec("⭐⭐ the validator reports it once", p.length === 1, p.map((x) => x.message.slice(0, 100)));
    const it = p[0] || {};
    rec("⭐⭐ …naming state 4 and only state 4", Array.isArray(it.states) && it.states.length === 1 && it.states[0] === 4, it.states);
    rec("…saying which positions are missing", /air base/i.test(String(it.message)) && /rocket site/i.test(String(it.message)), String(it.message).slice(0, 200));
    rec("⭐ …quoting what HOI4 logs", /no air base site defined for state/.test(String(it.message)), String(it.message).slice(0, 240));
    // ⚠️ MOVED WITH #a-state-without-an-air-base-site-fails-the-map-load. These two pinned "a warning … not in the fatal set:
    // the engine logs it, nothing shows it crashes". hoi4.exe does more than log it: strategicair.cpp 0x140CB6BE0 clears its
    // ok-flag on each of the three MAP_ERRORs and then calls the failed-load path 0x140201F90 (0x140CB789F; 1.19.4.1 addresses).
    rec("…as an error", it.severity === "error", it.severity);
    // Left the fatal set 2026-09-17: seven of the owner's launches reached a 1936 game with states missing these rows
    // and hoi4.exe never logged the message the trace says it must. #a-validator-must-not-cry-wolf
    rec("⭐ …and NOT in the fatal set: the refusal in the trace has never been seen to happen", isFatalRule(RULE) === false);
    rec("…and it has a label a modder can read", mapRuleLabel(RULE) !== "State no air base or rocket site", mapRuleLabel(RULE));

    const before = rowsOf(mod);
    const r = M.autoFixMap(opts);
    rec("Auto-fix ran", r && r.ok === true, r && r.error);
    const fix = (r.fixes || {}).stateSites || {};
    rec("⭐⭐ Auto-fix reports giving state 4 its positions", (fix.states || []).includes(4), fix);
    const after = rowsOf(mod);
    rec("⭐⭐⭐ state 4 now has an air base position", after.some((l) => /^4;air_base;/.test(l)), after.filter((l) => l.startsWith("4;")));
    rec("⭐⭐⭐ …and a rocket site position", after.some((l) => /^4;rocket_site_spawn;/.test(l)), after.filter((l) => l.startsWith("4;")));
    rec("⭐ every row the other states had is still there, word for word", SITES.every((l) => after.includes(l)), SITES.filter((l) => !after.includes(l)));
    rec("⭐ the rule is satisfied afterwards", reported(opts).length === 0, reported(opts).map((x) => x.states));
    void before;
  }

  console.log("\n2. ⛔ An add-on is not told off, or written into, for a state it only inherits");
  {
    const game = fs.mkdtempSync(path.join(os.tmpdir(), "nova-sites-game-")); tmps.push(game);
    writeMap(game, { buildings: SITES });
    const addon = fs.mkdtempSync(path.join(os.tmpdir(), "nova-sites-addon-")); tmps.push(addon);
    fs.writeFileSync(path.join(addon, "descriptor.mod"), 'name="Addon"\n');
    const opts = { modRoot: addon, gameRoot: game, dependencyRoots: [] };
    rec("⭐⭐ the inherited state is not reported as the add-on's", reported(opts).length === 0, reported(opts).map((x) => x.states));
    // The fixer is called directly: a whole autoFixMap click on this add-on also runs fixers that do not yet ask whose
    // problem they fix (autoFixMap's own note, #auto-fix-materialised-43-MB-to-repair-nothing), and copies files for them.
    const fr = M.fixStatesWithoutBuildingSlots(opts);
    rec("⭐⭐ …the fixer finds nothing of the add-on's to do", (fr.fixed || 0) === 0 && !(fr.failed || []).length, fr);
    rec("⭐⭐⭐ …and no buildings.txt was copied into the add-on", !fs.existsSync(path.join(addon, "map", "buildings.txt")),
      fs.existsSync(path.join(addon, "map")) ? fs.readdirSync(path.join(addon, "map")) : "(no map dir)");
  }

  console.log("\n3. A state that has both is never reported");
  {
    const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-sites-full-")); tmps.push(mod);
    fs.writeFileSync(path.join(mod, "descriptor.mod"), 'name="Full"\nreplace_path="history/states"\nreplace_path="map"\n');
    writeMap(mod, { buildings: SITES.concat([row(4, "air_base", 96, 160), row(4, "rocket_site_spawn", 100, 160)]) });
    rec("no report when every state has both", reported({ modRoot: mod, gameRoot: null, dependencyRoots: [] }).length === 0);
  }

  console.log(`\n=== a state without an air base or rocket site: ${checks} checks, ${fails.length} failed ===`);
  if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
} catch (e) {
  console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 10).join("\n") : e);
  process.exitCode = 1;
} finally {
  for (const d of tmps) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} }
}
