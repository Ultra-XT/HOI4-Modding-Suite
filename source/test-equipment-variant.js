// Modular variant writer (Army > Equipment > Design): create_equipment_variant written as a has_dlc PAIR
// (modular + non-modular fallback) into history/countries/<TAG>.txt, with the 5 DLC-safety guardrails an
// adversarial review demanded (G1-G5). Run: node test-equipment-variant.js
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const { createApp } = require("./server.js");

let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log("  ok  " + n); } else { fail++; console.error("  FAIL " + n + (x !== undefined ? " -> " + JSON.stringify(x) : "")); } };
const balanced = (s) => (s.replace(/#.*$/gm, "").match(/{/g) || []).length === (s.replace(/#.*$/gm, "").match(/}/g) || []).length;

(async () => {
  const PORT = 3933, BASE = `http://127.0.0.1:${PORT}`;
  const app = createApp();
  const server = await new Promise((res) => { const s = app.listen(PORT, () => res(s)); });
  const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-variant-"));
  const mk = (rel, body) => { const p = path.join(mod, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, body, "utf8"); };
  mk("descriptor.mod", 'name="Nova Variant Test"\n');
  mk("common/units/equipment/custom_equipment.txt",
    'equipments = {\n' +
    '\tnova_mech_chassis = { is_archetype = yes is_buildable = no type = armor\n\t\tmodule_slots = { hull_slot = { required = yes allowed_module_categories = { nova_hull } } gadget_slot = { required = no allowed_module_categories = { nova_gadget } } } }\n' +
    '\tnova_mech_chassis_1 = { archetype = nova_mech_chassis module_slots = inherit }\n' +
    '\tnova_land_cruiser_chassis = { is_archetype = yes is_buildable = no type = armor module_slots = { hull_slot = { required = yes allowed_module_categories = { nova_hull } } } }\n' +
    '\tnova_land_cruiser_chassis_1 = { archetype = nova_land_cruiser_chassis module_slots = inherit }\n' +
    // Two slots that accept the SAME category, with NO count limit → the same module may go in both (like MD's
    // corvette repeating module_asm_1). #dup-module
    '\tnova_twin_chassis = { is_archetype = yes is_buildable = no type = armor\n\t\tmodule_slots = { front_slot = { required = no allowed_module_categories = { nova_hull } } rear_slot = { required = no allowed_module_categories = { nova_hull } } } }\n' +
    '\tnova_twin_chassis_1 = { archetype = nova_twin_chassis module_slots = inherit }\n' +
    // Same two slots but a CATEGORY cap of 1 (count < 2) → placing the module twice must still be refused.
    '\tnova_capped_chassis = { is_archetype = yes is_buildable = no type = armor\n\t\tmodule_slots = { front_slot = { required = no allowed_module_categories = { nova_hull } } rear_slot = { required = no allowed_module_categories = { nova_hull } } }\n\t\tmodule_count_limit = { category = nova_hull count < 2 } }\n' +
    '\tnova_capped_chassis_1 = { archetype = nova_capped_chassis module_slots = inherit }\n' +
    '\tnova_plain_equipment = { type = armor }\n' +
    '}\n');
  mk("common/units/equipment/modules/nova_modules.txt",
    'equipment_modules = {\n\tnova_good_hull = { category = nova_hull }\n\tnova_gadget_mod = { category = nova_gadget }\n}\n' +
    'equipment_modules = {\n\tlimit = { has_dlc = "Man the Guns" }\n\tnova_bad_hull = { category = nova_hull }\n}\n');
  // A country history WITH a dated block, so we can prove the writer never touches the tail.
  mk("history/countries/TST - Test.txt", "capital = 1\n\n1939.1.1 = {\n\tset_politics = { ruling_party = neutrality }\n}\n");

  const histPath = path.join(mod, "history", "countries", "TST - Test.txt");
  const post = (route, body) => fetch(`${BASE}${route}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json());
  const listVariants = () => fetch(`${BASE}/api/equipment/variant/list?modPath=${encodeURIComponent(mod)}&tag=TST`).then((r) => r.json());
  const good = { modPath: mod, tag: "TST", name: "Nova Walker", chassisType: "nova_mech_chassis_1", modules: { hull_slot: "nova_good_hull" }, fallbackType: "nova_plain_equipment" };

  try {
    console.log("=== valid save writes the has_dlc PAIR ===");
    const sv = await post("/api/equipment/variant/save", good);
    ok("valid variant saved (gate derived server-side = No Step Back)", sv && sv.ok === true && sv.dlc === "No Step Back" && sv.count === 1, sv);
    const txt = fs.readFileSync(histPath, "utf8");
    ok("history file is brace-balanced", balanced(txt), txt);
    ok("wrote the MODULAR branch gated by has_dlc + the module", /if\s*=\s*{\s*limit\s*=\s*{\s*has_dlc\s*=\s*"No Step Back"\s*}[\s\S]*create_equipment_variant[\s\S]*type\s*=\s*nova_mech_chassis_1[\s\S]*hull_slot\s*=\s*nova_good_hull/.test(txt), txt.slice(txt.indexOf("NOVA equipment")));
    ok("wrote the NON-MODULAR fallback branch (NOT has_dlc, no modules block)", /limit\s*=\s*{\s*NOT\s*=\s*{\s*has_dlc\s*=\s*"No Step Back"\s*}\s*}[\s\S]*type\s*=\s*nova_plain_equipment/.test(txt), txt);
    ok("the hand-authored dated tail (1939.1.1) survived untouched", /1939\.1\.1\s*=\s*{[\s\S]*ruling_party\s*=\s*neutrality/.test(txt), txt);
    ok("capital = 1 head content survived", /(^|\n)\s*capital\s*=\s*1/.test(txt), txt);

    console.log("\n=== duplicate module across slots (#dup-module) ===");
    // No per-module or category cap on nova_hull for nova_twin_chassis → the SAME module in two slots is legal
    // (HOI4 module_count_limit is opt-in; MD ships such designs). This used to be wrongly refused.
    const dup = await post("/api/equipment/variant/save", { modPath: mod, tag: "TST", name: "Twin Hull", chassisType: "nova_twin_chassis_1", modules: { front_slot: "nova_good_hull", rear_slot: "nova_good_hull" }, fallbackType: "nova_plain_equipment" });
    ok("same module in two uncapped slots SAVES (no blanket no-duplicates refusal)", dup && dup.ok === true, dup && dup.error);
    ok("both slots wrote the module", (fs.readFileSync(histPath, "utf8").match(/=\s*nova_good_hull/g) || []).length >= 2, fs.readFileSync(histPath, "utf8").slice(fs.readFileSync(histPath, "utf8").indexOf("Twin Hull")));
    // But a real declared cap (category count < 2) is STILL enforced.
    const capped = await post("/api/equipment/variant/save", { modPath: mod, tag: "TST", name: "Capped", chassisType: "nova_capped_chassis_1", modules: { front_slot: "nova_good_hull", rear_slot: "nova_good_hull" }, fallbackType: "nova_plain_equipment" });
    ok("a category count-limit of 1 STILL refuses the duplicate (real caps enforced)", capped && capped.ok === false && /at most 1/.test(capped.error || ""), capped);
    await post("/api/equipment/variant/delete", { modPath: mod, tag: "TST", name: "Twin Hull" });

    console.log("\n=== round-trip: list + re-save (upsert) + delete ===");
    const l1 = await listVariants();
    ok("list returns the saved variant", l1 && l1.ok === true && l1.variants.length === 1 && l1.variants[0].name === "Nova Walker" && l1.variants[0].chassisType === "nova_mech_chassis_1", l1 && l1.variants);
    const sv2 = await post("/api/equipment/variant/save", { ...good, name: "Nova Walker", modules: { hull_slot: "nova_good_hull", gadget_slot: "nova_gadget_mod" } });
    ok("re-saving same name upserts (still 1 variant)", sv2 && sv2.ok === true && sv2.count === 1, sv2);
    ok("gadget module now present after upsert", /gadget_slot\s*=\s*nova_gadget_mod/.test(fs.readFileSync(histPath, "utf8")));
    const del = await post("/api/equipment/variant/delete", { modPath: mod, tag: "TST", name: "Nova Walker" });
    ok("delete removes the variant", del && del.ok === true && del.remaining.length === 0, del);
    const afterDel = fs.readFileSync(histPath, "utf8");
    ok("after delete: no Nova region, but the dated tail is still there", !/NOVA equipment variants/.test(afterDel) && /1939\.1\.1/.test(afterDel), afterDel);

    console.log("\n=== the 5 guardrails (adversarial: safe:FALSE without these) ===");
    // G3: a spoofed client designer/dlc must be IGNORED — the gate comes from the chassis.
    await post("/api/equipment/variant/save", good); // re-add
    const spoof = await post("/api/equipment/variant/save", { ...good, name: "Spoofed", designer: "ships", dlc: "Man the Guns" });
    ok("G3: client-supplied designer/dlc ignored — still gated by the chassis DLC", spoof.ok === true && spoof.dlc === "No Step Back", spoof);
    ok("G3: file shows No Step Back for the spoofed variant, never Man the Guns", /"Spoofed"[\s\S]*has_dlc\s*=\s*"No Step Back"/.test(fs.readFileSync(histPath, "utf8")) && !/"Spoofed"[\s\S]{0,200}has_dlc\s*=\s*"Man the Guns"/.test(fs.readFileSync(histPath, "utf8")));
    // G5: a module gated by a DIFFERENT DLC than the chassis is refused.
    const g5 = await post("/api/equipment/variant/save", { ...good, name: "BadDLC", modules: { hull_slot: "nova_bad_hull" } });
    ok("G5: module from a different DLC rejected (would crash chassis-DLC-only players)", g5.ok === false && /DLC/i.test(g5.error || ""), g5);
    // G1: fallback must be NON-modular.
    const g1 = await post("/api/equipment/variant/save", { ...good, name: "ModularFallback", fallbackType: "nova_mech_chassis_1" });
    ok("G1: modular fallback type rejected", g1.ok === false && /non-modular|modular/i.test(g1.error || ""), g1);
    const g1b = await post("/api/equipment/variant/save", { ...good, name: "UnknownFallback", fallbackType: "does_not_exist_equipment" });
    ok("G1: unknown fallback type rejected", g1b.ok === false, g1b);
    // G2: fallback required.
    const g2 = await post("/api/equipment/variant/save", { ...good, name: "NoFallback", fallbackType: "" });
    ok("G2: missing fallback rejected", g2.ok === false && /fallback/i.test(g2.error || ""), g2);
    // G4: land-cruiser double-gate refused.
    const g4 = await post("/api/equipment/variant/save", { ...good, name: "LandCruiser", chassisType: "nova_land_cruiser_chassis_1", modules: { hull_slot: "nova_good_hull" } });
    ok("G4: land-cruiser chassis rejected (needs two DLCs)", g4.ok === false && /land.?cruiser|two DLC/i.test(g4.error || ""), g4);

    console.log("\n=== structural validation ===");
    const reqEmpty = await post("/api/equipment/variant/save", { ...good, name: "MissingReq", modules: {} });
    ok("required slot left empty is rejected", reqEmpty.ok === false && /required/i.test(reqEmpty.error || ""), reqEmpty);
    const wrongCat = await post("/api/equipment/variant/save", { ...good, name: "WrongCat", modules: { hull_slot: "nova_gadget_mod" } });
    ok("module in the wrong category rejected", wrongCat.ok === false && /can't go in slot|category/i.test(wrongCat.error || ""), wrongCat);
    const archetypeType = await post("/api/equipment/variant/save", { ...good, name: "Archetype", chassisType: "nova_mech_chassis" });
    ok("designing on the archetype (not a concrete tier) rejected", archetypeType.ok === false && /concrete|buildable/i.test(archetypeType.error || ""), archetypeType);
    const unknownSlot = await post("/api/equipment/variant/save", { ...good, name: "UnknownSlot", modules: { hull_slot: "nova_good_hull", bogus_slot: "nova_good_hull" } });
    ok("unknown slot name rejected", unknownSlot.ok === false && /unknown slot/i.test(unknownSlot.error || ""), unknownSlot);
    const badTag = await post("/api/equipment/variant/save", { ...good, tag: "12", name: "BadTag" });
    ok("invalid country tag rejected", badTag.ok === false, badTag);

    // Final: the file is still brace-balanced after all the rejected + accepted writes.
    ok("history still brace-balanced at the end", balanced(fs.readFileSync(histPath, "utf8")));
  } catch (e) {
    ok("threw: " + (e && e.stack ? e.stack : e), false);
  } finally {
    try { fs.rmSync(mod, { recursive: true, force: true }); } catch (_) {}
  }

  console.log(`\nEQUIPMENT-VARIANT: ${pass} passed, ${fail} failed`);
  process.exitCode = fail ? 1 : 0;
  try { server.closeAllConnections && server.closeAllConnections(); } catch (_) {}
  server.close();
})();
