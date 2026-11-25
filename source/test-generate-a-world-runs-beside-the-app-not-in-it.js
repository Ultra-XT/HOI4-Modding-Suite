// 🌍 Generate a world runs BESIDE the app, not in it. #a-generated-world-freezes-nothing
//
// server.js runs inside Electron's main process, and the six steps include Generate land — 189–274 s of synchronous work on a real
// map, measured; Windows calls a window "Not Responding" 5.5 s into a blocked main thread. So POST /api/map/world-run forks
// world-run.js, which starts a createApp() of its own and sends it the page's own requests, and the main server only relays.
// What that buys, and what it costs, is pinned here on a small fixture world (testlib-split-world's), where a whole run takes seconds:
//
//   (a) the main server's event loop stays free during a run (lag < 150 ms, 100 ms ticks) — and THE CONTROL: the same six steps
//       run in-process against the main server block it for longer than twice that, or the lag check could not bite;
//   (b) while a run goes nothing else writes: EVERY mutating route of server.js (derived from its source, :params filled) answers
//       423, GETs still answer, and the run's own routes stay open;
//   (c) a second run answers 409 with the step the first is on;
//   (d) stopWorldRun (Nova closing) leaves "interrupted" — in the record on disk too — and releases the lock; a builder that dies with
//       a line on stderr leaves "failed", and the message carries that line;
//   (e) after the run, the main server answers the map model and Map Errors exactly as a FRESH server process does: the child's
//       writes are another process's, which no cache of the main server's was told about (forgetModWrittenElsewhere) — the state
//       names it cached before the run sit inside the localisation cache's 30 s TTL, so without the forget they are served stale;
//   (f) the builder process is gone once the run is done;
//   (g) the builder's own createApp (NOVA_WORLD_JOB) never reads or writes the run record — starting up, it would otherwise read
//       its parent's "running" record and call it interrupted;
//   (h) a record a closed Nova left "running" whose builder is STILL alive loads as "finishing": the lock stays (with its own text)
//       until that process ends, then "interrupted" (#a-world-run-orphan-is-not-interrupted).
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { spawn, fork } = require("child_process");
const { performance } = require("perf_hooks");

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (ok || detail == null ? "" : "   -> " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 500)));
  if (!ok) fails.push(label);
};

