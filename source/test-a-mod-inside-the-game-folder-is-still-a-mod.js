// ⛔ #modhealth-vanilla-substring, A SECOND SITE — NEVER INFER IDENTITY FROM A PATH.
//
// Mod Health skips the base game's own localisation files on purpose: they are read-only, they obviously
// load, and reporting their quirks would cry wolf. `looksLikeVanilla` in mod-index.js decided that with
//
//     /steamapps[\/]common[\/]hearts of iron iv/i.test(root)
//
// against the whole path, unanchored. So:
//
//   D:/…/steamapps/common/Hearts of Iron IV/mod/my_mod   -> matched. A MOD kept inside the game folder
//                                                           silently lost loc_missing_bom, loc_duplicate_key
//                                                           and loc_value_malformed — three rules, no
//                                                           message, nothing in the UI to suggest a whole
//                                                           family of checks had been switched off.
//   D:/Games/HOI4  ·  C:/GOG/Hearts of Iron IV           -> no match. A non-Steam install is not recognised
//                                                           as the game at all.
//
// ⭐ THE SAME MISTAKE ONE LAYER UP IS ALREADY FIXED AND ALREADY TESTED. `test-modhealth-vanilla-detection.js`
// exists because `/vanilla/i.test(mp)` switched the crash checks off for a mod called "Vanilla Plus", and its
// header states the rule outright: *never infer identity from a word appearing somewhere in a path the user
// chose*. This caller never adopted it — the dominant bug shape on this project, which is "the fix already
// exists next door".
//
// hoi4.exe is the decisive marker, and it does not care where the game is installed.
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { buildModIndex } = require("./mod-index.js");

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (detail === undefined ? "" : "   " + (typeof detail === "string" ? detail : JSON.stringify(detail))));
  if (!ok) fails.push(label);
};

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "nova-vanilla-id-"));

// Build a mod at a path that CONTAINS the old substring, the way a modder who keeps mods in the game
// folder would have. No hoi4.exe: it is a mod.
function makeMod(root) {
  fs.mkdirSync(path.join(root, "localisation", "english"), { recursive: true });
  fs.writeFileSync(path.join(root, "descriptor.mod"), 'name="inside the game folder"\n', "utf8");
  // No BOM, and a key defined twice: two loc rules, both certainly true of a mod.
  fs.writeFileSync(path.join(root, "localisation", "english", "x_l_english.yml"),
    "l_english:\n a_key:0 \"One\"\n a_key:0 \"One\"\n", "utf8");
}

try {
  const inGameFolder = path.join(tmp, "SteamLibrary", "steamapps", "common", "Hearts of Iron IV", "mod", "my_mod");
  makeMod(inGameFolder);

  const elsewhere = path.join(tmp, "Documents", "Paradox Interactive", "Hearts of Iron IV", "mod", "my_mod");
  makeMod(elsewhere);

  // The control: the same content, but this root really IS a game install (it has hoi4.exe).
  const fakeGame = path.join(tmp, "Games", "HOI4");
  makeMod(fakeGame);
  fs.writeFileSync(path.join(fakeGame, "hoi4.exe"), "not really an exe", "utf8");

  const locRules = (root) => buildModIndex(root, {}).problems
    .filter((p) => ["loc_missing_bom", "loc_duplicate_key", "loc_value_malformed"].includes(p.rule))
    .map((p) => p.rule);

  console.log("\n-- a mod is a mod, wherever the modder keeps it --");
  const inside = locRules(inGameFolder);
  rec("a mod under …/steamapps/common/Hearts of Iron IV/mod/ still gets its loc rules", inside.length > 0, inside);
  rec("…including the missing BOM", inside.includes("loc_missing_bom"), inside);
  rec("…including the duplicate key", inside.includes("loc_duplicate_key"), inside);

  const outside = locRules(elsewhere);
  rec("a mod in Documents gets exactly the same rules", JSON.stringify(outside.sort()) === JSON.stringify(inside.slice().sort()), { inside, outside });

  console.log("\n-- and the base game is still skipped, wherever IT is installed --");
  const game = locRules(fakeGame);
  rec("a root holding hoi4.exe is treated as the game", game.length === 0, game);
  rec("…even though its path says nothing about Steam", !/steamapps/i.test(fakeGame));
  // #nova-does-not-find-the-game — a NATIVE Linux install (Nova under Wine/Proton) holds run_hoi4 and hoi4, no hoi4.exe
  const linuxGame = path.join(tmp, "Games", "HOI4 Linux");
  makeMod(linuxGame);
  fs.writeFileSync(path.join(linuxGame, "hoi4"), "\u007fELF", "utf8");
  fs.writeFileSync(path.join(linuxGame, "run_hoi4"), "#!/bin/sh\n", "utf8");
  const lgame = locRules(linuxGame);
  rec("…and so is a native Linux install (hoi4 + run_hoi4, no hoi4.exe)", lgame.length === 0, lgame);
  const onlyScript = path.join(tmp, "Documents", "Paradox Interactive", "Hearts of Iron IV", "mod", "has_run_hoi4");
  makeMod(onlyScript);
  fs.writeFileSync(path.join(onlyScript, "run_hoi4"), "#!/bin/sh\n", "utf8");
  rec("control: run_hoi4 alone (every install has it, a Windows one too) does not make a mod the game", locRules(onlyScript).length > 0, locRules(onlyScript));

  console.log("\n-- the identity test does not read the path --");
  const src = fs.readFileSync(path.join(__dirname, "mod-index.js"), "utf8");
  const fn = src.slice(src.indexOf("function looksLikeVanilla"), src.indexOf("function looksLikeVanilla") + 260);
  // The marker moved into one helper every "is this the game's folder?" asks (#nova-does-not-find-the-game): looksLikeVanilla
  // hands its root to isHoi4GameFolder, whose markers are files in the folder — the filesystem, never the string.
  const helperAt = src.indexOf("const HOI4_GAME_MARKERS");
  const helper = helperAt < 0 ? "" : src.slice(helperAt, src.indexOf("\nfunction looksLikeVanilla", helperAt));
  rec("looksLikeVanilla asks the filesystem, not the string", /isHoi4GameFolder\(root\)/.test(fn) && /"hoi4\.exe"/.test(helper) && /existsSync\(join\(String\(dir\), name\)\)/.test(helper), [fn.split("\n")[1], helper.slice(0, 120)]);
  rec("…and no longer matches on a steamapps path", !/steamapps/i.test(fn) && !/steamapps/i.test(helper), fn);
} finally {
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) { /* scratch dir only */ }
}

console.log("\n" + (fails.length ? "FAILED " + fails.length + "/" + checks : "PASSED " + checks + "/" + checks));
process.exitCode = fails.length ? 1 : 0;
