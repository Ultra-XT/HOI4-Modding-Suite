// #companies-wheel-delta-mode — THE COMPANIES PAGE CRAWLED THREE PIXELS PER MOUSE NOTCH.
//
// Reported from play as "companies page scroll jank".
//
// The cause was a workaround for a workaround. The Companies sub-tab embeds the designers editor in a
// same-origin iframe, and a same-origin iframe will not chain a wheel up to the parent when its own document
// has nothing to scroll. #companies-onepage had flattened the embed so it had nothing to scroll — so it
// forwarded wheels to the page itself, passing e.deltaY straight to window.scrollBy.
//
// A wheel delta is not always in pixels. deltaMode says which unit it is: 0 = pixels, 1 = LINES, 2 = PAGES,
// and a classic mouse notch reports deltaMode 1 with deltaY 3. Measured in the browser at the time:
//
//     deltaMode 0, deltaY 100  ->  page moved 100px   (right)
//     deltaMode 1, deltaY 3    ->  page moved   3px   (should be ~48)
//     deltaMode 2, deltaY 1    ->  page moved   1px   (should be one viewport)
//
// Trackpads and Chrome report pixels, which is why it looked fine in some hands and broken in others.
//
// ── WHAT THIS TEST NOW GUARDS ─────────────────────────────────────────────────────────────────────────
//
// The unit conversion is gone, and so is the reason for it. #companies-embed-sidebar-cut-off restored the
// embed to a bounded two-pane layout: the folders list and the editor each scroll inside their own panel, so
// the iframe always has something to scroll and the browser handles the wheel natively — correctly, in every
// deltaMode, without Nova touching it.
//
// So this no longer pins a helper. It pins the ABSENCE of the thing that needed one. That is the stronger
// contract: a conversion function can be right or wrong, but a wheel Nova never intercepts cannot crawl.
//
// If someone flattens the embed again, the forwarding will come back, and with it this bug. That is what
// these checks are here to stop.
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
// Comments stripped: this file's own explanation names every symbol it asserts is gone.
const ARMY = read("army.js").replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
const IDEAS = read("ideas.html").replace(/\/\*[\s\S]*?\*\//g, "");

console.log("\n[Nova does not intercept the wheel over the embed]");
{
  rec("no wheel listener is installed on the embed's document", !/wheel/i.test(ARMY), "a wheel handler is back in army.js");
  rec("no wheel-forwarding helper remains", !/wireCompaniesWheelToPage/.test(ARMY), "forwarding is back");
  rec("no delta-unit conversion remains", !/wheelDeltaToPixels|deltaMode/.test(ARMY), "the conversion is back");
  // The forwarding called window.scrollBy from inside the frame's document — that is its fingerprint.
  rec("nothing scrolls the outer page on the embed's behalf", !/scrollBy/.test(ARMY), "scrollBy is back");
}

console.log("\n[because the embed has its own panes to scroll]");
{
  // This is WHY the interception is unnecessary. If these go, the wheel problem returns.
  const embed = IDEAS.split(/\r?\n/).filter((l) => /body\.nova-embed/.test(l)).join("\n");
  rec("the embedded body is bounded, not flowed", /body\.nova-embed \{[^}]*overflow:\s*hidden/.test(embed), embed.slice(0, 200));
  rec("the layout flexes inside the frame", /\.ideas-layout \{[^}]*flex:\s*1 1 auto/.test(embed), embed);
  // The editor pane keeps the standalone overflow-y:auto — that is the scroller the wheel lands on.
  rec("the editor pane is not flowed", !/\.ideas-main \{[^}]*overflow:\s*visible/.test(embed), embed);
  rec("the folders list is not pinned to a fixed height", !/\.ideas-list \{[^}]*max-height/.test(embed), embed);
}

console.log("\n[CONTROL] the frame is bound to the viewport, which is what gives the panes their height");
{
  const fn = /function sizeCompaniesFrame\(\)[\s\S]*?\n  \}/.exec(ARMY);
  rec("sizeCompaniesFrame is found", !!fn, "not found");
  if (fn) {
    rec("it sizes to the space under the header", /window\.innerHeight - top/.test(fn[0]), fn[0].slice(0, 240));
    rec("…and not to the embed's content height", !/scrollHeight/.test(fn[0]), fn[0].slice(0, 240));
  }
}

console.log(`\n=== companies wheel: ${checks} checks, ${fails.length} failed ===`);
if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
