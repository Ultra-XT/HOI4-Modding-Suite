// ⛔ #generate-a-world-is-gated-outside-the-browser-too — ONE REQUEST REBUILDS A MOD'S WHOLE WORLD, SO THE REQUEST MUST SAY IT MEANT IT.
//
// The sibling rule (#generate-land-is-gated-only-in-the-browser, test-generate-land-is-gated-outside-the-browser-too.js): the typed
// GENERATE box lives in the page, so "it is the unattended caller that now has to say it meant it". POST /api/map/world-run deletes
// the mod's state files and rewrites its map in one request, and server.js has no Origin/CSRF check — express.json() leaves a
// text/plain or form body as {} — so the critic's V4: a body-less or cross-site POST would have started a five-minute rebuild of
// whatever mod is active (the prototype fell back to getActiveRoot()).
//
// The routes (/api/map/world-run, and /api/map/prepare-world when it writes) now refuse, with 400 and BEFORE anything is forked,
// a folder made or a file written, unless the JSON body
//   · names the mod (modPath) — no fallback to the active mod;
//   · says confirm: true (the page sends it only from #mapWorldGo);
//   · says replacesOwnWorld: true when the mod has a world of its own (the page sends it only once GENERATE is typed);
// and the mod is not the game, a Workshop download, or a copy the game does not load. Every refusal names itself (`refused`), which
// the stop note relies on to say "Nothing was written to your mod".
// Checked: each refusal is a 400 with `refused`, no world-builder process is forked (child_process.fork counted), no run record is
// written, and every file and folder of the sandbox hashes the same before and after. THE CONTROLS: the same mod with confirm: true
// starts a run (one fork), and the own-world mod starts one once replacesOwnWorld: true is said.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const cp = require("child_process");

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (ok || detail == null ? "" : "   -> " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 600)));
  if (!ok) fails.push(label);
};

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-world-gate-"));
const DIRS = { game: "game", mods: "mods", home: "home", app: "appdata", user: "hoi4-user", docs: "Documents", ws: "workshop" };
for (const k of Object.keys(DIRS)) { DIRS[k] = path.join(ROOT, DIRS[k]); fs.mkdirSync(DIRS[k], { recursive: true }); }
Object.assign(process.env, {
  HOI4_ROOT: DIRS.game, HOI4_MODS_ROOT: DIRS.mods, NOVA_HOME_DIR: DIRS.home, APPDATA: DIRS.app, NOVA_APP_DATA_DIR: DIRS.app,
  XDG_CONFIG_HOME: DIRS.app, HOI4_USER_DIR: DIRS.user, NOVA_DOCUMENTS_DIR: DIRS.docs, HOI4_WORKSHOP_ROOT: DIRS.ws,
});
delete process.env.NOVA_WORLD_JOB;
const SW = require("./testlib-split-world.js");
SW.makeGame(DIRS.game, SW.makeShapes({}), {});
// count every fork: server.js reaches it as require("child_process").fork at the moment it starts a run
let forks = 0;
const realFork = cp.fork;
cp.fork = function countedFork(...a) { forks++; return realFork.apply(this, a); };
const srvModule = require("./server.js");
const { NOVA_APP_DATA_DIR } = require("./safe-write.js");
const RECORD = path.join(NOVA_APP_DATA_DIR, "world-run.json");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const listen = (app) => new Promise((res, rej) => { const s = app.listen(0, "127.0.0.1", () => res(s)); s.on("error", rej); });
/** Every file (sha1) and folder under the sandbox — a folder made by a refused request shows here too. */
function snapshot() {
  const out = new Map();
  const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) { out.set(p + path.sep, "dir"); walk(p); } else out.set(p, crypto.createHash("sha1").update(fs.readFileSync(p)).digest("hex")); } };
  walk(ROOT);
  return out;
}
const diff = (a, b) => [...new Set([...a.keys(), ...b.keys()])].filter((k) => a.get(k) !== b.get(k)).map((k) => k.replace(ROOT, "<sandbox>"));

