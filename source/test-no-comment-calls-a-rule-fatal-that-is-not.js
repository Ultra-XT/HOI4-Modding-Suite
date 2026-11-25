// No comment in the shipping source says a map rule IS fatal when the curated set says it is not.
// #a-fatal-claim-outlives-the-set-it-came-from
//
// THE DEFECT. `severity === "error"` does not mean "will crash" — the authority is the curated FATAL set in
// public/map-rule-labels.js (CLAUDE.md §"A validator must not cry wolf"). That set MOVES: on 2026-09-17 it
// lost state_no_air_base_or_rocket_site and state_owns_no_land, both withdrawn by the owner's own launches
// after being argued in on a trace of hoi4.exe. The set moved; four comments in map-data.js did not, and went
// on telling the next reader, in the present tense, that those rules stop a Save:
//
//   map-data.js  "⛔ FATAL (2026-09-17)."                                     state_owns_no_land
//                — the paragraph that argued it in, hours before it came back out
//   map-data.js  "state_no_air_base_or_rocket_site, FATAL, Save stopped."     the erase path's note
//   map-data.js  "state_no_air_base_or_rocket_site, FATAL."                   the province-move note
//   map-data.js  "…which is FATAL: the slot pass gave each of them…"          the duplicate-province note
//
// A comment is content here, and a claim about what stops a Save is exactly the kind a later reader acts on:
// the four above would have sent someone to re-add a gate the game has already disproved. #a-test-can-encode
// -the-old-behaviour is the same shape one layer down — prose decays the same way code does, and only a
// derived check notices.
//
// WHAT THIS DOES. It reads the COMMENTS of the shipping source (masked length-preservingly, so the line
// numbers it prints are the ones you can open), finds every PRESENT-TENSE fatal claim — "is FATAL",
// ", FATAL." / ", FATAL," / ", FATAL:", "(FATAL)", "FATAL since", "FATAL (2026-09-17)" — attributes each to
// the nearest rule name before it, and asks the set. Past tense is deliberately untouched: "was FATAL", "used to be FATAL" and
// "curated-FATAL at the time" are history, and history is what these comments are for.
//
// Run: node test-no-comment-calls-a-rule-fatal-that-is-not.js
"use strict";

const fs = require("fs");
const path = require("path");

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (ok || detail == null ? "" : "   -> " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 600)));
  if (!ok) fails.push(label);
};

const ML = require("./public/map-rule-labels.js");
const { maskJsComments } = require("./testlib-strip-comments.js");

// The rule names to attribute a claim to: every rule the label module knows, plus every rule the validator
// pushes — DERIVED, so a rule that exists only in map-data.js is still recognised.
const KNOWN = new Set(Object.keys(ML.LABELS));
{
  const src = fs.readFileSync(path.join(__dirname, "map-data.js"), "utf8");
  for (const m of maskJsComments(src).matchAll(/rule:\s*"([a-z0-9_]+)"/g)) KNOWN.add(m[1]);
}

/** The COMMENT text of a file, with every code character blanked — same length, so line numbers survive. */
function commentsOnly(src) {
  const masked = maskJsComments(src);
  let out = "";
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (c === "\n" || c === "\r") { out += c; continue; }
    out += (masked[i] !== c) ? c : " ";   // masked blanks COMMENTS, so a difference IS the comment
  }
  // The markers themselves are not prose, and one sits between a rule name and its claim whenever the
  // sentence wraps: "state_no_air_base_or_rocket_site," then "// FATAL, Save stopped". Blanked IN PLACE, so
  // the claim reads as one sentence and every offset still points at the same character of the file.
  return out.replace(/\/\//g, "  ").replace(/^([ \t]*)\*/gm, (m, lead) => lead + " ");
}

// Present tense only. "was FATAL", "used to be FATAL", "curated-FATAL at the time" are history and are left alone.
const CLAIM = /\b(?:is (?:in )?FATAL|,\s*FATAL[.,:]|\(FATAL[),]|FATAL since|FATAL \(\d{4}-\d\d-\d\d\))/g;

/** Every present-tense fatal claim in one file, with the rule it is about (or null). */
function claimsIn(rel) {
  const src = fs.readFileSync(path.join(__dirname, rel), "utf8");
  const text = commentsOnly(src);
  const out = [];
  let m;
  CLAIM.lastIndex = 0;
  while ((m = CLAIM.exec(text))) {
    const back = text.slice(Math.max(0, m.index - 200), m.index);
    const toks = [...back.matchAll(/\b([a-z][a-z0-9_]{5,})\b/g)].map((x) => x[1]).filter((t) => KNOWN.has(t));
    out.push({
      file: rel,
      line: src.slice(0, m.index).split("\n").length,
      rule: toks.length ? toks[toks.length - 1] : null,
      claim: m[0],
      context: back.slice(-90).replace(/\s+/g, " ").trim() + m[0],
    });
  }
  return out;
}

