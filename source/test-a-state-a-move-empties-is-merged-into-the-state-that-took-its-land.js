// ⛔ #a-state-a-move-empties-is-merged-not-deleted — A STATE A PROVINCE MOVE LEAVES EMPTY GOES INTO THE STATE THAT TOOK ITS LAST
// PROVINCE, WITH ITS PEOPLE, ITS RESOURCES AND ITS BUILDINGS, AS A MERGE TAKES THEM — IT IS NOT DELETED WITH THEM.
//
// A move that empties a state (🛠 Auto-fix on) had the page queue POST /api/map/delete-state { stateId } for it, under "✅ Auto-fixed:
// deleted the now-empty state … Press Undo to bring it back" — and deleteState removes the file, with the manpower, the resources and the
// state-level buildings it holds. Merge (mergeState) exists for exactly this, "the safe one-click version of 'drag a state's land into
// another'", and carries all three onto the state it keeps. Since the first fill of a "+ New state" takes a share of its source's people
// (#a-new-state-is-carved-like-a-split), the delete lost real people: on a copy of the base game, a new HUN state filled with 686 and 701
// out of 155 took 146,507 of its 1,465,070; painting both back into 155 at the next Save (Undo had gone with that Save) queued move, move
// and delete-state, all three answered ok, and 155 kept 1,318,563 — 146,507 people gone, and the note did not mention them (review F2).
// Now the page queues /api/map/merge-state from the emptied state into the state that took its last province — the receiver of the move
// that emptied it — mirrors the carry in its own copy of that state as the Merge click does, and says the carry at the click and on the
// Save line. The Erase brush, which leaves no land to merge into, still deletes. Pinned over a base game that owns the map and the states:
//   (a) ⭐ the round trip: a "+ New state" carved out of KG at one Save and painted back at the next gives KG every person it had;
//   (b) ⭐ a state of the mod's own, with resources and a factory, emptied into its neighbour by a move: the neighbour's file is the one the
//       Merge button writes, byte for byte;
//   (c) CONTROLS: the Erase brush's call (no receiver) still deletes; a capital and a state from the layer below are still kept;
//   (d) ⭐ a state emptied into a "+ New state" no Save has written, whose province then moves on: the merge follows the land to the state
//       that has it, so neither the people nor the empty state are left behind.
// Run as the page runs it: doMoveProvince, deleteEmptiedStates and the helpers they call, then flushMapSaves, lifted out of public/map.js,
// their fetch answered by server.js's own handlers, lifted and run in-process. Every expected value is read off the fixture.
// Fixture-only: binds no port. Run: node test-a-state-a-move-empties-is-merged-into-the-state-that-took-its-land.js
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const vm = require("vm");
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-emptied-state-merge-"));
process.env.APPDATA = path.join(ROOT, "appdata"); process.env.NOVA_APP_DATA_DIR = process.env.APPDATA; process.env.XDG_CONFIG_HOME = process.env.APPDATA;
process.env.NOVA_HOME_DIR = path.join(ROOT, "home");
fs.mkdirSync(process.env.NOVA_HOME_DIR, { recursive: true });
const md = require("./map-data.js");
const P = require("./testlib-map-page.js");

let pass = 0, fail = 0;
const ok = (c, m, x) => {
  if (c) { pass++; console.log("  ok   " + m); }
  else { fail++; console.log("  FAIL " + m + (x !== undefined ? "   -> " + JSON.stringify(x).slice(0, 700) : "")); }
};
const write = (dir, rel, body) => { const p = path.join(dir, ...rel.split("/")); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, body); return p; };
function bmp24(W, H, fn) {
  const rs = Math.floor((24 * W + 31) / 32) * 4, b = Buffer.alloc(54 + rs * H);
  b.write("BM", 0, "ascii"); b.writeUInt32LE(b.length, 2); b.writeUInt32LE(54, 10); b.writeUInt32LE(40, 14);
  b.writeInt32LE(W, 18); b.writeInt32LE(H, 22); b.writeUInt16LE(1, 26); b.writeUInt16LE(24, 28); b.writeUInt32LE(rs * H, 34);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const [r, g, bl] = fn(x, y); const o = 54 + (H - 1 - y) * rs + x * 3; b[o] = bl; b[o + 1] = g; b[o + 2] = r; }
  return b;
}
function bmp8(W, H, fn) {
  const rs = Math.floor((8 * W + 31) / 32) * 4, off = 54 + 1024, b = Buffer.alloc(off + rs * H);
  b.write("BM", 0, "ascii"); b.writeUInt32LE(b.length, 2); b.writeUInt32LE(off, 10); b.writeUInt32LE(40, 14);
  b.writeInt32LE(W, 18); b.writeInt32LE(H, 22); b.writeUInt16LE(1, 26); b.writeUInt16LE(8, 28); b.writeUInt32LE(rs * H, 34); b.writeUInt32LE(256, 46);
  for (let i = 0; i < 256; i++) { b[54 + i * 4] = i; b[54 + i * 4 + 1] = i; b[54 + i * 4 + 2] = i; }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) b[off + (H - 1 - y) * rs + x] = fn(x, y);
  return b;
}

