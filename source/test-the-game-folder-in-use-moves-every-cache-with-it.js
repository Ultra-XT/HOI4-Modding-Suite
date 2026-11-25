// ⛔ #the-game-folder-moved-by-itself — THE GAME FOLDER IN USE MOVES WITH NOBODY SETTING ANYTHING, AND EVERY CACHE MUST MOVE WITH IT.
//
// resolveHoi4GameRoot answers the modder's choice while it holds the game, HOI4_ROOT, then what detection found. So its answer
// changes by itself: the chosen copy is on a drive that is unplugged, or plugged in after Nova started; the chosen copy loses
// hoi4.exe (uninstalled, moved); HOI4_ROOT is set or cleared. Each switch moves the game every reader reads — and nothing told
// the caches, which were dropped only when the setting was saved. Measured by the reviews of the Game folder setting:
//   S-S1  the chosen copy came back after Nova started: Home named it, the research catalogue went on serving the Steam copy's 552
//         technologies, and with no other copy the catalogue said gameFound true with 0 technologies — the "canvas really is
//         empty" card the setting was made to remove. Saving the same folder again did nothing (changed:false).
//   P-P1  the chosen copy lost hoi4.exe: Home said "Found in the Steam library", countries and the map were the Steam game's, and
//         the research catalogue gave the vanished copy's 45 technologies and 0 equipment — written into the STEAM game's disk
//         cache, so it outlived restarts, "Let Nova find it" and choosing the Steam folder by hand.
// Here every switch is made the way it happens — a hoi4.exe renamed away and back, HOI4_ROOT set and cleared — with no request to
// the setting in between, and after each one the research catalogue must be the game Home names, and only that game.
//
// Every game is a fixture under a temp folder: the copy the modder chose (F), and a Steam folder whose own library holds the game
// (S), which detection finds through NOVA_TEST_GAME_DETECTION=steam=<that folder> — so nothing here reads this machine's registry
// or its real game. App data is its own (testlib-own-app-data.js); the server is this file's own, on 54785.
"use strict";
// ⛔ #a-test-that-chooses-a-game-keeps-it-to-itself — FIRST, before any of Nova's modules: this file's own server is told about the
// Game folder, and a choice saved in the run's one app-data folder stood in front of every other test's HOI4_ROOT. Its app data is
// its own (testlib-own-app-data.js; test-a-test-that-chooses-a-game-keeps-it-to-itself.js holds every such file to this).
require("./testlib-own-app-data.js");
// #a-bare-test-run-writes-into-the-real-app-data — FIRST: run bare, server.js's app data (the choice, the disk caches) is a sandbox.
require("./safe-write.js");
const fs = require("fs");
const os = require("os");
const path = require("path");

const PORT = 54785;
let pass = 0, fail = 0;
const ok = (c, m, x) => {
  if (c) { pass++; console.log("  ok   " + m); }
  else { fail++; console.log("  FAIL " + m + (x !== undefined ? "   -> " + JSON.stringify(x).slice(0, 600) : "")); }
};
const same = (a, b) => !!a && !!b && path.resolve(String(a)).toLowerCase() === path.resolve(String(b)).toLowerCase();

const T = fs.mkdtempSync(path.join(os.tmpdir(), "nova-game-moves-"));
const write = (p, text) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, text); };
/** A base game of the test's own: hoi4.exe, one technology, one equipment, one name — each tagged with the game's letter. */
const makeGame = (dir, tag, name) => {
  write(path.join(dir, "hoi4.exe"), "MZ");
  write(path.join(dir, "launcher-settings.json"), JSON.stringify({ gameId: "hoi4", rawVersion: `v1.19.4.1-${tag}`, version: `v1.19.4.1-${tag}` }));
  write(path.join(dir, "common", "technologies", `${tag}_tech.txt`),
    `technologies = {\n\ttech_from_game_${tag} = {\n\t\tresearch_cost = 1\n\t\tstart_year = 1936\n\t\tfolder = { name = infantry_folder position = { x = 0 y = 0 } }\n\t}\n}\n`);
  write(path.join(dir, "common", "units", "equipment", `${tag}_equipment.txt`),
    `equipments = {\n\tequip_from_game_${tag} = {\n\t\tyear = 1936\n\t\tis_archetype = yes\n\t\ttype = infantry\n\t}\n}\n`);
  write(path.join(dir, "localisation", "english", `${tag}_l_english.yml`), `﻿l_english:\n tech_from_game_${tag}:0 "${name}"\n`);
  return dir;
};
const STEAM = path.join(T, "Steam");
const GAME_S = makeGame(path.join(STEAM, "steamapps", "common", "Hearts of Iron IV"), "s", "Steam Tech");
write(path.join(STEAM, "steamapps", `appmanifest_394360.acf`), `"AppState"\n{\n\t"appid"\t\t"394360"\n\t"installdir"\t\t"Hearts of Iron IV"\n}\n`);
const GAME_F = makeGame(path.join(T, "USB stick", "HOI4 copy"), "f", "Fixed Copy Tech");
const GAME_E = makeGame(path.join(T, "Dev", "HOI4 for HOI4_ROOT"), "e", "Env Tech");
const MOD = path.join(T, "mods", "blank");
write(path.join(MOD, "descriptor.mod"), 'version="1.0"\nname="Blank"\nsupported_version="1.19.*"\n');
// One focus whose reward names F's technology: Home's mod index (Mod Health's counts) reports it as a broken reference with any
// other game below the mod, so the index's answer says which game it was built against.
write(path.join(MOD, "common", "national_focus", "blank_focus.txt"),
  "focus_tree = {\n\tid = blank_tree\n\tcountry = { factor = 0 }\n\tfocus = {\n\t\tid = BLK_focus\n\t\tx = 0\n\t\ty = 0\n\t\tcost = 10\n"
  + "\t\tcompletion_reward = {\n\t\t\tset_technology = { tech_from_game_f = 1 }\n\t\t}\n\t}\n}\n");
