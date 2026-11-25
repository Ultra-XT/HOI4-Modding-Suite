// ⛔ #an-erase-stroke-keeps-its-own-backups — AN ERASE STROKE'S SAVE KEEPS ITS OWN FIRST COPIES (review of the tools' ground, G2).
//
// The 🧽 Erase brush queues one POST /api/map/flip-province-sea { provinceId } per province (public/map.js eraseProvinceLocal), and the
// map page's Save replayed them one request each. Every flip wrote definition.csv twice, the province's state, buildings.txt, its
// strategic region and, through its own sinkProvincesInHeightmap, heightmap.bmp, terrain.bmp, world_normal.bmp, the colour map, the
// water tints, the fog and the minimap: 12 to 15 backups and about 42 MB a province, into the map backups' pool that pruneBackups cuts
// to 200 after every backup. Replayed with the page's own bodies on a copy of the base game, a 24-province stroke had filled the pool by
// its 15th province and the Save's own first copies of definition.csv, heightmap.bmp and terrain.bmp were gone: the only copies of
// those files as they stood before the Save. No backup scope was opened and there was no batch endpoint, where Generate land, Delete
// map, Redraw regions and Auto-fix each run in one scope (#a-bulk-map-click-evicted-its-own-backups) and the Terrain brush's run went to
// one request (#the-terrain-brush-paints-its-towns-in-one-write).
//
// Now the page sends a run of erases as ONE POST /api/map/flip-provinces-sea, and the server flips each in order, sinks them all in one
// sinkProvincesInHeightmap and does it inside one backup scope, whose folder keeps every file it overwrote as it was before the Save.
//
// The world: a strip of 12 coastal provinces (2..13) under a sea (1), and two inland provinces (20, 21) under them; a mod that owns its
// map's definition, heights, ground, states, regions and buildings, as one earlier Save leaves it. The Save is the page's own
// flushMapSaves, against the real server, with the writes queued as eraseProvinceLocal queues them.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-erase-stroke-"));
process.env.APPDATA = path.join(ROOT, "appdata"); process.env.NOVA_APP_DATA_DIR = process.env.APPDATA; process.env.XDG_CONFIG_HOME = process.env.APPDATA;
process.env.NOVA_HOME_DIR = path.join(ROOT, "home");
process.env.HOI4_MODS_ROOT = path.join(ROOT, "mods");
for (const d of [process.env.APPDATA, process.env.NOVA_HOME_DIR, process.env.HOI4_MODS_ROOT]) fs.mkdirSync(d, { recursive: true });
const md = require("./map-data.js");
const P = require("./testlib-map-page.js");
const { BACKUP_DIR } = require("./safe-write.js");
const { maskJsComments } = require("./testlib-strip-comments.js");

let pass = 0, fail = 0;
const ok = (c, m, x) => {
  if (c) { pass++; console.log("  ok   " + m); }
  else { fail++; console.log("  FAIL " + m + (x !== undefined ? "   -> " + JSON.stringify(x).slice(0, 600) : "")); }
};
const write = (dir, rel, body) => { const p = path.join(dir, ...rel.split("/")); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, body); return p; };
const sha = (p) => crypto.createHash("sha1").update(fs.readFileSync(p)).digest("hex");
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
const read8 = (file) => { const b = fs.readFileSync(file), W = b.readInt32LE(18), H = b.readInt32LE(22), off = b.readUInt32LE(10), rs = Math.floor((8 * W + 31) / 32) * 4; return (x, y) => b[off + (H - 1 - y) * rs + x]; };

