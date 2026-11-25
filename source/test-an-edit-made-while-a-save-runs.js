// ⛔ #a-save-walks-the-queue — AN EDIT MADE WHILE A SAVE RUNS: A SAVE TAKES OUT EXACTLY WHAT IT SENT, AND NOTHING ELSE TAKES A WRITE OUT.
//
// flushMapSaves walks the queue and waits for an answer at every step, so the page goes on taking clicks with a write in flight, and it
// used to consume the queue by position (shift(), splice(0, run)). Measured on the page's own functions against the real server:
//   · Ctrl+Z during a Save put back a queue from before it. The Create state went out a second time: a second state with provinces = { },
//     the fatal empty_state, under a line reading "✓ Saved 5 changes".
//   · the Terrain brush re-painting a province whose batch was in flight took the old write out and queued the new one; splice(0, run) then
//     took the new one too. "✓ Saved 2 changes", and the disk kept the old terrain.
// The rule, one sentence: a click may ADD to the queue, and may REPLACE a write with its own later one (the Terrain brush and a country's
// colour keep their latest, and nothing queued after them needs the earlier one to have landed); whatever else would take a write out, or the
// pixels out of a stroke, refuses at the click and says a Save is running. Section 6 derives every such site from the source, so one added
// later has to say which of these it is.
//
// The world: a sea over three rows of land in three states, on a mod that owns all of it. Each Save is the page's own flushMapSaves against
// the real server; each click is the page's own function or handler, fired with the write in flight.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const vm = require("vm");
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-edit-during-save-"));
process.env.APPDATA = path.join(ROOT, "appdata"); process.env.NOVA_APP_DATA_DIR = process.env.APPDATA; process.env.XDG_CONFIG_HOME = process.env.APPDATA;
process.env.NOVA_HOME_DIR = path.join(ROOT, "home");
process.env.HOI4_MODS_ROOT = path.join(ROOT, "mods");
process.env.HOI4_USER_DIR = path.join(ROOT, "user");
process.env.NOVA_DOCUMENTS_DIR = path.join(ROOT, "docs");
for (const d of [process.env.APPDATA, process.env.NOVA_HOME_DIR, process.env.HOI4_MODS_ROOT, process.env.HOI4_USER_DIR, process.env.NOVA_DOCUMENTS_DIR]) fs.mkdirSync(d, { recursive: true });
const P = require("./testlib-map-page.js");
const { maskJsComments } = require("./testlib-strip-comments.js");

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

// ── the world: 64 x 32. The sea (1) above y 8, then three rows of eight 8 x 8 provinces, each row one state
const W = 64, H = 32, SEA = 1;
const provAt = (x, y) => (y < 8 ? SEA : 100 + Math.floor((y - 8) / 8) * 8 + Math.floor(x / 8));
const colour = (id) => [(id * 37) % 256, (id * 71) % 256, (id * 13 + 40) % 256];
const LAND = Array.from({ length: 24 }, (_, k) => 100 + k);
const stateOf = (id) => 21 + Math.floor((id - 100) / 8);
const provincesOf = (s) => LAND.filter((id) => stateOf(id) === s);
const heightAt = (x, y) => (y < 8 ? 89 : y === 8 ? 94 : 105);
const worldInto = (m) => {
  write(m, "map/provinces.bmp", bmp24(W, H, (x, y) => colour(provAt(x, y))));
  const rows = ["0;0;0;0;land;false;unknown;0", `${SEA};${colour(SEA).join(";")};sea;false;ocean;0`];
  for (const id of LAND) rows.push(`${id};${colour(id).join(";")};land;${id < 108};plains;1`);
  write(m, "map/definition.csv", rows.join("\n") + "\n");
  write(m, "map/heightmap.bmp", bmp8(W, H, heightAt));
  write(m, "map/terrain.bmp", bmp8(W, H, (x, y) => (y < 8 ? 15 : 0)));
  write(m, "map/rivers.bmp", bmp8(W, H, () => 255));
  write(m, "map/default.map", 'definitions = "definition.csv"\nprovinces = "provinces.bmp"\nterrain = "terrain.bmp"\nheightmap = "heightmap.bmp"\n');
  write(m, "common/terrain/00_terrain.txt", ["categories = {", "  plains = { color = { 200 200 100 } }", "  hills = { color = { 120 100 80 } }", "  desert = { color = { 220 200 120 } }", "  ocean = { color = { 0 0 200 } is_water = yes }", "}",
    "terrain = {", "  plains = { type = plains color = { 0 } }", "  hills = { type = hills color = { 1 } }", "  desert = { type = desert color = { 2 } }", "  ocean = { type = ocean color = { 15 } }", "}", ""].join("\n"));
  for (const s of [21, 22, 23]) write(m, `history/states/${s}-Land.txt`, `state={\n\tid=${s}\n\tname="STATE_${s}"\n\tmanpower=100000\n\tstate_category=rural\n\tprovinces={ ${provincesOf(s).join(" ")} }\n\thistory={\n\t\towner=AAA\n\t}\n}\n`);
  write(m, "map/strategicregions/1-Sea.txt", `strategic_region={\n\tid=1\n\tname="STRATEGICREGION_1"\n\tprovinces={\n\t\t${SEA}\n\t}\n}\n`);
  write(m, "map/strategicregions/2-Land.txt", `strategic_region={\n\tid=2\n\tname="STRATEGICREGION_2"\n\tprovinces={\n\t\t${LAND.join(" ")}\n\t}\n}\n`);
  write(m, "map/buildings.txt", [21, 22, 23].map((s) => `${s};air_base;${(s - 21) * 8 + 4}.00;9.50;${H - 1 - ((s - 21) * 8 + 12)}.00;0.00;0`).join("\n") + "\n");
  write(m, "common/country_tags/00_countries.txt", 'AAA = "countries/Alpha.txt"\nBBB = "countries/Beta.txt"\n');
  write(m, "common/countries/Alpha.txt", "color = { 10 20 30 }\n");
  write(m, "common/countries/Beta.txt", "color = { 40 50 60 }\n");
  write(m, "common/countries/colors.txt", "AAA = {\n\tcolor = rgb { 10 20 30 }\n\tcolor_ui = rgb { 10 20 30 }\n}\nBBB = {\n\tcolor = rgb { 40 50 60 }\n\tcolor_ui = rgb { 40 50 60 }\n}\n");
  write(m, "history/countries/AAA - Alpha.txt", "capital = 21\n");
  write(m, "history/countries/BBB - Beta.txt", "capital = 22\n");
  return m;
};
// the game under the mod is this world too, in the sandbox, so what the check reads is what the test built and not the installed game
const GAME = worldInto(path.join(ROOT, "game"));
write(GAME, "hoi4.exe", "");
process.env.HOI4_ROOT = GAME;
const ownedMod = (name) => {
  const m = worldInto(path.join(process.env.HOI4_MODS_ROOT, name));
  write(m, "descriptor.mod", `name="${name}"\nreplace_path="history/states"\n`);
  return m;
};
const terrainOnDisk = (M, id) => { const row = fs.readFileSync(path.join(M, "map/definition.csv"), "utf8").split(/\r?\n/).find((l) => l.startsWith(`${id};`)); return row ? row.split(";")[6] : "?"; };
const typeOnDisk = (M, id) => { const row = fs.readFileSync(path.join(M, "map/definition.csv"), "utf8").split(/\r?\n/).find((l) => l.startsWith(`${id};`)); return row ? row.split(";")[4] : "?"; };
const statesOnDisk = (M) => fs.readdirSync(path.join(M, "history/states")).sort();
const stateProvinces = (M, f) => { const m = /provinces\s*=\s*\{([^}]*)\}/.exec(fs.readFileSync(path.join(M, "history/states", f), "utf8")); return m ? m[1].trim().split(/\s+/).filter(Boolean).map(Number) : null; };
const newStateFiles = (M) => statesOnDisk(M).filter((f) => !/^(21|22|23)-/.test(f));

