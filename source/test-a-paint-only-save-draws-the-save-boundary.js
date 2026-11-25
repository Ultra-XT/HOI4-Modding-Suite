// A Save whose only change is a paint stroke still wrote to the mod, so it must draw the save boundary.
// #a-paint-only-save-draws-no-boundary
//
// flushMapSaves counts its work in `done`. The pendingWrites loop increments it; the paint block that runs
// after the loop did not — although `total` has always counted the paint as one step (its own progress line
// reads "Saving province shapes… (total/total)"). So a save whose ONLY change was a stroke ended on
// `done === 0`, and everything keyed on `done` read it as a save that had written nothing.
//
// Measured on a 13x13 coastline stroke (96 sea pixels repainted as a neighbouring coastal land province),
// driven through the real /api/map/paint-provinces against a full-size generated world:
//
//   it WROTE     map/provinces.bmp, map/heightmap.bmp, map/terrain.bmp, map/trees.bmp, map/world_normal.bmp
//                — 5 files, 64 MB
//   it SAID      "✓ Saved 0 changes to your mod."
//   the boundary markSaveBoundary(0) returns at its own `if (!done)`, so:
//                  · the undo stack kept its PRE-PAINT snapshots
//                  · the History panel never showed "Saved to disk"
//                  · saveGeneration stayed 0, so a checkpoint pinned before the stroke restored with NO
//                    warning — offered as exactly the harmless in-memory jump that
//                    #checkpoint-predates-the-save exists to stop it being mistaken for
//
// ⚠️ THE CONTROL IS HALF THE FIX. A paint that the server REFUSES, and a paint save that throws, must still
// report 0 — the two early returns above the increment say how many OTHER changes landed while the paint did
// not, and counting the paint there would tell the modder their pixels were saved when they were not.
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
// ⚠️ public/map.js is CRLF in some checkouts and LF in others (git core.autocrlf, no .gitattributes). An
// anchor carrying a bare \n silently matches nothing in the CRLF ones and the lift comes back empty, which
// reads as "the function is gone" rather than "the anchor is wrong". Detect, never assume.
const EOL = MAP.indexOf("\r\n") !== -1 ? "\r\n" : "\n";
const grab = (opening, end) => {
  const e0 = (end || "\n  }").split("\r\n").join("\n").split("\n").join(EOL);
  const s = MASKED.indexOf(opening);
  if (s < 0) throw new Error(`public/map.js has no "${opening}"`);
  const e = MASKED.indexOf(e0, s);
  if (e < 0) throw new Error(`public/map.js: no end after "${opening}"`);
  return MAP.slice(s, e + e0.length);
};
const FLUSH_END = "} finally { if (btn) btn.disabled = false; updateSaveButton(); }\n  }";

console.log("\n=== the paint is one of the steps the save counts ===");
{
  const s = MASKED.indexOf("async function flushMapSaves");
  const e = MASKED.indexOf("finally { if (btn) btn.disabled = false; updateSaveButton(); }", s);
  const body = MASKED.slice(s, e);
  // DERIVED: `total` decides how many steps the progress line promises. Whatever it counts, `done` has to be
  // able to reach — otherwise the save's own report contradicts its own progress.
  const totalLine = (body.match(/const total = [^;]+;/) || [""])[0];
  ok(/paintDiff[\s\S]*size/.test(totalLine), "`total` counts the paint stroke as a step", totalLine);
  const paintBlock = body.slice(body.indexOf("if (paintDiff && paintDiff.size)"));
  ok(/done\+\+|done \+= 1/.test(paintBlock),
    "⭐⭐ …and the paint block increments `done` when the stroke lands", paintBlock.replace(/\s+/g, " ").slice(0, 200));
}

// ── a sandbox that RUNS the real flushMapSaves ────────────────────────────────────────────────
function makeSandbox({ paintResponse }) {
  const statuses = [];
  const confirms = [];
  const posted = [];
  const sb = {
    console, JSON, Object, Array, Map, Set, String, Number, Promise, Error, RegExp, Math, encodeURIComponent,
    pendingWrites: [],
    paintDiff: new Map([["1,1", { x: 1, y: 1, r: 9, g: 9, b: 9 }]]),
    stagedRiverEdits: [], riversShow: false, dirtyMap: true,
    undoStack: [], redoStack: [], historyLabels: ["Loaded map"], checkpoints: [], checkpointSeq: 0,
    saveGeneration: 0, UNDO_LIMIT: 30,
    model: { states: [], provinceToState: {}, provinceToRegion: {}, stateToSupplyArea: {}, strategicRegions: [], supplyAreas: [], adjacencies: [], supplyNodes: [], railways: [], capitals: {} },
    provinceToOwner: {}, provinceType: new Map(), provinceDef: new Map(), countryColors: {},
    stateById: new Map(), selected: null, info: null, stateFormBaseline: null, stagingStateForm: false,
    baseImageData: null, baseImageDataPristine: null, statusEl: { style: {} },
    STATE_ID_FIELDS: ["stateId", "toStateId"],
    setStatus: (s) => statuses.push(String(s)),
    setMapDirty() {}, updateSaveButton() {}, updateUndoButtons() {}, renderCheckpoints() {}, renderHistoryPanel() {},
    regionRenameRefreshSelect() {}, supplyRenameRefreshSelect() {}, syncCountryColorInput() {},
    buildPidGrid() {}, computeCentroids() {}, recolorAll() {}, draw() {},
    loadRiversOverlay() {}, saveMapBackup() {}, openMapErrorsModal() {},
    orphanedQueuedWrites: () => [], emptyNewStateWrites: () => [],
    stateFormDirty: () => false, stageStateWrite() {}, remapQueuedStateId() {}, remapLocalStateId() {},
    provincesBmpNote: () => "", riversPaintNote: () => "", heightmapNote: () => "", worldPicturesNote: () => "", modPath: () => "D:/fixture", isVanillaTarget: () => false,
    problemsPanelOpen: () => false, refreshProblems() {}, $: () => null,
    fetch: async (url, opts) => {
      const u = String(url).split("?")[0];
      posted.push(u);
      if (u === "/api/map/validate") return { json: async () => ({ ok: true, errors: 0, warnings: 0, problems: [] }) };
      if (u === "/api/map/paint-provinces") {
        if (paintResponse === "throw") throw new Error("socket hang up");
        return { json: async () => paintResponse };
      }
      return { json: async () => ({ ok: true }) };
    },
  };
  sb.window = { confirm: (m) => { confirms.push(String(m)); return true; } };
  sb.confirm = sb.window.confirm;
  sb.globalThis = sb;
  vm.createContext(sb);
  vm.runInContext([
    grab("function snapshotMap"), grab("function applyMapSnapshot"),
    grab("function rebuildStagedRiversFromPending"), grab("function eachHeldSnapshot"),
    grab("function purgeStagedWritesFromHistory"), grab("function pushUndo"), grab("function doUndo"),
    grab("function doRedo"), grab("function addCheckpoint"), grab("function restoreCheckpoint"),
    grab("function markSaveBoundary"), grab("async function mapCrashGate"), grab("function blankAdjacencyNote"),
  ].join("\n"), sb);
  vm.runInContext(grab("async function flushMapSaves", FLUSH_END), sb);
  sb.__statuses = statuses; sb.__confirms = confirms; sb.__posted = posted;
  return sb;
}

