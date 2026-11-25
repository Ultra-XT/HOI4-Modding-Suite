// #focus-rename-leaves-dangling-refs — A RENAMED FOCUS LEFT EVERY *USE* OF ITS ID BEHIND.
//
// Renaming a focus rewrote the places the tree STRUCTURE points at it — prerequisite, mutually_exclusive,
// relative_position_id — and nothing else. But a focus id is also a value that triggers and effects take,
// in the same file: `has_completed_focus = X` inside another focus's `available` or `bypass`.
//
// Measured over the shipping trees: 3,269 has_completed_focus in vanilla and 2,385 in Millennium Dawn, of
// which 2,613 (across 62 of 81 files) and 2,231 (across 71 of 103) name a focus defined IN THE SAME FILE —
// exactly the references a rename can and should follow. `has_completed_focus = <id that no longer exists>`
// is a condition that can never become true, so the focus it gated stayed locked with nothing to explain it.
//
// ⚠️ RENAME ONLY, deliberately. Removing `has_completed_focus = X` when X is DELETED would not remove a
// reference, it would LOOSEN a gate — a different and worse decision to make silently. Deletes keep going
// through the existing dangling-reference warning, and a control below pins that.
"use strict";
const fs = require("fs");
const path = require("path");
const { stripJsComments } = require("./testlib-strip-comments.js");

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

const APP = fs.readFileSync(path.join(__dirname, "public", "app.js"), "utf8");
const CODE = stripJsComments(APP);
const LINES = CODE.split(/\r?\n/);

// ⚠️ Lift by the top-level terminator, NOT by counting braces: cleanupReferencesInBlock builds its regexes
// from template strings containing `\\{` and `(?=\\s*(\\n|\\r|\\}))`, which do not balance. A brace counter
// runs off the end of the function and produces source that will not parse.
function lift(name) {
  const at = LINES.findIndex((l) => l.startsWith(`function ${name}(`));
  if (at === -1) return null;
  const end = LINES.findIndex((l, i) => i > at && l === "}");
  return end === -1 ? null : LINES.slice(at, end + 1).join("\n");
}

