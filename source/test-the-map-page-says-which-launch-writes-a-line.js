// ⛔ #the-map-page-says-which-launch-writes-a-line — WHEN THE MAP PAGE TELLS A MODDER WHAT HOI4 WRITES TO error.log, IT SAYS WHICH LAUNCH.
//
// B6-25 (tool campaign, CONFIRMED, medium), the page's half: Map Errors' rows and the 🔧 Auto-fix line said 'HOI4 logs "Trying to set
// province building in state that doesn't own it"', 'HOI4 logs a coastal province with none as one that "will likely crash the game"',
// 'which HOI4 logs as "Map invalid X crossing"'… The 1.19.4.1 byte-read (engine-1194 combine, "Text a swap leaves half-true") found
// every MAP_ERROR, the unit reader's lines, mapbuildings' port line and the strait line on the log flag word 0x10004, whose one file
// entry exists only behind the debug byte -debug and -crash_data_log set, so a normal launch writes none of them; G1's re-read of the
// installed exe (test-a-map-message-says-which-launch-writes-the-line.js, map-data.js's half) found "Trying to set invalid state
// building", "they dont own it!" and the over-full state's line there too. The owner's playtests read error.log, and these words sent
// the reader looking for lines that are not there. The advice was right; the claim of WHICH launch writes the line was not.
//
// A line a normal launch DOES write stays said plainly: the strategic location HOI4 cannot apply on open sea ("Building: … did not
// exist or is invalid in the province", five of the twelve lines of the owner's 2026-09-16 launch, started without -debug).
//
// 1. RUN: the page's own Auto-fix summary (testlib-map-page.js autoFixSummary, the code the 🔧 click runs) on an answer carrying one
//    step at a time, so each line read is that step's clause alone.
// 2. SOURCE, comments masked: every place public/map.js or public/map-rule-labels.js quotes one of the -debug lines below (or any
//    "MAP_ERROR" line) names -debug before the quote, in the same sentence, and never puts "logs" right before it. Each entry must
//    still be quoted by the page or by map-data.js, so one that outlives its last quote fails here instead of guarding nothing.
"use strict";
const fs = require("fs");
const path = require("path");
const T = require("./testlib-map-page.js");
const { maskJsComments } = require("./testlib-strip-comments.js");
const labels = require("./public/map-rule-labels.js");