const LIFTS = [
  ["const STATE_ID_FIELDS = ", "\n"], ["const nextProvisionalStateId = ", "\n"], "function orphanedQueuedWrites(writes)", "function emptyNewStateWrites(writes, stateById)",
  "function markSaveBoundary", "function queueWrite(url, body, meta)", "function terrainWriteNotes(", "function remapQueuedStateId(", "function remapLocalStateId(",
  // (⛔ #a-new-state-is-carved-like-a-split, #a-capital-state-keeps-a-victory-point, #an-id-the-scripts-name-goes-back-to-its-country — what the Save adopts and says
  // of a new state's first land and the capitals it kept, and what Delete and Merge ask of the scripts; none of them a …Note helper)
  "function adoptFirstLand(", "function adoptCapitalTown(", "function capitalTownNotes(", "function warnOfScriptNamedState(",
  "function updateSaveButton()", "function setMapDirty(d)", "function mapHasUnsavedWork()",
  ["async function flushMapSaves", "} finally { if (btn) btn.disabled = false; updateSaveButton(); }\n  }"],
  "async function mapCrashGate(", "async function load(doneMsg)", "function buildFromImage(img, doneMsg)",
  "function snapshotMap()", "function applyMapSnapshot(s)", "function pushUndo(label)", "function doUndo()", "function doRedo()", "function jumpToHistory(i)",
  "function addCheckpoint()", "function restoreCheckpoint(idx)", "function eachHeldSnapshot", "function foldIrreversibleAddition", "function rebuildStagedRiversFromPending()", "function purgeStagedWritesFromHistory(pred)",
  "function paintTerrainAt(clientX, clientY)", "function beginTerrainStroke()", "function commitTerrainStroke()", "function setCapitalAt(clientX, clientY)",
  "function stateMoveRegionTarget(pid, toState, provinceToRegion)", "function deleteEmptiedStates(", "function doMoveProvince(", "function handleMoveClick(pid, sid)",
  "function eraseProvinceLocal(pid)", "function eraseAt(clientX, clientY)", "function beginEraseStroke()", "function commitEraseStroke()",
  // (⛔ #a-big-brush-takes-every-province-under-it — the provinces under the Erase and Terrain discs)
  "function provincesUnderDisc(",
  // (the coast rows' helpers the moves, the erase and Delete call: #a-moved-coast-takes-its-dockyards, #a-dropped-paint-refuses-what-rests-on-it, #a-panel-edit-sends-what-the-modder-changed)
  ["const NAVAL_ONLY_STATE_KEYS = ", "\n"], "function stateNavalLevels(", "function navalLevelsWords(", "function navalDatedAfterCarry(", "function giveNavalDated(", "function coastDockyardsThatGo(",
  "function reconcileNavalCarry(", "function unmirrorDroppedMove(", "function moveProvinceLevels(", "function paintDropRefusal(", "function emptiedStatesYardWords(", "function readStateForm(",
  "function coastsASeaMadeLandTakes(", "function seaMadeLandNavalWords(", "function buildingRowsNote(", "function navalCarriedNote(",
  "function blankRefusalBody(m)", "function blankMapLocal()", "function showRestoreBar(b)", "async function saveProvinceTerrain()", "function mergeRegionPlan(srcSt, dstSt, provinceToRegion)", "function doMergeState(sourceSid, targetSid)",
  "function stampBrushAt(ix, iy, octx)", "function brushStampCentres(prev, ix, iy)", "function paintAt(cx, cy)",
  [`$("mapNewState").addEventListener("click", () => {`, "\n  });"],
  [`$("miDeleteBtn").addEventListener("click", () => {`, "\n  });"],
  [`if ($("mapRiversClear")) $("mapRiversClear").addEventListener("click", async () => {`, "\n  });"],
  ["const ownerColorCache = ", "\n"], ["const hexToRgb = ", "\n"], [`$("mapCountryColor").addEventListener("change", (e) => {`, "\n    });"],
];

