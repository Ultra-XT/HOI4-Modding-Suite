// A Save still says, on its final line, that it discarded a new state with no provinces — and that it dropped changes pointing at a
// new state that was discarded. #a-save-still-says-what-it-discarded-from-the-queue
//
// THE DEFECT (discovery F22, verified on 790cb21 in the real page, scratchpad/batch10/discover/u3-undo.js T2 and u2-undo.js S5):
// flushMapSaves opens with two purges. emptyNewStateWrites drops the create of a "+ New state" nobody filled and sets
// "Discarded 1 new state with no provinces — HOI4 will not start a game with an empty state. Make it again and click provinces on the
// map to fill it. Saving the rest…"; orphanedQueuedWrites drops writes naming a provisional state no create will supply and sets
// "Dropped N unsaved changes that pointed at a new state you discarded. Saving the rest…". Both are overwritten in the same tick:
// by "Nothing to save." when nothing is left, else by "Saving… (1/N)", and neither reaches writeWarnings or the final line.
//   T2  "+ New state", click one province, ↶ Undo (queue: [create-state {name:"", owner:""}]), 💾 Save with #mapStatus polled every
//       100 ms: one entry, "Nothing to save.". The queue was emptied and nothing was written, and nothing said why.
//   S5  the same, final status "Nothing to save.".
//
// Run as the page runs it: flushMapSaves, mapCrashGate, markSaveBoundary, blankAdjacencyNote, orphanedQueuedWrites,
// emptyNewStateWrites and STATE_ID_FIELDS are lifted out of public/map.js into a sandbox whose fetch is the real server of
// testlib-two-layer-map.js. The queued writes are the bodies public/map.js queues: "+ New state" is create-state { name: "", owner }
// with meta { create, provisionalId }, a Fill click or a Move is move-province { provinceId, toStateId } with meta { fromStateId }.
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const L2 = require("./testlib-two-layer-map.js");
const world = L2.makeWorld("b11-discard-line");   // before server.js: it reads HOI4_MODS_ROOT when it loads
const P = require("./testlib-map-page.js");
const { createApp } = require("./server.js");
const labels = require("./public/map-rule-labels.js");

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (ok || detail == null ? "" : "   -> " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 700)));
  if (!ok) fails.push(label);
};

const MAP = P.MAP, MASKED = P.MASKED;
const grab = (needle, endNeedle) => { const s = MASKED.indexOf(needle); if (s < 0) return ""; const e = MASKED.indexOf(endNeedle, s); return e < 0 ? "" : MAP.slice(s, e + endNeedle.length); };
const PIECES = {
  fields: grab("const STATE_ID_FIELDS = ", "\n"),
  orphaned: grab("function orphanedQueuedWrites(writes)", "\n  }"),
  emptyNew: grab("function emptyNewStateWrites(writes, stateById)", "\n  }"),
  mark: grab("function markSaveBoundary", "\n  }"),
  gate: grab("async function mapCrashGate", "\n  }"),
  note: grab("function blankAdjacencyNote", "\n  }"),
  flush: grab("async function flushMapSaves", "} finally { if (btn) btn.disabled = false; updateSaveButton(); }\n  }"),
};

// The page's bodies (public/map.js): "+ New state", and a province click in Fill mode or a Move.
const newState = (owner, provisionalId) => ({ url: "/api/map/create-state", body: { name: "", owner }, meta: { create: true, provisionalId } });
const moveInto = (provinceId, toStateId, fromStateId) => ({ url: "/api/map/move-province", body: { provinceId, toStateId }, meta: { fromStateId } });

