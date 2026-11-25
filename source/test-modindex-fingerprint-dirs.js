// #mod-index-fingerprint-blind-dirs — uploading a country flag left Home reporting "Country <TAG> has no
// flag", and the stale warning survived quitting and relaunching Nova.
//
// Two independent misses on the same write:
//
// (1) /api/flags/upload-country-flag writes the .tga set and clears spriteMapCache and iconCache, but never
//     invalidates the mod index. invalidateModIndexCache is only reached through safeModWrite, and this write
//     does not go through it. So the in-memory entry kept a FRESH timestamp and /api/mod/index returned it
//     directly — not even marked stale, so no background rebuild was queued. Home reads that cached payload;
//     Mod Health asks with ?fresh=1. Two pages disagreeing about the same scan, for the whole 5-minute TTL.
//
// (2) The persistent DISK cache is validated by modIndexFingerprint, which stat-walks MOD_INDEX_SCAN_DIRS.
//     That list was missing four directories buildModIndex actually reads: gfx/flags (mod-index.js:625, the
//     country_no_flag rule), common/country_tags (:560), common/units/names_divisions (:577) and
//     history/units (:593). A change in any of them left the fingerprint identical, so the next launch matched
//     the saved fingerprint and served the stale payload again — which is why a relaunch did not clear it.
//
// The fingerprint is a correctness contract, not an optimisation: a match means "skip the rebuild entirely".
// Any directory mod-index reads has to be in that list.
"use strict";
const fs = require("fs"), os = require("os"), path = require("path");
const ROOT = path.join(os.tmpdir(), "nova-fpdirs-test");
fs.rmSync(ROOT, { recursive: true, force: true });
fs.mkdirSync(ROOT, { recursive: true });
process.env.HOI4_MODS_ROOT = ROOT;
const srv = require("./server.js");
const { createApp, modIndexFingerprint } = srv;

let pass = 0, total = 0;
const ok = (n, c, x) => { total++; if (c) { pass++; console.log("  ok  " + n); } else console.error("  FAIL " + n + (x !== undefined ? " -> " + JSON.stringify(x) : "")); };

const MOD = path.join(ROOT, "probe");
const mkd = (...p) => fs.mkdirSync(path.join(MOD, ...p), { recursive: true });
["common/country_tags", "common/units/names_divisions", "common/ideas", "history/countries", "history/units", "gfx/flags", "localisation/english"]
  .forEach((d) => mkd(...d.split("/")));
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="FP"\nsupported_version="1.18.*"\n');
fs.writeFileSync(path.join(MOD, "common", "country_tags", "00_countries.txt"), 'PRB = "countries/Probeland.txt"\n', "utf8");
fs.writeFileSync(path.join(MOD, "history", "countries", "PRB - Probeland.txt"), "capital = 1\n", "utf8");
fs.writeFileSync(path.join(MOD, "localisation", "english", "probe_l_english.yml"), '﻿l_english:\n PRB:0 "Probeland"\n', "utf8");

ok("modIndexFingerprint is exported", typeof modIndexFingerprint === "function", typeof modIndexFingerprint);

// ── every directory mod-index reads must move the fingerprint ────────────────────────────────────
const bump = (label, rel, body) => {
  const before = modIndexFingerprint(MOD);
  const abs = path.join(MOD, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, body);
  const after = modIndexFingerprint(MOD);
  ok("a change in " + label + " moves the fingerprint", before !== after, { rel });
};
bump("gfx/flags", "gfx/flags/PRB.tga", Buffer.from([0, 0, 2, 0, 0, 0, 0, 0]));
bump("common/country_tags", "common/country_tags/01_more.txt", 'ZZZ = "countries/Z.txt"\n');
bump("common/units/names_divisions", "common/units/names_divisions/PRB.txt", "PRB_INF = {}\n");
bump("history/units", "history/units/PRB_1936.txt", "units = {}\n");
// controls: dirs already covered, and one that is genuinely irrelevant
bump("common/ideas", "common/ideas/zz.txt", "ideas = {}\n");

