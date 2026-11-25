// ⛔ #an-id-the-scripts-name-goes-back-to-its-country — A STATE MERGED OR DELETED AWAY ON A WORLD THAT REPLACES history/states SAYS WHICH
// LINES OF THE SCRIPTS NAME IT, AND THE ID AUTO-FIX CUTS AGAIN GOES BACK TO THE COUNTRY THAT HELD IT BELOW.
//
// HOI4 needs state ids to run 1..max. On a world that replaces history/states (a map mod, a Nova world) a Merge or a Delete leaves a gap,
// which Map Errors stops Save for (state_id_gap, fatal); Auto-fix closes it by sliding the highest state into it (closeStateIdGaps), and
// then cuts a state for the id the slide emptied, since the base game's scripts name it (fixStateIdFloor). renumberStateId rewrites the
// mod's own references, but a line of the base game's scripts naming the gap's id then acts on the slid state's land, and one naming the
// slid id on whatever is cut for it — and the floor cut the WORLD'S LARGEST state for it, whoever held the id: merging the base game's 57
// (Westfalen, GER) into 60 slid 1081 (Otago, NZL) into 57 and cut 35 provinces off SOV's Vologda as the new 1081 — then Map Errors said
// nothing at all (the generator-knowledge audit, SUS-2). Generate land's rule is that each country's states take the ids it held below
// (chooseGeneratedStateIds). Pinned on a world the mod owns outright over a base game whose scripts name two of its states:
//   (a) ⭐ the Merge, through server.js's own handler: its answer says how many lines name the merged-away id, where, which state Auto-fix
//       will slide into it and whose, how many lines name that one, and that merging the other way keeps the scripts where they were
//       written to; a merge of a state no line names says nothing; a Delete says the same of its state;
//   (b) ⭐ Auto-fix: the renumber says which lines below the mod change meaning; the id it cuts again is cut from the country that held it
//       below, not from the world's largest state (which another country owns); and the summary line says both;
//   (b2) ⭐ …and when the click closes a gap a second time (its final empty-state sweep deleted a state), both passes' renumbers are said;
//   (c) the page puts the merge's warning on the Save line;
//   (d) …and the click says it first, while Undo still takes it back;
//   (f) ⭐ the state Auto-fix slides into the gap is worked out in the gap closer's own order (lowest gap, highest id) over the ids the
//       whole Save leaves (review F3): the click sends its queue's id changes (a second Merge, a "+ New state"); the Save, through the
//       page's own flushMapSaves, asks again once a later merge has landed and puts the right state on its line, in either order; a
//       state created first is the one named; Auto-fix then renumbers exactly as said; one merge on its own still names the highest.
// Every expected value is read off the fixture. Fixture-only: binds no port.
// Run: node test-an-id-the-scripts-name-goes-back-to-its-country.js
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const vm = require("vm");
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-script-ids-"));
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

// ── the world: 12 x 4 provinces of 12 px, id = row * 12 + col + 1; land on rows 1-2, cols 0-9, sea round it ─────────────────────────
const CELL = 12, COLS = 12, ROWS = 4, W = COLS * CELL, H = ROWS * CELL;
const idAt = (c, r) => r * COLS + c + 1;
const provAt = (x, y) => idAt(Math.floor(x / CELL), Math.floor(y / CELL));
const colour = (id) => [(id * 29) % 256, (id * 67) % 256, 30 + id];
const cells = (cs, rs) => { const out = []; for (const r of rs) for (const c of cs) out.push(idAt(c, r)); return out; };
//   A1, AAA's, is the world's largest state; C6, CCC's capital, is the highest id; B4, BBB's, is the one merged away
const STATES = [
  { name: "A1", owner: "AAA", provinces: cells([0, 1, 2, 3], [1, 2]) },
  { name: "A2", owner: "AAA", provinces: cells([4], [1, 2]) },
  { name: "B3", owner: "BBB", provinces: cells([5], [1, 2]) },
  { name: "B4", owner: "BBB", provinces: cells([6], [1, 2]) },
  { name: "A5", owner: "AAA", provinces: cells([7], [1, 2]) },
  { name: "C6", owner: "CCC", provinces: cells([8, 9], [1, 2]) },
].map((s, k) => ({ ...s, id: k + 1, vp: s.provinces[0] }));
const S = Object.fromEntries(STATES.map((s) => [s.name, s]));
const LAND = new Set(STATES.flatMap((s) => s.provinces));
const stateFile = (s) => `state={\n\tid=${s.id}\n\tname="STATE_${s.id}" # ${s.name}\n\tmanpower=4000\n\tstate_category=town\n\tprovinces={ ${s.provinces.join(" ")} }\n`
  + `\thistory={\n\t\towner=${s.owner}\n\t\tadd_core_of=${s.owner}\n\t\tvictory_points = { ${s.vp} 5 }\n\t\tbuildings = { infrastructure = 2 air_base = 1 }\n\t}\n}\n`;
const CAPITALS = { AAA: S.A1.id, BBB: S.B3.id, CCC: S.C6.id };

const GAME = path.join(ROOT, "game");
write(GAME, "hoi4.exe", "");
write(GAME, "common/terrain/00_terrain.txt", ["categories = {", "  plains = { color = { 200 200 100 } }", "  ocean = { color = { 0 0 200 } is_water = yes }", "}",
  "terrain = {", "  plains = { type = plains color = { 0 } }", "  ocean = { type = ocean color = { 15 } }", "}", ""].join("\n"));
for (const s of STATES) write(GAME, `history/states/${s.id}-${s.name}.txt`, stateFile(s));
// the base game's scripts: three lines name B4 (4) — two scopes and a trigger's `owns_state = 4`, a line the count once missed (it read
// only scopes, reads and targets lists) — two name C6 (6), none names B3 (3) or A5 (5)
const EVENT = ["namespace = e", "country_event = {", "\tid = e.1", `\ttrigger = { owns_state = ${S.B4.id} }`, "\timmediate = {", `\t\t${S.B4.id} = { add_extra_state_shared_building_slots = 1 }`, `\t\t${S.C6.id} = { add_manpower = 100 }`, "\t}",
  "\toption = {", "\t\tname = e.1.a", `\t\t${S.C6.id} = { add_core_of = CCC }`, "\t}", "}", ""].join("\n");
const FOCUS = ["focus_tree = {", "\tid = f", "\tfocus = {", "\t\tid = F1", "\t\tcompletion_reward = {", `\t\t\t${S.B4.id} = { add_core_of = BBB }`, "\t\t}", "\t}", "}", ""].join("\n");
write(GAME, "events/e.txt", EVENT);
write(GAME, "common/national_focus/f.txt", FOCUS);
// …and the mod's own event, one line naming each: renumberStateId rewrites the mod's own references to the state it slides (they follow
// it), and not those naming the gap's id (they were written for the state merged away, and act on the slid one now)
const MOD_EVENT = ["namespace = m", "country_event = {", "\tid = m.1", "\timmediate = {", `\t\t${S.B4.id} = { add_manpower = 5 }`, `\t\t${S.C6.id} = { add_manpower = 6 }`, "\t}", "}", ""].join("\n");
const linesIn = (files, id) => files.flatMap(([f, t]) => t.split("\n").map((l, i) => (new RegExp(`^\\s*${id} = \\{|\\bowns_state = ${id}\\b`).test(l) ? `${f}:${i + 1}` : null)).filter(Boolean));
const BASE = [["events/e.txt", EVENT], ["common/national_focus/f.txt", FOCUS]], MODS = [["events/m.txt", MOD_EVENT]];
const linesNaming = (id) => linesIn(BASE, id);
const NAMING_4 = linesNaming(S.B4.id), NAMING_6 = linesNaming(S.C6.id), NAMING_3 = linesNaming(S.B3.id), NAMING_5 = linesNaming(S.A5.id);
const MOD_NAMING_4 = linesIn(MODS, S.B4.id), MOD_NAMING_6 = linesIn(MODS, S.C6.id);
const ALL_NAMING_4 = [...NAMING_4, ...MOD_NAMING_4];

/** the mod: a world of its own, as a map mod or a Nova world is — replace_path, its map, its states (the base game's, copied).
 *  `emptyCapital`: and a state of its own with no land, CCC's, that AAA's capital line names — the first empty-state pass skips it (a
 *  capital), the capital fixer moves AAA's capital onto AAA's land, and the final sweep deletes it: Auto-fix's second gap-closing pass */
