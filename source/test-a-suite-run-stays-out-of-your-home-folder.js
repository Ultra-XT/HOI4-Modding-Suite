// ⛔ #tests-wrote-into-the-real-dot-nova — THE SANDBOX COVERED APPDATA AND NOT THE HOME DIRECTORY.
//
// run-tests.js gives every run a private APPDATA / XDG_CONFIG_HOME / NOVA_APP_DATA_DIR, and CLAUDE.md states
// the guarantee plainly: "Neither runner may write into the user's own folders." That was bought expensively
// — before it, every test filed its icon cache and its file backups into the user's real
// AppData/Roaming/NovaModdingSuite, measured at 797 cache entries, 4.2 GB, and 400 backups of temp-directory
// fixtures sitting beside backups of the user's actual work.
//
// None of those three variables covers os.homedir(). map-data.js keeps its per-mod stores under ~/.nova:
//   · map_baselines  — a whole-map snapshot. The user's real Millennium Dawn baseline is 2,137 files.
//   · blanked_maps   — the copy "Delete map" takes before unlinking every state file, ~1,500 more.
// So every test that saved a baseline or blanked a map wrote thousands of files into the user's actual home
// directory and relied on its own `finally` block to take them back out. One thrown assertion before that
// block, and they stay — in the very folder holding the baselines the user saved to protect their map.
//
// Nothing ever targeted the user's OWN baseline (fixtures use mkdtemp roots, which hash to their own
// directory), so this is about residue and about the guarantee meaning what it says, not about corruption.
//
// NOVA_HOME_DIR closes it, the same way NOVA_APP_DATA_DIR closes the app-data side. This test pins three
// things: the override is honoured, both runners set it, and the default is still the real home so shipping
// Nova is unaffected.
"use strict";

// #a-bare-test-run-writes-into-the-real-app-data — FIRST: run bare, every node child this starts inherits the sandbox.
require("./safe-write.js");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

let pass = 0, fail = 0;
const ok = (c, m, x) => {
  if (c) { pass++; console.log("  ok   " + m); }
  else { fail++; console.log("  FAIL " + m + (x !== undefined ? "   -> " + JSON.stringify(x).slice(0, 300) : "")); }
};

console.log("\n-- the override is honoured, and it is honoured for BOTH stores --");
{
  // In a child process, because map-data.js reads the variable through _novaHomeDir() at call time and this
  // test's own process is already running under whatever the runner set.
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "nova-homedir-probe-"));
  const modRoot = fs.mkdtempSync(path.join(os.tmpdir(), "nova-homedir-mod-"));
  let wrote = "";   // where the child ACTUALLY put it — cleaned up below even if that was the real home
  try {
    const script = [
      'const md = require(' + JSON.stringify(path.join(__dirname, "map-data.js")) + ');',
      'const r = ' + JSON.stringify(modRoot) + ';',
      // saveMapBaseline needs something to copy; an empty mod still writes _baseline.json.
      'const sv = md.saveMapBaseline({ modRoot: r });',
      'process.stdout.write(JSON.stringify({ ok: sv.ok, path: sv.baselinePath || "" }));',
    ].join("\n");
    const out = execFileSync(process.execPath, ["-e", script], {
      env: Object.assign({}, process.env, { NOVA_HOME_DIR: sandbox }),
      encoding: "utf8",
    });
    const res = JSON.parse(out);
    wrote = res.path || "";
    ok(res.ok, "saveMapBaseline succeeded under the override", res);
    ok(res.path && path.resolve(res.path).startsWith(path.resolve(sandbox)),
      "…and the baseline landed inside NOVA_HOME_DIR, not the real home", res.path);
    ok(!path.resolve(res.path).startsWith(path.resolve(os.homedir())) ||
       path.resolve(sandbox).startsWith(path.resolve(os.homedir())),
      "…so nothing reached the user's own ~/.nova", { got: res.path, home: os.homedir() });
  } finally {
    try { fs.rmSync(sandbox, { recursive: true, force: true }); } catch (_) {}
    try { fs.rmSync(modRoot, { recursive: true, force: true }); } catch (_) {}
    // ⚠️ WHEN THIS TEST FAILS, IT HAS WRITTEN INTO THE USER'S REAL ~/.nova — that is what failing MEANS
    // here. Cleaning only the sandbox leaves the artefact behind in the very folder the test exists to keep
    // clean, which is what happened the first time it was run against a backed-out fix: a stray
    // map_baselines/nova-homedir-mod-*_<hash> in the user's home, beside their real baselines.
    //
    // Removing it is safe only because the name is DERIVED from this test's own mkdtemp fixture: the
    // directory is <basename>_<hash of that path>, so the guard below cannot match anything the user owns.
    // A blind rmSync of whatever path came back would be a deletion under map_baselines on trust.
    const fixture = path.basename(modRoot);
    if (wrote && path.basename(wrote).startsWith(fixture + "_")) {
      try { fs.rmSync(wrote, { recursive: true, force: true }); } catch (_) {}
    }
  }
}

