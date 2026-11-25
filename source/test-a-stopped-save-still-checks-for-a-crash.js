// A map Save that stops half-way must still run the crash gate. #a-stopped-save-skips-the-crash-gate
//
// public/map.js ends flushMapSaves with a /api/map/validate call whose own comment calls it "the guarantee
// that no map Save can leave the mod in a launch-crashing state unnoticed". Every one of that function's
// `return`s sat ABOVE it, and four of them fire AFTER writes have already landed on disk:
//
//   · the write loop's catch          — steps 1..done are written, step done+1 threw
//   · the write loop's `!res.ok`      — steps 1..done are written, step done+1 was refused
//   · the paint fetch's catch         — the ENTIRE write loop finished; only the paint failed
//   · the paint's `!res.ok`           — the ENTIRE write loop finished; only the paint was refused
//
// So the moment the mod is most likely to be half-applied and unlaunchable was the one moment the check
// never ran. Not hypothetical: the client queues create-state with no provinces, map-data writes
// `provinces = {  }`, and `empty_state` is in the curated FATAL set — "crashes before the main menu". The
// modder's whole message was "Save stopped at step 2. Remaining changes kept."
//
// ⚠️ The last of those four also LIED. The paint block runs after the write loop, so every state / owner /
// region write in the batch was already on disk when it said "Nothing was saved".
//
// ⚠️⚠️ Tested by LIFTING flushMapSaves out of the page and RUNNING it against a recording fetch. A source
// -shape assertion ("the function mentions mapCrashGate") would pass against a version that only mentions
// it on the success path — which is precisely the bug.
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
// Mask length-preservingly so offsets still address the real source. A fix's own prose says "validate".
const MASKED = maskJsComments(MAP);

