// ⛔ #a-bulk-map-click-evicted-its-own-backups — THE TWO FIXERS THAT HAVE THEIR OWN BUTTON, NOT ONLY THE ONE
// BEHIND "AUTO-FIX ALL".
//
// Mod Health's crash check carries two repair buttons of its own (public/modhealth-crashcheck.js):
// "🔧 Fix duplicate states" → /api/map/fix-duplicate-states → mapData.fixDuplicateStateFiles, and
// "🔧 Fix region overlaps"  → /api/map/repair-region-overlaps → mapData.repairRegionOverlaps.
// Reached that way neither opened a backup scope — only an Auto-fix click did — so each had nothing but the
// 200-file backup pool, which a real mod's map overruns on its own.
//
// MEASURED ON f86c096 (scratchpad batch14/scope/probe-a2.js), fixtures built from the installed corpus:
//
//   fixDuplicateStateFiles   1,250 Millennium Dawn state files + 300 <id>-restored.txt duplicates
//                            → 300 files deleted, 0 backups taken, 300 of 300 unrecoverable
//   repairRegionOverlaps     Millennium Dawn's 222 real strategic-region files, one province moved out of each
//                            (the shape of the real add-on bug: stray provinces → split states → launch crash)
//                            → 165 region files rewritten, 200 backups taken against a cap of 200,
//                              0 snapshot files, 52 files' ORIGINAL bytes recoverable nowhere
//
// A region file is written TWICE in one repair (added to, then removed from), so even a file whose later backup
// survived the prune had lost the bytes it started the click with — the same shape as the Auto-fix defect.
//
// This test asks the question of the CLICK, at a size derived from the writer's own cap, and searches both
// places Nova keeps a copy (the pruned pool and ~/.nova) by byte comparison.
//
// Run: node test-a-mod-health-map-fix-does-not-evict-its-own-backups.js
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (ok || detail == null ? "" : "   -> " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 300)));
  if (!ok) fails.push(label);
};

// Sandbox home (~/.nova) and app-data (the backup pool) BEFORE the require: both resolve once, at require time.
const tmps = [];
const mk = (tag) => { const d = fs.mkdtempSync(path.join(os.tmpdir(), "nova-mhevict-" + tag + "-")); tmps.push(d); return d; };
const HOME = mk("home");
const APPDATA = mk("appdata");
process.env.NOVA_HOME_DIR = HOME;
process.env.APPDATA = APPDATA;
process.env.XDG_CONFIG_HOME = APPDATA;
process.env.NOVA_APP_DATA_DIR = APPDATA;

const md = require("./map-data.js");
// DERIVED from the writer's own cap — never a number typed in here.
const { BACKUP_DIR, MAX_BACKUP_FILES } = require("./safe-write.js");
const N = MAX_BACKUP_FILES + 40;

const w = (root, rel, body) => {
  const p = path.join(root, ...rel.split("/"));
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, body);
  return p;
};
function filesUnder(dir, out = []) {
  let entries = [];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { return out; }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) filesUnder(p, out); else out.push(p);
  }
  return out;
}
/** An index of every copy Nova kept, so "is this content recoverable" is a byte comparison, not "did a file appear". */
function recoveryIndex() {
  const index = new Map();
  for (const place of [BACKUP_DIR, path.join(HOME, ".nova")]) for (const f of filesUnder(place)) {
    let b; try { b = fs.readFileSync(f); } catch (_) { continue; }
    if (!index.has(b.length)) index.set(b.length, []);
    index.get(b.length).push(b);
  }
  return (bytes) => (index.get(bytes.length) || []).some((c) => c.equals(bytes));
}
const poolCount = () => { try { return fs.readdirSync(BACKUP_DIR).length; } catch (_) { return 0; } };
const snapshot = (dir) => { const m = new Map(); for (const f of fs.readdirSync(dir)) m.set(f, fs.readFileSync(path.join(dir, f))); return m; };