console.log("\n-- both runners actually set it --");
{
  // ⭐ DERIVED from the runners' own source. A guarantee only one runner keeps is not a guarantee, and the
  // e2e runner is the one that runs rarely enough for a gap to go unnoticed for months.
  for (const runner of ["run-tests.js", "run-e2e.js"]) {
    const src = fs.readFileSync(path.join(__dirname, runner), "utf8");
    ok(/NOVA_HOME_DIR:\s*APPDATA_SANDBOX/.test(src), runner + " points NOVA_HOME_DIR at its sandbox",
      "a suite run would write baselines and blank-map snapshots into the user's real ~/.nova");
  }
}

console.log("\n-- and there is exactly ONE place that reads the home directory --");
{
  // The fix is a single point only because mapBaselineDir and blankedMapSnapshotDir were consolidated onto
  // one path derivation. A second os.homedir() in map-data.js would reopen the hole silently.
  const { maskJsComments } = require("./testlib-strip-comments.js");
  const masked = maskJsComments(fs.readFileSync(path.join(__dirname, "map-data.js"), "utf8"));
  const uses = (masked.match(/os\.homedir\(\)/g) || []).length;
  ok(uses === 1, "map-data.js calls os.homedir() exactly once, inside _novaHomeDir", uses);
  ok(/function _novaHomeDir\(\)/.test(masked), "…and that one call is the override-aware helper");
}

console.log("\n-- the default is unchanged, so the shipped app still uses the real home --");
{
  // A sandbox that leaked into production would file the user's baselines somewhere they will never look.
  //
  // Asserted from SOURCE rather than by running it: proving the default behaviourally means calling it with
  // no override, which writes into the user's real ~/.nova — the exact thing this file exists to stop. And
  // an earlier draft of this check skipped when mapBaselineDir turned out not to be exported, which reads as
  // a pass and would have left the fallback untested for good.
  const { maskJsComments } = require("./testlib-strip-comments.js");
  const masked = maskJsComments(fs.readFileSync(path.join(__dirname, "map-data.js"), "utf8"));
  const body = (() => {
    const a = masked.indexOf("function _novaHomeDir()");
    if (a < 0) return "";
    const end = masked.indexOf("}", a);
    return end < 0 ? "" : masked.slice(a, end + 1);
  })();
  ok(body.length > 0, "_novaHomeDir was found", body.length);
  ok(/process\.env\.NOVA_HOME_DIR\s*\|\|\s*os\.homedir\(\)/.test(body),
    "the override falls back to the real home directory when unset", body.trim().slice(0, 120));
  // ⭐ And the fallback must be OR, not a replacement: `return process.env.NOVA_HOME_DIR` alone would send a
  // real user's baselines to undefined/.nova, which resolves relative to the process cwd.
  ok(!/return\s+process\.env\.NOVA_HOME_DIR\s*;/.test(body),
    "…and it is not an unconditional override", body.trim().slice(0, 120));
}

