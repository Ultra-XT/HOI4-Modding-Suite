// ⛔ #ctrl-s-saves-from-a-field — ON THE MAP PAGE, CTRL+S SAVES WHEREVER THE FOCUS IS; CTRL+Z AND CTRL+Y IN A FIELD STAY THE FIELD'S.
//
// B6-12 (tool campaign, CONFIRMED, low): with the focus in a field of the state panel (the state's name, #miNameInp), Ctrl+S sent no
// POST and said nothing, while ⌨ Keys listed "Save / Undo / Redo — Ctrl+S Ctrl+Z Ctrl+Y" with no exception and the 💾 button's title
// says "(Ctrl+S)". The key handler returned for any key typed into a field before it reached its Ctrl branch.
//
// Decided (VERIFIED.md, B6-12): Ctrl+Z and Ctrl+Y in a field are ignored on purpose — they undo the field's typing, not the map. So
// only Ctrl+S goes through the field guard, and the ⌨ Keys popup now says what the keys do in a field.
//
// Run, not read: the page's own key handler (with mapDialogs and mapOpenModal, as test-a-key-under-a-dialog-stays-under-it.js lifts
// them) in a sandbox, pressed with the focus in each kind of field the handler calls typing — the kinds are read off its own line.
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
const HTML = fs.readFileSync(path.join(__dirname, "public", "map.html"), "utf8").replace(/\r\n/g, "\n");

// ── the handler, and the kinds of field it calls typing (derived from its own line) ──
const hStart = MASKED.indexOf('  window.addEventListener("keydown", (e) => {\n    if (rebindActionPending)');
const hEnd = hStart === -1 ? -1 : MASKED.indexOf("\n  });", hStart);
const handlerMasked = hStart === -1 || hEnd === -1 ? "" : MASKED.slice(hStart, hEnd);
const typingLine = (/const t = e\.target, typing = ([^;]+);/.exec(handlerMasked) || [])[1] || "";
const tags = [...typingLine.matchAll(/t\.tagName === "([A-Z]+)"/g)].map((m) => m[1]);
const editable = /t\.isContentEditable/.test(typingLine);
rec("the key handler and its typing guard are found (the probe: INPUT, TEXTAREA and SELECT, and contentEditable)", tags.includes("INPUT") && tags.includes("TEXTAREA") && tags.includes("SELECT") && editable, { hStart, hEnd, typingLine });
const fieldTargets = tags.map((tagName) => ({ name: (/^[AEIOU]/.test(tagName) ? "an " : "a ") + tagName, t: { tagName } })).concat(editable ? [{ name: "a contentEditable", t: { tagName: "DIV", isContentEditable: true } }] : []);

function keyPage() {
  const els = new Map();
  const listeners = [];
  const log = { saves: 0, undos: 0, redos: 0, tools: [], modes: [] };
  const noop = () => {};
  const sb = {
    console, $: (id) => (els.has(id) ? els.get(id) : null),
    window: { addEventListener: (type, fn, cap) => listeners.push({ type, fn, capture: !!cap }) },
    rebindActionPending: null, handleRebindKey: noop, keysModalOpen: () => false, closeKeysModal: noop,
    closeNewCountryModal: noop, closeBlankConfirm: noop, closeGenConfirm: noop, closeMoveCountryConfirm: noop, closeAutofixWarn: noop,
    closeRedraw: noop, cancelWorldConfirm: noop, closeWorldProgress: noop,
    spaceDown: false, wrap: { style: {} }, offX: 0, offY: 0, draw: noop, zoomAroundCenter: noop, fitView: noop, stepBrushSize: noop,
    flushMapSaves: () => { log.saves++; }, doUndo: () => { log.undos++; }, doRedo: () => { log.redos++; },
    setMode: (m) => { log.modes.push(m); }, toolActionForKey: (k) => ({ e: "erase" }[k] || null), runToolAction: (a) => { log.tools.push(a); },
  };
  vm.createContext(sb);
  const open = MASKED.indexOf("  let dialogAtKeyDown = null;");
  if (open === -1 || hStart === -1 || hEnd === -1) throw new Error(`the key handler was not found (recorder ${open}, handler ${hStart})`);
  vm.runInContext([T.lift("function mapDialogs()"), T.lift("function mapOpenModal()"), MAP.slice(open, hEnd + "\n  });".length)].join("\n"), sb);
  const handlers = listeners.filter((l) => l.type === "keydown").sort((a, b) => Number(b.capture) - Number(a.capture)).map((l) => l.fn);
  const press = (key, target, mods = {}) => {
    const ev = Object.assign({ key, code: "", ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, target, defaultPrevented: false, stopPropagation() {} }, mods);
    ev.preventDefault = () => { ev.defaultPrevented = true; };
    for (const fn of handlers) fn(ev);
    return ev;
  };
  const reset = () => { log.saves = 0; log.undos = 0; log.redos = 0; log.tools.length = 0; log.modes.length = 0; };
  return { sb, els, log, press, reset };
}

