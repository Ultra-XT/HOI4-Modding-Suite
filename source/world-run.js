"use strict";
// 🌍 GENERATE A WORLD — the owner's whole flow behind one button (owner, 2026-10-02: "i hope we reach a point where we click a
// button and it generates a map"). Today a world takes six steps by hand, which the rehearsal driver build-t31.js scripts
// exactly; this sends those same requests — the very bodies the map page's own buttons send — to a server of Nova's own:
//
//   1. POST /api/map/prepare-world   { modPath, confirm: true }      make the map the mod's own (provinces.bmp + replace_path)
//   2. POST /api/map/blank-to-sea    { modPath }                     🗑 Delete map
//   3. GET  /api/map/model, then
//      POST /api/map/generate-land   { modPath, count, seed, ownerMode, owner, replacesExistingWorld: true }   🌍 Generate land
//   4. POST /api/map/auto-fix        { modPath }                     🔧 Auto-fix all
//   5. POST /api/map/rebuild-regions { modPath, dryRun: true }, then { modPath, confirm: true } unless nothing to write   🗺 Redraw
//   6. GET  /api/map/validate        ⚠ Map Errors — and 6b, one more 🔧 Auto-fix all (+ validate) when the popup would still
//      offer one (map-rule-labels.js autoFixOffered: the popup's own predicate, not a narrower one)
//
// ⛔ WHY A CHILD PROCESS. server.js runs inside Electron's MAIN process, and Generate land is 189–274 s of synchronous work:
// measured (designer, eltest/), blocking Electron's main thread makes Windows call the window "Not Responding" 5.5 s in. So the
// main server forks THIS file (ELECTRON_RUN_AS_NODE, the warm-child.js precedent) and this process starts a createApp() of its
// own on 127.0.0.1:0 and talks HTTP to it — every step goes through the endpoint the button uses, its body parsing, its gates,
// its backup scope, so a later fix to any of them (batch C's fold-back in Delete map) reaches the world with no change here.
//
// ⛔ A STEP THAT FAILS STOPS THE RUN, and so does a step that could not copy what it overwrote (copyFailuresOf): every fix is
// backed up first, and a run that went on writing after a failed copy would break that for every step after it. Nothing is
// rolled back — that would mean deleting the thousands of files the run created in the modder's folder — so the run stops and
// the page says what was written and where the copies are.
//
// LF on purpose (written by a tool); keep it unmixed (test-no-source-file-has-mixed-line-endings.js).

const STEPS = [
  { key: "prepare", n: "1", k: 1, title: "Make the map your mod's own" },
  { key: "blank", n: "2", k: 2, title: "Clear the old world" },
  { key: "generate", n: "3", k: 3, title: "Raise new land" },
  { key: "autofix", n: "4", k: 4, title: "Repair what the new land broke" },
  { key: "regions", n: "5", k: 5, title: "Draw strategic regions" },
  { key: "check", n: "6", k: 6, title: "Check the map" },
  // only when ⚠ Map Errors would still offer 🔧 Auto-fix all after step 6 — what the modder would click there
  { key: "refix", n: "6b", k: 6, title: "Repair once more", optional: true },
];
const STEP_COUNT = 6;

/** The Generate land dialog's own share of the ocean: parseInt or 35, clamped to the slider's 1..90 (public/map.js, the
 *  #mapGenConfirmBtn handler, and map.html's #mapGenPct min/max). */
function landShareOf(pct) { return Math.max(1, Math.min(90, parseInt(pct, 10) || 35)); }
/** …and its count: that share of the sea provinces the map has now, at least one. */
function landCountFor(seaCount, pct) { return Math.max(1, Math.round(seaCount * landShareOf(pct) / 100)); }
/** The dialog's owner choice: "single" with no tag typed falls back to inheriting, and the tag is cleaned as the dialog cleans it. */
function ownerChoiceOf(choices = {}) {
  const tag = String(choices.owner || "").trim().toUpperCase().replace(/[^A-Z0-9_]/g, "");
  let mode = String(choices.ownerMode || "inherit");
  if (mode === "single" && !tag) mode = "inherit";
  return { ownerMode: mode, owner: mode === "single" ? tag : "" };
}

const num = (x) => Number(x) || 0;
/** How many copies a step's answer says it could not make, before it overwrote or deleted a file of the mod's. Every field a
 *  step reports one in: step 1 and Generate land their backup scope's `failed`; Delete map the copies of what it deleted and of
 *  what it overwrote (its scope's misses are added into snapshotFailed); Auto-fix its scope's (backupSnapshot, reported even when
 *  every copy failed — #an-auto-fix-hid-the-copies-it-could-not-make); Redraw its scope's, and a failed redraw's put-back. */
