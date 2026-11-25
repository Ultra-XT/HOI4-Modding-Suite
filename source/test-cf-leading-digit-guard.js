// Regression (bug-hunt #19c — adversarial SELF-REVIEW of the #19a leading-digit sweep): #19a tightened the
// leading-digit id validators for decisions/events/characters/ideas but MISSED the continuous-focus maker.
// cfUpsertFocus (create) + cfRenameFocus (rename) + the client CF editor still used the permissive
// /^[A-Za-z0-9_]+$/, so a user-typed id like "2024_focus" reached disk as `id = 2024_focus` inside a
// `focus = {}` block. HOI4 lexes a leading digit as a NUMBER → the whole continuous_focus palette fails to
// parse (breaking every continuous focus in it) — the exact class #19a declared fixed. Now all three sites
// use the anchored /^[A-Za-z_][A-Za-z0-9_]*$/. The self-review confirmed it end-to-end (3 sites, 3 opus
// verifiers); this locks it.
// Run: node test-cf-leading-digit-guard.js
"use strict";
const fs = require("fs"), path = require("path");
const S = require("./server.js");
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log("  PASS", n); } else { fail++; console.log("  FAIL", n, x != null ? "→ " + JSON.stringify(String(x).slice(0, 160)) : ""); } };
const throws = (fn) => { try { fn(); return false; } catch (_) { return true; } };

const FIXTURE = `continuous_focus_palette = {
\tid = generic_focus
\tposition = { x = 50 y = 1000 }
\tfocus = {
\t\tid = continuous_alpha
\t\ticon = GFX_goal_continuous_naval_production
\t\tdaily_cost = 1
\t}
}
`;

// ── cfUpsertFocus (create a NEW continuous focus) ──
ok("upsert REJECTS a leading-digit id (2024_focus)", throws(() => S.cfUpsertFocus(FIXTURE, "generic_focus", "2024_focus", { daily_cost: "1" })), "did not throw");
ok("upsert REJECTS a digit-only id (123)", throws(() => S.cfUpsertFocus(FIXTURE, "generic_focus", "123", { daily_cost: "1" })), "did not throw");
{
  let out = null, threw = false;
  try { out = S.cfUpsertFocus(FIXTURE, "generic_focus", "continuous_bravo", { daily_cost: "2" }); } catch (_) { threw = true; }
  ok("upsert ACCEPTS a valid id (continuous_bravo)", !threw && /id\s*=\s*continuous_bravo/.test(out || ""), threw ? "threw" : (out || "").slice(0, 80));
  ok("upsert ACCEPTS an underscore-leading id (_custom)", !throws(() => S.cfUpsertFocus(FIXTURE, "generic_focus", "_custom", { daily_cost: "1" })), "threw");
}

// ── cfRenameFocus (surgical id change of an existing focus) ──
ok("rename REJECTS a leading-digit new id (2024_focus)", throws(() => S.cfRenameFocus(FIXTURE, "generic_focus", "continuous_alpha", "2024_focus")), "did not throw");
{
  let out = null, threw = false;
  try { out = S.cfRenameFocus(FIXTURE, "generic_focus", "continuous_alpha", "continuous_renamed"); } catch (_) { threw = true; }
  ok("rename ACCEPTS a valid new id (continuous_renamed)", !threw && /id\s*=\s*continuous_renamed/.test(out || "") && !/id\s*=\s*continuous_alpha/.test(out || ""), threw ? "threw" : (out || "").slice(0, 120));
}

// ── the rejected upserts/renames leave the palette valid (brace-balanced, unchanged) ──
{
  // a rejected upsert must not have mutated anything (it throws before any splice)
  const before = FIXTURE;
  try { S.cfUpsertFocus(before, "generic_focus", "9bad", { daily_cost: "1" }); } catch (_) {}
  let d = 0; for (const c of before) { if (c === "{") d++; else if (c === "}") d--; }
  ok("fixture brace balance intact after a rejected upsert", d === 0, d);
}

// ── CLIENT source assertion: app.js CF editor uses the anchored pattern (no leading digit) ──
{
  const app = fs.readFileSync(path.join(__dirname, "public", "app.js"), "utf8");
  // the CF edit-modal validator line
  ok("client CF editor validator is anchored /^[A-Za-z_].../", /test\(newId\)\)\s*\{\s*\(window\.nbAlert/.test(app) && app.includes("[A-Za-z_][A-Za-z0-9_]*$/.test(newId)"), "client regex not tightened");
  ok("client CF editor no longer uses the permissive [A-Za-z0-9_]+ on newId", !/\/\^\[A-Za-z0-9_\]\+\$\/\.test\(newId\)/.test(app), "still permissive");
}

console.log(`\nCF-LEADING-DIGIT-GUARD: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