console.log("\n[the real function] lifted out of app.js");
const parts = ["findMatchingBrace", "cleanupReferencesInBlock"].map(lift);
rec("both helpers were found", parts.every(Boolean), parts.map((p) => !!p));
let cleanup = null;
if (parts.every(Boolean)) {
  try {
    const consts = LINES.filter((l) => /^const FOCUS_ID_(SCALAR|BLOCK)_KEYWORDS = \[/.test(l)).length;
    // The keyword lists live at module scope; pull them in with the function.
    const listSrc = (() => {
      let out = "";
      for (const name of ["FOCUS_ID_SCALAR_KEYWORDS", "FOCUS_ID_BLOCK_KEYWORDS"]) {
        const s = LINES.findIndex((l) => l.startsWith(`const ${name} = [`));
        if (s === -1) continue;
        const e = LINES.findIndex((l, i) => i >= s && l === "];");
        if (e !== -1) out += LINES.slice(s, e + 1).join("\n") + "\n";
      }
      return out;
    })();
    rec("the keyword lists are declared", consts === 2, consts);
    // eslint-disable-next-line no-new-func
    cleanup = new Function(`${listSrc}${parts.join("\n")}; return cleanupReferencesInBlock;`)();
  } catch (e) { rec("…and the lift parses", false, e.message); }
}
rec("cleanupReferencesInBlock is callable", typeof cleanup === "function", typeof cleanup);

const rename = (text, from, to) =>
  (typeof cleanup === "function" ? cleanup(text, new Set(), new Map([[from, to]])) : "");
const stale = (text, id) => (text.match(new RegExp(`\\b${id}\\b(?!_)`, "g")) || []).length;

console.log("\n[THE BUG] a sibling focus gating on the renamed one");
{
  const block = [
    "\tfocus = {",
    "\t\tid = beta",
    "\t\tavailable = {",
    "\t\t\thas_completed_focus = alpha",
    "\t\t}",
    "\t\tbypass = { has_completed_focus = alpha }",
    "\t}",
  ].join("\n");
  const out = rename(block, "alpha", "alpha_renamed");
  rec("has_completed_focus follows the rename", stale(out, "alpha") === 0, out);
  rec("…in a nested block and an inline one alike",
    (out.match(/has_completed_focus = alpha_renamed/g) || []).length === 2, out);
}

console.log("\n[the rest of the derived list]");
{
  for (const kw of ["complete_national_focus", "unlock_national_focus", "activate_shine_on_focus",
    "deactivate_shine_on_focus", "has_shine_effect_on_focus"]) {
    const out = rename(`\tfocus = {\n\t\tid = beta\n\t\tx = { ${kw} = alpha }\n\t}`, "alpha", "alpha_renamed");
    rec(`${kw} follows the rename`, stale(out, "alpha") === 0, out);
  }
  for (const kw of ["focus_progress", "reduce_focus_completion_cost", "uncomplete_national_focus"]) {
    const out = rename(`\tfocus = {\n\t\tid = beta\n\t\tx = { ${kw} = { focus = alpha progress = 0.5 } }\n\t}`, "alpha", "alpha_renamed");
    rec(`${kw} = { focus = … } follows the rename`, stale(out, "alpha") === 0, out);
  }
}

console.log("\n[CONTROL] what must NOT be rewritten");
{
  // A TREE id, not a focus id. Renaming a focus must not touch it.
  const tree = rename("\tfocus = {\n\t\tid = beta\n\t\tx = { has_focus_tree = alpha }\n\t}", "alpha", "alpha_renamed");
  rec("has_focus_tree takes a TREE id and is left alone", /has_focus_tree = alpha\b/.test(tree) && !/alpha_renamed/.test(tree), tree);
  // Substring safety: renaming `alpha` must not corrupt `alpha_two`.
  const sub = rename("\tfocus = {\n\t\tid = beta\n\t\tx = { has_completed_focus = alpha_two }\n\t}", "alpha", "alpha_renamed");
  rec("a longer id that merely starts with the old one is untouched", /has_completed_focus = alpha_two\b/.test(sub), sub);
  // An id inside a quoted string (a loc key or a comment-free description) must not be silently rewritten
  // by a bare word match on the wrong key.
  const other = rename("\tfocus = {\n\t\tid = beta\n\t\tx = { some_other_key = alpha }\n\t}", "alpha", "alpha_renamed");
  rec("an unrelated key holding the same word is untouched", /some_other_key = alpha\b/.test(other), other);
}

console.log("\n[CONTROL] the old behaviour is intact");
{
  const block = [
    "\tfocus = {",
    "\t\tid = beta",
    "\t\tprerequisite = { focus = alpha }",
    "\t\tmutually_exclusive = { focus = alpha }",
    "\t\trelative_position_id = alpha",
    "\t}",
  ].join("\n");
  const out = rename(block, "alpha", "alpha_renamed");
  rec("prerequisite / mutually_exclusive / relative_position_id still follow", stale(out, "alpha") === 0, out);
}

console.log("\n[CONTROL] a DELETE must not quietly loosen a gate");
{
  // Deleting alpha removes it from prerequisite (that IS the reference), but `has_completed_focus = alpha`
  // inside `available` is a CONDITION — dropping it would make the focus easier to take, which is a change
  // no delete should make on its own. It stays, and the dangling-reference warning is what tells the user.
  // The entry is on its own line here; the inline form `prerequisite = { focus = X }` — 94% of vanilla's
  // references — is covered by test-focus-delete-inline-refs.js (#focus-delete-leaves-inline-prereq).
  const block = [
    "\tfocus = {",
    "\t\tid = beta",
    "\t\tprerequisite = {",
    "\t\t\tfocus = alpha",
    "\t\t}",
    "\t\tavailable = { has_completed_focus = alpha }",
    "\t}",
  ].join("\n");
  const out = typeof cleanup === "function" ? cleanup(block, new Set(["alpha"]), new Map()) : "";
  // ⚠️ NOT `!/focus = alpha/` — `has_completed_focus = alpha` contains that substring, so the loose form
  // fails against correct output. Assert the block itself is now empty.
  rec("an own-line prerequisite entry is removed", /prerequisite = \{\s*\}/.test(out), out);
  rec("…but the availability condition is left for the user to decide", /has_completed_focus = alpha/.test(out), out);
}

console.log("\n[derived, not typed] the keyword lists against data/hoi4-spec.json");
{
  // ⭐ Re-derive the CANDIDATES from the spec so a future HOI4 addition cannot slip past unclassified.
  let spec = null;
  try { spec = require("./data/hoi4-spec.json"); } catch (_) { /* handled below */ }
  if (!spec) {
    rec("the spec is present", false, "data/hoi4-spec.json missing");
  } else {
    const all = [...(spec.effects || []), ...(spec.triggers || [])];
    const candidates = all.map((x) => x.name).filter((n) => /focus/i.test(n));
    rec("the spec yields focus-related candidates", candidates.length > 5, candidates.length);

    const scalar = (CODE.match(/const FOCUS_ID_SCALAR_KEYWORDS = \[([\s\S]*?)\];/) || [])[1] || "";
    const block = (CODE.match(/const FOCUS_ID_BLOCK_KEYWORDS = \[([\s\S]*?)\];/) || [])[1] || "";
    const handled = new Set([...scalar.matchAll(/"([^"]+)"/g), ...block.matchAll(/"([^"]+)"/g)].map((m) => m[1]));

    // Everything else must be here WITH a reason — that is what makes a new spec entry fail this test.
    const EXCLUDED = {
      has_focus_tree: "takes a focus TREE id, not a focus id",
      load_focus_tree: "takes a focus TREE id, not a focus id",
      mark_focus_tree_layout_dirty: "takes no id at all",
      is_historical_focus_on: "a boolean game rule, not an id",
    };
    const unclassified = candidates.filter((n) => !handled.has(n) && !(n in EXCLUDED));
    rec("every focus-related effect/trigger in the spec is either handled or excluded with a reason",
      unclassified.length === 0, unclassified);
    // …and the exclusions must still exist, or they are stale entries hiding a real gap.
    const goneExclusions = Object.keys(EXCLUDED).filter((n) => !candidates.includes(n));
    rec("no exclusion names something the spec no longer has", goneExclusions.length === 0, goneExclusions);
    console.log(`     ${candidates.length} candidates: ${handled.size} rewritten, ${Object.keys(EXCLUDED).length} excluded by design`);
  }
}

console.log("\n[corpus] how much of the real content this reaches");
{
  const CORPORA = [
    ["vanilla", "D:/SteamLibrary/steamapps/common/Hearts of Iron IV"],
    ["Millennium Dawn", "D:/SteamLibrary/steamapps/workshop/content/394360/2777392649"],
  ];
  let measured = false;
  for (const [label, root] of CORPORA) {
    const dir = path.join(root, "common", "national_focus");
    let files = [];
    try { files = fs.readdirSync(dir).filter((f) => /\.txt$/i.test(f)); } catch (_) { continue; }
    if (!files.length) continue;
    measured = true;
    let selfRefs = 0, selfFiles = 0;
    for (const f of files) {
      let t = "";
      try { t = fs.readFileSync(path.join(dir, f), "utf8"); } catch (_) { continue; }
      t = t.replace(/#[^\n]*/g, "");
      const ids = new Set();
      for (const m of t.matchAll(/(^|\n)\s*(?:focus|shared_focus)\s*=\s*\{[\s\S]{0,400}?\bid\s*=\s*([A-Za-z0-9_.-]+)/g)) ids.add(m[2]);
      let hit = 0;
      for (const m of t.matchAll(/\bhas_completed_focus\s*=\s*([A-Za-z0-9_.-]+)/g)) if (ids.has(m[1])) hit++;
      selfRefs += hit;
      if (hit) selfFiles++;
    }
    console.log(`     ${label}: ${selfRefs} has_completed_focus references to a focus in the SAME file, across ${selfFiles} of ${files.length} tree files`);
    rec(`${label}: same-file references are common enough to matter`, selfRefs > 500, { selfRefs, selfFiles });
  }
  if (!measured) {
    console.log("     SKIPPED — no installed corpus");
    rec("the corpus section is skipped only because the games are absent", true, "skipped");
  }
}

console.log(`\n=== focus rename updates references: ${checks} checks, ${fails.length} failed ===`);
if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
