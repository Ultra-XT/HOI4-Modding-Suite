// #flag-block-form-truncated — A 665-FOCUS WORKSHOP TREE COULD NOT BE SAVED AT ALL.
//
// HOI4's timed-flag form is `set_country_flag = { flag = X days = 90 value = 1 }`. The flag-token sanitiser
// in public/app.js matched the value side with `(\S+)`, which on that line captures a bare `{`. `{` is not
// in the legal-token class, so it was rewritten to `_`, collapsed, and stripped to the empty string —
// leaving `cleaned || rawTok` to emit `set_country_flag = {` and DROP the rest of the line. One open brace,
// no close.
//
// The save then refused the entire tree:
//   Focus "CZE_mfo_sinaj" effect rewrite blocked: Unbalanced braces (missing closing) in managed effects
//   segment.
// The brace it complained about was one Nova's own serializer had just created, and the focus it named was
// not the one at fault. Millennium Dawn's czech_republic.txt uses that form 12 times, so that tree simply
// could not be edited with Nova — and nothing the modder changed in the editor could get past it.
//
// The sanitiser exists for exactly one case, stated in its own comment: a flag name the GFX-flag wizard
// imported from a FILENAME. A block is not a token and was never its business.
//
// ⭐ THE SECOND HALF IS THE SIBLING. The same file carries a VALIDATOR twin that also matched with `(\S+)`
// and additionally tested the token against [A-Za-z0-9_] — a charset the serializer had already been
// widened away from, because HOI4 writes `@` for dynamic scope in 100 of vanilla's 8,393 scalar flag
// assignments and 258 of Millennium Dawn's 14,122. The warning cried "Suspicious flag token … not
// filename/path" over hundreds of lines the game itself produces. One rule, two callers, one never adopted it.
"use strict";
const fs = require("fs");
const path = require("path");
const { stripJsComments } = require("./testlib-strip-comments.js");

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

const APP = fs.readFileSync(path.join(__dirname, "public", "app.js"), "utf8");
const APP_CODE = stripJsComments(APP);

// ── Drive the REAL branch source, not a transcription of it ─────────────────────────────────────────────
// ⚠️ Lifting the whole ENCLOSING function was the first attempt and it was wrong twice over: the marker
// string appears at the VALIDATOR site first, so it lifted collectValidationIssues rather than the
// serializer, and that function is far too large and too entangled to evaluate standalone. Extract the
// flag branch itself — the real source lines from app.js — and run those.
const SERIALIZER_MARKER = "m = t.match(";
function extractFlagBranch() {
  const lines = APP.split(/\r?\n/);
  // The serializer site is the one whose match is an assignment to an existing `m`, not a declaration.
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes("set_country_flag|clr_country_flag") && lines[i].trim().startsWith(SERIALIZER_MARKER)) { start = i; break; }
  }
  if (start === -1) return null;
  // ⚠️ DO NOT BRACE-COUNT THE MATCHER LINE. Its regex contains `[^\s{]` — a `{` inside a character class —
  // and counting it as an opening brace ran the extraction off the end of the branch and produced a
  // fragment with a stray `return`, which failed as "Illegal return statement". Start counting at the
  // `if (m) {` that follows, where the braces are real code.
  let ifAt = -1;
  for (let i = start + 1; i < Math.min(lines.length, start + 6); i++) {
    if (lines[i].trim() === "if (m) {") { ifAt = i; break; }
  }
  if (ifAt === -1) return null;
  let depth = 0, end = -1;
  for (let i = ifAt; i < lines.length; i++) {
    for (const ch of lines[i]) {
      if (ch === "{") depth++;
      else if (ch === "}") { depth--; if (depth === 0) { end = i; break; } }
    }
    if (end !== -1) break;
  }
  if (end === -1) return null;
  return { src: lines.slice(start, end + 1).join("\n"), start: start + 1, end: end + 1 };
}

console.log("\n[the real code] extracting the serializer's flag branch out of app.js");
const branch = extractFlagBranch();
rec("the flag branch was located in app.js", !!branch, branch);
if (branch) console.log(`     app.js:${branch.start}-${branch.end}`);

let runBranch = null;
if (branch) {
  try {
    // `return;` inside the branch must mean "this line was claimed"; anything reaching the sentinel fell
    // through to the generic handler, which passes the line verbatim.
    // eslint-disable-next-line no-new-func
    runBranch = new Function("t", `
      const out = [];
      let m;
      (function () {
        ${branch.src}
        out.push("__FELL_THROUGH__");
      })();
      return out[0];
    `);
  } catch (e) {
    rec("the extracted branch is runnable", false, e.message);
  }
}
rec("the extracted branch is callable", typeof runBranch === "function", typeof runBranch);

// A line the branch does not claim is passed through by normalizeLegacyEffectCommand unchanged.
const run = (lines) => {
  if (typeof runBranch !== "function") return null;
  const t = String(lines[0]).trim();
  try {
    const r = runBranch(t);
    return [r === "__FELL_THROUGH__" ? t : r];
  } catch (e) { return [{ error: e.message }]; }
};

