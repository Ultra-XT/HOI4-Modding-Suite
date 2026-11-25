// Equipment maker (Army tab › Equipment sub-tab): create a land family (archetype + tiers), list it
// with the enabling-tech cross-link, edit a mod-owned equipment's stats with preserve-merge (un-modeled
// fields survive), and the safety guards (base-game read-only, duplicate/bad ids). Run: node test-equipment-maker.js
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const { createApp } = require("./server.js");

let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log("  ok  " + n); } else { fail++; console.error("  FAIL " + n + (x !== undefined ? " -> " + JSON.stringify(x) : "")); } };
const balanced = (s) => (s.match(/{/g) || []).length === (s.match(/}/g) || []).length;

(async () => {
  const PORT = 3932, BASE = `http://127.0.0.1:${PORT}`;
  const app = createApp();
  const server = await new Promise((res) => { const s = app.listen(PORT, () => res(s)); });
  const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-equip-"));
  fs.writeFileSync(path.join(mod, "descriptor.mod"), 'name="Nova Equip Test"\n');
  const post = (route, body) => fetch(`${BASE}${route}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json());
  const list = () => fetch(`${BASE}/api/equipment/list?modPath=${encodeURIComponent(mod)}`).then((r) => r.json());
  // Nova writes its default equipment file with a zz_ prefix so it sorts AFTER every vanilla equipment
  // file — HOI4 merges the directory alphabetically, and the old custom_equipment.txt sorted BEFORE
  // infantry.txt, making `archetype = infantry_equipment` a forward reference the game dropped.
  // #equipment-load-order
  const eqPath = path.join(mod, "common", "units", "equipment", "zz_nova_equipment.txt");

  try {
    console.log("=== create a land family ===");
    const fam = await post("/api/equipment/family", {
      modPath: mod, id: "nova_rifle_equipment", name: "Nova Rifle", type: "infantry",
      soft_attack: 6, defense: 25, buildCostIc: 0.6,
      tiers: [{ year: 1936, name: "Nova Rifle I" }, { year: 1939, name: "Nova Rifle II" }],
    });
    ok("family created ok", fam && fam.ok === true, fam);
    ok("reports archetype + 2 tier ids", fam.id === "nova_rifle_equipment" && Array.isArray(fam.tiers) && fam.tiers.join(",") === "nova_rifle_equipment_0,nova_rifle_equipment_1", fam);
    const txt = fs.readFileSync(eqPath, "utf8");
    ok("equipment file is brace-balanced", balanced(txt), txt);
    ok("archetype has is_archetype + type + interface_category_land", /nova_rifle_equipment\s*=\s*{[\s\S]*is_archetype\s*=\s*yes[\s\S]*type\s*=\s*infantry[\s\S]*interface_category_land/.test(txt), txt);
    ok("archetype carries the edited soft_attack = 6 + defense = 25", /soft_attack\s*=\s*6/.test(txt) && /defense\s*=\s*25/.test(txt), txt);
    ok("tier _0 references the archetype", /nova_rifle_equipment_0\s*=\s*{[\s\S]*archetype\s*=\s*nova_rifle_equipment/.test(txt), txt);
    ok("tier _1 present with a later year", /nova_rifle_equipment_1\s*=\s*{[\s\S]*year\s*=\s*1939/.test(txt), txt);
    ok("name loc written to custom_equipment_l_english.yml", /nova_rifle_equipment:0\s*"Nova Rifle"/.test(fs.readFileSync(path.join(mod, "localisation", "english", "custom_equipment_l_english.yml"), "utf8")));

    console.log("\n=== list + enable_equipments cross-link ===");
    // A tech that unlocks the archetype → list must show it under enabledBy.
    fs.mkdirSync(path.join(mod, "common", "technologies"), { recursive: true });
    fs.writeFileSync(path.join(mod, "common", "technologies", "custom_technologies.txt"),
      "technologies = {\n\tnova_rifle_tech = {\n\t\tenable_equipments = { nova_rifle_equipment }\n\t\tfolder = { name = infantry_folder position = { x = 0 y = 0 } }\n\t}\n}\n");
    const l1 = await list();
    ok("list ok + finds the new family", l1 && l1.ok === true && l1.equipment.some((e) => e.id === "nova_rifle_equipment"), l1 && l1.count);
    const arch = l1.equipment.find((e) => e.id === "nova_rifle_equipment");
    ok("archetype flagged isArchetype + isMod", arch && arch.isArchetype === true && arch.isMod === true, arch);
    ok("archetype cross-linked to nova_rifle_tech (enable_equipments)", arch && arch.enabledBy.includes("nova_rifle_tech"), arch && arch.enabledBy);
    ok("both tiers listed as mod equipment", l1.equipment.filter((e) => /^nova_rifle_equipment_[01]$/.test(e.id) && e.isMod).length === 2, l1.equipment.filter((e) => e.id.startsWith("nova_rifle_equipment_")).map((e) => e.id));
    ok("landTypes list returned for the UI dropdown", Array.isArray(l1.landTypes) && l1.landTypes.includes("armor"), l1.landTypes);

    console.log("\n=== edit stats (preserve-merge) ===");
    // Hand-add an un-modeled field to the archetype, then edit via the API — it must survive.
    fs.writeFileSync(eqPath, fs.readFileSync(eqPath, "utf8").replace(/(nova_rifle_equipment\s*=\s*{\n)/, "$1\t\tmaximum_speed = 4\n\t\tlend_lease_cost = 1\n"));
    const sv = await post("/api/equipment/save", { modPath: mod, id: "nova_rifle_equipment", soft_attack: 9, name: "Nova Rifle X" });
    ok("save ok", sv && sv.ok === true, sv);
    const txt2 = fs.readFileSync(eqPath, "utf8");
    ok("edited soft_attack now 9", /soft_attack\s*=\s*9/.test(txt2), txt2);
    ok("hand-added maximum_speed survived the edit (preserve-merge)", /maximum_speed\s*=\s*4/.test(txt2), txt2);
    ok("hand-added lend_lease_cost survived", /lend_lease_cost\s*=\s*1/.test(txt2), txt2);
    ok("is_archetype/type still present after edit", /is_archetype\s*=\s*yes/.test(txt2) && /type\s*=\s*infantry/.test(txt2), txt2);
    ok("file still brace-balanced after edit", balanced(txt2), txt2);
    ok("renamed loc updated to 'Nova Rifle X'", /nova_rifle_equipment:0\s*"Nova Rifle X"/.test(fs.readFileSync(path.join(mod, "localisation", "english", "custom_equipment_l_english.yml"), "utf8")));

    console.log("\n=== modular chassis detection (chunk 8a) ===");
    // Against REAL vanilla equipment (the list includes base-game entries).
    const byId = {}; for (const e of l1.equipment) byId[e.id] = e;
    // (fetch a fresh list that includes base game — l1 was mod+base already)
    const lAll = await list();
    const idx = {}; for (const e of lAll.equipment) idx[e.id] = e;
    const lt = idx["light_tank_chassis"];
    ok("light_tank_chassis detected as a tank chassis (No Step Back)", lt && lt.isChassis === true && lt.designer === "tanks" && lt.dlc === "No Step Back", lt && { c: lt.isChassis, d: lt.designer, dlc: lt.dlc });
    ok("light_tank_chassis exposes its slots incl. a required turret_type_slot", lt && Array.isArray(lt.moduleSlots) && lt.moduleSlots.some((s) => s.name === "turret_type_slot" && s.required) && lt.moduleSlots.some((s) => (s.categories || []).includes("tank_light_turret_type")), lt && lt.moduleSlots);
    const lt1 = idx["light_tank_chassis_1"];
    ok("light_tank_chassis_1 (module_slots = inherit) resolves to a chassis too", lt1 && lt1.isChassis === true && lt1.designer === "tanks", lt1 && { c: lt1 && lt1.isChassis, d: lt1 && lt1.designer });
    const shl = idx["ship_hull_light"];
    ok("ship_hull_light detected as a ship chassis (Man the Guns)", shl && shl.isChassis === true && shl.designer === "ships" && shl.dlc === "Man the Guns", shl && { c: shl && shl.isChassis, dlc: shl && shl.dlc });
    const spa = idx["small_plane_airframe"];
    ok("small_plane_airframe detected as a plane chassis (By Blood Alone)", spa && spa.isChassis === true && spa.designer === "planes" && spa.dlc === "By Blood Alone", spa && { c: spa && spa.isChassis, dlc: spa && spa.dlc });
    const inf = idx["infantry_equipment"];
    ok("plain infantry_equipment is NOT a chassis", inf && inf.isChassis === false, inf && inf.isChassis);
    // False-positive guards: is_archetype + inherit chain ending in no slot block.
    const ssh = idx["support_ship_hull"];
    ok("support_ship_hull is NOT a chassis (inherit → no slot block)", !ssh || ssh.isChassis === false, ssh && ssh.isChassis);

    // Synthetic edge cases in the mod: own-slots chassis + inherit tier + `none` opt-out.
    fs.writeFileSync(eqPath, fs.readFileSync(eqPath, "utf8").replace(/equipments = {\n/,
      'equipments = {\n' +
      '\tnova_mech_chassis = { is_archetype = yes is_buildable = no type = armor\n\t\tmodule_slots = { hull_slot = { required = yes allowed_module_categories = { nova_hull } } gadget_slot = { required = no allowed_module_categories = { nova_gadget } } } }\n' +
      '\tnova_mech_chassis_1 = { archetype = nova_mech_chassis module_slots = inherit }\n' +
      '\tnova_optout_equipment = { archetype = nova_mech_chassis module_slots = none type = armor }\n'));
    const lMod = await list();
    const jdx = {}; for (const e of lMod.equipment) jdx[e.id] = e;
    ok("custom chassis with own module_slots is detected (2 slots, 1 required)", jdx["nova_mech_chassis"] && jdx["nova_mech_chassis"].isChassis === true && jdx["nova_mech_chassis"].moduleSlots.length === 2 && jdx["nova_mech_chassis"].moduleSlots.filter((s) => s.required).length === 1, jdx["nova_mech_chassis"] && jdx["nova_mech_chassis"].moduleSlots);
    ok("its inherit tier is a chassis too", jdx["nova_mech_chassis_1"] && jdx["nova_mech_chassis_1"].isChassis === true, jdx["nova_mech_chassis_1"] && jdx["nova_mech_chassis_1"].isChassis);
    ok("module_slots = none opts a variant OUT of the designer", jdx["nova_optout_equipment"] && jdx["nova_optout_equipment"].isChassis === false, jdx["nova_optout_equipment"] && jdx["nova_optout_equipment"].isChassis);

    console.log("\n=== /api/equipment/chassis + /modules (8a-2) ===");
    const chassisResp = await fetch(`${BASE}/api/equipment/chassis?modPath=${encodeURIComponent(mod)}`).then((r) => r.json());
    ok("/api/equipment/chassis ok + returns groups", chassisResp && chassisResp.ok === true && Array.isArray(chassisResp.chassis) && chassisResp.chassis.length > 0, chassisResp && chassisResp.count);
    const ltFam = (chassisResp.chassis || []).find((c) => c.archetypeId === "light_tank_chassis");
    ok("light_tank_chassis grouped as a tank family (No Step Back)", ltFam && ltFam.designer === "tanks" && ltFam.dlc === "No Step Back", ltFam && { d: ltFam.designer, dlc: ltFam.dlc });
    ok("family exposes slots + concrete buildable tiers", ltFam && Array.isArray(ltFam.slots) && ltFam.slots.some((s) => s.name === "turret_type_slot") && ltFam.concreteTypes.length > 0 && ltFam.concreteTypes.every((t) => /^light_tank_chassis_\d+$/.test(t.id)), ltFam && { slots: ltFam.slots && ltFam.slots.length, tiers: ltFam.concreteTypes });
    const shipFam = (chassisResp.chassis || []).find((c) => c.designer === "ships");
    const planeFam = (chassisResp.chassis || []).find((c) => c.designer === "planes");
    ok("ship + plane families present with the right DLC", shipFam && shipFam.dlc === "Man the Guns" && planeFam && planeFam.dlc === "By Blood Alone", { ship: shipFam && shipFam.dlc, plane: planeFam && planeFam.dlc });
    const tanksOnly = await fetch(`${BASE}/api/equipment/chassis?modPath=${encodeURIComponent(mod)}&designer=tanks`).then((r) => r.json());
    ok("designer=tanks filters to tank chassis only", tanksOnly.ok && tanksOnly.chassis.length > 0 && tanksOnly.chassis.every((c) => c.designer === "tanks"), tanksOnly.count);

    const modResp = await fetch(`${BASE}/api/equipment/modules?modPath=${encodeURIComponent(mod)}`).then((r) => r.json());
    ok("/api/equipment/modules ok + finds many modules", modResp && modResp.ok === true && Array.isArray(modResp.modules) && modResp.modules.length > 20, modResp && modResp.count);
    ok("modules grouped by category (tank_engine_type present)", modResp.byCategory && Array.isArray(modResp.byCategory.tank_engine_type) && modResp.byCategory.tank_engine_type.length > 0, modResp.byCategory && Object.keys(modResp.byCategory).length);
    const tankEngine = modResp.modules.find((m) => m.category === "tank_engine_type");
    ok("a tank module carries category + No Step Back dlc (from the equipment_modules limit)", tankEngine && tankEngine.dlc === "No Step Back", tankEngine);
    const shipModule = modResp.modules.find((m) => m.dlc === "Man the Guns");
    ok("a ship module is gated by Man the Guns", !!shipModule, shipModule && shipModule.id);
    ok("every module has a category (never mistakes a nested block for a module)", modResp.modules.every((m) => m.category && /^[A-Za-z0-9_]+$/.test(m.category)), modResp.modules.slice(0, 3));

    console.log("\n=== guards ===");
    const dup = await post("/api/equipment/family", { modPath: mod, id: "nova_rifle_equipment", type: "infantry" });
    ok("duplicate family id rejected", dup && dup.ok === false, dup);
    const digit = await post("/api/equipment/family", { modPath: mod, id: "9bad_equipment", type: "infantry" });
    ok("digit-leading family id rejected", digit && digit.ok === false, digit);
    const nomatch = await post("/api/equipment/save", { modPath: mod, id: "does_not_exist_equipment", soft_attack: 1 });
    ok("editing a non-existent equipment rejected", nomatch && nomatch.ok === false, nomatch);
    const vanilla = await post("/api/equipment/save", { modPath: mod, id: "infantry_equipment", soft_attack: 999 });
    ok("editing base-game equipment refused (create-a-family instead)", vanilla && vanilla.ok === false && /base-game/i.test(vanilla.error || ""), vanilla);
    // The refused vanilla edit must NOT have written an override block into the mod.
    ok("no base-game override block leaked into the mod file", !/(^|\n)\s*infantry_equipment\s*=/.test(fs.readFileSync(eqPath, "utf8")));
  } catch (e) {
    ok("threw: " + (e && e.stack ? e.stack : e), false);
  } finally {
    try { fs.rmSync(mod, { recursive: true, force: true }); } catch (_) {}
  }

  console.log(`\nEQUIPMENT-MAKER: ${pass} passed, ${fail} failed`);
  process.exitCode = fail ? 1 : 0;
  try { server.closeAllConnections && server.closeAllConnections(); } catch (_) {}
  server.close();
})();
