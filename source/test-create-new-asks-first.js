// #create-new-discards-the-form + #new-draft-is-not-unsaved-work
//
// "+ CREATE NEW" REPLACED A WRITTEN ITEM WITH A BLANK TEMPLATE AND ASKED NOTHING.
//
// Clicking another item in the list has asked before discarding since the unsaved-work guards went in. The
// "+ Create New" button, three inches away in the same sidebar, did not — and it replaces the same form. So
// does Duplicate on the Decisions page, which rebuilds the form from the loaded decision.
//
// Three pages, one shape, and each already had the guard it needed a few lines away:
//     Events     evUnsaved.confirmDiscard      (novaWatchUnsaved)
//     Spirits    ideaUnsaved.confirmDiscard    (novaWatchUnsaved)
//     Decisions  confirmDiscardDecisionEdits   (its own snapshot-compare)
//
// ⚠️ AND THEN THE GUARD FIRED ON THE THING IT WAS PROTECTING. A fresh draft differs from whatever was loaded
// before it, so the watcher read dirty the moment it was created — and the draft AUTO-SELECTS itself, which
// now goes through the item-switch guard. The result was a "you have unsaved changes" prompt about the empty
// form the user had just asked for, and the auto-select being cancelled. The untouched template is the
// baseline; only real typing counts. The Decisions maker already did this (markDecisionEditorClean, "the
// untouched template is the baseline"); the other two now do too.
//
// Verified in all three running makers on Millennium Dawn:
//     load an item, click + Create New       → no prompt, draft made, page still clean
//     type into the draft, click it again    → asks, and cancelling keeps what was typed
//     Decisions Duplicate with unsaved edits → asks
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
    console.log("  FAIL " + label + "  -> " + String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 300));
  }
}
const PUB = path.join(__dirname, "public");
const { stripJsComments } = require("./testlib-strip-comments.js");
const read = (f) => stripJsComments(fs.readFileSync(path.join(PUB, f), "utf8"));

/** The body of a click handler wired to `id`, brace-matched from its addEventListener. */
function handler(code, id) {
  const at = code.indexOf(`${id}.addEventListener("click"`);
  if (at === -1) return "";
  let i = code.indexOf("{", at), d = 0;
  for (; i < code.length; i++) {
    if (code[i] === "{") d++;
    else if (code[i] === "}") { d--; if (d === 0) return code.slice(at, i + 1); }
  }
  return "";
}

const PAGES = [
  { file: "events.js", btn: "newEventBtn", guard: /evUnsaved && evUnsaved\.isDirty\(\)/, ask: /evUnsaved\.confirmDiscard\("Start a new event"/, reenter: /newEventBtn\.click\(\)/, baseline: /if \(evUnsaved\) evUnsaved\.markClean\(\);/ },
  { file: "ideas.js", btn: "newIdeaBtn", guard: /ideaUnsaved && ideaUnsaved\.isDirty\(\)/, ask: /ideaUnsaved\.confirmDiscard\("Start a new one"/, reenter: /newIdeaBtn\.click\(\)/, baseline: /if \(ideaUnsaved\) ideaUnsaved\.markClean\(\);/ },
  { file: "decisions.js", btn: "newDecisionBtn", guard: /decisionEditorIsDirty\(\)/, ask: /confirmDiscardDecisionEdits\(/, reenter: /newDecisionBtn\.click\(\)/, baseline: /markDecisionEditorClean\(\)/ },
];

for (const P of PAGES) {
  const code = read(P.file);
  const h = handler(code, P.btn);
  console.log(`\n[${P.file}] + Create New`);
  rec("the handler is findable", h.length > 80, h.length);
  rec("…it checks for unsaved work", P.guard.test(h), h.slice(0, 260));
  rec("…and asks before replacing the form", P.ask.test(h), h.slice(0, 320));
  // ⭐ ORDER: the guard has to run before the template is built, or the form is already gone when it asks.
  const guardAt = h.search(P.guard);
  const buildAt = h.search(/activeDraft = \{|generatedId/);
  rec("…before it builds the blank template", guardAt !== -1 && buildAt !== -1 && guardAt < buildAt, { guardAt, buildAt });
  rec("…and re-enters rather than duplicating the whole handler", P.reenter.test(h), h.slice(0, 320));
  // …and the fresh draft must be the new baseline, or its own auto-select prompts about itself.
  // ⚠️ Scoped to THIS handler. Tested against the whole file it passed with the baseline removed, because
  // markClean is also called by the mode switch and after a save — the check found it next door.
  rec("the untouched template becomes the baseline", P.baseline.test(h), h.slice(-300));
}

console.log("\n[decisions.js] Duplicate rebuilds the form too");
{
  const code = read("decisions.js");
  const h = handler(code, "duplicateDecisionBtn");
  rec("the Duplicate handler is findable", h.length > 60, h.length);
  rec("…it asks before discarding", /decisionEditorIsDirty\(\)/.test(h) && /confirmDiscardDecisionEdits\(/.test(h), h.slice(0, 300));
  rec("…and re-enters", /duplicateDecisionBtn\.click\(\)/.test(h), h.slice(0, 300));
}

console.log("\n[the shape] every page that can discard the form has a guard for it");
{
  // ⭐ DERIVED: the item-list click already asks on each page. Any OTHER control that replaces the editor
  // must ask the same way, and this is the list of the ones that do.
  for (const P of PAGES) {
    const code = read(P.file);
    const asks = (code.match(new RegExp(P.ask.source, "g")) || []).length;
    rec(`${P.file} asks from more than one control`, asks >= 1, asks);
  }
  const ev = read("events.js"), id = read("ideas.js"), de = read("decisions.js");
  rec("the item-list click still asks (events)", /confirmDiscard\("Switch event"/.test(ev), "the list click guard went");
  rec("…(spirits)", /confirmDiscard\("Switch spirit"/.test(id), "the list click guard went");
  rec("…(decisions)", /confirmDiscardDecisionEdits\(/.test(de), "the list click guard went");
}

console.log("\n[CONTROL] the makers still make things");
{
  rec("events still builds a draft", /activeDraft = \{[\s\S]{0,200}namespace/.test(read("events.js")), "the new-event path changed shape");
  rec("spirits still builds a draft", /activeDraft = \{[\s\S]{0,120}ideaId/.test(read("ideas.js")), "the new-spirit path changed shape");
  rec("decisions still builds a draft", /activeDraft = \{[\s\S]{0,120}name: "New Decision"/.test(read("decisions.js")), "the new-decision path changed shape");
  rec("…and the designers branch still hands off to the company editor", /mioEditor\.newCompany\(\)/.test(read("ideas.js")), "the MIO hand-off went");
}

console.log(`\n=== create new asks first: ${checks} checks, ${fails.length} failed ===`);
if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
