// #single-tech-save-incomplete / #single-tech-save-drops-mod-parent
//
// POST /api/technologies/save did only the .txt write, while its sibling save-batch also persists the icon
// choice and adds a gridbox. Without those:
//   - the tech loses its icon on reload. The technology script has no icon field at all, so the sidecar IS
//     the storage; a tech saved here read back with no iconKey while batch-saved techs kept theirs.
//   - the tech has no gridbox, so it does not render in the research tree — the "saves fine and then
//     vanishes" case the gridbox work exists for.
//
// Separately, a prerequisite naming a MOD-owned parent was accepted, reported as saved, and written nowhere.
// That link is stored on the PARENT as `path = { leads_to_tech = <child> }` — serializeTechnology only emits
// `dependencies` for non-mod parents — and this endpoint wrote only the child. save-batch gets away with it
// because the client adds prerequisite-parents to the batch itself. A vanilla parent worked, which is what
// made it look like prerequisites were fine.
//
// Hermetic: fake mod under tmpdir with its own gui to anchor gridboxes on.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-single-tech-"));
process.env.HOI4_MODS_ROOT = ROOT;
const { createApp } = require("./server.js");

const fails = [];
let checks = 0;
function rec(label, ok, detail) {
  checks++;
  if (ok) console.log("  ok   " + label);
  else {
    fails.push(label);
    console.log("  FAIL " + label + "  -> " + String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 300));
  }
}

const MOD = path.join(ROOT, "techmod");
["common/technologies", "interface"].forEach((d) => fs.mkdirSync(path.join(MOD, ...d.split("/")), { recursive: true }));
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="TechMod"\nsupported_version="1.18.*"\n', "utf8");

const GUI = path.join(MOD, "interface", "countrytechtreeview.gui");
fs.writeFileSync(GUI, [
  "guiTypes = {",
  "\tcontainerWindowType = {",
  '\t\tname = "infantry_folder"',
  "\t\tposition = { x = 0 y = 0 }",
  "\t\tgridboxtype = {",
  '\t\t\tname = "base_anchor_tree"',
  "\t\t\tposition = { x = 10 y = 20 }",
  "\t\t\tslotsize = { width = 90 height = 90 }",
  '\t\t\tformat = "LEFT"',
  "\t\t}",
  "\t}",
  "}",
  "",
].join("\n"), "utf8");

// A mod-owned PARENT for the prerequisite case.
fs.writeFileSync(path.join(MOD, "common", "technologies", "nova_tech.txt"),
  "technologies = {\n\tnua_parent = {\n\t\tresearch_cost = 1\n\t\tstart_year = 1936\n\t\tfolder = {\n\t\t\tname = infantry_folder\n\t\t\tposition = { x = 0 y = 0 }\n\t\t}\n\t\tcategories = { infantry_tech }\n\t}\n}\n", "utf8");

const techBody = (over) => ({
  id: "nua_child", folder: "infantry_folder", x: 2, y: 4, researchCost: 1, startYear: 1940,
  prerequisites: [], mutuallyExclusive: [], dependencies: [], subTechnologies: [],
  enableEquipments: [], categories: ["infantry_tech"], name: "Nova Child",
  fileName: "nova_tech.txt", isMod: true, leadsTo: [], pathMeta: {}, ...over,
});

const PORT = 42203;
const app = createApp();
const server = app.listen(PORT, async () => {
  const save = async (tech) => {
    const r = await fetch(`http://127.0.0.1:${PORT}/api/technologies/save`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ modPath: MOD, tech }),
    });
    return { status: r.status, body: await r.json().catch(() => null) };
  };
  const catalog = async () => {
    const r = await fetch(`http://127.0.0.1:${PORT}/api/technologies/catalog?includeVanilla=0&includeActiveMod=1&sourcePath=${encodeURIComponent(MOD)}&modPath=${encodeURIComponent(MOD)}`);
    const b = await r.json().catch(() => null);
    return (b && b.technologies) || [];
  };
  const techText = () => fs.readFileSync(path.join(MOD, "common", "technologies", "nova_tech.txt"), "utf8");

  try {
    console.log("\n[icon + gridbox] a single save must do what a batch save does");
    const r = await save(techBody({ iconKey: "GFX_infantry_weapons_medium" }));
    rec("the save succeeded", r.status === 200 && r.body && r.body.ok !== false, r.body || r.status);

    const sidecar = path.join(MOD, "editor_tech_icons.json");
    let iconMap = {};
    try { iconMap = JSON.parse(fs.readFileSync(sidecar, "utf8")); } catch (_) { iconMap = {}; }
    rec("the icon choice was persisted to the sidecar", iconMap.nua_child === "GFX_infantry_weapons_medium", iconMap);

    const cat = await catalog();
    const child = cat.find((t) => t.id === "nua_child");
    rec("the tech reads back from the catalog", !!child, cat.map((t) => t.id));
    rec("…carrying its iconKey", child && child.iconKey === "GFX_infantry_weapons_medium", child && child.iconKey);
    rec("a gridbox was added so it renders", fs.readFileSync(GUI, "utf8").includes('"nua_child_tree"'),
      fs.readFileSync(GUI, "utf8").slice(0, 300));

    console.log("\n[mod parent] a prerequisite on a mod-owned tech must be written");
    const r2 = await save(techBody({ prerequisites: [{ type: "AND", tech: "nua_parent" }] }));
    rec("the save succeeded", r2.status === 200 && r2.body && r2.body.ok !== false, r2.body || r2.status);
    rec("the PARENT gained a path to the child", /leads_to_tech\s*=\s*nua_child/.test(techText()),
      techText().slice(0, 500));

    const cat2 = await catalog();
    const child2 = cat2.find((t) => t.id === "nua_child");
    const parent2 = cat2.find((t) => t.id === "nua_parent");
    rec("the child reads back with its prerequisite",
      child2 && (child2.prerequisites || []).some((p) => p && p.tech === "nua_parent"),
      child2 && child2.prerequisites);
    rec("…and the parent leads to it", parent2 && (parent2.leadsTo || []).includes("nua_child"),
      parent2 && parent2.leadsTo);

    console.log("\n[integrity]");
    rec("the technologies file is brace-balanced",
      (techText().match(/\{/g) || []).length === (techText().match(/\}/g) || []).length,
      { open: (techText().match(/\{/g) || []).length, close: (techText().match(/\}/g) || []).length });
    rec("the gui is brace-balanced",
      (fs.readFileSync(GUI, "utf8").match(/\{/g) || []).length === (fs.readFileSync(GUI, "utf8").match(/\}/g) || []).length,
      "unbalanced");

    console.log(`\n=== single tech save completeness: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) {
      fails.forEach((f) => console.log("   FAILED: " + f));
      process.exitCode = 1;
    }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 6).join("\n") : e);
    process.exitCode = 1;
  } finally {
    try { server.closeAllConnections(); } catch (_) {}
    server.close();
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
  }
});
server.on("error", (e) => {
  console.error("listen error:", e.message);
  process.exitCode = 1;
});
