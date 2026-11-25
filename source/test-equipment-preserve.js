// Regression for equipment round-trip data-loss: serializeEquipment() emits only year/archetype/8 core
// stats/resources, so re-saving an equipment the modder had hand-extended (maximum_speed, armor_value,
// module_slots, default_modules, air/naval stats, can_license, …) dropped all of it. The write path must
// carry those forward. Flat block → top-level preserve.
"use strict";
const { mergePreservedEquipmentBlock, reindentPdxStatement } = require("./server.js");

let pass = 0, fail = 0;
const check = (n, c, e) => { if (c) { pass++; console.log("  PASS", n); } else { fail++; console.log("  FAIL", n, e != null ? "→ " + e : ""); } };
const braces = (s) => { let d = 0; for (const c of s) { if (c === "{") d++; else if (c === "}") { d--; if (d < 0) return -1; } } return d; };

// The thin serialized block the maker would write.
const newBlock = `\tmy_tank_equipment = {
\t\tyear = 1936
\t\tarchetype = tank_equipment
\t\tbuild_cost_ic = 8
\t\tdefense = 20
\t\treliability = 0.8
\t\tresources = {
\t\t\tsteel = 2
\t\t}
\t}`;

// The on-disk block had advanced stats + a module system the maker doesn't model.
const oldInner = `
\t\tyear = 1936
\t\tarchetype = tank_equipment
\t\tbuild_cost_ic = 6
\t\tdefense = 18
\t\tmaximum_speed = 8
\t\tarmor_value = 30
\t\thardness = 0.8
\t\tpriority = 10
\t\tcan_license = yes
\t\tmodule_slots = {
\t\t\tmain_armament = { required = yes }
\t\t\tturret = { required = yes }
\t\t}
\t\tdefault_modules = {
\t\t\tmain_armament = tank_gun
\t\t}
\t\tresources = { steel = 1 }
`;

const out = mergePreservedEquipmentBlock(newBlock, oldInner);
check("output stays brace-balanced", braces(out) === 0, out);
check("preserves maximum_speed", /maximum_speed\s*=\s*8/.test(out), out);
check("preserves armor_value", /armor_value\s*=\s*30/.test(out));
check("preserves hardness", /hardness\s*=\s*0\.8/.test(out));
check("preserves priority", /priority\s*=\s*10/.test(out));
check("preserves can_license", /can_license\s*=\s*yes/.test(out));
check("preserves module_slots block", /module_slots\s*=\s*\{/.test(out) && /main_armament\s*=\s*\{\s*required\s*=\s*yes/.test(out));
check("preserves default_modules block", /default_modules\s*=\s*\{/.test(out) && /main_armament\s*=\s*tank_gun/.test(out));

// Modeled fields come from NEW (edit wins) and are NOT duplicated.
check("build_cost_ic is the NEW 8 (edit wins)", /build_cost_ic\s*=\s*8/.test(out) && !/build_cost_ic\s*=\s*6/.test(out), out);
check("build_cost_ic not duplicated", (out.match(/\bbuild_cost_ic\s*=/g) || []).length === 1);
check("defense is the NEW 20", /defense\s*=\s*20/.test(out) && !/defense\s*=\s*18/.test(out));
check("year not duplicated", (out.match(/\byear\s*=/g) || []).length === 1);
check("archetype not duplicated", (out.match(/\barchetype\s*=/g) || []).length === 1);
check("resources not duplicated (managed)", (out.match(/\bresources\s*=/g) || []).length === 1, (out.match(/\bresources\s*=/g) || []).length);

// Nothing to preserve when the old block has only modeled fields.
const plainOld = `\n\t\tyear = 1936\n\t\tarchetype = tank_equipment\n\t\tdefense = 10\n\t\tresources = { steel = 1 }\n`;
check("modeled-only old block adds nothing", mergePreservedEquipmentBlock(newBlock, plainOld) === newBlock);

// Empty old → unchanged.
check("empty old block returns new unchanged", mergePreservedEquipmentBlock(newBlock, "") === newBlock);

// Resource edit (the new equipment resource-cost grid): a multi-resource new set fully REPLACES the old
// one — resources is a managed key, so nothing from the old resource block survives and it isn't duplicated.
const multiNew = `\tmy_tank_equipment = {\n\t\tyear = 1936\n\t\tarchetype = tank_equipment\n\t\tresources = {\n\t\t\tsteel = 3\n\t\t\ttungsten = 2\n\t\t}\n\t}`;
const multiOut = mergePreservedEquipmentBlock(multiNew, oldInner);
check("resource edit: new steel = 3 present", /steel\s*=\s*3/.test(multiOut), multiOut);
check("resource edit: new tungsten = 2 present", /tungsten\s*=\s*2/.test(multiOut));
check("resource edit: old steel = 1 dropped", !/steel\s*=\s*1/.test(multiOut));
check("resource edit: exactly one resources block", (multiOut.match(/\bresources\s*=/g) || []).length === 1);
check("resource edit: still brace-balanced", braces(multiOut) === 0);

console.log(`\nEQUIPMENT-PRESERVE TEST: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
