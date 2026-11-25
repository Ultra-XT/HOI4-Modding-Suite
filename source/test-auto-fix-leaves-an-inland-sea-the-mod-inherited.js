// Auto-fix leaves an isolated sea the mod only inherited alone, and never turns the dummy province 0 into land.
// #auto-fix-leaves-an-inland-sea-the-mod-inherited
//
// THE DEFECT. fixInlandSeas has NO rule: nothing in Map Errors reports an isolated inland sea, so nothing a modder is shown
// ever asked for it. autoFixMap runs it twice on every click, and it retyped to land every sea province cut off from the
// largest body of water (unless its strategic region is mostly water), whoever shipped it — through setProvinceDefinition,
// which copies definition.csv into the mod, raises heightmap.bmp and removes the ports that faced that water from buildings.txt.
// The land it made then had no state, so fixStatelessLand added it to a neighbouring state (another file copied in), and the
// coast it took away left a naval building that fixNavalBuildingsWithoutCoast removed on the next click.
//
// MEASURED on the base commit 21808ba, through the endpoints the Map Errors popup calls (GET /api/map/validate, then POST
// /api/map/auto-fix { modPath }), on mkdtemp add-ons with one problem of their own:
//   * over the installed Millennium Dawn: the validator reported only that problem, and one click turned MD's sea 13277 into
//     mountain and wrote MD's map/definition.csv (595,926 B), map/heightmap.bmp (11,535,412 B), map/buildings.txt and
//     history/states/411-Badakhstan.txt into the add-on; the second click rewrote 411 again (its naval building removed);
//   * over the installed Old World Blues: it turned OWB's sea 5894 — and province 0, the reserved dummy — into land and wrote
//     OWB's definition.csv (801,790 B), heightmap.bmp (12,977,206 B), buildings.txt (5,771,749 B) and 1174-State.txt.
// Both maps launch with those seas.
//
// THE FIX. baseInlandSeaProvinces: the fixer's own dry run on the highest layer below that ships a map, united with what lies
// beneath it; the fixer converts only the sea provinces that set does not hold. A sea the mod's own edit cut off is still
// converted (section 2). And province 0 is never a sea body to convert (section 4).
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

const HOME = fs.mkdtempSync(path.join(os.tmpdir(), "nova-inhsea-home-"));
process.env.NOVA_HOME_DIR = HOME;
const md = require("./map-data.js");
const tmps = [HOME];

