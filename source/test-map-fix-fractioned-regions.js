// Unit test: fixFractionedRegions — repairs a NAVAL strategic region split into disconnected pieces (HOI4:
// "Naval strategic region X is fractioned"). It moves the orphan fragment into an adjacent naval region. CRUCIAL
// regression: LAND regions are legitimately non-contiguous everywhere on a real map, so the fixer must touch
// ONLY naval (>=half water) regions — an earlier version moved 331 land provinces and shredded the layout.
//
// ⚠️ DO NOT "FIX" THE GAP THIS LEAVES. HOI4's own error.log looks like evidence that Nova under-reports, and
// it is not. The message is worded "Naval strategic region X is fractioned" even when X is entirely land:
//
//   MAP_ERROR: Naval strategic region Far Northeastern Russia is fractioned!    -> 77 provinces, 0 sea
//   MAP_ERROR: Naval strategic region Iran is fractioned!                       -> 208 provinces, 1 sea
//
// (measured in Millennium Dawn, from the owner's 2026-06-20 log; both separated provinces are LAND.) Chasing
// that wording, a Millennium Dawn log naming 2 provinces against Nova naming 76 reads as a total mismatch.
// It is not a mismatch: vanilla has 301 strategic regions, of which 95 are naval and **206 are predominantly
// land**, and a land region being in several pieces is ordinary. Nova examines the 95 on purpose. Reporting
// the other 206 would be cry-wolf, and repairing them is precisely what shredded the map before.
//
// ⚠️ Two probe defects to avoid if you re-run that comparison: `details[].provinces` is `comp.slice(0, 12)`
// and is for display — use `r.provinces`, which the source says is the full list; and a log only compares
// against the map that PRODUCED it (MD's strategicregions was edited a month after those logs were written).
//
// Run: node test-map-fix-fractioned-regions.js
"use strict";
const assert = require("assert");
const fs = require("fs"), os = require("os"), path = require("path");
const md = require("./map-data.js");
let pass = 0;
const ok = (n, c, x) => { assert.ok(c, n + (x !== undefined ? " -> " + JSON.stringify(x) : "")); console.log("  ok  " + n); pass++; };
const mk = (p, c) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, c); };
function bmp24(width, height, fn) {
  const rowSize = (width * 3 + 3) & ~3, imageSize = rowSize * height; const buf = Buffer.alloc(54 + imageSize);
  buf.write("BM", 0, "ascii"); buf.writeUInt32LE(54 + imageSize, 2); buf.writeUInt32LE(54, 10); buf.writeUInt32LE(40, 14);
  buf.writeInt32LE(width, 18); buf.writeInt32LE(height, 22); buf.writeUInt16LE(1, 26); buf.writeUInt16LE(24, 28); buf.writeUInt32LE(0, 30); buf.writeUInt32LE(imageSize, 34);
  for (let y = 0; y < height; y++) { let off = 54 + (height - 1 - y) * rowSize; for (let x = 0; x < width; x++) { const [r, g, b] = fn(x, y); buf[off++] = b; buf[off++] = g; buf[off++] = r; } }
  return buf;
}
// 9x4: top row provinces 1|2|3|4, bottom row 5|6|7|8 (each 2px wide), then one column of land 7 down the right edge.
// sea: 1,3,4,5  land: 2,6,7,8
// ⚠️ #the-wrap-seam-joins-a-region — MOVED WITH THAT FIX. This fixture was 8 wide, so sea 1 (column 0) and sea 4
// (column 7) were pixel neighbours across the map's wrap seam: the "separated fragment" touched its own region, and
// the test only passed because the fixer treated the map as a flat sheet. The land column keeps them apart.
const COL = {}; for (let i = 1; i <= 8; i++) COL[i] = [i * 20, 0, 0];
const provAt = (x, y) => { if (x === 8) return 7; const col = Math.floor(x / 2); return (y < 2 ? [1, 2, 3, 4] : [5, 6, 7, 8])[col]; };

