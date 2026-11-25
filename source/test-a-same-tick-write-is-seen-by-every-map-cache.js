// ⛔ #a-same-tick-write-keeps-its-stamp — EVERY MAP CACHE SEES A WRITE OF NOVA'S, EVEN ONE INSIDE THE CLOCK TICK OF THE WRITE BEFORE.
//
// A map cache is kept while what stat says of its files has not moved, and on Windows that moves only as far as the clock tick
// and the file id let it. A bitmap is the same size whatever is painted on it, a definition row retyped "land" → "lake" is the
// same size, and a second write landing inside the tick of the first keeps both times; a rename-over's new file id is all that
// was left to tell them apart, and Node reports it as a double (testlib-held-clock.js). test-a-renamed-state-keeps-its-regions-
// name.js failed 8 runs in 10 on exactly that (batch 3b). Every write Nova makes is now counted in safe-write.js
// (novaWritesTo), and every in-memory stamp in map-data.js adds that count for its files.
//
// Pinned, one section per cache, on a small world: a game, a dependency carrying the whole map (the layer below — Nova writes
// it when the modder opened it), and an add-on that owns its provinces.bmp, definition.csv and heightmap.bmp with one province
// drowned. Each section asks its question once, asks again and checks the answer was CACHED (the file is not read again —
// without that this test could not tell a cache that works from one that never kept anything), then holds the clock on the
// file and its folder, rewrites the file through safeModWrite at the same size, checks stat sees nothing of it, and asks
// again: the file must be read again. test-every-in-memory-stamp-counts-novas-own-writes.js keeps the list of these stamps
// derived from the source.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const dds = require("./dds-codec.js");
const { holdTheClock } = require("./testlib-held-clock.js");

let pass = 0, fail = 0;
const ok = (c, m, x) => {
  if (c) { pass++; console.log("  ok   " + m); }
  else { fail++; console.log("  FAIL " + m + (x !== undefined ? "   -> " + JSON.stringify(x).slice(0, 400) : "")); }
};
const roots = [];
const tmp = (tag) => { const d = fs.mkdtempSync(path.join(os.tmpdir(), "nova-same-tick-map-" + tag + "-")); roots.push(d); return d; };
const write = (dir, rel, body) => { const p = path.join(dir, ...rel.split("/")); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, body); return p; };

// ── the bitmaps ──────────────────────────────────────────────────────────────────────────────────────────────
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
/** An uncompressed one-level DDS painted by fn(x, y) → [r, g, b, a]. */
function makeDds(W, H, fn) {
  const h = Buffer.alloc(128);
  h.write("DDS ", 0, "latin1"); h.writeUInt32LE(124, 4); h.writeUInt32LE(0x1007 | 0x8, 8);
  h.writeUInt32LE(H, 12); h.writeUInt32LE(W, 16); h.writeUInt32LE(W * 4, 20); h.writeUInt32LE(1, 28); h.writeUInt32LE(32, 76);
  h.writeUInt32LE(0x41, 80); h.writeUInt32LE(32, 88); h.writeUInt32LE(0xff0000, 92); h.writeUInt32LE(0xff00, 96); h.writeUInt32LE(0xff, 100); h.writeUInt32LE(0xff000000, 104);
  h.writeUInt32LE(0x1000, 108);
  const buf = Buffer.alloc(128 + W * H * 4); h.copy(buf);
  const hdr = dds.parseDdsHeader(buf), rgba = new Uint8Array(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) rgba.set(fn(x, y), (y * W + x) * 4);
  dds.patchDdsLevel(buf, hdr, 0, rgba, new Uint8Array(W * H).fill(1));
  return buf;
}

