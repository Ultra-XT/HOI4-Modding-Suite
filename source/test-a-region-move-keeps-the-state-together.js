// Changing a province's strategic region must not split its state without asking.
// #a-region-move-splits-the-state-in-silence
//
// A strategic region holds WHOLE STATES. Moving one province out of a multi-province state leaves that
// state straddling two regions, and Nova's own validator reports it (state_split_strategic_regions). The
// dropdown staged that with no word at all.
//
// Two measurements make it matter, both derived below from the installed corpus:
//
//   · it is close to unavoidable — 85.8%-92.2% of states have more than one province, so nearly every
//     single-province move splits one;
//   · and NO shipping map has a single split state. Vanilla 0, and 0 in every installed workshop mod, out
//     of 1,143-1,524 states each. So this is not a rule Nova invented; it is a shape nobody ships.
//
// Worse, the repair Nova offers ("Fix region overlaps") aligns a split state to the region holding the
// PLURALITY of its provinces — one province after this move, that is the one it came FROM. The modder's
// edit is reversed by the fix offered to them.
"use strict";
const fs = require("fs");
const path = require("path");
const md = require("./map-data.js");
const { maskJsComments } = require("./testlib-strip-comments.js");

let pass = 0;
const fails = [];
const ok = (cond, label, detail) => {
  if (cond === true) { pass++; console.log("  ok   " + label); }
  else { fails.push(label); console.log("  FAIL " + label + (detail !== undefined ? "   -> " + JSON.stringify(detail).slice(0, 300) : "")); }
};

const GAME = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";

console.log("\n=== 🈯 why this matters, measured on the shipped maps ===");
if (!fs.existsSync(path.join(GAME, "map", "strategicregions"))) {
  console.log("  ..   (the base game is not installed — the corpus half cannot run)");
} else {
  const m = md.buildMapModel({ modRoot: GAME, gameRoot: GAME, dependencyRoots: [] });
  const states = (m.states || []).filter((s) => (s.provinces || []).length);
  const multi = states.filter((s) => s.provinces.length > 1).length;
  ok(states.length > 500, `vanilla has ${states.length} states with provinces`, states.length);
  ok(multi / states.length > 0.8,
    `⭐⭐ ${(100 * multi / states.length).toFixed(1)}% of them have more than one province — so almost any single-province move splits one`,
    { multi, total: states.length });

  let split = 0;
  for (const s of states) {
    const regs = new Set();
    for (const p of s.provinces) { const r = (m.provinceToRegion || {})[p]; if (r !== undefined) regs.add(r); }
    if (regs.size > 1) split++;
  }
  ok(split === 0,
    "⭐⭐⭐ …and NOT ONE vanilla state is split across regions, so the rule is not crying wolf", split);
}

