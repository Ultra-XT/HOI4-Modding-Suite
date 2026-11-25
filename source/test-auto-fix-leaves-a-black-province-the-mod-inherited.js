// Auto-fix leaves a black province the mod only inherited alone: one click never copies a base layer's definition.csv — or
// its whole provinces.bmp — into a mod to recolour a province the validator does not report.
// #auto-fix-leaves-a-black-province-the-mod-inherited
//
// THE DEFECT. province_reserved_black asks whether the black row is the mod's own (provinceRowIsTheModsOwn on r, g, b):
// Millennium Dawn ships province 16257 painted 0,0,0 and an add-on did not paint it. fixDuplicateProvinceColors, which
// autoFixMap runs FIRST on every click, recoloured every black row in the effective definition.csv, whoever shipped it, and
// with one offender also repainted provinces.bmp — writing both into the mod. With no black pixel to repaint it still wrote
// the unchanged bitmap into the mod.
//
// MEASURED on the base commit 21808ba, through the endpoints the Map Errors popup calls (GET /api/map/validate, then POST
// /api/map/auto-fix { modPath }), on a mkdtemp add-on declaring the installed Millennium Dawn and carrying one problem of its
// own (MD's 1-Central Plateau.txt with its state_category line removed): the validator reported state_no_category only, and
// ONE click wrote MD's map/provinces.bmp (34,603,062 B, 14 pixels repainted) and map/definition.csv (595,926 B) into the
// add-on for MD's 16257. Both then shadow MD's own files: the add-on pins MD's map as it was that day.
//
// THE FIX. The rule's ownership question is one helper, reservedBlackIsTheModsOwn, and the fixer recolours only the rows it
// answers yes for; a bitmap it repainted nothing in is not written. A black row the mod itself wrote is still recoloured
// (section 4). ⚠️ Deliberately NOT the rule's second condition (a lone black province that owns black pixels is not
// reported): that one is about the mod's own data, and the fixer's repaint exists for exactly that case — see
// test-map-fix-dup-colors.js.
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");

let checks = 0, skips = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (ok || detail == null ? "" : "   -> " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 320)));
  if (!ok) fails.push(label);
};
const skip = (label) => { skips++; console.log("  SKIP " + label); };

const HOME = fs.mkdtempSync(path.join(os.tmpdir(), "nova-inhblack-home-"));
process.env.NOVA_HOME_DIR = HOME;
const md = require("./map-data.js");
const tmps = [HOME];

function dir(tag, files) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "nova-inhblack-" + tag + "-")); tmps.push(d);
  for (const [rel, body] of Object.entries(files)) {
    const p = path.join(d, ...rel.split("/"));
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, body);
  }
  return d;
}
const sha = (p) => fs.existsSync(p) ? crypto.createHash("sha1").update(fs.readFileSync(p)).digest("hex") : null;
function bmp24(W, H, fn) {
  const rs = Math.floor((24 * W + 31) / 32) * 4, size = 54 + rs * H, b = Buffer.alloc(size);
  b.write("BM", 0, "ascii"); b.writeUInt32LE(size, 2); b.writeUInt32LE(54, 10); b.writeUInt32LE(40, 14);
  b.writeInt32LE(W, 18); b.writeInt32LE(H, 22); b.writeUInt16LE(1, 26); b.writeUInt16LE(24, 28); b.writeUInt32LE(rs * H, 34);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const [r, g, bl] = fn(x, y); const o = 54 + (H - 1 - y) * rs + x * 3; b[o] = bl; b[o + 1] = g; b[o + 2] = r; }
  return b;
}
const W = 16, H = 16;
const ROWS = ["0;0;0;0;land;false;unknown;0", "1;200;0;0;land;false;plains;1", "2;0;200;0;land;false;plains;1", "3;0;0;200;land;false;plains;1"];
const csv = (rows) => rows.join("\r\n") + "\r\n";
// Three coloured bands; with `black`, the right-most quarter is painted 0,0,0 — pixels a black province can own.
const bands = (black) => bmp24(W, H, (x) => (black && x >= 12 ? [0, 0, 0] : x < 4 ? [200, 0, 0] : x < 8 ? [0, 200, 0] : [0, 0, 200]));
const st = (id, provs, manpower) => `state = {\n\tid = ${id}\n\tname = "STATE_${id}"\n\tmanpower = ${manpower}\n\tstate_category = rural\n\tprovinces = { ${provs} }\n\thistory = {\n\t\towner = AAA\n\t}\n}\n`;
const blackReports = (modRoot, gameRoot, deps) => md.validateMapModel(md.buildMapModel({ modRoot, gameRoot, dependencyRoots: deps || [], cacheStableLayers: false }))
  .filter((p) => p.rule === "province_reserved_black").flatMap((p) => p.provinces || []);
