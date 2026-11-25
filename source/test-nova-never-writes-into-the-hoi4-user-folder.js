// Nova must never write into Documents/Paradox Interactive/Hearts of Iron IV — except its mod/ subtree.
// #nova-wrote-into-the-hoi4-user-folder
//
// HOI4 loads that folder GLOBALLY, on top of every mod. Anything left there breaks every mod the user will
// ever make, and it is invisible from inside the mod they are editing.
//
// NOT HYPOTHETICAL. Two directories dated 2026-08-17 were found there on the owner's machine —
// history/states/1082-Loas.txt and localisation/english/state_names_l_english.yml — and HOI4's own log for a
// mod Nova had just called 0 errors / 0 warnings showed what they did:
//
//   State ID conflict: Both "STATE_1082" (mod) and "STATE_1082" (…\Hearts of Iron IV\history\states\1082-Loas.txt)
//   Error: Province with id: 3942 is already added to state "STATE_1082" … overriding first state
//   MAP_ERROR: The land province 3838 has no state.      (…and ~40 buildings.txt rows ignored)
//
// Reproduced 2026-09-08: four map endpoints aimed at that folder wrote 22 files, every one answering
// status 200 / ok:true, including a file literally named 1082-Loas.txt. The map endpoints take `modPath`
// verbatim and check only "not DEV_ROOT" and "not the game root" — the user folder is neither, and
// resolveAllowedModDirectory(), which would have caught it, is never called by them.
//
// The guard lives in safe-write's assertWritable, so it covers EVERY writer at once rather than N endpoints.
//
// ⚠️ Steam's "Verify integrity of game files" does not clean that folder — it only repairs the install
// directory. Debris there is permanent until deleted by hand.
"use strict";
// #a-bare-test-run-writes-into-the-real-app-data — FIRST: run bare, the server this starts inherits the sandbox.
require("./safe-write.js");
const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");
const { spawn } = require("child_process");

// ⚠️ A plain constant, not process.env.NOVA_PORT — that env name is how the runner and
// test-no-test-hijacks-the-users-server.js recognise a test that drives the LIVE app. This starts its own.
const PORT = 54762;

let pass = 0;
const fails = [];
const ok = (cond, label, detail) => {
  if (cond === true) { pass++; console.log("  ok   " + label); }
  else { fails.push(label); console.log("  FAIL " + label + (detail !== undefined ? "   -> " + JSON.stringify(detail).slice(0, 400) : "")); }
};

// A SIMULATED user folder — the real one is never touched.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "nova-hoi4user-"));
const HOI4_USER = path.join(tmp, "Hearts of Iron IV");
const MODS = path.join(HOI4_USER, "mod");
const REALMOD = path.join(MODS, "a_real_mod");
fs.mkdirSync(REALMOD, { recursive: true });
// ⚠️⚠️ resolveHoi4UserDir() prefers the candidate that HAS a logs/ folder and only falls back to "exists"
// afterwards. Without this the REAL Documents folder wins that first pass and this test measures the wrong
// directory — every write is then allowed for the correct reason and the test passes having proved nothing.
fs.mkdirSync(path.join(HOI4_USER, "logs"), { recursive: true });
// replace_path="history/states": 900-X.txt is this mod's whole state list. Without it the installed game's 900-Benue.txt loads
// beside it and, sorting first, is the state 900 HOI4 keeps and the one an edit lands in (#the-state-the-game-keeps), so the
// "value is on disk" check below would read the wrong file. This test is about the user-folder guard, not which state loads.
fs.writeFileSync(path.join(REALMOD, "descriptor.mod"), 'name="RealMod"\nsupported_version="1.19.*"\nreplace_path="history/states"\n');
fs.mkdirSync(path.join(REALMOD, "history", "states"), { recursive: true });
fs.writeFileSync(path.join(REALMOD, "history", "states", "900-X.txt"),
  'state = {\n\tid = 900\n\tname = "STATE_900"\n\tmanpower = 1000\n\tstate_category = rural\n\tprovinces = { 1 }\n\thistory = {\n\t\towner = AAA\n\t}\n}\n');

const post = (url, body) => new Promise((resolve) => {
  const data = JSON.stringify(body);
  const req = http.request({ host: "127.0.0.1", port: PORT, path: url, method: "POST",
    headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data) } }, (res) => {
    let b = ""; res.on("data", (c) => (b += c));
    res.on("end", () => { let j; try { j = JSON.parse(b); } catch (_) { j = { raw: b.slice(0, 160) }; } j.__status = res.statusCode; resolve(j); });
  });
  req.on("error", (e) => resolve({ error: String(e) }));
  req.setTimeout(120000, () => { req.destroy(); resolve({ error: "timeout" }); });
  req.write(data); req.end();
});

// Everything loose in the user folder, excluding its legitimate mod/ subtree.
const looseFiles = () => {
  const out = [];
  const walk = (d) => {
    if (!fs.existsSync(d)) return;
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (p.startsWith(MODS) || p.startsWith(path.join(HOI4_USER, "logs"))) continue;
      if (e.isDirectory()) walk(p); else out.push(p.slice(HOI4_USER.length + 1));
    }
  };
  walk(HOI4_USER);
  return out.sort();
};

