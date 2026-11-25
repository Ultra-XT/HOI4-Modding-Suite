// ⛔ #nova-ships-no-third-party-art — NO FILE NOVA SHIPS IS A BYTE COPY OF A FILE OF THE GAME'S.
//
// Until 1.0.7, public/GFX shipped 40 icons that were not Nova's: 17 Paradox's (byte-identical copies of the game's own
// military_factory_icon.dds and fuel_silos.dds, and fifteen PNGs from the HOI4 wiki) and 23 the Toolpack Workshop mod's. The
// 1.0.6 exe carried all 40 (measured in its app.asar by the licence research), while the README said the game's files "are
// not redistributed here". They are gone for the 1.0.7 licence. This keeps them gone: every file the build packs is
// compared, byte for byte, with every file of the game folder Nova itself uses.
//
//   • WHAT SHIPS is worked out by electron-builder's own code, from its own config, and never re-implemented here: its config
//     loader (getConfig: package.json's build, or an electron-builder.* file, and what that extends), then, for the top level
//     and for every platform section the config has, the app's files as they go into app.asar (getMainFileMatchers, then
//     computeFileSets) and every other file set (getFileMatchers, walked as its copyFiles walks). Which sections can carry a
//     file set, and which kinds a FileSet can be given to, are read out of electron-builder's scheme.json (today win, mac, mas,
//     masDev and linux; files, extraResources and extraFiles). The names its own source hands to getFileMatchers are read too,
//     so a kind an upgrade adds fails here instead of going unread. A file on disk ships whether git tracks it or not.
//     ⚠ Until 2026-11-19 this guard read build.files, and the top level's extraResources and extraFiles, by hand, and passed
//     four shapes electron-builder packs: an extraFiles pattern, an extraFiles FileSet with no `from`, build.win.files and
//     build.win.extraFiles. So every run hands that same reading a fixture project with each kind at the top level and in
//     each section, as a pattern, a FileSet with a `from` and one without, and each must ship its file and nothing else.
//     The hand-written minimatch reading of build.files stays as a cross-check on the real project: every tracked file its
//     patterns take must be among electron-builder's, unless an exclusion electron-builder adds after them drops it.
//     An empty file is skipped: it copies nothing. node_modules is packed by electron-builder's dependency walk, not by these
//     file sets, and holds npm packages under their own licences (the notices' business), so it is not walked.
//   • THE GAME is the folder Nova finds (resolveHoi4GameRoot: the modder's choice, then HOI4_ROOT, then Steam's own record),
//     walked whole, sizes first and sha256 only where a size matches. 56,056 files, about 3 s warm (measured 2026-11-13).
//   • NO GAME FOUND IS A FAILURE. A guard that passes where it could not look is the silent pass this file exists to stop.
//     On a machine with no game, NOVA_SKIP_GAME_COPY_GUARD=1 says to skip it, and then it prints a skip line run-tests.js
//     hears and names in its summary (testlib-skip-line.js). Nothing else skips it.
//   • THE COMPARISON IS NOT BLIND. Every run it hands itself one real game file as if it shipped, and must find it; it runs
//     itself with no game, which must fail; and with no game and the skip variable, which must print that skip line.
//
// The pictures Nova no longer ships come from the player's own install instead: resolveBuildingIconDirectPath reads the mod,
// the game and every Workshop item (test-building-icons-actually-load.js). Workshop files are not compared here: on this
// machine 14 items hold about 310,000 files and took 299 s to walk cold, and the release gate's art check (gate G6, planned
// for scripts/release.js) is where that comparison belongs, with the pixel-equal conversions (the wiki PNGs were not
// byte copies of any game file) that a byte comparison cannot see.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { spawnSync } = require("child_process");
const { resolveHoi4GameRoot, hoi4GameFolderFound, gameFolderReport } = require("./server.js");
const { SKIP_LINE } = require("./testlib-skip-line.js");
const { maskJsComments } = require("./testlib-strip-comments.js");

const SKIP_VAR = "NOVA_SKIP_GAME_COPY_GUARD";
const NO_GAME_CHILD = "--as-a-machine-with-no-game";
const asChild = process.argv[2] === NO_GAME_CHILD;

