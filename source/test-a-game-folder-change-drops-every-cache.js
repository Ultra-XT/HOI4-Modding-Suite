// ⛔ #a-cache-holds-the-old-game — A CHANGE OF THE GAME FOLDER DROPS EVERY CACHE THAT COULD HOLD THE OLD GAME.
//
// The Game folder setting (#nova-does-not-find-the-game) takes effect without a restart, and most of what Nova shows is cached.
// cachedVanillaTechs and cachedVanillaEquips held the base game's whole scan with no key at all; map-data.js's look-below answers
// are keyed by the MOD, and a new game root is a root no stamp has seen, so nothing would ever tell them the layer below moved.
// Each would go on showing the old game under the new one. So a change resets every cache server.js, and every module of its
// own that reads the game, keeps. test-the-game-folder-setting.js §4 shows it through the research catalogue; this derives the
// whole list from the source, so a cache added tomorrow without a reset fails here.
//
// THE LIST IS DERIVED, NEVER TYPED:
//   modules — server.js, and every local module server.js requires whose code names the game (a gameRoot or vanilla… identifier);
//   caches  — every declarator at a module's top scope, and at createApp's top scope in server.js, whose name says it is one
//             (/cache|memo/i) or that a registering factory makes (lookBelowCache()), less ALL_CAPS constants (a TTL, a schema
//             stamp, a folder) and WeakMaps (keyed by a model or a layer the other caches hold, so they go with them);
//   resets  — server.js's resetGameFolderCaches and createApp's resetThisAppsGameCaches, a module's clearCachesForAGameChange,
//             each with the same-file functions it calls; a registered cache is reset by a loop over its registry.
"use strict";
const fs = require("fs");
const path = require("path");
const { maskJsLiterals, maskJsComments, jsBodyAt } = require("./testlib-strip-comments.js");

let pass = 0, fail = 0;
const ok = (c, m, x) => {
  if (c) { pass++; console.log("  ok   " + m); }
  else { fail++; console.log("  FAIL " + m + (x !== undefined ? "   -> " + JSON.stringify(x).slice(0, 700) : "")); }
};
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\-]/g, "\\$&");
const readSrc = (rel) => fs.readFileSync(path.join(__dirname, rel), "utf8").replace(/\r/g, "");

/** One module as the checks read it: `code` with comments and literals blanked (a brace left is the code's), `plain` with only
 *  the comments blanked (a require's string still readable), both the length of `raw`, and the brace depth at each index. */
