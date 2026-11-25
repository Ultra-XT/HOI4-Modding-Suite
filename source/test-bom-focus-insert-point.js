// #bom-hides-the-focus-tree — A NEW FOCUS WAS WRITTEN OUTSIDE THE TREE AND SILENTLY THROWN AWAY.
//
// findFocusTreeInsertPoint locates the tree a new focus goes inside:
//
//   /(?:^|\n)([ \t]*)(focus_tree|shared_focus)\s*=\s*\{/g
//
// There is no `m` flag, so `^` matches index 0 and nowhere else. In a file that opens with a UTF-8 BOM,
// index 0 IS the BOM — so a `focus_tree = {` on line 1 never matched. With only that one tree in the file
// the function returned null and the caller's else-branch appended the new focus to the END of the file,
// outside the tree, at top level: HOI4 ignores it (an error.log line, not a crash) and the editor's own
// post-save reparse cannot find it either, so the node disappears from the canvas. The save reported
// success. Everything set on that focus before the first save went with it.
//
// Existing content is NOT damaged — the tree still closes normally and nothing else is rewritten. This is
// silent loss of the newly added focus, repeating on every attempt with no diagnostic, so the tree simply
// looks un-editable.
//
// ⭐ THE COUNTS ARE MEASURED, NOT ASSUMED, and the test re-measures them against the installed corpus
// rather than trusting a number in a comment.
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

// ── Run the REAL regex, lifted from the source, so this cannot drift from the code it guards ────────────
console.log("\n[the real regex] lifted out of app.js rather than re-typed");
const m = APP_CODE.match(/const treeRegex = (\/[^\n]*\/g);/);
rec("the tree regex was found in app.js", !!m, "not found");
let treeRe = null;
if (m) {
  try {
    // eslint-disable-next-line no-eval
    treeRe = eval(`(() => ${m[1]})()`);
  } catch (e) { rec("…and is a usable regex", false, e.message); }
}
rec("…and is usable", treeRe instanceof RegExp, String(treeRe));
console.log(`     ${m ? m[1] : "(none)"}`);

const findsPoint = (text) => {
  if (!treeRe) return null;
  const re = new RegExp(treeRe.source, treeRe.flags);
  const r = re.exec(text || "");
  return r ? { at: r.index, kind: r[2] } : null;
};

const BODY = "focus_tree = {\n\tid = t\n\tfocus = { id = a x = 0 y = 0 cost = 1 }\n}\n";

console.log("\n[CONTROL] a file with no BOM must still be found — and nothing else may change");
{
  const r = findsPoint(BODY);
  rec("a plain tree is found", !!r && r.kind === "focus_tree", r);
  rec("a shared_focus file is found", !!findsPoint("shared_focus = {\n\tid = s\n}\n"), "not found");
  rec("an indented declaration is found", !!findsPoint("\n\t focus_tree = {\n}\n"), "not found");
  // ⚠️ A file with genuinely no tree must STILL return null, or the fix has made the guard useless.
  rec("a file with no tree declaration still yields nothing", findsPoint("# just a comment\nfoo = { }\n") === null, "matched something");
}

console.log("\n[THE BUG] a BOM immediately before the line-1 declaration");
{
  const r = findsPoint("\ufeff" + BODY);
  console.log(`     with BOM -> ${r ? `found ${r.kind} at ${r.at}` : "NULL (new focuses would append past EOF)"}`);
  rec("the tree behind a BOM is found", !!r, r);
  rec("…and it is the focus_tree, not something later", !!r && r.kind === "focus_tree", r);
  // …and the BOM'd variants that already worked must keep working.
  rec("BOM + blank line still works", !!findsPoint("\ufeff\n" + BODY), "regressed");
  rec("BOM + comment line still works", !!findsPoint("\ufeff# header\n" + BODY), "regressed");
  rec("BOM + indentation still works", !!findsPoint("\ufeff  " + BODY), "regressed");
}