function copyFailuresOf(key, answer) {
  const a = answer || {};
  switch (key) {
    case "prepare": return num(a.backups && a.backups.failed);
    case "blank": return num(a.snapshotFailed) + num(a.overwriteSnapshotFailed);
    case "generate": return num(a.backups && a.backups.failed);
    case "autofix":
    case "refix": return num(a.fixes && a.fixes.backupSnapshot && a.fixes.backupSnapshot.failed);
    case "regions": {
      const w = a.write || a;
      return num(w.backupsFailed) + (Array.isArray(w.unrestored) ? w.unrestored.length : 0) + (Array.isArray(w.putErrors) ? w.putErrors.length : 0);
    }
    default: return 0;
  }
}
const COPY_FAILED = (n) => `Nova could not copy ${n} of the files this step overwrote or deleted, so it stopped rather than go on writing without copies.`;

/** The Map Errors popup's own "does it still offer 🔧 Auto-fix all?" (public/map-rule-labels.js). */
function defaultAutoFixOffers() {
  const L = require("./public/map-rule-labels.js");
  return (problems) => L.autoFixOffers(problems);
}

/**
 * Run the six steps against `base` (a Nova server). `onStep` hears { t: "step", key, state: "running"|"done"|"failed"|"skipped",
 * at, answer?, error? } and { t: "note", … }. Throws an Error carrying .step, .answer and .validateFailed at the first failing
 * step; sends nothing after it.
 */
