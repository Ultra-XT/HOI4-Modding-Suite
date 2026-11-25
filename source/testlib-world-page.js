// 🌍 GENERATE A WORLD'S PAGE CODE, RUN IN NODE — the map page's whole world block (its state, its functions and the listeners it
// wires), lifted VERBATIM out of public/map.js and run in a vm context that stands in for the browser, against a fetch the caller
// gives: a recording stub (the tests) or one bound to a live Nova server (the acceptance probe). So a test measures what the
// button does, not what its source mentions.
//
// ⚠️ NOT NAMED test-*.js ON PURPOSE — run-tests.js enumerates `test-*.js` and would execute a helper as a test file.
//
// What is DERIVED, never typed:
//   · the block: from its banner comment ("── 🌍 GENERATE A WORLD") to the line that wires #mapWorldClose, as written;
//   · the page functions it calls from outside the block (the note helpers, escHtml, blankWriteNotes …): every name the code
//     calls that public/map.js declares at the IIFE's own two-space indent, lifted with testlib-map-page's lift(), repeated
//     until it settles — minus the ones a page stands in for here (STUBBED), which the caller may replace;
//   · the elements: one fake element per id="…" in public/map.html, with that element's own initial value (an <input>'s
//     value="…", a <select>'s selected <option>), its disabled attribute and its display:none — so an id the page reads that
//     map.html does not have is null here, as it is in the browser.
"use strict";

const vm = require("vm");
const T = require("./testlib-map-page.js");
const HTML = T.readSource("public", "map.html");

const BLOCK_START = "// ── 🌍 GENERATE A WORLD";
const BLOCK_END = '$("mapWorldClose").addEventListener(';
/** The page functions a test or a probe stands in for: the page's own would reach the map model, the canvas or localStorage. */
const STUBBED = new Set(["load", "reloadAfterImmediateWrite", "hasPendingMapEdits", "armyHasUnsaved", "setStatus", "modPath"]);

/** The world block's text, verbatim (comments and all). Throws when either end is gone, so a rename fails a test. */
function worldBlock() {
  const s = T.MAP.indexOf(BLOCK_START);
  if (s < 0) throw new Error(`public/map.js has no "${BLOCK_START}"`);
  const e = T.MASKED.indexOf(BLOCK_END, s);
  if (e < 0) throw new Error(`public/map.js: no "${BLOCK_END}" after the world block's start`);
  const lineStart = T.MAP.lastIndexOf("\n", s) + 1;
  return T.MAP.slice(lineStart, T.MAP.indexOf("\n", e) + 1);
}

/** The names the world block declares as functions at two-space indent (derived). */
function worldBlockFunctionNames() {
  const block = worldBlock();
  const masked = require("./testlib-strip-comments.js").maskJsComments(block);
  return [...masked.matchAll(/\n  (?:async )?function (\w+)\(/g)].map((m) => m[1]);
}

/** Every page function `code` calls, transitively, that public/map.js declares at two-space indent — lifted (STUBBED excepted). */
function withPageHelpers(code, stubbed = STUBBED) {
  for (let pass = 0; pass < 12; pass++) {
    let added = false;
    const masked = require("./testlib-strip-comments.js").maskJsComments(code);
    for (const name of new Set([...masked.matchAll(/\b([A-Za-z_$][\w$]*)\(/g)].map((m) => m[1]))) {
      if (stubbed.has(name)) continue;
      if (new RegExp("(?:^|\\n)\\s*(?:async\\s+)?function\\s+" + name.replace(/\$/g, "\\$") + "\\s*\\(").test(code)) continue;
      const opening = T.MASKED.indexOf("\n  function " + name + "(") !== -1 ? "function " + name + "("
        : T.MASKED.indexOf("\n  async function " + name + "(") !== -1 ? "async function " + name + "(" : "";
      if (!opening) continue;   // a method, a builtin, a stub, or a const of the page
      code = T.lift(opening) + "\n" + code;
      added = true;
    }
    if (!added) break;
  }
  return code;
}

/** One fake element per id in map.html, carrying the element's own initial value, disabled and display:none. */
function htmlElements() {
  const els = new Map();
  for (const m of HTML.matchAll(/<(\w+)\b([^>]*?)\bid="([^"]+)"([^>]*)>/g)) {
    const tag = m[1], attrs = m[2] + " " + m[4], id = m[3];
    const el = T.element(tag);
    el.id = id;
    const val = /\bvalue="([^"]*)"/.exec(attrs);
    if (val && tag.toLowerCase() !== "select") el.value = val[1];
    if (/\bdisabled\b/.test(attrs)) el.disabled = true;
    if (/style="[^"]*display:\s*none/.test(attrs)) el.style.display = "none";
    if (tag.toLowerCase() === "select") {
      const end = HTML.indexOf("</select>", m.index);
      const inner = HTML.slice(m.index, end);
      const opts = [...inner.matchAll(/<option\b([^>]*)>/g)].map((o) => ({ value: (/\bvalue="([^"]*)"/.exec(o[1]) || [])[1] || "", selected: /\bselected\b/.test(o[1]) }));
      el.options = opts;
      el.value = (opts.find((o) => o.selected) || opts[0] || { value: "" }).value;
    }
    els.set(id, el);
  }
  return els;
}

