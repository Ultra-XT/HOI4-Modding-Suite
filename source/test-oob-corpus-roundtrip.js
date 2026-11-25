// A NO-EDIT SAVE MUST NOT CHANGE BYTES — measured against every order-of-battle file that ships.
//
// This is the round-trip contract applied to a corpus rather than a fixture: 1,533 real files from Hearts of
// Iron IV and Millennium Dawn, parsed by Nova and merged straight back with the modelled fields the BROWSER
// would echo (comments and un-modelled statements stripped, exactly as the client strips them — a fixture
// that hands mergeOob what it already has proves nothing, which is a lesson this project paid for once).
//
// #oob-roundtrip-adds-eof-newline — it changed 1,120 of the 1,533. Not one of them ends with a newline, and
// mergeOob added one unconditionally, so opening any vanilla or MD order of battle and pressing Save produced
// a diff on a file the user never touched. Harmless to the game, and exactly the property this contract
// exists to protect: once a no-edit save is expected to churn, a real unintended change stops being visible
// in the diff. The 1,121st was Millennium Dawn's 0-byte BOS_2000_nonbba.txt, which became "\n".
//
// ⚠️ AND THE HOLE THAT RUN HAD. Passing every division CLEAN takes the preserve branch for all of them, so
// the REGENERATION branch — the one an actual edit takes — is never reached. On that evidence I called two
// other reported findings closed. They were not; an independent hunter reproduced both by marking one
// division dirty, which is exactly what editing a single division does. A corpus test that never reaches the
// interesting branch is a corpus test that CERTIFIES the bug. The second half of this file marks one division
// dirty per file, and the three defects it then measured are:
//
// #oob-save-indentation-grows-unbounded — _reindent PREPENDED tabs to blocks whose inner lines already
// carried the previous save's indentation, so every regenerating save pushed every untouched division one
// tab deeper, without limit. 543 of 774 files grew on the FIRST edit; MD's CHI_2000_nonnsb.txt went 3 tabs
// to 9 over six saves, +602 bytes each. The officer-portrait block had its own copy of the same mistake,
// compounding by three tabs a save — vanilla's HUN_wuw_1936.txt reached 20 tabs in five edits.
//
// #oob-edit-deletes-units-block-comments — 1,198 comment lines vanished from 138 files, mostly commented-out
// RESERVE division blocks and ASCII section banners, i.e. content the author keeps deliberately to re-enable
// later. Two shapes fell through: a comment run separated from its division by a BLANK LINE (the walk-back
// stopped there) and comments below the LAST statement in `units = {}` (nothing to attach to).
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
    console.log("  FAIL " + label + "  -> " + String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 900));
  }
}

// EVERY installed corpus, not two of them. Both bugs fixed alongside this widening were sitting in the
// three that were never read: a whitespace-only file losing its newline (Rise of Nations' NZL_INT.txt and
// NZL_TAC.txt, two bytes each) and a space-indented file padded with tabs (three Old World Blues files).
// A corpus that is present and not measured is a gap, not a saving.
const ROOTS = {
  vanilla: "D:/SteamLibrary/steamapps/common/Hearts of Iron IV",
  MD: "D:/SteamLibrary/steamapps/workshop/content/394360/2777392649",
  "Road to 56": "D:/SteamLibrary/steamapps/workshop/content/394360/820260968",
  "Old World Blues": "D:/SteamLibrary/steamapps/workshop/content/394360/2265420196",
  "Rise of Nations": "D:/SteamLibrary/steamapps/workshop/content/394360/2026448968",
};
// The fields the client can represent. Everything else — comments, un-modelled statements, the raw text —
// is dropped on the way to the browser and has to be recovered by mergeOob from the original.
const TPL_KEYS = ["name", "regiments", "support", "priority", "division_names_group", "template_counter", "is_locked", "override_model"];
const DIV_KEYS = ["name", "location", "template", "officer", "officerExtra", "equipmentFactor", "experience", "manpowerFactor", "owner", "divisionName", "forceVariants"];
const strip = (o, keys) => {
  const out = {};
  for (const k of keys) if (o[k] !== undefined && o[k] !== null) out[k] = o[k];
  return out;
};

