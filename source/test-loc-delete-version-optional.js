// Regression (bug-hunt #6): the delete-loc-cleanup helpers PROBED a key by `KEY:` (any format) but DELETED
// only lines matching `:\d+` (event/decision/char) or a hardcoded `:0` (idea). HOI4's loc version number is
// OPTIONAL — `KEY: "..."` and `KEY:2 "..."` are valid and vanilla/MD ship the version-less form by the
// million. So a version-less (or non-zero-version) key was probed as present, the file was rewritten and the
// delete reported success, yet the orphan line survived forever. Each helper now matches `:\d*\s*"..."`.
// Run: node test-loc-delete-version-optional.js
"use strict";
const fs = require("fs"), os = require("os"), path = require("path");
const S = require("./server.js");
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log("  PASS", n); } else { fail++; console.log("  FAIL", n, x != null ? "→ " + JSON.stringify(x) : ""); } };

const root = fs.mkdtempSync(path.join(os.tmpdir(), "nova-locdel-"));
const locDir = path.join(root, "localisation", "english");
fs.mkdirSync(locDir, { recursive: true });
const BOM = "﻿";
const write = (rel, body) => { const p = path.join(locDir, rel); fs.writeFileSync(p, BOM + body, "utf8"); return p; };
const read = (p) => fs.readFileSync(p, "utf8");
const has = (p, needle) => read(p).includes(needle);

try {
  // ── IDEA delete (removeIdeaLocalizationLines): mix of :0, version-less, and :2 forms ──
  const ideaFile = write("spirits_l_english.yml",
    `l_english:\n` +
    ` my_spirit:0 "Zero-version name"\n` +          // Nova's own form
    ` my_spirit_desc: "Version-less desc"\n` +       // MD/vanilla form (was orphaned: hardcoded :0)
    ` other_spirit:1 "Keep me"\n` +                  // different key — must survive
    ` my_spirit_extra:2 "Should stay (superstring)"\n`); // superstring of my_spirit — must survive
  S.removeIdeaLocalizationLines(ideaFile, "my_spirit");
  ok("idea :0 name stripped", !has(ideaFile, "Zero-version name"));
  ok("idea version-less _desc stripped (was orphaned)", !has(ideaFile, "Version-less desc"), read(ideaFile));
  ok("idea unrelated key preserved", has(ideaFile, "Keep me"));
  ok("idea superstring key preserved", has(ideaFile, "Should stay (superstring)"), read(ideaFile));

  // A non-zero-version name (`:3`) was ALSO missed by the old hardcoded `:0`. Confirm it's now removed.
  const ideaFile2 = write("spirits2_l_english.yml", `l_english:\n nz_spirit:3 "Non-zero version name"\n`);
  S.removeIdeaLocalizationLines(ideaFile2, "nz_spirit");
  ok("idea non-zero-version name stripped (was orphaned)", !has(ideaFile2, "Non-zero version name"), read(ideaFile2));

  // ── EVENT delete (removeEventLocalizationLines): version-less .t/.a orphaned by old :\d+ ──
  const evtFile = write("events_l_english.yml",
    `l_english:\n` +
    ` evt.1.t: "Version-less title"\n` +             // was orphaned
    ` evt.1.d:0 "Zero-version desc"\n` +
    ` evt.1.a: "Version-less option"\n` +            // was orphaned
    ` evt.10.t:0 "Different event — keep"\n`);       // evt.10 must NOT be caught by evt.1 anchor
  S.removeEventLocalizationLines(root, "evt.1");
  ok("event version-less .t stripped (was orphaned)", !has(evtFile, "Version-less title"), read(evtFile));
  ok("event :0 .d stripped", !has(evtFile, "Zero-version desc"));
  ok("event version-less .a stripped (was orphaned)", !has(evtFile, "Version-less option"), read(evtFile));
  ok("event evt.10 NOT collaterally removed (prefix-safe)", has(evtFile, "Different event — keep"), read(evtFile));

  // ── EXACT-KEY delete (removeExactKeyLocalizationLines): decision/character, version-less orphaned ──
  const decFile = write("decisions_l_english.yml",
    `l_english:\n` +
    ` my_decision: "Version-less decision"\n` +      // was orphaned
    ` my_decision_desc:0 "Zero-version desc"\n` +
    ` my_decision_2:0 "Superstring — keep"\n`);      // my_decision_2 must survive
  S.removeExactKeyLocalizationLines(root, "my_decision");
  ok("decision version-less name stripped (was orphaned)", !has(decFile, "Version-less decision"), read(decFile));
  ok("decision _desc stripped", !has(decFile, "Zero-version desc"));
  ok("decision superstring (my_decision_2) preserved", has(decFile, "Superstring — keep"), read(decFile));

  // ── CONTROL: the file still has a valid header + BOM after rewrite (not corrupted) ──
  ok("rewritten file keeps BOM", read(decFile).charCodeAt(0) === 0xFEFF);
  ok("rewritten file keeps l_english header", has(decFile, "l_english:"));
} catch (e) { fail++; console.log("  FAIL threw →", e && e.stack || e); }
finally {
  try { fs.rmSync(root, { recursive: true, force: true }); } catch (_) {}
  console.log(`\nLOC-DELETE-VERSION-OPTIONAL: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}
