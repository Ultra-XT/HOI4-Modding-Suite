// ⛔ #a-capital-state-keeps-a-victory-point — A CAPITAL STATE IS NOT LEFT WITHOUT A VICTORY POINT, AND A CAPITAL IS NOT MOVED ONTO A
// STATE WITH NONE, WITHOUT ONE BEING GIVEN — AND THE HUB SUPPLY LEAVES IT BY, WHERE THE NETWORK IS THE MOD'S.
//
// HOI4 stands a country's capital on its capital state's best victory point; with none it takes the state's first province, usually off
// the railway supply leaves the capital by (#a-generated-capital-sits-on-its-rail). Generate land gives every state a victory point on
// its town province, and Auto-fix's split keeps one in both halves (#a-split-keeps-its-victory-point). The generator-knowledge audit
// found four tools that did neither, each answering 200 while Map Errors and Auto-fix said nothing (SUS-4, SUS-5 and the missed M1):
//   · a state paint took the capital state's only victory point — and its hub — with its province (Budapest, 9660, out of HUN's 43);
//   · the 🧽 Erase brush drowned it (Rio, 10980: BRA's 500 kept neither);
//   · Set capital and ✨ New country put a capital on a state with none (SOV onto 215, which holds a hub, or 262, which holds nothing);
//   · createState's steal (Auto-fix's carve) took it as a move does.
// ⛔ AND THE POINT IS GIVEN ONCE, AFTER THE SAVE'S LAST WRITE. A move, an erase and Set capital are queued writes, replayed one by one at
// Save: given per write, the point stood on a province of the state's own that the next write of the same Save could move out — carrying
// it, as a move carries every victory point, into the state it went to. So each write only NAMES the country (`capitalsToKeep`), and the
// page asks /api/map/keep-capitals once, after the last write.
// Pinned on a world the mod owns outright (its states, hubs and railway), over a base game whose states say what a state of each category
// is worth (the layer below). XXX on the west; YYY's capital YK, a city, its victory point and hub on a coastal province that the one
// railway (from XXX's capital) ends on; YA and YN, towns with victory points (YA's hubbed); YB, a town with neither; YH, rural, with a
// hub and no victory point. Run as the page runs it: flushMapSaves (and the helpers it calls) lifted out of public/map.js, its fetch
// answered by server.js's own handlers for the four routes, lifted and run in-process.
//   (a) ⭐ a Save of a province move that takes YK's victory point and hub: the move names YYY and writes no point; the page asks
//       keep-capitals once, after it; YK gets one on the province of its own the railway runs through, worth what a city is worth below,
//       and the hub — and the Save line says so; a move that takes no last victory point names nothing;
//   (a2) ⭐ a Save that also moves out the province that point would stand on: no invented victory point in the state it went to;
//   (b) ⭐ the Erase brush drowning it: the same;
//   (c) ⭐ Set capital: onto YB (nothing) a victory point on its town province and a hub there; onto YH (a hub) the victory point on the
//       hub; onto YA (both) nothing at all; on a network the mod does not own, the victory point and the reason no hub was added;
//   (d) ⭐ ✨ New country with YB as its capital (one write, then a reload): the same victory point, at once;
//   (e) ⭐ createState taking YK's victory point province names YYY and writes no point itself;
//   (f) ⭐ Map Errors: a capital state of the mod's with no victory point is a WARNING (not fatal, labelled); Auto-fix gives it one on its
//       hub, and a second click writes nothing; an add-on over a world that has one is not told of it, and its Auto-fix writes nothing;
//   (g) the page: capitalTownNotes words each case, and adoptCapitalTown takes the victory point into the page's own copy of the state;
//   (h) ⭐ a click that takes the capital state's best victory point and its only hub, a lesser one left: named for the hub (F4);
//   (i) ⭐ the point given back is worth less than each one the state lost (at least 1), marked as Nova's stand-in, and taken out by
//       the move of a later Save that brings back one worth as much — the two-Save round trip, a tie with a city's worth, a point worth
//       1, and the controls: a lesser point coming in, and a point of the modder's own (F1).
// Every expected value is read off the fixture. Fixture-only: binds no port.
// Run: node test-a-capital-state-keeps-a-victory-point.js
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const vm = require("vm");
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-capital-vp-"));
process.env.APPDATA = path.join(ROOT, "appdata"); process.env.NOVA_APP_DATA_DIR = process.env.APPDATA; process.env.XDG_CONFIG_HOME = process.env.APPDATA;
process.env.NOVA_HOME_DIR = path.join(ROOT, "home");
fs.mkdirSync(process.env.NOVA_HOME_DIR, { recursive: true });
const md = require("./map-data.js");
const labels = require("./public/map-rule-labels.js");
const P = require("./testlib-map-page.js");

