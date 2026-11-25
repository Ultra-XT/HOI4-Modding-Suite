// #province-list-promotes-a-disabled-id — MOVING A PROVINCE MADE EVERY COMMENTED-OUT ID IN THE LIST REAL.
//
// findBraceBlock locates `provinces = { … }` on a MASK, so a commented-out block is never mistaken for the
// real one — that was #state-writes-land-in-comments. The two functions that then read what it found scanned
// the RAW block with /\d+/g and re-emitted every number they saw on one line. So a disabled id became live,
// and the comment that disabled it was deleted. The block finder was fixed; the content scan beside it never
// adopted it.
//
// Measured over 6,123 real state files and 1,276 strategic regions:
//     3 state province lists  ->  25 ids would go live
//     4 strategic regions     -> 112 ids would go live
//
// What sits in those comments is exactly what must not be merged in. Road to 56's 107-Kosavo.txt keeps
//
//     #797 3609 3956 3984 6634 9599 11583 11586 #original
//
// — the province list as it was before the mod changed it. Merging it back puts provinces in two states at
// once, which is the crash class Nova's own map validator exists to catch. Old World Blues' 743-State.txt has
// prose: "#Provences after 208 were moved here in 3.2", whose digits read as provinces 208, 3 and 2.
//
// Both functions splice now: only live tokens count, and only the id being added or removed is touched.
"use strict";
const fs = require("fs");
const path = require("path");
const MD = require("./map-data.js");
const { stripJsComments } = require("./testlib-strip-comments.js");

const fails = [];
let checks = 0;
function rec(label, cond, detail) {
  checks++;
  if (cond) console.log("  ok   " + label);
  else {
    fails.push(label);
    console.log("  FAIL " + label + "  -> " + String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 400));
  }
}
const SRC = stripJsComments(fs.readFileSync(path.join(__dirname, "map-data.js"), "utf8"));

// What the READER sees — the same masking rule map-data.js uses.
function maskComments(t) {
  let out = "", inStr = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (inStr) { out += c; if (c === '"') inStr = false; continue; }
    if (c === '"') { inStr = true; out += c; continue; }
    if (c === "#") { while (i < t.length && t[i] !== "\n") { out += " "; i++; } out += "\n"; continue; }
    out += c;
  }
  return out;
}
const liveIds = (text) => {
  const m = /provinces\s*=\s*\{/.exec(maskComments(text));
  if (!m) return [];
  const scan = maskComments(text);
  const open = scan.indexOf("{", m.index);
  let depth = 0, close = -1;
  for (let i = open; i < scan.length; i++) { if (scan[i] === "{") depth++; else if (scan[i] === "}") { depth--; if (!depth) { close = i; break; } } }
  return ((scan.slice(open + 1, close).match(/\d+/g)) || []).map(Number);
};

console.log("\n[the scan runs on live tokens only]");
{
  rec("_liveListIdSpans exists", /function _liveListIdSpans\(body\)/.test(SRC), "the raw digit scan is back");
  rec("…and it masks first", /function _liveListIdSpans\(body\)[\s\S]{0,200}?maskComments\(body\)/.test(SRC), "");
  // ⭐ DERIVED: every writer that reads ids out of a `<key> = { … }` body must go through it. Naming one is how
  // another keeps the bug.
  // ⚠️ …not counting the function's OWN definition line, which contains the same text. That is what this
  // counted the first time: 3 where there are 2.
  // ⚠️ MOVED 2026-09-16: this said `users === 2`, a typed count — the anti-pattern this file's own note warns
  // about. A third writer joined for a real reason (#two-states-that-shared-an-id-keep-their-own-supply-area-place:
  // renumberStateId rewrites `states = { … }` in map/supplyareas and used to do it with a bare /\b<id>\b/g, which
  // rewrote ids inside comments too), and a typed count fails on the fix rather than on the bug. What matters is
  // that NO writer scans a list body raw, so that is what is asserted: every body-scanning writer names the masking
  // helper, and the count only has to keep growing from the two that started it.
  const users = (SRC.match(/(?<!function )_liveListIdSpans\(body\)/g) || []).length;
  rec("every list writer that scans a body uses it", users >= 2, users);
  // The invariant itself: no raw digit scan over a list body anywhere in map-data.js. Comments are masked first,
  // or the ids inside them go live — which is this whole file's subject.
  const RAW_BODY_SCAN = /body(?:\.slice\([^)]*\))?\.match\(\/\\d\+\/g\)/g;
  const rawScans = SRC.match(RAW_BODY_SCAN) || [];                       // SRC is already comment-stripped (line 38)
  rec("⭐ …and no writer scans a list body with a raw digit match", rawScans.length === 0, rawScans);
  // CONTROL: that detector sees the shape it is looking for, so "0 found" is not "it looked for nothing".
  rec("CONTROL: the raw-scan detector fires on the old shape",
    (stripJsComments("const ids = body.match(/\\d+/g) || [];").match(RAW_BODY_SCAN) || []).length === 1);
  rec("…and neither re-emits the whole list", !/\.match\(\/\\d\+\/g\) \|\| \[\]\)\.map\(Number\)\.filter/.test(SRC), "the old rebuild is still there");
}

