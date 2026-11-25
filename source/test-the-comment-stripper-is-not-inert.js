// testlib-strip-comments.js must actually strip — and when it stops, it must not do so silently.
//
// 122 test files ask "does this construct appear in the CODE?" by stripping a source file first, because
// every fix in this codebase explains itself in prose directly above the code, so the prose contains the
// exact strings the check is looking for. That makes the stripper load-bearing for a fifth of the suite.
//
// It has now failed twice, and both failures were INVISIBLE:
//
//   1. A template literal was scanned as if it were a quoted string — "run to the next backtick". In
//      `public/army.js:1610`
//
//          + `<datalist id="…">${Object.keys(x).map((id) => `<option value="${esc(id)}"></option>`).join("")}</datalist>`
//
//      that ends the literal at the INNER template's opening backtick, so `<option value="…"></option>` was
//      read as code — and a slash after `>` looks like a regex, so `/option>`).join("")}</` was eaten as a
//      regex literal along with a backtick. The outer template was left open to end of file: from line 1610
//      on, the function returned its input. 4,000 lines of army.js, unstripped, for a shared helper whose
//      entire job is to strip.
//
//   2. `regexAllowedAfter` looked at the last CHARACTER, and `return` ends in `n`. So the slash in
//      `return /^([A-Za-z_][\w.\-]*|"[^"\r\n]*")$/.test(v)` was called a division, and the `"` inside the
//      regex opened a string that ran hundreds of lines. 85 comments in server.js survived that way.
//
// Neither threw, neither returned empty, and neither made a single test fail — a test grepping the
// unstripped region for a call site finds the prose that describes it and passes. So the guard cannot be
// "some comment got removed". It has to be a property a valid JavaScript file cannot violate:
//
//   • it ends in CODE — never inside a string or a template literal
//   • no `'`/`"` string contains a raw newline — JavaScript forbids it
//
// `scanAnomalies` reports both, and this test runs it over every tracked .js. Section 4 then pins the two
// real constructs by pulling them OUT OF THE REPO rather than typing them here, so the cases keep matching
// what the source actually contains.
"use strict";
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { stripJsComments, scanAnomalies } = require("./testlib-strip-comments.js");

let checks = 0;
const fails = [];
function rec(label, pass, detail) {
  checks++;
  if (!pass) fails.push(label);
  const d = detail === undefined || detail === null ? "" : String(detail).replace(/\r?\n/g, "|").slice(0, 150);
  console.log(`  ${pass ? "ok  " : "FAIL"}  ${label}${d ? "   " + d : ""}`);
}

const NOTE = "NOVA_STRIPPER_SENTINEL";
const kept = (src) => stripJsComments(src).indexOf(NOTE) !== -1;

console.log("1. The two constructs that broke it");
{
  rec("a nested template does not swallow the rest of the file",
    !kept(`x = \`<d>\${f.map((id) => \`<o v="\${e(id)}"></o>\`).join("")}</d>\`;\n// ${NOTE}\n`), "comment survived");
  rec("a regex after `return` is a regex, not a division",
    !kept(`const f = (v) => { return /^("[^"\\r\\n]*")$/.test(v) ? v : ""; };\n// ${NOTE}\n`), "comment survived");
  rec("…and after `typeof`", !kept(`if (typeof x === "s") {}\nvar r = /a"b/;\n// ${NOTE}\n`), "comment survived");
  rec("…and after `case`", !kept(`switch (x) { case /a"b/.source: break; }\n// ${NOTE}\n`), "comment survived");
}

console.log("\n2. …and the over-corrections they invite  (controls)");
{
  // A stripper that calls every slash a regex, or every backtick a plain quote, would pass section 1 while
  // being just as wrong in the other direction.
  rec("division after an identifier is still division", !kept(`var q = total/count;\n// ${NOTE}\n`), "comment survived");
  rec("division after a `)` is still division", !kept(`var q = (a + b)/c/d;\n// ${NOTE}\n`), "comment survived");
  rec("a keyword five lines up does not still mean regex",
    !kept(`function f() { return g(a); }\nvar q = (a)/b/c;\n// ${NOTE}\n`), "comment survived");
  rec("⭐ a `//` inside a string is CONTENT and is kept", kept(`var a = "// ${NOTE}";\n`), "content was stripped");
  rec("⭐ a `//` inside a template is CONTENT and is kept", kept(`var a = \`// ${NOTE}\`;\n`), "content was stripped");
  rec("⭐ …including inside a template's substitution", kept(`var a = \`x\${ "// ${NOTE}" }y\`;\n`), "content was stripped");
  rec("a `/*` inside a line comment does not open a block",
    !kept(`// reads common/units/*.txt (not invented):\nvar real = 1;\n// ${NOTE}\n`), "comment survived");
}

console.log("\n3. The oracle bites  (a broken scan must be reportable)");
{
  const a1 = scanAnomalies("var s = `abc\nstill inside\n");
  rec("CONTROL: ending inside a template is reported", a1.endedInsideLiteral === true, JSON.stringify(a1));
  const a2 = scanAnomalies('var s = "abc\ndef";\n');
  rec("CONTROL: a string spanning a newline is reported", a2.multiLineStrings.length === 1, JSON.stringify(a2));
  const a3 = scanAnomalies('var ok = "abc";\nvar t = `x${ y }z`;\nvar r = /a"b/;\n');
  rec("CONTROL: …and clean code reports neither",
    a3.endedInsideLiteral === false && a3.multiLineStrings.length === 0, JSON.stringify(a3));
  const a4 = scanAnomalies('var s = "abc\\\n def";\n');
  rec("CONTROL: a legal backslash line-continuation is NOT reported", a4.multiLineStrings.length === 0, JSON.stringify(a4));
}