const changed = [];
const threw = [];
let total = 0;
for (const [name, root] of Object.entries(ROOTS)) {
  const dir = path.join(root, "history", "units");
  let files = [];
  try { files = fs.readdirSync(dir).filter((f) => /\.txt$/i.test(f)); } catch (_) { continue; }
  for (const f of files) {
    total++;
    let src = "";
    try { src = fs.readFileSync(path.join(dir, f), "utf8"); } catch (_) { continue; }
    let p;
    try { p = U.parseUnitsFile(src); } catch (e) { threw.push(`${name}/${f}: parse ${e.message}`); continue; }
    let out;
    try {
      out = U.mergeOob(src, {
        templates: (p.templates || []).map((t) => strip(t, TPL_KEYS)),
        divisions: ((p.units && p.units.divisions) || []).map((d) => strip(d, DIV_KEYS)),
      });
    } catch (e) { threw.push(`${name}/${f}: merge ${e.message}`); continue; }
    if (out === src) continue;
    const a = src.split("\n"), b = out.split("\n");
    const diffs = [];
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
      if (a[i] !== b[i]) { diffs.push(`L${i + 1}: ${JSON.stringify(a[i])} -> ${JSON.stringify(b[i])}`); if (diffs.length >= 4) break; }
    }
    changed.push(`${name}/${f}  ${diffs.join(" | ")}`);
  }
}

console.log("\n[corpus] every shipping order of battle, parsed and merged straight back");
// A guard on the corpus itself: if the game moved or the paths changed, "0 changed" would be vacuously true.
rec("the corpus was found and is large", total > 4000, total); // ~5,900 across the five
rec("…and every file parsed", threw.length === 0, threw.slice(0, 6));
rec("NOT ONE file is changed by a no-edit round trip", changed.length === 0,
  `${changed.length} of ${total} changed:\n    ` + changed.slice(0, 8).join("\n    "));

console.log("\n[the specific regressions this run closed]");
// Trailing-newline handling, stated directly so a future edit cannot quietly restore the churn.
const KEEP = "##### Army #####\nunits = {\n\tdivision = {\n\t\tname = \"1st\"\n\t\tlocation = 1\n\t\tdivision_template = \"T\"\n\t}\n}";
const merged = U.mergeOob(KEEP, { templates: [], divisions: [{ name: "1st", location: 1, template: "T" }] });
rec("a file that ends WITHOUT a newline still ends without one", !/\n$/.test(merged), JSON.stringify(merged.slice(-40)));
const KEEPN = KEEP + "\n";
rec("…and one that ends WITH a newline keeps exactly one",
  /[^\n]\n$/.test(U.mergeOob(KEEPN, { templates: [], divisions: [{ name: "1st", location: 1, template: "T" }] })),
  JSON.stringify(U.mergeOob(KEEPN, { templates: [], divisions: [{ name: "1st", location: 1, template: "T" }] }).slice(-40)));
rec("an EMPTY original that stays empty is left empty, not turned into a newline",
  U.mergeOob("", { templates: [], divisions: [] }) === "", JSON.stringify(U.mergeOob("", { templates: [], divisions: [] })));
const fresh = U.mergeOob("", { templates: [], divisions: [{ name: "1st", location: 1, template: "T" }] });
rec("…but a file Nova actually creates DOES end with a newline", /\n$/.test(fresh), JSON.stringify(fresh.slice(-40)));

