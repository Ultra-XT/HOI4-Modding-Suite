// Erasing the coastal province a state's only air base or rocket site stood on gives the state that site back, on the land it keeps.
// #erasing-a-coast-keeps-its-states-sites
//
// THE DEFECT (discovery F19, verified on 790cb21 and again on c093c16). Erase (the brush, or the inspector's land -> sea, which
// delegates to it) queues flip-province-sea. flipProvinceToSea calls fixWaterSupplyRail({ waterIds }), whose buildings.txt pass
// drops every row standing on the erased province — site rows included — and nothing put the site back. A state whose only
// air_base or rocket_site_spawn row stood there was left with none: state_no_air_base_or_rocket_site, FATAL, Save stops with
// "HOI4 refuses to load this map". Measured on c093c16 against the installed game, in a fresh mod: erasing coastal province 7361
// dropped 13 stranded rows, and findStatesWithoutSites then reported { stateId: 464, missing: ["air_base"] } — Nova Scotia's
// only air base (vanilla buildings.txt line 10128) was gone. Discovery census: 360 of vanilla's 1,013 multi-land states can hit it.
//
// A province move already had the repair: rekeyBuildingAnchorsForProvince reports the site rows it takes (sitesTaken) and
// giveMovedStatesTheirSites gives a state that lost its only usable site that type back at its own anchor. The erase never
// adopted it. Now fixWaterSupplyRail reports the site rows its erase pass drops the same way, flipProvinceToSea hands them to
// giveMovedStatesTheirSites, and the Save line says what was placed and why.
//
// Run as the page runs it: flushMapSaves, mapCrashGate, markSaveBoundary and blankAdjacencyNote are lifted out of public/map.js
// into a sandbox whose fetch is the real server of testlib-two-layer-map.js, with the body eraseProvinceLocal queues. The world:
// state 2 = { 2 (coastal) 5 (inland) }, its air base, rocket site and naval base spawn all standing on province 2.
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

const world = lib.makeWorld("b11-erase-sites");
const { createApp } = require("./server.js");
const labels = require("./public/map-rule-labels.js");
const RULE = "state_no_air_base_or_rocket_site";
const SITES = ["air_base", "rocket_site_spawn"];

const MAP = require("./testlib-map-page.js").readSource("public", "map.js");   // LF whatever the checkout: #a-lift-reads-lf
const MASKED = maskJsComments(MAP);
const grab = (needle, endNeedle) => { const s = MASKED.indexOf(needle); if (s < 0) return ""; const e = MASKED.indexOf(endNeedle, s); return e < 0 ? "" : MAP.slice(s, e + endNeedle.length); };
const FLUSH = grab("async function flushMapSaves", "} finally { if (btn) btn.disabled = false; updateSaveButton(); }\n  }");
const GATE = grab("async function mapCrashGate", "\n  }");
const MARK = grab("function markSaveBoundary", "\n  }");
const NOTE = grab("function blankAdjacencyNote", "\n  }");
const COAST = grab("function coastRowsNote", "\n  }");   // #a-harbour-keeps-facing-its-sea — the Save line says what the erase turned beside it
// ⚠️ MOVED WITH 🌍 Generate a world: the Save loop's "The drowned land took … with it" sentence is drownedLandNote(sr) now, which the
// world's account of its Delete map step says in the same words — an erase that takes a supply hub or railway with it reaches it
const DROWNED = grab("function drownedLandNote", "\n  }");
const fieldsMatch = /const STATE_ID_FIELDS = \[([^\]]*)\]/.exec(MASKED);
const STATE_ID_FIELDS = fieldsMatch ? [...fieldsMatch[1].matchAll(/"([A-Za-z]+)"/g)].map((m) => m[1]) : [];

