// #a-warning-auto-fix-leaves-alone-offers-no-auto-fix — a map problem whose message names Auto-fix only to say it will not touch it
// DECLINES Auto-fix (autoFix: false at the push site), errors included.
//
// THE DEFECT (tool campaign B6-8). inherited_states_still_load says "Auto-fix will not touch them" and set no autoFix field, so the
// Map Errors footer — which counts every row whose message mentions Auto-fix as one that "names it as its repair", unless the row
// declines it — read " 6 of the 7 below name it as their repair" where 5 of 6 was true. Warnings had already learnt this (a message
// can name Auto-fix to say what it will NOT do); this error never adopted it.
//
// THE FIX. The rule sets autoFix: false. 🔧 is still offered for every error (map-rule-labels.js autoFixOffers): only the count moves.
//
// And DERIVED, so the next rule written the same way is caught: every problems.push in map-data.js whose message declines Auto-fix in
// words that hold for every row it pushes (outside any ${…} branch of the template) sets autoFix. A decline inside a branch is listed,
// not judged — whether that branch also sets autoFix needs its own fixture.
//
// The back-out control: take `autoFix: false` off the inherited_states_still_load push and sections 1 and 2 fail.
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

const HOME = fs.mkdtempSync(path.join(os.tmpdir(), "nova-declines-autofix-home-"));
process.env.NOVA_HOME_DIR = HOME;
const md = require("./map-data.js");
const labels = require("./public/map-rule-labels.js");
const { maskJsComments, maskJsLiterals } = require("./testlib-strip-comments.js");

let pass = 0;
const fails = [];
const ok = (cond, label, detail) => {
  if (cond === true) { pass++; console.log("  ok   " + label); }
  else { fails.push(label); console.log("  FAIL " + label + (detail !== undefined ? "   -> " + JSON.stringify(detail).slice(0, 400) : "")); }
};
const tmps = [HOME];
const inside = (p, dir) => { const r = path.relative(dir, p); return !!r && !r.startsWith("..") && !path.isAbsolute(r); };
const mk = (tag) => { const d = fs.mkdtempSync(path.join(os.tmpdir(), "nova-declines-autofix-" + tag + "-")); tmps.push(d); return d; };
const w = (root, rel, body) => { const p = path.join(root, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, body, "utf8"); };
// The words a message uses to decline Auto-fix for the row it is on.
const DECLINES = /Auto-fix (?:will not|won't|does not|doesn't|cannot|can't|never|leaves (?:it|them|this|that|these|those)\b[^.]{0,40}\balone)|Auto-fix[^.]{0,60}(?:will not|won't) touch/i;

