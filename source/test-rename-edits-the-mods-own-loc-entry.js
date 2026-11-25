// A rename must EDIT the localisation entry the mod already has — not append a second one.
//
// Three writers hardcoded their own output file and never asked where the mod already defines the key:
//   upsertEquipmentLoc      -> localisation/english/custom_equipment_l_english.yml
//   upsertMioLoc            -> localisation/english/nova_mio_l_english.yml
//   upsertCustomFolderNameLoc -> localisation/english/nova_custom_folders_l_english.yml
//
// So renaming a piece of equipment / a military industrial organization / a research tab that the mod
// already names in its OWN .yml left the old value standing there and wrote the new one into a second
// file. Which one is read is decided by filename order, and the mod's own file is usually the loser's
// opposite — equipment_l_english.yml, zz_*.yml, r56e_*.yml all sort after Nova's file. Measured before
// the fix, on the fixtures below:
//   POST /api/equipment/save -> {"ok":true}, then GET /api/equipment/list still answered
//     "Mod Owned Tank Name"        (the rename the user just typed was gone on the very next reload)
//   POST /api/mio            -> {"ok":true}, then GET /api/mio/detail — the endpoint the MIO editor
//     itself calls to reopen a company — still answered "Mod Owned Company Name"
//   POST /api/research/set-folder-name -> {"ok":true}, and the tab kept "Mod Owned Tab Name"
// and in every case the mod was left carrying TWO definitions of one key, which the HOI4 wiki says must
// be avoided because the winner "does not seem to have a consistent pattern".
//
// Corpus reach: 2,204 mod-named equipment ids and 620 mod-named MIO ids across the five installed
// workshop mods.
//
// The fix routes all three through findModLocalizationFileDefiningKey (the helper six other makers —
// events, decisions, characters, focus, ideas, technologies — already use), falling back to the
// nova_*/custom_* file only when the key is genuinely new. Run: node test-rename-edits-the-mods-own-loc-entry.js
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const { createApp } = require("./server.js");

let pass = 0, fail = 0;
const rec = (label, cond, detail) => {
  if (cond) { pass++; console.log("  ok  " + label); }
  else { fail++; console.error("  FAIL " + label + (detail !== undefined ? " -> " + JSON.stringify(detail) : "")); }
};

const BOM = "﻿";
const mods = [];

function mkmod() {
  const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-locrename-"));
  fs.writeFileSync(path.join(mod, "descriptor.mod"), 'name="Nova Loc Rename Test"\n');
  mods.push(mod);
  return mod;
}
/** Write one of the mod's OWN localisation files (BOM-led, like every shipping mod). */
function ownYml(mod, relative, lines) {
  const p = path.join(mod, "localisation", "english", relative);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, BOM + "l_english:\n" + lines.map((l) => " " + l + "\n").join(""), "utf8");
  return p;
}
/** Every definition of `key` anywhere under localisation/, as "<relative path> => <value>". */
function defsOf(mod, key) {
  const out = [];
  const walk = (dir) => {
    let ents = [];
    try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { return; }
    for (const e of ents) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) { walk(full); continue; }
      if (!e.name.toLowerCase().endsWith(".yml")) continue;
      let txt = "";
      try { txt = fs.readFileSync(full, "utf8"); } catch (_) { continue; }
      const re = new RegExp(`^[ \\t]*${key}:\\d*[ \\t]*"(.*)"[ \\t]*$`, "gm");
      let m;
      while ((m = re.exec(txt))) out.push(path.relative(path.join(mod, "localisation"), full).replace(/\\/g, "/") + " => " + m[1]);
    }
  };
  walk(path.join(mod, "localisation"));
  return out.sort();
}

