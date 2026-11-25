// Undo must disarm the state panel, not just hide it. #undo-leaves-the-state-panel-armed
//
// The province panel stages its typing on Save, not per keystroke: `stateFormBaseline` records what the
// fields said when the panel was filled, `stateFormDirty()` compares the live fields against it, and
// flushMapSaves opens with
//
//     if (stateFormDirty() && stateFormBaseline) stageStateWrite(stateFormBaseline.stateId, …)
//
// Every other path that drops the selection also nulls the baseline — renderInfo does it in both of its
// early exits, precisely because a baseline with no selection is what makes the panel "dirty" from
// off-screen. `applyMapSnapshot` — the one Undo and Redo go through — hid the panel and nulled `selected`
// but left the baseline armed. So typing that an Undo was meant to discard survived it: a phantom entry in
// the Save count, and then a real write staged out of a panel the user could no longer see.
//
// ⚠️ Tested by RUNNING the lifted functions against a fake DOM, not by grepping for the assignment: the
// question is whether stateFormDirty() is false afterwards, and a source-shape check would pass against a
// version that nulls some other variable.
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

let pass = 0;
const fails = [];
const ok = (cond, label, detail) => {
  if (cond === true) { pass++; console.log("  ok   " + label); }
  else { fails.push(label); console.log("  FAIL " + label + (detail !== undefined ? "   -> " + JSON.stringify(detail).slice(0, 300) : "")); }
};

const MAP = fs.readFileSync(path.join(__dirname, "public", "map.js"), "utf8");
const { maskJsComments } = require("./testlib-strip-comments.js");
const MASKED = maskJsComments(MAP);
const grab = (needle, endNeedle) => {
  const s = MASKED.indexOf(needle);
  if (s < 0) return "";
  const e = MASKED.indexOf(endNeedle, s);
  return e < 0 ? "" : MAP.slice(s, e + endNeedle.length);
};

console.log("\n=== the baseline is dropped wherever the selection is ===");
{
  // Derived, not typed in: find every place the file drops `selected` and check each also drops the
  // baseline. A hand-written list of "the paths that matter" is what let this one through.
  const apply = grab("function applyMapSnapshot", "\n  }");
  ok(apply.length > 200, "applyMapSnapshot was found", apply.length);
  ok(/stateFormBaseline = null/.test(apply),
    "⭐ …and it disarms the state panel, not just hides it", apply.slice(0, 240));

  // ⭐⭐ This sweep is the point of the test. `applyMapSnapshot` was the reported site; running it over the
  // whole file found THREE more that hide the panel and leave it armed — blank-to-sea, delete-state and
  // merge-state. The last two are worse than an Undo: the state is GONE, so a save would stage a write for
  // an id that no longer exists. "The fix already exists next door and one caller never adopted it" is the
  // dominant bug shape in this project, so derive the call sites instead of listing them.
  const drops = [];
  const re = /\bselected = null/g; let m;
  while ((m = re.exec(MASKED))) {
    if (/\blet\s+$/.test(MASKED.slice(Math.max(0, m.index - 6), m.index))) continue;  // the declaration
    const win = MASKED.slice(m.index, m.index + 260);
    if (!/stateFormBaseline = null/.test(win)) drops.push(MAP.slice(Math.max(0, m.index - 60), m.index + 60).replace(/\s+/g, " "));
  }
  ok(drops.length === 0,
    "⭐⭐ every place that drops the selection also drops the baseline", drops);
}