(async () => {
  let srv = null;
  try {
    const app = srvModule.createApp();
    srv = await listen(app);
    const base = `http://127.0.0.1:${srv.address().port}`;
    const send = (ep, body, type = "application/json") => fetch(base + ep, { method: "POST", headers: { "Content-Type": type }, body: typeof body === "string" ? body : JSON.stringify(body) })
      .then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));
    const get = (ep) => fetch(base + ep).then((r) => r.json());

    // the fixture: a fresh mod (it inherits its whole world) and a mod with a world of its own (its own state file)
    const A = (await send("/api/mod/create", { modName: "Gate Fresh" })).body.modRoot;
    const B = (await send("/api/mod/create", { modName: "Gate Own" })).body.modRoot;
    fs.mkdirSync(path.join(B, "history", "states"), { recursive: true });
    fs.writeFileSync(path.join(B, "history", "states", "1-Mine.txt"), "state = {\n\tid = 1\n\tname = \"STATE_1\"\n\tprovinces = { 1 }\n}\n");
    // a Workshop download (Steam puts its files back) — the refusal must come before anything is made in it
    const WS = path.join(DIRS.ws, "2000000001");
    fs.mkdirSync(WS, { recursive: true });
    fs.writeFileSync(path.join(WS, "descriptor.mod"), 'version="1"\nname="Somebody else\'s mod"\nsupported_version="1.19.*"\n');
    rec("THE FIXTURE: two mods made the way 🏠 New mod makes them, one with a state file of its own, and a Workshop folder", !!A && !!B && fs.existsSync(path.join(B, "history", "states", "1-Mine.txt")));
    // a copy the game does not load (#two-documents-folders): mods\copied_mod\ beside a copied_mod.mod whose path= names the live
    // folder elsewhere — and a mod folder that is no longer there. Each refusal must say WHICH rule refused, not "game-root" for all
    // (the shared guard checkActiveRootNotGameRoot throws all three; the gate used to label every one of them "game-root")
    const LIVE = path.join(ROOT, "elsewhere", "copied_mod");
    const COPY = path.join(DIRS.mods, "copied_mod");
    for (const d of [LIVE, COPY]) { fs.mkdirSync(d, { recursive: true }); fs.writeFileSync(path.join(d, "descriptor.mod"), 'version="1"\nname="Copied"\nsupported_version="1.*"\n'); }
    fs.writeFileSync(path.join(DIRS.mods, "copied_mod.mod"), `version="1"\nname="Copied"\nsupported_version="1.*"\npath="${LIVE.replace(/\\/g, "/")}"\n`);
    const GONE = path.join(DIRS.mods, "gone_mod");
    const planB = (await send("/api/map/prepare-world", { modPath: B, dryRun: true })).body;
    rec("THE FIXTURE: the plan (a dry run, never refused for consent) says B has a world of its own and A does not",
      planB && planB.ok && planB.plan.ownsWorld === true && (await send("/api/map/prepare-world", { modPath: A, dryRun: true })).body.plan.ownsWorld === false, planB);
    // the active mod is A: the old fallback would have rebuilt it for a request that named no mod
    srvModule.setActiveRoot(A);

    const before = snapshot();
    const forks0 = forks;
    const valid = { landShare: 35, seed: 1, ownerMode: "inherit", owner: "" };
    const refusals = [
      ["world-run: {} (no mod named; the active mod is NOT used)", "/api/map/world-run", {}, "application/json", "no-mod"],
      ["world-run: a text/plain body (what a cross-site form sends) — parsed as {}", "/api/map/world-run", JSON.stringify(Object.assign({ modPath: A, confirm: true }, valid)), "text/plain", "no-mod"],
      ["world-run: a form-encoded body — parsed as {}", "/api/map/world-run", `modPath=${encodeURIComponent(A)}&confirm=true&landShare=35`, "application/x-www-form-urlencoded", "no-mod"],
      ["world-run: the mod named, no confirm", "/api/map/world-run", Object.assign({ modPath: A }, valid), "application/json", "no-confirm"],
      ["world-run: confirm as a string, not true", "/api/map/world-run", Object.assign({ modPath: A, confirm: "true" }, valid), "application/json", "no-confirm"],
      ["world-run: a mod with a world of its own, confirm but no replacesOwnWorld", "/api/map/world-run", Object.assign({ modPath: B, confirm: true }, valid), "application/json", "own-world"],
      ["world-run: …replacesOwnWorld as a string, not true", "/api/map/world-run", Object.assign({ modPath: B, confirm: true, replacesOwnWorld: "yes" }, valid), "application/json", "own-world"],
      ["world-run: the base game", "/api/map/world-run", Object.assign({ modPath: DIRS.game, confirm: true }, valid), "application/json", "game-root"],
      ["world-run: a Workshop download", "/api/map/world-run", Object.assign({ modPath: WS, confirm: true }, valid), "application/json", "workshop"],
      ["world-run: a copy the game does not load", "/api/map/world-run", Object.assign({ modPath: COPY, confirm: true }, valid), "application/json", "not-loaded"],
      ["prepare-world (the confirm's plan): a copy the game does not load", "/api/map/prepare-world", { modPath: COPY, dryRun: true }, "application/json", "not-loaded"],
      ["world-run: a mod folder that is no longer there", "/api/map/world-run", Object.assign({ modPath: GONE, confirm: true }, valid), "application/json", "missing-folder"],
      ["prepare-world: {}", "/api/map/prepare-world", {}, "application/json", "no-mod"],
      ["prepare-world: the mod named, neither dryRun nor confirm", "/api/map/prepare-world", { modPath: A }, "application/json", "no-confirm"],
      ["prepare-world: own world, confirm but no replacesOwnWorld", "/api/map/prepare-world", { modPath: B, confirm: true }, "application/json", "own-world"],
    ];
    for (const [what, ep, body, type, code] of refusals) {
      const r = await send(ep, body, type);
      rec(`⭐ ${what} → 400, refused "${code}", nothing started`, r.status === 400 && r.body && r.body.ok === false && r.body.refused === code && typeof r.body.error === "string" && r.body.error.length > 10, r);
    }
    const ownRefusal = await send("/api/map/world-run", Object.assign({ modPath: B, confirm: true }, valid));
    rec("⭐ the own-world refusal names what of a world the mod has, in the confirm's words", /^This mod has a world of its own \(1 state file\)\. Generate a world replaces it, and this request did not say the modder agreed to that \(the page asks them to type GENERATE\)\. Nothing was written\.$/.test((ownRefusal.body || {}).error || ""), ownRefusal.body && ownRefusal.body.error);
    rec("⭐⭐ no world builder was forked for any of them", forks === forks0, { forks: forks - forks0 });
    rec("⭐⭐ …no run is going and no run record was written", (await get("/api/map/world-run")).run === null && !fs.existsSync(RECORD));
    const changed = diff(before, snapshot());
    rec("⭐⭐ …and not one file or folder of the sandbox changed (no folder made either)", changed.length === 0, changed.slice(0, 10));

    console.log("\nTHE CONTROLS: the same requests, saying they meant it, start a run");
    const ok1 = await send("/api/map/world-run", Object.assign({ modPath: A, confirm: true }, valid));
    rec("THE CONTROL: the fresh mod with confirm: true starts a run (one fork)", ok1.status === 200 && ok1.body && ok1.body.ok === true && forks === forks0 + 1, ok1);
    for (let i = 0; i < 600; i++) { const g = await get("/api/map/world-run"); if (g.run && g.run.state !== "running") break; await sleep(100); }
    const run1 = (await get("/api/map/world-run")).run;
    rec("…which runs to its end", run1 && run1.state === "done", run1 && { state: run1.state, error: run1.error });
    const ok2 = await send("/api/map/world-run", Object.assign({ modPath: B, confirm: true, replacesOwnWorld: true }, valid));
    rec("THE CONTROL: the own-world mod, with replacesOwnWorld: true, starts a run", ok2.status === 200 && ok2.body && ok2.body.ok === true && forks === forks0 + 2, ok2);
    for (let i = 0; i < 600; i++) { const g = await get("/api/map/world-run"); if (g.run && g.run.state !== "running") break; await sleep(100); }
  } catch (e) {
    rec("HARNESS ERROR", false, e && e.stack);
  } finally {
    try { if (srv) { try { srv.closeAllConnections(); } catch (_) {} srv.close(); } } catch (_) {}
    cp.fork = realFork;
    try { fs.rmSync(ROOT, { recursive: true, force: true, maxRetries: 3 }); } catch (_) { /* this test's own mkdtemp sandbox only */ }
  }
  console.log(`\n=== 🌍 Generate a world is gated outside the browser too: ${checks} checks, ${fails.length} failed ===`);
  if (fails.length) { for (const f of fails) console.log("   FAILED: " + f); process.exitCode = 1; }
  setTimeout(() => process.exit(process.exitCode || 0), 50);
})();
