// #focus-adoption-decomposes-scoped-rewards / #focus-marker-swallows-closing-brace
//
// MOST REAL FOCUS TREES COULD NOT BE SAVED AT ALL. Nova's writer produced script its own pre-save parse
// check could not read, so the save was refused with "Malformed focus block: unmatched brace" or "effect
// rewrite blocked: Unbalanced braces". Nothing was corrupted — the file was left untouched — but a tree
// copied in from the base game or Millennium Dawn was simply uneditable, and the diagnostic blamed the file.
//
// TWO CAUSES, both in the path that ADOPTS a completion_reward Nova did not write.
//
// 1. Heuristic adoption was LOSSY. It kept only the statements it recognised and decomposed a state scope
//    holding several effects into one copy of the scope per effect. What it returns is what a later save
//    re-emits, so vanilla's AFG_expand_telegraph_network —
//        every_owned_state = { limit = {…} custom_effect_tooltip = … add_to_variable = {…} ×3 }
//    — came back as three separate `every_owned_state` blocks with the limit and the tooltip GONE. Dropping
//    the limit is not cosmetic: the effect then applies to every state the country owns instead of the ones
//    the author filtered for.
//
// 2. The end MARKER is a `#` comment, and the body was joined to the block's closing brace with no line
//    break between them — so the `}` landed on the comment line and was commented out.
//
// This file measures the whole corpus rather than a fixture, because "can Nova save a real tree" is a
// property of the corpus, and because the fixture I would have written would not have found either cause.
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

// public/app.js is browser code. Load it in a DOM-stubbed VM — `function` declarations attach to the
// sandbox, which is enough to reach the rewriters. (Module-scope `const`s do not, hence the source greps
// further down for the two constants this test also wants to pin.)
const APP_SRC = fs.readFileSync(path.join(__dirname, "public", "app.js"), "utf8");
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
let loadError = "";
try { vm.runInContext(APP_SRC, sandbox, { filename: "app.js" }); } catch (e) { loadError = e.message; }

const balanced = (s) => {
  let d = 0, q = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '"') { q = !q; continue; }
    if (q) continue;
    if (c === "#") { while (i < s.length && s[i] !== "\n") i++; continue; }
    if (c === "{") d++;
    else if (c === "}") { d--; if (d < 0) return false; }
  }
  return d === 0;
};

// Every installed corpus, not two of them. #legacy-sanitize-eats-a-shared-closing-brace shipped four
// unsaveable Rise of Nations trees precisely because this list stopped at Millennium Dawn — the mod was
// installed, large, and never measured. A corpus that is present and not read is a gap, not a saving.
const ROOTS = {
  vanilla: "D:/SteamLibrary/steamapps/common/Hearts of Iron IV",
  MD: "D:/SteamLibrary/steamapps/workshop/content/394360/2777392649",
  "Road to 56": "D:/SteamLibrary/steamapps/workshop/content/394360/820260968",
  "Old World Blues": "D:/SteamLibrary/steamapps/workshop/content/394360/2265420196",
  "Rise of Nations": "D:/SteamLibrary/steamapps/workshop/content/394360/2026448968",
};

console.log("\n[harness] the editor's own rewriters, loaded out of public/app.js");
rec("app.js loaded without throwing", !loadError, loadError);
for (const fn of ["parseFocuses", "rewriteFocusBlockEffects", "extractCompletionRewardManagedLines", "joinFocusBodyBeforeBrace"]) {
  rec(`${fn} is reachable`, typeof sandbox[fn] === "function", typeof sandbox[fn]);
}

