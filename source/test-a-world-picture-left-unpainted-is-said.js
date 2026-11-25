// ⛔ #a-world-picture-left-unpainted-is-said — WHEN THE WORLD'S COLOUR PICTURES WERE NOT REPAINTED, THE PAGE SAYS SO AND WHY.
//
// Every write that moves the coast — Delete map, an erase, a painted coastline, Generate land — repaints the five
// map/terrain pictures the game tints the world with (#the-air-map-still-shows-the-old-world), and the writer REFUSES
// rather than guesses: a picture of a size it cannot paint, no layer to learn its colours from. The refusal came back on
// the write's own answer (`heightmap.textures.reason`, or `.error` when a file could not be written) and nothing on the
// map page read it — heightmapNote reads only which files were copied in. On a copy of Old World Blues, Delete map then
// Generate land left 80,786 texels of new land in sea paint with nothing on screen to say so (reviews of fc219c6 and
// f6908c4: N5). The page now says it, in the modder's words, with the writer's own reason.
//
// Pinned through the real server and the page's own code (flushMapSaves, mapCrashGate, the Generate land click, all lifted
// out of public/map.js), on a small game that ships all five pictures, and mods that own its map: one whose pictures are
// drawn for a map half its size (the writer cannot paint them), one that inherits the game's (it can):
//   0. the writer's answers, read by the page's worldPicturesNote: a refusal is said, with its reason; a repaint is not;
//      a write with nothing of the mod's to repaint (a mod that inherits its map, pictures of its own with nothing crossed)
//      is not; a write that failed says which;
//   1. 💾 Save of a Delete map and of an erase on a mod whose pictures are drawn for another size of map: the final line
//      says the pictures were not repainted and why — and on a mod whose pictures the writer can paint, it does not. The
//      line shows three of a save's notes, and this Delete map makes four: the note stands with the write's notes on the
//      map's files, ahead of "The map is not blank", which repeats the Delete map dialog and whose states are in the popup;
//   2. 💾 Save of a painted coastline: the same;
//   3. 🌍 Generate land after Delete map (Old World Blues' own clicks): the same.
"use strict";

const fs = require("fs");
const path = require("path");
const L2 = require("./testlib-two-layer-map.js");
const world = L2.makeWorld("world-pictures-note");   // before server.js and map-data.js: they read HOI4_MODS_ROOT when they load
const P = require("./testlib-map-page.js");
const md = require("./map-data.js");
const dds = require("./dds-codec.js");
const { stripJsComments } = require("./testlib-strip-comments.js");
const { createApp } = require("./server.js");

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (ok || detail == null ? "" : "   -> " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 700)));
  if (!ok) fails.push(label);
};

// ── the five pictures, by the names the writer uses (derived from map-data.js, never typed in) ──────────────────────────
const MD_SRC = stripJsComments(fs.readFileSync(path.join(__dirname, "map-data.js"), "utf8"));
const wtBody = /const WORLD_TEXTURES = \{([^}]*)\}/.exec(MD_SRC);
const NAMES = wtBody ? Object.fromEntries([...wtBody[1].matchAll(/(\w+):\s*"([^"]+)"/g)].map((m) => [m[1], m[2]])) : {};

/** A one-level RGB32 DDS of W x H, painted by fn(x, y) → [r, g, b, a]. */
function rgb32Dds(W, H, fn) {
  const b = Buffer.alloc(128 + W * H * 4);
  b.write("DDS ", 0, "latin1"); b.writeUInt32LE(124, 4); b.writeUInt32LE(0x100f, 8); b.writeUInt32LE(H, 12); b.writeUInt32LE(W, 16);
  b.writeUInt32LE(W * 4, 20); b.writeUInt32LE(1, 28); b.writeUInt32LE(32, 76); b.writeUInt32LE(0x41, 80); b.writeUInt32LE(32, 88);
  b.writeUInt32LE(0xff0000, 92); b.writeUInt32LE(0xff00, 96); b.writeUInt32LE(0xff, 100); b.writeUInt32LE(0xff000000, 104); b.writeUInt32LE(0x1000, 108);
  const hdr = dds.parseDdsHeader(b);
  if (hdr.error) throw new Error("rgb32Dds: " + hdr.error);
  const rgba = new Uint8Array(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) rgba.set(fn(x, y), (y * W + x) * 4);
  dds.patchDdsLevel(b, hdr, 0, rgba, new Uint8Array(W * H).fill(1));
  return b;
}
const bmp8 = (W, H, fn) => {
  const rs = Math.floor((8 * W + 31) / 32) * 4, off = 54 + 1024, b = Buffer.alloc(off + rs * H);
  b.write("BM", 0, "ascii"); b.writeUInt32LE(b.length, 2); b.writeUInt32LE(off, 10); b.writeUInt32LE(40, 14);
  b.writeInt32LE(W, 18); b.writeInt32LE(H, 22); b.writeUInt16LE(1, 26); b.writeUInt16LE(8, 28); b.writeUInt32LE(rs * H, 34); b.writeUInt32LE(256, 46);
  for (let i = 0; i < 256; i++) { b[54 + i * 4] = i; b[54 + i * 4 + 1] = i; b[54 + i * 4 + 2] = i; }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) b[off + (H - 1 - y) * rs + x] = fn(x, y);
  return b;
};
const jit = (x, y, s) => { let v = (x * 73856093) ^ (y * 19349663) ^ (s * 83492791); v = Math.imul(v ^ (v >>> 13), 1274126177); return ((v ^ (v >>> 16)) >>> 0) % 5; };

