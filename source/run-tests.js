#!/usr/bin/env node
// Aggregate test runner: runs every test-*.js in the repo, prints a one-line PASS/FAIL per file, and
// exits non-zero if any fail. Run with `npm test`. Each test file is a standalone Node script that
// exits 0 on success (the convention all test-*.js already follow).
"use strict";
const fs = require("fs");
const path = require("path");
const os = require("os");
const { spawnSync, spawn } = require("child_process");

const dir = __dirname;
// An optional substring filter, the same shape run-e2e.js already takes: `node run-tests.js rivers` runs
// every test whose filename contains "rivers". Without it, everything runs, exactly as before.
//
// ⚠️ A FILTERED RUN IS NOT A GREEN SUITE. The summary says so in as many words, because "938/938 passed"
// after a filter would be a sentence that reads like coverage and is not — the same trap the skip line
// exists to close. Nothing may be committed on a filtered run.
const FILTER = (process.argv[2] || "").trim();
const allFiles = fs.readdirSync(dir)
  .filter((f) => /^test-.*\.js$/.test(f))
  .sort((a, b) => a.localeCompare(b));
const files = FILTER ? allFiles.filter((f) => f.includes(FILTER)) : allFiles;
if (FILTER && !files.length) {
  console.log(`No test file matches "${FILTER}". ${allFiles.length} exist.`);
  process.exit(1);
}
if (FILTER) console.log(`FILTERED RUN — ${files.length} of ${allFiles.length} files match "${FILTER}". This is not a full suite.`);

if (!files.length) {
  console.log("No test-*.js files found.");
  process.exit(0);
}

// A test file that is MISSING must fail the run, not vanish from it.
//
// The runner discovers tests by listing the directory, so anything deleted simply stops being counted
// and the suite still reports "all green" — with less coverage than the run before it. That is not
// hypothetical: antivirus quarantined two committed test files mid-run and the suite went green at
// 322/322 precisely because they were gone. A bad merge, a stray rm, or a synced-folder conflict would
// do the same silently. Compare what is on disk against what git tracks and refuse to pass if any are
// absent. Skipped when git isn't available (a tarball, an exported copy) so this can't wedge the run.
try {
  const tracked = spawnSync("git", ["ls-files", "test-*.js"], { cwd: dir, encoding: "utf8" });
  if (tracked.status === 0 && tracked.stdout.trim()) {
    const expected = tracked.stdout.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
    // ⚠️ allFiles, NOT the filtered list. A filtered run holds a subset by design, and comparing git's
    // tracked files against that subset would report every unmatched file as missing and refuse the run.
    const present = new Set(allFiles);
    const missing = expected.filter((f) => !present.has(f));
    if (missing.length) {
      console.error(`\n✗ ${missing.length} committed test file(s) are MISSING from disk — refusing to report a pass:\n`);
      missing.forEach((f) => console.error(`    ${f}`));
      console.error("\n  Restore them with:  git checkout -- " + missing.join(" ") + "\n");
      process.exit(1);
    }
  }
} catch (_) { /* no git, no check — never let this stop the suite from running */ }

// Two test files are NOT RUN by default because running them can take the whole machine down.
//
// Both assert that saving a national spirit twice is idempotent, by re-saving the SAME file two or three
// times in about a second. Every save writes a fresh backup file, then a uniquely-named `<file>.tmp-<pid>-
// <timestamp>`, then renames that over the original. Rapidly creating new files with odd extensions and
// replacing existing documents with them is, to a behavioural antivirus, indistinguishable from ransomware:
// Kaspersky's System Watcher terminates the node process mid-write (silently — exit code 5, no JS error, an
// orphaned .tmp- file left behind), quarantines the test file, and on this machine froze the desktop.
//
// The code under test is fine. The identical file, copied outside the repo directory, passes 16/16 and three
// consecutive identical saves are byte-stable; it is the process that gets killed, not the assertion that
// fails. Skipping is therefore about the SHAPE of the test, not the behaviour it covers — and the same
// round-trip is covered without the repeat-write loop by test-spirit-edit.js and test-idea-*.js.
//
// Run them deliberately, on a machine where you have accepted the risk, with:  NOVA_RUN_AV_RISKY=1 npm test
const AV_RISKY = {
  "test-spirit-modifier-newlines.js": "re-saves one spirit file 3x in ~1s; behavioural antivirus kills the process mid-write",
  "test-spirit-lifecycle.js": "same repeat-save shape; was quarantined by Kaspersky and froze the machine",
};
const runRisky = process.env.NOVA_RUN_AV_RISKY === "1";

