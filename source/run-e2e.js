#!/usr/bin/env node
// Runs the e2e-*.js suite — the tests that drive the REAL program.
//
//   node run-e2e.js              every e2e file
//   node run-e2e.js research     only files whose name contains "research"
//
// WHY THIS DID NOT EXIST, AND WHY IT MATTERS
//
// There are 92 of these. They open real pages, click real buttons, build a real mod and read it back — and
// nothing ran them as a group. Each was reachable only through its own npm script, so in practice they ran
// approximately never. That is the opposite of where the value is: nearly every defect found by hand this
// week lived in the running program, not in the source, and was invisible to the 847 tests that only read
// files.
//
// The reason nobody built this runner is that four of those files wrote into the user's REAL
// Documents/Paradox Interactive/Hearts of Iron IV/mod directory — creating mods there, switching the active
// mod, deleting directories inside it, and leaving the results behind. Running all 92 was therefore not
// something anyone could do casually, so it was never done at all.
//
// Those four now honour HOI4_MODS_ROOT, which server.js has always honoured. This runner sets it to a fresh
// scratch directory for every child, and — because a promise about the user's files is worth checking
// rather than believing — it LISTS the real mod folder before and after, and says so if anything changed.
//
// ⛔ #a-skip-the-e2e-runner-cannot-hear-reads-as-a-pass — A FILE THAT SAYS IT SKIPPED IS NOT A PASS. Several of these
// decide on their own not to run (the Move-country tool is disabled by design; Electron cannot launch here; the splash never
// handed over) and still exit 0. This runner looked at the exit code alone, so each read "✓ … 1/1 passed … All green" — the
// lie run-tests.js stopped telling in 84446640. It now hears the same lines (testlib-skip-line.js, the one definition) and
// counts such a file as SKIPPED, out of the pass count, named in the summary. A failure is still a failure.
// test-an-e2e-file-that-says-it-skipped-is-not-a-pass.js runs a copy of this file over fixtures and holds it to that.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");

const dir = __dirname;
const filter = (process.argv[2] || "").trim();

const files = fs.readdirSync(dir)
  .filter((f) => /^e2e-.*\.js$/.test(f))
  .filter((f) => !filter || f.includes(filter))
  .sort((a, b) => a.localeCompare(b));

if (!files.length) {
  console.log(filter ? `No e2e-*.js files match "${filter}".` : "No e2e-*.js files found.");
  process.exit(0);
}

// The same family the unit runner refuses to touch by default. Repeated rapid re-saves of one file read as
// ransomware to behavioural antivirus; on this machine that froze the desktop and quarantined the test file
// itself. The blast radius is not limited to the file launched, so the whole family stays out.
const AV_RISKY = {
  "e2e-spirit-icons.js": "the spirit family's repeat-save shape; behavioural antivirus has killed this machine over it",
};
const runRisky = process.env.NOVA_RUN_AV_RISKY === "1";

// TWO, not more. 90 of the 92 launch a real browser, so the ceiling here counts browsers, not scripts.
//
// The first full run used four and 87 of 91 passed — but all four failures were the heaviest browser tests,
// timing out on selectors after 5s and 15s. Run on its own, e2e-research-test.js does not fail at all; it
// detects the environment and skips cleanly. So those were not broken tests, they were starved ones.
//
// A flaky gate is worse than a slow gate. Flakiness teaches people to re-run instead of to look, and then
// to ignore it — which is precisely how these 92 came to have no runner and never execute. Reliability wins
// here; NOVA_E2E_CONCURRENCY raises it for anyone who wants the speed and can accept the noise.
const CONCURRENCY = Math.max(1, Number(process.env.NOVA_E2E_CONCURRENCY) ||
  Math.min(2, Math.max(1, (os.cpus() || []).length - 1)));
const TIMEOUT_MS = Number(process.env.NOVA_E2E_TIMEOUT_MS || 600000);

