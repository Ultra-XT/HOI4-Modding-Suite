// #loc-display-strip — one canonical way to render a localisation value as readable text.
//
// A HOI4 localisation value is frequently not plain text. Measured over vanilla's 122,583 english values:
//   13.8% carry a [scope token]      [ROOT.GetNameDefCap], [121.owner.GetName], [GetDateText]
//    9.9% carry a $KEY$ reference    $FIN_motion_of_no_confidence_against_leader$, $RIGHT|0Y$
//    8.5% carry a §colour code       §YGolden§!
//    8.5% START with one of those    — the "(root.something) name" the user reported seeing
//    1.0% carry a £sprite icon       £pol_power
//    0.8% carry a [?variable|%Y0] print
//
// FIVE makers had each grown their own near-copy of the strip and they disagreed:
//   * the copy Decisions used handled neither £sprite codes nor the double space a removal leaves;
//   * NOT ONE of the five stripped $KEY$ references or the [?var|%fmt] print form, so a name could still
//     display as "$FIN_motion…$ decision cost" or ": More than [?ICE.communism_support_needed|%Y0] support";
//   * stripping a leading token exposed the punctuation behind it, leaving names beginning with ":" or ",".
//
// This pins the canonical behaviour, and — the part that matters most — that it is DISPLAY ONLY: the value
// handed back for editing and saving is never the stripped one.
"use strict";
const fs = require("fs"), path = require("path"), vm = require("vm");

let pass = 0, total = 0;
const ok = (n, c, x) => { total++; if (c) { pass++; console.log("  ok  " + n); } else console.error("  FAIL " + n + (x !== undefined ? " -> " + JSON.stringify(x) : "")); };

// Load the canonical helper the way a page does: loading-overlay.js runs first and defines it on window.
const src = fs.readFileSync(path.join(__dirname, "public", "loading-overlay.js"), "utf8");
const win = {};
const sandbox = {
  window: win, document: undefined, setTimeout, clearTimeout, setInterval, clearInterval,
  console, fetch: undefined, location: { pathname: "/decisions.html" }, navigator: { userAgent: "node" },
};
sandbox.globalThis = sandbox;
try { vm.createContext(sandbox); vm.runInContext(src, sandbox, { timeout: 5000 }); } catch (_e) { /* DOM bits may throw; the helper is defined first */ }
const strip = win.novaStripLocCodes;
const hasDynamic = win.novaLocHasDynamicCodes;
ok("loading-overlay.js exposes window.novaStripLocCodes", typeof strip === "function");
ok("…and window.novaLocHasDynamicCodes", typeof hasDynamic === "function");
if (typeof strip !== "function") { console.error("cannot continue"); process.exit(1); }

// ── the shapes real content uses ──────────────────────────────────────────────────────────────────────
ok("plain text is untouched", strip("Reform Act") === "Reform Act");
ok("a colour code is removed", strip("§YGolden§! Plan") === "Golden Plan", strip("§YGolden§! Plan"));
ok("a leading scope token is removed", strip("[ROOT.GetNameDefCap] Reform Act") === "Reform Act", strip("[ROOT.GetNameDefCap] Reform Act"));
ok("a numeric state scope is removed", strip("[121.owner.GetName] rises") === "rises", strip("[121.owner.GetName] rises"));
ok("a £sprite icon is removed", strip("Costs £pol_power 50") === "Costs 50", strip("Costs £pol_power 50"));
ok("a $KEY$ reference is removed", strip("$FIN_motion_against_leader$ decision cost") === "decision cost", strip("$FIN_motion_against_leader$ decision cost"));
ok("a $KEY|fmt$ reference is removed", strip("cost: $RIGHT|0Y$.") === "cost: .", strip("cost: $RIGHT|0Y$."));
ok("a [?variable|%fmt] print is removed", strip("More than [?ICE.communism_support_needed|%Y0] support") === "More than support", strip("More than [?ICE.communism_support_needed|%Y0] support"));
ok("two adjacent tokens don't merge into one match",
  strip("[ROOT.GetName] and [FROM.GetName] agree") === "and agree", strip("[ROOT.GetName] and [FROM.GetName] agree"));
ok("the punctuation a leading token exposed is dropped",
  strip("§Y[121.owner.GetName]§!: More than 50% support") === "More than 50% support",
  strip("§Y[121.owner.GetName]§!: More than 50% support"));
ok("an apostrophe is NOT treated as stray punctuation (it's the author's word)",
  strip("[ROOT.GetName]'s Five Year Plan") === "'s Five Year Plan", strip("[ROOT.GetName]'s Five Year Plan"));
ok("a value made only of tokens strips to empty", strip("§Y[ROOT.GetName]§!") === "", JSON.stringify(strip("§Y[ROOT.GetName]§!")));
ok("non-strings pass through", strip(null) === null && strip(undefined) === undefined && strip(7) === 7);
ok("a literal % is kept", strip("50% support") === "50% support");
ok("an unmatched bracket is left alone rather than eating the rest",
  strip("Plan [unclosed") === "Plan [unclosed", strip("Plan [unclosed"));

