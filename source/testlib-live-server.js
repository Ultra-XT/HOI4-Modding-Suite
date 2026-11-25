// ⛔ #a-bare-test-run-writes-into-the-real-app-data — A LIVE-APP TEST RUN BARE DRIVES A SERVER OF ITS OWN, NEVER THE OWNER'S.
//
// The live-app tests drive a running Nova over HTTP. Under run-tests.js that is the runner's own server, started inside its
// sandbox, and the environment names its port. Run bare — `node test-research-undo-live.js` — there was no such server, and
// they fell back to the app's own port: the owner's open Nova, whose AppData is the real one. Review measured one bare run
// filing 6 fixture backups and 13 cache files there, with nothing to stop it, because the writes happen in THAT process.
//
// So with no port named, a live-app test starts Nova's server itself, as the runner starts one: on a port from a band of
// its own, with the environment the first line below has sandboxed (a bare run's main is a test file, so the guard at the
// top of safe-write.js engages here and the server inherits it), and stops it at exit. A port named explicitly still wins —
// that is someone choosing a server on purpose, the same rule the runner follows.
//
// ⛔ #a-live-test-waits-for-the-page-not-for-the-clock — …AND THAT SERVER IS COLD. The runner's server has usually answered
// for an earlier test; this one has answered nobody. Measured on a fresh server with Millennium Dawn: the technology
// catalogue takes 41–45 s, the nodes are drawn 0.3–2.3 s after it arrives, the section labels 0.25–0.7 s after the nodes
// (with a re-render and a scroll), and their glyph images — a label is 0x0 and cannot be clicked until its glyph has
// loaded — for another ten seconds, queued behind a hundred icon requests. The ten browser tests all booted the same way:
// wait for allTechs, then 2.5 s. Warm, that was enough. Cold, a drag made in that window was wiped by the end of
// loadCatalog (clearDirty, histReset) and a label was not there to click: 4 of the 11 failed bare, for timing and nothing
// else. openResearchPage and researchPageReady below are the one boot they all use now.
//
// …AND THE SERVER MUST HAVE NOTHING ELSE TO DO. The page asks for one thing of its own whenever a tech is selected (its
// icon, through fetch). A request the server takes half a second over puts the loading overlay up — over the whole page,
// taking every click — and the undo test's second drag landed on it: no edit, redo branch intact, the same three
// failures, 4 cold runs in 5. Two things kept a cold server that busy, both measured:
//   - the page's own queue: with the labels drawn, the server was still decoding the hundred icons for the first time.
//     So ready also means no request of the page's is still out.
//   - the server's own startup warm. `node server.js` begins warming its caches 1.5 s after it listens, in the process
//     that answers — for the folder it calls its active mod, which is not the mod a test opens. On a fresh sandbox,
//     which a bare run's always is, that ran for 82 s, and for all of it a small request took from half a second to
//     8.7 s (20 of 26). The shipped app does not warm in the process that serves its pages: main.js starts its server
//     with deferWarm and warms in a child (warm-child.js). A bare test's server is started the same way (serveAsTheAppDoes).
// WHICH OF THE TWO WAS IT? Measured, with each taken away in turn. The old wait (allTechs, then 2.5 s) on a server that
// does not warm: savefail, undo, dlc and staging passed cold 10 runs in 10. The state wait on a server that does warm:
// undo failed its three checks. So the warm is what made a cold page slow to draw and a small request slow to answer;
// the numbers in the paragraph above were taken on a server in the middle of it. The state wait stays because it is
// right at any speed. The runner's own server is started the same way (run-tests.js startOwnLiveServer), so no live test
// meets a warm in either place.
"use strict";
require("./safe-write.js");   // FIRST: a bare run's sandbox, which the server started below inherits

