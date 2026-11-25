// #restore-baseline-never-asks  +  #map-page-never-publishes-the-quit-hooks  +
// #vp-row-change-does-not-reach-the-save-button  +  #rename-row-retargets-silently
//
// FOUR WAYS THE MAP EDITOR COULD LOSE WORK WITHOUT ASKING.
//
// 1. "RESTORE BASELINE" WIPED map/, history/states AND history/countries WITH NO CONFIRMATION.
//
//        if (window.showNovaConfirmModal) showNovaConfirmModal("… This DISCARDS every map edit …", doRestore, …);
//        else doRestore();
//
//    showNovaConfirmModal is not a global. It exists once in the repo — a plain declaration inside
//    research.js's IIFE — and is never assigned to window; map.html does not load research.js. The probe was
//    permanently false, so the else branch ran the destructive restore immediately. Confirmed in the running
//    page: typeof window.showNovaConfirmModal === "undefined".
//
//    The page HAS a modal — ai-field-assist.js defines window.novaConfirm and map.html loads it. It was
//    asking for the wrong name. Measured after the fix: clicking Restore baseline raised one dialog
//    ("Restore (discard my edits)" / "Keep my edits", danger) and issued ZERO writes while the answer was
//    withheld; answering yes then issued /api/map/restore-baseline.
//
//    The OTHER probe of the same dead name — the older-checkpoint restore — was never unsafe: its fallback
//    was `else if (window.confirm(msg)) { go(); }`, which asks and only proceeds on yes. It is included here
//    so the distinction is not lost: a dead probe is only dangerous when the fallback PROCEEDS.
//
// 2. CLOSING THE WINDOW ON THE MAP EDITOR ASKED NOTHING AT ALL.
//
//    main.js asks the page window.__focusEditorHasUnsavedChanges() before closing and treats a page that
//    does not publish it as having nothing to lose. map.html loads neither loading-overlay.js nor anything
//    else that publishes it, and map.js published nothing — so the ONE page whose entire model is staged in
//    memory until 💾 Save was the one page where closing Nova discarded it silently.
//
// 3. Deleting a victory point left 💾 Save DISABLED. The panel's signature counts VP rows, but the button is
//    refreshed by a delegated input/change listener and removing a DOM row fires neither — so with a deleted
//    VP as the only change the button read "(0)" and could not be clicked. Measured: before, disabled; after,
//    "Save changes (1)" and enabled.
//
// 4. The ✎ rename rows read their target dropdown when Rename is pressed, and nothing closed them when the
//    target moved. Open ✎ for region A, type a name, click another state — the dropdown is repopulated and
//    Rename renames whatever is selected now. Measured: the row now closes and its input clears.
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
const PUB = path.join(__dirname, "public");
const MAP = stripJsComments(fs.readFileSync(path.join(PUB, "map.js"), "utf8"));
const MAPHTML = fs.readFileSync(path.join(PUB, "map.html"), "utf8");
const MAIN = stripJsComments(fs.readFileSync(path.join(__dirname, "main.js"), "utf8"));

console.log("\n[the dead confirm name]");
{
  // ⭐ DERIVED: find every probe of a window.* dialog in map.js and check the name is actually defined
  // somewhere that map.html loads. That is what would have caught this, rather than reading the branch.
  const loaded = [...MAPHTML.matchAll(/src="\.\/([a-z-]+\.js)"/g)].map((m) => m[1]);
  console.log("     map.html loads: " + loaded.join(", "));
  rec("the scripts map.html loads were found", loaded.length >= 1, loaded);

  const definesGlobal = (name) => ["map.js", ...loaded].some((f) => {
    try { return new RegExp("window\\." + name + "\\s*=").test(fs.readFileSync(path.join(PUB, f), "utf8")); } catch (_) { return false; }
  });
  const probes = [...MAP.matchAll(/window\.([A-Za-z_][A-Za-z0-9_]*)\s*(?:===\s*"function"|\)|&&)/g)]
    .map((m) => m[1])
    .filter((n) => /confirm|modal|prompt|alert/i.test(n));
  const undefinedProbes = [...new Set(probes)].filter((n) => !definesGlobal(n));
  console.log("     dialog globals map.js probes: " + [...new Set(probes)].join(", "));
  rec("every dialog global map.js probes is actually defined on a script this page loads",
    undefinedProbes.length === 0, { undefinedProbes });

  rec("the dead name is gone from map.js", !/showNovaConfirmModal/.test(MAP),
    "map.js still probes a name that only exists inside research.js's closure");
}

