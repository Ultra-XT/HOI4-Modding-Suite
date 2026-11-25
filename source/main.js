const path = require("path");
const fs = require("fs");
const { spawn, fork } = require("child_process");
const { app, BrowserWindow, dialog, ipcMain, Menu } = require("electron");
// #nova-wrote-into-the-drive-root — WHERE WINDOWS REALLY KEEPS DOCUMENTS, for server.js to name the mods folder by. OneDrive's
// "back up Documents" and the folder's Location tab move it and HOI4 follows; a guessed <home>\Documents made New mod
// create a mod the launcher never lists. Set BEFORE server.js loads, because it decides the mods folder as it loads.
if (!process.env.NOVA_DOCUMENTS_DIR) {
  try { process.env.NOVA_DOCUMENTS_DIR = app.getPath("documents"); } catch (_) { /* no answer: server.js falls back to its guesses */ }
}
const { startServer, constants } = require("./server");
const DEVTOOLS_BLOCKED_MESSAGE =
  "Developer tools are disabled in this build to keep the editor stable and reduce security risk from pasted console snippets.";
const HARDENED_NET_BLOCK_MESSAGE =
  "This build is hardened: external websites and external app links are blocked.";


ipcMain.handle("clipboard-write", async (event, text) => {
  const { clipboard } = require("electron");
  clipboard.writeText(String(text || ""));
  return true;
});
ipcMain.handle("pick-focus-tree-file", async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const { canceled, filePaths } = await dialog.showOpenDialog(win || undefined, {
    title: "Open focus tree",
    properties: ["openFile"],
    filters: [{ name: "Focus tree (.txt)", extensions: ["txt"] }],
  });
  if (canceled || !filePaths || !filePaths[0]) return null;
  return filePaths[0];
});

ipcMain.handle("pick-localization-file", async (event, options = {}) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const modRoot = options && typeof options.modRoot === "string" ? options.modRoot.trim() : "";
  const defaultLocDir = modRoot
    ? path.join(modRoot, "localisation", "english")
    : path.join(constants.ROOT, "localisation", "english");
  const { canceled, filePaths } = await dialog.showOpenDialog(win || undefined, {
    title: "Import localization file",
    defaultPath: defaultLocDir,
    properties: ["openFile"],
    filters: [{ name: "Localization (.yml)", extensions: ["yml"] }],
  });
  if (canceled || !filePaths || !filePaths[0]) return null;
  return filePaths[0];
});

ipcMain.handle("create-localization-file", async (event, options = {}) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const modRoot = options && typeof options.modRoot === "string" ? options.modRoot.trim() : "";
  const englishDir = modRoot
    ? path.join(modRoot, "localisation", "english")
    : path.join(constants.ROOT, "localisation", "english");
  const defaultLocPath = path.join(englishDir, "focus_editor_l_english.yml");
  const { canceled, filePath } = await dialog.showSaveDialog(win || undefined, {
    title: "Create localization file",
    defaultPath: defaultLocPath,
    filters: [{ name: "Localization (.yml)", extensions: ["yml"] }],
  });
  if (canceled || !filePath) return null;
  return filePath;
});

ipcMain.handle("pick-gfx-dds-file", async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const { canceled, filePaths } = await dialog.showOpenDialog(win || undefined, {
    title: "Import focus DDS image",
    properties: ["openFile"],
    filters: [{ name: "DDS image (.dds)", extensions: ["dds"] }],
  });
  if (canceled || !filePaths || !filePaths[0]) return null;
  return filePaths[0];
});

ipcMain.handle("pick-flag-image-file", async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  let defaultPath;
  try {
    defaultPath = app.getPath("desktop");
  } catch (_e) {
    defaultPath = undefined;
  }
  const { canceled, filePaths } = await dialog.showOpenDialog(win || undefined, {
    title: "Choose flag source (.tga)",
    defaultPath,
    properties: ["openFile"],
    filters: [
      { name: "TGA image (.tga)", extensions: ["tga"] },
      { name: "All files", extensions: ["*"] },
    ],
  });
  if (canceled || !filePaths || !filePaths[0]) return null;
  return path.resolve(filePaths[0]);
});

