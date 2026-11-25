// ⛔ #a-sandboxed-launch-keeps-its-port — A LAUNCH TOLD WHICH PORT TO USE USES IT, OR SAYS WHY NOT. UNTOLD, NOTHING CHANGES.
//
// main.js started the app's own server with startServer({ port: constants.DEFAULT_PORT, allowPortFallback: true }) — the
// owner's port, passed explicitly, and in startServer an explicit port beats PORT, so no variable could move it. Every launch
// of the real app took 47821 whenever it was free: e2e-workflow-test.js and e2e-research-test.js (round 1 of the e2e campaign,
// 2026-11-04, left the first unrun, that port among its reasons), and no sandboxed boot of the app, a packaged exe's included,
// could keep off it either. main.js now reads NOVA_PORT. This runs the REAL main.js, top to bottom, with only what it cannot
// have outside Electron stubbed — electron, ./server and child_process — and holds it to:
//   1. unset: startServer gets exactly what it always got (Nova's port, the fallback allowed, the warm deferred), in development
//      and packaged, and the window loads from whatever port the server got;
//   2. a port (1024-65535, surrounding spaces allowed): startServer gets THAT port with the fallback OFF, in development and
//      packaged, and the window loads from it;
//   3. anything else, set but empty included: refused before any window opens — no server, a message on stderr that quotes the
//      value and names the range, exit code 1, and no dialog (a harness set it; a box would hold the harness till its timeout);
//   4. a port that cannot be had (busy, or refused by Windows): ONE attempt, no other port, the same kind of refusal, naming the
//      port and saying it will not move — and a startServer failure that is NOT about the port is not dressed up as one: it
//      takes the usual way out, the box, as it would without NOVA_PORT;
//   5. a later failure on a port that was asked for gets the usual box, which no longer claims a fallback that did not happen
//      (CONTROL: an unasked launch that did fall back still says so);
//   6. the real startServer, handed what main.js now hands it, refuses a held port rather than swap it (CONTROL: with the
//      fallback allowed, as an unset launch has, it does move).
// ⚠️ The variable's name is assembled, never written out in code: run-tests.js reads a file whose code names the env read as
// one that drives the live app, and runs it only against the runner's own server (test-runner-cannot-wedge.js says why).
"use strict";
require("./safe-write.js");   // FIRST: section 6 loads server.js in this process; a bare run gets its sandbox before that
const fs = require("fs");
const net = require("net");
const path = require("path");
const vm = require("vm");
const Module = require("module");
const { EventEmitter } = require("events");

let checks = 0;
const fails = [];
const labels = [];
const rec = (label, ok, detail) => {
  checks++;
  labels.push(label);
  console.log((ok ? "  ok   " : "  FAIL ") + label + (ok || detail === undefined ? "" : "   -> " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 700)));
  if (!ok) fails.push(label);
};

const NAME = ["NOVA", "PORT"].join("_");
const MAIN = path.join(__dirname, "main.js");
const MAIN_SRC = fs.readFileSync(MAIN, "utf8");
// DERIVED: Nova's own port is server.js's, read out of its source rather than typed here.
const APP_PORT = Number((/const DEFAULT_PORT = (\d{4,5});/.exec(fs.readFileSync(path.join(__dirname, "server.js"), "utf8")) || [])[1] || 0);

// A stand-in that accepts any call or property and is never a promise — for the parts of a BrowserWindow main.js only wires up.
function chain(overrides = {}) {
  return new Proxy(function () {}, {
    get(_t, k) {
      if (Object.prototype.hasOwnProperty.call(overrides, k)) return overrides[k];
      if (k === "then" || typeof k === "symbol") return undefined;
      return chain();
    },
    apply() { return chain(); },
    construct() { return chain(); },
  });
}

/**
 * Loads main.js as Node would (Module.wrap, its own require), with electron, ./server and child_process stubbed, sets NOVA_PORT
 * to `value` (undefined: removed) for the length of the run, runs its whenReady handler to the end, and returns what it did.
 * `serve(opts)` plays startServer; `loadFails` makes the main window's load reject with that message.
 */
