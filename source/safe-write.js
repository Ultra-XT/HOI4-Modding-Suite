"use strict";
// ONE OWNER FOR EVERY WRITE INTO A USER'S MOD.
//
// #map-writers-had-no-owner — safeModWrite lived inside server.js and was never exported, so map-data.js
// could not call it however much it wanted to. It therefore grew 27 writes of its own: 12 with no backup
// of any kind, including provinces.bmp, state-id renumbering and country history. None of them were
// checked against the vanilla-game-directory guard either, because that guard is the first line of
// safeModWrite. And test-mod-writes-have-one-owner.js reads server.js and nothing else, so the rule this
// project cares most about was enforced everywhere except the files whose corruption stops a mod loading.
//
// Moving it here rather than injecting it from server.js is deliberate: 87 test files require map-data.js
// directly, and an injected writer would leave every one of them either broken or silently unprotected.
// A module both sides require needs no wiring and cannot be forgotten.
//
// ⚠️ THE BACKUP DIRECTORY IS DERIVED HERE AND NOWHERE ELSE. run-tests.js hands each run a private
// APPDATA / XDG_CONFIG_HOME so a suite can never write into the user's real NovaModdingSuite folder —
// that sandbox depends on exactly one resolution of this path. server.js imports these constants; it does
// not recompute them. Two copies of resolveNovaAppDataDir() is the bug this note exists to prevent.

const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");

// ⛔ #a-bare-test-run-writes-into-the-real-app-data — A TEST RUN BARE GETS THE SANDBOX ITS RUNNER WOULD HAVE GIVEN IT.
//
// run-tests.js hands every file it runs a private APPDATA, XDG_CONFIG_HOME, NOVA_APP_DATA_DIR, NOVA_HOME_DIR, HOI4_USER_DIR
// and NOVA_DOCUMENTS_DIR, and removes it afterwards (#tests-wrote-into-the-real-dot-nova, #two-documents-folders,
// #the-suite-wrote-into-the-hoi4-user-folder); run-e2e.js does the same and adds HOI4_MODS_ROOT. But agents and scripts run
// ONE file bare — `node test-foo.js` — all the time, and then nothing sandboxed it: the backups below went into the owner's
// REAL AppData\Roaming\NovaModdingSuite\backups, and map-data.js's per-mod stores into the real ~/.nova. Measured
// 2026-09-29/30: 60 backups of one temp fixture among the real backups, and hundreds of fixture snapshots in ~/.nova (1.5 GB).
//
// HERE, because this is the first module those paths go through. server.js reaches it through map-data.js before it works
// out a single folder (its MODS_ROOT reads HOI4_USER_DIR and NOVA_DOCUMENTS_DIR while it loads), map-data.js requires it
// before any of its own code runs, and NOVA_APP_DATA_DIR below is decided once, at load. So a test that loads any of the
// three is sandboxed before any path exists, and every child it spawns inherits the sandbox. A test that only SPAWNS a
// node child loads this module first itself; test-a-bare-test-run-stays-out-of-the-real-folders.js finds those in their
// source. A live-app test run bare starts a server of its own through testlib-live-server.js, which loads this first.
//
// IN A TEST: the process's main is a test-*.js, e2e-*.js or testlib-*.js file (require.main, or the script node was asked to
// run while a -r preload has none yet). The shipped app never is — its main is main.js under Electron and warm-child.js in
// the child it forks, and build.files ships no test file — and this also stands down under Electron and inside app.asar, so
// the packaged exe cannot reach it three ways over.
//
// ⛔ #a-sandboxed-app-data-gets-the-rest-of-a-sandbox — …AND IN ANY PROCESS THAT ALREADY KEEPS ITS APP DATA IN A SANDBOX.
// 2026-10-23 22:27:32: an agent ran a copy of test-all-endpoints.js from a script of its own (run.js) that pointed APPDATA,
// NOVA_APP_DATA_DIR and XDG_CONFIG_HOME into the temp folder and set HOI4_MODS_ROOT, and left HOI4_USER_DIR,
// NOVA_DOCUMENTS_DIR and NOVA_HOME_DIR unset. Its main was not a test's, so nothing here engaged: server.js found the owner's
// REAL plain Documents HOI4 folder, and GET /api/diag/hoi4 rewrote nova_diagnostics.txt there — what it held is gone. Nearly
// every harness an agent writes has that shape, the coordinator's own world builds among them, and with NOVA_HOME_DIR unset
// map-data.js's per-mod stores go into the real ~/.nova. So a process that is not a test but keeps its app data in temp (one
// of BARE_APP_DATA_VARS inside it, judged as below) gets the rest of a sandbox: what it LEFT UNSET — or blank, which its
// reader takes for unset and then finds the real folder — is filled in, laid out as run-tests.js lays its own; what it SET is
// KEPT, inside temp or not, because it chose it (a world build points HOI4_MODS_ROOT at the owner's real mods folder on
// purpose, and TEST worlds are built there). The shipped app never qualifies: it runs under Electron, and its APPDATA is the
// real Roaming folder. And where the temp folder cannot tell a sandbox from the real thing (below), this stands DOWN, where
// for a test it fills everything: a test is never the real app; a script may be.
//
// ⛔ #any-folder-in-temp-says-so — …OR ANY OTHER OF ITS FOLDERS THERE (review S2). Only an absolute app-data variable in temp engaged
// this, and the quickest harness there is names HOI4_MODS_ROOT in temp and nothing else: the report was rewritten in the real HOI4
// folder, its baselines went into the real ~/.nova and its backups among the real ones. NOVA_HOME_DIR, HOI4_USER_DIR or
// NOVA_DOCUMENTS_DIR alone did the same, and a relative APPDATA too, with New mod landing in the real mods folder. So any of
// BARE_E2E_ENV's folders in temp says it, and so does a relative value in any of them (#a-relative-folder-is-no-choice): no launch
// of the real app has one. NOVA_DOCUMENTS_DIR=none says nothing: it is that variable's "no answer", on purpose.
//
// FOR A TEST, ONLY WHAT IS NOT ALREADY A SANDBOX, one variable at a time. A folder inside the temp folder — or the temp
// folder itself, which a test points a mods root at — is a runner's choice or the test's own and is kept, however the disk
// spells it (Windows hands a process its temp folder in 8.3 form when the account name is long: C:\Users\LONGNA~1\…). So is
// NOVA_DOCUMENTS_DIR=none: its reader takes anything that is not a full path as "no answer", on purpose. Unset, blank, a
// folder outside temp — the real one — or, for every other variable, a relative value (a folder under wherever the test
// was started) is pointed here. So under either runner nothing changes; a bare run gets the env its runner would have
// given it, laid out the same way; and a test that points APPDATA at its own temp folder but leaves NOVA_HOME_DIR alone
// is filled in rather than trusted wholesale.
//
// Either way, removed when it exits by itself, unless it may hold the only copy of something that was not a fixture: a backup
// of a file OUTSIDE the temp folder, a store Nova keeps for a mod outside it (a baseline, a Delete map snapshot, the folders
// Restore moves OUT of the mod), or any write into such a mod. CLAUDE.md's fourth rule is never delete a backup, so then it
// stays, and says where. Those copies are usually made by a CHILD — the server a test started — which cannot tell this
// process anything in memory: so NOVA_BARE_SANDBOX names the sandbox to every process of the run, and each one notes them in
// a file inside it.
//
// ⚠️ #a-killed-process-keeps-its-sandbox — NOT WHEN IT IS KILLED. A process that is killed runs no exit handler (on Windows,
// child.kill() and taskkill are TerminateProcess), and `node server.js` never exits by itself: a harness that starts one and
// kills it leaves that server's sandbox in the temp folder. The line each one prints says so (review R4). Nothing here sweeps
// such folders afterwards: the one that made it is gone, but a process it started may still be using it, and a sweep that took
// a backup away from under a write in progress is the loss the fourth rule forbids. The mark below names the process that
// made each one, for whoever looks.
//
// ⛔ #a-child-made-a-second-sandbox — A PROCESS STARTED BY ONE THAT HAS A SANDBOX IS PART OF THAT RUN (review R1). A child
// whose env left one variable out, with its app data in the run's sandbox, was a script with its app data in temp and made a
// sandbox of its own for that one — and pointed NOVA_BARE_SANDBOX at it, while its NOVA_HOME_DIR still named the run's. Its
// store of a mod outside temp landed in the run's sandbox and the note in its own; the run's sandbox, finding no note, was
// removed with the store in it. So a process handed a sandbox that is one fills what it lacks IN that sandbox and makes none.
// A sandbox is known by the MARK the guard leaves in it (BARE_MARK_FILE), not by being in the asking process's temp folder,
// which a child can be handed a folder of its own for; and a store's note also goes into the sandbox that holds the store,
// whatever the process was told.
const BARE_SANDBOX_VAR = "NOVA_BARE_SANDBOX";
const BARE_NOTES_FILE = ".nova-bare-real-writes";   // one line per note: kind \t source outside temp \t where its copy is
const BARE_MARK_FILE = ".nova-bare-sandbox";        // JSON: the process that made the sandbox (pid, main, test), its temp folder, when
const BARE_TEST_ENV = Object.freeze({    // variable -> where it points inside the sandbox: run-tests.js's own layout
  APPDATA: "", XDG_CONFIG_HOME: "", NOVA_APP_DATA_DIR: "", NOVA_HOME_DIR: "",
  HOI4_USER_DIR: "hoi4-user", NOVA_DOCUMENTS_DIR: "Documents",
});
const BARE_E2E_ENV = Object.freeze(Object.assign({}, BARE_TEST_ENV, { HOI4_MODS_ROOT: "mods" }));   // …and run-e2e.js's mods root
// #a-sandboxed-app-data-gets-the-rest-of-a-sandbox — the names a process keeps its app data under: APPDATA, which
// resolveNovaAppDataDir below reads on Windows, XDG_CONFIG_HOME, which it reads on Linux, and NOVA_APP_DATA_DIR, which nothing
// in Nova reads but both runners hand over beside them (on macOS it reads none of the three). Any one of them in the temp
// folder says the process means its app data to be in a sandbox — even one Nova does not read, since all that follows from
// it is that what the process left unset is filled in too, inside temp.
const BARE_APP_DATA_VARS = Object.freeze(["APPDATA", "XDG_CONFIG_HOME", "NOVA_APP_DATA_DIR"]);
// ⛔ #the-app-data-nova-reads-goes-with-the-rest — …but only ONE of them is where Nova keeps its app data on each system, and the
// others say nothing about it: with NOVA_APP_DATA_DIR in temp and the shell's own APPDATA left in place (every Windows shell sets
// it), the line said "not into your real folders" while the backups and caches went on into the real Roaming\NovaModdingSuite
// (review R5). So once the app data is meant for a sandbox, the one resolveNovaAppDataDir reads there is filled too unless it is
// in one already. Which that is, per system, is resolveNovaAppDataDir's own body; the test reads that body and asks this.
function bareAppDataVarReadOn(platform) { return platform === "win32" ? "APPDATA" : platform === "darwin" ? "" : "XDG_CONFIG_HOME"; }
// ⛔ #a-script-keeps-the-mods-it-made — where server.js puts its mods folder when HOI4_USER_DIR is the sandbox's: <that>\mod
// (server.js MODS_ROOT). A script that makes a mod there with New mod meant to (review R6); test-a-bare-test-run-stays-out-of-
// the-real-folders.js asks server.js where its mods folder is and holds this to it.
const BARE_MODS_FOLDER = path.join(BARE_TEST_ENV.HOI4_USER_DIR, "mod");
const BARE_TEST_MAIN = /^(test|e2e|testlib)-[^\\/]*\.js$/i;
// The one variable whose reader takes a value that is not a full path as "no answer" (server.js shellDocumentsDir). Every
// other one is used as a folder whatever it looks like — a relative one is a folder under the current directory.
const BARE_NOT_A_PATH_IS_NO_ANSWER = Object.freeze(["NOVA_DOCUMENTS_DIR"]);
function _normPath(p) { const r = path.resolve(String(p)); return process.platform === "win32" ? r.toLowerCase() : r; }
function _strictlyInside(p, dir) {
  const a = _normPath(p), d = _normPath(dir);
  return a !== d && a.startsWith(d.endsWith(path.sep) ? d : d + path.sep);
}
function _insideOrSame(p, dir) { return _normPath(p) === _normPath(dir) || _strictlyInside(p, dir); }
/** The path as the disk spells it — 8.3 names and links resolved — as far down as it exists; the rest as written. */
function _realPath(p) {
  const rest = [];
  let cur = path.resolve(String(p));
  for (let guard = 0; guard < 128; guard++) {
    try { return path.join(fs.realpathSync.native(cur), ...rest); } catch (_) { /* this part is not on disk: try the one above */ }
    const up = path.dirname(cur);
    if (up === cur) break;                 // the walk must make progress: dirname of a root is the root
    rest.unshift(path.basename(cur));
    cur = up;
  }
  return path.resolve(String(p));
}
/** The folder the system keeps a user's app data in when no variable says otherwise; "" with no home folder. */
function _systemAppDataFolder(home, platform = process.platform) {
  if (!home) return "";
  return platform === "win32" ? path.join(home, "AppData", "Roaming")
    : platform === "darwin" ? path.join(home, "Library", "Application Support") : path.join(home, ".config");
}
/**
 * A temp folder at the top of a drive, or one the home folder sits in, cannot tell a sandbox from the real thing: everything real is
 * "inside" it. ⛔ #a-temp-folder-above-the-app-data — nor can one above the system's own app-data folder (review S7): with TEMP=<home>\AppData,
 * a real `node server.js` looked like a script keeping its app data in temp, and its mods folder and report went into a sandbox.
 */