// ⚠️ THE HOLE THIS FILE ORIGINALLY HAD, and why the section below exists.
//
// Everything above passes every division CLEAN, so mergeOob takes the preserve branch for all of them and
// the REGENERATION branch — the one an actual edit takes — is never exercised. I concluded from that run
// that the reported indent-creep and comment-loss findings were closed. They were not: an independent hunter
// reproduced both by marking one division dirty, which is what editing a single division does.
//
// A corpus test that never reaches the interesting branch is a corpus test that certifies the bug. Mark one
// division dirty per file and measure again.
console.log("\n[the edit path] one dirty division — what an ordinary edit actually does");
const commentLines = (s) => (s.match(/^[ \t]*#/gm) || []).length;
const maxTabs = (s) => Math.max(0, ...s.split("\n").map((l) => (l.match(/^\t*/) || [""])[0].length));
let dirtyFiles = 0, cBefore = 0, cAfter = 0, indentGrew = 0;
const lossy = [];
for (const [name, root] of Object.entries(ROOTS)) {
  const dir = path.join(root, "history", "units");
  let files = [];
  try { files = fs.readdirSync(dir).filter((f) => /\.txt$/i.test(f)); } catch (_) { continue; }
  for (const f of files) {
    let src = "";
    try { src = fs.readFileSync(path.join(dir, f), "utf8"); } catch (_) { continue; }
    let p;
    try { p = U.parseUnitsFile(src); } catch (_) { continue; }
    const divisions = ((p.units && p.units.divisions) || []).map((d) => strip(d, DIV_KEYS));
    if (!divisions.length) continue;
    dirtyFiles++;
    divisions[0]._dirty = true;
    let out;
    try {
      out = U.mergeOob(src, { templates: (p.templates || []).map((t) => strip(t, TPL_KEYS)), divisions });
    } catch (_) { continue; }
    const a = commentLines(src), b = commentLines(out);
    cBefore += a; cAfter += b;
    if (b < a) lossy.push(`${name}/${f}: ${a} -> ${b}`);
    if (maxTabs(out) > maxTabs(src)) indentGrew++;
  }
}
rec("the edit path ran over thousands of real files", dirtyFiles > 2000, dirtyFiles);
// #oob-save-indentation-grows-unbounded — _reindent PREPENDED tabs to a block whose inner lines already
// carried the previous save's indentation, so every regenerating save pushed every untouched division one
// tab deeper, without limit. 543 of these files grew on the FIRST edit; MD's CHI_2000_nonnsb.txt went from
// 3 leading tabs to 9 over six saves, +602 bytes each time.
rec("NO file's indentation grows on an edit (it used to grow in 543 of them)", indentGrew === 0, indentGrew);
// #oob-edit-deletes-units-block-comments — 1,198 comment lines vanished from 138 files. Most of what went
// were commented-out RESERVE division blocks and ASCII section banners: content the author is deliberately
// keeping to re-enable later. MD's CHI_2000_nonnsb.txt went 249 -> 54, vanilla's HOL_1936.txt 87 -> 7.
//
// A small residue is accepted and bounded here rather than claimed to be zero: a comment sitting INSIDE the
// division the user just edited cannot survive, because that division is rebuilt from what they entered.
// Measured at 36 lines across the whole corpus, all of that shape (`#name = "..."` inside the edited block).
rec("comment loss on an edit is down from 1,198 lines to a bounded residue",
  cBefore - cAfter <= 60, { before: cBefore, after: cAfter, lost: cBefore - cAfter, files: lossy.slice(0, 6) });
rec("…and no file loses more than a handful",
  lossy.every((s) => { const m = /: (\d+) -> (\d+)$/.exec(s); return m && Number(m[1]) - Number(m[2]) <= 5; }),
  lossy.slice(0, 8));

console.log("\n[repeat] editing the same file over and over must converge, not drift");
{
  const F = path.join(ROOTS.MD, "history", "units", "CHI_2000_nonnsb.txt");
  let cur = "";
  try { cur = fs.readFileSync(F, "utf8"); } catch (_) {}
  rec("the worst-affected file was readable", cur.length > 1000, cur.length);
  const seen = [];
  for (let i = 0; i < 4 && cur; i++) {
    const p = U.parseUnitsFile(cur);
    const divisions = ((p.units && p.units.divisions) || []).map((d) => strip(d, DIV_KEYS));
    if (!divisions.length) break;
    divisions[0]._dirty = true;
    cur = U.mergeOob(cur, { templates: (p.templates || []).map((t) => strip(t, TPL_KEYS)), divisions });
    seen.push({ bytes: cur.length, tabs: maxTabs(cur), comments: commentLines(cur) });
  }
  rec("saves 2..n are byte-identical to save 1", seen.length >= 3 && seen.every((s) => s.bytes === seen[0].bytes), seen);
  rec("…and the indentation never deepens", seen.length >= 3 && seen.every((s) => s.tabs === seen[0].tabs), seen);
}

console.log(`\n=== oob corpus round trip: ${checks} checks, ${fails.length} failed  (${total} files) ===`);
if (fails.length) { fails.forEach((f) => console.log("   FAILED: " + f)); process.exitCode = 1; }
