// An add-on is not told about a coastal province with no port that it only inherited, and one Auto-fix click never copies a
// base layer's buildings.txt or definition.csv in to give it one. #auto-fix-leaves-a-portless-coast-the-mod-inherited
//
// THE DEFECT. coastal_no_port is fixCoastalNoPort's own dry run, and neither asked whose problem it was: every land province
// the bitmap makes coastal with no port HOI4 would accept was reported to the mod and, on a click, given a naval_base_spawn —
// copying the effective buildings.txt into the mod to add it, and definition.csv to set a coastal flag, even one already true.
//
// MEASURED on the base commit 21808ba, through the endpoints the Map Errors popup calls (GET /api/map/validate, then POST
// /api/map/auto-fix { modPath }), on a mkdtemp add-on declaring the installed The Road to 56 and carrying one problem of its
// own (R56's 1-France.txt with its state_category line removed): the validator reported coastal_no_port for R56's own
// provinces 490, 10715 and 1201 — the same three R56 reports for itself, and it launches — and ONE click wrote R56's
// map/buildings.txt (3,594,609 B) and map/definition.csv (483,279 B) into the add-on. Both then shadow R56's own files.
//
// THE FIX. fixCoastalNoPort subtracts the targets the layer below already has (baseCoastalNoPortTargets: the same fixer, dry
// run, on the highest layer below that ships a map input, united with what lies beneath it) inside the one function the rule
// and Auto-fix both call, so they judge the same provinces; and it writes definition.csv only when a coastal flag really
// changes. A coast the mod's own edit left without a port is still reported and given one (section 2).
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

let checks = 0, skips = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (ok || detail == null ? "" : "   -> " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 320)));
  if (!ok) fails.push(label);
};
const skip = (label) => { skips++; console.log("  SKIP " + label); };

const HOME = fs.mkdtempSync(path.join(os.tmpdir(), "nova-inhport-home-"));
process.env.NOVA_HOME_DIR = HOME;
const md = require("./map-data.js");
const tmps = [HOME];

function dir(tag, files) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "nova-inhport-" + tag + "-")); tmps.push(d);
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
// 256x256: a sea strip on top (1); under it land 2 on the left, and on the right land 3 (on the sea) over land 4 (inland).
const W = 256, H = 256;
const COL = { 1: [0, 0, 200], 2: [200, 0, 0], 3: [0, 200, 0], 4: [200, 200, 0] };
const provAt = (x, y) => (y < 64 ? 1 : x < 128 ? 2 : y < 160 ? 3 : 4);
const st = (id, name, provs, manpower = 1000) => `state={\n\tid=${id}\n\tname="STATE_${id}"\n\tmanpower = ${manpower}\n\tstate_category = rural\n\tprovinces={ ${provs} }\n}\n`;
// Rows: state 1's air base and rocket site on province 4 (pixel 192,208 -> z 47); a port for state 2 and for state 3 on their
// first land row under the sea (y 64 -> z 191), facing sea province 1.
const SITES = ["1;air_base;192.00;9.50;47.00;0.00;0", "1;rocket_site_spawn;192.00;9.50;47.00;0.00;0"];
const PORT2 = "2;naval_base_spawn;64.00;9.50;191.00;0.00;1", PORT3 = "3;naval_base_spawn;192.00;9.50;191.00;0.00;1";
const GAME = dir("game", {
  "map/provinces.bmp": bmp24(W, H, (x, y) => COL[provAt(x, y)]),
  "map/definition.csv": ["0;0;0;0;land;false;unknown;0", "1;0;0;200;sea;false;ocean;0", "2;200;0;0;land;true;plains;1", "3;0;200;0;land;true;plains;1", "4;200;200;0;land;false;plains;1"].join("\r\n") + "\r\n",
  "map/buildings.txt": SITES.concat([PORT2, PORT3]).join("\n"),
  "history/states/1-Inland.txt": st(1, "Inland", "4"),
  "history/states/2-West.txt": st(2, "West", "2"),
  "history/states/3-East.txt": st(3, "East", "3"),
});
// The Road to 56 shape: a dependency whose own buildings.txt leaves coastal province 3 without a port.
const DEP = dir("dep", { "descriptor.mod": 'name="Dep"\n', "map/buildings.txt": SITES.concat([PORT2]).join("\n") });
const portless = (modRoot, deps) => md.validateMapBitmap({ modRoot, gameRoot: GAME, dependencyRoots: deps || [] })
  .filter((p) => p.rule === "coastal_no_port").flatMap((p) => p.provinces || []);
const has = (d, rel) => fs.existsSync(path.join(d, ...rel.split("/")));
const portRowsFor = (d, stateId) => has(d, "map/buildings.txt") ? fs.readFileSync(path.join(d, "map", "buildings.txt"), "utf8").split(/\r?\n/).filter((l) => l.startsWith(stateId + ";naval_base_spawn;")) : [];