/** flushMapSaves itself, over the real server. Returns the status line and every write's answer. */
async function saveThroughThePage(srv, mod, writes, states) {
  let status = "";
  const answers = [];
  const sandbox = {
    console, JSON, encodeURIComponent,
    pendingWrites: writes.slice(),
    paintDiff: new Map(), statusEl: { style: {} }, stateById: new Map((states || []).map((s) => [s.id, s])), model: { states: states || [] },
    stagedRiverEdits: [], undoStack: [], redoStack: [], historyLabels: [], saveGeneration: 0, baseImageData: null, baseImageDataPristine: null,
    setStatus: (s) => { status = String(s); }, setMapDirty: () => {}, updateSaveButton: () => {}, modPath: () => mod,
    isVanillaTarget: () => false, problemsPanelOpen: () => false, refreshProblems: () => {}, renderCheckpoints: () => {},
    buildPidGrid: () => {}, computeCentroids: () => {}, recolorAll: () => {}, draw: () => {}, loadRiversOverlay: () => {},
    orphanedQueuedWrites: () => [], emptyNewStateWrites: () => [], stateFormDirty: () => false, stateFormBaseline: null,
    stageStateWrite: () => {}, remapQueuedStateId: () => {}, remapLocalStateId: () => {}, provincesBmpNote: () => "", riversPaintNote: () => "", heightmapNote: () => "", STATE_ID_FIELDS,
    adoptMergeRegions: () => {}, openMapErrorsModal: () => {}, saveMapBackup: () => {}, updateUndoButtons: () => {},
    rebuildStagedRiversFromPending: () => {}, $: () => null, window: { NovaMapRuleLabels: labels }, provinceDef: new Map(),
    fetch: async (url, opts) => {
      const r = await fetch(srv.base + url, opts);
      if (String(url).indexOf("/api/map/validate") !== 0) { try { answers.push({ url, body: opts && opts.body ? JSON.parse(opts.body) : null, res: await r.clone().json() }); } catch (_) {} }
      return r;
    },
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(`${MARK}\n${GATE}\n${NOTE}\n${COAST}\n${DROWNED}\n${FLUSH}\nglobalThis.__run = flushMapSaves;`, sandbox);
  await sandbox.__run();
  return { status, answers };
}

// The province a buildings.txt row stands on: floor(x), and the row buildingZToPixelY gives (H - 1 - floor(z)) on the 256x256 map.
const provinceUnder = (row) => { const c = row.split(";"); return lib.provAt(Math.floor(parseFloat(c[2])), 256 - 1 - Math.floor(parseFloat(c[4]))); };
const rowsOf = (mod) => fs.readFileSync(path.join(mod, "map", "buildings.txt"), "utf8").split(/\r?\n/).filter((l) => l.trim());
const erase = (provinceId) => ({ url: "/api/map/flip-province-sea", body: { provinceId }, meta: {} });
const STATES = [{ id: 2, name: "STATE_2", displayName: "Bee", provinces: [2, 5] }, { id: 3, name: "STATE_3", displayName: "Cee", provinces: [3] }];

(async () => {
  let srv = null;
  try {
    console.log("0. The page's code and request, and the world, as this test runs them");
    rec("flushMapSaves, mapCrashGate, markSaveBoundary, blankAdjacencyNote and coastRowsNote lifted out of public/map.js",
      FLUSH.length > 500 && GATE.length > 300 && MARK.length > 80 && NOTE.length > 200 && COAST.length > 300 && DROWNED.length > 200, [FLUSH.length, GATE.length, MARK.length, NOTE.length, COAST.length, DROWNED.length]);
    rec("the Erase brush queues flip-province-sea { provinceId }", /queueWrite\("\/api\/map\/flip-province-sea", \{ provinceId: pid \}\)/.test(MASKED));
    const gameSites2 = lib.BUILD.filter((r) => r.startsWith("2;") && SITES.includes(r.split(";")[1]));
    rec("the world: state 2's only air base and rocket site both stand on province 2, which is coastal land",
      gameSites2.length === 2 && gameSites2.every((r) => provinceUnder(r) === 2) && /^2;200;0;0;land;true;/.test(lib.DEF_ROWS[2]), gameSites2.map((r) => [r, provinceUnder(r)]));

    srv = await lib.startServer(createApp);

    console.log("\n1. ⛔ Erase province 2, then Save — the state keeps an air base and a rocket site");
    {
      const mod = world.mod("Erase Site", {});
      const v0 = await srv.validate(mod);
      rec("before the erase no state lacks an air base or rocket site", !lib.idsOf(v0, RULE).length, lib.idsOf(v0, RULE));
      const s = await saveThroughThePage(srv, mod, [erase(2)], STATES);
      const a = s.answers.find((x) => x.url === "/api/map/flip-province-sea");
      rec("the Save posted the erase and it answered ok", !!a && a.res.ok === true && a.res.changed === true, s.answers.map((x) => [x.url, x.res && (x.res.error || x.res.ok)]));
      rec("the erase took the buildings standing on province 2 (3 rows)", !!a && a.res.supplyRail && a.res.supplyRail.strandedRemoved === 3, a && a.res.supplyRail);
      const back = ((a && a.res.buildingSites && a.res.buildingSites.placed) || []).find((p) => p.stateId === 2);
      rec("THE ANSWER: the erase gave state 2 back an air base and a rocket site", !!back && Array.isArray(back.types) && SITES.every((t) => back.types.includes(t)), a && a.res.buildingSites);
      const v1 = await srv.validate(mod);
      rec("⭐⭐⭐ Map Errors reports no state without an air base or rocket site", !lib.idsOf(v1, RULE).length, ((v1 && v1.problems) || []).filter((p) => p.rule === RULE));
      const gate = await lib.saveGate(v1);
      rec("⭐⭐⭐ …and the Save gate stops for nothing", gate.crashes === 0, { crashes: gate.crashes, rules: lib.rulesIn(v1) });
      const rows = rowsOf(mod).filter((r) => r.startsWith("2;"));
      const of = (t) => rows.filter((r) => r.split(";")[1] === t);
      rec("⭐⭐ state 2 has exactly one air base row and one rocket site row", of("air_base").length === 1 && of("rocket_site_spawn").length === 1, rows);
      const placedRows = [...of("air_base"), ...of("rocket_site_spawn")];
      rec("⭐⭐⭐ …each standing on province 5, the land it kept", placedRows.length === 2 && placedRows.every((r) => provinceUnder(r) === 5), rows.map((r) => [r, provinceUnder(r)]));
      rec("⭐⭐ …and nothing else was added for state 2: only the types it lost", rows.length === 2 && rows.every((r) => SITES.includes(r.split(";")[1])), rows);
      rec("⭐⭐⭐ the Save line says Bee got its air base and rocket site back", /\bBee\b/.test(s.status) && /air base/.test(s.status) && /rocket site/.test(s.status) && /building position/.test(s.status), s.status);
      rec("⭐⭐ …that it lost them with the province erased to sea, not with a move", /province 2, erased to sea/.test(s.status) && !/province that moved/.test(s.status), s.status);
      rec("⭐⭐ …and that the new rows stand on the land it kept", /land it kept/i.test(s.status), s.status);
      const af = await srv.autoFix(mod);
      const ss = (af.body && af.body.fixes && af.body.fixes.stateSites) || {};
      rec("⚠️ a later Auto-fix has no site left to give state 2", af.status === 200 && !(ss.states || []).includes(2), ss);
    }

    console.log("\n2. THE CONTROL: state 2's sites stand on province 5 — erasing coastal province 2 places nothing");
    {
      const own = lib.BUILD.map((r) => (/^2;(air_base|rocket_site_spawn);/.test(r) ? r.replace("64.00;9.50;95.00", "64.00;9.50;35.00") : r));
      const mod = world.mod("Erase No Site", { "map/buildings.txt": own.join("\n") });
      const siteRows = own.filter((r) => r.startsWith("2;") && SITES.includes(r.split(";")[1]));
      rec("the control's state 2 sites stand on province 5", siteRows.length === 2 && siteRows.every((r) => provinceUnder(r) === 5), siteRows.map((r) => [r, provinceUnder(r)]));
      const s = await saveThroughThePage(srv, mod, [erase(2)], STATES);
      const a = s.answers.find((x) => x.url === "/api/map/flip-province-sea");
      rec("the erase answered ok", !!a && a.res.ok === true, a && a.res);
      rec("THE ANSWER: nothing was placed", !!a && !((a.res.buildingSites || {}).placed || []).length, a && a.res.buildingSites);
      const rows = rowsOf(mod);
      rec("⚠️ state 2's two site rows are still there as written, and no other site row was added", siteRows.every((r) => rows.includes(r)) && rows.filter((r) => r.startsWith("2;") && SITES.includes(r.split(";")[1])).length === 2, rows.filter((r) => r.startsWith("2;")));
      const v = await srv.validate(mod);
      rec("⚠️ no state lacks a site", !lib.idsOf(v, RULE).length, lib.idsOf(v, RULE));
      rec("⚠️ …and the Save line says nothing about building positions", !/building position/i.test(s.status), s.status);
    }

    console.log("\n3. State 2 also has an air base on province 5 — the erase gives back only the rocket site it lost");
    {
      const mod = world.mod("Erase One Site", { "map/buildings.txt": lib.BUILD.concat(["2;air_base;64.00;9.50;35.00;0.00;0"]).join("\n") });
      const s = await saveThroughThePage(srv, mod, [erase(2)], STATES);
      const a = s.answers.find((x) => x.url === "/api/map/flip-province-sea");
      const back = ((a && a.res.buildingSites && a.res.buildingSites.placed) || []).find((p) => p.stateId === 2);
      rec("THE ANSWER: state 2 got back the rocket site and only that", !!back && JSON.stringify(back.types) === JSON.stringify(["rocket_site_spawn"]), a && a.res.buildingSites);
      const rows = rowsOf(mod).filter((r) => r.startsWith("2;"));
      rec("⭐⭐ state 2 keeps its one air base on province 5, and has one rocket site there too",
        JSON.stringify(rows.map((r) => [r.split(";")[1], provinceUnder(r)]).sort()) === JSON.stringify([["air_base", 5], ["rocket_site_spawn", 5]]), rows);
      const v = await srv.validate(mod);
      rec("⭐⭐ no state lacks a site", !lib.idsOf(v, RULE).length, lib.idsOf(v, RULE));
    }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 12).join("\n") : e);
    fails.push("harness error");
  } finally {
    if (srv) srv.close();
    world.cleanup();
  }
  console.log(`\n=== erasing a coast gives its state back the air base and rocket site: ${checks} checks, ${fails.length} failed ===`);
  if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
})();
