// #country-tree-switch-discards-unsaved-work  +  #clearing-an-anchor-keeps-the-offset
//
// TWO THINGS IN THE FOCUS EDITOR, BOTH ABOUT WORK NOT SURVIVING.
//
// 1. THE COUNTRY DROPDOWN DISCARDED UNSAVED WORK WITHOUT ASKING.
//
//    It is the ordinary way to open another country's tree, and it called loadFile() with no unsaved-work
//    check at all. The two paths beside it DO ask — switching mods ("You have unsaved changes in the current
//    tree. Switch mods and discard them?") and + New Tree. The most-used exit was the unguarded one.
//
//    The question itself was already owned twice over: __focusEditorHasUnsavedChanges and the suite-nav
//    guard both wrote out `dirty && !saveInFlight`, while the two confirm paths asked the narrower `dirty`
//    alone and this one asked nothing. It is one named function now, and all four callers use it — so
//    whatever counts as unsaved work in future counts everywhere at once.
//
// 2. CLEARING A FOCUS'S RELATIVE ANCHOR KEPT THE OLD OFFSET AS THE NEW ABSOLUTE POSITION.
//
//    The sidebar handler converts correctly in memory — x/y become absolute — and then clears `moved`,
//    which it must, because resolveLayout reads `moved` as "displayX/displayY are authoritative". But the
//    save gate is `moved || positionDirty || forceRewrite`, and computeWriteValues reaches this focus
//    through neither of its two rules: explicitRelative needs an anchor that is still SET, and toAbsolute is
//    seeded from `moved`. Meanwhile rewriteFocusBlockRelativePosition runs unconditionally and DOES remove
//    the relative_position_id line.
//
//    So a focus anchored to A at offset (3,2), sitting at absolute (43,12), loses its anchor and the file
//    still says x = 3, y = 2 — now absolute. It reloads at (3,2).
//
//    The opposite direction was already covered: SETTING an anchor is caught by explicitRelative. Only the
//    clear fell through, which is why this survived the #sidebar-coordinate-never-saved pass.
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

