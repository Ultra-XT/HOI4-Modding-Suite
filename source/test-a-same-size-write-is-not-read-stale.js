// ⛔ #a-same-size-write-reads-stale — A NAME NOVA JUST WROTE IS THE NAME NOVA READS BACK, EVEN AT THE SAME LENGTH.
//
// getLocalizationMap caches the whole name map behind a fingerprint of every file's size and mtime, and a 30 s TTL trusted
// while no localisation write has been made. On Windows an mtime moves only with the clock tick — measured 09-29: 25 of 40
// same-size rewrites through safeModWrite left size AND mtime exactly as the write before. So a rename to a name of the same
// length, read back inside one tick of an earlier read, was served the OLD text: a Redraw named a region after a state's
// previous name in 3 runs of 10 (test-a-redraw-keeps-the-translations.js, found while writing it). And only writeUtf8BomFile
// and a few hand-placed calls ended the TTL, so a .yml written through safeModWrite directly was stale for up to 30 s.
//
// Here the tick is not left to chance: after a real same-size write, the file's mtime is set back to exactly what it was.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

let pass = 0;
const fails = [];
const rec = (name, cond, detail) => {
  if (cond) { console.log("  ok   " + name); pass++; }
  else { console.log("  FAIL " + name + (detail === undefined ? "" : "   → " + JSON.stringify(detail).slice(0, 400))); fails.push(name); }
};

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-samesize-"));
const GAME = path.join(ROOT, "game"), MODS = path.join(ROOT, "mods"), MOD = path.join(MODS, "m");
fs.mkdirSync(path.join(GAME, "localisation", "english"), { recursive: true });
fs.writeFileSync(path.join(GAME, "hoi4.exe"), "not really an exe");
fs.writeFileSync(path.join(GAME, "localisation", "english", "base_l_english.yml"), "﻿l_english:\n BASE_KEY:0 \"Base\"\n");
fs.mkdirSync(path.join(MOD, "localisation", "english"), { recursive: true });
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="Same Size"\nsupported_version="1.*"\n');
const FILE = path.join(MOD, "localisation", "english", "names_l_english.yml");
fs.writeFileSync(FILE, "﻿l_english:\n TOWN_9:0 \"Town 9 round 1\"\n");
process.env.HOI4_ROOT = GAME;
process.env.HOI4_MODS_ROOT = MODS;
process.env.NOVA_HOME_DIR = path.join(ROOT, "home");
if (!process.env.NOVA_APP_DATA_DIR) { process.env.APPDATA = path.join(ROOT, "appdata"); process.env.NOVA_APP_DATA_DIR = process.env.APPDATA; }

const { getLocalizationMap, modOwnLocKeys } = require("./server.js");
const { safeModWrite } = require("./safe-write.js");
const nameNow = () => ((getLocalizationMap(MOD) || {}).names || {}).TOWN_9;

