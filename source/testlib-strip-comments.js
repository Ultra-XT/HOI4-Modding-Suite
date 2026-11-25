// Strip JS comments properly, for tests that need to ask "does this string appear in the CODE?"
//
// ⚠️ NOT NAMED test-*.js ON PURPOSE — run-tests.js enumerates `test-*.js` and would execute a helper as a
// test file.
//
// Why this exists. Several tests here check the shipped source for a construct, and every fix in this
// codebase explains itself in prose directly above the code — so the prose contains the exact strings the
// check is looking for. The naive stripper
//
//     src.replace(/\/\*[\s\S]*?\*\//g, " ").split("\n").map(l => l.replace(/(^|[^:])\/\/.*$/, "$1"))
//
// removes BLOCK comments first, and that is backwards: public/army.js:45 contains
//
//     //   … reads the real group names from common/units/*.txt (not invented):
//
// so the `/*` inside that LINE comment opened a phantom block that ran to the next `*/` — swallowing 3,091
// lines of real code and making a genuine call site look absent. It had already bitten the other way round,
// as a test whose own explanation matched its own grep.
//
// Order alone does not fix it either: strip line comments first and a `*/` sitting inside a block comment's
// `//` line disappears, leaving the block unterminated. So this is a single left-to-right scan that knows
// about string and template literals, regex literals, and both comment forms — which is what it takes to be
// right about a file that talks about JavaScript in its own comments.
"use strict";

