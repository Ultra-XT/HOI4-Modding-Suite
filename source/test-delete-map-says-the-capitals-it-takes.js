// ⛔ #delete-map-says-the-capitals-it-takes — 🗑 DELETE MAP SAYS, IN ITS DIALOG AND IN ITS SAVE LINE, THAT IT TAKES THE CAPITAL LINE OUT OF THE
// MOD'S OWN COUNTRY FILES (tool campaign B5-5).
//
// blankMapToSea strips `capital = N` from every country file the mod owns in history/countries (410 of The Road to 56's own files on a
// drive): the states they name are deleted, and a capital naming a state that does not exist is fatal once the country owns land again.
// Neither the dialog ("deletes every state file your mod owns — the province shapes & strategic regions are kept") nor the Save line said
// so: the answer's strippedCapitals was read by no page code. 🌍 Generate a world's confirm says it next door. The page's own
// blankConfirmBody and blankWriteNotes are lifted and run on a model and on an answer. Binds no port.
// Run: node test-delete-map-says-the-capitals-it-takes.js
"use strict";
const T = require("./testlib-map-page.js");

let pass = 0, fail = 0;
const ok = (c, m, x) => {
  if (c) { pass++; console.log("  ok   " + m); }
  else { fail++; console.log("  FAIL " + m + (x !== undefined ? "\n       " + String(typeof x === "string" ? x : JSON.stringify(x)).slice(0, 700) : "")); }
};
const text = (h) => String(h).replace(/<[^>]+>/g, "");
const page = (model) => T.runPage(["function blankConfirmBody(", "function blankWriteNotes("], { model, modPath: () => "C:/mods/x" }).sb;

console.log("=== 1. the dialog ===");
{
  const sb = page({ states: [], capitals: { AAA: 1, BBB: 2, CCC: 3 }, capitalFromMod: { AAA: true, BBB: true, CCC: false } });
  const d = text(sb.blankConfirmBody("C:/mods/x/descriptor.mod"));
  ok(/takes the capital line out of your mod's own 2 country files in history\/countries/.test(d), "it names the mod's own country files it takes the capital line out of (2 of the 3 capitals are the mod's)", d.slice(0, 500));
  ok(/a copy of each file is kept first/.test(d), "…and that each is copied first", d.slice(0, 500));
}
{
  const sb = page({ states: [], capitals: { AAA: 1 }, capitalFromMod: { AAA: true } });
  const d = text(sb.blankConfirmBody(""));
  ok(/takes the capital line out of your mod's own 1 country file in history\/countries \(the states it names go/.test(d), "one file: said in the singular", d.slice(0, 400));
}
{
  const sb = page({ states: [], capitals: { AAA: 1 }, capitalFromMod: {} });
  const d = text(sb.blankConfirmBody(""));
  ok(!/takes the capital line out/.test(d), "a mod that owns no country file is told nothing of it", d.slice(0, 400));
}

console.log("=== 2. the Save line ===");
{
  const sb = page({ states: [], capitals: {} });
  const notes = sb.blankWriteNotes({ strippedCapitals: 410 });
  const n = notes.find((x) => x.key === "strippedCapitals");
  ok(!!n && /^🏛 Took the capital line out of 410 of your country files in history\/countries: the states they named are gone with the rest\./.test(n.text),
    "the Save line says how many country files lost their capital line, and why", notes);
  ok(!!n && /🌍 Generate land writes a capital for each country it settles, and 🏛 Set capital sets one by hand\./.test(n.text), "…and what gives them one again", n && n.text);
  const one = sb.blankWriteNotes({ strippedCapitals: 1 }).find((x) => x.key === "strippedCapitals");
  ok(!!one && /out of 1 of your country file in history\/countries: the state it named is gone/.test(one.text), "one: in the singular", one && one.text);
  ok(!sb.blankWriteNotes({ strippedCapitals: 0 }).some((x) => x.key === "strippedCapitals") && !sb.blankWriteNotes({}).some((x) => x.key === "strippedCapitals"),
    "none taken (or an answer from before): nothing said");
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
