// #deploy-tile-update-homogenises-group — CLICKING A PLACED DIVISION STACK AND PRESSING UPDATE, WITH
// NOTHING EDITED, DELETED THE OTHER COMMANDERS IN IT.
//
// The Army Maker's deploy tile represents "N divisions of template T at province P". Clicking it pulls the
// group into the form so its commander / equipment % / experience % can be changed. The form can only show
// ONE value per field, so it took each from the first division that had one — and then Update wrote all
// three back onto EVERY division in the group, whether or not the user had touched them.
//
// Real content is full of uneven stacks. Vanilla's history/units/ETH_1936_bba.txt puts two different
// divisions on the same template at province 7944:
//     "1 Wag Sefari"          officer Haile Kebbede,    45% equipment,   5% experience
//     "1 Welega-Ardjo Sefari" officer Makonnen Demissie, 100% equipment, 25% experience
// One Update deleted Makonnen Demissie from the mod, renamed the survivors "Haile Kebbede 1" / "Haile
// Kebbede 2", and cut the second division's readiness from 100/25 to 45/5 — reported as plain success.
// Measured across the shipping order-of-battle files: 34 such groups in 10 vanilla files.
//
// startDeployEdit already KNEW the group can be uneven — its own comment says "the group can be uneven … and
// reading blindly off [0] would silently blank the others". The knowledge was in the reader and not in the
// writer, which is the shape this codebase keeps producing.
//
// Fixed by recording what was pre-filled and writing back only a field whose box actually changed.
//
// SUPERSEDED IN SHAPE by #x2-brigade-cards: placed divisions are no longer grouped into one ×N tile at all,
// so a form never holds more than one division and the "a single box cannot show three commanders" warning
// has nothing left to warn about. The only-write-what-changed safeguard still matters and is still asserted
// below — pressing Update having only LOOKED must not stamp the box's rendering back over the real value.
"use strict";
const fs = require("fs");
const path = require("path");
const U = require("./unit-data.js");

const fails = [];
let checks = 0;
function rec(label, cond, detail) {
  checks++;
  if (cond) console.log("  ok   " + label);
  else {
    fails.push(label);
    console.log("  FAIL " + label + "  -> " + String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 600));
  }
}

console.log("\n[ground truth] uneven stacks are ordinary in the shipping game");
const V = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
let unevenGroups = 0, filesWithUneven = 0, example = null;
let unitFiles = [];
try { unitFiles = fs.readdirSync(path.join(V, "history", "units")).filter((f) => /\.txt$/i.test(f)); } catch (_) {}
for (const f of unitFiles) {
  let p;
  try { p = U.parseUnitsFile(fs.readFileSync(path.join(V, "history", "units", f), "utf8")); } catch (_) { continue; }
  const divs = (p.units && p.units.divisions) || [];
  const groups = new Map();
  for (const d of divs) {
    const k = `${d.location}|${d.template || ""}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(d);
  }
  let here = 0;
  for (const [k, g] of groups) {
    if (g.length < 2) continue;
    const offs = new Set(g.map((d) => String(d.officer || "")));
    if (offs.size > 1) {
      here++;
      if (!example) example = { file: f, key: k, divisions: g.map((d) => ({ officer: d.officer, ef: d.equipmentFactor, xp: d.experience })) };
    }
  }
  if (here) { unevenGroups += here; filesWithUneven++; }
}
rec("the order-of-battle corpus was readable", unitFiles.length > 100, unitFiles.length);
rec("vanilla ships stacks whose divisions have DIFFERENT commanders",
  unevenGroups > 10 && filesWithUneven > 3, { unevenGroups, filesWithUneven, example });
rec("…and the example carries different readiness too, not only names",
  example && new Set(example.divisions.map((d) => String(d.ef))).size > 1, example);

console.log("\n[the fix] Update writes back only what the user changed");
const A = fs.readFileSync(path.join(__dirname, "public", "army.js"), "utf8");
rec("the pre-filled values are recorded on entering edit mode",
  /S\.deployEdit\.seed = \{/.test(A), "no seed recorded");
rec("…as the literal box contents, so retyping the same text counts as unchanged",
  /officer: \(\$\("deployOfficer"\) && \$\("deployOfficer"\)\.value\) \|\| "",/.test(A), "seed is not the raw box value");
rec("…and Update compares against them", /const changed = \(k\) => seed\[k\] === undefined \|\| now\[k\] !== seed\[k\];/.test(A),
  "no comparison");
for (const [field, guard] of [["officer", 'changed("officer")'], ["equipment", 'changed("equip")'], ["experience", 'changed("exp")']]) {
  rec(`the ${field} write is behind that check`, A.includes(`if (${guard})`), guard);
}
// The officer renumbering is gone entirely — see #x2-brigade-cards. The form now edits ONE division, so
// there is no stack to number, and appending " 1" to a lone commander was only ever there to tell several
// divisions placed together apart.
rec("a lone commander is written as typed, with no index appended",
  !/\$\{officer\} \$\{i \+ 1\}/.test(A) && /if \(officer\) d\.officer = officer;/.test(A),
  "still renumbering");
// …and a `delete` is just as destructive as a write.
rec("clearing a box also only applies when the box changed",
  /if \(changed\("equip"\)\) \{ if \(ef != null\) d\.equipmentFactor = ef; else delete d\.equipmentFactor; \}/.test(A),
  "delete still unconditional");

console.log("\n[the problem is now structural, not warned about]");
// The uneven-stack WARNING is gone because the situation it warned about cannot arise: the form holds one
// division, so a box always describes exactly the division it came from. #x2-brigade-cards
rec("the form edits a single division", /const mine = \[div\];/.test(A), "still filters a group");
rec("…so there is no uneven-group warning left to give",
  !/do not all share the same/.test(A), "still warning about a group it no longer edits");
rec("…and each division shows its OWN commander on its own tile",
  /dep-chip">🎖 \$\{esc\(g\.officer\)\}/.test(A), "tile still shows a commander COUNT");

console.log("\n[control] the tool still WORKS — the capabilities survived the reshape");
rec("a changed box still writes", /mine\.forEach\(\(d, i\) => \{[\s\S]{0,600}?d\._dirty = true;/.test(A), "the write loop is gone");
// Growing a stack was the count box on the group form. That box has no group to resize now, so the
// capability moved onto the tile as a per-division duplicate.
rec("…and a stack can still be grown, per-division", /class="dep-dup"/.test(A), "no way to add another");
rec("…copying the division's own commander, equipment and experience",
  /if \(d\.officer\) copy\.officer = d\.officer;/.test(A) && /copy\.equipmentFactor = d\.equipmentFactor;/.test(A),
  "duplicate does not carry the division's values");
rec("…and a stack can still be shrunk, one tile at a time",
  /S\.model\.divisions\.filter\(\(y\) => y !== d\)/.test(A), "no per-division delete");

console.log(`\n=== deploy tile update: ${checks} checks, ${fails.length} failed ===`);
if (fails.length) { fails.forEach((f) => console.log("   FAILED: " + f)); process.exitCode = 1; }
