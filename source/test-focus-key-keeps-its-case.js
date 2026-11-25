// #focus-key-case-variant — THE SIDEBAR SHOWED AN EMPTY AVAILABILITY BOX FOR A FOCUS THAT HAS ONE, AND
// TYPING INTO IT WROTE A SECOND BLOCK.
//
// The fourth instance of the shape behind #event-key-case-variant, #decision-key-case-variant and
// #template-key-case-variant, found the same way: census the top-level keys of every real block, then ask
// which the maker models and which it preserves. The bug is in the ones that fall between.
//
// Real focus trees write the key capitalised — `AVAILABLE = { … }` in Old World Blues' Navarro Enclave tree,
// `Available` in Rise of Nations' RON_New_Zealand.txt, `SEARCH_FILTERS` in Road to 56's tibet.txt and
// `Bypass` in its italy.txt — against 50,033 canonical `available` and 47,644 `search_filters`.
//
// extractFocusSectionBody and stripAllSubsectionsNamed both build their regex from the section name with no
// `i`, so such a focus was:
//
//   • read as empty — the sidebar's Available box was blank for a focus that has a condition, and
//   • not found by the strip — so typing one wrote a second block instead of replacing the first.
//
// Two of the three fixes are one character and cover every caller: 11 for the extractor, 4 for the strip.
// The third keeps the author's spelling on the section the sidebar rewrites, so a focus whose availability
// was never touched is not rewritten from `AVAILABLE` to `available`.
//
// prerequisite and mutually_exclusive stay canonical on purpose — the corpus has no case variant of either,
// so preserving a spelling there would be machinery with nothing to test it.
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
    console.log("  FAIL " + label + "  -> " + String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 500));
  }
}

// Same DOM-stubbed VM load as test-focus-tree-saveability.js.
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
const sb = {
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
sb.window = sb; sb.globalThis = sb;
vm.createContext(sb);
let loadError = "";
try { vm.runInContext(fs.readFileSync(path.join(__dirname, "public", "app.js"), "utf8"), sb, { filename: "app.js" }); } catch (e) { loadError = String(e && e.message); }

const ROOTS = [
  ["vanilla", "D:/SteamLibrary/steamapps/common/Hearts of Iron IV"],
  ["Millennium Dawn", "D:/SteamLibrary/steamapps/workshop/content/394360/2777392649"],
  ["Road to 56", "D:/SteamLibrary/steamapps/workshop/content/394360/820260968"],
  ["Old World Blues", "D:/SteamLibrary/steamapps/workshop/content/394360/2265420196"],
  ["Rise of Nations", "D:/SteamLibrary/steamapps/workshop/content/394360/2026448968"],
];

const tree = (focusLines) => [
  "focus_tree = {",
  "\tid = probe_tree",
  "\tcountry = { factor = 0 }",
  "\tfocus = {",
  "\t\tid = probe_focus",
  "\t\ticon = GFX_goal_generic_construct_civ_factory",
  ...focusLines,
  "\t\tx = 0",
  "\t\ty = 0",
  "\t\tcost = 10",
  "\t\tcompletion_reward = {",
  "\t\t\tadd_political_power = 10",
  "\t\t}",
  "\t}",
  "}",
  "",
].join("\n");

const CAPS = ["\t\tSEARCH_FILTERS = { FOCUS_FILTER_MANPOWER }", "\t\tAVAILABLE = {", "\t\t\thas_war = no", "\t\t}", "\t\tBypass = { is_in_faction_with = ENG }"];
const LOWER = CAPS.map((l) => l.replace("SEARCH_FILTERS", "search_filters").replace("AVAILABLE", "available").replace("Bypass", "bypass"));

console.log("\n[ground truth] real trees capitalise these keys");
{
  const counts = { AVAILABLE: 0, Available: 0, SEARCH_FILTERS: 0, Bypass: 0 };
  let files = 0;
  const where = [];
  for (const [label, root] of ROOTS) {
    const dir = path.join(root, "common", "national_focus");
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith(".txt")) continue;
      let t; try { t = fs.readFileSync(path.join(dir, f), "utf8"); } catch (_) { continue; }
      let hit = false;
      for (const k of Object.keys(counts)) {
        const n = (t.match(new RegExp(`(^|\\n)[ \\t]*${k}\\s*=`, "g")) || []).length;
        if (n) { counts[k] += n; hit = true; }
      }
      if (hit) { files++; if (where.length < 4) where.push(`${label}/${f}`); }
    }
  }
  console.log(`     ${JSON.stringify(counts)} across ${files} files: ${where.join(", ")}`);
  if (!files) rec("no corpus installed — the ground-truth check is skipped", true, "");
  else rec("⭐ real trees use the capitalised keys", Object.values(counts).reduce((a, b) => a + b, 0) >= 5, counts);
}

console.log("\n[the capitalised section is read]");
{
  rec("app.js loaded", !loadError && typeof sb.parseFocuses === "function", loadError || typeof sb.parseFocuses);
  const f = (sb.parseFocuses(tree(CAPS)).focuses || [])[0];
  rec("the focus parsed", !!f, f);
  rec("⭐ the availability reaches the sidebar", f && f.available === "has_war = no", f && f.available);
  rec("⭐ …and the bypass", f && f.bypass === "is_in_faction_with = ENG", f && f.bypass);
  // ⭐ CONTROL: the fixture really is capitalised, or "it was read" proves nothing about case.
  rec("CONTROL: the fixture really capitalises them", /AVAILABLE\s*=/.test(tree(CAPS)) && /Bypass\s*=/.test(tree(CAPS)), "");
}

