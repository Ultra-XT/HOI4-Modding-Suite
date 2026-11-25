// ensureOrRepairLocalizationHeader backs every maker's loc WRITE path (events/decisions/characters/ideas).
// HOI4 allows leading # comment / blank lines before the l_english: header — real mods ship such files.
// The repair must NOT prepend a SECOND header when the file opens with a comment (the latent bug fixed here),
// must still add a header when one is genuinely missing, and must be idempotent (re-saving never piles up
// headers). Pure-string function test.
"use strict";
const { ensureOrRepairLocalizationHeader: fix } = require("./server.js");

let pass = 0, fail = 0;
const check = (n, c, e) => { if (c) { pass++; console.log("  PASS", n); } else { fail++; console.log("  FAIL", n, e != null ? "→ " + e : ""); } };
const headerCount = (s) => (s.match(/^\s*l_english\s*:/gim) || []).length;

// 1. Empty / whitespace → a bare header.
check("empty → l_english:\\n", fix("") === "l_english:\n");
check("whitespace only → l_english:\\n", fix("   \n\n") === "l_english:\n");

// 2. Already starts with the header → unchanged (one header).
{
  const ok = "l_english:\n key:0 \"Hi\"\n";
  check("starts with header → unchanged", fix(ok) === ok);
  check("starts with header → exactly one header", headerCount(fix(ok)) === 1);
}

// 3. Starts with a key, no header → header prepended.
{
  const noHeader = " key:0 \"Hi\"\n other:0 \"x\"\n";
  const out = fix(noHeader);
  check("no header → header prepended", out.startsWith("l_english:\n") && out.includes(noHeader.trim().split("\n")[0].trim()));
  check("no header → exactly one header", headerCount(out) === 1);
}

// 4. THE FIX: comment line(s) BEFORE the header → unchanged (NO double header).
{
  const commented = "# Author(s): Someone\n# credits\nl_english:\n key:0 \"Hi\"\n";
  const out = fix(commented);
  check("comment-then-header → unchanged (no second header prepended)", out === commented, JSON.stringify(out.slice(0, 60)));
  check("comment-then-header → exactly ONE l_english: header", headerCount(out) === 1, "count=" + headerCount(out));
}

// 5. Comment then KEYS but no header → header prepended (first), comment preserved.
{
  const commentNoHeader = "# Author(s): Someone\n key:0 \"Hi\"\n";
  const out = fix(commentNoHeader);
  check("comment + keys (no header) → header prepended", headerCount(out) === 1 && /^l_english:\n/.test(out));
  check("comment preserved when header prepended", out.includes("# Author(s): Someone"));
}

// 6. Idempotent — repairing an already-repaired (or already-valid) file changes nothing further.
{
  for (const sample of ["", "l_english:\n a:0 \"x\"\n", "# c\nl_english:\n a:0 \"x\"\n", "# c\n a:0 \"x\"\n", " a:0 \"x\"\n"]) {
    const once = fix(sample), twice = fix(once);
    check(`idempotent for ${JSON.stringify(sample.slice(0, 16))}`, once === twice && headerCount(once) === 1, `once=${JSON.stringify(once)}`);
  }
}

// 7. Leading BOM is stripped from the returned content (writeUtf8BomFile re-adds exactly one).
check("leading BOM stripped", fix("﻿l_english:\n a:0 \"x\"\n") === "l_english:\n a:0 \"x\"\n");

console.log(`\nLOC-HEADER-REPAIR TEST: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
