#!/usr/bin/env node
// Nova release gate.
//
//   node scripts/release.js              check everything, change nothing   (do this first)
//   node scripts/release.js --build      check, then build the portable exe
//   node scripts/release.js --publish    check, then create the GitHub Release
//
// WHY THIS EXISTS
//
// On 2026-08-28 the exe sitting in dist/ was 76 commits behind HEAD and contained none of that day's
// twelve fixes. It was one command away from being published with release notes claiming those fixes,
// and the in-app updater would have pushed it to every existing user. It was caught by accident.
//
// A fresh timestamp is not evidence that a build contains your work. The only evidence is the content of
// the packaged app. So this script does not ask "is the exe newer than the commits" and stop there — it
// takes real lines of source from the recent commits and proves each one is physically inside app.asar.
//
// Every check below refuses loudly rather than warning quietly. A gate that can be skimmed past is not a
// gate; that is the same reason the test runner had to stop printing "all green" when files were skipped.
"use strict";

const fs = require("fs");
const path = require("path");
const { execFileSync, spawnSync } = require("child_process");

const REPO_ROOT = path.resolve(__dirname, "..");
const GH = "C:\\Program Files\\GitHub CLI\\gh.exe"; // not on PATH; winget only affects shells opened after install
const GH_REPO = "Ultra-XT/HOI4-Modding-Suite";

// How many recent commits to prove are present in the build. Commits that touched no shipped file are
// skipped and do not count against this.
const PROVE_LAST_N_COMMITS = 15;
const MIN_MARKER_LENGTH = 30;

const argv = process.argv.slice(2);
const WANT_BUILD = argv.includes("--build");
const WANT_PUBLISH = argv.includes("--publish");

let failures = 0;
const ok = (m) => console.log("  \u2713 " + m);
const bad = (m, detail) => {
  failures++;
  console.log("  \u2717 " + m);
  if (detail) String(detail).split("\n").forEach((l) => console.log("      " + l));
};
const heading = (m) => console.log("\n" + m);

const git = (args) =>
  execFileSync("git", args, { cwd: REPO_ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }).trimEnd();

const pkg = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, "package.json"), "utf8"));
const VERSION = pkg.version;
const TAG = "v" + VERSION;
const PRODUCT = (pkg.build && pkg.build.productName) || pkg.name;
const OUT_DIR = path.join(REPO_ROOT, (pkg.build && pkg.build.directories && pkg.build.directories.output) || "dist");
const EXE = path.join(OUT_DIR, PRODUCT + " " + VERSION + ".exe");
const ASAR = path.join(OUT_DIR, "win-unpacked", "resources", "app.asar");

console.log("Nova release gate \u2014 " + PRODUCT + " " + VERSION);
console.log("  exe   " + EXE);
console.log("  asar  " + ASAR);

// ---------------------------------------------------------------------------------------------------
// 1. The tree itself
// ---------------------------------------------------------------------------------------------------
heading("1. Working tree");

const dirty = git(["status", "--porcelain"]);
if (dirty) bad("working tree is dirty \u2014 commit or stash before releasing", dirty);
else ok("working tree is clean");

if (!/^\d+\.\d+\.\d+$/.test(VERSION)) bad("package.json version is not X.Y.Z: " + VERSION);
else ok("version " + VERSION + " \u2192 tag " + TAG);

const changelog = path.join(REPO_ROOT, "CHANGELOG.md");
if (fs.existsSync(changelog)) {
  const text = fs.readFileSync(changelog, "utf8");
  if (text.includes("## " + VERSION) || text.includes("## [" + VERSION + "]")) ok("CHANGELOG has a " + VERSION + " section");
  else bad("CHANGELOG.md has no section for " + VERSION + " \u2014 the release notes come from there");
}

// ---------------------------------------------------------------------------------------------------
// 2. The build exists, and is not older than the work it claims to contain
// ---------------------------------------------------------------------------------------------------
heading("2. Build freshness");

