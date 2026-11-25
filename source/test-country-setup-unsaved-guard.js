// #country-setup-loses-work-silently
//
// COUNTRY SETUP COULD THROW AWAY EVERYTHING YOU HAD TYPED, IN SILENCE.
//
// The details panel is a long form — capital, stability, war support, convoys, research slots, a popularity
// box per ideology — and it had no undo stack. That on its own is defensible; "undo" for a form is "reload
// without saving". What made it indefensible is that it had nothing else either: no dirty flag, no
// navigation guard, not one confirmation. Two clicks discarded the lot without asking:
//
//   · the mod dropdown — `selectedTag = null; showEmpty();` and the half-filled panel was gone
//   · another country in the list — the form was simply repopulated over the top
//
// The Research Tree, the Focus Tree and Military all guard this. This adopts the Research Tree's shape
// rather than inventing a fourth: put the selector back FIRST, so cancelling leaves the page exactly as it
// was, and only then ask.
//
// ⚠️ THE SECOND HALF, AND THE PART THAT NEARLY SHIPPED A WORSE BUG THAN IT FIXED. The first pass guarded
// closing/reloading with a raw `beforeunload`. Under Electron — the build users actually run — a
// beforeunload handler that calls preventDefault() raises no prompt at all; it SILENTLY CANCELS the
// navigation. A dirty Country Setup form would have made all 11 nav links dead and the window unclosable.
// That is precisely the Decisions-page defect that put the shared guard in loading-overlay.js in the first
// place (#suite-nav-discards-unsaved-work), re-committed one page over. One owner, always: hand
// novaGuardSuiteNav the dirty-check and let it run the nav-click path, the browser-only beforeunload and
// main.js's quit hook.
//
// Measured in the running page on Millennium Dawn (461 countries):
//
//     type in stability, click another country → "Switch country anyway and lose them?"
//         cancel  → panel still on Aceh, the typed 55 still in the box
//         agree   → switches to Angola
//     a CLEAN form                             → switches with no prompt at all   (0 confirms)
//     type, then change the mod dropdown       → "Switch mod anyway and lose them?"
//         cancel  → the selector is back on the mod it started on
//     type, then click a suite-nav link        → "You have unsaved changes in Country Setup."
//         cancel  → navigation blocked;  agree → allowed through
//     __focusEditorHasUnsavedChanges()         → false when clean, true when dirty
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { stripJsComments } = require("./testlib-strip-comments.js");

const PUB = path.join(__dirname, "public");
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
// ⭐ Strip comments FIRST. This fix's own prose names every symbol the checks below look for — including the
// word `beforeunload`, which one check requires to be ABSENT from the code.
const read = (f) => stripJsComments(fs.readFileSync(path.join(PUB, f), "utf8"));
const CS = read("country-setup.js");

/** Pull one function's source out by brace matching, so a check can be run rather than merely grepped. */
function fnText(code, name) {
  const at = code.indexOf(`function ${name}(`);
  if (at === -1) return "";
  const open = code.indexOf("{", at);
  let d = 0;
  for (let i = open; i < code.length; i++) {
    if (code[i] === "{") d++;
    else if (code[i] === "}") { d--; if (d === 0) return code.slice(at, i + 1); }
  }
  return "";
}