// ── the game: testlib-two-layer-map's 256 x 256 map (sea 1 across the top, land 2-5 under it), with the terrain, the heights,
// the terrain table and the five pictures a real install ships — 128 x 128 texels, half of provinces.bmp ──
const MAP_W = 256, MAP_H = 256;
const isSea = (x, y) => L2.provAt(x, y) === 1;
const pictures = (W, H) => {
  const sea = (X, Y) => isSea(Math.floor((X + 0.5) * MAP_W / W), Math.floor((Y + 0.5) * MAP_H / H));
  return {
    colormap: rgb32Dds(W, H, (X, Y) => (sea(X, Y) ? [60 + jit(X, Y, 1), 110, 160, 0] : [150 + jit(X, Y, 2), 120, 60 + jit(X, Y, 3), 0])),
    water: rgb32Dds(W, H, (X, Y) => (sea(X, Y) ? [35 + jit(X, Y, 4), 59, 81, 255] : [60, 90, 40, 255])),
    fow: rgb32Dds(W, H, (X, Y) => (sea(X, Y) ? [90, 90, 90, 40 + jit(X, Y, 5)] : [140, 140, 140, 21])),
  };
};
const putPictures = (root, W, H) => {
  const p = pictures(W, H);
  L2.write(root, {
    [`map/terrain/${NAMES.colormap}`]: p.colormap, [`map/terrain/${NAMES.water0}`]: p.water, [`map/terrain/${NAMES.water1}`]: p.water,
    [`map/terrain/${NAMES.water2}`]: p.water, [`map/terrain/${NAMES.fow}`]: p.fow,
  });
};
const TERRAIN = ["categories = {", "  plains = { color = { 200 200 100 } }", "  ocean = { color = { 0 0 200 } is_water = yes }", "}",
  "terrain = {", "  plains = { type = plains color = { 0 } }", "  ocean = { type = ocean color = { 15 } }", "}", ""].join("\n");
const MAP_FILES = {
  "map/terrain.bmp": bmp8(MAP_W, MAP_H, (x, y) => (isSea(x, y) ? 15 : 0)),
  "map/heightmap.bmp": bmp8(MAP_W, MAP_H, (x, y) => (isSea(x, y) ? 89 : 106)),
};
L2.write(world.GAME, { ...MAP_FILES, "common/terrain/00_terrain.txt": TERRAIN });
putPictures(world.GAME, MAP_W / 2, MAP_H / 2);

/** A mod that owns the game's map. `pictures`: "wrong" — its five pictures its own, drawn for a map half the size (each 64 x 64,
 *  not 128 x 128: the writer cannot paint them); "own" — its own, of the right size; none — the game's, inherited. */
let nMod = 0;
function makeMod(name, { pictures: kind = null } = {}) {
  const mod = world.mod(`${name} ${++nMod}`, {
    "map/provinces.bmp": fs.readFileSync(path.join(world.GAME, "map", "provinces.bmp")),
    "map/definition.csv": fs.readFileSync(path.join(world.GAME, "map", "definition.csv")),
    ...MAP_FILES,
  });
  if (kind === "wrong") putPictures(mod, MAP_W / 4, MAP_H / 4);
  if (kind === "own") putPictures(mod, MAP_W / 2, MAP_H / 2);
  return mod;
}

