// A DEVELOPER'S .env IS READ BEFORE THE ROOTS THAT READ IT (review S-S5).
//
// server.js reads a .env beside itself (a developer's; the packaged exe has none — its __dirname is inside app.asar), and it
// always read it near the top, before `const ROOT = pickExistingDirectory([process.env.HOI4_MOD_ROOT, DEV_ROOT], …)`. The Game
// folder work moved the reader into initDynamicRoots, which now runs below ROOT (the game is found there, after ROOT, which its
// last candidates walk up from) — so a .env setting HOI4_MOD_ROOT was read after ROOT had been decided without it, and ROOT
// was DEV_ROOT: the drive root for D:\Nova. Measured by the review with a scratch .env on two worktrees.
//
// No .env is written here: a child `node` loads server.js with fs answering for exactly <this folder>\.env (a preload this
// test writes into its own temp folder), detection kept off this machine (NOVA_TEST_GAME_DETECTION=off), and says what ROOT is.
"use strict";
// #a-bare-test-run-writes-into-the-real-app-data — FIRST, before any child is started (the child gets this process's env).
require("./safe-write.js");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

let pass = 0, fail = 0;
const ok = (c, m, x) => {
  if (c) { pass++; console.log("  ok   " + m); }
  else { fail++; console.log("  FAIL " + m + (x !== undefined ? "   -> " + JSON.stringify(x).slice(0, 600) : "")); }
};
const T = fs.mkdtempSync(path.join(os.tmpdir(), "nova-dotenv-"));
const DEV_MODS = path.join(T, "my dev mods");
fs.mkdirSync(DEV_MODS, { recursive: true });
const PRELOAD = path.join(T, "fake-dotenv.js");
fs.writeFileSync(PRELOAD, [
  "\"use strict\";",
  "// Answers for exactly one file, <server.js's folder>\\.env, as if a developer had put one there. Nothing is written.",
  "const fs = require(\"fs\");",
  "const path = require(\"path\");",
  "const want = path.resolve(process.env.NOVA_FAKE_DOTENV_AT).toLowerCase();",
  "const text = process.env.NOVA_FAKE_DOTENV_TEXT;",
  "const is = (p) => { try { return typeof p === \"string\" && path.resolve(p).toLowerCase() === want; } catch (_) { return false; } };",
  "const exists = fs.existsSync, read = fs.readFileSync;",
  "fs.existsSync = function (p) { return is(p) ? true : exists.apply(this, arguments); };",
  "fs.readFileSync = function (p) { return is(p) ? text : read.apply(this, arguments); };",
  "",
].join("\n"));

const ask = (dotenv) => {
  const env = Object.assign({}, process.env, {
    NOVA_TEST_GAME_DETECTION: "off",
    NOVA_FAKE_DOTENV_AT: path.join(__dirname, dotenv ? ".env" : ".env-that-is-not-there"),
    NOVA_FAKE_DOTENV_TEXT: `HOI4_MOD_ROOT=${DEV_MODS}\n`,
  });
  delete env.HOI4_MOD_ROOT;
  delete env.HOI4_ROOT;
  const r = spawnSync(process.execPath, ["-r", PRELOAD, "-e",
    "const S = require(" + JSON.stringify(path.join(__dirname, "server.js")) + ");"
    + "process.stdout.write('\\nROOT=' + JSON.stringify({ root: S.constants.ROOT, env: process.env.HOI4_MOD_ROOT || '' }) + '\\n');"
    + "process.exit(0);"],
  { cwd: T, env, encoding: "utf8", timeout: 120000, windowsHide: true, maxBuffer: 32 * 1024 * 1024 });
  const out = String(r.stdout || "");
  const m = /\nROOT=(\{.*\})\n/.exec(out);
  return { status: r.status, loaded: /Loaded environment variables from \.env/.test(out), said: m ? JSON.parse(m[1]) : null, tail: (out + String(r.stderr || "")).slice(-400) };
};
const same = (a, b) => !!a && !!b && path.resolve(String(a)).toLowerCase() === path.resolve(String(b)).toLowerCase();

try {
  console.log("\n1. ⭐⭐ a .env naming HOI4_MOD_ROOT decides ROOT");
  const withEnv = ask(true);
  ok(withEnv.status === 0 && withEnv.loaded && withEnv.said && same(withEnv.said.env, DEV_MODS), "precondition: server.js read the .env (it says so, and HOI4_MOD_ROOT is set from it)", withEnv);
  ok(withEnv.said && same(withEnv.said.root, DEV_MODS), "⭐⭐ ROOT is the folder the .env names, not DEV_ROOT", withEnv.said);
  console.log("\n2. CONTROL: with no .env, ROOT is DEV_ROOT (what the check above tells apart)");
  const without = ask(false);
  ok(without.status === 0 && !without.loaded && without.said && !same(without.said.root, DEV_MODS)
    && same(without.said.root, path.resolve(__dirname, "..", "..")), "no .env read, and ROOT is DEV_ROOT", without);
} catch (e) {
  fail++;
  console.log("  FAIL threw: " + (e && e.stack || e));
} finally {
  try { fs.rmSync(T, { recursive: true, force: true, maxRetries: 3 }); } catch (_) {}
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}
