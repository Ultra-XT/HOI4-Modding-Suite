// definition.csv's `coastal` column is DERIVED from the bitmap, not authored — and changing one province's
// type invalidates its neighbours' flags, not just its own.
// #the-coastal-column-is-derived
//
// THE OWNER'S ISLAND CRASH, final cause. After the dockyard fix his error.log came down to ten lines and
// nothing else, and the game still died:
//
//   map.cpp:1963  Bitmap and province definition disagree on whether or not province 351 is coastal.
//                 Bitmap adjacency result will be prefered.        (…ten of them)
//   EXCEPTION_INT_DIVIDE_BY_ZERO
//
// ⭐⭐⭐ CONFIRMED AGAINST THE GAME ITSELF, 2026-09-09. The rule was derived from vanilla and five workshop
// maps; this is the check that matters more, because the oracle is HOI4's own output. The crash folder
// hoi4_20260909_190730 (nova_island2) carries an error.log naming exactly ten provinces:
//
//   351, 3150, 6300, 9383, 9392, 11136, 11270, 11299, 11317, 11378
//
// Running landProvincesTouchingSea against that mod and diffing it against the mod's own definition.csv
// returns those ten province ids, in that order. Not a superset, not a subset — the same ten, with nothing
// the game did not name and nothing it did. A rule reproducing the engine's answer exactly on a real broken
// map is as close to proof as this project gets, and it is the answer to the trap in the sibling-wiki note:
// a rule that makes things land flush is not proved by the flushness it produces. This one was checked
// against a source that had no idea Nova existed.
//
// Turning four ocean provinces into land took the only sea neighbour away from ten provinces elsewhere.
// Their `coastal = true` was true when written and a lie afterwards. The wiki says the flag "means that a
// border with a sea province (not a lake)" and that the bitmap wins where they disagree — but something
// downstream still divides by zero.
//
// ⚠️ THE COLUMN IS MAINTAINED EXACTLY BY EVERYONE ELSE. Land provinces whose flag disagrees with the
// bitmap, in either direction:
//     vanilla 0 · Rise of Nations 0 · Old World Blues 0 · Millennium Dawn 0 · Road to 56 0
//     Novum Vexillum 2 (of ~13,000)
//     the Nova mod that LAUNCHES 0        the Nova mod that CRASHES 10
// Nova was the only thing not maintaining it.
//
// ⚠️⚠️ NOT A SAVE-GATING FATAL, and the reason matters: Novum Vexillum ships two and people play it. A rule
// that blocks a save on something shipping content does is the cry-wolf this project keeps having to undo.
// Auto-fix repairs it deterministically instead.
// ⛔ CORRECTION, 2026-09-11: the divide-by-zero above was NOT this. The three divide-by-zero crashes of 2026-09-09
// share their stack with that day's access violations — the flag-atlas fault, a country_tags filename — and one of
// those (hoi4_20260909_200315) has no coastal lines at all. So the rule is a WARNING again: HOI4 logs the
// disagreement and plays the bitmap. #a-map-message-matches-what-the-engine-checks
//
// ⭐ FOUND BY THE OWNER'S SUGGESTION — read what the established tools do. ScottyThePilot's
// hoi4_province_editor carries a dedicated command for exactly this, "Auto-generating which provinces are
// coastal (Shift-C)", which exists because a type change invalidates the neighbourhood. Nova had nothing.
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

// ── 🈯 THE MEASUREMENT THE RULE RESTS ON, re-derived so it cannot rot ────────────────────────────────
console.log("\n=== 🈯 how exactly do shipping maps maintain the coastal column? ===");
{
  if (!fs.existsSync(path.join(GAME, "map", "provinces.bmp"))) console.log("  ..   (the base game is not installed)");
  else {
    const roots = [["vanilla", GAME]];
    if (fs.existsSync(WS)) for (const id of fs.readdirSync(WS)) {
      const p = path.join(WS, id);
      if (fs.existsSync(path.join(p, "map", "provinces.bmp"))) roots.push(["ws-" + id, p]);
    }
    let checked = 0, land = 0, worst = 0;
    for (const [label, root] of roots) {
      const m = md.buildMapModel({ modRoot: root, gameRoot: GAME, dependencyRoots: [] });
      const coastal = md.landProvincesTouchingSea({ modRoot: root, gameRoot: GAME, dependencyRoots: [], model: m });
      if (!coastal) continue;
      let wrong = 0, n = 0;
      for (const p of m.provinces || []) {
        if (!(p.id > 0) || p.type !== "land") continue;
        n++;
        if (!!p.coastal !== coastal.has(p.id)) wrong++;
      }
      checked++; land += n; if (wrong > worst) worst = wrong;
      console.log(`     ${label.padEnd(16)} ${String(wrong).padStart(4)} wrong of ${n} land provinces`);
    }
    ok(checked >= 2 && land > 10000, `${checked} map(s), ${land} land provinces — a real corpus`, { checked, land });
    ok(worst <= 3, "⭐⭐⭐ every shipping map keeps the column within 3 of the bitmap — it is derived, not authored", worst);
  }
}

