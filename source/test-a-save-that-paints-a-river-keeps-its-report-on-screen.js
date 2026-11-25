// A Save that paints a river keeps its report on screen: the rivers overlay it reloads afterwards does not replace the Save line.
// #a-save-that-paints-a-river-keeps-its-report-on-screen
//
// THE DEFECT (discovery F18, verified on 790cb21 in the real page, scratchpad/batch10/discover/u4-page.js V3 and u3-undo.js T3,
// #mapStatus recorded every 50 ms): after a Save that includes a 🌊 river stroke, flushMapSaves drops the staged preview and calls
// loadRiversOverlay() with no doneMsg, then awaits mapCrashGate. The overlay's img.onload runs setStatus(doneMsg || "🌊 Rivers
// overlay on.") once the PNG has decoded, and on vanilla that was AFTER the gate had written the Save report:
//   [2358] "✓ Saved 2 changes to your mod. ⚠️ 1 problem the game will load past … Also, what this save changed: • The drowned land
//          took 14 building(s) with it … • 🌊 Your new river had no source, so Nova added the green source pixel at 2951,921 …"
//   [2495] "🌊 Rivers overlay on."   (final)
// T3, on another mod: [1305] "✓ Saved 1 change to your mod." replaced at [1407]. The popup still opens, but the what-this-save-changed
// notes live only on that status line, so the modder never read that Nova had added a pixel to their river.
//
// Run as the page runs it: flushMapSaves, mapCrashGate, markSaveBoundary, blankAdjacencyNote, loadRiversOverlay, queueWrite,
// commitRiverEdits and classifyRiverPalette are lifted out of public/map.js into a sandbox whose fetch is the real server of
// testlib-two-layer-map.js. The stroke is queued by the page's own commitRiverEdits with the palette index the page's own
// classifier picks. The overlay image is a stand-in whose onload the test fires — after the Save report (vanilla's order) and
// before it (a slow validate, Millennium Dawn's order) — so the outcome does not depend on a timer.
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const L2 = require("./testlib-two-layer-map.js");
const world = L2.makeWorld("b11-river-saveline");   // before server.js: it reads HOI4_MODS_ROOT when it loads
const P = require("./testlib-map-page.js");
const { createApp } = require("./server.js");
const labels = require("./public/map-rule-labels.js");

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (ok || detail == null ? "" : "   -> " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 700)));
  if (!ok) fails.push(label);
};

// An 8-bit rivers.bmp in vanilla's palette layout (as test-a-river-the-mod-cut-from-its-source-is-reported-and-given-one.js builds
// it): 0 source, 1 flow-in, 2 flow-out, 3..11 widths, 254 grey, 255 white background. One river with its source on row 120.
const W = 256, H = 256;
const BLUES = [[0, 225, 255], [0, 200, 255], [0, 150, 255], [0, 100, 255], [0, 0, 255], [0, 0, 225], [0, 0, 200], [0, 0, 150], [0, 0, 100]];
const PAL = Array.from({ length: 256 }, (_, i) => (i === 0 ? [0, 255, 0] : i === 1 ? [255, 0, 0] : i === 2 ? [255, 252, 0]
  : i >= 3 && i <= 11 ? BLUES[i - 3] : i === 254 ? [122, 122, 122] : i === 255 ? [255, 255, 255] : [2, 0, 1]));
function riversBmp(pixels) {
  const stride = Math.ceil(W / 4) * 4, off = 14 + 40 + 1024, size = off + stride * H;
  const b = Buffer.alloc(size, 0);
  b.write("BM", 0, "ascii"); b.writeUInt32LE(size, 2); b.writeUInt32LE(off, 10);
  b.writeUInt32LE(40, 14); b.writeInt32LE(W, 18); b.writeInt32LE(H, 22); b.writeUInt16LE(1, 26); b.writeUInt16LE(8, 28);
  b.writeUInt32LE(0, 30); b.writeUInt32LE(stride * H, 34); b.writeUInt32LE(256, 46);
  PAL.forEach(([r, g, bl], i) => { b[54 + i * 4] = bl; b[55 + i * 4] = g; b[56 + i * 4] = r; });
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) b[off + (H - 1 - y) * stride + x] = 255;
  for (const [x, y, v] of pixels) b[off + (H - 1 - y) * stride + x] = v;
  return b;
}
L2.write(world.GAME, { "map/rivers.bmp": riversBmp([[20, 120, 0]].concat(Array.from({ length: 40 }, (_, i) => [21 + i, 120, 11]))) });

