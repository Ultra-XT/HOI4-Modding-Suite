// ⛔ #an-erase-takes-the-hub-and-the-rail-on-its-land (B4-1, B1-28) and #a-stopped-save-can-drop-what-it-stopped-at (B4-1's U1).
//
// 🧹 Erase (and the inspector's Type → sea/lake, which goes the same way) queues flip-province-sea, and the flip's last step,
// fixWaterSupplyRail in map-data.js, takes the supply hub off the province and cuts every railway through it there, keeping each
// stretch of 2 or more provinces. The page went on drawing both, so the 🏭 tool's click on the drawn hub queued a remove and the 🛤
// panel's Remove / ▴ queued the line as it was before: the Save answered 400 ("No supply node on that province.", "No matching railway
// to …"), kept the write, and stopped at it on every Save after — Undo emptied by the stop, 🔧 refusing while anything was queued, and
// only a reload plus a Discard of every unsaved change got out (the tool campaign's B4, repro-B4-1, three cases, the real page).
//
// This RUNS the page's own erase (lifted from public/map.js) on a small model and holds the rows it leaves against the rows the
// SERVER's own fixWaterSupplyRail writes for the same erase, so the mirror cannot drift from the rule it mirrors. Then the take-back
// branch (a raise the erase took back queues no flip), the stroke's words, and the stopped Save's ✕ Drop.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const P = require("./testlib-map-page.js");
const { maskJsComments } = require("./testlib-strip-comments.js");

let checks = 0; const fails = [];
const ok = (c, m, d) => { checks++; if (c) console.log("  ✓ " + m); else { fails.push(m); console.log("  ✗ " + m + (d !== undefined ? "  " + JSON.stringify(d).slice(0, 400) : "")); } };

const LIFTS = [
  "function eraseProvinceLocal(pid)", "function mirrorLandTurnedWater(", "function landTurnedWaterRailWords(", "function beginEraseStroke()", "function commitEraseStroke()",
  "function queueWrite(url, body, meta)", "function offerDropStopped(", "function stoppedWriteWords(", "function dropStoppedWrites()",
];
const els = new Map();
const $ = (id) => { if (!els.has(id)) els.set(id, Object.assign(P.element(), { style: { display: "none" } })); return els.get(id); };
function page(model, extra = {}) {
  const types = new Map(), defs = new Map();
  for (const p of model.provinces) { types.set(p.id, p.type); defs.set(p.id, p); }
  const undo = [];
  const pg = P.runPage(LIFTS, P.loadGlobals(Object.assign({
    $, model, provinceType: types, provinceDef: defs, provNeighborsCache: new Map(), buildProvNeighbors: () => {}, stateById: new Map((model.states || []).map((s) => [s.id, s])),
    provinceToOwner: {}, pendingWrites: [], paintDiff: new Map(), erasedThisStroke: new Set(), eraseEmptied: new Set(), eraseSkippedInland: new Set(), eraseHeld: new Map(),
    eraseSupplyRail: null, stoppedAt: null, autoFix: true, flushMapSaves: Object.assign(function flushMapSaves() {}, { running: null }),
    pushUndo: (label) => undo.push({ label, writes: pg.sb.pendingWrites.slice() }), paintDropRefusal: () => "", unmirrorDroppedMove: () => {}, moveProvinceLevels: () => {},
    setProvinceRegionLocally: () => {}, deleteEmptiedStates: () => ({ deleted: [], keptCapitals: [], keptInherited: [] }), emptiedStatesYardWords: () => "", inheritedEmptyWarning: () => "",
    railPanelOpen: () => false, renderRailPanel: () => {}, recolorAll: () => {}, draw: () => {},
  }, extra)));
  pg.undo = undo;
  return pg;
}
const rows = (rails) => rails.map((r) => `${r.level} ${r.provinces.join(" ")}`);

