// #wizard-cancel-leaves-the-editor — Cancel on the startup wizards navigated the whole page to home.html,
// throwing away unsaved focus-tree edits.
//
// Both wizard Cancel buttons (and both Escape handlers) called openStartupChoiceDialog(), whose entire body
// outside e2e is `window.location.href = "home.html"`. So a button labelled Cancel did not return you to the
// editor — it left the page.
//
// That would be tolerable if the wizard only ever appeared on a blank editor. It does not: selecting the
// placeholder row in "Open a country's tree…" calls checkEmptyFocusTreeOverlay(true), which puts the overlay
// on top of a LOADED, possibly edited tree. And app.js deliberately skips the beforeunload guard under
// Electron (`if (!isElectronRuntime)`) — which is how Nova ships — so nothing warned about unsaved work.
//
// Cancel now returns to the tree when there is one to return to, and only falls through to the start choices
// when nothing is loaded, which is what that button means on a blank editor. The forced overlay is removed on
// the way back, or the editor would stay hidden behind it.
//
// Four call sites shared the defect: both Cancel buttons and both dialogs' Escape listeners. The three OTHER
// callers of openStartupChoiceDialog are legitimate startup-flow paths (an explicit reopenOnCancel from the
// file picker, a load-failure fallback, and first launch) and are deliberately left alone.
"use strict";
const fs = require("fs"), path = require("path");

let pass = 0, total = 0;
const ok = (n, c, x) => { total++; if (c) { pass++; console.log("  ok  " + n); } else console.error("  FAIL " + n + (x !== undefined ? " -> " + JSON.stringify(x) : "")); };

const src = fs.readFileSync(path.join(__dirname, "public", "app.js"), "utf8");

// ── the helper itself, run for real ───────────────────────────────────────────────────────────────
const start = src.indexOf("function cancelWizardBackToEditor(");
ok("the shared cancel helper exists", start !== -1);
let depth = 0, end = -1;
for (let i = src.indexOf("{", start); i < src.length; i++) {
  if (src[i] === "{") depth++;
  else if (src[i] === "}") { depth--; if (depth === 0) { end = i + 1; break; } }
}
const fnSrc = src.slice(start, end);
ok("…and it checks whether a tree is loaded", /parsed\.focuses\.length > 0/.test(fnSrc), fnSrc);

// Drive it with a fake DOM in both states.
function run({ hasTree }) {
  let wentHome = false, overlayRemoved = false, overflowCleared = false;
  const overlay = { remove: () => { overlayRemoved = true; } };
  const container = { style: { overflow: "hidden", set _(v) {} } };
  const sandbox = {
    loadedPath: hasTree ? "C:/mod/common/national_focus/x.txt" : "",
    parsed: hasTree ? { focuses: [{ id: "a" }] } : null,
    openStartupChoiceDialog: () => { wentHome = true; },
    document: {
      getElementById: (id) => (id === "emptyTreeOverlay" ? overlay : null),
      querySelector: (sel) => (sel === ".canvas-scroll" ? container : null),
    },
  };
  // eslint-disable-next-line no-new-func
  const fn = new Function("loadedPath", "parsed", "openStartupChoiceDialog", "document",
    `${fnSrc}\nreturn cancelWizardBackToEditor();`);
  fn(sandbox.loadedPath, sandbox.parsed, sandbox.openStartupChoiceDialog, sandbox.document);
  overflowCleared = container.style.overflow === "";
  return { wentHome, overlayRemoved, overflowCleared };
}

const withTree = run({ hasTree: true });
ok("with a tree loaded, Cancel does NOT navigate away", withTree.wentHome === false, withTree);
ok("…it removes the forced empty-tree overlay", withTree.overlayRemoved === true, withTree);
ok("…and restores canvas scrolling", withTree.overflowCleared === true, withTree);

const noTree = run({ hasTree: false });
ok("with nothing loaded, Cancel still goes to the start choices", noTree.wentHome === true, noTree);
ok("…and does not touch the overlay", noTree.overlayRemoved === false, noTree);

// ── every cancel path must use it ─────────────────────────────────────────────────────────────────
const sliceAfter = (marker, n) => { const i = src.indexOf(marker); return i === -1 ? "" : src.slice(i, i + n); };
ok("the Storyline Wizard Cancel button uses it",
  /cancelWizardBackToEditor\(\)/.test(sliceAfter("if (createTemplateCancelBtn) {", 320)), "createTemplate cancel");
ok("…its Escape handler too",
  /cancelWizardBackToEditor\(\)/.test(sliceAfter("if (createTemplateDialogEl) {", 380)), "createTemplate escape");
ok("the Create-Mod Cancel button uses it",
  /cancelWizardBackToEditor\(\)/.test(sliceAfter("if (createModCancelBtn) {", 320)), "createMod cancel");
ok("…and its Escape handler",
  /cancelWizardBackToEditor\(\)/.test(sliceAfter("if (createModDialogEl) {", 380)), "createMod escape");

// None of those four may still navigate directly.
for (const [label, marker, n] of [
  ["Storyline Cancel", "if (createTemplateCancelBtn) {", 320],
  ["Storyline Escape", "if (createTemplateDialogEl) {", 380],
  ["Create-Mod Cancel", "if (createModCancelBtn) {", 320],
  ["Create-Mod Escape", "if (createModDialogEl) {", 380],
]) {
  ok(`${label} no longer calls openStartupChoiceDialog directly`,
    !/openStartupChoiceDialog\(\)/.test(sliceAfter(marker, n)), sliceAfter(marker, n));
}

// The legitimate startup-flow callers must survive — Cancel-goes-back must not become never-go-home.
ok("the file-picker's explicit reopenOnCancel still goes to the start choices",
  /if \(reopenOnCancel\) openStartupChoiceDialog\(\)/.test(src), "reopenOnCancel path lost");
ok("…and first launch still opens them", /\} else \{\s*\n\s*openStartupChoiceDialog\(\);/.test(src), "startup path lost");

console.log("\ntest-wizard-cancel-stays-in-editor: " + pass + "/" + total + " checks passed");
process.exitCode = pass === total && total >= 15 ? 0 : 1;
