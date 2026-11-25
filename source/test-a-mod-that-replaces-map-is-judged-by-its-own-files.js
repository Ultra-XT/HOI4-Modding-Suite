// #a-replaced-map-folder-is-judged-by-its-own-files + #a-replaced-map-folder-says-what-it-hides — A MOD WHOSE OWN DESCRIPTOR SAYS
// replace_path="map" IS JUDGED, AND REPAIRED, BY ITS OWN MAP FILES ALONE.
//
// THE DEFECT (B6-17, repro-B6-17.js). HOI4 reads no file of a layer below from map/ when the active mod declares replace_path="map".
// Map Errors did: validateMapFiles' resolveMap fell back through baseRootsFor, which honours only a DEPENDENCY's line, so a 4-province
// total conversion was told "heightmap.bmp is 5632×2048 (inherited)", "2350 port(s) in map/buildings.txt have no sea", "64326 building
// position(s) … stand where there is no land" and "148 strait(s) in map/adjacencies.csv" — five rows byte-identical with and without the
// line. And one 🔧 Auto-fix click wrote map/buildings.txt into it: 10,125 rows, 10,070 of them byte-identical to the base game's. The
// fix next door is layersBelow, which buildMapModel's own fallback already honours; 85 readers that Map Errors or Auto-fix reach had never
// adopted it.
//
// HOW THIS HOLDS IT. Sections 1 and 2 are a pair: the same total conversion with the line and without it, over a base game whose map/
// ships a heightmap of another size and building rows keyed to states the mod does not have. With the line Map Errors opens no file of
// the base game's map/ — cold, as the server's first request, and warm, after the base game's caches are full — and names what the line
// takes away (replaced_map_files_missing); without it, the base game's heightmap is read and reported as inherited: the control that the
// fixture reaches the readers at all. Section 3 is the click on both twins: with the line no map file it writes holds a row of the base
// game's; without it the same click does copy the base game's rows in, where they load — so the fixture reaches a writer that
// materialises. Section 4 derives, from the source with comments masked, every function the validate route and the auto-fix route reach,
// and holds that none asks baseRootsFor for map/ but the two named questions that may see past the line: what it hides
// (mapLayersTheModHides, so the modder is told) and the world the map was drawn over (worldBeneathRoots — the reference every …Beneath
// reader of a Generate land click compares with, decided in #a-generated-world-keeps-the-date-line-at-sea, and pinned by
// test-a-raise-knows-where-the-map-ends.js vi′ and test-an-adjacency-name-is-encoded-twice.js).
"use strict";

const fs = require("fs");
const path = require("path");
const lib = require("./testlib-two-layer-map.js");

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (ok || detail == null ? "" : "   -> " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 500)));
  if (!ok) fails.push(label);
};

const W = lib.makeWorld("replmap");
// The base game's map/ gets two more files beside the testlib's provinces.bmp, definition.csv and buildings.txt: a heightmap of
// ANOTHER size than the mod's provinces.bmp, and its buildings.txt keeps the testlib's rows (keyed to states 1-3 and provinces 1-3).
lib.write(W.GAME, { "map/heightmap.bmp": lib.bmp24(512, 256, () => [96, 96, 96]) });
const { createApp } = require("./server.js");
const { maskJsComments, maskJsLiterals, jsBodyAt } = require("./testlib-strip-comments.js");

const GAME_MAP = path.join(W.GAME, "map");
const topLevelMapFiles = (dir) => fs.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isFile()).map((e) => e.name);
// The mod: its own provinces.bmp (the base game's 256×256 layout) and definition.csv, and ONE state holding all four land provinces —
// so the base game's rows, keyed to its states 1, 2 and 3, stand on land of a state they do not name, and its coast has no port of its own.
const MOD_FILES = {
  "map/provinces.bmp": lib.bmp24(256, 256, (x, y) => lib.COL[lib.provAt(x, y)]),
  "map/definition.csv": lib.DEF(),
  "history/states/1-All.txt": lib.st(1, "2 3 4 5"),
};
const descriptor = (name, lines) => `name="${name}"\nsupported_version="1.*"\n${lines.map((l) => `replace_path="${l}"\n`).join("")}`;
const withLine = W.mod("Replaces map", { "descriptor.mod": descriptor("Replaces map", ["map", "history/states"]), ...MOD_FILES });
const without = W.mod("Keeps the map", { "descriptor.mod": descriptor("Keeps the map", ["history/states"]), ...MOD_FILES });

