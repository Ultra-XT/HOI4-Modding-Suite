// ⛔⛔ #restore-deleted-the-snapshot-it-had-not-finished-with — A PARTIAL RESTORE DESTROYED THE ARCHIVE.
//
// Removing a country from the map writes a snapshot under .nova/removed_countries/<TAG>.json holding every
// affected state's ORIGINAL block and the country's history files. That file is the only copy of them, which
// makes it a backup — and CLAUDE.md rule #4 is absolute: never delete a backup, only on explicit
// authorisation, every time.
//
// restoreCountry ended with an unconditional `fs.unlinkSync(snapPath)`, after a loop that could put nothing
// back. Two things made that possible:
//
//   · editStateBlock answers `{ changed:false }` for BOTH "already exactly right" and
//     `{ changed:false, error:"State N not found in mod, dependencies, or vanilla." }`. Counting only
//     `changed` conflated them, so a total failure and a total no-op were indistinguishable.
//   · the delete ran either way.
//
// Measured on a scratch mod with a snapshot naming two states, one of which no longer exists anywhere:
//     ok:true, statesRestored:0 of 2, snapshot GONE.
// Both original blocks existed nowhere else. A state gets renumbered or its file removed and the archive
// that could have put the country back is destroyed by the very click meant to use it.
//
// The archive is MOVED now, not deleted, and only when there is nothing left to retry.
//
// ⛔ #a-removal-archive-lives-outside-the-mod (tool campaign B2-28) — and it lives in Nova's store for the mod (removedCountriesDir), not in
// <mod>/.nova/removed_countries, where it shipped with the mod. Every case below runs twice: with the archive in the store, and with it
// where an older Nova left it inside the mod, which Restore still reads after carrying it out (moved, byte for byte, never deleted).
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

const fails = [];
let checks = 0;
function rec(label, cond, detail) {
  checks++;
  if (cond) console.log("  ok   " + label);
  else {
    fails.push(label);
    console.log("  FAIL " + label + "  -> " + String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 340));
  }
}

const mapData = require("./map-data.js");
const GAME = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
// Built with path.join, so read it that way — a bare-string regex over the source found a different
// literal and put the fixture where nothing looks for it.
const SUB = path.join(".nova", "removed_countries");

const roots = [];
function mkMod(states, snapStates, where) {
  const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-restarc-"));
  roots.push(mod);
  // replace_path="history/states": these <id>-S.txt files are the mod's whole state list. Without it the installed game's
  // 1-France.txt loads beside 1-S.txt and, sorting first, is the state 1 HOI4 keeps and editStateBlock restores into
  // (#the-state-the-game-keeps), so the "already correct" state below would be restored into a copy of France.
  fs.writeFileSync(path.join(mod, "descriptor.mod"), 'version="1.0"\nname="RestArc"\nreplace_path="history/states"\n', "utf8");
  fs.mkdirSync(path.join(mod, "history", "states"), { recursive: true });
  for (const id of states) {
    fs.writeFileSync(path.join(mod, "history", "states", `${id}-S.txt`),
      `state = {\n\tid = ${id}\n\tname = "STATE_${id}"\n\tprovinces = { ${id}00 }\n\thistory = { owner = ZZB }\n}\n`, "utf8");
  }
  const store = mapData.removedCountriesDir(mod);
  const dir = where === "mod" ? path.join(mod, SUB) : store;
  fs.mkdirSync(dir, { recursive: true });
  const snapPath = path.join(dir, "ZZA.json");
  fs.writeFileSync(snapPath, JSON.stringify({
    tag: "ZZA", name: "Zedland", when: "2026-09-06T00:00:00.000Z",
    states: snapStates.map((id) => ({
      id,
      originalBlock: `state = {\n\tid = ${id}\n\tname = "STATE_${id}"\n\tprovinces = { ${id}00 }\n\thistory = { owner = ZZA }\n}`,
    })),
    countryHistory: [],
  }), "utf8");
  return { mod, snapPath, dir, store, bytes: fs.readFileSync(snapPath) };
}

