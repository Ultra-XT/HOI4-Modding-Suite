// ⛔ #a-harbour-keeps-facing-its-sea — EVERY WRITE THAT CAN MOVE A COAST KEEPS THE HARBOURS ON IT FACING THE SEA (derived guard).
//
// A port, dockyard, fort, naval hub or HQ in map/buildings.txt, and a port's ship-in-port rows in map/unitstacks.txt, face the sea
// beside them (coastFacing). Any write to map/provinces.bmp or map/definition.csv can change which side of a coast pixel is water —
// the paint, the Type dropdown, the erase, the inland seas Auto-fix fills, Generate land, an X-crossing repaint — and before
// keepCoastRowsFacingTheirSea existed not one of them turned a row: one stroke of land 6 px out over the sea in front of a base-game
// port left 10 of the 16 coast rows beside it with their water side on the new land (e-design-probe.js, 2026-10-13).
// test-an-edit-keeps-the-harbours-facing-their-sea.js pins what the keep does on each edit; THIS file pins that the next writer
// cannot forget it. Nothing here is a typed list of writers:
//   1. the writers are DERIVED: every function of every root source module that hands safeModWrite (or fs.writeFileSync /
//      renameSync) a path that names "provinces.bmp" or "definition.csv" — written in the call (path.join(modRoot, "map",
//      "definition.csv")) or through a name built from one (modCsv, files.def) — or that calls such a writer that does not keep
//      (writeProvincesRaster, the raster primitive). The detector is run on synthetic bodies of each shape first: a shape it cannot
//      see turns this file red, instead of quietly shrinking the list (review E-R5: an inline path.join was invisible to it);
//   2. each one calls keepCoastRowsFacingTheirSea (or returnCoastRowsToTheirSea, the one writer of a coast row's rotation), or is
//      kept by EVERY caller (each calls it before a keep of its own — the province split Generate land calls before its keep, review
//      E-R9), or is EXEMPT below with the reason no coast can move — and an exemption that outlives its reason fails;
//   3. setProvinceDefinition keeps only when a province changed SIDE, and a caller that turns that off (keepCoast: false)
//      keeps once itself, after its loop;
//   4. what the keep did reaches the page (coastRowsNote) — the second pass of an Auto-fix fixer that keeps included (review E-R8);
//   5. each keep stands after its edit's own writes of the bitmap and the definition, and after the ports facing a drowned sea have
//      gone; Generate land's is told the whole of the land the click raised (raisedByThisClick, the province split's pieces among it).
// Not followed: a path read off a directory listing — restoreMapBaseline swaps map/ whole, buildings.txt and unitstacks.txt with it.
"use strict";

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { maskJsComments, maskJsLiterals, jsBodyAt } = require("./testlib-strip-comments.js");

let pass = 0, fail = 0;
const ok = (c, m, x) => {
  if (c) { pass++; console.log("  ok   " + m); }
  else { fail++; console.log("  FAIL " + m + (x !== undefined ? "   -> " + JSON.stringify(x).slice(0, 600) : "")); }
};

/** Every top-level `function name(` of a source text: { name, file, body (comments masked, strings kept), lit (strings masked too,
 *  same length), line }. A function that holds the routes (server.js's createApp: one body of 30,000 lines, where two unrelated `p`s
 *  meet) is not one unit: each route handler and each function declared inside it is, instead. */
