// ⭐ ONE OF ANYTHING A MAP RULE COUNTS READS AS ONE — in the "5,049 provinces and 7 naval buildings" line of the summary.
//
// A rule that counts itself carries `total` and `totalNoun`, the plural; map-rule-labels' scaleClause reads one of them by
// taking the "s" off the noun's END. That is right for "naval buildings" and wrong for every noun whose plural is not its last
// word: the posteffect rule counted "colour-grading boxes over ground your map changed", and one of them read "1 colour-grading
// boxes over ground your map changed" (review of 509c00a) — as did seven other rules shaped the same way ("1 places where land
// meets sea inside one region"). And taking an "s" off "boxes" gives "boxe". Now a rule whose plural is not its last word says
// its own singular (`totalNounOne`), and the -xes/-ches/-shes/-sses plurals lose "es".
//
// Every counted noun is DERIVED from the source that emits it, not typed here: a rule added tomorrow with a trailing phrase
// and no singular fails this test.
"use strict";
const fs = require("fs");
const path = require("path");
const L = require("./public/map-rule-labels.js");
const { stripJsComments } = require("./testlib-strip-comments.js");

let pass = 0;
const fails = [];
const rec = (name, cond, detail) => {
  if (cond) { console.log("  ok   " + name); pass++; }
  else { console.log("  FAIL " + name + (detail === undefined ? "" : "   → " + JSON.stringify(detail).slice(0, 600))); fails.push(name); }
};

console.log("\n-- the plural's ending --");
const one = (noun, extra = {}) => L.scaleClause([{ rule: "x", total: 1, totalNoun: noun, ...extra }]);
for (const [plural, want] of [["states", "1 state"], ["countries", "1 country"], ["naval buildings", "1 naval building"], ["boxes", "1 box"],
  ["batches", "1 batch"], ["brushes", "1 brush"], ["addresses", "1 address"], ["AI strategies", "1 AI strategy"]]) {
  rec(`one of "${plural}" reads "${want}"`, one(plural) === want, one(plural));
}
rec("two of them still read as the plural", L.scaleClause([{ rule: "x", total: 2, totalNoun: "boxes" }]) === "2 boxes");
rec("a rule's own singular is used for one", one("places where land meets sea inside one region", { totalNounOne: "place where land meets sea inside one region" }) === "1 place where land meets sea inside one region");
rec("…and never for more", L.scaleClause([{ rule: "x", total: 3, totalNoun: "places where land meets sea", totalNounOne: "place where land meets sea" }]) === "3 places where land meets sea");

console.log("\n-- ⭐⭐ every noun a rule counts, read off the source that emits it --");
const files = [...fs.readdirSync(__dirname).filter((f) => /\.js$/.test(f) && !/^(test|e2e|testlib|run)-/.test(f)),
  ...fs.readdirSync(path.join(__dirname, "public")).filter((f) => /\.js$/.test(f)).map((f) => path.join("public", f))];
const found = [];
for (const f of files) {
  const src = stripJsComments(fs.readFileSync(path.join(__dirname, f), "utf8"));
  for (const m of src.matchAll(/totalNoun:\s*"([^"]+)"(?:,\s*totalNounOne:\s*"([^"]+)")?/g)) found.push({ file: f, noun: m[1], one: m[2] || "" });
}
rec(`the source counts in ${found.length} nouns (at least 20, or this reads nothing)`, found.length >= 20, found.length);
// The plural a count is OF is the word before the first joining word ("states" in "missing states in AI strategy lists",
// "places" in "places where land meets sea"), or the last word when there is none. The fallback only ever changes the LAST
// word, so a noun whose plural sits before a joining word needs its own singular — checking only that the fallback changed
// something let "1 missing states in AI strategy list" through (review of f63f1e7).
const JOIN = new Set(["in", "of", "on", "at", "to", "that", "where", "which", "with", "from", "for", "by", "under", "over", "across", "between", "than", "who", "whose", "the", "a", "an", "your", "its", "their", "no", "not"]);
const headOf = (noun) => { const w = noun.split(/\s+/); const j = w.findIndex((x, i) => i > 0 && JOIN.has(x.toLowerCase())); return j > 0 ? { word: w[j - 1], last: false } : { word: w[w.length - 1], last: true }; };
rec("the head finder reads the three shapes", headOf("missing states in AI strategy lists").word === "states" && headOf("places where land meets sea").word === "places" && headOf("naval buildings").last === true);
const wrong = found.filter((x) => {
  const said = one(x.noun, x.one ? { totalNounOne: x.one } : {});
  // one of them must read differently from many of them, and not as "boxe"
  if (said === `1 ${x.noun}` || /\bboxe\b/.test(said)) return true;
  // …and a plural that is not the last word is made singular by the rule's own singular, never by the fallback
  const h = headOf(x.noun);
  return !h.last && /s$/.test(h.word) && !x.one;
}).map((x) => `${x.file}: 1 ${x.one || x.noun}`);
rec("⭐⭐ one of every noun a rule counts reads as one", !wrong.length, wrong);
// CONTROL: the shape the reviewer found is caught — the AI-strategy noun with its singular taken away
const ai = found.find((x) => /AI strategy/.test(x.noun));
rec("CONTROL: that check catches a plural before a joining word with no singular of its own", !!ai && !headOf(ai.noun).last && /s$/.test(headOf(ai.noun).word), ai);
rec("⭐ …the colour-grading boxes among them", one("colour-grading boxes over ground your map changed", { totalNounOne: (found.find((x) => /colour-grading/.test(x.noun)) || {}).one })
  === "1 colour-grading box over ground your map changed", found.find((x) => /colour-grading/.test(x.noun)));

console.log(`\n${pass} passed, ${fails.length} failed`);
if (fails.length) { console.log("FAILED: " + fails.join(" | ")); process.exit(1); }
