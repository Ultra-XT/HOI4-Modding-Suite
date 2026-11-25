// ⛔ #a-skip-the-e2e-runner-cannot-hear-reads-as-a-pass — AN E2E FILE THAT SAYS IT SKIPPED IS COUNTED AS A SKIP, NOT A PASS.
//
// Several e2e files decide on their own not to run and still exit 0: e2e-map-movecountry.js always ("Move-country is
// intentionally disabled"), e2e-research-test.js when Electron cannot launch or its window dies, e2e-workflow-test.js when the
// splash never hands over. run-e2e.js read the exit code alone, so each of those printed "✓ …", "1/1 e2e file(s) passed" and
// "All green." — measured on round 1 of the e2e campaign (2026-11-04) for e2e-map-movecountry.js, which runs nothing at all.
// run-tests.js stopped telling that lie in 84446640 by hearing skip lines through testlib-skip-line.js; the e2e runner never
// adopted it. And one e2e file said its skip as "↷ SKIP …", a form neither runner hears.
//
// A rule policed only by an e2e run decays (e2e runs on demand), so it is held here, without a browser or the app:
//   1. every skip-looking line any e2e-*.js or testlib-*.js prints is one SKIP_LINE hears — derived from the files on disk —
//      and every skip-looking string literal in them is printed DIRECTLY, as the first argument of a print call, so the line it
//      ends up on begins with it: e2e-country-picker-dismiss.js handed "(skipped focus-on-open — …)" to its own ok() helper,
//      which printed "  ok  (skipped …)", and the runner called the file a pass (round 2's review, L1);
//   2. a COPY of run-e2e.js, run for real over tiny fixture e2e files in a temp folder (a pass, a fail, every skip form, every
//      skip line the real e2e files print, a failure that also printed a skip, an antivirus-risky name, and a skip line buried
//      in the middle of 400 lines on stderr), counts each one right and never says "All green" alone when anything skipped. A
//      copy needs no seam: the runner lists the folder it sits in;
//   3. run-e2e.js reads the shared pattern, and keeps no copy of its own.
"use strict";
// #a-bare-test-run-writes-into-the-real-app-data — FIRST, before any child is started (the runner copy, and the fixture files
// it starts, get this process's env).
require("./safe-write.js");

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const { maskJsComments, maskJsLiterals } = require("./testlib-strip-comments.js");
const { SKIP_LINE } = require("./testlib-skip-line.js");

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (detail === undefined ? "" : "   " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 600)));
  if (!ok) fails.push(label);
};

// The opening text of every string literal that is the first argument of a console.log / .warn / .info / .error or a
// process.stdout.write, with its quote and line. Comments are masked first (length-preserving), so a comment quoting one is
// not counted. The same scan test-every-skip-a-test-prints-is-heard.js runs over test-*.js, plus the quote, so a fixture can
// print exactly what the file prints.
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
    out.push({ q, line: code.slice(0, m.index).split("\n").length, head: head.replace(/^(?:\\r)?(?:\\n)+/, "") });
  }
  return out;
}
// What a reader takes for "this did not run": a printed line whose first WORD is a skip word, after any run of anything that
// is not a letter or a digit — spaces, "(", "--", "⚠", and the "↷" the e2e files used. WIDER than SKIP_LINE on purpose: the
// gap between the two is what this file reports.
const LOOKS_LIKE_SKIP = /^[^\p{L}\p{N}]*skip(?:ped|ping)?(?![\w-])/iu;
const unheard = (src) => printedHeads(src).filter((h) => LOOKS_LIKE_SKIP.test(h.head) && !SKIP_LINE.test(h.head));

