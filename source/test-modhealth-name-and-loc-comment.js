// Two Mod Health cry-wolf findings from the deferred pass, both adversarially confirmed.
//
// #missing-loc-ignores-own-name — the rule demanded a localisation key equal to the BLOCK ID, but HOI4
// displays whatever the block's own `name =` resolves to. Vanilla does this in its own files. Measured
// against the real corpora, the fix takes missing_localization from 4,118 → 2,662 on the base game (−35%)
// and 5,670 → 743 on Millennium Dawn (−87%) — an independent agent predicted 36% and 88% before the change,
// which is the corroboration that matters. 2,467 of MD's 2,469 characters fired: the implausible-number tell.
//
// #loc-line-trailing-comment — the localisation parser required the closing quote to be the last thing on
// the line, so any value carrying a trailing `#` comment did not resolve: 344 such lines in vanilla, 746 in
// MD. Paradox ships them (SEA_focus_l_english.yml:566, `JAP_hakko_ichiu: "Hakko Ichiu" # Hakkō Ichiu`) and
// Nova called that focus unlocalised. Two rules read this map, so both were poisoned.
//
// THE OTHER DIRECTION IS THE POINT. A rule that stops crying wolf by going silent is worse than one that
// cries wolf, so every quiet case below is paired with a firing one.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-mhname-"));
const mi = require("./mod-index.js");

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

const MOD = path.join(ROOT, "mhmod");
["common/ideas", "common/characters", "localisation/english"].forEach((d) =>
  fs.mkdirSync(path.join(MOD, ...d.split("/")), { recursive: true }));
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="MhMod"\nsupported_version="1.19.*"\n', "utf8");

fs.writeFileSync(path.join(MOD, "common", "ideas", "probe_ideas.txt"), [
  "ideas = {",
  "\tcountry = {",
  // 1. names a DIFFERENT key, and that key is localised → must stay quiet
  "\t\tidea_named_elsewhere = {",
  "\t\t\tname = probe_shared_name",
  "\t\t\tmodifier = { political_power_factor = 0.1 }",
  "\t\t}",
  // 2. names a different key that is NOT localised → must still fire, naming THAT key
  "\t\tidea_named_missing = {",
  "\t\t\tname = probe_absent_name",
  "\t\t\tmodifier = { political_power_factor = 0.1 }",
  "\t\t}",
  // 3. no name at all, no loc → must still fire on its id
  "\t\tidea_bare_unlocalised = {",
  "\t\t\tmodifier = { political_power_factor = 0.1 }",
  "\t\t}",
  // 4. no name, but localised under its id → quiet
  "\t\tidea_bare_localised = {",
  "\t\t\tmodifier = { political_power_factor = 0.1 }",
  "\t\t}",
  // 5. a `name =` nested inside another block must NOT be mistaken for the idea's own
  "\t\tidea_nested_name_only = {",
  "\t\t\tmodifier = { political_power_factor = 0.1 }",
  "\t\t\tai_will_do = { name = some_inner_thing }",
  "\t\t}",
  "\t}",
  "}",
  "",
].join("\n"), "utf8");

fs.writeFileSync(path.join(MOD, "common", "characters", "probe_chars.txt"), [
  "characters = {",
  // 6. a quoted literal name needs no localisation at all
  "\tprobe_char_literal = {",
  '\t\tname = "Anna Bergström"',
  "\t\tcountry_leader = { ideology = despotism }",
  "\t}",
  // 7. ONE character declaring the same advisor idea_token in two DLC-gated variants — the exact shape that
  //    made vanilla report douglas_macarthur, ernst_thalmann, maxime_weygand and friends as duplicate ideas.
  //    The token is indexed as an idea so add_ideas resolves; it is not a second definition of anything.
  "\tprobe_char_two_roles = {",
  '\t\tname = "Two Roles"',
  "\t\tinstance = {",
  '\t\t\tallowed = { has_dlc = "Probe Pack" }',
  "\t\t\tadvisor = { slot = political_advisor idea_token = probe_shared_token cost = 100 }",
  "\t\t}",
  "\t\tinstance = {",
  "\t\t\tadvisor = { slot = political_advisor idea_token = probe_shared_token cost = 150 }",
  "\t\t}",
  "\t}",
  "}",
  "",
].join("\n"), "utf8");

