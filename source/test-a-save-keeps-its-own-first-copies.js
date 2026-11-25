// ⛔ #a-save-keeps-its-own-first-copies — A MAP SAVE KEEPS ITS OWN FIRST COPIES OF EVERY FILE IT CHANGES (review of the tools' ground: G2, M2).
//
// The map page's 💾 Save replays every staged edit as a request of its own, and each takes its backups into the pool pruneBackups
// cuts to 200 after every backup. Bulk clicks open a backup scope; a Save had none. Replayed with the page's own bodies:
//   · twenty one-province islands of Millennium Dawn, each its own 🧽 Erase stroke with Auto-fix deleting the state it emptied — the
//     page's queue is then a flip, a delete, a flip, a delete, so the stroke batch (62bbc79d) never ran two erases together — pushed the
//     Save's own first copies of definition.csv, buildings.txt, heightmap.bmp, terrain.bmp and world_normal.bmp out of the pool by the
//     fifteenth island, 22 of its 43 by the end (G2-erase-autofix-split);
//   · seventeen province-inspector retypes from sea to land on the base game took all eleven (G2-inspector-sea-to-land);
//   · 51 terrain changes in the inspector, four backups each since the terrain tool paints ground and trees, took all four
//     (M2-inspector-pool-x4).
// Those were the only copies of the files as they stood before the Save.
//
// Now every request of one Save carries the Save's id (X-Nova-Map-Save) and is handled inside one Save run (safe-write.js): when the
// pool would delete the run's first copy of a file, the run's folder opens outside the mod and the pool, takes every first copy the
// run has, and every file it backs up for the first time after that. A Save that never fills the pool opens no folder.
// ⛔ #a-save-backs-a-file-up-once — and a run backs a file up once, so a Save costs the pool one entry per file it changes.
// ⛔ #a-stopped-save-is-still-the-same-save — and a Save that stopped and is clicked again is the same run, whose folder opened at the stop.
// ⛔ #a-file-a-save-made-has-no-before — a file the run created has no first copy, and the line says so.
// ⛔ #a-copy-that-could-not-be-made-is-counted-once — the line counts files, not attempts, and says "stay" only of a copy the pool has.
// ⛔ #a-save-folder-nobody-was-told-about — a folder that opened after its Save's line had gone is named by the next Save of that mod.
//
// The world: a sea with twenty one-province islands, a row of 32 small sea provinces along a coast, and 80 land provinces behind it
// (a row of forest, the rest plains), with the map's heights, ground, trees and world pictures; a mod that owns all of it and replaces
// history/states, as a modder's own map does. Each Save is the page's own flushMapSaves against the real server, its writes queued
// as the page's own functions queue them.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-save-firsts-"));
process.env.APPDATA = path.join(ROOT, "appdata"); process.env.NOVA_APP_DATA_DIR = process.env.APPDATA; process.env.XDG_CONFIG_HOME = process.env.APPDATA;
process.env.NOVA_HOME_DIR = path.join(ROOT, "home");
process.env.HOI4_MODS_ROOT = path.join(ROOT, "mods");
for (const d of [process.env.APPDATA, process.env.NOVA_HOME_DIR, process.env.HOI4_MODS_ROOT]) fs.mkdirSync(d, { recursive: true });
const md = require("./map-data.js");
const dds = require("./dds-codec.js");
const SW = require("./safe-write.js");
const P = require("./testlib-map-page.js");
const { BACKUP_DIR, MAX_BACKUP_FILES } = SW;
const { maskJsComments } = require("./testlib-strip-comments.js");
const { holdTheClock } = require("./testlib-held-clock.js");

let pass = 0, fail = 0;
const ok = (c, m, x) => {
  if (c) { pass++; console.log("  ok   " + m); }
  else { fail++; console.log("  FAIL " + m + (x !== undefined ? "   -> " + JSON.stringify(x).slice(0, 700) : "")); }
};
const write = (dir, rel, body) => { const p = path.join(dir, ...rel.split("/")); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, body); return p; };
const sha = (p) => crypto.createHash("sha1").update(fs.readFileSync(p)).digest("hex");
const shaOf = (buf) => crypto.createHash("sha1").update(buf).digest("hex");
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
function makeDds(W, H, format, levels, fn) {
  const compressed = format !== "RGB32";
  const h = Buffer.alloc(128);
  h.write("DDS ", 0, "latin1"); h.writeUInt32LE(124, 4);
  h.writeUInt32LE(0x1007 | (levels > 1 ? 0x20000 : 0) | (compressed ? 0x80000 : 0x8), 8);
  h.writeUInt32LE(H, 12); h.writeUInt32LE(W, 16);
  h.writeUInt32LE(compressed ? Math.max(1, Math.ceil(W / 4)) * Math.max(1, Math.ceil(H / 4)) * 16 : W * 4, 20);
  h.writeUInt32LE(levels, 28); h.writeUInt32LE(32, 76);
  if (compressed) { h.writeUInt32LE(0x4, 80); h.write(format, 84, "latin1"); }
  else { h.writeUInt32LE(0x41, 80); h.writeUInt32LE(32, 88); h.writeUInt32LE(0xff0000, 92); h.writeUInt32LE(0xff00, 96); h.writeUInt32LE(0xff, 100); h.writeUInt32LE(0xff000000, 104); }
  h.writeUInt32LE(0x1000 | (levels > 1 ? 0x400008 : 0), 108);
  let size = 128, w = W, hh = H;
  for (let l = 0; l < levels; l++) { size += compressed ? Math.max(1, Math.ceil(w / 4)) * Math.max(1, Math.ceil(hh / 4)) * 16 : w * hh * 4; w = Math.max(1, w >> 1); hh = Math.max(1, hh >> 1); }
  const buf = Buffer.alloc(size); h.copy(buf);
  const hdr = dds.parseDdsHeader(buf);
  for (let l = 0; l < hdr.levels; l++) {
    const { w: lw, h: lh } = hdr.lv[l], rgba = new Uint8Array(lw * lh * 4);
    for (let y = 0; y < lh; y++) for (let x = 0; x < lw; x++) rgba.set(fn(x, y, l), (y * lw + x) * 4);
    dds.patchDdsLevel(buf, hdr, l, rgba, new Uint8Array(lw * lh).fill(1));
  }
  return buf;
}