function _tempFolderCanTell(dir, homedir = "", platform = process.platform, real = _realPath) {
  const t = path.resolve(String(dir)), tReal = real(t);
  if (path.parse(t).root === t || path.parse(tReal).root === tReal) return false;
  return ![homedir, _systemAppDataFolder(homedir, platform)].some((p) => !!p && (_insideOrSame(p, t) || _insideOrSame(real(p), tReal)));
}
/**
 * { variable: sub-path } for every variable a process must be given a sandbox for — {} when it is neither a test run nor a
 * process keeping a folder in temp, or is already sandboxed. It decides from what it is handed, so a test can ask it about
 * main.js, Electron and app.asar without being any of them; the disk is asked only how it spells a path (`realpath`).
 * `platform` is the system it asks for; `defaultTmpdir` the user's
 * own temp folder, beside the process's (#a-server-given-a-temp-folder-of-its-own); `runSandbox` the sandbox of the run the
 * process is part of, when it was handed one (#a-child-made-a-second-sandbox).
 */
function bareTestRunPlan(opts) { return _judgeBareRun(opts).plan; }
/** …and, for a script, `named`: the folders it named inside a sandbox, which server.js takes only when they exist; `because`: why it is judged one. */
function _judgeBareRun({ mainFile = "", env = {}, tmpdir = "", homedir = "", versions = {}, moduleDir = "", realpath = _realPath,
  platform = process.platform, defaultTmpdir = "", runSandbox = "" } = {}) {
  const none = { plan: {}, named: [], because: "" };
  if (versions && versions.electron) return none;
  if (/[\\/]app\.asar(?:[\\/]|$)/i.test(String(moduleDir || ""))) return none;
  const m = BARE_TEST_MAIN.exec(path.basename(String(mainFile || "")));
  // One folder can be spelled two ways (C:\Users\LONGNA~1\AppData\Local\Temp is C:\Users\Long Name\…\Temp), and a runner
  // that made its sandbox under one spelling must not look real to a test handed the other: compared as written, then as
  // the disk spells both — the second only for a path the first does not already place in temp.
  const real = (p) => { try { return String(realpath(p) || p); } catch (_) { return String(p); } };
  // Worked out once per folder (_tempFolderCanTell), when a value first has to be placed in it.
  const tempFolder = (dir) => {
    const t = dir ? path.resolve(String(dir)) : "";
    let tReal = "", tells;
    const realT = () => tReal || (tReal = real(t));
    const within = (p) => _insideOrSame(p, t) || _insideOrSame(real(p), realT());
    const canTell = () => { if (tells === undefined) tells = !!t && _tempFolderCanTell(t, homedir, platform, real); return tells; };
    return { canTell, holds: (p) => canTell() && within(p) };
  };
  const ownTmp = tempFolder(tmpdir);
  // #a-server-given-a-temp-folder-of-its-own — a harness keeps its app data in the user's own temp folder and hands the server
  // it starts a temp folder of its own (TMP = HERE\tmp). Judged against the server's alone, that app data looked real, and the
  // report went into the HOI4 folder detection finds — the 10-23 escape, on the fixed code (review R2). A script's folders are
  // also asked of the user's own temp folder; a test's values are not, as they never were.
  // ⛔ #a-sandbox-where-temp-cannot-tell — …BUT ONLY WHEN ITS OWN TEMP FOLDER CAN TELL (review S1). Its sandbox is made in its own, and
  // one that holds the home folder calls every real mod a fixture: the notes, the backup names and the release all go by it, so at
  // exit that sandbox took a real mod's backup and baseline with it. Then the script stands down (`says` below).
  const usersTmp = tempFolder(defaultTmpdir);
  const run = runSandbox ? path.resolve(String(runSandbox)) : "";
  let runReal = "";
  const inRun = (s) => !!run && (_insideOrSame(s, run) || _insideOrSame(real(s), runReal || (runReal = real(run))));
  const valueOf = (k) => String(env[k] == null ? "" : env[k]).trim();
  const noAnswer = (k) => BARE_NOT_A_PATH_IS_NO_ANSWER.includes(k);
  const sandboxed = (k, alsoUsersTmp) => {
    const s = valueOf(k);
    if (!s) return false;
    if (!path.isAbsolute(s)) return noAnswer(k);
    // Inside temp, or temp ITSELF: an e2e test sets HOI4_MODS_ROOT to os.tmpdir() and makes its mods there. Replaced, the
    // server's mods root was the sandbox's and the fixture it had just made was refused as not a mod (400). Or inside the
    // run's own sandbox, wherever that is: a parent's choice.
    return inRun(s) || ownTmp.holds(s) || (!!alsoUsersTmp && usersTmp.holds(s));
  };
  const out = {};
  if (m) {
    const layout = m[1].toLowerCase() === "e2e" ? BARE_E2E_ENV : BARE_TEST_ENV;
    for (const k of Object.keys(layout)) if (!sandboxed(k, false)) out[k] = layout[k];
    return { plan: out, named: [], because: "" };
  }
  // #a-sandboxed-app-data-gets-the-rest-of-a-sandbox — not a test: only when a folder of its own is already in a sandbox (or
  // #any-folder-in-temp-says-so is a relative value), and then only what it left unset or blank, in the unit runner's layout.
  // Whatever it set is its own choice, inside temp or not —
  // ⛔ #a-relative-folder-is-no-choice — but a RELATIVE value is not a choice of a folder (review R3): it is one under wherever
  // the script happened to start, which it never made — "hoi4-user", or "undefined", what `process.env.X = undefined` stores —
  // and server.js, finding no such folder, took the real mods folder detection finds. Filled, as a test's is; NOVA_DOCUMENTS_DIR
  // is the exception it is for a test too ("none" is its reader's "no answer", on purpose).
  const says = !ownTmp.canTell() ? "" : Object.keys(BARE_E2E_ENV).find((k) => {
    const s = valueOf(k);
    return !!s && (path.isAbsolute(s) ? sandboxed(k, true) : !noAnswer(k));
  }) || "";
  // ⛔ #a-child-of-a-run-is-part-of-it — …and a process told of its run's sandbox is part of that run, whatever it kept: with no folder of
  // its own in temp it was judged the real app, and its backups went among the real ones (review S3). Not where its own temp folder
  // cannot tell: a test asks a child on a decoy home inside temp what the machine's own detection finds, on purpose, and there only app
  // data already in the run's sandbox says it, as it always did.
  const partOfARun = !!run && (ownTmp.canTell() || BARE_APP_DATA_VARS.some((k) => path.isAbsolute(valueOf(k)) && inRun(valueOf(k))));
  if (!says && !partOfARun) return none;
  const reads = bareAppDataVarReadOn(platform);   // #the-app-data-nova-reads-goes-with-the-rest
  for (const k of Object.keys(BARE_TEST_ENV)) {
    const s = valueOf(k);
    const noChoice = !s || (!path.isAbsolute(s) && !noAnswer(k));
    if (noChoice || (k === reads && !sandboxed(k, true))) out[k] = BARE_TEST_ENV[k];
  }
  // …and a mods folder or game user folder it named in a sandbox: server.js takes either only once it exists, and otherwise names none.
  const named = ["HOI4_USER_DIR", "HOI4_MODS_ROOT"].filter((k) => !(k in out) && path.isAbsolute(valueOf(k)) && sandboxed(k, true));
  const because = !says ? "was started by a run that has a sandbox"
    : !path.isAbsolute(valueOf(says)) ? `sets ${says} to a relative folder`
      : BARE_APP_DATA_VARS.includes(says) ? "keeps its app data in the temp folder" : `keeps ${says} in the temp folder`;
  return { plan: out, named, because };
}
/** The user's own temp folder, as the system lays it out — whatever temp folder this process was handed. "" when unknown. */
function _usersOwnTempFolder(env, home, platform = process.platform) {
  if (platform !== "win32") return "/tmp";
  const local = String((env && env.LOCALAPPDATA) || "").trim();
  if (local && path.isAbsolute(local)) return path.join(local, "Temp");
  return home ? path.join(home, "AppData", "Local", "Temp") : "";
}
const BARE_TEST_SANDBOX = (function sandboxABareTestRun() {
  // require.main is not set yet while a -r preload runs, and this module is cached after it, so it never runs again: then
  // the script node was asked to run is the main.
  const mainFile = (require.main && require.main.filename) || (process.argv[1] ? path.resolve(process.argv[1]) : "");
  const tmp = os.tmpdir();
  let home = "";
  try { home = os.homedir(); } catch (_) { home = ""; }
  // #a-child-made-a-second-sandbox — the sandbox of the run this process is part of, when it was handed one that is one
  const runSandbox = _bareSandboxOfThisRun();
  const { plan, named, because } = _judgeBareRun({ mainFile, env: process.env, tmpdir: tmp, homedir: home, versions: process.versions,
    moduleDir: __dirname, defaultTmpdir: _usersOwnTempFolder(process.env, home), runSandbox });
  // #a-relative-folder-is-no-choice — a folder a script named in a sandbox and has not made yet is made now, so server.js takes it
  // rather than going on to the folders it detects. Inside a sandbox only (judged above), and nothing is ever removed here.
  for (const k of named) { try { if (!fs.existsSync(process.env[k])) fs.mkdirSync(process.env[k], { recursive: true }); } catch (_) { /* server.js names none for it */ } }
  const keys = Object.keys(plan);
  if (!keys.length) return "";
  // `node -e` has no main file: its sandbox and its message say "node".
  const label = path.basename(mainFile) || "node";
  const isTest = BARE_TEST_MAIN.test(label);
  // #a-child-made-a-second-sandbox — part of a run: what it lacks goes into the run's sandbox, which stays named to it, and it
  // makes none and releases none — the process that made that one does. Should it have gone already, this makes its own.
  if (runSandbox) {
    try {
      for (const k of keys) process.env[k] = plan[k] ? path.join(runSandbox, plan[k]) : runSandbox;
      for (const k of ["HOI4_USER_DIR", "HOI4_MODS_ROOT"]) if (keys.includes(k)) fs.mkdirSync(process.env[k], { recursive: true });
      try {
        process.stderr.write(`[nova] ${label} is part of a run that has a sandbox, so what it left unset goes into that one too, not into your real folders: `
          + `${keys.join(", ")} -> ${runSandbox} (the process that made it removes it when it exits by itself)\n`);
      } catch (_) { /* a closed stderr cannot tell anyone */ }
      return "";
    } catch (_) { /* the run's sandbox went while this was loading: a sandbox of its own, below */ }
  }
  const name = label.replace(/\.js$/i, "").replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 48);
  let dir = "";
  try {
    dir = fs.mkdtempSync(path.join(tmp, `nova-bare-${name}-`));
    // #a-child-made-a-second-sandbox — the mark that says the guard made this folder, before anything is pointed at it
    fs.writeFileSync(path.join(dir, BARE_MARK_FILE), JSON.stringify({ pid: process.pid, main: label, test: isTest, tmp, made: new Date().toISOString() }) + "\n", { flag: "wx" });
    for (const k of keys) process.env[k] = plan[k] ? path.join(dir, plan[k]) : dir;
    process.env[BARE_SANDBOX_VAR] = dir;     // …and names it to every process of this run, which notes real copies in it
    // server.js takes an explicit HOI4_USER_DIR / HOI4_MODS_ROOT only when it exists; a missing one names no mods folder.
    for (const k of ["HOI4_USER_DIR", "HOI4_MODS_ROOT"]) if (keys.includes(k)) fs.mkdirSync(process.env[k], { recursive: true });
  } catch (e) {
    // No fallback: a test with no sandbox writes into the real folders, which is the thing this exists to stop — and so does a
    // script with one folder in a sandbox and the rest not.
    throw new Error(isTest
      ? `Nova will not run ${label} bare without a sandbox, and could not make one in ${tmp}: ${e && e.message}`
      : `Nova will not run ${label}, which ${because}, with the rest in your real folders, and could not make a sandbox for the rest in ${tmp}: ${e && e.message}`);
  }
  // AFTER every exit handler, so a test's own (most stop the server they spawned) has run and the folder is free to go.
  // Not as one more handler: one added later runs later, and moving this behind it took a microtask — which never runs
  // when a handler is added in the same tick as process.exit(). That handler then found its folder gone, and what it
  // wrote under APPDATA made the sandbox again, to be left behind. So the release runs from the emit itself, once every
  // handler has returned — and before the process really exits, for a handler that calls process.exit() itself (node
  // then abandons the rest of the emit). Once.
  let released = false;
  // #a-script-keeps-the-mods-it-made — a test's mods are fixtures, as under run-tests.js; a script's are what it ran for
  const release = () => { if (released) return; released = true; releaseBareTestSandbox(dir, tmp, { keepModsMade: !isTest }); };
  const emit = process.emit;
  process.emit = function (event) {
    try { return emit.apply(this, arguments); }
    finally { if (event === "exit") release(); }
  };
  const reallyExit = process.reallyExit;
  if (typeof reallyExit === "function") process.reallyExit = function () { release(); return reallyExit.apply(this, arguments); };
  try {
    process.stderr.write((isTest ? `[nova] ${label} is running without its test runner: `
      : `[nova] ${label} ${because}, so what it left unset goes into a sandbox too, not into your real folders: `)
      // #a-killed-process-keeps-its-sandbox — "at exit" was a promise a killed process cannot keep (review R4)
      + `${keys.join(", ")} -> ${dir} (removed when it exits by itself — not when it is killed — unless it then holds a copy of something outside the temp folder)\n`);
  } catch (_) { /* a closed stderr cannot tell anyone */ }
  return dir;
})();

