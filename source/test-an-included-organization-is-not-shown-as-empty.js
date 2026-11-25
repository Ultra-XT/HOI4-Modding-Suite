// ⛔ #mio-include-shown-as-empty — THE EDITOR SHOWED AN EMPTY COMPANY WHILE THE GAME DRAWS A FULL TREE.
//
// `include = <template>` inherits another organization's whole trait tree, its equipment types and its
// research categories. /api/mio/detail parsed ONLY the organization's own block, so a company that inherits
// everything opened completely empty. Counted over the 2,418 organization blocks in the install and every
// installed mod:
//
//     shown with an EMPTY trait tree while inheriting one   2,116   (483 vanilla)
//     traits hidden from the editor                        32,104   (6,727 vanilla)
//     shown with no equipment_type while inheriting one      2,066   (475 vanilla)
//
// Vanilla's SLO_zbrojnica_roth_organization includes generic_infantry_equipment_organization, which has 14
// traits, and the editor showed none of them.
//
// ⭐ This is the overlay principle, which the user reached themselves after PLAYING a mod they built:
// "when we make a new mod we dont make a really new mod … its dependent on the vanilla game". Ask of every
// maker whether it shows what the GAME will show or only what the mod owns. The research tree answered
// 0 of 552 for the base game for the same reason.
//
// ⭐ The include resolution ALREADY EXISTED, in scanAllMioCompanies, which the equipment picker uses to
// answer "who designs this". The editor's own reader never called it.
//
// ⚠️ THE FIX HAS A TRAP, AND SECTION 3 IS IT. The save rebuilds an organization from the `traits` array, so
// an inherited trait that reached that array would be WRITTEN INTO THE MOD'S OWN BLOCK — turning inheritance
// into 32,104 copied traits on the next save. They are returned in a separate `inherited` field that
// collect() never reads.
//
// ⛔ SCRATCH MODS IN TEMP ONLY.
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

const PORT = 53561;
const SANDBOX = fs.mkdtempSync(path.join(os.tmpdir(), "nova-mioinh-"));
process.env.APPDATA = SANDBOX;
process.env.XDG_CONFIG_HOME = SANDBOX;
process.env.NOVA_APP_DATA_DIR = SANDBOX;

const { createApp } = require("./server.js");
const BASE = `http://127.0.0.1:${PORT}`;
const SUB = path.join("common", "military_industrial_organization", "organizations");
const GAME = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (detail == null ? "" : "   " + (typeof detail === "string" ? detail : JSON.stringify(detail))));
  if (!ok) fails.push(label);
};
const show = (t) => String(t).slice(0, 300).replace(/\n/g, "|");

