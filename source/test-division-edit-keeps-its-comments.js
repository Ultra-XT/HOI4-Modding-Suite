// #oob-edit-regenerates-the-whole-division + #name-sanitize-deletes-a-legal-hash
//
// EDITING ONE DIVISION DELETED EVERY COMMENT INSIDE ITS OWN BLOCK.
//
// A CLEAN division survives an unrelated save because mergeOob re-emits its raw bytes. The one division the
// user actually edited went through genDivision, which rebuilds the block from the parsed model — and the
// model has no field for a comment. Round-tripping every real division through Nova's own parser and emitter:
// 12,291 of 58,548 divisions lose 16,487 comment lines across 803 order-of-battle files. What goes is the
// author's own annotation —
//
//     division = { # "1 Aussa Yekilili Sefari"           7,127
//         #name = "Farah Military District"              2,481 commented-out alternative names
//         division_template = "Infantry Division"  # Frontline unit, experienced
//         location = 3010#Edmonton Alberta
//         start_equipment_factor = 0.5 #0.7             what the value used to be
//
// — together with the statement order, the indentation, and (on 1 real division) a second `officer` block,
// which the model reads with `.find` and the emitter therefore wrote once.
//
// Fixed by SPLICING the changed values into the original text instead of regenerating it, the same shape that
// stopped the state-building writer reflowing blocks. Only a value that differs from what was parsed is
// rewritten, so an edit to the location rewrites the location token and nothing else.
//
// ONE thing is still deliberately dropped: the place-name label on the location line, when the division MOVES.
// Millennium Dawn captions every division's province (`location = 12862\t\t#As Shajarah`) and 10,861 divisions
// across the corpus carry one. Keeping it verbatim would caption a moved division with the wrong city, and a
// stale label is worse than none — the rule genDivision already applied. #oob-save-eats-location-comments
//
// SECOND BUG, found while checking what an edit does to a name: qstr() deletes `#`, citing "Nova's brace
// checker treats it as a comment even mid-name". That checker tests `inStr` BEFORE `#` and has not been
// fooled for some time — the checker was fixed and the sanitiser never adopted it, nor did its twin
// `cleanVarName` in server.js. A `#` inside a quoted string is legal and vanilla ships one
// (`version_name = "FT mod. #31"`), so renaming a division silently renumbered Road to 56's
// "Nacistas Militia #1…#7". The tab went the same way, running "Armored\tDivision" together.
"use strict";
const fs = require("fs");
const path = require("path");
const U = require("./unit-data.js");
const { stripJsComments } = require("./testlib-strip-comments.js");

const fails = [];
let checks = 0;
function rec(label, cond, detail) {
  checks++;
  if (cond) console.log("  ok   " + label);
  else {
    fails.push(label);
    console.log("  FAIL " + label + "  -> " + String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 360));
  }
}
const UD = stripJsComments(fs.readFileSync(path.join(__dirname, "unit-data.js"), "utf8"));
const SV = stripJsComments(fs.readFileSync(path.join(__dirname, "server.js"), "utf8"));

// The comment TEXT, not the line it sits on: an edit turns `location = 12364 # Buenos Aires` into
// `location = 12365 # Buenos Aires`, and comparing whole lines calls that a lost comment. ⭐ measure right.
function commentTexts(raw) {
  const out = [];
  for (const line of String(raw).replace(/\r/g, "").split("\n")) {
    const h = line.indexOf("#");
    if (h < 0) continue;
    if ((line.slice(0, h).match(/"/g) || []).length % 2 === 1) continue; // inside a string
    out.push(line.slice(h).trim().replace(/\s+/g, " "));
  }
  return out;
}
const braceCount = (s) => [(String(s).match(/\{/g) || []).length, (String(s).match(/\}/g) || []).length].join("/");

// Blank out comment runs, keeping offsets, so a regex can find the LIVE assignment and not a commented one.
function maskComments(t) {
  let out = "", inStr = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (inStr) { out += c; if (c === '"' && t[i - 1] !== "\\") inStr = false; continue; }
    if (c === '"') { inStr = true; out += c; continue; }
    if (c === "#") { while (i < t.length && t[i] !== "\n") { out += " "; i++; } out += "\n"; continue; }
    out += c;
  }
  return out;
}
// Replace the live `name = "…"` with a placeholder, leaving everything else — including every comment —
// exactly where it is, so two blocks that differ only in the name compare equal.
function normaliseName(s) {
  const hit = /(^|[^\w])name\s*=\s*"(?:[^"\\]|\\.)*"/.exec(maskComments(String(s)));
  if (!hit) return String(s);
  const at = hit.index + hit[1].length;
  return String(s).slice(0, at) + 'name = "N"' + String(s).slice(at + hit[0].length - hit[1].length);
}
// How many entries of `was` are missing from `now`, counting repeats.
function multisetLoss(was, now) {
  const left = now.slice();
  let lost = 0;
  for (const c of was) {
    const i = left.indexOf(c);
    if (i >= 0) left.splice(i, 1); else lost++;
  }
  return lost;
}

