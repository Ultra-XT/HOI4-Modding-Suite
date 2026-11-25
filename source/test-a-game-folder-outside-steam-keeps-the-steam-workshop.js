// ⛔ #nova-does-not-find-the-game — A GAME FOLDER OUTSIDE EVERY STEAM LIBRARY KEEPS STEAM'S WORKSHOP (review S-S2).
//
// The Workshop folder follows the library that holds the game: <library>\steamapps\workshop\content\394360. A modder may point
// Nova at a copy of the game OUTSIDE Steam (one kept at an older version, say), and that copy has no Workshop beside it, so
// WORKSHOP_ROOT fell back to the old default, C:\Program Files (x86)\Steam\…\394360, which is not where Steam keeps it on most
// machines (not on the owner's). workshopContentRoots() then no longer held the real Workshop, and the world builder's refusal
// of a Workshop download — "a generated world would be written into a folder Steam overwrites" — passed a subscribed mod:
// measured by the review, the same dry run answered 400 refused:"workshop" with the Steam copy in use and 200 ok after the
// modder chose the copy outside Steam. Before the setting nothing could move WORKSHOP_ROOT off the game Steam's record names.
//
// Here detection finds a fixture Steam folder (NOVA_TEST_GAME_DETECTION=steam=<it>) whose library holds the game and a Workshop
// download; the copy outside Steam is a second fixture. The world builder's own request is sent with each in use.
"use strict";
// ⛔ #a-test-that-chooses-a-game-keeps-it-to-itself — FIRST, before any of Nova's modules: this file's own server is told about the
// Game folder, and a choice saved in the run's one app-data folder stood in front of every other test's HOI4_ROOT. Its app data is
// its own (testlib-own-app-data.js; test-a-test-that-chooses-a-game-keeps-it-to-itself.js holds every such file to this).
require("./testlib-own-app-data.js");
// #a-bare-test-run-writes-into-the-real-app-data — FIRST: run bare, server.js's app data is a sandbox.
require("./safe-write.js");
const fs = require("fs");
const os = require("os");
const path = require("path");

const PORT = 54788;
let pass = 0, fail = 0;
const ok = (c, m, x) => {
  if (c) { pass++; console.log("  ok   " + m); }
  else { fail++; console.log("  FAIL " + m + (x !== undefined ? "   -> " + JSON.stringify(x).slice(0, 600) : "")); }
};
const same = (a, b) => !!a && !!b && path.resolve(String(a)).toLowerCase() === path.resolve(String(b)).toLowerCase();

const T = fs.mkdtempSync(path.join(os.tmpdir(), "nova-outside-steam-"));
const write = (p, text) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, text); };
const makeGame = (dir) => {
  write(path.join(dir, "hoi4.exe"), "MZ");
  write(path.join(dir, "launcher-settings.json"), JSON.stringify({ gameId: "hoi4", rawVersion: "v1.19.4.1", version: "v1.19.4.1" }));
  return dir;
};
const STEAM = path.join(T, "Games", "Steam");
const GAME_S = makeGame(path.join(STEAM, "steamapps", "common", "Hearts of Iron IV"));
write(path.join(STEAM, "steamapps", "appmanifest_394360.acf"), "\"AppState\"\n{\n\t\"appid\"\t\t\"394360\"\n\t\"installdir\"\t\t\"Hearts of Iron IV\"\n}\n");
const WORKSHOP = path.join(STEAM, "steamapps", "workshop", "content", "394360");
const ITEM = path.join(WORKSHOP, "2000000001");
write(path.join(ITEM, "descriptor.mod"), 'version="1.0"\nname="A subscribed mod"\nsupported_version="1.19.*"\n');
const PINNED = makeGame(path.join(T, "Games", "HOI4 1.12 pinned copy"));

delete process.env.HOI4_ROOT;
delete process.env.HOI4_WORKSHOP_ROOT;
process.env.NOVA_TEST_GAME_DETECTION = `steam=${STEAM}`;
const S = require("./server.js");

let server = null;
(async () => {
  try {
    const app = S.createApp();
    server = await new Promise((res, rej) => { const s = app.listen(PORT, "127.0.0.1", () => res(s)); s.once("error", rej); });
    const base = `http://127.0.0.1:${PORT}`;
    const report = () => fetch(base + "/api/settings/game-folder").then((r) => r.json());
    const post = (body) => fetch(base + "/api/settings/game-folder", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      .then(async (r) => ({ status: r.status, d: await r.json() }));
    // the world builder's own first request on the Workshop download (map.js: { modPath: modPath(), dryRun: true })
    const worldGate = () => fetch(base + "/api/map/prepare-world", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ modPath: ITEM, dryRun: true }) })
      .then(async (r) => ({ status: r.status, d: await r.json() }));

    console.log("\n1. (the Steam copy in use: its library's Workshop, and the world builder refuses the download)");
    let rep = await report();
    ok(rep.found && same(rep.path, GAME_S) && rep.source === "steam", "detection finds the game in the fixture Steam library", { path: rep.path, source: rep.source });
    ok(same(S.constants.WORKSHOP_ROOT, WORKSHOP) && same(rep.workshop, WORKSHOP), "WORKSHOP_ROOT is that library's Workshop, and Home is told so", [S.constants.WORKSHOP_ROOT, rep.workshop]);
    const g1 = await worldGate();
    ok(g1.status === 400 && g1.d.refused === "workshop", "CONTROL: the world builder refuses to build into the Workshop download", g1.d);

    console.log("\n2. ⭐⭐⭐ the modder chooses a copy of the game outside Steam: the Workshop is still Steam's");
    const set = await post({ path: PINNED });   // home.js's body
    ok(set.status === 200 && same(set.d.path, PINNED) && set.d.source === "choice", "the copy outside Steam is in use", set.d);
    ok(same(S.constants.WORKSHOP_ROOT, WORKSHOP), "⭐⭐⭐ WORKSHOP_ROOT is still the Workshop Steam's record names, not the old default", S.constants.WORKSHOP_ROOT);
    rep = await report();
    ok(same(rep.workshop, WORKSHOP), "⭐ …and Home is told the same", rep.workshop);
    const g2 = await worldGate();
    ok(g2.status === 400 && g2.d.refused === "workshop", "⭐⭐⭐ …so the world builder still refuses the Workshop download", g2.d);

    console.log("\n3. ⭐ back to letting Nova find it: the same Workshop");
    const cleared = await post({ path: "" });
    ok(cleared.status === 200 && same(cleared.d.path, GAME_S) && same(S.constants.WORKSHOP_ROOT, WORKSHOP), "the Steam copy and its Workshop again", [cleared.d.path, S.constants.WORKSHOP_ROOT]);
  } catch (e) {
    fail++;
    console.log("  FAIL threw: " + (e && e.stack || e));
  } finally {
    try { if (server) server.close(); } catch (_) {}
    await new Promise((r) => setTimeout(r, 200));
    try { fs.rmSync(T, { recursive: true, force: true, maxRetries: 3 }); } catch (_) {}
    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
  }
})();
