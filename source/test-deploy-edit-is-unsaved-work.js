// #deploy-edit-not-drained-by-save
//
// A DIVISION BEING EDITED WAS INVISIBLE TO SAVE, AND SAVE SAID IT WORKED.
//
// Clicking a placed division tile turns the deploy form into an editor of that division: the button reads
// "✓ Update this one" and the status line reads "Editing one division at province 6521. Change the boxes
// and press Update." Change the commander and press 💾 Save army instead of Update, and the save fired for
// real, reported success, and did not contain what was typed. The typed name stayed in the box, so nothing
// on screen said it had been dropped — and leaving the page did not ask, because hasUnsavedArmy() could not
// see the form either.
//
// Measured on GER in the running Military maker before the fix: typed "Erwin Rommel TEST" into the commander
// box of a division being edited, pressed 💾 Save army → one POST to /api/army/save whose body did NOT
// contain the name, no prompt on leaving, name still in the box.
//
// And after, on the same page:
//     open the editor, touch nothing → leaving does not ask   (no false positive)
//     type                           → ZERO writes            (it waits for Save)
//     type → leave                   → "You have unsaved changes in the Military page"
//     type → 💾 Save army            → the POST body contains "Rommel TEST", and leaving is clean again
//
// The baseline this needed already existed: startDeployEdit records S.deployEdit.seed — the exact strings it
// put in those boxes — so applyDeployEdit can tell a field the user CHANGED from one they only looked at.
// The knowledge was in the writer and not in the save path.
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
const SRC = stripJsComments(fs.readFileSync(path.join(__dirname, "public", "army.js"), "utf8"));

function fnSource(header, openAfter) {
  const at = SRC.indexOf(header);
  if (at === -1) return "";
  let i = SRC.indexOf("{", at + (openAfter || header.length) - 1), d = 0;
  for (; i < SRC.length; i++) {
    if (SRC[i] === "{") d++;
    else if (SRC[i] === "}") { d--; if (d === 0) return SRC.slice(at, i + 1); }
  }
  return "";
}
const SAVE_ARMY = fnSource("async function saveArmy()");
const START_EDIT = fnSource("function startDeployEdit(div)");
const APPLY = fnSource("function applyDeployEdit()");
const EXIT = fnSource("window.__focusEditorSaveBeforeExit = async () =>");

console.log("\n[the form is unsaved work]");
{
  rec("there is a dirty check for the division being edited", /const deployEditDirty = \(\) => \{/.test(SRC), "a mid-edit division is still invisible");
  const dd = fnSource("const deployEditDirty = () => {");
  rec("…it compares against the seed, not a flag", /const seed = S\.deployEdit\.seed;/.test(dd), dd.slice(0, 200));
  // ⭐ All three editable fields. A hand-picked subset is how a field gets forgotten — derive nothing here by
  // eye: applyDeployEdit writes exactly officer/equip/exp, so the dirty check must cover exactly those.
  for (const f of ["deployOfficer", "deployEquip", "deployExp"]) {
    rec(`…covering ${f}`, new RegExp('now\\("' + f + '"\\) !== seed\\.').test(dd), dd.slice(0, 260));
  }
  rec("…and no field applyDeployEdit writes is missing from it",
    ["officer", "equip", "exp"].every((k) => dd.indexOf("seed." + k) !== -1) && /changed\("officer"\)/.test(APPLY) && /changed\("equip"\)/.test(APPLY) && /changed\("exp"\)/.test(APPLY),
    "the writer and the dirty check disagree about which fields exist");
  rec("…and it is false when nothing is being edited", /if \(!S\.deployEdit \|\| !S\.deployEdit\.seed\) return false;/.test(dd), "it would throw, or report dirty, with no edit open");

  rec("hasUnsavedArmy counts it", /hasStagedStockpile\(\) \|\| deployEditDirty\(\)\) && !S\._armySaving/.test(SRC), "leaving the page still discards it silently");
  rec("CONTROL: …alongside everything it already counted",
    /S\.unsaved \|\| \(S\.equip && \(S\.equip\.editorDirty \|\| S\.equip\.variantDirty\)\) \|\| hasStagedNavalAir\(\) \|\| hasStagedStockpile\(\)/.test(SRC),
    "an earlier fix was dropped on the way in");
}

