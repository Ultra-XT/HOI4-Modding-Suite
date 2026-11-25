// Two ways an ordinary focus-tree Save corrupted rewards, both found by round-tripping REAL vanilla trees.
//
// #focus-category-cat-prefix-stripped — `category = cat_heavy_armor` BECAME `category = heavy_armor`.
// HOI4's declared category list (common/technology_tags/00_technology.txt) contains BOTH shapes: bare names
// like `land_doctrine`, `armor`, `artillery`, and prefixed ones like `cat_light_armor`, `cat_anti_tank`,
// `cat_heavy_fighter`. The `cat_` is part of the name. Stripping it unconditionally produced a category HOI4
// never declared, so the add_tech_bonus granted nothing. Measured: ALL 39 prefixed categories become
// undeclared when stripped; 89 occurrences across 22 vanilla trees went to zero on a single save; vanilla's
// own trees write `category = cat_*` 217 times.
// Making the strip merely case-SENSITIVE was not enough either: Millennium Dawn declares 157 categories
// whose names begin with a capitalised `CAT_`, so the uppercase form is not a legacy artifact of older editor
// output the way it was assumed to be. The value is now written back exactly as it was read — see
// test-focus-category-survives-a-save.js for the corpus measurement.
//
// #focus-scoped-limit-split — A SCOPED BLOCK WITH A `limit` WAS EXPLODED INTO SEPARATE BLOCKS.
// isRecognizedEffectUnit returned true for ANY brace block, so `limit` — a TRIGGER — counted as a manageable
// effect. That tipped the adoption heuristic into re-emitting each inner statement as its own scoped block:
// the limit ended up alone in a block that does nothing, and the effect block lost its filter entirely.
// Vanilla's MEX_focus_rural_infrastructure went from one `every_state = { limit = {…six states…}
// add_building_construction = {…} }` to two blocks — so the construction applied to EVERY state the country
// owns instead of the six the author named.
"use strict";
const fs = require("fs");
const path = require("path");

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

const V = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
const APP = fs.readFileSync(path.join(__dirname, "public", "app.js"), "utf8");

console.log("\n[ground truth] HOI4 declares categories in BOTH shapes");
let declared = [];
try {
  const t = fs.readFileSync(path.join(V, "common", "technology_tags", "00_technology.txt"), "utf8");
  const m = /technology_categories\s*=\s*\{([\s\S]*?)\n\}/.exec(t);
  declared = (m ? m[1] : "").split(/\s+/).filter((x) => /^[a-z_]+$/.test(x));
} catch (_) {}
rec("the declared category list was readable", declared.length > 100, declared.length);
const prefixed = declared.filter((c) => c.startsWith("cat_"));
rec("…and some categories genuinely start with cat_", prefixed.length > 20, prefixed.slice(0, 5));
rec("…while others do not", declared.includes("land_doctrine") && declared.includes("armor"), {
  land_doctrine: declared.includes("land_doctrine"), armor: declared.includes("armor"),
});
// The whole point: stripping turns a declared name into an undeclared one.
const brokenByStrip = prefixed.filter((c) => !declared.includes(c.replace(/^cat_/, "")));
rec("…and EVERY prefixed category would become undeclared if stripped",
  prefixed.length > 0 && brokenByStrip.length === prefixed.length, { prefixed: prefixed.length, broken: brokenByStrip.length });

console.log("\n[the bug] nothing strips, so real cat_ names survive");
rec("the category emit applies no transformation at all", /out\.push\(`category = \$\{m\[1\]\}`\);/.test(APP),
  "a rewrite is back on the value — see test-focus-category-survives-a-save.js");
rec("…and the reason is recorded next to it", /cat_` IS PART OF THE NAME/.test(APP), "no explanation");

console.log("\n[real content] vanilla focus trees rely on the prefixed form");
let usages = 0, files = 0;
try {
  const dir = path.join(V, "common", "national_focus");
  for (const f of fs.readdirSync(dir)) {
    if (!/\.txt$/i.test(f)) continue;
    const n = (fs.readFileSync(path.join(dir, f), "utf8").match(/(^|\n)\s*category\s*=\s*cat_[a-z_]+/g) || []).length;
    if (n) { usages += n; files += 1; }
  }
} catch (_) {}
rec("vanilla's focus trees use category = cat_* widely", usages > 100, { usages, files });

console.log("\n[the bug] a `limit` is a trigger and must not count as an effect");
rec("trigger-shaped block keys are excluded", /TRIGGER_ONLY_BLOCK_KEYS/.test(APP), "no exclusion set");
rec("…including limit", /TRIGGER_ONLY_BLOCK_KEYS = new Set\(\["limit"/.test(APP), "limit not excluded");
// ⚠️ `indexOf` returns -1 when absent, and -1 is less than any real index — so a bare `a < b` here PASSED
// with the exclusion deleted entirely. Require both to be present first, or the ordering check is vacuous.
{
  const useAt = APP.indexOf("TRIGGER_ONLY_BLOCK_KEYS.has");
  const genericAt = APP.indexOf('if (unit.kind === "block") return true;');
  rec("the exclusion is actually applied in isRecognizedEffectUnit", useAt >= 0, { useAt });
  rec("…and runs BEFORE the generic block-is-an-effect rule",
    useAt >= 0 && genericAt >= 0 && useAt < genericAt, { useAt, genericAt });
}

console.log("\n[real content] the vanilla focus that this destroyed");
let mex = "";
try { mex = fs.readFileSync(path.join(V, "common", "national_focus", "mexico.txt"), "utf8"); } catch (_) {}
rec("vanilla's mexico.txt was readable", mex.length > 1000, mex.length);
// One scoped block holding a limit AND an effect — the exact shape that was being split in two.
rec("…and MEX_focus_rural_infrastructure is the shape in question",
  /every_state\s*=\s*\{[\s\S]{0,400}?limit\s*=\s*\{[\s\S]{0,400}?add_building_construction/.test(mex),
  "shape not found — the fixture assumption is stale");
let scoped = 0;
for (const m of mex.matchAll(/(every_state|every_owned_state|random_owned_state|capital_scope)\s*=\s*\{/g)) scoped += 1;
rec("…and vanilla uses scoped blocks throughout this file", scoped > 5, scoped);

console.log(`\n=== focus reward fidelity: ${checks} checks, ${fails.length} failed ===`);
if (fails.length) { fails.forEach((f) => console.log("   FAILED: " + f)); process.exitCode = 1; }