const MAP = P.MAP, MASKED = P.MASKED;
const grab = (needle, endNeedle) => { const s = MASKED.indexOf(needle); if (s < 0) return ""; const e = MASKED.indexOf(endNeedle, s); return e < 0 ? "" : MAP.slice(s, e + endNeedle.length); };
const FLUSH = grab("async function flushMapSaves", "} finally { if (btn) btn.disabled = false; updateSaveButton(); }\n  }");
const GATE = grab("async function mapCrashGate", "\n  }");
const MARK = grab("function markSaveBoundary", "\n  }");
const NOTE = grab("function blankAdjacencyNote", "\n  }");
const OVERLAY = grab("function loadRiversOverlay(doneMsg)", "\n  }");
const QUEUE = grab("function queueWrite(url, body, meta)", "\n  }");
const COMMIT = grab("function commitRiverEdits()", "\n  }");
const fieldsMatch = /const STATE_ID_FIELDS = \[([^\]]*)\]/.exec(MASKED);
const STATE_ID_FIELDS = fieldsMatch ? [...fieldsMatch[1].matchAll(/"([A-Za-z]+)"/g)].map((m) => m[1]) : [];

/** An <img> whose decode the test decides: setting src records it; fire() runs its onload. */
function manualImages() {
  const made = [];
  class ManualImage {
    constructor() { this.onload = null; this.onerror = null; this._src = ""; made.push(this); }
    get src() { return this._src; }
    set src(v) { this._src = v; }
    fire() { if (typeof this.onload === "function") this.onload(); }
  }
  return { ManualImage, made };
}

/** The page after a river stroke: the stroke queued by commitRiverEdits, then 💾 Save through flushMapSaves over the real server. */
function riverPage(srv, mod) {
  const statuses = [];
  const answers = [];
  const { ManualImage, made } = manualImages();
  let draws = 0;
  const sb = {
    console, JSON, Date, encodeURIComponent, setTimeout,
    pendingWrites: [], paintDiff: new Map(), statusEl: { style: {} }, stateById: new Map(), model: { states: [] },
    riverEdits: [], stagedRiverEdits: [], lastRiverPt: null, riversShow: true, riversImg: null, Image: ManualImage,
    undoStack: [], redoStack: [], historyLabels: [], saveGeneration: 0, baseImageData: null, baseImageDataPristine: null,
    setStatus: (s) => { statuses.push(String(s)); }, setMapDirty: () => {}, updateSaveButton: () => {}, modPath: () => mod,
    pushUndo: () => {}, isVanillaTarget: () => false, problemsPanelOpen: () => false, refreshProblems: () => {}, renderCheckpoints: () => {},
    buildPidGrid: () => {}, computeCentroids: () => {}, recolorAll: () => {}, draw: () => { draws++; },
    orphanedQueuedWrites: () => [], emptyNewStateWrites: () => [], stateFormDirty: () => false, stateFormBaseline: null,
    stageStateWrite: () => {}, remapQueuedStateId: () => {}, remapLocalStateId: () => {}, provincesBmpNote: () => "", riversPaintNote: () => "", heightmapNote: () => "", STATE_ID_FIELDS,
    adoptMergeRegions: () => {}, openMapErrorsModal: () => {}, saveMapBackup: () => {}, updateUndoButtons: () => {},
    rebuildStagedRiversFromPending: () => {}, $: () => null, window: { NovaMapRuleLabels: labels },
    fetch: async (url, opts) => {
      const r = await fetch(srv.base + url, opts);
      if (String(url).indexOf("/api/map/validate") !== 0) { try { answers.push({ url, res: await r.clone().json() }); } catch (_) {} }
      return r;
    },
  };
  sb.globalThis = sb;
  vm.createContext(sb);
  vm.runInContext(`${MARK}\n${GATE}\n${NOTE}\n${OVERLAY}\n${QUEUE}\n${COMMIT}\n${FLUSH}`, sb);
  return {
    sb, statuses, answers, made,
    last: () => statuses[statuses.length - 1] || "",
    draws: () => draws,
    stroke: (index, pixels) => { sb.riverEdits = pixels.map(([x, y]) => ({ x, y, index })); vm.runInContext("commitRiverEdits();", sb); },
    save: () => sb.flushMapSaves(),
  };
}