// ── the world: 128 x 64, sea on the left, land on the right (the world-textures test's map) ─────────────────────
//   1 sea x < 48 · 2 land 48..63, the coast (the add-on drowns it) · 3 plains · 4 urban, a city · 5 a lagoon · 6 desert · 7 an islet
const W = 128, H = 64, TW = 64, TH = 32, MW = 32, MH = 12;
const COL = { 1: [0, 0, 200], 2: [200, 0, 0], 3: [0, 200, 0], 4: [200, 200, 0], 5: [0, 100, 200], 6: [100, 50, 0], 7: [50, 50, 50] };
const provAt = (x, y) => (x >= 20 && x < 24 && y >= 50 && y < 54 ? 7 : x >= 76 && x < 116 && y >= 6 && y < 34 ? 5 : x < 48 ? 1 : x < 64 ? 2 : y < 44 ? 3 : x >= 96 ? 4 : 6);
const isLand = (p) => p !== 1 && p !== 5;
const DEF = {
  1: "1;0;0;200;sea;false;ocean;0", 2: "2;200;0;0;land;true;plains;1", 3: "3;0;200;0;land;true;plains;1", 4: "4;200;200;0;land;false;urban;1",
  5: "5;0;100;200;sea;false;ocean;0", 6: "6;100;50;0;land;false;desert;1", 7: "7;50;50;50;land;true;plains;1",
};
const defCsv = (over = {}) => ["0;0;0;0;land;false;unknown;0", ...[1, 2, 3, 4, 5, 6, 7].map((id) => over[id] || DEF[id])].join("\n") + "\n";
const IDX = { plains: 0, desert: 7, urban: 13, ocean: 15 };
const TERRAIN = ["categories = {", "  plains = { color = { 200 200 100 } }", "  urban = { color = { 120 110 100 } }", "  desert = { color = { 210 180 110 } }",
  "  ocean = { color = { 0 0 200 } is_water = yes }", "}", "terrain = {", "  plains = { type = plains color = { 0 } }", "  desert = { type = desert color = { 7 } }",
  "  urban = { type = urban color = { 13 } spawn_city = yes }", "  ocean = { type = ocean color = { 15 } }", "}", ""].join("\n");
const TEXTURES = ["colormap_rgb_cityemissivemask_a.dds", "colormap_water_0.dds", "colormap_water_1.dds", "colormap_water_2.dds", "fow_rgb_waterspec_a.dds"];
const box = (name, x, z) => [`\tposteffect_volume = {`, `\t\tname = ${name}`, `\t\tposteffect_values_day = green`, `\t\tposteffect_values_night = green_night`,
  `\t\tposition = { ${x}.0 300.0 ${z}.0 }`, `\t\tsize = { 12.0 800.0 12.0 }`, `\t\tfade_distance = 75.0`, `\t}`];
const PFX = ["posteffect_values = {", "\tname = default", "}", "posteffect_volumes = {", ...box("Coast", 56, 40), ...box("Plains", 80, 50), "}", ""].join("\n");
// a unit-stack row per land province: the Standstill slot, the default slot and the victory-point marker 3 px east of it
const centre = { 2: [56, 32], 3: [70, 20], 4: [110, 54], 6: [80, 54], 7: [22, 52] };
const unitstacks = () => Object.entries(centre).map(([p, [x, y]]) => [0, 9, 38].map((t) => `${p};${t};${(x + (t === 38 ? 3 : 0)).toFixed(2)};9.50;${(H - 1 - y).toFixed(2)};0.00;0.00`).join("\n")).join("\n") + "\n";
const buildings = () => Object.entries(centre).map(([p, [x, y]]) => `1;arms_factory;${x}.00;11.00;${H - 1 - y}.00;0.00;0`).join("\n") + "\n";
const stateFile = (id, provs, vp) => `state={\n\tid=${id}\n\tname="STATE_${id}"\n\tmanpower=1000\n\tstate_category=rural\n\tprovinces={ ${provs.join(" ")} }\n\thistory={\n\t\towner=AAA\n\t\tvictory_points={ ${vp} 5 }\n\t}\n}\n`;

