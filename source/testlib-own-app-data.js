// ⛔ #a-test-that-chooses-a-game-keeps-it-to-itself — A TEST WHOSE OWN SERVER IS TOLD ABOUT THE GAME FOLDER KEEPS ITS APP DATA TO ITSELF.
//
// server.js keeps the modder's Game folder choice in Nova's app data (GAME_FOLDER_CHOICE_FILE, beside active-mod.json), reads it
// once as it loads, and ranks it above HOI4_ROOT for as long as the folder holds the game. run-tests.js hands every file of a run
// ONE app-data folder. So a choice saved through a test's own server stood in front of every other file of the run:
//   • a file whose server.js loaded while that test's fixture still held the game read the FIXTURE as the base game, in place of
//     the HOI4_ROOT it had set (81 files take their game from HOI4_ROOT that way) — and passed when run again alone;
//   • test-a-network-game-folder-is-refused-without-touching-it.js holds that nothing was chosen or saved, and failed in the suite
//     of 2026-11-04 (cec97a35, the game-folder merge) after files that had saved one — or cleared one, which leaves the file too.
//     Run twice in the same app data it failed on its own control's save.
//
// Loaded FIRST — before safe-write.js, which decides NOVA_APP_DATA_DIR once, as it loads — this gives the process an app-data
// folder of its own in temp, and takes it away when the process exits. Only the app data moves: NOVA_HOME_DIR, HOI4_USER_DIR,
// NOVA_DOCUMENTS_DIR and the mods root stay the run's, and run bare, safe-write.js's guard fills those in around it
// (#a-sandboxed-app-data-gets-the-rest-of-a-sandbox). test-a-test-that-chooses-a-game-keeps-it-to-itself.js finds every test whose
// own server is told about the Game folder and holds each one to loading this first, at the top of the file.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

for (const m of ["./safe-write.js", "./server.js", "./map-data.js"]) {
  let id = "";
  try { id = require.resolve(m); } catch (_) { /* not in this tree */ }
  if (id && require.cache[id]) {
    throw new Error(`testlib-own-app-data.js loaded after ${m}: Nova's app-data folder is decided once, as safe-write.js loads, so it `
      + "would have kept the run's. Require this first, at the top of the test.");
  }
}
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nova-own-appdata-"));
for (const k of ["APPDATA", "XDG_CONFIG_HOME", "NOVA_APP_DATA_DIR"]) process.env[k] = dir;
// The folder this made, and nothing else: a temp folder of this process's own, holding only what its server kept there.
process.on("exit", () => { try { fs.rmSync(dir, { recursive: true, force: true, maxRetries: 3 }); } catch (_) { /* temp: left to the OS */ } });

module.exports = { dir };