ipcMain.handle("open-focus-tree-file", async (_event, payload = {}) => {
  if (process.platform !== "win32") {
    return { ok: false, error: "Open in Notepad is only supported on Windows." };
  }
  let absPath;
  try {
    absPath = resolveAllowedTextFilePathForExternalOpen(payload.path);
  } catch (err) {
    return { ok: false, error: err && err.message ? err.message : "Invalid file path." };
  }
  let stat;
  try {
    stat = fs.statSync(absPath);
  } catch (_err) {
    return { ok: false, error: "File not found." };
  }
  if (!stat.isFile()) return { ok: false, error: "Path is not a file." };
  const notepadExe = resolveNotepadExecutablePath();
  if (!fs.existsSync(notepadExe)) {
    return { ok: false, error: "Notepad executable not found." };
  }
  return await new Promise((resolve) => {
    let settled = false;
    const child = spawn(notepadExe, [absPath], {
      detached: true,
      stdio: "ignore",
      windowsHide: false,
    });
    let timeoutId = null;
    const onError = (err) => {
      const msg = err && err.message ? err.message : String(err);
      finish({ ok: false, error: msg });
    };
    const onSpawn = () => {
      child.unref();
      finish({ ok: true, path: absPath });
    };
    const finish = (result) => {
      if (settled) return;
      settled = true;
      if (timeoutId !== null) clearTimeout(timeoutId);
      child.removeListener("error", onError);
      child.removeListener("spawn", onSpawn);
      resolve(result);
    };
    timeoutId = setTimeout(() => {
      finish({ ok: false, error: "Timed out starting Notepad." });
    }, 12000);
    child.once("error", onError);
    child.once("spawn", onSpawn);
  });
});

ipcMain.handle("show-confirm-dialog", async (event, message) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const choice = await dialog.showMessageBox(win || undefined, {
    type: "warning",
    title: "Confirm",
    message: String(message || ""),
    buttons: ["OK", "Cancel"],
    defaultId: 0,
    cancelId: 1,
    noLink: true,
  });
  return choice.response === 0;
});

let mainWindow = null;
let splashWindow = null;
let serverHandle = null;
let isQuitting = false;
let warnedDevToolsBlocked = false;
let warnedNetBlocked = false;
let closePromptInFlight = false;
let allowWindowClose = false;

// 🌍 #closing-nova-mid-world-asks-first — A WORLD BEING GENERATED IS A CHILD PROCESS WRITING INTO THE MOD (server.js, world-run.js).
// Closing Nova stops it part-way and leaves the map half-built, so Nova asks first — from EVERY way out: the window's X, and
// File → Exit, whose role "quit" goes app.quit() → before-quit → close with isQuitting already set, past the window's own
// question (measured, Electron 41: no question was asked, and window-all-closed is not emitted on app.quit, so a stop hooked
// only there never ran). "Close anyway" stops the run (its record is written first) and then closes; "Keep Nova open" changes
// nothing. Asked through the server's own app.locals, no renderer round trip.
let worldRunQuitConfirmed = false;
let worldRunPromptInFlight = false;
function worldRunActiveNow() {
  try {
    const locals = serverHandle && serverHandle.app && serverHandle.app.locals;
    return locals && typeof locals.worldRunActive === "function" ? locals.worldRunActive() : null;
  } catch (_) { return null; }
}
function stopWorldRunNow(reason) {
  try {
    const locals = serverHandle && serverHandle.app && serverHandle.app.locals;
    if (locals && typeof locals.stopWorldRun === "function") locals.stopWorldRun(reason);
  } catch (_) { /* quitting: never let this stop the quit */ }
}
/** Resolves true when Nova may close: no run is going, or the modder chose "Close anyway" (which stops it first). */
async function askBeforeClosingDuringWorldRun(win) {
  if (worldRunQuitConfirmed) return true;
  const active = worldRunActiveNow();
  if (!active) return true;
  if (worldRunPromptInFlight) return false;
  worldRunPromptInFlight = true;
  try {
    const opts = {
      type: "warning",
      title: "Generating a world",
      message: `Nova is still generating a world for ${active.modName} (step ${active.k} of 6).`,
      detail: "Closing now stops it part-way: your mod keeps what was written so far, with its map half-built. Keep Nova open until it finishes?",
      buttons: ["Keep Nova open", "Close anyway"],
      defaultId: 0,
      cancelId: 0,
      noLink: true,
    };
    const choice = win && !win.isDestroyed() ? await dialog.showMessageBox(win, opts) : await dialog.showMessageBox(opts);
    if (!choice || choice.response !== 1) return false;
    worldRunQuitConfirmed = true;
    stopWorldRunNow("closed");
    return true;
  } catch (_) {
    return false;   // the question could not be asked: keep Nova open rather than cut a world in half
  } finally {
    worldRunPromptInFlight = false;
  }
}

