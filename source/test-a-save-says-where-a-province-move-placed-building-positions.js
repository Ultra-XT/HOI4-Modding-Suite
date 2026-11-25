// A Save says which building positions Nova placed for a province move, on the same line it names air wings and capitals.
// #a-save-says-where-a-province-move-placed-building-positions
//
// THE DEFECT (batch 9 sites, risk noted with #a-province-move-keeps-every-state-its-sites). move-province and create-state now
// write map/buildings.txt rows the modder never drew: a move that fills an empty "+ New state" gets the standard set of
// building positions (about 30 rows), and a move that takes a source state's only air base or rocket site puts one back at
// that state's anchor — not where the old row stood. Both answer with a `buildingSites` field ({ placed: [{ stateId, added,
// types }], failed }), and public/map.js's flushMapSaves read airWingWarning, capitalWarning, fileWarning and the rest from
// each answer but never buildingSites, so nothing on the Save line said a file had gained rows or where they went.
//
// MEASURED on 790cb21 by running the page's own flushMapSaves (below) over the real server: "+ New state" then a click on
// province 5 answered buildingSites.placed [{ stateId: <new>, types: "standard" }], and the Save line said nothing of it.
//
// Run as the page runs it: flushMapSaves, mapCrashGate, markSaveBoundary and blankAdjacencyNote (and the four helpers the
// flush calls for a first fill's carve and a capital a write names) are lifted out of public/map.js into a sandbox whose
// fetch is the real server of testlib-two-layer-map.js, and the queued writes are the bodies public/map.js queues
// ("+ New state" and a Fill click). The response bodies are read before the status line.
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const lib = require("./testlib-two-layer-map.js");
const { maskJsComments } = require("./testlib-strip-comments.js");

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (ok || detail == null ? "" : "   -> " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 900)));
  if (!ok) fails.push(label);
};

const world = lib.makeWorld("b10-sites-note");
const { createApp } = require("./server.js");
const labels = require("./public/map-rule-labels.js");

const MAP = require("./testlib-map-page.js").readSource("public", "map.js");   // LF whatever the checkout: #a-lift-reads-lf
const MASKED = maskJsComments(MAP);
const grab = (needle, endNeedle) => { const s = MASKED.indexOf(needle); if (s < 0) return ""; const e = MASKED.indexOf(endNeedle, s); return e < 0 ? "" : MAP.slice(s, e + endNeedle.length); };
const FLUSH = grab("async function flushMapSaves", "} finally { if (btn) btn.disabled = false; updateSaveButton(); }\n  }");
const GATE = grab("async function mapCrashGate", "\n  }");
const MARK = grab("function markSaveBoundary", "\n  }");
const NOTE = grab("function blankAdjacencyNote", "\n  }");
// …and what flushMapSaves calls for a move that fills an empty "+ New state" (the carve's identity, category and people:
// #a-new-state-is-carved-like-a-split) and for a capital a write names (#a-capital-state-keeps-a-victory-point)
const HELPERS = ["function firstLandNote", "function adoptFirstLand", "function capitalTownNotes", "function adoptCapitalTown"].map((n) => grab(n, "\n  }"));
const fieldsMatch = /const STATE_ID_FIELDS = \[([^\]]*)\]/.exec(MASKED);
const STATE_ID_FIELDS = fieldsMatch ? [...fieldsMatch[1].matchAll(/"([A-Za-z]+)"/g)].map((m) => m[1]) : [];

// The page's two bodies, as public/map.js queues them ("+ New state", then a province click in Fill mode).
const newState = (owner, provisionalId) => ({ url: "/api/map/create-state", body: { name: "", owner }, meta: { create: true, provisionalId } });
const moveInto = (provinceId, toStateId, fromStateId) => ({ url: "/api/map/move-province", body: { provinceId, toStateId }, meta: { fromStateId } });

