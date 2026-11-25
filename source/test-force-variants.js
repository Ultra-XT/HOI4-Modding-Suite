// force_equipment_variants (#5b): a division can pin a DESIGNED variant to its starting equipment.
// unit-data now models it: parseUnits reads it, genDivision emits it, round-trip is byte-stable.
// Run: node test-force-variants.js
"use strict";
const unit = require("./unit-data.js");

let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log("  ok  " + n); } else { fail++; console.error("  FAIL " + n + (x !== undefined ? " -> " + JSON.stringify(x) : "")); } };
const balanced = (s) => (s.replace(/#.*$/gm, "").replace(/"[^"]*"/g, '""').match(/{/g) || []).length === (s.replace(/#.*$/gm, "").replace(/"[^"]*"/g, '""').match(/}/g) || []).length;

const FILE =
  'units = {\n' +
  '\tdivision = {\n' +
  '\t\tname = "Royal Afghan Household Division"\n' +
  '\t\tlocation = 10737\n' +
  '\t\tdivision_template = "Royal Guard"\n' +
  '\t\tstart_experience_factor = 0.3\n' +
  '\t\tforce_equipment_variants = { light_tank_chassis_0 = { owner = AFG creator = FRA version_name = "FT mod. 31" } }\n' +
  '\t}\n' +
  '}\n';

try {
  console.log("=== genDivision emits force_equipment_variants ===");
  const gd = unit.genDivision({ name: "Test Div", location: 10737, template: "Royal Guard", experience: 0.3, forceVariants: [{ archetype: "light_tank_chassis_0", owner: "AFG", creator: "FRA", version_name: "FT mod. 31" }] });
  ok("emits the exact vanilla-shaped block", /force_equipment_variants = \{ light_tank_chassis_0 = \{ owner = AFG creator = FRA version_name = "FT mod\. 31" \} \}/.test(gd), gd);
  ok("brace-balanced", balanced(gd), gd);
  const gd2 = unit.genDivision({ name: "Multi", location: 1, template: "T", forceVariants: [{ archetype: "a_eq", owner: "GER" }, { archetype: "b_eq", owner: "GER", version_name: "X" }] });
  ok("multiple archetypes, creator/version optional", /a_eq = \{ owner = GER \}/.test(gd2) && /b_eq = \{ owner = GER version_name = "X" \}/.test(gd2) && balanced(gd2), gd2);
  const gd3 = unit.genDivision({ name: "None", location: 1, template: "T" });
  ok("no forceVariants → no block emitted", !/force_equipment_variants/.test(gd3), gd3);

  console.log("\n=== parseUnitsFile reads it into the model ===");
  const m = unit.parseUnitsFile(FILE);
  const div = m.units.divisions[0];
  ok("forceVariants parsed (archetype/owner/creator/version_name)", div.forceVariants && div.forceVariants.length === 1 && div.forceVariants[0].archetype === "light_tank_chassis_0" && div.forceVariants[0].owner === "AFG" && div.forceVariants[0].creator === "FRA" && div.forceVariants[0].version_name === "FT mod. 31", div.forceVariants);

  console.log("\n=== round-trip is byte-stable ===");
  ok("serializeUnitsFile(parseUnitsFile(x)) === x", unit.serializeUnitsFile(unit.parseUnitsFile(FILE)) === FILE, "drift");

  console.log("\n=== mergeOob preserves it for an UNTOUCHED division ===");
  const merged = unit.mergeOob(FILE, { templates: [], divisions: m.units.divisions });
  ok("untouched merge keeps force_equipment_variants + balanced", /force_equipment_variants = \{ light_tank_chassis_0/.test(merged) && balanced(merged), merged);

  console.log("\n=== a DIRTY (edited) division regenerates WITH force_equipment_variants ===");
  const dirty = Object.assign({}, div, { _dirty: true, experience: 0.5 });
  const merged2 = unit.mergeOob(FILE, { templates: [], divisions: [dirty] });
  ok("regenerated block still pins the variant + new experience", /force_equipment_variants = \{ light_tank_chassis_0 = \{ owner = AFG/.test(merged2) && /start_experience_factor = 0\.5/.test(merged2) && balanced(merged2), merged2);

  console.log("\n=== sanitisation ===");
  const gdBad = unit.genDivision({ name: "Bad", location: 1, template: "T", forceVariants: [{ archetype: "a eq } evil", owner: "G ER", version_name: 'has "quote' }] });
  // "a eq } evil" → tokenised to "aeqevil" (space + injection brace removed), "G ER" → "GER".
  // The version_name's quote is ESCAPED rather than deleted (#oob-name-backslash): a version_name is a
  // REFERENCE to a variant's name, and both sides go through the same writer, so escaping keeps the two
  // spellings identical where deleting would have to delete on both sides to still match.
  ok("archetype/owner tokenised (no space/brace), version quote escaped, balanced",
    /force_equipment_variants = \{ aeqevil = \{ owner = GER version_name = "has \\"quote" \} \}/.test(gdBad) && balanced(gdBad), gdBad);
  ok("…and the sanitised block still parses back to exactly one division",
    (() => { const r = unit.parseUnitsFile("units = {\n" + gdBad + "\n}\n");
      return ((r.units && r.units.divisions) || []).length === 1; })(), gdBad);

  console.log("\n=== REPEATED force_equipment_variants statements (round-11): all of them survive ===");
  // HOI4/MD legally REPEAT the statement — MD writes one archetype per line (12 on one CUB division; 817 of MD's
  // 5121 divisions have >1). A `.find` read only the FIRST, so a regeneration (any template rename dirties every
  // division using it) silently deleted the rest and left the division with rifles only. #5b
  const MULTI =
    'units = {\n' +
    '\tdivision = {\n' +
    '\t\tdivision_name = { is_name_ordered = yes name_order = 86 }\n' +
    '\t\tlocation = 10498\n' +
    '\t\tdivision_template = "Inf"\n' +
    '\t\tforce_equipment_variants = { infantry_weapons1 = { owner = CUB creator = SOV amount = 557 } }\n' +
    '\t\tforce_equipment_variants = { util_vehicle_0 = { owner = CUB amount = 30 } }\n' +
    '\t\tforce_equipment_variants = { artillery_0 = { owner = CUB amount = 12 } }\n' +
    '\t}\n' +
    '}\n';
  const mm = unit.parseUnitsFile(MULTI);
  const md = mm.units.divisions[0];
  ok("parse reads ALL repeated force_equipment_variants statements (3, not just the first)", (md.forceVariants || []).length === 3 && md.forceVariants.map((v) => v.archetype).join(",") === "infantry_weapons1,util_vehicle_0,artillery_0", md.forceVariants);
  ok("each repeated entry keeps its own owner/creator/amount", md.forceVariants[0].amount === 557 && md.forceVariants[0].creator === "SOV" && md.forceVariants[2].amount === 12, md.forceVariants);
  // a DIRTY (regenerated) division must keep every archetype — merged into one combined block is the vanilla form
  const dirtyMulti = Object.assign({}, md, { _dirty: true, template: "Inf Reformed" });
  const outMulti = unit.mergeOob(MULTI, { templates: [], divisions: [dirtyMulti] });
  const pins = (unit.parseUnitsFile(outMulti).units.divisions[0].forceVariants || []).map((v) => v.archetype);
  ok("regenerated division keeps ALL 3 archetype pins (none silently deleted)", pins.length === 3 && pins.includes("infantry_weapons1") && pins.includes("util_vehicle_0") && pins.includes("artillery_0"), pins);
  ok("regenerated multi-variant division is brace-balanced + kept the edit", balanced(outMulti) && /division_template = "Inf Reformed"/.test(outMulti), outMulti);

  console.log("\n=== amount (round-3): amount = N survives emit + parse + round-trip ===");
  const gdAmt = unit.genDivision({ name: "Amt", location: 1, template: "T", forceVariants: [{ archetype: "a_eq", owner: "GER", amount: 40 }] });
  ok("genDivision emits amount when present", /a_eq = \{ owner = GER amount = 40 \}/.test(gdAmt) && balanced(gdAmt), gdAmt);
  const gdAmt0 = unit.genDivision({ name: "Amt0", location: 1, template: "T", forceVariants: [{ archetype: "a_eq", owner: "GER", amount: 0 }] });
  ok("falsy-zero: amount = 0 emitted literally (not dropped, not defaulted)", /a_eq = \{ owner = GER amount = 0 \}/.test(gdAmt0), gdAmt0);
  const AMTFILE =
    'units = {\n' +
    '\tdivision = {\n' +
    '\t\tname = "Amt Div"\n' +
    '\t\tlocation = 1\n' +
    '\t\tdivision_template = "T"\n' +
    '\t\tforce_equipment_variants = { light_tank_chassis_0 = { owner = AFG amount = 24 } }\n' +
    '\t}\n' +
    '}\n';
  const mAmt = unit.parseUnitsFile(AMTFILE);
  ok("parseUnitsFile reads amount into the model", mAmt.units.divisions[0].forceVariants[0].amount === 24, mAmt.units.divisions[0].forceVariants);
  ok("amount round-trip byte-stable", unit.serializeUnitsFile(unit.parseUnitsFile(AMTFILE)) === AMTFILE, "drift");
  // owner is mandatory: an entry with a blank/absent owner must be SKIPPED (never emit a dangling `owner = ` token).
  const gdNoOwner = unit.genDivision({ name: "NoOwner", location: 1, template: "T", forceVariants: [{ archetype: "a_eq", owner: "", amount: 5 }, { archetype: "b_eq", owner: "GER" }] });
  ok("owner-less variant skipped, valid one kept, no dangling owner token", !/a_eq/.test(gdNoOwner) && /b_eq = \{ owner = GER \}/.test(gdNoOwner) && !/owner = \}/.test(gdNoOwner) && !/owner =  /.test(gdNoOwner) && balanced(gdNoOwner), gdNoOwner);
} catch (e) {
  ok("threw: " + (e && e.stack ? e.stack : e), false);
}

console.log(`\nFORCE-VARIANTS: ${pass} passed, ${fail} failed`);
process.exitCode = fail ? 1 : 0;
