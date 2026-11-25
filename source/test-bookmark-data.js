// Unit test: bookmark-data.js — read-only parser + lossless round-trip serializer for common/bookmarks/*.txt
// (a mod's scenario start-screen). Verifies serializeBookmarksFile(parseBookmarksFile(x)) === x byte-for-byte,
// and that the model is extracted correctly: bookmark name/desc/date/picture/default_country, the selectable
// "TAG" country blocks (quoted keys), and each country's ideology / ideas / focuses (SPACE-separated bare
// tokens — the case the generic PDX splitter mis-pairs, fixed here). Portable: embedded fixtures, not MD's path
// (MD's real files are round-tripped by scratch-bookmarks.js). Run: node test-bookmark-data.js
"use strict";
const assert = require("assert");
const bm = require("./bookmark-data.js");
let pass = 0;
const ok = (n, c, x) => { assert.ok(c, n + (x !== undefined ? " -> " + JSON.stringify(x) : "")); console.log("  ok  " + n); pass++; };

const FIX = [
  "# scenario setup",
  "bookmarks = {",
  "\tbookmark = {",
  '\t\tname = "MY_SCENARIO"',
  '\t\tdesc = "MY_SCENARIO_DESC"',
  "\t\tdate = 2000.1.1.12",
  '\t\tpicture = "GFX_select_date_2000"',
  '\t\tdefault_country = "USA"',
  "",
  "\t\t#United States",
  '\t\t"USA" = {',
  '\t\t\thistory = "USA_DESC"',
  "\t\t\tideology = democratic",
  "\t\t\tideas = {",
  "\t\t\t\tidea_one",
  "\t\t\t\tidea_two",
  "\t\t\t\tidea_three",
  "\t\t\t}",
  "\t\t\tfocuses = {",
  "\t\t\t\tfocus_a",
  "\t\t\t\tfocus_b",
  "\t\t\t}",
  "\t\t}",
  '\t\t"GER" = {',
  '\t\t\thistory = "GER_DESC"',
  "\t\t\tideology = fascism",
  "\t\t\tminor = yes",
  "\t\t\tideas = { x y }",
  "\t\t}",
  "\t\teffect = {",
  "\t\t\tset_global_flag = test",
  "\t\t}",
  "\t}",
  "}",
  "",
].join("\n");

(() => {
  console.log("=== bookmark-data: lossless round-trip + correct model ===");
  const m = bm.parseBookmarksFile(FIX);

  ok("round-trip is BYTE-IDENTICAL (gaps/comments/quoted keys preserved)", bm.serializeBookmarksFile(m) === FIX);

  ok("parses exactly 1 bookmark", m.bookmarks.length === 1, m.bookmarks.length);
  const b = m.bookmarks[0];
  ok("bookmark scalar fields", b.name === "MY_SCENARIO" && b.desc === "MY_SCENARIO_DESC" && b.date === "2000.1.1.12" && b.picture === "GFX_select_date_2000" && b.default_country === "USA", b);
  ok("parses 2 selectable countries (effect is NOT a country)", b.countries.length === 2 && b.countries.map((c) => c.tag).join(",") === "USA,GER", b.countries.map((c) => c.tag));

  const usa = b.countries.find((c) => c.tag === "USA");
  ok("USA history + ideology", usa.history === "USA_DESC" && usa.ideology === "democratic", usa);
  ok("USA ideas: all 3 bare tokens (no mis-pairing/drop)", usa.ideas.length === 3 && usa.ideas.join(",") === "idea_one,idea_two,idea_three", usa.ideas);
  ok("USA focuses: 2 tokens", usa.focuses.length === 2 && usa.focuses.join(",") === "focus_a,focus_b", usa.focuses);

  const ger = b.countries.find((c) => c.tag === "GER");
  ok("GER ideology + minor flag + inline idea list", ger.ideology === "fascism" && ger.minor === "yes" && ger.ideas.length === 2 && ger.ideas.join(",") === "x,y", ger);

  const s = bm.summarizeBookmarksFile(FIX);
  ok("summary: name/date/default_country/2 countries", s.length === 1 && s[0].name === "MY_SCENARIO" && s[0].default_country === "USA" && s[0].countries === 2, s);

  // edge cases — all round-trip exactly
  for (const [label, txt] of [
    ["empty file", ""],
    ["comment-only override (no bookmark)", "# to prevent collisions with vanilla\n"],
    ["no trailing newline", 'bookmarks = {\n\tbookmark = { name = "X" date = 2000.1.1 default_country = "USA" "USA" = { ideology = neutrality } }\n}'],
    ["blank/garbage", "\n\n#nothing\n"],
  ]) {
    ok("round-trips exactly: " + label, bm.serializeBookmarksFile(bm.parseBookmarksFile(txt)) === txt);
  }
  ok("comment-only file yields 0 bookmarks", bm.parseBookmarksFile("# to prevent collisions with vanilla\n").bookmarks.length === 0);
  ok("inline single-line bookmark parses its country", (() => { const p = bm.parseBookmarksFile('bookmarks = { bookmark = { name = "X" default_country = "USA" "USA" = { ideology = neutrality } } }'); return p.bookmarks[0].countries.length === 1 && p.bookmarks[0].countries[0].ideology === "neutrality"; })());

  console.log(`\ntest-bookmark-data: ${pass} checks passed`);
})();