// ONE scanner, two answers. `stripJsComments` wants the text; `scanAnomalies` wants to know whether the scan
// ended somewhere a valid JavaScript file cannot be. They were briefly two copies of this loop, which is the
// exact shape this project keeps getting bitten by — the fix lands next door and one caller never adopts it.
// A drifted oracle would go on certifying a stripper it no longer describes.
// `mask: true` blanks comments IN PLACE — same length, same newlines, so a caller can report line numbers a
// person can look up. #masker-desynced-on-a-regex-holding-a-quote: test-mod-writes-have-one-owner.js carried
// its own length-preserving masker, which had no idea what a regex literal was. `/replace_path\s*=\s*"([^"]+)"/g`
// put it into string state and it never came out — 1,740 comment lines in server.js and 174 in mod-index.js
// were being read as CODE by the guard that decides whether a write into a user's mod is allowed. The scanner
// here already got this right, and records the identical bug being fixed in it. One owner, two output modes.
function scanJs(src, opts) {
  // `literals: true` also blanks what is INSIDE strings, template text and regex literals (delimiters and `${`
  // kept), so a `{` or `}` left in the result is a real brace of the code. It implies `mask`.
  const literals = !!(opts && opts.literals);
  const mask = literals || !!(opts && opts.mask);
  const lit = (t) => (literals ? t.replace(/[^\n]/g, " ") : t);
  const s = String(src == null ? "" : src);
  let out = "";
  let i = 0;
  const n = s.length;
  const multiLineStrings = [];
  const lineAt = (idx) => { let L = 1; for (let k = 0; k < idx; k++) if (s[k] === "\n") L++; return L; };
  // Decide whether a `/` at position i opens a REGEX literal rather than being division: look back at the
  // last significant character. After a value (identifier, number, `)`, `]`) a slash is division.
  // ⛔ …AND THE LAST CHARACTER IS NOT THE LAST TOKEN. `return` ends in `n`, an identifier character, so this
  // test called the slash in `return /^(…|"[^"]*")$/.test(v)` a DIVISION — and then the `"` inside the regex
  // opened a string that ran until the next quote 700 lines below, taking every comment in between with it.
  // 85 comments survived in server.js alone for this reason, all of them in code a hunt had just added.
  // A keyword can only be followed by an operand, so a slash after one always opens a regex.
  const REGEX_AFTER_KEYWORD = new Set([
    "return", "typeof", "instanceof", "in", "of", "case", "do", "else", "void", "delete", "new", "yield",
    "await", "throw",
  ]);
  let lastWord = "";
  const regexAllowedAfter = (ch) => !ch || !/[A-Za-z0-9_$)\]]/.test(ch) || REGEX_AFTER_KEYWORD.has(lastWord);
  let lastSig = "";
  // ⛔ A TEMPLATE LITERAL IS NOT A QUOTED STRING, and treating it as one silently disarmed this helper for
  // most of `public/*.js`. This whole codebase builds HTML with nested templates, e.g. army.js:1610
  //
  //     + `<datalist id="…">${Object.keys(x).map((id) => `<option value="${esc(id)}"></option>`).join("")}</datalist>`
  //
  // Scanning to "the next backtick" ends the literal at the INNER template's opening backtick, so
  // `<option value="…"></option>` is read as code — and `regexAllowedAfter(">")` says a slash after an
  // operator opens a regex, so `/option>`).join("")}</` became a REGEX LITERAL that ate a backtick. The
  // outer template was then left open to end of file: from that line on, this function returned its input
  // with every comment intact. Measured on public/army.js — 1,634 lines stripped, 4,000 not — and any test
  // grepping the stripped source for a CALL SITE below that point would find prose and pass, or find
  // nothing and fail, with equal confidence.
  //
  // So track `${ … }` properly. Each open template remembers the brace depth outside it; we are in template
  // TEXT (no comments, no regex, no strings) whenever the running depth is back down to that mark, and in
  // ordinary CODE inside the substitution. That nests to any depth, which is what the source actually does.
  const tplDepths = [];
  let braceDepth = 0;
  while (i < n) {
    const c = s[i], d = s[i + 1];
    if (tplDepths.length && braceDepth === tplDepths[tplDepths.length - 1]) {
      // Inside template TEXT. Only three things end it: an escape, `${`, or the closing backtick.
      if (c === "\\") { out += lit(c + (d || "")); i += 2; continue; }
      if (c === "`") { tplDepths.pop(); out += c; i++; lastSig = "`"; continue; }
      if (c === "$" && d === "{") { out += "${"; i += 2; braceDepth++; lastSig = "{"; continue; }
      out += lit(c); i++;
      continue;
    }
    if (c === "/" && d === "/") {                    // line comment
      const from = i;
      while (i < n && s[i] !== "\n") i++;
      if (mask) out += " ".repeat(i - from);          // blank it in place, so offsets and lines survive
      continue;                                       // keep the newline itself
    }
    if (c === "/" && d === "*") {                     // block comment
      const from = i;
      i += 2;
      while (i < n && !(s[i] === "*" && s[i + 1] === "/")) i++;
      i += 2;
      if (mask) out += s.slice(from, Math.min(i, n)).replace(/[^\n]/g, " "); // newlines kept, so do line numbers
      else out += " ";
      continue;
    }
    if (c === "`") {                                  // template literal — hand it to the text branch above
      tplDepths.push(braceDepth);
      out += c; i++;
      continue;
    }
    if (c === '"' || c === "'") {                    // ordinary string
      const q = c, start = i;
      let raw = false;
      out += c; i++;
      while (i < n) {
        if (s[i] === "\\") { out += lit(s[i] + (s[i + 1] || "")); i += 2; continue; }
        if (s[i] === "\n") raw = true;               // JS forbids this — the opener was not really a quote
        if (s[i] === q) { out += s[i]; i++; break; }
        out += lit(s[i]);
        i++;
      }
      if (raw) multiLineStrings.push({ quote: q, line: lineAt(start) });
      lastSig = q; lastWord = "";
      continue;
    }
    if (c === "/" && regexAllowedAfter(lastSig)) {    // regex literal
      let j = i + 1, inClass = false, closed = false;
      while (j < n) {
        const e = s[j];
        if (e === "\\") { j += 2; continue; }
        if (e === "\n") break;                        // unterminated — treat the `/` as ordinary
        if (e === "[") inClass = true;
        else if (e === "]") inClass = false;
        else if (e === "/" && !inClass) { closed = true; j++; break; }
        j++;
      }
      if (closed) {
        const body = s.slice(i, j), end = body.lastIndexOf("/");
        out += literals ? "/" + lit(body.slice(1, end)) + body.slice(end) : body;
        i = j; lastSig = "/"; continue;
      }
    }
    if (/[A-Za-z_$]/.test(c)) {                      // whole identifier, so `lastWord` is the real last token
      let j = i;
      while (j < n && /[A-Za-z0-9_$]/.test(s[j])) j++;
      lastWord = s.slice(i, j);
      out += lastWord;
      lastSig = lastWord[lastWord.length - 1];
      i = j;
      continue;
    }
    if (c === "{") braceDepth++;
    else if (c === "}" && braceDepth > 0) braceDepth--;
    out += c;
    // Anything that is not part of an identifier ends the word — otherwise a stale `return` from five lines
    // up would keep saying "regex" after a `)`.
    if (!/\s/.test(c)) { lastSig = c; lastWord = ""; }
    i++;
  }
  return { out, endedInsideLiteral: tplDepths.length > 0, multiLineStrings };
}

