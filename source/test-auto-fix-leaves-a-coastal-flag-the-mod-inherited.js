// Auto-fix leaves a coastal flag the mod only inherited alone: one click never copies a base layer's definition.csv
// into a mod to rewrite rows the validator does not report. #auto-fix-leaves-a-coastal-flag-the-mod-inherited
//
// THE DEFECT. autoFixMap calls fixCoastalFlags on every click (and again in the coast settle pass), and it rewrote
// every land row whose coastal column disagreed with the bitmap, including the rows the layer below already ships
// that way. The validator subtracts those (baseCoastalFlagDisagreements); the fixer never did.
//
// MEASURED on the base commit 113d5b5, through the endpoints the Map Errors popup calls (GET /api/map/validate, then
// POST /api/map/auto-fix { modPath }), on a mkdtemp add-on declaring the installed Novum Vexillum as its dependency and
// carrying one problem of its own (NV's state 100 with its state_category line removed): the validator reported
// state_no_category and state_no_manpower and no coastal flag, and ONE click wrote NV's whole map/definition.csv
// (607,977 bytes) into the add-on, differing from NV's file in exactly NV's three rows: 7972 and 15485 (say coastal,
// no sea) and 14650 (touches sea, says not coastal). That copy then shadows NV's own file, so when NV updates its map
// the add-on keeps the old one. It is the "Auto-fix wrote 43.6 MB of MD's map into a 67-byte add-on" class.
//
// THE FIX. fixCoastalFlags subtracts what the layer below already has, with the validator's own
// baseCoastalFlagDisagreements, inside the one function both the rule and Auto-fix call, so they judge the same rows.
// A row the mod itself changed is still repaired (sections 2 and 3). Section 4 asks both at full size, over a dependency
// built from the base game — it used to be the real Novum Vexillum, until NV's 2026-10-02 update corrected its three rows.
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

const HOME = fs.mkdtempSync(path.join(os.tmpdir(), "nova-inhcoast-home-"));
process.env.NOVA_HOME_DIR = HOME;
const md = require("./map-data.js");
const { flipCoastalColumn } = require("./testlib-flipped-coastal-column.js");
const tmps = [HOME];

// 1 | 2 | 3 (sea) | 4 — provinces 2 and 4 border the sea; province 1 does not.
const W = 16, H = 4;
const COL = { 1: [10, 10, 10], 2: [20, 20, 20], 3: [30, 30, 30], 4: [40, 40, 40] };
const provAtX = (x) => Math.min(4, Math.floor(x / 4) + 1);
function bmp() {
  const rowSize = (W * 3 + 3) & ~3, imageSize = rowSize * H;
  const b = Buffer.alloc(54 + imageSize);
  b.write("BM", 0, "ascii");
  b.writeUInt32LE(54 + imageSize, 2); b.writeUInt32LE(54, 10); b.writeUInt32LE(40, 14);
  b.writeInt32LE(W, 18); b.writeInt32LE(H, 22); b.writeUInt16LE(1, 26);
  b.writeUInt16LE(24, 28); b.writeUInt32LE(imageSize, 34);
  for (let y = 0; y < H; y++) { let o = 54 + (H - 1 - y) * rowSize; for (let x = 0; x < W; x++) { const c = COL[provAtX(x)]; b[o++] = c[2]; b[o++] = c[1]; b[o++] = c[0]; } }
  return b;
}
const row = (id, type, coastal) => `${id};${COL[id].join(";")};${type};${coastal};${type === "sea" ? "ocean" : "plains"};${type === "sea" ? 0 : 1}`;
// The honest column is 1:false 2:true 4:true. `over` flips entries.
const DEF = (over = {}) => ["0;0;0;0;land;false;unknown;0",
  row(1, "land", over[1] || "false"), row(2, "land", over[2] || "true"), row(3, "sea", "false"), row(4, "land", over[4] || "true")].join("\n") + "\n";
