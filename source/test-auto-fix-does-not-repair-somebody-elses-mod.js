// Auto-fix must never write into a file the mod only INHERITS.
// #x-crossing-autofix-repairs-somebody-elses-mod
//
// fixMapXCrossings ended with `safeModWrite(bmpSrc, buf, …)`, and bmpSrc comes from loadProvincesBmp, which
// resolves mod → dependency → game. An add-on with no map/ folder of its own therefore had its bitmap read
// from the DEPENDENCY and the repair written straight back into it: a workshop mod the user did not write,
// in someone else's Steam folder.
//
// ⚠️ No guard stood in the way, and it is worth being exact about why:
//     • the `samePath(modRoot, gameRoot)` test at the top of the function only fires when the MOD IS the game
//     • safeModWrite's assertWritable (assertPathNotInGameRoot) only knows the INSTALLED game root — a
//       workshop mod is not it
// Reproduced with server.js required first, so the real assertWritable was registered: one call on a
// two-file add-on rewrote the dependency's bitmap, three bytes changed, no .bak left behind.
//
// fixAdjacenciesFile, thirty lines below in the same file, already had the right shape — "only fix the mod's
// own file". This was the single site in map-data.js writing to a resolved source path instead of a
// mod-rooted one, and this test pins that: it DERIVES the write targets from the source rather than naming
// them, so a new fixer with the same shape fails here instead of shipping.
//
// It DECLINES rather than materialising, on purpose: copying a 34 MB provinces.bmp into the mod to fix one
// pixel makes the add-on the owner of all 13,000 of the dependency's provinces (#inherited-buildings-not-yours,
// which once turned one "New state" click into 160 warnings).
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const md = require("./map-data.js");
const { maskJsComments } = require("./testlib-strip-comments.js");

let pass = 0;
const fails = [];
const ok = (cond, label, detail) => {
  if (cond === true) { pass++; console.log("  ok   " + label); }
  else { fails.push(label); console.log("  FAIL " + label + (detail !== undefined ? "   -> " + JSON.stringify(detail).slice(0, 400) : "")); }
};

const tmps = [];

// A 4x4 bitmap whose centre is a deliberate X-crossing: four provinces meeting at one pixel corner.
function xCrossingBmp() {
  const W = 4, H = 4;
  const COL = [[10, 10, 10], [20, 20, 20], [30, 30, 30], [40, 40, 40]];
  const quad = (x, y) => (y < 2 ? (x < 2 ? 0 : 1) : (x < 2 ? 2 : 3));
  const rowSize = (W * 3 + 3) & ~3, imageSize = rowSize * H;
  const bmp = Buffer.alloc(54 + imageSize);
  bmp.write("BM", 0, "ascii");
  bmp.writeUInt32LE(54 + imageSize, 2); bmp.writeUInt32LE(54, 10); bmp.writeUInt32LE(40, 14);
  bmp.writeInt32LE(W, 18); bmp.writeInt32LE(H, 22); bmp.writeUInt16LE(1, 26);
  bmp.writeUInt16LE(24, 28); bmp.writeUInt32LE(imageSize, 34);
  for (let y = 0; y < H; y++) { let o = 54 + (H - 1 - y) * rowSize; for (let x = 0; x < W; x++) { const c = COL[quad(x, y)]; bmp[o++] = c[2]; bmp[o++] = c[1]; bmp[o++] = c[0]; } }
  return bmp;
}
const CSV = "0;0;0;0;land;false;unknown;0\n1;10;10;10;land;false;plains;1\n2;20;20;20;land;false;plains;1\n3;30;30;30;land;false;plains;1\n4;40;40;40;land;false;plains;1\n";

function scene() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "nova-xcross-")); tmps.push(tmp);
  const DEP = path.join(tmp, "dependency"), MOD = path.join(tmp, "addon"), NOGAME = path.join(tmp, "no-game");
  fs.mkdirSync(path.join(DEP, "map"), { recursive: true });
  fs.mkdirSync(MOD, { recursive: true });
  fs.writeFileSync(path.join(DEP, "descriptor.mod"), 'name="DEP"\nreplace_path="map"\n');
  fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="ADDON"\n');
  fs.writeFileSync(path.join(DEP, "map", "provinces.bmp"), xCrossingBmp());
  fs.writeFileSync(path.join(DEP, "map", "definition.csv"), CSV);
  return { tmp, DEP, MOD, NOGAME };
}

