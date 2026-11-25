// ⛔ #a-world-leaves-the-page-on-the-disks-map (#delete-map-gives-back-the-cut, batch C) — A WORLD GENERATED OVER AN EARLIER ONE ENDS
// WITH THE PAGE HOLDING THE MAP ON DISK, AS A SAVE WHOSE DELETE MAP GAVE PROVINCES BACK DOES.
//
// A re-roll's Delete map step folds the provinces the world before it cut back into their parents: their rows, colours and pixels
// go, and the run's Generate land then hands those very ids to new provinces. The page that started the run still holds the map it
// loaded before it. The run's end reloaded through reloadAfterImmediateWrite → load(line) — which, like a Save's reload before batch
// C's review (K6), asked "You have unsaved changes that will be discarded if you reload. Continue?" when the 🪖 Army tool had unsaved
// work, and a Cancel left the page on the old map with nothing to say it was stale: no model.provinceFold, so neither the next Save
// (dropFoldedEdits) nor 🌍 Generate land (which reads the map again first while the page is stale) knew to sort it out.
//
// So, as flushMapSaves does after a fold:
//   1. pollWorldRun's three ends (done, failed, interrupted) reload with { afterSave: true }, which load() reads as "re-read the map
//      a write just changed": map edits are still asked about, the Army tool's work is kept and not asked about;
//   2. reloadAfterImmediateWrite hands that second argument on to load (one-argument callers unchanged);
//   3. the run's Delete map fold is marked on the page's model before the reload (model.provinceFold), exactly the mark flushMapSaves
//      leaves for the same answer (its lines lifted and run on it), so a reload that is cancelled or fails leaves the page's guards on;
//      nothing is marked for a run that gave nothing back, and a page that never loaded a map (the run was going when it opened)
//      reloads as before.
// Run: node test-a-world-leaves-the-page-on-the-disks-map.js
"use strict";
const vm = require("vm");
const WP = require("./testlib-world-page.js");
const TP = require("./testlib-map-page.js");
const L = require("./public/map-rule-labels.js");

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (ok || detail == null ? "" : "   -> " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 700)));
  if (!ok) fails.push(label);
};
const answer = (body, status = 200) => ({ status, ok: status < 400, json: async () => JSON.parse(JSON.stringify(body)) });
const STEPS = require("./world-run.js").STEPS;
const runOf = (state) => ({ id: "r-" + state, modName: "Fold", modRoot: "C:/m/fold", state, startedAt: 1000, endedAt: state === "running" ? null : 5000, stepIndex: 2, step: "generate",
  error: state === "failed" ? "boom" : "", failedStep: state === "failed" ? "generate" : "", seen: false, plan: {}, choices: { landShare: 35, seed: 2, ownerMode: "inherit" }, leftovers: [],
  steps: STEPS.map((s, i) => ({ key: s.key, n: s.n, k: s.k, title: s.title, optional: !!s.optional,
    state: state === "running" ? (i < 2 ? "done" : i === 2 ? "running" : "waiting") : state === "done" ? (s.optional ? "skipped" : "done") : (i < 2 ? "done" : i === 2 ? "failed" : "not-run"), startedAt: 1000, endedAt: 2000, error: "" })) });
// the answer's shape, foldRecordedProvinceSplits' (rootOf: [[piece, the province it now is part of], …])
const FOLD = { changed: true, families: 2, provinces: 5, from: 9001, to: 9005, left: 0, rootOf: [[9001, 3], [9002, 3], [9003, 4], [9004, 4], [9005, 4]], units: { moved: 0, files: [] } };
const BLANK = { ok: true, changed: true, flippedProvinces: 12, deletedStates: 2, deletedSupply: 0, strippedCapitals: 0, snapshotPath: "", provinceFold: FOLD };
const markOf = (m) => (m && m.provinceFold ? { from: m.provinceFold.from, to: m.provinceFold.to, rootOf: [...m.provinceFold.rootOf].sort((a, b) => a[0] - b[0]) } : null);

/** A world page whose run ends in `state`, its finished steps' answers `answers`; `model` stands for the page's own (absent: a page that
 *  never loaded a map). Drives the poll to the end and returns the page. */
