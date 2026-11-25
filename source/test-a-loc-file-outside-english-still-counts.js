// ⛔ #loc-scan-only-looked-in-english — MOD HEALTH COULD NOT SEE A WHOLE MOD'S LOCALISATION.
//
// scanLocalization started its walk at localisation/english/. HOI4 does not care: the wiki says
// localisation lives "within the /Hearts of Iron IV/localisation/ folder, in which any sub-folder can be
// used", and plenty of mods drop their .yml straight into localisation/. For those mods Nova saw ZERO keys.
// Measured over the installed corpus: 7,645 english keys across 3 mods invisible, one of them a 3,315-key
// mod whose localisation Nova could not see at all.
//
// The result was not merely noisy findings. The deterministic auto-fix then wrote a PLACEHOLDER over
// authored text: TPT_GUARANTEE reads "§HGuarantee§!" in _tpt_l_english.yml, and one "Fix all" click added
// `TPT_GUARANTEE:0 "TPT GUARANTEE"` to a second file. Localisation keys MERGE, so which one the player sees
// is not something the modder chose. And because the rule never stopped firing, "Fix all" reported 31 fixes,
// wrote nothing at all on the next click, and offered the same 31 for ever — a fix tier that cannot converge.
//
// The other half of the wiki's rule is the one that costs something: "The filename has to contain the
// language's internal name as the file will not be loaded otherwise." So the LANGUAGE comes from the
// filename, not the folder. 11 files in the corpus sit inside localisation/english/ with a correct
// `l_english:` header and a name the game rejects — RON_Bhutan_I_english.yml has a capital I where the l
// should be, and _Non_Aligned_Political_l_english.yml.yml has two extensions. Their 750 keys DO NOT LOAD in
// game. Counting them as present was a false negative; reporting those entities as unlocalised is the rule
// getting it right, not a regression.
//
// Corpus effect, measured by backing the change out: 122 -> 7 missing_localization on one mod, 29 -> 17
// tooltip findings on another, and the 31 unfixable phantoms gone from a third.
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { scanLocalization } = require("./mod-index.js");

let pass = 0, fail = 0;
const ok = (c, m, x) => {
  if (c) { pass++; console.log("  ok   " + m); }
  else { fail++; console.log("  FAIL " + m + (x !== undefined ? "   -> " + JSON.stringify(x) : "")); }
};
const roots = [];
const mk = (files) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "nova-locdir-"));
  roots.push(root);
  for (const [rel, body] of Object.entries(files)) {
    const p = path.join(root, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, "﻿" + body, "utf8");
  }
  return root;
};
const YML = (lang, lines) => `l_${lang}:\n` + lines.map((l) => " " + l).join("\n") + "\n";

try {
  console.log("\n-- a .yml sitting directly in localisation/ is real localisation --");
  {
    const root = mk({ "localisation/toolpack_l_english.yml": YML("english", ['TPT_GUARANTEE:0 "§HGuarantee§!"']) });
    const names = scanLocalization(root);
    ok(names.TPT_GUARANTEE !== undefined, "the key is found without an english/ subfolder", Object.keys(names));
    ok(names.TPT_GUARANTEE === "§HGuarantee§!", "…with its authored text, not a placeholder", names.TPT_GUARANTEE);
  }

  console.log("\n-- any sub-folder, at any depth --");
  {
    const root = mk({
      "localisation/english/a_l_english.yml": YML("english", ['KEY_A:0 "A"']),
      "localisation/deep/nested/b_l_english.yml": YML("english", ['KEY_B:0 "B"']),
      "localization/american_l_english.yml": YML("english", ['KEY_C:0 "C"']),
    });
    const names = scanLocalization(root);
    ok(names.KEY_A === "A", "localisation/english/ still works", names.KEY_A);
    ok(names.KEY_B === "B", "a nested sub-folder is read", names.KEY_B);
    ok(names.KEY_C === "C", "the American spelling of the folder is read", names.KEY_C);
  }

  console.log("\n-- the language comes from the FILENAME, which is the game's own test --");
  {
    // The wiki: "The filename has to contain the language's internal name as the file will not be loaded
    // otherwise." All three of these carry a correct l_english: header and are still not loaded by HOI4.
    const root = mk({
      "localisation/english/good_l_english.yml": YML("english", ['REAL_KEY:0 "yes"']),
      "localisation/english/pandemics.yml": YML("english", ['NO_SUFFIX:0 "no"']),
      "localisation/english/RON_Bhutan_I_english.yml": YML("english", ['CAPITAL_I:0 "no"']),
      "localisation/french_l_french.yml": YML("french", ['FRENCH_ONLY:0 "non"']),
    });
    const names = scanLocalization(root);
    ok(names.REAL_KEY === "yes", "a properly named file is read", names.REAL_KEY);
    ok(names.NO_SUFFIX === undefined, "a file with no _l_english suffix is NOT read — the game won't load it", names.NO_SUFFIX);
    ok(names.CAPITAL_I === undefined, "…nor one whose suffix is _I_english with a capital i", names.CAPITAL_I);
    ok(names.FRENCH_ONLY === undefined, "a French file does not make a key count as English localisation", names.FRENCH_ONLY);
  }

  console.log("\n-- replace/ still wins, and it nests inside the language folder --");
  {
    // localisation/english/replace/, not localisation/replace/english/ — the wiki is explicit, and the
    // walk must reach it at any depth.
    const root = mk({
      "localisation/english/base_l_english.yml": YML("english", ['SHARED:0 "from base"']),
      "localisation/english/replace/over_l_english.yml": YML("english", ['SHARED:0 "from replace"']),
    });
    const names = scanLocalization(root);
    ok(names.SHARED === "from replace", "a replace/ file overrides one outside it", names.SHARED);
  }

  console.log("\n-- and the flat layout gets replace/ too --");
  {
    const root = mk({
      "localisation/base_l_english.yml": YML("english", ['SHARED:0 "from base"']),
      "localisation/replace/over_l_english.yml": YML("english", ['SHARED:0 "from replace"']),
    });
    const names = scanLocalization(root);
    ok(names.SHARED === "from replace", "…wherever the replace folder sits", names.SHARED);
  }
} catch (e) {
  ok(false, "threw: " + e.message + "\n" + e.stack);
} finally {
  for (const r of roots) { try { fs.rmSync(r, { recursive: true, force: true }); } catch (_) { /* scratch only */ } }
}

console.log("\n" + (fail ? "FAILED " + fail + "/" + (pass + fail) : "PASSED " + pass + "/" + pass));
process.exitCode = fail ? 1 : 0;
