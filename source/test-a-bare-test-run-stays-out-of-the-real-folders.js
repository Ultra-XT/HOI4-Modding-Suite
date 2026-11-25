// ⛔ #a-bare-test-run-writes-into-the-real-app-data — ONE TEST RUN BARE MUST NOT WRITE INTO THE OWNER'S REAL FOLDERS.
//
// run-tests.js hands every file it runs a private APPDATA, XDG_CONFIG_HOME, NOVA_APP_DATA_DIR, NOVA_HOME_DIR, HOI4_USER_DIR
// and NOVA_DOCUMENTS_DIR (and run-e2e.js adds HOI4_MODS_ROOT). Agents and scripts run ONE file bare all the time —
// `node test-foo.js` — and then nothing sandboxed it. Measured 2026-09-29/30 on the owner's machine: 60 backups of one temp
// fixture in the REAL AppData\Roaming\NovaModdingSuite\backups, and hundreds of fixture snapshots in the real ~/.nova (1.5 GB).
//
// The fix is a guard at the top of safe-write.js, the first module those paths go through: when the process's main is a
// test-*.js / e2e-*.js / testlib-*.js file, every one of those variables that is not already a temp folder is pointed at a
// fresh mkdtemp sandbox before any path is worked out, and children inherit it. The files that only SPAWN a server load
// safe-write.js first themselves. This pins, by running it rather than by reading it:
//
//   A. the guard sandboxes exactly what each runner sandboxes, laid out the same way (derived from the runners' own env);
//   B. it cannot engage in the shipped app — not under main.js or any shipped module, not under Electron, not in app.asar;
//   C. a probe named like a test, run bare on a fake machine whose home, AppData, OneDrive and Documents all live in this
//      test's scratch folder, writes a backup, a ~/.nova baseline and the HOI4-folder diagnostics report — all into the
//      sandbox, none into the fake machine — and the sandbox is gone after it exits;
//   C. …and that the sandbox is released AFTER every exit handler, one added in the same tick as process.exit() included;
//   D. a test's own temp choices are kept — the temp folder itself among them, however the disk spells it — and the rest
//      filled in; E. under a runner's env nothing changes at all;
//   F. a sandbox that may hold the only copy of something real is kept, never deleted (CLAUDE.md's fourth rule): a backup
//      of a file OUTSIDE temp, a write into a mod outside temp, and the folders Restore moves OUT of such a mod into the
//      sandbox's ~/.nova — in the test's own process or in a child it started, which is where a server does its writing;
//      a child of the run that left a variable out fills it in the run's sandbox and makes none, and a store is noted in the
//      sandbox that holds it, whatever the child was told and whatever temp folder it was handed (#a-child-made-a-second-sandbox);
//      and the release takes away only the folder the guard made, and notes nothing in a folder that is not one (its mark);
//   G. a real test file, run bare on the fake machine, passes exactly as it does under the runner and writes nothing there;
//   H. every test (and test helper) that starts a node child loads safe-write.js before it does — at the top of the file,
//      not in a function or behind a condition — and hands the child an env made from its own (derived from the source);
//   I. a live-app test run bare starts a server of its own in its sandbox, on a port below the range the suite and Windows
//      use, and never dials the app's own port — the owner's open Nova (derived: the runner's own detector picks the
//      files, server.js names the port); what that server copies of a mod outside temp keeps the sandbox; it is started
//      as the app starts its own, with no warm in the process that answers; and every browser test among them opens the
//      page through the one helper that waits for it to be ready — nothing of the page's still out — not for a delay;
//   J. every test that drives Electron hands it a profile of its own (--user-data-dir), not the owner's;
//   K. a process that is NOT a test but keeps ANY of its folders in temp, or a relative one — an agent's harness, a world build, `node server.js` it
//      starts — has what it left unset (HOI4_USER_DIR, NOVA_DOCUMENTS_DIR, NOVA_HOME_DIR) filled in from the same layout, and
//      keeps what it set, inside temp or not: by the plan, and by running run.js's shape on the fake machine, in-process and
//      through a `node server.js` it starts, where GET /api/diag/hoi4 rewrote the owner's real report (2026-10-23). A relative
//      value is no choice and is filled, and a user folder it named in temp is made (server.js names no mods folder for one
//      that is not there); the app-data variable Nova reads on the system goes with the rest; a server handed a temp folder of
//      its own is judged by the user's own temp folder too; a mod a script made in the sandbox keeps it; `node -e` is "node";
//      and a killed server's line does not promise a removal it cannot make. A child told of its run's sandbox fills what it left
//      unset, whatever it kept. Where its own temp folder cannot tell (a drive's top, or above the home or the system's app data)
//      a script stands down and a real launch stays real, and a sandbox made there judges nothing at exit: it stays.
//
// ⚠️ Nothing here touches the owner's real folders: every child that loads Nova first checks that its home, USERPROFILE,
// OneDrive, APPDATA, game folder and temp folder are all inside this test's own mkdtemp folder, and refuses otherwise. The
// one child that dials a port (section I) runs behind a fence that refuses the app's own port before a byte is sent.
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const vm = require("vm");
const crypto = require("crypto");
const { spawnSync } = require("child_process");
const { maskJsComments, maskJsLiterals, stripJsComments, jsBodyAt } = require("./testlib-strip-comments.js");
const sw = require("./safe-write.js");
const liveLib = require("./testlib-live-server.js");

let pass = 0, fail = 0;
const ok = (c, m, x) => {
  if (c) { pass++; console.log("  ok   " + m); }
  else { fail++; console.log("  FAIL " + m + (x !== undefined ? "   -> " + JSON.stringify(x).slice(0, 600) : "")); }
};
const inside = (p, dir) => {
  if (!p || !dir) return false;
  const r = path.relative(path.resolve(dir), path.resolve(p));
  return !!r && !r.startsWith("..") && !path.isAbsolute(r);
};
const same = (a, b) => !!a && !!b && path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();
const walk = (d, out = []) => {
  let es = [];
  try { es = fs.readdirSync(d, { withFileTypes: true }); } catch (_) { return out; }
  for (const e of es) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p, out); else out.push(p); }
  return out;
};
/** Every file under d, as relative path -> size + mtime + content hash: two equal snapshots mean nothing was written. */
const snapshot = (d) => {
  const m = new Map();
  for (const p of walk(d)) {
    let st = null, h = "";
    try { st = fs.statSync(p); h = crypto.createHash("sha1").update(fs.readFileSync(p)).digest("hex"); } catch (_) { /* gone */ }
    m.set(path.relative(d, p), st ? `${st.size}:${st.mtimeMs}:${h}` : "?");
  }
  return m;
};
const diff = (a, b) => ({
  added: [...b.keys()].filter((k) => !a.has(k)),
  removed: [...a.keys()].filter((k) => !b.has(k)),
  changed: [...a.keys()].filter((k) => b.has(k) && a.get(k) !== b.get(k)),
});
const clean = (d) => !d.added.length && !d.removed.length && !d.changed.length;

const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, "package.json"), "utf8"));
const ROOT_JS = new Set(fs.readdirSync(__dirname).filter((f) => /\.js$/.test(f)));
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const srcOf = (f) => { try { return fs.readFileSync(path.join(__dirname, f), "utf8"); } catch (_) { return ""; } };
const codeOf = (f) => stripJsComments(srcOf(f));

