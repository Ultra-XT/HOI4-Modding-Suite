// #prereq-and-blocks-collapsed-to-or — EDITING A FOCUS'S PREREQUISITES TURNED "REQUIRES BOTH" INTO
// "REQUIRES EITHER".
//
// HOI4 reads sibling `prerequisite` blocks as AND and several `focus =` entries inside ONE block as OR.
// Both ship in vanilla:
//     AND — usa.txt, USA_liberty_for_the_philippines:
//             prerequisite = { focus = USA_democratic_socialism }
//             prerequisite = { focus = USA_full_desegregation }
//     OR  — afghanistan.txt, AFG_steel_mills:
//             prerequisite = { focus = AFG_iron_mines focus = AFG_chromite_mines }
//
// The model flattened both into one id list, so the writer could only ever emit ONE block. Editing the
// prerequisites of a focus gated behind two chains made it reachable from either — 4,450 focuses across the
// two shipping corpora carry two or more sibling blocks. The tree still loaded, the editor still drew the
// links, and nothing warned; it showed up only in play, as branches unlocking early.
//
// And a NEW focus could not express AND at all: "+ Add Prerequisite" twice put both parents in one block,
// while the editor's own status line says "required first" for each link.
//
// Nova's own source already documented the distinction — rewriteCoordinates carries a comment about turning
// "SIBLING prerequisite blocks (AND …) into a single block (OR …)" — and the guard added there only stopped
// the rebuild for focuses the user did NOT touch. The knowledge was in a comment, not in the model.
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

// Same DOM-stubbed VM load as test-focus-tree-saveability.js — app.js is browser code, and its `function`
// declarations attach to the sandbox.
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
try { vm.runInContext(fs.readFileSync(path.join(__dirname, "public", "app.js"), "utf8"), sandbox, { filename: "app.js" }); } catch (_) {}

