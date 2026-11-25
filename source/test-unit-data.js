// Unit test: unit-data.js — read-only parser + lossless round-trip serializer for history/units/*.txt
// (a country's starting Order of Battle). Verifies serializeUnitsFile(parseUnitsFile(x)) === x byte-for-byte
// (every gap/comment/BOM preserved — the no-data-loss guarantee for a future editor) AND that the display
// model (division templates, division instances, equipment stockpile) is extracted correctly. Portable: uses
// embedded fixtures, not MD's path (MD's 924 real files are round-tripped by scratch-units.js separately).
// Run: node test-unit-data.js
"use strict";
const assert = require("assert");
const u = require("./unit-data.js");
let pass = 0;
const ok = (n, c, x) => { assert.ok(c, n + (x !== undefined ? " -> " + JSON.stringify(x) : "")); console.log("  ok  " + n); pass++; };

// A representative OOB file: leading BOM, full-line + inline comments, two templates (with regiments +
// support + priority), a units block (divisions + air_wings + navy), and an instant_effect stockpile.
const FIX = "﻿" + [
  "# a country's starting order of battle",
  "division_template = {",
  '\tname = "Line Infantry"',
  "",
  "\tregiments = {",
  "\t\tinfantry = { x = 0 y = 0 }",
  "\t\tinfantry = { x = 0 y = 1 }",
  "\t\tartillery = { x = 1 y = 0 }",
  "\t}",
  "\tsupport = {",
  "\t\tengineer = { x = 0 y = 0 }",
  "\t}",
  "\tpriority = 2",
  "}",
  "",
  "division_template = {",
  '\tname = "Tank Division"',
  "\tregiments = {",
  "\t\tarmor = { x = 0 y = 0 }",
  "\t}",
  "}",
  "",
  "units = {",
  "\tdivision = {",
  '\t\tname = "1st Infantry"',
  "\t\tlocation = 1234",
  '\t\tdivision_template = "Line Infantry"',
  "\t\tstart_experience_factor = 0.3",
  "\t}",
  "\tdivision = {",
  '\t\tname = "2nd Infantry"',
  "\t\tlocation = 5678",
  '\t\tdivision_template = "Line Infantry"',
  "\t}",
  '\tair_wings = {',
  '\t\t1234 = { fighter_equipment_0 = { owner = "AAA" amount = 20 } }',
  "\t}",
  '\tnavy = {',
  '\t\tname = "Home Fleet"',
  "\t}",
  "}",
  "",
  "instant_effect = {",
  "\tadd_equipment_to_stockpile = {",
  "\t\ttype = infantry_equipment_1   # rifles",
  "\t\tamount = 1000",
  "\t\tproducer = AAA",
  "\t}",
  "\tadd_equipment_to_stockpile = {",
  "\t\ttype = small_plane_airframe_1",
  '\t\tvariant_name = "Spitfire"',
  "\t\tamount = 12",
  "\t\tproducer = ENG",
  "\t}",
  "}",
  "",
].join("\n");

