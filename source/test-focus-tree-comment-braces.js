// Three defects in the focus_tree header writers, all reachable from the focus editor.
//
//  * setFocusTreeOwnership brace-matches against a comment-BLANKED copy of the file and says why. Its two
//    siblings — setFocusTreeContinuousPosition and setSharedFocusConnection — matched raw text, so a `#`
//    comment containing an unmatched `{` ("# TODO: wrap these in a { group later", or vanilla's own
//    sweden.txt) threw matchBraceForward off and made that tree AND every tree after it in the same file
//    unreachable. The user saw "focus_tree block not found (id X)" for a tree plainly present in the file.
//  * The position writer searched only the HEADER for an existing continuous_focus_position, while the
//    READER searches the whole body. A tree whose key sat after its first `focus = {` therefore got a SECOND
//    one inserted in the header — the tree declared it twice with conflicting values, reported ok.
//  * Coordinates went into script through String(number), and JavaScript renders anything from 1e21 up in
//    exponent form ("1e+21"), which is not a valid Clausewitz number. The reader then matched the leading
//    "1" and read the position back as 1.
"use strict";
const {
  setFocusTreeContinuousPosition,
  getFocusTreeContinuousPosition,
  setSharedFocusConnection,
  setFocusTreeOwnership,
} = require("./server.js");

const fails = [];
let checks = 0;
function rec(label, ok, detail) {
  checks++;
  if (ok) console.log("  ok   " + label);
  else {
    fails.push(label);
    console.log("  FAIL " + label + "  -> " + String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 400));
  }
}

// A comment carrying an unmatched brace INSIDE the tree body — this placement is what matters. A stray brace
// in a comment BEFORE `focus_tree = {` is harmless, because brace matching starts at the tree's own opening
// brace; only one inside the body is counted and pushes the computed close past the tree's real end, which
// swallows the following tree. Vanilla's sweden.txt ships this shape.
const COMMENTED_BRACE = [
  "focus_tree = {",
  "\tid = alpha_tree",
  "\tcountry = { factor = 1 }",
  "\t# TODO: wrap these in a { group later",
  "\tfocus = {",
  "\t\tid = alpha_focus_one",
  "\t\tx = 1",
  "\t\ty = 1",
  "\t}",
  "}",
  "",
  "focus_tree = {",
  "\tid = beta_tree",
  "\tcountry = { factor = 1 }",
  "\tfocus = {",
  "\t\tid = beta_focus_one",
  "\t\tx = 2",
  "\t\ty = 2",
  "\t}",
  "}",
  "",
].join("\n");

// The key declared AFTER the first focus block — legal, and what the header-only search missed.
const POS_BELOW_FOCUS = [
  "focus_tree = {",
  "\tid = late_tree",
  "\tcountry = { factor = 1 }",
  "\tfocus = {",
  "\t\tid = late_focus_one",
  "\t\tx = 1",
  "\t\ty = 1",
  "\t}",
  "\tcontinuous_focus_position = { x = 50 y = 60 }",
  "}",
  "",
].join("\n");