// ── the require graph, read out of the source ────────────────────────────────────────────────────────────────────────
/** Root modules a source requires, with where: a literal "./x", path.join(__dirname, "x"), or a const holding the latter. */
function directRequires(code) {
  const out = [];
  const norm = (n) => { const b = String(n).replace(/^\.\//, ""); const j = /\.js$/.test(b) ? b : b + ".js"; return ROOT_JS.has(j) ? j : ""; };
  for (const m of code.matchAll(/require\(\s*["'`](\.\/[^"'`]+)["'`]\s*\)/g)) { const n = norm(m[1]); if (n) out.push({ name: n, at: m.index }); }
  for (const m of code.matchAll(/require\(\s*(?:path|require\(["']path["']\))\.(?:join|resolve)\(\s*__dirname\s*,\s*["'`]([^"'`]+)["'`]\s*\)\s*\)/g)) {
    const n = norm(m[1]); if (n) out.push({ name: n, at: m.index });
  }
  for (const m of code.matchAll(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*path\.(?:join|resolve)\(\s*__dirname\s*,\s*["'`]([^"'`]+)["'`]\s*\)/g)) {
    const n = norm(m[2]);
    if (!n) continue;
    const re = new RegExp("require\\(\\s*" + esc(m[1]) + "\\s*\\)", "g");
    for (const r of code.matchAll(re)) out.push({ name: n, at: r.index });
  }
  return out;
}
const _reach = new Map();
function reaches(file, seen = new Set()) {
  if (_reach.has(file)) return _reach.get(file);
  if (seen.has(file)) return new Set();
  seen.add(file);
  const out = new Set();
  for (const d of directRequires(codeOf(file))) { out.add(d.name); for (const x of reaches(d.name, seen)) out.add(x); }
  _reach.set(file, out);
  return out;
}
const loadsSafeWrite = (name) => name === "safe-write.js" || reaches(name).has("safe-write.js");

// ── the fake machine ─────────────────────────────────────────────────────────────────────────────────────────────────
// The child's temp folder is NOT an ancestor of its home: the guard keeps a folder inside temp as "already a sandbox", so a
// home inside the child's temp would look sandboxed and prove nothing. Both live in this test's own mkdtemp folder.
const SCRATCH = fs.mkdtempSync(path.join(os.tmpdir(), "nova-bare-proof-"));
const FAKE_HOME = path.join(SCRATCH, "home");
const CHILD_TMP = path.join(SCRATCH, "tmp");
const OUTSIDE = path.join(SCRATCH, "elsewhere");         // neither home nor temp: a folder a real mod could live in
const DECOY_GAME = path.join(SCRATCH, "game");
const PROBES = path.join(SCRATCH, "probes");
const FAKE_APPDATA = path.join(FAKE_HOME, "AppData", "Roaming");
const FAKE_DOCS = path.join(FAKE_HOME, "Documents");
const FAKE_USER = path.join(FAKE_DOCS, "Paradox Interactive", "Hearts of Iron IV");
const APP_DIR_NAME = path.basename(sw.NOVA_APP_DATA_DIR);                     // derived: the folder safe-write.js names
const BACKUPS_NAME = path.basename(sw.BACKUP_DIR);
for (const d of [CHILD_TMP, OUTSIDE, PROBES, path.join(FAKE_USER, "mod"), path.join(FAKE_USER, "logs"),
  path.join(FAKE_APPDATA, APP_DIR_NAME, BACKUPS_NAME), path.join(FAKE_HOME, ".nova", "map_baselines"), path.join(FAKE_HOME, "OneDrive"), DECOY_GAME]) {
  fs.mkdirSync(d, { recursive: true });
}
// The shape of a real machine: a user folder with logs, a real backup, a real baseline store — things a leak would sit beside.
fs.writeFileSync(path.join(FAKE_USER, "logs", "error.log"), "[fake] the owner's own log\n");
fs.writeFileSync(path.join(FAKE_APPDATA, APP_DIR_NAME, BACKUPS_NAME, "2026-09-01T00-00-00-000Z__save__mymod__common__x.txt"), "a real backup\n");
fs.writeFileSync(path.join(FAKE_HOME, ".nova", "map_baselines", "keep.txt"), "a real baseline\n");
fs.writeFileSync(path.join(DECOY_GAME, "hoi4.exe"), "");
// …with one localisation file: a server that warms its own caches leaves the game's names on disk at once (section I asks which does).
fs.mkdirSync(path.join(DECOY_GAME, "localisation", "english"), { recursive: true });
fs.writeFileSync(path.join(DECOY_GAME, "localisation", "english", "decoy_l_english.yml"), String.fromCharCode(0xfeff) + "l_english:\n DECOY_KEY:0 \"Decoy\"\n");

// DERIVED from safe-write.js: every variable the guard sets (both layouts) and the one naming the sandbox to the run; plus the
// mods-root override server.js also reads and the two ports a runner hands out. The live-app port's name is ASSEMBLED, not
// spelled: written out, it makes the runners' own detectors take this file for a live-app test.
const LIVE_PORT_VAR = "NOVA_" + "PORT";
const RUNNER_SPECIFIC = [...new Set([...Object.keys(sw.BARE_E2E_ENV), sw.BARE_SANDBOX_VAR, "HOI4_MOD_ROOT", "PORT", LIVE_PORT_VAR])]
  .filter(Boolean);
/** The env a person's shell has on the fake machine: no runner variables, everything home-ish pointing into FAKE_HOME. */
function bareEnv(extra = {}) {
  const env = Object.assign({}, process.env);
  for (const k of Object.keys(env)) if (RUNNER_SPECIFIC.includes(k.toUpperCase())) delete env[k];
  return Object.assign(env, {
    USERPROFILE: FAKE_HOME, HOME: FAKE_HOME, OneDrive: path.join(FAKE_HOME, "OneDrive"),
    APPDATA: FAKE_APPDATA,                // the machine's own AppData, set by Windows in every shell
    NOVA_DOCUMENTS_DIR: FAKE_DOCS,        // "where Windows keeps Documents" — a real answer, outside temp
    TEMP: CHILD_TMP, TMP: CHILD_TMP, TMPDIR: CHILD_TMP,
    HOI4_ROOT: DECOY_GAME,
  }, extra);
}
/** …and what run-tests.js adds on top: every variable in a private folder inside temp. */
function runnerEnv(sb) {
  fs.mkdirSync(path.join(sb, "hoi4-user"), { recursive: true });
  return bareEnv({ APPDATA: sb, XDG_CONFIG_HOME: sb, NOVA_APP_DATA_DIR: sb, NOVA_HOME_DIR: sb,
    HOI4_USER_DIR: path.join(sb, "hoi4-user"), NOVA_DOCUMENTS_DIR: path.join(sb, "Documents") });
}
const KEYS = [...new Set([...Object.keys(sw.BARE_E2E_ENV), ...Object.keys(sw.BARE_TEST_ENV)])];
// DERIVED: the mark the guard leaves in every sandbox it makes (#a-child-made-a-second-sandbox) — "" on code that leaves none
const MARK = typeof sw.BARE_MARK_FILE === "string" ? sw.BARE_MARK_FILE : "";

/** A probe NAMED LIKE A TEST (the name is what the guard reads), fenced so it never loads Nova outside SCRATCH. */
function writeProbe(name, o) {
  const file = path.join(PROBES, name);
  const report = path.join(SCRATCH, name + ".report.json");
  try { fs.unlinkSync(report); } catch (_) {}
  try { fs.unlinkSync(report + ".late"); } catch (_) {}
  try { fs.unlinkSync(report + ".worker"); } catch (_) {}
  const O = Object.assign({ fence: SCRATCH, report, keys: KEYS, sw: path.join(__dirname, "safe-write.js"),
    md: path.join(__dirname, "map-data.js"), server: path.join(__dirname, "server.js"),
    live: path.join(__dirname, "testlib-live-server.js"), mode: "light", modParent: "", game: DECOY_GAME }, o);
  fs.writeFileSync(file, [
    '"use strict";',
    'const fs = require("fs"), os = require("os"), path = require("path");',
    "const O = " + JSON.stringify(O) + ";",
    // as the disk spells them: one probe below is handed its temp folder in 8.3 form, which is still inside the fence
    "const real = (p) => { try { return fs.realpathSync.native(p); } catch (_) { return path.resolve(p); } };",
    "const within = (p) => !!p && real(p).toLowerCase().startsWith(real(O.fence).toLowerCase() + path.sep);",
    // (a child with no APPDATA keeps its app data under its home folder, which is fenced)
    "const fenced = [os.homedir(), process.env.USERPROFILE, process.env.OneDrive, process.env.APPDATA || os.homedir(), process.env.HOI4_ROOT, os.tmpdir()];",
    "if (!fenced.every(within)) { fs.writeFileSync(O.report, JSON.stringify({ interlock: fenced })); process.exit(0); }",
    // a log in the user folder it was given, so its report has something to report: with nothing, no copy is written (#nothing-to-report-keeps-the-last-report)
    "const seedLog = () => { const u = process.env.HOI4_USER_DIR; if (u && within(u)) { const l = path.join(u, \"logs\"); fs.mkdirSync(l, { recursive: true });",
    "  fs.writeFileSync(path.join(l, \"error.log\"), \"a log the report includes\" + String.fromCharCode(10)); } };",
    // diag-spawned: a script that loads nothing of Nova itself starts `node server.js` and asks it for the report — the shape of
    // an agent's harness. Whatever sandbox there is, the SERVER makes it. PORT=0: the server says which port it took. O.childEnv:
    // what the script changes in the server's env on top of its own (a temp folder of the server's own, as rex.js hands one).
    'if (O.mode === "diag-spawned") {',
    '  const http = require("http");',
    '  const child = require("child_process").spawn(process.execPath, ["-r", O.stub, O.server], { env: Object.assign({}, process.env, { PORT: "0" }, O.childEnv || {}),',
    '    stdio: ["ignore", "pipe", "pipe"], windowsHide: true });',
    '  let so = "", se = "";',
    '  child.stdout.on("data", (d) => { so += d; }); child.stderr.on("data", (d) => { se += d; }); child.on("error", () => {});',
    '  const getJson = (port, p) => new Promise((res, rej) => { http.get({ host: "127.0.0.1", port, path: p, agent: false }, (r) => {',
    '    let d = ""; r.on("data", (c) => { d += c; }); r.on("end", () => { try { res({ status: r.statusCode, body: JSON.parse(d) }); } catch (e) { rej(e); } });',
    '  }).on("error", rej); });',
    "  const t0 = Date.now();",
    "  const tick = setInterval(async () => {",
    '    const at = so.indexOf("Started on port ");',
    "    const port = at < 0 ? 0 : (parseInt(so.slice(at + 16), 10) || 0);",
    "    if (!port && child.exitCode === null && Date.now() - t0 < 120000) return;",
    "    clearInterval(tick);",
    "    const out = { port, exit: child.exitCode, serverPid: child.pid };",
    "    if (port) {",
    '      try { const { status, body: b } = await getJson(port, "/api/diag/hoi4"); out.diag = { status, ok: b.ok, savedPath: b.savedPath || "", userDir: b.userDir || "" }; }',
    "      catch (e) { out.diag = { error: String(e && e.message) }; }",
    "    }",
    "    try { child.kill(); } catch (_) {}",
    "    out.stderr = se.slice(0, 4000);",
    "    fs.writeFileSync(O.report, JSON.stringify(out));",
    "    setImmediate(() => process.exit(0));",
    "  }, 100);",
    "  return;",
    "}",
    "const sw = require(O.sw);",
    "const envNow = () => { const e = {}; for (const k of O.keys) e[k] = process.env[k] === undefined ? null : process.env[k]; return e; };",
    "const walk = (d, out = []) => { let es = []; try { es = fs.readdirSync(d, { withFileTypes: true }); } catch (_) { return out; }",
    "  for (const e of es) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p, out); else out.push(p); } return out; };",
    'const markOf = (d) => { try { return JSON.parse(fs.readFileSync(path.join(d, sw.BARE_MARK_FILE || "?"), "utf8")); } catch (_) { return null; } };',
    "const out = { sandbox: sw.BARE_TEST_SANDBOX, env: envNow(), BACKUP_DIR: sw.BACKUP_DIR, tmp: os.tmpdir(), pid: process.pid,",
    "  mark: sw.BARE_TEST_SANDBOX ? markOf(sw.BARE_TEST_SANDBOX) : null };",
    'if (O.mode === "light") { fs.writeFileSync(O.report, JSON.stringify(out)); process.exit(0); }',
    // exit-*: the shapes of a test's own exit. same-tick: a handler added in the very tick process.exit() is called in — it
    // must still find its folder, and what it writes there must go with the sandbox. in-exit: a handler that calls
    // process.exit() itself, after which node runs no more of them.
    'if (O.mode === "exit-same-tick" || O.mode === "exit-in-exit") {',
    "  fs.writeFileSync(O.report, JSON.stringify(out));",
    '  process.on("exit", () => {',
    "    const there = fs.existsSync(out.sandbox);",
    '    try { const d = path.join(process.env.APPDATA, "late"); fs.mkdirSync(d, { recursive: true }); fs.writeFileSync(path.join(d, "late.txt"), "x"); } catch (_) {}',
    '    fs.writeFileSync(O.report + ".late", there ? "LATE-OK" : "LATE-GONE");',
    '    if (O.mode === "exit-in-exit") process.exit(3);',
    "  });",
    '  if (O.mode === "exit-in-exit") process.on("exit", () => fs.writeFileSync(O.report + ".late", "A-LATER-HANDLER-RAN"));',
    "  process.exit(0);",
    "}",
    // exit-listener-throws: a test's exit handler that throws — node abandons the emit there and ends the process itself
    'if (O.mode === "exit-listener-throws") {',
    "  fs.writeFileSync(O.report, JSON.stringify(out));",
    '  process.on("exit", () => { fs.writeFileSync(O.report + ".late", "THREW"); throw new Error("an exit handler that throws"); });',
    "  process.exit(0);",
    "}",
    // note-store-*: a store note whose copy is NOT in the sandbox (a folder elsewhere, which exists) keeps nothing here;
    // the control is the same note with its copy inside.
    'if (O.mode === "note-store-elsewhere" || O.mode === "note-store-inside") {',
    '  const at = O.mode === "note-store-inside" ? path.join(out.sandbox, ".nova", "a-store") : path.join(O.modParent, "a-store-elsewhere");',
    "  fs.mkdirSync(at, { recursive: true });",
    '  sw.noteBareRunRealWrite("store", path.join(O.modParent, "a-mod-outside-temp"), at);',
    "  out.at = at; out.files = walk(out.sandbox).map((p) => path.relative(out.sandbox, p));",
    "  fs.writeFileSync(O.report, JSON.stringify(out)); process.exit(0);",
    "}",
    'const mkMod = (parent, body) => { const m = fs.mkdtempSync(path.join(parent, "nova-bare-probe-mod-")); const st = path.join(m, "history", "states", "1-A.txt");',
    '  fs.mkdirSync(path.dirname(st), { recursive: true }); fs.writeFileSync(st, (body || "state = { id = 1 }") + String.fromCharCode(10)); return { m, st }; };',
    'if (O.mode === "outside" || O.mode === "outside-nopool" || O.mode === "outside-asset") {',
    "  const { st } = mkMod(O.modParent);",
    // outside-asset: the upload shape — a pool backup taken by backupAssetBeforeOverwrite, then a write that is not announced
    '  if (O.mode === "outside-asset") sw.backupAssetBeforeOverwrite(st, "bare-probe-asset");',
    '  else sw.safeModWrite(st, "state = { id = 1 name = A }" + String.fromCharCode(10), "bare-probe", O.mode === "outside-nopool" ? { poolBackup: false } : null);',
    "  out.files = walk(out.sandbox).map((p) => path.relative(out.sandbox, p));",
    "  fs.writeFileSync(O.report, JSON.stringify(out)); process.exit(0);",
    "}",
    // Restore on a mod whose baseline holds only history/states: the history/countries added since is MOVED OUT of the mod,
    // into the sandbox's ~/.nova — no pool backup, no announced write. That copy is the modder's only one.
    "const restoreFlow = (md, m) => {",
    "  const b = md.saveMapBaseline({ modRoot: m });",
    '  const cdir = path.join(m, "history", "countries"); fs.mkdirSync(cdir, { recursive: true });',
    '  fs.writeFileSync(path.join(cdir, "ABC - Precious.txt"), "the only copy" + String.fromCharCode(10));',
    "  const r = md.restoreMapBaseline({ modRoot: m, gameRoot: O.game });",
    "  return { saved: !!b.ok, ok: !!r.ok, error: r.error || '', moved: (r.movedAside || []).map((x) => x.to), liveGone: !fs.existsSync(cdir) };",
    "};",
    'if (O.mode === "outside-restore" || O.mode === "outside-ask-only") {',
    "  const md = require(O.md);",
    "  const { m } = mkMod(O.modParent);",
    // outside-ask-only: the control — a store path worked out for a mod outside temp, and nothing written there
    '  if (O.mode === "outside-ask-only") out.asked = md.getMapBaselineInfo({ modRoot: m });',
    "  else out.restore = restoreFlow(md, m);",
    "  out.files = walk(out.sandbox).map((p) => path.relative(out.sandbox, p));",
    "  fs.writeFileSync(O.report, JSON.stringify(out)); process.exit(0);",
    "}",
    // live-store: the shape of a live-app test — a server of its own (testlib-live-server.js), asked over HTTP to save a
    // baseline of a mod OUTSIDE temp. The copy is made by the SERVER, in the sandbox's ~/.nova, with no pool backup and no
    // write into the mod: only the note the server leaves can keep the sandbox.
    'if (O.mode === "live-store") {',
    '  const http = require("http");',
    "  const { ownLiveServer } = require(O.live);",
    // ⚠️ MOVED WITH #a-baseline-is-the-copy-known-to-load (review MF-1): the server's Save baseline now asks the Save check first, over
    // the game folder it uses (HOI4_ROOT, the decoy: no map in it), and a state with no province is one the game refuses (empty_state,
    // in the fatal set). So the mod it is asked to copy names one province, and the check finds nothing it stops for.
    '  const { m } = mkMod(O.modParent, "state = { id = 1 provinces = { 1 } }");',
    "  const post = (port, p, body) => new Promise((res, rej) => {",
    "    const data = JSON.stringify(body);",
    '    const r = http.request({ host: "127.0.0.1", port, path: p, method: "POST", agent: false,',
    '      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data) } }, (s) => {',
    '      let d = ""; s.on("data", (c) => { d += c; }); s.on("end", () => { try { res({ status: s.statusCode, body: JSON.parse(d) }); } catch (e) { rej(e); } });',
    "    });",
    '    r.on("error", rej); r.write(data); r.end();',
    "  });",
    "  (async () => {",
    '    out.port = await ownLiveServer("test-bare-live-store");',
    '    try { const r = await post(out.port, "/api/map/save-baseline", { modPath: m });',
    '      out.saved = { status: r.status, ok: !!r.body.ok, at: r.body.baselinePath || "", error: r.body.error || "" };',
    "    } catch (e) { out.saved = { error: String(e && e.message) }; }",
    "    out.files = walk(out.sandbox).map((p) => path.relative(out.sandbox, p)).slice(0, 40);",
    "    fs.writeFileSync(O.report, JSON.stringify(out));",
    "    setImmediate(() => process.exit(0));",
    "  })();",
    "  return;",
    "}",
    // live-no-warm: does the server a bare live-app test starts warm its caches in the process that answers? A warm's first
    // step leaves the game's localisation map on disk moments after it begins, and nobody here asks for a name. THE CONTROL
    // comes first — server.js started on its own, as `node server.js`, in the same sandbox — so the wait the test's own
    // server is then given is twice the time a warm was SEEN to take on this machine, not a guess.
    'if (O.mode === "live-no-warm") {',
    "  const { ownLiveServer, freePortInBand } = require(O.live);",
    '  const maps = () => walk(out.sandbox).filter((p) => path.basename(p).startsWith("locmap_"));',
    "  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));",
    "  (async () => {",
    "    const port = await freePortInBand();",
    '    const plain = require("child_process").spawn(process.execPath, [O.server], { env: Object.assign({}, process.env, { PORT: String(port) }), stdio: "ignore", windowsHide: true });',
    '    process.on("exit", () => { try { plain.kill(); } catch (_) {} });',
    "    const t0 = Date.now();",
    "    while (!maps().length && Date.now() - t0 < 60000) await sleep(100);",
    "    out.plain = { port, maps: maps().length, ms: Date.now() - t0 };",
    "    try { plain.kill(); } catch (_) {}",
    "    await sleep(500);",
    "    for (const p of maps()) { try { fs.unlinkSync(p); } catch (_) {} }",
    "    out.cleared = maps().length === 0;",
    '    out.port = await ownLiveServer("test-bare-live-no-warm");',
    "    const wait = Math.max(4000, 2 * out.plain.ms + 1000);",
    "    await sleep(wait);",
    "    out.own = { maps: maps().length, waitedMs: wait };",
    "    fs.writeFileSync(O.report, JSON.stringify(out));",
    "    setImmediate(() => process.exit(0));",
    "  })();",
    "  return;",
    "}",
    // child-*: the same work done by a CHILD this test starts — a copy of this file under a name that is not a test's, the
    // shape of a server a test spawns. It inherits the sandbox and never makes one of its own.
    'if (O.mode === "child-restore" || O.mode === "child-write") {',
    '  if (process.env.BARE_PROBE_ROLE !== "worker") {',
    '    const w = path.join(path.dirname(__filename), "worker-" + path.basename(__filename));',
    "    fs.copyFileSync(__filename, w);",
    '    const env = Object.assign({}, process.env, { BARE_PROBE_ROLE: "worker" });',
    '    const r = require("child_process").spawnSync(process.execPath, [w], { env, encoding: "utf8", timeout: 120000 });',
    '    try { out.child = JSON.parse(fs.readFileSync(O.report + ".worker", "utf8")); } catch (_) { out.child = { raw: String(r.stderr || "").slice(-600) }; }',
    "    out.files = walk(out.sandbox).map((p) => path.relative(out.sandbox, p));",
    "    fs.writeFileSync(O.report, JSON.stringify(out)); process.exit(0);",
    "  }",
    "  const wout = { sandbox: sw.BARE_TEST_SANDBOX, home: process.env.NOVA_HOME_DIR || null };",
    '  if (O.mode === "child-restore") wout.restore = restoreFlow(require(O.md), mkMod(O.modParent).m);',
    '  else sw.safeModWrite(mkMod(O.modParent).st, "state = { id = 1 name = A }" + String.fromCharCode(10), "bare-probe", { poolBackup: false });',
    '  fs.writeFileSync(O.report + ".worker", JSON.stringify(wout)); process.exit(0);',
    "}",
    // child-drops-one: the same, with the CHILD's env changed from the parent's — O.drop taken out of it, O.childSet laid over
    // it (a temp folder of its own) — and the child doing O.work: a map baseline of a mod outside temp (a store), a write into
    // one with no pool backup, or a write into a fixture in the run's own temp folder (O.runTmp).
    'if (O.mode === "child-drops-one") {',
    '  if (process.env.BARE_PROBE_ROLE !== "worker") {',
    '    const w = path.join(path.dirname(__filename), "worker-" + path.basename(__filename));',
    "    fs.copyFileSync(__filename, w);",
    '    const env = Object.assign({}, process.env, { BARE_PROBE_ROLE: "worker" }, O.childSet || {});',
    "    for (const k of O.drop || []) delete env[k];",
    '    const r = require("child_process").spawnSync(process.execPath, [w], { env, encoding: "utf8", timeout: 120000 });',
    '    try { out.child = JSON.parse(fs.readFileSync(O.report + ".worker", "utf8")); } catch (_) { out.child = { raw: String(r.stderr || "").slice(-600) }; }',
    '    out.childStderr = String(r.stderr || "").slice(0, 1500);',
    "    out.files = walk(out.sandbox).map((p) => path.relative(out.sandbox, p));",
    "    fs.writeFileSync(O.report, JSON.stringify(out)); process.exit(0);",
    "  }",
    "  const wout = { sandbox: sw.BARE_TEST_SANDBOX, run: process.env[sw.BARE_SANDBOX_VAR] || null, env: envNow(), tmp: os.tmpdir(), BACKUP_DIR: sw.BACKUP_DIR };",
    '  if (O.work === "baseline") { const b = require(O.md).saveMapBaseline({ modRoot: mkMod(O.modParent).m }); wout.baseline = { ok: !!b.ok, at: b.baselinePath || "" }; }',
    // ask-mods-root: only where server.js puts its mods folder, and nothing is written
    '  else if (O.work === "ask-mods-root") wout.MODS_ROOT = require(O.server).constants.MODS_ROOT || "";',
    "  else {",
    '    const { st } = mkMod(/^write-fixture/.test(O.work) ? O.runTmp : O.modParent);',
    // …-pool: with the pool backup every save takes; the other writes take none
    '    sw.safeModWrite(st, "state = { id = 1 name = A }" + String.fromCharCode(10), "bare-probe", /-pool$/.test(O.work) ? null : { poolBackup: false });',
    "    wout.wrote = st;",
    "  }",
    '  fs.writeFileSync(O.report + ".worker", JSON.stringify(wout)); process.exit(0);',
    "}",
    // diag-in-process: run.js's shape — a script with its app data in temp that loads server.js itself, saves a map baseline
    // (the ~/.nova store) and asks for the report. mods-root: the same, asking only where server.js put the mods folder.
    // Fenced twice: the folders server.js worked out must be inside this test's scratch folder before anything is asked of it.
    'if (O.mode === "diag-in-process" || O.mode === "mods-root") {',
    "  const server = require(O.server);",
    '  out.MODS_ROOT = server.constants.MODS_ROOT || ""; out.userDir = server.resolveHoi4UserDir() || ""; out.docs = server.shellDocumentsDir() || "";',
    "  if ([out.MODS_ROOT, out.userDir, out.docs].some((p) => p && !within(p))) { out.interlock2 = true; fs.writeFileSync(O.report, JSON.stringify(out)); process.exit(0); }",
    '  if (O.mode === "mods-root") { fs.writeFileSync(O.report, JSON.stringify(out)); process.exit(0); }',
    "  out.baseline = require(O.md).saveMapBaseline({ modRoot: mkMod(os.tmpdir()).m });",
    "  seedLog();",
    '  const http = require("http");',
    '  const s = server.createApp().listen(0, "127.0.0.1", () => {',
    '    http.get({ host: "127.0.0.1", port: s.address().port, path: "/api/diag/hoi4", agent: false }, (r) => {',
    '      let d = ""; r.on("data", (c) => { d += c; });',
    '      r.on("end", () => {',
    '        try { const b = JSON.parse(d); out.diag = { status: r.statusCode, ok: b.ok, savedPath: b.savedPath || "", userDir: b.userDir || "" }; }',
    "        catch (e) { out.diag = { error: String(e && e.message) }; }",
    "        fs.writeFileSync(O.report, JSON.stringify(out));",
    "        setImmediate(() => { try { s.closeAllConnections(); } catch (_) {} s.close(); process.exit(0); });",
    "      });",
    '    }).on("error", (e) => { out.diag = { error: String(e && e.message) }; fs.writeFileSync(O.report, JSON.stringify(out)); process.exit(0); });',
    "  });",
    "  return;",
    "}",
    // create-mod: New mod, as the page sends it, from a process that loads server.js itself — into whichever mods folder
    // server.js worked out, once that is inside this test's scratch folder.
    'if (O.mode === "create-mod") {',
    "  const server = require(O.server);",
    '  out.MODS_ROOT = server.constants.MODS_ROOT || "";',
    "  if (!out.MODS_ROOT || !within(out.MODS_ROOT)) { out.interlock2 = true; fs.writeFileSync(O.report, JSON.stringify(out)); process.exit(0); }",
    '  const http = require("http");',
    '  const s = server.createApp().listen(0, "127.0.0.1", () => {',
    "    const data = JSON.stringify({ modName: O.modName, displayName: O.modName });",
    '    const q = http.request({ host: "127.0.0.1", port: s.address().port, path: "/api/mod/create", method: "POST", agent: false,',
    '      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data) } }, (r) => {',
    '      let d = ""; r.on("data", (c) => { d += c; });',
    '      r.on("end", () => {',
    '        try { const b = JSON.parse(d); out.create = { status: r.statusCode, ok: !!b.ok, modRoot: b.modRoot || "", error: b.error || "" }; }',
    "        catch (e) { out.create = { error: String(e && e.message) }; }",
    "        fs.writeFileSync(O.report, JSON.stringify(out));",
    "        setImmediate(() => { try { s.closeAllConnections(); } catch (_) {} s.close(); process.exit(0); });",
    "      });",
    "    });",
    '    q.on("error", (e) => { out.create = { error: String(e && e.message) }; fs.writeFileSync(O.report, JSON.stringify(out)); process.exit(0); });',
    "    q.write(data); q.end();",
    "  });",
    "  return;",
    "}",
    "const md = require(O.md), server = require(O.server);",
    "out.MODS_ROOT = server.constants.MODS_ROOT;",
    "const { m, st } = mkMod(os.tmpdir());",
    '  sw.safeModWrite(st, "state = { id = 1 name = A }" + String.fromCharCode(10), "bare-probe");',
    "out.baseline = md.saveMapBaseline({ modRoot: m });",
    "seedLog();",
    // http with no agent rather than fetch: an exit while fetch's pooled sockets are still closing aborts the process on
    // Windows (libuv UV_HANDLE_CLOSING), and this probe's exit status is part of what is checked.
    'const http = require("http");',
    "const getJson = (port, p) => new Promise((res, rej) => { http.get({ host: \"127.0.0.1\", port, path: p, agent: false }, (r) => {",
    '  let d = ""; r.on("data", (c) => { d += c; }); r.on("end", () => { try { res({ status: r.statusCode, body: JSON.parse(d) }); } catch (e) { rej(e); } });',
    '}).on("error", rej); });',
    'const s = server.createApp().listen(0, "127.0.0.1", async () => {',
    '  try { const { status, body: b } = await getJson(s.address().port, "/api/diag/hoi4");',
    '    out.diag = { status, ok: b.ok, savedPath: b.savedPath || "", userDir: b.userDir || "" };',
    "  } catch (e) { out.diag = { error: String(e && e.message) }; }",
    "  out.files = walk(out.sandbox).map((p) => path.relative(out.sandbox, p));",
    // A test's own exit handler, registered AFTER the guard's: it must still find its folder there (the guard's goes last).
    '  process.on("exit", () => { try { fs.writeFileSync(path.join(process.env.APPDATA, "late.txt"), "x"); fs.writeFileSync(O.report + ".late", "LATE-OK"); }',
    '    catch (e) { fs.writeFileSync(O.report + ".late", "LATE-FAIL " + (e && e.code)); } });',
    "  fs.writeFileSync(O.report, JSON.stringify(out));",
    "  setImmediate(() => { try { s.closeAllConnections(); } catch (_) {} s.close(); process.exit(0); });",
    "});",
  ].join("\n"));
  return { file, report };
}
function runProbe(name, o, env, nodeArgs = []) {
  const { file, report } = writeProbe(name, o);
  const r = spawnSync(process.execPath, [...nodeArgs, file], { env, cwd: PROBES, encoding: "utf8", timeout: 180000 });
  let rep = null;
  try { rep = JSON.parse(fs.readFileSync(report, "utf8")); }
  catch (e) { rep = { harness: (String(r.stderr || "") + String(r.stdout || "")).slice(-800) }; }
  let late = "";
  try { late = fs.readFileSync(report + ".late", "utf8"); } catch (_) { late = ""; }
  return { r, rep, late, stderr: String(r.stderr || "") };
}
const plan = (o) => sw.bareTestRunPlan(Object.assign({ env: {}, tmpdir: os.tmpdir(), homedir: os.homedir(), versions: {}, moduleDir: __dirname }, o));
// ⭐ A RUNNER'S SANDBOX, READ OUT OF ITS OWN ENV OBJECT, evaluated with sentinel folders (as test-a-suite-run-stays-out-of-your-
// home-folder.js does), so whatever expression a runner writes, this sees the folder it produces: variable -> { base: "sandbox"
// or "scratch", rel }. A variable a runner adds tomorrow shows up in section A as one the guard does not cover.
const runnerFolders = (runner) => {
  const masked = maskJsComments(fs.readFileSync(path.join(__dirname, runner), "utf8"));
  const a = masked.indexOf("const childEnv = Object.assign({}, process.env, {");
  if (a < 0) return { err: "childEnv not found in " + runner };
  const open = masked.indexOf("{", masked.indexOf("process.env,", a));
  let depth = 0, end = -1;
  for (let i = open; i < masked.length; i++) {
    if (masked[i] === "{") depth++;
    else if (masked[i] === "}") { depth--; if (!depth) { end = i; break; } }
  }
  const SB = path.join(os.tmpdir(), "nova-runner-sentinel-sandbox"), SC = path.join(os.tmpdir(), "nova-runner-sentinel-scratch");
  let env;
  try { env = vm.runInNewContext("(" + masked.slice(open, end + 1) + ")", { path, os, process: { env: {} }, APPDATA_SANDBOX: SB, SCRATCH: SC }); }
  catch (e) { return { err: String(e.message || e) }; }
  const folders = {};
  for (const [k, v] of Object.entries(env)) {
    if (typeof v !== "string") continue;
    if (same(v, SB) || inside(v, SB)) folders[k] = { base: "sandbox", rel: path.relative(SB, v).split(path.sep).join("/") };
    else if (same(v, SC) || inside(v, SC)) folders[k] = { base: "scratch", rel: path.relative(SC, v).split(path.sep).join("/") };
  }
  return { folders };
};

try {
  // ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  console.log("\nA. the guard sandboxes exactly what each runner sandboxes, laid out the same way");
  {
    for (const [runner, main] of [["run-tests.js", "test-any.js"], ["run-e2e.js", "e2e-any.js"]]) {
      const { folders, err } = runnerFolders(runner);
      const p = plan({ mainFile: path.join(__dirname, main) });
      const want = Object.keys(folders || {}).sort(), got = Object.keys(p).sort();
      ok(!err && want.length >= 6, "THE CONTROL: " + runner + "'s own sandbox is read out of its source", err || folders);
      ok(JSON.stringify(want) === JSON.stringify(got), "⭐⭐⭐ a bare " + main.replace("-any", "-*") + " is given exactly the variables " + runner + " sandboxes",
        { runner: want, guard: got });
      const layoutOff = want.filter((k) => folders[k].base === "sandbox" && p[k] !== folders[k].rel);
      ok(!layoutOff.length, "⭐ …each laid out inside the sandbox where " + runner + " puts it", layoutOff.map((k) => ({ k, runner: folders[k].rel, guard: p[k] })));
    }
    ok(JSON.stringify(plan({ mainFile: path.join(__dirname, "testlib-any.js") })) === JSON.stringify(plan({ mainFile: path.join(__dirname, "test-any.js") })),
      "a testlib-*.js main (a test's worker) gets the unit runner's layout");
  }

  // ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  console.log("\nB. ⛔ it cannot engage in the shipped app");
  {
    // DERIVED from package.json: the entry point and every root module build.files ships.
    const shipped = [...new Set([pkg.main, ...pkg.build.files.filter((f) => ROOT_JS.has(f))])];
    ok(shipped.includes("main.js") && shipped.includes("server.js") && shipped.includes("safe-write.js"),
      "THE CONTROL: the shipped list is read out of package.json", shipped);
    const engages = shipped.filter((f) => Object.keys(plan({ mainFile: path.join(__dirname, f) })).length);
    ok(!engages.length, "⭐⭐⭐ with any shipped module as the process's main — main.js, warm-child.js, server.js… — it plans nothing", engages);
    ok(!pkg.build.files.some((f) => /(^|\/)(test|e2e|testlib)-[^/]*$/i.test(f)), "…and build.files ships no test file that could be one", pkg.build.files);
    const t = path.join(__dirname, "test-any.js");
    ok(Object.keys(plan({ mainFile: t })).length > 0, "THE CONTROL: the same call with a test as main does plan a sandbox");
    ok(!Object.keys(plan({ mainFile: t, versions: { electron: String(pkg.devDependencies.electron || "41") } })).length,
      "⭐⭐ under Electron it plans nothing, whatever the main is");
    const asar = path.join(os.tmpdir(), "2vX9", "resources", "app.asar"), unpacked = path.join(os.tmpdir(), "2vX9", "resources", "app");
    ok(!Object.keys(plan({ mainFile: t, moduleDir: asar })).length, "⭐⭐ from inside app.asar it plans nothing");
    ok(Object.keys(plan({ mainFile: t, moduleDir: unpacked })).length > 0, "THE CONTROL: …while the same folder unpacked is not exempt");

    // ⭐⭐⭐ BY RUNNING IT: a process whose main carries each shipped name that loads safe-write.js (derived through the
    // require graph), on the fake machine with nothing sandboxed, must leave the environment and the app-data folder alone.
    const mains = shipped.filter(loadsSafeWrite);
    ok(mains.includes("main.js") && mains.includes("warm-child.js"), "THE CONTROL: the require graph finds main.js and warm-child.js reach safe-write.js", mains);
    for (const f of mains) {
      const dir = path.join(PROBES, "as-" + f.replace(/\.js$/, ""));
      fs.mkdirSync(dir, { recursive: true });
      const file = path.join(dir, f);
      fs.writeFileSync(file, "const sw = require(" + JSON.stringify(path.join(__dirname, "safe-write.js")) + ");\n"
        + "process.stdout.write(JSON.stringify({ sandbox: sw.BARE_TEST_SANDBOX, APPDATA: process.env.APPDATA,"
        + " home: process.env.NOVA_HOME_DIR || null, BACKUP_DIR: sw.BACKUP_DIR }));\n");
      const r = spawnSync(process.execPath, [file], { env: bareEnv(), cwd: dir, encoding: "utf8", timeout: 60000 });
      let o = null;
      try { o = JSON.parse(r.stdout); } catch (_) { o = { raw: String(r.stdout || "") + String(r.stderr || "") }; }
      ok(!!o && o.sandbox === "" && same(o.APPDATA, FAKE_APPDATA) && o.home === null && inside(o.BACKUP_DIR, FAKE_APPDATA) && !/\[nova\]/.test(r.stderr || ""),
        "⭐⭐ a process whose main is " + f + " keeps the machine's own folders", o);
    }
    const ctl = runProbe("test-bare-control.js", { mode: "light" }, bareEnv());
    ok(ctl.rep && !!ctl.rep.sandbox && inside(ctl.rep.sandbox, CHILD_TMP), "THE CONTROL: the same probe named like a test is sandboxed", ctl.rep);
    // Preloaded with `node -r safe-write.js test-x.js`, this module runs before require.main exists, and is cached after.
    const pre = runProbe("test-bare-preloaded.js", { mode: "light" }, bareEnv(), ["-r", path.join(__dirname, "safe-write.js")]);
    const preSb = (pre.rep && pre.rep.sandbox) || "";
    ok(!!preSb && inside(preSb, CHILD_TMP) && inside(pre.rep.BACKUP_DIR, preSb),
      "⭐⭐ …and so is one run with safe-write.js PRELOADED (node -r), before the test file is its main", pre.rep);
    ok(!!preSb && !fs.existsSync(preSb), "…and that sandbox is taken away at exit too", preSb);
  }

  // ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  console.log("\nC. ⭐⭐⭐ a bare test on the fake machine writes a backup, a baseline and a diagnostics report — all into its sandbox");
  let fullSandbox = "";
  {
    const before = snapshot(FAKE_HOME);
    const { r, rep, late, stderr } = runProbe("test-bare-probe.js", { mode: "full" }, bareEnv());
    ok(!!rep && !rep.interlock && !rep.harness && r.status === 0, "the probe ran, fenced into this test's scratch folder",
      { status: r.status, rep, stderr: stderr.slice(-400) });
    const sb = (rep && rep.sandbox) || "";
    fullSandbox = sb;
    ok(!!sb && inside(sb, CHILD_TMP), "⭐⭐ the guard made a sandbox inside the process's temp folder", sb);
    // #a-child-made-a-second-sandbox — the mark is what tells every other process of the run that this folder is one
    ok(!!sb && !!rep.mark && rep.mark.pid === rep.pid && rep.mark.main === "test-bare-probe.js" && rep.mark.test === true,
      "⭐⭐ …and left its mark in it, naming the process that made it", rep && { mark: rep.mark, pid: rep.pid });
    const outOf = KEYS.filter((k) => k in sw.BARE_TEST_ENV).filter((k) => !(rep && rep.env && (same(rep.env[k], sb) || inside(rep.env[k], sb))));
    ok(!!sb && !outOf.length, "⭐⭐⭐ every variable the unit runner sandboxes now points into it", rep && rep.env);
    ok(!!sb && (rep.env.HOI4_MODS_ROOT === null), "…and a test-*.js is not given the e2e runner's mods root", rep && rep.env);
    ok(inside(rep && rep.BACKUP_DIR, sb), "⭐⭐⭐ safe-write.js files its backups there", rep && rep.BACKUP_DIR);
    ok(inside(rep && rep.MODS_ROOT, sb), "⭐⭐⭐ server.js's mods folder is there too — worked out after the guard, not before it", rep && rep.MODS_ROOT);
    const files = (rep && rep.files) || [];
    const bdir = path.relative(sb, (rep && rep.BACKUP_DIR) || "");
    ok(files.some((f) => f.startsWith(bdir + path.sep)), "⭐⭐ a safeModWrite backup landed in the sandbox", files);
    ok(!!(rep && rep.baseline && rep.baseline.ok) && inside(rep.baseline.baselinePath, sb), "⭐⭐ a map baseline (~/.nova) landed in the sandbox", rep && rep.baseline);
    ok(!!(rep && rep.diag && rep.diag.ok) && inside(rep.diag.savedPath, sb), "⭐⭐ the HOI4-folder diagnostics report landed in the sandbox", rep && rep.diag);
    const after = snapshot(FAKE_HOME);
    const d = diff(before, after);
    ok(clean(d) && before.size >= 3, "⭐⭐⭐ and NOTHING was written into the fake machine — its AppData, ~/.nova, Documents and HOI4 folder", d);
    ok(/\[nova\] test-bare-probe\.js is running without its test runner/.test(stderr) && stderr.includes(sb), "…and it said so, naming the sandbox", stderr.slice(0, 300));
    ok(late === "LATE-OK", "⭐ a test's own exit handler, registered after the guard's, still found its folder", late);
    ok(!!sb && !fs.existsSync(sb), "⭐⭐ the sandbox is gone once the probe has exited", sb);
  }
  {
    // ⭐⭐ THE RELEASE COMES AFTER EVERY EXIT HANDLER — one added in the same tick as process.exit() too, where nothing queued
    // runs in between. It was moved behind a later handler by a microtask, which never ran then: the handler found its
    // folder gone, and what it wrote under APPDATA made the sandbox again, to be left behind.
    const { r, rep, late } = runProbe("test-bare-exit-same-tick.js", { mode: "exit-same-tick" }, bareEnv());
    const sb = (rep && rep.sandbox) || "";
    ok(!!sb && inside(sb, CHILD_TMP) && r.status === 0, "THE CONTROL: a sandboxed probe added an exit handler and called process.exit() in the same tick",
      { status: r.status, rep });
    ok(late === "LATE-OK", "⭐⭐⭐ that handler still found its folder: the release had not run yet", late);
    ok(!!sb && !fs.existsSync(sb), "⭐⭐⭐ …and the sandbox went after it, with what the handler wrote there", walk(sb).map((p) => path.relative(sb, p)));
  }
  {
    // …and a handler that calls process.exit() ITSELF: node abandons the rest of the emit there and exits, so nothing that
    // waits for the handlers to return would ever run.
    const { r, rep, late } = runProbe("test-bare-exit-in-exit.js", { mode: "exit-in-exit" }, bareEnv());
    const sb = (rep && rep.sandbox) || "";
    ok(!!sb && r.status === 3 && late === "LATE-OK", "THE CONTROL: an exit handler that calls process.exit(3) ends the process there — no later handler runs",
      { status: r.status, late, rep });
    ok(!!sb && !fs.existsSync(sb), "⭐⭐ …and the sandbox is still taken away", walk(sb).map((p) => path.relative(sb, p)));
  }
  {
    // …and one that THROWS: the emit never returns normally, so a release that waits for it to would never run (the
    // sandbox verifier's V3-4 left two sandboxes behind that way). It runs from the emit's finally.
    const { r, rep, late } = runProbe("test-bare-exit-listener-throws.js", { mode: "exit-listener-throws" }, bareEnv());
    const sb = (rep && rep.sandbox) || "";
    ok(!!sb && late === "THREW", "THE CONTROL: a sandboxed probe's exit handler ran and threw",
      { status: r.status, late, rep, stderr: String(r.stderr || "").slice(-300) });
    ok(!!sb && !fs.existsSync(sb), "⭐⭐ …and the sandbox is taken away even though the emit never returned", walk(sb).map((p) => path.relative(sb, p)));
  }

  // ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  console.log("\nD. a test's own temp choices are kept, and only the rest filled in");
  {
    const own = path.join(CHILD_TMP, "own-appdata");
    fs.mkdirSync(own, { recursive: true });
    const { rep, stderr } = runProbe("test-bare-own-choice.js", { mode: "light" }, bareEnv({ APPDATA: own, NOVA_DOCUMENTS_DIR: "none" }));
    const sb = (rep && rep.sandbox) || "";
    ok(!!rep && same(rep.env.APPDATA, own) && inside(rep.BACKUP_DIR, own), "⭐⭐ an APPDATA the test put in temp is its own, and kept", rep);
    ok(!!rep && rep.env.NOVA_DOCUMENTS_DIR === "none", "⭐ NOVA_DOCUMENTS_DIR=none (\"no answer\", on purpose) is kept", rep && rep.env);
    ok(!!sb && (inside(rep.env.NOVA_HOME_DIR, sb) || same(rep.env.NOVA_HOME_DIR, sb)),
      "⭐⭐⭐ …but NOVA_HOME_DIR, which it left alone, is filled in rather than trusted", rep && rep.env);
    ok(!!sb && inside(rep.env.HOI4_USER_DIR, sb), "⭐⭐ …and HOI4_USER_DIR", rep && rep.env);
    const named = ((stderr.match(/running without its test runner: (.*?) ->/) || ["", ""])[1]).split(/,\s*/).filter(Boolean);
    ok(named.length >= 4 && !named.includes("APPDATA") && !named.includes("NOVA_DOCUMENTS_DIR"), "…and it names only what it filled in", named);
  }
  {
    // ⭐ WHAT COUNTS AS ALREADY A SANDBOX, asked of the plan on a made-up machine, with nothing read from disk: the plan is
    // handed how the disk spells a path (`realpath`) as it is handed everything else.
    const root = path.parse(os.tmpdir()).root;
    const H = path.join(root, "Users", "Long Name");
    const T = path.join(H, "AppData", "Local", "Temp");
    const T83 = path.join(root, "Users", "LONGNA~1", "AppData", "Local", "Temp");      // the same folder, as Windows also spells it
    const asWritten = (p) => p;
    const asTheDiskSpellsIt = (p) => String(p).replace(/LONGNA~1/i, "Long Name");
    const runnerLike = (dir) => { const e = {}; for (const [k, sub] of Object.entries(sw.BARE_E2E_ENV)) e[k] = sub ? path.join(dir, sub) : dir; return e; };
    const ask = (o) => Object.keys(sw.bareTestRunPlan(Object.assign({ mainFile: path.join(__dirname, "e2e-any.js"), tmpdir: T, homedir: H,
      versions: {}, moduleDir: __dirname, realpath: asWritten, env: runnerLike(path.join(T, "nova-suite-appdata-x")) }, o))).sort();
    const every = Object.keys(sw.BARE_E2E_ENV).sort();
    const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    const withOne = (k, v) => Object.assign(runnerLike(path.join(T, "nova-suite-appdata-x")), { [k]: v });
    ok(eq(ask({}), []), "THE CONTROL: every variable in a runner's folder inside temp leaves nothing to fill in", ask({}));
    // the temp folder ITSELF: an e2e test sets its mods root to os.tmpdir() and makes its mods there
    ok(eq(ask({ env: withOne("HOI4_MODS_ROOT", T) }), []), "⭐⭐ a mods root that IS the temp folder is the test's own choice, and kept", ask({ env: withOne("HOI4_MODS_ROOT", T) }));
    ok(eq(ask({ env: withOne("HOI4_MODS_ROOT", path.join(H, "Documents", "mod")) }), ["HOI4_MODS_ROOT"]), "THE CONTROL: …while one outside temp is replaced");
    // a temp folder that cannot tell a sandbox from the real thing
    ok(eq(ask({ tmpdir: root, env: runnerLike(path.join(root, "nova-suite-appdata-x")) }), every),
      "⭐⭐ a temp folder at the top of a drive tells nothing: every variable is given a sandbox, though each is 'inside' it",
      ask({ tmpdir: root, env: runnerLike(path.join(root, "nova-suite-appdata-x")) }));
    ok(eq(ask({ homedir: path.join(T, "home") }), every), "⭐⭐ …nor does one the home folder sits in", ask({ homedir: path.join(T, "home") }));
    ok(eq(ask({ homedir: T }), every), "…or one that IS the home folder", ask({ homedir: T }));
    // one folder, spelled two ways
    ok(eq(ask({ tmpdir: T83, realpath: asTheDiskSpellsIt }), []),
      "⭐⭐ a temp folder handed over in 8.3 form and a runner's sandbox spelled in full are one folder: nothing to fill in", ask({ tmpdir: T83, realpath: asTheDiskSpellsIt }));
    ok(eq(ask({ env: runnerLike(path.join(T83, "nova-suite-appdata-x")), realpath: asTheDiskSpellsIt }), []), "…and the other way round");
    ok(eq(ask({ tmpdir: T83, realpath: asWritten }), every), "THE CONTROL: compared only as written, that runner's sandbox looks like a real folder", ask({ tmpdir: T83 }));
    ok(eq(ask({ tmpdir: T83, homedir: path.join(T, "home"), realpath: asTheDiskSpellsIt }), every), "…and a home folder inside temp still tells nothing under the other spelling");
    // a value that is not a full path
    ok(eq(ask({ env: withOne("APPDATA", "appdata") }), ["APPDATA"]), "⭐ a relative APPDATA is a folder under wherever the test was started, and is replaced", ask({ env: withOne("APPDATA", "appdata") }));
    ok(eq(ask({ env: withOne("NOVA_DOCUMENTS_DIR", "none") }), []), "THE CONTROL: …while NOVA_DOCUMENTS_DIR=none is kept — its reader takes that as no answer");
    ok(/NOVA_DOCUMENTS_DIR[^;]*;\s*return path\.isAbsolute\(d\) \? d : "";/.test(codeOf("server.js")),
      "THE CONTROL: …which server.js still does: a NOVA_DOCUMENTS_DIR that is not a full path names no folder");
  }
  {
    // …and by running it: an APPDATA that IS the temp folder is kept, and a relative one replaced.
    const own = runProbe("test-bare-temp-itself.js", { mode: "light" }, bareEnv({ APPDATA: CHILD_TMP }));
    ok(!!own.rep && same(own.rep.env.APPDATA, CHILD_TMP) && !!own.rep.sandbox && inside(own.rep.env.NOVA_HOME_DIR, CHILD_TMP),
      "⭐⭐ run bare with APPDATA set to the temp folder itself, it is kept (and the rest filled in)", own.rep);
    const rel = runProbe("test-bare-relative.js", { mode: "light" }, bareEnv({ XDG_CONFIG_HOME: "relative-config" }));
    ok(!!rel.rep && !!rel.rep.sandbox && same(rel.rep.env.XDG_CONFIG_HOME, rel.rep.sandbox), "⭐ …and a relative XDG_CONFIG_HOME is pointed at the sandbox", rel.rep);
  }

  // ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  console.log("\nE. under a runner's env nothing changes at all");
  {
    const sb = path.join(CHILD_TMP, "runner-sandbox");
    const env = runnerEnv(sb);
    const { rep, stderr } = runProbe("test-bare-under-runner.js", { mode: "light" }, env);
    ok(!!rep && rep.sandbox === "", "⭐⭐⭐ no sandbox of its own", rep);
    const moved = Object.keys(sw.BARE_TEST_ENV).filter((k) => !(rep && rep.env && rep.env[k] === env[k]));
    ok(!!rep && !moved.length, "⭐⭐ every variable is exactly what the runner handed it", { moved, got: rep && rep.env });
    ok(!/\[nova\]/.test(stderr), "…and it prints nothing", stderr.slice(0, 200));
  }
  {
    // ⭐⭐ …ALSO WHEN THE TEMP FOLDER IS HANDED OVER IN 8.3 FORM. Windows spells a long folder name a second way
    // (C:\Users\LONGNA~1\…), and a process can be given its temp folder in that form while the runner's sandbox is spelled
    // in full: compared as written, the sandbox looked like a real folder and the guard engaged under the runner. By running
    // it, where this volume makes such names (the plan is asked the same in D, with nothing on disk, everywhere).
    const short = (() => {
      if (process.platform !== "win32") return "";
      const r = spawnSync("cmd.exe", ["/d", "/s", "/c", 'for %I in ("' + CHILD_TMP + '") do @echo %~sI'], { encoding: "utf8", windowsVerbatimArguments: true, windowsHide: true });
      return String(r.stdout || "").trim();
    })();
    if (!short || short.toLowerCase() === CHILD_TMP.toLowerCase() || !fs.existsSync(short)) {
      console.log("  (this volume makes no 8.3 names, so there is no second spelling to hand a process here)");
    } else {
      const sb = path.join(CHILD_TMP, "runner-sandbox-spelled-in-full");
      const env = Object.assign(runnerEnv(sb), { TEMP: short, TMP: short, TMPDIR: short });
      const { rep, stderr } = runProbe("test-bare-under-runner-83.js", { mode: "light" }, env);
      ok(!!rep && same(rep.tmp, short) && !same(short, CHILD_TMP), "THE CONTROL: the probe's temp folder was the 8.3 spelling of the one the runner's sandbox is in", { tmp: rep && rep.tmp, short });
      const moved = Object.keys(sw.BARE_TEST_ENV).filter((k) => !(rep && rep.env && rep.env[k] === env[k]));
      ok(!!rep && rep.sandbox === "" && !moved.length && !/\[nova\]/.test(stderr),
        "⭐⭐⭐ …and the guard still stands down: no sandbox of its own, every variable as the runner handed it", { rep, moved, stderr: stderr.slice(0, 200) });
    }
  }

  // ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  console.log("\nF. ⛔ a sandbox holding a backup of a file OUTSIDE temp is kept, never deleted");
  {
    const { rep, stderr } = runProbe("test-bare-outside.js", { mode: "outside", modParent: OUTSIDE }, bareEnv());
    const sb = (rep && rep.sandbox) || "";
    const kept = inside(rep && rep.BACKUP_DIR, sb) ? walk(rep.BACKUP_DIR) : [];
    ok(!!sb && fs.existsSync(sb), "⭐⭐⭐ the sandbox is still there after the probe exited", { sb, files: rep && rep.files });
    ok(kept.length >= 1 && kept.every((f) => fs.statSync(f).size > 0), "⭐⭐ …with the backup in it", kept.map((f) => path.basename(f)));
    ok(/\[nova\] kept /.test(stderr) && stderr.includes(sb), "…and it said where", stderr.slice(-300));
  }
  {
    // A write into a mod outside temp with NO pool backup (the restore shape, poolBackup: false). Delete map is the real case:
    // it copies the map into ~/.nova and then unlinks, and nothing lands in the backups folder — so the sandbox's ~/.nova
    // copy would be the only one. The write itself must keep the sandbox.
    const { rep, stderr } = runProbe("test-bare-outside-nopool.js", { mode: "outside-nopool", modParent: OUTSIDE }, bareEnv());
    const sb = (rep && rep.sandbox) || "";
    const pool = inside(rep && rep.BACKUP_DIR, sb) ? walk(rep.BACKUP_DIR) : [];
    ok(!!sb && !pool.length, "THE CONTROL: that write left no pool backup in the sandbox", pool.map((f) => path.basename(f)));
    ok(!!sb && fs.existsSync(sb), "⭐⭐ …and the sandbox is kept anyway, because the run wrote into a mod outside temp", sb);
    ok(/\[nova\] kept .*wrote 1 file/.test(stderr) && stderr.includes(sb), "…and it said why", stderr.slice(-300));
  }
  {
    // …and the other way round: an asset backup (backupAssetBeforeOverwrite, before an upload overwrites a picture) of a file
    // outside temp, with no announced mod write. The backup's own name is what keeps it.
    const { rep, stderr } = runProbe("test-bare-outside-asset.js", { mode: "outside-asset", modParent: OUTSIDE }, bareEnv());
    const sb = (rep && rep.sandbox) || "";
    ok(!!sb && fs.existsSync(sb) && inside(rep.BACKUP_DIR, sb) && walk(rep.BACKUP_DIR).length === 1,
      "⭐⭐ a sandbox holding an asset backup of a file outside temp is kept, with the backup in it", { sb, files: rep && rep.files });
    ok(/\[nova\] kept .*holds 1 backup/.test(stderr), "…and it said why", stderr.slice(-300));
  }
  // ⭐⭐⭐ RESTORE MOVES A FOLDER OUT OF THE MOD. restoreMapBaseline → _moveOutOfMod copies a folder the baseline does not hold
  // into <NOVA_HOME_DIR>/.nova/baseline_restores and then removes it from the mod: no pool backup, no announced write. The
  // copy in the sandbox is the modder's ONLY one — found by review, where the sandbox was deleted with it.
  const restoreKept = (label, rep, stderr, restore) => {
    const sb = (rep && rep.sandbox) || "";
    const moved = (restore && restore.moved) || [];
    ok(!!sb && !!restore && restore.ok && restore.liveGone && moved.length === 1 && inside(moved[0], sb),
      "THE CONTROL (" + label + "): Restore moved history/countries out of a mod outside temp, into the sandbox", { sb, restore });
    ok(!!sb && fs.existsSync(sb), "⭐⭐⭐ (" + label + ") the sandbox is KEPT", { sb, files: rep && rep.files });
    ok(moved.length === 1 && fs.existsSync(path.join(moved[0], "ABC - Precious.txt")),
      "⭐⭐⭐ (" + label + ") …with the folder Restore took out of the mod still in it", moved);
    ok(/\[nova\] kept /.test(stderr) && stderr.includes(sb), "(" + label + ") …and it said where", stderr.slice(-300));
  };
  {
    const { rep, stderr } = runProbe("test-bare-outside-restore.js", { mode: "outside-restore", modParent: OUTSIDE }, bareEnv());
    restoreKept("in the test's own process", rep, stderr, rep && rep.restore);
  }
  {
    // ⭐⭐ …and when a CHILD does it — the shape of a server the test started. The child's main is not a test, so it makes no
    // sandbox of its own and cannot release one; what it copied must still keep the parent's.
    const { rep, stderr } = runProbe("test-bare-child-restore.js", { mode: "child-restore", modParent: OUTSIDE }, bareEnv());
    const c = (rep && rep.child) || {};
    ok(!!rep && !!rep.sandbox && c.sandbox === "" && (same(c.home, rep.sandbox) || inside(c.home, rep.sandbox)),
      "THE CONTROL: the child made no sandbox of its own, and wrote into the parent's", { parent: rep && rep.sandbox, child: c });
    restoreKept("in a child it started", rep, stderr, c.restore);
  }
  {
    // …and a child's write into a mod outside temp keeps it, exactly as the test's own does (outside-nopool above).
    const { rep, stderr } = runProbe("test-bare-child-write.js", { mode: "child-write", modParent: OUTSIDE }, bareEnv());
    const sb = (rep && rep.sandbox) || "";
    ok(!!sb && fs.existsSync(sb), "⭐⭐ a CHILD's write into a mod outside temp keeps the sandbox too", { sb, child: rep && rep.child });
    ok(/\[nova\] kept .*wrote 1 file/.test(stderr) && stderr.includes(sb), "…and it said why", stderr.slice(-300));
  }
  {
    // ⛔ #a-child-made-a-second-sandbox — A CHILD WHOSE ENV LEFT ONE VARIABLE OUT IS STILL PART OF THE RUN (review R1). Its app data
    // was the run's sandbox, inside temp, so the rule for a script with its app data in temp made it a sandbox OF ITS OWN for the
    // variable it lacked, and pointed NOVA_BARE_SANDBOX there — while its NOVA_HOME_DIR still named the run's. Its store of a
    // mod outside temp landed in the run's sandbox and its note in its own: its release ignored the note (that copy was not
    // in its folder), the run's found none, and the store went with the run's sandbox. Measured on the code before: both gone.
    // It now fills what it left out IN THE RUN'S sandbox, and makes none — under a test that started it and under a script.
    const F_APP = path.join(CHILD_TMP, "f-a-scripts-own-appdata");
    fs.mkdirSync(F_APP, { recursive: true });
    for (const [label, name, env] of [["a test", "test-bare-child-drops-one.js", bareEnv()],
      ["a script", "run-drops-one.js", bareEnv({ APPDATA: F_APP, NOVA_APP_DATA_DIR: F_APP, XDG_CONFIG_HOME: F_APP, NOVA_DOCUMENTS_DIR: undefined })]]) {
      const { rep, stderr } = runProbe(name, { mode: "child-drops-one", work: "baseline", drop: ["NOVA_DOCUMENTS_DIR"], modParent: OUTSIDE }, env);
      const sb = (rep && rep.sandbox) || "";
      const c = (rep && rep.child) || {};
      const at = (c.baseline && c.baseline.at) || "";
      ok(!!sb && !!c.baseline && c.baseline.ok && inside(at, sb),
        "THE CONTROL (" + label + "): its child, whose env had no NOVA_DOCUMENTS_DIR, saved a baseline of a mod outside temp into the run's ~/.nova", { sb, child: c });
      ok(!!sb && c.sandbox === "" && same(c.run, sb) && inside(c.env && c.env.NOVA_DOCUMENTS_DIR, sb),
        "⭐⭐⭐ (" + label + ") the child made no sandbox of its own: what it left out is filled in the run's, which is still the one named to it",
        { run: sb, child: { sandbox: c.sandbox, named: c.run, docs: c.env && c.env.NOVA_DOCUMENTS_DIR }, said: (rep && rep.childStderr || "").slice(0, 300) });
      ok(!!sb && fs.existsSync(sb) && !!at && fs.existsSync(at), "⭐⭐⭐ (" + label + ") the run's sandbox is KEPT, with the store in it", { sb, at, files: rep && rep.files });
      ok(/\[nova\] kept .*holds 1 store/.test(stderr) && stderr.includes(sb), "(" + label + ") …and it said why", stderr.slice(-300));
    }
  }
  {
    // ⛔ …AND A STORE IS NOTED IN THE SANDBOX THAT HOLDS IT, WHATEVER THE PROCESS WAS TOLD. A child handed no NOVA_BARE_SANDBOX at
    // all, but the run's NOVA_HOME_DIR, saves its store in the run's sandbox: the note goes where the store went, which is the
    // folder whose release decides whether it is taken away.
    const { rep, stderr } = runProbe("test-bare-child-not-told.js", { mode: "child-drops-one", work: "baseline", drop: [sw.BARE_SANDBOX_VAR], modParent: OUTSIDE }, bareEnv());
    const sb = (rep && rep.sandbox) || "";
    const c = (rep && rep.child) || {};
    const at = (c.baseline && c.baseline.at) || "";
    ok(!!sb && c.run === null && c.sandbox === "" && !!c.baseline && c.baseline.ok && inside(at, sb),
      "THE CONTROL: a child told of no sandbox made none, and saved a store of a mod outside temp into the run's, through the NOVA_HOME_DIR it inherited", { sb, child: c });
    ok(!!sb && fs.existsSync(sb) && !!at && fs.existsSync(at) && /\[nova\] kept .*holds 1 store/.test(stderr),
      "⭐⭐⭐ …and the run's sandbox is kept with it: the note went into the sandbox that holds the store", { sb, at, stderr: stderr.slice(-300) });
  }
  {
    // ⛔ …AND A CHILD HANDED A TEMP FOLDER OF ITS OWN IS STILL PART OF THE RUN. The run's sandbox is not inside that child's temp
    // folder, and judged against it alone it was no sandbox: the child noted nothing, and what it copied of a mod outside temp went
    // with the run's sandbox (review R1, on the code before as well). A sandbox is known by the mark the guard leaves in it.
    const CHILD_TMP2 = path.join(SCRATCH, "tmp-of-a-childs-own");
    fs.mkdirSync(CHILD_TMP2, { recursive: true });
    const own = { TEMP: CHILD_TMP2, TMP: CHILD_TMP2, TMPDIR: CHILD_TMP2 };
    for (const work of ["write", "baseline"]) {
      const { rep, stderr } = runProbe("test-bare-child-own-tmp-" + work + ".js", { mode: "child-drops-one", work, childSet: own, modParent: OUTSIDE }, bareEnv());
      const sb = (rep && rep.sandbox) || "";
      const c = (rep && rep.child) || {};
      ok(!!sb && same(c.tmp, CHILD_TMP2) && !inside(sb, CHILD_TMP2) && c.sandbox === "" && same(c.run, sb),
        "THE CONTROL (" + work + "): the child's temp folder is its own, the run's sandbox is not in it, and the child made none", { sb, child: c });
      const at = (c.baseline && c.baseline.at) || "";
      ok(!!sb && fs.existsSync(sb) && /\[nova\] kept /.test(stderr) && (work !== "baseline" || (!!at && inside(at, sb) && fs.existsSync(at))),
        "⭐⭐⭐ (" + work + ") its " + (work === "write" ? "write into a mod outside temp" : "store of a mod outside temp") + " keeps the run's sandbox" + (work === "write" ? "" : ", with the store in it"),
        { sb, at, stderr: stderr.slice(-300) });
    }
    // THE CONTROL against keeping too much: a write into a fixture in the RUN's temp folder — outside the child's own — is the
    // run's fixture, not a mod outside temp, and keeps nothing.
    const { rep, stderr } = runProbe("test-bare-child-own-tmp-fixture.js", { mode: "child-drops-one", work: "write-fixture", childSet: own, runTmp: CHILD_TMP }, bareEnv());
    const sb = (rep && rep.sandbox) || "";
    const c = (rep && rep.child) || {};
    ok(!!sb && inside(c.wrote, CHILD_TMP) && !inside(c.wrote, CHILD_TMP2) && !fs.existsSync(sb) && !/\[nova\] kept /.test(stderr),
      "⭐⭐ …while its write into a fixture in the run's own temp folder keeps nothing: that sandbox goes", { sb, child: c, stderr: stderr.slice(-300) });
    // …AND WITH THE POOL BACKUP EVERY SAVE TAKES (review S6). That check's write takes none. With one, the child named the backup as a file
    // outside temp (judged by its own temp folder), so the run's sandbox stayed, with "1 backup(s) of files outside the temp folder".
    const pool = runProbe("test-bare-child-own-tmp-fixture-pool.js", { mode: "child-drops-one", work: "write-fixture-pool", childSet: own, runTmp: CHILD_TMP }, bareEnv());
    const psb = (pool.rep && pool.rep.sandbox) || "";
    const pc = (pool.rep && pool.rep.child) || {};
    ok(!!psb && inside(pc.wrote, CHILD_TMP) && !inside(pc.wrote, CHILD_TMP2) && !fs.existsSync(psb) && !/\[nova\] kept /.test(pool.stderr),
      "⭐⭐ …and so does the same write with the pool backup every save takes: a fixture of the run's, whatever temp folder its child was handed", { psb, child: pc, stderr: pool.stderr.slice(-300) });
    const real = runProbe("test-bare-child-own-tmp-write-pool.js", { mode: "child-drops-one", work: "write-pool", childSet: own, modParent: OUTSIDE }, bareEnv());
    const rsb = (real.rep && real.rep.sandbox) || "";
    ok(!!rsb && fs.existsSync(rsb) && /\[nova\] kept .*holds 1 backup/.test(real.stderr),
      "THE CONTROL: …while its backup of a mod outside the run's temp folder keeps the sandbox, as ever", { rsb, stderr: real.stderr.slice(-300) });
  }
  {
    // THE CONTROL against keeping everything: working out where a mod's store WOULD go (a baseline-info read, as the map page
    // does on open) for a mod outside temp, and writing nothing there, is not a copy of anything. That sandbox goes.
    const { rep, stderr } = runProbe("test-bare-outside-ask-only.js", { mode: "outside-ask-only", modParent: OUTSIDE }, bareEnv());
    const sb = (rep && rep.sandbox) || "";
    ok(!!sb && rep.asked && rep.asked.exists === false, "THE CONTROL: the probe asked about a mod outside temp that has no store", rep && rep.asked);
    ok(!!sb && !fs.existsSync(sb) && !/\[nova\] kept /.test(stderr),
      "⭐⭐ …and a sandbox that only ASKED is still removed — kept means a copy exists, not that a path was worked out", { sb, stderr: stderr.slice(-300) });
  }
  {
    // …and a store note counts for the copy it names IN THE SANDBOX. One naming a folder somewhere else — which exists — is
    // not a copy the sandbox holds, and removing the sandbox loses nothing.
    const a = runProbe("test-bare-note-store-inside.js", { mode: "note-store-inside", modParent: OUTSIDE }, bareEnv());
    const sbA = (a.rep && a.rep.sandbox) || "";
    ok(!!sbA && fs.existsSync(sbA) && /\[nova\] kept .*holds 1 store/.test(a.stderr), "THE CONTROL: a store noted inside the sandbox keeps it", { rep: a.rep, stderr: a.stderr.slice(-300) });
    const b = runProbe("test-bare-note-store-elsewhere.js", { mode: "note-store-elsewhere", modParent: OUTSIDE }, bareEnv());
    const sbB = (b.rep && b.rep.sandbox) || "";
    ok(!!sbB && (b.rep.files || []).filter((f) => f !== MARK).length === 1 && fs.existsSync(b.rep.at) && !inside(b.rep.at, sbB),
      "THE CONTROL: the same note, for a store in a folder elsewhere that exists, was written", b.rep);
    ok(!!sbB && !fs.existsSync(sbB) && !/\[nova\] kept /.test(b.stderr), "⭐⭐ …and keeps nothing: that sandbox holds no copy, and goes", { sbB, stderr: b.stderr.slice(-300) });
  }
  {
    // ⛔ THE RELEASE TAKES AWAY ONLY THE FOLDER THE GUARD MADE: named as mkdtemp names it, strictly inside the temp folder it
    // is handed. Asked directly, with folders of this test's own — what it is given to remove is the whole of its reach.
    const mk = (dir) => { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(path.join(dir, "kept.txt"), "x"); return dir; };
    const made = mk(path.join(CHILD_TMP, "nova-bare-release-control-a1b2c3"));
    const otherName = mk(path.join(CHILD_TMP, "someone-elses-folder"));
    const notInTemp = mk(path.join(OUTSIDE, "nova-bare-named-like-one-a1b2c3"));
    for (const d of [made, otherName, notInTemp]) sw.releaseBareTestSandbox(d, CHILD_TMP);
    ok(!fs.existsSync(made), "THE CONTROL: handed a folder named as the guard names its own, inside that temp folder, the release removes it");
    ok(fs.existsSync(path.join(otherName, "kept.txt")), "⭐⭐⭐ …a folder in temp under any other name is left alone");
    ok(fs.existsSync(path.join(notInTemp, "kept.txt")), "⭐⭐⭐ …and so is one named like it that is not in the temp folder");
  }
  {
    // ⛔ …AND A NOTE IS WRITTEN ONLY INTO SUCH A FOLDER. NOVA_BARE_SANDBOX is read by every process that loads safe-write.js —
    // the shipped app too — so a stray value must not make it drop a file wherever the variable points. A process whose
    // main is NOT a test (so it makes no sandbox of its own), handed each kind of folder, then a write outside temp.
    const dir = path.join(PROBES, "as-noter");
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, "main.js");
    fs.writeFileSync(file, "const sw = require(" + JSON.stringify(path.join(__dirname, "safe-write.js")) + ");\n"
      + "sw.noteBareRunRealWrite(\"write\", process.env.BARE_NOTE_SOURCE);\n"
      + "process.stdout.write(JSON.stringify({ sandbox: sw.BARE_TEST_SANDBOX }));\n");
    // #a-child-made-a-second-sandbox — a folder is a sandbox when it is named as mkdtemp names one AND carries the guard's mark:
    // the second, not the temp folder of whoever is asking, is what says the guard made it.
    ok(!!MARK, "THE CONTROL: safe-write.js names the mark it leaves in every sandbox it makes", MARK);
    const noted = (folder, marked) => {
      fs.mkdirSync(folder, { recursive: true });
      if (marked && MARK) fs.writeFileSync(path.join(folder, MARK), "{}\n");
      const r = spawnSync(process.execPath, [file], { cwd: dir, encoding: "utf8", timeout: 60000,
        env: bareEnv({ [sw.BARE_SANDBOX_VAR]: folder, BARE_NOTE_SOURCE: path.join(OUTSIDE, "a-mod", "common", "x.txt") }) });
      const files = walk(folder).map((p) => path.relative(folder, p)).filter((f) => f !== MARK);
      return { files, out: String(r.stdout || ""), err: String(r.stderr || "").slice(-300) };
    };
    const handed = noted(path.join(CHILD_TMP, "nova-bare-handed-down-a1b2c3"), true);
    ok(handed.files.length === 1 && /"sandbox":""/.test(handed.out),
      "THE CONTROL: handed a bare run's sandbox — named as the guard names it, with its mark — a process notes its write there", handed);
    const unmarked = noted(path.join(CHILD_TMP, "nova-bare-named-like-one-in-temp-a1b2c3"), false);
    ok(unmarked.files.length === 0 && /"sandbox":""/.test(unmarked.out),
      "⭐⭐⭐ handed a folder in temp NAMED like one but without the guard's mark, it writes nothing there", unmarked);
    const otherName = noted(path.join(CHILD_TMP, "not-a-sandbox"), false);
    ok(otherName.files.length === 0 && /"sandbox":""/.test(otherName.out), "⭐⭐⭐ handed a folder in temp that is not one, it writes nothing there", otherName);
    const notInTemp = noted(path.join(OUTSIDE, "nova-bare-stray-a1b2c3"), false);
    ok(notInTemp.files.length === 0 && /"sandbox":""/.test(notInTemp.out),
      "⭐⭐⭐ …nor into one named like it outside temp: a stray variable cannot make the app leave a file somewhere", notInTemp);
    // (in a folder of its own: what a run's sandbox sits in is that run's temp folder, and the source above is outside it)
    const elsewhere = noted(path.join(OUTSIDE, "another-temp-folder", "nova-bare-a-runs-sandbox-a1b2c3"), true);
    ok(elsewhere.files.length === 1 && /"sandbox":""/.test(elsewhere.out),
      "⭐⭐ …while the run's sandbox, with its mark, is noted into wherever this process's own temp folder is", elsewhere);
  }

  // ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  console.log("\nG. ⭐⭐⭐ a real test file, run bare on the fake machine, passes as it does under the runner and writes nothing there");
  {
    // A file that relies on its runner for every one of these folders, writes a backup AND a ~/.nova store, binds no port
    // and spawns nothing — so it is exactly the shape that leaked. THE CONTROL below proves it still writes both kinds; if
    // that stops being true, this section says so rather than passing on a file that never reached the real folders.
    const REAL = "test-a-tint-box-follows-the-ground.js";
    ok(fs.existsSync(path.join(__dirname, REAL)), "the representative test file exists", REAL);
    const sbC = path.join(CHILD_TMP, "control-sandbox");
    const ctl = spawnSync(process.execPath, [REAL], { cwd: __dirname, env: runnerEnv(sbC), encoding: "utf8", timeout: 300000 });
    const ctlFiles = walk(sbC).map((p) => path.relative(sbC, p));
    const lastLine = (s) => String(s || "").trim().split(/\r?\n/).filter(Boolean).pop() || "";
    ok(ctl.status === 0, "under the runner's env it passes", lastLine(ctl.stdout) || String(ctl.stderr || "").slice(-300));
    ok(ctlFiles.some((f) => f.split(path.sep).includes(BACKUPS_NAME)) && ctlFiles.some((f) => f.split(path.sep)[0] === ".nova"),
      "THE CONTROL: under the runner it writes a backup AND a ~/.nova store into the runner's sandbox", ctlFiles.slice(0, 12));
    const before = snapshot(FAKE_HOME);
    const leftBefore = fs.readdirSync(CHILD_TMP).filter((n) => /^nova-bare-/.test(n));
    const bare = spawnSync(process.execPath, [REAL], { cwd: __dirname, env: bareEnv(), encoding: "utf8", timeout: 300000 });
    const d = diff(before, snapshot(FAKE_HOME));
    ok(bare.status === 0 && lastLine(bare.stdout) === lastLine(ctl.stdout), "⭐⭐ run bare it passes, with the same summary",
      { bare: lastLine(bare.stdout), runner: lastLine(ctl.stdout), err: String(bare.stderr || "").slice(-300) });
    ok(clean(d), "⭐⭐⭐ …and wrote NOTHING into the fake machine's AppData, ~/.nova, Documents or HOI4 folder", d);
    ok(/\[nova\] test-a-tint-box-follows-the-ground\.js is running without its test runner/.test(bare.stderr || ""),
      "…because the guard engaged", String(bare.stderr || "").slice(0, 300));
    const leftAfter = fs.readdirSync(CHILD_TMP).filter((n) => /^nova-bare-/.test(n) && !leftBefore.includes(n));
    ok(!leftAfter.length, "…and took its sandbox away when it was done", leftAfter);
  }

  // ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  console.log("\nH. every test, and every test helper, that starts a node child loads safe-write.js before it does");
  {
    // A child's main is server.js, warm-child.js, a script the test wrote or `node -e` — never a test's name — so the guard
    // cannot engage IN it: it inherits the sandbox only if the process that spawned it made one first. So a file "starts"
    // one when a child-process call runs NODE (process.execPath, fork, a `node` command; directly or through a const),
    // WHATEVER it runs — a script written a line earlier, or a -e string, loads Nova in ways no scan can follow (review found
    // eight such files that the first form of this check passed, test-stdout-epipe-cannot-kill.js among them). Also when a
    // call names a shipped entry that reaches safe-write.js, or the file drives Electron through playwright's _electron.
    // DERIVED: the entries come from package.json through the require graph.
    //
    // Round two of review found ways past that, none used in the tree, all closed here: a child started through exec, a
    // destructured exec, npm, npx, electron, process.argv[0] or an alias of spawnSync was not seen as a start; a load
    // inside a function nobody calls, or behind a false `if`, counted as a load (in the file or in a helper it loads); and a child handed an env that was not
    // made from this process's own — `env: { PORT }` — or one with the guard's variables taken out got no sandbox at all.
    const entries = [...new Set([pkg.main, ...pkg.build.files.filter((f) => ROOT_JS.has(f))])].filter(loadsSafeWrite);
    const GUARD_KEYS = [...new Set([...Object.keys(sw.BARE_E2E_ENV), sw.BARE_SANDBOX_VAR])];     // DERIVED: what a child must inherit
    const CP_FNS = ["spawn", "spawnSync", "fork", "exec", "execSync", "execFile", "execFileSync"];
    const CP_REQ = "require\\(\\s*[\"'`](?:node:)?child_process[\"'`]\\s*\\)";
    const RUNS_NODE = /process\.execPath|process\.argv\s*\[\s*0\s*\]|process\.argv0|["'`](?:node|npm|npx|electron)(?:\.exe|\.cmd)?(?:["'`]|\s)/;
    const FROM_THIS_ENV = /\bprocess\.env\b(?!\s*[.[])/;       // the whole environment, not one variable read out of it
    const DECOY_HOME = (x) => /(?<![\w$.])USERPROFILE\s*:/.test(x) && /(?<![\w$.])HOME\s*:/.test(x);
    /** Is the require at `at` a statement of its own at the top of the file — not in a function, a block that may not run,
     *  or behind a condition? `bare` is the source with comments and every literal blanked. */
    const isTopLevel = (bare, at) => {
      // A block on its own (`{ … }` after a `;`, a `}` or another such block) always runs, so it is not a condition; every
      // other brace — a function's, an if's, a try's, an object's — and every bracket is.
      const stack = [];
      let stmt = 0, last = "";
      for (let i = 0; i < at; i++) {
        const c = bare[i];
        if (/\s/.test(c)) continue;
        if (c === "{") {
          const plain = (last === "" || last === ";" || last === "}" || last === "{") && stack.every((x) => x === "block");
          stack.push(plain ? "block" : "{");
          if (plain) stmt = i + 1;
        } else if (c === "(" || c === "[") stack.push(c);
        else if (c === "}" || c === ")" || c === "]") {
          const was = stack.pop();
          if (c === "}" && stack.every((x) => x === "block")) {
            let k = i + 1;
            while (k < at && /\s/.test(bare[k])) k++;
            if (was === "block" || bare[k] !== "=") stmt = i + 1;
          }
        } else if (c === ";" && stack.every((x) => x === "block")) stmt = i + 1;
        last = c;
      }
      return stack.every((x) => x === "block")
        && /^\s*(?:(?:const|let|var)\s+(?:[A-Za-z_$][\w$]*|\{[^{}=;]*\}|\[[^[\]=;]*\])\s*=\s*)?$/.test(bare.slice(stmt, at));
    };
    /** Where the expression starting at `from` ends: the `;` (or, for one option of an object, the `,`) at its own depth. */
    const exprEnd = (bare, from, stop) => {
      let depth = 0;
      for (let i = from; i < bare.length && i < from + 6000; i++) {
        const c = bare[i];
        if (c === "{" || c === "(" || c === "[") depth++;
        else if (c === "}" || c === ")" || c === "]") { if (--depth < 0) return i; }
        else if (c === stop && depth === 0) return i;
      }
      return Math.min(bare.length, from + 6000);
    };
    // …and the same all the way down: a module that reaches safe-write.js only through a require inside one of its own
    // functions has not loaded it by the time the next line of the file that required it runs. `read` is where a file's
    // source comes from — the disk, or a control's stand-in for one file.
    const _atLoad = new Map();
    const reachesAtLoad = (file, read, seen = new Set()) => {
      if (read === srcOf && _atLoad.has(file)) return _atLoad.get(file);
      if (seen.has(file)) return new Set();
      seen.add(file);
      const src = read(file), code = maskJsComments(src), bare = maskJsLiterals(src);
      const out = new Set();
      for (const d of directRequires(code)) {
        if (!isTopLevel(bare, d.at)) continue;
        out.add(d.name);
        for (const x of reachesAtLoad(d.name, read, seen)) out.add(x);
      }
      if (read === srcOf) _atLoad.set(file, out);
      return out;
    };
    const loadsAtLoad = (name, read) => name === "safe-write.js" || reachesAtLoad(name, read).has("safe-write.js");
    const analyse = (src, read = srcOf) => {
      const code = maskJsComments(src);      // strings kept: what a call NAMES is inside them
      const bare = maskJsLiterals(src);      // strings blanked too: a word or a brace left here is the code's own
      const consts = new Map();
      for (const m of code.matchAll(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*([^;\n]+)/g)) consts.set(m[1], m[2]);
      const namesEntry = (txt) => entries.some((e) => new RegExp("[\"'`/\\\\]" + esc(e.replace(/\.js$/, "")) + "(\\.js)?[\"'`]").test(txt));
      // child_process and its functions, by whatever names this file knows them
      const cpNames = [];
      for (const m of code.matchAll(new RegExp("\\b(?:const|let|var)\\s+([A-Za-z_$][\\w$]*)\\s*=\\s*" + CP_REQ + "\\s*(?=[;\\n]|$)", "g"))) cpNames.push(m[1]);
      const RECV = "(?:" + [CP_REQ, ...cpNames.map(esc)].join("|") + ")";
      const callable = new Map(CP_FNS.map((f) => [f, f]));   // local name -> the child_process function it is
      const imported = new Set();                            // names this file took out of child_process itself
      for (const m of code.matchAll(new RegExp("\\b(?:const|let|var)\\s+([A-Za-z_$][\\w$]*)\\s*=\\s*" + RECV + "\\s*\\.\\s*(" + CP_FNS.join("|") + ")\\b(?!\\s*\\()", "g"))) {
        callable.set(m[1], m[2]); imported.add(m[1]);
      }
      for (const m of code.matchAll(new RegExp("\\b(?:const|let|var)\\s*\\{([^}]*)\\}\\s*=\\s*" + RECV, "g"))) {
        for (const part of m[1].split(",")) {
          const r = /^\s*([A-Za-z_$][\w$]*)\s*(?::\s*([A-Za-z_$][\w$]*))?\s*$/.exec(part);
          if (r && CP_FNS.includes(r[1])) { callable.set(r[2] || r[1], r[1]); imported.add(r[2] || r[1]); }
        }
      }
      const recvRe = new RegExp(RECV + "\\s*\\.\\s*$");
      const calls = [];       // every call that starts a node child
      const re = new RegExp("(?<![\\w$])(" + [...callable.keys()].map(esc).join("|") + ")\\s*\\(", "g");
      let m;
      while ((m = re.exec(bare))) {
        const fn = callable.get(m[1]);
        const before = code.slice(Math.max(0, m.index - 80), m.index);
        const method = /\.\s*$/.test(before);
        // `x.exec(` is a regex's far more often than child_process's, and an alias is only ever called bare
        if (method && (fn === "exec" || !CP_FNS.includes(m[1])) && !recvRe.test(before)) continue;
        if (!method && fn === "exec" && !imported.has(m[1])) continue;
        if (/\bfunction\s*$/.test(before)) continue;
        let depth = 0, end = -1;
        for (let i = m.index + m[0].length - 1; i < bare.length; i++) {
          if (bare[i] === "(") depth++;
          else if (bare[i] === ")") { depth--; if (!depth) { end = i; break; } }
        }
        const stop = end < 0 ? Math.min(code.length, m.index + 400) : end + 1;
        let txt = code.slice(m.index, stop);
        for (const [k, v] of consts) if (new RegExp("\\b" + esc(k) + "\\b").test(txt)) txt += " " + v;
        if (fn === "fork" || RUNS_NODE.test(txt) || namesEntry(txt)) calls.push({ at: m.index, stop });
      }
      let startsAt = calls.length ? calls[0].at : -1;
      const el = /\b_electron\b/.exec(code);
      if (el && (startsAt < 0 || el.index < startsAt)) startsAt = el.index;
      const loads = directRequires(code).filter((d) => isTopLevel(bare, d.at) && loadsAtLoad(d.name, read)).map((d) => d.at);
      const loadsAt = loads.length ? Math.min(...loads) : -1;

      // ── the env each of those children is handed: made from this process's own, with none of the guard's variables gone ──
      const defs = new Map();   // name -> [{ at, text }]: what a const is made from, or a function's body
      const addDef = (n, at, text) => { if (!defs.has(n)) defs.set(n, []); defs.get(n).push({ at, text }); };
      for (const d of bare.matchAll(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*/g)) { const from = d.index + d[0].length; addDef(d[1], d.index, bare.slice(from, exprEnd(bare, from, ";"))); }
      for (const d of bare.matchAll(/\bfunction\s+([A-Za-z_$][\w$]*)\s*\(/g)) { const b = jsBodyAt(bare, d.index); if (b) addDef(d[1], -1, bare.slice(b[0], b[1] + 1)); }
      const defOf = (n, at) => { const l = (defs.get(n) || []).filter((d) => d.at < at); return l.length ? l[l.length - 1] : (defs.get(n) || [])[0] || null; };
      const textHas = (text, at, test, seen = new Set()) => {      // …or anything it is made from, followed by name
        if (test(text)) return true;
        for (const id of new Set(text.match(/[A-Za-z_$][\w$]*/g) || [])) {
          if (seen.has(id) || !defs.has(id)) continue;
          seen.add(id);
          const d = defOf(id, at);
          if (d && textHas(d.text, d.at < 0 ? at : d.at, test, seen)) return true;
        }
        return false;
      };
      const faults = [];
      for (const c of calls) {
        const e = /(?<![\w$.])env\s*(:|(?=\s*[,}]))/.exec(bare.slice(c.at, c.stop));
        if (!e) continue;                                           // no env option: the child inherits this process's
        let expr = "env";
        if (e[1] === ":") { const from = c.at + e.index + e[0].length; expr = bare.slice(from, exprEnd(bare, from, ",")); }
        if (!textHas(expr, c.at, (x) => FROM_THIS_ENV.test(x))) faults.push("hands a child an env that is not made from process.env: " + expr.trim().replace(/\s+/g, " ").slice(0, 60));
      }
      // A guard variable taken out of an env — by name, or by a loop over a list that names it. Only on a decoy machine (the
      // env names a USERPROFILE and a HOME of its own): there, what the missing variable falls back to is the decoy's.
      if (calls.length) {
        for (const d of bare.matchAll(/\bdelete\s+((?:[A-Za-z_$][\w$]*\s*\.\s*)*[A-Za-z_$][\w$]*)\s*(\.\s*([A-Za-z_$][\w$]*)|\[)/g)) {
          const obj = d[1].replace(/\s+/g, "");
          let keys = [];
          if (d[3]) keys = [d[3]];
          else {
            const open = d.index + d[0].length, close = bare.indexOf("]", open);
            const inner = code.slice(open, close < 0 ? open : close).trim();
            const lit = /^["'`]([^"'`]+)["'`]$/.exec(inner);
            if (lit) keys = [lit[1]];
            else {
              const head = code.slice(code.lastIndexOf("\n", d.index) + 1, d.index);
              const f = new RegExp("for\\s*\\(\\s*(?:const|let|var)\\s+" + esc(inner) + "\\s+of\\s+(\\[[^\\]]*\\]|[A-Za-z_$][\\w$]*)").exec(head);
              let list = f ? f[1] : "";
              if (list && list[0] !== "[") list = consts.get(list) || "";
              keys = [...list.matchAll(/["'`]([^"'`]+)["'`]/g)].map((x) => x[1]);
            }
          }
          const gone = keys.filter((k) => GUARD_KEYS.includes(k));
          if (!gone.length) continue;
          const dd = defOf(obj.split(".")[0], d.index);
          if (obj === "process.env" || !dd || !textHas(dd.text, dd.at < 0 ? d.index : dd.at, DECOY_HOME)) faults.push("takes " + gone.join(", ") + " out of " + obj + ", off a decoy machine");
        }
      }
      const loaded = startsAt < 0 || (loadsAt >= 0 && loadsAt < startsAt);
      return { starts: startsAt >= 0, ok: loaded && !faults.length, loaded, faults, startsAt, loadsAt };
    };
    // THE CONTROLS: the detector on shapes whose answer is known.
    const sp = 'const { spawn } = require("child_process");\nspawn(process.execPath, ["server.js"], { env: process.env });\n';
    const viaConst = 'const SERVER = path.join(__dirname, "server.js");\nconst cp = require("child_process");\ncp.spawnSync(process.execPath, [SERVER]);\n';
    const adopt = 'require("./safe-write.js");\n';
    ok(analyse(sp).starts && !analyse(sp).ok, "THE CONTROL: a test that spawns server.js and loads nothing is caught");
    ok(analyse(viaConst).starts && !analyse(viaConst).ok, "THE CONTROL: …and one that names it through a const");
    ok(analyse(adopt + sp).ok, "THE CONTROL: …and loading safe-write.js first clears it");
    ok(!analyse(sp + adopt).ok, "THE CONTROL: …but not when the load comes after the spawn");
    ok(analyse('const { createApp } = require("./server.js");\n' + sp).ok, "THE CONTROL: …and requiring server.js in-process clears it too");
    ok(analyse("const { _electron: electron } = require('playwright');\n").starts, "THE CONTROL: …and driving Electron counts as starting one");
    // …and the shapes the first two forms missed: the child loads Nova from text this file hands it, not from a name it
    // spells — and it is started through whichever door child_process has.
    const shapes = {
      "a -e string": 'const cp = require("child_process");\ncp.spawnSync(process.execPath, ["-e", "require(" + JSON.stringify(SW) + ")"]);\n',
      "a script it wrote": 'fs.writeFileSync(w, body);\nconst { spawnSync } = require("child_process");\nspawnSync(process.execPath, [w]);\n',
      "a fork": 'const { fork } = require("child_process");\nfork(path.join(dir, "child.js"));\n',
      "a node command": 'require("child_process").execSync("node " + JSON.stringify(w));\n',
      "node through a const": 'const NODE = process.execPath;\nconst { spawn } = require("child_process");\nspawn(NODE, [w]);\n',
      "child_process.exec": 'require("child_process").exec("node " + JSON.stringify(w));\n',
      "exec on a const holding child_process": 'const cp = require("child_process");\ncp.exec("node " + JSON.stringify(w));\n',
      "a destructured exec": 'const { exec } = require("child_process");\nexec("node " + JSON.stringify(w));\n',
      "npm": 'const { spawnSync } = require("child_process");\nspawnSync("npm", ["run", "desktop"]);\n',
      "npx electron": 'const { spawn } = require("child_process");\nspawn("npx", ["electron", "."]);\n',
      "the electron binary": 'const { spawn } = require("child_process");\nspawn(require("electron"), ["."]);\n',
      "process.argv[0]": 'const { spawn } = require("child_process");\nspawn(process.argv[0], [w]);\n',
      "an alias of spawnSync": 'const run = require("child_process").spawnSync;\nrun(process.execPath, [w]);\n',
      "a renamed spawnSync": 'const { spawnSync: run } = require("child_process");\nrun(process.execPath, [w]);\n',
    };
    for (const [label, s] of Object.entries(shapes)) {
      ok(analyse(s).starts && !analyse(s).ok && analyse(adopt + s).ok,
        "THE CONTROL: a node child started from " + label + " is caught, and cleared by loading safe-write.js first");
    }
    ok(!analyse('require("child_process").spawnSync("git", ["status"]);\n').starts, "THE CONTROL: …while a child that is not node is not a start");
    ok(!analyse('const m = /node (x)/.exec("node thing");\nconst re = /a/;\nre.exec("node b");\n').starts, "THE CONTROL: …nor is a regex's exec");
    ok(!analyse('function exec(s) { return s; }\nexec("node x");\n').starts, "THE CONTROL: …nor a function of the file's own that happens to be called exec");
    // A load that may never run is not a load.
    const notLoads = {
      "inside a function nobody calls": 'function never() { require("./safe-write.js"); }\n',
      "behind a false if": 'if (false) { require("./safe-write.js"); }\n',
      "behind an if with no braces": 'if (false) require("./safe-write.js");\n',
      "behind &&": 'const x = false && require("./safe-write.js");\n',
      "inside a try": 'try { require("./safe-write.js"); } catch (_) {}\n',
      "inside an arrow function": 'const load = () => require("./safe-write.js");\n',
    };
    for (const [label, s] of Object.entries(notLoads)) {
      ok(!analyse(s + sp).ok && analyse(adopt + s + sp).ok, "THE CONTROL: a load " + label + " does not clear it — one at the top of the file does", analyse(s + sp));
    }
    ok(analyse('"use strict";\nconst fs = require("fs");\n{\n  const md = require("./map-data.js");\n  md.x();\n}\n' + sp).ok,
      "THE CONTROL: …while a load in a plain block, which always runs, does");
    ok(analyse('function f() { return 1; }\nconst sw = require("./safe-write.js");\n' + sp).ok, "THE CONTROL: …and so does one after a function's own braces have closed");
    {
      // …and through a helper: the helper's own require of safe-write.js must run when the helper loads.
      const viaHelper = 'const md = require("./map-data.js");\n' + sp;
      const lazyHelper = (f) => (f === "map-data.js" ? '"use strict";\nfunction later() { return require("./safe-write.js"); }\nmodule.exports = { later };\n' : srcOf(f));
      ok(analyse(viaHelper).ok, "THE CONTROL: a test that loads map-data.js first is cleared — map-data.js loads safe-write.js as it loads");
      ok(!analyse(viaHelper, lazyHelper).ok && !analyse(viaHelper, lazyHelper).loaded,
        "THE CONTROL: …and would not be if map-data.js only loaded it inside a function of its own", analyse(viaHelper, lazyHelper));
    }
    // The env a child is handed.
    const withEnv = (s) => adopt + 'const { spawn } = require("child_process");\n' + s;
    const envs = {
      "only a PORT": ['spawn(process.execPath, ["server.js"], { env: { PORT: String(port) } });\n', false],
      "a const made of single variables": ['const env = { PORT: String(port), PATH: process.env.PATH };\nspawn(process.execPath, ["server.js"], { env });\n', false],
      "process.env itself": ['spawn(process.execPath, ["server.js"], { env: process.env });\n', true],
      "a spread of process.env": ['spawn(process.execPath, ["server.js"], { cwd: d, env: { ...process.env, PORT: String(port) }, stdio: "ignore" });\n', true],
      "Object.assign over process.env": ['spawn(process.execPath, ["server.js"], { env: Object.assign({}, process.env, { PORT: String(port) }) });\n', true],
      "a const made from process.env": ['const childEnv = Object.assign({}, process.env, { A: 1 });\nspawn(process.execPath, ["server.js"], { env: Object.assign({}, childEnv, { PORT: "1" }) });\n', true],
      "the shorthand": ['const env = { ...process.env, A: 1 };\nspawn(process.execPath, ["server.js"], { env, cwd: d });\n', true],
      "a function that builds it from process.env": ['function bareEnv(x) { const e = Object.assign({}, process.env); return Object.assign(e, x); }\nspawn(process.execPath, ["server.js"], { env: bareEnv({ A: 1 }) });\n', true],
      "no env option at all": ['spawn(process.execPath, ["server.js"], { cwd: d });\n', true],
      "one of the guard's variables deleted by name": ['const env = { ...process.env };\ndelete env.' + GUARD_KEYS[0] + ';\nspawn(process.execPath, [w], { env });\n', false],
      "one deleted by a quoted name": ['const env = { ...process.env };\ndelete env["' + GUARD_KEYS[1] + '"];\nspawn(process.execPath, [w], { env });\n', false],
      "every one deleted in a loop": ['const env = { ...process.env };\nfor (const k of ' + JSON.stringify(GUARD_KEYS) + ') delete env[k];\nspawn(process.execPath, [w], { env });\n', false],
      "one deleted through a named list": ['const GONE = ["' + GUARD_KEYS[2] + '", "X"];\nconst env = { ...process.env };\nfor (const k of GONE) delete env[k];\nspawn(process.execPath, [w], { env });\n', false],
      "one deleted from process.env itself": ['delete process.env.' + GUARD_KEYS[3] + ';\nspawn(process.execPath, [w]);\n', false],
      "the same deletion on a decoy machine": ['const env = { ...process.env, USERPROFILE: decoy, HOME: decoy };\nfor (const k of ' + JSON.stringify(GUARD_KEYS.slice(0, 2)) + ') delete env[k];\nspawn(process.execPath, [w], { env });\n', true],
      "a deleted variable that is not the guard's": ['const env = { ...process.env };\ndelete env.NODE_OPTIONS;\nfor (const k of ["OneDriveConsumer"]) delete env[k];\nspawn(process.execPath, [w], { env });\n', true],
    };
    ok(GUARD_KEYS.length >= 7, "THE CONTROL: the variables a child must inherit are read out of safe-write.js", GUARD_KEYS);
    for (const [label, [s, fine]] of Object.entries(envs)) {
      const a = analyse(withEnv(s));
      ok(a.starts && a.loaded && a.ok === fine, "THE CONTROL: a child handed " + label + " is " + (fine ? "cleared" : "caught"), a);
    }
    const files = fs.readdirSync(__dirname).filter((f) => /^(test|e2e|testlib)-.*\.js$/.test(f)).sort();
    const starters = files.map((f) => Object.assign({ f }, analyse(srcOf(f)))).filter((x) => x.starts);
    const onlyAdopted = starters.filter((x) => x.ok && !directRequires(codeOf(x.f)).some((d) => d.name !== "safe-write.js" && loadsSafeWrite(d.name)));
    ok(starters.length >= 5 && onlyAdopted.length >= 1,
      "THE CONTROL: the scan finds the files that start one, including ones sandboxed only by loading safe-write.js",
      { starters: starters.length, onlyAdopted: onlyAdopted.map((x) => x.f).slice(0, 5) });
    const bad = starters.filter((x) => !x.loaded).map((x) => x.f);
    ok(!bad.length, "⭐⭐⭐ every one of them loads safe-write.js before it starts the child, at the top of the file",
      { bad, hint: "add require(\"./safe-write.js\") above the first require, so a bare run's sandbox is in the env the child inherits" });
    const badEnv = starters.filter((x) => x.faults.length).map((x) => ({ f: x.f, why: x.faults }));
    ok(!badEnv.length, "⭐⭐⭐ …and hands it an env made from its own, with none of the guard's variables taken out (but on a decoy machine)",
      { badEnv, hint: "build the child's env from process.env — { ...process.env, PORT } — so the sandbox this process was given reaches it" });
  }

  // ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  console.log("\nI. ⭐⭐⭐ a live-app test run bare drives a server of its own — never the app's own port, where the owner's Nova is");
  {
    // run-tests.js starts its own sandboxed server for the live-app tests and names it in the environment. Run bare, they fell
    // back to the app's own port — the owner's open Nova, whose AppData is the real one: review measured 6 fixture backups
    // and 13 cache files filed there by one bare run, with the guard silent, because the writes happen in THAT process.
    // DERIVED: the files are whatever the runner's own detector picks, and the port is server.js's DEFAULT_PORT.
    const runnerSrc = fs.readFileSync(path.join(__dirname, "run-tests.js"), "utf8");
    const reSrc = (/\/((?:[^/\\\n]|\\.)+)\/\.test\(stripJsComments/.exec(runnerSrc) || [])[1];
    const appPort = Number((/const DEFAULT_PORT = (\d{4,5})/.exec(fs.readFileSync(path.join(__dirname, "server.js"), "utf8")) || [])[1] || 0);
    ok(!!reSrc && appPort > 0, "THE CONTROL: the runner's live-test detector and the app's own port are read out of the source", { reSrc, appPort });
    const LIVE_RE = new RegExp(reSrc || "(?!)");
    const REP = "test-research-modifier-depth.js";   // the one that needs no browser: it drives the server over plain HTTP
    const live = fs.readdirSync(__dirname).filter((f) => /^test-.*\.js$/.test(f) && f !== path.basename(__filename))
      .filter((f) => LIVE_RE.test(codeOf(f))).sort();
    ok(live.length >= 10 && live.includes(REP), "THE CONTROL: …and it picks the live-app tests, the representative among them", live);
    const fallbackRe = new RegExp(esc(LIVE_PORT_VAR) + "\\s*\\|\\|\\s*([1-9]\\d*)");
    const appPortRe = new RegExp("(^|\\D)" + appPort + "(?!\\d)");
    const offenders = live.map((f) => {
      const c = codeOf(f), m = fallbackRe.exec(c);
      return { f, fallsBackTo: m ? m[1] : "", namesTheAppsPort: appPortRe.test(c), sandboxed: directRequires(c).some((d) => loadsSafeWrite(d.name)) };
    }).filter((x) => x.fallsBackTo || x.namesTheAppsPort || !x.sandboxed);
    ok(!offenders.length, "⭐⭐⭐ no live-app test falls back to a port of its own, names the app's, or runs without the sandbox", offenders);

    // ⭐⭐ THE PORT THAT SERVER TAKES. "Whatever the OS picks" (listen on 0) is picked from the range Windows hands out,
    // which is where two hundred tests pin a port of their own and where every outbound connection on the machine takes
    // one: review saw such servers on 50565 and 50067. It comes from a band of its own now, below that range, which no test
    // claims, and is probed before use.
    // DERIVED: the ports the test files claim (read as the runner reads a claim), the runner's own server's, the app's, and
    // where this machine's dynamic range begins.
    const band = liveLib.OWN_SERVER_BAND;
    const claims = new Map();      // port -> the files that claim it
    for (const f of fs.readdirSync(__dirname).filter((x) => /^(test|e2e)-.*\.js$/.test(x))) {
      const c = codeOf(f);
      const mine = [...c.matchAll(/[Pp][Oo][Rr][Tt]\w*\s*=\s*(\d{4,5})\b/g), ...c.matchAll(/\.listen\(\s*(\d{4,5})/g)].map((m) => Number(m[1]));
      for (const p of new Set(mine)) { if (!claims.has(p)) claims.set(p, []); claims.get(p).push(f); }
    }
    const runnerPort = Number((/let LIVE_PORT = LIVE_PORT_EXPLICIT \|\| (\d{4,5})/.exec(runnerSrc) || [])[1] || 0);
    const dynamicFrom = (() => {
      if (process.platform !== "win32") return 49152;
      const r = spawnSync("netsh", ["int", "ipv4", "show", "dynamicport", "tcp"], { encoding: "utf8", windowsHide: true, timeout: 20000 });
      return Number((/Start Port\s*:\s*(\d+)/.exec(String(r.stdout || "")) || [])[1] || 49152);
    })();
    ok(claims.size >= 100 && runnerPort > 0 && dynamicFrom >= 1024,
      "THE CONTROL: the ports the suite claims, the runner's own server's and the start of the dynamic range are read, not typed",
      { claimed: claims.size, runnerPort, dynamicFrom });
    ok(!!band && Number.isInteger(band.from) && Number.isInteger(band.to) && band.from > 1024 && band.from < band.to,
      "THE CONTROL: testlib-live-server.js names the band its own server's port comes from", band);
    const inBand = (p) => p >= band.from && p <= band.to;
    ok(band.to < dynamicFrom, "⭐⭐⭐ that band ends below the range Windows hands out", { band, dynamicFrom });
    const claimedInBand = [...claims.keys()].filter(inBand).map((p) => ({ port: p, by: claims.get(p) }));
    ok(!claimedInBand.length, "⭐⭐⭐ …no test claims a port inside it", { band, claimedInBand, hint: "pick another port for the test: this band is the bare live-app server's" });
    ok(!inBand(runnerPort) && !inBand(appPort), "⭐⭐ …and it holds neither the runner's own server's port nor the app's", { band, runnerPort, appPort });
    ok(!/\.listen\(\s*0\s*[,)]/.test(codeOf("testlib-live-server.js")), "⭐⭐ …and the helper no longer asks the OS for any port at all (listen on 0)");
    {
      // PROBED, NOT ASSUMED: with the first port of a two-port band held by someone else, the picker hands out the second.
      const picker = path.join(PROBES, "pick-a-port.js");
      fs.writeFileSync(picker, [
        '"use strict";',
        'const net = require("net");',
        "const { freePortInBand, OWN_SERVER_BAND: B } = require(" + JSON.stringify(path.join(__dirname, "testlib-live-server.js")) + ");",
        "(async () => {",
        '  const hold = (p) => new Promise((res) => { const s = net.createServer(); s.once("error", () => res(null)); s.listen(p, "127.0.0.1", () => res(s)); });',
        "  let held = null, first = 0;",
        // two neighbours that are both free right now: the first is then held here, the second left for the picker
        "  for (let p = B.from; p < B.to && !held; p++) {",
        "    const s = await hold(p);",
        "    if (!s) continue;",
        "    if (await freePortInBand({ from: p + 1, to: p + 1 })) { held = s; first = p; } else await new Promise((res) => s.close(res));",
        "  }",
        "  const out = { first, whenFree: 0, whenHeld: 0 };",
        "  if (held) {",
        "    out.whenHeld = await freePortInBand({ from: first, to: first + 1 }, { start: 0 });",
        "    await new Promise((res) => held.close(res));",
        "    out.whenFree = await freePortInBand({ from: first, to: first + 1 }, { start: 0 });",
        "  }",
        "  process.stdout.write(JSON.stringify(out));",
        "})();",
      ].join("\n"));
      const r = spawnSync(process.execPath, [picker], { cwd: PROBES, env: bareEnv(), encoding: "utf8", timeout: 60000 });
      let o = null;
      try { o = JSON.parse(r.stdout); } catch (_) { o = { raw: String(r.stdout || "") + String(r.stderr || "") }; }
      ok(!!o && o.first >= band.from && o.whenFree === o.first, "THE CONTROL: with its first port free, the picker hands that one out", o);
      ok(!!o && o.first >= band.from && o.whenHeld === o.first + 1, "⭐⭐ …and with it held by someone else, the next: probed, not assumed", o);
    }

    // ⭐⭐⭐ THE BOOT. #a-live-test-waits-for-the-page-not-for-the-clock — a server a bare test started is COLD: the catalogue
    // takes 40 s, and the page goes on drawing for seconds after it arrives. Every browser test among these waited for
    // allTechs and then a fixed 2.5 s, which a warm server made look like enough; cold, 4 of the 11 failed for timing. They
    // now open the page through ONE helper that waits for what the page shows. The proof that it holds is a run — every
    // one of them, bare, cold, twice — which is too slow for here (90 s each); this keeps a fixed wait from coming back.
    const browserLive = live.filter((f) => /\bchromium\b/.test(codeOf(f)));
    const bootFaults = (code) => {
      const out = [];
      if (!/\bopenResearchPage\s*\(/.test(code)) out.push("does not open the page through openResearchPage");
      if (/\.goto\s*\(/.test(code)) out.push("navigates by itself (.goto)");
      for (const m of code.matchAll(/\.reload\s*\(/g)) {
        const rest = code.slice(m.index, m.index + 600);
        if (!/^[^;]*;\s*(?:await\s+)?researchPageReady\s*\(/.test(rest)) out.push("reloads without waiting for the page (researchPageReady)");
      }
      if (/waitForFunction\(\s*\(\)\s*=>\s*window\.allTechs/.test(code)) out.push("waits for allTechs, which is set before the page is drawn");
      return out;
    };
    const oldBoot = 'await p.goto(`http://localhost:${PORT}/research.html`, { waitUntil: "domcontentloaded" });\n'
      + 'await p.evaluate((m) => localStorage.setItem("activeModPath", m), MOD);\nawait p.reload({ waitUntil: "domcontentloaded" });\n'
      + "await p.waitForFunction(() => window.allTechs && window.allTechs.length > 0, null, { timeout: 150000 });\nawait p.waitForTimeout(2500);\n";
    const newBoot = "await openResearchPage(p, `http://localhost:${PORT}`, MOD);\n";
    ok(bootFaults(oldBoot).length === 4, "THE CONTROL: the boot they all had — open, store the mod, reload, wait for allTechs, wait 2.5 s — is caught", bootFaults(oldBoot));
    ok(!bootFaults(newBoot).length, "THE CONTROL: …and opening the page through the helper clears it");
    ok(!bootFaults(newBoot + 'await p.reload({ waitUntil: "domcontentloaded" });\nawait researchPageReady(p);\n').length
      && bootFaults(newBoot + 'await p.reload({ waitUntil: "domcontentloaded" });\nawait p.waitForTimeout(2500);\n').length === 1,
      "THE CONTROL: …a later reload is fine when the page is waited for again, and caught when a delay is");
    ok(browserLive.length >= 9 && !browserLive.includes(REP), "THE CONTROL: the live-app tests that drive a browser are picked out of the source", browserLive);
    const slowBoots = browserLive.map((f) => ({ f, why: bootFaults(codeOf(f)) })).filter((x) => x.why.length);
    ok(!slowBoots.length, "⭐⭐⭐ every live-app browser test opens the research page through the helper that waits for it to be ready", slowBoots);
    const lib = maskJsLiterals(srcOf("testlib-live-server.js"));
    const bodyOf = (name) => { const at = lib.indexOf("async function " + name + "("); const b = at < 0 ? null : jsBodyAt(lib, at); return b ? lib.slice(b[0], b[1] + 1) : ""; };
    const helper = bodyOf("openResearchPage") + bodyOf("researchPageReady");
    ok(helper.length > 200 && /\bresearchPageReady\s*\(/.test(bodyOf("openResearchPage")) && !/\bwaitForTimeout\b/.test(helper) && !/\.reload\s*\(/.test(helper),
      "⭐⭐ …and the helper itself waits for a state — no fixed delay, and no second boot of the page", helper.length);
    {
      // ⭐⭐ WHAT "READY" MEANS, asked of the helper itself with a stand-in for the page: what the page shows and which
      // of its requests are still out are handed over, so each condition is tried alone and a warm or a cold server does
      // not come into it. The last one is the one a cold run found: with the labels drawn, the server was still working
      // through a hundred icons, the one request the page makes when a tech is selected waited behind them, and the
      // loading overlay went up over the test's next drag.
      const probe = path.join(PROBES, "ready-or-not.js");
      fs.writeFileSync(probe, [
        '"use strict";',
        "const { researchPageReady, openResearchPage } = require(" + JSON.stringify(path.join(__dirname, "testlib-live-server.js")) + ");",
        "const READY = { overlayUp: false, nodes: 102, labels: 13, glyphsPending: 0 };",
        "const stand = (shows) => { const h = {}; return { shows, on: (ev, fn) => { (h[ev] = h[ev] || []).push(fn); },",
        "  say: (ev, x) => (h[ev] || []).forEach((fn) => fn(x)), evaluate: async function () { return Object.assign({}, this.shows); } }; };",
        "const ask = async (page) => { const t = Date.now();",
        "  try { await researchPageReady(page, { timeoutMs: 900, settleMs: 150 }); return { ready: true, ms: Date.now() - t }; }",
        "  catch (e) { return { ready: false, ms: Date.now() - t, why: String(e && e.message) }; } };",
        "(async () => {",
        "  const out = {};",
        "  out.ready = await ask(stand(READY));",
        "  out.overlayUp = await ask(stand(Object.assign({}, READY, { overlayUp: true })));",
        "  out.fewNodes = await ask(stand(Object.assign({}, READY, { nodes: 3 })));",
        "  out.glyphPending = await ask(stand(Object.assign({}, READY, { glyphsPending: 1 })));",
        // one request out for the whole wait; then the same page once it has come back
        '  const p = stand(READY), req = { url: () => "http://127.0.0.1:1/api/icon-image?key=GFX_x" };',
        '  const first = ask(p); p.say("request", req);',
        "  out.requestOut = await first;",
        '  p.say("requestfinished", req);',
        "  out.requestBack = await ask(p);",
        // one that fails part-way through the wait
        '  const q = stand(READY), req2 = { url: () => "http://127.0.0.1:1/x" };',
        '  const second = ask(q); q.say("request", req2); setTimeout(() => q.say("requestfailed", req2), 300);',
        "  out.requestFailedLater = await second;",
        // more drawn part-way through the settle
        "  const d = stand(READY); const third = ask(d); setTimeout(() => { d.shows = Object.assign({}, READY, { labels: 14 }); }, 100);",
        "  out.drawnMore = await third;",
        // opened through the helper: the page asks for its catalogue while it is being navigated to, before any wait begins
        '  const viaOpen = async (answered) => { const pg = stand(READY), rq = { url: () => "http://127.0.0.1:1/api/technologies/catalog?modPath=x" };',
        '    pg.addInitScript = async () => {}; pg.goto = async () => { pg.say("request", rq); if (answered) pg.say("requestfinished", rq); };',
        "    const t = Date.now();",
        '    try { await openResearchPage(pg, "http://127.0.0.1:1", "x", { timeoutMs: 1500 }); return { ready: true, ms: Date.now() - t }; }',
        "    catch (e) { return { ready: false, ms: Date.now() - t, why: String(e && e.message) }; } };",
        "  out.askedWhileOpening = await viaOpen(false);",
        "  out.answeredWhileOpening = await viaOpen(true);",
        // #a-slow-page-is-not-a-stuck-page: one request out and nothing else moving — given up on at the stall, well short
        // of the timeout; and a page answering an icon every 250 ms while it asks for the next — waited for past the stall
        "  const askS = async (page, o) => { const t = Date.now(); try { await researchPageReady(page, o); return { ready: true, ms: Date.now() - t }; }",
        "    catch (e) { return { ready: false, ms: Date.now() - t, why: String(e && e.message) }; } };",
        '  const st = stand(READY), rq3 = { url: () => "http://127.0.0.1:1/api/icon-image?key=GFX_stuck" };',
        "  const stuck = askS(st, { timeoutMs: 8000, settleMs: 150, stallMs: 600 }); st.say(\"request\", rq3);",
        "  out.stuck = await stuck;",
        "  const sl = stand(READY), rqs = []; let n = 0;",
        "  const next = () => { const k = n++, r = { url: () => \"http://127.0.0.1:1/api/icon-image?key=GFX_\" + k }; rqs.push(r); sl.say(\"request\", r); };",
        "  const slow = askS(sl, { timeoutMs: 8000, settleMs: 150, stallMs: 600 }); next();",
        "  const tick = setInterval(() => { if (n < 8) next(); if (rqs.length) sl.say(\"requestfinished\", rqs.shift());",
        "    if (!rqs.length) clearInterval(tick); }, 250);",
        "  out.slowButMoving = await slow;",
        "  process.stdout.write(JSON.stringify(out));",
        "})();",
      ].join("\n"));
      const r = spawnSync(process.execPath, [probe], { cwd: PROBES, env: bareEnv(), encoding: "utf8", timeout: 60000 });
      let o = null;
      try { o = JSON.parse(r.stdout); } catch (_) { o = null; }
      const got = (k) => (o && o[k]) || {};
      ok(!!o && got("ready").ready === true && got("ready").ms >= 150, "THE CONTROL: a page that shows all of it, with nothing out, is ready — once it has held for the settle",
        o || String(r.stdout || "") + String(r.stderr || "").slice(-400));
      ok(!!o && got("overlayUp").ready === false, "⭐⭐ …it is not ready with the loading overlay up", got("overlayUp"));
      ok(!!o && got("fewNodes").ready === false, "⭐⭐ …nor before its tech nodes are drawn", got("fewNodes"));
      ok(!!o && got("glyphPending").ready === false, "⭐⭐ …nor with a section label's glyph still loading", got("glyphPending"));
      ok(!!o && got("requestOut").ready === false && /still out: \/api\/icon-image\?key=GFX_x/.test(got("requestOut").why || ""),
        "⭐⭐⭐ …nor while a request of the page's is still out — and it says which one it waited for", got("requestOut"));
      ok(!!o && got("requestBack").ready === true, "THE CONTROL: …and it is, once that request has come back", got("requestBack"));
      ok(!!o && got("requestFailedLater").ready === true && got("requestFailedLater").ms >= 300, "…or has failed: it waits for that, then for the settle", got("requestFailedLater"));
      ok(!!o && got("drawnMore").ready === true && got("drawnMore").ms >= 240, "⭐ …and the settle starts again when more is drawn during it", got("drawnMore"));
      ok(!!o && got("askedWhileOpening").ready === false && /still out: \/api\/technologies\/catalog/.test(got("askedWhileOpening").why || ""),
        "⭐⭐ …and what the page asked for while it was being opened counts too: the helper listens from before it navigates", got("askedWhileOpening"));
      ok(!!o && got("answeredWhileOpening").ready === true, "THE CONTROL: …opened the same way with that request answered, it is ready", got("answeredWhileOpening"));
      ok(!!o && got("stuck").ready === false && got("stuck").ms < 3000 && /nothing drawn, loaded or answered for 1s/.test(got("stuck").why || ""),
        "⭐⭐ a page that has stopped getting anywhere is given up on at the stall, long before its timeout, and says so", got("stuck"));
      ok(!!o && got("slowButMoving").ready === true && got("slowButMoving").ms >= 1800,
        "⭐⭐⭐ …but one still answering its icons one by one is waited for past the stall — a slow page is not a stuck one", got("slowButMoving"));
    }

    // ⭐⭐⭐ BY RUNNING IT: the representative, bare on the fake machine, behind a fence (-r) that records every port the test
    // process dials and REFUSES the app's own before a byte is sent — so even a file that still dials it never reaches a Nova
    // the owner has open. It must RUN, not skip, against a server it started in its own sandbox, and leave the fake machine
    // exactly as it was.
    const fence = path.join(PROBES, "fence-the-apps-port.js");
    const fenceLog = path.join(SCRATCH, "fence-the-apps-port.log");
    fs.writeFileSync(fence, [
      '"use strict";',
      'const fs = require("fs"), net = require("net");',
      "const LOG = process.env.BARE_FENCE_LOG, REFUSE = Number(process.env.BARE_FENCE_REFUSE);",
      'fs.appendFileSync(LOG, "loaded" + String.fromCharCode(10));',
      "const connect = net.Socket.prototype.connect;",
      "net.Socket.prototype.connect = function (...args) {",
      "  let o = args[0];",
      "  if (Array.isArray(o)) o = o[0];",
      '  const port = Number(o && typeof o === "object" ? o.port : o);',
      "  if (Number.isFinite(port) && port > 0) {",
      '    try { fs.appendFileSync(LOG, "dial " + port + String.fromCharCode(10)); } catch (_) {}',
      "    if (port === REFUSE) {",
      '      const err = Object.assign(new Error("connect ECONNREFUSED: fenced, the app\'s own port"), { code: "ECONNREFUSED" });',
      "      process.nextTick(() => this.destroy(err));",
      "      return this;",
      "    }",
      "  }",
      "  return connect.apply(this, args);",
      "};",
    ].join("\n"));
    const before = snapshot(FAKE_HOME);
    const leftBefore = fs.readdirSync(CHILD_TMP).filter((n) => /^nova-bare-/.test(n));
    const env = bareEnv({ BARE_FENCE_LOG: fenceLog, BARE_FENCE_REFUSE: String(appPort) });
    const r = spawnSync(process.execPath, ["-r", fence, REP], { cwd: __dirname, env, encoding: "utf8", timeout: 400000 });
    let log = "";
    try { log = fs.readFileSync(fenceLog, "utf8"); } catch (_) { log = ""; }
    const dials = [...log.matchAll(/^dial (\d+)$/gm)].map((x) => Number(x[1]));
    const out = String(r.stdout || ""), err = String(r.stderr || "");
    ok(/^loaded$/m.test(log), "THE CONTROL: the fence was loaded ahead of the test", log.slice(0, 200));
    ok(r.status === 0 && /checks passed/.test(out) && !/SKIPPED/.test(out),
      "⭐⭐⭐ run bare, it RAN rather than skipping — against a server it started itself", { status: r.status, out: out.slice(-400), err: err.slice(-600) });
    ok(dials.length > 0 && !dials.includes(appPort), "⭐⭐⭐ …and never dialled the app's own port", { dials: [...new Set(dials)], appPort });
    ok(new RegExp("\\[nova\\] " + esc(REP) + " is running without its test runner").test(err), "…from inside the sandbox the guard made", err.slice(0, 300));
    ok(/no server was named, so it drives one of its own on 127\.0\.0\.1:\d+, in its sandbox/.test(err),
      "…and it said it started a server of its own", err.slice(0, 600));
    const ownPort = Number((/drives one of its own on 127\.0\.0\.1:(\d+)/.exec(err) || [])[1] || 0);
    ok(inBand(ownPort) && dials.includes(ownPort), "⭐⭐ …on a port out of that band, which is the one it then dialled", { ownPort, band, dials: [...new Set(dials)] });
    const d = diff(before, snapshot(FAKE_HOME));
    ok(clean(d), "⭐⭐⭐ …and wrote NOTHING into the fake machine: the server it drove was the sandboxed one", d);
    const leftAfter = fs.readdirSync(CHILD_TMP).filter((n) => /^nova-bare-/.test(n) && !leftBefore.includes(n));
    ok(!leftAfter.length, "…and its server was stopped and its sandbox taken away at exit", leftAfter);
    {
      // ⭐⭐ WHAT THAT SERVER COPIES OF A MOD OUTSIDE TEMP KEEPS THE SANDBOX. A probe shaped like a live-app test — its own
      // server, over HTTP — asks for a baseline of a mod outside temp. The server copies the mod's map files into the
      // sandbox's ~/.nova: no pool backup, no write into the mod, and none of it in the test's own process. Only the note
      // the SERVER leaves, in the sandbox the environment names to it, can keep that copy from going with the sandbox.
      const { rep, stderr } = runProbe("test-bare-live-store.js", { mode: "live-store", modParent: OUTSIDE },
        bareEnv({ BARE_FENCE_LOG: fenceLog, BARE_FENCE_REFUSE: String(appPort) }), ["-r", fence]);
      const sb = (rep && rep.sandbox) || "";
      const saved = (rep && rep.saved) || {};
      ok(!!sb && inBand(rep.port) && saved.ok === true && inside(saved.at, sb),
        "THE CONTROL: a bare probe's own server saved a baseline of a mod outside temp, into the sandbox's ~/.nova", { rep, stderr: stderr.slice(-400) });
      const pool = inside(rep && rep.BACKUP_DIR, sb) ? walk(rep.BACKUP_DIR) : [];
      ok(!!sb && !pool.length, "THE CONTROL: …with no pool backup that would have kept the sandbox anyway", pool.map((f) => path.basename(f)));
      ok(!!sb && fs.existsSync(sb) && !!saved.at && fs.existsSync(saved.at), "⭐⭐⭐ …and the sandbox is KEPT, with that baseline in it", { sb, files: rep && rep.files });
      ok(/\[nova\] kept .*holds 1 store/.test(stderr) && stderr.includes(sb), "…for the store its SERVER noted", stderr.slice(-400));
    }
    {
      // ⭐⭐ …AND THAT SERVER DOES NOT WARM ITS OWN CACHES IN THE PROCESS THAT ANSWERS. `node server.js` begins a warm 1.5 s
      // after it listens — for the folder it calls its active mod, not the one a test opens — and on a fresh sandbox, which
      // a bare run's always is, that ran for 82 s with a small request taking up to 8.7 s: the page's loading overlay went
      // up over the test's next click, and the undo test failed 4 cold runs in 5. The shipped app never warms in the
      // process that serves its pages (main.js: deferWarm, and warm-child.js), and neither does a bare test's server now.
      const { rep, stderr } = runProbe("test-bare-live-no-warm.js", { mode: "live-no-warm" },
        bareEnv({ BARE_FENCE_LOG: fenceLog, BARE_FENCE_REFUSE: String(appPort) }), ["-r", fence]);
      const plain = (rep && rep.plain) || {}, own = (rep && rep.own) || {};
      ok(!!rep && inBand(plain.port) && plain.maps >= 1 && rep.cleared === true,
        "THE CONTROL: server.js started on its own warms at once — the game's names are on disk moments later, and nobody asked for one", { rep, stderr: stderr.slice(-300) });
      ok(!!rep && inBand(rep.port) && own.maps === 0 && own.waitedMs >= 2 * plain.ms,
        "⭐⭐⭐ the server a bare live-app test starts does not: given twice that long, it has warmed nothing", { rep, stderr: stderr.slice(-300) });
    }
    {
      // …AND NEITHER DOES THE RUNNER'S. run-tests.js starts one server for every live-app test of a run, and it started it as
      // `node server.js` — so a live test scheduled inside the run's first minute met exactly that warm. It is started the way
      // a bare test's is: testlib-live-server.js's own serve-as-the-app-does child.
      const runner = codeOf("run-tests.js");
      const at = runner.indexOf("function startOwnLiveServer(");
      const b = at < 0 ? null : jsBodyAt(runner, at);
      const body = b ? runner.slice(b[0], b[1] + 1) : "";
      const flag = (/const\s+SERVE_AS_THE_APP_DOES\s*=\s*"([^"]+)"/.exec(codeOf("testlib-live-server.js")) || [])[1];
      ok(!!body && !!flag, "THE CONTROL: the runner's server start and the child's flag are found in the source", { found: !!body, flag });
      const spawnArgs = (/spawn\(\s*process\.execPath\s*,\s*\[([^\]]*)\]/.exec(body) || [])[1] || "";
      ok(/"testlib-live-server\.js"/.test(spawnArgs) && spawnArgs.includes(JSON.stringify(flag)) && !/"server\.js"/.test(spawnArgs),
        "⭐⭐ the runner's own live server is started as the app starts its own — no warm in the process the live tests drive", spawnArgs);
    }
    {
      // ⭐⭐ …AND THE SERVER A BARE TEST DRIVES IS THE ONE IT STARTED (#a-server-that-answers-is-not-yours). A stand-in holds
      // the first port handed to ownLiveServer and answers "IMPOSTOR": the child's own bind there fails, and the parent must
      // not take the stand-in's answer for its server's — it picks again, and drives the Nova it started.
      const probe = path.join(PROBES, "impostor.js");
      fs.writeFileSync(probe, [
        '"use strict";',
        'const http = require("http");',
        "const { ownLiveServer, freePortInBand } = require(" + JSON.stringify(path.join(__dirname, "testlib-live-server.js")) + ");",
        "(async () => {",
        '  const imp = http.createServer((q, r) => { r.end("IMPOSTOR"); });',
        "  const held = await freePortInBand();",
        '  await new Promise((res) => imp.listen(held, "127.0.0.1", res));',
        "  let picks = 0;",
        '  const port = await ownLiveServer("test-impostor", { timeoutMs: 120000, pickPort: async () => (picks++ === 0 ? held : freePortInBand()) });',
        '  let body = "";',
        '  if (port) body = await fetch("http://127.0.0.1:" + port + "/api/mods/list").then((r) => r.text()).catch((e) => "ERR " + e.message);',
        "  imp.close();",
        "  process.stdout.write(JSON.stringify({ held, port, picks, impostor: /IMPOSTOR/.test(body), nova: /^\\s*[\\[{]/.test(body) }));",
        "  process.exit(0);",
        "})();",
      ].join("\n"));
      const r = spawnSync(process.execPath, [probe], { cwd: PROBES, env: bareEnv(), encoding: "utf8", timeout: 240000 });
      let o = null;
      try { o = JSON.parse(r.stdout); } catch (_) { o = null; }
      ok(!!o && o.picks >= 2 && !!o.port && o.port !== o.held && !o.impostor && o.nova,
        "⭐⭐ a bare live test drives the server it started: a port another process bound first is picked again, never driven", o || String(r.stderr || "").slice(-400));
    }
  }

  // ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  console.log("\nJ. every file that drives Electron hands it a profile of its own");
  {
    // Electron takes its profile from Windows' shell folders, not from APPDATA, so the guard's sandbox cannot reach it: run
    // on the owner's profile, the app restores THEIR last mod and keeps its storage there. e2e-workflow-test.js has passed a
    // throwaway --user-data-dir for exactly that reason; every file that launches Electron must.
    const drivers = fs.readdirSync(__dirname).filter((f) => /^(test|e2e|testlib)-.*\.js$/.test(f) && f !== path.basename(__filename))
      .filter((f) => /\b_electron\b/.test(codeOf(f)));
    ok(drivers.length >= 2 && drivers.includes("e2e-workflow-test.js"), "THE CONTROL: the scan finds the files that drive Electron", drivers);
    const missing = drivers.filter((f) => !/\.launch\(\s*\{[\s\S]{0,400}?--user-data-dir=/.test(codeOf(f)));
    ok(!missing.length, "⭐⭐ every one of them launches it with a --user-data-dir of its own", missing);
  }

  // ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  console.log("\nK. ⭐⭐⭐ a script that is not a test but keeps its app data in temp gets the rest of a sandbox too");
  {
    // #a-sandboxed-app-data-gets-the-rest-of-a-sandbox — THE ESCAPE, 2026-10-23 22:27:32. An agent copied test-all-endpoints.js
    // as endpoints-copy.js and ran it from a script (run.js) that pointed APPDATA, NOVA_APP_DATA_DIR and XDG_CONFIG_HOME into the
    // temp folder and set HOI4_MODS_ROOT, but not HOI4_USER_DIR, NOVA_DOCUMENTS_DIR or NOVA_HOME_DIR. Its main was not a test's,
    // so the guard stood down; server.js found the owner's REAL plain Documents HOI4 folder, and GET /api/diag/hoi4 rewrote
    // nova_diagnostics.txt there, keeping no copy of what it held. The coordinator's own world builds (build-t31.js) have the
    // same shape, and with NOVA_HOME_DIR unset map-data.js's per-mod stores go into the real ~/.nova. So a process whose app
    // data is already a sandbox has what it left unset filled in, laid out as run-tests.js lays its own; what it SET is kept,
    // inside temp or not — build-t31.js builds TEST worlds in the owner's real mods folder on purpose.
    //
    // ── the plan, on a made-up machine, with nothing read from disk ──
    const root = path.parse(os.tmpdir()).root;
    const H = path.join(root, "Users", "Long Name");
    const T = path.join(H, "AppData", "Local", "Temp");
    const T83 = path.join(root, "Users", "LONGNA~1", "AppData", "Local", "Temp");   // the same folder, as Windows also spells it
    const asWritten = (p) => p;
    const asTheDiskSpellsIt = (p) => String(p).replace(/LONGNA~1/i, "Long Name");
    const SCRIPTS = path.join(T, "claude", "scratchpad");                           // where an agent keeps its harnesses
    const OWN = path.join(SCRIPTS, "appdata");                                       // …and the app-data folder one makes there
    const REAL_APPDATA = path.join(H, "AppData", "Roaming");
    const REAL_MODS = path.join(H, "OneDrive", "Documents", "Paradox Interactive", "Hearts of Iron IV", "mod");
    const ask = (main, env, o = {}) => sw.bareTestRunPlan(Object.assign({ mainFile: main ? path.join(SCRIPTS, main) : "", env, tmpdir: T,
      homedir: H, versions: {}, moduleDir: __dirname, realpath: asWritten }, o));
    const entries = (p) => JSON.stringify(Object.entries(p || {}).sort(([x], [y]) => (x < y ? -1 : x > y ? 1 : 0)));
    // DERIVED: the sub-paths are the unit runner's layout as safe-write.js names it (section A pins that it is run-tests.js's)
    const filled = (...ks) => { const o = {}; for (const k of ks) o[k] = sw.BARE_TEST_ENV[k]; return o; };
    const THREE = ["HOI4_USER_DIR", "NOVA_DOCUMENTS_DIR", "NOVA_HOME_DIR"];
    const APP_VARS = Array.isArray(sw.BARE_APP_DATA_VARS) ? sw.BARE_APP_DATA_VARS : [];
    ok(APP_VARS.length === 3 && APP_VARS.every((k) => k in sw.BARE_TEST_ENV && sw.BARE_TEST_ENV[k] === "") && THREE.every((k) => k in sw.BARE_TEST_ENV),
      "THE CONTROL: safe-write.js names the variables the app data is kept under, and the unit runner's layout holds them and the three",
      { APP_VARS, layout: sw.BARE_TEST_ENV });
    {
      // DERIVED: every variable the app-data folder is actually worked out from, read out of resolveNovaAppDataDir's own body.
      const swCode = maskJsLiterals(srcOf("safe-write.js"));
      const at = swCode.indexOf("function resolveNovaAppDataDir(");
      const b = at < 0 ? null : jsBodyAt(swCode, at);
      const body = b ? maskJsComments(srcOf("safe-write.js")).slice(b[0], b[1] + 1) : "";   // same length as swCode: one index, one place
      const reads = [...new Set([...body.matchAll(/process\.env\.([A-Z_][A-Z0-9_]*)/g)].map((x) => x[1]))];
      ok(reads.length >= 2 && reads.every((k) => APP_VARS.includes(k)),
        "⭐⭐ every variable resolveNovaAppDataDir reads is one that marks app data kept in a sandbox", { reads, APP_VARS });
    }
    const runJs = { APPDATA: OWN, NOVA_APP_DATA_DIR: OWN, XDG_CONFIG_HOME: OWN, HOI4_MODS_ROOT: path.join(SCRIPTS, "mods") };
    ok(entries(ask("run.js", runJs)) === entries(filled(...THREE)),
      "⭐⭐⭐ run.js's shape — its app data in temp, a mods root, and not the three — is given exactly those three, laid out as the unit runner lays them",
      ask("run.js", runJs));
    const worldBuild = { APPDATA: OWN, NOVA_APP_DATA_DIR: OWN, XDG_CONFIG_HOME: OWN, NOVA_HOME_DIR: path.join(OWN, "home"),
      HOI4_ROOT: path.join(root, "SteamLibrary", "steamapps", "common", "Hearts of Iron IV"), HOI4_MODS_ROOT: REAL_MODS };
    ok(entries(ask("build-t31.js", worldBuild)) === entries(filled("HOI4_USER_DIR", "NOVA_DOCUMENTS_DIR")),
      "⭐⭐⭐ the world build's shape is given only the two it left unset: its own ~/.nova, and its mods root — the owner's real one, on purpose — are kept",
      ask("build-t31.js", worldBuild));
    for (const main of ["server.js", "endpoints-copy.js", ""]) {
      ok(entries(ask(main, runJs)) === entries(filled(...THREE)),
        "⭐⭐ …and so is " + (main ? "a process whose main is " + main : "node -e") + " with that env: a server such a script starts decides for itself", ask(main, runJs));
    }
    const setOutside = Object.assign({}, runJs, { NOVA_HOME_DIR: H, HOI4_USER_DIR: path.join(H, "Documents", "Paradox Interactive", "Hearts of Iron IV") });
    ok(entries(ask("run.js", setOutside)) === entries(filled("NOVA_DOCUMENTS_DIR")),
      "⭐⭐ a value it SET outside temp is its own choice and is kept — only what it left unset is filled", ask("run.js", setOutside));
    ok(entries(ask("run.js", Object.assign({}, runJs, { NOVA_DOCUMENTS_DIR: "none" }))) === entries(filled("HOI4_USER_DIR", "NOVA_HOME_DIR")),
      "⭐ NOVA_DOCUMENTS_DIR=none (\"no answer\", on purpose) is kept", ask("run.js", Object.assign({}, runJs, { NOVA_DOCUMENTS_DIR: "none" })));
    ok(entries(ask("run.js", Object.assign({}, runJs, { HOI4_USER_DIR: "  ", NOVA_HOME_DIR: "" }))) === entries(filled(...THREE)),
      "⭐ a blank value is no folder to its reader, which then finds the real one: it is filled like an unset one");
    // ⛔ #a-relative-folder-is-no-choice — review R3. A relative value is a folder under wherever the script happened to start, and
    // one it never made: "hoi4-user", or "undefined" — what `process.env.X = undefined` stores. A test's is filled (section D);
    // a script's was kept, and server.js, finding no such folder, took the real mods folder detection finds for the one to use.
    ok(entries(ask("run.js", Object.assign({}, runJs, { HOI4_USER_DIR: "hoi4-user" }))) === entries(filled(...THREE)),
      "⭐⭐ a relative value it set is a folder under wherever it was started, not a choice of a folder: it is filled like an unset one",
      ask("run.js", Object.assign({}, runJs, { HOI4_USER_DIR: "hoi4-user" })));
    ok(entries(ask("run.js", Object.assign({}, runJs, { HOI4_USER_DIR: "undefined", NOVA_HOME_DIR: "undefined" }))) === entries(filled(...THREE)),
      "⭐⭐ …\"undefined\" among them, which is what `process.env.X = undefined` stores");
    ok(entries(ask("run.js", Object.assign({}, runJs, { APPDATA: "appdata" }), { platform: "win32" })) === entries(filled(...THREE, "APPDATA")),
      "…and a relative APPDATA beside app data kept in temp");
    {
      // ⛔ #the-app-data-nova-reads-goes-with-the-rest — review R5. Any one of BARE_APP_DATA_VARS in temp says the app data is meant
      // for a sandbox, but only one of them is where Nova keeps it on each system. Left at the shell's own folder — every Windows
      // shell sets APPDATA — the backups and caches went on into the real Roaming\NovaModdingSuite while the line said "not into
      // your real folders". So that one is filled too. DERIVED: which variable resolveNovaAppDataDir reads, per system, out of its body.
      const swSrc = srcOf("safe-write.js");
      const at = maskJsLiterals(swSrc).indexOf("function resolveNovaAppDataDir(");
      const b = at < 0 ? null : jsBodyAt(maskJsLiterals(swSrc), at);
      const body = b ? maskJsComments(swSrc).slice(b[0], b[1] + 1) : "";
      const readOn = {
        win32: (/process\.platform === "win32"\)\s*base = process\.env\.([A-Z_]+)/.exec(body) || [])[1] || "",
        linux: (/\belse base = process\.env\.([A-Z_]+)/.exec(body) || [])[1] || "",
        darwin: /process\.platform === "darwin"\)\s*base = [^;]*process\.env/.test(body) ? "?" : "",
      };
      ok(readOn.win32 === "APPDATA" && readOn.linux === "XDG_CONFIG_HOME" && readOn.darwin === "",
        "THE CONTROL: resolveNovaAppDataDir reads APPDATA on Windows, XDG_CONFIG_HOME on Linux and none of them on macOS", readOn);
      for (const platform of ["win32", "linux", "darwin"]) {
        for (const k of APP_VARS) {
          const env = { APPDATA: REAL_APPDATA, NOVA_APP_DATA_DIR: REAL_APPDATA, XDG_CONFIG_HOME: REAL_APPDATA, [k]: OWN };
          const reads = readOn[platform];
          const want = reads && reads !== k ? filled(...THREE, reads) : filled(...THREE);
          ok(entries(ask("run.js", env, { platform })) === entries(want),
            "⭐⭐ (" + platform + ") " + k + " alone in temp says the app data is meant for a sandbox: the three it left unset are filled"
            + (reads && reads !== k ? ", and " + reads + ", where Nova keeps its app data there, from the real folder" : ""), ask("run.js", env, { platform }));
        }
      }
    }
    const allReal = { APPDATA: REAL_APPDATA, NOVA_APP_DATA_DIR: REAL_APPDATA, XDG_CONFIG_HOME: REAL_APPDATA };
    ok(entries(ask("run.js", allReal)) === "[]",
      "⭐⭐⭐ THE CONTROL: with the real app data it plans nothing — a script on the real folders is its owner's own choice", ask("run.js", allReal));
    ok(entries(ask("run.js", { APPDATA: REAL_APPDATA })) === "[]" && entries(ask("run.js", {})) === "[]",
      "…nor with only the machine's own APPDATA, or with none at all");
    {
      // ⛔ #any-folder-in-temp-says-so — review S2. Only an absolute app-data variable in temp engaged the guard: HOI4_MODS_ROOT in temp and
      // nothing else, or NOVA_HOME_DIR, or a relative APPDATA, got no sandbox at all. DERIVED: every folder the guard hands anybody.
      const FOLDERS = Object.keys(sw.BARE_E2E_ENV);
      ok(FOLDERS.length === 7 && APP_VARS.every((k) => FOLDERS.includes(k)) && THREE.every((k) => FOLDERS.includes(k)) && FOLDERS.includes("HOI4_MODS_ROOT"),
        "THE CONTROL: the e2e runner's layout names the app-data variables, the three and the mods root", FOLDERS);
      const shell = { APPDATA: REAL_APPDATA };                     // what every Windows shell sets
      const rest = (k) => Object.keys(sw.BARE_TEST_ENV).filter((x) => x !== k);
      for (const k of FOLDERS) {
        const inTemp = Object.assign({}, shell, { [k]: path.join(SCRIPTS, "its-own") });
        ok(entries(ask("run.js", inTemp, { platform: "win32" })) === entries(filled(...rest(k))),
          "⭐⭐⭐ " + k + " alone in temp engages it: the rest is filled, and that one is kept", ask("run.js", inTemp, { platform: "win32" }));
        ok(entries(ask("run.js", Object.assign({}, shell, { [k]: path.join(H, "its-own") }), { platform: "win32" })) === "[]",
          "THE CONTROL: …while " + k + " outside temp is its own choice, and nothing is planned", ask("run.js", Object.assign({}, shell, { [k]: path.join(H, "its-own") }), { platform: "win32" }));
        ok(entries(ask("run.js", inTemp, { platform: "win32", homedir: path.join(T, "home") })) === "[]",
          "THE CONTROL: …and in a temp folder the home folder sits in, it says nothing");
        if (k === "NOVA_DOCUMENTS_DIR") continue;
        const relative = Object.assign({}, shell, { [k]: "a-relative-folder" });
        ok(entries(ask("run.js", relative, { platform: "win32" })) === entries(filled(...Object.keys(sw.BARE_TEST_ENV))),
          "⭐⭐⭐ " + k + " relative, wherever the process started, engages it too: no launch of the real app has one", ask("run.js", relative, { platform: "win32" }));
        ok(entries(ask("run.js", relative, { platform: "win32", tmpdir: root })) === "[]", "THE CONTROL: …but not where its temp folder cannot tell: a script may be the real app");
      }
      ok(entries(ask("run.js", Object.assign({}, shell, { NOVA_DOCUMENTS_DIR: "none" }), { platform: "win32" })) === "[]",
        "⭐⭐ NOVA_DOCUMENTS_DIR=none says nothing: it is that variable's \"no answer\", on purpose");
    }
    ok(entries(ask("run.js", { APPDATA: T })) === entries(filled("XDG_CONFIG_HOME", "NOVA_APP_DATA_DIR", ...THREE)),
      "⭐ an APPDATA that IS the temp folder is a sandbox too, and the app-data variables it left unset are filled with the rest", ask("run.js", { APPDATA: T }));
    ok(entries(ask("run.js", runJs, { tmpdir: T83, realpath: asTheDiskSpellsIt })) === entries(filled(...THREE)),
      "⭐⭐ app data spelled in full is inside a temp folder handed over in 8.3 form", ask("run.js", runJs, { tmpdir: T83, realpath: asTheDiskSpellsIt }));
    const in83 = path.join(T83, "claude", "appdata");
    ok(entries(ask("run.js", { APPDATA: in83, NOVA_APP_DATA_DIR: in83, XDG_CONFIG_HOME: in83 }, { realpath: asTheDiskSpellsIt })) === entries(filled(...THREE)),
      "…and app data spelled in 8.3 form is inside the temp folder spelled in full");
    ok(entries(ask("run.js", runJs, { tmpdir: T83, realpath: asWritten })) === "[]",
      "THE CONTROL: compared only as written, that app data looks like a real folder, and nothing is planned");
    // A temp folder that cannot tell a sandbox from the real thing: a SCRIPT is then left alone, where a TEST is given every
    // variable (section D) — a test is never the real app, a script may be.
    ok(entries(ask("run.js", { APPDATA: path.join(root, "x") }, { tmpdir: root })) === "[]",
      "⭐⭐ a temp folder at the top of a drive tells nothing: app data 'inside' it is not taken for a sandbox");
    ok(entries(ask("run.js", runJs, { homedir: path.join(T, "home") })) === "[]", "⭐⭐ …nor is app data in a temp folder the home folder sits in");
    ok(entries(ask("test-any.js", runJs, { homedir: path.join(T, "home") })) === entries(sw.BARE_TEST_ENV),
      "THE CONTROL: …where a TEST in the same place is given every variable");
    // ⛔ #a-temp-folder-above-the-app-data — review S7. A temp folder above the system's own app-data folder calls the real APPDATA a sandbox.
    for (const [platform, tmpdir, env] of [
      ["win32", path.dirname(REAL_APPDATA), { APPDATA: REAL_APPDATA }], ["win32", REAL_APPDATA, { APPDATA: REAL_APPDATA }],
      ["linux", path.join(H, ".config"), { XDG_CONFIG_HOME: path.join(H, ".config") }],
      ["darwin", path.join(H, "Library", "Application Support"), { APPDATA: path.join(H, "Library", "Application Support", "x") }],
    ]) {
      ok(entries(ask("server.js", env, { platform, tmpdir })) === "[]",
        "⭐⭐ (" + platform + ") a real launch with TEMP at " + path.relative(H, tmpdir) + " keeps its real folders: that temp folder holds the system's own app-data folder", ask("server.js", env, { platform, tmpdir }));
      ok(entries(ask("test-any.js", env, { platform, tmpdir })) === entries(sw.BARE_TEST_ENV), "THE CONTROL: …where a test there is given every variable", ask("test-any.js", env, { platform, tmpdir }));
    }
    ok(!Object.keys(ask("run.js", runJs, { versions: { electron: String(pkg.devDependencies.electron || "41") } })).length, "⭐⭐ under Electron it plans nothing");
    ok(!Object.keys(ask("run.js", runJs, { moduleDir: path.join(T, "2vX9", "resources", "app.asar") })).length,
      "⭐⭐ …nor from inside app.asar (the portable exe runs from the temp folder)");
    for (const runner of ["run-tests.js", "run-e2e.js"]) {
      const { folders, err } = runnerFolders(runner);
      const SB = path.join(T, "nova-suite-appdata-x"), SC = path.join(T, "nova-e2e-mods-x");
      const env = {};
      for (const [k, f] of Object.entries(folders || {})) env[k] = path.join(f.base === "sandbox" ? SB : SC, f.rel);
      ok(!err && THREE.every((k) => k in env) && APP_VARS.every((k) => k in env), "THE CONTROL: " + runner + "'s env is read out of its source", err || env);
      const planned = ["server.js", "run.js", "warm-child.js", ""].filter((mn) => Object.keys(ask(mn, env)).length);
      ok(!planned.length, "⭐⭐⭐ under " + runner + "'s env, a server or a script it starts is left exactly as the runner made it", planned);
    }
    {
      // ⛔ #a-server-given-a-temp-folder-of-its-own — review R2. A harness keeps its app data in the user's own temp folder and
      // hands the `node server.js` it starts a temp folder of its own (g2tfix\coast-rows-review\rex.js: TMP = HERE\tmp, APPDATA =
      // HERE\appdata-…). Judged against the server's temp folder alone that app data looked real, and the report went into the
      // HOI4 folder detection finds: the 10-23 escape, on the fixed code. It is also judged against the user's own temp folder.
      const PRIV = path.join(SCRIPTS, "rex", "tmp");
      ok(entries(ask("server.js", runJs, { tmpdir: PRIV, defaultTmpdir: T })) === entries(filled(...THREE)),
        "⭐⭐⭐ a server handed a temp folder of its own, with its app data in the user's own temp folder, is given the three", ask("server.js", runJs, { tmpdir: PRIV, defaultTmpdir: T }));
      ok(entries(ask("server.js", runJs, { tmpdir: PRIV })) === "[]",
        "THE CONTROL: judged against its own temp folder alone, that app data looks like a real folder, and nothing is planned");
      ok(entries(ask("server.js", runJs, { tmpdir: PRIV, defaultTmpdir: T, homedir: path.join(T, "home") })) === "[]",
        "⭐⭐ …and a user's temp folder the home folder sits in tells nothing, as the process's own does not");
      ok(entries(ask("server.js", { APPDATA: path.join(root, "x") }, { tmpdir: PRIV, defaultTmpdir: root })) === "[]", "⭐ …nor one at the top of a drive");
      // ⛔ #a-sandbox-where-temp-cannot-tell — review S1. The sandbox is made in the process's OWN temp folder, and one that cannot tell
      // calls every real mod a fixture: so the user's own may qualify a script only when its own can tell too.
      ok(entries(ask("server.js", runJs, { tmpdir: path.dirname(H), defaultTmpdir: T })) === "[]",
        "⭐⭐⭐ a server whose OWN temp folder holds the home folder stands down, though its app data is in the user's own temp folder: its sandbox would be made there",
        ask("server.js", runJs, { tmpdir: path.dirname(H), defaultTmpdir: T }));
      ok(entries(ask("server.js", runJs, { tmpdir: root, defaultTmpdir: T })) === "[]", "⭐⭐ …and so does one whose own temp folder is the top of a drive",
        ask("server.js", runJs, { tmpdir: root, defaultTmpdir: T }));
      ok(entries(ask("server.js", allReal, { tmpdir: PRIV, defaultTmpdir: T })) === "[]",
        "THE CONTROL: the machine's own app data, in neither temp folder, is still the process's own choice");
      ok(entries(ask("server.js", runJs, { tmpdir: PRIV, defaultTmpdir: T83, realpath: asTheDiskSpellsIt })) === entries(filled(...THREE)),
        "⭐ …and the user's temp folder is asked as the disk spells it too");
    }

    {
      // ⛔ #a-child-of-a-run-is-part-of-it — review S3. A process handed its run's sandbox, with no app-data variable, was judged the real app.
      const RUN = path.join(T, "nova-bare-a-run-a1b2c3");
      const ALL = filled(...Object.keys(sw.BARE_TEST_ENV));
      ok(entries(ask("server.js", { PORT: "1" }, { runSandbox: RUN })) === entries(ALL),
        "⭐⭐⭐ told of its run's sandbox, with none of its folders set, a process fills them all", ask("server.js", { PORT: "1" }, { runSandbox: RUN }));
      ok(entries(ask("server.js", { PORT: "1" })) === "[]", "THE CONTROL: …told of none, it is left alone");
      ok(entries(ask("server.js", { APPDATA: REAL_APPDATA }, { runSandbox: RUN, platform: "win32" })) === entries(ALL),
        "⭐⭐ …and the machine's own APPDATA, put back by a helper, goes with them", ask("server.js", { APPDATA: REAL_APPDATA }, { runSandbox: RUN, platform: "win32" }));
      const complete = {};
      for (const [k, sub] of Object.entries(sw.BARE_TEST_ENV)) complete[k] = path.join(RUN, sub);
      ok(entries(ask("server.js", complete, { runSandbox: RUN })) === "[]", "THE CONTROL: …with everything in the run's sandbox, there is nothing to fill");
      // A test asks a child on a decoy home inside temp what the machine's own detection finds. That must stay so under a bare run too.
      const DECOY = path.join(T, "a-tests-decoy-home");
      ok(entries(ask("server.js", { APPDATA: path.join(DECOY, "ad"), NOVA_HOME_DIR: RUN }, { runSandbox: RUN, homedir: DECOY })) === "[]",
        "⭐⭐⭐ …but a child on a decoy home inside temp, whose temp folder cannot tell, is left to the detection the test asked it about",
        ask("server.js", { APPDATA: path.join(DECOY, "ad"), NOVA_HOME_DIR: RUN }, { runSandbox: RUN, homedir: DECOY }));
      ok(entries(ask("server.js", { APPDATA: RUN }, { runSandbox: RUN, homedir: DECOY })) === entries(filled(...Object.keys(sw.BARE_TEST_ENV).filter((k) => k !== "APPDATA"))),
        "THE CONTROL: …where app data already in the run's sandbox still says it, as it always did", ask("server.js", { APPDATA: RUN }, { runSandbox: RUN, homedir: DECOY }));
    }

    // ── by running it, on the fake machine ──
    // The child's temp folder is CHILD_TMP and its home FAKE_HOME, side by side, so temp CAN tell (a home inside temp makes the
    // guard stand down for a script and would prove nothing — asked of the plan above). With NOVA_DOCUMENTS_DIR unset, server.js
    // asks Windows where Documents is: a preload answers as the owner's machine does (%USERPROFILE%\Documents — the decoy's, here)
    // and refuses to let a child load Nova outside this test's scratch folder; the in-process probe also checks the folders
    // server.js worked out before it asks for anything. A decoy report sits in the decoy's HOI4 folder, where detection finds it.
    const K_APP = path.join(CHILD_TMP, "a-scripts-own-appdata");
    const K_MODS = path.join(CHILD_TMP, "a-scripts-own-mods");
    const K_HOME = path.join(CHILD_TMP, "a-scripts-own-home");
    const K_REAL_MODS = path.join(OUTSIDE, "the-owners-mods");           // outside temp, as build-t31.js's real mods folder is
    for (const d of [K_APP, K_MODS, K_HOME, K_REAL_MODS]) fs.mkdirSync(d, { recursive: true });
    const OLD_REPORT = path.join(FAKE_USER, "nova_diagnostics.txt");
    const OLD_REPORT_TEXT = "===== NOVA HOI4 DIAGNOSTICS =====\n[fake] the owner's own report, from a crash whose logs are gone\n";
    fs.writeFileSync(OLD_REPORT, OLD_REPORT_TEXT);
    const hashOf = (p) => { try { return crypto.createHash("sha1").update(fs.readFileSync(p)).digest("hex"); } catch (_) { return ""; } };
    const oldHash = hashOf(OLD_REPORT);
    const STUB = path.join(PROBES, "windows-says-documents-is-in-the-decoy-home.js");
    const REG_LOG = path.join(SCRATCH, "registry-asked.log");
    fs.writeFileSync(STUB, [
      '"use strict";',
      'const fs = require("fs"), os = require("os"), path = require("path"), cp = require("child_process");',
      "const FENCE = " + JSON.stringify(SCRATCH) + ", LOG = " + JSON.stringify(REG_LOG) + ";",
      "const real = (p) => { try { return fs.realpathSync.native(p); } catch (_) { return path.resolve(p); } };",
      "const within = (p) => !!p && real(p).toLowerCase().startsWith(real(FENCE).toLowerCase() + path.sep);",
      "if (![os.homedir(), process.env.USERPROFILE, process.env.OneDrive, process.env.APPDATA, process.env.HOI4_ROOT, os.tmpdir()].every(within)) {",
      '  fs.appendFileSync(LOG, "interlock" + String.fromCharCode(10)); process.exit(1);',
      "}",
      "const ANSWER = " + JSON.stringify("    Personal    REG_EXPAND_SZ    %USERPROFILE%" + String.fromCharCode(92) + "Documents" + String.fromCharCode(10)) + ";",
      "const execFileSync = cp.execFileSync;",
      "cp.execFileSync = function (file) {",
      '  const base = path.basename(String(file || "")).toLowerCase();',
      '  if (base === "reg.exe" || base === "reg") { fs.appendFileSync(LOG, "asked by " + process.pid + String.fromCharCode(10)); return ANSWER; }',
      "  return execFileSync.apply(this, arguments);",
      "};",
    ].join("\n"));
    const regAsked = () => { try { return fs.readFileSync(REG_LOG, "utf8"); } catch (_) { return ""; } };
    // run.js's env: its app data in temp and a mods root — and NOT the three (undefined: left out of the child's env altogether)
    const escapeEnv = (extra = {}) => bareEnv(Object.assign({ APPDATA: K_APP, NOVA_APP_DATA_DIR: K_APP, XDG_CONFIG_HOME: K_APP,
      HOI4_MODS_ROOT: K_MODS, NOVA_DOCUMENTS_DIR: undefined }, extra));
    {
      const before = snapshot(FAKE_HOME);
      const { r, rep, stderr } = runProbe("run.js", { mode: "diag-in-process" }, escapeEnv(), ["-r", STUB]);
      const sb = (rep && rep.sandbox) || "";
      const env = (rep && rep.env) || {};
      const diag = (rep && rep.diag) || {};
      ok(!!rep && !rep.interlock && !rep.interlock2 && !rep.harness && r.status === 0 && !/interlock/.test(regAsked()),
        "THE CONTROL: run.js's shape ran on the fake machine, fenced into this test's scratch folder", { status: r.status, rep, stderr: stderr.slice(-600), reg: regAsked() });
      ok(!!sb && inside(sb, CHILD_TMP), "⭐⭐⭐ its main is not a test's, and a sandbox was still made, inside its temp folder",
        { sandbox: sb, stderr: stderr.slice(0, 400) });
      ok(!!sb && THREE.every((k) => same(env[k], sb) || inside(env[k], sb)),
        "⭐⭐⭐ HOI4_USER_DIR, NOVA_DOCUMENTS_DIR and NOVA_HOME_DIR, which it left unset, point into it", env);
      ok(APP_VARS.every((k) => same(env[k], K_APP)) && same(env.HOI4_MODS_ROOT, K_MODS) && inside(rep && rep.BACKUP_DIR, K_APP),
        "⭐⭐ …and what it set is its own: its app data, backups and all, and its mods root", { env, BACKUP_DIR: rep && rep.BACKUP_DIR });
      ok(diag.ok === true && !!sb && inside(diag.savedPath, sb),
        "⭐⭐⭐ GET /api/diag/hoi4 wrote its report into the sandbox — not into the HOI4 folder the machine's own detection finds",
        { diag, detected: FAKE_USER });
      ok(hashOf(OLD_REPORT) === oldHash, "⭐⭐⭐ …and the decoy owner's own nova_diagnostics.txt is byte for byte what it was",
        { report: OLD_REPORT, now: (() => { try { return fs.readFileSync(OLD_REPORT, "utf8").slice(0, 120); } catch (_) { return ""; } })() });
      ok(!!(rep && rep.baseline && rep.baseline.ok) && !!sb && inside(rep.baseline.baselinePath, sb),
        "⭐⭐ a map baseline (~/.nova) landed in the sandbox too, not in the home folder", rep && rep.baseline);
      const d = diff(before, snapshot(FAKE_HOME));
      ok(clean(d), "⭐⭐⭐ NOTHING was written into the fake machine — its Documents, its HOI4 folder, OneDrive or ~/.nova", d);
      ok(/\[nova\] run\.js keeps its app data in the temp folder/.test(stderr) && !!sb && stderr.includes(sb), "…and it said so, naming the sandbox", stderr.slice(0, 400));
      ok(!!sb && !fs.existsSync(sb), "⭐⭐ …and the sandbox is gone once it has exited: it held a copy of nothing outside temp", sb);
    }
    {
      // …and with no mods root of its own, the one server.js derives from the folders it would otherwise have detected
      const { rep } = runProbe("run.js", { mode: "mods-root" }, escapeEnv({ HOI4_MODS_ROOT: undefined }), ["-r", STUB]);
      const sb = (rep && rep.sandbox) || "";
      ok(!!rep && !rep.interlock && !rep.interlock2 && !!sb && inside(rep.MODS_ROOT, sb),
        "⭐⭐⭐ with HOI4_MODS_ROOT unset too, server.js's mods folder is in the sandbox — not the decoy's own, where New mod would land",
        { MODS_ROOT: rep && rep.MODS_ROOT, sandbox: sb, decoy: path.join(FAKE_USER, "mod") });
      // #a-script-keeps-the-mods-it-made — DERIVED: the folder the release looks in for a script's mods is the one server.js uses
      ok(!!sb && typeof sw.BARE_MODS_FOLDER === "string" && same(rep.MODS_ROOT, path.join(sb, sw.BARE_MODS_FOLDER)),
        "⭐ …exactly the folder safe-write.js looks in for the mods a script made there (BARE_MODS_FOLDER)", { MODS_ROOT: rep && rep.MODS_ROOT, BARE_MODS_FOLDER: sw.BARE_MODS_FOLDER });
    }
    {
      // …and when the script loads nothing of Nova and starts `node server.js`: the server's own guard decides.
      const before = snapshot(FAKE_HOME);
      const { rep, stderr } = runProbe("endpoints-run.js", { mode: "diag-spawned", stub: STUB }, escapeEnv());
      const diag = (rep && rep.diag) || {};
      const said = /\[nova\] server\.js keeps its app data in the temp folder[^\n]*-> (.+?) \(removed when it exits by itself/.exec((rep && rep.stderr) || "");
      const sb = said ? said[1] : "";
      ok(!!rep && rep.port > 0 && !rep.interlock && !!diag.status, "THE CONTROL: a script that loads nothing of Nova started `node server.js` with that env and asked it for the report",
        { rep, stderr: stderr.slice(-400), reg: regAsked() });
      ok(!!sb && inside(sb, CHILD_TMP) && /^nova-bare-server-/.test(path.basename(sb)), "⭐⭐⭐ the server made a sandbox of its own, and said so", (rep && rep.stderr || "").slice(0, 500));
      // (nothing to report in a fresh folder, so no copy is written: which folder it looked in is the answer)
      ok(diag.ok === true && !!sb && inside(diag.userDir, sb), "⭐⭐⭐ …and collected its report there, not from the HOI4 folder detection finds", { diag, detected: FAKE_USER });
      ok(hashOf(OLD_REPORT) === oldHash && clean(diff(before, snapshot(FAKE_HOME))), "⭐⭐⭐ …and the decoy's own report, and the rest of the fake machine, are untouched",
        diff(before, snapshot(FAKE_HOME)));
      // ⛔ #a-killed-process-keeps-its-sandbox — review R4. The script then KILLED the server, as every harness does (`node server.js`
      // never exits by itself; child.kill() is TerminateProcess on Windows), so no exit handler ran and the sandbox is still there —
      // after a line that said "removed at exit". It says what happens now; and the mark says whose it was.
      const line = String((rep && rep.stderr) || "").split(/\r?\n/).find((l) => /\[nova\] server\.js keeps its app data/.test(l)) || "";
      ok(!!sb && fs.existsSync(sb), "THE CONTROL: killed, the server ran no exit handler, and its sandbox is still in the temp folder", sb);
      ok(/not when it is killed/.test(line) && !/removed at exit/.test(line), "⭐⭐ …and its line never promised otherwise: removed when it exits by itself, not when it is killed", line);
      const mark = (() => { try { return JSON.parse(fs.readFileSync(path.join(sb, MARK || "?"), "utf8")); } catch (_) { return null; } })();
      ok(!!mark && !!rep && mark.pid === rep.serverPid && mark.main === "server.js" && mark.test === false,
        "⭐ …and its mark names the server that made it, for whoever finds the folder", { mark, serverPid: rep && rep.serverPid });
    }
    {
      // ⛔ #a-server-given-a-temp-folder-of-its-own — …BY RUNNING IT (review R2). rex.js's shape: the script keeps its app data in the
      // user's own temp folder and starts `node server.js` with a temp folder of its own (TMP = HERE\tmp). The fake machine lays its
      // user's temp folder out as Windows does, %LOCALAPPDATA%\Temp, and the script runs in it; the server's is a folder beside it.
      // Judged against the server's temp folder alone, the app data looked real and the report went into the decoy's HOI4 folder.
      const LOCAL = path.join(SCRATCH, "local"), USER_TMP = path.join(LOCAL, "Temp");
      const REX_APP = path.join(USER_TMP, "rex-appdata"), REX_TMP = path.join(SCRATCH, "rex-tmp");
      for (const d of [REX_APP, REX_TMP]) fs.mkdirSync(d, { recursive: true });
      const env = escapeEnv({ LOCALAPPDATA: LOCAL, TEMP: USER_TMP, TMP: USER_TMP, TMPDIR: USER_TMP, APPDATA: REX_APP, NOVA_APP_DATA_DIR: REX_APP, XDG_CONFIG_HOME: REX_APP });
      const before = snapshot(FAKE_HOME);
      const { rep, stderr } = runProbe("rex.js", { mode: "diag-spawned", stub: STUB, childEnv: { TEMP: REX_TMP, TMP: REX_TMP, TMPDIR: REX_TMP } }, env);
      const diag = (rep && rep.diag) || {};
      const said = /\[nova\] server\.js keeps its app data in the temp folder[^\n]*-> (.+?) \(removed when it exits by itself/.exec((rep && rep.stderr) || "");
      const sb = said ? said[1] : "";
      ok(!!rep && rep.port > 0 && !rep.interlock && !!diag.status,
        "THE CONTROL: a script with its app data in the user's own temp folder started `node server.js` with a temp folder of its own and asked it for the report",
        { rep, stderr: stderr.slice(-400) });
      ok(!!sb && inside(sb, REX_TMP), "⭐⭐⭐ the server made a sandbox — in its own temp folder, which its app data is not in", (rep && rep.stderr || "").slice(0, 500));
      ok(diag.ok === true && !!sb && inside(diag.userDir, sb), "⭐⭐⭐ …and collected its report there, not from the HOI4 folder detection finds", { diag, detected: FAKE_USER });
      const changed = hashOf(OLD_REPORT) !== oldHash;
      ok(!changed && clean(diff(before, snapshot(FAKE_HOME))), "⭐⭐⭐ …and the decoy's own report, and the rest of the fake machine, are untouched", diff(before, snapshot(FAKE_HOME)));
      if (changed) fs.writeFileSync(OLD_REPORT, OLD_REPORT_TEXT);   // on code that lets it through: the checks after this judge alone
    }
    {
      // ⛔ #a-relative-folder-is-no-choice — …BY RUNNING IT (review R3). run.js's shape with HOI4_USER_DIR "hoi4-user" — a folder under
      // wherever it started, which it never made — and no mods root. server.js found no such folder and went on to the decoy's own
      // mods folder, where New mod answered 200 with a mod made there. The relative value is filled, as a test's is.
      const decoyMods = path.join(FAKE_USER, "mod");
      const before = snapshot(decoyMods);
      const { rep, stderr } = runProbe("run.js", { mode: "create-mod", modName: "Probe Relative" },
        escapeEnv({ HOI4_USER_DIR: "hoi4-user", HOI4_MODS_ROOT: undefined }), ["-r", STUB]);
      const sb = (rep && rep.sandbox) || "";
      const c = (rep && rep.create) || {};
      ok(!!rep && !rep.interlock && !rep.harness && !!c.status, "THE CONTROL: run.js's shape with a relative HOI4_USER_DIR asked for a new mod", { rep, stderr: stderr.slice(-400) });
      ok(!!sb && inside(rep.env && rep.env.HOI4_USER_DIR, sb) && inside(rep.MODS_ROOT, sb),
        "⭐⭐⭐ its HOI4_USER_DIR is filled, and server.js's mods folder is in the sandbox — not the decoy's own", { env: rep && rep.env, MODS_ROOT: rep && rep.MODS_ROOT, sb });
      ok(c.status === 200 && c.ok && !!sb && inside(c.modRoot, sb), "⭐⭐ …where New mod made the mod", c);
      ok(clean(diff(before, snapshot(decoyMods))), "⭐⭐⭐ …and the decoy's own mods folder is untouched", diff(before, snapshot(decoyMods)));
    }
    {
      // …and an absolute one it named in temp and has not made yet is its own choice, kept — and made, since server.js takes a user
      // folder only once it exists and otherwise went on to the decoy's.
      const NOT_YET = path.join(CHILD_TMP, "a-user-folder-it-has-not-made-yet");
      const { rep } = runProbe("run.js", { mode: "mods-root" }, escapeEnv({ HOI4_USER_DIR: NOT_YET, HOI4_MODS_ROOT: undefined }), ["-r", STUB]);
      ok(!!rep && !rep.interlock && !rep.interlock2 && same(rep.env && rep.env.HOI4_USER_DIR, NOT_YET) && fs.existsSync(NOT_YET)
        && same(rep.MODS_ROOT, path.join(NOT_YET, "mod")),
        "⭐⭐ a HOI4_USER_DIR it named in temp and had not made yet is kept, and made: server.js's mods folder is in it, not the decoy's",
        { env: rep && rep.env && rep.env.HOI4_USER_DIR, made: fs.existsSync(NOT_YET), MODS_ROOT: rep && rep.MODS_ROOT });
      // server.js on its own: a TEST that names a user folder in temp that is not there keeps it as named (section D), and nothing makes it
      const NEVER = path.join(CHILD_TMP, "a-user-folder-a-test-named-and-never-made");
      const t = runProbe("test-bare-names-a-missing-user-folder.js", { mode: "mods-root" }, bareEnv({ HOI4_USER_DIR: NEVER }), ["-r", STUB]);
      ok(!!t.rep && !t.rep.interlock && !t.rep.interlock2 && same(t.rep.env && t.rep.env.HOI4_USER_DIR, NEVER) && !fs.existsSync(NEVER),
        "THE CONTROL: a test naming a user folder in temp that is not there keeps it as it named it, and it is not made", t.rep);
      ok(!!t.rep && t.rep.MODS_ROOT === "", "⭐⭐⭐ …and server.js names NO mods folder for it — not the decoy's own, which detection finds",
        { MODS_ROOT: t.rep && t.rep.MODS_ROOT, decoy: path.join(FAKE_USER, "mod") });
    }
    if (process.platform === "win32") {
      // ⛔ #the-app-data-nova-reads-goes-with-the-rest — …BY RUNNING IT (review R5). NOVA_APP_DATA_DIR in temp, which Nova never reads,
      // and the shell's own APPDATA left as it was: the line said "not into your real folders" while the backups went on into the
      // decoy's Roaming\NovaModdingSuite. APPDATA is where Nova keeps its app data on Windows, and it is filled with the rest.
      const { rep, stderr } = runProbe("run.js", { mode: "light" }, escapeEnv({ APPDATA: FAKE_APPDATA, XDG_CONFIG_HOME: undefined }));
      const sb = (rep && rep.sandbox) || "";
      ok(!!sb && same(rep.env && rep.env.NOVA_APP_DATA_DIR, K_APP), "THE CONTROL: NOVA_APP_DATA_DIR alone in temp made a sandbox, and what it set is kept", rep);
      ok(!!sb && same(rep.env.APPDATA, sb) && inside(rep.BACKUP_DIR, sb) && !inside(rep.BACKUP_DIR, FAKE_APPDATA),
        "⭐⭐⭐ …and APPDATA points into it with the rest: the backups are not filed in the decoy's Roaming folder", { env: rep && rep.env, BACKUP_DIR: rep && rep.BACKUP_DIR });
      ok(/\[nova\] run\.js keeps its app data in the temp folder[^\n]*\bAPPDATA\b[^\n]*->/.test(stderr), "…and the line names it among what it filled", stderr.slice(0, 400));
    }
    {
      // ⛔ #a-script-keeps-the-mods-it-made — review R6. run.js's shape with no mods root: server.js's mods folder is the sandbox's, New
      // mod made a mod there and answered 200 — and at exit the sandbox went, and the mod with it, with nothing said. A script that
      // builds a TEST world that way lost the build.
      const { rep, stderr } = runProbe("run.js", { mode: "create-mod", modName: "Probe Kept" }, escapeEnv({ HOI4_MODS_ROOT: undefined }), ["-r", STUB]);
      const sb = (rep && rep.sandbox) || "";
      const c = (rep && rep.create) || {};
      ok(!!sb && c.status === 200 && c.ok && inside(c.modRoot, sb),
        "THE CONTROL: with no mods root of its own, New mod made a mod in the mods folder server.js was given in the sandbox", { c, sb, stderr: stderr.slice(-300) });
      ok(!!sb && fs.existsSync(sb) && !!c.modRoot && fs.existsSync(path.join(c.modRoot, "descriptor.mod")),
        "⭐⭐⭐ …and once it has exited, the sandbox is still there, with the mod in it", { sb, modRoot: c.modRoot });
      ok(/\[nova\] kept .*holds 1 mod/.test(stderr) && !!sb && stderr.includes(sb), "⭐⭐ …and it said why, and where", stderr.slice(-400));
      // THE CONTROL against keeping a test's: the same from a test, whose mods are fixtures — run-tests.js removes its sandbox with them
      const t = runProbe("test-bare-makes-a-mod.js", { mode: "create-mod", modName: "Probe Fixture" }, bareEnv(), ["-r", STUB]);
      const tsb = (t.rep && t.rep.sandbox) || "";
      const tc = (t.rep && t.rep.create) || {};
      ok(!!tsb && tc.status === 200 && inside(tc.modRoot, tsb) && !fs.existsSync(tsb) && !/\[nova\] kept /.test(t.stderr),
        "THE CONTROL: a TEST's mod, made the same way, goes with its sandbox — a fixture, as under run-tests.js", { tc, tsb, stderr: t.stderr.slice(-300) });
    }
    {
      // review R7 — `node -e` has no main file: its sandbox and its line say "node". Asked of a real `node -e`, fenced as every probe
      // is (the plan above is only asked with an empty main).
      const script = [
        'const fs = require("fs"), os = require("os"), path = require("path");',
        "const FENCE = " + JSON.stringify(SCRATCH) + ";",
        "const real = (p) => { try { return fs.realpathSync.native(p); } catch (_) { return path.resolve(p); } };",
        "const within = (p) => !!p && real(p).toLowerCase().startsWith(real(FENCE).toLowerCase() + path.sep);",
        "if (![os.homedir(), process.env.USERPROFILE, process.env.OneDrive, process.env.APPDATA, process.env.HOI4_ROOT, os.tmpdir()].every(within)) {",
        "  process.stdout.write(JSON.stringify({ interlock: true })); process.exit(0);",
        "}",
        "const sw = require(" + JSON.stringify(path.join(__dirname, "safe-write.js")) + ");",
        "process.stdout.write(JSON.stringify({ sandbox: sw.BARE_TEST_SANDBOX }));",
      ].join("\n");
      const r = spawnSync(process.execPath, ["-e", script], { env: escapeEnv(), cwd: PROBES, encoding: "utf8", timeout: 60000 });
      let o = {};
      try { o = JSON.parse(String(r.stdout || "")); } catch (_) { o = { raw: String(r.stdout || "") + String(r.stderr || "") }; }
      const sb = o.sandbox || "";
      const err = String(r.stderr || "");
      ok(!!sb && !o.interlock && inside(sb, CHILD_TMP) && /^nova-bare-node-/.test(path.basename(sb)), "⭐⭐ `node -e` with run.js's env is given a sandbox, named for node", o);
      ok(/\[nova\] node keeps its app data in the temp folder/.test(err) && !!sb && err.includes(sb), "⭐ …and its line calls it node, naming the sandbox", err.slice(0, 300));
      ok(!!sb && !fs.existsSync(sb), "…and that sandbox goes when it exits", sb);
    }
    {
      // ⛔ #a-sandbox-where-temp-cannot-tell — …BY RUNNING IT (review S1). A harness's own temp folder sits above the home, its
      // NOVA_APP_DATA_DIR is in the user's own temp folder, and its mods root is the real one. The user's temp folder qualified it, its
      // sandbox was made in its own, and that one calls the real mod a fixture: no note, a backup named as temp, the release going by the
      // same folder. It answered 200 and at exit took the mod's backup and the folder Restore moved out of it. The commit before it stood down.
      const ABOVE = path.join(SCRATCH, "temp-above-the-home");
      const A_HOME = path.join(ABOVE, "home"), A_LOCAL = path.join(A_HOME, "AppData", "Local"), A_ROAM = path.join(A_HOME, "AppData", "Roaming");
      const A_MODS = path.join(A_HOME, "Documents", "Paradox Interactive", "Hearts of Iron IV", "mod");
      for (const d of [path.join(A_LOCAL, "Temp", "app"), A_ROAM, A_MODS]) fs.mkdirSync(d, { recursive: true });
      const aboveEnv = (extra = {}) => bareEnv(Object.assign({ USERPROFILE: A_HOME, HOME: A_HOME, OneDrive: path.join(A_HOME, "OneDrive"), APPDATA: A_ROAM, LOCALAPPDATA: A_LOCAL,
        TEMP: ABOVE, TMP: ABOVE, TMPDIR: ABOVE, NOVA_DOCUMENTS_DIR: undefined, HOI4_MODS_ROOT: A_MODS }, extra));
      const ITS_APP_DATA = { NOVA_APP_DATA_DIR: path.join(A_LOCAL, "Temp", "app") };
      const s = runProbe("run-temp-above-the-home.js", { mode: "outside", modParent: A_MODS }, aboveEnv(ITS_APP_DATA));
      ok(!!s.rep && !s.rep.interlock && !s.rep.harness && s.rep.sandbox === "" && !/\[nova\]/.test(s.stderr),
        "⭐⭐⭐ a script whose own temp folder holds the home folder stands down, as it did before the user's own could qualify it", { rep: s.rep, stderr: s.stderr.slice(0, 400) });
      const backups = s.rep && inside(s.rep.BACKUP_DIR, A_ROAM) ? walk(s.rep.BACKUP_DIR) : [];
      ok(backups.length === 1 && backups.every((f) => fs.statSync(f).size > 0), "⭐⭐⭐ …and the backup of the mod it wrote is in the machine's own backups folder, after it has exited",
        { BACKUP_DIR: s.rep && s.rep.BACKUP_DIR, backups });
      const r = runProbe("run-temp-above-the-home-restore.js", { mode: "outside-restore", modParent: A_MODS }, aboveEnv(ITS_APP_DATA));
      const moved = (r.rep && r.rep.restore && r.rep.restore.moved) || [];
      ok(!!r.rep && r.rep.sandbox === "" && !!r.rep.restore && r.rep.restore.ok && r.rep.restore.liveGone && moved.length === 1,
        "THE CONTROL: Restore moved a folder out of the same mod, with no sandbox made", r.rep);
      ok(moved.length === 1 && inside(moved[0], A_HOME) && fs.existsSync(path.join(moved[0], "ABC - Precious.txt")),
        "⭐⭐⭐ …and once it has exited, that folder is in the machine's own ~/.nova, the modder's only copy still there", moved);
      // A TEST in the same place is still given a sandbox (section D): and there the release cannot judge what is a fixture either.
      const t = runProbe("test-bare-temp-above-the-home.js", { mode: "outside", modParent: A_MODS }, aboveEnv());
      const tsb = (t.rep && t.rep.sandbox) || "";
      ok(!!tsb && inside(tsb, ABOVE) && inside(t.rep.BACKUP_DIR, tsb), "THE CONTROL: a test there is given a sandbox, in that temp folder", t.rep);
      ok(!!tsb && fs.existsSync(tsb) && walk(t.rep.BACKUP_DIR).length === 1 && /\[nova\] kept /.test(t.stderr) && t.stderr.includes(tsb),
        "⭐⭐⭐ …and a temp folder that cannot tell a fixture from a real file takes nothing away: the sandbox stays, with the backup in it, and says so", { tsb, stderr: t.stderr.slice(-400) });
    }
    {
      // ⛔ #a-child-of-a-run-is-part-of-it — …BY RUNNING IT (review S3). A bare test's child with the three app-data variables deleted and
      // NOVA_BARE_SANDBOX inherited: it made no sandbox, and the backup of a fixture landed in the decoy's Roaming backups. Then with all six
      // deleted, where its mods folder was the decoy's own (it only asks: nothing is written).
      const before = snapshot(FAKE_HOME);
      const { rep, stderr } = runProbe("test-bare-child-drops-app-data.js", { mode: "child-drops-one", work: "write-fixture-pool", drop: APP_VARS, runTmp: CHILD_TMP }, bareEnv());
      const sb = (rep && rep.sandbox) || "";
      const c = (rep && rep.child) || {};
      ok(!!sb && c.sandbox === "" && same(c.run, sb) && inside(c.wrote, CHILD_TMP),
        "THE CONTROL: a bare test's child with no app-data variable, told of the run, made no sandbox of its own and wrote a fixture with a pool backup", { sb, child: c });
      ok(!!sb && APP_VARS.every((k) => same(c.env && c.env[k], sb)) && inside(c.BACKUP_DIR, sb),
        "⭐⭐⭐ …what it dropped is filled from the run's sandbox, and its backups go there", { sb, env: c.env, BACKUP_DIR: c.BACKUP_DIR });
      ok(clean(diff(before, snapshot(FAKE_HOME))), "⭐⭐⭐ …not into the decoy's Roaming backups, nor anywhere else on the fake machine", diff(before, snapshot(FAKE_HOME)));
      ok(/\[nova\] \S+ is part of a run that has a sandbox/.test((rep && rep.childStderr) || ""), "⭐ …and the child said so", (rep && rep.childStderr) || "");
      ok(!!sb && !fs.existsSync(sb) && !/\[nova\] kept /.test(stderr), "…and that sandbox goes with the run: what it holds is a fixture's", { sb, stderr: stderr.slice(-300) });
      const six = runProbe("test-bare-child-drops-all.js", { mode: "child-drops-one", work: "ask-mods-root", drop: Object.keys(sw.BARE_TEST_ENV) }, bareEnv());
      const sb6 = (six.rep && six.rep.sandbox) || "";
      const c6 = (six.rep && six.rep.child) || {};
      ok(!!sb6 && c6.sandbox === "" && same(c6.MODS_ROOT, path.join(sb6, sw.BARE_MODS_FOLDER)),
        "⭐⭐⭐ with all six deleted, its mods folder is the run's sandbox's — not the decoy's own, which detection finds", { sb6, child: c6, decoy: path.join(FAKE_USER, "mod") });
    }
    {
      // ⛔ #any-folder-in-temp-says-so — …BY RUNNING IT (review S2). Each with the machine's own APPDATA, and one folder of its own in temp
      // or one relative value. Measured on the code before: the decoy's report rewritten, a baseline in its ~/.nova, a backup in its Roaming.
      const S2 = path.join(CHILD_TMP, "only-one-folder-in-temp");
      const mk = (n) => { const d = path.join(S2, n); fs.mkdirSync(d, { recursive: true }); return d; };
      const onlyEnv = (extra) => bareEnv(Object.assign({ NOVA_DOCUMENTS_DIR: undefined }, extra));
      for (const [k, v] of [["HOI4_MODS_ROOT", mk("mods")], ["NOVA_HOME_DIR", mk("home")], ["HOI4_USER_DIR", mk("user")], ["NOVA_DOCUMENTS_DIR", mk("docs")],
        ["APPDATA", "a-relative-app-data-folder"], ["NOVA_HOME_DIR", "a-relative-home"]]) {
        const label = k + (path.isAbsolute(v) ? " in temp" : " relative");
        const before = snapshot(FAKE_HOME);
        const { r, rep, stderr } = runProbe("run.js", { mode: "diag-in-process" }, onlyEnv({ [k]: v }), ["-r", STUB]);
        const sb = (rep && rep.sandbox) || "";
        const diag = (rep && rep.diag) || {};
        ok(!!rep && !rep.interlock && !rep.interlock2 && !rep.harness && r.status === 0, "THE CONTROL (" + label + "): it ran on the fake machine, fenced into this test's scratch folder",
          { status: r.status, rep, stderr: stderr.slice(-400) });
        ok(!!sb && inside(sb, CHILD_TMP), "⭐⭐⭐ (" + label + ") a sandbox was made, inside its temp folder", { sandbox: sb, stderr: stderr.slice(0, 400) });
        ok(!!sb && (path.isAbsolute(v) ? same(rep.env[k], v) : (same(rep.env[k], sb) || inside(rep.env[k], sb))),
          "⭐⭐ (" + label + ") " + (path.isAbsolute(v) ? "what it named is kept" : "a relative value is filled, as it is beside app data in temp"), rep && rep.env);
        ok(!!sb && inside(rep.BACKUP_DIR, sb), "⭐⭐⭐ (" + label + ") its backups go into the sandbox, not among the machine's own", rep && rep.BACKUP_DIR);
        ok(diag.ok === true && !!sb && (inside(diag.savedPath, sb) || inside(diag.savedPath, v)), "⭐⭐⭐ (" + label + ") GET /api/diag/hoi4 wrote its report in a folder of the run's", diag);
        const d = diff(before, snapshot(FAKE_HOME));
        const changed = hashOf(OLD_REPORT) !== oldHash;
        ok(clean(d) && !changed, "⭐⭐⭐ (" + label + ") NOTHING was written into the fake machine: its HOI4 folder, its ~/.nova, its Roaming", d);
        if (changed) fs.writeFileSync(OLD_REPORT, OLD_REPORT_TEXT);   // on code that lets it through: the checks after this judge alone
        ok(new RegExp("\\[nova\\] run\\.js " + (path.isAbsolute(v) ? "keeps " + k + " in the temp folder" : "sets " + k + " to a relative folder")).test(stderr),
          "⭐ (" + label + ") …and the line says what it was judged by", stderr.slice(0, 300));
      }
      // …and New mod, which landed in the decoy's own mods folder: with a relative APPDATA it is made in the sandbox's, and kept
      const decoyMods = path.join(FAKE_USER, "mod");
      const before = snapshot(decoyMods);
      const made = runProbe("run.js", { mode: "create-mod", modName: "Probe Relative App Data" }, onlyEnv({ APPDATA: "a-relative-app-data-folder" }), ["-r", STUB]);
      const sb = (made.rep && made.rep.sandbox) || "";
      const c = (made.rep && made.rep.create) || {};
      ok(c.status === 200 && !!sb && inside(c.modRoot, sb), "⭐⭐⭐ with a relative APPDATA alone, New mod makes the mod in the sandbox", { c, sb, stderr: made.stderr.slice(-300) });
      ok(clean(diff(before, snapshot(decoyMods))), "⭐⭐⭐ …and the decoy's own mods folder is untouched", diff(before, snapshot(decoyMods)));
      ok(!!sb && fs.existsSync(sb) && /\[nova\] kept .*holds 1 mod/.test(made.stderr), "…and the mod a script made keeps the sandbox", made.stderr.slice(-300));
      // HOI4_MODS_ROOT named and not made. In temp it is the script's own, and made (as a user folder is). Outside temp nothing can make it
      // the script's, and server.js went on to the real mods folder: it now names none, as it does for HOI4_USER_DIR.
      const NOT_YET = path.join(S2, "mods-not-made-yet");
      const y = runProbe("run.js", { mode: "mods-root" }, onlyEnv({ HOI4_MODS_ROOT: NOT_YET }), ["-r", STUB]);
      ok(!!y.rep && !y.rep.interlock && !y.rep.interlock2 && !!y.rep.sandbox && same(y.rep.MODS_ROOT, NOT_YET) && fs.existsSync(NOT_YET),
        "⭐⭐ a HOI4_MODS_ROOT it named in temp and had not made yet is kept, and made: server.js's mods folder is that one", y.rep);
      const NEVER = path.join(OUTSIDE, "a-mods-folder-nobody-made");
      const n = runProbe("run.js", { mode: "mods-root" }, onlyEnv({ HOI4_MODS_ROOT: NEVER }), ["-r", STUB]);
      ok(!!n.rep && !n.rep.interlock && !n.rep.interlock2 && n.rep.sandbox === "" && n.rep.MODS_ROOT === "" && !fs.existsSync(NEVER),
        "⭐⭐⭐ an explicit HOI4_MODS_ROOT that does not exist, outside temp, names NO mods folder — not the decoy's own, which detection finds", { MODS_ROOT: n.rep && n.rep.MODS_ROOT, decoy: decoyMods });
      const b = runProbe("run.js", { mode: "mods-root" }, onlyEnv({ HOI4_MODS_ROOT: "   " }), ["-r", STUB]);
      ok(!!b.rep && !b.rep.interlock && !b.rep.interlock2 && same(b.rep.MODS_ROOT, decoyMods), "THE CONTROL: a blank one is no choice of a folder: the one the launcher names is the mods folder", b.rep);
    }
    if (process.platform === "win32") {
      // ⛔ #a-temp-folder-above-the-app-data — …BY RUNNING IT (review S7). A real `node server.js` with TEMP=<home>\AppData and APPDATA at its
      // default: a sandbox appeared under AppData, and the mods folder and the report went into it.
      const A = path.dirname(FAKE_APPDATA);
      const { rep, stderr } = runProbe("real-launch.js", { mode: "light" }, bareEnv({ TEMP: A, TMP: A, TMPDIR: A }));
      ok(!!rep && !rep.interlock && same(rep.tmp, A) && rep.sandbox === "" && same(rep.env.APPDATA, FAKE_APPDATA) && inside(rep.BACKUP_DIR, FAKE_APPDATA) && !/\[nova\]/.test(stderr),
        "⭐⭐⭐ a process on the machine's own folders, with its temp folder above APPDATA, keeps them: no sandbox, and nothing said", { rep, stderr: stderr.slice(0, 300) });
    }
    {
      // THE WORLD BUILD: build-t31.js sets its app data and its ~/.nova in temp and its mods root to the owner's real one, outside
      // temp, on purpose. That must keep working — the mods folder it named stays — and the two it left unset are filled.
      const env = bareEnv({ APPDATA: K_APP, NOVA_APP_DATA_DIR: K_APP, XDG_CONFIG_HOME: K_APP, NOVA_HOME_DIR: K_HOME, HOI4_MODS_ROOT: K_REAL_MODS,
        NOVA_DOCUMENTS_DIR: undefined });
      const { rep, stderr } = runProbe("build-t31.js", { mode: "mods-root" }, env, ["-r", STUB]);
      const sb = (rep && rep.sandbox) || "";
      ok(!!rep && !rep.interlock && !rep.interlock2 && same(rep.MODS_ROOT, K_REAL_MODS) && same(rep.env && rep.env.NOVA_HOME_DIR, K_HOME),
        "⭐⭐⭐ THE CONTROL: the world build keeps the mods folder it named — outside temp, as the owner's real one is — and its own ~/.nova",
        { rep, stderr: stderr.slice(-300) });
      ok(!!sb && inside(rep.env.HOI4_USER_DIR, sb) && inside(rep.env.NOVA_DOCUMENTS_DIR, sb), "⭐⭐ …and the two it left unset are filled", rep && rep.env);
    }
    {
      // THE CONTROL: run.js as it was fixed by hand — every one of them set, as run-tests.js sets them — is left alone.
      fs.mkdirSync(path.join(K_APP, "hoi4-user"), { recursive: true });
      const env = bareEnv({ APPDATA: K_APP, NOVA_APP_DATA_DIR: K_APP, XDG_CONFIG_HOME: K_APP, NOVA_HOME_DIR: K_HOME, HOI4_MODS_ROOT: K_MODS,
        HOI4_USER_DIR: path.join(K_APP, "hoi4-user"), NOVA_DOCUMENTS_DIR: path.join(K_APP, "Documents") });
      const { rep, stderr } = runProbe("run.js", { mode: "light" }, env);
      ok(!!rep && rep.sandbox === "" && !/\[nova\]/.test(stderr), "THE CONTROL: a script that sets every one of them is left exactly as it is, and nothing is said",
        { rep, stderr: stderr.slice(0, 300) });
    }
  }
} finally {
  // This test's own mkdtemp folder: the fake machine, the probes, and the sandboxes section F keeps on purpose (copies of
  // fixtures this test wrote into its own scratch folder a moment ago — nothing of anyone's).
  try { fs.rmSync(SCRATCH, { recursive: true, force: true, maxRetries: 3 }); } catch (_) {}
}

console.log("\n" + (fail ? "FAILED " + fail + "/" + (pass + fail) : "PASSED " + pass + "/" + pass));
process.exitCode = fail ? 1 : 0;
