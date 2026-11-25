// #drag-writes-without-save + #enter-writes-without-save
//
// AN ORDINARY EDIT MUST NOT WRITE TO THE MOD. IT WAITS FOR THE SAVE BUTTON.
//
// Nova is a document editor: typing, pressing Enter, dragging something and clicking away should change what
// is on screen and nothing on disk until the user presses Save. Almost all of it already worked that way —
// a sweep of all 139 write sites across the nine maker pages found 43 behind a Save button and 80 behind a
// separately-labelled action button. Three did not, and all three were reachable by pure reflex:
//
//   1. THE CONTINUOUS FOCUSES PANEL (Focus Tree). Letting go after dragging the panel POSTed
//      /api/focus/continuous-position straight into common/national_focus/<tree>.txt. No button, no
//      confirmation, nothing to undo. Measured live on Millennium Dawn's USA tree: one drag, one write.
//      It never needed the request: the old code wrote and THEN patched the same value into sourceText "so
//      a subsequent focus-tree save doesn't clobber it" — and Save IS rewriteCoordinates(sourceText, parsed),
//      a preserve-merge over that string. Staging was already the whole job.
//
//   2. ENTER IN THE EQUIPMENT EDITOR (Military). A delegated keydown on #eqEditor turned Enter in ANY input
//      into a click on eqSaveBtn / vvSaveBtn / nfCreateBtn, so tabbing through stat boxes and hitting Enter
//      out of habit wrote the equipment to common/units/equipment. It also reached buttons that were not on
//      screen: the fallback chain meant that on a chassis, whose editor shows none of them, Enter still
//      clicked whichever hidden one existed.
//
//   3. ENTER IN "ADD NATIONAL SPIRIT" AND "ADD STARTING TECHNOLOGY" (Country Setup). Each POSTed on the key
//      press — creating <mod>/history/countries/<TAG>.txt if the mod had none, or rewriting the country's
//      whole set_technology block. The Browse pickers went the same way on a single click.
//
// Verified live against Millennium Dawn with every non-GET recorded AND blocked, so nothing could reach the
// mod either way:
//     drag the Continuous Focuses panel   → 0 writes, tree marked dirty, Ctrl+Z puts it back
//     type in an equipment stat box       → 0 writes
//     …then press Enter                   → 0 writes, "Entered — 💾 Save equipment when ready."
//     …then click 💾 Save equipment       → POST /api/equipment/save        (positive control)
//     Enter in the spirit / tech boxes    → 0 writes, "1 spirit — unsaved, click Save Details"
//     …then click Save Details            → details, then one set-startup per staged spirit, then the techs
//     add a spirit and remove it again    → Save sends nothing for it at all
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
// ⭐ Every fix above explains itself in prose that names the endpoints and symbols checked below — including
// the ones that must be ABSENT. Strip first, or each check finds the sentence describing it.
const read = (f) => stripJsComments(fs.readFileSync(path.join(PUB, f), "utf8"));
const APP = read("app.js"), ARMY = read("army.js"), CS = read("country-setup.js");

