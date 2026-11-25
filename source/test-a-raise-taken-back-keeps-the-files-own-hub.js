// A RAISE THE ERASE TAKES BACK LEAVES THE FILES' OWN HUB AND RAILWAY ON THE SEA PROVINCE (group e's review of the b2b4 round, L3).
//
// 🧹 Erase on land that an unsaved raise made out of sea takes the raise back: no flip is queued, since the files never had that land
// (mirrorLandTurnedWater's `noFlip`). The files can still hold a supply hub or a railway on the SEA province — Old World Blues ships a hub
// on sea 107 — and the mirror took them off the page anyway: the page stopped drawing a hub the disk keeps, and the stroke's line said
// "💾 Save does the same to map/supply_nodes.txt", which no write does. Now only what the queued writes put on that land goes, with them.
//
// RUN, not grepped: the page's own eraseProvinceLocal, mirrorLandTurnedWater, landTurnedWaterRailWords and the stroke (lifted from
// public/map.js), on a small model with the raise queued as the inspector queues it. Binds no port.
"use strict";
const P = require("./testlib-map-page.js");

let checks = 0; const fails = [];
const ok = (c, m, d) => { checks++; if (c) console.log("  ok   " + m); else { fails.push(m); console.log("  FAIL " + m + (d !== undefined ? "   -> " + JSON.stringify(d).slice(0, 500) : "")); } };

const LIFTS = ["function eraseProvinceLocal(pid)", "function mirrorLandTurnedWater(", "function landTurnedWaterRailWords(", "function beginEraseStroke()", "function commitEraseStroke()",
  "function queueWrite(url, body, meta)", "function offerDropStopped(", "function stoppedWriteWords(", "function dropStoppedWrites()"];
const els = new Map();
const $ = (id) => { if (!els.has(id)) els.set(id, Object.assign(P.element(), { style: { display: "none" } })); return els.get(id); };
function page(model) {
  const types = new Map(), defs = new Map();
  for (const p of model.provinces) { types.set(p.id, p.type); defs.set(p.id, p); }
  return P.runPage(LIFTS, P.loadGlobals({
    $, model, provinceType: types, provinceDef: defs, provNeighborsCache: new Map(), buildProvNeighbors: () => {}, stateById: new Map((model.states || []).map((s) => [s.id, s])),
    provinceToOwner: {}, pendingWrites: [], paintDiff: new Map(), erasedThisStroke: new Set(), eraseEmptied: new Set(), eraseSkippedInland: new Set(), eraseHeld: new Map(),
    eraseSupplyRail: null, stoppedAt: null, autoFix: true, flushMapSaves: Object.assign(function flushMapSaves() {}, { running: null }),
    pushUndo: () => {}, paintDropRefusal: () => "", unmirrorDroppedMove: () => {}, moveProvinceLevels: () => {},
    setProvinceRegionLocally: () => {}, deleteEmptiedStates: () => ({ deleted: [], keptCapitals: [], keptInherited: [] }), emptiedStatesYardWords: () => "", inheritedEmptyWarning: () => "",
    railPanelOpen: () => false, renderRailPanel: () => {}, recolorAll: () => {}, draw: () => {},
  }));
}
const rows = (rails) => rails.map((r) => `${r.level} ${r.provinces.join(" ")}`);
// A coast of land 1-4 (state 10), and sea 107 beside it, which the files give a hub and a railway stretch (as Old World Blues' 107 has a hub),
// raised to land on the page: the inspector's Type → land, queued as set-province-terrain with what it was.
const model = () => ({
  provinces: [1, 2, 3, 4].map((id) => ({ id, type: "land", coastal: true, terrain: "plains", r: id, g: 0, b: 0 })).concat([{ id: 107, type: "land", coastal: true, terrain: "plains", r: 107, g: 0, b: 0 }]),
  states: [{ id: 10, provinces: [1, 2, 3, 4], owner: "AAA" }], provinceToState: { 1: 10, 2: 10, 3: 10, 4: 10 },
  supplyNodes: [{ level: 1, province: 107 }, { level: 1, province: 2 }],
  railways: [{ level: 1, provinces: [3, 107, 4] }, { level: 2, provinces: [1, 2] }],
});
const raise = (pg) => pg.sb.queueWrite("/api/map/set-province-terrain", { provinceId: 107, terrain: "plains", type: "land", coastal: true }, { was: { type: "sea", terrain: "ocean", coastal: false } });