const GAME = mk("game");
w(GAME, "hoi4.exe", "x");

try {
  console.log(`0. The rig (cap = ${MAX_BACKUP_FILES}, fixtures sized ${N} — derived from it)`);
  rec("the writer still publishes its cap, so this test is sized by it", Number.isFinite(MAX_BACKUP_FILES) && MAX_BACKUP_FILES > 0, MAX_BACKUP_FILES);
  rec("CONTROL: bytes Nova never saw are not 'recoverable'", !recoveryIndex()(Buffer.from("nothing in this project ever wrote this\r\n")));

  console.log("\n1. ⭐⭐⭐ One 'Fix duplicate states' click keeps a copy of every file it removes");
  {
    // N real states, each with its own province, and N <id>-restored.txt duplicates — each duplicate claiming a
    // province a DIFFERENT real state owns, which is what makes it redundant (the shape MD ships).
    const mod = mk("dup");
    w(mod, "descriptor.mod", 'name="dup"\nreplace_path="history/states"\nreplace_path="map"\n');
    const rows = ["0;0;0;0;land;false;unknown;0;"];
    for (let i = 1; i <= N; i++) rows.push(`${i};${i % 256};${(i * 7) % 256};${(i * 13) % 256};land;false;plains;1;`);
    w(mod, "map/definition.csv", rows.join("\r\n") + "\r\n");
    for (let i = 1; i <= N; i++) {
      w(mod, `history/states/${i}-Real.txt`,
        `state = {\r\n\tid = ${i}\r\n\tname = "STATE_${i}"\r\n\t# the modder's own note, unique: keep-${i}\r\n\tprovinces = { ${i} }\r\n\thistory = {\r\n\t\towner = C01\r\n\t}\r\n}\r\n`);
      w(mod, `history/states/${i}-restored.txt`,
        `state = {\r\n\tid = ${i}\r\n\tname = "STATE_${i}"\r\n\t# my second copy of ${i}, unique: keep2-${i}\r\n\tprovinces = { ${(i % N) + 1} }\r\n\thistory = {}\r\n}\r\n`);
    }
    const statesDir = path.join(mod, "history", "states");
    const before = snapshot(statesDir);

    const poolBefore = poolCount();
    // exactly what server.js's /api/map/fix-duplicate-states calls
    const r = md.fixDuplicateStateFiles({ modRoot: mod });
    const poolAfter = poolCount();

    rec("the click removed one declaration for every duplicated id (derived from the fixture)",
      r.removed.length === N, { removed: r.removed.length, fixture: N, unresolved: r.unresolved.length });

    const has = recoveryIndex();
    const touched = [], lost = [];
    for (const [f, bytes] of before) {
      const p = path.join(statesDir, f);
      const stillThere = fs.existsSync(p);
      if (stillThere && fs.readFileSync(p).equals(bytes)) continue;
      touched.push(f);
      if (!has(bytes)) lost.push(f);
    }
    rec("the click touched more files than the pool holds (so this measures the flood)",
      touched.length > MAX_BACKUP_FILES, { touched: touched.length, cap: MAX_BACKUP_FILES });
    // ⭐ POSITIVE CONTROL: the pool really was pruned during this very click.
    rec("CONTROL: the pool was capped by this click", poolAfter <= MAX_BACKUP_FILES && touched.length > poolAfter,
      { poolBefore, poolAfter, cap: MAX_BACKUP_FILES, touched: touched.length });
    rec("⭐⭐⭐ every file the click removed or rewrote is still recoverable",
      lost.length === 0, { lost: lost.length, of: touched.length, first: lost.slice(0, 5) });
    rec("…and the click says where the copies went", !!(r.backupSnapshot && r.backupSnapshot.dir && r.backupSnapshot.files),
      r.backupSnapshot || null);
    rec("…the mod still has every state that owns land", fs.readdirSync(statesDir).length === N,
      { now: fs.readdirSync(statesDir).length, want: N });
  }

  console.log("\n2. ⭐⭐⭐ One 'Fix region overlaps' click keeps a copy of every region file it rewrites");
  {
    // N states, each split across two neighbouring regions — the shape of the real add-on bug (a province added
    // to a region without being removed from its own), at a size the pool cannot hold.
    const mod = mk("reg");
    w(mod, "descriptor.mod", 'name="reg"\nreplace_path="map"\nreplace_path="history/states"\n');
    const rows = ["0;0;0;0;land;false;unknown;0;"];
    for (let i = 1; i <= 2 * N; i++) rows.push(`${i};${i % 256};${(i * 7) % 256};${(i * 13) % 256};land;false;plains;1;`);
    w(mod, "map/definition.csv", rows.join("\r\n") + "\r\n");
    for (let i = 1; i <= N; i++) {
      // state i owns provinces 2i-1 and 2i
      w(mod, `history/states/${i}.txt`,
        `state = {\r\n\tid = ${i}\r\n\tname = "STATE_${i}"\r\n\tprovinces = { ${2 * i - 1} ${2 * i} }\r\n\thistory = {\r\n\t\towner = C01\r\n\t}\r\n}\r\n`);
      // region i holds state i's FIRST province and state (i-1)'s SECOND — so every state spans two regions
      const other = i === 1 ? 2 * N : 2 * (i - 1);
      w(mod, `map/strategicregions/${i}.txt`,
        `strategic_region = {\r\n\tid = ${i}\r\n\tname = "REGION_${i}"\r\n\t# the modder's own note on region ${i}, unique: rkeep-${i}\r\n\tprovinces = { ${2 * i - 1} ${other} }\r\n\tweather = {}\r\n}\r\n`);
    }
    const regDir = path.join(mod, "map", "strategicregions");
    const before = snapshot(regDir);

    md.clearMapLayerCache();
    const splits = md.validateMapModel(md.buildMapModel({ modRoot: mod, gameRoot: GAME, dependencyRoots: [] }))
      .filter((p) => p.rule === "state_split_strategic_regions").length;
    rec("the fixture really is split, and by more states than the pool holds", splits > MAX_BACKUP_FILES, { splits, cap: MAX_BACKUP_FILES });

    const poolBefore = poolCount();
    md.clearMapLayerCache();
    // exactly what server.js's /api/map/repair-region-overlaps calls
    const r = md.repairRegionOverlaps({ modRoot: mod, gameRoot: GAME, dependencyRoots: [] });
    const poolAfter = poolCount();
    rec("the repair ran", !!(r && r.ok), (r && r.error) || "");

    const has = recoveryIndex();
    const rewritten = [], lost = [];
    for (const [f, bytes] of before) {
      const p = path.join(regDir, f);
      if (fs.existsSync(p) && fs.readFileSync(p).equals(bytes)) continue;
      rewritten.push(f);
      if (!has(bytes)) lost.push(f);
    }
    rec("the click rewrote more region files than the pool holds", rewritten.length > MAX_BACKUP_FILES,
      { rewritten: rewritten.length, cap: MAX_BACKUP_FILES, aligned: r.statesAligned, moved: r.provincesMoved });
    rec("CONTROL: the pool was capped by this click", poolAfter <= MAX_BACKUP_FILES && rewritten.length > poolAfter,
      { poolBefore, poolAfter, cap: MAX_BACKUP_FILES });
    rec("⭐⭐⭐ the bytes every rewritten region file STARTED the click with are still recoverable",
      lost.length === 0, { lost: lost.length, of: rewritten.length, first: lost.slice(0, 5) });
    rec("…and the click says where the copies went", !!(r.backupSnapshot && r.backupSnapshot.dir && r.backupSnapshot.files),
      r.backupSnapshot || null);
  }

  console.log("\n3. ⭐⭐ Nested inside an Auto-fix click, the outer snapshot still owns the folder");
  {
    // Depth counting: the fixer's own scope must not close the click's scope early, and must not report a
    // second folder over the top of it.
    const mod = mk("nest");
    w(mod, "descriptor.mod", 'name="nest"\nreplace_path="history/states"\nreplace_path="map"\n');
    w(mod, "map/definition.csv", "0;0;0;0;land;false;unknown;0;\r\n11;1;1;1;land;false;plains;1;\r\n77;2;2;2;land;false;plains;1;\r\n");
    w(mod, "map/strategicregions/r.txt", 'strategic_region = {\r\n\tid = 1\r\n\tname = "R1"\r\n\tprovinces = { 11 77 }\r\n\tweather = {}\r\n}\r\n');
    w(mod, "history/states/1-Real.txt", 'state = {\r\n\tid = 1\r\n\tname = "Real"\r\n\tprovinces = { 11 }\r\n\thistory = {\r\n\t\towner = C01\r\n\t}\r\n}\r\n');
    w(mod, "history/states/1-restored.txt", 'state = {\r\n\tid = 1\r\n\tname = "Second"\r\n\t# unique: nest-keep\r\n\tprovinces = { 77 }\r\n\thistory = {}\r\n}\r\n');
    w(mod, "history/states/2-Owner.txt", 'state = {\r\n\tid = 2\r\n\tname = "Owner"\r\n\tprovinces = { 77 }\r\n\thistory = {\r\n\t\towner = C01\r\n\t}\r\n}\r\n');
    w(mod, "history/countries/C01.txt", "capital = 1\r\n");
    const victim = fs.readFileSync(path.join(mod, "history", "states", "1-restored.txt"));

    const r = md.autoFixMap({ modRoot: mod, gameRoot: GAME });
    rec("the click ran and had work to do", !!(r && r.ok) && !(r && r.nothingToFix), (r && (r.error || r.note)) || "");
    const snap = (r.fixes && r.fixes.backupSnapshot) || null;
    rec("the CLICK reports one snapshot folder", !!(snap && snap.dir && snap.files), snap);
    const inner = (r.fixes && r.fixes.dupStateFiles && r.fixes.dupStateFiles.backupSnapshot) || null;
    rec("⭐⭐ …and the nested fixer does not report a folder of its own over the top of it", inner === null || inner === undefined, inner);
    const inClickFolder = snap && snap.dir
      ? filesUnder(snap.dir).some((f) => { try { return fs.readFileSync(f).equals(victim); } catch (_) { return false; } })
      : false;
    rec("⭐⭐ …the file the nested fixer removed is in the CLICK's folder", inClickFolder, { dir: snap && snap.dir });
  }

  console.log("\n4. The standing rules, on the way past");
  {
    const mod = mk("rules");
    w(mod, "descriptor.mod", 'name="rules"\nreplace_path="history/states"\n');
    w(mod, "history/states/1-Real.txt", 'state = { id = 1 name = "A" provinces = { 11 } history = {} }');
    w(mod, "history/states/1-restored.txt", 'state = { id = 1 name = "B" provinces = { 77 } history = {} }');
    w(mod, "history/states/2-Owner.txt", 'state = { id = 2 name = "C" provinces = { 77 } history = {} }');
    const poolBefore = poolCount();
    md.fixDuplicateStateFiles({ modRoot: mod });
    rec("nothing backup-shaped was left inside the mod",
      filesUnder(mod).every((p) => !/\.bak$/i.test(p)), filesUnder(mod).filter((p) => /\.bak$/i.test(p)).slice(0, 3));
    rec("…and no copy Nova had already taken was removed to make room outside the pool",
      poolCount() >= Math.min(poolBefore, MAX_BACKUP_FILES), { poolBefore, poolAfter: poolCount() });
  }
} catch (e) {
  rec("harness", false, String((e && e.stack) || e));
} finally {
  for (const d of tmps) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) { /* scratch only */ } }
  console.log(`\n=== a Mod Health map fix does not evict its own backups: ${checks} checks, ${fails.length} failed ===`);
  if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
}