let exeMtime = null;
if (!fs.existsSync(EXE)) {
  bad("no exe at " + EXE, WANT_BUILD ? "will be built below" : "run with --build, or run: npm run build");
} else {
  exeMtime = fs.statSync(EXE).mtime;
  ok("exe present, built " + exeMtime.toISOString());

  const since = git(["log", "--since=" + exeMtime.toISOString(), "--oneline"]);
  const behind = since ? since.split("\n").filter(Boolean) : [];
  if (behind.length) {
    bad(behind.length + " commit(s) are NEWER than the exe \u2014 it is stale, rebuild before publishing",
      behind.slice(0, 20).join("\n") + (behind.length > 20 ? "\n... and " + (behind.length - 20) + " more" : ""));
  } else {
    ok("no commits newer than the exe");
  }
}

// ---------------------------------------------------------------------------------------------------
// 3. Prove the packaged app actually CONTAINS the recent work
//
// This is the check the timestamp comparison above cannot make. Markers are DERIVED from the commits
// themselves rather than typed in here, so this keeps working without anybody maintaining a list.
// ---------------------------------------------------------------------------------------------------
heading("3. Proof that the build contains the recent commits");

// Which paths actually ship? Straight out of build.files, so it cannot drift from what electron-builder packs.
const shipGlobs = (pkg.build && pkg.build.files) || [];
const shipsPath = (f) =>
  shipGlobs.some((g) => (g.endsWith("/**/*") ? f.startsWith(g.slice(0, -5) + "/") : f === g));

if (!fs.existsSync(ASAR)) {
  bad("no app.asar at " + ASAR,
    "The portable exe is compressed, so its contents cannot be grepped directly.\n" +
    "electron-builder leaves the readable copy in dist/win-unpacked/ \u2014 build to produce it.");
} else {
  const asarBuf = fs.readFileSync(ASAR);
  const asarMtime = fs.statSync(ASAR).mtime;
  ok("app.asar present (" + (asarBuf.length / 1048576).toFixed(1) + " MB, " + asarMtime.toISOString() + ")");

  if (exeMtime && Math.abs(asarMtime - exeMtime) > 60 * 60 * 1000) {
    bad("app.asar and the exe are over an hour apart \u2014 they are probably from different builds",
      "asar " + asarMtime.toISOString() + "\nexe  " + exeMtime.toISOString());
  }

  const shas = git(["log", "-n", String(PROVE_LAST_N_COMMITS), "--format=%H"]).split("\n").filter(Boolean);
  let proved = 0, missing = [], noMarker = 0;

  for (const sha of shas) {
    const touched = git(["show", "--pretty=", "--name-only", sha]).split("\n").map((s) => s.trim()).filter(Boolean);
    if (!touched.some(shipsPath)) continue; // a docs-only or test-only commit cannot be visible in the asar

    // Added lines from this commit, restricted to files that ship.
    const diff = git(["show", "--pretty=", "--unified=0", sha, "--"].concat(touched.filter(shipsPath)));
    const candidates = diff
      .split("\n")
      .filter((l) => l.startsWith("+") && !l.startsWith("+++"))
      .map((l) => l.slice(1).replace(/\r$/, "").trim())
      .filter((l) => l.length >= MIN_MARKER_LENGTH && /[A-Za-z]/.test(l))
      // Prefer a marker that is unique in the asar, so a coincidental match elsewhere cannot fake a pass.
      .sort((a, b) => b.length - a.length);

    let marker = null;
    for (const c of candidates.slice(0, 12)) {
      const needle = Buffer.from(c, "utf8");
      const first = asarBuf.indexOf(needle);
      if (first === -1) { marker = { text: c, found: false }; break; }
      if (asarBuf.indexOf(needle, first + 1) === -1) { marker = { text: c, found: true }; break; }
      // not unique; try the next candidate
    }

    if (!marker) { noMarker++; continue; }
    const subject = git(["log", "-1", "--format=%s", sha]);
    if (marker.found) proved++;
    else missing.push(sha.slice(0, 9) + "  " + subject + "\n    missing line: " + marker.text.slice(0, 100));
  }

  if (missing.length) {
    bad(missing.length + " recent commit(s) are NOT in the packaged app \u2014 this build is stale, rebuild",
      missing.join("\n"));
  } else if (proved === 0) {
    bad("could not prove ANY commit is in the build",
      "No recent commit touched a shipped file, or no usable marker was found (" + noMarker + " skipped).\n" +
      "Do not treat this as a pass \u2014 verify by hand before publishing.");
  } else {
    ok("all " + proved + " provable recent commit(s) found inside app.asar");
  }
}