console.log("\n[the destructive restore asks, and refuses by default]");
{
  const at = MAP.indexOf("const restoreMsg =");
  const region = at === -1 ? "" : MAP.slice(at, at + 900);
  rec("the restore confirmation was found", region.length > 200, region.length);
  rec("it asks through a modal that exists here", /window\.novaConfirm\(restoreMsg, doRestore,/.test(region),
    "the restore runs with no question");
  rec("…marked danger, with labels that say what each choice does", /danger: true/.test(region) && /yesLabel: "Restore \(discard my edits\)"/.test(region) && /cancelLabel: "Keep my edits"/.test(region), region.slice(0, 300));
  // ⚠️ MOVED WITH the review of the units-baseline fixes (R2): the message is built by baselineRestoreConfirmText from what the baseline
  // holds; "It cannot be undone." is in the part of it every baseline gets, so that is where it is asked for
  const cf = MAP.indexOf("function baselineRestoreConfirmText(");
  const confirmBody = cf === -1 ? "" : MAP.slice(cf, MAP.indexOf("\n  function ", cf + 10));
  // ⚠️ MOVED WITH B6-26 (#a-restore-says-what-it-leaves): the sentence now discards "every map edit made to them" — the folders it lists
  rec("…and the message says the edits cannot be undone", /const restoreMsg = baselineRestoreConfirmText\(/.test(region)
    && /This DISCARDS every map edit made to them since the baseline was saved, including what`\s*\+ ` Country Setup\$\{[^`]*\} changed in them\. It cannot be undone\.`/.test(confirmBody), confirmBody.slice(0, 600));
  // ⭐ THE CRUX. The fallback must ASK, never proceed.
  rec("…and with no dialog at all it asks window.confirm", /\} else if \(window\.confirm\(restoreMsg\)\) \{ doRestore\(\); \}/.test(region),
    "the fallback proceeds without asking — the original bug");
  rec("…so nothing calls doRestore unconditionally", !/^\s*else doRestore\(\);/m.test(MAP), "there is still a bare else that restores");

  rec("CONTROL: the checkpoint restore still asks too", /window\.novaConfirm\(msg, go, \{ title: "This checkpoint is older than your last save"/.test(MAP), "the checkpoint guard went");
  rec("CONTROL: …and its fallback still only proceeds on yes", /\} else if \(window\.confirm\(msg\)\) \{ go\(\); \}/.test(MAP), "it now proceeds unasked");
}

console.log("\n[the quit dialog can see the map's work]");
{
  rec("main.js asks the page before closing", /window\.__focusEditorHasUnsavedChanges && window\.__focusEditorHasUnsavedChanges\(\)/.test(MAIN),
    "the premise changed — re-check this whole section");
  rec("…and treats no answer as nothing to lose", /if \(!hasUnsavedChanges\) \{[\s\S]{0,120}allowWindowClose = true;/.test(MAIN),
    "a page that publishes nothing is no longer closed silently — re-check");

  rec("the map publishes the question", /window\.__focusEditorHasUnsavedChanges = mapHasUnsavedWork;/.test(MAP), "closing Nova on the Map discards staged work with no dialog");
  rec("…and the saver", /window\.__focusEditorSaveBeforeExit = async \(\) => \{/.test(MAP), "the quit dialog's Save would dead-end");
  // ONE OWNER: the nav guard and both hooks must ask the same function.
  rec("…both asking the same function as the nav guard", /const dirtyNow = mapHasUnsavedWork\(\);/.test(MAP),
    "the nav guard and the quit dialog can disagree about what counts");
  rec("…which covers every kind of staged map work",
    /return Boolean\(dirtyMap \|\| \(paintDiff && paintDiff\.size\) \|\| armyHasUnsaved\(\) \|\| stateFormDirty\(\)\);/.test(MAP),
    "a kind of staged work dropped out of the predicate");
  const saver = MAP.slice(MAP.indexOf("window.__focusEditorSaveBeforeExit"), MAP.indexOf("window.__focusEditorSaveBeforeExit") + 900);
  rec("the saver actually flushes the queue", /await flushMapSaves\(\);/.test(saver), "it would report success without writing");
  rec("…and the army panel's own saver", /await armySave\(\);/.test(saver), "staged divisions would be lost on quit");
  // ⭐ It must answer the question it was ASKED, not assume.
  rec("…and then re-asks rather than assuming", /return !mapHasUnsavedWork\(\);/.test(saver),
    "returning true over unsaved work is how a quit dialog closes the window on it");
}

console.log("\n[a victory-point change reaches the Save button]");
{
  rec("deleting a row refreshes the button", /row\.remove\(\); updateSaveButton\(\);/.test(MAP),
    "the button stays at (0) and DISABLED over a deleted victory point");
  const addAt = MAP.indexOf("function addVpRow(prov)");
  const addFn = addAt === -1 ? "" : MAP.slice(addAt, addAt + 420);
  rec("…and so does adding one", /updateSaveButton\(\);/.test(addFn), addFn.slice(0, 200));
  rec("CONTROL: the panel signature still counts the VP rows", /\.mi-vp-row/.test(MAP) && /vp:/.test(MAP), "the rows left the signature");
  rec("CONTROL: …and the button is still disabled at zero", /btn\.disabled = n === 0/.test(MAP), "the button no longer reflects the count");
}

console.log("\n[a rename row cannot retarget]");
{
  const regionSel = MAP.slice(MAP.indexOf('$("miRegionSel").addEventListener("change"'), MAP.indexOf('$("miRegionSel").addEventListener("change"') + 500);
  rec("changing the region dropdown closes its rename row", /miRegionRenameRow/.test(regionSel), "Rename would target whatever is selected now");
  const supplySel = MAP.slice(MAP.indexOf('$("miSupplySel").addEventListener("change"'), MAP.indexOf('$("miSupplySel").addEventListener("change"') + 500);
  rec("…and the supply dropdown closes its own", /miSupplyRenameRow/.test(supplySel), "same hazard for supply areas");
  // showInfo repopulates BOTH dropdowns when the panel is refilled for another state.
  // Brace-matched, not a fixed character window: showInfo is long and the close sits well past any round
  // number I would have picked — a 4000-char window reported the fix missing when it was right there.
  const showInfo = (() => {
    const at = MAP.indexOf("function showInfo()");
    if (at === -1) return "";
    let i = MAP.indexOf("{", at), d = 0;
    for (; i < MAP.length; i++) { if (MAP[i] === "{") d++; else if (MAP[i] === "}") { d--; if (d === 0) return MAP.slice(at, i + 1); } }
    return "";
  })();
  rec("showInfo was extracted whole", showInfo.length > 3000, showInfo.length);
  rec("…and refilling the panel closes both", /\["miRegionRenameRow", "miRegionRenameInput"\], \["miSupplyRenameRow", "miSupplyRenameInput"\]/.test(showInfo),
    "clicking another state leaves an open row pointed at a new target");
  rec("…clearing the typed name with them", /if \(inp\) inp\.value = "";/.test(showInfo), "the stale name would be re-applied to the next target");
}

console.log(`\n=== map asks before it destroys: ${checks} checks, ${fails.length} failed ===`);
if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