// ── the sandbox, before server.js loads (it reads these when it loads) ────────────────────────────────────────────────────────
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-world-beside-"));
const DIRS = { game: "game", mods: "mods", home: "home", app: "appdata", user: "hoi4-user", docs: "Documents", ws: "workshop" };
for (const k of Object.keys(DIRS)) { DIRS[k] = path.join(ROOT, DIRS[k]); fs.mkdirSync(DIRS[k], { recursive: true }); }
Object.assign(process.env, {
  HOI4_ROOT: DIRS.game, HOI4_MODS_ROOT: DIRS.mods, NOVA_HOME_DIR: DIRS.home, APPDATA: DIRS.app, NOVA_APP_DATA_DIR: DIRS.app,
  XDG_CONFIG_HOME: DIRS.app, HOI4_USER_DIR: DIRS.user, NOVA_DOCUMENTS_DIR: DIRS.docs, HOI4_WORKSHOP_ROOT: DIRS.ws,
});
delete process.env.NOVA_WORLD_JOB;
const SW = require("./testlib-split-world.js");
SW.makeGame(DIRS.game, SW.makeShapes({}), {});
const { maskJsComments } = require("./testlib-strip-comments.js");
const srvModule = require("./server.js");
const { createApp } = srvModule;
const W = require("./world-run.js");
const { NOVA_APP_DATA_DIR } = require("./safe-write.js");
const RECORD = path.join(NOVA_APP_DATA_DIR, "world-run.json");
// Measured on this fixture (2026-10-21, five runs): the child run's worst main-loop delay 12-13 ms; the in-process control's 532-702 ms
// (Generate land's synchronous body, ~750 ms here). The bound sits >10x above the first, and the control must clear TWICE the bound,
// so neither side passes by a hair. (1,000 ms was asked of the control first, which this fixture does not reach on a quiet machine.)
const LAG_BOUND = 150, CONTROL_MIN = 2 * LAG_BOUND;
const CHOICES = { landShare: 35, seed: 1, ownerMode: "inherit", owner: "" };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sha = (p) => { try { return crypto.createHash("sha1").update(fs.readFileSync(p)).digest("hex"); } catch (_) { return "(none)"; } };
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch (e) { return !!(e && e.code === "EPERM"); } };
const listen = (app) => new Promise((res, rej) => { const s = app.listen(0, "127.0.0.1", () => res(s)); s.on("error", rej); });
const client = (base) => {
  const call = (method, ep, body, raw) => fetch(base + ep, method === "GET" ? undefined
    : { method, headers: { "Content-Type": raw ? "text/plain" : "application/json" }, body: raw ? body : JSON.stringify(body == null ? {} : body) })
    .then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));
  return { get: (ep) => call("GET", ep), post: (ep, b) => call("POST", ep, b), send: call };
};
/** The event loop's worst delay over a stretch, from 100 ms ticks. */
const lagMeter = () => {
  let last = performance.now(), max = 0;
  const t = setInterval(() => { const now = performance.now(); max = Math.max(max, now - last - 100); last = now; }, 100);
  return () => { clearInterval(t); const now = performance.now(); return Math.round(Math.max(max, now - last - 100)); };
};
const until = async (fn, ms, every = 100) => { const t0 = Date.now(); for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t0 > ms) return null; await sleep(every); } };
const ended = async (c, ms = 60000) => until(async () => { const g = await c.get("/api/map/world-run"); const r = g.body && g.body.run; return r && r.state !== "running" && r.state !== "finishing" ? r : null; }, ms);
/** A mod made the way 🏠 New mod makes one. */
const newMod = async (c, name) => { const r = await c.post("/api/mod/create", { modName: name }); if (!r.body || !r.body.modRoot) throw new Error("New mod failed: " + JSON.stringify(r.body)); return r.body.modRoot; };
/** The map model with what can differ between two equal answers (timings, cache flags) left out, as one string. */
// provincesBmpVersion is "<size>-<mtime>-<this process's writes to it>" — the last part is per process BY DESIGN (the page's picture
// URL changes on a write that keeps size and mtime), so it is compared without its count, and the count is checked on its own below
const VOLATILE = /^(ms|took|elapsed|timings?|builtAt|cached|cache|fromCache|cacheHit|generatedAt|at)$/;
const stable = (x) => JSON.stringify(x, (k, v) => (VOLATILE.test(k) ? undefined : k === "provincesBmpVersion" ? String(v).replace(/-\d+$/, "") : v));
/** A fresh server process over the same sandbox: nothing it answers can come from a cache of this process's. */
async function freshServer() {
  const helper = path.join(ROOT, "fresh-server.js");
  fs.writeFileSync(helper, [
    '"use strict";',
    `const { createApp } = require(${JSON.stringify(path.join(__dirname, "server.js"))});`,
    'const s = createApp().listen(0, "127.0.0.1", () => process.send({ port: s.address().port }));',
    'process.on("disconnect", () => process.exit(0));',
  ].join("\n") + "\n");
  const child = fork(helper, [], { env: Object.assign({}, process.env), stdio: ["ignore", "ignore", "ignore", "ipc"], windowsHide: true });
  const port = await new Promise((res, rej) => { child.once("message", (m) => res(m && m.port)); child.once("exit", (c) => rej(new Error("the fresh server exited " + c))); });
  return { child, c: client(`http://127.0.0.1:${port}`), stop: () => { try { child.disconnect(); } catch (_) {} try { child.kill(); } catch (_) {} } };
}

