// A division_template with zero regiments is unbuildable — HOI4's own in-game designer forbids a 0-battalion
// template and the engine logs a template error (MD/vanilla ship none). The naval/air savers already refuse empty
// content ("Add at least one ship/group"), but /api/army/save wrote an empty `regiments = { }` template happily.
// It now refuses one at the write choke point (mirrored by a client guard in saveArmy). Run: node test-empty-template-guard.js
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const { createApp } = require("./server.js");

let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log("  ok  " + n); } else { fail++; console.error("  FAIL " + n + (x !== undefined ? " -> " + JSON.stringify(x) : "")); } };

const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-emptytpl-"));
fs.mkdirSync(path.join(mod, "history", "countries"), { recursive: true });
fs.writeFileSync(path.join(mod, "descriptor.mod"), 'name="empty template guard test"\n');
fs.writeFileSync(path.join(mod, "history", "countries", "TST - Test.txt"), "capital = 1\n\n1936.1.1 = {\n}\n");
const unitsPath = path.join(mod, "history", "units", "TST_nova.txt");

const PORT = 3982, BASE = `http://127.0.0.1:${PORT}`;
(async () => {
  const server = await new Promise((res) => { const s = createApp().listen(PORT, () => res(s)); });
  const post = (body) => fetch(`${BASE}/api/army/save`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then(async (r) => ({ status: r.status, json: await r.json().catch(() => ({})) }));
  try {
    // A brand-new template with NO regiments → refused at the write choke point, and nothing is written.
    const empty = await post({ modPath: mod, tag: "TST", templates: [{ name: "New Template", regiments: [], support: [], _dirty: true }], divisions: [] });
    ok("empty-regiments template is REJECTED (HTTP 400)", empty.status === 400, empty);
    ok("the error names the offending template + explains why", empty.json && /New Template/.test(String(empty.json.error || "")) && /battalion|regiment/i.test(String(empty.json.error || "")), empty.json && empty.json.error);
    ok("NO units file was written for the rejected save", !fs.existsSync(unitsPath), unitsPath);

    // A template with support-only but no regiments is ALSO unbuildable (0 combat width) → still refused.
    const supportOnly = await post({ modPath: mod, tag: "TST", templates: [{ name: "Support Only", regiments: [], support: [{ unit: "engineer", x: 0, y: 0 }], _dirty: true }], divisions: [] });
    ok("support-only template (no combat battalion) is REJECTED", supportOnly.status === 400, supportOnly);

    // A template WITH a regiment saves fine (the guard doesn't over-reject).
    const good = await post({ modPath: mod, tag: "TST", templates: [{ name: "Line Infantry", regiments: [{ unit: "infantry", x: 0, y: 0 }], support: [], _dirty: true }], divisions: [] });
    ok("a template with >=1 regiment saves ok", good.status === 200 && good.json && good.json.error == null, good);
    ok("the units file is written with the valid template", fs.existsSync(unitsPath) && /division_template\s*=\s*\{[\s\S]*name\s*=\s*"Line Infantry"[\s\S]*infantry/.test(fs.readFileSync(unitsPath, "utf8")), fs.existsSync(unitsPath) && fs.readFileSync(unitsPath, "utf8"));

    // A divisions-only save (no templates at all) is NOT blocked by the guard.
    const divOnly = await post({ modPath: mod, tag: "TST", templates: [], divisions: [] });
    ok("a save with no templates at all is not blocked", divOnly.status === 200, divOnly);
  } catch (e) {
    ok("threw: " + (e && e.stack ? e.stack : e), false);
  } finally {
    try { fs.rmSync(mod, { recursive: true, force: true }); } catch (_) {}
  }
  console.log(`\nEMPTY-TEMPLATE-GUARD: ${pass} passed, ${fail} failed`);
  process.exitCode = fail ? 1 : 0;
  try { server.closeAllConnections && server.closeAllConnections(); } catch (_) {}
  server.close();
})();
