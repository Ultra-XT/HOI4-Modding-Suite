// A backup of a file under the OS temp dir is filed in the TEMP pool whatever directory the process started in — so a
// test or a scratch probe can never evict the user's real backups. #temp-backup-misfiled-as-real
//
// safe-write.js keeps three backup pools with independent 200-file caps (#backup-quota-split): temp-mod backups,
// map backups and everything else, so a test flood can only displace other test backups. The pool is decided from the
// backup's FILE NAME, which buildBackupPath makes from path.relative(cfg.root, target) — and cfg.root is
// `process.cwd()` captured when the module is LOADED, for anything that requires map-data.js without server.js: every
// map test and every scratch probe. Started from a folder inside Temp (a session scratchpad sits four levels under it),
// the name comes out as `..__..__..__..__nova-…`: the Temp marker is gone and the backup is filed as REAL.
//
// Measured on the owner's machine, 2026-09-11: both real pools sat at exactly 200 with 14 test-fixture backups in
// them (`fixmod__history__states__1-A.txt`, `..__..__..__..__nova-region-ctl-split-…`). Each one pushed a real
// backup of the owner's work out of the window. test-backup-quota.js could not see this: it re-implements the naming
// with path.resolve instead of calling buildBackupPath, so it only ever tested the absolute form.
//
// ⚠️ The first draft of THIS test passed on the unfixed code: it required safe-write.js from the repo and changed
// directory afterwards, by which time cfg.root was already fixed. Where the process stands at LOAD is what matters,
// so every section below loads a fresh copy from the directory it is testing.
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (detail == null ? "" : "   " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 240)));
  if (!ok) fails.push(label);
};

// Sandbox the app-data dir BEFORE safe-write.js resolves it, so nothing here touches the real backup folder.
const SANDBOX = fs.mkdtempSync(path.join(os.tmpdir(), "nova-bkcwd-home-"));
process.env.APPDATA = SANDBOX;
process.env.XDG_CONFIG_HOME = SANDBOX;
process.env.NOVA_APP_DATA_DIR = SANDBOX;

const FIX = fs.mkdtempSync(path.join(os.tmpdir(), "nova-bkcwd-mod-"));
const target = path.join(FIX, "map", "buildings.txt");
fs.mkdirSync(path.dirname(target), { recursive: true });
fs.writeFileSync(target, "1;arms_factory;1.00;9.50;1.00;0.00;0\n");
const CWD_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-bkcwd-cwd-"));
const DEEP = path.join(CWD_ROOT, "a", "b", "c");
fs.mkdirSync(DEEP, { recursive: true });
const origCwd = process.cwd();

const SW_PATH = path.join(__dirname, "safe-write.js");
const loadFrom = (dir) => { process.chdir(dir); delete require.cache[require.resolve(SW_PATH)]; return require(SW_PATH); };

try {
  let sw = loadFrom(DEEP);
  const BACKUP_DIR = path.join(sw.NOVA_APP_DATA_DIR, "backups");

  console.log("1. ⛔ Loaded from a folder inside Temp, a temp file's backup is still filed as temp");
  {
    rec("setup: the path relative to where the process started carries no absolute Temp marker",
      path.relative(process.cwd(), target).startsWith(".."), path.relative(process.cwd(), target));
    const name = path.basename(sw.buildBackupPath(target, "map-test"));
    rec("⭐⭐⭐ the backup name is classified ephemeral", sw.isEphemeralBackupName(name) === true, name);
  }

  console.log("\n2. ⛔⛔ …so a flood of temp backups from that process cannot evict a real map backup");
  {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const stamp = (i) => new Date(Date.UTC(2026, 0, 1, 0, 0, i)).toISOString().replace(/[:.]/g, "-");
    const realSrc = "D:\\SteamLibrary\\steamapps\\workshop\\content\\394360\\1827273767\\history\\states\\1-France.txt";
    const real = [0, 1, 2].map((i) => `${stamp(i)}__map-editStateBlock__${path.resolve(realSrc).replace(/[\\/:]/g, "__")}`);
    for (const n of real) fs.writeFileSync(path.join(BACKUP_DIR, n), "REAL");
    rec("setup: the three real map backups are not ephemeral", real.every((n) => !sw.isEphemeralBackupName(n)));
    for (let i = 0; i < 5; i++) sw.safeModWrite(target, `1;arms_factory;${i}.00;9.50;1.00;0.00;0\n`, "map-flood");
    sw.pruneBackups(3);
    const left = fs.readdirSync(BACKUP_DIR);
    rec("⭐⭐⭐ every real map backup survived the flood", real.every((n) => left.includes(n)), { left: left.map((n) => n.slice(0, 70)) });
    rec("…and the flood was pruned inside its own pool", left.filter((n) => sw.isEphemeralBackupName(n)).length === 3, left.length);
  }

  console.log("\n3. Controls: nothing else changes");
  {
    sw = loadFrom(__dirname);
    rec("loaded from the repo, a temp file's backup is ephemeral (as before)",
      sw.isEphemeralBackupName(path.basename(sw.buildBackupPath(target, "map-test"))) === true);
    rec("…and a file inside the repo keeps its short relative name",
      path.basename(sw.buildBackupPath(path.join(__dirname, "map", "definition.csv"), "map-test")).endsWith("__map-test__map__definition.csv"),
      path.basename(sw.buildBackupPath(path.join(__dirname, "map", "definition.csv"), "map-test")));
    sw = loadFrom(DEEP);
    const realTarget = path.join(os.homedir(), "Documents", "Paradox Interactive", "Hearts of Iron IV", "mod", "x", "map", "buildings.txt");
    const realName = path.basename(sw.buildBackupPath(realTarget, "map-test"));
    rec("⭐ a real mod file's backup is never ephemeral, even loaded from inside Temp", sw.isEphemeralBackupName(realName) === false, realName);
  }

  console.log(`\n=== a temp backup is filed as temp from any working directory: ${checks} checks, ${fails.length} failed ===`);
  if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
} catch (e) {
  console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 10).join("\n") : e);
  process.exitCode = 1;
} finally {
  try { process.chdir(origCwd); } catch (_) {}
  for (const d of [SANDBOX, FIX, CWD_ROOT]) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} }
}