try {
  console.log("\n=== THE CONTROLS: what each layer is told about itself ===");
  {
    const plain = dir("plain", { "descriptor.mod": 'name="Plain"\n' });
    rec("a mod over the game alone, changing nothing, is told of no portless coast (the game gives 2 and 3 ports)", portless(plain).length === 0, portless(plain));
  }
  rec("the dependency, validated on its own over the game, reports its portless province 3", portless(DEP).join() === "3", portless(DEP));

  console.log("\n=== 1. an add-on with one problem of its own: the dependency's coast is neither reported nor given a port ===");
  {
    const own = { "descriptor.mod": 'name="Addon"\ndependencies={ "Dep" }\n', "history/states/1-Inland.txt": st(1, "Inland", "4", 0) };
    const a = dir("addon", own);
    const opts = { modRoot: a, gameRoot: GAME, dependencyRoots: [DEP] };
    rec("⭐⭐⭐ the validator tells the add-on nothing about the dependency's portless coast", portless(a, [DEP]).length === 0, portless(a, [DEP]));
    const r = md.fixCoastalNoPort(opts);
    rec("⭐⭐⭐ fixCoastalNoPort adds no port for the dependency", !!r && !r.error && (r.added || 0) === 0, r);
    rec("⭐⭐⭐ …and copies neither buildings.txt nor definition.csv into the add-on", !has(a, "map/buildings.txt") && !has(a, "map/definition.csv"),
      { buildings: has(a, "map/buildings.txt"), definition: has(a, "map/definition.csv") });
    const c = dir("addon-click", { ...own, "descriptor.mod": 'name="AddonClick"\ndependencies={ "Dep" }\n' });
    const r1 = md.autoFixMap({ modRoot: c, gameRoot: GAME, dependencyRoots: [DEP] });
    rec("the click ran every fixer — it was not 'nothing to fix'", !!r1 && r1.ok === true && !r1.nothingToFix, r1 && (r1.error || r1.note));
    rec("…and repaired the add-on's own problem", ((r1.fixes || {}).noManpower || {}).fixed === 1, (r1.fixes || {}).noManpower);
    rec("⭐⭐⭐ the whole click adds no port for the dependency's coast", ((r1.fixes || {}).coastalNoPort || {}).added === 0 && portRowsFor(c, 3).length === 0,
      { coastalNoPort: (r1.fixes || {}).coastalNoPort, rows: portRowsFor(c, 3) });
    rec("⭐⭐⭐ …and writes neither buildings.txt nor definition.csv into the add-on", !has(c, "map/buildings.txt") && !has(c, "map/definition.csv"),
      { buildings: has(c, "map/buildings.txt"), definition: has(c, "map/definition.csv") });
  }

  console.log("\n=== 2. …but a coast the add-on's own buildings.txt left portless IS reported and given a port ===");
  {
    // The add-on ships the dependency's buildings.txt with state 2's port deleted.
    const a = dir("addon-own", { "descriptor.mod": 'name="AddonOwn"\ndependencies={ "Dep" }\n', "map/buildings.txt": SITES.join("\n") });
    const opts = { modRoot: a, gameRoot: GAME, dependencyRoots: [DEP] };
    rec("⭐⭐⭐ the validator reports the add-on's own portless province 2, and only it", portless(a, [DEP]).join() === "2", portless(a, [DEP]));
    const r = md.fixCoastalNoPort(opts);
    rec("⭐⭐⭐ fixCoastalNoPort gives province 2 a port, and only it", !!r && r.added === 1 && (r.provinces || []).join() === "2", r);
    rec("⭐⭐ …in the add-on's own buildings.txt, keyed to state 2", portRowsFor(a, 2).length === 1 && portRowsFor(a, 3).length === 0, { 2: portRowsFor(a, 2), 3: portRowsFor(a, 3) });
    rec("⭐⭐ province 2 already says coastal, so no copy of definition.csv is written for nothing", !has(a, "map/definition.csv"));
    rec("…and the validator has nothing left to report", portless(a, [DEP]).length === 0, portless(a, [DEP]));
  }

  console.log("\n=== 3. the real The Road to 56 (read-only; only a temp add-on is written) ===");
  {
    const VAN = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
    const R56 = "D:/SteamLibrary/steamapps/workshop/content/394360/820260968";
    if (!fs.existsSync(path.join(R56, "map", "buildings.txt")) || !fs.existsSync(path.join(VAN, "map", "provinces.bmp"))) {
      skip("The Road to 56 or the base game is not installed — the corpus half did NOT run");
    } else {
      const t0 = Date.now();
      const own = md.fixCoastalNoPort({ modRoot: R56, gameRoot: VAN, dependencyRoots: [], dryRun: true });
      rec("THE CONTROL: The Road to 56 reports portless coasts of its own", !!own && (own.targets || []).length > 0, own && (own.targets || own.error));
      const a = dir("addon-r56", { "descriptor.mod": 'name="R56 addon"\ndependencies={ "The Road to 56" }\n' });
      const opts = { modRoot: a, gameRoot: VAN, dependencyRoots: [R56] };
      const told = md.fixCoastalNoPort({ ...opts, dryRun: true });
      rec(`⭐⭐⭐ an add-on over R56 is told none of R56's ${((own && own.targets) || []).length}`, !!told && !(told.targets || []).length, told && (told.targets || told.error));
      const r = md.fixCoastalNoPort(opts);
      rec(`⭐⭐⭐ …Auto-fix adds none of their ports (${Date.now() - t0} ms)`, !!r && !r.error && (r.added || 0) === 0, r);
      rec("⭐⭐⭐ …and copies neither R56's buildings.txt nor its definition.csv into it", !has(a, "map/buildings.txt") && !has(a, "map/definition.csv"),
        { buildings: has(a, "map/buildings.txt"), definition: has(a, "map/definition.csv") });
    }
  }
} catch (e) {
  console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 10).join("\n") : e);
  fails.push("harness error");
} finally {
  for (const d of tmps) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} }
}
console.log(`\n=== auto-fix leaves a portless coast the mod inherited: ${checks} checks, ${fails.length} failed${skips ? `, ${skips} SKIPPED (not counted as passes)` : ""} ===`);
if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
