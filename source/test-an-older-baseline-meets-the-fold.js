// ⛔ #a-restored-map-keeps-the-record-of-its-cut — WHAT AN OLDER BASELINE DOES TO DELETE MAP'S FOLD. An older baseline is one whose
// _baseline.json says nothing of Nova's record of the cut: saved before 233931d8 (every baseline on the owner's machine), or one whose
// copy of the record failed (d5bb7276). Its Restore left the record as it was, and the record did not describe the map put back
// (review of 5a1af33f, K2 and K3, measured at the owner's scale):
//   D. a baseline of a CUT world: Generate land, save, Delete map, Generate land, Restore, Delete map — the record left was the
//      re-roll's, every id of it at or below the restored map's last row, so nothing dropped it: the fold stopped at once ("province
//      20217 is the last row … does not say Nova cut it"), the next click raised 52.8% of the ocean and was allowed 275 new provinces,
//      and the world stayed stuck for every Delete map after;
//   D2. the same, with the record's copy failing at Save baseline (d5bb7276's own path): the save's answer did not say so either —
//       and the page's 💾 Save baseline line, which says it now, is held to that answer (run, not read: openMapErrorsModal lifted);
//   E. a baseline from BEFORE the cut: save, Generate land, Restore, Delete map — the record named ids past the restored last row,
//      the fold did not drop them (only the cut did), and the Save line read "⚠ Delete map gave back none of the provinces an earlier
//      Generate land cut" over a map holding no cut piece;
//   F. a map copied back by hand over a cut (no Restore at all): the fold itself must drop the families past the last row (K3);
//   G. an older baseline of a cut world restored with no re-roll between: the record Nova has IS the restored map's, and is kept;
//   H. an older baseline of a cut world whose record no copy describes: set aside, said, and nothing of it is folded or counted.
// Pinned on testlib-split-world.js's world, as test-a-restored-map-keeps-the-record-of-its-cut.js. Binds no port.
// Run: node test-an-older-baseline-meets-the-fold.js
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-older-baseline-"));
// BEFORE map-data.js loads: app data, ~/.nova (the record, the baselines, the snapshots) and the mods root are this test's
process.env.APPDATA = path.join(ROOT, "appdata");
process.env.XDG_CONFIG_HOME = process.env.APPDATA;
process.env.NOVA_APP_DATA_DIR = process.env.APPDATA;
process.env.NOVA_HOME_DIR = path.join(ROOT, "home");
process.env.HOI4_MODS_ROOT = path.join(ROOT, "mods");
for (const d of [process.env.APPDATA, process.env.NOVA_HOME_DIR, process.env.HOI4_MODS_ROOT]) fs.mkdirSync(d, { recursive: true });
const md = require("./map-data.js");
const SW = require("./testlib-split-world.js");
let checks = 0;
const fails = [];
const rec = (label, cond, detail) => {
  checks++;
  console.log((cond ? "  ok   " : "  FAIL ") + label + (cond || detail == null ? "" : "   -> " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 700)));
  if (!cond) fails.push(label);
};
const defOf = (mod) => SW.readDef(path.join(mod, "map", "definition.csv"));
const maxRow = (mod) => Math.max(...defOf(mod).ids);
const record = (mod) => md.readProvinceSplitRecord(mod);
const pastTop = (mod) => record(mod).families.filter((f) => f.parent > maxRow(mod) || f.pieces.some((q) => q > maxRow(mod))).length;
const S = SW.makeShapes();
const game = path.join(ROOT, "game");
SW.makeGame(game, S, {});
const COUNT = Math.max(1, Math.round(S.N * 35 / 100));
const mk = (name) => SW.makeMod(path.join(process.env.HOI4_MODS_ROOT, name), S, { name: "older baseline" });
const fresh = () => { if (typeof md.clearMapLayerCache === "function") md.clearMapLayerCache(); };
const gen = (m, seed) => { fresh(); return md.generateLand({ modRoot: m, gameRoot: game, dependencyRoots: [], count: COUNT, seed, ownerMode: "inherit", owner: "" }); };
const blank = (m) => { fresh(); return md.blankMapToSea({ modRoot: m, gameRoot: game, dependencyRoots: [] }); };
const split = (g) => (g && g.provinceSplit) || {};
const copiesOf = (mod) => fs.readdirSync(path.dirname(md.provinceSplitRecordPath(mod))).filter((n) => /^families\.before-/.test(n));
/** a baseline as an older Nova wrote it: its marker without the field, and no copy of the record (this test's own temp folder) */
const olderStyle = (saved) => {
  const metaFile = path.join(saved.baselinePath, "_baseline.json");
  const meta = JSON.parse(fs.readFileSync(metaFile, "utf8"));
  delete meta.provinceSplits; delete meta.provinceSplitsError;
  fs.writeFileSync(metaFile, JSON.stringify(meta, null, 2));
  const copy = path.join(saved.baselinePath, "_province_splits.json");
  if (fs.existsSync(copy)) fs.renameSync(copy, copy + ".as-an-older-nova-wrote-none");
};
// the save answers D2 and D3 got, for the page's own 💾 Save baseline click below
const answers = {};
/**
 * ⛔ #a-restored-map-keeps-the-record-of-its-cut — THE LINE THE MODDER READS after 💾 Save baseline: openMapErrorsModal lifted out of
 * public/map.js and run (testlib-map-page), its Save baseline button clicked, over the save's own answer as the route sends it
 * (POST /api/map/save-baseline answers saveMapBaseline's result, as JSON, plus the states' names this test does not save). The
 * answer's provinceSplitsError was pinned and the page's sentence for it was not: dropped, every test still passed.
 */