// ⛔ #the-suite-wrote-into-the-hoi4-user-folder — AND THE SANDBOX DID NOT COVER THE HOI4 USER FOLDER EITHER.
//
// test-all-endpoints.js GETs /api/diag/hoi4, and collectHoi4Diagnostics (server.js) writes nova_diagnostics.txt into
// resolveHoi4UserDir() — Documents/Paradox Interactive/Hearts of Iron IV, the folder that holds the owner's error.log and
// crash dumps. Both runners sandboxed APPDATA, XDG_CONFIG_HOME, NOVA_APP_DATA_DIR and NOVA_HOME_DIR, and neither set
// HOI4_USER_DIR. Measured 2026-09-15: the owner's real nova_diagnostics.txt was rewritten at 22:45 by a batch-9 test run
// (its "collected:" line matches the run), and every suite run rewrites it.
//
// Setting the variable alone would not have closed it. resolveHoi4UserDir PREFERRED any candidate with a logs/ subfolder
// over the override, and a runner's fresh sandbox has none while the real folder does — so the report still went to the
// real folder. Measured on 790cb21 in a child whose home is a decoy (below): HOI4_USER_DIR at a folder without logs/, and
// the report landed in the decoy's Documents folder, not in the override. The two guard tests beside this one had each
// worked around it by giving their fixture a logs/ folder. An explicit HOI4_USER_DIR now names THE folder, and a missing
// one names none — it never falls through to the folder the machine's own detection finds.
//
// ⚠️ The user-folder write guard (assertNotHoi4UserDataDir) resolves through the same function, so honouring the override
// would have moved its protection off the real folder for the whole of a suite run. It now guards both: the folder the
// override names and the one detection finds. With no override (every shipped app) the two are the same folder.
//
// The report file itself stays: public/home.js tells the user "Saved a copy to <savedPath>" after they collect.
//
// Nothing below touches the real user folder: the probe runs in a child whose USERPROFILE, OneDrive and home all point
// into this test's own mkdtemp folder, and it refuses to load server.js unless they do.
const vm = require("vm");
const { maskJsComments: maskForHoi4, stripJsComments } = require("./testlib-strip-comments.js");

console.log("\n-- both runners give HOI4_USER_DIR a folder inside their private dir --");
{
  // ⭐ READ OUT OF THE RUNNER'S OWN ENV OBJECT: the object literal is evaluated with a sentinel sandbox, so whatever
  // expression the runner writes, the check sees the path it produces.
  for (const runner of ["run-tests.js", "run-e2e.js"]) {
    const src = fs.readFileSync(path.join(__dirname, runner), "utf8");
    const masked = maskForHoi4(src);
    const a = masked.indexOf("const childEnv = Object.assign({}, process.env, {");
    let env = null, err = "";
    const SENTINEL = path.join(os.tmpdir(), "nova-runner-env-sentinel");
    if (a < 0) err = "childEnv not found";
    else {
      const open = masked.indexOf("{", masked.indexOf("process.env,", a));
      let depth = 0, end = -1;
      for (let i = open; i < masked.length; i++) {
        if (masked[i] === "{") depth++;
        else if (masked[i] === "}") { depth--; if (depth === 0) { end = i; break; } }
      }
      try {
        env = vm.runInNewContext("(" + masked.slice(open, end + 1) + ")", {
          path, os, process: { env: {} }, APPDATA_SANDBOX: SENTINEL, SCRATCH: path.join(SENTINEL, "scratch"),
        });
      } catch (e) { err = String(e.message || e); }
    }
    const dir = env && typeof env.HOI4_USER_DIR === "string" ? path.resolve(env.HOI4_USER_DIR) : "";
    ok(!!dir && dir.toLowerCase().startsWith(path.resolve(SENTINEL).toLowerCase() + path.sep),
      "⭐⭐⭐ " + runner + " points HOI4_USER_DIR inside its own sandbox",
      err || { HOI4_USER_DIR: env && env.HOI4_USER_DIR, sandbox: SENTINEL });
    // #two-documents-folders — a test that drops HOI4_USER_DIR asks the launcher's folder, built from NOVA_DOCUMENTS_DIR:
    // inherited from a shell or an Electron parent, that is the owner's real Documents.
    const docs = env && typeof env.NOVA_DOCUMENTS_DIR === "string" ? path.resolve(env.NOVA_DOCUMENTS_DIR) : "";
    ok(!!docs && docs.toLowerCase().startsWith(path.resolve(SENTINEL).toLowerCase() + path.sep),
      "⭐⭐ " + runner + " points NOVA_DOCUMENTS_DIR inside its own sandbox too", err || { NOVA_DOCUMENTS_DIR: env && env.NOVA_DOCUMENTS_DIR });
    ok(/\benv:\s*childEnv\b/.test(masked), "…and hands that env to the files it runs", runner);
  }
}

