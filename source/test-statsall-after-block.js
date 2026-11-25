// statsAll (topLevelScalarStats) must capture a top-level scalar stat that immediately FOLLOWS a nested {…}
// block. The old regex used \s*=\s*, which spans newlines: after a nested block was stripped, its dangling
// `key =` swallowed the next stat's name as its value, dropping the first scalar after every block (vanilla
// light_tank_chassis lost fuel_consumption + lend_lease_cost). Run: node test-statsall-after-block.js
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const { createApp } = require("./server.js");

let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log("  ok  " + n); } else { fail++; console.error("  FAIL " + n + (x !== undefined ? " -> " + JSON.stringify(x) : "")); } };

const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-statsall-"));
fs.mkdirSync(path.join(mod, "common", "units", "equipment"), { recursive: true });
fs.writeFileSync(path.join(mod, "descriptor.mod"), 'name="statsAll block test"\n');
// A scalar right after EACH nested block (default_modules, resources) — plus one between two blocks.
fs.writeFileSync(path.join(mod, "common", "units", "equipment", "custom.txt"), [
  "equipments = {",
  "\tnova_probe_chassis = {",
  "\t\tyear = 1936",
  "\t\ttype = armor",
  "\t\tdefault_modules = {",
  "\t\t\tmain_armament_slot = tank_gun",
  "\t\t}",
  "\t\tfuel_consumption = 7",       // <-- first scalar after a block (was dropped)
  "\t\tmaximum_speed = 12",
  "\t\tresources = {",
  "\t\t\ttungsten = 2",
  "\t\t}",
  "\t\tlend_lease_cost = 10",       // <-- first scalar after the SECOND block (was dropped)
  "\t\treliability = 0.8",
  "\t}",
  "}",
].join("\n"));

(async () => {
  const PORT = 3983, BASE = `http://127.0.0.1:${PORT}`;
  const server = await new Promise((res) => { const s = createApp().listen(PORT, () => res(s)); });
  try {
    const l = await fetch(`${BASE}/api/equipment/list?modPath=${encodeURIComponent(mod)}`).then((r) => r.json());
    const e = (l.equipment || []).find((x) => x.id === "nova_probe_chassis");
    ok("equipment scanned", !!e, l && l.error);
    const s = (e && e.statsAll) || {};
    ok("fuel_consumption (first scalar after default_modules block) captured = 7", s.fuel_consumption === 7, s);
    ok("lend_lease_cost (first scalar after resources block) captured = 10", s.lend_lease_cost === 10, s);
    ok("maximum_speed still captured = 12", s.maximum_speed === 12, s);
    ok("reliability still captured = 0.8", s.reliability === 0.8, s);
    ok("nested-block numbers do NOT leak (no tungsten / no tank_gun key)", !("tungsten" in s) && !("main_armament_slot" in s), s);
    ok("the block KEYS themselves are not stats (no default_modules / resources)", !("default_modules" in s) && !("resources" in s), s);
  } catch (e) {
    ok("threw: " + (e && e.stack ? e.stack : e), false);
  } finally {
    try { fs.rmSync(mod, { recursive: true, force: true }); } catch (_) {}
  }
  console.log(`\nSTATSALL-AFTER-BLOCK: ${pass} passed, ${fail} failed`);
  process.exitCode = fail ? 1 : 0;
  try { server.closeAllConnections && server.closeAllConnections(); } catch (_) {}
  server.close();
})();
