// #suite-wedged-by-a-hung-app — ONE UNRESPONSIVE PROCESS STOPPED A 687-FILE SUITE FOREVER.
//
// run-tests.js spawned each test with spawnSync and NO timeout. Eleven tests do not sandbox themselves: they
// drive the developer's own running Nova instance on port 47821 (they read `process.env.NOVA_PORT || 47821`).
// When that app wedged — still LISTENING, never answering — test-research-modifier-depth.js blocked on a
// request that had no deadline, and the suite sat at 526 of 687 indefinitely with no output and no error.
// Everything after it in the alphabet never ran, so a green-or-red answer was simply unavailable.
//
// Two separate faults, and both are worth closing:
//   1. NO TEST MAY WEDGE THE RUNNER. A per-child timeout makes the worst case a single failed file.
//   2. A test that needs an EXTERNAL app should say so and skip when it is not there, the way the two
//      antivirus-risky files already skip — a suite that cannot run those eleven is still a useful suite.
//
// The live tests are detected, not hardcoded: any test naming NOVA_PORT / 47821 needs the outside app. A file
// added later joins the set automatically.
"use strict";
// #a-bare-test-run-writes-into-the-real-app-data — FIRST: run bare, every node child this starts inherits the sandbox.
require("./safe-write.js");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
// ⭐ The classifier below decides what a test IS from its source, so it has to read the source the way the
// engine does — a port named in a comment is prose, not a dependency. Without this, writing
// "never 47821, which is the user's own server" in a comment makes that test look like a live one, and the
// next check (that a live test starts no server of its own) fails on it.
const { stripJsComments } = require("./testlib-strip-comments.js");
const codeOf = (f) => { try { return stripJsComments(fs.readFileSync(path.join(__dirname, f), "utf8")); } catch (_) { return ""; } };

const fails = [];
let checks = 0;
function rec(label, cond, detail) {
  checks++;
  if (cond) console.log("  ok   " + label);
  else {
    fails.push(label);
    console.log("  FAIL " + label + "  -> " + String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 400));
  }
}

const RUNNER = path.join(__dirname, "run-tests.js");
const src = fs.readFileSync(RUNNER, "utf8");

console.log("\n[1. the blast radius] how many tests depend on an app this suite does not start");
{
  const live = fs.readdirSync(__dirname)
    .filter((f) => /^test-.*\.js$/.test(f))
    .filter((f) => /NOVA_PORT|47821/.test(codeOf(f)))
    .filter((f) => f !== path.basename(__filename));
  console.log(`     ${live.length} tests drive the developer's own Nova instance: ${live.slice(0, 4).join(", ")}${live.length > 4 ? ", …" : ""}`);
  rec("there really are tests that need an outside app", live.length >= 5, live);
  // None of them starts a server of its own — that is what makes them dependent rather than merely slow.
  const startsOwn = live.filter((f) => /createApp\(\)\.listen|app\.listen\(/.test(codeOf(f)));
  rec("…and none of them starts its own", startsOwn.length === 0, startsOwn);
}

console.log("\n[2. the mechanism] spawnSync with a timeout really does kill a hung child");
{
  // Prove the fix's mechanism on a child that hangs exactly like the wedged test did — an open handle and
  // no work. Without a timeout this call never returns, which is the whole bug.
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "nova-wedge-"));
  const hang = path.join(tmp, "hang.js");
  fs.writeFileSync(hang, "setInterval(() => {}, 1000);\n", "utf8");
  const t0 = Date.now();
  const r = spawnSync(process.execPath, [hang], { encoding: "utf8", timeout: 3000, killSignal: "SIGKILL" });
  const ms = Date.now() - t0;
  console.log(`     a hanging child returned after ${ms}ms, status=${r.status}, signal=${r.signal}`);
  rec("the child was killed rather than waited on", ms < 15000, ms);
  rec("…and it is reported as a non-success", r.status !== 0, { status: r.status, signal: r.signal });
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) {}
}

