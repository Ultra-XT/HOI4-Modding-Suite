// The province inspector's Type dropdown shows what the province BECAME, not what was asked for.
// #a-lake-the-inspector-says-it-made
//
// THE DEFECT. The dropdown offers land / sea / lake. A land → water change is delegated to the Erase path
// (#province-type-makes-a-sea-inside-a-state), which queues /api/map/flip-province-sea WITH NO waterType —
// and the endpoint deliberately refuses to forward one from the page, because an explicit waterType bypasses
// the coastal check that stops an inland province becoming an isolated sea or lake (the gamestate
// divide-by-zero). So picking "lake" on land LANDS AS SEA. The refused branch beside it already puts the
// dropdown back "so it keeps showing what the province actually IS"; the converted branch resynced the
// terrain box and the coastal box — the two the modder did NOT touch — and left the Type box reading "lake".
//
// 📊 MEASURED 2026-09-17 by running the page's own saveProvinceTerrain, eraseProvinceLocal, queueWrite and
// flushMapSaves against a real in-process server (this test's own rig): picking "lake" on coastal land
// province 2 queued { url: "/api/map/flip-province-sea", body: { provinceId: 2 } }, wrote
// `2;200;0;0;sea;false;ocean;0` to definition.csv, and left miTypeSel reading "lake" — before the Save and
// after it. The status line said "🧹 Erased 1 coastal province to sea", so the one control the modder had
// just used was the only thing on screen still claiming a lake.
//
// AND THE ROUTE TO A LAKE IS REAL, so the line names it: from SEA the same dropdown is a water → water
// retype that never goes near the erase path, and setProvinceDefinition writes `lake` on `lakes`. Section 3
// runs that follow-up and reads the row off disk — a message that told the modder to do something that did
// not work would be worse than the silence it replaces.
//
// Run: node test-a-lake-the-inspector-says-it-made.js
"use strict";

const fs = require("fs");
const path = require("path");

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (ok || detail == null ? "" : "   -> " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 400)));
  if (!ok) fails.push(label);
};

const L2 = require("./testlib-two-layer-map.js");
const world = L2.makeWorld("inspector-lake");   // before server.js: it reads HOI4_MODS_ROOT when it loads
const P = require("./testlib-map-page.js");
const { createApp } = require("./server.js");

// The mod's own terrain table, so "which terrains are water" is read from a file as on a real mod.
const TERRAIN = ["categories = {", "\tunknown = { color = { 255 0 0 } }",
  "\tocean = { naval_terrain = yes color = { 40 83 176 } is_water = yes }",
  "\tlakes = { color = { 58 91 255 } is_water = yes }", "\tplains = { color = { 255 129 66 } }",
  "\tforest = { color = { 89 199 85 } }", "}", ""].join("\n");

const defCols = (mod, id) => ((fs.readFileSync(path.join(mod, "map", "definition.csv"), "utf8").split(/\r?\n/).find((l) => l.split(";")[0] === String(id)) || "").split(";"));

// ⚠️ public/map.js is CRLF in some checkouts and LF in others (core.autocrlf, no .gitattributes — CLAUDE.md
// §"Line endings differ per file"). testlib-map-page's default end anchor is a bare "\n  }", so the anchors
// here are built from the file's OWN line ending and this test lifts the same text either way.
const EOL = P.MAP.indexOf("\r\n") !== -1 ? "\r\n" : "\n";
const END = EOL + "  }";
const FUNCTIONS = [
  ["function queueWrite(", END], ["async function saveProvinceTerrain()", END],
  ["function eraseProvinceLocal(", END], ["function moveProvinceLevels(", END], ["function beginEraseStroke(", END], ["function commitEraseStroke(", END],
  ["async function flushMapSaves", "} finally { if (btn) btn.disabled = false; updateSaveButton(); }" + END],
  ["function orphanedQueuedWrites(", END], ["function emptyNewStateWrites(", END], ["function markSaveBoundary(", END],
  ["async function mapCrashGate(", END], ["function openMapErrorsModal(", END], ["function terrainWriteNotes(", END],
  // (⛔ #a-sea-made-land-takes-the-coast-its-dockyards-stood-on — a sea made a lake asks what coast it takes; this fixture's states hold no dockyard)
  ["function coastsASeaMadeLandTakes(", END], ["function seaMadeLandNavalWords(", END], ["function stateNavalLevels(", END], ["function navalLevelsWords(", END], ["const NAVAL_ONLY_STATE_KEYS =", ";"],
];

