// ⛔ #a-test-that-chooses-a-game-keeps-it-to-itself — EVERY TEST WHOSE OWN SERVER IS TOLD ABOUT THE GAME FOLDER KEEPS ITS APP DATA
// TO ITSELF. testlib-own-app-data.js says why: a run has one app-data folder, server.js reads the saved choice from it as it loads,
// and a choice that holds the game outranks the HOI4_ROOT every other test sets — so the suite of 2026-11-04 (cec97a35) failed
// test-a-network-game-folder-is-refused-without-touching-it.js, which passed alone.
//
// This pins:
//   1. DERIVED: every test-*.js, e2e-*.js and testlib-*.js that loads server.js in its own process (itself, or through a testlib
//      that does) and tells it about the Game folder — the setting's route, the file the choice is kept in, or the functions that
//      save it — loads testlib-own-app-data.js FIRST: at the top of the file, before any other module of Nova's. With controls:
//      the helper taken out, loaded below safe-write.js, inside a function or behind a condition — each caught;
//   2. DERIVED: none that tells a server about the Game folder talks to a server it did not start: the runner's live server keeps
//      the run's app data, and no helper in the test can move that;
//   3. BY RUNNING IT: a choice saved by a process that loaded the helper lands in a folder of its own, gone once the process
//      exits; the run's app data is left as it was, and the next server.js to load there takes the HOI4_ROOT it was given.
//      THE CONTROL is the same process without the helper: the choice lands in the run's app data, and the next server.js to
//      load there is handed the test's FIXTURE as its game;
//   4. the helper refuses to load after safe-write.js, which decides the app-data folder once, as it loads.
"use strict";
require("./safe-write.js");   // FIRST: this file starts node children (test-a-bare-test-run-stays-out-of-the-real-folders.js, H)
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const { maskJsComments, maskJsLiterals } = require("./testlib-strip-comments.js");

let pass = 0, fail = 0;
const ok = (c, m, x) => {
  if (c) { pass++; console.log("  ok   " + m); }
  else { fail++; console.log("  FAIL " + m + (x !== undefined ? "   -> " + JSON.stringify(x).slice(0, 900) : "")); }
};
const ROOT = __dirname;
const HELPER = "testlib-own-app-data.js";
const SELF = path.basename(__filename);
const src = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const reqOf = (name) => new RegExp("\\brequire\\(\\s*[\"'`]\\./" + esc(name.replace(/\.js$/, "")) + "(?:\\.js)?[\"'`]\\s*\\)");
const ANY_LOCAL_REQ = /\brequire\(\s*["'`]\.\/([\w.-]+?)(?:\.js)?["'`]\s*\)/g;
// What tells a server about the Game folder: the setting's route, the file the choice is kept in, the functions that save it.
const TELLS = /settings\/game-folder|GAME_FOLDER_CHOICE|game-folder\.json|\b(?:set|save)GameFolderChoice\b/;
// What talks to a server the test did not start: the runner's live server (NOVA_PORT) and the helpers that reach it.
const LIVE = /\bNOVA_PORT\b|testlib-live-(?:server|fetch)/;

const files = fs.readdirSync(ROOT).filter((f) => /^(?:test|e2e|testlib)-.*\.js$/.test(f) && f !== SELF && f !== HELPER).sort();
const code = new Map(files.map((f) => [f, maskJsComments(src(f))]));
const SERVER = reqOf("server.js");
const libsWithServer = files.filter((f) => /^testlib-/.test(f) && SERVER.test(code.get(f)));
const loadsServerItself = (c) => SERVER.test(c) || libsWithServer.some((l) => reqOf(l).test(c));

/** Is the require at `at` a statement of its own at the top of the file: no bracket open before it, and before it on its line
 *  nothing but the end of a statement or a declaration? `bare` is the source with comments and literals blanked, length kept. */
const topLevel = (bare, at) => {
  let depth = 0;
  for (let i = 0; i < at; i++) {
    const c = bare[i];
    if (c === "{" || c === "(" || c === "[") depth++;
    else if (c === "}" || c === ")" || c === "]") depth--;
  }
  if (depth !== 0) return false;
  const before = bare.slice(0, at).replace(/\s+$/, "");
  return before === "" || /[;}]$/.test(before) || /(?:^|[;}])\s*(?:const|let|var)\s+[\w$]+\s*=$/.test(before);
};
/** What is wrong with how a source loads the helper ("" when nothing). */
const judge = (s) => {
  const c = maskJsComments(s), bare = maskJsLiterals(s);
  ANY_LOCAL_REQ.lastIndex = 0;
  const first = ANY_LOCAL_REQ.exec(c);
  if (!first) return "loads none of Nova's modules";
  if (first[1] !== HELPER.replace(/\.js$/, "")) {
    return c.search(reqOf(HELPER)) === -1 ? `does not load ${HELPER}` : `loads ./${first[1]}.js before ${HELPER}`;
  }
  if (!topLevel(bare, first.index)) return `loads ${HELPER} inside a function, a block or behind a condition, not at the top of the file`;
  return "";
};

