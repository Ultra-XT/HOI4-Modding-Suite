// ⛔ #a-baseline-is-the-copy-known-to-load — 💾 Save baseline asks the Save check's own question first, and keeps its answer.
//
// THE DEFECT (tool campaign B6-4 and B6-5). Save baseline asked nothing. The page offers it in every Map Errors popup — the one the
// Save gate opens over a map with a problem Save stops for among them — and 🛟 Restore's confirm then said "It does guarantee the
// game loads" of whatever the baseline held. MEASURED with the page's own POST /api/map/save-baseline {modPath}: a baseline saved on
// a good map, France emptied (validate: empty_capital_state and land_not_in_state, both in the curated fatal set), the same click
// again → 200, and the one copy known to load was replaced by a map the game refuses. A Restore of it then "guaranteed" that map.
//
// THE FIX (the coordinator's decision for B6-4 and B6-5).
//   • Given the game folder, saveMapBaseline asks reportedMapProblems — the four passes GET /api/map/validate runs, in its order —
//     and counts the ones isFatalRule names (public/map-rule-labels.js, the Save gate's own predicate). Any one refuses the save,
//     names the problems, says a baseline is the copy known to load, and leaves the previous baseline exactly as it was.
//   • The answer is KEPT in _baseline.json as heldVerdict { fatal, rules }, and getMapBaselineInfo hands it to the page, which may
//     promise that a Restore loads only for a baseline whose verdict names nothing fatal (G3's words, B6-5).
//   • No game folder, or a check that cannot run: the save is made UNCHECKED, with no verdict and `notChecked` saying why — never a
//     refusal and never a guarantee. Every baseline saved before this has no verdict either.
//
// ⛔ THE ROUTE (review of the B6 fixes, MF-1). server.js's POST /api/map/save-baseline passed { modRoot } alone, so in the app every
// baseline was saved unchecked: Save 2 of the FATAL map answered 200, and no baseline ever kept a verdict. It now passes the game folder
// and the dependency roots, resolved as GET /api/map/validate resolves them — section 6 derives that from the two routes, and drives the
// route itself on a game folder of its own: a good map is saved WITH its verdict, and a map Save stops for is refused with a 400.
// Where Nova finds no game, resolveHoi4GameRoot() still answers a path (NO_GAME_FOLDER) and validate judges the mod alone; handed on,
// that made a verdict — and so 🛟 Restore's promise — out of a map judged without the base game. The route asks the server's own
// "Nova found the game" predicate first and hands such a save no game folder: unchecked, never refused, never promised.
//
// The back-out control: drop the refusal and section 2 fails; drop the stored verdict and sections 1 and 4 fail; drop either argument
// of the route's call, or the found-the-game question, and section 6 fails.
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");

const HOME = fs.mkdtempSync(path.join(os.tmpdir(), "nova-baseline-known-home-"));
process.env.NOVA_HOME_DIR = HOME;
// section 6 starts the app itself: its app data and its mods root are this test's own temp folders, never the user's
process.env.APPDATA = path.join(HOME, "appdata"); process.env.NOVA_APP_DATA_DIR = process.env.APPDATA; process.env.XDG_CONFIG_HOME = process.env.APPDATA;
process.env.HOI4_MODS_ROOT = path.join(HOME, "mods");
for (const d of [process.env.APPDATA, process.env.HOI4_MODS_ROOT]) fs.mkdirSync(d, { recursive: true });
const md = require("./map-data.js");
const labels = require("./public/map-rule-labels.js");
const { maskJsComments, maskJsLiterals, jsBodyAt } = require("./testlib-strip-comments.js");

let pass = 0;
const fails = [];
const ok = (cond, label, detail) => {
  if (cond === true) { pass++; console.log("  ok   " + label); }
  else { fails.push(label); console.log("  FAIL " + label + (detail !== undefined ? "   -> " + JSON.stringify(detail).slice(0, 500) : "")); }
};
const tmps = [HOME];
const inside = (p, dir) => { const r = path.relative(dir, p); return !!r && !r.startsWith("..") && !path.isAbsolute(r); };
const GAME = fs.mkdtempSync(path.join(os.tmpdir(), "nova-baseline-known-game-")); tmps.push(GAME);   // a game folder with nothing in it