// ── The user's real game folders: located, so they can be watched ─────────────────────────────────────
// ⛔ #two-documents-folders — EVERY copy, and the user folder as well as its mod\. After Documents moves (OneDrive's backup
// turned on or off) there are two user folders, each with a mod\, and the launcher reads the one Windows now calls Documents.
// This watched only the first one found — OneDrive — which on the owner's machine (2026-09-29) was no longer the one read.
function registryDocumentsDir() {
  if (process.platform !== "win32") return "";
  try {
    const out = require("child_process").execFileSync("reg.exe",
      ["query", "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\User Shell Folders", "/v", "Personal"],
      { encoding: "utf8", timeout: 5000, windowsHide: true, stdio: ["ignore", "pipe", "ignore"] });
    const m = /^\s*Personal\s+REG_(?:EXPAND_)?SZ\s+(.+?)\s*$/m.exec(String(out || ""));
    if (!m) return "";
    const d = m[1].replace(/%([^%]+)%/g, (all, name) => {
      const k = Object.keys(process.env).find((x) => x.toUpperCase() === name.toUpperCase());
      return k && process.env[k] ? process.env[k] : all;
    });
    return path.isAbsolute(d) && !d.includes("%") ? d : "";
  } catch (_) { return ""; }
}
function realGameFolders() {
  const home = process.env.USERPROFILE || os.homedir() || "";
  const od = process.env.OneDrive || (home ? path.join(home, "OneDrive") : "");
  const docs = [od && path.join(od, "Documents"), home && path.join(home, "Documents"), home && path.join(home, "OneDrive", "Documents"), registryDocumentsDir()];
  const out = [];
  for (const d of docs.filter(Boolean)) {
    const user = path.join(d, "Paradox Interactive", "Hearts of Iron IV");
    for (const p of [path.join(user, "mod"), user]) {
      if (fs.existsSync(p) && !out.some((x) => path.resolve(x).toLowerCase() === path.resolve(p).toLowerCase())) out.push(p);
    }
  }
  return out;
}
const REAL_FOLDERS = realGameFolders();
const listOf = (p) => { try { return fs.readdirSync(p).sort().join("\n"); } catch (_) { return ""; } };
const realBefore = new Map(REAL_FOLDERS.map((p) => [p, listOf(p)]));