const net = require("net");
const path = require("path");
const { spawn } = require("child_process");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// A BAND OF ITS OWN, BELOW THE RANGE WINDOWS HANDS OUT. The OS picking the port (listen on 0) sounds like it cannot
// collide, and is the opposite: Windows picks from 49152–65535, which is where 186 test files pin theirs (as does the
// runner, for its own server) — review saw servers started this way on 50565 and 50067 — and where every outbound
// connection on the machine takes one too. Another 481 files pin a port below that range, from 3471 up, so the band is a
// stretch none of them claims: test-a-bare-test-run-stays-out-of-the-real-folders.js reads every claim, the runner's port
// and the app's out of the source, and fails when one lands in here.
const OWN_SERVER_BAND = Object.freeze({ from: 41300, to: 41399 });
/** Can this port be bound right now? (Bound and let go: the server that is about to be started there is the one that keeps it.) */
const bindable = (port) => new Promise((res) => {
  const s = net.createServer();
  s.unref();
  s.once("error", () => res(false));
  s.listen(port, "127.0.0.1", () => s.close(() => res(true)));
});
/**
 * A port in the band that nothing holds right now — probed, not assumed — or 0 when every one is taken. Two runs at once
 * begin at different places (`start` fixes it, for a test), so they rarely even look at the same port first.
 */
async function freePortInBand(band = OWN_SERVER_BAND, { start } = {}) {
  const n = band.to - band.from + 1;
  const first = Number.isInteger(start) ? start : (process.pid * 7919 + Date.now()) % n;
  for (let i = 0; i < n; i++) {
    const port = band.from + ((((first + i) % n) + n) % n);
    if (await bindable(port)) return port;
  }
  return 0;
}
/** Does something on this port answer an HTTP request? (A socket that only accepts is not a server that works.) */
const answers = (port) => new Promise((res) => {
  let done = false;
  const s = net.connect(port, "127.0.0.1");
  const end = (v) => { if (!done) { done = true; clearTimeout(t); try { s.destroy(); } catch (_) {} res(v); } };
  const t = setTimeout(() => end(false), 4000);
  s.on("connect", () => s.write("GET /api/mods/list HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n"));
  s.on("data", () => end(true));
  s.on("error", () => end(false));
  s.on("close", () => end(false));
});
/** Stop it and wait until it is gone, so the files it held are free for the sandbox to be removed after it. */
function stopAndWait(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  try { child.kill(); } catch (_) { return; }
  const tick = new Int32Array(new SharedArrayBuffer(4));
  for (let i = 0; i < 100; i++) {
    try { process.kill(child.pid, 0); } catch (_) { return; }   // ESRCH: it has exited
    Atomics.wait(tick, 0, 0, 30);
  }
}

// What the child is told to be: this file run with it starts Nova's server, as main.js starts its own.
const SERVE_AS_THE_APP_DOES = "--serve-as-the-app-does";
// ⛔ #a-server-that-answers-is-not-yours — what the child says once ITS server is listening. "Something answers on the port"
// was all the parent asked, and another process that bound the port between the probe and the child's own bind answered
// that: the test drove it, and the child's EADDRINUSE never got its retry (the sandbox verifier's V3-1, with a stand-in
// that answered "IMPOSTOR").
const LISTENING = "[nova-live-server] listening on ";
/** The child's whole job. The port is the one in the environment, asked for and therefore not traded for another. */
function serveAsTheAppDoes() {
  return require("./server.js").startServer({ deferWarm: true }).then((s) => {
    try { process.stderr.write(`${LISTENING}${s && s.port}\n`); } catch (_) { /* nobody to tell */ }
    return s;
  }).catch((e) => {
    try { process.stderr.write(`${(e && e.code) || "ERROR"}: ${e && e.message}\n`); } catch (_) { /* nobody to tell */ }
    process.exit(1);
  });
}
/**
 * Start Nova's server for a live-app test that was given no port, and resolve to the port once it answers; 0 — with the
 * reason on stderr — when none would start, so the caller skips and says so. `name` is only for those messages.
 */