/** The inspector, mounted over a real mod: the page's own handlers, the real server, a fake DOM. */
function mount(srv, MOD, model) {
  const provinceDef = new Map((model.provinces || []).map((p) => [p.id, Object.assign({}, p)]));
  const provinceType = new Map((model.provinces || []).map((p) => [p.id, p.type]));
  const requests = [], els = {};
  const el = (id, props) => { els[id] = Object.assign(P.element(), props || {}); return els[id]; };
  const page = P.runPage(FUNCTIONS, P.loadGlobals({
    modPath: () => MOD, $: (id) => els[id] || el(id), model, provinceDef, provinceType, selected: null,
    pushUndo: () => {}, computeSeaAdjacency: () => {}, seaAdjacent: new Set([2, 3]),
    erasedThisStroke: new Set(), eraseEmptied: new Set(), eraseSkippedInland: new Set(),
    // the fixture's geography: sea 1 along the top, 2 and 3 its coast, 4 and 5 inland behind them
    provNeighborsCache: new Map([[1, [2, 3]], [2, [1, 3, 5]], [3, [1, 2, 4]], [4, [3, 5]], [5, [2, 4]]]),
    buildProvNeighbors: () => {},
    autoFix: false, draw: () => {}, recolorAll: () => {}, deleteEmptiedStates: () => ({ deleted: [], keptCapitals: [], keptInherited: [] }),
    isVanillaTarget: () => false, stateFormDirty: () => false, stateFormBaseline: null, stageStateWrite: () => {}, stagingStateForm: false,
    remapQueuedStateId: () => {}, remapLocalStateId: () => {}, adoptMergeRegions: () => {}, renderCheckpoints: () => {}, updateSaveButton: () => {},
    STATE_ID_FIELDS: ["stateId", "toStateId", "fromStateId", "sourceStateId", "targetStateId"],
    fetch: async (url, opts) => {
      const res = await fetch(srv.base + String(url), opts);
      const body = await res.json().catch(() => ({}));
      requests.push({ url: String(url).split("?")[0], sent: opts && opts.body ? JSON.parse(opts.body) : null, body });
      return { ok: res.ok, status: res.status, json: async () => body };
    },
  }));
  const d = (id) => provinceDef.get(id) || {};
  // exactly what fillInspector puts in the three controls when a province is selected
  const inspect = (id) => { page.sb.selected = { provinceId: id }; el("miTypeSel", { value: d(id).type }); el("miTerrainSel", { value: d(id).terrain }); el("miCoastalChk", { checked: !!d(id).coastal }); };
  return { page, els, requests, d, inspect, provinceType };
}

