// The map baseline backstop on a mod that owned no map files when the snapshot was taken.
// #a-baseline-of-nothing-restored-nothing-and-said-it-had
//
// THE DEFECT. restoreMapBaseline mirrors the baseline: a junk file added inside one of its three directories
// after the snapshot is taken back out, and test-map-baseline.js pins that. But the loop only ever looked at
// directories the BASELINE has — `if (!fs.existsSync(s)) continue;` — so a whole directory that did not exist
// at snapshot time was invisible to it.
//
// A MOD IS AN OVERLAY, and on an add-on that is every directory there is. A small mod declaring Millennium
// Dawn owns no map/, no history/states and no history/countries at all: every map file it ends up with was
// materialised out of the dependency by a click.
//
// MEASURED on the base commit 07ef372, through the real endpoints, on an add-on declaring a copy of MD:
//
//   POST /api/map/save-baseline    while the add-on held nothing but its 114-byte descriptor
//                                  -> { ok: true, sizeMB: 0 }
//   GET  /api/map/baseline-info    -> { exists: true }  …so the page SHOWS 🛟 Restore baseline, pulses it
//                                  whenever errors remain, and its tooltip says "guarantees the game loads"
//   POST /api/map/set-state        1001 -> manpower 999
//   POST /api/map/flip-province-sea 15017            …nine of MD's files now materialised into the add-on
//   POST /api/map/restore-baseline -> { ok: true, restored: [] }, and NOT ONE BYTE CHANGED: province 15017
//                                  still sea, state 1001 still carrying 999.
//
// The modder had just confirmed a dialog reading "This DISCARDS every map edit … and it cannot be undone",
// and the status line then said "🛟 Restored the map to your known-good baseline." The one control whose
// whole purpose is to be the guaranteed way back did nothing and reported success.
//
// THE FIX, IN TWO HALVES.
//   • The snapshot RECORDS which of the three directories it holds (`dirs` in _baseline.json). Without it a
//     restore cannot tell "this baseline deliberately holds nothing" from "this baseline is older than the
//     question", and guessing is what would let it take a modder's map out of their mod by mistake.
//   • The restore completes the mirror for a directory the baseline does not have — by MOVING it out of the
//     mod, never deleting it: copied to Nova's per-mod store outside the mod, the copy counted against the
//     original, and only then the original removed. The path comes back and the page prints it.
//
// ⚠️ AN OLDER BASELINE IS LEFT ALONE. One saved before `dirs` existed keeps exactly today's behaviour and
// reports what it could not judge, because an unknown is not a licence to move a modder's files.
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

// NOVA_HOME_DIR before the require: the baseline store lives under it, and #tests-wrote-into-the-real-dot-nova
// is why this line exists in every file that touches one.
const HOME = fs.mkdtempSync(path.join(os.tmpdir(), "nova-basenothing-home-"));
process.env.NOVA_HOME_DIR = HOME;
const md = require("./map-data.js");

let pass = 0;
const fails = [];
const ok = (cond, label, detail) => {
  if (cond === true) { pass++; console.log("  ok   " + label); }
  else { fails.push(label); console.log("  FAIL " + label + (detail !== undefined ? "   -> " + JSON.stringify(detail).slice(0, 320) : "")); }
};
const tmps = [HOME];
const NOGAME = path.join(os.tmpdir(), "__no_game_baseline_nothing__");

function mk(tag) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "nova-basenothing-" + tag + "-")); tmps.push(d);
  return d;
}
const w = (root, rel, body) => {
  const p = path.join(root, ...rel.split("/"));
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, body, "utf8");
};
const has = (root, rel) => fs.existsSync(path.join(root, ...rel.split("/")));
function countFiles(dir) {
  let n = 0, ents = [];
  try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { return 0; }
  for (const e of ents) { const p = path.join(dir, e.name); n += e.isDirectory() ? countFiles(p) : 1; }
  return n;
}
function filesUnder(root) {
  const out = [];
  const walk = (d, rel) => {
    let ents = []; try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch (_) { return; }
    for (const e of ents.sort((a, b) => a.name.localeCompare(b.name))) {
      const p = path.join(d, e.name), r = rel ? rel + "/" + e.name : e.name;
      if (e.isDirectory()) walk(p, r); else out.push(r);
    }
  };
  walk(root, "");
  return out;
}

// ═══ 1. THE SNAPSHOT SAYS WHAT IT IS OF ═══════════════════════════════════════════════════════════════
console.log("\n=== a baseline records which directories it holds ===");
{
  const full = mk("full");
  w(full, "descriptor.mod", 'name="Full"\n');
  w(full, "map/definition.csv", "0;0;0;0;land;false;unknown;0\n");
  w(full, "history/states/1-A.txt", "state = { id = 1 }\n");
  const sv = md.saveMapBaseline({ modRoot: full });
  ok(sv.ok === true, "a mod with its own map saved a baseline", sv);
  ok(Array.isArray(sv.dirs) && sv.dirs.length === 2, "…and the snapshot says it holds two of the three directories", sv.dirs);
  ok(sv.empty === false, "…and is not empty", sv);
  const info = md.getMapBaselineInfo({ modRoot: full });
  ok(Array.isArray(info.dirs) && info.dirs.length === 2 && info.empty === false,
    "getMapBaselineInfo carries that out, so the page can tell the two cases apart", info);

  const empty = mk("empty");
  w(empty, "descriptor.mod", 'name="Add-on"\ndependencies={\n\t"Base"\n}\n');
  const sv2 = md.saveMapBaseline({ modRoot: empty });
  ok(sv2.ok === true && sv2.empty === true && Array.isArray(sv2.dirs) && sv2.dirs.length === 0,
    "⭐ an add-on that owns no map files snapshots NOTHING, and says so rather than looking like a failure", sv2);
}

