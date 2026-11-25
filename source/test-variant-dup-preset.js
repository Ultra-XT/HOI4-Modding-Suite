// Designer variant/save must refuse a name a PRE-EXISTING (base-game / dependency) create_equipment_variant
// already uses for the country — writing Nova's copy pulls that whole country file in, so a matching name would
// leave two same-named blocks and the game could field the preset instead of the user's design. (The user's own
// Nova variant of the same name must still upsert.) Mirrors the create-simple guard. Run: node test-variant-dup-preset.js
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const { createApp } = require("./server.js");

let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log("  ok  " + n); } else { fail++; console.error("  FAIL " + n + (x !== undefined ? " -> " + JSON.stringify(x) : "")); } };

const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-duppreset-"));
const mk = (rel, body) => { const p = path.join(mod, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, body, "utf8"); };
mk("descriptor.mod", 'name="dup preset test"\n');
mk("common/units/equipment/custom_equipment.txt",
  'equipments = {\n' +
  '\tnova_mech_chassis = { is_archetype = yes is_buildable = no type = armor\n\t\tmodule_slots = { hull_slot = { required = yes allowed_module_categories = { nova_hull } } } }\n' +
  '\tnova_mech_chassis_1 = { archetype = nova_mech_chassis module_slots = inherit }\n' +
  '\tnova_plain_equipment = { type = armor }\n' +
  '}\n');
mk("common/units/equipment/modules/nova_modules.txt", 'equipment_modules = {\n\tnova_good_hull = { category = nova_hull }\n}\n');
// The country ALREADY ships a preset variant named "Preset Walker" (a non-Nova create_equipment_variant).
mk("history/countries/TST - Test.txt", ['capital = 1', "", 'create_equipment_variant = {', '\tname = "Preset Walker"', "\ttype = nova_mech_chassis_1", "}", "", "1939.1.1 = {", "}", ""].join("\n"));

const PORT = 3997, BASE = `http://127.0.0.1:${PORT}`;
const good = { modPath: mod, tag: "TST", name: "Nova Walker", chassisType: "nova_mech_chassis_1", modules: { hull_slot: "nova_good_hull" }, fallbackType: "nova_plain_equipment" };
const post = (b) => fetch(`${BASE}/api/equipment/variant/save`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) }).then((r) => r.json());

(async () => {
  const server = await new Promise((res) => { const s = createApp().listen(PORT, () => res(s)); });
  try {
    // Collision with the pre-existing preset → refuse.
    const clash = await post({ ...good, name: "Preset Walker" });
    ok("designing a variant that collides with a base/dep preset name is REFUSED", clash && clash.ok === false && /already ships a variant named/.test(clash.error || ""), clash);

    // A fresh name → ok.
    const fresh = await post({ ...good, name: "Nova Walker" });
    ok("a non-colliding name saves fine", fresh && fresh.ok === true, fresh && fresh.error);

    // Re-saving the user's OWN Nova variant of the same name → upsert, NOT refused.
    const again = await post({ ...good, name: "Nova Walker", obsolete: true });
    ok("re-saving the user's OWN Nova variant (same name) still upserts (not refused)", again && again.ok === true, again && again.error);

    // The preset block is untouched on disk.
    const txt = fs.readFileSync(path.join(mod, "history", "countries", "TST - Test.txt"), "utf8");
    ok("the pre-existing preset variant is still there", /name = "Preset Walker"/.test(txt), txt.slice(0, 120));
  } catch (e) {
    ok("threw: " + (e && e.stack ? e.stack : e), false);
  } finally {
    try { fs.rmSync(mod, { recursive: true, force: true }); } catch (_) {}
  }
  console.log(`\nVARIANT-DUP-PRESET: ${pass} passed, ${fail} failed`);
  process.exitCode = fail ? 1 : 0;
  try { server.closeAllConnections && server.closeAllConnections(); } catch (_) {}
  server.close();
})();