console.log("\n-- every test that reaches /api/diag runs with a sandboxed HOI4_USER_DIR --");
{
  // DERIVED: every test-*.js whose code (comments stripped) names /api/diag.
  const reaching = fs.readdirSync(__dirname).filter((f) => /^test-.*\.js$/.test(f))
    .filter((f) => { try { return /\/api\/diag\b/.test(stripJsComments(fs.readFileSync(path.join(__dirname, f), "utf8"))); } catch (_) { return false; } });
  const others = reaching.filter((f) => f !== path.basename(__filename));
  ok(others.length >= 1, "THE CONTROL: the scan finds a test other than this one that reaches /api/diag", reaching);
  for (const f of reaching) {
    const code = stripJsComments(fs.readFileSync(path.join(__dirname, f), "utf8"));
    const setsItsOwn = /HOI4_USER_DIR/.test(code);
    // In-process (createApp / require("./server.js")) inherits the runner's env; a child it spawns inherits it only when
    // its env object starts from process.env.
    const inProcess = /createApp\(|require\(\s*["']\.\/server(\.js)?["']\s*\)/.test(code);
    const envObjects = [...code.matchAll(/\benv\s*:\s*([^,}\n][^\n]*)/g)].map((m) => m[1]);
    const dropsEnv = envObjects.filter((e) => !/process\.env|childEnv/.test(e));
    ok(setsItsOwn || (inProcess && dropsEnv.length === 0),
      "⭐⭐ " + f + " runs /api/diag under the runner's HOI4_USER_DIR or its own", { setsItsOwn, inProcess, dropsEnv });
  }
}

console.log("\n-- in a child with HOI4_USER_DIR at a mkdtemp folder, GET /api/diag/hoi4 writes only there --");
{
  const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "nova-hoi4-user-dir-probe-"));
  try {
    // The decoy home holds a user folder WITH logs/, the shape of a real machine. The sandbox folder has none, the shape of
    // a runner's fresh private dir.
    const DECOY_HOME = path.join(TMP, "home");
    const DECOY_USER = path.join(DECOY_HOME, "Documents", "Paradox Interactive", "Hearts of Iron IV");
    fs.mkdirSync(path.join(DECOY_USER, "logs"), { recursive: true });
    fs.mkdirSync(path.join(DECOY_USER, "mod"), { recursive: true });
    fs.writeFileSync(path.join(DECOY_USER, "logs", "error.log"), "[decoy] a log the report would include\n");
    const SANDBOX_USER = path.join(TMP, "sandbox-hoi4-user");
    fs.mkdirSync(SANDBOX_USER, { recursive: true });
    // …but a crash dump: with nothing to report no copy is written (#nothing-to-report-keeps-the-last-report), and this asks where one goes.
    fs.mkdirSync(path.join(SANDBOX_USER, "crashes", "crash_1"), { recursive: true });
    fs.writeFileSync(path.join(SANDBOX_USER, "crashes", "crash_1", "exception.txt"), "[decoy] a crash the report would include\n");
    const MISSING = path.join(TMP, "no-such-folder");
    const DECOY_GAME = path.join(TMP, "game");
    fs.mkdirSync(DECOY_GAME, { recursive: true });
    fs.writeFileSync(path.join(DECOY_GAME, "hoi4.exe"), "");   // a game folder is recognised by this; no launcher-settings.json
    const REPORT = "nova_diagnostics.txt";

    // The interlock is checked against the names server.js builds its candidates from, read out of its source.
    const serverSrc = stripJsComments(fs.readFileSync(path.join(__dirname, "server.js"), "utf8"));
    const fence = [/const HOMEDIR = typeof os\.homedir === "function" \? os\.homedir\(\) : "";/,
      /const USERPROFILE = process\.env\.USERPROFILE \|\| HOMEDIR \|\| "";/,
      /const ONEDRIVE = process\.env\.OneDrive \|\| \(USERPROFILE \? path\.join\(USERPROFILE, "OneDrive"\) : ""\);/,
      // #two-documents-folders — the launcher's folder (asked before detection) comes from "where Windows keeps Documents"
      // and from the game's launcher-settings.json: the child fences both. Windows' registry is asked ONLY when
      // NOVA_DOCUMENTS_DIR is unset, and the child sets it (the interlock checks it is inside this test's temp folder).
      /function shellDocumentsDir\(\) \{\s*if \(process\.env\.NOVA_DOCUMENTS_DIR !== undefined && String\(process\.env\.NOVA_DOCUMENTS_DIR\)\.trim\(\) !== ""\) \{\s*const d = String\(process\.env\.NOVA_DOCUMENTS_DIR\)\.trim\(\);\s*return path\.isAbsolute\(d\) \? d : "";\s*\}\s*return registryDocumentsDir\(\);\s*\}/,
      /fs\.readFileSync\(path\.join\(resolveHoi4GameRoot\(\), "launcher-settings\.json"\)/];
    const fenced = fence.every((re) => re.test(serverSrc));
    ok(fenced, "server.js still derives its home folders only from os.homedir(), USERPROFILE, OneDrive, NOVA_DOCUMENTS_DIR (Windows' registry only when that is unset) and the game's launcher settings, which the child fences in");

    const script = [
      'const fs = require("fs"), os = require("os"), path = require("path");',
      'const TMP = ' + JSON.stringify(TMP) + ';',
      'const inside = (p) => !!p && path.resolve(p).toLowerCase().startsWith(path.resolve(TMP).toLowerCase() + path.sep);',
      'const roots = [os.homedir(), process.env.USERPROFILE, process.env.OneDrive, process.env.HOI4_USER_DIR, process.env.NOVA_DOCUMENTS_DIR, process.env.HOI4_ROOT];',
      'if (!roots.every(inside)) { process.stdout.write(JSON.stringify({ interlock: roots })); process.exit(0); }',
      'const { createApp } = require(' + JSON.stringify(path.join(__dirname, "server.js")) + ');',
      'const sw = require(' + JSON.stringify(path.join(__dirname, "safe-write.js")) + ');',
      'const DECOY_USER = ' + JSON.stringify(DECOY_USER) + ', SANDBOX_USER = ' + JSON.stringify(SANDBOX_USER) + ', MISSING = ' + JSON.stringify(MISSING) + ';',
      'const REPORT = ' + JSON.stringify(REPORT) + ';',
      'const tryWrite = (root) => {',
      '  const t = path.join(root, "history", "states", "1082-Loas.txt");',
      '  try { fs.mkdirSync(path.dirname(t), { recursive: true }); } catch (_) {}',
      '  let msg = "";',
      '  try { sw.safeModWrite(t, "state = { id = 1082 }\\n", "hoi4-user-dir-probe"); } catch (e) { msg = String(e.message || e); }',
      '  return { refused: /Refusing to write into your Hearts of Iron IV user folder/.test(msg), landed: fs.existsSync(t), msg: msg.slice(0, 160) };',
      '};',
      'const srv = createApp().listen(0, async () => {',
      '  const out = { interlock: null };',
      '  const get = async () => { const r = await fetch("http://127.0.0.1:" + srv.address().port + "/api/diag/hoi4"); const b = await r.json();',
      '    return { status: r.status, ok: b.ok, userDir: b.userDir || "", savedPath: b.savedPath || "", error: b.error || "",',
      '      decoyReport: fs.existsSync(path.join(DECOY_USER, REPORT)), sandboxReport: fs.existsSync(path.join(SANDBOX_USER, REPORT)) }; };',
      '  try {',
      '    process.env.HOI4_USER_DIR = SANDBOX_USER;',
      '    out.overridden = await get();',
      '    out.sandboxHead = out.overridden.sandboxReport ? fs.readFileSync(path.join(SANDBOX_USER, REPORT), "utf8").split("\\n")[0] : "";',
      '    out.decoyWrite = tryWrite(DECOY_USER);',
      '    out.sandboxWrite = tryWrite(SANDBOX_USER);',
      '    out.modWrite = tryWrite(path.join(DECOY_USER, "mod", "a_real_mod"));',
      // The decoy is this test's own temp folder: a report the first request left there is taken away so this one is judged alone.
      '    try { fs.unlinkSync(path.join(DECOY_USER, REPORT)); } catch (_) {}',
      '    process.env.HOI4_USER_DIR = MISSING;',
      '    out.missing = await get();',
      '    delete process.env.HOI4_USER_DIR;',
      '    out.unset = await get();',
      '  } catch (e) { out.harness = String((e && e.stack) || e); }',
      // Written to a file before exiting: on Windows an exit while fetch's sockets close can abort the process
      // (libuv "UV_HANDLE_CLOSING"), which would throw away an answer that was already complete.
      '  fs.writeFileSync(path.join(TMP, "probe-out.json"), JSON.stringify(out));',
      '  try { srv.closeAllConnections(); } catch (_) {} srv.close(); process.exit(0);',
      '});',
    ].join("\n");
    const env = Object.assign({}, process.env, {
      USERPROFILE: DECOY_HOME, HOME: DECOY_HOME, OneDrive: path.join(DECOY_HOME, "OneDrive"),
      APPDATA: path.join(TMP, "appdata"), XDG_CONFIG_HOME: path.join(TMP, "appdata"), NOVA_APP_DATA_DIR: path.join(TMP, "appdata"),
      NOVA_HOME_DIR: path.join(TMP, "nova-home"), HOI4_MODS_ROOT: path.join(DECOY_USER, "mod"), HOI4_USER_DIR: SANDBOX_USER,
      // The launcher's folder = <Documents>\Paradox Interactive\Hearts of Iron IV, from a decoy game with no launcher settings
      // (so its default gameDataPath) and a decoy Documents: it names DECOY_USER, the folder detection finds too.
      NOVA_DOCUMENTS_DIR: path.join(DECOY_HOME, "Documents"), HOI4_ROOT: DECOY_GAME,
    });
    let r = null;
    if (fenced) {
      const run = require("child_process").spawnSync(process.execPath, ["-e", script], { env, encoding: "utf8", cwd: TMP, timeout: 120000 });
      const outFile = path.join(TMP, "probe-out.json");
      try { r = JSON.parse(fs.existsSync(outFile) ? fs.readFileSync(outFile, "utf8") : run.stdout); }
      catch (e) { r = { harness: (String(run.stderr || "") + String((e && e.message) || e)).slice(0, 600) }; }
    }
    const inDir = (p, d) => !!p && path.resolve(p).toLowerCase().startsWith(path.resolve(d).toLowerCase() + path.sep);
    ok(!!r && r.interlock === null && !r.harness, "the child fenced its home folders into this test's temp folder and ran", r);
    if (r && r.overridden) {
      const o = r.overridden;
      ok(o.status === 200 && o.ok === true, "GET /api/diag/hoi4 answered ok under the override", o);
      ok(inDir(o.savedPath, SANDBOX_USER), "⭐⭐⭐ …and says it saved the report inside HOI4_USER_DIR", { savedPath: o.savedPath, userDir: o.userDir });
      ok(o.sandboxReport && /NOVA HOI4 DIAGNOSTICS/.test(r.sandboxHead || ""), "…and the report is there", r.sandboxHead);
      ok(o.decoyReport === false, "⭐⭐⭐ …and NOTHING was written into the user folder the machine's own detection finds", o);
    }
    if (r && r.missing) {
      ok(r.missing.savedPath === "" && r.missing.decoyReport === false,
        "⭐⭐ an override naming a folder that does not exist writes nowhere — it never falls through to the detected folder", r.missing);
    }
    if (r && r.decoyWrite) {
      ok(r.decoyWrite.refused && !r.decoyWrite.landed, "⭐⭐ the write guard still refuses the folder detection finds while an override is set", r.decoyWrite);
      ok(r.sandboxWrite.refused && !r.sandboxWrite.landed, "⭐ …and refuses the folder the override names", r.sandboxWrite);
      ok(!r.modWrite.refused && r.modWrite.landed, "THE CONTROL: a mod under the user folder's mod/ still writes", r.modWrite);
    }
    if (r && r.unset) {
      ok(r.unset.ok === true && inDir(r.unset.savedPath, DECOY_USER),
        "THE CONTROL: with no override the report goes where it always did — the user folder detection finds", r.unset);
    }
  } finally {
    try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (_) {}
  }
}

console.log("\n" + (fail ? "FAILED " + fail + "/" + (pass + fail) : "PASSED " + pass + "/" + pass));
process.exitCode = fail ? 1 : 0;