const made = [];
(async () => {
  let server;
  try {
    server = await new Promise((r) => { const s = createApp().listen(PORT, () => r(s)); });

    // A template with a tree, and a company that inherits all of it — vanilla's own shape.
    const TEMPLATE = `probe_template_organization = {
\ticon = GFX_idea_generic_tank_manufacturer_2
\tequipment_type = { infantry_equipment }
\tresearch_categories = { mio_cat_tech_infantry_weapons }
\tallowed = { always = no }
\tinitial_trait = {
\t\tname = probe_template_initial
\t\tequipment_bonus = {
\t\t\tsoft_attack = 0.03
\t\t}
\t}
\ttrait = {
\t\ttoken = probe_tpl_one
\t\tname = probe_tpl_one
\t\tposition = { x=0 y=0 }
\t\tequipment_bonus = {
\t\t\tbreakthrough = 0.05
\t\t}
\t}
\ttrait = {
\t\ttoken = probe_tpl_two
\t\tname = probe_tpl_two
\t\tposition = { x=1 y=0 }
\t\tequipment_bonus = {
\t\t\treliability = 0.05
\t\t}
\t}
}

probe_heir_organization = {
\ticon = GFX_idea_generic_tank_manufacturer_1
\tinclude = probe_template_organization
\tallowed = { original_tag = GER }
}
`;

    const mkMod = (text) => {
      const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-mioinh-mod-"));
      made.push(mod);
      fs.mkdirSync(path.join(mod, SUB), { recursive: true });
      fs.writeFileSync(path.join(mod, "descriptor.mod"), 'name="MIO Inherit"\nsupported_version="1.16.*"\n');
      fs.writeFileSync(path.join(mod, SUB, "probe.txt"), text, "utf8");
      return mod;
    };
    const detailOf = (mod, id) =>
      fetch(`${BASE}/api/mio/detail?id=${encodeURIComponent(id)}&modPath=${encodeURIComponent(mod)}`).then((r) => r.json());

    console.log("1. A company that inherits its tree is shown the tree it inherits");
    {
      const mod = mkMod(TEMPLATE);
      const d = await detailOf(mod, "probe_heir_organization");
      rec("the company loads", d && d.ok !== false, d && d.error);
      rec("CONTROL: it really declares nothing of its own",
        (d.traits || []).length === 0 && (d.equipmentType || []).length === 0, JSON.stringify({ t: (d.traits || []).length, e: (d.equipmentType || []).length }));
      rec("⭐ its inherited traits are reported", ((d.inherited || {}).traits || []).length === 3,
        JSON.stringify(((d.inherited || {}).traits || []).map((t) => t.token)));
      rec("⭐ …including the template's starting trait, marked as such",
        ((d.inherited || {}).traits || []).some((t) => t.isInitial), JSON.stringify((d.inherited || {}).traits));
      rec("⭐ …and the equipment it can design", ((d.inherited || {}).equipmentType || []).includes("infantry_equipment"),
        JSON.stringify((d.inherited || {}).equipmentType));
      rec("⭐ …and the research categories", ((d.inherited || {}).researchCategories || []).includes("mio_cat_tech_infantry_weapons"),
        JSON.stringify((d.inherited || {}).researchCategories));
      rec("…and where they come from is named", ((d.inherited || {}).from || []).includes("probe_template_organization"),
        JSON.stringify((d.inherited || {}).from));
      rec("…and the bonuses come with them",
        ((d.inherited || {}).traits || []).some((t) => t.equipmentBonus && t.equipmentBonus.breakthrough === 0.05),
        JSON.stringify(((d.inherited || {}).traits || []).map((t) => t.equipmentBonus)));
    }

    console.log("\n2. …and a trait the company declares ITSELF is not listed as inherited");
    {
      // The organization's own declaration overrides the template's, so it belongs in the editable list, once.
      const OVERRIDE = TEMPLATE.replace(
        "\tallowed = { original_tag = GER }\n}\n",
        "\tallowed = { original_tag = GER }\n\ttrait = {\n\t\ttoken = probe_tpl_one\n\t\tname = probe_tpl_one\n\t\tposition = { x=0 y=0 }\n\t\tequipment_bonus = {\n\t\t\tbreakthrough = 0.5\n\t\t}\n\t}\n}\n");
      const mod = mkMod(OVERRIDE);
      const d = await detailOf(mod, "probe_heir_organization");
      rec("the company loads", d && d.ok !== false, d && d.error);
      rec("CONTROL: it now declares one trait of its own",
        (d.traits || []).length === 1 && d.traits[0].token === "probe_tpl_one", JSON.stringify((d.traits || []).map((t) => t.token)));
      rec("⭐ the overridden trait is NOT also listed as inherited",
        !((d.inherited || {}).traits || []).some((t) => t.token === "probe_tpl_one"),
        JSON.stringify(((d.inherited || {}).traits || []).map((t) => t.token)));
      rec("…and the ones it does not override still are",
        ((d.inherited || {}).traits || []).some((t) => t.token === "probe_tpl_two"),
        JSON.stringify(((d.inherited || {}).traits || []).map((t) => t.token)));
    }

    console.log("\n3. ⭐ …and a save does NOT copy the inherited tree into the mod's own block");
    {
      // ⚠️ THE LOAD-BEARING CONTROL. Showing inherited traits is only safe if they cannot be written back.
      // The save rebuilds from `traits`, and `inherited` is a separate field the client's collect() never
      // reads — so a no-edit save must leave the heir exactly as short as it was.
      const mod = mkMod(TEMPLATE);
      const before = fs.readFileSync(path.join(mod, SUB, "probe.txt"), "utf8");
      const d = await detailOf(mod, "probe_heir_organization");
      const res = await fetch(`${BASE}/api/mio`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          modPath: mod, id: "probe_heir_organization", name: (d.name || "").trim(), desc: "",
          allowedTag: (d.allowedTag || "").trim(), icon: (d.icon || "").trim(), fileName: "probe.txt",
          equipmentType: (d.equipmentType || []).slice(), researchCategories: (d.researchCategories || []).slice(),
          include: (d.include || []).slice(),
          initial: { equipmentBonus: (d.initial && d.initial.equipmentBonus) || {}, productionBonus: (d.initial && d.initial.productionBonus) || {} },
          traits: (d.traits || []).map((t) => ({ token: t.token, name: t.name, x: t.x, y: t.y, relativeTo: t.relativeTo, icon: t.icon, parents: t.parents, equipmentBonus: t.equipmentBonus, productionBonus: t.productionBonus })),
          writeIdeaFallback: false, previousId: "probe_heir_organization",
        }),
      }).then((r) => r.json());
      rec("the save was accepted", res && res.ok === true, res && res.error);
      const after = fs.readFileSync(path.join(mod, SUB, "probe.txt"), "utf8");
      const heir = /probe_heir_organization = \{[\s\S]*?\n\}/.exec(after);
      rec("⭐ the heir did NOT gain the template's traits",
        !!heir && !/probe_tpl_one/.test(heir[0]) && !/probe_tpl_two/.test(heir[0]), heir ? show(heir[0]) : "block not found");
      rec("⭐ …nor the template's starting trait", !!heir && !/probe_template_initial/.test(heir[0]), heir ? show(heir[0]) : "");
      rec("…and it still includes the template", !!heir && /include = probe_template_organization/.test(heir[0]), heir ? show(heir[0]) : "");
      rec("…and the template itself is untouched",
        (after.match(/token = probe_tpl_one/g) || []).length === (before.match(/token = probe_tpl_one/g) || []).length,
        `${(before.match(/token = probe_tpl_one/g) || []).length} -> ${(after.match(/token = probe_tpl_one/g) || []).length}`);
    }

    console.log("\n4. Measured on the vanilla company that started this");
    const REAL = path.join(GAME, SUB, "SLO_organization.txt");
    if (!fs.existsSync(REAL)) {
      rec("vanilla's SLO_organization.txt is installed", false, "cannot verify against the corpus");
    } else {
      const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-mioinh-real-"));
      made.push(mod);
      fs.mkdirSync(path.join(mod, SUB), { recursive: true });
      fs.writeFileSync(path.join(mod, "descriptor.mod"), 'name="MIO Inherit"\nsupported_version="1.16.*"\n');
      fs.copyFileSync(REAL, path.join(mod, SUB, "SLO_organization.txt"));
      const d = await detailOf(mod, "SLO_zbrojnica_roth_organization");
      rec("the vanilla company loads", d && d.ok !== false, d && d.error);
      rec("CONTROL: it declares no traits of its own", (d.traits || []).length === 0, JSON.stringify((d.traits || []).length));
      // ⚠️ The template lives in the GAME root, not in this scratch mod — which is the whole point: the
      // editor has to look past the mod to answer what the game will show.
      rec("⭐ it inherits a real tree from the base game",
        ((d.inherited || {}).traits || []).length >= 10, `${((d.inherited || {}).traits || []).length} inherited traits`);
      rec("⭐ …and the equipment it can design", ((d.inherited || {}).equipmentType || []).length > 0,
        JSON.stringify((d.inherited || {}).equipmentType));
      rec("…named as coming from the template it includes",
        ((d.inherited || {}).from || []).includes("generic_infantry_equipment_organization"), JSON.stringify((d.inherited || {}).from));
    }

    console.log(`\n=== an included organization is not shown as empty: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
    process.exitCode = 1;
  } finally {
    if (server) { try { server.closeAllConnections && server.closeAllConnections(); } catch (_) {} await new Promise((r) => server.close(r)); }
    try { fs.rmSync(SANDBOX, { recursive: true, force: true }); } catch (_) {}
    for (const p of made) { try { fs.rmSync(p, { recursive: true, force: true }); } catch (_) {} }
  }
})();
