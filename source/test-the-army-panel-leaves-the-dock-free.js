// ⛔ #the-army-panel-leaves-the-dock-free (tool campaign B4-14) — 🪖 ARMY IS REACHED BY ITS BUTTON AND A KEY, AND ITS PANEL LEAVES THE TOOL DOCK FREE.
//
// Once a country was picked, the 🪖 Army panel covered every button of the tool dock: #mapArmyPanel and #mapToolPanel both stood at
// left:10px with z-index 8, and the panel came later in the DOM, so every tool lay under the template list (elementFromPoint, at 1600×900).
// And Army had no key: DEFAULT_KEYBINDS, the ⌨ Keys popup and the 🪖 button's title named fourteen tools and not it. The panel now stands
// just right of the dock — measured, collapsed or expanded, and moved when the dock is toggled — and Army has a key, O, in all three places.
//
// RUN, not grepped: the page's keys block (DEFAULT_KEYBINDS through its startup updateToolKeyHints) and placeArmyPanelBesideDock, lifted
// from public/map.js into a sandbox; the button ids are map.html's. The real page's elementFromPoint is the campaign repro's
// (repro-B4-14.final-page.fix.js). Binds no port.
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const T = require("./testlib-map-page.js");

let checks = 0; const fails = [];
const ok = (c, m, d) => { checks++; if (c) console.log("  ok   " + m); else { fails.push(m); console.log("  FAIL " + m + (d !== undefined ? "   -> " + JSON.stringify(d).slice(0, 500) : "")); } };
const MAP = T.MAP, MASKED = T.MASKED;
const HTML = fs.readFileSync(path.join(__dirname, "public", "map.html"), "utf8").replace(/\r\n/g, "\n");