console.log("1. every test whose own server is told about the Game folder loads " + HELPER + " first, at the top of the file");
const tellers = files.filter((f) => TELLS.test(code.get(f)));
const inProcess = tellers.filter((f) => loadsServerItself(code.get(f)));
ok(inProcess.length > 0, `(derived: ${inProcess.length} file(s) load server.js in their own process and tell it about the Game folder: ${inProcess.join(", ")})`, { tellers, libsWithServer });
const bad = inProcess.map((f) => [f, judge(src(f))]).filter(([, why]) => why);
ok(!bad.length, "⭐⭐⭐ every one of them loads it first, at the top of the file", bad.map(([f, why]) => `${f} ${why}`));
const sample = inProcess.length ? src(inProcess[0]) : "";
if (sample) {
  const without = sample.replace(reqOf(HELPER), () => "void 0");
  ok(/does not load/.test(judge(without)), `CONTROL: ${inProcess[0]} with the helper taken out is caught`, judge(without));
  const below = 'require("./safe-write.js");\n' + sample;
  ok(/before testlib-own-app-data/.test(judge(below)), "CONTROL: …with safe-write.js loaded above it, caught", judge(below));
  const inFn = sample.replace(reqOf(HELPER), (m) => "(function () { " + m + "; })()");
  ok(/not at the top of the file/.test(judge(inFn)), "CONTROL: …loaded inside a function, caught", judge(inFn));
  const behindIf = sample.replace(reqOf(HELPER), (m) => "if (process.env.NOVA_NEVER_SET_HERE) " + m);
  ok(/not at the top of the file/.test(judge(behindIf)), "CONTROL: …loaded behind a condition, caught", judge(behindIf));
}

console.log("\n2. no test tells a server it did not start about the Game folder");
const live = tellers.filter((f) => LIVE.test(code.get(f)));
ok(!live.length, "⭐⭐ none that tells a server about the Game folder talks to the run's live server, which keeps the run's app data", live);