let pass = 0, fail = 0;
const failed = [];
const ok = (c, m, x) => {
  if (c) { pass++; console.log("  ok   " + m); }
  else {
    fail++;
    const why = x !== undefined ? "   -> " + (typeof x === "string" ? x : JSON.stringify(x)).slice(0, 900) : "";
    failed.push(m + why);
    console.log("  FAIL " + m + why);
  }
};
const finish = (label) => {
  console.log(`\n=== ${label}: ${pass} passed, ${fail} failed ===`);
  failed.forEach((f) => console.log("   FAILED: " + f));
  process.exit(fail ? 1 : 0);
};
const loud = (lines) => {
  console.log("\n  " + "=".repeat(112));
  for (const l of lines) console.log("  " + l);
  console.log("  " + "=".repeat(112));
};

// ── what ships: electron-builder's own code, on its own config ─────────────────────────────────────────────────────────────
const ROOT = __dirname;
/** app-builder-lib's own functions, from the copy this project builds with. */
function loadElectronBuilder(root) {
  const abl = path.dirname(require.resolve("app-builder-lib/package.json", { paths: [root] }));
  const out = (...p) => require(path.join(abl, "out", ...p));
  const fm = out("fileMatcher.js");
  const cfg = out("util", "config", "config.js");
  const bu = require(require.resolve("builder-util", { paths: [abl] }));
  const fns = {
    getConfig: cfg.getConfig, computeDefaultAppDirectory: cfg.computeDefaultAppDirectory,
    getMainFileMatchers: fm.getMainFileMatchers, getFileMatchers: fm.getFileMatchers,
    computeFileSets: out("util", "appFileCopier.js").computeFileSets,
    expandMacro: out("util", "macroExpander.js").expandMacro,
    walk: bu.walk,
    Minimatch: require(require.resolve("minimatch", { paths: [abl] })).Minimatch,
  };
  const version = require(path.join(abl, "package.json")).version;
  const gone = Object.keys(fns).filter((k) => typeof fns[k] !== "function");
  if (gone.length || !bu.log || !("stream" in bu.log)) throw new Error(`app-builder-lib ${version} has no ${gone.join(", ") || "log.stream"}`);
  return Object.assign(fns, { abl, version, log: bu.log, scheme: JSON.parse(fs.readFileSync(path.join(abl, "scheme.json"), "utf8")) });
}
let EB = null, ebWhy = "";
try { EB = loadElectronBuilder(ROOT); } catch (e) { ebWhy = String((e && e.message) || e); }
if (!EB) {
  loud(["FAIL ELECTRON-BUILDER'S OWN CODE COULD NOT BE LOADED: WHAT SHIPS CANNOT BE WORKED OUT, AND THAT IS NOT A PASS.",
    ebWhy.slice(0, 200),
    "This guard asks app-builder-lib itself what the build packs; npm install the devDependencies and run it again."]);
  process.exit(1);
}
// app-builder-lib/out/fileMatcher.js: `const minimatchOptions = { dot: true }`.
const MM = { dot: true };

/** From electron-builder's scheme.json: the properties it types as a FileSet (the kinds a file set can be given to), and the
 *  root sections whose definition has one (the platform sections). */