function mkMod(tag) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "nova-baseline-known-" + tag + "-")); tmps.push(root);
  const w = (rel, body) => { const p = path.join(root, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, body, "utf8"); };
  w("descriptor.mod", 'name="known"\nsupported_version="1.*"\n');
  w("map/definition.csv", "0;0;0;0;land;false;unknown;0\n1;10;10;10;land;false;plains;1\n2;20;20;20;land;false;plains;1\n");
  w("map/strategicregions/1-A.txt", 'strategic_region = { id = 1 name = "A" provinces = { 1 2 } }\n');
  w("history/states/1-Real.txt", 'state = { id = 1 name = "STATE_1" manpower = 100 state_category = town provinces = { 1 2 } history = { owner = GER } }\n');
  w("history/countries/GER - Germany.txt", "capital = 1\n");
  const empty = () => w("history/states/1-Real.txt", 'state = { id = 1 name = "STATE_1" manpower = 100 state_category = town provinces = { } history = { owner = GER } }\n');
  return { root, w, empty };
}
function hashTree(dir, base = dir, out = new Map()) {
  let entries = [];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { return out; }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) hashTree(p, base, out);
    else out.set(path.relative(base, p), crypto.createHash("sha1").update(fs.readFileSync(p)).digest("hex"));
  }
  return out;
}
const sameTree = (a, b) => a.size === b.size && [...a].every(([k, v]) => b.get(k) === v);
const metaOf = (dir) => { try { return JSON.parse(fs.readFileSync(path.join(dir, "_baseline.json"), "utf8")); } catch (_) { return null; } };
const fatalOf = (problems) => problems.filter((p) => labels.isFatalRule(p.rule)).map((p) => p.rule);
let server = null;

