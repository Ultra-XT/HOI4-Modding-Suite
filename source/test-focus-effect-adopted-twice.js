// #focus-effect-adopted-twice
//
// EVERY CONDITIONAL IN EVERY FOCUS WAS WRITTEN TO THE FILE TWICE, on every save, whether or not the user
// had touched that focus. A focus granting 1000 manpower granted 2000. A `start_civil_war` fired twice.
// Dragging one unrelated node and pressing Save did it to the whole tree, and the next save did it again to
// the doubled file — vanilla's germany.txt went 846,720 -> 1,114,543 bytes on the first save and kept
// growing.
//
// THE MECHANISM. When a completion_reward carries no `# focus_editor:` markers, ADOPTION copies every
// top-level unit of the body verbatim into a fresh managed segment (that verbatim copy is itself a fix —
// #focus-adoption-decomposes-scoped-rewards). The MIGRATION step then deletes from the body the units it
// believes adoption took, and it decided that by asking `isRecognizedEffectUnit`. That predicate answers a
// different question — "can the Reward Lab render this?" — and it says NO for `limit`, `trigger`, `if`,
// `else` and `else_if`, because those are TRIGGERS rather than effects (#focus-scoped-limit-split), and NO
// for anything without a preset, such as `custom_effect_tooltip` or a bare `## comment ##`. Those are
// exactly the units adoption had just copied. They stayed in the body AND appeared in the segment.
//
// The predicate now asked is "did this body unit end up in the SEGMENT?", which is a different set again,
// because three passes run over the segment after adoption hands it over — `reorderManagedSegmentLines`,
// `sanitizeNationalIdeaManagedLinesForSave` and `processManagedSegmentCosmeticHiddenEffect` — and each of
// them drops or rewrites units. Pruning the body against what adoption TOOK instead of what the segment
// CARRIES trades the duplication for silent deletion, which is worse; vanilla's AFG_return_of_the_emir is
// the case that pins it, holding two `remove_ideas` whose matching `add_ideas` live in other focuses, which
// the national-idea sanitiser strips out of the segment.
//
// Matching also has to be MULTIPLICITY-AWARE. `custom_effect_tooltip = generic_skip_one_line_tt` occurs four
// times in that one reward. A set-membership test cannot tell four survivors from three.
//
// Reaching zero needed two adjacent repairs in the same pipeline, both nesting-blindness in the segment
// passes, both previously masked by the duplication:
//   * `stripEmptyHiddenEffectBlocksFromSegment` read "empty" as "no whole lines between the opening and
//     closing lines", so a `hidden_effect` whose braces shared a line with its contents was deleted.
//   * `wrapStandaloneCosmeticTagInHiddenEffectSegment` searched and anchored at ANY depth, so it deleted
//     already-nested `set_cosmetic_tag`s and spliced its new block inside conditionals.
//
// This file measures the corpus rather than a fixture, because "does a save duplicate script" is a property
// of real trees — the fixture I would have written first would have missed the multiplicity problem, the
// `category = naval_doctrine # optional` normalisation mismatch, and both nesting bugs.
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const fails = [];
let checks = 0;
function rec(label, cond, detail) {
  checks++;
  if (cond) console.log("  ok   " + label);
  else {
    fails.push(label);
    console.log("  FAIL " + label + "  -> " + String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 700));
  }
}

const APP_PATH = path.join(__dirname, "public", "app.js");
const APP_SRC = fs.readFileSync(APP_PATH, "utf8");

