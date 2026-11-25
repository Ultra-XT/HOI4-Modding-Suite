// Deep Army feature — full-flow integration test. Drives the WHOLE Army tab on a fresh temp mod through
// the real endpoints, then reads every written file back and asserts it's brace-balanced + correct:
//   division template → deploy by State ID (commander + equipment%) → equipment family → modular variant.
// Run: node test-army-fullflow.js
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const { createApp } = require("./server.js");

let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log("  ok  " + n); } else { fail++; console.error("  FAIL " + n + (x !== undefined ? " -> " + JSON.stringify(x) : "")); } };
const balanced = (s) => (s.replace(/#.*$/gm, "").match(/{/g) || []).length === (s.replace(/#.*$/gm, "").match(/}/g) || []).length;

(async () => {
  const PORT = 3934, BASE = `http://127.0.0.1:${PORT}`;
  const app = createApp();
  const server = await new Promise((r) => { const s = app.listen(PORT, () => r(s)); });
  const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-fullflow-"));
  const mk = (rel, body) => { const p = path.join(mod, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, body, "utf8"); };
  // replace_path="history/states": 50-Nova.txt is this mod's whole state list. Without it the installed game's 50-Baden.txt loads
  // beside it and, sorting first, is the state 50 HOI4 keeps and the one the deploy lookup resolves (#the-state-the-game-keeps).
  mk("descriptor.mod", 'name="Nova Full Flow"\nreplace_path="history/states"\n');
  mk("history/countries/TST - Test.txt", "capital = 50\n");
  mk("history/states/50-Nova.txt", 'state = {\n\tid = 50\n\tname = "STATE_50"\n\tprovinces = { 1000 1001 }\n\thistory = { owner = TST\n\t\tvictory_points = { 1001 25 } }\n}\n');

  const get = (route) => fetch(`${BASE}${route}`).then((r) => r.json());
  const post = (route, body) => fetch(`${BASE}${route}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json());
  const M = encodeURIComponent(mod);
  const read = (rel) => fs.readFileSync(path.join(mod, rel), "utf8");

  try {
    console.log("=== 1. division template + deploy (State ID → commander + equipment%) ===");
    const sp = await get(`/api/state-province?modPath=${M}&state=50`);
    ok("state 50 resolves to its VP province (1001)", sp.ok && sp.province === 1001, sp);
    const save = await post("/api/army/save", {
      modPath: mod, tag: "TST",
      templates: [{ name: "Line Infantry", regiments: [{ unit: "infantry", x: 0, y: 0 }, { unit: "infantry", x: 0, y: 1 }], support: [{ unit: "engineer", x: 0, y: 0 }], priority: 1, _dirty: true }],
      divisions: [{ name: "1. Line", location: sp.province, template: "Line Infantry", officer: "Tst Commander", equipmentFactor: 0.4, _dirty: true }],
    });
    ok("army save ok + oob wired", save.ok && save.oobWired, save);
    const oobFile = "history/units/" + save.file;
    const oobText = read(oobFile);
    ok("OOB is brace-balanced", balanced(oobText), oobText);
    ok("OOB has the template + a division with officer + start_equipment_factor",
      /division_template\s*=\s*{[\s\S]*Line Infantry/.test(oobText) && /officer\s*=\s*{\s*name\s*=\s*"Tst Commander"\s*}/.test(oobText) && /start_equipment_factor\s*=\s*0\.4/.test(oobText) && /location\s*=\s*1001/.test(oobText), oobText);
    ok("country history got oob = \"...\" wired in", /oob\s*=\s*"/.test(read("history/countries/TST - Test.txt")));

    console.log("\n=== 2. equipment family (archetype + tiers) ===");
    const fam = await post("/api/equipment/family", { modPath: mod, id: "nova_rifle_equipment", name: "Nova Rifle", type: "infantry", tierCount: 2, soft_attack: 7 });
    ok("family created (archetype + 2 tiers)", fam.ok && fam.tiers.length === 2, fam);
    // zz_ prefix: HOI4 merges common/units/equipment alphabetically with vanilla, so Nova's default has
    // to sort after infantry.txt or an archetype reference into vanilla is a forward reference the game
    // rejects with "Malformed token". #equipment-load-order
    const eqText = read("common/units/equipment/zz_nova_equipment.txt");
    ok("equipment file is brace-balanced + has archetype + tiers", balanced(eqText) && /nova_rifle_equipment\s*=\s*{[\s\S]*is_archetype\s*=\s*yes/.test(eqText) && /nova_rifle_equipment_0\s*=\s*{[\s\S]*archetype\s*=\s*nova_rifle_equipment/.test(eqText), eqText);

    console.log("\n=== 3. modular variant (design a tank, DLC-gated PAIR) ===");
    const chassisResp = await get(`/api/equipment/chassis?modPath=${M}&designer=tanks`);
    ok("tank chassis available", chassisResp.ok && chassisResp.chassis.length > 0, chassisResp && chassisResp.count);
    const famC = chassisResp.chassis.find((c) => c.archetypeId === "light_tank_chassis") || chassisResp.chassis[0];
    const tier = famC.concreteTypes[0];
    ok("chassis has a concrete buildable tier + slots + DLC", !!tier && famC.slots.length > 0 && !!famC.dlc, { tier: tier && tier.id, slots: famC.slots.length, dlc: famC.dlc });
    const modResp = await get(`/api/equipment/modules?modPath=${M}`);
    // Fill every REQUIRED slot with a real module of an accepted category + the chassis's DLC.
    const modules = {};
    let filledAllRequired = true;
    for (const s of famC.slots) {
      if (!s.required) continue;
      let picked = null;
      for (const cat of (s.categories || [])) {
        const m = (modResp.byCategory[cat] || []).find((mm) => !mm.dlc || mm.dlc === famC.dlc);
        if (m) { picked = m.id; break; }
      }
      if (picked) modules[s.name] = picked; else filledAllRequired = false;
    }
    ok("found a real module for every required slot", filledAllRequired, { slots: famC.slots.filter((s) => s.required).map((s) => s.name), modules });
    const eqList = await get(`/api/equipment/list?modPath=${M}`);
    const fallback = (eqList.equipment || []).find((e) => !e.isChassis && !e.isArchetype && e.designer === "tanks");
    ok("a non-modular tank fallback exists (domain resolved for non-chassis too)", !!fallback, fallback && fallback.id);
    const variant = await post("/api/equipment/variant/save", {
      modPath: mod, tag: "TST", name: "Nova Panzer", chassisType: tier.id, modules, fallbackType: fallback ? fallback.id : "",
    });
    ok("variant saved (gate derived server-side)", variant.ok && variant.dlc === famC.dlc, variant);
    const histText = read("history/countries/TST - Test.txt");
    ok("country history still brace-balanced after the variant write", balanced(histText), histText);
    ok("variant wrote the MODULAR branch (has_dlc + modules) AND the non-modular fallback",
      new RegExp(`has_dlc\\s*=\\s*"${famC.dlc}"[\\s\\S]*create_equipment_variant[\\s\\S]*type\\s*=\\s*${tier.id}[\\s\\S]*modules\\s*=\\s*{`).test(histText) &&
      new RegExp(`NOT\\s*=\\s*{\\s*has_dlc\\s*=\\s*"${famC.dlc}"\\s*}[\\s\\S]*type\\s*=\\s*${fallback.id}`).test(histText), histText.slice(histText.indexOf("NOVA equipment")));
    ok("the oob wiring from step 1 survived the variant write (both effects coexist)", /oob\s*=\s*"/.test(histText));

    console.log("\n=== 4. everything reads back ===");
    const variants = await get(`/api/equipment/variant/list?modPath=${M}&tag=TST`);
    ok("variant list reads it back", variants.ok && variants.variants.length === 1 && variants.variants[0].name === "Nova Panzer", variants && variants.variants);
    const armyBack = await get(`/api/army?modPath=${M}&tag=TST`);
    ok("army reads back the template + division + officer", armyBack.ok && armyBack.templates.length === 1 && armyBack.divisions.length === 1 && armyBack.divisions[0].officer === "Tst Commander", armyBack && armyBack.divisions);
    // Final: every mod file we wrote is brace-balanced.
    const allFiles = [oobFile, "common/units/equipment/zz_nova_equipment.txt", "history/countries/TST - Test.txt"];
    ok("ALL written mod files are brace-balanced", allFiles.every((f) => balanced(read(f))), allFiles);
  } catch (e) {
    ok("threw: " + (e && e.stack ? e.stack : e), false);
  } finally {
    try { fs.rmSync(mod, { recursive: true, force: true }); } catch (_) {}
  }

  console.log(`\nARMY-FULLFLOW: ${pass} passed, ${fail} failed`);
  process.exitCode = fail ? 1 : 0;
  try { server.closeAllConnections && server.closeAllConnections(); } catch (_) {}
  server.close();
})();
