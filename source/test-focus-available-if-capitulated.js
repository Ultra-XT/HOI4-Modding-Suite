// #available-if-capitulated-field — THE FLAG NOVA WROTE FOR YOU AND NEVER SHOWED YOU.
//
// `available_if_capitulated` decides whether a focus can still be taken once the country has surrendered.
// HOI4's default is NO. Nova had no control for it anywhere, wrote `yes` into every focus it created, and
// its parser read an ABSENT key as "yes" — the opposite of what the engine does.
//
// Measured over the shipping trees:
//   vanilla          10,612 focuses — `no` 4,128 · `yes` 1,689 · absent 4,795
//   Millennium Dawn  22,015 focuses — absent in 21,994 of them
// So a blanket `yes` matched neither the engine nor the corpus, and nobody could see or change it.
//
// It is now an ordinary sidebar field sitting with the two flags it belongs beside (cancel_if_invalid,
// continue_if_invalid), and it behaves exactly like them: parsed honestly, written only when the modder
// chooses a value, and left completely alone otherwise.
//
// ⚠️ The continuous-focus maker deliberately still defaults to `yes` — there, `yes` is right: every single
// continuous focus in vanilla (14/14) and Millennium Dawn (19/19) sets it.
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
    console.log("  FAIL " + label + "  -> " + String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 300));
  }
}

// ── The markup ──────────────────────────────────────────────────────────────────────────────────────────
const HTML = fs.readFileSync(path.join(__dirname, "public", "index.html"), "utf8");

console.log("\n[the control exists, and sits with its siblings]");
{
  rec("the select is in the page", /id="sb-focus-capitulated"/.test(HTML), "missing");
  const rowRe = /<div class="sb-field-row">\s*<label for="sb-focus-capitulated"[\s\S]*?<\/div>/;
  const row = (HTML.match(rowRe) || [""])[0];
  rec("…inside an sb-field-row, like cancel/continue", !!row, "not in an sb-field-row");
  for (const v of ['value=""', 'value="yes"', 'value="no"']) {
    rec(`…offering ${v}`, row.includes(v), row.slice(0, 200));
  }
  // Placement: immediately after "Continue if invalid", which is where the modder looks for these flags.
  const iCont = HTML.indexOf('id="sb-focus-continue"');
  const iCap = HTML.indexOf('id="sb-focus-capitulated"');
  const iWar = HTML.indexOf('id="sb-focus-warwith"');
  rec("it comes after Continue if invalid", iCont > 0 && iCap > iCont, { iCont, iCap });
  rec("…and before the next field", iWar > 0 && iCap < iWar, { iCap, iWar });

  // ⚠️ LAYOUT GUARD, and not a hypothetical: the first version of this row carried the explanation inline in
  // the label. `.sb-field-row` is a non-wrapping flex row built for short labels — the label measured 554px
  // inside a 329px row and shoved the select 237px off the edge of the panel. The two siblings' labels are
  // 94px and 109px. Keep the label short and put the prose in `title`.
  const labelText = ((row.match(/<label[^>]*>([\s\S]*?)<\/label>/) || [])[1] || "").replace(/<[^>]*>/g, "").trim();
  // ⚠️ Lower bound too: with the row absent, labelText is "" and a bare `<= 32` passes vacuously — the
  // guard would then be green in exactly the case it is meant to describe.
  rec("the label is short enough for a one-line row", labelText.length >= 8 && labelText.length <= 32,
    `${labelText.length} chars: "${labelText}"`);
  rec("…and carries no inline hint markup", !/<span/.test((row.match(/<label[\s\S]*?<\/label>/) || [""])[0]), "hint span is back in the label");
  rec("the explanation lives in a title tooltip instead", /title="[^"]*capitulated[^"]*"/i.test(row), "no title");
}

// ── The behaviour, driven through the real client code ──────────────────────────────────────────────────
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
try { vm.runInContext(fs.readFileSync(path.join(__dirname, "public", "app.js"), "utf8"), sandbox, { filename: "app.js" }); }
catch (e) { loadError = e.message; }

console.log("\n[the client code loads]");
rec("app.js ran without throwing", !loadError, loadError);

const focusBlock = (id, x, extra) =>
  `\tfocus = {\n\t\tid = ${id}\n\t\tx = ${x}\n\t\ty = 0\n\t\tcost = 10\n${extra || ""}\t}\n`;
