// 🌍 #a-dead-step-keeps-its-copies-folder — A STEP THAT DIED UNHEARD HAS STILL COPIED WHAT IT OVERWROTE, AND NOVA MUST NAME THAT FOLDER.
//
// Each step of 🌍 Generate a world copies a file of the modder's into a stamped folder of its own BEFORE it overwrites it (its backup
// scope), so the folder is on disk from the step's first overwrite. A step whose builder died (out of memory, killed) sends no
// answer, and the answer is where the page read the folder from. Measured (reviewer, a re-roll whose builder died at Generate land's
// tenth write): Generate land had overwritten provinces.bmp, definition.csv, three region files and three state files, every one
// copied first into .nova/generate_land/<mod>/<stamp> — and the stop note named only Delete map's folder.
//
// The main server now reads the folders that step's kind made since it started (worldStepCopyDirsSince, by map-data's
// worldStepCopyRoot) and puts them on the stopped step as copiesDirs; the page names them. This test runs real worlds on the
// split-world fixture with the builder killed just after its first overwrite inside each step that writes (a preload in the builder only),
// and requires: the record names a folder under that step's own copy root, the folder holds a copy of every file the step had
// overwritten, the stop note names it, and a second death on the same mod names only the new folder. THE CONTROL: a whole run's
// finished steps each name a folder under the same root the main server reads (so WORLD_STEP_COPY_KINDS cannot drift from where the
// steps really copy).
//
// The steps are world-run.js STEPS (derived); the stop note is the page's own worldFailureNote (testlib-world-page.js).
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (ok || detail == null ? "" : "   -> " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 900)));
  if (!ok) fails.push(label);
};
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-world-dead-step-"));
const DIRS = { game: "game", mods: "mods", home: "home", app: "appdata", user: "hoi4-user", docs: "Documents", ws: "workshop" };
for (const k of Object.keys(DIRS)) { DIRS[k] = path.join(ROOT, DIRS[k]); fs.mkdirSync(DIRS[k], { recursive: true }); }
Object.assign(process.env, {
  HOI4_ROOT: DIRS.game, HOI4_MODS_ROOT: DIRS.mods, NOVA_HOME_DIR: DIRS.home, APPDATA: DIRS.app, NOVA_APP_DATA_DIR: DIRS.app,
  XDG_CONFIG_HOME: DIRS.app, HOI4_USER_DIR: DIRS.user, NOVA_DOCUMENTS_DIR: DIRS.docs, HOI4_WORKSHOP_ROOT: DIRS.ws,
});
delete process.env.NOVA_WORLD_JOB;
const SW = require("./testlib-split-world.js");
SW.makeGame(DIRS.game, SW.makeShapes({}), {});

// ── the builder-only preload: ARM names the step to kill and at which overwrite; every overwrite before it is logged ──────────────
const ARM = path.join(ROOT, "arm.json");
const LOG = path.join(ROOT, "overwrites.log");
// the map-data function each writing step's route calls (an injection point, so it is named here; a new writing step must add one)
const STEP_FN = { prepare: "prepareModForNewWorld", blank: "blankMapToSea", generate: "generateLand", autofix: "autoFixMap", refix: "autoFixMap", regions: "rebuildStrategicRegions" };
const PRE = path.join(ROOT, "die-in-a-step.js");
fs.writeFileSync(PRE, [
  '"use strict";',
  "if (process.env.NOVA_WORLD_JOB) {",
  '  const fs = require("fs");',
  `  const ARM = ${JSON.stringify(ARM)}, LOG = ${JSON.stringify(LOG)};`,
  // safe-write first: map-data takes safeModWrite from it when it loads
  `  const sw = require(${JSON.stringify(path.join(__dirname, "safe-write.js"))});`,
  "  let armed = 0, n = 0;",
  "  const orig = sw.safeModWrite;",
  // (safeModWrite is synchronous: the overwrite, and its copy, have landed when it returns — then the builder dies)
  "  sw.safeModWrite = function (file) {",
  "    const over = !!armed && fs.existsSync(String(file));",
  "    const out = orig.apply(this, arguments);",
  "    if (over) { fs.appendFileSync(LOG, String(file) + \"\\n\"); if (++n >= armed) process.exit(9); }",
  "    return out;",
  "  };",
  `  const md = require(${JSON.stringify(path.join(__dirname, "map-data.js"))});`,
  `  const FN = ${JSON.stringify(STEP_FN)};`,
  "  for (const fn of new Set(Object.values(FN))) {",
  "    const real = md[fn];",
  "    md[fn] = function (opts) {",
  "      let a = {}; try { a = JSON.parse(fs.readFileSync(ARM, \"utf8\")); } catch (_) { a = {}; }",
  "      const on = !!a.step && FN[a.step] === fn && !(opts && opts.dryRun);",
  "      if (on) { armed = a.overwrite; n = 0; }",
  "      try { return real.apply(this, arguments); } finally { if (on) armed = 0; }",
  "    };",
  "  }",
  "}",
].join("\n") + "\n");
process.env.NODE_OPTIONS = `--require ${PRE.replace(/\\/g, "/")}`;
const arm = (a) => { fs.writeFileSync(ARM, JSON.stringify(a || {})); fs.writeFileSync(LOG, ""); };
arm({});

