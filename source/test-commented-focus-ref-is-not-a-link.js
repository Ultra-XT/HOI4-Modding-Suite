// #focus-refs-read-through-a-comment — A COMMENTED-OUT `focus = X` WAS READ AS A REAL LINK, AND SAVING MADE
// IT REAL.
//
// collectFocusIdsFromSection locates the section with findMatchingBrace — which IS comment-aware, and has
// been for a while — then scans the body with a bare /\bfocus\s*=\s*…/g that is not. So a disabled entry
//
//     mutually_exclusive = {
//         focus = CHL_use_the_army
//     #    focus = CHL_use_the_fascist_movement
//     }
//
// came back as two live references. Measured with Nova's own reader over 86,928 focuses in 693 real trees:
//
//      55 phantom mutually_exclusive references — 53 focuses, 16 files
//     150 phantom prerequisite references       — 121 focuses, 23 files
//
// vanilla's own chile.txt, brazil.txt and czechoslovakia_mu.txt among them, and two Millennium Dawn focuses
// come back mutually exclusive with THEMSELVES — which the editor's validator then reports as an error the
// file does not contain, the cry-wolf case.
//
// READING it wrong is the smaller half. rewriteFocusBlockMutuallyExclusive strips the section and rebuilds
// it from this list, so a bad read PROMOTES the commented-out entry to a live one: the `#` is gone and the
// link is real. On SWE_promote_lappland_and_raindeer that writes a focus mutually exclusive with itself,
// which can then never be taken. It used to run on EVERY focus on EVERY save; it is now gated on
// focus.mutexEdited like the prerequisite rewriter (#mutex-rebuild-eats-a-commented-out-focus), so the blast
// radius is the focuses the user actually re-linked — but on those the reader still has to be right.
//
// Three scans had it, and the fix was next door to each of them the whole time:
//     public/app.js  collectFocusIdsFromSection   beside findMatchingBrace, which masks comments
//     public/app.js  collectFocusPrerequisiteGroups  the same body scan, deciding which entries are ORed
//     server.js      parseSharedFocusBlock        beside maskPdxNonCode, which this file has had all along
//
// The shared-focus one had a second fault in the same line: `[^}]*` for the body ends at the first `}`, and a
// `}` inside a comment truncated the list rather than extending it. Masking fixes both.
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
const APP_RAW = fs.readFileSync(path.join(__dirname, "public", "app.js"), "utf8");
const APP = stripJsComments(APP_RAW);
const SV = stripJsComments(fs.readFileSync(path.join(__dirname, "server.js"), "utf8"));

// Same DOM-stubbed VM load as test-focus-prereq-and-or.js — app.js is browser code, and its `function`
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
try { vm.runInContext(APP_RAW, sandbox, { filename: "app.js" }); } catch (_) {}

console.log("\n[the readers mask comments]");
{
  rec("maskPdxComments exists", typeof sandbox.maskPdxComments === "function", typeof sandbox.maskPdxComments);
  rec("…and a quoted # is not treated as one",
    sandbox.maskPdxComments && sandbox.maskPdxComments('a = "x #y" # real').includes('"x #y"'),
    sandbox.maskPdxComments && sandbox.maskPdxComments('a = "x #y" # real'));
  rec("…and it preserves length, so offsets still map",
    sandbox.maskPdxComments && sandbox.maskPdxComments("ab # cd\nef").length === "ab # cd\nef".length, "");
  // ⭐ DERIVED: every scan that reads the body of a reference section must go through the mask. Naming them
  // one by one is how the third one gets missed.
  const scans = [...APP.matchAll(/const sectionText = ([^;]*);/g)].map((m) => m[1].trim());
  rec("both reference-section scans were found", scans.length === 2, scans);
  rec("…and BOTH mask first", scans.length === 2 && scans.every((s) => s.startsWith("maskPdxComments(")), scans);
}