let pass = 0, fail = 0;
const ok = (c, m, x) => {
  if (c) { pass++; console.log("  ok   " + m); }
  else { fail++; console.log("  FAIL " + m + (x !== undefined ? "   -> " + JSON.stringify(x).slice(0, 600) : "")); }
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

// ── the world: 14 x 6 provinces of 12 px, id = row * 14 + col + 1; land on rows 1-4, cols 0-11, sea round it ────────────────────────
const CELL = 12, COLS = 14, ROWS = 6, W = COLS * CELL, H = ROWS * CELL;
const PLAINS = 0, OCEAN = 15;
const idAt = (c, r) => r * COLS + c + 1;
const provAt = (x, y) => idAt(Math.floor(x / CELL), Math.floor(y / CELL));
const colour = (id) => [(id * 29) % 256, (id * 67) % 256, 30 + id];
const cells = (cs, rs) => { const out = []; for (const r of rs) for (const c of cs) out.push(idAt(c, r)); return out; };
//   name, category, owner, provinces, its victory point (or none) and what it is worth, and the province its hub stands on (or none)
const STATES = [
  { name: "X1", category: "city", owner: "XXX", provinces: cells([0, 1, 2, 3, 4], [1, 2]), vp: idAt(2, 1), value: 10, hub: idAt(2, 1) },
  { name: "X2", category: "rural", owner: "XXX", provinces: cells([0, 1, 2, 3, 4], [3, 4]), vp: idAt(2, 3), value: 1, hub: null },
  { name: "YK", category: "city", owner: "YYY", provinces: cells([5, 6, 7, 8, 9], [1, 2]), vp: idAt(7, 1), value: 30, hub: idAt(7, 1) },
  { name: "YA", category: "town", owner: "YYY", provinces: cells([5, 6], [3, 4]), vp: idAt(5, 4), value: 5, hub: idAt(5, 4) },
  { name: "YN", category: "town", owner: "YYY", provinces: cells([7], [3, 4]), vp: idAt(7, 4), value: 15, hub: null },
  { name: "YB", category: "town", owner: "YYY", provinces: cells([8, 9], [3, 4]), vp: null, value: 0, hub: null },
  { name: "YH", category: "rural", owner: "YYY", provinces: cells([10, 11], [1, 2, 3, 4]), vp: null, value: 0, hub: idAt(10, 2) },
].map((s, k) => ({ ...s, id: k + 1 }));
const S = Object.fromEntries(STATES.map((s) => [s.name, s]));
const LAND = new Set(STATES.flatMap((s) => s.provinces));
// the one railway: X1's hub to YK's, along row 1
const RAIL = cells([2, 3, 4, 5, 6, 7], [1]);
// what a state of each category is worth below — the base game ships the same states: the mean of their summed victory points
const worthBelow = (cat) => { const xs = STATES.filter((s) => s.category === cat); return Math.max(1, Math.round(xs.reduce((a, s) => a + (s.vp ? s.value : 0), 0) / xs.length)); };
const stateFile = (s, { vp = s.vp, owner = s.owner, value = s.value, extraVps = [] } = {}) => `state={\n\tid=${s.id}\n\tname="STATE_${s.id}" # ${s.name}\n\tmanpower=1000\n\tstate_category=${s.category}\n\tprovinces={ ${s.provinces.join(" ")} }\n\thistory={\n\t\towner=${owner}\n\t\tadd_core_of=${owner}\n`
  + (vp ? `\t\t# the capital of ${s.name}\n\t\tvictory_points = { ${vp} ${value} }\n` : "") + extraVps.map(([p, v]) => `\t\tvictory_points = { ${p} ${v} }\n`).join("") + "\t}\n}\n";

const GAME = path.join(ROOT, "game");
write(GAME, "hoi4.exe", "");
write(GAME, "common/terrain/00_terrain.txt", ["categories = {", "  plains = { color = { 200 200 100 } }", "  ocean = { color = { 0 0 200 } is_water = yes }", "}",
  "terrain = {", "  plains = { type = plains color = { 0 } }", "  ocean = { type = ocean color = { 15 } }", "}", ""].join("\n"));
for (const s of STATES) write(GAME, `history/states/${s.id}-S.txt`, stateFile(s));
// …and the same network below, which a mod that ships no supply file of its own inherits (`ownNetwork: false`)
write(GAME, "map/supply_nodes.txt", STATES.filter((s) => s.hub).map((s) => `1 ${s.hub}`).join("\n") + "\n");
write(GAME, "map/railways.txt", `1 ${RAIL.length} ${RAIL.join(" ")}\n`);

/** the mod: every state its own (replace_path), its own map and network. `vps` overrides a state's victory point (null for none),
 *  `values` what it is worth, `extraVps` gives a state more ([[province, value]]), `ownNetwork` false ships no supply file of its own,
 *  `yyyCapital` YYY's capital line */
function makeMod(tag, { vps = {}, values = {}, extraVps = {}, ownNetwork = true, yyyCapital = S.YK.id } = {}) {
  const m = path.join(ROOT, tag);
  write(m, "descriptor.mod", 'name="capital victory point"\nreplace_path="history/states"\n');
  write(m, "map/provinces.bmp", bmp24(W, H, (x, y) => colour(provAt(x, y))));
  const rows = ["0;0;0;0;land;false;unknown;0"];
  for (let id = 1; id <= COLS * ROWS; id++) rows.push(`${id};${colour(id).join(";")};${LAND.has(id) ? "land;false;plains;1" : "sea;false;ocean;0"}`);
  write(m, "map/definition.csv", rows.join("\n") + "\n");
  write(m, "map/terrain.bmp", bmp8(W, H, (x, y) => (LAND.has(provAt(x, y)) ? PLAINS : OCEAN)));
  write(m, "map/heightmap.bmp", bmp8(W, H, (x, y) => (LAND.has(provAt(x, y)) ? 106 : 89)));
  write(m, "map/adjacencies.csv", "From;To;Type;Through;start_x;start_y;stop_x;stop_y;adjacency_rule_name;Comment\n-1;-1;-1;-1;-1;-1;-1;-1;-1\n");
  write(m, "map/strategicregions/r1.txt", `strategic_region={\n\tid=1\n\tname="REGION_1"\n\tprovinces={ ${[...LAND].join(" ")} }\n\tweather={}\n}\n`);
  const sea = []; for (let id = 1; id <= COLS * ROWS; id++) if (!LAND.has(id)) sea.push(id);
  write(m, "map/strategicregions/r2.txt", `strategic_region={\n\tid=2\n\tname="REGION_2"\n\tprovinces={ ${sea.join(" ")} }\n\tnaval_terrain=water_shallow_sea\n\tweather={}\n}\n`);
  if (ownNetwork) {
    write(m, "map/supply_nodes.txt", STATES.filter((s) => s.hub).map((s) => `1 ${s.hub}`).join("\n") + "\n");
    write(m, "map/railways.txt", `1 ${RAIL.length} ${RAIL.join(" ")}\n`);
  }
  for (const s of STATES) write(m, `history/states/${s.id}-S.txt`, stateFile(s, { vp: s.name in vps ? vps[s.name] : s.vp, value: s.name in values ? values[s.name] : s.value, extraVps: extraVps[s.name] || [] }));
  write(m, "history/countries/XXX - Exx.txt", `capital = ${S.X1.id}\n`);
  write(m, "history/countries/YYY - Wyy.txt", `capital = ${yyyCapital}\n`);
  return m;
}
const stateText = (m, s) => fs.readFileSync(path.join(m, "history", "states", `${s.id}-S.txt`), "utf8");
const vpsOf = (m, s) => (md.parseStatesText(stateText(m, s))[0] || {}).victoryPoints || [];
const hubsOn = (m) => { try { return new Set(md.parseSupplyNodes(fs.readFileSync(path.join(m, "map", "supply_nodes.txt"), "utf8")).map((h) => h.province)); } catch (_) { return new Set(); } };
const railed = new Set(RAIL);
const givenIn = (ct) => (((ct || {}).victoryPoints || {}).given || []);
const ruleRow = (m, deps = []) => md.validateMapModel(md.buildMapModel({ modRoot: m, gameRoot: GAME, dependencyRoots: deps, cacheStableLayers: false })).find((p) => p.rule === "capital_state_has_no_victory_point");

// ── server.js's own handlers for the routes a Save posts here, lifted and run in-process (no port) ───────────────────────────────────
const SERVER = fs.readFileSync(path.join(__dirname, "server.js"), "utf8").replace(/\r\n/g, "\n");
const routes = {};
const ROUTES = ["/api/map/move-province", "/api/map/flip-province-sea", "/api/map/set-capital", "/api/map/keep-capitals"];
for (const url of ROUTES) {
  const at = SERVER.indexOf(`app.post("${url}"`);
  const end = at < 0 ? -1 : SERVER.indexOf("\n  app.", at + 10);
  if (at < 0 || end < 0) continue;
  vm.runInNewContext(SERVER.slice(at, end), {
    app: { post: (u, mw, fn) => { routes[u] = fn; } }, express: { json: () => null }, mapData: md, DEV_ROOT: "<dev>",
    getActiveRoot: () => "", checkActiveRootNotGameRoot() {}, resolveHoi4GameRoot: () => GAME, resolveDependencyRootsForAssets: () => [],
    sayUnnamedCapitalPoints() {},   // test-a-new-victory-point-says-it-has-no-name.js holds it, through the real server
  });
}
/** one request to a lifted handler, as the page sends it: the queued body with the modPath every write carries */
const serve = (url, body) => {
  let status = 200, json = null;
  routes[url]({ body }, { status(c) { status = c; return this; }, json(j) { json = j; return this; } });
  return { status, json: json || {} };
};

// ── the page's Save: flushMapSaves and the helpers it calls, lifted out of public/map.js ─────────────────────────────────────────────
const FLUSH = (() => { try { return P.lift("async function flushMapSaves", "} finally { if (btn) btn.disabled = false; updateSaveButton(); }\n  }"); } catch (_) { return ""; } })();
const HELPERS = ["async function mapCrashGate", "function markSaveBoundary", "function setCapitalNote(", "function coastRowsNote(", "function drownedLandNote(",
  "function capitalTownNotes(", "function adoptCapitalTown(", "function firstLandNote(", "function adoptFirstLand("].map((o) => { try { return P.lift(o); } catch (_) { return ""; } });
const fieldsMatch = /const STATE_ID_FIELDS = \[([^\]]*)\]/.exec(P.MASKED);
const STATE_ID_FIELDS = fieldsMatch ? [...fieldsMatch[1].matchAll(/"([A-Za-z]+)"/g)].map((m) => m[1]) : [];
/** the page's own copy of the mod's states, as load() gives it: id, name, provinces, owner, victory points */
const pageStates = (m) => md.buildMapModel({ modRoot: m, gameRoot: GAME, dependencyRoots: [], cacheStableLayers: false }).states
  .map((s) => ({ id: s.id, name: s.name, displayName: STATES.find((x) => x.id === s.id) ? STATES.find((x) => x.id === s.id).name : "", owner: s.owner, provinces: (s.provinces || []).slice(), victoryPoints: (s.victoryPoints || []).map((v) => ({ ...v })) }));
/** The page, open on mod `m` with `writes` queued as the page queues them. `page.save()`: one 💾 Save → { status (the Save line), requests: [{ url,
 *  body, res }], stateById }; the page stays open, so a Save that stopped keeps its queue for the next. `page.refuse(url, body)`: an error for a
 *  write to answer as the server answers a file it cannot replace. */
