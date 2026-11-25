// ⛔ #the-report-says-whether-its-copy-was-saved — COLLECT DIAGNOSTICS SAID "SAVED A COPY" WHEN NOTHING WAS SAVED.
//
// GET /api/diag/hoi4 (collectHoi4Diagnostics, server.js) bundles the game's logs and crash dumps into one report, and keeps a
// copy, nova_diagnostics.txt, in the HOI4 user folder. When that write failed — a folder of that name in the way, a read-only
// folder — it still answered ok, with savedPath "", and Home (public/home.js) rendered `Saved a copy to ${d.savedPath || "your
// HOI4 folder"}`: a copy the owner would go and look for, which was never written (review R8 of the bare-run guard; it was there
// before that change). Now the server says why the copy was not written (saveError), and the page says it could not be saved
// and that the box below is the only copy.
//
//   1. the page's own sentence, lifted out of public/home.js and asked, and the Collect line built from it;
//   2. the server, in a child whose home folders all point into this test's own temp folder — it refuses to load server.js
//      otherwise — with a user folder holding a FOLDER named nova_diagnostics.txt, and one that does not.
//
// ⛔ #nothing-to-report-keeps-the-last-report — …AND SAID "✓ COLLECTED … SAVED A COPY" WITH NOTHING TO REPORT, replacing the report of the last
// crash with one that says nothing (review S4). ⛔ #the-report-says-what-it-could-not-read — and a log the game held locked read as no logs,
// an unreadable crashes folder as "the game didn't hard-crash". ⛔ #a-variable-that-names-no-folder — and with one typo in HOI4_USER_DIR, the
// variable its own error says to set, it told the modder to set it, and New mod sent them to the launcher (review S5).
//   3. the server again, on a user folder for each of those;
//   4. the messages, in a child whose variables name no folder when it loads.
//
// ⚠️ Nothing here touches the owner's real folders: every folder the child could write the report into is inside this test's
// own mkdtemp folder, and the child checks that before it loads server.js. The server listens on a port the system picks.
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const { maskJsComments, maskJsLiterals, jsBodyAt } = require("./testlib-strip-comments.js");
// a bare run gets its sandbox before the child below inherits this process's env (test-a-bare-test-run-stays-out-of-the-real-folders.js)
require("./safe-write.js");

let pass = 0, fail = 0;
const ok = (c, m, x) => {
  if (c) { pass++; console.log("  ok   " + m); }
  else { fail++; console.log("  FAIL " + m + (x !== undefined ? "   -> " + JSON.stringify(x).slice(0, 600) : "")); }
};
const same = (a, b) => !!a && !!b && path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();