function dir(tag, files) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "nova-inhsea-" + tag + "-")); tmps.push(d);
  for (const [rel, body] of Object.entries(files)) {
    const p = path.join(d, ...rel.split("/"));
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, body);
  }
  return d;
}
function bmp24(width, height, fn) {
  const rowSize = (width * 3 + 3) & ~3, imageSize = rowSize * height;
  const buf = Buffer.alloc(54 + imageSize);
  buf.write("BM", 0, "ascii"); buf.writeUInt32LE(54 + imageSize, 2); buf.writeUInt32LE(54, 10); buf.writeUInt32LE(40, 14);
  buf.writeInt32LE(width, 18); buf.writeInt32LE(height, 22); buf.writeUInt16LE(1, 26); buf.writeUInt16LE(24, 28); buf.writeUInt32LE(imageSize, 34);
  for (let y = 0; y < height; y++) { let off = 54 + (height - 1 - y) * rowSize; for (let x = 0; x < width; x++) { const [r, g, b] = fn(x, y); buf[off++] = b; buf[off++] = g; buf[off++] = r; } }
  return buf;
}
const has = (d, rel) => fs.existsSync(path.join(d, ...rel.split("/")));
// Columns: 1 land | 2 (land in the game, SEA in the dependency) | 3 land | 4 land | 5 land | 6, 7 the ocean | 8 land.
const COL = { 1: [200, 0, 0], 2: [0, 200, 0], 3: [0, 0, 200], 4: [200, 200, 0], 5: [200, 0, 200], 6: [0, 200, 200], 7: [100, 150, 200], 8: [150, 100, 50] };
const provAtX = (x) => (x <= 3 ? 1 : x <= 5 ? 2 : x <= 9 ? 3 : x <= 11 ? 4 : x <= 15 ? 5 : x <= 17 ? 6 : x <= 19 ? 7 : 8);
const TYPE = { 1: "land", 2: "land", 3: "land", 4: "land", 5: "land", 6: "sea", 7: "sea", 8: "land" };
const DEF = (over = {}, zero = "land") => [`0;0;0;0;${zero};false;unknown;0`].concat([1, 2, 3, 4, 5, 6, 7, 8].map((i) => {
  const t = over[i] || TYPE[i];
  return `${i};${COL[i].join(";")};${t};false;${t === "sea" ? "ocean" : "plains"};${t === "sea" ? 0 : 1}`;
})).join("\r\n") + "\r\n";
const reg = (id, provs) => `strategic_region={\n\tid=${id}\n\tname="REGION_${id}"\n\tprovinces={ ${provs} }\n\tweather={}\n}\n`;
const st = (id, provs, manpower = 1000) => `state = {\n\tid = ${id}\n\tname = "STATE_${id}"\n\tmanpower = ${manpower}\n\tstate_category = rural\n\tprovinces = { ${provs} }\n\thistory = {\n\t\towner = AAA\n\t}\n}\n`;
const GAME = dir("game", {
  "map/provinces.bmp": bmp24(24, 4, (x) => COL[provAtX(x)]),
  "map/definition.csv": DEF(),
  "map/strategicregions/100-Land.txt": reg(100, "1 2 3 4 5 8"),
  "map/strategicregions/300-Ocean.txt": reg(300, "6 7"),
  "history/states/1-A.txt": st(1, "1 2 3"),
  "history/states/2-B.txt": st(2, "4 5 8"),
});
// The Millennium Dawn / Old World Blues shape: a dependency whose own definition.csv has an isolated sea (2) in a land region.
const DEP_DEF = DEF({ 2: "sea" });
const DEP = dir("dep", { "descriptor.mod": 'name="Dep"\n', "map/definition.csv": DEP_DEF, "history/states/1-A.txt": st(1, "1 3") });
const typeIn = (d, id) => { const p = path.join(d, "map", "definition.csv"); if (!fs.existsSync(p)) return null; const l = fs.readFileSync(p, "utf8").split(/\r?\n/).find((x) => x.split(";")[0] === String(id)); return l ? l.split(";")[4] : null; };

