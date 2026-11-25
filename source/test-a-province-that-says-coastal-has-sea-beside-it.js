// definition.csv saying `coastal = true` must mean the bitmap actually puts sea beside it.
// #a-province-says-coastal-with-no-sea
//
// FOUND BY THE OWNER's launch. HOI4 logs the disagreement and then quietly refuses the province's port:
//
//   map.cpp:1963       Bitmap and province definition disagree on whether or not province 351 is coastal.
//                      Bitmap adjacency result will be prefered.        (…and 9 more provinces)
//   statehistory.cpp:306  Trying to set invalid province building "naval_base" to province #6300.
//
// Nothing crashes. A strategic building simply stops existing, with a log line nobody reads.
//
// ⚠️ ONE EDIT DOES IT WHOLESALE. Turning a single OPEN-OCEAN province into land can landlock every coast
// that touched it. On the owner's mod, making provinces 2918 and 2942 land left ELEVEN provinces scattered
// around the world still claiming coastal — because 2942 was the only sea neighbour each of them had. Their
// definition.csv rows were byte-identical to vanilla; it was the water that moved.
//
// ⚠️ The rule is honest. Land provinces marked coastal whose bitmap gives them no sea:
//     vanilla 0 of 2,362 · Millennium Dawn 0 of 2,750 · Old World Blues 0 of 4,421 · one workshop mod 2 of 2,753
// Two exceptions in 12,286 provinces, so this cannot cry wolf on shipping content.
//
// It is a WARNING, not an error: HOI4 loads, prefers the bitmap, and drops the naval base.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const md = require("./map-data.js");
const { isFatalRule } = require("./public/map-rule-labels.js");

let pass = 0;
const fails = [];
const ok = (cond, label, detail) => {
  if (cond === true) { pass++; console.log("  ok   " + label); }
  else { fails.push(label); console.log("  FAIL " + label + (detail !== undefined ? "   -> " + JSON.stringify(detail).slice(0, 350) : "")); }
};

const GAME = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
const WS = "D:/SteamLibrary/steamapps/workshop/content/394360";
const tmps = [];
const NOGAME = path.join(os.tmpdir(), "__nova_no_game_coastal__");

// ── ⚠️ ANTI-CRY-WOLF FIRST ───────────────────────────────────────────────────────────────────────────
console.log("\n=== ⚠️ shipping maps keep coastal=true and the bitmap in step ===");
{
  let checked = 0;
  for (const [label, id] of [["Millennium Dawn", "2777392649"], ["Old World Blues", "2265420196"]]) {
    const root = path.join(WS, id);
    if (!fs.existsSync(path.join(root, "map", "provinces.bmp"))) { console.log(`  ..   (${label} not installed)`); continue; }
    const r = md.fixCoastalNoPort({ modRoot: root, gameRoot: GAME, dependencyRoots: [], dryRun: true });
    if (r && r.error) { console.log(`  ..   (${label}: ${r.error})`); continue; }
    checked++;
    ok((r.coastalLies || []).length === 0,
      `⭐⭐⭐ ${label}: not one province claims coastal without sea beside it`, (r.coastalLies || []).slice(0, 8));
  }
  ok(checked >= 1, `${checked} shipping mod(s) checked`, checked);
}