// Old times on every fixture file, so a disk cache written in this run is trusted when it is read back (savedInTheTickOf refuses
// an answer saved in the clock tick of a file it read): the disk half of P-P1 must be able to show here.
const aged = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) aged(p); else fs.utimesSync(p, new Date(Date.now() - 3600e3), new Date(Date.now() - 3600e3)); } };
aged(T);

delete process.env.HOI4_ROOT;
process.env.NOVA_TEST_GAME_DETECTION = `steam=${STEAM}`;
const S = require("./server.js");
/** The program renamed away and back: what an unplugged drive, an uninstall or a move looks like to Nova. */
const away = (game) => fs.renameSync(path.join(game, "hoi4.exe"), path.join(game, "hoi4.exe.gone"));
const back = (game) => fs.renameSync(path.join(game, "hoi4.exe.gone"), path.join(game, "hoi4.exe"));

let server = null;
(async () => {
  try {
    const app = S.createApp();
    server = await new Promise((res, rej) => { const s = app.listen(PORT, "127.0.0.1", () => res(s)); s.once("error", rej); });
    const base = `http://127.0.0.1:${PORT}`;
    const report = () => fetch(base + "/api/settings/game-folder").then((r) => r.json());
    const post = (body) => fetch(base + "/api/settings/game-folder", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      .then(async (r) => ({ status: r.status, d: await r.json() }));
    /** The research page's own first request (research.js: /api/technologies/catalog?lite=1&modPath=…). */
    const catalog = async () => {
      const d = await fetch(`${base}/api/technologies/catalog?lite=1&modPath=${encodeURIComponent(MOD)}`).then((r) => r.json());
      const techs = (d.technologies || []).map((t) => t.id).filter((id) => /^tech_from_game_/.test(id)).sort();
      const names = Object.fromEntries((d.technologies || []).map((t) => [t.id, t.name]));
      return { techs, names, equips: Object.keys(d.equipments || {}).filter((e) => /^equip_from_game_/.test(e)).sort(), gameFound: d.gameFound };
    };
    /** After a switch: Home's answer, the folder every reader gets, GAME_ROOT, and the catalogue — all the one game `tag`. */
    const allSay = async (label, game, tag) => {
      const rep = await report();
      const c = await catalog();
      ok(rep.found === true && same(rep.path, game), `${label}: Home names the game in use`, { found: rep.found, path: rep.path, source: rep.source });
      ok(same(S.resolveHoi4GameRoot(), game) && same(S.constants.GAME_ROOT, game), `…resolveHoi4GameRoot and GAME_ROOT say the same`, [S.resolveHoi4GameRoot(), S.constants.GAME_ROOT]);
      ok(c.gameFound === true && c.techs.join() === `tech_from_game_${tag}` && c.equips.join() === `equip_from_game_${tag}`,
        `⭐⭐⭐ …and the research catalogue is that game's technologies and equipment, and no other game's`, c);
      return c;
    };

    console.log("\n0. (the fixture: detection finds the Steam folder's game, S)");
    let rep = await report();
    ok(rep.found && same(rep.path, GAME_S) && rep.source === "steam", "with nothing chosen, Nova uses the game in the Steam library", rep);
    await allSay("S found by detection", GAME_S, "s");

    console.log("\n1. ⭐⭐⭐ P-P1: the copy the modder chose loses hoi4.exe while Nova runs");
    const setF = await post({ path: GAME_F });   // home.js's body
    ok(setF.status === 200 && same(setF.d.path, GAME_F) && setF.d.source === "choice", "the modder chooses copy F on Home", setF.d);
    const f1 = await allSay("F chosen", GAME_F, "f");
    ok(f1.names.tech_from_game_f === "Fixed Copy Tech", "…with F's names", f1.names.tech_from_game_f);
    away(GAME_F);
    rep = await report();
    ok(rep.found && same(rep.path, GAME_S) && /no hoi4\.exe in the folder you chose/.test(rep.choiceProblem || ""),
      "F lost hoi4.exe: Home says Nova uses the Steam game now, and why", { path: rep.path, choiceProblem: rep.choiceProblem });
    const s1 = await allSay("F gone, S in use", GAME_S, "s");
    ok(s1.names.tech_from_game_s === "Steam Tech" && !("tech_from_game_f" in s1.names), "⭐⭐ …with S's names, and none of F's", s1.names);
    // What a restart reads: the in-memory caches are gone and the disk cache answers. Before the fix that disk entry, under the
    // STEAM game's key, held F's technologies, and every later start served them.
    S.resetGameFolderCaches();
    const s2 = await catalog();
    ok(s2.techs.join() === "tech_from_game_s" && s2.equips.join() === "equip_from_game_s",
      "⭐⭐⭐ …and the Steam game's disk cache holds S's, not the vanished copy's: a restart serves the right game", s2);
    back(GAME_F);
    await allSay("⭐⭐ F has hoi4.exe again (no request to the setting)", GAME_F, "f");

    console.log("\n2. ⭐⭐⭐ S-S1: the only copy is on a drive that is not in when Nova starts, and is plugged in later");
    away(GAME_F); away(GAME_S);
    rep = await report();
    ok(rep.found === false && rep.path === "", "with neither copy there, Home says not found", { found: rep.found, path: rep.path });
    const none = await catalog();
    ok(none.gameFound === false && none.techs.length === 0 && none.equips.length === 0, "…and the catalogue says gameFound false, with no game's content", none);
    ok(S.resolveHoi4GameRoot() === S.NO_GAME_FOLDER && S.constants.GAME_ROOT === "", "…every reader gets NO_GAME_FOLDER, and GAME_ROOT is \"\"", [S.resolveHoi4GameRoot(), S.constants.GAME_ROOT]);
    back(GAME_F);   // plugged in
    const plug = await catalog();
    ok(plug.gameFound === true && plug.techs.join() === "tech_from_game_f",
      "⭐⭐⭐ the drive is plugged in: the catalogue is F's at once, never gameFound true with nothing in it (the old empty-tree card)", plug);
    await allSay("…and Home", GAME_F, "f");
    back(GAME_S);
    await allSay("(the Steam copy back too: the choice still wins)", GAME_F, "f");

    console.log("\n3. ⭐⭐ two copies: whichever is in use, the makers read the one Home names");
    away(GAME_F);
    await allSay("F unplugged", GAME_S, "s");
    back(GAME_F);
    await allSay("F plugged back in", GAME_F, "f");

    console.log("\n4. ⭐⭐ HOI4_ROOT set and cleared at runtime (tests and scripts do it): the caches follow that too");
    const clear = await post({ path: "" });
    ok(clear.status === 200 && same(clear.d.path, GAME_S), "(the choice cleared: S again)", clear.d.path);
    await allSay("S", GAME_S, "s");
    process.env.HOI4_ROOT = GAME_E;
    await allSay("HOI4_ROOT names copy E", GAME_E, "e");
    delete process.env.HOI4_ROOT;
    await allSay("HOI4_ROOT cleared", GAME_S, "s");

    console.log("\n5. ⭐⭐ the first request after a switch is a cache HIT: Home's mod index, answered from memory for five minutes");
    // Home's own request (home.js loadModProgress: /api/mod/index?modPath=…, no fresh=1). A hit never asks resolveHoi4GameRoot, so
    // the switch is settled at the start of every request, before any handler reads a cache.
    const brokenF = async () => {
      const d = await fetch(`${base}/api/mod/index?modPath=${encodeURIComponent(MOD)}`).then((r) => r.json());
      return (d.problems || []).filter((p) => p.rule === "broken_reference" && p.refId === "tech_from_game_f").length;
    };
    ok((await brokenF()) === 1, "control: with S below the mod, its reward naming F's technology is a broken reference", null);
    await post({ path: GAME_F });
    ok((await brokenF()) === 0, "with F chosen it is not (F defines it)", null);
    ok((await brokenF()) === 0, "…and the second read is the cache's (warm)", null);
    away(GAME_F);
    ok((await brokenF()) === 1, "⭐⭐ F unplugged, and the mod index is the FIRST request after it: built against S, not served from F's", null);
    back(GAME_F);
    ok((await brokenF()) === 0, "⭐⭐ …and F plugged back in, the first request again: built against F", null);
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