const TREE =
  "focus_tree = {\n\tid = t\n" +
  focusBlock("has_yes", 0, "\t\tavailable_if_capitulated = yes\n") +
  focusBlock("has_no", 2, "\t\tavailable_if_capitulated = no\n") +
  focusBlock("has_none", 4, "") +
  "}\n";

console.log("\n[parsing] absent means ABSENT, not \"yes\"");
let parsed = null;
if (!loadError) {
  parsed = sandbox.resolveLayout(sandbox.parseFocuses(TREE));
  const by = Object.fromEntries(parsed.focuses.map((f) => [f.id, f]));
  rec("an explicit yes reads as yes", by.has_yes.availableIfCapitulated === "yes", by.has_yes.availableIfCapitulated);
  rec("an explicit no reads as no", by.has_no.availableIfCapitulated === "no", by.has_no.availableIfCapitulated);
  // THE BUG: this used to be "yes", so the sidebar would have shown the opposite of the truth for the
  // 4,795 vanilla and 21,994 MD focuses that leave the key out.
  rec("an ABSENT key reads as not-set", by.has_none.availableIfCapitulated === "", by.has_none.availableIfCapitulated);
  rec("…and a source snapshot is kept, like its siblings", by.has_yes.sourceAvailableIfCapitulated === "yes", by.has_yes.sourceAvailableIfCapitulated);
  rec("…including for the absent case", by.has_none.sourceAvailableIfCapitulated === "", by.has_none.sourceAvailableIfCapitulated);
}

console.log("\n[writing] only what the modder changed");
if (parsed) {
  const by = Object.fromEntries(parsed.focuses.map((f) => [f.id, f]));
  by.has_none.availableIfCapitulated = "yes";   // set one that had nothing
  by.has_yes.availableIfCapitulated = "";       // clear one that had a value
  // has_no is deliberately untouched — that is the control.
  if (sandbox.pendingDeletedBlocks && sandbox.pendingDeletedBlocks.clear) sandbox.pendingDeletedBlocks.clear();
  const out = sandbox.rewriteCoordinates(TREE, parsed);
  const blockOf = (id) => (out.split(`id = ${id}`)[1] || "").split("\t}")[0];
  rec("setting it writes the key", /available_if_capitulated = yes/.test(blockOf("has_none")), blockOf("has_none"));
  rec("clearing it removes the key", !/available_if_capitulated/.test(blockOf("has_yes")), blockOf("has_yes"));
  // ⚠️ The load-bearing control. If an untouched focus were rewritten, every save would churn the file.
  rec("an untouched focus keeps its key, unmoved", /cost = 10\n\t\tavailable_if_capitulated = no/.test(out), blockOf("has_no"));
}

console.log("\n[hazard] a value the control cannot represent must survive an unrelated edit");
if (!loadError) {
  // The <select> only has ""/yes/no. If the parser accepted some other token, it would sit in the source
  // snapshot while the control read back "" — so editing ANY other field would make the two differ and
  // silently delete the line. Reading an unrecognised value as "not set" keeps source === value, so the
  // odd line is left exactly where the author put it.
  const ODD =
    "focus_tree = {\n\tid = t\n" +
    focusBlock("weird", 0, "\t\tavailable_if_capitulated = maybe\n") +
    "}\n";
  const p2 = sandbox.resolveLayout(sandbox.parseFocuses(ODD));
  const f2 = p2.focuses[0];
  rec("an unrecognised value reads as not-set", f2.availableIfCapitulated === "", f2.availableIfCapitulated);
  rec("…and its source agrees, so nothing is written", f2.sourceAvailableIfCapitulated === "", f2.sourceAvailableIfCapitulated);
  // ⚠️ Model what the SIDEBAR does, not just the parser. applySidebarLiveChanges runs on any field change
  // and assigns `focus.availableIfCapitulated = capitEl.value` — and a <select> with no matching <option>
  // reports "". THAT is the hazard: with a loose parse the source would hold "maybe" while the control
  // reported "", the two would differ, and the line would be deleted by an edit to something else.
  // (Asserting only on the parser would pass under BOTH regexes and prove nothing.)
  f2.availableIfCapitulated = "";   // what the select reads back for a value it cannot represent
  f2.cost = 20;                     // …while the user edits something else entirely
  f2.forceRewrite = true;
  if (sandbox.pendingDeletedBlocks && sandbox.pendingDeletedBlocks.clear) sandbox.pendingDeletedBlocks.clear();
  const out2 = sandbox.rewriteCoordinates(ODD, p2);
  rec("the odd line survives an edit to another field", /available_if_capitulated = maybe/.test(out2), out2);
}