function load(rel, text) {
  const raw = text !== undefined ? text : readSrc(rel);
  const code = maskJsLiterals(raw);
  const plain = maskJsComments(raw);
  const depth = new Int32Array(code.length + 1);
  let d = 0;
  for (let i = 0; i < code.length; i++) { depth[i] = d; if (code[i] === "{") d++; else if (code[i] === "}") d--; }
  depth[code.length] = d;
  return { rel, raw, code, plain, depth };
}
/** [open, close] of the body of `function name(` in a module, or null. */
function fnSpan(M, name) {
  const m = new RegExp(`function\\s+${esc(name)}\\s*\\(`).exec(M.code);
  return m ? jsBodyAt(M.code, m.index) : null;
}
const fnBody = (M, name, which = "code") => { const b = fnSpan(M, name); return b ? M[which].slice(b[0], b[1] + 1) : ""; };
/** Registering factories: `function F() { const m = new Map(); REG.push(m); return m; }` -> { F: "REG" }. */
function factories(M) {
  const out = {};
  for (const m of M.code.matchAll(/function\s+([A-Za-z_$][\w$]*)\s*\(\s*\)\s*\{\s*const\s+(\w+)\s*=\s*new\s+(?:Map|Set)\(\)\s*;\s*([A-Z0-9_]+)\.push\(\s*\2\s*\)\s*;\s*return\s+\2\s*;\s*\}/g)) out[m[1]] = m[3];
  return out;
}
/** Every declarator of a `let`/`const`/`var` statement starting at `at` (the keyword), split on its top-level commas. */
function declarators(M, at) {
  const kw = /^(?:let|const|var)\s+/.exec(M.code.slice(at, at + 8));
  let i = at + kw[0].length, start = i, depth = 0;
  const parts = [];
  for (; i < M.code.length; i++) {
    const ch = M.code[i];
    if ("([{".includes(ch)) depth++;
    else if (")]}".includes(ch)) { if (depth === 0) break; depth--; }
    else if (depth === 0 && (ch === "," || ch === ";")) { parts.push([start, i]); start = i + 1; if (ch === ";") break; }
    else if (depth === 0 && ch === "\n" && !/,\s*$/.test(M.code.slice(start, i))) break;
  }
  if (i >= M.code.length || M.code[i] !== ";") parts.push([start, i]);
  return parts.map(([a, b]) => {
    const t = M.code.slice(a, b), m = /^\s*([A-Za-z_$][\w$]*)\s*(=)?/.exec(t);
    if (!m) return null;   // a destructuring pattern: a require's names, never a cache
    const eq = m[2] ? a + m.index + m[0].length : -1;
    return { name: m[1], init: eq < 0 ? "" : M.raw.slice(eq, b).trim(), at: a };
  }).filter(Boolean);
}
/** Every cache at the top scope (and, with `appBody`, at that function's top scope). */
function cacheDecls(M, appBody) {
  const fac = factories(M);
  const out = [];
  for (const m of M.code.matchAll(/(^|[;\n{}])[ \t]*(let|const|var)\s/g)) {
    const at = m.index + m[0].length - m[2].length - 1;
    let scope = null;
    if (M.depth[at] === 0) scope = "module";
    else if (appBody && at > appBody[0] && at < appBody[1] && M.depth[at] === M.depth[appBody[0]] + 1) scope = "createApp";
    if (!scope) continue;
    for (const d of declarators(M, at)) {
      const call = /^([A-Za-z_$][\w$]*)\(\s*\)$/.exec(d.init);
      const viaFactory = call && fac[call[1]] ? fac[call[1]] : "";
      if (!viaFactory && (!/cache|memo/i.test(d.name) || /^[A-Z0-9_]+$/.test(d.name))) continue;
      out.push({ name: d.name, scope, init: d.init.slice(0, 60), viaFactory, line: M.raw.slice(0, at).split("\n").length });
    }
  }
  return out;
}
/** A reset's body with every same-file function it calls (to depth 3): what it actually runs. */
function resetText(M, name, depth = 0, seen = new Set()) {
  if (seen.has(name) || depth > 3) return "";
  seen.add(name);
  const body = fnBody(M, name);
  let text = body;
  for (const c of body.matchAll(/(?<![.\w$])([A-Za-z_$][\w$]*)\s*\(/g)) {
    if (/^(if|for|while|switch|catch|function|return|typeof|require)$/.test(c[1])) continue;
    if (fnSpan(M, c[1])) text += "\n" + resetText(M, c[1], depth + 1, seen);
  }
  return text;
}
/** The caches of a module that its resets do not reset. */
function unreset(M, resetNames, appBody) {
  const text = resetNames.map((n) => resetText(M, n)).join("\n");
  const decls = cacheDecls(M, appBody);
  const missing = [];
  for (const d of decls) {
    if (/^new\s+WeakMap\(/.test(d.init)) continue;
    if (d.viaFactory) { if (!new RegExp(`(?<![\\w$])${esc(d.viaFactory)}\\)\\s*([A-Za-z_$][\\w$]*)\\.clear\\(\\)`).test(text)) missing.push(d); continue; }
    const reset = new RegExp(`(?<![.\\w$])${esc(d.name)}\\s*(?:\\.clear\\(\\)|=(?!=)|\\.[A-Za-z_$][\\w$]*\\s*=(?!=))`).test(text);
    if (!reset) missing.push(d);
  }
  return { decls, missing };
}

try {
  console.log("\n0. the checker can fail (a cache with no reset is reported), and reads what it must");
  {
    const src = "let fooCache = new Map();\nconst barMemo = { key: \"\", at: 0 };\nconst TTL_CACHE_MS = 5;\nconst weakCache = new WeakMap();\n"
      + "let plain = 1, bazCache = null;\nconst REG = [];\nfunction regCache() { const m = new Map(); REG.push(m); return m; }\nconst viaReg = regCache();\n"
      + "// let commentedCache = new Map();\nconst s = \"let quotedCache = 1;\";\n"
      + "function helper() { barMemo.key = \"\"; }\nfunction clearCachesForAGameChange() { helper(); }\n";
    const fake = load("fake.js", src);
    const r = unreset(fake, ["clearCachesForAGameChange"]);
    ok(r.missing.map((d) => d.name).join(",") === "fooCache,bazCache,viaReg",
      "control: an unreset Map, the second declarator of a statement and an unreset registered cache are reported; a field reset through a called helper counts; a constant, a WeakMap, a comment and a string are not caches", r.missing);
    const fixed = load("fake.js", src.replace("function helper() {", "function helper() { fooCache.clear(); bazCache = null; for (const c of REG) c.clear();"));
    ok(unreset(fixed, ["clearCachesForAGameChange"]).missing.length === 0, "control: …and once reset, nothing is", unreset(fixed, ["clearCachesForAGameChange"]).missing);
  }

  console.log("\n1. which modules: server.js and every module of its own it requires that reads the game");
  const SRV = load("server.js");
  const requires = [...new Set([...SRV.plain.matchAll(/require\(\s*["']\.\/([\w.-]+?)(?:\.js)?["']\s*\)/g)].map((m) => m[1] + ".js"))]
    .filter((f) => fs.existsSync(path.join(__dirname, f)));
  const gameModules = requires.filter((f) => /\bgameRoot\b|\bvanilla\w*/i.test(maskJsLiterals(readSrc(f))));
  ok(requires.length >= 8, `server.js's own modules are read out of its requires (${requires.length})`, requires);
  ok(gameModules.includes("map-data.js") && gameModules.includes("mod-index.js"), `…and the ones whose code names the game are found: ${gameModules.join(", ")}`, gameModules);

  console.log("\n2. ⭐⭐⭐ server.js: every cache at its top scope and at createApp's is reset by a change of the game folder");
  const appM = /function createApp\s*\(\s*\)/.exec(SRV.code);
  const appBody = appM ? jsBodyAt(SRV.code, appM.index) : null;
  ok(!!appBody && appBody[1] - appBody[0] > 100000, "precondition: createApp's body is read whole (a brace counted in a literal would cut it short)", appBody);
  ok(!!fnSpan(SRV, "resetGameFolderCaches") && !!fnSpan(SRV, "resetThisAppsGameCaches"), "precondition: both resets are there to read", null);
  const s = unreset(SRV, ["resetGameFolderCaches", "resetThisAppsGameCaches"], appBody);
  const names = new Set(s.decls.map((d) => d.name));
  const seen = ["cachedVanillaTechs", "cachedVanillaEquips", "cachedVanillaDupSpecs", "techScanCache", "stateCatalogCache"];
  ok(seen.every((n) => names.has(n)), "precondition: the scan sees the caches the bug was found in (the vanilla tech, equipment and duplicate scans) and createApp's", seen.filter((n) => !names.has(n)));
  const at = (sc) => s.decls.filter((d) => d.scope === sc).length;
  ok(at("module") >= 25 && at("createApp") >= 30, `…at both scopes (${at("module")} at the top, ${at("createApp")} in createApp)`, null);
  ok(s.missing.length === 0, `⭐⭐⭐ all ${s.decls.length} of server.js's caches are reset`, s.missing);
  const resetsOthers = fnBody(SRV, "resetGameFolderCaches");
  ok(/for\s*\(\s*const\s+(\w+)\s+of\s+GAME_FOLDER_RESETTERS\s*\)\s*\{\s*try\s*\{\s*\1\(\)/.test(resetsOthers), "resetGameFolderCaches runs every app's own reset (GAME_FOLDER_RESETTERS)", null);
  const pushes = [...SRV.code.slice(appBody[0], appBody[1]).matchAll(/GAME_FOLDER_RESETTERS\.push\(\s*function\s+(\w+)/g)].map((m) => m[1]);
  ok(pushes.length === 1 && pushes[0] === "resetThisAppsGameCaches", "…and createApp registers resetThisAppsGameCaches there, once per app", pushes);

  console.log("\n3. ⭐⭐ every other module that reads the game: its clearCachesForAGameChange resets every cache it keeps, and server.js calls it");
  const resetPlain = fnBody(SRV, "resetGameFolderCaches", "plain");
  for (const rel of gameModules) {
    const M = load(rel);
    ok(!!fnSpan(M, "clearCachesForAGameChange"), `${rel}: has clearCachesForAGameChange`, null);
    ok(/\bclearCachesForAGameChange\b/.test((/module\.exports\s*=\s*\{[\s\S]*\}/.exec(M.plain) || [""])[0]), `${rel}: …and exports it`, null);
    const r = unreset(M, ["clearCachesForAGameChange"]);
    ok(r.decls.length > 0 && r.missing.length === 0, `⭐⭐ ${rel}: all ${r.decls.length} of its caches are reset`, r.missing);
    const req = `require\\(\\s*["']\\./${esc(rel.replace(/\.js$/, ""))}(?:\\.js)?["']\\s*\\)`;
    const bound = [...SRV.plain.matchAll(new RegExp(`(?:^|\\n)(?:const|let|var)\\s+([A-Za-z_$][\\w$]*)\\s*=\\s*${req}`, "g"))].map((m) => m[1]);
    const call = new RegExp(`(?:${[req, ...bound.map((b) => `(?<![.\\w$])${esc(b)}`)].join("|")})\\s*\\.clearCachesForAGameChange\\(\\s*\\)`);
    ok(call.test(resetPlain), `⭐ …and resetGameFolderCaches calls it (${bound.length ? bound.join("/") : `require("./${rel}")`}.clearCachesForAGameChange())`, bound);
  }

  console.log("\n4. ⭐⭐⭐ a change of the game folder IN USE drops the caches, wherever it comes from: set, detected, or by itself");
  // #the-game-folder-moved-by-itself (reviews S-S1, P-P1): the folder in use also moves with nobody setting anything — a chosen copy
  // unplugged or plugged in, a copy that loses hoi4.exe, HOI4_ROOT set — and this section once checked only the functions that SET
  // something, so that switch was invisible to it. The reset lives where every answer passes: resolveHoi4GameRoot notes an answer
  // that differs from the last, and noteGameRootServed drops the caches. The behaviour, measured end to end:
  // test-the-game-folder-in-use-moves-every-cache-with-it.js.
  const spans = [...SRV.code.matchAll(/function\s+([A-Za-z_$][\w$]*)\s*\(/g)].map((m) => ({ name: m[1], b: jsBodyAt(SRV.code, m.index) })).filter((x) => x.b);
  const inFunction = (i) => { let best = null; for (const x of spans) if (x.b[0] <= i && i <= x.b[1] && (!best || x.b[0] > best.b[0])) best = x; return best ? best.name : "(module)"; };
  const rr = fnBody(SRV, "resolveHoi4GameRoot");
  ok(/(?<![.\w$])gameRootInUse\(\)/.test(rr) && /!==\s*_gameRootServed\s*\)\s*noteGameRootServed\(/.test(rr),
    "⭐⭐⭐ resolveHoi4GameRoot hands every answer that differs from the last to noteGameRootServed", rr);
  const note = fnBody(SRV, "noteGameRootServed");
  // the condition itself, not two words anywhere in the body: `if (false && …)` kept both and dropped nothing (back-out A1)
  ok(/(?<![.\w$])_gameRootServed\s*=\s*root\b/.test(note)
    && /\bif\s*\(\s*before\s*!==\s*null\s*&&\s*!sameFolder\(\s*before\s*,\s*root\s*\)\s*\)\s*\{\s*try\s*\{\s*resetGameFolderCaches\(\)/.test(note),
    "⭐⭐⭐ …which drops every cache when the answer names another folder", note);
  const assignedIn = (name) => [...new Set([...SRV.code.matchAll(new RegExp(`(?<![.\\w$])${name}\\s*=(?!=)`, "g"))]
    .filter((m) => !/(?:let|const|var)\s+$/.test(SRV.code.slice(Math.max(0, m.index - 8), m.index))).map((m) => inFunction(m.index)))];
  ok(assignedIn("GAME_ROOT").join() === "noteGameRootServed" && assignedIn("WORKSHOP_ROOT").join() === "noteGameRootServed",
    "⭐⭐ GAME_ROOT and WORKSHOP_ROOT move only there, so they always say what is served", { GAME_ROOT: assignedIn("GAME_ROOT"), WORKSHOP_ROOT: assignedIn("WORKSHOP_ROOT") });
  ok(assignedIn("_gameRootServed").join() === "noteGameRootServed", "…and so does the answer it compares with", assignedIn("_gameRootServed"));
  // What decides the answer — the choice, and what detection found — is changed only where resolveHoi4GameRoot is asked after it.
  const apply = fnBody(SRV, "applyGameFolderDetection");
  ok(/(?<![.\w$])resolveHoi4GameRoot\(\)\s*;\s*\}$/.test(apply.trim()), "⭐⭐ applyGameFolderDetection ends by asking resolveHoi4GameRoot, so a detection that moves the game acts at once", apply.slice(-160));
  const deciders = [];
  // …and the functions gameRootInUse itself calls to decide (systemGameFolder: what detection found, asked once when first needed)
  const inUseBody = fnBody(SRV, "gameRootInUse");
  const askedByInUse = new Set(spans.map((x) => x.name).filter((n) => n !== "gameRootInUse" && new RegExp(`(?<![.\\w$])${n}\\(`).test(inUseBody)));
  for (const name of ["GAME_FOLDER_CHOICE", "_systemGameFolder"]) {
    for (const m of SRV.code.matchAll(new RegExp(`(?<![.\\w$])${name}\\s*=(?!=)`, "g"))) {
      if (/(?:let|const|var)\s+$/.test(SRV.code.slice(Math.max(0, m.index - 8), m.index))) continue;
      const fn = inFunction(m.index);
      const span = spans.find((x) => x.name === fn);
      const after = span ? SRV.code.slice(m.index, span.b[1]) : "";
      // settled: the same function asks resolveHoi4GameRoot (or applies a detection, which does) after it — or IS what
      // resolveHoi4GameRoot calls to decide (gameRootInUse), or what it hands the answer to
      const settled = fn === "gameRootInUse" || askedByInUse.has(fn) || fn === "applyGameFolderDetection" || /(?<![.\w$])(?:resolveHoi4GameRoot|applyGameFolderDetection)\(/.test(after);
      deciders.push({ name, fn, settled });
    }
  }
  ok(deciders.length >= 5, `the places that change what decides it are found: ${deciders.map((d) => `${d.fn}(${d.name})`).join(", ")}`, deciders);
  ok(deciders.every((d) => d.settled), "⭐⭐ …and each asks resolveHoi4GameRoot after (or is what it asks), so no change waits for a reader to notice", deciders.filter((d) => !d.settled));
  // A cache HIT never asks resolveHoi4GameRoot (Home's /api/mod/index answers from memory for five minutes), so every request asks
  // it first, before any route — test-the-game-folder-in-use-moves-every-cache-with-it.js §5 is the behaviour.
  const caSpan = fnSpan(SRV, "createApp");
  const caCode = caSpan ? SRV.code.slice(caSpan[0], caSpan[1] + 1) : "";
  const caPlain = caSpan ? SRV.plain.slice(caSpan[0], caSpan[1] + 1) : "";
  const settle = /app\.use\(\s*"\s*"\s*,\s*\(\s*\w+\s*,\s*\w+\s*,\s*(\w+)\s*\)\s*=>\s*\{\s*try\s*\{\s*resolveHoi4GameRoot\(\)\s*;?\s*\}\s*catch\s*\(\s*\w*\s*\)\s*\{\s*\}\s*\1\(\)/.exec(caCode);
  const firstRoute = caCode.search(/\bapp\.(?:get|post|put|delete|patch|all)\(/);
  ok(!!settle && /^app\.use\(\s*"\/api"/.test(caPlain.slice(settle.index)) && firstRoute > settle.index,
    "⭐⭐ createApp asks resolveHoi4GameRoot at the start of every /api request, before any route, so a cache hit cannot serve the old game",
    { settle: settle && caPlain.slice(settle.index, settle.index + 120), firstRoute, at: settle && settle.index });
  // A scan is reused only for the folder it read: a catalogue built ACROSS a change cannot put the old game's scan back.
  ok(/cachedVanillaTechs\s*&&\s*cachedVanillaTechsRoot\s*===\s*gameRoot/.test(SRV.code) && /cachedVanillaEquips\s*&&\s*cachedVanillaEquipsRoot\s*===\s*gameRoot/.test(SRV.code)
    && !/if\s*\(\s*cachedVanillaTechs\s*&&\s*!_vanillaShadowed/.test(SRV.code) && !/if\s*\(\s*cachedVanillaEquips\s*\)/.test(SRV.code),
    "⭐⭐ the base game's technology and equipment scans are reused only for the game folder they were read from", null);
  // (the route's address is a string, blanked in `code`: found in `plain`, the same length, and its body read in `code`)
  const routes = [...SRV.plain.matchAll(/app\.(?:post|put)\(\s*"\/api\/settings\/game-folder"/g)].map((m) => { const b = jsBodyAt(SRV.code, m.index); return b ? SRV.code.slice(b[0], b[1] + 1) : ""; });
  ok(routes.length === 1 && /(?<![.\w$])setGameFolderChoice\(/.test(routes[0]), "…and the setting's route goes through setGameFolderChoice", routes.length);
} catch (e) {
  fail++;
  console.log("  FAIL threw: " + (e && e.stack || e));
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