/** 💾 Save through the page's own flushMapSaves. Returns every status line, the final one, and each write's answer. */
async function save(srv, mod, writes, states) {
  const statuses = [];
  const answers = [];
  const sb = {
    console, JSON, encodeURIComponent,
    pendingWrites: writes.slice(), paintDiff: new Map(), statusEl: { style: {} },
    stateById: new Map(states.map((s) => [s.id, s])), model: { states: states.slice() },
    stagedRiverEdits: [], riversShow: false, undoStack: [], redoStack: [], historyLabels: [], saveGeneration: 0,
    baseImageData: null, baseImageDataPristine: null,
    setStatus: (s) => { statuses.push(String(s)); }, setMapDirty: () => {}, updateSaveButton: () => {}, modPath: () => mod,
    isVanillaTarget: () => false, problemsPanelOpen: () => false, refreshProblems: () => {}, renderCheckpoints: () => {},
    buildPidGrid: () => {}, computeCentroids: () => {}, recolorAll: () => {}, draw: () => {}, loadRiversOverlay: () => {},
    stateFormDirty: () => false, stateFormBaseline: null, stageStateWrite: () => {},
    remapQueuedStateId: () => {}, remapLocalStateId: () => {}, provincesBmpNote: () => "", riversPaintNote: () => "", heightmapNote: () => "",
    adoptMergeRegions: () => {}, openMapErrorsModal: () => {}, saveMapBackup: () => {}, updateUndoButtons: () => {},
    $: () => null, window: { NovaMapRuleLabels: labels },
    fetch: async (url, opts) => {
      const r = await fetch(srv.base + url, opts);
      if (String(url).indexOf("/api/map/validate") !== 0) { try { answers.push({ url, body: opts && opts.body ? JSON.parse(opts.body) : null, res: await r.clone().json() }); } catch (_) {} }
      return r;
    },
  };
  sb.globalThis = sb;
  vm.createContext(sb);
  vm.runInContext(Object.values(PIECES).join("\n") + "\nglobalThis.__run = flushMapSaves;", sb);
  await sb.__run();
  return { statuses, last: statuses[statuses.length - 1] || "", answers, sb };
}