ipcMain.handle("force-repaint", () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.invalidate();
  }
});

function tryRealpath(p) {
  try {
    return fs.realpathSync.native(path.resolve(p));
  } catch (_e) {
    return path.resolve(p);
  }
}

function isPathUnderRoot(filePath, rootPath) {
  if (!filePath || !rootPath) return false;
  const f = path.normalize(path.resolve(filePath)).toLowerCase();
  const r = path.normalize(path.resolve(rootPath)).toLowerCase();
  if (f.includes(".asar")) return true;
  return f === r || f.startsWith(r.endsWith(path.sep) ? r : r + path.sep);
}

function resolveAllowedTextFilePathForExternalOpen(rawPath) {
  const trimmed = typeof rawPath === "string" ? rawPath.trim() : "";
  if (!trimmed) throw new Error("No file path provided.");
  const absPath = tryRealpath(trimmed);
  if (path.extname(absPath).toLowerCase() !== ".txt") {
    throw new Error("Only .txt files can be opened externally.");
  }
  // #two-documents-folders — plus every folder the launcher's .mod files name: a mod may live outside the mods folder.
  let registered = [];
  try { registered = [...constants.registeredModDirs(), ...constants.otherModsFolders()]; } catch (_) { registered = []; }
  const allowedRoots = [constants.ROOT, constants.MODS_ROOT, ...registered, constants.resolveHoi4GameRoot(), constants.WORKSHOP_ROOT]
    .filter(Boolean)
    .map((p) => path.resolve(p));
  if (!allowedRoots.some((root) => isPathUnderRoot(absPath, root))) {
    throw new Error("Path must be under workspace, mods, workshop, or game folders.");
  }
  return absPath;
}

function resolveNotepadExecutablePath() {
  const windir = process.env.WINDIR || "C:\\Windows";
  return path.join(windir, "System32", "notepad.exe");
}

/** Same asset as `build.icon` in package.json (window + packaged .exe branding). */
function resolveAppIconPath() {
  const png = path.join(__dirname, "build", "icon.png");
  try {
    if (fs.existsSync(png)) return png;
  } catch (_e) {
    /* ignore */
  }
  return undefined;
}

function createSplashWindow() {
  return new Promise((resolve) => {
    const iconPath = resolveAppIconPath();
    splashWindow = new BrowserWindow({
      width: 500,
      height: 380,
      frame: false,
      show: false,
      alwaysOnTop: true,
      resizable: false,
      center: true,
      ...(iconPath ? { icon: iconPath } : {}),
      webPreferences: {
        preload: path.join(__dirname, "splash-preload.js"),
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
      },
    });

    splashWindow.loadFile(path.join(__dirname, "public", "splash.html")).catch(() => {});

    splashWindow.once("ready-to-show", () => {
      if (splashWindow) {
        splashWindow.show();
      }
      resolve();
    });

    // Fallback to avoid hanging startup if splash html fails to load
    splashWindow.webContents.once("did-fail-load", () => {
      resolve();
    });
  });
}

function closeSplashWindow() {
  if (splashWindow) {
    if (!splashWindow.isDestroyed()) {
      splashWindow.close();
    }
    splashWindow = null;
  }
}