console.log("\n=== …so a save whose only change is a stroke draws the boundary ===");
{
  const sb = makeSandbox({ paintResponse: { ok: true, warnings: [], heightmap: { pixels: 96 } } });
  vm.runInContext('addCheckpoint(); pushUndo("Paint province shapes");', sb);
  const cpGen = sb.checkpoints[0].generation;

  return sb.flushMapSaves().then(async () => {
    ok(sb.__posted.indexOf("/api/map/paint-provinces") >= 0, "the paint really went to the endpoint", sb.__posted);
    const line = sb.__statuses.slice(-1)[0] || "";
    ok(/Saved 1 change\b/.test(line),
      "⭐⭐⭐ the save reports the stroke it wrote, not “Saved 0 changes”", line.slice(0, 160));
    ok(sb.undoStack.length === 0 && sb.redoStack.length === 0,
      "⭐⭐⭐ the undo stack is cleared, so no Ctrl+Z restores a model older than the disk",
      { undo: sb.undoStack.length, redo: sb.redoStack.length });
    ok(JSON.stringify(sb.historyLabels) === JSON.stringify(["Saved to disk"]),
      "⭐⭐ …and the History panel shows the save boundary", sb.historyLabels);
    ok(sb.saveGeneration === 1,
      "⭐⭐ …and the save generation advances, so checkpoints know the disk moved", sb.saveGeneration);

    // The checkpoint pinned before the stroke must now say what restoring it will NOT undo.
    vm.runInContext("restoreCheckpoint(0);", sb);
    ok(cpGen !== sb.saveGeneration, "the pinned checkpoint is now on the far side of a save", { cpGen, now: sb.saveGeneration });
    ok(sb.__confirms.length === 1 && /files already written to your mod stay exactly as they are/.test(sb.__confirms[0]),
      "⭐⭐⭐ restoring it warns that the written files are not coming back",
      sb.__confirms.map((c) => c.slice(0, 120)));

    console.log("\n[CONTROL] a paint that did NOT land must still count 0");
    {
      const refused = makeSandbox({ paintResponse: { ok: false, error: "that stroke would erase province 44 entirely." } });
      await refused.flushMapSaves();
      const l = refused.__statuses.slice(-1)[0] || "";
      ok(/NOT applied/.test(l) && !/other 1 change/.test(l),
        "⚠️ a refused paint says the pixels were not applied and claims no other change",
        l.slice(0, 200));
      ok(refused.saveGeneration === 0,
        "⚠️⚠️ …and draws NO boundary, because nothing was written", refused.saveGeneration);
    }
    {
      const threw = makeSandbox({ paintResponse: "throw" });
      await threw.flushMapSaves();
      const l = threw.__statuses.slice(-1)[0] || "";
      ok(/Province-shape save failed/.test(l) && !/other 1 change/.test(l),
        "⚠️ a paint save that throws claims no other change either", l.slice(0, 200));
      ok(threw.saveGeneration === 0, "⚠️⚠️ …and draws no boundary", threw.saveGeneration);
    }

    console.log("\n[CONTROL] a save with staged writes AND a paint counts both");
    {
      const both = makeSandbox({ paintResponse: { ok: true, warnings: [] } });
      both.pendingWrites.push({ url: "/api/map/set-owner", body: { stateId: 3, owner: "AAA" }, meta: {} });
      vm.runInContext('pushUndo("Set owner");', both);
      await both.flushMapSaves();
      const l = both.__statuses.slice(-1)[0] || "";
      ok(/Saved 2 changes/.test(l), "⚠️ the owner change and the stroke are both counted", l.slice(0, 160));
      ok(both.saveGeneration === 1 && both.undoStack.length === 0, "⚠️ …and the boundary is drawn once",
        { gen: both.saveGeneration, undo: both.undoStack.length });
    }

    console.log(`\n=== a paint-only save draws the save boundary: ${pass + fails.length} checks, ${fails.length} failed ===`);
    if (fails.length) { for (const f of fails) console.log("   - " + f); process.exit(1); }
  });
}