let P = null;
try { P = keyPage(); } catch (e) { rec("the page's key handler runs in a sandbox", false, e.message); }
if (P) {
  // THE CONTROL: off a field, Ctrl+S saves and Ctrl+Z / Ctrl+Y undo and redo the map
  const off = { tagName: "CANVAS" };
  const s0 = P.press("s", off, { ctrlKey: true });
  P.press("z", off, { ctrlKey: true });
  P.press("y", off, { ctrlKey: true });
  rec("THE CONTROL: off a field, Ctrl+S saves (and keeps the browser's own Save off), Ctrl+Z undoes and Ctrl+Y redoes the map", P.log.saves === 1 && s0.defaultPrevented && P.log.undos === 1 && P.log.redos === 1, P.log);

  for (const f of fieldTargets) {
    P.reset();
    const ev = P.press("s", f.t, { ctrlKey: true });
    rec(`⭐⭐ in ${f.name} field, Ctrl+S saves (once), and the browser's own Save does not open`, P.log.saves === 1 && ev.defaultPrevented, { log: P.log, prevented: ev.defaultPrevented });
    P.reset();
    const evS = P.press("S", f.t, { ctrlKey: true, shiftKey: true });
    const evM = P.press("s", f.t, { metaKey: true });
    rec(`…and so do Ctrl+Shift+S and Cmd+S there, as they do off a field (${f.name})`, P.log.saves === 2 && evS.defaultPrevented && evM.defaultPrevented, P.log);
    P.reset();
    const z = P.press("z", f.t, { ctrlKey: true }), y = P.press("y", f.t, { ctrlKey: true }), zz = P.press("z", f.t, { ctrlKey: true, shiftKey: true });
    rec(`⭐ decided: in ${f.name} field, Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z stay the field's (no map undo, the field's own undo not prevented)`, P.log.undos === 0 && P.log.redos === 0 && !z.defaultPrevented && !y.defaultPrevented && !zz.defaultPrevented && P.log.saves === 0, { log: P.log });
    P.reset();
    P.press("e", f.t); P.press("Escape", f.t); P.press("s", f.t, { altKey: true, ctrlKey: true });
    rec(`a plain key, Esc and Ctrl+Alt+S typed into the field still go to the field (${f.name})`, P.log.tools.length === 0 && P.log.modes.length === 0 && P.log.saves === 0, P.log);
  }

  // Under a dialog the key stays the dialog's (#a-key-under-a-dialog-stays-under-it), a field of the dialog included
  P.reset();
  const dlg = T.element("div"); dlg.id = "mapNewCountryModal"; dlg.style.display = "flex"; P.els.set("mapNewCountryModal", dlg);
  P.press("s", { tagName: "INPUT" }, { ctrlKey: true });
  rec("under a dialog, Ctrl+S in the dialog's own field does not save the map beneath it", P.log.saves === 0, P.log);
  dlg.style.display = "none";
}

// ── the words: ⌨ Keys says what the keys do in a field, and the 💾 button names the key ──
{
  const strip = (h) => h.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
  const modal = (/<div id="mapKeysModal"[\s\S]*?<button id="mapKeysReset"/.exec(HTML) || [""])[0];
  const rows = [...modal.matchAll(/<div class="map-keys-row"[^>]*>([\s\S]*?)<\/div>/g)].map((m) => strip(m[1]));
  const ctrlRow = rows.find((r) => /Ctrl\+S/.test(r) && /Ctrl\+Z/.test(r));
  rec("⌨ Keys lists the Ctrl keys (the probe)", !!ctrlRow, rows);
  const fieldRow = rows.find((r) => /\bfield\b/i.test(r));
  rec("⭐ …and says that in a text field Ctrl+S still saves while Ctrl+Z and Ctrl+Y undo and redo the typing, not the map", !!fieldRow && /Ctrl\+S[^.;]*\bsaves\b/.test(fieldRow) && /Ctrl\+Z/.test(fieldRow) && /Ctrl\+Y/.test(fieldRow) && /typing/.test(fieldRow) && /not the map/.test(fieldRow), fieldRow || rows);
  const saveTitle = (/<button id="mapSaveAll"[^>]*title="([^"]*)"/.exec(HTML) || [])[1] || "";
  rec("the 💾 Save button's title names Ctrl+S (the shortcut this test keeps working everywhere)", /Ctrl\+S/.test(saveTitle), saveTitle);
}

// ── one door: the handler saves from ONE place, the Ctrl branch a field's Ctrl+S now reaches (a source read, comments masked) ──
// (test-a-save-keeps-its-own-first-copies.js counts the page's callers of flushMapSaves: the button, Ctrl+S and the quit dialog.)
{
  const handler = maskJsComments(handlerMasked);
  const calls = (handler.match(/\bflushMapSaves\(/g) || []).length;
  const typingReturns = [...handler.matchAll(/if \(typing[^)]*\) return;/g)].map((m) => m[0]);
  rec("⭐ the key handler calls flushMapSaves from one place, and its typing return lets Ctrl+S on to it", calls === 1 && typingReturns.length === 1 && /!\s*ctrlS/.test(typingReturns[0]) && /const ctrlS = \(e\.ctrlKey \|\| e\.metaKey\)[^;]*=== "s";/.test(handler), { calls, typingReturns });
}

console.log(`\n${checks - fails.length}/${checks} checks passed`);
if (fails.length) { console.log("FAILED:\n  " + fails.join("\n  ")); process.exit(1); }
console.log("All green");