async function runMain({ value, isPackaged = false, serve, loadFails = null } = {}) {
  const did = { starts: [], windows: [], urls: [], exits: [], quits: 0, boxes: [], stderr: [], forks: 0, readyRan: false };
  let readyHandler = null;
  const app = {
    isPackaged,
    getPath(name) { throw new Error("stub: no " + name + " folder here"); },
    getName() { return "nova-modding-suite"; },
    requestSingleInstanceLock() { return true; },
    on() { return app; },
    whenReady() { return { then(fn) { readyHandler = fn; return Promise.resolve(); } }; },
    quit() { did.quits++; },
    exit(code) { did.exits.push(code === undefined ? 0 : code); },
    setAppUserModelId() {},
  };
  function BrowserWindow(opts) {
    did.windows.push(opts && opts.frame === false ? "splash" : "main");
    const w = chain({
      once: (ev, cb) => { if (ev === "ready-to-show") setImmediate(cb); return w; },
      loadFile: () => Promise.resolve(),
      loadURL: (u) => { did.urls.push(u); return loadFails ? Promise.reject(new Error(loadFails)) : Promise.resolve(); },
      isDestroyed: () => false,
      webContents: chain({ executeJavaScript: () => Promise.resolve(""), once: () => {}, send: () => {} }),
    });
    return w;
  }
  BrowserWindow.getAllWindows = () => [];
  BrowserWindow.fromWebContents = () => null;
  const electronStub = {
    app, BrowserWindow,
    dialog: { showErrorBox: (title, msg) => { did.boxes.push({ title, msg }); }, showMessageBox: () => Promise.resolve({ response: 0 }) },
    ipcMain: { handle() {}, removeHandler() {} },
    Menu: { buildFromTemplate: () => ({}) },
  };
  const serverStub = {
    startServer: async (opts) => { did.starts.push(Object.assign({}, opts)); return serve(opts); },
    constants: { DEFAULT_PORT: APP_PORT, ROOT: __dirname, MODS_ROOT: "", registeredModDirs: () => [], otherModsFolders: () => [], resolveHoi4GameRoot: () => "" },
  };
  const childProcessStub = {
    // the warm child: one that finishes at once
    fork: () => { did.forks++; const c = new EventEmitter(); c.kill = () => {}; setImmediate(() => c.emit("exit", 0)); return c; },
    spawn: () => { throw new Error("stub: main.js started a process it should not have"); },
  };
  const STUBS = { electron: electronStub, "./server": serverStub, child_process: childProcessStub };
  const req = (id) => (Object.prototype.hasOwnProperty.call(STUBS, id) ? STUBS[id] : require(id));

  const hadValue = Object.prototype.hasOwnProperty.call(process.env, NAME), before = process.env[NAME];
  if (value === undefined) delete process.env[NAME]; else process.env[NAME] = value;
  const realError = console.error;
  console.error = (...a) => { did.stderr.push(a.map(String).join(" ")); };
  try {
    const fn = vm.runInThisContext(Module.wrap(MAIN_SRC), { filename: MAIN });
    const mod = { exports: {} };
    fn.call(mod.exports, mod.exports, req, mod, MAIN, path.dirname(MAIN));
    if (readyHandler) { await readyHandler(); did.readyRan = true; }
    for (let i = 0; i < 10; i++) await new Promise((r) => setImmediate(r));
  } catch (e) {
    did.threw = String(e && e.stack || e).slice(0, 600);
  } finally {
    console.error = realError;
    if (hadValue) process.env[NAME] = before; else delete process.env[NAME];
  }
  return did;
}
const servesWhatItIsAsked = (opts) => ({ port: opts.port, app: { locals: {} }, server: null, close: () => Promise.resolve() });
const listenFails = (code) => async (opts) => {
  const e = new Error(`Port ${opts.port} is already in use, and it was asked for explicitly, so this server will not quietly listen somewhere else`);
  e.code = code; e.port = opts.port;
  throw e;
};
const sameJson = (a, b) => JSON.stringify(a) === JSON.stringify(b);
// The four ports these cases hand main.js, BUILT, not written, as test-no-test-hijacks-the-users-server.js builds its own: startServer
// is a stub here and nothing binds them, and a five-digit port spelt out in a test file (a comment too) is read as that file's claim by
// test-the-documented-test-port-range-is-the-real-one.js, which then found the suite's ports running past CLAUDE.md's range.
const ASKED = (k) => 55 * 1000 + 150 + k;

