// The suite runs several tests at once now. This pins the reason that is safe.
//
// It was one at a time: 847 files, 1,948s, on a machine with 16 cores where 15 sat idle. But the tests are
// not all independent, and running them together naively would corrupt each other in ways that look like
// random flaky failures — the worst possible bug in a gate, because it teaches people to re-run instead of
// to look.
//
// Three things make a pair unsafe to overlap:
//   * a listening PORT — 509 files pin one, and some numbers are used by more than one file
//   * a fixed SCRATCH DIRECTORY — two files writing the same path
//   * the LIVE APP — the handful that drive the developer's own running Nova share one server, and it holds
//     global state (the active mod root), so two of them at once can make each other fail
//
// run-tests.js therefore reads what each file CLAIMS and never runs two claimants together. This test
// checks the guard exists AND that it is load-bearing — that there really are files that would collide.
// A guard protecting nothing would pass a source check while teaching nobody anything.
"use strict";

const fs = require("fs");
const path = require("path");
const { stripJsComments } = require("./testlib-strip-comments.js");

const dir = __dirname;
const RUNNER = fs.readFileSync(path.join(dir, "run-tests.js"), "utf8");
const RUNNER_CODE = stripJsComments(RUNNER);

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (detail == null ? "" : "   " + detail));
  if (!ok) fails.push(label);
};

