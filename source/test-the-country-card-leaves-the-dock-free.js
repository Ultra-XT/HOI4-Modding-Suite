// ⛔ #the-country-card-leaves-the-dock-free (final round, L3; the class of tool campaign B4-14) — THE 🏳 COUNTRY CARD LEAVES THE TOOL DOCK FREE.
//
// #mapCountryCard and #mapToolPanel both stood at left:10px with z-index 8, and the card comes later in the DOM: while it was open, every
// tool of the dock lay under its 300px, and so did the dock's own » toggle (the real page, elementFromPoint at each visible tool's centre,
// scratchpad final/left/probe-L3.js: 16 of 16 covered at ba18d96c, collapsed and expanded; Playwright: "#mapCountryCard intercepts pointer
// events" on #mapToolToggle). B4-14 had fixed the 🪖 Army panel's same overlap (placeArmyPanelBesideDock); the card never adopted it. It now
// stands just right of the dock, measured, and moves when the dock is toggled: 0 of 16 covered, either way.
//
// RUN, not grepped: placeCountryCardBesideDock lifted from public/map.js into a sandbox, as test-the-army-panel-leaves-the-dock-free.js
// runs placeArmyPanelBesideDock; and where it is called, read off the comment-masked source. Binds no port.
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const T = require("./testlib-map-page.js");

let checks = 0; const fails = [];
const ok = (c, m, d) => { checks++; if (c) console.log("  ok   " + m); else { fails.push(m); console.log("  FAIL " + m + (d !== undefined ? "   -> " + JSON.stringify(d).slice(0, 500) : "")); } };
const HTML = fs.readFileSync(path.join(__dirname, "public", "map.html"), "utf8").replace(/\r\n/g, "\n");

console.log("\n-- the overlap the card starts from (map.html) --");
{
  const css = (sel) => { const m = new RegExp(`${sel.replace(/#/g, "#")} \\{([^}]*)\\}`).exec(HTML); return m ? m[1] : ""; };
  const card = css("#mapCountryCard"), dock = css("#mapToolPanel");
  ok(/left:\s*10px/.test(card) && /z-index:\s*8/.test(card) && /left:\s*10px/.test(dock) && /z-index:\s*8/.test(dock),
    "THE CONTROL: the card's CSS and the dock's share left:10px and z-index 8 (so the card must be placed, or it covers the dock)", { card, dock });
  ok(HTML.indexOf('id="mapCountryCard"') > HTML.indexOf('id="mapToolPanel"'), "THE CONTROL: …and the card comes later in the DOM, so it paints over the dock");
}

console.log("\n-- the card: just right of the dock, collapsed or expanded --");
{
  let fn = "";
  try { fn = T.lift("function placeCountryCardBesideDock()"); } catch (_) { fn = ""; }   // (missing: a FAIL below, not a throw that skips the rest)
  ok(!!fn, "THE CONTROL: placeCountryCardBesideDock is found");
  const panel = { style: { display: "block", left: "10px" }, offsetParent: { getBoundingClientRect: () => ({ left: 40, top: 0 }) } };
  let dockRight = 125, dockWidth = 75;
  const dock = { getBoundingClientRect: () => ({ left: dockRight - dockWidth, right: dockRight, width: dockWidth }) };
  const sb = { $: (id) => (id === "mapCountryCard" ? panel : id === "mapToolPanel" ? dock : null), Math };
  vm.createContext(sb);
  if (fn) {
    vm.runInContext(fn + "\nglobalThis.__place = placeCountryCardBesideDock;", sb);
    sb.__place();
    ok(panel.style.left === "93px", "⭐⭐⭐ the open card's left edge is 8px right of the dock's (dock right 125, map left 40 → 93px)", panel.style.left);
    dockRight = 230; dockWidth = 180; sb.__place();
    ok(panel.style.left === "198px", "⭐⭐ …and moves when the dock is expanded", panel.style.left);
    panel.style.display = "none"; panel.style.left = "10px"; sb.__place();
    ok(panel.style.left === "10px", "THE CONTROL: a closed card is left alone", panel.style.left);
  }
  const at = T.MASKED.indexOf("async function openCountryCard(");
  const open = at >= 0 ? T.MASKED.slice(at, T.MASKED.indexOf("\n  }", at)) : "";
  ok(/el\.style\.display = "block";\s*\n\s*if \(typeof placeCountryCardBesideDock === "function"\) placeCountryCardBesideDock\(\);/.test(open),
    "⭐⭐ opening the card places it right after it is shown", open.slice(0, 400));
  const dockInit = T.lift("function apply(expanded)", "\n    }");
  ok(/placeCountryCardBesideDock\(\)/.test(dockInit) && /classList\.toggle\("collapsed"/.test(dockInit), "⭐ …and the dock's toggle moves it", dockInit);
  ok((T.MASKED.match(/function placeCountryCardBesideDock\(\)/g) || []).length === 1, "(one definition)");
}

console.log(`\n=== the country card leaves the dock free: ${checks - fails.length}/${checks} ===`);
fails.forEach((f) => console.log("   FAILED: " + f));
process.exit(fails.length || checks < 8 ? 1 : 0);
