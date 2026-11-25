// Turning a sea into a lake in the province inspector says on the Save line what went with it, keeps a coastal box the modder ticked
// somewhere else in the same Save, and gives the new lake a lake terrain. #a-sea-made-a-lake-says-what-it-changed
//
// THE DEFECT (batch 8 discovery F4). The inspector's Type dropdown takes a sea to lake as water → water, so it skips the erase
// delegation and queues set-province-terrain { type: "lake", terrain: <the dropdown as it stands, "ocean">, coastal }. The server
// (setProvinceDefinition) then does two write-time cleanups:
//   · removePortsAnchoredTo — the ports facing that sea, which the game skips once it is a lake ("port building has a lake as sea zone"),
//     removed from map/buildings.txt: correct, and silent;
//   · fixCoastalFlags over the WHOLE map — every land row's coastal column re-derived from the bitmap, so a coastal box the modder had
//     ticked (and confirmed) on a province far from the lake, earlier in the same Save, was put back to false.
// flushMapSaves read neither orphanedPorts nor coastalFlags from the response, so the Save line said nothing about either. And the lake
// kept terrain `ocean`: across the six shipping maps 1 lake row of 826 is on ocean (vanilla 126 of 126 on `lakes`; measured by scratchpad
// batch9/page/corpus-water-terrain.js).
//
// Measured by the discovery (flow 1 Save 4, a vanilla-based mod): the coastal box on inland 4122, then sea 1885 (faced by 10 ports) to
// lake. The second response carried orphanedPorts { removed: 10 } and coastalFlags { changed: 8, lost: [3174, 3525, 4122, 6222, 9240,
// 9317, 9340, 11291] } — 4122 is 400+ px from the lake — and the Save line named neither.
//
// HOW IT IS TESTED: saveProvinceTerrain, queueWrite, flushMapSaves and the Save gate are the page's own code, lifted by
// testlib-map-page.js and RUN against a real in-process server over testlib-two-layer-map.js's world, where sea 1 runs along the top of
// the map, land 2 and 3 are its coast (a port each faces it), and 4 and 5 are inland.
"use strict";

const fs = require("fs");
const path = require("path");

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (ok || detail == null ? "" : "   -> " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 500)));
  if (!ok) fails.push(label);
};

const L2 = require("./testlib-two-layer-map.js");
const world = L2.makeWorld("sealake");   // before server.js: it reads HOI4_MODS_ROOT when it loads
// The mod's own terrain categories, so which terrains are water is read from a file, as on a real mod.
const TERRAIN = ["categories = {", "\tunknown = { color = { 255 0 0 } }", "\tocean = { naval_terrain = yes color = { 40 83 176 } is_water = yes }",
  "\tlakes = { color = { 58 91 255 } is_water = yes }", "\tplains = { color = { 255 129 66 } }", "\tforest = { color = { 89 199 85 } }", "}", ""].join("\n");
const P = require("./testlib-map-page.js");
const { createApp } = require("./server.js");

const defCols = (mod, id) => ((fs.readFileSync(path.join(mod, "map", "definition.csv"), "utf8").split(/\r?\n/).find((l) => l.split(";")[0] === String(id)) || "").split(";"));
const portsFacing = (mod, id) => {
  const f = path.join(mod, "map", "buildings.txt");
  const txt = fs.existsSync(f) ? fs.readFileSync(f, "utf8") : fs.readFileSync(path.join(world.GAME, "map", "buildings.txt"), "utf8");
  return txt.split(/\r?\n/).filter((l) => l.split(";")[1] === "naval_base_spawn" && l.split(";")[6] === String(id));
};

/** The page functions a province-inspector edit and its Save run through; the notes helper only once the fix has one. */
const NOTES = "function terrainWriteNotes(";
const FUNCTIONS = [
  "function queueWrite(", "async function saveProvinceTerrain()",
  ["async function flushMapSaves", "} finally { if (btn) btn.disabled = false; updateSaveButton(); }\n  }"],
  "function orphanedQueuedWrites(", "function emptyNewStateWrites(", "function markSaveBoundary(", "function blankAdjacencyNote(",
  "function heightmapNote(", "async function mapCrashGate(", "function openMapErrorsModal(",
  // (⛔ #a-sea-made-land-takes-the-coast-its-dockyards-stood-on — a sea made a lake asks what coast it takes; provNeighborsCache below leaves it nothing to find, which is not what this test is about)
  "function coastsASeaMadeLandTakes(", "function seaMadeLandNavalWords(", "function stateNavalLevels(", "function navalLevelsWords(", ["const NAVAL_ONLY_STATE_KEYS =", ";"],
].concat(P.MASKED.indexOf(NOTES) >= 0 ? [NOTES] : []);