// #suite-wedged-by-a-hung-app — NO SINGLE TEST MAY STOP THE SUITE.
//
// spawnSync had no timeout, so a child that never exits blocked the runner for ever: no output, no error, and
// every file after it in the alphabet simply never ran. That happened for real — the developer's own Nova
// instance on 47821 wedged (still LISTENING, never answering) and test-research-modifier-depth.js sat on a
// request with no deadline, freezing the suite at 526 of 687.
//
// Generous on purpose, so it only ever fires on something genuinely stuck. It was five minutes, on the belief that the
// slowest legitimate file ran in well under one; measured 2026-10-21, test-a-state-that-kept-its-coast-kept-its-harbour.js
// takes 165-236 s ALONE, and under the parallel suite it passed the five minutes in 3 of 4 full runs (killed, then green when
// re-run alone each time) — a false red every run. Fifteen minutes costs little: the runner is parallel, so a stuck file
// holds one slot, not the suite.
const TEST_TIMEOUT_MS = Number(process.env.NOVA_TEST_TIMEOUT_MS || 900000);

// ELEVEN TESTS DRIVE A RUNNING APP. They read `process.env.NOVA_PORT`, and used to fall back to 47821 — the
// developer's own running Nova — instead of standing up their own server; run bare, they now start one of their
// own in a sandbox (testlib-live-server.js, #a-bare-test-run-writes-into-the-real-app-data). Detected rather than
// listed, so a file added later joins the set on its own.
// If NOVA_PORT is set explicitly, the caller is deliberately pointing these tests at a particular app, so
// honour it. Otherwise this runner starts its OWN server further down and puts its port here, and these
// tests never go anywhere near the user's Nova. 47821 is no longer a default the suite can wander into.
const LIVE_PORT_EXPLICIT = process.env.NOVA_PORT ? Number(process.env.NOVA_PORT) : null;
// 54000+ on purpose: the tests themselves bind 53400–53700, and anything running CONCURRENTLY with them
// must stay clear of that band or produce a failure that passes when re-run alone.
let LIVE_PORT = LIVE_PORT_EXPLICIT || 54321;
// ⚠️ STRIP COMMENTS FIRST. A test that only TALKS about the live port — test-runner-cannot-wedge.js explains
// this very mechanism — is not a test that needs the app, and matching its prose skipped it along with the
// real eleven.
const { stripJsComments } = require("./testlib-strip-comments.js");
const { SKIP_LINE, skipWhy } = require("./testlib-skip-line.js");
const needsLiveApp = (f) => {
  try {
    // ⚠️ A regex pair got this wrong: removing BLOCK comments first lets a `/*` inside a LINE comment open a
    // phantom block that swallows the rest of the file. The shared scanner walks it once instead.
    return /process\.env\.NOVA_PORT|localhost:47821|127\.0\.0\.1:47821/.test(stripJsComments(fs.readFileSync(path.join(dir, f), "utf8")));
  } catch (_) { return false; }
};