/** Let every promise chain the page started run to its end (each await of a stub fetch is a few microtask turns), by real
 *  macrotask turns — the page's own timers may be stubbed. A live fetch needs its own wait (the caller polls). */
async function settle(turns = 25) { for (let i = 0; i < turns; i++) await new Promise((r) => setImmediate(r)); }

/**
 * Run the world block. opts: { fetch (required: (url, init) => Promise<Response-like>), modPath = "", pending = () => false, armyUnsaved = () => false,
 * search = "", timers = { setTimeout, clearTimeout, setInterval, clearInterval } (default: the real ones), extra = {} globals }.
 * → { sb, el(id), elements, statuses, reloads, reloadOpts, loads, replaced, state() } — `state()` reads the block's own `let`s.
 */
function worldPage(opts = {}) {
  if (typeof opts.fetch !== "function") throw new Error("worldPage needs a fetch");
  const statuses = [], reloads = [], reloadOpts = [], loads = [], replaced = [];
  const elements = htmlElements();
  const timers = opts.timers || { setTimeout, clearTimeout, setInterval, clearInterval };
  const block = worldBlock();
  // worldDeepLink is the page's (declared with the other query flags, far above the block); the probe sets it as ?world=1 does
  const code = withPageHelpers(`let worldDeepLink = ${opts.search && /(?:^|[?&])world=1(?:&|$)/.test(opts.search) ? "true" : "false"};\n${block}`)
    + "\nglobalThis.__state = () => ({ worldPlan, worldRunShown, worldAnswers, worldAnswersAt, worldPollTimer, worldTickTimer, worldReloadedFor, worldDeepLink });"
    + "\nglobalThis.__fns = {" + worldBlockFunctionNames().map((n) => `${n}: typeof ${n} === "function" ? ${n} : undefined`).join(", ") + "};";
  const loc = { search: opts.search || "", pathname: "/map.html", hash: "" };
  const sb = Object.assign({
    console, URLSearchParams, encodeURIComponent, decodeURIComponent, Uint32Array,
    setTimeout: timers.setTimeout, clearTimeout: timers.clearTimeout, setInterval: timers.setInterval, clearInterval: timers.clearInterval,
    crypto: require("crypto").webcrypto,
    fetch: opts.fetch,
    $: (id) => elements.get(id) || null,
    statusEl: { style: {}, textContent: "" },
    setStatus: (s) => { statuses.push(String(s)); sb.statusEl.textContent = String(s); },
    hasPendingMapEdits: opts.pending || (() => false),
    // the 🪖 Army tool's unsaved work (#the-army-tool-follows-the-map-it-is-drawn-on): the page's own reads the army model
    armyHasUnsaved: opts.armyUnsaved || (() => false),
    modPath: () => opts.modPath || "",
    // …and the second argument it hands load (reloadOpts, null when none: { afterSave: true } is a re-read of the map a write changed)
    reloadAfterImmediateWrite: async (msg, o) => { reloads.push(String(msg)); reloadOpts.push(o === undefined ? null : o); },
    load: async (msg) => { loads.push(msg === undefined ? null : String(msg)); },
    location: loc,
    history: { state: null, replaceState(state, title, url) { replaced.push(String(url)); const q = String(url).indexOf("?"); loc.search = q === -1 ? "" : String(url).slice(q).replace(/#.*$/, ""); } },
    document: {
      getElementById: (id) => elements.get(id) || null,
      createElement: (tag) => T.element(tag),
      body: { appendChild() {}, removeChild() {} },
      addEventListener() {}, removeEventListener() {},
    },
    window: { NovaMapRuleLabels: require("./public/map-rule-labels.js"), confirm: () => true },
  }, opts.extra || {});
  sb.globalThis = sb;
  vm.createContext(sb);
  vm.runInContext(code, sb, { filename: "public/map.js (world block)" });
  return {
    sb, elements, statuses, reloads, reloadOpts, loads, replaced, code,
    el: (id) => elements.get(id) || null,
    state: () => sb.__state(),
    fns: sb.__fns,
    /** fire an element's listeners for `type` (as a click on it would), then let what they started settle: the page's listeners
     *  call an async function without returning it (`() => { openWorldConfirm(); }`), as a browser's do */
    async fire(id, type = "click", event = {}) {
      const e = elements.get(id);
      if (!e) throw new Error(`no #${id} in map.html`);
      const out = [];
      for (const fn of (e.listeners[type] || [])) out.push(await fn(Object.assign({ target: e, preventDefault() {}, stopPropagation() {} }, event)));
      await settle();
      return out;
    },
    settle,
  };
}

module.exports = { worldBlock, worldBlockFunctionNames, withPageHelpers, htmlElements, worldPage, settle, STUBBED, HTML, BLOCK_START, BLOCK_END };