/** Every file directly in the base game's map/ that `fn` opens for reading, in-process (the server runs in this process), with the
 *  call stack that opened it. A listing is not a read: what the line hides may be named, never judged. */
async function hiddenReads(fn) {
  const seen = [];
  const isHidden = (p) => { try { const a = path.resolve(String(p)); return path.dirname(a).toLowerCase() === path.resolve(GAME_MAP).toLowerCase(); } catch (_) { return false; } };
  const note = (p) => { if (typeof p === "string" && isHidden(p)) seen.push({ file: path.basename(p), stack: String(new Error().stack) }); };
  const orig = { readFileSync: fs.readFileSync, openSync: fs.openSync, createReadStream: fs.createReadStream };
  fs.readFileSync = function (p, ...a) { note(p); return orig.readFileSync.call(this, p, ...a); };
  fs.openSync = function (p, ...a) { note(p); return orig.openSync.call(this, p, ...a); };
  fs.createReadStream = function (p, ...a) { note(p); return orig.createReadStream.call(this, p, ...a); };
  try { return { value: await fn(), reads: seen }; }
  finally { Object.assign(fs, orig); }
}
// buildMapModel keeps one parsed layer per root (getRootLayer -> readRootLayer), whatever any descriptor says, and effectiveLayers then
// decides which of them loads: that first read of the base game's definition.csv is the model's cache filling, not a judgement.
const layerCacheFill = (r) => /\breadRootLayer\b/.test(r.stack);
const rowOf = (v, rule) => ((v && v.problems) || []).find((p) => p.rule === rule) || null;
const nonComment = (t) => String(t).split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));
/** The map/ files a click wrote into `mod` that hold a row of the base game's same file. */
function mapFilesFromTheBaseGame(mod, before) {
  const written = lib.written(before, lib.tree(mod)).filter((k) => /^map\/[^/]+$/.test(k) && fs.existsSync(path.join(mod, k)));
  return {
    written,
    fromBase: written.filter((k) => fs.existsSync(path.join(W.GAME, k))).map((k) => {
      const mine = nonComment(fs.readFileSync(path.join(mod, k), "utf8"));
      const theirs = new Set(nonComment(fs.readFileSync(path.join(W.GAME, k), "utf8")));
      return { file: k, rows: mine.length, sameAsBaseGame: mine.filter((l) => theirs.has(l)).length };
    }).filter((x) => x.sameAsBaseGame > 0),
  };
}