// Ask the app for one cheap thing before running any of them. Down or wedged, they are skipped with a reason
// — a suite that cannot run those eleven is still a useful suite, whereas eleven timeouts costs 55 minutes
// and says nothing. Uses a plain socket so a server that accepts connections but never replies still fails.
function liveAppReachable(port) {
  const probe = `
    const net = require("net");
    const s = net.connect(${port}, "127.0.0.1");
    let done = false;
    const end = (code) => { if (!done) { done = true; try { s.destroy(); } catch (_) {} process.exit(code); } };
    const t = setTimeout(() => end(1), 4000);
    s.on("connect", () => { s.write("GET /api/mods/list HTTP/1.1\\r\\nHost: 127.0.0.1\\r\\nConnection: close\\r\\n\\r\\n"); });
    s.on("data", () => { clearTimeout(t); end(0); });
    s.on("error", () => { clearTimeout(t); end(1); });
    s.on("close", () => end(1));
  `;
  const r = spawnSync(process.execPath, ["-e", probe], { encoding: "utf8", timeout: 8000, killSignal: "SIGKILL" });
  return r.status === 0;
}

const liveFiles = files.filter(needsLiveApp);

// ── RUNNING SEVERAL AT ONCE ──────────────────────────────────────────────────────────────────────
//
// One at a time cost 1,948s for 847 files on a machine whose other cores sat idle. They are not all
// independent, though, so this does not simply fire them all off: it reads what each file CLAIMS and
// never runs two claimants together.
//
// A claim is a listening PORT (509 files pin one, and 24 numbers are used by more than one file), a
// fixed SCRATCH DIRECTORY, or the LIVE APP — the eleven that drive the developer's own Nova share one
// server which holds global state (the active mod root), so they must not overlap either.
//
// Reading claims beats renumbering two dozen files: no sprawling diff, and a file added later joins its
// group by itself, exactly the way needsLiveApp() already works.
//
// Deliberately over-cautious. A mkdtemp PREFIX counts as a claim even though its random suffix makes it
// safe, and a port counts even where the file only mentions it. That costs a little parallelism and can
// never cost correctness.
//
// NOVA_TEST_CONCURRENCY=1 restores exactly the old one-at-a-time behaviour — the first thing to try if a
// failure ever looks like two tests treading on each other.
const CONCURRENCY = Math.max(1, Number(process.env.NOVA_TEST_CONCURRENCY) ||
  Math.min(8, Math.max(1, (os.cpus() || []).length - 1)));