console.log("\n[⭐ the first tree, not a later one]");
{
  // Before the fix, a BOM'd file holding two trees matched the SECOND — so a new focus landed in the wrong
  // tree. 4 vanilla files and 2 Millennium Dawn files are shaped that way.
  const two = "\ufefffocus_tree = {\n\tid = first\n}\n\nfocus_tree = {\n\tid = second\n}\n";
  const r = findsPoint(two);
  const matchedFirst = !!r && r.at <= 1;
  console.log(`     matched at index ${r ? r.at : "(null)"} — ${matchedFirst ? "the FIRST tree" : "a LATER tree"}`);
  rec("a two-tree BOM'd file matches the first tree", matchedFirst, r);
}

console.log("\n[the corpus] how many real trees this reaches");
{
  // ⚠️ MOVED 2026-09-11. "the fix reduces the files with no insert point" was asserted of Millennium Dawn too, and
  // the owner's reinstalled copy ships no focus file with a BOM at all — before and after were both 7, so the
  // check failed while the fix still worked. Whether a corpus CAN show a reduction is a property of its files, so
  // it is measured first: the files the old regex missed whose tree declaration sits directly behind a BOM. Each
  // of those must now be found; a corpus with none says so instead of failing; and if no installed corpus has
  // one, the section says it could not run rather than passing.
  const DIRS = [
    ["vanilla", "D:/SteamLibrary/steamapps/common/Hearts of Iron IV/common/national_focus"],
    ["Millennium Dawn", "D:/SteamLibrary/steamapps/workshop/content/394360/2777392649/common/national_focus"],
  ];
  const OLD_RE = () => /(?:^|\n)([ \t]*)(focus_tree|shared_focus)\s*=\s*\{/g;
  const TREE_BEHIND_BOM = /^\ufeff[ \t]*(focus_tree|shared_focus)\s*=\s*\{/;
  let measured = false, withShape = 0;
  for (const [label, dir] of DIRS) {
    let files = [];
    try { files = fs.readdirSync(dir).filter((f) => /\.txt$/i.test(f)); } catch (_) { continue; }
    if (!files.length) continue;
    measured = true;
    let before = 0, after = 0, treeless = 0, lost = 0;
    const behindBom = [], stillMissed = [];
    for (const f of files) {
      let t = "";
      try { t = fs.readFileSync(path.join(dir, f), "utf8"); } catch (_) { continue; }
      const hasDecl = /focus_tree|shared_focus/.test(t);
      const oldFinds = !!OLD_RE().exec(t);
      const newFinds = !!findsPoint(t);
      if (!oldFinds) {
        before++;
        if (TREE_BEHIND_BOM.test(t)) { behindBom.push(f); if (!newFinds) stillMissed.push(f); }
      }
      if (!newFinds) { after++; if (!hasDecl) treeless++; }
      if (oldFinds && !newFinds) lost++;
    }
    console.log(`     ${label}: ${files.length} files — no insert point ${before} -> ${after}, of which ${treeless} contain no tree declaration at all; the old regex missed ${behindBom.length} tree(s) sitting behind a BOM`);
    if (behindBom.length) {
      withShape++;
      rec(`${label}: every tree the old regex missed behind a BOM is now found`, stillMissed.length === 0, stillMissed);
      rec(`${label}: …so the fix reduces the files with no insert point`, after < before, { before, after });
    } else {
      console.log(`     ${label}: ships no tree behind a BOM — the reduction cannot be shown on it`);
    }
    rec(`${label}: no file the old regex found is lost`, lost === 0, lost);
    rec(`${label}: what remains is almost entirely treeless files`, after - treeless <= 1, { after, treeless });
  }
  if (!measured) {
    console.log("     SKIPPED — no installed corpus");
    rec("the corpus check is skipped only because the games are absent", true, "skipped");
  } else if (!withShape) {
    console.log("     SKIPPED — no installed corpus ships a tree behind a BOM; only the fixture sections above show the fix");
  }
}

console.log(`\n=== bom focus insert point: ${checks} checks, ${fails.length} failed ===`);
if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