// ── the world: 256 x 128. The open sea (1) above y 40 with twenty 6 x 6 islands (2..21); 32 sea provinces 8 px wide in y 40..47
// (30..61); 80 land provinces of 16 x 16 below (100..179), the first row forest, the rest plains ─────────────────────────────────────
const W = 256, H = 128, TW = W / 2, TH = H / 2;
const SEA = 1, ISLANDS = Array.from({ length: 20 }, (_, k) => 2 + k), PIECES = Array.from({ length: 32 }, (_, j) => 30 + j);
const LAND = Array.from({ length: 80 }, (_, k) => 100 + k);
const islandAt = (x, y) => { for (let k = 0; k < 20; k++) { const x0 = 4 + 25 * (k % 10), y0 = k < 10 ? 6 : 22; if (x >= x0 && x < x0 + 6 && y >= y0 && y < y0 + 6) return 2 + k; } return 0; };
const provAt = (x, y) => (y < 40 ? (islandAt(x, y) || SEA) : y < 48 ? 30 + Math.floor(x / 8) : 100 + Math.floor((y - 48) / 16) * 16 + Math.floor(x / 16));
const colour = (id) => [(id * 37) % 256, (id * 71) % 256, (id * 13 + 40) % 256];
const isWater = (id) => id === SEA || (id >= 30 && id <= 61);
const forestBelow = (id) => id >= 100 && id < 116;
const PLAINS = 0, FOREST = 1, OCEAN = 15;
const heightAt = (x, y) => { const p = provAt(x, y); if (isWater(p)) return 89; if (p < 30) { const k = p - 2, x0 = 4 + 25 * (k % 10), y0 = k < 10 ? 6 : 22; return (x === x0 || x === x0 + 5 || y === y0 || y === y0 + 5) ? 94 : 102; } return y === 48 ? 94 : y === 49 ? 97 : 105; };
const ISLAND_STATE = (id) => id - 1;            // islands 2..21 are states 1..20
const LAND_STATE = (id) => 21 + Math.floor((id - 100) / 20);   // the land in four states, 21..24
const CM = "map/terrain/colormap_rgb_cityemissivemask_a.dds";
function makeGame() {
  const g = path.join(ROOT, "game");
  write(g, "hoi4.exe", "");
  write(g, "map/provinces.bmp", bmp24(W, H, (x, y) => colour(provAt(x, y))));
  const rows = ["0;0;0;0;land;false;unknown;0", `${SEA};${colour(SEA).join(";")};sea;false;ocean;0`];
  for (const id of ISLANDS) rows.push(`${id};${colour(id).join(";")};land;true;plains;1`);
  for (const id of PIECES) rows.push(`${id};${colour(id).join(";")};sea;false;ocean;0`);
  for (const id of LAND) rows.push(`${id};${colour(id).join(";")};land;${id < 116};${forestBelow(id) ? "forest" : "plains"};1`);
  write(g, "map/definition.csv", rows.join("\n") + "\n");
  write(g, "map/heightmap.bmp", bmp8(W, H, heightAt));
  write(g, "map/terrain.bmp", bmp8(W, H, (x, y) => { const p = provAt(x, y); return isWater(p) ? OCEAN : forestBelow(p) ? FOREST : PLAINS; }));
  write(g, "map/trees.bmp", bmp8(TW, TH, (bx, by) => (forestBelow(provAt(2 * bx, 2 * by)) ? ((bx + by) % 5 ? 6 : 0) : 0)));
  write(g, "gfx/entities/trees.gfx", 'objectTypes = {\n\tpdxmesh = { name = "mapobject_6"  file = "gfx/models/b.mesh" }\n}\n');
  write(g, "common/terrain/00_terrain.txt", [
    "categories = {", "  plains = { color = { 200 200 100 } }", "  forest = { color = { 0 120 0 } }", "  ocean = { color = { 0 0 200 } is_water = yes }", "}",
    "terrain = {", "  plains = { type = plains color = { 0 } }", "  forest = { type = forest color = { 1 } }", "  ocean = { type = ocean color = { 15 } }", "}", ""].join("\n"));
  const landTexel = (X, Y) => !isWater(provAt(2 * X, 2 * Y));
  // each texel tinted by the ground under it, so a province whose ground changes is relit
  write(g, CM, makeDds(TW, TH, "RGB32", 1, (X, Y) => (!landTexel(X, Y) ? [79, 102, 141, 0] : forestBelow(provAt(2 * X, 2 * Y)) ? [40, 90, 40, 0] : [150, 160, 90, 0])));
  for (const [n, s] of [["colormap_water_0.dds", 1], ["colormap_water_1.dds", 2], ["colormap_water_2.dds", 4]]) {
    write(g, "map/terrain/" + n, makeDds(TW / s, TH / s, "DXT5", 1, (X, Y) => (landTexel(X * s, Y * s) ? [52, 70, 60, 255] : [35, 59, 81, 255])));
  }
  write(g, "map/terrain/fow_rgb_waterspec_a.dds", makeDds(TW, TH, "DXT5", 4, (X, Y, l) => (landTexel(Math.min(TW - 1, X << l), Math.min(TH - 1, Y << l)) ? [132, 132, 132, 21] : [90, 90, 90, 40])));
  const stateText = (id, provs) => `state={\n\tid=${id}\n\tname="STATE_${id}"\n\tmanpower=100000\n\tstate_category=rural\n\tprovinces={ ${provs.join(" ")} }\n\thistory={\n\t\towner=AAA\n\t}\n}\n`;
  for (const id of ISLANDS) write(g, `history/states/${ISLAND_STATE(id)}-Isle.txt`, stateText(ISLAND_STATE(id), [id]));
  for (let s = 21; s <= 24; s++) write(g, `history/states/${s}-Land.txt`, stateText(s, LAND.filter((id) => LAND_STATE(id) === s)));
  write(g, "map/strategicregions/1-Sea.txt", `strategic_region={\n\tid=1\n\tname="STRATEGICREGION_1"\n\tprovinces={\n\t\t${[SEA, ...PIECES].join(" ")}\n\t}\n}\n`);
  write(g, "map/strategicregions/2-Land.txt", `strategic_region={\n\tid=2\n\tname="STRATEGICREGION_2"\n\tprovinces={\n\t\t${[...ISLANDS, ...LAND].join(" ")}\n\t}\n}\n`);
  // each state's air base on its own land
  const centre = (id) => { for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (provAt(x, y) === id) return [x + 2, y + 2]; return [0, 0]; };
  const B = [];
  for (const id of ISLANDS) { const [x, y] = centre(id); B.push(`${ISLAND_STATE(id)};air_base;${x}.00;9.50;${H - 1 - y}.00;0.00;0`); }
  for (let s = 21; s <= 24; s++) { const [x, y] = centre(LAND.find((id) => LAND_STATE(id) === s) + 33); B.push(`${s};air_base;${x}.00;9.50;${H - 1 - y}.00;0.00;0`); }
  write(g, "map/buildings.txt", B.join("\n") + "\n");
  write(g, "map/default.map", 'definitions = "definition.csv"\nprovinces = "provinces.bmp"\nterrain = "terrain.bmp"\nheightmap = "heightmap.bmp"\ntree_definition = "trees.bmp"\n');
  return g;
}
const GAME = makeGame();
/** every file of a folder, by its path in it, with its sha */
const filesOf = (dir) => { const out = new Map(); const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else out.set(path.relative(dir, p).split(path.sep).join("/"), sha(p)); } }; if (fs.existsSync(dir)) walk(dir); return out; };
// a mod that owns all of its map and replaces history/states, as a modder's own map does
let modN = 0;
const freshMod = () => {
  const m = path.join(process.env.HOI4_MODS_ROOT, "own" + (++modN));
  write(m, "descriptor.mod", 'name="a save keeps its own first copies"\nreplace_path="history/states"\n');
  for (const [rel] of filesOf(GAME)) if (/^(map|history|common)\//.test(rel)) write(m, rel, fs.readFileSync(path.join(GAME, rel)));
  return m;
};
const backups = () => { try { return fs.readdirSync(BACKUP_DIR); } catch (_) { return []; } };
const savesRoot = path.join(process.env.NOVA_HOME_DIR, ".nova", "map_saves");
const saveFolders = (mod) => { const d = md.mapSaveCopiesDir(mod); return fs.existsSync(d) ? fs.readdirSync(d).map((s) => path.join(d, s)) : []; };
/** For each file of `before` (rel → sha) the Save changed or removed: is its first copy, the bytes it had before the Save, still in the
 *  backups' pool, and is it in the Save's folder? */
function firstCopies(mod, before, folders) {
  const after = filesOf(mod), shasInPool = new Map();
  for (const n of backups()) { try { shasInPool.set(n, sha(path.join(BACKUP_DIR, n))); } catch (_) {} }
  const out = [];
  for (const [rel, was] of before) {
    if (after.get(rel) === was) continue;
    const tail = path.resolve(mod, rel).replace(/[\\/:]/g, "__");
    const inPool = [...shasInPool].some(([n, s]) => n.endsWith(tail) && s === was);
    const inFolder = folders.some((f) => fs.existsSync(path.join(f, rel)) && sha(path.join(f, rel)) === was);
    out.push({ rel, gone: !after.has(rel), inPool, inFolder });
  }
  return out;
}

console.log("\n-- the wiring, read from the code --");
{
  const SWsrc = maskJsComments(fs.readFileSync(path.join(__dirname, "safe-write.js"), "utf8"));
  const SV = maskJsComments(fs.readFileSync(path.join(__dirname, "server.js"), "utf8"));
  const body = (src, name) => { const a = src.indexOf("function " + name + "("); return a < 0 ? "" : src.slice(a, src.indexOf("\n}", a) + 2); };
  ok(typeof SW.beginSaveRun === "function" && typeof SW.useSaveRun === "function", "safe-write.js exports beginSaveRun and useSaveRun");
  const prune = body(SWsrc, "pruneBackups");
  ok(/keepSaveRunFirstCopy\(entry\.fullPath\)/.test(prune) && prune.indexOf("keepSaveRunFirstCopy(") < prune.indexOf("fs.unlinkSync(entry.fullPath)"),
    "⭐ pruneBackups asks whether a backup is a Save's first copy before it deletes it", prune.length);
  for (const fn of ["safeModWrite", "backupAssetBeforeOverwrite"]) {
    const b = body(SWsrc, fn);
    ok(/saveRunBeforeBackup\(absPath\)/.test(b) && /saveRunAfterBackup\(absPath, backupPath\)/.test(b) && /saveRunAfterBackup\(absPath, ""\)/.test(b),
      `⭐ ${fn} hands every backup it takes, and one it could not take, to the Save run`, b.length);
  }
  // registered in createApp ahead of every route: the first map route after it, and installWorldRun's, whose function sits above it
  const app = SV.indexOf("function createApp("), mw = SV.indexOf('req.get("x-nova-map-save")', app);
  const firstRoute = SV.indexOf('app.post("/api/map/', app), worldRun = SV.indexOf("installWorldRun(app", app);
  ok(app > 0 && mw > app && firstRoute > mw && worldRun > mw && /useSaveRun\(run\);\s*try \{ next\(\); \} finally \{ safeWrite\.useSaveRun\(was\); \}/.test(SV.slice(mw, mw + 2500)),
    "⭐ server.js handles a request that names a Save inside that Save's run, registered before every map route", { app, mw, firstRoute, worldRun });
  // every map write the Save sends carries the Save's id: every fetch in flushMapSaves but the settings one and the one that only reads, derived from its text
  const fl = P.lift("async function flushMapSaves", "} finally { if (btn) btn.disabled = false; updateSaveButton(); }\n  }");
  const fetches = [...fl.matchAll(/fetch\(([^,]+),\s*\{\s*method:\s*"POST",\s*headers:\s*([^,]+),/g)].map((m) => ({ url: m[1], headers: m[2].trim() }));
  const writes = fetches.filter((f) => !/\/api\/settings\/|\/api\/map\/seas-cut-off/.test(f.url));
  ok(writes.length >= 5 && writes.every((f) => f.headers === "saveHeaders") && /"X-Nova-Map-Save": saveRunId/.test(fl),
    `⭐ the page sends all ${writes.length} kinds of map write in a Save with the Save's id`, fetches);
  // …and every one of those answers is heard: it is what says where the Save's first copies went, on an answer that stops the Save above all
  const flCode = require("./testlib-strip-comments.js").maskJsComments(fl);
  const heard = [...flCode.matchAll(/headers:\s*saveHeaders[\s\S]*?\bcatch\b/g)].map((m) => /heardSaveCopies\(/.test(m[0]));
  ok(heard.length === writes.length && heard.every(Boolean), "⭐⭐ …and the Save hears every answer, whichever kind of write it sent", heard);
  ok(writes.some((f) => /victory-point-towns/.test(f.url)), "⭐ …the 🏘 towns of the Save among them (#a-victory-point-has-a-town: a town's terrain.bmp and colour map are the Save's to keep)", fetches);
  ok(fetches.some((f) => /seas-cut-off/.test(f.url) && !/saveHeaders|X-Nova-Map-Save/.test(f.headers)), "⭐⭐ …and the question a Save asks at its end (#a-raise-says-the-sea-it-cuts-off) carries none: it only reads, and an answer that is not ok would open the Save's folder", fetches);
  ok(!/\$\{total\}/.test(flCode), "⭐ the Save line's count is asked each time, by every kind of write (`total` is a function: printed bare, it is its source)");
  // …and the bodies the tests below queue are the ones the page's functions queue
  ok(/queueWrite\("\/api\/map\/flip-province-sea", \{ provinceId: pid \}\)/.test(P.lift("function eraseProvinceLocal(pid)"))
    && /queueWrite\("\/api\/map\/delete-state", \{ stateId: s\.id \}\)/.test(P.lift("function deleteEmptiedStates("))
    && /queueWrite\("\/api\/map\/set-province-terrain", \{ provinceId: pid, terrain, type, coastal \}[,)]/.test(P.lift("async function saveProvinceTerrain()")),
    "the bodies queued below are the Erase brush's, Auto-fix's emptied-state delete's and the inspector's own");
}

console.log("\n-- ⭐ 1. safe-write.js alone: a run's first copy outlives the pool, and a run that never fills it keeps nothing --");
{
  const R = path.join(process.env.HOI4_MODS_ROOT, "unit");
  const A = write(R, "map/a.txt", "the first copy of a\n");
  const others = Array.from({ length: MAX_BACKUP_FILES + 20 }, (_, i) => write(R, `map/other/${i}.txt`, `other ${i}\n`));
  const D1 = path.join(ROOT, "unit-run-1"), run = SW.beginSaveRun({ dir: D1, root: R });
  let was = SW.useSaveRun(run);
  try {
    SW.safeModWrite(A, "a, changed\n", "map-test");
    const t = Date.now(); while (Date.now() - t < 5) { /* a later timestamp for every backup after it */ }
    for (const f of others) SW.safeModWrite(f, "changed\n", "map-test");
  } finally { SW.useSaveRun(was); }
  const kept = path.join(D1, "map/a.txt");
  ok(!backups().some((n) => n.endsWith(path.resolve(A).replace(/[\\/:]/g, "__"))), `THE CONTROL: the pool alone has lost a.txt's first copy (it keeps ${MAX_BACKUP_FILES})`, backups().length);
  ok(fs.existsSync(kept) && fs.readFileSync(kept, "utf8") === "the first copy of a\n", "⭐⭐ …and the run kept it in its folder, as it was before the run");
  const inFolder = filesOf(D1);
  ok(inFolder.size === others.length + 1 && [...others].every((f) => fs.existsSync(path.join(D1, path.relative(R, f)))),
    `⭐ …with every other file the run changed, each once (${inFolder.size} of ${others.length + 1})`, inFolder.size);
  ok(backups().length <= MAX_BACKUP_FILES, "…and the pool is no bigger than it ever was", backups().length);
  // a run that never fills the pool opens no folder
  const D2 = path.join(ROOT, "unit-run-2"), run2 = SW.beginSaveRun({ dir: D2, root: R });
  was = SW.useSaveRun(run2);
  try { SW.safeModWrite(A, "a, changed again\n", "map-test"); } finally { SW.useSaveRun(was); }
  ok(!fs.existsSync(D2) && run2.files === 0, "⭐ a run that never fills the pool opens no folder");
  // the next Save of the same mod ends the protection of the one before it: a later Save pushing an earlier one's out is the pool's job
  const D3 = path.join(ROOT, "unit-run-3"), run3 = SW.beginSaveRun({ dir: D3, root: R });
  was = SW.useSaveRun(run3);
  try { for (const f of others) SW.safeModWrite(f, "changed once more\n", "map-test"); } finally { SW.useSaveRun(was); }
  ok(!fs.existsSync(D2) && !backups().some((n) => n.endsWith(path.resolve(A).replace(/[\\/:]/g, "__"))),
    "⭐ …and a later Save of the same mod does not keep an earlier Save's first copies: the pool lets them go, as it always did", { d2: fs.existsSync(D2) });
  SW.beginSaveRun({ root: R });   // and that ends run 3 the same way, so the Saves below are the only ones the pool keeps first copies for
}

(async () => {
  process.env.HOI4_ROOT = GAME;
  const { createApp } = require("./server.js");
  let server = null;
  try {
    server = await new Promise((res, rej) => { const s = createApp().listen(0, "127.0.0.1", () => res(s)); s.on("error", rej); });
    const base = `http://127.0.0.1:${server.address().port}`;
    /** 💾 the page's own Save of `writes` ([url, body]), each queued through the page's own queueWrite. `oldPage`: the request goes
     *  without the Save's id, as the page sent it before. */
    const saveThroughThePage = async (M, writes, { oldPage = false } = {}) => {
      const posted = [];
      const page = P.runPage([
        ["const STATE_ID_FIELDS = ", "\n"], "function orphanedQueuedWrites(writes)", "function emptyNewStateWrites(writes, stateById)",
        "function markSaveBoundary", "function queueWrite(url, body, meta)", "function terrainWriteNotes(",
        // (⛔ #a-new-state-is-carved-like-a-split, #a-capital-state-keeps-a-victory-point — what the Save adopts of a new state's first land and the capitals it kept)
        "function adoptFirstLand(", "function adoptCapitalTown(", "function capitalTownNotes(",
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
        fetch: async (url, opts) => {
          const o = Object.assign({}, opts || {});
          if (o.headers && o.headers["X-Nova-Map-Save"]) { posted.push(String(o.headers["X-Nova-Map-Save"])); if (oldPage) { o.headers = Object.assign({}, o.headers); delete o.headers["X-Nova-Map-Save"]; } }
          return fetch(base + url, o);
        },
      }));
      for (const [url, body] of writes) page.sb.queueWrite(url, body);
      await page.sb.flushMapSaves(); await P.settle(150);
      return { ids: [...new Set(posted)], last: String(page.statuses[page.statuses.length - 1] || ""), left: page.sb.pendingWrites.length };
    };
    /** The page's own Save on mod M against the real server, with its own updateSaveButton and setMapDirty and its 💾 button: a fake that
     *  fires only when it is enabled, as a browser's does, wired as the page wires it. `onPost(url, n)`: as the n-th write of a Save goes out. */
    const openPage = (M, { onPost = null, hangAt = 0, failAt = 0, extra = {} } = {}) => {
      const posted = [], btn = P.element("button");
      btn.click = () => { if (btn.disabled) return false; for (const fn of btn.listeners.click || []) fn(); return true; };
      const page = P.runPage([
        ["const STATE_ID_FIELDS = ", "\n"], "function orphanedQueuedWrites(writes)", "function emptyNewStateWrites(writes, stateById)",
        "function markSaveBoundary", "function queueWrite(url, body, meta)", "function terrainWriteNotes(",
        // (⛔ #a-new-state-is-carved-like-a-split, #a-capital-state-keeps-a-victory-point — what the Save adopts of a new state's first land and the capitals it kept)
        "function adoptFirstLand(", "function adoptCapitalTown(", "function capitalTownNotes(",
        "function updateSaveButton()", "function setMapDirty(d)", "function mapHasUnsavedWork()", ["window.__focusEditorSaveBeforeExit = async () => {", "\n  };"],
        ["async function flushMapSaves", "} finally { if (btn) btn.disabled = false; updateSaveButton(); }\n  }"],
        "async function mapCrashGate(", "async function load(doneMsg)", "function buildFromImage(img, doneMsg)",
      ], P.loadGlobals(Object.assign({
        console, JSON, Image: P.fakeImageClass({ width: W, height: H }),
        $: (id) => (id === "mapSaveAll" ? btn : null),
        pendingWrites: [], paintDiff: new Map(), stateById: new Map(), model: { states: [] },
        window: { NovaMapRuleLabels: require("./public/map-rule-labels.js"), confirm: () => true },
        stagedRiverEdits: [], riversShow: false, loadRiversOverlay: () => {},
        undoStack: [], redoStack: [], historyLabels: [], saveGeneration: 0, baseImageData: null, baseImageDataPristine: null,
        modPath: () => M, armySave: async () => {},
        isVanillaTarget: () => false, problemsPanelOpen: () => false, refreshProblems: () => {}, renderCheckpoints: () => {},
        stateFormDirty: () => false, stateFormBaseline: null, stageStateWrite: () => {},
        remapQueuedStateId: () => {}, remapLocalStateId: () => {},
        adoptMergeRegions: () => {}, openMapErrorsModal: () => {}, saveMapBackup: () => {}, updateUndoButtons: () => {},
        fetch: async (url, opts) => {
          const o = Object.assign({}, opts || {});
          if (o.headers && o.headers["X-Nova-Map-Save"]) {
            if (hangAt && posted.length + 1 === hangAt) return new Promise(() => {});   // the app is gone: this write never leaves, and the page never hears
            if (failAt && posted.length + 1 === failAt) { posted.push({ url, id: String(o.headers["X-Nova-Map-Save"]), dropped: true }); throw new Error("the connection dropped"); }
            posted.push({ url, id: String(o.headers["X-Nova-Map-Save"]) });
            if (onPost) onPost(url, posted.length);
          }
          return fetch(base + url, o);
        },
      }, extra)));
      btn.addEventListener("click", page.sb.flushMapSaves);   // public/map.js: $("mapSaveAll").addEventListener("click", flushMapSaves)
      return { page, sb: page.sb, posted, btn, last: () => String(page.statuses[page.statuses.length - 1] || "") };
    };
    const fatalRules = async (M) => {
      const v = await fetch(base + "/api/map/validate?modPath=" + encodeURIComponent(M)).then((r) => r.json());
      return (v.problems || []).filter((p) => require("./public/map-rule-labels.js").isFatalRule(p.rule)).map((p) => p.rule);
    };
    /** a Save of `writes` on a fresh mod, and what it left of each file's first copy */
    const measure = async (label, writes, opts = {}) => {
      const M = freshMod(), before = filesOf(M);
      const s = await saveThroughThePage(M, writes, opts);
      const folders = saveFolders(M);
      const f = firstCopies(M, before, folders);
      return { M, s, folders, f, lostFromPool: f.filter((x) => !x.inPool), notKept: f.filter((x) => !x.inPool && !x.inFolder), missingFromFolder: f.filter((x) => !x.inFolder) };
    };
    const shapeOf = (r) => ({ changed: r.f.length, lostFromPool: r.lostFromPool.map((x) => x.rel).slice(0, 8), notKept: r.notKept.map((x) => x.rel).slice(0, 8), folders: r.folders.length, missing: r.missingFromFolder.map((x) => x.rel).slice(0, 8), left: r.s.left, last: r.s.last.slice(0, 300) });
    const checkKept = (r, what) => {
      ok(r.s.left === 0 && !/Save stopped/.test(r.s.last), `THE CONTROL: the Save of ${what} wrote everything and stopped nowhere`, shapeOf(r));
      ok(r.s.ids.length === 1, "⭐ every request of it carried one and the same Save id", r.s.ids);
      ok(r.lostFromPool.length > 0, `THE CONTROL: it made more backups than the pool keeps, so the pool alone has lost ${r.lostFromPool.length} of its ${r.f.length} first copies`, shapeOf(r));
      ok(r.notKept.length === 0, `⭐⭐⭐ …and every one of the ${r.f.length} files it changed still has its copy as it was before the Save`, shapeOf(r));
      ok(r.folders.length === 1 && r.missingFromFolder.length === 0, "⭐⭐ …ONE folder outside the mod and the pool holding every one of them", shapeOf(r));
      ok(r.folders.length === 1 && r.s.last.includes(r.folders[0]) && /A copy of all of them was saved first/.test(r.s.last), "⭐ …which the Save line names", r.s.last.slice(-600));
      ok(r.folders.every((f) => !path.resolve(f).toLowerCase().startsWith(path.resolve(r.M).toLowerCase() + path.sep)) && r.folders.every((f) => f.startsWith(savesRoot)),
        "…under Nova's own folder, not inside the mod", r.folders);
    };

    /** how many copies the pool has of each file of a mod */
    const poolCopiesOf = (M) => { const tail = path.resolve(M).replace(/[\\/:]/g, "__") + "__", byFile = new Map(); for (const n of backups()) { const i = n.indexOf(tail); if (i !== -1) byFile.set(n.slice(i + tail.length), (byFile.get(n.slice(i + tail.length)) || 0) + 1); } return byFile; };
    /** ⛔ #a-save-backs-a-file-up-once: a Save that changes fewer files than the pool keeps costs it one copy of each, every one the file as it was before the Save, and needs no folder */
    const checkOnce = (r, what) => {
      ok(r.s.left === 0 && !/Save stopped/.test(r.s.last), `THE CONTROL: the Save of ${what} wrote everything and stopped nowhere`, shapeOf(r));
      ok(r.s.ids.length === 1, "⭐ every request of it carried one and the same Save id", r.s.ids);
      ok(r.f.length > 0 && r.notKept.length === 0 && r.lostFromPool.length === 0, `⭐⭐⭐ every one of the ${r.f.length} files it changed still has its copy as it was before the Save, in the pool`, shapeOf(r));
      const copies = poolCopiesOf(r.M), twice = [...copies].filter(([, n]) => n > 1);
      ok(copies.size >= r.f.length && twice.length === 0, `⭐⭐⭐ …and it cost the pool one copy of each file it touched (${copies.size}), not one per write`, { twice: twice.slice(0, 8), size: copies.size, changed: r.f.length });
      ok(r.folders.length === 0 && !/saved first/.test(r.s.last), "⭐ …so no folder opens and the line has nothing to add", shapeOf(r));
    };

    console.log("\n-- ⛔ 2. twenty islands erased one stroke each, Auto-fix deleting the state each emptied: a flip, a delete, a flip… (G2) --");
    const islandWrites = ISLANDS.flatMap((id) => [["/api/map/flip-province-sea", { provinceId: id }], ["/api/map/delete-state", { stateId: ISLAND_STATE(id) }]]);
    const isl = await measure("islands", islandWrites);
    checkOnce(isl, "twenty erased islands and their deleted states");
    ok(isl.f.some((x) => x.gone && /^history\/states\//.test(x.rel) && x.inPool) && isl.f.some((x) => x.rel === "map/heightmap.bmp" && x.inPool),
      "⭐ …the deleted state files and the heightmap among them", isl.f.filter((x) => x.gone).length);

    console.log("\n-- ⛔ 3. 32 sea provinces turned to land in the province inspector, one Save (G2) --");
    const seaWrites = PIECES.map((id) => ["/api/map/set-province-terrain", { provinceId: id, terrain: "plains", type: "land", coastal: true }]);
    const sea = await measure("sea to land", seaWrites);
    checkOnce(sea, "32 inspector retypes from sea to land");

    console.log("\n-- ⛔ 4. 64 plains provinces made forest in the province inspector, one Save (M2) --");
    const forestWrites = LAND.slice(16).map((id) => ["/api/map/set-province-terrain", { provinceId: id, terrain: "forest", type: "land", coastal: false }]);
    const forest = await measure("terrain", forestWrites);
    checkOnce(forest, "64 inspector terrain changes");

    console.log("\n-- ⛔ 4b. A Save that changes more files than the pool keeps: 220 states handed to another country, one Save --");
    {
      const M = freshMod(), stateText = (id) => `state={\n\tid=${id}\n\tname="STATE_${id}"\n\tmanpower=1000\n\tstate_category=rural\n\tprovinces={ }\n\thistory={\n\t\towner=AAA\n\t}\n}\n`;
      const longIds = Array.from({ length: MAX_BACKUP_FILES + 20 }, (_, i) => 300 + i);
      for (const id of longIds) write(M, `history/states/${id}-Far.txt`, stateText(id));
      const before = filesOf(M);
      const s = await saveThroughThePage(M, longIds.map((id) => ["/api/map/set-owner", { stateId: id, owner: "BBB" }]));
      const folders = saveFolders(M), f = firstCopies(M, before, folders);
      checkKept({ M, s, folders, f, lostFromPool: f.filter((x) => !x.inPool), notKept: f.filter((x) => !x.inPool && !x.inFolder), missingFromFolder: f.filter((x) => !x.inFolder) }, "220 states");
    }

    console.log("\n-- ⭐ 5. THE CONTROL: the same 32 retypes from the page as it was, no Save id: the pool loses them for good --");
    const old = await measure("sea to land, old page", seaWrites, { oldPage: true });
    ok(old.s.left === 0 && old.notKept.length > 0 && old.folders.length === 0,
      `⭐⭐ ${old.notKept.length} of the ${old.f.length} files that Save changed have no copy as they were before it anywhere`, shapeOf(old));

    console.log("\n-- ⭐ 6. THE CONTROL: a Save that never fills the pool opens no folder --");
    const small = await measure("three retypes", seaWrites.slice(0, 3));
    ok(small.s.left === 0 && small.f.length > 0 && small.lostFromPool.length === 0 && small.folders.length === 0 && !/saved first/.test(small.s.last),
      `three retypes changed ${small.f.length} files, every first copy is in the pool, and no folder was made`, shapeOf(small));

    console.log("\n-- ⛔ 7. ONE SAVE AT A TIME: a second click, Ctrl+S and the quit dialog while a Save is running (#a-save-runs-one-at-a-time) --");
    {
      const M = freshMod(), before = filesOf(M);
      const disabledAt = [];
      let again = null;
      const pg = openPage(M, { onPost: (url, n) => {
        disabledAt.push(pg.btn.disabled);
        if (n !== 2) return;
        // the modder presses everything there is, with Create state in flight: the button, Ctrl+S (the shortcut calls the function), and the quit dialog's Save
        const left = () => pg.sb.pendingWrites.length;
        again = { click: pg.btn.click(), ctrlS: pg.sb.flushMapSaves().then(left), quit: pg.sb.window.__focusEditorSaveBeforeExit().then((saved) => ({ saved, left: left() })) };
      } });
      pg.sb.stateById.set(-1, { id: -1, provinces: [120] });
      pg.sb.queueWrite("/api/map/set-owner", { stateId: 23, owner: "BBB" });
      pg.sb.queueWrite("/api/map/create-state", { name: "", owner: "AAA" }, { create: true, provisionalId: -1 });
      pg.sb.queueWrite("/api/map/move-province", { provinceId: 120, toStateId: -1 }, { fromStateId: 22 });
      pg.sb.queueWrite("/api/map/set-owner", { stateId: 21, owner: "BBB" });
      for (const id of PIECES.slice(0, 3)) pg.sb.queueWrite("/api/map/set-province-terrain", { provinceId: id, terrain: "plains", type: "land", coastal: true });
      const queued = pg.sb.pendingWrites.length;
      ok(pg.btn.disabled === false && pg.btn.click() === true, "THE CONTROL: with writes queued the button takes the click");
      const running = pg.sb.flushMapSaves.running;
      ok(!!running && pg.btn.disabled === true, "⭐ …and the moment the Save starts the button is disabled");
      await Promise.race([running, P.settle(60000)]); await P.settle(50);
      const ctrlS = await again.ctrlS, quit = await again.quit;
      ok(disabledAt.length === queued && disabledAt.every((d) => d === true), "⭐⭐ the button stays disabled through every write of the Save: each write's setMapDirty used to re-enable it", disabledAt);
      ok(again.click === false, "⭐ …so the second click is not taken");
      const urls = pg.posted.map((p) => p.url);
      ok(urls.length === queued && urls.filter((u) => u.endsWith("/create-state")).length === 1, "⭐⭐⭐ every queued write went out once: Ctrl+S and the quit dialog did not send the write in flight a second time", urls);
      ok(new Set(pg.posted.map((p) => p.id)).size === 1, "⭐⭐ …and one Save has one id, so its run was not ended by a second one", [...new Set(pg.posted.map((p) => p.id))]);
      ok(ctrlS === 0 && quit.saved === true && quit.left === 0, "⭐ Ctrl+S and the quit dialog are given the running Save to wait for: each answers after it has ended, the quit dialog that nothing is left", { ctrlS, quit });
      const made = [...filesOf(M).keys()].filter((r) => !before.has(r) && /^history\/states\//.test(r));
      ok(made.length === 1 && /provinces\s*=\s*\{\s*120\s*\}/.test(fs.readFileSync(path.join(M, made[0]), "utf8")), "⭐⭐ one new state, holding its province", made);
      ok(!(await fatalRules(M)).includes("empty_state"), "⭐⭐ …and no second state with `provinces = { }`, which is fatal");
      ok(pg.sb.flushMapSaves.running === null && pg.btn.disabled === true && pg.sb.pendingWrites.length === 0, "with nothing left the guard is down and the button is disabled for the usual reason");
      // the guard comes down: the next edit's Save runs, and it is a Save of its own
      pg.sb.queueWrite("/api/map/set-province-terrain", { provinceId: PIECES[5], terrain: "plains", type: "land", coastal: true });
      ok(pg.btn.disabled === false && pg.btn.click() === true, "⭐ the next edit enables the button again and the click is taken");
      await pg.sb.flushMapSaves.running;
      ok(pg.posted.length === queued + 1 && pg.posted[queued].id !== pg.posted[0].id && pg.sb.pendingWrites.length === 0, "…and it is a Save of its own, with an id of its own", pg.posted.slice(-2));
      // …and comes down however the Save ends, from anywhere in it, the checks ahead of its first write among them
      const pg2 = openPage(freshMod(), { extra: { isVanillaTarget: () => { throw new Error("thrown ahead of the first write"); } } });
      pg2.sb.queueWrite("/api/map/set-province-terrain", { provinceId: PIECES[0], terrain: "plains", type: "land", coastal: true });
      let thrown = "";
      await pg2.sb.flushMapSaves().catch((e) => { thrown = e.message; });
      pg2.sb.isVanillaTarget = () => false;
      ok(/ahead of the first write/.test(thrown) && pg2.sb.flushMapSaves.running === null && pg2.btn.disabled === false, "⭐ a Save that throws does not leave the guard up or the button off", thrown);
      ok(pg2.btn.click() === true, "…and the click after it is taken");
      await pg2.sb.flushMapSaves.running;
      ok(pg2.posted.length === 1 && pg2.sb.pendingWrites.length === 0, "…and writes what was queued", pg2.posted);
      // the three doors are the three the page has. A DOOR is a line that still names flushMapSaves once every property of it (`.running`, the
      // Save's own state such as `.townsSent`: a property of the function, as the page keeps them, because tests lift it) and every
      // `typeof flushMapSaves` are taken out: a property read is no caller, and a call beside one on the same line is still counted.
      const callers = maskJsComments(fs.readFileSync(path.join(__dirname, "public", "map.js"), "utf8")).split(/\r?\n/).filter((l) => /\bflushMapSaves\b/.test(l.replace(/\bflushMapSaves\.[A-Za-z_$][\w$]*/g, "").replace(/\btypeof\s+flushMapSaves\b/g, "")) && !/async function flushMapSaves/.test(l)).map((l) => l.trim());
      ok(callers.length === 3 && callers.some((l) => l.includes('$("mapSaveAll").addEventListener("click", flushMapSaves)')) && callers.some((l) => /k === "s".*flushMapSaves\(\)/.test(l)) && callers.some((l) => /await flushMapSaves\(\)/.test(l) && /pendingWrites/.test(l)),
        "⭐ the button, Ctrl+S and the quit dialog are the only callers, and none has a Save of its own to start", callers);
    }

    console.log("\n-- ⛔ 8. A SAVE THAT STOPPED AND IS CLICKED AGAIN IS THE SAME SAVE (#a-stopped-save-is-still-the-same-save) --");
    const retypes = (pg, ids = PIECES) => { for (const id of ids) pg.sb.queueWrite("/api/map/set-province-terrain", { provinceId: id, terrain: "plains", type: "land", coastal: true }); };
    /** every file in `folder` is the bytes the mod had in `before`: no mid-Save copy among them */
    const asBefore = (folder, before) => [...filesOf(folder)].filter(([rel, s]) => before.get(rel) !== s).map(([rel]) => rel);
    for (const K of [15, 4]) {
      const M = freshMod(), before = filesOf(M), csv = path.join(M, "map", "definition.csv");
      let held = false;
      const pg = openPage(M, { onPost: (url, n) => { if (n === K && !held) { held = true; fs.chmodSync(csv, 0o444); } } });
      retypes(pg);
      await pg.sb.flushMapSaves(); await P.settle(50);
      const line1 = pg.last(), folders1 = saveFolders(M), f1 = firstCopies(M, before, folders1);
      ok(new RegExp(`Save stopped at step ${K}\\b`).test(line1) && pg.sb.pendingWrites.length === PIECES.length - K + 1, `THE CONTROL: at request ${K} definition.csv goes read-only and the Save stops, with the rest queued`, { line: line1.slice(0, 160), left: pg.sb.pendingWrites.length });
      ok(folders1.length === 1 && f1.length > 0 && f1.every((x) => x.inFolder) && asBefore(folders1[0], before).length === 0, `⭐⭐⭐ the stop opened the Save's folder at once: all ${f1.length} files it had changed are there as they were before it`, { folders: folders1.length, f1: f1.slice(0, 4) });
      ok(folders1.length === 1 && line1.includes(folders1[0]) && /A copy of all of them was saved first/.test(line1), "⭐⭐ …and the line that says the Save stopped says where", line1.slice(-500));
      fs.chmodSync(csv, 0o644);
      await pg.sb.flushMapSaves(); await P.settle(50);
      const folders2 = saveFolders(M), f2 = firstCopies(M, before, folders2);
      ok(new Set(pg.posted.map((p) => p.id)).size === 1, "⭐⭐⭐ the second click is the same Save: one id from the first request to the last", [...new Set(pg.posted.map((p) => p.id))]);
      ok(pg.sb.pendingWrites.length === 0 && f2.length > 0 && f2.every((x) => x.inFolder) && folders2.length === 1 && asBefore(folders2[0], before).length === 0, `⭐⭐⭐ it finishes, and every one of the ${f2.length} files the two clicks changed is in ONE folder as it was before the modder's edits`, { left: pg.sb.pendingWrites.length, folders: folders2.length, wrong: folders2[0] ? asBefore(folders2[0], before) : [], f2: f2.filter((x) => !x.inFolder) });
      ok(folders2.length === 1 && pg.last().includes(folders2[0]), "⭐ …which the line of the Save that finished names too", pg.last().slice(-400));
      ok(pg.sb.model.saveRunId === null, "…and with the queue empty the Save has ended: the page holds no id", pg.sb.model.saveRunId);
      retypes(pg, PIECES.slice(0, 1));
      const ended = pg.posted.length;
      ok(ended > 0, "the next edit is queued");
      await pg.sb.flushMapSaves(); await P.settle(50);
      ok(pg.posted.length === ended + 1 && pg.posted[ended].id !== pg.posted[0].id, "⭐ …and the next Save has an id of its own", pg.posted.slice(-2));
    }
    {
      const M = freshMod(), before = filesOf(M);
      const pg = openPage(M);
      PIECES.forEach((id, i) => { if (i === 14) pg.sb.queueWrite("/api/map/flip-province-sea", { provinceId: 150 }); retypes(pg, [id]); });
      await pg.sb.flushMapSaves(); await P.settle(50);
      ok(/Save stopped at step 15\b/.test(pg.last()) && saveFolders(M).length === 1 && pg.last().includes(saveFolders(M)[0]), "⭐⭐ a write the server refuses mid-queue (an Erase of an inland province) opens the folder and names it the same way", pg.last().slice(0, 200));
      pg.sb.pendingWrites.shift();   // what taking that one edit back leaves in the queue
      await pg.sb.flushMapSaves(); await P.settle(50);
      const folders = saveFolders(M), f = firstCopies(M, before, folders);
      ok(new Set(pg.posted.map((p) => p.id)).size === 1 && pg.sb.pendingWrites.length === 0 && folders.length === 1 && f.length > 0 && f.every((x) => x.inFolder) && asBefore(folders[0], before).length === 0, `⭐⭐⭐ …and the Save clicked again keeps all ${f.length}, as they were before it`, { ids: new Set(pg.posted.map((p) => p.id)).size, folders: folders.length, f: f.filter((x) => !x.inFolder) });
    }
    {
      const M = freshMod(), before = filesOf(M);
      const pg = openPage(M);
      for (const id of [ISLANDS[0], ISLANDS[1], 150, ISLANDS[2]]) pg.sb.queueWrite("/api/map/flip-province-sea", { provinceId: id });
      await pg.sb.flushMapSaves(); await P.settle(50);
      const folders = saveFolders(M), f = firstCopies(M, before, folders);
      ok(pg.posted.length === 1 && pg.posted[0].url.endsWith("/flip-provinces-sea") && /Save stopped at step 3\b/.test(pg.last()), "THE CONTROL: an erase stroke goes as one request, whose answer is ok with one of its answers refused, and the Save stops there", { posted: pg.posted, line: pg.last().slice(0, 200) });
      ok(folders.length === 1 && f.length > 0 && f.every((x) => x.inFolder), `⭐⭐ …which is a stop too: the folder has the ${f.length} files the stroke changed`, { folders: folders.length, f: f.slice(0, 4) });
    }
    {
      const M = freshMod();
      const pg = openPage(M);
      pg.sb.queueWrite("/api/map/flip-province-sea", { provinceId: 150 });
      retypes(pg, PIECES.slice(0, 2));
      await pg.sb.flushMapSaves(); await P.settle(50);
      ok(/Save stopped at step 1\b/.test(pg.last()) && saveFolders(M).length === 0 && !/saved first/.test(pg.last()), "⭐ a Save stopped at its first write has written nothing, so no folder is made and none is claimed", { line: pg.last().slice(0, 200), folders: saveFolders(M) });
      const id = pg.sb.model.saveRunId;
      pg.sb.pendingWrites.length = 0;   // the modder takes it all back
      await pg.sb.flushMapSaves(); await P.settle(20);
      ok(!!id && pg.last() === "Nothing to save." && pg.sb.model.saveRunId === null, "⭐ …and when the modder has taken everything back the queue is empty, so the Save has ended", { id, kept: pg.sb.model.saveRunId, line: pg.last() });
      // (⛔ #a-capital-state-keeps-a-victory-point, review T04 — …and what its writes named, owed to the Save that finishes its queue, ends with it: the two are one record of one Save)
      ok(pg.sb.model.stoppedSaveOwes === null, "⭐ …and what the stopped Save owed ends with it", pg.sb.model.stoppedSaveOwes);
    }

    console.log("\n-- ⛔ 9. …AND THE APP REOPENED: A NEW SAVE RUN KNOWS NOTHING OF THE OLD ONE --");
    {
      // stopped first: the copies left the pool at the stop
      const M = freshMod(), before = filesOf(M), csv = path.join(M, "map", "definition.csv");
      let held = false;
      const pg = openPage(M, { onPost: (url, n) => { if (n === 15 && !held) { held = true; fs.chmodSync(csv, 0o444); } } });
      retypes(pg);
      await pg.sb.flushMapSaves(); await P.settle(50);
      fs.chmodSync(csv, 0o644);
      const again = openPage(M);   // the queue crash recovery kept, in a page with no id: what a reopened Save is
      for (const w of pg.sb.pendingWrites) again.sb.queueWrite(w.url, w.body, w.meta);
      await again.sb.flushMapSaves(); await P.settle(50);
      const folders = saveFolders(M), f = firstCopies(M, before, folders);
      ok(again.sb.pendingWrites.length === 0 && again.posted[0].id !== pg.posted[0].id, "THE CONTROL: the rest of the Save goes under a new id, as it does in a new process", again.posted[0]);
      ok(f.length > 0 && f.every((x) => x.inFolder), `⭐⭐⭐ the folder the stop opened still has all ${f.length} files as they were before the modder's edits`, f.filter((x) => !x.inFolder));
    }
    {
      // cut off with no answer at all: no stop to open a folder at, and the run is gone with the process
      const M = freshMod(), before = filesOf(M);
      const pg = openPage(M, { hangAt: 16 });
      retypes(pg);
      pg.sb.flushMapSaves();
      for (let i = 0; i < 400 && pg.sb.pendingWrites.length > PIECES.length - 15; i++) await P.settle(50);
      const restored = pg.sb.pendingWrites.map((w) => ({ url: w.url, body: JSON.parse(JSON.stringify(w.body)), meta: w.meta }));
      ok(pg.posted.length === 15 && restored.length === PIECES.length - 15, "THE CONTROL: the app is gone at the 16th write, with the rest of the queue in crash recovery", { posted: pg.posted.length, left: restored.length });
      const again = openPage(M);
      for (const w of restored) again.sb.queueWrite(w.url, w.body, w.meta);
      await again.sb.flushMapSaves(); await P.settle(50);
      const f = firstCopies(M, before, saveFolders(M));
      ok(again.sb.pendingWrites.length === 0 && f.length > 0 && f.every((x) => x.inPool), `⭐⭐⭐ the reopened Save pushes nothing out: all ${f.length} files as they were before the modder's edits are still in the pool`, { left: again.sb.pendingWrites.length, f: f.filter((x) => !x.inPool) });
    }
    {
      // …and the Restore bar says so, off the one flag the crash-recovery record gains
      const store = new Map();
      const rb = P.runPage([["const MAP_BACKUP_KEY = ", "\n"], "function saveMapBackup()", "function readMapBackup()", "function showRestoreBar(b)"], {
        localStorage: { setItem: (k, v) => store.set(k, v), getItem: (k) => (store.has(k) ? store.get(k) : null), removeItem: (k) => store.delete(k) },
        pendingWrites: [{ url: "/api/map/set-owner", body: { stateId: 1, owner: "BBB" } }], modPath: () => "m", model: { saveRunId: "kept-by-a-save" },
        $: (id) => (id === "mapRestoreBar" || id === "mapWrap" ? null : P.element()),
      });
      rb.sb.saveMapBackup();
      const b1 = rb.sb.readMapBackup();
      rb.sb.showRestoreBar(b1);
      const said = String(rb.overlays[rb.overlays.length - 1].innerHTML);
      ok(b1 && b1.partWay === true && /left by a Save that did not finish/.test(said), "⭐⭐ a queue a Save left says so on the Restore bar: a Discard there leaves the mod half saved", { b1, said: said.slice(0, 300) });
      rb.sb.model.saveRunId = null;
      rb.sb.saveMapBackup();
      const b2 = rb.sb.readMapBackup();
      rb.sb.showRestoreBar(b2);
      ok(b2 && b2.partWay === false && !/did not finish/.test(String(rb.overlays[rb.overlays.length - 1].innerHTML)), "⭐ …and a queue of edits nobody has tried to Save does not", b2);
    }

    console.log("\n-- ⛔ 10. THE RUN, AND THE BODY LIMIT, IN THE WIRING --");
    {
      // a run past its hour, swept out by any later Save, is back when its Save is clicked again
      const R = path.join(process.env.HOI4_MODS_ROOT, "late"), A = write(R, "map/a.txt", "the first copy of a\n");
      const others = Array.from({ length: MAX_BACKUP_FILES + 20 }, (_, i) => write(R, `map/other/${i}.txt`, `other ${i}\n`));
      const D = path.join(ROOT, "late-run"), run = SW.beginSaveRun({ dir: D, root: R });
      let was = SW.useSaveRun(run);
      try { SW.safeModWrite(A, "a, changed\n", "map-test"); } finally { SW.useSaveRun(was); }
      run.last = Date.now() - 2 * 3600 * 1000;
      SW.beginSaveRun({ root: path.join(R, "another-mod") });
      was = SW.useSaveRun(run);
      try { const t = Date.now(); while (Date.now() - t < 5) { /* a later timestamp */ } for (const f of others) SW.safeModWrite(f, "changed\n", "map-test"); } finally { SW.useSaveRun(was); }
      ok(fs.existsSync(path.join(D, "map/a.txt")) && fs.readFileSync(path.join(D, "map/a.txt"), "utf8") === "the first copy of a\n", "⭐⭐ a stopped Save clicked again after its hour has passed is kept again, however long it then runs");
      SW.beginSaveRun({ root: R });
      // ⛔ #a-save-backs-a-file-up-once — a copy is skipped only while the file is as the run's own last write left it
      const F = write(R, "map/f.txt", "before the Save\n"), tailF = path.resolve(F).replace(/[\\/:]/g, "__"), copiesOfF = () => backups().filter((n) => n.endsWith(tailF)).sort();
      const runF = SW.beginSaveRun({ dir: path.join(ROOT, "hand-run"), root: R });
      was = SW.useSaveRun(runF);
      try {
        SW.safeModWrite(F, "the Save's first write\n", "map-test");
        const firstCopyOfF = copiesOfF();
        SW.safeModWrite(F, "the Save's second write\n", "map-test");
        ok(firstCopyOfF.length === 1 && copiesOfF().length === 1 && fs.readFileSync(path.join(BACKUP_DIR, firstCopyOfF[0]), "utf8") === "before the Save\n", "⭐⭐ a run takes one copy of a file, the file as it was before the Save", copiesOfF());
        ok(SW.backupAssetBeforeOverwrite(F, "map-test") === "" && copiesOfF().length === 1, "⭐ …by the other door too (a Save deletes a state file through it)", copiesOfF());
        fs.writeFileSync(F, "the modder's own edit, between two clicks of a stopped Save\n");
        SW.safeModWrite(F, "the Save's third write\n", "map-test");
        const two = copiesOfF();
        ok(two.length === 2 && two.some((n) => /modder's own edit/.test(fs.readFileSync(path.join(BACKUP_DIR, n), "utf8"))), "⭐⭐⭐ …but a file something else has changed since the run's last write is copied before it is overwritten", two);
        SW.safeModWrite(F, "the Save's fourth write\n", "map-test");
        ok(copiesOfF().length === 2, "…and then as before, one copy for that change", copiesOfF());
        for (const n of copiesOfF()) fs.unlinkSync(path.join(BACKUP_DIR, n));   // this fixture's own copies, gone from the pool by any other means
        SW.safeModWrite(F, "the Save's fifth write\n", "map-test");
        ok(copiesOfF().length === 1, "⭐ …and a run whose first copy is no longer anywhere does not go on as if it held one", copiesOfF());
      } finally { SW.useSaveRun(was); }
      SW.beginSaveRun({ root: R });
      // …and that holds of a write of Nova's own in the clock tick of the run's last one, the same size: stat cannot see it (#a-same-tick-write-keeps-its-stamp)
      const G = write(R, "map/g.txt", "before the Save\n"), tailG = path.resolve(G).replace(/[\\/:]/g, "__"), copiesOfG = () => backups().filter((n) => n.endsWith(tailG)).sort();
      const runG = SW.beginSaveRun({ dir: path.join(ROOT, "tick-run"), root: R });
      was = SW.useSaveRun(runG);
      try {
        SW.safeModWrite(G, "the Save's first write\n", "map-test");
        const release = holdTheClock([G]);
        try {
          const stat0 = fs.statSync(G);
          SW.useSaveRun(null);
          SW.safeModWrite(G, "an Auto-fix's own line\n", "map-test");
          const stat1 = fs.statSync(G);
          ok(stat1.size === stat0.size && stat1.mtimeMs === stat0.mtimeMs && fs.readFileSync(G, "utf8") === "an Auto-fix's own line\n", "THE CONTROL: a same-size write in the same tick: stat cannot tell it from no write", { stat0: stat0.size, stat1: stat1.size });
          SW.useSaveRun(runG);
          SW.safeModWrite(G, "the Save's next write\n", "map-test");
          const inPool = copiesOfG().map((n) => fs.readFileSync(path.join(BACKUP_DIR, n), "utf8"));
          ok(inPool.includes("an Auto-fix's own line\n"), "⭐⭐ …so is a write of Nova's own in the clock tick of the run's last one, which only the count of Nova's writes can see", inPool);
          const n = copiesOfG().length;
          SW.safeModWrite(G, "the Save's last write\n", "map-test");
          ok(copiesOfG().length === n, "…and then as before, one copy for that change: a write of the run's own moves the count too, and the run's stamp with it", copiesOfG());
        } finally { release(); }
      } finally { SW.useSaveRun(was); }
      SW.beginSaveRun({ root: R });
      // ⚠️ #a-route-that-raises-its-limit-gets-it — a body over the global parser's limit is read BEFORE the run, or the handler runs outside it
      const M = freshMod(), id = "pin-the-body-" + Date.now().toString(36), [r, g, b] = colour(101);
      const paint = (x) => fetch(base + "/api/map/paint-provinces", { method: "POST", headers: { "Content-Type": "application/json", "X-Nova-Map-Save": id }, body: JSON.stringify({ modPath: M, diff: [{ x, y: 60, r, g, b }], pad: "x".repeat(11 * 1048576) }) }).then((res) => res.json());
      const first = await paint(15), second = await paint(14);
      ok(first.ok === true && second.ok === true, "THE CONTROL: two paints of 11 MB each land", { first: JSON.stringify(first).slice(0, 200), second: JSON.stringify(second).slice(0, 200) });
      ok(poolCopiesOf(M).get("map__provinces.bmp") === 1, "⭐⭐⭐ …both inside the Save's run: provinces.bmp went to the pool once", [...poolCopiesOf(M)].slice(0, 12));
      // …and the page's own Save of a stroke over the 10 MB (each pixel many times over, on a map this small)
      const pg = openPage(freshMod());
      for (let i = 0; i < 360000; i++) pg.sb.paintDiff.set(String(i), { x: 8 + (i % 8), y: 52 + ((i >> 3) % 8), r, g, b });
      await pg.sb.flushMapSaves(); await P.settle(50);
      ok(pg.posted.length === 1 && pg.sb.paintDiff.size === 0 && /Saved 1 change/.test(pg.last()) && !/Unexpected token/.test(pg.last()), "⭐⭐ a stroke of more than 10 MB is saved by the page's own Save", { line: pg.last().slice(0, 200), staged: pg.sb.paintDiff.size });
    }

    console.log("\n-- ⛔ 11. A FILE THE SAVE MADE HAS NO \"BEFORE\" (#a-file-a-save-made-has-no-before) --");
    const stopAt = (M, K) => { const csv = path.join(M, "map", "definition.csv"); let held = false; return { onPost: (url, n) => { if (n === K && !held) { held = true; fs.chmodSync(csv, 0o444); } }, free: () => fs.chmodSync(csv, 0o644) }; };
    const overlay = (name, own = []) => { const m = path.join(process.env.HOI4_MODS_ROOT, name); write(m, "descriptor.mod", 'name="owns only what it is given"\n'); for (const rel of own) write(m, rel, fs.readFileSync(path.join(GAME, rel))); return m; };
    {
      // a mod owning nothing of its map: every file of the Save is one it made
      const M = overlay("owns-nothing");
      const pg = openPage(M);
      retypes(pg);
      await pg.sb.flushMapSaves(); await P.settle(50);
      const made = [...filesOf(M).keys()].filter((r) => r !== "descriptor.mod");
      ok(pg.sb.pendingWrites.length === 0 && made.length > 4, `THE CONTROL: 32 retypes on a mod owning nothing wrote ${made.length} files, none of which it had`, made.slice(0, 12));
      ok(poolCopiesOf(M).size === 0, "⭐⭐⭐ nothing of the Save's own went into the pool: none of those copies was ever a file as it was before the Save", [...poolCopiesOf(M)].slice(0, 12));
      ok(saveFolders(M).length === 0 && !/saved first|before the Save/.test(pg.last()), "⭐⭐⭐ …no folder opens, and the line claims no copy of anything", pg.last().slice(-400));
    }
    {
      // a mod owning one file of its map, stopped part-way: the folder holds that file, and says of the rest that it does not
      const M = overlay("owns-its-rows", ["map/definition.csv"]), before = filesOf(M), stop = stopAt(M, 3);
      const pg = openPage(M, { onPost: stop.onPost });
      retypes(pg);
      await pg.sb.flushMapSaves(); await P.settle(50);
      stop.free();
      const folders = saveFolders(M), inFolder = folders.length ? [...filesOf(folders[0]).keys()] : [];
      const made = [...filesOf(M).keys()].filter((r) => !before.has(r));
      ok(/Save stopped at step 3\b/.test(pg.last()) && folders.length === 1 && inFolder.length === 1 && inFolder[0] === "map/definition.csv" && filesOf(folders[0]).get("map/definition.csv") === before.get("map/definition.csv"), "⭐⭐⭐ the folder holds the one file the mod had, as it was, and none of the ones the Save made", { inFolder, line: pg.last().slice(0, 120) });
      const line = pg.last();
      ok(made.length > 1 && line.includes(folders[0]) && new RegExp(`It also created ${made.length} new files, which that folder has no copy of: copying it back over your mod leaves them in place`).test(line), `⭐⭐⭐ …and the line says of the other ${made.length} what Generate land says of its own`, line.slice(-500));
      await pg.sb.flushMapSaves(); await P.settle(50);
      const made2 = [...filesOf(M).keys()].filter((r) => !before.has(r));
      ok(pg.sb.pendingWrites.length === 0 && [...filesOf(saveFolders(M)[0]).keys()].length === 1 && new RegExp(`It also created ${made2.length} new files`).test(pg.last()), "⭐ …and so does the line of the same Save finished, the files it made first still not among its copies", pg.last().slice(-400));
    }
    {
      // the review's: Create state, a province moved in, then a stop; the folder copied back over the mod. A state with provinces = { } came back with it, which is fatal
      const M = freshMod(), before = filesOf(M);
      const pg = openPage(M);
      pg.sb.stateById.set(-1, { id: -1, provinces: [120] });
      pg.sb.queueWrite("/api/map/create-state", { name: "", owner: "AAA" }, { create: true, provisionalId: -1 });
      pg.sb.queueWrite("/api/map/move-province", { provinceId: 120, toStateId: -1 }, { fromStateId: 22 });
      retypes(pg, PIECES.slice(0, 3));
      pg.sb.queueWrite("/api/map/flip-province-sea", { provinceId: 150 });
      await pg.sb.flushMapSaves(); await P.settle(50);
      const folders = saveFolders(M), newState = [...filesOf(M).keys()].filter((r) => !before.has(r) && /^history\/states\//.test(r));
      const made = [...filesOf(M).keys()].filter((r) => !before.has(r));
      ok(/Save stopped at step 6\b/.test(pg.last()) && folders.length === 1 && newState.length === 1, "THE CONTROL: the Save stopped after making a state", { line: pg.last().slice(0, 160), folders, newState });
      ok(!fs.existsSync(path.join(folders[0], newState[0])), "⭐⭐⭐ the folder has no copy of the state the Save made (it was the Save's own first edit)", newState);
      ok(new RegExp(`It also created ${made.length} new file`).test(pg.last()), `⭐⭐ …and the line counts the ${made.length} file(s) it made`, pg.last().slice(-400));
      fs.cpSync(folders[0], M, { recursive: true });
      const rules = await fatalRules(M), stands = fs.readFileSync(path.join(M, newState[0]), "utf8");
      ok(!rules.includes("empty_state") && /\b120\b/.test(stands), "⭐⭐⭐ copied back over the mod, it adds no state with provinces = { }: the state stays as the Save left it, as the line said", { rules, stands: stands.slice(0, 160) });
    }
    {
      // a file made and deleted again inside one Save is not a file it left behind
      const R = path.join(process.env.HOI4_MODS_ROOT, "made-and-gone"), run = SW.beginSaveRun({ dir: path.join(ROOT, "made-run"), root: R });
      const A = write(R, "map/kept.txt", "had\n"), N = path.join(R, "map", "new.txt"), N2 = path.join(R, "map", "new2.txt");
      const was = SW.useSaveRun(run);
      try {
        SW.safeModWrite(N, "made\n", "map-test"); SW.safeModWrite(N2, "made\n", "map-test"); SW.safeModWrite(A, "changed\n", "map-test");
        SW.safeModWrite(N, "made, then changed\n", "map-test");
        fs.unlinkSync(N2);
      } finally { SW.useSaveRun(was); }
      SW.openSaveRun(run);
      const c = SW.saveRunCopies(run);
      ok(c && c.files === 1 && c.created === 1 && !fs.existsSync(path.join(ROOT, "made-run", "map/new.txt")), "⭐ one file made and kept counts, one made and deleted again does not, and a second write of a made file is no first copy", c);
      SW.beginSaveRun({ root: R });
    }

    console.log("\n-- ⛔ 12. A COPY THAT COULD NOT BE MADE IS COUNTED ONCE, AND \"STAY\" IS SAID ONLY OF ONE THE POOL HAS (#a-copy-that-could-not-be-made-is-counted-once) --");
    const breakFolder = (M) => { const d = md.mapSaveCopiesDir(M); fs.mkdirSync(path.dirname(d), { recursive: true }); fs.writeFileSync(d, "not a folder"); };
    {
      const M = freshMod(), before = filesOf(M), stop = stopAt(M, 15);
      breakFolder(M);
      const pg = openPage(M, { onPost: stop.onPost });
      retypes(pg);
      await pg.sb.flushMapSaves(); await P.settle(50);
      const f = firstCopies(M, before, []), line = pg.last();
      ok(/Save stopped at step 15\b/.test(line) && f.length > 0 && f.every((x) => x.inPool), `THE CONTROL: the Save's folder cannot be made, and all ${f.length} first copies are in the pool`, { line: line.slice(0, 120), f: f.slice(0, 3) });
      const firsts = poolCopiesOf(M).size;   // a run takes one copy of a file, so this is how many files it has a first copy of
      ok(firsts >= f.length && new RegExp(`⚠ This Save: ${firsts} files it changed could not be copied outside your mod`).test(line), `⭐⭐⭐ the line counts the ${firsts} files, not its attempts`, line.slice(-600));
      ok(/only until newer backups push them out, which can be as soon as your next Save of this mod/.test(line) && line.includes(BACKUP_DIR), "⭐⭐ …and says until when, and where", line.slice(-600));
      ok(!/A copy of all of them was saved first/.test(line), "…and claims no folder", line.slice(-400));
      stop.free();
      // whatever fills the pool now, a prune retrying at every backup: the copies stay, and the count does not move
      const R = path.join(process.env.HOI4_MODS_ROOT, "flood");
      for (let i = 0; i < MAX_BACKUP_FILES + 20; i++) SW.safeModWrite(write(R, `map/flood/${i}.txt`, `flood ${i}\n`), "changed\n", "map-test");
      const f2 = firstCopies(M, before, []);
      ok(f2.length > 0 && f2.every((x) => x.inPool), "⭐⭐⭐ the pool keeps them past its limit while the run is alive, rather than lose the only copy", f2.filter((x) => !x.inPool));
      await pg.sb.flushMapSaves(); await P.settle(50);
      ok(pg.sb.pendingWrites.length === 0 && poolCopiesOf(M).size === firsts && new RegExp(`⚠ This Save: ${firsts} files it changed could not be copied`).test(pg.last()), "⭐⭐ …and the line of the same Save finished still says the same number, after two hundred retries", { pool: poolCopiesOf(M).size, firsts, line: pg.last().slice(-500) });
    }
    {
      // the pool's name too long for the disk, and the folder working: a copy, and no false reason
      const M = path.join(process.env.HOI4_MODS_ROOT, "d".repeat(200)), before0 = freshMod();
      for (const [rel] of filesOf(before0)) write(M, rel, fs.readFileSync(path.join(before0, rel)));
      const before = filesOf(M);
      const pg = openPage(M);
      retypes(pg, PIECES.slice(0, 1));
      await pg.sb.flushMapSaves(); await P.settle(50);
      const folders = saveFolders(M), f = firstCopies(M, before, folders);
      ok(pg.sb.pendingWrites.length === 0 && f.length > 0 && f.every((x) => x.inFolder && !x.inPool), `THE CONTROL: the pool could take none of the ${f.length} first copies of a mod this deep, and the folder has them all`, { f: f.slice(0, 3), folders: folders.length });
      ok(folders.length === 1 && pg.last().includes(folders[0]) && !/backed up more than/.test(pg.last()), "⭐⭐ the line names the folder, and does not say the Save backed up more than the pool keeps: it made one write", pg.last().slice(-400));
      // …and with the folder broken as well there is no copy anywhere, and "stay" would be a lie
      const M2 = path.join(process.env.HOI4_MODS_ROOT, "e".repeat(200));
      for (const [rel] of filesOf(before0)) write(M2, rel, fs.readFileSync(path.join(before0, rel)));
      breakFolder(M2);
      const before2 = filesOf(M2), pg2 = openPage(M2);
      retypes(pg2, PIECES.slice(0, 1));
      await pg2.sb.flushMapSaves(); await P.settle(50);
      const f2 = firstCopies(M2, before2, []);
      ok(f2.length > 0 && f2.every((x) => !x.inPool), `THE CONTROL: neither the pool nor the folder could take any of the ${f2.length}`, f2.slice(0, 3));
      ok(new RegExp(`⚠ Nova could not copy the ${f2.length} files it changed before changing them, so they have no copy outside your mod`).test(pg2.last()) && !/stay|backups folder/.test(pg2.last().split("⚠ Nova could not copy")[1] || ""), `⭐⭐⭐ the line says the ${f2.length} have no copy, and not that they stay anywhere`, pg2.last().slice(-500));
    }
    {
      // a folder that could not take a copy and later can: the count goes down
      const R = path.join(process.env.HOI4_MODS_ROOT, "later"), A = write(R, "map/a.txt", "the first copy of a\n");
      const blocked = path.join(ROOT, "blocked-folder"), D = path.join(blocked, "run");
      fs.writeFileSync(blocked, "a file where the folder's parent should be");
      const run = SW.beginSaveRun({ dir: D, root: R });
      let was = SW.useSaveRun(run);
      try { SW.safeModWrite(A, "a, changed\n", "map-test"); } finally { SW.useSaveRun(was); }
      SW.openSaveRun(run);
      const c1 = SW.saveRunCopies(run);
      ok(c1 && c1.stay === 1 && c1.files === 0 && c1.failed === 0 && c1.backups === BACKUP_DIR && c1.dir === "", "the folder cannot take it, so it stays, one file, and the answer names no folder", c1);
      fs.unlinkSync(blocked);
      for (let i = 0; i < MAX_BACKUP_FILES + 20; i++) SW.safeModWrite(write(R, `map/flood/${i}.txt`, `flood ${i}\n`), "changed\n", "map-test");
      const c2 = SW.saveRunCopies(run);
      ok(c2 && c2.stay === 0 && c2.failed === 0 && c2.files === 1 && c2.dir === D && fs.readFileSync(path.join(D, "map/a.txt"), "utf8") === "the first copy of a\n", "⭐⭐ …and when the pool would let it go the folder is tried again, and a success takes it off the count", c2);
      SW.beginSaveRun({ root: R });
    }

    console.log("\n-- ⛔ 13. A FOLDER THAT OPENED AFTER ITS SAVE'S LINE HAD GONE IS NAMED BY THE NEXT SAVE OF THAT MOD (#a-save-folder-nobody-was-told-about) --");
    {
      const M = freshMod(), before = filesOf(M), other = freshMod();
      const flood = (name) => { const R = path.join(process.env.HOI4_MODS_ROOT, name); for (let i = 0; i < MAX_BACKUP_FILES + 20; i++) SW.safeModWrite(write(R, `map/flood/${i}.txt`, `flood ${i}\n`), "changed\n", "map-test"); };
      const pg = openPage(M);
      retypes(pg, PIECES.slice(0, 3));
      await pg.sb.flushMapSaves(); await P.settle(50);
      ok(saveFolders(M).length === 0 && !/saved first/.test(pg.last()), "THE CONTROL: a Save that fills nothing opens no folder and says nothing of one", pg.last().slice(-200));
      flood("unnamed-flood");   // something else, within the hour: another mod's long Save, a big Auto-fix
      const folders = saveFolders(M);
      ok(folders.length === 1 && asBefore(folders[0], before).length === 0, "THE CONTROL: the pool would have let that Save's first copies go, so its folder opened, as they were before it", folders);
      const onOther = openPage(other);
      retypes(onOther, PIECES.slice(0, 1));
      await onOther.sb.flushMapSaves(); await P.settle(50);
      ok(!/An earlier Save/.test(onOther.last()), "⭐ a Save of ANOTHER mod does not name it: it is not that mod's", onOther.last().slice(-300));
      const line = async () => { retypes(pg, PIECES.slice(4, 5)); await pg.sb.flushMapSaves(); await P.settle(50); return pg.last(); };
      const next = await line(), kept = filesOf(folders[0]).size;
      ok(next.includes(folders[0]) && new RegExp(`⚠ An earlier Save of this mod: Changed ${kept} files?\\.`).test(next), `⭐⭐⭐ the next Save of this mod names it, with the ${kept} files it holds`, next.slice(-500));
      const another = await line();
      ok(!another.includes(folders[0]), "⭐ …once: the Save after that has nothing to say of it", another.slice(-300));
      // and a folder its own answer named is not named a second time
      const M2 = freshMod(), own = stopAt(M2, 2);
      const pg2 = openPage(M2, { onPost: own.onPost });
      retypes(pg2, PIECES.slice(0, 3));
      await pg2.sb.flushMapSaves(); await P.settle(50);
      own.free();
      await pg2.sb.flushMapSaves(); await P.settle(50);
      const named = saveFolders(M2)[0];
      flood("unnamed-flood-2");
      retypes(pg2, PIECES.slice(4, 5));
      await pg2.sb.flushMapSaves(); await P.settle(50);
      ok(!!named && !pg2.last().includes(named), "⭐ a folder a Save's own line named is not named again by the next one", pg2.last().slice(-300));
      // …nor one that opened outside its Save and that Save's own next answer named: a Save cut off with no answer, the pool filled, and the same Save clicked again
      const M3 = freshMod(), before3 = filesOf(M3);
      const pg3 = openPage(M3, { failAt: 3 });
      retypes(pg3, PIECES.slice(0, 5));
      await pg3.sb.flushMapSaves(); await P.settle(50);
      ok(/Save stopped at step 3\b/.test(pg3.last()) && saveFolders(M3).length === 0, "THE CONTROL: the connection drops at the third write: the Save stops, and no answer came to open a folder at", pg3.last().slice(0, 160));
      flood("unnamed-flood-3");
      const opened = saveFolders(M3);
      ok(opened.length === 1 && asBefore(opened[0], before3).length === 0, "⭐⭐ the first copies were still kept when the pool filled, the run being alive", opened);
      await pg3.sb.flushMapSaves(); await P.settle(50);
      ok(pg3.sb.pendingWrites.length === 0 && pg3.last().includes(opened[0]) && !/An earlier Save/.test(pg3.last()), "⭐⭐ the same Save clicked again names its own folder as its own", pg3.last().slice(-400));
      retypes(pg3, PIECES.slice(6, 7));
      await pg3.sb.flushMapSaves(); await P.settle(50);
      ok(!pg3.last().includes(opened[0]), "⭐ …and the Save after it does not name it again", pg3.last().slice(-300));
      // …and a folder that could take nothing has nothing to name: no sentence that stops at its colon
      const M4 = freshMod();
      breakFolder(M4);
      const pg4 = openPage(M4);
      retypes(pg4, PIECES.slice(0, 3));
      await pg4.sb.flushMapSaves(); await P.settle(50);
      flood("unnamed-flood-4");
      retypes(pg4, PIECES.slice(4, 5));
      await pg4.sb.flushMapSaves(); await P.settle(50);
      ok(pg4.sb.pendingWrites.length === 0 && !/An earlier Save/.test(pg4.last()), "⭐ a folder that could take none of a Save's copies is not named by the next one", pg4.last().slice(-300));
    }

    console.log("\n-- ⛔ 14. A COPY OF A FILE THE SAVE NEVER CHANGED IS NOT A FILE IT CHANGED (review of the T39 merge, S-stopped-save-copies) --");
    {
      // safe-write.js alone. A run writes a.txt as text, b.bmp as bytes (an asset write, which no text write notes), deletes c.txt (as a
      // Save deletes a state file), writes e.bin as bytes of the same size and puts its old time back on it (a copy keeps its source's
      // time), and has d.txt's write refused: d.txt is read-only, so its copy is taken and then the rename fails, "Nothing was changed".
      // The stop opens the run's folder, which takes every first copy, d.txt's among them.
      const R = path.join(process.env.HOI4_MODS_ROOT, "refused"), D = path.join(ROOT, "refused-run");
      const A = write(R, "map/a.txt", "a\n"), B = write(R, "map/b.bmp", Buffer.from([1, 2, 3, 4])), C = write(R, "map/c.txt", "c\n"), Dd = write(R, "map/d.txt", "d\n");
      const E = write(R, "map/e.bin", Buffer.from([5, 6, 7, 8])), T = new Date("2020-01-01T00:00:00Z");
      fs.utimesSync(E, T, T);
      fs.chmodSync(Dd, 0o444);
      const run = SW.beginSaveRun({ dir: D, root: R });
      let was = SW.useSaveRun(run), refused = "";
      try {
        SW.safeModWrite(A, "a, changed\n", "map-test");
        SW.backupAssetBeforeOverwrite(B, "map-test"); fs.writeFileSync(B, Buffer.from([4, 3, 2, 1]));
        SW.backupAssetBeforeOverwrite(C, "map-test"); fs.unlinkSync(C);
        SW.backupAssetBeforeOverwrite(E, "map-test"); fs.writeFileSync(E, Buffer.from([8, 7, 6, 5])); fs.utimesSync(E, T, T);
        try { SW.safeModWrite(Dd, "d, changed\n", "map-test"); } catch (e) { refused = e.message; }
      } finally { SW.useSaveRun(was); }
      SW.openSaveRun(run);
      const c1 = SW.saveRunCopies(run);
      ok(/read-only/.test(refused) && fs.readFileSync(Dd, "utf8") === "d\n" && fs.existsSync(path.join(D, "map/d.txt")) && filesOf(D).size === 5 && fs.statSync(E).mtimeMs === T.getTime(),
        "THE CONTROL: d.txt's write was refused after its copy was taken, e.bin has its old size and time, and the folder the stop opened holds all five first copies", { refused, folder: [...filesOf(D).keys()], eTime: fs.statSync(E).mtimeMs });
      ok(c1 && c1.files === 4 && c1.dir === D && c1.failed === 0 && c1.stay === 0,
        "⭐⭐⭐ the run says it changed 4 files (a.txt written, b.bmp written as bytes, c.txt deleted, e.bin's bytes changed under its old time), not d.txt, which is as it was", c1);
      fs.chmodSync(Dd, 0o644);
      was = SW.useSaveRun(run);
      try { SW.safeModWrite(Dd, "d, changed\n", "map-test"); } finally { SW.useSaveRun(was); }
      const c2 = SW.saveRunCopies(run);
      ok(c2 && c2.files === 5 && fs.readFileSync(path.join(D, "map/d.txt"), "utf8") === "d\n", "⭐⭐ …and once the same Save has written it, it is one of the files it changed, its copy as it was before", c2);
      SW.beginSaveRun({ root: R });
    }
    {
      // …and through the page, the review's click: the Save stops at a write of a state file that is read-only
      const setState = (sid) => ["/api/map/set-state", { stateId: sid, nameKey: `STATE_${sid}`, fields: { manpower: "4321" } }];
      const isle = (M, sid) => path.join(M, "history", "states", `${sid}-Isle.txt`);
      // at its first write: nothing was changed, so no folder is made and none is claimed, as for a write the server refuses outright (8)
      const M = freshMod(), before = filesOf(M);
      fs.chmodSync(isle(M, 2), 0o444);
      const pg = openPage(M);
      pg.sb.queueWrite(...setState(2));
      await pg.sb.flushMapSaves(); await P.settle(50);
      const line1 = pg.last();
      fs.chmodSync(isle(M, 2), 0o644);
      ok(/Save stopped at step 1\b/.test(line1) && /read-only/.test(line1) && [...filesOf(M)].every(([rel, s]) => before.get(rel) === s),
        "THE CONTROL: the Save stops at its first write, the state file read-only, and the mod is byte for byte as it was", line1.slice(0, 220));
      ok(!/Changed \d+ files?\./.test(line1) && !/saved first/.test(line1) && saveFolders(M).length === 0,
        "⭐⭐⭐ …and the line says it changed no file and kept no copy, where it said \"This Save: Changed 1 file. A copy of it was saved first\" of the file it never changed", { line: line1.slice(-400), folders: saveFolders(M).length });
      // …nor by the next Save of the mod, once something else has filled the pool and that copy has gone into a folder (13): the folder
      // holds a file the stopped Save never changed, so there is no "earlier Save" to name
      for (let i = 0; i < MAX_BACKUP_FILES + 20; i++) SW.safeModWrite(write(path.join(process.env.HOI4_MODS_ROOT, "refused-flood"), `map/flood/${i}.txt`, `flood ${i}\n`), "changed\n", "map-test");
      const opened = saveFolders(M);
      const pgB = openPage(M);   // a new page: a new Save, as after a restart
      pgB.sb.queueWrite(...setState(3));
      await pgB.sb.flushMapSaves(); await P.settle(50);
      ok(opened.length === 1 && filesOf(opened[0]).size === 1 && pgB.sb.pendingWrites.length === 0,
        "THE CONTROL: the pool filled, so the stopped Save's copy of the file it never changed went into a folder, and the next Save wrote what it was given", { opened: opened.length, left: pgB.sb.pendingWrites.length });
      ok(!/An earlier Save/.test(pgB.last()) && !pgB.last().includes(opened[0] || "\u0000"), "⭐⭐ …which that Save's line does not name as an earlier Save's changes", pgB.last().slice(-400));
      // a write that lands before the refused one: one file changed, and the line says one
      const M2 = freshMod();
      fs.chmodSync(isle(M2, 2), 0o444);
      const pg2 = openPage(M2);
      pg2.sb.queueWrite(...setState(1)); pg2.sb.queueWrite(...setState(2));
      await pg2.sb.flushMapSaves(); await P.settle(50);
      const line2 = pg2.last(), f2 = saveFolders(M2);
      fs.chmodSync(isle(M2, 2), 0o644);
      ok(/Save stopped at step 2\b/.test(line2) && f2.length === 1, "THE CONTROL: state 1 is written, state 2's file is read-only, and the stop opens the Save's folder", { line: line2.slice(0, 200), folders: f2.length });
      ok(/Changed 1 file\. A copy of it was saved first/.test(line2) && line2.includes(f2[0]), "⭐⭐⭐ …which the line names for the ONE file the Save changed, where it said 2", line2.slice(-400));
      await pg2.sb.flushMapSaves(); await P.settle(50);
      const line3 = pg2.last();
      ok(pg2.sb.pendingWrites.length === 0 && /Changed 2 files\. A copy of all of them was saved first/.test(line3) && line3.includes(f2[0]),
        "⭐⭐ …and the same Save clicked again, state 2 written now, says both, in the same folder", line3.slice(-400));
      // …and with the folder broken (12), a copy it could not take of a file the Save never changed is no file it changed whose only copy
      // is in the pool
      const M3 = freshMod();
      breakFolder(M3);
      fs.chmodSync(isle(M3, 2), 0o444);
      const pg3 = openPage(M3);
      pg3.sb.queueWrite(...setState(1)); pg3.sb.queueWrite(...setState(2));
      await pg3.sb.flushMapSaves(); await P.settle(50);
      const line4 = pg3.last();
      fs.chmodSync(isle(M3, 2), 0o644);
      ok(/Save stopped at step 2\b/.test(line4) && /files? it changed could not be copied outside your mod/.test(line4), "THE CONTROL: the Save's folder cannot be made, state 1 is written, state 2's file is read-only, and the line says what the pool alone holds", line4.slice(-500));
      ok(/⚠ This Save: 1 file it changed could not be copied outside your mod/.test(line4), "⭐⭐ …which it counts as the ONE file the Save changed, not the one it never changed", line4.slice(-500));
    }
  } catch (e) {
    ok(false, "the Saves ran", String((e && e.stack) || e).slice(0, 700));
  } finally {
    if (server) await new Promise((r) => server.close(r));
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
    console.log(`\n${fail ? "FAILED" : "PASSED"} ${pass}/${pass + fail}`);
    process.exit(fail ? 1 : 0);
  }
})();
