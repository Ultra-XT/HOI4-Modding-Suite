// ⛔ #the-map-page-guessed-at-vanilla-from-a-substring — TWO GUARDS, ONE QUESTION, AND THEY DISAGREED.
//
// "Is this write aimed at the vanilla game?" is asked twice.
//
//   SERVER  checkActiveRootNotGameRoot — resolved-path equality with resolveHoi4GameRoot(). This is the one
//           that ENFORCES it: every map write endpoint calls it.
//   PAGE    public/map.js, on the save path:
//               const isVanillaTarget = (p) => !p || /steamapps[\\/]common[\\/]hearts of iron iv/i.test(p);
//
// A `true` on the page does not merely warn. It window.confirms "You're saving to the VANILLA Hearts of Iron
// IV game files — not a mod", and on yes POSTs /api/settings/allow-vanilla-edits {allowed:true}, which clears
// the vanilla-write guard for EVERY endpoint for the rest of the session and stays cleared afterwards.
//
// Both predicates RUN side by side over seven paths — the page's lifted out of the file, not transcribed —
// and 4 disagreed, every one in the direction that offers to drop the guard:
//
//     page  server  path
//     true  false   (nothing selected)
//     true  true    D:/SteamLibrary/steamapps/common/Hearts of Iron IV
//     true  false   …/Hearts of Iron IV/mod/mymod           a mod stored inside the game folder
//     true  false   …/Hearts of Iron IV backup/mymod        a folder whose name merely starts with the game's
//     true  false   D:/steamapps/common/hearts of iron iv   a library path that is not where HOI4 is installed
//
// ⭐ A guard that exists in both places and disagrees is worse than one that exists in neither, because each
// side looks correct on its own and each trusts the other.
//
// The fix computes the fact where it is enforced — /api/map/model now carries `isVanilla` (the same path
// equality checkActiveRootNotGameRoot applies) and `modSelected` — and the page words it. The substring
// survives only as the fallback for a model that has not answered, which is the shape research.js and army.js
// already use. `isVanilla: true` on /api/mods is documented in server.js as "the AUTHORITATIVE (path-based)
// flag clients should key vanilla/read-only detection off"; the map page simply never had one.
//
// ⚠️ AND "NOTHING SELECTED" WAS NEVER THE SAME QUESTION. modPath() is localStorage, while every endpoint
// falls back to getActiveRoot() — so an empty box does not mean there is no active mod, and it is certainly
// not a reason to offer to write into the game install. The same file already had the right answer in
// commitRiverEdits: "Pick a mod first."
//
// Run: node test-the-map-page-asks-the-server-whether-it-is-vanilla.js
"use strict";
// #a-bare-test-run-writes-into-the-real-app-data — FIRST: run bare, the server this starts inherits the sandbox.
require("./safe-write.js");
const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");
const { spawn } = require("child_process");
const { maskJsComments } = require("./testlib-strip-comments.js");

let checks = 0;
const fails = [];
const ok = (label, cond, extra) => {
  checks++;
  console.log((cond ? "  ok   " : "  FAIL ") + label + (cond || extra === undefined ? "" : "  -> " + JSON.stringify(extra)));
  if (!cond) fails.push(label);
};

// ⚠️ A plain constant, not process.env.NOVA_PORT — that name marks a test that drives the LIVE app. This one
// starts its own server, and the runner reads the constant as this file's claim on the port.
const PORT = 54613;

// ⛔ IS THIS SERVER OURS? A port that answers is not a server you started. Writing this test, the port was
// already held by another Nova on this machine: the spawn below died with EADDRINUSE (stdio is "ignore", so
// it said nothing), the readiness probe got a cheerful 200 from the stranger, and four checks failed against
// an app that simply did not have the change. The suite's own runner learned this the hard way — its live-app
// tests "used to fall back to the app's own default port and drive whatever was listening".
//
// So readiness is not "something answered": it is "something answered AND it is standing in this test's
// fixture world". The game root is the tell — ours is a temp directory with a fake hoi4.exe in it, which no
// other server on this machine can be pointed at.
const answersAsOurs = async (getter, modRoot, gameRoot) => {
  const m = await getter("/api/map/model?modPath=" + encodeURIComponent(modRoot));
  return !!(m && m.ok === true && m.gameRoot
    && path.resolve(String(m.gameRoot)).toLowerCase() === path.resolve(gameRoot).toLowerCase());
};