function makeWorld(tag) {
  const root = tmp(tag), game = path.join(root, "game"), dep = path.join(root, "dep"), mod = path.join(root, "mod");
  write(game, "hoi4.exe", "not really an exe");
  write(dep, "descriptor.mod", 'name="Below"\nsupported_version="1.*"\n');
  write(dep, "map/provinces.bmp", bmp24(W, H, (x, y) => COL[provAt(x, y)]));
  write(dep, "map/definition.csv", defCsv());
  write(dep, "map/terrain.bmp", bmp8(W, H, (x, y) => { const p = provAt(x, y); return !isLand(p) ? IDX.ocean : p === 4 ? IDX.urban : p === 6 ? IDX.desert : IDX.plains; }));
  write(dep, "map/heightmap.bmp", bmp8(W, H, (x, y) => (isLand(provAt(x, y)) ? 106 : 89)));
  write(dep, "map/trees.bmp", bmp8(W / 4, H / 4, (x, y) => (isLand(provAt(4 * x, 4 * y)) ? 3 : 0)));
  write(dep, "map/unitstacks.txt", unitstacks());
  write(dep, "map/buildings.txt", buildings());
  write(dep, "common/terrain/00_terrain.txt", TERRAIN);
  for (const n of TEXTURES) write(dep, "map/terrain/" + n, makeDds(n.includes("water_1") ? TW / 2 : n.includes("water_2") ? TW / 4 : TW, n.includes("water_1") ? TH / 2 : n.includes("water_2") ? TH / 4 : TH,
    (X, Y) => (isLand(provAt(2 * X, 2 * Y)) ? [150, 120, 60, 0] : [79, 102, 141, 0])));
  write(dep, "gfx/minimap/minimap.dds", makeDds(MW, MH, (u, v) => (isLand(provAt(Math.floor((u + 0.5) * W / MW), Math.floor((v + 0.5) * H / MH))) ? [170, 162, 147, 255] : [84, 78, 66, 255])));
  write(dep, "gfx/posteffect_volumes.txt", PFX);
  write(dep, "history/states/1-Coast.txt", stateFile(1, [2, 3], 3));
  write(dep, "history/states/2-City.txt", stateFile(2, [4, 6], 4));
  write(dep, "history/states/3-Islet.txt", stateFile(3, [7], 7));
  // the add-on: its own copy of the map with the coast (2) under the sea
  write(mod, "descriptor.mod", 'name="Above"\nsupported_version="1.*"\n');
  write(mod, "map/provinces.bmp", bmp24(W, H, (x, y) => COL[provAt(x, y)]));
  write(mod, "map/definition.csv", defCsv({ 2: "2;200;0;0;sea;false;ocean;0" }));
  write(mod, "map/heightmap.bmp", bmp8(W, H, (x, y) => { const p = provAt(x, y); return isLand(p) && p !== 2 ? 106 : 89; }));
  return { root, game, dep, mod, ctx: { modRoot: mod, gameRoot: game, dependencyRoots: [dep] } };
}

// ── the reads, counted by file ──────────────────────────────────────────────────────────────────────────────
const keyOf = (p) => { const r = path.resolve(String(p)); return process.platform === "win32" ? r.toLowerCase() : r; };
const reads = new Map();
const realRead = fs.readFileSync;
fs.readFileSync = function readFileSync(p) {
  try { if (typeof p === "string" || Buffer.isBuffer(p) || p instanceof URL) { const k = keyOf(p); reads.set(k, (reads.get(k) || 0) + 1); } } catch (_) { /* an fd */ }
  return realRead.apply(fs, arguments);
};
const readsOf = (f) => reads.get(keyOf(f)) || 0;
const seen = (p) => { const s = fs.statSync(p); return [s.size, s.mtimeMs, s.ctimeMs, s.birthtimeMs, s.ino].join(":"); };

const HOME = tmp("home");
process.env.NOVA_HOME_DIR = HOME;
if (!process.env.NOVA_APP_DATA_DIR) { process.env.APPDATA = path.join(HOME, "appdata"); process.env.NOVA_APP_DATA_DIR = process.env.APPDATA; }
const md = require("./map-data.js");
const { safeModWrite } = require("./safe-write.js");

