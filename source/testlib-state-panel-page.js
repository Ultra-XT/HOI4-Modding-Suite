// The Map editor's state panel and its tools RUN in node: the page's own showInfo, saveState, stageStateWrite, doMoveProvince, doMergeState,
// eraseProvinceLocal, the Delete button and Undo, lifted out of public/map.js into a sandbox with a few fake inputs, on a small world of
// rectangles or on a copy of the base game. Each write the page queues goes to map-data.js as server.js's handler passes it, so a test
// reads what the file holds after what the modder did. Shared by the tests of what the page holds between a click and the Save.
//
// ⚠️ NOT NAMED test-*.js ON PURPOSE — run-tests.js enumerates `test-*.js` and would execute a helper as a test file.
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { lift, MASKED, element, withNoteHelpers, readSource } = require("./testlib-map-page.js");

const html = readSource("public", "map.html");
const BLD = [...new Set([...html.matchAll(/data-bld="([a-z_]+)"/g)].map((m) => m[1]))];
const RES = [...new Set([...html.matchAll(/data-res="([a-z_]+)"/g)].map((m) => m[1]))];

// ─── the world ───────────────────────────────────────────────────────────────────────────────────────────────────────────
//        x 10-20  20-30  30-40  40-50
//  y 5     2      3      4      5
//  y 15    6      7      8      9          7 and 8 inland
//  y 25   10     11     12     13          the rest is sea 1
const W = 60, H = 45, SEA = 1;
const RECT = {
  2: [10, 5, 20, 15], 3: [20, 5, 30, 15], 4: [30, 5, 40, 15], 5: [40, 5, 50, 15],
  6: [10, 15, 20, 25], 7: [20, 15, 30, 25], 8: [30, 15, 40, 25], 9: [40, 15, 50, 25],
  10: [10, 25, 20, 35], 11: [20, 25, 30, 35], 12: [30, 25, 40, 35], 13: [40, 25, 50, 35],
};
const INLAND = new Set([7, 8]);
const shapeAt = (x, y) => { for (const [id, [x0, y0, x1, y1]] of Object.entries(RECT)) if (x >= x0 && x < x1 && y >= y0 && y < y1) return +id; return SEA; };
const colour = (id) => [(id * 37) % 256, (id * 71) % 256, 40 + id];
const BUILDINGS = "buildings = {\n\tnaval_base = {\n\t\tonly_costal = yes\n\t\tspawn_point = naval_base_spawn\n\t}\n\tdockyard = {\n\t\tonly_costal = yes\n\t\tlevel_cap = {\n\t\t\tshares_slots = yes\n\t\t}\n\t}\n}\n";
function bmp24(fn) {
  const rs = Math.floor((24 * W + 31) / 32) * 4, b = Buffer.alloc(54 + rs * H);
  b.write("BM", 0, "ascii"); b.writeUInt32LE(b.length, 2); b.writeUInt32LE(54, 10); b.writeUInt32LE(40, 14);
  b.writeInt32LE(W, 18); b.writeInt32LE(H, 22); b.writeUInt16LE(1, 26); b.writeUInt16LE(24, 28); b.writeUInt32LE(rs * H, 34);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const [r, g, bl] = fn(x, y); const o = 54 + (H - 1 - y) * rs + x * 3; b[o] = bl; b[o + 1] = g; b[o + 2] = r; }
  return b;
}
function bmp8(fn) {
  const rs = Math.floor((8 * W + 31) / 32) * 4, off = 54 + 1024, b = Buffer.alloc(off + rs * H);
  b.write("BM", 0, "ascii"); b.writeUInt32LE(b.length, 2); b.writeUInt32LE(off, 10); b.writeUInt32LE(40, 14);
  b.writeInt32LE(W, 18); b.writeInt32LE(H, 22); b.writeUInt16LE(1, 26); b.writeUInt16LE(8, 28); b.writeUInt32LE(rs * H, 34); b.writeUInt32LE(256, 46);
  for (let i = 0; i < 256; i++) { b[54 + i * 4] = i; b[54 + i * 4 + 1] = i; b[54 + i * 4 + 2] = i; }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) b[off + (H - 1 - y) * rs + x] = fn(x, y);
  return b;
}
const write = (dir, rel, body) => { const p = path.join(dir, ...rel.split("/")); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, body); return p; };
// 4 = { 8, 12 } with 12 its only coast; 12 holds a victory point and a naval base, state 4 7 dockyards and from 1939 8, state 3 its own 2 and 3
const DEFAULT_STATES = { 1: [2, 6], 2: [7], 3: [4, 5], 4: [8, 12], 5: [9, 13], 6: [10, 11], 7: [3] };
const hist = (u, dated = [], extra = "") => `\t\towner = AAA\n\t\tbuildings = {\n\t\t\tinfrastructure = 2\n${u != null ? `\t\t\tdockyard = ${u}\n` : ""}${extra}\t\t}\n`
  + dated.map(([d, l]) => `\t\t${d} = {\n\t\t\tbuildings = {\n\t\t\t\tdockyard = ${l}\n\t\t\t}\n\t\t}\n`).join("");