(() => {
  console.log("=== fixFractionedRegions (naval region split; land regions left alone) ===");
  const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-frac-"));
  // The snapshot now lands under _novaHomeDir(), which both runners already sandbox. Set it here too so
  // running this file BY HAND cannot drop a .nova folder into the user's real home — the exact leak
  // test-a-suite-run-stays-out-of-your-home-folder.js exists to prevent.
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "nova-frac-home-"));
  process.env.NOVA_HOME_DIR = home;
  mk(path.join(mod, "descriptor.mod"), 'name="Frac"\nreplace_path="map"\n');
  mk(path.join(mod, "map", "provinces.bmp"), bmp24(9, 4, (x, y) => COL[provAt(x, y)]));
  mk(path.join(mod, "map", "definition.csv"), [
    "0;0;0;0;land;false;unknown;0",
    "1;20;0;0;sea;false;ocean;0",   // region 10, separated fragment (only touches sea 5 in region 30)
    "2;40;0;0;land;false;plains;1",
    "3;60;0;0;sea;false;ocean;0",   // region 10, main blob
    "4;80;0;0;sea;false;ocean;0",   // region 10, main blob
    "5;100;0;0;sea;false;ocean;0",  // region 30, adjacent (below) to province 1
    "6;120;0;0;land;false;plains;1",// region 40 (land), fractioned with 8 — must be LEFT ALONE
    "7;140;0;0;land;false;plains;1",
    "8;160;0;0;land;false;plains;1",// region 40 (land)
  ].join("\r\n") + "\r\n");
  const reg = (id, provs) => `strategic_region = {\n\tid = ${id}\n\tname = "R${id}"\n\tprovinces = { ${provs} }\n}\n`;
  mk(path.join(mod, "map", "strategicregions", "regions.txt"),
    reg(10, "1 3 4") + reg(20, "2") + reg(30, "5") + reg(40, "6 8") + reg(50, "7"));

  try {
    const dry = md.fixFractionedRegions({ modRoot: mod, dryRun: true }); // the validator's detection path
    ok("dryRun detects the orphan + writes no backup", dry.moved === 0 && dry.provinces && dry.provinces.includes(1) && !fs.existsSync(path.join(mod, "map", "strategicregions_bak")), dry);
    const r = md.fixFractionedRegions({ modRoot: mod });
    ok("moves exactly the 1 orphan sea province (1)", r.moved === 1, r);
    const m = md.buildMapModel({ modRoot: mod });
    ok("province 1 moved out of naval region 10 into the adjacent naval region 30", m.provinceToRegion[1] === 30, { was: 10, now: m.provinceToRegion[1] });
    ok("naval region 10 is now contiguous ({3,4})", m.provinceToRegion[3] === 10 && m.provinceToRegion[4] === 10);
    ok("LAND region 40 was NOT touched (6 + 8 still in it)", m.provinceToRegion[6] === 40 && m.provinceToRegion[8] === 40, { p6: m.provinceToRegion[6], p8: m.provinceToRegion[8] });
    // #a-backup-must-not-ship-with-the-mod — this line used to read:
    //   ok("a strategicregions_bak snapshot was written before editing",
    //      fs.existsSync(path.join(mod, "map", "strategicregions_bak", "regions.txt")));
    // ⭐ THE BUG SATISFIED IT PERFECTLY. The assertion asked whether a backup EXISTED and never asked where,
    // so it passed on a snapshot written into the mod itself — which then shipped to every subscriber. The
    // question a backup test has to ask is where it landed.
    ok("a snapshot was written before editing", !!r.snapshotDir && fs.existsSync(path.join(r.snapshotDir, "regions.txt")), r.snapshotDir);
    ok("…OUTSIDE the mod, so it is never released with it", !path.resolve(r.snapshotDir).toLowerCase().startsWith(path.resolve(mod).toLowerCase()), r.snapshotDir);
    ok("…and nothing was left inside the mod", !fs.existsSync(path.join(mod, "map", "strategicregions_bak")), fs.readdirSync(path.join(mod, "map")));
    ok("…and the snapshot is the PRE-edit content — it still puts province 1 in region 10",
      /id\s*=\s*10[\s\S]*?provinces\s*=\s*\{[^}]*\b1\b/.test(fs.readFileSync(path.join(r.snapshotDir, "regions.txt"), "utf8")));
    ok("idempotent — a second pass moves nothing", md.fixFractionedRegions({ modRoot: mod }).moved === 0);
    console.log(`\ntest-map-fix-fractioned-regions: ${pass} checks passed`);
  } finally {
    try { fs.rmSync(mod, { recursive: true, force: true }); } catch (_) {}
    try { fs.rmSync(home, { recursive: true, force: true }); } catch (_) {}
  }
})();
