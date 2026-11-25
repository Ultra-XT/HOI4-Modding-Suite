// RUN the Map editor's own functions in node: lifted out of public/map.js and executed in a sandbox that stands in for the
// browser, so a test measures what the page does rather than what its source mentions. Shared by the tests that follow a
// click through to the status line the modder reads (the Auto-fix summary, Generate land, the inspector's type dropdown).
//
// ⚠️ NOT NAMED test-*.js ON PURPOSE — run-tests.js enumerates `test-*.js` and would execute a helper as a test file.
//
// What is real and what is stood in for:
//   · every function named in lift()/runPage() is the page's own text, comments and all;
//   · load() and buildFromImage() can be lifted too: the map image is a FakeImage whose onload fires on a timer, AFTER
//     load() has returned, the way a browser decodes provinces.bmp — which is what decides whether a status line
//     written after `await load(…)` is still the one on screen when the reload finishes;
//   · the DOM is a few fake elements. An overlay's querySelector("#id") answers only for an id its innerHTML renders, so a
//     button the popup does not offer cannot be clicked.
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { maskJsComments } = require("./testlib-strip-comments.js");

/**
 * A tracked source file's text as every lift anchors on it: with LF line ends, whatever the checkout wrote.
 * ⛔ #a-lift-reads-lf — core.autocrlf is on and there is no .gitattributes, so public/map.js is LF where a tool last wrote it
 * and CRLF in every fresh clone and worktree. An anchor that SPANS a line end ("…updateSaveButton(); }\n  }",
 * "\n    return items;\n  }", "\n  }\n") is not in the CRLF text at all, so the lift came back empty — "flushMapSaves lifted
 * -> 0", "no end after const riverGrey" — and only ever in a worktree, where the change under test was being made.
 * Normalised ONCE, where the source is read, rather than `\r?` through every anchor (the next anchor forgets). The page is
 * not changed, and a function runs the same lifted from either.
 */
function readSource(...parts) {
  return fs.readFileSync(path.resolve(__dirname, ...parts), "utf8").replace(/\r\n/g, "\n");
}

const MAP = readSource("public", "map.js");
const MASKED = maskJsComments(MAP);

/** The page's text for one function, from `opening` to the first line after it that is exactly `end` (the IIFE's functions
 *  close at two spaces). Throws when either is missing, so a renamed function fails a test instead of skipping it. */
function lift(opening, end = "\n  }") {
  return liftFrom(MAP, MASKED, opening, end);
}

/** lift() over any source text and its comment-masked twin: the page's own above, a scratch copy in the test that pins
 *  #a-lift-reads-lf. */
function liftFrom(src, masked, opening, end = "\n  }", name = "public/map.js") {
  const s = masked.indexOf(opening);
  if (s < 0) throw new Error(`${name} has no "${opening}"`);
  const e = masked.indexOf(end, s);
  if (e < 0) throw new Error(`${name}: no end after "${opening}"`);
  return src.slice(s, e + end.length);
}

/**
 * The summary-note helpers the lifted code CALLS, lifted along with it. ⚠️ A DEPENDENCY EACH CALLER MUST NAME IS ONE A
 * CALLER WILL MISS: openMapErrorsModal's Auto-fix click builds its summary out of small pure `…Note()` helpers, and every
 * test that clicks that button had to list each one in its own lift() set — so adding one to public/map.js failed six tests
 * at once with "<name> is not defined", from inside the click's own catch, which reports it as "Auto-fix failed: …" and
 * names the page rather than the missing lift. (The lists already carried a comment explaining that exact failure for
 * fractionedRepairNote.) Derived instead: anything the lifted text calls that looks like a note helper, is declared in
 * public/map.js at the IIFE's own two-space indent, and is not already lifted, comes along. Repeated until it settles, so
 * a helper that calls a helper is covered too. A test may still name them itself; a second declaration is legal here and
 * this adds nothing it already has.
 * …and the pure COUNT helpers a note counts with, named `…Count(` (⛔ #a-world-counts-the-land-it-made: generatedLandCount, which
 * 🌍 Generate land's line and 🌍 Generate a world's both count the land with), by the same rule.
 * …and the pure tag-list helpers, named `…Tags(` (⛔ #a-picker-offers-the-countries-that-load: pickerCountryTags, which load() builds
 * every country picker with), by the same rule.
 */