const claimCache = new Map();
function claimsOf(f) {
  if (claimCache.has(f)) return claimCache.get(f);
  const out = new Set();
  let text = "";
  // Comments stripped for the same reason needsLiveApp does it: a file that only TALKS about a port is
  // not a file that binds one, and matching its prose would serialise it against innocent neighbours.
  try { text = stripJsComments(fs.readFileSync(path.join(dir, f), "utf8")); } catch (_) { /* unreadable → no claims */ }
  for (const m of text.matchAll(/[Pp][Oo][Rr][Tt]\w*\s*=\s*(\d{4,5})\b/g)) out.add("port:" + m[1]);
  for (const m of text.matchAll(/\.listen\(\s*(\d{4,5})/g)) out.add("port:" + m[1]);
  for (const m of text.matchAll(/os\.tmpdir\(\)\s*,\s*"([A-Za-z0-9_.\-]+)"/g)) out.add("dir:" + m[1]);
  if (needsLiveApp(f)) out.add("live-app");
  // The app's own cache directory under AppData is shared by EVERY server this suite starts, and a dozen
  // tests assert on what is in it. One of them clearing or rewriting the cache while another is midway
  // through listing and stat-ing a file is a race, and it showed up exactly that way: ENOENT on a cache
  // file that had just been listed successfully, from a test that passes 26/26 every time on its own.
  //
  // A gate that fails at random is worse than a slow one, so these 13 files take turns. The other 837 run
  // alongside them, which makes this close to free.
  if (/NovaModdingSuite|NOVA_APP_DATA|ideacatalog|api\/cache\/clear/.test(text)) out.add("app-cache");
  claimCache.set(f, out);
  return out;
}

// ── THE SUITE MUST NOT WRITE INTO THE USER'S OWN APP DATA ────────────────────────────────────────────
//
// server.js puts its icon cache and its file-edit backups under NOVA_APP_DATA_DIR, which resolves from
// APPDATA on Windows (XDG_CONFIG_HOME or ~/.config elsewhere). Every test starts a server, so every test
// wrote there. Measured on this machine: 797 cache entries totalling 4.2 GB, and 400 backup files whose
// newest entries are all test fixtures — backups of temp-directory mods that stopped existing seconds
// after they were made, filed alongside backups of the user's real work.
//
// It also made the suite flaky. Those directories are the one piece of global state every test shares, so
// a test that asserts on the cache can be tripped by any of the other 849 rebuilding or invalidating it.
//
// Each run gets its own, removed afterwards. Same reasoning as HOI4_MODS_ROOT in run-e2e.js: a suite that
// writes into the user's real data is one nobody can run casually, and this one is meant to be run often.
//
// This once covered only the tests this runner SPAWNS, and not the eleven that drive a live app — those
// talked to a server on the app's default port that somebody else started, so their writes landed wherever
// THAT process was launched from. Measured at the time: a sandboxed run still produced 6 backups in the
// user's real folder, all from test-research-modifier-depth.js.
//
// That gap is now closed rather than documented: the runner starts its own server below, inside this same
// sandbox, so all 850 are covered. Verified by measurement, not assertion — a full run with the eleven
// ACTIVE left the real folder byte-identical at 400 backups and 1,895 cache entries.
//
// #a-bare-test-run-writes-into-the-real-app-data — a file run BARE, without this runner, gets this same layout from the guard
// at the top of safe-write.js. Add a folder here and add it there: test-a-bare-test-run-stays-out-of-the-real-folders.js
// reads this object and fails until the two agree.
const APPDATA_SANDBOX = fs.mkdtempSync(path.join(os.tmpdir(), "nova-suite-appdata-"));
const childEnv = Object.assign({}, process.env, {
  APPDATA: APPDATA_SANDBOX,            // Windows
  XDG_CONFIG_HOME: APPDATA_SANDBOX,    // Linux
  NOVA_APP_DATA_DIR: APPDATA_SANDBOX,  // honoured directly if server.js ever reads it
  // #tests-wrote-into-the-real-dot-nova — the three above cover the icon cache and the file backups, and
  // NONE of them covers os.homedir(). map-data.js keeps its per-mod stores under ~/.nova: a whole-map
  // baseline is 2,137 files for Millennium Dawn, and the map's "Delete map" snapshot is another 1,500. Every
  // test exercising either wrote them into the user's REAL home and relied on its own finally block to take
  // them back out — one thrown assertion away from leaving thousands of files behind, in the folder holding
  // the user's actual saved baselines.
  NOVA_HOME_DIR: APPDATA_SANDBOX,
  // #the-suite-wrote-into-the-hoi4-user-folder — none of the above covers Documents/Paradox Interactive/Hearts of Iron IV.
  // test-all-endpoints.js GETs /api/diag/hoi4, which writes nova_diagnostics.txt into that folder: every run rewrote the
  // owner's real copy (measured 2026-09-15, its "collected:" line matching a test run). server.js now takes this as THE
  // folder, and its write guard keeps refusing the real one as well.
  HOI4_USER_DIR: path.join(APPDATA_SANDBOX, "hoi4-user"),
  // #two-documents-folders — and "where Windows keeps Documents", which main.js hands server.js under Electron. A test that
  // drops HOI4_USER_DIR asks the launcher's folder next, and an inherited real answer would name the owner's real one.
  NOVA_DOCUMENTS_DIR: path.join(APPDATA_SANDBOX, "Documents"),
});
try { fs.mkdirSync(childEnv.HOI4_USER_DIR, { recursive: true }); } catch (_) { /* a missing folder names none: nothing is written */ }

// ── …AND THE ELEVEN GET THEIR OWN SERVER, SO THEY CANNOT REACH THE USER'S NOVA ───────────────────────
//
// Those eleven read `process.env.NOVA_PORT` and fell back to 47821, so until then they drove whatever happened to be
// listening on Nova's default port. That is nondeterministic (they run only if something is up) and unsafe
// (that something may be the user's own window, with their mod loaded). They also escaped the sandbox
// above, because their writes happen inside a server THIS RUNNER DID NOT START — measured as 6 backups
// landing in the real folder on an otherwise sandboxed run.
//
// server.js honours `process.env.PORT`, so the answer is simply to start one ourselves, with the sandboxed
// environment, and point NOVA_PORT at it. Now they always run, always in the sandbox, and never touch a
// window the user has open. An explicit NOVA_PORT still wins, for deliberately testing against a real app.
let liveServer = null;
// ⛔ #the-server-must-have-nothing-else-to-do — started as main.js starts the app's own (startServer with deferWarm), through
// testlib-live-server.js, NOT as `node server.js`: that one warms its caches in the process that answers, for over a minute
// on a fresh sandbox (which every run's is), and a live test scheduled inside that window met the loading overlay over its
// clicks — undo-live failed 4 cold runs in 5 on a warming server (testlib-live-server.js's header has the numbers).
function startOwnLiveServer() {
  const child = spawn(process.execPath, [path.join(dir, "testlib-live-server.js"), "--serve-as-the-app-does"], {
    stdio: ["ignore", "ignore", "pipe"],
    env: Object.assign({}, childEnv, { PORT: String(LIVE_PORT) }),
  });
  let stderr = "";
  child.stderr.on("data", (d) => { stderr += d.toString(); });
  child.on("error", () => {});
  // Poll rather than trust a fixed sleep: a cold cache makes first boot much slower than a warm one.
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      console.log(`  ⚠ the suite's own server exited early (code ${child.exitCode}) — ${liveFiles.length} live-app tests will skip.`);
      if (stderr.trim()) console.log("    " + stderr.trim().split("\n")[0].slice(0, 160));
      return null;
    }
    if (liveAppReachable(LIVE_PORT)) return child;
  }
  console.log(`  ⚠ the suite's own server did not answer on ${LIVE_PORT} within 60s — ${liveFiles.length} live-app tests will skip.`);
  try { child.kill(); } catch (_) {}
  return null;
}

