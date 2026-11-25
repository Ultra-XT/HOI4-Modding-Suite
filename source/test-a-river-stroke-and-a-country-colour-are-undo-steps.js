// A river stroke and a 🎨 country-colour change are Undo steps: Undo takes each back, on screen and in the Save queue together,
// and Redo brings it back. #a-river-stroke-and-a-country-colour-are-undo-steps
//
// THE DEFECT (discovery F17, verified on 790cb21 by driving the real page with Playwright, scratchpad/batch10/discover/u2-undo.js):
// every staged Map tool calls pushUndo before it queues its write — except two. commitRiverEdits (the 🌊 Rivers mouseup) queues
// /api/map/rivers-paint, and the #mapCountryColor change handler queues /api/map/set-country-color, with no pushUndo, and
// snapshotMap does not hold countryColors. Measured:
//   S1  a river stroke, then ↶ Undo: the Save count stayed 1, the Undo button stayed disabled, History showed only "1. Loaded map",
//       and Save wrote map/rivers.bmp.
//   S2  terrain on province 1819, then a river stroke: count 2 but still one step, "Paint terrain". One Undo took the count to 0 —
//       the river went with the terrain edit. Redo brought both back; Undo again and Save wrote nothing.
//   S3  terrain on 2877, then SOV's colour set to #12ab34: count 2, one step. Undo: count 0 and Save disabled, while the colour input
//       still showed #12ab34 and the map kept SOV green. After a reload the colour was back to #7d0d18.
// So an Undo could not take either edit back, and undoing an OLDER step silently dropped them from the queue while the page kept
// showing them.
//
// Run as the page runs it: snapshotMap, applyMapSnapshot, pushUndo, doUndo, doRedo, queueWrite, rebuildStagedRiversFromPending,
// commitRiverEdits, beginTerrainStroke, syncCountryColorInput and the #mapCountryColor change handler are lifted out of
// public/map.js (testlib-map-page.js) and driven with the writes the page itself queues.
"use strict";

const P = require("./testlib-map-page.js");

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (ok || detail == null ? "" : "   -> " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 500)));
  if (!ok) fails.push(label);
};

const SOV = [125, 13, 24];   // vanilla's #7d0d18
const FUNCTIONS = [
  ["const UNDO_LIMIT = ", "\n"],
  "function rebuildStagedRiversFromPending()",
  "function snapshotMap()",
  "function applyMapSnapshot(s)",
  "function pushUndo(label)",
  "function doUndo()",
  "function doRedo()",
  "function queueWrite(url, body, meta)",
  ["function beginTerrainStroke()", "pushUndo(\"Paint terrain\"); }"],
  "function commitRiverEdits()",
  ["const rgbToHex = ", "\n"],
  ["const hexToRgb = ", "\n"],
  "function syncCountryColorInput()",
  "if ($(\"mapCountryColor\")) {",
];

