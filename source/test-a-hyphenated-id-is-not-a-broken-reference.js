// ⛔ #focus-id-truncated, ON THE REFERENCE SIDE — THE OTHER HALF OF A FIX THAT WAS ONLY HALF APPLIED.
//
// A HOI4 id may contain a hyphen or a dot, and shipped content is full of them. `scanFocuses` was widened
// for exactly this, and its comment says so: "a focus id may contain a hyphen or a dot, and both occur in
// shipped content. Stopping at the first one silently TRUNCATED the id." But every id pattern in
// `extractRefs` still read `[A-Za-z0-9_]`, so the DEFINITION was indexed under its real name while the
// REFERENCE to it was cut at the hyphen — and the two then failed to match.
//
// Strictly measured over the installed corpus (a reported broken_reference where a real entity of the same
// type exists whose id continues past it with a character the narrow class cannot represent):
//
//     96 false broken_reference ERRORS, 14 of them on the SHIPPING BASE GAME — 41% of vanilla's total
//     by context: relative_position_id 78 · add_ideas 13 · swap_add_idea 3 · leads_to_tech 2
//     vanilla broken_reference 34 -> 20 · MD 205 -> 160 · R56 68 -> 48 · RoN 553 -> 543 · NV 52 -> 46
//
// ⭐ `ETH_anti-italian_propaganda` is named in the comment of the fix that widened the definition side.
// The same id, the same hyphen, the other half of the same bug, left behind for a later pass to find.
//
// ASCII is enough and the `u` flag is not needed: across vanilla and every installed mod, ZERO ids of a
// referenced type (idea, focus, tech, decision, event) contain a non-ASCII character. Measured, not assumed.
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { buildModIndex, extractRefs } = require("./mod-index.js");

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (detail === undefined ? "" : "   " + (typeof detail === "string" ? detail.slice(0, 190) : JSON.stringify(detail).slice(0, 190))));
  if (!ok) fails.push(label);
};

console.log("\n-- extractRefs keeps a hyphen, in every context that carries an id --");
const cases = [
  ["relative_position_id", "relative_position_id = AST_the_irish_anti-britain_pact", "AST_the_irish_anti-britain_pact"],
  ["add_ideas (bare)", "add_ideas = pro-american_idea", "pro-american_idea"],
  ["add_ideas (list)", "add_ideas = { pro-american_idea other_idea }", "pro-american_idea"],
  ["add_timed_idea", "add_timed_idea = { idea = pro-american_idea days = 30 }", "pro-american_idea"],
  ["swap_ideas add_idea", "swap_ideas = { remove_idea = a_idea add_idea = pro-american_idea }", "pro-american_idea"],
  ["remove_ideas", "remove_ideas = anti-war_idea", "anti-war_idea"],
  ["activate_decision", "activate_decision = ETH_italo-ethiopian_decision", "ETH_italo-ethiopian_decision"],
  ["leads_to_tech", "leads_to_tech = super-heavy_tank", "super-heavy_tank"],
  ["set_technology", "set_technology = { super-heavy_tank = 1 }", "super-heavy_tank"],
];
for (const [label, script, expected] of cases) {
  const ids = extractRefs(script).map((r) => r.id);
  rec(label + " keeps the whole id", ids.includes(expected), ids);
}

console.log("\n-- and a trailing dot or hyphen is punctuation, not part of the id --");
rec("a trailing hyphen is trimmed", extractRefs("add_ideas = some_idea-").map((r) => r.id).includes("some_idea"), extractRefs("add_ideas = some_idea-").map((r) => r.id));
rec("a dotted event id survives", extractRefs("country_event = { id = my_namespace.12 days = 1 }").map((r) => r.id).includes("my_namespace.12"), extractRefs("country_event = { id = my_namespace.12 days = 1 }").map((r) => r.id));

