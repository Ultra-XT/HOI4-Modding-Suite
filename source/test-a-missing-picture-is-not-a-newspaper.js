// When an event's picture key does not resolve, the preview used to draw gfx/interface/event_news_bg.dds —
// the ENTIRE 528x595 newspaper — into the newspaper's own photo slot. It read as artwork, so a preview that
// should have said "this is broken" looked finished instead.
//
// HOI4 draws NOTHING for an undefined sprite. And this is the normal state while authoring: a modder writes
// `picture = GFX_news_event_bandung` before the art exists, or renames a key, and the preview is the only
// place that can tell them.
//
// The empty-key branch already modelled "no picture" correctly. The unresolved-key branch next to it did not
// — the same shape as the rest of this evening's fixes.
//
// Why it had to fall back to a PICTURE at all: this page implemented only half the project's image-fallback
// convention. `data-fallback` swaps the src, so the only expressible fallback was another image. The
// convention also has `data-fallback-html` and `data-hide-on-error` (CLAUDE.md §CSP, and country-setup.js
// implements all three) — a fallback must be able to say "this is not art".
"use strict";

const fs = require("fs");
const path = require("path");
const { stripJsComments } = require("./testlib-strip-comments.js");

const JS_RAW = fs.readFileSync(path.join(__dirname, "public", "events.js"), "utf8");
const JS = stripJsComments(JS_RAW);
const HTML = fs.readFileSync(path.join(__dirname, "public", "events.html"), "utf8");

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (detail == null ? "" : "   " + (typeof detail === "string" ? detail : JSON.stringify(detail))));
  if (!ok) fails.push(label);
};

const NEWSPAPER = "gfx/interface/event_news_bg.dds";

try {
  console.log("1. Nothing falls back to the newspaper as if it were a picture");
  // data-fallback="…event_news_bg.dds" is the exact shape that produced the bug: a broken picture becomes
  // the whole newspaper. Comments stripped, because this file's own prose names the path.
  const imgFallbacks = (JS.match(/data-fallback="[^"]*"/g) || []);
  rec("no data-fallback points at the newspaper background",
    !imgFallbacks.some((s) => s.includes(NEWSPAPER)), imgFallbacks);
  rec("…and the unresolved-key branch no longer sets it as the photo",
    !/setBoxPhoto\("\/api\/vanilla-ui\?rel=gfx\/interface\/event_news_bg\.dds"\)/.test(JS));

  console.log("\n2. It says what is wrong instead");
  rec("the unresolved-key branch shows a message", /No art found for this key/.test(JS));
  rec("…and clears the photo slot, like the empty-key branch", /No art found for this key[\s\S]{0,220}setBoxPhoto\(null\)/.test(JS));
  // CONTROL: the empty-key branch must still behave as it always did, or this "fix" broke its neighbour.
  rec("the empty-key branch is untouched", /innerHTML = "No Picture";[\s\S]{0,80}setBoxPhoto\(null\)/.test(JS));

  console.log("\n3. The page implements the WHOLE fallback convention, not a third of it");
  for (const [attr, prop] of [["data-fallback", "fallback"], ["data-fallback-html", "fallbackHtml"], ["data-hide-on-error", "hideOnError"]]) {
    rec(`the error listener honours ${attr}`, new RegExp("dataset\\." + prop).test(JS));
  }
  // CSP: this page is script-src 'self', so the listener must be addEventListener, never an inline handler.
  rec("…via addEventListener, not an inline handler", /addEventListener\("error"[\s\S]{0,600}?\}, true\)/.test(JS));
  // ⚠️ AN INLINE HANDLER IS AN HTML ATTRIBUTE, NOT ANY ASSIGNMENT WHOSE NAME STARTS WITH "on".
  //
  // This used to fail on `onerror\s*=` outright, which also matches `im.onerror = fn` — a DOM property
  // assignment in JavaScript, which CSP permits and which is exactly how the preload path reports a sprite
  // that failed to convert. What script-src blocks is the markup form, `onerror="…"`, so the `=` must be
  // followed by a quote. test-no-inline-event-handlers.js is the OWNER of this rule and already draws that
  // distinction (it explicitly skips `.on<name> =`); this is the local echo of it and had drifted cruder.
  const INLINE_ATTR = /\bon(?:error|load|click)\s*=\s*["'\\]/i;
  rec("…and no inline onerror was introduced", !INLINE_ATTR.test(JS));
  // CONTROL: the narrowed check must still catch the markup form it exists for.
  rec("…while still catching a real inline handler", INLINE_ATTR.test('<img src="x" onerror="boom()">'));
  rec("…and allowing the property assignment CSP permits", !INLINE_ATTR.test("im.onerror = () => fallback();"));

  console.log("\n4. The live preview image can fail visibly-but-honestly");
  const previewImg = (/<img id="previewEventImage"[^>]*>/.exec(HTML) || [])[0] || "";
  rec("the live preview <img> was found", !!previewImg, previewImg.slice(0, 80));
  rec("…and it carries a fallback of some kind",
    /data-hide-on-error|data-fallback/.test(previewImg),
    "an undecodable .dds would show the browser's broken-image glyph inside the newspaper");
  rec("…and it is not a fallback to another picture",
    !new RegExp("data-fallback=\"[^\"]*" + NEWSPAPER.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).test(previewImg));

  console.log("\n5. These checks would reject what shipped");
  // No bug left to back out, so compose the old markup and the old branch and confirm both fail.
  const OLD_IMG = `<img src="x" alt="Event Picture" data-fallback="/api/vanilla-ui?rel=${NEWSPAPER}" />`;
  rec("the old img markup would be caught", /data-fallback="[^"]*event_news_bg\.dds"/.test(OLD_IMG));
  const OLD_BRANCH = `setBoxPhoto("/api/vanilla-ui?rel=${NEWSPAPER}");`;
  rec("the old branch would be caught", /setBoxPhoto\("\/api\/vanilla-ui\?rel=gfx\/interface\/event_news_bg\.dds"\)/.test(OLD_BRANCH));
  rec("…and the shipped source is neither shape",
    !/data-fallback="[^"]*event_news_bg\.dds"/.test(JS) &&
    !/setBoxPhoto\("\/api\/vanilla-ui\?rel=gfx\/interface\/event_news_bg\.dds"\)/.test(JS));

  console.log("\n6. The newspaper is still allowed to be the NEWSPAPER");
  // Over-correction control. The background of the news skin legitimately IS this file; only the PHOTO SLOT
  // must never be it. If this fails, the fix went too far and removed the paper itself.
  rec("the news background is still referenced somewhere", JS_RAW.includes(NEWSPAPER) || HTML.includes(NEWSPAPER),
    "the skin needs its own paper");

  console.log(`\n=== a missing picture is not a newspaper: ${checks} checks, ${fails.length} failed ===`);
  if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
} catch (e) {
  console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
  process.exitCode = 1;
}
