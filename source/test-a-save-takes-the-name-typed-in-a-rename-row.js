// ⛔ #a-save-takes-the-name-typed-in-a-rename-row (the B6 review's G3 S-6, B6-12's leftover) — A SAVE TAKES THE NAME TYPED IN AN OPEN ✎ RENAME ROW.
//
// Ctrl+S saves from a field since B6-12 (#ctrl-s-saves-from-a-field), but the inspector's ✎ region and supply-area rename rows stage
// their name only on Enter or ✓. A new name typed there and saved with Ctrl+S (or 💾 Save) was not in the Save: everything else was
// written, the row's name was not, and it was lost when the panel refilled. flushMapSaves now stages an open row's typed name first, as
// it stages the state panel's fields, the way Enter applies it.
//
// RUN, not grepped: the page's own flushMapSaves, stageOpenRenameRows, applyRegionRename and applySupplyRename (lifted from
// public/map.js) with the rows as the page has them; what the Save POSTs is recorded.
"use strict";
const PAGE = require("./testlib-map-page.js");
const { maskJsComments } = require("./testlib-strip-comments.js");

let checks = 0; const fails = [];
const ok = (c, m, d) => { checks++; if (c) console.log("  ok   " + m); else { fails.push(m); console.log("  FAIL " + m + (d !== undefined ? "   -> " + JSON.stringify(d).slice(0, 500) : "")); } };

const FLUSH = ["async function flushMapSaves", "} finally { if (btn) btn.disabled = false; updateSaveButton(); }\n  }"];
async function save({ region = null, supply = null } = {}) {
  const els = new Map();
  const $ = (id) => { if (!els.has(id)) els.set(id, PAGE.element()); return els.get(id); };
  if (region) { $("miRegionRenameRow").style.display = region.open ? "flex" : "none"; $("miRegionRenameInput").value = region.typed; $("miRegionSel").value = region.id; }
  if (supply) { $("miSupplyRenameRow").style.display = supply.open ? "flex" : "none"; $("miSupplyRenameInput").value = supply.typed; $("miSupplySel").value = supply.id; }
  const posted = [];
  const model = {
    states: [],
    strategicRegions: [{ id: 5, name: "STRATEGICREGION_5", displayName: "Old Coast" }, { id: 6, name: "STRATEGICREGION_6", displayName: "Inland" }],
    supplyAreas: [{ id: 9, name: "SUPPLYAREA_9", displayName: "Old Supply", states: [] }],
  };
  const page = PAGE.runPage([
    ["const STATE_ID_FIELDS = ", "\n"], "function orphanedQueuedWrites(writes)", "function emptyNewStateWrites(writes, stateById)", "function markSaveBoundary",
    "function queueWrite(url, body, meta)", "function stageOpenRenameRows()", "function applyRegionRename()", "function applySupplyRename()",
    "function regionRenameRefreshSelect()", "function supplyRenameRefreshSelect()", FLUSH,
  ], PAGE.loadGlobals({
    console, JSON, $, model,
    pendingWrites: [], paintDiff: new Map(), stateById: new Map(), provinceType: new Map(), provinceDef: new Map(),
    armyHasUnsaved: () => false, armyModel: { divisions: [] }, window: { NovaMapRuleLabels: require("./public/map-rule-labels.js"), confirm: () => false },
    stagedRiverEdits: [], riversShow: false, loadRiversOverlay: () => {}, undoStack: [], redoStack: [], historyLabels: [], saveGeneration: 0,
    pushUndo: (label) => posted.push("undo:" + label), setMapDirty: () => {}, updateSaveButton: () => {}, modPath: () => "C:/mods/rename",
    isVanillaTarget: () => false, problemsPanelOpen: () => false, refreshProblems: () => {}, renderCheckpoints: () => {},
    stateFormDirty: () => false, stateFormBaseline: null, stageStateWrite: () => {}, remapQueuedStateId: () => {}, remapLocalStateId: () => {},
    adoptMergeRegions: () => {}, openMapErrorsModal: () => {}, saveMapBackup: () => {}, updateUndoButtons: () => {},
    mapCrashGate: async ({ done }) => `✓ Saved ${done} change${done === 1 ? "" : "s"} to your mod.`,
    load: async () => { posted.push("load()"); },
    fetch: async (url, opt) => {
      let body = null; try { body = JSON.parse((opt && opt.body) || "null"); } catch (_) { body = null; }
      posted.push({ url: String(url).split("?")[0], body });
      return { ok: true, status: 200, json: async () => ({ ok: true, changed: true }) };
    },
  }));
  await page.sb.flushMapSaves(); await PAGE.settle(20);
  return { posted, statuses: page.statuses, els, model };
}
const sent = (r, url) => r.posted.filter((p) => p && p.url === url);

