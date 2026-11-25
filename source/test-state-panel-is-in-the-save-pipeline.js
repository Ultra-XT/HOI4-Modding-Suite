// #state-panel-is-not-in-the-save-pipeline
//
// THE MAP'S STATE PANEL WAS NOT WIRED TO THE SAVE BUTTON AT ALL.
//
// Every other tool on the map editor stages a write the moment you act, and the global 💾 Save button
// flushes the queue. The state panel — name, owner, cores, population, category, victory points, buildings,
// resources, naval base — had no change listeners of any kind. The only thing that turned typing into a
// staged write was the panel's own "Save state" button, three inches away. So:
//
//   • Type a new population. The 💾 button stays "Save changes (0)", DISABLED, tooltip "No unsaved changes
//     yet". The app tells you there is nothing to save while the value sits in the box in front of you.
//   • Click another state, or pick a tool, or leave the page. Nothing asks. The typing is gone.
//
// Measured in the running map editor before the fix: typed a name, a population and an infrastructure level
// into state 1 (Corsica) → "💾 Save changes (0)", zero staged writes; left and came back → 322900 / Corsica
// / 2 restored, no prompt. The panel's own "Save state" button DID stage it → "(1)" — the positive control
// that the staging path itself was fine, and only the wiring was missing.
//
// And measured after, on the same four paths:
//     type                      → "(1)", enabled, and ZERO writes  (it waits for Save, as it must)
//     leave the state → 💾 Save → set-state for state 1 carrying all three typed values
//     type → 💾 Save in place   → set-state for state 3, manpower 555222
//     type → a nav link         → "You have unsaved changes on the Map. Leave without saving?"
//     type → a tool mode        → staged, "(1)", no writes
//     browse 11 states, toggle modes, TYPE NOTHING → stays "(0)", disabled  (no phantom writes)
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
const SRC = stripJsComments(fs.readFileSync(path.join(__dirname, "public", "map.js"), "utf8"));

// Pull one function's source out by brace matching, so ORDER inside it can be checked rather than guessed at
// from a whole-file grep that would happily match the same words in a different function.
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
const SHOW_INFO = fnSource("function showInfo()");
const FLUSH = fnSource("async function flushMapSaves()");
const SAVE_BTN = fnSource("function updateSaveButton()");
const STAGE = fnSource("function stageStateWrite(sid, pid)");
const SAVE_STATE = fnSource("async function saveState()");

