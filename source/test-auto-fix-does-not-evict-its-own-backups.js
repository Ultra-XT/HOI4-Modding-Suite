// One Auto-fix click keeps a recoverable copy of every state file it rewrites.
//
// #a-bulk-map-click-evicted-its-own-backups (the fixer half)
//
// THE DEFECT, MEASURED ON THE BASE COMMIT (d8e955b) over mkdtemp copies of Millennium Dawn's real 1,250
// state files, with one realistic problem induced across every state:
//
//     fixer                        backups taken   left   evicted   state files whose previous bytes are LOST
//     fixMissingStateCategories             1250    200      1050    1050 of 1250   (55.0s)
//     fixStateNoManpower                    1250    200      1050    1050 of 1250   (102.7s)
//
// In both runs the FIRST file written (1-Central Plateau.txt) was unrecoverable afterwards.
//
// WHY: safeModWrite copies each file into Nova's backup folder and then prunes the pool to
// MAX_BACKUP_FILES per pool. The per-state fixers write ONE FILE PER STATE, so a mod with more states than
// the cap loses its earliest backups to its own click — 84% of them on a 1,250-state mod. Batch 12 removed
// the in-mod .bak copy, so that pool is the only backup of an edited map file.
//
// This is worse than the Delete map case fixed alongside it. Delete map is a reset the user asked for, and
// it already snapshotted the files it DELETED; these fixers run from the Auto-fix button over a mod's OWN
// hand-written state files — manpower, categories, victory points, buildings — and quietly destroy the
// only copy of most of them.
//
// Many fixers share one write path, so this must hold for the CLICK, not for one fixer: the test drives
// autoFixMap, the thing the page actually calls, and asks the question of every file the click rewrote.
//
// ⚠️ It compares BYTES, and searches BOTH places Nova keeps a copy (the pruned pool and the .nova
// snapshots) — not "did a file appear somewhere".
//
// Run: node test-auto-fix-does-not-evict-its-own-backups.js
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (detail == null ? "" : "   " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 220)));
  if (!ok) fails.push(label);
};

// Sandbox home + app-data BEFORE the require: safe-write resolves the backup folder once, at require time,
// and this test reads that folder back.
const HOME = fs.mkdtempSync(path.join(os.tmpdir(), "nova-afe-home-"));
const APPDATA = fs.mkdtempSync(path.join(os.tmpdir(), "nova-afe-appdata-"));
process.env.NOVA_HOME_DIR = HOME;
process.env.APPDATA = APPDATA;
process.env.XDG_CONFIG_HOME = APPDATA;
process.env.NOVA_APP_DATA_DIR = APPDATA;
const md = require("./map-data.js");
// DERIVED from the writer's own cap — never a number typed in here.
const { BACKUP_DIR, MAX_BACKUP_FILES } = require("./safe-write.js");

const tmps = [HOME, APPDATA];
const mk = (p, c) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, c); };

/**
 * A mod with more states than the backup pool holds, every one of them missing the two things the
 * per-state fixers repair (manpower, state_category) and nothing else wrong: contiguous ids from 1, one
 * land province each, every province in a strategic region, one owner with a valid capital. So the click
 * has exactly one kind of work to do, across more files than the cap.
 *
 * Self-contained: the category table is written here rather than copied from an installed game, so the
 * test does not depend on anyone's Steam folder.
 */
function makeMod() {
  const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-afe-mod-"));
  tmps.push(mod);
  const n = MAX_BACKUP_FILES + 40;                 // derived from the cap, so the fixture follows it

  mk(path.join(mod, "descriptor.mod"), 'name="AutoFixEvict"\nreplace_path="history/states"\nreplace_path="history/countries"\nreplace_path="map"\n');

  const rows = ["0;0;0;0;land;false;unknown;0;"];
  for (let i = 1; i <= n; i++) rows.push(`${i};${i % 256};${(i * 7) % 256};${(i * 13) % 256};land;false;plains;1;`);
  mk(path.join(mod, "map", "definition.csv"), rows.join("\r\n") + "\r\n");

  // Every province in one strategic region, so no region fixer has work of its own.
  const all = []; for (let i = 1; i <= n; i++) all.push(i);
  mk(path.join(mod, "map", "strategicregions", "r.txt"),
    `strategic_region = {\r\n\tid = 1\r\n\tname = "REGION_1"\r\n\tprovinces = { ${all.join(" ")} }\r\n\tweather = {}\r\n}\r\n`);

  // The category table the fixer assigns from.
  mk(path.join(mod, "common", "state_category", "categories.txt"),
    'state_categories = {\r\n\trural = {\r\n\t\tlocal_building_slots = 1\r\n\t}\r\n\ttown = {\r\n\t\tlocal_building_slots = 4\r\n\t}\r\n\tcity = {\r\n\t\tlocal_building_slots = 8\r\n\t}\r\n}\r\n');

  // States: no manpower, no state_category — and a hand-written comment, the kind of content a modder
  // would lose if the only copy of the previous file were pruned.
  for (let i = 1; i <= n; i++) {
    mk(path.join(mod, "history", "states", `${i}.txt`),
      `state = {\r\n\tid = ${i}\r\n\tname = "STATE_${i}"\r\n\t# my own note on state ${i}, unique: keep-${i * 37}\r\n\tprovinces = { ${i} }\r\n\thistory = {\r\n\t\towner = C01\r\n\t}\r\n}\r\n`);
  }
  mk(path.join(mod, "history", "countries", "C01.txt"), "capital = 1\r\noob = \"C01_1936\"\r\n");
  return { mod, n };
}