function fileSetSchema(scheme) {
  const isFileSet = (s) => JSON.stringify(s || {}).includes('"#/definitions/FileSet"');
  const kinds = new Set(), carriers = new Set();
  for (const [p, s] of Object.entries(scheme.properties || {})) if (isFileSet(s)) kinds.add(p);
  for (const [d, def] of Object.entries(scheme.definitions || {})) {
    for (const [p, s] of Object.entries(def.properties || {})) if (isFileSet(s)) { kinds.add(p); carriers.add(d); }
  }
  const sections = Object.entries(scheme.properties || {})
    .filter(([, s]) => (JSON.stringify(s).match(/#\/definitions\/\w+/g) || []).some((r) => carriers.has(r.slice("#/definitions/".length))))
    .map(([p]) => p);
  return { kinds: [...kinds], sections };
}
/** Every name electron-builder's own compiled source hands to getFileMatchers: the string literals of its second argument,
 *  read with the comments masked. */
function namesHandedToGetFileMatchers(abl) {
  const names = new Set();
  const visit = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) { visit(p); continue; }
      if (!e.name.endsWith(".js")) continue;
      const src = fs.readFileSync(p, "utf8");
      if (!src.includes("getFileMatchers")) continue;
      for (const m of maskJsComments(src).matchAll(/getFileMatchers\)?\(\s*[\w.]+\s*,\s*([^,]+?)\s*,/g)) {
        for (const s of m[1].matchAll(/"(\w+)"/g)) names.add(s[1]);
      }
    }
  };
  visit(path.join(abl, "out"));
  return names;
}
// The names electron-builder also hands to getFileMatchers that its schema types as plain patterns, not as a FileSet, with
// what its source does with each. Each must still be among the names its source hands over, and a name that is neither a
// FileSet kind nor one of these fails the run.
const PLAIN_PATTERN_KINDS = {
  extraDistFiles: "copied",   // targets/ArchiveTarget.js: copyFiles into a macOS zip, from the project folder. Read like the rest.
  asarUnpack: "a filter",     // platformPackager.js: which of the files already packed stay outside app.asar. It packs nothing.
};
const SCHEMA = fileSetSchema(EB.scheme);
const SOURCE_NAMES = namesHandedToGetFileMatchers(EB.abl);
const KINDS = [...new Set([...SCHEMA.kinds, ...Object.keys(PLAIN_PATTERN_KINDS).filter((k) => PLAIN_PATTERN_KINDS[k] === "copied")])];

/** What electron-builder packs for the project at `root`, as electron-builder itself works it out: its config loader, then for
 *  the top level and every platform section the config has, the app's files (getMainFileMatchers, then computeFileSets: what
 *  goes into app.asar) and every other kind (getFileMatchers, walked as copyFiles walks). Nothing is built, copied or written.
 *  Each file: { rel (to `root`, "/"), abs, size, via: the kinds that take it, "<section>.<kind>" inside a section }. */
