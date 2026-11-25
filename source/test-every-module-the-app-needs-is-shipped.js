// ⛔⛔ #safe-write-was-not-in-build-files — THE PACKAGED APP WOULD NOT HAVE STARTED.
//
// package.json's `build.files` is a WHITELIST: electron-builder ships those patterns and nothing else. Root
// modules are listed one by one, so extracting code into a new root file adds a require the packaged app
// cannot resolve — and the app dies at startup with `Cannot find module './safe-write.js'`, on every user's
// machine, delivered by the auto-updater.
//
// That is exactly what happened. safe-write.js was extracted out of server.js on 2026-09-05 so map-data.js
// could reach the same backup-then-rename writer; server.js and map-data.js both require it; nobody added it
// to build.files. It works perfectly from source and in every test, because tests run from the repo.
//
// CLAUDE.md's release gate does check the packaged asar for markers — but it runs at RELEASE time, once,
// after the tree is already tagged. "A rule policed only by an e2e test still decays — e2e runs on demand,
// unit runs on every change." This is the unit version: walk the require graph from the entry points and
// check every file it reaches against the patterns that will actually be packaged.
//
// Derived, never typed: the entry points come from package.json (main, and the processes it spawns), the
// graph comes from the requires in the source, and the patterns come from build.files. A hand-written list
// is the thing that goes stale between releases — which is the whole reason this file exists.
"use strict";

const fs = require("fs");
const path = require("path");

const fails = [];
let checks = 0;
function rec(label, cond, detail) {
  checks++;
  if (cond) console.log("  ok   " + label);
  else {
    fails.push(label);
    console.log("  FAIL " + label + "  -> " + String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 400));
  }
}

const ROOT = __dirname;
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
const patterns = (pkg.build && pkg.build.files) || [];

// electron-builder's matching is richer than this, but Nova's patterns are only two shapes: an exact file
// and a `dir/**/*` tree. Anything else appearing here means this check has stopped modelling the real one.
function shippedBy(rel) {
  const r = rel.replace(/\\/g, "/");
  for (const p of patterns) {
    if (p === r) return p;
    if (p.endsWith("/**/*") && r.startsWith(p.slice(0, -5) + "/")) return p;
  }
  return null;
}