console.log("\n[the corpus] can Nova write back what the game ships?");
const perRoot = {};
let totalFocuses = 0, brokenFocuses = 0;
for (const [name, root] of Object.entries(ROOTS)) {
  const dir = path.join(root, "common", "national_focus");
  let files = [];
  try { files = fs.readdirSync(dir).filter((f) => /\.txt$/i.test(f)); } catch (_) { continue; }
  let trees = 0, badTrees = 0;
  const badNames = [];
  for (const f of files) {
    let text = "";
    try { text = fs.readFileSync(path.join(dir, f), "utf8"); } catch (_) { continue; }
    let parsed;
    try { parsed = sandbox.parseFocuses(text); } catch (_) { continue; }
    trees++;
    let treeBad = false;
    for (const focus of (parsed && parsed.focuses) || []) {
      const blockText = text.slice(focus.blockStart, focus.blockEnd);
      if (!balanced(blockText)) continue;               // the source itself is odd — not ours
      totalFocuses++;
      let managed = [];
      try { managed = sandbox.extractCompletionRewardManagedLines(blockText) || []; } catch (_) {}
      try {
        const out = sandbox.rewriteFocusBlockEffects(blockText, focus, managed.length ? managed : null, new Set(), []);
        if (!balanced(out)) { brokenFocuses++; treeBad = true; }
      } catch (_) { brokenFocuses++; treeBad = true; }
    }
    if (treeBad) { badTrees++; if (badNames.length < 8) badNames.push(f); }
  }
  perRoot[name] = { trees, badTrees, badNames };
}
rec("both shipping corpora were readable", (perRoot.vanilla || {}).trees > 50 && (perRoot.MD || {}).trees > 50, perRoot);
rec("tens of thousands of focuses were exercised", totalFocuses > 25000, totalFocuses);
// ⭐ EVERY corpus, at ZERO. The old bounds allowed 12 bad vanilla trees, 8 Millennium Dawn ones and 80 broken
// focuses, and described "a residue of ~30 focuses across ~9 trees" — that residue is gone, and a cap of 12
// against a real value of 0 would not notice twelve trees regressing. A bound should say what is true.
//
// The list is DERIVED from perRoot rather than written out, so adding a corpus to ROOTS above automatically
// holds it to the same standard instead of quietly not being checked.
for (const [name, r] of Object.entries(perRoot)) {
  rec(`every focus tree in ${name} is saveable`, (r || {}).badTrees === 0, r);
}
rec("…and NOT ONE focus anywhere is unsaveable", brokenFocuses === 0, { brokenFocuses, totalFocuses, perRoot });

console.log("\n[cause 1] adoption of someone else's reward must be VERBATIM");
const AFG = path.join(ROOTS.vanilla, "common", "national_focus", "afghanistan.txt");
let afgText = "";
try { afgText = fs.readFileSync(AFG, "utf8"); } catch (_) {}
rec("vanilla's afghanistan.txt was readable", afgText.length > 1000, afgText.length);
if (afgText) {
  const p = sandbox.parseFocuses(afgText);
  const f = (p.focuses || []).find((x) => x.id === "AFG_expand_telegraph_network");
  rec("the example focus is present", !!f, "AFG_expand_telegraph_network missing");
  if (f) {
    const block = afgText.slice(f.blockStart, f.blockEnd);
    rec("…and its reward really is one scope holding several effects",
      /every_owned_state\s*=\s*\{[\s\S]*limit\s*=\s*\{[\s\S]*add_to_variable[\s\S]*add_to_variable/.test(block), "shape changed");
    const units = sandbox.extractCompletionRewardManagedLines(block) || [];
    rec("adoption returns ONE unit, not one per inner effect", units.length === 1, units.length);
    rec("…and that unit still carries the limit", /limit\s*=\s*\{/.test(units[0] || ""), units[0]);
    rec("…and the custom_effect_tooltip", /custom_effect_tooltip/.test(units[0] || ""), units[0]);
    rec("…and all three add_to_variable blocks",
      ((units[0] || "").match(/add_to_variable/g) || []).length === 3, units[0]);
    const out = sandbox.rewriteFocusBlockEffects(block, f, units, new Set(), []);
    rec("…and re-emitting it keeps the braces balanced", balanced(out), out.slice(-400));
    rec("…with the limit still in the written block", /limit\s*=\s*\{/.test(out), out.slice(-500));
  }
}

console.log("\n[cause 2] a closing brace must never land on a comment line");
rec("the joiner exists", typeof sandbox.joinFocusBodyBeforeBrace === "function", "missing");
if (typeof sandbox.joinFocusBodyBeforeBrace === "function") {
  const withComment = sandbox.joinFocusBodyBeforeBrace(["\t\t\tfoo = 1", "\t\t\t# focus_editor: end"], "\n", "\t\t");
  rec("a body ending in a comment gets a line break before the brace", /\n\t\t$/.test(withComment), JSON.stringify(withComment));
  const plain = sandbox.joinFocusBodyBeforeBrace(["\t\t\tfoo = 1", "\t\t\tbar = 2"], "\n", "\t\t");
  rec("…and a body ending in code is left exactly as it was", plain === "\t\t\tfoo = 1\n\t\t\tbar = 2", JSON.stringify(plain));
  const trailing = sandbox.joinFocusBodyBeforeBrace(["\t\t\tfoo = 1 # note"], "\n", "\t\t");
  rec("…and a TRAILING comment on a code line counts too", /\n\t\t$/.test(trailing), JSON.stringify(trailing));
}

console.log(`\n=== focus tree saveability: ${checks} checks, ${fails.length} failed  (${totalFocuses} focuses) ===`);
if (fails.length) { fails.forEach((f) => console.log("   FAILED: " + f)); process.exitCode = 1; }
