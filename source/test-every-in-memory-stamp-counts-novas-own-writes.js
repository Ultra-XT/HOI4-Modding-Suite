// ⛔ #a-same-tick-write-keeps-its-stamp — EVERY IN-MEMORY STAMP COUNTS NOVA'S OWN WRITES, AND NO STAMP SAVED TO DISK DOES.
//
// A cache kept "while its files have not moved" asks stat, and on Windows stat cannot see a same-size write landing in the clock
// tick of the write before it (testlib-held-clock.js). test-a-renamed-state-keeps-its-regions-name.js failed 8 runs in 10 on
// that. safe-write.js now counts every write Nova makes (novaWritesTo), and every in-memory stamp adds the count for its files;
// test-a-same-tick-write-is-seen-by-every-map-cache.js and …-every-maker-cache.js pin one section per cache. This keeps the LIST
// from decaying: every code line of a shipped module that reads a `.mtimeMs`, or calls a stamp BUILDER (below), must count Nova's
// writes — on that line, on the line after it (provincePixelLookup counts once for its two stats), or through a `gen` its
// function took from novaWritesTo — or be named below, by the function it is in, with how many such lines it has and why it is
// left.
//
// The rule runs the other way for a stamp SAVED TO DISK: a count lives and dies with its process, so a saved stamp with one
// in it never matches at the next launch (#loc-warm-fingerprint-never-matches). Those functions must not call novaWritesTo at
// all. Seeing a same-tick write there takes the localisation files' pattern instead (novaWritesToken: a token of this
// process's writes, kept beside the answer) — and a saved catalogue a writer reads back (`token` below) must take it, on the
// answer in memory AND on the one taken back from disk: dropping the entry in memory only reloaded the saved one, under a
// fingerprint the same-tick write had not moved.
//
// ⛔ …and a function that GIVES BACK a stamp it builds is a builder, and every call of it is a row of its own, judged where it is
// made. Its callers carry no `.mtimeMs` of their own, so a scan for that saw the builder and none of them: the saved state
// catalogue was built on fileFingerprintPart with no count beside it, served GER after a same-size GER → FRA write inside one
// tick, and this test stayed green (review of the class hunt). That fix named fileFingerprintPart and fingerprintDirs by hand,
// and dirMtimeMs and modIndexFingerprint stayed excused by what THEIR callers kept: a new memo keyed on either passed (review of
// the fix round). The builders are derived now, from what each function returns. A call of fileFingerprintPart, whose output
// is only ever saved (`saved` below), is never counted — the count must not be inside a saved stamp.
//
// ⛔ …and the token is this process's, so the next launch has none to compare and takes back any saved answer its fingerprint
// still matches — a copy saved, then a same-size write in that same tick, and no question after it (review of the fix round:
// the next launch said GER). Every function that keeps the token beside a saved answer must ask savedInTheTickOf before taking
// one back; derived from who calls novaWritesToken.
"use strict";
const fs = require("fs");
const path = require("path");
const { maskJsComments, maskJsLiterals, jsBodyAt } = require("./testlib-strip-comments.js");

let pass = 0, fail = 0;
const ok = (c, m, x) => {
  if (c) { pass++; console.log("  ok   " + m); }
  else { fail++; console.log("  FAIL " + m + (x !== undefined ? "   -> " + JSON.stringify(x).slice(0, 600) : "")); }
};

