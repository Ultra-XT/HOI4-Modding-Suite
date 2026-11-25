// #legacy-sanitize-eats-a-shared-closing-brace — FOUR RISE OF NATIONS FOCUS TREES COULD NOT BE SAVED AT ALL.
//
// Clausewitz lets the closing brace share the last statement's line, and Rise of Nations writes it that way:
//
//     add_tech_bonus = {
//         name = IRE_modernise_esb
//         bonus = 1
//         uses = 2
//         category = electronics }
//
// sanitizeLegacyManagedEffectLines normalises a line by MATCHING a prefix and re-emitting the statement, so
// `category = electronics }` came back as `category = electronics` and the brace was gone. The segment then
// held one more `{` than `}`, and the brace guard did its job:
//
//     Focus "IRE_modernise_esb" effect rewrite blocked: Unbalanced braces (missing closing).
//
// So nothing was ever corrupted — the tree simply could not be saved, and the editor gave no reason a modder
// could act on. Measured with the editor's own rewriters over all five installed corpora (86,928 focuses in
// 693 trees): vanilla, Millennium Dawn, Road to 56 and Old World Blues are clean; Rise of Nations had 20 such
// focuses across RON_guangxiclique.txt, RON_Ireland.txt, RON_Paraguay.txt and RON_United_States.txt.
//
// The brace is peeled off before matching and pushed back after — and ONLY when the line closes more braces
// than it opens, so `set_country_flag = { flag = X days = 90 value = 1 }`, which is balanced on one line,
// still reaches its own branch whole.
//
// SECOND BUG, in the same function family, found while checking what else that converter emits.
//
// #keyless-state-wrapper — buildBuildingConstructionEffectLines wraps its effect in `${state} = {`, and the
// legacy converter calls it with two arguments, so `stateId` is undefined and the first line comes out as
// ` = {` — a block with NO KEY. The braces balance, so every guard passes and the file is written; HOI4
// cannot parse it. Only Nova's own older output reaches it (the scalar form `add_building_construction =
// arms_factory` appears 0 times in vanilla and all four workshop mods) — but that is precisely the input the
// converter exists for. There is a correct stateless form and vanilla writes it 4,214 times: the block goes
// straight into completion_reward at country scope, with no wrapper.
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
    console.log("  FAIL " + label + "  -> " + String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 400));
  }
}
const { stripJsComments } = require("./testlib-strip-comments.js");
const APP = stripJsComments(fs.readFileSync(path.join(__dirname, "public", "app.js"), "utf8"));

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

const balanced = (s) => {
  let d = 0, inC = false, inS = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inC) { if (c === "\n") inC = false; continue; }
    if (inS) { if (c === '"') inS = false; continue; }
    if (c === "#") { inC = true; continue; }
    if (c === '"') { inS = true; continue; }
    if (c === "{") d++; else if (c === "}") { d--; if (d < 0) return false; }
  }
  return d === 0;
};

console.log("\n[a closing brace that shares a statement's line survives]");
{
  rec("the rewriters loaded", typeof sb.sanitizeLegacyManagedEffectLines === "function", loadError || typeof sb.sanitizeLegacyManagedEffectLines);
  const IN = ["add_tech_bonus = {", "name = X", "bonus = 1", "uses = 2", "category = electronics }"];
  // ⭐ ASSERT THE FIXTURE HAS THE PROPERTY: the input really is balanced before we start.
  rec("the fixture is balanced as written", balanced(IN.join("\n")), IN);
  const out = sb.sanitizeLegacyManagedEffectLines(IN, "IRE_modernise_esb");
  rec("⭐ the closing brace is still there", out.join("\n").includes("}"), out);
  rec("⭐ …and the segment still balances", balanced(out.join("\n")), out);
  rec("…and the statement itself is unchanged", out.includes("category = electronics"), out);
  rec("…and the guard now accepts it", sb.validateManagedEffectsSegmentLines(out).ok, sb.validateManagedEffectsSegmentLines(out));

  // ⭐ BUILT-IN CONTROL: match-and-re-emit, which is what every branch does, loses the brace on its own.
  const matchAndReemit = (t) => { const m = t.match(/^category\s*=\s*([A-Za-z0-9_]+)/); return m ? `category = ${m[1]}` : t; };
  rec("CONTROL: matching and re-emitting alone DOES lose it", matchAndReemit("category = electronics }") === "category = electronics",
    matchAndReemit("category = electronics }"));

  // A bare closing brace on its own line must still come through.
  rec("a bare } passes through", sb.sanitizeLegacyManagedEffectLines(["}"], "f").join("") === "}", sb.sanitizeLegacyManagedEffectLines(["}"], "f"));
}

console.log("\n[a line that is ONLY closing braces is NOT taken apart either]");
{
  // ⭐ This peel regressed a focus one day after it landed. Applied to a line with no statement in front of
  // the braces it gained nothing — and effectUnitCompareLines runs every side of the adoption comparison
  // through this same sanitiser, so changing a unit's line count stopped the body copy being recognised and
  // RON_Ethiopia.txt#ETH_coop_eng_infr had its whole completion_reward written TWICE (7 conditional blocks
  // became 13). The peel needs a STATEMENT in front of the braces.
  for (const line of ["} } } }", "}", "}}", "\t} } }"]) {
    const out = sb.sanitizeLegacyManagedEffectLines([line], "f");
    rec(`a brace-only line stays one line: ${JSON.stringify(line)}`, out.length === 1, out);
  }
  rec("the peel is guarded by a statement, not only by the brace delta", /\/=\/\.test\(t0\.slice\(0, t0\.length - _peel\.length\)\)/.test(APP),
    "a line of nothing but braces will be split again, and the adoption comparison will stop matching");
  // …and the case the peel exists for still works, which is asserted above too — restated here so the two
  // requirements sit together and neither can be satisfied by dropping the other.
  rec("CONTROL: a statement WITH a trailing brace is still peeled",
    sb.sanitizeLegacyManagedEffectLines(["category = electronics }"], "f").length === 2,
    sb.sanitizeLegacyManagedEffectLines(["category = electronics }"], "f"));
}