async function saveBaselineLine(answer) {
  const T = require("./testlib-map-page.js");
  const { sb, statuses, overlays } = T.runPage(["function openMapErrorsModal("], {
    modPath: () => "D:/fixture-mod",
    fetch: async (url) => ({ json: async () => (String(url).indexOf("/api/map/save-baseline") === 0 ? JSON.parse(JSON.stringify(answer)) : { exists: false }) }),
  });
  sb.openMapErrorsModal({ ok: true, problems: [] });
  const ov = overlays.find((o) => o.id === "mapErrOverlay");
  const btn = ov ? ov.querySelector("#mapErrSaveBaseline") : null;
  if (!btn || !(btn.listeners.click || []).length) return null;
  await btn.listeners.click[0]();
  return statuses.length ? statuses[statuses.length - 1] : "";
}
try {
  // the twin: world 1, Delete map, Generate land 3 — what a re-roll of world 1 is allowed
  const TW = mk("twin");
  const t1 = gen(TW, 1), tb = blank(TW), t3 = gen(TW, 3);
  rec("(control: the twin's world 1 was cut, folded back whole, and its re-roll cut)", split(t1).changed === true && (tb.provinceFold || {}).left === 0 && split(t3).changed === true,
    { t1: split(t1).newIds, fold: tb.provinceFold && tb.provinceFold.left, t3: split(t3).newIds });

  for (const how of ["older marker", "copy failed"]) {
    console.log(`\n-- D${how === "copy failed" ? "2" : ""}. a baseline of a CUT world (${how}): Generate land, save, Delete map, Generate land, Restore, Delete map --`);
    const D = mk(how === "copy failed" ? "d2" : "d");
    const g1 = gen(D, 1), rec1 = record(D);
    let saved;
    if (how === "copy failed") {
      // d5bb7276's own path: the record cannot be copied (copyFileSync and the read the save retries with both refuse, as a lock does)
      const cp = fs.copyFileSync, rd = fs.readFileSync, recPath = md.provinceSplitRecordPath(D);
      fs.copyFileSync = (a, ...rest) => { if (path.resolve(String(a)) === path.resolve(recPath)) { const e = new Error("EBUSY: resource busy or locked, copyfile"); e.code = "EBUSY"; throw e; } return cp.call(fs, a, ...rest); };
      fs.readFileSync = (a, ...rest) => { if (path.resolve(String(a)) === path.resolve(recPath) && new Error().stack.includes("saveMapBaseline")) { const e = new Error("EBUSY: resource busy or locked, open"); e.code = "EBUSY"; throw e; } return rd.call(fs, a, ...rest); };
      try { saved = md.saveMapBaseline({ modRoot: D }); } finally { fs.copyFileSync = cp; fs.readFileSync = rd; }
      rec("⭐ the save's answer says the record could not be saved with the baseline (it said nothing)", saved.ok === true && !saved.provinceSplits && /EBUSY/.test(saved.provinceSplitsError || ""), saved);
      answers.copyFailed = saved;
    } else {
      saved = md.saveMapBaseline({ modRoot: D });
      olderStyle(saved);
    }
    const b1 = blank(D), g2 = gen(D, 2);
    rec("(control: the re-roll folded world 1 back and cut again)", (b1.provinceFold || {}).left === 0 && split(g2).changed === true, { fold: b1.provinceFold && b1.provinceFold.left, g2: split(g2).newIds });
    const r = md.restoreMapBaseline({ modRoot: D, gameRoot: game });
    rec("(control: Restore put world 1 back)", r.ok === true && maxRow(D) === S.N + split(g1).newIds, { ok: r.ok, max: maxRow(D) });
    rec("⭐⭐ the record is world 1's again, from the copy Delete map's fold kept of it — not the re-roll's",
      !!r.provinceSplits && r.provinceSplits.restored === true && /^families\.before-delete-map-/.test(r.provinceSplits.from || "") && JSON.stringify(record(D).families) === JSON.stringify(rec1.families),
      { said: r.provinceSplits, families: record(D).families.length, world1: rec1.families.length, reroll: split(g2).split });
    rec("…and the re-roll's record is kept beside it", copiesOf(D).some((n) => /before-restore-baseline/.test(n)), copiesOf(D));
    const b2 = blank(D), f = b2.provinceFold || {};
    rec("⭐⭐⭐ Delete map after that Restore gives back every family of world 1, and stops at none",
      f.changed === true && f.left === 0 && !f.stopped && f.families === rec1.families.length && maxRow(D) === S.N, { changed: f.changed, families: f.families, left: f.left, stopped: f.stopped, max: maxRow(D) });
    const g3 = gen(D, 3), s3 = split(g3);
    rec("⭐⭐ …and the click after it is the twin's re-roll: no earlier cut counted, the same budget, as many new ids",
      !!s3.target && s3.target.earlierPieces === 0 && s3.target.allowed === split(t3).target.allowed && s3.newIds === split(t3).newIds,
      { earlierPieces: s3.target && s3.target.earlierPieces, allowed: s3.target && s3.target.allowed, newIds: s3.newIds, twin: { allowed: split(t3).target.allowed, newIds: split(t3).newIds } });
  }

  console.log("\n-- D3. a record whose copy is refused once (a lock on the file) is read and written into the baseline instead --");
  {
    const D3 = mk("d3");
    gen(D3, 1);
    const cp = fs.copyFileSync, recPath = md.provinceSplitRecordPath(D3);
    fs.copyFileSync = (a, ...rest) => { if (path.resolve(String(a)) === path.resolve(recPath)) { const e = new Error("EBUSY: resource busy or locked, copyfile"); e.code = "EBUSY"; throw e; } return cp.call(fs, a, ...rest); };
    let saved;
    try { saved = md.saveMapBaseline({ modRoot: D3 }); } finally { fs.copyFileSync = cp; }
    const copy = path.join(saved.baselinePath || "", "_province_splits.json");
    rec("⭐ the baseline carries the record, byte for byte, and says so", saved.ok === true && saved.provinceSplits === "copied" && !saved.provinceSplitsError
      && fs.existsSync(copy) && fs.readFileSync(copy).equals(fs.readFileSync(recPath)), { ok: saved.ok, provinceSplits: saved.provinceSplits, error: saved.provinceSplitsError });
    answers.copied = saved;
  }

  console.log("\n-- E. an older baseline from BEFORE the cut: save, Generate land, Restore, Delete map --");
  {
    const E = mk("e");
    const saved = md.saveMapBaseline({ modRoot: E });
    olderStyle(saved);
    const g1 = gen(E, 1);
    const r = md.restoreMapBaseline({ modRoot: E, gameRoot: game });
    rec("(control: Restore put the uncut map back)", r.ok === true && maxRow(E) === S.N && split(g1).changed === true, { max: maxRow(E) });
    rec("⭐ the record of the cut the restore undid names no row of this map, and is dropped — a copy kept, and nothing set aside to warn of",
      !!r.provinceSplits && r.provinceSplits.restored === false && r.provinceSplits.dropped === split(g1).split && !r.provinceSplits.setAside && record(E).families.length === 0 && copiesOf(E).length === 1,
      { said: r.provinceSplits, families: record(E).families.length, copies: copiesOf(E) });
    const b = blank(E), f = b.provinceFold || {};
    rec("⭐⭐ Delete map over a map holding no cut piece says nothing went wrong (no ⚠ 'gave back none', no stop)",
      !f.stopped && !f.error && !f.skipped && f.changed === false, f);
    const g2 = gen(E, 3), s2 = split(g2);
    rec("⭐ …and the next click is the twin's re-roll", !!s2.target && s2.target.earlierPieces === 0 && s2.target.allowed === split(t3).target.allowed && s2.newIds === split(t3).newIds,
      { allowed: s2.target && s2.target.allowed, newIds: s2.newIds });
  }

  console.log("\n-- F. a map from before the cut copied back by hand: Delete map drops the record's families past the last row --");
  {
    const Fm = mk("f");
    const defFile = path.join(Fm, "map", "definition.csv"), bmpFile = path.join(Fm, "map", "provinces.bmp");
    const def0 = fs.readFileSync(defFile), bmp0 = fs.readFileSync(bmpFile);
    const g1 = gen(Fm, 1);
    fs.writeFileSync(defFile, def0); fs.writeFileSync(bmpFile, bmp0);   // this test's own fixture, in its own temp folder
    rec("(control: the record names the cut's families, every one past the last row now)", record(Fm).families.length === split(g1).split && pastTop(Fm) === split(g1).split, { families: record(Fm).families.length, past: pastTop(Fm) });
    const before = copiesOf(Fm).length, b = blank(Fm), f = b.provinceFold || {};
    rec("⭐⭐ the fold drops them and says nothing went wrong: no stop, no ⚠, and how many it dropped", f.changed === false && !f.stopped && f.stale === split(g1).split, f);
    rec("⭐ …the record it leaves holds no family past the last row, and a copy of it as it was is kept beside it",
      record(Fm).families.length === 0 && pastTop(Fm) === 0 && copiesOf(Fm).length === before + 1, { families: record(Fm).families.length, copies: copiesOf(Fm) });
    // …and a record holding a live family under the stale ones folds the live one: the stale are dropped, not a reason to stop
    const G = mk("f-mixed");
    gen(G, 1);
    const live = record(G), ghost = { parent: 1, pieces: [maxRow(G) + 1, maxRow(G) + 2], definitionMaxBefore: maxRow(G) };
    fs.writeFileSync(md.provinceSplitRecordPath(G), JSON.stringify({ version: 1, definitionMaxBefore: live.definitionMaxBefore, families: live.families.concat([ghost]) }));
    const fg = blank(G).provinceFold || {};
    rec("⭐⭐ a stale family over the live ones: every live family folds, the stale one is dropped, and none is left", fg.changed === true && fg.left === 0 && !fg.stopped && fg.stale === 1 && fg.families === live.families.length && record(G).families.length === 0,
      { changed: fg.changed, families: fg.families, left: fg.left, stale: fg.stale, stopped: fg.stopped });
  }

  console.log("\n-- G. an older baseline of a cut world, restored with nothing between: the record Nova has is the map's --");
  {
    const Gm = mk("g");
    gen(Gm, 1);
    const rec1 = record(Gm), saved = md.saveMapBaseline({ modRoot: Gm });
    olderStyle(saved);
    const r = md.restoreMapBaseline({ modRoot: Gm, gameRoot: game });
    rec("⭐ Restore keeps the record — it describes the map put back — and writes nothing over it",
      r.ok === true && !!r.provinceSplits && r.provinceSplits.restored === false && /restored map's/.test(r.provinceSplits.why || "") && JSON.stringify(record(Gm).families) === JSON.stringify(rec1.families) && copiesOf(Gm).length === 0,
      { said: r.provinceSplits, copies: copiesOf(Gm) });
    const f = blank(Gm).provinceFold || {};
    rec("⭐ …and Delete map gives back every family", f.changed === true && f.left === 0 && !f.stopped && f.families === rec1.families.length, f);
  }

  console.log("\n-- H. an older baseline of a cut world that no record Nova kept describes --");
  {
    const Hm = mk("h");
    gen(Hm, 1);
    const saved = md.saveMapBaseline({ modRoot: Hm });
    olderStyle(saved);
    const b1 = blank(Hm);
    gen(Hm, 2);
    // the copies Nova kept are gone (cleared by hand — this test's own temp folder)
    for (const n of copiesOf(Hm)) fs.renameSync(path.join(path.dirname(md.provinceSplitRecordPath(Hm)), n), path.join(ROOT, `moved-${n}`));
    const reroll = record(Hm).families.length;
    const r = md.restoreMapBaseline({ modRoot: Hm, gameRoot: game });
    rec("(control: the fold of world 1 and the re-roll happened, and Restore put world 1 back)", (b1.provinceFold || {}).changed === true && reroll > 0 && r.ok === true, { reroll, ok: r.ok });
    rec("⭐⭐ the re-roll's record is set aside — a copy kept — and the answer says so", !!r.provinceSplits && r.provinceSplits.setAside === reroll && record(Hm).families.length === 0 && copiesOf(Hm).some((n) => /before-restore-baseline/.test(n)),
      { said: r.provinceSplits, families: record(Hm).families.length, copies: copiesOf(Hm) });
    const f = blank(Hm).provinceFold || {};
    rec("⭐ …so Delete map folds no family of a map that is not there, and stops at none", f.changed === false && !f.stopped, f);
  }
} catch (e) {
  rec("the test ran to the end", false, String((e && e.stack) || e).slice(0, 900));
} finally {
  try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}   // this test's own temp folder — never a mod directory (⛔ CLAUDE.md #1)
}
// #a-baseline-guarantees-only-what-its-check-said (B6-5) — the line calls a baseline known-good only when the save's check ran: an answer
// with notChecked (no game folder to check against, as here once saveMapBaseline checks) opens "💾 Saved a map baseline".
const opening = (answer) => (answer && answer.notChecked ? "💾 Saved a map baseline" : "💾 Saved a known-good map baseline");
(async () => {
  console.log("\n-- the page: what 💾 Save baseline says of the record, over D2's and D3's own answers --");
  rec("(control: D2 and D3 each left their save's answer)", !!answers.copyFailed && !!answers.copied, Object.keys(answers));
  const failedLine = await saveBaselineLine(answers.copyFailed || {});
  rec("⭐⭐ a record that could not be saved with the baseline: the status line says so, with the error, and what a restore does instead",
    typeof failedLine === "string" && failedLine.startsWith(opening(answers.copyFailed))
      && failedLine.includes(`⚠ Nova's record of the provinces Generate land cut could not be saved with it (${(answers.copyFailed || {}).provinceSplitsError})`)
      && /a restore matches that record to the map it puts back instead/.test(failedLine), failedLine);
  const copiedLine = await saveBaselineLine(answers.copied || {});
  rec("THE CONTROL: a record saved with it — the line says nothing of it", typeof copiedLine === "string" && copiedLine.startsWith(opening(answers.copied)) && !/could not be saved with it/.test(copiedLine), copiedLine);
})().catch((e) => rec("the page's Save baseline ran", false, String((e && e.stack) || e).slice(0, 900))).finally(() => {
  console.log(`\n=== an older baseline meets the fold: ${checks} checks, ${fails.length} failed ===`);
  if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
});