(async () => {
  let srv = null;
  try {
    console.log("0. The page's code and requests, as this test runs them");
    rec("flushMapSaves, mapCrashGate, markSaveBoundary, blankAdjacencyNote, loadRiversOverlay, queueWrite and commitRiverEdits lifted",
      FLUSH.length > 500 && GATE.length > 300 && MARK.length > 80 && NOTE.length > 200 && OVERLAY.length > 100 && QUEUE.length > 50 && COMMIT.length > 200,
      [FLUSH.length, GATE.length, MARK.length, NOTE.length, OVERLAY.length, QUEUE.length, COMMIT.length]);
    rec("STATE_ID_FIELDS is read out of public/map.js", STATE_ID_FIELDS.length > 0, STATE_ID_FIELDS);
    srv = await L2.startServer(createApp);
    const palette = P.runPage([["const riverGrey = ", "\n    return items;\n  }"]]).sb;
    const smallFor = async (mod) => {
      const info = await fetch(`${srv.base}/api/map/rivers-info?modPath=${encodeURIComponent(mod)}`).then((r) => r.json());
      const it = palette.classifyRiverPalette(info.palette).find((x) => x.role === "small");
      return it ? it.i : -1;
    };
    // A new river well away from the one the game has: the server gives it the source it lacks, which is the note that got lost.
    const NEW_RIVER = Array.from({ length: 10 }, (_, i) => [180 + i, 230]);

    console.log("\n1. ⛔ A river stroke, 💾 Save, and the overlay finishes decoding AFTER the Save report (vanilla's order)");
    {
      const mod = world.mod("River Save Line", {});
      const small = await smallFor(mod);
      rec("THE CONTROL: the page's classifier picks a small-river index", small >= 3 && small <= 11, small);
      const p = riverPage(srv, mod);
      p.stroke(small, NEW_RIVER);
      rec("commitRiverEdits queued one rivers-paint write", p.sb.pendingWrites.length === 1 && p.sb.pendingWrites[0].url === "/api/map/rivers-paint", p.sb.pendingWrites.map((w) => w.url));
      await p.save();
      const paint = p.answers.find((a) => a.url === "/api/map/rivers-paint");
      rec("THE ANSWER: the stroke saved, and the server added the source it lacked", !!paint && paint.res.ok === true && !!paint.res.addedSource, paint && paint.res);
      const report = p.last();
      rec("THE CONTROL: the Save report is on screen when the Save returns, source note included",
        /Saved 1 change/.test(report) && /Nova added the green source pixel/.test(report), report);
      rec("the Save reloads the rivers overlay from the saved file", p.made.length === 1 && p.made[0].src.indexOf("/api/map/rivers-png?modPath=" + encodeURIComponent(mod)) === 0, p.made.map((i) => i.src));
      const drawsBefore = p.draws();
      p.made[0].fire();
      rec("…and, once it decodes, draws the saved rivers", p.sb.riversImg === p.made[0] && p.draws() > drawsBefore, { same: p.sb.riversImg === p.made[0] });
      rec("⭐⭐⭐ the Save report is STILL the line on screen after the overlay has loaded", p.last() === report, { report, last: p.last() });
      rec("⭐⭐ …so the modder can read that Nova added a source pixel to their river", /Nova added the green source pixel/.test(p.last()), p.last());
    }

    console.log("\n2. THE CONTROL: the overlay finishes decoding BEFORE the Save report (a slow validate)");
    {
      const mod = world.mod("River Save Line Slow Validate", {});
      const small = await smallFor(mod);
      const p = riverPage(srv, mod);
      p.stroke(small, NEW_RIVER);
      const saving = p.save();
      // The page is awaiting the write and the validate; the PNG decode lands first.
      for (let i = 0; i < 400 && !p.made.length; i++) await P.settle(5);
      if (p.made.length) p.made[0].fire();
      await saving;
      rec("the overlay decoded before the report was written", p.made.length === 1, p.made.length);
      rec("⭐ the Save report is the line on screen", /Saved 1 change/.test(p.last()) && /Nova added the green source pixel/.test(p.last()), p.last());
    }

    console.log("\n3. THE CONTROL: the overlay's other callers still speak");
    {
      const p = riverPage(srv, world.mod("River Toggle", {}));
      vm.runInContext("loadRiversOverlay();", p.sb);
      p.made[0].fire();
      rec("⭐ turning 🌊 Rivers on still says the overlay is on", p.last() === "🌊 Rivers overlay on.", p.last());
      const cleared = "🧹 Cleared 3 river pixels → land (your previous rivers.bmp is in Nova's backups).";
      vm.runInContext(`loadRiversOverlay(${JSON.stringify(cleared)});`, p.sb);
      p.made[1].fire();
      rec("⭐ 🧹 Clear all rivers still keeps its own confirmation past the reload", p.last() === cleared, p.last());
    }
  } catch (e) {
    rec("harness threw: " + (e && e.stack ? e.stack.split("\n").slice(0, 6).join(" | ") : e), false);
  } finally {
    if (srv) srv.close();
    world.cleanup();
    console.log(`\n=== a save that paints a river keeps its report on screen: ${checks} checks, ${fails.length} failed ===`);
    fails.forEach((f) => console.log("   FAILED: " + f));
    process.exitCode = fails.length ? 1 : 0;
  }
})();