console.log("\n4. The real constructs, taken from this repo  (not typed in here)");
let tracked = [];
try {
  tracked = execFileSync("git", ["ls-files", "*.js", "public/*.js", "scripts/*.js"], { cwd: __dirname })
    .toString().trim().split(/\r?\n/).filter(Boolean);
} catch (e) { /* fall through to the count check below */ }
rec("git ls-files returned the source set", tracked.length > 500, `${tracked.length} files`);
{
  // A line that opens a template and nests another one inside a substitution, and a line with a regex
  // directly after a keyword that carries a quote inside it. If either shape stops appearing in the repo the
  // count check fails loudly rather than the case quietly testing nothing.
  const nested = [];
  const kwRegex = [];
  for (const f of tracked) {
    let src = "";
    try { src = fs.readFileSync(path.join(__dirname, f), "utf8"); } catch (e) { continue; }
    for (const line of src.split("\n")) {
      // ⚠️ SELF-CONTAINED LINES ONLY. Most of these templates are one line of a `+`-joined expression that
      // spans a dozen, and a fragment torn out of the middle is not valid JavaScript — the first candidate
      // this found opened with `: ` and carried an unmatched `}`. Judging the stripper on input no stripper
      // could parse is a probe fault, not a finding. Balanced braces and an even backtick count is the test.
      const balanced = (line.match(/`/g) || []).length % 2 === 0
        && (line.match(/\{/g) || []).length === (line.match(/\}/g) || []).length
        && (line.match(/\(/g) || []).length === (line.match(/\)/g) || []).length;
      if (balanced && (line.match(/`/g) || []).length >= 4 && /\$\{[^}]*`/.test(line) && nested.length < 40) nested.push([f, line]);
      if (/\b(return|typeof|case|of|in)\s+\/(?=[^/\n]*")[^/\n]+\//.test(line) && kwRegex.length < 40) kwRegex.push([f, line]);
    }
  }
  rec("the repo still contains nested template literals", nested.length > 0, `${nested.length} lines`);
  rec("…and a keyword-led regex carrying a quote", kwRegex.length > 0, `${kwRegex.length} lines`);
  let bad = null;
  for (const [f, line] of nested) if (kept(`${line}\n// ${NOTE}\n`)) { bad = `${f}: ${line.trim().slice(0, 90)}`; break; }
  rec("⭐ every real nested-template line strips clean", bad === null, bad);
  bad = null;
  for (const [f, line] of kwRegex) if (kept(`${line}\n// ${NOTE}\n`)) { bad = `${f}: ${line.trim().slice(0, 90)}`; break; }
  rec("⭐ every real keyword-regex line strips clean", bad === null, bad);
}

console.log("\n5. Every tracked source file, scanned end to end");
{
  const anomalies = [];
  let scanned = 0;
  for (const f of tracked) {
    let src = "";
    try { src = fs.readFileSync(path.join(__dirname, f), "utf8"); } catch (e) { continue; }
    scanned++;
    const a = scanAnomalies(src);
    if (a.endedInsideLiteral) anomalies.push(`${f}: ends inside a string/template`);
    for (const m of a.multiLineStrings.slice(0, 2)) anomalies.push(`${f}:${m.line}: ${m.quote} string spans a newline`);
  }
  rec("the whole source set was scanned", scanned > 500, `${scanned} files`);
  rec("⭐ not one file leaves the scanner inside a literal", anomalies.length === 0, anomalies.slice(0, 4).join(" · "));
}

console.log("\n6. …and the file it broke on is stripped for its whole length");
{
  // ⚠️ The specific regression: `public/army.js` stripped for 1,634 lines and returned the remaining 4,000
  // verbatim. Take a comment from the LAST tenth of the file — derived by position, so it keeps pointing at
  // the region that was broken however the file grows — and require it gone.
  const p = path.join(__dirname, "public", "army.js");
  const lines = fs.readFileSync(p, "utf8").split("\n");
  const stripped = stripJsComments(fs.readFileSync(p, "utf8"));
  const from = Math.floor(lines.length * 0.9);
  let phrase = "";
  for (let i = from; i < lines.length; i++) {
    const m = /^\s*\/\/\s*(\S.{25,70})/.exec(lines[i]);
    if (m && !/[`"'\\]/.test(m[1])) { phrase = m[1]; break; }
  }
  rec("a comment exists in the last tenth of army.js", !!phrase, phrase);
  rec("⭐ …and stripping removes it", !!phrase && stripped.indexOf(phrase) === -1, phrase);
  rec("CONTROL: it really is in the raw file", !!phrase && fs.readFileSync(p, "utf8").indexOf(phrase) !== -1, phrase);
}

console.log(`\n=== the comment stripper is not inert: ${checks} checks, ${fails.length} failed ===`);
if (fails.length) {
  for (const f of fails) console.log("   FAILED: " + f);
  process.exitCode = 1;
}
