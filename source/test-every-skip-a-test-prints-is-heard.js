// ⛔ #a-skip-the-runner-cannot-hear-reads-as-a-pass — EVERY "THIS DID NOT RUN" A TEST PRINTS IS ONE THE RUNNER HEARS.
//
// run-tests.js names, in its summary, the sections that did not run inside files that passed — a green tick over a dormant
// section is the same lie as a green summary over a skipped file (#an-engine-trace-pinned-to-a-build-that-is-gone-reads-as-a-pass).
// It heard only a line whose first word was SKIP in capitals. Measured 2026-11-04, 67 test files said it another way:
// "SKIPPED — no installed corpus" (SKIP\b does not match SKIPPED), "(skipped — vanilla not installed)", "skip  (…)", "(skip) …",
// "--  SKIPPED: …", "⚠ SKIP — …". Several of them are the content-pinned class — "no installed events file ships the shape any more", "no
// installed map ships a mixed-case idea category" — the very shape that hid test-a-reference-resolves-the-way-the-engine-
// resolves.js's Turkey check after the 2026-10-27 game update: a section that stops running when the game or a mod changes,
// in a file that stays green. Any of those could have gone dark with nothing in a full run saying so.
//
// The fix is in ONE place: testlib-skip-line.js says what a skip line is, and the runner reads it. This file holds the rest:
//   • every skip line any test file prints is one that pattern hears — derived from every test-*.js on disk, never listed;
//   • the scan that says so is not blind (a fixture with every form, a commented-out one, and the runner's old pattern);
//   • run-tests.js really uses the shared pattern, and no copy of its own.
"use strict";

const fs = require("fs");
const path = require("path");
const { maskJsComments } = require("./testlib-strip-comments.js");
const { SKIP_LINE, skipWhy } = require("./testlib-skip-line.js");

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (detail === undefined ? "" : "   " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 400)));
  if (!ok) fails.push(label);
};

