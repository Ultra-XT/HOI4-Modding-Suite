// ⛔ #a-reseeded-patch-is-on-the-page (B1-2) — A PROVINCE A STROKE COVERED COMPLETELY IS SHOWN WHERE THE DISK KEEPS IT.
//
// HOI4 cannot load a 0-pixel province, so applyProvinceDiff does not refuse a stroke that covers one: it keeps a small patch of it
// on disk and says "Kept a small patch of each so the map still works". The page kept its OWN pixels, which have the brush's province
// on that patch: after the Save the HUD and the inspector named the brush's province (vanilla 888) on 942's patch, the province the
// disk and the warning say stayed, until a reload (the campaign's repro-B1-2, on vanilla).
//
// The answer now carries the patch (`reseeded: [{ r, g, b, pixels: [[x, y], …] }]`) and the page puts it on its own picture before it
// rebuilds the province grid after the paint. Not a reload: buildFromImage re-fits the view, and the modder was zoomed in to paint.
//
// END TO END: the page's own flushMapSaves and buildPidGrid (lifted from public/map.js) are fed the REAL applyProvinceDiff answer for
// a small provinces.bmp, and the page's province grid is compared with the bitmap that answer wrote, pixel by pixel. A field renamed
// on either side fails here.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const md = require("./map-data.js");
const PAGE = require("./testlib-map-page.js");

let checks = 0; const fails = [];
const ok = (c, m, d) => { checks++; if (c) console.log("  ok   " + m); else { fails.push(m); console.log("  FAIL " + m + (d !== undefined ? "   -> " + JSON.stringify(d).slice(0, 500) : "")); } };

const W = 16, H = 8;
const bmp24 = (pixelFn) => {
  const rowSize = (W * 3 + 3) & ~3, imageSize = rowSize * H;
  const buf = Buffer.alloc(54 + imageSize);
  buf.write("BM", 0, "ascii");
  buf.writeUInt32LE(54 + imageSize, 2); buf.writeUInt32LE(54, 10); buf.writeUInt32LE(40, 14);
  buf.writeInt32LE(W, 18); buf.writeInt32LE(H, 22); buf.writeUInt16LE(1, 26);
  buf.writeUInt16LE(24, 28); buf.writeUInt32LE(imageSize, 34);
  for (let y = 0; y < H; y++) { let o = 54 + (H - 1 - y) * rowSize; for (let x = 0; x < W; x++) { const [r, g, b] = pixelFn(x, y); buf[o++] = b; buf[o++] = g; buf[o++] = r; } }
  return buf;
};
/** the packed colour of every pixel of a bottom-up 24-bit bitmap, rows top-down */
const readBmp = (file) => {
  const buf = fs.readFileSync(file), off = buf.readUInt32LE(10), w = buf.readInt32LE(18), h = buf.readInt32LE(22), rowSize = (w * 3 + 3) & ~3;
  const out = new Array(w * Math.abs(h));
  for (let y = 0; y < Math.abs(h); y++) { const o = off + (h > 0 ? h - 1 - y : y) * rowSize; for (let x = 0; x < w; x++) out[y * w + x] = (buf[o + x * 3 + 2] << 16) | (buf[o + x * 3 + 1] << 8) | buf[o + x * 3]; }
  return { w, h: Math.abs(h), px: out };
};
// Province 1 fills the map except a 3x3 block that is province 2.
const P1 = [10, 10, 10], P2 = [20, 20, 20];
const pack = (c) => (c[0] << 16) | (c[1] << 8) | c[2];
const isP2 = (x, y) => x >= 4 && x < 7 && y >= 2 && y < 5;
const tmps = [];
const mk = () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "nova-reseed-page-")); tmps.push(d);
  fs.writeFileSync(path.join(d, "descriptor.mod"), 'name="RESEED"\nreplace_path="map"\n');
  fs.mkdirSync(path.join(d, "map"), { recursive: true });
  fs.writeFileSync(path.join(d, "map", "definition.csv"), ["0;0;0;0;land;false;unknown;0", `1;${P1.join(";")};land;false;plains;1`, `2;${P2.join(";")};land;false;plains;1`].join("\n") + "\n");
  fs.writeFileSync(path.join(d, "map", "provinces.bmp"), bmp24((x, y) => (isP2(x, y) ? P2 : P1)));
  return d;
};
const GAME = path.join(os.tmpdir(), "__nova_no_game_reseed_page__");
const strokeOver = (n) => { const diff = []; for (let y = 2; y < 5; y++) for (let x = 4; x < 7; x++) if (diff.length < n) diff.push({ x, y, r: P1[0], g: P1[1], b: P1[2] }); return diff; };

