// A write the modder agreed to discard must not be sitting in a checkpoint, waiting for the History panel.
// #a-discarded-write-survives-in-a-checkpoint
//
// snapshotMap() results are held in THREE places: undoStack, redoStack, and checkpoints[].snapshot. Two
// functions walk them, ten lines apart in public/map.js:
//
//   · foldIrreversibleAddition — an addition that cannot be taken back has to exist in the past too. Walks
//     undoStack, redoStack AND checkpoints.
//   · purgeStagedWritesFromHistory — a staged write the modder discarded has to be gone from the past too.
//     Walked undoStack and redoStack, and stopped there.
//
// So the discard survived in the one store nobody stripped, and the History panel offers it as a button.
// Measured through the real endpoints on a full-size world, judged on the rivers.bmp hash:
//
//   paint a river, Save  ->  paint a second  ->  📌 checkpoint  ->  🧹 Clear all rivers (the modal says
//   "Clearing ALL rivers will discard them"; 60 pixels wiped from disk)  ->  Restore that checkpoint  ->  💾 Save
//
//   rivers.bmp  0fe44dbeb3f969d2  (river A saved)
//            -> 86e75947ed14d424  (wiped)
//            -> 94fb12acf2ef24c8  (after restore + Save)   <- and a fresh clear then reported 60 pixels
//
// 60 river pixels back on the map that had just been cleared — the same resurrection
// #clear-all-rivers-comes-back-on-undo was written to stop, by the one route that fix did not close. The
// restore does not even warn: it is the SAME save generation, so the checkpoint reads as the harmless
// in-memory jump #checkpoint-predates-the-save describes.
//
// ⚠️ THE STORES ARE DERIVED FROM public/map.js, NOT LISTED HERE. A hand-written list of "places a snapshot
// lives" is exactly the thing that went stale, so the check below reads them off the snapshotMap() call
// sites and insists the shared walker names each one.
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

const MAP = fs.readFileSync(path.join(__dirname, "public", "map.js"), "utf8");
const { maskJsComments } = require("./testlib-strip-comments.js");
const MASKED = maskJsComments(MAP);
// ⚠️ public/map.js is CRLF in some checkouts and LF in others (git core.autocrlf, no .gitattributes), so
// every anchor here is either single-line or tolerant of the \r. Detect, never assume.
const EOL = MAP.indexOf("\r\n") !== -1 ? "\r\n" : "\n";
const grab = (opening, end = EOL + "  }") => {
  const s = MASKED.indexOf(opening);
  if (s < 0) throw new Error(`public/map.js has no "${opening}"`);
  const e = MASKED.indexOf(end, s);
  if (e < 0) throw new Error(`public/map.js: no end after "${opening}"`);
  return MAP.slice(s, e + end.length);
};