try {
  const testFiles = fs.readdirSync(dir).filter((f) => /^test-.*\.js$/.test(f)).sort();

  console.log("\n1. The runner reads claims and refuses to overlap them");
  rec("it collects a claim set per file", /function claimsOf\(/.test(RUNNER_CODE));
  rec("…including ports", /out\.add\("port:"/.test(RUNNER_CODE));
  rec("…scratch directories", /out\.add\("dir:"/.test(RUNNER_CODE));
  rec("…and the live app", /out\.add\("live-app"\)/.test(RUNNER_CODE));
  // The guard itself: a file whose claim is already held must be passed over, not started.
  rec("a file is skipped while another holds its claim",
    /held\.has\(c\)/.test(RUNNER_CODE) && /if \(blocked\) continue/.test(RUNNER_CODE));
  rec("claims are released when the file finishes", /held\.delete\(c\)/.test(RUNNER_CODE));
  // Order matters: claiming AFTER spawning would leave a window where two files both look free.
  const claimAt = RUNNER_CODE.search(/held\.add\(c\)/);
  const spawnAt = RUNNER_CODE.search(/runOne\(f\)\.then/);
  rec("a file's claims are taken BEFORE it is started", claimAt !== -1 && spawnAt !== -1 && claimAt < spawnAt,
    "claim@" + claimAt + "  start@" + spawnAt);

  console.log("\n2. …and the guard is load-bearing (there really are collisions to prevent)");
  // Derived from the files on disk, never typed in here: if someone renumbers every port tomorrow this
  // section stops asserting a fiction and says so.
  const portsOf = (f) => {
    const t = stripJsComments(fs.readFileSync(path.join(dir, f), "utf8"));
    const s = new Set();
    for (const m of t.matchAll(/[Pp][Oo][Rr][Tt]\w*\s*=\s*(\d{4,5})\b/g)) s.add(m[1]);
    for (const m of t.matchAll(/\.listen\(\s*(\d{4,5})/g)) s.add(m[1]);
    return s;
  };
  const byPort = new Map();
  for (const f of testFiles) for (const p of portsOf(f)) {
    if (!byPort.has(p)) byPort.set(p, []);
    byPort.get(p).push(f);
  }
  const shared = [...byPort.entries()].filter(([, fs2]) => fs2.length > 1);
  rec("some port is claimed by more than one test file", shared.length > 0,
    shared.length + " shared port(s), e.g. " + (shared[0] ? shared[0][0] + " → " + shared[0][1].slice(0, 3).join(", ") : "-"));

  // ⚠️ The BARE forms on purpose. The runner decides a file drives the live app by looking for
  // `process.env.NOVA_` + `PORT` or the loopback address with the port on it — so writing those literally
  // HERE makes this file look like a live test, and it gets serialised against the real ones and skipped
  // whenever the app is down. It did exactly that on first run. test-runner-cannot-wedge.js dodges the same
  // trap the same way; the runner's own comment warns about it too.
  const liveRe = /NOVA_PORT|47821/;
  const liveFiles = testFiles.filter((f) => liveRe.test(stripJsComments(fs.readFileSync(path.join(dir, f), "utf8"))));
  rec("more than one test drives the shared live app", liveFiles.length > 1, liveFiles.length + " files");

  console.log("\n3. The escape hatch, and the ceiling");
  // When a failure ever does look like two tests treading on each other, the first move must be to take
  // concurrency out of the picture entirely — and that has to be documented where it is read.
  rec("concurrency can be forced to 1", /NOVA_TEST_CONCURRENCY/.test(RUNNER_CODE));
  rec("…and that escape hatch is explained in the source", /NOVA_TEST_CONCURRENCY=1/.test(RUNNER));
  rec("it does not open unlimited processes", /Math\.min\(8/.test(RUNNER_CODE));

  console.log("\n4. Nothing that made the old runner trustworthy was dropped");
  // Each of these exists because something went wrong once. Losing one while making it fast would be a
  // poor trade, and the parallel rewrite touched every line around them.
  rec("a stuck file still cannot stop the suite", /TEST_TIMEOUT_MS/.test(RUNNER_CODE) && /SIGKILL/.test(RUNNER_CODE));
  rec("a timed-out file is still named as a timeout", /TIMED OUT after/.test(RUNNER));
  rec("a missing committed test still fails the run", /ls-files/.test(RUNNER_CODE) && /MISSING from disk/.test(RUNNER));
  rec("the antivirus-risky pair is still skipped by default", /AV_RISKY/.test(RUNNER_CODE) &&
    /test-spirit-lifecycle\.js/.test(RUNNER) && /test-spirit-modifier-newlines\.js/.test(RUNNER));
  rec("skips are still named in the headline, not hidden", /were SKIPPED and did not run/.test(RUNNER));
  rec("a failing run still exits non-zero", /process\.exit\(1\)/.test(RUNNER_CODE));

  console.log("\n[no unclaimable ports] a port the runner cannot READ defeats the whole mechanism");
  {
    // Both runners schedule by reading the port each file claims in its own source, and never run two
    // claimants together. That only works while every port is a literal somebody can read. A port computed
    // at runtime — from the pid, from a random, from the clock — is unclaimable by construction, so the
    // runner cannot schedule around it and it collides with whatever legitimately owns that number.
    //
    // testlib-icon-worker.js did exactly this with `53200 + (process.pid % 300)`, a range overlapping the
    // 53400-53700 band the tests bind. It failed EADDRINUSE on 53368 inside a full parallel run while
    // passing 3/3 alone. The fix was port 0 (OS-assigned), which cannot collide and needs no claim.
    //
    // Checked across the helpers too, not just test-*.js: the hidden port was in a testlib the runner never
    // reads, which is precisely why nothing caught it.
    const files = fs.readdirSync(dir).filter((f) => /^(test-|e2e-|testlib-).*\.js$/.test(f));
    const offenders = [];
    for (const f of files) {
      const src = stripJsComments(fs.readFileSync(path.join(dir, f), "utf8"));
      // A port EXPRESSION rather than a literal: base + pid, base + random, base + Date.now().
      if (/listen\(\s*\d{4,5}\s*\+|=\s*\d{4,5}\s*\+\s*\(?\s*(process\.pid|Math\.random|Date\.now)/.test(src)) {
        offenders.push(f);
      }
    }
    rec("no test or helper computes its port at runtime", offenders.length === 0, offenders);
    // CONTROL: the check must actually recognise the shape it was written for, or it is decoration.
    // ⚠️ ASSEMBLED AT RUNTIME, NOT WRITTEN OUT. Spelling the offending line as a literal would put the
    // needle into this very file, and the scan above — which deliberately covers test-* too — would then
    // find itself and fail. A check that contains its own needle finds itself; it did, first run.
    const shape = "const PORT = 53200 + (" + "process" + ".pid % 300);";
    rec("…and the rule recognises the shape that caused this",
      /=\s*\d{4,5}\s*\+\s*\(?\s*(process\.pid|Math\.random|Date\.now)/.test(shape));
    // …while the legitimate answer must pass.
    // ⚠️ ASSEMBLED, for the same reason as the shape above and then a second one. Written out, this line put
    // `createApp().listen(` into a file that also mentions NOVA_PORT — and test-runner-cannot-wedge.js reads
    // that combination as "a test that needs the outside app AND starts its own server", which is the exact
    // contradiction it exists to forbid. It failed there, not here. A needle spelled in one test can trip a
    // different test.
    const okShape = "const s = createApp" + "().listen(0, \"127.0.0.1\", () => r(s)); const PORT = srv.address().port;";
    rec("…and port 0 is allowed, since the OS picks it",
      !/listen\(\s*\d{4,5}\s*\+|=\s*\d{4,5}\s*\+\s*\(?\s*(process\.pid|Math\.random|Date\.now)/.test(okShape));
  }

  console.log(`\n=== the runner cannot collide: ${checks} checks, ${fails.length} failed ===`);
  if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
} catch (e) {
  console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
  process.exitCode = 1;
}