(async () => {
  const srv = await L2.startServer(createApp);
  try {
    console.log("1. ⛔ The inspector: a coastal box ticked on inland province 4, then sea 1 made a lake, then 💾 Save");
    {
      const MOD = world.mod("Sea To Lake", { "common/terrain/00_terrain.txt": TERRAIN });
      const model = await fetch(`${srv.base}/api/map/model?modPath=${encodeURIComponent(MOD)}`).then((r) => r.json());
      const provinceDef = new Map((model.provinces || []).map((p) => [p.id, Object.assign({}, p)]));
      const provinceType = new Map((model.provinces || []).map((p) => [p.id, p.type]));
      const d = (id) => provinceDef.get(id) || {};
      rec("THE CONTROL: sea 1 is on ocean, 2 and 3 are its coast, 4 is inland", d(1).type === "sea" && d(1).terrain === "ocean" && d(2).coastal && d(3).coastal && d(4).type === "land" && !d(4).coastal,
        [1, 2, 3, 4].map((id) => d(id)));
      rec("THE CONTROL: the model read the mod's terrain file — ocean and lakes are water", (model.terrainCategories || []).some((c) => c.name === "lakes" && c.water) && (model.terrainCategories || []).some((c) => c.name === "ocean" && c.water), model.terrainCategories);
      rec("THE CONTROL: two ports face sea 1", portsFacing(MOD, 1).length === 2, portsFacing(MOD, 1));

      const requests = [], els = {};
      const el = (id, props) => { els[id] = Object.assign(P.element(), props || {}); return els[id]; };
      const page = P.runPage(FUNCTIONS, P.loadGlobals({
        modPath: () => MOD, $: (id) => els[id] || el(id), model, provinceDef, provinceType, selected: null,
        pushUndo: () => {}, beginEraseStroke: () => {}, eraseProvinceLocal: () => false, commitEraseStroke: () => {},
        computeSeaAdjacency: () => {}, seaAdjacent: new Set([2, 3]),
        isVanillaTarget: () => false, stateFormDirty: () => false, stateFormBaseline: null, stageStateWrite: () => {}, stagingStateForm: false,
        remapQueuedStateId: () => {}, remapLocalStateId: () => {}, adoptMergeRegions: () => {}, renderCheckpoints: () => {}, updateSaveButton: () => {},
        STATE_ID_FIELDS: ["stateId", "toStateId", "fromStateId", "sourceStateId", "targetStateId"],
        provNeighborsCache: new Map(), buildProvNeighbors: () => {},
        fetch: async (url, opts) => {
          const res = await fetch(srv.base + String(url), opts);
          const body = await res.json().catch(() => ({}));
          requests.push({ url: String(url).split("?")[0], sent: opts && opts.body ? JSON.parse(opts.body) : null, body });
          return { ok: res.ok, status: res.status, json: async () => body };
        },
      }));
      const { sb, statuses } = page;
      // What fillInspector puts in the three controls for a province, then the one control the modder changes.
      const inspect = (id) => { sb.selected = { provinceId: id }; el("miTypeSel", { value: d(id).type }); el("miTerrainSel", { value: d(id).terrain }); el("miCoastalChk", { checked: !!d(id).coastal }); };
      inspect(4); els.miCoastalChk.checked = true;
      await sb.saveProvinceTerrain();
      inspect(1); els.miTypeSel.value = "lake";
      await sb.saveProvinceTerrain();
      const q = sb.pendingWrites.map((w) => ({ url: w.url, body: w.body }));
      rec("THE CONTROL: the inspector queued the coastal box, then the type change", q.length === 2 && q[0].body.provinceId === 4 && q[0].body.coastal === true && q[1].body.provinceId === 1 && q[1].body.type === "lake", q);
      rec("⭐⭐ the new lake is queued on a lake terrain, not the sea's ocean", !!q[1] && q[1].body.terrain === "lakes", q[1]);
      rec("⭐ …and the terrain dropdown shows what was queued", !!q[1] && els.miTerrainSel.value === q[1].body.terrain, els.miTerrainSel.value);

      await sb.flushMapSaves();
      const writes = requests.filter((r) => r.url === "/api/map/set-province-terrain");
      const lake = writes[1] || { body: {} };
      const lost = ((lake.body.coastalFlags || {}).lost || []).slice().sort((a, b) => a - b);
      rec("THE CONTROL: Save posted both writes and they succeeded", writes.length === 2 && writes.every((w) => w.body.ok === true), writes.map((w) => w.body));
      rec("THE CONTROL: the lake write took the two ports that faced the sea", !!lake.body.orphanedPorts && lake.body.orphanedPorts.removed === 2, lake.body.orphanedPorts);
      rec("THE CONTROL: …and provinces 2 and 3 lost their coast, which only sea 1 gave them", lost.includes(2) && lost.includes(3), lake.body.coastalFlags);
      rec("⭐⭐⭐ the coastal box ticked on province 4 earlier in the same Save is still ticked on disk", defCols(MOD, 4)[5] === "true", defCols(MOD, 4).join(";"));
      rec("⭐⭐ …because the type change re-derived only the coast beside the lake, and 4 is nowhere near it", !lost.includes(4), lake.body.coastalFlags);
      rec("⚠️ provinces 2 and 3 say coastal=false on disk: the coast the lake took really is gone", defCols(MOD, 2)[5] === "false" && defCols(MOD, 3)[5] === "false", [defCols(MOD, 2).join(";"), defCols(MOD, 3).join(";")]);
      rec("⭐ …and the inspector's own copy agrees: 2 and 3 not coastal, 4 still ticked", !d(2).coastal && !d(3).coastal && d(4).coastal === true, [2, 3, 4].map((id) => ({ id, coastal: d(id).coastal })));
      rec("⚠️ no port on disk faces the lake", portsFacing(MOD, 1).length === 0, portsFacing(MOD, 1));
      rec("⭐⭐ on disk the lake row is a lake on `lakes`", defCols(MOD, 1)[4] === "lake" && defCols(MOD, 1)[6] === "lakes", defCols(MOD, 1).join(";"));
      const last = statuses[statuses.length - 1] || "";
      rec("⭐⭐⭐ the Save line says the ports facing the lake were taken out of map/buildings.txt, and why", /\b2 port/.test(last) && /buildings\.txt/.test(last) && /lake/i.test(last), { last });
      rec("⭐⭐ the Save line names the provinces whose coast went with it", /provinces? 2(,| and) 3\b/.test(last) && /coast/i.test(last), { last });
      const v = await srv.validate(MOD);
      const flagged = (v.problems || []).filter((p) => p.rule === "coastal_province_has_no_sea").flatMap((p) => p.provinces || []);
      rec("⚠️ Map Errors still tells the modder province 4's box disagrees with the map — kept, not hidden", flagged.includes(4), (v.problems || []).map((p) => p.rule));
    }

    console.log("\n2. The endpoint, sent what an older page sent, and what it must leave alone");
    {
      const MOD = world.mod("Sea To Lake Server", { "common/terrain/00_terrain.txt": TERRAIN });
      const r = await srv.post("/api/map/set-province-terrain", { provinceId: 1, terrain: "ocean", type: "lake", coastal: false }, MOD);
      rec("the sea → lake write succeeded", r.status === 200 && r.body.ok === true, r.body);
      rec("⭐⭐ a new lake gets a lake terrain even when the caller sends the sea's", defCols(MOD, 1)[4] === "lake" && defCols(MOD, 1)[6] === "lakes", defCols(MOD, 1).join(";"));
      const keep = await srv.post("/api/map/set-province-terrain", { provinceId: 1, terrain: "plains", type: "lake", coastal: false }, MOD);
      rec("⚠️ …but a terrain chosen for a lake that already is one is kept (Novum Vexillum ships 81 lakes on plains)", keep.status === 200 && defCols(MOD, 1)[6] === "plains", defCols(MOD, 1).join(";"));
    }
  } catch (e) {
    rec("harness threw: " + (e && e.stack ? e.stack.split("\n").slice(0, 5).join(" | ") : e), false);
  } finally {
    srv.close();
    world.cleanup();
    console.log(`\n=== a sea made a lake says what it changed and keeps a coastal box ticked elsewhere: ${checks} checks, ${fails.length} failed ===`);
    fails.forEach((f) => console.log("   FAILED: " + f));
    process.exitCode = fails.length ? 1 : 0;
  }
})();
