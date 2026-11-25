// #focus-category-cat-prefix-stripped — the UPPERCASE half
//
// SAVING A FOCUS TREE DELETED THE `CAT_` PREFIX FROM 1,818 REAL CATEGORY NAMES.
//
// `category = X` appears inside add_tech_bonus and add_doctrine_cost_reduction in a focus's
// completion_reward. Nova rewrote it on the way out.
//
// This line already survived one round of the same bug. Stripping `cat_` unconditionally broke vanilla —
// `cat_heavy_armor` is a declared category and `heavy_armor` is not — and the fix made the strip
// CASE-SENSITIVE, reasoning that only the UPPERCASE form was a legacy artifact of older editor output.
//
// That reasoning does not survive Millennium Dawn, which declares 157 categories whose names begin with a
// capitalised `CAT_` — in a block it spells `technology_Categories`, capital C, which is also why a
// case-sensitive read of the declarations missed them and made MD look like it declared only vanilla's set.
//
// MEASURED across vanilla and four large workshop mods, classifying every `category = <token>` in every
// focus tree against the categories that mod actually declares:
//
//     Millennium Dawn   1,818 uppercase CAT_ values ARE declared exactly as written
//                           0 whose stripped form is declared
//     vanilla, Road to 56, Old World Blues, Rise of Nations
//                           0 uppercase CAT_ values at all
//
// Not one case in the corpus where stripping is right; 1,818 where it turns a real category into one that
// does not exist, so the add_tech_bonus grants nothing and HOI4 logs an invalid category.
//
// The legacy artifact the strip was written for is older NOVA output, not content any mod ships. Leaving
// such a value alone does not make it worse — and rewriting values on the way past is what caused this
// twice. The value is now written back exactly as it was read.
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
    console.log("  FAIL " + label + "  -> " + String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 320));
  }
}
const { stripJsComments } = require("./testlib-strip-comments.js");
const APP = stripJsComments(fs.readFileSync(path.join(__dirname, "public", "app.js"), "utf8"));