function envFlagEnabled(name) {
  const raw = String(process.env[name] || "").trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

function isDevToolsAllowedForSession() {
  // Devtools allowed in unpackaged local development, or explicitly enabled.
  return !app.isPackaged || envFlagEnabled("FOCUS_EDITOR_ALLOW_DEVTOOLS");
}

function isAllowedAppUrl(rawUrl, appOrigin, allowDevTools = false) {
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch (_e) {
    return false;
  }
  if (parsed.origin === appOrigin) return true;
  if (allowDevTools && parsed.protocol === "devtools:") return true;
  if (parsed.origin === "https://raw.githubusercontent.com") return true;
  if (parsed.protocol === "file:") {
    const { fileURLToPath } = require("url");
    try {
      const filePath = fileURLToPath(rawUrl);
      return isPathUnderRoot(filePath, __dirname);
    } catch (_e) {
      return false;
    }
  }
  // Keep renderer functional for internal browser primitives only.
  if (parsed.protocol === "data:" || parsed.protocol === "blob:") return true;
  if (rawUrl === "about:blank") return true;
  return false;
}

function maybeWarnBlockedNetworkOnce() {
  if (warnedNetBlocked) return;
  warnedNetBlocked = true;
  dialog.showMessageBox(mainWindow || undefined, {
    type: "warning",
    title: "External Access Blocked",
    message: HARDENED_NET_BLOCK_MESSAGE,
  });
}

function buildAppMenu(allowDevTools) {
  const viewSubmenu = [{ role: "reload", label: "Reload" }, { type: "separator" }, { role: "togglefullscreen", label: "Toggle Full Screen" }];
  if (allowDevTools) {
    viewSubmenu.push({ role: "toggledevtools", label: "Developer Tools" });
  }
  return Menu.buildFromTemplate([
    {
      label: "File",
      submenu: [{ role: "quit", label: "Exit" }],
    },
    {
      label: "View",
      submenu: viewSubmenu,
    },
  ]);
}

// Drive the heavy cache warm-up while the splash is up, pushing real progress to its bar, BEFORE
// loading home.html so every tab is warm afterwards.
//
// CRUCIAL: the warm runs in a SEPARATE PROCESS (warm-child.js), not on the Electron main thread.
// Some warm steps are unavoidably synchronous for big mods — parsing a single giant merged .gfx
// sprite file, or definition.csv with ~13k provinces — and a multi-second synchronous parse on the
// main thread makes Windows freeze/ghost the loading window ("Not Responding"). Running it
// off-thread means the splash stays fully responsive no matter how slow or huge the data is.
// The child builds the on-disk caches; the main process then loads them when a tab needs them.
async function runWarmupWithProgress() {
  return new Promise((resolve) => {
    const send = (data) => {
      if (splashWindow && !splashWindow.isDestroyed()) {
        try { splashWindow.webContents.send("warm-progress", data); } catch (_e) { /* ignore */ }
      }
    };
    let child = null;
    try {
      // ELECTRON_RUN_AS_NODE makes the (packaged) Electron binary run warm-child.js as plain Node.
      child = fork(path.join(__dirname, "warm-child.js"), [], {
        env: Object.assign({}, process.env, { ELECTRON_RUN_AS_NODE: "1" }),
        stdio: "ignore",
        windowsHide: true,
      });
    } catch (_e) { resolve(); return; } // best-effort: if the child won't spawn, just open the app
    let done = false;
    let timer = null;
    const finish = () => {
      if (done) return;
      done = true;
      if (timer) clearTimeout(timer);
      try { child.kill(); } catch (_e) {}
      resolve();
    };
    // Generous safety net. Because the warm is off-thread, the window is responsive the whole time;
    // this only guards against a child that never exits.
    timer = setTimeout(() => { send({ pct: 100, label: "Finishing up…" }); finish(); }, 300000);
    child.on("message", (m) => {
      if (!m) return;
      if (m.t === "p") send({ pct: m.pct, label: m.label });
      else if (m.t === "done") finish();
    });
    child.on("error", finish);
    child.on("exit", finish);
  });
}

// Mirror the renderer's selected mod to the server so the NEXT launch warms it up front.
async function captureActiveModForNextLaunch() {
  try {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    const locals = serverHandle && serverHandle.app && serverHandle.app.locals;
    if (!locals || typeof locals.persistActiveMod !== "function") return;
    const lastMod = await mainWindow.webContents.executeJavaScript(
      "(window.localStorage && localStorage.getItem('activeModPath')) || ''",
      true,
    );
    if (lastMod) locals.persistActiveMod(lastMod);
  } catch (_e) { /* best-effort */ }
}

// ⛔ #a-sandboxed-launch-keeps-its-port — WHICH PORT THE APP'S OWN SERVER TAKES, AND WHO MAY NAME ANOTHER.
//
// Unset, nothing changes: Nova's own port (constants.DEFAULT_PORT, 47821), and any free one when that is taken.
//
// NOVA_PORT names another, for a launch that must stay off the owner's own Nova and its port: the Electron e2e files
// (e2e-workflow-test.js, e2e-research-test.js), and any other sandboxed boot of the app, a packaged exe's included, each on a
// port of its own. Until 2026-11-15 this file passed 47821 explicitly, and in startServer an explicit port beats PORT, so nothing
// could move it: every Electron e2e took the owner's port whenever it was free, and some other one when it was not. Honoured
// alike in development and in a packaged build.
//   - It must be a whole number from 1024 to 65535. Anything else, set but empty included, stops the launch and says so: never
//     quietly replaced by 47821, the very port a run that sets it exists to stay off.
//   - A port asked for is a port kept. Busy (or refused by Windows), the launch FAILS and says which, rather than fall back to
//     another: whoever set NOVA_PORT connects to that number, and server.js records what a quiet swap once cost
//     (#a-port-somebody-asked-for-is-a-promise).
//   - Either refusal is written to stderr and ends the process with exit code 1, and opens no dialog: NOVA_PORT is set by a
//     harness, and a box nobody is there to close would hold it until its own timeout.
//   - Only those two. Any other failure (the app could not be built, the window could not load) takes the usual way out, the
//     box, exactly as it does without NOVA_PORT: the variable decides the port and nothing else.
// The single-instance lock below does not get in the way: Electron keys it on the user-data folder (measured, Electron 41.2.1,
// 2026-11-13: a launch with a --user-data-dir of its own took its own lock while another launch held one, and a second launch
// on the same folder was refused and handed over), so a harness with its own profile can neither hand off to nor swallow an
// open Nova of the owner's. test-a-sandboxed-launch-keeps-its-port.js runs this file against stubs and holds it to all of this.
/** null when NOVA_PORT is unset; { port } when it names a port; { refused: why } when it is set to anything else. */
function serverPortAsked(env) {
  const raw = env.NOVA_PORT;
  if (raw === undefined) return null;
  const text = String(raw).trim();
  const port = /^\d{1,5}$/.test(text) ? Number(text) : NaN;
  if (port >= 1024 && port <= 65535) return { port };
  return {
    refused: `NOVA_PORT is set to ${JSON.stringify(String(raw))}, which is not a port Nova can use. Give it a whole number `
      + `from 1024 to 65535, or unset it to let Nova take its own port (${constants.DEFAULT_PORT}).`,
  };
}
function portRefusal(message) {
  const e = new Error(message);
  e.novaPortRefused = true;
  return e;
}
/** The port itself could not be had: busy, or refused by Windows (a port in an excluded range answers EACCES). Any other way
 *  startServer can fail is not about the port, and is not reported as if it were. */
function couldNotListen(err) {
  return !!err && (err.syscall === "listen" || ["EADDRINUSE", "EACCES", "EADDRNOTAVAIL"].includes(err.code));
}
/** Where a harness that set NOVA_PORT reads, then out with exit code 1: no window is left, and no box waits for a click. */
function refuseLaunch(message) {
  try { console.error("Nova could not start: " + message); } catch (_) { /* no stderr to write to: the exit code still says it */ }
  app.exit(1);
}

async function createMainWindow() {
  const allowDevTools = isDevToolsAllowedForSession();
  if (process.platform === "win32") {
    try {
      app.setAppUserModelId("com.novamoddingsuite.app");
    } catch (_e) {
      /* ignore */
    }
  }
  // ⛔ #a-sandboxed-launch-keeps-its-port — NOVA_PORT's port, kept or refused (serverPortAsked, above); unset, as it always was
  const asked = serverPortAsked(process.env);
  if (asked && asked.refused) throw portRefusal(asked.refused);
  try {
    serverHandle = asked
      ? await startServer({ port: asked.port, allowPortFallback: false, deferWarm: true })
      : await startServer({
        port: constants.DEFAULT_PORT,
        allowPortFallback: true,
        deferWarm: true, // the loading screen drives warmCaches itself (with a progress bar) below
      });
  } catch (err) {
    if (!asked || !couldNotListen(err)) throw err;
    throw portRefusal(`NOVA_PORT asks for port ${asked.port}, and Nova could not listen there (${err.code || err.syscall}). `
      + `It does not move to another port when one is asked for: whatever set NOVA_PORT will connect to ${asked.port}. `
      + `Free that port, choose another, or unset NOVA_PORT.` + (err && err.message ? `\n  ${err.message}` : ""));
  }
  if (asked) serverHandle.portAskedFor = asked.port;



  const appUrl = `http://127.0.0.1:${serverHandle.port}`;
  const appOrigin = new URL(appUrl).origin;

  const iconPath = resolveAppIconPath();
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1100,
    minHeight: 700,
    title: "Nova Modding Suite",
    autoHideMenuBar: false,
    show: false,
    ...(iconPath ? { icon: iconPath } : {}),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      devTools: allowDevTools,
      backgroundThrottling: false,
    },
  });

  const ses = mainWindow.webContents.session;
  ses.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
  ses.setPermissionCheckHandler(() => false);
  ses.webRequest.onBeforeRequest((details, callback) => {
    const ok = isAllowedAppUrl(details.url, appOrigin, allowDevTools);
    if (!ok) maybeWarnBlockedNetworkOnce();
    callback({ cancel: !ok });
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    const ok = isAllowedAppUrl(url, appOrigin, allowDevTools);
    if (!ok) {
      if (url.startsWith("https://")) {
        const { shell } = require("electron");
        shell.openExternal(url).catch(() => {});
      } else {
        maybeWarnBlockedNetworkOnce();
      }
    }
    return { action: "deny" };
  });
  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (!isAllowedAppUrl(url, appOrigin, allowDevTools)) {
      event.preventDefault();
      maybeWarnBlockedNetworkOnce();
    }
  });

  mainWindow.setMenu(buildAppMenu(allowDevTools));
  mainWindow.setMenuBarVisibility(true);
  mainWindow.setAutoHideMenuBar(false);
  mainWindow.webContents.on("before-input-event", (event, input) => {
    const key = String(input.key || "").toLowerCase();
    const win = mainWindow && !mainWindow.isDestroyed() ? mainWindow : null;
    if (key === "escape" && win && win.isFullScreen()) {
      event.preventDefault();
      win.setFullScreen(false);
      return;
    }
    if (key === "alt" && !input.control && !input.shift && !input.meta) {
      // Keep the menu bar always visible and avoid Alt-only focus toggling.
      event.preventDefault();
      return;
    }
    const ctrlOrCmd = Boolean(input.control || input.meta);
    const isDevToolsShortcut =
      key === "f12" || (ctrlOrCmd && input.shift && (key === "i" || key === "j"));
    const isFullscreenShortcut = key === "f11" || (input.alt && key === "enter");
    if (isFullscreenShortcut) {
      event.preventDefault();
      if (win) {
        win.setFullScreen(!win.isFullScreen());
      }
      return;
    }
    if (!allowDevTools && isDevToolsShortcut) {
      event.preventDefault();
      if (!warnedDevToolsBlocked) {
        warnedDevToolsBlocked = true;
        dialog.showMessageBox(mainWindow || undefined, {
          type: "info",
          title: "Developer Tools Disabled",
          message: DEVTOOLS_BLOCKED_MESSAGE,
        });
      }
    }
  });
  if (!allowDevTools) {
    mainWindow.webContents.on("devtools-opened", () => {
      mainWindow.webContents.closeDevTools();
      if (!warnedDevToolsBlocked) {
        warnedDevToolsBlocked = true;
        dialog.showMessageBox(mainWindow || undefined, {
          type: "info",
          title: "Developer Tools Disabled",
          message: DEVTOOLS_BLOCKED_MESSAGE,
        });
      }
    });
  }
  mainWindow.once("ready-to-show", () => {
    if (mainWindow) mainWindow.show();
    closeSplashWindow(); // main window is up — dismiss the splash if it's still showing
  });

  // Warm all heavy caches (localization, sprite/icon atlas, techs, equipment, ideas) while the
  // splash shows a real progress bar — then load the UI, so the first visit to any tab is instant.
  await runWarmupWithProgress();

  await mainWindow.loadURL(appUrl + "/home.html");

  // Persist the renderer's last-used mod for the next launch's startup warm.
  captureActiveModForNextLaunch();

  mainWindow.on("close", async (event) => {
    // Best-effort: record the current mod (may have changed mid-session) for the next launch's warm.
    captureActiveModForNextLaunch();
    // 🌍 #closing-nova-mid-world-asks-first — BEFORE the early return below, which every quit path (isQuitting) takes
    if (!worldRunQuitConfirmed && worldRunActiveNow()) {
      event.preventDefault();
      const mayClose = await askBeforeClosingDuringWorldRun(mainWindow);
      if (mayClose && mainWindow && !mainWindow.isDestroyed()) mainWindow.close();
      return;
    }
    if (isQuitting || allowWindowClose || closePromptInFlight) return;
    event.preventDefault();
    closePromptInFlight = true;
    try {
      const hasUnsavedChanges = await mainWindow.webContents.executeJavaScript(
        "Boolean(window.__focusEditorHasUnsavedChanges && window.__focusEditorHasUnsavedChanges())",
        true,
      );
      if (!hasUnsavedChanges) {
        allowWindowClose = true;
        mainWindow.close();
        return;
      }
      const choice = await dialog.showMessageBox(mainWindow, {
        type: "warning",
        title: "Unsaved Changes",
        message: "You have unsaved changes.",
        detail: "Do you want to save before exiting?",
        buttons: ["Save", "Don't Save", "Cancel"],
        defaultId: 0,
        cancelId: 2,
        noLink: true,
      });
      if (choice.response === 2) return;
      if (choice.response === 0) {
        const saveSucceeded = await mainWindow.webContents.executeJavaScript(
          "window.__focusEditorSaveBeforeExit ? window.__focusEditorSaveBeforeExit() : Promise.resolve(false)",
          true,
        );
        if (!saveSucceeded) {
          await dialog.showMessageBox(mainWindow, {
            type: "error",
            title: "Save Failed",
            message: "The file could not be saved.",
            detail: "Fix any validation or save errors and try exiting again.",
          });
          return;
        }
      }
      allowWindowClose = true;
      mainWindow.close();
    } catch (_err) {
      // If close prompt plumbing fails, keep the window open to avoid data loss.
    } finally {
      closePromptInFlight = false;
    }
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
    allowWindowClose = false;
    closePromptInFlight = false;
  });
}