let liveUp = true;
if (liveFiles.length) {
  if (LIVE_PORT_EXPLICIT) {
    liveUp = liveAppReachable(LIVE_PORT);
    // Warn in the direction that matters. Silence used to mean "about to drive your app", which is backwards.
    if (liveUp) {
      console.log(`  ⚠ NOVA_PORT=${LIVE_PORT} was set, so ${liveFiles.length} live-app tests will drive THAT app.`);
      console.log("    If it is your own Nova window, close it first — this can change its active mod.");
    } else {
      console.log(`  ⓘ nothing is answering on 127.0.0.1:${LIVE_PORT} — skipping ${liveFiles.length} tests that drive it.`);
    }
  } else {
    liveServer = startOwnLiveServer();
    liveUp = !!liveServer;
    if (liveUp) {
      childEnv.NOVA_PORT = String(LIVE_PORT);
      console.log(`  ⓘ started a sandboxed server on 127.0.0.1:${LIVE_PORT} for ${liveFiles.length} live-app tests.`);
      // If it dies partway through, every live-app test after that point fails for one reason that has
      // nothing to do with the code under test. Say so once, rather than leaving eleven identical mysteries.
      // stopOwnLiveServer() nulls the handle first, so a normal shutdown stays quiet.
      liveServer.on("exit", (code, sig) => {
        if (liveServer) console.log(`  ⚠ the suite's own server exited MID-RUN (code ${code}${sig ? ", " + sig : ""}) — live-app tests from here on will fail for that reason, not their own.`);
      });
    }
  }
}