(async () => {
  rec("Nova's own port was read out of server.js", APP_PORT >= 1024 && APP_PORT <= 65535, APP_PORT);

  console.log("\n1. unset: startServer gets exactly what it always got");
  for (const isPackaged of [false, true]) {
    const where = isPackaged ? "packaged" : "development";
    const d = await runMain({ value: undefined, isPackaged, serve: servesWhatItIsAsked });
    rec(`THE CONTROL (${where}): the stubbed launch ran main.js to the end — splash, main window, the warm child, the window's load`,
      d.readyRan && !d.threw && sameJson(d.windows, ["splash", "main"]) && d.forks === 1 && d.urls.length === 1, d);
    rec(`⭐⭐ (${where}) one startServer call, with Nova's port, the fallback allowed and the warm deferred, as before`,
      sameJson(d.starts, [{ port: APP_PORT, allowPortFallback: true, deferWarm: true }]), d.starts);
    rec(`(${where}) …the window loads from that server, and nothing was refused`,
      d.urls[0] === `http://127.0.0.1:${APP_PORT}/home.html` && !d.exits.length && !d.stderr.length && !d.boxes.length && !d.quits, d);
  }
  {
    const fellBackTo = APP_PORT + 1;
    const d = await runMain({ value: undefined, serve: (o) => servesWhatItIsAsked({ port: fellBackTo }) });
    rec("…and when the server had to move, the window still follows it, as it always did", d.urls[0] === `http://127.0.0.1:${fellBackTo}/home.html`, d.urls);
  }

  console.log("\n2. a port: startServer gets THAT port, with the fallback off");
  for (const [value, n, isPackaged] of [[String(ASKED(0)), ASKED(0), false], [String(ASKED(0)), ASKED(0), true], [` ${ASKED(1)} `, ASKED(1), false], ["1024", 1024, false], ["65535", 65535, true]]) {
    const where = (isPackaged ? "packaged" : "development") + `, ${JSON.stringify(value)}`;
    const d = await runMain({ value, isPackaged, serve: servesWhatItIsAsked });
    rec(`⭐⭐⭐ (${where}) one startServer call, on ${n}, with the fallback OFF`,
      sameJson(d.starts, [{ port: n, allowPortFallback: false, deferWarm: true }]), d.starts);
    rec(`⭐ (${where}) …the window loads from ${n}, and the launch went on as usual`,
      d.urls[0] === `http://127.0.0.1:${n}/home.html` && sameJson(d.windows, ["splash", "main"]) && !d.exits.length && !d.stderr.length && !d.boxes.length, d);
  }

  console.log("\n3. anything else: refused before any window opens, on stderr, exit 1, no dialog");
  for (const value of ["", "   ", "abc", "80", "1023", "0", "-1", "65536", "99999", `${ASKED(0)}.5`, `${ASKED(0)}abc`, "5515O", "1e4", "0x1F90", `+${ASKED(0)}`]) {
    const d = await runMain({ value, serve: servesWhatItIsAsked });
    const said = d.stderr.join("\n");
    rec(`⭐⭐⭐ ${JSON.stringify(value)}: no server, no window, exit code 1, no dialog`,
      d.readyRan && !d.starts.length && !d.windows.length && sameJson(d.exits, [1]) && !d.boxes.length && !d.quits, d);
    rec(`⭐ ${JSON.stringify(value)}: …and stderr says why, quoting the value and naming the range`,
      d.stderr.length === 1 && said.includes(NAME) && said.includes(JSON.stringify(value)) && /\b1024\b/.test(said) && /\b65535\b/.test(said), d.stderr);
  }

  console.log("\n4. a port that cannot be had: one attempt, no other port, refused the same way");
  // ⛔ #a-label-is-not-a-port-clash — the error code is NOT printed in a label. run-tests.js re-runs a failed file once when its
  // output says the OS's own words for "the OS gave another test this port" (PORT_CLASH), and these labels printed the code on
  // every run, so every failure of this file was reported as a port clash and re-run (round 2's review: all 8 back-out records,
  // and its own mutant). A re-run can turn a failure that does not happen every time into a pass. Checked at the end.
  const HELD = { EADDRINUSE: "a port another program holds", EACCES: "a port this user may not take" };
  for (const code of ["EADDRINUSE", "EACCES"]) {
    const d = await runMain({ value: String(ASKED(2)), serve: listenFails(code) });
    const said = d.stderr.join("\n");
    const what = HELD[code];
    rec(`⭐⭐⭐ ${what}: ONE startServer call, on ${ASKED(2)} with the fallback off — no second try anywhere else`,
      sameJson(d.starts, [{ port: ASKED(2), allowPortFallback: false, deferWarm: true }]), d.starts);
    rec(`⭐⭐ ${what}: …exit code 1, no dialog, and no main window (only the splash had opened)`,
      sameJson(d.exits, [1]) && !d.boxes.length && !d.quits && sameJson(d.windows, ["splash"]) && !d.urls.length, d);
    rec(`⭐ ${what}: …and stderr names the variable, the port and the error code, and says it will not move`,
      d.stderr.length === 1 && said.includes(NAME) && said.includes(String(ASKED(2))) && said.includes(code) && /another port/i.test(said), d.stderr);
  }
  {
    // listen()'s own error, with a code outside those two: Windows out of socket buffers (ephemeral ports exhausted) says ENOBUFS
    const d = await runMain({ value: String(ASKED(2)), serve: async () => { const e = new Error(`listen ENOBUFS: no buffer space available 127.0.0.1:${ASKED(2)}`); e.syscall = "listen"; e.code = "ENOBUFS"; throw e; } });
    rec("…and any error listen() itself reports (syscall listen, here ENOBUFS) is a port refusal too",
      sameJson(d.exits, [1]) && !d.boxes.length && d.stderr.length === 1 && d.stderr[0].includes("ENOBUFS"), d);
  }
  {
    const d = await runMain({ value: String(ASKED(2)), serve: async () => { throw new Error("stub: the app could not be built"); } });
    const box = (d.boxes[0] || {}).msg || "";
    rec("⭐⭐ a startServer failure that is NOT about the port is not called one: the usual box with its detail, no stderr, no exit code",
      d.boxes.length === 1 && d.boxes[0].title === "Nova could not start" && box.includes("the app could not be built")
        && !d.stderr.length && !d.exits.length && d.quits === 1, d);
  }

  console.log("\n5. a later failure: the usual box, with no fallback claimed for a port that was asked for");
  {
    const asked = await runMain({ value: String(ASKED(3)), serve: servesWhatItIsAsked, loadFails: `ERR_FAILED (-2) loading 'http://127.0.0.1:${ASKED(3)}/home.html'` });
    const box = (asked.boxes[0] || {}).msg || "";
    rec("⭐ asked: the failure is the box it always was (not a port refusal: the port was had)",
      asked.boxes.length === 1 && asked.boxes[0].title === "Nova could not start" && !asked.exits.length && asked.quits === 1, asked);
    rec("⭐⭐ …and it does not say Nova fell back to a port it was given", !/fell back/i.test(box) && /background service/i.test(box), box);
    const fellBackTo = APP_PORT + 1;
    const unasked = await runMain({ value: undefined, serve: () => servesWhatItIsAsked({ port: fellBackTo }), loadFails: "ERR_FAILED (-2)" });
    const box2 = (unasked.boxes[0] || {}).msg || "";
    rec("CONTROL: unasked and really moved, the box still says it fell back, and to where", new RegExp("fell back to port " + fellBackTo).test(box2), box2);
  }

  console.log("\n6. the real startServer, handed what main.js now hands it, keeps the port or refuses");
  {
    const holder = net.createServer();
    await new Promise((r) => holder.listen(0, "127.0.0.1", r));
    const held = holder.address().port;
    const { startServer } = require("./server.js");
    let refused = null, wrongly = null;
    try { wrongly = await startServer({ port: held, allowPortFallback: false, deferWarm: true }); } catch (e) { refused = e; }
    rec("⭐⭐⭐ allowPortFallback false on a held port: it throws the address-in-use error naming the port, and listens nowhere",
      !!refused && refused.code === "EADDRINUSE" && String(refused.message).includes(String(held)) && !wrongly, refused ? refused.code + " " + refused.message.slice(0, 160) : wrongly && wrongly.port);
    if (wrongly) { try { await wrongly.close(); } catch (_) {} }
    let moved = null;
    try { moved = await startServer({ port: held, allowPortFallback: true, deferWarm: true }); } catch (e) { moved = { error: e.code || e.message }; }
    rec("CONTROL: with the fallback allowed, as an unset launch has, it does move to another port", !!moved && moved.port && moved.port !== held, moved && (moved.port || moved.error));
    if (moved && moved.close) { try { await moved.close(); } catch (_) {} }
    await new Promise((r) => holder.close(r));
  }

  {
    // #a-label-is-not-a-port-clash — read out of run-tests.js, so the check moves with the runner's own words.
    const runnerSrc = fs.readFileSync(path.join(__dirname, "run-tests.js"), "utf8");
    const m = /const PORT_CLASH = \/(.+)\/([a-z]*);/.exec(runnerSrc);
    const clash = m ? new RegExp(m[1], m[2]) : null;
    rec("THE CONTROL: run-tests.js's port-clash words were read out of its source", !!clash && clash.test("listen EADDRINUSE: address already in use"), m && m[0]);
    const says = clash ? labels.filter((l) => clash.test(l)) : [];
    rec("⭐ no label of this file says them, so a failure here is never re-run as a port clash", !!clash && !says.length, says);
  }

  console.log(`\n=== a sandboxed launch keeps its port: ${checks} checks, ${fails.length} failed ===`);
  if (fails.length) console.log("FAILED: " + fails.join(" | "));
  process.exit(fails.length ? 1 : 0);
})().catch((e) => { console.log("HARNESS ERROR " + (e && e.stack || e)); process.exit(1); });