for (const where of ["store", "mod"]) {
const IN = where === "mod" ? " (an archive an older Nova left inside the mod)" : " (the archive in Nova's store)";
console.log(`\n[⛔ a partial restore keeps the archive and says what it could not do${IN}]`);
{
  // The mod has state 1; the snapshot also names 99999, which exists nowhere.
  const { mod, store, bytes } = mkMod([1], [1, 99999], where);
  const snapPath = path.join(store, "ZZA.json");   // where Restore keeps a removal it could not finish, whichever place it read it from
  // Make state 1's live block IDENTICAL to the snapshot, so editStateBlock answers changed:false with no
  // error — the "already correct" case that used to be indistinguishable from a failure. (Written with
  // owner = ZZB by mkMod, which really does differ, so without this the state is genuinely restored and
  // the assertion below tests nothing.)
  fs.writeFileSync(path.join(mod, "history", "states", "1-S.txt"),
    'state = {\n\tid = 1\n\tname = "STATE_1"\n\tprovinces = { 100 }\n\thistory = { owner = ZZA }\n}', "utf8");
  const r = mapData.restoreCountry({ modRoot: mod, gameRoot: GAME, dependencyRoots: [], tag: "ZZA" });
  rec("the restore reports ok", r && r.ok === true, r);
  rec("⭐ the archive is still on disk, in Nova's store for the mod", fs.existsSync(snapPath), "the only copy of those state blocks is gone");
  rec("⭐ …byte for byte the archive it was", fs.existsSync(snapPath) && Buffer.compare(fs.readFileSync(snapPath), bytes) === 0);
  rec("⭐ …and none is left inside the mod", !fs.existsSync(path.join(mod, ".nova")), fs.existsSync(path.join(mod, SUB)) ? fs.readdirSync(path.join(mod, SUB)) : []);
  rec("…and it names the state it could not restore",
    Array.isArray(r.failedStates) && r.failedStates.some((f) => f.id === 99999), r.failedStates);
  rec("…with the reason", /not found/i.test(String((r.failedStates || [])[0] && (r.failedStates || [])[0].error)), r.failedStates);
  rec("…and warns that the removal was kept so it can be retried", /KEPT/.test(String(r.warning || "")), r.warning);
  rec("⭐ 'already correct' is not counted as 'restored'", r.alreadyCorrect === 1, r);
  rec("…and not as a failure either", (r.failedStates || []).length === 1, r.failedStates);
  rec("…so the country is still listed as removed, because it is",
    mapData.listRemovedCountries({ modRoot: mod }).some((c) => c.tag === "ZZA"),
    "the user cannot retry what the UI no longer offers");
}

console.log(`\n[⭐ a complete restore moves the archive aside — it never deletes it${IN}]`);
{
  // Every state in the snapshot exists, and its block differs, so all of them really are restored.
  const { mod, snapPath, store, bytes } = mkMod([7, 8], [7, 8], where);
  // Make the live blocks differ from the snapshot so editStateBlock reports changed.
  for (const id of [7, 8]) {
    fs.writeFileSync(path.join(mod, "history", "states", `${id}-S.txt`),
      `state = {\n\tid = ${id}\n\tname = "STATE_${id}"\n\tprovinces = { ${id}00 }\n\thistory = { owner = ZZB }\n}\n`, "utf8");
  }
  const r = mapData.restoreCountry({ modRoot: mod, gameRoot: GAME, dependencyRoots: [], tag: "ZZA" });
  rec("both states are restored", r && r.statesRestored === 2, r);
  rec("…with nothing reported as failed", !(r.failedStates || []).length, r.failedStates);
  rec("⭐ the archive is no longer where the 'removed' list looks", !fs.existsSync(snapPath) && !fs.existsSync(path.join(store, "ZZA.json")));
  const restoredDir = path.join(store, "restored");
  const kept = fs.existsSync(restoredDir) ? fs.readdirSync(restoredDir) : [];
  rec("⭐ …but it still EXISTS, under restored/ in Nova's store for the mod", kept.length === 1, kept);
  rec("…named for the tag and the time, so a second restore cannot overwrite the first",
    kept[0] && kept[0].startsWith("ZZA-") && kept[0].endsWith(".json"), kept);
  rec("…and the response says where it went", /restored\//.test(String(r.archivedTo || "")) && kept.length === 1
    && path.resolve(String(r.archivedTo)) === path.resolve(restoredDir, kept[0]), r.archivedTo);
  rec("…and its contents survived the move, byte for byte",
    kept.length === 1 && Buffer.compare(fs.readFileSync(path.join(restoredDir, kept[0])), bytes) === 0
    && (JSON.parse(fs.readFileSync(path.join(restoredDir, kept[0]), "utf8")).states || []).length === 2,
    "the archive moved but arrived changed");
  rec("⭐ …and nothing of it is left inside the mod", !fs.existsSync(path.join(mod, ".nova")), fs.existsSync(path.join(mod, SUB)) ? fs.readdirSync(path.join(mod, SUB)) : []);
  rec("…and the country is off the removed list", !mapData.listRemovedCountries({ modRoot: mod }).some((c) => c.tag === "ZZA"),
    "a restored country would still show as removed");
}
}

console.log("\n[⭐ CONTROL: nothing here deletes an archive, ever]");
{
  // ⚠️ Comment-masked. The fix's own comment quotes `fs.unlinkSync(snapPath)` to explain what it replaced,
  // so the "no longer unlinks" check matched the prose describing the bug rather than the code. Strip
  // comments before any source check — the trap CLAUDE.md names, walked into by the test that cites it.
  const { maskJsComments } = require("./testlib-strip-comments.js");
  const SRC = maskJsComments(fs.readFileSync(path.join(__dirname, "map-data.js"), "utf8"));
  const at = SRC.indexOf("function restoreCountry(");
  // ⚠️ restoreCountry({ modRoot, ... }) DESTRUCTURES its parameter, so the first "{" after the name is the
  // parameter object — walking from there extracts the params and nothing else, and every positive check
  // then fails against an empty body. Start after the closing ")".
  const bodyAt = SRC.indexOf("{", SRC.indexOf(")", SRC.indexOf("}", at)));
  let d = 0, end = at;
  for (let i = bodyAt; i < SRC.length; i++) {
    if (SRC[i] === "{") d++; else if (SRC[i] === "}") { d--; if (!d) { end = i; break; } }
  }
  const body = SRC.slice(bodyAt, end + 1);
  rec("restoreCountry no longer unlinks the snapshot", !/unlinkSync\(snapPath\)/.test(body),
    "CLAUDE.md rule #4: never delete a backup");
  rec("…it renames it", /fs\.renameSync\(snapPath,/.test(body));
  rec("…only when nothing failed", /if \(!failedStates\.length\)/.test(body));
  rec("…and if the move itself fails, it leaves the archive alone rather than deleting it",
    /never fall back to deleting/.test(body) || /catch \(_\) \{ archived = ""; \}/.test(body));
  // The stub-removal unlink is a DIFFERENT thing and must stay: it removes Nova's own placeholder so the
  // dependency's file shows through again.
  rec("…while the base-origin stub removal is untouched", /else \{ try \{ fs\.unlinkSync\(p\); \} catch \(_\) \{\} \}/.test(body),
    "that unlink restores the overlay and is not a backup");
}

for (const d of roots) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) { /* scratch only */ } }

console.log(`\n=== restoring a country keeps its archive: ${checks} checks, ${fails.length} failed ===`);
if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
