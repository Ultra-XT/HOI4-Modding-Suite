// ⛔ #a-save-run-outlives-its-process (B6-28) — A SAVE THE APP DIED IN THE MIDDLE OF KEEPS ITS FIRST COPIES TOO.
//
// A map Save is one run, and the run keeps its own first copies (the files as they were before the Save) out of the backups' pool's
// reach for as long as it lives (#a-save-keeps-its-own-first-copies). It lived in the process's memory only. A Save the app was closed
// in, or that died with it, left its first copies in the pool with nothing to know them by, and the Save that finished it (the crash-
// recovery bar's Restore, then 💾 Save: a new run, in a new process) pushed them out with its own backups. Measured on the B6 campaign's
// world (repro-B6-28, the page's own Paint and Shift-fills): 268 set-owner writes, the server killed after 152 had landed, the rest
// saved from the bar: 68 of the 152 had no copy as they were before the Save anywhere outside the mod.
//
// Now each run keeps a record of its first copies beside the pool (safe-write.js, <app data>/map_save_runs), and the next Save of the
// mod takes up every run another process left there: when the pool would delete one of its first copies, that run's own folder opens
// and takes them all, and the Save's answers name it ("An earlier Save of this mod").
//
// Pinned here, each with its control:
//   0. the wiring, read from the code (comments masked);
//   1. safe-write.js alone, two processes: the first dies hard part-way through a Save; the next Save of the mod, in this process,
//      fills the pool; every file the dead Save changed keeps its copy as it was, in that Save's own folder, which the answer names;
//   2. a run taken up ends with the Save that took it up, and the record holds that Save's run alone; in one process nothing changed;
//   3. THE CONTROL: the same death with its record moved aside (kept, not deleted): the pool loses those copies, as it did;
//   4. a line the dying process was writing, cut short, is passed over;
//   5. through the server, as the page sends it: a Save cut off with no answer, finished under a new Save id by a new server;
//   6. a folder the dying process had already opened: the next Save names it once, and not when the stop's answer had named it;
//   7. a run is taken up ONCE (#a-run-is-taken-up-once, review of B6-28 MF1): across processes too, it ends with the Save that took it
//      up, and a modder who makes one Save a session piles nothing up: no folder, no earlier Save named, a record of one run;
//   8. a dead Save some of whose first copies the pool pushed out before the next Save of its mod: the answer that names its folder says
//      how many have no copy anywhere (`failed`, #a-taken-up-run-says-what-it-lost, review MF2), both where that Save took the run up and
//      where a later Save of the same process names a folder that opened after.
//   (6, 7 and 8 run before 5: 5 starts a server, so it runs last.)
// The sections share one pool, as the app's Saves do, so each one's next Save writes exactly as many files as the pool keeps: every
// older copy goes, and none of that Save's own, so it opens no folder of its own.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const cp = require("child_process");

const CHILD = process.argv[2] === "--child" ? JSON.parse(process.argv[3]) : null;
const ROOT = CHILD ? CHILD.ROOT : fs.mkdtempSync(path.join(os.tmpdir(), "nova-save-outlives-"));
process.env.APPDATA = path.join(ROOT, "appdata"); process.env.NOVA_APP_DATA_DIR = process.env.APPDATA; process.env.XDG_CONFIG_HOME = process.env.APPDATA;
process.env.NOVA_HOME_DIR = path.join(ROOT, "home");
process.env.HOI4_MODS_ROOT = path.join(ROOT, "mods");
for (const d of [process.env.APPDATA, process.env.NOVA_HOME_DIR, process.env.HOI4_MODS_ROOT]) fs.mkdirSync(d, { recursive: true });
const SW = require("./safe-write.js");
const write = (dir, rel, body) => { const p = path.join(dir, ...rel.split("/")); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, body); return p; };
// where the mod's record is (a code without records has none: every check of one then fails, rather than the test stopping there)
const recordOf = (R) => (typeof SW.saveRunRecordOf === "function" ? SW.saveRunRecordOf(R) : path.join(ROOT, "no-record-of-" + path.basename(R) + ".txt"));