console.log("\n=== the stores a snapshot lives in, derived from the snapshotMap() call sites ===");
let STORES = [];
{
  // Every `X.push(… snapshotMap() …)` in the page. That is where a snapshot is kept, by definition.
  const re = /([A-Za-z_$][\w$]*)\.push\([^;]*snapshotMap\(\)/g;
  let m;
  const seen = new Set();
  while ((m = re.exec(MASKED))) seen.add(m[1]);
  STORES = [...seen].sort();
  ok(STORES.length >= 3, `public/map.js keeps snapshots in ${STORES.length} stores: ${STORES.join(", ")}`, STORES);

  const each = grab("function eachHeldSnapshot");
  ok(each.length > 60, "eachHeldSnapshot is declared", each.length);
  for (const s of STORES) {
    ok(new RegExp("\\b" + s + "\\b").test(maskJsComments(each)),
      `⭐ the shared walker reaches ${s}`, each.replace(/\s+/g, " ").slice(0, 200));
  }
  ok((MASKED.match(/function eachHeldSnapshot\b/g) || []).length === 1,
    "…and there is exactly one of it, so both walkers mean the same thing",
    (MASKED.match(/function eachHeldSnapshot\b/g) || []).length);
}

console.log("\n=== …and neither walker enumerates the stores itself any more ===");
{
  // This is what allowed the two to drift apart. Asserted on the BODIES, not on the file.
  for (const fn of ["purgeStagedWritesFromHistory", "foldIrreversibleAddition"]) {
    const body = maskJsComments(grab("function " + fn));
    const own = STORES.filter((s) => new RegExp("\\b" + s + "\\b").test(body));
    ok(own.length === 0 && /eachHeldSnapshot\(/.test(body),
      `⭐⭐ ${fn} goes through the shared walker instead of listing the stores`,
      { walksItself: own, body: body.replace(/\s+/g, " ").slice(0, 200) });
  }
}

console.log("\n=== …and RUNNING it: the discard cannot come back through the History panel ===");
{
  const sandbox = {
    console,
    stagedRiverEdits: [], pendingWrites: [], paintDiff: new Map(),
    undoStack: [], redoStack: [], historyLabels: ["Loaded map"],
    checkpoints: [], checkpointSeq: 0, saveGeneration: 0, dirtyMap: true, UNDO_LIMIT: 50,
    model: { states: [], provinceToState: {}, provinceToRegion: {}, stateToSupplyArea: {}, strategicRegions: [], supplyAreas: [], adjacencies: [], supplyNodes: [], railways: [], capitals: {} },
    provinceToOwner: {}, provinceType: new Map(), provinceDef: new Map(), countryColors: {},
    stateById: new Map(), selected: null, info: null, stateFormBaseline: null,
    baseImageData: null, baseImageDataPristine: null, riverEdits: [], lastRiverPt: null,
    setStatus: () => {}, setMapDirty: () => {}, updateSaveButton: () => {}, updateUndoButtons: () => {},
    recolorAll: () => {}, draw: () => {}, buildPidGrid: () => {}, computeCentroids: () => {},
    regionRenameRefreshSelect: () => {}, supplyRenameRefreshSelect: () => {}, renderHistoryPanel: () => {},
    renderCheckpoints: () => {}, syncCountryColorInput: () => {}, loadRiversOverlay: () => {},
    saveMapBackup: () => {}, modPath: () => "D:/fixture", fetch: async () => ({ json: async () => ({ ok: true }) }),
    $: () => null, window: { confirm: () => true }, confirm: () => true,
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext([
    grab("function snapshotMap"), grab("function applyMapSnapshot"),
    grab("function rebuildStagedRiversFromPending"), grab("function eachHeldSnapshot"),
    grab("function purgeStagedWritesFromHistory"), grab("function foldIrreversibleAddition"),
    grab("function pushUndo"), grab("function doUndo"), grab("function doRedo"),
    grab("function addCheckpoint"), grab("function restoreCheckpoint"),
  ].join("\n"), sandbox);

  // A river stroke, and an unrelated owner change, both staged. Then the modder pins a checkpoint.
  vm.runInContext(`
    pushUndo('Paint river');
    pendingWrites.push({ url: '/api/map/rivers-paint', body: { edits: [{x:1,y:1,index:3},{x:2,y:1,index:3}] }, meta: { rivers: true } });
    pushUndo('Set owner');
    pendingWrites.push({ url: '/api/map/set-owner', body: { stateId: 7, owner: 'AAA' }, meta: {} });
    rebuildStagedRiversFromPending();
    addCheckpoint();
  `, sandbox);
  const cp = sandbox.checkpoints[0];
  ok(!!cp && cp.snapshot.pendingWrites.length === 2,
    "the checkpoint pinned both staged writes", cp && cp.snapshot.pendingWrites.map((w) => w.url));

  // 🧹 Clear all rivers — the handler's OWN discard statements, sliced out of the file and run here.
  // ⚠️ Not a paraphrase: writing the lines by hand would keep passing against a build whose handler no
  // longer calls the purge at all, which is the bug next door.
  const dStart = MASKED.indexOf("riverEdits = []; stagedRiverEdits = []; lastRiverPt = null;");
  const dEnd = MASKED.indexOf("\n", MASKED.indexOf("setMapDirty(", dStart));
  const discard = dStart > 0 && dEnd > dStart ? MAP.slice(dStart, dEnd) : "";
  ok(/purgeStagedWritesFromHistory\(/.test(discard),
    "the real clear-all-rivers discard statements were lifted", discard.replace(/\s+/g, " ").slice(0, 160));
  vm.runInContext(discard, sandbox);

  ok(cp.snapshot.pendingWrites.every((w) => !(w.meta && w.meta.rivers)),
    "⭐⭐⭐ the checkpoint no longer carries the river write the modder discarded",
    cp.snapshot.pendingWrites.map((w) => w.url));
  ok(cp.snapshot.pendingWrites.some((w) => w.url === "/api/map/set-owner"),
    "⚠️ …while the unrelated staged edit in it survives — surgical, not a wipe",
    cp.snapshot.pendingWrites.map((w) => w.url));

  // Now restore the checkpoint from the History panel. This is the click the bug travelled through.
  vm.runInContext("restoreCheckpoint(0); rebuildStagedRiversFromPending();", sandbox);
  const urls = sandbox.pendingWrites.map((w) => w.url);
  ok(urls.indexOf("/api/map/rivers-paint") < 0,
    "⭐⭐⭐ restoring it does NOT re-arm the discarded rivers-paint write", urls);
  ok(sandbox.stagedRiverEdits.length === 0,
    "⭐⭐⭐ …so the wiped pixels do not come back on screen either", sandbox.stagedRiverEdits.length);
  ok(urls.indexOf("/api/map/set-owner") >= 0,
    "⚠️ …and the checkpoint still restores the work it legitimately held", urls);
}

console.log("\n[CONTROL] the mirror walker still reaches the checkpoints it was written for");
{
  // foldIrreversibleAddition exists because creating a strategic region writes to disk at once: undoing past
  // that moment must not make the region vanish from a snapshot. Sharing the walker must not cost it that.
  const sandbox = {
    console, undoStack: [{ strategicRegions: [] }], redoStack: [{ strategicRegions: [] }],
    checkpoints: [{ name: "cp", snapshot: { strategicRegions: [] }, generation: 0 }],
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext([grab("function eachHeldSnapshot"), grab("function foldIrreversibleAddition")].join("\n"), sandbox);
  vm.runInContext("foldIrreversibleAddition((s) => { s.strategicRegions = s.strategicRegions.concat([{ id: 99 }]); });", sandbox);
  ok(sandbox.undoStack[0].strategicRegions.length === 1, "the undo stack got the irreversible addition", sandbox.undoStack[0].strategicRegions);
  ok(sandbox.redoStack[0].strategicRegions.length === 1, "…and the redo stack", sandbox.redoStack[0].strategicRegions);
  ok(sandbox.checkpoints[0].snapshot.strategicRegions.length === 1, "…and the checkpoints", sandbox.checkpoints[0].snapshot.strategicRegions);
}

console.log(`\n=== a discarded write cannot survive in a checkpoint: ${pass + fails.length} checks, ${fails.length} failed ===`);
if (fails.length) { for (const f of fails) console.log("   - " + f); process.exit(1); }