console.log("\n=== the dropdown asks before it splits a state ===");
{
  const MAP = fs.readFileSync(path.join(__dirname, "public", "map.js"), "utf8");
  const MASKED = maskJsComments(MAP);
  const s = MASKED.indexOf('$("miRegionSel").addEventListener("change"');
  ok(s > 0, "the strategic-region dropdown handler was found", s);
  const body = MAP.slice(s, MASKED.indexOf("\n  });", s) + 6);
  const mbody = MASKED.slice(s, MASKED.indexOf("\n  });", s) + 6);

  ok(/regionMoveStrays\(/.test(mbody),
    "⭐⭐ it asks whether the move would leave the rest of the state behind", body.length);
  ok(/novaConfirm|window\.confirm/.test(mbody),
    "⭐⭐⭐ …and asks the modder, rather than staging a split silently", body.length);
  ok(/Move all/.test(body),
    "⭐⭐ …offering to take the whole state across, which is what every shipping map looks like", body.length);
  ok(/if \(strays\.length\)/.test(mbody),
    "⚠️ …only when the move would actually split the state", body.length);

  // ⭐⭐⭐ RUN the decision, don't grep for it. A first version of this test asserted only that the handler
  // MENTIONED novaConfirm — and disabling the branch outright (`if (false && strays.length)`) left every one
  // of those assertions passing. The decision is a pure function precisely so it can be executed here.
  const vm = require("vm");
  const fnStart = MASKED.indexOf("function regionMoveStrays");
  const fn = fnStart < 0 ? "" : MAP.slice(fnStart, MASKED.indexOf("\n  }", fnStart) + 4);
  ok(fn.length > 80, "regionMoveStrays lifted", fn.length);
  const sb = { console };
  sb.globalThis = sb;
  vm.createContext(sb);
  vm.runInContext(fn + "\nglobalThis.f = regionMoveStrays;", sb);
  const st4 = { id: 9, provinces: [1, 2, 3] };

  // Province 1 moves to region 7; provinces 2 and 3 stay in region 4 → the state would be split.
  const split = sb.f(1, 7, st4, { 1: 4, 2: 4, 3: 4 });
  ok(Array.isArray(split) && split.length === 2 && split.indexOf(2) >= 0 && split.indexOf(3) >= 0,
    "⭐⭐⭐ moving one province out of a 3-province state names the 2 left behind", split);

  // …the whole state moving together leaves nobody behind.
  ok(sb.f(1, 7, st4, { 1: 7, 2: 7, 3: 7 }).length === 0,
    "⭐⭐ …and a move that takes the whole state reports nothing to ask about", sb.f(1, 7, st4, { 1: 7, 2: 7, 3: 7 }));

  // …a single-province state can never be split, so it must never nag.
  ok(sb.f(5, 7, { id: 10, provinces: [5] }, { 5: 4 }).length === 0,
    "⚠️⚠️ a one-province state is never split — no dialog for the 6.3% of states that cannot split", sb.f(5, 7, { id: 10, provinces: [5] }, { 5: 4 }));

  // …and the last stray moving in closes the split rather than opening another dialog.
  ok(sb.f(3, 7, st4, { 1: 7, 2: 7, 3: 4 }).length === 0,
    "⚠️ …nor when the move REUNITES the state in the target region", sb.f(3, 7, st4, { 1: 7, 2: 7, 3: 4 }));
  ok(sb.f(1, 7, null, { 1: 4 }).length === 0, "…and a province with no state is handled, not thrown on", sb.f(1, 7, null, {}));

  // The dropdown must not be left showing a region the model never moved to.
  ok(/e\.target\.value = fromRegion/.test(mbody),
    "⚠️⚠️ the control is put back before the dialog, so Escape cannot desync it from the map", body.length);
}

console.log("\n=== …and the two-real-choices dialog actually has two choices ===");
{
  // ⚠️ MASK THE COMMENTS. A first pass grepped the raw source for `opts.onCancel` — and the comment added
  // beside the fix says "`opts.onCancel` runs when the CANCEL BUTTON is pressed", so removing the actual
  // call left the assertion passing on the prose. The fix's own explanation contained the string the check
  // was looking for.
  const AI = maskJsComments(fs.readFileSync(path.join(__dirname, "public", "ai-field-assist.js"), "utf8"));
  const s = AI.indexOf("window.novaConfirm = window.novaConfirm");
  // ⚠️ Wide enough to reach the button handlers: ai-field-assist.js is CRLF, so a byte window covers
  // fewer lines than it looks. A window that stops short reads as "the fix is missing".
  const body = s < 0 ? "" : AI.slice(s, s + 7000);
  ok(body.length > 500, "novaConfirm was found", body.length);
  ok(/opts\.onCancel/.test(body),
    "⭐⭐ the cancel BUTTON can carry its own action — without it, “Move only this province” would do nothing",
    body.slice(0, 200));
  // ⚠️ …but only the button. A dismissal must never perform an action.
  const escLine = (body.match(/onKey = \(e\) => \{[^\n]*\}/) || [""])[0];
  ok(!/onCancel/.test(escLine),
    "⚠️⚠️ …and Escape does NOT run it — a dismissal must not act", escLine.slice(0, 160));
  const backdrop = (body.match(/mousedown[^\n]*\n?/) || [""])[0];
  ok(!/onCancel/.test(backdrop),
    "⚠️⚠️ …nor does a backdrop click", backdrop.slice(0, 160));
}

console.log(`\n=== a region move keeps the state together: ${pass} checks, ${fails.length} failed ===`);
fails.forEach((f) => console.log("   FAILED: " + f));
process.exit(fails.length ? 1 : 0);