console.log("\n-- the files' own hub and railway on the sea province stay, on the page as on disk --");
{
  const a = page(model());
  raise(a);
  a.sb.beginEraseStroke(); const erased = a.sb.eraseProvinceLocal(107); a.sb.commitEraseStroke();
  ok(erased === true && !a.sb.pendingWrites.some((w) => w.url === "/api/map/set-province-terrain" || w.url === "/api/map/flip-province-sea"), "THE CONTROL: the erase took the raise back and queued no flip", a.sb.pendingWrites.map((w) => w.url));
  ok(a.sb.model.supplyNodes.some((n) => n.province === 107), "⭐⭐⭐ the hub the files hold on 107 is still on the page", a.sb.model.supplyNodes);
  ok(JSON.stringify(rows(a.sb.model.railways)) === JSON.stringify(["1 3 107 4", "2 1 2"]), "⭐⭐ …and so is the files' railway through it, whole", rows(a.sb.model.railways));
  const line = String(a.statuses[a.statuses.length - 1] || "");
  ok(!/supply hub on province 107 goes/.test(line) && !/Save does the same to map\/supply_nodes\.txt/.test(line) && !/railways? (is|are) cut/.test(line), "⭐⭐ …and the line claims no hub or railway goes, nor that 💾 Save takes one out", line);
}

console.log("\n-- what the queued writes put on that land still goes with them, and is said as theirs --");
{
  const b = page(model());
  raise(b);
  b.sb.queueWrite("/api/map/railway", { action: "add", provinces: [1, 107, 2], level: 1 });
  b.sb.model.railways.push({ level: 1, provinces: [1, 107, 2] });
  b.sb.beginEraseStroke(); b.sb.eraseProvinceLocal(107); b.sb.commitEraseStroke();
  ok(JSON.stringify(rows(b.sb.model.railways)) === JSON.stringify(["1 3 107 4", "2 1 2"]), "⭐⭐ the railway added through the raised land leaves the page; the files' one stays", rows(b.sb.model.railways));
  ok(!b.sb.pendingWrites.some((w) => w.url === "/api/map/railway"), "THE CONTROL: …and its write, with no stretch of 2 left, is dropped", b.sb.pendingWrites.map((w) => w.url + ":" + (w.body.provinces || []).join(" ")));
  const line = String(b.statuses[b.statuses.length - 1] || "");
  ok(/1 unsaved hub or railway change on it was dropped/.test(line) && !/Save does the same to map\//.test(line) && /The 🏭 and 🛤 tools now show what 💾 Save will write\./.test(line), "⭐ …the line names the dropped change, and no change to the files", line);
}

console.log("\n-- THE CONTROL: an erase that flips land the files have still takes its hub and railway, and says 💾 Save does the same --");
{
  const c = page(model());
  c.sb.beginEraseStroke(); c.sb.eraseProvinceLocal(2); c.sb.commitEraseStroke();
  ok(c.sb.pendingWrites.some((w) => w.url === "/api/map/flip-province-sea") && !c.sb.model.supplyNodes.some((n) => n.province === 2), "the flip is queued and the hub on 2 is off the page", c.sb.model.supplyNodes);
  const line = String(c.statuses[c.statuses.length - 1] || "");
  ok(/supply hub on province 2 goes/.test(line) && /Save does the same to map\/supply_nodes\.txt and map\/railways\.txt/.test(line), "…and the line says so", line);
}

console.log(`\n${checks - fails.length}/${checks} checks passed`);
if (fails.length) { console.log("FAILED:\n  " + fails.join("\n  ")); process.exit(1); }