// ── A scratch mods root, so nothing reaches the real one ──────────────────────────────────────────────
const SCRATCH = fs.mkdtempSync(path.join(os.tmpdir(), "nova-e2e-mods-"));
// A fresh mods folder means every run is a FIRST launch, which builds the icon atlas and the mod's caches —
// the splash itself says that "can take a minute or two". The default five-second selector wait was written
// against the user's own warm folder and is far too short for that, so raise it for the whole suite. This is
// also what a new contributor and a CI machine get, so waiting properly is the portable behaviour, not a
// workaround. Files that do not read it are unaffected.
// ── A scratch APP DATA root, for the same reason ──────────────────────────────────────────────────────
// server.js keeps its icon cache and its file-edit backups under NOVA_APP_DATA_DIR, resolved from APPDATA.
// Every e2e file starts a server, so without this every e2e file reads and writes the user's own
// AppData/Roaming/NovaModdingSuite — 92 servers, concurrently, in the directory the user's real Nova app is
// also using.
//
// This is not hypothetical. run-tests.js got this sandbox first, and this runner did not adopt it, which is
// the exact shape this project's notes call the dominant bug here: the fix already exists next door and one
// caller never took it. On 2026-08-29 the user launched Nova while this suite was running and got
// "Failed to start Focus Editor: ERR_FAILED (-2)". Two things were true at once — a stale `node server.js`
// was squatting the default port, and this suite was churning the same cache the app was warming. The port
// was the proven cause; this was the unproven one, and it is unacceptable either way, because a test suite
// must never be able to reach into the app the user is trying to use.
//
// #a-bare-test-run-writes-into-the-real-app-data — an e2e file run BARE gets this same set of folders from the guard at the
// top of safe-write.js; test-a-bare-test-run-stays-out-of-the-real-folders.js reads this object and fails until they agree.
const APPDATA_SANDBOX = fs.mkdtempSync(path.join(os.tmpdir(), "nova-e2e-appdata-"));
const childEnv = Object.assign({}, process.env, {
  HOI4_MODS_ROOT: SCRATCH,
  APPDATA: APPDATA_SANDBOX,            // Windows
  XDG_CONFIG_HOME: APPDATA_SANDBOX,    // Linux
  NOVA_APP_DATA_DIR: APPDATA_SANDBOX,  // honoured directly if server.js ever reads it
  // #tests-wrote-into-the-real-dot-nova — none of the three above covers os.homedir(), and map-data.js
  // keeps its per-mod stores (whole-map baselines, "Delete map" snapshots) under ~/.nova. Thousands of
  // files, in the folder that holds the user's own saved baselines. Same override the unit runner sets.
  NOVA_HOME_DIR: APPDATA_SANDBOX,
  // #the-suite-wrote-into-the-hoi4-user-folder — and the HOI4 user folder, where GET /api/diag/hoi4 writes its report. Same
  // override the unit runner sets.
  HOI4_USER_DIR: path.join(APPDATA_SANDBOX, "hoi4-user"),
  // #two-documents-folders — and "where Windows keeps Documents", the launcher's folder's other input (unit runner likewise).
  NOVA_DOCUMENTS_DIR: path.join(APPDATA_SANDBOX, "Documents"),
  NOVA_E2E_CLICK_TIMEOUT_MS: process.env.NOVA_E2E_CLICK_TIMEOUT_MS || "45000",
});
try { fs.mkdirSync(childEnv.HOI4_USER_DIR, { recursive: true }); } catch (_) { /* a missing folder names none: nothing is written */ }

console.log(`Running ${files.length} e2e file(s), up to ${CONCURRENCY} at a time.`);
console.log(`  scratch mods root: ${SCRATCH}`);
for (const p of REAL_FOLDERS) console.log(`  watching (must not change): ${p}`);
if (!REAL_FOLDERS.length) console.log("  ⓘ no real Paradox mod folder found — nothing to watch");

