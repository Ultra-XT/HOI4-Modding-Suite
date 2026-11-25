// A save that stopped part-way must still draw the history boundary.
// #a-stopped-save-keeps-a-stale-undo-stack
//
// flushMapSaves ends with `undoStack = []; redoStack = []; historyLabels = ["Saved to disk"]`, and its own
// comment gives the reason: "its snapshots predate this save, so Undo would restore an in-memory state
// OLDER than the disk it no longer matches — and the next Save would silently re-write that stale state
// over work just committed."
//
// Every early return sits above that line. So on a save that stopped part-way — the case where the disk
// HAS moved and the in-memory model is provably stale — the stack was kept.
//
// applyMapSnapshot restores `pendingWrites` along with the model. So one Ctrl+Z after a stopped save
// re-arms the writes that already landed, and the next Save replays them:
//
//   click "+ New state"  ->  queue: create-state, move-province
//   Save                 ->  create-state SUCCEEDS (state 5 is on disk), move is refused, save stops
//   Ctrl+Z               ->  pendingWrites is restored to [create-state, move-province]
//   Save                 ->  create-state runs AGAIN -> state 6
//
// Two states on disk from one click, and the first is empty — `empty_state`, curated-FATAL, "crashes
// before the main menu".
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

let pass = 0;
const fails = [];
const ok = (cond, label, detail) => {
  if (cond === true) { pass++; console.log("  ok   " + label); }
  else { fails.push(label); console.log("  FAIL " + label + (detail !== undefined ? "   -> " + JSON.stringify(detail).slice(0, 400) : "")); }
};

const MAP = require("./testlib-map-page.js").readSource("public", "map.js");   // LF whatever the checkout: #a-lift-reads-lf
const { maskJsComments } = require("./testlib-strip-comments.js");
const MASKED = maskJsComments(MAP);

const grab = (needle, endNeedle) => {
  const s = MASKED.indexOf(needle);
  if (s < 0) return "";
  const e = MASKED.indexOf(endNeedle, s);
  return e < 0 ? "" : MAP.slice(s, e + endNeedle.length);
};

