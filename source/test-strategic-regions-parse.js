// parseStrategicRegions reads map/strategicregions/*.txt into {id,name,provinces} — it backs the Map
// editor's strategic-region assignment (test-map-region-move exercises the MOVE; this locks the PARSE).
// Real branching: the keyword must be a whole token (not a substring of another key), id is required,
// name defaults to REGION_<id>, provinces are the numbers in the `provinces = {}` block, and comments
// are stripped first.
"use strict";
const { parseStrategicRegions } = require("./map-data.js");

let pass = 0, fail = 0;
const check = (n, c, e) => { if (c) { pass++; console.log("  PASS", n); } else { fail++; console.log("  FAIL", n, e != null ? "→ " + JSON.stringify(e) : ""); } };
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const text = `
# Strategic regions for the map
strategic_region = {
	id = 1
	name = "STRATEGICREGION_1"
	provinces = {
		100 101 102
	}
}
strategic_region = {
	id = 2
	provinces = { 200 201 }
}
`;
const regs = parseStrategicRegions(text);
check("parses two regions", regs.length === 2, regs.length);
check("region 1 id + provinces", regs[0] && regs[0].id === 1 && eq(regs[0].provinces, [100, 101, 102]), regs[0]);
check("region 1 name carried through", regs[0] && /STRATEGICREGION_1/.test(regs[0].name), regs[0] && regs[0].name);
check("region 2 provinces (inline braces)", regs[1] && eq(regs[1].provinces, [200, 201]), regs[1]);
check("region 2 name defaults to REGION_<id>", regs[1] && regs[1].name === "REGION_2", regs[1] && regs[1].name);

// Whole-token guard: a key that merely ENDS with strategic_region must not be parsed as one.
const decoy = `area_strategic_region = {\n\tid = 99\n\tprovinces = { 7 }\n}\nstrategic_region = {\n\tid = 5\n\tprovinces = { 50 }\n}`;
const decoyRegs = parseStrategicRegions(decoy);
check("substring key (area_strategic_region) is NOT parsed", !decoyRegs.some((r) => r.id === 99), decoyRegs);
check("the real strategic_region beside it IS parsed", decoyRegs.some((r) => r.id === 5), decoyRegs);

// id is required — a block without one is skipped.
check("block without id is skipped", parseStrategicRegions("strategic_region = {\n\tname = NOPE\n\tprovinces = { 1 }\n}").length === 0);

// Comments stripped before parsing — a commented-out region is invisible.
check("commented-out region ignored", parseStrategicRegions("# strategic_region = { id = 7 provinces = { 1 } }").length === 0);

// No provinces block → empty provinces array (not undefined / no throw).
const noProv = parseStrategicRegions("strategic_region = {\n\tid = 3\n}");
check("region with no provinces → [] provinces", noProv.length === 1 && eq(noProv[0].provinces, []), noProv);

// Empty / junk input → [].
check("empty input → []", eq(parseStrategicRegions(""), []));
check("no strategic_region keyword → []", eq(parseStrategicRegions("supply_area = { id = 1 }"), []));

console.log(`\nSTRATEGIC-REGIONS-PARSE TEST: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
