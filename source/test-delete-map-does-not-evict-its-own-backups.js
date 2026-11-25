// Delete map keeps a recoverable copy of every file it OVERWRITES — including the first one it wrote.
//
// #a-bulk-map-click-evicted-its-own-backups
//
// THE DEFECT, MEASURED ON THE BASE COMMIT (d8e955b), driving map-data's own blankMapToSea over mkdtemp
// COPIES of the installed corpus:
//
//     fixture (copy of)        backups the click took   left on disk   evicted by the click ITSELF
//     Millennium Dawn                            394             200                          194
//     Rise of Nations                            492             200                          292
//     Millennium Dawn (non-temp fixture,
//       so the real "map" prune pool)            395             200                          195
//
// In every one of those runs the FIRST file the click wrote was map/definition.csv — the file that defines
// every province in the mod — and its previous content was NOT recoverable afterwards. The click had
// deleted its own backup of it.
//
// WHY: safeModWrite copies each file into Nova's backup folder and then calls pruneBackups, which keeps the
// newest MAX_BACKUP_FILES per pool. Delete map strips `capital = N` from EVERY country file in the mod —
// 393 of them on Millennium Dawn, 491 on Rise of Nations — so the click takes hundreds of backups in a few
// seconds and each one prunes the pool again. The last 200 survive; everything earlier in the SAME click is
// deleted, definition.csv first of all. Batch 12 removed the in-mod <file>.bak copy (the owner asked for
// it), so that pool is now the only backup of an edited map file.
//
// The operation already snapshots what it DELETES — 1,251 state and supply-area files on Millennium Dawn —
// into its own timestamped folder outside the mod, outside the prune pool. What it OVERWRITES was left to
// the capped pool. This asks for the same protection for both halves.
//
// ⚠️ It asks whether the previous BYTES are retrievable, from either place Nova keeps them (the backup pool
// or the operation's own snapshot) — not whether a file exists somewhere. "A backup test that does not
// assert the location is measuring the half that was never in doubt", and one that does not compare bytes
// is not measuring recovery at all.
//
// Run: node test-delete-map-does-not-evict-its-own-backups.js
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

// Sandbox the home dir AND the app-data dir before map-data resolves either: safe-write.js derives the
// backup folder once, at require time, and this test reads that folder back. Above the require or it would
// read — and prune — the user's real backups.
const HOME = fs.mkdtempSync(path.join(os.tmpdir(), "nova-evict-home-"));
const APPDATA = fs.mkdtempSync(path.join(os.tmpdir(), "nova-evict-appdata-"));
process.env.NOVA_HOME_DIR = HOME;
process.env.APPDATA = APPDATA;
process.env.XDG_CONFIG_HOME = APPDATA;
process.env.NOVA_APP_DATA_DIR = APPDATA;
const md = require("./map-data.js");
// DERIVED: wherever safe-write resolved them to under the sandbox above, and its own cap — never numbers
// spelled out here. A typed count is what fails on a correct fix instead of on a bug.
const { BACKUP_DIR, MAX_BACKUP_FILES } = require("./safe-write.js");

const tmps = [HOME, APPDATA];
const mk = (p, c) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, c); };

/**
 * A mod big enough that Delete map floods its own pool, shaped like the real ones: every country file
 * carries a `capital = N` line, which is what step (4) of the blank rewrites.
 * The country count is derived from the writer's OWN cap, so the fixture stays correct if the cap moves.
 */
function makeMod() {
  const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-evict-mod-"));
  tmps.push(mod);
  mk(path.join(mod, "descriptor.mod"), 'name="Evict"\nreplace_path="history/states"\nreplace_path="history/countries"\nreplace_path="map"\nreplace_path="map/supplyareas"\n');

  const countries = MAX_BACKUP_FILES + 40;          // enough that the flood outruns the cap, derived not typed
  const rows = ["0;0;0;0;land;false;unknown;0;"];
  for (let i = 1; i <= countries; i++) rows.push(`${i};${i % 256};${(i * 7) % 256};${(i * 13) % 256};land;false;plains;3;`);
  mk(path.join(mod, "map", "definition.csv"), rows.join("\r\n") + "\r\n");

  for (let i = 1; i <= countries; i++) {
    const tag = `C${String(i).padStart(3, "0")}`;
    // Distinct bytes per file, so "is this file's previous content recoverable" cannot be answered by
    // accidentally matching some other file's copy.
    mk(path.join(mod, "history", "countries", `${tag}.txt`),
      `capital = ${i}\r\noob = "${tag}_1936"\r\n# hand-written note for ${tag}, unique: ${tag}-${i * 31}\r\n`);
  }
  // A couple of states + a supply area, so the delete-and-snapshot half of the click runs as it really does.
  for (let i = 1; i <= 3; i++) {
    mk(path.join(mod, "history", "states", `${i}.txt`),
      `state = {\r\n\tid = ${i}\r\n\tname = "STATE_${i}"\r\n\tprovinces = { ${i} }\r\n\thistory = {\r\n\t\towner = C001\r\n\t}\r\n}\r\n`);
  }
  mk(path.join(mod, "map", "supplyareas", "a.txt"), 'supply_area={\r\n\tid=1\r\n\tname="SUPPLYAREA_1"\r\n\tvalue=5\r\n\tstates={ 1 2 3 }\r\n}\r\n');
  return { mod, countries };
}