console.log("\n-- the key: in the defaults, the ⌨ Keys popup, and the 🪖 button's title --");
{
  const OPEN = "  const DEFAULT_KEYBINDS = {", CLOSE = "  updateToolKeyHints();";
  const a = MASKED.indexOf(OPEN), b = a === -1 ? -1 : MASKED.indexOf(CLOSE, a);
  const block = a === -1 || b === -1 ? "" : MAP.slice(a, MASKED.indexOf("\n", b));
  ok(block.length > 0, "THE CONTROL: the keys block is found (DEFAULT_KEYBINDS .. its startup updateToolKeyHints())");
  const els = new Map();
  const btnIds = [...HTML.matchAll(/<button id="(map(?:Mode[A-Za-z]+|NewState))" class="map-tool[^"]*"[^>]*title="([^"]*)"/g)].map((m) => [m[1], m[2]]);
  for (const [id, title] of btnIds) { const el = T.element("button"); el.id = id; el.title = title; el.dataset = {}; els.set(id, el); }
  for (const id of ["mapKeysReset", "mapKeysToolList", "mapKeysBtn", "mapKeysClose", "mapKeysOverlay"]) { const el = T.element("div"); el.id = id; els.set(id, el); }
  let moded = null;
  const sb = { console, Object, JSON, Set, String, $: (id) => (els.has(id) ? els.get(id) : null), localStorage: { getItem: () => null, setItem: () => {} }, setStatus: () => {}, setMode: (m) => { moded = m; } };
  vm.createContext(sb);
  vm.runInContext(block + "\n;globalThis.__d = DEFAULT_KEYBINDS; globalThis.__l = TOOL_LABELS; globalThis.__run = runToolAction; globalThis.__render = renderKeysModal; globalThis.__for = toolActionForKey;", sb);
  const d = sb.__d || {}, keys = Object.values(d);
  ok(/^[a-z0-9]$/.test(d.army || "") && keys.filter((k) => k === d.army).length === 1 && d.army !== "0", "⭐⭐⭐ 🪖 Army has a default key of its own (one letter, no other tool's, not the reserved 0)", d);
  ok(btnIds.some(([id]) => id === "mapModeArmy"), "THE CONTROL: map.html has the 🪖 button", btnIds.map((x) => x[0]));
  ok(/ — key: O$/.test(els.get("mapModeArmy").title), "⭐⭐ the 🪖 button's title names its key", els.get("mapModeArmy").title.slice(-80));
  sb.__render();
  const list = els.get("mapKeysToolList").innerHTML || "";
  ok(/<span>🪖 Army<\/span>/.test(list) && /data-rebind="army"/.test(list), "⭐⭐ the ⌨ Keys popup lists Army, to remap like any tool", list.slice(-300));
  ok(sb.__for(d.army) === "army", "⭐ the key finds the Army tool", sb.__for(d.army));
  sb.__run("army");
  ok(moded === "army", "⭐ …and runs it as the 🪖 button does (setMode(\"army\"))", moded);
  // the page's own tool → button list (updateToolKeyHints), read off the page, against map.html's buttons
  const hintMap = /function updateToolKeyHints\(\) \{\s*const map = (\{[^}]*\});/.exec(block);
  const btnOf = hintMap ? vm.runInNewContext("(" + hintMap[1] + ")") : {};
  ok(Object.keys(d).every((k) => sb.__l[k] && btnOf[k] && els.has(btnOf[k])), "THE CONTROL: every tool key has a label, and a button of map.html whose title names it", { keys: Object.keys(d), btnOf });
}

console.log("\n-- the panel: just right of the dock, collapsed or expanded --");
{
  const fn = T.lift("function placeArmyPanelBesideDock()");
  const panel = { style: { display: "block", left: "10px" }, offsetParent: { getBoundingClientRect: () => ({ left: 40, top: 0 }) } };
  let dockRight = 125, dockWidth = 75;
  const dock = { getBoundingClientRect: () => ({ left: dockRight - dockWidth, right: dockRight, width: dockWidth }) };
  const sb = { $: (id) => (id === "mapArmyPanel" ? panel : id === "mapToolPanel" ? dock : null), Math };
  vm.createContext(sb);
  vm.runInContext(fn + "\nglobalThis.__place = placeArmyPanelBesideDock;", sb);
  sb.__place();
  ok(panel.style.left === "93px", "⭐⭐⭐ the open panel's left edge is 8px right of the dock's (dock right 125, map left 40 → 93px)", panel.style.left);
  dockRight = 230; dockWidth = 180; sb.__place();
  ok(panel.style.left === "198px", "⭐⭐ …and moves when the dock is expanded", panel.style.left);
  panel.style.display = "none"; panel.style.left = "10px"; sb.__place();
  ok(panel.style.left === "10px", "THE CONTROL: a closed panel is left alone", panel.style.left);
  const enter = T.lift("function enterArmyMode()");
  ok(/panel\.style\.display = "block";[\s\S]*placeArmyPanelBesideDock\(\)/.test(T.MASKED.slice(T.MASKED.indexOf("function enterArmyMode()"), T.MASKED.indexOf("function enterArmyMode()") + enter.length)), "⭐⭐ entering Army mode places the panel after it is shown", enter.slice(0, 300));
  const dockInit = T.lift("function apply(expanded)", "\n    }");
  ok(/placeArmyPanelBesideDock\(\)/.test(dockInit) && /classList\.toggle\("collapsed"/.test(dockInit), "⭐ …and the dock's toggle moves it", dockInit);
}

console.log("\n-- the key against a modder's saved keys (⛔ #a-new-tool-key-gives-way-to-a-saved-one, review of B4-14) --");
// A modder who remapped a tool before this release has every tool's key saved but Army's (saveKeybinds saves them all). If one of them is on O,
// Army's new default must give way: each key belongs to one tool, as a rebind keeps it. Asked of EVERY tool as if it were the new one, so the rule
// is the page's, not Army's alone: the saved keys are the defaults of every other tool, with another tool moved onto the new one's default key.
{
  const OPEN = "  const DEFAULT_KEYBINDS = {", CLOSE = "  updateToolKeyHints();";
  const a = MASKED.indexOf(OPEN), b = a === -1 ? -1 : MASKED.indexOf(CLOSE, a);
  const block = a === -1 || b === -1 ? "" : MAP.slice(a, MASKED.indexOf("\n", b));
  const load = (saved) => {
    const sb = { console, Object, JSON, Set, String, $: () => null, localStorage: { getItem: (k) => (k === "nova_map_keybinds" && saved ? JSON.stringify(saved) : null), setItem: () => {} }, setStatus: () => {}, setMode: () => {} };
    vm.createContext(sb);
    vm.runInContext(block + "\n;globalThis.__k = keyBindings; globalThis.__d = DEFAULT_KEYBINDS; globalThis.__for = toolActionForKey;", sb);
    return sb;
  };
  const D = load(null).__d || {};
  const tools = Object.keys(D);
  ok(tools.length > 1 && JSON.stringify(load(null).__k) === JSON.stringify(D), "THE CONTROL: with nothing saved every tool has its default key", load(null).__k);
  const shared = (k) => { const by = new Map(); for (const t in k) if (k[t]) by.set(k[t], (by.get(k[t]) || []).concat(t)); return [...by].filter(([, v]) => v.length > 1); };
  const clash = [], kept = [];
  for (const t of tools) {
    const other = tools.find((x) => x !== t);
    const saved = {}; for (const x of tools) if (x !== t) saved[x] = D[x];
    saved[other] = D[t];   // the modder put another tool on the new tool's default key
    const sb = load(saved);
    if (shared(sb.__k).length || sb.__for(D[t]) !== other || sb.__k[t] !== "") clash.push({ new: t, other, keys: sb.__k, runs: sb.__for(D[t]) });
    const plain = {}; for (const x of tools) if (x !== t) plain[x] = D[x];
    if (load(plain).__k[t] !== D[t]) kept.push(t);
  }
  ok(clash.length === 0, `⭐⭐⭐ a tool new since the keys were saved gives its default up to the saved tool on it: one tool per key, the key runs the saved one (all ${tools.length} tools asked)`, clash.slice(0, 2));
  ok(kept.length === 0, "⭐⭐ …and keeps its default when no saved key holds it", kept);
  const own = {}; for (const x of tools) own[x] = D[x];
  own[tools[0]] = D[tools[1]]; own[tools[1]] = D[tools[0]];   // a modder's own swap, saved with every tool listed
  const sw = load(own).__k;
  ok(sw[tools[0]] === D[tools[1]] && sw[tools[1]] === D[tools[0]], "THE CONTROL: keys saved for every tool are taken as saved", sw);
}

console.log(`\n${checks - fails.length}/${checks} checks passed`);
if (fails.length) { console.log("FAILED:\n  " + fails.join("\n  ")); process.exit(1); }
