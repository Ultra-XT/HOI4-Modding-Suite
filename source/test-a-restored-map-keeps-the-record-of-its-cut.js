// ⛔ #a-restored-map-keeps-the-record-of-its-cut — A MAP PUT BACK KEEPS THE RECORD OF THE CUT IT HOLDS, AND ONLY THAT ONE.
//
// Generate land cuts its raised ocean provinces into pieces and records each family (provinceSplitRecordPath, outside the mod), and
// Delete map folds every recorded family back into its parent (#delete-map-gives-back-the-cut). 🛟 Restore baseline put a map back
// and never touched that record, so the record went on describing a map the mod no longer had:
//   · a baseline from BEFORE a cut: the record kept the undone cut's families, the next cut issued the same ids again to families of
//     its own, and Delete map's fold stopped at the first family it met ("names one of its provinces twice", or "past the last row")
//     and gave back nothing — on the owner's world after one Restore baseline: 3,875 families over 6,806 distinct pieces, fold 0, and
//     the next Generate land allowed 284 new provinces where a clean re-roll is allowed 6,815. Nothing ever removed them;
//   · a baseline of a CUT world: Restore put world 1's pieces back under the re-roll's record, and Delete map's fold stopped at once
//     ("province N is the last row of map/definition.csv, and Nova's record does not say Nova cut it").
// Now a baseline carries the record with the map (saveMapBaseline) and Restore puts it back (restoreBaselineSplitRecord), and a cut
// drops the recorded families that name rows the map no longer has (liveProvinceSplitFamilies) — what recovers a baseline saved
// before the record went into it, or a map copied back by hand. Pinned on testlib-split-world.js's world:
//   A. save a baseline, Generate land, Restore, Generate land, Delete map: the fold gives back every family the SECOND click cut, and
//      the click after it cuts as a twin that never restored — once with a baseline that carries the record, once with one saved before
//      it did (its _baseline.json without the field), where the restore drops the stale families, judged by the map it put back, and
//      says so (test-an-older-baseline-meets-the-fold.js holds the older baselines' other cases);
//   B. Generate land, save a baseline, Delete map, Generate land, Restore, Delete map: the record is the baseline's again, and the
//      fold gives back every family of world 1, to the never-cut twin's definition.csv byte for byte.
// Every expected id and family is derived from the record and the files as written. Binds no port.
// Run: node test-a-restored-map-keeps-the-record-of-its-cut.js
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-restored-record-"));
// BEFORE map-data.js loads: app data, ~/.nova (the split record, the baselines, Delete map's snapshots) and the mods root are this test's
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
  console.log((cond ? "  ok   " : "  FAIL ") + label + (cond || detail == null ? "" : "   -> " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 600)));
  if (!cond) fails.push(label);
};
const sha = (b) => crypto.createHash("sha1").update(b).digest("hex");
const shaOf = (p) => (fs.existsSync(p) ? sha(fs.readFileSync(p)) : "absent");
const defOf = (mod) => SW.readDef(path.join(mod, "map", "definition.csv"));
const maxRow = (mod) => Math.max(...defOf(mod).ids);
const noGap = (mod) => defOf(mod).ids.every((id, i) => id === i);
const record = (mod) => md.readProvinceSplitRecord(mod);
const piecesOf = (families) => families.flatMap((f) => f.pieces);

const S = SW.makeShapes();
const game = path.join(ROOT, "game");
SW.makeGame(game, S, {});
const COUNT = Math.max(1, Math.round(S.N * 35 / 100));
const mk = (name, o = {}) => SW.makeMod(path.join(process.env.HOI4_MODS_ROOT, name), S, Object.assign({ name: "restored record" }, o));
const fresh = () => { if (typeof md.clearMapLayerCache === "function") md.clearMapLayerCache(); };
const gen = (m, seed, extra = {}) => { fresh(); return md.generateLand(Object.assign({ modRoot: m, gameRoot: game, dependencyRoots: [], count: COUNT, seed, ownerMode: "inherit", owner: "" }, extra)); };
const blank = (m) => { fresh(); return md.blankMapToSea({ modRoot: m, gameRoot: game, dependencyRoots: [] }); };
const split = (g) => (g && g.provinceSplit) || {};