// ── the fixture ──────────────────────────────────────────────────────────────────────────────────────
// 1 | 2 | 3(sea) | 4 — province 2 and 4 border the sea, province 1 does not.
function makeMod() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "nova-coastcol-")); tmps.push(d);
  fs.mkdirSync(path.join(d, "map"), { recursive: true });
  fs.writeFileSync(path.join(d, "descriptor.mod"), 'name="CC"\nreplace_path="map"\n');
  const W = 16, H = 4;
  const COL = { 1: [10, 10, 10], 2: [20, 20, 20], 3: [30, 30, 30], 4: [40, 40, 40] };
  const provAtX = (x) => Math.min(4, Math.floor(x / 4) + 1);
  const rowSize = (W * 3 + 3) & ~3, imageSize = rowSize * H;
  const bmp = Buffer.alloc(54 + imageSize);
  bmp.write("BM", 0, "ascii");
  bmp.writeUInt32LE(54 + imageSize, 2); bmp.writeUInt32LE(54, 10); bmp.writeUInt32LE(40, 14);
  bmp.writeInt32LE(W, 18); bmp.writeInt32LE(H, 22); bmp.writeUInt16LE(1, 26);
  bmp.writeUInt16LE(24, 28); bmp.writeUInt32LE(imageSize, 34);
  for (let y = 0; y < H; y++) { let o = 54 + (H - 1 - y) * rowSize; for (let x = 0; x < W; x++) { const c = COL[provAtX(x)]; bmp[o++] = c[2]; bmp[o++] = c[1]; bmp[o++] = c[0]; } }
  fs.writeFileSync(path.join(d, "map", "provinces.bmp"), bmp);
  fs.writeFileSync(path.join(d, "map", "definition.csv"), [
    "0;0;0;0;land;false;unknown;0",
    "1;10;10;10;land;false;plains;1",
    "2;20;20;20;land;true;plains;1",     // correct: borders sea province 3
    "3;30;30;30;sea;false;ocean;0",
    "4;40;40;40;land;true;plains;1",     // correct: borders sea province 3
  ].join("\n") + "\n");
  return d;
}
const csvOf = (d) => fs.readFileSync(path.join(d, "map", "definition.csv"), "utf8");
const coastalOf = (d, id) => {
  const row = csvOf(d).split(/\r?\n/).find((l) => l.split(";")[0] === String(id)) || "";
  return (row.split(";")[5] || "").trim().toLowerCase();
};
const NOGAME = path.join(os.tmpdir(), "__no_game_coastcol__");

// ── ✅ a correct map is left completely alone ────────────────────────────────────────────────────────
console.log("\n=== ✅ a map whose column already matches is untouched ===");
{
  const d = makeMod();
  const before = csvOf(d);
  const r = md.fixCoastalFlags({ modRoot: d, gameRoot: NOGAME, dependencyRoots: [] });
  ok(r.changed === 0, "⭐⭐ nothing to change", r);
  ok(csvOf(d) === before, "…and definition.csv is byte-identical — no churn in the modder's diff", true);
}