// The opening text of EVERY string and template literal in the code (comments masked), with its line, and whether it is the
// first argument of a print call. Read off maskJsLiterals, where a literal's contents are blanked and its delimiters kept, so
// every quote left there is a real delimiter (none inside a comment, a regex or another literal) and a brace a real brace:
// the one scanner decides what is a literal, and this only walks its answer.
function literalHeads(src) {
  const code = maskJsComments(src), bare = maskJsLiterals(src);
  const out = [];
  const marks = [];   // for each open template: the brace depth at which its text resumes
  let depth = 0;
  for (let i = 0; i < bare.length; i++) {
    const c = bare[i];
    if (marks.length && depth === marks[marks.length - 1]) {      // template text: only `${` or the closing backtick end it
      if (c === "`") marks.pop();
      else if (c === "$" && bare[i + 1] === "{") { depth++; i++; }
      continue;
    }
    if (c === '"' || c === "'") {
      const j = bare.indexOf(c, i + 1);
      if (j === -1) break;
      out.push({ at: i, q: c, head: code.slice(i + 1, j) });
      i = j;
      continue;
    }
    if (c === "`") {
      let j = i + 1;
      while (j < bare.length && bare[j] !== "`" && !(bare[j] === "$" && bare[j + 1] === "{")) j++;
      out.push({ at: i, q: c, head: code.slice(i + 1, j) });
      marks.push(depth);
      continue;
    }
    if (c === "{") depth++;
    else if (c === "}" && depth > 0) depth--;
  }
  const PRINT_CALL = /(?:console\.(?:log|warn|info|error)|process\.stdout\.write)\(\s*$/;
  return out.map((h) => ({ q: h.q, line: code.slice(0, h.at).split("\n").length, printed: PRINT_CALL.test(code.slice(Math.max(0, h.at - 80), h.at)),
    head: h.head.replace(/^(?:\\r)?(?:\\n)+/, "") }));
}
// A skip-looking literal that is not printed directly goes through something that decides how its line begins — a check
// helper's "  ok  ", a variable printed with a prefix — so whether the runner hears it is not known from the literal.
const passedOn = (src) => literalHeads(src).filter((h) => LOOKS_LIKE_SKIP.test(h.head) && !h.printed);

console.log("\n-- 1. every skip line an e2e file prints is one the runners hear --");
{
  // The scan is not blind: the "↷ SKIP" form the e2e files used is reported, a heard form is not, nor a commented-out one,
  // nor a check label that merely starts with the word.
  const FIXTURE = [
    'console.log(`    ↷ SKIP tech-node selection — the mod\'s own rt_tech did not render (${seen} other nodes did)`);',
    'console.log("  SKIP — Move-country is intentionally disabled in the UI");',
    "console.log('SKIP: the app was still on splash.html after 240s');",
    '// console.log("  ↷ SKIP a comment is not output");',
    'console.log("  ok   skip-list survives a save");',
  ].join("\n");
  const deaf = unheard(FIXTURE).map((h) => h.line);
  rec("THE CONTROL: the scan finds the \"↷ SKIP\" form, and only it (line 1)", JSON.stringify(deaf) === "[1]", deaf);

  const files = fs.readdirSync(__dirname).filter((f) => /^(e2e|testlib)-.*\.js$/.test(f)).sort();
  const quiet = [];
  let printing = 0, lines = 0;
  for (const f of files) {
    const heads = printedHeads(fs.readFileSync(path.join(__dirname, f), "utf8")).filter((h) => LOOKS_LIKE_SKIP.test(h.head));
    if (heads.length) { printing++; lines += heads.length; }
    for (const h of heads) if (!SKIP_LINE.test(h.head)) quiet.push(f + ":" + h.line + "  " + JSON.stringify(h.head.slice(0, 70)));
  }
  // At least the three files the runner was measured missing print one (movecountry, research-test, workflow-test): if the
  // scan finds fewer, it has gone blind.
  rec("the scan found skip lines to judge (" + lines + " in " + printing + " of " + files.length + " e2e/testlib files)", printing >= 3, printing);
  rec("⭐ every one is a line SKIP_LINE hears", quiet.length === 0, quiet);

  // …and no skip-looking literal reaches the output any other way. THE CONTROL: the shape e2e-country-picker-dismiss.js had (a
  // skip handed to its ok() helper) is found, and nothing else is: not a printed SKIP line, not a template's, not a commented-out
  // one, not a word that merely starts with "skip", not a quote inside a regex.
  const PASSED_ON = [
    'ok("(skipped focus-on-open — no countries in catalog)", true);',
    'console.log("  SKIP focus-on-open — the list offers no country to pick");',
    "console.error(`  SKIP — ${why}`);",
    '// ok("(skipped in a comment)", true);',
    'ok("skip-list survives a save", true);',
    'const re = /"skipped "/; const label = "a label";',
  ].join("\n");
  const found = passedOn(PASSED_ON).map((h) => h.line);
  rec("THE CONTROL: a skip handed to a helper is found, and only it (line 1)", JSON.stringify(found) === "[1]", found);
  const handed = [];
  let literals = 0;
  for (const f of files) {
    const src = fs.readFileSync(path.join(__dirname, f), "utf8");
    literals += literalHeads(src).length;
    for (const h of passedOn(src)) handed.push(f + ":" + h.line + "  " + JSON.stringify(h.head.slice(0, 70)));
  }
  rec("the literal scan has literals to judge (" + literals + ")", literals >= 1000, literals);
  rec("⭐⭐ every skip-looking string literal is printed directly, as the first argument of a print call", handed.length === 0, handed);
}

console.log("\n-- 2. run-e2e.js, run for real over fixture e2e files, counts a skip as a skip --");
const RUNNER_SRC = fs.readFileSync(path.join(__dirname, "run-e2e.js"), "utf8");
const RUNNER_CODE = maskJsComments(RUNNER_SRC);
// The local modules the runner loads, from its own source: a copy without them would not start.
const LOCAL_DEPS = [...RUNNER_CODE.matchAll(/require\(\s*["']\.\/([A-Za-z0-9_.\-]+\.js)["']\s*\)/g)].map((m) => m[1]);
// The names it refuses to start (antivirus-risky), from its own AV_RISKY literal.
const AV_NAMES = (() => {
  const at = RUNNER_CODE.indexOf("const AV_RISKY = {");
  const end = at === -1 ? -1 : RUNNER_CODE.indexOf("};", at);
  return at === -1 || end === -1 ? [] : [...RUNNER_SRC.slice(at, end).matchAll(/"(e2e-[A-Za-z0-9_.\-]+\.js)"\s*:/g)].map((m) => m[1]);
})();
rec("THE CONTROL: the runner's local modules are read out of its source", LOCAL_DEPS.includes("testlib-strip-comments.js"), LOCAL_DEPS);

// A fixture e2e file: prints its lines and exits with its code. `lines` are JS source for the argument of console.log.
const fixture = (lines, code) => '"use strict";\n' + lines.map((l) => "console.log(" + l + ");").join("\n") + "\nprocess.exit(" + code + ");\n";
const lit = (s) => JSON.stringify(s);

// Every form testlib-skip-line.js documents, typed once here as fixture text (what each must do is the runner's business).
const FORMS = [
  "  SKIP — Move-country is intentionally disabled in the UI",
  "SKIP: the app was still on splash.html after 240s",
  "     SKIPPED — no installed corpus",
  "  (skipped — vanilla not installed)",
  "  skip  (no HOI4 install on this machine)",
  "  (skip) vanilla goals.gfx not available",
  "  --  SKIPPED: the installed game is not on this machine",
  "  ⚠ SKIP — vanilla HOI4 install not found",
  "\n  SKIP — after a blank line",
];
// …and every skip line the real e2e files print, exactly as they print it (same quote, so the same escapes).
const DERIVED = [];
for (const f of fs.readdirSync(__dirname).filter((x) => /^e2e-.*\.js$/.test(x)).sort()) {
  for (const h of printedHeads(fs.readFileSync(path.join(__dirname, f), "utf8"))) {
    // The head is cut at 80 characters: an escape the cut split in two is dropped, so the fixture still parses.
    if (LOOKS_LIKE_SKIP.test(h.head)) DERIVED.push({ from: f + ":" + h.line, src: h.q + h.head.replace(/\\(?:u[0-9a-fA-F]{0,3}|x[0-9a-fA-F]?)?$/, "") + h.q });
  }
}
rec("THE CONTROL: the real e2e files' skip lines are derived (" + DERIVED.length + ")", DERIVED.length >= 3, DERIVED.map((d) => d.from));

// Lines that are NOT skips, printed by the passing fixture: a check label, a ticked file, a variable, a closing summary.
const NOT_SKIPS = ["  ok   skip-list survives a save", "  ✓ test-a-thing.js", "  skipped_count = 3", "=== every check ran: 9 checks, 0 failed, 0 SKIPPED ==="];

const made = [];
function runScenario(name, files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nova-e2e-runner-fixture-"));
  made.push(dir);
  fs.writeFileSync(path.join(dir, "run-e2e.js"), RUNNER_SRC, "utf8");
  for (const d of LOCAL_DEPS) fs.copyFileSync(path.join(__dirname, d), path.join(dir, d));
  for (const [f, body] of Object.entries(files)) fs.writeFileSync(path.join(dir, f), body, "utf8");
  const env = Object.assign({}, process.env, { NOVA_E2E_TIMEOUT_MS: "60000" });
  delete env.NOVA_RUN_AV_RISKY;
  delete env.NOVA_E2E_CONCURRENCY;
  const r = spawnSync(process.execPath, [path.join(dir, "run-e2e.js")], { cwd: dir, env, encoding: "utf8", timeout: 180000, killSignal: "SIGKILL" });
  const out = String(r.stdout || "") + String(r.stderr || "");
  const lines = String(r.stdout || "").split(/\r?\n/);
  const statusOf = (f) => {
    const l = lines.find((x) => x.includes(" " + f) && /^\s*[✓✗⊘]/.test(x)) || "";
    return l.trim().startsWith("✓") ? "pass" : l.trim().startsWith("✗") ? "fail" : /^⊘/.test(l.trim()) && /SKIPPED/i.test(l) ? "skip" : "(none: " + JSON.stringify(l) + ")";
  };
  const head = lines.find((l) => /^\d+\/\d+ e2e file\(s\) passed/.test(l)) || "";
  const hm = /^(\d+)\/(\d+) e2e file\(s\) passed/.exec(head) || [];
  const sm = /(\d+) of (\d+) were SKIPPED/.exec(head) || [];
  const last = lines.filter((l) => l.trim()).slice(-1)[0] || "";
  console.log(`  [${name}] exit ${r.status}; headline ${JSON.stringify(head)}; last ${JSON.stringify(last)}`);
  return { status: r.status, out, lines, statusOf, passed: +hm[1], ran: +hm[2], skippedN: sm[1] === undefined ? 0 : +sm[1], total: +sm[2], head, last };
}

try {
  const PASS = fixture([lit("=== FIXTURE: a passing e2e file ==="), ...NOT_SKIPS.map(lit)], 0);
  const FAIL = fixture([lit("  ✗ FAIL the thing broke")], 1);
  const SAID_SKIP_AND_FAILED = fixture([lit("  SKIP — the first half could not run"), lit("  ✗ FAIL and the second half broke")], 1);
  const skipFiles = {};
  FORMS.forEach((s, i) => { skipFiles[`e2e-form-${String(i + 1).padStart(2, "0")}.js`] = fixture([lit("=== FIXTURE: says it skipped ==="), lit(s), lit("XYZ E2E: skipped")], 0); });
  DERIVED.forEach((d, i) => { skipFiles[`e2e-real-${String(i + 1).padStart(2, "0")}.js`] = fixture([lit("=== FIXTURE: a real file's skip line, " + d.from + " ==="), d.src], 0); });
  // A skip line ANYWHERE in the output, on EITHER stream: buried between 200 lines on each side, all on stderr, so a runner that
  // heard only the head, only the tail (round 2's review: a runner hearing the last 50 lines passed every other fixture here,
  // and called the real e2e-edit-roundtrip.js green, whose SKIP line sits 84 lines from its end) or only stdout misses it. One
  // stream only, so the two pipes cannot interleave it toward either end.
  skipFiles["e2e-buried-skip.js"] = '"use strict";\n' +
    'for (let i = 1; i <= 200; i++) console.error("  ok   filler line " + i + " before the skip");\n' +
    "console.error(" + lit("  SKIP — buried in the middle of 400 lines, on stderr") + ");\n" +
    'for (let i = 1; i <= 200; i++) console.error("  ok   filler line " + i + " after the skip");\n' +
    "process.exit(0);\n";
  const nSkip = Object.keys(skipFiles).length;

  {
    // A: everything at once — a failure decides the exit code; each skip is a skip; a failure that also said SKIP is a failure.
    const avFiles = {};
    // Exits 1: if the runner ever started one, it would fail and print this line in its tail.
    for (const n of AV_NAMES) avFiles[n] = fixture([lit("this must never run")], 1);
    const A = runScenario("A: pass + fail + skips + a failure that said SKIP + antivirus-risky names", Object.assign(
      { "e2e-a-pass.js": PASS, "e2e-a-fail.js": FAIL, "e2e-a-said-skip-and-failed.js": SAID_SKIP_AND_FAILED }, skipFiles, avFiles));
    rec("A: a failing file fails the run (exit 1)", A.status === 1, A.status);
    rec("A: the passing file is a pass, the failing file a failure", A.statusOf("e2e-a-pass.js") === "pass" && A.statusOf("e2e-a-fail.js") === "fail",
      [A.statusOf("e2e-a-pass.js"), A.statusOf("e2e-a-fail.js")]);
    rec("A: a file that printed a skip line and FAILED is a failure, not a skip", A.statusOf("e2e-a-said-skip-and-failed.js") === "fail", A.statusOf("e2e-a-said-skip-and-failed.js"));
    const wrong = Object.keys(skipFiles).filter((f) => A.statusOf(f) !== "skip").map((f) => f + " → " + A.statusOf(f));
    rec("⭐⭐⭐ A: every file that exited 0 after a skip line is reported SKIPPED (" + nSkip + ": each form, each real e2e skip line)", !wrong.length, wrong);
    rec("⭐⭐ A: the headline counts only the files that ran in full: 1 passed of 3", A.passed === 1 && A.ran === 3, A.head);
    rec("⭐⭐ A: …and names every skip, of both kinds, in the same line", A.skippedN === nSkip + AV_NAMES.length && A.total === 3 + nSkip + AV_NAMES.length, A.head);
    rec("A: an antivirus-risky name is never started", !A.out.includes("this must never run") && AV_NAMES.every((n) => A.lines.some((l) => l.includes("⊘ " + n))), AV_NAMES);
    rec("A: the run does not say All green", !A.lines.some((l) => /All green/.test(l)), A.last);
  }
  {
    // B: nothing failed but files skipped — exit 0, and the last line carries the skip count.
    const B = runScenario("B: pass + skips", Object.assign({ "e2e-a-pass.js": PASS }, skipFiles));
    rec("B: skips alone do not fail the run (exit 0)", B.status === 0, B.status);
    rec("⭐⭐ B: the headline says 1/1 passed and that " + nSkip + " of " + (nSkip + 1) + " were SKIPPED", B.passed === 1 && B.ran === 1 && B.skippedN === nSkip && B.total === nSkip + 1, B.head);
    rec("⭐⭐⭐ B: \"All green\" never stands alone: the last line says how many were SKIPPED", /^All green — but /.test(B.last) && new RegExp("\\b" + nSkip + " were SKIPPED").test(B.last) && !B.lines.some((l) => l.trim() === "All green."), B.last);
  }
  {
    // C — THE CONTROL: with nothing skipped the runner still says the plain thing, so B's wording is the skip's doing.
    const C = runScenario("C: pass only", { "e2e-a-pass.js": PASS });
    rec("THE CONTROL: C: a lone passing file passes: exit 0, 1/1, plain \"All green.\"", C.status === 0 && C.passed === 1 && C.ran === 1 && C.skippedN === 0 && C.last.trim() === "All green.", [C.status, C.head, C.last]);
  }
  {
    // D: the e2e-map-movecountry.js shape — the one file asked for skips itself. Nothing ran, so nothing is green.
    const D = runScenario("D: one file, which skips itself", { "e2e-form-01.js": skipFiles["e2e-form-01.js"] });
    rec("D: exit 0 (a skip is not a failure)", D.status === 0, D.status);
    rec("⭐⭐⭐ D: it is not \"1/1 passed\": 0/0, and 1 of 1 SKIPPED", D.passed === 0 && D.ran === 0 && D.skippedN === 1 && D.total === 1, D.head);
    rec("⭐⭐ D: a run in which nothing ran in full does not say All green at all", !D.lines.some((l) => /All green/.test(l)), D.last);
  }
} catch (e) {
  rec("harness threw", false, e && e.stack ? e.stack.split("\n").slice(0, 4).join(" | ") : String(e));
} finally {
  for (const d of made) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) { /* our own mkdtemp folder */ } }
}

console.log("\n-- 3. run-e2e.js reads the shared pattern, and keeps no copy of its own --");
rec("it loads testlib-skip-line.js", /require\(\s*["']\.\/testlib-skip-line\.js["']\s*\)/.test(RUNNER_CODE));
rec("…and filters a passing file's output with SKIP_LINE", /\.filter\(\s*\(?\s*l\s*\)?\s*=>\s*SKIP_LINE\.test\(\s*l\s*\)\s*\)/.test(RUNNER_CODE));
rec("…and keeps no skip pattern of its own", !/\/\^[^/\n]*skip/i.test(RUNNER_CODE.replace(/SKIP_LINE/g, "")), (RUNNER_CODE.match(/\/\^[^/\n]*skip[^\n]*/i) || [""])[0]);

console.log("\n=== an e2e file that says it skipped is not a pass: " + checks + " checks, " + fails.length + " failed ===");
process.exitCode = fails.length ? 1 : 0;
