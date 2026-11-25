// Naval/air OOB writer numeric safety: genShip amount, genTaskForce location, genFleet naval_base and
// genAirGroupLines amount formatted numbers with a raw template literal, so Number("1e999") === Infinity (a bare
// `Number(v) || 0` doesn't catch it) or a finite >= 1e21 (`${1e21}` -> "1e+21") wrote an invalid Clausewitz token
// and made the OOB file unparseable — the formatHoi4Number/clamp hardening applied to every other writer had
// missed these. Now all four route through clampInt. Run: node test-navalair-numeric.js
"use strict";
const { genShip, genTaskForce, genFleet, addNavalAirOob } = require("./unit-data.js");

let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log("  ok  " + n); } else { fail++; console.error("  FAIL " + n + (x !== undefined ? " -> " + JSON.stringify(x) : "")); } };
const bad = (s) => /\bInfinity\b|\bNaN\b|[0-9]e[+\-]/i.test(s); // any invalid numeric token

const shipBase = { name: "X", definition: "battleship", equipment: "battleship_1", owner: "GER" };

// genShip amount: Infinity (from "1e999") coerced to the floor (1); huge finite clamped; normal round-trips.
ok("genShip: Infinity amount → no invalid token (falls to 1)", (() => { const s = genShip({ ...shipBase, amount: "1e999" }); return !bad(s) && /amount = 1\b/.test(s); })());
ok("genShip: huge finite amount clamped, no sci-notation", !bad(genShip({ ...shipBase, amount: "1e30" })), genShip({ ...shipBase, amount: "1e30" }));
ok("genShip: normal amount round-trips", /amount = 25\b/.test(genShip({ ...shipBase, amount: 25 })));

// genTaskForce location: Infinity/huge must not write `location = Infinity` / `1e+21`.
ok("genTaskForce: Infinity location not written as a token", !bad(genTaskForce({ name: "TF", location: "1e999", ships: [] })), genTaskForce({ name: "TF", location: "1e999", ships: [] }));
ok("genTaskForce: huge finite location clamped, no sci-notation", !bad(genTaskForce({ name: "TF", location: "1e30", ships: [] })));
ok("genTaskForce: a normal location still emits", /location = 12364\b/.test(genTaskForce({ name: "TF", location: 12364, ships: [] })));

// genFleet naval_base: same guard.
const fleetHuge = genFleet({ name: "F", naval_base: "1e30", ships: [shipBase] });
ok("genFleet: huge naval_base has no invalid token", !bad(fleetHuge), fleetHuge);
ok("genFleet: a normal naval_base emits", /naval_base = 12364\b/.test(genFleet({ name: "F", naval_base: 12364, ships: [shipBase] })));

// Air-group amount floor: a 0-plane wing hands the country nothing — the serializer must floor to 1 like genShip,
// so the OOB never carries a dead `amount = 0` entry (a green "Saved" over an empty air force). #air-amount-floor
const air0 = addNavalAirOob("", { airWings: [{ state: 64, groups: [{ equipment: "fighter_equipment_1", owner: "GER", amount: 0 }] }] });
ok("genAirGroupLines: amount 0 floored to 1 (no dead 0-plane wing)", /amount = 1\b/.test(air0) && !/amount = 0\b/.test(air0), air0);
const airBlank = addNavalAirOob("", { airWings: [{ state: 64, groups: [{ equipment: "fighter_equipment_1", owner: "GER" }] }] });
ok("genAirGroupLines: missing amount floored to 1", /amount = 1\b/.test(airBlank) && !/amount = 0\b/.test(airBlank), airBlank);
ok("genAirGroupLines: Infinity amount → no invalid token (falls to 1)", (() => { const a = addNavalAirOob("", { airWings: [{ state: 64, groups: [{ equipment: "fighter_equipment_1", owner: "GER", amount: "1e999" }] }] }); return !bad(a) && /amount = 1\b/.test(a); })());
ok("genAirGroupLines: a normal amount still round-trips", /amount = 12\b/.test(addNavalAirOob("", { airWings: [{ state: 64, groups: [{ equipment: "fighter_equipment_1", owner: "GER", amount: 12 }] }] })));

console.log(`\nNAVALAIR-NUMERIC: ${pass} passed, ${fail} failed`);
process.exitCode = fail ? 1 : 0;
