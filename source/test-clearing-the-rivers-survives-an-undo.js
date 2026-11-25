// Discarding a staged write means discarding it from the undo history too.
// #clear-all-rivers-comes-back-on-undo
//
// River strokes stage like everything else: one `/api/map/rivers-paint` entry in pendingWrites per stroke,
// carrying meta.rivers and body.edits, previewed on screen until Save.
//
// "🧹 Clear all rivers" asks "Clearing ALL rivers will discard them and wipe every river to land", filters
// those entries out of pendingWrites, and wipes rivers.bmp on disk IMMEDIATELY.
//
// But pushUndo snapshots pendingWrites, and applyMapSnapshot restores it wholesale. A write removed from the
// live queue is still sitting in every snapshot taken before the removal. So:
//
//    paint a river  ->  🧹 Clear all rivers (confirmed, disk wiped)  ->  Ctrl+Z  ->  Save
//
// handed the discarded strokes back, rebuildStagedRiversFromPending put the pixels on screen again, and the
// save replayed rivers-paint — painting the rivers back onto the map the modder had just cleared.
//
// ⚠️ The fix must be SURGICAL. Clearing the whole undo stack would also work and would be wrong: unrelated
// staged edits (owners, regions, province moves) have perfectly valid history that the rivers wipe did not
// invalidate. Both halves are asserted below.
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