function stripJsComments(src) { return scanJs(src).out; }
// Comments blanked, everything else byte-for-byte: `maskJsComments(x).length === x.length` always, and line
// N of the result is line N of the input. Use this whenever the answer is a LOCATION; stripJsComments when
// it is only "does this text appear".
function maskJsComments(src) { return scanJs(src, { mask: true }).out; }
// Comments AND the contents of every string, template and regex blanked, same length and lines. A brace left in
// the result is a brace of the code, so this is what to count braces in.
function maskJsLiterals(src) { return scanJs(src, { literals: true }).out; }

// The body of the function or route handler that starts at `from` in `code` (a maskJsLiterals result), as
// [open, close] indices of its braces — or null when the statement ends before any body opens.
// #a-counted-brace-inside-a-regex: two derived "every writer checks its root" scans counted braces in text where
// only comments were masked. A `\{` in a regex or a `{` in a template never closed, so 174 of 966 functions came
// back with an EMPTY body and a removed guard in 15 of them went unnoticed. The body is also the first brace that
// follows `)` or `=>`: the first brace after the name is often a default like `opts = {}` or an argument object.
function jsBodyAt(code, from) {
  let paren = 0;
  for (let i = from; i < code.length; i++) {
    const c = code[i];
    if (c === "(") paren++;
    else if (c === ")") paren--;
    else if (c === ";" && paren <= 0) return null;
    else if (c === "{") {
      let k = i - 1;
      while (k >= from && /\s/.test(code[k])) k--;
      if (code[k] !== ")" && !(code[k] === ">" && code[k - 1] === "=")) continue;
      let d = 0;
      for (let j = i; j < code.length; j++) {
        if (code[j] === "{") d++;
        else if (code[j] === "}" && --d === 0) return [i, j];
      }
      return null;
    }
  }
  return null;
}

// Self-check for the scanner above, so "did it actually strip?" is answerable without a second copy of the
// logic in a test. Both failures this helper has had were SILENT — it returned its input, and the 122 tests
// that grep stripped source went on passing because their own explanatory prose contained the strings they
// were looking for. Neither shape shows up as an exception or an empty result; the only evidence is that the
// scanner ended up somewhere a valid JavaScript file cannot be.
//
//   endedInsideLiteral — a file that is valid JS ends in CODE. Ending inside a string or template means a
//                        quote or backtick was mis-paired, and everything after it was returned verbatim.
//   multiLineStrings   — a `'` or `"` string cannot contain a raw newline in JavaScript. One that does is a
//                        runaway: the opener was really part of a regex the scanner called a division.
//                        (A backslash line-continuation is legal and is not counted.)
function scanAnomalies(src) {
  const r = scanJs(src);
  return { endedInsideLiteral: r.endedInsideLiteral, multiLineStrings: r.multiLineStrings };
}

module.exports = { stripJsComments, maskJsComments, maskJsLiterals, jsBodyAt, scanAnomalies };
