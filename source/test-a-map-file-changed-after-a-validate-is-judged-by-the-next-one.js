// A map file the mod changes after a validate is judged by the next validate in the same process — a paint or a new region file
// opens the rules gated on what the mod changed, FATAL fractioned_naval_region among them. #a-map-file-changed-after-a-validate-is-asked-again
//
// THE DEFECT. modChangedMapFile ("do the mod's bytes for this map file differ from the base game's?") gates the unit check,
// naval_base_sea_zone_invalid, the unitstacks rule and fractioned_naval_region. Its answer was cached per process under (mod, game,
// path) alone. Nova's server is one long-lived process: the map page validates when it opens, the modder paints — which writes
// provinces.bmp into the mod — and Save's re-check asks again, and was told "not changed" for the rest of the session. Measured
// 2026-09-15 on the base commit (scratchpad batch7/speed probe-stale-changed.js): after a paint, the same process missed
// fleet_starts_on_land_with_no_sea that a fresh process reported.
//
// Fixture: an 8x4 base game (bottom row sea 25-32; region 1 is sea 25-27, region 2 everything else) with a fleet at coastal 18.
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

const FRESH = process.argv[2] === "--fresh";
const HOME = fs.mkdtempSync(path.join(os.tmpdir(), "nova-changedlater-home-"));
process.env.NOVA_HOME_DIR = HOME;
process.env.NOVA_APP_DATA_DIR = HOME; process.env.APPDATA = HOME; process.env.XDG_CONFIG_HOME = HOME;
const md = require("./map-data.js");
const FRAC = "fractioned_naval_region", FLEET = "fleet_starts_on_land_with_no_sea";
const pick = (probs) => (probs || []).filter((p) => p.rule === FRAC || p.rule === FLEET)
  .map((p) => ({ rule: p.rule, severity: p.severity, provinces: (p.provinces || []).slice().sort((a, b) => a - b) }))
  .sort((a, b) => (a.rule < b.rule ? -1 : 1));

if (FRESH) {
  const [, , , mod, game] = process.argv;
  process.stdout.write(JSON.stringify(pick(md.validateMapBitmap({ modRoot: mod, gameRoot: game, dependencyRoots: [] }))) + "\n");
  try { fs.rmSync(HOME, { recursive: true, force: true }); } catch (_) {}
  process.exit(0);
}

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (ok || detail == null ? "" : "   -> " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 400)));
  if (!ok) fails.push(label);
};
const tmps = [HOME];
const pause = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

const W = 512, H = 256;
const provAt = (x, y) => Math.floor(x / 64) + Math.floor(y / 64) * 8 + 1;          // 8x4, provinces 1-32
const COL = (p) => [((p * 37) % 200) + 20, ((p * 71) % 200) + 20, ((p * 113) % 200) + 20];
function bmp24(fn) {
  const rs = (W * 3 + 3) & ~3, is = rs * H; const b = Buffer.alloc(54 + is);
  b.write("BM", 0, "ascii"); b.writeUInt32LE(54 + is, 2); b.writeUInt32LE(54, 10); b.writeUInt32LE(40, 14);
  b.writeInt32LE(W, 18); b.writeInt32LE(H, 22); b.writeUInt16LE(1, 26); b.writeUInt16LE(24, 28); b.writeUInt32LE(is, 34);
  for (let y = 0; y < H; y++) { let o = 54 + (H - 1 - y) * rs; for (let x = 0; x < W; x++) { const [r, g, bl] = COL(fn(x, y)); b[o++] = bl; b[o++] = g; b[o++] = r; } }
  return b;
}
const mk = (root, rel, body) => { const p = path.join(root, ...rel.split("/")); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, body); return p; };
const region = (id, provs) => `strategic_region = {\n\tid = ${id}\n\tname = "REGION_${id}"\n\tprovinces = {\n\t\t${provs.join(" ")}\n\t}\n}\n`;
const all = Array.from({ length: 32 }, (_, i) => i + 1);