// ── the world: 9 x 5 provinces of 12 px, id = row * 9 + col + 1; land on rows 1-3, cols 0-7, sea round it ─────────────────────────
const CELL = 12, COLS = 9, ROWS = 5, W = COLS * CELL, H = ROWS * CELL;
const idAt = (c, r) => r * COLS + c + 1;
const provAt = (x, y) => idAt(Math.floor(x / CELL), Math.floor(y / CELL));
const colour = (id) => [(id * 29) % 256, (id * 67) % 256, 30 + id];
const cells = (cs, rs) => { const out = []; for (const r of rs) for (const c of cs) out.push(idAt(c, r)); return out; };
//   KG: four provinces, a town of 8,000 — what the round trip carves and paints back; CS: one province, with resources and a factory
const STATES = [
  { name: "KG", category: "town", manpower: 8000, provinces: cells([0, 1, 2, 3], [1]), identity: ["owner = AAA", "# Korea's land, not the owner's", "add_core_of = BBB"], vp: [idAt(0, 1), 3] },
  { name: "AH", category: "city", manpower: 20000, provinces: cells([4, 5, 6, 7], [1]), identity: ["owner = AAA", "add_core_of = AAA"], vp: [idAt(5, 1), 20] },
  { name: "BH", category: "rural", manpower: 3000, provinces: cells([0, 1, 2, 3], [2, 3]), identity: ["owner = BBB", "add_core_of = BBB"], vp: [idAt(1, 2), 5] },
  { name: "CH", category: "rural", manpower: 2500, provinces: cells([4, 5, 6], [2, 3]), identity: ["owner = CCC", "add_core_of = CCC"], vp: [idAt(5, 2), 5] },
  { name: "IS", category: "large_town", manpower: 700, provinces: cells([7], [2]), identity: ["owner = CCC", "add_core_of = CCC"], vp: null },
  { name: "CS", category: "rural", manpower: 900, provinces: cells([7], [3]), identity: ["owner = CCC", "add_core_of = CCC"], vp: null, steel: 4, factory: 1 },
].map((s, k) => ({ ...s, id: k + 1 }));
const S = Object.fromEntries(STATES.map((s) => [s.name, s]));
const LAND = new Set(STATES.flatMap((s) => s.provinces));
const CAPITALS = { AAA: S.AH.id, BBB: S.BH.id, CCC: S.CH.id };
// KG's file is CRLF, the rest LF: a write that rebuilt a file's endings would show
const stateFile = (s) => {
  const t = `state={\n\tid=${s.id}\n\tname="STATE_${s.id}" # ${s.name}\n\tmanpower=${s.manpower}\n\tstate_category=${s.category}\n\tprovinces={ ${s.provinces.join(" ")} }\n`
    + (s.steel ? `\tresources={\n\t\tsteel=${s.steel} # the ore of ${s.name}\n\t}\n` : "")
    + `\thistory={\n${s.identity.map((l) => `\t\t${l}\n`).join("")}${s.vp ? `\t\tvictory_points = { ${s.vp[0]} ${s.vp[1]} }\n` : ""}`
    + `\t\tbuildings = { infrastructure = 2${s.factory ? ` industrial_complex = ${s.factory}` : ""} }\n\t}\n}\n`;
  return s.name === "KG" ? t.replace(/\n/g, "\r\n") : t;
};

const GAME = path.join(ROOT, "game");
write(GAME, "hoi4.exe", "");
write(GAME, "common/terrain/00_terrain.txt", ["categories = {", "  plains = { color = { 200 200 100 } }", "  ocean = { color = { 0 0 200 } is_water = yes }", "}",
  "terrain = {", "  plains = { type = plains color = { 0 } }", "  ocean = { type = ocean color = { 15 } }", "}", ""].join("\n"));
write(GAME, "map/provinces.bmp", bmp24(W, H, (x, y) => colour(provAt(x, y))));
{
  const rows = ["0;0;0;0;land;false;unknown;0"];
  for (let id = 1; id <= COLS * ROWS; id++) rows.push(`${id};${colour(id).join(";")};${LAND.has(id) ? "land;false;plains;1" : "sea;false;ocean;0"}`);
  write(GAME, "map/definition.csv", rows.join("\n") + "\n");
}
write(GAME, "map/terrain.bmp", bmp8(W, H, (x, y) => (LAND.has(provAt(x, y)) ? 0 : 15)));
write(GAME, "map/heightmap.bmp", bmp8(W, H, (x, y) => (LAND.has(provAt(x, y)) ? 106 : 89)));
write(GAME, "map/adjacencies.csv", "From;To;Type;Through;start_x;start_y;stop_x;stop_y;adjacency_rule_name;Comment\n-1;-1;-1;-1;-1;-1;-1;-1;-1\n");
write(GAME, "map/strategicregions/r1.txt", `strategic_region={\n\tid=1\n\tname="REGION_1"\n\tprovinces={ ${[...LAND].join(" ")} }\n\tweather={}\n}\n`);
{
  const sea = []; for (let id = 1; id <= COLS * ROWS; id++) if (!LAND.has(id)) sea.push(id);
  write(GAME, "map/strategicregions/r2.txt", `strategic_region={\n\tid=2\n\tname="REGION_2"\n\tprovinces={ ${sea.join(" ")} }\n\tnaval_terrain=water_shallow_sea\n\tweather={}\n}\n`);
}
for (const s of STATES) write(GAME, `history/states/${s.id}-${s.name}.txt`, stateFile(s));
for (const [t, c] of Object.entries(CAPITALS)) write(GAME, `history/countries/${t} - ${t}.txt`, `capital = ${c}\n`);