/** The one shape every section takes (see the header). `rewrite(bytes)` → the same file's new bytes, the same length. */
async function sameTick(name, file, ask, rewrite, answers = {}) {
  const rel = path.relative(path.dirname(path.dirname(path.dirname(file))), file).replace(/\\/g, "/");
  // how many times one question reads the file: a question the cache answers reads it fewer times than a cold one (some
  // readers read their file once more every time, outside the cache — the repaints read the textures they would patch).
  // Each section's world is its own, and nothing asks before the first question here, so that one is cold.
  let answer;
  const readsFor = () => { const n = readsOf(file); answer = ask(); return readsOf(file) - n; };
  const cold = readsFor();
  if (answers.before) answers.before(answer);
  const warm = readsFor();
  ok(cold > warm, `(${name}: the second question reads ${rel} ${warm}x, the first ${cold}x — the answer is cached)`, { cold, warm });
  const before = realRead(file), next = rewrite(Buffer.from(before));
  const release = holdTheClock([file, path.dirname(file)]);
  try {
    const s0 = seen(file), d0 = seen(path.dirname(file));
    safeModWrite(file, next, "test-same-tick");
    const wrote = !realRead(file).equals(before) && realRead(file).length === before.length;
    ok(wrote && seen(file) === s0 && seen(path.dirname(file)) === d0, `(${name}: ${rel} rewritten by Nova at the same size, and stat sees nothing of it)`);
    await new Promise((r) => setImmediate(r));   // a layer below is stamped once per turn of the event loop
    const after = readsFor();
    ok(cold > warm && after === cold, `⭐⭐ ${name}: …and after it, the next question reads ${rel} as the first did (${cold}x), not from the cache`, { cold, warm, after });
    if (answers.after) answers.after(answer);
  } finally { release(); }
}
/** Bytes with every `from` in the text replaced by `to` (same length) — at least once. */
const swap = (from, to) => (b) => {
  const s = b.toString("latin1");
  if (from.length !== to.length || !s.includes(from)) throw new Error(`fixture: "${from}" not in the file, or not "${to}"'s length`);
  return Buffer.from(s.split(from).join(to), "latin1");
};
/** A bitmap with its last pixel byte changed. */
const lastByte = (b) => { const o = Buffer.from(b); o[o.length - 1] = o[o.length - 1] === 7 ? 9 : 7; return o; };
/** A .mesh holding only its aabb, as meshAabb reads one: '!', the name's length, the name, 'f', an int32 count and the floats. */
function meshFile(min, max) {
  const prop = (name, v) => { const b = Buffer.alloc(2 + name.length + 1 + 4 + 4 * v.length); b[0] = 0x21; b[1] = name.length; b.write(name + "f", 2, "latin1"); b.writeInt32LE(v.length, 3 + name.length); v.forEach((f, k) => b.writeFloatLE(f, 7 + name.length + 4 * k)); return b; };
  return Buffer.concat([Buffer.from("@@b@", "latin1"), Buffer.from("[aabb", "latin1"), prop("min", min), prop("max", max)]);
}