// ── the finding ──────────────────────────────────────────────────────────────────────────────────────
console.log("\n=== ⛔ turning the sea beside a coast into land is reported ===");
{
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "nova-coastlie-")); tmps.push(d);
  fs.writeFileSync(path.join(d, "descriptor.mod"), 'name="CL"\nreplace_path="map"\nreplace_path="history/states"\n');
  fs.mkdirSync(path.join(d, "map"), { recursive: true });

  // Two land columns (1, 2) and one sea column (3). Province 2 is coastal ONLY because of 3.
  const W = 12, H = 4;
  const COL = { 1: [10, 10, 10], 2: [20, 20, 20], 3: [30, 30, 30] };
  const provAtX = (x) => (x < 4 ? 1 : x < 8 ? 2 : 3);
  const rowSize = (W * 3 + 3) & ~3, imageSize = rowSize * H;
  const bmp = Buffer.alloc(54 + imageSize);
  bmp.write("BM", 0, "ascii");
  bmp.writeUInt32LE(54 + imageSize, 2); bmp.writeUInt32LE(54, 10); bmp.writeUInt32LE(40, 14);
  bmp.writeInt32LE(W, 18); bmp.writeInt32LE(H, 22); bmp.writeUInt16LE(1, 26);
  bmp.writeUInt16LE(24, 28); bmp.writeUInt32LE(imageSize, 34);
  for (let y = 0; y < H; y++) { let o = 54 + (H - 1 - y) * rowSize; for (let x = 0; x < W; x++) { const c = COL[provAtX(x)]; bmp[o++] = c[2]; bmp[o++] = c[1]; bmp[o++] = c[0]; } }
  fs.writeFileSync(path.join(d, "map", "provinces.bmp"), bmp);
  fs.mkdirSync(path.join(d, "history", "states"), { recursive: true });
  fs.writeFileSync(path.join(d, "history", "states", "1.txt"),
    'state = {\n\tid = 1\n\tname = "STATE_1"\n\tmanpower = 1000\n\tstate_category = rural\n\tprovinces = { 1 2 }\n\thistory = {\n\t\towner = AAA\n\t}\n}\n');
  fs.writeFileSync(path.join(d, "map", "buildings.txt"), "1;naval_base_spawn;5.00;9.50;2.00;0.00;3\n");

  const csv = (seaType) => [
    "0;0;0;0;land;false;unknown;0",
    "1;10;10;10;land;false;plains;1",
    "2;20;20;20;land;true;plains;1",
    `3;30;30;30;${seaType};false;${seaType === "sea" ? "ocean" : "plains"};${seaType === "sea" ? 0 : 1}`,
  ].join("\n") + "\n";

  // Before: province 3 is sea, so province 2's `coastal = true` is honest.
  fs.writeFileSync(path.join(d, "map", "definition.csv"), csv("sea"));
  const before = md.fixCoastalNoPort({ modRoot: d, gameRoot: NOGAME, dependencyRoots: [], dryRun: true });
  ok((before.coastalLies || []).length === 0,
    "while the sea is there, nothing is reported", before.coastalLies);

  // Now turn the sea into land — exactly what building an island does to the coast that touched it.
  fs.writeFileSync(path.join(d, "map", "definition.csv"), csv("land"));
  const after = md.fixCoastalNoPort({ modRoot: d, gameRoot: NOGAME, dependencyRoots: [], dryRun: true });
  ok((after.coastalLies || []).indexOf(2) >= 0,
    "⭐⭐⭐ province 2 still says coastal and now has no sea — reported", after.coastalLies);
  ok((after.coastalLies || []).indexOf(1) < 0,
    "⚠️ …and province 1, which never claimed coastal, is not", after.coastalLies);

  // …and the validator surfaces it, as a warning rather than an error.
  const probs = md.validateMapBitmap({ modRoot: d, gameRoot: NOGAME, dependencyRoots: [] });
  const p = probs.find((x) => x.rule === "coastal_province_has_no_sea");
  ok(!!p, "⭐⭐ the validator raises coastal_province_has_no_sea", probs.map((x) => x.rule));
  // ⛔ BACK TO A WARNING, AND THIS TEST MOVED WITH IT A SECOND TIME. #a-map-message-matches-what-the-engine-checks
  // It was promoted to an error because it was the last thing in a crash log that ended in
  // EXCEPTION_INT_DIVIDE_BY_ZERO. The crash folders disagree: the three divide-by-zero crashes of 2026-09-09
  // (161141, 174556, 190730) share their stack with the three access violations of that day (153814, 173729,
  // 200315) — the flag-atlas fault, a country_tags filename — and 200315 carries no coastal lines at all. HOI4 logs
  // the disagreement and plays the bitmap. test-a-coastal-flag-disagreement-is-a-warning-about-what-the-mod-changed.js
  ok(!!p && p.severity === "warning",
    "⭐ …as a WARNING — HOI4 logs it and uses the bitmap; the divide-by-zero beside it was the flag atlas", p && p.severity);
  ok(isFatalRule("coastal_province_has_no_sea") === false,
    "⚠️⚠️ …but NOT a Save-gating fatal: Novum Vexillum ships two and people play it", true);
  ok(!!p && /derived/i.test(p.message),
    "…and the message says the column is derived from the bitmap, which is the fix", p && String(p.message).slice(0, 140));
}

// ── the rule has a label, or Mod Health shows a raw token ────────────────────────────────────────────
console.log("\n=== the new rule is presentable ===");
{
  const L = fs.readFileSync(path.join(__dirname, "public", "map-rule-labels.js"), "utf8");
  ok(/coastal_province_has_no_sea\s*:/.test(L), "it has a human label", true);
  ok(isFatalRule("coastal_province_has_no_sea") === false,
    "⚠️ …and is NOT in the curated fatal set — a shipping mod trips it, so Save must not be gated on it", true);
}

tmps.forEach((d) => { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} });
console.log(`\n=== a province that says coastal has sea beside it: ${pass} checks, ${fails.length} failed ===`);
fails.forEach((f) => console.log("   FAILED: " + f));
process.exit(fails.length ? 1 : 0);