// ═══ 2. …AND THE RESTORE MIRRORS THAT, BY MOVING THE FILES OUT ═══════════════════════════════════════
console.log("\n=== restoring an empty baseline takes back out what the edits copied in ===");
{
  const addon = mk("addon");
  w(addon, "descriptor.mod", 'name="Add-on"\ndependencies={\n\t"Base"\n}\n');
  const sv = md.saveMapBaseline({ modRoot: addon });
  ok(sv.ok === true, "baseline saved while the add-on owned nothing", sv);

  // What a click does on an overlay: it materialises the layer below's files into the mod.
  w(addon, "map/definition.csv", "0;0;0;0;land;false;unknown;0\n1;1;1;1;sea;false;ocean;0\n");
  w(addon, "map/heightmap.bmp", "not really a bitmap, but it is a file the mod now owns");
  w(addon, "map/strategicregions/88-Bering Sea.txt", "strategic_region = { id = 88 }\n");
  w(addon, "history/states/1001-X.txt", "state = { id = 1001 manpower = 999 }\n");
  const materialised = filesUnder(addon).filter((f) => f !== "descriptor.mod");
  ok(materialised.length === 4, "four files were materialised into the add-on", materialised);

  const rs = md.restoreMapBaseline({ modRoot: addon, gameRoot: NOGAME });
  ok(rs.ok === true, "the restore ran", rs);
  ok(filesUnder(addon).join(",") === "descriptor.mod",
    "⭐⭐⭐ the add-on is back to owning nothing — the world it loads is the dependency's again, which is what the baseline said",
    filesUnder(addon));
  ok(Array.isArray(rs.movedAside) && rs.movedAside.length === 2,
    "⭐ and it reported BOTH directories it took out, rather than an empty `restored` list that reads as success",
    rs.movedAside);

  // ⛔ MOVED, NEVER DELETED. Every file must be findable at the path the answer names.
  let found = 0, outsideTheMod = true;
  for (const m of (rs.movedAside || [])) {
    found += countFiles(m.to);
    if (!path.resolve(m.to).toLowerCase().startsWith(path.resolve(HOME).toLowerCase())) outsideTheMod = false;
  }
  ok(found === 4, "⭐⭐⭐ all four files are in Nova's store, at the paths the answer names — MOVED, not deleted", { found, movedAside: rs.movedAside });
  ok(outsideTheMod === true, "…and the store is OUTSIDE the mod, so nothing Nova keeps for itself ships with it", rs.movedAside);
  // ⚠️ Defensive on purpose: a back-out control has to SURVIVE the back-out to be read. Backed out,
  // `movedAside` is not there at all, and a throw here reports one crash instead of the checks below it.
  ok((rs.movedAside || []).length > 0 && (rs.movedAside || []).every((m) => m.files > 0),
    "…and each move reported how much it carried", rs.movedAside);
}

// ═══ 3. A BASELINE OLDER THAN THE QUESTION IS LEFT ALONE ═════════════════════════════════════════════
console.log("\n=== a baseline saved before Nova recorded this is not acted on ===");
{
  const addon = mk("old");
  w(addon, "descriptor.mod", 'name="Old"\n');
  const sv = md.saveMapBaseline({ modRoot: addon });
  ok(sv.ok === true, "baseline saved", sv);
  // Rewrite its meta the way an older Nova wrote it — no `dirs` key at all.
  const metaPath = path.join(sv.baselinePath, "_baseline.json");
  const meta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
  delete meta.dirs;
  fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), "utf8");
  ok(md.getMapBaselineInfo({ modRoot: addon }).dirs === null,
    "getMapBaselineInfo reports an old baseline's contents as UNKNOWN, not as empty", md.getMapBaselineInfo({ modRoot: addon }));

  w(addon, "map/definition.csv", "0;0;0;0;land;false;unknown;0\n");
  const rs = md.restoreMapBaseline({ modRoot: addon, gameRoot: NOGAME });
  ok(rs.ok === true, "the restore ran", rs);
  ok(has(addon, "map/definition.csv"),
    "⭐⭐ the mod's map/ is still there — an unknown is not a licence to move a modder's files out of their mod", filesUnder(addon));
  ok(Array.isArray(rs.notJudged) && rs.notJudged.length === 1,
    "⭐ …and the restore SAYS it could not judge that directory, instead of quietly doing nothing", rs);
  ok((rs.movedAside || []).length === 0, "nothing was moved", rs.movedAside);
}

