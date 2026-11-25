// New modular CHASSIS writer (gap #11): create a modular equipment archetype + a buildable tier, then
// prove Nova's own scanner reads it back as a chassis with the right slots/categories (round-trip into the
// designer). Run: node test-chassis-new.js
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const { createApp } = require("./server.js");

let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log("  ok  " + n); } else { fail++; console.error("  FAIL " + n + (x !== undefined ? " -> " + JSON.stringify(x) : "")); } };
const balanced = (s) => (s.replace(/#.*$/gm, "").replace(/"[^"]*"/g, '""').match(/{/g) || []).length === (s.replace(/#.*$/gm, "").replace(/"[^"]*"/g, '""').match(/}/g) || []).length;

(async () => {
  const PORT = 3951, BASE = `http://127.0.0.1:${PORT}`;
  const app = createApp();
  const server = await new Promise((res) => { const s = app.listen(PORT, () => res(s)); });
  const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-chassis-"));
  const mk = (rel, body) => { const p = path.join(mod, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, body, "utf8"); };
  mk("descriptor.mod", 'name="Nova Chassis Test"\n');
  const post = (route, body) => fetch(`${BASE}${route}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json());
  const chassisFile = path.join(mod, "common", "units", "equipment", "nova_custom_chassis.txt");

  try {
    console.log("=== create a modular tank chassis ===");
    const r1 = await post("/api/equipment/chassis-new", {
      modPath: mod, id: "nova_tank_chassis", name: "Nova Tank Chassis", domain: "armor", type: "armor", priority: 100, year: 1936,
      slots: [
        { name: "turret_type_slot", required: true, categories: ["tank_light_turret_type"] },
        { name: "main_armament_slot", required: true, categories: ["tank_small_main_armament", "tank_flamethrower"] },
        { name: "engine_slot", required: false, categories: ["tank_engine_type"] },
      ],
      baseStats: { build_cost_ic: 2.5, reliability: 0.9, maximum_speed: 4 },
    });
    ok("chassis save ok", r1 && r1.ok === true && r1.id === "nova_tank_chassis" && r1.tier === "nova_tank_chassis_1" && r1.slots === 3, r1);
    let txt = fs.readFileSync(chassisFile, "utf8");
    ok("equipments wrapper + archetype block", /equipments\s*=\s*\{[\s\S]*nova_tank_chassis = \{/.test(txt), txt);
    ok("archetype: is_archetype/is_buildable/type/interface_category", /is_archetype = yes/.test(txt) && /is_buildable = no/.test(txt) && /type = armor/.test(txt) && /interface_category = interface_category_armor/.test(txt), txt);
    ok("module_slots with required + allowed_module_categories", /module_slots = \{[\s\S]*turret_type_slot = \{ required = yes allowed_module_categories = \{ tank_light_turret_type \} \}[\s\S]*main_armament_slot = \{ required = yes allowed_module_categories = \{ tank_small_main_armament tank_flamethrower \} \}/.test(txt), txt);
    ok("optional slot required = no", /engine_slot = \{ required = no /.test(txt), txt);
    ok("buildable tier references archetype + inherits slots + base stats", /nova_tank_chassis_1 = \{[\s\S]*archetype = nova_tank_chassis[\s\S]*module_slots = inherit[\s\S]*build_cost_ic = 2\.5[\s\S]*maximum_speed = 4/.test(txt), txt);
    ok("brace-balanced", balanced(txt), txt);

    console.log("\n=== ROUND-TRIP: Nova's scanner reads it back as a chassis ===");
    const g = await fetch(`${BASE}/api/equipment/chassis?modPath=${encodeURIComponent(mod)}`).then((r) => r.json());
    const c = g.ok && (g.chassis || []).find((x) => x.archetypeId === "nova_tank_chassis");
    ok("chassis appears via /api/equipment/chassis", !!c, g && g.count);
    ok("scanner read the 3 slots with names + required + categories", c && Array.isArray(c.slots) && c.slots.length === 3
      && c.slots.find((s) => s.name === "turret_type_slot" && s.required === true && s.categories.includes("tank_light_turret_type"))
      && c.slots.find((s) => s.name === "main_armament_slot" && s.categories.includes("tank_flamethrower"))
      && c.slots.find((s) => s.name === "engine_slot" && s.required === false), c && c.slots);
    ok("the buildable tier is a concreteType", c && (c.concreteTypes || []).some((t) => t.id === "nova_tank_chassis_1"), c && c.concreteTypes);
    ok("recognised as a MOD chassis", c && c.isMod === true, c && c.isMod);

    console.log("\n=== loc name written ===");
    const loc = fs.readFileSync(path.join(mod, "localisation", "english", "custom_equipment_l_english.yml"), "utf8");
    ok("chassis name in loc", /nova_tank_chassis:0 "Nova Tank Chassis"/.test(loc), loc);

    console.log("\n=== edit in place (re-save) stays single + balanced ===");
    const r2 = await post("/api/equipment/chassis-new", { modPath: mod, id: "nova_tank_chassis", name: "Nova Tank Chassis", domain: "armor", type: "armor", slots: [{ name: "turret_type_slot", required: true, categories: ["tank_light_turret_type"] }], baseStats: { build_cost_ic: 3 } });
    txt = fs.readFileSync(chassisFile, "utf8");
    ok("re-save keeps one archetype + one tier + balanced", r2.ok === true && (txt.match(/nova_tank_chassis = \{/g) || []).length === 1 && (txt.match(/nova_tank_chassis_1 = \{/g) || []).length === 1 && balanced(txt), txt);

    console.log("\n=== ship + plane domains default interface_category ===");
    // NOTE: a ship HULL's equipment type is screen_ship / capital_ship / carrier / submarine. `destroyer` is an OOB
    // `ship = { definition = … }` value, NOT an equipment type — it maps to no designer and is now rejected below.
    const rs = await post("/api/equipment/chassis-new", { modPath: mod, id: "nova_ship_hull", domain: "ship", type: "screen_ship", slots: [{ name: "fixed_ship_hull_slot", required: true, categories: ["ship_hull_light"] }] });
    const rp = await post("/api/equipment/chassis-new", { modPath: mod, id: "nova_airframe", domain: "plane", type: "fighter", slots: [{ name: "fixed_main_weapon_slot", required: true, categories: ["plane_guns_slot"] }] });
    txt = fs.readFileSync(chassisFile, "utf8");
    ok("ship → interface_category_capital_ships, plane → interface_category_air", rs.ok === true && rp.ok === true && /interface_category = interface_category_capital_ships/.test(txt) && /interface_category = interface_category_air/.test(txt) && balanced(txt), txt);

    console.log("\n=== priority 0 is legal and preserved (falsy-zero regression) ===");
    const rz = await post("/api/equipment/chassis-new", { modPath: mod, id: "nova_zero_prio", type: "armor", priority: 0, slots: [{ name: "s", required: true, categories: ["tank_light_turret_type"] }] });
    txt = fs.readFileSync(chassisFile, "utf8");
    ok("priority = 0 written (not coerced to 100)", rz.ok === true && /nova_zero_prio = \{[\s\S]*priority = 0\b/.test(txt) && !/nova_zero_prio = \{[\s\S]*priority = 100/.test(txt), txt);

    console.log("\n=== nested-slot-name collision (round-3): upsert must target the TOP-LEVEL entry, never a nested slot ===");
    // nova_base owns a NESTED module slot literally named "special_mount". Creating a NEW chassis whose id is
    // "special_mount" must APPEND a fresh top-level archetype — a body-wide regex would instead match nova_base's
    // nested slot and corrupt it. findTopLevelEntry (depth-0 only) is what prevents this.
    const rc1 = await post("/api/equipment/chassis-new", { modPath: mod, id: "nova_base", type: "armor", slots: [{ name: "special_mount", required: true, categories: ["tank_light_turret_type"] }], baseStats: { build_cost_ic: 2 } });
    const rc2 = await post("/api/equipment/chassis-new", { modPath: mod, id: "special_mount", type: "armor", slots: [{ name: "s", required: true, categories: ["tank_flamethrower"] }], baseStats: { build_cost_ic: 3 } });
    txt = fs.readFileSync(chassisFile, "utf8");
    ok("both saves ok", rc1.ok === true && rc2.ok === true, [rc1, rc2]);
    // nested slot is 3-tab-indented inside module_slots; a top-level entry is 1-tab-indented.
    ok("nova_base's NESTED slot 'special_mount' still intact (not corrupted by the collision)", /\n\t\t\tspecial_mount = \{ required = yes allowed_module_categories = \{ tank_light_turret_type \} \}/.test(txt), txt);
    ok("exactly ONE top-level 'special_mount' archetype appended (no duplicate, no nested clobber)", (txt.match(/\n\tspecial_mount = \{/g) || []).length === 1 && (txt.match(/\n\tspecial_mount_1 = \{/g) || []).length === 1 && /\n\tspecial_mount = \{[\s\S]*?is_archetype = yes/.test(txt), txt);
    ok("collision file brace-balanced", balanced(txt), txt);
    const gc = await fetch(`${BASE}/api/equipment/chassis?modPath=${encodeURIComponent(mod)}`).then((r) => r.json());
    const cBase = gc.ok && (gc.chassis || []).find((x) => x.archetypeId === "nova_base");
    const cMount = gc.ok && (gc.chassis || []).find((x) => x.archetypeId === "special_mount");
    ok("scanner reads BOTH as distinct chassis after the collision", !!cBase && !!cMount && cBase !== cMount, gc && gc.count);
    ok("nova_base still exposes its 'special_mount' slot; new chassis exposes its own 's' slot", cBase && cBase.slots.some((s) => s.name === "special_mount") && cMount && cMount.slots.some((s) => s.name === "s"), [cBase && cBase.slots, cMount && cMount.slots]);

    console.log("\n=== SAME-FILENAME replacement (round-10): re-shipping a vanilla equipment filename deletes its ids ===");
    // HOI4: a mod file with a vanilla BASENAME replaces the vanilla file OUTRIGHT (no replace_path needed), so ids
    // that file uniquely defined must NOT survive in the catalog. This matters beyond display: POST
    // /api/equipment/variant/save validates against this SAME catalog, so a phantom used to pass and get written
    // into the user's mod as a create_equipment_variant referencing equipment the game never loads. #equip-same-filename
    const gPre = await fetch(`${BASE}/api/equipment/chassis?modPath=${encodeURIComponent(mod)}`).then((r) => r.json());
    const hadSub = (gPre.chassis || []).some((c) => c.archetypeId === "ship_hull_submarine");
    ok("precondition: vanilla's ship_hull_submarine.txt supplied ship_hull_submarine", hadSub, (gPre.chassis || []).length);
    mk("common/units/equipment/ship_hull_submarine.txt", "equipments = {\n\tnova_sub_hull = {\n\t\tyear = 1936\n\t\tis_archetype = yes\n\t\tis_buildable = no\n\t\ttype = submarine\n\t\tgroup_by = archetype\n\t\tmodule_slots = {\n\t\t\tfixed_ship_hull_slot = { required = yes allowed_module_categories = { ship_hull_submarine } }\n\t\t}\n\t}\n}\n");
    const gPost = await fetch(`${BASE}/api/equipment/chassis?modPath=${encodeURIComponent(mod)}`).then((r) => r.json());
    ok("mod's own chassis in the shadowing file IS scanned", (gPost.chassis || []).some((c) => c.archetypeId === "nova_sub_hull"), (gPost.chassis || []).map((c) => c.archetypeId).slice(0, 8));
    ok("vanilla ids from the REPLACED ship_hull_submarine.txt are GONE (no phantom tier)", !(gPost.chassis || []).some((c) => c.archetypeId === "ship_hull_submarine"), (gPost.chassis || []).map((c) => c.archetypeId));
    ok("vanilla ids from NON-shadowed files still load (ship_hull_light untouched)", (gPost.chassis || []).some((c) => c.archetypeId === "ship_hull_light"), (gPost.chassis || []).map((c) => c.archetypeId).slice(0, 12));

    console.log("\n=== guards ===");
    const bad1 = await post("/api/equipment/chassis-new", { modPath: mod, id: "9bad", type: "armor", slots: [{ name: "s", categories: ["c"] }] });
    ok("leading-digit id rejected", bad1.ok === false, bad1);
    const bad2 = await post("/api/equipment/chassis-new", { modPath: mod, id: "nova_x", type: "armor", slots: [] });
    ok("no slots rejected", bad2.ok === false, bad2);
    const bad3 = await post("/api/equipment/chassis-new", { modPath: mod, id: "nova_y", type: "armor", slots: [{ name: "s", categories: [] }] });
    ok("slot with no category rejected", bad3.ok === false, bad3);
    const bad4 = await post("/api/equipment/chassis-new", { modPath: mod, id: "nova_z", type: "bad type!", slots: [{ name: "s", categories: ["c"] }] });
    ok("non-token type rejected", bad4.ok === false, bad4);
    // round-10: a type that maps to NO designer writes a chassis that is invisible in the UI and invalid in-game
    // (the variant writer later refuses it too) — reject it at the file-creating choke point. #chassis-type-valid
    const badT1 = await post("/api/equipment/chassis-new", { modPath: mod, id: "nova_dd", domain: "ship", type: "destroyer", slots: [{ name: "s", required: true, categories: ["ship_hull_light"] }] });
    ok("dead ship type 'destroyer' (an OOB definition, not an equipment type) rejected + names the real ones", badT1.ok === false && /screen_ship/.test(badT1.error || ""), badT1);
    const badT2 = await post("/api/equipment/chassis-new", { modPath: mod, id: "nova_sp", domain: "plane", type: "small_plane", slots: [{ name: "s", required: true, categories: ["plane_guns_slot"] }] });
    ok("dead plane type 'small_plane' (an airframe name prefix) rejected", badT2.ok === false, badT2);
    const badT3 = await post("/api/equipment/chassis-new", { modPath: mod, id: "nova_mm", domain: "ship", type: "armor", slots: [{ name: "s", required: true, categories: ["ship_hull_light"] }] });
    ok("domain/type MISMATCH (ship domain + armor type) rejected", badT3.ok === false && /tanks type/.test(badT3.error || ""), badT3);
    ok("no dead chassis reached disk (nova_dd / nova_sp / nova_mm absent)", !/nova_dd|nova_sp|nova_mm/.test(fs.readFileSync(chassisFile, "utf8")));
    const gameRoot = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
    const bad5 = await post("/api/equipment/chassis-new", { modPath: gameRoot, id: "nova_x", type: "armor", slots: [{ name: "s", categories: ["c"] }] });
    ok("game-root write rejected", bad5.ok === false, bad5);

    // --- The from-scratch WEAPON CREATOR: a user's own frame with their OWN slot names and their OWN
    // module categories, both of which are free-form in HOI4 (MD invents ~180 categories and slots like
    // helicopter_wing_mount_1). Modelled on the real ask: an orbital laser platform. #new-weapon
    const sat = await post("/api/equipment/chassis-new", {
      modPath: mod, id: "nova_satellite_chassis", name: "Orbital Platform", domain: "plane",
      type: "strategic_bomber", picture: "GFX_archetype_strategic_bomber_equipment", year: 1975,
      slots: [
        { name: "laser_beam_slot", required: true, categories: ["satellite_laser_type"] },
        { name: "solar_panel_slot", required: true, categories: ["satellite_power_type"] },
      ],
      baseStats: { build_cost_ic: 180 },
    });
    ok("invented weapon accepted (own slots + own module categories)", sat && sat.ok === true && sat.slots === 2, sat);
    const satTxt = fs.readFileSync(chassisFile, "utf8");
    const satBlock = (() => { const o = satTxt.indexOf("{", satTxt.indexOf("nova_satellite_chassis =")); let d2 = 0; for (let i = o; i < satTxt.length; i++) { if (satTxt[i] === "{") d2++; else if (satTxt[i] === "}") { d2--; if (!d2) return satTxt.slice(o, i); } } return ""; })();
    ok("...its invented slot names are written verbatim", /laser_beam_slot\s*=\s*\{/.test(satBlock) && /solar_panel_slot\s*=\s*\{/.test(satBlock), satBlock);
    ok("...its invented module categories are written verbatim", /satellite_laser_type/.test(satBlock) && /satellite_power_type/.test(satBlock), satBlock);
    // picture was ALWAYS accepted server-side but the client never sent it, so every Nova chassis shipped
    // art-less. The creator asks for it — prove it survives the write.
    ok("...picture is written (was silently dropped before the creator)", /picture\s*=\s*GFX_archetype_strategic_bomber_equipment/.test(satBlock), satBlock);
    // Every vanilla airframe carries BOTH of these; a Nova plane chassis used to carry neither.
    ok("...a plane chassis gets allowed_types like every vanilla airframe", /allowed_types\s*=\s*\{[^}]*strategic_bomber/.test(satBlock), satBlock);
    ok("...and the SCALAR allow_mission_type = training (roles come from modules, not the airframe)", /allow_mission_type\s*=\s*training/.test(satBlock), satBlock);
    ok("...a TANK chassis gets neither (they're airframe-only keys)", !/allowed_types/.test((() => { const o = satTxt.indexOf("{", satTxt.indexOf("nova_tank_chassis =")); let d2 = 0; for (let i = o; i < satTxt.length; i++) { if (satTxt[i] === "{") d2++; else if (satTxt[i] === "}") { d2--; if (!d2) return satTxt.slice(o, i); } } return ""; })()));
    // A weapon that wants PARTS must be one of the three designer domains — modules are a DLC-designer
    // feature and nothing else in HOI4 has module_slots (zero missiles do, in vanilla/MD/R56).
    const mis = await post("/api/equipment/chassis-new", { modPath: mod, id: "nova_orbital_missile", name: "X", domain: "plane", type: "ballistic_missile", slots: [{ name: "warhead_slot", required: true, categories: ["nova_warhead"] }] });
    ok("a missile type is refused as a modular chassis (nothing but tanks/ships/planes has parts)", mis && mis.ok === false, mis);

    // --- MULTI-ROLE. One weapon, several jobs — real, and expressed DIFFERENTLY per domain:
    //   land: `type = { armor anti_air }`   (MD's SPAA, MD_x_tank_chassis.txt:13)
    //   air:  single `type` + `allowed_types = { … }`  (vanilla fighter airframe allows FIVE)
    const spaa = await post("/api/equipment/chassis-new", { modPath: mod, id: "nova_spaa_chassis", name: "SPAA", domain: "armor", type: "armor", extraTypes: ["anti_air", "anti_air"], slots: [{ name: "turret_type_slot", required: true, categories: ["nova_turret"] }] });
    ok("land multi-role accepted + de-duped", spaa && spaa.ok === true && JSON.stringify(spaa.types) === JSON.stringify(["armor", "anti_air"]), spaa);
    const spaaTxt = fs.readFileSync(chassisFile, "utf8");
    ok("...written as MD writes it: type = { armor anti_air }", /type\s*=\s*\{\s*armor anti_air\s*\}/.test(spaaTxt), spaaTxt.slice(spaaTxt.indexOf("nova_spaa_chassis"), spaaTxt.indexOf("nova_spaa_chassis") + 200));
    const mr = await post("/api/equipment/chassis-new", { modPath: mod, id: "nova_mr_airframe", name: "MR", domain: "plane", type: "fighter", allowedTypes: ["interceptor", "cas", "naval_bomber", "suicide"], slots: [{ name: "fixed_main_weapon_slot", required: true, categories: ["nova_gun"] }] });
    ok("air multi-role accepted (primary + 4 more)", mr && mr.ok === true && mr.allowedTypes.length === 5 && mr.allowedTypes[0] === "fighter", mr);
    const mrTxt = fs.readFileSync(chassisFile, "utf8");
    const mrBlock = mrTxt.slice(mrTxt.indexOf("nova_mr_airframe ="), mrTxt.indexOf("nova_mr_airframe_1"));
    ok("...air keeps a SINGLE primary type, not a multi-value one", /type\s*=\s*fighter\s*$/m.test(mrBlock) && !/type\s*=\s*\{/.test(mrBlock), mrBlock);
    ok("...and lists the rest in allowed_types, like the vanilla fighter airframe", /allowed_types\s*=\s*\{[\s\S]*interceptor[\s\S]*cas[\s\S]*naval_bomber[\s\S]*suicide[\s\S]*\}/.test(mrBlock), mrBlock);
    // The extras must NOT be run through deriveEquipmentDesigner — anti_air maps to no designer at all, so
    // validating them like a primary would refuse MD's own SPAA. But junk must still be refused.
    const badJob = await post("/api/equipment/chassis-new", { modPath: mod, id: "nova_badjob", name: "b", domain: "armor", type: "armor", extraTypes: ["satellite"], slots: [{ name: "s_slot", required: true, categories: ["c_cat"] }] });
    ok("an invented extra job is refused", badJob && badJob.ok === false && /extra job/i.test(badJob.error || ""), badJob);
    const badRole = await post("/api/equipment/chassis-new", { modPath: mod, id: "nova_badrole", name: "b", domain: "plane", type: "fighter", allowedTypes: ["armor"], slots: [{ name: "s_slot", required: true, categories: ["c_cat"] }] });
    ok("a non-air role is refused on an aircraft", badRole && badRole.ok === false, badRole);

    ok("final file brace-balanced", balanced(fs.readFileSync(chassisFile, "utf8")));
  } catch (e) {
    ok("threw: " + (e && e.stack ? e.stack : e), false);
  } finally {
    try { fs.rmSync(mod, { recursive: true, force: true }); } catch (_) {}
  }

  console.log(`\nCHASSIS-NEW: ${pass} passed, ${fail} failed`);
  process.exitCode = fail ? 1 : 0;
  try { server.closeAllConnections && server.closeAllConnections(); } catch (_) {}
  server.close();
})();
