// ⛔ #loc-warm-fingerprint-never-matches (again) — THE FIRST NAME LOOKUP AFTER THE STARTUP WARM READS NO .yml.
//
// Nova warms the localisation map in a SEPARATE process at launch (warm-child.js, spawned by main.js) and leaves it on disk,
// because parsing every .yml of vanilla, the dependencies and the mod is a multi-second synchronous job, and in the Electron
// main process that is a window gone "Not Responding". The main process then trusts the file only while its own fingerprint of
// the .yml files equals the one the warm wrote.
//
// test-loc-warm-fingerprint-matches.js pins that STRUCTURALLY — one hash, the same three layers — and so could not see the
// count of Nova's own writes (#a-same-size-write-reads-stale) going into getLocalizationMap's part of the fingerprint as ":0"
// and into the warm's not at all: the two never matched again, and every launch parsed every .yml on the main thread (review
// of the count, 09-29). Every part is now built by one helper, fileFingerprintPart. This test does what main.js does: the warm
// runs in a child process, and this process then asks for a name and counts the .yml files it reads.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

let pass = 0;
const fails = [];
const rec = (name, cond, detail) => {
  if (cond) { console.log("  ok   " + name); pass++; }
  else { console.log("  FAIL " + name + (detail === undefined ? "" : "   → " + JSON.stringify(detail).slice(0, 600))); fails.push(name); }
};

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-warm-first-lookup-"));
const GAME = path.join(ROOT, "game"), MODS = path.join(ROOT, "mods"), MOD = path.join(MODS, "m");
fs.mkdirSync(path.join(GAME, "localisation", "english"), { recursive: true });
fs.writeFileSync(path.join(GAME, "hoi4.exe"), "not really an exe");
fs.writeFileSync(path.join(GAME, "localisation", "english", "base_l_english.yml"), "﻿l_english:\n BASE_KEY:0 \"Base\"\n");
fs.mkdirSync(path.join(MOD, "localisation", "english"), { recursive: true });
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="Warm First Lookup"\nsupported_version="1.*"\n');
fs.writeFileSync(path.join(MOD, "localisation", "english", "mine_l_english.yml"), "﻿l_english:\n MY_KEY:0 \"Mine\"\n");
// pinned to a whole second before the warm fingerprints it, so it can be set back exactly (a fractional mtime rounds through utimes)
const PIN = 1700000000;
fs.utimesSync(path.join(MOD, "localisation", "english", "mine_l_english.yml"), PIN, PIN);
const env = Object.assign({}, process.env, {
  HOI4_ROOT: GAME, HOI4_MODS_ROOT: MODS, NOVA_HOME_DIR: path.join(ROOT, "home"),
  APPDATA: path.join(ROOT, "appdata"), NOVA_APP_DATA_DIR: path.join(ROOT, "appdata"), XDG_CONFIG_HOME: path.join(ROOT, "appdata"),
});
Object.assign(process.env, env);
// #a-bare-test-run-writes-into-the-real-app-data — HERE, after the env above and before the first child: this process's
// own Nova must read that env (safe-write.js decides its folders once, at load), and a bare run's sandbox fills in the rest.
require("./safe-write.js");
Object.assign(env, process.env);   // …which the children below, spawned with `env`, must get too

