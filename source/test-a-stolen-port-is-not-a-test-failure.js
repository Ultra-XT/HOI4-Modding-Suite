// ⛔ #a-static-port-inside-the-ephemeral-range — THE OS HANDS A TEST'S PORT TO ANOTHER TEST.
//
// run-tests.js schedules by what each file CLAIMS, so two tests that bind the same port never run together.
// That guarantee does not extend to the operating system. Windows allocates ephemeral ports from 49152
// upward, this suite has static ports inside that range, and a test calling listen(0) can be handed the
// exact port another test is about to bind. The victim dies with EADDRINUSE before running one check.
//
// Measured over a single night: twice in eight full runs, on two unrelated files — test-walk-caps-below-
// corpus.js (EADDRINUSE on 53145) and test-modmgmt-security.js (TypeError: fetch failed from the same
// cause) — each passing when run alone. That is the exact signature CLAUDE.md warns wastes an hour looking
// for a bug that is not there.
//
// The runner now re-runs such a file ONCE. That is safe because it is scoped to the OS's own message: an
// EADDRINUSE means the child never ran, so there is no verdict being laundered. A real assertion failure, a
// timeout or a crash is reported exactly as before. And the retry is NAMED in the summary — a retry nobody
// is told about is how a worsening flake hides until it fails twice and looks like a new bug.
"use strict";

// #a-bare-test-run-writes-into-the-real-app-data — FIRST: run bare, every node child this starts inherits the sandbox.
require("./safe-write.js");
const fs = require("fs");
const path = require("path");

let pass = 0, fail = 0;
const ok = (c, m, x) => {
  if (c) { pass++; console.log("  ok   " + m); }
  else { fail++; console.log("  FAIL " + m + (x !== undefined ? "   -> " + JSON.stringify(x).slice(0, 300) : "")); }
};

const SRC = fs.readFileSync(path.join(__dirname, "run-tests.js"), "utf8");

console.log("\n-- the retry exists, and is scoped to a port clash --");
{
  const m = /const PORT_CLASH = (\/.*\/[a-z]*)/.exec(SRC);
  ok(!!m, "run-tests.js declares what a port clash looks like", m && m[1]);
  if (m) {
    // Behavioural: the pattern must match the messages the OS actually produces, and nothing else.
    const re = new RegExp(m[1].slice(1, m[1].lastIndexOf("/")), m[1].slice(m[1].lastIndexOf("/") + 1));
    ok(re.test("Error: listen EADDRINUSE: address already in use :::53145"),
      "…it matches Node's EADDRINUSE text");
    ok(re.test("code: 'EADDRINUSE'"), "…and the bare code as it appears in a dumped error object");
    ok(!re.test("AssertionError: expected 3 to equal 2"), "…and NOT an ordinary assertion failure");
    ok(!re.test("TIMED OUT after 600s"), "…and not a timeout");
  }
}

console.log("\n-- it re-runs at most once, and only for that --");
{
  ok(/async function runOne\(f\)/.test(SRC), "runOne awaits its spawns", null);
  const body = (() => {
    const a = SRC.indexOf("async function runOne(f)");
    const b = SRC.indexOf("\n}", a);
    return a < 0 ? "" : SRC.slice(a, b);
  })();
  ok(body.length > 0, "runOne was found", body.length);
  ok((body.match(/await spawnOnce\(f\)/g) || []).length === 2,
    "…and spawns at most twice — one run plus one retry, never a loop", (body.match(/await spawnOnce\(f\)/g) || []).length);
  ok(/!r\.killed/.test(body), "a TIMED-OUT file is never retried — that is a real failure to look at");
  ok(/r\.status !== 0/.test(body), "…and a passing file is never re-run");
  ok(/report\(f, r\.status, r\.killed, r\.out\)/.test(body),
    "…and whatever the final attempt says is what gets reported");
}

console.log("\n-- and the user is told it happened --");
{
  ok(/portClashes\.push\(f\)/.test(SRC), "the retried files are recorded");
  ok(/portClashes\.length/.test(SRC) && /were re-run once after the OS gave their port/.test(SRC),
    "…and named in the summary, not swallowed");
  // ⭐ The summary must not claim a clean run when a file needed a retry to pass. The line is printed
  // alongside the skip line, which CLAUDE.md calls out as the one that must be unmissable.
  const summaryAt = SRC.indexOf("were SKIPPED and did not run");
  const clashAt = SRC.indexOf("were re-run once after the OS gave their port");
  ok(summaryAt > 0 && clashAt > summaryAt, "…printed with the other counts a person reads at the end",
    { summaryAt, clashAt });
}

console.log("\n-- ⭐ CONTROL: a genuinely failing file still fails --");
{
  // The danger of any retry is that it turns a red suite green. Drive the real runner over a scratch test
  // that fails for an ordinary reason and confirm it is reported, not retried away.
  const os = require("os");
  const { execFileSync } = require("child_process");
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "nova-retry-ctl-"));
  const f = path.join(__dirname, "test-zz-scratch-always-fails.js");
  try {
    fs.writeFileSync(f, 'console.log("this file fails on purpose");\nprocess.exitCode = 1;\n', "utf8");
    // Scoped with the runner's filter argument, so this control costs one spawn rather than the whole
    // suite. (The first version of this test passed no filter, the runner had no argument handling, and it
    // ran all 940 files to check one — which is how the filter came to exist.)
    let out = "";
    try {
      out = execFileSync(process.execPath, [path.join(__dirname, "run-tests.js"), "zz-scratch-always-fails"],
        { cwd: __dirname, encoding: "utf8", timeout: 120000 });
    } catch (e) { out = String((e && e.stdout) || "") + String((e && e.stderr) || ""); }
    ok(/FILTERED RUN — 1 of \d+ files/.test(out), "the filter scoped the run to the one scratch file", out.slice(0, 160));
    ok(/✗ test-zz-scratch-always-fails\.js/.test(out), "…and it was reported as a FAILURE", out.slice(-300));
    ok(!/↻ test-zz-scratch-always-fails\.js/.test(out), "…without retrying it — it is not a port clash");
    ok(/This is not a full suite/.test(out), "…and a filtered run says plainly that it is not a full suite");
  } finally {
    try { fs.unlinkSync(f); } catch (_) {}
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) {}
  }
}

console.log("\n" + (fail ? "FAILED " + fail + "/" + (pass + fail) : "PASSED " + pass + "/" + pass));
process.exitCode = fail ? 1 : 0;