console.log("\n[3. the runner] passes a timeout to every child");
{
  // Asserts the GUARANTEE — every child is on a deadline that eventually kills it — not the mechanism.
  // This used to require `spawnSync(…, { timeout: … })` specifically, and broke the day the runner became
  // concurrent and moved to spawn() with its own timer. The property never changed; only the call did. A
  // test that pins the call instead of the promise makes the next correct change look like a regression.
  const deadlineArmed =
    /spawnSync\(process\.execPath, \[path\.join\(dir, f\)\], \{[^}]*timeout:/.test(src) ||   // the old sync form
    /setTimeout\([\s\S]{0,240}?TEST_TIMEOUT_MS\)/.test(src);                                  // the concurrent form
  rec("every child is put on a deadline", deadlineArmed, "nothing bounds how long a child may run");
  rec("…and it kills, so a child ignoring SIGTERM still dies", /killSignal:|kill\("SIGKILL"\)/.test(src), "no hard kill");
  // A timeout that fires must be reported as a timeout, not as a mystery non-zero exit.
  rec("…and a timed-out child is named as such in the output", /timed out|TIMEOUT/i.test(src), "a timeout would read as an ordinary failure");
}

console.log("\n[4. the runner] skips the outside-app tests when the app is not answering");
{
  rec("the runner knows which tests need the outside app", /NOVA_PORT|47821/.test(src), "no notion of the live tests");
  rec("…and pre-flights it rather than discovering it 500 files in", /preflight|preFlight|probeLivePort|liveAppReachable/i.test(src), "no pre-flight");
  rec("…and skips rather than fails when it is down", /skippedLive|skipped — .*(live|not answering)/i.test(src), "no skip path");
  // ⚠️ …and its detector must not catch a test that merely TALKS about the port. This file explains the whole
  // mechanism in prose, and the first detector matched that prose and skipped it along with the real eleven —
  // a self-disabling test. Run the runner's own detector over every test file and check what it selects.
  {
    const m = /const needsLiveApp = \(f\) => \{[\s\S]*?\n\};/.exec(src);
    rec("the detector is findable", !!m, "needsLiveApp not found");
    if (m) {
      // The detector now calls the shared comment scanner, so hand that in too — otherwise it throws for
      // every file, returns false, and this check reports "selects 0 of 694" as though nothing needs the app.
      const { stripJsComments } = require("./testlib-strip-comments.js");
      // eslint-disable-next-line no-new-func
      const detect = Function("fs", "path", "dir", "stripJsComments", `${m[0]} return needsLiveApp;`)(fs, path, __dirname, stripJsComments);
      const all = fs.readdirSync(__dirname).filter((f) => /^test-.*\.js$/.test(f));
      const picked = all.filter(detect);
      console.log(`     the runner's own detector selects ${picked.length} of ${all.length} test files`);
      rec("…it selects the tests that really drive the outside app", picked.length >= 5 && picked.every((f) => /-live\.js$|modifier-depth/.test(f)), picked);
      rec("…and NOT this file, which only describes it", !picked.includes(path.basename(__filename)), picked.filter((f) => f === path.basename(__filename)));
    }
  }
  // The count must still be honest: a skipped file is not a passed file.
  rec("…and skipped files are excluded from the pass count, not counted as passes",
    /files\.length - skipped/.test(src), "skips would inflate the pass total");
}

// #live-test-ignores-nova-port — THE OVERRIDE THE RUNNER ADVERTISES HAS TO ACTUALLY WORK.
//
// Those eleven take their port from the environment, so the override has to be honoured all the way through.
// Two of them read it for the reachability probe and then navigated to a HARDCODED port — so the override
// could not work: with a server elsewhere the probe passed and the navigation went nowhere, and with two
// instances up they silently drove the one nobody asked for.
//
// This matters MORE since 2026-08-29, not less. The runner no longer borrows a port at all — it starts its
// own sandboxed server and sets the variable — so a test that ignores the override does not merely go to the
// wrong server, it escapes the sandbox and lands in whatever the user has running.
//
// It mattered more than a stray constant. Those two are test-research-staging-live.js and
// test-research-undo-live.js — precisely the pair that asserts NOTHING REACHES THE MOD BEFORE SAVE. The one
// invariant a person most wants to check on their own machine was the one they could not run there.
//
// Derived, not listed: the live set is whatever the runner's own detector matches, so a file added later is
// checked the day it appears.
console.log("\n[the live tests] must drive the port they probed");
{
  const dir = __dirname;
  const { stripJsComments } = require("./testlib-strip-comments.js");
  const runner = fs.readFileSync(path.join(dir, "run-tests.js"), "utf8");

  // ⭐ LIFT THE PREDICATE AND THE PORT OUT OF THE RUNNER — do not restate them.
  //
  // Partly one-owner discipline: if the runner changes how it recognises a live test, this follows. But
  // mostly self-preservation. The first draft inlined the runner's regex, which put the literal strings it
  // searches for INTO THIS FILE — so this file started matching the detector, and the two checks above that
  // assert it must NOT (it only describes the live tests) both failed. A check that contains its own needle
  // finds itself. Building the pattern from the runner's source at runtime means the needle is never here.
  const reSrc = (/\/((?:[^/\\\n]|\\.)+)\/\.test\(stripJsComments/.exec(runner) || [])[1];
  rec("the runner's live-test predicate was extracted", !!reSrc, "run-tests.js changed shape — this check is blind");
  // Matched via LIVE_PORT rather than by naming the environment variable, for the same reason as above:
  // spelling that name here would put the detector's own needle back into this file.
  //
  // ⚠️ Deliberately tolerant of the SHAPE of the assignment, matching only "LIVE_PORT = … || <number>".
  // The previous pattern hard-coded `Number(… || N)` and broke the moment the runner stopped borrowing a
  // port and started providing one — a test encoding the old behaviour, which is a documented failure mode
  // on this project. What matters is the fallback number, not the expression that produces it.
  const livePort = (/\bLIVE_PORT = [^;\n]*\|\|\s*(\d{4,5})/.exec(runner) || [])[1];
  rec("…and so was the port it defaults to", !!livePort, "could not read the default port from run-tests.js");

  // ⭐ THE SUITE MUST NOT DEFAULT TO THE PORT THE USER'S OWN NOVA USES.
  //
  // This is the guarantee that did not exist before 2026-08-29. The live tests used to drive whatever was
  // listening on Nova's default port, which meant: they ran only by luck (something had to be up), and when
  // something WAS up it might be the user's own window with their mod loaded — the app holds the active mod
  // root as global state, so a run could switch it underneath them, and its backups landed outside the
  // suite's sandbox entirely (measured: 6 files in the user's real folder on an otherwise clean run).
  //
  // The runner now starts its own sandboxed server instead. Pinning the number here is what stops anyone
  // "simplifying" it back to the default and quietly re-pointing the suite at a live window.
  const appDefaultPort = (/const DEFAULT_PORT = (\d{4,5})/.exec(
    fs.readFileSync(path.join(dir, "server.js"), "utf8")) || [])[1];
  rec("the app's own default port was found in server.js", !!appDefaultPort, appDefaultPort);
  rec("…and the suite does NOT default to it", !!livePort && livePort !== appDefaultPort,
    `suite ${livePort} vs app ${appDefaultPort} — equal means the suite drives the user's window`);
  // A port shared with the test band would collide with the 500-odd files that bind there.
  rec("…nor to anything inside the band the tests themselves bind",
    !!livePort && !(Number(livePort) >= 53400 && Number(livePort) <= 53700), livePort);

  if (reSrc && livePort) {
    const LIVE_RE = new RegExp(reSrc);
    const live = fs.readdirSync(dir).filter((f) => /^test-.*\.js$/.test(f))
      .filter((f) => LIVE_RE.test(stripJsComments(fs.readFileSync(path.join(dir, f), "utf8"))));

    rec("the live-test set is non-empty", live.length >= 10, live.length);
    // CONTROL: the two files that exist to be driven live must be in it, or the predicate is measuring nothing.
    rec("…and holds the ones that assert nothing reaches the mod before Save",
      ["test-research-staging-live.js", "test-research-undo-live.js"].every((f) => live.includes(f)), live);

    // The `|| <port>` fallback is intended. A port baked into a URL is not: that is the line that ignores
    // the override.
    const offenders = [];
    for (const f of live) {
      const code = stripJsComments(fs.readFileSync(path.join(dir, f), "utf8"));
      for (const m of code.matchAll(/["'`]https?:\/\/[^"'`]*?:(\d{4,5})/g)) {
        if (m[1] === livePort) offenders.push(`${f}: ${m[0].slice(0, 60)}`);
      }
    }
    rec("no live test navigates to a baked-in port", offenders.length === 0, offenders);
  }
}

console.log(`\n=== runner cannot wedge: ${checks} checks, ${fails.length} failed ===`);
if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
