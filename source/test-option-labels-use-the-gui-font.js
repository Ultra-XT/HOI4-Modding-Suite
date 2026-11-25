// The option label's real font, width and height live in the option button's OWN window, `event_option_entry`
// — a TOP-LEVEL SIBLING of the four event windows in interface/eventwindow.gui, not a child of them. The
// layout parser filtered to those four, so that window was never parsed and none of its three numbers ever
// reached the client. With nothing to read, the preview hard-coded a 15px font.
//
// HOI4: font hoi_20bs (size 20, lineHeight 20) in a 340x40 box — exactly TWO lines — deliberately wider than
// the 300px sprite, because the entry declares `clipping = no`.
//
// The CSS was worse than it looked. `white-space:nowrap; overflow:hidden; text-overflow:ellipsis` sat on a
// `display:flex; justify-content:center` button, and text-overflow does not apply to the anonymous flex item
// the label becomes — so NO ELLIPSIS WAS EVER DRAWN, and centring meant the label was clipped at BOTH ends.
// The author saw a fragment with nothing marking it as one.
//
// ⚠️ This test does NOT claim the preview now matches the game exactly. The stage draws in Courier New, a
// monospace stand-in for a proportional face, so a label still takes about 70% more width here. That gap is
// asserted as KNOWN below rather than hidden, so nobody "fixes" this file by deleting the note.
"use strict";

const fs = require("fs");
const path = require("path");
const { stripJsComments } = require("./testlib-strip-comments.js");

const SERVER = stripJsComments(fs.readFileSync(path.join(__dirname, "server.js"), "utf8"));
const EVENTS = stripJsComments(fs.readFileSync(path.join(__dirname, "public", "events.js"), "utf8"));
const HTML = fs.readFileSync(path.join(__dirname, "public", "events.html"), "utf8");

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (detail == null ? "" : "   " + (typeof detail === "string" ? detail : JSON.stringify(detail))));
  if (!ok) fails.push(label);
};