// ── the "does it need explaining" test ────────────────────────────────────────────────────────────────
ok("plain text needs no hint", hasDynamic("Reform Act") === false);
ok("a token needs a hint", hasDynamic("[ROOT.GetName] Act") === true);
ok("a $ref needs a hint", hasDynamic("$KEY$ Act") === true);
ok("a colour code needs a hint", hasDynamic("§YAct§!") === true);
ok("a £icon needs a hint", hasDynamic("£pol_power") === true);

// ── every maker delegates to the ONE implementation ───────────────────────────────────────────────────
const clientFile = (f) => fs.readFileSync(path.join(__dirname, "public", f), "utf8");
for (const f of ["decisions.js", "events.js", "characters.js", "app.js"]) {
  ok(f + " delegates to window.novaStripLocCodes", /window\.novaStripLocCodes/.test(clientFile(f)), f);
}
ok("ideas.js delegates too", /window\.novaStripLocCodes/.test(clientFile("ideas.js")));
// …and no maker still carries its own full regex chain (that is what drifted apart in the first place)
for (const f of ["decisions.js", "events.js", "characters.js", "app.js", "ideas.js"]) {
  const t = clientFile(f);
  const privateChain = /replace\(\/§\[A-Za-z0-9!\]\/g, ""\)[\s\S]{0,200}?replace\(\/£/.test(t);
  ok(f + " no longer has its own private strip chain", !privateChain, f);
}

// ── DISPLAY ONLY: the editable value must stay raw ────────────────────────────────────────────────────
// The name box is populated with unescapeLocForEdit(raw), never with the stripped text. If that ever changed,
// saving an untouched decision/event/idea would write the stripped name over the author's token.
const rawIntoBox = [
  ["decisions.js", /nameInput\.value = unescapeLocForEdit\(/],
  ["events.js", /getElementById\("eventTitle"\)\.value = unescapeLocForEdit\(/],
  ["ideas.js", /getElementById\("ideaName"\)\.value = unescapeLocForEdit\(/],
];
for (const [f, re] of rawIntoBox) {
  ok(f + " puts the RAW value in the name box, not the stripped one", re.test(clientFile(f)), f);
}
for (const [f] of rawIntoBox) {
  const t = clientFile(f);
  const strippedIntoBox = /(nameInput|eventTitle"\)|ideaName"\))\.value\s*=\s*strip/i.test(t);
  ok(f + " never assigns a STRIPPED value into an input", !strippedIntoBox, f);
}

// ── the real corpus: nothing readable should survive as junk ───────────────────────────────────────────
const CORPORA = {
  vanilla: "D:/SteamLibrary/steamapps/common/Hearts of Iron IV/localisation/english",
  MD: "D:/SteamLibrary/steamapps/workshop/content/394360/2777392649/localisation/english",
};
let corpusChecked = 0, junkLeft = 0;
const junkExamples = [];
for (const [, dir] of Object.entries(CORPORA)) {
  if (!fs.existsSync(dir)) continue;
  const files = fs.readdirSync(dir).filter((f) => /_l_english\.yml$/i.test(f)).slice(0, 40);
  for (const f of files) {
    let txt = "";
    try { txt = fs.readFileSync(path.join(dir, f), "utf8"); } catch (_) { continue; }
    // Escape-aware, and tolerant of a trailing `# comment` after the closing quote — vanilla writes both
    // (CAREER_PROFILE_TOOLTIP_PICTURE_LOCKED ends with `" # The black . prevent the newlines…`). A
    // `"([\s\S]*?)"\s*$` pattern skipped past the real closing quote there and swallowed following lines.
    for (const m of txt.matchAll(/^[ \t]*([A-Za-z0-9_.:-]+):\d*[ \t]*"((?:[^"\\\n]|\\.)*)"/gm)) {
      const v = m[2];
      if (!v) continue;
      corpusChecked++;
      const out = strip(v);
      // After stripping, no game-code marker may remain. A lone "[" with no closing bracket is left
      // deliberately (see the test above), so only count BALANCED leftovers.
      if (/§|£|\[[^\]\n]*\]|\$[^$\n]*\$/.test(out)) {
        junkLeft++;
        if (junkExamples.length < 5) junkExamples.push({ key: m[1], raw: v.slice(0, 80), out: out.slice(0, 80) });
      }
    }
  }
}
console.log("\n  corpus values run through the strip: " + corpusChecked);
ok("no game code survives on any real value", junkLeft === 0, junkExamples);

console.log("\ntest-loc-display-strip: " + pass + "/" + total + " checks passed");
process.exitCode = pass === total && total >= 35 ? 0 : 1;