console.log("\n[a brand-new focus] starts at the engine default");
{
  const CODE = fs.readFileSync(path.join(__dirname, "public", "app.js"), "utf8");
  const { stripJsComments } = require("./testlib-strip-comments.js");
  const clean = stripJsComments(CODE);
  // The template must not emit it unconditionally any more…
  rec("the template no longer hard-codes yes",
    !/available_if_capitulated = \$\{focus\.availableIfCapitulated \|\| "yes"\}/.test(clean), "still unconditional");
  rec("…and emits it only when set", /if \(focus\.availableIfCapitulated\) \{/.test(clean), "no guard");
  // …and a new focus's draft must start empty, or the guard above would always fire.
  rec("a new focus's draft starts unset", /availableIfCapitulated: "",/.test(clean), "draft still defaults to a value");
  rec("the sidebar select is wired for change like its siblings",
    /"sb-focus-cancel", "sb-focus-continue", "sb-focus-capitulated"/.test(clean), "not wired");
  rec("the sidebar shows it on select", /capitEl\.value = focus\.availableIfCapitulated \|\| ""/.test(clean), "not shown");
  rec("…and reads it back on edit", /focus\.availableIfCapitulated = capitEl\.value/.test(clean), "not read back");
  rec("…and the writer upserts it when changed",
    /upsertScalar\(out, "available_if_capitulated", focus\.availableIfCapitulated\)/.test(clean), "no upsert");
}

console.log("\n[the corpus] a no-edit save must not touch a single one");
if (parsed) {
  const KEY = /available_if_capitulated\s*=\s*(yes|no)/g;
  let measured = false;
  for (const [label, root] of [
    ["vanilla", "D:/SteamLibrary/steamapps/common/Hearts of Iron IV"],
    ["Millennium Dawn", "D:/SteamLibrary/steamapps/workshop/content/394360/2777392649"],
  ]) {
    const dir = path.join(root, "common", "national_focus");
    let files = [];
    try { files = fs.readdirSync(dir).filter((f) => /\.txt$/i.test(f)); } catch (_) { continue; }
    if (!files.length) continue;
    measured = true;
    let before = 0, after = 0;
    for (const f of files) {
      let t = "";
      try { t = fs.readFileSync(path.join(dir, f), "utf8"); } catch (_) { continue; }
      let p;
      try { p = sandbox.resolveLayout(sandbox.parseFocuses(t)); } catch (_) { continue; }
      if (!p || !p.focuses || !p.focuses.length) continue;
      if (sandbox.pendingDeletedBlocks && sandbox.pendingDeletedBlocks.clear) sandbox.pendingDeletedBlocks.clear();
      let o;
      try { o = sandbox.rewriteCoordinates(t, p); } catch (_) { continue; }
      before += (t.match(KEY) || []).length;
      after += (o.match(KEY) || []).length;
    }
    console.log(`     ${label}: ${before} occurrences before, ${after} after`);
    rec(`${label}: a no-edit save changes none of them`, before === after && before > 0, { before, after });
  }
  if (!measured) {
    console.log("     SKIPPED — no installed corpus");
    rec("the corpus section is skipped only because the games are absent", true, "skipped");
  }
}

console.log("\n[CONTROL] the continuous-focus maker keeps its own default, which is right there");
{
  const SRV = fs.readFileSync(path.join(__dirname, "server.js"), "utf8");
  // Every continuous focus in vanilla (14/14) and MD (19/19) sets yes, so cfUpsertFocus is correct as-is.
  // If someone "makes it consistent" with the national-focus change, this fails and says why.
  rec("cfUpsertFocus still defaults a new continuous focus to yes",
    /available_if_capitulated = \$\{f\.availableIfCapitulated \|\| "yes"\}/.test(SRV), "the CF default was changed too");
}

console.log(`\n=== available_if_capitulated field: ${checks} checks, ${fails.length} failed ===`);
if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