const HOMEDIR = typeof os.homedir === "function" ? os.homedir() : "";

// Set by server.js at startup (configure below). The defaults are what a bare `require` of this module
// gets — a test harness, or map-data.js loaded on its own. They are deliberately SAFE rather than
// convenient: writes still back up and still go through tmp+fsync+rename. What an unconfigured module
// cannot do is check the vanilla game root, because only server.js knows where the game is and whether
// the user has ticked "allow editing vanilla files".
const cfg = {
  root: process.cwd(),          // only used to build a readable backup FILENAME
  assertWritable: () => {},     // server.js registers assertPathNotInGameRoot
  afterWrite: () => {},         // server.js registers invalidateModIndexCache
};
function configure(next) {
  for (const k of ["root", "assertWritable", "afterWrite"]) {
    if (next && next[k] !== undefined) cfg[k] = next[k];
  }
}

// ⛔ #nova-wrote-into-the-drive-root — THE LAST LINE, FOR EVERY WRITE THAT COMES THROUGH HERE.
//
// Found 2026-09-26: D:\interface\focus_editor_generated.gfx, written 2026-07-28 through safeModWrite by a helper that took
// the server's process-global root (the drive root, on a server not yet told a mod) instead of the mod its caller named.
// The owner's order: Nova never writes into the drive on its own. The routes now refuse such a root (server.js
// isNeverAModFolder); this refuses the WRITE, so a caller that forgets still cannot:
//   - put a mod's top-level folder (common, interface, gfx…) straight into a folder that is never a mod — the top of the
//     drive being written to, Nova's own folder, or the two above it (the dev root is two levels above Nova);
//   - put any file directly on the top of a drive, or a .mod launcher file into one of those folders.
// Worked out here from this file's own location, so there is nothing to configure and nothing to forget. It reads the
// disk only to let a write it would refuse through: a descriptor.mod between that folder and the file means the file is
// in a mod kept there. The folder names are the game's own top-level content folders
// (1.19.3), plus "localization", the spelling Nova also reads, and ".nova", the folder Nova keeps inside a mod (the map
// editor's removed-country snapshots).
const MOD_TOP_FOLDERS = new Set([
  "assets", "common", "country_metadata", "dlc_metadata", "events", "gfx", "history", "integrated_dlc", "interface",
  "localisation", "localization", "map", "music", "portraits", "script", "sound", "soundtrack", "tutorial", ".nova",
]);
const NOVA_HOME = path.resolve(__dirname);
// Nova's folder, the one above it and the dev root two above (server.js DEV_ROOT = path.resolve(__dirname, "..", "..")),
// plus the top of the target's drive: the folders a write lands in by falling back instead of being told.
// ⛔ #a-home-folder-named-like-a-mod-folder — NOT EVERY FOLDER ABOVE NOVA. It was, and the packaged exe runs from
// %TEMP%\<id>\resources\app.asar, which put C:\Users and C:\Users\<you> on the list. A Windows account named Music, Sound
// or Map (a Microsoft account takes its folder name from the start of the e-mail) then had every save refused as "a
// mod's music folder straight into C:\Users" — and the refusal told them to pick the mod they had picked.
function foldersThatAreNeverMods(target, novaHome = NOVA_HOME) {
  const home = path.resolve(novaHome);
  return [...new Set([path.parse(target).root, home, path.dirname(home), path.dirname(path.dirname(home))])];
}
// \\?\D:\x and \\.\D:\x name D:\x, and \\?\UNC\host\share\x names \\host\share\x. path.resolve keeps the prefix and
// path.parse then calls "\\?\UNC\" the root, so without this the rules below never saw the drive's top.
function plainWindowsPath(p) {
  const s = String(p == null ? "" : p);
  if (/^[\\/]{2}[?.][\\/]UNC[\\/]/i.test(s)) return "\\\\" + s.slice(8);
  if (/^[\\/]{2}[?.][\\/][A-Za-z]:/.test(s)) return s.slice(4);
  return s;
}
// A mod kept INSIDE a folder named like one of those — E:\Assets\SteamLibrary\…\394360\<id>, E:\Music\mods\MyMod — is still
// a mod: a folder between u and the file holds its descriptor.mod (or the file IS that descriptor, two folders down, as
// New mod writes it). Asked only when a rule is about to refuse, so a normal save never touches the disk here.
function isInsideAModBelow(u, target) {
  const rel = path.relative(u, target).split(/[\\/]+/).filter(Boolean);
  if (rel.length >= 3 && rel[rel.length - 1].toLowerCase() === "descriptor.mod") return true;
  for (let d = path.dirname(target), guard = 0; guard < 64; guard++) {
    const r = path.relative(u, d);
    if (!r || r.startsWith("..") || path.isAbsolute(r)) return false;   // back at u (or outside it): no mod in between
    try { if (fs.existsSync(path.join(d, "descriptor.mod"))) return true; } catch (_) { /* unreadable: not a mod */ }
    const up = path.dirname(d);
    if (up === d) return false;              // the walk must make progress: dirname of a root is the root
    d = up;
  }
  return false;
}
/** Why a write to absPath would take a folder that is never a mod for one; "" when it would not. */
function strayWriteReason(absPath, novaHome = NOVA_HOME) {
  const target = path.resolve(plainWindowsPath(String(absPath || "")));
  const driveRoot = path.parse(target).root;
  for (const u of foldersThatAreNeverMods(target, novaHome)) {
    const rel = path.relative(u, target);
    if (!rel || rel.startsWith("..") || path.isAbsolute(rel)) continue;   // not inside u
    const segs = rel.split(/[\\/]+/).filter(Boolean);
    if (!segs.length) continue;
    // Windows' own tools drop a trailing dot or space from a name, but Node writes it: "interface." is a new folder that
    // Explorer shows as "interface". Compare the name the user would see.
    const top = segs[0].replace(/[. ]+$/, "").toLowerCase();
    if (segs.length === 1 && u === driveRoot) return `${target} would sit directly on ${driveRoot}`;
    if (segs.length === 1 && /\.mod$/i.test(top)) return `${target} is a mod launcher file, and ${u} is not a mods folder`;
    if (segs.length >= 2 && MOD_TOP_FOLDERS.has(top) && !isInsideAModBelow(u, target)) {
      return `${target} would put a mod's ${segs[0]} folder straight into ${u}, which is not a mod`;
    }
  }
  return "";
}
function assertNotStrayWrite(absPath) {
  const why = strayWriteReason(absPath);
  if (why) throw new Error(`Nova refused to write: ${why}. Nothing was written. Pick your mod first.`);
}

// ⏱ A MOD FILE JUST CHANGED, and anything holding a parsed copy of it must let go. `cfg.afterWrite` cannot
// serve for this: configure() hands that ONE slot to server.js (invalidateModIndexCache), so a second
// module registering there would cut Home's wire. This is an additive list instead — every listener is
// called, in registration order, and a throwing one cannot stop the write or the listeners after it.
// map-data.js registers the only one today: the layer a read-only map pass is holding (readOnlyMapPass).
const _writeListeners = [];
function onModWrite(fn) { if (typeof fn === "function") _writeListeners.push(fn); }
function announceModWrite(absPath) {
  noteBareRunRealWrite("write", absPath);
  try { countNovaWrite(absPath); } catch (_) { /* a count must never stop a write */ }
  for (const fn of _writeListeners) { try { fn(absPath); } catch (_) { /* a listener must never stop a write */ } }
}
// ⛔ #a-same-tick-write-keeps-its-stamp — …AND EVERY CACHE THAT ASKS "IS THIS STILL THE FILE I READ?" ASKS HERE TOO. A cache is
// kept while what stat says of its file has not moved, and on Windows that moves only as far as the clock tick and the file id
// let it: a time moves with the tick (15.6 ms unless some program asked for finer), a folder's size is 0 and its id never
// changes, and a same-size rewrite moves nothing else but the file's id — which a rename-over does change (2,000 in 2,000,
// measured 10-01), but which a folder stamp, and every stamp of size and time alone, never looks at. So a write landing in
// the tick of the write before it looked like no change, and the answer read between the two was served again.
// test-a-renamed-state-keeps-its-regions-name.js failed 8 runs in 10 in batch 3b (and none in 20 on 10-01, with the clock
// ticking every 0.5 ms): a dependency's history/states folder, all the stable-root stamp looks at for its states, kept its
// times over a second state file written a few ms after the first. server.js had fixed exactly this for its localisation
// files alone (#a-same-size-write-reads-stale), by counting Nova's writes; nothing else counted them. Every write Nova makes
// is announced above — safeModWrite's, and /api/save's own atomic write of a focus tree, which announces
// itself (exported for it) — so it is counted here once, against the file and against every folder above it, and a stamp
// adds novaWritesTo(its file or folder): no write of Nova's own can look like no change to any cache.
// ⚠️ NEVER INSIDE A SAVED STAMP. A count lives and dies with its process: a stamp saved to disk with one in it never matches at
// the next launch (#loc-warm-fingerprint-never-matches). A saved catalogue keeps the count BESIDE its stamp instead (server.js
// novaWritesToken). A file changed by another program is still seen only by stat.
const _novaWrites = new Map();   // normalised absolute path of a file, or of any folder above one → Nova's writes to it or under it
const novaWriteKey = (p) => { const r = path.resolve(String(p)); return process.platform === "win32" ? r.toLowerCase() : r; };
function countNovaWrite(absPath) {
  let k = novaWriteKey(absPath);
  for (;;) {
    _novaWrites.set(k, (_novaWrites.get(k) || 0) + 1);
    const up = path.dirname(k);
    if (up === k) break;
    k = up;
  }
}
/** How many times Nova has written `absPath` in this process — for a folder, any file under it; 0 when never. */
function novaWritesTo(absPath) {
  if (!_novaWrites.size || !absPath) return 0;
  try { return _novaWrites.get(novaWriteKey(absPath)) || 0; } catch (_) { return 0; }
}
// #a-bare-test-run-writes-into-the-real-app-data — …and a bare test run's sandbox notes every mod write that lands OUTSIDE the
// temp folder ("write"), and every store map-data.js works out for a mod outside it ("store", with where the store is). A copy
// Nova took first may be in the sandbox and nowhere else — a map snapshot under ~/.nova has no pool backup of its own, Delete
// map unlinks after taking one, and Restore removes the folder it moved out — so a sandbox holding one is not removed at exit.
// In EVERY process of the run, not just the test's: the one making the copy is usually the server it started, so the note
// goes into a file in the sandbox NOVA_BARE_SANDBOX names, where the test's own exit reads it. A store only worked out — a
// read, as the map page does on open — keeps nothing: at exit, a "store" note counts only if that folder exists.
//
// ⛔ #a-child-made-a-second-sandbox — A NOTE GOES WHERE ITS COPY WENT. A folder is a sandbox when it is named as the guard names
// one and carries its mark — not when it is inside the noting process's temp folder: a child handed a temp folder of its own
// still belongs to the run, and judged by its own temp folder it noted nothing while what it copied went with the run's sandbox
// (review R1, on the code before as well). A stray NOVA_BARE_SANDBOX naming any other folder still gets no file from anyone,
// the shipped app among them. And a store is ALSO noted in the sandbox that holds it, found by walking up from it: a child told
// of no sandbox at all, or of another, still keeps the one its store is in.
const _bareNoted = new Set();
/** Is `dir` a sandbox the guard made — named as it names one, and carrying its mark? */
function _isBareSandbox(dir) {
  if (!dir || !/^nova-bare-/.test(path.basename(String(dir)))) return false;
  try { return fs.statSync(path.join(String(dir), BARE_MARK_FILE)).isFile(); } catch (_) { return false; }
}
/** The sandbox NOVA_BARE_SANDBOX names, when it is one; "" otherwise. No disk is asked when the variable is unset (the app). */
function _bareSandboxOfThisRun() {
  const sb = String(process.env[BARE_SANDBOX_VAR] || "").trim();
  return sb && path.isAbsolute(sb) && _isBareSandbox(sb) ? path.resolve(sb) : "";
}
/** The sandbox `p` is in — the nearest folder above it that is one — or "". Only a folder named like one is asked of the disk. */
function _bareSandboxHolding(p) {
  let cur = path.resolve(String(p));
  for (let guard = 0; guard < 256; guard++) {
    if (_isBareSandbox(cur)) return cur;
    const up = path.dirname(cur);
    if (up === cur) return "";               // the walk must make progress: dirname of a root is the root
    cur = up;
  }
  return "";
}
function noteBareRunRealWrite(kind, source, copyAt = "") {
  try {
    if (!source || isUnderTempDir(source)) return;
    const at = [_bareSandboxOfThisRun(), copyAt ? _bareSandboxHolding(copyAt) : ""].filter(Boolean);
    if (!at.length) return;
    const line = `${kind}\t${path.resolve(String(source))}\t${copyAt ? path.resolve(String(copyAt)) : ""}\n`;
    for (const sb of new Set(at)) {
      const key = sb.toLowerCase() + "\t" + line;
      if (_bareNoted.has(key)) continue;
      try { fs.appendFileSync(path.join(sb, BARE_NOTES_FILE), line); _bareNoted.add(key); }
      catch (_) { /* a sandbox that is gone has nobody left to keep it for */ }
    }
  } catch (_) { /* a note must never stop a write */ }
}