console.log("\n[CONTROL] the case the sanitiser was actually written for still works");
{
  const out = run(["set_country_flag = flag_from_file.dds"]);
  const got = Array.isArray(out) ? String(out[0]) : String(out);
  console.log(`     -> ${got}`);
  // ⚠️ If the filename case stopped being cleaned, the fix went too far and this test is measuring the
  // wrong thing.
  rec("a filename-derived token still has its extension stripped", /set_country_flag = flag_from_file\b/.test(got) && !/\.dds/.test(got), got);

  const legal = run(["set_country_flag = embargo@PREV"]);
  const gotLegal = Array.isArray(legal) ? String(legal[0]) : String(legal);
  console.log(`     -> ${gotLegal}`);
  rec("a legal @-scoped token is left alone", /embargo@PREV/.test(gotLegal), gotLegal);
}

console.log("\n[THE BUG] HOI4's one-line timed-flag block must survive the serializer intact");
{
  const cases = [
    "set_country_flag = { flag = CZE_mfo_sinaj days = 90 value = 1 }",
    "clr_country_flag = { flag = X }",
    "set_global_flag = { flag = Y value = 2 }",
    "clr_global_flag = { flag = Z }",
  ];
  for (const c of cases) {
    const out = run([c]);
    const got = Array.isArray(out) ? String(out[0]) : String(out);
    const opens = (got.match(/\{/g) || []).length;
    const closes = (got.match(/\}/g) || []).length;
    console.log(`     ${got.slice(0, 78)}`);
    // ⚠️ `opens === closes` ALONE IS VACUOUS. On the first run the extraction failed, `got` was the string
    // "null", and 0 === 0 passed every one of these while nothing had been exercised at all. Require the
    // output to be the real line before believing its brace count.
    rec(`${c.split(" ")[0]} block is returned intact`, got.trim() === c, got);
    rec(`…with its braces still balanced`, got.trim() === c && opens === closes && opens === 1, { got, opens, closes });
  }
}

console.log("\n[⭐ the sibling] the validator must not warn about what the serializer preserves");
{
  // The validator is a different site in the same file. Check its two rules at source level, because it
  // pushes into an `issues` array that is only assembled inside a much larger routine.
  const flagSites = [...APP_CODE.matchAll(/\/\^\((?:set_country_flag\|[^/]*?)\)\\s\*=\\s\*\(([^)]*)\)\//g)]
    .map((m) => m[1]);
  console.log(`     flag-command matchers found: ${flagSites.length} -> ${JSON.stringify(flagSites)}`);
  // ⚠️ If the sweep finds none, every check below passes for the wrong reason.
  rec("both flag matchers were found", flagSites.length === 2, flagSites);
  rec("neither can capture a block-opening brace",
    flagSites.every((s) => s.includes("[^\\s{]")), flagSites);

  // ⚠️ A regex that tries to CAPTURE the class body cannot work here: the body is `@.\-\[\]`, which
  // contains an escaped `]`, so any `[^\]]*` capture stops in the middle of it. That is why this reported
  // "not found" on the first run. Match the two literal forms instead.
  const OLD_CHARSET = String.raw`/^[A-Za-z0-9_]+$/.test(keyName)`;
  const NEW_CHARSET = String.raw`/^[A-Za-z0-9_@.\-\[\]]+$/.test(keyName)`;
  console.log(`     validator uses the narrow charset: ${APP_CODE.includes(OLD_CHARSET)}`);
  console.log(`     validator uses the serializer's charset: ${APP_CODE.includes(NEW_CHARSET)}`);
  rec("the validator no longer tests against [A-Za-z0-9_] alone", !APP_CODE.includes(OLD_CHARSET), "narrow charset still present");
  rec("…and admits the characters HOI4 actually writes (@ . - [ ])", APP_CODE.includes(NEW_CHARSET), "widened charset not found");
}

console.log("\n[the corpus] this shape is real, not hypothetical");
{
  const CZE = "D:/SteamLibrary/steamapps/workshop/content/394360/2777392649/common/national_focus/czech_republic.txt";
  if (!fs.existsSync(CZE)) {
    console.log("     SKIPPED — Millennium Dawn is not installed");
    rec("the corpus check is skipped only because the mod is absent", true, "skipped");
  } else {
    const t = fs.readFileSync(CZE, "utf8");
    const hits = t.split(/\r?\n/).filter((l) => /^\s*(set_country_flag|clr_country_flag|set_global_flag|clr_global_flag)\s*=\s*\{[^}]*\}/.test(l));
    console.log(`     czech_republic.txt contains ${hits.length} one-line timed-flag blocks`);
    rec("a real workshop tree uses the form", hits.length > 0, hits.length);
  }
}

console.log(`\n=== flag block form survives save: ${checks} checks, ${fails.length} failed ===`);
if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