console.log("\n[fixtures] a disabled entry is not a link");
const BLOCK = [
  "focus = {",
  "\tid = CHL_suppress_the_nacistas",
  "\tprerequisite = {",
  "\t\tfocus = CHL_live_one",
  "\t#\tfocus = CHL_disabled_prereq",
  "\t}",
  "\tmutually_exclusive = {",
  "\t\tfocus = CHL_use_the_army",
  "\t#\tfocus = CHL_use_the_fascist_movement",
  "\t}",
  "\tx = 0",
  "\ty = 0",
  "}",
].join("\n");
{
  const collect = (b, s) => sandbox.collectFocusIdsFromSection(b, s);
  rec("collectFocusIdsFromSection is loaded", typeof sandbox.collectFocusIdsFromSection === "function", "");
  const pre = collect(BLOCK, "prerequisite");
  const mut = collect(BLOCK, "mutually_exclusive");
  rec("the live prerequisite is read", pre.includes("CHL_live_one"), pre);
  rec("⭐ the commented-out prerequisite is NOT", !pre.includes("CHL_disabled_prereq"), pre);
  rec("the live mutex is read", mut.includes("CHL_use_the_army"), mut);
  rec("⭐ the commented-out mutex is NOT", !mut.includes("CHL_use_the_fascist_movement"), mut);

  // The grouping reader decides which entries are ORed together, so a phantom does not merely appear —
  // it widens the group, and the focus unlocks on a condition the file does not contain.
  const groups = sandbox.collectFocusPrerequisiteGroups ? sandbox.collectFocusPrerequisiteGroups(BLOCK) : null;
  rec("collectFocusPrerequisiteGroups is loaded", Array.isArray(groups), typeof groups);
  rec("⭐ …and its group holds only the live entry", Array.isArray(groups) && JSON.stringify(groups) === JSON.stringify([["CHL_live_one"]]), groups);
}

console.log("\n[the save consequence] the mutex block is rebuilt when the user edits the mutex set");
{
  // #mutex-rebuild-eats-a-commented-out-focus — this rewrite is now GATED on focus.mutexEdited, exactly like
  // the prerequisite rewriter, because the rebuild also destroyed the commented-out lines it could not model
  // (55 lines in 53 blocks across 16 real files). The reader still has to be right: the moment the user DOES
  // edit this focus's mutex set, whatever the reader produced is what gets written back.
  rec("the mutex rewriter is loaded", typeof sandbox.rewriteFocusBlockMutuallyExclusive === "function", "");
  rec("…and it is gated on mutexEdited, so an untouched focus keeps its block",
    /const withMutex = focus\.mutexEdited[\s\S]{0,40}\?\s*rewriteFocusBlockMutuallyExclusive\(withPrereqs, focus\)/.test(APP),
    "if this became unconditional again, say so here — the blast radius changes");
  const focus = { id: "CHL_suppress_the_nacistas", mutuallyExclusive: sandbox.collectFocusIdsFromSection(BLOCK, "mutually_exclusive") };
  const out = sandbox.rewriteFocusBlockMutuallyExclusive(BLOCK, focus);
  rec("⭐ the save does not promote the comment to a live link", !/^\s*focus = CHL_use_the_fascist_movement\s*$/m.test(out), out);
  rec("…and the live entry survives", /focus = CHL_use_the_army/.test(out), out);

  // A focus that comes back mutually exclusive with ITSELF is the shape the validator then reports as an
  // error the file does not contain. Millennium Dawn's sweden.txt has two.
  const SELF = BLOCK.replace("#\tfocus = CHL_use_the_fascist_movement", "#\tfocus = CHL_suppress_the_nacistas");
  rec("⭐ a focus is not read as mutually exclusive with itself",
    !sandbox.collectFocusIdsFromSection(SELF, "mutually_exclusive").includes("CHL_suppress_the_nacistas"),
    sandbox.collectFocusIdsFromSection(SELF, "mutually_exclusive"));
}

