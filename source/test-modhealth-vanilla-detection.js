// #modhealth-vanilla-substring — A MOD CALLED "VANILLA PLUS" HAD ITS CRASH CHECKS SWITCHED OFF.
//
// Mod Health's "Will it crash?" panel skips the vanilla game files on purpose — they are read-only and
// obviously load, so reporting their quirks as crashes would cry wolf. It decided what counted as vanilla
// with `/vanilla/i.test(mp)`: a substring test against the whole mod PATH.
//
// Nova builds a mod's folder from its name (slugifyModName: "Vanilla Plus" -> vanilla_plus), and "…Vanilla"
// is one of the commonest things a HOI4 mod is called — Vanilla Plus, Improved Vanilla, Beyond Vanilla. A
// parent folder containing the word was enough on its own. For any of them the one panel whose job is to
// catch a crash BEFORE it ships quietly stopped running, and explained itself in a way that sounded
// deliberate: "You're viewing the vanilla game files (read-only), which already load fine."
//
// Verified in the running UI: with the old code a mod at …/mods/vanilla_plus containing a state that has
// buildings but no provinces (a real load-stopper) reported the vanilla message and found nothing. With the
// fix it reports "⛔ Will it crash? — yes" and names the state.
//
// THE RULE: ask which root is the game. The server knows — /api/root reports hoi4GameRoot, and the scan
// response modhealth.js already reads carries the same answer as data.isVanilla. Never infer identity from
// a word appearing somewhere in a path the user chose.
"use strict";
const fs = require("fs");
const path = require("path");
const { stripJsComments } = require("./testlib-strip-comments.js");

const fails = [];
let checks = 0;
function rec(label, cond, detail) {
  checks++;
  if (cond) console.log("  ok   " + label);
  else {
    fails.push(label);
    console.log("  FAIL " + label + "  -> " + String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 300));
  }
}

const SRC = fs.readFileSync(path.join(__dirname, "public", "modhealth-crashcheck.js"), "utf8");
// ⭐ Strip comments before any "is this pattern gone?" check. The fix's own explanation quotes the exact
// expression it removed — grepping the raw file finds the SENTENCE and reports the bug as still present.
const CODE = stripJsComments(SRC);

console.log("\n[the rule] identity comes from the server, not from the path text");
{
  // The substring test must be gone outright — not merely narrowed.
  rec("no /vanilla/ substring test on the mod path", !/\/vanilla\/i\.test\(/.test(CODE), "the substring test is back");
  rec("the real game root is fetched", /hoi4GameRoot/.test(SRC), "does not ask /api/root");
  rec("…and compared as a path", /samePath\(/.test(SRC), "no path comparison");
  // The install-path shape survives only as a fallback for when /api/root cannot answer.
  rec("the install-path shape remains as a fallback", /steamapps/i.test(SRC), "fallback removed");
}

console.log("\n[the decision] run it against real mod paths");
{
  // Lift the shipped helpers and drive them, rather than restating the logic here.
  const lift = (name) => {
    const m = SRC.match(new RegExp(`(?:const|async function|function)\\s+${name}[\\s\\S]*?\\n  \\}`, ""));
    return m ? m[0] : null;
  };
  const sameSrc = (SRC.match(/const samePath = [\s\S]*?\n  \};/) || [])[0];
  rec("samePath is liftable", !!sameSrc, "not found");
  if (sameSrc) {
    const samePath = new Function(`${sameSrc}; return samePath;`)();
    const GAME = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";

    // THE BUG: every one of these is a user's own mod and must NOT be treated as the game.
    for (const p of [
      "C:/mods/vanilla_plus",
      "C:/mods/improved_vanilla",
      "C:/mods/beyond_vanilla_2",
      "C:/Users/me/Documents/vanilla-overhaul/my_mod",
    ]) {
      rec(`a user mod at ${p.split("/").pop()} is not the game`, samePath(p, GAME) === false, p);
    }

    // …and the real game root still is, however it is written.
    rec("the game root itself matches", samePath(GAME, GAME) === true, "did not match itself");
    rec("…with a trailing separator", samePath(GAME + "/", GAME) === true, "trailing slash broke it");
    rec("…with backslashes", samePath(GAME.replace(/\//g, "\\"), GAME) === true, "backslashes broke it");
    rec("…case-insensitively", samePath(GAME.toUpperCase(), GAME) === true, "case broke it");
    // CONTROL: an empty path must not match anything, or a page with no mod selected would be "vanilla".
    rec("an empty path matches nothing", samePath("", GAME) === false, "empty matched");
  }
}

console.log("\n[CONTROL] the main page still takes its answer from the server");
{
  // modhealth.js reads data.isVanilla off the scan response — authoritative, and the reason this bug was
  // confined to the crash panel. If that ever becomes a local guess too, this fails.
  const MH = stripJsComments(fs.readFileSync(path.join(__dirname, "public", "modhealth.js"), "utf8"));
  rec("modhealth.js uses the server's isVanilla", /data\.isVanilla/.test(MH), "no longer server-driven");
  rec("…and does not pattern-match the word itself", !/\/vanilla\/i\.test\(/.test(MH), "it now guesses too");
  // The same mistake in a milder place: choosing the DEFAULT mod when none is selected. It matched the
  // word against the entry's NAME, so a user's "Vanilla Plus" could be picked as the default instead of
  // the game. The list entries carry an authoritative flag; use it.
  rec("…and picks the default mod by the server's flag", /find\(\(m\) => m\.isVanilla\)/.test(MH), "still matches the name");
}

console.log(`\n=== modhealth vanilla detection: ${checks} checks, ${fails.length} failed ===`);
if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