console.log("\n[fixtures] a disabled id is not a province");
const STATE = [
  "state = {",
  "\tid = 1",
  '\tname = "STATE_1"',
  "\tprovinces = {",
  "\t\t100 101",
  "\t#\t102 103 #original",
  "\t}",
  "\thistory = {",
  "\t\towner = GER",
  "\t}",
  "}",
].join("\n");
{
  // ⭐ ASSERT THE FIXTURE HAS THE PROPERTY.
  rec("the fixture's live list really is just 100 101", JSON.stringify(liveIds(STATE)) === "[100,101]", liveIds(STATE));

  const added = MD.addProvinceToBlock(STATE, 200);
  rec("adding a province writes it", liveIds(added).includes(200), added);
  rec("⭐ …and does NOT promote the disabled ids", !liveIds(added).includes(102) && !liveIds(added).includes(103), liveIds(added));
  rec("⭐ …and keeps the comment", /#\t102 103 #original/.test(added), added);
  rec("…and leaves the live ids alone", liveIds(added).includes(100) && liveIds(added).includes(101), liveIds(added));
  rec("…and touches nothing outside the list", added.replace(/ 200/, "") === STATE, JSON.stringify(added));

  const removed = MD.removeProvinceFromBlock(STATE, 101);
  rec("removing a province takes it out", !liveIds(removed).includes(101), liveIds(removed));
  rec("…and keeps the other live one", liveIds(removed).includes(100), liveIds(removed));
  rec("⭐ …and still does not promote the disabled ids", !liveIds(removed).includes(102), liveIds(removed));
  rec("⭐ …and keeps the comment", /#\t102 103 #original/.test(removed), removed);

  // Removing an id that is ONLY present inside a comment must do nothing at all.
  const noop = MD.removeProvinceFromBlock(STATE, 103);
  rec("removing an id that is only in a comment changes nothing", noop === STATE, JSON.stringify(noop));
  // …and adding one that is only in a comment must actually add it, since it is not live.
  const readd = MD.addProvinceToBlock(STATE, 103);
  rec("adding an id that is only in a comment DOES add it", liveIds(readd).filter((x) => x === 103).length === 1, liveIds(readd));

  // A list with no live ids at all.
  const EMPTY = STATE.replace("\t\t100 101\n", "");
  rec("CONTROL: the empty-list fixture really has no live ids", liveIds(EMPTY).length === 0, liveIds(EMPTY));
  const intoEmpty = MD.addProvinceToBlock(EMPTY, 55);
  rec("…adding into it works", liveIds(intoEmpty).join() === "55", liveIds(intoEmpty));
  rec("…and its comment survives", /#\t102 103 #original/.test(intoEmpty), intoEmpty);

  // No block at all — the create path, unchanged.
  const NOBLOCK = 'state = {\n\tid = 2\n\tname = "STATE_2"\n}\n';
  rec("a state with no provinces block gets one", /provinces = \{ 7 \}/.test(MD.addProvinceToBlock(NOBLOCK, 7)), MD.addProvinceToBlock(NOBLOCK, 7));
}

console.log("\n[RUN IT] every real state file and strategic region");
{
  const ROOTS = [
    ["vanilla", "D:/SteamLibrary/steamapps/common/Hearts of Iron IV"],
    ["Millennium Dawn", "D:/SteamLibrary/steamapps/workshop/content/394360/2777392649"],
    ["Road to 56", "D:/SteamLibrary/steamapps/workshop/content/394360/820260968"],
    ["Old World Blues", "D:/SteamLibrary/steamapps/workshop/content/394360/2265420196"],
    ["Rise of Nations", "D:/SteamLibrary/steamapps/workshop/content/394360/2026448968"],
  ];
  // The scan as it USED to be — the built-in control.
  const oldAdd = (block, id) => {
    const m = /provinces\s*=\s*\{/.exec(maskComments(block));
    if (!m) return block;
    const scan = maskComments(block);
    const open = scan.indexOf("{", m.index);
    let depth = 0, close = -1;
    for (let i = open; i < scan.length; i++) { if (scan[i] === "{") depth++; else if (scan[i] === "}") { depth--; if (!depth) { close = i; break; } } }
    if (close < 0) return block;
    const ids = (block.slice(open + 1, close).match(/\d+/g) || []).map(Number);
    if (!ids.includes(id)) ids.push(id);
    return block.slice(0, open + 1) + " " + ids.join(" ") + " " + block.slice(close);
  };

  let files = 0, promotedNow = 0, promotedBefore = 0, commentsLostNow = 0, commentsLostBefore = 0, listsWithAComment = 0;
  const examples = [];
  const commentCount = (s) => (s.match(/#/g) || []).length;
  const consider = (text) => {
    files++;
    const before = liveIds(text);
    if (!before.length) return;
    const PROBE = 999999; // an id no corpus file contains
    const now = MD.addProvinceToBlock(text, PROBE);
    const old = oldAdd(text, PROBE);
    const wanted = before.concat([PROBE]).sort((a, b) => a - b).join();
    if (liveIds(now).sort((a, b) => a - b).join() !== wanted) {
      promotedNow++;
      if (examples.length < 6) examples.push("now: " + liveIds(now).filter((x) => !before.includes(x) && x !== PROBE).slice(0, 6).join(" "));
    }
    if (liveIds(old).sort((a, b) => a - b).join() !== wanted) promotedBefore++;
    if (commentCount(now) < commentCount(text)) commentsLostNow++;
    if (commentCount(old) < commentCount(text)) commentsLostBefore++;
    if (commentCount(text) > commentCount(maskComments(text).replace(/ /g, ""))) listsWithAComment++;
  };
  // A fixture so this measures something with no corpus installed.
  consider(STATE);
  for (const [, root] of ROOTS) {
    for (const sub of [["history", "states"], ["map", "strategicregions"]]) {
      const dir = path.join(root, ...sub);
      let names = []; try { names = fs.readdirSync(dir).filter((f) => f.endsWith(".txt")); } catch (_) { continue; }
      for (const nme of names) {
        let t; try { t = fs.readFileSync(path.join(dir, nme), "utf8"); } catch (_) { continue; }
        consider(t);
      }
    }
  }
  console.log(`     ${files} files · lists promoting a disabled id: now ${promotedNow}, before ${promotedBefore} · comments lost: now ${commentsLostNow}, before ${commentsLostBefore}`);
  rec("the corpus (or at least the fixture) was read", files >= 1, files);
  rec("RUN: ⭐ no disabled id is ever promoted", promotedNow === 0, { promotedNow, examples });
  rec("RUN: ⭐ no comment is ever deleted", commentsLostNow === 0, commentsLostNow);
  // ⭐ BUILT-IN CONTROLS: if the old scan lost nothing, this run measures nothing.
  rec("CONTROL: the old scan DID promote them", promotedBefore >= 1, promotedBefore);
  rec("CONTROL: …and DID delete comments", commentsLostBefore >= 1, commentsLostBefore);
}

console.log(`\n=== disabled province id stays disabled: ${checks} checks, ${fails.length} failed ===`);
if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