console.log("\n[the value is written back as it was read]");
{
  const m = /out\.push\(`category = \$\{([^}]*)\}`\);/.exec(APP);
  rec("the category emit line was found", !!m, "the save no longer emits `category = …` this way");
  const expr = m ? m[1].trim() : "";
  console.log("     emit expression: " + expr);
  // ⭐ NO TRANSFORMATION AT ALL. Any .replace/.toLowerCase/slice here is a rewrite of someone's data.
  rec("it emits the captured token unchanged", expr === "m[1]", expr);
  rec("…with no strip", !/replace\s*\(/.test(expr), expr);
  rec("…no case change", !/toLowerCase|toUpperCase/.test(expr), expr);

  // The lowercase half of this bug must stay fixed too.
  rec("CONTROL: the reasoning for the lowercase half is still recorded", /cat_` IS PART OF THE NAME/.test(fs.readFileSync(path.join(__dirname, "public", "app.js"), "utf8")),
    "the comment explaining why vanilla's cat_heavy_armor must survive was removed");
}

console.log("\n[display strippers are for humans and still strip]");
{
  // These turn a token into prose for the sidebar. They are NOT write paths, and stripping there is right.
  rec("the display humaniser still strips for readability", /function humanizeResearchBonusCategoryDisplay[\s\S]{0,300}?replace\(\/\^CAT_\/i, ""\)/.test(APP),
    "a display helper changed — check it is not now on a write path");
  rec("…and it lowercases, which a written value must never do", /function humanizeResearchBonusCategoryDisplay[\s\S]{0,300}?toLowerCase\(\)/.test(APP),
    "that is what marks it as display-only");
}

console.log("\n[RUN IT] every category value in every focus tree, new vs old");
{
  const m = /out\.push\(`category = \$\{([^}]*)\}`\);/.exec(APP);
  const expr = m ? m[1] : "m[1]";
  const sandbox = {};
  vm.createContext(sandbox);
  // The CURRENT emit, taken from the source, and the OLD one as the control.
  vm.runInContext(
    `function emitNow(tok) { const m = [null, tok]; return \`\${${expr}}\`; }\n` +
    `function emitOld(tok) { const m = [null, tok]; return \`\${m[1].replace(/^CAT_/, "")}\`; }`,
    sandbox,
  );
  const run = (fn, tok) => { sandbox.__t = tok; return vm.runInContext(`${fn}(__t)`, sandbox); };

  const ROOTS = [
    ["vanilla", "D:/SteamLibrary/steamapps/common/Hearts of Iron IV"],
    ["Millennium Dawn", "D:/SteamLibrary/steamapps/workshop/content/394360/2777392649"],
    ["Road to 56", "D:/SteamLibrary/steamapps/workshop/content/394360/820260968"],
    ["Old World Blues", "D:/SteamLibrary/steamapps/workshop/content/394360/2265420196"],
    ["Rise of Nations", "D:/SteamLibrary/steamapps/workshop/content/394360/2026448968"],
  ].filter(([, r]) => fs.existsSync(path.join(r, "common", "national_focus")));
  console.log("     corpora found: " + (ROOTS.map((r) => r[0]).join(", ") || "(none)"));

  // A fixture so this measures something on a machine with no HOI4 installed.
  const FIXTURE = ["CAT_corvette", "CAT_ai", "cat_heavy_armor", "land_doctrine", "armor"];

  let seen = 0, changedNow = 0, changedOld = 0, files = 0;
  for (const tok of FIXTURE) {
    seen++;
    if (run("emitNow", tok) !== tok) changedNow++;
    if (run("emitOld", tok) !== tok) changedOld++;
  }
  for (const [, root] of ROOTS) {
    const dir = path.join(root, "common", "national_focus");
    for (const name of fs.readdirSync(dir)) {
      if (!name.endsWith(".txt")) continue;
      let t; try { t = fs.readFileSync(path.join(dir, name), "utf8"); } catch (_) { continue; }
      files++;
      t = t.replace(/#[^\r\n]*/g, "");
      for (const c of t.matchAll(/\bcategory\s*=\s*([A-Za-z_][A-Za-z0-9_]*)/g)) {
        const tok = c[1];
        seen++;
        if (run("emitNow", tok) !== tok) changedNow++;
        if (run("emitOld", tok) !== tok) changedOld++;
      }
    }
  }
  console.log(`     ${files} focus trees · ${seen} category values · changed by the current emit ${changedNow} · by the old one ${changedOld}`);
  rec("the corpus (or at least the fixture) was read", seen >= 5, seen);
  rec("RUN: ⭐ a save changes no category value", changedNow === 0, { changedNow, of: seen });
  // ⭐ BUILT-IN CONTROL: the old emit must lose what the new one keeps, or this measures nothing.
  rec("CONTROL: the old emit DID change them", changedOld >= 2, { changedOld, note: "if this is 0 the corpus has no CAT_ values and the run proves nothing" });
}

console.log("\n[why: the prefix is part of the declared name]");
{
  const MD = "D:/SteamLibrary/steamapps/workshop/content/394360/2777392649";
  const tags = path.join(MD, "common", "technology_tags");
  if (!fs.existsSync(tags)) {
    rec("Millennium Dawn is not installed — the evidence check is skipped", true, "");
  } else {
    let declared = new Set();
    for (const f of fs.readdirSync(tags)) {
      if (!f.endsWith(".txt")) continue;
      const t = fs.readFileSync(path.join(tags, f), "utf8").replace(/#[^\r\n]*/g, "");
      // ⚠️ Case-INSENSITIVE: Millennium Dawn writes `technology_Categories`. Reading it case-sensitively
      // reported MD as declaring only vanilla's 133 and made its own names look undeclared — which would
      // have argued for exactly the wrong fix.
      for (const b of t.matchAll(/technology_categories\s*=\s*\{([^{}]*)\}/gi)) {
        for (const tok of (b[1].match(/[A-Za-z_][A-Za-z0-9_]*/g) || [])) declared.add(tok);
      }
    }
    const upper = [...declared].filter((c) => /^CAT_/.test(c));
    console.log(`     Millennium Dawn declares ${declared.size} categories, ${upper.length} of them beginning with an uppercase CAT_`);
    rec("Millennium Dawn declares categories whose names begin with CAT_", upper.length >= 50, upper.length);
    rec("…so stripping the prefix would name a category that does not exist",
      upper.length > 0 && !declared.has(upper[0].replace(/^CAT_/, "")), { example: upper[0], strippedIsDeclared: declared.has((upper[0] || "").replace(/^CAT_/, "")) });
  }
}

console.log(`\n=== focus category survives a save: ${checks} checks, ${fails.length} failed ===`);
if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