(async () => {
  const servers = [], helpers = [];
  let dummy = null;
  try {
    const mainApp = createApp();
    const mainSrv = await listen(mainApp); servers.push(mainSrv);
    const base = `http://127.0.0.1:${mainSrv.address().port}`, main = client(base);

    console.log("(a) ⭐⭐⭐ the main server stays free while a world is built — and the same steps in-process would block it");
    const A = await newMod(main, "Beside A"), B = await newMod(main, "Beside B");
    const before = await main.get(`/api/map/model?modPath=${encodeURIComponent(A)}`);   // warms the caches the run must make stale
    rec("THE CONTROL: the main server read mod A's map before the run (its names among what it cached)", before.status === 200 && before.body && before.body.ok === true, before.body && before.body.error);
    const stopLag = lagMeter();
    const t0 = Date.now();
    const start = await main.post("/api/map/world-run", Object.assign({ modPath: A, confirm: true }, CHOICES));
    rec("the run starts: 200 and an id, answered before any step has written", start.status === 200 && start.body && start.body.ok === true && !!start.body.id, start.body);

    console.log("\n(c) a second run while one goes: 409, with the step the first is on");
    const second = await main.post("/api/map/world-run", Object.assign({ modPath: B, confirm: true }, CHOICES));
    rec("⭐⭐ 409, naming the mod and the step", second.status === 409 && second.body && second.body.running && second.body.running.modName === "Beside A" && /already being generated for Beside A \(step \d of 6\)/.test(second.body.error), second);

    console.log("\n(b) while it runs, other writes answer 423 — and reads still answer");
    const during = await main.post("/api/map/generate-land", { modPath: A, count: 1, seed: 1, replacesExistingWorld: true });
    rec("⭐⭐ Generate land, posted by anything but the run, answers 423 with the run's own words", during.status === 423 && during.body && during.body.worldRunActive === true && /Nova is generating a world for Beside A \(step \d of 6\)\. Nothing else can be saved until it finishes\./.test(during.body.error), during);
    const save = await main.post("/api/save", { path: path.join(A, "descriptor.mod"), content: "x" });
    rec("…and so does 💾 Save", save.status === 423, save.status);
    const read = await main.get("/api/map/world-run");
    rec("…while a GET still answers, with the run", read.status === 200 && read.body && read.body.run && read.body.run.state === "running", read.status);

    const done = await ended(main);
    const lag = stopLag(), took = Date.now() - t0;
    rec("THE CONTROL: the run ended, done, every step done or skipped", !!done && done.state === "done" && done.steps.every((s) => s.state === "done" || s.state === "skipped"), done && { state: done.state, error: done.error, steps: done.steps.map((s) => `${s.n}:${s.state}`) });
    rec(`⭐⭐⭐ the main server's event loop never stalled past ${LAG_BOUND} ms while the world was built (worst ${lag} ms over ${took} ms)`, lag < LAG_BOUND, { lag, took });
    rec("the run reports the builder's memory (peak RSS)", !!done && Number(done.peakRss) > 0, done && done.peakRss);
    console.log(`     peak RSS of the builder: ${done && done.peakRss ? (done.peakRss / 1048576).toFixed(0) + " MB" : "?"}`);

    console.log("\n(f) the builder is gone once the run is done");
    const pid = done && done.childPid;
    rec("⭐ the record named the builder's pid, and that process has ended", Number(pid) > 0 && !!(await until(async () => !alive(pid), 5000)), pid);

    console.log("\n(e) ⭐⭐⭐ after the run the main server answers as a FRESH server process does");
    const fresh = await freshServer(); helpers.push(fresh);
    const q = `?modPath=${encodeURIComponent(A)}`;
    const [mModel, fModel, mVal, fVal] = await Promise.all([main.get("/api/map/model" + q), fresh.c.get("/api/map/model" + q), main.get("/api/map/validate" + q), fresh.c.get("/api/map/validate" + q)]);
    rec("THE CONTROL: both answered the model, and the run changed it (so equality says something)", mModel.body && mModel.body.ok && fModel.body && fModel.body.ok && stable(before.body) !== stable(fModel.body), [mModel.status, fModel.status]);
    const named = (m) => (m.body.states || []).filter((s) => s.displayName && s.displayName !== s.name).length;
    rec("THE CONTROL: the new world's states have names from its localisation (the read the forget must refresh)", fModel.body && named(fModel) > 0, fModel.body && named(fModel));
    const mm = stable(mModel.body), fm = stable(fModel.body);
    const firstDiff = (() => { for (let i = 0; i < Math.max(mm.length, fm.length); i++) if (mm[i] !== fm[i]) return mm.slice(Math.max(0, i - 120), i + 120) + "  ||  " + fm.slice(Math.max(0, i - 120), i + 120); return ""; })();
    rec("⭐⭐⭐ the map model equals the fresh process's, state names and all", mm === fm, firstDiff);
    rec("⭐⭐ …and so does ⚠ Map Errors", stable(mVal.body) === stable(fVal.body), [mVal.body && (mVal.body.problems || []).length, fVal.body && (fVal.body.problems || []).length]);
    const writes = (m) => Number((/-(\d+)$/.exec(String(m.body.provincesBmpVersion || "")) || [])[1]);
    rec("⭐ the builder's write of provinces.bmp was announced to the main server (its picture URL moves), and the fresh process made none", writes(mModel) >= 1 && writes(fModel) === 0, [mModel.body.provincesBmpVersion, fModel.body.provincesBmpVersion]);
    fresh.stop();

    console.log("\n(a) THE CONTROL: the same six steps run IN-PROCESS against the main server");
    const stopCtl = lagMeter();
    let ctlErr = null;
    try { await W.runWorldSequence({ base, modPath: B, choices: CHOICES }); } catch (e) { ctlErr = e; }
    const ctlLag = stopCtl();
    rec("THE CONTROL: the in-process run finished", !ctlErr, ctlErr && ctlErr.message);
    rec(`⭐⭐ …and it stalled this same event loop for ${ctlLag} ms — over ${CONTROL_MIN} ms, so the ${LAG_BOUND} ms bound above can bite`, ctlLag > CONTROL_MIN, ctlLag);

    console.log("\n(d) Nova closing mid-run: interrupted, on disk too, and the lock released");
    const C = await newMod(main, "Beside C");
    const c1 = await main.post("/api/map/world-run", Object.assign({ modPath: C, confirm: true }, CHOICES));
    const up = await until(async () => { const g = await main.get("/api/map/world-run"); const r = g.body && g.body.run; return r && r.steps.some((s) => s.state === "done") ? r : null; }, 30000, 20);
    rec("THE CONTROL: a run on mod C got going (a step finished)", c1.status === 200 && !!up, c1.body);
    const stopped = mainApp.locals.stopWorldRun("closed");
    const after = (await main.get("/api/map/world-run")).body.run;
    rec("⭐⭐ stopWorldRun ends it as interrupted", stopped === true && after.state === "interrupted" && after.stopReason === "closed", after && { state: after.state, reason: after.stopReason });
    let disk = null; try { disk = JSON.parse(fs.readFileSync(RECORD, "utf8")); } catch (_) {}
    rec("⭐⭐ …and the record on disk says so (a relaunch reads interrupted, not running)", !!disk && disk.id === after.id && disk.state === "interrupted", disk && disk.state);
    const free = await main.post("/api/map/generate-land", {});
    rec("⭐ …and the lock is released", free.status !== 423, free.status);
    rec("…and its builder is gone", !!(await until(async () => !alive(after.childPid), 5000)), after.childPid);
    rec("…and a second stop finds nothing to stop", mainApp.locals.stopWorldRun("closed") === false);

    console.log("\n(d) a builder that dies with a line on stderr: failed, and the message carries the line");
    const probe = path.join(ROOT, "dies-at-start.js");
    fs.writeFileSync(probe, 'process.stderr.write("probe: the world builder fell over before its first step\\n");\nprocess.exit(1);\n');
    const D = await newMod(main, "Beside D");
    const priorOpts = process.env.NODE_OPTIONS;
    process.env.NODE_OPTIONS = `${priorOpts ? priorOpts + " " : ""}--require "${probe.replace(/\\/g, "/")}"`;
    let died = null;
    try {
      const d1 = await main.post("/api/map/world-run", Object.assign({ modPath: D, confirm: true }, CHOICES));
      rec("THE CONTROL: the run was accepted", d1.status === 200, d1.body);
      died = await ended(main, 20000);
    } finally { if (priorOpts === undefined) delete process.env.NODE_OPTIONS; else process.env.NODE_OPTIONS = priorOpts; }
    rec("⭐⭐ it ends failed (not left running)", !!died && died.state === "failed", died && died.state);
    rec("⭐⭐ …and says why, with the builder's last stderr line", !!died && /exit code 1/.test(died.error) && /probe: the world builder fell over before its first step/.test(died.error), died && died.error);
    rec("…on the step it was on", !!died && died.failedStep === "prepare" && died.steps[0].state === "failed", died && died.failedStep);
    rec("…and the lock is released", (await main.post("/api/map/generate-land", {})).status !== 423);

    console.log("\n(g) ⭐⭐ the builder's own createApp never reads or writes the run record");
    {
      const planted = { id: "planted", modRoot: C, modName: "Planted", state: "running", childPid: 999999, stepIndex: 2, steps: W.STEPS.map((s) => ({ key: s.key, n: s.n, k: s.k, title: s.title, state: "waiting" })), answers: {} };
      fs.writeFileSync(RECORD, JSON.stringify(planted));
      const h0 = sha(RECORD);
      process.env.NOVA_WORLD_JOB = JSON.stringify({ modPath: C, choices: CHOICES });
      let inChild = null;
      try { inChild = createApp(); } finally { delete process.env.NOVA_WORLD_JOB; }
      const s = await listen(inChild); servers.push(s);
      const ic = client(`http://127.0.0.1:${s.address().port}`);
      await sleep(300);
      rec("⭐⭐ the record is byte-identical after the builder's createApp", sha(RECORD) === h0, sha(RECORD));
      rec("…which holds no run of its own and arms no lock", inChild.locals.worldRunActive() === null && (await ic.post("/api/map/generate-land", {})).status !== 423);
      const nested = await ic.post("/api/map/world-run", Object.assign({ modPath: C, confirm: true }, CHOICES));
      rec("…and never starts a world of its own", nested.status === 409 && /does not start another world/.test(nested.body && nested.body.error), nested);
      rec("…and still the record is untouched", sha(RECORD) === h0);
    }

    console.log("\n(h) a record left running by a closed Nova whose builder still runs: finishing, locked, then interrupted");
    dummy = spawn(process.execPath, ["-e", "setTimeout(() => {}, 120000)"], { stdio: "ignore", windowsHide: true });
    await sleep(200);
    {
      const orphan = { id: "orphan", modRoot: C, modName: "Orphan", state: "running", childPid: dummy.pid, stepIndex: 2, startedAt: Date.now() - 5000,
        steps: W.STEPS.map((s, i) => ({ key: s.key, n: s.n, k: s.k, title: s.title, optional: !!s.optional, state: i < 2 ? "done" : i === 2 ? "running" : "waiting" })), answers: {} };
      fs.writeFileSync(RECORD, JSON.stringify(orphan));
      const app = createApp();
      const s = await listen(app); servers.push(s);
      const hc = client(`http://127.0.0.1:${s.address().port}`);
      const g = (await hc.get("/api/map/world-run")).body.run;
      rec("⭐⭐ a live builder: the record loads as finishing", g && g.state === "finishing", g && g.state);
      rec("…and the app does not call it a run of its own to stop (Nova's close asks nothing of it)", app.locals.worldRunActive() === null);

      // (b) EVERY mutating route, derived from server.js (comments masked; :params filled), answers 423 under the lock
      const SRC = maskJsComments(fs.readFileSync(path.join(__dirname, "server.js"), "utf8"));
      const routes = [...SRC.matchAll(/\bapp\.(post|put|patch|delete)\(\s*["'`]([^"'`]+)["'`]/g)].map((m) => ({ method: m[1].toUpperCase(), url: m[2].replace(/:[A-Za-z_]+\??/g, "x") }));
      const own = routes.filter((r) => /^\/api\/map\/world-run(\/|$)/.test(r.url));
      const others = routes.filter((r) => !own.includes(r));
      rec(`THE CONTROL: ${others.length} mutating routes found in server.js, and the run's own (${own.map((r) => r.url).join(", ")})`, others.length >= 100 && own.length === 2, others.length);
      rec("…all under /api/, where the lock stands", others.every((r) => r.url.startsWith("/api/")), others.filter((r) => !r.url.startsWith("/api/")).map((r) => r.url));
      const open = [];
      for (let i = 0; i < others.length; i += 16) {
        const batch = others.slice(i, i + 16);
        const res = await Promise.all(batch.map((r) => hc.send(r.method, r.url, {})));
        res.forEach((x, j) => { if (!(x.status === 423 && x.body && /Nova is still finishing step 3 of 6 of the world it was building when it was closed\. Nothing else can be saved until that step ends\./.test(x.body.error))) open.push(`${batch[j].method} ${batch[j].url} -> ${x.status}`); });
      }
      rec(`⭐⭐⭐ every one of the ${others.length} answers 423, with the finishing text`, open.length === 0, open.slice(0, 12));
      const textPlain = await hc.send("POST", "/api/map/generate-land", "modPath=x", true);
      rec("…a text/plain body too", textPlain.status === 423, textPlain.status);
      const gets = await Promise.all(["/api/map/world-run", `/api/map/model?modPath=${encodeURIComponent(C)}`].map((u) => hc.get(u)));
      rec("…while reads still answer", gets.every((x) => x.status === 200), gets.map((x) => x.status));
      const seen = await hc.post("/api/map/world-run/seen", { id: "orphan" });
      rec("…and the run's own routes stay open (a finishing run is not marked seen)", seen.status === 200 && seen.body && seen.body.seen === false, seen);
      try { dummy.kill(); } catch (_) {}
      const gone = await until(async () => { const x = (await hc.get("/api/map/world-run")).body.run; return x && x.state === "interrupted" ? x : null; }, 8000, 200);
      rec("⭐⭐ once that process ends: interrupted", !!gone, gone && gone.state);
      rec("…and the lock is released", (await hc.post("/api/map/generate-land", {})).status !== 423);
      let d2 = null; try { d2 = JSON.parse(fs.readFileSync(RECORD, "utf8")); } catch (_) {}
      rec("…and the record on disk says interrupted", !!d2 && d2.id === "orphan" && d2.state === "interrupted", d2 && d2.state);
      fs.writeFileSync(RECORD, JSON.stringify(Object.assign({}, orphan, { id: "dead", childPid: 999999 })));
      const app2 = createApp(); const s2 = await listen(app2); servers.push(s2);
      const g2 = (await client(`http://127.0.0.1:${s2.address().port}`).get("/api/map/world-run")).body.run;
      rec("⭐ a record whose builder is gone loads as interrupted straight away", g2 && g2.id === "dead" && g2.state === "interrupted", g2 && g2.state);
    }
  } catch (e) {
    rec("harness threw: " + (e && e.stack ? e.stack.split("\n").slice(0, 6).join(" | ") : e), false);
  } finally {
    try { if (dummy) dummy.kill(); } catch (_) {}
    for (const h of helpers) { try { h.stop(); } catch (_) {} }
    for (const s of servers) { try { s.closeAllConnections(); } catch (_) {} try { s.close(); } catch (_) {} }
    await sleep(300);
    try { fs.rmSync(ROOT, { recursive: true, force: true, maxRetries: 3 }); } catch (_) { /* this test's own mkdtemp sandbox only */ }
    console.log(`\n=== 🌍 Generate a world runs beside the app: ${checks} checks, ${fails.length} failed ===`);
    fails.forEach((f) => console.log("   FAILED: " + f));
    process.exit(fails.length ? 1 : 0);
  }
})();
