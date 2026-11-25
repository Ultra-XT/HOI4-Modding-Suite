// ⛔ #a-key-under-a-dialog-stays-under-it — WHILE A DIALOG OF THE MAP PAGE IS UP, A KEY ACTS ON THE DIALOG, NEVER ON THE MAP BENEATH IT.
//
// B6-7 (tool campaign, CONFIRMED, low): with "⚠ Turn off Auto-fix?" up, "e" switched the tool to 🧹 Erase beneath it and Esc switched to
// Inspect without closing it; the same under Map Errors (the Save gate included). The key handler's mapOpenModal asked six dialogs whether
// they were open, the backdrop closer knew a different six, and the canvas guards a third list.
//
// The fix (public/map.js): one list, mapDialogs(), read by mapOpenModal (the key handler), the backdrop closer and overFloatingPanel (both
// canvas guards). The key handler records the open dialog in the capture phase, so a confirm box that closes itself on Esc in its own
// handler does not then let that Esc take the map back to Inspect. Map Errors hands the list its own dismiss (novaDismiss).
//
// Derived, not typed: the dialogs map.html defines (an overlay: inset:0 and display:none), the overlays map.js makes, and the boxes of
// ai-field-assist.js that map.js opens, must all be in the list. Then run, not read: the page's own key handler, lifted with mapDialogs
// and mapOpenModal into a sandbox, presses a tool key and Esc under each dialog of the list.
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const T = require("./testlib-map-page.js");
const { maskJsComments } = require("./testlib-strip-comments.js");

let checks = 0;
const fails = [];
function rec(name, pass, detail) {
  checks++;
  console.log(`${pass ? "PASS" : "FAIL"} ${name}`);
  if (!pass) { fails.push(name); if (detail !== undefined) console.log("   ", typeof detail === "string" ? detail.slice(0, 1200) : JSON.stringify(detail).slice(0, 1200)); }
}
const MAP = T.MAP, MASKED = T.MASKED;
const HTML = fs.readFileSync(path.join(__dirname, "public", "map.html"), "utf8");
const AFA = fs.readFileSync(path.join(__dirname, "public", "ai-field-assist.js"), "utf8").replace(/\r\n/g, "\n");
const AFA_M = maskJsComments(AFA);

