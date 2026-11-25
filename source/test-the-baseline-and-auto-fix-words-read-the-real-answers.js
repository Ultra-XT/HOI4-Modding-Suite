// ⛔ #the-baseline-and-auto-fix-words-read-the-real-answers (the B6 merge's open gap) — THE PAGE'S WORDS FOR 💾 Save baseline, 🛟 Restore AND
// 🔧 Auto-fix's copies ARE BUILT FROM THE ANSWERS THE SERVER REALLY GIVES, NOT FROM HAND-MADE COPIES OF THEM.
//
// B6-4, B6-5, B6-6 and B6-20 were fixed on both sides of a wire: map-data.js / safe-write.js answer new fields (heldVerdict, previousMovedTo,
// notChecked, refused, replacedMovedTo, restored, backupSnapshot.created …) and public/map.js / map-rule-labels.js word them. Each side's
// tests fed the other side's answer as a hand-made object, so a field renamed on one side passed both suites while the page went silent
// (the integration of the B6 fixes, "A gap the merge leaves"). Here the REAL producers run on a small mod in a temp folder:
//   saveMapBaseline / getMapBaselineInfo (B6-4, B6-5), restoreMapBaseline, finished and stopped part-way (B6-6), and the auto-fix route's
//   scope — safe-write.js beginBackupScope / safeModWrite / endBackupScope, exactly as server.js opens and ends it (B6-20) —
// and their answers go, untouched, into the page's own word builders lifted from public/map.js (which reads map-rule-labels.js).
// Every check holds a sentence against a fact on disk or in the answer: a path the words name exists, a count is the count.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const HOME = fs.mkdtempSync(path.join(os.tmpdir(), "nova-real-answer-words-home-"));
process.env.NOVA_HOME_DIR = HOME;   // before the require: the baseline store and the restore store live under it
const md = require("./map-data.js");
const safeWrite = require("./safe-write.js");
const P = require("./testlib-map-page.js");
const { maskJsComments } = require("./testlib-strip-comments.js");

let checks = 0; const fails = [];
const ok = (c, m, d) => { checks++; if (c) console.log("  ok   " + m); else { fails.push(m); console.log("  FAIL " + m + (d !== undefined ? "   -> " + JSON.stringify(d).slice(0, 600) : "")); } };
const tmps = [HOME];
const GAME = fs.mkdtempSync(path.join(os.tmpdir(), "nova-real-answer-words-game-")); tmps.push(GAME);   // a game folder with nothing in it
const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
const slash = (p) => String(p || "").replace(/\\/g, "/");

function mkMod(tag) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "nova-real-answer-words-" + tag + "-")); tmps.push(root);
  const w = (rel, body) => { const p = path.join(root, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, body, "utf8"); };
  w("descriptor.mod", 'name="realwords"\nsupported_version="1.*"\n');
  w("map/definition.csv", "0;0;0;0;land;false;unknown;0\n1;10;10;10;land;false;plains;1\n2;20;20;20;land;false;plains;1\n");
  w("map/strategicregions/1-A.txt", 'strategic_region = { id = 1 name = "A" provinces = { 1 2 } }\n');
  w("history/states/1-Real.txt", 'state = { id = 1 name = "STATE_1" manpower = 100 state_category = town provinces = { 1 2 } history = { owner = GER } }\n');
  w("history/countries/GER - Germany.txt", "capital = 1\n");
  const empty = () => w("history/states/1-Real.txt", 'state = { id = 1 name = "STATE_1" manpower = 100 state_category = town provinces = { } history = { owner = GER } }\n');
  return { root, w, empty };
}

// The page's word builders, lifted from public/map.js and run with the page's own map-rule-labels.js
const { sb } = P.runPage(["function baselineRestoreConfirmText(", "function baselineRestoreTitle(", "function baselineSavedNote(", "function replacedMovedNote(",
  "function baselineRestoreStoppedNote(", "function backupSnapshotNote("]);