// ── ⛔ the finding ───────────────────────────────────────────────────────────────────────────────────
console.log("\n=== ⛔ the X-crossing lives in a DEPENDENCY ===");
{
  const { DEP, MOD, NOGAME } = scene();
  const depBmp = path.join(DEP, "map", "provinces.bmp");
  const before = fs.readFileSync(depBmp);

  // The detector must still SEE it — the crossing is fatal for whoever plays the result.
  const seen = md.findMapXCrossings({ modRoot: MOD, gameRoot: NOGAME, dependencyRoots: [DEP] });
  ok(seen.length >= 1, "the detector still finds it — declining to fix is not declining to report", seen.length);

  const r = md.fixMapXCrossings({ modRoot: MOD, gameRoot: NOGAME, dependencyRoots: [DEP] });
  ok(fs.readFileSync(depBmp).equals(before),
    "⭐⭐⭐ the dependency's provinces.bmp is byte-for-byte untouched", r);
  ok(!fs.existsSync(depBmp + ".bak"), "⚠️ …and no .bak was dropped in someone else's mod folder", true);
  ok(!fs.existsSync(path.join(MOD, "map", "provinces.bmp")),
    "⚠️ …and the 34 MB bitmap was NOT materialised into the add-on to fix one pixel", true);

  ok(r.fixed === 0 && r.declined >= 1,
    "⭐⭐ it reports a DECLINE, not a silent zero — the caller can tell the user", r);
  ok(typeof r.declinedReason === "string" && /own|copy/i.test(r.declinedReason),
    "…and the reason says what the modder can do about it", r.declinedReason);
}

// ── ✅ the mod's OWN bitmap is still repaired ────────────────────────────────────────────────────────
console.log("\n=== ✅ a bitmap the mod owns is still fixed ===");
{
  const { DEP, MOD, NOGAME } = scene();
  fs.mkdirSync(path.join(MOD, "map"), { recursive: true });
  const ownBmp = path.join(MOD, "map", "provinces.bmp");
  fs.writeFileSync(ownBmp, xCrossingBmp());
  fs.writeFileSync(path.join(MOD, "map", "definition.csv"), CSV);
  const depBefore = fs.readFileSync(path.join(DEP, "map", "provinces.bmp"));
  const before = fs.readFileSync(ownBmp);

  const r = md.fixMapXCrossings({ modRoot: MOD, gameRoot: NOGAME, dependencyRoots: [DEP] });
  ok(r.fixed >= 1 && !r.declined, "⭐⭐⭐ the mod's own crossing IS repaired — the guard is not a blanket refusal", r);
  ok(!fs.readFileSync(ownBmp).equals(before), "…the mod's bitmap really changed on disk", true);
  ok(fs.readFileSync(path.join(DEP, "map", "provinces.bmp")).equals(depBefore),
    "⚠️ …and the dependency still was not touched", true);
  ok(md.findMapXCrossings({ modRoot: MOD, gameRoot: NOGAME, dependencyRoots: [DEP] }).length === 0,
    "…and the crossing is gone", true);
}

// ── ⭐⭐ the CLASS, derived from source: no map writer targets a resolved source path ─────────────────
console.log("\n=== ⭐⭐ no map fixer writes to the file it merely READ ===");
{
  // Derived, not typed in: every safeModWrite in map-data.js, with its first argument. A target built from
  // a *Src / *src variable is a write to whatever root the file was resolved from — the exact shape of this
  // bug. Comments are masked first, or this fix's own prose would satisfy the check (#strip-comments).
  const src = maskJsComments(fs.readFileSync(path.join(__dirname, "map-data.js"), "utf8"));
  const bad = [];
  const re = /safeModWrite\(\s*([A-Za-z_$][\w$]*)/g;
  let m;
  while ((m = re.exec(src))) {
    const arg = m[1];
    if (/src$/i.test(arg)) bad.push(arg + " @" + (src.slice(0, m.index).split("\n").length));
  }
  ok(bad.length === 0,
    "⭐⭐ every map write names a mod-rooted target, not the source it resolved", bad);
}

tmps.forEach((d) => { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} });
console.log(`\n=== auto-fix does not repair somebody else's mod: ${pass} checks, ${fails.length} failed ===`);
fails.forEach((f) => console.log("   FAILED: " + f));
process.exit(fails.length ? 1 : 0);