// ── a process that dies part-way through a Save: the app closed, crashed or killed. SIGKILL: no exit handler runs, no run ends. ─────
if (CHILD) {
  (async () => {
    if (CHILD.kind === "safe-write") {
      const run = SW.beginSaveRun({ dir: CHILD.dir, root: CHILD.root });
      SW.useSaveRun(run);
      for (const f of CHILD.files) SW.safeModWrite(f, "changed by the Save the app died in\n", "map-test");
      let refused = "";
      if (CHILD.refused) { try { SW.safeModWrite(CHILD.refused, "never written\n", "map-test"); } catch (e) { refused = e.message; } }
      // the line it was writing as it died, cut short
      if (CHILD.cutShort) fs.appendFileSync(recordOf(CHILD.root), `{"run":"${run.key}","abs":"${CHILD.files[0].replace(/\\/g, "\\\\")}","po`);
      // a Save that stopped at an answer: its folder opens (openSaveRun), and that answer may have named it before the process died
      if (CHILD.open) SW.openSaveRun(run);
      const named = CHILD.named ? ((SW.saveRunCopies(run) || {}).files || 0) : 0;
      fs.writeSync(1, "DONE " + JSON.stringify({ files: CHILD.files.length, refused: /read-only/.test(refused), key: run.key, opened: fs.existsSync(CHILD.dir), named }) + "\n");
    } else if (CHILD.kind === "server") {
      process.env.HOI4_ROOT = CHILD.game;
      const { createApp } = require("./server.js");
      const server = await new Promise((res, rej) => { const s = createApp().listen(0, "127.0.0.1", () => res(s)); s.on("error", rej); });
      const base = `http://127.0.0.1:${server.address().port}`;
      let answered = 0;
      for (const id of CHILD.states) {
        const r = await fetch(base + "/api/map/set-owner", { method: "POST", headers: { "Content-Type": "application/json", "X-Nova-Map-Save": CHILD.saveId }, body: JSON.stringify({ modPath: CHILD.root, stateId: id, owner: "BBB" }) }).then((x) => x.json());
        if (r && r.ok) answered++; else fs.writeSync(1, "REFUSED " + id + " " + JSON.stringify(r).slice(0, 300) + "\n");
      }
      fs.writeSync(1, "DONE " + JSON.stringify({ answered }) + "\n");
    } else if (CHILD.kind === "session") {
      // a later session of the app: ONE Save of the mod, and then the app is closed as a modder closes it. Nothing is cut off: it exits.
      const run = SW.beginSaveRun({ dir: CHILD.dir, root: CHILD.root });
      const was = SW.useSaveRun(run);
      try { for (const f of CHILD.files) SW.safeModWrite(f, CHILD.body || "changed by a Save of a later session\n", "map-test"); } finally { SW.useSaveRun(was); }
      const said = SW.saveRunCopies(run);
      fs.writeSync(1, "DONE " + JSON.stringify({ key: run.key, takenUp: (run.takenUp || []).map((a) => a.key), earlier: (said && said.earlier) || [] }) + "\n");
      process.exit(0);
    }
    process.kill(process.pid, "SIGKILL");
  })().catch((e) => { fs.writeSync(1, "CHILD FAILED " + String((e && e.stack) || e).slice(0, 600) + "\n"); process.kill(process.pid, "SIGKILL"); });
  return;
}

const { maskJsComments, maskJsLiterals, jsBodyAt } = require("./testlib-strip-comments.js");
const { BACKUP_DIR, MAX_BACKUP_FILES } = SW;
let pass = 0, fail = 0;
const ok = (c, m, x) => {
  if (c) { pass++; console.log("  ok   " + m); }
  else { fail++; console.log("  FAIL " + m + (x !== undefined ? "   -> " + JSON.stringify(x).slice(0, 700) : "")); }
};
const sha = (p) => crypto.createHash("sha1").update(fs.readFileSync(p)).digest("hex");
const backups = () => { try { return fs.readdirSync(BACKUP_DIR); } catch (_) { return []; } };
const tailOf = (abs) => path.resolve(abs).replace(/[\\/:]/g, "__");
/** the pool's copies of `abs` holding the bytes `want` */
const inPool = (abs, want) => backups().filter((n) => n.endsWith(tailOf(abs))).filter((n) => { try { return sha(path.join(BACKUP_DIR, n)) === want; } catch (_) { return false; } });
const filesOf = (dir) => { const out = new Map(); const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else out.set(path.relative(dir, p).split(path.sep).join("/"), sha(p)); } }; if (fs.existsSync(dir)) walk(dir); return out; };
/** the process that dies part-way through a Save */
const dies = (cfg) => {
  const r = cp.spawnSync(process.execPath, [__filename, "--child", JSON.stringify(Object.assign({ ROOT }, cfg))], { encoding: "utf8", env: process.env, timeout: 300000, maxBuffer: 16 * 1024 * 1024 });
  const out = String(r.stdout || "") + String(r.stderr || "");
  const m = /^DONE (.*)$/m.exec(out);
  return { signal: r.signal, status: r.status, done: m ? JSON.parse(m[1]) : null, out: out.slice(-1500) };
};
const diedHard = (c) => c.signal === "SIGKILL" || (c.status !== 0 && c.status !== null);
/** a later session of the app, in a process of its own: one Save, then closed normally (the same spawn as `dies`) */
const aLaterSession = (cfg) => dies(Object.assign({ kind: "session" }, cfg));
/** a mod R of `n` files under map/<prefix>/, each holding its own first text */
const modOf = (name, n, prefix = "f") => {
  const R = path.join(process.env.HOI4_MODS_ROOT, name);
  write(R, "descriptor.mod", `name="${name}"\n`);
  const files = Array.from({ length: n }, (_, i) => write(R, `map/${prefix}/${i}.txt`, `${name} ${prefix} ${i}, as it was before the Save\n`));
  return { R, files, before: new Map(files.map((f) => [f, sha(f)])) };
};
const relIn = (R, f) => path.relative(R, f).split(path.sep).join("/");
const saveDirOf = (R, stamp) => path.join(process.env.NOVA_HOME_DIR, ".nova", "map_saves", path.basename(R), stamp);
/** a Save of `files` in a run of this process, as server.js handles one */
const saveHere = (R, dir, files, body = "changed by the next Save\n") => {
  const run = SW.beginSaveRun({ dir, root: R });
  const was = SW.useSaveRun(run);
  try { for (const f of files) SW.safeModWrite(f, body, "map-test"); } finally { SW.useSaveRun(was); }
  return run;
};
const recordLines = (R) => { try { return fs.readFileSync(recordOf(R), "utf8").split("\n").filter(Boolean); } catch (_) { return []; } };
const heads = (lines) => lines.filter((l) => /"head":1/.test(l));
/** the lines a later process would take the run `key` up from: its head and its first copies (a line saying an answer named its folder
 *  names no run on its own: the reader passes over a line whose run has no head) */
