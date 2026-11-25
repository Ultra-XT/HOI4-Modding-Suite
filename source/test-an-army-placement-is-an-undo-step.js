// ⛔ #an-army-placement-is-an-undo-step — A PLACEMENT OR A REMOVAL IN THE 🪖 ARMY TOOL IS TAKEN BACK BY ↶ UNDO (Ctrl+Z).
//
// B6-29 (tool campaign, CONFIRMED, low): right after "Placed Infanterie-Division at province 9523 (32 total).", Ctrl+Z answered "Nothing
// to undo." and the division stayed, under a ↶ button titled "Undo the last edit (Ctrl+Z)". armyClickAt pushed the division into
// armyModel.divisions with no undo step, and doUndo read only the map's stack; the panel's 🗑 Remove was the one way back, unsaid.
//
// The fix (public/map.js): the tool keeps its own steps (armyUndo / armyRedo, armySnapshot, armyPushUndo, armyStepOn,
// armyApplySnapshot). In Army mode ↶ / ↷ take them first, then the map's. A step remembers the model it was taken of, so a step of a
// country since replaced is never applied to the one now shown, and 💾 Save army is a boundary.
//
// Run, not read: the page's own armyClickAt, doUndo, doRedo, updateUndoButtons, armySave and the army step helpers, lifted out of
// public/map.js into one sandbox. Then, derived from the source (comments masked): every place that adds a division to the army model
// or takes one out of it takes an undo step first, and both Undo and Redo ask the tool before saying there is nothing to do.
"use strict";
const T = require("./testlib-map-page.js");

let checks = 0;
const fails = [];
function rec(name, pass, detail) {
  checks++;
  console.log(`${pass ? "PASS" : "FAIL"} ${name}`);
  if (!pass) { fails.push(name); if (detail !== undefined) console.log("   ", typeof detail === "string" ? detail.slice(0, 1200) : JSON.stringify(detail).slice(0, 1200)); }
}

// armyHasUnsaved is one line and ends at its own; the rest close at the IIFE's two-space "}" (the step helpers on purpose: see map.js)
const FNS = [
  "function armySnapshot()", "function armyPushUndo()", "function armyStepOn(", "function armyApplySnapshot(",
  ["function armyHasUnsaved()", "\n"], "function armyClickAt(", "function doUndo()", "function doRedo()", "function updateUndoButtons()",
  "async function armySave()",
];

const OWN = { pid: 9523, owner: "GER", type: "land" };
function page() {
  const els = { mapUndo: T.element("button"), mapRedo: T.element("button"), armySaveBtn: T.element("button"), armySaveStatus: T.element("span") };
  const mapApplied = [];
  const saves = [];
  const p = T.runPage(FNS, {
    $: (id) => els[id] || null,
    mode: "army", armyTag: "GER", armyTemplate: "Infanterie-Division", armyRemoveMode: false, armyVariants: [],
    armyModel: { file: "GER_nova.txt", templates: [{ name: "Infanterie-Division" }], divisions: [{ name: "1. Infanterie-Division", location: 11, template: "Infanterie-Division" }], fingerprint: "f1" },
    armyRemovedSinceSave: false, armyDirtyTemplates: new Set(), armyUndo: [], armyRedo: [], UNDO_LIMIT: 30,
    undoStack: [], redoStack: [],
    snapshotMap: () => ({ map: "now" }), applyMapSnapshot: (s) => { mapApplied.push(s); },
    armyProvinceAt: () => OWN, armyLoad: () => {}, confirm: () => true, modPath: () => "D:/fixture/mod",
    renderArmyPanel: () => {}, draw: () => {}, renderHistoryPanel: () => {},
    fetch: async (url, opts) => { saves.push({ url, body: JSON.parse(opts.body) }); return { ok: true, status: 200, json: async () => ({ ok: true, divisions: JSON.parse(opts.body).divisions.length, file: "GER_nova.txt", fingerprint: "f2" }) }; },
  });
  return { sb: p.sb, statuses: p.statuses, els, mapApplied, saves, last: () => p.statuses[p.statuses.length - 1] || "" };
}