function makeMod(tag, { emptyCapital = false } = {}) {
  const m = path.join(ROOT, tag);
  write(m, "descriptor.mod", `name="${tag}"\nreplace_path="history/states"\nsupported_version="1.*"\n`);
  write(m, "map/provinces.bmp", bmp24(W, H, (x, y) => colour(provAt(x, y))));
  const rows = ["0;0;0;0;land;false;unknown;0"];
  for (let id = 1; id <= COLS * ROWS; id++) rows.push(`${id};${colour(id).join(";")};${LAND.has(id) ? "land;false;plains;1" : "sea;false;ocean;0"}`);
  write(m, "map/definition.csv", rows.join("\n") + "\n");
  write(m, "map/terrain.bmp", bmp8(W, H, (x, y) => (LAND.has(provAt(x, y)) ? 0 : 15)));
  write(m, "map/heightmap.bmp", bmp8(W, H, (x, y) => (LAND.has(provAt(x, y)) ? 106 : 89)));
  write(m, "map/adjacencies.csv", "From;To;Type;Through;start_x;start_y;stop_x;stop_y;adjacency_rule_name;Comment\n-1;-1;-1;-1;-1;-1;-1;-1;-1\n");
  write(m, "map/strategicregions/r1.txt", `strategic_region={\n\tid=1\n\tname="REGION_1"\n\tprovinces={ ${[...LAND].join(" ")} }\n\tweather={}\n}\n`);
  const sea = []; for (let id = 1; id <= COLS * ROWS; id++) if (!LAND.has(id)) sea.push(id);
  write(m, "map/strategicregions/r2.txt", `strategic_region={\n\tid=2\n\tname="REGION_2"\n\tprovinces={ ${sea.join(" ")} }\n\tnaval_terrain=water_shallow_sea\n\tweather={}\n}\n`);
  for (const s of STATES) write(m, `history/states/${s.id}-${s.name}.txt`, stateFile(s));
  write(m, "events/m.txt", MOD_EVENT);
  const caps = { ...CAPITALS };
  if (emptyCapital) {
    write(m, `history/states/${EMPTY_ID}-E.txt`, `state={\n\tid=${EMPTY_ID}\n\tname="STATE_${EMPTY_ID}"\n\tmanpower=10\n\tstate_category=town\n\tprovinces={ }\n\thistory={\n\t\towner=CCC\n\t}\n}\n`);
    caps.AAA = EMPTY_ID;
  }
  for (const [t, c] of Object.entries(caps)) write(m, `history/countries/${t} - ${t}.txt`, `capital = ${c}\n`);
  return m;
}
const EMPTY_ID = STATES.length + 1;

// ── server.js's own merge-state and delete-state handlers, as the page reaches them ───────────────────────────────────────────────
const SERVER = fs.readFileSync(path.join(__dirname, "server.js"), "utf8").replace(/\r\n/g, "\n");
const routes = {};
for (const url of ["/api/map/merge-state", "/api/map/delete-state"]) {
  const at = SERVER.indexOf(`app.post("${url}"`);
  const end = at < 0 ? -1 : SERVER.indexOf("\n  app.", at + 10);
  ok(at >= 0 && end > at, `(server.js's ${url} handler is found)`, { at, end });
  vm.runInNewContext(SERVER.slice(at, end), {
    app: { post: (u, mw, fn) => { routes[u] = fn; } }, express: { json: () => null }, mapData: md, DEV_ROOT: "<dev>",
    getActiveRoot: () => "", checkActiveRootNotGameRoot() {}, resolveHoi4GameRoot: () => GAME, resolveDependencyRootsForAssets: () => [],
    forgetRemovedStateName: () => null,
  });
}
const post = (url, body) => {
  let status = 200, json = null;
  routes[url]({ body }, { status(c) { status = c; return this; }, json(j) { json = j; return this; } });
  return { status, ...(json || {}) };
};
// …and its read-only GET the page asks as a Merge or a Delete is staged
const getRoutes = {};
{
  const url = "/api/map/state-script-lines";
  const at = SERVER.indexOf(`app.get("${url}"`);
  const end = at < 0 ? -1 : SERVER.indexOf("\n  app.", at + 10);
  ok(at >= 0 && end > at, `(server.js's GET ${url} handler is found)`, { at, end });
  if (at >= 0 && end > at) vm.runInNewContext(SERVER.slice(at, end), {
    app: { get: (u, fn) => { getRoutes[u] = fn; } }, mapData: md, DEV_ROOT: "<dev>",
    getActiveRoot: () => "", resolveHoi4GameRoot: () => GAME, resolveDependencyRootsForAssets: () => [],
  });
}
const get = (pathAndQuery) => {
  const u = new URL(pathAndQuery, "http://nova.test");
  let status = 200, json = null;
  const fn = getRoutes[u.pathname];
  if (!fn) return { status: 404, ok: false, error: "no such route in this test: " + u.pathname };
  fn({ query: Object.fromEntries(u.searchParams) }, { status(c) { status = c; return this; }, json(j) { json = j; return this; } });
  return { status, ...(json || {}) };
};
/** what the page queues for a Merge — { sourceStateId, targetStateId } — and a Delete — { stateId } — with the modPath every write carries */
const merge = (mod, sourceStateId, targetStateId) => post("/api/map/merge-state", { sourceStateId, targetStateId, modPath: mod });
const del = (mod, stateId) => post("/api/map/delete-state", { stateId, modPath: mod });
const fieldsMatch = /const STATE_ID_FIELDS = \[([^\]]*)\]/.exec(P.MASKED);
const STATE_ID_FIELDS = fieldsMatch ? [...fieldsMatch[1].matchAll(/"([A-Za-z]+)"/g)].map((m) => m[1]) : [];

// ── the page's Save: flushMapSaves and the helpers it calls, lifted out of public/map.js, its fetch answered by the handlers above ──────
const FLUSH = (() => { try { return P.lift("async function flushMapSaves", "} finally { if (btn) btn.disabled = false; updateSaveButton(); }\n  }"); } catch (_) { return ""; } })();
const FLUSH_HELPERS = ["async function mapCrashGate", "function markSaveBoundary", "function capitalTownNotes(", "function adoptCapitalTown(", "function adoptFirstLand("]
  .map((o) => { try { return P.lift(o); } catch (_) { return ""; } });
/** The page, open on `mod` with `writes` queued as the page queues them (merges and deletes). `page.save()`: one 💾 Save → { status (the Save line), requests };
 *  the page stays open, so a Save that stopped keeps its queue for the next. `page.refuse(url, body)`: an error for a write to answer as the server answers a file it cannot replace. */
