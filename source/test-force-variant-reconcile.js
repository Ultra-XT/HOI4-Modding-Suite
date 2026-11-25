// force_equipment_variants (and naval-OOB ship equipment) pin a DESIGNED variant GLOBALLY by creator + version_name,
// so a division in AFG's OOB can pin SOV's "T-55". When SOV renames/deletes that variant in the Arsenal, only its OWN
// stockpile was reconciled — every OTHER country's force_equipment_variants pin was left dangling (the division
// silently lost its pinned starting equipment). The reconcile now also rewrites those cross-country OOB pins: a rename
// re-points version_name; a delete strips version_name (leaving creator = TAG, a valid pin to that country's default).
// It must NOT touch a pin with a different creator, a pin that has no version_name, or anything if a has_dlc sibling of
// the name still resolves. Run: node test-force-variant-reconcile.js
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const { createApp } = require("./server.js");

let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log("  ok  " + n); } else { fail++; console.error("  FAIL " + n + (x !== undefined ? " -> " + JSON.stringify(x) : "")); } };

const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-fev-"));
fs.mkdirSync(path.join(mod, "history", "countries"), { recursive: true });
fs.mkdirSync(path.join(mod, "history", "units"), { recursive: true });
fs.writeFileSync(path.join(mod, "descriptor.mod"), 'name="force variant reconcile test"\n');
const sovPath = path.join(mod, "history", "countries", "SOV - Russia.txt");
const afgPath = path.join(mod, "history", "units", "AFG_1936.txt");

// SOV owns N raw create_equipment_variant blocks named "T-55". AFG's OOB pins SOV's "T-55" plus two CONTROL pins that
// must never be rewritten: a SOV pin with NO version_name (default design), and a GER-created "T-55" pin.
const sovVariant = '\tcreate_equipment_variant = {\n\t\tname = "T-55"\n\t\ttype = medium_tank_chassis_0\n\t}';
function reset(nSovBlocks) {
  fs.writeFileSync(sovPath, ["capital = 20", "", Array.from({ length: nSovBlocks }, () => sovVariant).join("\n"), "", "1936.1.1 = {", "}", ""].join("\n"));
  fs.writeFileSync(afgPath, [
    "units = {",
    "\tdivision = {",
    '\t\tname = "1st Armoured"', "\t\tlocation = 1", '\t\tdivision_template = "Tank Div"',
    '\t\tforce_equipment_variants = { medium_tank_chassis_0 = { amount = 14 owner = AFG creator = SOV version_name = "T-55" } }',
    "\t\tforce_equipment_variants = { infantry_weapons = { amount = 500 owner = AFG creator = SOV } }",
    '\t\tforce_equipment_variants = { medium_tank_chassis_0 = { amount = 5 owner = AFG creator = GER version_name = "T-55" } }',
    "\t}", "}", "",
  ].join("\n"));
}

(async () => {
  const PORT = 3983, BASE = `http://127.0.0.1:${PORT}`;
  const server = await new Promise((res) => { const s = createApp().listen(PORT, () => res(s)); });
  const post = (route, body) => fetch(`${BASE}${route}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json());
  const EXPECT = { name: "T-55", type: "medium_tank_chassis_0" };
  const afg = () => fs.readFileSync(afgPath, "utf8");
  try {
    // ── (A) RENAME re-points SOV's pin, leaves the SOV-default and GER pins alone ──
    reset(1);
    const up = await post("/api/equipment/variant/update", { modPath: mod, file: "SOV - Russia.txt", blockIdx: 0, expect: EXPECT, set: { name: "T-55A" } });
    ok("A: rename ok, reports 1 force-variant pin re-pointed", up && up.ok === true && up.forceVariantsRepointed === 1, up);
    ok("A: SOV's pin now tracks the NEW name", /creator = SOV version_name = "T-55A"/.test(afg()), afg());
    ok("A: the SOV pin with NO version_name is untouched", /creator = SOV \}/.test(afg()), afg());
    ok("A: the GER-created \"T-55\" pin is untouched (different creator)", /creator = GER version_name = "T-55"/.test(afg()), afg());

    // ── (B) DELETE strips only version_name from SOV's pin (creator stays → seeds SOV's default) ──
    reset(1);
    const rm = await post("/api/equipment/variant/remove-block", { modPath: mod, file: "SOV - Russia.txt", blockIdx: 0, expect: EXPECT });
    ok("B: delete ok, reports 1 force-variant pin unpinned", rm && rm.ok === true && rm.forceVariantsUnpinned === 1, rm);
    ok("B: SOV's pin lost version_name but kept creator = SOV", /medium_tank_chassis_0 = \{ amount = 14 owner = AFG creator = SOV \}/.test(afg()), afg());
    ok("B: the GER \"T-55\" pin still resolves (only one version_name=\"T-55\" left, the GER one)", (afg().match(/version_name = "T-55"/g) || []).length === 1 && /creator = GER version_name = "T-55"/.test(afg()), afg());

    // ── (C) has_dlc SIBLING guard: removing ONE of two SOV "T-55" blocks must NOT touch the cross-country pin ──
    reset(2);
    const rm2 = await post("/api/equipment/variant/remove-block", { modPath: mod, file: "SOV - Russia.txt", blockIdx: 0, expect: EXPECT });
    ok("C: delete ok, reports 0 force-variant pins touched (a sibling still resolves)", rm2 && rm2.ok === true && rm2.forceVariantsUnpinned === 0, rm2);
    ok("C: SOV's cross-country pin is LEFT INTACT", /creator = SOV version_name = "T-55"/.test(afg()), afg());
  } catch (e) {
    ok("threw: " + (e && e.stack ? e.stack : e), false);
  } finally {
    try { fs.rmSync(mod, { recursive: true, force: true }); } catch (_) {}
  }
  console.log(`\nFORCE-VARIANT-RECONCILE: ${pass} passed, ${fail} failed`);
  process.exitCode = fail ? 1 : 0;
  try { server.closeAllConnections && server.closeAllConnections(); } catch (_) {}
  server.close();
})();