// ── the shape, as a cheap first pass ─────────────────────────────────────────────────────────────────
console.log("\n=== every exit that can leave writes on disk reaches the gate ===");
{
  const s = MASKED.indexOf("async function flushMapSaves");
  ok(s > 0, "flushMapSaves was found", s);
  // The function ends at the `finally` that re-enables the Save button.
  const e = MASKED.indexOf("} finally { if (btn) btn.disabled = false; updateSaveButton(); }", s);
  ok(e > s, "…and its end was found", e);
  const bodyMasked = MASKED.slice(s, e), body = MAP.slice(s, e);
  const gates = (bodyMasked.match(/mapCrashGate\(/g) || []).length;
  ok(gates >= 5, `⭐ the gate is called ${gates} times, not once at the end`, gates);
  // Every `return;` that is not the "Nothing to save" / pre-write bail must be preceded by a gate call.
  const returns = [];
  const re = /\breturn;/g; let m;
  while ((m = re.exec(bodyMasked))) returns.push(m.index);
  ok(returns.length >= 5, `${returns.length} bare returns in the function`, returns.length);
  // ⚠️ Classify by POSITION, not by keyword. A return is harmless exactly when it happens before the
  // first write is posted — "Nothing to save", the vanilla-edits confirm, the settings flip that failed.
  // Keyword-matching those bails is a hand-kept list that goes stale the moment someone adds another one;
  // the write loop's own offset is derived from the source and cannot.
  const loopAt = bodyMasked.search(/while\s*\(\s*pendingWrites\.length/);
  ok(loopAt > 0, "the write loop was located, so returns can be split into before/after it", loopAt);
  const preWrite = returns.filter((i) => i < loopAt).length;
  ok(preWrite >= 1, `${preWrite} return(s) bail before anything is written — those need no check`, preWrite);
  const ungated = returns.filter((i) => i > loopAt).filter((i) => {
    const before = bodyMasked.slice(Math.max(0, i - 400), i);
    return !/mapCrashGate\(/.test(before);
  });
  ok(ungated.length === 0,
    "⭐⭐ no post-write exit returns without checking the map first",
    ungated.map((i) => body.slice(Math.max(0, i - 150), i + 8).replace(/\s+/g, " ").slice(-150)));
  // ⛔ #a-stopped-save-says-its-reason-once (B6-15) — every stopped-Save line hands its reason to stop(), which adds a full stop only
  // where the reason has none; the eight templates (a refused write, a thrown one, an erase stroke's, a town run's) are derived here
  const stoppedAt = [...bodyMasked.matchAll(/stopped: `Save stopped at step \$\{done \+ 1\}: \$\{/g)].map((m) => m.index);
  const unstopped = stoppedAt.filter((i) => !/^stopped: `Save stopped at step \$\{done \+ 1\}: \$\{stop\(/.test(bodyMasked.slice(i, i + 80)));
  ok(stoppedAt.length >= 4 && unstopped.length === 0, `⭐ all ${stoppedAt.length} "Save stopped at step" lines give their reason through stop()`,
    unstopped.map((i) => body.slice(i, i + 140)));
  const stopFn = /const stop = \(t\) => \(\/\[\.!\?…\]\$\/\.test\(String\(t\)\) \? String\(t\) : String\(t\) \+ "\."\);/.test(bodyMasked);
  ok(stopFn, "…and stop() is flushMapSaves' own, adding a full stop only where the reason has none", stopFn);
}

// ── the behaviour: run the real thing ────────────────────────────────────────────────────────────────
console.log("\n=== …and it really runs, on a save that stopped ===");
{
  // Lift flushMapSaves plus the two helpers it calls, into a sandbox with a recording fetch.
  const grab = (needle, endNeedle) => {
    const s = MASKED.indexOf(needle);
    if (s < 0) return "";
    const e = MASKED.indexOf(endNeedle, s);
    return e < 0 ? "" : MAP.slice(s, e + endNeedle.length);
  };
  const flush = grab("async function flushMapSaves", "} finally { if (btn) btn.disabled = false; updateSaveButton(); }\n  }");
  const gate = grab("async function mapCrashGate", '\n  }');
  // …and the save boundary, which the stopped exits call beside the gate. Lifted rather than stubbed so this
  // test runs the same pair of calls the page does. #a-stopped-save-keeps-a-stale-undo-stack owns its own test.
  const mark = grab("function markSaveBoundary", "\n  }");
  // …and the helper that puts what Delete map left in adjacencies.csv on Save's warning line.
  // #delete-map-reports-the-adjacencies-it-drowned
  const note = grab("function blankAdjacencyNote", "\n  }");
  ok(flush.length > 500, "flushMapSaves lifted", flush.length);
  ok(note.length > 200, "blankAdjacencyNote lifted", note.length);
  ok(gate.length > 300, "mapCrashGate lifted", gate.length);
  ok(mark.length > 80, "markSaveBoundary lifted", mark.length);

  const run = (scenario) => {
    const calls = [];
    let gateRan = false, popup = null, status = "";
    const sandbox = {
      console,
      // what the two functions touch
      pendingWrites: scenario.writes.slice(),
      paintDiff: scenario.paint ? new Map([["1,1", { x: 1, y: 1, r: 1, g: 2, b: 3 }]]) : new Map(),
      statusEl: { style: {} },
      stateById: new Map(),
      model: { states: [] },
      stagedRiverEdits: [],
      undoStack: [], redoStack: [], historyLabels: [],
      saveGeneration: 0,
      baseImageData: null, baseImageDataPristine: null,
      setStatus: (s) => { status = String(s); },
      setMapDirty: () => {},
      updateSaveButton: () => {},
      modPath: () => "D:/fixture",
      isVanillaTarget: () => false,
      problemsPanelOpen: () => false,
      refreshProblems: () => {},
      renderCheckpoints: () => {},
      buildPidGrid: () => {}, computeCentroids: () => {}, recolorAll: () => {}, draw: () => {},
      loadRiversOverlay: () => {},
      orphanedQueuedWrites: () => [],
      emptyNewStateWrites: () => [],
      stateFormDirty: () => false,
      stateFormBaseline: null,
      stageStateWrite: () => {},
      remapQueuedStateId: () => {},
      provincesBmpNote: () => "", riversPaintNote: () => "", heightmapNote: () => "",
      STATE_ID_FIELDS: [],
      openMapErrorsModal: (v, mode) => { popup = { errors: v.errors, mode }; },
      saveMapBackup: () => {},
      renderCheckpoints: () => {},
      updateUndoButtons: () => {},
      undoStack: [], redoStack: [], historyLabels: [], saveGeneration: 0,
      rebuildStagedRiversFromPending: () => {},
      $: () => null,
      // ⚠️ THE REAL MODULE, not a stub. map.html loads map-rule-labels.js, so window.NovaMapRuleLabels is
      // there on the real page, and the gate uses isFatalRule to tell "this will crash HOI4" from "the game
      // loads past this". A fake window of `{}` sent the gate down its module-missing fallback, so every
      // scenario below would have been classified by the fallback rather than by the real fatal set — the
      // test would have been measuring the wrong branch and passing.
      window: { NovaMapRuleLabels: require("./public/map-rule-labels.js") },
      encodeURIComponent,
      fetch: async (url, opts) => {
        calls.push(String(url).split("?")[0]);
        if (String(url).indexOf("/api/map/validate") === 0) {
          gateRan = true;
          // ⚠️ THE PROBLEMS MUST MATCH THE COUNT. This used to answer `errors: N` with `problems: []`, which
          // no real /api/map/validate ever does — the count is derived FROM the array. It went unnoticed
          // because the gate only read v.errors. It now reads v.problems to tell a crash from a fault the
          // game loads past (#severity-error-is-not-a-crash), and an empty array made every scenario look
          // non-fatal. A hand-made response is not what the endpoint produces.
          const rule = scenario.errorRule || "state_id_gap";   // fatal by default: these scenarios mean "crash"
          return { json: async () => ({
            ok: true, errors: scenario.errorsAfter, warnings: 0,
            problems: Array.from({ length: scenario.errorsAfter || 0 }, (_, i) => ({
              severity: "error", rule, message: `${rule} #${i + 1}`,
            })),
          }) };
        }
        if (String(url).indexOf("/api/map/paint-provinces") === 0) {
          return { json: async () => (scenario.paintOk ? { ok: true, warnings: [] } : { ok: false, error: "would erase province 12." }) };
        }
        const i = calls.filter((c) => c.indexOf("/api/map/") === 0 && c.indexOf("validate") < 0 && c.indexOf("paint") < 0).length;
        const fail = scenario.failAtWrite && i === scenario.failAtWrite;
        // A write that succeeds may carry a note about what Nova changed — the client reads it as
        // res.fileWarning and pushes it onto writeWarnings, which is the real path this is testing.
        const note = (scenario.notes && i === 1) ? { fileWarning: scenario.notes[0] } : {};
        return { json: async () => (fail ? { ok: false, error: "State 42 not found in mod." } : { ok: true, id: 100 + i, ...note }) };
      },
    };
    sandbox.globalThis = sandbox;
    vm.createContext(sandbox);
    vm.runInContext(`${mark}\n${gate}\n${note}\n${flush}\nglobalThis.__run = flushMapSaves;`, sandbox);
    return sandbox.__run().then(() => ({ calls, gateRan, popup, status }));
  };

  const W = [
    { url: "/api/map/create-state", body: {}, meta: {} },
    { url: "/api/map/move-province", body: {}, meta: {} },
  ];

  return Promise.resolve()
    .then(() => run({ writes: W, failAtWrite: 2, errorsAfter: 1 }))
    .then((r) => {
      ok(r.gateRan === true, "⭐⭐ a write refused mid-batch STILL validates what already landed", r.calls);
      ok(!!(r.popup && r.popup.mode === "postsave"), "⭐⭐ …and the crash popup is put in front of the modder", r.popup);
      ok(/Save stopped at step 2/.test(r.status) && /refuses to load/.test(r.status),
        "⭐ …and the message says BOTH what stopped and what it left behind", r.status);
      // ⛔ #a-stopped-save-says-its-reason-once (B6-15) — the server's reason ends in a full stop, and the template added another:
      // "… not found in mod.. Remaining changes kept."
      ok(/State 42 not found in mod\. Remaining changes kept\./.test(r.status) && !/\.\.\s/.test(r.status),
        "⭐ …and gives the server's reason once, with no second full stop after it", r.status);
    })
    // ⭐⭐⭐ #severity-error-is-not-a-crash — THE SAME STOP, with an error that is NOT in the fatal set.
    // CLAUDE.md: `severity === "error"` does not mean "will crash"; isFatalRule is the authority, and
    // Millennium Dawn ships twenty non-fatal errors and launches. The status line used to say "will crash
    // HOI4 on launch" for any error at all, which is what teaches a modder to ignore it on the day it is
    // real. The popup still opens — only the word "crash" is withheld.
    .then(() => run({ writes: W, failAtWrite: 2, errorsAfter: 1, errorRule: "coastal_no_port" }))
    .then((r) => {
      ok(!/crash/i.test(r.status),
        "⭐⭐⭐ a non-fatal error does NOT claim the map will crash", r.status);
      ok(/load past/i.test(r.status) && /not work right/i.test(r.status),
        "…it says what is actually true: the game loads it, and it will not work right", r.status);
      ok(/Save stopped at step 2/.test(r.status),
        "…and it still says what stopped the save", r.status);
      ok(!!(r.popup && r.popup.mode === "postsave"),
        "⚠️ …and the popup still opens — this is about wording, not about hiding the problem", r.popup);
    })
    // THE CONTROL that the gate is not just always-on: a clean stop with a still-valid map must not shout.
    .then(() => run({ writes: W, failAtWrite: 2, errorsAfter: 0 }))
    .then((r) => {
      ok(r.gateRan === true, "a stopped save with a still-loadable map checks too", r.calls);
      ok(r.popup === null, "⚠️ …and does NOT cry wolf — no popup when there is no crash", r.popup);
      ok(/Save stopped at step 2/.test(r.status) && !/crash HOI4/.test(r.status),
        "⚠️ …it just says what stopped", r.status);
    })
    // The paint exits: the whole write loop landed, only the paint was refused.
    .then(() => run({ writes: W, paint: true, paintOk: false, errorsAfter: 2 }))
    .then((r) => {
      const wrote = r.calls.filter((c) => c === "/api/map/create-state" || c === "/api/map/move-province").length;
      ok(wrote === 2, "both state writes landed before the paint was refused", r.calls);
      ok(r.gateRan === true, "⭐⭐ a refused paint still validates the writes that DID land", r.calls);
      ok(!/Nothing was saved/.test(r.status),
        "⭐⭐⭐ …and no longer claims “Nothing was saved” over two writes that are on disk", r.status);
      ok(/already written to your mod/.test(r.status),
        "⭐⭐ …it says the other changes were written", r.status);
      ok(/NOT applied/.test(r.status), "…and that it is the PIXELS that were refused", r.status);
    })
    // ⭐ A crash must not swallow the notice that NOVA changed the modder's work.
    // #a-crash-swallows-the-notice-that-nova-changed-your-pixels — the save's own warnings say what Nova
    // itself did (auto-repaired a paint, took its own 11.5 MB heightmap, added a river source pixel, where
    // the deleted state files were copied to). They lived only in the `else if` after the error branch, so
    // any save that ALSO left a validator error dropped every one of them — and that is exactly the save
    // where "here is what I changed" matters most.
    .then(() => run({ writes: W, failAtWrite: 2, errorsAfter: 1, notes: ["Nova kept a 2-pixel sliver of province 12 so the map still works."] }))
    .then((r) => {
      ok(/refuses to load/.test(r.status), "the refusal is still the headline", r.status);
      ok(/2-pixel sliver of province 12/.test(r.status),
        "⭐⭐⭐ …and the notice that Nova altered the user's pixels survives beside it", r.status);
    })
    // …and the ordinary happy path still reports normally.
    .then(() => run({ writes: W, errorsAfter: 0 }))
    .then((r) => {
      ok(r.gateRan === true, "a clean save still validates", r.calls);
      ok(/Saved 2 changes/.test(r.status), "…and says what it saved", r.status);
      ok(r.popup === null, "…with no popup", r.popup);
    })
    .then(() => {
      console.log(`\n=== a stopped save still checks for a crash: ${pass} checks, ${fails.length} failed ===`);
      fails.forEach((f) => console.log("   FAILED: " + f));
      process.exit(fails.length ? 1 : 0);
    });
}