// A genuinely duplicated idea across two files — the control that proves duplicate_id still works at all,
// so "stopped crying wolf" cannot be confused with "switched off".
fs.writeFileSync(path.join(MOD, "common", "ideas", "probe_dupe_a.txt"),
  "ideas = {\n\tcountry = {\n\t\tprobe_real_dupe = { name = probe_shared_name modifier = { political_power_factor = 0.1 } }\n\t}\n}\n", "utf8");
fs.writeFileSync(path.join(MOD, "common", "ideas", "probe_dupe_b.txt"),
  "ideas = {\n\tcountry = {\n\t\tprobe_real_dupe = { name = probe_shared_name modifier = { political_power_factor = 0.2 } }\n\t}\n}\n", "utf8");

// probe_trailing_comment carries a trailing `#` comment — the shape the parser used to reject outright.
fs.mkdirSync(path.join(MOD, "common", "national_focus"), { recursive: true });
fs.writeFileSync(path.join(MOD, "common", "national_focus", "probe_focus.txt"), [
  "focus_tree = {",
  "\tid = probe_tree",
  "\tfocus = {",
  "\t\tid = probe_focus_progress",
  "\t\tx = 0",
  "\t\ty = 0",
  // Checking your OWN progress is legal — this is the shape both of vanilla's firings were.
  "\t\tai_will_do = { factor = 1 modifier = { factor = 0 focus_progress = { focus = probe_focus_progress progress > 0 } } }",
  "\t}",
  "\tfocus = {",
  "\t\tid = probe_focus_selfprereq",
  "\t\tx = 2",
  "\t\ty = 0",
  // …but being your own prerequisite is a genuine bug and must still fire.
  "\t\tprerequisite = { focus = probe_focus_selfprereq }",
  "\t}",
  "}",
  "",
].join("\n"), "utf8");

fs.mkdirSync(path.join(MOD, "common", "decisions"), { recursive: true });
fs.writeFileSync(path.join(MOD, "common", "decisions", "probe_tips.txt"), [
  "probe_cat = {",
  "\tprobe_tip_decision = {",
  "\t\tcost = 10",
  "\t\tcomplete_effect = {",
  "\t\t\tcustom_effect_tooltip = probe_generated|some_argument",
  "\t\t\tcustom_effect_tooltip = probe_runtime_[ROOT.GetTag]_suffix",
  "\t\t\tcustom_effect_tooltip = probe_plain_tooltip",
  "\t\t}",
  "\t}",
  "}",
  "",
].join("\n"), "utf8");

fs.writeFileSync(path.join(MOD, "localisation", "english", "probe_l_english.yml"),
  "﻿l_english:\n" +
  ' probe_shared_name:0 "Shared Name"\n' +
  ' idea_bare_localised:0 "Bare But Localised" # a translator note\n' +
  ' probe_trailing_comment:0 "Value With Comment" # note\n' +
  ' probe_escaped_quote:0 "He said \\"hello\\" loudly"\n' +
  ' probe_unterminated:0 "no closing quote here\n', "utf8");

