// #map-undo-skips-regions
//
// THE MAP'S UNDO SNAPSHOT IS A HAND-WRITTEN FIELD LIST, AND TWO FIELDS WERE MISSING FROM IT.
//
// snapshotMap() copies the editable map state field by field; applyMapSnapshot() puts it back. Anything a
// tool writes that the list does not name is silently NOT undone — and that is worse than having no undo,
// because Ctrl+Z reverts most of the edit and leaves the rest, so the screen and the pending save disagree
// with each other and neither matches what the user asked for.
//
// Derived rather than guessed: every `model.<field>` the file assigns to, against every `model.<field>` the
// snapshot copies. Two were written by four tools and copied by none of them —
//
//     model.strategicRegions   ✎ Rename strategic region   pushUndo(), then r.displayName = name
//                              the region dropdown          pushUndo(), then fr.provinces / tr.provinces spliced
//     model.supplyAreas        ✎ Rename supply area         pushUndo(), then a.displayName = name
//                              the supply-area dropdown     pushUndo(), then fa.states / ta.states spliced
//
// — all four of which call pushUndo, so they look undoable and are listed by name in the History panel.
// Undo restored provinceToRegion and dropped the queued write, while the renamed label and the moved
// province stayed exactly where the edit had put them.
//
// Two things had to come with the fix:
//
//   · THE NESTED ARRAYS. A shallow .map() would hand the snapshot the very `provinces` array the next
//     splice mutates — the same bug one level down, and invisible until you undo twice.
//   · CREATION RUNS THE OTHER WAY. Creating a region writes to disk at once and is deliberately not
//     undoable. Once snapshots carry the list, undoing past the moment of creation would restore a list
//     from before it existed: the region would vanish from the dropdown while still sitting in the mod
//     file, unreachable. foldIrreversibleAddition() writes it into every snapshot already held, including
//     the checkpoints the History panel can jump back to.
//
// The real snapshotMap / applyMapSnapshot / pushUndo / doUndo are lifted out of public/map.js and RUN here
// against a synthetic model, so this measures the shipped code rather than grepping it.
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const fails = [];
let checks = 0;
function rec(label, cond, detail) {
  checks++;
  if (cond) console.log("  ok   " + label);
  else {
    fails.push(label);
    console.log("  FAIL " + label + "  -> " + String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 300));
  }
}

const SRC = fs.readFileSync(path.join(__dirname, "public", "map.js"), "utf8");

// Blank comments in place, preserving newlines, so extraction is not fooled by prose that names the very
// symbols it looks for — and so any offsets still line up with real file lines.
function blankComments(src) {
  let out = "", i = 0, state = "code", quote = "";
  while (i < src.length) {
    const c = src[i], d = src[i + 1];
    if (state === "code") {
      if (c === "/" && d === "/") { state = "line"; out += "  "; i += 2; continue; }
      if (c === "/" && d === "*") { state = "block"; out += "  "; i += 2; continue; }
      if (c === '"' || c === "'" || c === "`") { state = "str"; quote = c; out += c; i++; continue; }
      out += c; i++; continue;
    }
    if (state === "str") {
      if (c === "\\") { out += c + (d || ""); i += 2; continue; }
      if (c === quote) state = "code";
      out += c; i++; continue;
    }
    if (state === "line") { if (c === "\n") { state = "code"; out += c; } else out += " "; i++; continue; }
    if (state === "block") { if (c === "*" && d === "/") { state = "code"; out += "  "; i += 2; continue; } out += c === "\n" ? c : " "; i++; continue; }
  }
  return out;
}
const CODE = blankComments(SRC);
function fnText(name) {
  const at = CODE.indexOf(`function ${name}(`);
  if (at === -1) return "";
  const open = CODE.indexOf("{", at);
  let d = 0;
  for (let i = open; i < CODE.length; i++) { if (CODE[i] === "{") d++; else if (CODE[i] === "}") { d--; if (d === 0) return CODE.slice(at, i + 1); } }
  return "";
}