const DEFAULT_HISTORY = {
  4: "\t\towner = AAA\n\t\tadd_core_of = AAA\n\t\tvictory_points = {\n\t\t\t12 5 # the harbour town\n\t\t}\n\t\tbuildings = {\n\t\t\tinfrastructure = 2\n\t\t\tdockyard = 7\n\t\t\t12 = { naval_base = 3 }\n\t\t}\n\t\t1939.1.1 = {\n\t\t\tbuildings = {\n\t\t\t\tdockyard = 8\n\t\t\t}\n\t\t}\n",
  3: hist(2, [["1939.1.1", 3]]),
};
function makeWorld(root, name, { states = DEFAULT_STATES, history = DEFAULT_HISTORY, inland = INLAND } = {}) {
  const dir = path.join(root, name);
  write(dir, "descriptor.mod", `name="${name}"\nreplace_path="history/states"\nreplace_path="map"\nreplace_path="common/buildings"\nreplace_path="history/countries"\nreplace_path="map/strategicregions"\nreplace_path="map/supplyareas"\n`);
  write(dir, "map/provinces.bmp", bmp24((x, y) => colour(shapeAt(x, y))));
  write(dir, "map/heightmap.bmp", bmp8((x, y) => (shapeAt(x, y) === SEA ? 80 : 110)));
  const defs = ["0;0;0;0;land;false;unknown;0", `${SEA};${colour(SEA).join(";")};sea;false;ocean;0`];
  for (let id = 2; id <= 13; id++) defs.push(`${id};${colour(id).join(";")};land;${inland.has(id) ? "false" : "true"};plains;1`);
  write(dir, "map/definition.csv", defs.join("\n") + "\n");
  write(dir, "map/buildings.txt", "");
  write(dir, "common/buildings/00_buildings.txt", BUILDINGS);
  const all = Object.values(states).flat();
  write(dir, "map/strategicregions/10-R.txt", `strategic_region = {\n\tid = 10\n\tname = "STRATEGICREGION_10"\n\tprovinces = {\n\t\t${all.join(" ")} 1\n\t}\n}\n`);
  for (const [sid, provs] of Object.entries(states)) {
    write(dir, `history/states/${sid}-S.txt`, `state = {\n\tid = ${sid}\n\tname = "STATE_${sid}"\n\tmanpower = 1000\n\tstate_category = rural\n\tprovinces = { ${provs.join(" ")} }\n\thistory = {\n${history[sid] || "\t\towner = AAA\n"}\t}\n}\n`);
  }
  return { modRoot: dir, gameRoot: path.join(root, "no-game"), dependencyRoots: [] };
}
const worldNeighbours = () => {
  const adj = new Map(), add = (a, b) => { if (a === b) return; for (const [x, y] of [[a, b], [b, a]]) { if (!adj.has(x)) adj.set(x, new Set()); adj.get(x).add(y); } };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const a = shapeAt(x, y); if (x + 1 < W) add(a, shapeAt(x + 1, y)); if (y + 1 < H) add(a, shapeAt(x, y + 1)); }
  return adj;
};