(() => {
  console.log("=== unit-data: lossless round-trip + correct model ===");
  const m = u.parseUnitsFile(FIX);

  ok("round-trip is BYTE-IDENTICAL (no data loss — gaps/comments/BOM preserved)", u.serializeUnitsFile(m) === FIX);

  ok("parses both division templates", m.templates.length === 2, m.templates.map((t) => t.name));
  ok("template 1 name/regiments/support/priority", m.templates[0].name === "Line Infantry" && m.templates[0].regiments.length === 3 && m.templates[0].support.length === 1 && m.templates[0].priority === 2, m.templates[0]);
  ok("template regiment carries unit + grid slot", m.templates[0].regiments[2].unit === "artillery" && m.templates[0].regiments[2].x === 1 && m.templates[0].regiments[2].y === 0, m.templates[0].regiments[2]);
  ok("template 2 has 1 regiment, 0 support", m.templates[1].name === "Tank Division" && m.templates[1].regiments.length === 1 && m.templates[1].support.length === 0, m.templates[1]);

  ok("parses 2 division instances", m.units.divisions.length === 2, m.units.divisions);
  ok("division name/location/template extracted", m.units.divisions[0].name === "1st Infantry" && m.units.divisions[0].location === 1234 && m.units.divisions[0].template === "Line Infantry", m.units.divisions[0]);
  ok("air_wings + navy captured", m.units.airWings.length === 1 && m.units.navy.length === 1, { air: m.units.airWings.length, navy: m.units.navy.length });

  ok("parses 2 stockpile entries", m.stockpiles.length === 2, m.stockpiles);
  ok("stockpile type/amount/producer (inline comment stripped)", m.stockpiles[0].type === "infantry_equipment_1" && m.stockpiles[0].amount === 1000 && m.stockpiles[0].producer === "AAA", m.stockpiles[0]);
  ok("stockpile variant_name + producer", m.stockpiles[1].variant_name === "Spitfire" && m.stockpiles[1].producer === "ENG" && m.stockpiles[1].amount === 12, m.stockpiles[1]);

  // summary helper
  const s = u.summarizeUnitsFile(FIX);
  ok("summary: 2 templates, 2 divisions, 1 air wing, 1 navy, 2 stockpile types", s.templates.length === 2 && s.divisions === 2 && s.airWings === 1 && s.navy === 1 && s.stockpileTypes === 2, s);

  // edge cases — all must round-trip exactly
  for (const [label, txt] of [
    ["empty file", ""],
    ["no trailing newline", 'division_template = {\n\tname = "X"\n\tregiments = { infantry = { x = 0 y = 0 } }\n}'],
    ["only instant_effect", "instant_effect = {\n\tadd_equipment_to_stockpile = { type = t amount = 5 producer = AAA }\n}\n"],
    ["blank/garbage only", "\n\n# nothing here\n\n"],
  ]) {
    ok("round-trips exactly: " + label, u.serializeUnitsFile(u.parseUnitsFile(txt)) === txt);
  }
  ok("empty file yields empty model", (() => { const e = u.parseUnitsFile(""); return e.templates.length === 0 && e.units.divisions.length === 0 && e.stockpiles.length === 0; })());

  // idempotent: re-parsing the serialized output gives the same structure
  const m2 = u.parseUnitsFile(u.serializeUnitsFile(m));
  ok("re-parse is structurally identical (idempotent)", m2.templates.length === m.templates.length && m2.units.divisions.length === m.units.divisions.length && m2.stockpiles.length === m.stockpiles.length);

  // splitTop also handles QUOTED keys (bookmark-data relies on this for "TAG" = { … } blocks): the model
  // key is unquoted, but the statement text keeps the quotes so the round-trip stays byte-perfect.
  const q = u.splitTop('name = "x"\n"PER" = { a = 1 }');
  ok("splitTop reads a quoted key (unquoted in model, quotes kept in text)", q.length === 2 && q[1].key === "PER" && q[1].text.indexOf('"PER"') === 0, q.map((s) => s.key));

  // aggregateOob: combine a country's DLC-variant files (templates in one, equipment split across others)
  const fileA = { templates: [{ name: "Inf", regiments: [1, 2, 3], support: [1] }], divisions: [{ name: "1st", location: 5, template: "Inf" }, { name: "2nd", location: 6, template: "Inf" }], stockpiles: [{ type: "rifle", amount: 100 }, { type: "tank", amount: 10 }] };
  const fileB = { templates: [{ name: "Inf", regiments: [1, 2, 3], support: [1] }], divisions: [{ name: "1st", location: 5, template: "Inf" }], stockpiles: [{ type: "rifle", amount: 50 }, { type: "plane", amount: 8 }] };
  const agg = u.aggregateOob([fileA, fileB]);
  ok("aggregate dedupes templates by name", agg.templates.length === 1 && agg.templates[0].name === "Inf" && agg.templates[0].regiments === 3 && agg.templates[0].support === 1, agg.templates);
  ok("aggregate dedupes divisions by name+location+template", agg.divisions.length === 2, agg.divisions);
  ok("aggregate sums stockpile by type, sorted desc by amount", agg.stockpile[0].type === "rifle" && agg.stockpile[0].amount === 150 && agg.stockpile.length === 3, agg.stockpile);
  ok("aggregate of nothing is empty", (() => { const z = u.aggregateOob([]); return z.templates.length === 0 && z.divisions.length === 0 && z.stockpile.length === 0; })());

  console.log(`\ntest-unit-data: ${pass} checks passed`);
})();