console.log("\n[the panel is unsaved work]");
{
  rec("the panel has a signature of its own fields", /function stateFormFieldSignature\(\)/.test(SRC), "no owner for 'the panel differs from what was loaded'");
  rec("…a dirty check built on it", /function stateFormDirty\(\)/.test(SRC), "nothing to ask");
  rec("…and a re-baseline for after it is staged", /function rebaselineStateForm\(\)/.test(SRC), "the panel would stay dirty forever after a save");
  // The signature must NOT contain the state id. `selected` is already the NEW state by the time showInfo
  // runs, so an id in the signature makes every selection change look like an edit.
  rec("the signature covers the FIELDS ONLY, not which state they belong to",
    /function stateFormFieldSignature/.test(SRC) && !/parts\s*=\s*\[\s*"s="/.test(SRC),
    "an id in the signature makes every jump read as an edit");
  rec("…and the state it belongs to is remembered beside it", /stateId: selected && selected\.stateId, provinceId: selected && selected\.provinceId, sig/.test(SRC), "no way to aim the staged write");
  rec("the baseline is declared above updateSaveButton, which reads it",
    SRC.indexOf("let stateFormBaseline") !== -1 && SRC.indexOf("let stateFormBaseline") < SRC.indexOf("function updateSaveButton"),
    "a `let` throws for anything reaching it before its own line runs");
}

console.log("\n[the Save button knows]");
{
  rec("the count includes the panel", /pendingWrites\.length \+ \(paintDiff && paintDiff\.size \? 1 : 0\) \+ \(stateFormDirty\(\) \? 1 : 0\)/.test(SAVE_BTN), SAVE_BTN.slice(0, 200));
  rec("…and it is still what disables the button", /btn\.disabled = n === 0/.test(SAVE_BTN), "the button no longer reflects the count");
  // (⛔ #a-town-in-a-running-save-stays-ticked — the listener hands the event's target to heldTownBox first, then refreshes the button)
  rec("typing in the panel refreshes the button", /\$\("miEditFields"\)\.addEventListener\(ev, \(e?\) => (?:\{ heldTownBox\(e && e\.target\); )?updateSaveButton\(\)/.test(SRC), "the button would not light up until something else moved");
  // ⭐ The user's actual requirement: typing must not SAVE. The listener may refresh the button and nothing else.
  const listener = SRC.slice(SRC.indexOf('["input", "change"].forEach'), SRC.indexOf('["input", "change"].forEach') + 220);
  rec("…and typing does NOT save, stage, or write anything",
    listener.length > 40 && !/fetch|queueWrite|stageStateWrite|saveState|flushMapSaves/.test(listener),
    listener.slice(0, 200));
}

console.log("\n[Save writes what is on screen]");
{
  const stageAt = FLUSH.indexOf("stageStateWrite(stateFormBaseline.stateId");
  // the line it says when there is nothing to save — `setStatus("Nothing to save.")` until a stale page after a Delete map's fold had to
  // read the map again there too and was handed the same line (review of 5a1af33f, K4): the literal is where the decision lands
  const nothingAt = FLUSH.indexOf('"Nothing to save."');
  rec("the flush stages the panel", stageAt !== -1, "Save still ignores the panel");
  rec("…BEFORE it decides there is nothing to save", stageAt !== -1 && nothingAt !== -1 && stageAt < nothingAt, { stageAt, nothingAt });
  rec("…aimed at the state the panel was filled from", /stageStateWrite\(stateFormBaseline\.stateId, stateFormBaseline\.provinceId\)/.test(FLUSH), "it would write the typed values onto the wrong state");
  rec("…and guarded against re-entry", /stagingStateForm = true;[\s\S]{0,220}finally \{ stagingStateForm = false; \}/.test(FLUSH), "a repaint inside staging could recurse");
}

console.log("\n[leaving does not discard]");
{
  const stageAt = SHOW_INFO.indexOf("stageStateWrite(b.stateId, b.provinceId)");
  const dropAt = SHOW_INFO.indexOf("stateFormBaseline = null");
  rec("showInfo stages the panel on the way out", stageAt !== -1, "moving away still discards typing");
  rec("…BEFORE the baseline is dropped", stageAt !== -1 && dropAt !== -1 && stageAt < dropAt, { stageAt, dropAt });
  // Three separate ways the panel stops showing those values. Only checking the first shipped a hole:
  // switching Inspect → Terrain hid the panel and dropped the baseline just as silently.
  rec("…on a different state", /stateFormBaseline\.stateId !== \(selected && selected\.stateId\)/.test(SHOW_INFO), "a state change would discard");
  rec("…on a tool mode", /\(mode && mode !== "inspect"\)/.test(SHOW_INFO.slice(0, stageAt === -1 ? 0 : stageAt)), "picking a tool would discard");
  rec("…and on no selection at all", /!selected \|\| selected\.provinceId === undefined/.test(SHOW_INFO.slice(0, stageAt === -1 ? 0 : stageAt)), "deselecting would discard");
  rec("both hiding exits drop the baseline", (SHOW_INFO.match(/stateFormBaseline = null; updateSaveButton\(\); return;/g) || []).length === 2,
    (SHOW_INFO.match(/stateFormBaseline = null; updateSaveButton\(\); return;/g) || []).length);
  rec("…and a filled panel is re-baselined", /rebaselineStateForm\(\);\s*updateSaveButton\(\);\s*\}$/.test(SHOW_INFO.trim()), SHOW_INFO.slice(-180));
  rec("the nav guard counts the panel", /dirtyMap \|\| \(paintDiff && paintDiff\.size\) \|\| armyHasUnsaved\(\) \|\| stateFormDirty\(\)/.test(SRC), "leaving the page would discard silently");
}

console.log("\n[the staged write can be aimed]");
{
  rec("stageStateWrite takes the state and province", /function stageStateWrite\(sid, pid\)/.test(SRC), "it can only ever write the CURRENT selection");
  rec("…and uses the passed province for the naval base", /if \(pid !== undefined\) \{/.test(STAGE) && !/selected\.provinceId/.test(STAGE),
    "a naval base would land on whichever province is selected NOW");
  rec("…and re-baselines once it has staged", /rebaselineStateForm\(\);\s*return sid;/.test(STAGE), "the panel would stay dirty and stage again on the next repaint");
  rec("…still through queueWrite, so 💾 Save is what writes it", /queueWrite\("\/api\/map\/set-state"/.test(STAGE), "the deferred-save contract broke");
  // (…with the words stageStateWrite leaves for its line read beside it: review of the T39 merge, S-untick)
  rec("CONTROL: the Save state button still works, through the same path", /const sid = stageStateWrite\(selected\.stateId, selected\.provinceId\)[;,]/.test(SAVE_STATE), SAVE_STATE.slice(0, 200));
  rec("CONTROL: …and still repaints and reports", /recolorAll\(\); draw\(\); showInfo\(\);/.test(SAVE_STATE) && /edited — click 💾 Save/.test(SAVE_STATE), "the button lost its feedback");
  rec("CONTROL: …and still takes an undo point", /pushUndo\("Edit state"\)/.test(STAGE), "the edit became un-undoable");
}

console.log("\n[RUN IT] the signature against a stand-in panel");
{
  const src = [fnSource("function stateFormFieldSignature()"), fnSource("function stateFormDirty()"), fnSource("function rebaselineStateForm()"), fnSource("function readStateForm()"), fnSource("function collectVps()")].join("\n");
  rec("the three functions were extracted", src.length > 600, src.length);

  const fields = { miNameInp: "Corsica", miOwnerSel: "FRA", miCoresInp: "COR, FRA", miManpowerInp: "322900", miCategoryInp: "town", miNavalBase: "0" };
  let panelVisible = true;
  const vps = [];
  const blds = [{ dataset: { bld: "infrastructure" }, value: "2" }];
  const ress = [{ dataset: { res: "oil" }, value: "0" }];
  const ctx = {
    stateFormBaseline: null,
    selected: { stateId: 1, provinceId: 3838 },
    $: (id) => (id === "miEditFields" ? { style: { get display() { return panelVisible ? "block" : "none"; } } }
      : id === "miVpList" ? { querySelectorAll: () => vps }
      : (id in fields ? { get value() { return fields[id]; } } : null)),
    document: { querySelectorAll: (sel) => (sel.indexOf("miBuildings") !== -1 ? blds : ress) },
  };
  vm.createContext(ctx);
  vm.runInContext(src, ctx);
  const dirty = () => vm.runInContext("stateFormDirty()", ctx);
  const rebase = () => vm.runInContext("rebaselineStateForm()", ctx);

  rec("RUN: with no baseline yet, nothing is dirty", dirty() === false, "a fresh page would claim unsaved work");
  rebase();
  rec("RUN: a freshly filled panel is clean", dirty() === false, vm.runInContext("stateFormBaseline", ctx));
  fields.miManpowerInp = "999111";
  rec("RUN: …typing a population makes it dirty", dirty() === true, "the population is invisible to the save pipeline");
  fields.miManpowerInp = "322900";
  rec("RUN: …and typing it back makes it clean again", dirty() === false, "the check is a flag, not a comparison");
  blds[0].value = "7";
  rec("RUN: a building level counts too", dirty() === true, "buildings are invisible");
  blds[0].value = "2"; ress[0].value = "3";
  rec("RUN: …and a resource", dirty() === true, "resources are invisible");
  ress[0].value = "0";
  vps.push({ querySelector: (s) => ({ value: s.indexOf("prov") !== -1 ? "3838" : "5" }) });
  rec("RUN: …and a victory point row", dirty() === true, "victory points are invisible");
  vps.length = 0;
  rec("RUN: …removing it again is clean", dirty() === false, "vp rows leave residue");

  // ⭐ THE ONE THAT MATTERS MOST. showInfo runs AFTER `selected` has moved on. If the state id were part of
  // the signature, every jump between states would read as an edit and stage a phantom write. Measured in
  // the running editor: 11 jumps and two mode toggles with nothing typed leave the count at 0.
  ctx.selected = { stateId: 2, provinceId: 4000 };
  rec("RUN: moving the SELECTION does not by itself make the panel dirty", dirty() === false, "every state jump would stage a phantom write");

  // A hidden panel holds nothing, whatever its inputs still say. Change a field FIRST — otherwise the
  // fields match the baseline anyway and the check passes with the guard removed, which is what happened
  // the first time this was written.
  ctx.selected = { stateId: 1, provinceId: 3838 };
  rebase();
  fields.miManpowerInp = "111222";
  rec("RUN: …which the visible panel does notice", dirty() === true, "the fixture stopped discriminating");
  panelVisible = false;
  rec("RUN: a hidden panel is never dirty, whatever its inputs still say", dirty() === false, "a hidden panel would keep claiming unsaved work");
}

console.log(`\n=== state panel is in the save pipeline: ${checks} checks, ${fails.length} failed ===`);
if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
