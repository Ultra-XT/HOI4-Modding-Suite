// The focus-tree simulator projects what a tree's completion rewards do to a country's ledger. It cannot
// model everything, and its whole design rests on being HONEST about that: anything it cannot faithfully
// project is collected in simNotSimulated and shown to the user "rather than silently dropped or faked",
// in the words of its own header.
//
// Nothing tested that. The property is load-bearing in an unusual way, because breaking it looks like an
// improvement: adding `case "if":` to the effect switch would make the simulator project MORE, and would
// be a plain regression — a conditional effect projected unconditionally tells the user a number they will
// not actually get, with more confidence than before, and no error anywhere.
//
// The same reasoning applies to random, else and else_if, and to scopes. An effect inside
// `every_country = { … }` happens to somebody else; projecting it into THIS country's ledger would be
// worse than admitting it is not modelled.
//
// So this pins the two halves of the contract:
//   * the constructs whose effects are conditional or scoped must NOT be modelled cases
//   * whatever is not a modelled case must still be RECORDED, not dropped
//
// Comments are stripped first: the file explains this design in prose, and a naive grep would match its own
// explanation rather than the switch.
"use strict";

const fs = require("fs");
const path = require("path");
const { stripJsComments } = require("./testlib-strip-comments.js");

const APP = stripJsComments(fs.readFileSync(path.join(__dirname, "public", "app.js"), "utf8"));

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (detail == null ? "" : "   " + (typeof detail === "string" ? detail : JSON.stringify(detail))));
  if (!ok) fails.push(label);
};

try {
  // The effect switch, from the function that walks a focus's reward script to the end of its default arm.
  const at = APP.indexOf("function applyFocusEffectScript");
  const body = at === -1 ? "" : APP.slice(at, at + 9000);
  rec("the simulator's effect engine was found", body.length > 500, body.length + " chars");

  console.log("\n1. It refuses to project what it cannot know");
  // Each of these decides WHETHER an effect happens, or WHO it happens to. Projecting their contents into
  // this country's ledger would state a number the player may never see.
  for (const k of ["if", "else", "else_if", "random", "random_list"]) {
    rec("`" + k + "` is not modelled as a plain effect",
      !new RegExp('case\\s+"' + k + '"').test(body),
      "a conditional projected unconditionally is a confident wrong number");
  }

  console.log("\n2. …but records it rather than dropping it");
  rec("there is a default arm", /default:/.test(body), "unknown effects would vanish silently");
  rec("…and it adds to the honesty ledger", /default:[\s\S]{0,600}?simNotSimulated\.add\(/.test(body),
    "the default arm exists but records nothing");
  // Tooltip-only commands are deliberately excluded — listing them would be noise, not honesty.
  rec("…while skipping pure-tooltip commands", /custom_effect_tooltip/.test(body));

  console.log("\n3. The ledger is shown, not just collected");
  // Collecting into a Set that nothing renders would be the same as dropping, with extra steps.
  rec("simNotSimulated is read back somewhere", (APP.match(/simNotSimulated/g) || []).length > 3,
    (APP.match(/simNotSimulated/g) || []).length + " references");
  rec("…and it is cleared per run, so it cannot accumulate stale entries",
    /simNotSimulated\s*=\s*new Set\(\)|simNotSimulated\.clear\(\)/.test(APP));

  console.log("\n4. What it DOES model, it models deliberately");
  // A control: if the switch ever empties out, sections 1 and 2 would pass vacuously.
  const cases = (body.match(/case\s+"[a-z_0-9]+"/g) || []).length;
  rec("the switch still models a real set of effects", cases >= 15, cases + " cases");
  rec("…including the core ledger stats",
    /case\s+"add_political_power"/.test(body) && /case\s+"add_stability"/.test(body));
  // hidden_effect is the one wrapper it SHOULD recurse into: it always fires, it is merely invisible.
  rec("hidden_effect is recursed into, because it always fires", /case\s+"hidden_effect"/.test(body));

  console.log("\n5. These checks would actually catch the regression they exist for");
  // There is no bug to back out here — this test guards a design decision that is currently correct. So
  // the only way to know it is load-bearing is to compose the mistake and confirm it would be caught.
  // Without this, every assertion above could be quietly matching nothing.
  const REGRESSED = 'function applyFocusEffectScript(x) { switch (key) {\n' +
    '      case "add_stability": break;\n' +
    '      case "if": applyFocusEffectScript(stmt.block); break;\n' +
    '      default: break;\n' +
    '    } }';
  rec("adding `case \"if\"` would be rejected", /case\s+"if"/.test(REGRESSED));
  rec("a default arm that records nothing would be rejected",
    !/default:[\s\S]{0,600}?simNotSimulated\.add\(/.test(REGRESSED));
  // And the inverse: the real source must not accidentally satisfy the broken pattern.
  rec("the real engine is not the regressed shape", !/case\s+"if"/.test(body));

  console.log(`\n=== the simulator admits what it cannot model: ${checks} checks, ${fails.length} failed ===`);
  if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
} catch (e) {
  console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
  process.exitCode = 1;
}