// Derived from what the repo ships, not typed in: every root module plus the map pages, which is where the
// map rules are written about. A new file that talks about the set is covered the moment it is added.
const FILES = fs.readdirSync(__dirname)
  .filter((f) => f.endsWith(".js") && !f.startsWith("test-") && !f.startsWith("testlib-") && !f.startsWith("e2e-") && !f.startsWith("run-"))
  .concat(fs.readdirSync(path.join(__dirname, "public")).filter((f) => f.endsWith(".js")).map((f) => "public/" + f));

try {
  console.log("0. THE CONTROLS: the scan reads comments, not code, and really sees a claim");
  {
    rec("the curated set is there to ask", ML.FATAL instanceof Set && ML.FATAL.size > 5, ML.FATAL.size);
    rec("…and it really did lose the two rules this test was written for",
      !ML.isFatalRule("state_owns_no_land") && !ML.isFatalRule("state_no_air_base_or_rocket_site"),
      { owns: ML.isFatalRule("state_owns_no_land"), air: ML.isFatalRule("state_no_air_base_or_rocket_site") });
    // ⭐ A POSITIVE CONTROL, because a scan that finds nothing passes for the wrong reason.
    const probe = 'const FATAL = new Set(["empty_state"]);\n// a note: state_owns_no_land is FATAL, so Save stops\nreturn { FATAL, x };\n';
    const text = commentsOnly(probe);
    rec("⭐ the scan finds a claim planted in a comment", /is FATAL/.test(text), JSON.stringify(text));
    rec("⭐⭐ …and NOT the same words sitting in code", !/FATAL, x/.test(text), JSON.stringify(text));
    const back = text.slice(0, text.indexOf("is FATAL"));
    const toks = [...back.matchAll(/\b([a-z][a-z0-9_]{5,})\b/g)].map((x) => x[1]).filter((t) => KNOWN.has(t));
    rec("⭐⭐ …and attributes it to the rule named beside it", toks[toks.length - 1] === "state_owns_no_land", toks);
    // …and the past tense is deliberately not a claim.
    CLAIM.lastIndex = 0;
    rec("⭐ history is left alone: \"was FATAL\" is not read as a claim",
      !CLAIM.test("// state_owns_no_land was FATAL until the launch on 09-16"), "was FATAL");
    CLAIM.lastIndex = 0;
    rec("…nor is \"curated-FATAL at the time\"", !CLAIM.test("// state_no_air_base_or_rocket_site, curated-FATAL at the time and an ERROR since"), "curated-FATAL at the time");
  }

  console.log("\n1. ⭐⭐⭐ Every present-tense fatal claim in the shipping source is true of the set today");
  {
    const all = [];
    for (const f of FILES) { try { all.push(...claimsIn(f)); } catch (_) { /* a file that cannot be read is another test's problem */ } }
    const attributed = all.filter((c) => c.rule);
    rec("the sweep found claims to check (so a pass means something)", attributed.length >= 3,
      { claims: all.length, attributed: attributed.length });
    const stale = attributed.filter((c) => !ML.isFatalRule(c.rule));
    rec("⭐⭐⭐ no comment calls a rule FATAL that the curated set does not", stale.length === 0,
      stale.map((c) => `${c.file}:${c.line} ${c.rule} — ${c.context}`));
    for (const c of attributed) console.log(`       ${ML.isFatalRule(c.rule) ? "ok" : "STALE"}  ${c.file}:${c.line}  ${c.rule}`);
    // Unattributable claims are prose about a class ("an empty state is FATAL"), not about a named rule, so
    // they are counted and shown rather than failed — a guard that cries wolf on English is a guard nobody keeps.
    const loose = all.filter((c) => !c.rule);
    console.log(`       (${loose.length} claim(s) name no rule and are not judged: ${loose.map((c) => c.file + ":" + c.line).join(", ")})`);
  }
} catch (e) {
  rec("harness", false, String((e && e.stack) || e));
} finally {
  console.log(`\n=== no comment calls a rule fatal that is not: ${checks} checks, ${fails.length} failed ===`);
  if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
}