const RAW = fs.readFileSync(path.join(__dirname, "public", "map.js"), "utf8");
const MAPJS = maskJsComments(RAW);

console.log("\n=== 1. ⭐⭐ RUN THE PAGE'S OWN PREDICATE — a source assertion is not a control ===");
// Lifted out of the file and executed. `model` is a module-level `let` in map.js, so it is supplied as a
// parameter here: that is the binding the arrow closes over.
const build = (() => {
  // ⚠️ `;\r?\n`, not `;\n`. public/map.js is CRLF in a fresh checkout and LF in others, and an anchor on a
  // bare newline matches nothing while reporting success — the single most common way an edit here appears
  // to work and does not.
  const m = /const isVanillaTarget = [\s\S]*?;\r?\n/.exec(RAW.slice(RAW.indexOf("const isVanillaTarget")));
  if (!m) return null;
  try { return (model) => new Function("model", m[0] + "\nreturn isVanillaTarget;")(model); } catch (_) { return null; }
})();
ok("isVanillaTarget was lifted out of public/map.js", !!build);
if (build) {
  const STEAM = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
  // ⭐ THE WHOLE POINT: the server says this path is NOT the install, and the page now believes it.
  const believesServerNo = build({ isVanilla: false });
  ok("⭐⭐⭐ RUN: a path that LOOKS like the game folder is not vanilla when the server says it is not",
    believesServerNo(STEAM + "/mod/mymod") === false);
  ok("⭐⭐ RUN: …nor is a folder whose name merely starts with the game's",
    believesServerNo(STEAM + " backup/mymod") === false);
  ok("⭐⭐ RUN: …nor a steamapps path in a library HOI4 is not installed in",
    believesServerNo("D:/steamapps/common/hearts of iron iv") === false);
  ok("⭐⭐⭐ RUN: …and an EMPTY mod path is no longer 'the vanilla game files'",
    believesServerNo("") === false);
  const believesServerYes = build({ isVanilla: true });
  ok("⭐⭐ RUN: …and when the server says it IS the install, the page agrees whatever the path spells",
    believesServerYes(STEAM) === true && believesServerYes("/somewhere/else") === true);
  // The fallback half: a model that has not answered (an older server, or before the first load) keeps the
  // behaviour that was there before, so nothing regresses on a page whose model has not arrived.
  const noAnswer = build(null);
  ok("RUN, THE FALLBACK: with no model answer the substring test still applies", noAnswer(STEAM) === true);
  ok("RUN, THE FALLBACK: …and an ordinary mod is still not vanilla",
    noAnswer("C:/Users/x/Documents/Paradox Interactive/Hearts of Iron IV/mod/mine") === false);
  ok("⚠️ RUN: …but an empty path is not vanilla even then — that was never this question",
    noAnswer("") === false);
}

console.log("\n=== 2. THE SAVE PATH ASKS BEFORE IT OFFERS TO DROP THE GUARD ===");
// Whole statements, not fragments: `if (false && …)` satisfies any fragment of the condition.
// ⚠️ Read inline off `model`, not through a helper. The first draft added `mapModSelected()` and broke three
// tests that LIFT flushMapSaves out of this file and RUN it — a new free identifier is a ReferenceError in
// every one of their constructed scopes. The lesson is pinned here so the helper is not reintroduced.
ok("⛔ the save refuses outright when the server has no mod to write into",
  /if \(model && model\.modSelected === false\) \{/.test(MAPJS) && /Pick a mod first/.test(MAPJS));
ok("…and it does so BEFORE the vanilla confirm that flips the guard",
  (() => {
    const at = MAPJS.indexOf("if (model && model.modSelected === false) {");
    const van = MAPJS.indexOf("if (isVanillaTarget(modPath())) {");
    return at !== -1 && van !== -1 && at < van;
  })());
ok("…and the flip is still the only thing that turns the guard on, from the same place",
  /allow-vanilla-edits[\s\S]{0,400}allowed: true/.test(MAPJS));
ok("⭐ …and it introduces no new free identifier into flushMapSaves, which three tests lift and run",
  !/mapModSelected/.test(MAPJS));
ok("`=== false` on purpose: a model that has not answered must not block a save",
  /model && model\.modSelected === false/.test(MAPJS) && !/!model\.modSelected/.test(MAPJS));

console.log("\n=== 3. …AND THE PAGE DOES NOT DECIDE IT ALONE ANY MORE ===");
ok("⭐ isVanillaTarget consults the model before the substring",
  /\(model && model\.isVanilla !== undefined\)[\s\S]{0,80}model\.isVanilla === true/.test(MAPJS));
ok("…which is the shape research.js and army.js already use for the same question",
  /isVanilla === undefined/.test(maskJsComments(fs.readFileSync(path.join(__dirname, "public", "army.js"), "utf8"))));

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "nova-vanillacousin-"));
const APPDATA = path.join(tmp, "appdata");
const HOME = path.join(tmp, "home");
const HOI4_USER = path.join(tmp, "hoi4user");
for (const d of [APPDATA, HOME, path.join(HOI4_USER, "logs")]) fs.mkdirSync(d, { recursive: true });
process.env.NOVA_HOME_DIR = HOME;

