// #staged-header-edit-survives-a-tree-load
//
// A HEADER EDIT STAGED ON ONE FOCUS TREE WAS WRITTEN INTO THE NEXT TREE YOU OPENED.
//
// The focus editor stages structural work in module-level containers and loadFile() clears them, so nothing
// from the previous tree can reach the next one. It cleared seven of the eight: six in one block, and
// pendingEffectEdits a few lines later where it is rebuilt from the fresh source.
//
// pendingTreeHeaderEdits — added by #source-patch-invalidates-block-offsets so that dragging the
// continuous-focus panel and linking a shared-focus group stage their line edits instead of patching
// sourceText and invalidating every parsed block offset — was never added to that list. It was cleared only
// after a SUCCESSFUL SAVE.
//
// Open tree A, drag the continuous-focus panel (or link a shared group), switch to tree B without saving,
// save B — and B's file gets A's header line.
//
// MEASURED in the running editor. Staged continuous_focus_position on the mod's own tree, loaded vanilla's
// afghanistan.txt, saved with the write blocked, and read the payload:
//
//     default = no
//
//     continuous_focus_position = { x = 999 y = 888 }
//
// …in Afghanistan's file, from a drag on a different country's tree. Putting one probe entry in all eight
// containers and loading another tree left exactly this one behind. After the fix: staged 1 → 0 on load,
// and the payload is clean.
//
// ⭐ THE CHECK IS DERIVED. It enumerates the staged containers from their declarations and requires every one
// to be reset in loadFile. A ninth container added later cannot be forgotten the way the eighth was.
//
// One correction worth recording, because the first reading of the measurement was wrong: pendingEffectEdits
// looked like it survived too, because its SIZE was non-zero after the load. It was not the probe entry —
// the load repopulates it with the new tree's own focus ids. Sizes are not sets; the probe key had to be
// checked by name.
"use strict";
const fs = require("fs");
const path = require("path");

const fails = [];
let checks = 0;
function rec(label, cond, detail) {
  checks++;
  if (cond) console.log("  ok   " + label);
  else {
    fails.push(label);
    console.log("  FAIL " + label + "  -> " + String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 320));
  }
}
const { stripJsComments } = require("./testlib-strip-comments.js");
const SRC = stripJsComments(fs.readFileSync(path.join(__dirname, "public", "app.js"), "utf8"));

function fnSource(header) {
  const at = SRC.indexOf(header);
  if (at === -1) return "";
  let i = SRC.indexOf("{", at + header.length - 1), d = 0;
  for (; i < SRC.length; i++) {
    if (SRC[i] === "{") d++;
    else if (SRC[i] === "}") { d--; if (d === 0) return SRC.slice(at, i + 1); }
  }
  return "";
}
const LOAD = fnSource("async function loadFile()");
const SAVE = fnSource("async function saveFileWithOptions(options = {})");

console.log("\n[every staged container is cleared when another tree is opened]");
{
  rec("loadFile was extracted", LOAD.length > 3000, LOAD.length);
  rec("saveFileWithOptions was extracted", SAVE.length > 3000, SAVE.length);

  // ⭐ DERIVED FROM THE DECLARATIONS. Not a list typed here — that is how the eighth went missing.
  const declared = [...SRC.matchAll(/^let ((?:pending|staged)[A-Za-z]*) = new (Map|Set)\(\);/gm)].map((m) => ({ name: m[1], kind: m[2] }));
  console.log("     staged containers found: " + declared.map((d) => d.name).join(", "));
  rec("the staged containers were found", declared.length >= 8, declared.map((d) => d.name));

  for (const d of declared) {
    const reset = new RegExp("\\b" + d.name + " = new " + d.kind + "\\(\\);");
    rec(`loadFile clears ${d.name}`, reset.test(LOAD),
      `${d.name} survives a tree load — the previous tree's staged work reaches the next one`);
  }

  // The one that was missing, called out by name so a regression reads clearly rather than as "one of eight".
  rec("…pendingTreeHeaderEdits in particular", /pendingTreeHeaderEdits = new Map\(\);/.test(LOAD),
    "a continuous-focus drag or shared-focus link staged on one tree lands in the next one's file");
}

console.log("\n[…and after a save, since that text is now on disk]");
{
  rec("a successful save clears the header edits", /pendingTreeHeaderEdits = new Map\(\);/.test(SAVE),
    "the next save would re-apply a header edit already written");
  // ⭐ EXACTLY ONE, and it has to be after sourceText was replaced. Searching forward from that point and
  // taking the first hit is not enough: the back-out inserted a SECOND clear before the write — which would
  // drop the edit whenever the write then failed — and the check stayed silent, because the legitimate one
  // further down was still there to be found. "After X" is not "only after X".
  const clears = [...SAVE.matchAll(/pendingTreeHeaderEdits = new Map\(\);/g)].map((m) => m.index);
  rec("…exactly once in the save path", clears.length === 1, { count: clears.length, at: clears });
  const srcAt = SAVE.indexOf("sourceText = rewritten;");
  rec("…once the rewritten text has been adopted", srcAt !== -1 && clears.length === 1 && clears[0] > srcAt, { srcAt, clears });
  // …and after the write itself, so a failed save keeps the staged edit for the retry.
  const postAt = SAVE.indexOf('fetch("/api/save"');
  rec("…and after the write, where a failure would otherwise lose it",
    postAt === -1 || (clears.length === 1 && clears[0] > postAt), { postAt, clears });
}

console.log("\n[CONTROL] the staging mechanism itself is intact");
{
  // Scoped to the save, and to BOTH places that build the output. A whole-file regex for the name passed
  // with one call site deleted, because the other one and the declaration still matched it.
  rec("the save still applies the staged header edits",
    /const rewritten = applyPendingTreeHeaderEdits\(rewriteCoordinates\(sourceText, parsed\)\);/.test(SAVE),
    "a staged header edit is built but never written");
  rec("…and so does the other path that builds the output",
    (SRC.match(/applyPendingTreeHeaderEdits\(rewriteCoordinates\(sourceText, parsed\)\)/g) || []).length === 2,
    (SRC.match(/applyPendingTreeHeaderEdits\(rewriteCoordinates\(sourceText, parsed\)\)/g) || []).length);
  rec("…the continuous-focus drag still stages rather than patching sourceText", /pendingTreeHeaderEdits\.set\("continuous_focus_position"/.test(SRC),
    "it is back to patching sourceText and invalidating every block offset");
  rec("…and so does a shared-focus link", /pendingTreeHeaderEdits\.set\("shared_focus:" \+ sharedId/.test(SRC), "same");
  rec("…and an undo snapshot still carries them", /pendingTreeHeaderEdits: \[\.\.\.pendingTreeHeaderEdits\.entries\(\)\]/.test(SRC),
    "Ctrl+Z would lose a staged header edit");
  rec("…as plain data, so cloneJson cannot destroy them", !/pendingTreeHeaderEdits\.set\([^)]*function/.test(SRC),
    "a closure in the snapshot does not survive cloneJson");
}

console.log(`\n=== staged work does not cross a tree load: ${checks} checks, ${fails.length} failed ===`);
if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