// Persistent per-user data dir for Nova's caches (icon PNGs, sprite maps, loc maps). This used to
// live under os.tmpdir(), which the OS can wipe at any time — defeating the whole "scan once" goal.
// Now it's a dedicated folder under AppData (Windows) / ~/Library/Application Support (macOS) /
// ~/.config (Linux) so the cache survives reboots and temp cleanups. NOTE: the user's AI API key is
// NOT stored here — it lives in the app's persistent localStorage — so wiping this cache never
// touches the key.
function resolveNovaAppDataDir() {
  let base = "";
  if (process.platform === "win32") base = process.env.APPDATA || _systemAppDataFolder(HOMEDIR);
  else if (process.platform === "darwin") base = _systemAppDataFolder(HOMEDIR);
  else base = process.env.XDG_CONFIG_HOME || _systemAppDataFolder(HOMEDIR);
  if (!base) base = os.tmpdir(); // last-resort fallback if no home/AppData is resolvable
  return path.join(base, "NovaModdingSuite");
}
const NOVA_APP_DATA_DIR = resolveNovaAppDataDir();
const ICON_CACHE_DIR = path.join(NOVA_APP_DATA_DIR, "cache");
// File-edit backups live under AppData alongside the icon cache (NOVA_APP_DATA_DIR), NOT on the
// drive that happens to hold the program. The old path resolved to <driveRoot>\tools\focus-drag-editor\
// backups (e.g. D:\tools\...) because ROOT/DEV_ROOT climb to the drive root — that scattered a folder
// onto the user's D: drive. AppData keeps every program-generated folder in one place, off the D drive.
const BACKUP_DIR = path.join(NOVA_APP_DATA_DIR, "backups");
const MAX_BACKUP_FILES = 200;

// #temp-backup-misfiled-as-real — is this file under the OS temp dir? Decided from the ABSOLUTE path, never from the
// backup name: the name is relative to cfg.root, which is the directory the process was started in unless server.js
// configures it, and a probe started inside Temp gets `..__..__nova-…` — no Temp marker, so it was filed with the
// user's REAL backups. Measured: both real pools full at 200 with 14 test-fixture backups among them.
//
// #a-child-made-a-second-sandbox — …or under the temp folder of the run this process is part of, the one its sandbox sits in. A child
// handed a temp folder of its own wrote a fixture of the run's with a pool backup named as a real one, and the run's sandbox was kept
// for "a backup of a file outside the temp folder" (review S6). No disk is asked when no run is named (the app).
function isUnderTempDir(absPath) {
  const abs = path.resolve(absPath);
  const norm = (p) => (process.platform === "win32" ? p.toLowerCase() : p);
  const under = (dir) => { const d = path.resolve(dir); return norm(abs).startsWith(norm(d.endsWith(path.sep) ? d : d + path.sep)); };
  if (under(os.tmpdir())) return true;
  const run = _bareSandboxOfThisRun();
  return !!run && under(path.dirname(run));
}

function buildBackupPath(targetPath, reason = "save") {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  // A temp file's backup always carries its absolute path, so isEphemeralBackupName files it in the temp pool however
  // the process was started. Everything else keeps the short name relative to cfg.root.
  const source = isUnderTempDir(targetPath) ? path.resolve(targetPath) : path.relative(cfg.root, targetPath);
  const rel = source.replace(/[\\/:]/g, "__");
  const safeReason = String(reason || "save").replace(/[^A-Za-z0-9_-]/g, "_");
  const fileName = `${timestamp}__${safeReason}__${rel}`;
  return path.join(BACKUP_DIR, fileName);
}

// A backup whose SOURCE lived in the OS temp dir is throwaway — every automated test builds its mod
// with fs.mkdtempSync, and one `node run-tests.js` run alone produces hundreds of them. Pooled with
// real backups under a single cap, a test run EVICTS the snapshots of the user's actual mods: exactly
// how a real edit to a live Steam mod became unrecoverable (the only copy of the original was pruned
// minutes later by a test flood). So the two kinds get INDEPENDENT quotas — a temp-mod backup can now
// only ever displace another temp-mod backup. #backup-quota-split
const TMP_BACKUP_MARK = path.resolve(os.tmpdir()).replace(/[\\/:]/g, "__");
function isEphemeralBackupName(name) {
  return TMP_BACKUP_MARK.length > 2 && String(name || "").includes(TMP_BACKUP_MARK);
}

// #a-bare-test-run-writes-into-the-real-app-data — the sandbox a bare test run was given (or a script whose app data was already
// in one, #a-sandboxed-app-data-gets-the-rest-of-a-sandbox), taken away as it exits. Not when it
// holds a backup whose SOURCE was outside the temp folder, nor a store of a mod outside it, nor when any process of the run
// wrote into such a mod: then the sandbox may hold the only copy of something that was not a fixture, and a backup is never
// deleted (CLAUDE.md's fourth rule). Then it stays where it is and says so. Only ever the folder mkdtemp made.
//
// A note made by a process handed a temp folder of its own judged "outside temp" by that folder: one naming something in THIS
// run's temp folder is the run's own fixture, and keeps nothing (#a-child-made-a-second-sandbox). And with `keepModsMade` — a
// script's sandbox, never a test's — a mod in the mods folder server.js was given inside it keeps it too: a script that made one
// with New mod, HOI4_MODS_ROOT unset, lost it at exit after a 200 (#a-script-keeps-the-mods-it-made, review R6).
//
// ⛔ #a-sandbox-where-temp-cannot-tell — every judgement below asks "is it inside the temp folder?", and of one that holds the home
// folder the answer is yes for every real mod (a test is still given a sandbox there). So there nothing is judged, and it stays.
function releaseBareTestSandbox(dir, tmp, { keepModsMade = false } = {}) {
  if (!dir || !tmp || !_strictlyInside(dir, tmp) || !/^nova-bare-/.test(path.basename(dir))) return;
  let home = "";
  try { home = os.homedir(); } catch (_) { home = ""; }
  if (!_tempFolderCanTell(tmp, home)) {
    try { process.stderr.write(`[nova] kept ${dir}: ${tmp} holds your real folders or is the top of a drive, so nothing can tell a fixture there from a real file\n`); } catch (_) { /* nowhere to say it; the folder stays either way */ }
    return;
  }
  let kept = [];
  if (_strictlyInside(BACKUP_DIR, dir)) {
    try { kept = fs.readdirSync(BACKUP_DIR).filter((n) => !isEphemeralBackupName(n)); } catch (_) { kept = []; }
  }
  const writes = new Set(), stores = new Set();
  let notes = "";
  try { notes = fs.readFileSync(path.join(dir, BARE_NOTES_FILE), "utf8"); } catch (_) { notes = ""; }
  for (const l of notes.split("\n")) {
    const [kind, source, at] = l.split("\t");
    if (!source || _strictlyInside(source, tmp)) continue;
    if (kind === "write") writes.add(source);
    else if (kind === "store" && at && _strictlyInside(at, dir) && fs.existsSync(at)) stores.add(at);
  }
  let mods = [];
  if (keepModsMade) {
    const folder = path.join(dir, BARE_MODS_FOLDER);
    try { mods = [...new Set(fs.readdirSync(folder).map((n) => n.replace(/\.mod$/i, "")))].map((n) => path.join(folder, n)); } catch (_) { mods = []; }
  }
  const first = (s) => s.values().next().value;
  const why = kept.length ? `it holds ${kept.length} backup(s) of files outside the temp folder, e.g. ${kept[0]}`
    : stores.size ? `it holds ${stores.size} store(s) Nova keeps for a mod outside the temp folder, e.g. ${first(stores)}`
      : writes.size ? `this run wrote ${writes.size} file(s) outside the temp folder, e.g. ${first(writes)}`
        : mods.length ? `it holds ${mods.length} mod(s) made in the mods folder this run was given inside it, e.g. ${mods[0]} (set HOI4_MODS_ROOT to make them in a folder of your own)`
          : "";
  if (why) {
    try { process.stderr.write(`[nova] kept ${dir}: ${why}\n`); } catch (_) { /* nowhere to say it; the folder stays either way */ }
    return;
  }
  try { fs.rmSync(dir, { recursive: true, force: true, maxRetries: 3 }); } catch (_) { /* a file still open: temp keeps it */ }
}

function pruneBackups(maxFiles = MAX_BACKUP_FILES) {
  let entries = [];
  try {
    entries = fs.readdirSync(BACKUP_DIR, { withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => {
        const fullPath = path.join(BACKUP_DIR, entry.name);
        let mtimeMs = 0;
        try {
          mtimeMs = fs.statSync(fullPath).mtimeMs;
        } catch (_err) {
          mtimeMs = 0;
        }
        return { fullPath, name: entry.name, mtimeMs };
      })
      // Sort newest-first by the CREATION TIMESTAMP embedded in the filename (buildBackupPath prefixes an
      // ISO timestamp, which sorts lexically = chronologically), NOT by mtime. fs.copyFileSync preserves
      // the SOURCE file's mtime, so a backup of an old file (e.g. a mod GUI untouched since release) is
      // "born" with an old mtime — an mtime sort would rank the backup you just took as ancient and prune
      // it on the spot. The filename timestamp is the real order; fall back to mtime only on a tie.
      .sort((a, b) => (a.name < b.name ? 1 : a.name > b.name ? -1 : b.mtimeMs - a.mtimeMs));
  } catch (_err) {
    return;
  }
  // THREE pools, three caps (#backup-quota-split). Each list is already newest-first from the sort above,
  // and a flood in one pool can only ever evict its own kind.
  //
  //   ephemeral  a backup whose SOURCE was in the OS temp dir — every automated test builds its mod with
  //              mkdtempSync, and one suite run produces hundreds. Pooled with real backups they EVICT the
  //              snapshots of the user's actual mods; that is how a real edit to a live Steam mod became
  //              unrecoverable.
  //   map        #map-fix-floods-the-backup-window. Map operations are bulk by nature: renumbering a state
  //              rewrites every file that references it, and an auto-fix pass over a mod with hundreds of
  //              findings can touch hundreds of files in one click. Every installed map mod carries
  //              1,143–1,524 state files, so one map fix can exceed a 200 cap on its own — and Mod Health
  //              has already been bitten by exactly this: "Fix all" took a backup PER PROBLEM, 3,114 of
  //              them against the cap, and destroyed every real backup the user had. Giving map writes
  //              their own window means a big map fix stays recoverable AND cannot touch anything else.
  //   the rest   ordinary single-file maker saves.
  //
  // Classified ephemeral FIRST: a map backup taken from a temp fixture is a test artefact, not a map edit.
  const reasonOf = (name) => String(name || "").split("__")[1] || "";
  const isMapBackup = (name) => reasonOf(name).startsWith("map-");
  const ephemeral = entries.filter((e) => isEphemeralBackupName(e.name));
  const rest = entries.filter((e) => !isEphemeralBackupName(e.name));
  const pools = [rest.filter((e) => !isMapBackup(e.name)), rest.filter((e) => isMapBackup(e.name)), ephemeral];
  pools.forEach((pool) => {
    if (pool.length <= maxFiles) return;
    pool.slice(maxFiles).forEach((entry) => {
      // ⛔ #a-save-keeps-its-own-first-copies — a map Save's own first copy of a file is kept in the Save's folder before it goes,
      // and stays here if it could not be
      if (keepSaveRunFirstCopy(entry.fullPath)) return;
      try {
        fs.unlinkSync(entry.fullPath);
      } catch (_err) {
        // ignore individual delete failures
      }
    });
  });
}

/**
 * Give `content` the line endings the file on disk already uses, so a save never splits a file's endings.
 *
 * Counted from BYTES, because this must never decode a file it cannot read (#backup-decoded-and-re-encoded),
 * and deliberately conservative: only when the existing file is ENTIRELY CRLF. An already-mixed file is left
 * alone, since converting it would rewrite lines this save was never asked to touch.
 *
 * ONE implementation, called by every writer that needs it. safeModWrite had this inline and /api/save —
 * which is a hand-rolled copy of safeModWrite, as its own comments admit — never adopted it, so every focus
 * tree save put lone LFs into an all-CRLF file. 561 of the 746 shipping focus-tree files are entirely CRLF.
 * #save-mixes-line-endings
 */
function matchExistingLineEndings(absPath, content) {
  try {
    if (typeof content !== "string" || content.indexOf("\n") === -1) return content;
    if (!fs.existsSync(absPath)) return content;
    const prev = fs.readFileSync(absPath);
    let crlf = 0, loneLf = 0;
    for (let i = 0; i < prev.length; i++) {
      if (prev[i] !== 0x0a) continue;
      if (i > 0 && prev[i - 1] === 0x0d) crlf++; else loneLf++;
    }
    if (crlf > 0 && loneLf === 0) return content.replace(/\r?\n/g, "\r\n");
  } catch (_e) { /* unreadable existing file: write what we were given */ }
  return content;
}

/**
 * DATA SAFETY (issue #5 — "we can't ruin people files"): every destructive write a maker
 * performs (saving OR deleting an event / decision / spirit, etc.) must be RECOVERABLE. This
 * snapshots the original file into BACKUP_DIR first, then writes atomically (tmp + fsync +
 * rename) so a crash mid-write can never leave a half-written file. It is the same proven
 * backup-then-atomic scheme used by /api/save and /api/modhealth/fix, exposed module-wide so
 * the per-item maker endpoints (which previously did a raw fs.writeFileSync with no backup)
 * can all share it. Returns the backup path ("" if the file was new or the backup failed —
 * the write still proceeds; a missing backup must never block the user's save).
 *
 * NOTE: pass plain UTF-8 `content`. Localization (.yml) writes keep their own BOM-aware path.
 */

// ONE LADDER FOR WAITING OUT A LOCK — shared by the write side (renameOverWithRetry) and the read side
// (readTextWithRetry below). Both wait out the same cause: an antivirus scanner, a sync client or the game
// itself holding a file for a few milliseconds. It keeps the RENAME_RETRY_MS name because that is the name
// test-write-lock-retry.js reads out of this source when it checks the ladder is still short and bounded.
const RENAME_RETRY_MS = [15, 40, 90, 200];
const sleepSync = (ms) => {
  // Synchronous by necessity — every caller is sync and runs inside a request handler. Atomics.wait parks
  // the thread instead of spinning, so this costs no CPU.
  try { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); }
  catch (_) { const until = Date.now() + ms; while (Date.now() < until) { /* fallback */ } }
};