console.log("\n[the shared-focus reader, in server.js]");
{
  rec("parseSharedFocusBlock scans a MASKED block", /const blockScan = maskPdxNonCode\(block\);/.test(SV),
    "the shared layer still reads through a comment");
  rec("…and both its section scans use it",
    (SV.match(/for \(const \w+ of blockScan\.matchAll\(/g) || []).length === 2,
    (SV.match(/for \(const \w+ of blockScan\.matchAll\(/g) || []).length);
  // ⭐ CONTROL: maskPdxNonCode has been in this file all along — assert it, or the check above could be
  // satisfied by a helper that does nothing.
  rec("CONTROL: maskPdxNonCode is the file's existing masker", /function maskPdxNonCode\(text\)/.test(SV), "");
}

console.log("\n[RUN IT] every focus in every real tree, masked vs not");
{
  const ROOTS = [
    ["vanilla", "D:/SteamLibrary/steamapps/common/Hearts of Iron IV"],
    ["Millennium Dawn", "D:/SteamLibrary/steamapps/workshop/content/394360/2777392649"],
    ["Road to 56", "D:/SteamLibrary/steamapps/workshop/content/394360/820260968"],
    ["Old World Blues", "D:/SteamLibrary/steamapps/workshop/content/394360/2265420196"],
    ["Rise of Nations", "D:/SteamLibrary/steamapps/workshop/content/394360/2026448968"],
  ].filter(([, r]) => fs.existsSync(path.join(r, "common", "national_focus")));
  console.log("     corpora found: " + (ROOTS.map((r) => r[0]).join(", ") || "(none)"));

  // The scan as it USED to be — the built-in control. If this finds nothing, the run below proves nothing.
  const unmaskedScan = (block, section) => {
    const refs = [];
    const re = new RegExp(`(^|\\n)\\s*${section}\\s*=\\s*\\{`, "g");
    let m;
    while ((m = re.exec(block)) !== null) {
      const open = block.indexOf("{", m.index);
      const end = sandbox.findMatchingBrace(block, open);
      if (end === -1) break;
      const body = block.slice(open, end + 1);
      const fr = /\bfocus\s*=\s*(\{?\s*([A-Za-z0-9_.:-]+)\s*\}?)/g;
      let f;
      while ((f = fr.exec(body)) !== null) refs.push(f[2]);
      re.lastIndex = end + 1;
    }
    return refs;
  };

  const blocksOf = (text) => {
    const out = [];
    const re = /(^|\n)[ \t]*focus[ \t]*=[ \t]*\{/g;
    let m;
    while ((m = re.exec(text)) !== null) {
      const open = text.indexOf("{", m.index);
      const close = sandbox.findMatchingBrace(text, open);
      if (close < 0) continue;
      out.push(text.slice(m.index + (m[1] ? 1 : 0), close + 1));
      re.lastIndex = close;
    }
    return out;
  };

  let files = 0, focuses = 0, phantomNow = 0, phantomBefore = 0, selfBefore = 0;
  const examples = [];
  // A fixture so this measures something with no corpus installed.
  const FIXTURES = [BLOCK];
  const consider = (block) => {
    focuses++;
    for (const section of ["prerequisite", "mutually_exclusive"]) {
      const now = sandbox.collectFocusIdsFromSection(block, section);
      const before = unmaskedScan(block, section);
      const live = sandbox.collectFocusIdsFromSection(sandbox.maskPdxComments(block), section);
      const excess = (list) => {
        let n = 0;
        const left = live.slice();
        for (const id of list) { const i = left.indexOf(id); if (i >= 0) left.splice(i, 1); else n++; }
        return n;
      };
      phantomNow += excess(now);
      const b = excess(before);
      phantomBefore += b;
      if (b && examples.length < 6) examples.push(`${section}: ${before.filter((x) => !live.includes(x)).join(", ")}`);
      const id = (/\bid\s*=\s*([A-Za-z0-9_.:-]+)/.exec(sandbox.maskPdxComments(block)) || [, ""])[1];
      if (section === "mutually_exclusive" && id && before.includes(id) && !live.includes(id)) selfBefore++;
    }
  };
  for (const b of FIXTURES) consider(b);
  for (const [, root] of ROOTS) {
    const dir = path.join(root, "common", "national_focus");
    for (const name of fs.readdirSync(dir)) {
      if (!name.endsWith(".txt")) continue;
      let t; try { t = fs.readFileSync(path.join(dir, name), "utf8"); } catch (_) { continue; }
      files++;
      for (const b of blocksOf(t.replace(/\r/g, ""))) consider(b);
    }
  }
  console.log(`     ${files} trees · ${focuses} focuses · phantom refs now ${phantomNow} · before the fix ${phantomBefore} · of those, self-references ${selfBefore}`);
  rec("the corpus (or at least the fixture) was read", focuses >= 1, focuses);
  rec("RUN: ⭐ no commented-out reference is read as a link", phantomNow === 0, { phantomNow, examples });
  // ⭐ BUILT-IN CONTROL.
  rec("CONTROL: the unmasked scan DID read them", phantomBefore >= 2, { phantomBefore, examples });
}

console.log(`\n=== commented focus ref is not a link: ${checks} checks, ${fails.length} failed ===`);
if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