// ── the world: sea 1 across the top, coastal land 2..13 under it (12 px each), inland 20 and 21 under them ─────────────────────────────
const W = 144, H = 64, SEA = 1, COAST = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13], IN1 = 20, IN2 = 21;
const provAt = (x, y) => (y < 16 ? SEA : y < 40 ? 2 + Math.floor(x / 12) : y < 52 ? IN1 : IN2);
const colour = (id) => [(id * 37) % 256, (id * 71) % 256, 40 + id];
const PLAINS = 0, OCEAN = 15;
// the sea floor at 89 with shallows of 92 against the coast; the coast's beach 94 and 98, the land behind at 110
const heightAt = (x, y) => (y < 14 ? 89 : y < 16 ? 92 : y === 16 ? 94 : y === 17 ? 98 : 110);
const stateFiles = { "history/states/1-West.txt": [1, [2, 3, 4, 5, 6, 7]], "history/states/2-East.txt": [2, [8, 9, 10, 11, 12, 13]], "history/states/3-Inland.txt": [3, [IN1, IN2]] };
const stateText = (id, provs) => `state={\n\tid=${id}\n\tname="STATE_${id}"\n\tmanpower=100000\n\tstate_category=rural\n\tprovinces={ ${provs.join(" ")} }\n\thistory={\n\t\towner=AAA\n\t}\n}\n`;
// a building row stands at x;y;z with z counted up from the bottom row of the map
const row = (state, type, x, y, rot, extra) => `${state};${type};${x.toFixed(2)};9.50;${(H - 1 - y).toFixed(2)};${rot.toFixed(2)};${extra}`;
function makeGame() {
  const g = path.join(ROOT, "game");
  write(g, "hoi4.exe", "");
  write(g, "map/provinces.bmp", bmp24(W, H, (x, y) => colour(provAt(x, y))));
  const rows = ["0;0;0;0;land;false;unknown;0", `${SEA};${colour(SEA).join(";")};sea;false;ocean;0`];
  for (const id of COAST) rows.push(`${id};${colour(id).join(";")};land;true;plains;1`);
  for (const id of [IN1, IN2]) rows.push(`${id};${colour(id).join(";")};land;false;plains;1`);
  write(g, "map/definition.csv", rows.join("\r\n") + "\r\n");
  write(g, "map/heightmap.bmp", bmp8(W, H, heightAt));
  write(g, "map/terrain.bmp", bmp8(W, H, (x, y) => (provAt(x, y) === SEA ? OCEAN : PLAINS)));
  write(g, "common/terrain/00_terrain.txt", [
    "categories = {", "  plains = { color = { 200 200 100 } }", "  ocean = { color = { 0 0 200 } is_water = yes }", "}",
    "terrain = {", "  plains = { type = plains color = { 0 } }", "  ocean = { type = ocean color = { 15 } }", "}", ""].join("\n"));
  for (const [rel, [id, provs]] of Object.entries(stateFiles)) write(g, rel, stateText(id, provs));
  write(g, "map/strategicregions/1-Sea.txt", `strategic_region={\n\tid=1\n\tname="STRATEGICREGION_1"\n\tprovinces={\n\t\t${SEA}\n\t}\n}\n`);
  write(g, "map/strategicregions/2-Land.txt", `strategic_region={\n\tid=2\n\tname="STRATEGICREGION_2"\n\tprovinces={\n\t\t${[...COAST, IN1, IN2].join(" ")}\n\t}\n}\n`);
  // each state's air base and rocket site on land the strokes below keep; a harbour on 3 facing the sea, a bunker on 5
  const centre = (id) => (id === IN1 ? [72, 46] : id === IN2 ? [72, 58] : [12 * (id - 2) + 6, 28]);
  const B = [];
  for (const [state, on] of [[1, 7], [2, 12], [3, IN1]]) { const [x, y] = centre(on); B.push(row(state, "air_base", x, y, 0, 0), row(state, "rocket_site_spawn", x + 1, y, 0, 0)); }
  B.push(row(1, "naval_base_spawn", 30, 17, 0, SEA), row(1, "bunker", 54, 30, 0, 0));
  write(g, "map/buildings.txt", B.join("\n") + "\n");
  write(g, "map/default.map", 'definitions = "definition.csv"\nprovinces = "provinces.bmp"\nterrain = "terrain.bmp"\nheightmap = "heightmap.bmp"\n');
  return g;
}
const GAME = makeGame();
// what an earlier Save has left the mod owning
const OWNED = ["map/definition.csv", "map/heightmap.bmp", "map/terrain.bmp", "map/buildings.txt", "map/strategicregions/1-Sea.txt", "map/strategicregions/2-Land.txt", ...Object.keys(stateFiles)];
let modN = 0;
const freshMod = () => {
  const m = path.join(process.env.HOI4_MODS_ROOT, "erase" + (++modN));
  write(m, "descriptor.mod", 'name="an erase stroke keeps its own backups"\n');
  for (const rel of OWNED) write(m, rel, fs.readFileSync(path.join(GAME, rel)));
  return m;
};
/** every file of a mod, by its path in the mod, with its sha */
const filesOf = (dir) => { const out = new Map(); const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else out.set(path.relative(dir, p).split(path.sep).join("/"), sha(p)); } }; walk(dir); return out; };
const backups = () => { try { return fs.readdirSync(BACKUP_DIR); } catch (_) { return []; } };
const backupsOf = (mod, names) => names.filter((n) => n.includes(path.basename(mod)));
const typeOf = (mod, id) => (fs.readFileSync(path.join(mod, "map/definition.csv"), "utf8").split(/\r?\n/).find((l) => l.split(";")[0] === String(id)) || "").split(";")[4];
const heightsOf = (mod, id) => { const at = read8(path.join(mod, "map/heightmap.bmp")); const out = []; for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (provAt(x, y) === id) out.push(at(x, y)); return out; };

