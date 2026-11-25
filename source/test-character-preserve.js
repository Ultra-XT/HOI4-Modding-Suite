// Regression for character round-trip data-loss: serializeCharacter() rebuilds a character from a thin
// model, so on edit/fork it silently dropped rich advisor sub-fields (allowed/available/on_add/modifier/
// ai_will_do/research_bonus), country_leader id/desc, a general's legacy_id, and un-modeled top-level
// fields (gfx). MD survey: 293/299 character files have rich advisors, ai_will_do×1753, legacy_id×29.
// mergePreservedCharacterBlock must re-inject the on-disk block's un-modeled fields into the new block.
"use strict";
const { mergePreservedCharacterBlock } = require("./server.js");

let pass = 0, fail = 0;
const check = (n, c, e) => { if (c) { pass++; console.log("  PASS", n); } else { fail++; console.log("  FAIL", n, e != null ? "→ " + e : ""); } };
const braces = (s) => { let d = 0; for (const c of s) { if (c === "{") d++; else if (c === "}") { d--; if (d < 0) return -1; } } return d; };

// The freshly-serialized (thin) block the maker would write for an advisor+leader character.
const newBlock = `\tADV_token = {
\t\tname = ADV_token
\t\tportraits = {
\t\t\tcivilian = {
\t\t\t\tlarge = "GFX_new_portrait"
\t\t\t}
\t\t}
\t\tcountry_leader = {
\t\t\tideology = conservatism
\t\t\ttraits = { leader_trait_x }
\t\t}
\t\tadvisor = {
\t\t\tslot = political_advisor
\t\t\tidea_token = ADV_token
\t\t\tcost = 150
\t\t\ttraits = { advisor_trait_y }
\t\t}
\t}`;

// The ON-DISK block (inner) — a rich MD-style character with fields the maker doesn't model.
const oldInner = `
\t\tname = ADV_token
\t\tgfx = some_gfx_culture
\t\tallowed_civil_war = { always = yes }
\t\tportraits = { civilian = { large = "GFX_old_portrait" } }
\t\tcountry_leader = {
\t\t\tideology = conservatism
\t\t\tid = 42
\t\t\tdesc = "LEADER_DESC_KEY"
\t\t\ttraits = { leader_trait_old }
\t\t}
\t\tadvisor = {
\t\t\tslot = political_advisor
\t\t\tidea_token = ADV_token
\t\t\tcost = 100
\t\t\tallowed = { original_tag = GER }
\t\t\tavailable = { has_war = no }
\t\t\ton_add = { country_event = some.1 }
\t\t\tresearch_bonus = { electronics = 0.1 }
\t\t\tai_will_do = { factor = 1 }
\t\t\ttraits = { advisor_trait_old }
\t\t}
`;

const out = mergePreservedCharacterBlock(newBlock, oldInner, "ADV_token");
check("output stays brace-balanced", braces(out) === 0, out);

// Advisor un-modeled fields carried forward.
check("advisor allowed preserved", /allowed\s*=\s*\{\s*original_tag\s*=\s*GER/.test(out), out);
check("advisor available preserved", /available\s*=\s*\{\s*has_war\s*=\s*no/.test(out));
check("advisor on_add preserved", /on_add\s*=\s*\{\s*country_event\s*=\s*some\.1/.test(out));
check("advisor research_bonus preserved", /research_bonus\s*=\s*\{\s*electronics\s*=\s*0\.1/.test(out));
check("advisor ai_will_do preserved", /ai_will_do\s*=\s*\{\s*factor\s*=\s*1/.test(out));

// Modeled fields come from the NEW block (the edit wins) — not duplicated.
check("advisor cost is the NEW 150 (edit wins)", /cost\s*=\s*150/.test(out) && !/cost\s*=\s*100/.test(out), out);
check("advisor cost not duplicated", (out.match(/\bcost\s*=/g) || []).length === 1);
check("advisor traits is the NEW value (not duplicated)", /advisor_trait_y/.test(out) && !/advisor_trait_old/.test(out));
check("advisor slot not duplicated", (out.match(/\bslot\s*=/g) || []).length === 1);

// country_leader un-modeled fields preserved; modeled (ideology/traits) come from new.
check("country_leader id preserved", /id\s*=\s*42/.test(out));
check("country_leader desc preserved", /desc\s*=\s*"LEADER_DESC_KEY"/.test(out));
check("country_leader traits is NEW value", /leader_trait_x/.test(out) && !/leader_trait_old/.test(out));
check("country_leader ideology not duplicated", (out.match(/\bideology\s*=/g) || []).length === 1);

// Top-level un-modeled fields appended.
check("top-level gfx preserved", /gfx\s*=\s*some_gfx_culture/.test(out));
check("top-level allowed_civil_war preserved", /allowed_civil_war\s*=\s*\{\s*always\s*=\s*yes/.test(out));

// Portraits stay the NEW (edited) ones — maker owns portraits.
check("portraits use the NEW portrait (edit wins)", /GFX_new_portrait/.test(out) && !/GFX_old_portrait/.test(out));

// name not duplicated (managed).
check("name not duplicated", (out.match(/^\s*name\s*=/gm) || []).length === 1, (out.match(/^\s*name\s*=/gm) || []).length);

// SAFETY: a character built with instance blocks bails out unchanged (no instance+flat conflict).
const instOld = `\n\t\tname = X\n\t\tinstance = { allowed = { always = yes } country_leader = { ideology = x } }\n`;
const instOut = mergePreservedCharacterBlock(newBlock, instOld, "ADV_token");
check("instance-based char bails out (returns new block unchanged)", instOut === newBlock);

// A new character with nothing on disk (oldInner empty) → unchanged.
check("empty oldInner returns new block unchanged", mergePreservedCharacterBlock(newBlock, "", "ADV_token") === newBlock);

// A character whose old block has ONLY modeled fields preserves nothing extra.
const plainOld = `\n\t\tname = ADV_token\n\t\tadvisor = { slot = political_advisor idea_token = ADV_token cost = 100 }\n`;
const plainOut = mergePreservedCharacterBlock(newBlock, plainOld, "ADV_token");
check("modeled-only old block adds nothing (balanced, no new keys)", braces(plainOut) === 0 && !/allowed|gfx|ai_will_do/.test(plainOut));

console.log(`\nCHARACTER-PRESERVE TEST: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
