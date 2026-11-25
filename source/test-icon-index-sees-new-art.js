// #icon-index-fingerprint-too-shallow — ART DROPPED INTO THE MOD WAS INVISIBLE, AND STAYED INVISIBLE.
//
// The fuzzy icon index is persisted to disk and reused whenever a fingerprint says the gfx trees have not
// changed. That fingerprint stat'ed gfx/ and gfx/* — the top level and one below it. A directory's mtime
// moves when a DIRECT child changes, so a .dds copied into gfx/interface/goals/ moved goals/'s mtime and
// nothing the fingerprint looked at. The check said "unchanged", the stale list was reused, and because it
// lives on disk rather than in memory, restarting Nova did not clear it either.
//
// gfx/interface/goals/ is where HOI4 keeps focus icons, and hand-copying an icon pack into it is one of the
// most ordinary things a modder does.
//
// The index only ever needed the fuzzy path for art with NO declared sprite — /api/upload-gfx writes a .gfx
// entry and resolves through the sprite map instead — so hand-dropped files are precisely the population
// this index exists to serve, and precisely the one it could not see.
//
// ⭐ EACH QUERY RUNS IN ITS OWN PROCESS. The index is cached in memory for an hour, so a second call inside
// one process never reaches the persisted copy that carries the bug. A fresh process per query is also what
// the user actually does: quit Nova, reopen it, and the icon is still missing.
"use strict";
// #a-bare-test-run-writes-into-the-real-app-data — FIRST: run bare, every node child this starts inherits the sandbox.
require("./safe-write.js");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

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

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-iconfresh-"));
const toPosix = (p) => p.split(path.sep).join("/");
const MOD = path.join(ROOT, "artmod");
const GOALS = path.join(MOD, "gfx", "interface", "goals");
fs.mkdirSync(GOALS, { recursive: true });
fs.mkdirSync(path.join(MOD, "common"), { recursive: true });
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="ArtMod"\nsupported_version="1.19.*"\n');
fs.writeFileSync(path.join(ROOT, "artmod.mod"), 'name="ArtMod"\npath="' + toPosix(MOD) + '"\nsupported_version="1.19.*"\n');

// Two icons with names nothing in vanilla shares, so only this mod's files can answer for them.
const ALPHA = path.join(GOALS, "nova_alpha_goal_icon.dds");
fs.writeFileSync(ALPHA, "DDS placeholder alpha");
const BRAVO = path.join(GOALS, "nova_bravo_goal_icon.dds");

// A key one character short of the filename cannot be a declared sprite, so only the file index can answer.
const WORKER = path.join(__dirname, "testlib-icon-worker.js");
function launchAndAsk(key) {
  const out = execFileSync(process.execPath, [WORKER, ROOT, MOD, key], { encoding: "utf8", timeout: 180000 });
  const line = out.split(/\r?\n/).find((l) => l.startsWith("RESULT:"));
  return line ? line.slice(7).trim() : "(no result line)";
}
const same = (a, b) => !!a && path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();

function cacheFiles() {
  const dir = path.join(ROOT, "appdata", "NovaModdingSuite", "cache");
  try { return fs.readdirSync(dir).filter((f) => f.startsWith("gfxfiles_")).map((f) => path.join(dir, f)); }
  catch (_) { return []; }
}

try {
  console.log("\n[launch 1] the icon that was there all along");
  const first = launchAndAsk("nova_alpha_goal_ico");
  console.log(`     -> ${first || "(empty)"}`);
  // ⚠️ If this fails the fixture never worked and nothing below means anything.
  rec("the pre-existing icon resolves", same(first, ALPHA), first || "(empty)");

  const cached = cacheFiles();
  rec("…and the index was persisted to disk", cached.length === 1, cached);
  const cacheMtime = cached.length ? fs.statSync(cached[0]).mtimeMs : 0;

  console.log("\n[CONTROL] with nothing changed, the persisted index must be REUSED, not rebuilt");
  {
    // Without this, "the icon is found" could just mean the cache is never used — the fix would look like
    // a fix while having quietly thrown the cache away.
    const again = launchAndAsk("nova_alpha_goal_ico");
    rec("the icon still resolves on a second launch", same(again, ALPHA), again || "(empty)");
    const after = cached.length ? fs.statSync(cached[0]).mtimeMs : -1;
    rec("…and the cache file was not rewritten", after === cacheMtime, { before: cacheMtime, after });
  }

  console.log("\n[THE BUG] an icon copied into gfx/interface/goals/ — two levels below gfx/");
  {
    const gfxBefore = fs.statSync(path.join(MOD, "gfx")).mtimeMs;
    const ifaceBefore = fs.statSync(path.join(MOD, "gfx", "interface")).mtimeMs;
    fs.writeFileSync(BRAVO, "DDS placeholder bravo");
    // The measurement that explains the whole defect: neither directory the old fingerprint stat'ed moved.
    const gfxMoved = fs.statSync(path.join(MOD, "gfx")).mtimeMs !== gfxBefore;
    const ifaceMoved = fs.statSync(path.join(MOD, "gfx", "interface")).mtimeMs !== ifaceBefore;
    console.log(`     after adding the file: gfx/ mtime moved=${gfxMoved}, gfx/interface/ mtime moved=${ifaceMoved}`);
    rec("neither directory the old fingerprint watched actually moved", !gfxMoved && !ifaceMoved,
      { gfxMoved, ifaceMoved });

    const got = launchAndAsk("nova_bravo_goal_ico");
    console.log(`     -> ${got || "(empty)"}`);
    // Before the fix: "" — on the first launch after the copy, and on every launch after that.
    rec("the newly copied icon is found", same(got, BRAVO), got || "(empty)");
  }

  console.log("\n[and the old one still works] a rebuild must not lose what the cache held");
  {
    const still = launchAndAsk("nova_alpha_goal_ico");
    rec("the original icon still resolves after the rebuild", same(still, ALPHA), still || "(empty)");
  }

  console.log("\n[deletion too] removing art must drop it from the index");
  {
    fs.unlinkSync(BRAVO);
    const gone = launchAndAsk("nova_bravo_goal_ico");
    console.log(`     -> ${gone || "(empty)"}`);
    rec("the deleted icon is no longer offered", !same(gone, BRAVO), gone);
  }

  console.log("\n[the mechanism] the signature covers directories, not just the top two levels");
  {
    const SV = fs.readFileSync(path.join(__dirname, "server.js"), "utf8");
    rec("the walk records the directories it visits", /function collectIconFilesWithDirs\(/.test(SV), "not found");
    rec("…and validation re-stats that recorded set", /function iconIndexDirsUnchanged\(/.test(SV), "not found");
    rec("the shallow top-level fingerprint is gone", !/Build top-level directory fingerprint/.test(SV), "still there");
    rec("…and the persisted payload carries the signature", /dirSig,/.test(SV), "dirSig not stored");
  }

  console.log(`\n=== icon index sees new art: ${checks} checks, ${fails.length} failed ===`);
  if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
} catch (e) {
  console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
  process.exitCode = 1;
} finally {
  try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
}
