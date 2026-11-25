// #tooltip-key-no-localization — a custom_effect_tooltip whose key has no text behind it.
//
// The effect exists to print a sentence into a tooltip. With no localisation for the key, the player is
// shown the raw id — "nua_marines_tt" sitting in the middle of a focus tooltip where a sentence should be.
//
// It is the sort of slip anyone makes, because the effect and its text live in different files: write one,
// forget the other, and nothing complains. I did it twice while building the demo mod for this campaign,
// and neither the makers nor Mod Health said a word. A tooltip key is not an entity, so the existing
// missing-localisation rule never looked at it.
//
// Measured before building, as the rules here now are: 24 of vanilla's tooltip keys resolve to nothing and
// 42 of Millennium Dawn's — well under a percent of the keys in use, comparable to the unbalanced-braces
// rule, and far from the 5-20% ideas that were dropped during this campaign for crying wolf.
"use strict";
const assert = require("assert");
const fs = require("fs"), os = require("os"), path = require("path");
const mi = require("./mod-index.js");

let pass = 0;
const ok = (n, c, x) => { assert.ok(c, n + (x !== undefined ? " -> " + JSON.stringify(x) : "")); console.log("  ok  " + n); pass++; };
const mk = (p, c) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, c); };
const keysOf = (probs) => probs.filter((p) => p.rule === "tooltip_key_no_localization").map((p) => p.entityId);

// A base game that defines one tooltip key of its own.
const GAME = fs.mkdtempSync(path.join(os.tmpdir(), "nova-tt-game-"));
mk(path.join(GAME, "localisation", "english", "core_l_english.yml"),
  "l_english:\n base_tooltip_key:0 \"Something the base game explains.\"\n");

const focusTree = (rewards) =>
  `focus_tree = {\n\tid = zz_tree\n\tfocus = {\n\t\tid = zz_focus\n\t\tx = 0\n\t\ty = 0\n\t\tcost = 1\n\t\tcompletion_reward = {\n${rewards}\n\t\t}\n\t}\n}\n`;