/**
 * Rename `tmpPath` over `absPath`, waiting out a transient lock. Throws the last error if it will not go.
 *
 * #write-lock-gives-up-instantly — of the three ordinary causes of a failed rename, one is momentary: an
 * antivirus scanner or sync client holding the file for a few milliseconds. Giving up on the first attempt
 * loses the author's save to it, and on Windows with real-time AV that is an everyday event — it has hit
 * this project's own test suite three times, on three unrelated files, each passing when run alone.
 *
 * A read-only Steam Workshop file fails every attempt, so the ladder stays short (~345ms total): long enough
 * to outlast a scan, short enough that a genuine refusal still feels immediate.
 *
 * #save-route-never-adopted-the-retry — this used to live inside safeModWrite, where /api/save could not
 * reach it. /api/save is where every maker's Save lands, it does its own backup-then-atomic sequence, and
 * its rename handler carried the comment "same atomic-write failure as safeModWrite, same explanation owed"
 * — it had taken the message and not the retry. One owner now, called from both.
 *
 * The temp file is removed on failure, so a save that could not complete leaves no litter beside the
 * modder's own files.
 */
function renameOverWithRetry(tmpPath, absPath) {
  // Refused here, the caller's temp file already sits beside the target: take it away with the refusal.
  try { assertNotStrayWrite(absPath); } catch (e) { try { fs.unlinkSync(tmpPath); } catch (_) {} throw e; }
  let renameErr = null;
  for (let attempt = 0; attempt <= RENAME_RETRY_MS.length; attempt++) {
    try { fs.renameSync(tmpPath, absPath); return; }
    catch (err) {
      renameErr = err;
      const transient = err && (err.code === "EPERM" || err.code === "EACCES" || err.code === "EBUSY");
      if (!transient || attempt === RENAME_RETRY_MS.length) break;
      sleepSync(RENAME_RETRY_MS[attempt]);
    }
  }
  try { fs.unlinkSync(tmpPath); } catch (_) {}
  throw renameErr;
}

// #a-bulk-map-click-evicted-its-own-backups — A BULK OPERATION MUST NOT DELETE ITS OWN BACKUPS.
//
// pruneBackups keeps the newest MAX_BACKUP_FILES per pool, and it runs after EVERY backup. That is the
// right behaviour for a stream of ordinary saves and the wrong one for a single click that rewrites one
// file per state: the click's own earliest copies are the ones it deletes. Measured on the base commit
// over Millennium Dawn's real 1,250 state files, with one problem induced across every state:
//
//     fixMissingStateCategories   1250 backups taken, 200 left -> 1050 evicted, 1050 files unrecoverable
//     fixStateNoManpower          1250 backups taken, 200 left -> 1050 evicted, 1050 files unrecoverable
//
// Those run from Auto-fix over a mod's OWN hand-written states, so the bytes lost are the modder's work.
//
// A scope is opened around such an operation. While one is open every backup is ALSO copied into the
// scope's own directory, which lives outside the mod and outside the pruned pool — so the pool keeps
// behaving exactly as before (nothing here changes what it holds or when it prunes) and the operation
// still has a complete copy of everything it touched. Laid out by the file's path within the mod, so a
// recovery is a copy-over. Copies only: nothing here deletes anything, and a failed copy never blocks a
// write — a backup that cannot be taken must not cost the author their save.
//
// Depth-counted, because a scoped operation may call another one: the outermost scope owns the folder.
//
// ⛔ #generate-land-created-what-its-copies-cannot-cover — the scope also counts what its writes LANDED: `written`, the distinct
// files a safeModWrite completed while it was open, and `created`, those of them that were not there before. The copies cover
// only the files that existed; a click that also makes files (Generate land: 1,090 on the owner's flow) has to say so, and a
// click that throws part-way has to know whether it had changed anything at all before it says what it did.
//
// ⛔ #a-renamed-file-is-a-made-file (B6-20) — WHAT A CLICK MADE IS WHAT WAS NOT THERE WHEN IT FIRST TOUCHED THE FOLDER. A file can arrive
// without a write of its own: a state Auto-fix's gap-closer renumbers is written where it is and then renamed (map-data.js
// renumberStateId), so 1081-STATE_1081.txt was counted as changed, its copy is in the folder, and 13-STATE_1081.txt, the same state
// under its new id, was counted nowhere: `created` said 3 of a click that made 4 files (repro-B6-20), and the sentence that says what
// copying the folder back leaves in place (Generate land's, generatedLandBackupsNote) is worded from `created`. Written again by a
// later pass of the same click, such a file was copied into the folder too, mid-click, as if it had a "before". So each folder is
// listed as the scope first touches it: a file that was not in that listing is the click's own, whichever way it came (it is not
// copied, and it counts as created), and the listing is taken once more as the outermost scope ends, for the files that arrived and
// were never written. A file the click made that is gone by then (renamed again, or deleted) is left in place by nobody: not counted.
let _scope = null;
let _scopeDepth = 0;
function beginBackupScope(opts) {
  _scopeDepth += 1;
  if (_scopeDepth === 1) _scope = { dir: (opts && opts.dir) || "", root: (opts && opts.root) || "", files: 0, failed: 0, landed: new Map(), dirs: new Map() };
  return _scope;
}
const scopeLanded = (s) => { let created = 0; for (const c of s.landed.values()) if (c) created++; return { written: s.landed.size, created }; };
const _nameKey = (n) => (process.platform === "win32" ? String(n).toLowerCase() : String(n));
/** ⛔ #a-renamed-file-is-a-made-file — the open scope's listing of the folder `absPath` is in, taken at its first touch of it; null before */
function _scopeDirOf(absPath) { return _scope.dirs.get(_nameKey(path.dirname(path.resolve(absPath)))) || null; }
/** …taken now, when this is the first touch */
function _noteScopeDir(absPath) {
  try {
    const d = path.dirname(path.resolve(absPath)), k = _nameKey(d);
    if (!_scope.dirs.has(k)) _scope.dirs.set(k, { dir: d, names: new Set(fs.readdirSync(d).map(_nameKey)) });
  } catch (_) { /* a count must never stop a write */ }
}
/** …and whether `absPath` arrived after it: a file of the click's own, with no "before" */
function _madeInScope(absPath) {
  const listed = _scopeDirOf(absPath);
  return !!listed && !listed.names.has(_nameKey(path.basename(absPath)));
}
/** What the scope `s` leaves made as it ends: the files it made that are still there, and the files that arrived in a folder it touched
 *  and that none of its writes landed on (a rename's new name). A write's own temp file is neither. */
function _scopeLeftMade(s) {
  const landed = new Set([...s.landed.keys()].map(_nameKey));
  let made = 0, arrived = 0;
  for (const [p, c] of s.landed) if (c && fs.existsSync(p)) made++;
  for (const { dir, names } of s.dirs.values()) {
    let now = [];
    try { now = fs.readdirSync(dir); } catch (_) { continue; }
    for (const n of now) {
      if (names.has(_nameKey(n)) || /\.tmp-\d+-\d+$/.test(n)) continue;
      const p = path.join(dir, n);
      if (landed.has(_nameKey(p))) continue;
      try { if (fs.statSync(p).isFile()) arrived++; } catch (_) { /* gone again: nothing left in place */ }
    }
  }
  return { made, arrived };
}
function endBackupScope() {
  if (_scopeDepth > 0) _scopeDepth -= 1;
  if (_scopeDepth > 0) return _scope ? { dir: _scope.dir, files: _scope.files, failed: _scope.failed, ...scopeLanded(_scope) } : null;
  const s = _scope;
  _scope = null;
  if (!s) return null;
  const left = _scopeLeftMade(s);
  return { dir: s.files ? s.dir : "", files: s.files, failed: s.failed, written: s.landed.size + left.arrived, created: left.made + left.arrived };
}
/** A write to `absPath` landed while a scope is open; `existed` is whether the file was there before it. First landing wins. ⛔
 *  #a-renamed-file-is-a-made-file — a file the folder's listing does not have is the click's own, however it got there; with no
 *  listing yet, this write is the first touch of the folder, and the file is the click's own when the write made it. */
function noteLandedInOpenScope(absPath, existed) {
  if (!_scope) return;
  try {
    const k = path.resolve(absPath);
    if (_scope.landed.has(k)) return;
    const listed = !!_scopeDirOf(absPath);
    if (!listed) _noteScopeDir(absPath);
    _scope.landed.set(k, listed ? _madeInScope(absPath) : !existed);
  } catch (_) { /* a count must never stop a write */ }
}
/** Copy `absPath` into the open scope, if there is one. Best-effort; never throws. */
function copyIntoOpenScope(absPath) {
  if (!_scope) return;
  _noteScopeDir(absPath);                 // ⛔ #a-renamed-file-is-a-made-file — as the folder stands before this write, at the first touch
  if (!_scope.dir) return;
  try {
    // a FOLDER where the file should be holds no bytes to keep, and the write onto it fails on its own: not a copy that failed
    if (!fs.statSync(absPath).isFile()) return;
    // ⛔ #a-file-a-click-made-has-no-before (B6-20) — a file THIS scope made is not copied when the click writes it again: it had no
    // "before". Copied, the folder held a state file Auto-fix's id floor had made and a later pass of the same click rewrote,
    // mid-click, beside the state's final file: copying the folder back over the mod, what it is laid out for, left state ids 120 and
    // 1081 in two files each (repro-B6-20). It is counted in `created` instead, which the line says. The Save run's rule next door is
    // the same: #a-file-a-save-made-has-no-before.
    if (_scope.landed.get(path.resolve(absPath)) === true || _madeInScope(absPath)) return;
    let rel = _scope.root ? path.relative(_scope.root, absPath) : "";
    // A file outside the operation's root keeps the flat encoded name instead, so it is still saved.
    if (!rel || rel.startsWith("..") || path.isAbsolute(rel)) rel = path.resolve(absPath).replace(/[\\/:]/g, "__");
    const to = path.join(_scope.dir, rel);
    fs.mkdirSync(path.dirname(to), { recursive: true });
    if (fs.existsSync(to)) return;            // the first copy is the one this operation must hand back
    fs.copyFileSync(absPath, to);
    _scope.files += 1;
  } catch (_err) { _scope.failed += 1; }
}