function filesUnder(dir, out = []) {
  let entries = [];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { return out; }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) filesUnder(p, out); else out.push(p);
  }
  return out;
}

try {
  console.log("1. ⭐⭐⭐ Every state file an Auto-fix click rewrites stays recoverable");
  {
    const { mod, n } = makeMod();
    const statesDir = path.join(mod, "history", "states");

    const before = new Map();
    for (const f of fs.readdirSync(statesDir)) before.set(f, fs.readFileSync(path.join(statesDir, f)));
    rec("the fixture holds more states than the backup pool", before.size > MAX_BACKUP_FILES,
      { states: before.size, cap: MAX_BACKUP_FILES });

    const t0 = Date.now();
    const r = md.autoFixMap({ modRoot: mod });
    const ms = Date.now() - t0;
    rec("the click ran", !!(r && r.ok), (r && r.error) || "");
    rec("…and it had work to do (not the nothing-to-fix early return)", !(r && r.nothingToFix), (r && r.note) || "");

    // Where Nova keeps a copy: the pool, and anything under the sandboxed ~/.nova.
    const places = [BACKUP_DIR, path.join(HOME, ".nova")];
    const index = new Map();
    for (const place of places) for (const f of filesUnder(place)) {
      let b; try { b = fs.readFileSync(f); } catch (_) { continue; }
      if (!index.has(b.length)) index.set(b.length, []);
      index.get(b.length).push({ f, b });
    }
    const findBytes = (bytes) => {
      for (const c of (index.get(bytes.length) || [])) if (c.b.equals(bytes)) return c.f;
      return "";
    };

    const rewritten = [], lost = [];
    for (const [f, bytes] of before) {
      let now; try { now = fs.readFileSync(path.join(statesDir, f)); } catch (_) { continue; }
      if (now.equals(bytes)) continue;
      rewritten.push(f);
      if (!findBytes(bytes)) lost.push(f);
    }
    rec("the click rewrote more state files than the pool holds (so this measures the flood)",
      rewritten.length > MAX_BACKUP_FILES, { rewritten: rewritten.length, cap: MAX_BACKUP_FILES, states: n, ms });

    // ⭐ POSITIVE CONTROL: the pool really was capped during this very click, so a passing recovery
    // assertion below cannot be passing because nothing was ever evicted from it.
    const pool = (() => { try { return fs.readdirSync(BACKUP_DIR).length; } catch (_) { return 0; } })();
    rec("CONTROL: backups WERE evicted from the pool by this click",
      pool <= MAX_BACKUP_FILES && rewritten.length > pool, { inPool: pool, cap: MAX_BACKUP_FILES, rewritten: rewritten.length });

    rec("⭐⭐⭐ the previous content of EVERY state file the click rewrote is recoverable",
      lost.length === 0, { lost: lost.length, of: rewritten.length, first: lost.slice(0, 5) });

    // The standing rules, on the way past.
    rec("nothing backup-shaped was left inside the mod",
      filesUnder(mod).every((p) => !/\.bak$/i.test(p)), filesUnder(mod).filter((p) => /\.bak$/i.test(p)).slice(0, 3));
    rec("…and the mod still has all its states", fs.readdirSync(statesDir).length === n,
      { now: fs.readdirSync(statesDir).length, was: n });
  }

  console.log("\n2. ⭐ CONTROL: a clean mod's click writes nothing, and invents no snapshot");
  {
    // The mirror case — proves the machinery does not fire (or accumulate) when there is nothing to repair.
    const { mod } = makeMod();
    md.autoFixMap({ modRoot: mod });                       // first click does the repairs
    const novaBefore = filesUnder(path.join(HOME, ".nova")).length;
    const poolBefore = (() => { try { return fs.readdirSync(BACKUP_DIR).length; } catch (_) { return 0; } })();
    const again = md.autoFixMap({ modRoot: mod });         // second click: nothing left to do
    const novaAfter = filesUnder(path.join(HOME, ".nova")).length;
    const poolAfter = (() => { try { return fs.readdirSync(BACKUP_DIR).length; } catch (_) { return 0; } })();
    rec("a second click on the same mod writes no new backups", poolAfter === poolBefore, { poolBefore, poolAfter });
    rec("…and leaves no new snapshot files behind", novaAfter === novaBefore, { novaBefore, novaAfter, nothingToFix: !!(again && again.nothingToFix) });
  }

  console.log(`\n=== auto-fix does not evict its own backups: ${checks} checks, ${fails.length} failed ===`);
  if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
} catch (e) {
  console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
  process.exitCode = 1;
} finally {
  for (const d of tmps) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} }
}