// ── ⛔ the finding: turning the sea into land landlocks its neighbours ───────────────────────────────
console.log("\n=== ⛔ raising the sea makes its neighbours' flags a lie ===");
{
  const d = makeMod();
  const r = md.setProvinceDefinition({ modRoot: d, gameRoot: NOGAME, dependencyRoots: [], provinceId: 3, type: "land", terrain: "plains" });
  ok(!r.error && r.changed, "province 3 became land", r.error);
  ok(!!r.coastalFlags && r.coastalFlags.changed === 2,
    "⭐⭐⭐ the write path recomputed the two neighbours that just lost their sea", r.coastalFlags);
  ok(coastalOf(d, 2) === "false", "…province 2 no longer claims a coast", coastalOf(d, 2));
  ok(coastalOf(d, 4) === "false", "…nor does province 4", coastalOf(d, 4));
  ok(coastalOf(d, 1) === "false", "⚠️ …and province 1, which never claimed one, is unchanged", coastalOf(d, 1));

  const probs = md.validateMapBitmap({ modRoot: d, gameRoot: NOGAME, dependencyRoots: [] })
    .filter((p) => p.rule === "coastal_province_has_no_sea");
  ok(probs.length === 0, "⭐⭐ …and the validator has nothing left to report", probs.map((p) => String(p.message).slice(0, 90)));
}

// ── ⭐ the other direction: land that GAINS a sea neighbour must start claiming it ───────────────────
console.log("\n=== ⭐ and the reverse — new ocean makes its neighbours coastal ===");
{
  const d = makeMod();
  // province 1 is inland; make province 2 sea, and 1 becomes coastal
  const r = md.setProvinceDefinition({ modRoot: d, gameRoot: NOGAME, dependencyRoots: [], provinceId: 2, type: "sea", terrain: "ocean" });
  ok(!r.error, "province 2 became sea", r.error);
  ok(coastalOf(d, 1) === "true",
    "⭐⭐⭐ province 1 now borders ocean and says so — both directions are maintained", coastalOf(d, 1));
}

// ── ⭐⭐ a map already in the broken state is reported and repaired ──────────────────────────────────
console.log("\n=== ⭐⭐ an existing map is reported, and Auto-fix repairs it ===");
{
  const d = makeMod();
  // flip the type directly in the csv, so nothing recomputes — the state the owner's mod was in
  fs.writeFileSync(path.join(d, "map", "definition.csv"),
    csvOf(d).replace("3;30;30;30;sea;false;ocean;0", () => "3;30;30;30;land;false;plains;1"));

  const probs = md.validateMapBitmap({ modRoot: d, gameRoot: NOGAME, dependencyRoots: [] })
    .filter((p) => p.rule === "coastal_province_has_no_sea");
  ok(probs.length === 1, "⭐⭐⭐ the validator reports it", probs.map((p) => p.rule));
  // Moved with #a-map-message-matches-what-the-engine-checks: a WARNING — HOI4 logs the disagreement and plays the
  // bitmap, and the divide-by-zero it sat beside was the flag atlas (see the header's correction).
  ok(probs.length === 1 && probs[0].severity === "warning", "…as a WARNING", probs[0] && probs[0].severity);
  ok(isFatalRule("coastal_province_has_no_sea") === false,
    "⚠️⚠️ …but NOT a Save-gating fatal — Novum Vexillum ships two and people play it", true);

  const fix = md.fixCoastalFlags({ modRoot: d, gameRoot: NOGAME, dependencyRoots: [] });
  ok(fix.changed === 2 && fix.lost.length === 2, "⭐⭐⭐ Auto-fix recomputes the column", fix);
  const after = md.validateMapBitmap({ modRoot: d, gameRoot: NOGAME, dependencyRoots: [] })
    .filter((p) => p.rule === "coastal_province_has_no_sea");
  ok(after.length === 0, "…and the map comes back clean", after.map((p) => String(p.message).slice(0, 90)));
}

// ── ⚠️ sea and lake rows are not ours to rewrite ─────────────────────────────────────────────────────
console.log("\n=== ⚠️ only LAND rows are touched ===");
{
  const d = makeMod();
  // give the sea row a coastal=true it should keep — the column means something else for water
  fs.writeFileSync(path.join(d, "map", "definition.csv"),
    csvOf(d).replace("3;30;30;30;sea;false;ocean;0", () => "3;30;30;30;sea;true;ocean;0"));
  const r = md.fixCoastalFlags({ modRoot: d, gameRoot: NOGAME, dependencyRoots: [] });
  ok(r.changed === 0, "the sea row is left alone", r);
  ok(coastalOf(d, 3) === "true", "…with its own flag exactly as the modder wrote it", coastalOf(d, 3));
}

tmps.forEach((d) => { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} });
console.log(`\n=== the coastal column is derived: ${pass} checks, ${fails.length} failed ===`);
fails.forEach((f) => console.log("   FAILED: " + f));
process.exit(fails.length ? 1 : 0);
