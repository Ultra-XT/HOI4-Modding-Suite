// ⛔ #a-network-game-folder-freezes-nova — A NETWORK FOLDER PASTED AS THE GAME FOLDER IS REFUSED BY ITS ADDRESS, NOT BY ASKING IT (review S-S4).
//
// The Game folder setting checked a pasted folder with fs.statSync, synchronously, in the process that in the app also runs the
// window. A \\server\share (or a mapped network drive) whose host does not answer held that stat for about 21 s — measured by
// the review: POST { path: "\\\\192.0.2.3\\games\\Hearts of Iron IV" } answered 400 after 21,067 ms, and a 300 ms timer set right
// after it fired at 21,063 ms: the whole server stood still. A saved network choice would then be stat'ed again on every
// resolveHoi4GameRoot call. Detection never looks on a network drive for this reason (listLocalDrives), and Steam keeps no library
// on one. So the setting refuses a network folder by its address, before anything is asked of it.
//
// 192.0.2.3 is TEST-NET-1 (RFC 5737): reserved for documentation, never routed — with the fix nothing is sent to it at all. The
// mapped drive is named through the setting's own seam (opts.networkDrives), and `net use`'s output through networkDriveLetters'.
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

const PORT = 54789;
let pass = 0, fail = 0;
const ok = (c, m, x) => {
  if (c) { pass++; console.log("  ok   " + m); }
  else { fail++; console.log("  FAIL " + m + (x !== undefined ? "   -> " + JSON.stringify(x).slice(0, 600) : "")); }
};
const same = (a, b) => !!a && !!b && path.resolve(String(a)).toLowerCase() === path.resolve(String(b)).toLowerCase();

const T = fs.mkdtempSync(path.join(os.tmpdir(), "nova-network-folder-"));
const write = (p, text) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, text); };
const GAME = path.join(T, "Games", "Hearts of Iron IV");
write(path.join(GAME, "hoi4.exe"), "MZ");
delete process.env.HOI4_ROOT;
process.env.NOVA_TEST_GAME_DETECTION = "off";
const S = require("./server.js");

let server = null;
(async () => {
  try {
    const app = S.createApp();
    server = await new Promise((res, rej) => { const s = app.listen(PORT, "127.0.0.1", () => res(s)); s.once("error", rej); });
    const base = `http://127.0.0.1:${PORT}`;
    const timed = async (body) => {
      const t = Date.now();
      const r = await fetch(base + "/api/settings/game-folder", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const d = await r.json();
      return { status: r.status, ms: Date.now() - t, error: String(d.error || ""), path: d.path };
    };

    console.log("\n1. ⭐⭐⭐ a \\\\server\\share address, as home.js sends it: refused at once, by its address");
    for (const p of ["\\\\192.0.2.3\\games\\Hearts of Iron IV", "//192.0.2.3/games/Hearts of Iron IV", "\\\\?\\UNC\\192.0.2.3\\games\\Hearts of Iron IV"]) {
      const r = await timed({ path: p });
      ok(r.status === 400 && /is a network folder/.test(r.error) && /own drives/.test(r.error), `${p}: refused, and the reason says it is a network folder`, r);
      ok(r.ms < 3000, `⭐⭐⭐ …in ${r.ms} ms: nothing waited on a share that does not answer (the review measured 21,067 ms)`, r.ms);
    }
    ok(S.hoi4GameFolderFound() === false && !fs.existsSync(S.GAME_FOLDER_CHOICE_FILE), "…and nothing was chosen or saved", S.resolveHoi4GameRoot());

    console.log("\n2. ⭐⭐ a drive letter Windows maps to a share: refused too, with the share it names");
    const mapped = S.setGameFolderChoice("Z:\\Games\\Hearts of Iron IV", { networkDrives: () => new Map([["Z", "\\\\nas\\games"]]) });
    ok(mapped.ok === false && /Z: is a network drive \(\\\\nas\\games\)/.test(mapped.error || ""), "Z: mapped to \\\\nas\\games: refused, naming the share", mapped);
    const local = S.setGameFolderChoice("Z:\\Games\\Hearts of Iron IV", { networkDrives: () => new Map() });
    ok(local.ok === false && /There is no folder at/.test(local.error || ""), "CONTROL: the same letter, not mapped, is asked of the disk (and is not there)", local);
    ok(typeof S.networkDriveLetters === "function", "networkDriveLetters is exported", typeof S.networkDriveLetters);
    if (typeof S.networkDriveLetters === "function" && process.platform === "win32") {
      // what `net use` prints on an English Windows, with a share that is not connected now and a WebDAV one
      const netUse = "New connections will be remembered.\r\n\r\n\r\nStatus       Local     Remote                    Network\r\n\r\n"
        + "-------------------------------------------------------------------------------\r\n"
        + "OK           Z:        \\\\nas\\games                Microsoft Windows Network\r\n"
        + "Unavailable  Y:        \\\\server@SSL\\DavWWWRoot    Web Client Network\r\n"
        + "OK                     \\\\nas\\IPC$                 Microsoft Windows Network\r\n"
        + "The command completed successfully.\r\n\r\n";
      const letters = S.networkDriveLetters(() => ({ status: 0, stdout: netUse }));
      ok(letters.get("Z") === "\\\\nas\\games" && letters.get("Y") === "\\\\server@SSL\\DavWWWRoot" && letters.size === 2,
        "⭐ `net use`'s list read: Z: and Y: are network drives, a connection with no letter is none", [...letters]);
      const none = S.networkDriveLetters(() => ({ status: 0, stdout: "New connections will be remembered.\r\n\r\nThere are no entries in the list.\r\n\r\n" }));
      const broken = S.networkDriveLetters(() => { throw new Error("no net.exe (Wine)"); });
      ok(none.size === 0 && broken.size === 0, "…no entries, or no net.exe at all: no letter is a network drive", [none.size, broken.size]);
    }

    console.log("\n3. CONTROL: a folder on this PC's own drive is taken as before");
    const good = await timed({ path: GAME });
    ok(good.status === 200 && same(good.path, GAME), "the fixture game folder (in the temp folder, on a local drive) is taken", good);
    const longForm = S.networkGameFolderReason("\\\\?\\C:\\Games\\Hearts of Iron IV", new Map());
    ok(longForm === "", "…and \\\\?\\C:\\… is a local folder, spelled long, not a network one", longForm);
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
