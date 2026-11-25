// Switching the active mod re-resolved the art and re-read the list, but never cleared the EDITOR — and
// loadEventsList() only re-renders the list. The unsaved-work guard prompts only when the form is DIRTY, so
// a loaded-but-untouched event survived the switch whole.
//
// The visible half was a stale photograph: updateIconPreview is the only writer for a picture that is set,
// nothing re-ran it, and the <img> kept an absolute path INSIDE THE PREVIOUS MOD. The file still exists, so
// nothing 404s — the newspaper renders perfectly with the wrong mod's picture in it.
//
// ⚠️ The dangerous half is quieter, and is the reason this is not merely a preview bug:
//   * `loadedEventFileName` is sent as `fileName` on save
//   * `loadedEventFullId`   is sent as `previousEventId` on a rename
// Carried across a switch, Save targets the NEW mod at the OLD mod's filename, and a rename asks the new mod
// to drop an id that only exists in the old one. That is a wrong WRITE.
//
// The Decision Maker already had the fix (clearDecisionEditorForModSwitch, public/decisions.js) and the
// Event Maker never adopted it — the dominant bug shape on this project.
//
// ⭐ One deliberate difference: decisions.js clears a HAND-WRITTEN list of field ids, and its own comment
// records that the list once missed `decisionCategoryIcon`, which then survived a switch and was written
// into the newly-opened mod. So the Event Maker derives its fields from the same root the unsaved-work
// watcher already watches. This test pins that difference, because a hand-written list here would rot the
// same way.
"use strict";

const fs = require("fs");
const path = require("path");
const { stripJsComments } = require("./testlib-strip-comments.js");

const EVENTS = stripJsComments(fs.readFileSync(path.join(__dirname, "public", "events.js"), "utf8"));
const DECISIONS = stripJsComments(fs.readFileSync(path.join(__dirname, "public", "decisions.js"), "utf8"));

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (detail == null ? "" : "   " + (typeof detail === "string" ? detail : JSON.stringify(detail))));
  if (!ok) fails.push(label);
};

function extractFunction(src, name) {
  const at = src.indexOf("function " + name + "(");
  if (at === -1) return null;
  const open = src.indexOf("{", at);
  if (open === -1) return null;
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") { depth--; if (depth === 0) return src.slice(at, i + 1); }
  }
  return null;
}