// ── Claims, so two files never collide ────────────────────────────────────────────────────────────────
// Identical reasoning to run-tests.js: a listening port, a fixed scratch directory, or the live app can
// each only be held by one file at a time. Over-cautious on purpose — a mkdtemp prefix counts as a claim
// even though its random suffix makes it safe.
const { stripJsComments } = require("./testlib-strip-comments.js");
const { SKIP_LINE, skipWhy } = require("./testlib-skip-line.js");
const claimCache = new Map();
function claimsOf(f) {
  if (claimCache.has(f)) return claimCache.get(f);
  const out = new Set();
  let text = "";
  try { text = stripJsComments(fs.readFileSync(path.join(dir, f), "utf8")); } catch (_) { /* unreadable → no claims */ }
  for (const m of text.matchAll(/[Pp][Oo][Rr][Tt]\w*\s*=\s*(\d{4,5})\b/g)) out.add("port:" + m[1]);
  for (const m of text.matchAll(/\.listen\(\s*(\d{4,5})/g)) out.add("port:" + m[1]);
  for (const m of text.matchAll(/os\.tmpdir\(\)\s*,\s*"([A-Za-z0-9_.\-]+)"/g)) out.add("dir:" + m[1]);
  // Every one of these writes into the shared scratch mods root, and several use the same fixture names
  // (e2e_test_mod, nova_e2e_demo). Treat that root as a single claim: correctness first, speed second.
  out.add("mods-root");
  // THE MAP PAGE IS A CLAIM OF ITS OWN. 42 of the 92 open map.html, and it is by far the heaviest thing
  // Nova draws — 1081 states and 439 countries parsed and rendered per test. Two of those at once starved
  // each other even at concurrency 2: e2e-map-supply timed out on a 15s waitForFunction in two runs of
  // three, and e2e-map-country-color lost a status-text race in one of three. Each passes alone.
  //
  // Intermittent failures are the worst thing a gate can do — they teach people to re-run instead of to
  // look, and then to ignore it. So only one map test runs at a time, while the other 50 files carry on
  // beside it. The map chain costs about as long as the whole suite already did, so this is close to free.
  if (/map\.html/.test(text)) out.add("map-page");
  claimCache.set(f, out);
  return out;
}

let passed = 0, failed = 0, skipped = 0, timedOut = 0;
const failures = [];
// Files that exited 0 but printed a skip line: they did not run in full, so they are not passes. Kept apart from `skipped`
// (never started: antivirus-risky) so the summary can say which is which.
const saidSkip = [];
const t0 = Date.now();

const queue = [];
for (const f of files) {
  if (!runRisky && AV_RISKY[f]) {
    skipped++;
    console.log(`  ⊘ ${f}  (skipped — ${AV_RISKY[f]})`);
    continue;
  }
  queue.push(f);
}

function report(f, status, wasTimeout, output) {
  if (!wasTimeout && status === 0) {
    // #a-skip-the-e2e-runner-cannot-hear-reads-as-a-pass — exit 0 and a line whose first word is a skip word ("SKIP — …",
    // "SKIP: …", "(skipped — …)", …: testlib-skip-line.js) is a file that did not run in full. Heard only on a passing exit:
    // a file that failed is reported as failed whatever else it printed.
    const sk = String(output || "").split(/\r?\n/).filter((l) => SKIP_LINE.test(l));
    if (sk.length) {
      saidSkip.push({ file: f, n: sk.length, why: skipWhy(sk[0]) });
      console.log(`  ⊘ ${f}  (SKIPPED — it exited 0 but said: ${skipWhy(sk[0]).slice(0, 150)}${sk.length > 1 ? ` (+${sk.length - 1} more)` : ""})`);
      return;
    }
    passed++;
    console.log(`  ✓ ${f}`);
  } else if (wasTimeout) {
    failed++; timedOut++;
    failures.push(f);
    console.log(`  ✗ ${f}  (TIMED OUT after ${(TIMEOUT_MS / 1000).toFixed(0)}s — killed, suite continued)`);
  } else {
    failed++;
    failures.push(f);
    console.log(`  ✗ ${f}  (exit ${status})`);
    // Show the lines that actually FAILED, then the tail — not the tail alone.
    //
    // A blind tail is nearly useless for these. They print a line per assertion and a request log besides,
    // so the one line naming what broke scrolls past long before the end: the first real run of this suite
    // reported "e2e-continuous-focus: 1 FAILED" with fourteen lines of passing assertions above it and no
    // clue which one. The failures are what you came for, so print those first and label both halves.
    const out = String(output || "").trimEnd().split("\n");
    const bad = out.filter((l) => /^\s*(✗|FAIL\b|✘)|\bFAILED\b|Error:|error:/.test(l) && !/\[API REQUEST\]/.test(l));
    if (bad.length) {
      console.log("      ── what failed ──");
      for (const line of bad.slice(0, 12)) console.log(`      ${line}`);
      if (bad.length > 12) console.log(`      … and ${bad.length - 12} more`);
      console.log("      ── last lines ──");
    }
    for (const line of out.slice(-10)) console.log(`      ${line}`);
  }
}

function runOne(f) {
  return new Promise((done) => {
    const child = spawn(process.execPath, [path.join(dir, f)], { stdio: ["ignore", "pipe", "pipe"], env: childEnv });
    let out = "";
    child.stdout.on("data", (d) => { out += d; });
    child.stderr.on("data", (d) => { out += d; });
    let killed = false;
    const timer = setTimeout(() => { killed = true; try { child.kill("SIGKILL"); } catch (_) {} }, TIMEOUT_MS);
    let settled = false;
    const finish = (status) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      report(f, status, killed, out);
      done();
    };
    child.on("close", (code) => finish(code));
    child.on("error", (e) => { out += "\n" + ((e && e.message) || String(e)); finish(1); });
  });
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
        if (blocked) continue;
        queue.splice(i, 1); i--;
        active++;
        for (const c of claims) held.add(c);
        runOne(f).then(() => {
          for (const c of claims) held.delete(c);
          active--;
          pump();
        });
      }
    };
    pump();
  });
}

