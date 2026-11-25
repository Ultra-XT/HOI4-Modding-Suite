// readTerrainTypes(root) collects HOI4 terrain category names from every common/terrain/*.txt — it's
// what the Map editor's province-terrain dropdown lists. It was untested; its parser
// parseTerrainCategories (extract top-level `name = {` from the `categories` block, ignoring nested
// keys + comments) had only one incidental assertion. This locks both: the parser's edge cases and the
// FS layer that merges across files.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const { parseTerrainCategories, readTerrainTypes } = require("./map-data.js");

let pass = 0, fail = 0;
const check = (n, c, e) => { if (c) { pass++; console.log("  PASS", n); } else { fail++; console.log("  FAIL", n, e != null ? "→ " + JSON.stringify(e) : ""); } };
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// A realistic categories block: nested color/units/movement blocks must NOT be picked up as terrains.
const terr = `
# Terrain categories for the map
categories = {
	plains = {
		color = { 0 200 0 }
		sound_type = plains
		units = { }
	}
	forest = {
		color = { 0 100 0 }
		movement_cost = 1.5
	}
	ocean = {
		is_water = yes
		color = { 0 0 200 }
	}
	lakes = { is_water = yes }
}
`;
check("collects exactly the 4 top-level terrains", eq(parseTerrainCategories(terr), ["plains", "forest", "ocean", "lakes"]), parseTerrainCategories(terr));
check("does NOT collect nested keys (color/units/sound_type)", !parseTerrainCategories(terr).some((n) => ["color", "units", "sound_type", "movement_cost", "is_water"].includes(n)), parseTerrainCategories(terr));

// No categories block → empty.
check("no categories block → []", eq(parseTerrainCategories("something_else = { x = 1 }"), []), parseTerrainCategories("something_else = { x = 1 }"));
check("empty string → []", eq(parseTerrainCategories(""), []));

// Comments must be stripped before parsing — a commented-out `fake = {` is not a terrain.
const commented = `categories = {\n\t# fake = {\n\treal = { color = { 1 2 3 } }\n}`;
check("commented-out category is ignored", eq(parseTerrainCategories(commented), ["real"]), parseTerrainCategories(commented));

// --- readTerrainTypes: merges names across every common/terrain/*.txt ---
const root = fs.mkdtempSync(path.join(os.tmpdir(), "nova-terrain-"));
const tdir = path.join(root, "common", "terrain");
fs.mkdirSync(tdir, { recursive: true });
fs.writeFileSync(path.join(tdir, "00_terrain.txt"), "categories = {\n\tplains = { color = { 0 1 0 } }\n\tforest = { }\n}", "utf8");
fs.writeFileSync(path.join(tdir, "01_extra.txt"), "categories = {\n\tdesert = { color = { 1 1 0 } }\n}", "utf8");
fs.writeFileSync(path.join(tdir, "notes.md"), "ignored — not a .txt", "utf8");
const names = readTerrainTypes(root);
check("readTerrainTypes merges names from both .txt files", names.includes("plains") && names.includes("forest") && names.includes("desert"), names);
check("readTerrainTypes ignores non-.txt files", !names.some((n) => /ignored|notes/.test(n)), names);
check("readTerrainTypes count is 3 (plains/forest/desert)", names.length === 3, names);

// Missing common/terrain dir → [] (no throw).
const empty = fs.mkdtempSync(path.join(os.tmpdir(), "nova-terrain-empty-"));
let threw = false, res = [];
try { res = readTerrainTypes(empty); } catch (_) { threw = true; }
check("missing terrain dir → no throw", !threw);
check("missing terrain dir → []", eq(res, []), res);

try { fs.rmSync(root, { recursive: true, force: true }); fs.rmSync(empty, { recursive: true, force: true }); } catch (_) {}
console.log(`\nTERRAIN-TYPES TEST: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