/** a new mod over the base game, as the owner's own are (`ownStates` false), or one that replaces history/states with its own copy of
 *  every state, as a generated world does — every state the mod's own, so a move can empty one Nova may remove */
function makeMod(tag, { ownStates = false } = {}) {
  const m = path.join(ROOT, tag);
  write(m, "descriptor.mod", `name="${tag}"\n${ownStates ? 'replace_path="history/states"\n' : ""}supported_version="1.*"\n`);
  if (ownStates) for (const s of STATES) write(m, `history/states/${s.id}-${s.name}.txt`, stateFile(s));
  return m;
}
const stateFileIn = (m, id) => {
  const dir = path.join(m, "history", "states");
  for (const f of (fs.existsSync(dir) ? fs.readdirSync(dir) : []).filter((x) => /\.txt$/i.test(x))) {
    let t = ""; try { t = fs.readFileSync(path.join(dir, f), "utf8"); } catch (_) { continue; }
    if (new RegExp(`^\\s*id\\s*=\\s*${id}\\s*$`, "m").test(t.replace(/#[^\n]*/g, ""))) return path.join(dir, f);
  }
  return null;
};
const scalarOf = (text, key) => { const m = new RegExp(`(?:^|\\s)${key}\\s*=\\s*([A-Za-z0-9_.]+)`).exec(String(text || "").replace(/#[^\n]*/g, "")); return m ? m[1] : null; };
const modelOf = (m) => md.buildMapModel({ modRoot: m, gameRoot: GAME, dependencyRoots: [], cacheStableLayers: false });

// ── server.js's own handlers for the routes these clicks and Saves post, lifted and run in-process (no port) ──────────────────────────
const SERVER = fs.readFileSync(path.join(__dirname, "server.js"), "utf8").replace(/\r\n/g, "\n");
const routes = {};
const ROUTES = ["/api/map/create-state", "/api/map/move-province", "/api/map/merge-state", "/api/map/delete-state"];
for (const url of ROUTES) {
  const at = SERVER.indexOf(`app.post("${url}"`);
  const end = at < 0 ? -1 : SERVER.indexOf("\n  app.", at + 10);
  if (at < 0 || end < 0) continue;
  vm.runInNewContext(SERVER.slice(at, end), {
    app: { post: (u, mw, fn) => { routes[u] = fn; } }, express: { json: () => null }, mapData: md, DEV_ROOT: "<dev>",
    getActiveRoot: () => "", checkActiveRootNotGameRoot() {}, resolveHoi4GameRoot: () => GAME, resolveDependencyRootsForAssets: () => [],
    forgetRemovedStateName: () => null, localiseNewStateNames: () => ({ names: {}, written: 0, kept: 0, file: "" }),
    generatedStateNameEntries: (m, xs) => xs.map((x) => ({ value: `State ${x.id}` })), languageErrorsNote: () => "",
  });
}
const serve = (url, body) => {
  let status = 200, json = null;
  routes[url]({ body }, { status(c) { status = c; return this; }, json(j) { json = j; return this; } });
  return { status, json: json || {} };
};

// ── the page: its own copy of the states as load() gives it, the click, and the Save ──────────────────────────────────────────────────
/** the page's states as load() gives them: id, name, owner, provinces, cores, manpower, buildings, resources, inBaseLayer */
const pageModel = (m) => {
  const mm = modelOf(m);
  const states = mm.states.map((s) => ({ id: s.id, name: s.name, displayName: (STATES.find((x) => x.id === s.id) || {}).name || "", owner: s.owner, cores: (s.cores || []).slice(),
    provinces: (s.provinces || []).slice(), inBaseLayer: !!s.inBaseLayer, manpower: s.manpower, buildings: Object.assign({}, s.buildings || {}),
    resources: Object.assign({}, s.resources || {}), victoryPoints: (s.victoryPoints || []).map((v) => ({ ...v })) }));
  const provinceToState = {};
  for (const s of states) for (const p of s.provinces) provinceToState[p] = s.id;
  return { states, capitals: Object.assign({}, mm.capitals), provinceToState, provinceToRegion: Object.assign({}, mm.provinceToRegion || {}), strategicRegions: [], supplyNodes: [] };
};
const CLICK = ["function queueWrite(", "function stateMoveRegionTarget(", "function deleteEmptiedStates(", "function inheritedEmptyWarning(", "function doMoveProvince("]
  .map((o) => { try { return P.lift(o); } catch (_) { return ""; } });
// (⛔ #a-panel-edit-sends-what-the-modder-changed, #a-moved-coast-takes-its-dockyards, #a-dropped-paint-refuses-what-rests-on-it — what the click and the Delete
// button call since they move each province's levels, the dockyards with a state's last coast, and refuse a drop a later write rests on; none a …Note helper)
const PAGE_HELPERS = ["function moveProvinceLevels(", "function coastDockyardsThatGo(", "function paintDropRefusal(", "function unmirrorDroppedMove(", "function emptiedStatesYardWords(",
  "function navalLevelsWords(", "function stateNavalLevels(", "function giveNavalDated(", "function navalDatedAfterCarry("]
  .map((o) => { try { return P.lift(o); } catch (_) { return ""; } })
  .concat([(() => { try { return P.lift("const NAVAL_ONLY_STATE_KEYS =", ";").replace(/^const /, "var "); } catch (_) { return ""; } })()]);
/** a page session over mod `m`: its model loaded from disk, the click functions run in it. → { sb, statuses } */
function pageSession(m) {
  const model = pageModel(m);
  const statuses = [];
  const sb = {
    console, JSON, Map, Set, Math, Number, String, Object, Array,
    model, stateById: new Map(model.states.map((s) => [s.id, s])), provinceToOwner: {}, pendingWrites: [], paintDiff: new Map(), autoFix: true,
    moveSource: null, moveTarget: null, statusEl: { style: {}, textContent: "" }, provinceType: new Map([...LAND].map((p) => [p, "land"])),
    setStatus: (t) => { statuses.push(String(t)); sb.statusEl.textContent = String(t); }, setMapDirty: () => {}, pushUndo: () => {}, recolorAll: () => {}, draw: () => {},
    stageProvinceRegionMove: () => {}, window: { confirm: () => true },
    STATE_ID_FIELDS, provinceDef: new Map(), provNeighborsCache: new Map(),   // (the Delete button's drop check and the coast the click reads)
  };
  for (const s of model.states) for (const p of s.provinces) if (s.owner) sb.provinceToOwner[p] = s.owner;
  sb.globalThis = sb;
  vm.createContext(sb);
  vm.runInContext(P.withNoteHelpers(CLICK.concat(PAGE_HELPERS).join("\n")), sb);
  return { sb, statuses };
}
/** the page's "+ New state", as its button stages one: a provisional state and its queued create */
const stageNewState = (sb, owner) => {
  const provId = -1;
  const st = { id: provId, name: `STATE_new${-provId}`, displayName: `New state ${-provId}`, provinces: [], owner, cores: owner ? [owner] : [], manpower: 0, category: "", victoryPoints: [], buildings: {}, resources: {}, provinceBuildings: {} };
  sb.model.states.push(st); sb.stateById.set(provId, st);
  sb.pendingWrites.push({ url: "/api/map/create-state", body: { name: "", owner }, meta: { create: true, provisionalId: provId } });
  return provId;
};

const FLUSH = (() => { try { return P.lift("async function flushMapSaves", "} finally { if (btn) btn.disabled = false; updateSaveButton(); }\n  }"); } catch (_) { return ""; } })();
const HELPERS = ["async function mapCrashGate", "function markSaveBoundary", "function orphanedQueuedWrites(", "function emptyNewStateWrites(", "function setCapitalNote(",
  "function capitalTownNotes(", "function adoptCapitalTown(", "function firstLandNote(", "function adoptFirstLand("].map((o) => { try { return P.lift(o); } catch (_) { return ""; } });
const fieldsMatch = /const STATE_ID_FIELDS = \[([^\]]*)\]/.exec(P.MASKED);
const STATE_ID_FIELDS = fieldsMatch ? [...fieldsMatch[1].matchAll(/"([A-Za-z]+)"/g)].map((x) => x[1]) : [];
/** 💾 Save through the page, over the session's own queue and model. → { status (the Save line), requests: [{ url, body, res }] } */
async function saveThroughThePage(m, session, { remap = false } = {}) {
  let status = "";
  const requests = [];
  const page = session.sb;
  const sandbox = {
    console, JSON, encodeURIComponent, Set, Map,
    pendingWrites: page.pendingWrites, paintDiff: new Map(), statusEl: { style: {} }, stateById: page.stateById, model: page.model,
    stagedRiverEdits: [], undoStack: [], redoStack: [], historyLabels: [], saveGeneration: 0, baseImageData: null, baseImageDataPristine: null,
    setStatus: (s) => { status = String(s); }, setMapDirty: () => {}, updateSaveButton: () => {}, modPath: () => m,
    isVanillaTarget: () => false, problemsPanelOpen: () => false, refreshProblems: () => {}, renderCheckpoints: () => {},
    buildPidGrid: () => {}, computeCentroids: () => {}, recolorAll: () => {}, draw: () => {}, loadRiversOverlay: () => {},
    stateFormDirty: () => false, stateFormBaseline: null, selected: null,
    stageStateWrite: () => {}, remapQueuedStateId: () => {}, remapLocalStateId: () => {}, provincesBmpNote: () => "", riversPaintNote: () => "", heightmapNote: () => "", STATE_ID_FIELDS,
    adoptMergeRegions: () => 0, openMapErrorsModal: () => {}, saveMapBackup: () => {}, updateUndoButtons: () => {},
    rebuildStagedRiversFromPending: () => {}, $: () => null, window: { NovaMapRuleLabels: require("./public/map-rule-labels.js") }, provinceDef: new Map(), provinceToOwner: page.provinceToOwner,
    fetch: async (url, opts) => {
      const u = String(url);
      if (u.indexOf("/api/map/validate") === 0) return { ok: true, status: 200, json: async () => ({ ok: true, errors: 0, warnings: 0, problems: [] }) };
      const body = opts && opts.body ? JSON.parse(opts.body) : {};
      const r = routes[u] ? serve(u, body) : { status: 404, json: { ok: false, error: "no such route in this test: " + u } };
      requests.push({ url: u, body, res: r.json });
      return { ok: r.status === 200, status: r.status, json: async () => r.json };
    },
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  // (`remap`: the page's own, which give a state the Save creates its real id on the page's copy too)
  const REMAP = remap ? ["function remapQueuedStateId(", "function remapLocalStateId("].map((o) => P.lift(o)).join("\n") : "";
  vm.runInContext(P.withNoteHelpers(`${HELPERS.join("\n")}\n${REMAP}\n${FLUSH}`) + "\nglobalThis.__run = flushMapSaves;", sandbox);
  await sandbox.__run();
  page.pendingWrites = sandbox.pendingWrites;
  return { status, requests };
}
const urls = (sb) => sb.pendingWrites.map((w) => w.url);

(async () => {
  console.log("\n-- the fixture, and the page's code, can tell right from wrong --");
  ok(CLICK.every((t) => t.length > 60) && FLUSH.length > 500 && HELPERS.every((h) => h.length > 60) && ROUTES.every((u) => typeof routes[u] === "function"),
    "(doMoveProvince, deleteEmptiedStates and flushMapSaves are lifted out of public/map.js, and server.js's handlers for the four routes out of server.js)",
    { click: CLICK.map((t) => t.length), flush: FLUSH.length, routes: Object.keys(routes) });
  const SHARE = Math.round(S.KG.manpower / S.KG.provinces.length);
  ok(SHARE === 2000 && SHARE !== 1000, `(the fixture: the first fill of a new state carved from KG takes ${SHARE} of KG's ${S.KG.manpower} people)`);

  console.log("\n-- ⭐ (a) a \"+ New state\" carved at one Save and painted back at the next gives KG every person it had --");
  {
    const m = makeMod("mod-round-trip");
    // Save 1: what the page posts for "+ New state" and two fill clicks
    const c = md.createState({ modRoot: m, gameRoot: GAME, dependencyRoots: [], name: "", owner: "AAA" });
    const [p1, p2] = [S.KG.provinces[1], S.KG.provinces[2]];
    const f1 = serve("/api/map/move-province", { provinceId: p1, toStateId: c.id, modPath: m }).json, f2 = serve("/api/map/move-province", { provinceId: p2, toStateId: c.id, modPath: m }).json;
    const kgFile = stateFileIn(m, S.KG.id);
    ok(c.ok && f1.ok && f2.ok && (f1.firstLand || {}).manpower === SHARE && Number(scalarOf(fs.readFileSync(stateFileIn(m, c.id), "utf8"), "manpower")) === SHARE
      && Number(scalarOf(fs.readFileSync(kgFile, "utf8"), "manpower")) === S.KG.manpower - SHARE,
      `(guard, Save 1: new state ${c.id} holds ${p1} and ${p2} and ${SHARE} people, KG keeps ${S.KG.manpower - SHARE})`, { c, f1: f1.firstLand, f2: f2.error });
    // Save 2, through the page: both provinces painted back into KG — the second move empties the new state
    const sess = pageSession(m), sb = sess.sb;
    sb.doMoveProvince(p1, c.id, S.KG.id);
    sb.doMoveProvince(p2, c.id, S.KG.id);
    const q = sb.pendingWrites;
    ok(!urls(sb).includes("/api/map/delete-state"), "⭐⭐⭐ the click queues no delete-state for the state it emptied", urls(sb));
    const mq = q.find((w) => w.url === "/api/map/merge-state");
    ok(mq && mq.body.sourceStateId === c.id && mq.body.targetStateId === S.KG.id && q.indexOf(mq) === q.length - 1 && mq.meta && mq.meta.merge === true,
      `⭐⭐⭐ …it queues a Merge of state ${c.id} into KG, the state that took its last province, after the move that emptied it`, q.map((w) => [w.url, w.body]));
    const line = sess.statuses[sess.statuses.length - 1] || "";
    ok(/merged/i.test(line) && line.includes("KG") && line.includes(SHARE.toLocaleString()) && /Undo/.test(line),
      `⭐⭐ the click says so: merged into KG, with its ${SHARE.toLocaleString()} people, and that Undo brings it back`, line);
    ok(!/deleted the now-empty/.test(line), "⭐ …and no longer that it deleted the state", line);
    ok(Number(sb.stateById.get(S.KG.id).manpower) === S.KG.manpower && !sb.stateById.has(c.id),
      `⭐⭐ the page's own copy of KG holds the ${S.KG.manpower} people the Merge will give it, so the state panel's next save does not send ${S.KG.manpower - SHARE} back`, sb.stateById.get(S.KG.id));
    const s = await saveThroughThePage(m, sess);
    const answers = s.requests.map((r) => [r.url, r.res && (r.res.error || r.res.ok)]);
    ok(s.requests.length >= 3 && s.requests.slice(0, 3).every((r) => r.res && r.res.ok) && !s.requests.some((r) => r.url === "/api/map/delete-state"), "(guard: move, move and merge all landed)", answers);
    const kg = fs.readFileSync(kgFile, "utf8");
    ok(Number(scalarOf(kg, "manpower")) === S.KG.manpower, `⭐⭐⭐ on disk KG has ${S.KG.manpower} people again — the ${SHARE} the carve took came back with the land`, scalarOf(kg, "manpower"));
    ok(!stateFileIn(m, c.id) && !modelOf(m).states.some((x) => x.id === c.id), `⭐⭐ …and state ${c.id} is gone, as the delete would have left it`, stateFileIn(m, c.id));
    const kgModel = modelOf(m).states.find((x) => x.id === S.KG.id) || {};
    ok(JSON.stringify((kgModel.provinces || []).slice().sort((a, b) => a - b)) === JSON.stringify(S.KG.provinces.slice().sort((a, b) => a - b)) && kg.includes("# Korea's land, not the owner's")
      && kg.includes(`victory_points = { ${S.KG.vp[0]} ${S.KG.vp[1]} }`) && kg.includes("# KG"),
      "…KG holds its four provinces, its comments on their keys, its victory point", { provinces: kgModel.provinces, kg });
    ok(/\r\n/.test(kg) && !/[^\r]\n/.test(kg), "…and its file is still CRLF, every line of it", kg.slice(0, 120));
    ok(/merged/i.test(s.status) && s.status.includes("KG") && s.status.includes(SHARE.toLocaleString()), `⭐⭐ the Save line says the emptied state was merged into KG with its ${SHARE.toLocaleString()} people`, s.status);
  }

  console.log("\n-- ⭐ (b) a state of the mod's own, emptied into its neighbour by a move, is merged as the Merge button merges it --");
  {
    const m = makeMod("mod-own-states", { ownStates: true });
    const twin = makeMod("mod-own-states-merged", { ownStates: true });
    const p = S.CS.provinces[0];
    const sess = pageSession(m), sb = sess.sb;
    ok(!sb.stateById.get(S.CS.id).inBaseLayer && Number(sb.stateById.get(S.CS.id).resources.steel) === S.CS.steel,
      "(guard: CS is the mod's own, with its steel, as the page loads it)", sb.stateById.get(S.CS.id));
    sb.doMoveProvince(p, S.CS.id, S.CH.id);
    ok(JSON.stringify(sb.pendingWrites.map((w) => w.url)) === JSON.stringify(["/api/map/move-province", "/api/map/merge-state"]) && sb.pendingWrites[1].body.sourceStateId === S.CS.id && sb.pendingWrites[1].body.targetStateId === S.CH.id,
      "⭐⭐⭐ moving CS's only province into CH queues the move and a Merge of CS into CH — no delete", sb.pendingWrites.map((w) => [w.url, w.body]));
    const ch = sb.stateById.get(S.CH.id);
    ok(Number(ch.manpower) === S.CH.manpower + S.CS.manpower && Number((ch.resources || {}).steel) === S.CS.steel && Number((ch.buildings || {}).industrial_complex) === S.CS.factory,
      "⭐⭐ the page's copy of CH holds CS's people, steel and factory, as the Merge click mirrors them", ch);
    const lineB = sess.statuses[sess.statuses.length - 1] || "";
    ok(/merged the now-empty state CS into CH/.test(lineB) && lineB.includes(S.CS.manpower.toLocaleString()) && lineB.includes("steel") && lineB.includes("industrial complex"),
      "⭐ …and the click names what goes with the land: its people, its steel, its factory", lineB);
    const s = await saveThroughThePage(m, sess);
    ok(s.requests.every((r) => r.res && r.res.ok), "(guard: the move and the merge landed)", s.requests.map((r) => [r.url, r.res && (r.res.error || r.res.ok)]));
    const byHand = serve("/api/map/merge-state", { sourceStateId: S.CS.id, targetStateId: S.CH.id, modPath: twin }).json;
    const a = fs.readFileSync(stateFileIn(m, S.CH.id), "utf8"), b = fs.readFileSync(stateFileIn(twin, S.CH.id), "utf8");
    ok(byHand.ok && a === b, "⭐⭐⭐ CH's file is the one the Merge button writes, byte for byte", { a, b });
    ok(Number(scalarOf(a, "manpower")) === S.CH.manpower + S.CS.manpower && Number(scalarOf(a, "steel")) === S.CS.steel && Number(scalarOf(a, "industrial_complex")) === S.CS.factory,
      `⭐⭐ …with CS's ${S.CS.manpower} people, its steel and its factory`, a);
    ok(!stateFileIn(m, S.CS.id) && !stateFileIn(twin, S.CS.id), "…and CS's file gone, as the Merge leaves it");
  }

  console.log("\n-- (c) CONTROLS --");
  {
    const sess = pageSession(makeMod("mod-controls", { ownStates: true })), sb = sess.sb;
    const cs = sb.stateById.get(S.CS.id);
    cs.provinces = [];
    const r = sb.deleteEmptiedStates([cs]);
    ok(r.deleted.length === 1 && JSON.stringify(sb.pendingWrites.map((w) => [w.url, w.body])) === JSON.stringify([["/api/map/delete-state", { stateId: S.CS.id }]]),
      "CONTROL: the Erase brush's call names no receiver — its land is sea now, there is nothing to merge into — and still deletes", sb.pendingWrites);
    const ch = sb.stateById.get(S.CH.id); ch.provinces = [];
    const r2 = sb.deleteEmptiedStates([ch], S.IS.id);
    ok(r2.keptCapitals.length === 1 && sb.pendingWrites.length === 1, "CONTROL: a capital a move empties is kept, and nothing is queued for it", { r2, q: sb.pendingWrites });
    const sess2 = pageSession(makeMod("mod-controls-overlay")), sb2 = sess2.sb;
    const is = sb2.stateById.get(S.IS.id); is.provinces = [];
    const r3 = sb2.deleteEmptiedStates([is], S.CS.id);
    ok(is.inBaseLayer && r3.keptInherited.length === 1 && !sb2.pendingWrites.length, "CONTROL: a state from the layer below is kept, and nothing is queued for it", { r3, q: sb2.pendingWrites });
  }

  console.log("\n-- ⭐ (d) a state emptied into a \"+ New state\" no Save has written, whose province then moves on --");
  {
    const m = makeMod("mod-provisional", { ownStates: true });
    const sess = pageSession(m), sb = sess.sb;
    const n = stageNewState(sb, "CCC");
    const p = S.CS.provinces[0];
    sb.doMoveProvince(p, S.CS.id, n);
    const mq = sb.pendingWrites.find((w) => w.url === "/api/map/merge-state") || { body: {} };
    ok(mq.body.sourceStateId === S.CS.id && mq.body.targetStateId === n, `(guard: CS emptied into the new state ${n} queues a Merge into it)`, sb.pendingWrites.map((w) => [w.url, w.body]));
    sb.doMoveProvince(p, n, S.CH.id);
    ok(!sb.pendingWrites.some((w) => w.meta && w.meta.create) && mq.body.targetStateId === S.CH.id,
      "⭐⭐⭐ the new state, emptied in turn, is dropped with its create — and the Merge of CS follows the land into CH", sb.pendingWrites.map((w) => [w.url, w.body]));
    ok(Number(sb.stateById.get(S.CH.id).manpower) === S.CH.manpower + S.CS.manpower, "⭐⭐ …and the page's copy of CH holds CS's people", sb.stateById.get(S.CH.id));
    const s = await saveThroughThePage(m, sess);
    const ch = fs.readFileSync(stateFileIn(m, S.CH.id), "utf8");
    ok(Number(scalarOf(ch, "manpower")) === S.CH.manpower + S.CS.manpower && !stateFileIn(m, S.CS.id) && modelOf(m).states.every((x) => x.id > 0 && x.id <= STATES.length)
      && (modelOf(m).states.find((x) => x.id === S.CH.id) || {}).provinces.includes(p),
      "⭐⭐⭐ on disk CH has CS's land and its people, CS is gone, and no new state was written", { ch, requests: s.requests.map((r) => [r.url, r.body, r.res && (r.res.error || r.res.ok)]) });
    ok(!modelOf(m).states.some((x) => (x.provinces || []).length === 0), "…and no state is left empty", modelOf(m).states.filter((x) => !(x.provinces || []).length).map((x) => x.id));
    // …and when the new state's land is then erased (the Erase brush's call names no receiver), there is no land left to follow: the
    // merge of CS into it goes back to the delete it was, so CS — emptied on disk by the erase — is not left as an empty state
    const sess2 = pageSession(makeMod("mod-provisional-erased", { ownStates: true })), sb2 = sess2.sb;
    const n2 = stageNewState(sb2, "CCC");
    sb2.doMoveProvince(p, S.CS.id, n2);
    const nst = sb2.stateById.get(n2); nst.provinces = [];
    sb2.deleteEmptiedStates([nst]);
    ok(JSON.stringify(sb2.pendingWrites.map((w) => [w.url, w.body])) === JSON.stringify([["/api/map/move-province", { provinceId: p, toStateId: n2 }], ["/api/map/delete-state", { stateId: S.CS.id }]]),
      "⭐⭐ a new state erased in turn takes its create with it, and the Merge of CS into it is a delete of CS again", sb2.pendingWrites.map((w) => [w.url, w.body]));
  }

  console.log("\n-- ⭐ (e) a \"+ New state\" filled with ALL of a state's land: its people, once each, on the disk and on the page (review T03, T14) --");
  {
    const newStateTakes = async (tag, st, { edit = null } = {}) => {
      const m = makeMod(tag, { ownStates: true });
      if (edit) fs.writeFileSync(stateFileIn(m, st.id), edit(fs.readFileSync(stateFileIn(m, st.id), "utf8")));
      const sess = pageSession(m), sb = sess.sb;
      const n = stageNewState(sb, st.identity[0].split("=")[1].trim());
      const local = sb.stateById.get(n);
      for (const p of st.provinces) sb.doMoveProvince(p, st.id, n);
      const s = await saveThroughThePage(m, sess, { remap: true });
      const created = (s.requests.find((r) => r.url === "/api/map/create-state") || { res: {} }).res.id;
      return { m, s, created, disk: Number(scalarOf(fs.readFileSync(stateFileIn(m, created), "utf8"), "manpower")), page: Number(local.manpower), urls: s.requests.map((r) => [r.url, r.res && (r.res.error || r.res.ok)]), srcGone: !stateFileIn(m, st.id) };
    };
    // (e1) four provinces: the first fill's share, then the merge of the rest
    const a = await newStateTakes("mod-new-state-takes-all", S.KG);
    ok(a.urls.every((u) => u[1] === true) && a.srcGone, "(guard: every write landed, and KG, emptied, was merged into the new state)", a.urls);
    ok(a.disk === S.KG.manpower, `⭐⭐ on disk the new state has KG's ${S.KG.manpower} people`, a.disk);
    ok(a.page === S.KG.manpower, `⭐⭐⭐ …and so does the page's own copy, which the first fill's share of ${SHARE} left short: the state panel's next save wrote that share to the disk`, a.page);
    // (e2) one province: no 1,000 on top of the land's own
    const b = await newStateTakes("mod-new-state-takes-one", S.CS);
    ok(b.urls.every((u) => u[1] === true) && b.srcGone, "(guard: every write landed, and CS, emptied, was merged into the new state)", b.urls);
    ok(b.disk === S.CS.manpower, `⭐⭐⭐ on disk the new state has CS's ${S.CS.manpower} people, not ${S.CS.manpower + 1000}: a state holding moved land has none invented`, b.disk);
    ok(b.page === S.CS.manpower, "⭐⭐ …and so does the page's own copy", b.page);
    ok(!/\b1 people\b/.test(b.s.status) && /its 1 person\b/.test(b.s.status), "⭐ …and the Save line reads right of the one its emptied state brings", b.s.status);
    // (e3) one province, and one person (Millennium Dawn ships eight such states, Old World Blues five, Novum Vexillum two)
    const c = await newStateTakes("mod-new-state-takes-one-person", S.CS, { edit: (t) => t.replace(/manpower=\d+/, () => "manpower=1") });
    ok(c.urls.every((u) => u[1] === true) && c.srcGone && c.disk === 1 && c.page === 1, "⭐⭐ a state of one province and one person gives the new state one person, not 1,001", { disk: c.disk, page: c.page, urls: c.urls });
    // (e4) CONTROL: a plain merge still ends where the click's mirror put it
    const m = makeMod("mod-new-state-control", { ownStates: true });
    const sess = pageSession(m), sb = sess.sb;
    sb.doMoveProvince(S.CS.provinces[0], S.CS.id, S.CH.id);
    const before = Number(sb.stateById.get(S.CH.id).manpower);
    await saveThroughThePage(m, sess, { remap: true });
    ok(before === S.CH.manpower + S.CS.manpower && Number(sb.stateById.get(S.CH.id).manpower) === before && Number(scalarOf(fs.readFileSync(stateFileIn(m, S.CH.id), "utf8"), "manpower")) === before, "CONTROL: a merge into a state on disk: the click's sum, the page after the Save and the disk are one number", { before, page: sb.stateById.get(S.CH.id).manpower });
  }

  console.log("\n-- ⭐ (f) 🗑 Delete on a \"+ New state\" a state was merged into refuses, and names the way back (review T14) --");
  {
    // the button's own handler
    const DELETE_CLICK = P.lift('$("miDeleteBtn").addEventListener("click", () => {', "recolorAll(); draw();\n  });");
    const deleteClick = (sb, stateId) => {
      const handlers = {};
      sb.$ = (id) => ({ addEventListener: (_, fn) => { handlers[id] = fn; } });
      sb.selected = { stateId };
      sb.info = { style: {} };
      sb.setProvinceRegionLocally = () => {};
      vm.runInContext(DELETE_CLICK, sb);
      handlers.miDeleteBtn();
    };
    const m = makeMod("mod-delete-took-a-merge", { ownStates: true });
    const before = fs.readFileSync(stateFileIn(m, S.CS.id), "utf8");
    const sess = pageSession(m), sb = sess.sb;
    const n = stageNewState(sb, "CCC");
    sb.doMoveProvince(S.CS.provinces[0], S.CS.id, n);
    const q = sb.pendingWrites.map((w) => w.url);
    ok(q.includes("/api/map/merge-state") && !sb.stateById.has(S.CS.id), "(guard: CS, emptied into the new state, is off the page with a Merge queued)", q);
    let asked = 0, undoSteps = 0;
    sb.window.confirm = () => { asked++; return true; };
    sb.pushUndo = () => { undoSteps++; };
    deleteClick(sb, n);
    const line = sess.statuses[sess.statuses.length - 1] || "";
    ok(sb.stateById.has(n) && JSON.stringify(sb.pendingWrites.map((w) => w.url)) === JSON.stringify(q) && sb.stateById.get(n).provinces.includes(S.CS.provinces[0]),
      "⭐⭐⭐ the new state stays, with its land and every queued write: discarding them left CS off the page, and on the disk, with \"Nothing to save\"", { queue: sb.pendingWrites.map((w) => w.url), status: line });
    ok(/🚫/.test(line) && /Undo \(Ctrl\+Z\)/.test(line) && /Save/.test(line), "⭐⭐ …and the line says why, and how to get either", line);
    ok(!asked && !undoSteps, "⭐ …with nothing asked and no Undo step taken for what did not happen", { asked, undoSteps });
    // CONTROL: a new state that took land and no merge is discarded as ever, its province going back
    const sess2 = pageSession(makeMod("mod-delete-plain-new", { ownStates: true })), sb2 = sess2.sb;
    const n2 = stageNewState(sb2, "AAA");
    sb2.doMoveProvince(S.KG.provinces[1], S.KG.id, n2);
    sb2.pendingWrites.find((w) => w.url === "/api/map/move-province").meta.fromStateId = S.KG.id;
    deleteClick(sb2, n2);
    ok(!sb2.stateById.has(n2) && !sb2.pendingWrites.length && sb2.stateById.get(S.KG.id).provinces.includes(S.KG.provinces[1]) && /Discarded the unsaved new state/.test(sess2.statuses[sess2.statuses.length - 1]),
      "CONTROL: a new state no merge names is discarded as before, and its province goes back", { q: sb2.pendingWrites, status: sess2.statuses[sess2.statuses.length - 1] });
    void before;
  }

  try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) { /* scratch only */ }
  console.log("\n" + (fail ? "FAILED " + fail + "/" + (pass + fail) : "PASSED " + pass + "/" + pass));
  process.exitCode = fail ? 1 : 0;
})().catch((e) => { console.error(e); try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {} process.exitCode = 1; });
