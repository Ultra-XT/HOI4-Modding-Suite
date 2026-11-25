// ⛔ #a-state-file-nova-deletes-keeps-no-copy — A FILE NOVA TAKES AWAY NEEDS THE COPY MORE THAN ONE IT REWRITES.
//
// Two places in map-data.js remove a state's block and, when nothing is left in the file, delete the file:
// removeStateBlockFromFile (the duplicate-state repair behind Mod Health's "🔧 Fix duplicate states" button and
// behind Auto-fix) and deleteState (the Map Editor's delete). Both wrote the same one-liner, and neither kept a
// copy of the file it removed — while the branch right above each of them, the one that merely REWRITES the
// file, hands it to safeModWrite and is recoverable.
//
// MEASURED ON THE BASE COMMIT f86c096 (scratchpad batch14/scope/probe-a1.js, probe-a2.js, probe-a3.js), searching
// BOTH places Nova keeps a copy — the pruned backup pool and ~/.nova — by byte comparison:
//
//   fixDuplicateStateFiles, 1,250 real Millennium Dawn state files + 300 <id>-restored.txt duplicates
//                              300 files deleted, 0 backups taken, 0 snapshot files, 300 of 300 UNRECOVERABLE
//   the same click through autoFixMap (a backup SCOPE open for the whole click)
//                              deleted, and still unrecoverable — a scope only ever sees a WRITE
//   deleteState, a state alone in its file
//                              deleted, bytes kept nowhere
//   CONTROL, both functions, a file that SURVIVES the removal (two blocks in it)
//                              recoverable, as it always was
//
// Batch 12 removed the in-mod <file>.bak copy, so there is no second place to look any more.
//
// Run: node test-a-state-file-nova-deletes-stays-recoverable.js
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

// Sandbox the home dir (~/.nova snapshots) and the app-data dir (the backup pool) BEFORE the require:
// both are resolved once, at require time, and this test reads them back.
const tmps = [];
const mk = (tag) => { const d = fs.mkdtempSync(path.join(os.tmpdir(), "nova-delrec-" + tag + "-")); tmps.push(d); return d; };
const HOME = mk("home");
const APPDATA = mk("appdata");
process.env.NOVA_HOME_DIR = HOME;
process.env.APPDATA = APPDATA;
process.env.XDG_CONFIG_HOME = APPDATA;
process.env.NOVA_APP_DATA_DIR = APPDATA;

const md = require("./map-data.js");
const { BACKUP_DIR } = require("./safe-write.js");

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
/** Where does Nova keep a copy? The pruned pool, and anything under the sandboxed ~/.nova. By BYTES. */
const copyOf = (bytes) => {
  for (const place of [BACKUP_DIR, path.join(HOME, ".nova")]) for (const f of filesUnder(place)) {
    let b; try { b = fs.readFileSync(f); } catch (_) { continue; }
    if (b.equals(bytes)) return f;
  }
  return "";
};

const st = (id, name, provs) => `state = {\r\n\tid = ${id}\r\n\tname = "${name}"\r\n\t# the modder's own note on ${name}, unique: keep-${id}\r\n\tprovinces = { ${provs.join(" ")} }\r\n\thistory = {\r\n\t\towner = C01\r\n\t\tvictory_points = { ${provs[0]} 5 }\r\n\t}\r\n}\r\n`;

/** A mod whose own duplicate state id is the redundant kind the repair removes (the <id>-restored.txt stub
 *  Millennium Dawn carries): its province is really owned by another state, so the block contributes no land. */
function makeDupMod(tag) {
  const mod = mk(tag);
  w(mod, "descriptor.mod", 'name="del rec"\nreplace_path="history/states"\nreplace_path="map"\n');
  w(mod, "map/definition.csv", "0;0;0;0;land;false;unknown;0;\r\n11;1;1;1;land;false;plains;1;\r\n77;2;2;2;land;false;plains;1;\r\n");
  w(mod, "map/strategicregions/r.txt", 'strategic_region = {\r\n\tid = 1\r\n\tname = "R1"\r\n\tprovinces = { 11 77 }\r\n\tweather = {}\r\n}\r\n');
  w(mod, "history/states/1-Real.txt", st(1, "Real", [11]));
  w(mod, "history/states/1-restored.txt", st(1, "MyOwnSecondCopy", [77]));   // 77 belongs to state 2 → redundant
  w(mod, "history/states/2-Owner.txt", st(2, "Owner", [77]));
  w(mod, "history/countries/C01.txt", "capital = 1\r\n");
  return mod;
}

const GAME = mk("game");
w(GAME, "hoi4.exe", "x");