try {
  console.log("\n[comment brace] a # comment with an unmatched { must not hide the tree");
  let out = setFocusTreeContinuousPosition(COMMENTED_BRACE, { treeId: "alpha_tree", x: 10, y: 20 });
  rec("the first tree was found despite the comment", /continuous_focus_position/.test(out), out.slice(0, 260));
  rec("…and got the requested position",
    JSON.stringify(getFocusTreeContinuousPosition(out, "alpha_tree")) === JSON.stringify({ x: 10, y: 20 }),
    getFocusTreeContinuousPosition(out, "alpha_tree"));

  out = setFocusTreeContinuousPosition(COMMENTED_BRACE, { treeId: "beta_tree", x: 30, y: 40 });
  rec("the SECOND tree in the same file is still reachable",
    JSON.stringify(getFocusTreeContinuousPosition(out, "beta_tree")) === JSON.stringify({ x: 30, y: 40 }),
    getFocusTreeContinuousPosition(out, "beta_tree"));
  rec("…and the first tree was not touched", getFocusTreeContinuousPosition(out, "alpha_tree") === null,
    getFocusTreeContinuousPosition(out, "alpha_tree"));

  let shared = setSharedFocusConnection(COMMENTED_BRACE, { treeId: "beta_tree", sharedId: "some_shared_group", enabled: true });
  rec("shared-connection also finds the tree past the comment", /shared_focus\s*=\s*some_shared_group/.test(shared),
    shared.slice(0, 400));

  console.log("\n[duplicate key] an existing position below the first focus must be UPDATED, not duplicated");
  out = setFocusTreeContinuousPosition(POS_BELOW_FOCUS, { treeId: "late_tree", x: 111, y: 222 });
  rec("there is exactly ONE continuous_focus_position",
    (out.match(/continuous_focus_position/g) || []).length === 1,
    (out.match(/continuous_focus_position/g) || []).length + " :: " + out);
  rec("…and it holds the NEW value",
    JSON.stringify(getFocusTreeContinuousPosition(out, "late_tree")) === JSON.stringify({ x: 111, y: 222 }),
    getFocusTreeContinuousPosition(out, "late_tree"));
  rec("the old value is gone", !/x = 50 y = 60/.test(out), out);

  console.log("\n[big numbers] a coordinate must never be written in exponent notation");
  out = setFocusTreeContinuousPosition(POS_BELOW_FOCUS, { treeId: "late_tree", x: 1e21, y: -1e21 });
  rec("no exponent notation in the file", !/[0-9]e[+-]/i.test(out), (out.match(/continuous_focus_position[^}]*\}/) || [])[0]);
  const read = getFocusTreeContinuousPosition(out, "late_tree");
  rec("the value reads back as what was written (not silently 1)", read && Math.abs(read.x) > 1000, read);
  rec("…and is clamped rather than absurd", read && Math.abs(read.x) <= 1000000, read);

  out = setFocusTreeContinuousPosition(POS_BELOW_FOCUS, { treeId: "late_tree", x: NaN, y: Infinity });
  rec("NaN/Infinity degrade to a valid number", /x = -?\d+ y = -?\d+/.test(out),
    (out.match(/continuous_focus_position[^}]*\}/) || [])[0]);

  console.log("\n[control] ordinary files still behave exactly as before");
  const PLAIN = [
    "focus_tree = {",
    "\tid = plain_tree",
    "\tcountry = { factor = 1 }",
    "\tfocus = { id = plain_focus x = 1 y = 1 }",
    "}",
    "",
  ].join("\n");
  out = setFocusTreeContinuousPosition(PLAIN, { treeId: "plain_tree", x: 5, y: 6 });
  rec("a plain tree still gets its position",
    JSON.stringify(getFocusTreeContinuousPosition(out, "plain_tree")) === JSON.stringify({ x: 5, y: 6 }),
    getFocusTreeContinuousPosition(out, "plain_tree"));
  rec("the position is inserted after the id line", /id = plain_tree\s*\n\s*continuous_focus_position/.test(out), out);
  rec("the focus block is untouched", /focus = \{ id = plain_focus x = 1 y = 1 \}/.test(out), out);

  console.log("\n[control] a genuinely missing tree still errors");
  // Without this the comment fix could be "find any tree at all", which would write to the wrong one.
  let threw = false;
  try { setFocusTreeContinuousPosition(PLAIN, { treeId: "no_such_tree", x: 1, y: 1 }); } catch (_) { threw = true; }
  rec("asking for a tree that isn't there still throws", threw, "did not throw");

  console.log("\n[control] setFocusTreeOwnership was already correct and stays correct");
  const owned = setFocusTreeOwnership(COMMENTED_BRACE, { treeId: "beta_tree", tag: "SWE", weight: 100 });
  rec("ownership still resolves the commented file", /SWE/.test(owned), owned.slice(0, 300));

  console.log(`\n=== focus tree comment braces: ${checks} checks, ${fails.length} failed ===`);
  if (fails.length) {
    fails.forEach((f) => console.log("   FAILED: " + f));
    process.exitCode = 1;
  }
} catch (e) {
  console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
  process.exitCode = 1;
}
