// #exit-save-writes-nothing
//
// THE QUIT DIALOG SAID "UNSAVED CHANGES", THE USER PRESSED SAVE, AND NOTHING WAS WRITTEN.
//
// Electron's quit handler asks the page two questions through two globals: __focusEditorHasUnsavedChanges
// ("is there anything to lose?") and __focusEditorSaveBeforeExit ("save it, and tell me whether that
// worked"). On the Military page those two disagreed about what counts as unsaved work.
//
//   hasUnsavedArmy()             S.unsaved || equip.editorDirty || equip.variantDirty
//                                          || hasStagedNavalAir() || hasStagedStockpile()
//   __focusEditorSaveBeforeExit  saved only when S.unsaved, and returned !S.unsaved
//
// So with staged ships and an otherwise clean model: the dialog correctly said there were unsaved changes,
// the user chose Save, the saver ran nothing, returned true, and the window closed on work that was never
// written — work the user had explicitly asked to keep.
//
// The two staged kinds have their own savers (naSave, stockpileSave) and the sub-editors have their own Save
// buttons, so the fix uses them and then answers the question that was actually asked: is anything still
// unsaved? A false answer keeps the window open and re-offers the dialog, where "Don't Save" is still there
// for someone who means it.
//
// Tested by running both predicates and the real saver over synthetic states. The defect is a disagreement
// between two boolean expressions, so that disagreement is what is measured — not the navy panel's UI.
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

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
const { stripJsComments } = require("./testlib-strip-comments.js");
const JS = stripJsComments(fs.readFileSync(path.join(__dirname, "public", "army.js"), "utf8"));

const grab = (re, what) => {
  const m = re.exec(JS);
  rec(`${what} was extracted`, !!m, "not found in army.js");
  return m ? m[0] : "";
};