/** flushMapSaves itself, over the real server. Returns the status line and every write's answer. */
async function saveThroughThePage(srv, mod, writes, states) {
  let status = "";
  const answers = [];
  const sandbox = {
    console, JSON, encodeURIComponent,
    pendingWrites: writes.slice(),
    paintDiff: new Map(), statusEl: { style: {} }, stateById: new Map((states || []).map((s) => [s.id, s])), model: { states: states || [] }, provinceToOwner: {},
    stagedRiverEdits: [], undoStack: [], redoStack: [], historyLabels: [], saveGeneration: 0, baseImageData: null, baseImageDataPristine: null,
    setStatus: (s) => { status = String(s); }, setMapDirty: () => {}, updateSaveButton: () => {}, modPath: () => mod,
    isVanillaTarget: () => false, problemsPanelOpen: () => false, refreshProblems: () => {}, renderCheckpoints: () => {},
    buildPidGrid: () => {}, computeCentroids: () => {}, recolorAll: () => {}, draw: () => {}, loadRiversOverlay: () => {},
    orphanedQueuedWrites: () => [], emptyNewStateWrites: () => [], stateFormDirty: () => false, stateFormBaseline: null,
    stageStateWrite: () => {}, remapQueuedStateId: () => {}, remapLocalStateId: () => {}, provincesBmpNote: () => "", riversPaintNote: () => "", heightmapNote: () => "", STATE_ID_FIELDS,
    adoptMergeRegions: () => {}, openMapErrorsModal: () => {}, saveMapBackup: () => {}, updateUndoButtons: () => {},
    rebuildStagedRiversFromPending: () => {}, $: () => null, window: { NovaMapRuleLabels: labels },
    fetch: async (url, opts) => {
      const r = await fetch(srv.base + url, opts);
      if (String(url).indexOf("/api/map/validate") !== 0) { try { answers.push({ url, body: opts && opts.body ? JSON.parse(opts.body) : null, res: await r.clone().json() }); } catch (_) {} }
      return r;
    },
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(`${MARK}\n${GATE}\n${NOTE}\n${HELPERS.join("\n")}\n${FLUSH}\nglobalThis.__run = flushMapSaves;`, sandbox);
  await sandbox.__run();
  return { status, answers };
}

(async () => {
  let srv = null;
  try {
    console.log("0. The page's code and requests, as this test runs them");
    rec("flushMapSaves, mapCrashGate, markSaveBoundary and blankAdjacencyNote lifted out of public/map.js",
      FLUSH.length > 500 && GATE.length > 300 && MARK.length > 80 && NOTE.length > 200, [FLUSH.length, GATE.length, MARK.length, NOTE.length]);
    rec("…with firstLandNote, adoptFirstLand, capitalTownNotes and adoptCapitalTown, which it calls", HELPERS.every((h) => h.length > 200), HELPERS.map((h) => h.length));
    rec("the page queues \"+ New state\" as create-state { name: \"\", owner } with no provinces",
      /queueWrite\("\/api\/map\/create-state", \{ name: "", owner \}, \{ create: true, provisionalId: provId \}\)/.test(MASKED));
    rec("…and a province click as move-province { provinceId, toStateId }",
      /queueWrite\("\/api\/map\/move-province", \{ provinceId, toStateId \}, \{ fromStateId(?: \}\)|, )/.test(MASKED)); // (the meta carries the click's dockyards too: #a-moved-coast-takes-its-dockyards)
    rec("STATE_ID_FIELDS is read out of public/map.js and maps toStateId", STATE_ID_FIELDS.includes("toStateId"), STATE_ID_FIELDS);

    srv = await lib.startServer(createApp);

    console.log("\n1. ⛔ \"+ New state\", click province 5, Save — the Save line says the new state was given its building positions");
    {
      const mod = world.mod("Note New State", {});
      const s = await saveThroughThePage(srv, mod, [newState("AAA", -1), moveInto(5, -1, 2)], [{ id: -1, name: "STATE_new1", displayName: "New state 1", provinces: [] }]);
      const created = s.answers.find((a) => a.url === "/api/map/create-state");
      const moved = s.answers.find((a) => a.url === "/api/map/move-province");
      rec("the Save posted both writes and both answered ok", !!created && !!moved && created.res.ok === true && moved.res.ok === true, s.answers.map((a) => [a.url, a.res && (a.res.error || a.res.ok)]));
      const id = created && created.res.id;
      rec("the move went to the created state's real id, as the page maps it", !!moved && moved.body.toStateId === id, moved && moved.body);
      const placed = ((moved && moved.res.buildingSites && moved.res.buildingSites.placed) || []).find((p) => p.stateId === id);
      rec("THE ANSWER: move-province placed the standard building positions for the new state", !!placed && placed.types === "standard" && placed.added > 0, moved && moved.res.buildingSites);
      rec("⭐⭐⭐ the Save line says building positions were added for that state", !!placed && /building position/i.test(s.status) && new RegExp(`\\b${id}\\b`).test(s.status), s.status);
      rec("⭐⭐ …how many, and in which file", !!placed && s.status.indexOf(String(placed.added)) !== -1 && /map\/buildings\.txt/.test(s.status), s.status);
    }

    console.log("\n2. ⛔ \"+ New state\", click province 2 (where state 2's air base and rocket site stand), Save — the Save line says state 2 got them back");
    {
      const mod = world.mod("Note Source State", {});
      const s = await saveThroughThePage(srv, mod, [newState("AAA", -1), moveInto(2, -1, 2)], [{ id: -1, name: "STATE_new1", displayName: "New state 1", provinces: [] }, { id: 2, name: "STATE_2", displayName: "Bee", provinces: [2, 5] }]);
      const moved = s.answers.find((a) => a.url === "/api/map/move-province");
      const back = ((moved && moved.res.buildingSites && moved.res.buildingSites.placed) || []).find((p) => p.stateId === 2);
      rec("THE ANSWER: move-province gave state 2 back the site types it took", !!back && Array.isArray(back.types) && back.types.length > 0, moved && moved.res.buildingSites);
      rec("⭐⭐⭐ the Save line names state 2 and what it got back", !!back && /\bBee\b/.test(s.status) && back.types.every((t) => s.status.indexOf(t === "air_base" ? "air base" : "rocket site") !== -1), s.status);
      rec("⭐⭐ …and says the rows stand on the land it kept, not where the old ones stood", !!back && /land it kept/i.test(s.status), s.status);
    }

    console.log("\n3. THE CONTROL: a move between two states that keep their sites says nothing about building positions");
    {
      const mod = world.mod("Note Plain Move", {});
      const s = await saveThroughThePage(srv, mod, [moveInto(5, 3, 2)], [{ id: 2, name: "STATE_2", provinces: [2, 5] }, { id: 3, name: "STATE_3", provinces: [3] }]);
      const moved = s.answers.find((a) => a.url === "/api/map/move-province");
      rec("THE ANSWER: nothing was placed", !!moved && moved.res.ok === true && !((moved.res.buildingSites || {}).placed || []).length, moved && moved.res);
      rec("⭐⭐ …and the Save line says nothing about building positions", !/building position/i.test(s.status), s.status);
    }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 12).join("\n") : e);
    fails.push("harness error");
  } finally {
    if (srv) srv.close();
    world.cleanup();
  }
  console.log(`\n=== a save says where a province move placed building positions: ${checks} checks, ${fails.length} failed ===`);
  if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
})();
