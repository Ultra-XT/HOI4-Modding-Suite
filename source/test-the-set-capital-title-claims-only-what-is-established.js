// ⛔ #the-set-capital-title-claims-only-what-is-established (final round, L4) — THE 🏛 SET CAPITAL BUTTON SAYS WHAT A CAPITAL IS FOR, AND NO CRASH.
//
// Its title said "A valid capital prevents the dangling-capital crash." That crash was Map Errors' reason for capital_state_missing from
// 09-23 to 2026-11-03, read off hoi4.exe 1.19.3 as "checked one country, dereferenced the other"; re-read on 1.19.4 it never held, and the
// claim came out of both messages, the fix hint and the notes (test-a-missing-capital-stops-save-only-for-a-country-with-land.js). The
// button kept it. What is established, and what the other text says:
//   * a capital naming a state the map does not have: CCountry::SetCapital refuses it ("…, it is not a valid state!") and writes nothing;
//     the map still loads (FIX_HINTS.capital_state_missing); Save stops for it only in a country that owns land (isFatalRule:
//     capital_state_missing is FATAL, capital_state_missing_no_land is not), its outcome "untested" (FATAL_OUTCOME);
//   * a capital in another country's state: the country does not start on the capital its history names (capital_state_owned_by_other's
//     message, a warning that stops no Save).
// So the title says those, and the code comments that repeated the crash say them too. Binds no port.
"use strict";
const fs = require("fs");
const path = require("path");
const { maskJsComments } = require("./testlib-strip-comments.js");
const ML = require("./public/map-rule-labels.js");

let checks = 0; const fails = [];
const ok = (c, m, d) => { checks++; if (c) console.log("  ok   " + m); else { fails.push(m); console.log("  FAIL " + m + (d !== undefined ? "   -> " + JSON.stringify(d).slice(0, 600) : "")); } };
const read = (...p) => fs.readFileSync(path.join(__dirname, ...p), "utf8");
const HTML = read("public", "map.html");
const m = /<button id="mapModeCapital"[^>]*\stitle="([^"]*)"/.exec(HTML);
const title = m ? m[1] : "";

console.log("\n-- what the rules say (derived) --");
ok(ML.isFatalRule("capital_state_missing") === true && ML.isFatalRule("capital_state_missing_no_land") === false && ML.isFatalRule("capital_state_owned_by_other") === false,
  "THE CONTROL: a missing capital stops Save only for a country with land; one in another's state stops none");
ok(ML.fatalOutcome("capital_state_missing") === "untested", "THE CONTROL: …and what the game then does with a missing capital is untested (no crash on record)", ML.fatalOutcome("capital_state_missing"));
ok(/HOI4 refuses that capital and the map still loads/.test(ML.mapRuleFixHint("capital_state_missing")), "THE CONTROL: the hint says HOI4 refuses it and the map still loads");
const MD = maskJsComments(read("map-data.js"));
ok(/so the country does not start with the capital its history names/.test(MD), "THE CONTROL: capital_state_owned_by_other's message says the country does not start on it");

console.log("\n-- the 🏛 Set capital title --");
ok(!!title, "THE CONTROL: map.html has the 🏛 Set capital button and its title");
ok(!/crash/i.test(title), "⭐⭐⭐ it claims no crash", title);
ok(/HOI4 refuses a capital naming a state the map does not have/.test(title), "⭐⭐ it says HOI4 refuses a capital naming a state the map does not have", title);
ok(/Save stops for a country with land left so/.test(title) && (title.match(/Save stops/g) || []).length === 1, "⭐⭐ …that Save stops for that only in a country with land (and for nothing else)", title);
ok(/a country whose capital is another country's state does not start on it/.test(title), "⭐ …and that a capital in another's state is not the one the country starts on", title);
ok(/Map Errors lists both/.test(title), "…and where both are listed", title);

console.log("\n-- the comments that repeated the crash (comments are content: read as written) --");
for (const f of [["map-data.js"], ["server.js"], ["public", "map-rule-labels.js"], ["public", "map.html"]]) {
  const t = read(...f);
  const hits = (t.match(/[^\n]*(dangling-capital (crash|state)|dangling capital \(its state is gone\) crashes|foreign\/dangling capital crashes|prevents the dangling)[^\n]*/gi) || []).map((s) => s.trim().slice(0, 160));
  ok(hits.length === 0, `⭐ ${f.join("/")} says no dangling-capital crash`, hits);
}

console.log(`\n=== the set capital title claims only what is established: ${checks - fails.length}/${checks} ===`);
fails.forEach((f) => console.log("   FAILED: " + f));
process.exit(fails.length || checks < 14 ? 1 : 0);