// ⛔ #a-save-keeps-its-own-first-copies — A MAP SAVE MUST NOT DELETE ITS OWN FIRST COPIES EITHER.
//
// The map page's 💾 Save is not one request: it replays every edit staged since the last Save as a request of its own, and each
// takes its backups into the pool pruneBackups cuts to MAX_BACKUP_FILES after every backup. A bulk click opens a scope; a Save had
// none, so it was safe only while it made fewer backups than the pool keeps. An erase, or a province the inspector turns from sea to
// land, rewrites definition.csv, buildings.txt, heightmap.bmp, terrain.bmp, the normal map and the world's pictures: 12 to 15
// backups a request. Replayed with the page's own bodies (review of the tools' ground): twenty one-province islands of Millennium
// Dawn, each its own Erase stroke with Auto-fix deleting the state it emptied (a flip, a delete, a flip, a delete — so no two
// erases ran together for the stroke batch to take), had pushed the Save's own first copies of definition.csv, buildings.txt,
// heightmap.bmp, terrain.bmp and world_normal.bmp out of the pool by the fifteenth island, 22 of its 43 by the end; seventeen
// inspector retypes from sea to land on the base game took all eleven; 51 terrain changes in the inspector took all four. Those
// were the only copies of the files as they stood before the Save, and on a modder's own map they are their own work.
//
// So the requests of one Save are ONE SAVE RUN: the page sends each with the Save's id and server.js handles each inside its run
// (useSaveRun). The first pool backup a run takes of a file is its FIRST COPY, the file as it stood before the Save. When the pool
// is about to delete a run's first copy, the run's folder opens instead — <home>/.nova/map_saves/<mod>/<stamp>/, each file at its
// path in the mod, outside the mod and the pool and never pruned — and every first copy the run has is copied into it, the one
// being pruned among them; from then on each file the run backs up for the first time is copied there before it is written, as a
// backup scope copies (copyIntoOpenScope). So a Save too long for the pool ends with one folder holding every file it changed as it
// was before the Save; a Save that never fills the pool opens no folder, and its first copies stay in the pool, as they always did.
// A run keeps its first copies until the next Save of the same mod begins, or an hour after its last request: a LATER Save pushing
// an earlier one's backups out is the pool doing its job. Copies only: nothing is deleted here, and a first copy that cannot be
// copied out stays in the pool rather than go.
//
// ⛔ #a-save-backs-a-file-up-once — AND A SAVE TAKES ONE COPY OF A FILE. Every request of a Save backed up every file it rewrote, so 32
// retypes of 8 files put 556 copies into a pool of 200, and whatever the run could not protect went: the first copies of a Save the app
// was closed in the middle of, whose run died with the process, 8 of 8, with nothing said. A second copy of a file the run already holds
// is worth nothing while the file is as the run's own last write left it, so it is not taken (saveRunHoldsIt): a Save now costs the pool
// one entry per file it changes, and everything older stays, a cut-off Save's first copies among them, with no record kept to know them
// by. A file anything else has changed since (the modder's editor between two clicks, an Auto-fix) is copied as ever. A Save that changes
// more files than the pool keeps is what the run's folder is now for.
//
// ⛔ #a-stopped-save-is-still-the-same-save — A SAVE THAT STOPPED AND IS CLICKED AGAIN IS THE SAME SAVE: the page keeps its id until a
// Save ends with an empty queue, so the run goes on (useSaveRun takes it back even when its hour has passed). And its folder opens at the
// stop (openSaveRun, from server.js, at the first answer that stops the Save): the run's memory does not outlive the process, so the
// first copies leave the pool while it still knows them, and the line that says the Save stopped says where they are.
//
// ⛔ #a-file-a-save-made-has-no-before — A FILE THE RUN CREATED HAS NO FIRST COPY. A write that lands on a file that was not there tells the
// run so (saveRunLanded, beside noteLandedInOpenScope, which tells a backup scope), and the run's next backup of it is not a first copy:
// that was the Save's own first edit, claimed "as it was before the Save", 12 of 12 files on a mod inheriting its map from the base game;
// and a state Create state had just made, with provinces = { }, which copying the folder back then put over the state's real file: fatal.
// They are counted, and the line says so in Generate land's words: the folder has no copy of them, and copying it back leaves them.
//
// ⛔ #a-copy-that-could-not-be-made-is-counted-once — `failed` is the files whose first copy the folder has not got, not the attempts: a
// prune retries one every time, and the line said 556 for 8. saveRunCopies says of each whether the pool still has it (`stay`) or nothing
// does (`failed`), and a later success takes it off.
//
// ⛔ #a-save-folder-nobody-was-told-about — a run's folder can open after its Save's line has gone, when something else fills the pool within
// the hour (another mod's Save, a big Auto-fix). Nothing is lost, and nobody is told. The next Save of that mod names it, in its own answers.
//
// ⛔ #a-save-run-outlives-its-process (B6-28) — A SAVE THE APP DIED IN THE MIDDLE OF KEEPS ITS FIRST COPIES TOO. A run lives in this
// process's memory, and a Save that stops at an answer has its folder opened at the stop. A Save the app was closed in, or that died with it
// (a crash, a killed process, the machine going down), has no stop and no memory left: its first copies stayed in the pool with nothing to
// know them by, and the Save that finished it (the crash-recovery bar's Restore, then 💾 Save: a new run, in a new process) pushed them out
// with its own backups. Measured (repro-B6-28): a Save of 268 state files killed after 152 had landed, finished from the bar, left 68 of the
// 152 with no copy as they were before the Save anywhere outside the mod. So each run keeps a RECORD of its first copies beside the pool, in
// <app data>/map_save_runs/, one plain text file per mod: a line naming the run (its folder and its process), then a line per first copy as
// it is taken (the file, its copy in the pool, its size and time then), before anything can prune that copy. The next Save of the mod TAKES
// UP every run in it another process left, and holds it as a live run is held: if the pool would delete one of its first copies, its own
// folder opens and takes them all (keepSaveRunFirstCopy), and this Save's answers name that folder (`earlier`: "An earlier Save of this
// mod"). In this process nothing changes: a later Save of the same mod still lets an earlier one's copies go, and a Save that never fills
// the pool still opens no folder. The record is rewritten, never deleted, and it never leaves this disk. A record that cannot be read or
// written costs a Save nothing: the Save runs as it did before there was one.
//
// ⛔ #a-run-is-taken-up-once — A RUN IS TAKEN UP ONCE. It leaves the record as it is taken up and lives on only in the memory of the Save
// that took it up, so it ends with that Save, as a run of this process ends (when the next Save of the mod in this process begins, an hour
// after that Save's last request, or with the process), and no Save of a later process takes it up again. The record is rewritten as each
// Save of its mod begins and holds that Save's run alone, so it never grows past what one Save took. It was written back into the record
// (review of B6-28, MF1), so every later process took it up again, and the record grew with every session: over 20 sessions of one
// 60-file Save each, none of them cut off, the record reached 1,237 lines, the twentieth Save took up nineteen runs, and seventeen
// map_saves folders opened with 1,020 copies nobody needed, each named under a ⚠ by a Save that had nothing to do with it. What taking
// up still costs, and what it does not cover:
//   - It cannot tell a Save that was cut off from one that had finished before the app closed, so it takes up both. When the next Save of
//     the mod backs up so many files that the earlier Save's first copies would leave the pool while it lives (the two together more than
//     the pool keeps), the earlier Save's folder opens and this Save's line names it under a ⚠, though nothing was cut off: one folder a
//     session for a modder who makes one such Save a session (measured: six sessions of one 150-file Save each left five folders, 750
//     copies), in map_saves, which nothing prunes. Only the page knows that a Save resumes one that did not finish (its crash bar's
//     partWay); until it tells the server so, that is the price. The owner's call.
//   - A run is not taken up again when the Save that took it up is cut off in its turn: the next process takes up that Save's run, whose
//     first copies are the files as the first Save left them, and the first Save's own first copies still in the pool are not held.
//   - The folder of a run taken up that opens after the Save that took it up has answered for the last time is named by the next Save of
//     the mod in this process (#a-save-folder-nobody-was-told-about), and by none if the app closes first. Nothing is lost: it is there.
//
// ⛔ #a-taken-up-run-says-what-it-lost — NOTHING HOLDS A DEAD RUN'S FIRST COPIES UNTIL A SAVE OF ITS MOD TAKES IT UP, so whatever fills the
// pool between the restart and that Save (a Save of another mod, an Auto-fix) can push some of them out, and those files have no copy as
// they were anywhere. The answer that names its folder says how many (`failed`, which the page words as "N more files could not be
// copied"), as a run's own answer counts the copies it has nowhere. Without it (review of B6-28, MF2) the line said "Changed 20 files. A
// copy of all of them was saved first" of a dead Save that had changed 40, the other 20 with no copy anywhere. When the pool has pushed
// every one of them out, no folder opens and no answer names one (review of B6-28, S2): the only words left are the page's crash-recovery
// bar's, which say the backups folder has those files only until newer backups push them out.
const SAVE_RUN_LIFE_MS = 60 * 60 * 1000;
const _saveRuns = new Set();   // the runs whose first copies the pool must not delete
const _foldersNobodyNamed = [];   // the runs whose folder has opened, until an answer has named it
let _saveRun = null;           // the run whose request is being handled
const _pathKey = (p) => { const r = path.resolve(p); return process.platform === "win32" ? r.toLowerCase() : r; };
// ⛔ #a-save-run-outlives-its-process — where the records are, this process (no two processes share the name, a pid being reused), and the
// runs another process left that a Save of this one has taken up (ended with it, so never taken up twice)
const SAVE_RUN_RECORD_DIR = path.join(NOVA_APP_DATA_DIR, "map_save_runs");
const _thisProcess = `${process.pid}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
const _takenUp = new Set();
let _runsBegun = 0;
/** ⛔ #a-save-run-outlives-its-process — the record of the Save runs of the mod at `root` that have not ended: one file per mod. */
function saveRunRecordOf(root) {
  const norm = path.resolve(String(root || ""));
  const hash = crypto.createHash("sha1").update(_pathKey(norm)).digest("hex").slice(0, 10);
  const base = (path.basename(norm) || "mod").replace(/[^A-Za-z0-9_.-]/g, "_");
  return path.join(SAVE_RUN_RECORD_DIR, `${base}_${hash}.txt`);
}
/** The runs a record holds, by key: the line that names each, its first copies, whether an answer named its folder, and its lines as
 *  they stand. A line the process that died was writing is cut short: it is passed over, as is a line of a run whose first line is gone. */
function _readSaveRunRecord(file) {
  const runs = new Map();
  let text = "";
  try { text = fs.readFileSync(file, "utf8"); } catch (_) { return runs; }
  for (const line of text.split(/\r?\n/)) {
    if (!line) continue;
    let e = null;
    try { e = JSON.parse(line); } catch (_) { continue; }
    if (!e || typeof e !== "object" || typeof e.run !== "string") continue;
    if (e.head) { if (!runs.has(e.run)) runs.set(e.run, { head: e, copies: [], named: false, lines: [line] }); continue; }
    const r = runs.get(e.run);
    if (!r) continue;
    if (e.named) r.named = true;
    else if (typeof e.abs === "string" && e.abs) r.copies.push(e);
    else continue;
    r.lines.push(line);
  }
  return runs;
}
/** The record rewritten to hold `lines`: to a temporary file, renamed over. False when it could not be. */
function _writeSaveRunRecord(file, lines) {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const runRecordTmp = `${file}.tmp-${process.pid}-${Date.now()}`;
    fs.writeFileSync(runRecordTmp, lines.length ? lines.join("\n") + "\n" : "");
    renameOverWithRetry(runRecordTmp, file);
    return true;
  } catch (_) { return false; }
}
/** One line added to a run's record. Best-effort: a note must never stop a write. */
function _noteInSaveRunRecord(file, entry) {
  if (!file) return;
  try { fs.appendFileSync(file, JSON.stringify(entry) + "\n"); } catch (_) { /* the Save runs as it did before there was a record */ }
}
/** ⛔ #a-save-run-outlives-its-process — the Save `run` of a mod begins: every run of that mod another process left, in the record, is taken
 *  up by it, and the record is rewritten to hold `run` alone (⛔ #a-run-is-taken-up-once: a run taken up lives on in `run`'s memory only,
 *  so no later process takes it up again). The runs of this process have ended by now (beginSaveRun's own rule), and so have the runs an
 *  earlier Save of this process took up. */
function _takeUpRunsOfAnEarlierProcess(run) {
  const file = saveRunRecordOf(run.root), kept = [];
  for (const [key, r] of _readSaveRunRecord(file)) {
    if (r.head.process === _thisProcess || _takenUp.has(key)) continue;
    if (!r.head.root || _pathKey(String(r.head.root)) !== _pathKey(run.root)) { kept.push(...r.lines); continue; }   // not this mod's: left as it is
    if (!r.copies.length) continue;   // a run that took no first copy has nothing to keep
    const a = { dir: String(r.head.dir || ""), root: run.root, first: new Map(), pooled: new Map(), open: false, files: 0, failed: new Set(), earlier: [], last: run.last, key, record: file, takenUp: [], named: r.named };
    for (const c of r.copies) {
      const k = _pathKey(c.abs);
      if (a.first.has(k)) continue;   // the first copy of a file is the first one taken
      a.first.set(k, { abs: path.resolve(c.abs), pool: String(c.pool || ""), before: c.before && typeof c.before === "object" ? c.before : null });
      if (c.pool) a.pooled.set(_pathKey(String(c.pool)), k);
    }
    // a folder the run's own process had opened: it holds what it holds, and nobody has named it unless the record says an answer did
    if (a.dir && fs.existsSync(a.dir)) {
      a.open = true;
      for (const f of a.first.values()) if (fs.existsSync(_saveRunTarget(a, f.abs))) a.files += 1;
      if (!a.named) _foldersNobodyNamed.push(a);
    }
    _takenUp.add(key);
    run.takenUp.push(a);
    _saveRuns.add(a);
    // ⛔ #a-run-is-taken-up-once — and its lines are not written back: it ends with `run`, and a record that kept it had every later
    // process take it up again (review of B6-28, MF1)
  }
  const head = run.dir ? JSON.stringify({ run: run.key, head: 1, process: _thisProcess, dir: path.resolve(run.dir), root: path.resolve(run.root), at: run.last }) : "";
  if (_writeSaveRunRecord(file, head ? kept.concat(head) : kept) && head) run.record = file;
}
/** A new Save run for the mod at `root`, whose folder (made only when it is needed) is `dir`. Ends every earlier run of that mod. */
function beginSaveRun({ dir = "", root = "" } = {}) {
  const now = Date.now();
  for (const r of [..._saveRuns]) if (now - r.last > SAVE_RUN_LIFE_MS || (root && r.root && _pathKey(r.root) === _pathKey(root))) _saveRuns.delete(r);
  const run = { dir: String(dir || ""), root: String(root || ""), first: new Map(), pooled: new Map(), open: false, files: 0, failed: new Set(), earlier: [], last: now, key: `${_thisProcess}-${++_runsBegun}`, record: "", takenUp: [] };
  for (let i = _foldersNobodyNamed.length - 1; i >= 0; i--) {
    const r = _foldersNobodyNamed[i];
    if (!root || !r.root || _pathKey(r.root) !== _pathKey(root)) continue;
    _foldersNobodyNamed.splice(i, 1);
    const n = _saveRunFilesChanged(r);   // ⛔ #a-copy-of-a-file-nobody-changed-is-no-change — the files it changed, not every copy it holds
    const lost = n ? _saveRunFilesLost(r) : 0;   // ⛔ #a-taken-up-run-says-what-it-lost — …and how many more have no copy anywhere
    if (n) run.earlier.push({ dir: r.dir, files: n, ...(lost ? { failed: lost } : {}) });
  }
  if (run.root) _takeUpRunsOfAnEarlierProcess(run);   // ⛔ #a-save-run-outlives-its-process
  _saveRuns.add(run);
  return run;
}
/** Handle what follows as part of `run` (null: of none). Returns the run it replaces, to be handed back when the request is done. */
function useSaveRun(run) {
  const was = _saveRun;
  _saveRun = run || null;
  if (_saveRun) {
    _saveRuns.add(_saveRun); _saveRun.last = Date.now();   // ⛔ #a-stopped-save-is-still-the-same-save — past its hour, it is back
    for (const a of _saveRun.takenUp || []) { _saveRuns.add(a); a.last = _saveRun.last; }   // ⛔ #a-save-run-outlives-its-process — …with the runs it took up
  }
  return was;
}
function _saveRunTarget(run, absPath) {   // laid out as copyIntoOpenScope lays a scope's copies out
  let rel = run.root ? path.relative(run.root, absPath) : "";
  if (!rel || rel.startsWith("..") || path.isAbsolute(rel)) rel = path.resolve(absPath).replace(/[\\/:]/g, "__");
  return path.join(run.dir, rel);
}
/** Copy `from` (the file itself, or its pool backup) into the run's folder as `absPath`'s first copy: true when the folder holds it. */
function _intoSaveRun(run, from, absPath) {
  const k = _pathKey(absPath);
  try {
    if (!run.dir) throw new Error("this run has no folder");
    const to = _saveRunTarget(run, absPath);
    if (!fs.existsSync(to)) {                 // the first copy is the one the Save must hand back
      fs.mkdirSync(path.dirname(to), { recursive: true });
      fs.copyFileSync(from, to);
      run.files += 1;
    }
    run.failed.delete(k);
    return true;
  } catch (_err) { run.failed.add(k); return false; }
}
function _openSaveRun(run) {
  if (run.open) return;
  run.open = true;
  _foldersNobodyNamed.push(run);
  for (const f of run.first.values()) if (f.pool && fs.existsSync(f.pool)) _intoSaveRun(run, f.pool, f.abs);
}
/** Before `absPath` is backed up and overwritten inside a run whose folder is open: its first copy goes there first. */
function saveRunBeforeBackup(absPath) {
  const run = _saveRun;
  if (!run || !run.open || run.first.has(_pathKey(absPath))) return;
  try { if (!fs.statSync(absPath).isFile()) return; } catch (_err) { return; }
  _intoSaveRun(run, absPath, absPath);
}
/** …and after: the pool's copy (`poolPath`, "" when the pool could not take one) is the run's first copy of the file, when it has
 *  none yet. A first copy the pool could not take is copied into the folder now, while the file is still as it was. */
function saveRunAfterBackup(absPath, poolPath) {
  const run = _saveRun;
  if (!run) return;
  const k = _pathKey(absPath);
  if (run.first.has(k)) return;
  const f = { abs: path.resolve(absPath), pool: poolPath || "", before: _statOf(absPath) };   // (`before`: the file as it was, for _firstCopyIsOfAChange)
  run.first.set(k, f);
  _noteInSaveRunRecord(run.record, { run: run.key, abs: f.abs, pool: f.pool, before: f.before });   // ⛔ #a-save-run-outlives-its-process — before the prune
  if (poolPath) run.pooled.set(_pathKey(poolPath), k);
  else { _openSaveRun(run); _intoSaveRun(run, absPath, absPath); }
}
/** pruneBackups is about to delete `poolPath`. When it is a live run's first copy, that run's folder opens and takes it (with every
 *  other first copy the run has): true when it must stay in the pool, because the folder could not take it. */
function keepSaveRunFirstCopy(poolPath) {
  if (!_saveRuns.size) return false;
  const pk = _pathKey(poolPath), now = Date.now();
  for (const run of _saveRuns) {
    if (now - run.last > SAVE_RUN_LIFE_MS) { _saveRuns.delete(run); continue; }
    const k = run.pooled.get(pk);
    if (!k) continue;
    _openSaveRun(run);
    const f = run.first.get(k);
    return !(f && _intoSaveRun(run, poolPath, f.abs));
  }
  return false;
}
/** ⛔ #a-save-backs-a-file-up-once — the run holds a copy of this file as it was before the Save, and the file is still as the run's own
 *  last write left it, so another copy would only push something older out of the pool. Compared by size, time and Nova's own count of
 *  writes to it (stat cannot see a write of Nova's in the tick of the last one: #a-same-tick-write-keeps-its-stamp), in the direction of
 *  taking a copy: any doubt, and one is taken. So a write asks this BEFORE it is counted. */
function saveRunHoldsIt(absPath) {
  const run = _saveRun, f = run ? run.first.get(_pathKey(absPath)) : null;
  if (!f || !f.wrote) return false;
  try {
    const s = fs.statSync(absPath);
    if (s.size !== f.wrote.size || s.mtimeMs !== f.wrote.mtimeMs || novaWritesTo(absPath) !== f.wrote.gen) return false;
    return !!(f.created || (f.pool && fs.existsSync(f.pool)) || (run.dir && fs.existsSync(_saveRunTarget(run, f.abs))));
  } catch (_err) { return false; }
}
/** A write of this file landed inside the run: what it left is what saveRunHoldsIt compares against. `existed`: the file was there
 *  before the write; one that was not, and that the run has no first copy of, the run created (#a-file-a-save-made-has-no-before). */
function saveRunLanded(absPath, existed) {
  const run = _saveRun;
  if (!run) return;
  const k = _pathKey(absPath);
  if (!existed && !run.first.has(k)) run.first.set(k, { abs: path.resolve(absPath), pool: "", created: true });
  const f = run.first.get(k);
  if (!f) return;
  try { const s = fs.statSync(absPath); f.wrote = { size: s.size, mtimeMs: s.mtimeMs, gen: novaWritesTo(absPath) }; } catch (_err) { f.wrote = null; /* a note must never stop a write */ }
}
/** ⛔ #a-change-taken-back-leaves-no-copy (final round, L2) — did the save run being handled CREATE this file (#a-file-a-save-made-has-no-before)?
 *  A file this Save made, which a later write of the same Save gave its old text back, is a copy nobody changed (map-data.js
 *  takeBackACopyThisSaveMade). Outside a run nothing is known, and the answer is no: a file a Save did not make is the mod's. */
function saveRunCreated(absPath) {
  const run = _saveRun, f = run ? run.first.get(_pathKey(absPath)) : null;
  return !!(f && f.created);
}
/** ⛔ #a-stopped-save-is-still-the-same-save — the Save stopped at this run's answer. Nothing to keep yet (it stopped at its first write,
 *  having written nothing), and no folder is made for it. ⛔ #a-copy-of-a-file-nobody-changed-is-no-change — …nor when every file it
 *  took a first copy of is still as that copy has it (below). */
function openSaveRun(run) {
  if (run && [...run.first.values()].some((f) => !f.created && _firstCopyIsOfAChange(run, f))) _openSaveRun(run);
}
/** size and time of a file, or null */
function _statOf(absPath) {
  try { const s = fs.statSync(absPath); return { size: s.size, mtimeMs: s.mtimeMs }; } catch (_err) { return null; }
}
/** ⛔ #a-copy-of-a-file-nobody-changed-is-no-change — IS THE FILE THIS FIRST COPY WAS TAKEN OF STILL AS THE COPY HAS IT? A write refused after
 *  its backup leaves a first copy of a file nobody changed: a read-only state file is copied, and then the rename over it fails ("Nothing
 *  was changed"). A Save stopped at it opened its folder and said "This Save: Changed 1 file. A copy of it was saved first", of the one
 *  file it had not touched, and at its first write, of a Save that had changed nothing at all (review of the T39 merge, S-stopped-save-
 *  copies). Asked of the FILE, not of the run's notes: saveRunLanded hears only safeModWrite's text writes, and a Save also writes
 *  bitmaps (backupAssetBeforeOverwrite, then its own write) and deletes state files. Cheap where it can be: a text write landed, the file
 *  gone, or its size or time moved since the copy was taken, and it changed, with nothing read; only a file whose stat has not moved is
 *  read, and compared with its copy. Any doubt (no copy left to compare, a read that fails), and it changed. */
function _firstCopyIsOfAChange(run, f) {
  if (!f || f.wrote) return true;
  try {
    const s = fs.statSync(f.abs);
    if (!f.before || s.size !== f.before.size || s.mtimeMs !== f.before.mtimeMs) return true;
    const copy = [run.dir ? _saveRunTarget(run, f.abs) : "", f.pool].find((p) => p && fs.existsSync(p));
    return !copy || !fs.readFileSync(copy).equals(fs.readFileSync(f.abs));
  } catch (_err) { return true; }   // the file is gone (the Save deleted it), or cannot be read
}
/** The files the run's folder holds a first copy of that the run CHANGED: its count, less the copies of files still as they were. */
function _saveRunFilesChanged(run) {
  if (!run || !run.files) return 0;
  let unchanged = 0;
  for (const f of run.first.values()) if (!f.created && !f.wrote && fs.existsSync(_saveRunTarget(run, f.abs)) && !_firstCopyIsOfAChange(run, f)) unchanged++;
  return Math.max(0, run.files - unchanged);
}
/** ⛔ #a-taken-up-run-says-what-it-lost — the files the run changed whose first copy is neither in its folder nor in the pool: of a run
 *  another process left, the ones the pool pushed out before a Save of this process took it up. Asked of each as saveRunCopies asks of
 *  a run's own (`failed`: #a-copy-that-could-not-be-made-is-counted-once, #a-copy-of-a-file-nobody-changed-is-no-change). */
function _saveRunFilesLost(run) {
  let lost = 0;
  if (!run || !run.first) return lost;
  for (const f of run.first.values()) {
    if (f.created || (run.dir && fs.existsSync(_saveRunTarget(run, f.abs))) || (f.pool && fs.existsSync(f.pool))) continue;
    if (_firstCopyIsOfAChange(run, f)) lost++;
  }
  return lost;
}
/** What an answer says about the run's copies (`saveCopies`), once there is something to say: the folder and how many it holds; how many
 *  it could not take and the pool still has (`stay`, and where the pool is); how many have no copy anywhere (`failed`); how many files
 *  the run created and left in the mod (`created`); and the folder of an earlier Save of the mod nobody has named (`earlier`: each
 *  { dir, files }, and `failed` when some of the files that Save changed have no copy anywhere: #a-taken-up-run-says-what-it-lost).
 *  ⛔ #a-copy-of-a-file-nobody-changed-is-no-change — each a count of files the run CHANGED: the folder keeps a copy of a file whose write
 *  was refused (the same Save may write it once clicked again), and says nothing of it while the file is as it was. */
function saveRunCopies(run) {
  if (!run) return null;
  let stay = 0, nowhere = 0, created = 0;
  for (const k of run.failed) {
    const f = run.first.get(k);
    if (f && !f.created && !_firstCopyIsOfAChange(run, f)) continue;
    if (f && f.pool && fs.existsSync(f.pool)) stay++; else nowhere++;
  }
  const files = _saveRunFilesChanged(run);
  const earlier = run.earlier.concat(_takenUpFoldersToName(run));   // ⛔ #a-save-run-outlives-its-process
  if (!files && !stay && !nowhere && !earlier.length) return null;
  for (const f of run.first.values()) if (f.created && fs.existsSync(f.abs)) created++;
  const unnamed = files ? _foldersNobodyNamed.indexOf(run) : -1;
  if (unnamed !== -1) _foldersNobodyNamed.splice(unnamed, 1);   // this answer names it
  // …and the record says so, so a process that takes this run up after this one is gone does not name it a second time
  if (files && run.dir && !run.namedInRecord) { run.namedInRecord = true; _noteInSaveRunRecord(run.record, { run: run.key, named: 1 }); }
  return { dir: files ? run.dir : "", files, failed: nowhere, stay, created, ...(stay ? { backups: BACKUP_DIR } : {}), ...(earlier.length ? { earlier } : {}) };
}
/** ⛔ #a-save-run-outlives-its-process — the folders of the runs `run` took up that have opened and that no answer had named before they were
 *  taken up, each with the files that run changed (#a-copy-of-a-file-nobody-changed-is-no-change) and how many more of them have no copy
 *  anywhere (`failed`, #a-taken-up-run-says-what-it-lost): named in every answer of `run` from now on, as its own folder is, and so by no
 *  later Save. */
function _takenUpFoldersToName(run) {
  const out = [];
  for (const a of run.takenUp || []) {
    if (!a.open || a.named || !a.dir || run.earlier.some((e) => e && e.dir && _pathKey(e.dir) === _pathKey(a.dir))) continue;
    const files = _saveRunFilesChanged(a);
    if (!files) continue;
    const lost = _saveRunFilesLost(a);   // ⛔ #a-taken-up-run-says-what-it-lost — pushed out of the pool before this Save took the run up
    out.push({ dir: a.dir, files, ...(lost ? { failed: lost } : {}) });
    const i = _foldersNobodyNamed.indexOf(a);
    if (i !== -1) _foldersNobodyNamed.splice(i, 1);
    // (the run is in no record once taken up, #a-run-is-taken-up-once, unless rewriting the record failed then: noted for that case, so a
    // process that takes it up again does not name it twice)
    if (!a.namedInRecord) { a.namedInRecord = true; _noteInSaveRunRecord(run.record || a.record, { run: a.key, named: 1 }); }
  }
  return out;
}

/**
 * The READ side of the same problem. Read `absPath` as utf8, waiting out a transient failure on the ladder above.
 * Throws the last error if it will not go — the caller decides what an unreadable file means.
 *
 * ⛔ #a-momentary-read-failure-emptied-a-map-folder — A FILE THAT IS BUSY FOR A MOMENT IS NOT A FILE WITH NOTHING IN IT.
 * A read is not retried anywhere in Nova: every reader wraps fs.readFileSync in a try/catch and turns the failure into ""
 * or "no items". That is right for a file that cannot be read and wrong for one that was locked for a few milliseconds,
 * and the two were indistinguishable. Measured on d8e955b: ONE injected EBUSY under map/supplyareas made buildMapModel
 * answer with one supply area for a mod shipping two, silently — which is what made batch 12's Auto-fix guard flake.
 *
 * The codes worth waiting out are not the same as the write side's: EACCES on a read is a permission, not a lock, and
 * retrying it only makes a refusal slower. EMFILE/ENFILE (too many open files, process- and system-wide) and EAGAIN are
 * here because they are transient by definition and Nova reads thousands of files per validate.
 *
 * `budget` is an optional { msLeft } a CALLER shares across a batch of reads, so a folder that has gone unreadable pays
 * the ladder a few times rather than once per file. Nothing is allocated or waited for on the happy path: a read that
 * succeeds first time costs exactly one fs.readFileSync, as it did before.
 */
const TRANSIENT_READ_CODES = ["EBUSY", "EPERM", "EMFILE", "ENFILE", "EAGAIN"];
function readTextWithRetry(absPath, budget = null) {
  for (let attempt = 0; ; attempt++) {
    try { return fs.readFileSync(absPath, "utf8"); }
    catch (err) {
      // undefined = there is no wait to make: the code is permanent, or the ladder is spent.
      const wait = err && TRANSIENT_READ_CODES.includes(err.code) ? RENAME_RETRY_MS[attempt] : undefined;
      if (wait === undefined) throw err;
      if (budget && budget.msLeft < wait) throw err;
      if (budget) budget.msLeft -= wait;
      sleepSync(wait);
    }
  }
}

/** readTextWithRetry for BYTES: a restore must put back exactly what was there, and a decode would turn a byte that is not
 *  UTF-8 into U+FFFD (#a-failed-redraw-puts-back-bytes). Same ladder, same budget, same codes. */
function readBytesWithRetry(absPath, budget = null) {
  for (let attempt = 0; ; attempt++) {
    try { return fs.readFileSync(absPath); }
    catch (err) {
      const wait = err && TRANSIENT_READ_CODES.includes(err.code) ? RENAME_RETRY_MS[attempt] : undefined;
      if (wait === undefined) throw err;
      if (budget && budget.msLeft < wait) throw err;
      if (budget) budget.msLeft -= wait;
      sleepSync(wait);
    }
  }
}

/** `opts.poolBackup === false`: no copy into the rotating backup pool. For ONE caller shape only — a restore putting back
 *  bytes a backup scope already holds, or resetting a file its own click created seconds earlier. Taken anyway, a failed
 *  map redraw's reset of ~300 created region files pushed every older backup out of the 200-file pool (round-two review of
 *  the redraw); nothing the pool would hold there is the modder's. Every other write keeps its backup. */
function safeModWrite(absPath, content, reason = "save", opts = null) {
  assertNotStrayWrite(absPath);
  cfg.assertWritable(absPath);
  const saveRunHasIt = saveRunHoldsIt(absPath);   // ⛔ #a-save-backs-a-file-up-once — asked before the line below counts this write
  cfg.afterWrite(absPath);   // a mod file changed -> Home's cached counts/health must be rebuilt
  announceModWrite(absPath); // …and so must any parsed copy of the mod a caller is still holding
  let backupPath = "";
  const existed = fs.existsSync(absPath);
  try {
    if (existed && !(opts && opts.poolBackup === false)) {
      // ⛔ #a-long-pool-name-cost-the-scope-copy — the scope's copy FIRST, not behind the pool's. The pool's name spells out the
      // file's whole path and passes NTFS's 255 characters for one name under a deep enough mod (256 on a scratch copy of TEST 31);
      // that copyFileSync threw and the scope copy after it in this try never ran, with nothing counted as failed — so a click
      // said "a copy of all of them" with one missing. The scope's path is the file's path in the mod, under a short folder.
      copyIntoOpenScope(absPath);            // #a-bulk-map-click-evicted-its-own-backups
      saveRunBeforeBackup(absPath);          // ⛔ #a-save-keeps-its-own-first-copies — before the pool's copy, for the reason above
    }
    // ⛔ #a-save-backs-a-file-up-once — …and a Save takes one copy of a file, unless something else has changed it since the Save's last write
    if (existed && !(opts && opts.poolBackup === false) && !saveRunHasIt) {
      fs.mkdirSync(BACKUP_DIR, { recursive: true });
      backupPath = buildBackupPath(absPath, reason);
      // #backup-decoded-and-re-encoded — COPY THE BYTES. This read the file as utf8 and wrote it back as
      // utf8, which is a decode/re-encode round trip: any byte the decoder cannot make sense of comes back
      // as U+FFFD (EF BF BD), permanently. For a file saved from a non-UTF-8 editor that makes the recovery
      // copy as damaged as whatever it was taken to protect against — and 54 call sites describe this as
      // "backup-then-atomic (recoverable)".
      //
      // ⚠️ MEASURED EXPOSURE, because it is much smaller than it sounds: across vanilla and every installed
      // workshop mod, 2 files of 38,000 under common/, history/ and localisation/ would change under that
      // round trip (both in Rise of Nations). Vanilla stores IRE_Éamon_de_valera as valid UTF-8, so the
      // usual suspects are fine. The fix is still worth having — a backup that corrupts is worse than no
      // backup, a user's own hand-edited file is not covered by that survey, and copyFileSync is simpler
      // than what it replaces. backupExisting has always done it this way.
      fs.copyFileSync(absPath, backupPath);
      saveRunAfterBackup(absPath, backupPath);   // ⛔ #a-save-keeps-its-own-first-copies — the Save's first copy, before the prune
      pruneBackups(MAX_BACKUP_FILES);
    }
  } catch (_err) {
    backupPath = ""; // best-effort: never let a failed backup stop the actual write
    // …and a first copy the pool could not take goes to the Save's folder, while the file is still as it was
    if (existed && !(opts && opts.poolBackup === false)) saveRunAfterBackup(absPath, "");
  }
  // #save-mixes-line-endings — KEEP THE FILE'S OWN LINE ENDING.
  //
  // Every serializer in this file emits "\n", and twenty writers SPLICE that output into text they read
  // from disk. In a CRLF file the spliced lines came out LF while every untouched line stayed CRLF, so a
  // modder who changed one thing got a diff covering the whole block — and in version control, lines they
  // never touched. Measured: one no-edit spirit save turned 21 of Road to 56's switzerland.txt lines into
  // lone LF; one equipment rebuild split 11 lines of Rise of Nations' infantry.txt; the module writer
  // splits its file too. 170 of the 243 installed equipment files are entirely CRLF.
  //
  // Here rather than in each writer: there are 103 write sites and the ones that remember are the
  // exception. AFTER the backup, so the backup is still the untouched original — and counted from BYTES,
  // because this function must never decode a file it cannot read (#backup-decoded-and-re-encoded).
  //
  // Deliberately conservative: only when the file on disk is ENTIRELY CRLF. An already-mixed file is left
  // alone, since converting it would rewrite lines this save was never asked to touch.
  content = matchExistingLineEndings(absPath, content);

  const tmpPath = `${absPath}.tmp-${process.pid}-${Date.now()}`;
  let fd = null;
  try {
    fd = fs.openSync(tmpPath, "w");
    fs.writeFileSync(fd, content, "utf8");
    fs.fsyncSync(fd);
  } finally {
    if (fd !== null) fs.closeSync(fd);
  }
  // #readonly-file-raw-error — say why, instead of showing a rename of a temp file nobody has seen.
  //
  // The write is atomic: content goes to `<file>.tmp-<pid>-<ts>` and is renamed over the target. When the
  // target is read-only or held open, the rename is what fails, so the modder was shown
  // "EPERM: operation not permitted, rename 'C:\…\zz.txt.tmp-36268-1785531789847' -> …" — an internal
  // path, an errno, and no hint of the cause.
  //
  // All three causes are ordinary: Steam workshop content is frequently read-only, HOI4 holds files while
  // running, and antivirus or a sync client can lock a file for a moment. The temp file is cleaned up so a
  // failed save does not leave litter beside the modder's own files.
  // #write-lock-gives-up-instantly — RETRY THE TRANSIENT CAUSE, FAIL THE PERMANENT ONES PROMPTLY.
  //
  // Of the three causes named above, one is momentary: an antivirus scanner or sync client holding the
  // file for a few milliseconds. Giving up on the first attempt loses the author's save to it, and on
  // Windows with real-time AV that is an everyday event — it has hit this project's own test suite three
  // times, on three unrelated files, each passing when run alone.
  //
  // A read-only Steam Workshop file fails every attempt, so the ladder stays short (~345ms total): long
  // enough to outlast a scan, short enough that a genuine refusal still feels immediate.
  // The ladder lives in renameOverWithRetry so /api/save gets it too — it had the message and not the
  // retry. #save-route-never-adopted-the-retry
  try {
    renameOverWithRetry(tmpPath, absPath);
    noteLandedInOpenScope(absPath, existed);   // #generate-land-created-what-its-copies-cannot-cover
    saveRunLanded(absPath, existed);           // ⛔ #a-save-backs-a-file-up-once, #a-file-a-save-made-has-no-before
  } catch (err) {
    if (err && (err.code === "EPERM" || err.code === "EACCES" || err.code === "EBUSY")) {
      throw new Error(
        `Couldn't write ${path.basename(absPath)} — the file is read-only or in use by another program. ` +
        `Nothing was changed. Close Hearts of Iron IV if it is running, check the file isn't marked read-only ` +
        `(Steam Workshop content often is), and try again.`,
      );
    }
    throw err;
  }
  return backupPath;
}