// parseFocuses hands back blockStart/blockEnd into the text it was given — `_raw` is unit-data.js's
// convention, not this one, and passing it gives every rewriter `undefined`.
const blockOf = (text, f) => text.slice(f.blockStart, f.blockEnd);

console.log("\n[setting one REPLACES it, rather than adding a second]");
{
  const TXT = tree(CAPS);
  const f = (sb.parseFocuses(TXT).focuses || [])[0];
  const out = sb.rewriteFocusBlockConditions(blockOf(TXT, f), Object.assign({}, f, { available: "has_stability > 0.5" }));
  rec("⭐ exactly one availability block", (String(out).match(/(^|\n)\s*available\s*=/gi) || []).length === 1, out);
  rec("…holding the new condition", /has_stability/.test(String(out)), out);
  rec("…and not the old one", !/has_war\s*=\s*no/.test(String(out)), out);
  rec("⭐ …spelled the way the author wrote it", /(^|\n)\s*AVAILABLE\s*=/.test(String(out)), out);
  rec("…and the bypass is untouched", /Bypass\s*=\s*\{\s*is_in_faction_with/.test(String(out)), out);
}

console.log("\n[clearing it removes the capitalised block too]");
{
  const TXT = tree(CAPS);
  const f = (sb.parseFocuses(TXT).focuses || [])[0];
  const out = sb.rewriteFocusBlockConditions(blockOf(TXT, f), Object.assign({}, f, { available: "" }));
  rec("⭐ the block is gone", !/(^|\n)\s*available\s*=/i.test(String(out)), out);
  rec("…and nothing else went with it", /completion_reward/.test(String(out)) && /Bypass/.test(String(out)), out);
}

console.log("\n[CONTROL] the ordinary lowercase form is untouched by all this");
{
  const TXT = tree(LOWER);
  const f = (sb.parseFocuses(TXT).focuses || [])[0];
  rec("a lowercase focus reads its availability", f && f.available === "has_war = no", f && f.available);
  const out = sb.rewriteFocusBlockConditions(blockOf(TXT, f), Object.assign({}, f, { available: "has_stability > 0.5" }));
  rec("…and a change writes one lowercase block", (String(out).match(/(^|\n)\s*available\s*=/gi) || []).length === 1 && /(^|\n)\s*available\s*=/.test(String(out)), out);
  rec("…no capital borrowed from anywhere", !/(^|\n)\s*AVAILABLE\s*=/.test(String(out)), out);
}

console.log("\n[RUN IT] every real focus, read then re-read");
{
  // A focus whose availability the sidebar can see must survive a rewrite that sets it back to what it was.
  let files = 0, focuses = 0, withAvailable = 0, capitalised = 0, changedShape = 0;
  const examples = [];
  for (const [label, root] of ROOTS) {
    const dir = path.join(root, "common", "national_focus");
    if (!fs.existsSync(dir)) continue;
    for (const name of fs.readdirSync(dir)) {
      if (!name.endsWith(".txt")) continue;
      let t; try { t = fs.readFileSync(path.join(dir, name), "utf8"); } catch (_) { continue; }
      let p; try { p = sb.parseFocuses(t); } catch (_) { continue; }
      files++;
      for (const f of p.focuses || []) {
        focuses++;
        const raw = t.slice(f.blockStart, f.blockEnd);
        if (/(^|\n)[ \t]*(AVAILABLE|Available)\s*=/.test(raw)) capitalised++;
        if (!f.available) continue;
        withAvailable++;
        // ⚠️ CHANGE it. Setting the same value back is a no-op by design — rewriteFocusBlockConditions
        // only touches a section the user actually edited — so the block came back untouched, and 97
        // focuses "failed" because VANILLA ships two `available` blocks on them (one empty).
        // china_nationalist_sea.txt's CHI_scout_for_air_experts is one. That measured Paradox's content,
        // not Nova's behaviour. A real edit is the case this fix is about, and it must leave exactly one.
        let out;
        try { out = sb.rewriteFocusBlockConditions(raw, Object.assign({}, f, { available: "has_stability > 0.5" })); } catch (_) { continue; }
        if ((String(out).match(/(^|\n)\s*available\s*=/gi) || []).length !== 1) {
          changedShape++;
          if (examples.length < 4) examples.push(`${label}/${name}:${f.id}`);
        }
      }
    }
  }
  console.log(`     ${files} trees · ${focuses} focuses · ${withAvailable} with an availability · ${capitalised} capitalised · left with two blocks ${changedShape}`);
  rec("the corpus (or at least the fixture) was read", focuses >= 1, focuses);
  if (files) rec("CONTROL: the corpus really holds capitalised ones", capitalised >= 2, capitalised);
  rec("RUN: ⭐ EDITING an availability never leaves two blocks", changedShape === 0, { changedShape, examples });
}

console.log(`\n=== focus key keeps its case: ${checks} checks, ${fails.length} failed ===`);
if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