try {
  const GAME = fs.mkdtempSync(path.join(os.tmpdir(), "nova-changedlater-game-")); tmps.push(GAME);
  const rows = ["0;0;0;0;land;false;unknown;0"];
  for (const p of all) { const [r, g, b] = COL(p); const sea = p >= 25; rows.push(`${p};${r};${g};${b};${sea ? "sea" : "land"};${!sea && p >= 17 ? "true" : "false"};${sea ? "ocean" : "plains"};${sea ? 0 : 1}`); }
  mk(GAME, "map/provinces.bmp", bmp24(provAt));
  mk(GAME, "map/definition.csv", rows.join("\n") + "\n");
  mk(GAME, "map/strategicregions/1-R1.txt", region(1, [25, 26, 27]));
  mk(GAME, "map/strategicregions/2-R2.txt", region(2, all.filter((p) => p < 25 || p > 27)));
  const st = (id, provs) => `state = {\n\tid = ${id}\n\tname = "STATE_${id}"\n\tmanpower = 1000\n\tstate_category = rural\n\tprovinces = { ${provs.join(" ")} }\n\thistory = {\n\t\towner = AAA\n\t}\n}\n`;
  for (let s = 0; s < 3; s++) mk(GAME, `history/states/${s + 1}.txt`, st(s + 1, all.slice(s * 8, s * 8 + 8)));
  mk(GAME, "history/countries/AAA - Aland.txt", 'capital = 1\nset_naval_oob = "AAA_naval"\n');
  mk(GAME, "history/units/AAA_naval.txt", 'units = {\n\tfleet = {\n\t\tname = "Home Fleet"\n\t\tnaval_base = 18\n\t\ttask_force = {\n\t\t\tname = "Bay Squadron"\n\t\t\tlocation = 18\n\t\t}\n\t}\n}\n');

  // The paint: sea 25, 26 and 27 painted as the land above them. 18 loses its only sea; region 1's three provinces lose every pixel.
  const painted = (x, y) => { const p = provAt(x, y); return p >= 25 && p <= 27 ? p - 8 : p; };
  const fresh = (mod) => JSON.parse(execFileSync(process.execPath, [__filename, "--fresh", mod, GAME], { encoding: "utf8" }).trim().split("\n").pop());

  console.log("\n=== 1. an add-on validates, then paints provinces.bmp into itself ===");
  const MOD = fs.mkdtempSync(path.join(os.tmpdir(), "nova-changedlater-mod-")); tmps.push(MOD);
  mk(MOD, "descriptor.mod", 'name="Painted later"\n');
  const opts = { modRoot: MOD, gameRoot: GAME, dependencyRoots: [] };
  const v1 = pick(md.validateMapBitmap(opts));
  rec("THE CONTROL: before the paint neither rule fires", v1.length === 0, v1);
  const BMP = mk(MOD, "map/provinces.bmp", bmp24(painted));
  const v2 = pick(md.validateMapBitmap(opts));
  const control = fresh(MOD);
  rec("THE CONTROL: a fresh process validating the painted add-on reports the cut region (FATAL) and the stranded fleet",
    control.some((p) => p.rule === FRAC) && control.some((p) => p.rule === FLEET), control);
  const frac = v2.find((p) => p.rule === FRAC);
  rec("⭐⭐⭐ the next validate in the same process reports the naval region the paint cut apart", !!frac && frac.severity === "error", v2);
  rec("⭐⭐ …as the fresh process does, province for province", JSON.stringify(v2) === JSON.stringify(control), { sameProcess: v2, freshProcess: control });

  console.log("\n=== 2. the paint is undone: the add-on's provinces.bmp is the base game's bytes again ===");
  pause(30);
  fs.writeFileSync(BMP, fs.readFileSync(path.join(GAME, "map", "provinces.bmp")));
  const v3 = pick(md.validateMapBitmap(opts));
  rec("⭐⭐ a bitmap back to the base game's bytes is not a change: neither rule fires", v3.length === 0, v3);

  console.log("\n=== 3. a second add-on validates, then adds a strategic-region file ===");
  const MOD2 = fs.mkdtempSync(path.join(os.tmpdir(), "nova-changedlater-mod2-")); tmps.push(MOD2);
  mk(MOD2, "descriptor.mod", 'name="Regions later"\n');
  const opts2 = { modRoot: MOD2, gameRoot: GAME, dependencyRoots: [] };
  const w1 = pick(md.validateMapBitmap(opts2));
  rec("THE CONTROL: before the region file neither rule fires", w1.length === 0, w1);
  // region 1 loses 26, which gets a region of its own: 25 and 27 no longer touch inside region 1
  mk(MOD2, "map/strategicregions/1-R1.txt", region(1, [25, 27]));
  mk(MOD2, "map/strategicregions/3-R3.txt", region(3, [26]));
  const w2 = pick(md.validateMapBitmap(opts2));
  const control2 = fresh(MOD2);
  rec("THE CONTROL: a fresh process reports region 1 cut in two", control2.some((p) => p.rule === FRAC), control2);
  rec("⭐⭐⭐ the next validate in the same process reports it too (a folder the mod did not have when first asked)", JSON.stringify(w2) === JSON.stringify(control2) && w2.some((p) => p.rule === FRAC), { sameProcess: w2, freshProcess: control2 });
} catch (e) {
  console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
  fails.push("harness error");
} finally {
  for (const d of tmps) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} }
}
console.log(`\n=== a map file changed after a validate is judged by the next one: ${checks} checks, ${fails.length} failed ===`);
if (fails.length) fails.forEach((x) => console.log("   FAILED: " + x));
process.exit(fails.length ? 1 : 0);
