// findCountryHistoryFiles resolves a country's history/countries/*.txt across the dependency stack —
// it's what deleteCountry/restoreCountry snapshot and rewrite. Two things must hold or add-on mods
// break: (1) the filename MATCHER keys off the tag with a non-alphanumeric boundary, so "GER" picks
// up "GER - Germany.txt" and "GER.txt" but NOT "GERA - ...txt" or "FRA - ...txt"; (2) the LAYERING is
// mod-overrides-dependency-overrides-vanilla BY FILENAME, with base-only files still surfaced (origin
// "base") so a deletion sees the real effective file set. A bug here silently double-lists a file or
// edits the wrong copy. No HTTP — findCountryHistoryFiles is a pure fixture function.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const { findCountryHistoryFiles } = require("./map-data.js");

let pass = 0, fail = 0;
const check = (n, c, e) => { if (c) { pass++; console.log("  PASS", n); } else { fail++; console.log("  FAIL", n, e != null ? "→ " + e : ""); } };

// Build three roots: a vanilla gameRoot, one dependency (e.g. MD), and the active mod.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "nova-histfiles-"));
const gameRoot = path.join(tmp, "game");
const depRoot = path.join(tmp, "dep");
const modRoot = path.join(tmp, "mod");
const hc = (root) => { const d = path.join(root, "history", "countries"); fs.mkdirSync(d, { recursive: true }); return d; };
const put = (dir, file, content) => fs.writeFileSync(path.join(dir, file), content, "utf8");

const gDir = hc(gameRoot), dDir = hc(depRoot), mDir = hc(modRoot);

// vanilla (lowest priority)
put(gDir, "GER - Germany.txt", "vanilla-ger-germany");
put(gDir, "GER.txt", "vanilla-ger-bare");          // bare tag, must match
put(gDir, "GER - Shared.txt", "vanilla-shared");    // also in dep → dep must win
put(gDir, "GERA - Aland.txt", "vanilla-gera");      // must NOT match tag GER (lookahead)
put(gDir, "FRA - France.txt", "vanilla-fra");       // different tag → excluded

// dependency (middle priority)
put(dDir, "GER - Germany.txt", "dep-ger-germany");  // overrides vanilla for this filename
put(dDir, "GER - Colony.txt", "dep-ger-colony");    // dep-only matching file
put(dDir, "GER - Shared.txt", "dep-shared");        // overrides vanilla "Shared"

// active mod (highest priority)
put(mDir, "GER - Germany.txt", "mod-ger-germany");  // overrides dep + vanilla
put(mDir, "GER - Reich.txt", "mod-ger-reich");      // mod-only

const res = findCountryHistoryFiles({ modRoot, gameRoot, dependencyRoots: [depRoot] }, "GER");
const byFile = Object.fromEntries(res.map((r) => [r.file, r]));
const files = res.map((r) => r.file).sort();

// --- matcher: which files are in / out ---
check("matches 'TAG - Name.txt'", !!byFile["GER - Germany.txt"]);
check("matches bare 'TAG.txt'", !!byFile["GER.txt"]);
check("excludes 'GERA - ...' (alphanumeric after tag fails the lookahead)", !byFile["GERA - Aland.txt"], JSON.stringify(files));
check("excludes a different tag (FRA)", !byFile["FRA - France.txt"], JSON.stringify(files));
check("exactly 5 GER files surface", res.length === 5, res.length + ": " + JSON.stringify(files));

// --- layering: mod overrides dependency overrides vanilla, by filename ---
check("mod wins over dep+vanilla for same filename (origin)", byFile["GER - Germany.txt"]?.origin === "mod", byFile["GER - Germany.txt"]?.origin);
check("mod wins over dep+vanilla for same filename (content)", byFile["GER - Germany.txt"]?.content === "mod-ger-germany", byFile["GER - Germany.txt"]?.content);
check("dependency overrides vanilla for a base-only filename (content)", byFile["GER - Shared.txt"]?.content === "dep-shared", byFile["GER - Shared.txt"]?.content);
check("base-only file surfaces with origin 'base'", byFile["GER - Shared.txt"]?.origin === "base", byFile["GER - Shared.txt"]?.origin);
check("dep-only matching file surfaces (origin base)", byFile["GER - Colony.txt"]?.origin === "base" && byFile["GER - Colony.txt"]?.content === "dep-ger-colony");
check("vanilla-only bare file surfaces (origin base)", byFile["GER.txt"]?.origin === "base" && byFile["GER.txt"]?.content === "vanilla-ger-bare");
check("mod-only file surfaces with origin 'mod'", byFile["GER - Reich.txt"]?.origin === "mod" && byFile["GER - Reich.txt"]?.content === "mod-ger-reich");

// --- the matcher is case-insensitive on the tag argument ---
const lower = findCountryHistoryFiles({ modRoot, gameRoot, dependencyRoots: [depRoot] }, "ger");
check("lowercase tag arg still matches uppercase filenames", lower.length === 5, lower.length);

// --- no dependencies: just mod over vanilla ---
const noDep = findCountryHistoryFiles({ modRoot, gameRoot, dependencyRoots: [] }, "GER");
const noDepByFile = Object.fromEntries(noDep.map((r) => [r.file, r]));
check("without deps, the dep-only file is gone", !noDepByFile["GER - Colony.txt"]);
check("without deps, 'Shared' falls back to vanilla content", noDepByFile["GER - Shared.txt"]?.content === "vanilla-shared", noDepByFile["GER - Shared.txt"]?.content);
check("without deps, mod still overrides vanilla", noDepByFile["GER - Germany.txt"]?.content === "mod-ger-germany");

// --- missing directories: no throw, empty result ---
const emptyRoot = path.join(tmp, "empty-no-history");
fs.mkdirSync(emptyRoot, { recursive: true });
let threw = false, emptyRes = [];
try { emptyRes = findCountryHistoryFiles({ modRoot: emptyRoot, gameRoot: emptyRoot, dependencyRoots: [] }, "GER"); }
catch (_) { threw = true; }
check("missing history/countries dirs → no throw", !threw);
check("missing dirs → empty array", Array.isArray(emptyRes) && emptyRes.length === 0, emptyRes.length);

// cleanup
try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) {}

console.log(`\nCOUNTRY-HISTORY-FILES TEST: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
