// The type hints are the surface that teaches a modder what each event window IS — Nova telling them what
// they will get. So a hint that names something the preview beside it cannot show is a small lie in the one
// place a beginner is most likely to trust.
//
// The operative hint said the window is "shown in the dark operative window with the agency insignia". The
// renderer drops that element, and — this is the part that decided the fix — it SHOULD.
// EventWindow_Operative's insignia is `GFX_intelligence_agency_logo_prc`, a per-country PLACEHOLDER that
// HOI4 replaces at runtime with the viewing country's own agency logo, and a 2-frame sprite whose
// `frame = 1` the client cannot honour. Drawing it verbatim would show China's emblem, doubled, to everyone.
//
// ⭐ So the fix is the HINT, not the renderer. The reported defect was "the renderer drops an element the
// hint promises"; the correct resolution was the opposite of what that implies. Widening the icon whitelist
// here would have shipped a confidently wrong picture.
//
// Contrast with the news window's `event_picture_overlay`, which fell out of the same whitelist and WAS
// drawn in an earlier commit: that one is a fixed decorative layer at a fixed coordinate with no runtime
// substitution, so drawing it is unambiguously right. Two elements, one whitelist, opposite answers.
"use strict";

const fs = require("fs");
const path = require("path");
const { stripJsComments } = require("./testlib-strip-comments.js");

const EVENTS = stripJsComments(fs.readFileSync(path.join(__dirname, "public", "events.js"), "utf8"));

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (detail == null ? "" : "   " + (typeof detail === "string" ? detail : JSON.stringify(detail))));
  if (!ok) fails.push(label);
};

try {
  console.log("1. The operative hint no longer promises what cannot be drawn");
  rec("no hint claims the insignia is shown", !/with the agency insignia/.test(EVENTS),
    "the renderer drops it, correctly — it is a per-country runtime sprite");
  rec("…and it explains WHY instead of going silent", /chosen per country at runtime/.test(EVENTS),
    "a hint that just omits it teaches nothing");
  // Both hint tables must agree — there are two, and an earlier finding in this campaign was that they had
  // drifted apart.
  // ⚠️ Match the HINT specifically. `operative_leader_event: "…"` also appears in a type-LABEL map and a
  // window-NAME map, so a bare key match finds 4 entries, not the 2 hints — which is what it did first run.
  // The hints are the long explanatory ones; the maps hold a short label or an identifier.
  // Matched by LENGTH, not by the emoji. `operative_leader_event: "…"` also appears in a type-LABEL map and
  // a window-NAME map, so a bare key match finds 4 entries rather than the 2 hints. Anchoring on the emoji
  // instead found 3 — it is a surrogate pair plus a variation selector, and the encodings are not identical
  // everywhere. The hints are simply the long explanatory strings; the maps hold a short label or an id.
  const hints = (EVENTS.match(/operative_leader_event: "[^"]{40,}"/g) || []);
  rec("both hint tables were found", hints.length === 2, hints.length);
  rec("…and they are identical", hints.length === 2 && hints[0] === hints[1],
    "two tables saying different things is how one of them goes stale");

  console.log("\n2. The renderer still does NOT draw it");
  // Guarding the non-fix. If someone later "fixes" the reported defect by widening the whitelist, this bites.
  rec("no branch draws agency_insignia", !/agency_insignia/.test(EVENTS),
    "drawing GFX_intelligence_agency_logo_prc verbatim shows one country's emblem to everyone");
  rec("…and the icon dispatch has not been widened to a catch-all",
    !/kind === "icon"\s*\)\s*\{/.test(EVENTS),
    "an unconditional icon branch would draw the insignia and anything else a mod adds");

  console.log("\n3. …while the news overlay, which IS safe to draw, still is");
  // The counterpart. Both fell out of the same whitelist; only this one may be drawn.
  rec("the picture overlay branch is still there", /picture_overlay\|pic_overlay/.test(EVENTS));
  rec("…and still paints the resolved sprite", /picture_overlay\|pic_overlay[\s\S]{0,2200}?addSpriteDeco\(e\.sprite/.test(EVENTS));

  console.log("\n4. The distinction is written down where the next person will look");
  // Line-break tolerant: the explanation is prose in a wrapped comment, so the two words are not adjacent.
  rec("the code explains why the overlay is drawn", /newsprint[\s\S]{0,40}grain/i.test(
    fs.readFileSync(path.join(__dirname, "public", "events.js"), "utf8")));
  rec("…and the hint explains why the insignia is not",
    /cannot show it/.test(fs.readFileSync(path.join(__dirname, "public", "events.js"), "utf8")));

  console.log("\n5. This would have rejected what shipped");
  const OLD = '🕵️ An intelligence / spy event — shown in the dark operative window with the agency insignia.';
  rec("the old hint would be caught", /with the agency insignia/.test(OLD));
  rec("…and the new one is not that shape", !/with the agency insignia/.test(EVENTS));

  console.log(`\n=== the type hints do not overpromise: ${checks} checks, ${fails.length} failed ===`);
  if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
} catch (e) {
  console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
  process.exitCode = 1;
}
