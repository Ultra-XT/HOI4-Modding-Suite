// mergeOob template identity: a division_template is matched to its original file block by a STABLE identity
// (_origName, the load-time name) via a consuming queue — so (1) RENAMING a template preserves its un-modeled
// fields (role/obsolete/division_cap/…) in place instead of dropping them and moving the block to the end,
// and (2) two legitimately same-named templates don't collapse into one. Run: node test-oob-template-identity.js
"use strict";
const { mergeOob } = require("./unit-data.js");

let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log("  ok  " + n); } else { fail++; console.error("  FAIL " + n + (x !== undefined ? " -> " + JSON.stringify(x) : "")); } };
const count = (s, re) => (s.match(re) || []).length;

// ── Bug #1: rename preserves un-modeled fields AND keeps the block's position ──
{
  const original = [
    "division_template = {",
    '\tname = "Alpha"',
    "\trole = garrison",   // un-modeled by Nova → must survive a rename
    "\tobsolete = yes",    // un-modeled → must survive
    "\tregiments = {",
    "\t\tinfantry = { x = 0 y = 0 }",
    "\t}",
    "}",
    "",
    "division_template = {",
    '\tname = "Keeper"',
    "\tregiments = {",
    "\t\tartillery = { x = 0 y = 0 }",
    "\t}",
    "}",
    "",
  ].join("\n");
  const edited = { templates: [
    { name: "Bravo", _origName: "Alpha", _dirty: true, regiments: [{ unit: "infantry", x: 0, y: 0 }], support: [] },
    { name: "Keeper", _origName: "Keeper", _dirty: false, regiments: [{ unit: "artillery", x: 0, y: 0 }], support: [] },
  ], divisions: [] };
  const out = mergeOob(original, edited);
  ok("rename: new name present", /name = "Bravo"/.test(out), out.slice(0, 120));
  ok("rename: old name gone", !/name = "Alpha"/.test(out));
  ok("rename: un-modeled `role = garrison` PRESERVED", /role = garrison/.test(out));
  ok("rename: un-modeled `obsolete = yes` PRESERVED", /obsolete = yes/.test(out));
  ok("rename: block stays IN PLACE (Bravo before Keeper, not appended at end)", out.indexOf("Bravo") < out.indexOf("Keeper"));
  ok("rename: still exactly 2 templates", count(out, /division_template = \{/g) === 2, count(out, /division_template = \{/g));
}

// ── Bug #2: two same-named templates must not collapse (MD ships this — AFG "Northern Alliance Brigade" ×2) ──
{
  const original = [
    "division_template = {", '\tname = "Twin"', "\tregiments = {", "\t\tinfantry = { x = 0 y = 0 }", "\t}", "}", "",
    "division_template = {", '\tname = "Twin"', "\tregiments = {", "\t\tcavalry = { x = 0 y = 0 }", "\t}", "}", "",
  ].join("\n");
  // Edit ONLY the second Twin (cavalry → armor). Both carry _origName = "Twin".
  const edited = { templates: [
    { name: "Twin", _origName: "Twin", _dirty: false, regiments: [{ unit: "infantry", x: 0, y: 0 }], support: [] },
    { name: "Twin", _origName: "Twin", _dirty: true, regiments: [{ unit: "armor", x: 0, y: 0 }], support: [] },
  ], divisions: [] };
  const out = mergeOob(original, edited);
  ok("dup: still TWO 'Twin' blocks", count(out, /name = "Twin"/g) === 2, count(out, /name = "Twin"/g));
  ok("dup: first Twin KEEPS infantry (not overwritten by its sibling)", count(out, /infantry = \{/g) === 1, count(out, /infantry = \{/g));
  ok("dup: second Twin got the edit (armor)", /armor = \{/.test(out));
  ok("dup: old cavalry replaced, not duplicated", !/cavalry/.test(out));
}

// ── New template is appended; existing stays in place (identity, not name, drives matching) ──
{
  const original = ["division_template = {", '\tname = "Delta"', "\tregiments = {", "\t\tinfantry = { x = 0 y = 0 }", "\t}", "}", ""].join("\n");
  const edited = { templates: [
    { name: "Delta", _origName: "Delta", _dirty: false, regiments: [{ unit: "infantry", x: 0, y: 0 }], support: [] },
    { name: "Echo", _dirty: true, regiments: [{ unit: "armor", x: 0, y: 0 }], support: [] }, // NEW — no _origName
  ], divisions: [] };
  const out = mergeOob(original, edited);
  ok("new: existing Delta kept, new Echo appended, in order", /name = "Delta"/.test(out) && /name = "Echo"/.test(out) && out.indexOf("Delta") < out.indexOf("Echo"), out);
  ok("new: exactly 2 templates", count(out, /division_template = \{/g) === 2);
}

// ── Backward-compat: an OLDER payload with no _origName (non-rename edit) still preserves un-modeled fields ──
{
  const original = ["division_template = {", '\tname = "Charlie"', "\tdivision_cap = 5", "\tregiments = {", "\t\tinfantry = { x = 0 y = 0 }", "\t}", "}", ""].join("\n");
  const edited = { templates: [{ name: "Charlie", _dirty: true, regiments: [{ unit: "infantry", x: 0, y: 0 }, { unit: "artillery", x: 1, y: 0 }], support: [] }], divisions: [] };
  const out = mergeOob(original, edited);
  ok("compat: no _origName + non-rename edit preserves `division_cap = 5`", /division_cap = 5/.test(out), out);
  ok("compat: the edit landed (artillery added)", /artillery/.test(out));
}

console.log(`\nOOB-TEMPLATE-IDENTITY: ${pass} passed, ${fail} failed`);
process.exitCode = fail ? 1 : 0;
