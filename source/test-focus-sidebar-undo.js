// #sidebar-edits-outside-undo + #undo-leaves-the-sidebar-stale
//
// THE FOCUS TREE'S MAIN EDITING SURFACE WAS NOT IN THE UNDO HISTORY.
//
// applySidebarLiveChanges writes 16 focus fields — name, description, icon, cost, grid x/y, available,
// allow_branch, ai_will_do, bypass, cancel/continue if invalid, available_if_capitulated,
// will_lead_to_war_with, select_effect — plus the localisation maps, and then called markDirty and nothing
// else. Seventeen other mutating actions in the same file push a snapshot first.
//
// That asymmetry is worse than a plain gap. Because everything AROUND the sidebar pushes, Ctrl+Z did not
// merely ignore sidebar edits — it OVERSHOT, restoring the snapshot taken at the last covered action and
// discarding every keystroke since.
//
// Two halves, and the first alone was not enough:
//
//   1. PUSH — but once per editing BURST, not per keystroke. The function runs on the "input" event, so a
//      snapshot per call would fill the 80-entry history with single characters and make Ctrl+Z step
//      backwards letter by letter. The burst key is "<focus id>|<active element id>", and any other
//      undoable action clears it so returning to the same field starts a new entry.
//
//   2. REPAINT — restoreEditorState restored `parsed` and redrew the canvas but never refilled the sidebar.
//      Measured before the second half: after Ctrl+Z the model had reverted (cost 4 → 3) while the name box
//      still showed the undone text. That is not cosmetic: applySidebarLiveChanges READS those inputs, so
//      the next keystroke would write the stale values back over the restored model and silently undo the
//      undo.
//
// Verified in the running editor on Millennium Dawn's America tree (776 focuses):
//
//     typed 5 characters in NAME   → undo depth 1   (one entry, not five)
//     typed in COST                → undo depth 2
//     Ctrl+Z                       → cost box back to 21
//     Ctrl+Z                       → name box back to the original
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
    console.log("  FAIL " + label + "  -> " + String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 240));
  }
}

// ⭐ Strip comments first — this fix's own prose names every symbol the checks look for.
const CODE = stripJsComments(fs.readFileSync(path.join(__dirname, "public", "app.js"), "utf8"));
function fn(name) {
  const at = CODE.indexOf(`function ${name}(`);
  if (at === -1) return "";
  const open = CODE.indexOf("{", at);
  let d = 0;
  for (let i = open; i < CODE.length; i++) {
    if (CODE[i] === "{") d++;
    else if (CODE[i] === "}") { d--; if (d === 0) return CODE.slice(at, i + 1); }
  }
  return "";
}

const APPLY = fn("applySidebarLiveChanges");
const RESTORE = fn("restoreEditorState");
const PUSH = fn("pushUndoSnapshot");

