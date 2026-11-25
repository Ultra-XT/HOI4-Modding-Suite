// Regression (bug-hunt #5): the read-only OOB display model under-counted. Fixes: naval OOB uses `fleet`
// (not `navy`); air_wings/fleet can sit at the FILE top level; add_equipment_to_stockpile is often wrapped
// in DLC-gated if/else. Also confirms the byte-perfect round-trip is unaffected (serialize uses _segments).
// Run: node test-units-oob-parse.js
"use strict";
const { parseUnitsFile, serializeUnitsFile } = require("./unit-data.js");
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log("  PASS", n); } else { fail++; console.log("  FAIL", n, x != null ? "→ " + JSON.stringify(x) : ""); } };

const oob = `units = {
	fleet = {
		name = "Home Fleet"
		naval_base = 1
		task_force = { name = "TF1" ship = { name = "DD1" definition = destroyer } }
	}
	division = { name = "1st Inf" location = 100 division_template = "Infantry" }
}
air_wings = {
	100 = { fighter_equipment_0 = { owner = "GER" amount = 24 } }
}
instant_effect = {
	add_equipment_to_stockpile = { type = infantry_equipment_0 amount = 1000 producer = GER }
	if = {
		limit = { has_dlc = "Gotterdammerung" }
		add_equipment_to_stockpile = { type = sam_missile_equipment_1 amount = 5 producer = GER }
		add_equipment_to_stockpile = { type = nuclear_missile_equipment_1 amount = 2 producer = GER }
	}
}
`;

try {
  const m = parseUnitsFile(oob);
  // #5: a `fleet` block inside units = {} is counted as navy (MD naval OOB uses `fleet`, not `navy`)
  ok("fleet counted as navy (was 0)", m.units.navy.length === 1, m.units.navy.length);
  // #4/#6: a top-level air_wings block (outside units = {}) is captured
  ok("top-level air_wings captured (was 0)", m.units.airWings.length === 1, m.units.airWings.length);
  // #3: stockpile entries nested inside a DLC-gated if = {} are collected (1 direct + 2 nested = 3)
  ok("nested-in-if stockpile entries collected (1 direct + 2 gated = 3)", m.stockpiles.length === 3, m.stockpiles.map(s => s.type));
  ok("the DLC-gated SAM/nuclear types are present", m.stockpiles.some(s => s.type === "sam_missile_equipment_1") && m.stockpiles.some(s => s.type === "nuclear_missile_equipment_1"), m.stockpiles.map(s => s.type));
  ok("the direct (ungated) stockpile still present", m.stockpiles.some(s => s.type === "infantry_equipment_0"));
  // division still parsed
  ok("division parsed", m.units.divisions.length === 1 && m.units.divisions[0].template === "Infantry");
  // byte-perfect round-trip unaffected (serialize rebuilds from raw segments, not the display model)
  ok("serialize round-trips BYTE-IDENTICAL", serializeUnitsFile(m) === oob, "len " + serializeUnitsFile(m).length + " vs " + oob.length);
} catch (e) { fail++; console.log("  FAIL threw →", e && e.stack || e); }

console.log(`\nUNITS-OOB-PARSE: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
