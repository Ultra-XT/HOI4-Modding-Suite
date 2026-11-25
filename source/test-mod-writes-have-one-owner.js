// #raw-write-skips-the-lock-retry — 44 WRITES INTO THE MODDER'S OWN FILES SKIPPED THE SAFE WRITER.
//
// safeModWrite is not "a write with a backup". It carries fixes that its callers get for free and that a
// raw fs.writeFileSync does not:
//
//   assertPathNotInGameRoot         never write into the Hearts of Iron IV install
//   backup-then-atomic              a recoverable copy, then an fsync'd write to a temp file and a rename,
//                                   so a process that dies mid-write cannot leave a truncated file
//   #readonly-file-raw-error        a locked or read-only target produces a sentence naming the cause, not
//                                   `EPERM: operation not permitted, rename 'C:\…\zz.txt.tmp-36268-…'`
//   #write-lock-gives-up-instantly  a ~345ms retry ladder that outlasts an antivirus or sync-client lock.
//                                   Its own comment records that lock hitting this project's test suite
//                                   three times, on three unrelated files, each passing when run alone.
//   invalidateModIndexCache         Home's counts and health do not go stale after the file changes
//
// Both of those tagged fixes exist because a modder hit them. 44 call sites never adopted either — including
// every technology writer (a rename touches every file in common/technologies), the .gfx and .gui writers,
// the capital assignment that rewrites an EXISTING state file, and descriptor.mod itself, where a
// half-written file is a mod the launcher will not load.
//
// This test exists because "convert them all" is worth nothing if the next write goes in raw. It DERIVES
// every fs.writeFileSync in server.js and requires each to be either recognised as not-a-mod-write, or
// named below with a reason. A new one fails until someone decides which it is.
//
// ⛔ #icon-import-no-backup — …AND IT HEARD ONE OF THE fs FUNCTIONS THAT PUT BYTES AT A PATH. Two routes copied a .dds
// over the picture a mod already had with a bare fs.copyFileSync, /api/ideas/import and /api/ideas/import-spirit-dds, with no
// backup anywhere, and this test could see neither: it looked for `fs.writeFileSync(` and a copy is not spelled that way. The
// sibling /api/gfx/import-dds had backed the same class of file up since #import-dds-no-backup (I-S6 of the 1.0.7 licence
// review). Widened 2026-11-13 to every fs function that writes a file's bytes (PRIMITIVES below): a copy, a rename, an append,
// a stream and an open for writing land a file as surely as a write does. Every call of one is either backed up first, the
// way the sibling does it (asked of the code, not of a reason someone wrote), or named in ALLOWED with the reason it is not a
// mod write, or named in GAPS: a mod write with no backup that this widening found and reported, printed every run. And so the
// list cannot go stale the way this test did, every fs function the scanned files call must be one of PRIMITIVES or be named
// in NOT_A_WRITE, and each name in either is checked to be a real function of Node's fs.
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
    console.log("  FAIL " + label + "  -> " + String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 700));
  }
}

const RAW = fs.readFileSync(path.join(__dirname, "server.js"), "utf8").replace(/\r/g, "");

// ⚠️ Mask comments LENGTH-PRESERVINGLY. stripJsComments removes text, so every line number it produces is
// wrong for the real file — and this test reports line numbers a person has to go and look at.
//
// #masker-desynced-on-a-regex-holding-a-quote — this file used to carry its OWN masker, forty lines that
// knew about strings and comments but not about regex literals. `/replace_path\s*=\s*"([^"]+)"/g` in
// map-data.js put it into string state and it never came out: 1,740 comment lines in server.js and 174 in
// mod-index.js were being read as CODE by the guard that decides whether a write into a user's mod is
// allowed. It preserved length and line count perfectly the whole time, so the two assertions below said
// it was fine. testlib-strip-comments.js already handled regex literals — and its own comments record the
// identical bug being fixed IN IT. The fix was next door and this caller never adopted it.
const { maskJsComments, maskJsLiterals, jsBodyAt } = require("./testlib-strip-comments.js");
// #map-writers-had-no-owner — THIS TEST READ server.js AND NOTHING ELSE.
//
// map-data.js held 27 writes into the user's mod — 12 with no backup of any kind, including provinces.bmp,
// state-id renumbering and country history — and this file could not see one of them. The rule the project
// cares most about was enforced everywhere except the files whose corruption stops a mod loading.
//
// So the scan takes a LIST of files. safe-write.js is here because safeModWrite now lives there; map-data.js
// is here because it is the reason any of this happened — every write in it now goes through safeModWrite
// except the two in ALLOWED below, each with its reason. Each file keeps its own text and its own
// line numbers — a concatenation would report line 31,000 of a file that has 6,000 lines, and a number a
// person cannot look up is worse than no number.
// …and the list is not trusted: every shipped module that writes must be one of these (asked of package.json, below).
const FILES = ["server.js", "safe-write.js", "map-data.js"];
// `code`: comments AND the inside of every string, template and regex blanked, same length — a call found in it is a call of
// the code, not a word in a message, and a brace or comma counted in it is the code's.
const sourceOf = (rel, raw) => { const m = maskJsComments(raw); return { rel, raw, m, code: maskJsLiterals(raw), lines: m.split("\n"), rawLines: raw.split("\n") }; };
const SOURCES = FILES.map((rel) => sourceOf(rel, fs.readFileSync(path.join(__dirname, rel), "utf8").replace(/\r/g, "")));
const byName = (rel) => SOURCES.find((s) => s.rel === rel);
const SRV = byName("server.js");
const SW = byName("safe-write.js");

for (const S of SOURCES) {
  rec(S.rel + ": the comment mask preserves length", S.m.length === S.raw.length && S.code.length === S.raw.length, { masked: S.m.length, code: S.code.length, raw: S.raw.length });
  rec(S.rel + ": …and the line count", S.lines.length === S.rawLines.length, { masked: S.lines.length, raw: S.rawLines.length });
}
// Kept for the checks below that are specifically about server.js's own text.
const M = SRV.m;
const lines = SRV.lines;