console.log("\n1. the page says whether the copy was saved");
{
  const HOME = fs.readFileSync(path.join(__dirname, "public", "home.js"), "utf8");
  const LITS = maskJsLiterals(HOME);
  const at = LITS.indexOf("function diagnosticsCopyLine(");
  const body = at < 0 ? null : jsBodyAt(LITS, at);
  let line = null;
  try { line = body ? new Function(HOME.slice(at, body[1] + 1) + "\nreturn diagnosticsCopyLine;")() : null; } catch (_) { line = null; }
  ok(typeof line === "function", "THE CONTROL: diagnosticsCopyLine is lifted out of public/home.js", { at, body });
  if (typeof line === "function") {
    const savedAt = "C:\\Users\\x\\Documents\\Paradox Interactive\\Hearts of Iron IV\\nova_diagnostics.txt";
    const saved = line({ ok: true, userDir: path.dirname(savedAt), savedPath: savedAt, saveError: "" });
    ok(saved === "Saved a copy to " + savedAt + ".", "THE CONTROL: a copy that was saved is named, as it always was", saved);
    const why = "EISDIR: illegal operation on a directory, open 'C:\\Users\\x\\HOI4\\nova_diagnostics.txt'";
    const notSaved = line({ ok: true, userDir: "C:\\Users\\x\\HOI4", savedPath: "", saveError: why });
    ok(!/saved a copy/i.test(notSaved) && /Could not save a copy/.test(notSaved), "⭐⭐⭐ a copy that was not saved is not called saved", notSaved);
    ok(notSaved.includes("C:\\Users\\x\\HOI4") && notSaved.includes(why), "⭐⭐ …it says where it tried, and the server's reason", notSaved);
    ok(/only copy/.test(notSaved), "⭐ …and that the box below is the only copy there is", notSaved);
    const noReason = line({ ok: true, savedPath: "" });
    ok(!/saved a copy/i.test(noReason) && /Could not save a copy/.test(noReason), "⭐ …and so with no reason or folder given", noReason);
  }
  // The Collect line is built from it, and the fallback that named a copy with no path is gone — read in the code, not the prose.
  const CODE = maskJsComments(HOME);
  const statusAt = LITS.indexOf("function diagnosticsStatus(");
  const statusBody = statusAt < 0 ? null : jsBodyAt(LITS, statusAt);
  let status = null;
  try { status = statusBody && body ? new Function(HOME.slice(at, body[1] + 1) + "\n" + HOME.slice(statusAt, statusBody[1] + 1) + "\nreturn diagnosticsStatus;")() : null; } catch (_) { status = null; }
  ok(typeof status === "function", "THE CONTROL: diagnosticsStatus is lifted out of public/home.js", { statusAt, statusBody });
  ok(/const said = diagnosticsStatus\(d\);[\s\S]{0,120}diagStatus\.style\.color = said\.color;[\s\S]{0,80}diagStatus\.textContent = said\.text;/.test(CODE),
    "⭐⭐ the Collect handler says what it says, in the colour it says it", "");
  ok(!/savedPath\s*\|\|\s*"your HOI4 folder"/.test(CODE), "⭐⭐ …and nothing calls a copy with no path \"your HOI4 folder\" any more", "");
  if (typeof status === "function") {
    const GREEN = "#3fb950", ORANGE = "#f0883e";
    const U = "C:\\Users\\x\\HOI4";
    const saved = status({ userDir: U, crashCount: 0, latestCrash: null, savedPath: U + "\\nova_diagnostics.txt", saveError: "", nothingToReport: false, earlierReport: "", unread: [] });
    ok(saved.color === GREEN && /^✓ Collected\. 0 crash dump\(s\)\. Saved a copy to /.test(saved.text) && /Paste the box below to me\.$/.test(saved.text),
      "THE CONTROL: a report that was collected and saved is the green line it always was", saved);
    const crash = status({ userDir: U, crashCount: 2, latestCrash: "crash_1", savedPath: U + "\\nova_diagnostics.txt", saveError: "", nothingToReport: false, earlierReport: "", unread: [] });
    ok(crash.color === ORANGE && /2 crash dump\(s\) \(latest: crash_1\)/.test(crash.text), "THE CONTROL: …a crash dump makes it orange, as it always did", crash);
    const notSaved = status({ userDir: U, crashCount: 0, savedPath: "", saveError: "EISDIR", nothingToReport: false, earlierReport: "", unread: [] });
    ok(notSaved.color === ORANGE && /Could not save a copy/.test(notSaved.text), "THE CONTROL: …and so does a copy that could not be saved", notSaved);
    const none = status({ userDir: U, crashCount: 0, savedPath: "", saveError: "", nothingToReport: true, earlierReport: "", unread: [] });
    ok(none.color === ORANGE && /^Nothing to report/.test(none.text) && none.text.includes(U), "⭐⭐⭐ nothing to report has its own orange line, saying where it looked", none);
    ok(!/✓|Collected|Saved a copy|Paste the box/i.test(none.text), "⭐⭐⭐ …with no tick, no \"saved\", and no box worth pasting", none);
    const earlier = status({ userDir: U, crashCount: 0, savedPath: "", saveError: "", nothingToReport: true, earlierReport: U + "\\nova_diagnostics.txt", unread: [] });
    ok(earlier.text.includes("Your earlier report is still in " + U + "\\nova_diagnostics.txt"), "⭐⭐ …and it says the earlier report is still there, and where", earlier);
    const locked = status({ userDir: U, crashCount: 0, savedPath: "", saveError: "", nothingToReport: true, earlierReport: "", unread: ["logs\\error.log: EBUSY: resource busy or locked"] });
    ok(locked.color === ORANGE && locked.text.includes("Could not read logs\\error.log: EBUSY") && /no log it could read/.test(locked.text), "⭐⭐⭐ …and names a log it could not read: it does not say there are none", locked);
    const partly = status({ userDir: U, crashCount: 0, savedPath: U + "\\nova_diagnostics.txt", saveError: "", nothingToReport: false, earlierReport: "", unread: ["logs\\game.log: EBUSY"] });
    ok(partly.color === ORANGE && /^✓ Collected/.test(partly.text) && partly.text.includes("Could not read logs\\game.log: EBUSY") && /Paste the box below to me\.$/.test(partly.text),
      "⭐⭐ a report missing one log is orange, and says which", partly);
    const many = status({ userDir: U, crashCount: 0, savedPath: "x", saveError: "", nothingToReport: false, earlierReport: "", unread: ["a: 1", "b: 2", "c: 3", "d: 4", "e: 5"] });
    ok(/a: 1; b: 2; c: 3 and 2 more\./.test(many.text) && !many.text.includes("d: 4"), "…and a long list does not bury the line", many);
  }
}

