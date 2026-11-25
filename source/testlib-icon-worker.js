// One app launch: boot the server, ask for one icon key, print the answer, exit.
// ⭐ A SEPARATE PROCESS IS THE POINT. The icon index is held in memory for an hour, so a second call inside
// one process never consults the persisted cache — which is the thing under test. Running the query in a
// fresh process is also exactly what the user does: they restart Nova and the new art is still missing.
"use strict";
const fs = require("fs");
const path = require("path");

const [, , ROOT, MOD, KEY] = process.argv;
process.env.HOI4_MODS_ROOT = ROOT;
process.env.APPDATA = path.join(ROOT, "appdata");
fs.mkdirSync(process.env.APPDATA, { recursive: true });
const { createApp } = require(require("path").join(__dirname, "server.js"));

// ⛔ PORT 0 — LET THE OS PICK, AND NEVER GUESS A NUMBER HERE.
//
// This used to be `53200 + (process.pid % 300)`. Two things were wrong with that, and they compounded:
//
//   * A PID-derived port is UNCLAIMABLE. Both runners schedule by reading the port each test file claims in
//     its own source, and never run two claimants together. A number invented at runtime inside a spawned
//     HELPER is invisible to that, so the runner cannot schedule around it — the one mechanism that exists
//     to prevent collisions was bypassed by construction.
//   * Its range 53200-53499 OVERLAPS the 53400-53700 band the tests themselves bind, so it could land on a
//     port a concurrently-scheduled test legitimately owned.
//
// It failed exactly that way inside a full parallel run: EADDRINUSE on 53368, in a file that passes 3/3 when
// run alone. Renumbering would only move the collision; the port is purely internal here — this process
// binds it, queries itself, prints one line and exits — so it should never have picked a number at all.
// Port 0 asks the OS for a free one, which cannot collide with anything, and needs no claim.
(async () => {
  const srv = await new Promise((r) => { const s = createApp().listen(0, "127.0.0.1", () => r(s)); });
  const PORT = srv.address().port;
  try {
    const r = await fetch(`http://127.0.0.1:${PORT}/api/ideas/sprite-url?key=${encodeURIComponent(KEY)}&modPath=${encodeURIComponent(MOD)}`)
      .then((x) => x.json());
    const url = String((r && r.url) || "");
    process.stdout.write("RESULT:" + (url ? decodeURIComponent(String(url.split("path=")[1] || "")) : "") + "\n");
  } catch (e) {
    process.stdout.write("RESULT:ERROR " + String(e && e.message) + "\n");
  } finally {
    srv.closeAllConnections(); srv.close();
  }
})();