try {
  // the twin that never restored: Generate land seed 2, Delete map, Generate land seed 3 — what a re-roll after a restore should match
  const TW = mk("twin");
  const tw2 = gen(TW, 2), twRec2 = record(TW), twBlank = blank(TW), tw3 = gen(TW, 3);
  rec("(control: the twin's clicks cut, and its Delete map gave every family back)", split(tw2).changed === true && (twBlank.provinceFold || {}).left === 0 && split(tw3).changed === true,
    { tw2: split(tw2).newIds, fold: twBlank.provinceFold && { changed: twBlank.provinceFold.changed, left: twBlank.provinceFold.left }, tw3: split(tw3).newIds });

  for (const kind of ["carries the record", "was saved before it carried one"]) {
    const old = kind !== "carries the record";
    console.log(`\n-- A. a baseline from before the cut, that ${kind}: save, Generate land, Restore, Generate land, Delete map --`);
    const A = mk(old ? "a-old" : "a-new");
    const saved = md.saveMapBaseline({ modRoot: A });
    const metaFile = path.join(saved.baselinePath || "", "_baseline.json");
    if (old && saved.ok) {
      // a baseline written before this change: its marker without the field (this test's own fixture, in its own temp folder)
      const meta = JSON.parse(fs.readFileSync(metaFile, "utf8"));
      delete meta.provinceSplits;
      fs.writeFileSync(metaFile, JSON.stringify(meta, null, 2));
    }
    rec("(control: the baseline was saved" + (old ? ", and its marker says nothing of the record)" : ", and says the map it holds was never cut)"),
      saved.ok === true && (old ? JSON.parse(fs.readFileSync(metaFile, "utf8")).provinceSplits === undefined : JSON.parse(fs.readFileSync(metaFile, "utf8")).provinceSplits === "none"), saved);
    const g1 = gen(A, 1), rec1 = record(A);
    rec("(control: the first click cut, and recorded its families past the mod's last id)", split(g1).changed === true && rec1.families.length > 0 && Math.min(...piecesOf(rec1.families)) === S.N + 1,
      { cut: split(g1).newIds, families: rec1.families.length });
    const r = md.restoreMapBaseline({ modRoot: A, gameRoot: game });
    rec("(control: Restore put the map from before the cut back)", r.ok === true && maxRow(A) === S.N && noGap(A), { ok: r.ok, error: r.error, max: maxRow(A) });
    if (!old) {
      rec("⭐⭐ Restore put the record of that map back with it: no family, as the map it restored was never cut",
        !!r.provinceSplits && r.provinceSplits.restored === true && record(A).families.length === 0 && !record(A).unreadable, { said: r.provinceSplits, families: record(A).families.length });
    } else {
      // review of 5a1af33f (K2/K3): this said "leaves the record as it was", and the next cut was what dropped it — but the fold never
      // did, and a record of ids at or below the restored last row was dropped by nothing. The record is judged by the map now
      // (splitRecordForRestoredMap): every family of this one names a row the restored map does not have, so it is dropped, a copy kept
      rec("(control: a baseline older than the record's copy drops the record of the cut it undid — it names no row of the map put back — and says why)",
        !!r.provinceSplits && r.provinceSplits.restored === false && /saved before/.test(r.provinceSplits.why || "") && r.provinceSplits.dropped === rec1.families.length && record(A).families.length === 0, r.provinceSplits);
    }
    const g2 = gen(A, 2), s2 = split(g2), rec2 = record(A);
    const added2 = rec2.families.filter((f) => f.definitionMaxBefore === S.N);
    rec("⭐⭐ the second click counts no earlier cut: the families the restore undid describe rows the map no longer has",
      s2.changed === true && s2.target.earlierPieces === 0 && s2.target.staleFamilies === 0 && s2.target.allowed === split(tw2).target.allowed && s2.newIds === split(tw2).newIds,
      { target: s2.target && { earlier: s2.target.earlierPieces, stale: s2.target.staleFamilies, allowed: s2.target.allowed }, newIds: s2.newIds, twin: split(tw2).newIds });
    rec("⭐⭐⭐ …and the record holds the second click's families only, each piece once — none of the restored-away cut's — as the twin's first click recorded them",
      rec2.families.length === s2.split && added2.length === rec2.families.length && new Set(piecesOf(rec2.families)).size === piecesOf(rec2.families).length
      && piecesOf(rec2.families).length === s2.newIds && JSON.stringify(rec2.families) === JSON.stringify(twRec2.families),
      { families: rec2.families.length, split: s2.split, pieces: piecesOf(rec2.families).length, distinct: new Set(piecesOf(rec2.families)).size, twin: twRec2.families.length });
    const b = blank(A), f = b.provinceFold || {};
    rec("⭐⭐⭐ Delete map gives back every family the second click cut, and stops at none",
      f.changed === true && f.left === 0 && !f.stopped && f.families === s2.split && f.provinces === s2.newIds && maxRow(A) === S.N && noGap(A),
      { fold: { changed: f.changed, families: f.families, provinces: f.provinces, left: f.left, stopped: f.stopped }, max: maxRow(A) });
    rec("⭐ …and the record keeps no family", record(A).families.length === 0, record(A).families.length);
    const g3 = gen(A, 3), s3 = split(g3);
    rec("⭐⭐ the click after it is the twin's: the same borders, the same budget, as many new ids",
      s3.changed === true && s3.target.earlierPieces === 0 && s3.target.segmentsBefore === split(tw3).target.segmentsBefore && s3.target.allowed === split(tw3).target.allowed && s3.newIds === split(tw3).newIds,
      { reroll: s3.target && { seg: s3.target.segmentsBefore, allowed: s3.target.allowed, newIds: s3.newIds }, twin: split(tw3).target && { seg: split(tw3).target.segmentsBefore, allowed: split(tw3).target.allowed, newIds: split(tw3).newIds } });
  }

  console.log("\n-- B. a baseline of a cut world: Generate land, save, Delete map, Generate land, Restore, Delete map --");
  {
    const B = mk("b"), T = mk("b-twin");
    const g1 = gen(B, 1), rec1 = record(B), t1 = gen(T, 1, { splitLargeProvinces: false });
    rec("(control: world 1 was cut, and its never-cut twin was not)", split(g1).changed === true && rec1.families.length > 0 && split(t1).changed === false, { cut: split(g1).newIds, twin: split(t1).changed });
    const saved = md.saveMapBaseline({ modRoot: B });
    const copy = path.join(saved.baselinePath || "", "_province_splits.json");
    rec("⭐ the baseline carries the record of the cut it holds, byte for byte", saved.ok === true && JSON.parse(fs.readFileSync(path.join(saved.baselinePath, "_baseline.json"), "utf8")).provinceSplits === "copied"
      && shaOf(copy) === shaOf(md.provinceSplitRecordPath(B)), { ok: saved.ok, copy: shaOf(copy), live: shaOf(md.provinceSplitRecordPath(B)) });
    const defWorld1 = shaOf(path.join(B, "map", "definition.csv")), bmpWorld1 = shaOf(path.join(B, "map", "provinces.bmp"));
    const b1 = blank(B), g2 = gen(B, 2);
    rec("(control: the re-roll folded world 1 back and cut again)", (b1.provinceFold || {}).left === 0 && split(g2).changed === true && record(B).families.length === split(g2).split, { fold: b1.provinceFold && b1.provinceFold.left, cut: split(g2).newIds });
    const r = md.restoreMapBaseline({ modRoot: B, gameRoot: game });
    rec("(control: Restore put world 1 back, as it was saved)", r.ok === true && shaOf(path.join(B, "map", "definition.csv")) === defWorld1 && shaOf(path.join(B, "map", "provinces.bmp")) === bmpWorld1, { ok: r.ok, error: r.error });
    rec("⭐⭐⭐ …and world 1's record with it: every family the first click cut, as it was recorded, and none of the re-roll's",
      !!r.provinceSplits && r.provinceSplits.restored === true && r.provinceSplits.families === rec1.families.length && JSON.stringify(record(B).families) === JSON.stringify(rec1.families),
      { said: r.provinceSplits, families: record(B).families.length, want: rec1.families.length });
    const kept = fs.readdirSync(path.dirname(md.provinceSplitRecordPath(B))).filter((n) => /before-restore-baseline/.test(n));
    rec("…and a copy of the record it replaced stands beside it", kept.length === 1, kept);
    const b2 = blank(B), T2 = blank(T), f = b2.provinceFold || {};
    rec("⭐⭐⭐ Delete map gives back every family of world 1, and stops at none",
      f.changed === true && f.left === 0 && !f.stopped && f.families === rec1.families.length && f.provinces === split(g1).newIds && maxRow(B) === S.N && noGap(B),
      { fold: { changed: f.changed, families: f.families, provinces: f.provinces, left: f.left, stopped: f.stopped }, max: maxRow(B) });
    rec("⭐⭐ …to the never-cut twin's definition.csv, byte for byte, and the record keeps no family",
      shaOf(path.join(B, "map", "definition.csv")) === shaOf(path.join(T, "map", "definition.csv")) && record(B).families.length === 0 && (T2.provinceFold || {}).changed === false);
  }

  console.log("\n-- C. a record that cannot be copied costs the baseline nothing --");
  {
    // the record's path made a folder (this test's own temp folder): it exists, and no file copy of it can be made
    const Cm = mk("c");
    const recPath = md.provinceSplitRecordPath(Cm);
    fs.mkdirSync(recPath, { recursive: true });
    const saved = md.saveMapBaseline({ modRoot: Cm });
    const meta = saved.ok ? JSON.parse(fs.readFileSync(path.join(saved.baselinePath, "_baseline.json"), "utf8")) : {};
    rec("⭐⭐ the baseline is saved, says nothing of the record, and says why",
      saved.ok === true && meta.provinceSplits === undefined && typeof meta.provinceSplitsError === "string" && meta.provinceSplitsError.length > 0
      && !fs.existsSync(path.join(saved.baselinePath, "_province_splits.json")), { ok: saved.ok, error: saved.error, meta });
    const r = md.restoreMapBaseline({ modRoot: Cm, gameRoot: game });
    rec("⭐ …and its restore leaves the record where it is, as an older baseline's does", r.ok === true && r.provinceSplits && r.provinceSplits.restored === false && fs.statSync(recPath).isDirectory(), r.provinceSplits);
  }
} catch (e) {
  rec("the test ran to the end", false, String((e && e.stack) || e).slice(0, 900));
} finally {
  try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}   // this test's own temp folder — never a mod directory (⛔ CLAUDE.md #1)
}
console.log(`\n=== a restored map keeps the record of its cut: ${checks} checks, ${fails.length} failed ===`);
if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