try {
  // ── the warm, in its own process, as warm-child.js runs it ──
  const CHILD = path.join(ROOT, "warm.js");
  fs.writeFileSync(CHILD, [
    "const s = require(" + JSON.stringify(path.join(__dirname, "server.js")) + ");",
    "s.setActiveRoot(" + JSON.stringify(MOD) + ");",
    "const app = s.createApp();",
    "Promise.resolve(app.locals.warmCaches({})).then(() => process.exit(0), (e) => { console.error(e); process.exit(3); });",
  ].join("\n"));
  const w = spawnSync(process.execPath, [CHILD], { cwd: __dirname, env, encoding: "utf8", timeout: 240000 });
  rec("(the warm ran to the end in its own process)", w.status === 0, (w.stderr || w.stdout || "").slice(-600));
  const cacheFiles = (function walk(d) { let out = []; try { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) out = out.concat(walk(p)); else if (/^locmap_.*\.json$/.test(e.name)) out.push(p); } } catch (_) {} return out; })(ROOT);
  rec("(…and left the localisation map on disk)", cacheFiles.length >= 1, cacheFiles);

  // ── this process: the main one, which has parsed nothing yet ──
  const server = require("./server.js");
  const realRead = fs.readFileSync;
  const ymlReads = [];
  fs.readFileSync = function (p, ...rest) { if (/\.yml$/i.test(String(p))) ymlReads.push(String(p)); return realRead.call(this, p, ...rest); };
  let names = {};
  try { names = (server.getLocalizationMap(MOD) || {}).names || {}; } finally { fs.readFileSync = realRead; }
  rec("(the lookup answers the mod's names)", names.MY_KEY === "Mine" && names.BASE_KEY === "Base", { MY_KEY: names.MY_KEY, BASE_KEY: names.BASE_KEY });
  rec("⭐⭐⭐ the first lookup after the warm reads no .yml: it takes the warm's map", ymlReads.length === 0, ymlReads);

  // ── the NEXT launch after a session that edited through Nova (second review) ──
  // The count of Nova's writes lives and dies with its process. Saved into the fingerprint on disk, a cache written after any
  // write of Nova's could never match at the next launch, and every launch after an editing session re-parsed every .yml.
  const file = path.join(MOD, "localisation", "english", "mine_l_english.yml");
  const PIN2 = PIN + 10;
  const SESSION = path.join(ROOT, "session.js");
  fs.writeFileSync(SESSION, [
    "const fs = require('fs');",
    "const s = require(" + JSON.stringify(path.join(__dirname, "server.js")) + ");",
    "const { safeModWrite } = require(" + JSON.stringify(path.join(__dirname, "safe-write.js")) + ");",
    "const file = " + JSON.stringify(file) + ";",
    "if (process.argv[2] === 'edit') {",
    "  safeModWrite(file, String.fromCharCode(0xfeff) + 'l_english:\\n MY_KEY:0 \"Minas\"\\n', 'test-warm-session');",
    "  fs.utimesSync(file, " + PIN2 + ", " + PIN2 + ");",
    "  const n = ((s.getLocalizationMap(" + JSON.stringify(MOD) + ") || {}).names || {}).MY_KEY;",
    "  process.stdout.write(JSON.stringify({ name: n }));",
    "} else {",
    "  const real = fs.readFileSync; const reads = [];",
    "  fs.readFileSync = function (p, ...rest) { if (/\\.yml$/i.test(String(p))) reads.push(String(p)); return real.call(this, p, ...rest); };",
    "  const n = ((s.getLocalizationMap(" + JSON.stringify(MOD) + ") || {}).names || {}).MY_KEY;",
    "  fs.readFileSync = real;",
    "  process.stdout.write(JSON.stringify({ name: n, reads }));",
    "}",
    "process.exit(0);",
  ].join("\n"));
  const runSession = (mode) => { const r = spawnSync(process.execPath, [SESSION, mode], { cwd: __dirname, env, encoding: "utf8", timeout: 120000 }); try { return JSON.parse(String(r.stdout || "").trim().split(/\r?\n/).pop()); } catch (_) { return { failed: (r.stderr || r.stdout || "").slice(-400) }; } };
  const edited = runSession("edit");
  rec("(a session edits the file through Nova and reads it back)", edited.name === "Minas", edited);
  const next = runSession("lookup");
  rec("(the next launch reads the edited name)", next.name === "Minas", next);
  rec("⭐⭐⭐ …and reads no .yml for it: the cache that session left is the one it takes", Array.isArray(next.reads) && next.reads.length === 0, next.reads);

  // ── …and in this process a write of Nova's own still counts, as #a-same-size-write-reads-stale needs ──
  const { safeModWrite } = require("./safe-write.js");
  const st = fs.statSync(file);
  safeModWrite(file, "﻿l_english:\n MY_KEY:0 \"Tuoss\"\n", "test-warm");   // "Minas" → "Tuoss": the same length
  fs.utimesSync(file, PIN2, PIN2);
  const st2 = fs.statSync(file);
  rec("(precondition: the write left the file's size and mtime as they were)", st2.size === st.size && st2.mtimeMs === st.mtimeMs, [st.size, st.mtimeMs, st2.size, st2.mtimeMs]);
  rec("⭐ a same-size write of Nova's is still read after it", ((server.getLocalizationMap(MOD) || {}).names || {}).MY_KEY === "Tuoss", ((server.getLocalizationMap(MOD) || {}).names || {}).MY_KEY);
} catch (e) {
  rec("the test ran to the end", false, String((e && e.stack) || e));
} finally {
  try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
}
console.log(`\n${pass} passed, ${fails.length} failed`);
if (fails.length) { console.log("FAILED: " + fails.join(" | ")); process.exit(1); }
process.exit(0);
