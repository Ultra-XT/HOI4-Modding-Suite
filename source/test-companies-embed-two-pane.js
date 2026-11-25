// #companies-embed-sidebar-cut-off — THE COMPANIES TAB'S SIDEBAR ENDED IN MID-AIR.
//
// Military › Companies embeds ideas.html?mode=designers&embed=1 in an iframe. The embed used to flatten that
// page's two-pane layout so everything flowed to its content height and the outer Military page was the only
// scroller. Measured in the running app on Millennium Dawn, before:
//
//     .ideas-layout   1400 x 1500
//     .ideas-main     1100 x 1500
//     .ideas-sidebar   300 x  423     <-- ends here, 1077px of nothing beneath it
//
// The sidebar is only as tall as its own content, so in a 1500px column it stopped partway down with empty
// space under it — "the sidebar does not have an end or a start, it's just cut off" — and because the page
// was the scroller, scrolling down to the editor carried the folders list off the screen entirely.
//
// This had been flipped four times (#companies-onepage → #companies-fit → #companies-embed → back), and the
// contradictory comments left behind are the record of it. The version that shipped was the one an earlier
// comment had already called "clunky. Reverted."
//
// It now keeps the standalone page's shape: the frame is bound to the space under the Military header, and
// the folders list and the editor each scroll inside their own panel. Measured after:
//
//     frame 618px, fits the viewport      outer page does not scroll
//     sidebar 300 x 612  == main 612      main scrolls internally (1500 > 612)
//     + 4000px of entries → the list scrolls internally; sidebar, frame and page all unmoved
//
// That last line matters: the first flow attempt died because expanding one MD companies file (286 entries)
// grew the sidebar to 13,328px. A bounded pane cannot do that.
//
// CONTROL: the standalone National Spirits page is untouched — every rule here is scoped to body.nova-embed.
// Verified live: isEmbed false, sidebar 738 == main 738, list scrolls, page does not.
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

const read = (f) => fs.readFileSync(path.join(__dirname, "public", f), "utf8");
const IDEAS = read("ideas.html");
const ARMYJS = read("army.js");
const ARMYHTML = read("army.html");

// The embed rules, comments stripped — a rule's own prose must not answer for it.
const embedRules = IDEAS.replace(/\/\*[\s\S]*?\*\//g, "")
  .split(/\r?\n/).filter((l) => /body\.nova-embed/.test(l)).join("\n");

console.log("\n[the embed keeps a bounded two-pane layout]");
{
  rec("there are embed rules to check", embedRules.length > 80, embedRules.length);
  rec("the embedded body does not scroll", /body\.nova-embed \{[^}]*overflow:\s*hidden/.test(embedRules), embedRules.slice(0, 200));
  // Height comes from flex, so neither side needs to know the other's dock height.
  rec("…and fills the frame", /body\.nova-embed \{[^}]*height:\s*100vh/.test(embedRules), embedRules.slice(0, 200));
  rec("the layout flexes into what is left", /\.ideas-layout \{[^}]*flex:\s*1 1 auto/.test(embedRules), embedRules);
  rec("…with min-height 0 so it can actually shrink", /\.ideas-layout \{[^}]*min-height:\s*0/.test(embedRules), embedRules);
}

console.log("\n[THE BUG] the flow overrides that cut the sidebar off must not come back");
{
  // Each of these three is what made a pane grow to its content instead of scrolling inside the frame.
  rec("the layout is not flowed", !/\.ideas-layout \{[^}]*overflow:\s*visible/.test(embedRules), embedRules);
  rec("the editor pane is not flowed", !/\.ideas-main \{[^}]*(height:\s*auto|overflow:\s*visible)/.test(embedRules), embedRules);
  // The folders list must keep the standalone `flex: 1; overflow-y: auto` — a fixed max-height with
  // flex: 0 0 auto is what left it 423px tall in a 1500px column.
  rec("the folders list is not pinned to a fixed height", !/\.ideas-list \{[^}]*max-height/.test(embedRules), embedRules);
  rec("…and is not stopped from flexing", !/\.ideas-list \{[^}]*flex:\s*0 0 auto/.test(embedRules), embedRules);
}

console.log("\n[the frame is bound to the viewport, not grown to its content]");
{
  const fn = /function sizeCompaniesFrame\(\)[\s\S]*?\n  \}/.exec(ARMYJS.replace(/\/\/[^\n]*/g, ""));
  rec("sizeCompaniesFrame is found", !!fn, "not found");
  if (fn) {
    rec("it measures the space left under the header", /window\.innerHeight - top/.test(fn[0]), fn[0].slice(0, 300));
    // Growing to content is the whole bug: it leaves the embed no height to divide between its panes.
    rec("…and does NOT size to the document's scrollHeight", !/scrollHeight/.test(fn[0]), fn[0].slice(0, 300));
  }
  rec("the page itself does not scroll while Companies is open", /body\.companies-fit \{[^}]*overflow:\s*hidden/.test(ARMYHTML.replace(/\/\*[\s\S]*?\*\//g, "")), "no fit rule");
}

console.log("\n[the machinery that only served the content-sized frame is gone]");
{
  const code = ARMYJS.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
  // Wheel forwarding faked page scrolling for the flowed embed. With real panes it is dead weight.
  rec("no wheel forwarding remains", !/wireCompaniesWheelToPage/.test(code), "still wired");
  rec("no orphaned wheel-delta helper remains", !/wheelDeltaToPixels/.test(code), "still present");
  // A ResizeObserver on the embed's body only makes sense when the frame follows the content.
  rec("the embed's body is no longer observed for size", !/ro\.observe\(doc\.body\)/.test(code), "still observed");
}

console.log("\n[CONTROL] the standalone National Spirits page is untouched");
{
  // Every rule above is scoped to body.nova-embed; the standalone layout must still be the fixed-viewport one.
  const plain = IDEAS.replace(/\/\*[\s\S]*?\*\//g, "");
  rec("the standalone layout still has a viewport height", /\.ideas-layout \{[^}]*height:\s*calc\(100vh/.test(plain), "standalone layout changed");
  rec("…and still hides its own overflow", /\.ideas-layout \{[^}]*overflow:\s*hidden/.test(plain), "standalone layout changed");
  rec("the standalone list still flexes and scrolls", /\.ideas-list \{[^}]*flex:\s*1[^}]*overflow-y:\s*auto/.test(plain.replace(/\n/g, " ")), "standalone list changed");
}

console.log(`\n=== companies embed two-pane: ${checks} checks, ${fails.length} failed ===`);
if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
