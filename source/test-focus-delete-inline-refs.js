// #focus-delete-leaves-inline-prereq — THE DELETE ONLY CLEANED UP THE 6% OF REFERENCES NOBODY WRITES.
//
// When a focus is deleted, cleanupReferencesInBlock strips it out of the prerequisite and
// mutually_exclusive blocks that named it. Its pattern anchored on the start of a line —
// `(^|\n)[ \t]*focus\s*=` — so it could only ever remove an entry written on its own line.
//
// Real content does not write them that way. Measured over the shipping trees, references inside
// prerequisite / prerequisites / mutually_exclusive blocks:
//
//   vanilla          16,505 total —    971 on their own line,  15,534 INLINE  (94%)
//   Millennium Dawn  32,823 total — 10,350 on their own line,  22,473 INLINE  (68%)
//
// So deleting a focus left the reference behind in the overwhelmingly common case, and a prerequisite that
// names a focus which no longer exists is simply a condition that never comes true — every focus that
// depended on the deleted one became permanently untakeable, with nothing in error.log to say why.
//
// ⚠️ The two SAFETY controls are the point of the anchor in the pattern. `focus\s*=\s*alpha` also matches
// the tail of `has_completed_focus = alpha`, and `alpha` is a prefix of `alpha_two`.
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
    console.log("  FAIL " + label + "  -> " + String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 260));
  }
}

const LINES = stripJsComments(fs.readFileSync(path.join(__dirname, "public", "app.js"), "utf8")).split(/\r?\n/);
// ⚠️ Lift by the top-level terminator, not by counting braces: cleanupReferencesInBlock builds its patterns
// out of template strings holding `\\{` and `(?=\\s*(\\n|\\r|\\}))`, which do not balance.
function lift(name) {
  const at = LINES.findIndex((l) => l.startsWith(`function ${name}(`));
  if (at === -1) return null;
  const end = LINES.findIndex((l, i) => i > at && l === "}");
  return end === -1 ? null : LINES.slice(at, end + 1).join("\n");
}
function liftConst(name) {
  const s = LINES.findIndex((l) => l.startsWith(`const ${name} = [`));
  if (s === -1) return "";
  const e = LINES.findIndex((l, i) => i >= s && l === "];");
  return e === -1 ? "" : LINES.slice(s, e + 1).join("\n") + "\n";
}

console.log("\n[the real function] lifted out of app.js");
const parts = ["findMatchingBrace", "cleanupReferencesInBlock"].map(lift);
rec("both helpers were found", parts.every(Boolean), parts.map((p) => !!p));
let cleanup = null;
if (parts.every(Boolean)) {
  try {
    const src = liftConst("FOCUS_ID_SCALAR_KEYWORDS") + liftConst("FOCUS_ID_BLOCK_KEYWORDS") + parts.join("\n");
    // eslint-disable-next-line no-new-func
    cleanup = new Function(`${src}; return cleanupReferencesInBlock;`)();
  } catch (e) { rec("…and the lift parses", false, e.message); }
}
rec("cleanupReferencesInBlock is callable", typeof cleanup === "function", typeof cleanup);

const wrap = (body) => `\tfocus = {\n\t\tid = beta\n${body}\n\t}`;
const del = (block, id) => (typeof cleanup === "function" ? cleanup(block, new Set([id]), new Map()) : "");

