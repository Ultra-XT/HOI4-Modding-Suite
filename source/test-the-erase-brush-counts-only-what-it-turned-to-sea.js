// The Erase brush counts, and makes an Undo step for, only the provinces it actually turned to sea.
// #the-erase-brush-counts-only-what-it-flipped
//
// THE DEFECT (discovery F20, verified on 790cb21 in the real page). eraseProvinceLocal added a province that was ALREADY water to
// erasedThisStroke ("already water — skip"), and commitEraseStroke reported erasedThisStroke.size as the provinces erased. So
// clicking the sea said "🧹 Erased 1 coastal province to sea." with nothing staged (the Save count stayed 0, the queue empty),
// and a drag from coastal land 5239 into sea 451 said "Erased 2 coastal provinces" for one flip. beginEraseStroke pushed an
// "Erase land" Undo step at mousedown either way, so a click that changed nothing still left a step in History and cleared Redo.
//
// Now a province that is already water is not counted, and the stroke's Undo step is taken just before its first real flip,
// so a stroke that flips nothing pushes none.
//
// Run as the page runs it: the Erase brush's state and its four functions (eraseProvinceLocal, eraseAt, beginEraseStroke,
// commitEraseStroke) are lifted out of public/map.js into a sandbox, and each gesture calls them the way the canvas handlers do:
// mousedown -> beginEraseStroke(); a drag -> eraseAt() per move; mouseup -> eraseAt() when nothing moved, then commitEraseStroke().
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { maskJsComments } = require("./testlib-strip-comments.js");

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (ok || detail == null ? "" : "   -> " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 600)));
  if (!ok) fails.push(label);
};

const MAP = fs.readFileSync(path.join(__dirname, "public", "map.js"), "utf8");
const MASKED = maskJsComments(MAP);
const from = MASKED.indexOf("let erasedThisStroke");
const commitAt = MASKED.indexOf("function commitEraseStroke", from);
const to = commitAt < 0 ? -1 : MASKED.indexOf("\n  }", commitAt);
const REGION = from < 0 || to < 0 ? "" : MAP.slice(from, to + 4);
const levelsAt = MASKED.indexOf("function moveProvinceLevels");
const LEVELS = levelsAt < 0 ? "" : MAP.slice(levelsAt, MASKED.indexOf("\n  }", levelsAt) + 4);   // (the helper eraseProvinceLocal takes the province's own history off the page with)

// A one-row map: x=0 sea 1 · x=1 coastal land 2 · x=2 inland land 3 (its only neighbour is 2) · x=3 lake 4 · x=4 sea 5.
function page() {
  const provinceType = new Map([[1, "sea"], [2, "land"], [3, "land"], [4, "lake"], [5, "sea"]]);
  const provinceDef = new Map([
    [1, { id: 1, type: "sea", coastal: false, terrain: "ocean" }], [2, { id: 2, type: "land", coastal: true, terrain: "plains" }],
    [3, { id: 3, type: "land", coastal: false, terrain: "plains" }], [4, { id: 4, type: "lake", coastal: false, terrain: "lakes" }],
    [5, { id: 5, type: "sea", coastal: false, terrain: "ocean" }],
  ]);
  const undo = [];
  let status = "";
  const sb = {
    console,
    provinceType, provinceDef, provinceToOwner: { 2: "AAA", 3: "AAA" },
    provNeighborsCache: new Map([[1, new Set([2])], [2, new Set([1, 3])], [3, new Set([2])], [4, new Set([5])], [5, new Set([4])]]),
    buildProvNeighbors: () => {},
    model: { states: [{ id: 100, provinces: [2, 3] }], provinceToState: { 2: 100, 3: 100 } },
    stateById: new Map([[100, { id: 100, name: "STATE_100", displayName: "Hundred", provinces: [2, 3] }]]),
    pendingWrites: [],
    queueWrite(url, body) { sb.pendingWrites.push({ url, body }); },
    pushUndo(label) { undo.push({ label, typeOf2: provinceType.get(2), queued: sb.pendingWrites.length }); },
    imgXYAt: (x, y) => ({ x, y }), brushRadius: 1, imgW: 5, imgH: 1, pidGrid: [1, 2, 3, 4, 5],
    recolorAll: () => {}, draw: () => {}, statusEl: { style: {} }, setStatus: (s) => { status = String(s); },
    autoFix: true, deleteEmptiedStates: () => ({ deleted: [], keptCapitals: [], keptInherited: [] }), inheritedEmptyWarning: () => "",
    setMapDirty: () => {}, paintDiff: new Map(),
  };
  sb.globalThis = sb;
  vm.createContext(sb);
  vm.runInContext(`${LEVELS}\n${REGION}\nglobalThis.__erase = { beginEraseStroke, eraseAt, commitEraseStroke };`, sb);
  const e = sb.__erase;
  return {
    click(x) { e.beginEraseStroke(); e.eraseAt(x, 0); e.commitEraseStroke(); },
    drag(xs) { e.beginEraseStroke(); for (const x of xs) e.eraseAt(x, 0); e.commitEraseStroke(); },
    get queued() { return sb.pendingWrites; }, get status() { return status; }, undo, provinceType,
  };
}