/** Every file under `dir`, recursively, as absolute paths. */
function filesUnder(dir, out = []) {
  let entries = [];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { return out; }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) filesUnder(p, out);
    else out.push(p);
  }
  return out;
}

/**
 * Is `bytes` retrievable from anywhere Nova keeps a copy — the backup pool, or the operation's own
 * snapshot? Returns the path that holds it, or "". Compares BYTES: the question is recovery, not existence.
 */
function recoverableFrom(places, bytes) {
  for (const place of places) {
    for (const f of filesUnder(place)) {
      try { if (fs.readFileSync(f).equals(bytes)) return f; } catch (_) {}
    }
  }
  return "";
}

try {
  console.log("1. ⭐⭐⭐ A click that overwrites hundreds of files keeps a copy of EVERY one of them");
  {
    const { mod, countries } = makeMod();
    const countryDir = path.join(mod, "history", "countries");
    const csvPath = path.join(mod, "map", "definition.csv");

    // Pre-images, read from the fixture — the bytes recovery has to be able to hand back.
    const csvBefore = fs.readFileSync(csvPath);
    const before = new Map();
    for (const f of fs.readdirSync(countryDir)) before.set(f, fs.readFileSync(path.join(countryDir, f)));
    rec("the fixture is big enough to outrun the backup cap", before.size > MAX_BACKUP_FILES,
      { countryFiles: before.size, cap: MAX_BACKUP_FILES });

    const r = md.blankMapToSea({ modRoot: mod });
    rec("the blank ran", r.changed === true, r.error || "");
    rec("…and it really did overwrite more files than the cap holds", r.strippedCapitals > MAX_BACKUP_FILES,
      { strippedCapitals: r.strippedCapitals, cap: MAX_BACKUP_FILES, countries });

    const places = [BACKUP_DIR].concat(r.snapshotPath ? [r.snapshotPath] : []);

    // ⭐ POSITIVE CONTROL for the "none found" checks below: the pool really was pruned during this click,
    // so a passing recovery assertion cannot be passing because nothing was ever evicted.
    const pool = (() => { try { return fs.readdirSync(BACKUP_DIR).length; } catch (_) { return 0; } })();
    rec("CONTROL: the pool was capped during this very click — backups WERE evicted",
      pool <= MAX_BACKUP_FILES && r.strippedCapitals > pool, { inPool: pool, cap: MAX_BACKUP_FILES, overwritten: r.strippedCapitals });

    // The headline: the FIRST file the click wrote. Measured on the base commit as unrecoverable.
    rec("⭐⭐⭐ the previous map/definition.csv — the first file the click wrote — is still recoverable",
      !!recoverableFrom(places, csvBefore), recoverableFrom(places, csvBefore) || "(nowhere: the click deleted its own backup of it)");

    // …and every country file it rewrote, not just the ones lucky enough to fall inside the last 200.
    const changed = [], lost = [];
    for (const [f, bytes] of before) {
      let now; try { now = fs.readFileSync(path.join(countryDir, f)); } catch (_) { continue; }
      if (now.equals(bytes)) continue;                       // untouched files need no copy
      changed.push(f);
      if (!recoverableFrom(places, bytes)) lost.push(f);
    }
    rec("every country file was actually rewritten (so this measures the flood, not a quiet no-op)",
      changed.length === r.strippedCapitals && changed.length > MAX_BACKUP_FILES, { rewritten: changed.length, reported: r.strippedCapitals });
    rec("⭐⭐⭐ the previous content of EVERY rewritten country file is recoverable",
      lost.length === 0, { lost: lost.length, of: changed.length, first: lost.slice(0, 5) });

    // The standing rules this must not break on its way past.
    rec("the snapshot is still OUTSIDE the mod", !r.snapshotPath || !path.resolve(r.snapshotPath).toLowerCase().startsWith(path.resolve(mod).toLowerCase()),
      r.snapshotPath);
    rec("…and nothing backup-shaped was left inside the mod", filesUnder(mod).every((p) => !/\.bak$/i.test(p) && !/_bak|backup/i.test(path.basename(path.dirname(p)))),
      filesUnder(mod).filter((p) => /\.bak$/i.test(p)).slice(0, 3));
    rec("…and the files it DELETED are still snapshotted too, as they always were",
      r.snapshotted >= 4 && r.snapshotFailed === 0, { snapshotted: r.snapshotted, failed: r.snapshotFailed });
  }

  console.log("\n2. ⭐ CONTROL: the recovery check can tell a miss from a hit");
  {
    const probe = fs.mkdtempSync(path.join(os.tmpdir(), "nova-evict-probe-"));
    tmps.push(probe);
    fs.writeFileSync(path.join(probe, "a.txt"), "FINDME");
    rec("CONTROL: it finds bytes that ARE there", !!recoverableFrom([probe], Buffer.from("FINDME")));
    rec("CONTROL: …and does not find bytes that are NOT", !recoverableFrom([probe], Buffer.from("ABSENT")));
  }

  console.log(`\n=== delete map does not evict its own backups: ${checks} checks, ${fails.length} failed ===`);
  if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
} catch (e) {
  console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
  process.exitCode = 1;
} finally {
  for (const d of tmps) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} }
}