try {
  console.log("1. The Event Maker clears on a mod switch at all");
  const fn = extractFunction(EVENTS, "clearEventEditorForModSwitch");
  rec("clearEventEditorForModSwitch exists", !!fn, fn ? fn.length + " chars" : "NOT FOUND");
  rec("…and the mod-change callback actually calls it",
    /initModSelector\(\(\) => \{[\s\S]{0,400}?clearEventEditorForModSwitch\(\)/.test(EVENTS),
    "a clear function nothing calls is worse than none — it reads as solved");
  if (!fn) throw new Error("cannot continue without the function");

  console.log("\n2. The identity state that reaches DISK is reset");
  // These two decide WHICH FILE and WHICH ID a save targets. Stale values write into the wrong mod.
  for (const v of ["loadedEventFullId", "loadedEventFileName"]) {
    rec(`${v} is cleared`, new RegExp(v + "\\s*=\\s*null").test(fn), "carried over, this retargets a write");
  }
  rec("the schedule fields are cleared too", /loadedEventDays\s*=\s*0/.test(fn) && /loadedEventHours\s*=\s*0/.test(fn));
  rec("the in-progress draft is dropped", /activeDraft\s*=\s*null/.test(fn));
  rec("…and the pending auto-select", /autoSelectFullId\s*=\s*null/.test(fn));

  console.log("\n3. The form is cleared by DERIVING the fields, not by listing them");
  rec("it scopes to the editor panel", /event-editor-panel/.test(fn));
  rec("…and sweeps the controls inside it", /querySelectorAll\("input, textarea, select"\)/.test(fn));
  rec("…skipping the AI prompt, which is never written to the mod", /aiEventPrompt/.test(fn));
  // The whole point of deriving: no hand-written id list to go stale.
  const idLiterals = (fn.match(/"[a-z]+[A-Z][A-Za-z]*"/g) || []).filter((s) => /^"event[A-Z]/.test(s));
  rec("…and there is no hand-written list of event field ids to rot", idLiterals.length === 0, idLiterals);

  console.log("\n4. The visible half");
  rec("the picture preview is re-run with an empty key", /updateIconPreview\(""\)/.test(fn),
    "otherwise the img keeps an absolute path inside the previous mod");
  rec("the live preview is refreshed", /updateLivePreview\(\)/.test(fn));
  rec("the options list is emptied", /optionsList[\s\S]{0,80}?innerHTML = ""/.test(fn));
  rec("the owner chips are cleared", /clearEventBridge\(\)/.test(fn));
  rec("the delete button is hidden again", /deleteEventBtn[\s\S]{0,90}?is-hidden/.test(fn));

  console.log("\n5. Selection is cleared with the class the list actually builds");
  // renderEventsList builds .event-item-card. A ".event-item" selector matches nothing and would leave the
  // OLD mod's card highlighted beside an empty editor — which is what this had on the first attempt.
  rec("the list builds .event-item-card", /className = "event-item-card"/.test(EVENTS));
  rec("…and the clear deselects that class", /querySelectorAll\("\.event-item-card"\)/.test(fn));
  rec("…not a class that matches nothing", !/querySelectorAll\("\.event-item"\)/.test(fn));

  console.log("\n6. Emptying the form must not look like the user's unsaved work");
  rec("the unsaved-work watcher is re-baselined", /markClean\(\)/.test(fn));
  // Order matters: re-baselining before the fields are cleared would snapshot the OLD contents as clean.
  const clearAt = fn.search(/querySelectorAll\("input, textarea, select"\)/);
  const cleanAt = fn.search(/markClean\(\)/);
  rec("…AFTER the fields are cleared, not before", clearAt !== -1 && cleanAt > clearAt,
    `sweep at ${clearAt}, markClean at ${cleanAt}`);

  console.log("\n7. Clearing happens AFTER the unsaved-work guard, never instead of it");
  // ⛔ THE SAFETY PROPERTY THIS FIX DEPENDS ON. The clear calls markClean(), so if it could run before the
  // dirty check, switching mod would silently destroy unsaved work instead of prompting. It cannot: the
  // selector's change handler checks isDirty() and calls confirmDiscard() FIRST, and only reaches
  // onChangedCallback — which is what invokes the clear — once the form is clean or the user has confirmed.
  const handler = (/selector\.addEventListener\("change"[\s\S]{0,1400}?\n      \}\);/.exec(EVENTS) || [])[0] || "";
  rec("the mod-selector change handler was found", handler.length > 200, handler.length + " chars");
  const dirtyAt = handler.search(/evUnsaved && evUnsaved\.isDirty\(\)/);
  const confirmAt = handler.search(/confirmDiscard\(/);
  const callbackAt = handler.search(/onChangedCallback\(\)/);
  rec("it checks isDirty first", dirtyAt !== -1 && dirtyAt < callbackAt, `isDirty at ${dirtyAt}, callback at ${callbackAt}`);
  rec("…and prompts before the callback that clears", confirmAt !== -1 && confirmAt < callbackAt,
    `confirmDiscard at ${confirmAt}, callback at ${callbackAt}`);
  rec("…and returns early on the dirty path, so the clear is not also reached",
    /confirmDiscard\([\s\S]{0,200}?\n\s*return;/.test(handler),
    "without the early return, a prompt AND a silent clear would both happen");

  console.log("\n8. The sibling that already had this still does");
  // If the Decision Maker's version is ever deleted, the comparison this fix was modelled on is gone.
  rec("decisions.js still has its own clear-on-switch", /function clearDecisionEditorForModSwitch\(/.test(DECISIONS));
  rec("…and still calls it", /clearDecisionEditorForModSwitch\(\);/.test(DECISIONS));

  console.log("\n9. This would have rejected what shipped");
  const OLD = `initModSelector(() => { spriteUrlCache = {}; loadEventsList(); initCountryDatalist(); });`;
  rec("the old callback had no clear", !/clearEventEditorForModSwitch/.test(OLD));
  rec("…and reloading the list is not clearing the editor", /loadEventsList\(\)/.test(OLD) && !/loadedEventFileName/.test(OLD));

  console.log(`\n=== switching mod empties the event editor: ${checks} checks, ${fails.length} failed ===`);
  if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
} catch (e) {
  console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
  process.exitCode = 1;
}