function stopOwnLiveServer() {
  if (!liveServer) return;
  try { liveServer.kill(); } catch (_) {}
  liveServer = null;
}
// A killed or crashed runner must not leave a server squatting a port — that is exactly how a stale
// `node server.js` once held Nova's default port for eight hours and broke the user's own launch.
process.on("exit", stopOwnLiveServer);
process.on("SIGINT", () => { stopOwnLiveServer(); process.exit(130); });
process.on("SIGTERM", () => { stopOwnLiveServer(); process.exit(143); });

// ⛔ A RUNNER THAT DIES SILENTLY IS INDISTINGUISHABLE FROM A FAILING TEST.
//
// Seen once on 2026-08-29: exit code 1, 555 files passed, 0 failed, and then nothing — no summary line, no
// error, no stack. It did not reproduce on the next run (855/855, exit 0), so it was a one-off. That is
// exactly why this is here: the next one-off has to leave evidence, or somebody spends an hour re-running a
// suite to find out what happened.
//
// Node exits 1 on an unhandled rejection and prints to stderr, which is where the output was going — so a
// silent exit 1 means either the message was lost or the process was killed outright. Both are worth saying
// out loud, and neither should be mistaken for "a test failed".
const crashed = (kind) => (err) => {
  try { stopOwnLiveServer(); } catch (_) {}
  console.log("");
  console.log("=".repeat(78));
  console.log(`THE RUNNER ITSELF CRASHED (${kind}) — this is NOT a test failure.`);
  console.log("Nothing below this point ran, and the summary line never printed. Re-run before");
  console.log("concluding anything about the suite; if it repeats, the runner is the bug.");
  console.log("=".repeat(78));
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
};
process.on("uncaughtException", crashed("uncaughtException"));
process.on("unhandledRejection", crashed("unhandledRejection"));

let passed = 0, failed = 0, skipped = 0, skippedLive = 0, timedOut = 0;
// #a-static-port-inside-the-ephemeral-range — files re-run once because the OS gave their port away. Named
// in the summary rather than swallowed: a retry that nobody is told about is how a real, worsening flake
// hides until it fails twice in a row and looks like a new bug.
const portClashes = [];
const failures = [];
// #an-engine-trace-pinned-to-a-build-that-is-gone-reads-as-a-pass — A SKIP INSIDE A PASSING FILE IS AS INVISIBLE
// AS A SKIPPED FILE ONCE WAS. The summary already refuses to let a skipped FILE read as a pass, for exactly the
// reason in the note further down. It could not see the other half: a file that runs, passes, and quietly did not
// execute one of its sections. Measured 2026-09-23: Steam replaced hoi4.exe 1.19.2 with 1.19.3 on 09-17, and from
// that moment TWELVE files that read the engine at exact virtual addresses gated themselves off and kept reporting
// green — including both of the files that hold this project to "a map message claims only what the engine shows".
// Nothing in a full run said a word. Collected here and named in the summary, the same way and for the same reason.
const inFileSkips = [];
const t0 = Date.now();

// Skips are decided up front and in file order, so they read exactly as they always did.
const queue = [];
for (const f of files) {
  if (!runRisky && AV_RISKY[f]) {
    skipped++;
    console.log(`  ⊘ ${f}  (skipped — ${AV_RISKY[f]})`);
    continue;
  }
  if (!liveUp && needsLiveApp(f)) {
    skipped++; skippedLive++;
    console.log(`  ⊘ ${f}  (skipped — needs Nova answering on 127.0.0.1:${LIVE_PORT})`);
    continue;
  }
  queue.push(f);
}