const w = (root, rel, body) => {
  const p = path.join(root, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, body);
};
const N = 12;
const csv = (() => {
  const rows = ["0;0;0;0;land;false;unknown;0"];
  for (let i = 1; i <= N; i++) rows.push(`${i};${i};${i};${i};${i <= 8 ? "land" : "sea"};false;${i <= 8 ? "plains" : "ocean"};${i <= 8 ? 1 : 0}`);
  return rows.join("\n") + "\n";
})();
// A stand-in game root: resolveHoi4GameRoot only tests that hoi4.exe EXISTS, so the real install is never
// read and this test does not depend on what is on the machine.
const GAME = path.join(tmp, "game");
w(GAME, "hoi4.exe", "not a real executable");
w(GAME, "map/definition.csv", csv);
w(GAME, "history/states/1-Base.txt", 'state = { id = 1 name = "Base" provinces = { 1 2 } history = { owner = GER } }');
const MODS = path.join(tmp, "mods");
const mod = path.join(MODS, "amod");
w(mod, "descriptor.mod", 'name="AMod"\nsupported_version="1.19.*"\n');
w(mod, "map/definition.csv", csv);
// The case the substring test gets wrong: a mod that LIVES INSIDE the game folder. It is a mod, and the
// server will happily write to it — the page used to call it "the VANILLA game files".
const inside = path.join(GAME, "mod", "insider");
w(inside, "descriptor.mod", 'name="Insider"\nsupported_version="1.19.*"\n');
w(inside, "map/definition.csv", csv);

const get = (p) => new Promise((resolve) => {
  const q = http.get({ host: "127.0.0.1", port: PORT, path: p }, (res) => {
    let b = "";
    res.on("data", (c) => (b += c));
    res.on("end", () => { let j; try { j = JSON.parse(b); } catch (_) { j = { raw: b.slice(0, 200) }; } j.__status = res.statusCode; resolve(j); });
  });
  q.on("error", (e) => resolve({ error: String(e) }));
  q.setTimeout(120000, () => { q.destroy(); resolve({ error: "timeout" }); });
});

const done = (srv) => {
  try { srv.kill(); } catch (_) {}
  // Scratch fixtures only — never a mod directory (⛔ CLAUDE.md #1).
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) {}
};

