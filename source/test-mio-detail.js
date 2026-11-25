// The company editor is for EDITING, not only creating: clicking a company must load every field. This covers the
// data layer behind that — GET /api/mio/detail (full parsed company, shaped like the POST input), GET /api/mio/files
// (the file dropdown), and the trait `icon` now captured by GET /api/mio/traits. Run: node test-mio-detail.js
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const { createApp } = require("./server.js");

let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log("  ok  " + n); } else { fail++; console.error("  FAIL " + n + (x !== undefined ? " -> " + JSON.stringify(x) : "")); } };

(async () => {
  const PORT = 3993, BASE = `http://127.0.0.1:${PORT}`;
  const server = await new Promise((res) => { const s = createApp().listen(PORT, () => res(s)); });
  const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-mio-detail-"));
  fs.writeFileSync(path.join(mod, "descriptor.mod"), 'name="MioDetail"\n');
  const post = (r, b) => fetch(`${BASE}${r}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) }).then((x) => x.json());
  const get = (r) => fetch(`${BASE}${r}`).then((x) => x.json());
  const orgDir = path.join(mod, "common", "military_industrial_organization", "organizations");

  try {
    console.log("=== round-trip: POST a company, then GET /api/mio/detail loads it back faithfully ===");
    const created = await post("/api/mio", {
      modPath: mod, id: "nova_tank_works", name: "Nova Tank Works", desc: "Reliable armour.", allowedTag: "GER",
      icon: "GFX_idea_generic_tank_manufacturer_1", equipmentType: ["mio_cat_all_armor"], researchCategories: ["CAT_armor"],
      fileName: "my_companies.txt",
      initial: { equipmentBonus: { reliability: 0.05 }, productionBonus: { production_efficiency_cap: 0.1 } },
      traits: [
        { token: "reliable_tracks", name: "Reliable Tracks", x: 0, y: 1, equipmentBonus: { reliability: 0.1, defense: 0.05 } },
        { token: "long_guns", name: "Long Guns", x: 1, y: 1, relativeTo: "reliable_tracks", equipmentBonus: { soft_attack: 0.06 }, productionBonus: { production_efficiency_gain_factor: 0.2 } },
      ],
    });
    ok("POST ok, custom file honoured", created.ok === true && created.file === "my_companies.txt", created);

    const d = await get(`/api/mio/detail?id=nova_tank_works&modPath=${encodeURIComponent(mod)}`);
    ok("detail ok", d.ok === true, d);
    ok("file reported (pre-fills the file box)", d.file === "my_companies.txt", d.file);
    ok("name + desc from loc", d.name === "Nova Tank Works" && d.desc === "Reliable armour.", { name: d.name, desc: d.desc });
    ok("icon + allowedTag", d.icon === "GFX_idea_generic_tank_manufacturer_1" && d.allowedTag === "GER", { icon: d.icon, tag: d.allowedTag });
    ok("equipmentType + researchCategories", JSON.stringify(d.equipmentType) === '["mio_cat_all_armor"]' && JSON.stringify(d.researchCategories) === '["CAT_armor"]', { eq: d.equipmentType, tech: d.researchCategories });
    ok("initial bonuses (eq + prod) split correctly", d.initial.equipmentBonus.reliability === 0.05 && d.initial.productionBonus.production_efficiency_cap === 0.1, d.initial);
    ok("two traits parsed, initial_trait NOT among them", d.traits.length === 2, d.traits.map((t) => t.token));
    const t0 = d.traits.find((t) => t.token === "reliable_tracks"), t1 = d.traits.find((t) => t.token === "long_guns");
    ok("trait position + bonuses", t0 && t0.x === 0 && t0.y === 1 && t0.equipmentBonus.reliability === 0.1 && t0.equipmentBonus.defense === 0.05, t0);
    ok("trait relative + production bonus", t1 && t1.relativeTo === "reliable_tracks" && t1.productionBonus.production_efficiency_gain_factor === 0.2, t1);

    console.log("\n=== GET /api/mio/files lists the custom file for the dropdown ===");
    const f = await get(`/api/mio/files?modPath=${encodeURIComponent(mod)}`);
    ok("files ok, includes my_companies.txt + the nova_mio.txt default", f.ok === true && f.files.includes("my_companies.txt") && f.files.includes("nova_mio.txt"), f.files);

    console.log("\n=== trait icon is now captured (GET /api/mio/traits) ===");
    // hand-author a file with a real MD-style trait icon
    fs.writeFileSync(path.join(orgDir, "icon_org.txt"),
      "ICON_org = {\n\ticon = GFX_idea_x\n\tequipment_type = { mio_cat_all_armor }\n" +
      "\ttrait = {\n\t\ttoken = precision_gun\n\t\tname = precision_gun\n\t\ticon = GFX_generic_mio_trait_icon_soft_attack\n\t\tequipment_bonus = { soft_attack = 0.1 }\n\t}\n}\n");
    const tr = await get(`/api/mio/traits?modPath=${encodeURIComponent(mod)}`);
    const pg = (tr.traits || []).find((t) => t.token === "precision_gun");
    ok("trait icon captured", pg && pg.icon === "GFX_generic_mio_trait_icon_soft_attack", pg);

    console.log("\n=== include-based company (MD's specialized-manufacturer pattern) round-trips ===");
    // a company whose equipment/traits come from `include = <template>` — detail must capture it, and a re-save must
    // keep it EXACTLY once (not drop the inheritance, not duplicate it) even though it has no own equipment_type.
    fs.writeFileSync(path.join(orgDir, "inc_org.txt"),
      "INC_helo = {\n\tallowed = { original_tag = ARG }\n\ticon = GFX_idea_x\n\tinclude = generic_specialized_helicopter_organization\n" +
      "\tinitial_trait = { name = INC_helo_initial production_bonus = { production_capacity_factor = 0.05 } }\n}\n");
    const di = await get(`/api/mio/detail?id=INC_helo&modPath=${encodeURIComponent(mod)}`);
    ok("include captured by detail", JSON.stringify(di.include) === '["generic_specialized_helicopter_organization"]', di.include);
    ok("include-based company has empty own eq/tech (inherited)", (di.equipmentType || []).length === 0 && (di.researchCategories || []).length === 0, di);
    const rs = await post("/api/mio", { modPath: mod, id: "INC_helo", allowedTag: "ARG", icon: "GFX_idea_x", include: ["generic_specialized_helicopter_organization"], fileName: "inc_org.txt", initial: { productionBonus: { production_capacity_factor: 0.05 } }, traits: [] });
    ok("re-save ok — include alone satisfies the 'works on' guard", rs.ok === true, rs);
    const incTxt = fs.readFileSync(path.join(orgDir, "inc_org.txt"), "utf8");
    ok("include kept EXACTLY once (not dropped, not duplicated)", (incTxt.match(/include = generic_specialized_helicopter_organization/g) || []).length === 1, incTxt);
    ok("re-save brace-balanced", (incTxt.replace(/"[^"]*"/g, '""').match(/{/g) || []).length === (incTxt.replace(/"[^"]*"/g, '""').match(/}/g) || []).length, incTxt);
    const noWork = await post("/api/mio", { modPath: mod, id: "nova_nowork", allowedTag: "GER", equipmentType: [], researchCategories: [], include: [], traits: [] });
    ok("still rejects a company with NO eq/tech/include", noWork.ok === false, noWork);

    console.log("\n=== detail refuses a non-existent / bad id ===");
    const miss = await get(`/api/mio/detail?id=does_not_exist&modPath=${encodeURIComponent(mod)}`);
    ok("missing id → ok:false (not a crash)", miss.ok === false, miss);
    const bad = await get(`/api/mio/detail?id=9bad&modPath=${encodeURIComponent(mod)}`);
    ok("bad id → ok:false", bad.ok === false, bad);
  } catch (e) {
    ok("threw: " + (e && e.stack ? e.stack : e), false);
  } finally {
    try { fs.rmSync(mod, { recursive: true, force: true }); } catch (_) {}
  }
  console.log(`\nMIO-DETAIL: ${pass} passed, ${fail} failed`);
  process.exitCode = fail ? 1 : 0;
  try { server.closeAllConnections && server.closeAllConnections(); } catch (_) {}
  server.close();
})();
