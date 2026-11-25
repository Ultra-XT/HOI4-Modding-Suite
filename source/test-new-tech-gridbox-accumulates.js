// #new-tech-gridbox-wipe — adding a tech must not delete the gridboxes of techs added before it.
//
// A tech with no gridbox does not render in the research tree at all. Nova adds one per new tech inside a
// NOVA_NEW_TECH_GRIDBOXES marker block, and rewrites that block wholesale on every save. Two things combined
// to make each save destroy the last one's work:
//
//   - baseGridboxNamesInFolder stripped only the NOVA_GRIDBOXES marker, so gridboxes inside the NEW_TECH
//     block counted as "already present" and their techs were filtered out of the rewrite;
//   - the rewrite then emitted only the ids from THIS request, because the client clears its
//     newly-created-ids list after each save.
//
// So save #2 silently removed save #1's gridbox, and the response reported only "added" — never the removal.
// Over one session this destroyed four techs' gridboxes in the demo mod.
//
// The block is now carried across verbatim rather than regenerated. Verbatim matters: its own header tells the
// modder it is "safe to edit or move", and a regenerated entry takes its position from the folder's first
// gridbox, which would silently undo any gridbox they had repositioned.
//
// Hermetic: fake mod under tmpdir, with a hand-built .gui carrying one base gridbox to anchor on.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-gridbox-"));
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

const MOD = path.join(ROOT, "gridmod");
["common/technologies", "interface"].forEach((d) => fs.mkdirSync(path.join(MOD, ...d.split("/")), { recursive: true }));
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="GridMod"\nsupported_version="1.18.*"\n', "utf8");

// A minimal countrytechtreeview.gui with one BASE gridbox for the folder, to anchor geometry on.
const GUI = path.join(MOD, "interface", "countrytechtreeview.gui");
fs.writeFileSync(GUI, [
  "guiTypes = {",
  "\tcontainerWindowType = {",
  '\t\tname = "electronics_folder"',
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

const PORT = 42177;
const app = createApp();
const server = app.listen(PORT, async () => {
  const addTech = async (id) => {
    const r = await fetch(`http://127.0.0.1:${PORT}/api/technologies/save-batch`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        modPath: MOD,
        technologies: [{
          id, folder: "electronics_folder", x: 0, y: 2, researchCost: 2, startYear: 1940,
          prerequisites: [], mutuallyExclusive: [], dependencies: [], subTechnologies: [],
          enableEquipments: [], categories: ["electronics"], name: id,
          fileName: "nova_tech.txt", isMod: true, leadsTo: [], pathMeta: {},
        }],
        equipments: {},
        // Exactly what the client sends: only the newest id, because research.js clears the list each save.
        newTechIds: [id],
      }),
    });
    return { status: r.status, body: await r.json().catch(() => null) };
  };
  const gui = () => fs.readFileSync(GUI, "utf8");
  const hasBox = (id) => gui().includes(`"${id}_tree"`);

  try {
    console.log("\n[accumulation] each save must keep the gridboxes already there");
    const ids = ["nua_grid_a", "nua_grid_b", "nua_grid_c"];
    for (const id of ids) {
      const r = await addTech(id);
      rec(`${id} saved`, r.status === 200 && r.body && r.body.ok !== false, r.body || r.status);
      rec(`…${id} got a gridbox`, hasBox(id), gui().slice(0, 300));
    }

    rec("the FIRST tech still has its gridbox after two more saves", hasBox("nua_grid_a"),
      "adding a later tech deleted it — those techs stop rendering in the research tree");
    rec("…and so does the second", hasBox("nua_grid_b"), gui());
    rec("the base gridbox was never touched", hasBox("base_anchor"), gui());
    rec("the file is still brace-balanced",
      (gui().match(/\{/g) || []).length === (gui().match(/\}/g) || []).length,
      { open: (gui().match(/\{/g) || []).length, close: (gui().match(/\}/g) || []).length });
    rec("exactly one Nova marker block exists",
      (gui().match(/# >>> NOVA_NEW_TECH_GRIDBOXES/g) || []).length === 1,
      (gui().match(/# >>> NOVA_NEW_TECH_GRIDBOXES/g) || []).length);

    // A gridbox the modder repositioned must survive the next save — the block says it is safe to move.
    console.log("\n[user edits] a repositioned gridbox is not regenerated away");
    const moved = gui().replace(
      /(name = "nua_grid_a_tree"\s*\n\s*position = \{ x = )\d+( y = )\d+/,
      "$1999$2888"
    );
    fs.writeFileSync(GUI, moved, "utf8");
    rec("the reposition was applied to the fixture", /x = 999 y = 888/.test(gui()), gui().slice(0, 400));

    const after = await addTech("nua_grid_d");
    rec("the next tech saved", after.status === 200 && after.body && after.body.ok !== false, after.body || after.status);
    rec("…and the moved gridbox kept the modder's position", /x = 999 y = 888/.test(gui()), gui());
    rec("…while the new tech was still added", hasBox("nua_grid_d"), gui());

    console.log(`\n=== new-tech gridbox accumulation: ${checks} checks, ${fails.length} failed ===`);
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