(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "nova-erase-rail-"));
  try {
    // A coast of six land provinces in one state, a hub on 3, three railways through 3 (one keeps both sides, one keeps one side, one
    // keeps nothing) and one that never touches it.
    const land = [1, 2, 3, 4, 5, 6, 7, 8].map((id) => ({ id, type: "land", coastal: true, terrain: "plains", r: id, g: 0, b: 0 }));
    const model = () => ({
      provinces: land.map((p) => Object.assign({}, p)), states: [{ id: 10, provinces: [1, 2, 3, 4, 5, 6, 7, 8], owner: "AAA" }], provinceToState: { 1: 10, 2: 10, 3: 10, 4: 10, 5: 10, 6: 10, 7: 10, 8: 10 },
      supplyNodes: [{ level: 1, province: 3 }, { level: 1, province: 7 }],
      railways: [{ level: 2, provinces: [1, 2, 3, 4, 5] }, { level: 1, provinces: [3, 6, 8] }, { level: 3, provinces: [2, 3] }, { level: 1, provinces: [7, 8] }],
    });

    console.log("\n-- 1. THE ERASE DOES TO THE PAGE WHAT THE FLIP DOES TO THE FILES --");
    const a = page(model());
    a.sb.beginEraseStroke();
    const flipped = a.sb.eraseProvinceLocal(3);
    a.sb.commitEraseStroke();
    ok(flipped === true && a.sb.provinceType.get(3) === "sea", "THE CONTROL: the page's own erase flipped province 3 to sea");
    ok(a.sb.pendingWrites.length === 1 && a.sb.pendingWrites[0].url === "/api/map/flip-province-sea", "…and queued the flip and nothing else", a.sb.pendingWrites.map((w) => w.url));
    ok(!a.sb.model.supplyNodes.some((n) => n.province === 3) && a.sb.model.supplyNodes.some((n) => n.province === 7), "⭐⭐ the hub on the erased province is gone from the page, the other hub stays", a.sb.model.supplyNodes);
    // the server's own rule, on the same rows
    const M = path.join(tmp, "mod");
    fs.mkdirSync(path.join(M, "map"), { recursive: true });
    fs.writeFileSync(path.join(M, "map", "supply_nodes.txt"), model().supplyNodes.map((n) => `${n.level} ${n.province}`).join("\n") + "\n");
    fs.writeFileSync(path.join(M, "map", "railways.txt"), model().railways.map((r) => `${r.level} ${r.provinces.length} ${r.provinces.join(" ")} `).join("\n") + "\n");
    const MD = require("./map-data.js");
    const srv = MD.fixWaterSupplyRail({ modRoot: M, gameRoot: path.join(tmp, "game"), dependencyRoots: [], waterIds: [3] });
    const diskRails = fs.readFileSync(path.join(M, "map", "railways.txt"), "utf8").split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((l) => { const n = l.split(/\s+/).map(Number); return `${n[0]} ${n.slice(2, 2 + n[1]).join(" ")}`; });
    const diskHubs = fs.readFileSync(path.join(M, "map", "supply_nodes.txt"), "utf8").split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((l) => Number(l.split(/\s+/)[1]));
    ok(srv && srv.supplyRemoved === 1 && srv.railFixed === 2 && srv.railRemoved === 1, "THE CONTROL: the server's fixWaterSupplyRail took 1 hub, cut 2 railways and removed 1 for the same erase", srv);
    ok(JSON.stringify(rows(a.sb.model.railways)) === JSON.stringify(diskRails), "⭐⭐⭐ the page's railways are, row for row, what the server writes to map/railways.txt", { page: rows(a.sb.model.railways), disk: diskRails });
    ok(JSON.stringify(a.sb.model.supplyNodes.map((n) => n.province)) === JSON.stringify(diskHubs), "⭐⭐ …and its hubs what it writes to map/supply_nodes.txt", { page: a.sb.model.supplyNodes, disk: diskHubs });
    const line = String(a.statuses[a.statuses.length - 1] || "");
    ok(/supply hub on province 3 goes/.test(line) && /2 railways are cut/.test(line) && /1 railway with no stretch of 2 provinces left goes/.test(line), "⭐ the stroke's line says what went with the land", line);
    ok(/Save does the same to map\/supply_nodes\.txt and map\/railways\.txt/.test(line), "…and that 💾 Save writes the same", line);

    console.log("\n-- 2. WHAT IS QUEUED BEFORE THE ERASE IS LEFT AS IT IS (the Save sends it ahead of the flip) --");
    const b = page(model());
    b.sb.queueWrite("/api/map/railway", { action: "relevel", provinces: [1, 2, 3, 4, 5], level: 2, to: 3 });
    b.sb.queueWrite("/api/map/supply-node", { action: "remove", province: 3 });
    b.sb.model.supplyNodes = b.sb.model.supplyNodes.filter((n) => n.province !== 3);
    b.sb.beginEraseStroke(); b.sb.eraseProvinceLocal(3); b.sb.commitEraseStroke();
    ok(b.sb.pendingWrites.map((w) => w.url + ":" + (w.body.action || "")).join(" | ") === "/api/map/railway:relevel | /api/map/supply-node:remove | /api/map/flip-province-sea:", "⭐ the relevel and the hub remove queued before stay, ahead of the flip", b.sb.pendingWrites.map((w) => w.url));
    ok(JSON.stringify(b.sb.pendingWrites[0].body.provinces) === "[1,2,3,4,5]", "…naming the line as the files still hold it when they are sent", b.sb.pendingWrites[0].body);

    console.log("\n-- 3. A RAISE THE ERASE TAKES BACK QUEUES NO FLIP: WHAT WAS QUEUED ON THAT LAND IS CUT THE SAME WAY --");
    const raisedModel = model();
    raisedModel.provinces.push({ id: 9, type: "land", coastal: true, terrain: "plains", r: 9, g: 0, b: 0 });
    const c = page(raisedModel);
    c.sb.queueWrite("/api/map/set-province-terrain", { provinceId: 9, terrain: "plains", type: "land", coastal: true }, { was: { type: "sea", terrain: "ocean", coastal: false } });
    c.sb.queueWrite("/api/map/supply-node", { action: "add", province: 9, level: 1 });
    c.sb.queueWrite("/api/map/railway", { action: "add", provinces: [7, 8, 9, 6, 5], level: 1 });
    c.sb.queueWrite("/api/map/railway", { action: "add", provinces: [8, 9], level: 1 });
    c.sb.model.supplyNodes.push({ level: 1, province: 9 });
    c.sb.model.railways.push({ level: 1, provinces: [7, 8, 9, 6, 5] }, { level: 1, provinces: [8, 9] });
    c.sb.beginEraseStroke(); c.sb.eraseProvinceLocal(9); c.sb.commitEraseStroke();
    const cw = c.sb.pendingWrites.map((w) => `${w.url.replace("/api/map/", "")}:${w.body.action || ""}:${(w.body.provinces || []).join(" ")}`);
    ok(!c.sb.pendingWrites.some((w) => w.url === "/api/map/set-province-terrain" || w.url === "/api/map/flip-province-sea"), "THE CONTROL: the raise was taken back, and no flip was queued", cw);
    ok(!c.sb.pendingWrites.some((w) => w.url === "/api/map/supply-node"), "⭐⭐ the hub added on that land is dropped: the files never had it as land, and a hub on the sea is refused", cw);
    ok(JSON.stringify(cw) === JSON.stringify(["railway:add:7 8", "railway:add:6 5"]), "⭐⭐ a railway added through it is cut to its stretches on land, and one with none left is dropped", cw);
    const cl = String(c.statuses[c.statuses.length - 1] || "");
    ok(/1 unsaved railway change through it now names only the stretches on land/.test(cl) && /2 unsaved hub or railway changes on it were dropped/.test(cl), "⭐ …and the line says so", cl);
    ok(!rows(c.sb.model.railways).some((r) => / 9( |$)/.test(r)) && !c.sb.model.supplyNodes.some((n) => n.province === 9), "…and the page's own rows no longer name it", rows(c.sb.model.railways));

    console.log("\n-- 4. A STOPPED SAVE'S REFUSED WRITE CAN BE DROPPED WITHOUT A RELOAD --");
    const d = page(model());
    d.sb.queueWrite("/api/map/supply-node", { action: "remove", province: 122 });
    d.sb.queueWrite("/api/map/set-owner", { stateId: 10, owner: "BBB" });
    const refused = d.sb.pendingWrites[0];
    d.sb.offerDropStopped([refused], "No supply node on that province.");
    ok($("mapDropStopped").style.display === "", "THE CONTROL: the stop shows ✕ beside its line");
    d.sb.dropStoppedWrites();
    ok(d.sb.pendingWrites.length === 1 && d.sb.pendingWrites[0].url === "/api/map/set-owner", "⭐⭐⭐ ✕ took exactly the refused write out of the queue, and the rest stays", d.sb.pendingWrites.map((w) => w.url));
    ok(d.undo.length === 1 && d.undo[0].writes.indexOf(refused) !== -1, "⭐⭐ …as one Undo step, which holds the queue with it", d.undo.map((u) => u.label));
    const dl = String(d.statuses[d.statuses.length - 1] || "");
    ok(/Dropped the removal of the supply hub on province 122/.test(dl) && /the server refused it, so no Save sends it again/.test(dl) && /1 other change is still queued/.test(dl), "⭐ the line names it, says no Save sends it again and what is still queued", dl);
    // (review of B4-1) a write that failed PART-WAY (a file another program held) answers a refusal too, after its first files: the line
    // and the button promise nothing about what the disk holds
    const html0 = fs.readFileSync(path.join(__dirname, "public", "map.html"), "utf8");
    const btnTitle = (/<button id="mapDropStopped"[^>]*title="([^"]*)"/.exec(html0) || [])[1] || "";
    ok(!/nothing of (it|them) was written/.test(dl) && btnTitle && !/nothing of (it|them) was written/.test(btnTitle), "⭐ …and claims nothing of what was written, the line nor the ✕ button's title", { dl, btnTitle });
    ok($("mapDropStopped").style.display === "none", "…and ✕ is gone");
    // (review of B4-1) AN UNDO SINCE THE STOP PUTS COPIES OF THE QUEUE BACK (applyMapSnapshot copies every write), and ✕ said "no longer
    // queued" of the refused write still in it, and dropped nothing: it is the same write, by what it sends
    const g = page(model());
    g.sb.queueWrite("/api/map/railway", { action: "relevel", provinces: [1, 2, 3], level: 2, to: 3 });
    g.sb.queueWrite("/api/map/set-owner", { stateId: 10, owner: "BBB" });
    g.sb.offerDropStopped([g.sb.pendingWrites[0]], "No matching railway to change the level of.");
    g.sb.pendingWrites = g.sb.pendingWrites.map((w) => ({ url: w.url, body: Object.assign({}, w.body), meta: Object.assign({}, w.meta) }));   // as applyMapSnapshot puts them back
    g.sb.dropStoppedWrites();
    const gl = String(g.statuses[g.statuses.length - 1] || "");
    ok(g.sb.pendingWrites.length === 1 && g.sb.pendingWrites[0].url === "/api/map/set-owner" && /Dropped the level change of the railway 1 → 3/.test(gl), "⭐⭐ after an Undo's copies of the queue, ✕ still drops the refused write (by what it sends), and only it", { left: g.sb.pendingWrites.map((w) => w.url), gl });
    const e = page(model());
    e.sb.queueWrite("/api/map/railway", { action: "relevel", provinces: [1, 2], level: 1, to: 2 });
    e.sb.offerDropStopped([e.sb.pendingWrites[0]], "x");
    e.sb.flushMapSaves.running = Promise.resolve();
    e.sb.dropStoppedWrites();
    ok(e.sb.pendingWrites.length === 1 && /A Save is running/.test(String(e.statuses[e.statuses.length - 1])), "⭐ ✕ waits while a Save runs", e.statuses.slice(-1));

    console.log("\n-- 5. EVERY STOP AT A REFUSED WRITE OFFERS IT, AND A NEW SAVE OR A RELOAD TAKES THE OFFER AWAY (the source) --");
    const masked = P.MASKED;
    const flush = P.lift("async function flushMapSaves()", "} finally { if (btn) btn.disabled = false; updateSaveButton(); }\n  }");
    const fm = maskJsComments(flush);
    const refusals = (fm.match(/Remaining changes kept\./g) || []).length;
    const offers = (fm.match(/offerDropStopped\(\s*(?!null)/g) || []).length;
    ok(refusals >= 4 && offers === refusals, `⭐⭐ each of flushMapSaves's ${refusals} refusal stops offers ✕ (${offers})`, { refusals, offers });
    ok(/offerDropStopped\(null\)/.test(fm.slice(0, fm.indexOf("const dropped = []"))), "⭐ …and a new Save takes the last offer away before it sends anything");
    const loadBody = maskJsComments(P.lift("async function load(doneMsg)"));
    ok(/pendingWrites = \[\][^\n]*\n\s*if \(typeof offerDropStopped === "function"\) offerDropStopped\(null\)/.test(loadBody), "⭐ …and so does a reload, which empties the queue it named");
    ok(/\$\("mapDropStopped"\)\.addEventListener\("click", dropStoppedWrites\)/.test(masked), "…and the ✕ button is wired");
    const html = fs.readFileSync(path.join(__dirname, "public", "map.html"), "utf8");
    ok(/<button id="mapDropStopped" style="display:none;/.test(html), "…and map.html has it, hidden until a Save stops");
    const erase = maskJsComments(P.lift("function eraseProvinceLocal(pid)"));
    ok(/mirrorLandTurnedWater\(pid, raisedAt !== -1, eraseSupplyRail\)/.test(erase), "⭐ the erase calls the mirror on both of its branches (the flip, and a raise taken back)");
  } catch (e) {
    ok(false, "harness threw: " + (e && e.stack ? e.stack.split("\n").slice(0, 6).join(" | ") : e));
  } finally {
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) {}
    console.log(`\n=== an erase takes the hub and the rail on its land: ${checks} checks, ${fails.length} failed ===`);
    fails.forEach((f) => console.log("   FAILED: " + f));
    process.exitCode = fails.length ? 1 : 0;
  }
})();
