// #country-switch-discards-the-tree
//
// PICKING ANOTHER COUNTRY THREW AWAY EVERY UNSAVED RESEARCH EDIT, SILENTLY.
//
// The header's country dropdown calls loadCountryTechs(), which ends in `await loadCatalog()` on both of its
// paths — and loadCatalog re-reads everything from the server: allTechs, dirtyTechIds, pendingDeletions, the
// staged label and year edits. So changing country discarded a dragged tech, a rename, a queued deletion,
// with no prompt.
//
// Ninety lines above it, the MOD dropdown does this properly: it puts the selector back, asks, and only
// proceeds when the user agrees. The same guard, one caller short — the shape this codebase keeps finding.
//
// Verified in the running Research Tree on Millennium Dawn (988 techs, 461 countries):
//     edit a year stamp, then change country  → "…Switch country anyway and lose them?",
//                                               and cancelling leaves the header on CHS
//     agree                                   → it switches (CHS → ABK)
//     a clean page                            → switches with no prompt at all (0 asks)
//     throughout                              → 0 non-GET requests
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
const { stripJsComments } = require("./testlib-strip-comments.js");
const JS = stripJsComments(fs.readFileSync(path.join(__dirname, "public", "research.js"), "utf8"));

const country = /const selector = document\.getElementById\("headerCountrySelector"\);[\s\S]*?\n    \}\);/.exec(JS);
const mod = /selector\.addEventListener\("change", async \(e\) => \{[\s\S]*?Switch mod anyway[\s\S]*?\n      \}\);/.exec(JS);

console.log("\n[the premise] switching country really does reload everything");
{
  const load = /async function loadCountryTechs\(\)[\s\S]*?\n  \}/.exec(JS);
  rec("loadCountryTechs is findable", !!load, "not found");
  rec("…and it reloads the catalog", !!load && (load[0].match(/await loadCatalog\(\)/g) || []).length >= 1, "if it no longer reloads, this guard may be unnecessary");
  // Both paths, so neither the blank option nor a real tag escapes it.
  rec("…on both of its paths", !!load && (load[0].match(/await loadCatalog\(\)/g) || []).length === 2, load && (load[0].match(/await loadCatalog\(\)/g) || []).length);
}

console.log("\n[the guard] the country dropdown asks first");
{
  rec("the country handler is findable", !!country, "handler not found");
  const h = country ? country[0] : "";
  rec("…it checks for unsaved work", /if \(!dirty \|\| next === activeCountryTag\)/.test(h), h.slice(0, 300));
  rec("…and asks before discarding", /Switch country anyway and lose them\?/.test(h), h.slice(0, 400));
  // ⭐ ORDER: novaConfirm is asynchronous, so the selector must go back before the dialog appears, or it
  // names a country that is not loaded for as long as the user deliberates.
  // ⚠️ Require the line to EXIST as well as come first. `indexOf` returns -1 when it is gone, and -1 is
  // less than any real index, so deleting it made this check pass — the back-out went silent.
  const putBack = h.indexOf("e.target.value = activeCountryTag");
  const asks = h.indexOf("Switch country anyway");
  rec("…putting the selector back BEFORE it asks", putBack !== -1 && asks !== -1 && putBack < asks, { putBack, asks });
  rec("…and re-applying it only on agreement", /proceed = \(\) => \{[\s\S]{0,240}selector\.value = next;[\s\S]{0,60}applyCountrySwitch\(next\)/.test(h), h.slice(0, 500));
  rec("…and falling back to confirm() when the dialog is absent", /\} else if \(confirm\(msg\)\) \{ proceed\(\); \}/.test(h), "no fallback — a page without novaConfirm would discard silently");
  // Discarding must also drop the starting-tech ticks, which belonged to the country being left.
  rec("…and discards the country's staged starting techs", /countryTechsDirty = false;/.test(h), "they would be written to the NEXT country's history file");
  // Re-selecting the same country is not a discard, so it must not ask.
  rec("…while re-picking the same country is silent", /next === activeCountryTag/.test(h), "it would prompt on a no-op");
}

console.log("\n[CONTROL] it matches the sibling it was copied from");
{
  rec("the mod dropdown still guards", !!mod, "the sibling guard vanished");
  const m = mod ? mod[0] : "";
  rec("…with the same put-it-back-then-ask shape", /e\.target\.value = lastModPath;/.test(m) && /Switch mod anyway/.test(m), m.slice(0, 300));
  rec("…and the same dialog helper", /window\.novaConfirm/.test(m), "the two guards drifted apart");
  rec("the page still tracks a dirty flag", /window\.__focusEditorHasUnsavedChanges = \(\) => dirty;/.test(JS), "the unsaved question went");
  rec("…and still owns a Save button", /saveAllBtn/.test(JS), "the research save vanished");
}

console.log(`\n=== research country switch guarded: ${checks} checks, ${fails.length} failed ===`);
if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