function openPage(m, writes) {
  let status = "";
  let requests = [];
  const states = pageStates(m);
  const page = { refuse: null };
  const sandbox = {
    console, JSON, encodeURIComponent, Set, Map,
    pendingWrites: writes.map((w) => ({ url: w.url, body: { ...w.body }, meta: { ...(w.meta || {}) } })),
    paintDiff: new Map(), statusEl: { style: {} }, stateById: new Map(states.map((s) => [s.id, s])), model: { states, supplyNodes: [...hubsOn(m)].map((p) => ({ level: 1, province: p })) },
    stagedRiverEdits: [], undoStack: [], redoStack: [], historyLabels: [], saveGeneration: 0, baseImageData: null, baseImageDataPristine: null,
    setStatus: (s) => { status = String(s); }, setMapDirty: () => {}, updateSaveButton: () => {}, modPath: () => m,
    isVanillaTarget: () => false, problemsPanelOpen: () => false, refreshProblems: () => {}, renderCheckpoints: () => {},
    buildPidGrid: () => {}, computeCentroids: () => {}, recolorAll: () => {}, draw: () => {}, loadRiversOverlay: () => {},
    orphanedQueuedWrites: () => [], emptyNewStateWrites: () => [], stateFormDirty: () => false, stateFormBaseline: null,
    stageStateWrite: () => {}, remapQueuedStateId: () => {}, remapLocalStateId: () => {}, provincesBmpNote: () => "", riversPaintNote: () => "", heightmapNote: () => "", STATE_ID_FIELDS,
    adoptMergeRegions: () => {}, openMapErrorsModal: () => {}, saveMapBackup: () => {}, updateUndoButtons: () => {},
    rebuildStagedRiversFromPending: () => {}, $: () => null, window: { NovaMapRuleLabels: labels }, provinceDef: new Map(), provinceToOwner: {},
    fetch: async (url, opts) => {
      const u = String(url);
      if (u.indexOf("/api/map/validate") === 0) return { ok: true, status: 200, json: async () => ({ ok: true, errors: 0, warnings: 0, problems: [] }) };
      const body = opts && opts.body ? JSON.parse(opts.body) : {};
      const refused = page.refuse && page.refuse(u, body);
      const r = refused ? { status: 400, json: { ok: false, error: refused } } : routes[u] ? serve(u, body) : { status: 404, json: { ok: false, error: "no such route in this test: " + u } };
      requests.push({ url: u, body, res: r.json });
      return { ok: r.status === 200, status: r.status, json: async () => r.json };
    },
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  // every `…Note(` helper the lifted text calls comes along (withNoteHelpers), as the page declares it
  vm.runInContext(P.withNoteHelpers(`${HELPERS.join("\n")}\n${FLUSH}`) + "\nglobalThis.__run = flushMapSaves;", sandbox);
  page.sandbox = sandbox;
  page.save = async () => { requests = []; await sandbox.__run(); return { status, requests, stateById: sandbox.stateById, model: sandbox.model }; };
  return page;
}
/** 💾 Save through a page opened for it. */
const saveThroughThePage = (m, writes) => openPage(m, writes).save();
// the bodies public/map.js queues: doMoveProvince, the Erase brush, Set capital
const move = (provinceId, toStateId, fromStateId) => ({ url: "/api/map/move-province", body: { provinceId, toStateId }, meta: { fromStateId } });
const erase = (provinceId) => ({ url: "/api/map/flip-province-sea", body: { provinceId } });
const setCapital = (tag, stateId) => ({ url: "/api/map/set-capital", body: { tag, stateId } });
const keepAsked = (s) => s.requests.filter((r) => r.url === "/api/map/keep-capitals");

(async () => {
  console.log("\n-- the fixture, and the page's code, can tell right from wrong --");
  const CITY = worthBelow("city"), TOWN = worthBelow("town"), RURAL = worthBelow("rural");
  ok(CITY === 20 && TOWN === 7 && CITY !== TOWN, `(the fixture: a city is worth ${CITY} below and a town ${TOWN} — neither the 1 a missing value falls back to)`, { CITY, TOWN, RURAL });
  const ykRail = S.YK.provinces.filter((p) => railed.has(p) && p !== S.YK.vp);
  ok(ykRail.length === 2 && railed.has(S.YK.vp) && S.YK.hub === S.YK.vp && !LAND.has(S.YK.vp - COLS), `(the fixture: YK's victory point and hub stand on ${S.YK.vp}, on the coast, where the railway ends; ${ykRail.join(" and ")} of YK's are on the railway too)`);
  {
    const m = md.buildMapModel({ modRoot: makeMod("mod-fixture"), gameRoot: GAME, dependencyRoots: [], cacheStableLayers: false });
    const capVps = ["XXX", "YYY"].map((t) => ((m.states.find((s) => s.id === m.capitals[t]) || {}).victoryPoints || []).length);
    ok(capVps.every((n) => n === 1) && m.capitals.YYY === S.YK.id, "(the fixture: as shipped, both capital states have their victory point)", capVps);
  }
  ok(FLUSH.length > 500 && HELPERS.every((h) => h.length > 60) && ROUTES.every((u) => typeof routes[u] === "function"),
    "(flushMapSaves and the helpers it calls are lifted out of public/map.js, and server.js's handlers for the four routes out of server.js)", { flush: FLUSH.length, helpers: HELPERS.map((h) => h.length), routes: Object.keys(routes) });

  console.log("\n-- ⭐ (a) a Save of a province move that takes the capital state's only victory point (and its hub) --");
  {
    const m = makeMod("mod-move");
    const s = await saveThroughThePage(m, [move(S.YK.vp, S.YN.id, S.YK.id)]);
    const mv = s.requests.find((r) => r.url === "/api/map/move-province") || {};
    const kc = keepAsked(s);
    ok(mv.res && mv.res.ok && (mv.res.sources || []).includes(S.YK.id) && Number(mv.res.carriedVp) === S.YK.value, `(guard: the move took ${S.YK.vp} and its victory point out of YK)`, mv.res && { error: mv.res.error, sources: mv.res.sources, carriedVp: mv.res.carriedVp });
    ok(mv.res && mv.res.capitalsToKeep && (mv.res.capitalsToKeep.tags || []).join() === "YYY" && (mv.res.capitalsToKeep.hubTags || []).join() === "YYY" && !mv.res.capitalTown,
      "⭐⭐ the move NAMES YYY — its capital lost its last victory point and its only hub — and gives nothing itself", mv.res && { capitalsToKeep: mv.res.capitalsToKeep, capitalTown: mv.res.capitalTown });
    ok(kc.length === 1 && s.requests.indexOf(kc[0]) === s.requests.length - 1 && (kc[0].body.tags || []).join() === "YYY" && (kc[0].body.hubTags || []).join() === "YYY" && kc[0].body.modPath === m,
      "⭐⭐⭐ the page asks /api/map/keep-capitals ONCE, after the Save's last write, for the countries the writes named", s.requests.map((r) => [r.url, r.body.tags]));
    const g = givenIn(kc[0] && kc[0].res.capitalTown);
    ok(g.length === 1 && g[0].tag === "YYY" && g[0].state === S.YK.id && ykRail.includes(g[0].province) && g[0].on === "rail" && g[0].value === CITY,
      `⭐⭐⭐ YK is given a victory point back: on a province of its own the railway runs through, worth what a city is worth below (${CITY})`, kc[0] && kc[0].res);
    const vps = vpsOf(m, S.YK);
    ok(vps.length === 1 && g[0] && vps[0].province === g[0].province && vps[0].value === CITY, "⭐⭐ …written into YK's file, one victory point", vps);
    ok(/# YK\r?\n/.test(stateText(m, S.YK)) && !stateText(m, S.YK).includes(`{ ${S.YK.vp} ${S.YK.value} }`), "…the file's own comments kept, the moved province's victory point gone with it", stateText(m, S.YK));
    const h = ((kc[0] && kc[0].res.capitalTown) || {}).hubs || {};
    ok(g[0] && hubsOn(m).has(g[0].province) && (h.states || []).some((x) => x.tag === "YYY" && x.state === S.YK.id && x.hub === g[0].province),
      "⭐⭐ …and the hub supply leaves the capital by, on that victory point: the mod owns its network", h);
    ok(!ruleRow(m), "…and Map Errors has no capital state with no victory point to report", ruleRow(m));
    ok(g[0] && s.status.includes("YYY's capital") && s.status.includes(`province ${g[0].province}`) && s.status.includes("YK (state 3)") && /supply hub/.test(s.status),
      "⭐⭐ the Save line says what was given, where, and the hub", s.status);
    const st = s.stateById.get(S.YK.id);
    ok(g[0] && st && (st.victoryPoints || []).some((v) => v.province === g[0].province && v.value === CITY) && s.model.supplyNodes.some((n) => n.province === g[0].province),
      "⭐ …and the page's own copy of YK holds the point and the hub, so the state panel's next save does not send the old list back", st && st.victoryPoints);
    // CONTROLS: a move that takes no capital's last victory point names nothing, and its Save asks nothing
    const c1m = makeMod("mod-move-control-1");
    const c1 = await saveThroughThePage(c1m, [move(idAt(9, 2), S.YB.id, S.YK.id)]);
    const c1r = (c1.requests.find((r) => r.url === "/api/map/move-province") || {}).res || {};
    ok(c1r.ok && !c1r.capitalsToKeep && !keepAsked(c1).length, "CONTROL: a province with no victory point out of YK — nothing named, nothing asked", c1.requests.map((r) => r.url));
    const c2 = md.moveProvince({ modRoot: makeMod("mod-move-control-2"), gameRoot: GAME, dependencyRoots: [], provinceId: S.YN.vp, toStateId: S.YB.id });
    ok(c2 && c2.changed && !c2.capitalsToKeep, "CONTROL: YN's only victory point, out of a state that is no capital — nothing named", c2 && c2.capitalsToKeep);
    const cm = makeMod("mod-move-control-3", { vps: { YK: null } });
    const c3 = md.moveProvince({ modRoot: cm, gameRoot: GAME, dependencyRoots: [], provinceId: idAt(9, 2), toStateId: S.YB.id });
    ok(c3 && c3.changed && !c3.capitalsToKeep, "CONTROL: a capital state that had none before the click is not this click's doing — left to Map Errors", c3 && c3.capitalsToKeep);
  }

  console.log("\n-- ⭐ (a2) the same Save also moves out the province the point would be given on --");
  {
    // where the point goes once YK's victory point province has left it: asked of a scratch copy, the way the repair asks — or read off
    // it, should the move itself have given one (the back-out control's per-write repair), so both ask the same question
    const probe = makeMod("mod-move-probe");
    md.moveProvince({ modRoot: probe, gameRoot: GAME, dependencyRoots: [], provinceId: S.YK.vp, toStateId: S.YN.id });
    const q = (vpsOf(probe, S.YK)[0] || givenIn(md.keepCapitalsOnTheirTown({ modRoot: probe, gameRoot: GAME, dependencyRoots: [], tags: ["YYY"] }))[0] || {}).province;
    ok(S.YK.provinces.includes(q) && q !== S.YK.vp, `(the fixture: with ${S.YK.vp} gone, YK's point would stand on ${q})`, q);
    const m = makeMod("mod-move-two");
    const s = await saveThroughThePage(m, [move(S.YK.vp, S.YN.id, S.YK.id), move(q, S.YN.id, S.YK.id)]);
    const moves = s.requests.filter((r) => r.url === "/api/map/move-province");
    ok(moves.length === 2 && moves.every((r) => r.res && r.res.ok), "(guard: both moves were posted and landed)", s.requests.map((r) => [r.url, r.res && (r.res.error || r.res.ok)]));
    const yn = vpsOf(m, S.YN).map((v) => `${v.province}:${v.value}`).sort();
    const want = [`${S.YN.vp}:${S.YN.value}`, `${S.YK.vp}:${S.YK.value}`].sort();
    ok(JSON.stringify(yn) === JSON.stringify(want), `⭐⭐⭐ YN holds its own victory point and the one ${S.YK.vp} carried — and no invented one on ${q}`, { yn, want });
    const yk = vpsOf(m, S.YK);
    ok(yk.length === 1 && yk[0].province !== q && S.YK.provinces.includes(yk[0].province) && yk[0].value === CITY, "⭐⭐ …and YK holds exactly one, on land it still has", yk);
    ok(keepAsked(s).length === 1 && s.requests.indexOf(keepAsked(s)[0]) === s.requests.length - 1, "⭐⭐ …given by the one keep-capitals request, after both moves", s.requests.map((r) => r.url));
  }

  console.log("\n-- ⭐ (b) a Save of the Erase brush drowning the capital state's only victory point --");
  {
    const m = makeMod("mod-erase");
    const s = await saveThroughThePage(m, [erase(S.YK.vp)]);
    const e = (s.requests.find((r) => r.url === "/api/map/flip-province-sea") || {}).res || {};
    const kc = keepAsked(s), g = givenIn(kc[0] && kc[0].res.capitalTown);
    ok(e.ok && e.type === "sea" && (e.sources || []).includes(S.YK.id) && e.capitalsToKeep && (e.capitalsToKeep.tags || []).join() === "YYY", `(guard: ${S.YK.vp} is sea now, out of YK, and the erase names YYY)`, { error: e.error, type: e.type, sources: e.sources, capitalsToKeep: e.capitalsToKeep });
    ok(g.length === 1 && g[0].state === S.YK.id && ykRail.includes(g[0].province) && g[0].on === "rail" && g[0].value === CITY && vpsOf(m, S.YK).some((v) => v.province === g[0].province),
      "⭐⭐⭐ YK gets one back on the railway, worth a city's, on disk", { capitalTown: kc[0] && kc[0].res.capitalTown, vps: vpsOf(m, S.YK) });
    ok(g[0] && hubsOn(m).has(g[0].province) && !hubsOn(m).has(S.YK.vp), "⭐⭐ …and the hub the erase drowned stands again, on the new victory point", [...hubsOn(m)]);
  }

  console.log("\n-- ⭐ (c) Set capital, through the page's Save --");
  {
    const m = makeMod("mod-cap-yb");
    const s = await saveThroughThePage(m, [setCapital("YYY", S.YB.id)]);
    const sc = (s.requests.find((r) => r.url === "/api/map/set-capital") || {}).res || {};
    const kc = keepAsked(s), g = givenIn(kc[0] && kc[0].res.capitalTown);
    ok(sc.ok && md.buildMapModel({ modRoot: m, gameRoot: GAME, dependencyRoots: [], cacheStableLayers: false }).capitals.YYY === S.YB.id && sc.capitalsToKeep && !sc.capitalTown,
      "(guard: YYY's capital is YB now, and the write named YYY rather than giving anything)", sc);
    ok(g.length === 1 && g[0].state === S.YB.id && S.YB.provinces.includes(g[0].province) && g[0].on === "town" && g[0].value === TOWN && vpsOf(m, S.YB).some((v) => v.province === g[0].province && v.value === TOWN),
      `⭐⭐⭐ onto YB, which has no victory point, hub or railway: one on its town province, worth a town's (${TOWN})`, { capitalTown: kc[0] && kc[0].res.capitalTown, vps: vpsOf(m, S.YB) });
    const h = ((kc[0] && kc[0].res.capitalTown) || {}).hubs || {};
    ok(g[0] && hubsOn(m).has(g[0].province) && (h.states || []).some((x) => x.state === S.YB.id && x.hub === g[0].province), "⭐⭐ …and a hub on it, as Auto-fix gives a capital it moves", h);
    const mh = makeMod("mod-cap-yh");
    const sh = await saveThroughThePage(mh, [setCapital("YYY", S.YH.id)]);
    const ch = (keepAsked(sh)[0] || { res: {} }).res.capitalTown, gh = givenIn(ch);
    ok(gh.length === 1 && gh[0].province === S.YH.hub && gh[0].on === "hub" && gh[0].value === RURAL && !(ch && ch.hubs),
      "⭐⭐ onto YH, which holds a hub and no victory point: the victory point on the hub, and no second hub", ch);
    const ma = makeMod("mod-cap-ya");
    const before = stateText(ma, S.YA);
    const sa = await saveThroughThePage(ma, [setCapital("YYY", S.YA.id)]);
    const ka = keepAsked(sa);
    ok(ka.length === 1 && ka[0].res.ok && !ka[0].res.capitalTown && stateText(ma, S.YA) === before && !/YYY's capital/.test(sa.status),
      "CONTROL: onto YA, which has both — nothing written, nothing said", ka[0] && ka[0].res);
    const mi = makeMod("mod-cap-inherits", { ownNetwork: false });
    const si = await saveThroughThePage(mi, [setCapital("YYY", S.YB.id)]);
    const ci = (keepAsked(si)[0] || { res: {} }).res.capitalTown, gi = givenIn(ci), hi = (ci || {}).hubs || {};
    ok(gi.length === 1 && gi[0].state === S.YB.id && Array.isArray(hi.skipped) && hi.skipped.some((x) => x.tag === "YYY" && /supply_nodes\.txt is not its own/.test(x.reason)) && !fs.existsSync(path.join(mi, "map", "supply_nodes.txt")),
      "⭐⭐ on a network the mod does not own: the victory point, no hub copied in, and the reason said", ci);
    ok(/⚠ YYY's capital has no supply hub/.test(si.status) && /supply_nodes\.txt is not its own/.test(si.status), "⭐ …and the Save line says it, with a ⚠, so the Save report shows it", si.status);
  }

  console.log("\n-- ⭐ (d) ✨ New country with a capital state that has no victory point --");
  {
    const m = makeMod("mod-new-country");
    const r = md.createCountry({ modRoot: m, gameRoot: GAME, dependencyRoots: [], tag: "ZZZ", name: "Zed", rgb: [10, 20, 30], stateIds: [S.YB.id], capitalStateId: S.YB.id });
    const g = givenIn(r && r.capitalTown);
    ok(r && r.ok && g.length === 1 && g[0].tag === "ZZZ" && g[0].state === S.YB.id && g[0].on === "town" && vpsOf(m, S.YB).some((v) => v.province === g[0].province),
      "⭐⭐ ZZZ's capital, YB, is given a victory point on its town province (one write, then a reload: given at once)", r && { error: r.error, capitalTown: r.capitalTown });
  }

  console.log("\n-- ⭐ (e) createState taking the capital state's victory point province --");
  {
    const m = makeMod("mod-create-state");
    const r = md.createState({ modRoot: m, gameRoot: GAME, dependencyRoots: [], name: "", owner: "YYY", provinces: [S.YK.vp] });
    ok(r && r.ok && r.capitalsToKeep && (r.capitalsToKeep.tags || []).join() === "YYY" && !vpsOf(m, S.YK).length,
      "⭐⭐ the steal names YYY, and gives nothing itself (Auto-fix's carve gives it in its own pass; the page after its Save)", r && { error: r.error, capitalsToKeep: r.capitalsToKeep, vps: vpsOf(m, S.YK) });
  }

  console.log("\n-- ⭐ (f) Map Errors and Auto-fix --");
  {
    const m = makeMod("mod-rule", { vps: { YK: null } });
    const p = ruleRow(m);
    ok(p && p.severity === "warning" && p.total === 1 && p.totalNoun === "countries" && (p.items || []).length === 1 && p.items[0].tag === "YYY" && p.items[0].stateId === S.YK.id && p.items[0].firstProvince === S.YK.provinces[0],
      "⭐⭐⭐ a capital state of the mod's with no victory point is reported once, as a warning naming the country, the state and its first province", p);
    ok(p && !labels.isFatalRule(p.rule) && labels.mapRuleLabel(p.rule) !== p.rule && labels.mapRuleFixHint(p.rule).length > 40, "…not fatal (the game loads it), with a label and a fix hint of its own", p && { fatal: labels.isFatalRule(p.rule), label: labels.mapRuleLabel(p.rule) });
    const fx = md.autoFixMap({ modRoot: m, gameRoot: GAME, dependencyRoots: [] });
    const cvp = ((fx && fx.fixes) || {}).capitalVictoryPoints || {};
    ok(fx && fx.ok && cvp.fixed === 1 && (cvp.given || [])[0] && cvp.given[0].province === S.YK.hub && cvp.given[0].on === "hub" && cvp.given[0].value === CITY && vpsOf(m, S.YK).some((v) => v.province === S.YK.hub && v.value === CITY),
      "⭐⭐⭐ Auto-fix gives it one: on its hub, worth a city's", { error: fx && fx.error, cvp, vps: vpsOf(m, S.YK) });
    ok(!ruleRow(m), "…and Map Errors has nothing left to say", ruleRow(m));
    const text = stateText(m, S.YK);
    const fx2 = md.autoFixMap({ modRoot: m, gameRoot: GAME, dependencyRoots: [] });
    ok(fx2 && fx2.ok && !(((fx2.fixes || {}).capitalVictoryPoints || {}).fixed) && stateText(m, S.YK) === text, "⭐ a second click writes nothing", (fx2.fixes || {}).capitalVictoryPoints);
    // an add-on over a world that already has one is not told of it, and its Auto-fix writes no state file
    const addon = path.join(ROOT, "addon");
    write(addon, "descriptor.mod", 'name="addon"\n');
    const below = makeMod("mod-rule-below", { vps: { YK: null } });
    ok(!!ruleRow(below), "(guard: the world below has the problem itself)");
    ok(!ruleRow(addon, [below]), "⭐⭐ an add-on over it is not told of a problem it inherited", ruleRow(addon, [below]));
    const fa = md.autoFixMap({ modRoot: addon, gameRoot: GAME, dependencyRoots: [below] });
    ok(fa && fa.ok && !(((fa.fixes || {}).capitalVictoryPoints || {}).fixed) && !fs.existsSync(path.join(addon, "history", "states")),
      "⭐⭐ …and its Auto-fix copies no state file in to give one", { cvp: (fa.fixes || {}).capitalVictoryPoints });
    // ⛔ (review of the merge, C-F1) …ONLY WHERE THE POINT WOULD MOVE THE CAPITAL, and the message names where it would go. With none, HOI4 stands the
    // capital on the state's first province, so a state of one province, or one whose first province holds the hub the point would stand on, has its
    // capital there already. On the two shipping maps that have any, 4 of the 5 were so (Hearts of Minecraft's AEP 686, ANP 608 and NIC 672, one
    // province each; Rise of Nations' ACR 912, its first province its only hub): the warning said that province was off the railway, and Auto-fix
    // wrote points into the shipping mod's state files and moved no capital.
    ok(p && p.items[0].province === S.YK.hub && p.items[0].on === "hub" && p.message.includes(`with none it takes the state's first province (here ${S.YK.provinces[0]}), not ${S.YK.hub}, where its supply hub stands.`)
      && !/usually off the railway/.test(p.message) && !/0 of 89/.test(p.message), "⭐⭐ the row names the province the point would go to, the hub, and the message says so in place of \"usually off the railway\"", p && { items: p.items, message: p.message });
    const dryOf = (m) => md.fixCapitalStatesWithNoVictoryPoint({ modRoot: m, gameRoot: GAME, dependencyRoots: [], dryRun: true });
    const reported = makeMod("mod-rule-dry", { vps: { YK: null } });
    const before = stateText(reported, S.YK);
    const dry = dryOf(reported);
    ok(dry && dry.fixed === 0 && JSON.stringify(dry.would) === JSON.stringify([{ tag: "YYY", state: S.YK.id, province: S.YK.hub, on: "hub" }]) && stateText(reported, S.YK) === before,
      "⭐ Auto-fix's dry run says the one point it would give, and writes nothing", dry);
    const hubFirst = makeMod("mod-rule-hub-first", { vps: { YK: null } });
    write(hubFirst, `history/states/${S.YK.id}-S.txt`, stateFile({ ...S.YK, provinces: [S.YK.hub, ...S.YK.provinces.filter((q) => q !== S.YK.hub)] }, { vp: null }));
    const hubText = stateText(hubFirst, S.YK);
    // a capital state of one province: YYY's capital YN, given its first province alone, the other in a state of YYY's own
    const one = makeMod("mod-rule-one-province", { yyyCapital: S.YN.id });
    const [only, rest] = S.YN.provinces;
    write(one, `history/states/${S.YN.id}-S.txt`, stateFile({ ...S.YN, provinces: [only] }, { vp: null }));
    write(one, "history/states/8-S.txt", stateFile({ ...S.YN, id: 8, name: "YN2", provinces: [rest] }, { vp: rest }));
    ok(md.capitalStatesWithNoVictoryPoint(md.buildMapModel({ modRoot: one, gameRoot: GAME, dependencyRoots: [], cacheStableLayers: false })).some((c) => c.tag === "YYY" && c.state === S.YN.id)
      && md.capitalStatesWithNoVictoryPoint(md.buildMapModel({ modRoot: hubFirst, gameRoot: GAME, dependencyRoots: [], cacheStableLayers: false })).some((c) => c.tag === "YYY" && c.state === S.YK.id),
      "(guard: both have a capital state with no victory point, which the tools' own repair still gives one when a click takes it)");
    ok(!ruleRow(one) && !(dryOf(one).would || []).length, "⭐⭐⭐ a capital state of one province is not reported, and its Auto-fix would give nothing", { rule: ruleRow(one), dry: dryOf(one) });
    ok(!ruleRow(hubFirst) && !(dryOf(hubFirst).would || []).length, "⭐⭐⭐ a capital state whose first province holds its hub is not reported, and its Auto-fix would give nothing: the capital stands there already", { rule: ruleRow(hubFirst), dry: dryOf(hubFirst) });
    const fh = md.autoFixMap({ modRoot: hubFirst, gameRoot: GAME, dependencyRoots: [] });
    ok(fh && fh.ok && !(((fh.fixes || {}).capitalVictoryPoints || {}).fixed) && stateText(hubFirst, S.YK) === hubText, "⭐⭐ …and Auto-fix writes no point into its file", fh && ((fh.fixes || {}).capitalVictoryPoints || fh.error));
  }

  console.log("\n-- (g) the page words it, and keeps its own copy of the state --");
  {
    const shown = (sid) => `state ${sid}`;
    const { sb } = P.runPage(["function capitalTownNotes(", "function adoptCapitalTown("], {
      stateById: new Map([[S.YK.id, { id: S.YK.id, victoryPoints: [] }]]), model: { supplyNodes: [] },
    });
    const ct = { victoryPoints: { given: [{ tag: "YYY", state: S.YK.id, province: ykRail[0], value: CITY, on: "rail" }], failed: [] },
      hubs: { hubs: 1, railways: 0, states: [{ tag: "YYY", state: S.YK.id, hub: ykRail[0], railways: 0 }], skipped: [{ tag: "QQQ", reason: "this mod's map/supply_nodes.txt is not its own" }] } };
    const notes = sb.capitalTownNotes(ct, shown);
    ok(notes.length === 3 && notes[0].includes("YYY's capital") && notes[0].includes(String(ykRail[0])) && notes[0].includes("railway")
      && notes[1].includes(`state ${S.YK.id}`) && notes[1].includes(`province ${ykRail[0]}`) && !/Reload the map/.test(notes[1])
      && notes[2].startsWith("⚠") && notes[2].includes("supply_nodes.txt is not its own"),
      "⭐ capitalTownNotes says what was given, where, the hub it added (no railway: nothing to reload for), and why a hub was not — the last with a ⚠", notes);
    sb.adoptCapitalTown(ct);
    const st = sb.stateById.get(S.YK.id);
    ok(st.victoryPoints.length === 1 && st.victoryPoints[0].province === ykRail[0] && st.victoryPoints[0].value === CITY && sb.model.supplyNodes.some((n) => n.province === ykRail[0]),
      "⭐⭐ adoptCapitalTown puts the victory point in the page's own state, so the panel's next save does not send the old list back", { st, hubs: sb.model.supplyNodes });
  }

  console.log("\n-- ⭐ (h) a click that takes the capital state's best victory point AND its only hub, a lesser victory point left (F4) --");
  {
    // Helsinki's shape (base 111: 11105 worth 15 and FIN's only hub there, Porvoo 6009 and Hanko 11211 worth 1 off the rail): YK keeps
    // a point worth 1 on a province no railway reaches and no hub stands on, beside YH's hub. HOI4 stands the capital on the best victory
    // point left — and supply leaves a country from its capital by rail, which the click took away, while the click named nobody.
    const LESSER = idAt(9, 2);
    ok(S.YK.provinces.includes(LESSER) && !railed.has(LESSER) && LESSER !== S.YK.hub && S.YH.provinces.includes(LESSER + 1) && S.YH.hub === LESSER + 1,
      `(the fixture: YK's lesser point stands on ${LESSER}, off the railway and the hubs, beside YH's hub ${S.YH.hub})`);
    const extra = { YK: [[LESSER, 1]] };
    // (h1) the Erase brush on a network the mod owns
    const m = makeMod("mod-f4-erase", { extraVps: extra });
    const s = await saveThroughThePage(m, [erase(S.YK.vp)]);
    const e = (s.requests.find((r) => r.url === "/api/map/flip-province-sea") || {}).res || {};
    const kc = keepAsked(s), ct = (kc[0] && kc[0].res.capitalTown) || {};
    ok(e.ok && e.type === "sea" && JSON.stringify(vpsOf(m, S.YK).map((v) => `${v.province}:${v.value}`)) === JSON.stringify([`${LESSER}:1`]) && !hubsOn(m).has(S.YK.vp),
      `(guard: ${S.YK.vp} is sea, its hub gone, and YK keeps only ${LESSER}, worth 1)`, { error: e.error, vps: vpsOf(m, S.YK), hubs: [...hubsOn(m)] });
    ok(e.capitalsToKeep && (e.capitalsToKeep.hubTags || []).join() === "YYY" && !(e.capitalsToKeep.tags || []).length,
      "⭐⭐⭐ the erase NAMES YYY for its hub — the capital state lost its only one — and not for a victory point: it still has one", e.capitalsToKeep);
    ok(kc.length === 1 && (kc[0].body.hubTags || []).join() === "YYY" && !(kc[0].body.tags || []).length, "⭐⭐ the page asks keep-capitals once, for the hub", kc.map((r) => r.body));
    const hs = ((ct.hubs || {}).states || []).find((x) => x.tag === "YYY") || {};
    ok(hs.state === S.YK.id && hs.hub === LESSER && hubsOn(m).has(LESSER) && !(((ct.victoryPoints || {}).given) || []).length,
      `⭐⭐⭐ the hub goes on ${LESSER}, the victory point HOI4 now stands YYY's capital on — and no victory point is invented`, ct);
    const rails = (() => { try { return fs.readFileSync(path.join(m, "map", "railways.txt"), "utf8"); } catch (_) { return ""; } })();
    ok(hs.railways >= 1 && rails.split(/\r?\n/).some((l) => l.trim().split(/\s+/).slice(2).map(Number).includes(LESSER)),
      "⭐⭐ …and a railway joins it to YYY's network, as Auto-fix's own capital move does", { hs, rails });
    ok(/🚂 YYY's capital/.test(s.status) && s.status.includes(`province ${LESSER}`), "⭐ …said on the Save line", s.status);
    // (h2) a province move of the same province, on a network the mod owns
    const m2 = makeMod("mod-f4-move", { extraVps: extra });
    const s2 = await saveThroughThePage(m2, [move(S.YK.vp, S.YN.id, S.YK.id)]);
    const mv2 = (s2.requests.find((r) => r.url === "/api/map/move-province") || {}).res || {};
    const ct2 = ((keepAsked(s2)[0] || {}).res || {}).capitalTown || {};
    ok(mv2.capitalsToKeep && (mv2.capitalsToKeep.hubTags || []).join() === "YYY" && !(mv2.capitalsToKeep.tags || []).length
      && (((ct2.hubs || {}).states) || []).some((x) => x.state === S.YK.id && x.hub === LESSER) && hubsOn(m2).has(LESSER),
      `⭐⭐⭐ a province move that takes it names YYY for its hub too, and the hub goes on ${LESSER}`, { capitalsToKeep: mv2.capitalsToKeep, capitalTown: ct2 });
    // (h3) …on a network the mod does not own: nothing is copied in to add a row, and the Save line says where the capital stands now
    const m3 = makeMod("mod-f4-move-inherits", { extraVps: extra, ownNetwork: false });
    const s3 = await saveThroughThePage(m3, [move(S.YK.vp, S.YN.id, S.YK.id)]);
    const ct3 = ((keepAsked(s3)[0] || {}).res || {}).capitalTown || {};
    const sk = (((ct3.hubs || {}).skipped) || []).find((x) => x.tag === "YYY");
    ok(sk && /supply_nodes\.txt is not its own/.test(sk.reason) && !fs.existsSync(path.join(m3, "map", "supply_nodes.txt")),
      "⭐⭐ on a network the mod does not own: no hub, no file copied in, and the reason", ct3);
    ok(sk && sk.capital && sk.capital.province === LESSER && sk.capital.state === S.YK.id && sk.capital.onRail === false,
      `⭐⭐ …with where HOI4 now stands the capital: ${LESSER}, which no railway reaches`, sk);
    ok(/⚠ YYY's capital has no supply hub/.test(s3.status) && s3.status.includes(`province ${LESSER}`) && /no railway/.test(s3.status),
      "⭐⭐ …and the Save line says both, with a ⚠", s3.status);
    // CONTROLS: the lesser point moved out names nothing (YK keeps its best one and its hub)
    const c = md.moveProvince({ modRoot: makeMod("mod-f4-control", { extraVps: extra }), gameRoot: GAME, dependencyRoots: [], provinceId: LESSER, toStateId: S.YH.id });
    ok(c && c.changed && !c.capitalsToKeep, "CONTROL: YK's lesser point moved out — its best point and its hub stay — names nothing", c && c.capitalsToKeep);
  }

  console.log("\n-- ⭐ (i) the point given back is worth less than the one the state lost, and gives way when a move brings one back (F1) --");
  {
    // Budapest's shape (base 43: 9660 worth 20, where a state of its category is worth 21 below): YK's victory point is worth less than
    // a city is worth below. Given the city's worth, the point Nova gave outranked Budapest when a later Save moved it back, and HOI4 stood
    // the capital on Nova's point beside it — on land HOI4's own map never put a capital on (review F1).
    const roundTrip = async (tag, lost) => {
      const m = makeMod(tag, { values: { YK: lost } });
      const s1 = await saveThroughThePage(m, [move(S.YK.vp, S.YN.id, S.YK.id)]);
      const mv1 = (s1.requests.find((r) => r.url === "/api/map/move-province") || {}).res || {};
      const kc1 = keepAsked(s1), g1 = givenIn(kc1[0] && kc1[0].res.capitalTown)[0] || {};
      const after1 = stateText(m, S.YK);
      const s2 = await saveThroughThePage(m, [move(S.YK.vp, S.YK.id, S.YN.id)]);
      const mv2 = (s2.requests.find((r) => r.url === "/api/map/move-province") || {}).res || {};
      return { m, s1, mv1, kc1, g1, after1, s2, mv2 };
    };
    const LOST = 15;
    ok(LOST < CITY && LOST - 1 > 1, `(the fixture: YK's victory point worth ${LOST}, less than the ${CITY} a city is worth below)`);
    const r = await roundTrip("mod-f1-round-trip", LOST);
    const took = [{ province: S.YK.vp, value: LOST }];
    ok(r.mv1.capitalsToKeep && JSON.stringify((r.mv1.capitalsToKeep.lost || {}).YYY) === JSON.stringify(took),
      "⭐⭐ the move says which victory point it took from YYY's capital state, and what it was worth", r.mv1.capitalsToKeep);
    ok(r.kc1.length === 1 && JSON.stringify((((r.kc1[0] || {}).body || {}).lost || {}).YYY) === JSON.stringify(took),
      "⭐⭐ …and the page hands it on to keep-capitals", r.kc1.map((k) => k.body));
    ok(r.g1.state === S.YK.id && ykRail.includes(r.g1.province) && r.g1.value === LOST - 1,
      `⭐⭐⭐ Save 1: YK is given one worth ${LOST - 1}, below the ${LOST} it lost — not a city's ${CITY}, which would outrank it`, r.g1);
    ok(new RegExp(`victory_points = \\{ ${r.g1.province} ${LOST - 1} \\}[ \\t]+# Nova: capital stand-in\\b[^\\r\\n]*\\b${S.YK.vp}\\b`).test(r.after1),
      `⭐ …written as Nova's stand-in, saying for which (${S.YK.vp}'s)`, r.after1);
    ok(r.s1.status.includes(`province ${r.g1.province}`) && r.s1.status.includes(`worth ${LOST - 1}`) && r.s1.status.includes(`worth less than province ${S.YK.vp}'s ${LOST}`),
      "⭐⭐ …and the Save line says it is worth less than the one YK lost, and why", r.s1.status);
    const back = vpsOf(r.m, S.YK).map((v) => `${v.province}:${v.value}`);
    ok(JSON.stringify(back) === JSON.stringify([`${S.YK.vp}:${LOST}`]),
      `⭐⭐⭐ Save 2 moves ${S.YK.vp} back: YK holds its own victory point alone — Nova's is taken out — so HOI4 stands YYY's capital on ${S.YK.vp} again`, back);
    const d = ((r.mv2.standInsDropped || [])[0]) || {};
    ok(r.mv2.ok && d.state === S.YK.id && d.province === r.g1.province && d.value === LOST - 1 && d.by === S.YK.vp && d.byValue === LOST,
      "⭐⭐ …the move says what it took out, and which victory point it gave way to", r.mv2);
    const text2 = stateText(r.m, S.YK);
    ok(!/capital stand-in/.test(text2) && /# the capital of YK\r?\n/.test(text2) && /# YK\r?\n/.test(text2),
      "⭐ …no stand-in left in the file, and its own comments where they were", text2);
    ok(r.s2.status.includes(`province ${r.g1.province}`) && new RegExp(`[Pp]rovince ${S.YK.vp}\\b`).test(r.s2.status) && /Nova took out/.test(r.s2.status),
      "⭐⭐ …said on the Save line", r.s2.status);
    const pageYk = r.s2.stateById.get(S.YK.id) || {};
    ok(!(pageYk.victoryPoints || []).some((v) => Number(v.province) === r.g1.province),
      "⭐ …and taken out of the page's own copy of YK, so the state panel's next save does not write it back", pageYk.victoryPoints);
    ok(!keepAsked(r.s2).length && !r.mv2.capitalsToKeep, "…and nothing is named or asked at Save 2: YK has its own victory point", r.s2.requests.map((x) => x.url));
    // …and a 🔗 Merge that brings one back (each province goes by moveProvince) takes it out too, and says so in its own answer
    const mm = makeMod("mod-f1-merge", { values: { YK: LOST } });
    await saveThroughThePage(mm, [move(S.YK.vp, S.YN.id, S.YK.id)]);
    const standIn = vpsOf(mm, S.YK)[0] || {};
    const mg = md.mergeState({ modRoot: mm, gameRoot: GAME, dependencyRoots: [], sourceStateId: S.YN.id, targetStateId: S.YK.id });
    const mvps = vpsOf(mm, S.YK).map((v) => `${v.province}:${v.value}`).sort();
    ok(standIn.value === LOST - 1 && mg && mg.changed && (mg.standInsDropped || []).some((x) => x.state === S.YK.id && x.province === standIn.province)
      && JSON.stringify(mvps) === JSON.stringify([`${S.YK.vp}:${LOST}`, `${S.YN.vp}:${S.YN.value}`].sort()) && !/capital stand-in/.test(stateText(mm, S.YK)),
      "⭐ a 🔗 Merge of YN, holding it, back into YK takes Nova's out too — and says so in its own answer, which the Save reads", { standIn, standInsDropped: mg && mg.standInsDropped, mvps });
    // the two edges of the rule: a point worth exactly what a city is worth below, and one worth 1 (the least a point can be worth)
    const tie = await roundTrip("mod-f1-tie", CITY);
    ok(tie.g1.value === CITY - 1 && JSON.stringify(vpsOf(tie.m, S.YK).map((v) => `${v.province}:${v.value}`)) === JSON.stringify([`${S.YK.vp}:${CITY}`]),
      `⭐⭐ YK's point worth exactly a city's ${CITY}: given ${CITY - 1}, not a tie HOI4 breaks its own way — and taken out when it comes back`, { given: tie.g1, back: vpsOf(tie.m, S.YK) });
    const one = await roundTrip("mod-f1-one", 1);
    ok(one.g1.value === 1 && JSON.stringify(vpsOf(one.m, S.YK).map((v) => `${v.province}:${v.value}`)) === JSON.stringify([`${S.YK.vp}:1`]),
      "⭐⭐ YK's point worth 1: given 1, the least a point can be worth — and taken out when its own comes back, so no tie is left", { given: one.g1, back: vpsOf(one.m, S.YK) });
    ok(one.s1.status.includes("worth 1,") && one.s1.status.includes(`as much as province ${S.YK.vp}'s 1`) && !/worth less than/.test(one.s1.status),
      "⭐ …and its Save line says the point is as much as the one YK lost, the least a point is worth — not that it is worth less", one.s1.status);
    // …and the words for a state that lost several (each a Save's writes took): less than each, or as much as the least
    {
      const { sb } = P.runPage(["function capitalTownNotes("], {});
      const g = (value, lost) => sb.capitalTownNotes({ victoryPoints: { given: [{ tag: "YYY", state: S.YK.id, province: ykRail[0], value, on: "rail", lost }], failed: [] } }, (sid) => `state ${sid}`)[0] || "";
      const several = g(4, [{ province: 61, value: 5 }, { province: S.YK.vp, value: 20 }]), least = g(1, [{ province: S.YK.vp, value: 20 }, { province: 61, value: 1 }]);
      ok(several.includes(`worth less than each of the 2 victory points the state lost (the best, province ${S.YK.vp}'s, was worth 20)`) && several.includes("any of them outranks it")
        && least.includes("as much as the least of the 2 victory points the state lost, province 61's 1") && !/worth less than/.test(least),
        "⭐ capitalTownNotes words a state that lost several: worth less than each of them, or as much as the least, worth 1", { several, least });
    }
    // CONTROLS: a victory point that comes in worth less than Nova's leaves it standing (it is what keeps the capital on the railway)…
    const c = makeMod("mod-f1-control-lesser", { values: { YK: LOST } });
    await saveThroughThePage(c, [move(S.YK.vp, S.YN.id, S.YK.id)]);
    const given = vpsOf(c, S.YK)[0] || {};
    const cs = await saveThroughThePage(c, [move(S.YA.vp, S.YK.id, S.YA.id)]);
    const cr = (cs.requests.find((x) => x.url === "/api/map/move-province") || {}).res || {};
    const kept = vpsOf(c, S.YK).map((v) => `${v.province}:${v.value}`).sort();
    ok(given.value === LOST - 1 && S.YA.value < given.value && cr.ok && !cr.standInsDropped && JSON.stringify(kept) === JSON.stringify([`${given.province}:${LOST - 1}`, `${S.YA.vp}:${S.YA.value}`].sort()),
      `CONTROL: YA's point (worth ${S.YA.value}) moved into YK leaves Nova's ${LOST - 1} standing`, { given, kept, standInsDropped: cr.standInsDropped });
    // …and a victory point the modder wrote is never taken for Nova's: the same move into a YK whose point is their own, worth as little
    const own = makeMod("mod-f1-control-own", { vps: { YK: idAt(8, 1) }, values: { YK: LOST - 1 } });
    const before = stateText(own, S.YK);
    const os2 = await saveThroughThePage(own, [move(S.YN.vp, S.YK.id, S.YN.id)]);
    const or2 = (os2.requests.find((x) => x.url === "/api/map/move-province") || {}).res || {};
    ok(or2.ok && !or2.standInsDropped && vpsOf(own, S.YK).some((v) => v.province === idAt(8, 1) && v.value === LOST - 1) && before.includes(`{ ${idAt(8, 1)} ${LOST - 1} }`),
      `CONTROL: a point of the modder's own in YK (${idAt(8, 1)}, worth ${LOST - 1}) stays when YN's (worth ${S.YN.value}) comes in`, { standInsDropped: or2.standInsDropped, vps: vpsOf(own, S.YK) });
    // …and a stand-in carried in is not a point of the state's own: YK's, moved into XXX's capital state, leaves X1's standing
    const both = makeMod("mod-f1-control-carried", { vps: { X1: null, YK: null } });
    const kb = givenIn(md.keepCapitalsOnTheirTown({ modRoot: both, gameRoot: GAME, dependencyRoots: [], tags: ["XXX", "YYY"] }));
    const gx = kb.find((g) => g.tag === "XXX") || {}, gy = kb.find((g) => g.tag === "YYY") || {};
    const mc = md.moveProvince({ modRoot: both, gameRoot: GAME, dependencyRoots: [], provinceId: gy.province, toStateId: S.X1.id });
    ok(gx.state === S.X1.id && gy.state === S.YK.id && gx.value <= gy.value && /capital stand-in, as XXX's capital state had no victory point/.test(stateText(both, S.X1))
      && mc && mc.changed && !mc.standInsDropped && vpsOf(both, S.X1).some((v) => v.province === gx.province && v.value === gx.value),
      `CONTROL: YK's stand-in (${gy.province}, worth ${gy.value}) moved into X1 leaves X1's own stand-in (${gx.province}, worth ${gx.value}) standing`, { gx, gy, standInsDropped: mc && mc.standInsDropped, x1: vpsOf(both, S.X1) });

    // ⛔ (review T08) A STAND-IN THE MODDER HAS SINCE CHANGED IS THEIRS. The state panel's value box and a text editor both keep the comment on
    // the line, so the mark stayed; the move that brought 9660 back deleted the modder's 716:15, saying "the one it had given". So the mark
    // says what the point was written worth, and a point worth anything else is no stand-in of Nova's.
    const changedByPanel = makeMod("mod-t08-panel", { values: { YK: LOST } });
    await saveThroughThePage(changedByPanel, [move(S.YK.vp, S.YN.id, S.YK.id)]);
    const was = vpsOf(changedByPanel, S.YK)[0] || {};
    ok(was.value === LOST - 1 && new RegExp(`# Nova: capital stand-in[^\\r\\n]*written worth ${LOST - 1}\\b`).test(stateText(changedByPanel, S.YK)),
      `(guard: Save 1 wrote the stand-in, its mark saying it was written worth ${LOST - 1})`, stateText(changedByPanel, S.YK));
    const TYPED = LOST - 4;
    // the panel's own writer, as /api/map/set-state calls it: every victory point the panel lists
    const typed = md.writeStateFields({ modRoot: changedByPanel, gameRoot: GAME, dependencyRoots: [], stateId: S.YK.id, fields: { victoryPoints: [{ province: was.province, value: TYPED }] } });
    ok(typed && typed.changed && vpsOf(changedByPanel, S.YK).some((v) => v.province === was.province && v.value === TYPED), `(guard: the state panel set it to ${TYPED})`, typed);
    const backPanel = await saveThroughThePage(changedByPanel, [move(S.YK.vp, S.YK.id, S.YN.id)]);
    const brPanel = (backPanel.requests.find((x) => x.url === "/api/map/move-province") || {}).res || {};
    const heldPanel = vpsOf(changedByPanel, S.YK).map((v) => `${v.province}:${v.value}`).sort();
    ok(brPanel.ok && !brPanel.standInsDropped && JSON.stringify(heldPanel) === JSON.stringify([`${was.province}:${TYPED}`, `${S.YK.vp}:${LOST}`].sort()),
      `⭐⭐⭐ a value the state panel changed is the modder's: ${S.YK.vp} coming back leaves ${was.province}:${TYPED} in YK`, { standInsDropped: brPanel.standInsDropped, heldPanel });
    ok(!/Nova took out/.test(backPanel.status), "⭐⭐ …and the Save line does not say Nova took out the one it had given", backPanel.status);
    const changedByHand = makeMod("mod-t08-hand", { values: { YK: LOST } });
    await saveThroughThePage(changedByHand, [move(S.YK.vp, S.YN.id, S.YK.id)]);
    const wasH = vpsOf(changedByHand, S.YK)[0] || {};
    const fileH = path.join(changedByHand, "history", "states", `${S.YK.id}-S.txt`);
    fs.writeFileSync(fileH, fs.readFileSync(fileH, "utf8").replace(`{ ${wasH.province} ${wasH.value} }`, () => `{ ${wasH.province} ${TYPED} }`));
    const brHand = md.moveProvince({ modRoot: changedByHand, gameRoot: GAME, dependencyRoots: [], provinceId: S.YK.vp, toStateId: S.YK.id });
    ok(brHand && brHand.changed && !brHand.standInsDropped && vpsOf(changedByHand, S.YK).some((v) => v.province === wasH.province && v.value === TYPED),
      "⭐⭐ …and so is one changed by hand in a text editor, with Nova's comment still on the line", { standInsDropped: brHand && brHand.standInsDropped, vps: vpsOf(changedByHand, S.YK) });
    // …carried in, it is a point of the state's own: the modder's, so a stand-in of X1's gives way to it
    const carriedChanged = makeMod("mod-t08-carried", { vps: { X1: null, YK: null } });
    const kbc = givenIn(md.keepCapitalsOnTheirTown({ modRoot: carriedChanged, gameRoot: GAME, dependencyRoots: [], tags: ["XXX", "YYY"] }));
    const gyc = kbc.find((g) => g.tag === "YYY") || {};
    md.writeStateFields({ modRoot: carriedChanged, gameRoot: GAME, dependencyRoots: [], stateId: S.YK.id, fields: { victoryPoints: [{ province: gyc.province, value: gyc.value + 1 }] } });
    const mcc = md.moveProvince({ modRoot: carriedChanged, gameRoot: GAME, dependencyRoots: [], provinceId: gyc.province, toStateId: S.X1.id });
    ok(mcc && mcc.changed && (mcc.standInsDropped || []).length === 1 && mcc.standInsDropped[0].state === S.X1.id && mcc.standInsDropped[0].byValue === gyc.value + 1,
      "⭐ a changed stand-in carried into another capital state counts as that state's own point", mcc && mcc.standInsDropped);

    // ⛔ (review T04) …AND A STAND-IN GIVEN WITH NOTHING TO STAND IN FOR GOES WHEN THE STATE HAS A POINT OF ITS OWN, WHATEVER IT IS WORTH. Auto-fix, Set capital and
    // ✨ New country know of no point the state lost, so theirs is worth what a state of its category is worth below: Auto-fix gave HUN's 43 716:21, and Budapest
    // (20) coming back left HOI4 standing the capital on Nova's point. Its reason was that the state had none, and now it has.
    const auto = makeMod("mod-t04-auto-fix", { vps: { YK: null } });
    const fxa = md.autoFixMap({ modRoot: auto, gameRoot: GAME, dependencyRoots: [] });
    const ga = (((fxa.fixes || {}).capitalVictoryPoints || {}).given || [])[0] || {};
    ok(ga.state === S.YK.id && ga.value === CITY && S.YN.value < CITY && /capital stand-in, as YYY's capital state had no victory point/.test(stateText(auto, S.YK)),
      `(guard: Auto-fix gave YK ${ga.province}:${CITY}, its mark saying the state had none; YN's point is worth less, ${S.YN.value})`, ga);
    const ma = md.moveProvince({ modRoot: auto, gameRoot: GAME, dependencyRoots: [], provinceId: S.YN.vp, toStateId: S.YK.id });
    ok(ma && ma.changed && (ma.standInsDropped || []).some((x) => x.province === ga.province && x.value === CITY && x.byValue === S.YN.value)
      && JSON.stringify(vpsOf(auto, S.YK).map((v) => `${v.province}:${v.value}`)) === JSON.stringify([`${S.YN.vp}:${S.YN.value}`]) && !/capital stand-in/.test(stateText(auto, S.YK)),
      "⭐⭐⭐ a point of the state's own coming in takes it out, though worth less: HOI4 stands the capital on the state's own point again", { standInsDropped: ma && ma.standInsDropped, vps: vpsOf(auto, S.YK) });
  }

  console.log("\n-- ⭐ (j) a Save stopped part-way and clicked again still asks what a Save asks at its end (review T04) --");
  {
    // A state file another program holds stops the Save at its second write. keep-capitals is asked after the last write, and its list lived in the flush, so the
    // stopped Save never asked and the Save that finished the queue had named nothing: HUN's 43 stayed with no victory point, and Auto-fix's, worth a city's, then
    // outranked Budapest when it came back.
    const LOST = 15, HELD = idAt(9, 3);
    const took = [{ province: S.YK.vp, value: LOST }];
    const refuseHeld = (u, b) => (u === "/api/map/move-province" && b.provinceId === HELD ? "Couldn't write 6-S.txt — the file is read-only or in use by another program. Nothing was changed." : "");
    const m = makeMod("mod-t04-retry", { values: { YK: LOST } });
    const page = openPage(m, [move(S.YK.vp, S.YN.id, S.YK.id), move(HELD, S.YN.id, S.YB.id)]);
    page.refuse = refuseHeld;
    const s1 = await page.save();
    const moved1 = s1.requests.filter((r) => r.url === "/api/map/move-province");
    ok(moved1.length === 2 && moved1[0].res.ok && !moved1[1].res.ok && /Save stopped at step 2/.test(s1.status) && !vpsOf(m, S.YK).length && !keepAsked(s1).length,
      "(guard: the first move landed and took YK's point; the second was refused; the stopped Save gave nothing: a retried write could still move the point out)", { requests: s1.requests.map((r) => [r.url, r.res.ok]), vps: vpsOf(m, S.YK), status: s1.status });
    page.refuse = null;
    const s2 = await page.save();
    const kc2 = keepAsked(s2);
    ok(kc2.length === 1 && s2.requests.indexOf(kc2[0]) === s2.requests.length - 1 && (kc2[0].body.tags || []).join() === "YYY" && (kc2[0].body.hubTags || []).join() === "YYY" && JSON.stringify((kc2[0].body.lost || {}).YYY) === JSON.stringify(took),
      "⭐⭐⭐ the Save that finishes the queue asks keep-capitals once, after its last write, for what the stopped Save's landed write named, and what it took", s2.requests.map((r) => [r.url, r.body.tags, r.body.lost]));
    const g2 = givenIn(kc2[0] && kc2[0].res.capitalTown)[0] || {};
    ok(g2.state === S.YK.id && g2.value === LOST - 1 && vpsOf(m, S.YK).some((v) => v.province === g2.province && v.value === LOST - 1) && !ruleRow(m),
      `⭐⭐⭐ YK gets its point, worth ${LOST - 1}, less than the ${LOST} it lost, and Map Errors has nothing to say`, { given: g2, vps: vpsOf(m, S.YK), rule: ruleRow(m) });
    ok(s2.status.includes("YYY's capital") && s2.status.includes(`province ${g2.province}`), "⭐⭐ …said on the line of the Save that gave it", s2.status);
    const st2 = s2.stateById.get(S.YK.id) || {};
    ok((st2.victoryPoints || []).some((v) => v.province === g2.province && v.value === LOST - 1), "⭐ …and in the page's own copy of YK", st2.victoryPoints);
    const back = await saveThroughThePage(m, [move(S.YK.vp, S.YK.id, S.YN.id)]);
    ok(JSON.stringify(vpsOf(m, S.YK).map((v) => `${v.province}:${v.value}`)) === JSON.stringify([`${S.YK.vp}:${LOST}`]) && !keepAsked(back).length,
      `⭐⭐⭐ ${S.YK.vp} moved back takes Nova's out: HOI4 stands the capital on it again, the symptom the stopped Save used to leave`, vpsOf(m, S.YK));
    // …and when what the stopped Save kept has since gone (a new state deleted, or purged by the Save itself), there is no write left to finish, and it is still owed
    const q = makeMod("mod-t04-queue-gone", { values: { YK: LOST } });
    const pq = openPage(q, [move(S.YK.vp, S.YN.id, S.YK.id), move(HELD, S.YN.id, S.YB.id)]);
    pq.refuse = refuseHeld;
    await pq.save();
    pq.refuse = null;
    pq.sandbox.pendingWrites = [];
    const sq = await pq.save();
    ok(keepAsked(sq).length === 1 && !/Nothing to save/.test(sq.status) && sq.status.includes("YYY's capital") && vpsOf(q, S.YK).some((v) => v.value === LOST - 1),
      "⭐⭐ a Save with nothing left in its queue still asks what the stopped one owes", { requests: sq.requests.map((x) => x.url), status: sq.status });
    const sq2 = await pq.save();
    ok(!sq2.requests.length && /Nothing to save/.test(sq2.status), "CONTROL: …once, and then there is nothing to save", { requests: sq2.requests.map((x) => x.url), status: sq2.status });
    // CONTROLS: once given it is owed no more, and a reload drops it with the queue it belonged to
    page.sandbox.pendingWrites = [move(idAt(9, 4), S.YN.id, S.YB.id)].map((w) => ({ url: w.url, body: { ...w.body }, meta: { ...w.meta } }));
    const s3 = await page.save();
    ok(s3.requests.length === 1 && s3.requests[0].res.ok && !keepAsked(s3).length, "CONTROL: the next Save on the same page, naming nobody, asks nothing again", s3.requests.map((r) => r.url));
    const r = makeMod("mod-t04-reload", { values: { YK: LOST } });
    // (YK's first province off the railway, so the point Auto-fix gives moves the capital: listed first, 20 is on the railway the point would stand on, the
    // capital already stands there, and Map Errors rightly has nothing to say of it — review of the merge, C-F1)
    const offRail = S.YK.provinces.find((q) => !railed.has(q));
    write(r, `history/states/${S.YK.id}-S.txt`, stateFile({ ...S.YK, provinces: [offRail, ...S.YK.provinces.filter((q) => q !== offRail)] }, { value: LOST }));
    const pr = openPage(r, [move(S.YK.vp, S.YN.id, S.YK.id), move(HELD, S.YN.id, S.YB.id)]);
    pr.refuse = refuseHeld;
    await pr.save();
    pr.refuse = null;
    pr.sandbox.model = { states: pageStates(r), supplyNodes: [] };   // load(): a new model, and the queue dropped with it
    pr.sandbox.pendingWrites = [move(idAt(9, 4), S.YN.id, S.YB.id)].map((w) => ({ url: w.url, body: { ...w.body }, meta: { ...w.meta } }));
    const sr = await pr.save();
    ok(sr.requests.length === 1 && !keepAsked(sr).length && ruleRow(r), "CONTROL: a reload drops what was owed with the queue it belonged to, and Map Errors reports the capital state", sr.requests.map((x) => x.url));
    const fr = md.autoFixMap({ modRoot: r, gameRoot: GAME, dependencyRoots: [] });
    const gr = (((fr.fixes || {}).capitalVictoryPoints || {}).given || [])[0] || {};
    const br = md.moveProvince({ modRoot: r, gameRoot: GAME, dependencyRoots: [], provinceId: S.YK.vp, toStateId: S.YK.id });
    ok(gr.value === CITY && LOST < CITY && br && (br.standInsDropped || []).some((x) => x.province === gr.province) && JSON.stringify(vpsOf(r, S.YK).map((v) => `${v.province}:${v.value}`)) === JSON.stringify([`${S.YK.vp}:${LOST}`]),
      `⭐⭐ …and Auto-fix's point, worth a city's ${CITY}, still goes when ${S.YK.vp} comes back`, { given: gr, vps: vpsOf(r, S.YK) });
  }

  try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) { /* scratch only */ }
  console.log("\n" + (fail ? "FAILED " + fail + "/" + (pass + fail) : "PASSED " + pass + "/" + pass));
  process.exitCode = fail ? 1 : 0;
})().catch((e) => { console.error(e); try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {} process.exitCode = 1; });
