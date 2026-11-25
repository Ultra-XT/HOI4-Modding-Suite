// Data-loss regression: editing an INHERITED (dependency) equipment must not wipe the other weapons in that
// dependency file. writeEquipmentToFile seeded `existing` only from the active mod, so saving an edit to a
// dependency weapon wrote a same-basename shadow file containing ONLY that weapon — and HOI4's same-filename
// replacement then dropped every other weapon the dependency defined in that file. The writer now seeds from
// the dependency's full file first. Run: node test-dep-equipment-preserve.js
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

// Inject a temp mods-root BEFORE requiring server.js (MODS_ROOT is read at module load).
const MODS = fs.mkdtempSync(path.join(os.tmpdir(), "nova-modsroot-"));
process.env.HOI4_MODS_ROOT = MODS;
const { createApp } = require("./server.js");

let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log("  ok  " + n); } else { fail++; console.error("  FAIL " + n + (x !== undefined ? " -> " + JSON.stringify(x) : "")); } };

// Dependency mod: two weapons in ONE file.
const dep = path.join(MODS, "depmod");
fs.mkdirSync(path.join(dep, "common", "units", "equipment"), { recursive: true });
fs.writeFileSync(path.join(dep, "descriptor.mod"), 'name="DepEquipMod"\n');
fs.writeFileSync(path.join(dep, "common", "units", "equipment", "dep_weapons.txt"),
  "equipments = {\n\tdep_at_1 = { year = 1936 is_archetype = yes type = anti_tank soft_attack = 5 }\n\tdep_at_2 = { year = 1939 is_archetype = yes type = anti_tank soft_attack = 8 }\n}\n");
// The .mod registry entry so the add-on's dependency name resolves to the dep dir.
fs.writeFileSync(path.join(MODS, "depmod.mod"), `name="DepEquipMod"\npath="${dep.replace(/\\/g, "/")}"\n`);
// Add-on mod that DEPENDS on the dep, and has NO equipment file of its own yet.
const addon = fs.mkdtempSync(path.join(os.tmpdir(), "nova-addon-"));
fs.writeFileSync(path.join(addon, "descriptor.mod"), 'name="Addon"\ndependencies={ "DepEquipMod" }\n');

const PORT = 3994, BASE = `http://127.0.0.1:${PORT}`;
(async () => {
  const server = await new Promise((res) => { const s = createApp().listen(PORT, () => res(s)); });
  try {
    // Sanity: the dep weapon surfaces as editable (isMod) for the add-on.
    const list = await fetch(`${BASE}/api/equipment/list?modPath=${encodeURIComponent(addon)}`).then((r) => r.json());
    const dep1 = (list.equipment || []).find((e) => e.id === "dep_at_1");
    ok("dependency weapon surfaces for the add-on", !!dep1, (list.equipment || []).map((e) => e.id).filter((i) => /dep_at/.test(i)));
    ok("dependency weapon is flagged editable (isMod)", dep1 && dep1.isMod === true, dep1);

    // Edit the inherited weapon and save.
    const save = await fetch(`${BASE}/api/equipment/save`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ modPath: addon, id: "dep_at_1", name: "Edited AT", soft_attack: 99 }),
    }).then((r) => r.json());
    ok("save ok", save && save.ok === true, save && save.error);

    // The add-on's shadow file MUST contain BOTH weapons — the edited one AND the untouched sibling.
    const addonFile = path.join(addon, "common", "units", "equipment", "dep_weapons.txt");
    const txt = fs.existsSync(addonFile) ? fs.readFileSync(addonFile, "utf8") : "";
    ok("add-on file written", !!txt, addonFile);
    ok("the edited weapon is there with its new value (dep_at_1 soft_attack = 99)", /dep_at_1\s*=\s*\{[\s\S]*soft_attack = 99/.test(txt), txt);
    ok("the SIBLING weapon dep_at_2 is PRESERVED (not wiped)", /dep_at_2\s*=\s*\{/.test(txt), txt);
    ok("file is brace-balanced", (txt.replace(/#.*$/gm, "").match(/{/g) || []).length === (txt.replace(/#.*$/gm, "").match(/}/g) || []).length, txt);
  } catch (e) {
    ok("threw: " + (e && e.stack ? e.stack : e), false);
  } finally {
    try { fs.rmSync(MODS, { recursive: true, force: true }); fs.rmSync(addon, { recursive: true, force: true }); } catch (_) {}
  }
  console.log(`\nDEP-EQUIPMENT-PRESERVE: ${pass} passed, ${fail} failed`);
  process.exitCode = fail ? 1 : 0;
  try { server.closeAllConnections && server.closeAllConnections(); } catch (_) {}
  server.close();
})();