(() => {
  console.log("=== a tooltip key with no text is reported ===");
  const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-tt-mod-"));
  mk(path.join(mod, "descriptor.mod"), 'name="TtMod"\nsupported_version="1.19.*"\n');
  mk(path.join(mod, "common", "national_focus", "f.txt"),
    focusTree("\t\t\tcustom_effect_tooltip = zz_missing_tt\n\t\t\tcustom_effect_tooltip = zz_present_tt"));
  mk(path.join(mod, "localisation", "english", "zz_l_english.yml"),
    "l_english:\n zz_present_tt:0 \"This one has words.\"\n");

  const r1 = mi.buildModIndex(mod, { vanillaRoot: GAME });
  ok("the key with no text is reported", keysOf(r1.problems).includes("zz_missing_tt"), keysOf(r1.problems));
  ok("…and the key WITH text is not", !keysOf(r1.problems).includes("zz_present_tt"), keysOf(r1.problems));
  const p = r1.problems.find((x) => x.rule === "tooltip_key_no_localization");
  ok("…as a warning, not an error", p.severity === "warning", p.severity);
  ok("…pointing at the file that uses it", /national_focus/.test(p.file), p.file);
  ok("…and saying what the player sees", /raw id/i.test(p.message), p.message);

  console.log("\n=== …and once the text is added ===");
  mk(path.join(mod, "localisation", "english", "zz_l_english.yml"),
    "l_english:\n zz_present_tt:0 \"This one has words.\"\n zz_missing_tt:0 \"Now it has words too.\"\n");
  const r2 = mi.buildModIndex(mod, { vanillaRoot: GAME });
  ok("it is no longer reported", !keysOf(r2.problems).length, keysOf(r2.problems));

  console.log("\n=== text from the base game or a parent mod counts ===");
  const mod2 = fs.mkdtempSync(path.join(os.tmpdir(), "nova-tt-inherit-"));
  mk(path.join(mod2, "descriptor.mod"), 'name="TtInherit"\nsupported_version="1.19.*"\n');
  mk(path.join(mod2, "common", "national_focus", "f.txt"),
    focusTree("\t\t\tcustom_effect_tooltip = base_tooltip_key\n\t\t\tcustom_effect_tooltip = parent_tooltip_key"));
  const DEP = fs.mkdtempSync(path.join(os.tmpdir(), "nova-tt-dep-"));
  mk(path.join(DEP, "localisation", "english", "p_l_english.yml"),
    "l_english:\n parent_tooltip_key:0 \"The parent mod explains this.\"\n");

  const r3 = mi.buildModIndex(mod2, { vanillaRoot: GAME, dependencyRoots: [DEP] });
  ok("a key the base game defines is not reported", !keysOf(r3.problems).includes("base_tooltip_key"), keysOf(r3.problems));
  ok("…nor one a parent mod defines", !keysOf(r3.problems).includes("parent_tooltip_key"), keysOf(r3.problems));
  const r4 = mi.buildModIndex(mod2, { vanillaRoot: GAME, dependencyRoots: [] });
  ok("…but with no parent supplying it, it IS reported", keysOf(r4.problems).includes("parent_tooltip_key"), keysOf(r4.problems));

  console.log("\n=== a commented-out tooltip is not a reference ===");
  const mod3 = fs.mkdtempSync(path.join(os.tmpdir(), "nova-tt-comment-"));
  mk(path.join(mod3, "descriptor.mod"), 'name="TtComment"\nsupported_version="1.19.*"\n');
  mk(path.join(mod3, "common", "national_focus", "f.txt"),
    focusTree("\t\t\t# custom_effect_tooltip = zz_commented_tt"));
  const r5 = mi.buildModIndex(mod3, { vanillaRoot: GAME });
  ok("a commented tooltip raises nothing", !keysOf(r5.problems).includes("zz_commented_tt"), keysOf(r5.problems));

  console.log("\n=== one missing key used twice is reported once ===");
  const mod4 = fs.mkdtempSync(path.join(os.tmpdir(), "nova-tt-dup-"));
  mk(path.join(mod4, "descriptor.mod"), 'name="TtDup"\nsupported_version="1.19.*"\n');
  mk(path.join(mod4, "common", "national_focus", "f.txt"),
    focusTree("\t\t\tcustom_effect_tooltip = zz_dup_tt"));
  mk(path.join(mod4, "events", "e.txt"),
    "add_namespace = zz\ncountry_event = {\n\tid = zz.1\n\ttitle = zz.1.t\n\tis_triggered_only = yes\n\toption = { name = zz.1.a custom_effect_tooltip = zz_dup_tt }\n}\n");
  const r6 = mi.buildModIndex(mod4, { vanillaRoot: GAME });
  ok("…not once per use", keysOf(r6.problems).filter((k) => k === "zz_dup_tt").length === 1, keysOf(r6.problems));

  console.log("\n=== a quoted tooltip no key can be is text; a quoted one that can be a key is still a key ===");
  // #a-quoted-tooltip-is-text — Novum Vexillum heads its vote results with custom_effect_tooltip = "Yes:". No
  // localisation line can hold a key with a ":", so the game's lookup always misses and it prints the text as written.
  // A quoted value that CAN be a key is looked up like any other, so it is not text by being quoted.
  const mod5 = fs.mkdtempSync(path.join(os.tmpdir(), "nova-tt-literal-"));
  mk(path.join(mod5, "descriptor.mod"), 'name="TtLiteral"\nsupported_version="1.19.*"\n');
  mk(path.join(mod5, "events", "e.txt"),
    "add_namespace = zz\nnews_event = {\n\tid = zz.2\n\ttitle = \"Results are in!\"\n\tis_triggered_only = yes\n\timmediate = {\n"
    + "\t\tcustom_effect_tooltip = \"Yes:\"\n\t\tcustom_effect_tooltip = \"Two words\"\n\t\tcustom_effect_tooltip = \"zz_quoted_tt\"\n"
    + "\t}\n\toption = { name = \"Okay.\" }\n}\n");
  const r7 = mi.buildModIndex(mod5, { vanillaRoot: GAME });
  ok("a quoted text no localisation line can hold is not reported", !keysOf(r7.problems).some((k) => k === "Yes:" || /^Two\b/.test(k)), keysOf(r7.problems));
  ok("…but a quoted value that can be a key still is", keysOf(r7.problems).includes("zz_quoted_tt"), keysOf(r7.problems));

  [GAME, DEP, mod, mod2, mod3, mod4, mod5].forEach((d) => { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} });
  console.log("\ntest-tooltip-key-localization: " + pass + " checks passed");
})();