async function endOf(state, answers, model) {
  const routes = { "/api/map/world-run": { ok: true, run: runOf(state) }, "/api/map/world-run?answers=1": { ok: true, run: Object.assign(runOf(state), { answers }) } };
  const fetch = async (url) => (Object.prototype.hasOwnProperty.call(routes, String(url)) ? answer(routes[String(url)]) : answer({ ok: false, error: "no route " + url }, 404));
  const timers = { fns: [], setTimeout(fn) { timers.fns.push(fn); return timers.fns.length; }, clearTimeout() {}, setInterval: () => 0, clearInterval() {} };
  const p = WP.worldPage(Object.assign({ fetch, modPath: "C:/m/fold", timers }, model ? { extra: { model } } : {}));
  p.sb.showWorldRun(runOf("running"));
  for (let i = 0; i < 6 && timers.fns.length; i++) { const fn = timers.fns.shift(); await fn(); await p.settle(); }
  return p;
}

(async () => {
  try {
    console.log("1. the run's three ends reload as a Save's does after a fold");
    for (const state of ["done", "failed", "interrupted"]) {
      const p = await endOf(state, { blank: BLANK }, { states: [] });
      rec(`THE CONTROL: [${state}] the poll ran to the run's end and reloaded once`, p.reloads.length === 1, p.reloads);
      rec(`⭐⭐ [${state}] …with { afterSave: true }: the 🪖 Army tool's work is kept, not asked about (a Cancel left the old map on the page)`, !!(p.reloadOpts && p.reloadOpts[0] && p.reloadOpts[0].afterSave === true), p.reloadOpts);
      rec(`⭐⭐ [${state}] the page's model carries the fold the run's Delete map made, before the reload replaces it`, JSON.stringify(markOf(p.sb.model)) === JSON.stringify({ from: FOLD.from, to: FOLD.to, rootOf: FOLD.rootOf }), markOf(p.sb.model));
    }
    {
      const p = await endOf("done", { blank: Object.assign({}, BLANK, { provinceFold: { changed: false } }) }, { states: [] });
      rec("THE CONTROL: a run whose Delete map gave nothing back marks nothing (a new mod's world)", p.reloads.length === 1 && markOf(p.sb.model) === null, markOf(p.sb.model));
      const q = await endOf("failed", {}, { states: [] });
      rec("THE CONTROL: a run that stopped before its Delete map marks nothing", q.reloads.length === 1 && markOf(q.sb.model) === null, markOf(q.sb.model));
      let threw = null, r = null;
      try { r = await endOf("done", { blank: BLANK }, null); } catch (e) { threw = e; }
      rec("⭐ a page that never loaded a map (the run was going when it opened) reloads as before, and nothing throws", !threw && r && r.reloads.length === 1, threw && threw.stack);
    }
    {
      // a page still holding the map from before an EARLIER fold (a Save that stopped after one): the run's fold is added to it, as the
      // Save loop adds a second
      const was = { rootOf: new Map([[9100, 7]]), from: 9100, to: 9100 };
      const p = await endOf("done", { blank: BLANK }, { states: [], provinceFold: was });
      const m = markOf(p.sb.model);
      rec("⭐ a mark already on the page is kept and widened, as the Save loop widens it", !!m && m.from === 9001 && m.to === 9100 && m.rootOf.length === 6 && m.rootOf.some(([a, b]) => a === 9100 && b === 7), m);
    }

    console.log("\n2. the mark is the one the Save loop leaves for the same answer");
    {
      const MAP = TP.MAP, MASKED = TP.MASKED;
      const grab = (needle, endNeedle) => { const s = MASKED.indexOf(needle); if (s < 0) return ""; const e = MASKED.indexOf(endNeedle, s); return e < 0 ? "" : MAP.slice(s, e + endNeedle.length); };
      const FLUSH = grab("async function flushMapSaves", "} finally { if (btn) btn.disabled = false; updateSaveButton(); }\n  }");
      rec("THE CONTROL: flushMapSaves lifted out of public/map.js", FLUSH.length > 2000, FLUSH.length);
      const loads = [];
      const sb = Object.assign({
        console, JSON, encodeURIComponent, pendingWrites: [{ url: "/api/map/blank-to-sea", body: {}, meta: {} }],
        paintDiff: new Map(), statusEl: { style: {} }, stateById: new Map(), model: { states: [] },
        stagedRiverEdits: [], undoStack: [], redoStack: [], historyLabels: [], saveGeneration: 0, baseImageData: null, baseImageDataPristine: null,
        setStatus: () => {}, setMapDirty: () => {}, updateSaveButton: () => {}, modPath: () => "C:/m/fold",
        isVanillaTarget: () => false, problemsPanelOpen: () => false, refreshProblems: () => {}, renderCheckpoints: () => {},
        buildPidGrid: () => {}, computeCentroids: () => {}, recolorAll: () => {}, draw: () => {}, loadRiversOverlay: () => {},
        orphanedQueuedWrites: () => [], emptyNewStateWrites: () => [], stateFormDirty: () => false, stateFormBaseline: null,
        stageStateWrite: () => {}, remapQueuedStateId: () => {}, remapLocalStateId: () => {}, provincesBmpNote: () => "", riversPaintNote: () => "", STATE_ID_FIELDS: [],
        adoptMergeRegions: () => {}, openMapErrorsModal: () => {}, saveMapBackup: () => {}, updateUndoButtons: () => {},
        rebuildStagedRiversFromPending: () => {}, $: () => null, window: { NovaMapRuleLabels: L }, provinceDef: new Map(), colorToProvince: new Map(),
        problemsEverLoaded: false, problemsStale: false,
        load: async (msg, o) => { loads.push([msg, o]); },
        fetch: async (url) => (String(url).startsWith("/api/map/validate") ? answer({ ok: true, problems: [], errors: 0, warnings: 0 }) : answer(BLANK)),
      });
      sb.globalThis = sb;
      vm.createContext(sb);
      const code = TP.withNoteHelpers(WP.withPageHelpers(FLUSH, new Set([...WP.STUBBED, "flushMapSaves", "openMapErrorsModal", "saveMapBackup", "setMapDirty"])));
      let threw = null;
      try { vm.runInContext(`${code}\nglobalThis.__run = flushMapSaves;`, sb); await sb.__run(); } catch (e) { threw = e; }
      const saved = markOf(sb.model);
      rec("THE CONTROL: Delete map → Save, on the same answer, marked the fold and reloaded with { afterSave: true }", !threw && !!saved && loads.length === 1 && loads[0][1] && loads[0][1].afterSave === true, { threw: threw && threw.message, saved, loads });
      const p = await endOf("done", { blank: BLANK }, { states: [] });
      rec("⭐⭐ the world's mark is the Save loop's, entry for entry", JSON.stringify(markOf(p.sb.model)) === JSON.stringify(saved), { world: markOf(p.sb.model), save: saved });
    }

    console.log("\n3. reloadAfterImmediateWrite hands load its second argument");
    {
      const code = TP.lift("async function reloadAfterImmediateWrite(");
      const loads = [];
      const sb = { setStatus: () => {}, mapCrashGate: async ({ head }) => `${head} (checked)`, load: async (...a) => { loads.push(a); } };
      vm.createContext(sb);
      vm.runInContext(`${code}\nglobalThis.__r = reloadAfterImmediateWrite;`, sb);
      await sb.__r("A world.", { afterSave: true });
      await sb.__r("Generate land.");
      rec("⭐⭐ a second argument reaches load, after the check's own line", loads[0] && loads[0][0] === "A world. (checked)" && loads[0][1] && loads[0][1].afterSave === true, loads[0]);
      rec("THE CONTROL: a one-argument caller (every immediate write's) reloads as before", loads[1] && loads[1][0] === "Generate land. (checked)" && loads[1][1] === undefined, loads[1]);
    }
  } catch (e) {
    rec("HARNESS ERROR", false, e && e.stack);
  }
  console.log(`\n=== a world leaves the page on the disk's map: ${checks} checks, ${fails.length} failed ===`);
  if (fails.length) { for (const f of fails) console.log("   FAILED: " + f); process.exitCode = 1; }
})();
