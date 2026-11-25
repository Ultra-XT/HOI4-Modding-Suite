// 🌍 ⛔ #a-dead-builder-says-why — A WORLD BUILDER THAT DIES ON ITS OWN IS DESCRIBED BY WHY IT DIED, AND ONE THAT NEVER BEGAN SAYS IT WROTE
// NOTHING (review cr1, WR-3).
//
// server.js took the builder's LAST stderr line as "What went wrong": measured on node 24.14.1 and Electron 41.2.1, an out-of-memory
// (exit 134) ends on a native stack frame — "the world builder stopped unexpectedly (exit code 134): 47: 00007FFA99D7EE4C
// RtlUserThreadStart+44", its "FATAL ERROR: … JavaScript heap out of memory" line fifty lines up — and an uncaught exception on Node's
// footer, "…(exit code 1): Node.js v24.14.1". And a builder that died before it began a step (an exception as it loaded, a spawn
// that failed) was told "Make the map your mod's own stopped part-way and may already have written some of its files", when it had
// asked nothing of the mod.
//
// Driven through the real POST /api/map/world-run on testlib-split-world's fixture, the builder killed by a preload this test writes
// into its own sandbox (NODE_OPTIONS --require, which the fork inherits): no line of server.js or world-run.js is stood in for. The stop
// note is the page's own worldFailureNote (testlib-world-page). "Nothing was written" is held to the disk: the mod's files hashed before
// and after, and the copies folder Nova keeps under its .nova listed before and after.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (ok || detail == null ? "" : "   -> " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 900)));
  if (!ok) fails.push(label);
};
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-dead-builder-"));
const DIRS = { game: "game", mods: "mods", home: "home", app: "appdata", user: "hoi4-user", docs: "Documents", ws: "workshop" };
for (const k of Object.keys(DIRS)) { DIRS[k] = path.join(ROOT, DIRS[k]); fs.mkdirSync(DIRS[k], { recursive: true }); }
Object.assign(process.env, {
  HOI4_ROOT: DIRS.game, HOI4_MODS_ROOT: DIRS.mods, NOVA_HOME_DIR: DIRS.home, APPDATA: DIRS.app, NOVA_APP_DATA_DIR: DIRS.app,
  XDG_CONFIG_HOME: DIRS.app, HOI4_USER_DIR: DIRS.user, NOVA_DOCUMENTS_DIR: DIRS.docs, HOI4_WORKSHOP_ROOT: DIRS.ws,
});
delete process.env.NOVA_WORLD_JOB;
delete process.env.NODE_OPTIONS;
const SW = require("./testlib-split-world.js");
SW.makeGame(DIRS.game, SW.makeShapes({}), {});
const { createApp } = require("./server.js");
const WP = require("./testlib-world-page.js");
const NO_TIMERS = { setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, clearInterval() {} };
const P = WP.worldPage({ fetch: async () => { throw new Error("nothing to fetch"); }, timers: NO_TIMERS }).sb;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// The preload: how the builder dies (DEAD_MODE), and at which step (DEAD_STEP). Forward slashes: NODE_OPTIONS reads a backslash inside
// quotes as an escape, and Windows takes either.
const PRE = path.join(ROOT, "dead-builder-preload.js");
fs.writeFileSync(PRE, [
  '"use strict";',
  'const mode = process.env.DEAD_MODE || "", at = process.env.DEAD_STEP || "prepare";',
  "const oom = () => { const a = []; for (;;) a.push(new Array(1e5).fill({ x: Math.random() })); };",
  'if (mode === "throw-at-load") throw new Error("injected as the builder loaded");',
  'if (mode === "hold-at-load") Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 20000);',
  'if (mode === "oom-at-step" || mode === "throw-at-step") {',
  "  const send = process.send && process.send.bind(process);",
  "  if (send) process.send = (m, ...rest) => {",
  "    const r = send(m, ...rest);",
  '    if (m && m.t === "step" && m.key === at && m.state === "running") setImmediate(() => { if (mode === "oom-at-step") oom(); else throw new Error("injected once step " + at + " ran"); });',
  "    return r;",
  "  };",
  "}",
  "",
].join("\n"));

/** Every file under a folder, with a hash of its bytes: "nothing was written" is held to this. */
function treeHash(dir) {
  const out = [];
  const walk = (d, rel) => {
    let ents = [];
    try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch (_) { return; }
    for (const e of ents.sort((a, b) => a.name.localeCompare(b.name))) {
      const p = path.join(d, e.name), r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) walk(p, r);
      else out.push(r + ":" + crypto.createHash("sha1").update(fs.readFileSync(p)).digest("hex"));
    }
  };
  walk(dir, "");
  return out;
}
const listing = (dir) => treeHash(dir).map((x) => x.split(":")[0]);

