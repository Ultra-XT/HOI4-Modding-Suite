// ⛔ While 🌍 Generate a world runs, NOTHING else writes — by any spelling of the route Express answers.
// #the-world-lock-holds-for-every-spelling (review-safety of the world run)
//
// The lock (server.js installWorldRun) answers 423 to every non-GET request whose req.path starts with "/api/". Express routes
// case-INSENSITIVELY unless "case sensitive routing" is set (it is not here), so "/API/map/prepare-world" reaches the very handler
// "/api/map/prepare-world" does — and the lock's startsWith is case-sensitive. Measured on the real game (review-safety probe-server.js):
// during a run, POST /api/map/prepare-world answered 423 and POST /API/map/prepare-world answered 200 and copied a 34 MB province
// map and spliced two descriptors into another mod; POST /API/map/auto-fix ran a whole Auto-fix in the main server meanwhile.
//
// Pinned on a small fixture world: with a run going, a write route answers 423 under the spelling the page uses AND under the
// other spellings Express routes the same way (derived: the route's path with its letters' case changed), and the mod it names is
// left byte-identical. THE CONTROL: the same request after the run writes.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (ok || detail == null ? "" : "   -> " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 500)));
  if (!ok) fails.push(label);
};
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-world-lock-"));
const DIRS = { game: "game", mods: "mods", home: "home", app: "appdata", user: "hoi4-user", docs: "Documents", ws: "workshop" };
for (const k of Object.keys(DIRS)) { DIRS[k] = path.join(ROOT, DIRS[k]); fs.mkdirSync(DIRS[k], { recursive: true }); }
Object.assign(process.env, {
  HOI4_ROOT: DIRS.game, HOI4_MODS_ROOT: DIRS.mods, NOVA_HOME_DIR: DIRS.home, APPDATA: DIRS.app, NOVA_APP_DATA_DIR: DIRS.app,
  XDG_CONFIG_HOME: DIRS.app, HOI4_USER_DIR: DIRS.user, NOVA_DOCUMENTS_DIR: DIRS.docs, HOI4_WORKSHOP_ROOT: DIRS.ws,
});
delete process.env.NOVA_WORLD_JOB;
const SW = require("./testlib-split-world.js");
SW.makeGame(DIRS.game, SW.makeShapes({}), {});
const { createApp } = require("./server.js");
const sha = (p) => { try { return crypto.createHash("sha1").update(fs.readFileSync(p)).digest("hex"); } catch (_) { return "(none)"; } };
const hashDir = (d) => { const o = {}; const w = (x) => { let es = []; try { es = fs.readdirSync(x, { withFileTypes: true }); } catch (_) { return; } for (const e of es) { const p = path.join(x, e.name); if (e.isDirectory()) w(p); else o[path.relative(d, p)] = sha(p); } }; w(d); return JSON.stringify(o); };

(async () => {
  const app = createApp();
  const server = await new Promise((res, rej) => { const s = app.listen(0, "127.0.0.1", () => res(s)); s.on("error", rej); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = (method, ep, body) => fetch(base + ep, method === "GET" ? undefined : { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body || {}) })
    .then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));
  const post = (ep, b) => call("POST", ep, b);
  try {
    const A = (await post("/api/mod/create", { modName: "Lock A" })).body.modRoot;
    const B = (await post("/api/mod/create", { modName: "Lock B" })).body.modRoot;
    rec("THE CONTROL: two mods made the way New mod makes them", !!A && !!B, { A, B });
    // the spellings Express routes alike, derived from the route itself: as written, upper-cased, and with the first letter of
    // each segment upper-cased
    const route = "/api/map/prepare-world";
    rec("THE CONTROL: this app routes without regard to case (Express's default), so every spelling below reaches the handler", !app.get("case sensitive routing"));
    const spellings = [...new Set([route, route.toUpperCase(), route.replace(/\/([a-z])/g, (m, c) => "/" + c.toUpperCase())])];
    const start = await post("/api/map/world-run", { modPath: A, confirm: true, landShare: 35, seed: 1, ownerMode: "inherit", owner: "" });
    rec("the run starts", start.status === 200 && start.body && start.body.ok === true, start.body);
    const bBefore = hashDir(B);
    for (const sp of spellings) {
      const g = await call("GET", "/api/map/world-run");
      const going = g.body && g.body.run && g.body.run.state === "running";
      const r = await post(sp, { modPath: B, confirm: true });
      rec(`⭐⭐⭐ while it runs, POST ${sp} is answered 423`, going && r.status === 423 && r.body && r.body.worldRunActive === true, { going, status: r.status, body: r.body && { ok: r.body.ok, error: r.body.error, bitmapCopied: r.body.bitmapCopied } });
    }
    rec("⭐⭐⭐ …and mod B is byte-identical (nothing reached it)", hashDir(B) === bBefore);
    for (let i = 0; i < 900; i++) {
      const g = await call("GET", "/api/map/world-run");
      if (g.body && g.body.run && g.body.run.state !== "running" && g.body.run.state !== "finishing") break;
      await new Promise((r) => setTimeout(r, 200));
    }
    const after = await post(route, { modPath: B, confirm: true });
    rec("THE CONTROL: after the run the same request writes (so the 423s were the lock, not a refusal)", after.status === 200 && after.body && after.body.ok === true && after.body.bitmapCopied === true, after.body);
  } catch (e) {
    rec("the test ran to the end", false, e && e.stack);
  } finally {
    server.close();
    try { server.closeAllConnections(); } catch (_) {}
  }
  console.log(`\n${checks - fails.length}/${checks} checks passed`);
  if (fails.length) { console.log("FAILED:\n  " + fails.join("\n  ")); process.exitCode = 1; }
  setTimeout(() => process.exit(process.exitCode || 0), 50);
})();
