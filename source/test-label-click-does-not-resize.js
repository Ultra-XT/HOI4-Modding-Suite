// #label-changes-size-on-click — CLICKING AN IN-GAME SECTION LABEL CHANGED ITS SIZE, AND IT STAYED CHANGED.
//
// Reported twice. The first report was read as being about the year markers' resize handle
// (#year-label-click-resizes, fixed); it was actually the section labels, which have their own path.
//
// A section label normally draws as an <img> of the game's REAL bitmap font (guiGlyphSrc), with padding:0 so
// the image's top-left is the authored pixel. startEditGuiLabel sets el.textContent, which destroys that
// image and leaves browser text behind at the stylesheet's 15px with no padding — so the label changed size
// the instant it was clicked.
//
// And then it stayed that way. finish() rebuilds the glyph by calling renderCanvas when the text CHANGED,
// and the Escape path calls it too — but the ordinary path (click in, change nothing, click away) did
// `el.textContent = stripLabelCodes(before); return;` and never re-rendered. The label remained browser text
// for the rest of the session unless something else happened to redraw the canvas. The fix existed twice in
// the same function and the third exit never adopted it.
//
// Measured in the running editor on Millennium Dawn, before and after:
//
//     before      glyph 600x33
//     editing     text  132x26      <-- the visible jump
//     after blur  text  132x26      <-- and it never came back
//
//     after the fix:  33 -> 33 -> 33, glyph restored
//
// THE RULE: entering edit changes what you can DO with a label, never how big it is.
"use strict";
const fs = require("fs");
const path = require("path");
const { stripJsComments } = require("./testlib-strip-comments.js");

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

// ⭐ Strip comments first — this fix's own explanation quotes the code it replaced.
const CODE = stripJsComments(fs.readFileSync(path.join(__dirname, "public", "research.js"), "utf8"));

function fnBody(name) {
  const at = CODE.indexOf(`function ${name}(`);
  if (at === -1) return "";
  const open = CODE.indexOf("{", at);
  let d = 0;
  for (let i = open; i < CODE.length; i++) {
    if (CODE[i] === "{") d++;
    else if (CODE[i] === "}") { d--; if (d === 0) return CODE.slice(at, i + 1); }
  }
  return "";
}

const EDIT = fnBody("startEditGuiLabel");

console.log("\n[entering edit does not change the label's size]");
{
  rec("startEditGuiLabel is found", EDIT.length > 400, EDIT.length);
  // The label's own font size, not the stylesheet's default.
  rec("the editable text takes the label's real font size", /el\.style\.fontSize = \(l\.fontPx \|\| labelFontToPx\(l\.font\)\)/.test(EDIT), "font size not matched");
  // …and the padding the text-fallback path uses, since the glyph path sets padding:0.
  rec("…and the padding the text fallback uses", /el\.style\.padding = "2px 8px"/.test(EDIT), "padding not restored");
  // The box is pinned to the glyph it replaces, so there is no jump at all.
  rec("the box is pinned to the glyph's height", /minHeight/.test(EDIT), "height not pinned");
  rec("…measured from the glyph itself", /img\.gui-label-glyph/.test(EDIT), "not measured from the glyph");
}

console.log("\n[THE BUG] every exit from edit must put the glyph back");
{
  // There are three ways out: committed a change, changed nothing, pressed Escape. All three must re-render,
  // or the label is left as browser text at a different size.
  const exits = (EDIT.match(/renderCanvas\(\)/g) || []).length;
  rec("every exit re-renders (3 of them)", exits >= 3, `${exits} renderCanvas calls in startEditGuiLabel`);
  // The specific regression: a bare `return` in the no-change branch with no re-render before it.
  const noChange = /if \(!commit \|\| !after \|\| after === before\.trim\(\)\)[\s\S]{0,400}?\n      \}/.exec(EDIT);
  rec("the no-change branch is a block, not a one-line return", !!noChange, "branch shape changed");
  if (noChange) {
    rec("…and it re-renders before returning", /renderCanvas\(\)/.test(noChange[0]), noChange[0].slice(0, 200));
  }
}

console.log("\n[CONTROL] the year markers' own fix is still in place");
{
  // The sibling bug in the same page. If this ever regresses, clicking a year marker silently resizes it.
  const src = CODE;
  rec("a year resize commits only when the pointer moved", /if \(moved\) setYearFont\(/.test(src), "the moved guard is gone");
}

console.log(`\n=== label click does not resize: ${checks} checks, ${fails.length} failed ===`);
if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