runAll().then(() => {
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  // The denominator is the files that RAN IN FULL: passed + failed. A skip of either kind is outside it, and the headline
  // carries the skip count, so "1/1 passed" can no longer stand for a run in which the one file skipped itself.
  const skippedAll = skipped + saidSkip.length;
  const ran = files.length - skippedAll;
  console.log(`\n${passed}/${ran} e2e file(s) passed in ${secs}s` +
    (skippedAll ? ` — ${skippedAll} of ${files.length} were SKIPPED and are not counted as passes.` : "."));
  if (skipped) console.log(`${skipped} skipped as antivirus-risky — re-run with NOVA_RUN_AV_RISKY=1 to include them.`);
  if (saidSkip.length) {
    console.log(`⊘ ${saidSkip.length} file(s) exited 0 but SAID THEY SKIPPED — they did not run in full, so they are not passes:`);
    for (const x of saidSkip.slice().sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : 0))) {
      console.log(`    ${x.file}${x.n > 1 ? ` (${x.n} skip lines)` : ""} — ${x.why.slice(0, 150)}`);
    }
  }
  if (timedOut) console.log(`${timedOut} timed out after ${(TIMEOUT_MS / 1000).toFixed(0)}s and were killed; the suite ran to the end regardless.`);

  // ── The promise, checked ────────────────────────────────────────────────────────────────────────────
  // Nothing here should have gone near the user's own mods. Verified rather than asserted, because the
  // cost of being wrong is somebody's mod folder. Reported, never cleaned up automatically: deleting
  // anything from a live mod directory is exactly how 984 files were lost here once.
  let leaked = "";
  for (const p of REAL_FOLDERS) {
    const after = listOf(p);
    const was = realBefore.get(p) || "";
    if (after === was) continue;
    const before = new Set(was.split("\n").filter(Boolean));
    const added = after.split("\n").filter((x) => x && !before.has(x));
    if (!added.length) continue;
    leaked += (leaked ? "; " : "") + added.join(", ");
    console.log(`\n⛔ A REAL GAME FOLDER CHANGED — new entries: ${added.join(", ")}`);
    console.log(`   ${p}`);
  }
  if (leaked) {
    console.log("   Something bypassed HOI4_MODS_ROOT. Nothing has been deleted; look before removing anything.");
  } else if (REAL_FOLDERS.length) {
    console.log(`✓ the real Paradox folders are unchanged (${REAL_FOLDERS.length} watched).`);
  }

  // Both scratch roots are ours and were made by mkdtemp this run, so removing them cannot touch a real mod
  // or the user's own app data.
  try { fs.rmSync(SCRATCH, { recursive: true, force: true }); } catch (_) {}
  try { fs.rmSync(APPDATA_SANDBOX, { recursive: true, force: true }); } catch (_) {}

  if (failed || leaked) {
    console.log(`FAILED: ${failures.slice().sort().join(", ") || "(mod folder changed)"}`);
    process.exit(1);
  }
  // "All green" must never stand on its own when part of the run did not happen — and a run in which NOTHING ran in full
  // is not green at all, only empty. The exit code is unchanged: skips do not fail a run; failures and leaks do (above).
  console.log(!skippedAll
    ? "All green."
    : ran
      ? `All green — but only ${ran} of ${files.length} files ran in full; ${skippedAll} were SKIPPED (listed above).`
      : `Nothing failed — but NOTHING RAN in full: all ${files.length} file(s) were SKIPPED (listed above).`);
  process.exit(0);
});
