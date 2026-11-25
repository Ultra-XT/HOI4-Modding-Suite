// public/research.js decided "am I looking at the read-only base game?" from the mod selector's DISPLAY
// TEXT. The option text is the mod's own `name` from descriptor.mod, so ANY mod called "Vanilla Plus",
// "Improved Vanilla" or "Beyond Vanilla" was treated as the base game.
//
// ⛔ THE LOAD-BEARING CONSEQUENCE: saveAllChanges refused every research edit with "Cannot save changes
// while 'Vanilla Game Files' is selected. Please select or create a custom mod first." — advice the user has
// already followed, and which nothing they can do will clear, since Nova has no mod-rename.
//
// It compounds at quit. research.js publishes __focusEditorSaveBeforeExit = saveAllChanges, so pressing Save
// in the quit dialog returned false, main.js showed "Save Failed — fix any validation or save errors and try
// exiting again" and kept the window open. Cancel and Don't Save were the only exits: the entire session's
// research work could only be DISCARDED.
//
// ⭐ server.js already publishes the answer and says so in a comment beside it: `isVanilla:true` is the
// AUTHORITATIVE (path-based) flag clients should key off, "NOT a 'vanilla' substring in the name, which
// false-positives on real mods like 'Vanilla Plus' / 'Improved Vanilla'". The rule was written down; this
// file never adopted it.
"use strict";

const fs = require("fs");
const path = require("path");
const { stripJsComments } = require("./testlib-strip-comments.js");

const RESEARCH = stripJsComments(fs.readFileSync(path.join(__dirname, "public", "research.js"), "utf8"));
const SERVER = stripJsComments(fs.readFileSync(path.join(__dirname, "server.js"), "utf8"));

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (detail == null ? "" : "   " + (typeof detail === "string" ? detail : JSON.stringify(detail))));
  if (!ok) fails.push(label);
};

try {
  console.log("1. The server publishes the authoritative flag");
  rec("the vanilla entry carries isVanilla: true", /mods\.unshift\(\{[^}]*isVanilla: true/.test(SERVER));
  // Scoped to the mods LIST. A bare count is wrong: server.js also sets isVanilla on an unrelated `vocab`
  // object, and counting that made this fail on a false premise the first time it ran.
  rec("…and no mod pushed into the list ever gets it",
    !/mods\.push\(\{[^}]*isVanilla: true/.test(SERVER),
    "if a real mod carried the flag, every read-only path would fire on it");

  console.log("\n2. research.js keys off the flag, not the name");
  rec("the option builder uses mod.isVanilla", /mod\.isVanilla === true/.test(RESEARCH));
  rec("…and only falls back to the path for an older server",
    /mod\.isVanilla === undefined && normalizePath\(mod\.path\)/.test(RESEARCH));
  rec("the default-selection lookup uses it too", /data\.mods\.find\(\(m\) => m\.isVanilla === true\)/.test(RESEARCH));

  console.log("\n3. ⛔ The save gate — the one that made the work unrecoverable");
  rec("it reads the dataset flag", /selectedOpt && selectedOpt\.dataset\.vanilla === "1"/.test(RESEARCH));
  rec("…and no longer tests the option TEXT",
    !/selectedOptionText\.toLowerCase\(\)\.includes\("vanilla"\)/.test(RESEARCH),
    "this is what refused to save a mod called Vanilla Plus");

  console.log("\n4. No name-based vanilla test survives anywhere in the file");
  // The whole point: five sites shared one wrong idea. A sweep, not a patch.
  const nameTests = (RESEARCH.match(/\/vanilla\/i\.test\(|includes\("vanilla"\)/g) || []);
  rec("there are none left", nameTests.length === 0, nameTests);

  console.log("\n5. Behaviour, composed over real mod names");
  // The rule as shipped: a mod is vanilla iff the server says so.
  const isVanillaOpt = (mod) => mod.isVanilla === true
    || (mod.isVanilla === undefined && String(mod.path).toLowerCase().replace(/\\/g, "/").includes("steamapps/common/hearts of iron iv"));
  rec("the real base game is vanilla",
    isVanillaOpt({ name: "Hearts of Iron IV (Vanilla Game Files)", path: "D:/SteamLibrary/steamapps/common/Hearts of Iron IV", isVanilla: true }) === true);
  for (const name of ["Vanilla Plus", "Improved Vanilla", "Beyond Vanilla", "vanilla_plus"]) {
    rec(`"${name}" is NOT vanilla`, isVanillaOpt({ name, path: "D:/mods/some_mod", isVanilla: false }) === false,
      "the user's own mod must stay saveable");
  }
  // An older server that sends no flag must still recognise the game by path, or upgrading Nova would make
  // the real base game editable.
  rec("an older server with no flag still detects it by path",
    isVanillaOpt({ name: "whatever", path: "D:/SteamLibrary/steamapps/common/Hearts of Iron IV" }) === true);
  rec("…and does not mistake a mod for it",
    isVanillaOpt({ name: "Vanilla Plus", path: "D:/mods/vanilla_plus" }) === false);

  console.log("\n6. This would have rejected what shipped");
  const OLD = (text) => !text || text.toLowerCase().includes("vanilla");
  rec("the old rule called a real mod vanilla", OLD("Vanilla Plus") === true);
  rec("…where the new rule does not", isVanillaOpt({ name: "Vanilla Plus", path: "D:/mods/vp", isVanilla: false }) === false);
  // And the empty-text case the old rule treated as vanilla: a selector that has not populated yet.
  rec("the old rule also called an EMPTY selection vanilla", OLD("") === true,
    "so a save attempted before the list loaded was refused too");

  console.log(`\n=== a mod named vanilla can still be saved: ${checks} checks, ${fails.length} failed ===`);
  if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
} catch (e) {
  console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
  process.exitCode = 1;
}