// A result is reported exactly as it always was. Only the ORDER results arrive in changes, which is why
// the FAILED list at the end is sorted rather than left in completion order.
function report(f, status, wasTimeout, output) {
  if (!wasTimeout && status === 0) {
    passed++;
    console.log(`  ✓ ${f}`);
    // A section that did not run: a line whose first word is a skip word, in any of the forms the tests use —
    // "SKIP …", "SKIPPED — …", "(skipped — …)", "skip  (…)" (testlib-skip-line.js). Anchored at the line start so a
    // test's own PROSE about skipping is not counted, and the closing summary line ("=== … 1 SKIPPED …") does not
    // match because it does not begin with the word. It heard only "SKIP" in capitals until 2026-11-04, and 67 files
    // said it another way. #a-skip-the-runner-cannot-hear-reads-as-a-pass
    const sk = String(output || "").split(/\r?\n/).filter((l) => SKIP_LINE.test(l));
    if (sk.length) inFileSkips.push({ file: f, n: sk.length, why: skipWhy(sk[0]) });
  } else if (wasTimeout) {
    // A killed child reports no exit code. Name it, or a stuck test reads as an ordinary failure and the
    // next person goes looking for a bug in the test instead of for whatever it was waiting on.
    failed++; timedOut++;
    failures.push(f);
    console.log(`  ✗ ${f}  (TIMED OUT after ${(TEST_TIMEOUT_MS / 1000).toFixed(0)}s — killed, suite continued)`);
  } else {
    failed++;
    failures.push(f);
    console.log(`  ✗ ${f}  (exit ${status})`);
    // Surface the tail of the failing output so the failure is actionable from the runner alone.
    const out = String(output || "").trimEnd().split("\n");
    for (const line of out.slice(-12)) console.log(`      ${line}`);
  }
}

// #a-static-port-inside-the-ephemeral-range — A PORT COLLISION IS NOT A TEST FAILURE.
//
// The scheduler already guarantees two tests that CLAIM the same port never run together. What it cannot
// control is the operating system: Windows hands out ephemeral ports from 49152 upward, and this suite has
// static ports inside that range, so a test that calls listen(0) can be given the exact port another test
// is about to bind. The victim dies with EADDRINUSE before running a single check.
//
// Measured over one night's work: twice in eight full runs, on two unrelated files (53145 here, and a
// `TypeError: fetch failed` in test-modmgmt-security.js from the same cause), each passing when run alone —
// the signature CLAUDE.md warns costs an hour of looking for a bug that is not there.
//
// So the runner re-runs that one file, ONCE, and says so. Retrying is safe precisely because it is scoped to
// the OS's own message: an EADDRINUSE means the child never got to run, so there is no verdict to launder.
// Anything else — a real assertion failure, a timeout, a crash — is reported as it always was.
const PORT_CLASH = /EADDRINUSE|address already in use/i;

function spawnOnce(f) {
  return new Promise((done) => {
    const child = spawn(process.execPath, [path.join(dir, f)], { stdio: ["ignore", "pipe", "pipe"], env: childEnv });
    let out = "";
    child.stdout.on("data", (d) => { out += d; });
    child.stderr.on("data", (d) => { out += d; });
    // The same deadline as before, and still the reason no single file can stop the suite.
    let killed = false;
    const timer = setTimeout(() => { killed = true; try { child.kill("SIGKILL"); } catch (_) {} }, TEST_TIMEOUT_MS);
    let settled = false;
    const finish = (status) => {
      if (settled) return;   // close and error can both fire
      settled = true;
      clearTimeout(timer);
      done({ status, killed, out });
    };
    child.on("close", (code) => finish(code));
    child.on("error", (e) => { out += "\n" + ((e && e.message) || String(e)); finish(1); });
  });
}

async function runOne(f) {
  let r = await spawnOnce(f);
  if (r.status !== 0 && !r.killed && PORT_CLASH.test(r.out)) {
    portClashes.push(f);
    console.log(`  ↻ ${f}  (port already in use — the OS handed another test its port; re-running once)`);
    r = await spawnOnce(f);
  }
  report(f, r.status, r.killed, r.out);
}