// ── the exceptions, each with the reason it is one ────────────────────────────────────────────────
//
// Matched on the TEXT of the call, not a line number — line numbers drift with every edit above them.
const ALLOWED = [
  // safeModWrite's own machinery.
  ["fs.writeFileSync(fd, content, \"utf8\")", "the atomic write INSIDE safeModWrite"],
  // Backups and caches are Nova's, not the modder's.
  ["fs.writeFileSync(backupPath,", "writing the recovery copy itself"],
  ["fs.writeFileSync(bp, original,", "writing the recovery copy itself"],
  ["fs.writeFileSync(savedPath,", "a diagnostics dump under Nova's own directory"],
  ["fs.writeFileSync(ACTIVE_MOD_STATE_FILE,", "Nova's app-data, not a mod"],
  ["fs.writeFileSync(gameFolderChoiceTmp,", "game-folder.json — the Game folder setting (#nova-does-not-find-the-game), in Nova's app-data (GAME_FOLDER_CHOICE_FILE under NOVA_APP_DATA_DIR) beside active-mod.json, not a mod; written to a temporary file and renamed over"],
  ["fs.writeFileSync(path.join(dir, BARE_MARK_FILE),", "safe-write.js: the mark the bare-run guard leaves in a sandbox it has just made with mkdtemp in the temp folder (#a-child-made-a-second-sandbox), not a mod"],
  ["fs.writeFileSync(worldRunTmp,", "world-run.json — 🌍 Generate a world's record of its run, in Nova's app-data (NOVA_APP_DATA_DIR) beside active-mod.json, not a mod; synchronous so the record of a stopped run is written before the child is killed"],
  ["fs.writeFileSync(runRecordTmp,", "safe-write.js: a map Save run's record of its first copies (#a-save-run-outlives-its-process, B6-28), in Nova's app-data (SAVE_RUN_RECORD_DIR under NOVA_APP_DATA_DIR) beside the backups it lists, not a mod; written to a temporary file and renamed over"],
  ["fs.writeFileSync(persistPath,", "a sprite-map cache under Nova's cache directory"],
  ["fs.writeFileSync(modPersistPath,", "a sprite-map cache under Nova's cache directory"],
  ["fs.writeFileSync(persistentCachePath,", "an icon/loc index cache under Nova's cache directory"],
  ["fs.writeFileSync(cachePath,", "a converted-DDS PNG cache under Nova's cache directory"],
  // The variable is `contentToWrite`, not `req.body.content`, because the route now runs the body through
  // matchExistingLineEndings first — the same line-ending match safeModWrite does. #save-mixes-line-endings
  ["fs.writeFileSync(fd, contentToWrite, \"utf8\")", "/api/save's own atomic write — it keeps its own backup step for the #backup-path-too-long message and the route's snapshot / createBackup flags, shares the rename ladder via renameOverWithRetry, and shares the line-ending match via matchExistingLineEndings"],
  ["fs.writeFileSync(modIndexDiskPath(modRoot)", "the mod-index cache under Nova's cache directory, keyed by a hash of the mod path"],
  ["fs.writeFileSync(recordTmp,", "the record of the region names Redraw regions wrote, of what each region was (#a-kept-name-keeps-its-kind) and of what Nova wrote in each language — under ~/.nova (regionNameRecordPath), not the mod; written to a temporary file and renamed over"],
  ["fs.writeFileSync(_tp, _prior.join", "warm-timings.log under Nova's cache directory"],
  // Binary assets that already take their own backup are no longer named here: "backupAssetBeforeOverwrite already ran" was a
  // reason nobody checked. A write is now excused for it only when its own function or route calls backupAssetBeforeOverwrite on
  // the same path before it (backedUpFirst, below) — the upload's .dds, the newspaper background, the research background, and
  // the three picture imports — so taking the backup out fails here (#icon-import-no-backup).
  // Nova's own sidecars inside the mod folder: editor metadata, not game content, rewritten constantly.
  // Backing these up on every keystroke-driven save would bury the real backups.
  ["fs.writeFileSync(previewPath,", "editor_research_preview.json — Nova's own metadata"],
  ["fs.writeFileSync(p, JSON.stringify", "editor_tech_icons.json / editor_equip_icons.json — Nova's own metadata"],
  ["fs.writeFileSync(customTabsFile,", "editor_custom_tabs.json — Nova's own metadata"],
  // ── map-data.js ──────────────────────────────────────────────────────────────────────────────────
  // Its writes all go through safeModWrite now, but for these two, each for a reason.
  //
  // The two sibling `.bak` writes that used to be excused here are GONE (2026-09-16, owner's decision). The
  // reason given for keeping them — "nothing READS them, so they are redundant beside a real rotating backup,
  // but removing a recovery mechanism while adding one is a separate change" — was a note that a deferred
  // question was still open, and the stale-allowance check below is what would have caught the entries
  // outliving their calls. They were a second backup inside the mod, which a modder uploads to the Workshop:
  // 43 files / 63.9 MB measured in the owner's mod folder, and one that escaped into Road to 56's Workshop
  // directory. #a-backup-must-not-ship-with-the-mod now derives that rule from package.json's build.files.
  // ⛔ #a-removal-archive-lives-outside-the-mod (B2-28) — this said "Nova's own metadata inside the mod, and HOI4 never reads .nova", while
  // the owner's rule says a backup inside the mod ships to every subscriber. The archive moved out; the check below keeps the reason true.
  ["fs.writeFileSync(path.join(snapDir,", "Remove country's archive — ~/.nova/removed_countries (removedCountriesDir), outside the mod entirely"],
  // Written into the STAGING copy, not the live baseline dir: #save-deleted-the-baseline-before-it-copied
  // means the marker that makes a baseline "exist" only ever lands on a complete one.
  ["fs.writeFileSync(path.join(staged, \"_baseline.json\")", "~/.nova/map_baselines — outside the mod entirely"],
  // …and the list of Nova's state-names files the baseline holds beside it, written after their copies (#a-baseline-keeps-its-states-names)
  ["fs.writeFileSync(path.join(dir, \"_files.json\")", "~/.nova/map_baselines — outside the mod entirely"],
  // …and Nova's record of the cut, read and written into the STAGING copy when copying it was refused (#a-restored-map-keeps-the-record-of-its-cut, review of 5a1af33f K2)
  ["fs.writeFileSync(path.join(staged, BASELINE_SPLIT_RECORD)", "~/.nova/map_baselines — outside the mod entirely"],
  // …and the copies of the mod's descriptor files, likewise, when copying one was refused (#a-restored-map-keeps-the-lines-that-load-it, MI-2)
  ["fs.writeFileSync(path.join(staged, BASELINE_DESCRIPTORS_DIR,", "~/.nova/map_baselines — outside the mod entirely"],
  // #rivers-learn-from-the-right-map — the provinces Generate land drew rivers for, so the next one learns from the world, not from them
  ["fs.writeFileSync(riversRecordTmp,", "~/.nova/generated_rivers (generatedRiversRecordPath) — outside the mod entirely; written to a temporary file and renamed over"],
  // #a-raised-province-is-cut-to-land-size — the families Generate land cut, so B2 lays their units out and Delete map can fold them back
  ["fs.writeFileSync(splitRecordTmp,", "~/.nova/province_splits (provinceSplitRecordPath) — outside the mod entirely; written to a temporary file and renamed over"],
  // #a-painted-coast-goes-back-the-way-it-came — the heights a paint's raise moved and what each held, so a paint back puts them back
  ["fs.writeFileSync(paintedHeightsTmp,", "~/.nova/painted_heights (paintedHeightsRecordPath) — outside the mod entirely; written to a temporary file and renamed over"],

  // ── the other primitives (#icon-import-no-backup, 2026-11-13) ─────────────────────────────────────────────────────────────────
  // server.js
  ["fs.renameSync(recordTmp, recordPath)", "the record of the region names Redraw regions wrote, under ~/.nova (regionNameRecordPath): its temporary file, excused above, renamed over it"],
  ["fs.copyFileSync(f.abs, to)", "saveBaselineStateNames: Nova's own state-names files copied INTO a map baseline (baselinePath, under ~/.nova/map_baselines), out of the mod"],
  ["fs.promises.writeFile(persistPath,", "a sprite-map cache under Nova's cache directory, as its writeFileSync twin above"],
  ["fs.promises.writeFile(modPersistPath,", "a sprite-map cache under Nova's cache directory, as its writeFileSync twin above"],
  ["fs.promises.writeFile(persistentCachePath,", "an icon/loc index cache under Nova's cache directory, as its writeFileSync twin above"],
  ["fs.copyFileSync(texconvPng, outPath)", "texconv's PNG copied to outPath, which the converter's one caller sets to cachePath: a converted-DDS PNG under Nova's cache directory"],
  ["fs.copyFileSync(texPng, outPath)", "the async twin of the line above, likewise called with cachePath only"],
  ["fs.renameSync(worldRunTmp, WORLD_RUN_STATE_FILE)", "world-run.json in Nova's app-data: its temporary file, excused above, renamed over it"],
  ["fs.copyFileSync(stateFileInfo.path, statePath)", "Create country and the New-mod template take a state from the layer below: only when the file the game keeps for it is not the mod's (!stateFileInfo.inMod) is it copied into the mod's history/states under its own name. A mod file of that name would shadow the lower one (stateFileTheGameKeeps skips every name the mod ships, case-insensitively), so there is none to overwrite; the edit that follows is safeModWrite's"],
  ["fs.copyFileSync(absPath, bp)", "Mod Health's recovery copy itself (bp), taken before its fix"],
  ["fs.copyFileSync(origBak, own)", "heals a legacy Nova rewrite: puts the mod's own interface/eventwindow.gui back from the .nova-orig copy an older Nova kept, and only over a file that begins with NOVA_EVENTGUI_MARKER — Nova's stripped copy, never the modder's"],
  ["fs.copyFileSync(srcOpt, p.optEntry)", "Apply newspaper style's own copy of the chosen source's option-entry art (nova_event_option_entry.dds, novaNewspaperPaths): nothing else writes that name, and the source keeps its own"],
  ["fs.copyFileSync(srcMin, p.minimize)", "…and of its minimize-button art (nova_event_button_minimize.dds), likewise"],
  ["fs.copyFileSync(srcOverlay, p.overlay)", "…and of its picture overlay (nova_event_news_pic_overlay.dds), which Upload newspaper only ever deletes"],
  ["fs.copyFileSync(res.path, targetPath)", "ensureCountryHistoryFileInMod: a country's history file from the layer below copied into the mod under its own name, only when the mod has none for the tag (findCountryHistoryFile looks in the mod first, by the tag the name starts with); the edits that follow are safeModWrite's"],
  ["fs.openSync(tmpPath, \"w\")", "the temporary file safeModWrite and /api/save write before renaming it over the target through renameOverWithRetry"],
  // safe-write.js
  ["fs.appendFileSync(path.join(sb, BARE_NOTES_FILE), line)", "the bare-run guard's notes, in the sandbox folder it made with mkdtemp in the temp folder, not a mod"],
  ["fs.renameSync(tmpPath, absPath)", "the atomic rename inside renameOverWithRetry, the one owner's retry ladder"],
  ["fs.copyFileSync(absPath, to)", "a copy of a mod file OUT of the mod, before it is written: into a backup scope's folder (copyIntoOpenScope) or Delete map's snapshot folder (snapshotFileBeforeOverwrite), both under ~/.nova"],
  ["fs.copyFileSync(from, to)", "a map Save run's first copy of a file, into the run's folder outside the mod (_intoSaveRun)"],
  ["fs.copyFileSync(absPath, backupPath)", "the recovery copy itself (safeModWrite, backupAssetBeforeOverwrite)"],
  // (final-int: the calls below came in with map-fix and final-data, after this widening was cut; each is classified where it writes)
  ["fs.appendFileSync(file, JSON.stringify(entry)", "_noteInSaveRunRecord: one line added to a map Save run's record (run.record, under SAVE_RUN_RECORD_DIR in NOVA_APP_DATA_DIR), the record runRecordTmp above rewrites — Nova's app-data, not a mod"],
  // map-data.js
  ["fs.renameSync(paintedHeightsTmp, record.file)", "~/.nova/painted_heights: its temporary file, excused above, renamed over it"],
  ["fs.openSync(file, \"r+\")", "townPictureThatCannotBeWritten: opened for writing and closed at once, writing nothing — the probe of whether a picture can be written"],
  ["fs.renameSync(path.join(dir, f), path.join(dir, nf))", "renames a state file Nova named after its name key, inside the mod's history/states; refused when the new name is taken, so it overwrites nothing and the bytes move whole"],
  ["fs.renameSync(splitRecordTmp, recordPath)", "~/.nova/province_splits: its temporary file, excused above, renamed over it"],
  ["fs.renameSync(riversRecordTmp, recordPath)", "~/.nova/generated_rivers: its temporary file, excused above, renamed over it"],
  ["fs.copyFileSync(recordPath, recordPath.replace(", "a copy of one of Nova's records (~/.nova) kept beside it before it is rewritten"],
  ["fs.copyFileSync(path.join(srcDir, f), path.join(dest, f))", "Auto-fix's snapshot of the mod's strategic regions, copied OUT of the mod into regionMoveSnapshotDir (~/.nova)"],
  ["fs.copyFileSync(path.join(dir, f), to)", "Delete map's copy of a file it is about to delete, into its snapshot folder (snapRoot, ~/.nova)"],
  // ⛔ #a-removal-archive-lives-outside-the-mod (B2-28, final-data) — the archive is in Nova's store for the mod now, so the three renames are
  // the store's own; the archive check below follows each of them to its snapDir. (This entry said "into .nova/removed_countries/restored
  // (Nova's own metadata in the mod, which HOI4 never reads)", true when it was written and not since B2-28.)
  ["fs.renameSync(snapPath, dest)", "restoreCountry moves the removed country's archive into restored/ in Nova's store for the mod (~/.nova/removed_countries, removedCountriesDir) under a new timestamped name, instead of deleting it; outside the mod (one an older Nova left inside the mod leaves by _moveFileOutOfMod)"],
  ["fs.renameSync(path.join(snapDir, `${T}.json`), earlierSetAside)", "Remove country: an earlier archive of the same tag set aside into replaced/ in Nova's store for the mod (~/.nova/removed_countries, removedCountriesDir), never written over; outside the mod"],
  ["fs.renameSync(earlierSetAside, path.join(snapDir,", "…and put back under its own name in that store when the new archive cannot be written; outside the mod"],
  ["fs.renameSync(p, path.join(statesDir, nf))", "renames a renumbered state's file to its new id, only when that name is free: it overwrites nothing and the bytes move whole"],
  ["fs.copyFileSync(path.join(legacyDir, f), path.join(dest, f))", "moves Nova's legacy in-mod region backup OUT of the mod, to ~/.nova (copied, counted, then removed)"],
  ["fs.cpSync(path.join(modRoot, d), path.join(staged, d)", "a map baseline's copy of the mod's map directories, OUT into its staging folder under ~/.nova/map_baselines"],
  ["fs.copyFileSync(splitRecord, path.join(staged, BASELINE_SPLIT_RECORD))", "into a map baseline's staging folder under ~/.nova"],
  ["fs.copyFileSync(file, to); } catch (_) { fs.writeFileSync(path.join(staged, BASELINE_DESCRIPTORS_DIR,", "a descriptor file copied into a map baseline's staging folder under ~/.nova"],
  ["fs.copyFileSync(path.join(modRoot, ...rel.split(\"/\")), to)", "a mod file copied into a map baseline's staging folder under ~/.nova"],
  ["fs.copyFileSync(record, path.join(staged, BASELINE_REGION_NAME_RECORD))", "into a map baseline's staging folder under ~/.nova"],
  ["fs.copyFileSync(paintedHeightsRecordPath(modRoot), path.join(staged, BASELINE_HEIGHTS_RECORD))", "into a map baseline's staging folder under ~/.nova"],
  // ⛔ #a-baseline-is-moved-never-deleted (B6-4, map-fix) — `fs.renameSync(dest, aside)` became moveAside's rename into a dated folder
  ["fs.renameSync(from, to)", "saveMapBaseline's moveAside: a baseline it replaces, or a save's unfinished staging copy or leftover, renamed into a dated folder beside the baseline under ~/.nova/map_baselines — one rename, nothing deleted"],
  ["fs.renameSync(previousMovedTo, dest)", "saveMapBaseline putting the baseline it set aside back under its own name (~/.nova/map_baselines) when the swap failed"],
  ["fs.renameSync(staged, dest)", "saveMapBaseline swapping its own baseline folders under ~/.nova/map_baselines"],
  ["fs.renameSync(aside, dest)", "saveMapBaseline putting the previous baseline back under ~/.nova/map_baselines"],
  ["fs.cpSync(live, to, { recursive: true })", "_moveOutOfMod: a mod directory copied OUT to Nova's folder (~/.nova), counted before its original is removed"],
  // ⛔ #a-restore-moves-the-map-it-replaces (map-fix) and #a-file-leaves-the-mod-by-a-move (final-data)
  ["fs.renameSync(live, to)", "_moveOutOfMod: a mod directory moved OUT of the mod into Nova's per-mod store (~/.nova, _novaModScopedDir) by one rename when the store is on the mod's drive: nothing is copied or removed, and the bytes move whole"],
  ["fs.copyFileSync(live, to)", "_moveFileOutOfMod: one mod file copied OUT into Nova's per-mod store (~/.nova, _novaModScopedDir), read back and compared byte for byte before the original is taken out"],
  ["fs.renameSync(dd + \".nova-previous\", dd)", "🛟 Restore baseline: the leftover of a restore that did not finish (<dir>.nova-previous) renamed back to its own name inside the mod, only when <dir> is gone — it IS the mod's map: it overwrites nothing and the bytes move whole"],
  ["fs.cpSync(s, staged, { recursive: true })", "🛟 Restore baseline: the baseline's copy of a directory staged beside the live one (<dir>.nova-restoring); the live directory is untouched if this throws"],
  // (This said the aside "is removed with fs.rmSync once it has, so the directory as it stood is kept nowhere", true when the widening was cut
  // and not since map-fix's #a-restore-moves-the-map-it-replaces.)
  ["fs.renameSync(dd, aside)", "🛟 Restore baseline: the live directory moved aside whole (<dir>.nova-previous) before the restored one takes its place; once it has, it goes out of the mod into Nova's store (_moveOutOfMod, baseline_restores), or stays in the mod and is said (replacedLeftInMod) — never removed"],
  ["fs.renameSync(staged, dd)", "🛟 Restore baseline: the restored directory put where the live one was — the overwrite the modder asked for"],
  ["fs.renameSync(aside, dd)", "🛟 Restore baseline: the live directory put back when that swap failed"],
  ["fs.copyFileSync(abs, to)", "Restore baseline moving a file the baseline does not hold OUT of the mod: the copy to ~/.nova/baseline_restores is compared byte for byte before the file is removed"],
  ["fs.copyFileSync(recordPath, aside())", "a copy of the region-names record (~/.nova) kept beside it before it is replaced"],
  ["fs.copyFileSync(path.join(src, BASELINE_REGION_NAME_RECORD), tmp)", "the baseline's copy of the region-names record put back (~/.nova), through a temporary file"],
  ["fs.renameSync(tmp, recordPath)", "…that temporary file renamed over the record (~/.nova)"],
  ["fs.renameSync(recordPath, aside())", "the region-names record (~/.nova) set aside under a timestamped name, not deleted"],
  ["fs.copyFileSync(path.join(src, BASELINE_HEIGHTS_RECORD), tmp)", "the baseline's copy of the painted-heights record put back (~/.nova), through a temporary file"],
  ["fs.renameSync(tmp, file)", "…that temporary file renamed over the painted-heights record (~/.nova)"],
];