async function shippedFiles(root) {
  const heard = [];
  const stream = EB.log.stream;
  EB.log.stream = { write: (s) => { heard.push(String(s)); return true; } };
  try {
    const config = await EB.getConfig(root, null, null);
    const dirs = config.directories || {};
    const appDir = await EB.computeDefaultAppDirectory(root, dirs.app);
    let pkg = {};
    try { pkg = JSON.parse(fs.readFileSync(path.join(appDir, "package.json"), "utf8")); } catch (_) { pkg = {}; }
    const productName = config.productName || pkg.productName || pkg.name || "";
    // What a macro in a pattern may name (macroExpander.js); one this does not know throws, and the run fails on it.
    const appInfo = { name: pkg.name, productName, sanitizedProductName: productName, productFilename: productName, version: pkg.version, buildVersion: pkg.version };
    const present = SCHEMA.sections.filter((s) => config[s] != null);
    const nowhere = path.join(root, "(nothing is written here)");
    const byAbs = new Map(), missing = [], after = new Set();
    const take = (abs, via) => {
      if (!byAbs.has(abs)) byAbs.set(abs, new Set());
      byAbs.get(abs).add(via);
    };
    for (const section of [null, ...present]) {
      const opts = section ? config[section] : Object.create(null);
      const osKey = section || ({ win32: "win", darwin: "mac" }[process.platform] || "linux");
      const macroExpander = (s) => EB.expandMacro(s, null, appInfo, { os: osKey, "/*": "{,/**/*}" });
      const outDir = path.resolve(root, macroExpander(dirs.output || "dist"));
      const packager = { info: { projectDir: root, buildResourcesDir: path.resolve(root, dirs.buildResources || "build"), config,
        isPrepackedAppAsar: false, areNodeModulesHandledExternally: false, debugLogger: { isEnabled: false } } };
      const where = (kind) => (section ? `${section}.${kind}` : kind);
      // The app's files, as platformPackager.copyAppFiles collects them for app.asar. (It also keeps out of app.asar what an
      // extraResources or extraFiles set takes from the project; that only moves a file from one list to the other.)
      const main = EB.getMainFileMatchers(appDir, path.join(nowhere, "app"), macroExpander, opts, packager, outDir, false);
      // For the cross-check: the exclusions getMainFileMatchers adds after every pattern of the config's own. A file one of
      // them matches is never packed, whatever those patterns say.
      const own = new Set(["package.json"]);
      for (const m of EB.getFileMatchers(config, "files", nowhere, { macroExpander, customBuildOptions: opts, globalOutDir: outDir, defaultSrc: appDir }) || []) {
        for (const p of m.patterns) own.add(p);
      }
      for (const m of main) {
        if (path.resolve(m.from) !== path.resolve(appDir)) continue;
        let last = -1;
        m.patterns.forEach((p, i) => { if (own.has(p)) last = i; });
        for (const p of m.patterns.slice(last + 1)) if (p.startsWith("!")) after.add(p);
      }
      for (const set of await EB.computeFileSets(main, null, packager, false)) for (const f of set.files) take(f, where("files"));
      // Every other kind, as fileMatcher.copyFiles takes it: a `from` that is a file is that file; a folder with no pattern
      // takes everything in it; a folder is entered only where the matcher's filter admits it.
      const options = { macroExpander, customBuildOptions: opts, globalOutDir: outDir, defaultSrc: root };
      for (const kind of KINDS.filter((k) => k !== "files")) {
        for (const m of EB.getFileMatchers(config, kind, path.join(nowhere, kind), options) || []) {
          let st = null;
          try { st = fs.statSync(m.from); } catch (_) { missing.push(`${where(kind)} ${path.relative(root, m.from) || m.from}`); continue; }
          if (st.isFile()) { take(m.from, where(kind)); continue; }
          if (m.isEmpty() || m.containsOnlyIgnore()) m.prependPattern("**/*");
          for (const f of await EB.walk(m.from, m.createFilter(), null)) take(f, where(kind));
        }
      }
    }
    const list = [...byAbs].map(([abs, via]) => ({ rel: path.relative(root, abs).split(path.sep).join("/"), abs, size: fs.statSync(abs).size, via: [...via] }));
    return { list, missing, appDir, present, after: [...after], heard: heard.join("") };
  } finally {
    EB.log.stream = stream;
  }
}