async function runAll() {
  const held = new Set();
  let active = 0;
  await new Promise((allDone) => {
    const pump = () => {
      if (!queue.length && active === 0) { allDone(); return; }
      for (let i = 0; i < queue.length && active < CONCURRENCY; i++) {
        const f = queue[i];
        const claims = claimsOf(f);
        let blocked = false;
        for (const c of claims) if (held.has(c)) { blocked = true; break; }
        if (blocked) continue; // someone running holds its port, its scratch dir, or the live app
        queue.splice(i, 1); i--;
        active++;
        for (const c of claims) held.add(c);
        runOne(f).then(() => {
          for (const c of claims) held.delete(c);
          active--;
          pump();
        });
      }
      // Finding nothing startable is fine: a finishing test releases its claims and pumps again. It cannot
      // deadlock, because with active === 0 nothing is held and every queued file is therefore startable.
    };
    pump();
  });
}

runAll().then(() => {

// Ours, made by mkdtemp this run, so removing it cannot touch anything of the user's.
try { fs.rmSync(APPDATA_SANDBOX, { recursive: true, force: true }); } catch (_) {}

const secs = ((Date.now() - t0) / 1000).toFixed(1);
const ran = files.length - skipped;
// The headline must carry the skip count, not just the pass count.
//
// A skipped file prints one line among hundreds and is then absent from the summary, because the
// denominator here is the number that RAN. So a run covering 830 of 843 files printed "830/830 test files
// passed" — visually identical to a run that covered all 843. That matters more than it sounds: a back-out
// control that stops producing a fixture makes its test SKIP rather than fail, and a skip that reads as a
// pass is how a broken guard gets certified as working.
console.log(`\n${passed}/${ran} test files passed in ${secs}s` +
  (skipped ? ` — ${skipped} of ${files.length} were SKIPPED and did not run.` : "."));
if (skipped - skippedLive) console.log(`${skipped - skippedLive} skipped as antivirus-risky — re-run with NOVA_RUN_AV_RISKY=1 to include them.`);
if (portClashes.length) {
  console.log(`${portClashes.length} file(s) were re-run once after the OS gave their port to another test: ${portClashes.join(", ")}.`);
  console.log("  This is #a-static-port-inside-the-ephemeral-range, not a fault in those files. If one starts");
  console.log("  appearing every run, move its port out of 49152+ rather than raising the retry count.");
}
if (skippedLive) console.log(`${skippedLive} skipped because nothing answered on 127.0.0.1:${LIVE_PORT}${LIVE_PORT_EXPLICIT ? " (NOVA_PORT was set explicitly)" : " — the suite's own server did not start"}.`);
// …and the sections that did not run inside files that DID. A green tick beside a file whose engine section is
// dormant is the same lie as a green summary over a skipped file, so it is named the same way.
if (inFileSkips.length) {
  const n = inFileSkips.reduce((t, x) => t + x.n, 0);
  console.log(`⚠ ${n} check group(s) were SKIPPED INSIDE ${inFileSkips.length} file(s) that otherwise passed — those ticks cover less than they look like:`);
  for (const x of inFileSkips.slice().sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : 0))) {
    console.log(`    ${x.file}${x.n > 1 ? ` (${x.n})` : ""} — ${x.why.slice(0, 150)}`);
  }
}
if (timedOut) console.log(`${timedOut} timed out after ${(TEST_TIMEOUT_MS / 1000).toFixed(0)}s and were killed; the suite ran to the end regardless.`);
if (failed) {
  // Sorted: results arrive in completion order now, and a stable list is easier to compare run to run.
  console.log(`FAILED: ${failures.slice().sort().join(", ")}`);
  process.exit(1);
}
// "All green" must never stand on its own when part of the suite did not run.
const inFileSkipCount = inFileSkips.reduce((t, x) => t + x.n, 0);
console.log(skipped
  ? `All green — but only ${ran} of ${files.length} files ran; ${skipped} were skipped (listed above)${inFileSkipCount ? `, and ${inFileSkipCount} check group(s) inside passing files did not run either` : ""}.`
  : inFileSkipCount
    ? `All green — but ${inFileSkipCount} check group(s) inside ${inFileSkips.length} passing file(s) did not run (listed above).`
    : "All green.");
process.exit(0);

});