// ---------------------------------------------------------------------------------------------------
// 4. The release slot on GitHub
// ---------------------------------------------------------------------------------------------------
heading("4. GitHub");

if (!fs.existsSync(GH)) {
  bad("gh not found at " + GH, "install GitHub CLI, or fix the path at the top of this script");
} else {
  const existing = spawnSync(GH, ["release", "view", TAG, "--repo", GH_REPO, "--json", "tagName,isDraft,isPrerelease"],
    { encoding: "utf8" });
  if (existing.status === 0) {
    bad("a release already exists for " + TAG, "Bump the version in package.json, or delete that release first.");
  } else {
    ok(TAG + " is free");
  }

  const latest = spawnSync(GH, ["release", "view", "--repo", GH_REPO, "--json", "tagName"], { encoding: "utf8" });
  if (latest.status === 0) {
    try { ok("current latest release is " + JSON.parse(latest.stdout).tagName); } catch (_) {}
  }
}

// ---------------------------------------------------------------------------------------------------
// Verdict
// ---------------------------------------------------------------------------------------------------
heading(failures ? "REFUSING: " + failures + " check(s) failed." : "All checks passed.");

if (failures && !WANT_BUILD) process.exit(1);

// ---------------------------------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------------------------------
if (WANT_BUILD) {
  // Keep the outgoing build rather than overwriting it, matching the existing dist/ convention.
  if (fs.existsSync(EXE)) {
    const d = fs.statSync(EXE).mtime;
    const stamp = String(d.getMonth() + 1).padStart(2, "0") + String(d.getDate()).padStart(2, "0");
    const keep = path.join(OUT_DIR, "SUPERSEDED-" + stamp + " " + path.basename(EXE));
    if (!fs.existsSync(keep)) { fs.renameSync(EXE, keep); console.log("\nkept previous build as " + path.basename(keep)); }
  }
  console.log("\nBuilding \u2014 this takes a few minutes.\n");
  const r = spawnSync("npm", ["run", "build"], { cwd: REPO_ROOT, stdio: "inherit", shell: true });
  if (r.status !== 0) { console.log("\nBuild FAILED."); process.exit(1); }
  console.log("\nBuild done. Re-run this script with no flags to re-check the fresh build, then --publish.");
  process.exit(0);
}

// ---------------------------------------------------------------------------------------------------
// Publish
// ---------------------------------------------------------------------------------------------------
if (WANT_PUBLISH) {
  const notes = path.join(OUT_DIR, "release-notes-" + VERSION + ".md");
  if (!fs.existsSync(notes)) {
    console.log("\nWrite the release notes first:\n  " + notes + "\n");
    process.exit(1);
  }
  // --latest, and neither --draft nor --prerelease: GitHub excludes both from /releases/latest, which is
  // the only endpoint the in-app updater reads. A drafted release is invisible to every existing user and
  // nothing anywhere says why.
  const args = ["release", "create", TAG, EXE, "--repo", GH_REPO,
    "--title", "Nova " + VERSION, "--notes-file", notes, "--latest"];
  console.log("\n" + GH + " " + args.map((a) => (a.includes(" ") ? JSON.stringify(a) : a)).join(" ") + "\n");
  const r = spawnSync(GH, args, { stdio: "inherit" });
  if (r.status !== 0) { console.log("\nPublish FAILED."); process.exit(1); }

  console.log("\nPublished. Now prove the updater can actually see it:");
  console.log('  node -e "const u=require(\'./update-checker.js\');u._resetCache();' +
    'u.checkForUpdate(\'<previous version>\').then(r=>console.log(r))"');
  console.log("  updateAvailable must be true for the previous version, and false for " + VERSION + ".");
}