async function shutdownServer() {
  if (!serverHandle) return;
  stopWorldRunNow("closed");   // idempotent: a run already stopped (or none) is left alone
  const handle = serverHandle;
  serverHandle = null;
  try {
    await handle.close();
  } catch (_err) {
    // Ignore shutdown errors during app quit.
  }
}

// Single-instance guard. Nova is an Electron app, so ONE running copy is already several OS processes
// (main + renderers + GPU + a startup warm-child) — that's normal, not multiple windows. But without
// this lock, launching the exe again opened a whole SECOND copy (wasting RAM/CPU and locking the same
// files — e.g. blocking a rebuild of the exe). Now a second launch just focuses the window already open.
const novaGotSingleInstanceLock = app.requestSingleInstanceLock();
if (!novaGotSingleInstanceLock) {
  app.quit();
}
app.on("second-instance", () => {
  const w = BrowserWindow.getAllWindows().find((x) => !x.isDestroyed());
  if (w) { try { if (w.isMinimized()) w.restore(); w.show(); w.focus(); } catch (_) {} }
});

// The last thing a user ever sees when a launch fails, which makes it worth more than one line. Two things
// were wrong with the old version. It said "Failed to start Focus Editor" — the former name of a single
// PAGE, and one that was itself renamed to "Focus Tree" during the reorg — rather than the name of the
// product. And it printed the raw Chromium failure, so a modder was handed "ERR_FAILED (-2)" with nothing
// they could act on. A real report of exactly that arrived on 2026-08-29.
//
// Users here are modders, not programmers. An error screen that does not say what to do next is barely
// better than a crash.
function describeStartupFailure(err) {
  const raw = err && err.message ? String(err.message) : String(err);
  const port = serverHandle && serverHandle.port;
  const lines = [];

  if (/ERR_(FAILED|CONNECTION_REFUSED|CONNECTION_RESET|EMPTY_RESPONSE|ABORTED)/.test(raw)) {
    lines.push("Nova started its background service, but the main window could not load from it.");
    lines.push("");
    lines.push("The usual cause is another copy of Nova still running — often one closed while it was");
    lines.push("still busy, which can leave its background service behind.");
    lines.push("");
    lines.push("What to try, in order:");
    lines.push("  1. Close every Nova window, wait a few seconds, then launch again.");
    lines.push("  2. If it still fails, sign out and back in (or restart) to clear the stuck service.");
    // #a-sandboxed-launch-keeps-its-port — a port NOVA_PORT asked for is kept or refused, never swapped: it is no fallback
    if (port && port !== constants.DEFAULT_PORT && !(serverHandle && serverHandle.portAskedFor)) {
      lines.push("");
      lines.push(`Nova fell back to port ${port} because its usual port ${constants.DEFAULT_PORT} was already`);
      lines.push("in use, which fits that explanation.");
    }
  } else {
    lines.push("Nova could not finish starting up.");
    lines.push("");
    lines.push("Close every Nova window and launch again. If it keeps happening, the detail below is what");
    lines.push("to include in a bug report.");
  }

  lines.push("");
  lines.push("Technical detail — please include this in a bug report:");
  lines.push("  " + raw);
  return lines.join("\n");
}