console.log("\n[a line that is balanced on its own is NOT taken apart]");
{
  // ⭐ The peel is conditional on the line closing more than it opens. #flag-block-form-truncated is the
  // reason: the timed flag form is one balanced line and must reach its own branch whole.
  const one = sb.sanitizeLegacyManagedEffectLines(["set_country_flag = { flag = X days = 90 value = 1 }"], "f");
  rec("a balanced one-line block is not split", one.length === 1, one);
  rec("…and comes through whole", one[0].includes("flag = X") && one[0].trim().endsWith("}"), one);
  rec("the peel is guarded by the line's own brace delta", /effectLineBraceBalanceDelta\(t0\) < 0/.test(APP),
    "the peel is unconditional — a balanced one-liner would be taken apart");
}

console.log("\n[no state means no wrapper, not a keyless one]");
{
  const stateless = sb.buildBuildingConstructionEffectLines("arms_factory", 1);
  rec("⭐ a stateless call writes no keyless block", !stateless.some((l) => /^\s*=\s*\{/.test(l)), stateless);
  rec("…and writes the country-scope form vanilla uses", stateless[0].trim() === "add_building_construction = {", stateless);
  rec("…balanced", balanced(stateless.join("\n")), stateless);
  const scoped = sb.buildBuildingConstructionEffectLines("arms_factory", 2, 123);
  rec("a state-scoped call still wraps", scoped[0].trim() === "123 = {", scoped);
  rec("…with the effect indented inside it", scoped[1] === "\tadd_building_construction = {", JSON.stringify(scoped[1]));
  rec("…and the level carried through", scoped.some((l) => l.includes("level = 2")), scoped);
  rec("…balanced", balanced(scoped.join("\n")), scoped);
  // The path that actually reaches it.
  const legacy = sb.sanitizeLegacyManagedEffectLines(["add_building_construction = arms_factory"], "f");
  rec("⭐ the legacy converter no longer emits ` = {`", !legacy.some((l) => /^\s*=\s*\{/.test(l)), legacy);
  // ⭐ CONTROL: the sibling is deliberately NOT changed — that effect has no country-scope form.
  rec("CONTROL: the state-slots builder still requires its state", /function buildStateBuildingSlotsEffectLines[\s\S]{0,300}?\$\{state\} = \{/.test(APP),
    "if this changed, check add_extra_state_shared_building_slots really has a country-scope form");
}

console.log("\n[RUN IT] every focus in every installed corpus, through the editor's own rewriters");
{
  const ROOTS = {
    vanilla: "D:/SteamLibrary/steamapps/common/Hearts of Iron IV",
    "Millennium Dawn": "D:/SteamLibrary/steamapps/workshop/content/394360/2777392649",
    "Road to 56": "D:/SteamLibrary/steamapps/workshop/content/394360/820260968",
    "Old World Blues": "D:/SteamLibrary/steamapps/workshop/content/394360/2265420196",
    "Rise of Nations": "D:/SteamLibrary/steamapps/workshop/content/394360/2026448968",
  };
  let trees = 0, focuses = 0, broken = 0, sharedBraceFocuses = 0;
  const badNames = [];
  for (const [name, root] of Object.entries(ROOTS)) {
    const dir = path.join(root, "common", "national_focus");
    let files = [];
    try { files = fs.readdirSync(dir).filter((f) => /\.txt$/i.test(f)); } catch (_) { continue; }
    for (const f of files) {
      let text = ""; try { text = fs.readFileSync(path.join(dir, f), "utf8"); } catch (_) { continue; }
      let parsed; try { parsed = sb.parseFocuses(text); } catch (_) { continue; }
      trees++;
      for (const focus of (parsed && parsed.focuses) || []) {
        const block = text.slice(focus.blockStart, focus.blockEnd);
        if (!balanced(block)) continue;   // the source itself is odd — not ours
        focuses++;
        // Does this focus carry the shape at all? A statement line ending in `}` inside completion_reward.
        if (/\n[ \t]*[a-z_]+[ \t]*=[ \t]*[^\s{}#]+[ \t]*\}/.test(block)) sharedBraceFocuses++;
        let managed = [];
        try { managed = sb.extractCompletionRewardManagedLines(block) || []; } catch (_) {}
        try {
          const res = sb.rewriteFocusBlockEffects(block, focus, managed.length ? managed : null, new Set(), []);
          if (!balanced(res)) { broken++; if (badNames.length < 8) badNames.push(`${name}/${f}:${focus.id}`); }
        } catch (e) {
          broken++;
          if (badNames.length < 8) badNames.push(`${name}/${f}:${focus.id} — ${String(e && e.message).slice(0, 80)}`);
        }
      }
    }
  }
  console.log(`     ${trees} trees · ${focuses} focuses · ${sharedBraceFocuses} carrying a shared closing brace · unsaveable ${broken}`);
  rec("all five corpora were readable", trees > 600 && focuses > 80000, { trees, focuses });
  // ⭐ ASSERT THE CORPUS CONTAINS THE SHAPE, or a clean run proves nothing.
  rec("CONTROL: the corpus really does contain the shape", sharedBraceFocuses > 100, sharedBraceFocuses);
  rec("RUN: ⭐ NOT ONE focus is unsaveable", broken === 0, { broken, badNames });
}

console.log(`\n=== shared closing brace survives: ${checks} checks, ${fails.length} failed ===`);
if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
