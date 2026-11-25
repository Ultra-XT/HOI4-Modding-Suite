// #file-unbalanced-braces — Mod Health said nothing about a file the makers cannot read.
//
// A single unclosed `{` USED TO make a whole script file unreadable, so every item in it disappeared from
// the editor. Open Research and the techs were simply not there; open National Spirits and the spirits were
// gone. The makers themselves behaved correctly — each one REFUSES the save and leaves the file
// byte-for-byte alone, which is the outcome that actually matters — but nothing told the modder why their
// content had vanished. This rule is the missing half.
//
// ⚠️ THE READING HALF IS NOW FIXED (#ideas-file-missing-its-last-brace, 2026-09-03): four readers close an
// unclosed block at end of file the way Clausewitz does, so the content usually IS still visible. The rule
// stays, because the WRITE path still refuses — a modder who cannot save is exactly who needs telling — but
// its message had to stop claiming the content is gone. See #brace-message-outlived-its-own-fix below.
//
// It earns its place on measurement: 13 of vanilla's 4269 script files are brace-unbalanced (0.3%) and 1 of
// Millennium Dawn's 5586. Rare enough to be signal rather than noise — unlike three other rules considered
// during this campaign, which fired on 5-20% of shipping content and were dropped.
//
// Scoped to the ACTIVE MOD's own files, exactly like the map and buildings rules: vanilla's thirteen are not
// the modder's to fix and the shipping game plays fine with them, so reporting them would be the cry-wolf
// this campaign has spent several commits removing.
//
// It found real corruption the first time it was run against a real mod — two colour blocks with no
// `TAG = {` opener in a mod's common/countries/colors.txt, left by an older version of the tool.
"use strict";
const assert = require("assert");
const fs = require("fs"), os = require("os"), path = require("path");
const mi = require("./mod-index.js");

let pass = 0;
const ok = (n, c, x) => { assert.ok(c, n + (x !== undefined ? " -> " + JSON.stringify(x) : "")); console.log("  ok  " + n); pass++; };
const mk = (p, c) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, c); };
const badOf = (probs) => probs.filter((p) => p.rule === "file_unbalanced_braces").map((p) => p.entityId);

const GAME = fs.mkdtempSync(path.join(os.tmpdir(), "nova-unbal-game-"));
// The base game ships a few unbalanced files of its own — that is the whole reason for the scoping.
mk(path.join(GAME, "common", "ideas", "switzerland_like.txt"), "ideas = {\n\tcountry = {\n\t\tzz_v = {\n\t\t}\n\t}\n}\n}\n");