// ── the stamps left without the count, by module and function: n = the stamp lines there, disk = the stamp is saved ─────────
const BUILDER = "a stamp BUILDER: what it gives back is kept by its callers, and every call of it is judged where it is made (derived below)";
const ICONS = "the pictures arrive by upload, a raw write no count sees";
const LEFT = {
  "server.js": {
    fileFingerprintPart:            { n: 2, disk: true,  saved: true, why: BUILDER + "; what it gives is only ever saved, so a call of it is a saved stamp, never counted (its second line keeps the time for savedInTheTickOf)" },
    getLocalizationMap:             { n: 3, disk: true,  why: "the localisation map's saved fingerprint — the base game's files, the dependencies', the mod's; Nova's writes to the mod's ride beside it (novaWritesToken as writesToken, pinned by test-a-same-size-write-is-not-read-stale.js); the base game's parts are taken once a process and the dependencies' once per set of them, and Nova writes neither while it is below" },
    warmCaches:                     { n: 2, disk: true,  why: "the startup warm builds getLocalizationMap's saved fingerprint in a process of its own, and stands aside when Nova has written any of the mod's files (novaWritesToken)" },
    collectStateCatalogByRoots:     { n: 1, disk: true,  token: true, why: "the saved state catalogue (the focus editor's building panel, the Army air-base picker): Nova's writes ride beside its fingerprint" },
    modIndexFingerprint:            { n: 1, disk: true,  why: BUILDER },
    rebuildModIndexInBackground:    { n: 1, disk: true,  why: "Home's saved mod index (modIndexFingerprint): every safeModWrite marks the entry in memory stale (cfg.afterWrite), and its rebuild reads the files, not the saved copy, which only a cold start takes" },
    "route /api/mod/index":         { n: 2, disk: true,  why: "the same saved mod index, taken back at a cold start and saved after a rebuild" },
    getDependencySpriteMap:         { n: 1, disk: true,  why: "a dependency's saved sprite map, cleared with the others (spriteMapCache.clear) and written by the same four writers" },
    getSpriteTextureMap:            { n: 2, disk: true,  why: "the saved sprite maps: in memory they are kept by roots alone and dropped by an explicit clear; Nova's four .gfx writers append a sprite (the size moves), rewrite the same text, or (the newspaper style) change only a comment line at the same size, which no sprite map reads" },
    _getSpriteTextureMapAsyncImpl:  { n: 2, disk: true,  why: "the same saved sprite maps, built off the main thread" },
    dirMtimeMs:                     { n: 1, disk: true,  why: BUILDER },
    iconIndexDirsUnchanged:         { n: 1, disk: true,  why: "the saved icon search index (dirMtimeMs), a list of file NAMES, which a rewrite does not change; " + ICONS },
    getCachedSearchIconIndex:       { n: 1, disk: true,  why: "the same saved icon search index, saved with the folders' times it was built under" },
    getDdsCacheFilePath:            { n: 1, disk: true,  why: BUILDER },
    tryConvertDdsToPngPath:         { n: 1, disk: true,  why: "a converted picture, saved under a name made from its .dds's stamp (getDdsCacheFilePath); " + ICONS },
    tryConvertDdsToPngPathAsync:    { n: 1, disk: true,  why: "the same converted pictures, made off the main thread" },
    "route /api/icon-image":        { n: 2, disk: true,  why: "the same converted pictures, looked for before a picture is resolved by its path" },
    fingerprintDirs:                { n: 2, disk: true,  why: BUILDER + ": the research and equipment catalogues save what it gives and keep the count beside it, the MIO and variant scans add it where they call it (its second line keeps the time for savedInTheTickOf)" },
    collectCountryCatalogByRoots:   { n: 2, disk: true,  token: true, why: "the saved country catalogue: Nova's writes ride beside its fingerprint" },
    "route /api/ideas/catalog":     { n: 1, disk: true,  why: "the saved idea catalogue: the idea writers call clearIdeasCatalogCache, which deletes the saved copies as well as the one in memory" },
    collectAllTechnologies:         { n: 1, disk: true,  token: true, why: "the saved research catalogue (fingerprintDirs): Nova's writes ride beside it" },
    collectAllEquipments:           { n: 1, disk: true,  token: true, why: "the saved equipment catalogue (fingerprintDirs): Nova's writes ride beside it" },
    modFolderCandidateGroups:       { n: 1, disk: false, why: "a FOLDER's time, whose answer (which folders hold mods) a rewrite does not change; kept 1.5 s at most" },
    getBuildingIconCacheKey:        { n: 1, disk: false, why: BUILDER },
    resolveBuildingIconByType:      { n: 1, disk: false, why: "a building's icon, kept by its picture's stamp (getBuildingIconCacheKey): the answer is the picture's path, not its bytes; kept 5 minutes at most" },
    "route /api/buildings/icon-file": { n: 1, disk: false, why: "a picture that would not convert, remembered by its stamp for a minute at most; " + ICONS },
    savedInTheTickOf:               { n: 1, disk: false, why: "not a cache: the time a saved answer was saved at, read to distrust it at a start with no writes to compare" },
    collectHoi4Diagnostics:         { n: 1, disk: false, why: "not a cache: picks the newest crash folder" },
    pruneIconCache:                 { n: 1, disk: false, why: "not a cache: deletes the oldest converted pictures" },
    "route /api/load":              { n: 1, disk: false, why: "not a cache: is the editor's recovery snapshot a second newer than the file?" },
  },
  "safe-write.js": {
    pruneBackups:                   { n: 2, disk: false, why: "not a cache: keeps the newest backups" },
    // #a-copy-of-a-file-nobody-changed-is-no-change (4eb1ef49): a Save's first copy keeps the file's stat as it was taken (`before`)
    _statOf:                        { n: 1, disk: false, why: "not a cache: the stat a Save's first copy of a file was taken at, kept only to tell whether the file moved since" },
    _firstCopyIsOfAChange:          { n: 1, disk: false, why: "not a cache: a stat that moved says the file changed; one that has not is never trusted — the file is then compared byte for byte with its first copy, so a write of Nova's in the same tick cannot be missed" },
  },
};

