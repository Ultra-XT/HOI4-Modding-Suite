// Military Industrial Organization (MIO) writer: serialize a valid MIO (id, allowed, equipment_type,
// initial_trait, traits + bonuses) into a mod-owned common/military_industrial_organization/organizations/*.txt,
// preserve un-modeled keys, write loc names. Run: node test-mio.js
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const { createApp } = require("./server.js");

let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log("  ok  " + n); } else { fail++; console.error("  FAIL " + n + (x !== undefined ? " -> " + JSON.stringify(x) : "")); } };
const balanced = (s) => (s.replace(/#.*$/gm, "").replace(/"[^"]*"/g, '""').match(/{/g) || []).length === (s.replace(/#.*$/gm, "").replace(/"[^"]*"/g, '""').match(/}/g) || []).length;

(async () => {
  const PORT = 3948, BASE = `http://127.0.0.1:${PORT}`;
  const app = createApp();
  const server = await new Promise((res) => { const s = app.listen(PORT, () => res(s)); });
  const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-mio-"));
  let tcMod = null;
  const mk = (rel, body) => { const p = path.join(mod, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, body, "utf8"); };
  mk("descriptor.mod", 'name="Nova MIO Test"\n');
  const post = (route, body) => fetch(`${BASE}${route}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json());
  const orgFile = (name) => path.join(mod, "common", "military_industrial_organization", "organizations", name);

  try {
    console.log("=== create a valid MIO on an empty file ===");
    const r1 = await post("/api/mio", {
      modPath: mod, id: "nova_tank_works", name: "Nova Tank Works", allowedTag: "GER",
      icon: "GFX_idea_generic_tank_manufacturer_1", equipmentType: ["mio_cat_eq_all_medium_tank"],
      researchCategories: ["mio_cat_tech_medium_armor_and_modules"],
      initial: { name: "Standardized production", equipmentBonus: { build_cost_ic: -0.05, reliability: 0.05 } },
      traits: [
        { token: "reliable_tracks", name: "Reliable tracks", x: 0, y: 0, equipmentBonus: { reliability: 0.05 } },
        { token: "long_guns", name: "Long guns", x: 1, y: 0, relativeTo: "reliable_tracks", equipmentBonus: { soft_attack: 0.05 }, productionBonus: { production_efficiency_gain_factor: 0.1 } },
      ],
    });
    ok("mio save ok", r1 && r1.ok === true && r1.id === "nova_tank_works" && r1.traits === 2, r1);
    let txt = fs.readFileSync(orgFile("nova_mio.txt"), "utf8");
    ok("top-level id block (no wrapper)", /^nova_tank_works = \{/m.test(txt), txt);
    ok("icon + allowed(original_tag) written", /icon = GFX_idea_generic_tank_manufacturer_1/.test(txt) && /allowed = \{ original_tag = GER \}/.test(txt), txt);
    ok("equipment_type + research_categories written", /equipment_type = \{ mio_cat_eq_all_medium_tank \}/.test(txt) && /research_categories = \{ mio_cat_tech_medium_armor_and_modules \}/.test(txt), txt);
    ok("initial_trait with equipment_bonus", /initial_trait = \{[\s\S]*name = nova_tank_works_initial[\s\S]*equipment_bonus = \{[\s\S]*build_cost_ic = -0\.05[\s\S]*reliability = 0\.05/.test(txt), txt);
    ok("trait with token/position", /trait = \{[\s\S]*token = reliable_tracks[\s\S]*position = \{ x=0 y=0 \}/.test(txt), txt);
    ok("2nd trait with relative_position_id + production_bonus", /token = long_guns[\s\S]*relative_position_id = reliable_tracks[\s\S]*production_bonus = \{[\s\S]*production_efficiency_gain_factor = 0\.1/.test(txt), txt);
    ok("brace-balanced", balanced(txt), txt);

    console.log("\n=== localisation names written ===");
    const loc = fs.readFileSync(path.join(mod, "localisation", "english", "nova_mio_l_english.yml"), "utf8");
    ok("mio name + trait names in loc", /nova_tank_works:0 "Nova Tank Works"/.test(loc) && /reliable_tracks:0 "Reliable tracks"/.test(loc) && /long_guns:0 "Long guns"/.test(loc), loc);

    console.log("\n=== GET lists the mod's MIO ===");
    const g = await fetch(`${BASE}/api/mio?modPath=${encodeURIComponent(mod)}`).then((r) => r.json());
    ok("GET returns the mio id", g.ok === true && g.mios.some((m) => m.id === "nova_tank_works"), g);

    console.log("\n=== edit in place — preserve an un-modeled top-level key (available) ===");
    txt = fs.readFileSync(orgFile("nova_mio.txt"), "utf8").replace(/(nova_tank_works = \{\n)/, "$1\tavailable = { has_country_flag = nova_flag }\n");
    fs.writeFileSync(orgFile("nova_mio.txt"), txt, "utf8");
    const r2 = await post("/api/mio", {
      modPath: mod, id: "nova_tank_works", name: "Nova Tank Works", allowedTag: "GER", equipmentType: ["mio_cat_eq_all_medium_tank"],
      initial: { equipmentBonus: { armor_value: 0.1 } },
      traits: [{ token: "reliable_tracks", name: "Reliable tracks", x: 0, y: 0, equipmentBonus: { reliability: 0.08 } }],
    });
    txt = fs.readFileSync(orgFile("nova_mio.txt"), "utf8");
    ok("edit ok", r2.ok === true, r2);
    ok("un-modeled available PRESERVED", /available = \{ has_country_flag = nova_flag \}/.test(txt), txt);
    ok("initial bonus updated (armor_value 0.1, old build_cost gone)", /armor_value = 0\.1/.test(txt) && !/build_cost_ic/.test(txt), txt);
    ok("trait reliability updated to 0.08", /reliability = 0\.08/.test(txt) && !/reliability = 0\.05/.test(txt), txt);
    ok("still exactly one nova_tank_works block", (txt.match(/^nova_tank_works = \{/gm) || []).length === 1, txt);
    ok("edit brace-balanced", balanced(txt), txt);

    console.log("\n=== CLEARING a modeled key (research_categories / all traits) stays cleared ===");
    // regression: mergePreservedMioBlock used to re-add an emptied modeled block from the old file.
    await post("/api/mio", { modPath: mod, id: "nova_tank_works", name: "Nova Tank Works", allowedTag: "GER", equipmentType: ["mio_cat_eq_all_medium_tank"], researchCategories: ["mio_cat_tech_medium_armor_and_modules"], initial: { equipmentBonus: { armor_value: 0.1 } }, traits: [{ token: "reliable_tracks", name: "Reliable tracks", x: 0, y: 0, equipmentBonus: { reliability: 0.08 } }] });
    const seeded = fs.readFileSync(orgFile("nova_mio.txt"), "utf8");
    ok("seed has research_categories + a trait block", /research_categories/.test(seeded) && /(^|\n)\s*trait\s*=/.test(seeded), seeded);
    const r2c = await post("/api/mio", { modPath: mod, id: "nova_tank_works", name: "Nova Tank Works", allowedTag: "GER", equipmentType: ["mio_cat_eq_all_medium_tank"], researchCategories: [], initial: { equipmentBonus: { armor_value: 0.1 } }, traits: [] });
    txt = fs.readFileSync(orgFile("nova_mio.txt"), "utf8");
    ok("cleared research_categories + all traits GONE, initial_trait kept, available still preserved", r2c.ok === true && !/research_categories/.test(txt) && !/(^|\n)\s*trait\s*=/.test(txt) && /initial_trait/.test(txt) && /available = \{ has_country_flag = nova_flag \}/.test(txt) && balanced(txt), txt);

    console.log("\n=== a 2nd MIO in the same file coexists ===");
    const r3 = await post("/api/mio", { modPath: mod, id: "nova_plane_works", name: "Nova Aero", allowedTag: "GER", equipmentType: ["mio_cat_eq_all_small_plane"], initial: { equipmentBonus: { air_agility: 0.05 } }, traits: [{ token: "light_frames", name: "Light frames", x: 0, y: 0, equipmentBonus: { air_agility: 0.05 } }] });
    txt = fs.readFileSync(orgFile("nova_mio.txt"), "utf8");
    ok("second MIO added, first preserved", r3.ok === true && /^nova_plane_works = \{/m.test(txt) && /^nova_tank_works = \{/m.test(txt), txt);
    ok("two-MIO file brace-balanced", balanced(txt), txt);

    console.log("\n=== nested-name collision (round-4): a new MIO id equal to a nested sub-key must not corrupt an earlier org ===");
    // nova_tank_works owns a NESTED `allowed = { original_tag = GER }`. Creating a NEW org literally named "allowed"
    // must APPEND a fresh top-level org — the old first-match regex matched that nested block and overwrote it,
    // silently corrupting nova_tank_works while the brace-balance guard still passed. findTopLevelEntry fixes it.
    const before = fs.readFileSync(orgFile("nova_mio.txt"), "utf8");
    ok("precondition: nova_tank_works has a NESTED allowed block, and it is the first `allowed =`", /nova_tank_works = \{[\s\S]*?\n\tallowed = \{ original_tag = GER \}/.test(before) && before.indexOf("allowed =") > before.indexOf("nova_tank_works"), before);
    const rcol = await post("/api/mio", { modPath: mod, id: "allowed", name: "Collision Org", allowedTag: "ITA", equipmentType: ["mio_cat_eq_all_medium_tank"], initial: { equipmentBonus: { reliability: 0.03 } }, traits: [] });
    txt = fs.readFileSync(orgFile("nova_mio.txt"), "utf8");
    ok("collision save ok", rcol.ok === true, rcol);
    ok("nova_tank_works's NESTED allowed intact (not clobbered)", /nova_tank_works = \{[\s\S]*?\n\tallowed = \{ original_tag = GER \}/.test(txt), txt);
    ok("a NEW top-level `allowed = {` org appended (its own allowed = ITA)", (txt.match(/^allowed = \{/gm) || []).length === 1 && /^allowed = \{[\s\S]*?original_tag = ITA/m.test(txt), txt);
    ok("collision file brace-balanced", balanced(txt), txt);
    const gcol = await fetch(`${BASE}/api/mio?modPath=${encodeURIComponent(mod)}`).then((r) => r.json());
    ok("GET lists BOTH nova_tank_works and the new 'allowed' org (earlier org survived)", gcol.ok === true && gcol.mios.some((m) => m.id === "nova_tank_works") && gcol.mios.some((m) => m.id === "allowed") && gcol.mios.some((m) => m.id === "nova_plane_works"), gcol && gcol.mios && gcol.mios.map((m) => m.id));

    console.log("\n=== guards ===");
    const bad1 = await post("/api/mio", { modPath: mod, id: "9bad", equipmentType: ["mio_cat_eq_all_medium_tank"], traits: [] });
    ok("leading-digit id rejected", bad1.ok === false, bad1);
    const bad2 = await post("/api/mio", { modPath: mod, id: "nova_x", equipmentType: [], researchCategories: [], traits: [] });
    ok("no equipment_type/research rejected", bad2.ok === false, bad2);
    const bad3 = await post("/api/mio", { modPath: mod, id: "nova_y", allowedTag: "ZZZZ", equipmentType: ["mio_cat_eq_all_medium_tank"], traits: [] });
    ok("bad allowed tag rejected", bad3.ok === false, bad3);
    // injection-shaped bonus key + non-numeric value dropped
    const r4 = await post("/api/mio", { modPath: mod, id: "nova_clean", equipmentType: ["mio_cat_eq_all_medium_tank"], initial: { equipmentBonus: { "x = 1 } evil": 3, reliability: "notnum", defense: 0.1 } }, traits: [] });
    txt = fs.readFileSync(orgFile("nova_mio.txt"), "utf8");
    ok("injection bonus key + non-numeric dropped, good kept", r4.ok === true && !/evil/.test(txt) && !/notnum/.test(txt) && /defense = 0\.1/.test(txt) && balanced(txt), txt);
    const gameRoot = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
    const bad4 = await post("/api/mio", { modPath: gameRoot, id: "nova_x", equipmentType: ["mio_cat_eq_all_medium_tank"], traits: [] });
    ok("game-root write rejected", bad4.ok === false, bad4);
    ok("final file still brace-balanced", balanced(fs.readFileSync(orgFile("nova_mio.txt"), "utf8")));

    console.log("\n=== GET /api/mio/categories honours replace_path (round-5): total-conversion mod shows NO phantom vanilla categories ===");
    // A total conversion (like Millennium Dawn) replace_paths common/equipment_groups + the MIO organizations dir,
    // so vanilla's mio_cat_eq_*/mio_cat_tech_* do NOT load in-game. The endpoint used to union every root and
    // offer ~21+11 phantom categories a user could pick, writing an MIO referencing an undefined group. With the
    // fix, the game root is dropped for both replaced dirs → only the mod's own categories are returned.
    tcMod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-mio-tc-"));
    const mkTc = (rel, body) => { const p = path.join(tcMod, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, body, "utf8"); };
    mkTc("descriptor.mod", 'name="Nova MIO TC Test"\nreplace_path="common/equipment_groups"\nreplace_path="common/military_industrial_organization"\n');
    // one prefixed + one UNPREFIXED category (round-7): a MIO category is any top-level key with equipment_type,
    // NOT only mio_cat_eq_*-named ones (MD ships mio_cat_destroyers etc.). Both must be surfaced.
    mkTc("common/equipment_groups/mio_equipment_groups.txt", "mio_cat_eq_novatc = {\n\tequipment_type = { medium_tank }\n}\nmio_cat_custom_ships = {\n\tequipment_type = { destroyer cruiser }\n}\n");
    // include COMMENTED-out phantom tokens: a commented category is not defined and must NOT be harvested (round-6).
    // research_categories mixes a prefixed + an UNPREFIXED token (round-8): MD declares CAT_inf etc., not
    // mio_cat_tech_* — both must be harvested structurally from the block.
    mkTc("common/military_industrial_organization/organizations/nova_orgs.txt", 'nova_tc_org = {\n\ticon = GFX_x\n\tequipment_type = { mio_cat_eq_novatc }\n\tresearch_categories = { mio_cat_tech_novatc CAT_custom_tech }\n\t# TODO re-enable mio_cat_eq_phantom_comment\n\t# old ref: mio_cat_tech_phantom_comment\n}\n');
    const gc = await fetch(`${BASE}/api/mio/categories?modPath=${encodeURIComponent(tcMod)}`).then((r) => r.json());
    ok("categories GET ok", gc.ok === true, gc);
    ok("mod's own PREFIXED equipment category present", (gc.equipment || []).includes("mio_cat_eq_novatc"), gc.equipment);
    ok("mod's own UNPREFIXED equipment category present (round-7: match by equipment_type, not name prefix)", (gc.equipment || []).includes("mio_cat_custom_ships"), gc.equipment);
    ok("mod's own PREFIXED research category present", (gc.research || []).includes("mio_cat_tech_novatc"), gc.research);
    ok("mod's own UNPREFIXED research category present (round-8: harvested from research_categories block, not name prefix)", (gc.research || []).includes("CAT_custom_tech"), gc.research);
    ok("NO phantom vanilla equipment categories (game root dropped by replace_path)", !(gc.equipment || []).some((c) => /all_(light|medium|heavy)_tank|all_artillery|all_battleship/.test(c)), gc.equipment);
    ok("commented-out tokens are NOT harvested as real categories", !(gc.equipment || []).includes("mio_cat_eq_phantom_comment") && !(gc.research || []).includes("mio_cat_tech_phantom_comment"), { eq: gc.equipment, tech: gc.research });
    ok("only the mod's own real categories remain (2 eq, 2 research)", (gc.equipment || []).length === 2 && (gc.research || []).length === 2, { eq: gc.equipment, tech: gc.research });

    console.log("\n=== description writes an <id>_desc loc key (new company-editor field) ===");
    const rd = await post("/api/mio", {
      modPath: mod, id: "nova_desc_org", name: "Nova Desc Org", allowedTag: "GER",
      equipmentType: ["mio_cat_eq_all_medium_tank"], desc: "A storied works renowned for reliable tanks.",
      initial: { equipmentBonus: { defense: 0.07 } }, traits: [],
    });
    const locD = fs.readFileSync(path.join(mod, "localisation", "english", "nova_mio_l_english.yml"), "utf8");
    ok("desc save ok", rd.ok === true, rd);
    ok("<id>_desc loc key written from desc", /nova_desc_org_desc:0 "A storied works renowned for reliable tanks\."/.test(locD), locD);
  } catch (e) {
    ok("threw: " + (e && e.stack ? e.stack : e), false);
  } finally {
    try { fs.rmSync(mod, { recursive: true, force: true }); } catch (_) {}
    try { if (tcMod) fs.rmSync(tcMod, { recursive: true, force: true }); } catch (_) {}
  }

  console.log(`\nMIO: ${pass} passed, ${fail} failed`);
  process.exitCode = fail ? 1 : 0;
  try { server.closeAllConnections && server.closeAllConnections(); } catch (_) {}
  server.close();
})();
