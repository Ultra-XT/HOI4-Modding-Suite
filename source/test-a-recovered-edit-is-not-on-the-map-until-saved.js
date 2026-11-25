// ⛔ #a-recovered-edit-is-not-on-the-map-until-saved — THE CRASH-RECOVERY BAR'S RESTORE SAYS THE MAP DOES NOT SHOW WHAT IT PUT BACK, AND THE
// SAVE THAT WRITES IT RELOADS THE MAP.
//
// B6-13 (tool campaign, CONFIRMED, medium): a session paints state 29 from FRA to GER and is lost; the next page shows the bar, and Restore
// said "Restored 1 unsaved edit — click 💾 Save to write them to your mod." while the map still read FRA. Restore puts the writes back in
// the queue; the page's model is the disk's, because each write's effect on the map lives in the click that queued it (some twenty
// kinds), not in the write. And a Save does not reload the map, so even after the edit was written the map went on showing FRA.
//
// The fix (words, plus one small behaviour): the bar and the line after Restore say the map does not show the edits until they are
// saved, and the Save of a recovered queue reloads the map afterwards (model.recoveredQueue, flushMapSaves' end — as after a fold).
//
// Run, not read: the page's own showRestoreBar and flushMapSaves, lifted out of public/map.js.
"use strict";
const T = require("./testlib-map-page.js");

let checks = 0;
const fails = [];
function rec(name, pass, detail) {
  checks++;
  console.log(`${pass ? "PASS" : "FAIL"} ${name}`);
  if (!pass) { fails.push(name); if (detail !== undefined) console.log("   ", typeof detail === "string" ? detail.slice(0, 1500) : JSON.stringify(detail).slice(0, 1500)); }
}

function elements() {
  const els = new Map();
  return { els, $: (id) => { if (!els.has(id)) els.set(id, T.element()); return els.get(id); } };
}

(async () => {
  // ── the bar, and its Restore ─────────────────────────────────────────────────────────────────────────────────────────────
  for (const n of [1, 3]) {
    const { els, $ } = elements();
    let page = null;
    const g = { $, pendingWrites: [], stagedRiverEdits: [], riversShow: false, model: { states: [] }, modPath: () => "D:/fixture/mod",
      rebuildStagedRiversFromPending: () => {}, loadRiversOverlay: () => {}, setMapDirty: () => {}, draw: () => {} };
    try { page = T.runPage(["function showRestoreBar"], g); } catch (e) { rec("showRestoreBar is lifted out of public/map.js", false, e.message); }
    if (!page) continue;
    const { sb, statuses } = page;
    const writes = Array.from({ length: n }, (_, i) => ({ url: "/api/map/set-owner", body: { stateId: 29 + i, owner: "GER" }, meta: {} }));
    sb.showRestoreBar({ modPath: "D:/fixture/mod", ts: Date.now() - 60000, writes });
    const bar = String(els.get("mapRestoreBar").innerHTML);
    const it = n === 1 ? "it" : "them";
    rec(`⭐⭐ the bar (${n} edit${n === 1 ? "" : "s"}) says Restore puts ${it} in the Save queue, and that the map shows ${it} once saved`,
      bar.includes(`Restore puts ${it} back in the Save queue; the map shows ${it} once 💾 Save has written ${it}.`), bar);
    const click = (els.get("mapRestoreBtn").listeners.click || [])[0];
    rec("…and its Restore button is wired", typeof click === "function", Object.keys(els.get("mapRestoreBtn").listeners));
    if (typeof click !== "function") continue;
    click();
    const line = statuses[statuses.length - 1] || "";
    rec(`⭐⭐⭐ after Restore the line says the map does not show ${it} yet, and that the Save reloads the map`,
      new RegExp(`^Restored ${n} unsaved edits? to the Save queue\\. The map does not show ${it} yet: it shows your mod as it is saved`).test(line)
        && new RegExp(`💾 Save writes ${it} to your mod and then reloads the map, which shows ${it}\\.$`).test(line), line);
    rec("…the writes are back in the queue (unchanged behaviour)", sb.pendingWrites.length === n && sb.pendingWrites[0].body.stateId === 29, sb.pendingWrites);
    rec("⭐⭐ …and the page marks its model as holding a recovered queue, for the Save to reload", sb.model.recoveredQueue === true, sb.model);
  }

  // ── the Save of that queue reloads the map; a Save of anything else does not ───────────────────────────────────────────────
  for (const recovered of [true, false]) {
    const loads = [];
    const sent = [];
    const g = Object.assign(T.loadGlobals(), {
      model: { states: [{ id: 29, provinces: [3536], owner: "FRA" }], provinceToState: { 3536: 29 }, capitals: {}, strategicRegions: [], supplyAreas: [], adjacencies: [], supplyNodes: [], railways: [], stateToSupplyArea: {}, provinceToRegion: {}, recoveredQueue: recovered || undefined },
      stateById: new Map([[29, { id: 29, provinces: [3536], owner: "FRA" }]]),
      pendingWrites: [{ url: "/api/map/set-owner", body: { stateId: 29, owner: "GER" }, meta: {} }],
      paintDiff: new Map(), undoStack: [], redoStack: [], historyLabels: ["Loaded map"], checkpoints: [], saveGeneration: 0,
      STATE_ID_FIELDS: ["stateId", "toStateId", "fromStateId", "sourceStateId", "targetStateId"], statusEl: { style: {}, textContent: "" },
      modPath: () => "D:/fixture/mod", isVanillaTarget: () => false, setMapDirty: () => {}, updateSaveButton: () => {}, updateUndoButtons: () => {},
      renderCheckpoints: () => {}, orphanedQueuedWrites: () => [], emptyNewStateWrites: () => [], stateFormDirty: () => false,
      openMapErrorsModal: () => {}, saveMapBackup: () => {}, reconcileNavalCarry: () => {}, rebuildStagedRiversFromPending: () => {},
      load: async (line, opts) => { loads.push({ line, opts }); },
      fetch: async (url, opts) => {
        const u = String(url).split("?")[0];
        sent.push(u);
        if (u === "/api/map/validate") return { json: async () => ({ ok: true, errors: 0, warnings: 0, problems: [] }) };
        return { json: async () => ({ ok: true, changed: true }) };
      },
    });
    let page = null;
    try { page = T.runPage([["async function flushMapSaves", "} finally { if (btn) btn.disabled = false; updateSaveButton(); }\n  }"], "async function mapCrashGate", "function markSaveBoundary"], g); }
    catch (e) { rec("flushMapSaves is lifted out of public/map.js", false, e.message); }
    if (!page) continue;
    try { await page.sb.flushMapSaves(); } catch (e) { rec("the Save runs", false, e.stack); }
    rec(`the Save sent the write (${recovered ? "a recovered queue" : "an ordinary one"})`, sent.indexOf("/api/map/set-owner") !== -1, sent);
    if (recovered) {
      rec("⭐⭐⭐ the Save of a recovered queue reloads the map afterwards, keeping its own line on screen",
        loads.length === 1 && loads[0].opts && loads[0].opts.afterSave === true && /Saved 1 change/.test(String(loads[0].line)), loads);
    } else {
      rec("CONTROL: a Save of an ordinary queue reloads nothing (as before)", loads.length === 0, loads);
    }
  }

  console.log(`\n=== a recovered edit is not on the map until saved: ${checks} checks, ${fails.length} failed ===`);
  for (const f of fails) console.log("FAILED: " + f);
  process.exit(fails.length ? 1 : 0);
})();