// Blank out comments, keeping length and line structure, so the shape measured below is the shape HOI4
// reads. #focus-refs-read-through-a-comment — this used to scan the raw text, which counted a disabled
// `#focus = X` as part of the group. It agreed with the reader it was testing, so both were wrong together
// and the test passed; once the reader started ignoring them, 45 focuses "changed shape" by getting it right.
const maskComments = (t) => {
  let out = "", inQuotes = false;
  for (let i = 0; i < t.length; i += 1) {
    const c = t[i];
    if (inQuotes) { out += c; if (c === '"') inQuotes = false; continue; }
    if (c === '"') { inQuotes = true; out += c; continue; }
    if (c === "#") { while (i < t.length && t[i] !== "\n") { out += " "; i += 1; } if (i < t.length) out += t[i]; continue; }
    out += c;
  }
  return out;
};
// The AND/OR shape of a block, as "a|b && c" — `|` is one block's entries (OR), `&&` separates blocks (AND).
const shapeOf = (raw) => {
  const text = maskComments(String(raw));
  const out = [];
  // ⚠️ NOT line-anchored. Old World Blues writes two sibling blocks on ONE line —
  //   prerequisite = { focus = A } prerequisite = { focus = B }
  // — and a `(^|\n)` anchor sees only the first, so the shape measured "A" where the file says "A && B".
  // The leading class keeps it from matching the tail of a longer identifier.
  const re = /(^|[^A-Za-z0-9_])prerequisites?\s*=\s*\{/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const open = text.indexOf("{", m.index);
    let d = 0, close = -1;
    for (let i = open; i < text.length; i++) {
      if (text[i] === "{") d++;
      else if (text[i] === "}") { d--; if (!d) { close = i; break; } }
    }
    if (close < 0) break;
    const ids = [...text.slice(open, close + 1).matchAll(/\bfocus\s*=\s*\{?\s*([A-Za-z0-9_.:-]+)/g)].map((x) => x[1]);
    if (ids.length) out.push([...new Set(ids)].join("|"));
    re.lastIndex = close + 1;
  }
  return out.join(" && ");
};

// EVERY installed corpus, DERIVED rather than listed — the same scan
// test-state-save-leaves-the-file-alone.js uses. A hardcoded pair goes stale the moment another mod is
// installed, and a corpus that is present and not measured is a gap: widening this from two to five is what
// found the shapeOf anchor bug above (85 focuses reported as changing shape when nothing had).
const ROOTS = (() => {
  const r = { vanilla: "D:/SteamLibrary/steamapps/common/Hearts of Iron IV" };
  const WS = "D:/SteamLibrary/steamapps/workshop/content/394360";
  try {
    for (const d of fs.readdirSync(WS)) {
      if (fs.existsSync(path.join(WS, d, "common", "national_focus"))) r["ws/" + d] = path.join(WS, d);
    }
  } catch (_) {}
  return r;
})();

console.log("\n[ground truth] both shapes ship, and they mean different things");
const V = ROOTS.vanilla;
let usa = "", afg = "";
try { usa = fs.readFileSync(path.join(V, "common", "national_focus", "usa.txt"), "utf8"); } catch (_) {}
try { afg = fs.readFileSync(path.join(V, "common", "national_focus", "afghanistan.txt"), "utf8"); } catch (_) {}
rec("vanilla's usa.txt was readable", usa.length > 1000, usa.length);
rec("…and ships the AND form (two sibling blocks)",
  /prerequisite\s*=\s*\{[^{}]*\}\s*\r?\n\s*prerequisite\s*=\s*\{/.test(usa), "AND form not found");
rec("vanilla's afghanistan.txt ships the OR form (two entries in one block)",
  /prerequisite\s*=\s*\{[^{}]*focus\s*=\s*\S+[^{}]*focus\s*=\s*\S+[^{}]*\}/.test(afg), "OR form not found");

console.log("\n[the parser] must keep the grouping, not just the ids");
rec("the group collector exists", typeof sandbox.collectFocusPrerequisiteGroups === "function", "missing");
const p = sandbox.parseFocuses(usa);
const lib = (p.focuses || []).find((x) => x.id === "USA_liberty_for_the_philippines");
rec("the AND example parsed", !!lib, "USA_liberty_for_the_philippines missing");
if (lib) {
  rec("…its flat id list is unchanged (everything else depends on it)",
    Array.isArray(lib.prerequisites) && lib.prerequisites.length === 2, lib.prerequisites);
  rec("…and the groups say TWO blocks, one id each",
    Array.isArray(lib.prerequisiteGroups) && lib.prerequisiteGroups.length === 2
    && lib.prerequisiteGroups.every((g) => g.length === 1), lib.prerequisiteGroups);
}

console.log("\n[the corpus] a prerequisite rewrite must not change any focus's AND/OR shape");
let total = 0, multi = 0, changed = 0;
const examples = [];
for (const [name, root] of Object.entries(ROOTS)) {
  const dir = path.join(root, "common", "national_focus");
  let files = [];
  try { files = fs.readdirSync(dir).filter((f) => /\.txt$/i.test(f)); } catch (_) { continue; }
  for (const f of files) {
    let text = "";
    try { text = fs.readFileSync(path.join(dir, f), "utf8"); } catch (_) { continue; }
    let parsed;
    try { parsed = sandbox.parseFocuses(text); } catch (_) { continue; }
    for (const focus of (parsed && parsed.focuses) || []) {
      const block = text.slice(focus.blockStart, focus.blockEnd);
      const before = shapeOf(block);
      if (!before) continue;
      total++;
      if (before.includes("&&")) multi++;
      let out;
      try { out = sandbox.rewriteFocusBlockPrerequisites(block, focus); } catch (_) { continue; }
      if (shapeOf(out) !== before) {
        changed++;
        if (examples.length < 5) examples.push({ file: `${name}/${f}`, id: focus.id, before, after: shapeOf(out) });
      }
    }
  }
}
rec("tens of thousands of focuses with prerequisites were exercised", total > 25000, total);
rec("…thousands of which use the AND form", multi > 3000, multi);
rec("NOT ONE focus changes its AND/OR shape", changed === 0, { changed, examples });

console.log("\n[the editor] a NEW focus must be able to say 'requires both'");
const tmpl = sandbox.focusBlockTemplate({ id: "NV_child", iconKey: "GFX_x" }, "\n", [], [], ["NV_a", "NV_b"]);
rec("two prerequisites become TWO blocks", shapeOf(tmpl) === "NV_a && NV_b", { shape: shapeOf(tmpl), tmpl });
rec("…and one prerequisite is still one block",
  shapeOf(sandbox.focusBlockTemplate({ id: "NV_c", iconKey: "GFX_x" }, "\n", [], [], ["NV_a"])) === "NV_a",
  sandbox.focusBlockTemplate({ id: "NV_c", iconKey: "GFX_x" }, "\n", [], [], ["NV_a"]));

console.log("\n[order] the author's ordering is not re-alphabetised");
rec("a new focus keeps the order it was given",
  shapeOf(sandbox.focusBlockTemplate({ id: "NV_d", iconKey: "GFX_x" }, "\n", [], [], ["NV_zeta", "NV_alpha"]))
    === "NV_zeta && NV_alpha",
  shapeOf(sandbox.focusBlockTemplate({ id: "NV_d", iconKey: "GFX_x" }, "\n", [], [], ["NV_zeta", "NV_alpha"])));

console.log("\n[edits] adding and removing prerequisites still works");
if (lib) {
  const block = usa.slice(lib.blockStart, lib.blockEnd);
  // Adding: a parent with no group of its own becomes its own block — AND, which is what the UI promises.
  const added = sandbox.rewriteFocusBlockPrerequisites(block,
    Object.assign({}, lib, { prerequisites: [...lib.prerequisites, "USA_new_parent"] }));
  rec("an added prerequisite becomes its own block (AND)",
    shapeOf(added) === `${lib.prerequisites[0]} && ${lib.prerequisites[1]} && USA_new_parent`, shapeOf(added));
  // Removing: the id leaves its group, and an emptied group leaves with it.
  const removed = sandbox.rewriteFocusBlockPrerequisites(block,
    Object.assign({}, lib, { prerequisites: [lib.prerequisites[1]] }));
  rec("a removed prerequisite takes its (now empty) block with it",
    shapeOf(removed) === lib.prerequisites[1], shapeOf(removed));
  const none = sandbox.rewriteFocusBlockPrerequisites(block, Object.assign({}, lib, { prerequisites: [] }));
  rec("removing them all leaves no prerequisite block at all", shapeOf(none) === "", shapeOf(none));
}

console.log(`\n=== focus prerequisite AND/OR: ${checks} checks, ${fails.length} failed  (${total} focuses) ===`);
if (fails.length) { fails.forEach((f) => console.log("   FAILED: " + f)); process.exitCode = 1; }
