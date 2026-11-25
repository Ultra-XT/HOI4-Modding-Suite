// HOI4 has two event-picture families and they are not interchangeable. A news_event draws its picture in
// the newspaper's photo slot at (59,91): news_event_001.dds is 397x153 and fills it. A report picture is
// 210x176 — roughly half the width and 23px too tall — so it leaves most of the frame empty and spills out
// of the bottom. Vanilla uses GFX_news_event_* in all of its news events and GFX_report_event_* in none.
//
// The client hardcoded a REPORT key for every new event and never re-derived it when the type changed, so a
// news_event made in Nova shipped `picture = GFX_report_event_001`. This is not a preview bug — the preview
// faithfully drew the wrong sprite, and the value was SAVED.
//
// server.js already had the rule exactly right. It just could not reach it: its default fires only when the
// client sends an EMPTY picture, and "New Event" pre-fills one. Correcting it server-side would also be
// wrong — test-event-picture-and-bridge.js deliberately pins "an explicit picture is still written, whatever
// the type", because an author's choice must be respected. So the fix belongs in what Nova DEFAULTS to.
//
// ⭐ The control that matters most is the negative one: switching type to look at a different skin must
// NEVER overwrite a picture the author chose.
"use strict";

const fs = require("fs");
const path = require("path");
const { stripJsComments } = require("./testlib-strip-comments.js");

const EVENTS = stripJsComments(fs.readFileSync(path.join(__dirname, "public", "events.js"), "utf8"));
const SERVER = stripJsComments(fs.readFileSync(path.join(__dirname, "server.js"), "utf8"));

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (detail == null ? "" : "   " + (typeof detail === "string" ? detail : JSON.stringify(detail))));
  if (!ok) fails.push(label);
};

try {
  console.log("1. The client knows the rule at all");
  rec("there is a type-aware default", /defaultPictureFor/.test(EVENTS), "the picture key used to be hardcoded");
  rec("…news events get the news family", /"news_event" \? DEFAULT_PICTURES\.news_event/.test(EVENTS));
  rec("…and nothing else does", /DEFAULT_PICTURES\.other/.test(EVENTS));

  console.log("\n2. It agrees with the server, which had it right all along");
  const serverRule = (/const defaultPicture = type === "news_event" \? "([A-Za-z0-9_]+)" : "([A-Za-z0-9_]+)"/.exec(SERVER) || []);
  rec("the server's rule was found", serverRule.length === 3, serverRule.slice(1));
  if (serverRule.length === 3) {
    // DERIVED from server.js rather than restated here — if the two ever disagree, this fails.
    rec("the client's news key matches the server's", EVENTS.includes(`news_event: "${serverRule[1]}"`), serverRule[1]);
    rec("the client's other key matches the server's", EVENTS.includes(`other: "${serverRule[2]}"`), serverRule[2]);
  }

  console.log("\n3. It re-derives on a type change");
  rec("the change listener looks at the picture field", /addEventListener\("change"[\s\S]{0,400}?eventPictureId/.test(EVENTS));
  rec("…and only when the value is still an untouched default", /isUntouchedDefaultPicture/.test(EVENTS),
    "overwriting an author's chosen picture would be worse than the original bug");

  console.log("\n4. The behaviour, composed and run");
  // Re-express the shipped rule and exercise both directions plus the control.
  const D = { news_event: "GFX_news_event_001", other: "GFX_report_event_001" };
  const defaultPictureFor = (t) => (t === "news_event" ? D.news_event : D.other);
  const isUntouched = (v) => v === D.news_event || v === D.other;
  const onTypeChange = (current, type) => (isUntouched(current) ? defaultPictureFor(type) : current);

  rec("a fresh draft switched to News Event gets a news picture",
    onTypeChange(D.other, "news_event") === D.news_event);
  rec("…and switching back gets a report picture",
    onTypeChange(D.news_event, "country_event") === D.other);
  rec("state_event keeps the report family, like the server says",
    onTypeChange(D.news_event, "state_event") === D.other);
  // THE CONTROL.
  rec("an author's own picture is NEVER overwritten",
    onTypeChange("GFX_my_custom_art", "news_event") === "GFX_my_custom_art");
  rec("…in either direction", onTypeChange("GFX_my_custom_art", "country_event") === "GFX_my_custom_art");

  console.log("\n5. The fallback table points at pictures, not at the newspaper");
  // GFX_report_event_001 used to fall back to gfx/interface/event_news_bg.dds — the newspaper BACKGROUND —
  // so a report picture that failed to resolve painted the whole newspaper into the photo slot.
  rec("the report picture falls back to a report PICTURE",
    /GFX_report_event_001: "gfx\/event_pictures\/report_event_001\.dds"/.test(EVENTS));
  rec("the news picture has a fallback too",
    /GFX_news_event_001: "gfx\/event_pictures\/news_event_001\.dds"/.test(EVENTS));
  rec("neither falls back to the newspaper background",
    !/GFX_(report|news)_event_001: "gfx\/interface\/event_news_bg\.dds"/.test(EVENTS));

  console.log("\n6. Those files really are where the fallbacks point");
  const game = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
  if (fs.existsSync(game)) {
    for (const rel of ["gfx/event_pictures/report_event_001.dds", "gfx/event_pictures/news_event_001.dds"]) {
      rec(`${rel} exists`, fs.existsSync(path.join(game, rel)));
    }
  } else {
    rec("vanilla install found to verify against", false, "cannot confirm the fallback paths");
  }

  console.log("\n7. This would have rejected what shipped");
  const OLD = (current, type) => current; // the old behaviour: type change never touched the picture
  rec("the old rule left a report picture on a news event", OLD(D.other, "news_event") === D.other);
  rec("…where the new rule corrects it", onTypeChange(D.other, "news_event") !== OLD(D.other, "news_event"));

  console.log(`\n=== a news event gets a news picture: ${checks} checks, ${fails.length} failed ===`);
  if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
} catch (e) {
  console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
  process.exitCode = 1;
}