// ─── the page ────────────────────────────────────────────────────────────────────────────────────────────────────────────
const NL = "\n";
const FLUSH_END = "} finally { if (btn) btn.disabled = false; updateSaveButton(); }" + NL + "  }";
const FUNCS = [
  ["const STATE_ID_FIELDS = ", NL],
  "function queueWrite(", "function orphanedQueuedWrites(", "function emptyNewStateWrites(",
  "function snapshotMap(", "function applyMapSnapshot(", "function pushUndo(", "function doUndo(", "function doRedo(", "function eachHeldSnapshot(",
  "function regionMoveStrays(", "function stateMoveRegionTarget(", "function setProvinceRegionLocally(", "function stageProvinceRegionMove(", "function mergeRegionPlan(", "function adoptMergeRegions(",
  "function stateNavalLevels(", "function navalLevelsWords(", "function navalDatedAfterCarry(", "function giveNavalDated(", "function coastDockyardsThatGo(", "function reconcileNavalCarry(", "function unmirrorDroppedMove(",
  "function handleMoveClick(", "function deleteEmptiedStates(", "function inheritedEmptyWarning(", "function doMoveProvince(", "function eraseProvinceLocal(", "function beginEraseStroke(", "function commitEraseStroke(", "function doMergeState(",
  "function stateFormFieldSignature(", "function stateFormDirty(", "function rebaselineStateForm(", "function collectVps(", "function populateOwnerSelect(", "function vpRowHtml(", "function wireVpDel(", "function renderVpRows(", "function addVpRow(",
  "function showInfo(", "async function saveState(", "function stageStateWrite(", "function copyStateAttrs(", "function pasteStateAttrs(", "function remapLocalStateId(", "function remapQueuedStateId(",
  "function terrainWriteNotes(", "function markSaveBoundary(", ["async function flushMapSaves", FLUSH_END],
];
// what a later fix adds: lifted when the page has it, so this harness runs on the code from before it too and a test FAILS there rather than not starting
const OPTIONAL = ["function readStateForm(", "function moveProvinceLevels(", "function paintDropRefusal(", "function emptiedStatesYardWords(",
  // (⛔ #a-new-state-is-carved-like-a-split, #a-capital-state-keeps-a-victory-point, #an-id-the-scripts-name-goes-back-to-its-country — what the Save adopts and
  // says of a new state's first land and the capitals it kept, and what Delete and Merge ask of the scripts; none of them a …Note helper)
  "function adoptFirstLand(", "function adoptCapitalTown(", "function capitalTownNotes(", "function warnOfScriptNamedState(",
  // (⛔ #a-state-category-is-picked-from-the-list — the panel's Category list, which showInfo and 📋 Paste fill)
  "function populateCategorySelect(",
  // (⛔ #a-panel-holds-back-what-the-game-refuses — what stageStateWrite does not stage: a dockyard on a state with no coast, a victory point
  // on another state's province)
  "function provinceHasCoastOnPage(", "function heldPanelEdits("];
const liftAll = () => {
  const parts = FUNCS.map((f) => (Array.isArray(f) ? lift(f[0], f[1]) : lift(f)));
  for (const o of OPTIONAL) if (MASKED.indexOf("\n  " + o) !== -1) parts.push(lift(o));
  parts.push(lift("const NAVAL_ONLY_STATE_KEYS =", ";").replace(/^const /, "var "));
  parts.push(lift("const UNDO_LIMIT", ";").replace(/^const /, "var "));
  return withNoteHelpers(parts.join("\n"));
};
const DELETE_BTN = () => lift('$("miDeleteBtn").addEventListener("click"', "\n  });");

/** A row list the page's renderVpRows, collectVps and addVpRow can use. */
function vpListElement() {
  const rows = [];
  const row = () => {
    const kid = { ".mi-vp-prov": element("input"), ".mi-vp-val": element("input"), ".mi-vp-del": element("button") };
    const r = { querySelector: (s) => kid[s], remove() { const i = rows.indexOf(r); if (i >= 0) rows.splice(i, 1); } };
    return r;
  };
  const list = element("div");
  Object.defineProperty(list, "innerHTML", { get: () => "", set: () => { rows.length = 0; } });
  list.insertAdjacentHTML = () => { rows.push(row()); };
  Object.defineProperty(list, "lastElementChild", { get: () => rows[rows.length - 1] });
  list.querySelectorAll = () => rows.slice();
  return list;
}

/**
 * A page on `model` (buildMapModel's answer). `neighbours`: the province border graph (Map id -> Set), the world's own by default.
 * Returns { ctx, statuses, confirms, ... } with one method per thing the modder does.
 */
