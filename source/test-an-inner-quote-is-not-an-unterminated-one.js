// ⛔ #odd-quotes-is-not-unterminated — A RULE THAT IS WRONG 85% OF THE TIME ON SHIPPING CONTENT.
//
// `loc_value_malformed` reported "an unterminated quote" for any line with an ODD number of unescaped
// quotes, reasoning that one must be missing. But HOI4 reads a localisation value from the FIRST quote to
// the LAST quote on the line, and this codebase already depends on that — locLineRegExp uses a greedy
// `".*"` precisely so it matches the unescaped inner quotes vanilla ships, which
// test-a-loc-comment-does-not-hide-the-line pins with a corpus measurement.
//
// Under the last-quote rule a third quote is ordinary literal text: an inch mark, or a quoted phrase inside
// a sentence. The shipping game is full of it —
//
//   GER_destroyer_2_desc: "The Zerstörer 1934 class … armed with five 5" guns and eight torpedo tubes.
//                          16 ships were built, out of which 12 were the improved Zerstörer 1934A subclass."
//
// — and that description displays correctly in game. If HOI4 stopped at the second quote it would be cut
// off mid-sentence in the base game.
//
// Measured over the installed mods before the change: 398 firings, of which **338 (85%) read fine**.
//   Millennium Dawn 19 -> 14 · Road to 56 34 -> 0 · Rise of Nations 283 -> 40
//   Old World Blues 11 -> 0  · Novum Vexillum 51 -> 6      total 398 -> 60
//
// ⚠️ Vanilla ships 22 lines of the same shape and they never showed, because the loc rules skip the base
// game — so the cry-wolf was invisible from inside the product. That is the same reason the whole Mod Health
// pass started by running the rules against vanilla directly.
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { buildModIndex } = require("./mod-index.js");

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (detail === undefined ? "" : "   " + (typeof detail === "string" ? detail.slice(0, 200) : JSON.stringify(detail).slice(0, 200))));
  if (!ok) fails.push(label);
};

const root = fs.mkdtempSync(path.join(os.tmpdir(), "nova-quoterule-"));
try {
  fs.mkdirSync(path.join(root, "localisation", "english"), { recursive: true });
  fs.writeFileSync(path.join(root, "descriptor.mod"), 'name="quote rule"\n', "utf8");

  fs.writeFileSync(path.join(root, "localisation", "english", "q_l_english.yml"),
    "\uFEFFl_english:\n"
    // MUST fire: one quote, nothing closes it.
    + ' really_unterminated:0 "no closing quote here\n'
    // MUST fire: the only closing candidate is ESCAPED, so it is part of the text. Millennium Dawn's shape.
    + ' closed_by_an_escape:0 "CBI-73M\\"\n'
    // MUST NOT fire: vanilla's own shape, verbatim in spirit — an inch mark inside the sentence.
    + ' inch_mark:0 "armed with five 5" guns and eight torpedo tubes."\n'
    // MUST NOT fire: a quoted phrase inside a sentence (Road to 56 ships this in several languages).
    + ' quoted_phrase:0 "you do not have the free DLC "Poland: United and Ready" enabled."\n'
    // MUST NOT fire: ordinary well-formed line.
    + ' plain_value:0 "Perfectly Ordinary"\n'
    // MUST NOT fire: escaped quotes inside a well-formed value.
    + ' escaped_pair:0 "He said \\"hello\\" loudly"\n'
    // MUST NOT fire: five quotes — two inner marks. Still reads to the last one.
    + ' two_inner_marks:0 "a 5" gun and a 3" gun"\n', "utf8");

  const idx = buildModIndex(root, {});
  const fired = new Set(idx.problems.filter((p) => p.rule === "loc_value_malformed").map((p) => p.entityId));

  console.log("\n-- what is genuinely broken still fires --");
  rec("an opening quote with nothing closing it", fired.has("really_unterminated"), [...fired]);
  rec("a closing candidate that is escaped does not close it", fired.has("closed_by_an_escape"), [...fired]);

  console.log("\n-- what HOI4 reads fine no longer does --");
  rec("an inch mark inside the sentence is not unterminated", !fired.has("inch_mark"), [...fired]);
  rec("a quoted phrase inside the sentence is not unterminated", !fired.has("quoted_phrase"), [...fired]);
  rec("two inner marks are not unterminated either", !fired.has("two_inner_marks"), [...fired]);

  console.log("\n-- the controls that were already true stay true --");
  rec("a plain value is quiet", !fired.has("plain_value"));
  rec("escaped quotes inside a value are quiet", !fired.has("escaped_pair"));
  rec("exactly two lines fire, no more", fired.size === 2, [...fired]);

  console.log("\n-- and the real vanilla line, if the install is here --");
  const V = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV/localisation/english/equip_naval_l_english.yml";
  if (fs.existsSync(V)) {
    const line = fs.readFileSync(V, "utf8").split(/\r?\n/).find((l) => /GER_destroyer_2_desc/.test(l)) || "";
    // Count unescaped quotes exactly as the rule does.
    const rest = (/^\s*[A-Za-z0-9_.\-]+:\d*(.*)$/.exec(line.replace(/^\uFEFF/, "")) || [])[1] || "";
    let q = 0;
    for (let c = 0; c < rest.length; c++) {
      if (rest[c] !== '"') continue;
      let s = 0;
      for (let j = c - 1; j >= 0 && rest[j] === "\\"; j--) s++;
      if (s % 2 === 0) q++;
    }
    rec("vanilla's destroyer description really does carry an odd quote count", q === 3, q);
    rec("…so the old rule would have called shipping content broken", q % 2 === 1 && q !== 1);
  } else {
    console.log("  --   (no install at the expected path; the fixture above still covers the shape)");
  }
} finally {
  try { fs.rmSync(root, { recursive: true, force: true }); } catch (_) { /* scratch only */ }
}

console.log("\n" + (fails.length ? "FAILED " + fails.length + "/" + checks : "PASSED " + checks + "/" + checks));
process.exitCode = fails.length ? 1 : 0;
