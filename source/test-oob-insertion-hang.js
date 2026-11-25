// #oob-insertion-point-infinite-loop — SAVING AN OOB COULD HANG THE ENTIRE NOVA SERVER.
//
// The worst kind of bug for a desktop app: not a wrong file, a dead one. topLevelUnitsInsertionPoint's
// walk-back spun forever, pinning the Node event loop at 100% CPU, so the WHOLE server stopped answering —
// an unrelated request issued three seconds later got nothing, and the process burned 519 CPU seconds before
// it was killed. Nothing is written, so the user's edit is lost and Nova has to be force-quit.
//
// The cause is a JS detail that reads as correct: `s.lastIndexOf(needle, -1)` does NOT search backwards.
// A negative fromIndex is clamped to 0. So at lineStart === 1, prevEnd - 1 is -1, and on text whose first
// character is a newline lastIndexOf returns 0 — giving prevStart = 1 again. lineStart never advanced, and
// the existing `if (prevStart === 0) break;` guard was DEAD in exactly this case, because prevStart is 1.
//
// The trigger is narrow but reachable from an ordinary edit: the merged text must begin with a newline AND
// every line from there down to the top-level `units` statement must be blank or a comment — which is what
// dropping the first division_template leaves behind. Note it is NOT simply "drop the first template": a
// file with two templates where only the first goes exits fine, because the survivor's closing brace is a
// non-blank line that breaks the walk-back.
"use strict";
// #a-bare-test-run-writes-into-the-real-app-data — FIRST: run bare, every node child this starts inherits the sandbox.
require("./safe-write.js");
const path = require("path");
const { execFileSync } = require("child_process");

const fails = [];
let checks = 0;
function rec(label, cond, detail) {
  checks++;
  if (cond) console.log("  ok   " + label);
  else {
    fails.push(label);
    console.log("  FAIL " + label + "  -> " + String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 300));
  }
}

// Run the scan in a CHILD process with a hard timeout. An in-process call cannot be tested for "does not
// hang" — if it hangs, it takes this test with it and the suite never finishes.
function scanInChild(text, ms) {
  const script = [
    'const u = require(' + JSON.stringify(path.join(__dirname, "unit-data.js")) + ');',
    'const t = ' + JSON.stringify(text) + ';',
    'process.stdout.write(String(u.topLevelUnitsInsertionPoint(t)));',
  ].join("\n");
  try {
    const out = execFileSync(process.execPath, ["-e", script], { timeout: ms, encoding: "utf8" });
    return { ok: true, value: out.trim() };
  } catch (e) {
    return { ok: false, timedOut: e.killed || e.code === "ETIMEDOUT" || e.signal === "SIGTERM", err: String(e.message || e).slice(0, 120) };
  }
}

console.log("\n[the hang] every one of these must return, not spin");
// Each shape starts with a newline and has nothing but blank/comment lines before `units`.
const HANG_SHAPES = [
  "\n\nunits = {\n}\n",
  "\nunits = {\n}\n",
  "\n\n\n\nunits = {\n\tdivision = { name = \"x\" }\n}\n",
  "\n# a leading note\n\nunits = {\n}\n",
  "\n\t\n  \nunits = {\n}\n",
];
for (const shape of HANG_SHAPES) {
  const r = scanInChild(shape, 6000);
  rec(`returns for ${JSON.stringify(shape.slice(0, 26))}`, r.ok && !r.timedOut, r);
  if (r.ok) rec(`…with a sane insertion point`, Number(r.value) >= 0, r.value);
}

console.log("\n[still correct] the ordinary shapes keep their answers");
const NORMAL = [
  ["units = {\n}\n", 0],
  ["division_template = {\n\tname = \"A\"\n}\n\nunits = {\n}\n", null],
  ["# header\n\ndivision_template = {\n\tname = \"A\"\n}\nunits = {\n}\n", null],
];
for (const [text] of NORMAL) {
  const r = scanInChild(text, 6000);
  rec(`returns for ${JSON.stringify(text.slice(0, 26))}`, r.ok && !r.timedOut, r);
  rec("…and finds the units statement", r.ok && Number(r.value) >= 0, r.value);
}
// A file with NO top-level units block has nothing to find and must say so rather than guess.
{
  const r = scanInChild("division_template = {\n\tname = \"A\"\n}\n", 6000);
  rec("a file with no units block returns -1", r.ok && r.value === "-1", r);
}
// And the comment directly above `units` still travels with it — the behaviour the walk-back exists for.
{
  const withNote = "division_template = {\n\tname = \"A\"\n}\n\n# Popular Defence Forces\nunits = {\n}\n";
  const r = scanInChild(withNote, 6000);
  const at = Number(r.value);
  // It walks back over blank lines AS WELL AS comments, so the point lands on the blank line above the note
  // rather than on the note itself. What matters is that the note ends up on the insertion side.
  rec("the note above `units` travels with it",
    r.ok && at >= 0 && withNote.slice(at).includes("# Popular Defence Forces") &&
    !withNote.slice(0, at).includes("# Popular Defence Forces"), { at, tail: withNote.slice(at, at + 40) });
}

console.log(`\n=== oob insertion hang: ${checks} checks, ${fails.length} failed ===`);
if (fails.length) { fails.forEach((f) => console.log("   FAILED: " + f)); process.exitCode = 1; }