console.log("\n[the flag] something has to notice you typed");
{
  rec("a dirty flag exists", /let csDirty\b/.test(CS), "no csDirty");
  // ⚠️ Anchor on the LISTENER and look back, not on the element lookup and look forward. `csPanel` is also
  // looked up 30 lines earlier to cache the panel element, and a forward window from that first match found
  // no listeners and reported the wiring missing when it was there.
  const at = CS.indexOf('addEventListener("input", csMarkDirty');
  const back = at === -1 ? "" : CS.slice(Math.max(0, at - 300), at);
  rec("the details panel is wired for it", at !== -1 && /csPanel/.test(back), at === -1 ? "no input listener" : back.slice(-160));
  rec("…on input", at !== -1, "nothing marks the form dirty as you type");
  rec("…and on change", /addEventListener\("change", csMarkDirty/.test(CS), "a dropdown or checkbox change goes unnoticed");
  // Delegated on purpose: renderIdeologyInputs builds a popularity box per ideology AT RUNTIME for whatever
  // ideologies the mod defines. Wiring fields by name would miss exactly those.
  rec("…delegated on the panel, not field-by-field", /addEventListener\("input", csMarkDirty, true\)/.test(CS), "not capturing on the panel");
}

console.log("\n[THE HELPER, ACTUALLY RUN] cancel must not discard");
{
  const helper = fnText(CS, "csConfirmDiscard");
  rec("csConfirmDiscard is found", helper.length > 100, helper.length);

  const run = (dirty, answer) => {
    const ctx = {
      csDirty: dirty, proceeded: 0, asked: null, result: null,
      csMarkClean() { ctx.csDirty = false; },
      confirm: () => answer,
      window: { novaConfirm: (msg, onYes, opts) => { ctx.asked = { msg, opts }; if (answer) onYes(); } },
    };
    vm.createContext(ctx);
    vm.runInContext(`${helper}\ncsConfirmDiscard("Switch mod", () => { proceeded++; });`, ctx);
    return { proceeded: ctx.proceeded, asked: ctx.asked, stillDirty: ctx.csDirty };
  };

  const clean = run(false, false);
  rec("a clean form is never interrupted", clean.asked === null && clean.proceeded === 1, clean);

  const cancelled = run(true, false);
  rec("a dirty form asks", cancelled.asked !== null, cancelled);
  rec("…and CANCELLING keeps the work", cancelled.proceeded === 0 && cancelled.stillDirty === true, cancelled);
  rec("…the prompt names what is at stake", cancelled.asked && /unsaved country details/i.test(cancelled.asked.msg), cancelled.asked);
  rec("…and offers a way back", cancelled.asked && cancelled.asked.opts && /Keep editing/i.test(cancelled.asked.opts.cancelLabel || ""), cancelled.asked);

  const agreed = run(true, true);
  rec("agreeing goes through", agreed.proceeded === 1, agreed);
  rec("…and clears the flag, so the next hop is silent", agreed.stillDirty === false, agreed);
}

console.log("\n[the mod dropdown] the click that used to be a silent wipe");
{
  const h = /headerModSel\.addEventListener\("change"[\s\S]{0,1400}?\n  \}\);/.exec(CS);
  rec("the change handler is findable", !!h, "handler not found");
  const body = h ? h[0] : "";
  rec("…it consults the dirty flag", /csDirty/.test(body), body.slice(0, 200));
  rec("…and asks before discarding", /csConfirmDiscard\(/.test(body), body.slice(0, 200));
  // ⭐ ORDER MATTERS. novaConfirm is asynchronous — it returns immediately and the dialog stays up. If the
  // selector is not put back first, it sits on the mod you did NOT switch to for as long as you deliberate,
  // and cancelling leaves it lying about which mod is active.
  const revert = body.indexOf("headerModSel.value = previous");
  const ask = body.indexOf("csConfirmDiscard(");
  rec("…putting the selector back BEFORE it asks", revert !== -1 && ask !== -1 && revert < ask, { revert, ask });
  rec("…and re-applying it only once the user agrees", /csConfirmDiscard\([\s\S]{0,120}headerModSel\.value = next/.test(body), body.slice(-320));
}

console.log("\n[the country list] the same loss, a different button");
{
  const sel = fnText(CS, "selectCountry") || (/async function selectCountry\([\s\S]{0,700}/.exec(CS) || [""])[0];
  rec("selectCountry is findable", sel.length > 100, sel.length);
  rec("…it guards the switch", /csConfirmDiscard\(/.test(sel), sel.slice(0, 300));
  // ⚠️ THIS CHECK USED TO ASSERT THE OPPOSITE, and the opposite was wrong.
  //
  // It required `tag !== selectedTag`, on the reasoning that re-entering the country you are already on is
  // not a discard and asking there would be noise. But everything after this point reloads the panel from
  // the server, so it always was a discard — and it became a damaging one once spirits and technologies
  // began living in the form as staged edits (#staged-techs-lost-on-a-silent-refusal): clicking the
  // highlighted row in the list threw them away with no prompt. The exemption could not even do what it
  // claimed, because nothing re-selects the current country programmatically while dirty — the internal
  // callers run after a save, when csDirty is already false.
  rec("…including the country you are already on, because that reloads the form too",
    /if \(csDirty\) \{/.test(sel) && !/csDirty && tag !== selectedTag/.test(sel), sel.slice(0, 300));
  rec("…and loading one starts clean", /csMarkClean\(\)/.test(sel), sel.slice(0, 300));
}

console.log("\n[saving] a save is a clean slate");
{
  rec("a successful save clears the flag", /csMarkClean\(\);\s*await loadCountryDetails\(selectedTag\)/.test(CS), "save leaves the page permanently dirty");
}

console.log("\n[ONE OWNER] the half that nearly shipped a worse bug");
{
  // Under Electron a raw beforeunload does not prompt — it CANCELS the navigation. A page that registers one
  // makes its own nav bar dead and its window unclosable whenever the form is dirty.
  rec("country-setup.js registers NO beforeunload of its own", !/addEventListener\("beforeunload"/.test(CS), "raw beforeunload is back — the nav bar dies when the form is dirty");
  rec("…it uses the shared guard instead", /novaGuardSuiteNav\(/.test(CS), "the suite-nav links are unguarded on this page");
  rec("…handing it the dirty flag", /novaGuardSuiteNav\(\(\) => csDirty/.test(CS), "the guard is handed something other than csDirty");
  // Electron's quit dialog defaults to Save. A page answering "yes, unsaved" while publishing no saver fails
  // that branch with a spurious "Save Failed" and refuses to close.
  rec("…and a saver, so the quit dialog's default works", /novaGuardSuiteNav\([\s\S]{0,200}onSave:/.test(CS), "no onSave — Electron's quit dialog would dead-end");
  rec("…driving this page's own Save button", /onSave:[\s\S]{0,120}csSaveDetailsBtn/.test(CS), "onSave does not click the real save button");
}

console.log("\n[CONTROL] the machinery this leans on is still there");
{
  const OV = read("loading-overlay.js");
  rec("loading-overlay.js still exposes the shared guard", /window\.novaGuardSuiteNav = function/.test(OV), "the one owner vanished");
  rec("…it still intercepts nav-link clicks (the Electron path)", /suite-nav-link/.test(OV), "click interception gone");
  rec("…and still gates its own beforeunload on Electron", /isElectron[\s\S]{0,600}addEventListener\("beforeunload"/.test(OV), "the gate is gone");
  rec("the other pages still register with it", ["app.js", "army.js", "decisions.js"].every((f) => /novaGuardSuiteNav\(/.test(read(f))), "a maker stopped registering");
  rec("novaConfirm is still what this page asks with", /novaConfirm/.test(CS), "the confirm helper is gone");
  // If nothing on the page can be edited, every check above passes vacuously.
  rec("the details panel still has fields to lose", (CS.match(/getElementById\("cs[A-Z]/g) || []).length > 20, (CS.match(/getElementById\("cs[A-Z]/g) || []).length);
}

console.log(`\n=== country setup unsaved guard: ${checks} checks, ${fails.length} failed ===`);
if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