// A state of the add-on's own. manpower = 0 is a problem the validator reports whoever ships the state, and Auto-fix
// repairs it, so a click on the add-on really runs every fixer.
const STATE = (manpower) => `state = {\n\tid = 1\n\tname = "STATE_1"\n\tmanpower = ${manpower}\n\tstate_category = rural\n\tprovinces = { 1 2 4 }\n\thistory = {\n\t\towner = AAA\n\t}\n}\n`;

function dir(tag, files) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "nova-inhcoast-" + tag + "-")); tmps.push(d);
  for (const [rel, body] of Object.entries(files)) {
    const p = path.join(d, ...rel.split("/"));
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, body);
  }
  return d;
}
const tree = (d) => {
  const out = {};
  const walk = (x) => { for (const e of fs.readdirSync(x, { withFileTypes: true })) { const p = path.join(x, e.name); if (e.isDirectory()) walk(p); else out[path.relative(d, p).replace(/\\/g, "/")] = crypto.createHash("sha1").update(fs.readFileSync(p)).digest("hex"); } };
  walk(d);
  return out;
};
const sameTree = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const lineOf = (d, id) => fs.readFileSync(path.join(d, "map", "definition.csv"), "utf8").split(/\r?\n/).find((l) => l.split(";")[0] === String(id)) || "";
const coastalCol = (d, id) => (lineOf(d, id).split(";")[5] || "").trim();

const GAME = dir("game", { "map/provinces.bmp": bmp(), "map/definition.csv": DEF() });
// A dependency whose definition.csv is wrong both ways for the bitmap it loads over — the Novum Vexillum shape.
const DEP = dir("dep", { "descriptor.mod": 'name="Dep"\n', "map/definition.csv": DEF({ 1: "true", 2: "false" }) });
const coastalReports = (modRoot, deps) => md.validateMapBitmap({ modRoot, gameRoot: GAME, dependencyRoots: deps })
  .filter((p) => p && p.rule === "coastal_province_has_no_sea");

