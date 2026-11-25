// ⛔ #duplicate-id-counted-once-per-copy — ONE DEFECT IS ONE ROW.
//
// Mod Health's duplicate_id rule pushed a problem for every COPY of a duplicated id, and every one of those
// rows carried a byte-identical message, because the message already named all the locations. So a panel
// whose job is to report duplicates displayed literal duplicates, and — worse — the repeats were counted
// into the ERROR TOTAL that drives the health score.
//
// Measured over the installed corpus (rows -> real duplicated ids):
//
//     Rise of Nations   7020 -> 3507   (2.00x)   total errors 7574 -> 4061
//     Millennium Dawn    234 ->  117   (2.00x)   total errors  439 ->  322
//     The Road to 56      58 ->   25   (2.32x)
//     Old World Blues      7 ->    3   (2.33x)
//     Novum Vexillum      14 ->    3   (4.67x)   one id defined five times
//     (vanilla)            2 ->    1   (2.00x)   `n_lynch`, twice in common/characters/PRU.txt
//
// ⚠️ THE OLD BEHAVIOUR WAS PINNED BY A TEST — `test-mod-index.js` asserted `length === 2` with the label
// "duplicate focus IDs flagged on both definitions", so the two had to move together. That is the fifth time
// on this project a test has encoded the behaviour a fix needed to change; it is data, not an obstacle.
//
// What must stay true: nothing is LOST by collapsing the rows. Every file is still named, and the row says
// how many definitions there are — so a modder can still find all of them from one entry.
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { buildModIndex } = require("./mod-index.js");

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (detail == null ? "" : "   " + (typeof detail === "string" ? detail : JSON.stringify(detail))));
  if (!ok) fails.push(label);
};

const root = fs.mkdtempSync(path.join(os.tmpdir(), "nova-dupid-"));
const write = (rel, body) => {
  const p = path.join(root, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, body, "utf8");
};

try {
  fs.writeFileSync(path.join(root, "descriptor.mod"), 'name="dupid test"\n', "utf8");

  // (a) the SAME file, twice over — vanilla's `n_lynch` shape
  write(path.join("common", "national_focus", "same_file.txt"), [
    "focus_tree = { id = t1 country = { factor = 1 }",
    "  focus = { id = twice_here  x = 1 y = 1 cost = 1 icon = GFX_a }",
    "  focus = { id = twice_here  x = 2 y = 1 cost = 1 icon = GFX_a }",
    "}",
  ].join("\n"));

  // (b) TWO files — Rise of Nations' shape, a live tree and a copy parked in another file
  write(path.join("common", "national_focus", "live.txt"),
    "focus = { id = in_two_files  x = 1 y = 1 cost = 1 icon = GFX_a }\n");
  write(path.join("common", "national_focus", "copy.txt"),
    "focus = { id = in_two_files  x = 1 y = 1 cost = 1 icon = GFX_a }\n");

  // (c) FIVE copies — Novum Vexillum's 4.67x shape, to prove the count is the copy count, not a constant
  write(path.join("common", "national_focus", "five.txt"),
    Array.from({ length: 5 }, (_, i) => `focus = { id = five_times  x = ${i} y = 9 cost = 1 icon = GFX_a }`).join("\n") + "\n");

  // (d) a CONTROL that must NOT fire: two ids that merely share a prefix
  write(path.join("common", "national_focus", "distinct.txt"), [
    "focus = { id = not_a_dup      x = 1 y = 5 cost = 1 icon = GFX_a }",
    "focus = { id = not_a_dup_two  x = 2 y = 5 cost = 1 icon = GFX_a }",
  ].join("\n"));

  const idx = buildModIndex(root, {});
  const dups = idx.problems.filter((p) => p.rule === "duplicate_id");
  const of = (id) => dups.filter((p) => p.entityId === id);

  console.log("\n-- one row per duplicated id --");
  rec("two definitions in one file give ONE row", of("twice_here").length === 1, of("twice_here").length);
  rec("two definitions in two files give ONE row", of("in_two_files").length === 1, of("in_two_files").length);
  rec("five definitions give ONE row", of("five_times").length === 1, of("five_times").length);

  console.log("\n-- nothing is lost: the row still carries every location and the copy count --");
  const two = of("in_two_files")[0];
  rec("the cross-file row names BOTH files", !!two && two.files && two.files.length === 2, two && two.files);
  rec("the cross-file message names both files",
    !!two && two.files.every((f) => two.message.includes(f)), two && two.message);
  rec("the row reports how many copies", !!two && two.copies === 2, two && two.copies);
  const five = of("five_times")[0];
  rec("five copies are reported as five", !!five && five.copies === 5, five && five.copies);
  rec("the message says five, not two", !!five && /defined 5 times/.test(five.message), five && five.message);
  rec("a single-file duplicate does NOT claim multiple files",
    !!of("twice_here")[0] && !/across/.test(of("twice_here")[0].message), of("twice_here")[0] && of("twice_here")[0].message);

  console.log("\n-- severity and the negative control --");
  rec("still an error", dups.every((p) => p.severity === "error"));
  rec("distinct ids sharing a prefix are NOT duplicates", of("not_a_dup").length === 0 && of("not_a_dup_two").length === 0);
  rec("every row anchors a file the UI can show", dups.every((p) => !!p.file));

  // The whole point: the number of rows equals the number of real defects.
  rec("three duplicated ids produce exactly three rows", dups.length === 3, dups.map((p) => p.entityId));
} finally {
  try { fs.rmSync(root, { recursive: true, force: true }); } catch (_) { /* scratch dir only */ }
}

console.log("\n" + (fails.length ? "FAILED " + fails.length + "/" + checks : "PASSED " + checks + "/" + checks));
process.exitCode = fails.length ? 1 : 0;
