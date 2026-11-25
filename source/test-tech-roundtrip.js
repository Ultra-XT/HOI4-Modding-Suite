// Regression guard: a COMPLEX technology must survive parse -> save -> re-parse with no data loss.
// This protects the export-critical serializer/parser pair against future changes (it caught the
// enable_subunits / on_research_complete drop, among others).
const fs = require("fs"), os = require("os"), path = require("path");
const { createApp } = require("./server.js");
const PORT = 3494, BASE = `http://127.0.0.1:${PORT}`;
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) { pass++; console.log("  ✓ " + m); } else { fail++; console.log("  ✗ FAIL " + m + (x !== undefined ? " -> " + JSON.stringify(x) : "")); } };

function setupMod() {
  const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-rt-"));
  fs.mkdirSync(path.join(mod, "common", "technologies"), { recursive: true });
  fs.writeFileSync(path.join(mod, "descriptor.mod"), 'name="Roundtrip Test"\n', "utf8");
  fs.writeFileSync(path.join(mod, "common", "technologies", "custom_technologies.txt"),
    "technologies = {\n" +
    "\ttest_complex = {\n" +
    "\t\tenable_equipments = { test_equip }\n" +
    "\t\txor = { test_other }\n" +
    "\t\tdependencies = { test_dep = 1 }\n" +
    "\t\tsub_technologies = { test_sub }\n" +
    "\t\tresearch_cost = 2.5\n" +
    "\t\tstart_year = 1942\n" +
    "\t\tfolder = { name = infantry_folder position = { x = 3 y = 5 } }\n" +
    "\t\tdoctrine = yes\n" +
    "\t\tshow_equipment_icon = yes\n" +
    "\t\tforce_use_small_tech_layout = yes\n" +
    "\t\tcategories = { cat_alpha cat_beta }\n" +
    "\t\tai_will_do = { factor = 2 }\n" +
    "\t\tmodifier = { army_org_factor = 0.05 }\n" +
    "\t\ton_research_complete = { add_political_power = 25 }\n" +
    "\t\tenable_subunits = { test_subunit }\n" +
    "\t\tallow = { ROOT = { is_special_project_completed = sp:test_project } }\n" +
    "\t}\n" +
    // A HIDDEN tech (allow = { always = no }) — the only allow form serializeTechnology re-creates
    // (from the isHidden flag). Must round-trip AND not be duplicated.
    "\ttest_hidden = {\n" +
    "\t\tresearch_cost = 1\n" +
    "\t\tstart_year = 1936\n" +
    "\t\tfolder = { name = infantry_folder position = { x = 1 y = 1 } }\n" +
    "\t\tallow = { always = no }\n" +
    "\t}\n" +
    // A tech shown in TWO research tabs (two folder blocks). serializeTechnology only re-creates the
    // primary folder, so the second must round-trip via extraScript or it's collapsed away on save.
    "\ttest_multifolder = {\n" +
    "\t\tresearch_cost = 1\n" +
    "\t\tstart_year = 1936\n" +
    "\t\tfolder = { name = infantry_folder position = { x = 2 y = 2 } }\n" +
    "\t\tfolder = { name = support_folder position = { x = 4 y = 6 } }\n" +
    "\t}\n" +
    // A tech with PATH blocks carrying per-path research_cost_coeff + ignore_for_layout. The serializer used
    // to hardcode coeff=1 and drop ignore_for_layout (which prevents the game's "multiple grid boxes" error),
    // silently corrupting the mod on any edit-and-save. These must round-trip via pathMeta. #path-meta
    "\ttest_paths = {\n" +
    "\t\tresearch_cost = 1\n" +
    "\t\tstart_year = 1936\n" +
    "\t\tpath = { leads_to_tech = test_child_a research_cost_coeff = 1.5 }\n" +
    "\t\tpath = { leads_to_tech = test_child_b ignore_for_layout = yes }\n" +
    "\t\tfolder = { name = infantry_folder position = { x = 6 y = 1 } }\n" +
    "\t}\n" +
    "\ttest_child_a = {\n\t\tresearch_cost = 1\n\t\tstart_year = 1938\n\t\tfolder = { name = infantry_folder position = { x = 6 y = 3 } }\n\t}\n" +
    "\ttest_child_b = {\n\t\tresearch_cost = 1\n\t\tstart_year = 1938\n\t\tfolder = { name = infantry_folder position = { x = 8 y = 3 } }\n\t}\n" +
    "}\n", "utf8");
  return mod;
}