(async () => {
try {
  // ═══ 1. A GOOD MAP: SAVED, WITH THE VERDICT KEPT ═══════════════════════════════════════════════════════════════════════
  console.log("\n=== 1. a map Save does not stop for is saved, and what the check said goes with it ===");
  const A = mkMod("good");
  let first;
  {
    const probs = md.reportedMapProblems({ modRoot: A.root, gameRoot: GAME, dependencyRoots: [] });
    ok(Array.isArray(probs) && fatalOf(probs).length === 0, "THE CONTROL: validate finds nothing fatal on the good map", probs.map((p) => p.rule));
    first = md.saveMapBaseline({ modRoot: A.root, gameRoot: GAME, dependencyRoots: [] });
    ok(first.ok === true && inside(first.baselinePath, HOME), "the baseline is saved", first);
    ok(first.heldVerdict && first.heldVerdict.fatal === 0 && Array.isArray(first.heldVerdict.rules) && first.heldVerdict.rules.length === 0,
      "⭐⭐ …and the answer carries the verdict: nothing Save stops for", first.heldVerdict);
    const meta = metaOf(first.baselinePath);
    ok(meta && meta.heldVerdict && meta.heldVerdict.fatal === 0 && meta.heldVerdict.rules.length === 0,
      "⭐⭐⭐ the verdict is KEPT in _baseline.json, for the page to read later", meta && meta.heldVerdict);
    const info = md.getMapBaselineInfo({ modRoot: A.root });
    ok(info.exists && info.heldVerdict && info.heldVerdict.fatal === 0 && info.heldVerdict.rules.length === 0,
      "⭐⭐⭐ getMapBaselineInfo hands it to the page as heldVerdict { fatal, rules } (B6-5)", info);
  }

  // ═══ 2. A MAP SAVE STOPS FOR: REFUSED, AND THE BASELINE IN PLACE IS UNTOUCHED ═════════════════════════════════════════
  console.log("\n=== 2. a map with a problem Save stops for is refused, and the copy known to load stays as it was ===");
  {
    A.empty();
    const fatal = fatalOf(md.reportedMapProblems({ modRoot: A.root, gameRoot: GAME, dependencyRoots: [] }));
    ok(fatal.includes("empty_capital_state") && fatal.includes("land_not_in_state"),
      "THE CONTROL: the emptied state is two problems the curated fatal set names (B6-4's measured case)", fatal);
    const parent = path.dirname(first.baselinePath);
    const before = hashTree(parent);
    const r = md.saveMapBaseline({ modRoot: A.root, gameRoot: GAME, dependencyRoots: [] });
    ok(r.ok === false && r.refused === "fatal", "⭐⭐⭐ the save is REFUSED", r);
    ok(r.verdict && r.verdict.fatal === fatal.length && ["empty_capital_state", "land_not_in_state"].every((x) => r.verdict.rules.includes(x)),
      "⭐⭐ …with the problems it found, counted as the Save gate counts them", r.verdict);
    const words = String(r.error || "");
    ok(["empty_capital_state", "land_not_in_state"].every((x) => words.includes(labels.mapRuleLabel(x))),
      "⭐⭐ the words NAME the problems (as Map Errors labels them)", words);
    ok(/the copy of your map known to load/.test(words) && /Restore baseline puts back/.test(words),
      "⭐⭐ …and say a baseline is the copy known to load, the one Restore puts back", words);
    ok(/Your baseline from \d{4}-\d\d-\d\d \d\d:\d\d UTC is kept as it was/.test(words), "⭐ …and that the baseline in place is kept, with its time", words);
    ok(!/fs\.|rmSync|undefined|\[object/.test(words), "…in plain words", words);
    ok(sameTree(before, hashTree(parent)), "⭐⭐⭐ NOT ONE BYTE under map_baselines changed: no folder added, none moved, none removed",
      { before: before.size, after: hashTree(parent).size });
    const info = md.getMapBaselineInfo({ modRoot: A.root });
    ok(info.savedAt === first.savedAt && info.heldVerdict && info.heldVerdict.fatal === 0, "…and Nova still reports the first baseline, with its verdict", info);
    // and a mod with no baseline yet: refused, and nothing is made
    const B = mkMod("first-is-broken");
    B.empty();
    const rb = md.saveMapBaseline({ modRoot: B.root, gameRoot: GAME, dependencyRoots: [] });
    ok(rb.ok === false && rb.refused === "fatal" && /No baseline was saved/.test(rb.error || ""), "⭐ a first baseline of a broken map is refused too, and says none was saved", rb);
    ok(!md.getMapBaselineInfo({ modRoot: B.root }).exists, "…and no baseline exists for it");
  }

  // ═══ 3. NO GAME FOLDER, OR A CHECK THAT CANNOT RUN: UNCHECKED, NEVER A GUARANTEE ══════════════════════════════════════
  console.log("\n=== 3. a save the check could not judge is made unchecked: no verdict, and the answer says why ===");
  {
    const C = mkMod("unchecked");
    C.empty();
    const r = md.saveMapBaseline({ modRoot: C.root });
    ok(r.ok === true && !r.heldVerdict && /no game folder/.test(r.notChecked || ""), "⭐⭐ with no game folder the save is made, unchecked, and says so", r);
    ok(metaOf(r.baselinePath) && !("heldVerdict" in metaOf(r.baselinePath)), "⭐⭐ …and keeps NO verdict in _baseline.json", metaOf(r.baselinePath));
    ok(!("heldVerdict" in md.getMapBaselineInfo({ modRoot: C.root })), "⭐⭐⭐ …so the page is handed no verdict to promise anything from");
    const D = mkMod("check-throws");
    D.empty();   // a map with problems on it, so the rules are asked
    const real = labels.isFatalRule;
    let rd;
    try {
      labels.isFatalRule = () => { throw new Error("simulated rules failure"); };
      rd = md.saveMapBaseline({ modRoot: D.root, gameRoot: GAME, dependencyRoots: [] });
    } finally { labels.isFatalRule = real; }
    ok(rd && rd.ok === true && !rd.heldVerdict && /could not run/.test(rd.notChecked || "") && /simulated/.test(rd.notChecked || ""),
      "⭐ a check that throws is the same: saved unchecked, the reason said, no verdict", rd);
    ok(!("heldVerdict" in md.getMapBaselineInfo({ modRoot: D.root })), "…and none handed to the page");
  }

  // ═══ 4. A VERDICT THAT IS NOT ONE IS NOT HANDED ON ═════════════════════════════════════════════════════════════════════
  console.log("\n=== 4. getMapBaselineInfo hands on only a verdict of the right shape ===");
  {
    const E = mkMod("junk");
    const r = md.saveMapBaseline({ modRoot: E.root, gameRoot: GAME, dependencyRoots: [] });
    const metaFile = path.join(r.baselinePath, "_baseline.json");
    const meta = metaOf(r.baselinePath);
    for (const junk of [{ fatal: "0", rules: [] }, { fatal: 0 }, { fatal: -1, rules: [] }, { fatal: 0, rules: [3] }, "ok", null]) {
      fs.writeFileSync(metaFile, JSON.stringify({ ...meta, heldVerdict: junk }), "utf8");
      ok(!("heldVerdict" in md.getMapBaselineInfo({ modRoot: E.root })), "a verdict of " + JSON.stringify(junk) + " is not handed on");
    }
    fs.writeFileSync(metaFile, JSON.stringify({ ...meta, heldVerdict: { fatal: 2, rules: ["empty_state"] } }), "utf8");
    const info = md.getMapBaselineInfo({ modRoot: E.root });
    ok(info.heldVerdict && info.heldVerdict.fatal === 2 && info.heldVerdict.rules[0] === "empty_state", "…and one of the right shape is, as it was kept", info.heldVerdict);
  }

  // ═══ 5. 🔎 DERIVED: THE CHECK IS THE VALIDATE ROUTE'S, AND THE GATE'S PREDICATE ═══════════════════════════════════════
  console.log("\n=== 5. the check asks exactly what GET /api/map/validate answers, and counts what the Save gate counts ===");
  {
    const CALLS = /\b(findStateFileConflicts|validateMapModel|findBuildingAnchorMismatches|validateMapBitmap|buildMapModel|readOnlyMapPass)\(/g;
    const bodyOf = (file, anchor) => {
      const src = fs.readFileSync(path.join(__dirname, file), "utf8");
      const code = maskJsComments(src), lit = maskJsLiterals(src);
      const at = code.indexOf(anchor);
      const span = at >= 0 ? jsBodyAt(lit, at) : null;
      return span ? code.slice(span[0], span[1] + 1) : "";
    };
    const route = bodyOf("server.js", 'app.get("/api/map/validate"');
    const mine = bodyOf("map-data.js", "function reportedMapProblems(");
    const seq = (b) => [...b.matchAll(CALLS)].map((m) => m[1]);
    ok(route.length > 200 && mine.length > 100, "both bodies were found (or the comparison proves nothing)", { route: route.length, mine: mine.length });
    ok(JSON.stringify(seq(mine)) === JSON.stringify(seq(route)),
      "⭐⭐⭐ reportedMapProblems makes the validate route's calls, in its order", { route: seq(route), mine: seq(mine) });
    const LIST = /return\s*\[\s*([^\]]*)\]|const problems\s*=\s*\[\s*([^\]]*)\]/;
    const listOf = (b) => { const m = b.replace(/mapData\./g, "").match(LIST); return m ? (m[1] || m[2]).replace(/\s+/g, "") : ""; };
    ok(!!listOf(route) && listOf(mine) === listOf(route), "⭐⭐ …and answers them in the route's order", { route: listOf(route), mine: listOf(mine) });
    ok(/cacheStableLayers:\s*true/.test(route) && /cacheStableLayers:\s*true/.test(mine), "…and builds the model the same way");
    const check = bodyOf("map-data.js", "function baselineHealthCheck(");
    ok(/reportedMapProblems\(/.test(check) && /\.isFatalRule\(/.test(check), "⭐⭐ the baseline check counts reportedMapProblems by isFatalRule", check.length);
    const gate = bodyOf(path.join("public", "map.js"), "async function mapCrashGate(");
    ok(/isFatalRule/.test(gate) && /\/api\/map\/validate/.test(fs.readFileSync(path.join(__dirname, "public", "map.js"), "utf8")),
      "⭐ …which is the predicate the Save gate counts the validate answer by", gate.length);
    const save = bodyOf("map-data.js", "function saveMapBaseline(");
    const ask = save.indexOf("baselineHealthCheck("), firstWrite = save.search(/\b(?:mkdirSync|cpSync|renameSync|writeFileSync|copyFileSync)\(/);
    ok(ask > 0 && firstWrite > ask, "⭐⭐ the check is asked BEFORE the save writes or moves anything", { ask, firstWrite });
  }

  // ═══ 6. THE ROUTE: THE APP'S OWN SAVE BASELINE ASKS IT (review MF-1) ══════════════════════════════════════════════════
  console.log("\n=== 6. POST /api/map/save-baseline hands the check the game folder and the mods beneath, as validate resolves them ===");
  {
    // 🔎 derived from the two routes (comments masked): the resolver the validate route asks for each root is the one the
    // save-baseline route hands saveMapBaseline — an argument dropped, or resolved some other way, is a baseline saved unchecked
    const src = fs.readFileSync(path.join(__dirname, "server.js"), "utf8");
    const code = maskJsComments(src), lit = maskJsLiterals(src);
    const routeBody = (anchor) => { const at = code.indexOf(anchor); const span = at >= 0 ? jsBodyAt(lit, at) : null; return span ? code.slice(span[0], span[1] + 1) : ""; };
    const validate = routeBody('app.get("/api/map/validate"'), saveRoute = routeBody('app.post("/api/map/save-baseline"');
    const gameFn = (validate.match(/\bgameRoot\s*=\s*([A-Za-z_$][\w$]*)\(\s*\)/) || [])[1] || "";
    const depFn = (validate.match(/\bdependencyRoots\s*:[^,\n]*?\b([A-Za-z_$][\w$]*)\(\s*activeModRoot\s*\)/) || [])[1] || "";
    ok(saveRoute.length > 100 && gameFn === "resolveHoi4GameRoot" && depFn === "resolveDependencyRootsForAssets",
      "THE CONTROL: both routes were found, and the validate route's resolvers read off it", { save: saveRoute.length, gameFn, depFn });
    const callAt = saveRoute.search(/\bsaveMapBaseline\(/);
    const argText = (() => {
      if (callAt < 0) return "";
      const open = saveRoute.indexOf("(", callAt);
      for (let d = 0, j = open; j < saveRoute.length; j++) { if (saveRoute[j] === "(") d++; else if (saveRoute[j] === ")" && --d === 0) return saveRoute.slice(open + 1, j); }
      return "";
    })();
    /** what the call hands saveMapBaseline as `name`: `name: <expr>`, or the shorthand `name` declared in the route as `name = <expr>` */
    const passed = (name) => {
      const explicit = argText.match(new RegExp(`\\b${name}\\s*:\\s*([^,}]+)`));
      if (explicit) return explicit[1].trim();
      if (new RegExp(`[{,]\\s*${name}\\s*[,}]`).test(argText)) { const decl = saveRoute.match(new RegExp(`\\b${name}\\s*=\\s*([^,;]+)`)); return decl ? decl[1].trim() : "(undeclared)"; }
      return "";
    };
    const g = passed("gameRoot"), dr = passed("dependencyRoots");
    // the predicate the server answers "Nova found the game" with, read off its own source: the one small function that asks gameFn()
    // and returns its comparison with NO_GAME_FOLDER (hoi4GameFolderFound today) — a save of a PC with no game found is given none
    const foundFns = [];
    for (const m of code.matchAll(/\bfunction\s+([A-Za-z_$][\w$]*)\s*\(\s*\)\s*\{/g)) {
      const span = jsBodyAt(lit, m.index), body = span ? code.slice(span[0], span[1] + 1) : "";
      if (body.length < 400 && body.includes(gameFn + "()") && /\breturn\b[^;]*\bNO_GAME_FOLDER\b/.test(body)) foundFns.push(m[1]);
    }
    const foundFn = foundFns.length === 1 ? foundFns[0] : "";
    ok(foundFn === "hoi4GameFolderFound", "THE CONTROL: the server's one \"Nova found the game\" predicate, read off its source", foundFns);
    ok(/^\{\s*modRoot\b/.test(argText.trim()), "the call hands it the mod", argText.slice(0, 160));
    ok(!!foundFn && new RegExp(`^${foundFn}\\(\\s*\\)\\s*\\?\\s*${gameFn}\\(\\s*\\)\\s*:\\s*null$`).test(g),
      "⭐⭐⭐ …and the game folder, resolved as validate resolves it — and none where Nova finds no game", { gameRoot: g, want: `${foundFn}() ? ${gameFn}() : null` });
    ok(new RegExp(`^${depFn}\\(\\s*modRoot\\s*\\)$`).test(dr), "⭐⭐⭐ …and the mods beneath it, resolved as validate resolves them", { dependencyRoots: dr, want: depFn + "(modRoot)" });

    // ⭐ DRIVEN: the route itself, on a game folder of its own (hoi4.exe a stub, nothing else in it), with the page's own body
    const GAME_EXE = fs.mkdtempSync(path.join(os.tmpdir(), "nova-baseline-known-gameexe-")); tmps.push(GAME_EXE);
    fs.writeFileSync(path.join(GAME_EXE, "hoi4.exe"), "not really an exe");
    // detection kept off this machine (server.js's test hook), so a request made with HOI4_ROOT unset is a PC with no game found —
    // never this machine's own Steam copy, which is not this test's to read
    process.env.NOVA_TEST_GAME_DETECTION = "off";
    process.env.HOI4_ROOT = GAME_EXE;
    const { createApp } = require("./server.js");
    server = await new Promise((res, rej) => { const s = createApp().listen(0, "127.0.0.1", () => res(s)); s.on("error", rej); });
    const base = `http://127.0.0.1:${server.address().port}`;
    const R = mkMod("route");
    const post = (ep, body) => fetch(base + ep, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      .then(async (r) => ({ s: r.status, b: await r.json().catch(() => ({})) }));
    const s1 = await post("/api/map/save-baseline", { modPath: R.root });   // public/map.js: body: JSON.stringify({ modPath: modPath() })
    ok(s1.s === 200 && s1.b.ok === true && inside(s1.b.baselinePath || "", HOME), "the app saves a baseline of the good map", s1);
    ok(s1.b.heldVerdict && s1.b.heldVerdict.fatal === 0 && Array.isArray(s1.b.heldVerdict.rules) && s1.b.heldVerdict.rules.length === 0 && !("notChecked" in s1.b),
      "⭐⭐⭐ …CHECKED: its answer carries the verdict, not `notChecked` (with { modRoot } alone it said “no game folder was given”)", s1.b);
    ok(!!(md.getMapBaselineInfo({ modRoot: R.root }).heldVerdict), "⭐⭐ …and the baseline keeps it for the page");
    R.empty();
    const v = await fetch(`${base}/api/map/validate?modPath=${encodeURIComponent(R.root)}`).then((r) => r.json());
    const vFatal = [...new Set(fatalOf((v && v.problems) || []))].sort();
    ok(vFatal.includes("empty_capital_state") && vFatal.includes("land_not_in_state"), "THE CONTROL: the app's own Map Errors now finds problems Save stops for", vFatal);
    const parent = path.dirname(s1.b.baselinePath || HOME), before = hashTree(parent);
    const s2 = await post("/api/map/save-baseline", { modPath: R.root });
    ok(s2.s === 400 && s2.b.ok === false && s2.b.refused === "fatal", "⭐⭐⭐ the app REFUSES Save baseline of that map (400)", s2);
    ok(s2.b.verdict && JSON.stringify([...new Set(s2.b.verdict.rules)].sort()) === JSON.stringify(vFatal),
      "⭐⭐ …for exactly the problems the app's Map Errors calls fatal on the same map", { refused: s2.b.verdict, validate: vFatal });
    ok(/the copy of your map known to load/.test(String(s2.b.error || "")), "⭐ …in the refusal's own words", s2.b.error);
    ok(sameTree(before, hashTree(parent)), "⭐⭐⭐ …and the baseline known to load is kept byte for byte", { before: before.size, after: hashTree(parent).size });

    // ⭐ …AND WHERE NOVA FINDS NO GAME: a good map, saved by the same click with no game folder to judge it over (HOI4_ROOT unset,
    // detection off). resolveHoi4GameRoot() answers NO_GAME_FOLDER, a path; handed on, the check judged the mod alone and the verdict it
    // stored ({fatal 0}) is the one 🛟 Restore turns into "It does guarantee the game loads". Unchecked instead: saved, no verdict, and
    // the answer says why.
    const N = mkMod("nogame");
    delete process.env.HOI4_ROOT;
    let s3 = null;
    try { s3 = await post("/api/map/save-baseline", { modPath: N.root }); } finally { process.env.HOI4_ROOT = GAME_EXE; }
    ok(s3.s === 200 && s3.b.ok === true && !("heldVerdict" in s3.b) && typeof s3.b.notChecked === "string" && /no game folder/.test(s3.b.notChecked),
      "⭐⭐⭐ with no game found, the app's Save baseline is made UNCHECKED — saved, no verdict, and it says why", s3);
    ok(!md.getMapBaselineInfo({ modRoot: N.root }).heldVerdict, "⭐⭐ …and the baseline it keeps carries no verdict for the page to promise on");
  }
} catch (e) { ok(false, "threw: " + e.message + "\n" + e.stack); }
finally {
  if (server) { try { server.closeAllConnections(); } catch (_) {} await new Promise((r) => server.close(() => r())); }
  for (const d of tmps) { if (inside(d, os.tmpdir())) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} } }
}
console.log(`\n  ${pass} passed, ${fails.length} failed`);
if (fails.length) { for (const f of fails) console.log("  ✗ " + f); }
process.exitCode = fails.length ? 1 : 0;
})();
