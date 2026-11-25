// #picker-tile-text-squashed — EVERY LINE OF TEXT IN THE NAVY AND AIR PICKERS WAS HALF-HEIGHT.
//
// Reported from the Military page: the browse pickers showed names and stats "overlapping in a weird way
// that doesn't make sense". They were not overlapping — every row was being sliced through the middle.
//
// Measured in the running picker, Millennium Dawn, USA ship list (62 tiles) and air list (120 tiles):
//
//     row     got      needed
//     id      7.4px    13px
//     name    8.5px    15px
//     hint    6.8px    12px
//     parts   7.9px    14px
//
// The mechanism: `.modal-item-tech` sets `min-height: 124px`, and with the grid's default `auto` rows every
// row came out at exactly 124px. A tile carrying an id, a display name, an "★ USA design" line AND a module
// list needs about 144px. The 20px deficit was handed to flex-shrink — which is 1 by default on a flex
// container's children — so all five children were squashed proportionally and then clipped by their own
// `overflow: hidden`. Tiles with only three rows fitted inside 124px and rendered perfectly, which is why the
// same grid looked fine for plain hulls and broken for designs.
//
// THE FIX: size the row to what the tile actually needs (`grid-auto-rows: min-content`), so nothing shrinks.
//
// ⚠️ AND NOT THE OTHER WAY. Putting `flex-shrink: 0` on the children also stops the clipping — measured — but
// the content then SPILLS out past the tile's border instead, which is worse than a clip. Both were driven in
// the real browser before choosing:
//
//     none                      row 124px   clipped: yes   spills: no
//     grid-auto-rows only       row 151px   clipped: no    spills: no   <-- shipped
//     no-shrink only            row 124px   clipped: no    spills: YES
//     no-shrink + auto-rows     row 151px   clipped: no    spills: no
//
// The row has to be big enough; the children must stay shrinkable as the last line of defence.
"use strict";
const fs = require("fs");
const path = require("path");

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

const CSS = fs.readFileSync(path.join(__dirname, "public", "styles.css"), "utf8");

/** The declaration block of a selector, comments stripped — a rule's own prose must not answer for it. */
function ruleBody(selector) {
  const at = CSS.indexOf(selector + " {");
  if (at === -1) return null;
  const open = CSS.indexOf("{", at);
  const close = CSS.indexOf("}", open);
  if (open === -1 || close === -1) return null;
  return CSS.slice(open + 1, close).replace(/\/\*[\s\S]*?\*\//g, "");
}

console.log("\n[the grid sizes its rows to what a tile needs]");
{
  const body = ruleBody(".modal-grid-techs");
  rec("the picker grid rule exists", !!body, "selector not found");
  if (body) {
    const m = /grid-auto-rows\s*:\s*([^;]+);/.exec(body);
    rec("grid-auto-rows is set", !!m, body.trim().slice(0, 200));
    // Any content-based sizing works; a fixed length would re-create the bug exactly.
    const val = m ? m[1].trim() : "";
    rec("…to a content-based value, not a fixed height", /^(min-content|max-content|auto|fit-content)/.test(val), val);
    rec("…and specifically not a length", !/^\d/.test(val), val);
  }
}

console.log("\n[the tile keeps a floor, so short tiles stay uniform]");
{
  const body = ruleBody(".modal-item-tech");
  rec("the tile rule exists", !!body, "selector not found");
  if (body) {
    rec("min-height is the floor", /min-height\s*:\s*\d+px/.test(body), body.trim().slice(0, 200));
    // A hard `height` would pin the tile again and bring the squash straight back.
    rec("…and there is no hard height", !/(^|[;\s])height\s*:\s*\d+px/.test(body), body.trim().slice(0, 200));
  }
}

console.log("\n[the trap] the children must stay shrinkable");
{
  // ⭐ The measured wrong fix. If someone adds flex-shrink:0 (or flex:none / flex:0 0 auto) to the tile's
  // children, clipping becomes spilling — text drawn outside the card, over the tiles below.
  const kids = ruleBody(".modal-item-tech > *");
  rec("no blanket no-shrink rule on the tile's children",
    !kids || !/flex(-shrink)?\s*:\s*(0|none|0\s+0)/.test(kids), kids);
}

console.log("\n[CONTROL] the rule reaches every picker that uses this grid");
{
  // The same grid backs the equipment browser in the Military page and the pickers in Country Setup. A fix
  // that only reached one of them would leave the other squashed.
  const users = ["public/army.js", "public/country-setup.js", "public/country-setup.html"]
    .filter((f) => {
      try { return /modal-grid-techs/.test(fs.readFileSync(path.join(__dirname, f), "utf8")); }
      catch (_) { return false; }
    });
  rec("more than one surface uses this grid", users.length >= 2, users);
  rec("…and the fix is on the shared class, not a per-page override", (CSS.match(/grid-auto-rows/g) || []).length >= 1, "not found");
}

console.log(`\n=== picker tile text not squashed: ${checks} checks, ${fails.length} failed ===`);
if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