(async () => {
  let srv = null;
  try {
    console.log("0. The page's code and requests, as this test runs them");
    rec("flushMapSaves and the helpers it calls were lifted out of public/map.js",
      Object.values(PIECES).every((s) => s.length > 20) && PIECES.flush.length > 500, Object.fromEntries(Object.entries(PIECES).map(([k, v]) => [k, v.length])));
    rec("the page queues \"+ New state\" as create-state { name: \"\", owner } with no provinces",
      /queueWrite\("\/api\/map\/create-state", \{ name: "", owner \}, \{ create: true, provisionalId: provId \}\)/.test(MASKED));
    rec("…and a province click as move-province { provinceId, toStateId }",
      /queueWrite\("\/api\/map\/move-province", \{ provinceId, toStateId \}, \{ fromStateId(?: \}\)|, )/.test(MASKED)); // (the meta carries the click's dockyards too: #a-moved-coast-takes-its-dockyards)
    srv = await L2.startServer(createApp);

    console.log("\n1. ⛔ \"+ New state\", a Fill click taken back with Undo, then 💾 Save (T2): the only staged write is the unfilled create");
    {
      const mod = world.mod("Discard Only", {});
      const before = L2.tree(mod);
      const s = await save(srv, mod, [newState("", -1)], [{ id: -1, name: "STATE_new1", displayName: "New state 1", provinces: [] }]);
      rec("THE CONTROL: nothing was posted and nothing was written", s.answers.length === 0 && L2.written(before, L2.tree(mod)).length === 0, { answers: s.answers.map((a) => a.url), written: L2.written(before, L2.tree(mod)) });
      rec("THE CONTROL: the unfilled state left the page's model", !s.sb.stateById.has(-1) && s.sb.model.states.length === 0, s.sb.model.states);
      rec("⭐⭐⭐ the final line says the new state was discarded", /Discarded 1 new state with no provinces/.test(s.last), s.last);
      rec("⭐⭐ …why, and what to do about it", /HOI4 will not start a game with an empty state/.test(s.last) && /click provinces on the map to fill it/.test(s.last), s.last);
      rec("⭐ …and that there was nothing else to save", /[Nn]othing (else )?to save/.test(s.last), s.last);
    }

    console.log("\n2. ⛔ The unfilled create plus a province moved between two states, then 💾 Save");
    {
      const mod = world.mod("Discard And Save", {});
      const s = await save(srv, mod, [newState("AAA", -1), moveInto(5, 3, 2)],
        [{ id: -1, name: "STATE_new1", displayName: "New state 1", provinces: [] }, { id: 2, name: "STATE_2", provinces: [2, 5] }, { id: 3, name: "STATE_3", provinces: [3] }]);
      const moved = s.answers.find((a) => a.url === "/api/map/move-province");
      rec("THE ANSWER: the move was posted and saved; the create never was", !!moved && moved.res.ok === true && !s.answers.some((a) => a.url === "/api/map/create-state"), s.answers.map((a) => [a.url, a.res && (a.res.error || a.res.ok)]));
      rec("THE CONTROL: the final line is the Save report", /Saved 1 change/.test(s.last), s.last);
      rec("⭐⭐⭐ …and it still says the new state was discarded, and why", /Discarded 1 new state with no provinces/.test(s.last) && /HOI4 will not start a game with an empty state/.test(s.last), s.last);
    }

    console.log("\n3. ⛔ A write naming a new state that was discarded (an orphan), plus a province move, then 💾 Save");
    {
      const mod = world.mod("Orphan And Save", {});
      const s = await save(srv, mod, [moveInto(4, -7, 1), moveInto(5, 3, 2)],
        [{ id: 1, name: "STATE_1", provinces: [4] }, { id: 2, name: "STATE_2", provinces: [2, 5] }, { id: 3, name: "STATE_3", provinces: [3] }]);
      const posted = s.answers.map((a) => a.body && a.body.toStateId);
      rec("THE ANSWER: only the move to a real state was posted, and it saved", posted.join() === "3" && s.answers[0].res.ok === true, s.answers.map((a) => [a.url, a.body, a.res && (a.res.error || a.res.ok)]));
      rec("⭐⭐⭐ the final line still says the orphaned change was dropped, and why", /Dropped 1 unsaved change that pointed at a new state you discarded/.test(s.last) && /Saved 1 change/.test(s.last), s.last);
    }

    console.log("\n3b. ⛔ (review T14) A new state filled and emptied with Auto-fix off, then 💾 Save: the create is purged, and the fill that named it goes with it in the same Save");
    {
      // the orphan purge ran first, while the create was still queued, so the fill went out and the Save stopped at "State -1 not found"; only the next Save worked
      const mod = world.mod("Emptied New State", {});
      const s = await save(srv, mod, [newState("AAA", -1), moveInto(5, -1, 2), moveInto(5, 3, -1)],
        [{ id: -1, name: "STATE_new1", displayName: "New state 1", provinces: [] }, { id: 2, name: "STATE_2", provinces: [2] }, { id: 3, name: "STATE_3", provinces: [3, 5] }]);
      rec("⭐⭐⭐ the first Save goes through: only the move to a real state is posted", s.answers.map((a) => [a.url, a.body && a.body.toStateId, a.res && a.res.ok]).join("|") === ["/api/map/move-province", 3, true].join() && /Saved 1 change/.test(s.last) && !/stopped/i.test(s.last), { answers: s.answers.map((a) => [a.url, a.body, a.res && (a.res.error || a.res.ok)]), last: s.last });
      rec("⭐⭐ …and its line says both what it discarded and what it dropped", /Discarded 1 new state with no provinces/.test(s.last) && /Dropped 1 unsaved change that pointed at a new state you discarded/.test(s.last), s.last);
    }

    console.log("\n4. THE CONTROL: a Save that discards nothing says nothing about discarding");
    {
      const mod = world.mod("Plain Save", {});
      const s = await save(srv, mod, [moveInto(5, 3, 2)], [{ id: 2, name: "STATE_2", provinces: [2, 5] }, { id: 3, name: "STATE_3", provinces: [3] }]);
      rec("the move saved", s.answers.length === 1 && s.answers[0].res.ok === true, s.answers.map((a) => a.res));
      rec("⭐ …and the final line mentions no discarded state and no dropped change", /Saved 1 change/.test(s.last) && !/Discarded|Dropped/.test(s.last), s.last);
      const nothing = await save(srv, mod, [], []);
      rec("⭐ an empty Save still says just \"Nothing to save.\"", nothing.last === "Nothing to save.", nothing.last);
    }
  } catch (e) {
    rec("harness threw: " + (e && e.stack ? e.stack.split("\n").slice(0, 6).join(" | ") : e), false);
  } finally {
    if (srv) srv.close();
    world.cleanup();
    console.log(`\n=== a save still says what it discarded from the queue: ${checks} checks, ${fails.length} failed ===`);
    fails.forEach((f) => console.log("   FAILED: " + f));
    process.exitCode = fails.length ? 1 : 0;
  }
})();