(() => {
  console.log("=== the mod's own unbalanced file is reported ===");
  const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-unbal-mod-"));
  mk(path.join(mod, "descriptor.mod"), 'name="UnbalMod"\nsupported_version="1.19.*"\n');
  mk(path.join(mod, "common", "ideas", "ok.txt"), "ideas = {\n\tcountry = {\n\t\tzz_a = {\n\t\t\tremoval_cost = -1\n\t\t}\n\t}\n}\n");
  mk(path.join(mod, "common", "ideas", "broken.txt"), "ideas = {\n\tcountry = {\n\t\tzz_b = {\n\t\t\tremoval_cost = -1\n\t}\n}\n");

  const r1 = mi.buildModIndex(mod, { vanillaRoot: GAME });
  ok("the unbalanced file is reported", badOf(r1.problems).includes("common/ideas/broken.txt"), badOf(r1.problems));
  ok("…and the well-formed one is not", !badOf(r1.problems).includes("common/ideas/ok.txt"), badOf(r1.problems));
  const p = r1.problems.find((x) => x.rule === "file_unbalanced_braces");
  ok("…as a warning, not an error", p.severity === "warning", p.severity);
  ok("…saying how many blocks are unclosed", /leaves 1 block unclosed/.test(p.message), p.message);
  // #brace-message-outlived-its-own-fix — this asserted "missing from the makers", which was true when the
  // rule was written and stopped being true the day four readers learned to close an unclosed block at EOF
  // the way Clausewitz does. Measured on a scratch mod one `}` short: the spirit IS in the catalogue.
  // What is still true is the half nobody was told — the WRITE path refuses — and Nova's own save error
  // already words it correctly, so the panel was contradicting the rest of the app.
  ok("…and does NOT claim the content is missing from the makers",
    !/can't read this file|missing from the makers/i.test(p.message), p.message);
  ok("…but does warn that it cannot be SAVED into, which is what is still true",
    /will NOT save into this file|cannot be edited|nothing in it can be edited/i.test(p.message), p.message);

  console.log("\n=== the BASE GAME's own unbalanced files are not the mod's problem ===");
  ok("nothing from the base game is reported against the mod",
    !badOf(r1.problems).some((f) => /switzerland_like/.test(f)), badOf(r1.problems));

  console.log("\n=== a stray closing brace is reported the other way round ===");
  const mod2 = fs.mkdtempSync(path.join(os.tmpdir(), "nova-unbal-extra-"));
  mk(path.join(mod2, "descriptor.mod"), 'name="ExtraBrace"\nsupported_version="1.19.*"\n');
  mk(path.join(mod2, "common", "ideas", "extra.txt"), "ideas = {\n\tcountry = {\n\t}\n}\n}\n");
  const r2 = mi.buildModIndex(mod2, { vanillaRoot: GAME });
  const p2 = r2.problems.find((x) => x.rule === "file_unbalanced_braces");
  ok("the stray closer is reported", !!p2, badOf(r2.problems));
  ok("…and described as a closer with nothing open", /closing brace with nothing open/i.test(p2.message), p2.message);

  console.log("\n=== braces inside comments and strings do not count ===");
  // A `#` comment mentioning a brace, or a quoted name containing one, must not create a phantom report —
  // this is the shape that would make the rule fire on innocent files.
  const mod3 = fs.mkdtempSync(path.join(os.tmpdir(), "nova-unbal-quoted-"));
  mk(path.join(mod3, "descriptor.mod"), 'name="Quoted"\nsupported_version="1.19.*"\n');
  mk(path.join(mod3, "common", "ideas", "quoted.txt"),
    'ideas = {\n\tcountry = {\n\t\tzz_q = {\n\t\t\tpicture = "odd{name"   # a trailing } in a comment\n\t\t}\n\t}\n}\n');
  const r3 = mi.buildModIndex(mod3, { vanillaRoot: GAME });
  ok("a brace in a quoted string is ignored", !badOf(r3.problems).length, badOf(r3.problems));

  console.log("\n=== the real shape this found in the wild ===");
  // Two colour blocks with no `TAG = {` opener, left in a mod's colors.txt by an older version of the tool.
  const mod4 = fs.mkdtempSync(path.join(os.tmpdir(), "nova-unbal-colors-"));
  mk(path.join(mod4, "descriptor.mod"), 'name="Colors"\nsupported_version="1.19.*"\n');
  mk(path.join(mod4, "common", "countries", "colors.txt"),
    "#reload countrycolors\n\nGER = {\n\tcolor = rgb { 1 2 3 }\n}\n\n\tcolor = rgb { 59 125 216 }\n\tcolor_ui = rgb { 59 125 216 }\n}\n");
  const r4 = mi.buildModIndex(mod4, { vanillaRoot: GAME });
  ok("an orphaned colour block is caught", badOf(r4.problems).includes("common/countries/colors.txt"), badOf(r4.problems));

  // #help-text-contradicted-its-own-finding — the panel's explanation of this rule said a whole file becomes
  // unreadable and everything in it disappears from the makers. That stopped being true when the readers
  // learned to close an open block at end of file, the way Clausewitz does, so the help sat one line above a
  // finding that said the opposite. A user reading both cannot tell which to believe.
  //
  // The rule distinguishes two shapes, so the help has to as well: a MISSING brace is usually recoverable
  // (with the mid-file caveat), a STRAY "}" is not and blocks saving.
  {
    const help = fs.readFileSync(path.join(__dirname, "public", "modhealth.js"), "utf8");
    // The rule id appears twice — once in the short RULE_LABEL map ("files that will not parse") and once
    // in the help map. Take the LONGEST match so this reads the explanation, not the chip caption.
    const entry = [...help.matchAll(/file_unbalanced_braces:\s*"((?:[^"\\]|\\.)*)"/g)]
      .map((m) => m[1]).sort((a, b) => b.length - a.length)[0] || "";
    ok("the panel has help text for the rule", entry.length > 80, entry.slice(0, 60));
    ok("…it does not still claim the whole file becomes unreadable",
      !/whole script file unreadable/i.test(entry), entry.slice(0, 120));
    ok("…it tells the two shapes apart", /missing/i.test(entry) && /stray|extra/i.test(entry), entry.slice(0, 140));
    ok("…and it keeps the mid-file caveat, which is the case that really loses content",
      /middle/i.test(entry), entry.slice(0, 160));
  }

  [GAME, mod, mod2, mod3, mod4].forEach((d) => { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} });
  console.log("\ntest-unbalanced-mod-file-rule: " + pass + " checks passed");
})();
