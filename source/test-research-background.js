// BACKGROUND-ART ACCURACY invariants for the research tree (#bg-accurate, #bg-size-natural).
//
// The folder backdrop is part of what HOI4 actually draws, so the editor's "faithful 1:1" claim is only
// true if the art is on by default, drawn at full strength, and drawn at the size and position the game
// uses. Three separate things broke that, and each is pinned here:
//
//   1. it defaulted OFF, and the localStorage read treated "absent" as off, so a mod you had never
//      toggled opened on a bare dark canvas the game never shows;
//   2. the art layer had opacity 0.5, so the editor's dark navy and its purple radial wash showed
//      straight through and tinted it — the "colour that lights through the picture";
//   3. it was stretched to 100% x 100% of the editor's 5200x2400 scroll canvas. Millennium Dawn's
//      infantry art is 2300x975 inside a 2300-wide authored pane, so stretching blew it up 2.3x across
//      and 2.5x down — "it fills the whole page when it should not / much larger than in game".
"use strict";
const fs = require("fs");
const path = require("path");
const assert = require("assert");

const js = fs.readFileSync(path.join(__dirname, "public", "research.js"), "utf8");
const html = fs.readFileSync(path.join(__dirname, "public", "research.html"), "utf8");
let checks = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); checks += 1; };

const bodyOf = (src, startIdx) => {
  const open = src.indexOf("{", startIdx);
  let d = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === "{") d++;
    else if (src[i] === "}") { d--; if (!d) return src.slice(open + 1, i); }
  }
  return "";
};
const cssBlock = (sel) => {
  const i = html.indexOf(sel + " {");
  return i === -1 ? "" : html.slice(i, html.indexOf("}", i) + 1);
};

// ---- 1. ON BY DEFAULT ----
ok(/let SHOW_RESEARCH_BG = true;/.test(js), "the background art defaults ON");
ok(/localStorage\.getItem\(`research_bg_visible_\$\{getModPath\(\)\}`\) !== "0"/.test(js),
  'an absent preference means ON (=== "1" made every untouched mod open with the art off)');
ok(/catch \(_\) \{ SHOW_RESEARCH_BG = true; \}/.test(js), "the read falls back to ON, not OFF");

// ---- 2. NOTHING OF OURS TINTS THE ART ----
const bgCss = cssBlock(".research-bg");
ok(bgCss.length > 0, ".research-bg style block exists");
ok(/opacity:\s*1;/.test(bgCss), "the art is drawn at FULL strength (opacity 0.5 let the editor's colours through)");
ok(!/opacity:\s*0?\.\d/.test(bgCss), ".research-bg has no fractional opacity left");
// the purple wash + helper grid are suppressed while art is shown
ok(/\.canvas-container\.bg-on \{[^}]*background-image:\s*none/.test(html),
  "the purple radial wash is suppressed when art is shown");
ok(/\.research-canvas\.bg-on \{[^}]*background-image:\s*none/.test(html),
  "the 80px helper grid is suppressed when art is shown");
// ...and the class is driven by art ACTUALLY showing, not merely by the toggle
ok(/const showingArt = !!bgKey;/.test(js), "the bg-on class keys on art actually resolving, not on the toggle");
ok(/classList\.toggle\("bg-on", showingArt\)/.test(js), "both layers get the bg-on class from that one flag");
// the wash itself must still exist for the no-art case (it is editor furniture, not a bug)
ok(/rgba\(168, 85, 247/.test(html), "the purple wash still exists for the bare-canvas case");

// ---- 3. DRAWN AT THE GAME'S SIZE AND POSITION ----
const prev = bodyOf(js, js.indexOf("function applyResearchBgPreview("));
ok(prev.length > 0, "applyResearchBgPreview() exists");
// ⚠️ THIS BLOCK USED TO PIN HALF THE BUG. It fixed the DEFAULT path to natural size and then asserted that
// a `cfg.mode === "fit"` branch still existed — and that branch stretched to 100% x 100%. Since the
// Background panel derives "fit" from the vanilla-shaped {0,0}/scale-1 transform, which is what essentially
// every folder in every mod declares, opening the panel put the stretch straight back. The modes are not
// separate models: the engine has ONE, and `fit` and `manual` are two ways of authoring it.
// #bg-scale-is-canvas-percent — behaviour is exercised in test-research-bg-natural-size.js.
ok(/backgroundSize = "auto"/.test(prev), "natural size is the fallback before the texture has loaded");
ok(/nat\.w \* s/.test(prev) && /nat\.h \* s/.test(prev),
  "the size is the texture's own pixels times the authored scale, in px");
ok(!/\$\{s \* 100\}%/.test(prev),
  "scale is NOT a percentage of the element — that made scale 1 mean 'stretch to the canvas'");
ok(!/backgroundSize = "100% 100%"/.test(prev),
  "no branch stretches to the canvas, including the one the Background panel selects");
// the natural-size branch must anchor through the SAME frame as techs/labels/years
ok(/effectiveOriginX \+ \(pane\.x - gb0\.x\)/.test(prev), "the art anchors to the authored pane via effectiveOrigin - gb0");
ok(/effectiveOriginY \+ \(pane\.y - gb0\.y\)/.test(prev), "...on both axes");
ok(/gl\.canvas/.test(prev), "it reads the folder's authored content pane");
// …and then the icon's OWN authored position, which the engine applies inside that pane. Old World Blues
// authors 410,60 on one backdrop and Millennium Dawn -75 on another's y; both were drawn as if at 0,0.
ok(/px \+= ax; py \+= ay;/.test(prev), "the icon's authored position is added on top of the pane");
// stretching must no longer be the default path
const defaultBranch = prev.slice(prev.indexOf("const pane ="));
ok(!/100% 100%/.test(defaultBranch), "the default path never stretches to the canvas");

// ---- 4. THE CANVAS RESERVES ROOM FOR THE ART ----
// MD's infantry pane starts at y=0 against a gridbox at y=325, so without this the origin reserved 26px
// too little and the top of the artwork was clipped off the canvas (the #canvas-bleed class of bug).
ok(/if \(SHOW_RESEARCH_BG && gb0h && \(guiLayout\[pf\] \|\| \{\}\)\.canvas/.test(js),
  "computeEffectiveOrigins folds the background pane into the content bounds");
ok(/minContentY = Math\.min\(minContentY, \(pane\.y - gb0h\.y\) \+ band\)/.test(js),
  "the pane's top edge bounds the origin");
ok(/minContentX = Math\.min\(minContentX, pane\.x - gb0h\.x\)/.test(js),
  "the pane's left edge bounds the origin");

// ---- 5. DISPLAY-ONLY: showing art must never write to the mod ----
const toggle = bodyOf(js, js.indexOf("function toggleResearchBg("));
ok(!/fetch\s*\(/.test(toggle), "toggling the background issues no request");
ok(/localStorage\.setItem/.test(toggle), "the toggle only persists to Nova's own localStorage");

console.log(`test-research-background: ${checks} checks passed`);