(async () => {
  const app = createApp();
  const server = await new Promise((res) => { const s = app.listen(PORT, () => res(s)); });
  const mod = setupMod();
  const getTech = async (id = "test_complex") => {
    const res = await fetch(`${BASE}/api/technologies/catalog?modPath=${encodeURIComponent(mod)}`);
    const j = await res.json();
    return (j.technologies || []).find((t) => t.id === id);
  };
  try {
    const t1 = await getTech();
    const h1 = await getTech("test_hidden");
    const mf1 = await getTech("test_multifolder");
    ok(!!t1, "complex tech parses");
    if (t1) {
      await fetch(`${BASE}/api/technologies/save-batch`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modPath: mod, technologies: [t1, h1, mf1].filter(Boolean), equipments: {} }),
      });
      const t2 = await getTech();
      ok(t1.folder === t2.folder, "folder round-trips", [t1.folder, t2.folder]);
      ok(t1.x === t2.x && t1.y === t2.y, "position round-trips", [t1.x, t1.y, t2.x, t2.y]);
      ok(t1.researchCost === t2.researchCost, "research_cost round-trips", [t1.researchCost, t2.researchCost]);
      ok(t1.startYear === t2.startYear, "start_year round-trips", [t1.startYear, t2.startYear]);
      ok(!!t1.doctrine === !!t2.doctrine, "doctrine round-trips");
      ok(!!t1.showEquipmentIcon === !!t2.showEquipmentIcon, "show_equipment_icon round-trips");
      ok(JSON.stringify(t1.enableEquipments) === JSON.stringify(t2.enableEquipments), "enable_equipments round-trips");
      ok(JSON.stringify(t1.mutuallyExclusive) === JSON.stringify(t2.mutuallyExclusive), "xor/mutually-exclusive round-trips");
      ok(JSON.stringify(t1.dependencies) === JSON.stringify(t2.dependencies), "dependencies round-trips");
      ok(JSON.stringify(t1.subTechnologies) === JSON.stringify(t2.subTechnologies), "sub_technologies round-trips");
      ok(JSON.stringify((t1.categories||[]).sort()) === JSON.stringify((t2.categories||[]).sort()), "categories round-trip");
      ok(/on_research_complete/.test(t2.extraScript||""), "on_research_complete preserved in extraScript");
      ok(/enable_subunits/.test(t2.extraScript||""), "enable_subunits preserved in extraScript");
      // Box size flag: parsed, round-trips, owned by the flag (NOT left in extraScript → no duplicate).
      ok(t1.forceSmallLayout === true, "force_use_small_tech_layout parses to forceSmallLayout");
      ok(!!t1.forceSmallLayout === !!t2.forceSmallLayout, "forceSmallLayout round-trips");
      ok(!/force_use_small_tech_layout/.test(t2.extraScript||""), "force flag NOT duplicated into extraScript");
      const written = fs.readFileSync(path.join(mod, "common", "technologies", "custom_technologies.txt"), "utf8");
      ok((written.match(/force_use_small_tech_layout/g)||[]).length === 1, "force flag written exactly once", (written.match(/force_use_small_tech_layout/g)||[]).length);
      // A REAL allow gate (not always=no) is NOT re-serialized, so it must survive via extraScript —
      // otherwise re-saving a touched tech silently strips its research gate. (254 MD techs use this.)
      ok(/is_special_project_completed/.test(t2.extraScript||""), "real allow gate preserved in extraScript", t2.extraScript);
      ok((written.match(/is_special_project_completed/g)||[]).length === 1, "allow gate written exactly once (not dropped/doubled)", (written.match(/is_special_project_completed/g)||[]).length);
      // The HIDDEN form (allow = { always = no }) round-trips via the isHidden flag — exactly once, no dup.
      const h2 = await getTech("test_hidden");
      ok(h1 && h1.isHidden === true, "allow={always=no} parses to isHidden");
      ok(h2 && h2.isHidden === true, "isHidden round-trips");
      ok((written.match(/always\s*=\s*no/g)||[]).length === 1, "always=no written exactly once (no duplicate)", (written.match(/always\s*=\s*no/g)||[]).length);
      // A tech with TWO folder blocks: primary round-trips via the model, the second via extraScript.
      const mf2 = await getTech("test_multifolder");
      ok(mf1 && mf1.folder === "infantry_folder" && mf1.x === 2 && mf1.y === 2, "multi-folder primary parses");
      ok(mf2 && mf2.folder === "infantry_folder" && mf2.x === 2 && mf2.y === 2, "multi-folder primary round-trips");
      ok(/support_folder/.test(mf2 && mf2.extraScript || ""), "2nd folder block preserved in extraScript", mf2 && mf2.extraScript);
      ok((written.match(/support_folder/g)||[]).length === 1, "2nd folder written exactly once (not dropped/doubled)", (written.match(/support_folder/g)||[]).length);
      // Count line-anchored `folder = {` only (a tech id like test_multiFOLDER also contains "folder = {").
      ok((written.match(/\n[ \t]*folder\s*=\s*\{/g)||[]).length === 7, "exactly 7 folder blocks total (complex+hidden+2×multifolder+paths+2 children — none lost)", (written.match(/\n[ \t]*folder\s*=\s*\{/g)||[]).length);
      // PATH META round-trip: edit the paths parent (cost bump), save, re-parse — the per-path coeff +
      // ignore_for_layout must survive (they used to be hardcoded to 1 / dropped). #path-meta
      const paths1 = await getTech("test_paths");
      ok(paths1 && paths1.pathMeta && paths1.pathMeta.test_child_a && paths1.pathMeta.test_child_a.coeff === 1.5, "path research_cost_coeff=1.5 parses into pathMeta", paths1 && paths1.pathMeta);
      ok(paths1 && paths1.pathMeta && paths1.pathMeta.test_child_b && paths1.pathMeta.test_child_b.ignoreForLayout === true, "path ignore_for_layout parses into pathMeta");
      const edited = { ...paths1, researchCost: 3 };
      await fetch(`${BASE}/api/technologies/save-batch`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modPath: mod, technologies: [edited], equipments: {} }),
      });
      const w2 = fs.readFileSync(path.join(mod, "common", "technologies", "custom_technologies.txt"), "utf8");
      ok(/leads_to_tech = test_child_a\s*\n\s*research_cost_coeff = 1\.5/.test(w2), "research_cost_coeff=1.5 SURVIVES edit+save (was reset to 1)");
      ok(/leads_to_tech = test_child_b[\s\S]*?ignore_for_layout = yes/.test(w2), "ignore_for_layout=yes SURVIVES edit+save (was dropped)");
      ok(/research_cost = 3/.test(w2), "the actual edit (cost 3) still landed");
    }
  } catch (e) { ok(false, "threw: " + e.message); }
  finally {
    try { fs.rmSync(mod, { recursive: true, force: true }); } catch (_) {}
    server.close();
  }
  console.log(`\n  ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