// Binary-safe "back up before overwrite" for ASSET files (DDS/PNG). safeModWrite is utf8-only, so it would
// mangle binary; this copies the existing file verbatim into BACKUP_DIR (same naming + pruning as text
// backups) so an upload that overwrites a real picture is always recoverable. Best-effort — a failed backup
// never blocks the actual write. Returns the backup path (or "" if nothing was backed up).
function backupAssetBeforeOverwrite(absPath, reason = "upload") {
  let existed = false;
  try {
    if (!fs.existsSync(absPath)) return "";
    existed = true;
    copyIntoOpenScope(absPath);              // a bulk pass over bitmaps is the same exposure — FIRST (#a-long-pool-name-cost-the-scope-copy)
    saveRunBeforeBackup(absPath);            // ⛔ #a-save-keeps-its-own-first-copies — as safeModWrite: a Save deletes state files this way
    if (saveRunHoldsIt(absPath)) return "";  // ⛔ #a-save-backs-a-file-up-once
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const backupPath = buildBackupPath(absPath, reason);
    fs.copyFileSync(absPath, backupPath);
    saveRunAfterBackup(absPath, backupPath);
    pruneBackups(MAX_BACKUP_FILES);
    return backupPath;
  } catch (_err) {
    if (existed) saveRunAfterBackup(absPath, "");
    return "";
  }
}

