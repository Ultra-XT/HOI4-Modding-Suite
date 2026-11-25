// ⛔ #an-erase-takes-the-hub-and-the-rail-on-its-land — 🗑 DELETE MAP TAKES THE SUPPLY HUBS AND RAILWAYS ON THE LAND IT DROWNS, AS ITS SAVE DOES
// (review of group e's B4-1 fix, 2026-11-19).
//
// B4-1: 🧹 Erase turned land to sea on the page and left the hub and the railways on it drawn, so a 🏭 click on that hub or a 🛤 Remove /
// ▴ on that line queued a write the Save then stopped at — "No supply node on that province.", "No matching railway to …" — on every Save
// after. The fix mirrors the flip's fixWaterSupplyRail in eraseProvinceLocal. 🗑 Delete map (blankMapLocal) is the same erase of EVERY land
// province, and its Save (blankMapToSea, step 6) runs the same fixWaterSupplyRail with every province it flipped; the page kept all of
// vanilla's 727 hubs and 909 railways standing on the new ocean, clickable, until a reload.
//
// This RUNS the page's own blankMapLocal (lifted from public/map.js) on a small model and holds the hubs and railways it leaves against
// what the SERVER's own fixWaterSupplyRail writes for the same drowned provinces, then the line it says.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const P = require("./testlib-map-page.js");

let checks = 0; const fails = [];
const ok = (c, m, d) => { checks++; if (c) console.log("  ✓ " + m); else { fails.push(m); console.log("  ✗ " + m + (d !== undefined ? "  " + JSON.stringify(d).slice(0, 500) : "")); } };
const rows = (rails) => rails.map((r) => `${r.level} ${r.provinces.join(" ")}`);

