// ⌨ #the-reset-button-names-every-key-it-restores — THE ⌨ KEYS POPUP'S RESET BUTTON SAYS WHICH KEYS IT PUTS BACK: ALL OF THEM.
//
// B6-23 (tool campaign, CONFIRMED, low): "Reset tool keys to defaults" was titled "Restore the default tool keys (I/B/M/N/R/U)" — six
// keys — while the click restores every tool's key in DEFAULT_KEYBINDS (fourteen: C, T, E, A, H, L, W and K too), and the popup above
// it lists fourteen tools. The comment above DEFAULT_KEYBINDS still said "The 6 single-key TOOL shortcuts".
//
// Run, not read: the page's own keys block (DEFAULT_KEYBINDS through its startup sync) runs in a sandbox with a saved binding (🧹
// Erase moved to Q), the way a modder who rebound a key opens the page; the button's title is read as the page set it, the button is
// clicked, and what Reset stored is compared with what the title names. The defaults are read off the page, never typed here.
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const T = require("./testlib-map-page.js");

let checks = 0;
const fails = [];
function rec(name, pass, detail) {
  checks++;
  console.log(`${pass ? "PASS" : "FAIL"} ${name}`);
  if (!pass) { fails.push(name); if (detail !== undefined) console.log("   ", typeof detail === "string" ? detail.slice(0, 1200) : JSON.stringify(detail).slice(0, 1200)); }
}
const MAP = T.MAP, MASKED = T.MASKED;
const HTML = fs.readFileSync(path.join(__dirname, "public", "map.html"), "utf8").replace(/\r\n/g, "\n");

// ── the page's keys block, from its defaults to its startup sync (anchors read in the comment-masked text) ──
const OPEN = "  const DEFAULT_KEYBINDS = {";
const CLOSE = "  updateToolKeyHints();";
const a = MASKED.indexOf(OPEN);
const b = a === -1 ? -1 : MASKED.indexOf(CLOSE, a);
const block = a === -1 || b === -1 ? "" : MAP.slice(a, MASKED.indexOf("\n", b));
rec("the keys block is found (DEFAULT_KEYBINDS .. its startup updateToolKeyHints())", block.length > 0 && /resetKeybinds/.test(block), { a, b });

function keysPage(saved) {
  const els = new Map();
  for (const id of ["mapKeysReset", "mapKeysToolList", "mapKeysBtn", "mapKeysClose", "mapKeysOverlay"]) { const el = T.element(id === "mapKeysReset" ? "button" : "div"); el.id = id; els.set(id, el); }
  els.get("mapKeysReset").title = "(as map.html serves it)";
  const store = new Map(saved ? [["nova_map_keybinds", JSON.stringify(saved)]] : []);
  const status = [];
  const sb = {
    console, Object, JSON, Set, String,
    $: (id) => (els.has(id) ? els.get(id) : null),
    localStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => { store.set(k, String(v)); } },
    setStatus: (t) => { status.push(String(t)); }, setMode: () => {},
  };
  vm.createContext(sb);
  vm.runInContext(block + "\n;globalThis.__defaults = DEFAULT_KEYBINDS;", sb);
  const stored = () => { try { return JSON.parse(store.get("nova_map_keybinds") || "null"); } catch (_) { return null; } };
  const click = (id) => { for (const fn of (els.get(id).listeners.click || [])) fn({ target: els.get(id), preventDefault() {} }); };
  return { els, sb, stored, click, status, defaults: sb.__defaults };
}

const named = (title) => (((title || "").match(/\(([^)]*)\)/) || ["", ""])[1]).split("/").map((x) => x.trim().toLowerCase()).filter(Boolean);
let P = null;
if (block) { try { P = keysPage({ erase: "q" }); } catch (e) { rec("the keys block runs in a sandbox", false, e.stack || e.message); } }
if (P) {
  const defaults = Object.values(P.defaults || {});
  rec("THE CONTROL: the page has more than six tool keys to restore (DEFAULT_KEYBINDS, read off the page)", defaults.length > 6 && defaults.every((k) => /^[a-z0-9]$/.test(k)), P.defaults);
  // the opened popup shows the saved binding, so Reset has something to put back
  P.click("mapKeysBtn");
  const rows = (P.els.get("mapKeysToolList").innerHTML.match(/class="map-keys-row"/g) || []).length;
  rec("THE CONTROL: the page read the saved binding (🧹 Erase on Q) before Reset", /data-rebind="erase"[^>]*>Q</.test(P.els.get("mapKeysToolList").innerHTML), P.els.get("mapKeysToolList").innerHTML.slice(0, 300));
  const title = P.els.get("mapKeysReset").title;
  rec("the page sets the Reset button's title at startup (not the HTML's)", title !== "(as map.html serves it)" && title.length > 0, title);
  P.click("mapKeysReset");
  const after = P.stored();
  const restored = after ? Object.values(after).filter(Boolean) : [];
  rec("THE CONTROL: Reset stored every default key (Erase back on E)", after && after.erase === P.defaults.erase && restored.length === defaults.length, after);
  const n = named(title);
  const unnamed = restored.filter((k) => !n.includes(k));
  const extra = n.filter((k) => !restored.includes(k));
  rec("⭐⭐ the Reset button's title names every key Reset restores, and no key it does not", restored.length > 0 && unnamed.length === 0 && extra.length === 0, { title, unnamed, extra });
  const count = Number(((/\b(\d+)\b/.exec(title)) || [])[1]);
  rec("⭐ …and the number it gives is the number of tools it puts back, the rows the popup lists", !/\d/.test(title.replace(/\([^)]*\)/, "")) || (count === restored.length && count === rows), { title, rows, restored: restored.length });
}

// ── the HTML's own title (what shows before the page has run) names no part-list of the keys ──
{
  const t = (/<button id="mapKeysReset"[^>]*title="([^"]*)"/.exec(HTML) || [])[1];
  rec("map.html's Reset button is found", typeof t === "string", HTML.slice(HTML.indexOf("mapKeysReset") - 20, HTML.indexOf("mapKeysReset") + 200));
  const defaults = P ? Object.values(P.defaults || {}) : [];
  const n = named(t);
  rec("⭐ map.html's own title names no keys, or all of them", n.length === 0 || (defaults.length > 0 && defaults.every((k) => n.includes(k)) && n.length === defaults.length), { title: t });
}

// ── the comment over the defaults counts them right, if it counts them at all (raw text: this one IS about a comment) ──
{
  const at = MAP.indexOf(OPEN);
  const above = at === -1 ? "" : MAP.slice(MAP.lastIndexOf("\n\n", at) + 1, at);
  const said = /\b(\d+)\s+single-key\b/.exec(above);
  const defaults = P ? Object.values(P.defaults || {}) : [];
  rec("the comment over DEFAULT_KEYBINDS gives no count of the tool keys, or the right one", !said || Number(said[1]) === defaults.length, { said: said && said[0], keys: defaults.length });
}

console.log(`\n${checks - fails.length}/${checks} checks passed`);
if (fails.length) { console.log("FAILED:\n  " + fails.join("\n  ")); process.exit(1); }
console.log("All green");
