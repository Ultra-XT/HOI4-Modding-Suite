// #doctrine-folder-no-gridbox — a tech saved into a doctrine folder must get a gridbox.
//
// The four doctrine folders (land/naval/air/special_forces) live in interface/countrydoctrinetreeview.gui,
// not countrytechtreeview.gui. addGridboxesForNewTechs hardcoded the tech view, so a doctrine tech never got
// a gridbox and therefore did not render in game — while the editor happily OFFERS those folders, because
// /api/research/gui-layout lists all four in allFolders.
//
// The save reported `gridboxesAdded: []`, which is indistinguishable from "nothing needed doing": the
// internal skip reason was discarded. A tech that does not render is not something to stay quiet about.
//
// Both directions: a doctrine tech must get its gridbox in the DOCTRINE gui, and an ordinary tech must still
// get its one in the tech gui — the file is now chosen by which one actually declares the folder, so getting
// that backwards would break the common case.
//
// Hermetic: fake mod under tmpdir with both gui files, each declaring its own folders.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-doctrine-"));
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

const MOD = path.join(ROOT, "docmod");
["common/technologies", "interface"].forEach((d) => fs.mkdirSync(path.join(MOD, ...d.split("/")), { recursive: true }));
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="DocMod"\nsupported_version="1.18.*"\n', "utf8");

const guiFor = (folderName, anchor) => [
  "guiTypes = {",
  "\tcontainerWindowType = {",
  `\t\tname = "${folderName}"`,
  "\t\tposition = { x = 0 y = 0 }",
  "\t\tgridboxtype = {",
  `\t\t\tname = "${anchor}_tree"`,
  "\t\t\tposition = { x = 10 y = 20 }",
  "\t\t\tslotsize = { width = 90 height = 90 }",
  '\t\t\tformat = "UP"',
  "\t\t}",
  "\t}",
  "}",
  "",
].join("\n");

const TECH_GUI = path.join(MOD, "interface", "countrytechtreeview.gui");
const DOC_GUI = path.join(MOD, "interface", "countrydoctrinetreeview.gui");
fs.writeFileSync(TECH_GUI, guiFor("infantry_folder", "base_inf"), "utf8");
fs.writeFileSync(DOC_GUI, guiFor("land_doctrine_folder", "base_doc"), "utf8");

const PORT = 42187;
const app = createApp();
const server = app.listen(PORT, async () => {
  const addTech = async (id, folder, categories) => {
    const r = await fetch(`http://127.0.0.1:${PORT}/api/technologies/save-batch`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        modPath: MOD,
        technologies: [{
          id, folder, x: 0, y: 2, researchCost: 2, startYear: 1940,
          prerequisites: [], mutuallyExclusive: [], dependencies: [], subTechnologies: [],
          enableEquipments: [], categories, name: id,
          fileName: "nova_tech.txt", isMod: true, leadsTo: [], pathMeta: {},
        }],
        equipments: {},
        newTechIds: [id],
      }),
    });
    return { status: r.status, body: await r.json().catch(() => null) };
  };

  try {
    console.log("\n[doctrine folder] the gridbox belongs in the DOCTRINE gui");
    const doc = await addTech("nua_doctrine_a", "land_doctrine_folder", ["land_doctrine"]);
    rec("the doctrine tech saved", doc.status === 200 && doc.body && doc.body.ok !== false, doc.body || doc.status);
    rec("…it got a gridbox in countrydoctrinetreeview.gui",
      fs.readFileSync(DOC_GUI, "utf8").includes('"nua_doctrine_a_tree"'), fs.readFileSync(DOC_GUI, "utf8").slice(0, 400));
    rec("…and NOT in countrytechtreeview.gui",
      !fs.readFileSync(TECH_GUI, "utf8").includes('"nua_doctrine_a_tree"'), fs.readFileSync(TECH_GUI, "utf8").slice(0, 400));
    rec("…and the response reports it as added",
      Array.isArray(doc.body && doc.body.gridboxesAdded) &&
      doc.body.gridboxesAdded.some((g) => g.folder === "land_doctrine_folder" && g.added > 0),
      doc.body && doc.body.gridboxesAdded);

    console.log("\n[ordinary folder] still goes to the tech gui");
    const inf = await addTech("nua_inf_a", "infantry_folder", ["infantry_tech"]);
    rec("the infantry tech saved", inf.status === 200 && inf.body && inf.body.ok !== false, inf.body || inf.status);
    rec("…it got a gridbox in countrytechtreeview.gui",
      fs.readFileSync(TECH_GUI, "utf8").includes('"nua_inf_a_tree"'), fs.readFileSync(TECH_GUI, "utf8").slice(0, 400));
    rec("…and NOT in countrydoctrinetreeview.gui",
      !fs.readFileSync(DOC_GUI, "utf8").includes('"nua_inf_a_tree"'), fs.readFileSync(DOC_GUI, "utf8").slice(0, 400));

    console.log("\n[unknown folder] a skip must be reported, not silent");
    const ghost = await addTech("nua_ghost", "no_such_folder", ["infantry_tech"]);
    rec("the save still succeeded", ghost.status === 200 && ghost.body && ghost.body.ok !== false,
      ghost.body || ghost.status);
    const entry = (ghost.body && ghost.body.gridboxesAdded || []).find((g) => g.folder === "no_such_folder");
    rec("…and the response says the gridbox was skipped, with a reason",
      !!(entry && entry.skipped), ghost.body && ghost.body.gridboxesAdded);

    console.log("\n[integrity]");
    for (const [name, p] of [["tech", TECH_GUI], ["doctrine", DOC_GUI]]) {
      const t = fs.readFileSync(p, "utf8");
      rec(`the ${name} gui is still brace-balanced`,
        (t.match(/\{/g) || []).length === (t.match(/\}/g) || []).length,
        { open: (t.match(/\{/g) || []).length, close: (t.match(/\}/g) || []).length });
    }

    console.log(`\n=== doctrine folder gridbox: ${checks} checks, ${fails.length} failed ===`);
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
