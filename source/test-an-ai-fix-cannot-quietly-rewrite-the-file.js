// ⛔ #ai-fix-size-gate-let-half-the-file-go — THE AI FIX PATH ACCEPTED A FILE THAT HAD LOST HALF ITS CONTENT.
//
// Everything on that path is asked of the model as a MINIMAL edit. Its own system prompt says "Preserve
// everything else exactly … byte-for-byte unchanged" and "Make the smallest possible edit". The gate that
// decided whether to write the answer back said only:
//
//     fixed.length < originalNorm.length * 0.5 && (originalNorm.length - fixed.length) > 400
//
// i.e. it refused ONLY a file that had dropped below HALF. A file at the 120,000-byte input cap could come
// back at 60,001 bytes — ~60 KB of whole, brace-balanced blocks silently gone — and pass every check on the
// way to disk: not empty, different from the original, braces balanced (entire blocks leave together), and
// 51% of its size retained. It was then written, and reported as "AI applied a minimal fix".
//
// The gate is now an absolute delta sized like the edit actually requested, and SYMMETRIC: a model that
// DUPLICATES content also balances its braces, and that exact shape once doubled every conditional in a
// focus tree (#focus-effect-adopted-twice).
//
// ⚠️ BOTH DIRECTIONS. A gate that refuses everything would pass the "half a file is rejected" check while
// making the whole tier useless, so the genuine one-line repair below must still be accepted.
//
// Found by auditing all 13 rules that offered an AI button — each probed with a real fixture, then
// adversarially refuted. The refuter that surfaced this was arguing FOR keeping its rule's button.
"use strict";
const fs = require("fs");
const path = require("path");
const { maskJsComments } = require("./testlib-strip-comments.js");

let pass = 0;
const fails = [];
const ok = (cond, label, detail) => {
  if (cond) { pass++; console.log("  ok   " + label); }
  else { fails.push(label); console.log("  FAIL " + label + (detail !== undefined ? "   -> " + JSON.stringify(detail).slice(0, 320) : "")); }
};

const src = maskJsComments(fs.readFileSync(path.join(__dirname, "server.js"), "utf8"));

console.log("\n-- the old ratio gate is gone --");
{
  // The exact expression that let a 49% loss through. Anchored on the ratio itself, not the whole line,
  // so a reformat does not silently retire this check.
  ok(!/originalNorm\.length\s*\*\s*0\.5/.test(src),
    "no gate accepts a file merely for staying above half its original size",
    "the 0.5 ratio test is still there");
}

console.log("\n-- …replaced by an absolute delta, applied in BOTH directions --");
{
  ok(/const\s+sizeDelta\s*=\s*fixed\.length\s*-\s*originalNorm\.length/.test(src),
    "the gate measures the actual byte delta");
  ok(/Math\.abs\(sizeDelta\)\s*>\s*maxDelta/.test(src),
    "…and refuses growth as well as loss — a duplicating model also balances its braces");
  ok(/Math\.max\(\s*1500\s*,\s*Math\.round\(originalNorm\.length\s*\*\s*0\.02\)\s*\)/.test(src),
    "…with a floor for small files and a proportion for large ones");
}

console.log("\n-- the numbers the gate would apply, at the sizes that matter --");
{
  // Derived from the source rather than retyped, so the arithmetic below cannot drift from the code.
  const m = /Math\.max\(\s*(\d+)\s*,\s*Math\.round\(originalNorm\.length\s*\*\s*([0-9.]+)\)\s*\)/.exec(src);
  ok(!!m, "the gate's constants are readable from source", m && m.slice(1));
  if (m) {
    const floor = Number(m[1]), frac = Number(m[2]);
    const cap = (n) => Math.max(floor, Math.round(n * frac));
    // The input cap is enforced earlier on this path; a file at it is the worst case the gate ever sees.
    const inputCap = 120000;
    ok(/original\.length\s*>\s*120000/.test(src), "the 120,000-byte input cap is still upstream of the model");
    ok(cap(inputCap) < 5000,
      `at the input cap the gate allows ${cap(inputCap)} bytes, not ~60,000`, cap(inputCap));
    // What the OLD gate would have allowed on the same file, for the record.
    const oldAllowed = Math.floor(inputCap * 0.5);
    ok(oldAllowed > cap(inputCap) * 10,
      `…where the old ratio gate allowed ${oldAllowed} — more than 10x as much`, { old: oldAllowed, now: cap(inputCap) });
    // A genuine one-line repair must still fit comfortably, on a small file and a large one.
    ok(cap(2000) >= 1500, "a one-line fix on a small file is still allowed", cap(2000));
    ok(cap(60000) >= 1200, "…and on a large one", cap(60000));
  }
}

console.log("\n-- the refusal says what happened, so it can be done by hand --");
{
  const at = src.indexOf("sizeDelta");
  const near = src.slice(at, at + 1200);
  ok(/Nothing was changed/.test(near), "it states that the file was left alone");
  ok(/toLocaleString\(\)/.test(near), "…and quotes the actual byte counts rather than a vague 'too much'");
}

console.log("\n-- and the prompt no longer says 'undefined' --");
{
  // refContext is optional. Interpolating it unguarded produced: It references character "X" via undefined.
  const at = src.indexOf("const refDetail");
  const near = src.slice(at, at + 400);
  ok(at !== -1, "refDetail is still built here");
  ok(/problem\.refContext\s*\?/.test(near),
    "the context clause is conditional, so a rule without one reads correctly", near.slice(0, 200));
}

console.log(`\n=== an ai fix cannot quietly rewrite the file: ${pass} checks, ${fails.length} failed ===`);
fails.forEach((f) => console.log("   FAILED: " + f));
process.exit(fails.length ? 1 : 0);
