// ⛔ #cross-file-duplicate-keys-were-invisible — AND THE RULE WAS THE WRONG WAY ROUND.
//
// Nova reported a localisation key duplicated WITHIN one file and said nothing about the same key appearing
// in TWO files. That is backwards. Within a file HOI4 keeps the last occurrence, deterministically, so the
// author can be told exactly what happens. Between two files of the same language the wiki is explicit that
// there is no rule to lean on: "The value that'll get chosen does not seem to have a consistent pattern, but
// seems to prioritise base game files" — and between two files of a MOD there is no tiebreak at all.
//
// What it costs a player: Millennium Dawn's naval panel reads "Sub Visibility" or "Sub Stealth" depending
// which of two replace/ files wins; Rise of Nations shows Canada as "British North America" or
// "$OVERLORDADJ$ Canada". A modder who cleaned every duplicate Nova used to show them still shipped these.
//
// Found by a known-answer fault-injection test — four cross-file duplicates were injected and none reported.
// Nova's own test-map-rename-in-place.js had noted the gap in passing and nothing was done with it.
//
// Three filters, each measured over the base game and all 10 installed workshop mods:
//   · group by the FILENAME's language, or every foo_l_english/foo_l_french pair collides on every key
//   · skip copies that straddle replace/ and non-replace/ — the documented override, i.e. working as intended
//   · skip byte-identical copies — whichever wins, the player sees the same string
// Result: 329 findings across 6 mods, and VANILLA REPORTS ZERO across its 2,073 localisation files.
//
// Emitted one finding per FILE PAIR, not per key: per key would be 1,565 cards with 1,245 on one mod, which
// is true and unactionable at volume. It is deliberately NOT in the deterministic fix tier — which copy
// survives is the author's call, exactly like duplicate_id.
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { buildModIndex } = require("./mod-index.js");

let pass = 0, fail = 0;
const ok = (c, m, x) => {
  if (c) { pass++; console.log("  ok   " + m); }
  else { fail++; console.log("  FAIL " + m + (x !== undefined ? "   -> " + JSON.stringify(x).slice(0, 260) : "")); }
};
const roots = [];
const mk = (files) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "nova-xdup-"));
  roots.push(root);
  for (const [rel, body] of Object.entries(files)) {
    const p = path.join(root, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, "\uFEFF" + body, "utf8");
  }
  return root;
};
const GAME = mk({ "localisation/english/v_l_english.yml": "l_english:\n VKEY: \"v\"\n" });
const cross = (root) => (buildModIndex(root, { vanillaRoot: GAME }).problems || [])
  .filter((p) => p.rule === "loc_duplicate_key_across_files");
const same = (root) => (buildModIndex(root, { vanillaRoot: GAME }).problems || [])
  .filter((p) => p.rule === "loc_duplicate_key");