// ── the page's code ────────────────────────────────────────────────────────────────────────────────────────────────────
const FLUSH = [
  ["const STATE_ID_FIELDS = ", "\n"], "function orphanedQueuedWrites(writes)", "function emptyNewStateWrites(writes, stateById)",
  "function markSaveBoundary", "async function mapCrashGate", "function queueWrite(url, body, meta)", ["async function flushMapSaves", "} finally { if (btn) btn.disabled = false; updateSaveButton(); }\n  }"],
];
const noteOf = (() => { try { return P.runPage(["function worldPicturesNote("]).sb.worldPicturesNote; } catch (e) { return null; } })();

/** 💾 Save through the page's own flushMapSaves: `writes` ([url, body] each) queued through the page's own queueWrite, `paint` the painted pixels. Returns
 *  every status line, the final one, and each write's answer from the real server. */
async function save(srv, mod, writes, paint = []) {
  const answers = [];
  const page = P.runPage(FLUSH, {
    console, JSON,
    pendingWrites: [], paintDiff: new Map(paint.map((d) => [d.x + "," + d.y, d])),
    stateById: new Map(), model: { states: [] },
    stagedRiverEdits: [], riversShow: false, undoStack: [], redoStack: [], historyLabels: [], saveGeneration: 0,
    baseImageData: null, baseImageDataPristine: null,
    setMapDirty: () => {}, updateSaveButton: () => {}, modPath: () => mod,
    isVanillaTarget: () => false, problemsPanelOpen: () => false, refreshProblems: () => {}, renderCheckpoints: () => {},
    buildPidGrid: () => {}, computeCentroids: () => {}, recolorAll: () => {}, draw: () => {}, loadRiversOverlay: () => {},
    stateFormDirty: () => false, stateFormBaseline: null, stageStateWrite: () => {},
    remapQueuedStateId: () => {}, remapLocalStateId: () => {},
    adoptMergeRegions: () => {}, openMapErrorsModal: () => {}, saveMapBackup: () => {}, updateUndoButtons: () => {},
    fetch: async (url, opts) => {
      const r = await fetch(srv.base + url, opts);
      if (String(url).indexOf("/api/map/validate") !== 0) { try { answers.push({ url, res: await r.clone().json() }); } catch (_) {} }
      return r;
    },
  });
  for (const [url, body] of writes) page.sb.queueWrite(url, body);
  await page.sb.flushMapSaves();
  return { statuses: page.statuses, last: page.statuses[page.statuses.length - 1] || "", answers };
}
const texturesOf = (a) => (a && a.res && a.res.heightmap && a.res.heightmap.textures) || null;
const SAID = /were not repainted/;
/** The line carries the note the page makes of this answer — and there is one to carry. */
const said = (line, t) => { const n = noteOf && t ? noteOf(t) : ""; return n !== "" && line.indexOf(n) !== -1; };