(async () => {
  const { createApp } = require("./server.js");
  let server = null;
  try {
    server = await new Promise((res, rej) => { const s = createApp().listen(0, "127.0.0.1", () => res(s)); s.on("error", rej); });
    const base = `http://127.0.0.1:${server.address().port}`;
    const fatalRules = async (M) => { const v = await fetch(base + "/api/map/validate?modPath=" + encodeURIComponent(M)).then((r) => r.json()); return (v.problems || []).filter((p) => require("./public/map-rule-labels.js").isFatalRule(p.rule)).map((p) => p.rule); };

    let modN = 0;
    /** The map page holding mod M: the page's own load() read its model off the real server. `onPost(url, n)` runs with that request about to go out and the Save waiting for it. */
    const openPage = async ({ onPost = null, extra = {} } = {}) => {
      const M = ownedMod("mod" + (++modN));
      const els = new Map();
      const $ = (id) => { if (!els.has(id)) els.set(id, P.element()); return els.get(id); };
      const posted = [];
      const hook = { onPost };
      const page = P.runPage(LIFTS, P.loadGlobals(Object.assign({
        console, JSON, Image: P.fakeImageClass({ width: W, height: H }), $, confirm: () => true,
        window: { NovaMapRuleLabels: require("./public/map-rule-labels.js"), confirm: () => true },
        info: P.element(), selected: null, multiSelect: new Set(), stagedRiverEdits: [], riverEdits: [], lastRiverPt: null, riversShow: false, loadRiversOverlay: () => {},
        checkpoints: [], checkpointSeq: 0, UNDO_LIMIT: 30, historyLabels: ["Loaded map"], renderCheckpoints: () => {}, syncCountryColorInput: () => {},
        provisionalSeq: 0, moveTarget: null, moveSource: null, autoFix: true, mode: "move", setMode: (m) => { page.sb.mode = m; page.sb.moveTarget = null; },
        erasedThisStroke: new Set(), eraseEmptied: new Set(), eraseSkippedInland: new Set(), eraseHeld: new Map(), provNeighborsCache: null, buildProvNeighbors: () => {},
        terrainPaintType: "plains", terrainStroke: new Set(), terrainChanged: 0, brushRadius: 1, imgXYAt: (x, y) => ({ x, y }), imgPixelAt: (x, y) => { const c = colour(provAt(x, y)); return (c[0] << 16) | (c[1] << 8) | c[2]; },
        pidGrid: Array.from({ length: W * H }, (_, i) => provAt(i % W, Math.floor(i / W))),
        canvas: { getBoundingClientRect: () => ({ left: 0, top: 0 }) }, scale: 1, offX: 0, offY: 0, ownerCanvas: { getContext: () => ({ fillRect() {} }) }, strokeUndoTaken: false, lastPaintPt: null, brush: null,
        modPath: () => M, armyHasUnsaved: () => false, armySave: async () => {}, isVanillaTarget: () => false, stateFormDirty: () => false, stateFormBaseline: null, stageStateWrite: () => {},
        adoptMergeRegions: () => {}, openMapErrorsModal: () => {}, saveMapBackup: () => {}, updateUndoButtons: () => {}, showInfo: () => {}, clearMultiSelect: () => {}, regionRenameRefreshSelect: () => {}, supplyRenameRefreshSelect: () => {},
        stageProvinceRegionMove: () => {}, setProvinceRegionLocally: () => {}, riversClearConfirmBody: () => "clear them?", riversClearedNote: () => "cleared", reloadAfterImmediateWrite: async () => {},
        fetch: async (url, opts) => {
          const o = Object.assign({}, opts || {});
          if (o.method === "POST") { posted.push(String(url).replace("/api/map/", "")); if (hook.onPost) hook.onPost(url.replace("/api/map/", ""), posted.length); }
          return fetch(base + url, o);
        },
      }, extra)));
      const sb = page.sb;
      await sb.load(); await P.settle(30);
      ok(sb.provinceType.get(100) === "land" && sb.stateById.get(21) && sb.imgW === W, `(page ${modN}) the page's own load() read the map off the server`);
      return { M, sb, posted, els, hook, statuses: page.statuses, last: () => String(page.statuses[page.statuses.length - 1] || ""), running: () => !!sb.flushMapSaves.running };
    };
    const SAVING = /A Save is running/;
    /** Fire `click` once, with the Save waiting for the request whose url matches `at`. */
    const during = (pg, at, click) => { let fired = false; pg.hook.onPost = (url) => { if (!fired && at.test(url)) { fired = true; click(); } }; return () => fired; };
    const paintTerrain = (pg, pid, terrain) => { const s = pg.sb; s.terrainPaintType = terrain; s.terrainStroke = new Set(); const x = (pid - 100) % 8 * 8 + 1, y = 8 + Math.floor((pid - 100) / 8) * 8 + 1; s.paintTerrainAt(x, y); };
    const newStateQueue = (pg, provinces = [116]) => {
      // what + New state and a fill click queue, through the page's own handler and doMoveProvince
      const s = pg.sb;
      pg.els.get("mapNewState").listeners.click[0]();
      const id = s.moveTarget;
      for (const pid of provinces) s.handleMoveClick(pid, s.model.provinceToState[pid]);
      return id;
    };

    console.log("\n-- 1. THE TWO THAT WERE MEASURED --");
    {
      const pg = await openPage();
      paintTerrain(pg, 100, "hills"); paintTerrain(pg, 101, "hills");
      ok(pg.sb.pendingWrites.map((w) => [w.body.provinceId, w.body.terrain]).join("|") === "100,hills|101,hills", "THE CONTROL: the Terrain brush queued two writes, one a province");
      const fired = during(pg, /set-province-terrains$/, () => paintTerrain(pg, 100, "desert"));
      await pg.sb.flushMapSaves(); await P.settle(20);
      ok(fired(), "…and painted province 100 again with their batch in flight");
      ok(terrainOnDisk(pg.M, 100) === "desert" && terrainOnDisk(pg.M, 101) === "hills", "⭐⭐⭐ the disk has what the page shows: the write added during the Save was not taken out with the batch it replaced", [terrainOnDisk(pg.M, 100), terrainOnDisk(pg.M, 101)]);
      ok(pg.sb.provinceDef.get(100).terrain === "desert", "…as the page does");
      ok(pg.sb.pendingWrites.length === 0 && pg.posted.join() === "set-province-terrains,set-province-terrain", "⭐⭐ the batch went once and the later write once, and nothing is left queued", pg.posted);
      ok(/Saved 3 changes/.test(pg.last()), "⭐ the line counts all three", pg.last().slice(0, 120));
    }
    {
      const pg = await openPage();
      const s = pg.sb;
      s.pushUndo("owner"); s.queueWrite("/api/map/set-owner", { stateId: 23, owner: "BBB" });
      s.pushUndo("New state"); const id = newStateQueue(pg);
      s.pushUndo("owner"); s.queueWrite("/api/map/set-owner", { stateId: 21, owner: "BBB" });
      ok(id < 0 && s.undoStack.length >= 3, "THE CONTROL: a Create state and its province are queued between two owner changes, each an Undo step", id);
      const fired = during(pg, /move-province$/, () => s.doUndo());
      await s.flushMapSaves(); await P.settle(20);
      ok(fired(), "…and Ctrl+Z is pressed with the province's move in flight");
      ok(pg.posted.filter((u) => u === "create-state").length === 1, "⭐⭐⭐ the Create state went out once: Undo did not put back a queue from before the Save", pg.posted);
      const made = newStateFiles(pg.M);
      ok(made.length === 1 && stateProvinces(pg.M, made[0]).includes(116), "⭐⭐⭐ one new state, holding its province", made);
      ok(!(await fatalRules(pg.M)).includes("empty_state"), "⭐⭐⭐ …and no second state with provinces = { }, which is fatal");
      ok(pg.statuses.some((l) => SAVING.test(l) && /Undo/.test(l)), "⭐⭐ Ctrl+Z said why it did nothing", pg.statuses.slice(-6));
      ok(s.pendingWrites.length === 0 && /Saved 4 changes/.test(pg.last()), "…and the Save finished what it had", pg.last().slice(0, 120));
    }

    console.log("\n-- 2. EVERYTHING ELSE THAT PUTS BACK AN OLDER QUEUE REFUSES --");
    {
      // ↷ Redo, a History row and a checkpoint hold a queue from before the Save as Undo does. The Save writes A and B; the click comes with `at` in flight.
      const A = () => ({ stateId: 21, owner: "BBB" }), B = () => ({ stateId: 22, owner: "BBB" }), C = () => ({ stateId: 23, owner: "BBB" });
      const owner = "/api/map/set-owner";
      const ownerOf = (pg, id) => (/owner\s*=\s*(\w+)/.exec(fs.readFileSync(path.join(pg.M, "history/states", `${id}-Land.txt`), "utf8")) || [])[1];
      for (const [name, arm, click, at] of [
        // a third step undone: Redo holds A, B and C, so with B in flight it used to send B again and C after it
        ["↷ Redo", (s) => { s.queueWrite(owner, A()); s.queueWrite(owner, B()); s.pushUndo("third"); s.queueWrite(owner, C()); s.doUndo(); }, (s) => s.doRedo(), 2],
        ["a History row ahead", (s) => { s.queueWrite(owner, A()); s.queueWrite(owner, B()); s.pushUndo("third"); s.queueWrite(owner, C()); s.doUndo(); }, (s) => s.jumpToHistory(s.undoStack.length + 1), 2],
        // the step before both: it used to empty the queue, so B never went and the line still said Saved
        ["a History row back", (s) => { s.pushUndo("both"); s.queueWrite(owner, A()); s.queueWrite(owner, B()); }, (s) => s.jumpToHistory(0), 1],
        ["a 📌 checkpoint", (s) => { s.queueWrite(owner, A()); s.queueWrite(owner, B()); s.addCheckpoint(); }, (s) => s.restoreCheckpoint(0), 2],
      ]) {
        const pg = await openPage();
        const s = pg.sb;
        arm(s);
        ok(s.pendingWrites.length === 2, `THE CONTROL: ${name}: the Save has two writes to send`, s.pendingWrites.length);
        let n = 0;
        pg.hook.onPost = (url) => { if (/set-owner$/.test(url) && ++n === at) click(s); };
        await s.flushMapSaves(); await P.settle(20);
        ok(n >= at && pg.posted.join() === "set-owner,set-owner", `⭐⭐⭐ ${name}, with write ${at} in flight: each of the two went out once and nothing else did`, pg.posted);
        ok(ownerOf(pg, 21) === "BBB" && ownerOf(pg, 22) === "BBB" && ownerOf(pg, 23) === "AAA", "⭐⭐⭐ …and the disk has those two", [ownerOf(pg, 21), ownerOf(pg, 22), ownerOf(pg, 23)]);
        ok(pg.statuses.some((l) => SAVING.test(l)), "⭐⭐ …it said a Save is running", pg.statuses.slice(-5));
        ok(!pg.statuses.slice(pg.statuses.findIndex((l) => /^Saving…/.test(l))).some((l) => /^(↶|↷|↩|🕘)/.test(l)), "⭐ …and no line said it had happened");
        ok(s.pendingWrites.length === 0 && /Saved 2 changes/.test(pg.last()), "⭐ …and the Save's line counts what it wrote", pg.last().slice(0, 100));
      }
    }
    {
      // the bar that offers the last session's edits replaces the queue with them
      const pg = await openPage();
      const s = pg.sb;
      s.showRestoreBar({ modPath: pg.M, ts: Date.now(), writes: [{ url: "/api/map/set-owner", body: { stateId: 22, owner: "BBB" }, meta: {} }] });
      s.queueWrite("/api/map/set-owner", { stateId: 21, owner: "BBB" });
      s.queueWrite("/api/map/set-owner", { stateId: 23, owner: "BBB" });
      const fired = during(pg, /set-owner$/, () => pg.els.get("mapRestoreBtn").listeners.click[0]());
      await s.flushMapSaves(); await P.settle(20);
      ok(fired() && pg.posted.length === 2 && pg.posted.every((u) => u === "set-owner"), "⭐⭐⭐ the Restore bar's button during a Save: the Save's own writes all went, and only they", pg.posted);
      const owner = (id) => (/owner\s*=\s*(\w+)/.exec(fs.readFileSync(path.join(pg.M, "history/states", `${id}-Land.txt`), "utf8")) || [])[1];
      ok(owner(21) === "BBB" && owner(23) === "BBB" && owner(22) === "AAA", "⭐⭐⭐ …so the second of them landed, and the old session's did not", [owner(21), owner(22), owner(23)]);
      ok(pg.statuses.some((l) => SAVING.test(l)), "⭐⭐ …and it said a Save is running", pg.statuses.slice(-5));
    }

    console.log("\n-- 3. A NEW STATE WHOSE CREATE MAY BE ON ITS WAY CANNOT BE TAKEN BACK --");
    for (const [name, click] of [
      ["🗑 Delete state", (pg, id) => { pg.sb.selected = { stateId: id }; pg.els.get("miDeleteBtn").listeners.click[0](); }],
      ["moving its last province out", (pg, id) => { pg.sb.moveTarget = null; pg.sb.doMoveProvince(100, id, 22); }],
      ["🧽 the Erase brush on its last province", (pg) => { pg.sb.beginEraseStroke(); pg.sb.eraseAt(1, 9); pg.sb.commitEraseStroke(); }],
    ]) {
      const pg = await openPage();
      const s = pg.sb;
      const id = newStateQueue(pg, [100]);
      const fired = during(pg, /create-state$/, () => click(pg, id));
      await s.flushMapSaves(); await P.settle(20);
      ok(fired(), `THE CONTROL: ${name} with the state's Create state in flight`);
      const made = newStateFiles(pg.M);
      ok(made.length === 1 && stateProvinces(pg.M, made[0]).join() === "100", `⭐⭐⭐ ${name}: the new state holds its province`, made.map((f) => [f, stateProvinces(pg.M, f)]));
      ok(!(await fatalRules(pg.M)).includes("empty_state"), "⭐⭐⭐ …so no state is left on disk with provinces = { } and no state on the page", await fatalRules(pg.M));
      ok(s.stateById.has(Number(made[0] && made[0].split("-")[0])), "⭐⭐ …and the page still knows the state", [...s.stateById.keys()]);
      ok(s.pendingWrites.length === 0 && pg.statuses.some((l) => SAVING.test(l)), "⭐⭐ …and it said a Save is running, with nothing left queued", pg.statuses.slice(-5));
    }
    {
      // the mirror: + New state during a Save would go out with no province in it, past the purge at the head of the Save that stops exactly that
      const pg = await openPage();
      const s = pg.sb;
      s.queueWrite("/api/map/set-owner", { stateId: 21, owner: "BBB" });
      const fired = during(pg, /set-owner$/, () => pg.els.get("mapNewState").listeners.click[0]());
      await s.flushMapSaves(); await P.settle(20);
      ok(fired() && newStateFiles(pg.M).length === 0 && pg.posted.join() === "set-owner", "⭐⭐⭐ + New state during a Save: no state goes to disk with provinces = { }", [pg.posted, newStateFiles(pg.M)]);
      ok(!(await fatalRules(pg.M)).includes("empty_state") && s.moveTarget === null, "⭐⭐ …no empty_state, and the fill tool is not armed", s.moveTarget);
      ok(pg.statuses.some((l) => SAVING.test(l)), "⭐⭐ …and it said a Save is running", pg.statuses.slice(-4));
    }
    {
      // a fill click after the state's create has answered: the tool's target is the id the server gave it, not the provisional one
      const pg = await openPage();
      const s = pg.sb;
      const id = newStateQueue(pg, [116]);
      s.queueWrite("/api/map/set-owner", { stateId: 21, owner: "BBB" });
      const fired = during(pg, /set-owner$/, () => s.handleMoveClick(117, s.model.provinceToState[117]));
      await s.flushMapSaves(); await P.settle(20);
      const made = newStateFiles(pg.M);
      ok(fired() && made.length === 1 && stateProvinces(pg.M, made[0]).join() === "116,117", "⭐⭐ a fill click with a later write in flight lands in the new state", made.map((f) => stateProvinces(pg.M, f)));
      const real = Number(made[0].split("-")[0]);
      ok(s.moveTarget === real, "⭐⭐ the fill tool's target is the state's real id now", [id, s.moveTarget]);
      ok(s.model.provinceToState[117] === real && (s.stateById.get(real).provinces || []).includes(117), "⭐ …and the page holds the province in it", s.model.provinceToState[117]);
      s.handleMoveClick(118, s.model.provinceToState[118]);
      await s.flushMapSaves(); await P.settle(20);
      ok(stateProvinces(pg.M, made[0]).join() === "116,117,118" && !/Dropped/.test(pg.last()), "⭐⭐⭐ …and a fill click after the Save has ended is not dropped by the next Save as pointing at a state you discarded", [stateProvinces(pg.M, made[0]), pg.last().slice(0, 100)]);
    }

    console.log("\n-- 4. THE OTHER CLICKS THAT TAKE A WRITE OUT, AND THE ONES THAT MAY ADD --");
    {
      // 🧽 Erase drops a staged move of the province it erases: a stroke during a Save is refused, and the move in flight is not what it costs
      const pg = await openPage();
      const s = pg.sb;
      s.doMoveProvince(100, 21, 22);
      s.queueWrite("/api/map/set-owner", { stateId: 23, owner: "BBB" });
      const fired = during(pg, /move-province$/, () => { s.beginEraseStroke(); s.eraseAt(1, 9); s.commitEraseStroke(); });
      await s.flushMapSaves(); await P.settle(20);
      ok(fired() && pg.posted.join() === "move-province,set-owner" && s.pendingWrites.length === 0, "⭐⭐⭐ the Erase brush with a queued move in flight: the write behind it was not taken out in its place", pg.posted);
      ok(typeOnDisk(pg.M, 100) === "land" && s.provinceType.get(100) === "land", "⭐⭐ …the province stays land on the page and on disk", [typeOnDisk(pg.M, 100), s.provinceType.get(100)]);
      ok(pg.statuses.some((l) => SAVING.test(l) && /Erase/.test(l)), "⭐⭐ …and it said the brush waits for the Save", pg.statuses.slice(-4));
    }
    {
      // 🗑 Delete map: `pendingWrites = []` under a Save
      const pg = await openPage();
      const s = pg.sb;
      s.queueWrite("/api/map/set-owner", { stateId: 21, owner: "BBB" });
      s.queueWrite("/api/map/set-owner", { stateId: 22, owner: "BBB" });
      const fired = during(pg, /set-owner$/, () => s.blankMapLocal());
      await s.flushMapSaves(); await P.settle(20);
      ok(fired() && pg.posted.join() === "set-owner,set-owner" && statesOnDisk(pg.M).length === 3, "⭐⭐⭐ 🗑 Delete map during a Save: it neither replaced the queue nor ran", pg.posted);
      ok(s.provinceType.get(100) === "land" && pg.statuses.some((l) => SAVING.test(l)), "⭐⭐ …the page's map is as it was, and it said a Save is running", pg.statuses.slice(-4));
    }
    {
      // 🧹 Clear all rivers takes the staged strokes out and writes at once
      const pg = await openPage();
      const s = pg.sb;
      s.queueWrite("/api/map/rivers-paint", { edits: [{ x: 5, y: 20, index: 0 }, { x: 6, y: 20, index: 3 }] }, { rivers: true });
      s.queueWrite("/api/map/set-owner", { stateId: 21, owner: "BBB" });
      const fired = during(pg, /rivers-paint$/, () => pg.els.get("mapRiversClear").listeners.click[0]());
      await s.flushMapSaves(); await P.settle(20);
      ok(fired() && !pg.posted.includes("rivers-clear") && pg.posted.join() === "rivers-paint,set-owner", "⭐⭐⭐ 🧹 Clear all rivers during a Save: nothing was cleared, and the write behind the stroke in flight was not taken out in its place", pg.posted);
      ok(pg.statuses.some((l) => SAVING.test(l)), "⭐⭐ …and it said a Save is running", pg.statuses.slice(-4));
    }
    {
      // 🛟 Restore baseline's restore, reached by its dialog's yes
      const src = P.MAP;
      const at = P.MASKED.indexOf("const doRestore = async () => {"), end = P.MASKED.indexOf("\n      };", at);
      const pg = await openPage();
      const s = pg.sb;
      s.restoreBaseBtn = P.element(); s.close = () => {};
      vm.runInContext(src.slice(at, end + "\n      };".length) + "\nglobalThis.doRestore = doRestore;", s);
      s.queueWrite("/api/map/set-owner", { stateId: 21, owner: "BBB" });
      const fired = during(pg, /set-owner$/, () => { s.doRestore(); });
      await s.flushMapSaves(); await P.settle(20);
      ok(fired() && pg.posted.join() === "set-owner", "⭐⭐⭐ 🛟 Restore baseline during a Save: it did not run", pg.posted);
      ok(pg.statuses.some((l) => SAVING.test(l)) && s.restoreBaseBtn.textContent !== "Restoring…", "⭐⭐ …and it said a Save is running", pg.statuses.slice(-4));
    }
    {
      // ✏ Paint shape: paintDiff.clear() at the end of the Save's paint took every pixel a stroke had added since it went out
      const pg = await openPage();
      const s = pg.sb;
      const c = colour(108);
      s.brush = { r: c[0], g: c[1], b: c[2], provinceId: 108, ownerColor: [1, 2, 3] };
      s.lastPaintPt = null; s.brushRadius = 1; s.paintAt(3, 17);
      const sent = s.paintDiff.size;
      ok(sent > 0, "THE CONTROL: a stroke of province 108 is staged", sent);
      const fired = during(pg, /paint-provinces$/, () => { s.lastPaintPt = null; s.paintAt(10, 17); });
      await s.flushMapSaves(); await P.settle(20);
      ok(fired() && s.paintDiff.size === 0 && pg.statuses.some((l) => SAVING.test(l)), "⭐⭐⭐ a stroke with the Save's paint in flight refuses and says a Save is running", pg.statuses.slice(-5));
      const px = (x, y) => { const i = (y * W + x) * 4, d = s.baseImageData.data; return [d[i], d[i + 1], d[i + 2]]; };
      ok(px(10, 17).join() !== c.join(), "⭐⭐⭐ …so no pixel is on screen that the Save was never sent, and the page's baseline cannot take one in", px(10, 17));
    }
    {
      // a write ADDED once the Save's walk is over stays queued, and everything that asks about unsaved work is told so
      const pg = await openPage();
      const s = pg.sb;
      const c = colour(108);
      s.brush = { r: c[0], g: c[1], b: c[2], provinceId: 108, ownerColor: [1, 2, 3] };
      s.lastPaintPt = null; s.paintAt(3, 17);
      const fired = during(pg, /paint-provinces$/, () => s.queueWrite("/api/map/set-owner", { stateId: 21, owner: "BBB" }));
      await s.flushMapSaves(); await P.settle(20);
      ok(fired() && s.pendingWrites.length === 1, "THE CONTROL: an owner change staged with the province shapes in flight is still queued when the Save ends", s.pendingWrites);
      ok(s.mapHasUnsavedWork() === true && s.dirtyMap === true, "⭐⭐⭐ …and the page knows: the quit dialog and the nav guard ask (the Save's end said nothing was unsaved)", s.dirtyMap);
      ok(/1 change you made while the province shapes were saving is still unsaved/.test(pg.last()), "⭐⭐ …and the Save's line says it", pg.last().slice(0, 400));
      await s.flushMapSaves(); await P.settle(20);
      ok(s.pendingWrites.length === 0 && s.dirtyMap === false && /owner\s*=\s*BBB/.test(fs.readFileSync(path.join(pg.M, "history/states/21-Land.txt"), "utf8")), "⭐⭐ …and the next Save writes it", s.pendingWrites);
    }
    {
      // ADDING, and keeping the latest, during a Save goes on working: a lone write the Terrain brush replaces, what stands behind it, a write made during the Save, and the walk's own progress line
      const pg = await openPage();
      const s = pg.sb;
      paintTerrain(pg, 100, "hills");
      s.queueWrite("/api/map/set-owner", { stateId: 23, owner: "BBB" });
      const fired = during(pg, /set-province-terrain$/, () => { paintTerrain(pg, 100, "desert"); s.queueWrite("/api/map/set-owner", { stateId: 21, owner: "BBB" }); });
      await s.flushMapSaves(); await P.settle(20);
      ok(fired() && pg.posted.join() === "set-province-terrain,set-owner,set-province-terrain,set-owner", "⭐⭐⭐ the Terrain brush replaced its lone write with it in flight: the old write landed once, what was behind it was not taken out, and the two made during the Save went out", pg.posted);
      ok(terrainOnDisk(pg.M, 100) === "desert", "⭐⭐⭐ …and the terrain on disk is the latest", terrainOnDisk(pg.M, 100));
      const owns = (f) => /owner\s*=\s*BBB/.test(fs.readFileSync(path.join(pg.M, "history/states", f), "utf8"));
      ok(owns("21-Land.txt") && owns("23-Land.txt"), "⭐⭐ …and both owners landed", [owns("21-Land.txt"), owns("23-Land.txt")]);
      ok(s.pendingWrites.length === 0 && /Saved 4 changes/.test(pg.last()), "⭐⭐ …the line counts what landed", pg.last().slice(0, 100));
      const counts = pg.statuses.filter((l) => /^Saving…/.test(l)).map((l) => /\((\d+)(?:–(\d+))?\/(\d+)\)/.exec(l)).filter(Boolean).map((m) => [Number(m[2] || m[1]), Number(m[3])]);
      ok(counts.length === 4 && counts.every(([n, of]) => n <= of), "⭐ …and the progress line never reads past its own total", counts);
    }
    {
      // …the same, through a country's colour, the other click that keeps its latest
      const pg = await openPage();
      const s = pg.sb;
      const pick = (hex) => { s.$("mapCountryColor").listeners.change[0]({ target: { value: hex } }); };
      s.countrySelect.value = "AAA";
      pick("#111111");
      s.queueWrite("/api/map/set-owner", { stateId: 23, owner: "BBB" });
      const fired = during(pg, /set-country-color$/, () => pick("#222222"));
      await s.flushMapSaves(); await P.settle(20);
      const colors = fs.readFileSync(path.join(pg.M, "common/countries/colors.txt"), "utf8");
      ok(fired() && pg.posted.join() === "set-country-color,set-owner,set-country-color" && s.pendingWrites.length === 0, "⭐⭐ a colour picked again with the first in flight: the first landed once, the write behind it was not taken out, and the new one went last", pg.posted);
      ok(/AAA\s*=\s*\{[^}]*rgb\s*\{\s*34\s+34\s+34\s*\}/.test(colors), "⭐⭐ …and colors.txt has the latest", colors.slice(0, 120));
    }
    {
      // Set capital clicked again with its write in flight goes behind it: a write per click, in click order
      const pg = await openPage();
      const s = pg.sb;
      s.selected = null;
      s.setCapitalAt(1, 17);
      s.queueWrite("/api/map/set-owner", { stateId: 23, owner: "BBB" });
      const fired = during(pg, /set-capital$/, () => s.setCapitalAt(1, 25));
      await s.flushMapSaves(); await P.settle(20);
      // (⛔ #a-capital-state-keeps-a-victory-point — …and, once they have landed, the Save's one keep-capitals for the capital they named)
      ok(fired() && pg.posted.join() === "set-capital,set-owner,set-capital,keep-capitals" && s.pendingWrites.length === 0, "⭐⭐ Set capital clicked with its write in flight: both landed, and what stood between them", pg.posted);
      ok(/capital\s*=\s*23/.test(fs.readFileSync(path.join(pg.M, "history/countries/AAA - Alpha.txt"), "utf8")) && /Saved 3 changes/.test(pg.last()), "⭐⭐ …and the capital on disk is the last one clicked", pg.last().slice(0, 100));
    }
    {
      // an erase stroke's answers come in one request and are read in order: a write added during it does not shift them
      const pg = await openPage();
      const s = pg.sb;
      s.beginEraseStroke(); s.eraseAt(1, 9); s.eraseAt(9, 9); s.commitEraseStroke();
      ok(s.pendingWrites.length === 2, "THE CONTROL: an Erase stroke of two provinces is queued", s.pendingWrites.length);
      const fired = during(pg, /flip-provinces-sea$/, () => s.queueWrite("/api/map/set-owner", { stateId: 23, owner: "BBB" }));
      await s.flushMapSaves(); await P.settle(20);
      ok(fired() && pg.posted.join() === "flip-provinces-sea,set-owner" && s.pendingWrites.length === 0, "⭐⭐ the stroke went as one request, the write added during it after", pg.posted);
      ok(typeOnDisk(pg.M, 100) === "sea" && typeOnDisk(pg.M, 101) === "sea" && /Saved 3 changes/.test(pg.last()), "⭐ …and both provinces are sea", [typeOnDisk(pg.M, 100), typeOnDisk(pg.M, 101), pg.last().slice(0, 80)]);
    }

    console.log("\n-- 5. WHAT LOOKING AT EVERY CLICK THAT TAKES A WRITE OUT TURNED UP, WITH NO SAVE RUNNING --");
    {
      // the Terrain brush keeps ITS latest: a province inspector write for the same province carries the type and the coastal flag too, and is not the brush's to replace
      const pg = await openPage();
      const s = pg.sb;
      const row = (id) => fs.readFileSync(path.join(pg.M, "map/definition.csv"), "utf8").split(/\r?\n/).find((l) => l.startsWith(`${id};`)).split(";");
      ok(row(100)[5] === "true", "THE CONTROL: province 100 is coastal on disk", row(100));
      s.queueWrite("/api/map/set-province-terrain", { provinceId: 100, terrain: "plains", type: "land", coastal: false });   // what saveProvinceTerrain queues
      s.provinceDef.set(100, Object.assign({}, s.provinceDef.get(100), { coastal: false }));
      paintTerrain(pg, 100, "hills");
      paintTerrain(pg, 101, "hills"); paintTerrain(pg, 101, "desert");
      ok(s.pendingWrites.length === 3 && s.pendingWrites.filter((w) => w.body.provinceId === 101).length === 1, "⭐ the brush replaced only its own earlier write", s.pendingWrites.map((w) => w.body));
      await s.flushMapSaves(); await P.settle(20);
      ok(row(100)[5] === "false" && row(100)[6] === "hills", "⭐⭐⭐ the inspector's change and the brush's both reach the disk: a brush stroke did not silently take the staged coastal or type change out", row(100));
      ok(row(101)[6] === "desert", "…and the brush's latest is what landed", row(101));
    }
    {
      // the recovery bar outlives a first edit: Restore over a queue of the modder's own threw the queue away, under a line saying "Restored"
      const pg = await openPage();
      const s = pg.sb;
      s.showRestoreBar({ modPath: pg.M, ts: Date.now(), writes: [{ url: "/api/map/set-owner", body: { stateId: 22, owner: "BBB" }, meta: {} }] });
      s.queueWrite("/api/map/set-owner", { stateId: 21, owner: "BBB" });
      pg.els.get("mapRestoreBtn").listeners.click[0]();
      ok(s.pendingWrites.length === 1 && s.pendingWrites[0].body.stateId === 21, "⭐⭐⭐ Restore with staged edits of your own does not replace them", s.pendingWrites.map((w) => w.body));
      ok(/Save|Undo/.test(pg.last()) && !/^Restored/.test(pg.last()), "⭐⭐ …and says what to do first", pg.last());
      s.pendingWrites.length = 0;
      pg.els.get("mapRestoreBtn").listeners.click[0]();
      ok(s.pendingWrites.length === 1 && s.pendingWrites[0].body.stateId === 22 && /^Restored 1/.test(pg.last()), "THE CONTROL: with nothing staged it restores", s.pendingWrites.map((w) => w.body));
    }
    {
      // the state panel's own record of which state it holds follows the id the server gave, as the selection and the fill tool do
      const asked = [];
      const pg = await openPage({ extra: { stageStateWrite: (sid) => { asked.push(sid); } } });
      const s = pg.sb;
      const id = newStateQueue(pg, [116]);
      s.selected = { provinceId: 116, stateId: id };
      s.stateFormBaseline = { stateId: id, provinceId: 116, sig: "as filled" };
      await s.flushMapSaves(); await P.settle(20);
      const real = Number(newStateFiles(pg.M)[0].split("-")[0]);
      ok(s.selected.stateId === real && s.stateFormBaseline.stateId === real, "⭐⭐⭐ with a new state open in the panel, the Save leaves the panel on its real id, or typing there next goes to a state nobody can find and the next Save drops it", [s.selected.stateId, s.stateFormBaseline.stateId]);
      s.stateFormDirty = () => true;
      s.queueWrite("/api/map/set-owner", { stateId: 21, owner: "BBB" });
      await s.flushMapSaves(); await P.settle(20);
      ok(asked.length === 1 && asked[0] === real, "⭐⭐ …and the next Save stages the typing for that id", asked);
    }
    {
      // the Move tool's pick keeps the provisional id across the Save: the page finds a province's state by scanning, so the drop still moves it, and the state it emptied still goes
      const pg = await openPage();
      const s = pg.sb;
      const id = newStateQueue(pg, [116]);
      s.moveTarget = null;
      s.handleMoveClick(116, id);
      ok(s.moveSource && s.moveSource.stateId === id, "THE CONTROL: province 116 was picked with the Move tool, in the new state", s.moveSource);
      await s.flushMapSaves(); await P.settle(20);
      const made = newStateFiles(pg.M);
      ok(made.length === 1 && stateProvinces(pg.M, made[0]).includes(116), "…and the Save made the new state, holding it", made);
      s.handleMoveClick(108, 22);
      await s.flushMapSaves(); await P.settle(20);
      ok(!/Save stopped/.test(pg.last()) && s.pendingWrites.length === 0, "⭐⭐ the drop after the Save goes through", [pg.posted, pg.last().slice(0, 200)]);
      ok(newStateFiles(pg.M).length === 0 && stateProvinces(pg.M, "22-Land.txt").includes(116), "⭐⭐⭐ …province 116 is in the state it was dropped on, and no empty state is left on disk", [statesOnDisk(pg.M), stateProvinces(pg.M, "22-Land.txt")]);
    }

    {
      // ↶ Undo of the province inspector's edit: it was made in place, in the object every snapshot holds, so Undo took the write out of the queue and the page went on showing it
      const pg = await openPage();
      const s = pg.sb;
      const sel = (id, v) => { pg.els.get(id) || s.$(id); pg.els.get(id).value = v; };
      s.selected = { provinceId: 100, stateId: 21 };
      sel("miTypeSel", "land"); sel("miTerrainSel", "hills"); s.$("miCoastalChk").checked = true;
      await s.saveProvinceTerrain();
      ok(s.pendingWrites.length === 1 && s.provinceDef.get(100).terrain === "hills", "THE CONTROL: the inspector staged hills on province 100, and the page shows it", s.pendingWrites.map((w) => w.body));
      s.doUndo();
      ok(s.pendingWrites.length === 0 && s.provinceDef.get(100).terrain === "plains", "⭐⭐⭐ ↶ takes it back on the page as well as out of the queue", s.provinceDef.get(100).terrain);
      paintTerrain(pg, 100, "hills");
      ok(s.pendingWrites.length === 1 && s.pendingWrites[0].body.terrain === "hills", "⭐⭐ …so the brush can paint it after that: it read \"already that terrain\" and queued nothing, over a disk that never got it", s.pendingWrites.map((w) => w.body));
      await s.flushMapSaves(); await P.settle(20);
      ok(terrainOnDisk(pg.M, 100) === "hills", "⭐ …and the disk has it", terrainOnDisk(pg.M, 100));
    }
    {
      // the two purges at the head of a Save: with Auto-fix off a new state can be filled and emptied, so a write still names the state the purge of empty new states takes away
      const pg = await openPage();
      const s = pg.sb;
      s.autoFix = false;
      const id = newStateQueue(pg, [116]);
      s.moveTarget = null;
      s.doMoveProvince(116, id, 22);
      ok(s.stateById.has(id) && !s.stateById.get(id).provinces.length && s.pendingWrites.length === 3, "THE CONTROL: Auto-fix off: a Create state, the move into it and the move back out are queued, and the state is empty", s.pendingWrites.map((w) => w.url));
      await s.flushMapSaves(); await P.settle(20);
      ok(!/Save stopped/.test(pg.last()) && s.pendingWrites.length === 0 && pg.posted.join() === "move-province", "⭐⭐⭐ the Save does not stop at \"State -1 not found\": the move out is all it has to write", [pg.posted, pg.last().slice(0, 120)]);
      ok(newStateFiles(pg.M).length === 0 && stateProvinces(pg.M, "22-Land.txt").includes(116) && !stateProvinces(pg.M, "23-Land.txt").includes(116), "⭐⭐ …province 116 is in state 22 on disk, and no new state was made", stateProvinces(pg.M, "22-Land.txt"));
      ok(/Discarded 1 new state/.test(pg.last()) && /Dropped 1 unsaved change/.test(pg.last()), "⭐ …and the line says what went", pg.last().slice(0, 400));
    }
    for (const [name, gone] of [
      ["a Save's purge of a new state with nothing in it", async (pg) => { pg.sb.queueWrite("/api/map/set-owner", { stateId: 21, owner: "BBB" }); await pg.sb.flushMapSaves(); await P.settle(20); }],
      ["↶ Undo of the + New state", async (pg) => { pg.sb.doUndo(); }],
    ]) {
      // the fill tool armed on a state that has gone took the province out of its state on the page, for a write the next Save drops
      const pg = await openPage();
      const s = pg.sb;
      pg.els.get("mapNewState").listeners.click[0]();
      const id = s.moveTarget;
      await gone(pg);
      ok(id < 0 && !s.stateById.has(id), `THE CONTROL: ${name} took the new state away`, [...s.stateById.keys()]);
      const queued = s.pendingWrites.length;
      s.handleMoveClick(116, s.model.provinceToState[116]);
      ok(s.pendingWrites.length === queued && s.model.provinceToState[116] === 23 && s.stateById.get(23).provinces.includes(116), "⭐⭐⭐ a fill click after that changes nothing: the province stays in its state, and no write goes to a state that is gone", s.pendingWrites.map((w) => w.body));
      ok(s.moveTarget === null && /gone/.test(pg.last()), "⭐⭐ …and it says so and disarms the tool", [s.moveTarget, pg.last()]);
    }
    {
      // Set capital kept only its latest write, at the END of the queue, so a second click took out the write a merge in between had needed:
      // the server refuses to merge a capital away, so every Save stopped at that merge, and only a reload that lost the staged work got out
      const pg = await openPage();
      const s = pg.sb;
      const capital = () => fs.readFileSync(path.join(pg.M, "history/countries/AAA - Alpha.txt"), "utf8").trim();
      s.selected = null;
      s.setCapitalAt(1, 25);
      s.doMergeState(21, 23);
      ok(s.model.capitals.AAA === 23 && !s.stateById.has(21) && s.pendingWrites.length === 2, "THE CONTROL: AAA's capital went from state 21 to state 23, and that is what let state 21 merge away", s.pendingWrites.map((w) => w.url));
      s.setCapitalAt(1, 17);
      await s.flushMapSaves(); await P.settle(20);
      ok(!/Save stopped/.test(pg.last()) && s.pendingWrites.length === 0, "⭐⭐⭐ a second Set capital does not wedge the Save at the merge the first one made legal", [pg.posted, pg.last().slice(0, 200)]);
      ok(!statesOnDisk(pg.M).some((f) => /^21-/.test(f)) && stateProvinces(pg.M, "23-Land.txt").includes(100), "⭐⭐⭐ …state 21 is merged on disk", statesOnDisk(pg.M));
      ok(/capital\s*=\s*22/.test(capital()) && s.model.capitals.AAA === 22, "⭐⭐⭐ …and the capital on disk is the last one clicked", capital());
    }
    {
      // what keeping only the latest was for: two clicks in a row still end on the second, and ↶ of the second still ends on the first
      const pg = await openPage();
      const s = pg.sb;
      s.selected = null;
      s.setCapitalAt(1, 25); s.setCapitalAt(1, 17);
      await s.flushMapSaves(); await P.settle(20);
      ok(/capital\s*=\s*22/.test(fs.readFileSync(path.join(pg.M, "history/countries/AAA - Alpha.txt"), "utf8")) && s.pendingWrites.length === 0, "⭐⭐ two capital clicks end on the second", pg.posted);
      const pg2 = await openPage();
      const t = pg2.sb;
      t.selected = null;
      t.setCapitalAt(1, 25); t.setCapitalAt(1, 17); t.doUndo();
      await t.flushMapSaves(); await P.settle(20);
      ok(/capital\s*=\s*23/.test(fs.readFileSync(path.join(pg2.M, "history/countries/AAA - Alpha.txt"), "utf8")) && t.model.capitals.AAA === 23, "⭐⭐ …and ↶ of the second ends on the first", pg2.posted);
    }

    console.log("\n-- 5b. WHAT THE OTHER BRANCHES ADDED TO THE QUEUE MEETS THE RULE --");
    const setType = (s, type) => { s.$("miTypeSel").value = type; return s.saveProvinceTerrain(); };
    const onInspector = (s, id, type) => { s.selected = { provinceId: id }; const d = s.provinceDef.get(id); s.$("miTypeSel").value = type; s.$("miTerrainSel").value = d.terrain; s.$("miCoastalChk").checked = !!d.coastal; };
    {
      // #a-type-turned-back-writes-nothing takes a staged raise back: with that raise on its way it is not the dropdown's to take back
      const pg = await openPage();
      const s = pg.sb;
      onInspector(s, SEA, "land");
      await s.saveProvinceTerrain();
      ok(s.pendingWrites.length === 1 && s.pendingWrites[0].meta.was && s.pendingWrites[0].meta.was.type === "sea", "THE CONTROL: the Type dropdown queued the raise, and what the province was", s.pendingWrites.map((w) => [w.body, w.meta]));
      const fired = during(pg, /set-province-terrain$/, () => { setType(s, "sea"); });
      await s.flushMapSaves(); await P.settle(20);
      ok(fired(), "…and it is turned back with the raise in flight");
      ok(typeOnDisk(pg.M, SEA) === "land" && s.provinceDef.get(SEA).type === "land" && s.provinceType.get(SEA) === "land" && s.$("miTypeSel").value === "land", "⭐⭐⭐ the page says what the disk says: land, and the dropdown is put back", [typeOnDisk(pg.M, SEA), s.provinceDef.get(SEA).type, s.provinceType.get(SEA), s.$("miTypeSel").value]);
      ok(pg.statuses.some((t) => SAVING.test(String(t)) && /Type/.test(String(t))), "⭐⭐ …and it says a Save is running", pg.statuses.slice(-4));
      ok(s.pendingWrites.length === 0 && pg.posted.filter((u) => u === "set-province-terrain").length === 1, "⭐ the raise went once, and nothing is left queued", pg.posted);
    }
    {
      // …and a take-back is an Undo step like any other: #an-undo-takes-the-inspectors-edit-back, a copy in the map, so ↶ gets back what the queue gets back
      const pg = await openPage();
      const s = pg.sb;
      onInspector(s, SEA, "land");
      await s.saveProvinceTerrain();
      await setType(s, "sea");
      ok(s.pendingWrites.length === 0 && s.provinceDef.get(SEA).type === "sea", "THE CONTROL: with no Save running the dropdown turned back takes the raise back", s.pendingWrites.map((w) => w.body));
      s.doUndo();
      ok(s.pendingWrites.length === 1 && s.pendingWrites[0].body.type === "land" && s.provinceDef.get(SEA).type === "land", "⭐⭐⭐ ↶ brings the raise back into the queue and onto the page: the two agree", [s.pendingWrites.map((w) => w.body), s.provinceDef.get(SEA).type]);
    }
    {
      // the 🏘 towns of a state go with it on Delete (#a-queued-town-is-the-panels-own): with a Save running they are not the button's to take out
      const pg = await openPage();
      const s = pg.sb;
      s.selected = { provinceId: 100, stateId: 21 };
      s.queueWrite("/api/map/set-owner", { stateId: 23, owner: "BBB" });
      s.queueWrite("/api/map/victory-point-towns", { stateId: 21, provinces: [100] });
      const fired = during(pg, /set-owner$/, () => s.$("miDeleteBtn").listeners.click[0]());
      await s.flushMapSaves(); await P.settle(20);
      ok(fired(), "…the Delete button is clicked with a Save running and the state's town still queued");
      ok(pg.posted.includes("victory-point-towns") && !pg.posted.includes("delete-state") && statesOnDisk(pg.M).some((f) => /^21-/.test(f)), "⭐⭐⭐ the town went, and the state stands: the click took nothing out", pg.posted);
      ok(pg.statuses.some((t) => SAVING.test(String(t)) && /towns/.test(String(t))), "⭐⭐ …and it says a Save is running", pg.statuses.slice(-4));
    }
    {
      // #a-coast-painted-back-brings-its-dockyards-back takes a staged paint back out of the queue when its province is painted back into the state whose
      // dockyards it took: with that paint on its way it is not the click's to take out. (The dockyards the click recorded are written into its meta here,
      // as the click records them when the province is its state's last coast: a paint back is a paint whose meta says it took that state's.)
      const pg = await openPage();
      const s = pg.sb;
      s.doMoveProvince(107, 21, 22);
      const paint = s.pendingWrites.find((w) => w.url === "/api/map/move-province" && w.body && w.body.provinceId === 107);
      ok(!!paint && s.model.provinceToState[107] === 22, "THE CONTROL: province 107 is painted into state 22, and the paint is queued", s.pendingWrites.map((w) => [w.url, w.body]));
      if (paint) paint.meta = Object.assign({}, paint.meta, { yards: [{ from: 21, keys: { dockyard: 1 } }] });
      const fired = during(pg, /move-province$/, () => s.doMoveProvince(107, 22, 21));
      await s.flushMapSaves(); await P.settle(20);
      const f22 = statesOnDisk(pg.M).find((f) => /^22-/.test(f));
      ok(fired(), "…and it is painted back into state 21 with that paint in flight");
      ok(!!f22 && (stateProvinces(pg.M, f22) || []).includes(107) && s.model.provinceToState[107] === 22, "⭐⭐⭐ the page says what the disk says: province 107 is in state 22 on both", { disk: f22 && stateProvinces(pg.M, f22), page: s.model.provinceToState[107] });
      ok(pg.statuses.some((t) => SAVING.test(String(t)) && /put it back/.test(String(t))), "⭐⭐ …and it says a Save is running", pg.statuses.slice(-4));
      ok(s.pendingWrites.length === 0 && pg.posted.filter((u) => u === "move-province").length === 1, "⭐ the paint went once, and nothing is left queued", pg.posted);
    }
    {
      const pg = await openPage();
      const s = pg.sb;
      s.doMoveProvince(107, 21, 22);
      const paint = s.pendingWrites.find((w) => w.url === "/api/map/move-province" && w.body && w.body.provinceId === 107);
      if (paint) paint.meta = Object.assign({}, paint.meta, { yards: [{ from: 21, keys: { dockyard: 1 } }] });
      s.doMoveProvince(107, 22, 21);
      ok(!!paint && !s.pendingWrites.includes(paint) && !s.pendingWrites.some((w) => w.url === "/api/map/move-province") && s.model.provinceToState[107] === 21,
        "THE CONTROL: with no Save running, painting it back takes the staged paint back, and queues no move", s.pendingWrites.map((w) => [w.url, w.body]));
    }
    {
      // a Save's own staging of the panel comes before it counts as running, or the guard on the panel's towns would stop the Save itself replacing them
      const seen = [];
      let pg = null;
      pg = await openPage({ extra: { stageStateWrite: () => { seen.push(!!pg.sb.flushMapSaves.running); } } });
      pg.sb.stateFormDirty = () => true;
      pg.sb.stateFormBaseline = { stateId: 21, provinceId: 100, sig: "as filled" };
      await pg.sb.flushMapSaves(); await P.settle(20);
      ok(seen.length === 1 && seen[0] === false && !pg.sb.flushMapSaves.running, "⭐⭐ 💾 stages the panel before the Save counts as running", seen);
    }

    console.log("\n-- 6. THE RULE, DERIVED: every statement that takes a write or a pixel out is the Save's own, a guarded click's, or keeps the latest --");
    {
      const masked = P.MASKED, map = P.MAP;
      // each statement's owner: the function or handler at the IIFE's own two-space indent that it stands in
      const heads = [];
      for (const m of masked.matchAll(/\n {2}(?:async )?function (\w+)|\n {2}(?:if \(\$\("\w+"\)\) )?\$\("(\w+)"\)\.addEventListener\(|\n {2}(?:const|let) (\w+) = (?:async )?\(/g)) heads.push({ at: m.index, name: m[1] || m[2] || m[3] });
      const enclosing = (at) => { let h = null; for (const x of heads) { if (x.at < at) h = x; else break; } return h; };
      const guarded = (h, at) => masked.slice(h.at, at).includes("flushMapSaves.running");
      const REMOVE = /(?<![.\w])pendingWrites\s*=(?!=)|(?<![.\w])pendingWrites\.(?:splice|shift|pop)\(|(?<![.\w])paintDiff\s*=(?!=)|(?<![.\w])paintDiff\.(?:clear|delete)\(/g;
      const sites = [];
      for (const m of masked.matchAll(REMOVE)) {
        if (/\blet\s+$/.test(masked.slice(masked.lastIndexOf("\n", m.index) + 1, m.index))) continue;   // the declarations
        const h = enclosing(m.index);
        sites.push({ at: m.index, head: h, name: h.name, text: map.slice(m.index, map.indexOf("\n", m.index)).trim().slice(0, 90) });
      }
      ok(sites.length >= 12, "the statements were found", sites.map((s) => s.name));
      // a reload is the page starting over, and it asks first when anything is unsaved; and the Save's own purges and consumption are the Save's
      const OWN = new Set(["load", "flushMapSaves"]);
      // a helper that takes writes out has no click of its own to refuse: every function that calls it refuses ahead of the call
      // (mirrorLandTurnedWater: what an erase's flip does to the page's hubs and railways, #an-erase-takes-the-hub-and-the-rail-on-its-land, called by eraseProvinceLocal)
      const HELPERS = new Set(["applyMapSnapshot", "deleteEmptiedStates", "mirrorLandTurnedWater"]);
      const notes = [], kept = [];
      for (const site of sites) {
        if (OWN.has(site.name)) continue;
        if (HELPERS.has(site.name)) {
          const calls = [...masked.matchAll(new RegExp(`\\b${site.name}\\(`, "g"))].filter((c) => !/function\s+$/.test(masked.slice(masked.lastIndexOf("\n", c.index) + 1, c.index)));
          if (!calls.length) notes.push(`${site.name}: no caller found`);
          for (const c of calls) { const h = enclosing(c.index); if (!guarded(h, c.index)) notes.push(`${site.name}() is called from ${h.name} with no guard ahead of it`); }
          continue;
        }
        if (guarded(site.head, site.at)) continue;
        // keeps the latest: a filter of one url, and the very next statement queues that url again
        const after = masked.slice(site.at);
        const filter = /^pendingWrites = pendingWrites\.filter\(\(w\) => !\(w\.url === "([^"]+)"/.exec(after);
        const next = filter ? after.slice(after.indexOf("\n") + 1).split("\n").find((l) => l.trim()) || "" : "";
        if (filter && next.trim().startsWith(`queueWrite("${filter[1]}"`)) { kept.push(filter[1]); continue; }
        notes.push(`${site.name}: ${site.text}`);
      }
      ok(!notes.length, "⭐⭐⭐ no statement takes a write or a pixel out from under a Save unless it is the Save's own, refuses while one runs, or queues its own later write at once", notes);
      ok(kept.length >= 2 && new Set(kept).size === kept.length, "⭐ the ones that keep their latest are the ones the Save's consumption by identity is there for", kept);
      ok(!kept.includes("/api/map/set-capital"), "⭐⭐ …and Set capital is not one of them: a merge queued since an earlier click needs that one to have landed", kept);
      const own = sites.filter((s) => s.name === "flushMapSaves").map((s) => s.text);
      ok(!own.some((t) => /\.shift\(|\.splice\(0/.test(t)), "⭐⭐⭐ …and the Save takes out what it sent, not whatever is first", own);
    }
  } catch (e) {
    fail++; console.log("  FAIL the test threw: " + String((e && e.stack) || e).slice(0, 900));
  } finally {
    if (server) await new Promise((r) => server.close(r));
    if (path.dirname(path.resolve(ROOT)).toLowerCase() === path.resolve(os.tmpdir()).toLowerCase() && /^nova-edit-during-save-[A-Za-z0-9]{6}$/.test(path.basename(ROOT))) { try { fs.rmSync(ROOT, { recursive: true, force: true, maxRetries: 3 }); } catch (_) { /* a locked file: the temp clean-up gets it later */ } }
    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
  }
})().catch((e) => { console.error(e); process.exit(1); });