try {
  console.log("\n=== THE CONTROL: the dependency ships a column the bitmap disagrees with, both ways ===");
  {
    const g = md.fixCoastalFlags({ modRoot: DEP, gameRoot: GAME, dependencyRoots: [], dryRun: true });
    rec("the dependency, judged on its own: province 1 says coastal with no sea", !!g && (g.lost || []).join() === "1", g);
    rec("…and province 2 touches sea but says it does not", !!g && (g.gained || []).join() === "2", g);
  }

  console.log("\n=== 1. an add-on with one problem of its own: one click copies no definition.csv in ===");
  {
    const a = dir("addon", { "descriptor.mod": 'name="Addon"\ndependencies={ "Dep" }\n', "history/states/1-Own.txt": STATE(0) });
    const opts = { modRoot: a, gameRoot: GAME, dependencyRoots: [DEP] };
    rec("the validator tells the add-on nothing about the dependency's column", coastalReports(a, [DEP]).length === 0, coastalReports(a, [DEP]).map((p) => p.message));
    const r1 = md.autoFixMap(opts);
    rec("the click ran every fixer — it was not 'nothing to fix'", !!r1 && r1.ok === true && !r1.nothingToFix, r1 && (r1.error || r1.note));
    rec("…and repaired the add-on's own problem", ((r1.fixes || {}).noManpower || {}).fixed === 1, (r1.fixes || {}).noManpower);
    rec("⭐⭐⭐ no map/definition.csv was copied into the add-on", !fs.existsSync(path.join(a, "map", "definition.csv")),
      fs.existsSync(path.join(a, "map")) ? fs.readdirSync(path.join(a, "map")) : "(no map folder)");
    rec("⭐⭐ Auto-fix reports no coastal flag changed", ((r1.fixes || {}).coastalFlags || {}).changed === 0, (r1.fixes || {}).coastalFlags);
    const after1 = tree(a);
    const r2 = md.autoFixMap(opts);
    rec("⭐ a second click writes nothing", !!r2 && r2.ok === true && sameTree(after1, tree(a)), { second: r2 && (r2.nothingToFix ? "nothing to fix" : Object.keys(r2.fixes || {})), files: Object.keys(tree(a)) });
  }

  console.log("\n=== 2. …but a row the add-on changed IS repaired, and only that row ===");
  {
    // The add-on ships the dependency's column (what one Terrain click leaves) and flips province 4 itself.
    const a = dir("addon-own", { "descriptor.mod": 'name="AddonOwn"\ndependencies={ "Dep" }\n', "history/states/1-Own.txt": STATE(1000),
      "map/definition.csv": DEF({ 1: "true", 2: "false", 4: "false" }) });
    const opts = { modRoot: a, gameRoot: GAME, dependencyRoots: [DEP] };
    const shipped1 = lineOf(a, 1), shipped2 = lineOf(a, 2);
    const before = coastalReports(a, [DEP]);
    rec("THE CONTROL: the validator reports the add-on's own flip, and only it", before.length === 1 && (before[0].gained || []).join() === "4" && !(before[0].lost || []).length,
      before.map((p) => ({ lost: p.lost, gained: p.gained })));
    const r = md.autoFixMap(opts);
    rec("the click ran", !!r && r.ok === true && !r.nothingToFix, r && (r.error || r.note));
    rec("⭐⭐⭐ province 4 now says coastal", coastalCol(a, 4) === "true", lineOf(a, 4));
    rec("⭐⭐⭐ the dependency's rows are exactly as the add-on shipped them", lineOf(a, 1) === shipped1 && lineOf(a, 2) === shipped2, { 1: lineOf(a, 1), 2: lineOf(a, 2) });
    rec("⭐⭐ Auto-fix reports the one row it changed", ((r.fixes || {}).coastalFlags || {}).changed === 1, (r.fixes || {}).coastalFlags);
    rec("…and the validator has nothing left to report", coastalReports(a, [DEP]).length === 0, coastalReports(a, [DEP]).map((p) => ({ lost: p.lost, gained: p.gained })));
  }

  console.log("\n=== 3. a type change recomputes its neighbours' flags, and leaves the dependency's alone ===");
  {
    // setProvinceDefinition calls fixCoastalFlags after a type change. On its own that call can never materialise a file:
    // the edit it belongs to has just written the mod's definition.csv. It rewrote the inherited rows in that copy, though.
    const a = dir("addon-edit", { "descriptor.mod": 'name="AddonEdit"\ndependencies={ "Dep" }\n' });
    const opts = { modRoot: a, gameRoot: GAME, dependencyRoots: [DEP] };
    const r = md.setProvinceDefinition({ ...opts, provinceId: 3, type: "land", terrain: "plains" });
    rec("the sea province became land (the edit copies the dependency's definition.csv in, as any edit must)", !!r && r.changed === true && r.wroteFullCsv === true, r && r.error);
    rec("⭐⭐⭐ province 4, which just lost its sea, no longer claims a coast", coastalCol(a, 4) === "false", lineOf(a, 4));
    rec("⭐⭐⭐ province 1's claim is the dependency's, and it is left as the dependency wrote it", coastalCol(a, 1) === "true", lineOf(a, 1));
    rec("⭐⭐ the write reports the one neighbour it recomputed", !!r.coastalFlags && r.coastalFlags.changed === 1, r.coastalFlags);
    rec("…and the validator has nothing to report", coastalReports(a, [DEP]).length === 0, coastalReports(a, [DEP]).map((p) => ({ lost: p.lost, gained: p.gained })));
  }

  console.log("\n=== 4. the same at full size: the base game's definition.csv with three rows flipped, as a dependency (the game is only read) ===");
  {
    // ⚠️ THIS WAS THE REAL NOVUM VEXILLUM until 2026-10-08, and its control asked NV to still ship its three rows. NV's
    // 2026-10-02 update corrected exactly those three (7972 and 15485 now say not coastal, 14650 says coastal), so the
    // control went red while Nova was right. Measured that day, no installed map ships a disagreement of its own — vanilla,
    // MD, MDC, OWB, NV, RoN, R56, Hearts of Minecraft, TEST 31, TEST 32: 0 each — so the full-size case is BUILT, in NV's
    // shape (two rows that say coastal with no sea, one that touches sea and says not), out of the base game's own
    // column, with the rows picked from that file rather than typed (testlib-flipped-coastal-column.js).
    // Nova's rule: a test that needs the installed game FAILS when it is missing.
    const VAN = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
    if (!fs.existsSync(path.join(VAN, "map", "definition.csv")) || !fs.existsSync(path.join(VAN, "map", "provinces.bmp"))) {
      rec("the base game is installed — this section reads its map, and a missing game is a failure, not a pass", false, VAN);
    } else {
      const flipped = flipCoastalColumn(fs.readFileSync(path.join(VAN, "map", "definition.csv"), "utf8"), { lost: 2, gained: 1 });
      const ids = [...flipped.lost, ...flipped.gained], n = ids.length;
      const REAL = dir("dep-real", { "descriptor.mod": 'name="Full-size dependency"\n', "map/definition.csv": flipped.text });
      const t0 = Date.now();
      const own = md.fixCoastalFlags({ modRoot: REAL, gameRoot: VAN, dependencyRoots: [], dryRun: true });
      rec(`THE CONTROL: the dependency's own column disagrees with the base game's bitmap in exactly the ${n} rows flipped, both ways`,
        !!own && (own.lost || []).join() === flipped.lost.join() && (own.gained || []).join() === flipped.gained.join(), { own, flipped: { lost: flipped.lost, gained: flipped.gained } });
      const a = dir("addon-real", { "descriptor.mod": 'name="Full-size addon"\ndependencies={ "Full-size dependency" }\n' });
      const r = md.fixCoastalFlags({ modRoot: a, gameRoot: VAN, dependencyRoots: [REAL] });
      rec(`⭐⭐⭐ Auto-fix's coastal pass on an add-on over it changes none of the dependency's ${n} rows (${Date.now() - t0} ms)`, !!r && r.changed === 0 && !r.error, r);
      rec("THE CONTROL's control: …because it read those rows and left them to the layer below, not because it never saw them", !!r && r.inherited === n, r);
      rec("⭐⭐⭐ …and copies no definition.csv into the add-on", !fs.existsSync(path.join(a, "map", "definition.csv")),
        fs.existsSync(path.join(a, "map")) ? fs.readdirSync(path.join(a, "map")) : "(no map folder)");
      // The positive twin at the same size (section 2's, full-scale): a row the add-on flipped ITSELF is still repaired.
      const mine = flipCoastalColumn(flipped.text, { gained: 1, skip: new Set(ids) });
      const b = dir("addon-real-own", { "descriptor.mod": 'name="Full-size addon, own row"\ndependencies={ "Full-size dependency" }\n', "map/definition.csv": mine.text });
      const shipped = Object.fromEntries(ids.map((id) => [id, lineOf(b, id)]));
      const r2 = md.fixCoastalFlags({ modRoot: b, gameRoot: VAN, dependencyRoots: [REAL] });
      rec("⭐⭐ …while the one row the add-on flipped itself IS repaired, and only that row", !!r2 && r2.changed === 1 && (r2.gained || []).join() === mine.gained.join()
        && !(r2.lost || []).length && coastalCol(b, mine.gained[0]) === "true", { r2, row: lineOf(b, mine.gained[0]) });
      rec("⭐⭐ …and the dependency's rows in the add-on's copy are exactly as it shipped them", ids.every((id) => lineOf(b, id) === shipped[id]),
        ids.map((id) => [shipped[id], lineOf(b, id)]));
    }
  }
} catch (e) {
  console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 10).join("\n") : e);
  fails.push("harness error");
} finally {
  for (const d of tmps) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} }
}
console.log(`\n=== auto-fix leaves a coastal flag the mod inherited: ${checks} checks, ${fails.length} failed${skips ? `, ${skips} SKIPPED (not counted as passes)` : ""} ===`);
if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