// gfx/flags is walked NAMES-ONLY: Millennium Dawn keeps 13,108 files there and statting them all cost 441ms
// of a 622ms fingerprint, against a disk cache whose whole purpose is a ~300ms start. Names alone are a
// complete signal, because the only thing the index asks of that directory is whether a flag EXISTS for a tag.
// So adding or removing a flag must move the fingerprint; repainting one must not.
{
  const flag = path.join(MOD, "gfx", "flags", "NAM.tga");
  fs.writeFileSync(flag, Buffer.from([0, 0, 2, 0]));
  const withFlag = modIndexFingerprint(MOD);
  fs.writeFileSync(flag, Buffer.from([9, 9, 9, 9, 9, 9, 9, 9, 9])); // same name, different pixels and size
  ok("editing an existing flag's bytes does NOT move the fingerprint (names-only, by design)",
    modIndexFingerprint(MOD) === withFlag, "gfx/flags is being statted again — check the cost");
  fs.rmSync(flag);
  ok("…but REMOVING a flag does", modIndexFingerprint(MOD) !== withFlag, "flag removal invisible");
}
{
  const before = modIndexFingerprint(MOD);
  fs.mkdirSync(path.join(MOD, "gfx", "interface"), { recursive: true });
  fs.writeFileSync(path.join(MOD, "gfx", "interface", "unrelated.dds"), Buffer.from([1, 2, 3]));
  ok("…while an unrelated gfx subdir still does NOT (the walk stays cheap)", before === modIndexFingerprint(MOD), "gfx walked wholesale");
}