(async () => {
  let srv = null;
  try {
    console.log("0. The writer's answers, as the page reads them");
    rec("the five pictures' names were read out of map-data.js", Object.keys(NAMES).length === 5 && Object.values(NAMES).every((n) => /\.dds$/.test(n)), NAMES);
    rec("worldPicturesNote was lifted out of public/map.js and runs", typeof noteOf === "function");
    srv = await L2.startServer(createApp);
    {
      const mod = makeMod("Wrong Size", { pictures: "wrong" });
      const r = await srv.post("/api/map/blank-to-sea", {}, mod);
      const t = r.body && r.body.heightmap && r.body.heightmap.textures;
      rec("THE CONTROL: Delete map ran and lowered the drowned land", r.status === 200 && r.body.ok === true && r.body.heightmap.pixels > 0, r.body);
      rec("THE ANSWER: the writer refused to repaint pictures of another size, and said why",
        !!t && !t.changed && /is 64x64, not half of provinces\.bmp \(256x256\)/.test(String(t.reason)) && !t.nothingToPaint, t);
      const note = noteOf ? noteOf(t) : "";
      rec("⭐⭐⭐ the page says the world's pictures were not repainted", SAID.test(note) && note.indexOf(NAMES.colormap) !== -1, note);
      rec("⭐⭐ …why, in the writer's own words", note.indexOf(String(t && t.reason)) !== -1, note);
      rec("⭐ …and what it costs: the pictures still show the old coast", /still show the coast as it was before this change/.test(note), note);
    }
    {
      const mod = makeMod("Inherited Pictures");
      const r = await srv.post("/api/map/blank-to-sea", {}, mod);
      const t = r.body && r.body.heightmap && r.body.heightmap.textures;
      rec("THE CONTROL: on a mod whose pictures the writer can paint, Delete map repainted them", !!t && t.changed === true, t);
      rec("⭐ …and the page has nothing to say about them", noteOf && noteOf(t) === "", noteOf && noteOf(t));
    }
    {
      // nothing of the mod's to repaint: the writer says so (nothingToPaint), and that is not a refusal
      const bare = world.mod("Inherits Its Map " + (++nMod), {});
      const t = md.repaintWorldTextures({ modRoot: bare, gameRoot: world.GAME, dependencyRoots: [] });
      rec("THE CONTROL: a mod that inherits its map has nothing to repaint", !t.changed && t.nothingToPaint === true, t);
      rec("⭐⭐ …and the page says nothing about it", noteOf && noteOf(t) === "", noteOf && noteOf(t));
      const own = makeMod("Own Pictures", { pictures: "own" });
      const t2 = md.repaintWorldTextures({ modRoot: own, gameRoot: world.GAME, dependencyRoots: [] });
      rec("THE CONTROL: a mod painting its own pictures, with nothing crossed, has nothing to repaint", !t2.changed && t2.nothingToPaint === true, t2);
      rec("⭐⭐ …and the page says nothing about it", noteOf && noteOf(t2) === "", noteOf && noteOf(t2));
      const t3 = md.repaintWorldTextures({ modRoot: world.GAME, gameRoot: world.GAME, dependencyRoots: [] });
      rec("THE CONTROL: a write the writer turned down outright comes back as an error", !t3.changed && !!t3.error, t3);
      const n3 = noteOf ? noteOf(t3) : "";
      rec("⭐ …and the page says not all of the pictures could be repainted, and why", /Not all of the world's colour pictures/.test(n3) && n3.indexOf(t3.error) !== -1, n3);
    }

    console.log("\n1. ⛔ 💾 Save of Delete map, and of an erase, on a mod whose pictures are drawn for another size of map");
    {
      const mod = makeMod("Save Delete Map", { pictures: "wrong" });
      const s = await save(srv, mod, [["/api/map/blank-to-sea", {}]]);
      const t = texturesOf(s.answers.find((a) => a.url === "/api/map/blank-to-sea"));
      rec("THE CONTROL: the Save posted Delete map, and the writer refused the pictures", !!t && /not half of provinces\.bmp/.test(String(t.reason)), s.answers.map((a) => [a.url, a.res && (a.res.error || a.res.ok)]));
      console.log("     (the final line: " + JSON.stringify(s.last) + ")");
      rec("⭐⭐⭐ the Save's final line says the pictures were not repainted, and why", said(s.last, t) && SAID.test(s.last), s.last);
    }
    {
      const mod = makeMod("Save Erase", { pictures: "wrong" });
      const s = await save(srv, mod, [["/api/map/flip-province-sea", { provinceId: 3 }]]);
      const t = texturesOf(s.answers.find((a) => a.url === "/api/map/flip-province-sea"));
      rec("THE CONTROL: the Save posted the erase, and the writer refused the pictures", !!t && /not half of provinces\.bmp/.test(String(t.reason)), s.answers.map((a) => [a.url, a.res && (a.res.error || a.res.ok)]));
      rec("⭐⭐⭐ the Save's final line says so after an erase too", said(s.last, t), s.last);
    }
    {
      const mod = makeMod("Save Delete Map Inherited");
      const s = await save(srv, mod, [["/api/map/blank-to-sea", {}]]);
      const t = texturesOf(s.answers.find((a) => a.url === "/api/map/blank-to-sea"));
      rec("THE CONTROL: on a mod whose pictures the writer can paint, the Save repainted them", !!t && t.changed === true, t);
      rec("⭐ …and its final line says nothing of pictures left unpainted", !SAID.test(s.last) && /Saved 1 change/.test(s.last), s.last);
    }

    console.log("\n2. ⛔ 💾 Save of a painted coastline");
    {
      // 24 x 24 pixels of land province 3, against the sea, painted the sea's colour: they cross the waterline
      const sea = L2.COL[1], stroke = [];
      for (let y = 64; y < 88; y++) for (let x = 200; x < 224; x++) stroke.push({ x, y, r: sea[0], g: sea[1], b: sea[2] });
      const mod = makeMod("Save Paint", { pictures: "wrong" });
      const s = await save(srv, mod, [], stroke);
      const a = s.answers.find((q) => q.url === "/api/map/paint-provinces"), t = texturesOf(a);
      rec("THE CONTROL: the paint was saved, crossed the waterline, and the writer refused the pictures",
        !!a && a.res.ok === true && a.res.heightmap && a.res.heightmap.pixels > 0 && !!t && /not half of provinces\.bmp/.test(String(t.reason)), a && { ok: a.res.ok, error: a.res.error, heightmap: a.res.heightmap });
      rec("⭐⭐⭐ the Save's final line says the pictures were not repainted under a painted coastline, and why", said(s.last, t), s.last);
      const mod2 = makeMod("Save Paint Inherited");
      const s2 = await save(srv, mod2, [], stroke);
      const t2 = texturesOf(s2.answers.find((q) => q.url === "/api/map/paint-provinces"));
      rec("THE CONTROL: on a mod whose pictures the writer can paint, the paint repainted them", !!t2 && t2.changed === true, t2);
      rec("⭐ …and the final line says nothing of pictures left unpainted", !SAID.test(s2.last), s2.last);
    }

    console.log("\n3. ⛔ 🌍 Generate land after Delete map — Old World Blues' own clicks");
    const generate = async (mod) => {
      const model = await fetch(`${srv.base}/api/map/model?modPath=${encodeURIComponent(mod)}`).then((x) => x.json());
      const provinceType = new Map((model.provinces || []).map((p) => [p.id, p.type]));
      const requests = [], log = [], els = {};
      const el = (id, props) => { els[id] = Object.assign(P.element(), props || {}); return els[id]; };
      el("mapGenConfirmBtn", { disabled: false }); el("mapGenPct", { value: "40" }); el("mapGenSeed", { value: "3" });
      const page = P.runPage([
        ['if ($("mapGenConfirmBtn")) $("mapGenConfirmBtn").addEventListener("click"', "\n  });"],
        "async function load(doneMsg)", "function buildFromImage(img, doneMsg)", "async function mapCrashGate(", "function openMapErrorsModal(",
        "async function reloadAfterImmediateWrite(",
      ], P.loadGlobals({
        modPath: () => mod, provinceType, closeGenConfirm: () => {}, $: (id) => els[id] || el(id),
        Image: P.fakeImageClass({ log }),
        fetch: async (url, opts) => {
          const res = await fetch(srv.base + String(url), opts);
          const body = await res.json().catch(() => ({}));
          requests.push({ url: String(url).split("?")[0], body });
          return { ok: res.ok, status: res.status, json: async () => body };
        },
      }));
      els.mapGenConfirmBtn.listeners.click[0]();
      for (let i = 0; i < 400 && !log.includes("image-loaded"); i++) await P.settle(10);
      await P.settle(60);
      const gen = requests.find((q) => q.url === "/api/map/generate-land");
      return { gen, last: page.statuses[page.statuses.length - 1] || "", statuses: page.statuses };
    };
    {
      const mod = makeMod("Generate", { pictures: "wrong" });
      const blank = await srv.post("/api/map/blank-to-sea", {}, mod);
      rec("THE CONTROL: Delete map first", blank.body.ok === true, blank.body);
      const g = await generate(mod);
      const t = g.gen && g.gen.body && g.gen.body.heightmap && g.gen.body.heightmap.textures;
      rec("THE CONTROL: the click generated land, raised it, and the writer refused the pictures",
        !!(g.gen && g.gen.body.ok === true && g.gen.body.flippedProvinces > 0 && g.gen.body.heightmap.pixels > 0) && !!t && /not half of provinces\.bmp/.test(String(t.reason)),
        g.gen && { ok: g.gen.body.ok, error: g.gen.body.error, flipped: g.gen.body.flippedProvinces, textures: t });
      rec("⭐⭐⭐ the status line left on screen says the pictures were not repainted, and why", said(g.last, t), { last: g.last, statuses: g.statuses });
      rec("⚠️ …and still says what it generated", /Generated \d+ land province/.test(g.last), g.last);
    }
    {
      const mod = makeMod("Generate Inherited");
      await srv.post("/api/map/blank-to-sea", {}, mod);
      const g = await generate(mod);
      const t = g.gen && g.gen.body && g.gen.body.heightmap && g.gen.body.heightmap.textures;
      rec("THE CONTROL: on a mod whose pictures the writer can paint, Generate land repainted them", !!t && t.changed === true, t);
      rec("⭐ …and the line says nothing of pictures left unpainted", !SAID.test(g.last) && /Generated \d+ land province/.test(g.last), g.last);
    }
  } catch (e) {
    rec("harness threw: " + (e && e.stack ? e.stack.split("\n").slice(0, 6).join(" | ") : e), false);
  } finally {
    if (srv) srv.close();
    world.cleanup();
    console.log(`\n=== a world picture left unpainted is said: ${checks} checks, ${fails.length} failed ===`);
    fails.forEach((f) => console.log("   FAILED: " + f));
    process.exitCode = fails.length ? 1 : 0;
  }
})();