(async () => {
  const app = createApp();
  const srv = await new Promise((res, rej) => { const s = app.listen(0, "127.0.0.1", () => res(s)); s.on("error", rej); });
  const base = `http://127.0.0.1:${srv.address().port}`;
  const post = (ep, b) => fetch(base + ep, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) }).then(async (r) => ({ status: r.status, body: await r.json() }));
  const get = (ep) => fetch(base + ep).then((r) => r.json());
  /** One run whose builder dies as `how` says; → { run (with answers), modRoot, before, after, copiesBefore, copiesAfter }. */
  async function deadRun(name, how) {
    const modRoot = (await post("/api/mod/create", { modName: name })).body.modRoot;
    const before = treeHash(modRoot), copiesBefore = listing(path.join(DIRS.home, ".nova"));
    const keep = { NODE_OPTIONS: process.env.NODE_OPTIONS, DEAD_MODE: process.env.DEAD_MODE, DEAD_STEP: process.env.DEAD_STEP };
    const keepExec = process.execPath;
    let start;
    try {
      if (how.env) Object.assign(process.env, how.env, { NODE_OPTIONS: `${how.heap ? `--max-old-space-size=${how.heap} ` : ""}--require "${PRE.replace(/\\/g, "/")}"` });
      if (how.badExec) process.execPath = path.join(ROOT, "no-such-runtime", "node.exe");
      start = await post("/api/map/world-run", { modPath: modRoot, landShare: 35, seed: 1, ownerMode: "inherit", owner: "", confirm: true });
    } finally {
      for (const [k, v] of Object.entries(keep)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
      process.execPath = keepExec;
    }
    if (how.stopAfter) { await sleep(how.stopAfter); if (app && app.locals && app.locals.stopWorldRun) app.locals.stopWorldRun("closed"); }
    let run = null;
    for (let i = 0; i < 1800; i++) { run = (await get("/api/map/world-run")).run; if (run && run.state !== "running" && run.state !== "finishing") break; await sleep(100); }
    run = (await get("/api/map/world-run?answers=1")).run;
    await post("/api/map/world-run/seen", { id: run.id });
    return { start, run, modRoot, before, after: treeHash(modRoot), copiesBefore, copiesAfter: listing(path.join(DIRS.home, ".nova")) };
  }
  const WHAT = (note) => (note.split("\n").find((l) => l.startsWith("What went wrong: ")) || "");
  const PART_WAY = (title) => `${title} stopped part-way and may already have written some of its files.`;
  const NOTHING = "Nothing was written to your mod: the world builder stopped before its first step began.";
  const NO_COPIES = "No file of yours had been overwritten or deleted yet, so there are no copies.";
  const FRAME = /\b\d+: [0-9A-F]{16}\b/, FOOTER = /Node\.js v\d/;
  try {
    console.log("1. the builder runs out of memory while a step runs (exit 134)");
    {
      const r = await deadRun("Dead OOM", { env: { DEAD_MODE: "oom-at-step", DEAD_STEP: "blank" }, heap: 256 });
      const note = P.worldFailureNote(r.run), s = r.run.steps.find((x) => x.key === "blank");
      rec("THE CONTROL: the run started and failed at Clear the old world, which had begun", r.start.status === 200 && r.run.state === "failed" && r.run.failedStep === "blank" && Number(s.startedAt) > 0, { start: r.start, state: r.run.state, failedStep: r.run.failedStep });
      rec("⭐⭐ “What went wrong” says it ran out of memory, with V8's own FATAL ERROR line", /^What went wrong: the world builder ran out of memory \(exit code \d+\): FATAL ERROR: .*JavaScript heap out of memory/.test(WHAT(note)), WHAT(note));
      rec("⭐ …and no native stack frame is the reason", !FRAME.test(WHAT(note)), WHAT(note));
      rec("…and a step that had begun is still said to have maybe written part of its files", note.includes(PART_WAY(s.title)) && !note.includes(NOTHING), note);
    }
    console.log("\n2. an uncaught exception once a step runs (exit 1)");
    {
      const r = await deadRun("Dead Throw", { env: { DEAD_MODE: "throw-at-step", DEAD_STEP: "blank" } });
      const note = P.worldFailureNote(r.run);
      rec("THE CONTROL: the run failed at Clear the old world", r.run.state === "failed" && r.run.failedStep === "blank", { state: r.run.state, failedStep: r.run.failedStep, error: r.run.error });
      rec("⭐⭐ “What went wrong” is the exception's own line, not Node's footer", WHAT(note) === "What went wrong: the world builder stopped unexpectedly (exit code 1): Error: injected once step blank ran" && !FOOTER.test(WHAT(note)), WHAT(note));
    }
    console.log("\n3. an exception as the builder loads, before any step");
    {
      const r = await deadRun("Dead Load", { env: { DEAD_MODE: "throw-at-load" } });
      const note = P.worldFailureNote(r.run);
      rec("THE CONTROL: the run failed with no step begun", r.run.state === "failed" && !r.run.steps.some((x) => Number(x.startedAt) > 0), r.run.steps.map((x) => `${x.key}:${x.state}`));
      rec("⭐ “What went wrong” is the exception's own line", WHAT(note) === "What went wrong: the world builder stopped unexpectedly (exit code 1): Error: injected as the builder loaded", WHAT(note));
      rec("THE EVIDENCE: the mod is byte for byte as it was, and Nova took no copy", JSON.stringify(r.after) === JSON.stringify(r.before) && r.before.length > 0 && JSON.stringify(r.copiesAfter) === JSON.stringify(r.copiesBefore), { before: r.before.length, after: r.after.length, copies: r.copiesAfter.filter((x) => !r.copiesBefore.includes(x)).slice(0, 4) });
      rec("⭐⭐ the stop note says nothing was written, and there are no copies", note.includes(NOTHING) && note.includes(NO_COPIES), note);
      rec("⭐⭐ …never that the step “may already have written some of its files”, nor where its copies would be", !note.includes("stopped part-way") && !/if it got that far/.test(note), note);
    }
    console.log("\n4. the builder cannot be started at all (the spawn fails)");
    {
      const r = await deadRun("Dead Spawn", { badExec: true });
      const note = P.worldFailureNote(r.run);
      rec("THE CONTROL: the route answered, and the run failed with no step begun", r.start.status === 200 && r.run.state === "failed" && !r.run.steps.some((x) => Number(x.startedAt) > 0), { start: r.start, state: r.run.state });
      rec("⭐ “What went wrong” says it could not be started, and what the spawn answered", /^What went wrong: the world builder could not be started \(spawn .*ENOENT\)$/.test(WHAT(note)), WHAT(note));
      rec("THE EVIDENCE: the mod is as it was, and no copy was taken", JSON.stringify(r.after) === JSON.stringify(r.before) && JSON.stringify(r.copiesAfter) === JSON.stringify(r.copiesBefore), { before: r.before.length, after: r.after.length });
      rec("⭐⭐ the stop note says nothing was written and there are no copies, never “part-way”", note.includes(NOTHING) && note.includes(NO_COPIES) && !note.includes("stopped part-way"), note);
    }
    console.log("\n5. Nova closed before the builder began a step");
    {
      const r = await deadRun("Dead Closed", { env: { DEAD_MODE: "hold-at-load" }, stopAfter: 300 });
      const note = P.worldInterruptedNote(r.run);
      rec("THE CONTROL: the run was interrupted with no step begun", r.run.state === "interrupted" && !r.run.steps.some((x) => Number(x.startedAt) > 0), { state: r.run.state, steps: r.run.steps.map((x) => `${x.key}:${x.state}`) });
      rec("THE EVIDENCE: the mod is as it was, and no copy was taken", JSON.stringify(r.after) === JSON.stringify(r.before) && JSON.stringify(r.copiesAfter) === JSON.stringify(r.copiesBefore), { before: r.before.length, after: r.after.length });
      rec("⭐ the note says it did not start, nothing was written and there are no copies — never a half-built map", /did not start/.test(note) && /nothing was written to your mod and there are no copies/.test(note) && !/half-built/.test(note), note);
    }
  } catch (e) {
    rec("HARNESS ERROR", false, e && e.stack);
  } finally {
    try { srv.closeAllConnections(); } catch (_) {}
    srv.close();
    try { fs.rmSync(ROOT, { recursive: true, force: true, maxRetries: 3 }); } catch (_) { /* this test's own mkdtemp sandbox only */ }
  }
  console.log(`\n${checks - fails.length}/${checks} checks passed`);
  if (fails.length) { console.log("FAILED:\n  " + fails.join("\n  ")); process.exitCode = 1; }
  setTimeout(() => process.exit(process.exitCode || 0), 300);
})().catch((e) => { console.error(e); process.exit(1); });