// ── the modules: every root .js the app ships (package.json build.files) ───────────────────────────────────────────
const shipped = require("./package.json").build.files.filter((f) => /^[^/*]+\.js$/.test(f));
ok(shipped.includes("server.js") && shipped.includes("map-data.js") && shipped.includes("safe-write.js"), `(the shipped modules, from build.files: ${shipped.length})`, shipped);

/** A module's source, read once: comments masked (code), literals masked too (lits, for braces), the declared functions and routes
 *  (bodies: what a stamp line is put down to), every function body of any kind (scopes: whose `return` a return is), its lines. */
function parse(src) {
  const code = maskJsComments(src), lits = maskJsLiterals(src);
  const bodies = [], scopes = [];
  const decl = /\bfunction\s*\*?\s*([A-Za-z_$][\w$]*)\s*\(|\bapp\.(?:get|post|put|patch|delete|use)\(\s*(["'`])([^"'`]*)\2/g;
  for (let m; (m = decl.exec(code));) {
    const b = jsBodyAt(lits, m.index);
    if (b) { bodies.push({ name: m[1] || "route " + m[3], open: b[0], close: b[1] }); scopes.push({ open: b[0], close: b[1] }); }
  }
  for (const m of lits.matchAll(/\bfunction\s*\*?\s*\(|=>\s*\{/g)) { const b = jsBodyAt(lits, m.index); if (b) scopes.push({ open: b[0], close: b[1] }); }
  const lines = code.split("\n"), starts = [];
  for (let i = 0, off = 0; i < lines.length; i++) { starts.push(off); off += lines[i].length + 1; }
  return { code, lits, bodies, scopes, lines, starts };
}
const innermost = (list, pos) => { let s = null; for (const b of list) if (b.open < pos && pos < b.close && (!s || b.open > s.open)) s = b; return s; };
const callOf = (names) => new RegExp("(?<!function\\s+)\\b(?:" + names.join("|") + ")\\(");

/** Every code line reading a .mtimeMs or calling a builder: { line, pos, fn, via, saved, counted, how, text } — fn is the innermost
 *  function declaration or route around it, `via` the builder called there, `saved` a call of a builder in `saved`, never counted. */
function stampLines(P, builders, saved) {
  const call = builders.length ? callOf(builders) : null, savedCall = saved.length ? callOf(saved) : null;
  const out = [];
  for (let i = 0; i < P.lines.length; i++) {
    const L = P.lines[i], a = L.search(/\.mtimeMs\b/), c = call ? L.search(call) : -1;
    if (a < 0 && c < 0) continue;
    const at = a < 0 ? c : c < 0 ? a : Math.min(a, c);
    const via = c < 0 ? "" : builders.find((b) => callOf([b]).test(L));
    const isSaved = !!(savedCall && savedCall.test(L));
    const pos = P.starts[i] + at, fn = innermost(P.bodies, pos);
    const body = fn ? P.code.slice(fn.open, fn.close) : "";
    const onLine = /novaWritesTo\(/.test(L);
    const nextLine = /novaWritesTo\(/.test(P.lines[i + 1] || "");
    const viaGen = /\bgen\b/.test(L) && /\bgen\s*=\s*(?:safeWrite\.)?novaWritesTo\(/.test(body);
    const counted = !isSaved && (onLine || nextLine || viaGen);
    out.push({ line: i + 1, pos, fn: fn ? fn.name : "(module scope)", fnAt: fn, body, via, saved: isSaved, counted, how: !counted ? "" : onLine ? "line" : nextLine ? "next" : "gen", text: L.trim().slice(0, 140) });
  }
  return out;
}

/** Does `fn` GIVE BACK the stamp one of `rows` builds? A `return` of its own (not a nested function's, and not an object built
 *  around it: that is an answer, not the stamp) that holds the stamp line, or names what that line fills — a push into it, an
 *  assignment to it — or a hash of that. A return that only COMPARES it (savedInTheTickOf's `t === at`) gives back a yes or no. */
const CMP = "(?:===|!==|==|!=|<=|>=|<|>)";
function givesBack(P, fn, rows) {
  const esc = (v) => v.replace(/\$/g, "\\$");
  const name = (v, flags) => new RegExp("(?<![\\w$.])" + esc(v) + "(?![\\w$])", flags);
  const given = (v, ret) => (ret.match(name(v, "g")) || []).length
    > (ret.match(new RegExp(`(?<![=!<>])${CMP}\\s*${esc(v)}(?![\\w$])|(?<![\\w$.])${esc(v)}\\s*${CMP}(?![=>])`, "g")) || []).length;
  // (what the stamp flows into: before it on its line, in the same statement — `const m = memo.get(d); return m && …` fills
  // nothing with the stamp)
  const fills = new Set();
  for (const r of rows) {
    const L = P.lines[r.line - 1], col = r.pos - P.starts[r.line - 1];
    const into = (m) => m.index < col && !L.slice(m.index + m[0].length, col).includes(";");
    for (const m of L.matchAll(/([A-Za-z_$][\w$]*)\s*\.\s*(?:push|unshift)\(/g)) if (into(m)) fills.add(m[1]);
    for (const m of L.matchAll(/([A-Za-z_$][\w$]*)\s*\+?=(?![=>])/g)) if (into(m)) fills.add(m[1]);
  }
  for (const m of P.code.slice(fn.open, fn.close).matchAll(/([A-Za-z_$][\w$]*)\s*=\s*crypto\.createHash\([^;]*?\.update\(([^;]*?)\)/g)) {
    if ([...fills].some((v) => name(v).test(m[2]))) fills.add(m[1]);
  }
  for (const m of P.lits.slice(fn.open, fn.close).matchAll(/\breturn\b/g)) {
    const s = fn.open + m.index, own = innermost(P.scopes, s);
    if (!own || own.open !== fn.open) continue;
    let d = 0, e = s;
    for (; e < fn.close; e++) { const c = P.lits[e]; if ("([{".includes(c)) d++; else if (")]}".includes(c)) { if (--d < 0) break; } else if (c === ";" && d === 0) break; }
    const ret = P.code.slice(s, e), compares = new RegExp(`(?<![=!<>])${CMP}(?![=>])`).test(P.lits.slice(s, e));
    if (/^return\s*\{/.test(ret)) continue;
    if ((!compares && rows.some((r) => r.pos > s && r.pos < e)) || [...fills].some((v) => given(v, ret.slice(6)))) return true;
  }
  return false;
}

/** The module's builders: every declared function that gives back an uncounted stamp line of its own — taken to a fixed point,
 *  since the call of a builder is a stamp line too. */
function buildersIn(P, saved) {
  let names = [];
  for (let round = 0; round < 10; round++) {
    const byFn = new Map();
    for (const r of stampLines(P, names, saved.filter((s) => names.includes(s)))) {
      if (!r.counted && r.fnAt && !r.fn.startsWith("route ")) byFn.set(r.fnAt, (byFn.get(r.fnAt) || []).concat(r));
    }
    const found = [...byFn].filter(([fn, rs]) => givesBack(P, fn, rs)).map(([fn]) => fn.name).sort();
    if (found.join() === names.join()) break;
    names = found;
  }
  return names;
}

/** The whole check for one module's source: { problems, rows, builders, takers }. */
function judge(file, src, left = LEFT[file] || {}) {
  const P = parse(src);
  const savedNames = Object.keys(left).filter((k) => left[k].saved);
  const builders = buildersIn(P, savedNames);
  const rows = stampLines(P, builders, savedNames.filter((s) => builders.includes(s)));
  const problems = [];
  for (const s of savedNames) if (!builders.includes(s)) problems.push(`${file}: ${s} is named as a builder whose stamps are only ever saved, and gives back no stamp`);
  const leftBy = new Map();
  for (const r of rows) {
    if (r.counted) continue;
    if (!left[r.fn]) {
      problems.push(r.saved ? `${file}:${r.line} in ${r.fn} — a SAVED stamp (${r.via}) nobody named: keep Nova's writes beside it (novaWritesToken, \`token\`) or say why not: ${r.text}`
        : `${file}:${r.line} in ${r.fn} — a stamp without novaWritesTo${r.via ? ` (${r.via})` : ""}: ${r.text}`);
      continue;
    }
    leftBy.set(r.fn, (leftBy.get(r.fn) || []).concat(r));
  }
  for (const [fn, e] of Object.entries(left)) {
    const got = (leftBy.get(fn) || []).length;
    if (got !== e.n) problems.push(`${file}: ${fn} is listed with ${e.n} uncounted stamp line(s) and has ${got}${got ? "" : " — a stale entry"}`);
    const inFn = rows.filter((r) => r.fn === fn);
    if (!e.disk && inFn.some((r) => r.saved)) problems.push(`${file}:${inFn.find((r) => r.saved).line} ${fn} builds a saved stamp (${inFn.find((r) => r.saved).via}) and is named as kept in memory only`);
    if (e.disk && inFn.length && /novaWritesTo\(/.test(inFn[0].body)) problems.push(`${file}:${inFn[0].line} ${fn} saves its stamp to disk and calls novaWritesTo`);
    // a token kept beside the saved stamp: taken once, held by the answer in memory and by the one taken back from disk, and saved
    // with the answer (without it, nothing saved after a write of Nova's is ever taken back in that process)
    if (e.token && inFn.length) {
      const b = inFn[0].body, n = (re) => (b.match(re) || []).length;
      const took = n(/\bconst writes = novaWritesToken\(/g), held = n(/\.writes === writes\b/g), back = n(/\(!writes \|\| cachedData\.writes === writes\)/g), kept = n(/JSON\.stringify\(\{[^}]*\bwrites\b/g);
      if (took !== 1 || held !== 2 || back !== 1 || kept !== 1) problems.push(`${file}:${inFn[0].line} ${fn} must keep Nova's writes beside its saved stamp — novaWritesToken taken ${took}x (1), compared ${held}x (2: memory and disk), on the disk answer ${back}x (1), saved with it ${kept}x (1)`);
    }
  }
  // …and every function keeping that token beside a saved answer asks, before taking one back, whether it was saved in the tick
  // of its files' last write: the next launch has no token to compare
  const takers = new Map();
  for (const m of P.code.matchAll(/(?<!function\s+)\bnovaWritesToken\(/g)) { const f = innermost(P.bodies, m.index); if (f) takers.set(f, 0); }
  for (const m of P.code.matchAll(/(?<!function\s+)\bsavedInTheTickOf\(/g)) { const f = innermost(P.bodies, m.index); if (takers.has(f)) takers.set(f, takers.get(f) + 1); }
  const lineAt = (pos) => P.code.slice(0, pos).split("\n").length;
  for (const [f, k] of takers) {
    if (k !== 1) problems.push(`${file}:${lineAt(f.open)} ${f.name} keeps Nova's writes beside a saved answer (novaWritesToken), which the next launch has none of: it must ask savedInTheTickOf before taking one back — ${k}x (1)`);
  }
  return { problems, rows, builders, takers: [...takers.keys()].map((f) => f.name), P };
}

console.log("\n-- every stamp in a shipped module --");
const results = {};
for (const file of shipped) {
  const src = fs.readFileSync(path.join(__dirname, file), "utf8");
  const r = judge(file, src);
  results[file] = Object.assign({ src }, r);
  if (!r.rows.length && !LEFT[file] && !r.takers.length) continue;
  const counted = r.rows.filter((x) => x.counted);
  const by = (h) => counted.filter((x) => x.how === h).length;
  ok(r.problems.length === 0, `⭐⭐ ${file}: ${r.rows.length} stamp line(s), ${counted.length} counting Nova's writes (${by("line")} on the line, ${by("next")} on the next, ${by("gen")} through a gen), ${r.rows.length - counted.length} named here${r.builders.length ? `; builders: ${r.builders.join(", ")}` : ""}`, r.problems);
}
for (const file of Object.keys(LEFT)) ok(shipped.includes(file), `(${file}, named in the list, is a shipped module)`);

// the scan is not blind: the stamps the fix is for are found, in the functions they are in, and counted
console.log("\n-- the scan sees the stamps it is for --");
const has = (file, fn, how) => results[file].rows.some((r) => r.fn === fn && r.counted && (!how || r.how === how));
ok(has("map-data.js", "stableRootStamp", "line"), "⭐ map-data.js stableRootStamp — the stamp test-a-renamed-state-keeps-its-regions-name.js failed on — counts on its line");
ok(has("map-data.js", "provincePixelLookup", "next"), "(map-data.js provincePixelLookup counts on the next line)");
ok(has("server.js", "getModReplacePaths", "line") && has("server.js", "getCountryLocNames", "line"), "(server.js getModReplacePaths and getCountryLocNames count on the line)");
ok(has("server.js", "route /api/events/list", "gen") && has("server.js", "walk", "gen"), "(server.js: the events list and the localisation key walk count through a gen)");
// …the builders are found by what they return — the four the reviews named among them — and every call of each is a row of its own
const sv = results["server.js"];
ok(["fileFingerprintPart", "fingerprintDirs", "dirMtimeMs", "modIndexFingerprint"].every((b) => sv.builders.includes(b)), `⭐⭐ the stamp builders in server.js, derived from what they give back (${sv.builders.length}): ${sv.builders.join(", ")}`, sv.builders);
const masked = maskJsComments(sv.src);
const callsBy = sv.builders.map((b) => {
  const rows = sv.rows.filter((r) => r.via === b), all = (masked.match(new RegExp("(?<!function\\s+)\\b" + b + "\\(", "g")) || []).length;
  return { b, all, rows: rows.length, saved: rows.filter((r) => r.saved).length, counted: rows.filter((r) => r.counted).length, callers: [...new Set(rows.map((r) => r.fn))] };
});
ok(callsBy.every((c) => c.rows === c.all) && callsBy.filter((c) => ["fileFingerprintPart", "fingerprintDirs", "dirMtimeMs", "modIndexFingerprint"].includes(c.b)).every((c) => c.all > 0), `⭐⭐ every call of a builder is judged as a stamp line of its own: ${callsBy.map((c) => `${c.b} ${c.all}x (${c.callers.join(", ")})`).join("; ")}`, callsBy);
const fp = callsBy.find((c) => c.b === "fileFingerprintPart") || {};
ok(fp.saved === fp.all && fp.counted === 0, `⭐ …each of fileFingerprintPart's ${fp.all} as a SAVED stamp, never counted`, fp);
ok(sv.rows.some((r) => r.via === "fileFingerprintPart" && r.fn === "collectStateCatalogByRoots"), "⭐ …the saved state catalogue among them, which a scan for `.mtimeMs` and fingerprintDirs never saw");
ok(["dirMtimeMs", "modIndexFingerprint"].every((b) => (callsBy.find((c) => c.b === b) || { callers: [] }).callers.length > 0), "⭐ …and the callers of dirMtimeMs and modIndexFingerprint, which their own entries used to stand for", callsBy.filter((c) => c.b === "dirMtimeMs" || c.b === "modIndexFingerprint"));
const allRows = Object.values(results).flatMap((r) => r.rows);
ok(allRows.filter((r) => r.fn === "(module scope)").length === 0, "(every stamp line was placed in a function or a route)", allRows.filter((r) => r.fn === "(module scope)").map((r) => r.line));
ok(!allRows.some((r) => r.fn === "createApp"), "(no stamp line was put down to createApp itself — the scan finds the function inside it)", allRows.filter((r) => r.fn === "createApp").map((r) => r.line));
// …and every function keeping Nova's writes beside a saved answer was found, the saved catalogues among them
const tokenNamed = Object.entries(LEFT["server.js"]).filter(([, e]) => e.token).map(([k]) => k);
ok(tokenNamed.every((k) => sv.takers.includes(k)) && sv.takers.includes("getLocalizationMap") && sv.takers.includes("warmCaches"), `⭐ every function keeping Nova's writes beside a saved answer asks savedInTheTickOf (${sv.takers.length}, derived): ${sv.takers.join(", ")}`, sv.takers);

// controls: the same judge, on the same source with one count taken out, must say so — exactly one problem more than it
// finds in the source as it is (so each control still means the same when the source itself is failing)
console.log("\n-- controls --");
const md = results["map-data.js"].src, svs = sv.src;
const baseline = { "map-data.js": results["map-data.js"].problems, "server.js": sv.problems };
// an anchor that does not match exactly once is a failed control, not a pass or a throw: the one problem that says so
const without = (src, from, to) => { const n = src.split(from).length - 1; return n === 1 ? src.split(from).join(to) : { unmatched: `the control's anchor matched ${n}x: ${from}` }; };
const added = (file, src) => (typeof src !== "string" ? [src.unmatched] : judge(file, src).problems.filter((x) => !baseline[file].includes(x)));
let p = added("map-data.js", without(md, "${s.ino}:${novaWritesTo(p)}`); } catch (_) { parts.push(\"-\"); }", "${s.ino}`); } catch (_) { parts.push(\"-\"); }"));
ok(p.length === 2 && /in stableRootStamp — a stamp without novaWritesTo/.test(p[0]) && /in forgetStableRootIfChanged — a stamp without novaWritesTo \(stableRootStamp\)/.test(p[1]),
  "control: stableRootStamp without its count is caught, and named — and its caller with it, since what it gives back is then a stamp with no count", p);
p = added("map-data.js", without(md, "  key += \"|\" + novaWritesTo(bmpPath) + \"|\" + novaWritesTo(defPath);", "  key += \"|\";"));
ok(p.length === 1 && /in provincePixelLookup — a stamp without novaWritesTo/.test(p[0]), "control: provincePixelLookup without its next-line count is caught", p);
p = added("server.js", without(svs, "const gen = safeWrite.novaWritesTo(p);", "const gen = 0;"));
ok(p.length === 2 && p.every((x) => /in walk — a stamp without novaWritesTo/.test(x)), "control: a gen that is not taken from novaWritesTo does not count (both of walk's lines)", p);
p = added("server.js", without(svs, "+ dirs.map((d) => safeWrite.novaWritesTo(d)).join(\",\");", ";"));
ok(p.length === 1 && /in scanAllCountryVariants — a stamp without novaWritesTo \(fingerprintDirs\)/.test(p[0]), "control: a fingerprintDirs caller without its count is caught", p);
p = added("server.js", without(svs, "return `${file}:${stats.size}:${stats.mtimeMs}`;", "return `${file}:${stats.size}:${stats.mtimeMs}:${safeWrite.novaWritesTo(file)}`;"));
ok(p.some((x) => /fileFingerprintPart saves its stamp to disk and calls novaWritesTo/.test(x)), "control: a saved fingerprint that takes the count is caught", p);
p = added("server.js", svs + "\nfunction freshlyCached(f) { return fs.statSync(f).mtimeMs; }\n");
ok(p.length === 1 && /in freshlyCached — a stamp without novaWritesTo/.test(p[0]), "control: a new stamp nobody listed is caught, and named", p);
p = added("server.js", without(svs, "t = fs.statSync(path.join(crashesDir, d.name)).mtimeMs;", "t = 0;"));
ok(p.length === 1 && /collectHoi4Diagnostics is listed with 1 uncounted stamp line\(s\) and has 0 — a stale entry/.test(p[0]), "control: a listed stamp that is gone makes its entry stale", p);
p = added("server.js", without(svs, "Array.isArray(cachedData.result) && (!writes || cachedData.writes === writes)", "Array.isArray(cachedData.result)"));
ok(p.length === 1 && /collectAllTechnologies must keep Nova's writes beside its saved stamp/.test(p[0]), "control: a saved catalogue that takes its disk answer back without the token is caught (research)", p);
p = added("server.js", without(svs, "cachedData.result !== null && (!writes || cachedData.writes === writes)", "cachedData.result !== null"));
ok(p.length === 1 && /collectAllEquipments must keep Nova's writes beside its saved stamp/.test(p[0]), "control: …(equipment)", p);
p = added("server.js", without(svs, "cached.fingerprint === currentFingerprint && cached.writes === writes && now - cached.timestamp < 3600000", "cached.fingerprint === currentFingerprint && now - cached.timestamp < 3600000"));
ok(p.length === 1 && /collectCountryCatalogByRoots must keep Nova's writes beside its saved stamp/.test(p[0]), "control: …and one that keeps its answer in memory without it (country)", p);
p = added("server.js", without(svs, "cached.fingerprint === currentFingerprint && cached.writes === writes && now - cached.timestamp < 300000)", "cached.fingerprint === currentFingerprint && now - cached.timestamp < 300000)"));
ok(p.length === 1 && /collectStateCatalogByRoots must keep Nova's writes beside its saved stamp/.test(p[0]), "control: …(the state catalogue, in memory)", p);
p = added("server.js", without(svs, "stateCatalogCodeStamp() && Array.isArray(cachedData.catalog) && (!writes || cachedData.writes === writes)", "stateCatalogCodeStamp() && Array.isArray(cachedData.catalog)"));
ok(p.length === 1 && /collectStateCatalogByRoots must keep Nova's writes beside its saved stamp/.test(p[0]), "control: …(the state catalogue, taken back from disk)", p);
// (a line break inside the anchor: matched on either line ending, since a checkout is CRLF and a copy written since may not be;
// and the line is emptied, not removed, so every problem below it keeps its line number and stays in the baseline)
const savedWrites = /(code: stateCatalogCodeStamp\(\),\r?\n[ \t]*)writes,/g, savedWritesAt = (svs.match(savedWrites) || []).length;
p = added("server.js", savedWritesAt === 1 ? svs.replace(savedWrites, (m, a) => a) : { unmatched: `the control's anchor matched ${savedWritesAt}x: ${savedWrites}` });
ok(p.length === 1 && /collectStateCatalogByRoots must keep Nova's writes beside its saved stamp — .* saved with it 0x \(1\)/.test(p[0]), "control: …(the state catalogue, saved without them)", p);
p = added("server.js", svs + "\nfunction freshlySaved(f) { return fileFingerprintPart(f, fs.statSync(f)); }\n");
ok(p.length === 1 && /in freshlySaved — a SAVED stamp \(fileFingerprintPart\) nobody named/.test(p[0]), "⭐ control: a new saved stamp built on fileFingerprintPart, which has no `.mtimeMs` of its own, is caught, and named", p);
p = added("server.js", svs + "\nfunction freshlySavedWithCount(f) { return fileFingerprintPart(f, fs.statSync(f)) + safeWrite.novaWritesTo(f); }\n");
ok(p.length === 1 && /in freshlySavedWithCount — a SAVED stamp \(fileFingerprintPart\) nobody named/.test(p[0]), "control: …and one with the count on its line does not pass as counting: the count must not be inside a saved stamp", p);
p = judge("server.js", svs, Object.assign({}, LEFT["server.js"], { collectStateCatalogByRoots: Object.assign({}, LEFT["server.js"].collectStateCatalogByRoots, { disk: false, token: false }) })).problems.filter((x) => !baseline["server.js"].includes(x));
ok(p.length === 1 && /collectStateCatalogByRoots builds a saved stamp \(fileFingerprintPart\) and is named as kept in memory only/.test(p[0]), "control: a caller of fileFingerprintPart named as kept in memory only is caught", p);
// ⭐ …a memo keyed on ANY builder, by a function nobody named, is caught — one control per builder, as derived (review of the fix
// round: one keyed on dirMtimeMs or modIndexFingerprint passed)
for (const b of sv.builders) {
  p = added("server.js", svs + `\nfunction freshMemoOn_${b}(d) {\n  const m = _freshMemo.get(d);\n  if (m && m.at === ${b}(d)) return m.v;\n  return null;\n}\n`);
  const saved = !!(LEFT["server.js"][b] || {}).saved;
  ok(p.length === 1 && new RegExp(`in freshMemoOn_${b} — a ${saved ? "SAVED stamp" : "stamp without novaWritesTo"} \\(${b}\\)`).test(p[0]), `⭐ control: a memo keyed on ${b}, a builder, is caught where it is made`, p);
}
// …and a function that gives back a stamp it builds becomes a builder, whose own callers are then judged: a new one, handed on by
// a second that gives back what the first gave it, and kept by a third
p = added("server.js", svs + "\nfunction freshStampOf(f) {\n  const parts = [];\n  parts.push(fs.statSync(f).mtimeMs);\n  return parts.join(\"|\");\n}\nfunction freshWrapOf(f) { return freshStampOf(f) + \"|v2\"; }\nfunction freshlyKeptBy(f) { return _kept.get(f) === freshWrapOf(f); }\n");
ok(p.length === 3 && p.some((x) => /in freshStampOf — a stamp without novaWritesTo/.test(x)) && p.some((x) => /in freshWrapOf — a stamp without novaWritesTo \(freshStampOf\)/.test(x)) && p.some((x) => /in freshlyKeptBy — a stamp without novaWritesTo \(freshWrapOf\)/.test(x)),
  "⭐ control: a new builder is derived from what it gives back, so is one handing its stamp on, and the caller of that is caught", p);
// …and one that only hands the stamp on inside an object (an answer: the path of a converted picture) is not a builder
p = added("server.js", svs + "\nfunction freshAnswerOf(f) {\n  const at = fs.statSync(f).mtimeMs;\n  return { ok: true, at };\n}\nfunction freshlyAsked(f) { return freshAnswerOf(f).ok; }\n");
ok(p.length === 1 && /in freshAnswerOf — a stamp without novaWritesTo/.test(p[0]), "control: …and one that hands the stamp on inside an object is not, so its callers are not rows", p);
// …one that gives back a name it assigned its stamp to is one
p = added("server.js", svs + "\nfunction freshTimeOf(f) {\n  const at = fs.statSync(f).mtimeMs;\n  return at;\n}\nfunction freshlyTimed(f) { return _seen.get(f) || freshTimeOf(f); }\n");
ok(p.length === 2 && p.some((x) => /in freshlyTimed — a stamp without novaWritesTo \(freshTimeOf\)/.test(x)), "control: …one that gives back a name it assigned its stamp to is a builder", p);
// …and one whose line fills a name before the stamp, in another statement, is not: the review's own memo, on one line
p = added("server.js", svs + "\nfunction freshOneLineMemo(d) { const m = _freshMemo.get(d); return m && m.at === dirMtimeMs(d) ? m.v : null; }\nfunction freshlyMemoised(d) { return freshOneLineMemo(d) || 0; }\n");
ok(p.length === 1 && /in freshOneLineMemo — a stamp without novaWritesTo \(dirMtimeMs\)/.test(p[0]), "⭐ control: the review's one-line memo keyed on dirMtimeMs is caught — and is not taken for a builder", p);
// …one that gives back a HASH of its stamp is one (getDdsCacheFilePath names its picture so)
p = added("server.js", svs + "\nfunction freshHashOf(f) {\n  const s = `${f}:${fs.statSync(f).mtimeMs}`;\n  const h = crypto.createHash(\"sha1\").update(s).digest(\"hex\");\n  return path.join(ICON_CACHE_DIR, `${h}.png`);\n}\nfunction freshlyHashed(f) { return fs.existsSync(freshHashOf(f)); }\n");
ok(p.length === 2 && p.some((x) => /in freshlyHashed — a stamp without novaWritesTo \(freshHashOf\)/.test(x)), "control: …one that gives back a hash of its stamp is a builder too", p);
// …a stamp a callback inside a function gives back is the callback's, not the function's
p = added("server.js", svs + "\nfunction freshTimesOf(files) {\n  const n = files.map((f) => {\n    return fs.statSync(f).mtimeMs;\n  }).length;\n  return n;\n}\nfunction freshlyCounted(files) { return freshTimesOf(files) + 1; }\n");
ok(p.length === 1 && /in freshTimesOf — a stamp without novaWritesTo/.test(p[0]), "control: …a stamp a callback inside a function gives back does not make the function a builder", p);
// …and a return that only compares the stamp, or a name it fills, gives back a yes or no (savedInTheTickOf), not the stamp
p = added("server.js", svs + "\nfunction freshSame(f, t) {\n  const at = fs.statSync(f).mtimeMs;\n  return t === at;\n}\nfunction freshlyCompared(f) { return freshSame(f, 1); }\n");
ok(p.length === 1 && /in freshSame — a stamp without novaWritesTo/.test(p[0]), "control: …and one that only compares a name its stamp line fills is not a builder either", p);
p = added("server.js", svs + "\nfunction freshSameNow(f, t) {\n  return t === fs.statSync(f).mtimeMs;\n}\nfunction freshlyComparedNow(f) { return freshSameNow(f, 1); }\n");
ok(p.length === 1 && /in freshSameNow — a stamp without novaWritesTo/.test(p[0]), "control: …nor one that compares the stamp where it reads it", p);
// ⭐ …and every function keeping Nova's writes beside a saved answer that stops asking savedInTheTickOf is caught — one control
// per such function, as derived (the name is changed in place, at the same length, so every line keeps its number)
for (const t of sv.takers) {
  const f = sv.P.bodies.find((b) => b.name === t), at = f ? sv.P.code.indexOf("savedInTheTickOf(", f.open) : -1;
  const src2 = f && at > f.open && at < f.close ? svs.slice(0, at) + "savedInTheTickOX(" + svs.slice(at + "savedInTheTickOf(".length) : { unmatched: `no savedInTheTickOf( in ${t}` };
  p = added("server.js", src2);
  ok(p.length === 1 && new RegExp(`${t} keeps Nova's writes beside a saved answer \\(novaWritesToken\\), which the next launch has none of: it must ask savedInTheTickOf before taking one back — 0x \\(1\\)`).test(p[0]), `⭐ control: ${t}, keeping Nova's writes beside a saved answer, is caught when it stops asking savedInTheTickOf`, p);
}

console.log(`\n${fail ? "FAILED" : "PASSED"} ${pass}/${pass + fail}`);
process.exit(fail ? 1 : 0);