console.log("\n2. the server says why a copy was not saved");
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "nova-diag-copy-"));
try {
  const DECOY_HOME = path.join(TMP, "home");
  const BLOCKED = path.join(TMP, "user-with-a-folder-in-the-way");
  const FREE = path.join(TMP, "user-with-room");
  const APP = path.join(TMP, "appdata"), GAME = path.join(TMP, "game"), MODS = path.join(TMP, "mods"), DOCS = path.join(TMP, "Documents");
  for (const d of [DECOY_HOME, path.join(BLOCKED, "logs"), path.join(FREE, "logs"), APP, GAME, MODS, DOCS]) fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(path.join(BLOCKED, "logs", "error.log"), "[decoy] a log the report includes\n");
  fs.writeFileSync(path.join(FREE, "logs", "error.log"), "[decoy] a log the report includes\n");
  const IN_THE_WAY = path.join(BLOCKED, "nova_diagnostics.txt");
  fs.mkdirSync(IN_THE_WAY);                                    // a FOLDER where the copy goes: writing it fails
  fs.writeFileSync(path.join(GAME, "hoi4.exe"), "");           // a game folder is recognised by this
  // ── section 3's user folders, one for each thing a report can have nothing of ──
  const EARLIER = "===== NOVA HOI4 DIAGNOSTICS =====\n[decoy] the report of the last crash, whose logs are gone\n";
  const REPORT = "nova_diagnostics.txt";
  const put = (p, text) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, text); };
  const USERS = {};
  const user = (name) => { const d = path.join(TMP, "users", name); fs.mkdirSync(d, { recursive: true }); USERS[name] = d; return d; };
  user("empty");                                                             // nothing at all: the first click on a new machine
  put(path.join(user("emptyWithReport"), REPORT), EARLIER);                  // …with the report of the last crash in it
  put(path.join(user("emptyLogs"), "logs", "error.log"), "  \n");            // a log with nothing in it is no log to report
  put(path.join(USERS.emptyLogs, REPORT), EARLIER);
  fs.mkdirSync(path.join(user("logUnreadable"), "logs", "error.log"), { recursive: true });   // a FOLDER where a log is: the read fails, every time
  put(path.join(USERS.logUnreadable, REPORT), EARLIER);
  put(path.join(user("logsAFile"), "logs"), "a file where the logs folder goes");
  put(path.join(USERS.logsAFile, REPORT), EARLIER);
  put(path.join(user("crashesAFile"), "crashes"), "a file where the crashes folder goes");
  put(path.join(USERS.crashesAFile, REPORT), EARLIER);
  put(path.join(user("oneLogOfTwo"), "logs", "error.log"), "[decoy] the log that can be read\n");
  fs.mkdirSync(path.join(USERS.oneLogOfTwo, "logs", "game.log"), { recursive: true });
  put(path.join(user("aCrash"), "crashes", "crash_1", "exception.txt"), "[decoy] access violation\n");   // no meta.yml, no dlc_load.json: neither a failure
  fs.mkdirSync(path.join(USERS.aCrash, "crashes", "crash_2", "meta.yml"), { recursive: true });           // …but a file that is there and cannot be read is
  put(path.join(USERS.aCrash, REPORT), EARLIER);
  put(path.join(user("lockedLog"), "logs", "error.log"), "[decoy] the game holds this one\n");
  put(path.join(USERS.lockedLog, REPORT), EARLIER);
  const OUT = path.join(TMP, "probe-out.json");
  const script = [
    'const fs = require("fs"), os = require("os"), path = require("path"), http = require("http");',
    "const TMP = " + JSON.stringify(TMP) + ", OUT = " + JSON.stringify(OUT) + ", FREE = " + JSON.stringify(FREE) + ", USERS = " + JSON.stringify(USERS) + ";",
    "const inside = (p) => !!p && path.resolve(p).toLowerCase().startsWith(path.resolve(TMP).toLowerCase() + path.sep);",
    "const roots = [os.homedir(), process.env.USERPROFILE, process.env.OneDrive, process.env.APPDATA, process.env.HOI4_USER_DIR,",
    "  process.env.NOVA_DOCUMENTS_DIR, process.env.NOVA_HOME_DIR, process.env.HOI4_MODS_ROOT, process.env.HOI4_ROOT];",
    "if (!roots.every(inside)) { fs.writeFileSync(OUT, JSON.stringify({ interlock: roots })); process.exit(0); }",
    "const { createApp } = require(" + JSON.stringify(path.join(__dirname, "server.js")) + ");",
    "const get = (port) => new Promise((res, rej) => {",
    '  http.get({ host: "127.0.0.1", port, path: "/api/diag/hoi4", agent: false }, (r) => {',
    '    let d = ""; r.on("data", (c) => { d += c; });',
    '    r.on("end", () => { try { const b = JSON.parse(d); res({ status: r.statusCode, ok: b.ok, userDir: b.userDir || "", savedPath: b.savedPath || "",',
    '      saveError: b.saveError || "", hasReport: typeof b.report === "string" && b.report.length > 0, report: b.report || "", crashCount: b.crashCount,',
    '      nothingToReport: b.nothingToReport, earlierReport: b.earlierReport || "", unread: b.unread }); } catch (e) { rej(e); } });',
    '  }).on("error", rej);',
    "});",
    'const srv = createApp().listen(0, "127.0.0.1", async () => {',
    "  const out = {};",
    "  try {",
    "    out.blocked = await get(srv.address().port);",
    "    process.env.HOI4_USER_DIR = FREE;",
    "    out.free = await get(srv.address().port);",
    "    out.users = {};",
    "    for (const [name, dir] of Object.entries(USERS)) {",
    "      process.env.HOI4_USER_DIR = dir;",
    // the lock a running program can hold on a file, which no other open gets past (Windows only: FILE_SHARE_NONE)
    '      const lock = name === "lockedLog" && process.platform === "win32" && fs.constants.UV_FS_O_EXLOCK ? fs.openSync(path.join(dir, "logs", "error.log"), fs.constants.O_RDONLY | fs.constants.UV_FS_O_EXLOCK) : null;',
    "      try { out.users[name] = await get(srv.address().port); }",
    "      finally { if (lock !== null) fs.closeSync(lock); }",
    '      out.users[name].exlock = lock !== null;',
    "    }",
    "  } catch (e) { out.harness = String((e && e.stack) || e); }",
    // written to a file before exiting: on Windows an exit while sockets close can abort the process (libuv UV_HANDLE_CLOSING)
    "  fs.writeFileSync(OUT, JSON.stringify(out));",
    "  setImmediate(() => { try { srv.closeAllConnections(); } catch (_) {} srv.close(); process.exit(0); });",
    "});",
  ].join("\n");
  const env = Object.assign({}, process.env, {
    USERPROFILE: DECOY_HOME, HOME: DECOY_HOME, OneDrive: path.join(DECOY_HOME, "OneDrive"),
    APPDATA: APP, XDG_CONFIG_HOME: APP, NOVA_APP_DATA_DIR: APP, NOVA_HOME_DIR: path.join(TMP, "nova-home"),
    HOI4_USER_DIR: BLOCKED, HOI4_MODS_ROOT: MODS, NOVA_DOCUMENTS_DIR: DOCS, HOI4_ROOT: GAME,
  });
  const run = spawnSync(process.execPath, ["-e", script], { env, cwd: TMP, encoding: "utf8", timeout: 120000 });
  let r = null;
  try { r = JSON.parse(fs.readFileSync(OUT, "utf8")); } catch (e) { r = { harness: (String(run.stderr || "") + String(run.stdout || "")).slice(-600) }; }
  ok(!!r && !r.interlock && !r.harness && !!r.blocked && !!r.free, "THE CONTROL: the child fenced its folders into this test's temp folder and asked twice", r);
  if (r && r.free && r.blocked) {
    const free = r.free, blocked = r.blocked;
    ok(free.status === 200 && free.ok === true && same(free.savedPath, path.join(FREE, "nova_diagnostics.txt")) && free.saveError === ""
      && fs.statSync(path.join(FREE, "nova_diagnostics.txt")).isFile(),
      "THE CONTROL: with nothing in the way the copy is written, named, and no reason given", free);
    ok(blocked.status === 200 && blocked.ok === true && blocked.hasReport && blocked.savedPath === "" && same(blocked.userDir, BLOCKED),
      "THE CONTROL: with a folder named nova_diagnostics.txt in the way the report is still collected, and no copy is named", blocked);
    ok(/EISDIR|EPERM|EACCES|directory/i.test(blocked.saveError), "⭐⭐⭐ …and the server says why the copy could not be written", blocked);
    ok(fs.statSync(IN_THE_WAY).isDirectory() && fs.readdirSync(IN_THE_WAY).length === 0, "…and the folder in the way is left as it was", fs.readdirSync(IN_THE_WAY));
  }

  console.log("\n3. nothing to report keeps the last report, and what could not be read is named");
  const U = (r && r.users) || {};
  for (const n of Object.keys(U)) U[n].unread = U[n].unread || [];
  const report = (name) => { try { return fs.readFileSync(path.join(USERS[name], REPORT), "utf8"); } catch (_) { return null; } };
  ok(Object.keys(USERS).every((n) => U[n] && U[n].status === 200 && U[n].ok === true), "THE CONTROL: the server answered ok for every user folder", Object.keys(U));
  if (Object.keys(USERS).every((n) => U[n])) {
    ok(U.empty.nothingToReport === true && U.empty.savedPath === "" && U.empty.earlierReport === "" && report("empty") === null,
      "⭐⭐⭐ with no crash dump and no log there is nothing to report, and no copy of nothing is written", { answer: U.empty, file: report("empty") });
    ok(same(U.empty.userDir, USERS.empty) && U.empty.unread.length === 0, "⭐ …it says where it looked, and a folder that is simply not there is no failure", U.empty);
    ok(U.emptyWithReport.nothingToReport === true && U.emptyWithReport.savedPath === "" && report("emptyWithReport") === EARLIER,
      "⭐⭐⭐ …and the earlier report is byte for byte what it was (it was replaced by one saying nothing)", { answer: U.emptyWithReport, file: report("emptyWithReport") });
    ok(same(U.emptyWithReport.earlierReport, path.join(USERS.emptyWithReport, REPORT)), "⭐⭐ …and the answer names it, for Home to say so", U.emptyWithReport);
    ok(U.emptyLogs.nothingToReport === true && report("emptyLogs") === EARLIER && U.emptyLogs.unread.length === 0, "⭐ a log with nothing in it is nothing to report either", U.emptyLogs);
    const unreadable = U.logUnreadable;
    ok(unreadable.nothingToReport === true && report("logUnreadable") === EARLIER, "⭐⭐⭐ a log that could not be read is no report to replace the last one with", { answer: unreadable, file: report("logUnreadable") });
    ok(unreadable.unread.length === 1 && /logs[\\/]error\.log: EISDIR/i.test(unreadable.unread[0]), "⭐⭐⭐ …the answer names it, and why", unreadable.unread);
    ok(/could not read logs[\\/]error\.log: EISDIR/i.test(unreadable.report) && !/no non-empty logs/.test(unreadable.report), "⭐⭐⭐ …and the report says so: it does not say there are no logs", unreadable.report);
    const lf = U.logsAFile;
    ok(lf.nothingToReport === true && report("logsAFile") === EARLIER && lf.unread.length === 1 && /^logs: ENOTDIR/.test(lf.unread[0]) && /could not read logs: ENOTDIR/.test(lf.report) && !/no non-empty logs/.test(lf.report),
      "⭐⭐⭐ a logs folder that could not be read is reported, not skipped", lf);
    const cf = U.crashesAFile;
    ok(cf.nothingToReport === true && report("crashesAFile") === EARLIER && cf.unread.length === 1 && /^crashes: ENOTDIR/.test(cf.unread[0]),
      "⭐⭐⭐ …and so is a crashes folder", cf);
    ok(/could not read crashes: ENOTDIR/.test(cf.report) && !/didn't hard-crash/.test(cf.report), "⭐⭐⭐ …and the report does not say the game didn't crash", cf.report);
    const part = U.oneLogOfTwo;
    ok(part.nothingToReport === false && same(part.savedPath, path.join(USERS.oneLogOfTwo, REPORT)) && /the log that can be read/.test(report("oneLogOfTwo") || ""),
      "THE CONTROL: one log read of two is a report, and its copy is written", part);
    ok(part.unread.length === 1 && /logs[\\/]game\.log: EISDIR/i.test(part.unread[0]) && /could not read logs[\\/]game\.log/.test(report("oneLogOfTwo") || ""),
      "⭐⭐ …which names the one it could not read, in the answer and in the report", part.unread);
    const crash = U.aCrash;
    ok(crash.nothingToReport === false && crash.crashCount === 2 && same(crash.savedPath, path.join(USERS.aCrash, REPORT)) && /access violation/.test(report("aCrash") || ""),
      "THE CONTROL: a crash dump is a report, and replaces the one before", crash);
    ok(crash.unread.length === 1 && /crash_2[\\/]meta\.yml: EISDIR/i.test(crash.unread[0]) && /could not read crashes[\\/]crash_2[\\/]meta\.yml/.test(report("aCrash") || ""),
      "⭐⭐ …a crash's file that is there and could not be read is named; the ones a dump does not have are no failure", crash.unread);
    if (U.lockedLog.exlock) {
      const lock = U.lockedLog;
      ok(lock.nothingToReport === true && lock.unread.length === 1 && /logs[\\/]error\.log: EBUSY/i.test(lock.unread[0]) && !/no non-empty logs/.test(lock.report) && report("lockedLog") === EARLIER,
        "⭐⭐⭐ a log held under an exclusive lock, as a running program can hold one, is named as locked and keeps the last report", lock);
    } else console.log("  (no exclusive locks on this system: the unreadable log above stands for it)");
  }

  console.log("\n4. a variable that names no folder is what the messages say");
  {
    // Decided per process: MODS_ROOT is worked out once, when server.js loads. This child's temp folder holds neither its home nor anything
    // it names (so the guard has no sandbox to make, and makes no folder for it): the machine's own folders, with one typo in a variable.
    const OWN_TMP = path.join(TMP, "a-temp-folder-of-its-own");
    fs.mkdirSync(OWN_TMP, { recursive: true });
    const messages = (name, variables) => {
      const out = path.join(TMP, "messages-" + name + ".json");
      const child = [
        'const fs = require("fs"), os = require("os"), path = require("path"), http = require("http");',
        // refuses to load server.js outside this test's own temp folder, as the child of section 2 does
        "const inside = (p) => !!p && path.resolve(p).toLowerCase().startsWith(path.resolve(" + JSON.stringify(TMP) + ").toLowerCase() + path.sep);",
        "const roots = [os.homedir(), process.env.USERPROFILE, process.env.OneDrive, process.env.APPDATA, process.env.NOVA_DOCUMENTS_DIR, process.env.HOI4_ROOT, os.tmpdir()];",
        "if (!roots.every(inside)) { fs.writeFileSync(" + JSON.stringify(out) + ", JSON.stringify({ harness: \"interlock\", roots })); process.exit(0); }",
        "const server = require(" + JSON.stringify(path.join(__dirname, "server.js")) + ");",
        "const sw = require(" + JSON.stringify(path.join(__dirname, "safe-write.js")) + ");",
        "const O = { sandbox: sw.BARE_TEST_SANDBOX, MODS_ROOT: server.constants.MODS_ROOT || \"\" };",
        "const ask = (port, method, p, body) => new Promise((res, rej) => {",
        "  const data = body ? JSON.stringify(body) : \"\";",
        '  const q = http.request({ host: "127.0.0.1", port, path: p, method, agent: false, headers: data ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data) } : {} }, (r) => {',
        '    let d = ""; r.on("data", (c) => { d += c; }); r.on("end", () => { try { res({ status: r.statusCode, body: JSON.parse(d) }); } catch (e) { rej(e); } });',
        "  });",
        '  q.on("error", rej); if (data) q.write(data); q.end();',
        "});",
        // New mod is asked only with no mods folder at all, where nothing can be created by asking
        'const srv = server.createApp().listen(0, "127.0.0.1", async () => {',
        "  try {",
        '    O.diag = await ask(srv.address().port, "GET", "/api/diag/hoi4");',
        '    if (!O.MODS_ROOT) O.create = await ask(srv.address().port, "POST", "/api/mod/create", { modName: "probe_typo", dependencies: [] });',
        "  } catch (e) { O.harness = String((e && e.stack) || e); }",
        "  fs.writeFileSync(" + JSON.stringify(out) + ", JSON.stringify(O));",
        "  setImmediate(() => { try { srv.closeAllConnections(); } catch (_) {} srv.close(); process.exit(0); });",
        "});",
      ].join("\n");
      const DECOY = path.join(TMP, "home-" + name);
      const USER = path.join(DECOY, "Documents", "Paradox Interactive", "Hearts of Iron IV");
      fs.mkdirSync(path.join(USER, "mod"), { recursive: true });
      const env = Object.assign({}, process.env, {
        USERPROFILE: DECOY, HOME: DECOY, OneDrive: path.join(DECOY, "OneDrive"), LOCALAPPDATA: path.join(DECOY, "AppData", "Local"), APPDATA: path.join(DECOY, "AppData", "Roaming"),
        NOVA_DOCUMENTS_DIR: path.join(DECOY, "Documents"), HOI4_ROOT: GAME, TEMP: OWN_TMP, TMP: OWN_TMP, TMPDIR: OWN_TMP,
      });
      for (const k of ["XDG_CONFIG_HOME", "NOVA_APP_DATA_DIR", "NOVA_HOME_DIR", "HOI4_USER_DIR", "HOI4_MODS_ROOT", "NOVA_BARE_SANDBOX", "PORT"]) delete env[k];
      Object.assign(env, variables);
      const run = spawnSync(process.execPath, ["-e", child], { env, cwd: TMP, encoding: "utf8", timeout: 120000 });
      try { return { USER, o: JSON.parse(fs.readFileSync(out, "utf8")) }; }
      catch (e) { return { USER, o: { harness: (String(run.stderr || "") + String(run.stdout || "")).slice(-600) } }; }
    };
    const TYPO = path.join(TMP, "Hearts of Iron 4");
    const a = messages("user-typo", { HOI4_USER_DIR: TYPO });
    ok(!a.o.harness && a.o.sandbox === "" && a.o.MODS_ROOT === "" && !fs.existsSync(TYPO), "THE CONTROL: on the machine's own folders with a typo in HOI4_USER_DIR, there is no sandbox, no folder is made and no mods folder is named", a.o);
    const diagErr = String(((a.o.diag || {}).body || {}).error || ""), createErr = String(((a.o.create || {}).body || {}).error || "");
    ok((a.o.diag || {}).status === 200 && ((a.o.diag || {}).body || {}).ok === false && diagErr.includes("HOI4_USER_DIR") && diagErr.includes(TYPO),
      "⭐⭐⭐ Collect says HOI4_USER_DIR names that folder, with its value", diagErr);
    ok(!/Set HOI4_USER_DIR/.test(diagErr), "⭐⭐ …and does not tell a modder who set it to set it", diagErr);
    ok((a.o.create || {}).status === 400 && createErr.includes("HOI4_USER_DIR") && createErr.includes(TYPO), "⭐⭐⭐ New mod says the same, with its value", a.o.create);
    ok(!/launcher once/.test(createErr), "⭐⭐ …and does not send them to the launcher, which cannot help", createErr);
    ok(!fs.existsSync(path.join(a.USER, "mod", "probe_typo")), "⭐⭐ …and nothing was created in the mods folder detection would have found", fs.readdirSync(path.join(a.USER, "mod")));
    const TYPO2 = path.join(TMP, "my mods");
    const b = messages("mods-typo", { HOI4_MODS_ROOT: TYPO2 });
    const createErr2 = String(((b.o.create || {}).body || {}).error || "");
    ok(!b.o.harness && b.o.MODS_ROOT === "" && (b.o.create || {}).status === 400 && createErr2.includes("HOI4_MODS_ROOT") && createErr2.includes(TYPO2) && !/launcher once/.test(createErr2),
      "⭐⭐⭐ with a typo in HOI4_MODS_ROOT, New mod names that variable and its value", b.o);
    ok(!fs.existsSync(TYPO2) && !fs.existsSync(path.join(b.USER, "mod", "probe_typo")), "⭐⭐ …and nothing was created there, nor in the mods folder detection would have found", fs.readdirSync(path.join(b.USER, "mod")));
    const f = path.join(TMP, "a-file-not-a-folder");
    fs.writeFileSync(f, "x");
    const c = messages("user-a-file", { HOI4_USER_DIR: f });
    const createErr3 = String(((c.o.create || {}).body || {}).error || "");
    ok((c.o.create || {}).status === 400 && createErr3.includes(f) && /not a folder/.test(createErr3), "⭐ …and a file of that name is named too: it is no folder either", c.o);
    const d = messages("none", {});
    ok(!d.o.harness && d.o.sandbox === "" && same(d.o.MODS_ROOT, path.join(d.USER, "mod")) && !d.o.create, "THE CONTROL: with no variable set, the mods folder is the one the launcher names", d.o);
    ok(((d.o.diag || {}).body || {}).ok === true && ((d.o.diag || {}).body || {}).nothingToReport === true, "THE CONTROL: …and Collect has a folder to look in", d.o.diag);
  }
} finally {
  try { fs.rmSync(TMP, { recursive: true, force: true, maxRetries: 3 }); } catch (_) { /* this test's own folder */ }
}

console.log("\n" + (fail ? "FAILED " + fail + "/" + (pass + fail) : "PASSED " + pass + "/" + pass));
process.exitCode = fail ? 1 : 0;