(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "nova-blank-rail-"));
  try {
    // land 1-8 (one state), sea 20 and lake 21; a hub on land 3, a hub on lake 21 (a lake with a state is legal for a hub); railways all over
    // the land, one through the lake between two lands, and a "railway" that runs lake → sea only (no land: the blank leaves it standing)
    const provinces = [1, 2, 3, 4, 5, 6, 7, 8].map((id) => ({ id, type: "land", coastal: true, terrain: "plains", r: id, g: 0, b: 0 }))
      .concat([{ id: 20, type: "sea", coastal: false, terrain: "ocean", r: 20, g: 0, b: 0 }, { id: 21, type: "lake", coastal: false, terrain: "lakes", r: 21, g: 0, b: 0 }]);
    const supplyNodes = [{ level: 1, province: 3 }, { level: 1, province: 21 }];
    const railways = [{ level: 2, provinces: [1, 2, 3, 4, 5] }, { level: 1, provinces: [6, 21, 7] }, { level: 3, provinces: [21, 20] }, { level: 1, provinces: [7, 8] }];
    const types = new Map(provinces.map((p) => [p.id, p.type])), defs = new Map(provinces.map((p) => [p.id, Object.assign({}, p)]));
    const model = { provinces, states: [{ id: 10, provinces: [1, 2, 3, 4, 5, 6, 7, 8], owner: "AAA" }], provinceToState: { 1: 10, 2: 10, 3: 10, 4: 10, 5: 10, 6: 10, 7: 10, 8: 10 },
      capitals: { AAA: 10 }, stateToSupplyArea: { 10: 1 }, supplyNodes: supplyNodes.map((n) => Object.assign({}, n)), railways: railways.map((r) => ({ level: r.level, provinces: r.provinces.slice() })) };
    let undo = 0, panelRendered = 0;
    const pg = P.runPage(["function blankMapLocal()", "function queueWrite(url, body, meta)"], {
      model, provinceType: types, provinceDef: defs, provinceToOwner: { 1: "AAA" }, stateById: new Map([[10, model.states[0]]]), pendingWrites: [], seaAdjacent: null,
      blankRefusalBody: () => "", flushMapSaves: Object.assign(function flushMapSaves() {}, { running: null }), pushUndo: () => { undo++; }, setMapDirty: () => {},
      clearMultiSelect: () => {}, selected: null, stateFormBaseline: null, info: null, recolorAll: () => {}, draw: () => {},
      railPanelOpen: () => true, renderRailPanel: () => { panelRendered++; },
    });
    pg.sb.blankMapLocal();
    ok(undo === 1 && pg.sb.pendingWrites.length === 1 && pg.sb.pendingWrites[0].url === "/api/map/blank-to-sea", "THE CONTROL: the page's own Delete map took one Undo step and queued the blank", pg.sb.pendingWrites);
    ok([1, 2, 3, 4, 5, 6, 7, 8].every((p) => pg.sb.provinceType.get(p) === "sea") && pg.sb.provinceType.get(21) === "lake", "THE CONTROL: every land province is sea on the page, the lake stays a lake");

    // the server's own rule, on the same rows, for the provinces the blank flips (every land one)
    const M = path.join(tmp, "mod");
    fs.mkdirSync(path.join(M, "map"), { recursive: true });
    fs.writeFileSync(path.join(M, "map", "supply_nodes.txt"), supplyNodes.map((n) => `${n.level} ${n.province}`).join("\n") + "\n");
    fs.writeFileSync(path.join(M, "map", "railways.txt"), railways.map((r) => `${r.level} ${r.provinces.length} ${r.provinces.join(" ")} `).join("\n") + "\n");
    const MD = require("./map-data.js");
    const srv = MD.fixWaterSupplyRail({ modRoot: M, gameRoot: path.join(tmp, "game"), dependencyRoots: [], waterIds: [1, 2, 3, 4, 5, 6, 7, 8] });
    const diskRails = fs.readFileSync(path.join(M, "map", "railways.txt"), "utf8").split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((l) => { const n = l.split(/\s+/).map(Number); return `${n[0]} ${n.slice(2, 2 + n[1]).join(" ")}`; });
    const diskHubs = fs.readFileSync(path.join(M, "map", "supply_nodes.txt"), "utf8").split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((l) => Number(l.split(/\s+/)[1]));
    ok(srv && srv.supplyRemoved === 1 && srv.railRemoved === 3, "THE CONTROL: the server's fixWaterSupplyRail took the land's hub and the three railways on land", srv);
    ok(JSON.stringify(rows(pg.sb.model.railways)) === JSON.stringify(diskRails), "⭐⭐⭐ the page's railways after 🗑 Delete map are, row for row, what the Save writes to map/railways.txt", { page: rows(pg.sb.model.railways), disk: diskRails });
    ok(JSON.stringify(pg.sb.model.supplyNodes.map((n) => n.province)) === JSON.stringify(diskHubs), "⭐⭐⭐ …and its hubs what it writes to map/supply_nodes.txt (the hub on the drowned land goes, the lake's stays)", { page: pg.sb.model.supplyNodes, disk: diskHubs });
    ok(panelRendered === 1, "⭐ …and an open 🛤 Rails & supply panel is drawn again, so it lists only what is left", panelRendered);
    const line = String(pg.statuses[pg.statuses.length - 1] || "");
    ok(/supply hubs and railways on that land go with it \(1 hub, 3 railways\)/.test(line) && /map\/supply_nodes\.txt and map\/railways\.txt/.test(line), "⭐ the line says what went with the land, and that 💾 Save does the same to the files", line);
  } catch (e) {
    ok(false, "harness threw: " + (e && e.stack ? e.stack.split("\n").slice(0, 6).join(" | ") : e));
  } finally {
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) {}
    console.log(`\n=== Delete map takes the hubs and railways on its land: ${checks} checks, ${fails.length} failed ===`);
    fails.forEach((f) => console.log("   FAILED: " + f));
    process.exitCode = fails.length ? 1 : 0;
  }
})();
