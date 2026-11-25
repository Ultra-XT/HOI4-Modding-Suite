// The event preview is the one surface whose entire job is to show what the PLAYER will see. So the worst
// thing it can do is show something better than reality.
//
// It used to substitute invented prose whenever the title or description box was empty:
//
//     const titleVal = ...value.trim() || "The Fall of the Government";
//     const descVal  = ...value.trim() || "A long description of the event...";
//
// unconditionally. HOI4 draws the RAW LOCALISATION KEY when a key has no text — a newspaper whose headline
// literally reads "mynamespace.1.t". So an event that is visibly broken in game previewed as a finished
// newspaper, and nothing else on the page tells the author their loc keys never landed.
//
// The correct distinction is LOADED vs DRAFT, and the picture logic in the same function already drew it: a
// loaded, genuinely pictureless event previews with no picture, while a fresh draft keeps its placeholder.
// That reasoning simply was never carried across to the text — the dominant bug shape on this project.
//
// ⚠️ Comments stripped first: the prose above and in the fix both quote the invented strings.
"use strict";

const fs = require("fs");
const path = require("path");
const { stripJsComments } = require("./testlib-strip-comments.js");

const EVENTS = path.join(__dirname, "public", "events.js");
const RAW = fs.readFileSync(EVENTS, "utf8");
const SRC = stripJsComments(RAW);

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (detail == null ? "" : "   " + (typeof detail === "string" ? detail : JSON.stringify(detail))));
  if (!ok) fails.push(label);
};

// The exact strings the preview may invent. Derived from the source rather than typed in, so a renamed
// placeholder is still policed.
const INVENTED = (SRC.match(/"(The Fall of the Government|A long description of the event\.\.\.)"/g) || [])
  .map((s) => s.slice(1, -1));

try {
  console.log("1. The placeholders still exist, but are no longer unconditional");
  rec("the invented strings were found in the source", INVENTED.length >= 2, INVENTED);
  // The old shape: `|| "The Fall of the Government";` with nothing between. If that returns, so does the bug.
  rec("the title fallback is not a bare `|| \"...\"`",
    !/value\.trim\(\)\s*\|\|\s*"The Fall of the Government"/.test(SRC),
    "an empty title would invent a headline for a real event");
  rec("the description fallback is not a bare `|| \"...\"`",
    !/value\.trim\(\)\s*\|\|\s*"A long description of the event/.test(SRC));

  console.log("\n2. Both go through the loaded-vs-draft gate");
  rec("the gate exists", /previewsRealEvent/.test(SRC));
  rec("…and it is built from the LOADED event, not just the form",
    /previewsRealEvent\s*=\s*!!loadedEventFullId/.test(SRC),
    "a form-only check would call a fresh draft a real event");
  rec("…and requires a resolvable key as well", /previewsRealEvent\s*=\s*!!loadedEventFullId\s*&&\s*!!locBase/.test(SRC));
  rec("the title uses it", /previewsRealEvent \? locBase \+ "\.t"/.test(SRC));
  rec("the description uses it", /previewsRealEvent \? locBase \+ "\.d"/.test(SRC));

  console.log("\n3. The key it shows is the one HOI4 would show");
  // `<namespace>.<id>.t` / `.d` is Nova's own convention, and server.js is the authority on it.
  const server = stripJsComments(fs.readFileSync(path.join(__dirname, "server.js"), "utf8"));
  rec("server.js agrees `.t` / `.d` is the convention",
    /\$\{base\}\.t|\$\{base\}\.d|\.t`|`\$\{[a-zA-Z]+\}\.t/.test(server) || /followsConvention/.test(server));
  rec("the preview builds the base from namespace and id",
    /locBase = evNs && evId \? evNs \+ "\." \+ evId : ""/.test(SRC));

  console.log("\n4. Behaviour, composed — the rule applied to real inputs");
  // Re-express the shipped expression and check both branches, so this is not purely a source grep.
  const titleFor = (typed, loadedId, ns, id) => {
    const locBase = ns && id ? ns + "." + id : "";
    const previewsRealEvent = !!loadedId && !!locBase;
    return (typed || "").trim() || (previewsRealEvent ? locBase + ".t" : "The Fall of the Government");
  };
  rec("a fresh draft still gets the friendly placeholder",
    titleFor("", null, "custom_events", "1") === "The Fall of the Government");
  rec("a LOADED event with no title shows the raw key the player would see",
    titleFor("", "custom_events.1", "custom_events", "1") === "custom_events.1.t");
  rec("a real title is never replaced",
    titleFor("Oil Discovered", "custom_events.1", "custom_events", "1") === "Oil Discovered");
  // Over-correction control: a loaded event whose namespace/id are not yet known must not invent a key
  // like ".t" — it falls back to the placeholder rather than showing a nonsense one.
  rec("a loaded event with no resolvable key does NOT invent a bare key",
    titleFor("", "custom_events.1", "", "") === "The Fall of the Government");

  console.log("\n5. This would have rejected what shipped");
  const OLD = (typed) => (typed || "").trim() || "The Fall of the Government";
  rec("the old rule invented a headline for a loaded, unlocalised event",
    OLD("") === "The Fall of the Government");
  rec("…where the new rule shows the key",
    titleFor("", "custom_events.1", "custom_events", "1") !== OLD(""));

  console.log("\n6. Comment-stripping is load-bearing here too");
  rec("the raw file quotes the invented strings in prose", /The Fall of the Government/.test(RAW));
  rec("…and the checks above ran against the stripped source", SRC.length < RAW.length, `${SRC.length} < ${RAW.length}`);

  console.log(`\n=== the newspaper preview does not invent text: ${checks} checks, ${fails.length} failed ===`);
  if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
} catch (e) {
  console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
  process.exitCode = 1;
}
