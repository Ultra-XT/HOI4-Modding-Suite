// 🌍 #a-finished-world-is-not-called-stopped (the builder's half) — THE WORLD BUILDER MUST NOT LEAVE WITH ITS LAST WORDS UNSENT.
//
// world-run.js used to end with setTimeout(() => process.exit(), 50) after its last messages. process.send only queues a message:
// when the main server's loop is busy as the builder ends, the pipe is not read, the queue is not written, and process.exit throws
// it away. Measured (reviewer, race2.js): with a 300 KB message before { t: "done" } and the parent busy, the parent heard no message
// at all, 10 in 10 — and with the server half fixed alone (deciding the end on 'close'), the backlog was still lost: 'close' cannot
// read what was never written. test-generate-a-world-is-not-lost-at-its-last-step.js does not see this half: its last messages are
// small enough to be written at once.
//
// world-run.js's exitOnceHeard sends a last { t: "end" } and exits in its send callback, which runs once it is WRITTEN, so every
// message queued before it has been written too. This test forks a stand-in builder that sends a large last answer, then the step
// events and done, then ends — the old way (THE CONTROL: it must lose its last words with the parent busy, or this probe cannot
// tell) and through world-run.js's own exitOnceHeard (every message heard, every time) — and checks the builder's entry ends by it.
"use strict";

// #a-bare-test-run-writes-into-the-real-app-data — FIRST: run bare, the stand-in builder this forks inherits the sandbox.
require("./safe-write.js");
const fs = require("fs");
const os = require("os");
const path = require("path");
const cp = require("child_process");
const { stripJsComments } = require("./testlib-strip-comments.js");

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (ok || detail == null ? "" : "   -> " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 900)));
  if (!ok) fails.push(label);
};
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-world-last-word-"));
const KID = path.join(ROOT, "builder-stand-in.js");
fs.writeFileSync(KID, [
  '"use strict";',
  `const W = require(${JSON.stringify(path.join(__dirname, "world-run.js"))});`,
  "const how = process.argv[2], size = Number(process.argv[3]);",
  'process.send({ t: "step", key: "regions", state: "done", answer: { pad: "x".repeat(size) } });',
  'process.send({ t: "step", key: "check", state: "done", answer: {} });',
  'process.send({ t: "step", key: "refix", state: "skipped" });',
  'process.send({ t: "done" });',
  'if (how === "heard") W.exitOnceHeard();',
  "else setTimeout(() => process.exit(0), 50);",
].join("\n") + "\n");
const WANT = ["step:regions", "step:check", "step:refix", "done"];

/** Fork the stand-in, keep this loop busy `busyMs` from the fork (the main server, busy as the builder ends), and hear it out. */
function once(how, size, busyMs) {
  return new Promise((resolve) => {
    const heard = [];
    const child = cp.fork(KID, [how, String(size)], { stdio: ["ignore", "ignore", "ignore", "ipc"] });
    child.on("message", (m) => heard.push(m && m.t === "step" ? `step:${m.key}` : String(m && m.t)));
    child.on("close", (code) => resolve({ heard, code }));
    const t = Date.now();
    while (Date.now() - t < busyMs) { /* busy */ }
  });
}
const allHeard = (r) => WANT.every((w) => r.heard.includes(w));

(async () => {
  const SIZE = 2 * 1024 * 1024, BUSY = 1500, TRIES = 3;
  const old = [];
  for (let i = 0; i < TRIES; i++) old.push(await once("old", SIZE, BUSY));
  rec(`THE CONTROL: the old exit (50 ms after its last send) loses its last words with the main loop busy (${TRIES} tries)`, old.some((r) => !allHeard(r)), old.map((r) => r.heard));
  const fixed = [];
  for (let i = 0; i < TRIES; i++) fixed.push(await once("heard", SIZE, BUSY));
  rec(`⭐ exitOnceHeard: every last word is heard, every time (${TRIES} tries, the main loop as busy)`, fixed.every(allHeard), fixed.map((r) => r.heard));
  rec("…and the main server is told the builder is leaving ({ t: \"end\" } after them)", fixed.every((r) => r.heard[r.heard.length - 1] === "end"), fixed.map((r) => r.heard.slice(-2)));
  rec("…and it leaves with the exit code it had (0)", fixed.every((r) => r.code === 0), fixed.map((r) => r.code));
  const free = await once("heard", SIZE, 0);
  rec("THE CONTROL: with the loop free, it is heard too", allHeard(free), free.heard);
  const src = stripJsComments(fs.readFileSync(path.join(__dirname, "world-run.js"), "utf8"));
  rec("the builder's own entry ends through exitOnceHeard, on success and on failure", /runChild\(\)\s*\.then\(\s*exitOnceHeard\s*,\s*exitOnceHeard\s*\)/.test(src), null);
  console.log(`\n${checks - fails.length}/${checks} checks passed`);
  if (fails.length) { console.log("FAILED:\n  " + fails.join("\n  ")); process.exitCode = 1; }
})().catch((e) => { console.error(e); process.exit(1); });
