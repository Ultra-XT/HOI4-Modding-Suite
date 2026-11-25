// Guard the map "known-good baseline" backstop: save a snapshot of map+states+countries, then after the live
// mod is mangled, restore exactly back to the baseline (the "always launchable" guarantee). Verifies the
// restore MIRRORS (a junk file added after the save is gone) and that it refuses to overwrite the game dir.
const fs = require("fs"), os = require("os"), path = require("path");
const md = require("./map-data.js");
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) { pass++; console.log("  ✓ " + m); } else { fail++; console.log("  ✗ FAIL " + m + (x !== undefined ? " -> " + JSON.stringify(x) : "")); } };

const root = fs.mkdtempSync(path.join(os.tmpdir(), "nova-baseline-"));
const w = (rel, body) => { const p = path.join(root, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, body, "utf8"); };
const R = (rel) => { try { return fs.readFileSync(path.join(root, rel), "utf8"); } catch (_) { return null; } };
let baselineDir = "";
try {
  // known-good map
  w("map/definition.csv", "0;0;0;0;land;false;unknown;0\n1;10;10;10;land;false;plains;0\n");
  w("map/strategicregions/1-A.txt", 'strategic_region = { id = 1 name = "A" provinces = { 1 } }');
  w("history/states/1-Real.txt", 'state = { id = 1 name = "Real" provinces = { 1 } history = { owner = GER } }');
  w("history/countries/GER.txt", "capital = 1\n");

  const sv = md.saveMapBaseline({ modRoot: root });
  ok(sv.ok && sv.savedAt, "saveMapBaseline succeeded", sv);
  baselineDir = sv.baselinePath;
  ok(fs.existsSync(path.join(baselineDir, "_baseline.json")), "baseline meta written");
  const info = md.getMapBaselineInfo({ modRoot: root });
  ok(info.exists && info.savedAt === sv.savedAt, "getMapBaselineInfo reports it exists", info);

  // ── now MANGLE the live mod: change a map file, delete the state, add a junk state ──
  w("map/definition.csv", "0;0;0;0;land;false;unknown;0\n1;10;10;10;sea;false;ocean;0\n"); // changed
  fs.unlinkSync(path.join(root, "history/states/1-Real.txt"));                              // deleted real state
  w("history/states/999-Junk.txt", 'state = { id = 999 provinces = { } }');                // junk added after save

  const rs = md.restoreMapBaseline({ modRoot: root, gameRoot: path.join(os.tmpdir(), "nova-baseline-not-game") });
  ok(rs.ok && rs.restored.length === 3, "restoreMapBaseline restored all 3 dirs", rs);
  ok(R("map/definition.csv").includes("1;10;10;10;land;false;plains;0"), "definition.csv reverted to baseline (land, not sea)");
  ok(R("history/states/1-Real.txt") !== null, "the deleted real state file is back");
  ok(!fs.existsSync(path.join(root, "history/states/999-Junk.txt")), "the junk state added after the save is GONE (mirror, not merge)");

  // ── refuse to overwrite the game directory ──
  const guard = md.restoreMapBaseline({ modRoot: root, gameRoot: root });
  ok(!guard.ok && /game directory/i.test(guard.error || ""), "refuses to restore over the game directory", guard);

  // ── no baseline → clear message ──
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), "nova-baseline-none-"));
  const none = md.restoreMapBaseline({ modRoot: empty, gameRoot: path.join(os.tmpdir(), "x") });
  ok(!none.ok && /no baseline/i.test(none.error || ""), "restore with no saved baseline gives a clear message", none);
  fs.rmSync(empty, { recursive: true, force: true });

  // ── #restore-deleted-before-it-copied — A FAILED RESTORE MUST NOT LEAVE THE MOD WITH NO MAP ──
  //
  // This used to `fs.rmSync(liveDir, {recursive:true})` and THEN copy the baseline in. Between those two
  // calls the mod had no map/ and no history/states/ at all, so a disk-full, a permission error, an
  // antivirus lock or the app being killed destroyed them — in the one operation whose entire purpose is
  // to be the safety net. CLAUDE.md forbids exactly this: "restore by COPYING OVER the live directory;
  // never remove it first", a rule that exists because the pattern once wiped 984 files unrecoverably.
  //
  // Simulated by making the copy itself fail, which is the only step that can realistically die midway.
  ok(R("history/states/1-Real.txt") !== null, "precondition: the live map is present before the failure test");
  const realCp = fs.cpSync;
  let threw = false;
  try {
    fs.cpSync = () => { throw new Error("simulated disk failure"); };
    const bad = md.restoreMapBaseline({ modRoot: root, gameRoot: path.join(os.tmpdir(), "nova-baseline-not-game") });
    threw = !bad.ok;
    ok(!bad.ok, "a restore whose copy fails reports failure rather than claiming success", bad);
  } finally { fs.cpSync = realCp; }
  ok(threw, "…the failure was actually simulated (or the assertions below prove nothing)");
  ok(R("history/states/1-Real.txt") !== null, "…and the live state file SURVIVED the failed restore");
  ok(R("map/definition.csv") !== null, "…and the live map/ survived too");
  ok(fs.existsSync(path.join(root, "history", "states")), "…the live states directory still exists");

  // ── and a successful restore leaves no scratch directories behind ──
  const again = md.restoreMapBaseline({ modRoot: root, gameRoot: path.join(os.tmpdir(), "nova-baseline-not-game") });
  ok(again.ok, "a restore still succeeds after a failed one (the staging dirs did not block it)", again);
  const scratch = ["map", "history/states", "history/countries"].flatMap((d) =>
    [".nova-restoring", ".nova-previous"].map((sfx) => path.join(root, d.replace("/", path.sep) + sfx)))
    .filter((p) => fs.existsSync(p));
  ok(scratch.length === 0, "no .nova-restoring / .nova-previous directories are left in the mod", scratch);
  ok(R("history/states/1-Real.txt") !== null, "…and the baseline content is in place");

  // ── #save-deleted-the-baseline-before-it-copied — THE SAME RULE, ON THE SAVE SIDE ──
  //
  // restoreMapBaseline was fixed to stage-then-swap; saveMapBaseline directly above it still opened with
  // `fs.rmSync(dest)` and then copied. That destroys the user's EXISTING baseline before the replacement
  // exists — and a baseline is a whole map, states and country histories, hundreds of MB for a real mod, so
  // the copy has real ways to fail. Worse, it failed SILENTLY: _baseline.json is written last, so the
  // half-copied remains report "no baseline" and the UI offers to save one over the wreckage.
  console.log("\n  [a failed SAVE must leave the previous baseline intact]");
  {
    const before = md.getMapBaselineInfo({ modRoot: root });
    ok(before.exists, "precondition: a baseline exists before the failed save", before);
    const marker = path.join(baselineDir, "history", "states", "1-Real.txt");
    ok(fs.existsSync(marker), "precondition: the previous baseline holds the real state file");

    const realCp2 = fs.cpSync;
    let simulated = false;
    try {
      fs.cpSync = () => { throw new Error("simulated disk-full while snapshotting"); };
      const bad = md.saveMapBaseline({ modRoot: root });
      simulated = !bad.ok;
      ok(!bad.ok, "a save whose copy fails reports failure rather than claiming success", bad);
    } finally { fs.cpSync = realCp2; }
    ok(simulated, "…the failure was actually simulated (or the assertions below prove nothing)");

    const after = md.getMapBaselineInfo({ modRoot: root });
    ok(after.exists, "…the previous baseline STILL EXISTS after the failed save", after);
    ok(after.savedAt === before.savedAt, "…and it is the same one, not a stub with a new timestamp",
      { before: before.savedAt, after: after.savedAt });
    ok(fs.existsSync(marker), "…with its content intact, so a restore would still work");

    const scratch2 = [baselineDir + ".nova-saving", baselineDir + ".nova-previous"].filter((p) => fs.existsSync(p));
    ok(scratch2.length === 0, "no .nova-saving / .nova-previous directories are left behind", scratch2);

    // …and a real save still works afterwards, so the failure left nothing blocking the next attempt.
    const good = md.saveMapBaseline({ modRoot: root });
    ok(good.ok, "a save still succeeds after a failed one", good);
    ok(md.getMapBaselineInfo({ modRoot: root }).savedAt === good.savedAt, "…and it is the new snapshot");
  }
} catch (e) { ok(false, "threw: " + e.message + "\n" + e.stack); }
finally {
  try { fs.rmSync(root, { recursive: true, force: true }); } catch (_) {}
  try { if (baselineDir) fs.rmSync(baselineDir, { recursive: true, force: true }); } catch (_) {}
}
console.log(`\n  ${pass} passed, ${fail} failed`);
process.exitCode = fail ? 1 : 0;