// What a reader takes for "this did not run": a printed string that opens — after any \n escapes, spaces, a marker and a "(" —
// with a skip word in any case. Deliberately WIDER than SKIP_LINE: the gap between the two is what this file reports.
const LOOKS_LIKE_SKIP = /^\s*(?:[-–—*·•⚠⊘>]+\s*)?\(?\s*skip(?:ped|ping)?(?![\w-])/i;

// The opening text of every string literal that is the first argument of a console.log / .warn / .info / .error or a
// process.stdout.write, with its line. Comments are masked first (length-preserving), so a comment quoting one is not counted.
function printedHeads(src) {
  const code = maskJsComments(src);
  const out = [];
  const CALL = /(?:console\.(?:log|warn|info|error)|process\.stdout\.write)\(\s*(["'`])/g;
  for (const m of code.matchAll(CALL)) {
    const q = m[1];
    let i = m.index + m[0].length, head = "";
    while (i < code.length && head.length < 80) {
      const c = code[i];
      if (c === "\\") { head += code.slice(i, i + 2); i += 2; continue; }
      if (c === q) break;
      if (q === "`" && c === "$" && code[i + 1] === "{") break;
      head += c; i++;
    }
    // A leading "\n" escape prints a blank line first; the skip line is what follows it.
    out.push({ line: code.slice(0, m.index).split("\n").length, head: head.replace(/^(?:\\r)?(?:\\n)+/, "") });
  }
  return out;
}
const unheard = (src, pattern) => printedHeads(src).filter((h) => LOOKS_LIKE_SKIP.test(h.head) && !pattern.test(h.head));

console.log("\n-- the pattern hears every form the tests use, and nothing that is not a skip --");
const FORMS = [
  "  SKIP every type mix-up the installed game ships fires: it ships none",
  "     SKIPPED — no installed corpus",
  "  (skipped — vanilla not installed)",
  "  skip  (no HOI4 install on this machine)",
  "  (skip) vanilla goals.gfx not available",
  "  --  SKIPPED: the installed game / workshop maps are not on this machine",
  "  (skip real scripted_effects: ENOENT)",
  "  SKIPPED sharp is unavailable here, so the route answers before it looks for a font",
  "  ⚠ SKIP — vanilla HOI4 install not found (infantry_weapons dependency assertions skipped)",
  "⚠⚠⚠ SKIP: no Hearts of Iron IV install at D:/SteamLibrary/steamapps/common/Hearts of Iron IV",
];
const deaf = FORMS.filter((l) => !SKIP_LINE.test(l));
rec("every form a test prints is heard (" + FORMS.length + ")", deaf.length === 0, deaf);
const NOT_SKIPS = ["=== every engine trace still reads the installed build: 9 checks, 0 failed, 2 SKIPPED ===",
  "  ok   skip-list survives a save", "  ✓ test-a-thing.js", "  FAIL a skip is named", "  skipped_count = 3"];
const wrongly = NOT_SKIPS.filter((l) => SKIP_LINE.test(l));
rec("...and a summary line, a check label or a variable is not", wrongly.length === 0, wrongly);
const WHY = [["  (skipped — vanilla not installed)", "vanilla not installed"], ["     SKIPPED — no installed corpus", "no installed corpus"],
  ["  SKIP the engine traces", "the engine traces"], ["  skip  (no HOI4 install on this machine)", "(no HOI4 install on this machine)"],
  ["  (skip) vanilla goals.gfx not available", "vanilla goals.gfx not available"], ["  ⚠ SKIP — no game", "no game"]];
const wrongWhy = WHY.filter(([l, w]) => skipWhy(l) !== w).map(([l]) => [l, skipWhy(l)]);
rec("the summary says why, without the skip word (" + WHY.length + ")", wrongWhy.length === 0, wrongWhy);

console.log("\n-- the scan is not blind --");
// Written as a test file would be, every form once, plus one in a comment that must not count.
const FIXTURE = [
  'if (!haveGame) console.log("  (skipped — vanilla not installed)");',
  'console.log("     SKIPPED — no installed corpus");',
  'const skip = (why) => { console.log("  skip " + why); skips++; };',
  'console.log("\\n  (skip) vanilla goals.gfx not available");',
  "console.log(`  --  SKIPPED: ${label} is not on this machine`);",
  'console.log("  SKIP the engine traces: none match this build");',
  '// console.log("  (skipped — a comment is not output)");',
  'console.log("  ok   skip-list survives a save");',
].join("\n");
const OLD_RUNNER = /^\s{0,8}SKIP\b/;   // what run-tests.js matched until 2026-11-04
const oldDeaf = unheard(FIXTURE, OLD_RUNNER).map((h) => h.line);
rec("with the runner's old pattern, the scan finds the five forms it could not hear, and not the commented-out one",
  JSON.stringify(oldDeaf) === JSON.stringify([1, 2, 3, 4, 5]), oldDeaf);
rec("...and with the shared pattern, none", unheard(FIXTURE, SKIP_LINE).length === 0, unheard(FIXTURE, SKIP_LINE));

console.log("\n-- every skip line every test file prints is heard --");
const files = fs.readdirSync(__dirname).filter((f) => /^test-.*\.js$/.test(f)).sort();
const quiet = [];
let printing = 0, lines = 0;
for (const f of files) {
  const src = fs.readFileSync(path.join(__dirname, f), "utf8");
  const heads = printedHeads(src).filter((h) => LOOKS_LIKE_SKIP.test(h.head));
  if (heads.length) { printing++; lines += heads.length; }
  for (const h of heads) if (!SKIP_LINE.test(h.head)) quiet.push(f + ":" + h.line + "  " + JSON.stringify(h.head.slice(0, 60)));
}
rec("the scan found skip lines to judge (" + lines + " in " + printing + " of " + files.length + " files)", lines > 0, lines);
rec("every one is a line the runner hears", quiet.length === 0, quiet);
// The measurement this file was written against. The scan must still see at least the files the runner used to miss —
// if it ever finds fewer, it has gone blind (or they were all rewritten to SKIP, and this line can drop with them).
const oldQuiet = files.filter((f) => unheard(fs.readFileSync(path.join(__dirname, f), "utf8"), OLD_RUNNER).length);
console.log("  (with the runner's old pattern, " + oldQuiet.length + " files print a skip it could not hear)");

console.log("\n-- run-tests.js reads the shared pattern, and keeps no copy of its own --");
const runner = maskJsComments(fs.readFileSync(path.join(__dirname, "run-tests.js"), "utf8"));
rec("it loads testlib-skip-line.js", /require\(\s*["']\.\/testlib-skip-line\.js["']\s*\)/.test(runner));
rec("...and filters a passing file's output with SKIP_LINE", /\.filter\(\s*\(?\s*l\s*\)?\s*=>\s*SKIP_LINE\.test\(\s*l\s*\)\s*\)/.test(runner));
rec("...and names the reason with skipWhy", /skipWhy\(\s*sk\[0\]\s*\)/.test(runner));
rec("...and no pattern of its own for a SKIP line", !/\/\^\\s\{0,8\}SKIP/.test(runner));

console.log("\n=== every skip a test prints is heard: " + checks + " checks, " + fails.length + " failed ===");
process.exitCode = fails.length ? 1 : 0;