console.log("\n[one owner for 'is there unsaved focus work']");
{
  rec("the question is a named function", /function focusEditorHasUnsavedWork\(\) \{ return Boolean\(dirty && !saveInFlight\); \}/.test(SRC),
    "the expression is written out per caller again");
  // ⭐ DERIVED: every caller must use it. Any surviving copy of the raw expression is a caller that will
  // drift the next time what counts as unsaved work changes.
  const raw = (SRC.match(/Boolean\(dirty && !saveInFlight\)/g) || []).length;
  rec("…and it is the only place that expression appears", raw === 1, `${raw} copies of Boolean(dirty && !saveInFlight)`);
  const narrow = (SRC.match(/typeof dirty !== "undefined" && dirty &&/g) || []).length;
  rec("…and no caller asks the narrower `dirty` on its own", narrow === 0, `${narrow} callers still ask only dirty`);
  rec("the Electron quit hook uses it", /window\.__focusEditorHasUnsavedChanges = focusEditorHasUnsavedWork;/.test(SRC), "the quit dialog asks a different question");
  rec("the suite-nav guard uses it", /novaGuardSuiteNav\(focusEditorHasUnsavedWork, "the Focus Tree"\)/.test(SRC), "leaving the page asks a different question");
  rec("switching mods uses it", /focusEditorHasUnsavedWork\(\) &&\s*!confirm\("You have unsaved changes in the current tree\. Switch mods/.test(SRC), "the mod switch asks a different question");
  rec("+ New Tree uses it", /focusEditorHasUnsavedWork\(\) &&\s*!confirm\("You have unsaved changes\. Create a new focus tree/.test(SRC), "+ New Tree asks a different question");
}

console.log("\n[the country dropdown asks before it discards]");
{
  const handler = SRC.slice(SRC.indexOf('countryTreeSelectEl.addEventListener("change"'), SRC.indexOf('countryTreeSelectEl.addEventListener("change"') + 1800);
  rec("the handler was found", handler.length > 400, handler.length);
  rec("it asks at all", /if \(focusEditorHasUnsavedWork\(\)\) \{/.test(handler), "the most-used exit still discards silently");
  // ⚠ app.js is CRLF. A "\n" in a literal anchor matches nothing here, and the check would report the fix
  // missing when it is right there — so the line break is matched as \r?\n, never typed.
  const putBackAt = handler.search(/syncCountryTreeSelectToLoaded\(\);\r?\n\s*if \(!confirm\(/);
  const confirmAt = handler.indexOf('!confirm("You have unsaved changes in the current tree. Open a different');
  rec("…naming what it is about to do", confirmAt !== -1, "no message, or a different one");
  // ⭐ THE LABEL GOES BACK FIRST. Cancelling has to leave the dropdown naming the tree that is open — the
  // same rule the mod dropdowns follow, and the one this test would otherwise pass without.
  rec("…putting the label back BEFORE asking", putBackAt !== -1 && putBackAt < confirmAt, { putBackAt, confirmAt });
  // Again: no trailing comment in the anchor — this source is comment-stripped. What matters is that the
  // pick is put BACK after the confirm, since the line above had just reverted the dropdown to the open tree.
  const reapplyAt = handler.indexOf("countryTreeSelectEl.value = p;");
  rec("…and re-applying the pick once they agree", reapplyAt !== -1 && reapplyAt > confirmAt, { confirmAt, reapplyAt });
  const loadAt = handler.indexOf("await loadFile();");
  rec("…before the load runs", confirmAt !== -1 && loadAt !== -1 && confirmAt < loadAt, { confirmAt, loadAt });
  rec("CONTROL: it still refuses while a save or load is in flight", /if \(saveInFlight \|\| loadInFlight\) \{/.test(handler), "the in-flight guard went");
  // Counted, not matched on the trailing comment: this source is comment-stripped, so anchoring on
  // "// keep the dropdown showing the loaded country" could never match anything.
  rec("CONTROL: …and still resyncs the label afterwards",
    (handler.match(/syncCountryTreeSelectToLoaded\(\);/g) || []).length >= 2,
    (handler.match(/syncCountryTreeSelectToLoaded\(\);/g) || []).length);
}

console.log("\n[clearing an anchor writes the position]");
{
  const handler = SRC.slice(SRC.indexOf('sbRelativeEl.addEventListener("change"'), SRC.indexOf('sbRelativeEl.addEventListener("change"') + 1900);
  rec("the sidebar anchor handler was found", handler.length > 500, handler.length);
  rec("it marks the position dirty", /focus\.positionDirty = true;/.test(handler), "the x/y line is never re-emitted");
  const movedAt = handler.indexOf("focus.moved = false;");
  const dirtyAt = handler.indexOf("focus.positionDirty = true;");
  rec("…after clearing `moved`, which is what cancelled the write", movedAt !== -1 && dirtyAt > movedAt, { movedAt, dirtyAt });
  rec("CONTROL: it still clears `moved`", movedAt !== -1, "the canvas would keep showing the old place");
  rec("CONTROL: …and still converts x/y between frames", /focus\.x = absX - newAnchor\.displayX/.test(handler) && /focus\.x = absX;/.test(handler), "the conversion went");
  rec("CONTROL: the write gate still honours positionDirty", /focus\.moved \|\| focus\.positionDirty \|\| focus\.forceRewrite/.test(SRC), "the flag would have nothing to do");
  rec("CONTROL: the anchor LINE is still rewritten unconditionally", /const withRelative = rewriteFocusBlockRelativePosition\(withConditions, focus\);/.test(SRC),
    "clearing the anchor would leave the line behind instead");
}

console.log("\n[RUN IT] the real computeWriteValues, over a cleared anchor");
{
  const src = fnSource("function computeWriteValues(parsedData)");
  rec("computeWriteValues was extracted", src.length > 900, src.length);
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(src, ctx);
  const run = (focuses) => { vm.runInContext("computeWriteValues(" + JSON.stringify({ focuses }) + ")", ctx); return null; };
  // vm.runInContext can't hand the objects back mutated, so run it on objects that live inside the context.
  const compute = (focuses) => {
    ctx.data = { focuses };
    vm.runInContext("computeWriteValues(data)", ctx);
    return ctx.data.focuses;
  };

  const anchor = () => ({ id: "A", x: 40, y: 10, displayX: 40, displayY: 10, relativePositionId: null, sourceRelativePositionId: null, moved: false });

  {
    // THE BUG: the anchor was cleared in the sidebar. x/y are already absolute; `moved` is false.
    const out = compute([anchor(), { id: "B", x: 43, y: 12, displayX: 43, displayY: 12, relativePositionId: null, sourceRelativePositionId: "A", moved: false, positionDirty: true }]);
    const b = out.find((f) => f.id === "B");
    rec("RUN: a cleared anchor gets its absolute position written", b.writeX === 43 && b.writeY === 12, b);
  }
  {
    // Without positionDirty — what the code did before — nothing is written at all, and the block keeps
    // "x = 3, y = 2" while the relative_position_id line is removed from around it.
    const out = compute([anchor(), { id: "B", x: 43, y: 12, displayX: 43, displayY: 12, relativePositionId: null, sourceRelativePositionId: "A", moved: false }]);
    const b = out.find((f) => f.id === "B");
    rec("RUN: …and without the flag it gets nothing — THE BUG", b.writeX === undefined && b.writeY === undefined, b);
  }
  {
    // The opposite direction was always covered: SETTING an anchor is explicitRelative, so the offset is
    // computed from the anchor and the block is force-rewritten even without `moved`.
    const out = compute([anchor(), { id: "B", x: 43, y: 12, displayX: 43, displayY: 12, relativePositionId: "A", sourceRelativePositionId: null, moved: false }]);
    const b = out.find((f) => f.id === "B");
    rec("RUN: setting an anchor writes the OFFSET", b.writeX === 3 && b.writeY === 2, b);
    rec("RUN: …and forces the block to be re-emitted", b.forceRewrite === true, b);
  }
  {
    // positionDirty must never overwrite a value one of the two rules already decided.
    const out = compute([anchor(), { id: "B", x: 999, y: 999, displayX: 43, displayY: 12, relativePositionId: "A", sourceRelativePositionId: null, moved: false, positionDirty: true }]);
    const b = out.find((f) => f.id === "B");
    rec("RUN: the fallback never overrides a rule that already decided", b.writeX === 3 && b.writeY === 2, b);
  }
  {
    // And a focus nobody touched keeps writeX/writeY undefined, so its block is left byte-for-byte.
    const out = compute([anchor(), { id: "B", x: 3, y: 2, displayX: 43, displayY: 12, relativePositionId: "A", sourceRelativePositionId: "A", moved: false }]);
    const b = out.find((f) => f.id === "B");
    rec("RUN: an untouched focus is still left alone", b.writeX === undefined && b.forceRewrite === false, b);
  }
}

console.log(`\n=== focus exits and anchor clear: ${checks} checks, ${fails.length} failed ===`);
if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
