// Regression: editing the research-screen GUI (interface/countrytechtreeview.gui) must back up the prior
// version FIRST, and that backup must SURVIVE pruning. This GUI *is* the in-game research screen — a bad
// edit can stop it opening, and it had no backup, so a damaged research GUI was unrecoverable. Found by the
// MD research-tree-won't-open dig.
//   Two fixes locked here:
//   1. create/sync/delete of a custom research folder now backs up countrytechtreeview.gui before writing.
//   2. pruneBackups orders by the filename's creation timestamp, not mtime — fs.copyFileSync preserves the
//      SOURCE mtime, so a backup of a long-untouched GUI was "born old" and an mtime sort pruned it on the
//      spot. The fix means a just-taken backup survives even when the backup dir is full of newer files.
// Uses an ISOLATED HOI4_MOD_ROOT so its backups don't churn against (or pollute) the real backup dir.
// Run: node test-research-gui-backup.js
const fs = require("fs"), os = require("os"), path = require("path");
const VAN = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV/interface/countrytechtreeview.gui";
const ISO_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-isoroot-"));
process.env.HOI4_MOD_ROOT = ISO_ROOT;            // -> server ROOT (isolated mod workspace)
// BACKUP_DIR was relocated (2026-06-30) from <driveRoot>\tools\focus-drag-editor\backups to
// NOVA_APP_DATA_DIR\backups (AppData). Point AppData resolution at our isolated root so this test's
// backups stay isolated and its BACKUP_DIR matches where the server now writes them. resolveNovaAppDataDir
// reads APPDATA (win32) / XDG_CONFIG_HOME (linux) before server.js is required.
process.env.APPDATA = ISO_ROOT;
process.env.XDG_CONFIG_HOME = ISO_ROOT;
const { createApp } = require("./server.js");
const BACKUP_DIR = path.join(ISO_ROOT, "NovaModdingSuite", "backups");
const PORT = 3503, BASE = `http://127.0.0.1:${PORT}`;
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) { pass++; console.log("  ✓ " + m); } else { fail++; console.log("  ✗ FAIL " + m + (x !== undefined ? " -> " + JSON.stringify(x) : "")); } };
const guiBackups = () => { try { return fs.readdirSync(BACKUP_DIR).filter((f) => /research-gui/.test(f) && /countrytechtreeview/i.test(f)); } catch (_) { return []; } };
const readBk = (f) => { try { return fs.readFileSync(path.join(BACKUP_DIR, f), "utf8"); } catch (_) { return null; } };

(async () => {
  if (!fs.existsSync(VAN)) { console.log("  (no vanilla countrytechtreeview.gui — skipping, treated as pass)"); process.exitCode = 0; return; }
  const app = createApp();
  const server = await new Promise((res) => { const s = app.listen(PORT, () => res(s)); });
  const post = (e, o) => fetch(BASE + e, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(o) }).then((r) => r.json());
  const mkmod = () => {
    const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-guibk-"));
    fs.writeFileSync(path.join(mod, "descriptor.mod"), 'name="GuiBk"\n');
    fs.mkdirSync(path.join(mod, "interface"), { recursive: true });
    fs.copyFileSync(VAN, path.join(mod, "interface", "countrytechtreeview.gui"));
    return mod;
  };
  const mods = [];
  try {
    // ── A. a normal create edits the gui and leaves a restorable backup of the original ──
    const modA = mkmod(); mods.push(modA);
    const guiA = path.join(modA, "interface", "countrytechtreeview.gui");
    const originalA = fs.readFileSync(guiA, "utf8");
    const ca = await post("/api/research/create-custom-folder", { modPath: modA, folderKey: "zztest_bkfold", ledger: "army" });
    ok(ca && ca.ok, "create-custom-folder ok", ca);
    ok(fs.readFileSync(guiA, "utf8") !== originalA, "the gui was actually modified");
    ok(guiBackups().some((f) => readBk(f) === originalA), "a backup byte-identical to the original gui exists (restorable)");

    // ── B. delete also backs up before its edit ──
    const beforeDel = new Set(guiBackups());
    await post("/api/research/delete-custom-folder", { modPath: modA, folderKey: "zztest_bkfold" });
    ok(guiBackups().filter((f) => !beforeDel.has(f)).length > 0, "delete-custom-folder also backs up before its edit");

    // ── C. pruning fix: a fresh backup of an OLD-mtime gui survives even when the dir is full of NEWER files ──
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const now = new Date();
    // #temp-backup-misfiled-as-real — saturate THE POOL the fresh backup lands in. Pruning is per pool
    // (#backup-quota-split), and modC lives under the OS temp dir, so its backup belongs to the temp pool. This used
    // to compete with plain dummy names only because a temp fixture's backup was misfiled as a real one; with that
    // fixed, dummies in another pool would never be pruned against it and this section would test nothing.
    const sw = require("./safe-write.js");
    const tmpMark = path.resolve(os.tmpdir()).replace(/[\\/:]/g, "__");
    const dummyName = (i) => `2000-01-01T00-00-00-${String(i).padStart(3, "0")}Z__dummy__${tmpMark}__x.txt`;
    ok(sw.isEphemeralBackupName(dummyName(0)), "the saturating dummies are in the temp pool, the same pool as the fresh backup");
    for (let i = 0; i < 205; i++) {                       // saturate with files NAMED old (year 2000) but mtime = now
      const f = path.join(BACKUP_DIR, dummyName(i));
      fs.writeFileSync(f, "d"); fs.utimesSync(f, now, now);
    }
    const modC = mkmod(); mods.push(modC);
    const guiC = path.join(modC, "interface", "countrytechtreeview.gui");
    const originalC = fs.readFileSync(guiC, "utf8");
    const old = new Date("2021-03-03T03:03:03Z");
    fs.utimesSync(guiC, old, old);                        // simulate a mod gui untouched since release (old mtime)
    const cc = await post("/api/research/create-custom-folder", { modPath: modC, folderKey: "zztest_prune", ledger: "army" });
    ok(cc && cc.ok, "create-custom-folder ok (saturated dir)", cc);
    // the fresh backup (filename timestamp = now, but mtime inherited = 2021) must still be present
    ok(guiBackups().some((f) => readBk(f) === originalC), "the just-made backup SURVIVED pruning despite an old inherited mtime (filename-timestamp ordering)");
    const total = (() => { try { return fs.readdirSync(BACKUP_DIR).length; } catch (_) { return -1; } })();
    ok(total <= 200, "backup dir was pruned back to the cap", { total });
  } catch (e) { ok(false, "threw: " + e.message + "\n" + e.stack); }
  finally {
    for (const m of mods) { try { fs.rmSync(m, { recursive: true, force: true }); } catch (_) {} }
    try { fs.rmSync(ISO_ROOT, { recursive: true, force: true }); } catch (_) {}
    console.log(`\n  ${pass} passed, ${fail} failed`);
    process.exitCode = fail ? 1 : 0;
    try { server.closeAllConnections(); } catch (_) {}
    server.close();
  }
})();
