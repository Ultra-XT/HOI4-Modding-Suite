// Editing a victory point must not destroy `add_victory_points`. #victory-points-ate-add-victory-points
//
// FOUND BY THE OWNER: the game crashed before the main menu. HOI4's log:
//
//   Invalid effect 'add_' in history/states/1032 - Yanan.txt line : 48
//   Unknown History Command ==>'add_'<== for state: history/states/1032 - Yanan.txt
//   no provinces in state "STATE_1032" with id: 1032
//   MAP_ERROR: The land province 517 has no state.   (…and 5007, 7208, 8049, 10733, 12156)
//
// HOI4 has TWO victory-point forms. The state-level `victory_points = { pid value }`, and the dated effect
// `add_victory_points = { province = N value = M }` used inside a dated block. Every regex in map-data.js
// matched the bare substring `victory_points`, which occurs inside `add_victory_points` — and the one in
// setVictoryPointsInHistory is a DELETION. Vanilla's 1032 - Yanan.txt went from
//
//     add_victory_points = {          to      add_        }
//       province = 8049                     victory_points = { 517 5 }
//       value = 2                         }
//     }
//
// leaving `add_` stranded, pulling the brace onto its line, writing the new pair outside the block, and
// destroying Paradox's own victory point for province 8049. The file stopped parsing, the state lost all six
// of its provinces, and the game crashed.
//
// ⚠️ Nova's own validator called that mod 0 errors — Nova's parser is lenient where Clausewitz is not, so it
// still read the file it had just broken. Only the game caught it.
//
// ⚠️ 1 of vanilla's 1,081 state files, 0 of MD's 1,221, 0 of OWB's 1,524. One file in three and a half
// thousand, and editing a VP in it destroyed it.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const md = require("./map-data.js");

let pass = 0;
const fails = [];
const ok = (cond, label, detail) => {
  if (cond === true) { pass++; console.log("  ok   " + label); }
  else { fails.push(label); console.log("  FAIL " + label + (detail !== undefined ? "   -> " + JSON.stringify(detail).slice(0, 400) : "")); }
};

const GAME = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
const tmps = [];
const braced = (s) => {
  let d = 0;
  for (const ch of s) { if (ch === "{") d++; else if (ch === "}") { d--; if (d < 0) return false; } }
  return d === 0;
};

// ── the real file, straight from the game ────────────────────────────────────────────────────────────
console.log("\n=== 🈯 vanilla's own dated victory point survives an edit ===");
const REAL = path.join(GAME, "history", "states", "1032 - Yanan.txt");
if (!fs.existsSync(REAL)) {
  console.log("  ..   (the base game is not installed)");
} else {
  const before = fs.readFileSync(REAL, "utf8");
  ok(/add_victory_points\s*=\s*\{/.test(before), "the fixture really contains add_victory_points", true);
  ok(braced(before), "…and starts brace-balanced");

  // Exactly what the map page's state panel sends when a VP is added.
  const after = md.setStateFieldsInBlock(before, { victoryPoints: [{ province: 517, value: 5 }] });

  ok(braced(after), "⭐⭐⭐ the file is still brace-balanced — HOI4 can parse it", after.slice(-260));
  ok(!/add_\s*\}/.test(after) && !/add_\s*$/m.test(after),
    "⭐⭐⭐ …and `add_` was not left stranded, which is what stopped it parsing", (after.match(/add_[^\w][^\n]*/g) || []).slice(0, 3));
  ok(/add_victory_points\s*=\s*\{/.test(after),
    "⭐⭐⭐ …the dated add_victory_points block is still there", true);
  ok(/province\s*=\s*8049/.test(after) && /value\s*=\s*2/.test(after),
    "⭐⭐ …with Paradox's own victory point for province 8049 intact", true);

  // …and the edit it was asked for actually happened.
  ok(/(?<![A-Za-z0-9_])victory_points\s*=\s*\{\s*517\s+5\s*\}/.test(after),
    "⭐⭐ …while the requested victory point WAS written", (after.match(/victory_points[^\n]*/g) || []).slice(0, 4));

  // …and the state still has its provinces, which is what the crash actually cost.
  const provBefore = (before.match(/provinces\s*=\s*\{([^}]*)\}/) || [])[1] || "";
  const provAfter = (after.match(/provinces\s*=\s*\{([^}]*)\}/) || [])[1] || "";
  ok(provAfter.trim() === provBefore.trim(),
    "⭐⭐⭐ …and the province list is untouched — the crash was six provinces going stateless",
    { before: provBefore.trim().slice(0, 60), after: provAfter.trim().slice(0, 60) });
}

// ── the ordinary form still works, or the guard is too wide ──────────────────────────────────────────
console.log("\n=== ⚠️ CONTROL: a plain victory_points is still edited normally ===");
{
  const plain = 'state = {\n\tid = 9\n\tname = "STATE_9"\n\tmanpower = 100\n\tstate_category = rural\n'
    + '\tprovinces = { 1 2 }\n\thistory = {\n\t\towner = AAA\n\t\tvictory_points = { 1 3 }\n\t}\n}\n';
  const out = md.setStateFieldsInBlock(plain, { victoryPoints: [{ province: 2, value: 7 }] });
  ok(braced(out), "the plain form stays balanced");
  ok(/victory_points\s*=\s*\{\s*2\s+7\s*\}/.test(out), "⚠️ …and the new pair is written", out.slice(-160));
  ok(!/victory_points\s*=\s*\{\s*1\s+3\s*\}/.test(out),
    "⚠️⚠️ …and the old one is REPLACED — the guard did not disable the feature", out.slice(-160));
}

// ── and a state carrying BOTH forms keeps the dated one while its own is replaced ────────────────────
console.log("\n=== ⚠️⚠️ the sharp case: both forms in one file ===");
{
  const both = 'state = {\n\tid = 8\n\tname = "STATE_8"\n\tmanpower = 100\n\tstate_category = rural\n'
    + '\tprovinces = { 4 5 }\n\thistory = {\n\t\towner = AAA\n\t\tvictory_points = { 4 1 }\n'
    + '\t\t1939.1.1 = {\n\t\t\tadd_victory_points = {\n\t\t\t\tprovince = 5\n\t\t\t\tvalue = 9\n\t\t\t}\n\t\t}\n\t}\n}\n';
  const out = md.setStateFieldsInBlock(both, { victoryPoints: [{ province: 4, value: 6 }] });
  ok(braced(out), "⭐⭐ balanced with both forms present", out);
  ok(/add_victory_points\s*=\s*\{[\s\S]*?province\s*=\s*5[\s\S]*?value\s*=\s*9/.test(out),
    "⭐⭐⭐ the dated block is preserved whole", out);
  ok(/(?<![A-Za-z0-9_])victory_points\s*=\s*\{\s*4\s+6\s*\}/.test(out), "…and the state-level one is updated", out);
  ok(!/(?<![A-Za-z0-9_])victory_points\s*=\s*\{\s*4\s+1\s*\}/.test(out), "…with the old value gone", out);
}

tmps.forEach((d) => { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} });
console.log(`\n=== editing a vp does not eat add_victory_points: ${pass} checks, ${fails.length} failed ===`);
fails.forEach((f) => console.log("   FAILED: " + f));
process.exit(fails.length ? 1 : 0);