const takeUpLinesOf = (lines, key) => lines.filter((l) => l.includes(`"run":"${key}"`) && (/"head":1/.test(l) || /"abs":/.test(l)));

console.log("\n-- 0. the wiring, read from the code (comments masked) --");
{
  const raw = fs.readFileSync(path.join(__dirname, "safe-write.js"), "utf8");
  const code = maskJsComments(raw), lit = maskJsLiterals(raw);
  const body = (name) => { const a = lit.indexOf("function " + name + "("); if (a < 0) return ""; const b = jsBodyAt(lit, a); return b ? code.slice(a, b[1] + 1) : ""; };
  const begin = body("beginSaveRun"), takeUp = body("_takeUpRunsOfAnEarlierProcess"), after = body("saveRunAfterBackup"), use = body("useSaveRun");
  const copies = body("saveRunCopies"), writeRec = body("_writeSaveRunRecord"), safe = body("safeModWrite");
  ok(begin.indexOf("_takeUpRunsOfAnEarlierProcess(run)") !== -1 && begin.indexOf("_takeUpRunsOfAnEarlierProcess(run)") < begin.indexOf("_saveRuns.add(run)"),
    "⭐ beginSaveRun takes up the runs another process left before the new run is held", begin.length);
  ok(/_readSaveRunRecord\(file\)/.test(takeUp) && /_saveRuns\.add\(a\)/.test(takeUp) && /run\.takenUp\.push\(a\)/.test(takeUp) && /_takenUp\.has\(key\)/.test(takeUp) && /_thisProcess/.test(takeUp),
    "⭐ …each one held as a live run is, tied to the Save that took it up, and never one of this process's or one taken up already", takeUp.length);
  ok(/_writeSaveRunRecord\(file,/.test(takeUp), "⭐ …and the record is rewritten as the Save begins", takeUp.length);
  const naming = body("_takenUpFoldersToName");
  ok(/_saveRunFilesLost\(a\)/.test(naming) && /failed: lost/.test(naming) && /_saveRunFilesLost\(r\)/.test(begin) && /failed: lost/.test(begin),
    "⭐ both places that name an earlier Save's folder also count the files it changed that have no copy anywhere (`failed`)", { naming: naming.length, begin: begin.length });
  const note = after.indexOf("_noteInSaveRunRecord(run.record");
  ok(note !== -1 && note < after.indexOf("_openSaveRun(run)"), "⭐⭐ every first copy a run takes goes into its record as it is taken", after.length);
  ok(safe.indexOf("saveRunAfterBackup(absPath, backupPath)") !== -1 && safe.indexOf("saveRunAfterBackup(absPath, backupPath)") < safe.indexOf("pruneBackups(MAX_BACKUP_FILES)"),
    "⭐ …which is before the pool's prune can take it (safeModWrite)", safe.length);
  ok(/for \(const a of _saveRun\.takenUp/.test(use) && /a\.last = _saveRun\.last/.test(use), "⭐ a run taken up lives as long as the Save that took it up (useSaveRun)", use);
  ok(/_takenUpFoldersToName\(run\)/.test(copies) && /earlier/.test(copies), "⭐ the Save's answers name the folder of a run it took up (`earlier`)", copies.length);
  ok(/fs\.writeFileSync\(runRecordTmp,/.test(writeRec) && /renameOverWithRetry\(runRecordTmp, file\)/.test(writeRec), "the record is written to a temporary file and renamed over, never truncated in place", writeRec);
  const removes = [...code.matchAll(/fs\.(?:unlinkSync|rmSync|rmdirSync)\(([^)]*)\)/g)].map((m) => m[1]).filter((a) => /record|Record|SAVE_RUN_RECORD_DIR/.test(a));
  ok(removes.length === 0, "⭐⭐ nothing in safe-write.js deletes a record: it is only ever rewritten", removes);
  const SV = maskJsComments(fs.readFileSync(path.join(__dirname, "server.js"), "utf8"));
  const mw = SV.indexOf('req.get("x-nova-map-save")');
  ok(mw !== -1 && /safeWrite\.beginSaveRun\(\{ dir, root: modRoot \}\)/.test(SV.slice(mw, mw + 2500)),
    "⭐ server.js begins each new Save id's run with its folder and its mod, so the Save that finishes a dead one takes it up", mw);
}

console.log("\n-- ⭐ 1. safe-write.js alone: a Save the app died in, and the next Save of its mod filling the pool --");
let first = null;
{
  const N = 40;
  const m = modOf("died", N), flood = modOf("died", MAX_BACKUP_FILES, "next").files;
  const refused = write(m.R, "map/locked.txt", "a file the Save could not write\n"), refusedSha = sha(refused);
  fs.chmodSync(refused, 0o444);
  const D1 = saveDirOf(m.R, "the-save-the-app-died-in");
  const c = dies({ kind: "safe-write", root: m.R, dir: D1, files: m.files, refused });
  fs.chmodSync(refused, 0o644);
  const changed = m.files.filter((f) => sha(f) !== m.before.get(f));
  ok(diedHard(c), "THE CONTROL: the process died hard part-way through its Save", { signal: c.signal, status: c.status });
  ok(c.done && c.done.files === N && c.done.refused && changed.length === N && sha(refused) === refusedSha,
    `THE CONTROL: it had changed ${N} files, and its write of a read-only one was refused ("Nothing was changed")`, { done: c.done, changed: changed.length, out: c.out });
  ok(m.files.every((f) => inPool(f, m.before.get(f)).length === 1) && inPool(refused, refusedSha).length === 1 && !fs.existsSync(D1),
    `THE CONTROL: right after the death all ${N + 1} first copies are in the pool, and no folder was made`, { inPool: m.files.filter((f) => inPool(f, m.before.get(f)).length).length, folder: fs.existsSync(D1) });
  const rec = recordLines(m.R);
  ok(rec.length === N + 2 && /"head":1/.test(rec[0]) && rec.slice(1).every((l) => /"abs":/.test(l)), `the record names the run and its ${N + 1} first copies`, rec.slice(0, 2));
  // the next Save of the mod, in a new process: 200 other files of the same mod, which with the 41 above is more than the pool keeps
  const D2 = saveDirOf(m.R, "the-next-save");
  const run2 = saveHere(m.R, D2, flood);
  const lost = m.files.filter((f) => inPool(f, m.before.get(f)).length === 0);
  ok(lost.length === N, `THE CONTROL: the pool alone has let all ${N} of those first copies go (it keeps ${MAX_BACKUP_FILES})`, { lost: lost.length });
  const kept = filesOf(D1);
  const asBefore = m.files.filter((f) => kept.get(relIn(m.R, f)) === m.before.get(f));
  ok(asBefore.length === N, `⭐⭐⭐ …and every one of the ${N} files the dead Save changed has its copy as it was before the Save, in that Save's own folder`, { asBefore: asBefore.length, folder: [...kept.keys()].slice(0, 6) });
  ok(kept.size === N + 1 && kept.get("map/locked.txt") === refusedSha, "⭐⭐ …which holds what that Save took and nothing else (the read-only file's copy too, as it was)", [...kept.keys()].slice(-4));
  const said = SW.saveRunCopies(run2);
  ok(said && Array.isArray(said.earlier) && said.earlier.length === 1 && said.earlier[0].dir === D1 && said.earlier[0].files === N,
    `⭐⭐⭐ the next Save's answer names that folder as an earlier Save's, with the ${N} files it changed (not the one it never could)`, said);
  ok(said && Array.isArray(said.earlier) && said.earlier[0] && !("failed" in said.earlier[0]),
    "⭐ …and, none of them pushed out before it took the run up, it says of none that it has no copy", said && said.earlier);
  ok(said && !fs.existsSync(D2) && said.files === 0 && said.dir === "", "⭐ …and that Save's own first copies stay in the pool, as they always did: it opened no folder of its own", { d2: fs.existsSync(D2), said });
  ok(backups().length <= MAX_BACKUP_FILES, "…and the pool is no bigger than it ever was", backups().length);
  const again = SW.saveRunCopies(run2);
  ok(again && again.earlier && again.earlier[0].dir === D1, "⭐ …in every answer of that Save, as it names its own", again);
  first = { m, D1, run2, deadKey: c.done ? c.done.key : "" };
}

console.log("\n-- ⭐ 2. a run taken up ends with the Save that took it up; in one process nothing changed --");
{
  const { m, D1, run2, deadKey } = first;
  const before = recordLines(m.R);
  // ⛔ #a-run-is-taken-up-once — this check said "while the Save that took it up lives, the record holds both runs": that was the cause of
  // review MF1 (every later process took the dead run up again), so it moved with the fix
  ok(heads(before).length === 1 && heads(before)[0].includes(`"run":"${run2.key}"`) && !!deadKey && takeUpLinesOf(before, deadKey).length === 0,
    "⭐⭐ while the Save that took it up lives, the record holds that Save's run alone: the dead run lives on in that Save's memory, and no later process can take it up again", { heads: heads(before), deadKey });
  const more = modOf("died", 3, "third").files;
  const run3 = saveHere(m.R, saveDirOf(m.R, "the-save-after"), more);
  const after = recordLines(m.R);
  ok(after.length === 1 + more.length && heads(after).length === 1 && after[0].includes(`"run":"${run3.key}"`), "⭐⭐ the Save after it ends both: the record holds that Save alone, one Save's worth", after.slice(0, 2));
  ok(!(SW.saveRunCopies(run3) || {}).earlier, "⭐ …and it names no earlier Save: the one that took the dead run up named it", SW.saveRunCopies(run3));
  ok(filesOf(D1).size === 41, "…and the folder that run opened stays as it was", filesOf(D1).size);
  // in one process: a later Save of the same mod still lets an earlier one's first copies go, and opens no folder for it
  const one = modOf("one-process", 1), flood = modOf("one-process", MAX_BACKUP_FILES + 20, "next").files;
  const D4 = saveDirOf(one.R, "earlier-save");
  saveHere(one.R, D4, one.files);
  ok(inPool(one.files[0], one.before.get(one.files[0])).length === 1, "THE CONTROL: a Save of one file, its first copy in the pool");
  saveHere(one.R, saveDirOf(one.R, "later-save"), flood);
  ok(inPool(one.files[0], one.before.get(one.files[0])).length === 0 && !fs.existsSync(D4),
    "⭐⭐ in one process a later Save of the same mod lets an earlier one's first copies go, as it always did: the record changes nothing there", { folder: fs.existsSync(D4) });
  for (let i = 0; i < 5; i++) saveHere(one.R, saveDirOf(one.R, "save-" + i), flood.slice(0, 2));
  const rec = recordLines(one.R);
  ok(rec.length === 3 && heads(rec).length === 1, "⭐ …and after seven Saves of a mod its record holds one Save's lines", rec.length);
}

console.log("\n-- ⭐ 3. THE CONTROL: the same death, its record moved aside before the next Save --");
{
  const N = 40;
  const m = modOf("died-unrecorded", N), flood = modOf("died-unrecorded", MAX_BACKUP_FILES, "next").files;
  const D1 = saveDirOf(m.R, "the-save-the-app-died-in");
  const c = dies({ kind: "safe-write", root: m.R, dir: D1, files: m.files });
  const rec = recordOf(m.R), aside = rec + ".moved-aside-by-the-control";
  ok(diedHard(c) && c.done && c.done.files === N && fs.existsSync(rec), "THE CONTROL: a second Save died the same way, and left its record", c.done);
  if (fs.existsSync(rec)) fs.renameSync(rec, aside);   // kept: what a process with no record sees
  saveHere(m.R, saveDirOf(m.R, "the-next-save"), flood);
  const nowhere = m.files.filter((f) => inPool(f, m.before.get(f)).length === 0 && !fs.existsSync(path.join(D1, relIn(m.R, f))));
  ok(nowhere.length === N && !fs.existsSync(D1), `⭐⭐ with no record the next Save pushed all ${N} first copies out: no copy as they were, anywhere (what repro-B6-28 measured)`, { nowhere: nowhere.length, folder: fs.existsSync(D1) });
  ok(fs.existsSync(aside), "…and the record the control moved aside is still there", aside);
}

console.log("\n-- ⭐ 4. a line the dying process was writing, cut short, is passed over --");
{
  const N = 12;
  const m = modOf("cut-short", N), flood = modOf("cut-short", MAX_BACKUP_FILES, "next").files;
  const D1 = saveDirOf(m.R, "the-save-the-app-died-in");
  const c = dies({ kind: "safe-write", root: m.R, dir: D1, files: m.files, cutShort: true });
  let raw = "";
  try { raw = fs.readFileSync(recordOf(m.R), "utf8"); } catch (_) { raw = ""; }
  ok(diedHard(c) && c.done && !raw.endsWith("\n") && /"po$/.test(raw), "THE CONTROL: the record ends in half a line", raw.slice(-60));
  const run2 = saveHere(m.R, saveDirOf(m.R, "the-next-save"), flood);
  const kept = filesOf(D1), said = SW.saveRunCopies(run2);
  ok(m.files.every((f) => kept.get(relIn(m.R, f)) === m.before.get(f)) && said && said.earlier && said.earlier[0].dir === D1 && said.earlier[0].files === N,
    `⭐⭐ the run is still taken up: all ${N} first copies kept as they were, and named`, { kept: kept.size, said });
  ok(recordLines(m.R).every((l) => { try { JSON.parse(l); return true; } catch (_) { return false; } }), "⭐ …and the record it rewrote holds whole lines only", recordLines(m.R).slice(0, 2));
}

console.log("\n-- ⭐ 6. a folder the dying process had opened: the next Save names it once, and never one an answer had named --");
{
  const N = 12;
  const m = modOf("died-opened", N);
  const D1 = saveDirOf(m.R, "the-save-the-app-died-in");
  const c = dies({ kind: "safe-write", root: m.R, dir: D1, files: m.files, open: true });
  const inD1 = filesOf(D1);
  ok(diedHard(c) && c.done && c.done.opened && c.done.named === 0 && inD1.size === N && m.files.every((f) => inD1.get(relIn(m.R, f)) === m.before.get(f)),
    `THE CONTROL: the Save stopped and its folder opened (all ${N} first copies in it, as they were), and the process died before an answer named it`, { done: c.done, inD1: inD1.size, out: c.out });
  // the next Save of the mod writes one file: its own backups push nothing of the dead Save's out
  const run2 = saveHere(m.R, saveDirOf(m.R, "the-next-save"), m.files.slice(0, 1), "written again by the next Save\n");
  const said = SW.saveRunCopies(run2);
  ok(said && Array.isArray(said.earlier) && said.earlier.length === 1 && said.earlier[0].dir === D1 && said.earlier[0].files === N,
    `⭐⭐ the next Save's answer names that folder as an earlier Save's, with the ${N} files it changed`, said);
  const afterD1 = filesOf(D1);
  ok(afterD1.size === N && m.files.every((f) => afterD1.get(relIn(m.R, f)) === m.before.get(f)), "⭐ …and the folder is as the dead process left it: nothing copied twice, nothing over a first copy", afterD1.size);
  // the same, where the stop's answer HAD named the folder before the process died
  const n2 = modOf("died-opened-named", N);
  const D3 = saveDirOf(n2.R, "the-save-the-app-died-in");
  const c2 = dies({ kind: "safe-write", root: n2.R, dir: D3, files: n2.files, open: true, named: true });
  ok(diedHard(c2) && c2.done && c2.done.opened && c2.done.named === N && filesOf(D3).size === N, `THE CONTROL: a Save whose stop's answer named its folder (${N} files), and then the process died`, { done: c2.done, out: c2.out });
  const run4 = saveHere(n2.R, saveDirOf(n2.R, "the-next-save"), n2.files.slice(0, 1), "written again by the next Save\n");
  const said4 = SW.saveRunCopies(run4);
  ok(!(said4 && said4.earlier), "⭐ …and the next Save does not name it a second time", said4);
}

console.log("\n-- ⭐⭐ 7. a run is taken up ONCE: in another process too, it ends with the Save that took it up (review of B6-28, MF1) --");
{
  const N = 40;
  const m = modOf("taken-up-once", N), one = modOf("taken-up-once", 1, "second").files, flood = modOf("taken-up-once", MAX_BACKUP_FILES, "next").files;
  const D1 = saveDirOf(m.R, "the-save-the-app-died-in"), D2 = saveDirOf(m.R, "the-next-session"), D3 = saveDirOf(m.R, "the-session-after");
  const c = dies({ kind: "safe-write", root: m.R, dir: D1, files: m.files });
  ok(diedHard(c) && c.done && c.done.files === N, `THE CONTROL: a Save of ${N} files died with its process`, { done: c.done, out: c.out.slice(-400) });
  // the next session: one Save of one other file of the mod, and the app closed normally
  const s2 = aLaterSession({ root: m.R, dir: D2, files: one });
  ok(s2.status === 0 && s2.done && c.done && s2.done.takenUp.length === 1 && s2.done.takenUp[0] === c.done.key,
    "THE CONTROL: the next session's Save took the dead run up, and that session closed normally", { status: s2.status, done: s2.done, out: s2.out.slice(-400) });
  const rec2 = recordLines(m.R);
  ok(s2.done && c.done && heads(rec2).length === 1 && heads(rec2)[0].includes(`"run":"${s2.done.key}"`) && takeUpLinesOf(rec2, c.done.key).length === 0,
    "⭐⭐ the record then holds that session's Save alone: the run it took up is in no record, so no later process takes it up again", { heads: heads(rec2), lines: rec2.length });
  // the session after: one Save that backs up as many files as the pool keeps, so every older copy is pushed out
  const run3 = saveHere(m.R, D3, flood);
  ok(m.files.every((f) => inPool(f, m.before.get(f)).length === 0), `THE CONTROL: that Save's backups pushed all ${N} of the dead Save's first copies out of the pool`);
  const took3 = (run3.takenUp || []).map((a) => a.key);   // (a code with no take-up has no list: every check of one then fails, rather than the test stopping)
  ok(s2.done && took3.length === 1 && took3[0] === s2.done.key,
    "⭐⭐⭐ the Save after it takes up the run of the session before alone, not again the run that session took up", took3);
  ok(!fs.existsSync(D1), "⭐⭐⭐ …so the dead Save's folder does not open two Saves on: its run ended with the Save that took it up", D1);
  const e = (SW.saveRunCopies(run3) || {}).earlier || [];
  ok(e.length === 1 && e[0].dir === D2 && e[0].files === 1,
    "⭐ …and its answer names the one folder it held, the session before's, whose Save it cannot tell from one cut off (the cost the code's comment states)", e);
  ok(heads(recordLines(m.R)).length === 1, "⭐ …and the record holds that Save's run alone", heads(recordLines(m.R)));

  // a modder who makes one Save a session, none of them cut off: each Save takes up the one before, and nothing piles up
  const K = 5, PER = 60;
  const k5 = modOf("one-save-a-session", K * PER, "s");
  const rows = [];
  for (let k = 0; k < K; k++) {
    const s = aLaterSession({ root: k5.R, dir: saveDirOf(k5.R, `session-${k + 1}`), files: k5.files.slice(k * PER, (k + 1) * PER) });
    rows.push({ status: s.status, key: s.done ? s.done.key : "", takenUp: s.done ? s.done.takenUp : null, earlier: s.done ? s.done.earlier.length : null, heads: heads(recordLines(k5.R)).length });
  }
  ok(rows.every((r) => r.status === 0 && r.key), `THE CONTROL: ${K} sessions, each one Save of ${PER} files, each closed normally`, rows);
  ok(rows.every((r, i) => r.takenUp && r.takenUp.length === (i ? 1 : 0) && (!i || r.takenUp[0] === rows[i - 1].key)),
    "⭐⭐ each session's Save took up the run of the session before, and that one only", rows.map((r) => r.takenUp));
  ok(rows.every((r) => r.heads === 1), "⭐⭐ …and the record held one run after every session", rows.map((r) => r.heads));
  const savesOfK = path.join(process.env.NOVA_HOME_DIR, ".nova", "map_saves", path.basename(k5.R));
  const left = fs.existsSync(savesOfK) ? fs.readdirSync(savesOfK) : [];
  ok(left.length === 0 && rows.every((r) => r.earlier === 0),
    `⭐⭐⭐ …and no folder opened and no Save named an earlier one: ${K} ordinary sessions, nothing cut off, nothing kept past what the pool keeps`, { left, earlier: rows.map((r) => r.earlier) });
}

console.log("\n-- ⭐⭐ 8. a dead Save some of whose first copies left the pool before its mod's next Save: the answer says how many (review of B6-28, MF2) --");
{
  // the page's words for an earlier Save: map.js saveCopiesNote words each `earlier` entry through generatedLandBackupsNote, which is
  // backupSnapshotNote of the module both map pages load
  let labels = null;
  try { labels = require("./public/map-rule-labels.js"); } catch (_) { labels = null; }
  const pageSays = (e) => (labels && typeof labels.backupSnapshotNote === "function" ? labels.backupSnapshotNote({ backupSnapshot: e }) : "");
  const N = 40, GONE = 20;
  {
    const m = modOf("pushed-out-first", N), flood = modOf("pushed-out-first", MAX_BACKUP_FILES, "next").files;
    const q = modOf("another-mod", MAX_BACKUP_FILES - N + GONE);
    const D1 = saveDirOf(m.R, "the-save-the-app-died-in");
    const c = dies({ kind: "safe-write", root: m.R, dir: D1, files: m.files });
    ok(diedHard(c) && c.done && c.done.files === N, `THE CONTROL: a Save of ${N} files died with its process`, { done: c.done, out: c.out.slice(-400) });
    // the restarted app: first a Save of ANOTHER mod. Nothing holds the dead run yet, so the pool pushes the oldest of its copies out.
    saveHere(q.R, saveDirOf(q.R, "a-save-of-another-mod"), q.files);
    const stillInPool = m.files.filter((f) => inPool(f, m.before.get(f)).length === 1).length;
    ok(stillInPool === N - GONE && !fs.existsSync(D1),
      `THE CONTROL: that Save pushed ${GONE} of the dead Save's ${N} first copies out of the pool, before any Save of its mod`, { stillInPool, d1: fs.existsSync(D1) });
    // the Save of the mod, as many files as the pool keeps: the dead run, taken up now, opens its folder with what was left
    const run2 = saveHere(m.R, saveDirOf(m.R, "the-next-save"), flood);
    const kept = filesOf(D1);
    ok(kept.size === N - GONE && m.files.filter((f) => kept.get(relIn(m.R, f)) === m.before.get(f)).length === N - GONE,
      `THE CONTROL: the dead Save's folder opened with the ${N - GONE} first copies the pool still had, each as it was`, kept.size);
    const e = (SW.saveRunCopies(run2) || {}).earlier || [];
    ok(e.length === 1 && e[0].dir === D1 && e[0].files === N - GONE && e[0].failed === GONE,
      `⭐⭐⭐ the answer names that folder with the ${N - GONE} files it holds, and the ${GONE} more the dead Save changed that have no copy anywhere`, e);
    const line = e.length ? pageSays(e[0]) : "";
    ok(line.indexOf(`Changed ${N - GONE} files`) !== -1 && line.indexOf(`(${GONE} more files could not be copied.)`) !== -1,
      `⭐⭐ …so the page's words say ${GONE} more could not be copied, where they said "a copy of all of them" of ${N - GONE}`, line);
  }
  {
    // …and the same, where the run was taken up by a Save too small to push anything out and its folder opened later in this process,
    // under a big Save of another mod within the hour: the NEXT Save of the mod names it (#a-save-folder-nobody-was-told-about)
    const m = modOf("pushed-out-then-named", N), other = modOf("pushed-out-then-named", 1, "other").files;
    const q = modOf("a-third-mod", MAX_BACKUP_FILES - N + GONE), big = modOf("a-fourth-mod", MAX_BACKUP_FILES);
    const D1 = saveDirOf(m.R, "the-save-the-app-died-in");
    const c = dies({ kind: "safe-write", root: m.R, dir: D1, files: m.files });
    saveHere(q.R, saveDirOf(q.R, "a-save-of-another-mod"), q.files);
    // a Save that makes one new file: it backs nothing up, so it pushes nothing out of the pool, which the Save of another mod left full
    const made = path.join(m.R, "map", "f", "made-by-a-small-save.txt");
    const taker = saveHere(m.R, saveDirOf(m.R, "a-small-save"), [made]);
    const stillInPool = m.files.filter((f) => inPool(f, m.before.get(f)).length === 1).length;
    const took = (taker.takenUp || []).length;
    ok(diedHard(c) && took === 1 && fs.existsSync(made) && stillInPool === N - GONE && !fs.existsSync(D1),
      `THE CONTROL: the dead run, ${GONE} of its first copies pushed out already, was taken up by a Save that made one file and opened nothing`, { died: diedHard(c), taken: took, stillInPool, d1: fs.existsSync(D1) });
    saveHere(big.R, saveDirOf(big.R, "a-big-save-of-another-mod"), big.files);
    ok(filesOf(D1).size === N - GONE, `THE CONTROL: a big Save of another mod opened the dead run's folder with the ${N - GONE} copies left`, filesOf(D1).size);
    const next = saveHere(m.R, saveDirOf(m.R, "the-next-save"), other);
    const all = (SW.saveRunCopies(next) || {}).earlier || [];
    const e = all.filter((x) => x && x.dir === D1);
    ok(e.length === 1 && e[0].files === N - GONE && e[0].failed === GONE,
      `⭐⭐⭐ the next Save of the mod names that folder with the ${N - GONE} it holds and the ${GONE} with no copy anywhere`, all);
  }
}

(async () => {
  console.log("\n-- ⭐⭐ 5. through the server, as the page sends it: a Save cut off with no answer, finished under a new Save id --");
  let server = null;
  try {
    const GAME = path.join(ROOT, "game");
    write(GAME, "hoi4.exe", "");
    const K = 30, M = MAX_BACKUP_FILES, ids = Array.from({ length: K + M }, (_, i) => 300 + i);
    const stateText = (id) => `state={\n\tid=${id}\n\tname="STATE_${id}"\n\tmanpower=1000\n\tstate_category=rural\n\tprovinces={ }\n\thistory={\n\t\towner=AAA\n\t}\n}\n`;
    const MOD = path.join(process.env.HOI4_MODS_ROOT, "cut-off-save");
    write(MOD, "descriptor.mod", 'name="cut off save"\nreplace_path="history/states"\n');
    const fileOf = (id) => path.join(MOD, "history", "states", `${id}-Far.txt`);
    for (const id of ids) write(MOD, `history/states/${id}-Far.txt`, stateText(id));
    const was = new Map(ids.map((id) => [id, sha(fileOf(id))]));
    // the app: a Save of K states, killed before it could answer anything more
    const c = dies({ kind: "server", game: GAME, root: MOD, saveId: "save-the-app-died-in-" + Date.now().toString(36), states: ids.slice(0, K) });
    const savesOf = path.join(process.env.NOVA_HOME_DIR, ".nova", "map_saves");
    const dirsNow = () => { const out = []; if (!fs.existsSync(savesOf)) return out; for (const d of fs.readdirSync(savesOf)) if (d.startsWith("cut-off-save_")) for (const s of fs.readdirSync(path.join(savesOf, d))) out.push(path.join(savesOf, d, s)); return out; };
    ok(diedHard(c) && c.done && c.done.answered === K, `THE CONTROL: the server answered ${K} set-owner writes of one Save and died`, { done: c.done, signal: c.signal, status: c.status, out: c.out.slice(-600) });
    ok(ids.slice(0, K).every((id) => sha(fileOf(id)) !== was.get(id) && inPool(fileOf(id), was.get(id)).length === 1) && dirsNow().length === 0,
      `THE CONTROL: all ${K} state files changed, each with its first copy in the pool, and no folder opened`, { dirs: dirsNow() });
    // a new server; the bar's Restore, 💾 Save: the rest of the queue under a NEW Save id (the page's id lives on its model, and a reload replaces it)
    process.env.HOI4_ROOT = GAME;
    const { createApp } = require("./server.js");
    server = await new Promise((res, rej) => { const s = createApp().listen(0, "127.0.0.1", () => res(s)); s.on("error", rej); });
    const base = `http://127.0.0.1:${server.address().port}`;
    const id2 = "the-save-the-bar-restored-" + Date.now().toString(36);
    let last = null, refused = 0;
    for (const id of ids.slice(K)) {
      last = await fetch(base + "/api/map/set-owner", { method: "POST", headers: { "Content-Type": "application/json", "X-Nova-Map-Save": id2 }, body: JSON.stringify({ modPath: MOD, stateId: id, owner: "BBB" }) }).then((x) => x.json());
      if (!last || !last.ok) refused++;
    }
    ok(refused === 0, `THE CONTROL: the restored Save wrote its ${M} states`, last);
    ok(ids.slice(0, K).every((id) => inPool(fileOf(id), was.get(id)).length === 0), `THE CONTROL: the pool alone has let all ${K} of the dead Save's first copies go`);
    const e = last && last.saveCopies && Array.isArray(last.saveCopies.earlier) ? last.saveCopies.earlier : [];
    const keptIn = (d, id) => { const p = path.join(d, "history", "states", `${id}-Far.txt`); return fs.existsSync(p) && sha(p) === was.get(id); };
    const nowhere = ids.slice(0, K).filter((id) => !dirsNow().some((d) => keptIn(d, id)));
    ok(nowhere.length === 0, `⭐⭐⭐ …and every one of the ${K} state files the dead Save changed still has its copy as it was before the Save, outside the mod`, { nowhere: nowhere.slice(0, 8), dirs: dirsNow() });
    ok(e.length === 1 && e[0].files === K && ids.slice(0, K).every((id) => keptIn(e[0].dir, id)), `⭐⭐⭐ …in one folder, which the restored Save's answer names as an earlier Save's, with its ${K} files`, { earlier: e, dirs: dirsNow() });
    ok(e.length === 1 && ids.slice(K).every((id) => !fs.existsSync(path.join(e[0].dir, "history", "states", `${id}-Far.txt`))), "⭐ …which holds none of the restored Save's own files: those are that Save's own first copies", e);
  } catch (err) {
    ok(false, "the Saves through the server ran", String((err && err.stack) || err).slice(0, 700));
  } finally {
    if (server) await new Promise((r) => server.close(r));
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
    console.log(`\n${fail ? "FAILED" : "PASSED"} ${pass}/${pass + fail}`);
    process.exit(fail ? 1 : 0);
  }
})();