console.log("\n-- end to end: the reference resolves, and a real break still fires --");
const root = fs.mkdtempSync(path.join(os.tmpdir(), "nova-hyphenref-"));
try {
  fs.writeFileSync(path.join(root, "descriptor.mod"), 'name="hyphen refs"\n', "utf8");
  const w = (rel, body) => {
    const p = path.join(root, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, body, "utf8");
  };
  w(path.join("common", "national_focus", "f.txt"),
    "focus_tree = {\n\tid = t\n\tcountry = { factor = 1 }\n"
    + "\tfocus = {\n\t\tid = ETH_anti-italian_propaganda\n\t\ticon = GFX_a\n\t\tx = 1\n\t\ty = 1\n\t\tcost = 1\n\t}\n"
    // positioned relative to the hyphenated focus above — this was the 78-firing case
    + "\tfocus = {\n\t\tid = ETH_follow_up\n\t\ticon = GFX_a\n\t\trelative_position_id = ETH_anti-italian_propaganda\n\t\tx = 0\n\t\ty = 1\n\t\tcost = 1\n\t}\n"
    // the CONTROL: a reference to something that genuinely does not exist must still be reported
    + "\tfocus = {\n\t\tid = ETH_dangling\n\t\ticon = GFX_a\n\t\trelative_position_id = ETH_no-such_focus\n\t\tx = 0\n\t\ty = 2\n\t\tcost = 1\n\t}\n"
    + "}\n");
  w(path.join("common", "ideas", "i.txt"),
    "ideas = {\n\tcountry = {\n\t\tpro-american_idea = {\n\t\t\tremoval_cost = -1\n\t\t}\n\t}\n}\n");
  w(path.join("history", "countries", "ETH - Ethiopia.txt"), "ideas = {\n\tpro-american_idea\n}\n");
  w(path.join("localisation", "english", "l_l_english.yml"),
    "﻿l_english:\n ETH_anti-italian_propaganda:0 \"A\"\n ETH_follow_up:0 \"B\"\n ETH_dangling:0 \"C\"\n pro-american_idea:0 \"D\"\n");

  const idx = buildModIndex(root, {});
  const broken = idx.problems.filter((p) => p.rule === "broken_reference").map((p) => p.refId);
  rec("the hyphenated focus reference resolves", !broken.includes("ETH_anti"), broken);
  rec("...and is not reported under its truncated name either", !broken.some((r) => r === "ETH_anti-italian_propaganda"), broken);
  rec("the CONTROL still fires: a genuinely missing focus is reported", broken.includes("ETH_no-such_focus"), broken);

  const orphans = idx.problems.filter((p) => p.rule === "orphan_spirit").map((p) => p.entityId);
  rec("a hyphenated idea granted at game start is not an orphan", !orphans.includes("pro-american_idea"), orphans);
} finally {
  try { fs.rmSync(root, { recursive: true, force: true }); } catch (_) { /* scratch only */ }
}

console.log("\n-- the real vanilla ids this was found on, if the install is here --");
const V = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV/common/national_focus/australia_taog.txt";
if (fs.existsSync(V)) {
  const txt = fs.readFileSync(V, "utf8");
  rec("vanilla really does ship a hyphenated focus id", /\bid\s*=\s*AST_the_irish_anti-britain_pact/.test(txt));
  const ids = extractRefs(txt).filter((r) => r.context === "relative_position_id").map((r) => r.id);
  rec("...and its references now resolve to the whole id",
    ids.includes("AST_the_irish_anti-britain_pact") && !ids.includes("AST_the_irish_anti"),
    ids.filter((i) => i.startsWith("AST_the_irish")));
} else {
  console.log("  --   (no install at the expected path; the fixture above still covers the shape)");
}

console.log("\n-- structural: no id pattern in mod-index.js is narrow any more --");
// The 96 measured firings came from ONE class in ONE function. The remaining sites (equipment ids, advisor
// idea_tokens, division name groups, archetypes, block keys) were widened too and changed NOTHING on the
// current corpus — a deliberate, measured zero. They are kept because this exact class has now bitten five
// separate times on this project, and a mod that ships a hyphenated advisor token would revive it silently.
// Guarding the shape rather than a count is what makes that hold.
//
// ⚠️ Comments are stripped first: mod-index.js's own marker comment quotes the narrow class it replaced,
// and so does this file's header. A check that greps unstripped source finds its own prose and passes.
{
  const { stripJsComments } = require("./testlib-strip-comments.js");
  const src = stripJsComments(fs.readFileSync(path.join(__dirname, "mod-index.js"), "utf8"));
  const narrow = src.split("[A-Za-z_][A-Za-z0-9_]*").length - 1;
  rec("no narrow id token class survives in mod-index.js", narrow === 0, narrow + " left");
  // …and the sweep must actually be looking at something, or "0 narrow" would mean "0 scanned".
  const wide = src.split("[A-Za-z0-9_.\\-]").length - 1;
  rec("…and the wide class is genuinely in use", wide >= 15, wide + " uses");
  rec("the stripper did not return its input", src.length < fs.readFileSync(path.join(__dirname, "mod-index.js"), "utf8").length);
}

console.log("\n" + (fails.length ? "FAILED " + fails.length + "/" + checks : "PASSED " + checks + "/" + checks));
process.exitCode = fails.length ? 1 : 0;