// ── the list itself, lifted ──
let listed = [];
let dialogsSrc = "";
try {
  dialogsSrc = T.lift("function mapDialogs()");
  const body = maskJsComments(dialogsSrc);
  listed = [...body.matchAll(/\["([\w-]+)",/g)].map((m) => m[1]);
} catch (e) { rec("public/map.js has one list of the page's dialogs (mapDialogs)", false, e.message); }
rec("the list names the dialogs (the probe: at least the eight of map.html)", listed.length >= 8, listed);

// ── 1. derived: every dialog the page can show is in the list ──
const htmlOverlays = [...HTML.matchAll(/<div id="([\w-]+)" style="([^"]*)"/g)].filter((m) => /\binset:\s*0\b/.test(m[2]) && /display:\s*none/.test(m[2])).map((m) => m[1]);
rec("map.html's overlays are found (the probe: the Auto-fix warning and the Keys popup among them)", htmlOverlays.includes("mapAutofixWarn") && htmlOverlays.includes("mapKeysOverlay"), htmlOverlays);
const keysOwned = /function keysModalOpen\(\)\s*\{[^}]*mapKeysOverlay/.test(MASKED);
const missingHtml = htmlOverlays.filter((id) => !listed.includes(id) && !(id === "mapKeysOverlay" && keysOwned));
rec("⭐⭐ every overlay map.html defines is in the list (the ⌨ Keys popup excepted: keysModalOpen owns it)", missingHtml.length === 0, missingHtml);
const made = [...MASKED.matchAll(/\.id = "([\w-]+)";\s*\n\s*\w+\.style\.cssText = "position:fixed;\s*inset:0/g)].map((m) => m[1]);
rec("map.js's own overlays are found (the probe: Map Errors)", made.includes("mapErrOverlay"), made);
rec("⭐⭐ every overlay map.js makes is in the list", made.every((id) => listed.includes(id)), made.filter((id) => !listed.includes(id)));
const called = [...new Set([...MASKED.matchAll(/\b(?:window\.)?(nova[A-Z]\w*|nb[A-Z]\w*)\(/g)].map((m) => m[1]))];
/** The body of one of ai-field-assist.js's window functions (to its two-space `};`), or "". */
const afaBody = (fn) => { const at = AFA_M.indexOf(`window.${fn} = window.${fn} ||`); if (at === -1) return ""; const end = AFA_M.indexOf("\n  };", at); return AFA_M.slice(at, end === -1 ? undefined : end); };
/** The overlay ids a window function makes: its own, and those of the ai-field-assist functions it calls (nbAlert → showNovaInfoModal). */
const overlayIds = (body) => [...body.matchAll(/\b(?:ov|overlay)\.id = "([\w-]+)"/g)].map((m) => m[1]);
const boxes = [];
for (const fn of called) {
  const body = afaBody(fn);
  if (!body) continue;
  const ids = overlayIds(body);
  for (const m of body.matchAll(/window\.(\w+)\(/g)) if (m[1] !== fn) ids.push(...overlayIds(afaBody(m[1])));
  for (const id of new Set(ids)) boxes.push({ fn, id });
}
rec("the boxes of ai-field-assist.js map.js opens are found (the probe: novaConfirm's, and nbAlert's through showNovaInfoModal)", boxes.some((b) => b.fn === "novaConfirm") && boxes.some((b) => b.fn === "nbAlert"), boxes);
rec("⭐⭐ every such box is in the list", boxes.every((b) => listed.includes(b.id)), boxes.filter((b) => !listed.includes(b.id)));

// ── 2. run: the page's own key handler under each dialog ──
function keyPage() {
  const els = new Map();
  const listeners = [];
  const log = { tools: [], modes: [], closed: [], saves: 0 };
  const el = (id) => { if (!els.has(id)) { const e = T.element("div"); e.id = id; e.style.display = "none"; els.set(id, e); } return els.get(id); };
  const closer = (id) => () => { log.closed.push(id); const e = els.get(id); if (e) e.style.display = "none"; };
  const sb = {
    console, $: (id) => (els.has(id) ? els.get(id) : null),
    window: { addEventListener: (type, fn, cap) => listeners.push({ type, fn, capture: !!cap }) },
    rebindActionPending: null, handleRebindKey: () => {}, keysModalOpen: () => false, closeKeysModal: () => {},
    closeNewCountryModal: closer("mapNewCountryModal"), closeBlankConfirm: closer("mapBlankConfirm"), closeGenConfirm: closer("mapGenConfirm"),
    closeMoveCountryConfirm: closer("mapMoveCountryConfirm"), closeAutofixWarn: closer("mapAutofixWarn"), closeRedraw: closer("mapRedrawConfirm"),
    cancelWorldConfirm: closer("mapWorldConfirm"), closeWorldProgress: closer("mapWorldProgress"),
    spaceDown: false, wrap: { style: {} }, offX: 0, offY: 0, draw: () => {}, zoomAroundCenter: () => {}, fitView: () => {}, stepBrushSize: () => {},
    flushMapSaves: () => { log.saves++; }, doUndo: () => {}, doRedo: () => {},
    setMode: (m) => { log.modes.push(m); }, toolActionForKey: (k) => ({ e: "erase", b: "paint", i: "inspect" }[k] || null), runToolAction: (a) => { log.tools.push(a); },
  };
  vm.createContext(sb);
  const open = MASKED.indexOf("  let dialogAtKeyDown = null;");
  const hStart = MASKED.indexOf('  window.addEventListener("keydown", (e) => {\n    if (rebindActionPending)');
  const hEnd = hStart === -1 ? -1 : MASKED.indexOf("\n  });", hStart);
  if (open === -1 || hStart === -1 || hEnd === -1) throw new Error(`the key handler was not found (recorder ${open}, handler ${hStart})`);
  vm.runInContext([dialogsSrc, T.lift("function mapOpenModal()"), MAP.slice(open, hEnd + "\n  });".length)].join("\n"), sb);
  const cap = listeners.filter((l) => l.type === "keydown" && l.capture).map((l) => l.fn), bub = listeners.filter((l) => l.type === "keydown" && !l.capture).map((l) => l.fn);
  // a key goes down: the page's capture listeners, then (`between`) what a dialog's own handler does, then the page's own handler
  const press = (key, between) => {
    const ev = { key, code: "", ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, target: { tagName: "DIV" }, preventDefault() {}, stopPropagation() {} };
    for (const fn of cap) fn(ev);
    if (between) between();
    for (const fn of bub) fn(ev);
  };
  return { sb, el, log, press, cap, bub, els };
}

let P = null;
try { P = keyPage(); } catch (e) { rec("the page's key handler, mapDialogs and mapOpenModal run in a sandbox", false, e.message); }
if (P) {
  rec("the key handler has a capture-phase recorder and its own handler (the probe: 1 + 1)", P.cap.length === 1 && P.bub.length === 1, { capture: P.cap.length, bubble: P.bub.length });
  // THE CONTROL: nothing open
  P.press("e");
  P.press("Escape");
  rec("THE CONTROL: with no dialog up, \"e\" picks 🧹 Erase and Esc goes back to Inspect", P.log.tools.join() === "erase" && P.log.modes.join() === "inspect", P.log);
  const source = maskJsComments(dialogsSrc);
  for (const id of listed) {
    P.log.tools.length = 0; P.log.modes.length = 0; P.log.closed.length = 0;
    const box = new RegExp(`\\["${id}", null`).test(source);   // a box that closes itself on Esc
    const node = P.el(id); node.style.display = "flex";
    if (id === "mapErrOverlay") node.novaDismiss = () => { P.log.closed.push(id); node.style.display = "none"; };
    if (id === "ccOverlay") { const c = P.el("ccClose"); c.click = () => { P.log.closed.push(id); node.style.display = "none"; }; }
    P.press("e");
    const keyStayed = P.log.tools.length === 0 && P.log.modes.length === 0 && node.style.display === "flex";
    // Esc: a box that closes itself does so in its own handler, between the page's capture listener and its handler
    P.press("Escape", box ? () => { P.els.delete(id); } : null);
    const escOk = P.log.modes.length === 0 && P.log.tools.length === 0 && (box ? !P.els.has(id) : P.log.closed.join() === id && node.style.display === "none");
    rec(`⭐⭐ under ${id}: "e" does not reach the tools, and Esc ${box ? "closes the box without taking the map to Inspect" : "closes it"}`, keyStayed && escOk, { keyStayed, escOk, log: P.log });
    if (box) P.els.set(id, node);
    node.style.display = "none";
  }
}

// ── 3. the backdrop and the canvas guards read the same list ──
{
  const bdAt = MASKED.indexOf("  for (const [id, close, backdrop] of mapDialogs()) {");
  rec("⭐ the backdrop closer walks mapDialogs()", bdAt !== -1);
  if (bdAt !== -1 && dialogsSrc) {
    const els = new Map();
    const closed = [];
    const sb = { console, $: (id) => { if (!els.has(id)) els.set(id, T.element("div")); return els.get(id); } };
    for (const n of ["closeNewCountryModal", "closeBlankConfirm", "closeGenConfirm", "closeMoveCountryConfirm", "closeAutofixWarn", "closeRedraw", "cancelWorldConfirm", "closeWorldProgress"]) sb[n] = () => closed.push(n);
    vm.createContext(sb);
    vm.runInContext(dialogsSrc + "\n" + MAP.slice(bdAt, MASKED.indexOf("\n  }", bdAt) + 4), sb);
    const withBackdrop = [...els.entries()].filter(([, e]) => (e.listeners.mousedown || []).length).map(([id]) => id);
    for (const [id, e] of els) for (const fn of e.listeners.mousedown || []) fn({ target: e });
    rec("⭐ a click on the backdrop closes each dialog that has a close of its own (the progress panel and the self-made ones excepted)", withBackdrop.length >= 7 && closed.length === withBackdrop.length && !withBackdrop.includes("mapWorldProgress") && withBackdrop.includes("mapRedrawConfirm") && withBackdrop.includes("mapAutofixWarn"), { withBackdrop, closed });
  }
  const literal = (MASKED.match(/e\.target\.closest\("#mapInfo/g) || []).length;
  const derived = (MASKED.match(/if \(overFloatingPanel\(e\.target\)\) return;/g) || []).length;
  rec("⭐ both canvas guards ask overFloatingPanel, and no typed list of panels is left beside it", literal === 0 && derived === 2, { literal, derived });
  try {
    const sb = { console, closeNewCountryModal() {}, closeBlankConfirm() {}, closeGenConfirm() {}, closeMoveCountryConfirm() {}, closeAutofixWarn() {}, closeRedraw() {}, cancelWorldConfirm() {}, closeWorldProgress() {}, $: () => null };
    vm.createContext(sb);
    const fsAt = MASKED.indexOf('  let floatingPanelSelector = "";');
    vm.runInContext(dialogsSrc + "\n" + MAP.slice(fsAt, MASKED.indexOf("\n  }", MASKED.indexOf("function overFloatingPanel(", fsAt)) + 4) + "\nglobalThis.__sel = (() => { let s = ''; overFloatingPanel({ closest: (q) => { s = q; return null; } }); return s; })();", sb);
    const sel = String(sb.__sel || "").split(/,\s*/);
    rec("⭐ …whose selector holds every dialog of the list, and the map's panels", listed.every((id) => sel.includes("#" + id)) && sel.includes("#mapInfo") && sel.includes("#mapArmyPanel"), sel);
  } catch (e) { rec("overFloatingPanel runs", false, e.message); }
}

console.log(`\n${checks - fails.length}/${checks} checks passed`);
if (fails.length) { console.log("FAILED:\n  " + fails.join("\n  ")); process.exit(1); }
console.log("All green");