(async () => {
  try {
    console.log("\n-- the layers below: the stable-root stamp (folders and files) and the replace_path memo --");
    {
      const w = makeWorld("stable");
      const vps = () => md.buildMapModel({ ...w.ctx, cacheStableLayers: true }).states.map((s) => (s.victoryPoints || []).map((v) => v.province + "=" + v.value).join(" ")).join(",");
      await sameTick("a dependency's history/states (a folder: size 0, one id for ever)", path.join(w.dep, "history", "states", "3-Islet.txt"), vps, swap("victory_points={ 7 5 }", "victory_points={ 7 6 }"), {
        before: (a) => ok(a === "3=5,4=5,7=5", "(the fixture: the islet's victory point is worth 5 below)", a),
        after: (a) => ok(a === "3=5,4=5,7=6", "⭐ …and the answer is the new file's: 6", a) });
      // ⛔ …and a dependency asked for by ANOTHER SPELLING of its path than the one Nova wrote it under — the launcher's .mod path= and
      // a folder picked in a dialog, or the OneDrive and the plain Documents spellings. On Windows that is the same folder, so it is
      // the same count (safe-write.js novaWriteKey folds the case): asked in capitals here, written as it was made.
      if (process.platform === "win32") {
        const ws = makeWorld("spelling"), DEP = ws.dep.toUpperCase();
        ok(DEP !== ws.dep && fs.existsSync(path.join(DEP, "history", "states", "3-Islet.txt")), "(the fixture: the dependency's path in capitals is another spelling of the same folder)", DEP);
        const vpsAsSpelt = () => md.buildMapModel({ ...ws.ctx, dependencyRoots: [DEP], cacheStableLayers: true }).states.map((s) => (s.victoryPoints || []).map((v) => v.province + "=" + v.value).join(" ")).join(",");
        await sameTick("a dependency's history/states asked for in another spelling of its path", path.join(ws.dep, "history", "states", "3-Islet.txt"), vpsAsSpelt, swap("victory_points={ 7 5 }", "victory_points={ 7 6 }"), {
          before: (a) => ok(a === "3=5,4=5,7=5", "(the fixture: the islet's victory point is worth 5 below)", a),
          after: (a) => ok(a === "3=5,4=5,7=6", "⭐ …and the answer is the new file's: 6", a) });
      } else console.log("  (another spelling of a path is another folder here: that part is Windows')");
      // …over an add-on of its own that owns no map, so every province comes from the dependency's cached layer
      const w1 = makeWorld("stablefile"), bare = path.join(w1.root, "bare");
      write(bare, "descriptor.mod", 'name="Bare"\nsupported_version="1.*"\n');
      const typeOf6 = () => (md.buildMapModel({ modRoot: bare, gameRoot: w1.game, dependencyRoots: [w1.dep], cacheStableLayers: true }).provinces.find((p) => p.id === 6) || {}).type;
      await sameTick("a dependency's map/definition.csv", path.join(w1.dep, "map", "definition.csv"), typeOf6, swap("6;100;50;0;land;false;desert;1", "6;100;50;0;lake;false;desert;1"), {
        before: (a) => ok(a === "land", "(the fixture: the dependency's province 6 is land)", a),
        after: (a) => ok(a === "lake", "⭐ …and the answer is the new file's: a lake", a) });
      const w2 = makeWorld("replace");
      write(w2.mod, "descriptor.mod", 'name="Above"\nsupported_version="1.*"\nreplace_path="history/states"\n');
      write(w2.mod, "history/states/9-Own.txt", stateFile(9, [3], 3));
      const ids = () => md.buildMapModel({ ...w2.ctx, cacheStableLayers: true }).states.map((s) => s.id).sort((a, b) => a - b).join(",");
      await sameTick("the add-on's own descriptor.mod (replace_path)", path.join(w2.mod, "descriptor.mod"), ids, swap('replace_path="history/states"', 'replace_path="history/statez"'), {
        before: (a) => ok(a === "9", "(the fixture: the add-on's replace_path drops the dependency's states)", a),
        after: (a) => ok(a === "1,2,3,9", "⭐ …and the answer is the new file's: the dependency's states load again", a) });
    }

    console.log("\n-- the add-on's own map: coast walk, province extents, the pixel lookup, the texture grid --");
    {
      const w = makeWorld("coast");
      const model = () => md.buildMapModel({ ...w.ctx, cacheStableLayers: true });
      const bmp = path.join(w.mod, "map", "provinces.bmp");
      await sameTick("the coast walk (coastWalkKey)", bmp, () => md.landProvincesTouchingSea({ ...w.ctx, model: model() }), lastByte);
      const w2 = makeWorld("pixels");
      await sameTick("the province pixel lookup (provincePixelStats)", path.join(w2.mod, "map", "provinces.bmp"), () => md.provincePixelStats(w2.ctx), lastByte);
      const w3 = makeWorld("extents");
      await sameTick("the province extents (stateBuildingAnchor)", path.join(w3.mod, "map", "provinces.bmp"), () => md.stateBuildingAnchor({ ...w3.ctx, provinces: [3] }), lastByte);
      const w4 = makeWorld("grid");
      await sameTick("the texture colour grid (worldTexturesOutOfStep)", path.join(w4.mod, "map", "provinces.bmp"), () => md.worldTexturesOutOfStep(w4.ctx), lastByte);
      // …and the grid itself, which the map before a write is counted from: texel (31, 10) is four pixels of the coast (land
      // here), painted over with the sea's colour
      const w7 = makeWorld("classes");
      const typeOf = new Map(Object.entries(COL).map(([id, [r, g, b]]) => [((r << 16) | (g << 8) | b) >>> 0, isLand(+id) ? "land" : "sea"]));
      const texel = 10 * (W / 2) + 31, nothingCrossed = { mask: new Uint8Array(W * H) };
      const toSea = (b) => { const o = Buffer.from(b); for (const [x, y] of [[62, 20], [63, 20], [62, 21], [63, 21]]) { const p = 54 + (H - 1 - y) * W * 3 + x * 3; o[p] = COL[1][2]; o[p + 1] = COL[1][1]; o[p + 2] = COL[1][0]; } return o; };
      await sameTick("the texture colour grid itself (textureColourGrid, the map before a write)", path.join(w7.mod, "map", "provinces.bmp"), () => md.texelClassBeforeWrite(path.join(w7.mod, "map", "provinces.bmp"), typeOf, nothingCrossed).classAt(texel), toSea, {
        before: (c) => ok(c === 1, "(the fixture: the texel is land)", c),
        after: (c) => ok(c === 2, "⭐ …and after it is painted over, water", c) });
      const w5 = makeWorld("minimap");
      await sameTick("the minimap's out-of-step answer (minimapOutOfStep)", path.join(w5.mod, "map", "provinces.bmp"), () => md.minimapOutOfStep(w5.ctx), lastByte);
      const w6 = makeWorld("tint");
      await sameTick("the tint boxes' out-of-step answer (posteffectBoxesOutOfStep)", path.join(w6.dep, "gfx", "posteffect_volumes.txt"), () => md.posteffectBoxesOutOfStep(w6.ctx), swap("{ 12.0 800.0 12.0 }", "{ 12.0 800.0 14.0 }"));
    }

    console.log("\n-- the add-on's heightmap: the old ground, the drowned coast, a building's anchor height --");
    {
      const w = makeWorld("oldground");
      await sameTick("the models on the old ground (findModelsOnTheOldGround)", path.join(w.mod, "map", "heightmap.bmp"), () => md.findModelsOnTheOldGround(w.ctx), lastByte);
      const w2 = makeWorld("drowned");
      const m2 = md.buildMapModel({ ...w2.ctx, cacheStableLayers: true });
      await sameTick("the drowned coast (findDrownedCoast)", path.join(w2.mod, "map", "heightmap.bmp"), () => md.findDrownedCoast({ ...w2.ctx, model: m2 }), lastByte);
      const w3 = makeWorld("height");
      await sameTick("the heightmap a building anchor reads (heightmapForReading)", path.join(w3.mod, "map", "heightmap.bmp"), () => md.stateBuildingAnchor({ ...w3.ctx, provinces: [3] }), lastByte);
    }

    console.log("\n-- the layer below's map: unit layout, cities, latitude, trees, the colours the textures and minimap learn --");
    {
      const w = makeWorld("units");
      await sameTick("the unit layout beneath (unitLayoutBeneath, its unitstacks.txt)", path.join(w.dep, "map", "unitstacks.txt"), () => md.unitLayoutBeneath(w.ctx), swap("3;38;73.00", "3;38;74.00"));
      const w1 = makeWorld("unittypes");
      await sameTick("…its definition.csv (definitionTypesIn)", path.join(w1.dep, "map", "definition.csv"), () => md.unitLayoutBeneath(w1.ctx), swap("6;100;50;0;land;false;desert;1", "6;100;50;0;lake;false;desert;1"));
      const w2 = makeWorld("cities");
      await sameTick("the city ground beneath (cityGroundBeneath)", path.join(w2.dep, "map", "terrain.bmp"), () => md.cityGroundBeneath(w2.ctx), lastByte);
      const w3 = makeWorld("latitude");
      await sameTick("the terrain mix by latitude (terrainMixByLatitude)", path.join(w3.dep, "map", "provinces.bmp"), () => md.terrainMixByLatitude(w3.ctx), lastByte);
      const w4 = makeWorld("trees");
      const t = path.join(w4.dep, "map", "trees.bmp");
      await sameTick("the trees sampled by terrain (sampleTreesByTerrain)", t, () => md.sampleTreesByTerrain(t, path.join(w4.dep, "map", "provinces.bmp"), path.join(w4.dep, "map", "definition.csv")), lastByte);
      const w5 = makeWorld("learn");
      await sameTick("the colours the world textures learn below (repaintWorldTextures, a dry run)", path.join(w5.dep, "map", "terrain", TEXTURES[0]), () => md.repaintWorldTextures({ ...w5.ctx, dryRun: true }), lastByte);
      const w6 = makeWorld("minilearn");
      await sameTick("the colours the minimap learns below (repaintMinimap, a dry run)", path.join(w6.dep, "gfx", "minimap", "minimap.dds"), () => md.repaintMinimap({ ...w6.ctx, dryRun: true }), lastByte);
    }

    console.log("\n-- the scripts: a reference to a state the world lost --");
    {
      const w = makeWorld("script");
      write(w.mod, "common/decisions/lost.txt", "lost_decisions = {\n\tlost_one = {\n\t\tcomplete_effect = {\n\t\t\t3 = { add_core_of = ROOT }\n\t\t}\n\t}\n}\n");
      const f = path.join(w.mod, "common", "decisions", "lost.txt");
      const dead = () => md.deadScriptStateRefs(md.buildMapModel({ ...w.ctx, cacheStableLayers: true })).map((r) => r.stateId).join(",");
      await sameTick("the script files' state references (scriptStateLayers)", f, dead, swap("\t\t\t3 = {", "\t\t\t8 = {"), {
        before: (a) => ok(a === "", "(the fixture: state 3 exists, so the decision names no dead state)", a),
        after: (a) => ok(a === "8", "⭐ …and the answer is the new file's: state 8 is dead", a) });
      // #a-script-loads-an-army-later — the same record carries the orders of battle a script loads
      const w2 = makeWorld("scriptoob");
      write(w2.mod, "events/army.txt", 'army.1 = {\n\timmediate = {\n\t\tAAA = { load_oob = "AAA_first" }\n\t}\n}\n');
      const f2 = path.join(w2.mod, "events", "army.txt");
      const loads = () => [...md.scriptLoadedOobs(w2.mod, w2.game, [w2.dep]).keys()].join(",");
      await sameTick("the orders of battle a script loads (scriptLoadedOobs, the same record)", f2, loads, swap('"AAA_first"', '"AAA_other"'), {
        before: (a) => ok(a === "aaa_first", "(the fixture: the event loads AAA_first)", a),
        after: (a) => ok(a === "aaa_other", "⭐ …and the answer is the new file's: AAA_other", a) });
    }

    console.log("\n-- the model an airfield is judged by: a layer's gfx (airfieldReach) --");
    {
      // a dependency that draws its own airfield, as Old World Blues does: the entity in gfx/entities/buildings.asset, its pdxmesh in a
      // .gfx under gfx/models and the mesh's aabb. The entity's scale is rewritten at the same size, inside the tick of the read: the
      // reach is read again, at the new scale. Missing until merge-x's review (MX-R2): airfieldReach's stamp was size and time alone.
      const w = makeWorld("airfield");
      write(w.dep, "gfx/entities/buildings.asset", "entity = {\n\tname = \"building_air_base\"\n\tpdxmesh = \"dep_hangar\"\n\tscale = 1.0\n}\n");
      write(w.dep, "gfx/models/dep_hangar/dep_hangar.gfx", "objectTypes = {\n\tpdxmesh = {\n\t\tname = \"dep_hangar\"\n\t\tfile = \"gfx/models/dep_hangar/hangar.mesh\"\n\t}\n}\n");
      write(w.dep, "gfx/models/dep_hangar/hangar.mesh", meshFile([-1, 0, -1], [2, 1, 1]));
      const reach = () => JSON.stringify(md.airfieldReach(w.ctx));
      await sameTick("the model an airfield is judged by (airfieldReach, a layer's gfx/entities)", path.join(w.dep, "gfx", "entities", "buildings.asset"), reach, swap("scale = 1.0", "scale = 2.0"), {
        before: (a) => ok(a === JSON.stringify({ west: 1, east: 2, south: 1, north: 1 }), "(the fixture: the dependency's hangar at scale 1 reaches 1, 2, 1 and 1 px)", a),
        after: (a) => ok(a === JSON.stringify({ west: 2, east: 4, south: 2, north: 2 }), "⭐ …and the answer is the new file's: at scale 2, twice as far", a) });
    }

    console.log("\n-- which map files the add-on changed (modChangedMapFile) --");
    {
      const w = makeWorld("changed");
      const model = md.buildMapModel({ ...w.ctx, cacheStableLayers: true });
      await sameTick("whether the add-on changed map/definition.csv (fixUnitStacks, a dry run)", path.join(w.mod, "map", "definition.csv"),
        () => md.fixUnitStacks({ ...w.ctx, dryRun: true, model }), swap("3;0;200;0;land;true;plains;1", "3;0;200;0;land;true;plains;2"));
    }
  } catch (e) {
    fail++;
    console.log("  FAIL (threw) " + (e && e.stack || e));
  } finally {
    fs.readFileSync = realRead;
    for (const r of roots) { try { fs.rmSync(r, { recursive: true, force: true }); } catch (_) { /* temp */ } }
  }
  console.log(`\n${fail ? "FAILED" : "PASSED"} ${pass}/${pass + fail}`);
  process.exit(fail ? 1 : 0);
})();