console.log("0. The page's code, as this test runs it");
rec("the Erase brush's state and its four functions were lifted out of public/map.js",
  REGION.length > 1500 && ["function eraseProvinceLocal", "function eraseAt", "function beginEraseStroke", "function commitEraseStroke"].every((n) => REGION.indexOf(n) !== -1), REGION.length);
rec("mousedown in Erase begins a stroke", /if \(mode === "erase" && !spaceDown\) beginEraseStroke\(\);/.test(MASKED));
rec("mouseup erases under the cursor when nothing moved, then commits the stroke", /if \(mode === "erase"\) \{\s*if \(!moved\) eraseAt\(e\.clientX, e\.clientY\);[^\n]*\n\s*commitEraseStroke\(\);/.test(MASKED));

console.log("\n1. ⛔ Click the sea");
{
  const p = page();
  p.click(0);
  rec("nothing was staged", p.queued.length === 0, p.queued);
  rec("⭐⭐⭐ the status line does not say a province was erased", !/Erased \d+/.test(p.status), p.status);
  rec("⭐⭐ …it says there was no land under the brush", /nothing land was under the brush/.test(p.status), p.status);
  rec("⭐⭐⭐ and no Undo step was made", p.undo.length === 0, p.undo);
}

console.log("\n2. ⛔ Click a lake");
{
  const p = page();
  p.click(3);
  rec("nothing was staged", p.queued.length === 0, p.queued);
  rec("⭐⭐⭐ the status line does not say a province was erased", !/Erased \d+/.test(p.status), p.status);
  rec("⭐⭐ and no Undo step was made", p.undo.length === 0, p.undo);
}

console.log("\n3. ⛔ Drag from coastal land into the sea");
{
  const p = page();
  p.drag([1, 0]);
  rec("one flip was staged, for province 2", p.queued.length === 1 && p.queued[0].url === "/api/map/flip-province-sea" && p.queued[0].body.provinceId === 2, p.queued);
  rec("⭐⭐⭐ the status line says 1 province was erased, not 2", /Erased 1 coastal province to sea\./.test(p.status), p.status);
  rec("⭐⭐ one Undo step, \"Erase land\"", p.undo.length === 1 && p.undo[0].label === "Erase land", p.undo);
}

console.log("\n4. …and from the sea onto coastal land");
{
  const p = page();
  p.drag([0, 1]);
  rec("one flip was staged", p.queued.length === 1, p.queued);
  rec("⭐⭐⭐ the status line says 1 province was erased", /Erased 1 coastal province to sea\./.test(p.status), p.status);
  rec("⭐⭐ one Undo step, taken while province 2 was still land and before its flip was queued",
    p.undo.length === 1 && p.undo[0].typeOf2 === "land" && p.undo[0].queued === 0, p.undo);
}

console.log("\n5. ⛔ Click inland land, which cannot become water");
{
  const p = page();
  p.click(2);
  rec("nothing was staged", p.queued.length === 0, p.queued);
  rec("the status line explains the province is inland", /INLAND/.test(p.status), p.status);
  rec("⭐⭐ and no Undo step was made", p.undo.length === 0, p.undo);
}

console.log("\n6. THE CONTROL: click coastal land");
{
  const p = page();
  p.click(1);
  rec("one flip was staged", p.queued.length === 1 && p.queued[0].body.provinceId === 2, p.queued);
  rec("it is water on the page now", p.provinceType.get(2) === "sea");
  rec("the status line says 1 province was erased", /Erased 1 coastal province to sea\./.test(p.status), p.status);
  rec("one Undo step, \"Erase land\", taken before the flip", p.undo.length === 1 && p.undo[0].label === "Erase land" && p.undo[0].typeOf2 === "land" && p.undo[0].queued === 0, p.undo);
}

console.log(`\n=== the erase brush counts only what it turned to sea: ${checks} checks, ${fails.length} failed ===`);
if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