// public/app.js is browser code. Load it in a DOM-stubbed VM — `function` declarations attach to the
// sandbox, which is enough to reach the rewriters.
function loadApp(source) {
  const noop = () => {};
  const el = new Proxy({}, {
    get: (t, k) => {
      if (k === "style") return new Proxy({}, { get: () => "", set: () => true });
      if (k === "classList") return { add: noop, remove: noop, toggle: noop, contains: () => false };
      if (k === "dataset") return {};
      if (k === "children" || k === "options") return [];
      if (k === "querySelectorAll") return () => [];
      if (k === "getBoundingClientRect") return () => ({ x: 0, y: 0, width: 0, height: 0, top: 0, left: 0 });
      if (typeof k === "string" && /^(addEventListener|removeEventListener|appendChild|remove|focus|blur|click|setAttribute|dispatchEvent|insertBefore|replaceChildren|scrollTo)$/.test(k)) return noop;
      if (k === "querySelector" || k === "closest") return () => null;
      return "";
    },
    set: () => true,
  });
  const documentStub = new Proxy({}, {
    get: (t, k) => {
      if (k === "getElementById" || k === "querySelector") return () => null;
      if (k === "querySelectorAll") return () => [];
      if (k === "createElement") return () => el;
      if (k === "addEventListener") return noop;
      if (k === "body" || k === "documentElement" || k === "head") return el;
      if (k === "readyState") return "loading";
      return undefined;
    },
    set: () => true,
  });
  const sandbox = {
    console: { log: noop, warn: noop, error: noop, info: noop, debug: noop },
    JSON, Math, Date, Object, Array, String, Number, Boolean, RegExp, Error, Set, Map, Promise,
    parseInt, parseFloat, isNaN, isFinite, encodeURIComponent, decodeURIComponent,
    setTimeout: noop, clearTimeout: noop, setInterval: noop, clearInterval: noop,
    requestAnimationFrame: noop, fetch: () => Promise.resolve({ json: () => Promise.resolve({}) }),
    localStorage: { getItem: () => null, setItem: noop, removeItem: noop },
    document: documentStub, navigator: { userAgent: "node", clipboard: {} },
    location: { href: "http://localhost/", search: "" },
    alert: noop, prompt: () => null, confirm: () => false, performance: { now: () => 0 },
    addEventListener: noop, removeEventListener: noop,
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  let err = "";
  try { vm.runInContext(source, sandbox, { filename: "app.js" }); } catch (e) { err = e.message; }
  // Module-scope `let`s live in the context's global lexical scope, so a second script can reach them.
  try {
    vm.runInContext(
      "function __seed(id, l) { pendingEffectEdits.set(id, l); }" +
      "function __clearPending() { pendingDeletedBlocks.clear(); pendingNewFocuses.clear();" +
      " pendingEffectEdits.clear(); pendingEffectRemovals.clear(); pendingEffectBlockRemovals.clear(); }",
      sandbox
    );
  } catch (e) { err = err || e.message; }
  return { sandbox, err };
}

// Brace-aware, comment-aware, string-aware scan. A naive /if\s*=\s*\{/ would count the word inside a
// `log = "…if…"` string and inside every `# comment`, and this test's whole claim is a count.
function scanScript(text) {
  const blocks = new Map();
  const s = String(text || "");
  const toks = [];
  let i = 0;
  const n = s.length;
  while (i < n) {
    const c = s[i];
    if (c === "#") { while (i < n && s[i] !== "\n") i += 1; continue; }
    if (c === '"') {
      let j = i + 1;
      while (j < n) {
        if (s[j] === "\\") { j += 2; continue; }
        if (s[j] === '"') { j += 1; break; }
        j += 1;
      }
      toks.push({ t: "str" });
      i = j; continue;
    }
    if (c === "{" || c === "}") { toks.push({ t: c }); i += 1; continue; }
    if (c === "=") { toks.push({ t: "=" }); i += 1; continue; }
    if (c === "<" || c === ">") { i += 1; if (s[i] === "=") i += 1; toks.push({ t: "=" }); continue; }
    if (/\s/.test(c)) { i += 1; continue; }
    let j = i;
    while (j < n && !/[\s{}="#<>]/.test(s[j])) j += 1;
    toks.push({ t: "id", v: s.slice(i, j) });
    i = j;
  }
  for (let k = 0; k < toks.length; k += 1) {
    if (toks[k].t !== "=") continue;
    const left = toks[k - 1];
    const right = toks[k + 1];
    if (!left || left.t !== "id" || !right || right.t !== "{") continue;
    const key = String(left.v).toLowerCase();
    blocks.set(key, (blocks.get(key) || 0) + 1);
  }
  return blocks;
}
const COND_KEYS = ["if", "else", "else_if", "limit", "trigger"];
function condTotal(blocks) {
  return COND_KEYS.reduce((a, k) => a + (blocks.get(k) || 0), 0);
}

const ROOTS = {
  // EVERY installed corpus. Measuring vanilla and Millennium Dawn alone let a ONE-DAY-OLD regression
  // through: #legacy-sanitize-eats-a-shared-closing-brace split `} } } }` into two lines, and since
  // effectUnitCompareLines runs every side of this comparison through that same sanitiser, the body copy
  // stopped being recognised and RON_Ethiopia.txt#ETH_coop_eng_infr had its whole completion_reward written
  // twice. Neither of the two corpora measured has a line of that shape.
  vanilla: "D:/SteamLibrary/steamapps/common/Hearts of Iron IV/common/national_focus",
  MD: "D:/SteamLibrary/steamapps/workshop/content/394360/2777392649/common/national_focus",
  "Road to 56": "D:/SteamLibrary/steamapps/workshop/content/394360/820260968/common/national_focus",
  "Old World Blues": "D:/SteamLibrary/steamapps/workshop/content/394360/2265420196/common/national_focus",
  "Rise of Nations": "D:/SteamLibrary/steamapps/workshop/content/394360/2026448968/common/national_focus",
};
function readTree(root, file) {
  try { return fs.readFileSync(path.join(ROOTS[root], file), "utf8"); } catch (_) { return ""; }
}

// One save of one focus's effects, the way rewriteCoordinates calls it: the payload the editor holds for a
// focus it did not write is exactly what the adoption extractor returns.
function saveFocusEffects(sb, blockText, focus) {
  const adopted = sb.extractCompletionRewardManagedLines(blockText) || [];
  if (!adopted.length) return null;
  return sb.rewriteFocusBlockEffects(blockText, focus, adopted, new Set(), []);
}

console.log("\n[harness] the editor's own rewriters, loaded out of public/app.js");
const { sandbox: app, err: loadErr } = loadApp(APP_SRC);
rec("app.js loaded without throwing", !loadErr, loadErr);
for (const fn of [
  "rewriteFocusBlockEffects", "extractCompletionRewardManagedLines", "pruneAdoptedUnitsFromFocusBody",
  "effectUnitCompareLines", "consumeEffectLineRun", "parseFocuses", "rewriteCoordinates",
]) {
  rec(`${fn} is reachable`, typeof app[fn] === "function", typeof app[fn]);
}

console.log("\n[unit] the match has to count copies, not just membership");
if (typeof app.consumeEffectLineRun === "function") {
  const hay = ["a", "b", "a"];
  const used = [false, false, false];
  rec("first copy of a repeated statement matches", app.consumeEffectLineRun(hay, used, ["a"]) === true, used);
  rec("…and so does the second", app.consumeEffectLineRun(hay, used, ["a"]) === true, used);
  rec("…but there is no third", app.consumeEffectLineRun(hay, used, ["a"]) === false, used);
  const hay2 = ["x", "y", "z"];
  const used2 = [false, false, false];
  rec("a run must be CONTIGUOUS", app.consumeEffectLineRun(hay2, used2, ["x", "z"]) === false, used2);
  rec("…and a contiguous one matches", app.consumeEffectLineRun(hay2, used2, ["x", "y"]) === true, used2);
}
if (typeof app.effectUnitCompareLines === "function") {
  // The payload is built through sanitizeLegacyManagedEffectLines, which strips the trailing comment off a
  // `category =` line. Comparing the raw body line against the sanitised payload line said "different
  // statement" and rewrote the whole enclosing block — 142 of the residual duplicates were this alone.
  const raw = app.effectUnitCompareLines(["\tcategory = naval_doctrine # optional "]);
  const norm = app.effectUnitCompareLines(["\tcategory = naval_doctrine # optional "], "SOME_focus");
  rec("without the focus id the line is only trimmed", raw[0] === "category = naval_doctrine # optional", raw);
  rec("with it, the line is normalised the way the payload was", norm[0] === "category = naval_doctrine", norm);
}

console.log("\n[fixture] a reward of one conditional plus repeated tooltips, saved once");
{
  const TREE = [
    "focus_tree = {",
    "\tid = dup_probe",
    "\tcountry = { factor = 1 }",
    "\tfocus = {",
    "\t\tid = dup_alpha",
    "\t\ticon = GFX_goal_generic_construct_civ_factory",
    "\t\tx = 1",
    "\t\ty = 0",
    "\t\tcost = 10",
    "\t\tcompletion_reward = {",
    "\t\t\tadd_manpower = 1000",
    "\t\t\tcustom_effect_tooltip = generic_skip_one_line_tt",
    "\t\t\tif = {",
    "\t\t\t\tlimit = { has_country_flag = probe_flag }",
    "\t\t\t\tadd_political_power = 50",
    "\t\t\t}",
    "\t\t\tcustom_effect_tooltip = generic_skip_one_line_tt",
    "\t\t\tstart_civil_war = { ruling_party = communism size = 0.5 }",
    "\t\t}",
    "\t}",
    "}",
    "",
  ].join("\n");
  const parsed = app.parseFocuses(TREE);
  const focus = (parsed.focuses || [])[0];
  rec("the fixture parses to one focus", !!focus && focus.id === "dup_alpha", parsed.focuses && parsed.focuses.length);
  if (focus) {
    const block = TREE.slice(focus.blockStart, focus.blockEnd);
    const before = scanScript(block);
    let out = "";
    try { out = saveFocusEffects(app, block, focus) || ""; } catch (e) { out = "THREW: " + e.message; }
    const after = scanScript(out);
    rec("the save produced a managed segment", /focus_editor: begin focus_effects/.test(out), out.slice(0, 200));
    rec("`if` is written once, not twice", (after.get("if") || 0) === (before.get("if") || 0), { before: before.get("if"), after: after.get("if") });
    rec("…and the `limit` inside it once", (after.get("limit") || 0) === (before.get("limit") || 0), { before: before.get("limit"), after: after.get("limit") });
    rec("…and `start_civil_war` fires once", (out.match(/start_civil_war/g) || []).length === 1, (out.match(/start_civil_war/g) || []).length);
    rec("…and 1000 manpower is still 1000", (out.match(/add_manpower\s*=\s*1000/g) || []).length === 1, out);
    rec("…and BOTH repeated tooltips survive, exactly twice total",
      (out.match(/custom_effect_tooltip/g) || []).length === 2, (out.match(/custom_effect_tooltip/g) || []).length);
  }
}

console.log("\n[the named cases] real focuses that each pinned a different half of this");
const CASES = [
  {
    root: "vanilla", file: "afghanistan.txt", id: "AFG_return_of_the_emir",
    why: "three IF blocks, four repeated tooltips, and two remove_ideas the idea sanitiser strips",
    expect: [
      ["start_civil_war fires once", (o) => (o.match(/start_civil_war/g) || []).length === 1],
      ["remove_ideas = AFG_turkish_military_mission survives, once", (o) => (o.match(/remove_ideas = AFG_turkish_military_mission/g) || []).length === 1],
      ["remove_ideas = AFG_mohammad_zahir_shah_ns_negative survives, once", (o) => (o.match(/remove_ideas = AFG_mohammad_zahir_shah_ns_negative/g) || []).length === 1],
      ["set_cosmetic_tag = AFG_emirate survives, once", (o) => (o.match(/set_cosmetic_tag = AFG_emirate/g) || []).length === 1],
    ],
  },
  {
    root: "vanilla", file: "afghanistan.txt", id: "AFG_the_faqirs_revolt",
    why: "the cosmetic-tag wrapper used to splice its hidden_effect INSIDE this focus's IF",
    expect: [],
  },
  {
    root: "vanilla", file: "belgium.txt", id: "BEL_cockerill_shipyards",
    why: "`category = naval_doctrine # optional` — the payload normaliser strips the comment",
    expect: [
      ["the ELSE branch is written once", (o) => (o.match(/ELSE\s*=\s*\{/g) || []).length === 1],
    ],
  },
  {
    root: "vanilla", file: "japan.txt", id: "JAP_strengthen_the_divine_wind",
    why: "one-line hidden_effect blocks that the empty-block strip used to delete outright",
    expect: [
      ["suicide_craft = 1 survives", (o) => /suicide_craft\s*=\s*1/.test(o)],
      ["popup = no survives", (o) => /popup\s*=\s*no/.test(o)],
    ],
  },
  {
    // No filename: located by its id below (MOVED 2026-09-11).
    root: "MD", id: "KOR_ignite_the_rebellion",
    why: "a 654-line hidden_effect holding 42 conditionals and a deeply nested set_cosmetic_tag",
    expect: [
      ["the nested set_cosmetic_tag survives, once", (o) => (o.match(/set_cosmetic_tag\s*=\s*KOR_REB_S/g) || []).length === 1],
    ],
  },
];
// ⚠️ MOVED 2026-09-11. Two named cases were pinned to Millennium Dawn FILENAMES. The owner reinstalled MD: the fresh
// copy renamed korea_south.txt, and rewrote BOS_Muslim_Nationalism (its id is lower-case now, and its hidden_effect
// no longer shares a line with the closing brace) — so "MD/korea_south.txt is readable" and "BOS_Muslim_Nationalism
// is present" failed on every commit. A case named for a FOCUS is now located by that focus id in its corpus, and a
// case that exists for a SHAPE is found by the shape in the installed corpora — Millennium Dawn first. Road to 56 is
// never asked: its workshop copy carries files a Nova session wrote into it, so nothing may be pinned to it.
const escapeRe = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
function locateFocusFile(root, id) {
  let names = [];
  try { names = fs.readdirSync(ROOTS[root]).filter((f) => /\.txt$/i.test(f)).sort(); } catch (_) { return null; }
  const re = new RegExp("(?:^|\\n)[ \\t]*id[ \\t]*=[ \\t]*" + escapeRe(id) + "(?![A-Za-z0-9_])");
  for (const n of names) if (re.test(readTree(root, n).replace(/#[^\n]*/g, ""))) return n;
  return null;
}
// A completion_reward holding `hidden_effect = {` whose only statement shares its line with the closing brace.
function findHiddenEffectCloserOnContentLine(sb) {
  const SHAPE = /(?:^|\n)[ \t]*hidden_effect[ \t]*=[ \t]*\{[ \t]*\r?\n[ \t]*([A-Za-z_][A-Za-z0-9_]*[ \t]*=[ \t]*[A-Za-z0-9_.@]+)[ \t]*\}/g;
  const order = ["MD"].concat(Object.keys(ROOTS).filter((r) => r !== "MD" && r !== "Road to 56"));
  for (const root of order) {
    let names = [];
    try { names = fs.readdirSync(ROOTS[root]).filter((f) => /\.txt$/i.test(f)).sort(); } catch (_) { continue; }
    for (const file of names) {
      const text = readTree(root, file);
      const masked = text.replace(/#[^\n]*/g, (c) => " ".repeat(c.length));
      const re = new RegExp(SHAPE.source, "g");
      let m, parsed = null;
      while ((m = re.exec(masked)) !== null) {
        if (!parsed) { try { parsed = sb.parseFocuses(text); } catch (_) { break; } }
        const focus = ((parsed && parsed.focuses) || []).find((f) => f.blockStart <= m.index && m.index < f.blockEnd);
        if (!focus) continue;
        const block = text.slice(focus.blockStart, focus.blockEnd);
        const rewardAt = block.search(/completion_reward\s*=\s*\{/);
        if (rewardAt === -1 || focus.blockStart + rewardAt > m.index) continue;
        let adopted = [];
        try { adopted = sb.extractCompletionRewardManagedLines(block) || []; } catch (_) {}
        if (!adopted.length) continue;
        return { root, file, id: focus.id, statement: m[1].replace(/\s*=\s*/, " = ") };
      }
    }
  }
  return null;
}
{
  const shaped = findHiddenEffectCloserOnContentLine(app);
  if (!shaped) {
    console.log("\n  SKIPPED — no installed focus ships a hidden_effect whose closing brace shares its only statement's line;"
      + " BACK-OUT CONTROL 2 still covers that shape by fixture");
  } else {
    const [k, v] = shaped.statement.split(" = ");
    const stmt = () => new RegExp(escapeRe(k) + "\\s*=\\s*" + escapeRe(v) + "(?![A-Za-z0-9_])", "g");
    CASES.push({
      root: shaped.root, file: shaped.file, id: shaped.id,
      why: `a hidden_effect whose closing brace shares a line with its only statement — found by shape in ${shaped.root}/${shaped.file}`,
      expect: [[`${shaped.statement} survives, exactly as often as the focus carries it`,
        (o, block) => (o.match(stmt()) || []).length === (block.match(stmt()) || []).length]],
    });
  }
}
for (const c of CASES) {
  if (!c.file) c.file = locateFocusFile(c.root, c.id);
  const text = c.file ? readTree(c.root, c.file) : "";
  if (!text) { rec(`${c.root}: a tree declaring ${c.id} is readable`, false, "not found"); continue; }
  let focus = null;
  try { focus = (app.parseFocuses(text).focuses || []).find((f) => f.id === c.id) || null; } catch (e) { /* reported below */ }
  rec(`${c.id} is present (${c.why})`, !!focus, "focus not found");
  if (!focus) continue;
  const block = text.slice(focus.blockStart, focus.blockEnd);
  let out = "";
  let threw = "";
  try { out = saveFocusEffects(app, block, focus) || ""; } catch (e) { threw = e.message; }
  rec(`${c.id} saves without throwing`, !threw, threw);
  if (threw) continue;
  const before = scanScript(block);
  const after = scanScript(out);
  const gained = COND_KEYS.map((k) => [k, (after.get(k) || 0) - (before.get(k) || 0)]).filter(([, d]) => d > 0);
  rec(`${c.id} gains no conditional block`, gained.length === 0, gained);
  for (const [label, fn] of c.expect) rec(`  …${label}`, fn(out, block), out.slice(0, 400));
}

console.log("\n[the corpus] every focus of every shipping tree, saved once");
function measureCorpus(sb, files) {
  let focuses = 0, threw = 0, condGain = 0, gainFocuses = 0, bytesIn = 0, bytesOut = 0;
  const worst = [];
  for (const [root, file] of files) {
    const text = readTree(root, file);
    if (!text) continue;
    let parsed;
    try { parsed = sb.parseFocuses(text); } catch (_) { continue; }
    for (const focus of (parsed && parsed.focuses) || []) {
      const block = text.slice(focus.blockStart, focus.blockEnd);
      let adopted = [];
      try { adopted = sb.extractCompletionRewardManagedLines(block) || []; } catch (_) {}
      if (!adopted.length) continue;
      focuses += 1;
      let out;
      try { out = sb.rewriteFocusBlockEffects(block, focus, adopted, new Set(), []); } catch (_) { threw += 1; continue; }
      bytesIn += block.length; bytesOut += out.length;
      const d = condTotal(scanScript(out)) - condTotal(scanScript(block));
      if (d > 0) {
        condGain += d; gainFocuses += 1;
        if (worst.length < 5) worst.push(`${root}/${file}#${focus.id} +${d}`);
      }
    }
  }
  return { focuses, threw, condGain, gainFocuses, bytesIn, bytesOut, worst };
}

const allFiles = [];
for (const root of Object.keys(ROOTS)) {
  let names = [];
  try { names = fs.readdirSync(ROOTS[root]).filter((f) => /\.txt$/i.test(f)).sort(); } catch (_) { continue; }
  for (const n of names) allFiles.push([root, n]);
}
rec("both corpora were readable", allFiles.filter(([r]) => r === "vanilla").length > 50 && allFiles.filter(([r]) => r === "MD").length > 50, allFiles.length);

const full = measureCorpus(app, allFiles);
console.log(`       ${allFiles.length} trees, ${full.focuses} focuses with a completion_reward, ${full.threw} refused`);
console.log(`       script written: ${full.bytesIn} bytes in -> ${full.bytesOut} out`);
rec("tens of thousands of focuses were exercised", full.focuses > 25000, full.focuses);
rec("ZERO focuses gain an if/else/else_if/limit/trigger block",
  full.condGain === 0, { condGain: full.condGain, gainFocuses: full.gainFocuses, worst: full.worst });
rec("…and a save does not inflate the file", full.bytesOut < full.bytesIn * 1.12, { in: full.bytesIn, out: full.bytesOut });

console.log("\n[twice] the same tree saved a second time must not drift");
{
  // The faithful loop: loadTreeFromSource seeds pendingEffectEdits for EVERY focus from the adoption
  // extractor, so a save with no Reward Lab edit still runs the whole rewriter over every focus.
  function fullSave(sb, text) {
    vm.runInContext("__clearPending();", sb);
    const parsed = sb.parseFocuses(text);
    if (!parsed || !parsed.focuses || !parsed.focuses.length) return null;
    for (const f of parsed.focuses) {
      const b = text.slice(f.blockStart, f.blockEnd);
      let m = [];
      try { m = sb.extractCompletionRewardManagedLines(b) || []; } catch (_) {}
      if (m.length) sb.__seed(f.id, m);
    }
    parsed.focuses[0].moved = true;
    return sb.rewriteCoordinates(text, parsed);
  }
  // The non-vanilla trees are the ones the named cases above were LOCATED in, not typed filenames (MOVED 2026-09-11).
  const SAMPLE = [
    ["vanilla", "afghanistan.txt"], ["vanilla", "germany.txt"], ["vanilla", "japan.txt"],
    ["vanilla", "belgium.txt"], ["vanilla", "italy.txt"],
    ...CASES.filter((c) => c.root !== "vanilla" && c.file).map((c) => [c.root, c.file]),
  ];
  let stable = 0, drifted = [];
  for (const [root, file] of SAMPLE) {
    const text = readTree(root, file);
    if (!text) continue;
    let p1, p2;
    try { p1 = fullSave(app, text); } catch (e) { drifted.push(`${file} pass1 threw: ${e.message.slice(0, 60)}`); continue; }
    if (!p1) continue;
    try { p2 = fullSave(app, p1); } catch (e) { drifted.push(`${file} pass2 threw: ${e.message.slice(0, 60)}`); continue; }
    const d = condTotal(scanScript(p2)) - condTotal(scanScript(p1));
    if (d !== 0) drifted.push(`${file} pass2 conditional delta ${d}`);
    else stable += 1;
  }
  rec("a second save adds nothing to a tree the first save already stamped", drifted.length === 0, drifted);
  rec("…measured on a real sample", stable >= 6, stable);
}

console.log("\n[BACK-OUT CONTROL] restore the old body prune; the corpus check must FAIL");
{
  // public/app.js is CRLF, so a control anchor spelled with "\n" would patch nothing and the control would
  // pass by doing nothing. Single-line anchors only, and the patch is asserted to have applied.
  const A1 = "    if (consumeEffectLineRun(segment, segmentConsumed, cmp)) return;";
  const A2 = "    if (consumeEffectLineRun(adopted, adoptedConsumed, cmp)) { keep[i] = true; return; }";
  const occurrences = (s, sub) => s.split(sub).length - 1;
  rec("control anchor 1 is present exactly once", occurrences(APP_SRC, A1) === 1, occurrences(APP_SRC, A1));
  rec("control anchor 2 is present exactly once", occurrences(APP_SRC, A2) === 1, occurrences(APP_SRC, A2));
  // Disabling both leaves `keep[i] = !isRecognizedEffectUnit(units[i])` — the exact rule the defect had.
  const patched = APP_SRC
    .replace(A1, "    if (false && consumeEffectLineRun(segment, segmentConsumed, cmp)) return;")
    .replace(A2, "    if (false && consumeEffectLineRun(adopted, adoptedConsumed, cmp)) { keep[i] = true; return; }");
  rec("the control source really differs from the shipped source", patched !== APP_SRC, "patch did not apply");

  const { sandbox: ctl, err: ctlErr } = loadApp(patched);
  rec("the control build loads", !ctlErr && typeof ctl.rewriteFocusBlockEffects === "function", ctlErr || typeof ctl.rewriteFocusBlockEffects);

  if (!ctlErr) {
    const ctlRun = measureCorpus(ctl, allFiles);
    console.log(`       control: ${ctlRun.focuses} focuses, ${ctlRun.gainFocuses} of them gain blocks, +${ctlRun.condGain} conditionals`);
    console.log(`       control: ${ctlRun.bytesIn} bytes in -> ${ctlRun.bytesOut} out`);
    rec("the control exercises the same corpus", ctlRun.focuses === full.focuses, { control: ctlRun.focuses, shipped: full.focuses });
    rec("CONTROL REPRODUCES THE DEFECT: thousands of conditional blocks duplicated",
      ctlRun.condGain > 20000, ctlRun.condGain);
    rec("…across thousands of focuses", ctlRun.gainFocuses > 3000, ctlRun.gainFocuses);
    rec("…and the shipped build is not merely quieter, it is at zero",
      full.condGain === 0 && ctlRun.condGain > full.condGain, { shipped: full.condGain, control: ctlRun.condGain });
    // The control must also fail the very assertion this file makes, or the assertion is not load-bearing.
    rec("the corpus assertion would FAIL against the control build", !(ctlRun.condGain === 0), ctlRun.condGain);
  }
}

console.log("\n[BACK-OUT CONTROL 2] restore the line-counting 'empty hidden_effect' test");
{
  // Measured at the function, not through the whole rewriter: the body prune's second stage now rescues a
  // unit the segment passes discarded, so end-to-end this defect no longer shows as an outright deletion —
  // it shows as a hidden_effect stranded OUTSIDE the managed segment. The honest control is therefore the
  // one function, fed the two shapes that broke it, against the implementation it replaced.
  const priorImplementation = (isStart, delta) => function (segmentLines) {
    const lines = [...(segmentLines || [])];
    let i = 0;
    while (i < lines.length) {
      if (!isStart(lines[i])) { i += 1; continue; }
      let j = i;
      let bal = delta(lines[j]);
      j += 1;
      while (j < lines.length && bal > 0) { bal += delta(lines[j]); j += 1; }
      if (bal !== 0) { i += 1; continue; }
      const inner = lines.slice(i + 1, j - 1)
        .map((ln) => String(ln || "").trim())
        .filter((ln) => ln.length > 0 && !ln.startsWith("#"));
      if (inner.length === 0) { lines.splice(i, j - i); continue; }
      i = j;
    }
    return lines;
  };
  const ok = typeof app.isHiddenEffectBlockStartLine === "function" && typeof app.effectLineBraceBalanceDelta === "function";
  rec("the helpers the control needs are reachable", ok, "missing");
  if (ok) {
    const control = priorImplementation(app.isHiddenEffectBlockStartLine, app.effectLineBraceBalanceDelta);
    const SHAPES = [
      ["a one-line hidden_effect (JAP_strengthen_the_divine_wind)",
        ["hidden_effect = { set_technology = { suicide_craft = 1 } }"], true],
      ["a hidden_effect whose closer shares its content line (BOS_Muslim_Nationalism)",
        ["hidden_effect = {", "add_ideas = intervention_neo_imperialism }"], true],
    ];
    for (const [label, lines, shouldSurvive] of SHAPES) {
      const shipped = app.stripEmptyHiddenEffectBlocksFromSegment(lines);
      const backedOut = control(lines);
      rec(`shipped keeps ${label}`, (shipped.length > 0) === shouldSurvive, shipped);
      rec(`CONTROL REPRODUCES THE DEFECT: ${label} is deleted`, backedOut.length === 0, backedOut);
      rec("  …so the two implementations really do disagree", JSON.stringify(shipped) !== JSON.stringify(backedOut), shipped);
    }
    // …and the function must still do the job it was written for.
    for (const [label, lines] of [
      ["braces on their own lines", ["hidden_effect = {", "}"]],
      ["braces on one line", ["hidden_effect = {  }"]],
      ["a comment only", ["hidden_effect = {", "# nothing here", "}"]],
    ]) {
      rec(`a genuinely empty hidden_effect (${label}) is still stripped`,
        app.stripEmptyHiddenEffectBlocksFromSegment(lines).length === 0, app.stripEmptyHiddenEffectBlocksFromSegment(lines));
    }
    rec("…and a normal multi-line hidden_effect is untouched",
      app.stripEmptyHiddenEffectBlocksFromSegment(["hidden_effect = {", "add_manpower = 5", "}"]).length === 3,
      app.stripEmptyHiddenEffectBlocksFromSegment(["hidden_effect = {", "add_manpower = 5", "}"]));
  }
}

console.log("\n[BACK-OUT CONTROL 3] the cosmetic-tag wrapper must stay at the segment's top level");
{
  // Nested tag: the old depth-blind scan found it, decided "there is already a hidden one", and deleted it.
  const nested = [
    "hidden_effect = {",
    "\trandom_country_with_original_tag = {",
    "\t\tset_cosmetic_tag = KOR_REB_S",
    "\t}",
    "}",
  ];
  const outN = app.wrapStandaloneCosmeticTagInHiddenEffectSegment(nested, "");
  rec("a set_cosmetic_tag nested two blocks deep is left alone",
    outN.join("\n").includes("set_cosmetic_tag = KOR_REB_S") && outN.length === nested.length, outN);
  // Nested anchor: the old scan anchored the new block after a tooltip inside a conditional.
  const anchored = [
    "if = {",
    "\tlimit = { has_country_flag = probe }",
    "\tcustom_effect_tooltip = inside_tt",
    "}",
    "set_cosmetic_tag = PROBE_tag",
  ];
  const outA = app.wrapStandaloneCosmeticTagInHiddenEffectSegment(anchored, "");
  const ifClose = outA.findIndex((l) => String(l).trim() === "}");
  const wrapAt = outA.findIndex((l) => /^hidden_effect\s*=\s*\{/.test(String(l).trim()));
  rec("the tag is wrapped", wrapAt >= 0, outA);
  rec("…and the wrapper lands OUTSIDE the conditional, not inside it", wrapAt > ifClose, { wrapAt, ifClose, outA });
  rec("…and the conditional is still intact", outA.join("\n").includes("custom_effect_tooltip = inside_tt"), outA);
}

console.log(`\n=== focus effect adopted twice: ${checks} checks, ${fails.length} failed ===`);
if (fails.length) { fails.forEach((f) => console.log("   FAILED: " + f)); process.exitCode = 1; }