// The file's times are pinned to a whole second — exact through utimes, where setting back a fractional mtime rounds
// (…691.9243 came back …691.9248 and the fingerprint moved by itself).
const PIN = 1700000000;
const pin = () => fs.utimesSync(FILE, PIN, PIN);
try {
  pin();
  rec("(the map reads the first name)", nameNow() === "Town 9 round 1", nameNow());
  // A same-size rename, written straight through safeModWrite — not writeUtf8BomFile — then the tick taken away.
  const before = fs.statSync(FILE);
  safeModWrite(FILE, "﻿l_english:\n TOWN_9:0 \"Town 9 round 2\"\n", "test-same-size");
  pin();
  const after = fs.statSync(FILE);
  rec("(precondition: the file's size and mtime are exactly what they were — only its text changed)",
    after.size === before.size && after.mtimeMs === before.mtimeMs && /round 2/.test(fs.readFileSync(FILE, "utf8")), { before: [before.size, before.mtimeMs], after: [after.size, after.mtimeMs] });
  rec("⭐⭐⭐ the map reads the name just written, not the one cached before it", nameNow() === "Town 9 round 2", nameNow());

  // …and again, inside the TTL, with the cache warm from the read just above
  safeModWrite(FILE, "﻿l_english:\n TOWN_9:0 \"Town 9 round 3\"\n", "test-same-size");
  pin();
  rec("(precondition: …and still are)", fs.statSync(FILE).mtimeMs === before.mtimeMs && fs.statSync(FILE).size === before.size, null);
  rec("⭐⭐ a second same-size write in a row is read too", nameNow() === "Town 9 round 3", nameNow());

  // ── the same blindness next door: modOwnLocKeys caches which keys each of the mod's files defines, by size and mtime ──
  // (review of the fix: the answer to "does the modder name this key in their own file" went stale the same way)
  const KEYS = path.join(MOD, "localisation", "english", "my_states_l_english.yml");
  fs.writeFileSync(KEYS, "﻿l_english:\n STATE_11:0 \"Eleven\"\n");
  fs.utimesSync(KEYS, PIN, PIN);
  const ownKeys = () => [...((modOwnLocKeys(MOD, ["STATE_11", "STATE_22"]).get("english")) || [])].sort();
  rec("(the key cache reads the file's key)", JSON.stringify(ownKeys()) === JSON.stringify(["STATE_11"]), ownKeys());
  safeModWrite(KEYS, "﻿l_english:\n STATE_22:0 \"Eleven\"\n", "test-same-size");
  fs.utimesSync(KEYS, PIN, PIN);
  rec("⭐⭐ …and after a same-size write that swaps the key, the new key and not the old one", JSON.stringify(ownKeys()) === JSON.stringify(["STATE_22"]), ownKeys());

  // ── …and the NEXT LAUNCH (#a-same-tick-write-keeps-its-stamp, savedInTheTickOf) ──
  // The count is this process's. An answer saved, then a same-size write in the very tick it was saved in, and no read after it:
  // the next launch, with no writes of its own to compare, took the saved map back (review of the fix round). Two readers take it
  // at a launch — getLocalizationMap, and the startup warm, which hands its answer to the first lookup — so each is asked in a
  // process of its own. The tick is not left to chance: the saved copy's time is set to the files' pinned second.
  rec("(the map reads round 3 over both of the mod's files, and saves it)", nameNow() === "Town 9 round 3", nameNow());
  const { ICON_CACHE_DIR } = require("./safe-write.js");
  const savedMaps = fs.readdirSync(ICON_CACHE_DIR).filter((n) => /^locmap_.*\.json$/.test(n)).map((n) => path.join(ICON_CACHE_DIR, n))
    .filter((p) => /Town 9 round 3/.test(fs.readFileSync(p, "utf8")));
  rec("(…in one saved map)", savedMaps.length === 1, savedMaps);
  const SAVED = savedMaps[0], savedBytes = SAVED ? fs.readFileSync(SAVED) : null;
  const savedInTheTick = () => { fs.writeFileSync(SAVED, savedBytes); fs.utimesSync(SAVED, PIN, PIN); };
  if (SAVED) savedInTheTick();
  safeModWrite(FILE, "﻿l_english:\n TOWN_9:0 \"Town 9 round 4\"\n", "test-same-size");
  pin();
  rec("(precondition: Nova rewrote the file at the same size, in the second the map was saved in)", fs.statSync(FILE).mtimeMs === before.mtimeMs && fs.statSync(FILE).size === before.size && !!SAVED && fs.statSync(SAVED).mtimeMs === PIN * 1000, null);
  const nextLaunch = (steps) => {
    const r = spawnSync(process.execPath, ["-e", [
      "const s = require(process.argv[1]), mod = process.argv[2];",
      "const name = () => ((s.getLocalizationMap(mod) || {}).names || {}).TOWN_9;",
      "const say = () => process.stdout.write('\\nNAME ' + JSON.stringify(name()) + '\\n', () => process.exit(0));",
      steps === "warm" ? "s.setActiveRoot(mod); Promise.resolve(s.createApp().locals.warmCaches({})).then(say, (e) => { console.error(e); process.exit(3); });" : "say();",
    ].join("\n"), path.join(__dirname, "server.js"), MOD], { cwd: __dirname, env: process.env, encoding: "utf8", timeout: 240000, maxBuffer: 64 << 20 });
    const line = String(r.stdout || "").split(/\r?\n/).find((l) => l.startsWith("NAME "));
    return line ? JSON.parse(line.slice(5)) : { status: r.status, tail: String((r.stdout || "") + (r.stderr || "")).slice(-600) };
  };
  if (SAVED) {
    const looked = nextLaunch("lookup");
    rec("⭐⭐ the next launch's lookup does not take back a map saved in the tick of the write after it: round 4", looked === "Town 9 round 4", looked);
    savedInTheTick();   // the copy the first launch left, again
    const warmed = nextLaunch("warm");
    rec("⭐⭐ …nor does the startup warm, which would hand it to the first lookup: round 4", warmed === "Town 9 round 4", warmed);
  }
} catch (e) {
  rec("the test ran to the end", false, String((e && e.stack) || e));
} finally {
  try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
}
console.log(`\n${pass} passed, ${fails.length} failed`);
if (fails.length) { console.log("FAILED: " + fails.join(" | ")); process.exit(1); }
process.exit(0);