// ── GAPS: writes INTO a mod that take no backup, found by the 2026-11-13 widening (#icon-import-no-backup) ─────────────────────────
//
// NOT exceptions. Each is a write of the modder's own file that skips the backup the rest of this file promises, reported to the
// owner with the widening and left for its own change (each needs a test of its own and a back-out). Listed so the suite stays
// green while they are open, printed by every run so they are not forgotten, and stale-checked like ALLOWED: fix one, and its
// entry fails until it is deleted. Matched on the call's text, so one entry may name the same call in two places.
const GAPS = [
  ["fs.appendFileSync(tagsFile, tagLine, \"utf8\")", "POST /api/countries/create appends the new tag to the mod's common/country_tags/custom_countries.txt outside safeModWrite: no backup, no temporary file, no lock retry, and a file whose last line has no newline gets the new tag glued onto it"],
  ["fs.promises.writeFile(outPath, tgaBuf)", "POST /api/flags/import-custom-image (the focus tree's custom flag) and POST /api/flags/upload-country-flag (Country Setup, through writeHoi4FlagSetForStem) write gfx/flags/<stem>.tga, medium/ and small/, over the mod's own flag of that name, with no backup"],
  ["fs.promises.writeFile(variantPath, tgaBuf)", "…and its four ideology variants, likewise"],
  ["fs.promises.writeFile(mirrorBase, tgaBuf)", "…and the mirror tag's flag, likewise"],
  ["fs.promises.writeFile(mirrorVariant, tgaBuf)", "…and the mirror tag's variants, likewise"],
  ["fs.copyFileSync(srcBg, p.bg)", "POST /api/events/apply-newspaper-style copies the source's background over gfx/interface/nova_event_news_bg.dds with no backup; after Upload newspaper that file is the modder's own picture, and /api/events/upload-newspaper backs the same file up before it replaces it — the fix next door, not adopted"],
];