(async () => {
  let P = null;
  try { P = page(); } catch (e) { rec("the page has the army undo step functions (armySnapshot, armyPushUndo, armyStepOn, armyApplySnapshot)", false, e.message); }
  if (P) {
    const { sb } = P;
    const count = () => sb.armyModel.divisions.length;

    // ── a placement, Ctrl+Z, Ctrl+Y ──
    sb.armyClickAt(100, 100, false);
    rec("a click in the tool places a division (the probe: 1 -> 2)", count() === 2 && /^Placed /.test(P.last()), { count: count(), said: P.last() });
    rec("⭐ …and ↶ is offered in Army mode right after it", P.els.mapUndo.disabled === false, { disabled: P.els.mapUndo.disabled });
    sb.doUndo();
    rec("⭐⭐⭐ Ctrl+Z takes the placement back (2 -> 1), and says it was the 🪖 Army tool's step", count() === 1 && /Undone in the 🪖 Army tool/.test(P.last()), { count: count(), said: P.last() });
    rec("⭐ …and the tool has nothing unsaved again (the division it took back was the only change)", sb.armyHasUnsaved() === false, { unsaved: sb.armyHasUnsaved() });
    sb.doRedo();
    rec("⭐⭐ Ctrl+Y puts it back (1 -> 2), unsaved", count() === 2 && sb.armyHasUnsaved() === true && /Redone in the 🪖 Army tool/.test(P.last()), { count: count(), unsaved: sb.armyHasUnsaved(), said: P.last() });

    // ── a removal ──
    sb.armyRemoveMode = true;
    sb.armyClickAt(100, 100, false);
    rec("🗑 Remove takes the division out (2 -> 1) and says ↶ Undo puts it back", count() === 1 && sb.armyRemovedSinceSave === true && /Undo puts it back/.test(P.last()), { count: count(), said: P.last() });
    sb.doUndo();
    rec("⭐⭐ Ctrl+Z puts the removed division back (1 -> 2), with the removal flag as it was", count() === 2 && sb.armyRemovedSinceSave === false && sb.armyModel.divisions.some((d) => d.location === OWN.pid), { count: count(), removed: sb.armyRemovedSinceSave });
    sb.armyRemoveMode = false;

    // ── the map's own stack is still reached once the tool's steps are used up (the fall-through, and the probe's control) ──
    sb.armyUndo.length = 0; sb.armyRedo.length = 0;
    sb.undoStack.push({ map: "before a paint" });
    sb.doUndo();
    rec("THE CONTROL: with no army step left, Ctrl+Z in Army mode undoes the map's last edit as before", P.mapApplied.length === 1 && /^↶ Undone \(unsaved/.test(P.last()), { applied: P.mapApplied.length, said: P.last() });
    sb.undoStack.length = 0; sb.redoStack.length = 0;

    // ── a step of another country is never applied to the one now shown ──
    sb.armyClickAt(100, 100, false);
    const before = count();
    const ita = { file: "ITA_nova.txt", templates: [], divisions: [{ name: "1. Divisione", location: 7, template: "Divisione" }], fingerprint: "i1" };
    sb.armyModel = ita; sb.armyTag = "ITA";
    sb.doUndo();
    rec("⭐⭐ a step taken for GER is not applied after another country was picked (ITA keeps its 1 division)", sb.armyModel === ita && ita.divisions.length === 1 && P.last() === "Nothing to undo." && sb.armyUndo.length === 0, { ita: ita.divisions.length, said: P.last(), steps: sb.armyUndo.length, gerHad: before });

    // ── outside Army mode, the tool's steps are not taken ──
    sb.armyClickAt(100, 100, false);
    sb.mode = "paint";
    sb.updateUndoButtons();
    rec("outside Army mode ↶ is off when the map has nothing to undo", P.els.mapUndo.disabled === true, { disabled: P.els.mapUndo.disabled });
    sb.doUndo();
    rec("…and Ctrl+Z there leaves the army as it is", ita.divisions.length === 2 && P.last() === "Nothing to undo.", { ita: ita.divisions.length, said: P.last() });
    sb.mode = "army";

    // ── 💾 Save army is a boundary ──
    await sb.armySave();
    rec("💾 Save army sends the divisions (the probe: one save, 2 divisions)", P.saves.length === 1 && P.saves[0].body.divisions.length === 2, P.saves.map((s) => s.body.divisions.length));
    sb.doUndo();
    rec("⭐⭐ after 💾 Save army, Ctrl+Z does not reach back past it (nothing to undo; the 2 saved divisions stay)", ita.divisions.length === 2 && P.last() === "Nothing to undo." && sb.armyHasUnsaved() === false, { count: ita.divisions.length, said: P.last(), unsaved: sb.armyHasUnsaved() });

    // ── the cap ──
    for (let i = 0; i < 35; i++) sb.armyClickAt(100, 100, false);
    rec("the tool keeps at most UNDO_LIMIT steps, as the map does", sb.armyUndo.length === 30, sb.armyUndo.length);
  }

  // ── derived from the source, comments masked ──
  const M = T.MASKED;
  const fnStarts = [];
  { const re = /\n  (?:async )?function (\w+)\s*\(/g; let m; while ((m = re.exec(M))) fnStarts.push({ at: m.index, name: m[1] }); }
  const enclosing = (pos) => { let f = null; for (const s of fnStarts) { if (s.at < pos) f = s; else break; } return f; };
  const sites = [];
  { const re = /armyModel\.divisions\.(push|splice|pop|shift|unshift)\(/g; let m; while ((m = re.exec(M))) sites.push({ at: m.index, op: m[1] }); }
  const unguarded = sites.filter((s) => { const f = enclosing(s.at); return !f || M.slice(f.at, s.at).indexOf("armyPushUndo(") === -1; }).map((s) => `${(enclosing(s.at) || {}).name}: .${s.op}(`);
  rec("the source has the places that add or take out a division (placement and removal: at least 2)", sites.length >= 2, sites.length);
  rec("⭐⭐ every place that adds a division to the army model or takes one out takes an undo step first (armyPushUndo, in the same function)", unguarded.length === 0, unguarded);
  const assigns = [];
  { const re = /armyModel\.divisions\s*=(?!=)/g; let m; while ((m = re.exec(M))) assigns.push((enclosing(m.index) || {}).name); }
  rec("only armyApplySnapshot replaces the army model's divisions wholesale", assigns.length > 0 && assigns.every((n) => n === "armyApplySnapshot"), assigns);
  for (const [fn, nothing, stack] of [["doUndo", "Nothing to undo.", "armyUndo"], ["doRedo", "Nothing to redo.", "armyRedo"]]) {
    const at = M.indexOf(`\n  function ${fn}()`);
    const body = at === -1 ? "" : M.slice(at, M.indexOf("\n  }", at));
    const ask = body.indexOf(`armyStepOn(${stack})`), say = body.indexOf(nothing);
    rec(`⭐ ${fn} asks the 🪖 Army tool's steps before it says "${nothing}"`, ask !== -1 && say !== -1 && ask < say, { ask, say });
  }

  console.log(`\n${checks - fails.length}/${checks} checks passed`);
  if (fails.length) { console.log("FAILED:\n  " + fails.join("\n  ")); process.exit(1); }
  console.log("All green");
})().catch((e) => { console.error(e.stack || e); process.exit(1); });