try {
  console.log("\n-- the same key with DIFFERENT text in two files --");
  {
    const root = mk({
      "localisation/english/a_l_english.yml": 'l_english:\n SHARED: "Coastal Forts"\n SHARED_desc: "Concrete."\n ONLY_A: "a"\n',
      "localisation/english/b_l_english.yml": 'l_english:\n SHARED: "Coastal Fortifications"\n SHARED_desc: "Concrete and steel."\n ONLY_B: "b"\n',
    });
    const p = cross(root);
    ok(p.length === 1, "ONE finding per file pair, not one per key", p.length);
    ok(p[0] && p[0].copies === 2, "…covering both conflicting keys", p[0] && p[0].copies);
    ok(p[0] && p[0].files && p[0].files.length === 2, "…and naming both files", p[0] && p[0].files);
    ok(p[0] && /no defined winner/i.test(p[0].message), "…saying the winner is undefined", p[0] && p[0].message.slice(0, 90));
    ok(p[0] && !/keeps only the last/i.test(p[0].message), "…and NOT claiming HOI4 keeps the last, which is the other rule's promise");
  }

  console.log("\n-- a key can collide across THREE files, and the message must name them all --");
  {
    // The message used files[0] and files[1] regardless of how many there were, so a user would fix the two
    // they were shown and ship the third still conflicting.
    const root = mk({
      "localisation/english/a_l_english.yml": 'l_english:\n SHARED: "one"\n',
      "localisation/english/b_l_english.yml": 'l_english:\n SHARED: "two"\n',
      "localisation/english/c_l_english.yml": 'l_english:\n SHARED: "three"\n',
    });
    const p = cross(root);
    ok(p.length === 1, "still one finding for the group", p.length);
    ok(p[0] && p[0].files.length === 3, "…listing all three files", p[0] && p[0].files);
    const named = (p[0].message.match(/"[^"]+\.yml"/g) || []).length;
    ok(named === 3, "…and the MESSAGE names all three, not just two", { named, message: p[0].message.slice(0, 150) });
  }

  console.log("\n-- byte-identical copies are harmless whichever file wins --");
  {
    const root = mk({
      "localisation/english/a_l_english.yml": 'l_english:\n SHARED: "Border Militia"\n',
      "localisation/english/b_l_english.yml": 'l_english:\n SHARED: "Border Militia"\n',
    });
    ok(cross(root).length === 0, "identical text across two files is not reported", cross(root).map((x) => x.keys));
  }

  console.log("\n-- replace/ is the documented override, not a mistake --");
  {
    const root = mk({
      "localisation/english/base_l_english.yml": 'l_english:\n SHARED: "from base"\n',
      "localisation/english/replace/over_l_english.yml": 'l_english:\n SHARED: "from replace"\n',
    });
    ok(cross(root).length === 0, "a replace/ copy overriding a normal one is not reported", cross(root).map((x) => x.keys));
  }

  console.log("\n-- …but two copies BOTH inside replace/ have no tiebreak --");
  {
    // This is where Millennium Dawn's real conflicts live: two files in the same replace/ tier.
    const root = mk({
      "localisation/english/replace/one_l_english.yml": 'l_english:\n STAT_X: "Sub Visibility: "\n',
      "localisation/english/replace/two_l_english.yml": 'l_english:\n STAT_X: "Sub Stealth: "\n',
    });
    const p = cross(root);
    ok(p.length === 1, "two files in the same replace/ tier ARE reported", p.map((x) => x.keys));
  }

  console.log("\n-- a different language is a different namespace --");
  {
    const root = mk({
      "localisation/english/a_l_english.yml": 'l_english:\n SHARED: "Forts"\n',
      "localisation/french/a_l_french.yml": 'l_french:\n SHARED: "Forts francais"\n',
    });
    ok(cross(root).length === 0, "the same key in english and french is not a conflict", cross(root).map((x) => x.keys));
  }

  console.log("\n-- the same-file rule is untouched and stays separate --");
  {
    const root = mk({
      "localisation/english/a_l_english.yml": 'l_english:\n DUP: "one"\n OTHER: "x"\n DUP: "two"\n',
    });
    ok(same(root).length === 1, "a same-file duplicate is still reported by loc_duplicate_key", same(root).length);
    ok(cross(root).length === 0, "…and is NOT double-reported as a cross-file one", cross(root).length);
  }

  console.log("\n-- the base game must stay silent: it is the cry-wolf control --");
  {
    const V = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
    if (!fs.existsSync(path.join(V, "hoi4.exe"))) {
      console.log("  ..   skipped: the game is not installed at the expected path");
    } else {
      const n = (buildModIndex(V, { vanillaRoot: null }).problems || [])
        .filter((p) => p.rule === "loc_duplicate_key_across_files").length;
      ok(n === 0, "vanilla reports no cross-file duplicates at all", n);
    }
  }

  console.log("\n-- and it must never be offered as an automatic fix --");
  {
    const src = fs.readFileSync(path.join(__dirname, "public", "modhealth.js"), "utf8");
    const blk = src.slice(src.indexOf("const DETERMINISTIC_FIXES = {"));
    const tier = blk.slice(blk.indexOf("{"), blk.indexOf("\n  };") + 4);
    ok(!/loc_duplicate_key_across_files/.test(tier),
      "the rule is absent from the deterministic tier — which copy survives is the author's call");
    ok(/loc_duplicate_key_across_files/.test(src), "…but the UI does have a label and help text for it");
  }
} catch (e) {
  ok(false, "threw: " + e.message + "\n" + e.stack);
} finally {
  for (const r of roots) { try { fs.rmSync(r, { recursive: true, force: true }); } catch (_) { /* scratch only */ } }
}

console.log("\n" + (fail ? "FAILED " + fail + "/" + (pass + fail) : "PASSED " + pass + "/" + pass));
process.exitCode = fail ? 1 : 0;