function withNoteHelpers(code) {
  for (let pass = 0; pass < 5; pass++) {
    let added = false;
    for (const name of new Set((code.match(/\b\w+(?:Note|Count|Tags)\(/g) || []).map((m) => m.slice(0, -1)))) {
      if (new RegExp("function\\s+" + name + "\\s*\\(").test(code)) continue;   // already lifted, or declared by the caller
      if (MASKED.indexOf("\n  function " + name + "(") === -1) continue;       // not a function of the page: a method, a property
      code = lift("function " + name + "(") + "\n" + code;
      added = true;
    }
    if (!added) break;
  }
  return code;
}

/** A fake element: records its listeners, renders nothing. */
function element(tag = "div") {
  const listeners = {};
  const kids = new Map();
  const el = {
    tagName: String(tag).toUpperCase(), style: {}, dataset: {}, value: "", checked: false, disabled: false,
    textContent: "", innerHTML: "", title: "", width: 0, height: 0, options: [], listeners,
    addEventListener(type, fn) { (listeners[type] = listeners[type] || []).push(fn); },
    removeEventListener() {}, focus() {}, click() {}, remove() { el.removed = true; }, appendChild() {},
    setAttribute() {}, getAttribute() { return null; }, querySelectorAll() { return []; },
    querySelector(sel) {
      const m = /^#([\w-]+)$/.exec(String(sel));
      if (m && !new RegExp(`id="${m[1]}"`).test(el.innerHTML)) return null;   // not rendered, so not clickable
      if (!kids.has(sel)) kids.set(sel, element());
      return kids.get(sel);
    },
    getContext() {
      return { drawImage() {}, putImageData() {}, fillRect() {}, clearRect() {},
        getImageData: (x, y, w, h) => ({ data: new Uint8ClampedArray(Math.max(4, (w | 0) * (h | 0) * 4)), width: w, height: h }) };
    },
  };
  return el;
}

/** Fires onload on a timer after src is set, like a browser decoding the bitmap after load() has already returned. */
function fakeImageClass({ width = 256, height = 256, delayMs = 15, log = null } = {}) {
  return class FakeImage {
    constructor() { this.onload = null; this.onerror = null; this.naturalWidth = width; this.naturalHeight = height; this._src = ""; }
    get src() { return this._src; }
    set src(v) {
      this._src = v;
      setTimeout(() => { if (log) log.push("image-loaded"); if (typeof this.onload === "function") this.onload(); }, delayMs);
    }
  };
}
class FakeImageData { constructor(data, w, h) { this.data = data; this.width = w; this.height = h; } }

/** The page state load() and buildFromImage() read and reset. */
function loadGlobals(over = {}) {
  return Object.assign({
    dirtyMap: false, armyHasUnsaved: () => false, armyAfterMapReload: () => {}, readMapBackup: () => null, checkMapBackup: () => {},
    pendingWrites: [], paintDiff: new Map(), stagedRiverEdits: [], setMapDirty: () => {},
    undoStack: [], redoStack: [], historyLabels: [], checkpoints: [], checkpointSeq: 0, saveGeneration: 0, updateUndoButtons: () => {},
    problemsEverLoaded: false, problemsStale: false, multiSelect: { clear() {} }, updateMultiBar: () => {},
    checkModVersion: () => {}, countryColors: {}, provinceToOwner: {}, stateById: new Map(), colorToProvince: new Map(),
    provinceType: new Map(), provinceDef: new Map(), packRGB: (r, g, b) => (r << 16) | (g << 8) | b,
    riversImg: null, riversShow: false, loadRiversOverlay: () => {}, renderRailPanel: () => {},
    countrySelect: element("select"), imgW: 0, imgH: 0, baseImageData: null, baseImageDataPristine: null, ownerCanvas: null,
    ImageData: FakeImageData, buildPidGrid() {}, computeCentroids() {}, recolorAll() {}, fitView() {}, draw() {},
    applyDeepLink() {}, syncCountryColorInput() {}, problemsPanelOpen: () => false, refreshProblems: () => {},
  }, over);
}

/**
 * A sandbox running the named page functions. `functions`: openings for lift() (or [opening, end] pairs). `globals`: what those
 * functions read. Returns { sb, statuses, overlays }: sb holds every lifted function by name; statuses records each setStatus
 * call in order (the last is what the modder reads); overlays records each element document.createElement made.
 */
function runPage(functions, globals = {}) {
  const statuses = [];
  const overlays = [];
  const code = withNoteHelpers(functions.map((f) => (Array.isArray(f) ? lift(f[0], f[1]) : lift(f))).join("\n"));
  const sb = Object.assign({
    console, setTimeout, clearTimeout, encodeURIComponent, decodeURIComponent,
    $: () => null,
    statusEl: { style: {}, textContent: "" },
    // …and the line lands ON statusEl, exactly as public/map.js's own setStatus does
    // (`const setStatus = (t) => { statusEl.textContent = t; };`). A handler that ADDS to the line already on
    // screen reads it back from there, so a sandbox that only collected the calls answered "" and the note
    // looked like a replacement it is not.
    setStatus: (s) => { statuses.push(String(s)); sb.statusEl.textContent = String(s); },
    escHtml: (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])),
    hasPendingMapEdits: () => false,
    nbAlert: () => {},
    document: {
      getElementById: () => null,
      createElement: (tag) => { const o = element(tag); overlays.push(o); return o; },
      body: { appendChild() {}, removeChild() {} },
      addEventListener() {}, removeEventListener() {},
    },
    window: { NovaMapRuleLabels: require("./public/map-rule-labels.js"), confirm: () => true },
  }, globals);
  sb.globalThis = sb;
  vm.createContext(sb);
  vm.runInContext(code, sb);
  return { sb, statuses, overlays };
}