function openPage(mod, writes) {
  let status = "";
  let requests = [];
  const page = { refuse: null };
  const m0 = md.buildMapModel({ modRoot: mod, gameRoot: GAME, dependencyRoots: [], cacheStableLayers: false });
  const states = m0.states.map((s) => ({ id: s.id, name: s.name, displayName: (STATES.find((x) => x.id === s.id) || {}).name, owner: s.owner, provinces: (s.provinces || []).slice(), victoryPoints: [] }));
  const sandbox = {
    console, JSON, encodeURIComponent, Set, Map,
    pendingWrites: writes.map((w) => ({ url: w.url, body: { ...w.body }, meta: { ...(w.meta || {}) } })),
    paintDiff: new Map(), statusEl: { style: {} }, stateById: new Map(states.map((s) => [s.id, s])), model: { states, supplyNodes: [] },
    stagedRiverEdits: [], undoStack: [], redoStack: [], historyLabels: [], saveGeneration: 0, baseImageData: null, baseImageDataPristine: null,
    setStatus: (s) => { status = String(s); }, setMapDirty: () => {}, updateSaveButton: () => {}, modPath: () => mod,
    isVanillaTarget: () => false, problemsPanelOpen: () => false, refreshProblems: () => {}, renderCheckpoints: () => {},
    buildPidGrid: () => {}, computeCentroids: () => {}, recolorAll: () => {}, draw: () => {}, loadRiversOverlay: () => {},
    orphanedQueuedWrites: () => [], emptyNewStateWrites: () => [], stateFormDirty: () => false, stateFormBaseline: null,
    stageStateWrite: () => {}, remapQueuedStateId: () => {}, remapLocalStateId: () => {}, provincesBmpNote: () => "", riversPaintNote: () => "", heightmapNote: () => "", STATE_ID_FIELDS,
    adoptMergeRegions: () => {}, openMapErrorsModal: () => {}, saveMapBackup: () => {}, updateUndoButtons: () => {},
    rebuildStagedRiversFromPending: () => {}, $: () => null, window: { NovaMapRuleLabels: require("./public/map-rule-labels.js") }, provinceDef: new Map(), provinceToOwner: {},
    fetch: async (url, opts) => {
      const u = String(url);
      if (u.indexOf("/api/map/validate") === 0) return { ok: true, status: 200, json: async () => ({ ok: true, errors: 0, warnings: 0, problems: [] }) };
      let r;
      if (opts && opts.method === "POST") {
        const body = opts.body ? JSON.parse(opts.body) : {};
        const refused = page.refuse && page.refuse(u, body);
        r = refused ? { status: 400, ok: false, error: refused } : routes[u] ? post(u, body) : { status: 404, ok: false, error: "no such route in this test: " + u };
        requests.push({ url: u, body, res: r });
      } else {
        r = get(u);
        requests.push({ url: u, query: Object.fromEntries(new URL(u, "http://nova.test").searchParams), res: r });
      }
      return { ok: r.status === 200, status: r.status, json: async () => r };
    },
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(P.withNoteHelpers(`${FLUSH_HELPERS.join("\n")}\n${FLUSH}`) + "\nglobalThis.__run = flushMapSaves;", sandbox);
  page.save = async () => { requests = []; await sandbox.__run(); return { status, requests }; };
  return page;
}
/** 💾 Save through a page opened for it. */
const saveThroughThePage = (mod, writes) => openPage(mod, writes).save();

console.log("\n-- the fixture can tell right from wrong --");
ok(NAMING_4.length === 3 && NAMING_6.length === 2 && NAMING_3.length === 0 && NAMING_5.length === 0 && EVENT.split("\n").some((l) => l.includes(`owns_state = ${S.B4.id}`)),
  `(the fixture: the base game's scripts name 4 on ${NAMING_4.join(", ")} — one of them by owns_state, not a scope — 6 on ${NAMING_6.join(", ")}, and 3 and 5 nowhere)`);
ok(MOD_NAMING_4.length === 1 && MOD_NAMING_6.length === 1, `(the fixture: the mod's own event names 4 on ${MOD_NAMING_4.join(", ")} and 6 on ${MOD_NAMING_6.join(", ")})`);
{
  const largest = STATES.slice().sort((a, b) => b.provinces.length - a.provinces.length)[0];
  ok(largest.name === "A1" && largest.owner !== S.C6.owner && S.C6.provinces.length >= 2, "(the fixture: the world's largest state is AAA's, not CCC's — so a floor that cuts the largest cuts the wrong country)");
}

console.log("\n-- ⭐ (a) the Merge says which lines of the scripts name the state it removes --");
let merged;
{
  merged = makeMod("mod-merge");
  const r = merge(merged, S.B4.id, S.B3.id);
  ok(r.status === 200 && r.ok && r.changed, `(guard: B4 merged into B3)`, { status: r.status, error: r.error });
  const ids = r.scriptIds || {};
  const at = (e) => `${e.file}:${e.line}`;
  ok(ids.stateId === S.B4.id && ids.lines === ALL_NAMING_4.length && ids.outside === NAMING_4.length && (ids.examples || []).length === Math.min(3, ALL_NAMING_4.length)
    && ids.examples.every((e) => (e.fromMod ? MOD_NAMING_4 : NAMING_4).includes(at(e))) && !ids.examples[0].fromMod,
    `⭐⭐⭐ the answer counts the ${ALL_NAMING_4.length} lines naming ${S.B4.id} — ${NAMING_4.length} below the mod and its own — and says where they are, the layers below first`, r.scriptIds);
  ok(ids.slides && ids.slides.id === S.C6.id && ids.slides.owner === "CCC" && ids.slides.lines === NAMING_6.length + MOD_NAMING_6.length && ids.slides.below === NAMING_6.length
    && ids.kept && ids.kept.id === S.B3.id && ids.kept.lines === NAMING_3.length,
    "⭐⭐ …which state Auto-fix will slide into the gap (the highest, CCC's C6), how many lines name that one and how many of them are below the mod, and how many the kept state", { slides: ids.slides, kept: ids.kept });
  const w = String(r.scriptIdWarning || "");
  ok(w.startsWith("⚠") && w.includes(`State ${S.B4.id} is named by ${ALL_NAMING_4.length} lines`) && w.includes(NAMING_4[0]) && w.includes(`renumbering the highest state, ${S.C6.id} (CCC's), to ${S.B4.id}`)
    && w.includes(`the ${NAMING_6.length} lines below your mod naming ${S.C6.id}`) && w.includes(`your own files' references to ${S.C6.id} are rewritten to ${S.B4.id}`)
    && w.includes(`merging the other way — ${S.B3.id} into ${S.B4.id}`),
    "⭐⭐⭐ …in one ⚠ sentence for the Save line: the lines, the slide (and that the mod's own references to the slid state follow it), and merging the other way", w);
  const c = merge(makeMod("mod-merge-control"), S.A5.id, S.A2.id);
  ok(c.ok && c.changed && !c.scriptIds && !c.scriptIdWarning, "CONTROL: a merge of a state no line names says nothing", { scriptIds: c.scriptIds, w: c.scriptIdWarning });
  const d = del(makeMod("mod-delete"), S.B4.id);
  ok(d.ok && d.changed && (d.scriptIds || {}).lines === ALL_NAMING_4.length && String(d.scriptIdWarning || "").includes(`Keeping state ${S.B4.id}, with a province in it`),
    "⭐⭐ a Delete says the same of its state, and that keeping it keeps the scripts where they were written to", { scriptIds: d.scriptIds, w: d.scriptIdWarning });
}

console.log("\n-- ⭐ (b) Auto-fix: the renumber says what it changed, and the id it cuts again goes back to its country --");
{
  const fx = md.autoFixMap({ modRoot: merged, gameRoot: GAME, dependencyRoots: [] });
  const f = (fx && fx.fixes) || {};
  const sg = f.stateGaps || {}, sif = f.stateIdFloor || {};
  ok(fx && fx.ok && (sg.renumbered || []).some((x) => x.from === S.C6.id && x.to === S.B4.id), `(guard: Auto-fix slid ${S.C6.id} into the gap at ${S.B4.id})`, { error: fx && fx.error, renumbered: sg.renumbered, sgError: sg.error });
  const sl = (sg.scriptLines || []).find((x) => x.from === S.C6.id && x.to === S.B4.id);
  ok(sl && sl.namingTo === ALL_NAMING_4.length && sl.namingToBelow === NAMING_4.length && sl.namingFrom === NAMING_6.length && (sl.examples || []).length
    && sl.examples.every((e) => (e.fromMod ? MOD_NAMING_4 : NAMING_4).includes(`${e.file}:${e.line}`)),
    `⭐⭐⭐ the renumber says the ${ALL_NAMING_4.length} lines naming ${S.B4.id} as written — the mod's own one too, which the renumber does not touch — act on the slid state now, and the ${NAMING_6.length} below the mod naming ${S.C6.id} on what is cut for it next`, sg.scriptLines);
  const modEvent = fs.readFileSync(path.join(merged, "events", "m.txt"), "utf8");
  ok(linesIn([["events/m.txt", modEvent]], S.B4.id).length === MOD_NAMING_4.length + MOD_NAMING_6.length && !linesIn([["events/m.txt", modEvent]], S.C6.id).length,
    `(…and the mod's own line naming ${S.C6.id} was rewritten to ${S.B4.id}: it follows the state, as the count assumes)`, modEvent);
  ok(sif.added === 1 && sif.fromItsCountry === 1 && (sif.details || [])[0] && sif.details[0].ownerBelow === "CCC" && sif.details[0].id === S.C6.id,
    `⭐⭐⭐ the floor cut one state for id ${S.C6.id}, from the country that held it below (CCC)`, { added: sif.added, fromItsCountry: sif.fromItsCountry, details: sif.details, errors: sif.errors });
  const model = md.buildMapModel({ modRoot: merged, gameRoot: GAME, dependencyRoots: [], cacheStableLayers: false });
  const six = model.states.find((s) => s.id === S.C6.id), a1 = model.states.find((s) => s.id === S.A1.id);
  ok(six && six.owner === "CCC" && (six.provinces || []).length && six.provinces.every((p) => S.C6.provinces.includes(p)),
    `⭐⭐⭐ …so the new ${S.C6.id} is a piece of C6's own land, CCC's — what the base game's lines naming ${S.C6.id} were written for`, six && { owner: six.owner, provinces: six.provinces });
  ok(a1 && JSON.stringify(a1.provinces) === JSON.stringify(S.A1.provinces), "⭐⭐ …and AAA's A1, the world's largest state, is not cut", a1 && a1.provinces);
  const line = P.autoFixSummary(fx);
  ok(line.includes(`state ${S.C6.id} is state ${S.B4.id} now`) && line.includes(`the ${ALL_NAMING_4.length} line(s) of the scripts naming ${S.B4.id} (${NAMING_4.length} of them below your mod)`) && NAMING_4.some((l) => line.includes(l))
    && line.includes(`the ${NAMING_6.length} below your mod naming ${S.C6.id}`) && line.includes(`your own files' references to ${S.C6.id} were rewritten to ${S.B4.id}`),
    "⭐⭐ the summary line says which lines changed meaning, and where", line);
  ok(/split 1 of your states/.test(line) && line.includes("each cut from the country that held that id in the world below"),
    "⭐ …and that the state it split for the id was the country's that held it, not one of the largest", line);
  const fx2 = md.autoFixMap({ modRoot: merged, gameRoot: GAME, dependencyRoots: [] });
  ok(fx2 && fx2.ok && !((((fx2.fixes || {}).stateGaps) || {}).renumbered || []).length && !(((fx2.fixes || {}).stateIdFloor) || {}).added, "…and a second click renumbers and cuts nothing", fx2 && fx2.fixes && { sg: fx2.fixes.stateGaps, sif: fx2.fixes.stateIdFloor });
}

console.log("\n-- ⭐ (b2) …and when Auto-fix closes a gap a second time, after its final empty-state sweep --");
{
  const m = makeMod("mod-merge-two-passes", { emptyCapital: true });
  const r = merge(m, S.B4.id, S.B3.id);
  const fx = md.autoFixMap({ modRoot: m, gameRoot: GAME, dependencyRoots: [] });
  const f = (fx && fx.fixes) || {};
  const ren = (f.stateGaps || {}).renumbered || [];
  ok(r.ok && fx && fx.ok && ren.length === 2 && ren[0].from === EMPTY_ID && ren[0].to === S.B4.id && ren[1].from === S.C6.id && ren[1].to === S.B4.id && ((f.emptyStates || {}).deleted || []).includes(S.B4.id),
    `(guard: the first pass slid the empty ${EMPTY_ID} into ${S.B4.id}, the sweep deleted it, and the second slid ${S.C6.id} into ${S.B4.id})`, { renumbered: ren, emptyStates: f.emptyStates });
  const sl = (f.stateGaps || {}).scriptLines || [];
  ok(sl.length === 2 && sl[0].from === EMPTY_ID && sl[0].namingTo === ALL_NAMING_4.length && sl[1].from === S.C6.id && sl[1].to === S.B4.id && sl[1].namingTo === ALL_NAMING_4.length && sl[1].namingFrom === NAMING_6.length,
    "⭐⭐ both passes' renumbers say which lines they changed — the second pass's rebuild of the gap report keeps the first's", sl);
  const six = md.buildMapModel({ modRoot: m, gameRoot: GAME, dependencyRoots: [], cacheStableLayers: false }).states.find((s) => s.id === S.C6.id);
  ok(six && six.owner === "CCC" && six.provinces.every((p) => S.C6.provinces.includes(p)), `⭐ …and the ${S.C6.id} cut again is CCC's land, as in (b)`, six && { owner: six.owner, provinces: six.provinces });
}

console.log("\n-- (c) the page puts the warning on the Save line --");
{
  const src = P.MASKED;   // comments masked: a comment naming the call is not the call
  ok(/if \(res\.scriptIdWarning && writeWarnings\.indexOf\(res\.scriptIdWarning\) === -1\) writeWarnings\.push\(res\.scriptIdWarning\);/.test(src),
    "⭐ flushMapSaves pushes the answer's scriptIdWarning onto the Save line (a ⚠ note: the Save report shows every one)");
}

console.log("\n-- ⭐ (e) on the base game, the count names every state its scripts name, as Generate land weighs them --");
{
  // Read only, over the installed base game as a mod that replaces history/states loads its scripts. The count read only scopes, reads
  // and targets lists, and said nothing at all of ids the scripts name only by value or list (`owns_state = 515`, `states = { 961 }`):
  // now every id stateIdScriptNamings weighs is named, none it does not weigh, and none more often than its weight.
  const VANILLA = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
  if (!fs.existsSync(path.join(VANILLA, "history", "states"))) console.log("  SKIP the base game is not installed here — the real case did NOT run");
  else {
    const base = { modRoot: null, gameRoot: VANILLA, dependencyRoots: [] };
    const ceiling = md.baseStateIdCeiling({ gameRoot: VANILLA, dependencyRoots: [] });
    const ids = []; for (let i = 1; i <= ceiling; i++) ids.push(i);
    const lines = md.scriptLinesNamingStates(base, ids), weights = md.stateIdScriptWeights({ ...base, ceiling });
    const n = (i) => (lines.get(i) || {}).lines || 0, w = (i) => weights.get(i) || 0;
    const missed = ids.filter((i) => w(i) > 0 && !n(i)), extra = ids.filter((i) => !w(i) && n(i) > 0), over = ids.filter((i) => n(i) > w(i));
    ok(ceiling > 0 && weights.size > 0 && !missed.length && !extra.length && !over.length,
      `⭐⭐⭐ every one of the ${weights.size} ids the base game's scripts name is counted (${ids.reduce((s, i) => s + n(i), 0)} lines), none they do not name, none more often than its weight`,
      { ceiling, missed: missed.slice(0, 12), extra: extra.slice(0, 12), over: over.slice(0, 12) });
    // …and as often: a weight counts a line that names an id twice twice, the count once, and the base game repeats an id on a line
    // in well under 1% of its namings — a count that skipped a folder (history/units, history/countries, common/ai_strategy) or a kind
    // of naming falls far below
    const total = ids.reduce((s, i) => s + n(i), 0), wTotal = ids.reduce((s, i) => s + w(i), 0);
    ok(total <= wTotal && total >= 0.99 * wTotal, `⭐⭐ …${total} lines against the weights' ${wTotal} namings: the same folders and the same four kinds`, { total, wTotal });
  }
}

(async () => {
  console.log("\n-- ⭐ (d) …and the click says it first, while Undo still takes it back and merging the other way is still a choice --");
  {
    // the page's Merge click, run as the page runs it: doMergeState and the helpers it calls, over the page's own copy of the states
    const LIFTED = ["function setProvinceRegionLocally(", "function mergeRegionPlan(", "function doMergeState(", "function warnOfScriptNamedState(", "function scriptNamedStateNote(",
      "function orphanedQueuedWrites(", "function emptyNewStateWrites("].map((o) => { try { return P.lift(o); } catch (_) { return ""; } });
    // (⛔ #a-panel-edit-sends-what-the-modder-changed, #a-deleted-state-says-every-dockyard-it-takes — the merge click moves each province's levels and every moment of
    // the dockyards on the page, as the Save does; none a …Note helper)
    const MERGE_HELPERS = ["function moveProvinceLevels(", "function stateNavalLevels(", "function giveNavalDated(", "function navalDatedAfterCarry("]
      .map((o) => { try { return P.lift(o); } catch (_) { return ""; } })
      .concat([(() => { try { return P.lift("const NAVAL_ONLY_STATE_KEYS =", ";").replace(/^const /, "var "); } catch (_) { return ""; } })()]);
    ok(LIFTED.every((t) => t.length > 80), "(doMergeState and the helpers it calls are lifted out of public/map.js)", LIFTED.map((t) => t.length));
    // `queue`: what earlier clicks left in the page's queue (pendingWrites), as queueWrite leaves it
    const clickMerge = async (mod, sourceSid, targetSid, { overwrite = null, extra = [], queue = [] } = {}) => {
      const m0 = md.buildMapModel({ modRoot: mod, gameRoot: GAME, dependencyRoots: [], cacheStableLayers: false });
      const states = m0.states.map((s) => ({ id: s.id, name: s.name, displayName: (STATES.find((x) => x.id === s.id) || {}).name, owner: s.owner, provinces: (s.provinces || []).slice(),
        inBaseLayer: !!s.inBaseLayer, manpower: s.manpower, buildings: {}, resources: {} })).concat(extra);
      const asked = [], pending = [], queued = [];
      const statusEl = { textContent: "", style: {} };
      const sb = {
        console, JSON, encodeURIComponent, Map, Set,
        model: { states, capitals: m0.capitals, provinceToState: {}, provinceToRegion: {}, strategicRegions: [] }, stateById: new Map(states.map((s) => [s.id, s])),
        provinceToOwner: {}, statusEl, setStatus: (t) => { statusEl.textContent = String(t); }, modPath: () => mod,
        pendingWrites: queue.map((w) => ({ url: w.url, body: { ...w.body }, meta: { ...(w.meta || {}) } })), STATE_ID_FIELDS,
        queueWrite: (url, body, meta) => { queued.push({ url, body, meta }); sb.pendingWrites.push({ url, body: body || {}, meta: meta || {} }); }, pushUndo: () => {}, recolorAll: () => {}, draw: () => {},
        selected: null, stateFormBaseline: null, info: { style: {} },
        fetch: (url) => { asked.push(String(url)); const p = Promise.resolve(get(String(url))).then((j) => ({ ok: true, json: async () => j })); pending.push(p); return p; },
      };
      vm.createContext(sb);
      vm.runInContext(LIFTED.concat(MERGE_HELPERS).join("\n") + "\nglobalThis.__merge = doMergeState;", sb);
      sb.__merge(sourceSid, targetSid);
      const clicked = statusEl.textContent;
      if (overwrite) sb.setStatus(overwrite);
      await Promise.all(pending); for (let i = 0; i < 5; i++) await new Promise((r) => setImmediate(r));
      return { clicked, status: statusEl.textContent, asked, queued };
    };
    const statesDir = (mod) => fs.readdirSync(path.join(mod, "history", "states")).sort().map((f) => f + ":" + fs.readFileSync(path.join(mod, "history", "states", f), "utf8")).join("\n");
    const m = makeMod("mod-merge-click");
    const before = statesDir(m);
    const c = await clickMerge(m, S.B4.id, S.B3.id);
    ok(c.queued.length === 1 && c.queued[0].url === "/api/map/merge-state" && /^Merged /.test(c.clicked), "(guard: the click staged the merge and said so)", { queued: c.queued, clicked: c.clicked });
    const q = c.asked.length === 1 ? new URL(c.asked[0], "http://nova.test") : null;
    ok(q && q.pathname === "/api/map/state-script-lines" && q.searchParams.get("stateId") === String(S.B4.id) && q.searchParams.get("keptId") === String(S.B3.id) && q.searchParams.get("modPath") === m,
      "⭐⭐ the click asks the server which lines name the state it merges away, and which it keeps — read only", c.asked);
    ok(statesDir(m) === before, "…and nothing on disk changed: the merge is still only staged");
    const w = c.status.slice(c.clicked.length);
    ok(c.status.startsWith(c.clicked + "\n⚠") && w.includes(`State ${S.B4.id} is named by ${ALL_NAMING_4.length} lines`) && NAMING_4.some((l) => w.includes(l))
      && w.includes(`renumbering the highest state, ${S.C6.id} (CCC's), to ${S.B4.id}`) && w.includes(`Undo (Ctrl+Z) and merge ${S.B3.id} into ${S.B4.id} instead`),
      "⭐⭐⭐ under the click's own line: the lines, the state Auto-fix would slide into the gap, and Undo and merging the other way, while both are still choices", c.status);
    const cc = await clickMerge(makeMod("mod-merge-click-control"), S.A5.id, S.A2.id);
    ok(/^Merged /.test(cc.clicked) && cc.status === cc.clicked && cc.asked.length === 1, "CONTROL: a merge of a state no line names asks, and adds nothing to its line", { status: cc.status, asked: cc.asked });
    const co = await clickMerge(makeMod("mod-merge-click-later"), S.B4.id, S.B3.id, { overwrite: "a later click's line" });
    ok(co.status === "a later click's line", "CONTROL: an answer that comes back after another click said something does not overwrite it", co.status);
    // …and merged into a "+ New state" no Save has written yet (a provisional id below 0): there is no id of its own to name
    const np = await clickMerge(makeMod("mod-merge-click-into-new"), S.B4.id, -1, { extra: [{ id: -1, name: "STATE_new1", displayName: "New state 1", owner: "BBB", provinces: [], manpower: 1000, buildings: {}, resources: {} }] });
    const nq = np.asked.length === 1 ? new URL(np.asked[0], "http://nova.test") : null;
    const nw = np.status.slice(np.clicked.length);
    ok(/^Merged /.test(np.clicked) && nq && nq.searchParams.get("stateId") === String(S.B4.id) && !nq.searchParams.has("keptId")
      && nw.includes(`State ${S.B4.id} is named by`) && nw.includes(`Undo (Ctrl+Z) keeps state ${S.B4.id}`) && !/-1/.test(nw),
      "⭐ merged into a + New state not saved yet, it asks with no kept id and offers Undo, naming no provisional id", { asked: np.asked, note: nw });
    // the Delete click asks the same, with no state kept
    ok(/queueWrite\("\/api\/map\/delete-state", \{ stateId: sid \}\);\s*const deletedLine = [^;]+;\s*setStatus\(deletedLine\);\s*try \{ warnOfScriptNamedState\(sid, null, deletedLine\); \}/.test(P.MASKED),
      "⭐ the Delete button asks the same as it stages the delete, with no state kept");
    const { sb } = P.runPage(["function scriptNamedStateNote("], {});
    const ids = get(`/api/map/state-script-lines?modPath=${encodeURIComponent(m)}&stateId=${S.B4.id}`).scriptIds;
    const dn = sb.scriptNamedStateNote(ids, false);
    ok(dn.startsWith("⚠") && dn.includes("this delete leaves a gap") && dn.includes(`Undo (Ctrl+Z) keeps state ${S.B4.id}`) && !dn.includes("merge "), "⭐ …and words it for a delete", dn);

    console.log("\n-- ⭐ (f) the state Auto-fix slides into the gap is worked out in its own order, over the ids the whole Save leaves (F3) --");
    {
      // closeStateIdGaps fills the LOWEST gap with the highest id, then the next lowest with the highest left. With a second Merge in the
      // same Save, the warnings named the highest state for both gaps: on Millennium Dawn, 772 into 771 and 810 into 811 both said 1250
      // (UKR's), and Auto-fix slid 1250 into 772 and 1249 into 810 (review F3). Here: A2 (2) merged into A1 as well as B4 (4) into B3 —
      // gaps 2 and 4 — so the closer slides C6 (6, CCC's) into 2 and A5 (5, AAA's) into 4, and the lines naming 4 act on AAA's land.
      const gapSlides = (...a) => (typeof md.stateIdGapSlides === "function" ? md.stateIdGapSlides(...a) : { slides: [], gaps: [], stopped: null, missing: "map-data.js has no stateIdGapSlides" });
      const plan = gapSlides(md.buildMapModel({ modRoot: makeMod("mod-f3-plan"), gameRoot: GAME, dependencyRoots: [], cacheStableLayers: false }), [S.A1.id, S.B3.id, S.A5.id, S.C6.id]);
      ok(JSON.stringify(plan.slides) === JSON.stringify([{ from: S.C6.id, to: S.A2.id }, { from: S.A5.id, to: S.B4.id }]) && JSON.stringify(plan.gaps) === JSON.stringify([S.A2.id, S.B4.id]) && !plan.stopped,
        `(stateIdGapSlides, in the closer's order: ${S.C6.id} into ${S.A2.id}, then ${S.A5.id} into ${S.B4.id})`, plan);
      const stop = gapSlides(md.buildMapModel({ modRoot: makeMod("mod-f3-plan-stop"), gameRoot: GAME, dependencyRoots: [], cacheStableLayers: false }), [S.A1.id, S.B3.id, S.A5.id, S.C6.id], (n) => n !== S.C6.id);
      ok(!stop.slides.length && stop.stopped && stop.stopped.gap === S.A2.id && stop.stopped.max === S.C6.id, "(…and it stops where the closer stops: the highest is not the mod's)", stop);
      const second = `renumbers ${S.A5.id} (AAA's) to ${S.B4.id}`, wrong = `renumbering the highest state, ${S.C6.id} (CCC's), to ${S.B4.id}`;
      // (f1) the click, with a Merge of A2 already staged
      const mA2 = { url: "/api/map/merge-state", body: { sourceStateId: S.A2.id, targetStateId: S.A1.id }, meta: { merge: true } };
      const c1 = await clickMerge(makeMod("mod-f3-click-second"), S.B4.id, S.B3.id, { queue: [mA2] });
      const q1 = c1.asked.length === 1 ? new URL(c1.asked[0], "http://nova.test") : null;
      let sent = null; try { sent = JSON.parse((q1 && q1.searchParams.get("pending")) || "null"); } catch (_) { sent = null; }
      ok(JSON.stringify(sent) === JSON.stringify([{ op: "remove", id: S.A2.id }, { op: "remove", id: S.B4.id }]),
        "⭐⭐ the click sends its queue's own id changes with the ask, in the order the Save posts them", sent);
      const n1 = c1.status.slice(c1.clicked.length);
      ok(n1.includes(second) && n1.includes(`the gap at ${S.A2.id} takes ${S.C6.id}`) && !n1.includes(wrong),
        `⭐⭐⭐ …and says Auto-fix fills the gap at ${S.A2.id} first, so ${S.A5.id} (AAA's) is renumbered to ${S.B4.id} — not the highest state, ${S.C6.id} (CCC's)`, n1);
      // (f2) …and with a "+ New state" staged before it, which the Save writes at max + 1: that one is the highest when Auto-fix runs
      const newSt = { id: -1, name: "STATE_new1", displayName: "New state 1", owner: "BBB", provinces: [S.A1.provinces[0]], manpower: 1000, buildings: {}, resources: {} };
      const create = { url: "/api/map/create-state", body: { name: "", owner: "BBB" }, meta: { create: true, provisionalId: -1 } };
      const c2 = await clickMerge(makeMod("mod-f3-click-new"), S.B4.id, S.B3.id, { queue: [create], extra: [newSt] });
      const n2 = c2.status.slice(c2.clicked.length), NEW = STATES.length + 1;
      ok(n2.includes(`renumbering the highest state, the "+ New state" this Save makes (BBB's), which takes id ${NEW} when it is written, to ${S.B4.id}`) && !n2.includes(wrong),
        `⭐⭐ with a "+ New state" staged: it is the one Auto-fix slides into ${S.B4.id} (it takes ${NEW} when written)`, n2);
      const c2c = await clickMerge(makeMod("mod-f3-click-new-empty"), S.B4.id, S.B3.id, { queue: [create], extra: [{ ...newSt, provinces: [] }] });
      ok(c2c.status.slice(c2c.clicked.length).includes(wrong), `CONTROL: a "+ New state" left empty, which the Save discards, changes nothing: ${S.C6.id} (CCC's) is still the one`, c2c.status);
      // (f3) the Save, through the page's own flushMapSaves: B4's merge first, so its own answer — given before A2's merge — names C6
      const m3 = makeMod("mod-f3-save");
      const s3 = await saveThroughThePage(m3, [{ url: "/api/map/merge-state", body: { sourceStateId: S.B4.id, targetStateId: S.B3.id }, meta: { merge: true } }, mA2]);
      const merges = s3.requests.filter((r) => r.url === "/api/map/merge-state");
      ok(merges.length === 2 && merges.every((r) => r.res.ok) && String(merges[0].res.scriptIdWarning || "").includes(wrong),
        `(guard: both merges landed, and B4's own answer, given before A2's merge opened the lower gap, names ${S.C6.id})`, merges.map((r) => ({ ok: r.res.ok, w: r.res.scriptIdWarning })));
      const again = s3.requests.filter((r) => r.url.indexOf("/api/map/state-script-lines") === 0);
      ok(again.length === 1 && s3.requests.indexOf(again[0]) === s3.requests.indexOf(merges[1]) + 1 && JSON.parse(again[0].query.removed || "[]").some((x) => Number(x.stateId) === S.B4.id && Number(x.keptId) === S.B3.id),
        "⭐⭐ the page asks again, once the later merge has landed, of the state the scripts name", s3.requests.map((r) => r.url));
      ok(s3.status.includes(second) && !s3.status.includes(wrong), `⭐⭐⭐ the Save line says ${S.A5.id} (AAA's) is renumbered to ${S.B4.id}, not ${S.C6.id}`, s3.status);
      const fx3 = md.autoFixMap({ modRoot: m3, gameRoot: GAME, dependencyRoots: [] });
      const ren3 = (((fx3 && fx3.fixes) || {}).stateGaps || {}).renumbered || [];
      ok(JSON.stringify(ren3) === JSON.stringify([{ from: S.C6.id, to: S.A2.id }, { from: S.A5.id, to: S.B4.id }]),
        `⭐⭐⭐ …and Auto-fix then does exactly that: ${S.C6.id} into ${S.A2.id}, ${S.A5.id} into ${S.B4.id}`, ren3);
      // (f4) the other order: B4's own answer is given with the gap at 2 already open, and names A5 itself
      const m4 = makeMod("mod-f3-save-other-order");
      const s4 = await saveThroughThePage(m4, [mA2, { url: "/api/map/merge-state", body: { sourceStateId: S.B4.id, targetStateId: S.B3.id }, meta: { merge: true } }]);
      const b4 = (s4.requests.filter((r) => r.url === "/api/map/merge-state")[1] || {}).res || {};
      ok(String(b4.scriptIdWarning || "").includes(second) && ((b4.scriptIds || {}).slides || {}).id === S.A5.id && s4.status.includes(second) && !s4.status.includes(wrong),
        `⭐⭐ the other order: B4's own answer, with the gap at ${S.A2.id} already open, names ${S.A5.id} (AAA's), and so does the Save line`, { w: b4.scriptIdWarning, status: s4.status });
      // (f5) a state the Save creates is the highest when Auto-fix runs: created on disk, then B4 merged — its answer names the new one
      const m5 = makeMod("mod-f3-created");
      const cr = md.createState({ modRoot: m5, gameRoot: GAME, dependencyRoots: [], name: "", owner: "BBB", provinces: [S.A1.provinces[0]] });
      const r5 = merge(m5, S.B4.id, S.B3.id);
      const fx5 = md.autoFixMap({ modRoot: m5, gameRoot: GAME, dependencyRoots: [] });
      const ren5 = (((fx5 && fx5.fixes) || {}).stateGaps || {}).renumbered || [];
      ok(cr && cr.ok && cr.id === NEW && ((r5.scriptIds || {}).slides || {}).id === NEW && r5.scriptIds.slides.owner === "BBB" && String(r5.scriptIdWarning || "").includes(`renumbering the highest state, ${NEW} (BBB's), to ${S.B4.id}`)
        && ren5.length && ren5[0].from === NEW && ren5[0].to === S.B4.id,
        `⭐⭐ a state created first (${NEW}, BBB's) is the one the merge's answer names, and the one Auto-fix slides into ${S.B4.id}`, { id: cr && cr.id, slides: r5.scriptIds && r5.scriptIds.slides, ren5 });
      // CONTROL: one merge on its own still names the highest state, as it always did
      const m6 = makeMod("mod-f3-one");
      const s6 = await saveThroughThePage(m6, [{ url: "/api/map/merge-state", body: { sourceStateId: S.B4.id, targetStateId: S.B3.id }, meta: { merge: true } }]);
      ok(s6.status.includes(wrong) && !s6.requests.some((r) => r.url.indexOf("/api/map/state-script-lines") === 0),
        `CONTROL: one merge on its own still names the highest state, ${S.C6.id} (CCC's), and asks nothing again`, { status: s6.status, requests: s6.requests.map((r) => r.url) });
      // (f6) ⛔ (review T04) a Save stopped between the two merges and clicked again: the states it removed were local to the flush, so the Save that finished the queue
      // said nothing of B4 and left the stopped Save's words on the record: C6 into 4, where Auto-fix slides A5. Merge B4 lands, A2 is refused, then A2 lands.
      const m7 = makeMod("mod-t04-save-again");
      const p7 = openPage(m7, [{ url: "/api/map/merge-state", body: { sourceStateId: S.B4.id, targetStateId: S.B3.id }, meta: { merge: true } }, mA2]);
      p7.refuse = (u, b) => (u === "/api/map/merge-state" && b.sourceStateId === S.A2.id ? "Couldn't write 1-A1.txt — the file is read-only or in use by another program. Nothing was changed." : "");
      const s7a = await p7.save();
      ok(/Save stopped at step 2/.test(s7a.status) && s7a.status.includes(wrong), `(guard: the stopped Save says what its landed merge leaves so far: ${S.C6.id} into ${S.B4.id})`, s7a.status);
      p7.refuse = null;
      const s7b = await p7.save();
      const again7 = s7b.requests.filter((r) => r.url.indexOf("/api/map/state-script-lines") === 0);
      ok(again7.length === 1 && JSON.parse(again7[0].query.removed || "[]").some((x) => Number(x.stateId) === S.B4.id && Number(x.keptId) === S.B3.id),
        "⭐⭐⭐ the Save that finishes the queue asks again of the state the stopped Save's merge removed", s7b.requests.map((r) => r.url));
      ok(s7b.status.includes(second) && !s7b.status.includes(wrong), `⭐⭐⭐ …and its line says ${S.A5.id} (AAA's) is renumbered to ${S.B4.id}, where the stopped Save's said ${S.C6.id}`, s7b.status);
      const ren7 = (((md.autoFixMap({ modRoot: m7, gameRoot: GAME, dependencyRoots: [] }).fixes) || {}).stateGaps || {}).renumbered || [];
      ok(JSON.stringify(ren7) === JSON.stringify([{ from: S.C6.id, to: S.A2.id }, { from: S.A5.id, to: S.B4.id }]), "⭐⭐ …which is what Auto-fix then does", ren7);
      // …and a word the later writes leave true is said again: the last line is the one the modder has in front of them
      const m8 = makeMod("mod-t04-save-again-same");
      const p8 = openPage(m8, [{ url: "/api/map/merge-state", body: { sourceStateId: S.B4.id, targetStateId: S.B3.id }, meta: { merge: true } }, { url: "/api/map/set-capital", body: { tag: "CCC", stateId: S.C6.id } }]);
      p8.refuse = (u) => (u === "/api/map/set-capital" ? "Couldn't write CCC - CCC.txt — the file is read-only or in use by another program. Nothing was changed." : "");
      const s8a = await p8.save();
      p8.refuse = (u) => (u === "/api/map/set-capital" ? "" : "");
      routes["/api/map/set-capital"] = (req, res) => res.json({ ok: true, changed: false });
      const s8b = await p8.save();
      ok(s8a.status.includes(wrong) && s8b.status.includes(wrong) && /Saved 1 change/.test(s8b.status), "⭐ …and a word the later writes leave true is on the finishing Save's line too", s8b.status);
    }

    console.log("\n-- ⭐ (g) the slide's words where it does not do what they said (review T12) --");
    {
      const named6 = NAMING_6.length + MOD_NAMING_6.length;
      const noteOf = (mod, q) => { const { sb: nb } = P.runPage(["function scriptNamedStateNote("], {}); return nb.scriptNamedStateNote(get(`/api/map/state-script-lines?modPath=${encodeURIComponent(mod)}${q}`).scriptIds, true); };
      const renumbered = (mod) => { const fx = md.autoFixMap({ modRoot: mod, gameRoot: GAME, dependencyRoots: [] }); return { ren: (((fx.fixes || {}).stateGaps) || {}).renumbered || [], empties: ((fx.fixes || {}).emptyStates || {}).deleted || [] }; };
      const notCapital = (mod) => write(mod, "history/countries/CCC - CCC.txt", `capital = ${S.B3.id}\n`);   // C6, the highest, may then be merged away
      // what the Save posts for a "+ New state" and the province put in it, as the page queues them
      const newState = { url: "/api/map/create-state", body: { name: "", owner: "AAA" }, meta: { create: true, provisionalId: -1 } };
      const fill = (province, from) => ({ url: "/api/map/move-province", body: { provinceId: province, fromStateId: from, toStateId: -1 }, meta: {} });
      routes["/api/map/create-state"] = (req, res) => { const r = md.createState({ modRoot: req.body.modPath, gameRoot: GAME, dependencyRoots: [], name: req.body.name, owner: req.body.owner, provinces: [] }); res.json({ ok: !!r.ok, id: r.id }); };
      routes["/api/map/move-province"] = (req, res) => { const r = md.moveProvince({ modRoot: req.body.modPath, gameRoot: GAME, dependencyRoots: [], provinceId: req.body.provinceId, fromStateId: req.body.fromStateId, toStateId: req.body.toStateId }); res.json({ ok: !r.error, ...r }); };
      const mergeWrite = (a, b) => ({ url: "/api/map/merge-state", body: { sourceStateId: a, targetStateId: b }, meta: { merge: true } });

      // (g1) the highest merged away, then a "+ New state": the Save writes it at max + 1, which is the id the merge just freed. The lines name a state the map has again.
      const m1 = makeMod("mod-t12-retaken");
      notCapital(m1);
      const provNew = S.A1.provinces[0];
      const s1 = await saveThroughThePage(m1, [mergeWrite(S.C6.id, S.A5.id), newState, fill(provNew, S.A1.id)]);
      ok(s1.requests.filter((r) => /merge-state|create-state|move-province/.test(r.url)).every((r) => r.res.ok) && fs.readdirSync(path.join(m1, "history", "states")).some((f) => f.startsWith(`${S.C6.id}-`)) && md.buildMapModel({ modRoot: m1, gameRoot: GAME, dependencyRoots: [], cacheStableLayers: false }).states.find((s) => s.id === S.C6.id).provinces.includes(provNew),
        `(guard: the merge freed ${S.C6.id}, and the new state took it, with the province put in it)`, s1.requests.map((r) => [r.url, r.res.ok, r.res.error]));
      const line1 = s1.status;
      ok(line1.includes(`State ${S.C6.id} is named by ${named6} lines`) && !line1.includes("a state the map does not have"), `⭐⭐⭐ the Save line no longer says those lines name a state the map lacks: state ${S.C6.id} is on the map`, line1);
      ok(line1.includes(`the "+ New state" this Save made took id ${S.C6.id}`) && line1.includes("act on its land, not on the land they were written for") && /[Nn]o gap is left/.test(line1), "⭐⭐⭐ …it says the new state took the id, and that they act on its land", line1);
      const v1 = md.validateMapModel(md.buildMapModel({ modRoot: m1, gameRoot: GAME, dependencyRoots: [], cacheStableLayers: false })).filter((p) => p.rule === "state_id_gap");
      ok(!v1.length && !renumbered(m1).ren.length, "(…and Map Errors has no gap, and Auto-fix slides nothing: no gap is what it says)", v1);
      // CONTROL: the highest merged away with nothing after it: the state is gone, and the lines name a state the map does not have
      const m1c = makeMod("mod-t12-retaken-control");
      notCapital(m1c);
      const s1c = await saveThroughThePage(m1c, [mergeWrite(S.C6.id, S.A5.id)]);
      ok(s1c.status.includes("a state the map does not have") && !s1c.status.includes("New state"), "CONTROL: with no new state after it, they do name a state the map does not have", s1c.status);
      // …and a click's ask, of a state still on disk and not merged yet, is not taken for one a new state took
      const c1c = get(`/api/map/state-script-lines?modPath=${encodeURIComponent(makeMod("mod-t12-retaken-click"))}&stateId=${S.C6.id}&keptId=${S.A5.id}`).scriptIds;
      ok(c1c && !c1c.retaken && !/took id/.test(c1c.warning), "CONTROL: the click's ask of the highest, still on disk, says nothing of a new state", c1c);

      // (g2) merged into the highest: the state Auto-fix slides into the gap is the one kept, which holds the land the lines were written for
      const m2 = makeMod("mod-t12-kept-highest");
      const kept = get(`/api/map/state-script-lines?modPath=${encodeURIComponent(m2)}&stateId=${S.B4.id}&keptId=${S.C6.id}`).scriptIds;
      ok(kept && kept.slides && kept.slides.id === S.C6.id && kept.slides.kept === true, "(guard: the slide says it is the state kept)", kept && kept.slides);
      const click2 = noteOf(m2, `&stateId=${S.B4.id}&keptId=${S.C6.id}`);
      ok(click2.includes(`${S.C6.id} (CCC's), the one you kept,`) && click2.includes("holds the land they were written for as well as its own") && !click2.includes("not on the land"), "⭐⭐⭐ the click says the lines then act on the state you kept, which holds the land they were written for, where it said they did not", click2);
      const s2 = await saveThroughThePage(m2, [mergeWrite(S.B4.id, S.C6.id)]);
      ok(s2.status.includes(`${S.C6.id} (CCC's), the one you kept,`) && s2.status.includes("holds the land they were written for as well as its own") && !s2.status.includes("not on the land"), "⭐⭐⭐ …and so does the Save line", s2.status);
      const r2 = renumbered(m2);
      const held = (md.buildMapModel({ modRoot: m2, gameRoot: GAME, dependencyRoots: [], cacheStableLayers: false }).states.find((s) => s.id === S.B4.id) || {}).provinces || [];
      // (of its own land, less what Auto-fix then cuts for id ${S.C6.id}, since the base game's scripts name it: fixStateIdFloor)
      ok(JSON.stringify(r2.ren) === JSON.stringify([{ from: S.C6.id, to: S.B4.id }]) && S.B4.provinces.every((p) => held.includes(p)) && S.C6.provinces.some((p) => held.includes(p)), `⭐⭐ …which is what happens: ${S.C6.id} slides into ${S.B4.id}, holding both lands`, { r2, held });
      // CONTROL: the highest is not the one kept
      const c2 = noteOf(makeMod("mod-t12-kept-other"), `&stateId=${S.B4.id}&keptId=${S.B3.id}`);
      ok(c2.includes("not on the land they were written for") && !c2.includes("(CCC's), the one you kept,"), "CONTROL: a merge into another state still says they act on the land of the state slid", c2);

      // (g3) a state empty on disk (by hand, or left by an earlier tool) below the merge: Auto-fix deletes it before it closes the gaps, so the highest fills ITS id
      const emptied = (tag) => {
        const m = makeMod(tag);
        write(m, `history/states/${S.B3.id}-${S.B3.name}.txt`, stateFile({ ...S.B3, provinces: [] }).replace(/victory_points[^\n]*\n/, ""));
        write(m, "history/countries/BBB - BBB.txt", `capital = ${S.A1.id}\n`);   // B3, BBB's capital, is no capital now
        return m;
      };
      const m3 = emptied("mod-t12-sweep");
      const s3 = await saveThroughThePage(m3, [mergeWrite(S.B4.id, S.A2.id)]);
      const line3 = s3.status;
      const r3 = renumbered(m3);
      ok(JSON.stringify(r3.empties) === JSON.stringify([S.B3.id]) && JSON.stringify(r3.ren) === JSON.stringify([{ from: S.C6.id, to: S.B3.id }, { from: S.A5.id, to: S.B4.id }]), `(guard: Auto-fix deletes the empty ${S.B3.id}, so ${S.C6.id} fills it and ${S.A5.id} fills ${S.B4.id})`, r3);
      ok(line3.includes(`renumbers ${S.A5.id} (AAA's) to ${S.B4.id}`) && !line3.includes(`renumbering the highest state, ${S.C6.id} (CCC's), to ${S.B4.id}`), `⭐⭐⭐ the Save line says ${S.A5.id} slides into ${S.B4.id}, which it does, where it said ${S.C6.id}`, line3);
      ok(line3.includes(`deletes the empty state ${S.B3.id} first`), "⭐⭐ …and why: the state it deletes first", line3);
      const click3 = noteOf(emptied("mod-t12-sweep-click"), `&stateId=${S.B4.id}&keptId=${S.A2.id}`);
      ok(click3.includes(`deletes the empty state ${S.B3.id} first`) && click3.includes(`${S.A5.id} (AAA's)`) && !click3.includes(`the highest state, ${S.C6.id}`), "⭐⭐⭐ …and so does the click", click3);
      // …a queued province for it means it will not be empty when Auto-fix runs
      const q3 = get(`/api/map/state-script-lines?modPath=${encodeURIComponent(emptied("mod-t12-sweep-filled"))}&stateId=${S.B4.id}&keptId=${S.A2.id}&pending=${encodeURIComponent(JSON.stringify([{ op: "fill", id: S.B3.id }, { op: "remove", id: S.B4.id }]))}`).scriptIds;
      ok(q3 && q3.slides && q3.slides.id === S.C6.id && !(q3.swept || []).length, "⭐⭐ a state the queue puts a province in is not one Auto-fix deletes", q3 && { slides: q3.slides, swept: q3.swept });
      const cf = await clickMerge(emptied("mod-t12-sweep-click-filled"), S.B4.id, S.A2.id, { queue: [{ url: "/api/map/move-province", body: { provinceId: S.A1.provinces[0], fromStateId: S.A1.id, toStateId: S.B3.id } }] });
      ok(!cf.status.includes("empty state") && cf.status.includes(`the highest state, ${S.C6.id} (CCC's)`), "⭐ …which the click sends with its ask", cf.status);
      // the empty states above it: Auto-fix's deleting them is what leaves no id above it
      const top = emptied("mod-t12-sweep-above");
      for (const s of [S.A5, S.C6]) write(top, `history/states/${s.id}-${s.name}.txt`, stateFile({ ...s, provinces: [] }).replace(/victory_points[^\n]*\n/, ""));
      write(top, "history/countries/CCC - CCC.txt", `capital = ${S.A1.id}\n`);
      const ab = get(`/api/map/state-script-lines?modPath=${encodeURIComponent(top)}&stateId=${S.B4.id}&keptId=${S.A2.id}`).scriptIds;
      ok(ab && !ab.gap && !ab.slides && String(ab.warning).includes(`deletes the empty states ${S.B3.id}, ${S.A5.id} and ${S.C6.id}, which leaves no state id above it, so no gap is left there`), "⭐ the empty states above it: their going is what leaves no gap, and the words say so", ab && ab.warning);
      const noteAb = noteOf(top, `&stateId=${S.B4.id}&keptId=${S.A2.id}`);
      ok(noteAb.includes(`deletes the empty states ${S.B3.id}, ${S.A5.id} and ${S.C6.id}, which leaves no state id above it, so no gap is left`), "⭐ …at the click too", noteAb);
      // a capital state Auto-fix leaves, and a state it would hand back to the base game, are not swept
      const m3c = emptied("mod-t12-sweep-capital");
      write(m3c, "history/countries/BBB - BBB.txt", `capital = ${S.B3.id}\n`);
      const c3c = get(`/api/map/state-script-lines?modPath=${encodeURIComponent(m3c)}&stateId=${S.B4.id}&keptId=${S.A2.id}`).scriptIds;
      ok(c3c && !(c3c.swept || []).length && c3c.slides && c3c.slides.id === S.C6.id, "CONTROL: an empty capital state stands: the first sweep skips it", c3c && { swept: c3c.swept, slides: c3c.slides });
      const inherited = makeMod("mod-t12-sweep-inherited");
      fs.writeFileSync(path.join(inherited, "descriptor.mod"), 'name="inherited"\nsupported_version="1.*"\n');
      write(inherited, `history/states/${S.B3.id}-${S.B3.name}.txt`, stateFile({ ...S.B3, provinces: [] }).replace(/victory_points[^\n]*\n/, ""));
      write(inherited, "history/countries/BBB - BBB.txt", `capital = ${S.A1.id}\n`);
      const c3i = get(`/api/map/state-script-lines?modPath=${encodeURIComponent(inherited)}&stateId=${S.B4.id}&keptId=${S.A2.id}`).scriptIds;
      const delInherited = md.deleteState({ modRoot: inherited, gameRoot: GAME, dependencyRoots: [], stateId: S.B3.id });
      ok(/would just bring the original back/.test(String(delInherited.error || "")) && c3i && !(c3i.swept || []).length, "CONTROL: a state whose base-game copy would come back stands: deleteState refuses it", { error: delInherited.error, swept: c3i && c3i.swept });

      // (g4) a province put in the new state after the merge that named it: the merge's own answer saw it empty, and the Save's last write fills it. The line must say what the Save leaves.
      const m4 = makeMod("mod-t12-filled-after");
      const s4 = await saveThroughThePage(m4, [newState, mergeWrite(S.B4.id, S.B3.id), fill(S.A1.provinces[0], S.A1.id)]);
      const NEW4 = STATES.length + 1;
      const merge4 = s4.requests.find((r) => r.url === "/api/map/merge-state") || { res: {} };
      ok(String(merge4.res.scriptIdWarning || "").includes(`deletes the empty state ${NEW4} first`), "(guard: the merge's own answer, before the last write, sees the new state empty)", merge4.res.scriptIdWarning);
      const again4 = s4.requests.filter((r) => r.url.indexOf("/api/map/state-script-lines") === 0);
      const moved4 = s4.requests.findIndex((r) => r.url === "/api/map/move-province");
      ok(again4.length === 1 && s4.requests.indexOf(again4[0]) === moved4 + 1 && s4.status.includes(`renumbering the highest state, ${NEW4}`) && !s4.status.includes("empty state"),
        "⭐⭐⭐ the Save asks again after its last write, so its line says the new state slides, and nothing of an empty one", { urls: s4.requests.map((r) => r.url), status: s4.status });
      ok(JSON.stringify(renumbered(m4).ren[0]) === JSON.stringify({ from: NEW4, to: S.B4.id }), "⭐⭐ …which is what Auto-fix does", renumbered(m4).ren);
    }
  }

  try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) { /* scratch only */ }
  console.log("\n" + (fail ? "FAILED " + fail + "/" + (pass + fail) : "PASSED " + pass + "/" + pass));
  process.exitCode = fail ? 1 : 0;
})().catch((e) => { console.error(e); try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {} process.exitCode = 1; });