module.exports = {
  configure,
  onModWrite,
  novaWritesTo,                  // #a-same-tick-write-keeps-its-stamp — Nova's own writes, for an in-memory stamp
  announceModWrite,              // #a-same-tick-write-keeps-its-stamp — for the one mod write that does not pass safeModWrite (/api/save)
  strayWriteReason,
  assertNotStrayWrite,
  plainWindowsPath,
  // the write path
  safeModWrite,
  backupAssetBeforeOverwrite,
  renameOverWithRetry,
  matchExistingLineEndings,
  // the read path — #a-momentary-read-failure-emptied-a-map-folder
  readTextWithRetry,
  readBytesWithRetry,
  TRANSIENT_READ_CODES,
  // backup bookkeeping
  buildBackupPath,
  pruneBackups,
  beginBackupScope,
  endBackupScope,
  beginSaveRun,                  // ⛔ #a-save-keeps-its-own-first-copies — the requests of one map Save
  useSaveRun,
  openSaveRun,                   // ⛔ #a-stopped-save-is-still-the-same-save
  saveRunCopies,
  saveRunCreated,                // ⛔ #a-change-taken-back-leaves-no-copy — a file the Save being handled made
  saveRunRecordOf,               // ⛔ #a-save-run-outlives-its-process — where a mod's record of its Save runs is, for tests
  SAVE_RUN_RECORD_DIR,
  isEphemeralBackupName,
  // paths — server.js imports these rather than deriving its own (see the header note)
  resolveNovaAppDataDir,
  NOVA_APP_DATA_DIR,
  ICON_CACHE_DIR,
  BACKUP_DIR,
  MAX_BACKUP_FILES,
  // #a-bare-test-run-writes-into-the-real-app-data — the plan, the layouts and the sandbox made ("" if none), for tests; the
  // variable naming the sandbox to the run; the note map-data.js makes when it works out a store for a mod outside temp;
  // and the release, which a test hands folders of its own to ask what it will and will not take away
  bareTestRunPlan,
  BARE_TEST_ENV,
  BARE_E2E_ENV,
  BARE_APP_DATA_VARS,            // #a-sandboxed-app-data-gets-the-rest-of-a-sandbox — any one in temp: the rest is filled in too
  BARE_TEST_SANDBOX,
  BARE_SANDBOX_VAR,
  BARE_MARK_FILE,                // #a-child-made-a-second-sandbox — what says a folder is a sandbox the guard made
  BARE_MODS_FOLDER,              // #a-script-keeps-the-mods-it-made — where server.js's mods folder is, in one
  noteBareRunRealWrite,
  releaseBareTestSandbox,
};