const W = require("./world-run.js");
const mapData = require("./map-data.js");
const { createApp } = require("./server.js");
const WP = require("./testlib-world-page.js");
const P = WP.worldPage({ fetch: async () => { throw new Error("nothing to fetch"); }, timers: { setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, clearInterval() {} } }).sb;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const listen = (app) => new Promise((res, rej) => { const s = app.listen(0, "127.0.0.1", () => res(s)); s.on("error", rej); });
const client = (base) => {
  const call = (method, ep, body) => fetch(base + ep, method === "GET" ? undefined : { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body == null ? {} : body) })
    .then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));
  return { get: (ep) => call("GET", ep), post: (ep, b) => call("POST", ep, b) };
};
const CHOICES = { landShare: 35, seed: 1, ownerMode: "inherit", owner: "", confirm: true };
const under = (p, root) => !!p && !!root && path.resolve(p).toLowerCase().startsWith(path.resolve(root).toLowerCase() + path.sep);
function filesUnder(d) { const out = []; const r = (x) => { for (const e of fs.readdirSync(x, { withFileTypes: true })) { const p = path.join(x, e.name); if (e.isDirectory()) r(p); else out.push(p); } }; try { r(d); } catch (_) {} return out; }

async function runOnce(c, modRoot, extra) {
  const start = await c.post("/api/map/world-run", Object.assign({ modPath: modRoot }, CHOICES, extra || {}));
  if (!start.body || !start.body.ok) return { error: "did not start: " + JSON.stringify(start.body) };
  const t0 = Date.now();
  for (;;) {
    await sleep(150);
    const run = ((await c.get("/api/map/world-run")).body || {}).run;
    if (run && run.state !== "running" && run.state !== "finishing") break;
    if (Date.now() - t0 > 180000) return { error: "no end in 180 s" };
  }
  const full = (await c.get("/api/map/world-run?answers=1")).body.run;
  await c.post("/api/map/world-run/seen", { id: full.id });
  return full;
}