console.log("\n[DERIVED] every model field a tool writes must be in the snapshot");
{
  const SNAP = fnText("snapshotMap");
  const APPLY = fnText("applyMapSnapshot");
  rec("snapshotMap is found", SNAP.length > 300, SNAP.length);
  rec("applyMapSnapshot is found", APPLY.length > 300, APPLY.length);

  // ⭐ DERIVE BOTH SIDES. A typed-out list of fields is a list that has never heard of the field added next
  // month — which is exactly how these two came to be missing.
  const copied = new Set([...SNAP.matchAll(/model\.([a-zA-Z]+)/g)].map((m) => m[1]));
  const written = new Set([...CODE.matchAll(/model\.([a-zA-Z]+)\s*(?:=[^=]|\.push\(|\.splice\(|\[)/g)].map((m) => m[1]));
  const restored = new Set([...APPLY.matchAll(/model\.([a-zA-Z]+)\s*=/g)].map((m) => m[1]));

  // …except a field that is not the map's editable state at all, but the page's record that the DISK changed under it, which an
  // Undo must never take away. Each one with its reason; each must still be written and must stay out of both functions (a kept
  // exception whose field went is how an exception outlives its reason).
  const NOT_UNDO_STATE = new Map([
    ["saveRunId", "⛔ #a-stopped-save-is-still-the-same-save — the id of a Save that has not ended. An Undo between its two clicks takes back staged edits, not the part of that Save already written, and the run under that id is what holds the files as they were before it."],
    ["stoppedSaveOwes", "⛔ #a-capital-state-keeps-a-victory-point (review T04) — what a stopped Save's landed writes named: the capitals to keep and the removed states whose ids the scripts name, owed to the Save that finishes its queue. The other record of the Save saveRunId records, kept and ended with it: an Undo takes back staged edits, and those writes are on disk."],
    ["provinceFold", "⛔ #delete-map-gives-back-the-cut — the provinces a Save's 🗑 Delete map gave back, kept until a reload replaces the model (review of 5a1af33f, K4/K7). An Undo across that Save restores staged edits and province types from before it; the marker is what makes the next Save drop the edits on given-back provinces and Generate land read the map again first, so it must outlive the Undo"],
    ["recoveredQueue", "⛔ #a-recovered-edit-is-not-on-the-map-until-saved (B6-13) — the crash-recovery bar put writes back in the queue that the page's model never showed; the Save of that queue reloads the map so it does. An Undo takes back staged edits made since, not the fact that the model lacks the recovered ones, so the marker must outlive it until the reload replaces the model"],
  ]);
  const gap = [...written].filter((f) => !copied.has(f) && !NOT_UNDO_STATE.has(f)).sort();
  rec("nothing is written that the snapshot skips", gap.length === 0, gap);
  const offList = [...NOT_UNDO_STATE.keys()].filter((f) => !written.has(f) || copied.has(f) || restored.has(f));
  rec("…and a field kept out of it on purpose is still written, and neither copied nor restored", offList.length === 0, offList);
  const half = [...copied].filter((f) => !restored.has(f)).sort();
  rec("…and nothing is copied that the restore forgets", half.length === 0, half);
  rec("the two that were missing are named", copied.has("strategicRegions") && copied.has("supplyAreas"), [...copied].sort());
  // If the derivation stopped finding anything, every check above would pass vacuously.
  rec("the derivation still sees the whole model", written.size >= 8, [...written].sort());
}

console.log("\n[RUN IT] the real functions, against a synthetic map");
{
  // Everything snapshotMap/applyMapSnapshot reach for that is not part of this fix gets a stub. The point is
  // the field list, not the canvas.
  function makeCtx() {
    const ctx = {
      console,
      model: {
        states: [{ id: 1, name: "STATE_1" }],
        provinceToState: { 10: 1 },
        provinceToRegion: { 10: 100 },
        stateToSupplyArea: { 1: 200 },
        capitals: {},
        adjacencies: [], supplyNodes: [], railways: [],
        strategicRegions: [
          { id: 100, name: "REGION_100", displayName: "Iberia", provinces: [10] },
          { id: 101, name: "REGION_101", displayName: "Gaul", provinces: [] },
        ],
        supplyAreas: [
          { id: 200, name: "AREA_200", displayName: "West", states: [1] },
          { id: 201, name: "AREA_201", displayName: "East", states: [] },
        ],
      },
      provinceToOwner: {}, provinceType: new Map(), provinceDef: new Map(), paintDiff: new Map(),
      countryColors: {}, // snapshotMap holds the 🎨 colours too — #a-river-stroke-and-a-country-colour-are-undo-steps
      pendingWrites: [], dirtyMap: false,
      undoStack: [], redoStack: [], historyLabels: ["Loaded map"], checkpoints: [],
      UNDO_LIMIT: 30,
      stateById: new Map(), selected: null, info: null,
      baseImageData: null, baseImageDataPristine: null,
      repaints: 0, statuses: [],
      rebuildStagedRiversFromPending() {},
      setMapDirty(v) { ctx.dirtyMap = v; },
      buildPidGrid() {}, computeCentroids() {}, recolorAll() {}, draw() {}, updateUndoButtons() {},
      setStatus(s) { ctx.statuses.push(s); },
      // The two the fix added. Counting them is the "second half": restoring the model is not enough if the
      // <select> the user reads is still showing the undone label.
      regionRenameRefreshSelect() { ctx.repaints++; },
      supplyRenameRefreshSelect() { ctx.repaints++; },
    };
    vm.createContext(ctx);
    vm.runInContext([fnText("snapshotMap"), fnText("applyMapSnapshot"), fnText("pushUndo"),
      fnText("doUndo"), fnText("doRedo"), fnText("eachHeldSnapshot"), fnText("foldIrreversibleAddition")].join("\n"), ctx);
    return ctx;
  }
  // A back-out that drops the field entirely leaves find() returning undefined. Fall back to a marker object
  // so the check REPORTS "the old name is not back" instead of throwing a stack trace at whoever reads the
  // suite output — a crashing test does still fail, but it fails without saying why.
  const region = (ctx, id) => (ctx.model.strategicRegions || []).find((r) => r.id === id) || { missing: true, provinces: [] };
  const area = (ctx, id) => (ctx.model.supplyAreas || []).find((a) => a.id === id) || { missing: true, states: [] };

  {
    const ctx = makeCtx();
    rec("the harness loaded the real functions", typeof ctx.snapshotMap === "function" && typeof ctx.doUndo === "function", Object.keys(ctx).filter((k) => typeof ctx[k] === "function"));
    // CONTROL: the fixture must actually have the property under test, or "reverted" is meaningless.
    rec("CONTROL: the fixture starts with a named region", region(ctx, 100).displayName === "Iberia", ctx.model.strategicRegions);
  }

  console.log("\n  ✎ rename a strategic region, then undo");
  {
    const ctx = makeCtx();
    vm.runInContext(`pushUndo("Rename strategic region");
      pendingWrites.push({ url: "/api/map/set-region-name", body: {}, meta: {} });
      model.strategicRegions.find((r) => r.id === 100).displayName = "Hispania";`, ctx);
    rec("the rename took effect", region(ctx, 100).displayName === "Hispania", ctx.model.strategicRegions);
    const repaintsBefore = ctx.repaints;
    vm.runInContext("doUndo();", ctx);
    rec("…and undo puts the old name back", region(ctx, 100).displayName === "Iberia", region(ctx, 100));
    rec("…and drops the queued write with it", ctx.pendingWrites.length === 0, ctx.pendingWrites);
    rec("…and repaints the dropdown that shows it", ctx.repaints > repaintsBefore, { before: repaintsBefore, after: ctx.repaints });
    vm.runInContext("doRedo();", ctx);
    rec("…and redo brings the new name back", region(ctx, 100).displayName === "Hispania", region(ctx, 100));
  }

  console.log("\n  ⛔ an Undo across a Save whose Delete map gave provinces back keeps the page's record of it");
  {
    const ctx = makeCtx();
    // the order a page meets it in: a stroke (snapshot first), then a Save whose fold answers, then Ctrl+Z
    vm.runInContext(`pushUndo("Paint provinces");
      model.provinceFold = { rootOf: new Map([[20217, 9]]), from: 20217, to: 20217 };`, ctx);
    vm.runInContext("doUndo();", ctx);
    const kept = (c) => !!(c.model.provinceFold && c.model.provinceFold.rootOf && c.model.provinceFold.rootOf.get(20217) === 9);
    rec("⭐ the undo leaves model.provinceFold as the fold set it", kept(ctx), ctx.model.provinceFold || null);
    vm.runInContext("doRedo();", ctx);
    rec("…and so does the redo", kept(ctx), ctx.model.provinceFold || null);
  }

  console.log("\n  move a province between regions, then undo");
  {
    const ctx = makeCtx();
    vm.runInContext(`pushUndo("Change strategic region");
      const fr = model.strategicRegions.find((r) => r.id === 100);
      const tr = model.strategicRegions.find((r) => r.id === 101);
      fr.provinces = fr.provinces.filter((p) => p !== 10);
      tr.provinces.push(10);
      model.provinceToRegion[10] = 101;`, ctx);
    rec("the province moved", region(ctx, 101).provinces.includes(10) && !region(ctx, 100).provinces.includes(10), [region(ctx, 100), region(ctx, 101)]);
    vm.runInContext("doUndo();", ctx);
    rec("…and undo moves it back in the region's own list", region(ctx, 100).provinces.includes(10) && !region(ctx, 101).provinces.includes(10), [region(ctx, 100), region(ctx, 101)]);
    rec("…and in the province→region map", String(ctx.model.provinceToRegion[10]) === "100", ctx.model.provinceToRegion);
  }

  console.log("\n  the same two for supply areas");
  {
    const ctx = makeCtx();
    vm.runInContext(`pushUndo("Rename supply area");
      model.supplyAreas.find((a) => a.id === 200).displayName = "Atlantic";
      pushUndo("Change supply area");
      const fa = model.supplyAreas.find((a) => a.id === 200);
      const ta = model.supplyAreas.find((a) => a.id === 201);
      fa.states = fa.states.filter((s) => s !== 1);
      ta.states.push(1);
      model.stateToSupplyArea[1] = 201;`, ctx);
    vm.runInContext("doUndo();", ctx);
    rec("undo returns the state to its old supply area", area(ctx, 200).states.includes(1) && !area(ctx, 201).states.includes(1), [area(ctx, 200), area(ctx, 201)]);
    rec("…and the rename is still applied (only one step was undone)", area(ctx, 200).displayName === "Atlantic", area(ctx, 200));
    vm.runInContext("doUndo();", ctx);
    rec("…a second undo takes the rename back too", area(ctx, 200).displayName === "West", area(ctx, 200));
  }

  console.log("\n  ⚠️ the nested arrays must be COPIES, not the same array");
  {
    // A shallow spread would put the live `provinces` array into the snapshot; the next splice would then
    // edit the snapshot as well, and undo would restore the state it was supposed to replace.
    const ctx = makeCtx();
    vm.runInContext(`pushUndo("step 1");
      model.strategicRegions.find((r) => r.id === 100).provinces.push(11);
      pushUndo("step 2");
      model.strategicRegions.find((r) => r.id === 100).provinces.push(12);`, ctx);
    vm.runInContext("doUndo();", ctx);
    rec("one undo removes only the last province", JSON.stringify(region(ctx, 100).provinces) === "[10,11]", region(ctx, 100).provinces);
    vm.runInContext("doUndo();", ctx);
    rec("…and the second removes the one before it", JSON.stringify(region(ctx, 100).provinces) === "[10]", region(ctx, 100).provinces);
  }

  console.log("\n  a region created mid-session must survive undoing past its creation");
  {
    const ctx = makeCtx();
    vm.runInContext(`pushUndo("edit A");
      model.states.push({ id: 2, name: "STATE_2" });
      const newRegion = { id: 300, name: "REGION_300", displayName: "Nova", provinces: [] };
      model.strategicRegions = model.strategicRegions.concat([newRegion]);
      foldIrreversibleAddition((s) => { s.strategicRegions = (s.strategicRegions || []).concat([{ ...newRegion, provinces: [] }]); });
      pushUndo("edit B");
      model.states.push({ id: 3, name: "STATE_3" });`, ctx);
    vm.runInContext("doUndo(); doUndo();", ctx);
    rec("undoing right past the creation keeps the new region", !!region(ctx, 300), ctx.model.strategicRegions.map((r) => r.id));
    rec("…while the ordinary edits DID undo", ctx.model.states.length === 1, ctx.model.states);
    rec("…and it is not duplicated", ctx.model.strategicRegions.filter((r) => r.id === 300).length === 1, ctx.model.strategicRegions.map((r) => r.id));
  }

  console.log("\n  …including in a History-panel checkpoint");
  {
    const ctx = makeCtx();
    vm.runInContext(`checkpoints.push({ name: "before", snapshot: snapshotMap() });
      const newArea = { id: 301, name: "AREA_301", displayName: "Novus", states: [] };
      model.supplyAreas = model.supplyAreas.concat([newArea]);
      foldIrreversibleAddition((s) => { s.supplyAreas = (s.supplyAreas || []).concat([{ ...newArea, states: [] }]); });
      pushUndo("Restore: before");
      applyMapSnapshot(checkpoints[0].snapshot);`, ctx);
    rec("jumping back to a checkpoint keeps it too", !!area(ctx, 301), ctx.model.supplyAreas.map((a) => a.id));
  }
}

console.log("\n[CONTROL] the rest of the map's history machinery is untouched");
{
  rec("the undo limit is still enforced", /undoStack\.length > UNDO_LIMIT/.test(CODE), "the cap is gone");
  rec("…and drops the label with the snapshot", /undoStack\.shift\(\); historyLabels\.shift\(\)/.test(CODE), "the two would drift out of step");
  rec("a new action still clears the redo branch", /redoStack = \[\];/.test(fnText("pushUndo")), "redo would survive a new edit");
  rec("the four region tools still snapshot first", (CODE.match(/pushUndo\("(Rename strategic region|Change strategic region|Rename supply area|Change supply area)"\)/g) || []).length === 4, (CODE.match(/pushUndo\("[^"]*"\)/g) || []).length);
  rec("creating a region is still an immediate write", /fetch\("\/api\/map\/create-region"/.test(CODE), "the create path changed shape");
  rec("…and is still folded into the held snapshots", (CODE.match(/foldIrreversibleAddition\(/g) || []).length >= 3, (CODE.match(/foldIrreversibleAddition\(/g) || []).length);
}

console.log(`\n=== map region undo: ${checks} checks, ${fails.length} failed ===`);
if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