console.log("\n[the edited division is spliced, not rebuilt]");
{
  rec("patchDivisionRaw exists and is exported", typeof U.patchDivisionRaw === "function", typeof U.patchDivisionRaw);
  // ⭐ DERIVED from the source: the dirty branch must REACH it. A splice nothing calls is a dead fix.
  const dirty = /\} else \{[\s\S]{0,900}?genDivision\(origEntry \? Object\.assign/.exec(UD);
  rec("the dirty branch was found", !!dirty, "mergeOob no longer has the else-branch this fixes");
  rec("…and it tries the splice first", !!dirty && /patchDivisionRaw\(/.test(dirty[0]), (dirty && dirty[0].slice(0, 200)) || "");
  rec("…and still falls back to genDivision", !!dirty && /genDivision\(/.test(dirty[0]), "");
  rec("the merge queue carries the ORIGINAL parsed division", /const entry = \{[\s\S]{0,400}?\borig: d,/.test(UD),
    "without it the splice cannot tell which fields changed");
}

console.log("\n[fixtures] a block with a comment on every shape the corpus uses");
const FIXTURE = [
  '\tdivision = { # "1 Aussa Yekilili Sefari"',
  '\t\t#name = "Farah Military District"',
  '\t\tname = "Manshu Tetsudo Shubitai" # Manchuria Railway Guard',
  "\t\tdivision_name = {",
  "\t\t\tis_name_ordered = yes",
  "\t\t\tname_order = 23",
  "\t\t}#  ordered-name block",
  "\t\tlocation = 12862\t\t#As Shajarah",
  '\t\tdivision_template = "Infantry Division"\t\t# Frontline unit, experienced',
  '\t\tofficer = { name = "Erwin Rommel" }',
  '\t\tofficer = { name = "A Second Commander" }',
  "\t\tstart_equipment_factor = 0.5 #0.7",
  "\t}",
].join("\n");
const parsed = U.parseUnitsFile("units = {\n" + FIXTURE + "\n}\n");
const d0 = parsed.units.divisions[0];
{
  rec("the fixture parses to one division", parsed.units.divisions.length === 1, parsed.units.divisions.length);
  // ⭐ ASSERT THE FIXTURE HAS THE PROPERTY, or a passing control proves nothing.
  rec("…and it really does carry 7 comments", commentTexts(d0._raw).length === 7, commentTexts(d0._raw));
  rec("…and two officer blocks", (String(d0._raw).match(/officer\s*=\s*\{/g) || []).length === 2, d0._raw);

  const noop = U.patchDivisionRaw(d0._raw, d0, d0);
  rec("a no-op splice returns the block unchanged", noop === String(d0._raw).replace(/\r/g, ""), JSON.stringify(String(noop).slice(0, 120)));

  const renamed = U.patchDivisionRaw(d0._raw, d0, Object.assign({}, d0, { name: "Renamed Division" }));
  rec("a RENAME keeps every comment", commentTexts(d0._raw).every((c) => commentTexts(renamed).includes(c)),
    commentTexts(d0._raw).filter((c) => !commentTexts(renamed).includes(c)));
  rec("…and writes the new name", /name = "Renamed Division"/.test(renamed), renamed);
  rec("…and keeps the SECOND officer block", (renamed.match(/officer\s*=\s*\{/g) || []).length === 2, renamed);
  rec("…and touches nothing else", renamed.replace(/name = "Renamed Division"/, 'name = "Manshu Tetsudo Shubitai"') === String(d0._raw).replace(/\r/g, ""), renamed);

  const moved = U.patchDivisionRaw(d0._raw, d0, Object.assign({}, d0, { location: 4001 }));
  rec("a MOVE writes the new province", /location = 4001/.test(moved), moved);
  // ⭐ the ONE deliberate loss
  rec("…and drops the label naming where it used to be", !/As Shajarah/.test(moved), moved);
  rec("…but keeps every OTHER comment",
    commentTexts(d0._raw).filter((c) => c !== "#As Shajarah").every((c) => commentTexts(moved).includes(c)),
    commentTexts(d0._raw).filter((c) => c !== "#As Shajarah" && !commentTexts(moved).includes(c)));

  const off = U.patchDivisionRaw(d0._raw, d0, Object.assign({}, d0, { officer: "Heinz Guderian" }));
  rec("an OFFICER rename lands on the first officer", /name = "Heinz Guderian"/.test(off), off);
  rec("…and leaves the second alone", /name = "A Second Commander"/.test(off), off);

  const cleared = U.patchDivisionRaw(d0._raw, d0, Object.assign({}, d0, { equipmentFactor: null }));
  rec("clearing a field removes its line", !/start_equipment_factor/.test(cleared), cleared);
  const added = U.patchDivisionRaw(d0._raw, d0, Object.assign({}, d0, { experience: 0.25 }));
  rec("adding a field appends it inside the block", /start_experience_factor = 0\.25/.test(added), added);
  rec("…and the block still balances", braceCount(added) === braceCount(d0._raw), braceCount(added) + " vs " + braceCount(d0._raw));
  rec("…and it re-parses to the new value",
    Number((U.parseUnitsFile("units = {\n" + added + "\n}\n").units.divisions[0] || {}).experience) === 0.25,
    added);
}

console.log("\n[end to end] the same thing through mergeOob, which is what a save calls");
{
  const file = "division_template = {\n\tname = \"Infantry Division\"\n\tregiments = { infantry = { x = 0 y = 0 } }\n}\n" +
    "units = {\n\t# ==== I Corps ====\n" + FIXTURE + "\n}\n";
  const p = U.parseUnitsFile(file);
  // ⭐ SEND WHAT THE CLIENT SENDS. The Army page cannot rename or move an existing division — the deploy
  // edit changes its officer, equipment factor and experience, and a template rename changes its template.
  // A rename would miss mergeOob's preserve-merge key (name|location|template|divisionName) and leave nothing
  // to splice into, so testing one would have measured a path no user can reach. See public/army.js:1696.
  const d = Object.assign({}, p.units.divisions[0], { _dirty: true, officer: "Heinz Guderian" });
  const out = U.mergeOob(file, { templates: p.templates, divisions: [d] });
  rec("the save writes the new commander", /name = "Heinz Guderian"/.test(out), out.slice(0, 400));
  rec("…and keeps the section header above the division", /==== I Corps ====/.test(out), out);
  rec("…and every comment inside the block",
    commentTexts(p.units.divisions[0]._raw).every((c) => commentTexts(out).includes(c)),
    commentTexts(p.units.divisions[0]._raw).filter((c) => !commentTexts(out).includes(c)));
  rec("…and both officers", (out.match(/officer\s*=\s*\{/g) || []).length === 2, out);
  rec("…and the file still balances", braceCount(out) === braceCount(file), braceCount(out) + " vs " + braceCount(file));
  const rp = U.parseUnitsFile(out);
  rec("…and re-parses to one division with the new commander",
    rp.units.divisions.length === 1 && rp.units.divisions[0].officer === "Heinz Guderian",
    rp.units.divisions.map((x) => x.officer));
  rec("…and the division kept its own name", rp.units.divisions[0].name === "Manshu Tetsudo Shubitai", rp.units.divisions[0].name);

  // The OTHER edit the client can make: a template rename, which rewrites every division's `template` and
  // therefore misses the strict key. mergeOob falls back to name|location|divisionName for exactly this
  // reason (#oob-template-rename-loses-comments) — so the splice must still find its original.
  const p2 = U.parseUnitsFile(file);
  const t2 = Object.assign({}, p2.templates[0], { name: "Renamed Template", _origName: "Infantry Division" });
  const d2 = Object.assign({}, p2.units.divisions[0], { _dirty: true, template: "Renamed Template" });
  const out2 = U.mergeOob(file, { templates: [t2], divisions: [d2] });
  rec("a TEMPLATE rename still splices the division", /division_template = "Renamed Template"/.test(out2), out2);
  rec("…and keeps its comments", commentTexts(p2.units.divisions[0]._raw).every((c) => commentTexts(out2).includes(c)),
    commentTexts(p2.units.divisions[0]._raw).filter((c) => !commentTexts(out2).includes(c)));
}

console.log("\n[a legal # and tab survive a rename]");
{
  const g = U.genDivision({ name: "Nacistas Militia #1", location: 5, template: "Armored\tDivision" });
  rec("a # in a name is written, not deleted", /name = "Nacistas Militia #1"/.test(g), g);
  rec("a tab in a template name survives", /division_template = "Armored\tDivision"/.test(g), JSON.stringify(g));
  const bad = U.genDivision({ name: "evil } name { with \n newline \r and \u0000 nul", location: 5, template: "T" });
  rec("CONTROL: a brace is still stripped", !/[{}]/.test(/name = "([^"]*)"/.exec(bad)[1]), bad);
  rec("CONTROL: a newline is still stripped", !/[\r\n]/.test(/name = "([^"]*)"/.exec(bad)[1]), JSON.stringify(bad));
  rec("CONTROL: a NUL is still stripped", !/\u0000/.test(bad), JSON.stringify(bad));
  rec("the class keeps \\x09 out of the stripped range", /\\x00-\\x08\\x0a-\\x1f/.test(UD), "qstr no longer spares the tab");
  // ⭐ THE TWIN. Fixing one and leaving the other is how this class of bug propagates.
  rec("server.js's cleanVarName got the same fix", /cleanVarName = \(s\) => String\(s == null \? "" : s\)\.replace\(\/\[\\x00-\\x08\\x0a-\\x1f\\x7f"\{\}\]\/g, ""\)/.test(SV),
    (/cleanVarName = .*/.exec(SV) || [""])[0]);
}

console.log("\n[the write guard reads a quoted # the way the engine does]");
{
  // #brace-guard-reads-a-quoted-hash-as-a-comment — found by the suite the moment a legal # started reaching
  // the file: bracesAreBalanced stripped `#` to end of line with no idea whether it was inside a string, ate
  // the closing braces on that line, and refused the save. 61 call sites use it, and it is a WRITE GUARD —
  // being wrong does not mis-render anything, it leaves the user's work unwritten.
  // ⚠️ This used to lift the function's SOURCE TEXT out of server.js and eval it, which worked only while
  // the whole guard fitted between `function bracesAreBalanced` and the next `\n}\n` and called nothing.
  // The moment it delegated to the shared brace judge, the lifted copy threw ReferenceError — the test
  // failed on its own extraction rather than on the behaviour it exists to pin. server.js exports it now.
  const { bracesAreBalanced: balanced } = require("./server.js");
  rec("bracesAreBalanced is exported", typeof balanced === "function", typeof balanced);
  // The shape is Paradox's own — vanilla's history/units/AFG_1936_nsb.txt line 174, shipped commented out.
  rec("a quoted # does not start a comment",
    balanced('units = {\n\tdivision = {\n\t\tforce_equipment_variants = { a = { owner = AFG version_name = "FT mod. #31" } }\n\t}\n}\n'),
    "the guard still eats the rest of the line and refuses a legal file");
  rec("…nor does a quoted brace count", balanced('a = { name = "not { a block" }\n'), "");
  rec("…and an escaped quote does not end the string", balanced('a = { name = "11 Brigada \\\\"X\\\\" y" }\n'), "");
  // ⭐ CONTROLS: a guard that accepts everything is not a guard.
  rec("CONTROL: a REAL comment still hides its braces", balanced("units = {\n\t# a comment with a { in it\n}\n"), "");
  rec("CONTROL: a missing close is still caught", balanced("a = { b = {\n}\n") === false, "");
  rec("CONTROL: an extra close is still caught", balanced("a = { }\n}\n") === false, "");
}

console.log("\n[a comment at column 0 does not flatten the block]");
{
  // #reindent-flattened-by-a-column-zero-comment — only visible once such a comment survived an edit at all.
  // Vanilla's four YUG order-of-battle files open a division with `#` hard against the left margin; that made
  // _reindent's `min` zero, so nothing was stripped and the whole division came back a tab deeper than its
  // untouched siblings.
  const YUG = [
    "\tdivision = {",
    '#\t\tname = "Gardijska Pesadijska Div."\t\t\t# Peadijska if we get font support',
    "\t\tdivision_name = {",
    "\t\t\tis_name_ordered = yes",
    "\t\t\tname_order = 4",
    "\t\t}",
    "\t\tlocation = 11586",
    '\t\tdivision_template = "Pesadijska Divizija"',
    "\t}",
  ].join("\n");
  const file = "units = {\n" + YUG + "\n" + YUG.replace(/name_order = 4/, "name_order = 5").replace(/#\t\t/, "\t\t#") + "\n}\n";
  const p = U.parseUnitsFile(file);
  rec("the fixture parses to two divisions", p.units.divisions.length === 2, p.units.divisions.length);
  // ⭐ ASSERT THE FIXTURE HAS THE PROPERTY: one division's comment really is at column 0.
  rec("…and the first one's comment really is at column 0", /\n#\t\tname = /.test(String(p.units.divisions[0]._raw)), JSON.stringify(String(p.units.divisions[0]._raw).slice(0, 80)));
  const d = Object.assign({}, p.units.divisions[0], { _dirty: true, officer: "Petar" });
  const out = U.mergeOob(file, { templates: [], divisions: [d, p.units.divisions[1]] });
  const deepest = Math.max(0, ...out.split("\n").map((l) => (l.match(/^\t*/) || [""])[0].length));
  rec("the edited division is no deeper than it was", deepest <= 3, { deepest, out });
  rec("…and the column-0 comment kept its #", /#\t\tname = "Gardijska/.test(out), out);
  rec("…and the untouched sibling is unchanged", out.includes("name_order = 5"), out);
}

console.log("\n[RUN IT] every division in every order of battle, new vs old");
{
  const ROOTS = [
    ["vanilla", "D:/SteamLibrary/steamapps/common/Hearts of Iron IV"],
    ["Millennium Dawn", "D:/SteamLibrary/steamapps/workshop/content/394360/2777392649"],
    ["Road to 56", "D:/SteamLibrary/steamapps/workshop/content/394360/820260968"],
    ["Old World Blues", "D:/SteamLibrary/steamapps/workshop/content/394360/2265420196"],
    ["Rise of Nations", "D:/SteamLibrary/steamapps/workshop/content/394360/2026448968"],
  ].filter(([, r]) => fs.existsSync(path.join(r, "history", "units")));
  console.log("     corpora found: " + (ROOTS.map((r) => r[0]).join(", ") || "(none)"));

  const r = { divisions: 0, noopDiffers: 0, lostByTheSplice: 0, lostByTheOldPath: 0, unbalanced: 0, extraDiff: 0, reparseFailed: 0, labelsDropped: 0, addFailed: 0, closeMoved: 0, examples: [] };
  const consider = (raw, d) => {
    r.divisions++;
    const src = String(raw).replace(/\r/g, "");
    const noop = U.patchDivisionRaw(src, d, d);
    if (noop != null && noop !== src) { r.noopDiffers++; if (r.examples.length < 5) r.examples.push("noop: " + src.slice(0, 80)); }

    // an ordinary edit: rename
    if (d.name) {
      const ed = Object.assign({}, d, { name: String(d.name) + " X" });
      const after = U.patchDivisionRaw(src, d, ed);
      if (after != null) {
        const gone = commentTexts(src).filter((c) => !commentTexts(after).includes(c));
        if (gone.length) { r.lostByTheSplice += gone.length; if (r.examples.length < 5) r.examples.push("lost: " + gone[0]); }
        if (braceCount(after) !== braceCount(src)) r.unbalanced++;
        // ⭐ COMMENT-AWARE. The first `name = "…"` in these blocks is often a COMMENTED-OUT one
        // (`#name = "Farah Military District"`), and a plain .replace normalised that instead of the live
        // assignment — reporting a difference that was entirely my own.
        if (normaliseName(after) !== normaliseName(src)) { r.extraDiff++; if (r.examples.length < 5) r.examples.push("extra: " + src.slice(0, 80)); }
        let rp; try { rp = U.parseUnitsFile("units = {\n" + after + "\n}\n"); } catch (_) { rp = null; }
        if (!rp || !rp.units.divisions[0] || rp.units.divisions[0].name !== ed.name) r.reparseFailed++;
      }
      // ⭐ BUILT-IN CONTROL: the OLD path is still here, and must lose what the splice keeps. Counted WITH
      // multiplicity — a block that repeats a comment four times and gets one back has lost three.
      r.lostByTheOldPath += multisetLoss(commentTexts(src), commentTexts(U.genDivision(d)));
    }
    // ADDING a statement — a different path from editing one, and the one that orphaned the closing brace
    // at column 0, which then made _reindent flatten the whole block a tab deeper.
    if (d.manpowerFactor == null) {
      const after = U.patchDivisionRaw(src, d, Object.assign({}, d, { manpowerFactor: 0.5 }));
      if (after != null) {
        if (!/start_manpower_factor = 0\.5/.test(after)) { r.addFailed++; if (r.examples.length < 5) r.examples.push("add missing: " + src.slice(0, 80)); }
        if (braceCount(after) !== braceCount(src)) r.unbalanced++;
        const gone = commentTexts(src).filter((c) => !commentTexts(after).includes(c));
        if (gone.length) { r.lostByTheSplice += gone.length; if (r.examples.length < 5) r.examples.push("add lost: " + gone[0]); }
        // the closing brace must keep the indentation it was written with
        const closeWas = (/\n([ \t]*)\}[ \t]*$/.exec(src) || [, null])[1];
        const closeNow = (/\n([ \t]*)\}[ \t]*$/.exec(after) || [, null])[1];
        if (closeWas !== null && closeNow !== closeWas) { r.closeMoved++; if (r.examples.length < 5) r.examples.push("close moved: " + JSON.stringify(closeWas) + " -> " + JSON.stringify(closeNow)); }
        let rp; try { rp = U.parseUnitsFile("units = {\n" + after + "\n}\n"); } catch (_) { rp = null; }
        if (!rp || !rp.units.divisions[0] || Number(rp.units.divisions[0].manpowerFactor) !== 0.5) r.reparseFailed++;
      }
    }

    // a move: the place label is expected to go, nothing else
    if (d.location != null) {
      const after = U.patchDivisionRaw(src, d, Object.assign({}, d, { location: Number(d.location) + 1 }));
      if (after != null) {
        const label = ((/\blocation\s*=\s*\d+[ \t]*(#[^\n]*)/.exec(src) || [])[1] || "").trim().replace(/\s+/g, " ");
        const now = commentTexts(after);
        const gone = commentTexts(src).filter((c) => !now.includes(c));
        if (label && gone.includes(label)) r.labelsDropped++;
        const other = gone.filter((c) => c !== label);
        if (other.length) { r.lostByTheSplice += other.length; if (r.examples.length < 5) r.examples.push("moved lost: " + other[0]); }
      }
    }
  };

  // A fixture stands in when no corpus is installed, so this measures something either way.
  consider(d0._raw, d0);
  for (const [, root] of ROOTS) {
    const dir = path.join(root, "history", "units");
    for (const fname of fs.readdirSync(dir)) {
      if (!fname.endsWith(".txt")) continue;
      let t; try { t = fs.readFileSync(path.join(dir, fname), "utf8"); } catch (_) { continue; }
      let p; try { p = U.parseUnitsFile(t); } catch (_) { continue; }
      for (const d of (p.units && p.units.divisions) || []) if (d && d._raw != null) consider(d._raw, d);
    }
  }
  console.log(`     ${r.divisions} divisions · comments lost by the splice ${r.lostByTheSplice} · by the old rebuild ${r.lostByTheOldPath} · stale place labels dropped ${r.labelsDropped}`);
  rec("the corpus (or at least the fixture) was read", r.divisions >= 1, r.divisions);
  rec("RUN: ⭐ a no-op splice is byte-identical, everywhere", r.noopDiffers === 0, { noopDiffers: r.noopDiffers, examples: r.examples });
  rec("RUN: ⭐ an edit loses no comment", r.lostByTheSplice === 0, { lost: r.lostByTheSplice, examples: r.examples });
  rec("RUN: …and changes nothing but the edited value", r.extraDiff === 0, { extraDiff: r.extraDiff, examples: r.examples });
  rec("RUN: …and never unbalances a block", r.unbalanced === 0, r.unbalanced);
  rec("RUN: ⭐ ADDING a statement writes it", r.addFailed === 0, { addFailed: r.addFailed, examples: r.examples });
  rec("RUN: …and leaves the closing brace where it was", r.closeMoved === 0, { closeMoved: r.closeMoved, examples: r.examples });
  rec("RUN: …and always re-parses to the edited value", r.reparseFailed === 0, r.reparseFailed);
  // ⭐ CONTROL: if the old path lost nothing there is no bug here and the run proves nothing.
  rec("CONTROL: the old rebuild DID lose them", r.lostByTheOldPath >= 5, { lostByTheOldPath: r.lostByTheOldPath });
}

console.log(`\n=== division edit keeps its comments: ${checks} checks, ${fails.length} failed ===`);
if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