console.log("\n[THE BUG] the inline form — 94% of vanilla's references");
{
  const only = del(wrap("\t\tprerequisite = { focus = alpha }"), "alpha");
  rec("the only entry is removed", /prerequisite = \{\s*\}/.test(only), only);

  const first = del(wrap("\t\tprerequisite = { focus = alpha focus = beta2 }"), "alpha");
  rec("a deleted FIRST entry goes, its sibling stays", /prerequisite = \{ focus = beta2 \}/.test(first), first);

  const second = del(wrap("\t\tprerequisite = { focus = beta2 focus = alpha }"), "alpha");
  rec("…and a deleted SECOND entry likewise", /prerequisite = \{ focus = beta2 \}/.test(second), second);

  const mutex = del(wrap("\t\tmutually_exclusive = { focus = alpha focus = beta2 }"), "alpha");
  rec("mutually_exclusive is cleaned the same way", /mutually_exclusive = \{ focus = beta2 \}/.test(mutex), mutex);

  const mixed = del(wrap("\t\tprerequisite = {\n\t\t\tfocus = alpha\n\t\t}\n\t\tprerequisite = { focus = alpha }"), "alpha");
  rec("own-line and inline blocks are both cleaned", !/focus = alpha/.test(mixed), mixed);
}

console.log("\n[SAFETY] the anchor in the pattern, and what happens without it");
{
  // `focus\s*=\s*alpha` is a substring of `has_completed_focus = alpha`. Losing that line would delete a
  // real availability condition and quietly make the focus EASIER to take.
  const avail = del(wrap("\t\tprerequisite = { focus = alpha }\n\t\tavailable = { has_completed_focus = alpha }"), "alpha");
  rec("has_completed_focus is not mistaken for a prerequisite entry", /has_completed_focus = alpha/.test(avail), avail);
  const bypass = del(wrap("\t\tprerequisite = { focus = alpha }\n\t\tbypass = { has_completed_focus = alpha }"), "alpha");
  rec("…in a bypass block either", /has_completed_focus = alpha/.test(bypass), bypass);

  // `alpha` is a prefix of `alpha_two`; deleting one must not touch the other.
  const longer = del(wrap("\t\tprerequisite = { focus = alpha_two }"), "alpha");
  rec("a longer id sharing the prefix is untouched", /focus = alpha_two/.test(longer), longer);
}

console.log("\n[CONTROL] the own-line form still works, and a rename is unaffected");
{
  const ownLine = del(wrap("\t\tprerequisite = {\n\t\t\tfocus = alpha\n\t\t\tfocus = beta2\n\t\t}"), "alpha");
  rec("an own-line entry is still removed", !/focus = alpha/.test(ownLine), ownLine);
  rec("…and its sibling survives", /focus = beta2/.test(ownLine), ownLine);

  // A RENAME must still rewrite rather than remove — the two passes share one function.
  const renamed = typeof cleanup === "function"
    ? cleanup(wrap("\t\tprerequisite = { focus = alpha }"), new Set(), new Map([["alpha", "alpha_new"]]))
    : "";
  rec("a rename still rewrites the inline entry instead of deleting it", /focus = alpha_new/.test(renamed), renamed);
}

console.log("\n[corpus] why the inline form is the one that matters");
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
    let own = 0, inline = 0;
    for (const f of files) {
      let t = "";
      try { t = fs.readFileSync(path.join(dir, f), "utf8"); } catch (_) { continue; }
      t = t.replace(/#[^\n]*/g, "");
      for (const m of t.matchAll(/\b(prerequisite|prerequisites|mutually_exclusive)\s*=\s*\{([^{}]*)\}/g)) {
        for (const e of m[2].matchAll(/focus\s*=\s*([A-Za-z0-9_.-]+)/g)) {
          const before = m[2].slice(0, e.index);
          const nl = before.lastIndexOf("\n");
          if (nl !== -1 && /^[ \t]*$/.test(before.slice(nl + 1))) own++;
          else inline++;
        }
      }
    }
    const pct = Math.round((inline / (own + inline)) * 100);
    console.log(`     ${label}: ${own + inline} references — ${own} on their own line, ${inline} inline (${pct}%)`);
    rec(`${label}: the inline form is the majority`, pct > 50, { own, inline });
  }
  if (!measured) {
    console.log("     SKIPPED — no installed corpus");
    rec("the corpus section is skipped only because the games are absent", true, "skipped");
  }
}

console.log(`\n=== focus delete cleans inline references: ${checks} checks, ${fails.length} failed ===`);
if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