function page() {
  const colorInput = P.element("input");
  const countrySelect = P.element("select");
  const countryColors = { SOV: SOV.slice(), GER: [96, 96, 96] };
  let recolors = 0;
  const { sb, statuses } = P.runPage(FUNCTIONS, {
    $: (id) => (id === "mapCountryColor" ? colorInput : null),
    countrySelect, countryColors,
    model: { states: [], provinceToState: {}, provinceToRegion: {}, stateToSupplyArea: {}, capitals: {}, strategicRegions: [], supplyAreas: [],
      adjacencies: [], supplyNodes: [], railways: [], countryColors },
    provinceToOwner: {}, provinceType: new Map(), provinceDef: new Map(), paintDiff: new Map(), pendingWrites: [], dirtyMap: false,
    undoStack: [], redoStack: [], historyLabels: ["Loaded map"], checkpoints: [],
    stateById: new Map(), selected: null, info: null, stateFormBaseline: null, baseImageData: null, baseImageDataPristine: null,
    riverEdits: [], stagedRiverEdits: [], lastRiverPt: null, terrainStroke: null, terrainChanged: 0,
    ownerColorCache: new Map(),
    recolorAll: () => { recolors++; }, draw() {}, buildPidGrid() {}, computeCentroids() {}, updateUndoButtons() {},
    regionRenameRefreshSelect() {}, supplyRenameRefreshSelect() {},
  });
  sb.setMapDirty = (d) => { sb.dirtyMap = d; };
  sb.ownerColor = (tag) => sb.countryColors[tag] || [70, 78, 92];
  const run = (code) => require("vm").runInContext(code, sb);
  return {
    sb, statuses, colorInput, countrySelect,
    run,
    urls: () => sb.pendingWrites.map((w) => w.url),
    steps: () => sb.undoStack.length,
    recolors: () => recolors,
    // 🌊 Rivers: the mouseup branch paints then calls commitRiverEdits(); the painted pixels are what paintRiversAt pushes.
    stroke: (pixels) => { sb.riverEdits = pixels.map(([x, y]) => ({ x, y, index: 3 })); run("commitRiverEdits();"); },
    // 🏔 Terrain: mousedown calls beginTerrainStroke(), a province under the brush queues what paintTerrainAt queues.
    terrain: (pid, terrain) => { run("beginTerrainStroke();"); run(`queueWrite("/api/map/set-province-terrain", { provinceId: ${pid}, terrain: "${terrain}" });`); },
    // 🎨 The picker: the Paint dropdown picks the tag, the colour input's change event runs the page's handler.
    pickColour: (tag, hex) => {
      countrySelect.value = tag; run("syncCountryColorInput();");
      colorInput.value = hex;
      for (const fn of colorInput.listeners.change || []) fn({ target: colorInput });
    },
  };
}

console.log("0. The page's own code, as this test runs it");
{
  const p = page();
  rec("the undo, river and colour functions were lifted out of public/map.js", typeof p.sb.snapshotMap === "function" && typeof p.sb.commitRiverEdits === "function" && typeof p.sb.syncCountryColorInput === "function");
  rec("the #mapCountryColor block registered exactly one change handler", (p.colorInput.listeners.change || []).length === 1, Object.keys(p.colorInput.listeners));
  p.countrySelect.value = "SOV"; p.run("syncCountryColorInput();");
  rec("THE CONTROL: the picker opens on SOV's colours.txt colour", p.colorInput.value === "#7d0d18", p.colorInput.value);
}

console.log("\n1. ⛔ A river stroke, then ↶ Undo, then ↷ Redo");
{
  const p = page();
  p.stroke([[10, 10], [11, 10], [12, 10]]);
  rec("the stroke is staged: one rivers-paint write, three pixels previewed", p.urls().join() === "/api/map/rivers-paint" && p.sb.stagedRiverEdits.length === 3, { urls: p.urls(), staged: p.sb.stagedRiverEdits.length });
  rec("⭐⭐ …and it is a step in History", p.steps() === 1 && p.sb.historyLabels.length === 2, p.sb.historyLabels);
  p.run("doUndo();");
  rec("⭐⭐⭐ Undo takes the stroke out of the Save queue", p.urls().length === 0, p.urls());
  rec("⭐⭐⭐ …and off the screen", p.sb.stagedRiverEdits.length === 0, p.sb.stagedRiverEdits);
  p.run("doRedo();");
  rec("⭐⭐ Redo puts the write back", p.urls().join() === "/api/map/rivers-paint", p.urls());
  rec("⭐⭐ …and the pixels", p.sb.stagedRiverEdits.length === 3 && p.sb.stagedRiverEdits.every((e) => e.y === 10 && e.index === 3), p.sb.stagedRiverEdits);
}

