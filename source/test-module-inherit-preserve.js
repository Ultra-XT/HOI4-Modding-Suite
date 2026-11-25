// Overriding an INHERITED (vanilla/dependency) equipment module by re-declaring its id is legitimate HOI4 modding —
// but HOI4 REPLACES the whole block by id, so a stripped Nova override silently dropped the inherited module's
// un-modeled fields (xp_cost / dependencies / critical_parts / can_convert_from / parent / build_cost_resources / …,
// pervasive in vanilla: xp_cost 154×, parent 111×). writeEquipmentModuleToFile only seeded from a SAME-file block;
// an inherited-only id hit the else branch and wrote the stripped block. It now seeds from the inherited definition
// (copy-then-upsert) — the same contract as the equipment / research-dependency writers. The identical fix is
// mirrored for the upgrade writer. Run: node test-module-inherit-preserve.js
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

// A temp mods-root (read at module load) so the add-on's dependency resolves.
const MODS = fs.mkdtempSync(path.join(os.tmpdir(), "nova-modinherit-modsroot-"));
process.env.HOI4_MODS_ROOT = MODS;
const { createApp } = require("./server.js");

let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log("  ok  " + n); } else { fail++; console.error("  FAIL " + n + (x !== undefined ? " -> " + JSON.stringify(x) : "")); } };

// Dependency mod (a subdir of MODS_ROOT, matched by descriptor name) with a MODULE and an UPGRADE that both carry
// un-modeled fields Nova does not model.
const dep = path.join(MODS, "depmodmod");
fs.mkdirSync(path.join(dep, "common", "units", "equipment", "modules"), { recursive: true });
fs.mkdirSync(path.join(dep, "common", "units", "equipment", "upgrades"), { recursive: true });
fs.writeFileSync(path.join(dep, "descriptor.mod"), 'name="DepModMod"\n');
fs.writeFileSync(path.join(dep, "common", "units", "equipment", "modules", "dep_mods.txt"), [
  "equipment_modules = {",
  "\tdep_super_engine = {",
  "\t\tcategory = tank_engine_type",
  "\t\txp_cost = 5",
  "\t\tbuild_cost_resources = { steel = 2 }",
  "\t\tdependencies = { engine_tech_1 }",
  "\t\tcritical_parts = { engine_damaged }",
  "\t\tcan_convert_from = { tank_engine_petrol }",
  "\t\tparent = tank_engine_base",
  "\t\tadd_stats = { maximum_speed = 0.5 }",
  "\t}",
  "}",
].join("\n"));
fs.writeFileSync(path.join(dep, "common", "units", "equipment", "upgrades", "dep_ups.txt"), [
  "upgrades = {",
  "\tdep_armor_up = {",
  "\t\tmax_level = 5",
  "\t\tcost = land",
  "\t\tlinear_cost = { armor_value = { cost_by_level = 1 } }",
  "\t\tarmor_value = 0.1",
  "\t}",
  "}",
].join("\n"));

// Add-on that DEPENDS on the dep.
const addon = fs.mkdtempSync(path.join(os.tmpdir(), "nova-modinherit-addon-"));
fs.writeFileSync(path.join(addon, "descriptor.mod"), 'name="Addon"\ndependencies={ "DepModMod" }\n');

const PORT = 3981, BASE = `http://127.0.0.1:${PORT}`;
(async () => {
  const server = await new Promise((res) => { const s = createApp().listen(PORT, () => res(s)); });
  const post = (route, body) => fetch(`${BASE}${route}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json());
  const modFile = () => { const p = path.join(addon, "common", "units", "equipment", "modules", "nova_custom_modules.txt"); return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : ""; };
  const upFile = () => { const p = path.join(addon, "common", "units", "equipment", "upgrades", "nova_custom_upgrades.txt"); return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : ""; };
  try {
    // ── MODULE: override the inherited dep module → its un-modeled fields SURVIVE, the overridden stat wins ──
    const m = await post("/api/equipment/module", { modPath: addon, id: "dep_super_engine", category: "tank_engine_type", add_stats: { maximum_speed: 0.8 } });
    ok("module override save ok", m && m.ok === true, m);
    const mt = modFile();
    ok("M: xp_cost preserved", /xp_cost\s*=\s*5/.test(mt), mt);
    ok("M: build_cost_resources preserved", /build_cost_resources\s*=\s*\{\s*steel\s*=\s*2\s*\}/.test(mt), mt);
    ok("M: dependencies preserved", /dependencies\s*=\s*\{\s*engine_tech_1\s*\}/.test(mt), mt);
    ok("M: critical_parts preserved", /critical_parts\s*=\s*\{\s*engine_damaged\s*\}/.test(mt), mt);
    ok("M: can_convert_from preserved", /can_convert_from\s*=\s*\{\s*tank_engine_petrol\s*\}/.test(mt), mt);
    ok("M: parent preserved", /parent\s*=\s*tank_engine_base/.test(mt), mt);
    ok("M: the OVERRIDDEN stat wins (maximum_speed = 0.8)", /maximum_speed\s*=\s*0\.8/.test(mt) && !/maximum_speed\s*=\s*0\.5/.test(mt), mt);
    ok("M: file is brace-balanced", (mt.match(/\{/g) || []).length === (mt.match(/\}/g) || []).length, mt);

    // ── CONTROL: a BRAND-NEW module id (not inherited) is written clean, with NO bogus seeded fields ──
    const bn = await post("/api/equipment/module", { modPath: addon, id: "nova_brand_new_gun", category: "tank_gun_type", add_stats: { soft_attack: 3 } });
    ok("brand-new module save ok", bn && bn.ok === true, bn);
    const bnBlock = modFile().slice(modFile().indexOf("nova_brand_new_gun"));
    ok("CONTROL: brand-new module has no seeded xp_cost/parent/dependencies", !/xp_cost|parent\s*=|dependencies/.test(bnBlock.slice(0, bnBlock.indexOf("}"))), bnBlock.slice(0, 200));

    // ── UPGRADE: override the inherited dep upgrade → its un-modeled NESTED block SURVIVES ──
    const u = await post("/api/equipment/upgrade", { modPath: addon, id: "dep_armor_up", cost: "land", max_level: 5, stats: { armor_value: 0.2 } });
    ok("upgrade override save ok", u && u.ok === true, u);
    const ut = upFile();
    ok("U: linear_cost nested block preserved", /linear_cost\s*=\s*\{[\s\S]*cost_by_level\s*=\s*1/.test(ut), ut);
    ok("U: the overridden stat wins (armor_value = 0.2)", /armor_value\s*=\s*0\.2/.test(ut), ut);
    ok("U: file is brace-balanced", (ut.match(/\{/g) || []).length === (ut.match(/\}/g) || []).length, ut);
  } catch (e) {
    ok("threw: " + (e && e.stack ? e.stack : e), false);
  } finally {
    try { fs.rmSync(addon, { recursive: true, force: true }); } catch (_) {}
    try { fs.rmSync(MODS, { recursive: true, force: true }); } catch (_) {}
  }
  console.log(`\nMODULE-INHERIT-PRESERVE: ${pass} passed, ${fail} failed`);
  process.exitCode = fail ? 1 : 0;
  try { server.closeAllConnections && server.closeAllConnections(); } catch (_) {}
  server.close();
})();