// ── the cross-check: build.files read by hand, with the minimatch app-builder-lib loads and its rules ────────────────────────
const BUILD = (() => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8")).build || {}; } catch (_) { return {}; } })();
const PATTERNS = (Array.isArray(BUILD.files) ? BUILD.files : []).filter((p) => typeof p === "string");
/** electron-builder's own steps (FileMatcher.normalizePattern, computeParsedPatterns, getMainFileMatchers): "./" dropped, a
 *  pattern with no "." and no magic is a folder and takes everything below it, and package.json is added when absent. */
function matchers(patterns) {
  const out = [];
  const list = patterns.map((p) => path.posix.normalize(String(p).replace(/^\.\//, "").replace(/\\/g, "/")));
  if (!list.some((p) => !p.startsWith("!"))) list.unshift("**/*");
  else if (!list.includes("package.json")) list.push("package.json");
  for (const p of list) {
    const m = new EB.Minimatch(p, MM);
    out.push(m);
    const magic = m.set.length > 1 || m.set[0].some((x) => typeof x !== "string");
    if (!p.includes(".") && !magic) out.push(new EB.Minimatch(`${p}/**/*`, MM));
  }
  return out;
}
/** app-builder-lib/out/util/filter.js minimatchAll: once matched only an exclusion is tried, before that only an inclusion. */
const decides = (ms, rel) => {
  let match = false;
  for (const m of ms) { if (match !== m.negate) continue; match = m.match(rel); }
  return match;
};
const HAND = matchers(PATTERNS);
const ships = (rel) => decides(HAND, rel);

// ── the game: every file, by size ───────────────────────────────────────────────────────────────────────────────────────
function gameFilesBySize(gameRoot) {
  const bySize = new Map();
  let count = 0;
  const stack = [gameRoot];
  while (stack.length) {
    const dir = stack.pop();
    let ents = [];
    try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { continue; }
    for (const e of ents) {
      const abs = path.join(dir, e.name);
      if (e.isDirectory()) { stack.push(abs); continue; }
      if (!e.isFile()) continue;
      let size;
      try { size = fs.statSync(abs).size; } catch (_) { continue; }
      count++;
      if (!bySize.has(size)) bySize.set(size, []);
      bySize.get(size).push(abs);
    }
  }
  return { bySize, count };
}
const hashes = new Map();
const sha256 = (abs) => {
  if (!hashes.has(abs)) hashes.set(abs, crypto.createHash("sha256").update(fs.readFileSync(abs)).digest("hex"));
  return hashes.get(abs);
};
/** Each shipped file that is byte for byte a file of the game's, with every game file it copies. */
function copiesOfTheGame(shipped, game) {
  const out = [];
  for (const f of shipped) {
    if (f.size === 0) continue;
    const candidates = game.bySize.get(f.size) || [];
    if (!candidates.length) continue;
    const h = sha256(f.abs);
    const same = candidates.filter((g) => sha256(g) === h);
    if (same.length) out.push({ shipped: f.rel, size: f.size, game: same });
  }
  return out;
}

(async () => {
  // ── a machine with no game ───────────────────────────────────────────────────────────────────────────────────────────
  if (!hoi4GameFolderFound()) {
    const { list } = await shippedFiles(ROOT);
    if (process.env[SKIP_VAR] === "1") {
      console.log(`  SKIP — Nova found no Hearts of Iron IV on this machine, so none of the ${list.length} files the build packs was compared with the game's (${SKIP_VAR}=1 asked to skip)`);
      process.exit(0);
    }
    loud(["FAIL NO GAME FOLDER: THIS GUARD COULD NOT LOOK, AND THAT IS NOT A PASS.",
      `Nova found no Hearts of Iron IV on this machine (resolveHoi4GameRoot answered ${resolveHoi4GameRoot()}),`,
      `so none of the ${list.length} files the build packs was compared with the game's files.`,
      `Point HOI4_ROOT at the game folder, or set ${SKIP_VAR}=1 on a machine that has no game.`]);
    process.exit(1);
  }
  if (asChild) {
    // A developer's .env beside server.js is read into process.env as it loads (loadDotEnv), and one naming HOI4_ROOT gives
    // even this child a game: said, not passed.
    console.log(`  FAIL the no-game child found a game after all: ${resolveHoi4GameRoot()} (a .env naming HOI4_ROOT does that)`);
    process.exit(1);
  }

  // ── a machine with the game ──────────────────────────────────────────────────────────────────────────────────────────
  const GAME = resolveHoi4GameRoot();
  let from = "";
  try { from = gameFolderReport().source || ""; } catch (_) { from = ""; }
  console.log(`(the game folder Nova uses: ${GAME}${from ? ", found by " + from : ""}; electron-builder's code: app-builder-lib ${EB.version}, ${path.relative(ROOT, EB.abl) || EB.abl})`);

  console.log("\n1. What ships is worked out by electron-builder's own code, from its own config");
  ok(SCHEMA.kinds.length > 0 && SCHEMA.sections.length > 0 && SCHEMA.kinds.every((k) => SOURCE_NAMES.has(k)),
    `its scheme.json types ${SCHEMA.kinds.length} kinds as file sets (${SCHEMA.kinds.join(", ")}), carried by ${SCHEMA.sections.length} platform sections (${SCHEMA.sections.join(", ")}), and its source packs each`,
    { kinds: SCHEMA.kinds, sections: SCHEMA.sections, source: [...SOURCE_NAMES] });
  const unknown = [...SOURCE_NAMES].filter((n) => !SCHEMA.kinds.includes(n) && !(n in PLAIN_PATTERN_KINDS));
  const stale = Object.keys(PLAIN_PATTERN_KINDS).filter((n) => !SOURCE_NAMES.has(n));
  ok(unknown.length === 0 && stale.length === 0,
    `every name its source hands to getFileMatchers (${[...SOURCE_NAMES].join(", ")}) is a file-set kind, or one this guard knows and still finds there`,
    { "neither a kind nor known": unknown, "known but gone from its source": stale });
  const real = await shippedFiles(ROOT);
  const shipped = real.list;
  const said = real.heard.replace(/\u001b\[[0-9;]*m/g, "").replace(/\s+/g, " ").trim();
  console.log(`     (read for the top level${real.present.map((s) => ` and build.${s}`).join("")}; electron-builder said: ${said.slice(0, 160) || "nothing"})`);
  const viaFiles = shipped.filter((f) => f.via.some((v) => v === "files" || v.endsWith(".files")));
  ok(viaFiles.length > PATTERNS.length, `build.files' ${PATTERNS.length} patterns take ${viaFiles.length} files`);
  const inApp = new Set(shipped.map((f) => path.relative(real.appDir, f.abs).split(path.sep).join("/")));
  if (!PATTERNS.length) {
    console.log("  SKIP — package.json's build.files holds no pattern to read by hand, so the hand-written cross-check had nothing to compare");
  } else {
    // Each pattern that names one file by name names a file that is there: a reading that dropped a literal name would read
    // an empty list as a clean one.
    const literal = PATTERNS.filter((p) => !/[*?[{!]/.test(p) && p.includes("."));
    const literalMissing = literal.filter((p) => !inApp.has(path.posix.normalize(p.replace(/^\.\//, ""))));
    ok(literal.length > 0 && literalMissing.length === 0, `every pattern that names one file (${literal.length}) is among them`, literalMissing);
    // …and every tracked file build.files' own patterns take, read by hand, is among them: electron-builder's reading and walk
    // reach the bottom of each tree. Only an exclusion electron-builder adds after the config's patterns may drop one.
    const tracked = spawnSync("git", ["ls-files"], { cwd: ROOT, encoding: "utf8" });
    const trackedFiles = tracked.status === 0 ? tracked.stdout.split(/\r?\n/).filter(Boolean) : [];
    const appFromRoot = path.relative(ROOT, real.appDir).split(path.sep).join("/");
    const trackedInApp = trackedFiles.filter((f) => !appFromRoot || f.startsWith(appFromRoot + "/")).map((f) => (appFromRoot ? f.slice(appFromRoot.length + 1) : f));
    const trackedShipping = trackedInApp.filter((f) => ships(f) && fs.existsSync(path.join(real.appDir, f)));
    const AFTER = real.after.map((p) => new EB.Minimatch(p.slice(1), MM));
    const notTaken = trackedShipping.filter((f) => !inApp.has(f));
    const droppedByEb = notTaken.filter((f) => AFTER.some((m) => m.match(f)));
    const unseen = notTaken.filter((f) => !AFTER.some((m) => m.match(f)));
    ok(trackedFiles.length > 0 && trackedShipping.length > literal.length && unseen.length === 0,
      `all ${trackedShipping.length} tracked files build.files' patterns take, read by hand, are among them`
        + (droppedByEb.length ? ` (but for ${droppedByEb.length} an exclusion electron-builder adds drops: ${droppedByEb.slice(0, 3).join(", ")})` : ""),
      unseen.slice(0, 5));
  }
  const self = path.relative(ROOT, __filename).split(path.sep).join("/");
  ok(!(PATTERNS.length && ships(self)) && !shipped.some((s) => path.resolve(s.abs) === path.resolve(__filename)), `this test file (${self}) is not among what ships`);
  const extra = shipped.filter((f) => !f.via.some((v) => v === "files" || v.endsWith(".files")));
  console.log(`     (${extra.length} more from the other kinds${extra.length ? ": " + extra.map((f) => `${f.rel} (${f.via.join(", ")})`).join("; ") : ""}`
    + `${real.missing.length ? "; not on disk, so not compared: " + real.missing.join(", ") : ""})`);
  const empty = shipped.filter((f) => f.size === 0).map((f) => f.rel);
  console.log(`     (${empty.length} empty file(s) skipped${empty.length ? ": " + empty.join(", ") : ""})`);

  console.log("\n2. The game folder Nova uses holds the game, and is walked whole");
  const game = gameFilesBySize(GAME);
  const marker = ["hoi4.exe", "hoi4.app", "hoi4"].map((n) => path.join(GAME, n)).find((p) => fs.existsSync(p)) || "";
  ok(hoi4GameFolderFound() && !!marker, `Nova reports the game found, and its program is there (${path.basename(marker) || "none"})`);
  ok(game.count > 1000, `the walk saw ${game.count} files`);
  ok(!!marker && (game.bySize.get(fs.statSync(marker).size) || []).some((p) => path.resolve(p) === path.resolve(marker)),
    "the game's program is among the files walked");

  console.log("\n3. No file Nova ships is a byte copy of a file of the game's");
  const copies = copiesOfTheGame(shipped, game);
  ok(copies.length === 0, `none of the ${shipped.length} shipped files is byte-identical to any of the game's ${game.count}`,
    copies.map((c) => `${c.shipped} (${c.size} B) = ${c.game.map((g) => path.relative(GAME, g)).join(", ")}`).join("; "));

  console.log("\n4. …and neither the comparison nor the reading of what ships is blind");
  // One real game file, handed to the comparison as if it shipped. Picked from the walk, never named: the first, by path, of the
  // game's files between 1 KB and 64 KB.
  const all = [];
  for (const list of game.bySize.values()) for (const p of list) all.push(p);
  all.sort();
  const decoy = all.find((p) => { const s = fs.statSync(p).size; return s >= 1024 && s <= 65536; });
  const decoyHit = decoy ? copiesOfTheGame([{ rel: "public/(as if shipped)/" + path.basename(decoy), abs: decoy, size: fs.statSync(decoy).size }], game) : [];
  ok(!!decoy && decoyHit.length === 1 && decoyHit[0].game.some((g) => path.resolve(g) === path.resolve(decoy)),
    `a real game file handed over as if it shipped is found (${decoy ? path.relative(GAME, decoy) : "no file picked"})`);
  // The same bytes under another name: what a copy renamed into public/ would be. Written into temp, never into the app folder.
  const SCRATCH = fs.mkdtempSync(path.join(os.tmpdir(), "nova-nocopy-"));
  try {
    const renamed = path.join(SCRATCH, "renamed.png");
    if (decoy) fs.copyFileSync(decoy, renamed);
    const renamedHit = decoy ? copiesOfTheGame([{ rel: "public/renamed.png", abs: renamed, size: fs.statSync(renamed).size }], game) : [];
    ok(renamedHit.length === 1, "…and so is the same file under another name");
    // An empty file copies nothing, and is not reported even where the game has empty files of its own.
    const blank = path.join(SCRATCH, "empty.txt");
    fs.writeFileSync(blank, "");
    ok(copiesOfTheGame([{ rel: "public/empty.txt", abs: blank, size: 0 }], game).length === 0, "an empty file is not reported as a copy");
    // The cross-check's matcher, on answers known from electron-builder's own rules: a dotfile below public/ ships (dot: true),
    // a folder of its own no pattern names does not, and a pattern naming a folder takes what is in it.
    const probe = matchers(["public/**/*", "!**/*.map", "docs"]);
    ok(decides(probe, "public/.hidden/x.png") && !decides(probe, "scripts/release.js") && !decides(probe, "public/a.js.map")
      && decides(probe, "docs/a/b.txt") && decides(probe, "package.json"), "the cross-check's matcher answers as electron-builder's rules do");
    // The reading of what ships, on a fixture project: every kind, at the top level and in every platform section, in every
    // shape a file set comes in. Four of these this guard once passed over while electron-builder packed them.
    const project = path.join(SCRATCH, "project");
    const put = (rel, body) => { const f = path.join(project, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, body); };
    const SHAPES = [
      ["a pattern", "fx-art/**/*"],
      ["a FileSet with a from", { from: "fx-art", to: "art" }],
      ["a FileSet with no from", { to: "art", filter: ["fx-art/**/*"] }],
    ];
    const misses = [];
    let cases = 0;
    for (const kind of SCHEMA.kinds) for (const section of [null, ...SCHEMA.sections]) for (const [shape, set] of SHAPES) {
      fs.rmSync(project, { recursive: true, force: true });
      const build = { files: ["main.js"] };
      const sets = kind === "files" ? ["main.js", set] : [set];
      if (section) build[section] = { [kind]: sets }; else build[kind] = sets;
      put("package.json", JSON.stringify({ name: "nocopy-fixture", version: "1.0.0", main: "main.js", build }));
      put("main.js", "\n");
      put("fx-art/a.bin", "a picture a file set names\n");
      put("fx-other/b.bin", "a file no file set names\n");
      cases++;
      let got = [];
      try { got = (await shippedFiles(project)).list.map((f) => f.rel); } catch (e) { got = [`(threw: ${e.message})`]; }
      if (!got.includes("fx-art/a.bin") || got.includes("fx-other/b.bin")) misses.push(`${section ? section + "." : ""}${kind} as ${shape}: ${got.join(", ") || "nothing"}`);
    }
    ok(cases > 0 && misses.length === 0,
      `on a fixture project, each kind at the top level and in each section, as ${SHAPES.map(([s]) => s).join(", ")}, ships its file and nothing else (${cases - misses.length} of ${cases})`,
      misses.slice(0, 6));

    console.log("\n5. With no game, this guard fails; with no game and the skip variable, it says it skipped");
    // Run as a machine with no game would: detection kept off this machine (NOVA_TEST_GAME_DETECTION=off), no HOI4_ROOT, and
    // app data of its own, so no saved Game folder choice reaches it.
    const childData = fs.mkdtempSync(path.join(SCRATCH, "appdata-"));
    const childEnv = (more) => Object.assign({}, process.env, {
      NOVA_TEST_GAME_DETECTION: "off", HOI4_ROOT: "",
      APPDATA: childData, XDG_CONFIG_HOME: childData, NOVA_APP_DATA_DIR: childData, NOVA_HOME_DIR: childData,
      HOI4_USER_DIR: path.join(childData, "hoi4-user"), NOVA_DOCUMENTS_DIR: path.join(childData, "Documents"),
      [SKIP_VAR]: "",
    }, more);
    const run = (more) => spawnSync(process.execPath, [__filename, NO_GAME_CHILD], { cwd: ROOT, encoding: "utf8", env: childEnv(more), timeout: 120000 });
    const noGame = run({});
    ok(noGame.status === 1 && /FAIL NO GAME FOLDER/.test(noGame.stdout),
      "with no game it exits 1 and says why", `status ${noGame.status}: ${(noGame.stdout + noGame.stderr).trim().slice(-400)}`);
    const skipped = run({ [SKIP_VAR]: "1" });
    const skipLines = String(skipped.stdout || "").split(/\r?\n/).filter((l) => SKIP_LINE.test(l));
    ok(skipped.status === 0 && skipLines.length === 1 && new RegExp(SKIP_VAR + "=1").test(skipLines[0]),
      `with no game and ${SKIP_VAR}=1 it exits 0 and prints one skip line run-tests.js hears`,
      `status ${skipped.status}: ${(skipped.stdout + skipped.stderr).trim().slice(-400)}`);
    const otherValue = run({ [SKIP_VAR]: "yes" });
    ok(otherValue.status === 1, `only ${SKIP_VAR}=1 skips it: any other value still fails`, `status ${otherValue.status}`);
  } finally {
    try { fs.rmSync(SCRATCH, { recursive: true, force: true }); } catch (_) { /* temp: the OS clears it */ }
  }

  finish("Nova ships no copy of a game file");
})().catch((e) => {
  loud(["FAIL THE GUARD STOPPED BEFORE IT COULD FINISH LOOKING, AND THAT IS NOT A PASS.",
    String((e && e.stack) || e).split("\n").slice(0, 6).join("\n  ")]);
  process.exit(1);
});