console.log("\n2. ⛔ Terrain on a province, then a river stroke, then Undo / Redo / Undo / Undo");
{
  const p = page();
  p.terrain(1819, "desert");
  p.stroke([[40, 40], [41, 40]]);
  rec("two edits, two steps", p.urls().join() === "/api/map/set-province-terrain,/api/map/rivers-paint" && p.steps() === 2, { urls: p.urls(), steps: p.steps() });
  p.run("doUndo();");
  rec("⭐⭐⭐ one Undo takes back the river only — the terrain edit stays queued", p.urls().join() === "/api/map/set-province-terrain", p.urls());
  rec("⭐⭐ …and the river is gone from the screen with it", p.sb.stagedRiverEdits.length === 0, p.sb.stagedRiverEdits.length);
  p.run("doRedo();");
  rec("⭐ Redo: both are queued again, and the river is drawn again", p.urls().length === 2 && p.sb.stagedRiverEdits.length === 2, { urls: p.urls(), staged: p.sb.stagedRiverEdits.length });
  p.run("doUndo(); doUndo();");
  rec("⭐ two Undos: nothing is left to save, and nothing is drawn", p.urls().length === 0 && p.sb.stagedRiverEdits.length === 0, { urls: p.urls(), staged: p.sb.stagedRiverEdits.length });
}

console.log("\n3. ⛔ Terrain on a province, then SOV's colour set to #12ab34, then Undo / Redo");
{
  const p = page();
  p.terrain(2877, "forest");
  p.pickColour("SOV", "#12ab34");
  rec("the colour is previewed and staged", JSON.stringify(p.sb.countryColors.SOV) === "[18,171,52]" && p.urls().join() === "/api/map/set-province-terrain,/api/map/set-country-color", { sov: p.sb.countryColors.SOV, urls: p.urls() });
  rec("⭐⭐ …as a step of its own", p.steps() === 2, p.sb.historyLabels);
  const before = p.recolors();
  p.run("doUndo();");
  rec("⭐⭐⭐ Undo takes the colour write out of the queue and leaves the terrain edit", p.urls().join() === "/api/map/set-province-terrain", p.urls());
  rec("⭐⭐⭐ …and the map goes back to SOV's own colour", JSON.stringify(p.sb.countryColors.SOV) === JSON.stringify(SOV) && p.recolors() > before, { sov: p.sb.countryColors.SOV, recolors: p.recolors() - before });
  rec("⭐⭐ …and so does the colour picker", p.colorInput.value === "#7d0d18", p.colorInput.value);
  p.run("doRedo();");
  const w = p.sb.pendingWrites[1];
  rec("⭐⭐ Redo queues the colour again, as the page queued it", !!w && w.url === "/api/map/set-country-color" && w.body.tag === "SOV" && JSON.stringify(w.body.rgb) === "[18,171,52]", w);
  rec("⭐⭐ …and shows it again, on the map and in the picker", JSON.stringify(p.sb.countryColors.SOV) === "[18,171,52]" && p.colorInput.value === "#12ab34", { sov: p.sb.countryColors.SOV, input: p.colorInput.value });
  p.run("doUndo(); doUndo();");
  rec("⭐⭐⭐ undoing past the OLDER step does not leave a colour on screen that the queue no longer holds",
    p.urls().length === 0 && JSON.stringify(p.sb.countryColors.SOV) === JSON.stringify(SOV) && p.colorInput.value === "#7d0d18", { urls: p.urls(), sov: p.sb.countryColors.SOV, input: p.colorInput.value });
  rec("THE CONTROL: GER's colour, never touched, is unchanged throughout", JSON.stringify(p.sb.countryColors.GER) === "[96,96,96]", p.sb.countryColors.GER);
}

console.log("\n4. A colour given to a country colors.txt has none for, then Undo");
{
  const p = page();
  p.pickColour("XYZ", "#010203");
  rec("the colour is previewed", JSON.stringify(p.sb.countryColors.XYZ) === "[1,2,3]", p.sb.countryColors.XYZ);
  p.run("doUndo();");
  rec("⭐⭐ Undo leaves XYZ with no colour of its own again, so the map falls back to the one it had", !("XYZ" in p.sb.countryColors) && p.urls().length === 0, { colors: p.sb.countryColors, urls: p.urls() });
}

console.log(`\n=== a river stroke and a country colour are undo steps: ${checks} checks, ${fails.length} failed ===`);
fails.forEach((f) => console.log("   FAILED: " + f));
process.exitCode = fails.length ? 1 : 0;