try {
  const idx = mi.buildModIndex(MOD);
  const fired = new Set((idx.problems || [])
    .filter((p) => p.rule === "missing_localization")
    .map((p) => p.entityId));
  const msgOf = (id) => ((idx.problems || []).find((p) => p.rule === "missing_localization" && p.entityId === id) || {}).message || "";

  console.log("\n[quiet] content the game WILL display correctly must not be flagged");
  rec("an idea naming a localised key is quiet", !fired.has("idea_named_elsewhere"), [...fired]);
  rec("an idea localised under its own id is quiet", !fired.has("idea_bare_localised"), [...fired]);
  rec("a character with a quoted literal name is quiet", !fired.has("probe_char_literal"), [...fired]);

  console.log("\n[still fires] the rule must not have gone silent");
  // Without these, "stop crying wolf" and "stop working" are indistinguishable.
  rec("an idea naming an ABSENT key still fires", fired.has("idea_named_missing"), [...fired]);
  rec("…and the message names the key HOI4 reads, not the id",
    /probe_absent_name/.test(msgOf("idea_named_missing")), msgOf("idea_named_missing"));
  rec("a bare unlocalised idea still fires", fired.has("idea_bare_unlocalised"), [...fired]);
  rec("…naming its own id", /idea_bare_unlocalised/.test(msgOf("idea_bare_unlocalised")), msgOf("idea_bare_unlocalised"));

  console.log("\n[depth] a nested `name =` is not the entity's own");
  // Only depth 0 counts — a name inside ai_will_do or an instance is a different thing entirely.
  rec("an idea whose only `name =` is nested still fires on its id", fired.has("idea_nested_name_only"), [...fired]);
  rec("…and does not chase the nested token", !/some_inner_thing/.test(msgOf("idea_nested_name_only")), msgOf("idea_nested_name_only"));

  console.log("\n[loc parser] a value line with a trailing comment must resolve");
  const names = idx.entities ? null : null;
  void names;
  // idea_bare_localised's loc line carries a trailing comment; if the parser rejected it the idea would
  // have fired above. Assert the value itself came through cleanly too, without the comment attached.
  const locIdx = mi.scanLocalization ? mi.scanLocalization(MOD) : null;
  if (locIdx) {
    rec("a commented value resolves", locIdx.probe_trailing_comment !== undefined, Object.keys(locIdx).slice(0, 8));
    rec("…with the comment NOT part of the value",
      locIdx.probe_trailing_comment === "Value With Comment", JSON.stringify(locIdx.probe_trailing_comment));
    rec("…and an ordinary value is unaffected",
      locIdx.probe_shared_name === "Shared Name", JSON.stringify(locIdx.probe_shared_name));
  } else {
    rec("scanLocalization is exported for testing", false, "not exported");
  }

  console.log("\n[tooltip] engine generators and runtime-built keys are not loc keys");
  // custom_effect_tooltip = tech_effect|revolutionary_mass_assault is Paradox's own pipe-argument form; the
  // old capture truncated at `|` and invented a key nobody wrote. #tooltip-key-engine-generator
  const tips = new Set((idx.problems || [])
    .filter((p) => p.rule === "tooltip_key_no_localization").map((p) => p.entityId));
  rec("a piped engine generator is not reported", !tips.has("probe_generated"), [...tips]);
  rec("a bracketed runtime key is not reported", ![...tips].some((k) => /probe_runtime/.test(k)), [...tips]);
  // …and the rule must still work: a plain unlocalised tooltip key is a real problem.
  rec("a plain unlocalised tooltip key IS still reported", tips.has("probe_plain_tooltip"), [...tips]);

  console.log("\n[focus] `focus_progress = { focus = self }` is a legal trigger, not a link");
  const selfRefs = new Set((idx.problems || [])
    .filter((p) => p.rule === "focus_self_reference").map((p) => p.entityId));
  rec("a focus checking its OWN progress is not flagged", !selfRefs.has("probe_focus_progress"), [...selfRefs]);
  // The control: a real self-prerequisite is still a genuine bug and must still fire.
  rec("a focus that is its own prerequisite IS still flagged", selfRefs.has("probe_focus_selfprereq"), [...selfRefs]);

  console.log("\n[duplicate_id] an advisor token is not a definition");
  // The token exists so `add_ideas = <token>` resolves; the thing defined is the CHARACTER. Counting it made
  // vanilla report five of its own advisors as duplicates. #duplicate-id-advisor-token
  const dups = new Set((idx.problems || []).filter((p) => p.rule === "duplicate_id").map((p) => p.entityId));
  rec("one character's repeated advisor token is not a duplicate", !dups.has("probe_shared_token"), [...dups]);
  // The control: a REAL duplicate must still be reported, or the rule has just been switched off.
  rec("a genuinely duplicated idea IS still reported", dups.has("probe_real_dupe"), [...dups]);

  console.log("\n[loc hygiene] an unterminated quote is real breakage and was never reported");
  const malformed = (idx.problems || []).filter((p) => p.rule === "loc_value_malformed");
  rec("the unterminated line is reported", malformed.some((p) => p.entityId === "probe_unterminated"), malformed.map((p) => p.entityId));
  rec("…with the line number", malformed.some((p) => typeof p.line === "number" && p.line > 0), malformed);
  // Controls in both directions — the well-formed neighbours must stay quiet, including the one whose
  // value legitimately contains an ESCAPED quote.
  rec("a well-formed line is not reported", !malformed.some((p) => p.entityId === "probe_shared_name"), malformed.map((p) => p.entityId));
  rec("…nor is one with an escaped quote inside its value",
    !malformed.some((p) => p.entityId === "probe_escaped_quote"), malformed.map((p) => p.entityId));

  console.log(`\n=== modhealth name and loc comment: ${checks} checks, ${fails.length} failed ===`);
  if (fails.length) { fails.forEach((f) => console.log("   FAILED: " + f)); process.exitCode = 1; }
} catch (e) {
  console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
  process.exitCode = 1;
} finally {
  try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
}