console.log("\n[the sidebar is in the history at all]");
{
  rec("applySidebarLiveChanges is found", APPLY.length > 500, APPLY.length);
  rec("…and it still writes the focus fields", (APPLY.match(/focus\.[a-zA-Z]+ =/g) || []).length >= 10, (APPLY.match(/focus\.[a-zA-Z]+ =/g) || []).length);
  rec("…and it pushes an undo snapshot", /pushUndoSnapshot\(/.test(APPLY), "no snapshot — the sidebar is outside undo again");
  // The push must come BEFORE the mutations, or the snapshot records the edit rather than the state before it.
  const pushAt = APPLY.indexOf("pushUndoSnapshot(");
  const firstWrite = APPLY.search(/focus\.[a-zA-Z]+ =/);
  rec("…before the first field is written", pushAt !== -1 && firstWrite !== -1 && pushAt < firstWrite, { pushAt, firstWrite });
}

console.log("\n[once per editing burst, not once per keystroke]");
{
  rec("a burst key guards the push", /sidebarUndoBurstKey/.test(APPLY), "unguarded — every keystroke would be its own undo step");
  rec("…keyed by the focus AND the field being typed in", /activeElement/.test(APPLY), "not keyed by the active element");
  // Any other undoable action must end the burst, or returning to a field is folded into the old entry.
  rec("any other action ends the burst", /sidebarUndoBurstKey = null/.test(PUSH), "pushUndoSnapshot does not clear the burst");
}

console.log("\n[THE SECOND HALF] undo must repaint the sidebar, not just the model");
{
  rec("restoreEditorState is found", RESTORE.length > 500, RESTORE.length);
  rec("…and it repaints the sidebar", /openSidebarForSelection\(\)/.test(RESTORE), "the boxes would keep showing the undone text");
  // Ordering: the repaint must happen after parsed is restored, or it paints the old model back in.
  const parsedAt = RESTORE.indexOf("parsed = snapshot.parsed");
  const repaintAt = RESTORE.indexOf("openSidebarForSelection()");
  rec("…after the model is restored", parsedAt !== -1 && repaintAt > parsedAt, { parsedAt, repaintAt });
  // And it must not be able to add a history entry of its own.
  rec("the repaint cannot push a new entry", /isApplyingHistory/.test(PUSH), "pushUndoSnapshot is not guarded against re-entry");
}

console.log("\n[CONTROL] the rest of the history machinery is untouched");
{
  rec("history is enabled in this build", /HISTORY_ENABLED = true/.test(CODE), "undo is switched off");
  rec("there are still many other push sites", (CODE.match(/pushUndoSnapshot\(/g) || []).length >= 17, (CODE.match(/pushUndoSnapshot\(/g) || []).length);
  rec("redo still captures the live state before restoring", /redoHistory\.push\(/.test(CODE), "redo would lose the forward state");
  rec("the snapshot still clones, never shares a reference", /cloneJson\(/.test(fn("pushUndoEntry")), "history entries could be mutated by later edits");
}

// #sidebar-removes-outside-undo — the × buttons and the ✨ button, which destroy rather than edit.
//
// Typing was the big gap, but it was not the only one. The property sidebar carries three × buttons —
// remove a prerequisite, break a mutually-exclusive link, delete a reward effect — and none of them was in
// the history. Each is one click and each is worse than a keystroke to undo by hand: the mutex × edits TWO
// focuses because the link is bidirectional, and the reward × deletes authored HOI4 script.
//
// The ✨ AI button is the most destructive control on the panel: it replaces a whole hand-written trigger
// block with generated script, and the model is non-deterministic, so "just ask again" does not bring the
// original back. Its synthetic input event runs applySidebarLiveChanges, but that snapshots per burst keyed
// on document.activeElement — which is the BUTTON, not the textarea — so it could not stand in for a push.
console.log("\n[the destructive buttons] one click, and it is gone");
{
  const RENDER = fn("renderSidebarLists");
  rec("renderSidebarLists is found", RENDER.length > 500, RENDER.length);

  /** The body of a `{ … }` starting at index `open`, brace-matched. */
  const block = (text, open) => {
    let d = 0;
    for (let i = open; i < text.length; i++) {
      if (text[i] === "{") d++;
      else if (text[i] === "}") { d--; if (d === 0) return text.slice(open, i + 1); }
    }
    return "";
  };
  /** Split an argument list on TOP-LEVEL commas, so a nested call or arrow does not split it. */
  const args = (text, from) => {
    const out = [];
    let d = 0, cur = "";
    for (let i = from; i < text.length; i++) {
      const ch = text[i];
      if ("([{".includes(ch)) d++;
      else if (")]}".includes(ch)) { if (d === 0) { out.push(cur); return out; } d--; }
      if (ch === "," && d === 0) { out.push(cur); cur = ""; continue; }
      cur += ch;
    }
    return out;
  };

  // ⭐ DERIVE THE LIST, NEVER TYPE IT. A hand-written list of three × buttons is a list that has never heard
  // of the fourth one someone adds next month — the exact way a one-owner check has let a defect ship here
  // before. Every call to addSidebarListItem is found, its remove-callback resolved (inline arrow, or by
  // name to its `const … = () => {}`), and each one required to snapshot.
  const sites = [];
  let at = 0;
  while ((at = CODE.indexOf("addSidebarListItem(", at + 1)) !== -1) {
    if (/function\s+$/.test(CODE.slice(Math.max(0, at - 12), at))) continue; // the definition itself
    const a = args(CODE, at + "addSidebarListItem(".length);
    const third = (a[2] || "").trim();
    if (!third) continue;
    let body = "";
    if (third.startsWith("(")) {
      const rel = third.indexOf("{");
      body = rel === -1 ? "" : block(third, rel);
    } else {
      // Passed by name — resolve it to the arrow it was declared as.
      const decl = CODE.indexOf(`const ${third} = () => {`);
      if (decl !== -1) body = block(CODE, CODE.indexOf("{", decl + 6));
    }
    sites.push({ list: (a[0] || "").trim(), by: third.startsWith("(") ? "inline" : third, body });
  }

  rec("every × button is found by walking the source", sites.length >= 3, sites.map((s) => s.list));
  rec("…and each one's remove-handler resolved", sites.every((s) => s.body.length > 40), sites.map((s) => [s.list, s.body.length]));
  const silent = sites.filter((s) => !/pushUndoSnapshot\(\)/.test(s.body));
  rec("…and every one of them snapshots first", silent.length === 0, silent.map((s) => s.list + " (via " + s.by + ")"));
  // Before the mutation, not after: a snapshot taken afterwards records the deletion, so Ctrl+Z is a no-op.
  const late = sites.filter((s) => {
    const push = s.body.indexOf("pushUndoSnapshot()");
    const mutate = s.body.search(/focus\.[a-zA-Z]+ = |\.splice\(|markDirty\(/);
    return push === -1 || (mutate !== -1 && push > mutate);
  });
  rec("…before it mutates anything, not after", late.length === 0, late.map((s) => s.list));
}

console.log("\n[the ✨ button] the AI replaces the whole block");
{
  const gen = /if \(data\.script\)[\s\S]{0,600}?textarea\.value = data\.script/.exec(CODE);
  rec("the AI overwrite is findable", !!gen, "data.script is no longer written to a textarea");
  rec("…and it snapshots before overwriting", !!gen && /pushUndoSnapshot\(\)/.test(gen[0]), gen && gen[0].slice(0, 200));
}

console.log(`\n=== focus sidebar undo: ${checks} checks, ${fails.length} failed ===`);
if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