// ── fs handed on under another name ─────────────────────────────────────────────────────────────────────────────────────────────
//
// ⛔ #a-renamed-fs-went-unheard — THE WIDENING STOPPED HEARING WHAT THE OLD SCAN HEARD. The old scan matched `fs.writeFileSync(`
// wherever it stood; the widened one heard `fs.X(` only as a whole word. So `const nodefs = fs; nodefs.writeFileSync(…)` into a
// mod failed the old test and passed the new one, and so did `const io = fs; io.copyFileSync(…)` and `fs["copyFileSync"](…)`,
// while the comment on the alias check said a spelling the scan cannot follow fails (review M1 of the widening, 2026-11-18).
// Now every call spelled the old way, `…fs.X(` whatever comes before fs, must be one the scan hears; and fs used as a VALUE (kept
// in a variable, handed to a function, read off an object, indexed), the one way to reach it under a name the scan does not
// know, fails unless it is named here. Each entry is the WHOLE line it is on (comments aside, trimmed), so code added to that
// line is not excused with it, and it must name exactly one line. The name fs lands under there is then HEARD as fs's own
// (RECEIVERS), so a write through it is a call like any other, classified like any other, and "it only reads" is asked of the
// code, not of the reason.
const FS_VALUES = [
  // [the whole line, trimmed; the name the scan hears fs under after it; why fs is handed on there]
  ["const fsx = o.fs || fs;", "fsx", "detectHoi4GameFolder (#nova-does-not-find-the-game): a test hands it a fake fs as opts.fs; otherwise fsx is fs itself"],
  ["platform: process.platform, env: process.env, choice: GAME_FOLDER_CHOICE, root: ROOT, fs,", "fs", "detectGameFolderOnThisMachine hands fs itself to detectHoi4GameFolder as opts.fs, which reads it as o.fs: heard as fs's own name"],
  ["for (const games of xboxGamesFolders(root, fsx, P)) {", "fsx", "detectHoi4GameFolder hands fsx on to xboxGamesFolders…"],
  ["function xboxGamesFolders(driveRoot, fsx, P) {", "fsx", "…which takes it under the same name"],
];
// The names the scan hears fs under: its own, and each one an entry above hands it on under. Derived from the entries, not typed.
const RECEIVERS = [...new Set(["fs", ...FS_VALUES.map(([, name]) => name)])].sort((a, b) => b.length - a.length);

// ── the primitives: every fs function that can put bytes at a path ──────────────────────────────────────────────────────────────
// The value is the index of the argument naming the path written: a copy, a rename and a link write their second. An open is a
// write unless its flag is a literal "r" or "rs" (or absent); the write through that descriptor is then the open's.
const PRIMITIVES = {
  writeFileSync: 0, writeFile: 0, appendFileSync: 0, appendFile: 0, createWriteStream: 0,
  openSync: 0, open: 0, writeSync: 0, write: 0, writevSync: 0, writev: 0,
  truncateSync: 0, truncate: 0, ftruncateSync: 0, ftruncate: 0,
  copyFileSync: 1, copyFile: 1, cpSync: 1, cp: 1, renameSync: 1, rename: 1,
  linkSync: 1, link: 1, symlinkSync: 1, symlink: 1,
};
// …and the fs functions these files call that write no file's bytes. Every name must be one the files really use (checked below):
// this is what the scan was told to pass over, not a catalogue of Node. A deletion is not a write; CLAUDE.md's first and fourth
// rules govern it, not this test.
const NOT_A_WRITE = {
  existsSync: "reads", readFileSync: "reads", readdirSync: "reads", statSync: "reads", fstatSync: "reads", accessSync: "reads",
  readSync: "reads", realpathSync: "reads", "promises.readFile": "reads", "promises.readdir": "reads", "promises.stat": "reads",
  "promises.access": "reads", constants: "flags", closeSync: "closes a descriptor",
  fsyncSync: "flushes a descriptor that an excused open made", mkdirSync: "makes a folder", mkdtempSync: "makes a fresh temp folder",
  chmodSync: "a file's attributes, not its bytes", unlinkSync: "deletes", rmSync: "deletes", rmdirSync: "deletes",
};