try {
  console.log("1. The option entry's own window is parsed");
  const wantLine = (/const want = new Set\(\[[^\]]*\]\)/.exec(SERVER) || [])[0] || "";
  rec("the window filter was found", wantLine.length > 40, wantLine.slice(0, 100));
  rec("it still collects the four event windows",
    ["EventWindow", "EventWindow_News", "EventWindow_leader", "EventWindow_Operative"].every((w) => wantLine.includes(`"${w}"`)));
  rec("…and now event_option_entry too", wantLine.includes('"event_option_entry"'),
    "without it the label's font/maxWidth/maxHeight never reach the client");

  console.log("\n2. The client reads the label's font instead of inventing one");
  rec("it looks the entry up", /eventWindowLayouts\.event_option_entry/.test(EVENTS));
  rec("…finds its text box", /entry\.elements \? entry\.elements\.find\(\(x\) => x\.kind === "text"\)/.test(EVENTS));
  rec("…and sizes from it", /FONT_PX\(label\.font\)/.test(EVENTS));
  rec("the hardcoded 15px is gone as the primary value",
    !/b\.style\.fontSize = "15px"/.test(EVENTS), "it survives only as a fallback expression");

  console.log("\n3. The CSS no longer pretends to truncate");
  // Match to the rule's own closing brace on its own line. A plain non-greedy `\}` would stop at the first
  // brace inside the block, and a fixed character budget goes stale the moment someone adds a comment —
  // which is exactly how this check first failed, on its own explanatory text.
  const rule = (/\.ev-stage #previewEventOptions \.hoi4-event-opt-btn \{[\s\S]*?\n\s*\}/.exec(HTML) || [])[0] || "";
  rec("the option-button rule was found", rule.length > 100);
  rec("white-space allows the wrap the engine performs", /white-space:\s*normal/.test(rule));
  rec("…nowrap is gone", !/white-space:\s*nowrap/.test(rule));
  rec("…and so is the ellipsis that was never drawn", !/text-overflow:\s*ellipsis/.test(rule));
  rec("line spacing matches the font", /line-height:\s*1\s*[;}]/.test(rule));

  console.log("\n4. HOI4 ground truth, read from the installed .gui and .fnt");
  // DERIVED. Both the window's declared box and the font's own lineHeight, from files on disk.
  const steam = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
  const gui = path.join(steam, "interface", "eventwindow.gui");
  let declared = null;
  if (fs.existsSync(gui)) {
    const text = fs.readFileSync(gui, "utf8");
    const at = text.indexOf("event_option_entry");
    if (at !== -1) {
      const block = text.slice(at, at + 4000);
      declared = {
        font: (/font\s*=\s*"([A-Za-z0-9_]+)"/.exec(block) || [])[1] || null,
        maxWidth: +((/maxWidth\s*=\s*(\d+)/.exec(block) || [])[1] || 0),
        maxHeight: +((/maxHeight\s*=\s*(\d+)/.exec(block) || [])[1] || 0),
      };
    }
  }
  rec("event_option_entry was found in the installed .gui", !!declared, declared);
  if (declared) {
    rec("…it declares a font", !!declared.font, declared.font);
    rec("…a text box wider than the 300px sprite (clipping = no)", declared.maxWidth > 300, declared.maxWidth);
    // The font's own .fnt is the authority on how many lines that height is.
    const fnt = path.join(steam, "gfx", "fonts", declared.font + ".fnt");
    let lineHeight = null;
    if (fs.existsSync(fnt)) {
      const head = fs.readFileSync(fnt, "latin1").slice(0, 400);
      lineHeight = +((/lineHeight=(\d+)/.exec(head) || [])[1] || 0) || null;
    }
    rec("…and the font's .fnt gives its lineHeight", !!lineHeight, lineHeight);
    if (lineHeight) {
      rec("…so the declared height is exactly two lines", declared.maxHeight / lineHeight === 2,
        `${declared.maxHeight} / ${lineHeight}`);
      // FONT_PX must extract the same size the .fnt declares, or the client sizes text wrongly.
      const FONT_PX = (font) => { const m = (font || "").match(/\d+/g); return m ? Math.max(9, +m[m.length - 1]) : 14; };
      rec("…and FONT_PX reads that size out of the font NAME", FONT_PX(declared.font) === lineHeight,
        `FONT_PX("${declared.font}") = ${FONT_PX(declared.font)} vs lineHeight ${lineHeight}`);
    }
  }

  console.log("\n5. The remaining gap is recorded, not hidden");
  // If someone deletes this note believing the preview is now exact, the note should fight back.
  // Line-break tolerant: the note is prose in a wrapped comment, so the two words are not adjacent.
  rec("the monospace stand-in is documented as a known gap",
    /monospace[\s\S]{0,60}stand-in/i.test(fs.readFileSync(path.join(__dirname, "public", "events.js"), "utf8")),
    "a preview that is closer but not exact must say so");
  rec("…and the stage really is still monospace, so the note is not stale",
    /font-family:"Courier New", Courier, monospace/.test(HTML));

  console.log("\n6. This would have rejected what shipped");
  const OLD_CSS = "white-space:nowrap; overflow:hidden; text-overflow:ellipsis;";
  rec("the old CSS would be caught", /white-space:\s*nowrap/.test(OLD_CSS) && /text-overflow:\s*ellipsis/.test(OLD_CSS));
  const OLD_JS = 'b.style.fontSize = "15px";';
  rec("the old hardcoded size would be caught", /fontSize = "15px"/.test(OLD_JS));
  rec("…and neither shape is in the shipped source",
    !/white-space:\s*nowrap/.test(rule) && !/b\.style\.fontSize = "15px"/.test(EVENTS));

  console.log(`\n=== option labels use the gui font: ${checks} checks, ${fails.length} failed ===`);
  if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
} catch (e) {
  console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
  process.exitCode = 1;
}