try {
  console.log("0. THE CONTROL FOR THE SEARCH ITSELF");
  {
    rec("bytes Nova never saw are not 'recoverable' (the search can tell a miss)",
      copyOf(Buffer.from("no writer in this project ever wrote this string\r\n")) === "");
  }

  console.log("\n1. ⭐⭐⭐ The duplicate-state repair keeps a copy of the file it deletes");
  {
    const mod = makeDupMod("dup");
    const victim = path.join(mod, "history", "states", "1-restored.txt");
    const bytes = fs.readFileSync(victim);

    // Exactly what /api/map/fix-duplicate-states calls (server.js: mapData.fixDuplicateStateFiles({ modRoot })).
    const r = md.fixDuplicateStateFiles({ modRoot: mod });

    rec("the repair removed the redundant duplicate block",
      r.removed.some((x) => x.id === 1 && x.file === "1-restored.txt"), r);
    rec("…and the file really left the mod (the behaviour is unchanged)", !fs.existsSync(victim));
    rec("…and the state that owns the land is untouched", fs.existsSync(path.join(mod, "history", "states", "1-Real.txt")));
    const where = copyOf(bytes);
    rec("⭐⭐⭐ the deleted file's bytes are recoverable", !!where, where || "found in neither the backup pool nor ~/.nova");
  }

  console.log("\n2. CONTROL: the same function's REWRITE branch was always recoverable");
  {
    const mod = makeDupMod("dupctl");
    // the duplicate block now shares its file with a second state, so the file survives the removal
    const victim = path.join(mod, "history", "states", "1-restored.txt");
    fs.writeFileSync(victim, fs.readFileSync(victim, "utf8") + st(3, "Survivor", [11]));
    const bytes = fs.readFileSync(victim);
    const r = md.fixDuplicateStateFiles({ modRoot: mod });
    rec("the duplicate block was removed", r.removed.some((x) => x.id === 1), r.removed);
    rec("…the file stayed (it still holds state 3)", fs.existsSync(victim));
    rec("…and its previous bytes are recoverable, as they always were", !!copyOf(bytes));
  }

  console.log("\n3. ⭐⭐⭐ Deleting a state keeps a copy of the file it empties");
  {
    const mod = mk("delmod");
    w(mod, "descriptor.mod", 'name="del rec"\nreplace_path="history/states"\nreplace_path="map"\n');
    w(mod, "map/definition.csv", "0;0;0;0;land;false;unknown;0;\r\n11;1;1;1;land;false;plains;1;\r\n12;2;2;2;land;false;plains;1;\r\n");
    const victim = w(mod, "history/states/5-Kurdistan.txt", st(5, "Kurdistan", [11]));
    w(mod, "history/states/6-Other.txt", st(6, "Other", [12]));
    const bytes = fs.readFileSync(victim);

    // Exactly what /api/map/state-delete calls (server.js: mapData.deleteState({ …, stateId })).
    const r = md.deleteState({ modRoot: mod, gameRoot: GAME, dependencyRoots: [], stateId: 5 });
    rec("the state was deleted", !!(r && r.changed) && !fs.existsSync(victim), r);
    const where = copyOf(bytes);
    rec("⭐⭐⭐ the deleted file's bytes are recoverable", !!where, where || "found in neither the backup pool nor ~/.nova");
    if (where) {
      const copy = fs.readFileSync(where).toString("utf8");
      rec("…including the modder's own comment and victory points, byte for byte",
        copy.includes("keep-5") && copy.includes("victory_points"), copy.slice(0, 80));
    } else {
      rec("…including the modder's own comment and victory points, byte for byte", false, "no copy to read");
    }
  }

  console.log("\n4. CONTROL: deleteState's REWRITE branch was always recoverable");
  {
    const mod = mk("delctl");
    w(mod, "descriptor.mod", 'name="del rec"\nreplace_path="history/states"\nreplace_path="map"\n');
    w(mod, "map/definition.csv", "0;0;0;0;land;false;unknown;0;\r\n11;1;1;1;land;false;plains;1;\r\n12;2;2;2;land;false;plains;1;\r\n");
    const victim = w(mod, "history/states/both.txt", st(5, "Kurdistan", [11]) + st(6, "Other", [12]));
    const bytes = fs.readFileSync(victim);
    const r = md.deleteState({ modRoot: mod, gameRoot: GAME, dependencyRoots: [], stateId: 5 });
    rec("the state was deleted from the shared file", !!(r && r.changed) && fs.existsSync(victim), r);
    rec("…and its previous bytes are recoverable, as they always were", !!copyOf(bytes));
  }

  console.log("\n5. ⭐⭐ Through Auto-fix, the copy lands in the click's own snapshot too");
  {
    const mod = makeDupMod("afdup");
    const victim = path.join(mod, "history", "states", "1-restored.txt");
    const bytes = fs.readFileSync(victim);
    const r = md.autoFixMap({ modRoot: mod, gameRoot: GAME });
    rec("the click ran and had work to do", !!(r && r.ok) && !(r && r.nothingToFix), (r && (r.error || r.note)) || "");
    rec("…and it removed the duplicate", !!(r.fixes && r.fixes.dupStateFiles && r.fixes.dupStateFiles.removed.length), r.fixes && r.fixes.dupStateFiles);
    rec("…the deleted file is recoverable", !!copyOf(bytes));
    const snapDir = (r.fixes && r.fixes.backupSnapshot && r.fixes.backupSnapshot.dir) || "";
    const inSnap = snapDir ? filesUnder(snapDir).some((f) => { try { return fs.readFileSync(f).equals(bytes); } catch (_) { return false; } }) : false;
    rec("⭐⭐ …and it is inside the snapshot folder the click reports, where the user is told to look",
      inSnap, { snapDir, snapshot: (r.fixes && r.fixes.backupSnapshot) || null });
  }

  console.log("\n6. The standing rules, on the way past");
  {
    const mod = makeDupMod("rules");
    md.fixDuplicateStateFiles({ modRoot: mod });
    const inMod = filesUnder(mod).filter((p) => /\.bak$/i.test(p) || /backup/i.test(path.basename(p)));
    rec("nothing backup-shaped was left inside the mod", inMod.length === 0, inMod.slice(0, 3));
    rec("…and no copy Nova had already taken was removed", filesUnder(BACKUP_DIR).length > 0, filesUnder(BACKUP_DIR).length);
  }
} catch (e) {
  rec("harness", false, String((e && e.stack) || e));
} finally {
  for (const d of tmps) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) { /* scratch only */ } }
  console.log(`\n=== a state file Nova deletes stays recoverable: ${checks} checks, ${fails.length} failed ===`);
  if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
}