(async () => {
  const PORT = 53545, BASE = `http://127.0.0.1:${PORT}`;
  const app = createApp();
  const server = await new Promise((r) => { const s = app.listen(PORT, () => r(s)); });
  const post = (route, body) => fetch(BASE + route, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json());
  const get = (route) => fetch(BASE + route).then((r) => r.json());

  try {
    // ------------------------------------------------------------------ EQUIPMENT
    console.log("=== equipment: rename edits the mod's own .yml ===");
    const eq = mkmod();
    fs.mkdirSync(path.join(eq, "common", "units", "equipment"), { recursive: true });
    fs.writeFileSync(path.join(eq, "common", "units", "equipment", "zz_nova_equipment.txt"),
      "equipments = {\n\tnova_probe_equipment = {\n\t\tyear = 1936\n\t\tarchetype = infantry_equipment\n\t\tsoft_attack = 5\n\t}\n}\n");
    // The mod's own loc file, named so it sorts AFTER custom_equipment_l_english.yml — the ordinary case.
    ownYml(eq, "zz_mymod_l_english.yml", ['nova_probe_equipment:0 "Mod Owned Tank Name"']);
    const eqDefault = path.join(eq, "localisation", "english", "custom_equipment_l_english.yml");

    // FIXTURE CONTROL — without this the test could pass vacuously against a mod that names nothing.
    const eqBefore = defsOf(eq, "nova_probe_equipment");
    rec("FIXTURE: the mod defines the equipment key exactly once, in its own zz_ file",
      eqBefore.length === 1 && eqBefore[0] === 'english/zz_mymod_l_english.yml => Mod Owned Tank Name', eqBefore);
    rec("FIXTURE: Nova's default equipment .yml does not exist yet", !fs.existsSync(eqDefault));
    const eqList0 = await get(`/api/equipment/list?modPath=${encodeURIComponent(eq)}`);
    const shown0 = (eqList0.equipment || []).find((e) => e.id === "nova_probe_equipment");
    rec("FIXTURE: the editor really shows the mod's own name before the save",
      !!shown0 && shown0.name === "Mod Owned Tank Name" && shown0.isMod === true, shown0 && { n: shown0.name, m: shown0.isMod });

    // Exactly what public/army.js:2545 (saveEquip) sends: modPath, id, name, year, then each stat on screen.
    const eqSave = await post("/api/equipment/save", { modPath: eq, id: "nova_probe_equipment", name: "Renamed By Nova", year: "1936", defense: 7 });
    rec("equipment save accepted (read the body before the disk)", eqSave && eqSave.ok === true, eqSave);

    const eqAfter = defsOf(eq, "nova_probe_equipment");
    rec("exactly ONE definition of the key after the rename (no second file)", eqAfter.length === 1, eqAfter);
    rec("that definition is the mod's OWN file, carrying the new name",
      eqAfter[0] === 'english/zz_mymod_l_english.yml => Renamed By Nova', eqAfter);
    // WRITE CONTROL — a file that was never touched would also hold no duplicate.
    rec("WRITE CONTROL: the value actually changed (old text is gone)",
      !/Mod Owned Tank Name/.test(fs.readFileSync(path.join(eq, "localisation", "english", "zz_mymod_l_english.yml"), "utf8")));
    rec("Nova's default equipment .yml was not created for a key the mod already owns", !fs.existsSync(eqDefault));
    const eqList1 = await get(`/api/equipment/list?modPath=${encodeURIComponent(eq)}`);
    const shown1 = (eqList1.equipment || []).find((e) => e.id === "nova_probe_equipment");
    rec("the editor reloads with the NEW name (this is what was silently lost)",
      !!shown1 && shown1.name === "Renamed By Nova", shown1 && shown1.name);

    // MUST-NOT-CHANGE CONTROL: the create path. A brand-new id has no home yet and must still land in
    // custom_equipment_l_english.yml — that is what test-equipment-maker.js / test-chassis-new.js assert.
    const fam = await post("/api/equipment/family", { modPath: eq, id: "nova_fresh_equipment", name: "Brand New Name", type: "infantry", tiers: [] });
    rec("CREATE PATH: a brand-new family saves ok", fam && fam.ok === true, fam);
    const freshDefs = defsOf(eq, "nova_fresh_equipment");
    rec("CREATE PATH: a brand-new id still lands in custom_equipment_l_english.yml, once",
      freshDefs.length === 1 && freshDefs[0] === 'english/custom_equipment_l_english.yml => Brand New Name', freshDefs);

    // A second rename of the SAME id must keep editing one line, not start appending.
    const eqSave2 = await post("/api/equipment/save", { modPath: eq, id: "nova_fresh_equipment", name: "Renamed Twice", year: "1936" });
    rec("re-renaming a Nova-created id stays at one definition",
      eqSave2 && eqSave2.ok === true && defsOf(eq, "nova_fresh_equipment").length === 1, defsOf(eq, "nova_fresh_equipment"));

    // localisation/<lang>/replace/ beats every other file in game, so that is the copy to edit.
    console.log("\n=== equipment: localisation/english/replace/ is preferred ===");
    const eqr = mkmod();
    fs.mkdirSync(path.join(eqr, "common", "units", "equipment"), { recursive: true });
    fs.writeFileSync(path.join(eqr, "common", "units", "equipment", "zz_nova_equipment.txt"),
      "equipments = {\n\tnova_probe_equipment = {\n\t\tyear = 1936\n\t\tarchetype = infantry_equipment\n\t}\n}\n");
    ownYml(eqr, path.join("replace", "zz_override_l_english.yml"), ['nova_probe_equipment:0 "Replace Folder Name"']);
    const rDefs0 = defsOf(eqr, "nova_probe_equipment");
    rec("FIXTURE: the only definition lives under localisation/english/replace/",
      rDefs0.length === 1 && /replace\//.test(rDefs0[0]), rDefs0);
    const rSave = await post("/api/equipment/save", { modPath: eqr, id: "nova_probe_equipment", name: "Renamed By Nova", year: "1936" });
    const rDefs1 = defsOf(eqr, "nova_probe_equipment");
    rec("the replace/ copy is the one rewritten, and it is still the only one",
      rSave && rSave.ok === true && rDefs1.length === 1 && /replace\/.*Renamed By Nova$/.test(rDefs1[0]), rDefs1);

    // ------------------------------------------------------------------ MIO
    console.log("\n=== military industrial organization ===");
    const mio = mkmod();
    fs.mkdirSync(path.join(mio, "common", "military_industrial_organization", "organizations"), { recursive: true });
    fs.writeFileSync(path.join(mio, "common", "military_industrial_organization", "organizations", "nova_mio.txt"),
      "probe_company_organization = {\n\tname = probe_company_organization\n\ticon = GFX_idea_generic_tank_manufacturer_1\n\tallowed = { always = yes }\n\tequipment_type = { armor }\n\tresearch_categories = { armor }\n\tinitial_trait = { name = probe_company_initial }\n}\n");
    ownYml(mio, "zz_mymod_l_english.yml", ['probe_company_organization:0 "Mod Owned Company Name"']);
    const mioDefault = path.join(mio, "localisation", "english", "nova_mio_l_english.yml");

    const mioBefore = defsOf(mio, "probe_company_organization");
    rec("FIXTURE: the mod defines the company key exactly once, in its own zz_ file",
      mioBefore.length === 1 && mioBefore[0] === 'english/zz_mymod_l_english.yml => Mod Owned Company Name', mioBefore);
    const det0 = await get(`/api/mio/detail?modPath=${encodeURIComponent(mio)}&id=probe_company_organization`);
    rec("FIXTURE: /api/mio/detail really shows the mod's own name before the save",
      det0 && det0.ok === true && det0.name === "Mod Owned Company Name", det0 && det0.name);

    // Exactly what public/mio-editor.js:610 sends for an EDIT (previousId === id, so no rename sweep).
    const mioSave = await post("/api/mio", {
      modPath: mio, id: "probe_company_organization", name: "Renamed By Nova", desc: "", allowedTag: "", icon: "",
      fileName: "nova_mio.txt", equipmentType: ["armor"], researchCategories: ["armor"], include: [],
      initial: { equipmentBonus: {}, productionBonus: {} }, traits: [], writeIdeaFallback: false,
      companyType: "", previousId: "probe_company_organization",
    });
    rec("MIO save accepted, and it is an edit not an id-rename", mioSave && mioSave.ok === true && mioSave.renamedFrom === null, mioSave);
    const mioAfter = defsOf(mio, "probe_company_organization");
    rec("exactly ONE definition of the company key after the save", mioAfter.length === 1, mioAfter);
    rec("that definition is the mod's OWN file, carrying the new name",
      mioAfter[0] === 'english/zz_mymod_l_english.yml => Renamed By Nova', mioAfter);
    rec("WRITE CONTROL: the old company name is gone from the mod's own file",
      !/Mod Owned Company Name/.test(fs.readFileSync(path.join(mio, "localisation", "english", "zz_mymod_l_english.yml"), "utf8")));
    const det1 = await get(`/api/mio/detail?modPath=${encodeURIComponent(mio)}&id=probe_company_organization`);
    rec("reopening the company shows the NEW name (this is what was silently lost)",
      det1 && det1.ok === true && det1.name === "Renamed By Nova", det1 && det1.name);

    // MUST-NOT-CHANGE CONTROL: a company Nova creates has no existing home, so its keys still go to
    // nova_mio_l_english.yml — the destination test-mio.js and friends assert.
    const mioNew = await post("/api/mio", {
      modPath: mio, id: "nova_fresh_company", name: "Fresh Company", desc: "", allowedTag: "", icon: "",
      fileName: "nova_mio.txt", equipmentType: ["armor"], researchCategories: ["armor"], include: [],
      initial: { equipmentBonus: {}, productionBonus: {} }, traits: [], writeIdeaFallback: false,
      companyType: "", previousId: "",
    });
    rec("CREATE PATH: a brand-new company saves ok", mioNew && mioNew.ok === true, mioNew);
    const freshMio = defsOf(mio, "nova_fresh_company");
    rec("CREATE PATH: a brand-new company id still lands in nova_mio_l_english.yml, once",
      freshMio.length === 1 && freshMio[0] === 'english/nova_mio_l_english.yml => Fresh Company', freshMio);
    rec("CREATE PATH: Nova's default MIO .yml exists only because of the new company", fs.existsSync(mioDefault));

    // ------------------------------------------------------------------ RESEARCH TAB
    console.log("\n=== research tab ===");
    const tab = mkmod();
    fs.mkdirSync(path.join(tab, "common", "technology_tags"), { recursive: true });
    fs.writeFileSync(path.join(tab, "common", "technology_tags", "zz_nova_custom_folders.txt"),
      "technology_folders = {\n\tprobe_nova_folder = {\n\t\tledger = army\n\t}\n}\n");
    ownYml(tab, "zz_mymod_l_english.yml", ['probe_nova_folder:0 "Mod Owned Tab Name"']);
    const tabDefault = path.join(tab, "localisation", "english", "nova_custom_folders_l_english.yml");

    const tabBefore = defsOf(tab, "probe_nova_folder");
    rec("FIXTURE: the mod defines the tab key exactly once, in its own zz_ file",
      tabBefore.length === 1 && tabBefore[0] === 'english/zz_mymod_l_english.yml => Mod Owned Tab Name', tabBefore);
    // Exactly what public/research.js:7381 sends when only the tab NAME changed.
    const tabSave = await post("/api/research/set-folder-name", { modPath: tab, folderKey: "probe_nova_folder", name: "Renamed By Nova" });
    rec("tab rename accepted", tabSave && tabSave.ok === true && tabSave.wroteLoc === true, tabSave);
    const tabAfter = defsOf(tab, "probe_nova_folder");
    rec("exactly ONE definition of the tab key after the rename", tabAfter.length === 1, tabAfter);
    rec("that definition is the mod's OWN file, carrying the new name",
      tabAfter[0] === 'english/zz_mymod_l_english.yml => Renamed By Nova', tabAfter);
    rec("WRITE CONTROL: the old tab name is gone from the mod's own file",
      !/Mod Owned Tab Name/.test(fs.readFileSync(path.join(tab, "localisation", "english", "zz_mymod_l_english.yml"), "utf8")));
    rec("Nova's default tab .yml was not created for a key the mod already owns", !fs.existsSync(tabDefault));

    // MUST-NOT-CHANGE CONTROL: naming a BASE-GAME tab is ordinary modding. The mod defines nothing for it,
    // so the loc key must still be written into Nova's own file (overriding vanilla cleanly).
    const vanillaTab = await post("/api/research/set-folder-name", { modPath: tab, folderKey: "infantry_folder", name: "Boots And Rifles" });
    rec("CREATE PATH: naming a base-game tab saves ok", vanillaTab && vanillaTab.ok === true, vanillaTab);
    const vDefs = defsOf(tab, "infantry_folder");
    rec("CREATE PATH: a base-game tab name still lands in nova_custom_folders_l_english.yml, once",
      vDefs.length === 1 && vDefs[0] === 'english/nova_custom_folders_l_english.yml => Boots And Rifles', vDefs);
  } catch (e) {
    fail++;
    console.error("  FAIL harness threw -> " + (e && e.stack ? e.stack : e));
  } finally {
    server.closeAllConnections && server.closeAllConnections();
    await new Promise((r) => server.close(r));
    for (const m of mods) { try { fs.rmSync(m, { recursive: true, force: true }); } catch (_) {} }
  }

  console.log(`\n${pass} checks, ${fail} failed`);
  process.exitCode = fail ? 1 : 0;
})();
