// 🌍 #a-finished-world-is-not-called-stopped — THE BUILDER'S LAST WORDS MUST REACH THE MAIN SERVER BEFORE ITS EXIT IS BELIEVED.
//
// world-run.js ends by sending its last step events and { t: "done" }, then exits 50 ms later; server.js's child.on("exit") calls a
// run that is still "running" failed — "the world builder stopped unexpectedly (exit code …)". Node delivers a child's 'exit' and its
// IPC messages through different handles, and when the main server's loop is busy as the builder ends (a heavy request from another
// page, a long GC), 'exit' is emitted FIRST. Measured (reviewer, a forked child sending three messages then exiting 50 ms later):
// the parent blocked 1 s heard 'exit' before 'done' 15 times in 15 (and with a 300 KB message before it, heard no message at all,
// 10 in 10); blocked 0, 40 or 100 ms, never. End to end on this fixture: every step done, 6b skipped — and the page said "⛔ Generate a
// world stopped at step 6 of 6 — Check the map. What went wrong: the world builder stopped unexpectedly (exit code 0)".
//
// This runs a real world on the split-world fixture, with the builder's check step held 1.5 s (a preload in the builder only) so the
// main loop can be made busy for 3 s exactly as the builder ends, and requires the run to end "done". The control: the same run with
// the loop left free.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (ok || detail == null ? "" : "   -> " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 600)));
  if (!ok) fails.push(label);
};
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-world-last-step-"));
const DIRS = { game: "game", mods: "mods", home: "home", app: "appdata", user: "hoi4-user", docs: "Documents", ws: "workshop" };
for (const k of Object.keys(DIRS)) { DIRS[k] = path.join(ROOT, DIRS[k]); fs.mkdirSync(DIRS[k], { recursive: true }); }
Object.assign(process.env, {
  HOI4_ROOT: DIRS.game, HOI4_MODS_ROOT: DIRS.mods, NOVA_HOME_DIR: DIRS.home, APPDATA: DIRS.app, NOVA_APP_DATA_DIR: DIRS.app,
  XDG_CONFIG_HOME: DIRS.app, HOI4_USER_DIR: DIRS.user, NOVA_DOCUMENTS_DIR: DIRS.docs, HOI4_WORKSHOP_ROOT: DIRS.ws,
});
delete process.env.NOVA_WORLD_JOB;
const SW = require("./testlib-split-world.js");
SW.makeGame(DIRS.game, SW.makeShapes({}), {});
// held in the BUILDER only (NOVA_WORLD_JOB is set there): the check's validate waits 1.5 s, so the test can see the step is on
const HOLD = path.join(ROOT, "hold-the-check.js");
fs.writeFileSync(HOLD, [
  '"use strict";',
  "if (process.env.NOVA_WORLD_JOB) {",
  `  const md = require(${JSON.stringify(path.join(__dirname, "map-data.js"))});`,
  "  const real = md.validateMapModel;",
  "  md.validateMapModel = function () { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1500); return real.apply(this, arguments); };",
  "}",
].join("\n") + "\n");
// unquoted: NODE_OPTIONS takes a bare path (the temp folder holds no space here; a spaced one would need the quotes node accepts)
process.env.NODE_OPTIONS = `--require ${HOLD.replace(/\\/g, "/")}`;
const { createApp } = require("./server.js");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const listen = (app) => new Promise((res, rej) => { const s = app.listen(0, "127.0.0.1", () => res(s)); s.on("error", rej); });
const client = (base) => {
  const call = (method, ep, body) => fetch(base + ep, method === "GET" ? undefined : { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body == null ? {} : body) })
    .then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));
  return { get: (ep) => call("GET", ep), post: (ep, b) => call("POST", ep, b) };
};
const CHOICES = { landShare: 35, seed: 1, ownerMode: "inherit", owner: "", confirm: true };

async function oneRun(c, name, busyAtCheck) {
  const mod = (await c.post("/api/mod/create", { modName: name })).body.modRoot;
  const start = await c.post("/api/map/world-run", Object.assign({ modPath: mod }, CHOICES));
  if (!start.body || !start.body.ok) return { error: "did not start: " + JSON.stringify(start.body) };
  let busied = false;
  const t0 = Date.now();
  for (;;) {
    await sleep(100);
    const g = await c.get("/api/map/world-run");
    const run = g.body && g.body.run;
    if (busyAtCheck && !busied && run && run.state === "running" && run.step === "check") {
      busied = true;
      const tb = Date.now(); while (Date.now() - tb < 3000) { /* the main server's loop is busy as the builder ends */ }
    }
    if (run && run.state !== "running" && run.state !== "finishing") {
      await sleep(500);
      const full = (await c.get("/api/map/world-run?answers=1")).body.run;
      return { busied, state: full.state, error: full.error, steps: full.steps.map((s) => `${s.key}:${s.state}`) };
    }
    if (Date.now() - t0 > 120000) return { error: "no end in 120 s" };
  }
}

(async () => {
  const srv = await listen(createApp());
  const c = client(`http://127.0.0.1:${srv.address().port}`);
  try {
    const control = await oneRun(c, "Last Step A", false);
    rec("THE CONTROL: the held world, the main loop left free, ends done", control.state === "done", control);
    const busy = await oneRun(c, "Last Step B", true);
    rec("THE PROBE: the main loop was busy while the check step was on", busy.busied === true, busy);
    rec("⭐ …and the world, every step of it done, still ends done", busy.state === "done", busy);
    rec("⭐ …not \"the world builder stopped unexpectedly\"", !/stopped unexpectedly/.test(String(busy.error || "")), busy.error);
    rec("…its steps all heard (6b skipped or done, never not-run)", Array.isArray(busy.steps) && busy.steps.every((s) => /:(done|skipped)$/.test(s)), busy.steps);
  } finally {
    try { srv.closeAllConnections(); } catch (_) {}
    srv.close();
  }
  console.log(`\n${checks - fails.length}/${checks} checks passed`);
  if (fails.length) { console.log("FAILED:\n  " + fails.join("\n  ")); process.exitCode = 1; }
  setTimeout(() => process.exit(process.exitCode || 0), 300);
})().catch((e) => { console.error(e); process.exit(1); });