function functionsOfSource(src, file) {
  const code = maskJsComments(src), lit = maskJsLiterals(src);
  const out = [];
  const unit = (name, at) => { const b = jsBodyAt(lit, at); if (b) out.push({ name, file, at, end: b[1], body: code.slice(b[0], b[1] + 1), lit: lit.slice(b[0], b[1] + 1), line: src.slice(0, at).split("\n").length }); return b; };
  const re = /(^|\n)(?:async\s+)?function\s+([A-Za-z0-9_$]+)\s*\(/g;
  let m;
  while ((m = re.exec(code))) {
    const at = m.index + m[1].length;
    const b = jsBodyAt(lit, at);
    if (!b) continue;
    const body = code.slice(b[0], b[1] + 1);
    if (!/\bapp\.(?:get|post|put|patch|delete)\(\s*["']\//.test(body)) { out.push({ name: m[2], file, at, end: b[1], body, lit: lit.slice(b[0], b[1] + 1), line: src.slice(0, at).split("\n").length }); continue; }
    const inner = code.slice(b[0], b[1] + 1);
    const routes = /\bapp\.(get|post|put|patch|delete)\(\s*["']([^"']+)["']/g, fns = /(?:^|\n)[ \t]+(?:async\s+)?function\s+([A-Za-z0-9_$]+)\s*\(/g;
    let r;
    while ((r = routes.exec(inner))) unit(`${r[1].toUpperCase()} ${r[2]}`, b[0] + r.index);
    while ((r = fns.exec(inner))) unit(r[1], b[0] + r.index + r[0].indexOf("function"));
  }
  return out;
}
const functionsOf = (file) => functionsOfSource(fs.readFileSync(path.join(__dirname, file), "utf8"), file);
const FILES = /["'`](?:[^"'`]*\/)?(provinces\.bmp|definition\.csv)["'`]/g;
const esc = (s) => s.replace(/\$/g, "\\$");
/** Where the expression that starts at `from` in `lit` (a maskJsLiterals text) ends: a top-level `,` or `;`, or the bracket round it. */
function exprEnd(lit, from) {
  let d = 0;
  for (let i = from; i < lit.length; i++) {
    const c = lit[i];
    if (c === "(" || c === "[" || c === "{") d++;
    else if (c === ")" || c === "]" || c === "}") { if (!d) return i; d--; }
    else if (!d && (c === "," || c === ";")) return i;
  }
  return lit.length;
}
/** The files the expression fn.body[from, to) names as a PATH: a path literal in it; else, when it is a name (`x`, `a.b`), what that
 *  name was built from (`x = …`, `a.b = …`, an object's `b: …`, `a = …`, `for (const x of …)`); else, when it is path.join(…) or
 *  path.resolve(…), what its last argument (the file's own name) names — each followed the same way. A name anywhere else in it (an
 *  id, a counter) is not followed: a function of a thousand lines assigns `id` and `name` in a dozen scopes. */
function filesNamed(fn, from, to, seen = new Set()) {
  const out = new Set();
  for (const m of fn.body.slice(from, to).matchAll(FILES)) out.add(m[1]);
  if (out.size) return out;
  const span = fn.lit.slice(from, to), lead = span.length - span.trimStart().length, text = span.trim();
  if (/^[A-Za-z_$][A-Za-z0-9_$]*(?:\s*\.\s*[A-Za-z_$][A-Za-z0-9_$]*)*$/.test(text)) {
    const parts = text.split(".").map((s) => s.trim()), key = parts.join(".");
    if (seen.has(key)) return out;
    seen.add(key);
    const follow = (p) => { let a; while ((a = p.exec(fn.lit))) { const s = a.index + a[0].length; for (const f of filesNamed(fn, s, exprEnd(fn.lit, s), seen)) out.add(f); } };
    follow(new RegExp("(?:^|[^A-Za-z0-9_$.])" + parts.map(esc).join("\\s*\\.\\s*") + "\\s*=(?!=)", "g"));
    follow(new RegExp("\\b(?:const|let|var)\\s+" + esc(parts[0]) + "\\s+(?:of|in)\\s+", "g"));
    if (parts.length > 1) follow(new RegExp("(?:^|[{,]\\s*)" + esc(parts[parts.length - 1]) + "\\s*:(?!:)", "g"));
    if (parts.length > 1 && !out.size) follow(new RegExp("(?:^|[^A-Za-z0-9_$.])" + esc(parts[0]) + "\\s*=(?!=)", "g"));   // the object, last
    return out;
  }
  const call = /^path\s*\.\s*(?:join|resolve)\s*\(/.exec(text);
  if (!call) return out;
  let s = from + lead + call[0].length, e = exprEnd(fn.lit, s);
  while (fn.lit[e] === ",") { s = e + 1; e = exprEnd(fn.lit, s); }   // on to the last argument
  return filesNamed(fn, s, e, seen);
}
/** Each write a function makes itself: [{ at, files }] — every safeModWrite / fs.writeFileSync / fs.renameSync, its WHOLE first
 *  argument read, whatever its shape. */
function writeCalls(fn) {
  const out = [], re = /(^|[^A-Za-z0-9_$.])(safeModWrite|fs\s*\.\s*writeFileSync|fs\s*\.\s*renameSync)\s*\(/g;
  let m;
  while ((m = re.exec(fn.lit))) { const open = m.index + m[0].length; out.push({ at: m.index + m[1].length, files: [...filesNamed(fn, open, exprEnd(fn.lit, open))] }); }
  return out.filter((w) => w.files.length);
}
const KEEPS = /(^|[^A-Za-z0-9_$.])(keepCoastRowsFacingTheirSea|returnCoastRowsToTheirSea)\(/;
/** Where `fn` calls the function `name` (bare, or as mapData.name): [index]. */
const callsTo = (fn, name) => { const re = new RegExp("(^|[^A-Za-z0-9_$])(?:[A-Za-z_$][A-Za-z0-9_$]*\\s*\\.\\s*)?" + esc(name) + "\\s*\\(", "g"); const at = []; let m; while ((m = re.exec(fn.body))) at.push(m.index + m[1].length); return at; };
/** The writers of a set of functions: each with `writes` [file, or "file (callee)"] and `sites` [{ file, at }] — its own writes, and
 *  every call to a writer of the set that does not keep and is not `exempt` (that writer's files, written by this call). */
function writersOf(fns, exempt) {
  const ws = new Map();   // fn → { files, writes (labels), sites, via }
  for (const fn of fns) {
    const own = writeCalls(fn);
    if (own.length) ws.set(fn, { files: new Set([].concat(...own.map((x) => x.files))), writes: new Set([].concat(...own.map((x) => x.files))), sites: [].concat(...own.map((x) => x.files.map((f) => ({ file: f, at: x.at })))), via: new Set() });
  }
  for (let grew = true; grew;) {
    grew = false;
    for (const [w, wd] of [...ws]) {
      if (KEEPS.test(w.body) || exempt[w.name]) continue;   // a writer that keeps (or moves no coast) passes nothing on to its callers
      for (const fn of fns) {
        if (fn.name === w.name) continue;
        const at = callsTo(fn, w.name);
        if (!at.length) continue;
        if (!ws.has(fn)) ws.set(fn, { files: new Set(), writes: new Set(), sites: [], via: new Set() });
        const d = ws.get(fn);
        for (const f of wd.files) {
          if (d.via.has(`${w.name}|${f}`)) continue;
          d.via.add(`${w.name}|${f}`); grew = true;
          d.files.add(f); d.writes.add(`${f} (${w.name})`); for (const a of at) d.sites.push({ file: f, at: a, via: w.name });
        }
      }
    }
  }
  return [...ws].map(([fn, d]) => ({ ...fn, writes: [...d.writes], sites: d.sites }));
}
/** Whether every caller of the writer `w` (a name) keeps after each of its calls to it — or is a writer kept by its own callers, or
 *  is `exempt` (name → [reason, check]) for a reason that still holds: no coast can move in it, so none moves in the call it makes
 *  (Delete map's fold-back writes provinces.bmp through writeProvincesRaster, sea pieces into a sea parent). */
function keptByCallers(fns, writers, name, seen = new Set(), exempt = {}) {
  const callers = fns.filter((f) => f.name !== name && callsTo(f, name).length);
  if (!callers.length || seen.has(name)) return false;
  return callers.every((c) => {
    if (exempt[c.name] && exempt[c.name][1]()) return true;
    const re = new RegExp(KEEPS.source, "g"); let m, k = -1; while ((m = re.exec(c.body))) k = m.index;
    if (k >= 0) return callsTo(c, name).every((a) => a < k);
    return writers.some((w) => w.name === c.name) && keptByCallers(fns, writers, c.name, new Set([...seen, name]), exempt);
  });
}

// ── 1. THE WRITERS, derived ──────────────────────────────────────────────────────────────────────────────────────────────────
console.log("=== 1. Every function that writes provinces.bmp or definition.csv, derived from the source ===");
// the detector first, on one synthetic body of each shape a write of the two files takes here — and on bodies it must NOT count. A
// shape it cannot see would otherwise only shrink the list of writers below, and every check after it would pass on less
{
  const SYN = functionsOfSource([
    'function inlinePath(m) { safeModWrite(path.join(m, "map", "definition.csv"), "x", "t"); }',
    'function keyedPath(m) { const files = { def: path.join(m, "map", "definition.csv"), bmp: path.join(m, "map", "provinces.bmp") };',
    '  safeModWrite(files.bmp, Buffer.alloc(0), "t"); }',
    'function namedPath(m) { const modCsv = path.join(m, "map",',
    '    "definition.csv");',
    '  fs.writeFileSync(modCsv, "x"); }',
    'function listedName(m) { for (const f of ["provinces.bmp"]) safeModWrite(path.join(m, "map", f), "x", "t"); }',
    'function noCoastFile(m) { const id = "definition.csv"; safeModWrite(path.join(m, "map", `${id}-1.txt`), id, "t"); safeModWrite(path.join(m, "map", "buildings.txt"), "x", "t"); }',
    'function cutPiece(m) { safeModWrite(path.join(m, "map", "definition.csv"), "x", "t"); }',
    'function keepsAfterIt(m) { cutPiece(m); keepCoastRowsFacingTheirSea({ modRoot: m }); }',
    'function cutLate(m) { safeModWrite(path.join(m, "map", "provinces.bmp"), "x", "t"); }',
    'function keepsBeforeIt(m) { keepCoastRowsFacingTheirSea({ modRoot: m }); cutLate(m); }',
    'function cutQuiet(m) { safeModWrite(path.join(m, "map", "provinces.bmp"), "x", "t"); }',
    'function noCoastMoves(m) { cutQuiet(m); }',
  ].join("\n"), "<synthetic>");
  const syn = writersOf(SYN, {}), w = (n) => (syn.find((x) => x.name === n) || { writes: [] }).writes.join();
  ok(w("inlinePath") === "definition.csv", "THE DETECTOR: a path written in the call — safeModWrite(path.join(…, \"definition.csv\"), …)", w("inlinePath"));
  ok(w("keyedPath") === "provinces.bmp", "THE DETECTOR: a path an object's key holds — safeModWrite(files.bmp, …) — and not its other key", w("keyedPath"));
  ok(w("namedPath") === "definition.csv", "THE DETECTOR: a path a name holds, built over two lines — fs.writeFileSync(modCsv, …)", w("namedPath"));
  ok(w("listedName") === "provinces.bmp", "THE DETECTOR: a file name a loop hands path.join", w("listedName"));
  ok(w("noCoastFile") === "", "THE DETECTOR: a name in a path that is not its file's own, and buildings.txt, are no write of the two", w("noCoastFile"));
  ok(w("keepsAfterIt") === "definition.csv (cutPiece)" && keptByCallers(SYN, syn, "cutPiece") && !keptByCallers(SYN, syn, "cutLate"),
    "THE DETECTOR: a writer called before its caller's keep is kept by it, and one called after it is not", { keepsAfterIt: w("keepsAfterIt") });
  ok(keptByCallers(SYN, syn, "cutQuiet", new Set(), { noCoastMoves: ["no coast can move", () => true] }) && !keptByCallers(SYN, syn, "cutQuiet")
    && !keptByCallers(SYN, syn, "cutQuiet", new Set(), { noCoastMoves: ["no coast can move", () => false] }),
    "THE DETECTOR: a writer called only by a caller exempt for a reason that still holds is kept — not without the exemption, nor with a stale one");
}
const tracked = execFileSync("git", ["ls-files", "*.js"], { cwd: __dirname, encoding: "utf8" }).split(/\r?\n/)
  .filter((f) => f && !f.includes("/") && !/^(test-|e2e-|testlib|run-)/.test(f));
const all = [].concat(...tracked.map(functionsOf));
const svc = maskJsComments(fs.readFileSync(path.join(__dirname, "server.js"), "utf8"));
const byName = (n) => all.find((f) => f.name === n);
// name → [reason, staleness check (true while the reason holds)]
const EXEMPT = {
  fixCoastalFlags: ["writes column 5 (coastal) of definition.csv only: no province changes type, so no pixel changes side",
    () => !/\.type\s*=(?!=)/.test(byName("fixCoastalFlags").body) && !/setProvinceDefinition\(/.test(byName("fixCoastalFlags").body)],
  fixCoastalNoPort: ["writes column 5 and NEW ports, each turned by coastFacing as it is written: no province changes type",
    () => !/\.type\s*=(?!=)/.test(byName("fixCoastalNoPort").body) && /coastFacing\(/.test(byName("fixCoastalNoPort").body)],
  fixDuplicateProvinceColors: ["gives a duplicated colour's second piece a fresh colour and id of the SAME type: no pixel changes side",
    () => !/\.type\s*=(?!=)/.test(byName("fixDuplicateProvinceColors").body)],
  // ⚠️ MOVED WITH 🌍 Generate a world: the blank itself is blankMapToSeaInto now, and blankMapToSea the wrapper that opens one backup
  // scope over the whole of it (blanked_maps/<stamp>). The exemption follows the blank; the wrapper needs none while it writes nothing
  // of its own (an exempt writer's callers are not counted as writers, and a write of its own would make it one)
  // (#a-re-roll-joins-back-the-cut: the retype is blankRetypeDefinitionText's now, the one 🌍 Generate a world's forecast of the fold reads)
  blankMapToSeaInto: ["every land province becomes sea (blankRetypeDefinitionText, the retype it writes): no coast is left for a row to face, and the blank empties the coast rows itself",
    () => /\bblankRetypeDefinitionText\(/.test(byName("blankMapToSeaInto").body) && /c\[4\]\s*===\s*["']land["']\)\s*\{\s*c\[4\]\s*=\s*["']sea["']/.test(byName("blankRetypeDefinitionText").body)],
  // #delete-map-gives-back-the-cut — the fold-back, at the end of Delete map: a family folds only when every row of it is sea, and a
  // piece's pixels become its parent's, sea into sea; it sets no type, and a building that faced a piece faces the parent after it
  foldRecordedProvinceSplits: ["folds only a family whose every row is sea, sea pieces into a sea parent: no pixel changes side, it sets no type, and a building facing a piece is re-homed to the parent",
    () => /\.type\s*!==\s*["']sea["']/.test(byName("provinceFoldPlan").body) && !/\.type\s*=(?!=)/.test(byName("foldRecordedProvinceSplits").body)
      && /buildings\.txt/.test(byName("foldRecordedProvinceSplits").body)],
  // 🌍 Generate a world's step 1 gives a mod the provinces.bmp it inherits, as the bytes the game already loads below it
  prepareModForNewWorld: ["copies the provinces.bmp the game already loads below the mod into it byte for byte: no pixel changes, so no province changes side",
    () => { const b = byName("prepareModForNewWorld").body; return /safeModWrite\(\s*dst\s*,\s*readBytesWithRetry\(\s*bmp\.src\s*\)/.test(b) && (b.match(/provinces\.bmp/g) || []).length >= 1 && !/writeProvincesRaster\(|setProvinceDefinition\(/.test(b); }],
  // #the-terrain-brush-paints-its-towns-in-one-write — the Terrain brush's Save, a run of terrain-only rows in one write of definition.csv
  setProvinceTerrains: ["edits the terrain column of each row, and a land row's continent of 0 made 1, and nothing else: no province changes type, so no pixel changes side",
    () => { const b = byName("setProvinceTerrains").body; const opts = [...b.matchAll(/editDefinitionCsv\([^{)]*\{([^}]*)\}/g)].map((m) => m[1].split(",").map((kv) => kv.split(":")[0].trim()).filter(Boolean));
      return opts.length >= 2 && opts.every((keys) => keys.every((k) => k === "terrain" || k === "continent")) && (b.match(/editDefinitionCsv\(/g) || []).length === opts.length && !/\.type\s*=(?!=)|\btype\s*:/.test(b) && !/setProvinceDefinition\(/.test(b); }],
  dragCountryShape: ["its route answers 400 before calling it (Move Country is disabled); re-enabling it must add the keep",
    () => { const r = svc.indexOf('"/api/map/drag-country"'), d = svc.indexOf("mapData.dragCountryShape(", r), x = svc.indexOf("return res.status(400)", r); return r >= 0 && x > r && (d < 0 || x < d); }],
};
const writers = writersOf(all, EXEMPT);
console.log("  " + writers.map((w) => `${w.file}:${w.name} (${w.writes.join(", ")})`).join("\n  "));
ok(tracked.includes("map-data.js") && tracked.includes("server.js"), "the root modules are read (git ls-files)", tracked.length);
ok(writers.some((w) => w.writes.includes("provinces.bmp")) && writers.some((w) => w.writes.includes("definition.csv")) && writers.some((w) => w.writes.includes("provinces.bmp (writeProvincesRaster)")),
  `the detector finds writes of both files, and the raster primitive's callers (${writers.length} writers)`, writers.map((w) => w.name));
const raster = writers.find((w) => w.name === "writeProvincesRaster");
ok(raster && raster.writes.join() === "provinces.bmp" && !KEEPS.test(raster.body), "writeProvincesRaster still writes provinces.bmp itself, and keeps nothing (so its CALLERS are the edits to keep)", raster && raster.writes);

// ── 2. EACH ONE KEEPS, OR SAYS WHY NO COAST CAN MOVE ─────────────────────────────────────────────────────────────────────────
console.log("\n=== 2. Each writer keeps the harbours facing their sea, is kept by every caller, or is exempt for a reason that still holds ===");
for (const w of writers) {
  if (KEEPS.test(w.body)) { ok(!EXEMPT[w.name], `${w.name} keeps the harbours facing their sea${EXEMPT[w.name] ? " — and its exemption is stale: remove it" : ""}`); continue; }
  const e = EXEMPT[w.name];
  if (e) { ok(e[1](), `${w.name} is exempt — "${e[0]}" — and that still holds`); continue; }
  const callers = all.filter((f) => f.name !== w.name && callsTo(f, w.name).length).map((f) => f.name), kept = keptByCallers(all, writers, w.name, new Set(), EXEMPT);
  ok(kept, kept ? `${w.name} is kept by every caller: ${callers.join(", ")} call${callers.length === 1 ? "s" : ""} it before a keep (${callers.length === 1 ? "its" : "their"} own, or that of the callers ${callers.length === 1 ? "it is" : "they are"} kept by)`
    : `${w.file}:${w.name} writes ${w.writes.join(" + ")} — it must call keepCoastRowsFacingTheirSea after its write, be called only before a keep of its caller's own (its callers: ${callers.join(", ") || "none"}), or be EXEMPT with the reason no coast can move`, w.line);
}
for (const n of Object.keys(EXEMPT)) ok(writers.some((w) => w.name === n), `the exemption for ${n} still names a writer (an entry that outlives its writer is stale)`);

// ── 3. THE TYPE DROPDOWN'S KEEP AND ITS BATCH CALLERS ────────────────────────────────────────────────────────────────────────
console.log("\n=== 3. setProvinceDefinition keeps when a province changes side; a caller that turns that off keeps itself ===");
{
  const spd = byName("setProvinceDefinition");
  const sig = (maskJsComments(fs.readFileSync(path.join(__dirname, "map-data.js"), "utf8")).match(/\nfunction setProvinceDefinition\([^)]*\)/) || [""])[0];
  ok(spd && /keepCoast\s*=\s*true/.test(sig), "setProvinceDefinition keeps by default (keepCoast = true)", sig);
  ok(spd && /keepCoast\s*&&\s*\(\s*wasType\s*===\s*["']sea["']\s*\)\s*!==\s*\(\s*nowType\s*===\s*["']sea["']\s*\)/.test(spd.body), "…only when the province changed SIDE (a lake is no sea to a harbour)");
  const off = all.filter((f) => /setProvinceDefinition\(\{[^}]*keepCoast\s*:\s*false/.test(f.body));
  ok(off.length >= 1, `the callers that retype many provinces in one edit are found (${off.map((f) => f.name).join(", ")})`);
  for (const f of off) ok(KEEPS.test(f.body.slice(f.body.search(/keepCoast\s*:\s*false/))), `${f.name} turns the per-province keep off and keeps once itself, after it`);
}

// ── 4. WHAT IT DID REACHES THE PAGE ──────────────────────────────────────────────────────────────────────────────────────────
console.log("\n=== 4. What the keep did reaches the page ===");
{
  const keepers = all.filter((f) => f.name !== "keepCoastRowsFacingTheirSea" && /(^|[^A-Za-z0-9_$.])keepCoastRowsFacingTheirSea\(/.test(f.body));
  for (const f of keepers) ok(/\bcoastRows\b/.test(f.body.slice(f.body.lastIndexOf("return"))) || /return\s*\{[^}]*\bcoastRows\b/.test(f.body) || /\bcoastRows\s*[,:}]/.test(f.body.slice(f.body.search(/keepCoastRowsFacingTheirSea\(/))),
    `${f.name} hands back what it kept as coastRows`);
  // Auto-fix runs a keeping fixer a second time, after the region fixers (#region-moves-unprotect-an-inland-sea), into a name of its
  // own, and folds that answer into the first pass's: the fold carries the second pass's coastRows too (review E-R8: saying only the
  // first pass's turned no test red). A bitmap fixture for a second pass has no cheap shape (test-every-map-fixer-is-wired-in.js pins
  // the order the same way), so the fold is read here
  const af = all.find((f) => f.name === "autoFixMap"), names = new Set(keepers.map((f) => f.name));
  const again = af ? [...af.body.matchAll(/const\s+([A-Za-z0-9_$]+)\s*=\s*([A-Za-z0-9_$]+)\(/g)].filter((m) => names.has(m[2])) : [];
  const repeats = af ? [...names].reduce((n, k) => n + Math.max(0, callsTo(af, k).length - 1), 0) : -1;
  ok(af && again.length === repeats && repeats > 0, `autoFixMap's later passes of a keeping fixer are each held in a name of their own (${again.map((m) => `${m[1]} = ${m[2]}(…)`).join(", ")}; ${repeats} later call(s))`, { repeats });
  for (const m of again) {
    const fold = /\bfixes\.([A-Za-z0-9_$]+)\s*=\s*\{/.exec(af.body.slice(m.index));
    const open = fold ? m.index + fold.index + fold[0].length - 1 : -1;
    let close = open, d = 0;
    if (open >= 0) for (let i = open; i < af.lit.length; i++) { if (af.lit[i] === "{") d++; else if (af.lit[i] === "}" && --d === 0) { close = i; break; } }
    const obj = open < 0 ? "" : af.body.slice(open, close + 1);
    ok(new RegExp("\\bcoastRows\\s*:\\s*sumCoastRows\\([^;]*\\b" + m[1] + "\\.coastRows\\b").test(obj), `…and ${m[2]}'s second pass (${m[1]}) is summed into fixes.${fold ? fold[1] : "?"}'s coastRows with the first (sumCoastRows)`, obj.slice(0, 400));
  }
  const page = maskJsComments(fs.readFileSync(path.join(__dirname, "public", "map.js"), "utf8"));
  const calls = (page.match(/(^|[^A-Za-z0-9_$.])coastRowsNote\(/g) || []).length - 1;   // less the definition
  // four places show an answer: the Save loop (type change, erase), the paint, Generate land's line, Auto-fix's summary — Auto-fix
  // twice, what it did among the fixes and what it left under "not finished", in the same words (review E-R2: a count of its own
  // there called a MOVED row "turned")
  // …and a sixth since 🌍 Generate a world: blankWriteNotes says its Delete map step in the Save loop's words (the blank's answer)
  ok(/function coastRowsNote\(/.test(page) && calls === 6, `public/map.js says it (coastRowsNote, ${calls} call sites: the Save loop, the paint, Generate land, Auto-fix's two halves, 🌍 Generate a world's Delete map step)`);
  {
    const bw = page.indexOf("function blankWriteNotes("), bwEnd = bw < 0 ? -1 : page.indexOf("\n  }", bw);
    ok(bw >= 0 && /coastRowsNote\(\s*r\.coastRows\s*\)/.test(page.slice(bw, bwEnd)), "…the sixth is blankWriteNotes, saying the blank's own coastRows");
  }
  ok(/\[\s*isea\.coastRows\s*,\s*lone\.coastRows\s*,\s*xc\.coastRows\s*\]/.test(page), "…including ALL of Auto-fix's keeps: the inland seas it filled (isea), the lone seas it made land (lone) and the corners it repainted (xc)");
  const loopAt = page.search(/\[\s*isea\.coastRows\s*,\s*lone\.coastRows\s*,\s*xc\.coastRows\s*\]/), loop = loopAt < 0 ? "" : page.slice(loopAt, page.indexOf("\n        }", loopAt));
  ok(/coastRowsNote\(\s*kc\s*,\s*["']done["']\s*\)/.test(loop) && /coastRowsNote\(\s*kc\s*,\s*["']left["']\s*\)/.test(loop) && !/\bturned\s+\$\{/.test(loop),
    "…and Auto-fix's loop says both halves through it, with no wording of its own", loop.slice(0, 400));
  // Generate land's one status line: the note is built from res.coastRows and is a part of the template the page shows
  // ⚠️ MOVED WITH 🌍 Generate a world: the line is built by generatedLandResultNote(res), read through it (testlib-map-page.js)
  const rep = require("./testlib-map-page.js").generateLandReportLine(page);
  // (from the top of generatedLandResultNote, not a fixed 6,000 characters back: a note added to that function pushed the window past
  // the coast's, B5-WD1's repair note, 2026-11-19)
  const gl = rep.lastIndexOf("reloadAfterImmediateWrite(`🌍 Generated"), before = rep.slice(Math.max(0, rep.indexOf("function generatedLandResultNote(")), gl);
  const v = (/const\s+([A-Za-z0-9_$]+)\s*=\s*coastRowsNote\(res\.coastRows\)/.exec(before) || [])[1];
  const shown = v && (new RegExp("const\\s+([A-Za-z0-9_$]+)\\s*=\\s*" + v + "\\s*\\?").exec(before) || [])[1];
  ok(gl > 0 && !!shown && rep.slice(gl).includes("${" + shown + "}"), `…and Generate land's status line carries it (\${${shown || "?"}})`, { v, shown });
}

// ── 5. EACH KEEP READS THE COAST AS THE EDIT LEFT IT ─────────────────────────────────────────────────────────────────────────
// The keep reads provinces.bmp and definition.csv off the disk (or the paint's own image): asked before a write of the bitmap, it
// judges the coast as it was. Five chains write into generateLand at once and are merged by hand; the province split adds a bitmap
// write there, and the harbour keep must stand after it — and after the ports facing the raised sea have gone (the fatal half).
console.log("\n=== 5. Each keep stands after its edit's writes, and Generate land's asks of the land the click raised ===");
{
  /** Where a function writes: [{ file, at }] — the detector of §1, with positions: each write of its own, and each call to a writer
   *  that does not keep (writeProvincesRaster; the province split, once merged), which writes that writer's files. */
  const writeSites = (fn) => (writers.find((w) => w.name === fn.name && w.file === fn.file) || { sites: [] }).sites;
  // keepCoastRowsFacingTheirSea reads the disk; returnCoastRowsToTheirSea is pure, handed the types before and after by its caller
  // (rebuildStrategicRegions turns with it before it writes), so only the first is held to a place in its writer
  const READS = /(^|[^A-Za-z0-9_$.])keepCoastRowsFacingTheirSea\(/g;
  const keepAt = (fn) => { const re = new RegExp(READS.source, "g"); let m, last = -1; while ((m = re.exec(fn.body))) last = m.index; return last; };
  const keepers = writers.filter((w) => keepAt(w) >= 0 && w.name !== "keepCoastRowsFacingTheirSea");
  ok(keepers.length >= 1 && keepers.every((w) => writeSites(w).length), `the keeping writers' write sites are found (${keepers.map((w) => `${w.name}: ${writeSites(w).length}`).join(", ")})`);
  for (const w of keepers) {
    const sites = writeSites(w), k = keepAt(w);
    const late = sites.filter((s) => s.file === "provinces.bmp" && s.at > k);
    const firstOf = (f) => Math.min(...sites.filter((s) => s.file === f).map((s) => s.at));
    const before = [...new Set(sites.map((s) => s.file))].every((f) => firstOf(f) < k);
    ok(k > 0 && !late.length && before, `${w.name}: its keep stands after every provinces.bmp write it makes and after its first write of each file`, { keep: k, sites, late });
    const rp = w.body.search(/(^|[^A-Za-z0-9_$.])removePortsAnchoredTo\(/);
    if (rp >= 0) ok(rp < k, `${w.name}: …and after the ports facing the sea it turned are gone (removePortsAnchoredTo, the fatal half)`, { removePorts: rp, keep: k });
  }
  // Generate land keeps with `typeOf` alone, so what it calls raised is the whole of what it changed: the provinces it picked AND every
  // id the click made (the split's pieces), read against the ids definition.csv had before the click's first write
  const gl = byName("generateLand"), body = gl ? gl.body : "";
  const snap = /const\s+([A-Za-z0-9_$]+)\s*=\s*new Set\(\s*\[\s*\.\.\.\s*rowIndexById\.keys\(\)\s*\]/.exec(body);
  const firstWrite = gl ? Math.min(...writeSites(gl).map((s) => s.at)) : -1, firstRow = body.indexOf("rowIndexById.set(");
  ok(!!snap && firstRow >= 0 && snap.index > firstRow && snap.index < firstWrite, "generateLand reads the ids the map had when the click began after it indexes definition.csv and before its first write", { snap: snap && snap.index, firstRow, firstWrite });
  const raisedVar = snap && (new RegExp("const\\s+([A-Za-z0-9_$]+)\\s*=\\s*raisedByThisClick\\(\\s*picked\\s*,\\s*" + snap[1] + "\\s*\\)").exec(body) || [])[1];
  const call = body.slice(keepAt(gl), body.indexOf(";", keepAt(gl)));
  ok(!!raisedVar && new RegExp("typeOf\\s*:\\s*\\(\\s*p\\s*\\)\\s*=>\\s*\\(\\s*" + raisedVar + "\\.has\\(p\\)\\s*\\?\\s*[\"']sea[\"']").test(call) && new RegExp("leave\\s*:\\s*" + raisedVar + "\\b").test(call),
    `…and its keep is told that the land it raised (raisedByThisClick(picked, ${snap ? snap[1] : "?"})) was sea, and leaves it to its own writers`, call);
}

console.log("\n" + (fail ? `FAILED ${fail} of ${pass + fail}` : `PASSED ${pass} checks`));
process.exitCode = fail ? 1 : 0;