const settle = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * The line the Map Errors popup shows after an Auto-fix click, built by the page's OWN summary code from `fr` (the click's
 * answer): from `const ro = (fr.fixes` down to the `summaryLine` it builds, with the note helpers it calls. The same lift
 * test-every-auto-fix-step-is-in-the-summary.js makes, here for a test that has one step's real answer in hand.
 */
function autoFixSummary(fr) {
  const at = MASKED.indexOf("const ro = (fr.fixes");
  const endAt = at < 0 ? -1 : MASKED.indexOf("const summaryLine = (parts.length", at);
  const end = endAt < 0 ? -1 : MASKED.indexOf(";", endAt);
  if (at < 0 || end < 0) throw new Error("public/map.js: the Auto-fix summary was not found");
  const sb = { console, JSON, Set, Map, Math, Array, Number, String, Object, fr };
  sb.globalThis = sb;
  vm.createContext(sb);
  vm.runInContext(withNoteHelpers(`var statusEl = null;\n${MAP.slice(at, end + 1)}`) + "\nglobalThis.__line = summaryLine;", sb);
  return String(sb.__line);
}

/**
 * The 🌍 Generate land click's success report, as ONE text, in the shape the tests of each of its notes read: from the click's POST to
 * the reload that shows it, the note variables assigned (`x = generatedXNote(res)`) and then `reloadAfterImmediateWrite(\`🌍 Generated
 * … ${x} …\`` on the last line.
 *
 * ⚠️ MOVED WITH 🌍 Generate a world, which shows the same words for its own Generate land step: the handler now hands
 * `generatedLandResultNote(res)` to reloadAfterImmediateWrite, and the notes are built inside that function. So this returns the handler
 * from its POST up to that call, then the function's body with its `return \`🌍 Generated…` written as the reload it feeds. It returns
 * "" when the handler's success reload is not exactly `reloadAfterImmediateWrite(generatedLandResultNote(res))`, or the function or its
 * template is gone — so a test that reads it fails rather than passing on nothing.
 *  `src` is the page with its comments stripped or masked (the success reload is the LAST one before the click's `.catch(`; the first
 *  after the POST is a click that stopped part-way).
 */
function generateLandReportLine(src) {
  const post = src.indexOf('fetch("/api/map/generate-land"');
  const caught = post < 0 ? -1 : src.indexOf(".catch(", post);
  const done = caught < 0 ? -1 : src.lastIndexOf("reloadAfterImmediateWrite(", caught);
  if (post < 0 || done < post) return "";
  if (!/^reloadAfterImmediateWrite\(\s*generatedLandResultNote\(\s*res\s*\)\s*(?:,\s*\{\s*afterSave:\s*true\s*\}\s*)?\)/.test(src.slice(done, src.indexOf("\n", done)))) return "";   // (B4-2: the reload keeps unsaved army work)
  const fn = src.indexOf("function generatedLandResultNote(");
  const fnEnd = fn < 0 ? -1 : src.indexOf("\n  }", fn);
  if (fnEnd < 0) return "";
  const body = src.slice(fn, fnEnd);
  const ret = body.lastIndexOf("return `🌍 Generated");
  if (ret < 0) return "";
  const tail = body.slice(ret + "return ".length);
  const eol = tail.indexOf("\n");
  return src.slice(post, done) + body.slice(0, ret) + "reloadAfterImmediateWrite(" + (eol < 0 ? tail : tail.slice(0, eol)).replace(/\r$/, "");
}

// ⚠️ withNoteHelpers is EXPORTED because runPage was not the only caller. Five tests assemble the Auto-fix
// summary themselves — their own lift(), their own vm context — and each hand-listed the note helpers it knew
// about. Adding duplicateStatesLeftNote to public/map.js broke all five at once with "duplicateStatesLeftNote
// is not defined", reported from inside the click's own catch as "Auto-fix failed: …", which names the page
// and not the missing lift. That is the exact failure the comment above this function already described, so
// the derivation it describes has to be reachable from outside this file, not just from runPage.
module.exports = { readSource, liftFrom, MAP, MASKED, lift, withNoteHelpers, element, fakeImageClass, FakeImageData, loadGlobals, runPage, settle, autoFixSummary, generateLandReportLine };