try {
  console.log("\n=== B6-5 / B6-4: a baseline saved on a map the check passes, and what Restore then promises ===");
  const A = mkMod("good");
  const s1 = md.saveMapBaseline({ modRoot: A.root, gameRoot: GAME, dependencyRoots: [] });
  ok(s1 && s1.ok === true && !s1.notChecked, "THE CONTROL: the baseline was saved, checked, on a map with no problem Save stops for", s1);
  const info1 = md.getMapBaselineInfo({ modRoot: A.root });
  const hv = info1 && info1.heldVerdict;
  ok(!!hv && hv.fatal === 0 && Array.isArray(hv.rules), "THE CONTROL: getMapBaselineInfo hands the page the verdict it kept", info1);
  const loads = !!(info1.heldUnits && info1.heldDescriptors);
  const title1 = sb.baselineRestoreTitle(info1), confirm1 = sb.baselineRestoreConfirmText(info1);
  ok(loads && /known-good baseline/.test(title1) && /guarantees the game loads/.test(title1), "⭐⭐⭐ the 🛟 title promises a load for the REAL answer of a checked baseline", { title1, info1 });
  ok(/^Restore the map to your known-good baseline\?/.test(confirm1) && /It does guarantee the game loads\./.test(confirm1), "⭐⭐ …and so does the confirm", confirm1.slice(0, 300));
  ok(!/Nova kept no check of this baseline/.test(confirm1), "…and does not call it unchecked", confirm1);

  console.log("\n=== B6-4: a second save keeps the first, moved aside, and the words name where ===");
  sleep(5);
  const s2 = md.saveMapBaseline({ modRoot: A.root, gameRoot: GAME, dependencyRoots: [] });
  ok(s2 && s2.ok === true && typeof s2.previousMovedTo === "string" && fs.existsSync(s2.previousMovedTo), "THE CONTROL: the second save moved the first baseline aside, and it is on disk", s2);
  const note2 = sb.baselineSavedNote(s2);
  ok(note2.includes(s2.previousMovedTo) && /previous baseline was kept, not deleted/.test(note2), "⭐⭐⭐ the line names the folder the previous baseline is in, from the REAL answer", { note2, s2 });

  console.log("\n=== B6-4: a map Save stops for is refused, and the click's line reads the refusal's own fields ===");
  A.empty();
  sleep(5);
  const s3 = md.saveMapBaseline({ modRoot: A.root, gameRoot: GAME, dependencyRoots: [] });
  ok(s3 && s3.ok === false, "THE CONTROL: the save over an emptied capital was not made", s3);
  // the fields the click branches on, read off the page's own source (comments masked): `r.refused === "<kind>" && r.error`
  const masked = P.MASKED;
  const m = /else if \(r && r\.refused === "(\w+)" && r\.error\) setStatus\("💾 Save baseline refused: " \+ r\.error\)/.exec(masked);
  ok(!!m, "the 💾 click's refusal branch is in the page", null);
  ok(!!m && s3.refused === m[1] && typeof s3.error === "string" && s3.error.length > 0, `⭐⭐⭐ the REAL refusal answers refused === "${m && m[1]}" and an error, the two fields the click reads`, s3);
  ok(/Save stops for/.test(s3.error) && /kept as it was/.test(s3.error), "⭐ …and its words say a baseline is not made of such a map and what was kept", s3.error);
  ok(s3.verdict && s3.verdict.fatal > 0, "…with the verdict it refused on", s3.verdict);
  const info3 = md.getMapBaselineInfo({ modRoot: A.root });
  ok(info3.heldVerdict && info3.heldVerdict.fatal === 0 && /guarantees the game loads/.test(sb.baselineRestoreTitle(info3)), "⭐ the baseline kept is still the checked one, and still promised", info3);

  console.log("\n=== B6-4 / B6-5: with no game folder the save is unchecked, and nothing is promised ===");
  const B = mkMod("nogame");
  const s4 = md.saveMapBaseline({ modRoot: B.root });
  ok(s4 && s4.ok === true && typeof s4.notChecked === "string" && s4.notChecked.length > 0, "THE CONTROL: saved unchecked, saying why", s4);
  const note4 = sb.baselineSavedNote(s4);
  ok(/Nova could not check this map as it saved it/.test(note4) && /makes no promise that the game loads/.test(note4), "⭐⭐⭐ the line says the REAL answer's baseline was not checked", note4);
  const info4 = md.getMapBaselineInfo({ modRoot: B.root });
  const title4 = sb.baselineRestoreTitle(info4), confirm4 = sb.baselineRestoreConfirmText(info4);
  ok(!/known-good|guarantees the game loads/.test(title4) && /saved without a check of its map/.test(title4), "⭐⭐ …and 🛟's title promises nothing for it", { title4, info4 });
  ok(!/It does guarantee the game loads/.test(confirm4) && /Nova kept no check of this baseline's map/.test(confirm4), "⭐⭐ …nor its confirm", confirm4);

  console.log("\n=== B6-6: a finished restore moves the folders it replaced out of the mod, and the words name each one ===");
  const C = mkMod("restore");
  ok(md.saveMapBaseline({ modRoot: C.root, gameRoot: GAME, dependencyRoots: [] }).ok === true, "THE CONTROL: a baseline was saved");
  C.w("history/states/1-Real.txt", 'state = { id = 1 name = "STATE_1" manpower = 999 state_category = town provinces = { 1 2 } history = { owner = GER } }\n');
  C.w("map/my_notes.txt", "a file the modder made after the baseline\n");
  sleep(5);
  const r1 = md.restoreMapBaseline({ modRoot: C.root, gameRoot: GAME });
  const moved = (r1 && Array.isArray(r1.replacedMovedTo) ? r1.replacedMovedTo : []).filter((x) => x && x.to);
  ok(r1 && r1.ok === true && moved.length >= 2 && moved.every((x) => fs.existsSync(x.to)), "THE CONTROL: the restore finished and every folder it replaced is in Nova's store, on disk", r1);
  ok(moved.some((x) => fs.existsSync(path.join(x.to, "my_notes.txt"))), "THE CONTROL: the modder's later file went with the folder it was in");
  const noteR = sb.replacedMovedNote(r1.replacedMovedTo, r1.replacedLeftInMod, r1.leftoversMovedTo);
  ok(moved.every((x) => noteR.includes(x.to)) && /MOVED out of your mod \(not deleted\)/.test(noteR), "⭐⭐⭐ the line names every folder the REAL answer moved, and says nothing was deleted", { noteR, moved });
  const files = moved.reduce((n, x) => n + (Number(x.files) || 0), 0);
  ok(files > 0 && noteR.includes(`(${files.toLocaleString()} file${files === 1 ? "" : "s"})`), "⭐ …and counts the files the answer says it moved", { noteR, files });
  ok(sb.baselineRestoreStoppedNote(r1) === "", "…and a finished restore opens no stopped line");

  console.log("\n=== B6-6: a restore stopped part-way says what it had done, from its REAL answer ===");
  C.w("history/states/1-Real.txt", 'state = { id = 1 name = "STATE_1" manpower = 777 state_category = town provinces = { 1 2 } history = { owner = GER } }\n');
  sleep(5);
  const live = path.resolve(C.root, "history", "states");
  const realRename = fs.renameSync;
  let refused = 0, r2;
  fs.renameSync = function (from, to) {
    if (path.resolve(String(from)) === live) { refused++; const e = new Error(`EBUSY: resource busy or locked, rename '${from}' -> '${to}' (simulated)`); e.code = "EBUSY"; throw e; }
    return realRename.apply(this, arguments);
  };
  try { r2 = md.restoreMapBaseline({ modRoot: C.root, gameRoot: GAME }); } catch (e) { r2 = { thrown: String(e && e.message) }; } finally { fs.renameSync = realRename; }
  const back = (r2 && Array.isArray(r2.restored) ? r2.restored : []).map(slash);
  ok(refused >= 1 && r2 && r2.ok === false && back.length >= 1, "THE CONTROL: history/states could not be moved, and the answer says what was already put back", { refused, r2 });
  const stopped = sb.baselineRestoreStoppedNote(r2);
  ok(stopped.startsWith("⚠ 🛟 Restore baseline stopped part-way: EBUSY") && back.every((d) => stopped.includes(d.replace(/\/?$/, "/"))) && /Nothing was deleted/.test(stopped),
    "⭐⭐⭐ the stopped line opens with the REAL answer's reason and names each folder it had put back", { stopped, r2 });
  const moved2 = (Array.isArray(r2.replacedMovedTo) ? r2.replacedMovedTo : []).filter((x) => x && x.to);
  const note2b = sb.replacedMovedNote(r2.replacedMovedTo, r2.replacedLeftInMod, r2.leftoversMovedTo);
  ok(moved2.length >= 1 && moved2.every((x) => fs.existsSync(x.to) && note2b.includes(x.to)), "⭐⭐ …and the line after it names where the folders it had replaced are, each on disk", { note2b, moved2 });

  console.log("\n=== B6-20: the auto-fix route's copies, from the scope it really opens and ends ===");
  const D = mkMod("autofix");
  // what server.js's POST /api/map/auto-fix does around autoFixMap, line for line in effect: one scope, its folder under autoFixSnapshotDir
  const snapDir = path.join(md.autoFixSnapshotDir(D.root), new Date().toISOString().replace(/[:.]/g, "-"));
  safeWrite.beginBackupScope({ dir: snapDir, root: D.root });
  let snap = null;
  try {
    safeWrite.safeModWrite(path.join(D.root, "map", "definition.csv"), "0;0;0;0;land;false;unknown;0\n1;10;10;10;land;false;plains;1\n2;20;20;20;land;false;hills;1\n", "test-real-answer-words");
    safeWrite.safeModWrite(path.join(D.root, "history", "states", "2-Made.txt"), 'state = { id = 2 name = "STATE_2" provinces = { } }\n', "test-real-answer-words");
  } finally { snap = safeWrite.endBackupScope(); }
  const fixes = {};
  if (snap && (snap.files || snap.failed)) fixes.backupSnapshot = snap;   // the route's own condition (server.js)
  ok(!!fixes.backupSnapshot && snap.files === 1 && snap.created === 1 && fs.existsSync(path.join(snap.dir, "map", "definition.csv")), "THE CONTROL: the scope copied the one file it changed and counted the one it made", snap);
  const noteB = sb.backupSnapshotNote(fixes);
  ok(/Changed 1 file\. A copy of it was saved first, outside your mod, at:/.test(noteB) && noteB.includes(snap.dir), "⭐⭐⭐ the Auto-fix line names the REAL folder and the one copy in it", { noteB, snap });
  ok(/It also created 1 new file, which that folder has no copy of/.test(noteB), "⭐⭐⭐ …and the file the click made, which the folder cannot give back", noteB);
  // the route still opens one scope around the click and hands its answer on under this name (comments masked)
  const SERVER = maskJsComments(fs.readFileSync(path.join(__dirname, "server.js"), "utf8"));
  ok(/safeWrite\.beginBackupScope\(\{ dir: path\.join\(mapData\.autoFixSnapshotDir\(modRoot\), /.test(SERVER) && /result\.fixes\.backupSnapshot = scopeSnap;/.test(SERVER),
    "⭐ server.js's auto-fix route opens its scope under autoFixSnapshotDir and answers it as fixes.backupSnapshot, as this replays it");
} finally {
  for (const d of tmps) { try { if (path.resolve(d).startsWith(path.resolve(os.tmpdir()))) fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} }
}

console.log(`\n${checks - fails.length}/${checks} checks passed`);
if (fails.length) { console.log("FAILED:\n  " + fails.join("\n  ")); process.exit(1); }
