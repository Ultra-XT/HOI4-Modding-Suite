// #exit-saver-presses-the-wrong-button · #staged-stockpile-compared-by-COUNT ·
// #sidebar-input-list-is-hand-written · #clearing-an-icon-is-accepted-and-never-written
//
// FOUR ADOPTION GAPS, ALL OF THE SAME FAMILY: a list or a lookup that describes something else in the
// codebase, written out by hand, and now disagreeing with the thing it describes.
//
// 1. THE QUIT DIALOG'S SAVE PRESSED A BUTTON THAT DOES NOT OWN THE WORK.
//
//        if (S.equip && (S.equip.editorDirty || S.equip.variantDirty)) {
//          const b = $("eqSaveBtn") || $("vvSaveBtn");
//
//    Two flags, one lookup. editorDirty does belong to those two. variantDirty belongs to neither — it is
//    set by the Designer's own inputs and cleared only by saveDesignerVariant, whose button is #dsgSaveBtn.
//    Both editors live on the same Equipment sub-tab, so #eqSaveBtn is usually on screen: the quit dialog
//    clicked it, rewrote an equipment file the user never edited, cleared only editorDirty, waited out the
//    settle timeout, and returned false — which main.js turns into "The file could not be saved" with no
//    error to fix and no clue which file was written.
//
// 2. STAGED STOCKPILE WAS COMPARED BY COUNT. `S.stockpile.length !== S._spSavedCount` — so removing one
//    starting-stockpile entry and adding another was invisible to every guard, and so was editing a row in
//    place. Sizes are not sets.
//
// 3. THE TECH SIDEBAR WIRED syncForm() TO A HAND-WRITTEN LIST OF 30 IDS while #editorPanel held 35 controls.
//    Derived and diffed, four of the five unwired are legitimate (the AI prompt, a file input, the country
//    picker, and a checkbox with its own handler) and exactly one was a defect: #techCountryLock, which
//    syncForm READS — it recombines allow_branch into extraScript — and which nothing ever called syncForm
//    for. Picking a country lock and saving wrote nothing, and the next sidebar refresh rebuilt the dropdown
//    from the old script.
//
// 4. CLEARING A FOCUS'S ICON WAS ACCEPTED AND NEVER WRITTEN. `Boolean(focus.iconKey && …)` is false for an
//    empty string, so emptying the field wrote nothing and the old `icon = GFX_…` line stayed on disk —
//    while Nova's canvas, its sidebar note ("the game will use a generic default") and its validator all
//    agreed the focus had no icon. An empty string here is a real choice, not a missing value.
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
const PUB = path.join(__dirname, "public");
const ARMY = stripJsComments(fs.readFileSync(path.join(PUB, "army.js"), "utf8"));
const RES = stripJsComments(fs.readFileSync(path.join(PUB, "research.js"), "utf8"));
const RESHTML = fs.readFileSync(path.join(PUB, "research.html"), "utf8");
const APP = stripJsComments(fs.readFileSync(path.join(PUB, "app.js"), "utf8"));