/** A named function's source, brace-matched — but skipping braces inside strings, regexes and templates. */
function fnText(code, name) {
  const at = code.search(new RegExp("(?:async\\s+)?function\\s+" + name + "\\s*\\("));
  if (at === -1) return "";
  let i = code.indexOf("{", at), d = 0, mode = null, quote = "";
  for (; i < code.length; i++) {
    const c = code[i], p = code[i - 1];
    if (mode) {
      if (mode === "str" && c === quote && p !== "\\") mode = null;
      else if (mode === "re" && c === "/" && p !== "\\") mode = null;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") { mode = "str"; quote = c; continue; }
    // A '/' starting a regex literal, as opposed to division: good enough here, and only used to skip braces.
    if (c === "/" && /[=(,:[!&|?{};]\s*$/.test(code.slice(Math.max(0, i - 12), i))) { mode = "re"; continue; }
    if (c === "{") d++;
    else if (c === "}") { d--; if (d === 0) return code.slice(at, i + 1); }
  }
  return "";
}

console.log("\n[1] the Focus Tree's Continuous Focuses panel — a drag is an edit, not a save");
{
  rec("the writer is gone", !/function cfSaveTreePosition/.test(APP), "cfSaveTreePosition is back");
  const stage = fnText(APP, "cfStageTreePosition");
  rec("…replaced by a stager", stage.length > 200, stage.length);
  // The whole point: it must not talk to the server.
  rec("…which issues NO request", !/fetch\(/.test(stage), stage.slice(0, 200));
  rec("…and nothing in app.js posts the position any more", !/continuous-position/.test(APP), "the endpoint is still called from the page");
  // ⚠️ THIS CHECK USED TO REQUIRE `sourceText = sourceText.replace(...)`, which was the right idea and the
  // wrong place. parsed.focuses[].blockStart/blockEnd index INTO sourceText, so patching it mid-session
  // shifted every offset and the next Save spliced the tree at the wrong places — measured at 43,241 bytes
  // lost on Millennium Dawn's USA tree, with the file still parsing so nothing caught it. The position is
  // staged out-of-band now and applied after the rewrite. See test-save-writes-what-was-staged.js.
  rec("…it stages the move out-of-band, NOT into sourceText",
    /pendingTreeHeaderEdits\.set\("continuous_focus_position"/.test(stage) && !/sourceText = /.test(stage),
    stage.slice(0, 240));
  rec("…and marks the tree dirty, like every other edit", /markDirty\(true\)/.test(stage), stage.slice(0, 200));
  // …and says so, or a staged change is indistinguishable from a saved one.
  rec("…and says it is unsaved", /unsaved/i.test(stage), stage.slice(-200));

  const end = fnText(APP, "cfPanelEndDrag");
  rec("the drag-end handler is found", end.length > 100, end.length);
  rec("…it snapshots for undo", /pushUndoSnapshot\(\)/.test(end), end.slice(0, 300));
  // Before the mutation, or the snapshot records the move rather than the state before it.
  rec("…before it moves anything", end.indexOf("pushUndoSnapshot()") < end.indexOf("cfState.position ="), end.slice(0, 300));
  rec("…and calls the stager, not a saver", /cfStageTreePosition\(x, y\)/.test(end), end.slice(-200));

  // CONTROL: staging is only safe because Save is a preserve-merge over the very string we patch.
  rec("CONTROL: Save still merges over sourceText", /rewriteCoordinates\(sourceText, parsed\)/.test(APP), "Save no longer preserves sourceText — staging there would be lost");
  rec("CONTROL: …and sourceText is in the undo snapshot", /sourceText: sourceText/.test(fnText(APP, "snapshotEditorState")), "Ctrl+Z would not undo the move");
}

console.log("\n[2] the Military equipment editor — Enter commits the field, not the file");
{
  const m = /eqEd\.addEventListener\("keydown"[\s\S]{0,700}?\n {6}\}\);/.exec(ARMY);
  rec("the Enter handler is findable", !!m, "handler not found");
  const h = m ? m[0] : "";
  rec("…it no longer clicks a Save button", !/\.click\(\)/.test(h), h.slice(0, 300));
  rec("…it stops the key doing anything else", /e\.preventDefault\(\)/.test(h), h.slice(0, 300));
  rec("…and commits the field by blurring it", /\.blur\(\)/.test(h), h.slice(0, 300));
  rec("…telling the user Save is still theirs to press", /eqSaveStatus/.test(h), h.slice(0, 300));

  // CONTROL: the Save button must still save, or the fix removed the feature instead of the reflex.
  rec("CONTROL: the Save button still writes", /\$\("eqSaveBtn"\)\.addEventListener\("click", \(\) => saveEquip\(/.test(ARMY), "the equipment Save button lost its handler");
  rec("CONTROL: …and the amber unsaved cue still appears on typing", /classList\.add\("unsaved"\)/.test(ARMY), "nothing marks the editor unsaved");
  // The Deploy fields deliberately KEEP Enter-to-submit: deployBtn only stages into the in-memory model,
  // so it is not a write and not what the user objected to.
  rec("CONTROL: Deploy keeps Enter-to-submit (it only stages)", /deployBtn[\s\S]{0,60}\.click\(\)/.test(ARMY), "the deploy shortcut was removed too — it was not the problem");
}

console.log("\n[3] Country Setup — starting spirits and technologies are staged");
{
  for (const [name, why] of [["addSpirit", "typing a spirit id and pressing Enter"], ["removeSpirit", "clicking ✕ Remove"],
                             ["addTech", "typing a tech id and pressing Enter"], ["removeTech", "removing a starting tech"]]) {
    const f = fnText(CS, name);
    rec(`${name} is found`, f.length > 40, f.length);
    rec(`…and ${why} issues NO request`, !/fetch\(/.test(f), f.slice(0, 220));
    rec(`…it marks the page dirty instead`, /csMarkDirty\(\)/.test(f), f.slice(0, 220));
  }

  // The baselines the flush diffs against.
  rec("a spirit baseline is kept", /savedSpirits = \[\.\.\.currentSpirits\]/.test(CS), "no baseline — the flush could not know what changed");
  rec("…and a tech baseline", /savedTechs = \[\.\.\.currentTechs\]/.test(CS), "no tech baseline");

  const flush = fnText(CS, "flushStagedStartup");
  rec("the flusher exists", flush.length > 200, flush.length);
  // ⭐ A DIFF, NOT AN OPERATION LOG. Add a spirit, change your mind, remove it — a diff sends nothing; a
  // replayed log would faithfully do both.
  rec("…and it works out a DIFF against the baseline", /!savedSpirits\.includes\(s\)/.test(flush) && /!currentSpirits\.includes\(s\)/.test(flush), flush.slice(0, 300));
  rec("…sending additions and removals", /active: true|\[addedSpirits, true\]/.test(flush) && /\[removedSpirits, false\]/.test(flush), flush.slice(0, 400));
  rec("…and stopping on the first failure so the rest stay staged", /throw new Error/.test(flush), flush.slice(0, 400));
  rec("…re-baselining once it has been written", /savedSpirits = \[\.\.\.currentSpirits\]/.test(flush), flush.slice(-300));

  // ⭐ ONE DRAIN. Anything else calling these would be a second, unstaged path straight back to the bug.
  const startupCalls = (CS.match(/fetch\("\/api\/history\/set-startup"/g) || []).length;
  rec("set-startup is called from exactly one place", startupCalls === 1, startupCalls);
  rec("…and that place is the flusher", /fetch\("\/api\/history\/set-startup"/.test(flush), "the call is outside flushStagedStartup");
  const techSaveCalls = (CS.match(/(?<!function )\bsaveCountryTechs\(\)/g) || []).length;
  rec("saveCountryTechs is called from exactly one place", techSaveCalls === 1, techSaveCalls);
  rec("…and the flusher is it", /await saveCountryTechs\(\)/.test(flush), "the tech write is outside the flusher");

  // …and Save Details is what runs it.
  rec("Save Details runs the flush", /await flushStagedStartup\(\);/.test(CS), "nothing flushes the staged lists");
  const save = fnText(CS, "saveCountryDetails");
  rec("…from inside the save handler", /flushStagedStartup\(\)/.test(save), "the flush is not on the save path");
  rec("…after the details write, so a failure does not half-write", save.indexOf("save-country-details") < save.indexOf("flushStagedStartup()"), "ordering changed");

  // …and the user can see that the list is ahead of the file.
  rec("the spirit count says when it is unsaved", /unsaved, click Save Details/.test(CS), "a staged list would look identical to a saved one");

  // CONTROL: the feature still exists — we staged it, we did not delete it.
  rec("CONTROL: the startup endpoint is still used", /\/api\/history\/set-startup/.test(CS), "the feature was removed rather than staged");
  rec("CONTROL: …and the tech writer still exists", /\/api\/technologies\/save-country-techs/.test(CS), "the tech writer vanished");
  rec("CONTROL: the Browse pickers go through the staged path", /addSpirit\(item\.ideaId\)/.test(CS) && /addTech\(item\.id\)/.test(CS), "a picker writes by its own route");
}

console.log(`\n=== edits wait for save: ${checks} checks, ${fails.length} failed ===`);
if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