console.log("\n=== …and it really is not dirty afterwards ===");
{
  const sig = grab("function stateFormFieldSignature", "\n  }");
  const dirty = grab("function stateFormDirty", "\n  }");
  const rebase = grab("function rebaselineStateForm", "\n  }");
  const read = grab("function readStateForm", "\n  }");
  const apply = grab("function applyMapSnapshot", "\n  }");
  ok(sig && dirty && rebase && apply ? true : false, "the four panel functions lifted",
    { sig: sig.length, dirty: dirty.length, rebase: rebase.length, apply: apply.length });

  // A DOM just real enough for stateFormFieldSignature: it reads input values through $(id).
  const fields = {};
  const sandbox = {
    console,
    stateFormBaseline: null,
    selected: { stateId: 5, provinceId: 7 },
    info: { style: {} },
    model: { states: [], provinceToState: {}, capitals: {}, strategicRegions: [], supplyAreas: [], adjacencies: [], supplyNodes: [], railways: [], stateToSupplyArea: {}, provinceToRegion: {} },
    provinceToOwner: {}, provinceType: new Map(), provinceDef: new Map(), paintDiff: new Map(),
    pendingWrites: [], stateById: new Map(), checkpoints: [],
    baseImageData: null, baseImageDataPristine: null,
    collectVps: () => [], collectBuildings: () => ({}), collectResources: () => ({}),
    setMapDirty: () => {}, updateSaveButton: () => {}, updateUndoButtons: () => {},
    recolorAll: () => {}, draw: () => {}, buildPidGrid: () => {}, computeCentroids: () => {},
    regionRenameRefreshSelect: () => {}, supplyRenameRefreshSelect: () => {},
    rebuildStagedRiversFromPending: () => {}, renderHistoryPanel: () => {},
    // stateFormFieldSignature returns null unless #miEditFields is display:block, reads six inputs by id,
    // and walks #miVpList / #miBuildings / #miResources. Give it exactly that much DOM.
    $: (id) => {
      if (id === "miEditFields") return { style: { display: "block" } };
      if (id === "miVpList") return { querySelectorAll: () => [] };
      return { value: fields[id] !== undefined ? fields[id] : "", style: {} };
    },
    document: { querySelectorAll: () => [] },
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  try {
    vm.runInContext([sig, dirty, rebase, read, apply].join("\n"), sandbox);
    ok(true, "they evaluate standalone");
  } catch (e) { ok(false, "they evaluate standalone", e.message); }

  // Fill the panel, take the baseline, then TYPE into it.
  // Derive the field ids the signature actually reads, so this fixture cannot drift from the real one.
  const ids = [...new Set((sig.match(/v\("([A-Za-z0-9_]+)"\)/g) || []).map((s) => s.slice(3, -2)))];
  ok(ids.length >= 5, `the signature reads ${ids.length} fields, derived from its own source`, ids.slice(0, 8));
  for (const id of ids) fields[id] = "1000";
  vm.runInContext("rebaselineStateForm();", sandbox);
  ok(sandbox.stateFormBaseline !== null, "the panel is armed once it has a baseline", sandbox.stateFormBaseline);
  ok(vm.runInContext("stateFormDirty()", sandbox) === false, "…and clean before anything is typed");

  for (const id of ids) fields[id] = "9999";                      // the user types
  ok(vm.runInContext("stateFormDirty()", sandbox) === true, "⭐ typing makes it dirty");

  // …now Undo.
  // ⚠️ snapshotMap stores `states` as a JSON STRING (it is the one field it serialises), so a snapshot whose
  // states is an array makes applyMapSnapshot throw before it reaches anything this test is about.
  sandbox.__snap = {
    states: "[]", provinceToState: {}, stateToSupplyArea: {}, strategicRegions: [], supplyAreas: [],
    adjacencies: [], supplyNodes: [], railways: [], provinceToOwner: {}, capitals: {},
    provinceType: new Map(), provinceDef: new Map(), paintDiff: new Map(), pendingWrites: [], dirty: false,
  };
  vm.runInContext("applyMapSnapshot(__snap);", sandbox);
  ok(sandbox.selected === null, "Undo drops the selection", sandbox.selected);
  ok(sandbox.stateFormBaseline === null,
    "⭐⭐⭐ …and disarms the panel with it", sandbox.stateFormBaseline);
  ok(vm.runInContext("stateFormDirty()", sandbox) === false,
    "⭐⭐⭐ …so the typing an Undo discarded can no longer be staged by the next Save",
    vm.runInContext("stateFormDirty()", sandbox));
}

console.log(`\n=== undo disarms the state panel: ${pass} checks, ${fails.length} failed ===`);
fails.forEach((f) => console.log("   FAILED: " + f));
process.exit(fails.length ? 1 : 0);