let checks = 0;
const fails = [];
function rec(name, pass, detail) {
  checks++;
  console.log(`${pass ? "PASS" : "FAIL"} ${name}`);
  if (!pass) { fails.push(name); if (detail !== undefined) console.log("   ", typeof detail === "string" ? detail.slice(0, 1500) : JSON.stringify(detail).slice(0, 1500)); }
}
// the repro's own three (repro-B6-25.js), and the bare claim in front of any quote
const REPRO_DEBUG_ONLY = [/logs "no provinces in state"/, /logs "MAP_ERROR:/, /logs "Trying to set province building in state that doesn't own it"/];
const LOGS_BEFORE_A_QUOTE = /\blogs(?: as)?\s*["“]/;

// ── 1. the 🔧 line, one step at a time ──
const say = (fixes) => { try { return T.autoFixSummary({ ok: true, fixes }); } catch (e) { return "(the summary did not run: " + e.message + ")"; } };
const CLAUSES = [
  { name: "X-crossings", fixes: { xCrossings: { fixed: 2 } }, debug: true, words: /Map invalid X crossing/ },
  { name: "a port for a newly-coastal province", fixes: { coastalNoPort: { added: 3 } }, debug: true, words: /will likely crash the game/ },
  { name: "the coastal flags of definition.csv", fixes: { coastalFlags: { changed: 4 } }, debug: true, words: /disagreement/ },
  { name: "a state a carry over-filled", fixes: { navalNoCoast: { carried: [{ from: 7, to: 8, keptCoast: false, levels: [{ level: 1, key: "dockyard" }], overSlots: { shared: 9, slots: 6, category: "rural" } }] } }, debug: true, words: /notes such a state in error\.log/ },
  { name: "naval buildings left with no coast", fixes: { navalNoCoast: { left: [{ stateId: 5, province: null, why: "no coastal state of the same country" }] } }, debug: true, words: /Trying to set invalid state building/ },
  { name: "a province building in a state that does not hold it", fixes: { orphanBuildings: { removed: 2 } }, debug: true, words: /Trying to set province building in state that doesn't own it/ },
  { name: "THE CONTROL — a strategic location on open sea (a line a normal launch writes)", fixes: { seaLeftovers: { slRemoved: 1 } }, debug: false, words: /HOI4 logs the building as invalid/ },
];
for (const c of CLAUSES) {
  const line = say(c.fixes);
  const hits = REPRO_DEBUG_ONLY.filter((re) => re.test(line)).map(String);
  if (c.debug) {
    rec(`⭐⭐ 🔧 ${c.name}: the clause says only a launch started with -debug writes its line, and claims no plain "logs"`, c.words.test(line) && /only a launch started with -debug/.test(line) && !LOGS_BEFORE_A_QUOTE.test(line) && !/HOI4 logs/.test(line) && hits.length === 0, { line: line.slice(0, 700), hits });
  } else {
    rec(`${c.name}: still said plainly, with no -debug`, c.words.test(line) && !/-debug/.test(line), line.slice(0, 700));
  }
}

// ── 2. every quote of a -debug line in the page's source ──
// The lines (byte-read on 1.19.4.1, re-read by G1's guard on the installed 1.19.5.0): the quote's own words, as the page quotes them.
const DEBUG_ONLY = [
  "Map invalid X crossing",
  "will likely crash",
  "Trying to set province building in state that doesn't own it",
  "Trying to set invalid state building",
  "they dont own it!",
  "no air base site defined for state",
  "no provinces in state",
];
const SOURCES = ["public/map.js", "public/map-rule-labels.js"].map((f) => ({ f, s: maskJsComments(fs.readFileSync(path.join(__dirname, f), "utf8").replace(/\r\n/g, "\n")) }));
const DATA = maskJsComments(fs.readFileSync(path.join(__dirname, "map-data.js"), "utf8"));
const quotes = [];
for (const { f, s } of SOURCES) {
  // Anchored on each listed line (and on "MAP_ERROR"), not on pairing quote marks: a template's own "it" : "them" pairs would
  // put every later quote out of step. The quote is the nearest opening mark before the words, with no other mark between.
  for (const d of DEBUG_ONLY.concat(["MAP_ERROR"])) {
    for (let at = s.indexOf(d); at !== -1; at = s.indexOf(d, at + d.length)) {
      const lineStart = s.lastIndexOf("\n", at) + 1;
      const head = s.slice(lineStart, at);
      const q = Math.max(head.lastIndexOf('"'), head.lastIndexOf("“"));
      if (q === -1 || at - (lineStart + q) > 90) continue; // not quoted: a word of the page's own sentence, or code
      const before = head.slice(0, q);
      // the sentence the quote stands in, up to the quote: from the last ". " / "! " / "? " (or the line's start)
      const cut = Math.max(before.lastIndexOf(". "), before.lastIndexOf("! "), before.lastIndexOf("? "));
      const sentence = cut === -1 ? before : before.slice(cut + 2);
      quotes.push({ where: `${f}:${s.slice(0, at).split("\n").length}`, quote: s.slice(lineStart + q + 1, at + d.length), sentence, bare: /\blogs(?: as)?\s*$/.test(before) });
    }
  }
}
rec("THE CONTROL: the page quotes -debug lines at all (the 🔧 summary and the fix hints)", quotes.length >= 5, quotes.map((q) => q.where));
const unsaid = quotes.filter((q) => !/-debug/.test(q.sentence) || q.bare);
rec("⭐⭐ every quote of a line only a -debug launch writes names -debug before it, and none follows a bare \"logs\"", unsaid.length === 0, unsaid.map((q) => `${q.where}: …${q.sentence.slice(-160)}"${q.quote.slice(0, 60)}"`));
const stale = DEBUG_ONLY.filter((d) => !SOURCES.some(({ s }) => s.includes(d)) && !DATA.includes(d));
rec("⚠️ …and every line listed above is still quoted by the page or by map-data.js (a stale entry guards nothing)", stale.length === 0, stale);

// ── 3. the fix hints Map Errors shows under a row, as the page loads them ──
{
  const hints = Object.entries(labels.FIX_HINTS || {});
  rec("THE CONTROL: map-rule-labels.js gives its fix hints", hints.length > 20, hints.length);
  const bad = hints.filter(([, t]) => REPRO_DEBUG_ONLY.some((re) => re.test(String(t))) || DEBUG_ONLY.some((d) => new RegExp("\\blogs(?: as)?\\s*[\"“]" + d.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).test(String(t))));
  rec("⭐ no fix hint says HOI4 logs a line only a -debug launch writes", bad.length === 0, bad.map(([k, t]) => `${k}: ${String(t).slice(0, 240)}`));
  const air = String((labels.FIX_HINTS || {}).state_no_air_base_or_rocket_site || "");
  rec("⭐ the air-base hint says which launch writes \"no air base site defined for state\"", /only a launch started with -debug writes “no air base site defined for state”/.test(air), air.slice(0, 600));
}

console.log(`\n${checks - fails.length}/${checks} checks passed`);
if (fails.length) { console.log("FAILED:\n  " + fails.join("\n  ")); process.exit(1); }
console.log("All green");