async function runWorldSequence({ base, modPath, choices = {}, onStep = () => {}, fetchImpl = fetch, autoFixOffers = null }) {
  const offers = autoFixOffers || defaultAutoFixOffers();
  const call = async (method, ep, body) => {
    const r = await fetchImpl(base + ep, method === "GET" ? undefined
      : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    let parsed = null;
    try { parsed = await r.json(); } catch (_) { parsed = null; }
    return { status: r.status, body: parsed };
  };
  const post = (ep, body) => call("POST", ep, body);
  const get = (ep) => call("GET", ep);
  const fail = (step, msg, answer, extra) => Object.assign(new Error(msg), { step, answer: answer === undefined ? null : answer }, extra || {});
  const okAnswer = (r, lenient) => r.status === 200 && r.body && (lenient ? r.body.ok !== false : r.body.ok === true);
  const results = {};
  const step = async (key, fn) => {
    onStep({ t: "step", key, state: "running", at: Date.now() });
    let out;
    try { out = await fn(); }
    catch (e) {
      const err = e && e.step ? e : fail(key, String((e && e.message) || e), null);
      onStep({ t: "step", key, state: "failed", at: Date.now(), error: err.message, answer: err.answer, validateFailed: !!err.validateFailed });
      throw err;
    }
    results[key] = out;
    const missed = copyFailuresOf(key, out);
    if (missed > 0) {
      const err = fail(key, COPY_FAILED(missed), out, { copyFailures: missed });
      // copyFailures travels with the step: the stop note must never say "no copies" of a step that overwrote files it could not copy
      onStep({ t: "step", key, state: "failed", at: Date.now(), error: err.message, answer: out, copyFailures: missed });
      throw err;
    }
    onStep({ t: "step", key, state: "done", at: Date.now(), answer: out });
    return out;
  };
  const shareOf = landShareOf(choices.landShare);
  const seed = parseInt(choices.seed, 10) || 1;
  const { ownerMode, owner } = ownerChoiceOf(choices);
  const enc = encodeURIComponent(modPath);

  await step("prepare", async () => {
    // replacesOwnWorld only when the modder typed GENERATE for a mod with a world of its own (the main server checked it already)
    const r = await post("/api/map/prepare-world", Object.assign({ modPath, confirm: true }, choices.replacesOwnWorld === true ? { replacesOwnWorld: true } : {}));
    if (!okAnswer(r)) throw fail("prepare", (r.body && r.body.error) || `status ${r.status}`, r.body);
    return r.body;
  });
  await step("blank", async () => {
    const r = await post("/api/map/blank-to-sea", { modPath });
    if (!okAnswer(r)) throw fail("blank", (r.body && r.body.error) || `status ${r.status}`, r.body);
    return r.body;
  });
  await step("generate", async () => {
    const m = await get(`/api/map/model?modPath=${enc}`);
    if (!okAnswer(m)) throw fail("generate", "the map could not be read after Delete map: " + ((m.body && m.body.error) || `status ${m.status}`), null);
    const sea = ((m.body && m.body.provinces) || []).filter((p) => p && p.type === "sea").length;
    const count = landCountFor(sea, shareOf);
    onStep({ t: "note", key: "generate", count, sea, pct: shareOf, seed });
    const r = await post("/api/map/generate-land", { modPath, count, seed, ownerMode, owner, replacesExistingWorld: true });
    if (!okAnswer(r)) throw fail("generate", (r.body && r.body.error) || `status ${r.status}`, r.body);
    return Object.assign({ asked: { count, sea, pct: shareOf, seed, ownerMode, owner } }, r.body);
  });
  const autoFix = async (key) => {
    const r = await post("/api/map/auto-fix", { modPath });
    if (!okAnswer(r, true)) throw fail(key, (r.body && r.body.error) || `status ${r.status}`, r.body);
    return r.body;
  };
  await step("autofix", () => autoFix("autofix"));
  await step("regions", async () => {
    const dry = await post("/api/map/rebuild-regions", { modPath, dryRun: true });
    if (!okAnswer(dry)) throw fail("regions", (dry.body && dry.body.error) || `status ${dry.status}`, dry.body);
    if (dry.body.summary && dry.body.summary.nothingToWrite) return { plan: dry.body, wrote: false };
    const w = await post("/api/map/rebuild-regions", { modPath, confirm: true });
    if (!okAnswer(w)) throw fail("regions", (w.body && w.body.error) || `status ${w.status}`, { plan: dry.body, wrote: false, write: w.body });
    return { plan: dry.body, wrote: true, write: w.body };
  });
  const validate = async (key) => {
    const v = await get(`/api/map/validate?modPath=${enc}`);
    if (!okAnswer(v)) throw fail(key, (v.body && v.body.error) || `status ${v.status}`, v.body, { validateFailed: true });
    return v.body;
  };
  const checked = await step("check", async () => {
    const v = await validate("check");
    const offered = offers(v.problems || []);
    return { validate: v, offered: [...new Set(offered.map((p) => p.rule))] };
  });
  if (checked.offered.length) {
    await step("refix", async () => {
      const fr = await autoFix("refix");
      let v;
      // the check after it failed, but the Auto-fix had written: its answer (what it did, and where its copies are) stays the step's
      try { v = await validate("refix"); }
      catch (e) { e.answer = Object.assign({}, fr, { validateAfter: null, validateError: e.answer }); throw e; }
      return Object.assign({}, fr, { validateAfter: v });
    });
  } else {
    onStep({ t: "step", key: "refix", state: "skipped", at: Date.now() });
  }
  return results;
}

/** The child: NOVA_WORLD_JOB = { modPath, choices }. Sends { t: "up" }, every step event, { t: "wrote", files } after each step
 *  (the files its writes landed on, so the main server can forget what it cached of them), then { t: "done", rss } or
 *  { t: "failed", key, error }. */
async function runChild() {
  // The main server going away (Nova closed, or it killed this run) ends the run; Node delivers it between steps, so a step
  // already writing finishes its write first.
  process.on("disconnect", () => process.exit(1));
  const send = (m) => { try { if (process.send && process.connected) process.send(m); } catch (_) { /* the main server is gone */ } };
  const job = JSON.parse(process.env.NOVA_WORLD_JOB || "{}");
  let server = null;
  const wrote = new Set();
  const flush = () => { if (wrote.size) { send({ t: "wrote", files: [...wrote] }); wrote.clear(); } };
  try {
    require("./safe-write.js").onModWrite((p) => { wrote.add(String(p)); });
    const srv = require("./server.js");
    srv.setActiveRoot(job.modPath);   // in memory only: the main server's active mod, so every getActiveRoot() fallback agrees
    server = await new Promise((res, rej) => { const s = srv.createApp().listen(0, "127.0.0.1", () => res(s)); s.on("error", rej); });
    const base = `http://127.0.0.1:${server.address().port}`;
    send({ t: "up", pid: process.pid });
    await runWorldSequence({ base, modPath: job.modPath, choices: job.choices || {}, onStep: (m) => { if (m.t === "step" && m.state !== "running") flush(); send(m); } });
    flush();
    let peak = 0;
    try { peak = process.resourceUsage().maxRSS * 1024; } catch (_) { peak = 0; }
    send({ t: "done", rss: process.memoryUsage().rss, peakRss: peak });
  } catch (e) {
    flush();
    send({ t: "failed", key: (e && e.step) || "", error: String((e && e.message) || e) });
    process.exitCode = 1;
  } finally {
    try { if (server) { try { server.closeAllConnections(); } catch (_) {} server.close(); } } catch (_) {}
  }
}

/** ⛔ #a-finished-world-is-not-called-stopped — leave only once the last message is WRITTEN to the main server: a last { t: "end" }
 *  whose send callback exits. A fixed 50 ms lost every last message when the main server's loop was busy as the builder ended (its
 *  'exit' came first, and the world was called stopped). The minute is a cap for a channel that never drains. */
function exitOnceHeard() {
  const code = process.exitCode || 0;
  const out = () => process.exit(code);
  const cap = setTimeout(out, 60000);
  if (cap.unref) cap.unref();
  try { if (process.send && process.connected) { process.send({ t: "end" }, out); return; } } catch (_) { /* the main server is gone */ }
  out();
}

module.exports = { STEPS, STEP_COUNT, landShareOf, landCountFor, ownerChoiceOf, copyFailuresOf, COPY_FAILED, runWorldSequence, exitOnceHeard };
if (require.main === module) runChild().then(exitOnceHeard, exitOnceHeard);
