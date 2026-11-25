// #bare-token-list — a Clausewitz list of bare tokens must parse as a list, not as key/value pairs.
//
// Clausewitz has two shapes: `key = value`, and `{ a b c d e }` — a list of bare tokens with no operators at
// all. splitTop collected an OPTIONAL operator and then unconditionally consumed the next token as a value,
// so a bare list parsed as {a:b},{c:d},{e:""} and any caller taking `.key` off each entry got every SECOND
// token.
//
// That is how GET /api/subunits returned half of each sub_unit's `categories` and `type`. Vanilla's `infantry`
// has 5 categories and came back with 3; `marine` has 7 and came back with 4; `type = { infantry support }`
// came back as just ["infantry"], so the `support` token was never reported for any of the 31 vanilla support
// companies.
//
// It reaches the user through the Division Template Designer, which picks a unit's NATO symbol from these
// lists and buckets a support company by `types.includes("support")`. A modded company that declares itself
// only via `type = { infantry support }` and omits `group` landed in the LINE box instead of SUPPORT.
//
// Both directions: bare lists must parse whole, and `key = value` — including operators like `<` and `>` —
// must keep working, since the same function parses every Clausewitz block in unit-data.js.
//
// Hermetic: parses strings built here; no corpus is read.
"use strict";
const u = require("./unit-data.js");

const fails = [];
let checks = 0;
function rec(label, ok, detail) {
  checks++;
  if (ok) console.log("  ok   " + label);
  else {
    fails.push(label);
    console.log("  FAIL " + label + "  -> " + String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 240));
  }
}

try {
  // ── Bare-token lists, the shape that was halved ──────────────────────────────────────────────
  console.log("\n[bare token lists]");
  const src =
    "sub_units = {\n" +
    "\tzz_line = {\n" +
    "\t\ttype = { infantry support }\n" +
    "\t\tcategories = { cat_a cat_b cat_c cat_d cat_e }\n" +
    "\t\tgroup = infantry\n" +
    "\t}\n" +
    "\tzz_odd = {\n" +
    "\t\ttype = { armor anti_air }\n" +
    "\t\tcategories = { one two three }\n" +
    "\t}\n" +
    "}\n";
  const parsed = u.parseSubUnitsFile(src);
  rec("both sub_units parsed", parsed.length === 2, parsed.map((p) => p.key));

  const line = parsed.find((p) => p.key === "zz_line");
  rec("an EVEN-length list keeps every token",
    line && line.types.length === 2 && line.types.join(",") === "infantry,support", line && line.types);
  rec("an ODD-length list keeps every token",
    line && line.categories.length === 5 && line.categories.join(",") === "cat_a,cat_b,cat_c,cat_d,cat_e",
    line && line.categories);

  const odd = parsed.find((p) => p.key === "zz_odd");
  rec("a second sub_unit's lists are whole too",
    odd && odd.types.join(",") === "armor,anti_air" && odd.categories.join(",") === "one,two,three",
    odd && { types: odd.types, categories: odd.categories });

  // The consumer's actual question: is this a support company?
  console.log("\n[what the Division Designer asks]");
  rec("a company declaring support only via `type` is seen as support",
    line && (line.types || []).includes("support"), line && line.types);
  rec("…and one that does not is not", odd && !(odd.types || []).includes("support"), odd && odd.types);

  // ── key = value must still work — the same splitter parses every block ───────────────────────
  console.log("\n[key = value still parses]");
  const kv = u.parseSubUnitsFile(
    "sub_units = {\n\tzz_kv = {\n\t\tabbreviation = \"KV\"\n\t\tgroup = armor\n\t\tcategories = { solo }\n\t}\n}\n"
  );
  const one = kv[0];
  rec("a quoted value is read", one && one.abbreviation === "KV", one && one.abbreviation);
  rec("a bare value is read", one && one.group === "armor", one && one.group);
  rec("a single-item list is a list, not a key with no value",
    one && one.categories.length === 1 && one.categories[0] === "solo", one && one.categories);

  // A comparison operator must not be mistaken for a bare token.
  const cmp = u.parseSubUnitsFile(
    "sub_units = {\n\tzz_cmp = {\n\t\tgroup = infantry\n\t\tcategories = { a b }\n\t}\n}\n"
  );
  rec("a following block is not swallowed by the list before it",
    cmp[0] && cmp[0].categories.join(",") === "a,b" && cmp[0].group === "infantry",
    cmp[0] && { cats: cmp[0].categories, group: cmp[0].group });

  console.log(`\n=== subunit bare-token lists: ${checks} checks, ${fails.length} failed ===`);
  if (fails.length) {
    fails.forEach((f) => console.log("   FAILED: " + f));
    process.exitCode = 1;
  }
} catch (e) {
  console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 6).join("\n") : e);
  process.exitCode = 1;
}