(async () => {
  const stagedNA = grab(/const hasStagedNavalAir = [^\n]+/, "hasStagedNavalAir");
  // hasStagedStockpile compares the list's CONTENT now (#staged-stockpile-compared-by-COUNT), so it spans
  // two lines and needs its signature helper alongside it. A single-line grab truncated the expression to
  // `Array.isArray(S.stockpile) && !S._spLoadFailed`, which is true for an EMPTY list — so a clean page
  // reported staged stockpile work and this fixture called stockpileSave on it.
  const spSig = grab(/const stockpileSignature = [^\n]+/, "stockpileSignature");
  // `;\r?\n`, not `;\n`. This repo is core.autocrlf=true with no .gitattributes, so git stores LF and
  // checks CRLF out — army.js is CRLF in any fresh clone, and was only LF in the working copy this test
  // was written in because a tool had rewritten it since the last checkout. A bare `;\n` therefore matched
  // nothing on a clone, the extraction returned "", and the sandbox below died on
  // `hasStagedStockpile is not defined` — a failure that looked like a bug in army.js and was a line ending.
  const stagedSP = grab(/const hasStagedStockpile = [\s\S]*?;\r?\n/, "hasStagedStockpile");
  // Both globals call this now: a division open in the deploy form with an edited box is unsaved work.
  // Taken from the source rather than stubbed, so a change to it is felt here too.
  const deployDirty = grab(/const deployEditDirty = \(\) => \{[\s\S]*?\n  \};/, "deployEditDirty");
  const unsaved = grab(/const hasUnsavedArmy = [^\n]+/, "hasUnsavedArmy");
  const saver = grab(/window\.__focusEditorSaveBeforeExit = async \(\) => \{[\s\S]*?\n  \};/, "the exit saver");

  console.log("\n[the contract] the two globals must answer about the same thing");
  rec("the page publishes the unsaved question", /window\.__focusEditorHasUnsavedChanges = hasUnsavedArmy;/.test(JS), "main.js cannot ask this page");
  rec("…and the saver", /window\.__focusEditorSaveBeforeExit = async/.test(JS), "the quit dialog's Save would dead-end");
  // ⭐ THE BUG IN ONE LINE: the saver used to answer `!S.unsaved`, a narrower question than the one asked.
  rec("the saver answers the SAME question it was asked", /return !hasUnsavedArmy\(\);/.test(saver), "it answers about a subset of the unsaved work");
  rec("…and not the old narrower one", !/return !S\.unsaved;/.test(saver), "it is back to reporting only the army model");

  /** Build a page in a given state and hand back its two globals plus a log of what got called. */
  function make(state, opts = {}) {
    const calls = [];
    const ctx = {
      S: state, calls, buttons: opts.buttons || {},
      // Mirrors what the real saveArmy does: it drains a mid-edit deploy form through applyDeployEdit (which
      // clears S.deployEdit) before writing, so the saver's closing "is anything still unsaved?" sees a
      // clean form. Without that the stub would report unsaved work it had just been told to save.
      saveArmy: async () => { calls.push("saveArmy"); if (!opts.stickArmy) { ctx.S.unsaved = false; ctx.S.deployEdit = null; } },
      naSave: async () => { calls.push("naSave"); if (!opts.stickNA) ctx.S.na = { ships: [], groups: [] }; },
      // Mirrors the real stockpileSave, which re-reads the file afterwards and re-takes BOTH baselines —
      // the count (for "clearing vs losing") and the content signature that hasStagedStockpile compares.
      // Setting only the count left the fixture reporting staged work it had just been told to save.
      stockpileSave: async () => {
        calls.push("stockpileSave");
        if (opts.stickSP) return;
        ctx.S._spSavedCount = (ctx.S.stockpile || []).length;
        ctx.S._spSavedSig = JSON.stringify(ctx.S.stockpile || []);
      },
      $: (id) => ctx.buttons[id] || null,
      // The saver reaches for the role grid's own button by CLASS, on the read-only equipment branches that
      // render no #eqSaveBtn at all. #exit-saver-presses-the-wrong-button
      document: { querySelector: (sel) => ctx.buttons[sel] || null },
      setTimeout: (fn, ms) => setTimeout(fn, 0), // keep the settle loop quick
      Promise,
    };
    ctx.window = ctx;
    vm.createContext(ctx);
    vm.runInContext(`${stagedNA}\n${spSig}\n${stagedSP}\n${deployDirty}\n${unsaved}\nwindow.__focusEditorHasUnsavedChanges = hasUnsavedArmy;\n${saver}\n`, ctx);
    return { ctx, calls, isDirty: () => ctx.window.__focusEditorHasUnsavedChanges(), save: () => ctx.window.__focusEditorSaveBeforeExit() };
  }
  const clean = () => ({ unsaved: false, na: { ships: [], groups: [] }, stockpile: [], _spSavedCount: 0, equip: {} });

  console.log("\n[RUN IT] every kind of unsaved work is saved, or admitted to");

  {
    const p = make(clean());
    const ok = await p.save();
    rec("a clean page writes nothing", p.calls.length === 0, p.calls);
    rec("…and reports it is safe to close", ok === true, ok);
  }
  {
    const p = make(Object.assign(clean(), { unsaved: true }));
    const ok = await p.save();
    rec("a dirty army model is saved", p.calls.includes("saveArmy"), p.calls);
    rec("…and then it is safe to close", ok === true, ok);
  }
  {
    // #deploy-edit-not-drained-by-save — a division open in the deploy form with a changed box. S.unsaved is
    // FALSE here (the form only reaches the model on "✓ Update this one"), which is exactly why the saver
    // used to skip saveArmy entirely and the quit dialog's Save wrote nothing.
    const state = Object.assign(clean(), { deployEdit: { seed: { officer: "Rommel", equip: "45", exp: "30" } } });
    const boxes = { deployOfficer: { value: "Erwin Rommel TEST" }, deployEquip: { value: "45" }, deployExp: { value: "30" } };
    const p = make(state, { buttons: boxes });
    rec("a division mid-edit DOES count as unsaved", p.isDirty() === true, "the quit dialog would not even warn");
    const ok = await p.save();
    rec("…and the exit saver saves the army for it", p.calls.includes("saveArmy"), p.calls);
    rec("…even though S.unsaved was false the whole time", state.unsaved === false, state.unsaved);
    rec("…and reports it is safe to close", ok === true, ok);
  }
  {
    // The negative half: the form is OPEN but untouched. Opening an editor is not unsaved work.
    const state = Object.assign(clean(), { deployEdit: { seed: { officer: "Rommel", equip: "45", exp: "30" } } });
    const boxes = { deployOfficer: { value: "Rommel" }, deployEquip: { value: "45" }, deployExp: { value: "30" } };
    const p = make(state, { buttons: boxes });
    rec("a division opened but not changed is NOT unsaved", p.isDirty() === false, "every tile click would block the quit dialog");
    const ok = await p.save();
    rec("…and nothing is written for it", p.calls.length === 0, p.calls);
    rec("…and it is safe to close", ok === true, ok);
  }
  {
    // ⭐ THE REPORTED CASE. The dialog warned; the saver used to write nothing and say it had.
    const p = make(Object.assign(clean(), { na: { ships: [{}, {}], groups: [] } }));
    rec("staged ships DO count as unsaved", p.isDirty() === true, "the dialog would not even warn");
    const ok = await p.save();
    rec("…and the exit save actually saves them", p.calls.includes("naSave"), p.calls);
    rec("…and only then reports it is safe to close", ok === true, ok);
  }
  {
    const p = make(Object.assign(clean(), { stockpile: [{}, {}] }));
    rec("staged stockpile rows count as unsaved", p.isDirty() === true, "the dialog would not warn");
    const ok = await p.save();
    rec("…and the exit save saves them", p.calls.includes("stockpileSave"), p.calls);
    rec("…and reports safe to close", ok === true, ok);
  }
  {
    // A sub-editor's buffer belongs to its own Save button — press the one that is on screen.
    const state = Object.assign(clean(), { equip: { editorDirty: true } });
    const p = make(state, { buttons: {} });
    // ⚠️ The flag clears ASYNCHRONOUSLY, because that is what a real save does — it reports through the
    // dirty flag, not through the click. A stub that cleared it synchronously made the settle loop look
    // unnecessary: removing the wait changed nothing and the back-out went silent.
    p.ctx.buttons.eqSaveBtn = {
      disabled: false, getClientRects: () => [{}],
      click: () => { p.calls.push("eqSaveBtn.click"); setTimeout(() => { state.equip.editorDirty = false; }, 30); },
    };
    const ok = await p.save();
    rec("a dirty sub-editor's own Save is pressed", p.calls.includes("eqSaveBtn.click"), p.calls);
    rec("…and it WAITS for the write to land before answering", ok === true, "answered before the sub-editor save reported back");
  }
  {
    // ⭐ THE HONESTY CASE. Something could not be saved, so it must NOT say the page is safe to close.
    const p = make(Object.assign(clean(), { na: { ships: [{}], groups: [] } }), { stickNA: true });
    const ok = await p.save();
    rec("work that could not be saved is admitted", ok === false, "it would close on unsaved ships again");
  }
  {
    // …and a sub-editor whose Save button is not on screen cannot be pressed, so that is admitted too.
    const p = make(Object.assign(clean(), { equip: { variantDirty: true } }));
    const ok = await p.save();
    rec("an unreachable sub-editor Save is admitted, not assumed", ok === false, "it would close on a dirty variant");
  }
  {
    // A button that is present but hidden must not be clicked — same rule as Ctrl+S.
    const state = Object.assign(clean(), { equip: { editorDirty: true } });
    const p = make(state);
    p.ctx.buttons.eqSaveBtn = { disabled: false, getClientRects: () => [], click: () => p.calls.push("eqSaveBtn.click") };
    const ok = await p.save();
    rec("a hidden sub-editor Save is not pressed", !p.calls.includes("eqSaveBtn.click"), p.calls);
    rec("…and that is admitted rather than assumed", ok === false, ok);
  }

  console.log("\n[CONTROL] the surrounding machinery still stands");
  rec("staged naval/air is still counted", /hasStagedNavalAir\(\)/.test(unsaved), "staged ships stopped counting as unsaved");
  rec("staged stockpile is still counted", /hasStagedStockpile\(\)/.test(unsaved), "staged stockpile stopped counting");
  rec("a save in flight still suppresses the warning", /!S\._armySaving/.test(unsaved), "quitting mid-save would warn about itself");
  rec("the page still registers with the shared nav guard", /novaGuardSuiteNav\(hasUnsavedArmy/.test(JS), "leaving by a nav link is unguarded");
  rec("the army save still posts", /fetch\("\/api\/army\/save"/.test(JS), "the army writer vanished");

  console.log(`\n=== army exit save is honest: ${checks} checks, ${fails.length} failed ===`);
  if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
})();
