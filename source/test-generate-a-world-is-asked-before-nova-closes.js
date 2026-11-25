// 🌍 CLOSING NOVA WHILE A WORLD IS BEING GENERATED ASKS FIRST — from every way out. #closing-nova-mid-world-asks-first
//
// The world is written by a child process (world-run.js) while Nova runs; closing Nova stops it part-way and leaves the map half-built.
// main.js asks, through the server's own app.locals (worldRunActive / stopWorldRun), from:
//   · the window's X — the window "close" handler, BEFORE its `if (isQuitting || allowWindowClose || closePromptInFlight) return;`;
//   · File → Exit — role "quit" calls app.quit(), which emits before-quit FIRST and then closes the window with isQuitting already
//     set, so a question placed after that early return is never asked. Measured by the critic on Electron 41.2.1 (quitprobe):
//     before-quit → close (isQuitting = true, early return) → will-quit, and window-all-closed is NOT emitted on app.quit — so a
//     stop hooked only into shutdownServer (window-all-closed) never ran.
// "Keep Nova open" changes nothing (isQuitting stays false); "Close anyway" stops the run (its record is written first, server.js) and
// closes. will-quit and shutdownServer stop a run still going, idempotently.
//
// The handlers are main.js's own text, lifted and run here with fake Electron objects that emit in the order Electron does.
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { maskJsComments } = require("./testlib-strip-comments.js");

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (ok || detail == null ? "" : "   -> " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 600)));
  if (!ok) fails.push(label);
};
const SRC = fs.readFileSync(path.join(__dirname, "main.js"), "utf8").replace(/\r\n/g, "\n");
const MASKED = maskJsComments(SRC);
/** main.js's text from `start` to the first `end` after it (both searched in the comment-masked text). */
const grab = (start, end) => { const s = MASKED.indexOf(start); if (s < 0) return ""; const e = MASKED.indexOf(end, s); return e < 0 ? "" : SRC.slice(s, e + end.length); };
const WORLD = grab("let worldRunQuitConfirmed = false;", "\n}\n\nipcMain.handle(\"force-repaint\"").replace(/\n\nipcMain\.handle\("force-repaint"$/, "");
const CLOSE = grab('mainWindow.on("close", async (event) => {', "\n  });");
const BEFORE = grab('app.on("before-quit", (event) => {', "\n});");
const WILL = grab('app.on("will-quit",', "});");
const SHUTDOWN = grab("async function shutdownServer() {", "\n}");

const DIALOG = {
  type: "warning",
  title: "Generating a world",
  message: "Nova is still generating a world for Mod X (step 3 of 6).",
  detail: "Closing now stops it part-way: your mod keeps what was written so far, with its map half-built. Keep Nova open until it finishes?",
  buttons: ["Keep Nova open", "Close anyway"],
  defaultId: 0, cancelId: 0, noLink: true,
};

/** A fresh main process: fake app, window, dialog and server, the lifted handlers registered on them. */
function mainProcess({ active = true, answer = 0 } = {}) {
  const log = [];
  let running = active;
  const handlers = { app: {}, win: {} };
  const ev = () => { const e = { prevented: false, preventDefault() { e.prevented = true; } }; return e; };
  const win = {
    destroyed: false,
    on(name, fn) { handlers.win[name] = fn; },
    isDestroyed() { return win.destroyed; },
    async close() { log.push("win.close()"); const e = ev(); await handlers.win.close(e); if (!e.prevented) { win.destroyed = true; log.push("window closed"); } },
    webContents: { async executeJavaScript(code) { log.push("executeJavaScript"); return false; } },
  };
  const app = {
    on(name, fn) { handlers.app[name] = fn; },
    // app.quit(): before-quit, then (unless prevented) each window is closed — with isQuitting set by then — then will-quit
    async quit() {
      log.push("app.quit()");
      const e = ev();
      handlers.app["before-quit"](e);
      if (e.prevented) { log.push("quit prevented"); return; }
      if (!win.destroyed) { const c = ev(); await handlers.win.close(c); if (c.prevented) { log.push("close prevented"); return; } win.destroyed = true; log.push("window closed"); }
      if (handlers.app["will-quit"]) handlers.app["will-quit"](ev());
      log.push("quit done");
    },
  };
  const dialog = { async showMessageBox(w, opts) { if (!opts) opts = w; log.push("dialog"); dialog.last = opts; return { response: answer }; } };
  const serverHandle = {
    app: { locals: {
      worldRunActive: () => (running ? { modRoot: "C:/m/x", modName: "Mod X", stepIndex: 2, k: 3, title: "Raise new land" } : null),
      stopWorldRun: (reason) => { log.push(`stopWorldRun(${reason})`); const was = running; running = false; return was; },
    } },
    async close() { log.push("server closed"); },
  };
  const sb = { console, app, dialog, Promise, captureActiveModForNextLaunch: () => {}, process: { platform: "win32" } };
  sb.globalThis = sb;
  vm.createContext(sb);
  const code = [
    "var isQuitting = false, allowWindowClose = false, closePromptInFlight = false;",
    "var serverHandle = globalThis.__serverHandle;",
    "var mainWindow = globalThis.__win;",
    WORLD, SHUTDOWN, CLOSE, BEFORE, WILL,
    "globalThis.__state = () => ({ isQuitting, worldRunQuitConfirmed });",
    "globalThis.__shutdown = shutdownServer;",
  ].join("\n");
  sb.__serverHandle = serverHandle; sb.__win = win;
  vm.runInContext(code, sb, { filename: "main.js (lifted)" });
  return { log, win, app, dialog, handlers, sb, state: () => sb.__state(), get running() { return running; } };
}
const settle = async () => { for (let i = 0; i < 20; i++) await new Promise((r) => setImmediate(r)); };

(async () => {
  try {
    rec("main.js's world block, close handler, before-quit, will-quit and shutdownServer were lifted",
      WORLD.length > 500 && CLOSE.length > 500 && BEFORE.length > 100 && WILL.length > 20 && SHUTDOWN.length > 50, [WORLD.length, CLOSE.length, BEFORE.length, WILL.length, SHUTDOWN.length]);
    const ask = CLOSE.indexOf("worldRunActiveNow()"), early = CLOSE.indexOf("if (isQuitting || allowWindowClose || closePromptInFlight) return;");
    rec("⭐ the window's own question comes BEFORE its isQuitting early return", ask > 0 && early > ask, { ask, early });

    console.log("\n1. the window's X during a run");
    {
      const m = mainProcess({ answer: 0 });
      await m.win.close();
      await settle();
      const d = m.dialog.last || {};
      rec("⭐⭐ it asks, with the design's words, title, buttons and defaults", JSON.stringify(d) === JSON.stringify(DIALOG), d);
      rec("⭐ …before anything is asked of the page (the unsaved-changes check)", m.log.indexOf("dialog") !== -1 && (m.log.indexOf("executeJavaScript") === -1 || m.log.indexOf("dialog") < m.log.indexOf("executeJavaScript")), m.log);
      rec("\"Keep Nova open\": the window stays, the run goes on", !m.win.destroyed && m.running && !m.log.some((l) => l.startsWith("stopWorldRun")), m.log);
    }
    {
      const m = mainProcess({ answer: 1 });
      await m.win.close();
      await settle();
      const stop = m.log.indexOf("stopWorldRun(closed)"), closed = m.log.indexOf("window closed");
      rec("⭐⭐ \"Close anyway\": stopWorldRun(\"closed\") first, then the window closes", stop !== -1 && closed > stop && m.win.destroyed, m.log);
      rec("…down the normal close path (the page is asked about unsaved changes after the stop)", m.log.indexOf("executeJavaScript") > stop, m.log);
    }

    console.log("\n2. File → Exit (role \"quit\": app.quit() → before-quit → close with isQuitting set → will-quit)");
    {
      const m = mainProcess({ answer: 0 });
      await m.app.quit();
      await settle();
      rec("⭐⭐ it asks, with the same words", JSON.stringify(m.dialog.last || {}) === JSON.stringify(DIALOG), m.log);
      rec("⭐ \"Keep Nova open\": nothing closes, the run goes on, and isQuitting stays false", !m.win.destroyed && m.running && m.state().isQuitting === false && !m.log.includes("quit done"), { log: m.log, state: m.state() });
    }
    {
      const m = mainProcess({ answer: 1 });
      await m.app.quit();
      await settle();
      const stop = m.log.indexOf("stopWorldRun(closed)");
      rec("⭐⭐ \"Close anyway\": stopWorldRun(\"closed\"), then Nova quits", stop !== -1 && m.log.includes("quit done") && m.log.lastIndexOf("app.quit()") > stop && m.win.destroyed, m.log);
      rec("…asked once, not again by the window on the way out", m.log.filter((l) => l === "dialog").length === 1, m.log);
    }

    console.log("\n3. no run: nothing is asked");
    {
      const m = mainProcess({ active: false });
      await m.app.quit();
      await settle();
      rec("THE CONTROL: File → Exit with no run quits without the world's question", m.log.includes("quit done") && !m.log.includes("dialog") && m.state().isQuitting === true, m.log);
      const w = mainProcess({ active: false });
      await w.win.close();
      await settle();
      rec("THE CONTROL: the window's X with no run asks the page about unsaved changes, as before", w.log.includes("executeJavaScript") && !w.log.includes("dialog"), w.log);
    }

    console.log("\n4. the last word on the way out stops a run still going");
    {
      const m = mainProcess({ active: true });
      m.handlers.app["will-quit"]({ preventDefault() {} });
      rec("⭐ will-quit calls stopWorldRun(\"closed\")", m.log.includes("stopWorldRun(closed)"), m.log);
      const s = mainProcess({ active: true });
      await s.sb.__shutdown();
      rec("⭐ shutdownServer calls stopWorldRun(\"closed\") before it closes the server", s.log.indexOf("stopWorldRun(closed)") !== -1 && s.log.indexOf("stopWorldRun(closed)") < s.log.indexOf("server closed"), s.log);
    }
  } catch (e) {
    rec("HARNESS ERROR", false, e && e.stack);
  }
  console.log(`\n=== 🌍 Generate a world is asked before Nova closes: ${checks} checks, ${fails.length} failed ===`);
  if (fails.length) { for (const f of fails) console.log("   FAILED: " + f); process.exitCode = 1; }
})();