(async () => {
  let S = null;
  try {
    S = await lib.startServer(createApp);

    console.log("=== 1. with the line: Map Errors opens no file of the base game's map/, and says what the line takes away ===");
    {
      // COLD: the server's first request. Only the model's layer cache may read the base game's map/.
      const { value: v, reads } = await hiddenReads(() => S.validate(withLine));
      rec("the validate answered", !!v && v.ok !== false, v && v.error);
      const judged = reads.filter((r) => !layerCacheFill(r));
      rec("⭐⭐⭐ COLD: no file directly in the base game's map/ was opened to judge it", judged.length === 0,
        judged.map((r) => r.file + " <- " + r.stack.split("\n").slice(2, 5).map((l) => l.trim()).join(" < ")));
      const bm = rowOf(v, "bmp_size_mismatch");
      rec("⭐⭐⭐ …so the base game's heightmap is not reported as the mod's inherited bitmap", !bm || !/heightmap\.bmp/.test(bm.message), bm && bm.message);
      for (const rule of ["building_not_over_land", "naval_base_sea_zone_invalid", "state_no_air_base_or_rocket_site", "building_wrong_state", "building_anchor_wrong_state"]) {
        const r = rowOf(v, rule);
        rec(`⭐⭐ …and no ${rule} row is read off the base game's buildings.txt`, !r, r && String(r.message).slice(0, 200));
      }
      const miss = rowOf(v, "replaced_map_files_missing");
      const expected = topLevelMapFiles(GAME_MAP).filter((f) => /\.(bmp|csv|txt|map)$/i.test(f) && !Object.keys(MOD_FILES).some((k) => k.toLowerCase() === ("map/" + f).toLowerCase())).sort();
      rec(`⭐⭐⭐ replaced_map_files_missing names exactly the base game's map/ files the mod lacks (${expected.join(", ")})`,
        !!miss && JSON.stringify((miss.items || []).map((i) => i.file.slice(4)).sort()) === JSON.stringify(expected) && miss.total === expected.length, miss);
      rec("…as a warning, naming the base game and the line", !!miss && miss.severity === "warning" && /replace_path="map"/.test(miss.message) && /the base game/.test(miss.message), miss && miss.message);
      rec("…and offers no Auto-fix, which does not make a map file (its words never name it)", !!miss && !/\bAuto-fix\b/.test(miss.message), miss && miss.message);
    }

    console.log("\n=== 2. THE CONTROL: the same mod without the line reads the base game's map/ and is told about its heightmap ===");
    {
      const { value: v, reads } = await hiddenReads(() => S.validate(without));
      rec("the base game's heightmap.bmp is opened", reads.some((r) => r.file === "heightmap.bmp"), reads.map((r) => r.file));
      rec("…and its buildings.txt", reads.some((r) => r.file === "buildings.txt"), reads.map((r) => r.file));
      const bm = rowOf(v, "bmp_size_mismatch");
      rec("⭐⭐ …and the heightmap is reported against the mod's provinces.bmp as inherited", !!bm && /heightmap\.bmp is 512×256 \(inherited\)/.test(bm.message), bm && bm.message);
      rec("⭐⭐ …and nothing is said to be missing: without the line the base game's files load", !rowOf(v, "replaced_map_files_missing"), rowOf(v, "replaced_map_files_missing"));
    }
    {
      // WARM: the base game's caches are full now. The line still keeps every one of its map/ files out of the judgement.
      const { value: v, reads } = await hiddenReads(() => S.validate(withLine));
      rec("⭐⭐ WARM: with the line, after the twin filled the base game's caches, no file of its map/ is opened at all", !!v && v.ok !== false && reads.length === 0, reads.map((r) => r.file));
      rec("⭐⭐ …and the answer still names no heightmap of the base game's", !rowOf(v, "bmp_size_mismatch") || !/heightmap\.bmp/.test(rowOf(v, "bmp_size_mismatch").message), rowOf(v, "bmp_size_mismatch"));
    }
    {
      // …and a mod with the line that ships every file the base game does is not told of any.
      const full = W.mod("Ships its map", { "descriptor.mod": descriptor("Ships its map", ["map", "history/states"]), ...MOD_FILES,
        "map/buildings.txt": "1;air_base;64.00;9.50;95.00;0.00;0\n", "map/heightmap.bmp": lib.bmp24(256, 256, () => [96, 96, 96]) });
      const v = await S.validate(full);
      rec("THE CONTROL: a mod with the line that ships its own copy of every one is told of none missing", !rowOf(v, "replaced_map_files_missing"), rowOf(v, "replaced_map_files_missing"));
    }

    console.log("\n=== 3. one Auto-fix click: with the line it writes no row of the base game's; without it, the same click copies them in ===");
    {
      const before = lib.tree(withLine);
      const fr = await S.autoFix(withLine);
      rec("the click answered ok", fr.status === 200 && fr.body && fr.body.ok, { status: fr.status, error: fr.body && fr.body.error });
      const { written, fromBase } = mapFilesFromTheBaseGame(withLine, before);
      rec("⭐⭐⭐ no map file the click wrote holds a row of the base game's same file", fromBase.length === 0, { written, fromBase });
      rec("⭐⭐ …in particular it made no map/buildings.txt", !fs.existsSync(path.join(withLine, "map", "buildings.txt")), written);
    }
    {
      const before = lib.tree(without);
      const fr = await S.autoFix(without);
      rec("THE CONTROL: the click on the twin without the line answered ok", fr.status === 200 && fr.body && fr.body.ok, { status: fr.status, error: fr.body && fr.body.error });
      const { written, fromBase } = mapFilesFromTheBaseGame(without, before);
      rec("⭐⭐ …and it did copy the base game's rows into a map file, where they load (the fixture reaches a writer that materialises)",
        fromBase.some((x) => x.file === "map/buildings.txt"), { written, fromBase });
    }

    console.log("\n=== 4. derived from the source, comments masked ===");
    const SRC = fs.readFileSync(path.join(__dirname, "map-data.js"), "utf8");
    const CODE = maskJsComments(SRC), LIT = maskJsLiterals(SRC);
    // every top-level function, its body, and every top-level function its body names (an over-approximation of what it calls)
    const fns = new Map();
    const declRe = /^(?:async\s+)?function\s*\*?\s*([A-Za-z0-9_$]+)\s*\(|^const\s+([A-Za-z0-9_$]+)\s*=\s*(?:async\s+)?(?:function\b|\([^)]*\)\s*=>|[A-Za-z0-9_$]+\s*=>)/gm;
    let m;
    while ((m = declRe.exec(LIT)) !== null) { const b = jsBodyAt(LIT, m.index); const n = m[1] || m[2]; if (b && !fns.has(n)) fns.set(n, { open: b[0], close: b[1] }); }
    const nameRe = new RegExp("\\b(" + [...fns.keys()].sort((a, b) => b.length - a.length).map((n) => n.replace(/\$/g, "\\$")).join("|") + ")\\b", "g");
    const calls = (n) => { const f = fns.get(n); const out = new Set(); const body = LIT.slice(f.open, f.close + 1); let k; nameRe.lastIndex = 0; while ((k = nameRe.exec(body)) !== null) if (k[1] !== n) out.add(k[1]); return out; };
    // the roots: what the validate route and the auto-fix route call on map-data.js (server.js, comments and literals masked)
    const SERVER = fs.readFileSync(path.join(__dirname, "server.js"), "utf8");
    const SLIT = maskJsLiterals(SERVER);
    // …and those of server.js's own functions the route calls, and theirs in turn: since B5-WD1 the click's work is autoFixMapAndItsNames,
    // which 🌍 Generate land runs as well, so the route itself names only autoFixSnapshotDir (the integration of the b2b4 fixes)
    const serverFns = new Map();
    const serverDeclRe = /^[ \t]*(?:async\s+)?function\s+([A-Za-z0-9_$]+)\s*\(/gm;
    let sd;
    while ((sd = serverDeclRe.exec(SLIT)) !== null) { const b = jsBodyAt(SLIT, sd.index); if (b && !serverFns.has(sd[1])) serverFns.set(sd[1], b); }
    const routeRoots = (method, route) => {
      const at = SERVER.indexOf(`app.${method}("${route}"`);
      const first = at < 0 ? null : jsBodyAt(SLIT, at);
      if (!first) return [];
      const out = new Set(), seen = new Set(), todo = [first];
      while (todo.length) {
        const b = todo.shift(), body = SLIT.slice(b[0], b[1] + 1);
        for (const x of body.matchAll(/\bmapData\.([A-Za-z0-9_$]+)\s*\(/g)) out.add(x[1]);
        for (const x of body.matchAll(/(?<![\w$.])([A-Za-z_$][\w$]*)\s*\(/g)) if (serverFns.has(x[1]) && !seen.has(x[1])) { seen.add(x[1]); todo.push(serverFns.get(x[1])); }
      }
      return [...out];
    };
    const validateRoots = routeRoots("get", "/api/map/validate"), autoFixRoots = routeRoots("post", "/api/map/auto-fix");
    rec(`the validate route's map-data calls were found (${validateRoots.join(", ")})`, validateRoots.includes("validateMapBitmap") && validateRoots.includes("findBuildingAnchorMismatches") && validateRoots.includes("validateMapModel"), validateRoots);
    rec(`the auto-fix route's were found (${autoFixRoots.join(", ")})`, autoFixRoots.includes("autoFixMap"), autoFixRoots);
    const reach = new Set(), queue = [];
    for (const r of [...validateRoots, ...autoFixRoots]) if (fns.has(r) && !reach.has(r)) { reach.add(r); queue.push(r); }
    while (queue.length) for (const c of calls(queue.shift())) if (!reach.has(c)) { reach.add(c); queue.push(c); }
    rec(`…and they reach ${reach.size} functions, among them validateMapFiles, buildingsTxtPlacementScan and fixCoastalNoPort`,
      reach.size > 300 && ["validateMapFiles", "buildingsTxtPlacementScan", "fixCoastalNoPort", "findBuildingAnchorMismatches"].every((n) => reach.has(n)), reach.size);
    /** baseRootsFor calls in `code` that ask for map/ — or for no folder, which honours no replace_path at all. */
    const askForMap = (code) => {
      const out = [];
      const re = /\bbaseRootsFor\(/g;
      let s;
      while ((s = re.exec(code)) !== null) {
        if (/function\s+$/.test(code.slice(Math.max(0, s.index - 12), s.index))) continue;
        let d = 0, j = s.index + "baseRootsFor".length, cur = "";
        const args = [];
        for (; j < code.length; j++) {
          const c = code[j];
          if (c === "(" || c === "[" || c === "{") { d++; if (d === 1) continue; }
          else if (c === ")" || c === "]" || c === "}") { d--; if (d === 0) { args.push(cur.trim()); break; } }
          else if (c === "," && d === 1) { args.push(cur.trim()); cur = ""; continue; }
          cur += c;
        }
        if (args.length === 2 || (args.length === 3 && args[2] === '"map"')) out.push(code.slice(s.index, j + 1));
      }
      return out;
    };
    // THE TWO NAMED QUESTIONS that may still see past the mod's own line, each a choice somebody made in the source: what the line hides
    // (to say so), and the world the map was drawn over (the reference every …Beneath reader of a Generate land click compares with).
    const HIDES = "mapLayersTheModHides", BENEATH = "worldBeneathRoots";
    const asking = [...reach].filter((n) => n !== HIDES && n !== BENEATH).map((n) => { const f = fns.get(n); return { fn: n, asks: askForMap(CODE.slice(f.open, f.close + 1)) }; }).filter((x) => x.asks.length);
    rec("⭐⭐⭐ no function Map Errors or Auto-fix reaches asks baseRootsFor for map/ — each asks layersBelow, which hears the mod's own line, or one of the two named questions",
      asking.length === 0, asking.map((x) => `${x.fn}: ${x.asks.join(" ; ")}`));
    // …and their staleness checks: each exists, asks baseRootsFor for map/ exactly once, and is reached.
    const bodyCode = (n) => { const f = fns.get(n); return f ? CODE.slice(f.open, f.close + 1) : ""; };
    const callers = (n) => [...reach].filter((c) => c !== n && calls(c).has(n));
    rec(`the exemption is live: ${HIDES} exists, asks baseRootsFor for map/ exactly once, and validateMapFiles calls it`,
      askForMap(bodyCode(HIDES)).length === 1 && calls("validateMapFiles").has(HIDES) && reach.has(HIDES), { exists: fns.has(HIDES), asks: askForMap(bodyCode(HIDES)) });
    rec(`…and it answers nothing unless the mod's own descriptor says replace_path="map"`,
      /readReplacePaths\(\s*modRoot\s*\)\.has\(\s*"map"\s*\)/.test(bodyCode(HIDES)), null);
    rec(`the exemption is live: ${BENEATH} exists, is exactly baseRootsFor's answer for map/, and the click reaches it (${callers(BENEATH).length} callers)`,
      /^\{\s*return\s+baseRootsFor\(\s*dependencyRoots\s*,\s*gameRoot\s*,\s*"map"\s*\);\s*\}$/.test(bodyCode(BENEATH)) && callers(BENEATH).length > 0, { body: bodyCode(BENEATH), callers: callers(BENEATH) });
    const vmf = fns.get("validateMapFiles");
    const vmfCode = vmf ? CODE.slice(vmf.open, vmf.close + 1) : "";
    const resolveAt = vmfCode.indexOf("const resolveMap = ");
    const resolveBody = resolveAt < 0 ? "" : vmfCode.slice(resolveAt, vmfCode.indexOf("};", resolveAt) + 2);
    rec("validateMapFiles' resolveMap was found, and asks layersBelow with the mod's root", resolveBody.length > 40 && /layersBelow\(\s*modRoot\s*,/.test(resolveBody) && !/\bbaseRootsFor\(/.test(resolveBody), resolveBody);
    // ⛔ …and Map Errors names the warning in words: ONE curated label (review of the B6 fixes, MF-2 — test-map-rule-labels.js went red on
    // this rule). Counted in the source, comments masked: a second key, as a merge of two branches that each added one would leave, is
    // legal JavaScript, and the later one wins without a word.
    const LBL = maskJsComments(fs.readFileSync(path.join(__dirname, "public", "map-rule-labels.js"), "utf8"));
    const ruleLabels = require("./public/map-rule-labels.js");
    const keys = (LBL.match(/^\s*replaced_map_files_missing\s*:/gm) || []).length;
    rec("the warning replaced_map_files_missing has exactly ONE curated label, so the popup never shows its raw id",
      keys === 1 && typeof ruleLabels.LABELS.replaced_map_files_missing === "string" && ruleLabels.mapRuleLabel("replaced_map_files_missing") === ruleLabels.LABELS.replaced_map_files_missing,
      { keys, label: ruleLabels.LABELS.replaced_map_files_missing });
  } catch (e) {
    rec("the run finished without throwing", false, e && (e.stack || e.message || String(e)));
  } finally {
    if (S) S.close();
    W.cleanup();
  }
  console.log(`\n=== a mod that replaces map/ is judged by its own files: ${checks} checks, ${fails.length} failed ===`);
  for (const f of fails) console.log("   FAILED: " + f);
  process.exit(fails.length ? 1 : 0);
})();
