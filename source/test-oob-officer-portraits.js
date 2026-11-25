// A division's officer block can carry a portraits sub-block (MD ships it on ~97 divisions:
// officer = { name = "Horst Förster" portraits = { army = { small large } } }). Nova modelled only the name,
// so editing a placed division (which dirties it) regenerated the block via genDivision and DELETED the
// portraits — the commander lost their custom portrait. Now the non-name officer statements round-trip.
// Run: node test-oob-officer-portraits.js
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const { createApp } = require("./server.js");
const { mergeOob, parseUnitsFile } = require("./unit-data.js");

let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log("  ok  " + n); } else { fail++; console.error("  FAIL " + n + (x !== undefined ? " -> " + JSON.stringify(x) : "")); } };
const balanced = (s) => (s.replace(/#.*$/gm, "").match(/{/g) || []).length === (s.replace(/#.*$/gm, "").match(/}/g) || []).length;

const OFFICER = [
  '\t\tofficer = {', '\t\t\tname = "Horst Förster"', "\t\t\tportraits = {", "\t\t\t\tarmy = {",
  '\t\t\t\t\tsmall = "GFX_Horst_small"', '\t\t\t\t\tlarge = "GFX_Horst_large"', "\t\t\t\t}", "\t\t\t}", "\t\t}",
];

// ── Part 1: mergeOob parse + dirty-emit ──
{
  const original = [
    "division_template = {", '\tname = "Pz"', "\tregiments = {", "\t\tarmor = { x = 0 y = 0 }", "\t}", "}", "",
    "units = {", "\tdivision = {", '\t\tname = "1. Pz"', "\t\tlocation = 50", '\t\tdivision_template = "Pz"', ...OFFICER, "\t}", "}", "",
  ].join("\n");
  const m = parseUnitsFile(original);
  ok("parseUnits captures the officer NAME", m.units.divisions[0].officer === "Horst Förster", m.units.divisions[0].officer);
  ok("parseUnits captures officerExtra (the portraits block)", /portraits/.test(m.units.divisions[0].officerExtra || ""), m.units.divisions[0].officerExtra);
  const divs = m.units.divisions.map((d) => ({ ...d, _dirty: true, equipmentFactor: 0.5 }));
  const out = mergeOob(original, { templates: m.templates.map((t) => ({ ...t, _origName: t.name })), divisions: divs });
  ok("dirty (edited) division KEEPS the portraits sub-block", /portraits\s*=\s*\{[\s\S]*small\s*=\s*"GFX_Horst_small"[\s\S]*large\s*=\s*"GFX_Horst_large"/.test(out), out.slice(out.indexOf("officer")));
  ok("officer name is still there", /name = "Horst Förster"/.test(out));
  ok("the edit itself landed (start_equipment_factor = 0.5)", /start_equipment_factor = 0\.5/.test(out));
  ok("output is brace-balanced", balanced(out), out);
}

// ── Part 2: full GET → edit → save round-trip ──
(async () => {
  const PORT = 3996, BASE = `http://127.0.0.1:${PORT}`;
  const server = await new Promise((res) => { const s = createApp().listen(PORT, () => res(s)); });
  const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-officer-"));
  fs.mkdirSync(path.join(mod, "history", "countries"), { recursive: true });
  fs.mkdirSync(path.join(mod, "history", "units"), { recursive: true });
  fs.writeFileSync(path.join(mod, "descriptor.mod"), 'name="officer test"\n');
  fs.writeFileSync(path.join(mod, "history", "countries", "TST - Test.txt"), "capital = 1\n\noob = \"TST_1936\"\n\n1936.1.1 = {\n}\n");
  fs.writeFileSync(path.join(mod, "history", "units", "TST_1936.txt"), [
    "division_template = {", '\tname = "Pz"', "\tregiments = {", "\t\tarmor = { x = 0 y = 0 }", "\t}", "}", "",
    "units = {", "\tdivision = {", '\t\tname = "1. Pz"', "\t\tlocation = 50", '\t\tdivision_template = "Pz"', ...OFFICER, "\t}", "}", "",
  ].join("\n"));
  const unitsPath = path.join(mod, "history", "units", "TST_1936.txt");
  const post = (b) => fetch(`${BASE}/api/army/save`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) }).then((r) => r.json());
  const get = () => fetch(`${BASE}/api/army?modPath=${encodeURIComponent(mod)}&tag=TST`).then((r) => r.json());
  try {
    const g = await get();
    const d0 = (g.divisions || [])[0];
    ok("GET returns the officer + officerExtra portraits", d0 && d0.officer === "Horst Förster" && /portraits/.test(d0.officerExtra || ""), d0);
    const edited = g.divisions.map((d) => ({ ...d, _dirty: true, equipmentFactor: 0.9 }));
    const s = await post({ modPath: mod, tag: "TST", file: g.file, templates: g.templates.map((t) => ({ ...t, _origName: t.name })), divisions: edited });
    ok("re-save ok", s && s.ok === true, s && s.error);
    const after = fs.readFileSync(unitsPath, "utf8");
    ok("after editing the division, the officer portraits SURVIVE", /portraits\s*=\s*\{[\s\S]*GFX_Horst_large/.test(after), after.slice(after.indexOf("officer")));
    ok("file is brace-balanced", balanced(after), after);
  } catch (e) {
    ok("threw: " + (e && e.stack ? e.stack : e), false);
  } finally {
    try { fs.rmSync(mod, { recursive: true, force: true }); } catch (_) {}
  }
  console.log(`\nOOB-OFFICER-PORTRAITS: ${pass} passed, ${fail} failed`);
  process.exitCode = fail ? 1 : 0;
  try { server.closeAllConnections && server.closeAllConnections(); } catch (_) {}
  server.close();
})();
