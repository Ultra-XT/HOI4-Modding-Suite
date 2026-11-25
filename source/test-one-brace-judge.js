// ⛔ #one-brace-judge — A RAW BRACE COUNT IS WRONG IN BOTH DIRECTIONS.
//
// In Clausewitz a `#` runs to end of line, and a quoted string may legally contain `#`, a TAB and a brace.
// So `(text.match(/{/g)||[]).length === (text.match(/}/g)||[]).length` is not a balance test. Measured over
// the 33,091 `.txt` files under common/, events/ and history/ in the install and every installed mod:
//
//     raw count says UNBALANCED, file is fine    127   <- includes vanilla's common/decisions/SOV.txt
//                                                        (5,621 "{" vs 5,620 "}"), decisions/SWE.txt and
//                                                        common/buildings/00_buildings.txt
//     raw count says balanced, file is BROKEN      5   <- `} … {` counts one and one
//
// Mod Health's AI fix used exactly that count as its safety gate before writing a model's output into a
// modder's file. Both halves bit: a correct fix to any of those 127 was refused with "The AI's fix had
// unbalanced braces", blaming the model for something the file was already doing, and genuinely corrupt
// output landing in one of the other 5 would have been written as valid.
//
// `bracesAreBalanced` / `describeBraceImbalance` — comment- and string-aware, at module scope, used by every
// other write path in server.js — was three thousand lines away the whole time. This test pins that there is
// exactly one judge and that it is right about the real corpus.
//
// ⚠️ REFUTED, and recorded here so nobody re-finds it: the ideas maker's unbalanced-file DIAGNOSTIC looked
// like the same defect and is not. It stripped comments itself before counting, and is right about all 1,212
// idea files installed. It shares the judge now for the string case and for having one implementation, not
// because it was reporting anything wrong.
"use strict";

const fs = require("fs");
const path = require("path");
const { describeBraceImbalance } = require("./server.js");
const { stripJsComments } = require("./testlib-strip-comments.js");

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (detail == null ? "" : "   " + (typeof detail === "string" ? detail : JSON.stringify(detail))));
  if (!ok) fails.push(label);
};
const balanced = (t) => describeBraceImbalance(t) === null;
const rawEqual = (t) => (t.match(/{/g) || []).length === (t.match(/}/g) || []).length;

console.log("1. The two shapes a raw count gets wrong");
{
  rec("⭐ a brace inside a COMMENT does not count", balanced("a = {\n\t# note about } braces\n}\n"), "called it unbalanced");
  rec("⭐ a brace inside a QUOTED STRING does not count", balanced('a = { desc = "a } inside" }\n'), "called it unbalanced");
  rec("⭐ …and a `#` inside a quoted string does not open a comment",
    balanced('a = { desc = "tag #1" b = { c = 1 } }\n'), "called it unbalanced");
  rec("⭐ `} … {` is NOT balanced, whatever the counts say", !balanced("}\na = {\n"), "called it balanced");
  rec("CONTROL: the raw count disagrees on all four",
    rawEqual("a = {\n\t# note about } braces\n}\n") === false
    && rawEqual('a = { desc = "a } inside" }\n') === false
    && rawEqual("}\na = {\n") === true, "the raw count agreed — these fixtures no longer show the defect");
}

console.log("\n2. …and it still calls the real thing broken");
{
  const u1 = describeBraceImbalance("a = {\n\tb = {\n\t\tc = 1\n\t}\n");
  rec("a missing closing brace is reported", !!u1 && u1.kind === "missing" && u1.count === 1, JSON.stringify(u1));
  rec("…and points at the line the block opened on", !!u1 && u1.line === 1, JSON.stringify(u1));
  const u2 = describeBraceImbalance("a = {\n\tb = 1\n}\n}\n");
  rec("an extra closing brace is reported", !!u2 && u2.kind === "extra", JSON.stringify(u2));
  rec("…and points at its line", !!u2 && u2.line === 4, JSON.stringify(u2));
  rec("two missing braces are counted as two",
    (describeBraceImbalance("a = {\n\tb = {\n\t\tc = 1\n") || {}).count === 2,
    JSON.stringify(describeBraceImbalance("a = {\n\tb = {\n\t\tc = 1\n")));
  rec("CONTROL: a balanced file reports nothing", describeBraceImbalance("a = { b = 1 }\n") === null,
    JSON.stringify(describeBraceImbalance("a = { b = 1 }\n")));
}