async function ownLiveServer(name, { timeoutMs = 90000, pickPort = freePortInBand } = {}) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const port = await pickPort();
    if (!port) {
      process.stderr.write(`[nova] ${name}: could not start a server of its own (no free port in ${OWN_SERVER_BAND.from}–${OWN_SERVER_BAND.to}); run it through run-tests.js instead.\n`);
      return 0;
    }
    const child = spawn(process.execPath, [__filename, SERVE_AS_THE_APP_DOES], {
      cwd: __dirname, env: Object.assign({}, process.env, { PORT: String(port) }), stdio: ["ignore", "ignore", "pipe"], windowsHide: true,
    });
    let stderr = "", tail = "", listening = false;
    child.stderr.on("data", (d) => {
      const t = d.toString();
      tail = (tail + t).slice(-400);   // the line may arrive split across two chunks
      if (tail.includes(LISTENING + port)) listening = true;
      if (stderr.length < 8000) stderr += t;
    });
    child.on("error", (e) => { stderr += String(e && e.message); });
    // Neither the child nor its pipe may keep the test alive: most live tests end by running out of work, not by exiting.
    child.unref();
    if (typeof child.stderr.unref === "function") child.stderr.unref();
    const stop = () => stopAndWait(child);
    process.on("exit", stop);
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline && child.exitCode === null && child.signalCode === null) {
      if (listening && await answers(port)) {
        process.stderr.write(`[nova] ${name}: no server was named, so it drives one of its own on 127.0.0.1:${port}, in its sandbox\n`);
        return port;
      }
      await sleep(250);
    }
    stop();
    process.removeListener("exit", stop);
    // Taken between the probe and the bind: pick again. Anything else is a reason to report, not to retry.
    if (/EADDRINUSE/.test(stderr) && attempt < 3) continue;
    const why = child.exitCode !== null ? `it exited with code ${child.exitCode}` : `it did not answer within ${Math.round(timeoutMs / 1000)}s`;
    process.stderr.write(`[nova] ${name}: could not start a server of its own (${why}); run it through run-tests.js instead.`
      + (stderr.trim() ? ` Its stderr: ${stderr.trim().split(/\r?\n/).slice(-3).join(" | ").slice(0, 400)}` : "") + "\n");
    return 0;
  }
  return 0;
}

// ── the research page, ready to be driven ────────────────────────────────────────────────────────────────────────────
// Long enough for a cold catalogue on a machine that is busy with other things; short of the runner's own five minutes.
// ⛔ #a-slow-page-is-not-a-stuck-page — this was a flat 180 s, and a page still loading its icons one by one on a machine at
// 100% CPU missed it (delete-undo-live in a suite run beside other work, 09-30: 102 nodes drawn, six icons still out, and it
// passed alone in 71 s). A page that is still getting somewhere is waited for up to this cap; one that has STOPPED getting
// anywhere — nothing drawn, loaded or answered for RESEARCH_STALL_MS — is given up on then, however early that is.
const RESEARCH_READY_TIMEOUT_MS = 280000;
const RESEARCH_STALL_MS = 90000;
// Longer than the page takes to say it is waiting: a request is 500 ms old before the loading overlay goes up, and the
// overlay looks every 120 ms. So a request still out after this settle has the overlay up, and one that came back has drawn.
const RESEARCH_SETTLE_MS = 700;
/* What the page shows, read in the page. */
const researchPageState = () => {
  const ov = document.getElementById("nova-loading-overlay");
  const glyphs = [...document.querySelectorAll(".research-gui-label img.gui-label-glyph")];
  return {
    overlayUp: !!ov && getComputedStyle(ov).display !== "none",
    nodes: document.querySelectorAll("#nodesLayer .tech-node").length,
    labels: document.querySelectorAll(".research-gui-label").length,
    glyphsPending: glyphs.filter((i) => !(i.complete && i.naturalWidth > 0)).length,
  };
};
/*
 * The requests a page has made that have not come back, counted where playwright reports them: every kind — a fetch, an
 * <img>, a background image — and whichever document asked. From the first call for that page on.
 */
const _requestsOut = new WeakMap();   // page -> Set of requests still out
function requestsOut(page) {
  let out = _requestsOut.get(page);
  if (out) return out;
  out = new Set();
  out.answered = 0;   // how many have come back: progress, even while as many more are still out
  page.on("request", (r) => out.add(r));
  page.on("requestfinished", (r) => { if (out.delete(r)) out.answered++; });
  page.on("requestfailed", (r) => { if (out.delete(r)) out.answered++; });
  _requestsOut.set(page, out);
  return out;
}
/**
 * Resolve when the research page can be driven: the loading overlay is not displayed, more than three tech nodes are drawn
 * (loadCatalog has run to its end — it draws them last, just before it clears the undo history), every section label's
 * glyph image has loaded, no request of the page's is still out (the server owes it nothing, so the next thing it asks
 * for is answered at once), and nothing more has been drawn for a settle. Rejects, saying what the page looked like, when
 * it does not get there. A state, not a delay: warm it takes the settle, cold as long as the page and its server do.
 */