(async () => {
  const srv = await listen(createApp());
  const c = client(`http://127.0.0.1:${srv.address().port}`);
  try {
    const writing = W.STEPS.map((s) => s.key).filter((k) => k !== "check");
    rec("THE STEPS: every step but the check writes, derived from world-run.js STEPS", writing.length >= 5 && writing.includes("generate"), writing);
    rec("…and every one has a copy root the main server reads (map-data worldStepCopyRoot)", writing.every((k) => !!mapData.worldStepCopyRoot("C:/m/x", k)), writing.map((k) => `${k}:${mapData.worldStepCopyRoot("C:/m/x", k)}`));
    rec("…and an injection point here (a new writing step must name the function its route calls)", writing.every((k) => !!STEP_FN[k]), writing.filter((k) => !STEP_FN[k]));

    // ── THE CONTROL: a whole run; each finished step's own answer names a folder under the root the main server would read ──
    arm({});
    const ctrlMod = (await c.post("/api/mod/create", { modName: "Dead Step Control" })).body.modRoot;
    const ctrl = await runOnce(c, ctrlMod);
    rec("THE CONTROL: the whole world, nothing killed, ends done", ctrl.state === "done", ctrl.error || ctrl.state);
    const named = (ctrl.steps || []).filter((s) => s.state === "done").map((s) => ({ key: s.key, c: P.worldStepCopies(s.key, (ctrl.answers || {})[s.key]) })).filter((x) => x.c);
    rec("…at least three finished steps named a copies folder in their answers", named.length >= 3, named.map((x) => x.key));
    for (const x of named) rec(`…${x.key}: its answer's folder is under worldStepCopyRoot(mod, "${x.key}")`, under(x.c.dir, mapData.worldStepCopyRoot(ctrl.modRoot, x.key)), { dir: x.c.dir, root: mapData.worldStepCopyRoot(ctrl.modRoot, x.key) });
    rec("…and a finished run carries no copiesDirs on any step", (ctrl.steps || []).every((s) => !s.copiesDirs), (ctrl.steps || []).filter((s) => s.copiesDirs).map((s) => s.key));

    // ── THE PROBE: the builder killed just after its first overwrite inside each writing step. Step 1 on a new mod (it splices the
    // descriptors); every later step on a world generated over a finished one, where it overwrites what that world wrote ──
    const firstDirs = {};
    for (const key of writing) {
      if (key === "refix") continue;   // 6b runs only when the check still offers a fix: never reached on this fixture's clean world
      const title = W.STEPS.find((s) => s.key === key).title;
      const mod = (await c.post("/api/mod/create", { modName: `Dead Step ${key}` })).body.modRoot;
      const over = key !== "prepare";
      if (over) { arm({}); const first = await runOnce(c, mod); rec(`${key}: the world it is generated over was built`, first.state === "done", first.error || first.state); }
      arm({ step: key, overwrite: 1 });
      const r = await runOnce(c, mod, over ? { replacesOwnWorld: true } : null);
      const logged = fs.readFileSync(LOG, "utf8").split(/\r?\n/).filter(Boolean);
      arm({});
      const s = (r.steps || []).find((x) => x.key === key) || {};
      rec(`${key}: the builder died in ${title} after overwriting a file (the run failed there)`, r.state === "failed" && r.failedStep === key && logged.length >= 1, { state: r.state, failedStep: r.failedStep, error: r.error, logged });
      const dirs = Array.isArray(s.copiesDirs) ? s.copiesDirs : [];
      const root = mapData.worldStepCopyRoot(r.modRoot, key);
      rec(`${key}: ⭐ the record names the folder ${title} made (copiesDirs)`, dirs.length >= 1, s);
      rec(`${key}: …each under that step's own copy root`, dirs.length >= 1 && dirs.every((d) => under(d, root)), { dirs, root });
      const held = new Set(dirs.flatMap((d) => filesUnder(d).map((f) => path.relative(d, f).toLowerCase())));
      const copyName = (f) => (under(f, r.modRoot) ? path.relative(r.modRoot, f) : path.resolve(f).replace(/[\\/:]/g, "__")).toLowerCase();
      const missing = logged.filter((f) => !held.has(copyName(f)));
      rec(`${key}: …and holds a copy of every file ${title} had overwritten before it died`, logged.length >= 1 && missing.length === 0, { missing, held: [...held].slice(0, 8) });
      const note = P.worldFailureNote(r);
      rec(`${key}: ⭐ the stop note names that folder`, dirs.length >= 1 && note.split("\n").includes(`Copies of what ${title} overwrote before it stopped: ${dirs.join("; ")}`), note);
      firstDirs[key] = { mod, dirs };
    }

    // ── a second death on the same mod, in the same step: only the NEW folder is named, never the first run's ──
    const again = firstDirs.generate;
    if (again) {
      arm({ step: "generate", overwrite: 1 });
      const r2 = await runOnce(c, again.mod, { replacesOwnWorld: true });
      arm({});
      const s2 = (r2.steps || []).find((x) => x.key === "generate") || {};
      const d2 = Array.isArray(s2.copiesDirs) ? s2.copiesDirs : [];
      rec("again: the second run died in Raise new land too", r2.state === "failed" && r2.failedStep === "generate", { state: r2.state, failedStep: r2.failedStep, error: r2.error });
      rec("again: ⭐ it names a folder of its own, never the first run's", d2.length >= 1 && d2.every((d) => !again.dirs.some((x) => path.resolve(x).toLowerCase() === path.resolve(d).toLowerCase())), { first: again.dirs, second: d2 });
    }
  } finally {
    try { srv.closeAllConnections(); } catch (_) {}
    srv.close();
  }
  console.log(`\n${checks - fails.length}/${checks} checks passed`);
  if (fails.length) { console.log("FAILED:\n  " + fails.join("\n  ")); process.exitCode = 1; }
  setTimeout(() => process.exit(process.exitCode || 0), 300);
})().catch((e) => { console.error(e); process.exit(1); });
