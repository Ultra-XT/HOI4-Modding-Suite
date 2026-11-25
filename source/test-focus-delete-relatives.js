// #focus-delete-teleports-relatives — deleting a focus teleported every focus positioned relative to it, and
// their whole sub-branches, to the top-left corner.
//
// A focus anchored with `relative_position_id` stores x/y as an OFFSET from that anchor — "one right, two
// down". applyDeleteSelectedFocuses filtered the deleted ids out of every survivor's prerequisites and
// mutuallyExclusive, but never touched relativePositionId and never marked the orphaned children
// moved/forceRewrite.
//
// At save time cleanupReferencesInBlock strips the now-dangling `relative_position_id = <deleted>` line, while
// rewriteFocusBlockPosition is SKIPPED for that focus because neither flag is set. So `x = 1 / y = 2` was
// written unchanged and silently became ABSOLUTE (1, 2).
//
// computeWriteValues already had the machinery for this (toAbsolute / stripRelative); it was simply never
// seeded from a deletion. The fix rebases each orphan to its displayX/displayY — the resolved on-screen
// position — and marks the block for re-emission.
//
// The rebase runs BEFORE refreshParsedDerived(), so displayX/displayY still hold the pre-delete layout, which
// is exactly the position the focus should keep.
//
// ⚠️ THIS FIX WAS INERT FOR ITS WHOLE LIFE, and this test passed anyway. It marked focus.forceRewrite — and
// forceRewrite is OWNED by computeWriteValues, whose first loop sets it false on every focus, running as
// rewriteCoordinates' first statement, before the write gate reads it. So the block was never re-emitted and
// the focus still teleported. The test asserted the flag was SET, which it was; nothing asserted it survived
// to the point of use. It marks focus.positionDirty now, which nothing clears (#force-rewrite-is-internal),
// and computeWriteValues gives such a focus a write value instead of emitting `x = undefined`
// (#position-dirty-had-no-write-value). Measured on Millennium Dawn's USA tree: deleting
// USA_focus_ending_clintonomics now writes its orphan at x = -15 / y = 9, the place it was already drawn,
// where before the file kept x = -2 / y = 1 and read it as absolute.
"use strict";
const fs = require("fs"), path = require("path");

let pass = 0, total = 0;
const ok = (n, c, x) => { total++; if (c) { pass++; console.log("  ok  " + n); } else console.error("  FAIL " + n + (x !== undefined ? " -> " + JSON.stringify(x) : "")); };

const src = fs.readFileSync(path.join(__dirname, "public", "app.js"), "utf8");

// ── the shipped rebase, pulled out and executed ──────────────────────────────────────────────────
const at = src.indexOf("#focus-delete-teleports-relatives");
ok("the rebase block exists", at > 0, "missing");
const blockStart = src.indexOf("parsed.focuses.forEach", at);
const blockEnd = src.indexOf("\n  });", blockStart);
const blockSrc = src.slice(blockStart, blockEnd + "\n  });".length);
ok("…and is a forEach over the surviving focuses", /^parsed\.focuses\.forEach/.test(blockSrc), blockSrc.slice(0, 120));

const runRebase = new Function("parsed", "deleteSet", "impactedIds", blockSrc + "\nreturn { parsed, impactedIds };");

// anchor <- child <- grandchild, plus an unrelated focus and one anchored to a SURVIVING focus
const mk = (id, o) => Object.assign({ id, x: 0, y: 0, displayX: 0, displayY: 0, relativePositionId: "" }, o);
const parsed = {
  focuses: [
    mk("survivor", { x: 10, y: 10, displayX: 10, displayY: 10 }),
    mk("child", { x: 1, y: 2, displayX: 6, displayY: 7, relativePositionId: "doomed" }),
    mk("grandchild", { x: 1, y: 1, displayX: 7, displayY: 8, relativePositionId: "child" }),
    mk("unrelated", { x: 3, y: 4, displayX: 3, displayY: 4 }),
    mk("anchored_to_survivor", { x: 2, y: 2, displayX: 12, displayY: 12, relativePositionId: "survivor" }),
  ],
};
const impacted = new Set();
runRebase(parsed, new Set(["doomed"]), impacted);
const byId = {}; parsed.focuses.forEach((f) => { byId[f.id] = f; });