// ── the source contract ─────────────────────────────────────────────────────────────────────────
const src = fs.readFileSync(path.join(__dirname, "server.js"), "utf8");
const listSrc = src.slice(src.indexOf("#mod-index-fingerprint-blind-dirs"), src.indexOf("function modIndexFingerprint"));
// Coverage is by ANCESTOR: walking `common` already covers `common/country_tags`. Asserting the exact
// literal would fail the moment the list is widened to the tree that contains it — which is the correct
// direction to move, and is what it was widened to. #mod-index-fingerprint-blind-dirs
const coversDir = (segs) => {
  for (let i = 1; i <= segs.length; i++) {
    if (listSrc.includes('["' + segs.slice(0, i).join('", "') + '"]')) return true;
  }
  return false;
};
[["common", "country_tags"], ["common", "units", "names_divisions"], ["history", "units"],
 // The four the fingerprint was measured to be BLIND to — each read by scanUnbalancedModFiles and
 // getModGrantedIdeaSet, each leaving Home's verdict frozen from a previous launch.
 ["history", "states"], ["common", "scripted_effects"], ["common", "on_actions"], ["common", "countries"],
].forEach((segs) => {
  // Report the LIST, not the whole comment block above it — a failure dumping 40 lines of prose is a
  // failure nobody reads.
  ok("MOD_INDEX_SCAN_DIRS covers " + segs.join("/"), coversDir(segs),
    (listSrc.match(/\["[a-z_]+"(?:, "[a-z_]+")*\]/g) || []).join(" "));
});
ok("gfx/flags is covered by the names-only tier", /MOD_INDEX_NAME_ONLY_DIRS = \[\["gfx", "flags"\]\]/.test(src), "names-only tier missing");
ok("…which the fingerprint walks", /for \(const seg of MOD_INDEX_NAME_ONLY_DIRS\) walk\(path\.join\(modRoot, \.\.\.seg\), true\);/.test(src), "tier not walked");
ok("…without statting its files", /if \(namesOnly\) \{ parts\.push\(p\); continue; \}/.test(src), "still statting every flag");
ok("…and says to keep it in step with mod-index.js", /#mod-index-fingerprint-blind-dirs/.test(listSrc), "no marker comment");

// Every directory mod-index.js scans off its root must appear in the list — this catches the NEXT one.
// The dependency-grant walk shadows its loop variable as `root` while iterating dependencyRoots, so its
// `path.join(root, "common"|"events"|"history")` calls are NOT scans of the mod's own tree. Blank that block
// out before scanning. (Dependency roots are deliberately outside this fingerprint — a dependency does not
// change while you edit your own mod.)
let mi = fs.readFileSync(path.join(__dirname, "mod-index.js"), "utf8");
{
  // There is more than one such loop, so blank them ALL. Line-ending agnostic — the file is CRLF.
  for (let at = mi.indexOf("for (const root of dependencyRoots)"); at !== -1; at = mi.indexOf("for (const root of dependencyRoots)", at + 1)) {
    const endM = /\r?\n[ \t]*\}/.exec(mi.slice(at));
    if (!endM) continue;
    mi = mi.slice(0, at) + " ".repeat(endM.index) + mi.slice(at + endM.index);
  }
}
const scanned = new Set();
// ⭐ DERIVE THE LIST FROM THE SOURCE, AND FAIL WHEN THE SOURCE CANNOT BE READ.
//
// This used to match only `path.join(root, "a", "b")` with literal segments and the parameter spelled
// `root`. mod-index.js also walks trees as `path.join(root, sub)` over `for (const sub of ["common",
// "events", "history"])` (scanUnbalancedModFiles) and as `path.join(modRoot, "common")`
// (getModGrantedIdeaSet). Neither matched, so this check reported full coverage while four trees went
// unwatched — a control that passes can still be measuring nothing.
//
// A join this cannot resolve is now a FAILURE, not a silent skip: the next unreadable form should stop
// the suite rather than quietly shrink what is being asserted.
const ROOTVAR = "(?:root|modRoot)";
const literalRe = new RegExp(`path\\.join\\(\\s*${ROOTVAR}\\s*,\\s*((?:"[^"]+"\\s*,\\s*)*"[^"]+")\\s*\\)`, "g");
let m;
while ((m = literalRe.exec(mi)) !== null) {
  const segs = m[1].split(",").map((s) => s.trim().replace(/^"|"$/g, ""));
  if (segs.length && !/\./.test(segs[segs.length - 1])) scanned.add(segs.join("/"));
}
// Identifier segments: resolve each against the nearest preceding `of [ "…", "…" ]` literal.
const identRe = new RegExp(`path\\.join\\(\\s*${ROOTVAR}\\s*,\\s*([A-Za-z_$][\\w$]*)\\s*\\)`, "g");
const unresolved = [];
while ((m = identRe.exec(mi)) !== null) {
  const name = m[1];
  const before = mi.slice(Math.max(0, m.index - 600), m.index);
  const of = new RegExp(`\\b${name}\\s+of\\s+\\[([^\\]]*)\\]`, "g");
  let last = null, o;
  while ((o = of.exec(before)) !== null) last = o;
  if (!last) { unresolved.push(`${name} at index ${m.index}`); continue; }
  const parts = last[1].match(/"[^"]+"/g) || [];
  if (!parts.length) { unresolved.push(`${name} (empty list)`); continue; }
  parts.forEach((p) => scanned.add(p.replace(/"/g, "")));
}
ok("every path.join off the mod root is resolvable by this check", unresolved.length === 0, { unresolved });
// CONTROL: the derivation must actually be finding the wholesale walks, or the assertion below is empty.
ok("…and it found the wholesale trees", ["common", "events", "history"].every((d) => scanned.has(d)), [...scanned]);
// A scanned dir counts as covered if the list holds it OR any ANCESTOR of it — walking `localisation`
// already covers `localisation/english` and `localisation/replace/english`.
const inList = (segs) => listSrc.includes('["' + segs.join('", "') + '"]');
const covered = [], missing = [];
scanned.forEach((s) => {
  const segs = s.split("/");
  let hit = false;
  for (let i = 1; i <= segs.length && !hit; i++) hit = inList(segs.slice(0, i));
  (hit ? covered : missing).push(s);
});
ok("every directory mod-index.js scans is covered by MOD_INDEX_SCAN_DIRS", missing.length === 0, { missing, covered });

// ── the flag upload must invalidate the cached index ────────────────────────────────────────────
const upSrc = src.slice(src.indexOf('app.post("/api/flags/upload-country-flag"'), src.indexOf('app.post("/api/flags/upload-country-flag"') + 2200);
ok("the flag upload invalidates the mod index", /invalidateModIndexCache\(\)/.test(upSrc), upSrc.slice(-600));
ok("…after the write, alongside the sprite caches", upSrc.indexOf("writeHoi4FlagSetForStem") < upSrc.indexOf("invalidateModIndexCache"), "invalidate runs before the write");

// ── end to end: Home's cached read must not keep the stale warning ──────────────────────────────
const PORT = 39987, app = createApp();
const server = app.listen(PORT, async () => {
  const idx = (fresh) => fetch(`http://127.0.0.1:${PORT}/api/mod/index?modPath=${encodeURIComponent(MOD)}${fresh ? "&fresh=1" : ""}`).then((r) => r.json());
  const noFlag = (j) => ((j && j.problems) || []).filter((p) => p.rule === "country_no_flag").map((p) => p.entityId || p.id || p.tag);
  try {
    fs.rmSync(path.join(MOD, "gfx", "flags", "PRB.tga"), { force: true }); // back to "no flag"
    const before = await idx(true);
    ok("the index reports the country has no flag", noFlag(before).includes("PRB"), noFlag(before));

    const sharp = require("sharp");
    const png = await sharp({ create: { width: 64, height: 42, channels: 3, background: { r: 200, g: 30, b: 30 } } }).png().toBuffer();
    const fd = new FormData();
    fd.append("image", new Blob([png], { type: "image/png" }), "flag.png");
    fd.append("tag", "PRB");
    fd.append("modPath", MOD);
    const up = await fetch(`http://127.0.0.1:${PORT}/api/flags/upload-country-flag`, { method: "POST", body: fd }).then((r) => r.json());
    ok("the flag upload succeeds", up && up.ok, up);
    ok("…and wrote the .tga set", fs.existsSync(path.join(MOD, "gfx", "flags", "PRB.tga")), fs.readdirSync(path.join(MOD, "gfx", "flags")));

    // Home asks WITHOUT ?fresh. The cache is now invalidated, so this hand-back is flagged `stale` and a
    // rebuild is queued — that flag is the whole signal, and before the fix it was never set: the entry kept
    // a fresh timestamp, so the payload came back unmarked and no rebuild ever ran. home.js:165 re-fetches on
    // `stale` (up to 6 times, 1.8s apart), which is what makes the warning clear itself.
    const firstCached = await idx(false);
    ok("HOME'S CACHED READ IS NOW FLAGGED STALE (it was not before)", firstCached.stale === true, { stale: firstCached.stale, noFlag: noFlag(firstCached) });
    ok("…and Home re-fetches when it sees that flag", /if \(data\.stale && staleRetries > 0\)/.test(fs.readFileSync(path.join(__dirname, "public", "home.js"), "utf8")), "home.js ignores stale");

    // …and the queued rebuild really does clear it, so Home's retry lands on the truth.
    let settled = null;
    for (let i = 0; i < 40 && !settled; i++) {
      await new Promise((r) => setTimeout(r, 100));
      const j = await idx(false);
      if (!j.stale) settled = j;
    }
    ok("the background rebuild completes", !!settled, "never settled");
    ok("HOME'S CACHED READ NO LONGER REPORTS THE STALE WARNING", settled && !noFlag(settled).includes("PRB"), settled && noFlag(settled));
    const afterFresh = await idx(true); // exactly how Mod Health asks
    ok("…and Mod Health agrees with it", !noFlag(afterFresh).includes("PRB"), noFlag(afterFresh));
    ok("the two pages now report the same thing", settled && JSON.stringify(noFlag(settled)) === JSON.stringify(noFlag(afterFresh)), { home: settled && noFlag(settled), modhealth: noFlag(afterFresh) });

    console.log("\ntest-modindex-fingerprint-dirs: " + pass + "/" + total + " checks passed");
  } catch (e) {
    console.error("ERROR", e);
  } finally {
    process.exitCode = pass === total && total >= 28 ? 0 : 1;
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
    try { server.closeAllConnections(); } catch (_) {}
    server.close();
  }
});
server.on("error", (e) => { console.error("listen error:", e.message); process.exit(1); });