// ═══ 4. THE ORDINARY CASE IS UNCHANGED ═══════════════════════════════════════════════════════════════
console.log("\n=== a mod that owns its map still restores exactly as before ===");
{
  const mod = mk("mirror");
  w(mod, "descriptor.mod", 'name="Mirror"\n');
  w(mod, "map/definition.csv", "0;0;0;0;land;false;unknown;0\n1;10;10;10;land;false;plains;0\n");
  w(mod, "history/states/1-Real.txt", "state = { id = 1 }\n");
  const sv = md.saveMapBaseline({ modRoot: mod });
  ok(sv.ok === true && sv.empty === false, "baseline saved", sv);
  w(mod, "map/definition.csv", "0;0;0;0;land;false;unknown;0\n1;10;10;10;sea;false;ocean;0\n");
  w(mod, "history/states/999-Junk.txt", "state = { id = 999 }\n");
  const rs = md.restoreMapBaseline({ modRoot: mod, gameRoot: NOGAME });
  ok(rs.restored.length === 2, "both directories the baseline holds were restored", rs);
  ok(fs.readFileSync(path.join(mod, "map", "definition.csv"), "utf8").includes("land;false;plains"),
    "the edited file is back to the baseline");
  ok(!has(mod, "history/states/999-Junk.txt"), "the junk added after the snapshot is gone (mirror, not merge)");
  ok((rs.movedAside || []).length === 0 && (rs.notJudged || []).length === 0,
    "…and nothing was moved or left unjudged: the new behaviour is only for a directory the baseline does not hold", rs);
}

// ═══ 5. 🔎 DERIVED: the move COPIES BEFORE IT REMOVES, and counts what it copied ═════════════════════
console.log("\n=== 🔎 the one place this removes a modder's directory is written as a move ===");
{
  const src = fs.readFileSync(path.join(__dirname, "map-data.js"), "utf8");
  const stripped = require("./testlib-strip-comments.js").maskJsComments(src);
  const at = stripped.indexOf("function _moveOutOfMod(");
  ok(at > 0, "_moveOutOfMod is in the source", at);
  if (at > 0) {
    const body = stripped.slice(at, stripped.indexOf("\nfunction ", at + 10));
    const cp = body.indexOf("cpSync"), rm = body.indexOf("rmSync"), cnt = body.indexOf("_countFiles");
    ok(cp > 0 && rm > cp,
      "⭐⭐⭐ the copy happens BEFORE the removal — CLAUDE.md's first rule is about an rmSync with nothing to restore from",
      { cpSync: cp, rmSync: rm });
    ok(cnt > 0 && cnt < rm, "⭐⭐ …and the copy is COUNTED against the original before anything is removed", { count: cnt, rmSync: rm });
    ok(/if\s*\(got\s*<\s*want\)/.test(body), "…and a short copy refuses to complete the move", body.slice(0, 200));
  }
  // …and the restore only acts where the baseline SAYS what it holds.
  const rat = stripped.indexOf("function restoreMapBaseline(");
  const rbody = rat > 0 ? stripped.slice(rat, stripped.indexOf("\nfunction ", rat + 10)) : "";
  ok(/knownDirs/.test(rbody) && /_moveOutOfMod\(/.test(rbody),
    "⭐⭐ the restore gates the move on the baseline having recorded its contents", { gated: /knownDirs/.test(rbody) });
}

// ═══ 6. …AND THE PAGE SAYS WHERE THE FILES WENT ══════════════════════════════════════════════════════
//
// ⚠️ Read as SOURCE, not lifted and evaluated: public/map.js is CRLF here and an anchor on a bare newline
// matches nothing while reporting success — the single most common way an edit in this repo appears to work.
console.log("\n=== the modder is told what left their mod ===");
{
  const MAP = fs.readFileSync(path.join(__dirname, "public", "map.js"), "utf8");
  const at = MAP.indexOf('fetch("/api/map/restore-baseline"');
  ok(at > 0, "the restore call is in the page", at);
  const near = at > 0 ? MAP.slice(at, at + 3000) : "";
  ok(/movedAside/.test(near), "⭐⭐⭐ …and the handler reads what the restore moved out of the mod", near.length);
  ok(/notJudged/.test(near), "…and what it could not judge", near.length);
  ok(/MOVED out of your mod \(not deleted\)/.test(near),
    "⭐ the sentence says MOVED, not deleted — a copy nobody is told about is barely better than none", near.length);
  const sat = MAP.indexOf('fetch("/api/map/save-baseline"');
  const snear = sat > 0 ? MAP.slice(sat, sat + 2000) : "";
  ok(/r\.empty/.test(snear), "⭐ and the save says when the baseline is empty on purpose", snear.length);
}

tmps.forEach((t) => { try { fs.rmSync(t, { recursive: true, force: true }); } catch (_) {} });
console.log("\n=== a baseline of nothing restores to nothing: " + pass + " checks, " + fails.length + " failed ===");
fails.forEach((x) => console.log("   FAILED: " + x));
process.exit(fails.length ? 1 : 0);
