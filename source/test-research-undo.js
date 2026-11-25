// UNDO/REDO invariants for the research tree (#research-undo).
//
// The history is SNAPSHOT-based: histSnapshot() serialises every piece of editor-mutable state and
// histApply() puts it back. That design is only safe while those two stay in lockstep — add a new
// override map to the snapshot and forget it in the restore, and undo silently DROPS the user's data
// instead of reverting it. That is the corruption class this file exists to prevent, so the field-set
// symmetry check below is the important one.
//
// It also pins three regressions that already happened or are one careless edit away:
//   - the keydown listener was originally registered inside the `isElectronRuntime` branch, so Ctrl+Z
//     worked in the desktop app and silently did nothing in the browser;
//   - undo must reach the history through markDirty/markTechDirty, the editor's existing change
//     signals — that is what makes every mutation undoable without per-site bookkeeping;
//   - undo/redo must never talk to the server. Nothing may reach the mod before Save Changes.
"use strict";
const fs = require("fs");
const path = require("path");
const assert = require("assert");

const src = fs.readFileSync(path.join(__dirname, "public", "research.js"), "utf8");
let checks = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); checks += 1; };

const bodyOf = (startIdx) => {
  const open = src.indexOf("{", startIdx);
  let d = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === "{") d++;
    else if (src[i] === "}") { d--; if (!d) return src.slice(open + 1, i); }
  }
  return "";
};
const fnBody = (name) => {
  const i = src.indexOf(`function ${name}(`);
  ok(i !== -1, `${name}() exists`);
  return i === -1 ? "" : bodyOf(i);
};