(async () => {
  const srv = spawn(process.execPath, ["server.js"], {
    cwd: __dirname, stdio: "ignore",
    env: {
      ...process.env, PORT: String(PORT), APPDATA, XDG_CONFIG_HOME: APPDATA,
      NOVA_APP_DATA_DIR: path.join(APPDATA, "NovaModdingSuite"),
      NOVA_HOME_DIR: HOME, HOI4_MOD_ROOT: MODS, HOI4_USER_DIR: HOI4_USER, HOI4_ROOT: GAME,
    },
  });
  process.on("exit", () => done(srv));

  try {
    let up = false;
    for (let i = 0; i < 90 && !up; i++) {
      await new Promise((r) => setTimeout(r, 500));
      if (srv.exitCode !== null) break;   // spawn died (EADDRINUSE, most likely) — stop waiting
      up = await answersAsOurs(get, mod, GAME).catch(() => false);
    }
    ok(`⛔ the server answering on ${PORT} is the one this test started (it stands in this test's game root)`,
      up, { childExited: srv.exitCode, hint: "another Nova may be holding this port" });
    if (!up) throw new Error("no server of ours");

    console.log("\n=== 4. ⛔ THE SERVER NOW SHIPS THE ANSWER IT ENFORCES ===");
    const ordinary = await get("/api/map/model?modPath=" + encodeURIComponent(mod));
    ok("an ordinary mod loads", ordinary.ok === true, ordinary.error || ordinary.raw);
    ok("⭐⭐ …and the model says it is not the vanilla install", ordinary.isVanilla === false, ordinary.isVanilla);
    ok("…and that a mod is selected", ordinary.modSelected === true, ordinary.modSelected);

    const game = await get("/api/map/model?modPath=" + encodeURIComponent(GAME));
    ok("the game root loads", game.ok === true, game.error || game.raw);
    ok("⭐⭐⭐ …and the model says it IS the vanilla install", game.isVanilla === true, game.isVanilla);

    const insider = await get("/api/map/model?modPath=" + encodeURIComponent(inside));
    ok("a mod stored INSIDE the game folder loads", insider.ok === true, insider.error || insider.raw);

    console.log("\n=== 5. ⭐⭐⭐ THE FLAG IS WHAT THE WRITE GUARD ENFORCES, NOT A THIRD OPINION ===");
    // 🚫 THIS REFUTED THE FIRST SHAPE OF THE FIX. `isVanilla` was written as equality with the game root, the
    // rule checkActiveRootNotGameRoot applies — which makes a mod stored inside the game folder "not vanilla".
    // Then the endpoint was actually DRIVEN, and it refuses that write: the map write paths go through
    // assertPathNotInGameRoot, which is `isPathUnderRoot`. Answering "not vanilla" there would have swapped
    // one disagreement for another — the page would not offer to enable vanilla editing for the one write
    // that needs it, leaving the modder with a raw refusal and no way forward. So the question is asked of
    // the write itself, and the flag has to match the answer.
    const create = (modPath) => new Promise((resolve) => {
      const data = JSON.stringify({ modPath, name: "", owner: "AAA" });
      const req = http.request({
        host: "127.0.0.1", port: PORT, path: "/api/map/create-state", method: "POST",
        headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data) },
      }, (res) => {
        let b = "";
        res.on("data", (c) => (b += c));
        res.on("end", () => { let j; try { j = JSON.parse(b); } catch (_) { j = { raw: b.slice(0, 200) }; } resolve(j); });
      });
      req.on("error", (e) => resolve({ error: String(e) }));
      req.setTimeout(120000, () => { req.destroy(); resolve({ error: "timeout" }); });
      req.write(data); req.end();
    });
    const insiderWrite = await create(inside);
    ok("driving the write: a mod inside the game folder is REFUSED as a vanilla write",
      insiderWrite.ok !== true && /vanilla/i.test(String(insiderWrite.error || "")),
      { ok: insiderWrite.ok, error: String(insiderWrite.error || insiderWrite.raw || "").slice(0, 120) });
    ok("⭐⭐⭐ …and the model said so too, so the page will offer the one thing that unblocks it",
      insider.isVanilla === true, insider.isVanilla);

    const ordinaryWrite = await create(mod);
    ok("…while an ordinary mod outside it is written", ordinaryWrite.ok === true,
      { ok: ordinaryWrite.ok, error: String(ordinaryWrite.error || ordinaryWrite.raw || "").slice(0, 120) });
    ok("⭐⭐⭐ …and the model said THAT too — the flag and the guard give the same answer both ways",
      ordinary.isVanilla === false, ordinary.isVanilla);

    const allow = await get("/api/settings/allow-vanilla-edits");
    ok("…and the vanilla-write guard was never turned off to get any of this", allow.allowed === false, allow.allowed);
  } catch (e) {
    fails.push("threw: " + (e && e.message));
    console.log("  FAIL threw: " + (e && e.stack ? e.stack.split("\n").slice(0, 4).join(" | ") : e));
  }

  done(srv);
  console.log("\n" + (fails.length ? "FAILED " + fails.length + " of " + checks : "PASSED " + checks + " checks"));
  if (fails.length) { for (const f of fails) console.log("  - " + f); process.exit(1); }
})();