console.log("\n=== the clear drops the staged strokes from the history too ===");
{
  const at = MASKED.indexOf('pendingWrites.filter((w) => !(w.meta && w.meta.rivers))');
  ok(at > 0, "the clear-all-rivers handler filters the staged river writes", at);
  const near = MAP.slice(at, at + 700);
  ok(/purgeStagedWritesFromHistory\(/.test(near),
    "⭐⭐ …and purges them from the undo history in the same breath", near.slice(0, 220));
}

console.log("\n=== …and running it proves an Undo cannot hand them back ===");
{
  const purge = grab("function purgeStagedWritesFromHistory", "\n  }");
  // #a-discarded-write-survives-in-a-checkpoint — the purge no longer enumerates the snapshot stores itself;
  // it shares eachHeldSnapshot with foldIrreversibleAddition, because enumerating them twice is how the
  // checkpoints came to be stripped by one walker and not the other. Lifted, so this still RUNS the shipped code.
  const each = grab("function eachHeldSnapshot", "\n  }");
  const rebuild = grab("function rebuildStagedRiversFromPending", "\n  }");
  const apply = grab("function applyMapSnapshot", "\n  }");
  const push = grab("function pushUndo", "\n  }");
  const snap = grab("function snapshotMap", "\n  }");
  const undo = grab("function doUndo", "\n  }");
  ok(purge.length > 100, "purgeStagedWritesFromHistory lifted", purge.length);

  const sandbox = {
    console,
    stagedRiverEdits: [],
    pendingWrites: [],
    paintDiff: new Map(),
    undoStack: [], redoStack: [], historyLabels: ["Loaded map"],
    checkpoints: [], checkpointSeq: 0, saveGeneration: 0, dirtyMap: true,
    UNDO_LIMIT: 50,
    model: { states: [], provinceToState: {}, stateToSupplyArea: {}, strategicRegions: [], supplyAreas: [], adjacencies: [], supplyNodes: [], railways: [], capitals: {} },
    provinceToOwner: {}, provinceType: new Map(), provinceDef: new Map(),
    countryColors: {}, // snapshotMap holds the 🎨 colours too — #a-river-stroke-and-a-country-colour-are-undo-steps
    stateById: new Map(), selected: null, info: null, stateFormBaseline: null,
    baseImageData: null, baseImageDataPristine: null,
    setStatus: () => {}, setMapDirty: () => {}, updateSaveButton: () => {}, updateUndoButtons: () => {},
    recolorAll: () => {}, draw: () => {}, buildPidGrid: () => {}, computeCentroids: () => {},
    regionRenameRefreshSelect: () => {}, supplyRenameRefreshSelect: () => {}, renderHistoryPanel: () => {},
    loadRiversOverlay: () => {}, saveMapBackup: () => {},
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext([snap, apply, push, undo, rebuild, each, purge].join("\n"), sandbox);

  // The modder paints a river stroke (staged), and also makes an unrelated owner change (staged).
  vm.runInContext(`
    pushUndo('Paint river');
    pendingWrites.push({ url: '/api/map/rivers-paint', body: { edits: [{x:1,y:1,i:3},{x:2,y:1,i:3}] }, meta: { rivers: true } });
    pushUndo('Set owner');
    pendingWrites.push({ url: '/api/map/set-owner', body: { stateId: 7, owner: 'AAA' }, meta: {} });
    rebuildStagedRiversFromPending();
  `, sandbox);
  ok(sandbox.stagedRiverEdits.length === 2, "two river pixels are staged and previewed", sandbox.stagedRiverEdits.length);
  ok(sandbox.pendingWrites.length === 2, "…alongside one unrelated staged edit", sandbox.pendingWrites.map((w) => w.url));

  // 🧹 Clear all rivers — the handler's OWN discard statements, sliced out of the file and run here.
  //
  // ⚠️ Not a paraphrase. Writing the three lines out by hand would leave this half passing against a build
  // where the handler no longer calls the purge at all, which is exactly the bug: the behaviour has to be
  // driven by the shipped code, not by a copy of it.
  const dStart = MASKED.indexOf("riverEdits = []; stagedRiverEdits = []; lastRiverPt = null;");
  const dEnd = MASKED.indexOf("\n", MASKED.indexOf("setMapDirty(", dStart));
  const discard = dStart > 0 && dEnd > dStart ? MAP.slice(dStart, dEnd) : "";
  ok(/purgeStagedWritesFromHistory|pendingWrites = pendingWrites\.filter/.test(discard),
    "the handler's discard statements were lifted", discard.replace(/\s+/g, " ").slice(0, 160));
  sandbox.riverEdits = [];
  sandbox.lastRiverPt = null;
  vm.runInContext(discard, sandbox);
  ok(sandbox.pendingWrites.length === 1 && sandbox.pendingWrites[0].url === "/api/map/set-owner",
    "the clear drops the river write and keeps the owner change", sandbox.pendingWrites.map((w) => w.url));

  // …now Undo. The river stroke must NOT come back.
  vm.runInContext("doUndo(); rebuildStagedRiversFromPending();", sandbox);
  const urls = sandbox.pendingWrites.map((w) => w.url);
  ok(urls.indexOf("/api/map/rivers-paint") < 0,
    "⭐⭐⭐ one Undo does NOT hand back the strokes the modder agreed to discard", urls);
  ok(sandbox.stagedRiverEdits.length === 0,
    "⭐⭐⭐ …so the wiped pixels do not reappear on screen either", sandbox.stagedRiverEdits);

  // ⚠️ THE CONTROL THAT MATTERS: the purge is surgical. Undo still works for everything else — the owner
  // change was staged after the river stroke, so this Undo is exactly the step that removes it.
  ok(urls.indexOf("/api/map/set-owner") < 0,
    "⚠️ …while the Undo still undid the unrelated edit it was pointed at", urls);
  ok(sandbox.undoStack.length === 1,
    "⚠️⚠️ …and the rest of the undo history survives — the fix is not a stack wipe", sandbox.undoStack.length);
  vm.runInContext("doUndo(); rebuildStagedRiversFromPending();", sandbox);
  ok(sandbox.pendingWrites.length === 0,
    "⚠️ …so a second Undo still steps further back", sandbox.pendingWrites.map((w) => w.url));
  ok(sandbox.stagedRiverEdits.length === 0,
    "⚠️⚠️ …and even that far back the discarded rivers stay gone", sandbox.stagedRiverEdits);
}

console.log(`\n=== clearing the rivers survives an undo: ${pass} checks, ${fails.length} failed ===`);
fails.forEach((f) => console.log("   FAILED: " + f));
process.exit(fails.length ? 1 : 0);
