// ⛔ #auto-fix-says-it-took-a-region-move-back — 🔧 AUTO-FIX SAYS IT TOOK BACK A PROVINCE MOVED INTO ANOTHER STRATEGIC REGION ON ITS OWN, AND
// THE QUESTION NAMES THE BUTTON THE MAP PAGE HAS (tool campaign B3-4; the owner's Q5: an Auto-fix that undoes a modder's edit SAYS so).
//
// The region dropdown asks "Keep the state together?" when one province of a state moves to another region. Answer "Move only this
// province", save: the state is split across two regions (HOI4 will not load such a map), and 🔧 Auto-fix all aligns it into the region
// most of it is in — the one the province came FROM. The summary said only "aligned 1 region-split state", and the question named "Fix
// region overlaps", a Mod Health button the map page does not have. regionRepairNote is lifted and run on the repair's own answer shape
// (repairRegionOverlaps: statesAligned, alignedDetail [{ state, target, from }]); the question is read (comments masked). Binds no port.
// Run: node test-auto-fix-says-it-took-a-region-move-back.js
"use strict";
const vm = require("vm");
const T = require("./testlib-map-page.js");

let pass = 0, fail = 0;
const ok = (c, m, x) => {
  if (c) { pass++; console.log("  ok   " + m); }
  else { fail++; console.log("  FAIL " + m + (x !== undefined ? "\n       " + String(typeof x === "string" ? x : JSON.stringify(x)).slice(0, 700) : "")); }
};

console.log("=== 1. the Auto-fix summary names the state, the region it went into, and that the move was taken back ===");
const sb = {};
vm.createContext(sb);
vm.runInContext(T.lift("function regionRepairNote(") + "\nglobalThis.__f = regionRepairNote;", sb);
{
  const r = sb.__f({ ok: true, statesAligned: 1, alignedDetail: [{ state: 1029, target: 187, from: [187, 1] }], errors: [] });
  const s = r.parts.join(" · ");
  ok(/^aligned 1 region-split state: state 1029 into region 187 \(out of region 1\)/.test(s), "it names the state, the region it went into and the one it came out of", s);
  ok(/a province left in another region than the rest of its state \(the answer “Move only this province”, or “Keep it in region …” when it changed state\) goes into its state's region: that answer is taken back/.test(s),
    "…says the take-back, of either question's answer (Q5)", s);
  ok(/To keep a province in a region, its whole state has to be in that region \(“Move all”\)/.test(s), "…and what keeps a province in a region", s);
  ok(r.tail === "", "…all in the part, nothing in the tail", r.tail);
}
{
  const many = Array.from({ length: 7 }, (_, i) => ({ state: 10 + i, target: 3, from: [3, 4] }));
  const s = sb.__f({ ok: true, statesAligned: 7, alignedDetail: many }).parts.join(" · ");
  ok(/aligned 7 region-split states: state 10 into region 3 \(out of region 4\), .*state 14 into region 3 \(out of region 4\), and 2 more — /.test(s), "seven: five named, the rest counted", s);
}
{
  const s = sb.__f({ ok: true, statesAligned: 2 }).parts.join(" · ");
  ok(/^aligned 2 region-split states — each into the region most of its provinces are in, so a province left .* goes into its state's region: that answer is taken back/.test(s),
    "an answer with no detail still says the take-back", s);
}

console.log("=== 1b. ↔ Move province's region question says what the dropdown's says (B2-14) ===");
{
  const move = T.lift("function doMoveProvince(");
  const moveM = T.MASKED.slice(T.MASKED.indexOf("\n  function doMoveProvince("), T.MASKED.indexOf("\n  function doMoveProvince(") + move.length);
  ok(/Moving it across on its own leaves the state split across two strategic regions — no shipping map does that: HOI4 will not load the map, so 💾 Save stops for it, and 🔧 Auto-fix all in ⚠ Map Errors repairs it by moving the province into region \$\{regionTo\} after all\./.test(moveM),
    "“Keep it in region N”: HOI4 will not load the split, Save stops, and Auto-fix moves the province into the state's region after all");
  ok(/in no strategic region at all: HOI4 will not load the map, so 💾 Save stops for it, and 🔧 Auto-fix all in ⚠ Map Errors puts it into region \$\{regionTo\}\./.test(moveM),
    "“Leave it with no region”: the same, for a province in no region");
  ok(!/Nova's map check reports it|which Nova's map check reports/.test(moveM), "…and neither says only that Nova's map check reports it");
}

console.log("=== 2. the region question names what the map page has, and what HOI4 does ===");
{
  const at = T.MASKED.indexOf("Moving just this one leaves the state split across two strategic regions");
  ok(at > 0, "the region question is found");
  const q = T.MASKED.slice(at, T.MASKED.indexOf("Move the WHOLE state", at));
  ok(!/Fix region overlaps/.test(q), "it no longer names “Fix region overlaps” (Mod Health's button, not this page's)", q);
  ok(/HOI4 will not load the map, so 💾 Save stops for it, and 🔧 Auto-fix all in ⚠ Map Errors repairs it by putting this province back/.test(q),
    "it says HOI4 will not load such a map, Save stops, and 🔧 Auto-fix all in ⚠ Map Errors puts the province back", q);
  ok(!/Fix region overlaps/.test(T.MASKED), "no string the map page shows names “Fix region overlaps”");
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