async function researchPageReady(page, { timeoutMs = RESEARCH_READY_TIMEOUT_MS, settleMs = RESEARCH_SETTLE_MS, stallMs = RESEARCH_STALL_MS } = {}) {
  const t0 = Date.now(), deadline = t0 + timeoutMs;
  const out = requestsOut(page);
  let held = null, last = null, moved = { key: "", at: t0 };
  for (;;) {
    let s = null;
    try { s = await page.evaluate(researchPageState); } catch (_) { s = null; /* between two documents: ask the next one */ }
    if (s) { s.requestsOut = out.size; last = s; }
    const ready = !!s && !s.overlayUp && s.nodes > 3 && s.glyphsPending === 0 && out.size === 0;
    const drawn = ready ? s.nodes + " nodes, " + s.labels + " labels" : "";
    if (!ready) held = null;
    else if (!held || held.drawn !== drawn) held = { drawn, since: Date.now() };
    else if (Date.now() - held.since >= settleMs) return s;
    // Progress: anything drawn, loaded or answered since the last look.
    const key = s ? [s.overlayUp, s.nodes, s.labels, s.glyphsPending, out.size, out.answered].join("/") : moved.key;
    if (key !== moved.key) moved = { key, at: Date.now() };
    const stalled = Date.now() - moved.at >= stallMs;
    if (stalled || Date.now() >= deadline) {
      const waitingFor = [...out].slice(0, 3).map((r) => { try { return r.url().replace(/^https?:\/\/[^/]+/, "").slice(0, 120); } catch (_) { return "?"; } });
      throw new Error(`the research page was not ready to be driven ${stalled
        ? `— nothing drawn, loaded or answered for ${Math.round(stallMs / 1000)}s (after ${Math.round((Date.now() - t0) / 1000)}s)`
        : `within ${Math.round(timeoutMs / 1000)}s`}: ${JSON.stringify(last)}`
        + (waitingFor.length ? ` — still out: ${waitingFor.join(" | ")}` : ""));
    }
    await sleep(100);
  }
}
/**
 * Open research.html on `mod` at `origin` (http://localhost:PORT) and resolve when it is ready (researchPageReady).
 * `storage` is more localStorage to put there before the page boots.
 *
 * THE MOD IS NAMED BEFORE THE PAGE BOOTS, NOT BY BOOTING IT TWICE. The tests opened the page, stored activeModPath and
 * reloaded. Isolated on a cold server: the first document was still booting when the mod was stored, read it, and asked
 * for that mod's catalogue; the reload's own document came back in 0.2 s, but its scripts queued behind that scan on a
 * server that does one thing at a time, and its DOMContentLoaded took 42.65 s — past page.reload's 30 s whenever the scan
 * was (test-research-staging-live.js failed 1 run in 2 that way). One document asks once. Only the first: a reload later
 * in a test finds the mod stored and keeps whatever the page has stored since.
 *
 * The navigation is given the same budget as the wait. Its document is a static file, so that only matters when the
 * server is still busy with a scan the page before this one asked for.
 */
async function openResearchPage(page, origin, mod, { storage = {}, timeoutMs = RESEARCH_READY_TIMEOUT_MS } = {}) {
  requestsOut(page);   // counted from before the page asks for anything
  await page.addInitScript(({ mod, storage }) => {
    try {
      if (localStorage.getItem("activeModPath")) return;
      localStorage.setItem("activeModPath", mod);
      for (const k of Object.keys(storage)) localStorage.setItem(k, storage[k]);
    } catch (_) { /* a frame with no storage of its own */ }
  }, { mod, storage });
  await page.goto(`${origin}/research.html`, { waitUntil: "domcontentloaded", timeout: timeoutMs });
  return researchPageReady(page, { timeoutMs });
}

module.exports = { ownLiveServer, openResearchPage, researchPageReady, freePortInBand, OWN_SERVER_BAND };

// Run as the child ownLiveServer starts (never when a test requires this file): be the server.
if (require.main === module && process.argv[2] === SERVE_AS_THE_APP_DOES) serveAsTheAppDoes();