console.log("\n[each dirty flag presses the button that clears it]");
{
  const saver = APPSlice(ARMY, "window.__focusEditorSaveBeforeExit = async () =>");
  rec("the exit saver was extracted", saver.length > 600, saver.length);
  rec("it no longer uses one lookup for two flags", !/const b = \$\("eqSaveBtn"\) \|\| \$\("vvSaveBtn"\);/.test(saver),
    "the quit dialog can still press a Save that does not own the work");
  rec("editorDirty presses the equipment editor's Save", /pressAndSettle\(\$\("eqSaveBtn"\), clean\)/.test(saver), "");
  rec("…falling back to the variant editor's", /pressAndSettle\(\$\("vvSaveBtn"\), clean\)/.test(saver), "");
  rec("…and then the role grid's, which renders where no #eqSaveBtn exists", /document\.querySelector\("\.role-save"\)/.test(saver),
    "ticking a role on a read-only equipment branch dead-ends the quit dialog");
  rec("variantDirty presses the DESIGNER's Save", /pressAndSettle\(\$\("dsgSaveBtn"\)/.test(saver),
    "a half-built variant still rewrites an unrelated equipment file");
  // ⭐ DERIVED: whatever clears a flag is that flag's owner. If a fourth button starts clearing one of
  // these, it has to be reachable from here too.
  const clearsEditor = [...ARMY.matchAll(/S\.equip\.editorDirty = false/g)].length;
  const clearsVariant = [...ARMY.matchAll(/S\.equip\.variantDirty = false/g)].length;
  rec("the flags are still cleared in the savers this presses", clearsEditor >= 2 && clearsVariant >= 1, { clearsEditor, clearsVariant });
  rec("CONTROL: saveDesignerVariant is still what #dsgSaveBtn runs", /\$\("dsgSaveBtn"\)\.addEventListener\("click", saveDesignerVariant\);/.test(ARMY), "the designer's button changed hands");
  rec("CONTROL: the saver still answers the question it was asked", /return !hasUnsavedArmy\(\);/.test(ARMY), "it would close the window over unsaved work");
}

console.log("\n[the staged stockpile is compared by content]");
{
  rec("there is a content signature", /const stockpileSignature = \(list\) => JSON\.stringify\(list \|\| \[\]\);/.test(ARMY),
    "a swap of one entry for another is still invisible");
  rec("…and the check uses it, not the length", /stockpileSignature\(S\.stockpile\) !== \(S\._spSavedSig/.test(ARMY), "still comparing counts");
  rec("…serialized whole, so no field list can fall behind a row", !/_spSavedSig = .*\.map\(/.test(ARMY), "a hand-written field list crept back in");
  rec("the baseline is taken where the list comes from the file", /S\._spSavedSig = stockpileSignature\(S\.stockpile\);/.test(ARMY), "the baseline is never established");
  rec("…and reset with the list when the country changes", /S\._spSavedSig = stockpileSignature\(\[\]\);/.test(ARMY),
    "the previous country's signature would be compared against the next country's list");
  rec("CONTROL: the count is still kept for 'clearing vs losing'", /S\._spSavedCount = S\.stockpile\.length;/.test(ARMY),
    "the 'Saved 0 entries' guard lost the count it needs");

  // RUN the real signature over a swap — the case a count cannot see.
  const src = (/const stockpileSignature = [^\n]+/.exec(ARMY) || [""])[0];
  const ctx = {}; vm.createContext(ctx); vm.runInContext(src + "\nvar sig = stockpileSignature;", ctx);
  const sig = (l) => vm.runInContext("sig(" + JSON.stringify(l) + ")", ctx);
  const a = [{ type: "infantry_equipment", amount: 100 }, { type: "artillery_equipment", amount: 50 }];
  const b = [{ type: "infantry_equipment", amount: 100 }, { type: "support_equipment", amount: 50 }];
  rec("RUN: the same list is the same signature", sig(a) === sig(a.map((x) => ({ ...x }))), { a: sig(a) });
  rec("RUN: ⭐ swapping one entry for another CHANGES it — a count cannot see this", sig(a) !== sig(b) && a.length === b.length, { a: sig(a), b: sig(b) });
  rec("RUN: editing an amount in place changes it", sig(a) !== sig([{ type: "infantry_equipment", amount: 101 }, a[1]]), "");
  rec("RUN: an empty list is stable", sig([]) === sig(null), { empty: sig([]) });
}

console.log("\n[the tech sidebar wires what the panel actually contains]");
{
  rec("the wired set is derived from the panel", /document\.querySelectorAll\("#editorPanel input, #editorPanel select, #editorPanel textarea"\)/.test(RES),
    "it is a hand-written list again, and the next field added will be forgotten");
  rec("…with the exclusions named", /const NOT_TECH_FIELDS = \[/.test(RES), "anything left out is left out silently");
  rec("…and visualInputs still hand-written on purpose", /const visualInputs = \["techName"/.test(RES), "the canvas-repaint subset was derived away — it is not derivable");

  // ⭐ THE PROOF: derive the panel's controls from the MARKUP and check nothing that syncForm reads is left
  // unwired. This is the check that would have caught #techCountryLock.
  const at = RESHTML.indexOf('id="editorPanel"');
  const start = RESHTML.lastIndexOf("<", at);
  let i = start, depth = 0, end = RESHTML.length;
  const re = /<div\b|<\/div>/g; re.lastIndex = start;
  let m;
  while ((m = re.exec(RESHTML)) !== null) { if (m[0] === "<div") depth++; else { depth--; if (depth === 0) { end = m.index; break; } } }
  const region = RESHTML.slice(start, end);
  const panelIds = [...region.matchAll(/<(?:input|select|textarea)\b[^>]*\bid="([^"]+)"/g)].map((x) => x[1]);
  rec("the panel's controls were found in the markup", panelIds.length >= 30, panelIds.length);

  const syncForm = APPSlice(RES, "function syncForm()");
  rec("syncForm was extracted", syncForm.length > 1000, syncForm.length);
  const excluded = ((/const NOT_TECH_FIELDS = \[([\s\S]*?)\];/.exec(RES) || [, ""])[1].match(/"([^"]+)"/g) || []).map((s) => s.replace(/"/g, ""));
  const readButExcluded = panelIds.filter((id) => excluded.includes(id) && syncForm.includes(`"${id}"`));
  console.log("     excluded: " + excluded.join(", "));
  console.log("     …of those, READ by syncForm: " + (readButExcluded.join(", ") || "none"));
  // countryTechResearched is read by syncForm AND excluded — legitimately, it has its own change handler.
  const hasOwnHandler = (id) => new RegExp(id + "\\.addEventListener\\(\"change\"").test(RES);
  const unexplained = readButExcluded.filter((id) => !hasOwnHandler(id));
  rec("every excluded control that syncForm READS has its own handler", unexplained.length === 0,
    { unexplained, note: "a control syncForm reads but nothing wires is silently dropped on save" });
}

console.log("\n[clearing a focus icon removes the line]");
{
  rec("an empty icon counts as a change", /const iconCleared = focus\.iconKey === "" && Boolean\(focus\.sourceIconKey\);/.test(APP),
    "clearing the field still writes nothing and the old icon stays on disk");
  rec("…folded into the rewrite gate", /const shouldRewriteIcon = iconCleared \|\| Boolean\(focus\.iconKey && focus\.iconKey !== focus\.sourceIconKey\);/.test(APP), "");
  rec("a cleared scalar line is REMOVED, not blanked", /if \(iconCleared\) \{ lines\.splice\(i, 1\); i -= 1; \}/.test(APP),
    "`icon = ` with nothing after it is not valid Clausewitz");
  rec("a cleared complex icon block is removed whole", /if \(iconCleared\) lines\.splice\(i, end - i \+ 1\);/.test(APP),
    "splicing only the opener would orphan the body and unbalance the file");
  rec("…and an empty one is never inserted", /if \(shouldRewriteIcon && !iconFound && !iconCleared\) \{/.test(APP), "a focus with no icon line would gain `icon = `");

  // RUN the real rewriter.
  const fn = APPSlice(APP, "function rewriteFocusBlockMetadata(blockText, focus)");
  rec("the rewriter was extracted", fn.length > 800, fn.length);
  const ctx = {}; vm.createContext(ctx); vm.runInContext(fn, ctx);
  const run = (block, focus) => vm.runInContext("rewriteFocusBlockMetadata(" + JSON.stringify(block) + "," + JSON.stringify(focus) + ")", ctx);

  const scalar = "\tfocus = {\n\t\tid = my_focus\n\t\ticon = GFX_focus_generic_industry\n\t\tcost = 10\n\t}";
  rec("RUN: ⭐ clearing removes the icon line", !/icon\s*=/.test(run(scalar, { id: "my_focus", iconKey: "", sourceIconKey: "GFX_focus_generic_industry" })),
    run(scalar, { id: "my_focus", iconKey: "", sourceIconKey: "GFX_focus_generic_industry" }));
  rec("RUN: …and leaves everything else alone", /id = my_focus/.test(run(scalar, { id: "my_focus", iconKey: "", sourceIconKey: "GFX_focus_generic_industry" })) && /cost = 10/.test(run(scalar, { id: "my_focus", iconKey: "", sourceIconKey: "GFX_focus_generic_industry" })), "");
  rec("RUN: changing to a new icon still rewrites it", /icon = GFX_new/.test(run(scalar, { id: "my_focus", iconKey: "GFX_new", sourceIconKey: "GFX_focus_generic_industry" })), "");
  rec("RUN: an untouched focus is byte-identical", run(scalar, { id: "my_focus", iconKey: "GFX_focus_generic_industry", sourceIconKey: "GFX_focus_generic_industry" }) === scalar, "");
  rec("RUN: a focus that never had an icon and still has none is untouched",
    run("\tfocus = {\n\t\tid = a\n\t}", { id: "a", iconKey: "", sourceIconKey: "" }) === "\tfocus = {\n\t\tid = a\n\t}",
    "an empty icon line would be inserted");

  const block = "\tfocus = {\n\t\tid = my_focus\n\t\ticon = {\n\t\t\ttrigger = { always = yes }\n\t\t\ticon = GFX_a\n\t\t}\n\t\tcost = 10\n\t}";
  const cleared = run(block, { id: "my_focus", iconKey: "", sourceIconKey: "GFX_a" });
  rec("RUN: ⭐ a cleared COMPLEX icon block goes whole", !/icon/.test(cleared), cleared);
  rec("RUN: …leaving the braces balanced", (cleared.match(/\{/g) || []).length === (cleared.match(/\}/g) || []).length, cleared);
  rec("RUN: …and the rest of the block intact", /id = my_focus/.test(cleared) && /cost = 10/.test(cleared), cleared);
}

/**
 * Source of a named function — never a fixed character window.
 *
 * ⚠ Brace counting alone is NOT safe here. rewriteFocusBlockMetadata contains regex literals with braces in
 * them — /^icon\s*=\s*\{/ and lines[j].match(/\{/g) — and a naive counter reads `\{` as an opening brace. It
 * counted three opens against one close, ran off the end of the file and returned "", which read as "the
 * function is missing" when it was right there.
 *
 * For a TOP-LEVEL function (column 0 in app.js) the reliable terminator is a `}` at the start of a line.
 * For a nested one, fall back to brace counting, which is fine where no such regex appears.
 */
function APPSlice(src, header) {
  const at = src.indexOf(header);
  if (at === -1) return "";
  // Count braces on a MASKED copy of the same length, so the indices still line up with the original.
  // What gets masked is exactly what a naive counter gets wrong: an escaped brace (\{ or \}), which is what
  // a regex literal uses, and a brace that is the whole content of a quoted string ("{" / '}').
  // A first attempt terminated on a `}` at column 0 instead; that works for a top-level function and
  // silently over-captures an indented one, which made syncForm's slice swallow half the file and "find"
  // four ids that are not in it.
  const masked = src
    .replace(/\\[{}]/g, "\\x")
    .replace(/(['"])([{}])\1/g, "$1x$1");
  let i = masked.indexOf("{", at + header.length - 1), d = 0;
  for (; i < masked.length; i++) {
    if (masked[i] === "{") d++;
    else if (masked[i] === "}") { d--; if (d === 0) return src.slice(at, i + 1); }
  }
  return "";
}

console.log(`\n=== exit saver and derived lists: ${checks} checks, ${fails.length} failed ===`);
if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