console.log("\n-- the wiring, read from the code --");
{
  const MD = maskJsComments(fs.readFileSync(path.join(__dirname, "map-data.js"), "utf8"));
  const SV = maskJsComments(fs.readFileSync(path.join(__dirname, "server.js"), "utf8"));
  const a = MD.indexOf("function flipProvincesToSea(");
  const body = a < 0 ? "" : MD.slice(a, MD.indexOf("\nfunction ", a + 10));
  ok(typeof md.flipProvincesToSea === "function", "map-data.js exports flipProvincesToSea");
  ok(/beginBackupScope\(/.test(body) && /endBackupScope\(/.test(body) && /finally/.test(body), "⭐ …which runs the stroke inside one backup scope, closed in a finally", body.length);
  ok((body.match(/sinkProvincesInHeightmap\(/g) || []).length === 1 && /sinkLater: true/.test(body), "⭐ …and flips each province with its sink held back for ONE sink of the stroke", body.length);
  ok(/app\.post\("\/api\/map\/flip-provinces-sea"/.test(SV) && /mapData\.flipProvincesToSea\(/.test(SV), "server.js answers POST /api/map/flip-provinces-sea with it");
}

(async () => {
  process.env.HOI4_ROOT = GAME;
  const { createApp } = require("./server.js");
  let server = null;
  try {
    server = await new Promise((res, rej) => { const s = createApp().listen(0, "127.0.0.1", () => res(s)); s.on("error", rej); });
    const base = `http://127.0.0.1:${server.address().port}`;
    const post = (url, body) => fetch(base + url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json());
    /** 💾 the page's own Save of `writes`, each queued through the page's own queueWrite, as eraseProvinceLocal queues them */
    const saveThroughThePage = async (M, ids) => {
      const posted = [];
      const page = P.runPage([
        ["const STATE_ID_FIELDS = ", "\n"], "function orphanedQueuedWrites(writes)", "function emptyNewStateWrites(writes, stateById)",
        "function markSaveBoundary", "function queueWrite(url, body, meta)", "function terrainWriteNotes(",
        ["async function flushMapSaves", "} finally { if (btn) btn.disabled = false; updateSaveButton(); }\n  }"],
        "async function mapCrashGate(", "async function load(doneMsg)", "function buildFromImage(img, doneMsg)",
      ], P.loadGlobals({
        console, JSON, Image: P.fakeImageClass({ width: W, height: H }),
        pendingWrites: [], paintDiff: new Map(), stateById: new Map(), model: { states: [] },
        window: { NovaMapRuleLabels: require("./public/map-rule-labels.js"), confirm: () => true },
        stagedRiverEdits: [], riversShow: false, loadRiversOverlay: () => {},
        undoStack: [], redoStack: [], historyLabels: [], saveGeneration: 0, baseImageData: null, baseImageDataPristine: null,
        setMapDirty: () => {}, updateSaveButton: () => {}, modPath: () => M,
        isVanillaTarget: () => false, problemsPanelOpen: () => false, refreshProblems: () => {}, renderCheckpoints: () => {},
        stateFormDirty: () => false, stateFormBaseline: null, stageStateWrite: () => {},
        remapQueuedStateId: () => {}, remapLocalStateId: () => {},
        adoptMergeRegions: () => {}, openMapErrorsModal: () => {}, saveMapBackup: () => {}, updateUndoButtons: () => {},
        fetch: async (url, opts) => { posted.push({ url: String(url).split("?")[0], body: opts && opts.body ? JSON.parse(opts.body) : null }); return fetch(base + url, opts); },
      }));
      // every note of the Save's own, in the order flushMapSaves hands them to mapCrashGate: the line shows three of them and counts the rest
      const notes = [];
      { const gate = page.sb.mapCrashGate; page.sb.mapCrashGate = (o) => { notes.splice(0, notes.length, ...((o && o.writeWarnings) || []), ...((o && o.paintWarnings) || [])); return gate(o); }; }
      for (const id of ids) page.sb.queueWrite("/api/map/flip-province-sea", { provinceId: id });   // eraseProvinceLocal's own call
      await page.sb.flushMapSaves(); await P.settle(150);
      return { page, posted, notes, posts: (u) => posted.filter((p) => p.url === u), last: String(page.statuses[page.statuses.length - 1] || ""), left: page.sb.pendingWrites.slice() };
    };
    // the stroke: five provinces of state 1 and three of state 2 (2 to 6, 8 to 10), each one queued as the brush queues it
    const STROKE = [2, 3, 4, 5, 6, 8, 9, 10];

    console.log("\n-- ⛔ 1. an eight-province stroke's Save: one request, one sink, and every file it overwrote kept as it was --");
    const M = freshMod();
    const before = filesOf(M), pool0 = backups();
    const t0 = Date.now();
    const s = await saveThroughThePage(M, STROKE);
    const ms = Date.now() - t0;
    ok(s.left.length === 0 && STROKE.every((id) => typeOf(M, id) === "sea") && !/Save stopped/.test(s.last),
      `THE CONTROL: the Save wrote all ${STROKE.length} provinces sea and stopped nowhere`, { left: s.left.length, last: s.last.slice(0, 300), types: STROKE.map((id) => typeOf(M, id)) });
    ok(STROKE.every((id) => heightsOf(M, id).every((h) => h === md.HEIGHTMAP_SEA_VALUE)), "…and every pixel of them is on the sea floor", STROKE.map((id) => Math.max(...heightsOf(M, id))));
    ok(s.posts("/api/map/flip-provinces-sea").length === 1 && s.posts("/api/map/flip-province-sea").length === 0,
      "⭐⭐ the page sent the stroke as ONE request", { batch: s.posts("/api/map/flip-provinces-sea").length, single: s.posts("/api/map/flip-province-sea").length });
    const sent = (s.posts("/api/map/flip-provinces-sea")[0] || {}).body || {};
    ok(JSON.stringify(sent.provinceIds) === JSON.stringify(STROKE) && sent.modPath === M, "…naming every province in the order the brush queued them, and the mod", sent);
    const mine = backupsOf(M, backups().filter((n) => !pool0.includes(n)));
    const of = (rel) => mine.filter((n) => n.endsWith(rel.replace(/[\\/:]/g, "__")));
    ok(of("map/heightmap.bmp").length === 1 && of("map/terrain.bmp").length === 1,
      "⭐⭐ heightmap.bmp and terrain.bmp were each backed up ONCE for the stroke, not once a province", { heightmap: of("map/heightmap.bmp").length, terrain: of("map/terrain.bmp").length, all: mine.length, pool: backups().length, dir: BACKUP_DIR, sample: backups().slice(0, 2) });
    // ⭐⭐⭐ the files the Save overwrote, derived from the disk: each one's first copy is outside the mod and the pool, as it was
    const after = filesOf(M);
    const overwritten = [...before.keys()].filter((rel) => after.has(rel) && after.get(rel) !== before.get(rel));
    const scopeRoot = path.join(process.env.NOVA_HOME_DIR, ".nova", "erase_strokes");
    const stamps = fs.existsSync(scopeRoot) ? fs.readdirSync(scopeRoot).flatMap((m) => fs.readdirSync(path.join(scopeRoot, m)).map((st) => path.join(scopeRoot, m, st))) : [];
    const folder = stamps[0] || "";
    const keptAsItWas = overwritten.filter((rel) => folder && fs.existsSync(path.join(folder, rel)) && sha(path.join(folder, rel)) === before.get(rel));
    ok(overwritten.length >= 6 && overwritten.includes("map/definition.csv") && overwritten.includes("map/heightmap.bmp") && overwritten.includes("map/terrain.bmp"),
      `the stroke overwrote ${overwritten.length} of the mod's files, definition.csv, heightmap.bmp and terrain.bmp among them`, overwritten);
    ok(stamps.length === 1 && keptAsItWas.length === overwritten.length,
      "⭐⭐⭐ …and ONE folder outside the mod and the backups' pool keeps every one of them as it was before the Save", { folders: stamps.length, kept: keptAsItWas.length, of: overwritten.length, missing: overwritten.filter((r) => !keptAsItWas.includes(r)) });
    ok(!folder || !path.resolve(folder).toLowerCase().startsWith(path.resolve(M).toLowerCase() + path.sep), "…a folder that is not inside the mod", folder);
    const strokeBackups = mine.length;

    console.log("\n-- ⭐ 2. THE CONTROL: the same stroke one request a province, as the page sent it before --");
    const T = freshMod();
    const poolT = backups();
    const t1 = Date.now();
    const singles = [];
    for (const id of STROKE) singles.push(await post("/api/map/flip-province-sea", { provinceId: id, modPath: T }));
    const msT = Date.now() - t1;
    const theirs = backupsOf(T, backups().filter((n) => !poolT.includes(n)));
    const ofT = (rel) => theirs.filter((n) => n.endsWith(rel.replace(/[\\/:]/g, "__")));
    ok(singles.every((r) => r && r.ok === true) && ofT("map/heightmap.bmp").length === STROKE.length,
      `THE CONTROL: one request a province backs heightmap.bmp up once a province (${ofT("map/heightmap.bmp").length} for ${STROKE.length})`, { heightmap: ofT("map/heightmap.bmp").length, all: theirs.length });
    ok(strokeBackups < theirs.length, `⭐ the stroke's Save took ${strokeBackups} backups where one request a province took ${theirs.length} (${ms} ms against ${msT} ms)`, { stroke: strokeBackups, single: theirs.length });
    // what the two Saves leave, file by file
    const mineNow = filesOf(M), theirsNow = filesOf(T);
    const differ = [...new Set([...mineNow.keys(), ...theirsNow.keys()])].filter((rel) => mineNow.get(rel) !== theirsNow.get(rel));
    ok(differ.length === 0, "⭐⭐ …and the stroke leaves every file of the mod byte for byte what the one-by-one Save left", differ);
    // each province's answer as the page reads it, against the one its own request gave
    const batchAnswer = await (async () => { const U = freshMod(); return post("/api/map/flip-provinces-sea", { provinceIds: STROKE, modPath: U }); })();
    const shape = (r) => r && JSON.stringify({ ok: r.ok, changed: r.changed, line: r.definition && r.definition.line, from: (r.from || []).map((f) => [f.stateId, !!f.changed]), emptied: r.emptiedStates, navalRegion: r.navalRegion, supplyRail: r.supplyRail, sites: r.buildingSites, coastRows: r.coastRows && r.coastRows.changed });
    const answers = (batchAnswer && batchAnswer.results) || [];
    ok(answers.length === STROKE.length && answers.every((a, i) => a.provinceId === STROKE[i] && shape(a) === shape(singles[i])),
      "⭐⭐ each province's answer in the stroke's is the one its own request gave", answers.map((a, i) => (shape(a) === shape(singles[i]) ? "=" : { got: shape(a), want: shape(singles[i]) })));
    const sunkOn = answers.filter((a) => a.heightmap && a.heightmap.pixels > 0).map((a) => a.provinceId);
    ok(sunkOn.length === 1 && sunkOn[0] === STROKE[STROKE.length - 1] && batchAnswer.heightmap && batchAnswer.heightmap.pixels === singles.reduce((n, r) => n + ((r.heightmap && r.heightmap.pixels) || 0), 0),
      "⭐ the stroke's one sink travels on the last province's answer, and lowered as many pixels as the eight sinks did", { sunkOn, batch: batchAnswer.heightmap && batchAnswer.heightmap.pixels, singles: singles.map((r) => r.heightmap && r.heightmap.pixels) });

    console.log("\n-- ⛔ 3. a stroke that meets an inland province stops there, as the Save always stopped --");
    {
      const S = freshMod();
      const r = await saveThroughThePage(S, [2, 3, IN2, 4]);
      ok(r.posts("/api/map/flip-provinces-sea").length === 1 && /Save stopped at step 3/.test(r.last) && /isn't coastal/.test(r.last),
        "⭐⭐ the Save stops at step 3, on the inland province, and says why", r.last.slice(0, 300));
      ok(typeOf(S, 2) === "sea" && typeOf(S, 3) === "sea" && heightsOf(S, 2).concat(heightsOf(S, 3)).every((h) => h === md.HEIGHTMAP_SEA_VALUE),
        "⭐⭐ …the two before it are written AND sunk", { types: [typeOf(S, 2), typeOf(S, 3)], max: Math.max(...heightsOf(S, 2), ...heightsOf(S, 3)) });
      ok(typeOf(S, IN2) === "land" && typeOf(S, 4) === "land" && heightsOf(S, 4).every((h, i) => h === heightsOf(freshMod(), 4)[i]),
        "⭐ …the inland province and the one after it are untouched", { types: [typeOf(S, IN2), typeOf(S, 4)] });
      ok(r.left.length === 2 && r.left[0].body.provinceId === IN2 && r.left[1].body.provinceId === 4, "⭐ …and both are still queued for the next Save", r.left.map((w) => w.body));
    }

    console.log("\n-- 4. THE CONTROL: one erase still goes as it always went --");
    {
      const O = freshMod();
      const r = await saveThroughThePage(O, [2]);
      ok(r.posts("/api/map/flip-province-sea").length === 1 && r.posts("/api/map/flip-provinces-sea").length === 0 && typeOf(O, 2) === "sea" && r.left.length === 0,
        "a single erase is one POST /api/map/flip-province-sea", { single: r.posts("/api/map/flip-province-sea").length, batch: r.posts("/api/map/flip-provinces-sea").length });
    }

    console.log("\n-- ⛔ 5. an erase says what it cut from its state's file, which water cannot hold (review of the T39 merge, S-erase-drops-vp-unsaid) --");
    {
      // state 1 writes a victory point on 3 with a caption, a naval base on 3, and in 1939 a bigger naval base and a second point there;
      // 4 a victory point of its own; 5 one the strokes below never reach
      const VPS = 'state={\n\tid=1\n\tname="STATE_1"\n\tmanpower=100000\n\tstate_category=rural\n\tprovinces={ 2 3 4 5 6 7 }\n\thistory={\n\t\towner=AAA\n'
        + '\t\t# the harbour town\n\t\tvictory_points = { 3 5 }\n\t\tvictory_points = { 4 1 }\n\t\tvictory_points = { 5 2 }\n'
        + '\t\tbuildings = {\n\t\t\t3 = { naval_base = 3 }\n\t\t}\n\t\t1939.1.1 = {\n\t\t\tbuildings = {\n\t\t\t\t3 = { naval_base = 5 }\n\t\t\t}\n\t\t\tvictory_points = { 3 10 }\n\t\t}\n\t}\n}\n';
      const head = "🧽 The erase cut what water cannot hold from the files of the states that held the land: ";
      const of3 = "province 3 of state 1, its victory points (5, 10 from 1939.1.1) and buildings (naval base 3, naval base 5 from 1939.1.1)";
      const of4 = "province 4 of state 1, its victory point (1)";
      const one = freshMod(); write(one, "history/states/1-West.txt", VPS);
      const r1 = await saveThroughThePage(one, [3]);
      const left = fs.readFileSync(path.join(one, "history/states/1-West.txt"), "utf8");
      ok(r1.left.length === 0 && typeOf(one, 3) === "sea" && !/victory_points = \{ 3 /.test(left) && !/3 = \{ naval_base/.test(left) && /victory_points = \{ 5 2 \}/.test(left),
        "THE CONTROL: one erase of 3, saved: its victory points and naval bases are gone from state 1's file, and 5's point is not", { left: r1.left.length, file: left });
      ok(r1.last.includes(`• ${head}${of3}.`), "⭐⭐⭐ …and the Save line says what went, with the dates: its two victory points and its two naval bases", r1.last.slice(-700));
      const two = freshMod(); write(two, "history/states/1-West.txt", VPS);
      const r2 = await saveThroughThePage(two, [3, 4]);
      ok(r2.posts("/api/map/flip-provinces-sea").length === 1 && r2.left.length === 0, "THE CONTROL: the stroke over 3 and 4 went as one request and wrote both", { batch: r2.posts("/api/map/flip-provinces-sea").length, left: r2.left.length });
      const cutNotes = r2.notes.filter((t) => t.includes("The erase cut what water cannot hold"));
      ok(cutNotes.length === 1 && cutNotes[0] === `${head}${of3}; ${of4}.` && !/province 5 of/.test(cutNotes[0]),
        "⭐⭐ …and a stroke's Save says both provinces in ONE note, from the answers its one request gave for each, and nothing of 5", r2.notes);
      // ranked behind what Nova changed on its own: with a ⚠ it took the line's place from them, and test-a-capital-state-keeps-a-victory-
      // point.js (h) lost the note of the supply hub and railway Nova gave a capital
      ok(r2.notes.length === 4 && r2.notes[3] === cutNotes[0] && !/⚠/.test(cutNotes[0]) && r2.notes.some((t) => /^🧽 Erase land: Changed \d+ files/.test(t)) && r2.notes.some((t) => /^The drowned land took/.test(t)),
        "⭐ …a plain note, the Save's last: behind the drowned land's rows and where the stroke's copies are", r2.notes.map((t) => t.slice(0, 70)));
      ok(/…and 1 more\./.test(r2.last) && !r2.last.includes(head) && /🧽 Erase land: Changed \d+ files/.test(r2.last) && /The drowned land took/.test(r2.last),
        "⭐ …so where the line's three are full (here the fixture's colour pictures, not repainted, take one) it is the note counted, and those are shown", r2.last.slice(-700));
      const r3 = await saveThroughThePage(freshMod(), [2]);
      ok(r3.left.length === 0 && !/The erase cut/.test(r3.last), "⭐ an erase of a province its state wrote nothing of says nothing of it", r3.last.slice(-300));
    }
  } catch (e) {
    ok(false, "the Saves ran", String((e && e.stack) || e).slice(0, 600));
  } finally {
    if (server) await new Promise((r) => server.close(r));
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
    console.log(`\n${fail ? "FAILED" : "PASSED"} ${pass}/${pass + fail}`);
    process.exit(fail ? 1 : 0);
  }
})();