console.log("\n3. Measured on every script file installed");
{
  const GAME = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
  const WS = "D:/SteamLibrary/steamapps/workshop/content/394360";
  const roots = [GAME];
  try { for (const d of fs.readdirSync(WS)) roots.push(path.join(WS, d)); } catch (_) { /* no workshop */ }
  let files = 0, wrongAlarm = 0, missed = 0;
  const egA = [], egM = [];
  const walk = (dir, depth) => {
    if (depth > 6) return;
    let ents = [];
    try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { return; }
    for (const e of ents) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) { walk(p, depth + 1); continue; }
      if (!/\.txt$/i.test(e.name)) continue;
      let t = "";
      try { if (fs.statSync(p).size > 4e6) continue; t = fs.readFileSync(p, "utf8"); } catch (_) { continue; }
      files++;
      const raw = rawEqual(t), real = balanced(t);
      if (!raw && real) { wrongAlarm++; if (egA.length < 3) egA.push(p.split(/[\\/]/).slice(-2).join("/")); }
      if (raw && !real) { missed++; if (egM.length < 3) egM.push(p.split(/[\\/]/).slice(-2).join("/")); }
    }
  };
  for (const r of roots) for (const s of ["common", "events", "history"]) walk(path.join(r, s), 0);

  if (files < 100) {
    rec("the game corpus is installed", false, `only ${files} script files found`);
  } else {
    rec("the corpus was scanned", files > 1000, `${files} script files`);
    // ⚠️ These two are CONTROLS on the fixture, not on the judge: they assert the corpus still contains the
    // shapes that make this test worth running. If a game patch cleaned them all up the numbers go to zero
    // and the stars below would pass on nothing.
    rec("CONTROL: files a raw count would call broken still exist", wrongAlarm > 0, `${wrongAlarm}: ${egA.join(" ")}`);
    rec("CONTROL: …and files it would wave through still exist", missed > 0, `${missed}: ${egM.join(" ")}`);
    console.log(`   (raw count would refuse ${wrongAlarm} good files and accept ${missed} broken ones)`);
  }
}

console.log("\n4. There is only ONE judge in the shipped source");
{
  // The point of the fix is that no gate rolls its own. A regex brace count inside a write path is the
  // shape that has to stay gone — and the prose above and below it says "match(/{/g)" too, so strip first.
  const src = stripJsComments(fs.readFileSync(path.join(__dirname, "server.js"), "utf8"));
  rec("CONTROL: comments were stripped", src.indexOf("A RAW BRACE COUNT IS WRONG") === -1, "prose survived");
  const gate = src.indexOf("The AI's fix had unbalanced braces");
  rec("the AI-fix gate is still there", gate > 0, `indexOf -> ${gate}`);
  const around = src.slice(Math.max(0, gate - 900), gate + 200);
  rec("⭐ …and no longer counts braces with a regex",
    !/match\(\/[{}]\/g\)/.test(around), (around.match(/match\(\/[{}]\/g\)/g) || []).join(" "));
  rec("⭐ …it asks the shared judge", /describeBraceImbalanceText\(/.test(around), around.slice(-260));
  const judges = (src.match(/function describeBraceImbalance\s*\(/g) || []).length;
  rec("there is exactly one implementation", judges === 1, `${judges} definitions`);
  rec("…and bracesAreBalanced delegates to it",
    /function bracesAreBalanced\s*\(text\)\s*\{\s*return describeBraceImbalance\(text\) === null;\s*\}/.test(src),
    "bracesAreBalanced has its own loop again");
}

console.log(`\n=== one brace judge: ${checks} checks, ${fails.length} failed ===`);
if (fails.length) {
  for (const f of fails) console.log("   FAILED: " + f);
  process.exitCode = 1;
}
