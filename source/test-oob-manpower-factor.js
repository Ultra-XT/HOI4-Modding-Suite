// start_manpower_factor (0–1 starting-manpower readiness) is a real division-instance field MD ships (0.5/0.8).
// Nova modelled it nowhere, so editing a placed division (which dirties it) regenerated the block through
// genDivision and DROPPED the field — the unit silently reverted to 100% manpower. Now parsed + emitted +
// round-tripped through the GET. Run: node test-oob-manpower-factor.js
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const { createApp } = require("./server.js");
const { mergeOob, parseUnitsFile } = require("./unit-data.js");

let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log("  ok  " + n); } else { fail++; console.error("  FAIL " + n + (x !== undefined ? " -> " + JSON.stringify(x) : "")); } };

// ── Part 1: mergeOob parse + dirty-emit ──
{
  const original = [
    "division_template = {", '\tname = "Inf"', "\tregiments = {", "\t\tinfantry = { x = 0 y = 0 }", "\t}", "}", "",
    "units = {", "\tdivision = {", '\t\tname = "1. Div"', "\t\tlocation = 100", '\t\tdivision_template = "Inf"',
    "\t\tstart_experience_factor = 0.3", "\t\tstart_equipment_factor = 0.5", "\t\tstart_manpower_factor = 0.5", "\t}", "}", "",
  ].join("\n");
  const m = parseUnitsFile(original);
  ok("parseUnits captures start_manpower_factor", m.units.divisions[0].manpowerFactor === 0.5, m.units.divisions[0]);
  // simulate a deploy edit: change equipment% and mark dirty (manpowerFactor left untouched on the object)
  const divs = m.units.divisions.map((d) => ({ ...d, _dirty: true, equipmentFactor: 0.9 }));
  const out = mergeOob(original, { templates: m.templates.map((t) => ({ ...t, _origName: t.name })), divisions: divs });
  ok("dirty (edited) division KEEPS start_manpower_factor = 0.5", /start_manpower_factor = 0\.5/.test(out), out);
  ok("the edit itself landed (start_equipment_factor = 0.9)", /start_equipment_factor = 0\.9/.test(out), out);
}

// ── Part 2: full GET → edit → save round-trip through the endpoints ──
(async () => {
  const PORT = 3982, BASE = `http://127.0.0.1:${PORT}`;
  const server = await new Promise((res) => { const s = createApp().listen(PORT, () => res(s)); });
  const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-manpower-"));
  fs.mkdirSync(path.join(mod, "history", "countries"), { recursive: true });
  fs.writeFileSync(path.join(mod, "descriptor.mod"), 'name="Manpower Test"\n');
  fs.writeFileSync(path.join(mod, "history", "countries", "TST - Test.txt"), "capital = 1\n\n1936.1.1 = {\n}\n");
  const post = (b) => fetch(`${BASE}/api/army/save`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) }).then((r) => r.json());
  const get = () => fetch(`${BASE}/api/army?modPath=${encodeURIComponent(mod)}&tag=TST`).then((r) => r.json());
  const unitsPath = path.join(mod, "history", "units", "TST_nova.txt");
  try {
    // Save a division carrying start_manpower_factor → genDivision must WRITE it.
    const s1 = await post({ modPath: mod, tag: "TST", templates: [{ name: "Inf", regiments: [{ unit: "infantry", x: 0, y: 0 }], support: [], _dirty: true }], divisions: [{ name: "1. Div", location: 100, template: "Inf", manpowerFactor: 0.5, experience: 0.3, _dirty: true }] });
    ok("save ok", s1 && s1.ok === true, s1 && s1.error);
    ok("genDivision WRITES start_manpower_factor = 0.5", /start_manpower_factor = 0\.5/.test(fs.readFileSync(unitsPath, "utf8")), fs.readFileSync(unitsPath, "utf8"));
    // GET must return it so the client can round-trip it.
    const g = await get();
    ok("GET returns manpowerFactor on the division", g.divisions && g.divisions[0] && g.divisions[0].manpowerFactor === 0.5, g.divisions);
    // Deploy-edit: change equipment%, keep the division's other fields, re-save → manpower factor must survive.
    const edited = g.divisions.map((d) => ({ ...d, _dirty: true, equipmentFactor: 0.9 }));
    const s2 = await post({ modPath: mod, tag: "TST", file: g.file, templates: g.templates.map((t) => ({ ...t, _origName: t.name })), divisions: edited });
    ok("re-save ok", s2 && s2.ok === true, s2 && s2.error);
    const after = fs.readFileSync(unitsPath, "utf8");
    ok("after editing the division: start_manpower_factor = 0.5 SURVIVES", /start_manpower_factor = 0\.5/.test(after), after);
    ok("the edit landed (start_equipment_factor = 0.9)", /start_equipment_factor = 0\.9/.test(after), after);
  } catch (e) {
    ok("threw: " + (e && e.stack ? e.stack : e), false);
  } finally {
    try { fs.rmSync(mod, { recursive: true, force: true }); } catch (_) {}
  }
  console.log(`\nOOB-MANPOWER-FACTOR: ${pass} passed, ${fail} failed`);
  process.exitCode = fail ? 1 : 0;
  try { server.closeAllConnections && server.closeAllConnections(); } catch (_) {}
  server.close();
})();