console.log("\n=== the boundary is drawn by whatever wrote, not by finishing ===");
const flush = grab("async function flushMapSaves", "} finally { if (btn) btn.disabled = false; updateSaveButton(); }\n  }");
const gate = grab("async function mapCrashGate", "\n  }");
const mark = grab("function markSaveBoundary", "\n  }");
// flushMapSaves puts what Delete map left in adjacencies.csv on Save's warning line, through this helper.
// #delete-map-reports-the-adjacencies-it-drowned
const note = grab("function blankAdjacencyNote", "\n  }");
ok(flush.length > 500, "flushMapSaves lifted", flush.length);
ok(note.length > 200, "blankAdjacencyNote lifted", note.length);
ok(mark.length > 80, "markSaveBoundary lifted", mark.length);
{
  const s = MASKED.indexOf("async function flushMapSaves");
  const e = MASKED.indexOf("} finally { if (btn) btn.disabled = false; updateSaveButton(); }", s);
  const body = MASKED.slice(s, e);
  const n = (body.match(/markSaveBoundary\(/g) || []).length;
  ok(n >= 5, `⭐ the boundary is drawn from ${n} places, not only the end`, n);
  ok(!/undoStack = \[\]/.test(body),
    "⚠️ …and flushMapSaves no longer clears the stack inline, so there is one owner", body.length);
}

console.log("\n=== …and one Undo after a stopped save cannot replay a write that landed ===");
{
  const calls = [];
  let status = "";
  const sandbox = {
    console,
    pendingWrites: [
      { url: "/api/map/create-state", body: { name: "" }, meta: { create: true, provisionalId: -1 } },
      { url: "/api/map/move-province", body: { provinceId: 7, toStateId: -1 }, meta: { fromStateId: 5 } },
    ],
    paintDiff: new Map(),
    statusEl: { style: {} },
    stateById: new Map([[-1, { id: -1, provinces: [7] }]]),
    model: { states: [{ id: -1, provinces: [7] }], provinceToState: {}, capitals: {}, strategicRegions: [], supplyAreas: [], adjacencies: [], supplyNodes: [], railways: [], stateToSupplyArea: {}, provinceToRegion: {} },
    provinceToOwner: {}, provinceType: new Map(), provinceDef: new Map(),
    countryColors: {}, // snapshotMap holds the 🎨 colours too — #a-river-stroke-and-a-country-colour-are-undo-steps
    stagedRiverEdits: [], stagedRiversFromPending: [],
    undoStack: [], redoStack: [], historyLabels: ["Loaded map"],
    checkpoints: [], checkpointSeq: 0, saveGeneration: 0, dirtyMap: true,
    baseImageData: null, baseImageDataPristine: null, selected: null, info: null,
    UNDO_LIMIT: 50,
    setStatus: (s) => { status = String(s); },
    setMapDirty: () => {}, updateSaveButton: () => {}, updateUndoButtons: () => {},
    renderCheckpoints: () => {}, renderHistoryPanel: () => {},
    modPath: () => "D:/fixture",
    isVanillaTarget: () => false, problemsPanelOpen: () => false, refreshProblems: () => {},
    buildPidGrid: () => {}, computeCentroids: () => {}, recolorAll: () => {}, draw: () => {},
    loadRiversOverlay: () => {}, rebuildStagedRiversFromPending: () => {},
    regionRenameRefreshSelect: () => {}, supplyRenameRefreshSelect: () => {},
    orphanedQueuedWrites: () => [], emptyNewStateWrites: () => [],
    stateFormDirty: () => false, stateFormBaseline: null, stageStateWrite: () => {},
    remapQueuedStateId: () => {}, provincesBmpNote: () => "", riversPaintNote: () => "", heightmapNote: () => "", remapLocalStateId: () => {},
    STATE_ID_FIELDS: ["stateId", "toStateId"],
    openMapErrorsModal: () => {}, saveMapBackup: () => {}, $: () => null, window: {},
    encodeURIComponent,
    fetch: async (url) => {
      const u = String(url).split("?")[0];
      calls.push(u);
      if (u === "/api/map/validate") return { json: async () => ({ ok: true, errors: 1, warnings: 0, problems: [] }) };
      if (u === "/api/map/create-state") return { json: async () => ({ ok: true, id: 5 }) };
      return { json: async () => ({ ok: false, error: "State 5 not found in mod." }) };
    },
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  const snapshot = grab("function snapshotMap", "\n  }");
  const apply = grab("function applyMapSnapshot", "\n  }");
  const push = grab("function pushUndo", "\n  }");
  const undo = grab("function doUndo", "\n  }");
  vm.runInContext([snapshot, apply, push, undo, gate, mark, note, flush].join("\n"), sandbox);

  // The user clicks "+ New state": that pushes an undo entry, then queues the two writes.
  vm.runInContext("pushUndo('New state');", sandbox);
  ok(sandbox.undoStack.length === 1, "one undo entry from the click", sandbox.undoStack.length);

  return sandbox.flushMapSaves().then(() => {
    ok(calls.indexOf("/api/map/create-state") >= 0, "the create ran and is on disk", calls);
    ok(/stopped at step 2/.test(status), "…and the save stopped on the move", status);
    ok(sandbox.pendingWrites.length === 1, "the queue kept only the write that did NOT run", sandbox.pendingWrites.map((w) => w.url));
    ok(sandbox.undoStack.length === 0,
      "⭐⭐⭐ the undo stack is EMPTY — a stopped save is still a save boundary", sandbox.undoStack.length);
    // The behaviour that matters: Undo must not be able to re-arm the create.
    vm.runInContext("doUndo();", sandbox);
    const urls = sandbox.pendingWrites.map((w) => w.url);
    ok(urls.indexOf("/api/map/create-state") < 0,
      "⭐⭐⭐ …so Undo cannot re-queue the create-state that already made state 5", urls);
    console.log(`\n=== a stopped save does not leave undo armed: ${pass} checks, ${fails.length} failed ===`);
    fails.forEach((f) => console.log("   FAILED: " + f));
    process.exit(fails.length ? 1 : 0);
  });
}