(async () => {
  const srv = spawn(process.execPath, ["server.js"], {
    cwd: __dirname, stdio: "ignore",
    env: { ...process.env, PORT: String(PORT), NOVA_APP_DATA_DIR: path.join(tmp, "appdata"),
      HOI4_MOD_ROOT: MODS, HOI4_USER_DIR: HOI4_USER },
  });
  const done = () => { try { srv.kill(); } catch (_) {} try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) {} };
  process.on("exit", done);

  let up = false;
  for (let i = 0; i < 60 && !up; i++) {
    await new Promise((r) => setTimeout(r, 500));
    up = await new Promise((r) => {
      const q = http.get({ host: "127.0.0.1", port: PORT, path: "/api/settings/allow-vanilla-edits" }, (res) => { res.resume(); r(true); });
      q.on("error", () => r(false)); q.setTimeout(1500, () => { q.destroy(); r(false); });
    });
  }
  ok(up, `the server answered on ${PORT}`);

  if (up) {
    console.log("\n=== ⛔ the four endpoints that put the debris there are refused ===");
    ok(looseFiles().length === 0, "the folder starts clean", looseFiles());

    // The exact bodies public/map.js sends, aimed at the PARENT of mod/.
    const attempts = [
      ["/api/map/create-state", { modPath: HOI4_USER, name: "Loas", owner: "AAA" }],
      ["/api/map/set-state", { modPath: HOI4_USER, stateId: 900, fields: { manpower: 4321 } }],
      ["/api/map/create-country", { modPath: HOI4_USER, tag: "ZQ9", name: "Poison", rgb: [1, 2, 3], stateIds: [900], capitalStateId: 900 }],
      ["/api/map/set-region-name", { modPath: HOI4_USER, nameKey: "STATE_1", name: "Poisoned" }],
    ];
    for (const [url, body] of attempts) {
      const r = await post(url, body);
      ok(!(r && r.ok === true), `⭐ ${url} is refused`, { status: r.__status, error: String(r.error || "").slice(0, 90) });
    }
    const loose = looseFiles();
    ok(loose.length === 0,
      "⭐⭐⭐ …and NOT ONE file was written into the user folder (this wrote 22, including 1082-Loas.txt)", loose);
    // ⚠️ WHAT IS AND IS NOT GUARANTEED, stated precisely rather than glossed.
    //
    // The guard lives in safeModWrite, and writers call fs.mkdirSync(dir, {recursive:true}) BEFORE they call
    // it — so an EMPTY directory can still appear here. That is litter, not the bug: HOI4 scans it, finds no
    // files, and loads nothing. What poisoned every mod was a FILE it could read, and no file survives.
    //
    // Pinning it as an observation rather than a pass means nobody later reads "the folder is untouched" as
    // stronger than it is, and a future endpoint-level fix that removes the mkdirs will show up here.
    const dirs = [];
    (function walkDirs(d, rel) {
      if (!fs.existsSync(d)) return;
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        if (!e.isDirectory()) continue;
        const p = path.join(d, e.name);
        if (p.startsWith(MODS) || p.startsWith(path.join(HOI4_USER, "logs"))) continue;
        dirs.push(path.join(rel, e.name));
        walkDirs(p, path.join(rel, e.name));
      }
    })(HOI4_USER, "");
    console.log(`  ..   (empty directories created before the refusal, harmless: ${JSON.stringify(dirs)})`);
    ok(dirs.every((d) => {
      const abs = path.join(HOI4_USER, d);
      return fs.readdirSync(abs).every((n) => fs.statSync(path.join(abs, n)).isDirectory());
    }), "⭐⭐ …and every directory it did create is EMPTY — nothing HOI4 can load", dirs);

    console.log("\n=== ⚠️ THE CONTROL: a real mod under mod/ still writes normally ===");
    // If this fails the guard is too wide and has broken every mod in the user's library.
    const good = await post("/api/map/create-state", { modPath: REALMOD, name: "Fine", owner: "AAA" });
    ok(good && good.ok === true, "⚠️⚠️ a state can still be created in a real mod", good && (good.error || good.raw));
    ok(Number.isFinite(good && good.id), "…and it gets a real id", good && good.id);
    const wrote = fs.existsSync(path.join(REALMOD, "history", "states"))
      && fs.readdirSync(path.join(REALMOD, "history", "states")).length > 1;
    ok(wrote, "⚠️⚠️ …and the file really landed in the mod", wrote);

    const good2 = await post("/api/map/set-state", { modPath: REALMOD, stateId: 900, fields: { manpower: 4321 } });
    ok(good2 && good2.ok === true, "⚠️ editing an existing state in a real mod still works", good2 && good2.error);
    ok(/manpower\s*=\s*4321/.test(fs.readFileSync(path.join(REALMOD, "history", "states", "900-X.txt"), "utf8")),
      "⚠️⚠️ …and the value is on disk — the guard blocks the folder, not the feature");
  }

  done();
  console.log(`\n=== nova never writes into the hoi4 user folder: ${pass} checks, ${fails.length} failed ===`);
  fails.forEach((f) => console.log("   FAILED: " + f));
  process.exit(fails.length ? 1 : 0);
})();