const mapFiles = (d) => ({ definition: fs.existsSync(path.join(d, "map", "definition.csv")), provinces: fs.existsSync(path.join(d, "map", "provinces.bmp")) });

const GAME = dir("game", { "map/definition.csv": csv(ROWS), "map/provinces.bmp": bands(false) });
const DEP_CSV = csv(ROWS.concat(["4;0;0;0;land;true;unknown;1"]));
// The Millennium Dawn shape: a black province that owns black pixels, which the rule does not report even for the dependency.
const DEP = dir("dep", { "descriptor.mod": 'name="Dep"\n', "map/definition.csv": DEP_CSV, "map/provinces.bmp": bands(true) });
// A dependency whose black province owns no pixel, which the rule does report — for the dependency.
const DEP2 = dir("dep2", { "descriptor.mod": 'name="DepNoPixels"\n', "map/definition.csv": DEP_CSV, "map/provinces.bmp": bands(false) });

try {
  console.log("\n=== THE CONTROLS: what each dependency is told about itself ===");
  rec("the Millennium Dawn shape is not reported, even to itself", blackReports(DEP, GAME).length === 0, blackReports(DEP, GAME));
  rec("the pixel-less dependency is told about its own province 4", blackReports(DEP2, GAME).join() === "4", blackReports(DEP2, GAME));

  console.log("\n=== 1. an add-on over the Millennium Dawn shape with one problem of its own ===");
  {
    const own = { "descriptor.mod": 'name="Addon"\ndependencies={ "Dep" }\n', "history/states/1-A.txt": st(1, "1 2 3 4", 0) };
    const a = dir("addon", own);
    const opts = { modRoot: a, gameRoot: GAME, dependencyRoots: [DEP] };
    rec("the validator tells the add-on nothing about the dependency's black province", blackReports(a, GAME, [DEP]).length === 0, blackReports(a, GAME, [DEP]));
    const r = md.fixDuplicateProvinceColors(opts);
    rec("⭐⭐⭐ fixDuplicateProvinceColors recolours nothing of the dependency's", !!r && !r.error && (r.recolored || []).length === 0, r);
    rec("⭐⭐⭐ …and copies neither definition.csv nor provinces.bmp into the add-on", !mapFiles(a).definition && !mapFiles(a).provinces, mapFiles(a));
    const c = dir("addon-click", { ...own, "descriptor.mod": 'name="AddonClick"\ndependencies={ "Dep" }\n' });
    const copts = { modRoot: c, gameRoot: GAME, dependencyRoots: [DEP] };
    const r1 = md.autoFixMap(copts);
    rec("the click ran every fixer — it was not 'nothing to fix'", !!r1 && r1.ok === true && !r1.nothingToFix, r1 && (r1.error || r1.note));
    rec("…and repaired the add-on's own problem", ((r1.fixes || {}).noManpower || {}).fixed === 1, (r1.fixes || {}).noManpower);
    rec("⭐⭐⭐ the whole click recolours no province", (((r1.fixes || {}).dupColors || {}).recolored || []).length === 0, (r1.fixes || {}).dupColors);
    rec("⭐⭐⭐ …and writes neither definition.csv nor provinces.bmp into the add-on", !mapFiles(c).definition && !mapFiles(c).provinces, mapFiles(c));
    const r2 = md.autoFixMap(copts);
    rec("⭐ a second click still recolours nothing and copies no map file", (((r2 && r2.fixes) || {}).dupColors || { recolored: [] }).recolored.length === 0 && !mapFiles(c).definition && !mapFiles(c).provinces,
      { dupColors: ((r2 && r2.fixes) || {}).dupColors, files: mapFiles(c) });
  }

  console.log("\n=== 2. …nor over a dependency whose black province really owns no pixel ===");
  {
    const a = dir("addon2", { "descriptor.mod": 'name="Addon2"\ndependencies={ "DepNoPixels" }\n' });
    const opts = { modRoot: a, gameRoot: GAME, dependencyRoots: [DEP2] };
    rec("THE CONTROL: the add-on is not told about it (the rule's existing ownership contract)", blackReports(a, GAME, [DEP2]).length === 0, blackReports(a, GAME, [DEP2]));
    const r = md.fixDuplicateProvinceColors(opts);
    rec("⭐⭐⭐ Auto-fix does not recolour the dependency's problem for it", !!r && !r.error && (r.recolored || []).length === 0, r);
    rec("⭐⭐⭐ …and copies neither file in", !mapFiles(a).definition && !mapFiles(a).provinces, mapFiles(a));
  }

  console.log("\n=== 3. a verbatim copy of the dependency's definition.csv is not an authorship claim ===");
  {
    // What one Terrain click leaves: the dependency's whole definition.csv, black row and all.
    const a = dir("addon-copy", { "descriptor.mod": 'name="AddonCopy"\ndependencies={ "Dep" }\n', "map/definition.csv": DEP_CSV });
    const opts = { modRoot: a, gameRoot: GAME, dependencyRoots: [DEP] };
    const before = sha(path.join(a, "map", "definition.csv"));
    const r = md.fixDuplicateProvinceColors(opts);
    rec("⭐⭐⭐ the copied black row is left as the dependency wrote it", !!r && (r.recolored || []).length === 0 && sha(path.join(a, "map", "definition.csv")) === before, r);
    rec("⭐⭐⭐ …and the dependency's provinces.bmp is not copied in", !mapFiles(a).provinces, mapFiles(a));
  }

  console.log("\n=== 4. …but a black row the add-on wrote itself IS recoloured, and an untouched bitmap is not copied in ===");
  {
    // The add-on paints the game's province 3 black in its own definition.csv; the game's bitmap has no black pixel for it.
    const a = dir("addon-own", { "descriptor.mod": 'name="AddonOwn"\n', "map/definition.csv": csv(ROWS.slice(0, 3).concat(["3;0;0;0;land;false;unknown;1"])) });
    const opts = { modRoot: a, gameRoot: GAME, dependencyRoots: [] };
    rec("THE CONTROL: the validator reports the add-on's own black province 3", blackReports(a, GAME).join() === "3", blackReports(a, GAME));
    const r = md.fixDuplicateProvinceColors(opts);
    rec("⭐⭐⭐ fixDuplicateProvinceColors recolours it", !!r && (r.recolored || []).length === 1 && r.recolored[0].id === 3, r);
    const row3 = fs.readFileSync(path.join(a, "map", "definition.csv"), "utf8").split(/\r?\n/).find((l) => l.startsWith("3;")) || "";
    rec("…in the add-on's own definition.csv", !/^3;0;0;0;/.test(row3) && /;plains;/.test(row3), row3);
    rec("⭐⭐ it repainted no pixel, and so writes no copy of the game's provinces.bmp into the add-on", r && r.pixelsRepainted === 0 && !mapFiles(a).provinces, { r, files: mapFiles(a) });
    rec("…and the validator has nothing left to report", blackReports(a, GAME).length === 0, blackReports(a, GAME));
  }

  console.log("\n=== 5. the real Millennium Dawn (read-only; only a temp add-on is written) ===");
  {
    const VAN = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
    const MD = "D:/SteamLibrary/steamapps/workshop/content/394360/2777392649";
    const mdCsv = path.join(MD, "map", "definition.csv");
    const blackRow = fs.existsSync(mdCsv) ? fs.readFileSync(mdCsv, "utf8").split(/\r?\n/).find((l) => /^[1-9]\d*;0;0;0;/.test(l)) : null;
    if (!blackRow || !fs.existsSync(path.join(VAN, "map", "provinces.bmp"))) {
      skip("Millennium Dawn (with a black province) or the base game is not installed — the corpus half did NOT run");
    } else {
      const t0 = Date.now();
      const a = dir("addon-md", { "descriptor.mod": 'name="MD addon"\ndependencies={ "Millennium Dawn: A Modern Day Mod" }\n' });
      rec(`THE CONTROL: Millennium Dawn ships a black province (${blackRow.split(";")[0]})`, !!blackRow);
      const r = md.fixDuplicateProvinceColors({ modRoot: a, gameRoot: VAN, dependencyRoots: [MD] });
      rec(`⭐⭐⭐ an add-on over MD has none of MD's rows recoloured (${Date.now() - t0} ms)`, !!r && !r.error && (r.recolored || []).length === 0, r);
      rec("⭐⭐⭐ …and neither MD's 34.6 MB provinces.bmp nor its definition.csv is copied into it", !mapFiles(a).definition && !mapFiles(a).provinces, mapFiles(a));
    }
  }
} catch (e) {
  console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 10).join("\n") : e);
  fails.push("harness error");
} finally {
  for (const d of tmps) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} }
}
console.log(`\n=== auto-fix leaves a black province the mod inherited: ${checks} checks, ${fails.length} failed${skips ? `, ${skips} SKIPPED (not counted as passes)` : ""} ===`);
if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