(async () => {
  console.log("\n=== a new region name typed in the open ✎ row, then Save (Ctrl+S or 💾) ===");
  {
    const r = await save({ region: { open: true, typed: "  Baltic Shore ", id: "5" } });
    const w = sent(r, "/api/map/set-region-name");
    ok(w.length === 1 && w[0].body && w[0].body.nameKey === "STRATEGICREGION_5" && w[0].body.name === "Baltic Shore", "⭐⭐⭐ the Save sent the typed name for region 5's name key", r.posted);
    ok(r.posted.includes("undo:Rename strategic region"), "⭐ …as its own Undo step, as Enter makes it", r.posted);
    ok(r.els.get("miRegionRenameRow").style.display === "none" && r.model.strategicRegions[0].displayName === "Baltic Shore", "…and the row is closed and the page shows the new name");
  }
  console.log("\n=== a new supply-area name typed in its open ✎ row, then Save ===");
  {
    const r = await save({ supply: { open: true, typed: "Northern Depot", id: "9" } });
    const w = sent(r, "/api/map/set-supplyarea-name");
    ok(w.length === 1 && w[0].body && w[0].body.nameKey === "SUPPLYAREA_9" && w[0].body.name === "Northern Depot", "⭐⭐⭐ the Save sent the typed supply-area name", r.posted);
  }
  console.log("\n=== what is not a typed name is not staged ===");
  {
    const same = await save({ region: { open: true, typed: "Old Coast", id: "5" } });
    ok(!sent(same, "/api/map/set-region-name").length && !same.posted.some((p) => typeof p === "string" && p.startsWith("undo:")), "⭐ an open row still holding the region's own name stages nothing", same.posted);
    const closed = await save({ region: { open: false, typed: "Left Over", id: "5" } });
    ok(!sent(closed, "/api/map/set-region-name").length, "⭐ a closed row's leftover text stages nothing", closed.posted);
    const blank = await save({ region: { open: true, typed: "   ", id: "5" } });
    ok(!sent(blank, "/api/map/set-region-name").length, "a blank row stages nothing", blank.posted);
    const none = await save({ region: { open: true, typed: "Somewhere", id: "" } });
    ok(!sent(none, "/api/map/set-region-name").length, "a row with no region picked stages nothing", none.posted);
  }
  console.log("\n=== the order in flushMapSaves (comments masked) ===");
  {
    const body = maskJsComments(PAGE.lift(FLUSH[0], FLUSH[1]));
    const running = body.indexOf("if (flushMapSaves.running) return flushMapSaves.running;"), stage = body.indexOf("stageOpenRenameRows()"), start = body.indexOf("flushMapSaves.running = new Promise");
    ok(running >= 0 && stage > running && start > stage, "⭐ the rows are staged after a running Save is joined and before this Save starts", { running, stage, start });
    ok(body.split("stageOpenRenameRows()").length === 2, "…once");
  }
  console.log(`\n${checks - fails.length}/${checks} checks passed`);
  if (fails.length) { console.log("FAILED:\n  " + fails.join("\n  ")); process.exit(1); }
})().catch((e) => { console.error(e.stack || e); process.exit(1); });