// ---- 1. SNAPSHOT / RESTORE FIELD SYMMETRY (the anti-corruption invariant) ----
const snapBody = fnBody("histSnapshot");
const applyBody = fnBody("histApply");
// keys of the object literal histSnapshot stringifies: `k: expr`
const snapKeys = [...snapBody.matchAll(/(?:^|[{,\s])([a-z]{1,4}):\s/g)].map((m) => m[1]);
ok(snapKeys.length >= 12, `histSnapshot captures a full state object (found ${snapKeys.length} keys)`);
const missing = snapKeys.filter((k) => !new RegExp(`\\bs\\.${k}\\b`).test(applyBody));
ok(missing.length === 0, `every snapshotted field is restored by histApply (missing: ${missing.join(", ")})`);
// ...and nothing is restored that was never captured (a typo'd key would read undefined and wipe state).
// \b before the s so `allTechs.some(...)` is not mistaken for a snapshot field read.
const applyKeys = [...applyBody.matchAll(/\bs\.([a-z]{1,4})\b/g)].map((m) => m[1]);
const extra = [...new Set(applyKeys)].filter((k) => !snapKeys.includes(k));
ok(extra.length === 0, `histApply restores nothing that was not captured (extra: ${extra.join(", ")})`);

// The state the editor can mutate must actually be in the snapshot. If a new map is added to the module
// and not to the history, undo would leave it stale — name them explicitly so the omission is loud.
for (const v of ["allTechs", "allEquips", "dirtyTechIds", "countryResearchedTechs", "guiLabelOverrides",
                 "guiLabelFontPending", "guiLabelTextPending", "guiYearPosOverrides", "guiYearValOverrides",
                 "guiYearHidden", "guiYearCustomStamps", "yearColsCustom", "yearLabelOverrides",
                 "researchAnnotations"]) {
  ok(new RegExp(`\\b${v}\\b`).test(snapBody), `histSnapshot captures ${v}`);
  ok(new RegExp(`\\b${v}\\s*=`).test(applyBody), `histApply restores ${v}`);
}
// researchGuiLabelsByFolder is the exception, and deliberately so: section labels load asynchronously
// AFTER the baseline snapshot, so capturing the whole cache made the first undo restore the empty
// pre-load object and wipe every label off the canvas. Capture the TEXTS keyed by label and merge them
// back instead — a key the snapshot never saw is left alone. Assert it is never wholesale-assigned.
ok(/researchGuiLabelsByFolder/.test(snapBody), "histSnapshot captures the label texts");
ok(!/researchGuiLabelsByFolder\s*=/.test(applyBody),
  "histApply MERGES label text and never replaces the label cache (that wiped the labels)");
ok(/it\.display = texts\[k\]/.test(applyBody), "histApply restores label display text by key");

// ---- 2. THE CHANGE SIGNALS FEED THE HISTORY ----
ok(/function markDirty\([^)]*\)\s*\{[^}]*histNote\(/.test(src), "markDirty() records an undo step");
ok(/function markTechDirty\([^)]*\)\s*\{[^}]*histNote\(/.test(src), "markTechDirty() records an undo step");
// the drag END (not each mousemove) is the undoable step
ok(/tech\._origX = tech\.x;[\s\S]{0,400}?markTechDirty\(tech\.id/.test(src),
  "the tech drag commit records an undo step");

// ---- 3. THE KEYS ARE REGISTERED WHERE EVERY RUNTIME SEES THEM ----
// Regression: this listener used to live inside the `isElectronRuntime` else-branch, so Ctrl+Z did
// nothing in the browser. Compare brace depth against the reload guard, which IS Electron-only.
const depthAt = (idx) => { let d = 0; for (let i = 0; i < idx; i++) { if (src[i] === "{") d++; else if (src[i] === "}") d--; } return d; };
const undoKeyIdx = src.indexOf("if (k === \"y\" || e.shiftKey) researchRedo(); else researchUndo();");
ok(undoKeyIdx !== -1, "the undo/redo keydown handler exists");
const reloadGuardIdx = src.indexOf("const isReload = e.key === \"F5\"");
ok(reloadGuardIdx !== -1, "the Electron-only reload guard exists (the depth reference)");
ok(depthAt(undoKeyIdx) < depthAt(reloadGuardIdx),
  `the undo keys are registered OUTSIDE the Electron-only branch (undo depth ${depthAt(undoKeyIdx)} < reload depth ${depthAt(reloadGuardIdx)})`);
ok(/k !== "z" && k !== "y"/.test(src), "both Ctrl+Z and Ctrl+Y are handled");
ok(/e\.shiftKey\) researchRedo/.test(src), "Ctrl+Shift+Z redoes as well");
ok(/tagName === "INPUT" \|\| t\.tagName === "TEXTAREA"/.test(src), "the keys defer to text fields");

// ---- 4. UNDO/REDO NEVER WRITE (nothing reaches the mod before Save Changes) ----
for (const fn of ["researchUndo", "researchRedo", "histApply", "histNote", "histSnapshot"]) {
  const b = fnBody(fn);
  ok(!/\bfetch\s*\(/.test(b), `${fn}() issues no fetch`);
  ok(!/\/api\//.test(b), `${fn}() references no API endpoint`);
}
// histApply may re-persist Nova's own localStorage keys, but must not call the markDirty wrappers
// (saveGuiLabelOverrides / saveResearchAnnotations are markDirty in disguise — calling them would
// record the undo itself as a new edit).
ok(!/saveGuiLabelOverrides\(\)|saveResearchAnnotations\(\)/.test(applyBody),
  "histApply does not call the markDirty-wrapper save helpers");
ok(/histApplying = true/.test(applyBody), "histApply guards against recording itself as an edit");

// ---- 4b. EDITS ARE STAGED, NOT WRITTEN ON THE SPOT (#staged-label-text, #staged-label-font) ----
// Editing a section label used to POST set-label-text the moment you clicked away, so a rename you were
// only trying out was already in the mod's localisation. Both label mutations must now stage into a
// pending map and reach the server ONLY from the save path.
for (const [ep, map] of [["set-label-text", "guiLabelTextPending"], ["set-label-font", "guiLabelFontPending"]]) {
  // match the CALL, not prose — the comments above these maps name the endpoint too
  const hits = [...src.matchAll(new RegExp(`fetch\\("/api/research/${ep}"`, "g"))].map((m) => m.index);
  ok(hits.length === 1, `${ep} is POSTed from exactly one place (found ${hits.length})`);
  // ...and that place is the save flush, recognisable by the pending map being drained right after it.
  // It drains into `stillPending`, NOT to {}: a write that failed has to stay queued so Save retries it
  // (#save-failure-retry), so an unconditional clear here would be the bug, not the contract.
  const after = src.slice(hits[0], hits[0] + 900);
  ok(new RegExp(`${map} = stillPending;`).test(after), `${ep} is written from the save flush that drains ${map}`);
  ok(/await fetch\(/.test(src.slice(hits[0] - 20, hits[0] + 12)), `${ep} is awaited inside the save path`);
}
// the in-place editors must stage, never fetch
const editorBody = src.slice(src.indexOf("guiLabelTextPending[folder"), src.indexOf("guiLabelTextPending[folder") + 400);
ok(!/fetch\s*\(/.test(editorBody), "the label text editor stages without fetching");
ok(/markDirty\(/.test(editorBody), "a label rename is recorded as an undo step");
// every year mutation must be undoable — all four persist helpers take a label and mark dirty
for (const fn of ["saveGuiYearPos", "saveGuiYearVal", "saveGuiYearHidden", "saveGuiYearCustom"]) {
  ok(new RegExp(`function ${fn}\\(label\\)[\\s\\S]{0,220}?if \\(label\\) markDirty\\(label\\)`).test(src),
    `${fn}() records an undo step when given a label`);
}
for (const site of ["Add year stamp", "Delete year ", "Move year ", "Reset all year edits"]) {
  ok(src.includes(site), `the "${site.trim()}" year mutation is labelled for undo`);
}
ok(/saveGuiYearVal\(`Year \$\{val\} → \$\{v\}`\)/.test(src), "retyping a year value is labelled for undo");

// ---- 4c. THE DELETION QUEUE TRAVELS WITH THE SNAPSHOT (#undo-pending-deletions) ----
// pendingDeletions is what Save sends the server as `deletions`. It was NOT in the snapshot, so Ctrl+Z
// after a delete put the tech back on the canvas while the deletion stayed queued — the next Save wiped
// it from the mod anyway and the undo you trusted lost the tech silently.
ok(/\bpd: pendingDeletions\b/.test(snapBody), "histSnapshot captures the pending-deletion queue");
ok(/\bdu: deletedUndoStack\b/.test(snapBody), "histSnapshot captures the delete-undo stack");
ok(/pendingDeletions = s\.pd \|\| \[\]/.test(applyBody), "histApply restores the pending-deletion queue");
ok(/deletedUndoStack = s\.du \|\| \[\]/.test(applyBody), "histApply restores the delete-undo stack");
ok(/deletions: pendingDeletions/.test(src), "SANITY: pendingDeletions really is what Save sends as `deletions`");

// ---- 4d. EXACTLY ONE Ctrl+Z ----
// There used to be a SECOND, delete-only Ctrl+Z calling undoLastDelete(). Two undo systems racing for
// one key, and whichever lost left the deletion queue and the canvas disagreeing.
const ctrlZHandlers = [...src.matchAll(/toLowerCase\(\) === "z"|k !== "z" && k !== "y"/g)].length;
ok(ctrlZHandlers === 1, `only ONE Ctrl+Z handler remains (found ${ctrlZHandlers})`);
ok(!/e\.preventDefault\(\); undoLastDelete\(\); return;/.test(src), "the old delete-only Ctrl+Z is gone");
// ...but the delete toast's Undo action still exists, and now feeds the history like any other mutation
ok(/showUndoToast\([^)]*undoLastDelete\)/.test(src), "the delete toast still offers Undo");
ok(/markTechDirty\(tech\.id, `Restore /.test(src), "undoLastDelete() records an undo step");

// ---- 5. BOUNDS + LIFECYCLE ----
ok(/HIST_BUDGET_BYTES/.test(src), "the history is byte-bounded");
ok(/while \(histUndo\.length > 1 && histBytes > HIST_BUDGET_BYTES\)/.test(src),
  "oldest entries are dropped once the budget is exceeded");
ok(/histRedo = \[\];/.test(fnBody("histNote")), "a fresh edit clears the redo branch");
ok(/clearDirty\(\);[\s\S]{0,400}?histReset\(\)/.test(src),
  "history resets to clean after a load/save (you cannot undo past a save)");
ok(/requestAnimationFrame\(settle\)/.test(src), "an edit burst coalesces into ONE undo step");

console.log(`test-research-undo: ${checks} checks passed`);
