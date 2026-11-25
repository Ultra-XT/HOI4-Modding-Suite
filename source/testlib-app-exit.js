// ⛔ #a-refused-launch-is-not-a-skip — WHAT THE REAL APP SAID AS IT WENT, for the e2e files that launch it through Playwright.
//
// ⚠️ NOT NAMED test-*.js ON PURPOSE — run-tests.js enumerates `test-*.js` and would execute a helper as a test file.
//
// main.js refuses a NOVA_PORT it cannot have: it prints "Nova could not start: NOVA_PORT asks for port …" on stderr and exits
// with code 1, about a second after the splash opened (measured 2026-11-19: launch resolved at 0.43 s, the splash at 0.50 s, the
// exit at 1.36 s). Playwright passes on neither the exit nor the stderr, so the two e2e files that launch the app read a refused
// launch as an environment that cannot run Electron: e2e-workflow-test.js polled the dead splash for 240 s and printed "SKIP: …
// cache build did not finish", e2e-research-test.js turned the closed window into its "SKIP — the Electron window closed
// mid-run", and run-e2e.js counted each as a skip, exit 0, with a false reason (round 2's review held the port and ran it).
//
// So each launch is watched from the moment it resolves: every stderr line is printed, prefixed (so no line of the app's can
// begin with a word a runner reads as a skip), and the file can ask whether the app is gone, and why.
"use strict";

const REFUSAL = /Nova could not start/;

function watchApp(electronApp) {
  const proc = electronApp && typeof electronApp.process === "function" ? electronApp.process() : null;
  const st = { stderr: "", exit: null };
  if (proc && proc.stderr) {
    proc.stderr.on("data", (d) => {
      const s = String(d);
      st.stderr += s;
      for (const l of s.split(/\r?\n/)) if (l.trim()) console.log("[app stderr] " + l);
    });
  }
  const exitSeen = proc ? new Promise((r) => proc.once("exit", (code, signal) => { st.exit = { code, signal }; r(); })) : Promise.resolve();
  const exited = () => st.exit
    || (proc && (proc.exitCode !== null || proc.signalCode !== null) ? { code: proc.exitCode, signal: proc.signalCode } : null);
  const refusal = () => (st.stderr.split(/\r?\n/).find((l) => REFUSAL.test(l)) || "").trim();
  const said = (e) => `the app exited (code ${e.code}${e.signal ? `, signal ${e.signal}` : ""})`;
  return {
    /** null while the app runs; once it has exited, at all, what ended it — quoting its refusal when it gave one. */
    gone() { const e = exited(); return e ? said(e) + (refusal() ? ": " + refusal() : "") : null; },
    /** null unless the app refused to start or exited with an error (a non-zero code, or a signal). */
    failed() {
      const e = exited(), r = refusal();
      if (r) return (e ? said(e) : "the app refused to start") + ": " + r;
      return e && (e.code !== 0 || e.signal) ? said(e) : null;
    },
    /** Waits up to `ms` for the app's own exit: Playwright's "Target … closed" can arrive before the process's exit event. */
    settle(ms) { return Promise.race([exitSeen, new Promise((r) => setTimeout(r, ms))]); },
  };
}

/** The refusal main.js gave, when a launch error carries it (Playwright puts the app's log into a failed launch's message). */
const refusalIn = (text) => (String(text || "").split(/\r?\n/).find((l) => REFUSAL.test(l)) || "").trim();

module.exports = { watchApp, refusalIn };