// ── the orphan is rebased ────────────────────────────────────────────────────────────────────────
ok("THE ORPHANED CHILD KEEPS ITS ON-SCREEN POSITION", byId.child.x === 6 && byId.child.y === 7, { x: byId.child.x, y: byId.child.y });
ok("…its dangling anchor is cleared", byId.child.relativePositionId === "", byId.child.relativePositionId);
// positionDirty, not forceRewrite: see the note at the top. The flag has to still be set when the write gate
// reads it, and forceRewrite is not.
ok("…and it is marked for re-emission", byId.child.positionDirty === true, { positionDirty: byId.child.positionDirty, forceRewrite: byId.child.forceRewrite });
ok("…and reported as impacted so it is saved", impacted.has("child"), [...impacted]);

// ── everything else is left alone ────────────────────────────────────────────────────────────────
ok("a focus anchored to a SURVIVING focus keeps its anchor", byId.anchored_to_survivor.relativePositionId === "survivor", byId.anchored_to_survivor);
ok("…and keeps its relative offset", byId.anchored_to_survivor.x === 2 && byId.anchored_to_survivor.y === 2, byId.anchored_to_survivor);
// Checks the flag the write gate actually reads. Asserting !forceRewrite alone became trivially true once
// the rebase stopped setting it — a passing check that could no longer fail.
ok("…and is NOT marked for re-emission",
  !byId.anchored_to_survivor.positionDirty && !byId.anchored_to_survivor.forceRewrite,
  { positionDirty: byId.anchored_to_survivor.positionDirty, forceRewrite: byId.anchored_to_survivor.forceRewrite });
ok("the grandchild keeps its own surviving anchor", byId.grandchild.relativePositionId === "child", byId.grandchild);
ok("…so its offset is untouched", byId.grandchild.x === 1 && byId.grandchild.y === 1, byId.grandchild);
ok("an unrelated focus is untouched", byId.unrelated.x === 3 && byId.unrelated.y === 4 && !byId.unrelated.forceRewrite, byId.unrelated);
ok("the survivor itself is untouched", byId.survivor.x === 10 && !byId.survivor.forceRewrite, byId.survivor);
ok("only the orphan was reported impacted", impacted.size === 1, [...impacted]);

// ── a missing displayX must not write NaN ────────────────────────────────────────────────────────
{
  const p2 = { focuses: [mk("odd", { x: 5, y: 6, displayX: undefined, displayY: undefined, relativePositionId: "doomed" })] };
  runRebase(p2, new Set(["doomed"]), new Set());
  ok("a focus with no resolved position keeps its numbers rather than becoming NaN",
    p2.focuses[0].x === 5 && p2.focuses[0].y === 6, p2.focuses[0]);
  ok("…but its dangling anchor is still cleared", p2.focuses[0].relativePositionId === "", p2.focuses[0]);
}

// ── the wiring ───────────────────────────────────────────────────────────────────────────────────
// ⚠️ BRACE-MATCH THE FUNCTION, DO NOT TAKE A FIXED WINDOW. This used to slice 4000 characters, and adding a
// comment to the rebase pushed refreshParsedDerived() past the end of it. indexOf then returned -1, and -1 is
// less than any real index, so both ordering checks below failed for a reason that had nothing to do with
// ordering. A window sized to today's code is a test that breaks when someone explains something.
const delAt = src.indexOf("function applyDeleteSelectedFocuses");
let del = "";
{
  let i = src.indexOf("{", delAt), d = 0;
  for (; i < src.length; i++) {
    if (src[i] === "{") d++;
    else if (src[i] === "}") { d--; if (d === 0) { del = src.slice(delAt, i + 1); break; } }
  }
}
ok("applyDeleteSelectedFocuses was extracted whole", del.length > 500, del.length);
ok("the rebase lives inside applyDeleteSelectedFocuses", del.includes("#focus-delete-teleports-relatives"), "not in the delete path");
// Require both landmarks to EXIST as well as be in order — otherwise a missing one passes as -1.
const orderOk = (first, second) => {
  const a = del.indexOf(first), b = del.indexOf(second);
  return a !== -1 && b !== -1 && a < b;
};
ok("…and runs before refreshParsedDerived recomputes the layout",
  orderOk("#focus-delete-teleports-relatives", "refreshParsedDerived()"), "runs after the layout is recomputed, or one of the two is missing");
ok("…and before the impacted set is flushed",
  orderOk("#focus-delete-teleports-relatives", "markFocusesDirty"), "runs after the flush, or one of the two is missing");

console.log("\ntest-focus-delete-relatives: " + pass + "/" + total + " checks passed");
process.exitCode = pass === total && total >= 17 ? 0 : 1;