try {
  // ═══ 1. THE ROW ITSELF ══════════════════════════════════════════════════════════════════════════════════════════════════
  console.log("\n=== 1. inherited_states_still_load declines Auto-fix, and 🔧 is still offered for it ===");
  {
    // a base game whose one state stands on two provinces, and a mod whose own definition.csv makes both of them sea
    const game = mk("game"), mod = mk("mod");
    w(game, "map/definition.csv", "0;0;0;0;land;false;unknown;0\n1;10;10;10;land;false;plains;1\n2;20;20;20;land;false;plains;1\n");
    w(game, "history/states/1-Base.txt", 'state = { id = 1 name = "STATE_1" manpower = 1 state_category = rural provinces = { 1 2 } history = { owner = GER } }\n');
    w(game, "history/countries/GER - Germany.txt", "capital = 1\n");
    w(mod, "descriptor.mod", 'name = "declines"\nsupported_version = "1.*"\n');
    w(mod, "map/definition.csv", "0;0;0;0;land;false;unknown;0\n1;10;10;10;sea;false;ocean;0\n2;20;20;20;sea;false;ocean;0\n");
    const problems = md.validateMapModel(md.buildMapModel({ modRoot: mod, gameRoot: game, dependencyRoots: [] }));
    const row = problems.find((p) => p.rule === "inherited_states_still_load");
    ok(!!row && row.severity === "error", "THE CONTROL: the rule fires, as an error, on a mod that drowned a state it does not own", problems.map((p) => p.rule));
    ok(!!row && /Auto-fix will not touch them/.test(row.message), "THE CONTROL: …and its message says Auto-fix will not touch them", row && row.message.slice(0, 200));
    ok(!!row && row.autoFix === false, "⭐⭐ …and the row declines Auto-fix, so the footer does not count it as a repair Auto-fix names (B6-8)", row && row.autoFix);
    ok(!!row && labels.autoFixOffers([row]).length === 1, "…while 🔧 is still offered for it, as for every error");
  }

  // ═══ 2. 🔎 DERIVED: EVERY ROW WHOSE WORDS DECLINE AUTO-FIX SAYS SO IN ITS FIELDS ═══════════════════════════════════════════
  console.log("\n=== 2. every problems.push whose message declines Auto-fix for every row it pushes sets autoFix ===");
  {
    const src = fs.readFileSync(path.join(__dirname, "map-data.js"), "utf8");
    const code = maskJsComments(src), lit = maskJsLiterals(src);
    const lineOf = (i) => src.slice(0, i).split("\n").length;
    /** The text with every ${…} of its template literals blanked: what each row it pushes says whatever the branches choose. */
    const unbranched = (t) => {
      let out = "", depth = 0;
      for (let i = 0; i < t.length; i++) {
        if (depth === 0 && t[i] === "$" && t[i + 1] === "{") { depth = 1; i++; out += "  "; continue; }
        if (depth > 0) { if (t[i] === "{") depth++; else if (t[i] === "}") depth--; out += " "; continue; }
        out += t[i];
      }
      return out;
    };
    const pushes = [];
    for (let at = 0; ;) {
      const i = code.indexOf("problems.push(", at);
      if (i < 0) break;
      at = i + 1;
      let d = 0, j = i + "problems.push".length;
      for (; j < lit.length; j++) { if (lit[j] === "(") d++; else if (lit[j] === ")" && --d === 0) break; }
      const text = code.slice(i, j + 1);
      const m = text.indexOf("message:");
      if (m < 0) continue;
      pushes.push({ line: lineOf(i), rule: (/rule:\s*"([^"]+)"/.exec(text) || [])[1] || "?", text, msg: text.slice(m) });
    }
    ok(pushes.length > 100, "the pushes were found (or the check below proves nothing)", pushes.length);
    ok(pushes.some((p) => p.rule === "inherited_states_still_load"), "…the one of B6-8 among them");
    const always = pushes.filter((p) => DECLINES.test(unbranched(p.msg)));
    const branched = pushes.filter((p) => !DECLINES.test(unbranched(p.msg)) && DECLINES.test(p.msg));
    ok(always.some((p) => p.rule === "inherited_states_still_load"), "THE CONTROL: the derivation sees B6-8's row as declining for every row", always.map((p) => p.rule));
    const bare = always.filter((p) => !/\bautoFix\s*:/.test(p.text));
    ok(bare.length === 0, "⭐⭐ no push declines Auto-fix in words that hold for every row it pushes and leaves autoFix unset", bare.map((p) => `${p.rule} (map-data.js:${p.line})`));
    console.log(`  info ${always.length} push(es) decline for every row; ${branched.length} decline only in a branch, not judged here: ${branched.map((p) => p.rule).join(", ")}`);
  }
} catch (e) { ok(false, "threw: " + e.message + "\n" + e.stack); }
finally {
  for (const d of tmps) { if (inside(d, os.tmpdir())) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} } }
}
console.log(`\n  ${pass} passed, ${fails.length} failed`);
if (fails.length) { for (const f of fails) console.log("  ✗ " + f); }
process.exitCode = fails.length ? 1 : 0;
