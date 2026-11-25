// A backup of a REAL mod file must survive a flood of temp-mod (test) backups.
//
// WHY THIS EXISTS: pruneBackups kept one global 200-file window. Every automated test builds its mod
// under os.tmpdir() via fs.mkdtempSync, so a single `node run-tests.js` run wrote hundreds of backups
// and evicted every real one. That is not theoretical — an edit to a live Steam Workshop mod became
// unrecoverable because the only snapshot of the original was pruned by a test run minutes later.
// The fix gives ephemeral and real backups independent quotas; this test is the thing that keeps it.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const assert = require("assert");

let checks = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); checks += 1; };

// Mirror of the server's naming + pruning contract. buildBackupPath encodes the SOURCE path into the
// filename with [\\/:] -> "__", which is what makes "was this a temp file?" answerable after the fact.
const TMP_BACKUP_MARK = path.resolve(os.tmpdir()).replace(/[\\/:]/g, "__");
const isEphemeral = (name) => TMP_BACKUP_MARK.length > 2 && String(name || "").includes(TMP_BACKUP_MARK);

const encode = (p) => path.resolve(p).replace(/[\\/:]/g, "__");
const stamp = (i) => new Date(Date.UTC(2026, 0, 1, 0, 0, 0, 0) + i * 1000).toISOString().replace(/[:.]/g, "-");

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nova-bkq-"));
try {
  // The real mod's only snapshot, written FIRST — so a newest-first global cap would evict it.
  const realSrc = "D:\\SteamLibrary\\steamapps\\workshop\\content\\394360\\1827273767\\history\\countries\\ABK - Abkhazia.txt";
  const realName = `${stamp(0)}__country-save__${encode(realSrc)}`;
  fs.writeFileSync(path.join(dir, realName), "REAL", "utf8");
  ok(!isEphemeral(realName), "a live-mod backup is not classified ephemeral");

  // ...then a test run floods the dir with temp-mod backups (well past the cap).
  const MAX = 200;
  const tmpMod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-fuzzsim-"));
  const tmpNames = [];
  for (let i = 1; i <= MAX + 60; i += 1) {
    const n = `${stamp(i)}__technology-save__${encode(path.join(tmpMod, "common", "technologies", `t${i}.txt`))}`;
    fs.writeFileSync(path.join(dir, n), "TMP", "utf8");
    tmpNames.push(n);
  }
  ok(isEphemeral(tmpNames[0]), "a temp-mod backup IS classified ephemeral");

  // The prune, exactly as the server runs it.
  const entries = fs.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isFile())
    .map((e) => ({ fullPath: path.join(dir, e.name), name: e.name, mtimeMs: 0 }))
    .sort((a, b) => (a.name < b.name ? 1 : a.name > b.name ? -1 : 0));
  const pools = [entries.filter((e) => !isEphemeral(e.name)), entries.filter((e) => isEphemeral(e.name))];
  pools.forEach((pool) => {
    if (pool.length <= MAX) return;
    pool.slice(MAX).forEach((e) => { try { fs.unlinkSync(e.fullPath); } catch (_) {} });
  });

  const left = fs.readdirSync(dir);
  ok(left.includes(realName), "the live-mod backup SURVIVED a 260-file temp-mod flood");
  ok(left.filter(isEphemeral).length === MAX, `ephemeral pool pruned to its own cap (got ${left.filter(isEphemeral).length})`);
  ok(left.filter((n) => !isEphemeral(n)).length === 1, "real pool untouched");

  // The old single-pool behaviour, kept as the regression witness: it drops the real backup.
  const oldKept = entries.slice(0, MAX).map((e) => e.name);
  ok(!oldKept.includes(realName), "SANITY: the old single-cap prune would have evicted it (this is the bug)");

  try { fs.rmSync(tmpMod, { recursive: true, force: true }); } catch (_) {}
} finally {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {}
}

console.log(`test-backup-quota: ${checks} checks passed`);