console.log("\n[the whitelist is the shape this check understands]");
{
  rec("build.files exists", patterns.length > 0, patterns);
  const odd = patterns.filter((p) => !/^[\w.\-/]+$/.test(p.replace("/**/*", "")) || /[*?!{]/.test(p.replace("/**/*", "")));
  rec("…and every pattern is an exact file or a `dir/**/*` tree", odd.length === 0,
    { odd, why: "this check would silently under-model a negation or a brace pattern" });
}

console.log("\n[⭐ walk what the app actually requires, from its real entry points]");
const entries = [];
{
  // main is the Electron entry; the rest are the files it spawns or preloads, taken from main.js itself.
  if (pkg.main) entries.push(pkg.main);
  const MAIN = fs.readFileSync(path.join(ROOT, pkg.main || "main.js"), "utf8");
  for (const m of MAIN.matchAll(/["'`](?:\.[\\/])?([a-z0-9-]+\.js)["'`]/gi)) {
    if (fs.existsSync(path.join(ROOT, m[1])) && !entries.includes(m[1])) entries.push(m[1]);
  }
  rec(`${entries.length} entry points found in package.json + main.js`, entries.length >= 3, entries);
  rec("…including the preload and the warm child", entries.includes("preload.js") && entries.includes("warm-child.js"), entries);
  // server.js is deliberately NOT asserted here: main.js does not name it literally — the warm child
  // requires it — so it arrives through the graph below, which is the point of walking one.
}

const seen = new Set();
const notShipped = [];
// ⛔ #a-forked-module-is-required-too — a file a module FORKS is loaded by the packaged app just as a require is (🌍 Generate a
// world's builder, world-run.js, is started by server.js with child_process.fork(path.join(__dirname, "world-run.js"))), so the
// walk follows those edges as well, and says which edge reached each file.
const forkEdges = [];
{
  const queue = entries.slice();
  while (queue.length) {
    const rel = queue.shift();
    if (seen.has(rel)) continue;
    seen.add(rel);
    let src = "";
    try { src = fs.readFileSync(path.join(ROOT, rel), "utf8"); } catch (_) { continue; }
    if (!shippedBy(rel)) notShipped.push(rel);
    for (const m of src.matchAll(/require\(\s*"(\.[^"]+)"\s*\)/g)) {
      let dep = path.posix.normalize(path.posix.join(path.posix.dirname(rel.replace(/\\/g, "/")), m[1]));
      if (!/\.[a-z]+$/i.test(dep)) dep += ".js";
      if (fs.existsSync(path.join(ROOT, dep))) queue.push(dep);
    }
    for (const m of src.matchAll(/\bfork\(\s*path\.join\(\s*__dirname\s*,\s*["']([^"']+)["']\s*\)/g)) {
      let dep = path.posix.normalize(path.posix.join(path.posix.dirname(rel.replace(/\\/g, "/")), m[1]));
      if (!/\.[a-z]+$/i.test(dep)) dep += ".js";
      forkEdges.push([rel, dep]);
      if (fs.existsSync(path.join(ROOT, dep))) queue.push(dep);
    }
  }
  console.log("     reachable local modules: " + [...seen].sort().join(", "));
  rec(`${seen.size} local modules are reachable from the entry points`, seen.size >= 10, seen.size);
  rec("…and the walk really is transitive — it found the backend main.js never names", seen.has("server.js"), [...seen]);
  rec("⭐ every one of them is inside build.files", notShipped.length === 0,
    notShipped.map((f) => `${f} is required at runtime but would NOT be packaged — the app dies with "Cannot find module"`));
}

console.log("\n[the file this was found by]");
{
  rec("safe-write.js is reachable", seen.has("safe-write.js"), [...seen]);
  rec("…and shipped", !!shippedBy("safe-write.js"), "server.js and map-data.js both require it");
  const MAP = fs.readFileSync(path.join(ROOT, "map-data.js"), "utf8");
  const SRV = fs.readFileSync(path.join(ROOT, "server.js"), "utf8");
  rec("…because both of its callers still require it", /require\("\.\/safe-write\.js"\)/.test(MAP) && /require\("\.\/safe-write\.js"\)/.test(SRV),
    "if this changed, re-check whether the entry above is now stale");
}

console.log("\n[⭐ a file the app forks is shipped too — 🌍 Generate a world's builder]");
{
  const toWorld = forkEdges.filter(([, dep]) => dep === "world-run.js");
  rec("the walk found server.js forking world-run.js (a fork edge, not only a require)", toWorld.some(([from]) => from === "server.js"), forkEdges);
  rec("…every file a fork names exists", forkEdges.every(([, dep]) => fs.existsSync(path.join(ROOT, dep))), forkEdges.filter(([, dep]) => !fs.existsSync(path.join(ROOT, dep))));
  rec("⭐ …and world-run.js is inside build.files", !!shippedBy("world-run.js"), "the packaged app would fork a file it does not have: every 🌍 Generate a world fails at step 1");
  const without = patterns.filter((p) => p !== "world-run.js");
  const missed = forkEdges.map(([, dep]) => dep).filter((d) => !without.some((p) => p === d || (p.endsWith("/**/*") && d.startsWith(p.slice(0, -5) + "/"))));
  rec("CONTROL: removing world-run.js from build.files is detected through the fork edge alone", missed.includes("world-run.js"), missed);
}

console.log("\n[⭐ CONTROL: the check fails when something is left out]");
{
  // A guard that cannot fail is not a guard. Drop a genuinely-required module from the patterns and confirm
  // this would have caught it — the exact situation that shipped.
  const without = patterns.filter((p) => p !== "map-data.js");
  const shippedWithout = (rel) => {
    const r = rel.replace(/\\/g, "/");
    for (const p of without) {
      if (p === r) return true;
      if (p.endsWith("/**/*") && r.startsWith(p.slice(0, -5) + "/")) return true;
    }
    return false;
  };
  const wouldMiss = [...seen].filter((f) => !shippedWithout(f));
  rec("removing map-data.js from build.files is detected", wouldMiss.includes("map-data.js"), wouldMiss);
  rec("…and nothing else is falsely implicated by that", wouldMiss.length === 1, wouldMiss);
}

console.log("\n[the assets the app reads at runtime are trees, not listed files]");
{
  // public/ and data/ ship as trees, so a new page or dictionary needs no package.json change. Assert the
  // trees are there, because losing one is the same failure with a different message.
  for (const dir of ["public", "data"]) {
    rec(`${dir}/ ships as a tree`, patterns.includes(dir + "/**/*"), patterns);
  }
  rec("…so a new public file needs no build.files edit", !!shippedBy("public/nova-i18n.js"));
  rec("…including the language dictionaries", !!shippedBy("public/lang/ru.json"));
}

console.log(`\n=== every module the app needs is shipped: ${checks} checks, ${fails.length} failed ===`);
if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