(async () => {
  const srv = await L2.startServer(createApp);
  try {
    console.log("1. ⭐⭐⭐ The modder picks LAKE on coastal land, and the dropdown must not go on saying lake");
    const MOD = world.mod("Inspector Lake", { "common/terrain/00_terrain.txt": TERRAIN });
    const model = await fetch(`${srv.base}/api/map/model?modPath=${encodeURIComponent(MOD)}`).then((r) => r.json());
    const m = mount(srv, MOD, model);
    rec("THE CONTROL: 2 is coastal land, 4 is inland land, 1 is the sea they border",
      m.d(2).type === "land" && m.d(2).coastal === true && m.d(4).type === "land" && !m.d(4).coastal && m.d(1).type === "sea",
      [1, 2, 4].map((id) => m.d(id)));
    rec("THE CONTROL: the mod's terrain table declares a `lakes` water category",
      (model.terrainCategories || []).some((c) => c.name === "lakes" && c.water), model.terrainCategories);

    m.inspect(2);
    m.els.miTypeSel.value = "lake";
    await m.page.sb.saveProvinceTerrain();
    const queued = m.page.sb.pendingWrites.map((w) => ({ url: w.url, body: w.body }));
    rec("THE CONTROL: the click delegated to the erase path, which carries no lake",
      queued.length === 1 && queued[0].url === "/api/map/flip-province-sea" && !("waterType" in queued[0].body), queued);
    rec("⭐⭐⭐ the Type dropdown shows what the province BECAME, not what was asked for",
      m.els.miTypeSel.value === "sea", m.els.miTypeSel.value);
    rec("…and the page's own copy of the province agrees", m.d(2).type === "sea" && m.provinceType.get(2) === "sea",
      { def: m.d(2).type, type: m.provinceType.get(2) });
    rec("…the terrain and coastal boxes still follow it too", m.els.miTerrainSel.value === "ocean" && m.els.miCoastalChk.checked === false,
      { terrain: m.els.miTerrainSel.value, coastal: m.els.miCoastalChk.checked });
    const said = m.page.statuses[m.page.statuses.length - 1] || "";
    rec("⭐⭐ the line SAYS the lake became sea, and why", /is SEA, not a lake/.test(said) && /inland/.test(said), { said });
    rec("⭐⭐ …and it names the way to a lake from here", /Set Type to .lake./.test(said), { said });
    rec("…without throwing away what the erase itself reported",
      /Erased 1 coastal province to sea/.test(said) && /unsaved/.test(said), { said });

    console.log("\n2. …and the row Save writes is the sea the dropdown now shows");
    await m.page.sb.flushMapSaves();
    rec("THE CONTROL: Save posted the flip", m.requests.some((r) => r.url === "/api/map/flip-province-sea" && r.body.ok === true),
      m.requests.map((r) => r.url));
    rec("⭐⭐ definition.csv says sea, exactly as the dropdown does", defCols(MOD, 2)[4] === "sea" && m.els.miTypeSel.value === "sea",
      { row: defCols(MOD, 2).join(";"), dropdown: m.els.miTypeSel.value });

    console.log("\n3. ⭐⭐ THE ROUTE THE LINE NAMES REALLY WORKS: sea → lake, from the same dropdown");
    {
      m.els.miTypeSel.value = "lake";
      await m.page.sb.saveProvinceTerrain();
      const q = m.page.sb.pendingWrites.map((w) => ({ url: w.url, body: w.body }));
      rec("the follow-up is a plain retype, not another erase",
        q.length === 1 && q[0].url === "/api/map/set-province-terrain" && q[0].body.type === "lake", q);
      rec("…on a lake terrain, not the sea's ocean", q.length === 1 && q[0].body.terrain === "lakes", q);
      await m.page.sb.flushMapSaves();
      rec("⭐⭐ the row on disk is a lake on `lakes`", defCols(MOD, 2)[4] === "lake" && defCols(MOD, 2)[6] === "lakes", defCols(MOD, 2).join(";"));
      rec("…and the dropdown says lake, because this time it is one", m.els.miTypeSel.value === "lake", m.els.miTypeSel.value);
    }

    console.log("\n4. ⭐ THE NEGATIVE CONTROL: picking SEA claims no substitution");
    {
      const MOD2 = world.mod("Inspector Sea", { "common/terrain/00_terrain.txt": TERRAIN });
      const model2 = await fetch(`${srv.base}/api/map/model?modPath=${encodeURIComponent(MOD2)}`).then((r) => r.json());
      const m2 = mount(srv, MOD2, model2);
      m2.inspect(3);
      m2.els.miTypeSel.value = "sea";
      await m2.page.sb.saveProvinceTerrain();
      const line = m2.page.statuses[m2.page.statuses.length - 1] || "";
      rec("the province really became sea", m2.d(3).type === "sea" && m2.els.miTypeSel.value === "sea", { def: m2.d(3).type, dropdown: m2.els.miTypeSel.value });
      rec("⭐ …and nothing claims a lake was turned into anything", !/not a lake/.test(line), { line });
    }

    console.log("\n5. ⭐ THE OTHER CONTROL: a REFUSED change still puts the dropdown back");
    {
      const MOD3 = world.mod("Inspector Inland", { "common/terrain/00_terrain.txt": TERRAIN });
      const model3 = await fetch(`${srv.base}/api/map/model?modPath=${encodeURIComponent(MOD3)}`).then((r) => r.json());
      const m3 = mount(srv, MOD3, model3);
      m3.inspect(4);
      m3.els.miTypeSel.value = "lake";
      await m3.page.sb.saveProvinceTerrain();
      const line = m3.page.statuses[m3.page.statuses.length - 1] || "";
      rec("THE CONTROL: an inland province is refused, and nothing is queued",
        m3.page.sb.pendingWrites.length === 0 && /INLAND/.test(line), { queued: m3.page.sb.pendingWrites.length, line });
      rec("⭐ the dropdown goes back to land, because that is what the province still is",
        m3.els.miTypeSel.value === "land" && m3.d(4).type === "land", { dropdown: m3.els.miTypeSel.value, def: m3.d(4).type });
      rec("…and no substitution is claimed for a change that did not happen", !/not a lake/.test(line), { line });
    }
  } catch (e) {
    rec("harness", false, String((e && e.stack) || e));
  } finally {
    srv.close();
    world.cleanup();
    console.log(`\n=== a lake the inspector says it made: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
  }
})();
