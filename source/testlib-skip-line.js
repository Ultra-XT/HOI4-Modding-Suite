// ⛔ #a-skip-the-runner-cannot-hear-reads-as-a-pass — WHAT COUNTS AS "THIS SECTION DID NOT RUN" IN A TEST'S OUTPUT, IN ONE PLACE.
//
// run-tests.js lifts these lines out of files that PASSED and names them in its summary, so a green tick over a section that
// stopped running is not mistaken for coverage (#an-engine-trace-pinned-to-a-build-that-is-gone-reads-as-a-pass). It heard only
// a line whose first word was SKIP in capitals, /^\s{0,8}SKIP\b/. Measured 2026-11-04, 67 test files print theirs another way,
// and the runner heard none of them: "SKIPPED — …" (no word boundary after SKIP), "(skipped — vanilla not installed)",
// "skip  (…)", "(skip) …", "--  SKIPPED: …", "⚠ SKIP — …". Several are the content-pinned class that hid the Turkey check ("no
// installed events file ships the shape any more", "no installed map ships a mixed-case idea category"): any of them could
// have gone dark after a game or mod update while its file stayed green, with nothing in the run saying so.
//
// So a test may say it skipped in any of those ways. The line must begin (after at most 8 spaces, an optional "-- " or run of
// "⚠", and an optional "(") with skip / skipped / skipping in any case, followed by a space, ")", ":", an em or en dash, or the
// end — so a check label like "skip-list" or a closing "=== … 2 SKIPPED ===" line is not counted.
// test-every-skip-a-test-prints-is-heard.js holds every skip line printed by every test file to this pattern, and holds
// run-tests.js to using it.
"use strict";

const SKIP_LINE = /^\s{0,8}(?:--\s+|⚠+\s*)?\(?(?:skip(?:ped|ping)?)(?=[\s):—–]|$)/i;

// What a skip line says after its skip word, for the runner's summary: "(skipped — vanilla not installed)" → "vanilla not
// installed", "  skip  (no HOI4 install)" → "(no HOI4 install)", "  ⚠ SKIP — no game" → "no game".
function skipWhy(line) {
  const t = String(line).trim();
  const wrapped = /^(?:--\s+|⚠+\s*)?\(/.test(t) && /\)$/.test(t) && !/^(?:--\s+|⚠+\s*)?\((?:skip(?:ped|ping)?)\)/i.test(t);
  const why = t.replace(/^(?:--\s+|⚠+\s*)?\(?(?:skip(?:ped|ping)?)\)?\s*[:—–-]?\s*/i, "");
  return wrapped ? why.replace(/\)$/, "") : why;
}

module.exports = { SKIP_LINE, skipWhy };