console.log("\n3. by running it: a choice saved by a process that loaded the helper never reaches the run's app data");
const T = fs.mkdtempSync(path.join(os.tmpdir(), "nova-choice-to-itself-"));
const real = (p) => { try { return fs.realpathSync.native(p); } catch (_) { return path.resolve(String(p)); } };
const same = (a, b) => !!a && !!b && real(a).toLowerCase() === real(b).toLowerCase();
const inside = (p, dir) => {
  if (!p || !dir) return false;
  const rel = path.relative(real(dir).toLowerCase(), real(p).toLowerCase());
  return !!rel && !rel.startsWith("..") && !path.isAbsolute(rel);
};
try {
  const GAME_F = path.join(T, "game-F"), GAME_G = path.join(T, "game-G");
  for (const g of [GAME_F, GAME_G]) { fs.mkdirSync(g, { recursive: true }); fs.writeFileSync(path.join(g, "hoi4.exe"), ""); }
  // A test's name, so safe-write.js judges the child as it judges every real test.
  const CHILD = path.join(T, "test-own-app-data-child.js");
  fs.writeFileSync(CHILD, [
    '"use strict";',
    `if (process.argv[2] === "helper") require(${JSON.stringify(path.join(ROOT, HELPER))});`,
    `const S = require(${JSON.stringify(path.join(ROOT, "server.js"))});`,
    `const SW = require(${JSON.stringify(path.join(ROOT, "safe-write.js"))});`,
    "const out = { appData: SW.NOVA_APP_DATA_DIR, file: S.GAME_FOLDER_CHOICE_FILE };",
    "if (process.argv[3]) { const r = S.setGameFolderChoice(process.argv[3]); out.ok = r.ok; out.saved = r.saved; out.saveError = r.saveError; out.fileThen = require(\"fs\").existsSync(S.GAME_FOLDER_CHOICE_FILE); }",
    "out.root = S.resolveHoi4GameRoot();",
    'console.log("CHILD " + JSON.stringify(out));',
    "",
  ].join("\n"));
  // The run's app data, as run-tests.js hands it to every file: HOI4_ROOT names game G, as a test that takes its game from it does.
  const run = (appData, args) => {
    const env = Object.assign({}, process.env, { APPDATA: appData, XDG_CONFIG_HOME: appData, NOVA_APP_DATA_DIR: appData, HOI4_ROOT: GAME_G });
    const r = spawnSync(process.execPath, [CHILD, ...args], { env, encoding: "utf8", timeout: 180000, maxBuffer: 64 << 20 });
    const line = String(r.stdout || "").split(/\r?\n/).find((l) => l.startsWith("CHILD "));
    return { status: r.status, out: line ? JSON.parse(line.slice(6)) : null, err: String(r.stderr || "").slice(-500) };
  };

  const SHARED_A = fs.mkdtempSync(path.join(T, "run-app-data-A-"));
  const a1 = run(SHARED_A, ["bare", GAME_F]);
  ok(a1.status === 0 && a1.out && a1.out.ok === true && a1.out.saved === true && inside(a1.out.file, SHARED_A) && fs.existsSync(a1.out.file),
    "THE CONTROL: a process without the helper saves its choice in the run's app data", a1);
  const a2 = run(SHARED_A, ["bare"]);
  ok(a2.status === 0 && a2.out && same(a2.out.root, GAME_F),
    "THE CONTROL: …and the next server.js to load there is handed the FIXTURE as its game, not the HOI4_ROOT it was given", a2);

  const SHARED_B = fs.mkdtempSync(path.join(T, "run-app-data-B-"));
  const b1 = run(SHARED_B, ["helper", GAME_F]);
  ok(b1.status === 0 && b1.out && b1.out.ok === true && b1.out.saved === true && b1.out.fileThen === true
    && !inside(b1.out.file, SHARED_B) && inside(b1.out.appData, os.tmpdir()),
    "⭐⭐⭐ with the helper loaded first, the choice is saved in a folder of the process's own, in temp", b1);
  ok(!!(b1.out && b1.out.file) && !fs.existsSync(b1.out.file) && !fs.existsSync(b1.out.appData),
    "…which is gone once the process has exited", b1.out && { file: b1.out.file, appData: b1.out.appData });
  ok(fs.readdirSync(SHARED_B).length === 0, "⭐⭐ …and the run's app data is left as it was: nothing in it", fs.readdirSync(SHARED_B));
  const b2 = run(SHARED_B, ["bare"]);
  ok(b2.status === 0 && b2.out && same(b2.out.root, GAME_G),
    "⭐⭐⭐ …so the next server.js to load in the run's app data takes the HOI4_ROOT it was given", b2);

  console.log("\n4. the helper refuses to load after safe-write.js");
  const LATE = path.join(T, "test-own-app-data-late.js");
  fs.writeFileSync(LATE, `require(${JSON.stringify(path.join(ROOT, "safe-write.js"))});\nrequire(${JSON.stringify(path.join(ROOT, HELPER))});\n`);
  const late = spawnSync(process.execPath, [LATE], { env: Object.assign({}, process.env), encoding: "utf8", timeout: 60000 });
  ok(late.status !== 0 && /loaded after \.\/safe-write\.js/.test(String(late.stderr || "")),
    "a process that loads it after safe-write.js stops, and says why", { status: late.status, err: String(late.stderr || "").slice(-300) });
} finally {
  try { fs.rmSync(T, { recursive: true, force: true, maxRetries: 3 }); } catch (_) { /* temp */ }
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exitCode = 1;