try {
  console.log("\n=== THE CONTROL: the dependency, judged on its own, has an isolated sea ===");
  {
    const probe = dir("dep-copy", { "descriptor.mod": 'name="DepCopy"\nreplace_path="map/strategicregions"\n', "map/definition.csv": DEP_DEF, "map/provinces.bmp": bmp24(24, 4, (x) => COL[provAtX(x)]),
      "map/strategicregions/100-Land.txt": reg(100, "1 2 3 4 5 8"), "map/strategicregions/300-Ocean.txt": reg(300, "6 7") });
    const own = md.fixInlandSeas({ modRoot: probe, gameRoot: GAME, dependencyRoots: [] });
    rec("a mod shipping the dependency's map as its own gets sea 2 converted — the detection is not vacuous", !!own && own.fixed === 1 && (own.details || [])[0] && own.details[0].province === 2, own);
  }

  console.log("\n=== 1. an add-on with one problem of its own: the dependency's sea is left a sea ===");
  {
    const files = { "descriptor.mod": 'name="Addon"\ndependencies={ "Dep" }\n', "history/states/2-B.txt": st(2, "4 5 8", 0) };
    const a = dir("addon", files);
    const opts = { modRoot: a, gameRoot: GAME, dependencyRoots: [DEP] };
    const r = md.fixInlandSeas(opts);
    rec("⭐⭐⭐ fixInlandSeas converts none of the dependency's sea", !!r && !r.error && r.fixed === 0, r);
    rec("⭐⭐⭐ …and copies no definition.csv into the add-on", !has(a, "map/definition.csv"), has(a, "map/definition.csv"));
    const c = dir("addon-click", { ...files, "descriptor.mod": 'name="AddonClick"\ndependencies={ "Dep" }\n' });
    const r1 = md.autoFixMap({ modRoot: c, gameRoot: GAME, dependencyRoots: [DEP] });
    rec("the click ran every fixer — it was not 'nothing to fix'", !!r1 && r1.ok === true && !r1.nothingToFix, r1 && (r1.error || r1.note));
    rec("…and repaired the add-on's own problem", ((r1.fixes || {}).noManpower || {}).fixed === 1, (r1.fixes || {}).noManpower);
    rec("⭐⭐⭐ the whole click converts no sea and copies no definition.csv in", ((r1.fixes || {}).inlandSeas || {}).fixed === 0 && !has(c, "map/definition.csv"),
      { inlandSeas: (r1.fixes || {}).inlandSeas, definition: has(c, "map/definition.csv") });
    rec("⭐⭐ …so nothing is left stateless for the stateless-land pass to file into a copied state", ((r1.fixes || {}).statelessLand || { fixed: 0 }).fixed === 0 && !has(c, "history/states/1-A.txt"),
      { statelessLand: (r1.fixes || {}).statelessLand, states: fs.readdirSync(path.join(c, "history", "states")) });
  }

  console.log("\n=== 2. …but a sea the add-on's own definition.csv cut off IS turned back into land ===");
  {
    // The add-on ships the dependency's definition.csv (one Terrain click) and makes land 4 into sea as well.
    const a = dir("addon-own", { "descriptor.mod": 'name="AddonOwn"\ndependencies={ "Dep" }\n', "map/definition.csv": DEF({ 2: "sea", 4: "sea" }) });
    const r = md.fixInlandSeas({ modRoot: a, gameRoot: GAME, dependencyRoots: [DEP] });
    rec("⭐⭐⭐ fixInlandSeas converts the add-on's own isolated sea 4, and only it", !!r && r.fixed === 1 && (r.details || []).map((x) => x.province).join() === "4", r);
    rec("⭐⭐ …in the add-on's definition.csv, leaving the dependency's sea 2 a sea", typeIn(a, 4) === "land" && typeIn(a, 2) === "sea", { 2: typeIn(a, 2), 4: typeIn(a, 4) });
  }

  console.log("\n=== 3. province 0 is the dummy, never a sea to convert ===");
  {
    // A mod whose own definition.csv types row 0 as sea (Old World Blues' shape): with no pixels of its own it is its own "body".
    const m = dir("zero", { "descriptor.mod": 'name="Zero"\nreplace_path="map"\nreplace_path="map/strategicregions"\n', "map/provinces.bmp": bmp24(24, 4, (x) => COL[provAtX(x)]),
      "map/definition.csv": DEF({}, "sea"), "map/strategicregions/100-Land.txt": reg(100, "1 2 3 4 5 8"), "map/strategicregions/300-Ocean.txt": reg(300, "6 7") });
    const r = md.fixInlandSeas({ modRoot: m, gameRoot: GAME, dependencyRoots: [] });
    rec("⭐⭐⭐ fixInlandSeas does not turn province 0 into land", !!r && !(r.details || []).some((x) => x.province === 0) && typeIn(m, 0) === "sea", { r, zero: typeIn(m, 0) });
  }

  console.log("\n=== 4. the real Millennium Dawn and Old World Blues (read-only; only temp add-ons are written) ===");
  {
    const VAN = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
    const W = "D:/SteamLibrary/steamapps/workshop/content/394360/";
    for (const [name, id, desc] of [["Millennium Dawn", "2777392649", "Millennium Dawn: A Modern Day Mod"], ["Old World Blues", "2265420196", "Old World Blues"]]) {
      const root = W + id;
      if (!fs.existsSync(path.join(root, "map", "definition.csv")) || !fs.existsSync(path.join(VAN, "map", "provinces.bmp"))) { skip(`${name} or the base game is not installed — that half did NOT run`); continue; }
      const t0 = Date.now();
      const a = dir("addon-" + id, { "descriptor.mod": `name="${name} addon"\ndependencies={ "${desc}" }\n` });
      const r = md.fixInlandSeas({ modRoot: a, gameRoot: VAN, dependencyRoots: [root] });
      rec(`⭐⭐⭐ an add-on over ${name} has none of its seas turned into land (${Date.now() - t0} ms)`, !!r && !r.error && r.fixed === 0, r);
      rec(`⭐⭐⭐ …and no copy of its definition.csv, heightmap.bmp or buildings.txt is written into it`, !has(a, "map/definition.csv") && !has(a, "map/heightmap.bmp") && !has(a, "map/buildings.txt"),
        fs.existsSync(path.join(a, "map")) ? fs.readdirSync(path.join(a, "map")) : "(no map folder)");
    }
  }
} catch (e) {
  console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 10).join("\n") : e);
  fails.push("harness error");
} finally {
  for (const d of tmps) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} }
}
console.log(`\n=== auto-fix leaves an inland sea the mod inherited: ${checks} checks, ${fails.length} failed${skips ? `, ${skips} SKIPPED (not counted as passes)` : ""} ===`);
if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