/** 💾 Save of the page's stroke, answered by `answer`; the page's picture is the original map with the stroke on it */
const runSave = async (diff, answer) => {
  const posted = [];
  const data = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const c = isP2(x, y) ? P2 : P1, d = (y * W + x) * 4; data[d] = c[0]; data[d + 1] = c[1]; data[d + 2] = c[2]; data[d + 3] = 255; }
  const paintDiff = new Map();
  for (const px of diff) { const d = (px.y * W + px.x) * 4; data[d] = px.r; data[d + 1] = px.g; data[d + 2] = px.b; paintDiff.set(px.x + "," + px.y, px); }
  const page = PAGE.runPage([
    ["const STATE_ID_FIELDS = ", "\n"], "function orphanedQueuedWrites(writes)", "function emptyNewStateWrites(writes, stateById)",
    "function markSaveBoundary", "function queueWrite(url, body, meta)", "function buildPidGrid()",
    ["async function flushMapSaves", "} finally { if (btn) btn.disabled = false; updateSaveButton(); }\n  }"],
  ], PAGE.loadGlobals({
    console, JSON,
    imgW: W, imgH: H, baseImageData: new PAGE.FakeImageData(data, W, H), baseImageDataPristine: null, pidGrid: null, borderEdges: null,
    colorToProvince: new Map([[pack(P1), 1], [pack(P2), 2]]),
    pendingWrites: [], paintDiff, stateById: new Map(), model: { states: [] }, provinceType: new Map([[1, "land"], [2, "land"]]), provinceDef: new Map(),
    armyHasUnsaved: () => false, armyModel: { divisions: [] },
    window: { NovaMapRuleLabels: require("./public/map-rule-labels.js"), confirm: () => false },
    stagedRiverEdits: [], riversShow: false, loadRiversOverlay: () => {},
    undoStack: [], redoStack: [], historyLabels: [], saveGeneration: 0,
    setMapDirty: () => {}, updateSaveButton: () => {}, modPath: () => "C:/mods/reseed",
    isVanillaTarget: () => false, problemsPanelOpen: () => false, refreshProblems: () => {}, renderCheckpoints: () => {},
    stateFormDirty: () => false, stateFormBaseline: null, stageStateWrite: () => {},
    remapQueuedStateId: () => {}, remapLocalStateId: () => {},
    adoptMergeRegions: () => {}, openMapErrorsModal: () => {}, saveMapBackup: () => {}, updateUndoButtons: () => {},
    mapCrashGate: async ({ done }) => `✓ Saved ${done} change${done === 1 ? "" : "s"} to your mod.`,
    load: async () => { posted.push("load()"); },
    fetch: async (url) => {
      posted.push(String(url).split("?")[0]);
      if (String(url) === "/api/map/paint-provinces") return { json: async () => answer };
      return { json: async () => ({ ok: true }) };
    },
  }));
  await page.sb.flushMapSaves(); await PAGE.settle(30);
  return { posted, grid: page.sb.pidGrid, statuses: page.statuses };
};
/** pixels where the page's province grid and the bitmap on disk name different provinces */
const mismatches = (grid, disk) => {
  const idOf = new Map([[pack(P1), 1], [pack(P2), 2]]), out = [];
  for (let i = 0; i < disk.px.length; i++) if (!grid || grid[i] !== idOf.get(disk.px[i])) out.push({ x: i % W, y: Math.floor(i / W), page: grid ? grid[i] : null, disk: idOf.get(disk.px[i]) });
  return out;
};

(async () => {
  console.log("\n=== a stroke over ALL of province 2: the disk keeps a patch, and so does the page ===");
  {
    const M = mk(), diff = strokeOver(9);
    const res = md.applyProvinceDiff({ modRoot: M, gameRoot: GAME, dependencyRoots: [], diff });
    const disk = readBmp(path.join(M, "map", "provinces.bmp"));
    const kept = disk.px.filter((c) => c === pack(P2)).length;
    ok(res.ok === true && /Kept a small patch/.test((res.warnings || []).join(" ")) && kept > 0,
      "(control: the stroke applies, the warning says a patch was kept, and the disk has one)", { ok: res.ok, error: res.error, kept });
    const said = Array.isArray(res.reseeded) ? res.reseeded : [];
    ok(said.length === 1 && said[0].r === P2[0] && said[0].g === P2[1] && said[0].b === P2[2] && Array.isArray(said[0].pixels) && said[0].pixels.length === kept,
      "⭐⭐ the answer names the patch it kept: province 2's colour and every pixel of it on disk", { reseeded: res.reseeded, kept });
    const s = await runSave(diff, res);
    ok(s.posted.includes("/api/map/paint-provinces"), "(control: the Save sent the stroke)", s.posted);
    const bad = mismatches(s.grid, disk);
    ok(bad.length === 0, "⭐⭐⭐ after the Save the page's province grid is the disk's, pixel for pixel: the patch is province 2 on the page too", bad.slice(0, 6));
    ok(!s.posted.includes("load()"), "⭐ …without reading the map again (a reload re-fits the view the modder was painting in)", s.posted);
  }

  console.log("\n=== a stroke over PART of province 2: nothing reseeded, nothing put back ===");
  {
    const M = mk(), diff = strokeOver(5);
    const res = md.applyProvinceDiff({ modRoot: M, gameRoot: GAME, dependencyRoots: [], diff });
    ok(res.ok === true && !("reseeded" in res), "⭐ a stroke that leaves province 2 some of its pixels reseeds nothing, and the answer says nothing of it", { ok: res.ok, reseeded: res.reseeded });
    const s = await runSave(diff, res);
    const bad = mismatches(s.grid, readBmp(path.join(M, "map", "provinces.bmp")));
    ok(bad.length === 0, "(control: the page's grid is the disk's, as it always was for a stroke that covers part of a province)", bad.slice(0, 6));
  }

  for (const d of tmps) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} }
  console.log(`\n${checks - fails.length}/${checks} checks passed`);
  if (fails.length) { console.log("FAILED:\n  " + fails.join("\n  ")); process.exit(1); }
})().catch((e) => { console.error(e.stack || e); process.exit(1); });