// ── the scan ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
const NAMES = Object.keys(PRIMITIVES).sort((a, b) => b.length - a.length);
const RECV = RECEIVERS.join("|");
// `fs.X(`, `fs.promises.X(` and `require("fs").X(`, and the same through every name in RECEIVERS: found where only comments are
// masked (so a require's "fs" can be read), and kept only where the code mask still shows the name — a word inside a string, a
// template or a regex is not a call.
const CALL_RE = new RegExp(String.raw`(?:\b(?:${RECV})|\brequire\(\s*(["'])fs\1\s*\))\s*\.\s*(?:promises\s*\.\s*)?(${NAMES.join("|")})\s*\(`, "g");
// …and the old scan's spelling, for every primitive: `fs.X(` wherever it stands, whatever comes before fs. A call spelled so that
// CALL_RE does not hear it (nodefs.writeFileSync, myfs.copyFileSync) is fs under a name the scan does not know (#a-renamed-fs-went-unheard).
const SPELLED_RE = new RegExp(String.raw`fs\s*\.\s*(?:promises\s*\.\s*)?(${NAMES.join("|")})\s*\(`, "g");
// fs, or a name the scan hears it under, used as a VALUE: anything but a member of it (fs.X) or the name being bound (fs = …,
// not == or =>). `o.fs` counts: the scan hears o.fs.X( as fs's own, so o.fs kept in a variable is fs under another name.
const VALUE_RE = new RegExp(String.raw`(?<![\w$])(${RECV})\b(?!\s*(?:\.|=(?![=>])))`, "g");
const READ_FLAG = /^(["'`])rs?\1$/;
function lineOf(S, idx) {
  if (!S.nl) { S.nl = []; for (let i = S.m.indexOf("\n"); i !== -1; i = S.m.indexOf("\n", i + 1)) S.nl.push(i); }
  let lo = 0, hi = S.nl.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (S.nl[mid] < idx) lo = mid + 1; else hi = mid; }
  return lo + 1;
}
// The arguments of the call whose "(" is at `open`, split at its own top-level commas — counted in the code mask, so a comma in a
// string is not one — each read from the comment-masked text with its whitespace folded.
function argsAt(S, open) {
  const args = [];
  let depth = 0, from = open + 1;
  for (let i = open + 1; i < S.code.length; i++) {
    const c = S.code[i];
    if (c === "(" || c === "[" || c === "{") depth++;
    else if (c === ")" || c === "]" || c === "}") { if (depth === 0) { args.push(S.m.slice(from, i)); break; } depth--; }
    else if (c === "," && depth === 0) { args.push(S.m.slice(from, i)); from = i + 1; }
  }
  return args.map((a) => a.replace(/\s+/g, " ").trim()).filter((a, i, all) => a !== "" || i < all.length - 1);
}
// The functions and routes of a file, each as the [open, close] of its body, braces counted in the code mask; the innermost one
// around a call is the one it is in.
function spansOf(S) {
  const spans = [];
  for (const f of S.m.matchAll(/(?:^|\n)[ \t]*(?:async\s+)?function\s+([A-Za-z0-9_$]+)\s*\(|app\.(get|post|put|delete|patch)\(\s*"([^"]+)"/g)) {
    const span = jsBodyAt(S.code, f.index + f[0].length - (f[1] ? 1 : 0));
    if (span) spans.push({ name: f[1] || `${f[2].toUpperCase()} ${f[3]}`, open: span[0], close: span[1] });
  }
  return spans;
}
const innermost = (spans, at) => spans.filter((sp) => sp.open < at && at < sp.close).sort((a, b) => (a.close - a.open) - (b.close - b.open))[0] || null;
function writeCalls(S, spans) {
  const out = [];
  for (const c of S.m.matchAll(CALL_RE)) {
    const name = c[2], nameAt = c.index + c[0].lastIndexOf(name);
    if (S.code.slice(nameAt, nameAt + name.length) !== name) continue;
    const args = argsAt(S, c.index + c[0].length - 1);
    if (/^open(Sync)?$/.test(name) && (args.length < 2 || READ_FLAG.test(args[1]))) continue;   // opened to read
    const lineEnd = S.m.indexOf("\n", c.index);
    out.push({ rel: S.rel, at: `${S.rel}:${lineOf(S, c.index)}`, index: c.index, name, dest: args[PRIMITIVES[name]] || "",
      text: S.m.slice(c.index, lineEnd < 0 ? S.m.length : lineEnd).trim(), in: innermost(spans, c.index) });
  }
  return out;
}
// ⭐ BACKED UP FIRST, the way /api/gfx/import-dds does it (#import-dds-no-backup): the function or route the write is in calls
// backupAssetBeforeOverwrite on the same path — the same text — before it. Asked of the code, so taking the backup out fails here.
function backedUpFirst(S, call) {
  if (!call.in || !call.dest) return false;
  const re = /\bbackupAssetBeforeOverwrite\s*\(/g;
  re.lastIndex = call.in.open;
  for (let b = re.exec(S.code); b && b.index < call.index; b = re.exec(S.code)) {
    if ((argsAt(S, b.index + b[0].length - 1)[0] || "") === call.dest) return true;
  }
  return false;
}
// Each call's verdict. A needle names the call's own text, from its first character, so one entry excuses only the calls it spells.
function classify(S, spans) {
  return writeCalls(S, spans).map((call) => {
    if (backedUpFirst(S, call)) return Object.assign(call, { kind: "backed up first" });
    const allow = ALLOWED.find(([needle]) => call.text.startsWith(needle));
    if (allow) return Object.assign(call, { kind: "allowed", needle: allow[0] });
    const gap = GAPS.find(([needle]) => call.text.startsWith(needle));
    if (gap) return Object.assign(call, { kind: "gap", needle: gap[0], why: gap[1] });
    return Object.assign(call, { kind: "offender" });
  });
}
// Where CALL_RE hears a primitive's name, before an open's flag is read: the index of the name.
function heardAt(S) {
  const at = new Set();
  for (const c of S.m.matchAll(CALL_RE)) {
    const nameAt = c.index + c[0].lastIndexOf(c[2]);
    if (S.code.slice(nameAt, nameAt + c[2].length) === c[2]) at.add(nameAt);
  }
  return at;
}
// Every call the code spells the old way, `…fs.X(`, that CALL_RE does not hear: the index of each one's name.
function unheardIn(S) {
  const heard = heardAt(S);
  return [...S.code.matchAll(SPELLED_RE)].map((c) => c.index + c[0].lastIndexOf(c[1])).filter((i) => !heard.has(i));
}
// Every use of fs, or of a name in RECEIVERS, as a value, with the FS_VALUES entry naming its line — looked for in FILES only
// (`covered`), so a shipped module outside them is flagged for every one, and so is a synthetic source.
function fsValuesIn(S, covered = FILES.includes(S.rel)) {
  return [...S.code.matchAll(VALUE_RE)].map((r) => {
    const line = S.lines[lineOf(S, r.index) - 1].trim();
    return { at: `${S.rel}:${lineOf(S, r.index)}`, index: r.index, name: r[1], line,
      entry: covered ? FS_VALUES.find(([needle]) => line === needle) : undefined };
  });
}
// The spellings this scan cannot follow — fs or fs.promises under another name, a primitive taken out of it, or one used as a
// value (kept in a variable, handed to promisify); fs itself used as a value on a line FS_VALUES does not name; a call spelled
// the old way that CALL_RE does not hear; and a require or import whose name it cannot read. Any of them fails the test until
// the scan is taught it. (`covered`: whether FS_VALUES may excuse a use of fs as a value, as fsValuesIn.)
function aliasesIn(S, covered = FILES.includes(S.rel)) {
  const out = [];
  const at = (i) => `${S.rel}:${lineOf(S, i)}`;
  for (const r of S.m.matchAll(/\brequire\(\s*(["'])((?:node:)?fs(?:\/promises)?|graceful-fs|fs-extra)\1\s*\)/g)) {
    if (S.code.slice(r.index, r.index + 7) !== "require") continue;
    const before = S.m.slice(Math.max(0, r.index - 40), r.index), after = S.m.slice(r.index + r[0].length, r.index + r[0].length + 8);
    if (r[2] === "fs" && /\bconst fs\s*=\s*$/.test(before)) continue;                              // the one spelling
    if (r[2] === "fs" && /^\s*\.\s*(?!promises\b)[A-Za-z_$]/.test(after)) continue;                 // require("fs").X: heard
    out.push(`${at(r.index)}: ${r[0]}`);
  }
  // (`= fs` or `= fs.promises` and the statement ends: `const { size } = fs.statSync(p)` destructures an answer, not fs)
  for (const r of S.m.matchAll(/\{[^{}]*\}\s*=\s*(?:fs(?:\s*\.\s*promises)?\s*(?=[;,)\n]|$)|require\(\s*(["'])(?:node:)?fs(?:\/promises)?\1\s*\))/g)) {
    if (S.code[r.index] === "{") out.push(`${at(r.index)}: a destructured fs`);
  }
  for (const r of S.code.matchAll(new RegExp(String.raw`\b(?:${RECV})\s*\.\s*promises\b(?!\s*\.)`, "g"))) out.push(`${at(r.index)}: fs.promises as a value`);
  for (const r of S.code.matchAll(new RegExp(String.raw`\b(?:${RECV})\s*\.\s*(?:promises\s*\.\s*)?(?:${NAMES.join("|")})\b(?!\s*\()`, "g"))) out.push(`${at(r.index)}: ${r[0]} as a value`);
  for (const v of fsValuesIn(S, covered)) if (!v.entry) out.push(`${v.at}: ${v.name} as a value`);
  for (const i of unheardIn(S)) out.push(`${at(i)}: ${S.lines[lineOf(S, i) - 1].trim().slice(0, 90)} (spelled as a call of fs, through a name the scan does not hear)`);
  // …and a module the scan cannot read the name of: a dynamic import(), a require( of anything but one plain string, or require
  // itself handed on. None of the three is in a shipped module today (measured 2026-11-19).
  for (const r of S.code.matchAll(/(?<![\w$.])import\s*\(/g)) out.push(`${at(r.index)}: a dynamic import()`);
  for (const r of S.m.matchAll(/\brequire\s*\(\s*([^)]*)\)/g)) {
    if (S.code.slice(r.index, r.index + 7) === "require" && !/^(["'])[^"'`]*\1$/.test(r[1].trim())) out.push(`${at(r.index)}: a require( of ${r[1].trim().slice(0, 40) || "nothing"}, which the scan cannot read`);
  }
  for (const r of S.code.matchAll(/(?<![\w$.])require\b(?!\s*[(.])/g)) out.push(`${at(r.index)}: require as a value`);
  return out;
}
// Every fs member the code uses, "promises.X" for one of fs.promises.
function fsMembersIn(S) {
  const out = new Map();
  for (const r of S.m.matchAll(new RegExp(String.raw`(?:\b(?:${RECV})|\brequire\(\s*(["'])fs\1\s*\))\s*\.\s*(promises\s*\.\s*)?([A-Za-z_$][\w$]*)`, "g"))) {
    const at = r.index + r[0].length - r[3].length;
    if (S.code.slice(at, at + r[3].length) !== r[3]) continue;
    const key = (r[2] ? "promises." : "") + r[3];
    out.set(key, (out.get(key) || 0) + 1);
  }
  return out;
}

console.log("\n[every write into a mod goes through one owner — every primitive that puts bytes at a path, not only writeFileSync]");
const SPANS = new Map(SOURCES.map((S) => [S.rel, spansOf(S)]));
const CALLS = SOURCES.flatMap((S) => classify(S, SPANS.get(S.rel)));
const shown = (c) => { const S = byName(c.rel); return { at: c.at, in: c.in ? c.in.name : "(module scope)", text: S ? S.rawLines[lineOf(S, c.index) - 1].trim().slice(0, 140) : c.text }; };
{
  // PRECONDITION: the scan reads the files, and hears every call spelled the way the old scan heard fs.writeFileSync(, for every
  // primitive: `fs.X(` wherever it stands, whatever comes before fs (#a-renamed-fs-went-unheard). This used to count
  // `\bfs.writeFileSync(`, the widened scan's own spelling, so it could not see what the widening had stopped hearing.
  for (const S of SOURCES) {
    const spelled = [...S.code.matchAll(SPELLED_RE)].length, unheard = unheardIn(S);
    rec(`PRECONDITION: ${S.rel}: the scan hears all ${spelled} calls its code spells …fs.X(, whatever comes before fs`, spelled > 0 && unheard.length === 0,
      { spelled, heard: heardAt(S).size, unheard: unheard.map((i) => `${S.rel}:${lineOf(S, i)}`) });
  }
  const of = (kind) => CALLS.filter((c) => c.kind === kind);
  const offenders = of("offender");
  rec("⭐ no write into a mod bypasses its owner", offenders.length === 0,
    { count: offenders.length, offenders: offenders.slice(0, 8).map(shown), hint: "route it through safeModWrite(abs, text, reason), back the asset up first with backupAssetBeforeOverwrite(<the same path>) as /api/gfx/import-dds does, or add it to ALLOWED with the reason it is not a mod write" });

  // ⭐ A stale allowance is how an exception outlives its reason. Every entry must still match something.
  const stale = ALLOWED.filter(([needle]) => !CALLS.some((c) => c.kind === "allowed" && c.needle === needle)).map(([n]) => n);
  rec("…and no allowance is stale", stale.length === 0, { stale, hint: "the call it excused is gone, or is backed up first now — delete the entry" });
  const closed = GAPS.filter(([needle]) => !CALLS.some((c) => c.kind === "gap" && c.needle === needle)).map(([n]) => n);
  rec("…and no gap is stale", closed.length === 0, { closed, hint: "the write it named is gone or backed up first now — delete the entry, and say so where it was reported" });
  rec("…and the scan spells out what it found",
    CALLS.length === of("backed up first").length + of("allowed").length + of("gap").length + offenders.length, CALLS.length);
  const tally = {};
  for (const c of CALLS) tally[c.kind] = (tally[c.kind] || 0) + 1;
  console.log(`       ${CALLS.length} calls of ${new Set(CALLS.map((c) => c.name)).size} primitives: ${JSON.stringify(tally)}`);
  for (const c of of("backed up first")) console.log(`       backed up first  ${c.at} ${c.name} in ${c.in.name}`);
  // Printed every run, so an open gap is never mistaken for a covered write.
  for (const c of of("gap")) console.log(`  gap  ${c.at} in ${c.in ? c.in.name : "(module scope)"}: ${c.why}`);

  // ⛔ #a-removal-archive-lives-outside-the-mod (B2-28) — …AND THE REASON AN ENTRY GIVES MUST STILL BE TRUE. The removal archive's entry says
  // its raw write lands outside the mod; a needle that still matches says nothing about where. So each write it excuses is followed to the
  // function holding it, whose `snapDir` must come from removedCountriesDir, which must be a store _novaModScopedDir keeps outside the mod.
  // (final-int: and the two renames that set an earlier archive aside in the same store and put it back, which came in with B2-28 after
  // the widening was cut, are followed the same way: their entries give the same reason.)
  const MD = byName("map-data.js");
  const ARCHIVE_NEEDLES = ["fs.writeFileSync(path.join(snapDir,", "fs.renameSync(path.join(snapDir,", "fs.renameSync(earlierSetAside, path.join(snapDir,"];
  const archiveReasonHolds = (m) => {
    const sites = [];
    for (const needle of ARCHIVE_NEEDLES) for (let at = m.indexOf(needle); at !== -1; at = m.indexOf(needle, at + 1)) {
      const fn = m.lastIndexOf("\nfunction ", at);
      const assign = /const snapDir = ([^;\n]+);/.exec(m.slice(fn, at));
      sites.push(assign ? assign[1].trim() : "(no snapDir assignment in its function)");
    }
    const dir = /function removedCountriesDir\(modRoot\) \{ return ([^;\n]+); \}/.exec(m);
    return { sites, dir: dir ? dir[1] : "", holds: sites.length > 0 && sites.every((s) => s === "removedCountriesDir(modRoot)") && !!dir && /^_novaModScopedDir\(modRoot, "removed_countries"\)$/.test(dir[1]) };
  };
  const ar = archiveReasonHolds(MD.m);
  rec("⭐ the removal archive's allowance is still true: its snapDir is Nova's per-mod store, outside the mod", ar.holds, ar);
  rec("CONTROL: the snapDir the archive had inside the mod would fail it",
    !archiveReasonHolds(MD.m.replace("const snapDir = removedCountriesDir(modRoot);", "const snapDir = path.join(modRoot, REMOVED_COUNTRIES_SUBDIR);")).holds
    && MD.m.includes("const snapDir = removedCountriesDir(modRoot);"));
}

console.log("\n[the scan hears what it says it hears]");
{
  const fakeSource = (raw) => sourceOf("synthetic.js", raw);
  const callsIn = (raw) => { const S = fakeSource(raw); return classify(S, spansOf(S)); };
  // every primitive, in every spelling the scan claims, is heard — and once: through each name in RECEIVERS, and as o.fs, which
  // FS_VALUES says the scan hears as fs's own
  const spellings = NAMES.flatMap((n) => RECEIVERS.map((r) => `${r}.${n}(a, b);`).concat([`o.fs.${n}(a, b);`, `require("fs").${n}(a, b);`, `fs . ${n} (a, b);`])
    .concat(typeof fs.promises[n] === "function" ? [`await fs.promises.${n}(a, b);`] : []));
  const spelled = fakeSource(spellings.join("\n"));
  const heardLines = new Set(classify(spelled, spansOf(spelled)).map((h) => lineOf(spelled, h.index)));
  const missed = spellings.filter((s, i) => !heardLines.has(i + 1));
  rec(`CONTROL: each of the ${NAMES.length} primitives is heard in every spelling (${spellings.length} calls)`, missed.length === 0 && heardLines.size === spellings.length,
    { heard: heardLines.size, of: spellings.length, missed: missed.slice(0, 6) });
  // …and none of what is not a call of fs: in a comment, in a string, a template, a regex, a method of something else, a longer
  // name (myfs is not a call the scan can classify; the check of spellings it cannot follow, below, is what fails it)
  const decoys = [`// fs.copyFileSync(a, b);`, `/* fs.renameSync(a, b) */`, `const s = "fs.copyFileSync(a, b)";`, "const t = `fs.cpSync(${a}, b)`;",
    `const r = /fs.copyFileSync(a)/;`, `res.write(a);`, `myfs.copyFileSync(a, b);`, `fs.copyFileSyncs(a, b);`, `fs.openSync(a, "r");`, `fs.openSync(a);`, `fs.openSync(a, 'rs');`];
  rec("CONTROL: …and nothing that is not a write call of fs (comments, strings, templates, regexes, other objects, reads)", callsIn(decoys.join("\n")).length === 0,
    callsIn(decoys.join("\n")).map((c) => c.text));
  rec("CONTROL: an open for writing is a write, whatever its flag says", callsIn([`fs.openSync(a, "w");`, `fs.openSync(a, "r+");`, `fs.openSync(a, "a");`, `fs.openSync(a, flags);`].join("\n")).length === 4);
  // the backup excuses only the same path, and only before
  const rule = callsIn([
    `function other() { backupAssetBeforeOverwrite(elsewhere, "x"); fs.copyFileSync(src, target); }`,
    `function before() { backupAssetBeforeOverwrite(target, "x"); fs.copyFileSync(src, target); }`,
    `function after() { fs.copyFileSync(src, target); backupAssetBeforeOverwrite(target, "x"); }`,
    `function apart() { backupAssetBeforeOverwrite(target, "x"); }\nfunction later() { fs.copyFileSync(src, target); }`,
  ].join("\n"));
  rec("CONTROL: a backup excuses a write of the SAME path, BEFORE it, in the SAME function — no other",
    rule.map((c) => `${c.in && c.in.name}:${c.kind}`).join() === "other:offender,before:backed up first,after:offender,later:offender", rule.map((c) => `${c.in && c.in.name}:${c.kind}`));
  // spellings the scan cannot follow fail; the one it can does not
  const aliasCases = [`const fsp = require("fs/promises");`, `const { copyFileSync } = require("fs");`, `const { writeFile } = fs.promises;`,
    `const p = fs.promises;`, `const cp = fs.copyFileSync;`, `promisify(fs.copyFile)(a, b);`, `const nfs = require("node:fs");`, `const g = require("graceful-fs");`,
    // #a-renamed-fs-went-unheard: fs itself as a value (kept, indexed, optional-chained, handed on, read off an object), the same
    // for a name the scan hears it under, and a call spelled the old way through a longer name
    `const io = fs;`, `fs["copyFileSync"](a, b);`, `fs?.copyFileSync(a, b);`, `copyAll(fs, a, b);`, `const w = o.fs;`, `const io = fsx;`,
    `fsx["copyFileSync"](a, b);`, `nodefs.writeFileSync(a, "x");`, `myfs.copyFileSync(a, b);`,
    `const m = await import("fs");`, `const x = require(name);`, `const y = require("f" + "s");`, `const r = require; r("fs");`];
  const missedAliases = aliasCases.filter((src) => aliasesIn(fakeSource(src)).length === 0);
  rec(`CONTROL: each of ${aliasCases.length} spellings the scan cannot follow is caught`, missedAliases.length === 0, missedAliases);
  const canFollow = `const fs = require("fs");\nrequire("fs").existsSync(a);\nfs.promises.readFile(a);\nfs.copyFileSync(a, b);\nfsx.copyFileSync(a, b);\no.fs.existsSync(a);`;
  rec("CONTROL: …and the spellings it can are not", aliasesIn(fakeSource(canFollow)).length === 0, aliasesIn(fakeSource(canFollow)));
  const aliases = SOURCES.flatMap((S) => aliasesIn(S));
  rec("⭐ the scanned files write through no spelling the scan cannot follow", aliases.length === 0, aliases.slice(0, 8));
  // ⭐ …and fs is handed on only where FS_VALUES names it: each entry one line of the code, none stale, none able to excuse a
  // second line, each name it is heard under a plain name. CONTROL, derived: what excuses those uses is their entry.
  const values = SOURCES.flatMap((S) => fsValuesIn(S));
  const staleValues = FS_VALUES.filter(([needle]) => !values.some((v) => v.entry && v.entry[0] === needle)).map(([n]) => n);
  const linesNamed = (needle) => SOURCES.reduce((n, S) => n + S.lines.filter((l) => l.trim() === needle).length, 0);
  const notOneLine = FS_VALUES.filter(([needle]) => linesNamed(needle) !== 1).map(([needle]) => [needle, linesNamed(needle)]);
  const badNames = FS_VALUES.filter(([, name]) => !/^[A-Za-z_$][\w$]*$/.test(name)).map(([, name]) => name);
  rec(`⭐ each of the ${FS_VALUES.length} places FS_VALUES names hands fs on, on exactly one line, and none is stale`,
    staleValues.length === 0 && notOneLine.length === 0 && badNames.length === 0, { staleValues, notOneLine, badNames, hint: "the use it named is gone — delete the entry; or the needle names two lines — lengthen it" });
  const excused = values.filter((v) => v.entry);
  const without = SOURCES.flatMap((S) => aliasesIn(S, false));
  rec(`CONTROL: …and what excuses each of those ${excused.length} uses is its entry: read without FS_VALUES, the check above names every one`,
    excused.length > 0 && without.length === aliases.length + excused.length, { uses: excused.length, namedWithout: without.slice(0, 8) });
  for (const at of [...new Set(values.map((v) => v.at))]) {
    const v = values.find((x) => x.at === at);
    console.log(`       fs handed on  ${at}: ${v.line.slice(0, 90)}  — heard after it as ${v.entry ? v.entry[1] : "(not named)"}`);
  }

  // ⭐ DERIVED: every fs function the files call is a primitive (scanned) or is named as one that writes no file's bytes — so a
  // primitive this list forgot fails here, the way writeFileSync's siblings should have — and every name in both lists is real.
  const used = new Map();
  for (const S of SOURCES) for (const [k, n] of fsMembersIn(S)) used.set(k, (used.get(k) || 0) + n);
  const isPrimitive = (k) => (k.startsWith("promises.") ? PRIMITIVES[k.slice(9)] !== undefined && typeof fs.promises[k.slice(9)] === "function" : PRIMITIVES[k] !== undefined);
  const unclassified = [...used.keys()].filter((k) => !isPrimitive(k) && !(k in NOT_A_WRITE));
  rec(`⭐ every one of the ${used.size} fs functions the scanned files use is a primitive or is named in NOT_A_WRITE`, unclassified.length === 0,
    { unclassified, hint: "a function that writes a file's bytes goes in PRIMITIVES (and is then scanned); one that does not goes in NOT_A_WRITE with what it does" });
  const unusedNotAWrite = Object.keys(NOT_A_WRITE).filter((k) => !used.has(k));
  rec("…and NOT_A_WRITE names only functions the files use", unusedNotAWrite.length === 0, { unusedNotAWrite, hint: "nothing calls it any more — delete the entry" });
  const realFn = (k) => (k.startsWith("promises.") ? typeof fs.promises[k.slice(9)] === "function" : k === "constants" ? typeof fs.constants === "object" : typeof fs[k] === "function");
  const unreal = Object.keys(PRIMITIVES).concat(Object.keys(NOT_A_WRITE)).filter((k) => !realFn(k));
  rec("…and every name in PRIMITIVES and NOT_A_WRITE is a real function of Node's fs", unreal.length === 0, unreal);
}

console.log("\n[FILES is every shipped module that writes: asked of package.json, not trusted]");
{
  // ⭐ #map-writers-had-no-owner, the same hole one level up: FILES is typed, and a typed list of files is how map-data.js's 27
  // writes went unseen. Widening the primitives is worth nothing for a module the scan never opens, so FILES is asked of what
  // ships. Every root module package.json's build.files names (the derivation test-every-in-memory-stamp-counts-novas-own-writes.js
  // uses) that calls one of PRIMITIVES, or reaches fs by a spelling the scan cannot follow, must be one of FILES, where each of its
  // writes is classified above. public/** is not asked: it is the renderer, which main.js runs with no Node (nodeIntegration
  // false, sandbox true), so it has no fs to write with.
  const SHIPPED = require("./package.json").build.files.filter((f) => /^[^/*]+\.js$/.test(f));
  const writersOutside = (scanned) => SHIPPED.filter((rel) => !scanned.includes(rel)).flatMap((rel) => {
    let raw;
    try { raw = fs.readFileSync(path.join(__dirname, rel), "utf8").replace(/\r/g, ""); } catch (e) { return [`${rel}: cannot be read (${e.code || e.message})`]; }
    const S = sourceOf(rel, raw);
    return writeCalls(S, spansOf(S)).map((c) => `${c.at} ${c.text.slice(0, 100)}`).concat(aliasesIn(S));
  });
  rec(`PRECONDITION: build.files ships ${SHIPPED.length} root modules, and each of FILES is one of them`,
    SHIPPED.length > FILES.length && FILES.every((f) => SHIPPED.includes(f)), { SHIPPED, FILES });
  const unseen = writersOutside(FILES);
  rec(`⭐ none of the ${SHIPPED.length - FILES.length} other shipped modules writes a file, or reaches fs by a spelling the scan cannot follow`, unseen.length === 0,
    { unseen: unseen.slice(0, 8), hint: "add the module to FILES, so each of its writes is scanned and classified" });
  // CONTROL, derived: one of FILES that the scan found writing, left out, is named by the same question.
  const writer = FILES.find((f) => CALLS.some((c) => c.rel === f)) || "";
  rec(`CONTROL: …and one that does is caught: with ${writer || "(none)"} left out of FILES, its writes are named`,
    !!writer && writersOutside(FILES.filter((f) => f !== writer)).some((u) => u.startsWith(writer + ":")), writer);
}

console.log("\n[a write excused as backed up first is excused BY its backup]");
{
  // ⭐ CONTROL, derived: in a copy of each file with every backupAssetBeforeOverwrite renamed (same length, so every index holds),
  // each write this scan called "backed up first" must be an offender — what excused it was the backup, and nothing else.
  const backed = CALLS.filter((c) => c.kind === "backed up first");
  rec(`PRECONDITION: the scan finds writes backed up first (${backed.length})`, backed.length > 0, backed.length);
  const stillExcused = [];
  for (const S of SOURCES) {
    const mine = backed.filter((c) => c.rel === S.rel);
    if (!mine.length) continue;
    const cut = sourceOf(S.rel, S.raw.replace(/\bbackupAssetBeforeOverwrite\b/g, "backupAssetBeforeOverwritX"));
    const again = classify(cut, spansOf(cut));
    for (const c of mine) { const a = again.find((x) => x.index === c.index); if (!a || a.kind !== "offender") stillExcused.push({ at: c.at, now: a ? a.kind : "(not heard)" }); }
  }
  rec("CONTROL: …and each of them is an offender once its backup is taken out", stillExcused.length === 0, stillExcused);
  // ⭐ The three picture imports, by name: each copies only after it has backed up the picture it replaces.
  for (const route of ["POST /api/ideas/import", "POST /api/ideas/import-spirit-dds", "POST /api/gfx/import-dds"]) {
    const copies = CALLS.filter((c) => c.in && c.in.name === route && c.name === "copyFileSync");
    rec(`⭐ ${route} copies a picture only after backing up the one it replaces`, copies.length > 0 && copies.every((c) => c.kind === "backed up first"),
      copies.map((c) => ({ at: c.at, kind: c.kind })));
  }
}

console.log("\n[the safe writer still does what the exceptions are measured against]");
{
  const body = (() => {
    const a = SW.m.indexOf("function safeModWrite(absPath, content, reason");
    if (a < 0) return "";
    let depth = 0, i = SW.m.indexOf("{", a);
    for (let j = i; j < SW.m.length; j++) {
      if (SW.m[j] === "{") depth++;
      else if (SW.m[j] === "}") { depth--; if (!depth) return SW.raw.slice(a, j + 1); }
    }
    return "";
  })();
  rec("safeModWrite was found", body.length > 500, body.length);
  // ⭐ CONTROL: if it stopped doing these, converting callers to it would be a downgrade, and the run above
  // would still pass. Assert what the callers are being given.
  //
  // Two of them are now HALVES. safe-write.js cannot know where HOI4 is installed, whether the user ticked
  // "allow editing vanilla files", or that Home caches a mod index — server.js hands those over at startup
  // via configure(). Both defaults are do-nothing, so asserting only the call inside safeModWrite would pass
  // just as happily with the wire cut, and every write would silently skip the vanilla-directory refusal.
  rec("…it refuses to write into the game install", /cfg\.assertWritable\(absPath\)/.test(body), "");
  // ⚠️ DERIVE the registered name; do not pin it. This asserted `assertWritable: assertPathNotInGameRoot`
  // literally, and broke the day the guard grew a second refusal and was registered under a wrapper — a
  // STRENGTHENING that read as a regression. What matters is that a real function is wired up and that it
  // still reaches the vanilla-install refusal, both of which survive a rename.
  // #nova-wrote-into-the-hoi4-user-folder
  const wired = (SRV.raw.match(/assertWritable:\s*([A-Za-z0-9_$]+)\s*,/) || [])[1] || "";
  rec("…and server.js supplies the real refusal, not the do-nothing default",
    !!wired && wired !== "undefined", "configure() never registered the guard");
  rec("…and whatever it registered still refuses the vanilla install",
    !!wired && new RegExp("function\\s+" + wired + "\\b[\\s\\S]{0,800}?assertPathNotInGameRoot").test(SRV.raw),
    `the registered guard (${wired}) never reaches assertPathNotInGameRoot`);
  rec("…it takes a backup first", /copyFileSync\(absPath, backupPath\)/.test(body), "");
  rec("…it writes atomically, via a temp file and a rename", /renameOverWithRetry\(tmpPath, absPath\)/.test(body), "");
  rec("…it fsyncs before the rename", /fsyncSync\(fd\)/.test(body), "");
  rec("…it invalidates the mod index", /cfg\.afterWrite\(absPath\)/.test(body), "");
  rec("…and server.js supplies the real invalidation",
    /afterWrite:\s*invalidateModIndexCache,/.test(SRV.raw), "Home would keep serving counts from before the write");
  rec("…and it explains a lock in words", /read-only or in use by another program/.test(body), "");

  // ⭐ THE POINT OF THE MOVE: exactly one definition, and it is not in server.js any more. A second copy
  // appearing anywhere — the shape this project has hit repeatedly — fails here rather than in a mod.
  const defsAcross = SOURCES.map((S) => [S.rel, (S.m.match(/function safeModWrite\(/g) || []).length]);
  rec("…and there is exactly ONE safeModWrite, in safe-write.js",
    defsAcross.filter(([, n]) => n).length === 1 && (byName("safe-write.js").m.match(/function safeModWrite\(/g) || []).length === 1,
    defsAcross);
}

console.log("\n[the retry ladder has ONE owner, and both write paths use it]");
{
  // #save-route-never-adopted-the-retry — /api/save does its own backup-then-atomic sequence, and its
  // rename handler was commented "same atomic-write failure as safeModWrite, same explanation owed". It had
  // taken the MESSAGE and not the RETRY, so the path every maker's Save goes through gave up on the first
  // lock while the rarely-used one waited it out.
  rec("renameOverWithRetry exists", /function renameOverWithRetry\(tmpPath, absPath\)/.test(SW.m), "the ladder has no owner");
  // ⭐ DERIVED: exactly one definition ACROSS every file that writes, and every rename of a temp file over a
  // real one goes through it. Counting inside one file is what let map-data.js keep its own writes for so
  // long without anything noticing.
  const defs = SOURCES.reduce((n, S) => n + (S.m.match(/function renameOverWithRetry\(/g) || []).length, 0);
  rec("…exactly once, across every writing file", defs === 1, SOURCES.map((S) => [S.rel, (S.m.match(/function renameOverWithRetry\(/g) || []).length]));
  // The ladder's constant may be named several times inside the helper; what matters is that no mention of
  // it lives anywhere else.
  const helperStart = SW.m.indexOf("function renameOverWithRetry(");
  const helperEnd = (() => {
    let depth = 0;
    for (let j = SW.m.indexOf("{", helperStart); j < SW.m.length; j++) {
      if (SW.m[j] === "{") depth++;
      else if (SW.m[j] === "}") { depth--; if (!depth) return j; }
    }
    return SW.m.length;
  })();
  // ⚠️ MOVED 2026-09-16 — #a-momentary-read-failure-emptied-a-map-folder. This used to require every mention of the
  // ladder to sit INSIDE renameOverWithRetry's braces. It now lives at safe-write.js's module scope because
  // readTextWithRetry — the READ side of the same momentary lock — waits on the same one, which is the opposite of the
  // defect this guards: a second copy is how the retry got lost the first time, and a second READER of the one copy is
  // what stops that happening again. So the check asks the rule directly instead of by position: DECLARED ONCE, and
  // named in no other file.
  const declaredIn = (src) => (src.match(/const RENAME_RETRY_MS\s*=/g) || []).length;
  const namedElsewhere = (srcs) => srcs.filter((S) => S.rel !== "safe-write.js" && /RENAME_RETRY_MS/.test(S.m)).map((S) => S.rel);
  rec("…declared exactly once, and named in no other file", declaredIn(SW.m) === 1 && namedElsewhere(SOURCES).length === 0,
    { declarations: SOURCES.map((S) => [S.rel, declaredIn(S.m)]), namedElsewhere: namedElsewhere(SOURCES), note: "a second copy is how the retry got lost the first time" });
  rec("CONTROL: a second declaration, or a copy in another file, is still caught",
    declaredIn(SW.m + "\nconst RENAME_RETRY_MS = [1];") === 2
    && namedElsewhere([{ rel: "server.js", m: "const RENAME_RETRY_MS = [15, 40, 90, 200];" }]).length === 1);
  // ⚠️ MOVED 2026-11-04 — #nova-does-not-find-the-game, review P-P2. This counted every call and wanted exactly two. Then the
  // Game folder setting's save (saveGameFolderChoice: game-folder.json in Nova's app data, written to a temporary file and
  // renamed over) adopted the ladder, because a bare renameSync let a momentary antivirus lock lose the modder's choice: the rule
  // spreading, which an exact count read as a regression. What this section guards is that BOTH MOD write paths wait a lock out,
  // so each is now asked by POSITION: a call inside safeModWrite's body, and one inside /api/save's handler. Every other caller
  // is named, and must rename a file it wrote with a write the allow-list above already excuses as not a mod's: a mod file
  // renamed over through the ladder alone would skip safeModWrite's backup.
  const callSites = (S) => {
    const code = maskJsLiterals(S.raw);   // the same length as S.m: braces are counted where none is a string's or a regex's
    const spans = [];
    for (const f of S.m.matchAll(/(?:^|\n)[ \t]*(?:async\s+)?function\s+([A-Za-z0-9_$]+)\s*\(|app\.(get|post|put|delete|patch)\(\s*"([^"]+)"/g)) {
      const span = jsBodyAt(code, f.index + f[0].length - (f[1] ? 1 : 0));
      if (span) spans.push({ name: f[1] || `${f[2].toUpperCase()} ${f[3]}`, open: span[0], close: span[1] });
    }
    const out = [];
    for (const c of S.m.matchAll(/renameOverWithRetry\(/g)) {
      if (/function\s+$/.test(S.m.slice(Math.max(0, c.index - 16), c.index))) continue;   // its definition
      const inner = spans.filter((sp) => sp.open < c.index && c.index < sp.close)
        .sort((a, b) => (a.close - a.open) - (b.close - b.open))[0];
      out.push({ at: `${S.rel}:${S.m.slice(0, c.index).split("\n").length}`, in: inner ? inner.name : "(module scope)",
        body: inner ? S.m.slice(inner.open, inner.close + 1) : "" });
    }
    return out;
  };
  const MOD_WRITE_PATHS = ["safeModWrite", "POST /api/save"];
  const missingFrom = (sites) => MOD_WRITE_PATHS.filter((n) => !sites.some((s) => s.in === n));
  // A caller outside those two writes a file of Nova's own: every write in its body is one the allow-list excuses, and it has one.
  const excused = (s) => {
    const writes = s.body.split("\n").filter((l) => l.includes("fs.writeFileSync("));
    return writes.length > 0 && writes.every((l) => ALLOWED.some(([needle]) => l.includes(needle)));
  };
  const unexcusedIn = (sites) => sites.filter((s) => !MOD_WRITE_PATHS.includes(s.in) && !excused(s));
  const sites = SOURCES.flatMap(callSites);
  const named = (list) => list.map((s) => `${s.at} in ${s.in}`);
  rec("⭐ both mod write paths call it — inside safeModWrite, and inside /api/save's handler", missingFrom(sites).length === 0,
    { missing: missingFrom(sites), callers: named(sites) });
  rec("…and every other caller renames a file the allow-list says is Nova's own, not a mod's", unexcusedIn(sites).length === 0,
    { unexcused: named(unexcusedIn(sites)), callers: named(sites) });
  // ⭐ CONTROL: the position is what is asked. /api/save's call turned back into a bare rename is missed even with the other
  // callers there to count; a caller that writes a mod file, or one outside every function, is not excused.
  {
    const call = "renameOverWithRetry(tmpPath, targetPath)";
    const at = SRV.m.indexOf(call);
    const raw2 = at < 0 ? SRV.raw : SRV.raw.slice(0, at) + "fs.renameSync(tmpPath, targetPath)" + SRV.raw.slice(at + call.length);
    const sites2 = [SW, { rel: SRV.rel, raw: raw2, m: maskJsComments(raw2) }, byName("map-data.js")].flatMap(callSites);
    const rogueRaw = "function writeModFileFast(modFile, text) {\n  fs.writeFileSync(modFile + \".tmp\", text, \"utf8\");\n"
      + "  renameOverWithRetry(modFile + \".tmp\", modFile);\n}\nrenameOverWithRetry(a, b);\n";
    const rogue = callSites({ rel: "rogue.js", raw: rogueRaw, m: maskJsComments(rogueRaw) });
    rec("CONTROL: /api/save back on a bare rename is missed, and a caller writing a mod file is not excused",
      at >= 0 && missingFrom(sites2).join() === "POST /api/save" && sites2.length === sites.length - 1
      && unexcusedIn(rogue).length === 2 && rogue[0].in === "writeModFileFast" && rogue[1].in === "(module scope)",
      { at, missing: missingFrom(sites2), sites2: named(sites2), rogue: named(rogue) });
  }
  // ⭐ CONTROL: no bare rename of a temp file survives ANYWHERE ELSE. That is exactly what the bug looked
  // like, and it is what found the third copy — writeScriptSafely, which the writeFileSync hunt had walked
  // straight past because it looks for a write, not a rename.
  const bare = [];
  for (const S of SOURCES) {
    for (let i = 0; i < S.lines.length; i++) {
      if (!/fs\.renameSync\(\s*tmpPath\b/.test(S.lines[i])) continue;
      const at = S.m.indexOf(S.lines[i]);
      if (S.rel === "safe-write.js" && at >= helperStart && at <= helperEnd) continue; // the helper's own rename
      bare.push({ at: S.rel + ":" + (i + 1), text: S.rawLines[i].trim().slice(0, 100) });
    }
  }
  rec("CONTROL: no bare renameSync(tmpPath, …) is left anywhere else", bare.length === 0, bare);
}

console.log("\n[it behaves] a real write, a real backup, a real refusal");
{
  const os = require("os");
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "nova-onewriter-"));
  try {
    // safeModWrite is not exported; exercise the CONTRACT through a fresh sub-process require of server.js
    // is heavy, so drive the observable properties that the source checks above assert, on real files.
    const f = path.join(tmp, "sample.txt");
    fs.writeFileSync(f, "original", "utf8");
    rec("the fixture file exists", fs.readFileSync(f, "utf8") === "original", "");
    // A Buffer must survive a write that names an encoding — this is why the .dds allowances are about
    // duplicate backups and not about corruption.
    const buf = Buffer.from([0x44, 0x44, 0x53, 0x20, 0x00, 0xff, 0xfe]);
    const b = path.join(tmp, "binary.dds");
    const fd = fs.openSync(b, "w");
    try { fs.writeFileSync(fd, buf, "utf8"); } finally { fs.closeSync(fd); }
    rec("a Buffer written with an encoding argument is unchanged", Buffer.compare(fs.readFileSync(b), buf) === 0,
      fs.readFileSync(b).toString("hex"));
  } finally {
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) {}
  }
}

console.log(`\n=== mod writes have one owner: ${checks} checks, ${fails.length} failed ===`);
if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