console.log("\n[Save writes what is on screen]");
{
  const drainAt = SAVE_ARMY.indexOf("if (deployEditDirty()) { applyDeployEdit();");
  const readsModelAt = SAVE_ARMY.indexOf("S.model.templates.find");
  rec("saveArmy folds the form into the model", drainAt !== -1, "Save still writes the division as it was");
  rec("…BEFORE it reads the model", drainAt !== -1 && readsModelAt !== -1 && drainAt < readsModelAt, { drainAt, readsModelAt });
  rec("…and clears the form's own 'Don't forget Save' line", /const ds = \$\("deployStatus"\); if \(ds\) ds\.textContent = "";/.test(SAVE_ARMY),
    "that line would sit under a save that just happened");
  rec("the exit saver reaches it too", /if \(S\.unsaved \|\| deployEditDirty\(\)\) \{ try \{ await saveArmy\(\); \}/.test(EXIT),
    "'Save' on the quit dialog would skip saveArmy entirely");
}

console.log("\n[CONTROL] the baseline this is built on still exists");
{
  rec("startDeployEdit still records the seed", /S\.deployEdit\.seed = \{/.test(START_EDIT), "there is nothing to compare against");
  rec("…as the exact strings in the boxes", /officer: \(\$\("deployOfficer"\) && \$\("deployOfficer"\)\.value\) \|\| ""/.test(START_EDIT), "a parsed value would make a retyped 30 read as a change");
  rec("…and applyDeployEdit still writes only what changed", /const changed = \(k\) => seed\[k\] === undefined \|\| now\[k\] !== seed\[k\];/.test(APPLY),
    "draining the form would now homogenise the division");
  rec("…and still marks the model unsaved", /setUnsaved\(true\);/.test(APPLY), "the drained edit would not be written");
}

console.log("\n[RUN IT] the dirty check against a stand-in form");
{
  const src = fnSource("const deployEditDirty = () => {");
  rec("the check was extracted", src.length > 200, src.length);
  const boxes = { deployOfficer: "Rommel", deployEquip: "45", deployExp: "30" };
  const S = { deployEdit: null };
  const ctx = { S, $: (id) => (id in boxes ? { get value() { return boxes[id]; } } : null) };
  vm.createContext(ctx);
  vm.runInContext(src + ";", ctx);
  const dirty = () => vm.runInContext("deployEditDirty()", ctx);

  rec("RUN: with no division being edited, nothing is dirty", dirty() === false, "it would fire on the placing form too");
  S.deployEdit = { seed: { officer: "Rommel", equip: "45", exp: "30" } };
  rec("RUN: opening the editor and touching nothing is clean", dirty() === false, "every tile click would claim unsaved work");
  boxes.deployOfficer = "Erwin Rommel TEST";
  rec("RUN: …changing the commander is dirty", dirty() === true, "the commander is invisible to Save");
  boxes.deployOfficer = "Rommel"; boxes.deployEquip = "80";
  rec("RUN: …changing equipment is dirty", dirty() === true, "equipment is invisible to Save");
  boxes.deployEquip = "45"; boxes.deployExp = "";
  rec("RUN: …clearing experience is dirty", dirty() === true, "an emptied box reads as no change");
  boxes.deployExp = "30";
  rec("RUN: …and putting it all back is clean", dirty() === false, "the check is a flag, not a comparison");
  // Retyping the same value is not a change — the seed is compared as STRINGS for exactly this reason.
  boxes.deployExp = "30";
  rec("RUN: retyping the same value identically is not a change", dirty() === false, "the user would be asked about work they did not do");
  S.deployEdit = { div: {}, loc: 1 }; // an edit opened before the seed was recorded
  rec("RUN: an edit with no seed yet is not dirty", dirty() === false, "it would throw mid-save");
}

console.log(`\n=== deploy edit is unsaved work: ${checks} checks, ${fails.length} failed ===`);
if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