function openPage(md, roots, model, { neighbours = worldNeighbours, confirm = () => true, autoFix = true } = {}) {
  const m = JSON.parse(JSON.stringify({ states: model.states, provinces: model.provinces, provinceToState: model.provinceToState, strategicRegions: model.strategicRegions, supplyAreas: model.supplyAreas,
    provinceToRegion: model.provinceToRegion, stateToSupplyArea: model.stateToSupplyArea, capitals: model.capitals, adjacencies: model.adjacencies, supplyNodes: model.supplyNodes, railways: model.railways, terrainCategories: model.terrainCategories, terrainTypes: model.terrainTypes }));
  if (!m.provinceToRegion) { m.provinceToRegion = {}; for (const r of m.strategicRegions || []) for (const p of r.provinces || []) m.provinceToRegion[p] = r.id; }
  m.capitals = m.capitals || {};
  for (const s of m.states) s.displayName = s.displayName || s.name;
  const statuses = [], confirms = [];
  const els = new Map();
  const $ = (id) => { if (!els.has(id)) els.set(id, id === "miVpList" ? vpListElement() : element()); return els.get(id); };
  const bld = BLD.map((b) => Object.assign(element("input"), { dataset: { bld: b } }));
  const res = RES.map((r) => Object.assign(element("input"), { dataset: { res: r } }));
  const owners = [...new Set(m.states.map((s) => s.owner).filter(Boolean))].map((t) => ({ value: t }));
  const ctx = {
    console, JSON, Array, Number, Map, Set, String, Object, Math, RegExp, Date, Promise, setTimeout, clearTimeout,
    $, statusEl: { style: {}, textContent: "" }, info: { style: {} },
    window: { novaConfirm: undefined, confirm: (t) => { confirms.push(String(t)); return confirm(String(t)); } },
    document: { querySelectorAll: (sel) => (/data-bld/.test(sel) ? bld : /data-res/.test(sel) ? res : []), createElement: (t) => element(t) },
    countrySelect: Object.assign(element("select"), { options: owners }),
    model: m, countryColors: {}, provinceToOwner: {}, stateById: new Map(m.states.map((s) => [s.id, s])), provinceType: new Map(), provinceDef: new Map(),
    pendingWrites: [], paintDiff: new Map(), undoStack: [], redoStack: [], historyLabels: ["Loaded map"], checkpoints: [], saveGeneration: 0, dirtyMap: false,
    autoFix, mode: "inspect", panelMinimized: false, moveSource: null, moveTarget: null, mergeSource: null, selected: null, stateFormBaseline: null, stagingStateForm: false, attrClipboard: null,
    provNeighborsCache: null, baseImageData: null, baseImageDataPristine: null,
    erasedThisStroke: new Set(), eraseEmptied: new Set(), eraseSkippedInland: new Set(), eraseHeld: new Map(),
    setStatus: (s) => { statuses.push(String(s)); ctx.statusEl.textContent = String(s); },
    setMapDirty: (d) => { ctx.dirtyMap = !!d; }, updateSaveButton() {}, updateUndoButtons() {}, recolorAll() {}, draw() {}, buildPidGrid() {}, computeCentroids() {}, rebuildStagedRiversFromPending() {},
    regionRenameRefreshSelect() {}, supplyRenameRefreshSelect() {}, syncCountryColorInput() {}, renderCheckpoints() {}, renderHistoryPanel() {}, setMode: (x) => { ctx.mode = x; },
    nextProvisionalStateId: (() => { let n = 0; return () => --n; })(),
    buildProvNeighbors: () => { ctx.provNeighborsCache = neighbours(); },
    // what the page's own Save needs of the rest of the page; its posts go to map-data.js in this process
    stagedRiverEdits: [], riversShow: false, modPath: () => roots.modRoot, isVanillaTarget: () => false, problemsPanelOpen: () => false, refreshProblems() {}, loadRiversOverlay() {}, saveMapBackup() {}, openMapErrorsModal() {},
    load: async () => { throw new Error("load() was asked for"); },
    mapCrashGate: async ({ done, writeWarnings = [], paintWarnings = [], stopped = "" }) => { statuses.push(`${stopped ? "STOPPED: " + stopped + " " : "SAVED " + done + " "}${writeWarnings.concat(paintWarnings).join(" | ")}`); },
    fetch: async (url, o) => { const r = send(String(url), JSON.parse(o.body)); return { json: async () => Object.assign({ ok: !r.error }, r) }; },
  };
  for (const s of m.states) if (s.owner) for (const p of s.provinces || []) ctx.provinceToOwner[p] = s.owner;
  for (const p of m.provinces || []) { ctx.provinceType.set(p.id, p.type); ctx.provinceDef.set(p.id, p); }
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(liftAll(), ctx);
  vm.runInContext(DELETE_BTN().replace(/^\$\("miDeleteBtn"\)\.addEventListener\("click", /, "globalThis.__deleteClick = ("), ctx);
  const replayed = [];
  // one write, as server.js's handler passes it to map-data.js
  function send(url, b) {
    if (url === "/api/map/move-province") return md.moveProvince({ ...roots, provinceId: b.provinceId, toStateId: b.toStateId });
    if (url === "/api/map/set-state") return md.writeStateFields({ ...roots, stateId: b.stateId, fields: b.fields || {} });
    if (url === "/api/map/flip-province-sea") return md.flipProvinceToSea({ ...roots, provinceId: b.provinceId });
    if (url === "/api/map/merge-state") return md.mergeState({ ...roots, sourceStateId: b.sourceStateId, targetStateId: b.targetStateId });
    if (url === "/api/map/delete-state") return md.deleteState({ ...roots, stateId: b.stateId });
    if (url === "/api/map/create-state") return md.createState({ ...roots, name: b.name, owner: b.owner });
    return { error: "not replayed: " + url };
  }
  const page = {
    ctx, statuses, confirms, roots, $, bld, res,
    last: () => statuses[statuses.length - 1] || "",
    queue: () => ctx.pendingWrites.slice(),
    urls: () => ctx.pendingWrites.map((w) => w.url.replace("/api/map/", "")),
    state: (sid) => ctx.stateById.get(sid),
    /** Inspect: click province `pid`, the panel filling by the page's own showInfo. */
    inspect: (pid) => { ctx.mode = "inspect"; const sid = ctx.model.provinceToState[pid]; ctx.selected = { provinceId: pid, stateId: sid }; ctx.showInfo(); return page; },
    setBuilding: (k, v) => { bld.find((i) => i.dataset.bld === k).value = String(v); return page; },
    setResource: (k, v) => { res.find((i) => i.dataset.res === k).value = String(v); return page; },
    vpRows: () => $("miVpList").querySelectorAll().map((r) => `${r.querySelector(".mi-vp-prov").value}:${r.querySelector(".mi-vp-val").value}`),
    /** The panel's own Save state button. */
    saveStateButton: () => { ctx.saveState(); return page; },
    move: (pid, to, after) => { ctx.mode = "move"; ctx.selected = null; ctx.showInfo(); ctx.doMoveProvince(pid, ctx.model.provinceToState[pid], to, after); return page.last(); },
    merge: (src, dst) => { ctx.doMergeState(src, dst); return page.last(); },
    erase: (pid) => { ctx.beginEraseStroke(); const r = ctx.eraseProvinceLocal(pid); ctx.commitEraseStroke(); return r; },
    newState: (owner = "AAA") => {
      ctx.pushUndo("New state");
      const id = ctx.nextProvisionalStateId();
      const st = { id, name: `STATE_new${-id}`, displayName: `New state ${-id}`, provinces: [], owner, cores: owner ? [owner] : [], manpower: 0, category: "", victoryPoints: [], buildings: {}, resources: {}, provinceBuildings: {} };
      ctx.model.states.push(st); ctx.stateById.set(id, st);
      ctx.queueWrite("/api/map/create-state", { name: "", owner }, { create: true, provisionalId: id });
      return id;
    },
    /** The Delete button, on state `sid` as selected in the panel; returns what its confirms asked. */
    deleteState: (sid, pid) => { const st = ctx.stateById.get(sid); ctx.selected = { provinceId: pid !== undefined ? pid : (st && st.provinces[0]), stateId: sid }; confirms.length = 0; ctx.__deleteClick(); return confirms.slice(); },
    undo: () => ctx.doUndo(), redo: () => ctx.doRedo(),
    /** The Save: each queued write as server.js's handler passes it to map-data.js, in order, the provisional ids as the flush remaps them. */
    save: () => {
      const ids = {};
      const out = [];
      const num = (v) => (v != null && ids[v] != null ? ids[v] : v);
      while (ctx.pendingWrites.length) {
        const w = ctx.pendingWrites.shift(), b = Object.assign({}, w.body);
        for (const f of ["stateId", "toStateId", "sourceStateId", "targetStateId"]) if (f in b) b[f] = num(b[f]);
        const r = send(w.url, b);
        if (w.url === "/api/map/create-state") { ids[w.meta.provisionalId] = r.id; ctx.remapLocalStateId(w.meta.provisionalId, r.id, r); ctx.remapQueuedStateId(w.meta.provisionalId, r.id, r); }
        out.push(r);
        replayed.push({ url: w.url, body: b, result: r });
      }
      ctx.setMapDirty(false);
      return out;
    },
    /** The page's own 💾 Save, flushMapSaves, posting to map-data.js. Resolves to its last line. */
    flush: async () => { await ctx.flushMapSaves(); return page.last(); },
    replayed,
  };
  return page;
}
const stateText = (roots, sid) => {
  const d = path.join(roots.modRoot, "history", "states");
  if (!fs.existsSync(d)) return "";
  for (const f of fs.readdirSync(d)) { const t = fs.readFileSync(path.join(d, f), "utf8"); if (new RegExp("\\bid\\s*=\\s*" + sid + "\\b").test(t)) return t; }
  return "";
};
module.exports = { BLD, RES, RECT, hist, DEFAULT_STATES, DEFAULT_HISTORY, makeWorld, worldNeighbours, openPage, stateText, write };