app.whenReady().then(async () => {
  if (!novaGotSingleInstanceLock) { app.quit(); return; }
  // #a-sandboxed-launch-keeps-its-port — a NOVA_PORT that names no port is refused before any window opens
  const asked = serverPortAsked(process.env);
  if (asked && asked.refused) { refuseLaunch(asked.refused); return; }
  try {
    await createSplashWindow();
    await createMainWindow();
  } catch (err) {
    // …and one whose port cannot be had stops here, said where whatever set it reads: no box, nobody is there to close one
    if (err && err.novaPortRefused) { refuseLaunch(err.message); return; }
    closeSplashWindow();
    dialog.showErrorBox("Nova could not start", describeStartupFailure(err));
    await shutdownServer();
    app.quit();
  }
});

app.on("activate", async () => {
  if (BrowserWindow.getAllWindows().length === 0 && !isQuitting) {
    await createMainWindow();
  }
});

app.on("before-quit", (event) => {
  // 🌍 #closing-nova-mid-world-asks-first — File → Exit (role "quit") arrives here first; ask before anything starts closing
  if (!worldRunQuitConfirmed && worldRunActiveNow()) {
    event.preventDefault();
    askBeforeClosingDuringWorldRun(mainWindow).then((mayClose) => { if (mayClose) app.quit(); });
    return;   // isQuitting stays false: "Keep Nova open" leaves everything as it was
  }
  isQuitting = true;
});

// …and the last word on the way out, whichever way that was: a run still going is stopped, its record written first
app.on("will-quit", () => { stopWorldRunNow("closed"); });

app.on("window-all-closed", async () => {
  await shutdownServer();
  if (process.platform !== "darwin") {
    app.quit();
  }
});
